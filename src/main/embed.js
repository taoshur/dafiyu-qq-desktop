'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { WebContentsView, session } = require('electron');
const { tcpProbe } = require('./health');
const { policyFor, isAllowedNavigation } = require('./embed-policy');

function placeholderHtml(title, detail) {
  const safe = String(detail).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html><meta charset="utf-8"><title>${title}</title>
<style>
  html,body{height:100%;margin:0;background:#08131b;color:#dce9ef;font:14px/1.7 system-ui,"Microsoft YaHei",sans-serif}
  body{display:grid;place-items:center}
  div{max-width:560px;padding:28px 34px;border:1px solid rgba(120,170,190,.22);border-radius:16px;background:#0d1c26}
  h2{margin:0 0 10px;font-size:17px;color:#7de6d4}
  p{margin:0;color:#91a8b5;white-space:pre-wrap}
</style>
<div><h2>${title}</h2><p>${safe}</p></div></html>`)}`;
}

function createEmbedder({ getWindow, getSettings, log = () => {} }) {
  let view = null;
  let current = null;
  let bounds = { x: 0, y: 0, width: 0, height: 0 };
  let sessionReady = false;

  const readBridgeToken = () => {
    try {
      const settings = getSettings();
      const token = fs.readFileSync(path.join(settings.repoRoot, 'state', 'console-token'), 'utf8').trim();
      return token || '';
    } catch {
      return '';
    }
  };

  const ensureSession = () => {
    if (sessionReady) return;
    sessionReady = true;
    const ses = session.fromPartition('persist:dafiyu-embed');
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    // qq-bridge 控制台用 x-console-token 鉴权；令牌只存在于主进程请求头，
    // 不进入 URL、不进入渲染进程、不写日志。
    ses.webRequest.onBeforeSendHeaders({ urls: ['http://127.0.0.1:3100/*'] }, (details, callback) => {
      const token = readBridgeToken();
      if (token && details.url.startsWith('http://127.0.0.1:3100/')) {
        details.requestHeaders['x-console-token'] = token;
      }
      callback({ requestHeaders: details.requestHeaders });
    });
  };

  const destroy = () => {
    if (!view) return;
    try {
      const win = getWindow();
      if (win && !win.isDestroyed()) win.contentView.removeChildView(view);
    } catch { /* ignore */ }
    try { view.webContents.destroy(); } catch { /* ignore */ }
    view = null;
    current = null;
  };

  const applyBounds = () => {
    if (!view) return;
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    const [width, height] = win.getContentSize();
    const x = Math.max(0, Math.min(Math.round(bounds.x), width - 1));
    const y = Math.max(0, Math.min(Math.round(bounds.y), height - 1));
    const w = Math.max(1, Math.min(Math.round(bounds.width), width - x));
    const h = Math.max(1, Math.min(Math.round(bounds.height), height - y));
    view.setBounds({ x, y, width: w, height: h });
  };

  const show = async (service) => {
    const policy = policyFor(service);
    if (!policy) return { ok: false, reason: '不支持的内嵌服务' };
    ensureSession();
    destroy();

    const win = getWindow();
    if (!win || win.isDestroyed()) return { ok: false, reason: '主窗口尚未就绪' };

    const running = await tcpProbe(policy.port, '127.0.0.1', 700);
    const target = running
      ? policy.url
      : placeholderHtml(`${policy.title} 未运行`, `端口 ${policy.port} 未监听。\n请先在「服务」页启动对应服务，再点「重新加载」。`);
    const placeholderTarget = !running ? target : null;

    try {
      view = new WebContentsView({
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          partition: 'persist:dafiyu-embed',
          devTools: false
        }
      });
      current = service;
      view.setBackgroundColor('#08131b');
      view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      view.webContents.on('will-navigate', (event, url) => {
        if (placeholderTarget && url === placeholderTarget) return;
        if (!isAllowedNavigation(service, url)) {
          event.preventDefault();
          log('embed', `blocked navigation ${service}: ${url}`);
        }
      });
      view.webContents.on('will-redirect', (event, url) => {
        if (placeholderTarget && url === placeholderTarget) return;
        if (!isAllowedNavigation(service, url)) {
          event.preventDefault();
          log('embed', `blocked redirect ${service}: ${url}`);
        }
      });
      view.webContents.on('render-process-gone', (_event, details) => {
        log('embed', `renderer gone ${service}: ${details.reason || 'unknown'}`);
      });
      win.contentView.addChildView(view);
      applyBounds();
      await view.webContents.loadURL(target);
      return { ok: true, service, running, url: running ? policy.url : null, title: policy.title };
    } catch (error) {
      destroy();
      return { ok: false, reason: `内嵌页面加载失败：${error.message}` };
    }
  };

  return {
    show,
    hide: destroy,
    setBounds(rect) {
      const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
      bounds = { x: num(rect?.x), y: num(rect?.y), width: num(rect?.width), height: num(rect?.height) };
      applyBounds();
    },
    state: () => ({ service: current, bounds })
  };
}

module.exports = { createEmbedder };
