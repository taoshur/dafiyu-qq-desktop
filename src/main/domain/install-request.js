'use strict';

const path = require('node:path');

function parseInstallRequest(payload) {
  const component = ['bridge', 'snowluma'].includes(payload?.component) ? payload.component : '';
  if (!component) {
    return { ok: false, error: { code: 'E_INSTALL_COMPONENT', message: '当前只提供 qq-bridge 与 SnowLuma 的官方自动安装；DSH 需要手动安装' } };
  }
  const targetDir = typeof payload?.targetDir === 'string' && payload.targetDir.trim() ? payload.targetDir.trim() : null;
  if (targetDir && !path.isAbsolute(targetDir)) {
    return { ok: false, error: { code: 'E_INSTALL_PATH', message: '安装目录必须是绝对路径' } };
  }
  return {
    ok: true,
    value: {
      component,
      targetDir,
      confirmed: payload?.confirmed === true,
      licenseAccepted: payload?.licenseAccepted === true
    }
  };
}

module.exports = { parseInstallRequest };
