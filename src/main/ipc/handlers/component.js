'use strict';

const componentUpdate = require('../../component-update');

function registerComponentHandlers(router, { getSettings, log }) {
  router.handle('component:check', async () => componentUpdate.check(getSettings().repoRoot));
  router.handle('component:update', async () => {
    const result = await componentUpdate.update(getSettings().repoRoot, { log });
    log('component', `qqbridge ${result.currentVersion} -> ${result.latestVersion}`);
    return result;
  });
  router.handle('component:snowluma-check', async () => componentUpdate.checkSnowLuma(getSettings().snowlumaRoot));
  router.handle('component:snowluma-update', async (event) => {
    const settings = getSettings();
    const sendProgress = (progress) => {
      try { event?.sender?.send('component:snowluma-progress', progress); } catch { /* window may be closing */ }
    };
    const result = await componentUpdate.updateSnowLuma(settings.snowlumaRoot, { repoRoot: settings.repoRoot, log, onProgress: sendProgress });
    log('component', `SnowLuma ${result.currentVersion} -> ${result.latestVersion}`);
    return result;
  });
}

module.exports = { registerComponentHandlers };
