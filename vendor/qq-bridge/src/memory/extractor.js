/**
 * Memory V3 阶段 2：消息增量入库 + 自动提取（观察模式）
 *
 * 设计约束（对应需求）：
 * - 入库只写自己的 messages / extract_cursors，不碰 unread / readThrough / wakeConfig。
 * - 游标独立：每个会话一条 extract_cursors，和未读水位完全无关。
 * - 幂等：messages 用 (conv_key, msg_key) 唯一；批次用 batch_key 唯一；候选用 dedupe_key 唯一。
 * - 失败不阻塞：全部由调用方 try/catch 包住；重试有次数上限与指数退避；队列有长度上限。
 * - 观察模式：候选写 memory_candidates，不覆盖正式 facts；apply 模式才走 addFact（共用冲突逻辑）。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { addFact, addEvent, resolveQqByName } from './db.js';
import { ensureLifecycleSchema } from './lifecycle.js';
import { classifyCandidate, recordOpsEvent } from './quality.js';
import { tokenize } from './tokenize.js';

const APPLY_SCHEMA = `
CREATE TABLE IF NOT EXISTS extract_cursors (
  conv_key TEXT PRIMARY KEY,
  last_msg_key TEXT,
  last_seq INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS memory_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('fact','event')),
  subject_qq TEXT,
  subject_name TEXT,
  attr TEXT,
  value TEXT,
  summary TEXT,
  detail TEXT,
  participants TEXT,
  confidence REAL,
  scope TEXT,
  visibility TEXT CHECK(visibility IN ('private','group','global')),
  kind_of_fact TEXT CHECK(kind_of_fact IN ('single','multi','temporal','')),
  happened_at INTEGER,
  time_precision TEXT NOT NULL DEFAULT 'unknown',
  dedupe_key TEXT UNIQUE,
  batch_key TEXT,
  conv_key TEXT,
  source_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','rejected')),
  reason TEXT,
  quality TEXT,
  category TEXT,
  evidence_count INTEGER,
  self_stated INTEGER,
  expires_at INTEGER,
  applied_at INTEGER,
  applied_ref_type TEXT,
  applied_ref_id INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cand_status ON memory_candidates(status, created_at);

CREATE TABLE IF NOT EXISTS extract_dead_letters (
  batch_key TEXT PRIMARY KEY,
  conv_key TEXT,
  message_ids TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS extract_stats (
  day TEXT PRIMARY KEY,
  batches INTEGER NOT NULL DEFAULT 0,
  messages INTEGER NOT NULL DEFAULT 0,
  facts INTEGER NOT NULL DEFAULT 0,
  events INTEGER NOT NULL DEFAULT 0,
  invalid INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER
);
`;

export function ensureExtractSchema(db) {
  db.exec(APPLY_SCHEMA);
  ensureLifecycleSchema(db);
  // messages 表补 msg_key / is_owner（阶段 1 建的表没有这些列）
  const cols = db.prepare("PRAGMA table_info(messages)").all().map((c) => c.name);
  if (!cols.includes('msg_key')) db.exec('ALTER TABLE messages ADD COLUMN msg_key TEXT');
  if (!cols.includes('batch_key')) db.exec('ALTER TABLE messages ADD COLUMN batch_key TEXT');
  if (!cols.includes('is_owner')) db.exec('ALTER TABLE messages ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0');
  const eventCols = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name);
  if (!eventCols.includes('time_precision')) db.exec("ALTER TABLE events ADD COLUMN time_precision TEXT NOT NULL DEFAULT 'unknown'");
  // 旧事件没有时间精度：有 happened_at 的视为 day，没有的保持 unknown。
  db.exec("UPDATE events SET time_precision='day' WHERE (time_precision IS NULL OR time_precision='unknown') AND happened_at IS NOT NULL");
  const candCols = db.prepare('PRAGMA table_info(memory_candidates)').all().map((c) => c.name);
  for (const [name, type] of [
    ['quality', 'TEXT'], ['category', 'TEXT'], ['evidence_count', 'INTEGER'], ['self_stated', 'INTEGER'],
    ['expires_at', 'INTEGER'], ['happened_at', 'INTEGER'], ['time_precision', 'TEXT'],
    ['applied_at', 'INTEGER'], ['applied_ref_type', 'TEXT'], ['applied_ref_id', 'INTEGER']
  ]) {
    if (!candCols.includes(name)) db.exec(`ALTER TABLE memory_candidates ADD COLUMN ${name} ${type}`);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_msgkey ON messages(conv_key, msg_key)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_pending2 ON messages(extracted, id)');
}

export function msgKeyOf(msg) {
  if (msg.messageId != null && String(msg.messageId).trim() !== '') return `mid:${msg.messageId}`;
  if (msg.seq != null) return `seq:${msg.seq}`;
  return `h:${crypto.createHash('sha1').update(`${msg.convKey}|${msg.senderQq}|${msg.text}|${msg.sentAt}`).digest('hex').slice(0, 16)}`;
}

/** 消息入库：只写 messages + 游标，不碰任何 reserved2 状态 */
export function ingestMessage(db, msg) {
  ensureExtractSchema(db);
  const key = msgKeyOf(msg);
  const info = db.prepare(`INSERT OR IGNORE INTO messages
    (conv_key, msg_key, seq, sender_qq, sender_name, text, media_note, sent_at, is_self, is_owner, extracted)
    VALUES(?,?,?,?,?,?,?,?,?,?,0)`)
    .run(String(msg.convKey), key, msg.seq ?? null, msg.senderQq != null ? String(msg.senderQq) : null,
      msg.senderName || null, clip(msg.text, 2000), clip(msg.mediaNote, 200),
      Number(msg.sentAt) || Date.now(), msg.isSelf ? 1 : 0, msg.isOwner ? 1 : 0);
  const inserted = Number(info.changes) > 0;
  if (inserted) {
    db.prepare(`INSERT INTO extract_cursors(conv_key, last_msg_key, last_seq, updated_at)
      VALUES(?,?,?,?)
      ON CONFLICT(conv_key) DO UPDATE SET last_msg_key=excluded.last_msg_key,
        last_seq=MAX(COALESCE(extract_cursors.last_seq,0), COALESCE(excluded.last_seq,0)), updated_at=excluded.updated_at`)
      .run(String(msg.convKey), key, msg.seq ?? null, Date.now());
  }
  return { inserted, msgKey: key };
}

