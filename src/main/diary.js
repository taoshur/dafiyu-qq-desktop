'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function diaryFile(repoRoot) {
  return path.join(repoRoot, 'state', 'diary.db');
}

function readConfig(repoRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

function isEnabled(repoRoot) {
  const cfg = readConfig(repoRoot);
  return cfg?.socialV2?.diary?.enabled !== false;
}

function list(repoRoot, limit = 120) {
  const file = diaryFile(repoRoot);
  if (!fs.existsSync(file)) return [];
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare(`SELECT date,title,substr(body,1,180) AS preview,mood,source_messages,source_events,source_facts,updated_at
      FROM diary_entries ORDER BY date DESC LIMIT ?`).all(Math.max(1, Math.min(365, Number(limit) || 120)))
      .map((row) => {
        let mood = [];
        try { mood = JSON.parse(row.mood); } catch { /* ignore */ }
        return { ...row, mood: Array.isArray(mood) ? mood : [] };
      });
  } finally {
    db.close();
  }
}

function get(repoRoot, date) {
  const file = diaryFile(repoRoot);
  if (!fs.existsSync(file)) return null;
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const row = db.prepare('SELECT * FROM diary_entries WHERE date=?').get(String(date));
    if (!row) return null;
    let mood = [];
    let highlights = [];
    try { mood = JSON.parse(row.mood); } catch { /* ignore */ }
    try { highlights = JSON.parse(row.highlights); } catch { /* ignore */ }
    return { ...row, mood: Array.isArray(mood) ? mood : [], highlights: Array.isArray(highlights) ? highlights : [] };
  } finally {
    db.close();
  }
}

function setEnabled(repoRoot, enabled) {
  const file = path.join(repoRoot, 'config.json');
  const cfg = readConfig(repoRoot);
  if (!cfg.socialV2 || typeof cfg.socialV2 !== 'object') cfg.socialV2 = {};
  if (!cfg.socialV2.diary || typeof cfg.socialV2.diary !== 'object') cfg.socialV2.diary = {};
  cfg.socialV2.diary.enabled = enabled === true;
  if (!cfg.socialV2.tools || typeof cfg.socialV2.tools !== 'object') cfg.socialV2.tools = {};
  cfg.socialV2.tools.diary = enabled === true;
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, file);
  return { enabled: cfg.socialV2.diary.enabled };
}

module.exports = { list, get, isEnabled, setEnabled, diaryFile };
