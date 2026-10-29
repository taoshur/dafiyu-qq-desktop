'use strict';

function registerUpdateHandlers(router, { updateManager }) {
  router.handle('update:check', async () => updateManager.check());
  router.handle('update:download', async () => updateManager.downloadAndRun());
  router.handle('update:status', async () => updateManager.status());
}

module.exports = { registerUpdateHandlers };
