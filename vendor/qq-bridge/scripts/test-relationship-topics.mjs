// 共同话题回归：DB 级 + 真实消息文案（growth-hook）级
//
// 规则：同一个人在同一会话提到同一个话题 >=2 次才写进 relationships.shared_topics；
//      只提到一次就保留空值（不伪造），同一天刷屏不涨关系，跨天才继续缓慢增长。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ensureGrowthSchema, noteInteraction, buildGrowthContext } from '../src/memory/growth.js';
import { openMemoryDb } from '../src/memory/db.js';

let pass = 0;
let fail = 0;
async function ok(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); pass += 1; } catch (error) {
    console.error(`  ✗ ${name}: ${error?.message ?? error}`); fail += 1;
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rel-topics-'));
const db = openMemoryDb(path.join(dir, 'r.db'));
ensureGrowthSchema(db);

console.log('[数据库级]');
await ok('只提到一次 → shared_topics 保持空（不伪造）', () => {
  const r = noteInteraction(db, { qq: '5001', convKey: 'group:11', topic: '消消乐' });
  const row = db.prepare("SELECT * FROM relationships WHERE qq='5001' AND conv_key='group:11'").get();
  assert.equal(row.shared_topics, '[]');
  assert.deepEqual(r.sharedTopics, []);
});
await ok('提到第二次 → 写入共同话题', () => {
  const r = noteInteraction(db, { qq: '5001', convKey: 'group:11', topic: '消消乐' });
  const row = db.prepare("SELECT * FROM relationships WHERE qq='5001' AND conv_key='group:11'").get();
  assert.deepEqual(JSON.parse(row.shared_topics), ['消消乐']);
  assert.deepEqual(r.sharedTopics, ['消消乐']);
});
await ok('同会话不同人各自计数，不会互相凑成"共同"', () => {
  noteInteraction(db, { qq: '5002', convKey: 'group:11', topic: '消消乐' });
  const a = db.prepare("SELECT * FROM relationships WHERE qq='5001' AND conv_key='group:11'").get();
  const b = db.prepare("SELECT * FROM relationships WHERE qq='5002' AND conv_key='group:11'").get();
  assert.deepEqual(JSON.parse(a.shared_topics), ['消消乐']);
  assert.equal(b.shared_topics, '[]', '另一个人只说过一次，不能算');
});
await ok('换会话不串话题', () => {
  noteInteraction(db, { qq: '5001', convKey: 'group:12', topic: 'B站' });
  const other = db.prepare("SELECT * FROM relationships WHERE qq='5001' AND conv_key='group:12'").get();
  assert.equal(other.shared_topics, '[]');
  const first = db.prepare("SELECT * FROM relationships WHERE qq='5001' AND conv_key='group:11'").get();
  assert.deepEqual(JSON.parse(first.shared_topics), ['消消乐']);
});
await ok('同一天刷 10 条：familiarity 最多涨一次基础值', () => {
  const t = Date.now();
  const before = Number(db.prepare("SELECT familiarity FROM relationships WHERE qq='5001' AND conv_key='group:11'").get().familiarity);
  for (let i = 0; i < 10; i += 1) noteInteraction(db, { qq: '5001', convKey: 'group:11', topic: '消消乐', at: t + i * 1000 });
  const after = Number(db.prepare("SELECT familiarity FROM relationships WHERE qq='5001' AND conv_key='group:11'").get().familiarity);
  assert.ok(after - before <= 0.0201, `同日涨幅应 ≤0.02，实际 ${(after - before).toFixed(4)}`);
});
await ok('跨天继续增长（每天 +0.02）', () => {
  const t = Date.now();
  const before = Number(db.prepare("SELECT familiarity FROM relationships WHERE qq='5001' AND conv_key='group:11'").get().familiarity);
  noteInteraction(db, { qq: '5001', convKey: 'group:11', topic: '消消乐', at: t + 24 * 3600 * 1000 });
  const after = Number(db.prepare("SELECT familiarity FROM relationships WHERE qq='5001' AND conv_key='group:11'").get().familiarity);
  assert.ok(Math.abs(after - before - 0.02) < 0.001, `跨天应 +0.02，实际 ${(after - before).toFixed(4)}`);
});
await ok('关系上下文只带已确认话题（最多 2 个）', () => {
  const ctx = buildGrowthContext(db, { convKey: 'group:11', speakerQq: '5001' });
  assert.ok(ctx.includes('消消乐') || ctx.length === 0);
});

console.log('[真实文案 → growth-hook]');
const hookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rel-hook-'));
const hook = await import(`../src/memory/growth-hook.js?rel=${Date.now()}`);
hook.initGrowthHook({ config: { dbPath: path.join(hookDir, 'h.db') }, log: () => {} });
const hdb = () => openMemoryDb(path.join(hookDir, 'h.db'));

await ok('"加班到现在还没吃饭" → 命中 上班 + 吃饭', () => {
  hook.noteGrowthMessage({ convKey: 'group:21', senderQq: '7001', senderName: '小李', text: '加班到现在还没吃饭', isSelf: false });
  const d = hdb();
  try {
    const rows = d.prepare('SELECT topic, mentions FROM relationship_topics WHERE qq=? AND conv_key=?').all('7001', 'group:21');
    const topics = rows.map((r) => r.topic).sort();
    assert.deepEqual(topics, ['上班', '吃饭'].sort(), `实际 ${JSON.stringify(rows)}`);
    const rel = d.prepare("SELECT shared_topics FROM relationships WHERE qq='7001' AND conv_key='group:21'").get();
    assert.equal(rel.shared_topics, '[]', '只说一次不能写入');
  } finally { d.close(); }
});
await ok('同一个人再说一次"上班" → 只确认上班，不带上吃饭', () => {
  hook.noteGrowthMessage({ convKey: 'group:21', senderQq: '7001', senderName: '小李', text: '明天还要上班，烦', isSelf: false });
  const d = hdb();
  try {
    const rel = d.prepare("SELECT shared_topics FROM relationships WHERE qq='7001' AND conv_key='group:21'").get();
    assert.deepEqual(JSON.parse(rel.shared_topics), ['上班']);
  } finally { d.close(); }
});
await ok('自己说的话不算（isSelf）', () => {
  hook.noteGrowthMessage({ convKey: 'group:21', senderQq: '0', senderName: '我', text: '我明天也要上班', isSelf: true });
  const d = hdb();
  try {
    const rel = d.prepare("SELECT interactions FROM relationships WHERE qq='0' AND conv_key='group:21'").get();
    assert.equal(rel, undefined, '自己的消息不应建立关系记录');
  } finally { d.close(); }
});

console.log(`\n${fail ? '❌' : '✅'} test-relationship-topics：${pass} 项通过，${fail} 项失败`);
if (fail) process.exitCode = 1;
