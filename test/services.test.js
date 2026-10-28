'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { definitions, simulateAction, dependencyPlan } = require('../src/main/services');

const settings = {
  repoRoot: 'C:\\Users\\admin\\qq-bridge',
  snowlumaRoot: 'C:\\SnowLuma',
  dshExe: 'C:\\Users\\admin\\AppData\\Local\\Programs\\DeepSeek Harness\\DeepSeek Harness.exe'
};

test('依赖顺序固定为 SnowLuma → DSH → qq-bridge', () => {
  const plan = dependencyPlan(definitions(settings));
  assert.deepEqual(plan.map((item) => item.id), ['snowluma', 'dsh', 'bridge']);
  assert.deepEqual(plan.map((item) => item.order), [1, 2, 3]);
  assert.equal(plan.find((item) => item.id === 'dsh').detectOnlyByDefault, true);
});

test('第二阶段任何操作都只返回模拟结果', () => {
  const defs = definitions(settings);
  for (const id of ['snowluma', 'dsh', 'bridge']) {
    for (const action of ['start', 'stop', 'restart']) {
      const result = simulateAction(defs, id, action);
      assert.equal(result.ok, true);
      assert.equal(result.simulated, true);
      assert.ok(result.message.includes('模拟'));
      assert.ok(Array.isArray(result.plan) && result.plan.length > 0);
    }
  }
});

test('未知服务/动作被拒绝', () => {
  const defs = definitions(settings);
  assert.equal(simulateAction(defs, 'unknown', 'start').ok, false);
  assert.equal(simulateAction(defs, 'bridge', 'destroy').ok, false);
});

test('DSH 启动命令指向配置的 exe，且不拼接 shell', () => {
  const defs = definitions(settings);
  assert.equal(defs.dsh.start.exe, settings.dshExe);
  assert.deepEqual(defs.dsh.start.args, []);
  assert.equal(defs.bridge.start.cwd, settings.repoRoot);
  assert.ok(defs.bridge.start.args[0].endsWith('start-bridge.mjs'));
});
