'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { tcpProbe } = require('../../health');
const { definitions, simulateAction } = require('../../services');
const { saveSettings, loadSettings } = require('../../paths');

const SERVICE_IDS = new Set(['snowluma', 'dsh', 'bridge']);
const ACTIONS = new Set(['start', 'stop', 'restart']);

function registerControlHandlers(router, { paths, getSettings, setSettings, controller, log }) {
  router.handle('services:action', async (_event, payload) => {
    const id = String(payload?.id || '');
    const action = String(payload?.action || '');
    if (!SERVICE_IDS.has(id)) throw new Error('未知服务');
    if (!ACTIONS.has(action)) throw new Error('未知操作');
    const result = simulateAction(definitions(getSettings()), id, action);
    log('action', `${id}:${action} -> simulated`);
    return result;
  });

  router.handle('setup:status', async () => {
    const settings = getSettings();
    const webuiFile = path.join(settings.snowlumaRoot, 'config', 'webui.json');
    const tokenFile = path.join(settings.repoRoot, 'state', 'console-token');
    let tokenReady = false;
    try { tokenReady = fs.readFileSync(tokenFile, 'utf8').trim().length > 0; } catch { /* ignore */ }
    return {
      snowlumaRoot: settings.snowlumaRoot,
      repoRoot: settings.repoRoot,
      webuiInitialized: fs.existsSync(webuiFile),
      bridgeTokenReady: tokenReady,
      controlEnabled: Boolean(settings.controlEnabled),
      snowlumaOnline: await tcpProbe(5099, '127.0.0.1', 600),
      bridgeOnline: await tcpProbe(3100, '127.0.0.1', 600)
    };
  });

  router.handle('control:state', async () => {
    const settings = getSettings();
    await controller.reconcile();
    return {
      enabled: Boolean(settings.controlEnabled),
      sentinel: controller.sentinel(),
      records: controller.records(),
      definitions: Object.keys(controller.buildDefinitions())
    };
  });

  router.handle('control:set-enabled', async (_event, payload) => {
    const enabled = payload?.enabled === true;
    const next = { ...getSettings(), controlEnabled: enabled };
    saveSettings(paths, next);
    setSettings(loadSettings(paths));
    log('control', `control enabled=${enabled}`);
    return { enabled };
  });

  router.handle('control:start', async (_event, payload) => {
    const id = String(payload?.id || '');
    if (!SERVICE_IDS.has(id)) throw new Error('未知服务');
    const env = {};
    const bootstrap = payload?.env?.SNOWLUMA_WEBUI_BOOTSTRAP_PASSWORD;
    if (bootstrap !== undefined) {
      if (id !== 'snowluma') throw new Error('该环境变量只允许用于 SnowLuma');
      if (typeof bootstrap !== 'string' || bootstrap.length < 8 || bootstrap.length > 128) {
        throw new Error('SnowLuma 初始密码长度必须是 8–128 位');
      }
      env.SNOWLUMA_WEBUI_BOOTSTRAP_PASSWORD = bootstrap;
    }
    const result = await controller.start(id, { env });
    log('control', `start ${id} -> ${result.ok ? 'ok' : result.reason}`);
    return result;
  });

  router.handle('control:stop', async (_event, payload) => {
    const id = String(payload?.id || '');
    if (!SERVICE_IDS.has(id)) throw new Error('未知服务');
    const result = await controller.stop(id, { force: payload?.force === true, confirmBusy: payload?.confirmBusy === true });
    log('control', `stop ${id} force=${payload?.force === true} -> ${result.ok ? 'ok' : result.reason}`);
    return result;
  });

  router.handle('control:recover-sentinel', async () => controller.recoverSentinel());
  router.handle('control:preflight', async () => controller.preflight());
  router.handle('control:start-original', async () => controller.startOriginalBridge());
}

module.exports = { registerControlHandlers };
