// 回归：Memory V4 审计发现的缺陷（trait_versions 缺失、证据丢 conv_key、只读工具被当成参与）
//
// 对应审计结论：
//  1) 兴趣形成必须写 trait_versions（可追溯 + 可 rollback）
//  2) 兴趣证据必须带 conv_key（按会话删除记忆时才能失效）
//  3) 只读工具（看屏幕/读动态/刷热门）记 explore，不算 participate
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ensureGrowthSchema, recordInterestSignal, createInterestTraits, invalidateEvidenceForTopic,
  rollbackTrait, reassessTrait
} from '../src/memory/growth.js';
import { openMemoryDb } from '../src/memory/db.js';

let pass = 0;
let fail = 0;
function ok(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass += 1; } catch (error) {
    console.error(`  ✗ ${name}: ${error?.message ?? error}`); fail += 1;
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'growth-versions-'));
const dbPath = path.join(dir, 'g.db');
let db = openMemoryDb(dbPath);
ensureGrowthSchema(db);

const day1 = Date.now() - 36 * 3600 * 1000;
const day2 = Date.now() - 2 * 3600 * 1000;

function seedSignals(topic, convs) {
  let i = 0;
  for (const conv of convs) {
    for (const at of [day1, day2]) {
      i += 1;
      recordInterestSignal(db, {
        topic, kind: 'participate', source: 'tool', convKey: conv, at, note: `tap-${conv}-${i}`, weight: 1
      });
    }
  }
}

console.log('[兴趣形成：版本记录 + 证据归属]');
seedSignals('测试乐园', ['group:1', 'group:2']);
let created = [];
ok('能形成兴趣', () => {
  created = createInterestTraits(db);
  assert.equal(created.length, 1, `期望 1 个兴趣，实际 ${created.length}`);
});
ok('写入 trait_versions（before=0 / after=0.35）', () => {
  const versions = db.prepare("SELECT * FROM trait_versions WHERE trait_key='interest:测试乐园' ORDER BY id").all();
  assert.equal(versions.length, 1, '兴趣形成必须留下 1 条版本');
  assert.equal(Number(versions[0].before_strength), 0);
  assert.equal(Number(versions[0].after_strength), 0.35);
  assert.equal(versions[0].source, 'system');
  const ids = JSON.parse(versions[0].evidence_ids || '[]');
  assert.ok(ids.length >= 2, `evidence_ids 应记录证据 id，实际 ${ids.length}`);
});
ok('兴趣证据带 conv_key（不再全是 NULL）', () => {
  const rows = db.prepare("SELECT conv_key FROM trait_evidence WHERE trait_key='interest:测试乐园'").all();
  assert.ok(rows.length >= 2);
  assert.ok(rows.every((r) => r.conv_key), `应全部带 conv_key，实际 ${JSON.stringify(rows)}`);
});
ok('成长日记记录 before=0.00 与证据 id', () => {
  const j = db.prepare("SELECT * FROM growth_journal WHERE trait_key='interest:测试乐园' AND kind='interest_formed' ORDER BY id DESC").get();
  assert.ok(j, '应有 interest_formed 日记');
  assert.equal(j.before_state, '0.00');
  assert.equal(j.after_state, '0.35');
  assert.ok(JSON.parse(j.evidence_ids || '[]').length >= 2);
});

console.log('[回滚]');
ok('rollbackTrait(版本id) 能把兴趣强度回滚到 0', () => {
  const v = db.prepare("SELECT id FROM trait_versions WHERE trait_key='interest:测试乐园' ORDER BY id DESC LIMIT 1").get();
  const r = rollbackTrait(db, v.id);
  assert.equal(r.ok, true);
  const t = db.prepare("SELECT strength FROM traits WHERE trait_key='interest:测试乐园'").get();
  assert.equal(Number(t.strength), 0);
});

