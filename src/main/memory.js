'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');
const { readProjectConfig } = require('./paths');

const DAY_MS = 86400000;
const TZ = 8 * 3600000;

function memoryDbPath(settings) {
  const cfg = readProjectConfig(settings.repoRoot);
  const raw = cfg.memory?.dbPath || 'state/memory.db';
  return path.isAbsolute(raw) ? raw : path.join(settings.repoRoot, raw);
}

function dbFileInfo(file) {
  try {
    const st = fs.statSync(file);
    return { exists: true, size: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return { exists: false, size: 0, mtimeMs: 0 };
  }
}

function openReadonly(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try { db.exec('PRAGMA query_only=ON'); } catch { /* ignore */ }
  return db;
}

function escapeLike(value) {
  return String(value || '').replace(/[\\%_]/g, '\\$&');
}

function tableColumns(db, table) {
  try { return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)); } catch { return new Set(); }
}

function optional(cols, name, fallback = 'NULL') {
  return cols.has(name) ? name : `${fallback} AS ${name}`;
}

function dayStart(text) {
  if (!text) return null;
  const t = Date.parse(`${text}T00:00:00+08:00`);
  return Number.isFinite(t) ? t : null;
}

function dayEnd(text) {
  const start = dayStart(text);
  return start == null ? null : start + DAY_MS - 1;
}

function readStats(db, limit = 7) {
  try {
    return db.prepare('SELECT * FROM extract_stats ORDER BY day DESC LIMIT ?').all(limit);
  } catch {
    return [];
  }
}

function readFailures(db, limit = 8) {
  try {
    return db.prepare(`SELECT batch_key, conv_key, status, attempts, last_error, updated_at
      FROM extraction_batches WHERE status='failed' ORDER BY updated_at DESC LIMIT ?`).all(limit);
  } catch {
    return [];
  }
}

function memoryStatus({ settings, paths, mode = 'prod' }) {
  const prodPath = memoryDbPath(settings);
  const file = mode === 'test' ? paths.memoryTestDb : prodPath;
  const cfg = readProjectConfig(settings.repoRoot);
  const out = {
    mode,
    dbPath: file,
    testDbPath: paths.memoryTestDb,
    testDbExists: fs.existsSync(paths.memoryTestDb),
    exists: fs.existsSync(file),
    observeOnly: cfg.memory?.observeOnly !== false,
    retrieval: cfg.memory?.retrieval === true,
    extract: cfg.memory?.extract === true,
    ingest: cfg.memory?.ingest === true,
    model: cfg.memory?.model || '',
    counts: { facts: 0, events: 0, messages: 0, pending: 0, applied: 0 },
    growth: {
      activeTraits: 0,
      candidateTraits: 0,
      pendingCandidates: 0,
      autoApplyExpression: cfg.growth?.autoApplyExpression !== false
    },
    file: dbFileInfo(file),
    wal: dbFileInfo(`${file}-wal`),
    integrity: null,
    stats: [],
    failures: [],
    error: null
  };
  if (!out.exists) return out;
  let db;
  try {
    db = openReadonly(file);
    const one = (sql) => Number(db.prepare(sql).get()?.c || 0);
    out.counts = {
      facts: one("SELECT COUNT(*) c FROM facts WHERE status='active'"),
      events: one('SELECT COUNT(*) c FROM events'),
      messages: one('SELECT COUNT(*) c FROM messages'),
      pending: one("SELECT COUNT(*) c FROM memory_candidates WHERE status='pending'"),
      applied: one("SELECT COUNT(*) c FROM memory_candidates WHERE status='applied'")
    };
    out.integrity = db.prepare('PRAGMA quick_check(1)').get()?.quick_check || 'unknown';
    const growthOne = (sql) => { try { return Number(db.prepare(sql).get()?.c || 0); } catch { return 0; } };
    out.growth = {
      ...out.growth,
      activeTraits: growthOne("SELECT COUNT(*) c FROM traits WHERE status='active'"),
      candidateTraits: growthOne("SELECT COUNT(*) c FROM traits WHERE status='candidate'"),
      pendingCandidates: growthOne("SELECT COUNT(*) c FROM growth_candidates WHERE status='pending'")
    };
    out.stats = readStats(db);
    out.failures = readFailures(db);
    db.close();
  } catch (error) {
    out.error = error.message;
    try { db?.close(); } catch { /* ignore */ }
  }
  return out;
}

