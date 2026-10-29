'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { clipboard } = require('electron');
const { buildSnapshot } = require('./health');
const { listSources, tailSource } = require('./logs');
const { definitions, simulateAction, dependencyPlan } = require('./services');
const { readProjectConfig, loadSettings, saveSettings } = require('./paths');
const { createBackup, verifyBackup, listBackups, restoreDrill } = require('./backup');
const { createController } = require('./control');
const { createAutostart, realBackend } = require('./autostart');
const { createWatchdogMonitor } = require('./watchdog-health');
const { createStartupStatus } = require('./startup-status');
const { recoveryBoundary } = require('./startup-plan');
const { readAll: readIntents, getIntent } = require('./stop-intent');
const { listProcessDetails, verifyProcess } = require('./proc');
const { tcpProbe } = require('./health');
const { assessBusy } = require('./busy-guard');
const { createRecoveryEngine } = require('./recovery-engine');
const { ownershipPlan } = require('./recovery-ownership');
const { memoryStatus, listMemory, getCandidate, initTestDb, reviewCandidate } = require('./memory');
const { detectEnvironment } = require('./environment');
const { createInstallManager } = require('./install-task');
const { catalogFor, defaultInstallRoot } = require('./install-catalog');

const SERVICE_IDS = new Set(['snowluma', 'dsh', 'bridge']);
const ACTIONS = new Set(['start', 'stop', 'restart']);
const LOG_SOURCES = new Set(['bridge', 'activity', 'watchdog', 'growth', 'snowluma']);

