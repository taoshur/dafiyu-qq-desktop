/**
 * Memory V3 阶段 3：按需检索 + Token 预算
 *
 * 目标：不再把所有人的人物档案全量塞进 prompt，而是按
 *   当前群号 / 发言者 QQ / 别名 / 话题关键词
 * 召回 top-k，并在固定 token 预算内截断。
 */
import { searchMemory } from './db.js';
import { parseTimeRange } from './time-range.js';
import { recallMemoryV4, recordRecallDiagnostics } from './recall-v4.js';
import { sweepLifecycle, touchRecalled, lifecycleConfig } from './lifecycle.js';

export const DEFAULT_BUDGET = 600; // tokens

export function estimateTokens(text) {
  const s = String(text || '');
  if (!s) return 0;
  // 中文约 1 token / 1.5 字，英文按 4 字符 1 token，取折中
  const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  const rest = s.length - cjk;
  return Math.ceil(cjk / 1.5 + rest / 4);
}

function fmtFact(row) {
  let who = row.subject_name || '';
  if (!who || /^\d{5,12}$/.test(who) || who === '私聊' || who === '私聊对方') {
    const qq = row.subject_qq != null ? String(row.subject_qq) : (/^\d{5,12}$/.test(who) ? who : '');
    who = qq ? `QQ***${qq.slice(-4)}` : '某人';
  }
  const val = String(row.value || '').slice(0, 60);
  // 标注置信度和来源，避免把旧库里的主观印象当成确定事实
  const conf = Number(row.confidence);
  const src = row.source_type === 'legacy:impressions' ? '旧印象'
    : row.source_type === 'legacy:persons' ? '旧档案'
      : (row.source_type || '记录');
  const meta = `${Number.isFinite(conf) ? conf.toFixed(1) : '?'}·${src}`;
  return `- ${who}：${row.attr}=${val}（${meta}）`;
}

function fmtEvent(row) {
  const summary = String(row.summary || '').slice(0, 70);
  const detail = String(row.detail || '').replace(/\s+/g, ' ').slice(0, 50);
  const evidence = detail && !summary.includes(detail.slice(0, 10)) ? `（${detail}）` : '';
  if (row.happened_at == null || row.time_precision === 'unknown') {
    return `- [日期不确定] ${summary}${evidence}`;
  }
  const d = new Date(Number(row.happened_at));
  const day = `${d.getMonth() + 1}-${d.getDate()}`;
  const prefix = row.time_precision === 'approx' ? `~${day}` : day;
  return `- ${prefix} ${summary}${evidence}`;
}

/**
 * @returns {{text:string, tokens:number, hits:number, facts:number, events:number}}
 */
