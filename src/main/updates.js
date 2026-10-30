'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const REPO = 'taoshur/dafiyu-qq-desktop';
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const ASSET_NAME = 'Dafiyu-Control-Center-Setup.exe';

function parseVersion(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  if (!match) return { parts: [0, 0, 0], prerelease: [] };
  return {
    parts: [Number(match[1]) || 0, Number(match[2]) || 0, Number(match[3]) || 0],
    prerelease: match[4] ? match[4].split('.').filter(Boolean) : []
  };
}

function comparePrerelease(a, b) {
  if (!a.length && !b.length) return 0;
  if (!a.length) return 1;
  if (!b.length) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const an = /^\d+$/.test(a[i]) ? Number(a[i]) : a[i];
    const bn = /^\d+$/.test(b[i]) ? Number(b[i]) : b[i];
    if (an === bn) continue;
    if (typeof an === 'number' && typeof bn === 'number') return an > bn ? 1 : -1;
    if (typeof an === 'number') return -1;
    if (typeof bn === 'number') return 1;
    return an > bn ? 1 : -1;
  }
  return 0;
}

function compareVersion(actual, latest) {
  const a = parseVersion(actual);
  const b = parseVersion(latest);
  for (let i = 0; i < 3; i += 1) {
    if (a.parts[i] > b.parts[i]) return 1;
    if (a.parts[i] < b.parts[i]) return -1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

function requestJson(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      timeout: timeoutMs,
      headers: { 'user-agent': 'dafiyu-update-check', accept: 'application/vnd.github+json' }
    }, (response) => {
      const status = Number(response.statusCode || 0);
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (status !== 200) {
          reject(new Error(`GitHub API HTTP ${status}`));
          return;
        }
        try { resolve(JSON.parse(body)); } catch (error) { reject(new Error(`GitHub API 返回不是 JSON：${error.message}`)); }
      });
    });
    request.on('timeout', () => { request.destroy(); reject(new Error('检查更新超时')); });
    request.on('error', reject);
  });
}

function isTrustedDigest(value) {
  return /^sha256:[a-f0-9]{64}$/i.test(String(value || '').trim());
}

function pickAsset(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const exact = assets.find((item) => item.name === ASSET_NAME && item.state === 'uploaded');
  return exact || null;
}

function normalizeRelease(release, currentVersion) {
  const latest = String(release?.tag_name || '').replace(/^v/i, '');
  const asset = pickAsset(release);
  return {
    ok: true,
    currentVersion: String(currentVersion || ''),
    latestVersion: latest,
    available: Boolean(latest) && compareVersion(latest, currentVersion) > 0,
    releaseUrl: String(release?.html_url || `https://github.com/${REPO}/releases`),
    notes: String(release?.body || '').slice(0, 4000),
    publishedAt: release?.published_at || null,
    asset: asset ? {
      name: asset.name,
      url: asset.browser_download_url,
      size: Number(asset.size) || 0,
      digest: String(asset.digest || '')
    } : null
  };
}

async function checkForUpdates(currentVersion, { timeoutMs = 8000 } = {}) {
  try {
    const release = await requestJson(RELEASES_API, timeoutMs);
    return normalizeRelease(release, currentVersion);
  } catch (error) {
    return { ok: false, currentVersion: String(currentVersion || ''), error: error.message };
  }
}

function isAllowedDownloadHost(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return host === 'github.com' || host.endsWith('.github.com') || host === 'githubusercontent.com' || host.endsWith('.githubusercontent.com');
  } catch {
    return false;
  }
}

function downloadFile(url, target, { signal, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    let request = null;
    let activeAbort = null;
    const cleanupAbort = () => {
      if (activeAbort && signal) {
        try { signal.removeEventListener('abort', activeAbort); } catch { /* ignore */ }
      }
      activeAbort = null;
    };
    const follow = (current, redirects = 0) => {
      if (!isAllowedDownloadHost(current)) {
        reject(new Error('更新下载地址不是 GitHub 官方域名')); return;
      }
      if (signal?.aborted) { reject(Object.assign(new Error('已取消'), { cancelled: true })); return; }
      if (redirects > 5) { reject(new Error('更新下载重定向过多')); return; }
      request = https.get(current, { timeout: 30000, headers: { 'user-agent': 'dafiyu-updater' } }, (response) => {
        const status = Number(response.statusCode || 0);
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          cleanupAbort();
          response.resume();
          follow(new URL(response.headers.location, current).href, redirects + 1);
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(new Error(`更新下载失败：HTTP ${status}`));
          return;
        }
        const total = Number(response.headers['content-length'] || 0);
        let received = 0;
        const stream = fs.createWriteStream(target, { flags: 'w' });
        const abort = () => {
          cleanupAbort();
          try { request?.destroy(); } catch { /* ignore */ }
          try { stream.destroy(new Error('已取消')); } catch { /* ignore */ }
          reject(Object.assign(new Error('已取消'), { cancelled: true }));
        };
        activeAbort = abort;
        if (signal) signal.addEventListener('abort', abort, { once: true });
        response.on('data', (chunk) => {
          received += chunk.length;
          if (onProgress) onProgress({ received, total });
        });
        response.on('error', (error) => { cleanupAbort(); reject(error); });
        stream.on('error', (error) => { cleanupAbort(); reject(error); });
        stream.on('finish', () => { cleanupAbort(); resolve({ bytes: received, total }); });
        response.pipe(stream);
      });
      request.on('timeout', () => { request.destroy(new Error('更新下载超时')); });
      request.on('error', reject);
    };
    follow(url);
  });
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex').toUpperCase()));
  });
}

