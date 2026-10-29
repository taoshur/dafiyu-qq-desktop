/**
 * Memory V3 第二阶段 A/B/C 测试框架（本地隔离，不调用外部模型）
 *
 * A：最近 60 条消息，无长期记忆
 * B：身份设定 + 问题 + 长期记忆，无近期消息
 * C：近期消息 + 长期记忆
 *
 * 本轮只验证上下文隔离、检索配额与答案泄漏防护；真实模型回答未执行。
 *
 * 用法：node scripts/memory-ab-phase2.mjs --db <副本.db>
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { retrieveMemoryForPrompt, buildQueryFromState, estimateTokens } from '../src/memory/retrieve.js';

const args = process.argv.slice(2);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const dbPath = path.resolve(val('--db') || '');
const NOW = Date.parse('2026-10-27T18:00:00+08:00');
if (!dbPath || !fs.existsSync(dbPath)) { console.error('需要 --db <隔离副本>'); process.exit(1); }
const db = new DatabaseSync(dbPath, { readOnly: true });

const social = JSON.parse(fs.readFileSync('C:/Users/admin/qq-bridge/state/social-v2.json', 'utf8'));
const convKey = 'private:2608855988';
const recent = (social.conversations?.[convKey]?.recentMessages || []).slice(-60);
const questionList = [
  '前几天我们发生过什么事情？',
  '10 月 23 日我们聊过什么？',
  '三天前有什么值得记住的事？',
  '上次我们约定了什么？',
  '你还记得之前我跟你分享过的事情吗？',
  '你记得昨天的事，还是几天前的事？',
  '如果数据库没有对应记忆，你会如何回答？'
];
const BASE = '你是大肥鱼。只根据提供的信息回答；没有依据就说记不清，不要编造。';

function recentText() {
  return recent.map((m) => `${m.isSelf ? '我' : '对方'}：${m.text || m.plain || ''}`).join('\n');
}
function memoryFor(question) {
  return retrieveMemoryForPrompt(db, { convKey, speakerQqs: ['2608855988'], text: question, now: NOW, limit: 10 });
}

const out = { realModel: false, note: '未调用外部模型；仅验证上下文隔离与检索结果', questions: [] };
for (const question of questionList) {
  const mem = memoryFor(question);
  const A = `${BASE}\n\n【最近聊天】\n${recentText()}\n\n用户：${question}`;
  const B = `${BASE}\n\n用户：${question}\n\n${mem.text}`;
  const C = `${BASE}\n\n【最近聊天】\n${recentText()}\n\n用户：${question}\n\n${mem.text}`;
  const sampleRecent = recent.find((m) => (m.text || m.plain))?.text || '';
  out.questions.push({
    question,
    A: { chars: A.length, tokens: estimateTokens(A), hasRecent: Boolean(sampleRecent && A.includes(sampleRecent)), hasMemory: A.includes('【相关记忆】') },
    B: { chars: B.length, tokens: estimateTokens(B), hasRecent: Boolean(sampleRecent && B.includes(sampleRecent)), hasMemory: B.includes('【相关记忆】'), facts: mem.facts, events: mem.events, range: mem.range?.label || null },
    C: { chars: C.length, tokens: estimateTokens(C), hasRecent: Boolean(sampleRecent && C.includes(sampleRecent)), hasMemory: C.includes('【相关记忆】'), facts: mem.facts, events: mem.events, range: mem.range?.label || null },
    isolation: {
      A_noMemory: !A.includes('【相关记忆】'),
      B_noRecent: !(sampleRecent && B.includes(sampleRecent)),
      C_hasBoth: Boolean(sampleRecent && C.includes(sampleRecent)) && C.includes('【相关记忆】'),
      noAnswerKey: !A.includes('标准答案') && !B.includes('标准答案') && !C.includes('标准答案')
    }
  });
}
out.recentCount = recent.length;
out.recentDates = [...new Set(recent.map((m) => new Date(Number(m.sentAt || m.at || NOW)).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })))];
out.memoryPool = {
  facts: db.prepare("SELECT COUNT(*) c FROM facts WHERE status='active'").get().c,
  events: db.prepare('SELECT COUNT(*) c FROM events').get().c,
  candidates: db.prepare("SELECT COUNT(*) c FROM memory_candidates WHERE status='pending'").get().c
};
const file = path.join(os.tmpdir(), 'dafiyu-ab-phase2.json');
fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify({ ...out, file }, null, 2));
db.close();
