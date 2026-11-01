'use strict';

const componentUpdate = require('../../component-update');

function registerComponentHandlers(router, { getSettings, log }) {
  router.handle('component:check', async () => componentUpdate.check(getSettings().repoRoot));
  router.handle('component:update', async () => {
    const result = await componentUpdate.update(getSettings().repoRoot, { log });
    log('component', `qqbridge ${result.currentVersion} -> ${result.latestVersion}`);
    return result;
  });
}

module.exports = { registerComponentHandlers };
