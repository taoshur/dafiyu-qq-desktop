'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { classifyServiceState, canAutoRecover } = require('../src/main/service-state');

const record = { pid: 1 };

test('用户停止意图优先级最高（即使进程已崩溃）', () => {
  const result = classifyServiceState({ record, identityOk: false, processAlive: false, portOpen: false, busy: 'busy', intent: {} });
  assert.equal(result.state, 'stopped-by-user');
});

test('没有桌面记录视为外部/未托管', () => {
  const result = classifyServiceState({ record: null, identityOk: true, processAlive: true, portOpen: true, busy: 'idle' });
  assert.equal(result.state, 'unmanaged');
});

test('身份校验失败 → unknown（禁止自动操作）', () => {
  const result = classifyServiceState({ record, identityOk: false, processAlive: true, portOpen: true, busy: 'idle' });
  assert.equal(result.state, 'unknown');
});

test('进程退出 → crashed（唯一允许自动恢复的状态）', () => {
  const result = classifyServiceState({ record, identityOk: true, processAlive: false, portOpen: false, busy: 'idle' });
  assert.equal(result.state, 'crashed');
  assert.equal(canAutoRecover(result.state), true);
  assert.equal(canAutoRecover('degraded'), false);
  assert.equal(canAutoRecover('unknown'), false);
});

test('进程已退出时即使无法做身份校验也判为 crashed', () => {
  const result = classifyServiceState({ record, identityOk: false, processAlive: false, portOpen: false, busy: 'idle' });
  assert.equal(result.state, 'crashed', 'PID 已消失时不应该因为身份校验失败而拒绝恢复');
});

test('进程在但端口未就绪 → degraded', () => {
  const result = classifyServiceState({ record, identityOk: true, processAlive: true, portOpen: false, busy: 'idle' });
  assert.equal(result.state, 'degraded');
});

test('端口状态未知 → unknown', () => {
  const result = classifyServiceState({ record, identityOk: true, processAlive: true, portOpen: undefined, busy: 'idle' });
  assert.equal(result.state, 'unknown');
});

test('BusyGuard busy/unknown 分别映射为 busy/unknown', () => {
  assert.equal(classifyServiceState({ record, identityOk: true, processAlive: true, portOpen: true, busy: 'busy' }).state, 'busy');
  assert.equal(classifyServiceState({ record, identityOk: true, processAlive: true, portOpen: true, busy: 'unknown' }).state, 'unknown');
});

test('全部正常 → healthy', () => {
  assert.equal(classifyServiceState({ record, identityOk: true, processAlive: true, portOpen: true, busy: 'idle' }).state, 'healthy');
});
