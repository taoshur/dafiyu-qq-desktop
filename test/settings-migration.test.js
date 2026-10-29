'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createPaths, saveSettings, loadSettings, migrateSettings } = require('../src/main/paths');

test('settings migration preserves unknown fields and creates a backup', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-migrate-'));
  const paths = createPaths(path.join(root, 'userData'));
  fs.writeFileSync(paths.configFile, JSON.stringify({
    repoRoot: root,
    snowlumaRoot: root,
    dshExe: process.execPath,
    ownerTitle: '老板',
    customFutureField: { keep: true }
  }), 'utf8');

  const result = migrateSettings(paths);
  assert.equal(result.migrated, true);
  assert.ok(fs.existsSync(result.backup));
  const migrated = JSON.parse(fs.readFileSync(paths.configFile, 'utf8'));
  assert.equal(migrated.schemaVersion, 1);
  assert.deepEqual(migrated.customFutureField, { keep: true });
  assert.equal(loadSettings(paths).ownerTitle, '老板');

  saveSettings(paths, { ...loadSettings(paths), ownerTitle: '爸爸' });
  const saved = JSON.parse(fs.readFileSync(paths.configFile, 'utf8'));
  assert.equal(saved.schemaVersion, 1);
  assert.deepEqual(saved.customFutureField, { keep: true });
});

test('invalid settings file is not overwritten by migration', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-migrate-bad-'));
  const paths = createPaths(path.join(root, 'userData'));
  fs.writeFileSync(paths.configFile, '{ broken', 'utf8');
  const result = migrateSettings(paths);
  assert.equal(result.migrated, false);
  assert.equal(fs.readFileSync(paths.configFile, 'utf8'), '{ broken');
});