function registerIpc({ ipcMain, paths, getSettings, setSettings, allowAutostart = false, embed = null, log }) {
  let cached = { at: 0, value: null };
  let backupRunning = false;
  const controlStateDir = path.join(paths.configDir, '..', 'state');
  const controller = createController({ stateDir: controlStateDir, getSettings, log });
  controller.reconcile().catch((error) => log('control', `reconcile failed: ${error.message}`));
  const installManager = createInstallManager({ paths, getSettings, log, component: 'bridge' });
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

  const backupRoots = (settings) => [path.join(settings.repoRoot, 'backups'), 'D:\\qq-bridge-backups'];

  const assertBackupDir = (settings, dir) => {
    const target = path.resolve(String(dir || ''));
    const roots = backupRoots(settings).map((root) => path.resolve(root) + path.sep);
    if (!roots.some((root) => (target + path.sep).startsWith(root))) {
      throw new Error('只能校验备份目录内的路径');
    }
    if (!fs.existsSync(target)) throw new Error('备份目录不存在');
    return target;
  };

  ipcMain.handle('app:info', async () => ({
    name: '大肥鱼 · 桌面控制台',
    version: require('../../package.json').version,
    phase: 'phase-3-p1',
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    uptimeSec: Math.round(process.uptime()),
    mockMode: false,
    backupEnabled: true,
    restoreEnabled: false,
    safeMode: Boolean(getSettings().safeMode),
    controlEnabled: Boolean(getSettings().controlEnabled),
    paths: {
      userData: paths.configDir.replace(/[\\/]config$/, ''),
      config: paths.configFile,
      logs: paths.logDir
    }
  }));

  ipcMain.handle('health:snapshot', async () => {
    if (cached.value && Date.now() - cached.at < 1000) return cached.value;
    const settings = getSettings();
    const value = await buildSnapshot(settings, { mockMode: true });
    value.plan = dependencyPlan(definitions(settings));
    cached = { at: Date.now(), value };
    return value;
  });

  ipcMain.handle('logs:list', async () => listSources(getSettings()));

  ipcMain.handle('logs:tail', async (_event, payload) => {
    const source = String(payload?.source || '');
    if (!LOG_SOURCES.has(source)) throw new Error('日志来源不在白名单内');
    const lines = Number(payload?.lines);
    if (!Number.isFinite(lines) || lines < 1 || lines > 500) throw new Error('行数必须是 1–500');
    return tailSource(getSettings(), source, lines);
  });

  ipcMain.handle('config:summary', async () => readProjectConfig(getSettings().repoRoot));

  ipcMain.handle('services:action', async (_event, payload) => {
    const id = String(payload?.id || '');
    const action = String(payload?.action || '');
    if (!SERVICE_IDS.has(id)) throw new Error('未知服务');
    if (!ACTIONS.has(action)) throw new Error('未知操作');
    const result = simulateAction(definitions(getSettings()), id, action);
    log('action', `${id}:${action} -> simulated`);
    return result;
  });

  ipcMain.handle('embed:show', async (_event, payload) => {
    if (!embed) return { ok: false, reason: '内嵌页面未初始化' };
    const service = payload?.service;
    if (service !== 'snowluma' && service !== 'bridge') return { ok: false, reason: '不支持的内嵌服务' };
    const result = await embed.show(service);
    if (result?.ok) log('embed', `show ${service} running=${result.running}`);
    return result;
  });

  ipcMain.handle('embed:bounds', async (_event, payload) => {
    if (!embed) return { ok: false };
    const rect = payload?.rect || {};
    const nums = ['x', 'y', 'width', 'height'].map((key) => Number(rect[key]));
    if (!nums.every(Number.isFinite)) return { ok: false, reason: 'bounds 必须是数字' };
    embed.setBounds({ x: nums[0], y: nums[1], width: nums[2], height: nums[3] });
    return { ok: true };
  });

  ipcMain.handle('embed:hide', async () => {
    if (embed) embed.hide();
    return { ok: true };
  });

  ipcMain.handle('embed:state', async () => (embed ? embed.state() : { service: null }));

  ipcMain.handle('environment:detect', async (_event, payload) => {
    const settings = getSettings();
    let snapshot = null;
    try { snapshot = await buildSnapshot(settings, { mockMode: false }); } catch { snapshot = null; }
    return detectEnvironment({ settings, snapshot, checkNetwork: payload?.network !== false });
  });

  ipcMain.handle('install:catalog', async () => ({
    bridge: catalogFor('bridge'),
    snowluma: catalogFor('snowluma'),
    dsh: catalogFor('dsh'),
    defaultRoot: defaultInstallRoot()
  }));

  ipcMain.handle('install:start', async (_event, payload) => {
    const component = ['bridge', 'snowluma'].includes(payload?.component) ? payload.component : '';
    if (!component) return { ok: false, reason: '当前只提供 qq-bridge 与 SnowLuma 的官方自动安装；DSH 需要手动安装' };
    const targetDir = typeof payload?.targetDir === 'string' && payload.targetDir.trim()
      ? payload.targetDir.trim()
      : null;
    if (targetDir && !path.isAbsolute(targetDir)) return { ok: false, reason: '安装目录必须是绝对路径' };
    const result = installManager.start({
      component,
      targetDir,
      confirmed: payload?.confirmed === true,
      licenseAccepted: payload?.licenseAccepted === true
    });
    log('install', `start ${component} dir=${targetDir ? path.basename(targetDir) : 'default'} ok=${result.ok}`);
    return result;
  });

  ipcMain.handle('install:status', async () => installManager.status());
  ipcMain.handle('install:cancel', async () => installManager.cancel());

  ipcMain.handle('clipboard:write', async (_event, payload) => {
    const text = typeof payload?.text === 'string' ? payload.text : '';
    if (!text || text.length > 20000) return { ok: false, reason: '文本为空或过长' };
    clipboard.writeText(text);
    return { ok: true, length: text.length };
  });

  ipcMain.handle('setup:status', async () => {
    const settings = getSettings();
    const webuiFile = path.join(settings.snowlumaRoot, 'config', 'webui.json');
    const tokenFile = path.join(settings.repoRoot, 'state', 'console-token');
    let tokenReady = false;
    try { tokenReady = fs.readFileSync(tokenFile, 'utf8').trim().length > 0; } catch { /* ignore */ }
    const result = {
      snowlumaRoot: settings.snowlumaRoot,
      repoRoot: settings.repoRoot,
      webuiInitialized: fs.existsSync(webuiFile),
      bridgeTokenReady: tokenReady,
      controlEnabled: Boolean(settings.controlEnabled),
      snowlumaOnline: await tcpProbe(5099, '127.0.0.1', 600),
      bridgeOnline: await tcpProbe(3100, '127.0.0.1', 600)
    };
    return result;
  });

  ipcMain.handle('control:state', async () => {
    const settings = getSettings();
    await controller.reconcile();
    return {
      enabled: Boolean(settings.controlEnabled),
      sentinel: controller.sentinel(),
      records: controller.records(),
      definitions: Object.keys(controller.buildDefinitions())
    };
  });

  ipcMain.handle('control:set-enabled', async (_event, payload) => {
    const enabled = payload?.enabled === true;
    const next = { ...getSettings(), controlEnabled: enabled };
    saveSettings(paths, next);
    setSettings(loadSettings(paths));
    log('control', `control enabled=${enabled}`);
    return { enabled };
  });

  ipcMain.handle('control:start', async (_event, payload) => {
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

  ipcMain.handle('control:stop', async (_event, payload) => {
    const id = String(payload?.id || '');
    if (!SERVICE_IDS.has(id)) throw new Error('未知服务');
    const result = await controller.stop(id, { force: payload?.force === true, confirmBusy: payload?.confirmBusy === true });
    log('control', `stop ${id} force=${payload?.force === true} -> ${result.ok ? 'ok' : result.reason}`);
    return result;
  });

  ipcMain.handle('control:recover-sentinel', async () => controller.recoverSentinel());

  ipcMain.handle('control:preflight', async () => controller.preflight());

  ipcMain.handle('control:start-original', async () => controller.startOriginalBridge());

  ipcMain.handle('backups:list', async () => listBackups(getSettings().repoRoot, ['D:\\qq-bridge-backups']).slice(0, 50));

  ipcMain.handle('backups:create', async () => {
    if (backupRunning) throw new Error('已有备份任务在进行中');
    backupRunning = true;
    const settings = getSettings();
    try {
      log('backup', `start ${settings.repoRoot}`);
      const result = createBackup({
        repoRoot: settings.repoRoot,
        backupRoot: path.join(settings.repoRoot, 'backups'),
        appVersion: require('../../package.json').version
      });
      log('backup', `done ${path.basename(result.dir)} files=${result.files} ok=${result.verify.ok}`);
      return result;
    } finally {
      backupRunning = false;
    }
  });

  ipcMain.handle('backups:verify', async (_event, payload) => {
    const settings = getSettings();
    const dir = assertBackupDir(settings, payload?.dir);
    const result = verifyBackup(dir);
    log('backup', `verify ${path.basename(dir)} ok=${result.ok}`);
    return result;
  });

  ipcMain.handle('backups:restore-drill', async (_event, payload) => {
    const settings = getSettings();
    const dir = assertBackupDir(settings, payload?.dir);
    const target = path.join(paths.stateDir, 'restore-drill.db');
    const result = restoreDrill({ backupDir: dir, targetFile: target });
    log('backup', `restore drill ${path.basename(dir)} integrity=${result.integrity}`);
    return result;
  });

  ipcMain.handle('startup:status', async () => getStartupStatus());

  ipcMain.handle('watchdog:status', async () => {
    const settings = getSettings();
    const monitor = createWatchdogMonitor({
      queryTask: (name) => realBackend.query(name),
      stateDir: controlStateDir,
      repoRoot: settings.repoRoot
    });
    return monitor();
  });

  ipcMain.handle('autostart:status', async () => autostart.status());

  ipcMain.handle('autostart:register', async (_event, payload) => {
    if (payload?.confirm !== true) return { ok: false, reason: '注册系统任务需要确认' };
    if (!allowAutostart) return { ok: false, reason: '开发模式（未打包）不注册系统任务' };
    if (getSettings().safeMode) return { ok: false, reason: '安全模式下禁止注册系统任务' };
    const result = await autostart.ensure();
    startupCache = { at: 0, value: null };
    return result;
  });

  ipcMain.handle('autostart:unregister', async (_event, payload) => {
    if (payload?.confirm !== true) return { ok: false, reason: '注销系统任务需要确认' };
    if (!allowAutostart) return { ok: false, reason: '开发模式（未打包）不修改系统任务' };
    if (getSettings().safeMode) return { ok: false, reason: '安全模式下禁止修改系统任务' };
    const result = await autostart.remove();
    startupCache = { at: 0, value: null };
    return result;
  });

  ipcMain.handle('startup:info', async () => ({
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

  ipcMain.handle('recovery:status', async () => ({
    state: recoveryEngine.state(),
    history: recoveryEngine.history(20),
    ownership: ownershipPlan(),
    states: await recoveryEngine.classifyAll()
  }));

  const memoryMode = (payload) => (payload?.mode === 'test' ? 'test' : 'prod');

  ipcMain.handle('memory:status', async (_event, payload) => {
    const settings = getSettings();
    return memoryStatus({ settings, paths, mode: memoryMode(payload) });
  });

  ipcMain.handle('memory:list', async (_event, payload) => {
    const settings = getSettings();
    const type = ['facts', 'events', 'candidates'].includes(payload?.type) ? payload.type : 'candidates';
    const status = ['pending', 'applied', 'rejected'].includes(payload?.status) ? payload.status : 'pending';
    return listMemory({
      settings, paths, mode: memoryMode(payload), type,
      q: String(payload?.q || '').slice(0, 100),
      dateFrom: String(payload?.dateFrom || '').slice(0, 10),
      dateTo: String(payload?.dateTo || '').slice(0, 10),
      subject: String(payload?.subject || '').slice(0, 60),
      status,
      limit: Number(payload?.limit) || 50,
      offset: Number(payload?.offset) || 0
    });
  });

  ipcMain.handle('memory:candidate', async (_event, payload) => {
    const settings = getSettings();
    return getCandidate({ settings, paths, mode: memoryMode(payload), id: Number(payload?.id) || 0 });
  });

  ipcMain.handle('memory:test-init', async (_event, payload) => {
    if (payload?.confirm !== true) throw new Error('初始化隔离测试库需要确认');
    const result = await initTestDb({ settings: getSettings(), paths, reset: payload?.reset === true });
    log('memory', `test db init created=${result.created}`);
    return result;
  });

  ipcMain.handle('memory:review', async (_event, payload) => {
    if (memoryMode(payload) !== 'test') throw new Error('生产库只读：审核只能在隔离测试库进行');
    const action = payload?.action === 'reject' ? 'reject' : 'apply';
    const result = await reviewCandidate({
      settings: getSettings(), paths,
      id: Number(payload?.id) || 0,
      action,
      reason: String(payload?.reason || '').slice(0, 200)
    });
    log('memory', `test review ${action} candidate=${Number(payload?.id) || 0} -> ${result.status || result.action || 'ok'}`);
    return result;
  });

  ipcMain.handle('settings:get', async () => getSettings());

  ipcMain.handle('settings:save', async (_event, payload) => {
    const next = {
      repoRoot: String(payload?.repoRoot || '').trim(),
      snowlumaRoot: String(payload?.snowlumaRoot || '').trim(),
      dshExe: String(payload?.dshExe || '').trim(),
      controlEnabled: payload?.controlEnabled === undefined ? Boolean(getSettings().controlEnabled) : payload.controlEnabled === true,
      managerAutostart: payload?.managerAutostart === undefined ? Boolean(getSettings().managerAutostart) : payload.managerAutostart === true,
      botAutostart: payload?.botAutostart === undefined ? Boolean(getSettings().botAutostart) : payload.botAutostart === true,
      autoRecovery: payload?.autoRecovery === undefined ? Boolean(getSettings().autoRecovery) : payload.autoRecovery === true
    };
    for (const [key, value] of Object.entries(next)) {
      if (!value || !path.isAbsolute(value)) throw new Error(`${key} 必须是绝对路径`);
      if (!fs.existsSync(value)) throw new Error(`${key} 不存在：${value}`);
    }
    saveSettings(paths, next);
    setSettings(loadSettings(paths));
    cached = { at: 0, value: null };
    log('settings', 'paths updated');
    return getSettings();
  });
  return { stopOwnedServices: () => controller.stopOwnedServices() };
}

module.exports = { registerIpc };
