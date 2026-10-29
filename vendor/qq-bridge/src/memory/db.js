/**
 * Memory V3 · SQLite 存储层（第一阶段：只写不读，聊天逻辑完全不变）
 *
 * 设计要点（对应需求）：
 * - 不依赖 FTS5 的中文分词：自己生成中文二元组 + ASCII 词，写 memory_tokens 表。
 * - 事实分三类：single（单值，新值顶替旧值）、multi（多值，如"喜欢多款游戏"）、temporal（带时间变化）。
 *   旧事实永远保留在库里（status=superseded + superseded_by + valid_to），可追溯。
 * - 幂等：每行都带 source_key（来源会话:消息序号:内容摘要），重复写直接忽略。
 * - 任何 DB 失败都向外抛，由调用方决定降级（聊天主流程不会因此中断）。
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { tokenize } from './tokenize.js';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS persons (
  qq TEXT PRIMARY KEY,
  nickname TEXT,
  first_seen_at INTEGER,
  last_seen_at INTEGER,
  msg_count INTEGER NOT NULL DEFAULT 0,
  note_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qq TEXT NOT NULL,
  name TEXT NOT NULL,
  conv_key TEXT,
  weight REAL NOT NULL DEFAULT 1,
  created_at INTEGER,
  UNIQUE(qq, name, conv_key)
);

CREATE TABLE IF NOT EXISTS facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_qq TEXT,
  subject_name TEXT,
  attr TEXT NOT NULL,
  value TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'multi' CHECK(kind IN ('single','multi','temporal')),
  confidence REAL NOT NULL DEFAULT 0.7,
  scope TEXT NOT NULL DEFAULT 'global',
  visibility TEXT NOT NULL DEFAULT 'global' CHECK(visibility IN ('private','group','global')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','superseded','retracted')),
  valid_from INTEGER,
  valid_to INTEGER,
  supersedes_id INTEGER,
  superseded_by INTEGER,
  source_type TEXT,
  source_key TEXT UNIQUE,
  source_conv TEXT,
  source_msg_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_facts_subject ON facts(subject_qq, status);
CREATE INDEX IF NOT EXISTS idx_facts_attr ON facts(attr, status);
CREATE INDEX IF NOT EXISTS idx_facts_scope ON facts(scope, visibility, status);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  happened_at INTEGER,
  time_precision TEXT NOT NULL DEFAULT 'unknown',
  summary TEXT NOT NULL,
  detail TEXT,
  participants TEXT,
  scope TEXT NOT NULL DEFAULT 'global',
  visibility TEXT NOT NULL DEFAULT 'global' CHECK(visibility IN ('private','group','global')),
  confidence REAL NOT NULL DEFAULT 0.7,
  source_type TEXT,
  source_key TEXT UNIQUE,
  source_conv TEXT,
  source_msg_id INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(happened_at);
CREATE INDEX IF NOT EXISTS idx_events_scope ON events(scope, visibility);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conv_key TEXT NOT NULL,
  seq INTEGER,
  sender_qq TEXT,
  sender_name TEXT,
  text TEXT,
  media_note TEXT,
  sent_at INTEGER,
  is_self INTEGER NOT NULL DEFAULT 0,
  is_owner INTEGER NOT NULL DEFAULT 0,
  extracted INTEGER NOT NULL DEFAULT 0,
  UNIQUE(conv_key, seq)
);
CREATE INDEX IF NOT EXISTS idx_messages_pending ON messages(conv_key, extracted, seq);

CREATE TABLE IF NOT EXISTS memory_tokens (
  token TEXT NOT NULL,
  ref_type TEXT NOT NULL CHECK(ref_type IN ('fact','event')),
  ref_id INTEGER NOT NULL,
  PRIMARY KEY(token, ref_type, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_tokens_ref ON memory_tokens(ref_type, ref_id);

CREATE TABLE IF NOT EXISTS extraction_batches (
  batch_key TEXT PRIMARY KEY,
  conv_key TEXT,
  from_seq INTEGER,
  to_seq INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','done','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

export function openMemoryDb(dbPath) {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  db.prepare('INSERT OR IGNORE INTO meta(key, value) VALUES(?, ?)').run('schema_version', '3.0.0');
  return db;
}

function hashKey(...parts) {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 24);
}

export function upsertPerson(db, { qq, nickname, at }) {
  if (!qq) return;
  const now = Number(at) || Date.now();
  db.prepare(`INSERT INTO persons(qq, nickname, first_seen_at, last_seen_at, msg_count, note_count)
              VALUES(?, ?, ?, ?, 0, 0)
              ON CONFLICT(qq) DO UPDATE SET
                nickname = COALESCE(excluded.nickname, persons.nickname),
                last_seen_at = MAX(COALESCE(persons.last_seen_at, 0), excluded.last_seen_at)`)
    .run(String(qq), nickname || null, now, now);
}

export function addAlias(db, { qq, name, convKey = null, weight = 1 }) {
  if (!qq || !name) return;
  db.prepare(`INSERT OR IGNORE INTO aliases(qq, name, conv_key, weight, created_at) VALUES(?, ?, ?, ?, ?)`)
    .run(String(qq), String(name), convKey, Number(weight) || 1, Date.now());
}

/**
 * 写一条事实。
 * - kind=multi：同一 subject+attr 允许多个值（喜欢多款游戏），按 value 去重
 * - kind=single：新值顶替旧值（旧行标 superseded，保留历史）
 * - kind=temporal：同 single，但保留 valid_from/valid_to 便于回溯
 */
