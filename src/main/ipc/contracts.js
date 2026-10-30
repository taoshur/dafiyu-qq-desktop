'use strict';

// Stable IPC surface. Keep this list in sync with preload/index.js.
const CHANNELS = Object.freeze([
  'app:info',
  'update:check',
  'update:download',
  'update:status',
  'health:snapshot',
  'logs:list',
  'logs:tail',
  'config:summary',
  'services:action',
  'embed:show',
  'embed:bounds',
  'embed:hide',
  'embed:state',
  'environment:detect',
  'bilibili:status',
  'bilibili:ack',
  'install:catalog',
  'install:start',
  'install:status',
  'install:cancel',
  'clipboard:write',
  'app:open-external',
  'setup:status',
  'control:state',
  'control:set-enabled',
  'control:start',
  'control:stop',
  'control:recover-sentinel',
  'control:preflight',
  'control:start-original',
  'backups:list',
  'backups:create',
  'backups:verify',
  'backups:restore-drill',
  'startup:status',
  'watchdog:status',
  'autostart:status',
  'autostart:register',
  'autostart:unregister',
  'startup:info',
  'recovery:status',
  'memory:status',
  'memory:list',
  'memory:candidate',
  'memory:test-init',
  'memory:review',
  'memory:dead-letters',
  'memory:retry-dead',
  'memory:review-unlock',
  'memory:review-audit',
  'memory:maibot-pick',
  'memory:maibot-preview',
  'memory:maibot-import',
  'data:config-export',
  'data:config-pick',
  'data:config-preview',
  'data:config-import',
  'settings:get',
  'settings:save'
]);

const CHANNEL_SET = new Set(CHANNELS);

function isKnownChannel(channel) {
  return CHANNEL_SET.has(String(channel || ''));
}

module.exports = { CHANNELS, CHANNEL_SET, isKnownChannel };
