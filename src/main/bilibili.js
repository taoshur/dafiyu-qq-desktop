'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_LOG_BYTES = 2 * 1024 * 1024;
const MAX_ENTRIES = 120;

function readTail(file, maxBytes = MAX_LOG_BYTES) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return '';
    if (stat.size <= maxBytes) return fs.readFileSync(file, 'utf8');
    const fd = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(maxBytes);
    fs.readSync(fd, buffer, 0, maxBytes, stat.size - maxBytes);
    fs.closeSync(fd);
    const text = buffer.toString('utf8');
    return text.slice(Math.max(0, text.indexOf('\n') + 1));
  } catch {
    return '';
  }
}

function readEntries(file) {
  const text = readTail(file);
  if (!text) return [];
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      if (!item || typeof item !== 'object') continue;
      const at = Number(item.at);
      if (!Number.isFinite(at) || at <= 0) continue;
      entries.push({
        at,
        bvid: String(item.bvid || ''),
        title: String(item.title || '').slice(0, 160),
        kind: String(item.kind || 'unknown'),
        author: String(item.author || '').slice(0, 80),
        duration: Number(item.duration) || null,
        view: Number(item.view) || null,
        segments: Number(item.segments) || null,
        chars: Number(item.chars) || null,
        query: String(item.query || '').slice(0, 120),
        count: Number(item.count) || null,
        category: String(item.category || '').slice(0, 40),
        day: Number(item.day) || null,
        week: Number(item.week) || null,
        uid: Number(item.uid) || null,
        name: String(item.name || '').slice(0, 80),
        error: item.error === true
      });
    } catch { /* skip malformed line */ }
  }
  entries.sort((a, b) => b.at - a.at);
  return entries;
}

function readSeen(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Number(data?.seenAt) || 0;
  } catch {
    return 0;
  }
}

function writeSeen(file, seenAt) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ seenAt }, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function readCredentialStatus(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const required = ['sessdata', 'bili_jct', 'buvid3', 'dedeuserid'];
    const loggedIn = required.every((key) => typeof data?.[key] === 'string' && data[key].length > 0);
    return { exists: true, loggedIn };
  } catch {
    return { exists: false, loggedIn: false };
  }
}

function detectDshProfiles() {
  const root = path.join(os.homedir(), '.dsh', 'profiles');
  const found = [];
  try {
    for (const name of fs.readdirSync(root)) {
      const file = path.join(root, name, 'cordis.patch.yml');
      if (!fs.existsSync(file)) continue;
      try {
        const text = fs.readFileSync(file, 'utf8');
        if (/bilibili|BILI_MCP_TOOLS|mcp-bilibili/i.test(text)) found.push(name);
      } catch { /* ignore profile read errors */ }
    }
  } catch { /* no dsh profiles */ }
  return found;
}

function kindLabel(kind) {
  const labels = {
    info: '看了视频',
    subtitle: '读了字幕',
    search: '搜索视频',
    hot: '看了热门',
    rank: '看了排行',
    weekly: '看了每周必看',
    buzzwords: '看了热搜',
    comments: '看了评论',
    danmaku: '看了弹幕',
    user_info: '查了UP主',
    user_videos: '看了UP主投稿',
    favorite: '看了收藏夹'
  };
  return labels[kind] || kind;
}

function status({ settings, paths }) {
  const repoRoot = String(settings?.repoRoot || '');
  const watchLog = repoRoot ? path.join(repoRoot, 'state', 'bili-watch.jsonl') : '';
  const mcpRoot = repoRoot ? path.join(repoRoot, 'tools', 'bilibili-mcp') : '';
  const serverFile = mcpRoot ? path.join(mcpRoot, 'mcp_server.py') : '';
  const pythonFile = repoRoot ? path.join(repoRoot, 'tools', 'bili-venv', 'Scripts', 'python.exe') : '';
  const credentialFile = mcpRoot ? path.join(mcpRoot, 'bili_credential.json') : '';
  const seenFile = path.join(paths.stateDir, 'bili-seen.json');
  const entries = watchLog ? readEntries(watchLog) : [];
  const seenAt = readSeen(seenFile);
  const unread = entries.filter((item) => item.at > seenAt).length;
  const profiles = detectDshProfiles();
  const credential = credentialFile ? readCredentialStatus(credentialFile) : { exists: false, loggedIn: false };
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEntries = entries.filter((item) => item.at >= todayStart.getTime());
  const videoEntries = entries.filter((item) => item.bvid);
  const kinds = entries.reduce((out, item) => {
    out[item.kind] = (out[item.kind] || 0) + 1;
    return out;
  }, {});
  return {
    watchLog,
    entries: entries.slice(0, MAX_ENTRIES),
    counts: {
      total: entries.length,
      today: todayEntries.length,
      todayVideos: new Set(todayEntries.map((item) => item.bvid).filter(Boolean)).size,
      videos: new Set(videoEntries.map((item) => item.bvid)).size,
      searches: kinds.search || 0,
      unread
    },
    lastAt: entries[0]?.at || null,
    seenAt,
    mcp: {
      serverExists: Boolean(serverFile && fs.existsSync(serverFile)),
      pythonExists: Boolean(pythonFile && fs.existsSync(pythonFile)),
      configured: profiles.length > 0,
      profiles
    },
    credential,
    kinds
  };
}

function ack({ paths, at }) {
  const seenFile = path.join(paths.stateDir, 'bili-seen.json');
  const seenAt = Number(at) > 0 ? Number(at) : Date.now();
  writeSeen(seenFile, seenAt);
  return { ok: true, seenAt };
}

module.exports = { status, ack, readEntries, kindLabel };
