/**
 * Memory V3 Phase 1 隔离测试（只使用临时 SQLite 副本）
 * 运行：node scripts/test-memory-phase1.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

import { openMemoryDb, addFact, addEvent, searchMemory } from '../src/memory/db.js';
import {
  ensureExtractSchema, ingestMessage, selectBatch, buildExtractPrompt,
  validateExtraction, writeExtraction, applyCandidate, decideCandidate
} from '../src/memory/extractor.js';
import { startMemoryExtractionWorker, runExtractionCycle } from '../src/memory/worker.js';
import { retrieveMemoryForPrompt, buildQueryFromState } from '../src/memory/retrieve.js';
import { parseTimeRange, inTimeRange } from '../src/memory/time-range.js';

const NOW = Date.parse('2026-10-27T15:43:46+08:00');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-phase1-'));
const db = openMemoryDb(path.join(dir, 'phase1.db'));
ensureExtractSchema(db);

let pass = 0;
let fail = 0;
function ok(name, fn) {
  try { fn(); pass += 1; console.log(`✔ ${name}`); } catch (error) { fail += 1; console.log(`✖ ${name}\n  ${error.message}`); }
}
async function okAsync(name, fn) {
  try { await fn(); pass += 1; console.log(`✔ ${name}`); } catch (error) { fail += 1; console.log(`✖ ${name}\n  ${error.message}`); }
}

// ---------- 时间解析 ----------
const d = (s) => Date.parse(`${s}+08:00`);
ok('前几天 = 最近 7 个自然日', () => {
  const r = parseTimeRange('前几天发生过什么', NOW);
  assert.equal(r.kind, 'fuzzy');
  assert.ok(inTimeRange(d('2026-10-23T12:00:00'), r));
  assert.ok(inTimeRange(d('2026-10-25T23:00:00'), r));
});
ok('上周 = 上一个周一到周日', () => {
  const r = parseTimeRange('上周发生了什么', NOW);
  assert.equal(r.kind, 'week');
  assert.ok(inTimeRange(d('2026-10-19T00:00:00'), r));
  assert.ok(inTimeRange(d('2026-10-25T23:59:59'), r));
  assert.ok(!inTimeRange(d('2026-10-26T00:00:00'), r));
});
ok('三天前 = 10-24 全天', () => {
  const r = parseTimeRange('三天前', NOW);
  assert.ok(inTimeRange(d('2026-10-24T00:00:00'), r));
  assert.ok(inTimeRange(d('2026-10-24T23:59:59'), r));
  assert.ok(!inTimeRange(d('2026-10-25T00:00:00'), r));
});
ok('昨天 / 具体日期 / 范围', () => {
  assert.ok(inTimeRange(d('2026-10-26T10:00:00'), parseTimeRange('昨天', NOW)));
  assert.ok(inTimeRange(d('2026-10-23T10:00:00'), parseTimeRange('10月23日', NOW)));
  assert.ok(inTimeRange(d('2026-10-23T10:00:00'), parseTimeRange('2026-10-23', NOW)));
  const r = parseTimeRange('10月23日到25日', NOW);
  assert.equal(r.kind, 'range');
  assert.ok(inTimeRange(d('2026-10-25T23:00:00'), r));
});
ok('无时间词返回 null', () => assert.equal(parseTimeRange('她好可爱', NOW), null));
ok('第二阶段时间表达全量回归', () => {
  const cases = [
    ['今天', '2026-10-27T12:00:00'],
    ['昨天', '2026-10-26T12:00:00'],
    ['前天', '2026-10-25T12:00:00'],
    ['三天前', '2026-10-24T12:00:00'],
    ['五天前', '2026-10-22T12:00:00'],
    ['前几天', '2026-10-23T12:00:00'],
    ['最近一周', '2026-10-24T12:00:00'],
    ['上周', '2026-10-21T12:00:00'],
    ['本周', '2026-10-27T12:00:00'],
    ['10月23日', '2026-10-23T12:00:00'],
    ['10月24日', '2026-10-24T12:00:00'],
    ['10月23日至25日', '2026-10-24T12:00:00']
  ];
  for (const [text, at] of cases) {
    const r = parseTimeRange(text, NOW);
    assert.ok(r, `${text} 应解析`);
    assert.ok(inTimeRange(d(at), r), `${text} 应包含 ${at}`);
  }
  assert.equal(parseTimeRange('上次我们讨论那件事是什么时候', NOW), null, '“上次”不伪造日期，交由关键词检索');
});
ok('查询使用最后一条用户消息（时间问句不被旧消息覆盖）', () => {
  const q = buildQueryFromState({
    recentMessages: [
      { isSelf: false, userId: '2608855988', text: '早上好' },
      { isSelf: true, text: '早呀' },
      { isSelf: false, userId: '2608855988', text: '前几天发生过什么' }
    ]
  });
  assert.ok(q.text.includes('前几天'));
});

// ---------- is_self / is_owner ----------
const conv = 'private:2608855988';
ingestMessage(db, { convKey: conv, messageId: 'm1', seq: 1, senderQq: '2608855988', senderName: '主人', text: '今天去跑步了', sentAt: d('2026-10-23T09:00:00'), isOwner: true });
const row = db.prepare('SELECT * FROM messages WHERE conv_key=? ORDER BY id DESC LIMIT 1').get(conv);
ok('主人消息：is_self=0，is_owner=1', () => {
  assert.equal(row.is_self, 0);
  assert.equal(row.is_owner, 1);
});

// ---------- 批处理上下文 ----------
for (let i = 0; i < 5; i += 1) {
  ingestMessage(db, { convKey: conv, messageId: `ctx${i}`, senderQq: '2608855988', senderName: '主人', text: `前文 ${i}`, sentAt: d('2026-10-23T09:10:00') + i * 1000 });
}
db.prepare("UPDATE messages SET extracted=1 WHERE msg_key LIKE ? OR msg_key='mid:m1'").run('mid:ctx%');
ingestMessage(db, { convKey: conv, messageId: 'm-new', seq: 9, senderQq: '2608855988', senderName: '主人', text: '明天要早起比赛', sentAt: d('2026-10-23T10:00:00') });
const batch = selectBatch(db, { batchSize: 30, contextSize: 12 });
ok('碎片批次会带同会话前文', () => {
  assert.ok(batch);
  assert.equal(batch.rows.length, 1);
  assert.ok(batch.contextRows.length >= 5, `contextRows=${batch.contextRows.length}`);
  const prompt = buildExtractPrompt(batch, { convKey: conv });
  assert.ok(prompt.includes('前文（只作理解背景'));
  assert.ok(prompt.includes('主人'));
  assert.ok(prompt.includes('happened_at'));
});

// ---------- 抽取校验 + 事件时间 ----------
ok('事件 happened_at 解析；缺失时保留 unknown', () => {
  const v = validateExtraction(
    { events: [{ summary: '去跑校园跑', happened_at: '2026-10-23' }] },
    { convKey: conv, defaultHappenedAt: d('2026-10-24T00:00:00') }
  );
  assert.equal(v.events.length, 1);
  const local = new Date(v.events[0].happenedAt).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
  assert.ok(local.startsWith('2026-10-23 12:00:00'));
  assert.equal(v.events[0].timePrecision, 'day');
  const v2 = validateExtraction({ events: [{ summary: '没有日期' }] }, { convKey: conv, defaultHappenedAt: d('2026-10-24T00:00:00') });
  assert.equal(v2.events[0].happenedAt, null);
  assert.equal(v2.events[0].timePrecision, 'unknown');
});

// ---------- 观察模式新候选 + 审核 apply ----------
ok('观察模式只写候选，不写正式事件', () => {
  const v = validateExtraction({ events: [{ summary: '他跑完校园跑', happened_at: '2026-10-23' }] }, { convKey: conv, defaultHappenedAt: NOW });
  const r = writeExtraction(db, {
    convKey: conv, batchKey: 'test-batch-1', ids: [row.id], rows: [{ seq: 1 }]
  }, v, { observeOnly: true });
  assert.equal(r.written, 1);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM events').get().c, 0);
  const cand = db.prepare("SELECT * FROM memory_candidates WHERE batch_key='test-batch-1'").get();
  assert.ok(cand.happened_at);
});

okAsync('apply 候选：真正写正式事件，幂等且可审计', async () => {
  const cand = db.prepare("SELECT * FROM memory_candidates WHERE batch_key='test-batch-1'").get();
  const first = applyCandidate(db, cand.id, { reason: 'test approve' });
  assert.equal(first.status, 'applied');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM events').get().c, 1);
  const ev = db.prepare('SELECT * FROM events WHERE id=?').get(first.refId);
  assert.equal(ev.source_type, 'auto:approved');
  assert.ok(ev.happened_at > 0);
  const second = applyCandidate(db, cand.id, { reason: 'again' });
  assert.equal(second.already, true);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM events').get().c, 1);
  const after = db.prepare('SELECT * FROM memory_candidates WHERE id=?').get(cand.id);
  assert.equal(after.applied_ref_type, 'event');
  assert.ok(after.applied_at > 0);
});

ok('不同候选描述同一事件时合并到同一条正式事件', () => {
  const mk = (key, summary) => Number(db.prepare(`INSERT INTO memory_candidates
    (kind, summary, confidence, scope, visibility, dedupe_key, conv_key, status, happened_at, created_at)
    VALUES('event', ?, 0.7, 'private:2608855988', 'private', ?, 'private:2608855988', 'pending', ?, ?)`)
    .run(summary, key, d('2026-10-25T12:00:00'), NOW).lastInsertRowid);
  const a = mk('dup-event-a', '重复的事件描述');
  const b = mk('dup-event-b', '重复的事件描述');
  const before = db.prepare('SELECT COUNT(*) c FROM events').get().c;
  const ra = applyCandidate(db, a);
  const rb = applyCandidate(db, b);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM events').get().c, before + 1);
  assert.equal(ra.refId, rb.refId);
});

ok('全局事实主体非法/未显式允许时拒绝写入且保持 pending', () => {  const info = db.prepare(`INSERT INTO memory_candidates
    (kind, subject_qq, subject_name, attr, value, confidence, scope, visibility, kind_of_fact, dedupe_key, conv_key, status, happened_at, created_at)
    VALUES('fact', NULL, '南稚', '印象', '夜猫子', 0.5, 'global', 'global', 'multi', 'bad-global-1', 'group:1', 'pending', NULL, ?)`)
    .run(NOW);
  const id = Number(info.lastInsertRowid);
  assert.throws(() => applyCandidate(db, id, { reason: 'test' }), /主体|全局事实/);
  assert.equal(db.prepare('SELECT status FROM memory_candidates WHERE id=?').get(id).status, 'pending');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM facts WHERE source_key=?').get(`cand:${id}`).c, 0);
});

ok('rejected 候选不能 apply', () => {
  const id = Number(db.prepare(`INSERT INTO memory_candidates
    (kind, subject_qq, subject_name, attr, value, confidence, scope, visibility, kind_of_fact, dedupe_key, conv_key, status, created_at)
    VALUES('fact','1','某人','a','b',0.5,'group:1','group','multi','rej-1','group:1','pending',?)`).run(NOW).lastInsertRowid);
  decideCandidate(db, id, 'reject', 'test');
  assert.throws(() => applyCandidate(db, id), /不能 apply/);
});

ok('写入失败会回滚，候选保持 pending，修复后可重试', () => {
  const id = Number(db.prepare(`INSERT INTO memory_candidates
    (kind, subject_qq, subject_name, attr, value, confidence, scope, visibility, kind_of_fact, dedupe_key, conv_key, status, created_at)
    VALUES('fact','420000','测试主体','临时属性','临时值',0.5,'private:2608855988','private','multi','fail-rollback-1','private:2608855988','pending',?)`).run(NOW).lastInsertRowid);
  db.exec("CREATE TRIGGER fail_fact_insert BEFORE INSERT ON facts BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END");
  assert.throws(() => applyCandidate(db, id, { reason: 'fail' }), /simulated write failure/);
  assert.equal(db.prepare('SELECT status FROM memory_candidates WHERE id=?').get(id).status, 'pending');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM facts WHERE source_key=?').get(`cand:${id}`).c, 0);
  db.exec('DROP TRIGGER fail_fact_insert');
  const retry = applyCandidate(db, id, { reason: 'retry' });
  assert.equal(retry.status, 'applied');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM facts WHERE source_key=?').get(`cand:${id}`).c, 1);
});

ok('apply 模式（observeOnly=false）直接写正式事件', () => {
  const v = validateExtraction({ events: [{ summary: '直接写入的事件', happened_at: '2026-10-24' }] }, { convKey: conv, defaultHappenedAt: NOW });
  const before = db.prepare('SELECT COUNT(*) c FROM events').get().c;
  writeExtraction(db, { convKey: conv, batchKey: 'apply-mode-1', ids: [row.id], rows: [{ seq: 1 }] }, v, { observeOnly: false });
  assert.equal(db.prepare('SELECT COUNT(*) c FROM events').get().c, before + 1);
});

// ---------- 检索：时间范围 / 配额 / 隐私 ----------
const conv2 = 'private:2909661957';
for (const [day, summary] of [
  ['2026-10-23T12:00:00', '他去跑校园跑'],
  ['2026-10-24T12:00:00', '比赛输了但他释怀'],
  ['2026-10-25T12:00:00', '约好一起下馆子']
]) {
  addEvent(db, { summary, participants: ['2909661957'], happenedAt: d(day), scope: conv2, visibility: 'private', sourceKey: `evt-${day}` });
}
addEvent(db, { summary: '别的私聊的私密事件', participants: ['999'], happenedAt: d('2026-10-23T13:00:00'), scope: 'private:999999999', visibility: 'private', sourceKey: 'evt-other' });
addFact(db, { subjectQq: '2909661957', subjectName: '对方', attr: '习惯', value: '夜猫子', kind: 'multi', scope: conv2, visibility: 'private', sourceKey: 'fact-1' });
addFact(db, { subjectQq: '111111111', subjectName: '别人', attr: '印象', value: '爱吃辣', kind: 'multi', scope: 'global', visibility: 'global', sourceKey: 'fact-global-other' });
addFact(db, { subjectQq: '2909661957', subjectName: '对方', attr: '印象', value: '上早八', kind: 'multi', scope: 'global', visibility: 'global', sourceKey: 'fact-global-self' });

ok('时间范围检索能召回事件，并保留事件配额', () => {
  const r = retrieveMemoryForPrompt(db, { convKey: conv2, speakerQqs: ['2909661957'], text: '前几天发生过什么', now: NOW, limit: 10 });
  assert.ok(r.range);
  assert.ok(r.events >= 1, `events=${r.events}`);
  assert.ok(r.events <= 10);
  const lines = r.text.split('\n').filter((l) => l.startsWith('- '));
  assert.ok(lines.some((l) => l.includes('10-23') || l.includes('10-24') || l.includes('10-25')), r.text);
  assert.ok(!r.text.includes('别的私聊'), '不能跨私聊泄露');
});

ok('精确日期只返回当天事件（三天前=10-24）', () => {
  const r = retrieveMemoryForPrompt(db, { convKey: conv2, speakerQqs: ['2909661957'], text: '三天前发生过什么', now: NOW, limit: 10 });
  assert.equal(r.events, 1, r.text);
  assert.ok(r.text.includes('- 10-24'), r.text);
  const none = retrieveMemoryForPrompt(db, { convKey: conv2, speakerQqs: ['2909661957'], text: '昨天发生过什么', now: NOW, limit: 10 });
  assert.equal(none.events, 0, none.text);
});

ok('关键词仍可召回事件', () => {
  const r = retrieveMemoryForPrompt(db, { convKey: conv2, speakerQqs: ['2909661957'], text: '校园跑', now: NOW });
  assert.ok(r.events >= 1, `events=${r.events}`);
});

ok('全局事实不会跨用户注入（非当前说话人）', () => {
  const r = retrieveMemoryForPrompt(db, { convKey: conv2, speakerQqs: ['2909661957'], text: '爱吃辣 别人 111111111', now: NOW });
  assert.ok(!r.text.includes('爱吃辣'), r.text);
});

ok('全局事实在本人说话时可以召回', () => {
  const r = retrieveMemoryForPrompt(db, { convKey: conv2, speakerQqs: ['2909661957'], text: '上早八', now: NOW });
  assert.ok(r.text.includes('上早八'), r.text);
});

ok('事实没有昵称时不输出完整 QQ', () => {
  addFact(db, { subjectQq: '2608855988', subjectName: '2608855988', attr: '测试属性', value: '测试值', kind: 'multi', scope: 'global', visibility: 'global', sourceKey: 'mask-fact' });
  const r = retrieveMemoryForPrompt(db, { convKey: conv2, speakerQqs: ['2608855988'], text: '测试属性 测试值', now: NOW });
  assert.ok(r.text.includes('测试值'), r.text);
  assert.ok(!r.text.includes('2608855988'), '不能把完整 QQ 注入回答上下文');
  assert.ok(r.text.includes('QQ***5988'), r.text);
});

ok('事件 detail 进入注入（帮助区分已发生/计划）', () => {
  const id = Number(db.prepare(`INSERT INTO memory_candidates
    (kind, summary, detail, confidence, scope, visibility, dedupe_key, conv_key, status, happened_at, time_precision, created_at)
    VALUES('event','主人说请客吃饭','主人表示行我请客，饭刚到',0.7,'private:2909661957','private','detail-1','private:2909661957','pending',?, 'day', ?)`).run(d('2026-10-25T20:15:00'), NOW).lastInsertRowid);
  const applied = applyCandidate(db, id);
  const r = retrieveMemoryForPrompt(db, { convKey: conv2, speakerQqs: ['2909661957'], text: '请客', now: NOW });
  assert.ok(r.text.includes('饭刚到'), r.text);
});

ok('事件参与者可被主体召回（不依赖关键词）', () => {
  const hits = searchMemory(db, { convKey: conv2, qqs: ['2909661957'], text: '随便聊聊', now: NOW, limit: 20 });
  assert.ok(hits.some((h) => h.type === 'event'), '应通过 participants 召回事件');
});

ok('检索失败安全降级为空，不向上抛', () => {
  const bad = { prepare() { throw new Error('db broken'); } };
  const r = retrieveMemoryForPrompt(bad, { convKey: conv2, text: '前几天', now: NOW });
  assert.equal(r.hits, 0);
  assert.equal(r.text, '');
});

ok('“上次讨论某件事”走关键词检索，不伪造日期', () => {
  const r = retrieveMemoryForPrompt(db, { convKey: conv2, speakerQqs: ['2909661957'], text: '上次我们讨论校园跑是什么时候', now: NOW });
  assert.equal(r.range, null);
  assert.ok(r.events >= 1, r.text);
});

ok('无日期事件保留 unknown，不伪造发生时间', () => {
  const id = Number(db.prepare(`INSERT INTO memory_candidates
    (kind, summary, confidence, scope, visibility, dedupe_key, conv_key, status, created_at)
    VALUES('event','一次没有明确日期的经历',0.7,'private:2909661957','private','undated-1','private:2909661957','pending',?)`).run(NOW).lastInsertRowid);
  const r = applyCandidate(db, id);
  const ev = db.prepare('SELECT * FROM events WHERE id=?').get(r.refId);
  assert.equal(ev.happened_at, null);
  assert.equal(ev.time_precision, 'unknown');
  const text = retrieveMemoryForPrompt(db, { convKey: conv2, speakerQqs: ['2909661957'], text: '一次没有明确日期的经历', now: NOW });
  assert.ok(text.text.includes('[日期不确定]'), text.text);
  const dated = retrieveMemoryForPrompt(db, { convKey: conv2, speakerQqs: ['2909661957'], text: '昨天发生过什么', now: NOW });
  assert.equal(dated.events, 0, 'unknown 事件不应进入日期范围');
});

// ---------- 批处理触发 ----------
await okAsync('抽取周期（stub 模型）能写候选并保留 happened_at', async () => {
  const db3 = openMemoryDb(path.join(dir, 'cycle.db'));
  ensureExtractSchema(db3);
  for (let i = 0; i < 9; i += 1) {
    ingestMessage(db3, { convKey: 'private:2608855988', messageId: `cycle-${i}`, senderQq: '2608855988', senderName: '主人', text: `第 ${i} 条：今天去跑校园跑`, sentAt: d('2026-10-23T09:00:00') + i * 1000, isOwner: true });
  }
  const r = await runExtractionCycle({
    db: db3,
    callModel: async () => ({ parsed: { events: [{ summary: '去跑校园跑', happened_at: '2026-10-23' }] }, usage: { prompt: 1, completion: 1 } }),
    config: { observeOnly: true, batchSize: 30, contextSize: 5 }
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  const cand = db3.prepare("SELECT * FROM memory_candidates WHERE kind='event' ORDER BY id DESC LIMIT 1").get();
  assert.ok(cand);
  assert.ok(cand.happened_at);
  assert.equal(db3.prepare('SELECT COUNT(*) c FROM events').get().c, 0);
});

await okAsync('低流量不会 1 条就抽，超过最大等待会抽', async () => {
  const db2 = openMemoryDb(path.join(dir, 'worker.db'));
  ensureExtractSchema(db2);
  ingestMessage(db2, { convKey: conv, messageId: 'w-old', senderQq: '1', senderName: 'x', text: 'old', sentAt: Date.now() - 3 * 3600_000 });
  const w = startMemoryExtractionWorker({ db: db2, callModel: async () => ({ parsed: { events: [] }, usage: {} }), config: { minBatchSize: 8, maxWaitMinutes: 120 } });
  assert.equal(w.shouldRun(), true, '3 小时前应触发最大等待');
  w.stop();
  ingestMessage(db2, { convKey: conv, messageId: 'w-new', senderQq: '1', senderName: 'x', text: 'new', sentAt: Date.now() });
  db2.prepare("UPDATE messages SET extracted=1 WHERE msg_key='mid:w-old'").run();
  const w2 = startMemoryExtractionWorker({ db: db2, callModel: async () => ({ parsed: { events: [] }, usage: {} }), config: { minBatchSize: 8, maxWaitMinutes: 120 } });
  assert.equal(w2.shouldRun(), false, '刚到的 1 条不应立即抽');
  w2.stop();
});

console.log(`\nRESULT pass=${pass} fail=${fail}`);
db.close();
process.exit(fail ? 1 : 0);
