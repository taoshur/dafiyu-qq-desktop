// 回归：被否决兴趣的复核机制
// 旧证据/只读探索/重复上报都不能让兴趣复活；只有纠错之后新产生的真实参与证据够量（5 条 / 2 天）
// 才产出「待审候选」，且必须人工 apply 才会回到 active。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  ensureGrowthSchema, recordInterestSignal, createInterestTraits, addEvidence,
  reviewRejectedInterests, rejectCandidate, applyCandidate
} from '../src/memory/growth.js';
import { openMemoryDb } from '../src/memory/db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 24 * 3600 * 1000;
let pass = 0;
let fail = 0;
function ok(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass += 1; } catch (error) {
    console.error(`  ✗ ${name}: ${error?.message ?? error}`); fail += 1;
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rejected-review-'));
const dbPath = path.join(dir, 'memory.db');
const db = openMemoryDb(dbPath);
ensureGrowthSchema(db);

const old = Date.now() - 10 * DAY;
// 旧证据：跨两天的只读热门访问（当时被记成 participate）
for (let i = 0; i < 6; i += 1) {
  recordInterestSignal(db, {
    topic: 'B站', kind: 'participate', source: 'tool', convKey: `group:${i}`,
    note: 'bilibili__bili_hot_videos', at: (i < 3 ? old : old + DAY) + i * 1000
  });
}
recordInterestSignal(db, { topic: '消消乐', kind: 'participate', source: 'tool', convKey: 'group:9', note: 'android__android_batch', at: old });
recordInterestSignal(db, { topic: '消消乐', kind: 'participate', source: 'tool', convKey: 'group:8', note: 'android__android_tap', at: old + DAY });
recordInterestSignal(db, { topic: '消消乐', kind: 'participate', source: 'tool', convKey: 'group:7', note: 'android__android_swipe', at: old + DAY });
createInterestTraits(db);
const versionId = db.prepare("SELECT id FROM trait_versions WHERE trait_key='interest:B站' ORDER BY id DESC LIMIT 1").get().id;
db.close();

const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'growth-correct-bili.mjs'), '--db', dbPath, '--apply', '--version', String(versionId)], { encoding: 'utf8' });
assert.equal(run.status, 0, run.stderr);

const db2 = openMemoryDb(dbPath);
// 把纠错时间挪到 5 天前，方便构造"纠错后"的新证据
db2.prepare("UPDATE trait_versions SET at=? WHERE trait_key='interest:B站' AND source='correction'").run(Date.now() - 5 * DAY);
const biliState = () => db2.prepare("SELECT strength, status FROM traits WHERE trait_key='interest:B站'").get();
const pendingReview = () => db2.prepare("SELECT * FROM growth_candidates WHERE trait_key='interest:B站' AND kind='review' AND status='pending'").all();

console.log('[旧证据 / 只读探索]');
ok('旧的只读证据（纠错前）不能触发复核', () => {
  const out = reviewRejectedInterests(db2);
  assert.equal(out.length, 0, `不应产出候选，实际 ${JSON.stringify(out)}`);
  assert.equal(pendingReview().length, 0);
});
ok('新增只读探索证据不能触发复核', () => {
  for (let i = 0; i < 10; i += 1) {
    addEvidence(db2, { traitKey: 'interest:B站', convKey: 'group:1', note: `bilibili__bili_hot_videos 探索${i}`, kind: 'explore', source: 'explore', weight: 0.5, at: Date.now() - 2 * DAY + i * 1000 });
  }
  assert.equal(reviewRejectedInterests(db2).length, 0);
});
ok('把只读工具误标成 behavior 也挡得住', () => {
  for (let i = 0; i < 6; i += 1) {
    addEvidence(db2, { traitKey: 'interest:B站', convKey: 'group:2', note: `B站 bilibili__bili_hot_videos 伪参与${i}`, kind: 'behavior', source: 'behavior', at: Date.now() - 3 * DAY + i * 1000 });
  }
  assert.equal(reviewRejectedInterests(db2).length, 0);
});

