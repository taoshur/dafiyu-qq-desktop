'use strict';

const fs = require('node:fs');
const path = require('node:path');

// 只登记经过核对的官方来源。没有可验证来源的组件不提供自动安装。
const QQ_BRIDGE = Object.freeze({
  id: 'bridge',
  name: 'qq-bridge',
  version: 'v0.2.1-r1',
  kind: 'source-archive',
  url: 'https://codeload.github.com/Derpyu520/qq-bridge/zip/refs/tags/v0.2.1-r1',
  sha256: '9DB4365C5816BB7FF971420423316D141B533FC66F171E2536A8B67E7D4501C9',
  archiveRoot: 'qq-bridge-0.2.1-r1',
  license: 'MIT',
  upstream: 'https://github.com/Derpyu520/qq-bridge',
  nodeMin: '22.13.0',
  autoInstall: true,
  configExample: 'config.example.json',
  configFile: 'config.json',
  entry: ['src', 'bridge.js']
});

const MANUAL = Object.freeze({
  snowluma: {
    id: 'snowluma',
    name: 'SnowLuma',
    autoInstall: false,
    reason: 'SnowLuma EULA §5.4 限制自动部署/并入第三方安装包；本项目授权范围也不包含安装与再分发。',
    official: {
      releases: 'https://github.com/SnowLuma/SnowLuma/releases',
      license: 'https://github.com/SnowLuma/SnowLuma/blob/main/LICENSE',
      eula: 'https://github.com/SnowLuma/SnowLuma/blob/main/EULA.md'
    }
  },
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
  const dir = targetDir || defaultInstallRoot();
  const invalid = validateTargetDir(dir, component);
  if (invalid) return { ok: false, component, reason: invalid };
  return {
    ok: true,
    component,
    autoInstall: true,
    targetDir: path.resolve(dir),
    version: item.version,
    url: item.url,
    sha256: item.sha256,
    license: item.license,
    upstream: item.upstream,
    steps: ['check', 'download', 'verify', 'extract', 'dependencies', 'configure', 'verify']
  };
}

module.exports = { QQ_BRIDGE, MANUAL, catalogFor, defaultInstallRoot, planFor, validateTargetDir };