function createUpdateManager({ currentVersion, paths, log = () => {}, journal = null }) {
  let task = null;
  let controller = null;
  let lastJournalAt = 0;
  const recordJournal = (force = false) => {
    if (!journal || !task) return;
    const now = Date.now();
    if (!force && now - lastJournalAt < 750) return;
    lastJournalAt = now;
    try { journal.record({ ...task, kind: 'update' }); } catch { /* journal must not break update */ }
  };

  const status = () => (task ? JSON.parse(JSON.stringify(task)) : null);

  async function check() {
    const result = await checkForUpdates(currentVersion);
    log('update', `check current=${currentVersion} latest=${result.latestVersion || 'unknown'} available=${Boolean(result.available)}`);
    return result;
  }

  async function downloadAndRun() {
    if (task && !['completed', 'failed', 'cancelled'].includes(task.status)) {
      return { ok: false, reason: '已有更新任务在进行中' };
    }
    const release = await check();
    if (!release.ok) return { ok: false, reason: release.error };
    if (!release.available) return { ok: false, reason: '当前已经是最新版本' };
    if (!release.asset?.url) return { ok: false, reason: '最新 Release 中没有可下载的安装包' };
    const digest = String(release.asset.digest || '').trim();
    if (!isTrustedDigest(digest)) {
      return { ok: false, reason: '更新包缺少可信的 SHA256 摘要，拒绝自动下载和执行' };
    }
    controller = new AbortController();
    task = {
      id: `update-${Date.now()}`,
      kind: 'update',
      component: 'manager',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'downloading',
      latestVersion: release.latestVersion,
      asset: release.asset,
      received: 0,
      total: release.asset.size || 0,
      percent: 0,
      error: null
    };
    const dir = path.join(paths.cacheDir, 'updates');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, ASSET_NAME);
    try {
      const downloaded = await downloadFile(release.asset.url, target, {
        signal: controller.signal,
        onProgress: ({ received, total }) => {
          task.received = received;
          task.total = total || task.total;
          task.percent = task.total ? Math.min(100, Math.round((received / task.total) * 100)) : null;
          task.updatedAt = Date.now();
          recordJournal();
        }
      });
      if (release.asset.size && Number(downloaded.bytes) !== Number(release.asset.size)) {
        throw new Error(`更新包大小不一致：期望 ${release.asset.size}，实际 ${downloaded.bytes}`);
      }
      if (controller.signal.aborted) throw Object.assign(new Error('已取消'), { cancelled: true });
      const expected = digest.replace(/^sha256:/i, '').toUpperCase();
      const actual = await hashFile(target);
      if (actual !== expected) throw new Error('更新包 SHA256 校验失败');
      task.status = 'ready';
      task.updatedAt = Date.now();
      recordJournal(true);
      task.file = target;
      const child = spawn(target, [], { detached: true, stdio: 'ignore', windowsHide: false });
      child.unref();
      task.status = 'completed';
      task.finishedAt = Date.now();
      recordJournal(true);
      log('update', `installer launched version=${release.latestVersion}`);
      return { ok: true, task: status() };
    } catch (error) {
      task.status = controller.signal.aborted ? 'cancelled' : 'failed';
      task.error = error.message;
      task.finishedAt = Date.now();
      recordJournal(true);
      try { fs.rmSync(target, { force: true }); } catch { /* ignore */ }
      return { ok: false, reason: error.message, task: status() };
    }
  }

  async function cancel() {
    if (!task || ['completed', 'failed', 'cancelled'].includes(task.status)) {
      return { ok: false, reason: '没有可取消的更新任务' };
    }
    try { controller?.abort(); } catch { /* ignore */ }
    task.status = 'cancelled';
    task.error = '已取消';
    task.finishedAt = Date.now();
    recordJournal(true);
    return { ok: true, task: status() };
  }

  return { check, downloadAndRun, status, cancel };
}

module.exports = { checkForUpdates, normalizeRelease, compareVersion, createUpdateManager, isAllowedDownloadHost, isTrustedDigest };
