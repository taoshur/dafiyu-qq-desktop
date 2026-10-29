'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { detectEnvironment, STATUS, compareVersion } = require('../src/main/environment');
const { planFor, validateTargetDir } = require('../src/main/install-catalog');
const { createInstallManager } = require('../src/main/install-task');
const { createPaths } = require('../src/main/paths');

function makeWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-env-'));
  const snow = path.join(root, 'SnowLuma');
  const bridge = path.join(root, 'qq-bridge');
  const dsh = path.join(root, 'DSH');
  fs.mkdirSync(path.join(snow, 'config'), { recursive: true });
  fs.writeFileSync(path.join(snow, 'node.exe'), '');
  fs.writeFileSync(path.join(snow, 'index.mjs'), '');
  fs.writeFileSync(path.join(snow, 'release.json'), JSON.stringify({ version: '2.2.1' }));
  fs.writeFileSync(path.join(snow, 'config', 'webui.json'), JSON.stringify({ passwordHash: 'x' }));
  fs.mkdirSync(path.join(bridge, 'src'), { recursive: true });
  fs.mkdirSync(path.join(bridge, 'state'), { recursive: true });
  fs.writeFileSync(path.join(bridge, 'package.json'), JSON.stringify({ version: '0.2.1-r1', engines: { node: '>=22.13.0' } }));
  fs.writeFileSync(path.join(bridge, 'src', 'bridge.js'), '');
  fs.writeFileSync(path.join(bridge, 'config.json'), JSON.stringify({ consolePort: 3100, ownerQQ: 123456789, dsh: { baseUrl: 'http://127.0.0.1:3080' }, snowluma: { wsUrl: 'ws://127.0.0.1:3001' } }));
  fs.writeFileSync(path.join(bridge, 'state', 'console-token'), 'test-token');
  fs.mkdirSync(dsh, { recursive: true });
  fs.writeFileSync(path.join(dsh, 'DeepSeek Harness.exe'), '');
  const dshConfig = path.join(root, '.dsh');
  fs.mkdirSync(dshConfig, { recursive: true });
  const snapshot = {
    services: [
      { id: 'snowluma', state: 'running', detail: 'OneBot v11' },
      { id: 'bridge', state: 'running', detail: 'control console' },
      { id: 'dsh', state: 'running', detail: 'DSH online' }
    ]
  };
  return { root, snow, bridge, dsh, dshConfig, settings: { snowlumaRoot: snow, repoRoot: bridge, dshExe: path.join(dsh, 'DeepSeek Harness.exe') }, snapshot };
}

test('环境检测区分运行、未配置和缺失，而不是只看进程名', async () => {
  const env = makeWorkspace();
  const result = await detectEnvironment({ settings: env.settings, snapshot: env.snapshot, checkNetwork: false, dshConfigDir: env.dshConfig });
  assert.equal(result.os.supported, true);
  assert.equal(result.components.find((x) => x.id === 'snowluma').status, STATUS.RUNNING);
  assert.equal(result.components.find((x) => x.id === 'bridge').status, STATUS.RUNNING);
  assert.equal(result.components.find((x) => x.id === 'dsh').status, STATUS.RUNNING);
  assert.equal(result.summary.running, 3);
});

test('缺失或未配置时返回具体状态和下一步', async () => {
  const env = makeWorkspace();
  fs.rmSync(path.join(env.snow, 'config', 'webui.json'));
  fs.rmSync(path.join(env.bridge, 'config.json'));
  const result = await detectEnvironment({ settings: env.settings, snapshot: { services: [] }, checkNetwork: false, dshConfigDir: env.dshConfig });
  const snow = result.components.find((x) => x.id === 'snowluma');
  const bridge = result.components.find((x) => x.id === 'bridge');
  assert.equal(snow.status, STATUS.INSTALLED_UNCONFIGURED);
  assert.match(snow.reason, /webui/);
  assert.equal(bridge.status, STATUS.INSTALLED_UNCONFIGURED);
  assert.equal(result.summary.running, 0);
});

test('版本比较和安装目录校验', () => {
  assert.equal(compareVersion('2.2.1', '2.0.0'), 1);
  assert.equal(compareVersion('1.9.9', '2.0.0'), -1);
  assert.equal(validateTargetDir('relative/path'), '安装目录必须是绝对路径');
  assert.equal(planFor({ component: 'bridge', targetDir: path.join(os.tmpdir(), 'dafiyu-install-test') }).ok, true);
  assert.equal(planFor({ component: 'snowluma' }).autoInstall, false);
});

test('安装任务拒绝未确认、重复/非自动组件', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-install-'));
  const paths = createPaths(path.join(root, 'userData'));
  const manager = createInstallManager({ paths, settings: {}, log: () => {} });
  const target = path.join(root, 'target');
  assert.equal(manager.start({ component: 'bridge', targetDir: target, confirmed: false }).ok, false);
  assert.equal(manager.start({ component: 'snowluma', targetDir: target, confirmed: true }).ok, false);
  assert.equal(manager.start({ component: 'bridge', targetDir: target, confirmed: true }).ok, true);
  const second = manager.start({ component: 'bridge', targetDir: path.join(root, 'target2'), confirmed: true });
  assert.equal(second.ok, false);
  assert.match(second.reason, /已有安装任务/);
  manager.cancel().catch(() => {});
});
