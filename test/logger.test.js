'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { redact, redactValue } = require('../src/main/core/logger');

test('structured logger redacts nested secrets and bearer values', () => {
  const value = redactValue({
    message: 'Authorization: Bearer abc.def.ghi',
    nested: { cookie: 'SESSDATA=secret', apiKey: 'sk-1234567890' },
    list: [{ token: 'secret-token' }, 'console-key=abc']
  });
  assert.equal(value.nested.cookie, '<redacted>');
  assert.equal(value.nested.apiKey, '<redacted>');
  assert.equal(value.list[0].token, '<redacted>');
  assert.ok(!JSON.stringify(value).includes('secret-token'));
  assert.ok(!JSON.stringify(value).includes('sk-1234567890'));
  assert.ok(!redact('Authorization: Bearer abc.def').includes('abc.def'));
  assert.ok(redact('Authorization: Bearer abc.def').includes('<redacted>'));
});
