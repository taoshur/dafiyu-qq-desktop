'use strict';

function registerUpdateHandlers(router, { taskService }) {
  router.handle('update:check', async () => taskService.check());
  router.handle('update:download', async () => taskService.startUpdate());
  router.handle('update:status', async () => taskService.status().update);
}

module.exports = { registerUpdateHandlers };
