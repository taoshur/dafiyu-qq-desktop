'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const { createPaths } = require('../src/main/paths');
const { listDeadLetters, retryDeadLetter } = require('../src/main/memory');

test('dead-letter list and explicit retry are available through the desktop API', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-dead-ui-'));
  const paths = createPaths(path.join(root, 'userData'));
  const db = new DatabaseSync(paths.memoryTestDb);
  db.exec(`CREATE TABLE messages (id INTEGER PRIMARY KEY, extracted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE extract_dead_letters (batch_key TEXT PRIMARY KEY, conv_key TEXT, message_ids TEXT, attempts INTEGER, error TEXT, created_at INTEGER);
    INSERT INTO messages(id, extracted) VALUES (1, 2), (2, 2);
    INSERT INTO extract_dead_letters(batch_key, conv_key, message_ids, attempts, error, created_at)
      VALUES ('b1', 'group:1', '[1,2]', 3, 'test', 1);`);
  db.close();
  const settings = { repoRoot: root };
  const listed = listDeadLetters({ settings, paths, mode: 'test' });
  assert.equal(listed.rows.length, 1);
  assert.equal(listed.rows[0].messageCount, 2);
  assert.throws(() => retryDeadLetter({ settings, paths, mode: 'test', batchKey: 'b1' }), /确认/);
  const result = retryDeadLetter({ settings, paths, mode: 'test', batchKey: 'b1', confirm: true });
  assert.equal(result.messages, 2);
  assert.equal(listDeadLetters({ settings, paths, mode: 'test' }).rows.length, 0);
});
