'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { createController } = require('../src/main/control');
const { isAlive, taskkill } = require('../src/main/proc');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-service.cjs');
const WRAPPER = path.join(__dirname, '..', 'fixtures', 'manager-sim.cjs');

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-lifecycle-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(path.join(repo, 'state'), { recursive: true });
  const old = new Date(Date.now() - 5 * 60_000);
  for (const name of ['bridge.log', 'qq-activity.log', 'tool-calls.jsonl', 'memory.db-wal']) {
    const file = path.join(repo, 'state', name);
    fs.writeFileSync(file, 'idle\n', 'utf8');
    fs.utimesSync(file, old, old);
  }
  return { root, repo };
}

function makeController(stateDir, repo) {
  const settings = { repoRoot: repo, snowlumaRoot: path.dirname(repo), dshExe: process.execPath, controlEnabled: true };
  const def = {
    id: 'fake',
    exe: process.execPath,
    args: [FIXTURE, 'life'],
    cwd: path.dirname(FIXTURE),
    signature: 'fake-service.cjs',
    ports: [],
    waitMs: 9000
  };
  return createController({
    stateDir,
    getSettings: () => settings,
    extraDefinitions: { fake: def },
    backupRoots: [],
    stopTimeoutMs: 1200,
    log: () => {}
  });
}

test('管理器进程退出后服务继续运行，下一次管理器可接管并停止', async () => {
  const { root, repo } = makeRepo();
  const stateDir = path.join(root, 'state-manager');
  fs.mkdirSync(stateDir, { recursive: true });
  const marker = path.join(root, 'marker.json');

  const child = spawn(process.execPath, [WRAPPER, stateDir, repo, FIXTURE, marker], {
    stdio: 'ignore',
    windowsHide: true
  });
  const code = await new Promise((resolve) => child.on('exit', resolve));
  assert.equal(code, 0);
  const result = JSON.parse(fs.readFileSync(marker, 'utf8'));
  assert.equal(result.ok, true, result.reason);
  assert.equal(isAlive(result.record.pid), true, '管理器退出后服务必须继续运行');

  const next = makeController(stateDir, repo);
  const described = await next.describe('fake');
  assert.equal(described.owned, true, '下一次管理器应能识别并接管该进程');
  const stopped = await next.stop('fake', { force: true, confirmBusy: true });
  assert.equal(stopped.ok, true, stopped.reason);
  assert.equal(isAlive(result.record.pid), false);
});

test('重启后陈旧记录会被 reconcile 丢弃（服务已不存在）', async () => {
  const { root, repo } = makeRepo();
  const stateDir = path.join(root, 'state-manager');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'services.json'), JSON.stringify({
    services: {
      fake: { id: 'fake', pid: 999999, startMs: 1, exe: 'C:\\nonexistent\\node.exe', cmdline: 'x', signature: 'x' }
    }
  }), 'utf8');

  const controller = makeController(stateDir, repo);
  const remaining = await controller.reconcile();
  assert.equal(remaining.fake, undefined);
});

test('停止后写入 stop-intent，启动成功后清除', async () => {
  const { root, repo } = makeRepo();
  const stateDir = path.join(root, 'state-manager');
  fs.mkdirSync(stateDir, { recursive: true });
  const controller = makeController(stateDir, repo);

  const started = await controller.start('fake');
  assert.equal(started.ok, true, started.reason);
  const stopped = await controller.stop('fake', { force: true, confirmBusy: true });
  assert.equal(stopped.ok, true, stopped.reason);
  const intentFile = path.join(stateDir, 'control-intent.json');
  const intent = JSON.parse(fs.readFileSync(intentFile, 'utf8'));
  assert.equal(intent.services.fake.intent, 'stopped-by-user');

  const again = await controller.start('fake');
  assert.equal(again.ok, true, again.reason);
  const after = JSON.parse(fs.readFileSync(intentFile, 'utf8'));
  assert.equal(after.services.fake, undefined);
  await taskkill(again.record.pid, { force: true, tree: true });
});
