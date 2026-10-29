'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SECRET_RE = /(token|password|secret|authorization|cookie)\s*[=:]\s*\S+/gi;

function redact(value) {
  return String(value || '')
    .replace(SECRET_RE, '$1=<redacted>')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-<redacted>');
}

function createStructuredLogger({ file, maxBytes = 2 * 1024 * 1024, now = Date.now } = {}) {
  if (!file) throw new Error('log file is required');
  function write(level, event, fields = {}) {
    const row = {
      at: now(),
      level: String(level || 'info'),
      event: String(event || 'event'),
      ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, typeof value === 'string' ? redact(value) : value]))
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

module.exports = { createStructuredLogger, redact };
