/**
 * 提取样例演示：用真实最近聊天记录构造一个批次，跑一次真实模型，打印候选与花费。
 * 不写正式库（临时 DB），可安全重复运行。
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { openMemoryDb } from '../src/memory/db.js';
import { ensureExtractSchema, ingestMessage, listCandidates, readStats } from '../src/memory/extractor.js';
import { runExtractionCycle, callDeepSeek } from '../src/memory/worker.js';

const ROOT = process.env.QQ_BRIDGE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const fp = cfg.socialV2?.fastPath ?? {};
const mem = cfg.socialV2?.memory ?? {};
const social = JSON.parse(fs.readFileSync(path.join(ROOT, 'state/social-v2.json'), 'utf8'));

// 找一个最近有消息的会话
const conv = Object.entries(social.conversations || {})
  .map(([k, v]) => ({ k, n: (v.recentMessages || []).length, v }))
  .sort((a, b) => b.n - a.n)[0];
if (!conv) { console.log('没有可用会话'); process.exit(0); }

const recent = (conv.v.recentMessages || []).slice(-12);
console.log(`会话 ${conv.k} | 取最近 ${recent.length} 条`);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-demo-'));
const db = openMemoryDb(path.join(dir, 'demo.db'));
ensureExtractSchema(db);

let i = 0;
for (const m of recent) {
  i += 1;
  ingestMessage(db, {
    convKey: conv.k,
    messageId: `demo-${i}`,
    seq: i,
    senderQq: m.isSelf ? null : (m.userId || null),
    senderName: m.sender || (m.isSelf ? '大肥鱼' : '某人'),
    text: m.text || m.plain || '',
    mediaNote: Array.isArray(m.media) && m.media.length ? m.media.map((x) => x.summary || x.kind).join(',') : null,
    sentAt: Number(m.at) || Date.now(),
    isSelf: Boolean(m.isSelf)
  });
}

const r = await runExtractionCycle({
  db,
  callModel: ({ prompt, model }) => callDeepSeek({
    apiKey: fp.apiKey, baseUrl: fp.baseUrl, model, prompt, timeoutMs: 60000
  }),
  config: { ...mem, batchSize: 12, observeOnly: true },
  log: (m) => console.log(m)
});

console.log('\n结果:', JSON.stringify(r));
console.log('\n候选:');
for (const c of listCandidates(db, { status: 'pending', limit: 20 })) {
  console.log(` [#${c.id}] ${c.kind} | ${c.subject_name || c.subject_qq || ''} | ${c.attr || ''}=${c.value || c.summary} | ${c.visibility} conf=${c.confidence}`);
}
console.log('\n统计:', JSON.stringify(readStats(db, 1)));
db.close();
