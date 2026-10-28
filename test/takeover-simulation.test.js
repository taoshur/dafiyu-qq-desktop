'use strict';

const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const { createController } = require('../src/main/control');
const { createRecoveryEngine } = require('../src/main/recovery-engine');
const { assessBusy } = require('../src/main/busy-guard');
const { setStoppedByUser, getIntent } = require('../src/main/stop-intent');
const { listProcessDetails, verifyProcess, taskkill, isAlive } = require('../src/main/proc');
const { tcpProbe } = require('../src/main/health');
const { createLease } = require('../src/main/recovery-lease');
const { createBackup, verifyBackup } = require('../src/main/backup');

const SIM_SERVICE = path.join(__dirname, '..', 'fixtures', 'sim-bridge.cjs');
const SIM_SUPERVISOR = path.join(__dirname, '..', 'fixtures', 'sim-supervisor.cjs');

function tempDir(prefix = 'dafiyu-sim-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// 测试结束兜底：清理本轮模拟进程（仅匹配 sim-bridge / sim-supervisor 的测试夹具）。
after(async () => {
  const script = [
    '$targets = Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" |',
    'Where-Object { $_.CommandLine -like "*sim-bridge.cjs*" -or $_.CommandLine -like "*sim-supervisor.cjs*" };',
    '$targets | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
  ].join(' ');
  await new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000 }, () => resolve());
  });
});

function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitPort(port, timeoutMs = 9000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await tcpProbe(port, '127.0.0.1', 300)) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

