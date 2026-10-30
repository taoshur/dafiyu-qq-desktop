'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * 跨进程恢复租约：
 * - 同一时刻只允许一个恢复者（管理器或伴生看门狗）；
 * - 租约带 heartbeatAt + ttlMs，过期可被接管；
 * - 记录 pid + 进程启动时间，避免 PID 复用误判；
 * - 接管采用“写临时文件 + rename”，写后回读确认，输掉竞争的一方主动退出。
 */
function createLease({ file, ownerId, ttlMs = 30000, pid = process.pid, startMs = 0, now = () => Date.now() }) {
  const isValid = (lease, { pidAlive } = {}) => {
    if (!lease || !lease.ownerId) return false;
    if (now() - Number(lease.heartbeatAt || 0) > ttlMs) return false;
    if (pidAlive) {
      const alive = pidAlive(lease.pid);
      if (!alive) return false;
    }
    if (lease.pid === pid && startMs && Number(lease.startMs) && Math.abs(Number(lease.startMs) - startMs) > 3000) {
      // 同一 PID 但启动时间不同：PID 被复用，旧租约无效。
      return false;
    }
    return true;
  };

  const acquire = ({ pidAlive } = {}) => {
    const payload = { ownerId, pid, startMs, heartbeatAt: now(), ttlMs };
    const takeoverLock = `${file}.takeover`;
    const openTakeoverLock = () => {
      try {
        return fs.openSync(takeoverLock, 'wx');
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        try {
          const stat = fs.statSync(takeoverLock);
          if (Date.now() - stat.mtimeMs > 10000) fs.rmSync(takeoverLock, { force: true });
        } catch { /* ignore */ }
        return null;
      }
    };
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
      return { acquired: true, lease: payload, reason: 'created' };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }

    const existing = readJson(file);
    if (isValid(existing, { pidAlive })) {
      return { acquired: false, holder: existing, reason: 'held' };
    }
    // Expired/ownerless: take over under an atomic guard. Without this guard,
    // two processes can both read an expired lease, both rename, and both
    // believe they won after their own write.
    const fd = openTakeoverLock();
    if (fd == null) return { acquired: false, holder: existing, reason: 'takeover-busy' };
    try {
      const current = readJson(file);
      if (isValid(current, { pidAlive })) {
        return { acquired: false, holder: current, reason: 'held' };
      }
      writeAtomic(file, payload);
      const verify = readJson(file);
      if (!verify || verify.ownerId !== ownerId) {
        return { acquired: false, holder: verify, reason: 'lost-race' };
      }
      return { acquired: true, lease: verify, reason: current ? 'taken-over' : 'created' };
    } finally {
      try { fs.closeSync(fd); } catch { /* ignore */ }
      try { fs.rmSync(takeoverLock, { force: true }); } catch { /* ignore */ }
    }
  };

  const heartbeat = () => {
    const current = readJson(file);
    if (!current || current.ownerId !== ownerId) return { ok: false, reason: 'not-owner' };
    current.heartbeatAt = now();
    writeAtomic(file, current);
    return { ok: true, lease: current };
  };

  const release = () => {
    const current = readJson(file);
    if (!current || current.ownerId !== ownerId) return { ok: false, reason: 'not-owner' };
    fs.rmSync(file, { force: true });
    return { ok: true };
  };

  return { acquire, heartbeat, release, read: () => readJson(file), isValid, ttlMs, ownerId };
}

module.exports = { createLease };
