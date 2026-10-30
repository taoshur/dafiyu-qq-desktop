/**
 * Memory V4 recall: multi-signal candidate ranking + real token budget.
 * Factual truth is not changed here; archived rows stay retrievable with a penalty.
 */
import crypto from 'node:crypto';
import { searchMemory } from './db.js';
import { tokenize } from './tokenize.js';
import { lifecycleConfig, activationAt, lifecyclePenalty } from './lifecycle.js';

export const DEFAULT_RECALL = Object.freeze({
  relevance: 0.4,
  confidence: 0.25,
  importance: 0.15,
  time: 0.1,
  activation: 0.1
});

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function rowText(row, type) {
  if (type === 'event') return `${row.summary || ''} ${row.detail || ''} ${row.participants || ''}`;
  return `${row.attr || ''} ${row.value || ''} ${row.subject_name || ''}`;
}

function lexicalScore(row, type, queryTokens) {
  if (!queryTokens.length) return 0;
  const rowTokens = new Set(tokenize(rowText(row, type)));
  let hits = 0;
  for (const token of queryTokens) if (rowTokens.has(token)) hits += 1;
  return clamp(hits / Math.max(1, Math.min(queryTokens.length, 12)));
}

export function recordRecallDiagnostics(db, diagnostics) {
  if (!diagnostics) return;
  ensureRecallSchema(db);
  try {
    db.prepare(`INSERT INTO memory_recall_diagnostics
      (at, conv_hash, query_hash, candidate_count, selected_ids, tokens, filters, trace_id)
      VALUES(?,?,?,?,?,?,?,?)`).run(
      diagnostics.at, diagnostics.convHash, diagnostics.queryHash, diagnostics.candidateCount,
      JSON.stringify(diagnostics.selectedIds || []), Number(diagnostics.tokens) || 0, JSON.stringify(diagnostics.filters || {}), diagnostics.traceId || null
    );
  } catch { /* diagnostics must never break recall */ }
}

export function ensureRecallSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS memory_recall_diagnostics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    conv_hash TEXT,
    query_hash TEXT,
    candidate_count INTEGER NOT NULL DEFAULT 0,
    selected_ids TEXT,
    tokens INTEGER NOT NULL DEFAULT 0,
    filters TEXT,
    trace_id TEXT
  )`);
  const cols = db.prepare('PRAGMA table_info(memory_recall_diagnostics)').all().map((c) => c.name);
  if (!cols.includes('trace_id')) db.exec('ALTER TABLE memory_recall_diagnostics ADD COLUMN trace_id TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_recall_at ON memory_recall_diagnostics(at)');
  try { db.prepare('DELETE FROM memory_recall_diagnostics WHERE at < ?').run(Date.now() - 90 * 86400000); } catch { /* ignore */ }
}

export function scoreCandidate(item, { queryTokens = [], qqs = [], timeRange = null, now = Date.now(), config = {} } = {}) {
  const cfg = lifecycleConfig(config);
  const row = item.row;
  const type = item.type;
  const relevance = lexicalScore(row, type, queryTokens);
  const confidence = clamp(row.confidence ?? 0.5);
  const importance = clamp(row.importance ?? 0.5);
  const activation = clamp(activationAt(row, now, cfg));
  let time = 0;
  if (timeRange && type === 'event' && Number(row.happened_at) >= timeRange.from && Number(row.happened_at) <= timeRange.to) time = 1;
  else if (!timeRange) {
    const last = Number(row.happened_at) || Number(row.updated_at) || Number(row.created_at) || 0;
    if (last) time = clamp(1 / (1 + Math.max(0, now - last) / (30 * 86400000)));
  }
  const person = type === 'fact'
    ? (row.subject_qq != null && qqs.map(String).includes(String(row.subject_qq)) ? 1 : 0)
    : (String(row.participants || '').match(/\d{5,12}/g) || []).some((qq) => qqs.map(String).includes(qq)) ? 1 : 0;
  const weights = { ...DEFAULT_RECALL, ...(config.recallWeights || {}) };
  const score = weights.relevance * relevance
    + weights.confidence * confidence
    + weights.importance * importance
    + weights.time * time
    + weights.activation * activation
    + (person ? 0.08 : 0)
    - lifecyclePenalty(row, now, cfg);
  return { ...item, score, relevance, person, time, confidence, importance, activation, lifecycle: row.lifecycle_state || 'active' };
}

function dedupeKey(item) {
  const row = item.row;
  if (item.type === 'fact') return `f:${row.subject_qq || row.subject_name || ''}:${row.attr || ''}:${String(row.value || '').replace(/\s+/g, '').toLowerCase()}`;
  return `e:${String(row.summary || '').replace(/\s+/g, '').toLowerCase().slice(0, 80)}`;
}

export function recallMemoryV4(db, {
  convKey = 'global',
  speakerQqs = [],
  text = '',
  limit = 10,
  now = Date.now(),
  timeRange = null,
  selfQq = null,
  config = {},
  budgetTokens = 600
} = {}) {
  ensureRecallSchema(db);
  const queryTokens = tokenize(text).slice(0, 32);
  const pool = searchMemory(db, {
    convKey, qqs: speakerQqs, text, limit: Math.max(limit * 8, 40), now, timeRange, selfQq
  });
  const scored = pool.map((item) => scoreCandidate(item, {
    queryTokens, qqs: speakerQqs, timeRange, now, config
  })).sort((a, b) => b.score - a.score);
  const picked = [];
  const seen = new Set();
  const perSubject = new Map();
  const add = (item, { force = false } = {}) => {
    const key = dedupeKey(item);
    if (!force && seen.has(key)) return;
    if (item.type === 'fact') {
      const subject = String(item.row.subject_qq || item.row.subject_name || '');
      const used = perSubject.get(subject) || 0;
      if (used >= 3) return;
      perSubject.set(subject, used + 1);
    }
    seen.add(key);
    picked.push(item);
  };
  // A long-term, high-importance shared event should not be crowded out by
  // recent low-importance chatter. This is a protected slot, not a weight change.
  if (config.protectImportantRecall !== false) {
    const important = scored.filter((item) => item.type === 'event'
      && Number(item.row.importance) >= 0.8
      && Number(item.relevance) > 0
      && item.row.happened_at && now - Number(item.row.happened_at) > 30 * 86400000
    ).slice(0, 1);
    for (const item of important) add(item, { force: true });
  }
  // Time questions get at least two events before generic facts.
  if (timeRange) {
    for (const item of scored.filter((x) => x.type === 'event').slice(0, 2)) add(item, { force: true });
  }
  for (const item of scored) {
    add(item);
    if (picked.length >= limit) break;
  }
  // If there are no events but a time question, do not silently claim an exact answer.
  const diagnostics = {
    at: now,
    convHash: crypto.createHash('sha1').update(String(convKey)).digest('hex').slice(0, 16),
    queryHash: crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, 16),
    candidateCount: scored.length,
    selectedIds: picked.map((x) => `${x.type}:${x.row.id}`),
    tokens: 0,
    filters: {
      timeRange: timeRange ? { kind: timeRange.kind, from: timeRange.from, to: timeRange.to } : null,
      speakers: speakerQqs.length,
      budgetTokens
    }
  };
  // Persist only after the caller applies the real token budget; otherwise
  // the row would claim candidates that were never injected.
  return { picked, scored, diagnostics };
}
