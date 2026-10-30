'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openMemoryDb, addFact } = require('../vendor/qq-bridge/src/memory/db.js');
const { ensureExtractSchema, applyCandidate } = require('../vendor/qq-bridge/src/memory/extractor.js');
const { retrieveMemoryForPrompt } = require('../vendor/qq-bridge/src/memory/retrieve.js');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-memory-chain-'));
  const db = openMemoryDb(path.join(root, 'memory.db'));
  ensureExtractSchema(db);
  return db;
}

function insertCandidate(db, { id = 1, status = 'pending' } = {}) {
  db.prepare(`INSERT INTO memory_candidates
    (id, kind, subject_qq, subject_name, attr, value, confidence, scope, visibility,
     kind_of_fact, dedupe_key, batch_key, conv_key, source_type, status, created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, 'fact', '123456', '小明', '喜欢的游戏', '消消乐', 0.9, 'group:1', 'group',
    'multi', `f-${id}`, 'batch-1', 'group:1', 'auto', status, Date.now()
  );
}

test('candidate apply + next-day retrieval closes the memory loop', () => {
  const db = fixture();
  insertCandidate(db);
  const applied = applyCandidate(db, 1);
  assert.equal(applied.status, 'applied');
  assert.equal(applied.refType, 'fact');
  globalThis.__MEMORY_CONF__ = { recallV4: true, lifecycleEnabled: true };
  const nextDay = Date.now() + 86400000;
  const result = retrieveMemoryForPrompt(db, {
    convKey: 'group:1', speakerQqs: ['123456'], text: '小明喜欢什么游戏', budgetTokens: 600, now: nextDay
  });
  assert.match(result.text, /消消乐/);
  assert.ok(result.hits >= 1);
});

test('candidate apply rolls back the fact if the status update fails', () => {
  const db = fixture();
  insertCandidate(db);
  db.exec(`CREATE TRIGGER fail_candidate_update BEFORE UPDATE ON memory_candidates
    BEGIN SELECT RAISE(ABORT, 'forced failure'); END`);
  assert.throws(() => applyCandidate(db, 1), /forced failure/);
  assert.equal(Number(db.prepare("SELECT COUNT(*) c FROM facts WHERE source_key='cand:1'").get().c), 0);
  assert.equal(db.prepare('SELECT status FROM memory_candidates WHERE id=1').get().status, 'pending');
});
