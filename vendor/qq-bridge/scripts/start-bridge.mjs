// start-bridge.mjs — one console, two children: the DSH port relay and qq-bridge.
//
// qq-bridge alone assumes DSH is already listening on the configured port. The
// DSH desktop app never does (it boots with `--port 0`), so we keep a relay on a
// stable address and supervise both processes here instead of in a .bat loop.
// Ctrl+C (or closing the window) stops both.

import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const env = { ...process.env };

// Best-effort ACL tightening; never blocks startup (same contract as start.bat).
spawnSync(node, [path.join(root, 'scripts', 'harden-state-acl.mjs'), '--quiet'], {
  cwd: root, stdio: 'inherit', env
});

let stopping = false;
const children = new Set();

function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    child.kill('SIGTERM');
  }
}

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) stopChild(child);
  setTimeout(() => process.exit(code), 300);
}

function supervise(label, script, { onExit, restartMs }) {
  const child = spawn(node, [script], { cwd: root, stdio: 'inherit', windowsHide: true, env });
  children.add(child);
  child.on('error', (error) => {
    console.error(`[start] ${label} failed to spawn: ${error.message}`);
  });
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (stopping) return;
    const detail = signal ? `signal ${signal}` : `code ${code}`;
    if (onExit) {
      onExit(code, detail);
      return;
    }
    console.error(`[start] ${label} exited (${detail}); restarting in ${restartMs / 1000}s`);
    setTimeout(() => { if (!stopping) supervise(label, script, { onExit, restartMs }); }, restartMs);
  });
  return child;
}

function startBridge() {
  supervise('qq-bridge', path.join(root, 'src', 'bridge.js'), {
    restartMs: 5000,
    onExit(code, detail) {
      if (code === 2) {
        console.error(`[start] another bridge instance is already running (${detail}); exiting.`);
        shutdown(2);
        return;
      }
      console.error(`[start] qq-bridge exited (${detail}); restarting in 5s`);
      setTimeout(() => { if (!stopping) startBridge(); }, 5000);
    }
  });
}

supervise('dsh-port-proxy', path.join(root, 'scripts', 'dsh-port-proxy.mjs'), {
  restartMs: 3000
});
startBridge();

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    console.log(`[start] received ${signal}, stopping children...`);
    shutdown(0);
  });
}
