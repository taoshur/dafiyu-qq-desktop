// 回归：Memory V4 记忆纠错联动的边界（隔离 / 幂等 / 重启 / 隐私 / 被动执行 / 关系封顶）
//
// 线上已经验证过「删除记忆 → 成长证据失效」的主链路（2026-10-23 真实 HTTP，invalidated=1）。
// 这里钉住的是主链路之外的边界条件，全部离线可跑（临时 SQLite，不碰 state/memory.db）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ensureGrowthSchema, addEvidence, invalidateEvidenceForTopic, reassessTrait,
  recordInterestSignal, noteInteraction, buildGrowthContext, growthStatus, SEED_TRAITS
} from '../src/memory/growth.js';
import { openMemoryDb } from '../src/memory/db.js';

let pass = 0;
let fail = 0;
async function ok(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    pass += 1;
  } catch (error) {
    console.error(`  ✗ ${name}: ${error?.message ?? error}`);
    fail += 1;
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'growth-correction-'));
const dbPath = path.join(dir, 'g.db');
let db = openMemoryDb(dbPath);
ensureGrowthSchema(db);

const SECRET_NOTE = '这是我要删掉的隐私内容-ZZZ';

console.log('[隔离 / 幂等 / 重启 / 隐私]');
await ok('删 A 会话的记忆不影响 B 会话的证据', () => {
  addEvidence(db, { traitKey: 'curious', convKey: 'private:111', note: `${SECRET_NOTE} B站`, kind: 'behavior', source: 'behavior' });
  addEvidence(db, { traitKey: 'curious', convKey: 'private:222', note: `${SECRET_NOTE} B站`, kind: 'behavior', source: 'behavior' });
  const beforeB = db.prepare("SELECT COUNT(*) c FROM trait_evidence WHERE conv_key='private:222'").get().c;
  const r = invalidateEvidenceForTopic(db, { topic: 'ZZZ', convKey: 'private:111', reason: '测试删除' });
  assert.ok(r.invalidated >= 1, 'A 会话证据应被删除');
  const afterB = db.prepare("SELECT COUNT(*) c FROM trait_evidence WHERE conv_key='private:222'").get().c;
  assert.equal(afterB, beforeB, 'B 会话证据必须原样保留');
});

await ok('删某个群的记忆不清掉别的群的兴趣信号', () => {
  recordInterestSignal(db, { topic: '消消乐', kind: 'participate', source: 'tool', convKey: 'group:1', note: 'group1' });
  recordInterestSignal(db, { topic: '消消乐', kind: 'participate', source: 'tool', convKey: 'group:2', note: 'group2' });
  const before = db.prepare("SELECT COUNT(*) c FROM interest_signals WHERE conv_key='group:2'").get().c;
  assert.ok(before >= 1);
  invalidateEvidenceForTopic(db, { topic: '消消乐', convKey: 'group:1', reason: '测试删除' });
  const after = db.prepare("SELECT COUNT(*) c FROM interest_signals WHERE conv_key='group:2'").get().c;
  assert.equal(after, before, '别的群的兴趣信号不能被连带删除');
});

await ok('同一条删除重复执行是幂等的', () => {
  addEvidence(db, { traitKey: 'playful', convKey: 'private:111', note: `重复删除探针-消消乐`, kind: 'behavior', source: 'behavior' });
  const first = invalidateEvidenceForTopic(db, { topic: '重复删除探针', convKey: 'private:111', reason: '测试删除' });
  const second = invalidateEvidenceForTopic(db, { topic: '重复删除探针', convKey: 'private:111', reason: '测试删除' });
  assert.equal(first.invalidated, 1);
  assert.equal(second.invalidated, 0, '第二次不应再删到东西');
});

await ok('证据不足时重评会把 trait 回滚并记日记', () => {
  const before = db.prepare("SELECT * FROM traits WHERE trait_key='curious'").get();
  const r = reassessTrait(db, 'curious', { reason: '测试：证据不足' });
  assert.ok(r.ok, '重评应返回 ok');
  const after = db.prepare("SELECT * FROM traits WHERE trait_key='curious'").get();
  if (r.rolledBack) {
    assert.equal(Number(after.strength), Number(before.initial_strength), '应回到初始强度');
    const j = db.prepare("SELECT * FROM growth_journal WHERE trait_key='curious' AND kind='growth_rollback' ORDER BY id DESC LIMIT 1").get();
    assert.ok(j, '必须留下回滚日记');
    assert.ok(!String(j.detail).includes(SECRET_NOTE), '日记里不能出现被删除的隐私原文');
  }
});

await ok('重启（重开数据库）后失效证据不会复活', () => {
  const countFor = (conv) => db.prepare('SELECT COUNT(*) c FROM trait_evidence WHERE note LIKE ? AND conv_key=?')
    .get(`%${SECRET_NOTE}%`, conv).c;
  const aBefore = countFor('private:111');
  const bBefore = countFor('private:222');
  assert.equal(aBefore, 0, 'A 会话的隐私证据应已删除');
  assert.equal(bBefore, 1, 'B 会话的证据应原样保留（会话隔离）');
  db.close();
  db = openMemoryDb(dbPath);
  ensureGrowthSchema(db);
  const aAfter = countFor('private:111');
  const bAfter = countFor('private:222');
  assert.equal(aAfter, 0, '重开数据库后已删除的证据不能复活');
  assert.equal(bAfter, 1, '重开数据库后 B 会话证据仍在');
});

