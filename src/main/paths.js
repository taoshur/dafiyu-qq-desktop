'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_PATHS = {
  repoRoot: process.env.DAFIYU_REPO_ROOT || path.join(os.homedir(), 'qq-bridge'),
  snowlumaRoot: process.env.DAFIYU_SNOWLUMA_ROOT || path.join(os.homedir(), 'SnowLuma'),
  dshExe: path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
    'Programs',
    'DeepSeek Harness',
    'DeepSeek Harness.exe'
  )
};

/**
 * 桌面壳自己的配置与日志都放在 userData 下，绝不写进 qq-bridge 仓库。
 * userData 由 Electron 提供（%APPDATA%\dafiyu-desktop）。
 */
function createPaths(userDataDir) {
  const configDir = path.join(userDataDir, 'config');
  const logDir = path.join(userDataDir, 'logs');
  const cacheDir = path.join(userDataDir, 'cache');
  const stateDir = path.join(userDataDir, 'state');
  for (const dir of [configDir, logDir, cacheDir, stateDir]) fs.mkdirSync(dir, { recursive: true });
  const configFile = path.join(configDir, 'config.json');
  return {
    configDir,
    logDir,
    cacheDir,
    stateDir,
    configFile,
    memoryTestDb: path.join(stateDir, 'memory-test.db')
  };
}

function readJsonSafe(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadSettings(paths) {
  const saved = readJsonSafe(paths.configFile, {});
  const merged = { ...DEFAULT_PATHS, ...(saved && typeof saved === 'object' ? saved : {}) };
  return {
    repoRoot: path.resolve(String(merged.repoRoot || DEFAULT_PATHS.repoRoot)),
    snowlumaRoot: path.resolve(String(merged.snowlumaRoot || DEFAULT_PATHS.snowlumaRoot)),
    dshExe: path.resolve(String(merged.dshExe || DEFAULT_PATHS.dshExe)),
    controlEnabled: merged.controlEnabled === true,
    // 三个开关完全独立，默认全部关闭；读取时只认显式 true。
    managerAutostart: merged.managerAutostart === true,
    botAutostart: merged.botAutostart === true,
    autoRecovery: merged.autoRecovery === true
  };
}

function saveSettings(paths, settings) {
  const data = {
    repoRoot: String(settings.repoRoot || ''),
    snowlumaRoot: String(settings.snowlumaRoot || ''),
    dshExe: String(settings.dshExe || ''),
    controlEnabled: settings.controlEnabled === true,
    managerAutostart: settings.managerAutostart === true,
    botAutostart: settings.botAutostart === true,
    autoRecovery: settings.autoRecovery === true
  };
  const tmp = `${paths.configFile}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, paths.configFile);
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  }
}

/** 读取项目 config.json：只取路径/端口/开关这类非机密字段，令牌一律不返回。 */
function readProjectConfig(repoRoot) {
  const file = path.join(repoRoot, 'config.json');
  const raw = readJsonSafe(file, null);
  if (!raw) return { exists: fs.existsSync(file), valid: false };
  const portOf = (value, fallback) => {
    try {
      const url = new URL(String(value));
      return Number(url.port) || fallback;
    } catch {
      return fallback;
    }
  };
  return {
    exists: true,
    valid: true,
    ports: {
      snowlumaHttp: portOf(raw?.snowluma?.httpUrl, 3000),
      snowlumaWs: portOf(raw?.snowluma?.wsUrl, 3001),
      dshRelay: portOf(raw?.dsh?.baseUrl, 3080),
      console: Number(raw?.consolePort) || 3100
    },
    paths: {
      snowlumaHome: raw?.snowluma?.homeDir || '',
      voiceDir: raw?.socialV2?.voice?.dir || '',
      growthDb: raw?.socialV2?.growth?.dbPath || 'state/memory.db'
    },
    flags: {
      observeOnly: raw?.socialV2?.growth?.observeOnly !== false,
      voiceEnabled: raw?.socialV2?.voice?.enabled === true,
      allowRemote: raw?.dsh?.allowRemote === true,
      hasOwnerQQ: Number(raw?.ownerQQ) > 0,
      hasSnowlumaToken: Boolean(raw?.snowluma?.accessToken),
      hasConsoleToken: Boolean(raw?.consoleToken)
    },
    memory: {
      observeOnly: raw?.socialV2?.memory?.observeOnly !== false,
      retrieval: raw?.socialV2?.memory?.retrieval === true,
      extract: raw?.socialV2?.memory?.extract === true,
      ingest: raw?.socialV2?.memory?.ingest === true,
      dbPath: raw?.socialV2?.memory?.dbPath || 'state/memory.db',
      model: raw?.socialV2?.memory?.model || raw?.socialV2?.fastPath?.model || '',
      hasApiKey: Boolean(raw?.socialV2?.fastPath?.apiKey),
      apiHost: (() => {
        try { return new URL(String(raw?.socialV2?.fastPath?.baseUrl || 'https://api.deepseek.com')).host; } catch { return ''; }
      })(),
      voiceEnabled: raw?.socialV2?.voice?.enabled === true,
      ownerConfigured: Number(raw?.ownerQQ) > 0
    }
  };
}

module.exports = { DEFAULT_PATHS, createPaths, loadSettings, saveSettings, readProjectConfig, readJsonSafe };
