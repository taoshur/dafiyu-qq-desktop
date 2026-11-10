'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RUNTIME_ENTRIES = [
  'EULA.md',
  'PRIVACY.md',
  'check-node-version.cjs',
  'client',
  'index.mjs',
  'launcher.bat',
  'native',
  'node.exe',
  'package.json',
  'release.json'
];

function sourceCandidates() {
  const list = [
    path.join(process.resourcesPath || '', 'SnowLuma'),
    path.join(__dirname, '..', '..', 'vendor', 'SnowLuma')
  ];
  return [...new Set(list.filter(Boolean))];
}

function hasRuntime(root) {
  return Boolean(root) && fs.existsSync(path.join(root, 'index.mjs')) && fs.existsSync(path.join(root, 'node.exe'));
}

/**
 * Install the SnowLuma runtime bundled with the manager on first run.
 * config/, data/ and logs/ are deliberately excluded: they contain QQ login state
 * and private user data, and must never be copied from the build machine.
 */
function provisionBundledSnowLuma(targetRoot, { log = () => {} } = {}) {
  const target = String(targetRoot || '').trim();
  if (!target) return { ok: false, reason: 'SnowLuma 路径为空' };
  if (hasRuntime(target)) return { ok: true, skipped: true, target };
  const source = sourceCandidates().find(hasRuntime);
  if (!source) return { ok: false, reason: '安装包未包含 SnowLuma 运行包' };
  try {
    fs.mkdirSync(target, { recursive: true });
    for (const name of RUNTIME_ENTRIES) {
      const from = path.join(source, name);
      if (!fs.existsSync(from)) continue;
      fs.cpSync(from, path.join(target, name), { recursive: true, force: true });
    }
    log('component', `bundled SnowLuma runtime copied: ${source} -> ${target}`);
    return { ok: true, copied: true, source, target };
  } catch (error) {
    try { log('error', `bundled SnowLuma copy failed: ${error.message}`); } catch { /* ignore */ }
    return { ok: false, reason: error.message, source, target };
  }
}

module.exports = { provisionBundledSnowLuma, RUNTIME_ENTRIES };
