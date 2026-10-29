/**
 * 记忆召回评估（真实数据）
 *   - 召回率：抽样事实，用它的值构造查询，看是否被检索到
 *   - 无关召回率：召回结果里跟查询无关的行占比
 *   - 遗漏清单
 *   - 平均注入 token
 *   - 跨群隔离：直接检查召回行的 scope/visibility
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openMemoryDb, searchMemory } from '../src/memory/db.js';
import { retrieveMemoryForPrompt, estimateTokens } from '../src/memory/retrieve.js';

const ROOT = process.env.QQ_BRIDGE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const idx = args.indexOf('--sample');
const SAMPLE = idx >= 0 ? Number(args[idx + 1]) || 30 : 30;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const budget = Number(cfg.socialV2?.memory?.injectBudgetTokens) || 600;
const db = openMemoryDb(path.join(ROOT, 'state/memory.db'));

const norm = (s) => String(s || '').replace(/[\s，。！？、,.!?（）()]/g, '');
const facts = db.prepare(`SELECT * FROM facts WHERE status='active' AND value IS NOT NULL AND length(value)>=2
  ORDER BY RANDOM() LIMIT ?`).all(SAMPLE);

let hit = 0;
let totalTokens = 0;
let noise = 0;
let lines = 0;
const misses = [];

for (const f of facts) {
  const convKey = String(f.scope || '').includes(':') ? f.scope : 'group:0';
  const r = retrieveMemoryForPrompt(db, {
    convKey,
    speakerQqs: f.subject_qq ? [String(f.subject_qq)] : [],
    text: `${f.value} ${f.attr}`,
    budgetTokens: budget
  });
  totalTokens += r.tokens;
  const got = r.text.split('\n').filter((l) => l.startsWith('- '));
  lines += got.length;
  const okHit = got.some((l) => norm(l).includes(norm(f.value)));
  if (okHit) hit += 1; else misses.push(`${f.subject_name || f.subject_qq} ${f.attr}=${f.value}`);
  for (const l of got) {
    if (!norm(l).includes(norm(f.value)) && !norm(l).includes(norm(f.attr))) noise += 1;
  }
}

const n = facts.length || 1;
console.log('=== 记忆召回评估 ===');
console.log(`抽样事实: ${facts.length}`);
console.log(`召回率: ${(hit / n * 100).toFixed(1)}% (${hit}/${facts.length})`);
console.log(`无关行占比: ${lines ? (noise / lines * 100).toFixed(1) : 0}% (${noise}/${lines})`);
console.log(`平均注入: ${(totalTokens / n).toFixed(1)} tokens（预算 ${budget}）`);
if (misses.length) {
  console.log('遗漏样例:');
  for (const m of misses.slice(0, 8)) console.log('  -', m);
}

// 跨群隔离：scope=group:A 的私有群记忆，不应出现在 group:B
const grouped = db.prepare(`SELECT scope, subject_qq, attr, value FROM facts
  WHERE status='active' AND scope LIKE 'group:%' AND visibility='group' LIMIT 5`).all();
let leak = 0;
for (const g of grouped) {
  const rows = searchMemory(db, {
    convKey: 'group:__other__',
    qqs: g.subject_qq ? [String(g.subject_qq)] : [],
    text: `${g.attr} ${g.value}`,
    limit: 20
  });
  if (rows.some((r) => r.row && r.row.scope === g.scope)) leak += 1;
}
console.log(`跨群泄漏检查: ${leak} / ${grouped.length}（应为 0）`);

// 私聊泄漏：private 记忆不应出现在群聊
const priv = db.prepare("SELECT scope, value FROM facts WHERE visibility='private' LIMIT 5").all();
let privLeak = 0;
for (const p of priv) {
  const rows = searchMemory(db, { convKey: 'group:__other__', qqs: [], text: p.value, limit: 20 });
  if (rows.some((r) => r.row && r.row.visibility === 'private')) privLeak += 1;
}
console.log(`私聊泄漏检查: ${privLeak} / ${priv.length}（应为 0）`);
db.close();
