'use strict';

const { buildSettingsUpdate, validateSettingsPaths } = require('../../domain/settings');

function registerSettingsHandlers(router, { paths, getSettings, setSettings, resetCache, log }) {
  router.handle('settings:get', async () => getSettings());
  router.handle('settings:save', async (_event, payload) => {
    const next = buildSettingsUpdate(payload, getSettings());
    validateSettingsPaths(next);
    const { saveSettings, loadSettings } = require('../../paths');
    saveSettings(paths, next);
    setSettings(loadSettings(paths));
    resetCache();
    log('settings', 'paths updated');
    return getSettings();
  });
}

module.exports = { registerSettingsHandlers };
