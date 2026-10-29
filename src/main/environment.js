'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { execFile } = require('node:child_process');

const STATUS = Object.freeze({
  NOT_INSTALLED: 'not-installed',
  INSTALLED_UNCONFIGURED: 'installed-unconfigured',
  CONFIGURED_NOT_RUNNING: 'configured-not-running',
  RUNNING: 'running',
  INCOMPATIBLE: 'incompatible',
  UNKNOWN: 'unknown'
});

const STATUS_LABELS = Object.freeze({
  [STATUS.NOT_INSTALLED]: '未安装',
  [STATUS.INSTALLED_UNCONFIGURED]: '已安装但未配置',
  [STATUS.CONFIGURED_NOT_RUNNING]: '已配置但未运行',
  [STATUS.RUNNING]: '正常运行',
  [STATUS.INCOMPATIBLE]: '版本不兼容',
  [STATUS.UNKNOWN]: '检测失败或状态未知'
});

function readJson(file) {
  try { return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch (error) {
    return { ok: false, error: error.message };
  }
}

function exists(file) {
  try { return fs.existsSync(file); } catch { return false; }
}

function versionParts(value) {
  return String(value || '').replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map((part) => Number(part) || 0);
}

function compareVersion(actual, minimum) {
  const a = versionParts(actual);
  const b = versionParts(minimum);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

function runCommand(file, args, timeoutMs = 4000) {
  return new Promise((resolve) => {
    try {
      execFile(file, args, { windowsHide: true, timeout: timeoutMs, encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) resolve({ ok: false, error: error.message, output: String(stderr || stdout || '').trim() });
        else resolve({ ok: true, output: String(stdout || '').trim() });
      });
    } catch (error) {
      resolve({ ok: false, error: error.message, output: '' });
    }
  });
}

function commandOnPath(command) {
  if (process.platform === 'win32') return runCommand('where.exe', [command]);
  return runCommand('sh', ['-c', `command -v ${JSON.stringify(command)}`]);
}

function checkHttps(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (state, detail) => {
      if (settled) return;
      settled = true;
      resolve({ url, state, detail });
    };
    const request = https.request(url, { method: 'HEAD', timeout: timeoutMs, headers: { 'user-agent': 'dafiyu-environment-check' } }, (response) => {
      const status = Number(response.statusCode || 0);
      response.resume();
      finish(status > 0 && status < 500 ? 'reachable' : 'unknown', `HTTP ${status}`);
    });
    request.on('timeout', () => { request.destroy(); finish('unknown', 'timeout'); });
    request.on('error', (error) => finish('unknown', error.code || error.message));
    request.end();
  });
}

function componentResult(summary) {
  return { ...summary, label: STATUS_LABELS[summary.status] || summary.status };
}