function listMemory({ settings, paths, mode = 'prod', type = 'candidates', q = '', dateFrom = '', dateTo = '', subject = '', status = 'pending', limit = 50, offset = 0, sort = 'newest' }) {
  const file = mode === 'test' ? paths.memoryTestDb : memoryDbPath(settings);
  if (!fs.existsSync(file)) return { exists: false, type, rows: [], total: 0 };
  const take = Math.max(1, Math.min(100, Number(limit) || 50));
  const skip = Math.max(0, Number(offset) || 0);
  const term = q ? `%${escapeLike(q)}%` : null;
  const from = dayStart(dateFrom);
  const to = dayEnd(dateTo);
  const db = openReadonly(file);
  try {
    if (type === 'facts') {
      const where = [];
      const params = [];
      if (term) { where.push("(COALESCE(subject_name,'') LIKE ? ESCAPE '\\' OR COALESCE(subject_qq,'') LIKE ? ESCAPE '\\' OR attr LIKE ? ESCAPE '\\' OR value LIKE ? ESCAPE '\\')"); params.push(term, term, term, term); }
      if (subject) { where.push("(subject_qq LIKE ? ESCAPE '\\' OR subject_name LIKE ? ESCAPE '\\')"); params.push(`%${escapeLike(subject)}%`, `%${escapeLike(subject)}%`); }
      if (from != null) { where.push('created_at >= ?'); params.push(from); }
      if (to != null) { where.push('created_at <= ?'); params.push(to); }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const factCols = tableColumns(db, 'facts');
      const total = Number(db.prepare(`SELECT COUNT(*) c FROM facts ${clause}`).get(...params)?.c || 0);
      const rows = db.prepare(`SELECT id, subject_qq, subject_name, attr, value, kind, confidence, scope, visibility, status,
        ${optional(factCols, 'importance', '0.5')}, ${optional(factCols, 'activation', '1')},
        ${optional(factCols, 'lifecycle_state', "'active'")}, ${optional(factCols, 'last_recalled_at')},
        created_at, updated_at, source_type
        FROM facts ${clause} ORDER BY updated_at DESC LIMIT ? OFFSET ?`).all(...params, take, skip);
      return { exists: true, type, total, rows: rows.map((r) => ({ ...r, type: 'fact' })) };
    }
    if (type === 'events') {
      const eventCols = tableColumns(db, 'events');
      const where = [];
      const params = [];
      if (eventCols.has('retracted_at')) where.push('retracted_at IS NULL');
      if (term) { where.push("(summary LIKE ? ESCAPE '\\' OR COALESCE(detail,'') LIKE ? ESCAPE '\\' OR COALESCE(participants,'') LIKE ? ESCAPE '\\')"); params.push(term, term, term); }
      if (subject) { where.push("participants LIKE ? ESCAPE '\\'"); params.push(`%${escapeLike(subject)}%`); }
      if (from != null) { where.push('happened_at >= ?'); params.push(from); }
      if (to != null) { where.push('happened_at <= ?'); params.push(to); }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = Number(db.prepare(`SELECT COUNT(*) c FROM events ${clause}`).get(...params)?.c || 0);
      const rows = db.prepare(`SELECT id, happened_at, ${optional(eventCols, 'time_precision', "'unknown'")}, summary, detail, participants,
        confidence, scope, visibility, source_type, source_conv, created_at,
        ${optional(eventCols, 'importance', '0.5')}, ${optional(eventCols, 'activation', '1')},
        ${optional(eventCols, 'lifecycle_state', "'active'")}, ${optional(eventCols, 'last_recalled_at')}
        FROM events ${clause} ORDER BY happened_at DESC, id DESC LIMIT ? OFFSET ?`).all(...params, take, skip);
      return { exists: true, type, total, rows: rows.map((r) => ({ ...r, type: 'event' })) };
    }
    // candidates
    const candCols = tableColumns(db, 'memory_candidates');
    const where = [];
    const params = [];
    if (status === 'pending' || status === 'applied' || status === 'rejected') { where.push('status=?'); params.push(status); }
    if (term) { where.push("(COALESCE(summary,'') LIKE ? ESCAPE '\\' OR COALESCE(value,'') LIKE ? ESCAPE '\\' OR COALESCE(attr,'') LIKE ? ESCAPE '\\' OR COALESCE(subject_name,'') LIKE ? ESCAPE '\\')"); params.push(term, term, term, term); }
    if (subject) { where.push("(subject_qq LIKE ? ESCAPE '\\' OR subject_name LIKE ? ESCAPE '\\')"); params.push(`%${escapeLike(subject)}%`, `%${escapeLike(subject)}%`); }
    if (from != null || to != null) {
      const a = from ?? 0; const b = to ?? 9e15;
      if (candCols.has('happened_at')) {
        where.push("((kind='event' AND happened_at BETWEEN ? AND ?) OR (kind='fact' AND created_at BETWEEN ? AND ?))");
        params.push(a, b, a, b);
      } else {
        where.push('created_at BETWEEN ? AND ?');
        params.push(a, b);
      }
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = Number(db.prepare(`SELECT COUNT(*) c FROM memory_candidates ${clause}`).get(...params)?.c || 0);
    const order = sort === 'oldest' ? 'id ASC' : sort === 'confidence' ? 'confidence DESC, id DESC' : sort === 'happened' ? 'COALESCE(happened_at, created_at) DESC, id DESC' : 'id DESC';
    const rows = db.prepare(`SELECT id, kind, status, subject_qq, subject_name, attr, value, summary, detail, participants,
      confidence, scope, visibility, quality, reason, ${optional(candCols, 'happened_at')}, ${optional(candCols, 'time_precision', "'unknown'")},
      batch_key, conv_key, created_at, ${optional(candCols, 'applied_at')}
      FROM memory_candidates ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, take, skip);
    return { exists: true, type, total, rows: rows.map((r) => ({ ...r, type: 'candidate' })) };
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

function getCandidate({ settings, paths, mode = 'prod', id }) {
  const file = mode === 'test' ? paths.memoryTestDb : memoryDbPath(settings);
  if (!fs.existsSync(file)) return { exists: false, candidate: null, evidence: [] };
  const db = openReadonly(file);
  try {
    const candCols = tableColumns(db, 'memory_candidates');
    const candidate = db.prepare(`SELECT id, kind, status, subject_qq, subject_name, attr, value, summary, detail, participants,
      confidence, scope, visibility, quality, reason, ${optional(candCols, 'happened_at')}, ${optional(candCols, 'time_precision', "'unknown'")},
      batch_key, conv_key, created_at, ${optional(candCols, 'applied_at')}, ${optional(candCols, 'applied_ref_type')}, ${optional(candCols, 'applied_ref_id')}
      FROM memory_candidates WHERE id=?`).get(Number(id));
    if (!candidate) return { exists: true, candidate: null, evidence: [] };
    let evidence = [];
    if (candidate.batch_key) {
      evidence = db.prepare(`SELECT id, seq, sender_qq, sender_name, text, media_note, sent_at, is_self, is_owner
        FROM messages WHERE batch_key=? ORDER BY id LIMIT 30`).all(candidate.batch_key);
    }
    return { exists: true, candidate, evidence };
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

async function initTestDb({ settings, paths, reset = false }) {
  const file = paths.memoryTestDb;
  if (fs.existsSync(file) && !reset) return { exists: true, created: false, dbPath: file };
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${file}${suffix}`, { force: true }); } catch { /* ignore */ }
  }
  const { openMemoryDb } = await import(pathToFileURL(path.join(settings.repoRoot, 'src', 'memory', 'db.js')).href);
  const { ensureExtractSchema } = await import(pathToFileURL(path.join(settings.repoRoot, 'src', 'memory', 'extractor.js')).href);
  const db = openMemoryDb(file);
  ensureExtractSchema(db);
  const now = Date.now();
  const conv = 'private:100000000';
  const batchKey = 'desktop-test-batch';
  db.prepare(`INSERT INTO messages(conv_key, msg_key, seq, sender_qq, sender_name, text, sent_at, is_self, is_owner, extracted, batch_key)
    VALUES(?,?,?,?,?,?,?,0,1,1,?)`).run(conv, 'desktop-test-msg', 1, '100000000', '测试用户', '这是隔离测试库的合成消息，不包含真实聊天。', now - 2 * DAY_MS, batchKey);
  db.prepare(`INSERT INTO memory_candidates(id, kind, summary, detail, participants, confidence, scope, visibility, quality,
    dedupe_key, batch_key, conv_key, source_type, status, happened_at, time_precision, created_at)
    VALUES(1,'event','一起整理了桌面（测试事件）','合成测试候选，用于验证审核按钮，不包含真实内容。','["100000000"]',0.7,?, 'private','valid','desktop-test-event',?,?, 'desktop-test','pending',?,'day',?)`)
    .run(conv, batchKey, conv, now - 2 * DAY_MS, now);
  db.prepare(`INSERT INTO memory_candidates(id, kind, subject_qq, subject_name, attr, value, confidence, scope, visibility, kind_of_fact,
    quality, dedupe_key, batch_key, conv_key, source_type, status, created_at)
    VALUES(2,'fact','100000000','测试用户','测试偏好','测试值',0.7,?, 'private','multi','valid','desktop-test-fact',?,?, 'desktop-test','pending',?)`)
    .run(conv, batchKey, conv, now);
  db.close();
  return { exists: true, created: true, dbPath: file };
}

