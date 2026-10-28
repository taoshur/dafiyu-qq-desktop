'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * 只读的启动状态汇总：
 * - 原 qq-bridge / watchdog 计划任务是否启用；
 * - SnowLuma 启动文件夹项是否存在；
 * - 管理器登录自启任务是否已注册且命令匹配。
 * 不修改任何任务或启动项。
 */
function createStartupStatus({ queryTask, startupDir, managerExe, now = () => Date.now() }) {
  const isEnabled = (task) => Boolean(task) && !/disabled|禁用/i.test(String(task.state || task.status || ''));

  return async function status() {
    const errors = [];
    const query = async (name) => {
      try { return await queryTask(name); } catch (error) { errors.push(`${name}: ${error.message}`); return null; }
    };

    const [qqBridge, watchdog, manager] = [
      await query('qq-bridge'),
      await query('qq-bridge-watchdog'),
      await query('DafiyuManager')
    ];

    const snowlumaFile = path.join(startupDir, 'snowluma-start.vbs');
    let snowlumaExists = false;
    try { snowlumaExists = fs.existsSync(snowlumaFile); } catch { /* ignore */ }

    const managerCommand = manager ? String(manager.command || '').toLowerCase() : '';
    const managerMatches = Boolean(manager)
      && managerCommand.includes(String(managerExe).toLowerCase())
      && managerCommand.includes('--hidden');

    return {
      qqBridge: { task: 'qq-bridge', exists: Boolean(qqBridge), enabled: isEnabled(qqBridge), state: qqBridge?.state || null },
      watchdog: { task: 'qq-bridge-watchdog', exists: Boolean(watchdog), enabled: isEnabled(watchdog), state: watchdog?.state || null },
      snowlumaStartup: { path: snowlumaFile, exists: snowlumaExists },
      managerAutostart: { task: 'DafiyuManager', exists: Boolean(manager), enabled: isEnabled(manager), matches: managerMatches, state: manager?.state || null },
      originalAutostartDisabled: !isEnabled(qqBridge) && !snowlumaExists,
      managerAutostartReady: Boolean(manager) && isEnabled(manager) && managerMatches,
      errors,
      checkedAt: now()
    };
  };
}

module.exports = { createStartupStatus };
