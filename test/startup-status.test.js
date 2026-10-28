'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createStartupStatus } = require('../src/main/startup-status');

function makeStartupDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-startup-'));
}

function statusWith(tasks, startupDir, managerExe = 'C:\\App\\Dafiyu.exe') {
  return createStartupStatus({
    queryTask: async (name) => tasks[name] ?? null,
    startupDir,
    managerExe
  });
}

test('原自启已禁用、SnowLuma 启动项已移除、管理器未注册', async () => {
  const dir = makeStartupDir();
  const status = await statusWith({
    'qq-bridge': { state: 'Disabled' },
    'qq-bridge-watchdog': { state: 'Disabled' },
    DafiyuManager: null
  }, dir)();
  assert.equal(status.qqBridge.enabled, false);
  assert.equal(status.watchdog.enabled, false);
  assert.equal(status.snowlumaStartup.exists, false);
  assert.equal(status.originalAutostartDisabled, true);
  assert.equal(status.managerAutostartReady, false);
});

test('原自启仍启用时不会被误报为已禁用', async () => {
  const dir = makeStartupDir();
  fs.writeFileSync(path.join(dir, 'snowluma-start.vbs'), '', 'utf8');
  const status = await statusWith({
    'qq-bridge': { state: 'Ready' },
    'qq-bridge-watchdog': { state: 'Ready' }
  }, dir)();
  assert.equal(status.qqBridge.enabled, true);
  assert.equal(status.snowlumaStartup.exists, true);
  assert.equal(status.originalAutostartDisabled, false);
});

test('管理器任务命令匹配时才视为已注册可用', async () => {
  const dir = makeStartupDir();
  const managerExe = 'C:\\App\\Dafiyu.exe';
  const matching = await statusWith({
    DafiyuManager: { state: 'Ready', command: `"${managerExe}" --hidden` }
  }, dir, managerExe)();
  assert.equal(matching.managerAutostartReady, true);

  const wrong = await statusWith({
    DafiyuManager: { state: 'Ready', command: '"C:\\Other\\app.exe" --hidden' }
  }, dir, managerExe)();
  assert.equal(wrong.managerAutostartReady, false);
  assert.equal(wrong.managerAutostart.exists, true);
});

test('任务查询失败会记录错误但不抛出', async () => {
  const dir = makeStartupDir();
  const status = createStartupStatus({
    queryTask: async () => { throw new Error('Access is denied.'); },
    startupDir: dir,
    managerExe: 'x'
  });
  const result = await status();
  assert.ok(result.errors.length >= 3);
  assert.equal(result.qqBridge.exists, false);
});
