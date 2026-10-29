// 回归：复核候选的可观测性（列表 / 统计 / 不重复提醒）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openMemoryDb } from '../src/memory/db.js';
import { ensureGrowthSchema, recordInterestSignal, createInterestTraits, addEvidence, reviewRejectedInterests } from '../src/memory/growth.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 24 * 3600 * 1000;
let pass = 0;
let fail = 0;
function ok(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass += 1; } catch (error) {
    console.error(`  ✗ ${name}: ${error?.message ?? error}`); fail += 1;
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cand-report-'));
const dbPath = path.join(dir, 'memory.db');
const db = openMemoryDb(dbPath);
ensureGrowthSchema(db);

// 造数据：一个被否决且已积满新证据的兴趣 → 复核候选
const old = Date.now() - 10 * DAY;
for (let i = 0; i < 5; i += 1) {
  recordInterestSignal(db, { topic: 'B站', kind: 'participate', source: 'tool', convKey: `g:${i}`, note: 'bilibili__bili_hot_videos', at: (i < 3 ? old : old + DAY) + i * 1000 });
}
createInterestTraits(db);
const t = db.prepare("SELECT * FROM traits WHERE trait_key='interest:B站'").get();
db.prepare("UPDATE traits SET status='rejected', strength=0 WHERE trait_key='interest:B站'").run();
db.prepare("INSERT INTO trait_versions(trait_key,before_strength,after_strength,reason,source,at) VALUES(?,?,?,?,?,?)")
  .run('interest:B站', 0.35, 0, '人工复核：只读证据不成立', 'correction', Date.now() - 5 * DAY);
for (let i = 0; i < 5; i += 1) {
  addEvidence(db, { traitKey: 'interest:B站', convKey: `p:${i}`, note: `bilibili__bili_reply 真实${i}`, kind: 'behavior', source: 'behavior', at: Date.now() - (i < 3 ? 2 : 1) * DAY + i * 1000 });
}
const created = reviewRejectedInterests(db);
assert.equal(created.length, 1, '应产出 1 条复核候选');
// 再跑一次不应重复
assert.equal(reviewRejectedInterests(db).length, 0);

// 另外造一条已驳回的复核候选和一条已生效的普通候选，验证报告只列待审、统计覆盖全部
db.prepare("INSERT INTO growth_candidates(trait_key,kind,before_strength,proposed_strength,delta,evidence_count,distinct_days,span_days,reason,status,created_at,reviewed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
  .run('interest:消消乐', 'review', 0, 0.35, 0.35, 6, 2, 2, '旧候选', 'rejected', Date.now() - 3 * DAY, Date.now() - 2 * DAY);
db.prepare("INSERT INTO growth_candidates(trait_key,kind,before_strength,proposed_strength,delta,evidence_count,distinct_days,span_days,reason,status,created_at,applied_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
  .run('cute', 'strengthen', 0.75, 0.77, 0.02, 8, 3, 3, '普通候选', 'applied', Date.now() - 4 * DAY, Date.now() - 4 * DAY);
db.close();

const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'growth.mjs'), '--db', dbPath, ...a], { encoding: 'utf8' });

console.log('[查询]');
ok('待审复核候选能看到证据数、天数、生成时间、状态', () => {
  const r = run('--candidates', '--kind', 'review', '--status', 'pending');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[review\] interest:B站/);
  assert.match(r.stdout, /证据 5 条 \/ 2 天/);
  assert.match(r.stdout, /生成 /);
  assert.match(r.stdout, /pending/);
});
ok('已处理候选不出现在待审列表里（不重复提醒）', () => {
  const r = run('--candidates', '--status', 'pending');
  assert.ok(!r.stdout.includes('旧候选'), '驳回的旧候选不应出现在 pending 列表');
  assert.ok(!r.stdout.includes('普通候选'), '已生效候选不应出现在 pending 列表');
  assert.ok(r.stdout.includes('interest:B站'));
});
ok('已驳回候选可单独查看，并带处理时间', () => {
  const r = run('--candidates', '--kind', 'review', '--status', 'rejected');
  assert.match(r.stdout, /旧候选/);
  assert.match(r.stdout, /处理于 /);
});
ok('统计按 kind/status 汇总', () => {
  const r = run('--candidate-stats');
  const lines = r.stdout.trim().split(/\r?\n/);
  assert.ok(lines.some((l) => l.startsWith('review\tpending\t1')), r.stdout);
  assert.ok(lines.some((l) => l.startsWith('review\trejected\t1')), r.stdout);
  assert.ok(lines.some((l) => l.startsWith('strengthen\tapplied\t1')), r.stdout);
});
ok('没有任何候选时输出明确提示', () => {
  const empty = path.join(dir, 'empty.db');
  const d = openMemoryDb(empty);
  ensureGrowthSchema(d);
  d.close();
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'growth.mjs'), '--db', empty, '--candidate-stats'], { encoding: 'utf8' });
  assert.match(r.stdout, /还没有任何成长候选/);
});
ok('重复运行复核任务不会重复创建候选', () => {
  const r = run('--candidates', '--kind', 'review', '--status', 'pending');
  const count = (r.stdout.match(/interest:B站/g) || []).length;
  assert.equal(count, 1, `待审列表应只有 1 条，实际 ${count}`);
});

console.log(`\n${fail ? '❌' : '✅'} test-growth-candidate-report：${pass} 项通过，${fail} 项失败`);
if (fail) process.exitCode = 1;
