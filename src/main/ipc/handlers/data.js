'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { saveSettings, loadSettings } = require('../../paths');
const { buildConfigExport, validateConfigImport, configDiff } = require('../../data-transfer');

function assertJsonPath(file) {
  const target = path.resolve(String(file || ''));
  if (!target.toLowerCase().endsWith('.json')) throw new Error('请选择 .json 配置文件');
  return target;
}

function registerDataHandlers(router, { paths, getSettings, setSettings, log }) {
  router.handle('data:config-export', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showSaveDialog({
      title: '导出桌面配置',
      defaultPath: `dafiyu-config-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON 配置', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
    const file = assertJsonPath(result.filePath);
    const payload = buildConfigExport(getSettings(), { appVersion: require('../../../../package.json').version });
    fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    log('data', `config exported ${path.basename(file)}`);
    return { ok: true, path: file, bytes: fs.statSync(file).size };
  });

  router.handle('data:config-pick', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
      title: '选择桌面配置文件',
      properties: ['openFile'],
      filters: [{ name: 'JSON 配置', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths?.[0]) return { ok: false, cancelled: true };
    return { ok: true, path: path.resolve(result.filePaths[0]) };
  });

  router.handle('data:config-preview', async (_event, payload) => {
    const file = assertJsonPath(payload?.path);
    if (!fs.existsSync(file)) throw new Error('配置文件不存在');
    const parsed = validateConfigImport(fs.readFileSync(file, 'utf8'));
    const current = getSettings();
    return {
      ok: true,
      path: file,
      meta: parsed.meta,
      imported: parsed.imported,
      diff: configDiff(current, parsed.imported)
    };
  });

  router.handle('data:config-import', async (_event, payload) => {
    const file = assertJsonPath(payload?.path);
    if (!fs.existsSync(file)) throw new Error('配置文件不存在');
    const parsed = validateConfigImport(fs.readFileSync(file, 'utf8'));
    saveSettings(paths, { ...getSettings(), ...parsed.imported });
    const next = loadSettings(paths);
    setSettings(next);
    try {
      const { nativeTheme } = require('electron');
      nativeTheme.themeSource = next.theme === 'light' ? 'light' : next.theme === 'auto' ? 'system' : 'dark';
    } catch { /* headless tests */ }
    log('data', `config imported ${path.basename(file)} fields=${Object.keys(parsed.imported).join(',')}`);
    return { ok: true, path: file, settings: next, imported: parsed.imported };
  });
}

module.exports = { registerDataHandlers };
