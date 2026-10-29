/**
 * Memory V3 第二阶段质量指标（隔离副本，只读）
 * 用法：node scripts/memory-metrics-phase2.mjs --db <副本.db>
 */
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { retrieveMemoryForPrompt } from '../src/memory/retrieve.js';

const args = process.argv.slice(2);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const dbPath = path.resolve(val('--db') || '');
if (!dbPath || !fs.existsSync(dbPath)) { console.error('需要 --db <隔离副本>'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync('C:/Users/admin/qq-bridge/config.json', 'utf8'));
const ownerQq = String(cfg.ownerQQ || '');
const db = new DatabaseSync(dbPath, { readOnly: true });
const day = (col) => `date(${col}/1000,'unixepoch','+8 hours')`;

const daily = db.prepare(`
  SELECT ${day('sent_at')} d,
    COUNT(*) messages,
    SUM(CASE WHEN sender_qq=? THEN 1 ELSE 0 END) ownerMsgs,
    SUM(CASE WHEN sender_qq IS NOT NULL AND sender_qq<>? THEN 1 ELSE 0 END) otherMsgs,
    SUM(CASE WHEN sender_qq IS NULL THEN 1 ELSE 0 END) unknownMsgs,
    SUM(CASE WHEN is_self=1 THEN 1 ELSE 0 END) legacySelf
  FROM messages GROUP BY d ORDER BY d`).all(ownerQq, ownerQq);

const batches = db.prepare(`
  SELECT ${day('created_at')} d, COUNT(*) batches,
    SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed,
    SUM(attempts) attempts
  FROM extraction_batches GROUP BY d ORDER BY d`).all();
const candidates = db.prepare(`
  SELECT ${day('created_at')} d, kind, status, COUNT(*) n,
    SUM(CASE WHEN kind='event' AND happened_at IS NULL THEN 1 ELSE 0 END) missingHappened
  FROM memory_candidates GROUP BY d, kind, status ORDER BY d`).all();
const events = db.prepare(`SELECT ${day('happened_at')} d, COUNT(*) n,
  SUM(CASE WHEN time_precision='unknown' OR happened_at IS NULL THEN 1 ELSE 0 END) unknownTime
  FROM events GROUP BY d ORDER BY d`).all();
const stats = db.prepare('SELECT * FROM extract_stats ORDER BY day').all();

const convs = db.prepare('SELECT DISTINCT conv_key FROM messages ORDER BY conv_key').all().map((r) => r.conv_key);
const lat = [];
for (const conv of convs) {
  const t0 = performance.now();
  retrieveMemoryForPrompt(db, { convKey: conv, speakerQqs: [], text: '前几天发生过什么', now: Date.parse('2026-10-27T18:00:00+08:00') });
  lat.push(performance.now() - t0);
}

const byDay = new Map();
for (const r of daily) byDay.set(r.d, { ...r, batches: 0, failed: 0, factCandidates: 0, eventCandidates: 0, applied: 0, rejected: 0, events: 0, eventUnknownTime: 0 });
for (const r of batches) { if (byDay.has(r.d)) Object.assign(byDay.get(r.d), { batches: r.batches, failed: r.failed }); }
for (const r of candidates) {
  const x = byDay.get(r.d); if (!x) continue;
  if (r.kind === 'fact') x.factCandidates += r.n;
  if (r.kind === 'event') x.eventCandidates += r.n;
  if (r.status === 'applied') x.applied += r.n;
  if (r.status === 'rejected') x.rejected += r.n;
}
for (const r of events) { const x = byDay.get(r.d); if (x) { x.events += r.n; x.eventUnknownTime += r.unknownTime; } }

const rows = [...byDay.values()].map((x) => ({
  day: x.d,
  messages: x.messages,
  ownerMessages: x.ownerMsgs,
  otherMessages: x.otherMsgs,
  unknownMessages: x.unknownMsgs,
  legacySelf: x.legacySelf,
  batches: x.batches,
  failedBatches: x.failed,
  failureRate: x.batches ? Number((x.failed / x.batches).toFixed(3)) : 0,
  factCandidates: x.factCandidates,
  eventCandidates: x.eventCandidates,
  applied: x.applied,
  rejected: x.rejected,
  events: x.events,
  unknownEventTime: x.eventUnknownTime,
  eventTimeMissingRate: x.events ? Number((x.eventUnknownTime / x.events).toFixed(3)) : 0
}));

const alerts = [];
for (let i = 1; i < rows.length; i += 1) {
  if (rows[i].messages > 0 && rows[i].eventCandidates === 0 && rows[i - 1].eventCandidates === 0) {
    alerts.push({ day: rows[i].day, kind: 'no-event-candidates-2d', note: '连续两天有消息但无事件候选（需人工复核，不一定故障）' });
  }
}

const out = {
  db: dbPath,
  generatedAt: new Date().toISOString(),
  daily: rows,
  totals: {
    messages: db.prepare('SELECT COUNT(*) c FROM messages').get().c,
    events: db.prepare('SELECT COUNT(*) c FROM events').get().c,
    facts: db.prepare("SELECT COUNT(*) c FROM facts WHERE status='active'").get().c,
    pendingCandidates: db.prepare("SELECT COUNT(*) c FROM memory_candidates WHERE status='pending'").get().c,
    appliedCandidates: db.prepare("SELECT COUNT(*) c FROM memory_candidates WHERE status='applied'").get().c,
    rejectedCandidates: db.prepare("SELECT COUNT(*) c FROM memory_candidates WHERE status='rejected'").get().c
  },
  extractStats: stats,
  latencyMs: {
    retrievalAvg: lat.length ? Number((lat.reduce((a, b) => a + b, 0) / lat.length).toFixed(2)) : null,
    retrievalMax: lat.length ? Number(Math.max(...lat).toFixed(2)) : null
  },
  unavailable: {
    eventAnswerAccuracy: '需要真实模型 A/B，本轮未执行',
    fabricationRate: '需要真实模型 A/B，本轮未执行',
    historicalRecall: '需要人工标注或真实模型回放，本轮只有候选回放'
  },
  alerts
};
const file = path.join(process.env.TEMP || '.', 'dafiyu-memory-metrics.json');
fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify({ file, ...out }, null, 2));
db.close();
