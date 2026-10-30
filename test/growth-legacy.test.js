'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openMemoryDb } = require('../vendor/qq-bridge/src/memory/db.js');
const { ensureGrowthSchema, applyCandidate } = require('../vendor/qq-bridge/src/memory/growth.js');

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-growth-legacy-'));
  const db = openMemoryDb(path.join(root, 'memory.db'));
  ensureGrowthSchema(db);
  const now = Date.now();
  db.prepare(`INSERT INTO traits(trait_key,name,category,strength,initial_strength,confidence,evidence_count,created_at,updated_at)
    VALUES('expression:legacy','旧表达','expression',0.5,0.5,0.8,5,?,?)`).run(now, now);
  db.prepare(`INSERT INTO trait_evidence(trait_key,kind,day,weight,evidence_key,created_at,source)
    VALUES('expression:legacy','behavior','2026-10-01',1,'e1',?,'behavior')`).run(now - 86400000);
  db.prepare(`INSERT INTO growth_candidates(id,trait_key,kind,before_strength,proposed_strength,evidence_count,status,basis_cursor,reconcile_state,created_at)
    VALUES(1,'expression:legacy','strengthen',0.5,0.6,5,'pending',NULL,'legacy-ambiguous',?)`).run(now);
  db.prepare(`INSERT INTO growth_candidates(id,trait_key,kind,before_strength,proposed_strength,evidence_count,status,basis_cursor,reconcile_state,created_at)
    VALUES(2,'expression:legacy','strengthen',0.5,0.6,5,'pending',1,'current',?)`).run(now);
  return { db, now };
}

test('legacy ambiguous candidate is blocked and cannot lower a newer strength', () => {
  const { db } = setup();
  const result = applyCandidate(db, 1, { source: 'manual' });
  assert.equal(result.ok, false);
  assert.match(result.error, /LEGACY_CANDIDATE_AMBIGUOUS/);
  assert.equal(Number(db.prepare("SELECT strength FROM traits WHERE trait_key='expression:legacy'").get().strength), 0.5);
  assert.equal(db.prepare("SELECT reconcile_state FROM growth_candidates WHERE id=1").get().reconcile_state, 'legacy-ambiguous');
  db.close();
});

test('stale current candidate is blocked after strength changes', () => {
  const { db } = setup();
  db.prepare("UPDATE traits SET strength=0.9 WHERE trait_key='expression:legacy'").run();
  const result = applyCandidate(db, 2, { source: 'manual' });
  assert.equal(result.ok, false);
  assert.match(result.error, /STALE_CANDIDATE/);
  assert.equal(Number(db.prepare("SELECT strength FROM traits WHERE trait_key='expression:legacy'").get().strength), 0.9);
  assert.equal(db.prepare("SELECT reconcile_state FROM growth_candidates WHERE id=2").get().reconcile_state, 'stale');
  db.close();
});

test('current candidate applies atomically and records reconciliation', () => {
  const { db } = setup();
  db.prepare("UPDATE traits SET strength=0.5, evidence_cursor=1 WHERE trait_key='expression:legacy'").run();
  const result = applyCandidate(db, 2, { source: 'manual' });
  assert.equal(result.ok, true);
  assert.equal(Number(db.prepare("SELECT strength FROM traits WHERE trait_key='expression:legacy'").get().strength), 0.6);
  const rec = db.prepare('SELECT state, consumed_total, unconsumed_total FROM growth_reconcile WHERE candidate_id=2').get();
  assert.equal(rec.state, 'applied');
  assert.equal(Number(rec.consumed_total), 1);
  db.close();
});


test('failed candidate apply rolls back strength, cursor and reconciliation', () => {
  const { db, now } = setup();
  db.prepare("UPDATE growth_candidates SET status='rejected' WHERE id=2").run();
  db.prepare(`INSERT INTO growth_candidates(id,trait_key,kind,before_strength,proposed_strength,evidence_count,status,basis_cursor,reconcile_state,created_at)
    VALUES(3,'expression:legacy','strengthen',0.5,0.6,5,'pending',1,'current',?)`).run(now);
  db.prepare("UPDATE traits SET strength=0.5, evidence_cursor=1 WHERE trait_key='expression:legacy'").run();
  db.exec("CREATE TRIGGER fail_growth_version BEFORE INSERT ON trait_versions BEGIN SELECT RAISE(ABORT,'forced'); END");
  assert.throws(() => applyCandidate(db, 3, { source: 'manual' }), /forced/);
  assert.equal(Number(db.prepare("SELECT strength FROM traits WHERE trait_key='expression:legacy'").get().strength), 0.5);
  assert.equal(db.prepare("SELECT reconcile_state FROM growth_candidates WHERE id=3").get().reconcile_state, 'current');
  assert.equal(Number(db.prepare("SELECT COUNT(*) c FROM growth_reconcile WHERE candidate_id=3").get().c), 0);
  db.exec('DROP TRIGGER fail_growth_version');
  assert.equal(applyCandidate(db, 3, { source: 'manual' }).ok, true);
  db.close();
});
