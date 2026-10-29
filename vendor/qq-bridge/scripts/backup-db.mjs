// 备份 memory.db（WAL 安全版）
//
// 为什么不能直接复制 .db：SQLite 默认 WAL 模式，最近提交还在 memory.db-wal 里，
// 只拷主文件会丢数据（2026-10-25 审计时回填结果就差点因此丢失）。
// 这里用 `VACUUM INTO` 生成一致性快照：单文件、已合并 WAL、可被普通打开。
//
// 用法：node scripts/backup-db.mjs [输出目录]
//   默认输出到 backups/memory-<时间戳>/memory.db，并打印校验信息（表数、兴趣数、版本数）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'state', 'memory.db');
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const outDir = path.resolve(process.argv[2] || path.join(ROOT, 'backups', `memory-${stamp}`));
const outFile = path.join(outDir, 'memory.db');

if (!fs.existsSync(SRC)) {
  console.error(`找不到 ${SRC}`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
if (fs.existsSync(outFile)) {
  console.error(`目标已存在，拒绝覆盖：${outFile}`);
  process.exit(1);
}

const db = new DatabaseSync(SRC, { readOnly: true });
// VACUUM INTO 会读一致快照（含 WAL 中已提交的事务），生成一个干净的库文件。
db.exec(`VACUUM INTO '${outFile.replace(/'/g, "''")}'`);
const counts = {
  traits: db.prepare('SELECT COUNT(*) c FROM traits').get().c,
  versions: db.prepare('SELECT COUNT(*) c FROM trait_versions').get().c,
  evidence: db.prepare('SELECT COUNT(*) c FROM trait_evidence').get().c,
  journal: db.prepare('SELECT COUNT(*) c FROM growth_journal').get().c
};
db.close();

// 校验备份可独立打开且数据一致
const check = new DatabaseSync(outFile, { readOnly: true });
const backs = {
  traits: check.prepare('SELECT COUNT(*) c FROM traits').get().c,
  versions: check.prepare('SELECT COUNT(*) c FROM trait_versions').get().c,
  evidence: check.prepare('SELECT COUNT(*) c FROM trait_evidence').get().c,
  journal: check.prepare('SELECT COUNT(*) c FROM growth_journal').get().c
};
const integrity = check.prepare('PRAGMA integrity_check').get();
check.close();

const same = Object.keys(counts).every((k) => Number(counts[k]) === Number(backs[k]));
console.log(`备份完成：${outFile}`);
console.log(`  源库：${JSON.stringify(counts)}`);
console.log(`  备份：${JSON.stringify(backs)}`);
console.log(`  完整性：${Object.values(integrity)[0]}`);
console.log(`  一致：${same ? '是' : '否'}${same ? '' : '（请勿使用该备份）'}`);
process.exitCode = same && String(Object.values(integrity)[0]).toLowerCase() === 'ok' ? 0 : 1;
