/**
 * 历史消息身份修复（只在 SQLite 副本上执行；默认 dry-run）
 *
 * 证据只使用：sender_qq、conv_key、ownerQQ/botQQ，不从文本推断。
 * - sender_qq == ownerQQ  -> owner
 * - sender_qq == botQQ    -> bot（可选）
 * - sender_qq 非空且非以上 -> other
 * - sender_qq 为空        -> unknown（保留原 is_self，不猜）
 *
 * 用法：
 *   node scripts/memory-identity-repair.mjs --db <副本.db> [--owner-qq 123] [--bot-qq 456] [--apply]
 *   node scripts/memory-identity-repair.mjs --db <副本.db> --rollback
 *
 * 绝不接受生产路径；--apply 会创建 messages_identity_backup 备份表，支持 --rollback。
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const dbPath = path.resolve(val('--db') || '');
const PROD = path.resolve('C:/Users/admin/qq-bridge/state/memory.db');
if (!dbPath || !fs.existsSync(dbPath)) { console.error('缺少有效的 --db 副本路径'); process.exit(1); }
if (dbPath.toLowerCase() === PROD.toLowerCase()) { console.error('拒绝直接操作生产 memory.db；请先做一致性副本'); process.exit(1); }

const cfg = JSON.parse(fs.readFileSync('C:/Users/admin/qq-bridge/config.json', 'utf8'));
const ownerQq = String(val('--owner-qq') || cfg.ownerQQ || '');
const botQq = val('--bot-qq') ? String(val('--bot-qq')) : null;
if (!/^\d{5,12}$/.test(ownerQq)) { console.error('ownerQQ 无效'); process.exit(1); }

const db = new DatabaseSync(dbPath);
const cols = db.prepare('PRAGMA table_info(messages)').all().map((c) => c.name);
if (!cols.includes('is_owner')) db.exec('ALTER TABLE messages ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0');

function classify(row) {
  const sender = row.sender_qq != null ? String(row.sender_qq) : '';
  if (sender && sender === ownerQq) return 'owner';
  if (sender && botQq && sender === botQq) return 'bot';
  if (sender) return 'other';
  return 'unknown';
}
function stats() {
  const rows = db.prepare(`SELECT date(sent_at/1000,'unixepoch','+8 hours') d, id, sender_qq, is_self, is_owner FROM messages`).all();
  const out = {};
  for (const r of rows) {
    out[r.d] = out[r.d] || { owner: 0, bot: 0, other: 0, unknown: 0, old_self: 0, total: 0 };
    out[r.d][classify(r)] += 1;
    out[r.d].old_self += Number(r.is_self) ? 1 : 0;
    out[r.d].total += 1;
  }
  return out;
}

const before = stats();
if (has('--rollback')) {
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages_identity_backup'").get();
  if (!exists) { console.error('没有 messages_identity_backup，无法回滚'); process.exit(1); }
  db.exec('BEGIN');
  try {
    db.exec('UPDATE messages SET is_self=(SELECT b.is_self FROM messages_identity_backup b WHERE b.id=messages.id), is_owner=(SELECT b.is_owner FROM messages_identity_backup b WHERE b.id=messages.id) WHERE id IN (SELECT id FROM messages_identity_backup)');
    db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
  console.log(JSON.stringify({ mode: 'rollback', db: dbPath, before, after: stats() }, null, 2));
  db.close();
  process.exit(0);
}

if (!has('--apply')) {
  console.log(JSON.stringify({ mode: 'dry-run', db: dbPath, ownerQq, botQq, before, after: before }, null, 2));
  db.close();
  process.exit(0);
}

db.exec('BEGIN');
try {
  db.exec(`CREATE TABLE IF NOT EXISTS messages_identity_backup (
    id INTEGER PRIMARY KEY, is_self INTEGER, is_owner INTEGER, backed_up_at INTEGER
  )`);
  db.prepare(`INSERT OR IGNORE INTO messages_identity_backup(id, is_self, is_owner, backed_up_at)
    SELECT id, is_self, is_owner, ? FROM messages`).run(Date.now());
  const rows = db.prepare('SELECT id, sender_qq, is_self FROM messages').all();
  const upd = db.prepare('UPDATE messages SET is_self=?, is_owner=? WHERE id=?');
  for (const r of rows) {
    const kind = classify(r);
    if (kind === 'owner') upd.run(0, 1, r.id);
    else if (kind === 'other' || kind === 'bot') upd.run(0, 0, r.id);
    // unknown：保留原 is_self，is_owner 置 0，不猜测
    else upd.run(Number(r.is_self) ? 1 : 0, 0, r.id);
  }
  db.exec('COMMIT');
} catch (e) {
  try { db.exec('ROLLBACK'); } catch {}
  throw e;
}

console.log(JSON.stringify({ mode: 'apply', db: dbPath, ownerQq, botQq, before, after: stats() }, null, 2));
db.close();
