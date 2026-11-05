'use strict';

const friend = require('../../friend-settings');

function registerFriendSettingsHandlers(router, { getSettings, log = () => {} }) {
  router.handle('friend-settings:get', async () => friend.get(getSettings().repoRoot));
  router.handle('friend-settings:save', async (_event, payload) => {
    const result = friend.save(getSettings().repoRoot, payload);
    log('friend-settings', `autoApprove=${result.autoApprove} max=${result.maxPerDay}`);
    return { ...result, needsBridgeRestart: true };
  });
}

module.exports = { registerFriendSettingsHandlers };
