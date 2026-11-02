'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const SECRET_KEYS = /^(authToken|accessToken|consoleToken|apiKey|password|passwordHash|passwordSalt|cookie|secret|clientSecret|token)$/i;

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEYS.test(key)) continue;
    out[key] = sanitize(child);
  }
  return out;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function copyTree(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === 'manifest.json' || entry.name === 'README.txt') continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }
}

/**
 * Create a portable ZIP. The source backup already contains roles, state and
 * memory.db; config.json is sanitized so tokens/keys are not exported.
 */
function exportBackup({ backupDir, targetFile, appVersion = '' }) {
  const source = path.resolve(String(backupDir || ''));
  const target = path.resolve(String(targetFile || ''));
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) throw new Error('备份目录不存在');
  if (!target.toLowerCase().endsWith('.zip')) throw new Error('导出文件必须是 .zip');
  const temp = path.join(path.dirname(target), `.dafiyu-export-${process.pid}-${Date.now()}`);
  fs.mkdirSync(temp, { recursive: false });
  try {
    copyTree(source, temp);
    const configFile = path.join(temp, 'config.json');
    if (fs.existsSync(configFile)) {
      const raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      fs.writeFileSync(configFile, JSON.stringify(sanitize(raw), null, 2) + '\n', 'utf8');
    }
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile()) {
          const rel = path.relative(temp, full).split(path.sep).join('/');
          files.push({ path: rel, size: fs.statSync(full).size, sha256: sha256(full) });
        }
      }
    };
    walk(temp);
    const manifest = {
      format: 'dafiyu-portable-export',
      version: 1,
      createdAt: new Date().toISOString(),
      appVersion: String(appVersion || ''),
      source: 'desktop backup',
      contains: ['人格 / 角色', '记忆数据库', 'qqbridge 配置（已移除 token/key）', '状态数据'],
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
      note: 'config.json 已脱敏；不包含日志、模型、音频。恢复前请备份现有数据。'
    };
    fs.writeFileSync(path.join(temp, 'manifest-export.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(temp, 'README-EXPORT.txt'), [
      '大肥鱼数据导出包',
      `导出时间：${manifest.createdAt}`,
      '包含：角色/人格、记忆数据库、脱敏后的 qqbridge 配置、状态数据。',
      '不包含：token、API Key、日志、模型、音频。',
      '恢复前请先备份目标机器现有数据；不要公开分享此压缩包。',
      ''
    ].join('\n'), 'utf8');
    fs.rmSync(target, { force: true });
    execFileSync('tar.exe', ['-a', '-cf', target, '-C', temp, '.'], { windowsHide: true, timeout: 120000 });
    const stat = fs.statSync(target);
    return { ok: true, path: target, bytes: stat.size, files: manifest.files.length };
  } finally {
    try { fs.rmSync(temp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

module.exports = { exportBackup, sanitize };
