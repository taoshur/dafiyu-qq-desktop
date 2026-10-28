'use strict';

const DEFAULTS = {
  enabled: false,
  maxPerHour: 3,
  maxConsecutiveFailures: 5,
  backoffMs: [5000, 30000, 120000]
};

/**
 * 自动恢复决策（纯函数，便于隔离测试）：
 * - 关闭恢复 / 用户主动停止 → 不恢复；
 * - 一小时内次数超限 → 熔断；
 * - 连续失败超限 → 熔断；
 * - 否则按退避序列给出下一次延迟。
 */
function decideRecovery({ enabled = false, stopIntent = null, attempts = [], consecutiveFailures = 0, now = Date.now(), policy = {} } = {}) {
  const cfg = { ...DEFAULTS, ...policy };
  if (!enabled) return { action: 'none', reason: 'auto-recovery disabled', circuit: false };
  if (stopIntent) return { action: 'none', reason: 'stopped by user', circuit: false };

  const recent = attempts.filter((at) => Number.isFinite(at) && at > now - 3600_000);
  if (recent.length >= cfg.maxPerHour) {
    return { action: 'none', reason: `rate limited: ${recent.length}/${cfg.maxPerHour} in the last hour`, circuit: true };
  }
  if (consecutiveFailures >= cfg.maxConsecutiveFailures) {
    return { action: 'none', reason: `circuit open after ${consecutiveFailures} consecutive failures`, circuit: true };
  }

  const delayMs = cfg.backoffMs[Math.min(consecutiveFailures, cfg.backoffMs.length - 1)];
  return { action: 'restart', delayMs, reason: `restart #${consecutiveFailures + 1} after ${delayMs}ms`, circuit: false };
}

module.exports = { decideRecovery, DEFAULTS };