export function pendingStats(db) {
  ensureExtractSchema(db);
  const row = db.prepare(`SELECT COUNT(*) AS pending, MIN(sent_at) AS oldest FROM messages WHERE extracted=0`).get();
  return { pending: Number(row?.pending || 0), oldest: Number(row?.oldest || 0) };
}

/** 取一批未抽取消息（按会话分组，优先最老），并附带同会话前文作上下文。 */
export function selectBatch(db, { batchSize = 30, maxQueue = 200, contextSize = 12 } = {}) {
  ensureExtractSchema(db);
  const pending = pendingStats(db);
  if (!pending.pending) return null;
  // Large backlogs are drained in batches; do not reject the whole queue.
  const rows = db.prepare(`SELECT * FROM messages WHERE extracted=0 ORDER BY id ASC LIMIT ?`).all(batchSize);
  if (!rows.length) return null;
  const convKey = rows[0].conv_key;
  const sameConv = rows.filter((r) => r.conv_key === convKey);
  const keys = sameConv.map((r) => r.msg_key);
  const batchKey = crypto.createHash('sha1').update(`${convKey}|${keys[0]}|${keys[keys.length - 1]}|${keys.length}`).digest('hex').slice(0, 20);
  const contextRows = db.prepare(`SELECT * FROM messages WHERE conv_key=? AND id < ? ORDER BY id DESC LIMIT ?`)
    .all(convKey, sameConv[0].id, Math.max(0, Number(contextSize) || 0)).reverse();
  return { convKey, batchKey, rows: sameConv, contextRows, ids: sameConv.map((r) => r.id) };
}

