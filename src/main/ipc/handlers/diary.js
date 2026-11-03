'use strict';

const diary = require('../../diary');

function registerDiaryHandlers(router, { getSettings, log = () => {} }) {
  router.handle('diary:list', async () => {
    const repoRoot = getSettings().repoRoot;
    return { enabled: diary.isEnabled(repoRoot), entries: diary.list(repoRoot) };
  });

  router.handle('diary:get', async (_event, payload) => {
    const repoRoot = getSettings().repoRoot;
    return diary.get(repoRoot, String(payload?.date || ''));
  });

  router.handle('diary:set-enabled', async (_event, payload) => {
    const result = diary.setEnabled(getSettings().repoRoot, payload?.enabled === true);
    log('diary', `auto diary ${result.enabled ? 'enabled' : 'disabled'}`);
    return { ...result, needsBridgeRestart: true };
  });
}

module.exports = { registerDiaryHandlers };
