'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const BACKUP_VERSION = 1;
const SQLITE_METHOD = 'sqlite-vacuum-into';

// 需要备份的持久化数据（不包含日志/jsonl 审计流与模型文件）。
const SINGLE_FILES = [
  'config.json',
  'state/social-v2.json',
  'state/stickers.json',
  'state/persons.json',
  'state/slang.json',
  'state/mode.json',
  'state/current-role.json',
  'state/sessions.json',
  'state/feedback.json',
  'state/memory-baseline.json'
];

const DIRECTORY_FILES = [
  'roles',
  'state/agents',
  'state/shares',
  'state/slang-agent'
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function stampOf(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function walkFiles(root, relDir, out) {
  const abs = path.join(root, relDir);
  if (!fs.existsSync(abs)) return;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const rel = path.posix.join(relDir.split(path.sep).join('/'), entry.name);
    if (entry.isDirectory()) walkFiles(root, path.join(relDir, entry.name), out);
    else if (entry.isFile()) out.push(rel);
  }
}

function collectTargets(repoRoot) {
  const targets = [];
  for (const rel of SINGLE_FILES) {
    if (fs.existsSync(path.join(repoRoot, rel))) targets.push(rel);
  }
  for (const dir of DIRECTORY_FILES) {
    const files = [];
    walkFiles(repoRoot, path.join(...dir.split('/')), files);
    targets.push(...files.filter((rel) => !/\.(log|tmp)$/i.test(rel)));
  }
  return [...new Set(targets)].sort();
}

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function readCounts(db) {
  const count = (table) => (tableExists(db, table) ? Number(db.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c) : 0);
  return {
    traits: count('traits'),
    versions: count('trait_versions'),
    evidence: count('trait_evidence'),
    journal: count('growth_journal'),
    candidates: count('growth_candidates')
  };
}

function integrityOk(db) {
  try {
    const row = db.prepare('PRAGMA integrity_check').get();
    return row && Object.values(row)[0] === 'ok';
  } catch {
    return false;
  }
}

/**
 * 用 SQLite 的 VACUUM INTO 生成一致性快照：
 * - 快照包含 WAL 中已提交的事务，单文件、可独立打开；
 * - 不复制 memory.db 主文件，不影响正在运行的桥接。
 */
function backupDatabase(repoRoot, outFile) {
  const src = path.join(repoRoot, 'state', 'memory.db');
  if (!fs.existsSync(src)) {
    return { skipped: true, reason: 'memory.db 不存在' };
  }
  const db = new DatabaseSync(src, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout=8000');
    const before = readCounts(db);
    const escaped = outFile.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escaped}'`);
    return { skipped: false, sourceCounts: before };
  } finally {
    db.close();
  }
}

function verifyDatabase(file, expectedCounts) {
  if (!fs.existsSync(file)) return { ok: false, errors: ['备份中缺少 memory.db'] };
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const integrity = integrityOk(db);
    const counts = readCounts(db);
    const errors = [];
    if (!integrity) errors.push('memory.db integrity_check 未通过');
    if (expectedCounts) {
      for (const [key, value] of Object.entries(expectedCounts)) {
        if (Number(counts[key]) !== Number(value)) errors.push(`memory.db ${key} 数量不一致：期望 ${value}，实际 ${counts[key]}`);
      }
    }
    return { ok: errors.length === 0, errors, counts, integrity };
  } catch (error) {
    return { ok: false, errors: [`memory.db 无法打开：${error.message}`] };
  } finally {
    try { db && db.close(); } catch { /* ignore */ }
  }
}

