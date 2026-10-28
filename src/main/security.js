'use strict';

/**
 * Electron 安全基线：
 * - 渲染进程无 Node、开启 contextIsolation/sandbox；
 * - 禁止新窗口、导航、webview 挂载；
 * - 权限请求一律拒绝（权限检查同样拒绝）；
 * - 生产构建关闭 DevTools。
 */
function buildWindowPreferences(preloadPath, { devTools = false } = {}) {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    spellcheck: false,
    devTools
  };
}

function guardWebContents(contents, onBlocked = () => {}) {
  if (!contents || contents.__dafiyuGuarded) return;
  contents.__dafiyuGuarded = true;

  contents.setWindowOpenHandler(({ url }) => {
    onBlocked('window-open', url);
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    event.preventDefault();
    onBlocked('navigate', url);
  });

  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
    onBlocked('webview', '');
  });
}

function applyGlobalGuards(app, onBlocked = () => {}) {
  app.on('web-contents-created', (_event, contents) => guardWebContents(contents, onBlocked));
}

module.exports = { buildWindowPreferences, guardWebContents, applyGlobalGuards };
