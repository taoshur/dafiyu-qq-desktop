'use strict';

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { readProjectConfig } = require('./paths');

function tcpProbe(port, host = '127.0.0.1', timeoutMs = 700) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

function run(cmd, args, timeoutMs = 4000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      resolve({ ok: !error, stdout: String(stdout || '') });
    });
  });
}

let processCache = { at: 0, list: [] };
async function listProcesses(maxAgeMs = 3000) {
  if (Date.now() - processCache.at < maxAgeMs) return processCache.list;
  const { stdout } = await run('tasklist', ['/FO', 'CSV', '/NH']);
  const list = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.match(/"([^"]*)"/g);
    if (!parts || parts.length < 2) continue;
    const name = parts[0].replace(/^"|"$/g, '');
    const pid = Number(parts[1].replace(/^"|"$/g, ''));
    if (Number.isInteger(pid) && pid > 0) list.push({ name, pid });
  }
  processCache = { at: Date.now(), list };
  return list;
}

async function netstatListeners() {
  const { stdout } = await run('netstat', ['-ano', '-p', 'tcp']);
  const byPort = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^\s*TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
    if (!m) continue;
    const host = m[1];
    if (!['127.0.0.1', '0.0.0.0', '[::1]', '[::]'].includes(host)) continue;
    const port = Number(m[2]);
    const pid = Number(m[3]);
    if (!byPort.has(port)) byPort.set(port, pid);
  }
  return byPort;
}

let dshCache = { at: 0, result: null };
async function discoverDshPort(listeners, maxAgeMs = 5000) {
  if (Date.now() - dshCache.at < maxAgeMs && dshCache.result) return dshCache.result;
  const candidates = [...listeners.keys()].filter((port) => port > 1024 && ![3000, 3001, 3080, 3100].includes(port));
  // 并行探测，避免逐个 600ms 串行等待（最坏会拖慢整个首屏）。
  const matches = await Promise.all(candidates.slice(0, 60).map(async (port) => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(400), redirect: 'manual' });
      const body = await res.text();
      if (res.status === 401 && /dsh web authentication required/i.test(body)) {
        return { port, pid: listeners.get(port) || null };
      }
    } catch {
      /* 忽略不可探测端口 */
    }
    return null;
  }));
  const found = matches.filter(Boolean).sort((a, b) => b.port - a.port)[0] || null;
  dshCache = { at: Date.now(), result: found };
  return found;
}

