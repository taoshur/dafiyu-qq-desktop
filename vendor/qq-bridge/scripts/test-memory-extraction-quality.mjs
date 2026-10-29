/**
 * 事件价值判断 / 抽取输出契约测试（本地合成样本，不调用模型）
 * 运行：node scripts/test-memory-extraction-quality.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { openMemoryDb } from '../src/memory/db.js';
import { ensureExtractSchema, validateExtraction, writeExtraction, buildExtractPrompt } from '../src/memory/extractor.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-quality-'));
const db = openMemoryDb(path.join(dir, 'quality.db'));
ensureExtractSchema(db);
let pass = 0;
let fail = 0;
function ok(name, fn) {
  try { fn(); pass += 1; console.log(`✔ ${name}`); } catch (e) { fail += 1; console.log(`✖ ${name}\n  ${e.message}`); }
}
const conv = 'private:2608855988';
let seq = 0;
function run(raw) {
  const v = validateExtraction(raw, { convKey: conv });
  const batch = { convKey: conv, batchKey: `q-${++seq}`, rows: [{ seq: 1, sent_at: Date.parse('2026-10-23T12:00:00+08:00') }], ids: [seq] };
  writeExtraction(db, batch, v, { observeOnly: true });
  return db.prepare('SELECT * FROM memory_candidates WHERE batch_key=? ORDER BY id').all(batch.batchKey);
}

ok('已发生的共同经历 → 事件候选', () => {
  const rows = run({ events: [{ summary: '今天一起去吃了饭', happened_at: '2026-10-23', category: 'social', certainty: 'stated' }] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'event');
  assert.equal(rows[0].status, 'pending');
});

ok('尚未兑现的约定 → 计划事实，不是已发生事件', () => {
  const rows = run({ facts: [{ subject_qq: '2608855988', subject_name: '主人', attr: '约定', value: '周末去吃火锅', kind: 'temporal', category: 'plan', certainty: 'stated' }] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'fact');
  assert.equal(rows[0].category, 'plan');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM events').get().c, 0);
});

ok('有回忆价值的个人感受/近况可以进入事件候选', () => {
  const rows = run({ events: [{ summary: '对方说今天心情不好', happened_at: '2026-10-23', category: 'profile', certainty: 'stated' }] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'pending');
});

ok('玩笑/角色扮演 → rejected，不写正式记忆', () => {
  const rows = run({ events: [{ summary: '如果我是你女朋友就好了', happened_at: '2026-10-23', category: 'social', certainty: 'joke' }] });
  assert.equal(rows[0].status, 'rejected');
  assert.match(rows[0].reason, /uncertain/);
});

ok('技术/运维事件 → ops_log，不进入人物事件', () => {
  const rows = run({ events: [{ summary: '桥接服务崩溃重启', happened_at: '2026-10-23', category: 'tech', certainty: 'stated' }] });
  assert.equal(rows[0].status, 'rejected');
  assert.match(rows[0].reason, /ops_event/);
  assert.ok(db.prepare('SELECT COUNT(*) c FROM ops_log').get().c >= 1);
});

ok('无长期价值的闲聊 → 空候选', () => {
  const rows = run({ events: [], facts: [] });
  assert.equal(rows.length, 0);
});

ok('空/非法抽取结果不写入，不抛异常', () => {
  const v = validateExtraction(null, { convKey: conv });
  assert.ok(v.errors.length > 0);
  const batch = { convKey: conv, batchKey: 'q-invalid', rows: [{ seq: 1 }], ids: [99] };
  const r = writeExtraction(db, batch, v, { observeOnly: true });
  assert.equal(r.written, 0);
});

ok('事件没有日期时保留 unknown，不伪造发送时间', () => {
  const rows = run({ events: [{ summary: '一次没有明确日期的经历', category: 'social', certainty: 'stated' }] });
  assert.equal(rows[0].happened_at, null);
  assert.equal(rows[0].time_precision, 'unknown');
});

ok('prompt 包含普通经历、计划/已发生区分、日期不确定规则', () => {
  const prompt = buildExtractPrompt({ rows: [{ seq: 1, sent_at: Date.now(), sender_name: '主人', is_owner: 1, text: '今天去跑步' }], contextRows: [] }, { convKey: conv });
  assert.ok(prompt.includes('普通经历'));
  assert.ok(prompt.includes('尚未发生的约定'));
  assert.ok(prompt.includes('无法确定日期就留空'));
  assert.ok(prompt.includes('happened_at'));
});

console.log(`\nRESULT pass=${pass} fail=${fail}`);
db.close();
process.exit(fail ? 1 : 0);
