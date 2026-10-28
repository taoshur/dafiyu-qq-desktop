'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createWatchdogMonitor } = require('../src/main/watchdog-health');

function env() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-watchdog-'));
  const repo = path.join(root, 'repo');
  const stateDir = path.join(root, 'state');
  fs.mkdirSync(path.join(repo, 'state'), { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  return { root, repo, stateDir };
}

test('watchdog 任务存在且启用、无哨兵 → ok', async () => {
  const e = env();
  const monitor = createWatchdogMonitor({
    queryTask: async () => ({ state: 'Enabled', status: 'Ready' }),
    stateDir: e.stateDir,
    repoRoot: e.repo,
    now: () => Date.now()
  });
  const result = await monitor();
  assert.equal(result.verdict, 'ok');
  assert.equal(result.task.exists, true);
  assert.equal(result.task.enabled, true);
});

test('watchdog 任务不存在 → missing 告警', async () => {
  const e = env();
  const monitor = createWatchdogMonitor({ queryTask: async () => null, stateDir: e.stateDir, repoRoot: e.repo });
  const result = await monitor();
  assert.equal(result.verdict, 'missing');
  assert.match(result.hint, /没有自动恢复主体/);
});

test('watchdog 任务被禁用 → disabled', async () => {
  const e = env();
  const monitor = createWatchdogMonitor({
    queryTask: async () => ({ state: 'Disabled', status: 'Disabled' }),
    stateDir: e.stateDir,
    repoRoot: e.repo
  });
  const result = await monitor();
  assert.equal(result.verdict, 'disabled');
});

test('哨兵存在 → sentinel 提示（用户停止的预期状态）', async () => {
  const e = env();
  fs.writeFileSync(path.join(e.repo, 'state', 'watchdog.disabled'), '', 'utf8');
  const monitor = createWatchdogMonitor({
    queryTask: async () => ({ state: 'Enabled' }),
    stateDir: e.stateDir,
    repoRoot: e.repo
  });
  const result = await monitor();
  assert.equal(result.verdict, 'sentinel');
  assert.equal(result.sentinel.exists, true);
});

test('查询失败 → unknown，不误报 ok', async () => {
  const e = env();
  const monitor = createWatchdogMonitor({
    queryTask: async () => { throw new Error('access denied'); },
    stateDir: e.stateDir,
    repoRoot: e.repo
  });
  const result = await monitor();
  assert.equal(result.verdict, 'unknown');
  assert.match(result.hint, /access denied/);
});

test('watchdog 日志长时间未更新 → silent', async () => {
  const e = env();
  const log = path.join(e.stateDir, 'watchdog.log');
  fs.writeFileSync(log, 'x', 'utf8');
  const old = new Date(Date.now() - 30 * 60_000);
  fs.utimesSync(log, old, old);
  const monitor = createWatchdogMonitor({
    queryTask: async () => ({ state: 'Enabled' }),
    stateDir: e.stateDir,
    repoRoot: e.repo
  });
  const result = await monitor();
  assert.equal(result.verdict, 'silent');
});
