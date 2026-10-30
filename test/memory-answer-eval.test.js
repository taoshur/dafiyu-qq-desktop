'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { evaluateAnswer, CASES } = require('../scripts/memory-answer-eval');

test('answer evaluator detects unsupported hallucination and attribution', () => {
  assert.equal(evaluateAnswer(CASES[0], '没有相关记忆').pass, true);
  assert.equal(evaluateAnswer(CASES[0], '我们去年在月球上吃过饭').pass, false);
  assert.equal(evaluateAnswer(CASES[1], '爸爸喜欢消消乐，别人喜欢别的游戏').pass, false);
  assert.equal(evaluateAnswer(CASES[2], '昨天一起吃了火锅').pass, true);
});
