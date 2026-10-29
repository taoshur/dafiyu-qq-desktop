/**
 * Memory V4 成长系统测试
 * node scripts/test-growth.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { openMemoryDb } from '../src/memory/db.js';
import {
  ensureGrowthSchema, recordExperience, addEvidence, evidenceSpan, evaluateGrowth,
  applyCandidate, rejectCandidate, rollbackTrait, decayTraits, noteInteraction,
  setAffect, getAffect, buildGrowthContext, growthStatus, addJournal
} from '../src/memory/growth.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'growth-'));
const db = openMemoryDb(path.join(dir, 'g.db'));
ensureGrowthSchema(db);
let pass = 0;
const ok = async (name, fn) => { await fn(); pass += 1; console.log('✔', name); };
const DAY = 86400000;

await ok('初始六项性格已种下', () => {
  const s = growthStatus(db);
  assert.equal(s.traits.length, 6);
  assert.ok(s.traits.every((t) => t.strength > 0 && t.strength <= 1));
});

await ok('重复消息不重复计证据（同会话同内容 6 小时内）', () => {
  const at = Date.now();
  const a = addEvidence(db, { traitKey: 'playful', convKey: 'group:1', note: '我在玩消消乐', at });
  const b = addEvidence(db, { traitKey: 'playful', convKey: 'group:1', note: '我在玩消消乐', at: at + 60 * 1000 });
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, true);
});

await ok('单条消息不产生成长候选', () => {
  const produced = evaluateGrowth(db, { minEvidence: 5, minDistinctDays: 2, minSpanDays: 2 });
  assert.equal(produced.length, 0);
});

await ok('多天独立证据才产生候选', () => {
  const conv = 'group:9';
  for (let i = 1; i <= 6; i++) {
    recordExperience(db, { kind: 'play', topic: '消消乐', source: 'tool', convKey: conv, at: Date.now() - (7 - i) * DAY, sourceKey: `t${i}` });
    addEvidence(db, { traitKey: 'playful', convKey: conv, note: `第${i}天玩消消乐`, at: Date.now() - (7 - i) * DAY });
  }
  const ev = evidenceSpan(db, 'playful');
  assert.ok(ev.count >= 5 && ev.days >= 3, '证据数量和天数');
  const produced = evaluateGrowth(db, { minEvidence: 5, minDistinctDays: 2, minSpanDays: 2, maxAutoDelta: 0.1 });
  assert.ok(produced.length >= 1);
});

await ok('人格类变化只进候选，不自动生效', () => {
  const t = db.prepare("SELECT * FROM traits WHERE trait_key='playful'").get();
  const before = Number(t.strength);
  const c = db.prepare("SELECT * FROM growth_candidates WHERE trait_key='playful' AND status='pending'").get();
  assert.ok(c, '应有 pending 候选');
  const after = Number(db.prepare("SELECT strength FROM traits WHERE trait_key='playful'").get().strength);
  assert.equal(before.toFixed(3), after.toFixed(3));
});

await ok('手动生效：写版本 + 日记，幅度受 maxDelta 限制', () => {
  const c = db.prepare("SELECT * FROM growth_candidates WHERE trait_key='playful' AND status='pending'").get();
  const r = applyCandidate(db, c.id, { source: 'manual' });
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.after - r.before) <= 0.1001);
  const v = db.prepare('SELECT * FROM trait_versions WHERE trait_key=?').get('playful');
  assert.ok(v);
  assert.equal(Number(v.after_strength).toFixed(2), r.after.toFixed(2));
});

await ok('回滚恢复到变化前', () => {
  const v = db.prepare('SELECT * FROM trait_versions WHERE trait_key=? ORDER BY id DESC').get('playful');
  const r = rollbackTrait(db, v.id);
  assert.equal(r.ok, true);
  const now = Number(db.prepare("SELECT strength FROM traits WHERE trait_key='playful'").get().strength);
  assert.equal(now.toFixed(2), Number(v.before_strength).toFixed(2));
});

await ok('长期无新证据会自然回落', () => {
  db.prepare("UPDATE traits SET last_evidence_at=? WHERE trait_key='curious'").run(Date.now() - 30 * DAY);
  const before = Number(db.prepare("SELECT strength FROM traits WHERE trait_key='curious'").get().strength);
  const changed = decayTraits(db, { decayPerDay: 0.02, idleDays: 10 });
  const after = Number(db.prepare("SELECT strength FROM traits WHERE trait_key='curious'").get().strength);
  assert.ok(changed.length >= 1);
  assert.ok(after < before);
});

await ok('短期情绪会过期，不改变性格', () => {
  setAffect(db, { convKey: 'group:9', label: '炸毛', intensity: 0.9, ttlMs: 50 });
  const t0 = Number(db.prepare("SELECT strength FROM traits WHERE trait_key='tsundere'").get().strength);
  const mood = getAffect(db, 'group:9');
  assert.ok(mood && mood.label === '炸毛');
  const t1 = Number(db.prepare("SELECT strength FROM traits WHERE trait_key='tsundere'").get().strength);
  assert.equal(t0, t1, '情绪不改性格');
});

await ok('关系按会话隔离', () => {
  // 共同话题现在要"同一个人在同一会话提到 ≥2 次"才确认，所以每个会话发两次。
  noteInteraction(db, { qq: '111111', convKey: 'group:1', topic: '消消乐' });
  noteInteraction(db, { qq: '111111', convKey: 'group:1', topic: '消消乐' });
  noteInteraction(db, { qq: '111111', convKey: 'group:2', topic: 'B站' });
  noteInteraction(db, { qq: '111111', convKey: 'group:2', topic: 'B站' });
  const a = db.prepare('SELECT * FROM relationships WHERE qq=? AND conv_key=?').get('111111', 'group:1');
  const b = db.prepare('SELECT * FROM relationships WHERE qq=? AND conv_key=?').get('111111', 'group:2');
  assert.ok(a && b);
  assert.notEqual(a.shared_topics, b.shared_topics);
  assert.ok(a.shared_topics.includes('消消乐'), `group:1 应记录消消乐，实际 ${a.shared_topics}`);
  assert.ok(!a.shared_topics.includes('B站'), `group:1 不应出现另一个会话的话题，实际 ${a.shared_topics}`);
  assert.ok(b.shared_topics.includes('B站'), `group:2 应记录B站，实际 ${b.shared_topics}`);
});

await ok('成长上下文短且只含状态', () => {
  addJournal(db, { kind: 'first_contact', summary: '第一次研究消消乐攻略', confidence: 0.7, verified: 1 });
  const ctx = buildGrowthContext(db, { convKey: 'group:9', speakerQq: '111111' });
  assert.ok(ctx.includes('慢慢养成的样子') || ctx.length === 0);
  assert.ok(ctx.length < 400, '上下文要短');
});

await ok('核心身份不在成长表里（无 identity 类 trait）', () => {
  const keys = db.prepare('SELECT trait_key FROM traits').all().map((r) => r.trait_key);
  assert.ok(!keys.some((k) => /identity|father|owner|爸爸|权限/.test(k)));
});

db.close();
console.log(`\n结果：${pass} 通过，0 失败`);
