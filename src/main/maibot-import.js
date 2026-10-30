'use strict';

/**
 * Generic MaiBot memory importer.
 *
 * MaiBot's memory model is not the same as Memory V4. The safe conversion is
 * one-way and review-first: every source row becomes a pending event candidate.
 * Nothing is written to facts/events/traits, so personality and the existing
 * memory baseline cannot be overwritten by an import.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const MAX_IMPORT_ROWS = 10000;
const MAX_TEXT = 2000;

function clip(value, max = MAX_TEXT) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function tableColumns(db, table) {
  try {
    return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
  } catch {
    return new Set();
  }
}

function tableNames(db) {
  try {
    return new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name));
  } catch {
    return new Set();
  }
}

function parseWhen(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  const text = String(value).trim();
  if (/^\d{10,13}$/.test(text)) {
    const n = Number(text);
    return n < 1e12 ? n * 1000 : n;
  }
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  let ms = Date.parse(normalized);
  if (!Number.isFinite(ms) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
    ms = Date.parse(`${normalized}+08:00`);
  }
  return Number.isFinite(ms) ? ms : null;
}

function parseParticipants(value) {
  if (Array.isArray(value)) return value.map(String).filter((x) => /^\d{5,12}$/.test(x)).slice(0, 10);
  const text = String(value || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(String).filter((x) => /^\d{5,12}$/.test(x)).slice(0, 10);
  } catch { /* not JSON */ }
  return (text.match(/\d{5,12}/g) || []).slice(0, 10);
}

function sourceFingerprint(sourcePath) {
  return crypto.createHash('sha1').update(path.resolve(sourcePath)).digest('hex').slice(0, 12);
}

function detectSource(db) {
  const names = tableNames(db);
  if (names.has('chat_history')) {
    const cols = tableColumns(db, 'chat_history');
    const chat = ['chat_id', 'session_id'].find((name) => cols.has(name));
    const start = ['start_time', 'start_timestamp'].find((name) => cols.has(name));
    const end = ['end_time', 'end_timestamp'].find((name) => cols.has(name));
    const summary = ['summary', 'content', 'theme'].find((name) => cols.has(name));
    if (!chat || !summary) throw new Error('chat_history 缺少 chat_id/session_id 或 summary/content 字段');
    return { table: 'chat_history', cols, chat, start, end, summary, id: cols.has('id') ? 'id' : 'rowid' };
  }
  if (names.has('paragraphs')) {
    const cols = tableColumns(db, 'paragraphs');
    if (!cols.has('content')) throw new Error('paragraphs 缺少 content 字段');
    return {
      table: 'paragraphs', cols,
      chat: cols.has('source') ? 'source' : null,
      start: cols.has('event_time_start') ? 'event_time_start' : 'event_time',
      end: cols.has('event_time_end') ? 'event_time_end' : null,
      summary: 'content',
      id: cols.has('hash') ? 'hash' : 'rowid'
    };
  }
  throw new Error('无法识别 MaiBot 数据库：没有 chat_history 或 paragraphs 表');
}

function participantMap(db) {
  const map = new Map();
  for (const table of ['chat_streams', 'chat_sessions']) {
    try {
      const cols = tableColumns(db, table);
      const id = cols.has('stream_id') ? 'stream_id' : cols.has('session_id') ? 'session_id' : null;
      if (!id) continue;
      const group = cols.has('group_id') ? 'group_id' : null;
      const user = cols.has('user_id') ? 'user_id' : null;
      if (!group && !user) continue;
      const fields = [id, group, user].filter(Boolean);
      for (const row of db.prepare(`SELECT ${fields.join(',')} FROM ${table}`).all()) {
        const key = String(row[id] || '');
        if (!key) continue;
        map.set(key, {
          group: group ? String(row[group] || '') : '',
          user: user ? String(row[user] || '') : ''
        });
      }
    } catch { /* optional mapping table */ }
  }
  return map;
}

