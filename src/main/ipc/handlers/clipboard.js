'use strict';

function registerClipboardHandlers(router) {
  const { clipboard, shell } = require('electron');

  router.handle('clipboard:write', async (_event, payload) => {
    const text = typeof payload?.text === 'string' ? payload.text : '';
    if (!text || text.length > 20000) return { ok: false, reason: '文本为空或过长' };
    clipboard.writeText(text);
    return { ok: true, length: text.length };
  });

  router.handle('app:open-external', async (_event, payload) => {
    let target;
    try { target = new URL(String(payload?.url || '')); } catch { return { ok: false, reason: '无效链接' }; }
    if (target.protocol !== 'https:' || target.hostname !== 'github.com'
      || !target.pathname.startsWith('/taoshur/dafiyu-qq-desktop/releases')) {
      return { ok: false, reason: '只允许打开本项目的 GitHub Release 页面' };
    }
    await shell.openExternal(target.href);
    return { ok: true };
  });
}

module.exports = { registerClipboardHandlers };