async function makeSim() {
  const root = tempDir();
  const repo = path.join(root, 'repo');
  const stateDir = path.join(root, 'manager-state');
  fs.mkdirSync(path.join(repo, 'state'), { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  const old = new Date(Date.now() - 5 * 60_000);
  for (const name of ['bridge.log', 'qq-activity.log', 'tool-calls.jsonl', 'memory.db-wal']) {
    const file = path.join(repo, 'state', name);
    fs.writeFileSync(file, 'idle\n', 'utf8');
    fs.utimesSync(file, old, old);
  }
  // 原启动链占位文件：只用于确认未被修改/删除
  const launcher = path.join(repo, 'start-qq-bridge-hidden.vbs');
  fs.writeFileSync(launcher, "' sim launcher\n", 'utf8');
  fs.writeFileSync(path.join(repo, 'start-qq-bridge-silent.cmd'), '@echo off\n', 'utf8');

  const bridgePort = await freePort();
  const snowPort = await freePort();
  const settings = {
    repoRoot: repo,
    snowlumaRoot: root,
    dshExe: process.execPath,
    controlEnabled: true,
    autoRecovery: true,
    safeMode: false
  };
  const bridgeDef = {
    id: 'bridge',
    exe: process.execPath,
    args: [SIM_SUPERVISOR, repo, String(bridgePort), SIM_SERVICE],
    cwd: repo,
    signature: 'sim-supervisor.cjs',
    ports: [bridgePort],
    waitMs: 9000,
    lockFile: path.join(repo, 'state', 'bridge.lock'),
    bridgeSignature: 'sim-bridge.cjs',
    treeExeIncludes: ['node.exe'],
    treeSignatures: ['sim-supervisor.cjs', 'sim-bridge.cjs']
  };
  const snowDef = {
    id: 'snowluma',
    exe: process.execPath,
    args: [SIM_SERVICE, String(snowPort), path.join(repo, 'state', 'snow.lock')],
    cwd: root,
    signature: 'sim-bridge.cjs',
    ports: [snowPort],
    waitMs: 9000,
    treeExeIncludes: ['node.exe'],
    treeSignatures: ['sim-bridge.cjs']
  };
  const controller = createController({
    stateDir,
    getSettings: () => settings,
    extraDefinitions: { bridge: bridgeDef, snowluma: snowDef },
    stopTimeoutMs: 1500,
    backupRoots: [],
    enforceDependencies: false,
    log: () => {}
  });
  return { root, repo, stateDir, settings, bridgePort, snowPort, controller, launcher };
}

function makeEngine(env, overrides = {}) {
  const settings = { ...env.settings, ...overrides.settings };
  const getRecords = overrides.getRecords || (() => env.controller.records());
  const probe = overrides.probe || (async (id, record) => {
    const details = await listProcessDetails();
    const check = verifyProcess(record, details);
    const def = env.controller.buildDefinitions()[id];
    let portOpen;
    if (def && def.ports && def.ports.length) {
      portOpen = false;
      for (const port of def.ports) if (await tcpProbe(port, '127.0.0.1', 400)) { portOpen = true; break; }
    }
    return { identityOk: check.ok, processAlive: Boolean(check.found), portOpen };
  });
  return createRecoveryEngine({
    stateDir: env.stateDir,
    getSettings: () => settings,
    getRecords,
    getIntent: (id) => getIntent(env.stateDir, id),
    probe,
    assessBusyFn: async () => assessBusy(env.repo),
    startService: overrides.startService || ((id) => env.controller.start(id)),
    stopService: overrides.stopService || ((id, opts) => env.controller.stop(id, opts)),
    lease: overrides.lease,
    log: () => {}
  });
}

async function killTree(env, record) {
  if (!record) return;
  if (record.child) await taskkill(record.child.pid, { force: true, tree: true });
  await taskkill(record.pid, { force: true, tree: true });
}

async function fakeWatchdog(env, { launcherOk = true } = {}) {
  const sentinel = path.join(env.repo, 'state', 'watchdog.disabled');
  if (fs.existsSync(sentinel)) return { action: 'skipped-sentinel' };
  if (await tcpProbe(env.bridgePort, '127.0.0.1', 400)) return { action: 'skipped-alive' };
  if (!launcherOk) return { action: 'failed' };
  const child = spawn(process.execPath, [SIM_SUPERVISOR, env.repo, String(env.bridgePort), SIM_SERVICE], {
    cwd: env.repo,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
  const up = await waitPort(env.bridgePort);
  return { action: up ? 'restarted' : 'failed', pid: child.pid };
}

test('管理器退出后 bridge 继续运行，下一次管理器接管记录', async () => {
  const env = await makeSim();
  let started = null;
  try {
    started = await env.controller.start('bridge');
    assert.equal(started.ok, true, started.reason);
    // 模拟管理器退出：丢弃当前 controller，新建同 stateDir 的实例
    const next = createController({
      stateDir: env.stateDir,
      getSettings: () => env.settings,
      extraDefinitions: { bridge: env.controller.buildDefinitions().bridge },
      stopTimeoutMs: 1500,
      backupRoots: [],
      log: () => {}
    });
    await next.reconcile();
    assert.equal(isAlive(started.record.pid), true, '服务应继续运行');
    assert.equal((await next.describe('bridge')).owned, true);
  } finally {
    if (started) await killTree(env, started.record);
  }
});

test('注销/重启后陈旧记录被 reconcile 丢弃', async () => {
  const env = await makeSim();
  let started = null;
  try {
    started = await env.controller.start('bridge');
    assert.equal(started.ok, true);
    await killTree(env, started.record);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const remaining = await env.controller.reconcile();
    assert.equal(remaining.bridge, undefined);
  } finally {
    if (started) await killTree(env, started.record);
  }
});

test('watchdog 存在：bridge 崩溃由 watchdog 恢复，管理器不重复接管', async () => {
  const env = await makeSim();
  let started = null;
  let dog = null;
  try {
    started = await env.controller.start('bridge');
    assert.equal(started.ok, true);
    await killTree(env, started.record);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const engine = makeEngine(env);
    const result = await engine.runOnce();
    assert.equal(result.recovered.length, 0);
    assert.ok(result.skipped.some((item) => item.id === 'bridge' && item.state === 'not-owned-by-manager'));

    dog = await fakeWatchdog(env);
    assert.equal(dog.action, 'restarted');
    assert.equal(await tcpProbe(env.bridgePort, '127.0.0.1', 500), true);
  } finally {
    if (dog && dog.pid) await taskkill(dog.pid, { force: true, tree: true });
    if (started) await taskkill(started.record.pid, { force: true, tree: true });
  }
});

test('watchdog 缺失：bridge 崩溃后没有任何自动恢复主体', async () => {
  const env = await makeSim();
  let started = null;
  try {
    started = await env.controller.start('bridge');
    assert.equal(started.ok, true);
    await killTree(env, started.record);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const engine = makeEngine(env);
    const result = await engine.runOnce();
    assert.equal(result.recovered.length, 0);
    assert.ok(result.skipped.some((item) => item.state === 'not-owned-by-manager'));
    assert.equal(await tcpProbe(env.bridgePort, '127.0.0.1', 400), false);

    const states = await engine.classifyAll();
    assert.ok(states.some((item) => item.id === 'bridge' && item.owner === 'watchdog'));
  } finally {
    if (started) await killTree(env, started.record);
  }
});

test('watchdog 失效：不会触发管理器越权接管 bridge', async () => {
  const env = await makeSim();
  let started = null;
  try {
    started = await env.controller.start('bridge');
    assert.equal(started.ok, true);
    await killTree(env, started.record);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const dog = await fakeWatchdog(env, { launcherOk: false });
    assert.equal(dog.action, 'failed');
    const engine = makeEngine(env);
    const result = await engine.runOnce();
    assert.equal(result.recovered.length, 0);
    assert.equal(await tcpProbe(env.bridgePort, '127.0.0.1', 400), false);
  } finally {
    if (started) await killTree(env, started.record);
  }
});

test('SnowLuma：管理器托管时崩溃会被恢复，且只恢复一次', async () => {
  const env = await makeSim();
  let started = null;
  try {
    started = await env.controller.start('snowluma');
    assert.equal(started.ok, true, started.reason);
    await killTree(env, started.record);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const engine = makeEngine(env);
    const first = await engine.runOnce();
    assert.equal(first.recovered.length, 1, JSON.stringify(first));
    assert.equal(await tcpProbe(env.snowPort, '127.0.0.1', 500), true);

    const second = await engine.runOnce();
    assert.equal(second.recovered.length, 0, '已恢复的服务不应重复启动');
  } finally {
    const record = env.controller.records().snowluma;
    if (record) await killTree(env, record);
    if (started) await killTree(env, started.record);
  }
});

test('SnowLuma：用户主动停止后不会被自动恢复', async () => {
  const env = await makeSim();
  let started = null;
  try {
    started = await env.controller.start('snowluma');
    assert.equal(started.ok, true);
    setStoppedByUser(env.stateDir, 'snowluma', { reason: 'test' });
    await killTree(env, started.record);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const engine = makeEngine(env);
    const result = await engine.runOnce();
    assert.equal(result.recovered.length, 0);
    assert.ok(result.skipped.some((item) => item.id === 'snowluma' && item.state === 'stopped-by-user'));
  } finally {
    if (started) await killTree(env, started.record);
  }
});

test('SnowLuma：外部启动（无记录）不会被管理器自动接管', async () => {
  const env = await makeSim();
  const child = spawn(process.execPath, [SIM_SERVICE, String(env.snowPort), path.join(env.repo, 'state', 'snow.lock')], {
    cwd: env.root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
  try {
    const engine = makeEngine(env);
    const result = await engine.runOnce();
    assert.equal(result.recovered.length, 0);
    assert.equal(result.checked, 0, '没有托管记录时不应检查/触碰外部进程');
  } finally {
    await taskkill(child.pid, { force: true, tree: true });
  }
});

test('BusyGuard busy 时阻止 SnowLuma 自动恢复', async () => {
  const env = await makeSim();
  let started = null;
  try {
    started = await env.controller.start('snowluma');
    assert.equal(started.ok, true);
    await killTree(env, started.record);
    fs.writeFileSync(path.join(env.repo, 'state', 'bridge.log'), 'fresh', 'utf8');

    const engine = makeEngine(env);
    const result = await engine.runOnce();
    assert.equal(result.recovered.length, 0);
    assert.ok(result.skipped.some((item) => item.state === 'busy-guard'));
  } finally {
    if (started) await killTree(env, started.record);
  }
});

test('恢复状态文件损坏时隔离并继续恢复', async () => {
  const env = await makeSim();
  let started = null;
  try {
    started = await env.controller.start('snowluma');
    assert.equal(started.ok, true);
    await killTree(env, started.record);
    fs.writeFileSync(path.join(env.stateDir, 'recovery-state.json'), '{ broken', 'utf8');

    const engine = makeEngine(env);
    const result = await engine.runOnce();
    assert.equal(result.recovered.length, 1);
    assert.ok(fs.readdirSync(env.stateDir).some((name) => name.includes('.corrupt-')));
  } finally {
    const record = env.controller.records().snowluma;
    if (record) await killTree(env, record);
    if (started) await killTree(env, started.record);
  }
});

test('恢复租约被外部持有时不进行恢复', async () => {
  const env = await makeSim();
  let started = null;
  try {
    started = await env.controller.start('snowluma');
    assert.equal(started.ok, true);
    await killTree(env, started.record);
    const other = createLease({ file: path.join(env.stateDir, 'recovery-lease.json'), ownerId: 'watchdog-sim', ttlMs: 60000 });
    assert.equal(other.acquire().acquired, true);

    const engine = makeEngine(env);
    const result = await engine.runOnce();
    assert.equal(result.recovered.length, 0);
    assert.equal(result.lease, 'held');
  } finally {
    if (started) await killTree(env, started.record);
  }
});

test('接管中途失败会回滚，且原启动链文件保持不变', async () => {
  const env = await makeSim();
  const before = fs.readFileSync(env.launcher, 'utf8');
  const badDef = {
    id: 'bridge',
    exe: process.execPath,
    args: [path.join(__dirname, '..', 'fixtures', 'exit-immediately.cjs')],
    cwd: env.root,
    signature: 'exit-immediately.cjs',
    ports: [],
    waitMs: 2000,
    treeExeIncludes: ['node.exe'],
    treeSignatures: ['exit-immediately.cjs']
  };
  const controller = createController({
    stateDir: path.join(env.root, 'bad-state'),
    getSettings: () => env.settings,
    extraDefinitions: { bridge: badDef },
    stopTimeoutMs: 1000,
    backupRoots: [],
    enforceDependencies: false,
    log: () => {}
  });
  const failed = await controller.start('bridge');
  assert.equal(failed.ok, false);
  assert.equal(failed.rolledBack, true);
  assert.equal(fs.readFileSync(env.launcher, 'utf8'), before, '原启动链不得被修改');
  assert.ok(fs.existsSync(path.join(env.repo, 'start-qq-bridge-silent.cmd')));
});

test('隔离副本中验证 SQLite WAL 一致性备份包含未合并数据', () => {
  const repo = tempDir('dafiyu-sim-backup-');
  fs.mkdirSync(path.join(repo, 'state'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'roles'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'config.json'), JSON.stringify({ ownerQQ: 1 }), 'utf8');
  fs.writeFileSync(path.join(repo, 'roles', 'x.md'), '# x', 'utf8');

  const dbPath = path.join(repo, 'state', 'memory.db');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('CREATE TABLE traits (id INTEGER PRIMARY KEY, trait_key TEXT);');
  db.prepare('INSERT INTO traits VALUES (1, ?)').run('cute');
  db.close();

  // 保持一个写入连接打开，让 WAL 中留有已提交数据
  const writer = new DatabaseSync(dbPath);
  writer.exec('PRAGMA journal_mode=WAL');
  writer.prepare('INSERT INTO traits VALUES (2, ?)').run('curious');
  assert.ok(fs.existsSync(dbPath + '-wal'));

  const result = createBackup({ repoRoot: repo, appVersion: 'sim' });
  writer.close();

  assert.equal(result.verify.ok, true);
  const backupDb = new DatabaseSync(path.join(result.dir, 'memory.db'), { readOnly: true });
  assert.equal(backupDb.prepare('SELECT COUNT(*) c FROM traits').get().c, 2, 'WAL 中已提交的数据必须进入备份');
  assert.equal(backupDb.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  backupDb.close();

  const restore = tempDir('dafiyu-sim-restore-');
  fs.cpSync(result.dir, restore, { recursive: true });
  assert.equal(verifyBackup(restore).ok, true);
});
