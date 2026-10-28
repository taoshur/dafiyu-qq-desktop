'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { assessBusy, SIGNALS } = require('../src/main/busy-guard');

function repoWithSignals(agesMs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-busy-'));
  fs.mkdirSync(path.join(root, 'state'), { recursive: true });
  for (const signal of SIGNALS) {
    const file = path.join(root, signal.rel);
    fs.writeFileSync(file, 'x', 'utf8');
    const at = new Date(Date.now() - agesMs);
    fs.utimesSync(file, at, at);
  }
  return root;
}

test('全部信号 30 秒以上无写入 → idle', () => {
  const repo = repoWithSignals(60_000);
  const result = assessBusy(repo);
  assert.equal(result.state, 'idle');
});

test('任一信号 10 秒内写入 → busy', () => {
  const repo = repoWithSignals(60_000);
  const file = path.join(repo, 'state', 'bridge.log');
  fs.writeFileSync(file, 'new line', 'utf8');
  const result = assessBusy(repo);
  assert.equal(result.state, 'busy');
  assert.ok(result.reasons.some((line) => line.includes('bridge.log')));
});

test('缺少活动信号文件 → unknown（必须人工确认）', () => {
  const repo = repoWithSignals(60_000);
  fs.rmSync(path.join(repo, 'state', 'tool-calls.jsonl'));
  const result = assessBusy(repo);
  assert.equal(result.state, 'unknown');
  assert.ok(result.reasons.length > 0);
});

test('10–30 秒灰区 → unknown', () => {
  const repo = repoWithSignals(15_000);
  const result = assessBusy(repo);
  assert.equal(result.state, 'unknown');
});

test('未来时间戳 → unknown', () => {
  const repo = repoWithSignals(60_000);
  const file = path.join(repo, 'state', 'bridge.log');
  const future = new Date(Date.now() + 10 * 60_000);
  fs.utimesSync(file, future, future);
  const result = assessBusy(repo);
  assert.equal(result.state, 'unknown');
});
