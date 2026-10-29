'use strict';

function buildAppInfo({ paths, getSettings }) {
  return {
    name: '大肥鱼 · 桌面控制台',
    version: require('../../../package.json').version,
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
  };
}

module.exports = { buildAppInfo };
