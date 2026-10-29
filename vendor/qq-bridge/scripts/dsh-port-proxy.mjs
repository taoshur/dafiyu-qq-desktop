// dsh-port-proxy.mjs — keep a stable DSH Web address for qq-bridge.
//
// Why: the DSH desktop app boots its web server with `--port 0` (random port on
// every launch), while qq-bridge needs a fixed `dsh.baseUrl`. This relay listens
// on 127.0.0.1:3080 (the bridge's documented default), discovers the real DSH
// port, and forwards raw TCP bytes to it.
//
// Raw TCP (not an HTTP proxy on purpose): the Host header reaches DSH unchanged,
// so the cookie minted by qq-bridge for authority `127.0.0.1:3080` still validates
// against DSH's `payload.authority === Host` check. WebSocket upgrade on
// /api/remote.mux also passes through untouched.
//
// Discovery is deliberately cheap: only loopback listeners are probed, and a
// candidate must answer `GET /` with 401 + "dsh web authentication required".
// The target is re-discovered on connection failure, so a DSH restart that moves
// to a new port is picked up on the next bridge reconnect.

import net from 'node:net';
import { execFile } from 'node:child_process';

const LISTEN_HOST = process.env.DSH_PROXY_HOST || '127.0.0.1';
const LISTEN_PORT = Number(process.env.DSH_PROXY_PORT || 3080);
// Escape hatch for restricted environments (or a hand-pinned port): skip discovery.
const FIXED_TARGET = Number(process.env.DSH_PROXY_TARGET || 0) || null;
const PROBE_TIMEOUT_MS = 1500;

let current = null; // { port, at }
let discovering = null;

function log(message) {
  console.log(`[dsh-proxy ${new Date().toISOString()}] ${message}`);
}

function listLoopbackListeners() {
  return new Promise((resolve) => {
    const done = (ports) => resolve(ports);
    try {
      if (process.platform === 'win32') {
        execFile('netstat', ['-ano', '-p', 'tcp'], { windowsHide: true, timeout: 8000 }, (error, stdout) => {
          if (error) return done([]);
          const ports = new Set();
          for (const line of String(stdout).split(/\r?\n/)) {
            const match = line.match(/^\s*TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+\d+\s*$/i);
            if (!match) continue;
            const host = match[1];
            if (host === '127.0.0.1' || host === '0.0.0.0' || host === '[::1]') ports.add(Number(match[2]));
          }
          done([...ports]);
        });
        return;
      }
      execFile('ss', ['-ltn'], { timeout: 8000 }, (error, stdout) => {
        if (error) return done([]);
        const ports = new Set();
        for (const line of String(stdout).split('\n')) {
          const match = line.match(/\s(?:127\.0\.0\.1|\[::1\]|0\.0\.0\.0|\*):(\d+)\s/);
          if (match) ports.add(Number(match[1]));
        }
        done([...ports]);
      });
    } catch {
      // Sandboxed environments can refuse to spawn child processes (EPERM).
      done([]);
    }
  });
}

async function looksLikeDsh(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      redirect: 'manual'
    });
    const body = await response.text();
    return response.status === 401 && /dsh web authentication required/i.test(body);
  } catch {
    return false;
  }
}

async function findDshPort() {
  if (FIXED_TARGET) return FIXED_TARGET;
  const ports = (await listLoopbackListeners()).filter((port) => port !== LISTEN_PORT && port > 1024);
  const matches = [];
  await Promise.all(ports.map(async (port) => {
    if (await looksLikeDsh(port)) matches.push(port);
  }));
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    log(`WARN multiple DSH-looking ports ${matches.join(', ')}; using ${Math.max(...matches)}`);
  }
  return Math.max(...matches);
}

// Single flight: concurrent connections must not all run netstat at once.
function discover() {
  if (!discovering) {
    discovering = findDshPort().finally(() => { discovering = null; });
  }
  return discovering;
}

async function targetPort({ force = false } = {}) {
  if (!force && current && await looksLikeDsh(current.port)) return current.port;
  const port = await discover();
  if (!port) {
    current = null;
    return null;
  }
  if (!current || current.port !== port) log(`DSH web -> 127.0.0.1:${port}`);
  current = { port, at: Date.now() };
  return port;
}

function relay(client, remainingRetries = 1) {
  client.on('error', () => {});
  targetPort().then((port) => {
    if (!port) {
      log('no DSH web server found on loopback; closing connection');
      client.destroy();
      return;
    }
    const upstream = net.connect({ host: '127.0.0.1', port });
    upstream.on('error', async (error) => {
      client.destroy();
      if (error.code === 'ECONNREFUSED' || error.code === 'EHOSTUNREACH') {
        log(`upstream 127.0.0.1:${port} refused; re-discovering`);
        if (remainingRetries > 0) {
          const next = await targetPort({ force: true });
          if (next && next !== port) relay(client, remainingRetries - 1);
        }
      }
    });
    upstream.on('connect', () => {
      client.pipe(upstream);
      upstream.pipe(client);
    });
    upstream.on('close', () => client.destroy());
    client.on('close', () => upstream.destroy());
  });
}

const server = net.createServer((client) => relay(client));
server.on('error', (error) => {
  log(`listen failed: ${error.code || error.message}`);
  process.exit(1);
});
server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  log(`listening on ${LISTEN_HOST}:${LISTEN_PORT} (stable address for qq-bridge)`);
  targetPort().then((port) => {
    log(port ? `current DSH web port: ${port}` : 'DSH web not running yet; will discover on demand');
  });
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log(`received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  });
}
