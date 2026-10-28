'use strict';

const fs = require('node:fs');

/**
 * 只读的 watchdog 健康监控：
 * - 只报告原 qq-bridge-watchdog 的存在/启用/最近运行/哨兵状态；
 * - 不修改任务、不抢占恢复权，只用于告警与人工恢复提示。
 */
function createWatchdogMonitor({ queryTask, stateDir, repoRoot, now = () => Date.now() } = {}) {
  return async function status() {
    let task = null;
    let error = null;
    try {
      task = await queryTask('qq-bridge-watchdog');
    } catch (err) {
      error = err.message;
    }

    const sentinel = `${repoRoot}/state/watchdog.disabled`.replace(/\//g, '\\');
    let sentinelExists = false;
    try { sentinelExists = fs.existsSync(sentinel); } catch { /* ignore */ }

    let lastRunAgeMs = null;
    if (task && task.lastRun) {
      const at = Date.parse(task.lastRun);
      if (Number.isFinite(at)) lastRunAgeMs = Math.max(0, now() - at);
    }
    if (lastRunAgeMs === null) {
      try {
        const stat = fs.statSync(`${stateDir}/watchdog.log`.replace(/\//g, '\\'));
        lastRunAgeMs = Math.max(0, now() - stat.mtimeMs);
      } catch { /* 日志不存在 */ }
    }

    const enabled = task ? !/disabled|禁用/i.test(String(task.state || task.status || '')) : false;
    let verdict = 'ok';
    let hint = '';
    if (error) {
      verdict = 'unknown';
      hint = `无法查询 watchdog 任务：${error}`;
    } else if (!task) {
      verdict = 'missing';
      hint = '原 watchdog 任务不存在：bridge 崩溃后没有自动恢复主体，请手动启动或恢复任务';
    } else if (!enabled) {
      verdict = 'disabled';
      hint = '原 watchdog 任务被禁用：bridge 崩溃后没有自动恢复主体';
    } else if (sentinelExists) {
      verdict = 'sentinel';
      hint = 'watchdog 哨兵存在：bridge 停止期间不会被自动拉起（这是用户停止或管理器停止的预期状态）';
    } else if (lastRunAgeMs !== null && lastRunAgeMs > 15 * 60_000) {
      verdict = 'silent';
      hint = `watchdog 最近一次运行是 ${Math.round(lastRunAgeMs / 60000)} 分钟前，可能未在运行`;
    }

    return {
      task: task ? { name: 'qq-bridge-watchdog', exists: true, enabled, state: task.state || task.status || 'unknown' } : { name: 'qq-bridge-watchdog', exists: false },
      sentinel: { path: sentinel, exists: sentinelExists },
      lastRunAgeMs,
      verdict,
      hint,
      checkedAt: now()
    };
  };
}

module.exports = { createWatchdogMonitor };
