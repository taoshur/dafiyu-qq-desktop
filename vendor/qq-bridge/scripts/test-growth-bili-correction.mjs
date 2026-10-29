// 回归：B站错误兴趣的撤销 + 不会被历史只读证据自动恢复
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  ensureGrowthSchema, recordInterestSignal, createInterestTraits, decayTraits,
  reassessTrait, buildGrowthContext
} from '../src/memory/growth.js';
import { openMemoryDb } from '../src/memory/db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
function ok(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass += 1; } catch (error) {
    console.error(`  ✗ ${name}: ${error?.message ?? error}`); fail += 1;
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bili-correct-'));
const dbPath = path.join(dir, 'memory.db');
const db = openMemoryDb(dbPath);
ensureGrowthSchema(db);

const day1 = Date.now() - 36 * 3600 * 1000;
const day2 = Date.now() - 2 * 3600 * 1000;

// 复刻真实形态：5 条只读工具被记成 participate（跨两天）+ 2 条 explore
const tools = ['bili_hot_videos', 'bili_hot_videos', 'bili_hot_buzzwords', 'bili_hot_videos', 'bili_hot_videos'];
let i = 0;
for (const tool of tools) {
  recordInterestSignal(db, { topic: 'B站', kind: 'participate', source: 'tool', convKey: `group:${(i % 3) + 1}`, note: `bilibili__${tool}`, at: i === 0 ? day1 : day1 + i * 1000 });
  i += 1;
}
recordInterestSignal(db, { topic: 'B站', kind: 'explore', source: 'tool-read', convKey: 'group:1', note: 'bilibili__bili_hot_videos', at: day2 });
recordInterestSignal(db, { topic: 'B站', kind: 'explore', source: 'tool-read', convKey: 'group:1', note: 'bilibili__bili_hot_buzzwords', at: day2 });

// 另一个正常兴趣作对照（跨两天、至少 3 条参与才够形成门槛）
recordInterestSignal(db, { topic: '消消乐', kind: 'participate', source: 'tool', convKey: 'group:2', note: 'android__android_batch', at: day1 });
recordInterestSignal(db, { topic: '消消乐', kind: 'participate', source: 'tool', convKey: 'group:3', note: 'android__android_tap', at: day2 });
recordInterestSignal(db, { topic: '消消乐', kind: 'participate', source: 'tool', convKey: 'group:4', note: 'android__android_swipe', at: day2 + 1000 });

createInterestTraits(db);
const biliVersion = db.prepare("SELECT id FROM trait_versions WHERE trait_key='interest:B站' ORDER BY id DESC LIMIT 1").get().id;
const biliBefore = db.prepare("SELECT strength, status, evidence_count FROM traits WHERE trait_key='interest:B站'").get();
const playBefore = db.prepare("SELECT strength, status, evidence_count FROM traits WHERE trait_key='interest:消消乐'").get();
console.log('形成后 B站:', JSON.stringify(biliBefore), ' 消消乐:', JSON.stringify(playBefore));

ok('B站错误兴趣确实形成（0.35）', () => assert.equal(Number(biliBefore.strength), 0.35));
const evidenceBefore = db.prepare("SELECT COUNT(*) c FROM trait_evidence WHERE trait_key='interest:B站'").get().c;
db.close();

// 用真实修正脚本（在副本上）执行
const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'growth-correct-bili.mjs'), '--db', dbPath, '--apply', '--version', String(biliVersion)], { encoding: 'utf8' });
ok('修正脚本执行成功', () => {
  assert.equal(run.status, 0, `退出码 ${run.status}\n${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /APPLY/);
});

const db2 = openMemoryDb(dbPath);
ok('B站兴趣被撤销：strength=0, status=rejected', () => {
  const t = db2.prepare("SELECT strength, status FROM traits WHERE trait_key='interest:B站'").get();
  assert.equal(Number(t.strength), 0);
  assert.equal(t.status, 'rejected');
});
ok('证据一条没删（保留原始事实）', () => {
  const c = db2.prepare("SELECT COUNT(*) c FROM trait_evidence WHERE trait_key='interest:B站'").get().c;
  assert.equal(Number(c), Number(evidenceBefore));
});
ok('版本历史保留并可追溯（correction 行 + evidence_ids 原样）', () => {
  const rows = db2.prepare("SELECT * FROM trait_versions WHERE trait_key='interest:B站' ORDER BY id").all();
  assert.ok(rows.length >= 2, `应有形成+修正两条，实际 ${rows.length}`);
  const last = rows[rows.length - 1];
  assert.equal(last.source, 'correction');
  assert.equal(Number(last.before_strength), 0.35);
  assert.equal(Number(last.after_strength), 0);
  assert.ok(JSON.parse(last.evidence_ids || '[]').length >= 5);
  const j = db2.prepare("SELECT * FROM growth_journal WHERE trait_key='interest:B站' AND kind='growth_rollback' ORDER BY id DESC").get();
  assert.ok(j, '应有撤销日记');
});
ok('其它兴趣不受影响（消消乐仍是 0.35 active）', () => {
  const t = db2.prepare("SELECT strength, status FROM traits WHERE trait_key='interest:消消乐'").get();
  assert.equal(Number(t.strength), 0.35);
  assert.equal(t.status, 'active');
});
ok('不会被 createInterestTraits 重新创建', () => {
  createInterestTraits(db2);
  const t = db2.prepare("SELECT strength, status FROM traits WHERE trait_key='interest:B站'").get();
  assert.equal(Number(t.strength), 0);
  assert.equal(t.status, 'rejected');
});
ok('闲置衰减不会把 rejected 兴趣抬回 0.15', () => {
  db2.prepare("UPDATE traits SET last_evidence_at=? WHERE trait_key='interest:B站'").run(Date.now() - 60 * 24 * 3600 * 1000);
  decayTraits(db2);
  const t = db2.prepare("SELECT strength, status FROM traits WHERE trait_key='interest:B站'").get();
  assert.equal(Number(t.strength), 0, `衰减后强度应保持 0，实际 ${t.strength}`);
  assert.equal(t.status, 'rejected');
});
ok('证据减少后重评仍保持 rejected（不会复活）', () => {
  db2.prepare("DELETE FROM trait_evidence WHERE id IN (SELECT id FROM trait_evidence WHERE trait_key='interest:B站' ORDER BY id LIMIT 4)").run();
  reassessTrait(db2, 'interest:B站', { reason: '测试：证据不足' });
  const t = db2.prepare("SELECT strength, status FROM traits WHERE trait_key='interest:B站'").get();
  assert.equal(Number(t.strength), 0);
  assert.equal(t.status, 'rejected');
});
ok('成长上下文不再注入「喜欢B站」', () => {
  const ctx = buildGrowthContext(db2, { convKey: 'group:1', speakerQq: '1' });
  assert.ok(!ctx.includes('喜欢B站'), `上下文不应包含被撤销的兴趣：${ctx.slice(0, 200)}`);
});
db2.close();

console.log(`\n${fail ? '❌' : '✅'} test-growth-bili-correction：${pass} 项通过，${fail} 项失败`);
if (fail) process.exitCode = 1;