function readLockPid(repoRoot) {
  try {
    const raw = fs.readFileSync(path.join(repoRoot, 'state', 'bridge.lock'), 'utf8').trim();
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function fileInfo(file) {
  try {
    const stat = fs.statSync(file);
    return { exists: true, size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return { exists: false, size: 0, mtimeMs: 0 };
  }
}

function dirWritable(dir) {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function systemNodeVersion() {
  const { ok, stdout } = await run('node', ['-v'], 2000);
  const version = stdout.trim();
  return ok && /^v\d+\./.test(version) ? version : null;
}

function envChecks(settings, projectCfg, runtime = {}) {
  const repo = settings.repoRoot;
  const checks = [];
  const add = (id, label, state, detail, hint = '') => checks.push({ id, label, state, detail, hint });

  const nodeVersion = runtime.nodeVersion || process.versions.node;
  const major = Number(String(nodeVersion).replace(/^v/, '').split('.')[0]);
  add('node', 'Node.js 运行时（系统）', major >= 22 ? 'ok' : 'warn', `${nodeVersion}${runtime.nodeVersion ? '' : '（Electron 内置）'}`,
    major >= 22 ? '' : '需要 Node.js 22.13 及以上');

  add('repo', 'qq-bridge 目录', fs.existsSync(path.join(repo, 'package.json')) ? 'ok' : 'bad', repo);

  const cfgFile = path.join(repo, 'config.json');
  add('config', 'config.json', projectCfg.valid ? 'ok' : projectCfg.exists ? 'warn' : 'bad',
    projectCfg.valid ? '已加载（端口/开关已读取，令牌不外泄）' : projectCfg.exists ? '存在但不是合法 JSON' : '未找到',
    projectCfg.valid ? '' : '检查 config.json 语法；修改前请先备份');

  const deps = ['@snowluma/sdk', '@snowluma/mcp', 'js-yaml'];
  const missing = deps.filter((dep) => !fs.existsSync(path.join(repo, 'node_modules', dep)));
  add('deps', '运行依赖', missing.length === 0 ? 'ok' : 'bad',
    missing.length === 0 ? 'node_modules 完整' : `缺少 ${missing.join(', ')}`, missing.length ? '在项目目录执行 npm install' : '');

  const stateDir = path.join(repo, 'state');
  add('state', 'state 目录可写', dirWritable(stateDir) ? 'ok' : 'warn', stateDir, dirWritable(stateDir) ? '' : '桥接需要写入状态与日志');

  const mem = fileInfo(path.join(stateDir, 'memory.db'));
  add('memory', '记忆数据库', mem.exists ? 'ok' : 'warn',
    mem.exists ? `memory.db ${(mem.size / 1024).toFixed(0)} KB（另有 WAL）` : '尚未创建', mem.exists ? '' : '首次启动桥接后会创建');

  add('backups', '备份目录', dirWritable(path.join(repo, 'backups')) ? 'ok' : 'warn', path.join(repo, 'backups'));

  const sl = settings.snowlumaRoot;
  add('snowluma', 'SnowLuma 安装', fs.existsSync(path.join(sl, 'index.mjs')) && fs.existsSync(path.join(sl, 'node.exe')) ? 'ok' : 'bad', sl);

  add('dsh', 'DSH 桌面应用', fs.existsSync(settings.dshExe) ? 'ok' : 'warn', settings.dshExe, fs.existsSync(settings.dshExe) ? '' : '可在设置里改成实际安装路径');

  return checks;
}

async function buildSnapshot(settings, { mockMode = true } = {}) {
  const started = Date.now();
  const projectCfg = readProjectConfig(settings.repoRoot);
  const ports = projectCfg.ports || { snowlumaHttp: 3000, snowlumaWs: 3001, dshRelay: 3080, console: 3100 };

  const [httpOpen, wsOpen, relayOpen, consoleOpen, webuiOpen, listeners, processes, nodeVersion] = await Promise.all([
    tcpProbe(ports.snowlumaHttp),
    tcpProbe(ports.snowlumaWs),
    tcpProbe(ports.dshRelay),
    tcpProbe(ports.console),
    tcpProbe(5099),
    netstatListeners(),
    listProcesses(),
    systemNodeVersion()
  ]);

  const dshPort = relayOpen ? (await discoverDshPort(listeners)) : (await discoverDshPort(listeners));
  const dshProc = processes.find((p) => /DeepSeek Harness\.exe$/i.test(p.name)) || null;

  const lockPid = readLockPid(settings.repoRoot);
  const lockAlive = lockPid ? processes.some((p) => p.pid === lockPid) : false;
  const consolePid = listeners.get(ports.console) || null;
  const snowlumaPid = listeners.get(ports.snowlumaHttp) || listeners.get(5099) || null;

  const bridgeState = consoleOpen ? 'running' : lockAlive ? 'starting' : 'stopped';
  const snowlumaState = httpOpen && wsOpen ? 'running'
    : httpOpen || wsOpen ? 'degraded'
      : webuiOpen ? 'starting' : 'stopped';
  const dshState = dshProc ? 'running' : dshPort ? 'running' : 'stopped';

  const services = [
    {
      id: 'snowluma',
      name: 'SnowLuma',
      role: 'QQ 网关',
      state: snowlumaState,
      pid: snowlumaPid,
      ports: [ports.snowlumaHttp, ports.snowlumaWs],
      detail: snowlumaState === 'running' ? 'OneBot v11 · HTTP + WS 在线' : snowlumaState === 'degraded' ? '只有一个端口在线' : snowlumaState === 'starting' ? 'WebUI 5099 在线，等待 QQ 登录（登录后 3000/3001 才会就绪）' : '未检测到监听端口',
      owned: false
    },
    {
      id: 'dsh',
      name: 'DeepSeek Harness',
      role: '智能体宿主',
      state: dshState,
      pid: (dshPort && dshPort.pid) || (dshProc ? dshProc.pid : null),
      ports: dshPort ? [dshPort.port] : [],
      detail: dshProc
        ? `桌面应用在线${dshPort ? ` · 动态端口 ${dshPort.port}` : ' · 端口待发现'}`
        : dshPort ? `Web 端口 ${dshPort.port} 在线` : '未检测到 DSH 实例',
      owned: false
    },
    {
      id: 'bridge',
      name: 'qq-bridge',
      role: '消息桥接',
      state: bridgeState,
      pid: consolePid || lockPid,
      ports: [ports.console, ports.dshRelay],
      detail: bridgeState === 'running'
        ? `控制台在线${lockPid ? ` · 锁 PID ${lockPid}` : ''}`
        : bridgeState === 'starting' ? '锁存在但控制台未就绪' : '未运行',
      owned: false
    }
  ];

  return {
    at: Date.now(),
    elapsedMs: Date.now() - started,
    mockMode,
    services,
    ports,
    dsh: {
      process: dshProc ? { pid: dshProc.pid, name: dshProc.name } : null,
      port: dshPort ? dshPort.port : null,
      ownerPid: dshPort ? dshPort.pid : null
    },
    config: projectCfg,
    env: envChecks(settings, projectCfg, { nodeVersion }),
    paths: {
      repoRoot: settings.repoRoot,
      snowlumaRoot: settings.snowlumaRoot,
      dshExe: settings.dshExe
    }
  };
}

module.exports = { buildSnapshot, tcpProbe, listProcesses, netstatListeners, discoverDshPort, readLockPid, fileInfo, envChecks };
