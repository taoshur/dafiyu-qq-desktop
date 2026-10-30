'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createPaths } = require('../src/main/paths');
const { openMemoryDb } = require('../vendor/qq-bridge/src/memory/db.js');
const { ensureExtractSchema } = require('../vendor/qq-bridge/src/memory/extractor.js');
const {
  unlockProductionReview, reviewProductionCandidate, listAudit
} = require('../src/main/memory-review');

function fixture() {
  const source = path.join(__dirname, '..', 'vendor', 'qq-bridge');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-prod-review-'));
  const provider = path.join(root, 'provider');
  fs.mkdirSync(path.join(provider, 'state'), { recursive: true });
  fs.cpSync(path.join(source, 'src', 'memory'), path.join(provider, 'src', 'memory'), { recursive: true });
  fs.writeFileSync(path.join(provider, 'config.json'), JSON.stringify({ memory: { dbPath: 'state/memory.db' } }), 'utf8');
  const settings = { repoRoot: provider };
  const paths = createPaths(path.join(root, 'userData'));
  const dbPath = path.join(provider, 'state', 'memory.db');
  // Use an isolated copy of the provider source for the dynamic import, while
  // the DB path stays under the real provider/state directory only for this test.
  const db = openMemoryDb(dbPath);
  ensureExtractSchema(db);
  const now = Date.now();
  const batchKey = `test-batch-${now}`;
  db.prepare(`INSERT INTO messages(conv_key, msg_key, seq, sender_qq, sender_name, text, sent_at, is_self, is_owner, extracted, batch_key)
    VALUES('group:1',?,1,'123456','爸爸','测试',?,0,1,1,?)`).run(`msg-${now}`, now, batchKey);
  db.prepare(`INSERT INTO memory_candidates
    (kind, subject_qq, subject_name, attr, value, confidence, scope, visibility, kind_of_fact,
     dedupe_key, batch_key, conv_key, source_type, status, created_at)
    VALUES('fact','123456','爸爸','测试属性','测试值',0.9,'group:1','group','multi',?,?,?, 'auto','pending',?)`)
    .run(`dedupe-${now}`, batchKey, 'group:1', now);
  const id = Number(db.prepare('SELECT last_insert_rowid() AS id').get().id);
  db.close();
  return { provider, root, settings, paths, id, dbPath };
}

test('production review requires unlock and is transactional, audited, undoable', async () => {
  const f = fixture();
  assert.throws(() => unlockProductionReview({ confirmText: 'wrong' }), /确认短语/);
  const unlocked = unlockProductionReview({ confirmText: '我确认修改生产记忆' });
  assert.ok(unlocked.token);

  await assert.rejects(() => reviewProductionCandidate({
    settings: f.settings, paths: f.paths, id: f.id, action: 'apply', token: 'wrong'
  }), /未解锁/);

  const applied = await reviewProductionCandidate({
    settings: f.settings, paths: f.paths, id: f.id, action: 'apply',
    token: unlocked.token, requestId: 'req-1'
  });
  assert.equal(applied.status, 'applied');
  const audit = listAudit({ settings: f.settings, paths: f.paths, candidateId: f.id });
  assert.equal(audit.rows[0].action, 'apply');
  assert.equal(audit.rows[0].request_id, 'req-1');

  // Duplicate request ID returns the recorded audit instead of double-applying.
  const repeated = await reviewProductionCandidate({
    settings: f.settings, paths: f.paths, id: f.id, action: 'apply',
    token: unlocked.token, requestId: 'req-1'
  });
  assert.equal(repeated.already, true);

  const undone = await reviewProductionCandidate({
    settings: f.settings, paths: f.paths, id: f.id, action: 'undo',
    token: unlocked.token, requestId: 'req-2'
  });
  assert.equal(undone.status, 'pending');
  const db = new (require('node:sqlite').DatabaseSync)(f.dbPath, { readOnly: true });
  const fact = db.prepare('SELECT status FROM facts WHERE id=?').get(Number(applied.refId));
  assert.equal(fact.status, 'retracted');
  db.close();
  assert.equal(listAudit({ settings: f.settings, paths: f.paths, candidateId: f.id }).rows.length, 2);
});
