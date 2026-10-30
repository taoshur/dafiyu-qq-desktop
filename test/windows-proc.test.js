'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const { listProcessDetails, verifyProcess, collectTree, taskkill, waitUntilGone } = require('../src/main/proc');

test('Windows process tree identity and termination on a real child process', { skip: process.platform !== 'win32' }, async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' });
  try {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const details = await listProcessDetails();
    const found = details.find((item) => item.pid === child.pid);
    assert.ok(found, 'child process must be visible through CIM');
    const record = {
      pid: child.pid,
      startMs: found.startMs,
      exe: found.exe,
      cmdline: found.cmdline,
      parentPid: found.parentPid
    };
    assert.equal(verifyProcess(record, details).ok, true);
    const tree = collectTree(details, process.pid);
    assert.ok(tree.descendants.some((item) => item.pid === child.pid), 'child must be in the parent tree');
    await taskkill(child.pid, { force: true, tree: true });
    assert.equal(await waitUntilGone(child.pid, 5000), true);
  } finally {
    try { child.kill(); } catch { /* ignore */ }
  }
});
