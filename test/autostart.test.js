'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createAutostart, buildManagerCommand } = require('../src/main/autostart');

function tempState() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-autostart-'));
  return path.join(dir, 'autostart.json');
}

function fakeBackend(initial = null) {
  const backend = {
    task: initial,
    created: 0,
    removed: 0,
    failVerify: false,
    query: async () => backend.task,
    create: async ({ name, command }) => {
      if (backend.task) throw new Error('task already exists');
      backend.created += 1;
      backend.task = { name, command, schedule: '登录时', status: 'Ready', runAs: 'admin' };
    },
    remove: async () => {
      backend.removed += 1;
      backend.task = null;
    }
  };
  return backend;
}

const exe = 'C:\\Users\\admin\\dafiyu-desktop\\DeepSeek Harness.exe';

test('任务不存在时注册成功并记录所有权', async () => {
  const stateFile = tempState();
  const backend = fakeBackend();
  const autostart = createAutostart({ backend, stateFile, exePath: exe });
  const before = await autostart.status();
  assert.equal(before.state, 'absent');

  const result = await autostart.ensure();
  assert.equal(result.ok, true);
  assert.equal(result.action, 'created');
  const after = await autostart.status();
  assert.equal(after.state, 'registered');
  assert.equal(after.owned, true);
  assert.equal(backend.created, 1);
});

test('重复注册幂等：已注册时再次调用不重复创建', async () => {
  const stateFile = tempState();
  const backend = fakeBackend();
  const autostart = createAutostart({ backend, stateFile, exePath: exe });
  await autostart.ensure();
  const second = await autostart.ensure();
  assert.equal(second.action, 'already');
  assert.equal(backend.created, 1);
});

test('同名任务命令不同 → 冲突，拒绝覆盖', async () => {
  const stateFile = tempState();
  const backend = fakeBackend({ name: 'DafiyuManager', command: '"C:\\Other\\app.exe" --hidden', schedule: '登录时' });
  const autostart = createAutostart({ backend, stateFile, exePath: exe });
  const status = await autostart.status();
  assert.equal(status.state, 'conflict');
  const result = await autostart.ensure();
  assert.equal(result.ok, false);
  assert.equal(backend.created, 0);
  assert.ok(backend.task.command.includes('Other'));
});

test('注册后核验失败会回滚本次创建', async () => {
  const stateFile = tempState();
  const backend = fakeBackend();
  const autostart = createAutostart({ backend, stateFile, exePath: exe });
  const originalQuery = backend.query;
  let calls = 0;
  backend.query = async (name) => {
    calls += 1;
    if (calls > 1) return null; // 创建后核验拿不到任务
    return originalQuery(name);
  };
  const result = await autostart.ensure();
  assert.equal(result.ok, false);
  assert.equal(result.action, 'rolled-back');
  assert.equal(backend.removed, 1);
  assert.equal(fs.existsSync(stateFile), false);
});

test('只删除本软件创建的任务；外部任务拒绝删除', async () => {
  const stateFile = tempState();
  const external = { name: 'DafiyuManager', command: `"${exe}" --hidden`, schedule: '登录时' };
  const backend = fakeBackend(external);
  const autostart = createAutostart({ backend, stateFile, exePath: exe });
  const status = await autostart.status();
  assert.equal(status.state, 'registered-unowned');

  const refused = await autostart.remove();
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /不是本软件注册/);
  assert.ok(backend.task);
});

test('已注册且由本软件创建时注销成功', async () => {
  const stateFile = tempState();
  const backend = fakeBackend();
  const autostart = createAutostart({ backend, stateFile, exePath: exe });
  await autostart.ensure();
  const result = await autostart.remove();
  assert.equal(result.ok, true);
  assert.equal(result.action, 'removed');
  assert.equal(backend.task, null);
  assert.equal((await autostart.status()).state, 'absent');
});

test('状态文件损坏时按“非本软件创建”处理，不误删', async () => {
  const stateFile = tempState();
  fs.writeFileSync(stateFile, '{ broken json', 'utf8');
  const backend = fakeBackend({ name: 'DafiyuManager', command: `"${exe}" --hidden`, schedule: '登录时' });
  const autostart = createAutostart({ backend, stateFile, exePath: exe });
  const status = await autostart.status();
  assert.equal(status.state, 'registered-unowned');
  const result = await autostart.remove();
  assert.equal(result.ok, false);
  assert.ok(backend.task);
});

test('并发调用 ensure 只会创建一次任务', async () => {
  const stateFile = tempState();
  const backend = fakeBackend();
  const originalCreate = backend.create;
  backend.create = async (payload) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return originalCreate(payload);
  };
  const autostart = createAutostart({ backend, stateFile, exePath: exe });
  const [a, b] = await Promise.all([autostart.ensure(), autostart.ensure()]);
  assert.equal(backend.created, 1);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
});

test('权限不足（拒绝访问）时返回错误而不是误判任务不存在', async () => {
  const stateFile = tempState();
  const backend = fakeBackend();
  backend.query = async () => { throw new Error('Access is denied.'); };
  const autostart = createAutostart({ backend, stateFile, exePath: exe });
  const status = await autostart.status();
  assert.equal(status.state, 'error');
  assert.match(status.reason, /denied/i);
  const result = await autostart.ensure();
  assert.equal(result.ok, false);
  assert.equal(backend.created, 0);
});

test('可执行文件路径含空格时命令带引号且带 --hidden', () => {
  const command = buildManagerCommand('C:\\Program Files\\Dafiyu\\app.exe');
  assert.equal(command, '"C:\\Program Files\\Dafiyu\\app.exe" --hidden');
});
