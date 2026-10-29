'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createInstallManager } = require('../src/main/install-task');
const { createUpdateManager } = require('../src/main/updates');
const { createPaths } = require('../src/main/paths');
const { classifyServiceState } = require('../src/main/service-state');

test('Phase 0: service state classification stays stable', () => {
  assert.equal(classifyServiceState({ record: null }).state, 'unmanaged');
  assert.equal(classifyServiceState({ record: {}, intent: true }).state, 'stopped-by-user');
  assert.equal(classifyServiceState({ record: {}, processAlive: false }).state, 'crashed');
  assert.equal(classifyServiceState({ record: {}, processAlive: true, identityOk: false }).state, 'unknown');
  assert.equal(classifyServiceState({ record: {}, processAlive: true, identityOk: true, portOpen: false }).state, 'degraded');
  assert.equal(classifyServiceState({ record: {}, processAlive: true, identityOk: true, portOpen: true }).state, 'healthy');
});

test('Phase 0: task managers have a stable idle/cancel baseline', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-baseline-'));
  const paths = createPaths(path.join(root, 'userData'));
  const install = createInstallManager({ paths, settings: {}, log: () => {} });
  const update = createUpdateManager({ currentVersion: '0.0.0', paths, log: () => {} });
  assert.equal(install.status(), null);
  assert.equal(update.status(), null);
  assert.equal((await install.cancel()).ok, false);
  assert.equal((await update.check()).ok, true);
});


test('Supervisor facade delegates without changing controller behavior', () => {
  const { createServiceSupervisor } = require('../src/main/domain/services/supervisor');
  let started = 0;
  const controller = {
    record: null,
    reconcile: async () => {},
    records: () => ({}),
    sentinel: () => ({ exists: false }),
    buildDefinitions: () => ({ bridge: {} }),
    start: async () => { started += 1; return { ok: true }; },
    stop: async () => ({ ok: true }),
    preflight: async () => ({ ok: true }),
    recoverSentinel: async () => ({ ok: true }),
    startOriginalBridge: async () => ({ ok: true }),
    stopOwnedServices: async () => ({ ok: true })
  };
  const supervisor = createServiceSupervisor({ controller });
  assert.equal(supervisor.controller, controller);
  assert.deepEqual(supervisor.sentinel(), { exists: false });
  return supervisor.start('bridge').then((result) => {
    assert.equal(result.ok, true);
    assert.equal(started, 1);
  });
});


test('Shared task journal keeps install/update metadata and survives corruption', () => {
  const { createTaskJournal } = require('../src/main/domain/tasks/journal');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-journal-'));
  const file = path.join(root, 'tasks.json');
  const journal = createTaskJournal({ file });
  journal.record({ id: 'install-1', kind: 'install', component: 'bridge', status: 'downloading', targetDir: 'C:/x', version: 'v1', percent: 20 });
  journal.record({ id: 'update-1', kind: 'update', status: 'completed', percent: 100 });
  assert.equal(journal.list().length, 2);
  assert.equal(journal.get('install-1').kind, 'install');
  fs.writeFileSync(file, '{ broken', 'utf8');
  assert.deepEqual(journal.list(), []);
  journal.record({ id: 'update-2', kind: 'update', status: 'failed', error: 'x' });
  assert.equal(journal.get('update-2').status, 'failed');
});


test('Unified task service enforces one active install/update task', async () => {
  const { createTaskService } = require('../src/main/domain/tasks/service');
  let installActive = false;
  const installManager = {
    status: () => (installActive ? { status: 'downloading', kind: 'install' } : null),
    start: () => { installActive = true; return { ok: true, task: { status: 'downloading' } }; },
    cancel: async () => { installActive = false; return { ok: true }; }
  };
  const updateManager = {
    status: () => null,
    check: async () => ({ ok: true }),
    downloadAndRun: async () => ({ ok: true, task: { status: 'downloading' } }),
    cancel: async () => ({ ok: true })
  };
  const service = createTaskService({ installManager, updateManager, journal: null });
  assert.equal(service.startInstall({ confirmed: true }).ok, true);
  assert.equal(service.status().active, 'install');
  const blocked = await service.startUpdate();
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /已有安装/);
  await service.cancel();
  assert.equal(service.status().active, null);
});
