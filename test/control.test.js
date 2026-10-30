'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createController } = require('../src/main/control');
const { taskkill, isAlive } = require('../src/main/proc');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'fake-service.cjs');

function makeEnv(extraDefs = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-control-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(path.join(repo, 'state'), { recursive: true });
  // 预置“空闲”信号文件（5 分钟前），让 stop 的 BusyGuard 放行。
  const old = new Date(Date.now() - 5 * 60_000);
  for (const name of ['bridge.log', 'qq-activity.log', 'tool-calls.jsonl', 'memory.db-wal']) {
    const file = path.join(repo, 'state', name);
    fs.writeFileSync(file, 'idle\n', 'utf8');
    fs.utimesSync(file, old, old);
  }
  const stateDir = path.join(root, 'desktop-state');
  fs.mkdirSync(stateDir, { recursive: true });
  const settings = { repoRoot: repo, snowlumaRoot: root, dshExe: process.execPath, controlEnabled: true };
  const fakeDef = {
    id: 'fake',
    exe: process.execPath,
    args: [FIXTURE, 'fake'],
    cwd: root,
    signature: 'fake-service.cjs',
    ports: [],
    waitMs: 9000
  };
  const bridgeDef = { ...fakeDef, id: 'bridge', args: [FIXTURE, 'bridge'] };
  const controller = createController({
    stateDir,
    getSettings: () => settings,
    extraDefinitions: { fake: fakeDef, bridge: bridgeDef, ...extraDefs },
    stopTimeoutMs: 1200,
    backupRoots: [],
    enforceDependencies: false,
    log: () => {}
  });
  return { root, repo, stateDir, settings, controller };
}

async function cleanup(env) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(env.stateDir, 'services.json'), 'utf8'));
    for (const record of Object.values(raw.services || {})) {
      if (isAlive(record.pid)) await taskkill(record.pid, { force: true, tree: true });
      if (record.child && isAlive(record.child.pid)) await taskkill(record.child.pid, { force: true, tree: true });
    }
  } catch { /* ignore */ }
}

test('真实控制未启用时拒绝启动', async () => {
  const env = makeEnv();
  env.settings.controlEnabled = false;
  const result = await env.controller.start('fake');
  assert.equal(result.ok, false);
  assert.match(result.reason, /未启用/);
});

test('启动后能识别归属，强制停止后进程消失', async () => {
  const env = makeEnv();
  try {
    const started = await env.controller.start('fake');
    assert.equal(started.ok, true, started.reason);
    assert.ok(started.record.pid > 0);
    assert.equal((await env.controller.describe('fake')).owned, true);

    const stopped = await env.controller.stop('fake', { force: true });
    assert.equal(stopped.ok, true, stopped.reason);
    assert.equal(isAlive(started.record.pid), false);
    assert.equal((await env.controller.describe('fake')).owned, false);
  } finally {
    await cleanup(env);
  }
});

test('身份校验失败时拒绝停止（模拟 PID 复用）', async () => {
  const env = makeEnv();
  try {
    const started = await env.controller.start('fake');
    assert.equal(started.ok, true);
    const stateFile = path.join(env.stateDir, 'services.json');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    state.services.fake.startMs -= 60000;
    fs.writeFileSync(stateFile, JSON.stringify(state), 'utf8');

    const stopped = await env.controller.stop('fake', { force: true });
    assert.equal(stopped.ok, false);
    assert.equal(stopped.identity, false);
    assert.equal(isAlive(started.record.pid), true, '身份不符时不得杀进程');
  } finally {
    await cleanup(env);
  }
});

test('没有启动记录的外部进程拒绝停止', async () => {
  const env = makeEnv();
  let started = null;
  try {
    started = await env.controller.start('fake');
    assert.equal(started.ok, true);
    fs.rmSync(path.join(env.stateDir, 'services.json'));
    const stopped = await env.controller.stop('fake', { force: true });
    assert.equal(stopped.ok, false);
    assert.equal(stopped.external, true);
    assert.equal(isAlive(started.record.pid), true);
  } finally {
    if (started) await taskkill(started.record.pid, { force: true, tree: true });
    await cleanup(env);
  }
});

test('正常退出超时返回 needsForce，而不是直接强杀', async () => {
  const env = makeEnv();
  try {
    const started = await env.controller.start('fake');
    assert.equal(started.ok, true);
    const stopped = await env.controller.stop('fake', { force: false });
    if (!stopped.ok) {
      assert.equal(stopped.needsForce, true);
      assert.ok(Array.isArray(stopped.alive) && stopped.alive.length > 0);
    }
  } finally {
    await cleanup(env);
  }
});

