'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('node:url');
const { memoryDbPath } = require('./memory');

const UNLOCK_PHRASE = '我确认修改生产记忆';
const SESSION_MS = 10 * 60 * 1000;
let session = null;

function unlockProductionReview({ confirmText } = {}) {
  if (String(confirmText || '').trim() !== UNLOCK_PHRASE) {
    throw new Error('确认短语不正确');
  }
  const token = crypto.randomBytes(24).toString('hex');
  session = { token, actor: os.userInfo().username || 'local-user', expiresAt: Date.now() + SESSION_MS };
  return { ok: true, token, actor: session.actor, expiresAt: session.expiresAt };
}

function requireUnlocked(token) {
  if (!session || session.token !== String(token || '') || Date.now() > session.expiresAt) {
    throw new Error('生产审核未解锁或已过期，请重新解锁');
  }
  return session;
}

function ensureReviewSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS memory_review_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT UNIQUE,
    trace_id TEXT,
    at INTEGER NOT NULL,
    actor TEXT,
    action TEXT NOT NULL,
    candidate_id INTEGER,
    status_before TEXT,
    status_after TEXT,
    ref_type TEXT,
    ref_id INTEGER,
    reason TEXT,
    changes TEXT,
    source_trace TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_review_audit_at ON memory_review_audit(at);
  CREATE INDEX IF NOT EXISTS idx_review_audit_candidate ON memory_review_audit(candidate_id, at);`);
  const auditCols = db.prepare('PRAGMA table_info(memory_review_audit)').all().map((c) => c.name);
  if (!auditCols.includes('source_trace')) db.exec('ALTER TABLE memory_review_audit ADD COLUMN source_trace TEXT');
  const cols = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name);
  if (!cols.includes('retracted_at')) db.exec('ALTER TABLE events ADD COLUMN retracted_at INTEGER');
  ensureConfirmedSchema(db);
  try {
    db.prepare('DELETE FROM memory_review_audit WHERE at < ?').run(Date.now() - 90 * 86400000);
  } catch { /* ignore */ }
}

function writeAudit(db, { requestId, traceId, action, candidate, statusAfter, refType = null, refId = null, reason = '', changes = null }) {
  if (!requestId) throw new Error('requestId 为空');
  const existing = db.prepare('SELECT * FROM memory_review_audit WHERE request_id=?').get(String(requestId));
  if (existing) return { already: true, audit: existing };
  db.prepare(`INSERT INTO memory_review_audit
    (request_id, trace_id, at, actor, action, candidate_id, status_before, status_after, ref_type, ref_id, reason, changes, source_trace)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    String(requestId), String(traceId), Date.now(), session.actor, String(action),
    Number(candidate?.id) || null, candidate?.status || null, statusAfter || null,
    refType, refId, String(reason || '').slice(0, 300), changes ? JSON.stringify(changes).slice(0, 1000) : null,
    candidate?.trace_id || null
  );
  return { already: false };
}

