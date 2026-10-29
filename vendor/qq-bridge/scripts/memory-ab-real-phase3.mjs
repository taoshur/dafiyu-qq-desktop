/**
 * 第三阶段真实 A/B/C（仅 23～25 主人私聊，隔离副本）
 *
 * A：23～25 的最近 60 条 owner 消息（无长期记忆）
 * B：身份 + 问题 + Memory V3 检索（无原始聊天）
 * C：A + B
 *
 * 注意：授权范围仅 23～25；因此 A 不是“10-27 的最近 60 条”，而是授权范围内的最近 60 条。
 * 运行：node scripts/memory-ab-real-phase3.mjs --db <副本.db> [--max-calls 18]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { retrieveMemoryForPrompt } from '../src/memory/retrieve.js';

const args = process.argv.slice(2);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const dbPath = path.resolve(val('--db') || '');
const PROD = path.resolve('C:/Users/admin/qq-bridge/state/memory.db');
if (!dbPath || dbPath.toLowerCase() === PROD.toLowerCase() || !fs.existsSync(dbPath)) { console.error('需要隔离副本 --db'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync('C:/Users/admin/qq-bridge/config.json', 'utf8'));
const fp = cfg.socialV2?.fastPath || {};
if (!fp.apiKey) { console.error('缺少 API key'); process.exit(1); }
const model = cfg.socialV2?.memory?.model || fp.model || 'deepseek-chat';
const baseUrl = String(fp.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
const maxCalls = Number(val('--max-calls') || 18);
const outPath = path.resolve(val('--out') || path.join(os.tmpdir(), 'memory-ab-real-phase3.json'));

const db = new DatabaseSync(dbPath, { readOnly: true });
const ownerQq = String(cfg.ownerQQ || '');
const conv = `private:${ownerQq}`;
const from = Date.parse('2026-10-23T00:00:00+08:00');
const to = Date.parse('2026-10-26T00:00:00+08:00');
const now = Date.parse('2026-10-27T18:00:00+08:00');
const recent = db.prepare(`SELECT * FROM messages WHERE conv_key=? AND sent_at>=? AND sent_at<? AND is_owner=1 ORDER BY sent_at DESC LIMIT 60`).all(conv, from, to).reverse();
const contextText = recent.map((m) => `主人：${m.text || m.media_note || ''}`).join('\n');

const questions = [
  '前几天我们聊过什么？',
  '10月23日我们发生过什么事情？',
  '10月24日有什么值得记住的事？',
  '我们之前约定过什么？',
  '哪些事情已经发生，哪些还只是计划？',
  '你记不清的事情有哪些？'
];
const SYSTEM = '你是大肥鱼。请只根据提供的信息回答；没有依据就明确说记不清，不要编造。回答简短，区分“已经发生”和“计划/约定”。';

async function chat(prompt) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${fp.apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 300,
      stream: false
    }),
    signal: AbortSignal.timeout(60000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`);
  const json = await res.json();
  return {
    answer: String(json?.choices?.[0]?.message?.content || ''),
    usage: { prompt: Number(json?.usage?.prompt_tokens) || 0, completion: Number(json?.usage?.completion_tokens) || 0 }
  };
}

const out = { model, scope: 'owner private 2026-10-23..25', recentCount: recent.length, calls: [], answers: [], usage: { prompt: 0, completion: 0 }, errors: [] };
let callCount = 0;
for (const q of questions) {
  const mem = retrieveMemoryForPrompt(db, { convKey: conv, speakerQqs: [ownerQq], text: q, now, limit: 10 });
  const base = `【身份】你是大肥鱼。\n【问题】${q}`;
  const groups = {
    A: `${base}\n\n【最近聊天（仅授权范围）】\n${contextText}`,
    B: `${base}\n\n${mem.text}`,
    C: `${base}\n\n【最近聊天（仅授权范围）】\n${contextText}\n\n${mem.text}`
  };
  for (const [group, prompt] of Object.entries(groups)) {
    if (callCount >= maxCalls) break;
    const started = Date.now();
    try {
      callCount += 1;
      const r = await chat(prompt);
      out.usage.prompt += r.usage.prompt;
      out.usage.completion += r.usage.completion;
      out.calls.push({ q, group, promptChars: prompt.length, promptTokens: r.usage.prompt, completionTokens: r.usage.completion, latencyMs: Date.now() - started });
      out.answers.push({ q, group, answer: r.answer, chars: r.answer.length });
    } catch (error) {
      out.errors.push({ q, group, message: String(error.message || error).slice(0, 200) });
      callCount = maxCalls;
      break;
    }
  }
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify({
  outPath, model, recentCount: recent.length, calls: out.calls.length,
  usage: out.usage,
  latencyAvg: out.calls.length ? Math.round(out.calls.reduce((a, c) => a + c.latencyMs, 0) / out.calls.length) : null,
  errors: out.errors
}, null, 2));
db.close();