test('bridge 停止后留下 watchdog 哨兵，启动后按记录释放', async () => {
  const env = makeEnv();
  try {
    const started = await env.controller.start('bridge');
    assert.equal(started.ok, true, started.reason);
    const sentinel = path.join(env.repo, 'state', 'watchdog.disabled');
    assert.equal(fs.existsSync(sentinel), false);

    const stopped = await env.controller.stop('bridge', { force: true });
    assert.equal(stopped.ok, true, stopped.reason);
    assert.equal(fs.existsSync(sentinel), true, '停止后应保留哨兵，防止 watchdog 拉起');
    assert.equal(fs.existsSync(path.join(env.stateDir, 'watchdog-sentinel.json')), true);

    const again = await env.controller.start('bridge');
    assert.equal(again.ok, true, again.reason);
    assert.equal(fs.existsSync(sentinel), false, '本软件创建的哨兵应在启动成功后释放');
  } finally {
    await cleanup(env);
  }
});

test('用户自己设置的 watchdog 哨兵不会被删除', async () => {
  const env = makeEnv();
  try {
    const sentinel = path.join(env.repo, 'state', 'watchdog.disabled');
    fs.writeFileSync(sentinel, 'user-set', 'utf8');
    const started = await env.controller.start('bridge');
    assert.equal(started.ok, true);
    await env.controller.stop('bridge', { force: true });
    assert.equal(fs.existsSync(sentinel), true, '用户手动禁用的状态必须保留');
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'user-set');
  } finally {
    await cleanup(env);
  }
});

test('reconcile 会丢弃已消失进程的记录', async () => {
  const env = makeEnv();
  try {
    const started = await env.controller.start('fake');
    assert.equal(started.ok, true);
    await taskkill(started.record.pid, { force: true, tree: true });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const remaining = await env.controller.reconcile();
    assert.equal(remaining.fake, undefined);
  } finally {
    await cleanup(env);
  }
});

test('进程树里存在无法归属的子进程时拒绝停止', async () => {
  const parent = path.join(__dirname, '..', 'fixtures', 'fake-parent.cjs');
  const env = makeEnv({
    treebad: {
      id: 'treebad',
      exe: process.execPath,
      args: [parent],
      cwd: path.dirname(parent),
      signature: 'fake-parent.cjs',
      ports: [],
      waitMs: 9000,
      treeExeIncludes: [],
      treeSignatures: ['fake-parent.cjs']
    }
  });
  let started = null;
  try {
    started = await env.controller.start('treebad');
    assert.equal(started.ok, true, started.reason);
    const stopped = await env.controller.stop('treebad', { force: true });
    assert.equal(stopped.ok, false);
    assert.equal(stopped.treeUnverified, true);
    assert.ok(Array.isArray(stopped.unknown) && stopped.unknown.length >= 1);
    assert.equal(isAlive(started.record.pid), true, '归属不明时必须保持原样');
  } finally {
    if (started) await taskkill(started.record.pid, { force: true, tree: true });
    await cleanup(env);
  }
});

test('启动失败会自动清理残留进程并标记 rolledBack', async () => {
  const script = path.join(__dirname, '..', 'fixtures', 'exit-immediately.cjs');
  const env = makeEnv({
    bad: {
      id: 'bad',
      exe: process.execPath,
      args: [script],
      cwd: path.dirname(script),
      signature: 'exit-immediately.cjs',
      ports: [],
      waitMs: 3000
    }
  });
  try {
    const result = await env.controller.start('bad');
    assert.equal(result.ok, false);
    assert.equal(result.rolledBack, true);
    let state = { services: {} };
    try { state = JSON.parse(fs.readFileSync(path.join(env.stateDir, 'services.json'), 'utf8')); } catch { /* 失败时可能尚未写状态文件 */ }
    assert.equal(state.services.bad, undefined);
  } finally {
    await cleanup(env);
  }
});

test('哨兵恢复只处理桌面创建的哨兵，并区分桥接是否在运行', async () => {
  const env = makeEnv();
  const sentinel = path.join(env.repo, 'state', 'watchdog.disabled');
  const marker = path.join(env.stateDir, 'watchdog-sentinel.json');
  try {
    fs.writeFileSync(sentinel, '');
    fs.writeFileSync(marker, JSON.stringify({ createdByDesktop: true, createdAt: new Date().toISOString() }));
    const kept = await env.controller.recoverSentinel({ bridgeRunning: false });
    assert.equal(kept.ok, false);
    assert.equal(kept.kept, true);
    assert.equal(fs.existsSync(sentinel), true, '桥接未运行时保留哨兵，避免被 watchdog 拉起');

    const removed = await env.controller.recoverSentinel({ bridgeRunning: true });
    assert.equal(removed.ok, true);
    assert.equal(fs.existsSync(sentinel), false);
    assert.equal(fs.existsSync(marker), false);
  } finally {
    fs.rmSync(sentinel, { force: true });
    fs.rmSync(marker, { force: true });
  }

  // 用户自己设置的哨兵（没有桌面 marker）绝不能被恢复逻辑删除
  fs.writeFileSync(sentinel, 'user');
  const refused = await env.controller.recoverSentinel({ bridgeRunning: true });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /不是桌面创建/);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'user');
  fs.rmSync(sentinel, { force: true });
});