async function detectEnvironment({
  settings,
  snapshot = null,
  now = () => Date.now(),
  checkNetwork = true,
  dshConfigDir = null
} = {}) {
  const settingsSafe = settings || {};
  const services = new Map((snapshot?.services || []).map((item) => [item.id, item]));
  const checks = [];

  const platform = process.platform;
  const arch = process.arch;
  const release = os.release();
  const windowsSupported = platform === 'win32' && ['x64', 'arm64'].includes(arch);
  const windowsVersion = platform === 'win32' ? Number(release.split('.')[2] || 0) : 0;
  checks.push({
    id: 'os',
    label: '操作系统与 CPU 架构',
    state: windowsSupported ? 'ok' : 'bad',
    detail: `${platform} ${arch} · ${os.version() || release}`,
    required: true,
    hint: windowsSupported ? '' : '当前构建仅支持 Windows x64；ARM64 需要单独验证'
  });
  checks.push({
    id: 'windows-build',
    label: 'Windows 版本',
    state: windowsSupported && windowsVersion >= 22000 ? 'ok' : windowsSupported ? 'warn' : 'bad',
    detail: windowsSupported ? `Windows build ${windowsVersion || 'unknown'}（建议 Windows 11 22000+）` : '非 Windows',
    required: true,
    hint: windowsSupported && windowsVersion < 22000 ? 'Windows 10 可能可用，但本项目只在 Windows 11 上验证' : ''
  });

  const nodeVersion = process.versions.node;
  checks.push({
    id: 'node',
    label: 'Node.js 运行时',
    state: compareVersion(nodeVersion, '22.13.0') >= 0 ? 'ok' : 'bad',
    detail: `内置/当前 Node ${nodeVersion}`,
    required: true,
    hint: compareVersion(nodeVersion, '22.13.0') >= 0 ? '' : 'qq-bridge 要求 Node >=22.13；SnowLuma Lite 要求 24+'
  });

  const [npmProbe, gitProbe, pythonProbe] = await Promise.all([
    commandOnPath('npm'),
    commandOnPath('git'),
    commandOnPath('python')
  ]);
  checks.push({
    id: 'npm', label: 'npm', state: npmProbe.ok ? 'ok' : 'warn',
    detail: npmProbe.ok ? npmProbe.output : '未在 PATH 找到',
    required: false, hint: '仅 qq-bridge 自动安装源码依赖时需要'
  });
  checks.push({
    id: 'git', label: 'Git', state: gitProbe.ok ? 'ok' : 'warn',
    detail: gitProbe.ok ? gitProbe.output : '未在 PATH 找到',
    required: false, hint: '本安装器使用 GitHub zip，不要求 Git'
  });
  checks.push({
    id: 'python', label: 'Python', state: pythonProbe.ok ? 'ok' : 'ok',
    detail: pythonProbe.ok ? pythonProbe.output : '未安装（三件套不要求 Python）',
    required: false, hint: '不是本项目的运行依赖'
  });

  const snowRoot = settingsSafe.snowlumaRoot || '';
  const snowNode = path.join(snowRoot, 'node.exe');
  const snowEntry = path.join(snowRoot, 'index.mjs');
  const snowRelease = readJson(path.join(snowRoot, 'release.json'));
  const snowVersion = snowRelease.ok ? String(snowRelease.value?.version || '') : '';
  const snowConfig = path.join(snowRoot, 'config', 'webui.json');
  const snowConfigured = exists(snowConfig);
  const snowService = services.get('snowluma');
  const snowRunning = snowService?.state === 'running';
  let snowStatus;
  let snowReason;
  if (!exists(snowNode) || !exists(snowEntry)) {
    snowStatus = STATUS.NOT_INSTALLED;
    snowReason = `未找到 ${snowNode} 或 index.mjs`;
  } else if (snowVersion && compareVersion(snowVersion, '2.0.0') < 0) {
    snowStatus = STATUS.INCOMPATIBLE;
    snowReason = `检测到 SnowLuma ${snowVersion}，当前集成按 2.x 验证`;
  } else if (!snowConfigured) {
    snowStatus = STATUS.INSTALLED_UNCONFIGURED;
    snowReason = '已找到程序，但缺少 config/webui.json；需要先完成 WebUI 首次初始化';
  } else if (!snowRunning) {
    snowStatus = STATUS.CONFIGURED_NOT_RUNNING;
    snowReason = snowService?.detail || '已配置，但 5099/3000/3001 未全部在线';
  } else {
    snowStatus = STATUS.RUNNING;
    snowReason = 'WebUI/OneBot 端口在线';
  }
  const snow = componentResult({
    id: 'snowluma',
    name: 'SnowLuma',
    status: snowStatus,
    version: snowVersion || 'unknown',
    root: snowRoot,
    executable: snowNode,
    configured: snowConfigured,
    running: snowRunning,
    reason: snowReason,
    nextAction: snowStatus === STATUS.NOT_INSTALLED
      ? '使用官方 Windows 发行包手动解压安装；本项目不会自动下载/部署 SnowLuma'
      : snowStatus === STATUS.INSTALLED_UNCONFIGURED
        ? '启动 SnowLuma 并完成 WebUI 首次登录/改密'
        : snowStatus === STATUS.CONFIGURED_NOT_RUNNING
          ? '在服务页启动 SnowLuma，并等待 3000/3001 就绪'
          : '',
    manualOnly: true,
    license: 'SnowLuma Source-Available Non-Commercial License / EULA',
    official: {
      project: 'https://github.com/SnowLuma/SnowLuma',
      releases: 'https://github.com/SnowLuma/SnowLuma/releases',
      license: 'https://github.com/SnowLuma/SnowLuma/blob/main/LICENSE',
      eula: 'https://github.com/SnowLuma/SnowLuma/blob/main/EULA.md'
    }
  });

  const bridgeRoot = settingsSafe.repoRoot || '';
  const bridgePackage = readJson(path.join(bridgeRoot, 'package.json'));
  const bridgeConfig = path.join(bridgeRoot, 'config.json');
  const bridgeConfigJson = readJson(bridgeConfig);
  const bridgeConfigValid = bridgeConfigJson.ok
    && Number(bridgeConfigJson.value?.ownerQQ) > 0
    && Boolean(bridgeConfigJson.value?.dsh?.baseUrl)
    && Boolean(bridgeConfigJson.value?.snowluma?.wsUrl);
  const bridgeEntry = path.join(bridgeRoot, 'src', 'bridge.js');
  const bridgeToken = path.join(bridgeRoot, 'state', 'console-token');
  const bridgeVersion = bridgePackage.ok ? String(bridgePackage.value?.version || '') : '';
  const bridgeConfigured = exists(bridgeConfig) && bridgeConfigValid;
  const bridgeService = services.get('bridge');
  const bridgeRunning = bridgeService?.state === 'running';
  const bridgeNodeMin = bridgePackage.ok ? String(bridgePackage.value?.engines?.node || '>=22.13.0') : '>=22.13.0';
  const bridgeNodeOk = compareVersion(nodeVersion, bridgeNodeMin.replace(/[^\d.]/g, '')) >= 0;
  let bridgeStatus;
  let bridgeReason;
  if (!exists(bridgeEntry) || !bridgePackage.ok) {
    bridgeStatus = STATUS.NOT_INSTALLED;
    bridgeReason = `未找到 ${bridgeEntry} 或 package.json`;
  } else if (!bridgeNodeOk) {
    bridgeStatus = STATUS.INCOMPATIBLE;
    bridgeReason = `qq-bridge 要求 Node ${bridgeNodeMin}，当前 ${nodeVersion}`;
  } else if (!bridgeConfigured) {
    bridgeStatus = STATUS.INSTALLED_UNCONFIGURED;
    bridgeReason = exists(bridgeConfig)
      ? 'config.json 存在，但 ownerQQ / dsh.baseUrl / snowluma.wsUrl 不完整或无效'
      : '已找到源码，但缺少 config.json';
  } else if (!bridgeRunning) {
    bridgeStatus = STATUS.CONFIGURED_NOT_RUNNING;
    bridgeReason = bridgeService?.detail || '已配置，但 3100/3080 未在线';
  } else {
    bridgeStatus = STATUS.RUNNING;
    bridgeReason = '控制台/relay 端口在线';
  }
  const bridge = componentResult({
    id: 'bridge',
    name: 'qq-bridge',
    status: bridgeStatus,
    version: bridgeVersion || 'unknown',
    root: bridgeRoot,
    executable: process.execPath,
    configured: bridgeConfigured,
    running: bridgeRunning,
    tokenReady: exists(bridgeToken),
    reason: bridgeReason,
    nextAction: bridgeStatus === STATUS.NOT_INSTALLED
      ? '可从官方源码归档自动安装（需 npm、网络），或手动 clone 后 npm install'
      : bridgeStatus === STATUS.INSTALLED_UNCONFIGURED
        ? '复制 config.example.json 为 config.json 并按文档填写'
        : bridgeStatus === STATUS.CONFIGURED_NOT_RUNNING
          ? '在服务页启动 bridge，并确认 SnowLuma/DSH 已就绪'
          : '',
    manualOnly: false,
    license: 'MIT（上游 qq-bridge）',
    official: {
      project: 'https://github.com/Derpyu520/qq-bridge',
      releases: 'https://github.com/Derpyu520/qq-bridge/releases',
      license: 'https://github.com/Derpyu520/qq-bridge/blob/main/LICENSE'
    }
  });

  const dshExe = settingsSafe.dshExe || '';
  const dshDir = dshExe ? path.dirname(dshExe) : '';
  const dshConfig = dshConfigDir || path.join(os.homedir(), '.dsh');
  const dshService = services.get('dsh');
  const dshRunning = dshService?.state === 'running';
  let dshStatus;
  let dshReason;
  if (!dshExe || !exists(dshExe)) {
    dshStatus = STATUS.NOT_INSTALLED;
    dshReason = '未找到配置的 DeepSeek Harness.exe';
  } else if (!exists(dshConfig)) {
    dshStatus = STATUS.INSTALLED_UNCONFIGURED;
    dshReason = '已找到 DSH，但尚未发现 ~/.dsh 配置目录（首次启动后才会生成）';
  } else if (!dshRunning) {
    dshStatus = STATUS.CONFIGURED_NOT_RUNNING;
    dshReason = dshService?.detail || 'DSH 未运行';
  } else {
    dshStatus = STATUS.RUNNING;
    dshReason = 'DSH 桌面进程/动态端口在线';
  }
  const dsh = componentResult({
    id: 'dsh',
    name: 'DeepSeek Harness',
    status: dshStatus,
    version: 'unknown',
    root: dshDir,
    executable: dshExe,
    configured: exists(dshConfig),
    running: dshRunning,
    reason: dshReason,
    nextAction: dshStatus === STATUS.NOT_INSTALLED
      ? '使用官方安装包安装 DSH；本安装器不提供自动安装'
      : dshStatus === STATUS.INSTALLED_UNCONFIGURED
        ? '手动启动 DSH 一次，完成初始化后重新检测'
        : dshStatus === STATUS.CONFIGURED_NOT_RUNNING
          ? '启动 DSH 桌面应用并等待 3080/动态端口就绪'
          : '',
    manualOnly: true,
    license: 'MIT（上游 deepseek-harness 仓库）；桌面发行包以官方为准',
    official: {
      project: 'https://github.com/deepseek-ai/deepseek-harness',
      homepage: 'https://deepseek.com/harness'
    }
  });

  const components = [snow, bridge, dsh];
  const blocking = components.filter((item) => [STATUS.NOT_INSTALLED, STATUS.INCOMPATIBLE, STATUS.UNKNOWN].includes(item.status));
  const pending = components.filter((item) => [STATUS.INSTALLED_UNCONFIGURED, STATUS.CONFIGURED_NOT_RUNNING].includes(item.status));

  let network = { state: 'skipped', targets: [] };
  if (checkNetwork) {
    const targets = [
      { id: 'snowluma', label: 'SnowLuma Releases', url: 'https://github.com/SnowLuma/SnowLuma/releases' },
      { id: 'qq-bridge', label: 'qq-bridge 源码归档', url: 'https://github.com/Derpyu520/qq-bridge' },
      { id: 'dsh', label: 'DSH 官网', url: 'https://deepseek.com/harness' }
    ];
    const results = await Promise.all(targets.map(async (target) => ({ ...target, ...(await checkHttps(target.url)) })));
    network = {
      state: results.every((item) => item.state === 'reachable') ? 'reachable' : results.some((item) => item.state === 'reachable') ? 'partial' : 'unknown',
      targets: results
    };
  }

  return {
    checkedAt: now(),
    os: { platform, arch, release, version: os.version(), supported: windowsSupported, windowsBuild: windowsVersion },
    checks,
    components,
    network,
    summary: {
      total: components.length,
      running: components.filter((item) => item.status === STATUS.RUNNING).length,
      blocking: blocking.map((item) => item.id),
      pending: pending.map((item) => item.id),
      ready: components.length === 3 && components.every((item) => item.status === STATUS.RUNNING)
    }
  };
}

module.exports = { detectEnvironment, STATUS, STATUS_LABELS, compareVersion, checkHttps };