function ensureConfirmedSchema(db) {
  for (const table of ['facts', 'events']) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes('manual_override')) db.exec(`ALTER TABLE ${table} ADD COLUMN manual_override INTEGER DEFAULT 0`);
    if (!cols.includes('manual_updated_at')) db.exec(`ALTER TABLE ${table} ADD COLUMN manual_updated_at INTEGER`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS memory_change_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    row_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    actor TEXT,
    reason TEXT,
    at INTEGER NOT NULL,
    undone_at INTEGER,
    can_undo INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_change_audit_row ON memory_change_audit(table_name, row_id, at);`);
}

function readJson(value, fallback = null) {
  try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return fallback; }
}

function openConfirmedDb({ settings, paths, mode = 'prod' }) {
  const file = mode === 'test' ? paths.memoryTestDb : memoryDbPath(settings);
  if (!fs.existsSync(file)) throw new Error('记忆库不存在');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout=8000');
  ensureConfirmedSchema(db);
  return { db, file };
}

function addChangeAudit(db, { tableName, rowId, action, before, after, actor, reason }) {
  const info = db.prepare(`INSERT INTO memory_change_audit
    (table_name, row_id, action, before_json, after_json, actor, reason, at, can_undo)
    VALUES(?,?,?,?,?,?,?,?,1)`).run(
    tableName, Number(rowId), action, JSON.stringify(before), JSON.stringify(after),
    actor || 'desktop', String(reason || '').slice(0, 300), Date.now()
  );
  return Number(info.lastInsertRowid);
}

function listChangeAudit({ settings, paths, mode = 'prod', type = '', id = null, limit = 30 }) {
  const file = mode === 'test' ? paths.memoryTestDb : memoryDbPath(settings);
  if (!fs.existsSync(file)) return { exists: false, rows: [] };
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    let exists = true;
    try { db.prepare('SELECT 1 FROM memory_change_audit LIMIT 1').get(); } catch { exists = false; }
    if (!exists) return { exists: true, rows: [] };
    const table = type === 'event' ? 'events' : type === 'fact' ? 'facts' : '';
    const rows = table && id
      ? db.prepare('SELECT * FROM memory_change_audit WHERE table_name=? AND row_id=? ORDER BY id DESC LIMIT ?').all(table, Number(id), Math.min(100, Number(limit) || 30))
      : db.prepare('SELECT * FROM memory_change_audit ORDER BY id DESC LIMIT ?').all(Math.min(100, Number(limit) || 30));
    return { exists: true, rows: rows.map((r) => ({ ...r, before: readJson(r.before_json, {}), after: readJson(r.after_json, {}) })) };
  } finally { try { db.close(); } catch { /* ignore */ } }
}

function editConfirmed({ settings, paths, mode = 'prod', type, id, edit, token, reason = '', expectedUpdatedAt = null }) {
  if (mode === 'prod') requireUnlocked(token);
  const table = type === 'event' ? 'events' : type === 'fact' ? 'facts' : '';
  if (!table) throw new Error('类型必须是 fact 或 event');
  const { db } = openConfirmedDb({ settings, paths, mode });
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(Number(id));
    if (!row) throw new Error('记录不存在');
    if (table === 'facts' && row.status !== 'active') throw new Error('只能编辑有效事实');
    if (table === 'events' && row.retracted_at) throw new Error('只能编辑未删除事件');
    if (expectedUpdatedAt != null && table === 'facts' && Number(row.updated_at) !== Number(expectedUpdatedAt)) {
      throw new Error('记录已被修改，请刷新后再编辑');
    }
    const allowed = table === 'facts'
      ? ['subject_qq', 'subject_name', 'attr', 'value', 'confidence', 'scope', 'visibility', 'importance']
      : ['summary', 'detail', 'participants', 'happened_at', 'time_precision', 'confidence', 'scope', 'visibility', 'importance'];
    const changes = {};
    for (const key of allowed) {
      if (!edit || !Object.prototype.hasOwnProperty.call(edit, key)) continue;
      let value = edit[key];
      if (key === 'confidence' || key === 'importance') value = Math.max(0, Math.min(1, Number(value)));
      else if (key === 'happened_at') value = value == null || value === '' ? null : (Number(value) || null);
      else if (key === 'participants') value = JSON.stringify(Array.isArray(value) ? value.map(String).slice(0, 30) : []);
      else if (key === 'subject_qq' && value != null && value !== '') {
        value = String(value).trim();
        if (!/^\d{5,12}$/.test(value)) throw new Error('主体 QQ 格式不正确');
      } else value = value == null ? null : String(value).slice(0, key === 'value' ? 2000 : 500);
      changes[key] = value;
    }
    if (table === 'facts') {
      if (changes.attr !== undefined && !String(changes.attr || '').trim()) throw new Error('属性不能为空');
      if (changes.value !== undefined && !String(changes.value || '').trim()) throw new Error('内容不能为空');
    } else if (changes.summary !== undefined && !String(changes.summary || '').trim()) throw new Error('事件摘要不能为空');
    if (!Object.keys(changes).length) throw new Error('没有可编辑字段');
    const sets = Object.keys(changes).map((key) => `${key}=?`).join(', ');
    const now = Date.now();
    const extra = table === 'facts' ? ', updated_at=?' : '';
    const params = [...Object.values(changes), now, now];
    if (table === 'facts') params.push(now);
    db.prepare(`UPDATE ${table} SET ${sets}, source_type='manual:edited', manual_override=1, manual_updated_at=?${extra} WHERE id=?`)
      .run(...Object.values(changes), now, ...(table === 'facts' ? [now, Number(id)] : [Number(id)]));
    const after = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(Number(id));
    const auditId = addChangeAudit(db, { tableName: table, rowId: Number(id), action: 'update', before: row, after, actor: mode === 'test' ? 'desktop-test' : (session?.actor || 'desktop'), reason });
    db.exec('COMMIT');
    return { ok: true, type, id: Number(id), auditId, record: after };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  } finally { try { db.close(); } catch { /* ignore */ } }
}

function createConfirmed({ settings, paths, mode = 'prod', type, input = {}, token, reason = '' }) {
  if (mode === 'prod') requireUnlocked(token);
  const table = type === 'event' ? 'events' : type === 'fact' ? 'facts' : '';
  if (!table) throw new Error('类型必须是 fact 或 event');
  const { db } = openConfirmedDb({ settings, paths, mode });
  let ownerQQ = '';
  try { ownerQQ = String(JSON.parse(fs.readFileSync(path.join(settings.repoRoot, 'config.json'), 'utf8')).ownerQQ || ''); } catch { /* ignore */ }
  db.exec('BEGIN IMMEDIATE');
  try {
    const now = Date.now();
    let row;
    if (table === 'facts') {
      const subjectQq = String(input.subject_qq || '').trim();
      const subjectName = String(input.subject_name || '').trim().slice(0, 80);
      const attr = String(input.attr || '').trim().slice(0, 200);
      const value = String(input.value || '').trim().slice(0, 2000);
      if (subjectQq && !/^\d{5,12}$/.test(subjectQq)) throw new Error('主体 QQ 格式不正确');
      if (!subjectQq && !subjectName) throw new Error('需要主体 QQ 或名称');
      if (!attr || !value) throw new Error('属性与内容不能为空');
      const confidence = Math.max(0, Math.min(1, Number(input.confidence) || 0.8));
      const scope = String(input.scope || (ownerQQ ? `private:${ownerQQ}` : 'global')).trim();
      const visibility = ['private', 'group', 'global'].includes(String(input.visibility)) ? String(input.visibility) : 'private';
      const info = db.prepare(`INSERT INTO facts
        (subject_qq,subject_name,attr,value,kind,confidence,scope,visibility,status,source_type,created_at,updated_at,importance,manual_override,manual_updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`).run(
        subjectQq || null, subjectName || null, attr, value, 'multi', confidence, scope, visibility, 'active', 'manual:desktop', now, now, 0.5, now
      );
      row = db.prepare('SELECT * FROM facts WHERE id=?').get(Number(info.lastInsertRowid));
    } else {
      const summary = String(input.summary || '').trim().slice(0, 200);
      if (!summary) throw new Error('事件摘要不能为空');
      const detail = String(input.detail || '').trim().slice(0, 2000);
      const participants = JSON.stringify(Array.isArray(input.participants) ? input.participants.map(String).slice(0, 30) : []);
      const happenedAt = input.happened_at == null || input.happened_at === '' ? null : Number(input.happened_at) || null;
      const confidence = Math.max(0, Math.min(1, Number(input.confidence) || 0.8));
      const scope = String(input.scope || (ownerQQ ? `private:${ownerQQ}` : 'global')).trim();
      const visibility = ['private', 'group', 'global'].includes(String(input.visibility)) ? String(input.visibility) : 'private';
      const precision = ['exact', 'day', 'approx', 'unknown'].includes(String(input.time_precision)) ? String(input.time_precision) : 'unknown';
      const info = db.prepare(`INSERT INTO events
        (summary,detail,participants,happened_at,time_precision,confidence,scope,visibility,source_type,created_at,importance,manual_override,manual_updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?)`).run(
        summary, detail, participants, happenedAt, precision, confidence, scope, visibility, 'manual:desktop', now, 0.5, now
      );
      row = db.prepare('SELECT * FROM events WHERE id=?').get(Number(info.lastInsertRowid));
    }
    const auditId = addChangeAudit(db, { tableName: table, rowId: row.id, action: 'create', before: null, after: row, actor: mode === 'test' ? 'desktop-test' : (session?.actor || 'desktop'), reason });
    db.exec('COMMIT');
    return { ok: true, type, id: Number(row.id), auditId, record: row };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  } finally { try { db.close(); } catch { /* ignore */ } }
}

function deleteConfirmed({ settings, paths, mode = 'prod', type, id, token, reason = '' }) {
  if (mode === 'prod') requireUnlocked(token);
  const table = type === 'event' ? 'events' : type === 'fact' ? 'facts' : '';
  if (!table) throw new Error('类型必须是 fact 或 event');
  const { db } = openConfirmedDb({ settings, paths, mode });
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(Number(id));
    if (!row) throw new Error('记录不存在');
    if (table === 'facts' && row.status !== 'active') throw new Error('记录已经不在有效状态');
    if (table === 'events' && row.retracted_at) throw new Error('事件已经删除');
    const now = Date.now();
    if (table === 'facts') db.prepare("UPDATE facts SET status='retracted', valid_to=?, manual_override=1, manual_updated_at=?, updated_at=? WHERE id=?").run(now, now, now, Number(id));
    else db.prepare('UPDATE events SET retracted_at=?, manual_override=1, manual_updated_at=? WHERE id=?').run(now, now, Number(id));
    const after = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(Number(id));
    const auditId = addChangeAudit(db, { tableName: table, rowId: Number(id), action: 'delete', before: row, after, actor: mode === 'test' ? 'desktop-test' : (session?.actor || 'desktop'), reason });
    db.exec('COMMIT');
    return { ok: true, type, id: Number(id), auditId, record: after };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  } finally { try { db.close(); } catch { /* ignore */ } }
}

function restoreConfirmed({ settings, paths, mode = 'prod', type, id, token, reason = '' }) {
  if (mode === 'prod') requireUnlocked(token);
  const table = type === 'event' ? 'events' : type === 'fact' ? 'facts' : '';
  if (!table) throw new Error('类型必须是 fact 或 event');
  const { db } = openConfirmedDb({ settings, paths, mode });
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(Number(id));
    if (!row) throw new Error('记录不存在');
    if (table === 'facts' && row.status !== 'retracted') throw new Error('这条事实没有删除');
    if (table === 'events' && !row.retracted_at) throw new Error('这条事件没有删除');
    const now = Date.now();
    if (table === 'facts') db.prepare("UPDATE facts SET status='active', valid_to=NULL, manual_override=1, manual_updated_at=?, updated_at=? WHERE id=?").run(now, now, Number(id));
    else db.prepare('UPDATE events SET retracted_at=NULL, manual_override=1, manual_updated_at=? WHERE id=?').run(now, Number(id));
    const after = db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(Number(id));
    const auditId = addChangeAudit(db, { tableName: table, rowId: Number(id), action: 'restore', before: row, after, actor: mode === 'test' ? 'desktop-test' : (session?.actor || 'desktop'), reason });
    db.exec('COMMIT');
    return { ok: true, type, id: Number(id), auditId, record: after };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  } finally { try { db.close(); } catch { /* ignore */ } }
}

function reviewGrowthCandidate({ settings, paths, mode = 'prod', id, action, token, reason = '' }) {
  if (mode === 'prod') requireUnlocked(token);
  if (!['apply', 'reject'].includes(String(action))) throw new Error('action 必须是 apply 或 reject');
  const { db } = openConfirmedDb({ settings, paths, mode });
  db.exec('BEGIN IMMEDIATE');
  try {
    const c = db.prepare('SELECT * FROM growth_candidates WHERE id=?').get(Number(id));
    if (!c) throw new Error('成长候选不存在');
    if (c.status !== 'pending') throw new Error('成长候选已经处理过');
    const actor = mode === 'test' ? 'desktop-test' : (session?.actor || 'desktop');
    if (action === 'reject') {
      db.prepare("UPDATE growth_candidates SET status='rejected', reviewed_at=?, reason=? WHERE id=?")
        .run(Date.now(), String(reason || 'manual reject').slice(0, 300), Number(id));
      const after = db.prepare('SELECT * FROM growth_candidates WHERE id=?').get(Number(id));
      addChangeAudit(db, { tableName: 'growth_candidates', rowId: Number(id), action: 'reject', before: c, after, actor, reason });
      db.exec('COMMIT');
      return { ok: true, action: 'reject', id: Number(id) };
    }
    if (c.reconcile_state !== 'current' || c.basis_cursor == null) {
      throw new Error('这条旧候选缺少可核对证据，不能直接采纳；可以选择拒绝');
    }
    const t = db.prepare('SELECT * FROM traits WHERE trait_key=?').get(c.trait_key);
    if (!t) throw new Error('对应性格特质不存在');
    if (Math.abs(Number(t.strength) - Number(c.before_strength)) > 0.005) {
      db.prepare("UPDATE growth_candidates SET reconcile_state='stale', stale_reason=? WHERE id=?")
        .run(`候选 before=${Number(c.before_strength).toFixed(3)}，当前 ${Number(t.strength).toFixed(3)}`, Number(id));
      throw new Error(`候选已过期：当前强度 ${Number(t.strength).toFixed(3)}，候选基于 ${Number(c.before_strength).toFixed(3)}`);
    }
    const now = Date.now();
    const beforeStrength = Number(t.strength);
    const afterStrength = Math.max(0, Math.min(1, Number(c.proposed_strength)));
    const nextStatus = c.kind === 'review' && t.status === 'rejected' ? 'active' : t.status;
    db.prepare('UPDATE traits SET strength=?, status=?, evidence_cursor=MAX(COALESCE(evidence_cursor,0), COALESCE(?,0)), updated_at=? WHERE trait_key=?')
      .run(afterStrength, nextStatus, Number(c.basis_cursor) || null, now, c.trait_key);
    db.prepare("UPDATE growth_candidates SET status='applied', applied_at=?, reviewed_at=?, reconcile_state='applied', stale_reason=NULL WHERE id=?")
      .run(now, now, Number(id));
    const consumed = Number(db.prepare('SELECT COUNT(*) c FROM trait_evidence WHERE trait_key=? AND id<=?').get(c.trait_key, Number(c.basis_cursor) || 0).c);
    const unconsumed = Number(db.prepare('SELECT COUNT(*) c FROM trait_evidence WHERE trait_key=? AND id>?').get(c.trait_key, Number(c.basis_cursor) || 0).c);
    db.prepare(`INSERT OR REPLACE INTO growth_reconcile
      (candidate_id, trait_key, state, snapshot_evidence_count, current_evidence_count, consumed_total, unconsumed_total, ambiguous_total, note, created_at, updated_at)
      VALUES(?,?, 'applied', ?, ?, ?, ?, 0, ?, ?, ?)`).run(
      Number(id), c.trait_key, Number(c.evidence_count) || 0, consumed + unconsumed, consumed, unconsumed, '桌面人工采纳', now, now
    );
    const evIds = db.prepare('SELECT id FROM trait_evidence WHERE trait_key=? ORDER BY id DESC LIMIT 20').all(c.trait_key).map((r) => r.id);
    db.prepare('INSERT INTO trait_versions(trait_key, before_strength, after_strength, reason, evidence_ids, source, at) VALUES(?,?,?,?,?,?,?)')
      .run(c.trait_key, beforeStrength, afterStrength, String(reason || '桌面人工采纳').slice(0, 300), JSON.stringify(evIds), 'manual', now);
    db.prepare(`INSERT INTO growth_journal(at, kind, summary, detail, trait_key, before_state, after_state, evidence_ids, confidence, verified, source)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
      now, 'trait_shift', `${t.name || c.trait_key} 经人工采纳增强`, `${beforeStrength.toFixed(2)} → ${afterStrength.toFixed(2)}`, c.trait_key, String(beforeStrength.toFixed(2)), String(afterStrength.toFixed(2)), JSON.stringify(evIds), 1, 1, 'manual'
    );
    const after = db.prepare('SELECT * FROM growth_candidates WHERE id=?').get(Number(id));
    addChangeAudit(db, { tableName: 'growth_candidates', rowId: Number(id), action: 'apply', before: c, after, actor, reason });
    db.exec('COMMIT');
    return { ok: true, action: 'apply', id: Number(id), trait: c.trait_key, before: beforeStrength, after: afterStrength };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  } finally { try { db.close(); } catch { /* ignore */ } }
}