function verifyBackup(dir) {
  const errors = [];
  const manifestFile = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestFile)) return { ok: false, errors: ['缺少 manifest.json'] };
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  } catch (error) {
    return { ok: false, errors: [`manifest.json 无法解析：${error.message}`] };
  }
  if (!Array.isArray(manifest.files)) return { ok: false, errors: ['manifest.files 不是数组'] };

  let checked = 0;
  for (const entry of manifest.files) {
    const rel = String(entry.path || '');
    if (!rel || rel.includes('..') || path.isAbsolute(rel)) {
      errors.push(`非法路径：${rel}`);
      continue;
    }
    const file = path.join(dir, rel);
    if (!fs.existsSync(file)) {
      errors.push(`缺少文件：${rel}`);
      continue;
    }
    const stat = fs.statSync(file);
    if (Number(entry.size) !== stat.size) errors.push(`${rel} 大小不一致`);
    let hash = null;
    try { hash = sha256(file); } catch (error) { errors.push(`${rel} 读取失败：${error.message}`); continue; }
    if (entry.sha256 !== hash) errors.push(`${rel} 哈希不一致`);
    checked += 1;
  }

  const dbFile = path.join(dir, 'memory.db');
  const expected = manifest.sqlite && manifest.sqlite.counts;
  const dbCheck = verifyDatabase(dbFile, expected);
  errors.push(...dbCheck.errors);

  return {
    ok: errors.length === 0,
    errors,
    checked,
    counts: dbCheck.counts || null,
    integrity: dbCheck.integrity === true,
    createdAt: manifest.createdAt || null,
    manifest
  };
}

function createBackup({ repoRoot, backupRoot, clock = new Date(), appVersion = '0.1.0' }) {
  if (!repoRoot || !fs.existsSync(repoRoot)) throw new Error(`项目目录不存在：${repoRoot}`);
  const root = backupRoot || path.join(repoRoot, 'backups');
  fs.mkdirSync(root, { recursive: true });

  const stamp = stampOf(clock);
  let finalDir = path.join(root, `desktop-${stamp}`);
  let index = 2;
  while (fs.existsSync(finalDir)) {
    finalDir = path.join(root, `desktop-${stamp}-${index}`);
    index += 1;
  }
  const tempDir = path.join(root, `.tmp-desktop-${stamp}-${process.pid}`);
  fs.mkdirSync(tempDir, { recursive: false });

  const cleanup = () => {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  };

  try {
    const files = [];
    for (const rel of collectTargets(repoRoot)) {
      const src = path.join(repoRoot, rel);
      const dst = path.join(tempDir, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      const stat = fs.statSync(dst);
      files.push({ path: rel.split(path.sep).join('/'), size: stat.size, sha256: sha256(dst) });
    }

    const dbResult = backupDatabase(repoRoot, path.join(tempDir, 'memory.db'));
    let sqlite = null;
    if (!dbResult.skipped) {
      const dbCheck = verifyDatabase(path.join(tempDir, 'memory.db'), null);
      if (!dbCheck.ok) throw new Error(`备份数据库校验失败：${dbCheck.errors.join('; ')}`);
      sqlite = { method: SQLITE_METHOD, counts: dbCheck.counts, integrity: dbCheck.integrity };
      files.push({
        path: 'memory.db',
        size: fs.statSync(path.join(tempDir, 'memory.db')).size,
        sha256: sha256(path.join(tempDir, 'memory.db'))
      });
    }

    const manifest = {
      version: BACKUP_VERSION,
      createdAt: clock.toISOString(),
      appVersion,
      repoRoot,
      method: 'desktop-backup',
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
      sqlite,
      note: '数据库使用 SQLite VACUUM INTO 一致性快照；不含日志/模型/音频。'
    };
    fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'README.txt'), [
      '大肥鱼桌面前数据备份',
      `创建时间：${manifest.createdAt}`,
      `来源：${repoRoot}`,
      '',
      '包含：config.json、roles/、state/ 下的会话/记忆/社交/表情等 JSON，以及 memory.db（VACUUM INTO 快照）。',
      '不包含：日志、jsonl 审计流水、音频、模型与工具目录。',
      '',
      '恢复：当前版本只支持校验与人工恢复；恢复前请先停止桥接，并再创建一次当前备份。',
      ''
    ].join('\n'), 'utf8');

    const verify = verifyBackup(tempDir);
    if (!verify.ok) throw new Error(`备份自检失败：${verify.errors.join('; ')}`);

    fs.renameSync(tempDir, finalDir);
    const finalVerify = verifyBackup(finalDir);
    return {
      dir: finalDir,
      createdAt: manifest.createdAt,
      files: manifest.files.length,
      sizeBytes: manifest.files.reduce((sum, item) => sum + item.size, 0),
      sqlite: sqlite ? sqlite.counts : null,
      verify: finalVerify
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}

function listBackups(repoRoot, extraRoots = []) {
  const roots = [path.join(repoRoot, 'backups'), ...extraRoots];
  const out = [];
  for (const root of roots) {
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const dir = path.join(root, entry.name);
      let manifest = null;
      try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); } catch { /* 非桌面备份 */ }
      let size = 0;
      try {
        const walk = (current) => {
          for (const item of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, item.name);
            if (item.isDirectory()) walk(full);
            else size += fs.statSync(full).size;
          }
        };
        walk(dir);
      } catch { /* ignore */ }
      out.push({
        name: entry.name,
        dir,
        root,
        size,
        mtimeMs: fs.statSync(dir).mtimeMs,
        desktop: Boolean(manifest),
        manifest: manifest ? { createdAt: manifest.createdAt, files: (manifest.files || []).length, sqlite: manifest.sqlite || null } : null
      });
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/**
 * 备份保留策略：只删除“桌面创建且带 manifest”的 desktop-* 目录，保留最新 N 份。
 * 不触碰 memory-*、worktree-* 等原有备份，也不删除非本软件创建的目录。
 */