function mapScope(rawChatId, map) {
  const raw = String(rawChatId || '').trim();
  if (!raw) return { scope: 'maibot:unknown', convKey: 'maibot:unknown', visibility: 'group' };
  if (/^group[:/]/i.test(raw)) return { scope: raw.replace(':', ':'), convKey: raw.replace(':', ':'), visibility: 'group' };
  if (/^private[:/]/i.test(raw)) return { scope: raw.replace(':', ':'), convKey: raw.replace(':', ':'), visibility: 'private' };
  const mapped = map.get(raw);
  if (mapped?.group) return { scope: `group:${mapped.group}`, convKey: `group:${mapped.group}`, visibility: 'group' };
  if (mapped?.user) return { scope: `private:${mapped.user}`, convKey: `private:${mapped.user}`, visibility: 'private' };
  return { scope: `maibot:${raw}`, convKey: `maibot:${raw}`, visibility: 'group' };
}

function mapRow(db, source, row, ctx) {
  const summary = clip(row[source.summary], 600);
  if (!summary) return null;
  const detailParts = [];
  for (const name of ['theme', 'keywords', 'source', 'metadata']) {
    if (!source.cols.has(name)) continue;
    const value = clip(row[name], 800);
    if (value && value !== summary && !detailParts.includes(value)) detailParts.push(value);
  }
  const chatId = source.chat ? row[source.chat] : '';
  const scope = mapScope(chatId, ctx.streamMap);
  const start = source.start && source.cols.has(source.start) ? parseWhen(row[source.start]) : null;
  const end = source.end && source.cols.has(source.end) ? parseWhen(row[source.end]) : null;
  const happenedAt = start || end || null;
  const rawId = row[source.id];
  const sourceId = rawId == null ? `${row.__rowid}` : String(rawId);
  return {
    summary,
    detail: detailParts.join(' · ').slice(0, 1200) || null,
    participants: parseParticipants(source.cols.has('participants') ? row.participants : null),
    confidence: 0.6,
    scope: scope.scope,
    visibility: scope.visibility,
    convKey: scope.convKey,
    happenedAt,
    timePrecision: happenedAt ? (start && end && end - start > 86400000 ? 'approx' : 'day') : 'unknown',
    dedupeKey: `maibot:${ctx.fingerprint}:${source.table}:${sourceId}`,
    batchKey: ctx.batchKey,
    sourceId,
    traceId: `maibot-${ctx.fingerprint}`
  };
}

function openSource(sourcePath) {
  const file = path.resolve(String(sourcePath || ''));
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('MaiBot 数据库不存在');
  const db = new DatabaseSync(file, { readOnly: true });
  try { db.exec('PRAGMA query_only=ON'); } catch { /* ignore */ }
  return { db, file };
}

function rowsFor(source, db, limit) {
  const columns = ['*'];
  if (source.id === 'rowid') columns.unshift('rowid AS __rowid');
  // SELECT id/rowid plus all known columns; rowid aliases are harmless.
  const select = source.id === 'rowid' ? 'rowid AS __rowid, *' : '*';
  const sql = `SELECT ${select} FROM ${source.table} LIMIT ?`;
  return db.prepare(sql).all(Math.max(1, Math.min(MAX_IMPORT_ROWS, Number(limit) || MAX_IMPORT_ROWS)));
}

function countRows(source, db) {
  try {
    return Number(db.prepare(`SELECT COUNT(*) AS c FROM ${source.table}`).get().c);
  } catch {
    return 0;
  }
}

function previewMaiBotImport({ sourcePath, limit = 20 } = {}) {
  const { db, file } = openSource(sourcePath);
  try {
    const source = detectSource(db);
    const total = countRows(source, db);
    const sample = rowsFor(source, db, limit)
      .map((row) => {
        const mapped = mapRow(db, source, row, {
          fingerprint: sourceFingerprint(file),
          batchKey: '',
          streamMap: participantMap(db)
        });
        return mapped ? {
          summary: mapped.summary,
          detail: mapped.detail,
          happenedAt: mapped.happenedAt,
          scope: mapped.scope,
          visibility: mapped.visibility
        } : null;
      })
      .filter(Boolean);
    return {
      ok: true,
      sourcePath: file,
      table: source.table,
      total,
      importable: Math.min(total, MAX_IMPORT_ROWS),
      truncated: total > MAX_IMPORT_ROWS,
      sample
    };
  } finally {
    db.close();
  }
}

