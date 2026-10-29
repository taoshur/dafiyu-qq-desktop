// P0：撤销错误形成的 interest:B站（只改这一个兴趣，保留证据与版本历史）
//
// 背景：version id=3 建立的 interest:B站，7 条证据里有 5 条是 bili_hot_videos / bili_hot_buzzwords
// 这类只读列表操作（旧口径记成了 participate），没有任何投稿/评论/点赞/观看。复核后撤销该兴趣。
//
// 做法（最小改动）：
//   1. traits: strength 0.35 → 0，status active → rejected（rejected 不参与 decay 的自动回升，也不会再被当活跃兴趣注入）
//   2. trait_versions: 追加一条 source=correction 的版本（before=0.35, after=0），evidence_ids 原样保留
//   3. growth_journal: 追加一条 growth_rollback 记录（可追溯、可复核）
//   4. 证据 7 条一条不删（保留原始事实），阈值一律不动
//
// 用法：node scripts/growth-correct-bili.mjs [--db <路径>] [--apply] [--version 3]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const argVal = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const DB = path.resolve(argVal('--db', path.join(ROOT, 'state', 'memory.db')));
const VERSION_ID = Number(argVal('--version', '3'));
const APPLY = argv.includes('--apply');

if (!fs.existsSync(DB)) {
  console.error(`找不到数据库：${DB}`);
  process.exit(1);
}

const db = new DatabaseSync(DB);
const q = (sql, ...args) => db.prepare(sql).get(...args);

const version = q('SELECT * FROM trait_versions WHERE id=?', VERSION_ID);
if (!version) {
  console.error(`版本 ${VERSION_ID} 不存在，停止（不做猜测性修复）`);
  process.exit(2);
}
if (version.trait_key !== 'interest:B站') {
  console.error(`版本 ${VERSION_ID} 属于 ${version.trait_key}，不是 interest:B站，停止`);
  process.exit(2);
}
const trait = q("SELECT * FROM traits WHERE trait_key='interest:B站'");
if (!trait) {
  console.error('interest:B站 不存在，可能已修复过，停止');
  process.exit(2);
}
const evidence = db.prepare("SELECT id, kind, source, note, day, conv_key FROM trait_evidence WHERE trait_key='interest:B站' ORDER BY id").all();
const versionEvidence = JSON.parse(version.evidence_ids || '[]');
const missing = versionEvidence.filter((id) => !evidence.some((e) => e.id === id));
if (missing.length) {
  console.error(`版本记录里的证据 ${missing.join(',')} 在库里找不到，停止（数据不一致）`);
  process.exit(2);
}

const readOnlyish = evidence.filter((e) => /bili_hot|bili_search|bili_video_info/.test(String(e.note || '')) && e.kind === 'participate');
console.log(`数据库：${DB}`);
console.log(`版本 ${VERSION_ID}: ${version.trait_key} ${version.before_strength}→${version.after_strength}（${version.reason}）`);
console.log(`当前状态：strength=${trait.strength} status=${trait.status} 证据=${evidence.length} 条`);
console.log(`其中"只读工具却记成 participate"的证据：${readOnlyish.length} 条`);
for (const e of evidence) console.log(`  - ev#${e.id} ${e.kind}/${e.source} ${e.note} (${e.day}, ${e.conv_key})`);

if (Number(trait.strength) === 0 && trait.status === 'rejected') {
  console.log('\n已经是纠正后的状态（strength=0, status=rejected），无需重复执行。');
  db.close();
  process.exit(0);
}

const before = String(Number(trait.strength).toFixed(2));
const evidenceIds = evidence.map((e) => e.id);
const reason = '人工复核：证据仅为 B 站热门榜/热搜词等只读操作，无投稿、评论、点赞或观看等真实参与，撤销该兴趣';

db.exec('BEGIN IMMEDIATE');
try {
  db.prepare(`INSERT INTO trait_versions(trait_key, before_strength, after_strength, reason, evidence_ids, source, at)
    VALUES(?,?,?,?,?,?,?)`)
    .run('interest:B站', Number(trait.strength), 0, reason, JSON.stringify(evidenceIds), 'correction', Date.now());
  db.prepare("UPDATE traits SET strength=0, status='rejected', updated_at=? WHERE trait_key='interest:B站'")
    .run(Date.now());
  db.prepare(`INSERT INTO growth_journal(at, kind, summary, detail, trait_key, before_state, after_state, confidence, verified, source)
    VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(Date.now(), 'growth_rollback', '撤销「喜欢B站」的成长', `${reason}（证据 ${evidence.length} 条保留未删）`,
      'interest:B站', before, '0.00', 1, 1, 'correction');
  if (APPLY) db.exec('COMMIT'); else db.exec('ROLLBACK');
  console.log(`\n模式=${APPLY ? 'APPLY' : 'DRY-RUN'}：将写入 correction 版本 + 日记，strength ${before}→0.00，status→rejected`);
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

if (APPLY) {
  const after = q("SELECT strength, status FROM traits WHERE trait_key='interest:B站'");
  const latest = q("SELECT id, before_strength, after_strength, source FROM trait_versions WHERE trait_key='interest:B站' ORDER BY id DESC LIMIT 1");
  console.log('应用后：', JSON.stringify(after), '最新版本：', JSON.stringify(latest));
}
db.close();
