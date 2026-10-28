'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { planStartup, planRecovery, recoveryBoundary } = require('../src/main/startup-plan');

test('默认全部关闭：不启动管理器、不启动机器人', () => {
  const plan = planStartup({ settings: {}, intents: {}, running: {} });
  assert.equal(plan.manager, false);
  assert.deepEqual(plan.services, []);
});

test('三个开关互相独立：只开管理器自启不会拉起机器人', () => {
  const plan = planStartup({ settings: { managerAutostart: true }, intents: {}, running: {} });
  assert.equal(plan.manager, true);
  assert.deepEqual(plan.services, []);
});

test('只开机器人自启：管理器不自动启动，但管理器运行时会拉起服务', () => {
  const plan = planStartup({ settings: { botAutostart: true }, intents: {}, running: {} });
  assert.equal(plan.manager, false);
  assert.deepEqual(plan.services, ['snowluma', 'bridge']);
});

test('用户主动停止优先于开机自启', () => {
  const plan = planStartup({
    settings: { managerAutostart: true, botAutostart: true },
    intents: { bridge: { intent: 'stopped-by-user', at: Date.now() } },
    running: {}
  });
  assert.equal(plan.manager, true);
  assert.deepEqual(plan.services, ['snowluma']);
  assert.ok(plan.skipped.some((item) => item.id === 'bridge' && item.reason === 'stopped-by-user'));
});

test('已在运行的服务不会重复启动', () => {
  const plan = planStartup({ settings: { botAutostart: true }, intents: {}, running: { snowluma: true } });
  assert.deepEqual(plan.services, ['bridge']);
});

test('模拟 Windows 注销/重启后：服务不存在，按开关与停止意图重新计划', () => {
  // 注销/重启后进程全部消失
  const afterReboot = { snowluma: false, bridge: false, dsh: false };
  const intended = planStartup({ settings: { managerAutostart: true, botAutostart: true }, intents: {}, running: afterReboot });
  assert.equal(intended.manager, true);
  assert.deepEqual(intended.services, ['snowluma', 'bridge']);

  const userStopped = planStartup({
    settings: { managerAutostart: true, botAutostart: true },
    intents: { bridge: { intent: 'stopped-by-user', at: Date.now() } },
    running: afterReboot
  });
  assert.deepEqual(userStopped.services, ['snowluma']);
});

test('自动恢复：关闭开关或存在停止意图时不恢复', () => {
  const off = planRecovery({ settings: { autoRecovery: false }, service: 'bridge', intents: {}, now: Date.now() });
  assert.equal(off.action, 'none');
  const stopped = planRecovery({
    settings: { autoRecovery: true },
    service: 'bridge',
    intents: { bridge: { intent: 'stopped-by-user', at: Date.now() } },
    now: Date.now()
  });
  assert.equal(stopped.action, 'none');
});

test('自动恢复：开启且无限速时按退避重启', () => {
  const result = planRecovery({ settings: { autoRecovery: true }, service: 'bridge', intents: {}, now: Date.now() });
  assert.equal(result.action, 'restart');
  assert.equal(result.delayMs, 5000);
});

test('恢复边界说明不会把“服务继续运行”说成“全部受守护”', () => {
  const boundary = recoveryBoundary({ managerAutostart: true, autoRecovery: true });
  assert.equal(boundary.afterManagerExit.servicesKeepRunning, true);
  assert.equal(boundary.afterManagerExit.autoRecoveryContinues, false);
  assert.match(boundary.afterManagerExit.snowluma, /无自动恢复/);
  assert.match(boundary.afterManagerExit.bridgeFallback, /watchdog/);
});
