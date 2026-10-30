'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parseTimeRange } = require('../vendor/qq-bridge/src/memory/time-range.js');

test('“前几天” excludes today while “最近几天” includes today', () => {
  const now = Date.parse('2026-10-30T12:00:00+08:00');
  const todayStart = Date.parse('2026-10-30T00:00:00+08:00');
  const before = parseTimeRange('前几天我们一起做过什么', now);
  assert.equal(before.kind, 'fuzzy-before-today');
  assert.ok(before.from < todayStart);
  assert.ok(before.to < todayStart, '前几天 must not include today');

  const recent = parseTimeRange('最近几天过得怎么样', now);
  assert.equal(recent.kind, 'fuzzy-recent');
  assert.ok(recent.to >= todayStart);
});
