'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openMemoryDb } = require('../vendor/qq-bridge/src/memory/db.js');
const { ensureExtractSchema, validateExtraction, writeExtraction } = require('../vendor/qq-bridge/src/memory/extractor.js');
const { resolveRelativeHappenedAt } = require('../vendor/qq-bridge/src/memory/time-range.js');

function shanghaiAt(hour, minute = 0) {
  return new Date(Date.UTC(2026, 9, 30, hour - 8, minute, 0)).getTime();
}

test('00:00-04:59 treats 明天 as the day already in progress', () => {
  for (const hour of [0, 4]) {
    const r = resolveRelativeHappenedAt('明天开运动会', shanghaiAt(hour, hour === 4 ? 59 : 0));
    assert.ok(r);
    assert.equal(new Date(r.at).toISOString(), '2026-10-30T04:00:00.000Z');
  }
});

test('05:00 and later treats 明天 as the next day', () => {
  for (const hour of [5, 12, 23]) {
    const r = resolveRelativeHappenedAt('明天开运动会', shanghaiAt(hour));
    assert.ok(r);
    assert.equal(new Date(r.at).toISOString(), '2026-10-31T04:00:00.000Z');
  }
});

test('fact extraction stores inferred relative day in candidate', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-relative-time-'));
  const db = openMemoryDb(path.join(root, 'memory.db'));
  ensureExtractSchema(db);
  const sentAt = shanghaiAt(0, 8);
  const validated = validateExtraction({
    facts: [{ attr: '运动会安排', value: '明天开运动会，没有报项目，相当于放假', subject_qq: '2608855988', category: 'plan', kind: 'temporal' }],
    events: []
  }, { convKey: 'private:2608855988', defaultHappenedAt: sentAt });
  assert.equal(new Date(validated.facts[0].happenedAt).toISOString(), '2026-10-30T04:00:00.000Z');
  assert.equal(validated.facts[0].timePrecision, 'day');
  writeExtraction(db, { batchKey: 'b1', convKey: 'private:2608855988', ids: [999999], rows: [{ seq: 1 }] }, validated, { observeOnly: true });
  const row = db.prepare("SELECT happened_at,time_precision FROM memory_candidates WHERE value LIKE '%运动会%'").get();
  assert.equal(new Date(row.happened_at).toISOString(), '2026-10-30T04:00:00.000Z');
  assert.equal(row.time_precision, 'day');
  db.close();
});
