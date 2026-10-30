'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openMemoryDb } = require('../vendor/qq-bridge/src/memory/db.js');
const { ensureGrowthSchema, addEvidence, evaluateGrowth, applyCandidate } = require('../vendor/qq-bridge/src/memory/growth.js');

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-growth-cross-'));
  const db = openMemoryDb(path.join(root, 'memory.db'));
  ensureGrowthSchema(db);
  const now = Date.now();
  for (const key of ['expression:a', 'expression:b']) {
    db.prepare(`INSERT INTO traits(trait_key,name,category,strength,initial_strength,confidence,created_at,updated_at)
      VALUES(?,?, 'expression',0.5,0.5,0.8,?,?)`).run(key, key, now, now);
    for (let i = 0; i < 5; i += 1) {
      addEvidence(db, { traitKey: key, kind: 'behavior', convKey: 'group:1', note: `${key}-${i}`, at: now + i * 86400000 });
    }
  }
  return { db, now };
}

test('evidence IDs are global but cursors and growth are scoped per trait', () => {
  const { db, now } = setup();
  const ids = db.prepare('SELECT id,trait_key FROM trait_evidence ORDER BY id').all();
  assert.ok(ids.every((row, i) => i === 0 || row.id > ids[i - 1].id), 'trait_evidence.id must be globally increasing');
  const first = evaluateGrowth(db, { autoApplyExpression: true });
  assert.equal(first.length, 2);
  const bBefore = Number(db.prepare("SELECT strength,evidence_cursor FROM traits WHERE trait_key='expression:b'").get().strength);
  addEvidence(db, { traitKey: 'expression:a', kind: 'behavior', convKey: 'group:1', note: 'a-new', at: now + 10 * 86400000 });
  const second = evaluateGrowth(db, { autoApplyExpression: true });
  assert.equal(second.length, 1);
  assert.equal(second[0].trait, 'expression:a');
  assert.equal(Number(db.prepare("SELECT strength FROM traits WHERE trait_key='expression:b'").get().strength), bBefore);
});

test('reconcile consumed_total is cumulative relative to the candidate cursor', () => {
  const { db } = setup();
  const first = evaluateGrowth(db, { autoApplyExpression: true }).find((item) => item.trait === 'expression:a');
  assert.ok(first);
  const row = db.prepare('SELECT consumed_total, unconsumed_total FROM growth_reconcile WHERE candidate_id=?').get(first.id);
  assert.ok(Number(row.consumed_total) >= 5);
  assert.equal(Number(row.unconsumed_total), 0);
});


test('invalidating old evidence then adding new evidence keeps growth scoped to new IDs', () => {
  const { db, now } = setup();
  evaluateGrowth(db, { autoApplyExpression: true });
  const before = db.prepare("SELECT strength,evidence_cursor FROM traits WHERE trait_key='expression:a'").get();
  const { invalidateEvidenceForTopic } = require('../vendor/qq-bridge/src/memory/growth.js');
  const invalidated = invalidateEvidenceForTopic(db, { topic: 'expression:a-0', convKey: 'group:1' });
  assert.equal(invalidated.invalidated, 1);
  addEvidence(db, { traitKey: 'expression:a', kind: 'behavior', convKey: 'group:1', note: 'after-invalidate', at: now + 20 * 86400000 });
  const produced = evaluateGrowth(db, { autoApplyExpression: true });
  assert.equal(produced.length, 1);
  assert.equal(produced[0].trait, 'expression:a');
  const after = db.prepare("SELECT strength,evidence_cursor FROM traits WHERE trait_key='expression:a'").get();
  assert.ok(Number(after.evidence_cursor) >= Number(before.evidence_cursor));
});
