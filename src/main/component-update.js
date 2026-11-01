'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { tcpProbe } = require('./health');

const REPO = 'taoshur/dafiyu-qq-desktop';
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const COMPONENT_RE = /^qq-bridge-.*\.zip$/i;
const PROTECTED = new Set(['config.json', 'config.example.json', 'state', 'roles', 'logs', 'node_modules', 'key.txt', '.env', '.git']);

function getJson(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout: timeoutMs,
      headers: { 'user-agent': 'dafiyu-component-update', accept: 'application/vnd.github+json' }
    }, (res) => {
      const status = Number(res.statusCode || 0);
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (status !== 200) return reject(new Error(`更新服务 HTTP ${status}`));
        try { resolve(JSON.parse(body)); } catch (error) { reject(new Error(`更新服务返回无效 JSON：${error.message}`)); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('检查组件更新超时')); });
    req.on('error', reject);
  });
}

function readBridgeVersion(repoRoot) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    return String(pkg.version || '0.0.0');
  } catch {
    return '0.0.0';
  }
}

function selectAsset(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  return assets.find((asset) => COMPONENT_RE.test(String(asset.name || '')) && asset.state === 'uploaded') || null;
}

async function check(repoRoot) {
  const currentVersion = readBridgeVersion(repoRoot);
  const release = await getJson(LATEST);
  const asset = selectAsset(release);
  if (!asset) {
    return { ok: true, available: false, currentVersion, latestVersion: currentVersion, reason: '最新 Release 没有 qqbridge 组件包' };
  }
  const latestVersion = String(asset.name).replace(/^qq-bridge-/i, '').replace(/\.zip$/i, '');
  return {
    ok: true,
    available: latestVersion !== currentVersion,
    currentVersion,
    latestVersion,
    asset: {
      name: String(asset.name),
      url: String(asset.browser_download_url),
      size: Number(asset.size) || 0,
      digest: String(asset.digest || '')
    },
    releaseUrl: String(release.html_url || ''),
    notes: String(release.body || '').slice(0, 4000)
  };
}

function download(url, target, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('下载重定向过多'));
    const req = https.get(url, {
      timeout: 120000,
      headers: { 'user-agent': 'dafiyu-component-update' }
    }, (res) => {
      const status = Number(res.statusCode || 0);
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
        res.resume();
        return resolve(download(new URL(res.headers.location, url).toString(), target, redirects + 1));
      }
      if (status !== 200) {
        res.resume();
        return reject(new Error(`组件下载 HTTP ${status}`));
      }
      const out = fs.createWriteStream(target);
      let received = 0;
      res.on('data', (chunk) => { received += chunk.length; });
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve({ bytes: received })));
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('组件下载超时')); });
    req.on('error', reject);
  });
}

function safeListZip(zipFile) {
  const listing = execFileSync('tar.exe', ['-tf', zipFile], { encoding: 'utf8', windowsHide: true });
  for (const raw of listing.split(/\r?\n/)) {
    const name = raw.trim().replace(/\\/g, '/');
    if (!name) continue;
    if (name.startsWith('/') || name.includes('../') || /^[A-Za-z]:/.test(name)) {
      throw new Error(`组件包包含不安全路径：${name}`);
    }
  }
}

function copyCode(source, target) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (PROTECTED.has(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyCode(from, to);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }
}

function backupCode(repoRoot, backupRoot) {
  const targets = ['src', 'scripts', 'plugins', 'dsh', 'public', 'assets', 'tools/bilibili-mcp', 'package.json', 'package-lock.json', 'README.md', 'README.en.md', 'RULES.md', 'LICENSE', 'config.example.json', 'start.bat', 'start-qq-bridge.cmd', 'start-qq-bridge-silent.cmd', 'start-qq-bridge-hidden.vbs', 'restart.bat', '.gitignore', '.npmrc'];
  fs.mkdirSync(backupRoot, { recursive: true });
  for (const name of targets) {
    const from = path.join(repoRoot, name);
    if (!fs.existsSync(from)) continue;
    const to = path.join(backupRoot, name);
    fs.cpSync(from, to, { recursive: true, force: true });
  }
}

function restoreCode(repoRoot, backupRoot) {
  copyCode(backupRoot, repoRoot);
}

function bridgePids(repoRoot) {
  const script = `$owners = @(Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($ownerPid in $owners) {
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid"
  if (-not $proc -or $proc.Name -ne 'node.exe') { continue }
  if ($proc.CommandLine -notlike '*bridge.js*') { continue }
  $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.ParentProcessId)"
  if ($parent -and $parent.CommandLine -like '*start-bridge.mjs*') { $parent.ProcessId }
  $proc.ProcessId
}`;
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    return [...new Set(out.split(/\s+/).map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0))];
  } catch {
    return [];
  }
}

function stopBridge(repoRoot) {
  const pids = bridgePids(repoRoot);
  for (const pid of pids) {
    try { execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 15000 }); } catch { /* already gone */ }
  }
  return pids;
}

function startBridge(repoRoot) {
  let node = 'node.exe';
  try { node = execFileSync('where.exe', ['node.exe'], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/)[0].trim() || node; } catch { /* PATH */ }
  const child = spawn(node, [path.join(repoRoot, 'src', 'bridge.js')], {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
}

async function waitBridge(timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await tcpProbe(3100, '127.0.0.1', 700)) return true;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return false;
}

async function update(repoRoot, { log = () => {} } = {}) {
  const info = await check(repoRoot);
  if (!info.available) return { ok: false, reason: '当前没有可用的 qqbridge 更新' };
  const tempRoot = path.join(repoRoot, 'state', 'component-update');
  const zipFile = path.join(tempRoot, info.asset.name);
  const extractDir = path.join(tempRoot, `extract-${Date.now()}`);
  const backupRoot = path.join(repoRoot, 'state', `component-backup-${Date.now()}`);
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  try {
    await download(info.asset.url, zipFile);
    const digest = `sha256:${crypto.createHash('sha256').update(fs.readFileSync(zipFile)).digest('hex')}`;
    if (info.asset.digest && info.asset.digest.toLowerCase() !== digest.toLowerCase()) {
      throw new Error('组件校验失败：SHA256 不匹配');
    }
    safeListZip(zipFile);
    execFileSync('tar.exe', ['-xf', zipFile, '-C', extractDir], { windowsHide: true, timeout: 30000 });
    backupCode(repoRoot, backupRoot);
    const stopped = stopBridge(repoRoot);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (!stopped.length && await tcpProbe(3100, '127.0.0.1', 700)) {
      throw new Error('无法确认 qqbridge 进程归属，已取消更新（3100 仍在监听）');
    }
    log('component', `qqbridge update ${info.currentVersion} -> ${info.latestVersion}; stopped=${stopped.length}`);
    copyCode(extractDir, repoRoot);
    startBridge(repoRoot);
    const healthy = await waitBridge();
    if (!healthy) {
      restoreCode(repoRoot, backupRoot);
      stopBridge(repoRoot);
      startBridge(repoRoot);
      throw new Error('qqbridge 启动后 3100 未就绪，已回滚');
    }
    return { ok: true, currentVersion: info.currentVersion, latestVersion: info.latestVersion, backup: backupRoot };
  } catch (error) {
    try { restoreCode(repoRoot, backupRoot); } catch { /* ignore */ }
    try { stopBridge(repoRoot); startBridge(repoRoot); } catch { /* ignore */ }
    throw error;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

module.exports = { check, update, bridgePids };
