'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openMemoryDb } = require('../vendor/qq-bridge/src/memory/db.js');
const { ensureGrowthSchema, addEvidence, evaluateGrowth } = require('../vendor/qq-bridge/src/memory/growth.js');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-growth-'));
  const db = openMemoryDb(path.join(root, 'memory.db'));
  ensureGrowthSchema(db);
  const now = Date.now();
  db.prepare(`INSERT INTO traits(trait_key, name, category, description, strength, initial_strength, confidence, created_at, updated_at)
    VALUES('expression:test','测试表达','expression','test',0.5,0.5,0.8,?,?)`).run(now, now);
  for (let i = 0; i < 5; i += 1) {
    addEvidence(db, {
      traitKey: 'expression:test', kind: 'behavior', convKey: 'group:1',
      note: `evidence-${i}`, at: now + i * 86400000
    });
  }
  return { db, now };
}

test('same evidence batch cannot repeatedly raise a trait', () => {
  const { db } = fixture();
  const first = evaluateGrowth(db, { autoApplyExpression: true });
  assert.equal(first.length, 1);
  assert.equal(first[0].auto, true);
  const afterFirst = Number(db.prepare("SELECT strength FROM traits WHERE trait_key='expression:test'").get().strength);
  const second = evaluateGrowth(db, { autoApplyExpression: true });
  assert.equal(second.length, 0);
  const afterSecond = Number(db.prepare("SELECT strength FROM traits WHERE trait_key='expression:test'").get().strength);
  assert.equal(afterSecond, afterFirst);
});

test('new evidence after the cursor can produce exactly one new delta', () => {
  const { db, now } = fixture();
  evaluateGrowth(db, { autoApplyExpression: true });
  addEvidence(db, { traitKey: 'expression:test', kind: 'behavior', convKey: 'group:1', note: 'new-evidence', at: now + 6 * 86400000 });
  const once = evaluateGrowth(db, { autoApplyExpression: true });
  assert.equal(once.length, 1);
  assert.equal(evaluateGrowth(db, { autoApplyExpression: true }).length, 0);
});
