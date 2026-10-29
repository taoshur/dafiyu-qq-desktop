// 在「生产库的副本」上验证回滚：不动真实 state/memory.db
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openMemoryDb } from '../src/memory/db.js';
import { ensureGrowthSchema, rollbackTrait } from '../src/memory/growth.js';
import { fileURLToPath } from 'node:url';
const ROOT = process.env.QQ_BRIDGE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const src = path.join(ROOT, 'state', 'memory.db');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-check-'));
const dst = path.join(dir, 'memory.db');
fs.copyFileSync(src, dst);
// WAL 模式：只拷 .db 会丢掉最近提交（回填就在 WAL 里），必须连 -wal/-shm 一起拷。
// 这也是备份 memory.db 时的坑：只备份主文件等于少一截数据。
for (const ext of ['-wal', '-shm']) {
  if (fs.existsSync(src + ext)) fs.copyFileSync(src + ext, dst + ext);
}

const db = openMemoryDb(dst);
ensureGrowthSchema(db);

const before = db.prepare("SELECT strength, status FROM traits WHERE trait_key='interest:消消乐'").get();
const version = db.prepare("SELECT id FROM trait_versions WHERE trait_key='interest:消消乐' ORDER BY id DESC LIMIT 1").get();
console.log('回滚前：', JSON.stringify(before), ' 使用版本 id=', version.id);

const r = rollbackTrait(db, version.id);
console.log('rollbackTrait →', JSON.stringify(r));

const after = db.prepare("SELECT strength, status FROM traits WHERE trait_key='interest:消消乐'").get();
const journal = db.prepare("SELECT kind, before_state, after_state, source FROM growth_journal ORDER BY id DESC LIMIT 1").get();
console.log('回滚后：', JSON.stringify(after));
console.log('最新日记：', JSON.stringify(journal));

const ctx = db.prepare("SELECT trait_key, strength FROM traits WHERE category='interest'").all();
console.log('剩余兴趣：', JSON.stringify(ctx));
db.close();

const pass = Number(after.strength) === 0 && journal?.kind === 'rollback';
console.log(pass ? '✅ 回滚可用（副本验证，生产库未改动）' : '❌ 回滚异常');
process.exitCode = pass ? 0 : 1;
