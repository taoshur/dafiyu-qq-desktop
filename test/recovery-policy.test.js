'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { decideRecovery } = require('../src/main/recovery-policy');

const now = Date.now();

test('恢复开关关闭时不建议重启', () => {
  const result = decideRecovery({ enabled: false, now });
  assert.equal(result.action, 'none');
});

test('用户主动停止时不建议重启', () => {
  const result = decideRecovery({ enabled: true, stopIntent: { intent: 'stopped-by-user', at: now }, now });
  assert.equal(result.action, 'none');
});

test('一小时内超过 3 次触发限速熔断', () => {
  const attempts = [now - 1000, now - 2000, now - 3000];
  const result = decideRecovery({ enabled: true, attempts, now });
  assert.equal(result.action, 'none');
  assert.equal(result.circuit, true);
});

test('连续失败达到上限触发熔断', () => {
  const result = decideRecovery({ enabled: true, consecutiveFailures: 5, now });
  assert.equal(result.action, 'none');
  assert.equal(result.circuit, true);
});

test('正常恢复按退避序列给出延迟', () => {
  const first = decideRecovery({ enabled: true, consecutiveFailures: 0, now });
  assert.equal(first.action, 'restart');
  assert.equal(first.delayMs, 5000);
  const second = decideRecovery({ enabled: true, consecutiveFailures: 1, now });
  assert.equal(second.delayMs, 30000);
  const third = decideRecovery({ enabled: true, consecutiveFailures: 2, now });
  assert.equal(third.delayMs, 120000);
  const capped = decideRecovery({ enabled: true, consecutiveFailures: 4, now });
  assert.equal(capped.delayMs, 120000);
});
