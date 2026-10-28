'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createRecoveryEngine } = require('../src/main/recovery-engine');

function setup(overrides = {}) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-recovery-'));
  const settings = { autoRecovery: true, controlEnabled: true, safeMode: false, ...(overrides.settings || {}) };
  const health = { identityOk: true, processAlive: false, portOpen: false, ...(overrides.health || {}) };
  const calls = { start: 0, stop: 0 };
  let intent = overrides.intent || null;
  let nowValue = overrides.now || Date.now();
  const lease = overrides.lease || {
    acquire: () => ({ acquired: true, reason: 'test' }),
    heartbeat: () => ({ ok: true }),
    release: () => ({ ok: true })
  };

  const engine = createRecoveryEngine({
    stateDir,
    getSettings: () => settings,
    getRecords: () => (overrides.records === undefined ? { snowluma: { pid: 111, startMs: 1, exe: 'x', cmdline: 'x' } } : overrides.records),
    getIntent: () => intent,
    probe: async () => ({ ...health }),
    assessBusyFn: async () => (overrides.busy || { state: 'idle' }),
    startService: async () => {
      calls.start += 1;
      if (overrides.startImpl) return overrides.startImpl({ setIntent: (v) => { intent = v; }, health, calls });
      health.processAlive = true;
      health.portOpen = true;
      return { ok: true, record: { pid: 222 } };
    },
    stopService: async () => {
      calls.stop += 1;
      health.processAlive = false;
      health.portOpen = false;
      return { ok: true };
    },
    lease,
    now: () => nowValue,
    log: () => {}
  });
  return { engine, settings, health, calls, stateDir, setIntent: (v) => { intent = v; }, setNow: (v) => { nowValue = v; } };
}

test('自动恢复默认关闭时不动作', async () => {
  const env = setup({ settings: { autoRecovery: false } });
  const result = await env.engine.runOnce();
  assert.equal(result.skipped, 'auto-recovery-disabled');
  assert.equal(env.calls.start, 0);
});

test('真实控制未开启时不动作', async () => {
  const env = setup({ settings: { controlEnabled: false } });
  const result = await env.engine.runOnce();
  assert.equal(result.skipped, 'control-disabled');
  assert.equal(env.calls.start, 0);
});

test('crashed + idle → 执行恢复并记录历史', async () => {
  const env = setup();
  const result = await env.engine.runOnce();
  assert.equal(env.calls.start, 1);
  assert.equal(result.recovered.length, 1);
  const history = env.engine.history();
  assert.equal(history[0].result, 'recovered');
  assert.ok(history[0].durationMs >= 0);
  const state = env.engine.state();
  assert.equal(state.services.snowluma.total, 1);
});

test('用户主动停止意图优先，不恢复', async () => {
  const env = setup({ intent: { intent: 'stopped-by-user', at: Date.now() } });
  const result = await env.engine.runOnce();
  assert.equal(env.calls.start, 0);
  assert.equal(result.skipped[0].state, 'stopped-by-user');
});

test('BusyGuard busy 或 unknown 时禁止自动恢复', async () => {
  for (const state of ['busy', 'unknown']) {
    const env = setup({ busy: { state } });
    const result = await env.engine.runOnce();
    assert.equal(env.calls.start, 0, `busy=${state} 不应恢复`);
    assert.equal(result.skipped[0].state, 'busy-guard');
  }
});

test('身份校验失败时不恢复（unknown）', async () => {
  const env = setup({ health: { identityOk: false, processAlive: true, portOpen: true } });
  const result = await env.engine.runOnce();
  assert.equal(env.calls.start, 0);
  assert.equal(result.skipped[0].state, 'unknown');
});

test('没有托管记录时不碰外部服务', async () => {
  const env = setup({ records: {} });
  const result = await env.engine.runOnce();
  assert.equal(env.calls.start, 0);
  assert.equal(result.checked, 0);
});

test('每小时次数超限时熔断', async () => {
  const now = Date.now();
  const env = setup({ now });
  fs.writeFileSync(path.join(env.stateDir, 'recovery-state.json'), JSON.stringify({
    services: { snowluma: { attempts: [now - 1000, now - 2000, now - 3000], failures: 0, total: 3 } }
  }), 'utf8');
  const result = await env.engine.runOnce();
  assert.equal(env.calls.start, 0);
  assert.ok(result.skipped.some((item) => item.state === 'circuit'));
});

test('连续失败达到上限时熔断', async () => {
  const env = setup();
  fs.writeFileSync(path.join(env.stateDir, 'recovery-state.json'), JSON.stringify({
    services: { snowluma: { attempts: [], failures: 5, total: 5 } }
  }), 'utf8');
  const result = await env.engine.runOnce();
  assert.equal(env.calls.start, 0);
  assert.ok(result.skipped.some((item) => item.state === 'circuit'));
});

test('恢复失败会记录 failures 并写入历史', async () => {
  const env = setup({
    startImpl: async ({ health }) => { health.processAlive = true; health.portOpen = false; return { ok: false, reason: 'spawn failed' }; }
  });
  const result = await env.engine.runOnce();
  assert.equal(env.calls.start, 1);
  assert.equal(result.failed.length, 1);
  const state = env.engine.state();
  assert.equal(state.services.snowluma.failures, 1);
  const history = env.engine.history();
  assert.equal(history[0].result, 'failed');
});

