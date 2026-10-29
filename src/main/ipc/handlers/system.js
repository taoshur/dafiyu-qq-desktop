'use strict';

const { buildSnapshot } = require('../../health');
const { listSources, tailSource } = require('../../logs');
const { definitions, dependencyPlan } = require('../../services');
const { readProjectConfig } = require('../../paths');
const { buildAppInfo } = require('../../domain/app-info');
const { detectEnvironment } = require('../../environment');

const LOG_SOURCES = new Set(['bridge', 'activity', 'watchdog', 'growth', 'snowluma']);

function registerSystemHandlers(router, { paths, getSettings, cache }) {
  router.handle('app:info', async () => buildAppInfo({ paths, getSettings }));

  router.handle('health:snapshot', async () => {
    if (cache.value && Date.now() - cache.at < 1000) return cache.value;
    const settings = getSettings();
    const value = await buildSnapshot(settings, { mockMode: true });
    value.plan = dependencyPlan(definitions(settings));
    cache.at = Date.now();
    cache.value = value;
    return value;
  });

  router.handle('logs:list', async () => listSources(getSettings()));
  router.handle('logs:tail', async (_event, payload) => {
    const source = String(payload?.source || '');
    if (!LOG_SOURCES.has(source)) throw new Error('日志来源不在白名单内');
    const lines = Number(payload?.lines);
    if (!Number.isFinite(lines) || lines < 1 || lines > 500) throw new Error('行数必须是 1–500');
    return tailSource(getSettings(), source, lines);
  });

  router.handle('config:summary', async () => readProjectConfig(getSettings().repoRoot));

  router.handle('environment:detect', async (_event, payload) => {
    const settings = getSettings();
    let snapshot = null;
    try { snapshot = await buildSnapshot(settings, { mockMode: false }); } catch { snapshot = null; }
    return detectEnvironment({ settings, snapshot, checkNetwork: payload?.network !== false });
  });
}

module.exports = { registerSystemHandlers };
