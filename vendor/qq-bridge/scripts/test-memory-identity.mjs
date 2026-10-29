/**
 * 历史身份迁移脚本的隔离测试（不接触生产 DB）
 * 运行：node scripts/test-memory-identity.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openMemoryDb } from '../src/memory/db.js';
import { ensureExtractSchema } from '../src/memory/extractor.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-identity-test-'));
const dbPath = path.join(dir, 'copy.db');
const db = openMemoryDb(dbPath);
ensureExtractSchema(db);
const insert = db.prepare(`INSERT INTO messages(conv_key, msg_key, sender_qq, sender_name, text, sent_at, is_self, is_owner, extracted)
  VALUES(?,?,?,?,?,?,?,?,1)`);
insert.run('private:2608855988', 'm-owner', '2608855988', '主人', 'owner', Date.parse('2026-10-23T10:00:00+08:00'), 1, 0);
insert.run('group:1', 'm-other', '123456789', '别人', 'other', Date.parse('2026-10-23T11:00:00+08:00'), 1, 0);
insert.run('group:1', 'm-unknown', null, null, 'unknown', Date.parse('2026-10-23T12:00:00+08:00'), 1, 0);
db.close();

const script = path.resolve('scripts/memory-identity-repair.mjs');
const run = (...args) => JSON.parse(execFileSync(process.execPath, [script, '--db', dbPath, '--owner-qq', '2608855988', ...args], { encoding: 'utf8' }));
const dry = run();
assert.equal(dry.mode, 'dry-run');
const applied = run('--apply');
assert.equal(applied.mode, 'apply');
let db2 = new DatabaseSync(dbPath);
const rows = db2.prepare('SELECT msg_key, is_self, is_owner FROM messages ORDER BY msg_key').all();
const by = Object.fromEntries(rows.map((r) => [r.msg_key, r]));
assert.deepEqual({ ...by['m-owner'] }, { msg_key: 'm-owner', is_self: 0, is_owner: 1 });
assert.deepEqual({ ...by['m-other'] }, { msg_key: 'm-other', is_self: 0, is_owner: 0 });
assert.deepEqual({ ...by['m-unknown'] }, { msg_key: 'm-unknown', is_self: 1, is_owner: 0 }, 'unknown 保留原状态，不猜测');
db2.close();
const rolled = run('--rollback');
assert.equal(rolled.mode, 'rollback');
db2 = new DatabaseSync(dbPath);
const restored = db2.prepare("SELECT is_self, is_owner FROM messages WHERE msg_key='m-owner'").get();
assert.deepEqual({ ...restored }, { is_self: 1, is_owner: 0 });
db2.close();
console.log('RESULT pass=1 fail=0');
