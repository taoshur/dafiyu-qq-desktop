'use strict';

const chat = require('../../chat-settings');

function registerChatSettingsHandlers(router, { getSettings, log = () => {} }) {
  router.handle('chat-settings:get', async () => chat.get(getSettings().repoRoot));
  router.handle('chat-settings:save', async (_event, payload) => {
    const result = chat.save(getSettings().repoRoot, payload);
    log('chat-settings', `fastPath ${result.enabled ? 'on' : 'off'} model=${result.model}`);
    return { ...result, needsBridgeRestart: true };
  });
  router.handle('chat-settings:models', async (_event, payload) => chat.listModels(getSettings().repoRoot, payload));
}

module.exports = { registerChatSettingsHandlers };