console.log('[纠错：按会话失效证据 → 重评 → 回滚并留版本]');
ok('删除某个会话的记忆后，该会话的兴趣证据失效', () => {
  // 重新造一个兴趣（上一段回滚后强度 0，但 trait 还在；这里换 topic 避免干扰）
  seedSignals('测试棋局', ['group:7', 'group:8']);
  createInterestTraits(db);
  const before = db.prepare("SELECT COUNT(*) c FROM trait_evidence WHERE trait_key='interest:测试棋局' AND conv_key='group:7'").get().c;
  assert.ok(before >= 1, '应有 group:7 的证据');
  const r = invalidateEvidenceForTopic(db, { topic: '测试棋局', convKey: 'group:7', reason: '测试删除' });
  assert.ok(r.invalidated >= 1, `应失效至少 1 条，实际 ${r.invalidated}`);
  const after = db.prepare("SELECT COUNT(*) c FROM trait_evidence WHERE trait_key='interest:测试棋局' AND conv_key='group:7'").get().c;
  assert.equal(after, 0);
  const other = db.prepare("SELECT COUNT(*) c FROM trait_evidence WHERE trait_key='interest:测试棋局' AND conv_key='group:8'").get().c;
  assert.ok(other >= 1, '别的会话证据不能受影响');
});
ok('证据不足时重评回滚，并写入 correction 版本', () => {
  const t = db.prepare("SELECT strength FROM traits WHERE trait_key='interest:测试棋局'").get();
  assert.equal(Number(t.strength), 0, '证据不足应回滚到 0');
  const v = db.prepare("SELECT * FROM trait_versions WHERE trait_key='interest:测试棋局' AND source='correction' ORDER BY id DESC LIMIT 1").get();
  assert.ok(v, '回滚必须留 trait_versions（source=correction）');
});

console.log('[只读工具 ≠ 参与]');
const hookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'growth-readonly-'));
const hook = await import(`../src/memory/growth-hook.js?readonly=${Date.now()}`);
hook.initGrowthHook({ config: { dbPath: path.join(hookDir, 'h.db') }, log: () => {} });
function kindsFor(conv) {
  const hdb = openMemoryDb(path.join(hookDir, 'h.db'));
  try {
    return hdb.prepare('SELECT kind, source FROM interest_signals WHERE conv_key=?').all(conv);
  } finally { hdb.close(); }
}
await ok('android_screenshot 只记 explore（不是参与）', () => {
  hook.noteGrowthTool({ convKey: 'private:901', tool: 'mcp__android__android_screenshot', args: '{}', ok: true });
  const rows = kindsFor('private:901');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'explore');
  assert.equal(rows[0].source, 'tool-read');
});
await ok('android_launch 记 participate', () => {
  hook.noteGrowthTool({ convKey: 'private:902', tool: 'mcp__android__android_launch', args: '{}', ok: true });
  const rows = kindsFor('private:902');
  assert.equal(rows[0].kind, 'participate');
});
await ok('qq_qzone_feeds（读动态）记 explore，qq_post_qzone（发说说）记 participate', () => {
  hook.noteGrowthTool({ convKey: 'private:903', tool: 'mcp__snowluma__qq_qzone_feeds', args: '{}', ok: true });
  hook.noteGrowthTool({ convKey: 'private:903', tool: 'mcp__snowluma__qq_post_qzone', args: '{}', ok: true });
  const rows = kindsFor('private:903');
  assert.deepEqual(rows.map((r) => r.kind).sort(), ['explore', 'participate']);
});
await ok('bili_hot_videos（刷热门）不算参与', () => {
  hook.noteGrowthTool({ convKey: 'private:904', tool: 'mcp__bilibili__bili_hot_videos', args: '{}', ok: true });
  const rows = kindsFor('private:904');
  assert.equal(rows[0].kind, 'explore');
});

console.log(`\n${fail ? '❌' : '✅'} test-growth-versions：${pass} 项通过，${fail} 项失败`);
if (fail) process.exitCode = 1;
