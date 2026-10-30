/**
 * 中文相对时间 → 事件检索日期范围。
 *
 * 固定按 Asia/Shanghai（UTC+8，无夏令时）计算自然日边界，返回毫秒时间戳。
 * 只做查询解析，不写库、不依赖系统时区。
 */
const TZ_OFFSET = 8 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

function parts(ms) {
  const d = new Date(Number(ms) + TZ_OFFSET);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), w: d.getUTCDay() };
}

function startOfDay(y, m, d) {
  return Date.UTC(y, m, d) - TZ_OFFSET;
}

function endOfDay(y, m, d) {
  return startOfDay(y, m, d) + DAY - 1;
}

function shiftDay(y, m, d, delta) {
  const t = new Date(Date.UTC(y, m, d + delta));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() };
}

function make(kind, from, to, label) {
  return { kind, from: Number(from), to: Number(to), label };
}

const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function numOf(raw) {
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === '十') return 10;
  if (raw.startsWith('十')) return 10 + (CN_NUM[raw[1]] || 0);
  if (raw.endsWith('十')) return (CN_NUM[raw[0]] || 0) * 10;
  if (raw.includes('十')) {
    const [a, b] = raw.split('十');
    return (CN_NUM[a] || 0) * 10 + (CN_NUM[b] || 0);
  }
  return CN_NUM[raw] || 0;
}

/**
 * @param {string} text 用户问题
 * @param {number} now 当前毫秒时间戳
 * @returns {{kind:string,from:number,to:number,label:string}|null}
 */
export function parseTimeRange(text, now = Date.now()) {
  const s = String(text || '').replace(/\s+/g, '');
  if (!s) return null;
  const p = parts(now);
  const todayStart = startOfDay(p.y, p.m, p.d);
  const todayEnd = endOfDay(p.y, p.m, p.d);

  // 具体日期：2026-10-23 / 2026年10月23日 / 10月23日 / 10/23
  let m = s.match(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})[日号]?/);
  if (m) {
    const y = Number(m[1]); const mo = Number(m[2]) - 1; const d = Number(m[3]);
    return make('date', startOfDay(y, mo, d), endOfDay(y, mo, d), `${y}-${mo + 1}-${d}`);
  }
  // 同月范围：10月23日到25日（必须先于单日匹配）
  m = s.match(/(\d{1,2})月(\d{1,2})[日号]?(?:到|至|-|~)(\d{1,2})[日号]?/);
  if (m) {
    const mo = Number(m[1]) - 1; const d1 = Number(m[2]); const d2 = Number(m[3]);
    return make('range', startOfDay(p.y, mo, d1), endOfDay(p.y, mo, d2), `${p.y}-${mo + 1}-${d1}~${d2}`);
  }
  m = s.match(/(\d{1,2})月(\d{1,2})[日号]?/);
  if (m) {
    const mo = Number(m[1]) - 1; const d = Number(m[2]);
    return make('date', startOfDay(p.y, mo, d), endOfDay(p.y, mo, d), `${p.y}-${mo + 1}-${d}`);
  }
  m = s.match(/(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/);
  if (m) {
    const mo = Number(m[1]) - 1; const d = Number(m[2]);
    return make('date', startOfDay(p.y, mo, d), endOfDay(p.y, mo, d), `${p.y}-${mo + 1}-${d}`);
  }

  // 同月范围：10月23日到25日
  m = s.match(/(\d{1,2})月(\d{1,2})[日号]?(?:到|至|-|~)(\d{1,2})[日号]?/);
  if (m) {
    const mo = Number(m[1]) - 1; const d1 = Number(m[2]); const d2 = Number(m[3]);
    return make('range', startOfDay(p.y, mo, d1), endOfDay(p.y, mo, d2), `${p.y}-${mo + 1}-${d1}~${d2}`);
  }

  if (/大前天/.test(s)) {
    const x = shiftDay(p.y, p.m, p.d, -3);
    return make('day', startOfDay(x.y, x.m, x.d), endOfDay(x.y, x.m, x.d), '大前天');
  }
  if (/前天/.test(s)) {
    const x = shiftDay(p.y, p.m, p.d, -2);
    return make('day', startOfDay(x.y, x.m, x.d), endOfDay(x.y, x.m, x.d), '前天');
  }
  if (/昨天|昨日/.test(s)) {
    const x = shiftDay(p.y, p.m, p.d, -1);
    return make('day', startOfDay(x.y, x.m, x.d), endOfDay(x.y, x.m, x.d), '昨天');
  }
  if (/今天|今日/.test(s)) {
    return make('day', todayStart, todayEnd, '今天');
  }

  // 上周 / 本周（ISO：周一为一周开始）
  if (/上周|上个星期|上星期/.test(s)) {
    const mondayOffset = (p.w + 6) % 7; // 周一=0
    const thisMonday = startOfDay(...Object.values(shiftDay(p.y, p.m, p.d, -mondayOffset)));
    const lastMonday = thisMonday - 7 * DAY;
    return make('week', lastMonday, lastMonday + 7 * DAY - 1, '上周');
  }
  if (/本周|这周|这个星期/.test(s)) {
    const mondayOffset = (p.w + 6) % 7;
    const thisMonday = startOfDay(...Object.values(shiftDay(p.y, p.m, p.d, -mondayOffset)));
    return make('week', thisMonday, todayEnd, '本周');
  }

  // 上个月
  if (/上个月|上月/.test(s)) {
    const firstThis = startOfDay(p.y, p.m, 1);
    const lastMonth = new Date(Date.UTC(p.y, p.m - 1, 1));
    return make('month', startOfDay(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth(), 1), firstThis - 1, '上个月');
  }

  // N 天前 / 一周前
  m = s.match(/([一二两三四五六七八九十\d]+)天前/);
  if (m) {
    const n = numOf(m[1]);
    if (n > 0) {
      const x = shiftDay(p.y, p.m, p.d, -n);
      return make('day', startOfDay(x.y, x.m, x.d), endOfDay(x.y, x.m, x.d), `${n}天前`);
    }
  }
  if (/一周前|一个星期前/.test(s)) {
    const x = shiftDay(p.y, p.m, p.d, -7);
    return make('day', startOfDay(x.y, x.m, x.d), endOfDay(x.y, x.m, x.d), '一周前');
  }

  // 模糊时间：区分“前几天”（不含今天）与“最近几天”（含今天）。
  if (/前几天|前些天/.test(s)) {
    const cfg = globalThis.__MEMORY_CONF__ || {};
    const days = Math.max(2, Math.min(14, Number(cfg.timeFuzzyDays) || 7));
    return make('fuzzy-before-today', todayStart - days * DAY, todayStart - 1, '前几天');
  }
  if (/最近几天|这几日|这几天/.test(s)) {
    const cfg = globalThis.__MEMORY_CONF__ || {};
    const days = Math.max(2, Math.min(14, Number(cfg.timeFuzzyDays) || 7));
    return make('fuzzy-recent', todayStart - (days - 1) * DAY, todayEnd, '最近几天');
  }
  if (/最近一周|近一周|过去一周|最近7天/.test(s)) {
    return make('range', todayStart - 6 * DAY, todayEnd, '最近一周');
  }
  return null;
}

/** 判断事件发生时间是否落在范围内（含边界）。 */
export function inTimeRange(ms, range) {
  if (!range) return true;
  const t = Number(ms);
  return Number.isFinite(t) && t >= range.from && t <= range.to;
}
