'use strict';

const path = require('node:path');
const { createController } = require('./control');
const { createAutostart, realBackend } = require('./autostart');
const { createStartupStatus } = require('./startup-status');
const { listProcessDetails, verifyProcess } = require('./proc');
const { assessBusy } = require('./busy-guard');
const { createRecoveryEngine } = require('./recovery-engine');
const { getIntent } = require('./stop-intent');
const { createUpdateManager } = require('./updates');
const { createInstallManager } = require('./install-task');
const { tcpProbe } = require('./health');
const { createIpcRouter } = require('./ipc/router');
const { createServiceSupervisor } = require('./domain/services/supervisor');


function registerIpc({ ipcMain, paths, getSettings, setSettings, allowAutostart = false, embed = null, log }) {
  const router = createIpcRouter({ ipcMain, log });
  let cached = { at: 0, value: null };
  const controlStateDir = path.join(paths.configDir, '..', 'state');
  const controller = createController({ stateDir: controlStateDir, getSettings, log });
  const supervisor = createServiceSupervisor({ controller });
  controller.reconcile().catch((error) => log('control', `reconcile failed: ${error.message}`));
  const installManager = createInstallManager({ paths, getSettings, log, component: 'bridge' });
  const updateManager = createUpdateManager({ currentVersion: require('../../package.json').version, paths, log });
  const autostart = createAutostart({
    stateFile: path.join(controlStateDir, 'autostart.json'),
    exePath: process.execPath,
    log
  });

  const startupStatus = createStartupStatus({
    queryTask: (name) => realBackend.query(name),
    startupDir: path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'),
    managerExe: process.execPath
  });
  let startupCache = { at: 0, value: null };
  const getStartupStatus = async (force = false) => {
    if (!force && startupCache.value && Date.now() - startupCache.at < 20000) return startupCache.value;
    const value = await startupStatus();
    startupCache = { at: Date.now(), value };
    return value;
  };
  const recoveryEngine = createRecoveryEngine({
    stateDir: controlStateDir,
    getSettings,
    getRecords: () => controller.records(),
    getIntent: (id) => getIntent(controlStateDir, id),
    probe: async (id, record) => {
      const details = await listProcessDetails();
      const check = verifyProcess(record, details);
      const def = controller.buildDefinitions()[id];
      let portOpen;
      if (def && def.ports && def.ports.length) {
        portOpen = false;
        for (const port of def.ports) {
          if (await tcpProbe(port, '127.0.0.1', 700)) { portOpen = true; break; }
        }
      }
      return { identityOk: check.ok, processAlive: Boolean(check.found), portOpen };
    },
    assessBusyFn: async () => assessBusy(getSettings().repoRoot),
    startService: (id) => controller.start(id),
    stopService: (id, options) => controller.stop(id, options),
    log
  });

  const recoveryTimer = setInterval(() => {
    const settings = getSettings();
    if (!settings.autoRecovery || !settings.controlEnabled || settings.safeMode) return;
    recoveryEngine.runOnce().catch((error) => log('recovery', `runOnce failed: ${error.message}`));
  }, 30000);
  if (recoveryTimer.unref) recoveryTimer.unref();

  const { registerSystemHandlers } = require('./ipc/handlers/system');
  const { registerUpdateHandlers } = require('./ipc/handlers/updates');
  const { registerBilibiliHandlers } = require('./ipc/handlers/bilibili');
  const { registerInstallHandlers } = require('./ipc/handlers/install');
  const { registerEmbedHandlers } = require('./ipc/handlers/embed');
  const { registerClipboardHandlers } = require('./ipc/handlers/clipboard');
  const { registerControlHandlers } = require('./ipc/handlers/control');
  const { registerMemoryHandlers } = require('./ipc/handlers/memory');
  const { registerSettingsHandlers } = require('./ipc/handlers/settings');
  const { registerBackupHandlers } = require('./ipc/handlers/backups');
  const { registerStartupHandlers } = require('./ipc/handlers/startup');
  registerSystemHandlers(router, { paths, getSettings, cache: cached });
  registerUpdateHandlers(router, { updateManager });
  registerBilibiliHandlers(router, { paths, getSettings });
  registerInstallHandlers(router, { installManager, log });
  registerEmbedHandlers(router, { embed, log });
  registerClipboardHandlers(router);
  registerControlHandlers(router, { paths, getSettings, setSettings, controller: supervisor, log });
  registerMemoryHandlers(router, { paths, getSettings, log });
  registerSettingsHandlers(router, { paths, getSettings, setSettings, resetCache: () => { cached.at = 0; cached.value = null; }, log });
  registerBackupHandlers(router, { paths, getSettings, log });
  registerStartupHandlers(router, { getSettings, allowAutostart, controlStateDir, getStartupStatus, resetStartupCache: () => { startupCache = { at: 0, value: null }; }, autostart, recoveryEngine });

  return { stopOwnedServices: () => supervisor.stopOwnedServices() };
}

module.exports = { registerIpc };