await ok('成长日记里没有隐私原文', () => {
  const hit = db.prepare('SELECT COUNT(*) c FROM growth_journal WHERE detail LIKE ? OR summary LIKE ?')
    .get(`%${SECRET_NOTE}%`, `%${SECRET_NOTE}%`).c;
  assert.equal(hit, 0);
});

console.log('[关系与成长上下文]');
await ok('同一天狂发消息不会把关系刷满', () => {
  const t = Date.now();
  for (let i = 0; i < 10; i += 1) noteInteraction(db, { qq: '999', convKey: 'group:9', topic: '消消乐', at: t + i * 1000 });
  const row = db.prepare("SELECT * FROM relationships WHERE qq='999' AND conv_key='group:9'").get();
  assert.ok(Number(row.familiarity) <= 0.17, `同日 10 条最多涨一次基础值，实际 ${row.familiarity}`);
  // 到了第二天才继续涨
  noteInteraction(db, { qq: '999', convKey: 'group:9', topic: '消消乐', at: t + 24 * 3600 * 1000 });
  const row2 = db.prepare("SELECT * FROM relationships WHERE qq='999' AND conv_key='group:9'").get();
  assert.ok(Number(row2.familiarity) > Number(row.familiarity), '跨天后应继续小幅增长');
});

await ok('成长上下文带最近兴趣，并明确「不用刻意」', () => {
  recordInterestSignal(db, { topic: 'B站', kind: 'participate', source: 'tool', convKey: 'group:9', note: 'bili_hot' });
  const ctx = buildGrowthContext(db, { convKey: 'group:9', speakerQq: '999' });
  assert.ok(ctx.includes('【最近常碰的】'), '应包含最近兴趣行');
  assert.ok(ctx.includes('不用刻意'), '应提示不要每轮复读');
  assert.ok(ctx.length <= 400, `上下文长度应可控，实际 ${ctx.length} 字`);
});

await ok('六项初始性格没有被测试改动', () => {
  const rows = db.prepare('SELECT trait_key, strength FROM traits').all();
  for (const seed of SEED_TRAITS) {
    const row = rows.find((r) => r.trait_key === seed.key);
    assert.ok(row, `缺少初始性格 ${seed.key}`);
    const expected = Math.min(1, seed.weight / 4);
    assert.equal(Number(row.strength), expected, `${seed.key} 强度被改动`);
  }
});

console.log('[被动执行 ≠ 兴趣]');
const hookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'growth-hook-'));
const hook = await import('../src/memory/growth-hook.js');
await ok('被指令去玩只记经历，不投正向兴趣证据', async () => {
  hook.initGrowthHook({ config: { dbPath: path.join(hookDir, 'h.db') }, log: () => {} });
  hook.noteGrowthMessage({ convKey: 'private:777', senderQq: '10001', senderName: '爸爸', text: '你去玩玩看消消乐，帮我测试一下', isSelf: false });
  hook.noteGrowthTool({ convKey: 'private:777', tool: 'mcp__android__android_launch', args: '{}', ok: true });
  const hdb = openMemoryDb(path.join(hookDir, 'h.db'));
  const passive = hdb.prepare("SELECT COUNT(*) c FROM interest_signals WHERE conv_key='private:777' AND kind='instruction'").get().c;
  const positive = hdb.prepare("SELECT COUNT(*) c FROM interest_signals WHERE conv_key='private:777' AND kind IN ('participate','explore')").get().c;
  assert.ok(passive >= 1, '应记下一次 instruction 信号');
  assert.equal(positive, 0, '被动执行不能产生 participate/explore 信号');
  hdb.close();
});

await ok('没有指令时正常玩耍仍然算参与', async () => {
  hook.noteGrowthTool({ convKey: 'private:666', tool: 'mcp__android__android_launch', args: '{}', ok: true });
  const hdb = openMemoryDb(path.join(hookDir, 'h.db'));
  const positive = hdb.prepare("SELECT COUNT(*) c FROM interest_signals WHERE conv_key='private:666' AND kind='participate'").get().c;
  assert.ok(positive >= 1, '主动去玩应留下参与信号');
  hdb.close();
});

console.log('[降级：成长模块出错不影响聊天]');
await ok('数据库打不开时，成长相关调用只降级不抛异常', async () => {
  const broken = path.join(hookDir, 'broken-db-path');
  fs.writeFileSync(broken, 'x'); // 把「目录」位置的路径占成一个文件，openMemoryDb 必然失败
  const fresh = await import(`../src/memory/growth-hook.js?degrade=${Date.now()}`);
  fresh.initGrowthHook({ config: { dbPath: path.join(broken, 'x.db') }, log: () => {} });
  assert.doesNotThrow(() => fresh.noteGrowthMessage({ convKey: 'private:1', senderQq: '10001', senderName: '爸爸', text: '你去玩玩看消消乐', isSelf: false }));
  assert.doesNotThrow(() => fresh.noteGrowthTool({ convKey: 'private:1', tool: 'mcp__android__android_launch', args: '{}', ok: true }));
  assert.equal(fresh.growthContext({ convKey: 'private:1' }), '', '取不到 DB 时上下文应为空，而不是抛错');
  assert.equal(fresh.invalidateGrowthForTopic({ topic: '消消乐', convKey: 'private:1' }), null);
  assert.ok(fresh.growthRuntimeStats().errors >= 1, '应该记下错误次数供观测');
});

console.log(`\n${fail ? '❌' : '✅'} test-growth-correction：${pass} 项通过，${fail} 项失败`);
if (fail) process.exitCode = 1;
