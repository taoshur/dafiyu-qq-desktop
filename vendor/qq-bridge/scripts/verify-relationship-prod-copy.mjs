// 生产副本验证：用真实历史消息走 noteGrowthMessage → 看 shared_topics 是否按规则写入
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { openMemoryDb } from '../src/memory/db.js';

const ROOT = process.env.QQ_BRIDGE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'state', 'social-v2.json'), 'utf8'));
const REL = [
  { re: /消消乐|游戏|关卡|过关|闯关/, topic: '游戏' },
  { re: /B站|哔哩|视频|直播|唱歌|听歌|音乐|歌单/, topic: '视频/唱歌' },
  { re: /吃饭|白饭|好吃|外卖|夜宵|奶茶|火锅/, topic: '吃饭' },
  { re: /上班|加班|工作|通勤|下班|开会/, topic: '上班' },
  { re: /睡觉|熬夜|失眠|困|早起/, topic: '睡觉' },
  { re: /猫|狗|宠物|仓鼠|兔子/, topic: '宠物' },
  { re: /天气|下雨|降温|好热|下雪|台风/, topic: '天气' },
  { re: /考试|学习|作业|上课|复习|论文/, topic: '学习' },
  { re: /出门|逛街|旅行|旅游|看电影|玩去/, topic: '出门玩' }
];
const topicsOf = (t) => REL.filter((r) => r.re.test(String(t))).map((r) => r.topic).slice(0, 3);

// 找同一会话里、同一个人说过两次以上同一个话题的消息
const found = [];
for (const [conv, st] of Object.entries(state.conversations || {})) {
  const bySender = new Map();
  for (const m of st.recentMessages || []) {
    if (m.isSelf) continue;
    const text = String(m.plain || m.text || '');
    if (!text) continue;
    const qq = String(m.userId || m.qq || '');
    if (!qq) continue;
    const ts = topicsOf(text);
    if (!ts.length) continue;
    const k = qq;
    if (!bySender.has(k)) bySender.set(k, []);
    bySender.get(k).push({ text, topics: ts, at: m.time || Date.now() });
  }
  for (const [qq, list] of bySender) {
    const counts = {};
    for (const m of list) for (const t of m.topics) counts[t] = (counts[t] || 0) + 1;
    const hit = Object.entries(counts).find(([, c]) => c >= 2);
    if (hit) found.push({ conv, qq, topic: hit[0], samples: list.filter((m) => m.topics.includes(hit[0])).slice(0, 2) });
  }
}
console.log('真实历史里可验证的组合：', found.length);
for (const f of found.slice(0, 3)) {
  console.log(`  ${f.conv} qq=${f.qq} topic=${f.topic}`);
  for (const s of f.samples) console.log(`    - ${s.text.slice(0, 50)}`);
}

if (!found.length) {
  console.log('（没有天然的两条同话题消息，跳过生产副本验证）');
  process.exit(0);
}

// 用生产库副本跑真实 hook 路径
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-copy-'));
const dbPath = path.join(dir, 'memory.db');
for (const ext of ['', '-wal', '-shm']) {
  const src = path.join(ROOT, 'state', 'memory.db' + ext);
  if (fs.existsSync(src)) fs.copyFileSync(src, dbPath + ext);
}

const hook = await import('../src/memory/growth-hook.js?prodcopy=1');
hook.initGrowthHook({ config: { dbPath, enabled: true }, log: () => {} });
const f = found[0];
const before = (() => {
  const d = openMemoryDb(dbPath); try {
    return d.prepare('SELECT shared_topics FROM relationships WHERE qq=? AND conv_key=?').get(f.qq, f.conv);
  } finally { d.close(); }
})();
console.log('\n副本里这条关系回填前：', JSON.stringify(before));
for (const s of f.samples.slice(0, 2)) {
  hook.noteGrowthMessage({ convKey: f.conv, senderQq: f.qq, senderName: 'x', text: s.text, isSelf: false });
}
const d = openMemoryDb(dbPath);
const after = d.prepare('SELECT shared_topics, familiarity, interactions FROM relationships WHERE qq=? AND conv_key=?').get(f.qq, f.conv);
const tally = d.prepare('SELECT topic, mentions FROM relationship_topics WHERE qq=? AND conv_key=?').all(f.qq, f.conv);
d.close();
console.log('副本里这条关系回填后：', JSON.stringify(after));
console.log('话题计数：', JSON.stringify(tally));
console.log(after?.shared_topics?.includes(f.topic) ? '✅ 真实消息路径写入成功（生产库未改动，用的是副本）' : '❌ 未写入，需要排查');