console.log('[真实参与门槛]');
function addGenuine(n, dayOffset, conv = 'private:1') {
  for (let i = 0; i < n; i += 1) {
    addEvidence(db2, {
      traitKey: 'interest:B站', convKey: conv, note: `bilibili__bili_reply 真实评论 ${dayOffset}-${i}`,
      kind: 'behavior', source: 'behavior', weight: 1, at: Date.now() - dayOffset * DAY + i * 1000
    });
  }
}
ok('4 条真实参与（跨 2 天）还不够', () => {
  addGenuine(2, 2, 'private:1');
  addGenuine(2, 1, 'private:2');
  assert.equal(reviewRejectedInterests(db2).length, 0);
});
ok('第 5 条真实参与（跨 2 天）→ 产出待审候选，但兴趣仍是 rejected', () => {
  addGenuine(1, 1, 'private:3');
  const out = reviewRejectedInterests(db2);
  assert.equal(out.length, 1, `应产出 1 条候选，实际 ${out.length}`);
  const c = pendingReview()[0];
  assert.equal(c.kind, 'review');
  assert.equal(c.status, 'pending');
  assert.equal(Number(c.evidence_count) >= 5, true);
  assert.ok(String(c.reason).includes('纠错后真实参与'));
  const st = biliState();
  assert.equal(Number(st.strength), 0);
  assert.equal(st.status, 'rejected');
  const j = db2.prepare("SELECT * FROM growth_journal WHERE trait_key='interest:B站' AND kind='review_requested'").all();
  assert.equal(j.length, 1);
});
ok('重复评估不会重复产出候选', () => {
  assert.equal(reviewRejectedInterests(db2).length, 0);
  assert.equal(pendingReview().length, 1);
});
ok('同一条证据重复写入不会重复计数', () => {
  const before = db2.prepare("SELECT COUNT(*) c FROM trait_evidence WHERE trait_key='interest:B站'").get().c;
  addEvidence(db2, { traitKey: 'interest:B站', convKey: 'private:1', note: 'bilibili__bili_reply 真实评论 2-0', kind: 'behavior', source: 'behavior', at: Date.now() - 2 * DAY });
  const after = db2.prepare("SELECT COUNT(*) c FROM trait_evidence WHERE trait_key='interest:B站'").get().c;
  assert.equal(after, before, '重复写入应被 evidence_key 去重');
});
ok('候选未人工确认前，兴趣不恢复', () => {
  const t = biliState();
  assert.equal(Number(t.strength), 0);
  assert.equal(t.status, 'rejected');
});

console.log('[人工驳回与再复核]');
ok('人工驳回后不会立刻再产候选', () => {
  const id = pendingReview()[0].id;
  rejectCandidate(db2, id, '证据还不够');
  assert.equal(reviewRejectedInterests(db2).length, 0);
});
ok('驳回之后新产生 5 条真实证据（跨 2 天）→ 可再次进入复核', () => {
  // 把驳回时间挪到 3 天前，新证据才算"驳回之后"且能跨天
  db2.prepare("UPDATE growth_candidates SET reviewed_at=? WHERE trait_key='interest:B站' AND kind='review' AND status='rejected'").run(Date.now() - 3 * DAY);
  addGenuine(3, 2, 'private:4');
  addGenuine(2, 1, 'private:5');
  const out = reviewRejectedInterests(db2);
  assert.equal(out.length, 1);
});

console.log('[显式确认才恢复]');
ok('applyCandidate(review) 才会把 rejected 改回 active 并写版本', () => {
  const c = pendingReview()[0];
  const r = applyCandidate(db2, c.id);
  assert.equal(r.ok, true);
  const t = biliState();
  assert.equal(Number(t.strength), 0.35);
  assert.equal(t.status, 'active');
  const v = db2.prepare("SELECT * FROM trait_versions WHERE trait_key='interest:B站' ORDER BY id DESC LIMIT 1").get();
  assert.equal(Number(v.after_strength), 0.35);
});
ok('其它兴趣完全不受影响', () => {
  const t = db2.prepare("SELECT strength, status FROM traits WHERE trait_key='interest:消消乐'").get();
  assert.equal(Number(t.strength), 0.35);
  assert.equal(t.status, 'active');
});
db2.close();

console.log(`\n${fail ? '❌' : '✅'} test-growth-rejected-review：${pass} 项通过，${fail} 项失败`);
if (fail) process.exitCode = 1;