export function retrieveMemoryForPrompt(db, {
  convKey = 'global',
  speakerQqs = [],
  text = '',
  latestText = '',
  budgetTokens = DEFAULT_BUDGET,
  limit = 10,
  now = Date.now(),
  selfQq = null
} = {}) {
  // Current message wins over older quoted/context messages when both contain
  // relative dates such as “昨天” and “今天”.
  const timeRange = parseTimeRange(latestText, now) || parseTimeRange(text, now);
  const cfg = globalThis.__MEMORY_CONF__ || {};
  const useV4 = cfg.recallV4 !== false;
  let picked = [];
  let recallDiagnostics = null;
  try {
    try { sweepLifecycle(db, { now, config: cfg }); } catch { /* lifecycle must not break retrieval */ }
    if (useV4) {
      const v4 = recallMemoryV4(db, {
        convKey, speakerQqs, text, limit: limit * 3, now, timeRange, selfQq, config: cfg, budgetTokens
      });
      picked = v4.picked.slice(0, limit * 3);
      recallDiagnostics = v4.diagnostics;
    } else {
      const rows = searchMemory(db, { convKey, qqs: speakerQqs, text, limit: limit * 3, now, timeRange, selfQq });
      const allFacts = rows.filter((r) => r.type === 'fact');
      const allEvents = rows.filter((r) => r.type === 'event');
      // 事件保留至少一半配额（有时段查询时优先事件），避免被人物事实完全挤掉。
      const eventSlots = allEvents.length ? Math.max(timeRange ? 3 : 2, Math.floor(limit / 2)) : 0;
      if (timeRange) {
        picked.push(...allEvents.slice(0, eventSlots));
        picked.push(...allFacts.slice(0, limit - picked.length));
        if (picked.length < limit) picked.push(...allEvents.slice(eventSlots, eventSlots + (limit - picked.length)));
      } else {
        picked.push(...allFacts.slice(0, Math.max(1, limit - eventSlots)));
        picked.push(...allEvents.slice(0, limit - picked.length));
        if (picked.length < limit) picked.push(...allFacts.slice(Math.max(1, limit - eventSlots), Math.max(1, limit - eventSlots) + (limit - picked.length)));
      }
    }
  } catch {
    return { text: '', tokens: 0, hits: 0, facts: 0, events: 0, range: timeRange };
  }

  const lines = [];
  const used = [];
  let tokens = 0;
  let facts = 0;
  let events = 0;
  const perSubject = new Map();
  const seenValues = new Set();
  for (const r of picked) {
    if (lines.length >= limit) break;
    if (r.type === 'fact') {
      const subj = String(r.row.subject_qq || r.row.subject_name || '');
      const usedBySubject = perSubject.get(subj) || 0;
      if (usedBySubject >= 3) continue;
      const norm = String(r.row.value || '').replace(/\s+/g, '');
      if (seenValues.has(norm)) continue;
      const line = fmtFact(r.row);
      const t = estimateTokens(line + '\n');
      if (tokens + t > budgetTokens) continue;
      lines.push(line);
      used.push(r);
      tokens += t;
      facts += 1;
      perSubject.set(subj, usedBySubject + 1);
      seenValues.add(norm);
    } else {
      const line = fmtEvent(r.row);
      const t = estimateTokens(line + '\n');
      if (tokens + t > budgetTokens) continue;
      lines.push(line);
      used.push(r);
      tokens += t;
      events += 1;
    }
  }
  if (used.length) {
    try { touchRecalled(db, used, { now, config: cfg }); } catch { /* recall bookkeeping is best effort */ }
  }

  if (recallDiagnostics) {
    recallDiagnostics.tokens = tokens;
    recallDiagnostics.selectedIds = used.map((item) => `${item.type}:${item.row.id}`);
    if (recallDiagnostics.filters) recallDiagnostics.filters.stage = lines.length ? 'injected' : 'retrieval-empty';
    // Even an empty recall is useful evidence: it explains why the answer did
    // not know something. Persist it before the empty return.
    try { recordRecallDiagnostics(db, recallDiagnostics); } catch { /* diagnostics must not break retrieval */ }
  }
  if (!lines.length) return { text: '', tokens: 0, hits: 0, facts: 0, events: 0, range: timeRange, diagnostics: recallDiagnostics };
  return {
    text: '【相关记忆】\n' + lines.join('\n'),
    tokens,
    hits: lines.length,
    facts,
    events,
    range: timeRange,
    diagnostics: recallDiagnostics
  };
}

/** 从会话状态里取"当前话题相关的检索信号"：最近发言者 + 最近几条非 bot 文本 */
export function buildQueryFromState(st, { limitSpeakers = 4, textLimit = 260 } = {}) {
  const recent = Array.isArray(st?.recentMessages) ? st.recentMessages.slice(-12) : [];
  const qqs = [];
  const texts = [];
  for (const m of recent) {
    if (m?.isSelf) continue;
    const qq = m?.userId != null ? String(m.userId) : (m?.senderQq != null ? String(m.senderQq) : '');
    if (/^\d{5,12}$/.test(qq) && !qqs.includes(qq)) qqs.push(qq);
    const text = m?.text || m?.plain;
    if (text) texts.push(String(text));
  }
  const latestText = texts.length ? texts[texts.length - 1] : '';
  const recentText = texts.slice(-3).join(' ');
  const topicText = Array.isArray(st?.activeTopics)
    ? st.activeTopics.slice(-3).map((t) => t?.text || '').join(' ')
    : '';
  return {
    speakerQqs: qqs.slice(0, limitSpeakers),
    latestText,
    text: `${recentText} ${topicText}`.slice(0, textLimit)
  };
}
