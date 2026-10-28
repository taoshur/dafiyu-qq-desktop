'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createPaths } = require('../src/main/paths');

const REPO_ROOT = process.env.DAFIYU_REPO_ROOT || path.resolve(__dirname, '..', '..', 'qq-bridge');
const skip = fs.existsSync(path.join(REPO_ROOT, 'src', 'memory', 'db.js')) ? false : '需要 qq-bridge 源码（设置 DAFIYU_REPO_ROOT）';
const { memoryStatus, listMemory, getCandidate, initTestDb, reviewCandidate } = require('../src/main/memory');

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-memory-ui-'));
  const paths = createPaths(path.join(root, 'userData'));
  const settings = {
    repoRoot: REPO_ROOT,
    snowlumaRoot: process.env.DAFIYU_SNOWLUMA_ROOT || path.resolve(REPO_ROOT, '..', 'SnowLuma'),
    dshExe: process.execPath
  };
  return { root, paths, settings };
}

test('隔离测试库：初始化、状态、候选、证据', { skip }, async () => {
  const env = setup();
  const created = await initTestDb({ settings: env.settings, paths: env.paths });
  assert.equal(created.created, true);
  assert.ok(fs.existsSync(env.paths.memoryTestDb));

  const status = memoryStatus({ settings: env.settings, paths: env.paths, mode: 'test' });
  assert.equal(status.exists, true);
  assert.equal(status.counts.pending, 2);
  assert.equal(status.integrity, 'ok');
  assert.equal(status.observeOnly, true);

  const list = listMemory({ settings: env.settings, paths: env.paths, mode: 'test', type: 'candidates', status: 'pending' });
  assert.equal(list.total, 2);
  assert.ok(list.rows.every((row) => row.type === 'candidate'));

  const detail = getCandidate({ settings: env.settings, paths: env.paths, mode: 'test', id: 1 });
  assert.equal(detail.candidate.id, 1);
  assert.ok(detail.evidence.length >= 1);
  assert.match(detail.evidence[0].text, /合成消息/);
});

test('测试库审核：apply 写入 event，reject 只改状态', { skip }, async () => {
  const env = setup();
  await initTestDb({ settings: env.settings, paths: env.paths });
  const applied = await reviewCandidate({ settings: env.settings, paths: env.paths, id: 1, action: 'apply', reason: 'ui test' });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.refType, 'event');
  const again = await reviewCandidate({ settings: env.settings, paths: env.paths, id: 1, action: 'apply', reason: 'again' });
  assert.equal(again.already, true);

  const rejected = await reviewCandidate({ settings: env.settings, paths: env.paths, id: 2, action: 'reject', reason: 'ui reject' });
  assert.equal(rejected.status, 'rejected');
  const status = memoryStatus({ settings: env.settings, paths: env.paths, mode: 'test' });
  assert.equal(status.counts.events, 1);
  assert.equal(status.counts.pending, 0);
  assert.equal(status.counts.applied, 1);
});

test('测试库列表：事件和事实可读，搜索过滤生效', { skip }, async () => {
  const env = setup();
  await initTestDb({ settings: env.settings, paths: env.paths });
  await reviewCandidate({ settings: env.settings, paths: env.paths, id: 1, action: 'apply' });
  await reviewCandidate({ settings: env.settings, paths: env.paths, id: 2, action: 'apply' });
  const events = listMemory({ settings: env.settings, paths: env.paths, mode: 'test', type: 'events', q: '桌面' });
  assert.equal(events.total, 1);
  assert.ok(events.rows[0].summary.includes('桌面'));
  const facts = listMemory({ settings: env.settings, paths: env.paths, mode: 'test', type: 'facts', q: '测试偏好' });
  assert.equal(facts.total, 1);
});

test('生产模式只读：不返回测试库内容', { skip }, async () => {
  const env = setup();
  await initTestDb({ settings: env.settings, paths: env.paths });
  const prod = memoryStatus({ settings: env.settings, paths: env.paths, mode: 'prod' });
  assert.equal(prod.mode, 'prod');
  assert.notEqual(prod.dbPath, env.paths.memoryTestDb);
});
