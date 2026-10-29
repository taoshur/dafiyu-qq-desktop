'use strict';

const fs = require('node:fs');
const path = require('node:path');

// 只登记经过核对的官方来源。没有可验证来源的组件不提供自动安装。
const QQ_BRIDGE = Object.freeze({
  id: 'bridge',
  name: 'qq-bridge',
  version: 'v0.2.0-r4 (Memory V3)',
  kind: 'bundled-source',
  bundled: true,
  url: null,
  sha256: null,
  size: 3802044,
  archiveRoot: null,
  defaultSubdir: 'qq-bridge',
  license: 'MIT',
  upstream: 'https://github.com/Derpyu520/qq-bridge',
  nodeMin: '22.13.0',
  autoInstall: true,
  requiresLicenseAcceptance: false,
  configExample: 'config.example.json',
  configFile: 'config.json',
  entry: ['src', 'bridge.js'],
  verifyEntries: ['package.json', 'src/bridge.js', 'node_modules']
});

const SNOWLUMA = Object.freeze({
  id: 'snowluma',
  name: 'SnowLuma',
  version: 'v2.2.1',
  kind: 'binary-zip',
  url: 'https://github.com/SnowLuma/SnowLuma/releases/download/v2.2.1/SnowLuma-v2.2.1-win-x64.zip',
  sha256: '09A3FBBF42EA805C4D61B5E67BEC2A46EF341FA803F211D78C40796CB7F535DC',
  size: 43015802,
  archiveRoot: null,
  defaultSubdir: 'SnowLuma',
  license: 'SnowLuma Source-Available Non-Commercial License / EULA',
  upstream: 'https://github.com/SnowLuma/SnowLuma',
  autoInstall: true,
  requiresLicenseAcceptance: true,
  licenseLinks: {
    license: 'https://github.com/SnowLuma/SnowLuma/blob/main/LICENSE',
    eula: 'https://github.com/SnowLuma/SnowLuma/blob/main/EULA.md',
    releases: 'https://github.com/SnowLuma/SnowLuma/releases'
  },
  entry: ['index.mjs'],
  verifyEntries: ['node.exe', 'index.mjs', 'launcher.bat', 'EULA.md']
});

const MANUAL = Object.freeze({
  dsh: {
    id: 'dsh',
    name: 'DeepSeek Harness',
    autoInstall: false,
    reason: '官方仓库没有提供可用于静默安装的 Release 资产；DSH 是独立桌面应用，需要手动完成安装和首次初始化。',
    official: {
      project: 'https://github.com/deepseek-ai/deepseek-harness',
      homepage: 'https://deepseek.com/harness'
    }
  }
});

function defaultInstallRoot() {
  const base = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || process.cwd(), 'AppData', 'Local');
  return path.join(base, 'Dafiyu', 'components');
}

function catalogFor(id) {
  if (id === 'bridge') return QQ_BRIDGE;
  if (id === 'snowluma') return SNOWLUMA;
  return MANUAL[id] || null;
}

function validateTargetDir(targetDir) {
  if (typeof targetDir !== 'string' || !path.isAbsolute(targetDir)) return '安装目录必须是绝对路径';
  if (targetDir.includes('\0')) return '安装目录包含非法字符';
  const resolved = path.resolve(targetDir);
  if (resolved.length > 240) return '安装目录过长';
  if (path.parse(resolved).root === resolved) return '不能直接安装到磁盘根目录';
  try {
    if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) return '目标路径已存在且不是目录';
  } catch (error) {
    return `无法访问安装目录：${error.message}`;
  }
  return null;
}

function planFor({ component, targetDir, settings = {} }) {
  const item = catalogFor(component);
  if (!item) return { ok: false, reason: '未知组件' };
  if (!item.autoInstall) {
    return {
      ok: false,
      component,
      autoInstall: false,
      reason: item.reason,
      official: item.official
    };
  }
  const dir = targetDir || path.join(defaultInstallRoot(), item.defaultSubdir || '');
  const invalid = validateTargetDir(dir);
  if (invalid) return { ok: false, component, reason: invalid };
  return {
    ok: true,
    component,
    autoInstall: true,
    targetDir: path.resolve(dir),
    version: item.version,
    bundled: item.bundled === true,
    url: item.url,
    sha256: item.sha256,
    size: item.size || 0,
    license: item.license,
    upstream: item.upstream,
    requiresLicenseAcceptance: item.requiresLicenseAcceptance === true,
    licenseLinks: item.licenseLinks || null,
    steps: item.bundled
      ? ['check', 'copy', 'dependencies', 'configure', 'verify']
      : ['check', 'download', 'verify', 'extract', ...(item.kind === 'source-archive' ? ['dependencies'] : []), 'configure', 'verify']
  };
}

module.exports = { QQ_BRIDGE, SNOWLUMA, MANUAL, catalogFor, defaultInstallRoot, planFor, validateTargetDir };
