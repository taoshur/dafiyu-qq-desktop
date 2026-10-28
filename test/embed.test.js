'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { policyFor, isAllowedNavigation } = require('../src/main/embed-policy');

test('内嵌页面只允许 SnowLuma 5099 与 bridge 3100', () => {
  assert.equal(policyFor('snowluma').url, 'http://127.0.0.1:5099/');
  assert.equal(policyFor('bridge').url, 'http://127.0.0.1:3100/');
  assert.equal(policyFor('other'), null);
});

test('内嵌导航拒绝外部 origin 与非回环地址', () => {
  assert.equal(isAllowedNavigation('snowluma', 'http://127.0.0.1:5099/login'), true);
  assert.equal(isAllowedNavigation('bridge', 'http://127.0.0.1:3100/?x=1'), true);
  assert.equal(isAllowedNavigation('bridge', 'http://127.0.0.1:3100.evil.com/'), false);
  assert.equal(isAllowedNavigation('bridge', 'https://127.0.0.1:3100/'), false);
  assert.equal(isAllowedNavigation('bridge', 'http://localhost:3100/'), false);
  assert.equal(isAllowedNavigation('bridge', 'file:///C:/secret'), false);
  assert.equal(isAllowedNavigation('other', 'http://127.0.0.1:3100/'), false);
});

test('bridge 控制台 URL 不携带令牌', () => {
  assert.ok(!policyFor('bridge').url.includes('?'));
  assert.ok(!policyFor('bridge').url.includes('token'));
  assert.ok(!policyFor('snowluma').url.includes('token'));
});
