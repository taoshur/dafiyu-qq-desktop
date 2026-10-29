/**
 * 自动提取 worker：便宜模型 + 批量 + 退避重试 + 队列上限。
 * 任何异常都被这里吞掉（只记日志/统计），绝不影响桥接主流程。
 */
import { selectBatch, buildExtractPrompt, validateExtraction, writeExtraction, noteStats, pendingStats, ensureExtractSchema } from './extractor.js';

const DEFAULTS = {
  batchSize: 30,
  minBatchSize: 8,
  contextSize: 12,
  maxQueue: 200,
  maxAttempts: 3,
  idleMinutes: 30,
  maxWaitMinutes: 120,
  intervalMs: 60 * 1000,
  observeOnly: true,
  model: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com',
  timeoutMs: 60000
};

export async function callDeepSeek({ apiKey, baseUrl, model, prompt, timeoutMs }) {
  const url = `${String(baseUrl || DEFAULTS.baseUrl).replace(/\/+$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: '你是记忆抽取器，只输出 JSON。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 800,
      response_format: { type: 'json_object' },
      stream: false
    }),
    signal: AbortSignal.timeout(Number(timeoutMs) || DEFAULTS.timeoutMs)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content || '{}';
  const usage = json?.usage || {};
  let parsed;
  try { parsed = JSON.parse(content); } catch { throw new Error('模型返回不是合法 JSON'); }
  return { parsed, raw: content, usage: { prompt: Number(usage.prompt_tokens) || 0, completion: Number(usage.completion_tokens) || 0 } };
}

export async function runExtractionCycle({ db, callModel, config = {}, log = () => {} }) {
  const cfg = { ...DEFAULTS, ...config };
  ensureExtractSchema(db);
  const pend = pendingStats(db);
  if (!pend.pending) return { skipped: 'empty' };
  if (pend.pending > cfg.maxQueue) {
    log(`[memory-extract] 待抽取 ${pend.pending} 条超上限 ${cfg.maxQueue}，跳过本轮（不丢消息）`);
    return { skipped: 'overflow', pending: pend.pending };
  }

  const batch = selectBatch(db, { batchSize: cfg.batchSize, maxQueue: cfg.maxQueue, contextSize: cfg.contextSize });
  if (!batch || batch.overflow) return { skipped: 'no-batch' };

  const prompt = buildExtractPrompt(batch, { convKey: batch.convKey });
  try {
    const { parsed, usage } = await callModel({ prompt, model: cfg.model });
    const lastMessageAt = Number(batch.rows[batch.rows.length - 1]?.sent_at) || Date.now();
    const validated = validateExtraction(parsed, { convKey: batch.convKey, defaultHappenedAt: lastMessageAt });
    const { written, duplicates } = writeExtraction(db, batch, validated, { observeOnly: cfg.observeOnly });
    noteStats(db, {
      batches: 1, messages: batch.rows.length,
      facts: validated.facts.length, events: validated.events.length,
      invalid: validated.errors.length,
      promptTokens: usage.prompt, completionTokens: usage.completion
    });
    log(`[memory-extract] ${batch.convKey} ${batch.rows.length} 条 → 候选 ${written}（重复 ${duplicates}，非法 ${validated.errors.length}）`);
    return { ok: true, written, duplicates, invalid: validated.errors.length, usage };
  } catch (error) {
    // 失败：消息保持未抽取，记一次错误；批次状态落库便于观察
    const key = batch.batchKey;
    db.prepare(`INSERT INTO extraction_batches(batch_key, conv_key, from_seq, to_seq, status, attempts, last_error, created_at, updated_at)
      VALUES(?,?,?,?, 'failed', 1, ?, ?, ?)
      ON CONFLICT(batch_key) DO UPDATE SET attempts=attempts+1, last_error=excluded.last_error, updated_at=excluded.updated_at`)
      .run(key, batch.convKey, batch.rows[0]?.seq ?? null, batch.rows[batch.rows.length - 1]?.seq ?? null,
        String((error?.message ?? error)).slice(0, 300), Date.now(), Date.now());
    const att = db.prepare('SELECT attempts FROM extraction_batches WHERE batch_key=?').get(key)?.attempts || 1;
    if (att >= cfg.maxAttempts) {
      db.prepare(`UPDATE messages SET extracted=2 WHERE id IN (${batch.ids.map(() => '?').join(',')})`).run(...batch.ids);
      log(`[memory-extract] ${batch.convKey} 失败 ${att} 次，放弃这批（标记跳过，不阻塞后续）`);
    } else {
      log(`[memory-extract] ${batch.convKey} 提取失败（第 ${att} 次）：${(error?.message ?? error)}`);
    }
    noteStats(db, { batches: 1, messages: batch.rows.length, errors: 1 });
    return { error: String((error?.message ?? error)).slice(0, 200), attempts: att };
  }
}

/** 常驻 worker：按消息量或空闲时长触发；失败按指数退避 */
export function startMemoryExtractionWorker({ db, callModel, config = {}, log = () => {} }) {
  const cfg = { ...DEFAULTS, ...config };
  let running = false;
  let backoffMs = 0;
  let timer = null;

  const shouldRun = () => {
    const pend = pendingStats(db);
    if (!pend.pending) return false;
    if (pend.pending >= cfg.minBatchSize) return true;
    const ageMs = Date.now() - Number(pend.oldest || Date.now());
    return ageMs >= cfg.maxWaitMinutes * 60 * 1000;
  };

  const tick = async () => {
    if (running) return;
    try {
      if (Date.now() < backoffMs) return;
      if (!shouldRun()) return;
      running = true;
      const r = await runExtractionCycle({ db, callModel, config: cfg, log });
      running = false;
      if (r && r.error) {
        backoffMs = Date.now() + Math.min(30 * 60 * 1000, 2 ** Math.min(5, (r.attempts || 1)) * 15000);
      }
    } catch (error) {
      running = false;
      backoffMs = Date.now() + 5 * 60 * 1000;
      log(`[memory-extract] worker 异常：${error?.message ?? error}`);
    }
  };

  timer = setInterval(tick, cfg.intervalMs);
  timer.unref?.();
  setTimeout(tick, 5000).unref?.();
  return { stop: () => clearInterval(timer), tick, shouldRun };
}
