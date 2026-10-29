'use strict';

const { createWatchdogMonitor } = require('../../watchdog-health');
const { realBackend } = require('../../autostart');
const { recoveryBoundary } = require('../../startup-plan');
const { readAll: readIntents } = require('../../stop-intent');
const { ownershipPlan } = require('../../recovery-ownership');

function registerStartupHandlers(router, {
  getSettings, allowAutostart, controlStateDir, getStartupStatus, resetStartupCache,
  autostart, recoveryEngine
}) {
  router.handle('startup:status', async () => getStartupStatus());

  router.handle('watchdog:status', async () => {
    const settings = getSettings();
    const monitor = createWatchdogMonitor({
      queryTask: (name) => realBackend.query(name),
      stateDir: controlStateDir,
      repoRoot: settings.repoRoot
    });
    return monitor();
  });

  router.handle('autostart:status', async () => autostart.status());

  router.handle('autostart:register', async (_event, payload) => {
    if (payload?.confirm !== true) return { ok: false, reason: '注册系统任务需要确认' };
    if (!allowAutostart) return { ok: false, reason: '开发模式（未打包）不注册系统任务' };
    if (getSettings().safeMode) return { ok: false, reason: '安全模式下禁止注册系统任务' };
    const result = await autostart.ensure();
    resetStartupCache();
    return result;
  });

  router.handle('autostart:unregister', async (_event, payload) => {
    if (payload?.confirm !== true) return { ok: false, reason: '注销系统任务需要确认' };
    if (!allowAutostart) return { ok: false, reason: '开发模式（未打包）不修改系统任务' };
    if (getSettings().safeMode) return { ok: false, reason: '安全模式下禁止修改系统任务' };
    const result = await autostart.remove();
    resetStartupCache();
    return result;
  });

  router.handle('startup:info', async () => ({
    canRegister: Boolean(allowAutostart),
    settings: {
      managerAutostart: Boolean(getSettings().managerAutostart),
      botAutostart: Boolean(getSettings().botAutostart),
      autoRecovery: Boolean(getSettings().autoRecovery)
    },
    boundary: recoveryBoundary(getSettings()),
    intents: (readIntents(controlStateDir).services) || {},
    autostart: await autostart.status(),
    recovery: {
      state: recoveryEngine.state(),
      history: recoveryEngine.history(8),
      ownership: ownershipPlan(),
      states: await recoveryEngine.classifyAll()
    }
  }));

  router.handle('recovery:status', async () => ({
    state: recoveryEngine.state(),
    history: recoveryEngine.history(20),
    ownership: ownershipPlan(),
    states: await recoveryEngine.classifyAll()
  }));
}

module.exports = { registerStartupHandlers };
