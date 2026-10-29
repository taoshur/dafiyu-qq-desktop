/**
 * 第三阶段：真实模型抽取（仅隔离副本，仅 10-23～25 主人私聊）
 *
 * 授权范围：仅这 67 条 owner 私聊历史 + DeepSeek 官方 API。
 * 不修改生产 DB/config，不自动 apply 到正式记忆（除非显式 --apply-events，且只在副本）。
 *
 * 用法：
 *   node scripts/memory-real-extract-phase3.mjs --db <副本.db> [--max-calls 4] [--apply-events]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ensureExtractSchema, validateExtraction, writeExtraction, applyCandidate } from '../src/memory/extractor.js';
import { buildExtractPrompt } from '../src/memory/extractor.js';
import { callDeepSeek } from '../src/memory/worker.js';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const dbPath = path.resolve(val('--db') || '');
const PROD = path.resolve('C:/Users/admin/qq-bridge/state/memory.db');
if (!dbPath || dbPath.toLowerCase() === PROD.toLowerCase() || !fs.existsSync(dbPath)) {
  console.error('需要隔离副本 --db，且不得是生产 memory.db');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync('C:/Users/admin/qq-bridge/config.json', 'utf8'));
const fp = cfg.socialV2?.fastPath || {};
const mem = cfg.socialV2?.memory || {};
if (!fp.apiKey) { console.error('fastPath.apiKey 未配置，无法调用真实模型'); process.exit(1); }

const ownerQq = String(cfg.ownerQQ || '');
const conv = `private:${ownerQq}`;
const from = Date.parse('2026-10-23T00:00:00+08:00');
const to = Date.parse('2026-10-26T00:00:00+08:00');
const maxCalls = Number(val('--max-calls') || 4);
const maxPromptTokens = Number(val('--max-prompt-tokens') || 120000);
const outPath = path.resolve(val('--out') || path.join(os.tmpdir(), 'memory-real-phase3.json'));
const rawPath = outPath + '.raw.json';

const db = new DatabaseSync(dbPath);
ensureExtractSchema(db);
const target = db.prepare(`SELECT COUNT(*) c FROM messages WHERE conv_key=? AND sent_at>=? AND sent_at<?`).get(conv, from, to).c;
// 只重置授权范围内的消息
db.prepare('UPDATE messages SET extracted=0 WHERE conv_key=? AND sent_at>=? AND sent_at<?').run(conv, from, to);

const result = {
  model: mem.model || fp.model || 'deepseek-chat',
  baseUrl: fp.baseUrl || 'https://api.deepseek.com',
  targetMessages: target,
  calls: [],
  candidates: [],
  applied: [],
  pendingBefore: db.prepare('SELECT COUNT(*) c FROM messages WHERE conv_key=? AND sent_at>=? AND sent_at<? AND extracted=0').get(conv, from, to).c,
  totalUsage: { prompt: 0, completion: 0 },
  errors: []
};
const raws = [];

function selectAuthorizedBatch(limit = 30, contextSize = 12) {
  const rows = db.prepare(`SELECT * FROM messages WHERE conv_key=? AND sent_at>=? AND sent_at<? AND extracted=0 ORDER BY id ASC LIMIT ?`).all(conv, from, to, limit);
  if (!rows.length) return null;
  const first = rows[0];
  const sameConv = rows.filter((r) => r.conv_key === conv);
  const context = db.prepare(`SELECT * FROM messages WHERE conv_key=? AND sent_at>=? AND sent_at<? AND id < ? ORDER BY id DESC LIMIT ?`)
    .all(conv, from, to, first.id, contextSize).reverse();
  const keys = sameConv.map((r) => r.msg_key);
  const batchKey = crypto.createHash('sha1').update(`${conv}|${keys[0]}|${keys[keys.length - 1]}|${keys.length}`).digest('hex').slice(0, 20);
  return { convKey: conv, batchKey, rows: sameConv, contextRows: context, ids: sameConv.map((r) => r.id) };
}

for (let call = 0; call < maxCalls; call += 1) {
  const batch = selectAuthorizedBatch();
  if (!batch) break;
  const prompt = buildExtractPrompt(batch, { convKey: conv });
  const started = Date.now();
  try {
    const modelResult = await callDeepSeek({
      apiKey: fp.apiKey,
      baseUrl: fp.baseUrl || 'https://api.deepseek.com',
      model: mem.model || fp.model || 'deepseek-chat',
      prompt,
      timeoutMs: Number(mem.timeoutMs) || 60000
    });
    const latencyMs = Date.now() - started;
    raws.push({ batchKey: batch.batchKey, raw: modelResult.raw });
    const usage = modelResult.usage || { prompt: 0, completion: 0 };
    result.totalUsage.prompt += usage.prompt;
    result.totalUsage.completion += usage.completion;
    if (result.totalUsage.prompt > maxPromptTokens) {
      result.errors.push({ stage: 'budget', message: `prompt tokens ${result.totalUsage.prompt} > ${maxPromptTokens}` });
      break;
    }
    const validated = validateExtraction(modelResult.parsed, { convKey: conv });
    const written = writeExtraction(db, batch, validated, { observeOnly: true });
    const candidates = db.prepare('SELECT id, kind, status, reason, quality, happened_at, time_precision FROM memory_candidates WHERE batch_key=? ORDER BY id').all(batch.batchKey);
    result.calls.push({
      call: call + 1,
      messages: batch.rows.length,
      contextRows: batch.contextRows.length,
      promptTokens: usage.prompt,
      completionTokens: usage.completion,
      latencyMs,
      parsedFacts: validated.facts.length,
      parsedEvents: validated.events.length,
      invalid: validated.errors.length,
      written: written.written,
      rejected: written.rejected,
      duplicates: written.duplicates,
      candidateIds: candidates.map((c) => c.id)
    });
    result.candidates.push(...candidates);
  } catch (error) {
    result.errors.push({ stage: 'model', call: call + 1, message: String(error.message || error).slice(0, 200) });
    break;
  }
}

if (has('--apply-events')) {
  for (const c of result.candidates.filter((x) => x.kind === 'event' && x.status === 'pending')) {
    try {
      const r = applyCandidate(db, c.id, { reason: 'phase3 isolated real-model review' });
      result.applied.push({ candidate: c.id, refId: r.refId });
    } catch (error) {
      result.errors.push({ stage: 'apply', candidate: c.id, message: String(error.message || error).slice(0, 200) });
    }
  }
}

fs.writeFileSync(rawPath, JSON.stringify(raws, null, 2), 'utf8');
fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
console.log(JSON.stringify({
  outPath,
  model: result.model,
  targetMessages: result.targetMessages,
  calls: result.calls,
  candidateCount: result.candidates.length,
  candidatesByKind: result.candidates.reduce((a, c) => { a[c.kind] = (a[c.kind] || 0) + 1; return a; }, {}),
  status: result.candidates.reduce((a, c) => { a[c.status] = (a[c.status] || 0) + 1; return a; }, {}),
  applied: result.applied.length,
  usage: result.totalUsage,
  errors: result.errors
}, null, 2));
db.close();
