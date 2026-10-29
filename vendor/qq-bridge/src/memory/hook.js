/**
 * 桥接侧挂钩：消息入库 + 启动提取 worker。
 * 所有导出函数都**不会抛异常**——DB 出错只记日志，聊天主流程不受影响。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMemoryDb } from './db.js';
import { ingestMessage, ensureExtractSchema } from './extractor.js';
import { startMemoryExtractionWorker, callDeepSeek } from './worker.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let db = null;
let worker = null;
let started = false;
let disabled = false;
let logFn = () => {};
let stats = { ingested: 0, errors: 0, lastError: '' };

function memoryConf() {
  return globalThis.__MEMORY_CONF__ || {};
}

export function initMemoryHook({ config, log } = {}) {
  if (config) globalThis.__MEMORY_CONF__ = config;
  if (log) logFn = log;
}

export function getMemoryDb() {
  if (db) return db;
  const cfg = memoryConf();
  const dbPath = path.isAbsolute(cfg.dbPath || '') ? cfg.dbPath : path.join(ROOT, cfg.dbPath || 'state/memory.db');
  db = openMemoryDb(dbPath);
  ensureExtractSchema(db);
  return db;
}

export function memoryRuntimeStats() {
  return { ...stats, worker: Boolean(worker), disabled };
}

/** 消息入库（best-effort，永不抛） */
export function noteMessageForMemory(entry) {
  if (disabled) return;
  try {
    const cfg = memoryConf();
    if (cfg.ingest === false) return;
    const d = getMemoryDb();
    const r = ingestMessage(d, entry);
    if (r.inserted) stats.ingested += 1;
    startWorkerIfNeeded(d, cfg);
  } catch (error) {
    stats.errors += 1;
    stats.lastError = String(error?.message ?? error).slice(0, 200);
    try { logFn('[memory] 入库失败：' + stats.lastError); } catch {}
    if (stats.errors >= 5) disabled = true; // 连续失败就自禁用，保护聊天
  }
}

function startWorkerIfNeeded(d, cfg) {
  if (started || worker) return;
  started = true;
  if (cfg.extract === false) return;
  const fp = globalThis.__FASTPATH_CONF__ || {};
  const callModel = ({ prompt, model }) => callDeepSeek({
    apiKey: fp.apiKey,
    baseUrl: fp.baseUrl,
    model: model || fp.model || 'deepseek-chat',
    prompt,
    timeoutMs: cfg.timeoutMs || 60000
  });
  worker = startMemoryExtractionWorker({
    db: d,
    callModel,
    config: {
      batchSize: cfg.batchSize ?? 30,
      minBatchSize: cfg.minBatchSize ?? 8,
      contextSize: cfg.contextSize ?? 12,
      maxQueue: cfg.maxQueue ?? 200,
      maxAttempts: cfg.maxAttempts ?? 3,
      idleMinutes: cfg.idleMinutes ?? 30,
      maxWaitMinutes: cfg.maxWaitMinutes ?? 120,
      intervalMs: cfg.intervalMs ?? 60000,
      observeOnly: cfg.observeOnly !== false,
      model: cfg.model || fp.model || 'deepseek-chat'
    },
    log: (m) => { try { logFn(m); } catch {} }
  });
}
