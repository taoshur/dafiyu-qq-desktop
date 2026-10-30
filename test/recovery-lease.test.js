'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createLease } = require('../src/main/recovery-lease');

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-lease-'));
  return path.join(dir, 'recovery-lease.json');
}

test('同一时刻只有一个恢复者能拿到租约', () => {
  const file = tempFile();
  const clock = { now: 1000 };
  const a = createLease({ file, ownerId: 'a', ttlMs: 30000, now: () => clock.now });
  const b = createLease({ file, ownerId: 'b', ttlMs: 30000, now: () => clock.now });
  assert.equal(a.acquire().acquired, true);
  const second = b.acquire();
  assert.equal(second.acquired, false);
  assert.equal(second.holder.ownerId, 'a');
});

test('租约过期后可被接管', () => {
  const file = tempFile();
  const clock = { now: 1000 };
  const a = createLease({ file, ownerId: 'a', ttlMs: 1000, now: () => clock.now });
  const b = createLease({ file, ownerId: 'b', ttlMs: 1000, now: () => clock.now });
  assert.equal(a.acquire().acquired, true);
  clock.now = 3000;
  const taken = b.acquire();
  assert.equal(taken.acquired, true);
  assert.equal(taken.reason, 'taken-over');
});

test('心跳可以续租，释放后其他人可获取', () => {
  const file = tempFile();
  const clock = { now: 1000 };
  const a = createLease({ file, ownerId: 'a', ttlMs: 1000, now: () => clock.now });
  const b = createLease({ file, ownerId: 'b', ttlMs: 1000, now: () => clock.now });
  assert.equal(a.acquire().acquired, true);
  clock.now = 1500;
  assert.equal(a.heartbeat().ok, true);
  clock.now = 2200;
  assert.equal(b.acquire().acquired, false, '心跳后续租仍有效');
  assert.equal(a.release().ok, true);
  assert.equal(b.acquire().acquired, true);
});

test('同一 PID 但启动时间不同视为 PID 复用，旧租约失效', () => {
  const file = tempFile();
  const a = createLease({ file, ownerId: 'a', ttlMs: 60000, pid: 1234, startMs: 1000, now: () => 2000 });
  assert.equal(a.acquire().acquired, true);
  const b = createLease({ file, ownerId: 'b', ttlMs: 60000, pid: 1234, startMs: 9000, now: () => 2000 });
  const result = b.acquire();
  assert.equal(result.acquired, true, 'PID 复用时应接管而不是被旧租约阻塞');
});

test('租约持有者进程已死时可被接管', () => {
  const file = tempFile();
  const a = createLease({ file, ownerId: 'a', ttlMs: 60000, pid: 555, startMs: 1, now: () => 2000 });
  assert.equal(a.acquire().acquired, true);
  const b = createLease({ file, ownerId: 'b', ttlMs: 60000, pid: 556, startMs: 1, now: () => 2000 });
  const result = b.acquire({ pidAlive: () => false });
  assert.equal(result.acquired, true);
});

test('租约文件损坏时按过期处理并可恢复', () => {
  const file = tempFile();
  fs.writeFileSync(file, '{ broken', 'utf8');
  const a = createLease({ file, ownerId: 'a', ttlMs: 30000, now: () => 1000 });
  const result = a.acquire();
  assert.equal(result.acquired, true);
});


test('expired lease takeover is guarded by an atomic lock', () => {
  const file = tempFile();
  const clock = { now: 1000 };
  const a = createLease({ file, ownerId: 'a', ttlMs: 1000, now: () => clock.now });
  const b = createLease({ file, ownerId: 'b', ttlMs: 1000, now: () => clock.now });
  assert.equal(a.acquire().acquired, true);
  clock.now = 3000;
  fs.writeFileSync(`${file}.takeover`, 'busy', 'utf8');
  const blocked = b.acquire();
  assert.equal(blocked.acquired, false);
  assert.equal(blocked.reason, 'takeover-busy');
  fs.rmSync(`${file}.takeover`, { force: true });
});
