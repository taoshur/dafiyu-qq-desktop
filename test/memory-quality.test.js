'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openMemoryDb } = require('../vendor/qq-bridge/src/memory/db.js');
const { classifyCandidate } = require('../vendor/qq-bridge/src/memory/quality.js');
const { writeExtraction, ensureExtractSchema } = require('../vendor/qq-bridge/src/memory/extractor.js');

test('quality has reject/review/allow tiers instead of age/keyword rejection', () => {
  const oldEvent = classifyCandidate({ kind: 'event', summary: '小时候一直忙着学习', happenedAt: Date.now() - 500 * 86400000 }, { convKey: 'group:1' });
  assert.equal(oldEvent.decision, 'review');
  const salary = classifyCandidate({ kind: 'fact', subjectQq: '1', attr: '收入', value: '工资', certainty: 'stated' }, { convKey: 'private:1' });
  assert.equal(salary.decision, 'review');
  const tech = classifyCandidate({ kind: 'event', summary: '今天修好了记忆系统，特别开心', category: 'tech' }, { convKey: 'group:1' });
  assert.equal(tech.decision, 'review');
  const joke = classifyCandidate({ kind: 'event', summary: '开玩笑的', certainty: 'joke' }, { convKey: 'group:1' });
  assert.equal(joke.decision, 'reject');
  const normal = classifyCandidate({ kind: 'fact', subjectQq: '1', attr: '喜欢的游戏', value: '消消乐', certainty: 'stated', selfStated: true }, { convKey: 'group:1' });
  assert.equal(normal.decision, 'allow');
});

test('review-tier events stay pending candidates even outside observeOnly', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-quality-'));
  const db = openMemoryDb(path.join(root, 'memory.db'));
  ensureExtractSchema(db);
  const batch = {
    batchKey: 'b1', convKey: 'group:1', rows: [{ seq: 1 }], ids: [],
    contextRows: []
  };
  db.prepare(`INSERT INTO messages(conv_key, msg_key, seq, sender_qq, sender_name, text, sent_at, is_self, extracted)
    VALUES('group:1','m1',1,'1','A','今天修好了记忆系统，特别开心', ?,0,0)`).run(Date.now());
  batch.ids = [Number(db.prepare('SELECT id FROM messages').get().id)];
  const result = writeExtraction(db, batch, {
    facts: [], events: [{
      summary: '今天修好了记忆系统，特别开心', detail: '', participants: [], happenedAt: Date.now(),
      timePrecision: 'day', confidence: 0.9, scope: 'group:1', visibility: 'group', category: 'tech', certainty: 'stated'
    }], errors: []
  }, { observeOnly: false });
  assert.ok(result.written >= 1);
  assert.equal(Number(db.prepare('SELECT COUNT(*) c FROM events').get().c), 0);
  assert.equal(Number(db.prepare("SELECT COUNT(*) c FROM memory_candidates WHERE status='pending'").get().c), 1);
});
