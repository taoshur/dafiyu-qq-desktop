'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { readTail, listSources, tailSource } = require('../src/main/logs');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-logs-'));
}

test('readTail 读取最后 N 行，且不修改文件', () => {
  const dir = tempDir();
  const file = path.join(dir, 'bridge.log');
  const content = ['line1', 'line2', 'line3', 'line4'].join('\r\n') + '\r\n';
  fs.writeFileSync(file, content, 'utf8');
  const result = readTail(file, 2);
  assert.equal(result.exists, true);
  assert.deepEqual(result.lines, ['line3', 'line4']);
  assert.equal(fs.readFileSync(file, 'utf8'), content, '原文件必须保持不变');
});

test('readTail 对不存在的文件返回 exists=false', () => {
  const dir = tempDir();
  const result = readTail(path.join(dir, 'missing.log'), 10);
  assert.equal(result.exists, false);
  assert.deepEqual(result.lines, []);
});

test('listSources 覆盖桥接、活动、看门狗、成长与 SnowLuma', () => {
  const dir = tempDir();
  const settings = { repoRoot: dir, snowlumaRoot: path.join(dir, 'snowluma') };
  fs.mkdirSync(path.join(dir, 'state'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'state', 'bridge.log'), 'hello\n', 'utf8');
  const sources = listSources(settings);
  const ids = sources.map((item) => item.id).sort();
  assert.deepEqual(ids, ['activity', 'bridge', 'growth', 'snowluma', 'watchdog']);
  assert.equal(sources.find((item) => item.id === 'bridge').exists, true);
});

test('tailSource 拒绝未知来源', () => {
  const dir = tempDir();
  const settings = { repoRoot: dir, snowlumaRoot: dir };
  assert.throws(() => tailSource(settings, 'etc-passwd', 10), /未知日志来源/);
});
