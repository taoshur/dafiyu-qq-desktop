'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const { CHANNELS } = require('../src/main/ipc/contracts');
const { createIpcRouter, AppError } = require('../src/main/ipc/router');

function fakeIpcMain() {
  const handlers = new Map();
  return {
    handle: (channel, fn) => handlers.set(channel, fn),
    invoke: (channel, payload) => handlers.get(channel)({}, payload),
    channels: () => [...handlers.keys()]
  };
}

test('IPC channel contract matches ipc.js/handlers and preload', () => {
  const files = [
    path.join(__dirname, '..', 'src', 'main', 'ipc.js'),
    ...fs.readdirSync(path.join(__dirname, '..', 'src', 'main', 'ipc', 'handlers'))
      .map((name) => path.join(__dirname, '..', 'src', 'main', 'ipc', 'handlers', name))
  ];
  const registered = files.flatMap((file) => {
    const source = fs.readFileSync(file, 'utf8');
    return [...source.matchAll(/router\.handle\('([^']+)'/g)].map((m) => m[1]);
  });
  assert.deepEqual(new Set(registered), new Set(CHANNELS));
  assert.equal(new Set(CHANNELS).size, CHANNELS.length, 'channel names must be unique');

  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload', 'index.js'), 'utf8');
  for (const channel of CHANNELS) {
    assert.ok(preload.includes(`ipcRenderer.invoke('${channel}'`), `preload missing invoke for ${channel}`);
  }
});

test('router rejects unknown or duplicate channels', () => {
  const ipcMain = fakeIpcMain();
  const router = createIpcRouter({ ipcMain, log: () => {} });
  assert.throws(() => router.handle('unknown:channel', () => 1), /not in contract/);
  router.handle('app:info', () => ({ version: 'test' }));
  assert.throws(() => router.handle('app:info', () => ({})), /registered twice/);
  assert.deepEqual(router.registered(), ['app:info']);
});

test('router Result mode returns a stable error envelope', async () => {
  const ipcMain = fakeIpcMain();
  const router = createIpcRouter({ ipcMain, log: () => {} });
  router.handleResult('settings:get', async () => ({ ok: true }));
  assert.deepEqual(await ipcMain.invoke('settings:get'), { ok: true, data: { ok: true } });

  const ipcMain2 = fakeIpcMain();
  const router2 = createIpcRouter({ ipcMain: ipcMain2, log: () => {} });
  router2.handleResult('settings:get', async () => { throw new AppError('E_TEST', 'bad', { retryable: true }); });
  const result = await ipcMain2.invoke('settings:get');
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_TEST');
  assert.equal(result.error.retryable, true);
});


test('router sanitizes secrets in result errors', async () => {
  const ipcMain = fakeIpcMain();
  const router = createIpcRouter({ ipcMain, log: () => {} });
  router.handleResult('settings:save', async () => { throw new Error('Authorization: Bearer top-secret'); });
  const result = await ipcMain.invoke('settings:save');
  assert.equal(result.ok, false);
  assert.ok(!result.error.message.includes('top-secret'));
});
