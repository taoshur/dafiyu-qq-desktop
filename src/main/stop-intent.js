'use strict';

const fs = require('node:fs');
const path = require('node:path');

function fileOf(stateDir) {
  return path.join(stateDir, 'control-intent.json');
}

function readAll(stateDir) {
  try { return JSON.parse(fs.readFileSync(fileOf(stateDir), 'utf8')) || {}; } catch { return {}; }
}

function writeAll(stateDir, data) {
  fs.mkdirSync(stateDir, { recursive: true });
  const file = fileOf(stateDir);
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

/** 用户主动停止：写入意图，恢复引擎与 watchdog 协调都必须尊重。 */
function setStoppedByUser(stateDir, service, { now = Date.now(), reason = 'user-stop' } = {}) {
  const data = readAll(stateDir);
  data.services = data.services || {};
  data.services[service] = { intent: 'stopped-by-user', at: now, reason };
  writeAll(stateDir, data);
  return data.services[service];
}

function clearStoppedByUser(stateDir, service) {
  const data = readAll(stateDir);
  if (data.services && data.services[service]) {
    delete data.services[service];
    writeAll(stateDir, data);
    return true;
  }
  return false;
}

function getIntent(stateDir, service) {
  const data = readAll(stateDir);
  const entry = data.services && data.services[service];
  if (!entry) return null;
  if (entry.intent !== 'stopped-by-user') return null;
  return entry;
}

module.exports = { setStoppedByUser, clearStoppedByUser, getIntent, readAll };
