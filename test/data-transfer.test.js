'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildConfigExport, validateConfigImport, configDiff } = require('../src/main/data-transfer');

test('desktop config export only contains allowlisted fields', () => {
  const payload = buildConfigExport({
    ownerTitle: '爸爸',
    repoRoot: 'C:/qq-bridge',
    controlEnabled: true,
    apiKey: 'SECRET',
    consoleToken: 'TOKEN',
    unknown: 1
  }, { appVersion: '0.9.4' });
  assert.equal(payload.format, 'dafiyu-config');
  assert.equal(payload.formatVersion, 1);
  assert.equal(payload.settings.ownerTitle, '爸爸');
  assert.equal(payload.settings.repoRoot, 'C:/qq-bridge');
  assert.equal(payload.settings.apiKey, undefined);
  assert.equal(payload.settings.consoleToken, undefined);
  assert.equal(payload.settings.unknown, undefined);
});

test('config import rejects wrong formats and invalid values', () => {
  assert.throws(() => validateConfigImport('{}'), /不是 Dafiyu/);
  assert.throws(() => validateConfigImport({ format: 'dafiyu-config', formatVersion: 9 }), /不支持/);
  assert.throws(() => validateConfigImport({ format: 'dafiyu-config', formatVersion: 1, settings: { controlEnabled: 'yes' } }), /布尔/);
  assert.throws(() => validateConfigImport({ format: 'dafiyu-config', formatVersion: 1, settings: {} }), /没有可导入/);
});

test('config import validates fields and computes diff', () => {
  const parsed = validateConfigImport({
    format: 'dafiyu-config', formatVersion: 1,
    settings: { ownerTitle: '主人', controlEnabled: false, unknown: 'ignore' }
  });
  assert.deepEqual(parsed.imported, { ownerTitle: '主人', controlEnabled: false });
  const diff = configDiff({ ownerTitle: '爸爸', controlEnabled: true }, parsed.imported);
  assert.equal(diff.length, 2);
  assert.equal(diff[0].key, 'ownerTitle');
});


test('data IPC handler module loads with production-relative paths', () => {
  assert.doesNotThrow(() => require('../src/main/ipc/handlers/data'));
});
