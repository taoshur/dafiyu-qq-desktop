'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createPaths, loadSettings, saveSettings, readProjectConfig } = require('../src/main/paths');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-test-'));
}

test('readProjectConfig 只暴露端口/开关，不泄漏令牌', () => {
  const repo = tempDir();
  fs.writeFileSync(path.join(repo, 'config.json'), JSON.stringify({
    dsh: { baseUrl: 'http://127.0.0.1:3080', accessToken: 'SUPER-SECRET-DSH' },
    snowluma: {
      httpUrl: 'http://127.0.0.1:3000',
      wsUrl: 'ws://127.0.0.1:3001',
      accessToken: 'SUPER-SECRET-SNOW',
      homeDir: 'C:/SnowLuma'
    },
    consolePort: 3100,
    consoleToken: 'SUPER-SECRET-CONSOLE',
    ownerQQ: 123456789,
    socialV2: {
      growth: { observeOnly: true, dbPath: 'state/memory.db' },
      voice: { enabled: true, dir: 'audio' }
    }
  }), 'utf8');

  const summary = readProjectConfig(repo);
  assert.equal(summary.valid, true);
  assert.equal(summary.ports.snowlumaHttp, 3000);
  assert.equal(summary.ports.snowlumaWs, 3001);
  assert.equal(summary.ports.dshRelay, 3080);
  assert.equal(summary.ports.console, 3100);
  assert.equal(summary.flags.hasSnowlumaToken, true);
  assert.equal(summary.flags.hasConsoleToken, true);
  assert.equal(summary.flags.hasOwnerQQ, true);
  assert.equal(summary.flags.voiceEnabled, true);

  const text = JSON.stringify(summary);
  assert.ok(!text.includes('SUPER-SECRET'), '汇总里不能出现任何令牌原文');
  assert.ok(!/123456789/.test(text), '汇总里不能出现 ownerQQ');
});

test('缺失/损坏的 config.json 会被标为不可用而不是抛错', () => {
  const repo = tempDir();
  assert.equal(readProjectConfig(repo).valid, false);
  fs.writeFileSync(path.join(repo, 'config.json'), '{ broken json', 'utf8');
  const broken = readProjectConfig(repo);
  assert.equal(broken.exists, true);
  assert.equal(broken.valid, false);
});

test('桌面自己的配置目录与设置可往返保存', () => {
  const userData = tempDir();
  const paths = createPaths(userData);
  const defaults = loadSettings(paths);
  assert.ok(path.isAbsolute(defaults.repoRoot));
  assert.equal(defaults.ownerTitle, '爸爸');
  assert.ok(fs.existsSync(paths.configDir));
  assert.ok(fs.existsSync(paths.logDir));

  const next = {
    repoRoot: userData,
    snowlumaRoot: userData,
    dshExe: process.execPath,
    ownerTitle: '  老板\n',
    controlEnabled: true,
    managerAutostart: true,
    botAutostart: false,
    autoRecovery: true
  };
  saveSettings(paths, next);
  const loaded = loadSettings(paths);
  assert.equal(loaded.repoRoot, path.resolve(userData));
  assert.equal(loaded.snowlumaRoot, path.resolve(userData));
  assert.equal(loaded.dshExe, path.resolve(process.execPath));
  assert.equal(loaded.ownerTitle, '老板');
  assert.equal(loaded.controlEnabled, true);
  assert.equal(loaded.managerAutostart, true);
  assert.equal(loaded.botAutostart, false);
  assert.equal(loaded.autoRecovery, true);
});

test('桌面配置损坏时回退到默认值（三个开关全部关闭）', () => {
  const userData = tempDir();
  const paths = createPaths(userData);
  fs.writeFileSync(paths.configFile, '{ not valid json', 'utf8');
  const loaded = loadSettings(paths);
  assert.equal(loaded.managerAutostart, false);
  assert.equal(loaded.botAutostart, false);
  assert.equal(loaded.autoRecovery, false);
  assert.equal(loaded.controlEnabled, false);
});

test('三个开关互不联动：只打开一个不会带上其它开关', () => {
  const userData = tempDir();
  const paths = createPaths(userData);
  saveSettings(paths, { repoRoot: userData, snowlumaRoot: userData, dshExe: process.execPath, managerAutostart: true });
  const loaded = loadSettings(paths);
  assert.equal(loaded.managerAutostart, true);
  assert.equal(loaded.botAutostart, false);
  assert.equal(loaded.autoRecovery, false);
});
