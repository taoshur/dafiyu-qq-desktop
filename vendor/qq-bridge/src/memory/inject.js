/**
 * Memory V3 阶段 3 桥接侧：按需检索注入 + 注入量记录
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { retrieveMemoryForPrompt, buildQueryFromState } from './retrieve.js';
import { getMemoryDb as getDbInternal, memoryRuntimeStats } from './hook.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const INJECT_LOG = path.join(ROOT, 'state', 'memory-inject.jsonl');

export function memoryInjection({ convKey, st, fallback }) {
  const cfg = (globalThis.__MEMORY_CONF__ || {});
  if (cfg.retrieval !== true) {
    return { text: fallback, mode: 'json', tokens: 0, hits: 0 };
  }
  try {
    const db = getDbInternal();
    const q = buildQueryFromState(st);
    const r = retrieveMemoryForPrompt(db, {
      convKey: String(convKey),
      speakerQqs: q.speakerQqs,
      text: q.text,
      budgetTokens: Number(cfg.injectBudgetTokens) || 600,
      selfQq: cfg.selfQq || null
    });
    if (!r.text) return { text: fallback, mode: 'retrieval-empty', tokens: 0, hits: 0 };
    // 保留话题/想法，只把"全量人物档案"换成检索结果
    const base = String(fallback || '');
    const idx = base.indexOf('【对群友的印象】');
    const kept = idx >= 0 ? base.slice(0, idx).trim() : '';
    const text = [kept, r.text].filter(Boolean).join('\n');
    try { logInjection(convKey, r); } catch {}
    return { text, mode: 'retrieval', tokens: r.tokens, hits: r.hits };
  } catch (error) {
    try { console.error('[memory] 检索失败，回退旧格式：', error?.message ?? error); } catch {}
    return { text: fallback, mode: 'fallback', tokens: 0, hits: 0 };
  }
}

let lastLogAt = 0;
function logInjection(convKey, r) {
  const now = Date.now();
  if (now - lastLogAt < 300) return; // 简单限流，避免高频写盘
  lastLogAt = now;
  const d = r.diagnostics || {};
  const line = JSON.stringify({
    at: now, key: convKey, tokens: r.tokens, hits: r.hits, facts: r.facts, events: r.events,
    candidates: d.candidateCount ?? null, selected: Array.isArray(d.selectedIds) ? d.selectedIds.slice(0, 12) : null,
    range: d.filters?.timeRange || null
  }) + '\n';
  try {
    if (fs.existsSync(INJECT_LOG) && fs.statSync(INJECT_LOG).size > 2 * 1024 * 1024) {
      fs.writeFileSync(INJECT_LOG, '');
    }
    fs.appendFileSync(INJECT_LOG, line);
  } catch {}
}

export { memoryRuntimeStats };