async function reviewCandidate({ settings, paths, id, action = 'apply', reason = '' }) {
  const file = paths.memoryTestDb;
  if (!fs.existsSync(file)) throw new Error('隔离测试库不存在，请先初始化');
  if (!['apply', 'reject'].includes(action)) throw new Error('未知审核操作');
  const { applyCandidate, decideCandidate, ensureExtractSchema } = await import(pathToFileURL(path.join(settings.repoRoot, 'src', 'memory', 'extractor.js')).href);
  const db = new DatabaseSync(file);
  try {
    ensureExtractSchema(db);
    if (action === 'apply') return applyCandidate(db, Number(id), { reason: reason || 'desktop test review' });
    return decideCandidate(db, Number(id), 'reject', reason || 'desktop test review');
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

function memoryFile({ settings, paths, mode }) {
  return mode === 'test' ? paths.memoryTestDb : memoryDbPath(settings);
}

function listDeadLetters({ settings, paths, mode = 'prod' }) {
  const file = memoryFile({ settings, paths, mode });
  if (!fs.existsSync(file)) return { exists: false, rows: [] };
  let db;
  try {
    db = openReadonly(file);
    const rows = db.prepare(`SELECT batch_key, conv_key, message_ids, attempts, error, created_at
      FROM extract_dead_letters ORDER BY created_at DESC LIMIT 100`).all();
    return { exists: true, rows: rows.map((row) => ({
      ...row,
      messageCount: (() => { try { return JSON.parse(row.message_ids || '[]').length; } catch { return 0; } })()
    })) };
  } catch {
    return { exists: true, rows: [] };
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

function retryDeadLetter({ settings, paths, mode = 'prod', batchKey, confirm = false }) {
  if (confirm !== true) throw new Error('重试死信需要显式确认');
  if (!batchKey) throw new Error('batchKey 为空');
  const file = memoryFile({ settings, paths, mode });
  if (!fs.existsSync(file)) throw new Error('记忆库不存在');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout=8000');
  try {
    db.exec('BEGIN');
    try {
      const row = db.prepare('SELECT * FROM extract_dead_letters WHERE batch_key=?').get(String(batchKey));
      if (!row) throw new Error('死信批次不存在或已重试');
      const ids = JSON.parse(row.message_ids || '[]').map(Number).filter(Number.isFinite);
      if (ids.length) db.prepare(`UPDATE messages SET extracted=0 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
      db.prepare('DELETE FROM extract_dead_letters WHERE batch_key=?').run(String(batchKey));
      db.exec('COMMIT');
      return { ok: true, batchKey: String(batchKey), messages: ids.length };
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw error;
    }
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

module.exports = {
  memoryDbPath,
  memoryStatus,
  listMemory,
  getCandidate,
  initTestDb,
  reviewCandidate,
  listDeadLetters,
  retryDeadLetter,
  dayStart,
  dayEnd
};
