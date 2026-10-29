// 生产数据只读核对 + 生产库副本上的复核预演（不改生产库）
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { openMemoryDb } from '../src/memory/db.js';
import { reviewRejectedInterests, ensureGrowthSchema } from '../src/memory/growth.js';

const ROOT = process.env.QQ_BRIDGE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prod = openMemoryDb(path.join(ROOT, 'state', 'memory.db'));
console.log('== 生产库 ==');
for (const t of prod.prepare("SELECT trait_key, strength, status FROM traits WHERE category='interest'").all()) console.log(' ', JSON.stringify(t));
console.log(' pending candidates:', prod.prepare("SELECT COUNT(*) c FROM growth_candidates WHERE status='pending'").get().c);
console.log(' 最新版本数:', prod.prepare('SELECT COUNT(*) c FROM trait_versions').get().c);
console.log(' 证据数:', prod.prepare('SELECT COUNT(*) c FROM trait_evidence').get().c);
prod.close();

// 副本上跑一次复核（只读预演：预期没有新证据 → 0 条候选）
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-preview-'));
const copy = path.join(dir, 'memory.db');
for (const ext of ['', '-wal', '-shm']) {
  const src = path.join(ROOT, 'state', 'memory.db' + ext);
  if (fs.existsSync(src)) fs.copyFileSync(src, copy + ext);
}
const db = openMemoryDb(copy);
ensureGrowthSchema(db);
const out = reviewRejectedInterests(db);
console.log('== 生产库副本上预演复核 ==');
console.log(' 产出候选数:', out.length, JSON.stringify(out));
console.log(' B站状态:', JSON.stringify(db.prepare("SELECT strength, status FROM traits WHERE trait_key='interest:B站'").get()));
db.close();
