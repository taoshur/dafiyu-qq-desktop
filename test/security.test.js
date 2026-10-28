'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const { buildWindowPreferences, guardWebContents, applyGlobalGuards } = require('../src/main/security');

class FakeContents extends EventEmitter {
  setWindowOpenHandler(handler) { this.openHandler = handler; }
}

test('窗口安全基线：contextIsolation/sandbox 开启，Node 关闭', () => {
  const prefs = buildWindowPreferences('C:\\preload.js', { devTools: false });
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.nodeIntegration, false);
  assert.equal(prefs.nodeIntegrationInWorker, false);
  assert.equal(prefs.sandbox, true);
  assert.equal(prefs.webSecurity, true);
  assert.equal(prefs.webviewTag, false);
  assert.equal(prefs.devTools, false);
});

test('生产关闭 DevTools，开发可开启', () => {
  assert.equal(buildWindowPreferences('p', { devTools: true }).devTools, true);
  assert.equal(buildWindowPreferences('p').devTools, false);
});

test('新窗口、导航、webview 全部被拒绝并记录', () => {
  const contents = new FakeContents();
  const blocked = [];
  guardWebContents(contents, (kind, url) => blocked.push([kind, url]));

  const result = contents.openHandler({ url: 'https://example.com' });
  assert.deepEqual(result, { action: 'deny' });

  let prevented = false;
  contents.emit('will-navigate', { preventDefault: () => { prevented = true; } }, 'https://evil.example');
  assert.equal(prevented, true);

  let webviewPrevented = false;
  contents.emit('will-attach-webview', { preventDefault: () => { webviewPrevented = true; } }, {});
  assert.equal(webviewPrevented, true);

  assert.deepEqual(blocked.map((item) => item[0]), ['window-open', 'navigate', 'webview']);
});

test('全局守卫会覆盖新建的 webContents', () => {
  const app = new EventEmitter();
  const contents = new FakeContents();
  applyGlobalGuards(app, () => {});
  app.emit('web-contents-created', {}, contents);
  assert.equal(typeof contents.openHandler, 'function');
  assert.equal(contents.openHandler({ url: 'x' }).action, 'deny');
});
