'use strict';

const fs = require('node:fs');
const path = require('node:path');

function normalizeOwnerTitle(value, fallback = '爸爸') {
  const text = String(value ?? '').replace(/[\r\n\t]/g, ' ').trim();
  return (text || fallback).slice(0, 16);
}

function buildSettingsUpdate(payload, current) {
  return {
    repoRoot: String(payload?.repoRoot || '').trim(),
    snowlumaRoot: String(payload?.snowlumaRoot || '').trim(),
    dshExe: String(payload?.dshExe || '').trim(),
    ownerTitle: payload?.ownerTitle === undefined ? current.ownerTitle : normalizeOwnerTitle(payload.ownerTitle),
    controlEnabled: payload?.controlEnabled === undefined ? Boolean(current.controlEnabled) : payload.controlEnabled === true,
    managerAutostart: payload?.managerAutostart === undefined ? Boolean(current.managerAutostart) : payload.managerAutostart === true,
    botAutostart: payload?.botAutostart === undefined ? Boolean(current.botAutostart) : payload.botAutostart === true,
    autoRecovery: payload?.autoRecovery === undefined ? Boolean(current.autoRecovery) : payload.autoRecovery === true
  };
}

function validateSettingsPaths(next) {
  for (const key of ['repoRoot', 'snowlumaRoot', 'dshExe']) {
    const value = next[key];
    if (!value || !path.isAbsolute(value)) throw new Error(`${key} 必须是绝对路径`);
    if (!fs.existsSync(value)) throw new Error(`${key} 不存在：${value}`);
  }
  return next;
}

module.exports = { normalizeOwnerTitle, buildSettingsUpdate, validateSettingsPaths };
