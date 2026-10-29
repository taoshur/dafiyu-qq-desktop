/**
 * Memory V4 成长系统 CLI
 *   node scripts/growth.mjs --status
 *   node scripts/growth.mjs --candidates [--status pending|applied|rejected]
 *   node scripts/growth.mjs --journal
 *   node scripts/growth.mjs --apply <候选id> | --reject <候选id>
 *   node scripts/growth.mjs --versions [--trait playful]
 *   node scripts/growth.mjs --rollback <版本id>
 *   node scripts/growth.mjs --decay
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMemoryDb } from '../src/memory/db.js';
import {
  ensureGrowthSchema, growthStatus, applyCandidate, rejectCandidate,
  rollbackTrait, decayTraits
} from '../src/memory/growth.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const g = cfg.socialV2?.growth ?? {};
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
// --db 覆盖：测试/副本上查询时用，避免误写生产库。
const db = openMemoryDb(path.resolve(val('--db') || path.join(ROOT, g.dbPath || 'state/memory.db')));
ensureGrowthSchema(db);

// OFF: --status 既是「看状态」的模式开关，又是 --candidates 的筛选值。
// 以前只要参数里出现 --status 就当成模式、直接 process.exit，导致
// `--candidates --status pending` 打印的是性格状态、候选列表被吞掉（24h 报告第 4 节因此重复第 3 节）。
const STATUS_FILTERS = new Set(['pending', 'applied', 'rejected']);
const statusValue = val('--status');
const statusIsMode = has('--status') && !STATUS_FILTERS.has(String(statusValue ?? ''));

if (statusIsMode) {
  const s = growthStatus(db);
  console.log('性格状态：');
  for (const t of s.traits) {
    console.log(`  ${t.name.padEnd(8)} strength=${Number(t.strength).toFixed(2)} 证据=${t.evidence_count} 天=${t.distinct_days} [${t.category}] ${t.status}`);
  }
  console.log(`候选 ${s.pending} · 日记 ${s.journal} · 经历 ${s.experiences} · 版本 ${s.versions}`);
  process.exit(0);
}

if (has('--candidates')) {
  const st = val('--status') || 'pending';
  const kind = val('--kind');
  const rows = kind
    ? db.prepare('SELECT * FROM growth_candidates WHERE status=? AND kind=? ORDER BY id DESC LIMIT 50').all(st, kind)
    : db.prepare('SELECT * FROM growth_candidates WHERE status=? ORDER BY id DESC LIMIT 50').all(st);
  if (!rows.length) {
    console.log(kind ? `（没有 ${st} 的 ${kind} 候选）` : `（没有 ${st} 的成长候选）`);
  } else {
    for (const c of rows) {
      const when = c.created_at ? new Date(Number(c.created_at)).toLocaleString() : '—';
      const ev = c.evidence_count ?? '—';
      const days = c.distinct_days ?? '—';
      const reviewed = c.reviewed_at ? ` 处理于 ${new Date(Number(c.reviewed_at)).toLocaleString()}` : '';
      console.log(`#${c.id} [${c.kind}] ${c.trait_key} ${Number(c.before_strength).toFixed(2)}→${Number(c.proposed_strength).toFixed(2)} | 证据 ${ev} 条 / ${days} 天 | 生成 ${when} | ${c.status}${reviewed} | ${c.reason}`);
    }
  }
  process.exit(0);
}

// 候选统计：按 kind + status 汇总，供 24h 报告与人工巡检使用（只读）。
if (has('--candidate-stats')) {
  const rows = db.prepare('SELECT kind, status, COUNT(*) c FROM growth_candidates GROUP BY kind, status ORDER BY kind, status').all();
  if (!rows.length) {
    console.log('（还没有任何成长候选）');
  } else {
    for (const r of rows) console.log(`${r.kind}\t${r.status}\t${r.c}`);
  }
  process.exit(0);
}

if (has('--journal')) {
  for (const j of db.prepare('SELECT * FROM growth_journal ORDER BY id DESC LIMIT 30').all()) {
    const t = new Date(Number(j.at)).toLocaleString();
    console.log(`[${t}] ${j.kind} | ${j.summary} | ${j.detail || ''} | verified=${j.verified}`);
  }
  process.exit(0);
}

if (has('--versions')) {
  const trait = val('--trait');
  const rows = trait
    ? db.prepare('SELECT * FROM trait_versions WHERE trait_key=? ORDER BY id DESC LIMIT 20').all(trait)
    : db.prepare('SELECT * FROM trait_versions ORDER BY id DESC LIMIT 20').all();
  for (const v of rows) console.log(`#${v.id} ${v.trait_key} ${Number(v.before_strength).toFixed(2)}→${Number(v.after_strength).toFixed(2)} | ${v.reason} | ${v.source}`);
  process.exit(0);
}

if (has('--apply') || has('--reject')) {
  const id = Number(val(has('--apply') ? '--apply' : '--reject'));
  const r = has('--apply') ? applyCandidate(db, id, { source: 'manual' }) : rejectCandidate(db, id);
  console.log(JSON.stringify(r));
  process.exit(0);
}

if (has('--rollback')) {
  const id = Number(val('--rollback'));
  console.log(JSON.stringify(rollbackTrait(db, id)));
  process.exit(0);
}

if (has('--decay')) {
  console.log(JSON.stringify(decayTraits(db, { decayPerDay: Number(g.decayPerDay) || 0.02 }), null, 1));
  process.exit(0);
}

console.log('用法：--status | --candidates [--kind review|strengthen] [--status pending|applied|rejected] | --candidate-stats | --journal | --versions [--trait x] | --apply <id> | --reject <id> | --rollback <id> | --decay [--db 路径]');
