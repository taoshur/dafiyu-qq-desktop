/**
 * 观察期质量/成本报告：整轮 API 用量 + 记忆注入 + 提取费用
 * 用法：node scripts/memory-report.mjs [--hours 3] [--write]
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = process.env.QQ_BRIDGE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const hi = args.indexOf('--hours');
const HOURS = hi >= 0 ? Number(args[hi + 1]) || 3 : 3;
const since = Date.now() - HOURS * 3600 * 1000;

const jsonl = (p) => fs.existsSync(p)
  ? fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : [];

const usage = jsonl(path.join(ROOT, 'state/token-usage.jsonl')).filter((r) => r.k === 'turn' && Number(r.t) >= since);
const tools = jsonl(path.join(ROOT, 'state/tool-calls.jsonl')).filter((r) => new Date(r.time).getTime() >= since);
const inject = jsonl(path.join(ROOT, 'state/memory-inject.jsonl')).filter((r) => Number(r.at) >= since);

const sum = (k) => usage.reduce((a, r) => a + Number(r.b?.[k] || 0), 0);
const turns = new Set(usage.map((r) => `${r.key}#${r.turn}`)).size;
const input = sum('cacheHit') + sum('cacheMiss');
const output = sum('output');
const toolCalls = tools.filter((t) => t.type === 'call').length;
const toolFails = tools.filter((t) => t.type === 'result' && t.ok === false).length;

const logLines = fs.existsSync(path.join(ROOT, 'state/bridge.log'))
  ? fs.readFileSync(path.join(ROOT, 'state/bridge.log'), 'utf8').split(/\r?\n/) : [];
const rotations = logLines.filter((l) => l.includes('[context]') && l.includes('超限')).length;
const summaries = logLines.filter((l) => l.includes('[summary]')).length;
const extractLogs = logLines.filter((l) => l.includes('[memory-extract]')).length;

let extractStats = null;
try {
  const db = new DatabaseSync(path.join(ROOT, 'state/memory.db'));
  extractStats = db.prepare('SELECT * FROM extract_stats ORDER BY day DESC LIMIT 1').get() || null;
  db.close();
} catch {}

const injectTokens = inject.reduce((a, r) => a + Number(r.tokens || 0), 0);
const injectAvg = inject.length ? injectTokens / inject.length : 0;
const extractTokens = extractStats ? Number(extractStats.prompt_tokens) + Number(extractStats.completion_tokens) : 0;

// 相对费用代理：命中 x0.1、未命中 x1、输出 x2、提取 x1（统一单位）
const relative = sum('cacheHit') * 0.1 + sum('cacheMiss') + output * 2 + extractTokens;

const report = {
  windowHours: HOURS,
  api: {
    turns,
    steps: usage.length,
    inputTokens: input,
    cacheHit: sum('cacheHit'),
    cacheMiss: sum('cacheMiss'),
    cacheHitRate: input ? Number((sum('cacheHit') / input).toFixed(4)) : 0,
    outputTokens: output,
    // tokensPerTurn 是「一整轮里所有步骤的输入合计 / 轮数」——一个回合通常有十几步，
    // 所以它看起来会很大（几十万）；真正每次请求的成本看 tokensPerStep。
    tokensPerTurn: turns ? Math.round(input / turns) : 0,
    tokensPerStep: usage.length ? Math.round(input / usage.length) : 0,
    outputPerTurn: turns ? Math.round(output / turns) : 0
  },
  memory: {
    injections: inject.length,
    avgInjectedTokens: Math.round(injectAvg * 10) / 10,
    extraction: extractStats ? {
      batches: Number(extractStats.batches),
      messages: Number(extractStats.messages),
      facts: Number(extractStats.facts),
      events: Number(extractStats.events),
      invalid: Number(extractStats.invalid),
      errors: Number(extractStats.errors),
      tokens: extractTokens
    } : null
  },
  activity: { toolCalls, toolFails, rotations, summaries, extractLogs },
  relativeCost: Math.round(relative)
};

console.log(JSON.stringify(report, null, 1));
if (args.includes('--write')) {
  fs.writeFileSync(path.join(ROOT, 'state/memory-report.json'), JSON.stringify(report, null, 2));
  console.log('\n写入 state/memory-report.json');
}
