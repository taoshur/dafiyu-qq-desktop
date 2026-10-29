/**
 * 注入对比：旧方案（全量人物档案）vs 新方案（按需检索 + 预算）
 * 输出两段文本的 token 估算与节省比例，不动线上数据。
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openMemoryDb } from '../src/memory/db.js';
import { retrieveMemoryForPrompt, buildQueryFromState, estimateTokens } from '../src/memory/retrieve.js';

const ROOT = process.env.QQ_BRIDGE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const social = JSON.parse(fs.readFileSync(path.join(ROOT, 'state/social-v2.json'), 'utf8'));
const persons = JSON.parse(fs.readFileSync(path.join(ROOT, 'state/persons.json'), 'utf8'));
const mem = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).socialV2?.memory ?? {};
const db = openMemoryDb(path.join(ROOT, 'state/memory.db'));

// 找最近活跃的 3 个会话
const convs = Object.entries(social.conversations || {})
  .map(([k, v]) => ({ k, v, recent: (v.recentMessages || []).length }))
  .filter((x) => x.recent > 0)
  .sort((a, b) => b.recent - a.recent)
  .slice(0, 3);

for (const { k, v } of convs) {
  // 旧：话题 + 最近 10 位发言人的全部标签
  const lines = [];
  const topics = (v.activeTopics || []).slice(-10);
  if (topics.length) {
    lines.push('【进行中的话题】');
    for (const t of topics) lines.push(`- ${t.text}`);
  }
  const speakers = new Map();
  for (const m of (v.recentMessages || []).slice(-60)) {
    if (m?.isSelf || !m?.userId) continue;
    speakers.set(String(m.userId), m.sender || String(m.userId));
  }
  const people = [...speakers.entries()].slice(-10);
  if (people.length) {
    lines.push('【对群友的印象】（按 QQ 号记录，跨群共享）');
    for (const [qq, name] of people) {
      const p = persons[qq];
      if (!p || !Array.isArray(p.traits) || !p.traits.length) continue;
      lines.push(`- ${name}（${qq}）：${p.traits.join('、')}`);
    }
  }
  const oldText = lines.join('\n');

  // 新：检索
  const q = buildQueryFromState(v);
  const r = retrieveMemoryForPrompt(db, { convKey: k, speakerQqs: q.speakerQqs, text: q.text, budgetTokens: Number(mem.injectBudgetTokens) || 600 });

  const oldTokens = estimateTokens(oldText);
  const newTokens = estimateTokens(r.text);
  console.log(`\n=== ${k} ===`);
  console.log(`旧（全量档案）: ${oldTokens} tokens, ${oldText.split('\n').length} 行`);
  console.log(`新（检索+预算）: ${newTokens} tokens, ${r.hits} 条命中 (事实 ${r.facts} / 事件 ${r.events})`);
  console.log(`节省: ${oldTokens ? Math.round((1 - newTokens / oldTokens) * 100) : 0}%`);
  console.log('--- 新注入内容 ---');
  console.log(r.text || '（无命中）');
}
db.close();
