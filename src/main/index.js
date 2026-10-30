'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, nativeTheme, session, shell } = require('electron');
const { createPaths, loadSettings, migrateSettings } = require('./paths');
const { registerIpc } = require('./ipc');
const { createEmbedder } = require('./embed');
const { buildWindowPreferences, applyGlobalGuards } = require('./security');

const SAFE_MODE = process.argv.includes('--safe-mode') || process.env.DAFIYU_SAFE_MODE === '1';
const START_HIDDEN = process.argv.includes('--hidden') || process.env.DAFIYU_START_HIDDEN === '1';

const userDataDir = app.getPath('userData');
const paths = createPaths(userDataDir);
const settingsMigration = migrateSettings(paths);
let settings = loadSettings(paths);
let tray = null;
let mainWindow = null;
let isQuitting = false;

function effectiveSettings() {
  return { ...settings, controlEnabled: SAFE_MODE ? false : settings.controlEnabled, safeMode: SAFE_MODE };
}

function desktopLog(kind, message) {
  try {
    const file = path.join(paths.logDir, 'app.log');
    try {
      if (fs.statSync(file).size > 2 * 1024 * 1024) {
        try { fs.rmSync(`${file}.1`, { force: true }); } catch { /* ignore */ }
        fs.renameSync(file, `${file}.1`);
      }
    } catch {
      /* 文件还不存在 */
    }
    const line = `${new Date().toISOString()} [${kind}] ${String(message).replace(/\s+/g, ' ').slice(0, 600)}\n`;
    fs.appendFileSync(file, line, 'utf8');
  } catch {
    /* 桌面日志失败不能影响主流程 */
  }
}

