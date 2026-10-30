'use strict';

const CONFIG_FIELDS = [
  'ownerTitle',
  'theme',
  'repoRoot',
  'snowlumaRoot',
  'dshExe',
  'controlEnabled',
  'managerAutostart',
  'botAutostart',
  'autoRecovery'
];

const STRING_FIELDS = new Set(['ownerTitle', 'repoRoot', 'snowlumaRoot', 'dshExe']);
const THEME_VALUES = new Set(['dark', 'light', 'auto']);
const BOOLEAN_FIELDS = new Set(['controlEnabled', 'managerAutostart', 'botAutostart', 'autoRecovery']);

function buildConfigExport(settings, { appVersion = '' } = {}) {
  const values = {};
  for (const key of CONFIG_FIELDS) {
    if (settings && settings[key] !== undefined) values[key] = settings[key];
  }
  return {
    format: 'dafiyu-config',
    formatVersion: 1,
    appVersion: String(appVersion || ''),
    exportedAt: new Date().toISOString(),
    settings: values
  };
}

function validateConfigImport(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { throw new Error('配置文件不是合法 JSON'); }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('配置文件格式无效');
  if (data.format !== 'dafiyu-config') throw new Error('不是 Dafiyu 桌面配置文件');
  if (Number(data.formatVersion) !== 1) throw new Error(`不支持的配置格式版本：${data.formatVersion}`);
  const source = data.settings && typeof data.settings === 'object' ? data.settings : {};
  const next = {};
  for (const key of CONFIG_FIELDS) {
    if (source[key] === undefined) continue;
    if (key === 'theme') {
      if (!THEME_VALUES.has(source[key])) throw new Error('主题值无效');
      next[key] = source[key];
    } else if (STRING_FIELDS.has(key)) {
      if (typeof source[key] !== 'string' || source[key].length > 2000) throw new Error(`字段 ${key} 无效`);
      next[key] = source[key].trim();
    } else if (BOOLEAN_FIELDS.has(key)) {
      if (typeof source[key] !== 'boolean') throw new Error(`字段 ${key} 必须是布尔值`);
      next[key] = source[key];
    }
  }
  if (!Object.keys(next).length) throw new Error('配置文件中没有可导入的字段');
  return { ok: true, imported: next, meta: { appVersion: data.appVersion || '', exportedAt: data.exportedAt || '' } };
}

function configDiff(current, imported) {
  const rows = [];
  for (const key of Object.keys(imported)) {
    const before = current?.[key];
    const after = imported[key];
    if (String(before ?? '') !== String(after ?? '')) rows.push({ key, before, after });
  }
  return rows;
}

module.exports = { CONFIG_FIELDS, buildConfigExport, validateConfigImport, configDiff };
