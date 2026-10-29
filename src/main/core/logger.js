'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SECRET_RE = /(token|password|secret|authorization|cookie|api[_-]?key|console[_-]?key)\s*[=:]\s*\S+/gi;
const SENSITIVE_KEY = /(token|password|secret|authorization|cookie|api[_-]?key|console[_-]?key)/i;

function redact(value) {
  return String(value || '')
    .replace(/Authorization:\s*Bearer\s+\S+/gi, 'Authorization: Bearer <redacted>')
    .replace(SECRET_RE, '$1=<redacted>')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer <redacted>')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-<redacted>');
}

function redactValue(value, key = '', depth = 0) {
  if (depth > 6) return '<redacted>';
  if (SENSITIVE_KEY.test(String(key))) return '<redacted>';
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, '', depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactValue(v, k, depth + 1);
    return out;
  }
  return value;
}

function createStructuredLogger({ file, maxBytes = 2 * 1024 * 1024, now = Date.now } = {}) {
  if (!file) throw new Error('log file is required');
  function write(level, event, fields = {}) {
    const row = {
      at: now(),
      level: String(level || 'info'),
      event: String(event || 'event'),
      ...redactValue(fields, '', 0)
    };
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (fs.existsSync(file) && fs.statSync(file).size > maxBytes) fs.rmSync(file, { force: true });
      fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf8');
    } catch { /* logging must never break the app */ }
    return row;
  }
  return { write, file };
}

module.exports = { createStructuredLogger, redact, redactValue };
