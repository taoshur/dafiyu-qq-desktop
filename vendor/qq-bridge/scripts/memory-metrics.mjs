/**
 * Memory V3 监控：改造前后成本对比基线
 *
 * 统计口径（不只看 prompt 长度）：
 *   每轮输入 token、缓存命中率、工具调用数、摘要调用次数、会话轮换次数、
 *   自动提取费用（阶段 3 起有数据）、以及一个「相对费用」代理指标。
 *
 * 用法：node scripts/memory-metrics.mjs [--hours 24] [--write state/memory-baseline.json]
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = process.env.QQ_BRIDGE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const hoursArg = args.indexOf('--hours');
const HOURS = hoursArg >= 0 ? Number(args[hoursArg + 1]) || 24 : 24;
const writeIdx = args.indexOf('--write');
const WRITE = writeIdx >= 0 ? args[writeIdx + 1] : '';

const since = Date.now() - HOURS * 3600 * 1000;

function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

const usage = readJsonl(path.join(ROOT, 'state', 'token-usage.jsonl'))
  .filter((r) => r.k === 'turn' && Number(r.t) >= since);
const tools = readJsonl(path.join(ROOT, 'state', 'tool-calls.jsonl'))
  .filter((r) => new Date(r.time).getTime() >= since);

const logPath = path.join(ROOT, 'state', 'bridge.log');
const logLines = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').split(/\r?\n/) : [];

const sum = (k) => usage.reduce((a, r) => a + Number(r.b?.[k] || 0), 0);
const turns = new Set(usage.map((r) => `${r.key}#${r.turn}`)).size;

const byKey = new Map();
for (const r of usage) {
  const cur = byKey.get(r.key) || { steps: 0, turns: new Set(), hit: 0, miss: 0, out: 0 };
  cur.steps += 1; cur.turns.add(r.turn);
  cur.hit += Number(r.b?.cacheHit || 0);
  cur.miss += Number(r.b?.cacheMiss || 0);
  cur.out += Number(r.b?.output || 0);
  byKey.set(r.key, cur);
}

const toolCalls = tools.filter((r) => r.type === 'call');
const toolFails = tools.filter((r) => r.type === 'result' && r.ok === false);
const toolTop = new Map();
for (const r of toolCalls) {
  const n = String(r.tool || '').replace('mcp__', '');
  toolTop.set(n, (toolTop.get(n) || 0) + 1);
}

const rotations = logLines.filter((l) => l.includes('[context]') && l.includes('超限')).length;
const summaries = logLines.filter((l) => l.includes('[summary]')).length;
const extractions = logLines.filter((l) => l.includes('[memory-extract]')).length;

const cacheHit = sum('cacheHit');
const cacheMiss = sum('cacheMiss');
const output = sum('output');
const input = cacheHit + cacheMiss;
// 相对费用代理：缓存命中按 0.1、未命中按 1、输出按 2（只用于前后对比，不是真实账单）
const relativeCost = cacheHit * 0.1 + cacheMiss * 1 + output * 2;

const report = {
  generatedAt: new Date().toISOString(),
  windowHours: HOURS,
  totals: {
    turns,
    steps: usage.length,
    inputTokens: input,
    cacheHit,
    cacheMiss,
    outputTokens: output,
    cacheHitRate: input ? Number((cacheHit / input).toFixed(4)) : 0,
    tokensPerStep: usage.length ? Math.round(input / usage.length) : 0,
    tokensPerTurn: turns ? Math.round(input / turns) : 0,
    relativeCost: Math.round(relativeCost)
  },
  activity: {
    toolCalls: toolCalls.length,
    toolFails: toolFails.length,
    rotations,
    summaryCalls: summaries,
    extractionCalls: extractions
  },
  byConversation: [...byKey.entries()].map(([key, v]) => ({
    key,
    turns: v.turns.size,
    steps: v.steps,
    inputTokens: v.hit + v.miss,
    cacheHitRate: (v.hit + v.miss) ? Number((v.hit / (v.hit + v.miss)).toFixed(4)) : 0,
    tokensPerStep: v.steps ? Math.round((v.hit + v.miss) / v.steps) : 0
  })).sort((a, b) => b.inputTokens - a.inputTokens),
  topTools: [...toolTop.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }))
};

console.log(`=== 最近 ${HOURS} 小时 ===`);
console.log(`轮数 ${report.totals.turns} | 步数 ${report.totals.steps} | 输入 ${(input / 1e6).toFixed(2)}M (命中 ${(cacheHit / 1e6).toFixed(2)}M / 未命中 ${(cacheMiss / 1e6).toFixed(2)}M)`);
console.log(`缓存命中率 ${(report.totals.cacheHitRate * 100).toFixed(1)}% | 每步平均 ${report.totals.tokensPerStep} tokens | 每轮平均 ${report.totals.tokensPerTurn}`);
console.log(`输出 ${(output / 1e3).toFixed(0)}k | 相对费用 ${report.totals.relativeCost}`);
console.log(`工具调用 ${toolCalls.length}（失败 ${toolFails.length}）| 轮换 ${rotations} 次 | 摘要 ${summaries} 次`);
console.log('\n按会话:');
for (const row of report.byConversation) {
  console.log(`  ${row.key} | 轮 ${row.turns} 步 ${row.steps} | 输入 ${(row.inputTokens / 1e6).toFixed(2)}M | 命中率 ${(row.cacheHitRate * 100).toFixed(0)}% | 每步 ${row.tokensPerStep}`);
}

if (WRITE) {
  const out = path.isAbsolute(WRITE) ? WRITE : path.join(ROOT, WRITE);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('\n已写入:', out);
}
