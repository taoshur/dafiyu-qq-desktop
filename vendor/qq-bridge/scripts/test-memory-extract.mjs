/**
 * Memory V3 阶段 2 测试：入库幂等 / 批次幂等 / Schema 校验 / 隐私分级 / 重试上限 / 观察模式不覆盖正式事实
 * 运行：node scripts/test-memory-extract.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { openMemoryDb } from '../src/memory/db.js';
import {
  ensureExtractSchema, ingestMessage, selectBatch, validateExtraction,
  writeExtraction, pendingStats, listCandidates, decideCandidate
} from '../src/memory/extractor.js';
import { runExtractionCycle } from '../src/memory/worker.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-v3-p2-'));
const db = openMemoryDb(path.join(dir, 'test.db'));
ensureExtractSchema(db);
let pass = 0;
const ok = async (name, fn) => { await fn(); pass += 1; console.log('✔', name); };

const msg = (i, extra = {}) => ({
  convKey: 'group:100', messageId: 1000 + i, seq: i, senderQq: '20001', senderName: '小明',
  text: `第${i}条消息，聊到游戏和吃饭`, sentAt: Date.now() + i, isSelf: false, ...extra
});

await ok('消息入库 + 重复入库幂等', () => {
  const a = ingestMessage(db, msg(1));
  const b = ingestMessage(db, msg(1));
  assert.equal(a.inserted, true);
  assert.equal(b.inserted, false);
  assert.equal(pendingStats(db).pending, 1);
});

await ok('不同会话独立游标', () => {
  ingestMessage(db, msg(2, { convKey: 'private:300' }));
  const n = db.prepare('SELECT COUNT(*) AS c FROM extract_cursors').get();
  assert.equal(Number(n.c), 2);
});

await ok('取批次：只取一个会话、按 id 升序', () => {
  for (let i = 3; i <= 8; i++) ingestMessage(db, msg(i));
  const batch = selectBatch(db, { batchSize: 5 });
  assert.equal(batch.convKey, 'group:100');
  assert.ok(batch.rows.length <= 5);
  assert.equal(batch.rows[0].text.includes('第1条'), true);
});

await ok('Schema 校验：缺字段被拒、非法 visibility 归一到默认', () => {
  const r = validateExtraction({
    facts: [
      { subject_qq: '20001', attr: '喜欢的游戏', value: '消消乐', kind: 'multi', visibility: 'public' },
      { subject_qq: '20001', value: '没有attr' }
    ],
    events: [{ summary: '他今天通关了' }, { detail: '只有 detail' }]
  }, { convKey: 'group:100' });
  assert.equal(r.facts.length, 1);
  assert.equal(r.facts[0].visibility, 'group');
  assert.equal(r.events.length, 1);
  assert.ok(r.errors.length >= 2);
});

await ok('隐私分级：私聊默认 private，群聊默认 group', () => {
  const priv = validateExtraction({ facts: [{ subject_qq: '1', attr: '近况', value: '搬家' }] }, { convKey: 'private:1' });
  const grp = validateExtraction({ facts: [{ subject_qq: '1', attr: '近况', value: '搬家' }] }, { convKey: 'group:1' });
  assert.equal(priv.facts[0].visibility, 'private');
  assert.equal(priv.facts[0].scope, 'private:1');
  assert.equal(grp.facts[0].visibility, 'group');
});

await ok('观察模式：写候选、不写正式 facts', () => {
  const batch = selectBatch(db, { batchSize: 3 });
  const before = db.prepare('SELECT COUNT(*) AS c FROM facts').get();
  const v = validateExtraction({
    facts: [{ subject_qq: '20001', subject_name: '小明', attr: '喜欢的游戏', value: '消消乐', kind: 'multi' }],
    events: [{ summary: '小明通关第18关' }]
  }, { convKey: batch.convKey });
  const r = writeExtraction(db, batch, v, { observeOnly: true });
  const after = db.prepare('SELECT COUNT(*) AS c FROM facts').get();
  assert.equal(Number(before.c), Number(after.c));
  assert.ok(r.written >= 1);
  const cands = listCandidates(db, { status: 'pending' });
  assert.ok(cands.length >= 1);
});

await ok('批次幂等：同一批消息不会因为重复处理再写一遍', () => {
  const batch = selectBatch(db, { batchSize: 3 }); // 已标记 extracted 的不会再出现
  if (!batch) { console.log('  （没有剩余批次，跳过）'); return; }
  const v = validateExtraction({ facts: [] }, { convKey: batch.convKey });
  writeExtraction(db, batch, v, { observeOnly: true });
  const remainingInBatch = db.prepare(`SELECT COUNT(*) AS c FROM messages WHERE extracted=0 AND id IN (${batch.ids.join(',')})`).get();
  assert.equal(Number(remainingInBatch.c), 0, '本批消息应全部标记已抽取');
});

await ok('候选去重：同 dedupe_key 不重复插入', () => {
  ingestMessage(db, msg(20));
  const batch = selectBatch(db, { batchSize: 1 });
  const v = validateExtraction({ facts: [{ subject_qq: '20001', attr: '口头禅', value: '真香' }] }, { convKey: batch.convKey });
  writeExtraction(db, batch, v, { observeOnly: true });
  ingestMessage(db, msg(21));
  const batch2 = selectBatch(db, { batchSize: 1 });
  const v2 = validateExtraction({ facts: [{ subject_qq: '20001', attr: '口头禅', value: '真香' }] }, { convKey: batch2.convKey });
  const r2 = writeExtraction(db, batch2, v2, { observeOnly: true });
  assert.equal(r2.written, 0);
  assert.equal(r2.duplicates, 1);
});

await ok('提取失败：消息保持未抽取，重试到上限后标记跳过', async () => {
  // 先把其他会话的待抽取消息清掉，确保后续几轮只处理 group:200
  db.prepare("UPDATE messages SET extracted=2 WHERE extracted=0 AND conv_key<>'group:200'").run();
  ingestMessage(db, msg(30, { convKey: 'group:200' }));
  const failModel = async () => { throw new Error('model down'); };
  for (let i = 0; i < 2; i++) {
    await runExtractionCycle({ db, callModel: failModel, config: { batchSize: 1, maxAttempts: 2 }, log: () => {} });
  }
  const left = db.prepare("SELECT COUNT(*) AS c FROM messages WHERE conv_key='group:200' AND extracted=0").get();
  const skipped = db.prepare("SELECT COUNT(*) AS c FROM messages WHERE conv_key='group:200' AND extracted=2").get();
  assert.equal(Number(left.c), 0, '达到上限后不再卡住队列');
  assert.equal(Number(skipped.c), 1);
});

await ok('成功一轮：写入候选并累加统计', async () => {
  ingestMessage(db, msg(40, { convKey: 'group:300' }));
  const fakeModel = async () => ({
    parsed: { facts: [{ subject_qq: '20001', subject_name: '小明', attr: '作息', value: '夜猫子', kind: 'multi', confidence: 0.8 }], events: [] },
    usage: { prompt: 120, completion: 60 }
  });
  const r = await runExtractionCycle({ db, callModel: fakeModel, config: { batchSize: 1, observeOnly: true }, log: () => {} });
  assert.equal(r.ok, true);
  const stat = db.prepare('SELECT * FROM extract_stats ORDER BY day DESC LIMIT 1').get();
  assert.ok(Number(stat.prompt_tokens) >= 120);
});

await ok('候选可通过 decideCandidate 标记', () => {
  const c = listCandidates(db, { status: 'pending' })[0];
  assert.ok(c);
  decideCandidate(db, c.id, 'apply', 'test');
  const row = db.prepare('SELECT status FROM memory_candidates WHERE id=?').get(c.id);
  assert.equal(row.status, 'applied');
});

db.close();
console.log(`\n结果：${pass} 通过，0 失败`);