function listAudit({ settings, paths, candidateId = null, limit = 50 }) {
  const file = memoryDbPath(settings);
  if (!fs.existsSync(file)) return { exists: false, rows: [] };
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    ensureReviewSchemaReadOnly(db);
    const rows = candidateId
      ? db.prepare('SELECT * FROM memory_review_audit WHERE candidate_id=? ORDER BY id DESC LIMIT ?').all(Number(candidateId), Math.min(100, Number(limit) || 50))
      : db.prepare('SELECT * FROM memory_review_audit ORDER BY id DESC LIMIT ?').all(Math.min(100, Number(limit) || 50));
    return { exists: true, rows };
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

function ensureReviewSchemaReadOnly(db) {
  try { db.prepare('SELECT 1 FROM memory_review_audit LIMIT 1').get(); } catch { return false; }
  return true;
}

async function reviewProductionCandidate({
  settings, paths, id, action, edit = null, reason = '', requestId = null, traceId = null, token
}) {
  requireUnlocked(token);
  const file = memoryDbPath(settings);
  if (!fs.existsSync(file)) throw new Error('生产记忆库不存在');
  const candidateId = Number(id) || 0;
  if (!candidateId) throw new Error('候选 ID 无效');
  const request = String(requestId || crypto.randomUUID());
  const trace = String(traceId || `review-${candidateId}-${Date.now()}`);
  const localExtractor = path.join(settings.repoRoot, 'src', 'memory', 'extractor.js');
  const bundledExtractor = path.join(process.resourcesPath || '', 'qq-bridge', 'src', 'memory', 'extractor.js');
  const devExtractor = path.join(__dirname, '..', '..', 'vendor', 'qq-bridge', 'src', 'memory', 'extractor.js');
  let extractor = localExtractor;
  try {
    const text = fs.readFileSync(extractor, 'utf8');
    if (!text.includes('transaction = true')) extractor = fs.existsSync(bundledExtractor) ? bundledExtractor : devExtractor;
  } catch {
    extractor = fs.existsSync(bundledExtractor) ? bundledExtractor : devExtractor;
  }
  const { applyCandidate } = await import(pathToFileURL(extractor).href);
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout=8000');
  ensureReviewSchema(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    const duplicate = db.prepare('SELECT * FROM memory_review_audit WHERE request_id=?').get(request);
    if (duplicate) {
      db.exec('COMMIT');
      return { ok: true, already: true, traceId: duplicate.trace_id, audit: duplicate };
    }
    const candidate = db.prepare('SELECT * FROM memory_candidates WHERE id=?').get(candidateId);
    if (!candidate) throw new Error(`候选 #${candidateId} 不存在`);

    if (action === 'apply') {
      if (candidate.status === 'applied') {
        db.exec('COMMIT');
        return { ok: true, already: true, traceId: trace, candidateId, status: 'applied' };
      }
      if (candidate.status !== 'pending') throw new Error(`候选状态为 ${candidate.status}，不能批准`);
      const result = applyCandidate(db, candidateId, {
        reason: reason || 'desktop production review',
        transaction: false,
        audit: ({ refType, refId }) => writeAudit(db, {
          requestId: request, traceId: trace, action: 'apply', candidate,
          statusAfter: 'applied', refType, refId, reason
        })
      });
      db.exec('COMMIT');
      return { ok: true, traceId: trace, candidateId, status: 'applied', refType: result.refType, refId: result.refId };
    }

    if (action === 'reject') {
      if (candidate.status !== 'pending') throw new Error(`候选状态为 ${candidate.status}，不能拒绝`);
      db.prepare("UPDATE memory_candidates SET status='rejected', reason=? WHERE id=? AND status='pending'")
        .run(reason || 'desktop rejected', candidateId);
      writeAudit(db, { requestId: request, traceId: trace, action: 'reject', candidate, statusAfter: 'rejected', reason });
    } else if (action === 'edit') {
      if (candidate.status !== 'pending') throw new Error('只能编辑待审候选');
      const allowed = ['summary', 'detail', 'attr', 'value', 'confidence', 'scope', 'visibility', 'happened_at', 'time_precision', 'category'];
      const changes = {};
      for (const key of allowed) {
        if (!edit || !Object.prototype.hasOwnProperty.call(edit, key)) continue;
        let value = edit[key];
        if (['confidence'].includes(key)) value = Math.max(0, Math.min(1, Number(value)));
        else if (['happened_at'].includes(key)) value = Number(value) || null;
        else value = value == null ? null : String(value).slice(0, 500);
        changes[key] = value;
      }
      if (!Object.keys(changes).length) throw new Error('没有可编辑字段');
      const sets = Object.keys(changes).map((key) => `${key}=?`).join(', ');
      db.prepare(`UPDATE memory_candidates SET ${sets} WHERE id=? AND status='pending'`)
        .run(...Object.values(changes), candidateId);
      writeAudit(db, { requestId: request, traceId: trace, action: 'edit', candidate, statusAfter: 'pending', changes: Object.keys(changes) });
    } else if (action === 'undo') {
      if (candidate.status !== 'applied') throw new Error('只能撤销已应用的候选');
      if (candidate.applied_ref_type === 'fact') {
        db.prepare("UPDATE facts SET status='retracted', source_key=NULL, valid_to=?, updated_at=? WHERE id=?")
          .run(Date.now(), Date.now(), Number(candidate.applied_ref_id));
      } else if (candidate.applied_ref_type === 'event') {
        db.prepare('UPDATE events SET retracted_at=?, source_key=NULL WHERE id=?')
          .run(Date.now(), Number(candidate.applied_ref_id));
      }
      db.prepare(`UPDATE memory_candidates SET status='pending', applied_at=NULL,
        applied_ref_type=NULL, applied_ref_id=NULL, reason=? WHERE id=? AND status='applied'`)
        .run(reason || 'desktop undo', candidateId);
      writeAudit(db, {
        requestId: request, traceId: trace, action: 'undo', candidate, statusAfter: 'pending',
        refType: candidate.applied_ref_type, refId: candidate.applied_ref_id, reason
      });
    } else {
      throw new Error('未知审核操作');
    }
    db.exec('COMMIT');
    return { ok: true, traceId: trace, candidateId, status: action === 'edit' ? 'pending' : action === 'undo' ? 'pending' : 'rejected' };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

module.exports = {
  UNLOCK_PHRASE, unlockProductionReview, requireUnlocked,
  reviewProductionCandidate, listAudit, ensureReviewSchema,
  editConfirmed, createConfirmed, deleteConfirmed, restoreConfirmed, reviewGrowthCandidate, listChangeAudit, ensureConfirmedSchema
};
