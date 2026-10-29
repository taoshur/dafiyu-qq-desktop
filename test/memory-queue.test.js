'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openMemoryDb } = require('../vendor/qq-bridge/src/memory/db.js');
const { ingestMessage, ensureExtractSchema, pendingStats } = require('../vendor/qq-bridge/src/memory/extractor.js');
const { runExtractionCycle } = require('../vendor/qq-bridge/src/memory/worker.js');

test('worker drains a backlog larger than maxQueue instead of skipping forever', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-memory-queue-'));
  const db = openMemoryDb(path.join(root, 'memory.db'));
  ensureExtractSchema(db);
  for (let i = 0; i < 201; i += 1) {
    ingestMessage(db, {
      convKey: 'group:1', messageId: `m${i}`, seq: i, senderQq: '1', senderName: 'A',
      text: `message ${i}`, sentAt: Date.now()
    });
  }
  assert.equal(pendingStats(db).pending, 201);
  let called = 0;
  const result = await runExtractionCycle({
    db,
    config: { batchSize: 30, maxQueue: 200, observeOnly: true },
    callModel: async () => { called += 1; return { parsed: { facts: [], events: [] }, usage: { prompt: 0, completion: 0 } }; },
    log: () => {}
  });
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(called, 1);
  assert.ok(pendingStats(db).pending < 201);
});


test('permanently failed batches become retryable dead letters', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-memory-dead-'));
  const db = openMemoryDb(path.join(root, 'memory.db'));
  ensureExtractSchema(db);
  for (let i = 0; i < 5; i += 1) {
    ingestMessage(db, { convKey: 'group:1', messageId: `d${i}`, seq: i, senderQq: '1', senderName: 'A', text: `dead ${i}`, sentAt: Date.now() });
  }
  const result = await runExtractionCycle({
    db,
    config: { batchSize: 5, maxAttempts: 1, observeOnly: true },
    callModel: async () => { throw new Error('model down'); },
    log: () => {}
  });
  assert.ok(result.error);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM extract_dead_letters').get().c, 1);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM messages WHERE extracted=2').get().c, 5);
  const { retryDeadLetters } = require('../vendor/qq-bridge/src/memory/extractor.js');
  assert.equal(retryDeadLetters(db).retried, 1);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM messages WHERE extracted=0').get().c, 5);
});
