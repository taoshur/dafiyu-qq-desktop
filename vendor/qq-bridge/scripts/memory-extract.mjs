/**
 * Memory V3 提取 CLI
 *   node scripts/memory-extract.mjs --once           跑一轮（观察模式）
 *   node scripts/memory-extract.mjs --stats          看统计
 *   node scripts/memory-extract.mjs --candidates     看候选
 *   node scripts/memory-extract.mjs --apply <id>     把候选转正式事实
 *   node scripts/memory-extract.mjs --reject <id>    拒绝候选
 *   node scripts/memory-extract.mjs --backfill       把最近消息补入库（从 qq-activity 之外不补，仅提示）
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openMemoryDb, addFact, addEvent } from '../src/memory/db.js';
import { ensureExtractSchema, pendingStats, listCandidates, decideCandidate, applyCandidate, readStats } from '../src/memory/extractor.js';
import { runExtractionCycle, callDeepSeek } from '../src/memory/worker.js';

const ROOT = process.env.QQ_BRIDGE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfgFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const mem = cfgFile.socialV2?.memory ?? {};
const fp = cfgFile.socialV2?.fastPath ?? {};
const db = openMemoryDb(path.join(ROOT, mem.dbPath || 'state/memory.db'));
ensureExtractSchema(db);

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

if (has('--stats')) {
  console.log('待抽取:', JSON.stringify(pendingStats(db)));
  console.log('每日统计:');
  for (const r of readStats(db, 14)) {
    const per100 = r.messages >= 100 ? (r.prompt_tokens + r.completion_tokens) / (r.messages / 100) : null;
    console.log(`  ${r.day} | 批 ${r.batches} 消息 ${r.messages} | 事实 ${r.facts} 事件 ${r.events} | 非法 ${r.invalid} 错误 ${r.errors} | tokens ${r.prompt_tokens}+${r.completion_tokens}${per100 ? ' | 每100条 ' + Math.round(per100) : ''}`);
  }
  process.exit(0);
}

if (has('--quality')) {
  const { qualitySummary } = await import('../src/memory/quality.js');
  console.log(JSON.stringify(qualitySummary(db), null, 1));
  process.exit(0);
}

if (has('--candidates')) {
  const status = val('--status') || 'pending';
  for (const c of listCandidates(db, { status, limit: 50 })) {
    console.log(`#${c.id} [${c.kind}] ${c.subject_name || c.subject_qq || ''} ${c.attr || ''}=${c.value || c.summary} | ${c.scope} ${c.visibility} conf=${c.confidence} ${c.status}${c.reason ? ' (' + c.reason + ')' : ''}`);
  }
  process.exit(0);
}

if (has('--apply') || has('--reject')) {
  const id = Number(val(has('--apply') ? '--apply' : '--reject'));
  const action = has('--apply') ? 'apply' : 'reject';
  const cand = db.prepare('SELECT * FROM memory_candidates WHERE id=?').get(id);
  if (!cand) { console.error('候选不存在'); process.exit(1); }
  try {
    const r = action === 'apply'
      ? applyCandidate(db, id, { reason: 'manual apply', allowGlobal: has('--allow-global') })
      : decideCandidate(db, id, 'reject', 'manual reject');
    console.log(`${action} 候选 #${id} 完成`, JSON.stringify(r));
  } catch (error) {
    console.error(`${action} 候选 #${id} 失败：${error.message}`);
    process.exit(1);
  }
  process.exit(0);
}

if (has('--once')) {
  const r = await runExtractionCycle({
    db,
    callModel: ({ prompt, model }) => callDeepSeek({
      apiKey: fp.apiKey, baseUrl: fp.baseUrl, model: model || mem.model || fp.model || 'deepseek-chat',
      prompt, timeoutMs: mem.timeoutMs || 60000
    }),
    config: { ...mem, observeOnly: mem.observeOnly !== false },
    log: (m) => console.log(m)
  });
  console.log('结果:', JSON.stringify(r).slice(0, 300));
  process.exit(0);
}

console.log('用法：--once | --stats | --candidates [--status pending] | --apply <id> [--allow-global] | --reject <id>');
