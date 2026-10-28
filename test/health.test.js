'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const { tcpProbe, listProcesses, envChecks, discoverDshPort } = require('../src/main/health');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-health-'));
}

test('tcpProbe 能区分开放与关闭的端口', async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  assert.equal(await tcpProbe(port), true);
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await tcpProbe(port, '127.0.0.1', 400), false);
});

test('discoverDshPort 通过 401 + 特定文案识别 DSH', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(401, { 'content-type': 'text/html' });
    res.end('<h1>dsh web authentication required</h1>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const listeners = new Map([[port, 4242]]);
  const found = await discoverDshPort(listeners, 0);
  assert.ok(found, '应识别出 DSH 端口');
  assert.equal(found.port, port);
  assert.equal(found.pid, 4242);
  await new Promise((resolve) => server.close(resolve));
});

test('discoverDshPort 不会把普通 401 当成 DSH', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(401, { 'content-type': 'text/plain' });
    res.end('unauthorized');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const found = await discoverDshPort(new Map([[port, 1]]), 0);
  assert.equal(found, null);
  await new Promise((resolve) => server.close(resolve));
});

test('listProcesses 返回带 PID 的进程数组', async () => {
  const list = await listProcesses(0);
  assert.ok(Array.isArray(list));
  assert.ok(list.length > 0);
  assert.ok(list.some((item) => Number.isInteger(item.pid) && item.pid > 0));
});

test('envChecks 对缺失目录给出 bad/warn 而不是抛错', () => {
  const root = tempDir();
  const settings = {
    repoRoot: root,
    snowlumaRoot: path.join(root, 'no-snowluma'),
    dshExe: path.join(root, 'no-dsh.exe')
  };
  const checks = envChecks(settings, { valid: false, exists: false });
  assert.ok(checks.length >= 8);
  const byId = Object.fromEntries(checks.map((item) => [item.id, item]));
  assert.equal(byId.repo.state, 'bad');
  assert.equal(byId.snowluma.state, 'bad');
  assert.equal(byId.dsh.state, 'warn');
  assert.equal(byId.config.state, 'bad');
  assert.equal(byId.node.state, 'ok');
});