export function addFact(db, input) {
  const now = Date.now();
  const subjectQq = input.subjectQq != null ? String(input.subjectQq) : null;
  const attr = String(input.attr || '').trim();
  const value = String(input.value || '').trim();
  if (!attr || !value) throw new Error('fact 需要 attr 和 value');

  const kind = ['single', 'multi', 'temporal'].includes(input.kind) ? input.kind : 'multi';
  const scope = String(input.scope || 'global');
  const visibility = ['private', 'group', 'global'].includes(input.visibility) ? input.visibility : 'global';
  const sourceKey = input.sourceKey || hashKey('fact', subjectQq || '', attr, value, scope, input.sourceConv || '', input.sourceMsgId ?? '');

  const tx = db.prepare('SELECT 1'); // 占位，事务用下面的显式语句
  void tx;
  db.exec('BEGIN');
  try {
    // 幂等：同一来源重复写入直接返回已有 id
    const existing = db.prepare('SELECT id FROM facts WHERE source_key = ?').get(sourceKey);
    if (existing) { db.exec('COMMIT'); return { id: existing.id, skipped: true }; }

    if (kind !== 'multi') {
      const actives = db.prepare(`SELECT id FROM facts
        WHERE status='active' AND attr=? AND COALESCE(subject_qq,'')=COALESCE(?,'')
          AND scope=? AND kind IN ('single','temporal')`).all(attr, subjectQq, scope);
      for (const row of actives) {
        db.prepare(`UPDATE facts SET status='superseded', valid_to=?, updated_at=? WHERE id=?`).run(now, now, row.id);
      }
    } else {
      const dup = db.prepare(`SELECT id FROM facts
        WHERE status='active' AND attr=? AND value=? AND COALESCE(subject_qq,'')=COALESCE(?,'') AND scope=?`)
        .get(attr, value, subjectQq, scope);
      if (dup) { db.exec('COMMIT'); return { id: dup.id, skipped: true }; }
    }

    const info = db.prepare(`INSERT INTO facts
      (subject_qq, subject_name, attr, value, kind, confidence, scope, visibility, status,
       valid_from, valid_to, source_type, source_key, source_conv, source_msg_id, created_at, updated_at)
      VALUES(?,?,?,?,?,?,?,?,'active',?,NULL,?,?,?,?,?,?)`)
      .run(subjectQq, input.subjectName || null, attr, value, kind,
        Number(input.confidence) || 0.7, scope, visibility,
        input.validFrom ?? now, input.sourceType || 'manual', sourceKey,
        input.sourceConv || null, input.sourceMsgId ?? null, now, now);
    const id = Number(info.lastInsertRowid);

    indexTokens(db, 'fact', id, [attr, value, input.subjectName || ''].join(' '));
    db.exec('COMMIT');
    return { id, skipped: false };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

export function addEvent(db, input) {
  const now = Date.now();
  const summary = String(input.summary || '').trim();
  if (!summary) throw new Error('event 需要 summary');
  const hasHappenedAt = Object.prototype.hasOwnProperty.call(input, 'happenedAt');
  const happenedAt = hasHappenedAt ? (input.happenedAt == null ? null : Number(input.happenedAt) || null) : now;
  const precision = input.timePrecision
    || (happenedAt == null ? 'unknown' : (hasHappenedAt ? 'day' : 'approx'));
  const sourceKey = input.sourceKey || hashKey('event', summary, input.sourceConv || '', input.sourceMsgId ?? '', happenedAt ?? '');
  const existing = db.prepare('SELECT id FROM events WHERE source_key = ?').get(sourceKey);
  if (existing) return { id: existing.id, skipped: true };

  const info = db.prepare(`INSERT INTO events
    (happened_at, time_precision, summary, detail, participants, scope, visibility, confidence,
     source_type, source_key, source_conv, source_msg_id, created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(happenedAt, precision, summary, input.detail || null,
      JSON.stringify(input.participants || []), String(input.scope || 'global'),
      ['private', 'group', 'global'].includes(input.visibility) ? input.visibility : 'global',
      Number(input.confidence) || 0.7, input.sourceType || 'manual', sourceKey,
      input.sourceConv || null, input.sourceMsgId ?? null, now);
  const id = Number(info.lastInsertRowid);
  indexTokens(db, 'event', id, [summary, input.detail || ''].join(' '));
  return { id, skipped: false };
}

export function addMessage(db, input) {
  if (!input.convKey || input.seq == null) return { skipped: true };
  const info = db.prepare(`INSERT OR IGNORE INTO messages
    (conv_key, seq, sender_qq, sender_name, text, media_note, sent_at, is_self)
    VALUES(?,?,?,?,?,?,?,?)`)
    .run(String(input.convKey), Number(input.seq), input.senderQq != null ? String(input.senderQq) : null,
      input.senderName || null, input.text || null, input.mediaNote || null,
      Number(input.sentAt) || Date.now(), input.isSelf ? 1 : 0);
  return { inserted: Number(info.changes) > 0 };
}

function indexTokens(db, refType, refId, text) {
  const tokens = tokenize(text);
  if (!tokens.length) return;
  const stmt = db.prepare('INSERT OR IGNORE INTO memory_tokens(token, ref_type, ref_id) VALUES(?,?,?)');
  for (const t of tokens) stmt.run(t, refType, refId);
}

/** 解析名字 → QQ（别名表 + 会话内优先） */
export function resolveQqByName(db, name, convKey = null) {
  if (!name) return null;
  const byConv = convKey
    ? db.prepare('SELECT qq FROM aliases WHERE name=? AND conv_key=? ORDER BY weight DESC LIMIT 1').get(String(name), convKey)
    : null;
  if (byConv) return byConv.qq;
  const any = db.prepare('SELECT qq FROM aliases WHERE name=? ORDER BY weight DESC LIMIT 1').get(String(name));
  return any ? any.qq : null;
}

/**
 * 检索：主体命中（QQ/别名）+ 关键词命中（自有 token 表，不用 FTS5 中文分词）+ 时间衰减。
 * 第一版不做语义检索。
 */
export function searchMemory(db, { convKey = 'global', qqs = [], text = '', limit = 8, now = Date.now(), timeRange = null, selfQq = null } = {}) {
  const scores = new Map(); // `${type}:${id}` -> { type, id, score }
  const bump = (type, id, delta) => {
    const k = `${type}:${id}`;
    const cur = scores.get(k) || { type, id, score: 0 };
    cur.score += delta;
    scores.set(k, cur);
  };

  const isPrivateConv = String(convKey).startsWith('private:');
  // scope 隔离：只允许「本会话 + global」，不允许跨群串用，也不允许私聊记忆进群聊
  const visFilter = isPrivateConv
    ? "visibility IN ('private','group','global')"
    : "visibility IN ('group','global')";

  // 全局事实只能被「当前说话人本人」或 bot 自己召回；避免把 A 的档案注入 B 的会话。
  const globalFactVisible = (fact) => {
    if (!fact || fact.scope !== 'global') return true;
    const subject = fact.subject_qq != null ? String(fact.subject_qq) : '';
    if (subject && qqs.map(String).includes(subject)) return true;
    if (selfQq != null && subject === String(selfQq)) return true;
    return false;
  };

  // 1) 主体命中：这些人的事实优先（只对本会话可见的 scope）
  for (const qq of qqs) {
    const rows = db.prepare(`SELECT id, updated_at FROM facts
      WHERE subject_qq=? AND status='active' AND ${visFilter}
        AND (scope='global' OR scope=?)`).all(String(qq), convKey);
    for (const r of rows) bump('fact', r.id, 3);
  }

  // 2) 时间范围命中：按事件真实发生时间取候选（不再只靠关键词）
  if (timeRange) {
    const rows = db.prepare(`SELECT id, happened_at FROM events
      WHERE happened_at BETWEEN ? AND ? AND happened_at IS NOT NULL AND time_precision != 'unknown'
        AND ${visFilter} AND (scope='global' OR scope=?)
      ORDER BY happened_at DESC LIMIT 60`).all(timeRange.from, timeRange.to, convKey);
    for (const r of rows) bump('event', r.id, 2.5);
  }

  // 3) 主体/参与者命中：事件参与者也应能召回（有时间范围时只取范围内事件）
  for (const qq of qqs) {
    const rangeClause = timeRange ? "AND happened_at BETWEEN ? AND ? AND happened_at IS NOT NULL AND time_precision != 'unknown'" : '';
    const params = timeRange
      ? [`%"${String(qq)}"%`, timeRange.from, timeRange.to, convKey]
      : [`%"${String(qq)}"%`, convKey];
    const rows = db.prepare(`SELECT id FROM events
      WHERE participants LIKE ? ${rangeClause} AND ${visFilter} AND (scope='global' OR scope=?)
      ORDER BY happened_at DESC LIMIT 40`).all(...params);
    for (const r of rows) bump('event', r.id, 2);
  }

  // 4) 关键词命中：token 交集
  const tokens = tokenize(text).slice(0, 24);
  if (tokens.length) {
    const ph = tokens.map(() => '?').join(',');
    const rows = db.prepare(`SELECT ref_type, ref_id, COUNT(*) AS hits FROM memory_tokens
      WHERE token IN (${ph}) GROUP BY ref_type, ref_id ORDER BY hits DESC LIMIT 80`)
      .all(...tokens);
    for (const r of rows) bump(r.ref_type, r.ref_id, Number(r.hits) * 1.5);
  }

  // 5) 整理结果 + 时间衰减
  const out = [];
  for (const { type, id, score } of scores.values()) {
    if (type === 'fact') {
      const f = db.prepare(`SELECT * FROM facts WHERE id=? AND status='active' AND ${visFilter}
        AND (scope='global' OR scope=?)`).get(id, convKey);
      if (!f || !globalFactVisible(f)) continue;
      const ageDays = Math.max(0, (now - Number(f.updated_at || now)) / 86400000);
      out.push({ type: 'fact', score: score * (1 / (1 + ageDays / 14)), row: f });
    } else {
      const e = db.prepare(`SELECT * FROM events WHERE id=? AND ${visFilter}
        AND (scope='global' OR scope=?)`).get(id, convKey);
      if (!e) continue;
      if (timeRange && (e.time_precision === 'unknown' || e.happened_at == null)) continue;
      if (timeRange && (Number(e.happened_at) < timeRange.from || Number(e.happened_at) > timeRange.to)) continue;
      const ageDays = Math.max(0, (now - Number(e.happened_at || now)) / 86400000);
      out.push({ type: 'event', score: score * (1 / (1 + ageDays / 14)), row: e });
    }
  }
  out.sort((a, b) => b.score - a.score);
  // 多样性：同一个人最多 4 条事实，避免一次注入全是同一个人的标签
  const perSubject = new Map();
  const diversified = [];
  for (const item of out) {
    if (item.type === 'fact') {
      const subj = String(item.row.subject_qq || item.row.subject_name || '');
      const used = perSubject.get(subj) || 0;
      if (used >= 4) continue;
      perSubject.set(subj, used + 1);
    }
    diversified.push(item);
    if (diversified.length >= limit) break;
  }
  return diversified;
}

/** 事实纠正/撤回：保留历史，不物理删除 */
export function retractFact(db, id) {
  db.prepare(`UPDATE facts SET status='retracted', valid_to=?, updated_at=? WHERE id=?`)
    .run(Date.now(), Date.now(), Number(id));
}

export function stats(db) {
  const one = (sql) => Object.values(db.prepare(sql).get() || {})[0];
  return {
    persons: one('SELECT COUNT(*) FROM persons'),
    aliases: one('SELECT COUNT(*) FROM aliases'),
    factsActive: one("SELECT COUNT(*) FROM facts WHERE status='active'"),
    factsSuperseded: one("SELECT COUNT(*) FROM facts WHERE status='superseded'"),
    events: one('SELECT COUNT(*) FROM events'),
    messages: one('SELECT COUNT(*) FROM messages'),
    tokens: one('SELECT COUNT(*) FROM memory_tokens')
  };
}
