/**
 * V4 加固回归：兴趣证据分级 / 反证据循环 / 分层衰减 / 纠错联动
 * node scripts/test-growth-hardening.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { openMemoryDb } from '../src/memory/db.js';
import {
  ensureGrowthSchema, classifyInterestSignal, recordInterestSignal, createInterestTraits,
  addEvidence, evidenceSpan, decayTraits, invalidateEvidenceForTopic, reassessTrait, growthStatus
} from '../src/memory/growth.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'growth-hard-'));
const db = openMemoryDb(path.join(dir, 'g.db'));
ensureGrowthSchema(db);
let pass = 0;
const ok = async (n, fn) => { await fn(); pass += 1; console.log('✔', n); };
const DAY = 86400000;
const daysAgo = (d) => Date.now() - d * DAY;

await ok('提到话题不算兴趣（mention 权重 0）', () => {
  for (let i = 0; i < 10; i++) {
    recordInterestSignal(db, { topic: '消消乐', kind: 'mention', convKey: 'group:1', at: daysAgo(i), note: `第${i}天提到消消乐` });
  }
  const created = createInterestTraits(db, {});
  assert.equal(created.length, 0);
});

await ok('明确讨厌不生成正向兴趣', () => {
  for (let i = 0; i < 3; i++) {
    recordInterestSignal(db, { topic: 'B站', kind: 'dislike', convKey: 'group:1', at: daysAgo(i), note: '不喜欢B站' });
    recordInterestSignal(db, { topic: 'B站', kind: 'participate', convKey: 'group:1', at: daysAgo(i + 3), note: '看了B站' });
  }
  const created = createInterestTraits(db, { minWeight: 3, minBehavior: 2, minDays: 2 });
  assert.equal(created.some((c) => c.topic === 'B站' && (c.behavior + c.explore) <= 0), false);
});

await ok('探索+实际参与且跨天，才形成兴趣', () => {
  for (let i = 0; i < 3; i++) {
    recordInterestSignal(db, { topic: '古筝', kind: 'participate', convKey: 'group:9', at: daysAgo(i), note: `第${i}天听古筝` });
    recordInterestSignal(db, { topic: '古筝', kind: 'explore', convKey: 'group:9', at: daysAgo(i), note: '搜古筝攻略' });
  }
  const created = createInterestTraits(db, {});
  assert.ok(created.some((c) => c.topic === '古筝'));
  const t = db.prepare("SELECT * FROM traits WHERE trait_key='interest:古筝'").get();
  assert.ok(t && Number(t.strength) > 0.3);
});

await ok('模型自述/指令不能当证据', () => {
  const a = addEvidence(db, { traitKey: 'playful', note: '我喜欢消消乐', source: 'self', at: daysAgo(1) });
  const b = addEvidence(db, { traitKey: 'playful', note: '你要喜欢消消乐', source: 'instruction', at: daysAgo(1) });
  assert.equal(a.rejected, true);
  assert.equal(b.rejected, true);
  assert.equal(evidenceSpan(db, 'playful').count, 0);
});

await ok('指令句被分类为 instruction，不进证据', () => {
  const sig = classifyInterestSignal('以后你要喜欢玩消消乐');
  assert.equal(sig.kind, 'instruction');
});

await ok('同一天同内容只算一次证据', () => {
  const at = Date.now();
  const a = addEvidence(db, { traitKey: 'curious', convKey: 'group:1', note: '研究机制', source: 'explore', at });
  const b = addEvidence(db, { traitKey: 'curious', convKey: 'group:1', note: '研究机制', source: 'explore', at: at + 3600000 });
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, true);
});

await ok('分层衰减：强兴趣宽限期长，弱兴趣回落更快', () => {
  db.prepare("UPDATE traits SET last_evidence_at=? WHERE trait_key='cute'").run(daysAgo(20));
  db.prepare("UPDATE traits SET last_evidence_at=? WHERE trait_key IN ('interest:古筝')").run(daysAgo(20));
  const beforeStrong = Number(db.prepare("SELECT strength FROM traits WHERE trait_key='cute'").get().strength);
  const beforeWeak = Number(db.prepare("SELECT strength FROM traits WHERE trait_key='interest:古筝'").get().strength);
  decayTraits(db, {});
  const afterStrong = Number(db.prepare("SELECT strength FROM traits WHERE trait_key='cute'").get().strength);
  const afterWeak = Number(db.prepare("SELECT strength FROM traits WHERE trait_key='interest:古筝'").get().strength);
  const dropStrong = beforeStrong - afterStrong;
  const dropWeak = beforeWeak - afterWeak;
  assert.ok(dropStrong >= 0 && dropWeak >= 0);
  assert.ok(dropWeak > dropStrong, '弱兴趣应掉得更快');
  assert.ok(db.prepare("SELECT 1 FROM traits WHERE trait_key='interest:古筝'").get(), '兴趣不能被删除');
});

await ok('纠正联动：证据失效后回滚并记日记', () => {
  db.prepare("INSERT INTO trait_versions(trait_key, before_strength, after_strength, reason, source, at) VALUES('playful', 0.75, 0.85, 'test', 'manual', ?)").run(Date.now());
  db.prepare("UPDATE traits SET strength=0.85 WHERE trait_key='playful'").run();
  addEvidence(db, { traitKey: 'playful', convKey: 'group:x', note: '玩消消乐第1天', source: 'behavior', at: daysAgo(3) });
  addEvidence(db, { traitKey: 'playful', convKey: 'group:x', note: '玩消消乐第2天', source: 'behavior', at: daysAgo(2) });
  const r = invalidateEvidenceForTopic(db, { topic: '消消乐', reason: '用户说记错了' });
  assert.ok(r.invalidated >= 1);
  const t = db.prepare("SELECT * FROM traits WHERE trait_key='playful'").get();
  assert.ok(Number(t.strength) <= 0.76, '应回滚到变化前');
  const j = db.prepare("SELECT * FROM growth_journal WHERE kind='growth_rollback' ORDER BY id DESC LIMIT 1").get();
  assert.ok(j, '应写回滚日记');
});

db.close();
console.log(`\n结果：${pass} 通过，0 失败`);
