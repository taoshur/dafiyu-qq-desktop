'use strict';

const fs = require('node:fs');
const path = require('node:path');

function configFile(repoRoot) { return path.join(repoRoot, 'config.json'); }
function readConfig(repoRoot) { try { return JSON.parse(fs.readFileSync(configFile(repoRoot), 'utf8')); } catch { return {}; } }

function get(repoRoot) {
  const friend = readConfig(repoRoot)?.socialV2?.friendRequest || {};
  return {
    autoApprove: friend.autoApprove === true,
    maxPerDay: Number.isFinite(Number(friend.autoApproveMaxPerDay)) ? Math.max(1, Number(friend.autoApproveMaxPerDay)) : 5
  };
}

function save(repoRoot, input = {}) {
  const cfg = readConfig(repoRoot);
  if (!cfg.socialV2 || typeof cfg.socialV2 !== 'object') cfg.socialV2 = {};
  if (!cfg.socialV2.friendRequest || typeof cfg.socialV2.friendRequest !== 'object') cfg.socialV2.friendRequest = {};
  cfg.socialV2.friendRequest.autoApprove = input.autoApprove === true;
  cfg.socialV2.friendRequest.autoApproveMaxPerDay = Math.max(1, Math.floor(Number(input.maxPerDay) || 5));
  const file = configFile(repoRoot);
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, file);
  return get(repoRoot);
}

module.exports = { get, save };
