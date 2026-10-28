'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { listProcessDetails, verifyProcess, taskkill, isAlive } = require('../src/main/proc');

test('listProcessDetails 能读到当前进程的启动时间与命令行', async () => {
  const details = await listProcessDetails();
  const self = details.find((item) => item.pid === process.pid);
  assert.ok(self, '应能找到当前进程');
  assert.ok(self.startMs > 0);
  assert.ok(self.exe.toLowerCase().includes('node'));
  assert.ok(self.cmdline.length > 0);
});

test('verifyProcess 拒绝启动时间不一致（PID 复用）的记录', async () => {
  const details = await listProcessDetails();
  const self = details.find((item) => item.pid === process.pid);
  const good = { pid: process.pid, startMs: self.startMs, exe: self.exe, signature: 'node' };
  assert.equal(verifyProcess(good, details).ok, true);
  const stale = { ...good, startMs: self.startMs - 60000 };
  assert.equal(verifyProcess(stale, details).ok, false);
});

test('verifyProcess 拒绝可执行路径或命令行不匹配的记录', async () => {
  const details = await listProcessDetails();
  const self = details.find((item) => item.pid === process.pid);
  const wrongExe = { pid: process.pid, startMs: self.startMs, exe: 'C:\\Windows\\notepad.exe', signature: 'node' };
  assert.equal(verifyProcess(wrongExe, details).ok, false);
  const wrongSig = { pid: process.pid, startMs: self.startMs, exe: self.exe, signature: 'definitely-not-in-cmdline' };
  assert.equal(verifyProcess(wrongSig, details).ok, false);
});

test('verifyProcess 结合完整命令行与父进程关系校验', async () => {
  const details = await listProcessDetails();
  const self = details.find((item) => item.pid === process.pid);
  const good = {
    pid: process.pid,
    startMs: self.startMs,
    exe: self.exe,
    cmdline: self.cmdline,
    parentPid: self.parentPid
  };
  assert.equal(verifyProcess(good, details).ok, true);

  const wrongParent = { ...good, parentPid: self.parentPid + 1 };
  assert.equal(verifyProcess(wrongParent, details).ok, false);

  const wrongCmdline = { ...good, cmdline: `${self.cmdline} --injected` };
  assert.equal(verifyProcess(wrongCmdline, details).ok, false);
});

test('taskkill 只作用于指定 PID', async () => {
  const { spawn } = require('node:child_process');
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(isAlive(child.pid), true);
  const result = await taskkill(child.pid, { force: true, tree: true });
  assert.equal(result.ok, true);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(isAlive(child.pid), false);
});
