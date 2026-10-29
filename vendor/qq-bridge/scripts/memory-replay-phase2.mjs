/**
 * Memory V3 Phase 2：使用 2026-10-23～27 历史数据的隔离回放。
 *
 * - 通过 sqlite3 .backup 生成一致性副本，不改生产库；
 * - 只 apply 23～25 日的事件候选，模拟审核通过的一小批，不做全量；
 * - 验证正式写入、时间检索、配额、跨私聊隐私、去重、失败回滚。
 *
 * 运行：node scripts/memory-replay-phase2.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openMemoryDb } from '../src/memory/db.js';
import { ensureExtractSchema, applyCandidate, decideCandidate, pendingStats } from '../src/memory/extractor.js';
import { retrieveMemoryForPrompt } from '../src/memory/retrieve.js';
import { parseTimeRange } from '../src/memory/time-range.js';

const PROD = process.env.QQ_BRIDGE_DB || 'C:/Users/admin/qq-bridge/state/memory.db';
const NOW = Date.parse('2026-10-27T18:00:00+08:00');
const outIdx = process.argv.indexOf('--out');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-replay-'));
const copy = outIdx >= 0 ? path.resolve(process.argv[outIdx + 1]) : path.join(dir, 'memory-copy.db');
fs.mkdirSync(path.dirname(copy), { recursive: true });
execFileSync('sqlite3', [PROD, `.backup '${copy.replace(/'/g, "''")}'`], { windowsHide: true });
const db = openMemoryDb(copy);
ensureExtractSchema(db);

const result = { source: PROD, copy, at: NOW, before: {}, applied: [], after: {}, retrieval: [], privacy: {}, failure: {}, dedupe: {} };

const count = (sql, ...p) => db.prepare(sql).get(...p)?.c || 0;
result.before = {
  messages: count('SELECT COUNT(*) c FROM messages'),
  events: count('SELECT COUNT(*) c FROM events'),
  facts: count('SELECT COUNT(*) c FROM facts'),
  candidatesPending: count("SELECT COUNT(*) c FROM memory_candidates WHERE status='pending'"),
  candidatesApplied: count("SELECT COUNT(*) c FROM memory_candidates WHERE status='applied'")
};

// 只挑 23～25 日的 pending 事件候选，模拟人工审核通过的一小批
const start = Date.parse('2026-10-23T00:00:00+08:00');
const end = Date.parse('2026-10-26T00:00:00+08:00');
const candidates = db.prepare(`SELECT * FROM memory_candidates
  WHERE kind='event' AND status='pending' AND created_at >= ? AND created_at < ?
  ORDER BY id`).all(start, end);
for (const c of candidates) {
  try {
    const r = applyCandidate(db, c.id, { reason: 'phase2 replay approved' });
    result.applied.push({ id: c.id, refId: r.refId, happenedAt: c.happened_at });
  } catch (error) {
    result.applied.push({ id: c.id, error: error.message });
  }
}

result.after = {
  events: count('SELECT COUNT(*) c FROM events'),
  facts: count('SELECT COUNT(*) c FROM facts'),
  candidatesPending: count("SELECT COUNT(*) c FROM memory_candidates WHERE status='pending'"),
  candidatesApplied: count("SELECT COUNT(*) c FROM memory_candidates WHERE status='applied'")
};
result.formalEvents = db.prepare('SELECT id, scope, happened_at FROM events ORDER BY happened_at').all().map((e) => ({
  id: e.id,
  scope: e.scope,
  happenedAt: new Date(Number(e.happened_at)).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })
}));

function retrieval(label, conv, text, qqs) {
  const r = retrieveMemoryForPrompt(db, { convKey: conv, speakerQqs: qqs, text, now: NOW, limit: 10 });
  const lines = r.text.split('\n').filter((l) => l.startsWith('- '));
  result.retrieval.push({
    label, conv, text, range: r.range, hits: r.hits, facts: r.facts, events: r.events,
    eventLines: lines.filter((l) => /^- (~?\d{1,2}-\d{1,2}|\[日期不确定\])/.test(l)).length,
    factLines: lines.filter((l) => !/^- (~?\d{1,2}-\d{1,2}|\[日期不确定\])/.test(l)).length
  });
  return r;
}

// 主人私聊：23～25 日没有事件候选，不应凭空出现别人的事件
retrieval('owner-private', 'private:2608855988', '前几天发生过什么', ['2608855988']);
// 另一私聊：23～25 日候选应能被时间范围召回
retrieval('other-private', 'private:2909661957', '前几天发生过什么', ['2909661957']);
// 群聊：25 日群事件（如果有）应能被召回
retrieval('group', 'group:1043874890', '上周发生过什么', []);
// 精确日期与单日范围
retrieval('other-three-days', 'private:2909661957', '三天前发生过什么', ['2909661957']);
retrieval('group-date', 'group:1043874890', '10月25日发生过什么', []);
retrieval('other-yesterday', 'private:2909661957', '昨天发生过什么', ['2909661957']);

// 隐私：主人私聊不能看到另一私聊的事件
const ownerR = retrieveMemoryForPrompt(db, { convKey: 'private:2608855988', speakerQqs: ['2608855988'], text: '校园跑 墨鱼 下馆子', now: NOW });
result.privacy = {
  ownerCanSeeOtherPrivate: /校园跑|墨鱼|下馆子/.test(ownerR.text),
  otherConvEvents: count("SELECT COUNT(*) c FROM events WHERE scope='private:2909661957'"),
  ownerConvEvents: count("SELECT COUNT(*) c FROM events WHERE scope='private:2608855988'")
};

// 去重：同一个候选再 apply 一次不新增事件
const firstId = result.applied.find((x) => x.refId)?.id;
if (firstId) {
  const before = count('SELECT COUNT(*) c FROM events');
  const again = applyCandidate(db, firstId, { reason: 'dedupe check' });
  result.dedupe = { candidate: firstId, already: again.already, before, after: count('SELECT COUNT(*) c FROM events') };
}

// 失败回滚：全局事实主体非法，apply 失败且不写入正式事实
const bad = db.prepare(`INSERT INTO memory_candidates
  (kind, subject_qq, subject_name, attr, value, confidence, scope, visibility, kind_of_fact, dedupe_key, conv_key, status, created_at)
  VALUES('fact', NULL, '某人', '印象', '测试', 0.5, 'global', 'global', 'multi', 'phase2-bad', 'group:1043874890', 'pending', ?)`).run(NOW);
const badId = Number(bad.lastInsertRowid);
const beforeFacts = count('SELECT COUNT(*) c FROM facts');
let error = '';
try { applyCandidate(db, badId, { reason: 'should fail' }); } catch (e) { error = e.message; }
result.failure = {
  candidate: badId, error,
  factsBefore: beforeFacts, factsAfter: count('SELECT COUNT(*) c FROM facts'),
  status: db.prepare('SELECT status FROM memory_candidates WHERE id=?').get(badId).status,
  formalRows: count('SELECT COUNT(*) c FROM facts WHERE source_key=?', `cand:${badId}`)
};
decideCandidate(db, badId, 'reject', 'phase2 test cleanup');

// 时间范围覆盖检查
result.ranges = {
  qianji: parseTimeRange('前几天', NOW),
  shangzhou: parseTimeRange('上周', NOW),
  threeDays: parseTimeRange('三天前', NOW)
};

fs.writeFileSync(path.join(dir, 'replay-result.json'), JSON.stringify(result, null, 2), 'utf8');
console.log(JSON.stringify(result, null, 2));
console.log('COPY', copy);
db.close();
