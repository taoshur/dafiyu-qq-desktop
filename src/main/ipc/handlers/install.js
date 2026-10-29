'use strict';

const path = require('node:path');
const { catalogFor, defaultInstallRoot } = require('../../install-catalog');
const { parseInstallRequest } = require('../../domain/install-request');

function registerInstallHandlers(router, { taskService, log }) {
  router.handle('install:catalog', async () => ({
    bridge: catalogFor('bridge'),
    snowluma: catalogFor('snowluma'),
    dsh: catalogFor('dsh'),
    defaultRoot: defaultInstallRoot()
  }));

  router.handle('install:start', async (_event, payload) => {
    const request = parseInstallRequest(payload);
    if (!request.ok) return { ok: false, reason: request.error.message };
    const result = taskService.startInstall(request.value);
    log('install', `start ${request.value.component} dir=${request.value.targetDir ? path.basename(request.value.targetDir) : 'default'} ok=${result.ok}`);
    return result;
  });

  router.handle('install:status', async () => taskService.status().install);
  router.handle('install:cancel', async () => taskService.cancel());
}

module.exports = { registerInstallHandlers };
