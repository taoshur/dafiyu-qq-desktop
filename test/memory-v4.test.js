'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openMemoryDb, addFact, addEvent } = require('../vendor/qq-bridge/src/memory/db.js');
const { retrieveMemoryForPrompt } = require('../vendor/qq-bridge/src/memory/retrieve.js');
const { sweepLifecycle } = require('../vendor/qq-bridge/src/memory/lifecycle.js');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-memory-v4-'));
  const db = openMemoryDb(path.join(root, 'memory.db'));
  return { root, db };
}

test('Memory V4 schema adds lifecycle columns without replacing validity', () => {
  const { db } = fixture();
  const facts = db.prepare('PRAGMA table_info(facts)').all().map((c) => c.name);
  const events = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name);
  for (const key of ['importance', 'activation', 'last_recalled_at', 'reinforcement_count', 'lifecycle_state']) {
    assert.ok(facts.includes(key), `facts missing ${key}`);
    assert.ok(events.includes(key), `events missing ${key}`);
  }
  assert.ok(facts.includes('status'), 'validity status remains separate');
});

test('V4 recall returns time-relevant event before unrelated facts', () => {
  const { db } = fixture();
  const now = Date.now();
  addFact(db, {
    subjectQq: '123', subjectName: '小明', attr: '喜欢的游戏', value: '消消乐',
    category: 'preference', confidence: 0.9, scope: 'group:1', visibility: 'group'
  });
  addEvent(db, {
    summary: '和小明一起吃火锅', detail: '海底捞',
    participants: ['123'], happenedAt: now - 2 * 86400000,
    category: 'social', confidence: 0.9, scope: 'group:1', visibility: 'group'
  });
  globalThis.__MEMORY_CONF__ = { recallV4: true, lifecycleEnabled: true };
  const result = retrieveMemoryForPrompt(db, {
    convKey: 'group:1', speakerQqs: ['123'], text: '前天和小明吃饭了吗', budgetTokens: 600, now
  });
  assert.match(result.text, /火锅/);
  assert.ok(result.events >= 1);
  assert.ok(result.tokens <= 600);
  assert.ok(result.diagnostics, 'diagnostics must be returned');
  assert.ok(result.diagnostics.selectedIds.length >= 1);
  const log = db.prepare('SELECT COUNT(*) c FROM memory_recall_diagnostics').get();
  assert.ok(Number(log.c) >= 1);
});

test('Lifecycle decays low-importance rows and protects important facts', () => {
  const { db } = fixture();
  const old = Date.now() - 100 * 86400000;
  const low = addFact(db, {
    subjectQq: '123', subjectName: '小明', attr: '临时话题', value: '今天吃了面',
    category: 'social', confidence: 0.5, scope: 'group:1', visibility: 'group'
  });
  const high = addFact(db, {
    subjectQq: '123', subjectName: '小明', attr: '重要约定', value: '一起完成项目',
    category: 'relationship', confidence: 0.9, scope: 'group:1', visibility: 'group'
  });
  db.prepare('UPDATE facts SET activation=0.01, importance=0.2, last_recalled_at=? WHERE id=?').run(old, low.id);
  db.prepare('UPDATE facts SET activation=1, importance=0.95, last_recalled_at=? WHERE id=?').run(old, high.id);
  sweepLifecycle(db, { now: Date.now(), config: { lifecycleEnabled: true, force: true }, force: true });
  const lowRow = db.prepare('SELECT lifecycle_state,status FROM facts WHERE id=?').get(low.id);
  const highRow = db.prepare('SELECT lifecycle_state,status FROM facts WHERE id=?').get(high.id);
  assert.equal(lowRow.lifecycle_state, 'archived');
  assert.equal(lowRow.status, 'active', 'archiving must not invalidate truth');
  assert.equal(highRow.lifecycle_state, 'active', 'high importance must be protected');
});
