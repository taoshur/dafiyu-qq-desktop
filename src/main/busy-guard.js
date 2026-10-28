'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SIGNALS = [
  { name: 'bridge.log', rel: 'state/bridge.log' },
  { name: 'qq-activity.log', rel: 'state/qq-activity.log' },
  { name: 'tool-calls.jsonl', rel: 'state/tool-calls.jsonl' },
  { name: 'memory.db-wal', rel: 'state/memory.db-wal' }
];

const BUSY_WINDOW_MS = 10_000;
const IDLE_WINDOW_MS = 30_000;
const CLOCK_SKEW_MS = 5 * 60_000;

/**
 * 停前忙碌判定：
 * - busy：任一信号在 10 秒内写入；
 * - idle：所有信号都存在，且都至少 30 秒没写入；
 * - unknown：信号缺失、时间戳异常，或处于 10–30 秒的灰区。
 * unknown 也必须默认阻止停止，由人工确认。
 */
function assessBusy(repoRoot, { now = Date.now(), busyWindowMs = BUSY_WINDOW_MS, idleWindowMs = IDLE_WINDOW_MS } = {}) {
  const signals = {};
  const reasons = [];
  let missing = 0;
  let future = 0;
  let newestAge = null;
  let allOld = true;

  for (const signal of SIGNALS) {
    const file = path.join(repoRoot, signal.rel);
    let stat = null;
    try { stat = fs.statSync(file); } catch { stat = null; }
    if (!stat) {
      missing += 1;
      signals[signal.name] = { exists: false };
      continue;
    }
    const age = now - stat.mtimeMs;
    signals[signal.name] = { exists: true, ageMs: age, mtimeMs: stat.mtimeMs };
    if (age < -CLOCK_SKEW_MS) future += 1;
    if (newestAge === null || age < newestAge) newestAge = age;
    if (age <= busyWindowMs) reasons.push(`${signal.name} ${Math.max(0, Math.round(age / 1000))}s 内有写入`);
    if (age < idleWindowMs) allOld = false;
  }

  if (missing > 0) {
    return { state: 'unknown', reasons: [`${missing} 个活动信号文件不存在，无法确认是否空闲`], signals, checkedAt: now };
  }
  if (future > 0) {
    return { state: 'unknown', reasons: ['检测到未来时间戳，系统时间或文件时间异常'], signals, checkedAt: now };
  }
  if (reasons.length) {
    return { state: 'busy', reasons, signals, checkedAt: now };
  }
  if (allOld && newestAge !== null && newestAge >= idleWindowMs) {
    return { state: 'idle', reasons: [`所有信号至少 ${Math.round(idleWindowMs / 1000)} 秒无写入`], signals, checkedAt: now };
  }
  return {
    state: 'unknown',
    reasons: [`最近活动在 ${Math.round(busyWindowMs / 1000)}–${Math.round(idleWindowMs / 1000)} 秒灰区，无法确认是否空闲`],
    signals,
    checkedAt: now
  };
}

module.exports = { assessBusy, SIGNALS, BUSY_WINDOW_MS, IDLE_WINDOW_MS };
