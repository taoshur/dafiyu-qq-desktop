'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const { previewMaiBotImport, importMaiBot } = require('../src/main/maibot-import.js');

async function targetDb(dir) {
  const { openMemoryDb } = await import('../vendor/qq-bridge/src/memory/db.js');
  const { ensureExtractSchema } = await import('../vendor/qq-bridge/src/memory/extractor.js');
  const db = openMemoryDb(path.join(dir, 'memory.db'));
  ensureExtractSchema(db);
  return db;
}

function sourceDb(dir, version = 'legacy') {
  const db = new DatabaseSync(path.join(dir, 'MaiBot.db'));
  if (version === 'legacy') {
    db.exec('CREATE TABLE chat_history (id INTEGER PRIMARY KEY, chat_id TEXT, start_time INTEGER, end_time INTEGER, participants TEXT, theme TEXT, keywords TEXT, summary TEXT)');
    db.prepare('INSERT INTO chat_history VALUES(1,?,?,?,?,?,?,?)').run('group:1125866001', 1793315961000, 1793316000000, '["2608855988"]', '运动会', '学校', '明天开运动会，没有报项目，相当于放假');
  } else {
    db.exec('CREATE TABLE chat_history (id INTEGER PRIMARY KEY, session_id TEXT, start_timestamp INTEGER, end_timestamp INTEGER, participants TEXT, theme TEXT, keywords TEXT, summary TEXT)');
    db.prepare('INSERT INTO chat_history VALUES(1,?,?,?,?,?,?,?)').run('session-1', 1793315961000, 1793316000000, '["2608855988"]', '周末', '计划', '周末去公园');
  }
  db.close();
}

test('preview detects MaiBot chat_history and samples rows', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-maibot-'));
  sourceDb(dir);
  const result = previewMaiBotImport({ sourcePath: path.join(dir, 'MaiBot.db') });
  assert.equal(result.table, 'chat_history');
  assert.equal(result.total, 1);
  assert.equal(result.sample.length, 1);
  assert.match(result.sample[0].summary, /运动会/);
  assert.equal(result.sample[0].scope, 'group:1125866001');
});

test('import creates pending event candidates without touching facts or events', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-maibot-'));
  sourceDb(dir);
  const target = await targetDb(dir);
  const before = {
    facts: target.prepare('SELECT COUNT(*) c FROM facts').get().c,
    events: target.prepare('SELECT COUNT(*) c FROM events').get().c
  };
  target.close();
  const result = importMaiBot({ sourcePath: path.join(dir, 'MaiBot.db'), targetPath: path.join(dir, 'memory.db') });
  assert.equal(result.imported, 1);
  const db = new DatabaseSync(path.join(dir, 'memory.db'));
  try {
    assert.equal(db.prepare('SELECT COUNT(*) c FROM facts').get().c, before.facts);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM events').get().c, before.events);
    const row = db.prepare("SELECT kind,status,source_type,summary,scope,participants,happened_at FROM memory_candidates").get();
    assert.equal(row.kind, 'event');
    assert.equal(row.status, 'pending');
    assert.equal(row.source_type, 'maibot');
    assert.match(row.summary, /运动会/);
    assert.equal(row.scope, 'group:1125866001');
    assert.equal(row.participants, '["2608855988"]');
    assert.ok(row.happened_at);
    const again = importMaiBot({ sourcePath: path.join(dir, 'MaiBot.db'), targetPath: path.join(dir, 'memory.db') });
    assert.equal(again.imported, 0);
    assert.equal(again.duplicates, 1);
  } finally {
    db.close();
  }
});

test('current session_id schema is also supported', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-maibot-'));
  sourceDb(dir, 'current');
  await targetDb(dir);
  const result = importMaiBot({ sourcePath: path.join(dir, 'MaiBot.db'), targetPath: path.join(dir, 'memory.db') });
  assert.equal(result.imported, 1);
});
