// 生产库副本验证：用真实日志里的 bili_reply 调用，确认新映射会记账，且不会复活被否决的兴趣。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openMemoryDb } from '../src/memory/db.js';
import { createInterestTraits, ensureGrowthSchema } from '../src/memory/growth.js';

const ROOT = process.env.QQ_BRIDGE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rows = fs.readFileSync(path.join(ROOT, 'state', 'tool-calls.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const real = rows.filter((r) => r.type === 'call' && /bili_reply/.test(r.tool || '')).pop();
if (!real) { console.log('日志里没有 bili_reply 调用，跳过'); process.exit(0); }
console.log('真实调用记录:', JSON.stringify({ time: real.time, key: real.key, tool: real.tool, args: String(real.args || '').slice(0, 80) }));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-copy-map-'));
const dbPath = path.join(dir, 'memory.db');
for (const ext of ['', '-wal', '-shm']) {
  const src = path.join(ROOT, 'state', 'memory.db' + ext);
  if (fs.existsSync(src)) fs.copyFileSync(src, dbPath + ext);
}

const hook = await import(`../src/memory/growth-hook.js?prodcopy=${Date.now()}`);
hook.initGrowthHook({ config: { dbPath }, log: () => {} });
hook.noteGrowthTool({ convKey: real.key, tool: real.tool, args: String(real.args || ''), ok: true });

const d = openMemoryDb(dbPath);
const sig = d.prepare("SELECT kind, source, note, conv_key FROM interest_signals WHERE conv_key=? AND note LIKE '%bili_reply%'").all(real.key);
console.log('副本里新增信号:', JSON.stringify(sig));
const before = d.prepare("SELECT strength, status FROM traits WHERE trait_key='interest:B站'").get();
d.close();

// 再跑一次兴趣形成，确认被否决的兴趣不会复活
const d2 = openMemoryDb(dbPath);
ensureGrowthSchema(d2);
createInterestTraits(d2);
const after = d2.prepare("SELECT strength, status FROM traits WHERE trait_key='interest:B站'").get();
const others = d2.prepare("SELECT trait_key, strength, status FROM traits WHERE category='interest' AND trait_key<>'interest:B站'").all();
d2.close();

console.log('形成前后 B站:', JSON.stringify(before), '→', JSON.stringify(after));
console.log('其它兴趣:', JSON.stringify(others));
const ok = sig.length >= 1 && sig[0].kind === 'participate' && Number(after.strength) === 0 && after.status === 'rejected';
console.log(ok ? '✅ 生产副本验证通过（生产库未改动）' : '❌ 验证失败');
process.exitCode = ok ? 0 : 1;