test('首次操作预检返回备份/进程/端口/watchdog/启动器/重复实例检查', async () => {
  const env = makeEnv();
  try {
    const result = await env.controller.preflight();
    const ids = result.checks.map((item) => item.id);
    assert.ok(ids.includes('backup'));
    assert.ok(ids.includes('ports'));
    assert.ok(ids.includes('watchdog'));
    assert.ok(ids.includes('launcher'));
    assert.ok(ids.includes('duplicate'));
    assert.ok(result.checks.every((item) => ['ok', 'warn', 'bad'].includes(item.state)));
  } finally {
    await cleanup(env);
  }
});

test('找不到原启动器时拒绝恢复原启动方式', async () => {
  const env = makeEnv();
  try {
    const result = await env.controller.startOriginalBridge();
    assert.equal(result.ok, false);
    assert.match(result.reason, /找不到原启动器|3100 已在监听/);
  } finally {
    await cleanup(env);
  }
});

test('用户主动停止 bridge 后拒绝用原启动方式自动拉起', async () => {
  const env = makeEnv();
  try {
    const { setStoppedByUser } = require('../src/main/stop-intent');
    setStoppedByUser(env.stateDir, 'bridge', { reason: 'user' });
    const result = await env.controller.startOriginalBridge();
    assert.equal(result.ok, false);
    assert.match(result.reason, /主动停止/);
  } finally {
    await cleanup(env);
  }
});

test('检测到忙碌时默认拒绝停止，人工确认后才继续', async () => {
  const env = makeEnv();
  let started = null;
  try {
    started = await env.controller.start('fake');
    assert.equal(started.ok, true, started.reason);
    fs.writeFileSync(path.join(env.repo, 'state', 'bridge.log'), 'fresh activity', 'utf8');

    const blocked = await env.controller.stop('fake', { force: true });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.busy, 'busy');
    assert.equal(blocked.needsConfirm, true);
    assert.equal(isAlive(started.record.pid), true);

    const confirmed = await env.controller.stop('fake', { force: true, confirmBusy: true });
    assert.equal(confirmed.ok, true, confirmed.reason);
  } finally {
    if (started) await taskkill(started.record.pid, { force: true, tree: true });
    await cleanup(env);
  }
});

test('状态未知时同样默认拒绝停止', async () => {
  const env = makeEnv();
  let started = null;
  try {
    started = await env.controller.start('fake');
    fs.rmSync(path.join(env.repo, 'state', 'tool-calls.jsonl'));
    const blocked = await env.controller.stop('fake', { force: true });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.busy, 'unknown');
    assert.equal(blocked.needsConfirm, true);
  } finally {
    if (started) await taskkill(started.record.pid, { force: true, tree: true });
    await cleanup(env);
  }
});

test('SnowLuma 未就绪时拒绝启动 bridge（依赖顺序）', async () => {
  const env = makeEnv();
  try {
    const defs = env.controller.buildDefinitions();
    defs.snowluma = { ...defs.snowluma, ports: [65534, 65535] };
    const controller = createController({
      stateDir: env.stateDir,
      getSettings: () => env.settings,
      extraDefinitions: defs,
      stopTimeoutMs: 1200,
      backupRoots: [],
      enforceDependencies: true,
      log: () => {}
    });
    const result = await controller.start('bridge');
    assert.equal(result.ok, false);
    assert.equal(result.dependency, 'snowluma');
    assert.match(result.reason, /SnowLuma/);
  } finally {
    await cleanup(env);
  }
});


test('快速退出停止路径不等待正常退出超时', async () => {
  const env = makeEnv();
  try {
    const started = await env.controller.start('fake');
    assert.equal(started.ok, true, started.reason);
    const at = Date.now();
    const stopped = await env.controller.stop('fake', { force: true, confirmBusy: true, ignoreEnabled: true, fast: true });
    const elapsed = Date.now() - at;
    assert.equal(stopped.ok, true, stopped.reason);
    assert.ok(elapsed < 4000, `fast stop took ${elapsed}ms`);
    assert.equal(isAlive(started.record.pid), false);
  } finally {
    await cleanup(env);
  }
});
