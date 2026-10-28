'use strict';

// 隔离模拟 supervisor：拉起 sim-bridge 子进程并保持存活，用于整树停止与归属测试。
const { spawn } = require('node:child_process');
const path = require('node:path');

const [repo, port, bridgeScript] = process.argv.slice(2);
const lock = path.join(repo, 'state', 'bridge.lock');
const child = spawn(process.execPath, [bridgeScript, String(port), lock], {
  stdio: 'ignore',
  windowsHide: true
});

function cleanup() {
  try { child.kill(); } catch { /* ignore */ }
}
process.on('exit', cleanup);
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

setInterval(() => {}, 1000);
