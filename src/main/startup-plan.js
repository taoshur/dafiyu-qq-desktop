'use strict';

const { decideRecovery } = require('./recovery-policy');

const BOT_SERVICES = ['snowluma', 'bridge'];

/**
 * 启动计划（纯函数）：
 * - managerAutostart 只决定“登录时是否启动管理器”，不隐含启动机器人；
 * - botAutostart 只决定“管理器启动后是否拉起机器人”，与是否开机自启无关；
 * - 用户主动停止（stop-intent）优先，任何自动启动/恢复都必须跳过。
 */
function planStartup({ settings = {}, intents = {}, running = {} } = {}) {
  const manager = settings.managerAutostart === true;
  const skipped = [];
  const services = [];
  if (settings.botAutostart === true) {
    for (const id of BOT_SERVICES) {
      if (intents[id]) { skipped.push({ id, reason: 'stopped-by-user' }); continue; }
      if (running[id]) { skipped.push({ id, reason: 'already-running' }); continue; }
      services.push(id);
    }
  } else {
    for (const id of BOT_SERVICES) skipped.push({ id, reason: 'bot-autostart-off' });
  }
  return { manager, services, skipped };
}

/**
 * 恢复计划：只对“管理器启动的服务”且“管理器正在运行”时有效；
 * autoRecovery 关闭或用户主动停止时不恢复。
 */
function planRecovery({ settings = {}, intents = {}, service, attempts = [], consecutiveFailures = 0, now = Date.now() } = {}) {
  return decideRecovery({
    enabled: settings.autoRecovery === true,
    stopIntent: intents[service] || null,
    attempts,
    consecutiveFailures,
    now
  });
}

/** UI/文档用：管理器退出后的恢复边界，避免把“服务继续运行”说成“全部受守护”。 */
function recoveryBoundary(settings = {}) {
  return {
    managerRunning: true,
    managerAutostart: settings.managerAutostart === true,
    botAutostart: settings.botAutostart === true,
    autoRecovery: settings.autoRecovery === true,
    afterManagerExit: {
      servicesKeepRunning: true,
      autoRecoveryContinues: false,
      bridgeFallback: '原计划任务 qq-bridge-watchdog（仅在无 state\\watchdog.disabled 哨兵时）',
      snowluma: '无自动恢复',
      dsh: '无自动恢复'
    }
  };
}

module.exports = { planStartup, planRecovery, recoveryBoundary, BOT_SERVICES };
