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
  reviewProductionCandidate, listAudit, ensureReviewSchema
};