test('恢复过程中出现用户停止意图 → 中止并停掉刚启动的服务', async () => {
  const env = setup({
    startImpl: async ({ setIntent, health }) => {
      health.processAlive = true;
      health.portOpen = true;
      setIntent({ intent: 'stopped-by-user', at: Date.now() });
      return { ok: true, record: { pid: 333 } };
    }
  });
  const result = await env.engine.runOnce();
  assert.equal(env.calls.start, 1);
  assert.equal(env.calls.stop, 1);
  assert.ok(result.failed.some((item) => item.reason.includes('stop intent')));
  const history = env.engine.history();
  assert.equal(history[0].result, 'aborted-by-user');
});

test('启动前复检发现已被其他恢复者拉起 → 不重复启动', async () => {
  const env = setup({ health: { processAlive: true, portOpen: true } });
  const result = await env.engine.runOnce();
  assert.equal(env.calls.start, 0);
  assert.ok(result.skipped.some((item) => item.state === 'already-recovered' || item.state === 'healthy'));
});

test('租约被其他恢复者持有时不动作', async () => {
  const env = setup({
    lease: {
      acquire: () => ({ acquired: false, holder: { ownerId: 'watchdog' }, reason: 'held' }),
      heartbeat: () => ({ ok: false }),
      release: () => ({ ok: false })
    }
  });
  const result = await env.engine.runOnce();
  assert.equal(env.calls.start, 0);
  assert.equal(result.lease, 'held');
});

test('恢复成功后会清零连续失败计数', async () => {
  const env = setup();
  fs.writeFileSync(path.join(env.stateDir, 'recovery-state.json'), JSON.stringify({
    services: { snowluma: { attempts: [], failures: 2, total: 0 } }
  }), 'utf8');
  const result = await env.engine.runOnce();
  assert.equal(env.calls.start, 1);
  const state = env.engine.state();
  assert.equal(state.services.snowluma.failures, 0);
  assert.equal(state.services.snowluma.total, 1);
});

test('bridge 的恢复控制权归原 watchdog，管理器不自动恢复', async () => {
  const env = setup({
    records: { bridge: { pid: 111, startMs: 1, exe: 'x', cmdline: 'x' } }
  });
  const result = await env.engine.runOnce();
  assert.equal(env.calls.start, 0);
  assert.ok(result.skipped.some((item) => item.id === 'bridge' && item.state === 'not-owned-by-manager'));
});

test('状态文件损坏时隔离为 .corrupt-* 并继续工作', async () => {
  const env = setup();
  const file = path.join(env.stateDir, 'recovery-state.json');
  fs.writeFileSync(file, '{ broken json', 'utf8');
  const result = await env.engine.runOnce();
  assert.equal(env.calls.start, 1);
  const files = fs.readdirSync(env.stateDir).filter((name) => name.includes('recovery-state.json.corrupt-'));
  assert.equal(files.length, 1, '损坏文件应被移走而不是静默覆盖');
});

test('恢复历史过大时会裁剪，避免无限增长', async () => {
  const env = setup();
  const historyFile = path.join(env.stateDir, 'recovery-history.jsonl');
  const line = JSON.stringify({ at: Date.now(), service: 'snowluma', result: 'recovered', durationMs: 1 }) + '\n';
  fs.writeFileSync(historyFile, line.repeat(20000), 'utf8');
  await env.engine.runOnce();
  const size = fs.statSync(historyFile).size;
  assert.ok(size <= 1024 * 1024, `history 应被裁剪，当前 ${size} 字节`);
});

test('classifyAll 以只读方式给出状态，不执行恢复', async () => {
  const env = setup({ health: { processAlive: true, portOpen: false } });
  const states = await env.engine.classifyAll();
  assert.equal(env.calls.start, 0);
  assert.equal(states[0].id, 'snowluma');
  assert.equal(states[0].state, 'degraded');
  assert.equal(states[0].owner, 'manager');
});

test('状态目录不可写时恢复仍完成，记录失败但不抛出', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-recovery-bad-'));
  const stateDir = path.join(root, 'state');
  fs.writeFileSync(stateDir, 'not a directory', 'utf8'); // stateDir 是文件，写入必失败
  let starts = 0;
  const health = { identityOk: true, processAlive: false, portOpen: false };
  const engine = createRecoveryEngine({
    stateDir,
    getSettings: () => ({ autoRecovery: true, controlEnabled: true }),
    getRecords: () => ({ snowluma: { pid: 1, startMs: 1, exe: 'x', cmdline: 'x' } }),
    getIntent: () => null,
    probe: async () => ({ ...health }),
    assessBusyFn: async () => ({ state: 'idle' }),
    startService: async () => { starts += 1; health.processAlive = true; health.portOpen = true; return { ok: true, record: { pid: 2 } }; },
    stopService: async () => ({ ok: true }),
    lease: { acquire: () => ({ acquired: true }), heartbeat: () => ({ ok: true }), release: () => ({ ok: true }) },
    log: () => {}
  });
  const result = await engine.runOnce();
  assert.equal(starts, 1);
  assert.equal(result.recovered.length, 1, '状态写入失败不应把恢复判为失败');
});
