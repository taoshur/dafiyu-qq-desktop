'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { redact } = require('./core/logger');

const MAX_TAIL_BYTES = 256 * 1024;

function sourceMap(settings) {
  const repo = settings.repoRoot;
  return {
    bridge: { label: '桥接', file: path.join(repo, 'state', 'bridge.log') },
    activity: { label: 'QQ 活动', file: path.join(repo, 'state', 'qq-activity.log') },
    watchdog: { label: '看门狗', file: path.join(repo, 'state', 'watchdog.log') },
    growth: { label: '成长报告', file: path.join(repo, 'state', 'growth-report.log') },
    snowluma: { label: 'SnowLuma', file: latestSnowlumaLog(settings.snowlumaRoot) }
  };
}

function latestSnowlumaLog(root) {
  try {
    const dir = path.join(root, 'logs');
    const files = fs.readdirSync(dir)
      .filter((name) => /^snowluma-\d{4}-\d{2}-\d{2}\.log$/.test(name))
      .sort()
      .reverse();
    return files.length ? path.join(dir, files[0]) : path.join(dir, 'snowluma.log');
  } catch {
    return path.join(root, 'logs', 'snowluma.log');
  }
}

function metaOf(file) {
  try {
    const stat = fs.statSync(file);
    return { exists: true, size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return { exists: false, size: 0, mtimeMs: 0 };
  }
}

function listSources(settings) {
  const map = sourceMap(settings);
  return Object.entries(map).map(([id, info]) => ({ id, label: info.label, file: info.file, ...metaOf(info.file) }));
}

function readTail(file, lines) {
  const count = Math.max(1, Math.min(500, Number(lines) || 120));
  const meta = metaOf(file);
  if (!meta.exists) return { ...meta, lines: [], truncated: false };
  let text = '';
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const start = Math.max(0, meta.size - MAX_TAIL_BYTES);
      const length = meta.size - start;
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, start);
      text = buffer.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    return { ...meta, lines: [], error: String(error && error.message ? error.message : error) };
  }
  const all = text.split(/\r?\n/);
  if (all.length && all[all.length - 1] === '') all.pop();
  const truncated = all.length > count;
  return { ...meta, lines: all.slice(-count).map((line) => redact(line)), truncated };
}

function tailSource(settings, sourceId, lines) {
  const map = sourceMap(settings);
  const source = map[sourceId];
  if (!source) throw new Error(`未知日志来源：${sourceId}`);
  return { source: sourceId, label: source.label, file: source.file, ...readTail(source.file, lines) };
}

module.exports = { listSources, tailSource, readTail, sourceMap, latestSnowlumaLog };