function ensureTargetSchema(target) {
  const cols = tableColumns(target, 'memory_candidates');
  if (!cols.size) throw new Error('目标库缺少 memory_candidates，请先启动一次记忆系统完成建表');
  const required = ['kind', 'summary', 'dedupe_key', 'status', 'source_type', 'created_at'];
  const missing = required.filter((name) => !cols.has(name));
  if (missing.length) throw new Error(`目标库 memory_candidates 缺少字段：${missing.join(', ')}`);
  return cols;
}

function importMaiBot({ sourcePath, targetPath, limit = MAX_IMPORT_ROWS, backupDir = null } = {}) {
  if (!targetPath) throw new Error('缺少目标记忆数据库路径');
  const { db: sourceDb, file } = openSource(sourcePath);
  let target = null;
  try {
    const source = detectSource(sourceDb);
    const total = countRows(source, sourceDb);
    target = new DatabaseSync(targetPath);
    target.exec('PRAGMA busy_timeout=8000');
    const cols = ensureTargetSchema(target);
    const fingerprint = sourceFingerprint(file);
    const batchKey = `maibot-${Date.now()}`;
    const streamMap = participantMap(sourceDb);
    const rows = rowsFor(source, sourceDb, limit);
    let backupPath = null;
    if (backupDir) {
      fs.mkdirSync(backupDir, { recursive: true });
      backupPath = path.join(backupDir, `maibot-import-${Date.now()}.db`);
      const escaped = backupPath.replace(/'/g, "''");
      target.exec(`VACUUM INTO '${escaped}'`);
    }
    let imported = 0;
    let duplicates = 0;
    let skipped = 0;
    target.exec('BEGIN IMMEDIATE');
    try {
      const insert = target.prepare(`INSERT OR IGNORE INTO memory_candidates
        (kind, summary, detail, participants, confidence, scope, visibility,
         dedupe_key, batch_key, conv_key, source_type, status, reason, quality, category,
         evidence_count, self_stated, expires_at, happened_at, time_precision, created_at${cols.has('trace_id') ? ', trace_id' : ''})
        VALUES('event',?,?,?,?,?,?,?,?,?,'maibot','pending',?,?,?,?,?,?,?,?,?${cols.has('trace_id') ? ',?' : ''})`);
      for (const row of rows) {
        const mapped = mapRow(sourceDb, source, row, { fingerprint, batchKey, streamMap });
        if (!mapped) { skipped += 1; continue; }
        const values = [
          mapped.summary, mapped.detail, JSON.stringify(mapped.participants), mapped.confidence,
          mapped.scope, mapped.visibility, mapped.dedupeKey, mapped.batchKey, mapped.convKey,
          'MaiBot 导入，待人工审核', 'review', 'social', 1, 0, null,
          mapped.happenedAt, mapped.timePrecision, Date.now()
        ];
        if (cols.has('trace_id')) values.push(mapped.traceId);
        const info = insert.run(...values);
        if (Number(info.changes) > 0) imported += 1; else duplicates += 1;
      }
      target.exec('COMMIT');
    } catch (error) {
      try { target.exec('ROLLBACK'); } catch { /* ignore */ }
      throw error;
    }
    return {
      ok: true,
      sourcePath: file,
      targetPath: path.resolve(targetPath),
      table: source.table,
      total,
      imported,
      duplicates,
      skipped,
      truncated: total > rows.length,
      backupPath
    };
  } finally {
    try { sourceDb.close(); } catch { /* ignore */ }
    try { target?.close(); } catch { /* ignore */ }
  }
}

module.exports = { previewMaiBotImport, importMaiBot, parseWhen, detectSource };