function pruneBackups({ repoRoot, keep = 10, extraRoots = [] } = {}) {
  const roots = [path.join(repoRoot, 'backups'), ...extraRoots];
  const removed = [];
  const kept = [];
  for (const root of roots) {
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^desktop-\d{8}-\d{6}(-\d+)?$/.test(entry.name)) continue;
      const dir = path.join(root, entry.name);
      if (!fs.existsSync(path.join(dir, 'manifest.json'))) continue;
      try { candidates.push({ dir, name: entry.name, mtimeMs: fs.statSync(dir).mtimeMs }); } catch { /* ignore */ }
    }
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    candidates.forEach((item, index) => {
      if (index < keep) { kept.push(item.dir); return; }
      try {
        fs.rmSync(item.dir, { recursive: true, force: true });
        removed.push(item.dir);
      } catch { /* 删除失败保留原样 */ }
    });
  }
  return { removed, kept };
}

/**
 * 恢复演练：只把备份中的 memory.db 复制到桌面测试路径，校验完整性和计数。
 * 不接触生产 memory.db；调用方负责传入受控 targetFile。
 */
function restoreDrill({ backupDir, targetFile }) {
  const source = path.join(backupDir, 'memory.db');
  if (!fs.existsSync(source)) throw new Error('备份中没有 memory.db');
  if (!fs.existsSync(path.join(backupDir, 'manifest.json'))) throw new Error('备份缺少 manifest.json');
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.copyFileSync(source, targetFile);
  const db = new DatabaseSync(targetFile, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA quick_check(1)').get()?.quick_check || 'unknown';
    const count = (table) => {
      try { return Number(db.prepare(`SELECT COUNT(*) c FROM ${table}`).get()?.c || 0); } catch { return null; }
    };
    return {
      ok: integrity === 'ok',
      source,
      target: targetFile,
      integrity,
      counts: { facts: count('facts'), events: count('events'), messages: count('messages'), traits: count('traits') }
    };
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

module.exports = { createBackup, verifyBackup, listBackups, pruneBackups, restoreDrill, collectTargets, stampOf, readCounts, integrityOk };
