'use strict';

const { buildSettingsUpdate, validateSettingsPaths } = require('../../domain/settings');

function registerSettingsHandlers(router, { paths, getSettings, setSettings, resetCache, log }) {
  router.handle('settings:get', async () => getSettings());
  router.handle('settings:save', async (_event, payload) => {
    const next = buildSettingsUpdate(payload, getSettings());
    validateSettingsPaths(next);
    const { saveSettings, loadSettings } = require('../../paths');
    saveSettings(paths, next);
    const saved = loadSettings(paths);
    setSettings(saved);
    try {
      const { nativeTheme } = require('electron');
      nativeTheme.themeSource = saved.theme === 'light' ? 'light' : saved.theme === 'auto' ? 'system' : 'dark';
    } catch { /* tests/headless */ }
    resetCache();
    log('settings', 'paths updated');
    return getSettings();
  });
}

module.exports = { registerSettingsHandlers };
