// 备份回归：WAL 里有未 checkpoint 的提交时，备份必须能拿到最新数据。
// 做法：临时库 → 开 WAL → 写数据（不 checkpoint）→ 用 VACUUM INTO 备份 → 校验备份里有最新行。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let pass = 0;
let fail = 0;
function ok(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass += 1; } catch (error) {
    console.error(`  ✗ ${name}: ${error?.message ?? error}`); fail += 1;
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-wal-'));
const src = path.join(dir, 'live.db');
const dst = path.join(dir, 'backup.db');

const db = new DatabaseSync(src);
db.exec('PRAGMA journal_mode=WAL');
db.exec('PRAGMA wal_autocheckpoint=0');
db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT)');
db.prepare('INSERT INTO t(v) VALUES(?)').run('最早的行');
db.close();

// 再打开、追加一行并保持连接（数据留在 WAL，不 checkpoint）
const writer = new DatabaseSync(src);
writer.exec('PRAGMA wal_autocheckpoint=0');
writer.prepare('INSERT INTO t(v) VALUES(?)').run('只存在于 WAL 的最新行');
const walSize = fs.existsSync(`${src}-wal`) ? fs.statSync(`${src}-wal`).size : 0;

ok('确实有 WAL 数据尚未合并进主文件', () => assert.ok(walSize > 0, `wal 大小 ${walSize}`));
ok('只复制 .db 会丢最新行（复现旧备份方式的问题）', () => {
  const naivePath = path.join(dir, 'naive.db');
  fs.copyFileSync(src, naivePath);
  const naive = new DatabaseSync(naivePath, { readOnly: true });
  const rows = naive.prepare('SELECT v FROM t').all().map((r) => r.v);
  naive.close();
  assert.ok(!rows.includes('只存在于 WAL 的最新行'), '主文件本身不应包含 WAL 里的行（否则本用例无效）');
});
ok('VACUUM INTO 出来的备份单文件、无 wal 尾巴', () => {
  writer.exec(`VACUUM INTO '${dst.replace(/'/g, "''")}'`);
  assert.ok(fs.existsSync(dst));
  assert.ok(!fs.existsSync(`${dst}-wal`), '备份目标不应带 wal 文件');
});
ok('备份可独立打开、包含 WAL 里的最新行、完整性 ok', () => {
  const back = new DatabaseSync(dst, { readOnly: true });
  const rows = back.prepare('SELECT v FROM t').all().map((r) => r.v);
  const integrity = Object.values(back.prepare('PRAGMA integrity_check').get())[0];
  back.close();
  assert.ok(rows.includes('只存在于 WAL 的最新行'), `备份缺最新行：${rows.join(',')}`);
  assert.equal(String(integrity).toLowerCase(), 'ok');
});

writer.close();
console.log(`\n${fail ? '❌' : '✅'} test-backup-db：${pass} 项通过，${fail} 项失败`);
if (fail) process.exitCode = 1;