/** Reset dead-letter batches so a later operator/console action can retry them. */
export function retryDeadLetters(db, { batchKey = null } = {}) {
  ensureExtractSchema(db);
  const rows = batchKey
    ? db.prepare('SELECT * FROM extract_dead_letters WHERE batch_key=?').all(String(batchKey))
    : db.prepare('SELECT * FROM extract_dead_letters').all();
  let retried = 0;
  db.exec('BEGIN');
  try {
    for (const row of rows) {
      const ids = JSON.parse(row.message_ids || '[]').map(Number).filter(Number.isFinite);
      if (ids.length) db.prepare(`UPDATE messages SET extracted=0 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
      db.prepare('DELETE FROM extract_dead_letters WHERE batch_key=?').run(row.batch_key);
      retried += 1;
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  }
  return { retried };
}

/** JSON Schema 校验（手写，不引入依赖）：只收白名单字段 + 长度/类型约束 */
export function validateExtraction(raw, { convKey, participants = [], defaultHappenedAt = null } = {}) {
  const errors = [];
  const facts = [];
  const events = [];
  const isPrivate = String(convKey || '').startsWith('private:');
  const defaultVisibility = isPrivate ? 'private' : 'group';
  const allowedVis = new Set(['private', 'group', 'global']);
  const allowedKind = new Set(['single', 'multi', 'temporal']);

  const obj = raw && typeof raw === 'object' ? raw : {};
  const factList = Array.isArray(obj.facts) ? obj.facts.slice(0, 20) : [];
  const eventList = Array.isArray(obj.events) ? obj.events.slice(0, 10) : [];
  if (!Array.isArray(obj.facts) && !Array.isArray(obj.events)) errors.push('no facts/events arrays');

  for (const f of factList) {
    if (!f || typeof f !== 'object') { errors.push('fact not object'); continue; }
    const attr = clip(f.attr, 40);
    const value = clip(f.value, 200);
    if (!attr || !value) { errors.push('fact missing attr/value'); continue; }
    const qq = f.subject_qq != null ? String(f.subject_qq) : null;
    const name = clip(f.subject_name, 40) || null;
    if (!qq && !name) { errors.push('fact missing subject'); continue; }
    const vis = allowedVis.has(f.visibility) ? f.visibility : defaultVisibility;
    const kind = allowedKind.has(f.kind) ? f.kind : 'multi';
    facts.push({
      subjectQq: qq, subjectName: name, attr, value, kind,
      confidence: clamp01(f.confidence, 0.6),
      scope: isPrivate && vis === 'private' ? convKey : (vis === 'global' ? 'global' : convKey),
      visibility: vis,
      category: clip(f.category, 20) || 'preference',
      evidenceCount: Number(f.evidence_count) || 0,
      selfStated: f.self_stated === true,
      certainty: clip(f.certainty, 12) || 'stated',
      ttlDays: Number(f.ttl_days) || 0,
      expiresAt: Number(f.expires_at) > 0 ? Number(f.expires_at) : null
    });
  }

  for (const e of eventList) {
    if (!e || typeof e !== 'object') { errors.push('event not object'); continue; }
    const summary = clip(e.summary, 200);
    if (!summary) { errors.push('event missing summary'); continue; }
    const parts = Array.isArray(e.participants)
      ? e.participants.map((x) => String(x)).filter((x) => /^\d{5,12}$/.test(x)).slice(0, 10)
      : participants.slice(0, 10);
    const parsedWhen = parseHappenedAt(e.happened_at);
    // 发送时间不是发生时间：模型没给日期时保留 unknown，不做默认填充。
    const happenedAt = parsedWhen || null;
    events.push({
      summary,
      detail: clip(e.detail, 400) || null,
      participants: parts,
      happenedAt,
      timePrecision: parsedWhen ? 'day' : 'unknown',
      confidence: clamp01(e.confidence, 0.6),
      scope: convKey,
      visibility: defaultVisibility,
      category: clip(e.category, 20) || 'social',
      certainty: clip(e.certainty, 12) || 'stated'
    });
  }

  return { facts, events, errors };
}

/** 写候选（观察模式）或在 apply 模式下直接落正式表 */
export function writeExtraction(db, batch, validated, { observeOnly = true, sourceType = 'auto' } = {}) {
  ensureExtractSchema(db);
  let written = 0;
  let duplicates = 0;
  let rejected = 0;

  db.exec('BEGIN');
  try {
    for (const f of validated.facts) {
      const dedupe = `f|${f.subjectQq || ''}|${normalize(f.subjectName)}|${normalize(f.attr)}|${normalize(f.value)}|${f.scope}`;
      const judge = classifyCandidate({ ...f, kind: 'fact', category: f.category, evidenceCount: f.evidenceCount, selfStated: f.selfStated, certainty: f.certainty, ttlDays: f.ttlDays, expiresAt: f.expiresAt }, { convKey: batch.convKey });
      const status = judge.reject ? 'rejected' : 'pending';
      const expiresAt = judge.expiresAt || f.expiresAt || null;
      if (observeOnly) {
        const info = db.prepare(`INSERT OR IGNORE INTO memory_candidates
          (kind, subject_qq, subject_name, attr, value, confidence, scope, visibility, kind_of_fact,
           dedupe_key, batch_key, conv_key, source_type, status, reason, quality, category,
           evidence_count, self_stated, expires_at, created_at)
          VALUES('fact',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(f.subjectQq, f.subjectName, f.attr, f.value, f.confidence, f.scope, f.visibility,
            judge.expiresAt ? 'temporal' : f.kind, dedupe, batch.batchKey, batch.convKey, sourceType,
            status, judge.reject || '', judge.quality, f.category || null,
            f.evidenceCount || 0, f.selfStated ? 1 : 0, expiresAt, Date.now());
        if (Number(info.changes) > 0) { if (status === 'pending') written += 1; else rejected += 1; } else duplicates += 1;
      } else if (status === 'pending') {
        const r = addFact(db, {
          subjectQq: f.subjectQq, subjectName: f.subjectName, attr: f.attr, value: f.value,
          kind: judge.expiresAt ? 'temporal' : f.kind, confidence: f.confidence, scope: f.scope, visibility: f.visibility,
          category: f.category,
          sourceType, sourceConv: batch.convKey, sourceKey: `${batch.batchKey}|${dedupe}`
        });
        if (r.skipped) duplicates += 1; else written += 1;
      }
    }
    for (const e of validated.events) {
      const dedupe = `e|${normalize(e.summary)}|${e.happenedAt ? new Date(e.happenedAt).toISOString().slice(0, 10) : ''}`;
      const judge = classifyCandidate({ ...e, kind: 'event', category: e.category, certainty: e.certainty }, { convKey: batch.convKey });
      if (judge.reject === 'ops_event') {
        // 技术/运维事件进短期运行日志，不进人物记忆
        recordOpsEvent(db, e, { convKey: batch.convKey, sourceKey: `${batch.batchKey}|${dedupe}` });
      }
      const status = judge.reject ? 'rejected' : 'pending';
      if (observeOnly) {
        const evCols = ['kind','summary','detail','participants','confidence','scope','visibility',
          'happened_at','time_precision','dedupe_key','batch_key','conv_key','source_type','status','reason','quality','category','created_at'];
        const evVals = ['event', e.summary, e.detail, JSON.stringify(e.participants), e.confidence, e.scope,
          e.visibility, e.happenedAt || null, e.timePrecision || 'unknown', dedupe, batch.batchKey, batch.convKey, sourceType,
          status, judge.reject || '', judge.quality, e.category || null, Date.now()];
        const info = db.prepare(`INSERT OR IGNORE INTO memory_candidates
          (${evCols.join(',')}) VALUES(${evCols.map(() => '?').join(',')})`).run(...evVals);
        if (Number(info.changes) > 0) { if (status === 'pending') written += 1; else rejected += 1; } else duplicates += 1;
      } else if (status === 'pending') {
        const r = addEvent(db, {
          summary: e.summary, detail: e.detail, participants: e.participants,
          happenedAt: e.happenedAt, confidence: e.confidence, scope: e.scope,
          category: e.category,
          visibility: e.visibility, sourceType, sourceConv: batch.convKey,
          sourceKey: `${batch.batchKey}|${dedupe}`
        });
        if (r.skipped) duplicates += 1; else written += 1;
      }
    }

    db.prepare(`UPDATE messages SET extracted=1, batch_key=? WHERE id IN (${batch.ids.map(() => '?').join(',')})`)
      .run(batch.batchKey, ...batch.ids);
    db.prepare(`INSERT OR REPLACE INTO extraction_batches
      (batch_key, conv_key, from_seq, to_seq, status, attempts, created_at, updated_at)
      VALUES(?,?,?,?, 'done', 0, ?, ?)`)
      .run(batch.batchKey, batch.convKey, batch.rows[0]?.seq ?? null,
        batch.rows[batch.rows.length - 1]?.seq ?? null, Date.now(), Date.now());
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
  return { written, duplicates, rejected };
}

export function noteStats(db, { batches = 0, messages = 0, facts = 0, events = 0, invalid = 0, errors = 0, promptTokens = 0, completionTokens = 0 }) {
  ensureExtractSchema(db);
  const day = new Date().toISOString().slice(0, 10);
  db.prepare(`INSERT INTO extract_stats(day, batches, messages, facts, events, invalid, errors, prompt_tokens, completion_tokens, updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(day) DO UPDATE SET
      batches=batches+excluded.batches, messages=messages+excluded.messages,
      facts=facts+excluded.facts, events=events+excluded.events,
      invalid=invalid+excluded.invalid, errors=errors+excluded.errors,
      prompt_tokens=prompt_tokens+excluded.prompt_tokens, completion_tokens=completion_tokens+excluded.completion_tokens,
      updated_at=excluded.updated_at`)
    .run(day, batches, messages, facts, events, invalid, errors, promptTokens, completionTokens, Date.now());
}

export function readStats(db, days = 7) {
  ensureExtractSchema(db);
  return db.prepare('SELECT * FROM extract_stats ORDER BY day DESC LIMIT ?').all(days);
}

export function listCandidates(db, { status = 'pending', limit = 50 } = {}) {
  ensureExtractSchema(db);
  return db.prepare('SELECT * FROM memory_candidates WHERE status=? ORDER BY id DESC LIMIT ?').all(status, limit);
}

export function decideCandidate(db, id, action, reason = '') {
  ensureExtractSchema(db);
  if (action === 'apply') return applyCandidate(db, id, { reason });
  if (action !== 'reject') throw new Error('action 必须是 apply/reject');
  const info = db.prepare("UPDATE memory_candidates SET status='rejected', reason=? WHERE id=? AND status='pending'").run(reason, Number(id));
  if (!Number(info.changes)) throw new Error(`候选 #${id} 不是 pending，不能 reject`);
  return { id: Number(id), status: 'rejected' };
}

/**
 * 审计后正式写入：只有 pending 候选可以 apply。
 * - 幂等：已 applied 直接返回原引用；重复调用不会产生第二行。
 * - 失败：addFact/addEvent 内部回滚，候选保持 pending；修复后可重试。
 * - 主体/可见范围校验：global 事实必须有数字 QQ；事件必须有 summary 和发生时间。
 */
export function applyCandidate(db, id, { reason = '', allowGlobal = false } = {}) {
  ensureExtractSchema(db);
  const cand = db.prepare('SELECT * FROM memory_candidates WHERE id=?').get(Number(id));
  if (!cand) throw new Error(`候选 #${id} 不存在`);
  if (cand.status === 'applied') {
    return { id: Number(id), status: 'applied', already: true, refType: cand.applied_ref_type, refId: cand.applied_ref_id };
  }
  if (cand.status !== 'pending') throw new Error(`候选 #${id} 状态为 ${cand.status}，不能 apply`);

  db.exec('BEGIN');
  try {
  let refType = null;
  let refId = null;
  if (cand.kind === 'fact') {
    if (!cand.attr || !cand.value) throw new Error(`候选 #${id} 缺少 attr/value`);
    let subject = cand.subject_qq != null ? String(cand.subject_qq) : '';
    if (!subject && cand.subject_name) {
      subject = String(resolveQqByName(db, cand.subject_name, cand.conv_key) || '');
    }
    if (!subject) throw new Error(`候选 #${id} 缺少可解析的主体 QQ，拒绝写入`);
    if (!/^\d{5,12}$/.test(subject)) throw new Error(`候选 #${id} 主体不是有效 QQ，拒绝写入`);
    if (cand.scope === 'global' && !allowGlobal) {
      throw new Error(`候选 #${id} 是全局事实，必须显式 allowGlobal 才能写入（防止跨用户泄露）`);
    }
    const r = addFact(db, {
      subjectQq: subject || null,
      subjectName: cand.subject_name,
      attr: cand.attr,
      value: cand.value,
      kind: cand.expires_at ? 'temporal' : (cand.kind_of_fact || 'multi'),
      confidence: cand.confidence,
      category: cand.category,
      scope: cand.scope,
      visibility: cand.visibility,
      sourceType: 'auto:approved',
      sourceKey: `cand:${id}`,
      sourceConv: cand.conv_key,
      atomic: false
    });
    refType = 'fact'; refId = r.id;
  } else {
    if (!cand.summary) throw new Error(`候选 #${id} 缺少事件 summary`);
    // 旧候选没有 happened_at：用同批次消息的最后一个 sent_at 作为“近似”发生时间；
    // 连批次时间都没有则保留 unknown，绝不用 created_at 冒充发生时间。
    const batchTime = cand.batch_key
      ? db.prepare('SELECT MAX(sent_at) AS lastAt FROM messages WHERE batch_key=?').get(cand.batch_key)?.lastAt
      : null;
    const happenedAt = cand.happened_at != null
      ? Number(cand.happened_at)
      : (batchTime != null ? Number(batchTime) : null);
    const timePrecision = cand.happened_at != null
      ? (cand.time_precision || 'day')
      : (happenedAt != null ? 'approx' : 'unknown');
    // 事件级去重：不同批次的候选可能描述同一件事，按 summary + 发生时间 + scope 合并。
    const existingEvent = happenedAt != null
      ? db.prepare(`SELECT id FROM events WHERE summary=? AND happened_at=? AND scope=? LIMIT 1`).get(cand.summary, happenedAt, cand.scope || 'global')
      : db.prepare(`SELECT id FROM events WHERE summary=? AND happened_at IS NULL AND scope=? LIMIT 1`).get(cand.summary, cand.scope || 'global');
    if (existingEvent) {
      refType = 'event'; refId = existingEvent.id;
    } else {
      const r = addEvent(db, {
        summary: cand.summary,
        detail: cand.detail,
        participants: JSON.parse(cand.participants || '[]'),
        happenedAt,
        timePrecision,
        confidence: cand.confidence,
        category: cand.category,
        scope: cand.scope,
        visibility: cand.visibility,
        sourceType: 'auto:approved',
        sourceKey: `cand:${id}`,
        sourceConv: cand.conv_key
      });
      refType = 'event'; refId = r.id;
    }
  }

  db.prepare(`UPDATE memory_candidates
    SET status='applied', applied_at=?, applied_ref_type=?, applied_ref_id=?, reason=?
    WHERE id=? AND status='pending'`)
    .run(Date.now(), refType, refId, reason || 'manual apply', Number(id));
  db.exec('COMMIT');
  return { id: Number(id), status: 'applied', refType, refId };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  }
}

/** 构建抽取 prompt（短、结构化、便宜） */
export function buildExtractPrompt(batch, { convKey } = {}) {
  const fmt = (r) => {
    const d = new Date(Number(r.sent_at) || Date.now());
    const day = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const who = r.is_owner ? '主人' : (r.sender_name || r.sender_qq || '某人');
    return `[${day}][${who}${r.sender_qq ? '(QQ' + r.sender_qq + ')' : ''}] ${r.text || r.media_note || ''}`.slice(0, 300);
  };
  const context = Array.isArray(batch.contextRows) ? batch.contextRows : [];
  const lines = batch.rows.map(fmt);
  const isPrivate = String(convKey || '').startsWith('private:');
  return [
    '你是长期记忆抽取器。从聊天记录里只抽"以后还用得上"的信息，输出 JSON，不要解释。',
    '',
    '【硬规则，违反就别写】',
    '1) 单次行为不能上升为人格。性格/习惯类必须 evidence_count>=3 条独立证据，或本人明确自述（self_stated=true）。',
    '2) 临时计划要写 category="plan" 并给 ttl_days（默认 7），不要写成永久属性。',
    '3) 技术/运维事件（掉线、重启、报错、服务挂了）写 category="tech"，系统会收进运维日志。',
    '4) 玩笑、反讽、引用别人的话、身份不确定 → certainty 填 joke/quote/uncertain，系统会丢掉；角色扮演也填 uncertain。',
    '5) 不抽：寒暄、重复内容、隐私（住址/钱/健康/家庭）。转瞬即逝的情绪化表达不抽；但用户明确分享的、有长期回忆价值的感受/近况可以抽。',
    '6) subject_qq 只能填记录里出现过的 QQ；没有就留空并写 subject_name。',
    '7) 值得长期回忆的普通经历也要抽：共同完成的事、约定、个人近况/感受、持续话题的重要进展。已发生的写 event；尚未发生的约定写 fact(category="plan")，绝不能写成已发生 event。',
    '8) 事件 happened_at 用消息里的日期（YYYY-MM-DD）；只有明确说“上周/昨天/某月某日”时才换算。无法确定日期就留空，不要用今天或发送时间猜测。',
    '',
    '【字段说明】',
    'category: trait(性格) | habit(习惯) | preference(喜好) | profile(近况) | plan(计划)',
    'kind: single(单值) | multi(可多值) | temporal(会随时间变，计划和近况用它)',
    `visibility: ${isPrivate ? 'private(这段是私聊)' : 'group(这段是群聊)'}`,
    '',
    '【输出格式】',
    '{"facts":[{"subject_qq":"123","subject_name":"小明","attr":"喜欢的游戏","value":"消消乐",',
    '  "kind":"multi","category":"preference","confidence":0.8,"visibility":"group",',
    '  "evidence_count":3,"self_stated":false,"certainty":"stated"}],',
    ' "events":[{"summary":"他今天通关了第18关","detail":"","participants":["123"],',
    '  "happened_at":"2026-10-23","category":"social","certainty":"stated","confidence":0.7}]}',
    '',
    ...(context.length ? [
      '【前文（只作理解背景，不要重复抽取）】',
      ...context.map(fmt),
      ''
    ] : []),
    '【待抽取的新消息】',
    ...lines
  ].join('\n');
}

export function batchHash(batch) {
  return crypto.createHash('sha1').update(batch.batchKey).digest('hex');
}

function clip(v, n) {
  if (v == null) return '';
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) : s;
}
function normalize(v) {
  return String(v || '').toLowerCase().replace(/[\s，。！？、,.!?]/g, '');
}
function clamp01(v, d) {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.max(0, Math.min(1, n));
}

/** 解析模型给出的发生时间：毫秒/秒时间戳、ISO、YYYY-MM-DD；日期默认按 +08:00 中午。 */
export function parseHappenedAt(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  const s = String(value).trim();
  if (/^\d{10,13}$/.test(s)) {
    const n = Number(s);
    return n < 1e12 ? n * 1000 : n;
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d, 12) - 8 * 3600000;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}