function showWindow() {  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function startupSelfCheck() {
  const checks = {
    repo: fs.existsSync(path.join(settings.repoRoot, 'package.json')),
    config: fs.existsSync(path.join(settings.repoRoot, 'config.json')),
    snowluma: fs.existsSync(path.join(settings.snowlumaRoot, 'index.mjs')),
    dsh: fs.existsSync(settings.dshExe)
  };
  const missing = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  desktopLog('selfcheck', `repo=${checks.repo} config=${checks.config} snowluma=${checks.snowluma} dsh=${checks.dsh}${missing.length ? ` missing=${missing.join(',')}` : ''}`);
  return checks;
}

let trayIpc = null;

function createTray(ipc = null) {
  trayIpc = ipc;
  const iconPath = path.join(__dirname, '..', '..', 'deepseek-chan.png');
  const image = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip('大肥鱼控制中心');
  tray.on('click', () => {
    if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
    else showWindow();
  });
  updateTrayMenu();
  desktopLog('tray', 'ready');
}

function updateTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: '打开控制台', click: () => showWindow() },
    { label: '隐藏窗口', click: () => { if (mainWindow) mainWindow.hide(); } },
    { type: 'separator' },
    { label: '打开日志目录', click: () => { shell.openPath(paths.logDir).catch(() => {}); } },
    { type: 'separator' },
    {
      label: '退出并停止我启动的服务（快速）',
      click: async () => {
        if (isQuitting) return;
        isQuitting = true;
        const started = Date.now();
        try {
          const stop = trayIpc?.stopOwnedServicesFast?.();
          const timeout = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 3500));
          const results = await Promise.race([stop, timeout]);
          desktopLog('app', `fast quit stop services ${JSON.stringify(results || [])}`);
        } catch (error) {
          desktopLog('error', `fast quit stop services failed: ${error.message}`);
        } finally {
          desktopLog('app', `manager fast quit after ${Date.now() - started}ms`);
          app.exit(0);
        }
      }
    },
    {
      label: '仅退出界面（服务继续运行）',
      click: () => {
        if (isQuitting) return;
        isQuitting = true;
        desktopLog('app', 'manager quit UI only');
        app.exit(0);
      }
    }
  ]);
  tray.setContextMenu(menu);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 1020,
    minHeight: 680,
    show: false,
    backgroundColor: '#08131b',
    title: '大肥鱼 · 控制中心',
    icon: path.join(__dirname, '..', '..', 'deepseek-chan.png'),
    autoHideMenuBar: true,
    webPreferences: buildWindowPreferences(path.join(__dirname, '..', 'preload', 'index.js'), {
      devTools: !app.isPackaged
    })
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.once('ready-to-show', () => {
    if (START_HIDDEN) win.hide();
    else win.show();
    desktopLog('window', START_HIDDEN ? 'ready (hidden)' : 'ready');
  });

  win.webContents.on('did-finish-load', () => {
    if (process.env.DAFIYU_OPEN_WIZARD === '1') {
      setTimeout(() => win.webContents.executeJavaScript('openWizard(0)').catch(() => {}), 600);
    }
    const startPage = process.env.DAFIYU_OPEN_PAGE;
    if (!startPage) return;
    win.webContents.executeJavaScript(
      `(() => { const btn = document.querySelector('[data-page="${startPage}"]'); if (btn) btn.click(); return true; })()`
    ).catch(() => false);
  });

  // 关闭窗口 = 隐藏到托盘，主进程继续运行；只有托盘“退出管理器”才真正退出。
  win.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    win.hide();
    try { win.webContents.send('app:hidden-to-tray'); } catch { /* window may be closing */ }
    desktopLog('window', 'close requested -> hidden to tray');
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html')).catch((error) => {
    desktopLog('error', `load renderer failed: ${error.message}`);
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    desktopLog('error', `renderer gone: ${details.reason}`);
  });

  const capturePath = process.env.DAFIYU_CAPTURE;
  const selftestPath = process.env.DAFIYU_SELFTEST;
  const lifecyclePath = process.env.DAFIYU_LIFECYCLE_TEST;
  const infoPath = process.env.DAFIYU_INFO_TEST;
  if (capturePath || selftestPath || lifecyclePath || infoPath) {
    win.webContents.once('did-finish-load', () => {
      const deadline = Date.now() + 12000;
      const tryCapture = async () => {
        const ready = await win.webContents.executeJavaScript(
          'Boolean(document.querySelector(".hero, .check-row, .flow-card, .log-panel"))'
        ).catch(() => false);
        if (!ready && Date.now() < deadline) {
          setTimeout(tryCapture, 250);
          return;
        }
        const page = process.env.DAFIYU_PAGE;
        if (page) {
          await win.webContents.executeJavaScript(
            `(() => { const btn = document.querySelector('[data-page="${page}"]'); if (btn) btn.click(); return true; })()`
          ).catch(() => false);
        }
        if (process.env.DAFIYU_MEMORY_TEST === '1') {
          try {
            await win.webContents.executeJavaScript('window.__dafiyuMemoryTest ? window.__dafiyuMemoryTest() : false');
          } catch (error) {
            desktopLog('error', `memory test init failed: ${error.message}`);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 900));
        if (infoPath) {
          try {
            const info = await win.webContents.executeJavaScript('window.dafiyu.info()');
            const controlState = await win.webContents.executeJavaScript('window.dafiyu.controlState()');
            const recoveryStatus = await win.webContents.executeJavaScript('window.dafiyu.recoveryStatus()');
            const watchdogStatus = await win.webContents.executeJavaScript('window.dafiyu.watchdogStatus()');
            const setupStatus = await win.webContents.executeJavaScript('window.dafiyu.setupStatus()');
            const rendererState = await win.webContents.executeJavaScript('({ page: state.page, setup: state.setup, view: (document.querySelector("#view") || {}).innerHTML || "" })');
            const cardText = await win.webContents.executeJavaScript('(document.querySelector(".service-card") || {}).innerText || ""');
            fs.mkdirSync(path.dirname(infoPath), { recursive: true });
            fs.writeFileSync(infoPath, JSON.stringify({ info, controlState, recoveryStatus, watchdogStatus, setupStatus, rendererState, cardText }, null, 2), 'utf8');
          } catch (error) {
            desktopLog('error', `info test failed: ${error.message}`);
          }
        }
        if (selftestPath) {          try {
            const result = await win.webContents.executeJavaScript('window.dafiyu.backupCreate()');
            fs.mkdirSync(path.dirname(selftestPath), { recursive: true });
            fs.writeFileSync(selftestPath, JSON.stringify(result, null, 2), 'utf8');
            desktopLog('selftest', `backup ok=${Boolean(result && result.verify && result.verify.ok)}`);
          } catch (error) {
            desktopLog('error', `selftest failed: ${error.message}`);
            try { fs.writeFileSync(selftestPath, JSON.stringify({ error: error.message }, null, 2), 'utf8'); } catch { /* ignore */ }
          }
        }
        if (capturePath) {
          try {
            const image = await win.webContents.capturePage();
            fs.mkdirSync(path.dirname(capturePath), { recursive: true });
            fs.writeFileSync(capturePath, image.toPNG());
            desktopLog('capture', capturePath);
          } catch (error) {
            desktopLog('error', `capture failed: ${error.message}`);
          }
        }
        if (lifecyclePath) {
          try {
            win.close();
            await new Promise((resolve) => setTimeout(resolve, 600));
            const state = {
              windowCount: BrowserWindow.getAllWindows().length,
              windowVisible: win.isVisible(),
              trayReady: Boolean(tray),
              appAlive: true,
              safeMode: SAFE_MODE,
              closeHidToTray: !win.isVisible()
            };
            fs.mkdirSync(path.dirname(lifecyclePath), { recursive: true });
            fs.writeFileSync(lifecyclePath, JSON.stringify(state, null, 2), 'utf8');
            desktopLog('selftest', `lifecycle ${JSON.stringify(state)}`);
          } catch (error) {
            desktopLog('error', `lifecycle selftest failed: ${error.message}`);
            try { fs.writeFileSync(lifecyclePath, JSON.stringify({ error: error.message }, null, 2), 'utf8'); } catch { /* ignore */ }
          }
        }
        isQuitting = true;
        setTimeout(() => app.quit(), 200);
      };
      setTimeout(tryCapture, 800);
    });
  }

  mainWindow = win;
  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
    desktopLog('app', 'second instance focused existing window');
  });

  app.whenReady().then(() => {
    nativeTheme.themeSource = 'dark';
    app.setAppUserModelId('com.dafiyu.controlcenter');
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    applyGlobalGuards(app, (kind, url) => desktopLog('security', `${kind} blocked${url ? `: ${url}` : ''}`));
    const embed = createEmbedder({
      getWindow: () => mainWindow,
      getSettings: effectiveSettings,
      log: desktopLog
    });
    const ipc = registerIpc({
      ipcMain,
      paths,
      getSettings: effectiveSettings,
      setSettings: (next) => { settings = next; },
      allowAutostart: app.isPackaged,
      embed,
      log: desktopLog
    });
    desktopLog('app', `start phase-3-p1 electron=${process.versions.electron} safeMode=${SAFE_MODE} hidden=${START_HIDDEN}`);
    startupSelfCheck();
    createTray(ipc);
    createWindow();

    app.on('activate', () => showWindow());
  });

  // 关闭所有窗口不退出：托盘常驻、机器人继续运行。
  app.on('window-all-closed', () => {
    desktopLog('app', 'all windows closed; manager stays resident in tray');
  });

  app.on('before-quit', () => {
    isQuitting = true;
    desktopLog('app', 'manager quitting; services are left running');
  });
}
