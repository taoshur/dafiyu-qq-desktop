/**
 * Memory V3 阶段 3 测试：检索（主体/关键词/预算）、隐私隔离、注入格式、质量闸门
 * 运行：node scripts/test-memory-retrieval.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { openMemoryDb, addFact, addEvent, searchMemory } from '../src/memory/db.js';
import { ensureExtractSchema, ingestMessage, selectBatch, validateExtraction, writeExtraction, listCandidates } from '../src/memory/extractor.js';
import { retrieveMemoryForPrompt, buildQueryFromState, estimateTokens } from '../src/memory/retrieve.js';
import { classifyCandidate, qualitySummary } from '../src/memory/quality.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-v3-p3-'));
const db = openMemoryDb(path.join(dir, 'test.db'));
ensureExtractSchema(db);
let pass = 0;
const ok = async (name, fn) => { await fn(); pass += 1; console.log('✔', name); };

// 造数据
addFact(db, { subjectQq: '111', subjectName: '小明', attr: '喜欢的游戏', value: '消消乐', kind: 'multi', scope: 'global', visibility: 'global' });
addFact(db, { subjectQq: '111', subjectName: '小明', attr: '作息', value: '夜猫子', kind: 'multi', scope: 'global', visibility: 'global' });
addFact(db, { subjectQq: '111', subjectName: '小明', attr: '私事', value: '最近搬家', kind: 'multi', scope: 'private:111', visibility: 'private' });
addFact(db, { subjectQq: '222', subjectName: '小红', attr: '宠物', value: '养了只猫', kind: 'multi', scope: 'group:9', visibility: 'group' });
addEvent(db, { summary: '小明通关第18关', participants: ['111'], scope: 'group:9', visibility: 'group' });

await ok('检索：主体命中优先', () => {
  const r = retrieveMemoryForPrompt(db, { convKey: 'group:9', speakerQqs: ['111'], text: '', limit: 5 });
  assert.ok(r.hits >= 2);
  assert.ok(r.text.includes('小明'));
});

await ok('检索：关键词命中', () => {
  const r = retrieveMemoryForPrompt(db, { convKey: 'group:9', speakerQqs: [], text: '猫 宠物', limit: 5 });
  assert.ok(r.text.includes('猫') || r.text.includes('小红'));
});

await ok('隐私隔离：群聊检索不到私聊事实', () => {
  const g = retrieveMemoryForPrompt(db, { convKey: 'group:9', speakerQqs: ['111'], text: '搬家', limit: 10 });
  assert.equal(g.text.includes('搬家'), false);
  const p = retrieveMemoryForPrompt(db, { convKey: 'private:111', speakerQqs: ['111'], text: '搬家', limit: 10 });
  assert.equal(p.text.includes('搬家'), true);
});

await ok('Token 预算：超预算不再追加', () => {
  const full = retrieveMemoryForPrompt(db, { convKey: 'group:9', speakerQqs: ['111'], text: '', limit: 10, budgetTokens: 1000 });
  const tiny = retrieveMemoryForPrompt(db, { convKey: 'group:9', speakerQqs: ['111'], text: '', limit: 10, budgetTokens: 12 });
  assert.ok(full.tokens >= tiny.tokens);
  assert.ok(tiny.tokens <= 12 || tiny.hits === 0);
});

await ok('事件也进检索结果', () => {
  const r = retrieveMemoryForPrompt(db, { convKey: 'group:9', speakerQqs: [], text: '通关 第18关', limit: 5 });
  assert.ok(r.text.includes('通关') || r.events > 0);
});

await ok('buildQueryFromState：从最近消息提取发言者与话题', () => {
  const st = {
    recentMessages: [
      { isSelf: false, userId: '111111', text: '今天想玩游戏' },
      { isSelf: false, userId: '222222', text: '猫又拆家了' }
    ],
    activeTopics: [{ text: '聊宠物' }]
  };
  const q = buildQueryFromState(st);
  assert.deepEqual(q.speakerQqs.sort(), ['111111', '222222']);
  assert.ok(q.text.includes('宠物'));
});

await ok('estimateTokens：中文按 1.5 字/token', () => {
  assert.equal(estimateTokens('123456'), 2);
  assert.ok(estimateTokens('中文测试') >= 2);
});

await ok('质量闸门：单次行为→over_inference', () => {
  const j = classifyCandidate({ kind: 'fact', category: 'trait', evidenceCount: 1, selfStated: false, attr: '性格', value: '爱催人' }, { convKey: 'group:1' });
  assert.equal(j.reject, 'over_inference');
});

await ok('质量闸门：本人自述可放行', () => {
  const j = classifyCandidate({ kind: 'fact', category: 'trait', evidenceCount: 1, selfStated: true, subjectQq: '111111', attr: '性格', value: '爱催人' }, { convKey: 'group:1' });
  assert.equal(j.reject, null);
});

await ok('质量闸门：技术事件→ops_event', () => {
  const j = classifyCandidate({ kind: 'event', category: 'tech', summary: '模拟器掉线了' }, { convKey: 'group:1' });
  assert.equal(j.reject, 'ops_event');
});

await ok('质量闸门：隐私内容→privacy_risk', () => {
  const j = classifyCandidate({ kind: 'fact', category: 'profile', attr: '工资', value: '月薪两万' }, { convKey: 'private:1' });
  assert.equal(j.reject, 'privacy_risk');
});

await ok('质量闸门：临时计划带过期时间', () => {
  const j = classifyCandidate({ kind: 'fact', category: 'plan', attr: '当前计划', value: '做出歌', ttlDays: 3 }, { convKey: 'group:1' });
  assert.ok(j.expiresAt > Date.now());
});

await ok('候选写入：被拒的候选 status=rejected 且不计入有效', () => {
  const before = qualitySummary(db);
  ingestMessage(db, { convKey: 'group:9', messageId: 'q1', seq: 1, senderQq: '111', senderName: '小明', text: '我今天又催他吃饭了', sentAt: Date.now(), isSelf: false });
  const batch = selectBatch(db, { batchSize: 5 });
  const v = validateExtraction({
    facts: [
      { subject_qq: '111', subject_name: '小明', attr: '性格', value: '爱催人', category: 'trait', evidence_count: 1 },
      { subject_qq: '111', subject_name: '小明', attr: '喜欢的游戏', value: '原神', category: 'preference', kind: 'multi', evidence_count: 2 }
    ],
    events: [{ summary: '模拟器掉线，需要重启', category: 'tech' }]
  }, { convKey: batch.convKey });
  const r = writeExtraction(db, batch, v, { observeOnly: true });
  assert.ok(r.rejected >= 2, 'trait 与技术事件应被拒');
  assert.ok(r.written >= 1, '正常偏好应通过');
  const after = qualitySummary(db);
  assert.ok(after.over_inference >= 1);
  assert.ok(after.ops_event >= 1);
});

db.close();
console.log(`\n结果：${pass} 通过，0 失败`);
