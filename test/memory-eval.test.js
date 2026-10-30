'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { evaluate } = require('../scripts/memory-eval');

test('Memory V4 anonymized baseline is repeatable and isolated', () => {
  const report = evaluate();
  assert.equal(report.version, 1);
  assert.equal(report.dataset, 'anonymized-memory-baseline-v1');
  assert.equal(report.cases.length, 6);
  assert.equal(report.metrics.recall, 1);
  assert.equal(report.metrics.precision, 1);
  assert.equal(report.metrics.hallucinationRate, 0);
});
