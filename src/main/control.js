'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  listProcessDetails,
  verifyProcess,
  verifyTree,
  isAlive,
  taskkill,
  waitUntilGone
} = require('./proc');
const { tcpProbe, netstatListeners } = require('./health');
const { verifyBackup, listBackups } = require('./backup');
const { assessBusy } = require('./busy-guard');
const { setStoppedByUser, clearStoppedByUser, getIntent } = require('./stop-intent');

const STOP_TIMEOUT_MS = 6000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, file);
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  }
}

function createController({ stateDir, getSettings, log = () => {}, extraDefinitions = {}, now = () => Date.now(), stopTimeoutMs = STOP_TIMEOUT_MS, backupRoots = ['D:\\qq-bridge-backups'], enforceDependencies = true }) {
  const stateFile = path.join(stateDir, 'services.json');
  const sentinelMarker = path.join(stateDir, 'watchdog-sentinel.json');

  const loadState = () => {
    const raw = readJson(stateFile, {});
    return { services: raw.services && typeof raw.services === 'object' ? raw.services : {} };
  };
  const saveState = (state) => writeJson(stateFile, state);

  const buildDefinitions = () => {
    const settings = getSettings();
    const repo = settings.repoRoot;
    const defs = {
      snowluma: {
        id: 'snowluma',
        // 直接启动 SnowLuma 的 node 进程；windowsHide 隐藏控制台，detached 让它脱离管理器常驻。
        // 必须由桌面记录 node 根 PID，否则管理器退出/重启后会失去归属，无法停止。
        exe: path.join(settings.snowlumaRoot, 'node.exe'),
        args: ['index.mjs'],
        cwd: settings.snowlumaRoot,
        signature: 'index.mjs',
        launcher: 'vbs',
        scriptFile: 'start-snowluma.vbs',
        listenPort: 5099,
        ports: [3000, 3001],
        // WebUI 先起来，QQ 登录后 OneBot 端口才就绪；不能因为 3000/3001 未开就杀掉。
        readyPorts: [5099],
        waitMs: 60000,
        treeExeIncludes: ['node.exe', 'conhost.exe'],
        treeSignatures: ['index.mjs']
      },
      bridge: {
        id: 'bridge',
        exe: 'node',
        args: [path.join(repo, 'scripts', 'start-bridge.mjs')],
        cwd: repo,
        signature: 'start-bridge.mjs',
        launcher: 'vbs-bridge',
        scriptFile: 'start-bridge-hidden.vbs',
        ports: [3100],
        waitMs: 25000,
        lockFile: path.join(repo, 'state', 'bridge.lock'),
        bridgeSignature: 'bridge.js',
        treeExeIncludes: ['node.exe', 'conhost.exe'],
        treeSignatures: ['start-bridge.mjs', 'dsh-port-proxy.mjs', 'bridge.js', 'mcp-']
      },
      dsh: {
        id: 'dsh',
        exe: settings.dshExe,
        args: [],
        cwd: path.dirname(settings.dshExe),
        signature: 'DeepSeek Harness.exe',
        ports: [],
        waitMs: 10000,
        treeExeIncludes: ['DeepSeek Harness.exe'],
        treeSignatures: ['DeepSeek Harness.exe']
      }
    };
    return { ...defs, ...extraDefinitions };
  };

  const enabled = () => Boolean(getSettings().controlEnabled);
  const sentinelPath = () => path.join(getSettings().repoRoot, 'state', 'watchdog.disabled');
  const readSentinelMarker = () => readJson(sentinelMarker, null);

  const ensureSentinel = () => {
    const file = sentinelPath();
    if (fs.existsSync(file)) return { created: false, file };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '', 'utf8');
    writeJson(sentinelMarker, {
      createdByDesktop: true,
      createdAt: new Date(now()).toISOString(),
      operationId: `stop-bridge-${now()}`
    });
    log('control', 'watchdog sentinel created');
    return { created: true, file };
  };

  const removeSentinel = () => {
    try { fs.rmSync(sentinelPath(), { force: true }); } catch { /* ignore */ }
    try { fs.rmSync(sentinelMarker, { force: true }); } catch { /* ignore */ }
  };

  const restoreSentinel = () => {
    const marker = readSentinelMarker();
    if (!marker || !marker.createdByDesktop) return { removed: false };
    removeSentinel();
    log('control', 'watchdog sentinel removed (restored)');
    return { removed: true };
  };

  const anyPortOpen = async (ports) => {
    for (const port of ports || []) {
      if (await tcpProbe(port, '127.0.0.1', 600)) return true;
    }
    return false;
  };
  const allPortsOpen = async (ports) => {
    for (const port of ports || []) {
      if (!(await tcpProbe(port, '127.0.0.1', 600))) return false;
    }
    return true;
  };

  const readBridgeChild = async () => {
    try {
      const pid = Number(fs.readFileSync(path.join(getSettings().repoRoot, 'state', 'bridge.lock'), 'utf8').trim());
      return Number.isInteger(pid) && pid > 0 ? pid : null;
    } catch {
      return null;
    }
  };

  const cleanupFailedSpawn = async (pid, def) => {
    if (!pid) return { killed: false };
    const details = await listProcessDetails();
    const found = details.find((item) => item.pid === pid);
    if (!found) return { killed: false };
    const signature = String(def.signature || '').toLowerCase();
    if (signature && !found.cmdline.toLowerCase().includes(signature)) {
      log('control', `cleanup skipped: pid ${pid} signature mismatch`);
      return { killed: false };
    }
    await taskkill(pid, { force: true, tree: true });
    await waitUntilGone(pid, 5000);
    log('control', `cleanup killed partial start pid=${pid}`);
    return { killed: true };
  };

  async function startHiddenSnowluma(def, state) {
    const scriptPath = path.join(stateDir, def.scriptFile);
    const nodeExe = path.join(getSettings().snowlumaRoot, 'node.exe');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(scriptPath, [
      'Set sh = CreateObject("WScript.Shell")',
      `sh.CurrentDirectory = "${getSettings().snowlumaRoot}"`,
      `sh.Run """${nodeExe}"" ""index.mjs""", 0, False`,
      ''
    ].join('\r\n'), 'utf8');
    try {
      const launcher = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe'), [scriptPath], {
        cwd: getSettings().snowlumaRoot,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      launcher.unref();
    } catch (error) {
      return { ok: false, reason: `隐藏启动失败：${error.message}` };
    }

    const deadline = now() + (def.waitMs || 60000);
    let record = null;
    while (now() < deadline) {
      await sleep(500);
      if (!(await tcpProbe(def.listenPort, '127.0.0.1', 500))) continue;
      const listeners = await netstatListeners();
      const listenerPid = listeners.get(def.listenPort);
      if (!listenerPid) continue;
      const details = await listProcessDetails();
      const found = details.find((item) => item.pid === listenerPid);
      if (!found) continue;
      let root = found;
      const seen = new Set();
      while (root && !seen.has(root.pid)) {
        seen.add(root.pid);
        const parent = details.find((item) => item.pid === root.parentPid);
        if (!parent) break;
        if (path.normalize(parent.exe).toLowerCase() !== path.normalize(nodeExe).toLowerCase()) break;
        if (!parent.cmdline.toLowerCase().includes('index.mjs')) break;
        root = parent;
      }
      record = {
        id: 'snowluma',
        pid: root.pid,
        startMs: root.startMs,
        exe: root.exe,
        cmdline: root.cmdline,
        parentPid: root.parentPid,
        signature: 'index.mjs',
        startedAt: new Date(now()).toISOString()
      };
      break;
    }

    if (!record) {
      return { ok: false, rollback: true, reason: `隐藏启动超时：${def.waitMs}ms 内未检测到 SnowLuma WebUI（5099）` };
    }
    state.services.snowluma = record;
    saveState(state);
    clearStoppedByUser(stateDir, 'snowluma');
    log('control', `started snowluma hidden pid=${record.pid}`);
    const ready = await allPortsOpen(def.ports);
    return ready ? { ok: true, record } : {
      ok: true,
      starting: true,
      record,
      reason: 'SnowLuma 已隐藏启动；请登录 5099 完成 QQ 登录，登录后 3000/3001 才会就绪'
    };
  }

  async function startHiddenBridge(def, state) {
    const settings = getSettings();
    const repo = settings.repoRoot;
    const candidates = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
      'node.exe'
    ];
    const nodeExe = candidates.find((item) => item === 'node.exe' || fs.existsSync(item)) || 'node.exe';
    const scriptPath = path.join(stateDir, def.scriptFile);
    const quote = (value) => String(value).replace(/"/g, '""');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(scriptPath, [
      'Set sh = CreateObject("WScript.Shell")',
      `sh.CurrentDirectory = "${quote(repo)}"`,
      `sh.Run """${quote(nodeExe)}"" ""${quote(def.args[0])}""", 0, False`,
      ''
    ].join('\r\n'), 'utf8');
    try {
      const launcher = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe'), [scriptPath], {
        cwd: repo,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      launcher.unref();
    } catch (error) {
      return { ok: false, reason: `隐藏启动 qq-bridge 失败：${error.message}` };
    }

    const deadline = now() + (def.waitMs || 25000);
    let record = null;
    while (now() < deadline) {
      await sleep(500);
      if (!(await tcpProbe(3100, '127.0.0.1', 500))) continue;
      const listeners = await netstatListeners();
      const listenerPid = listeners.get(3100);
      if (!listenerPid) continue;
      const details = await listProcessDetails();
      const found = details.find((item) => item.pid === listenerPid);
      if (!found) continue;
      let root = found;
      const seen = new Set();
      while (root && !seen.has(root.pid)) {
        seen.add(root.pid);
        const parent = details.find((item) => item.pid === root.parentPid);
        if (!parent) break;
        const parentCmd = String(parent.cmdline || '').toLowerCase();
        if (!parentCmd.includes('start-bridge.mjs')) break;
        root = parent;
      }
      record = {
        id: 'bridge',
        pid: root.pid,
        startMs: root.startMs,
        exe: root.exe,
        cmdline: root.cmdline,
        parentPid: root.parentPid,
        signature: 'start-bridge.mjs',
        startedAt: new Date(now()).toISOString()
      };
      break;
    }

    if (!record) {
      return { ok: false, rollback: true, reason: `隐藏启动超时：${def.waitMs}ms 内未检测到 qq-bridge 控制台（3100）` };
    }
    state.services.bridge = record;
    saveState(state);
    clearStoppedByUser(stateDir, 'bridge');
    log('control', `started bridge hidden pid=${record.pid}`);
    return { ok: true, record };
  }

  async function startUnlocked(id, { env = {} } = {}) {
    if (!enabled()) return { ok: false, reason: '真实控制未启用，请先在服务页显式开启' };
    const defs = buildDefinitions();
    const def = defs[id];
    if (!def) return { ok: false, reason: `未知服务：${id}` };
    if (id === 'bridge' && enforceDependencies) {
      const snowReady = (await Promise.all(defs.snowluma.ports.map((port) => tcpProbe(port, '127.0.0.1', 700)))).every(Boolean);
      if (!snowReady) {
        return { ok: false, dependency: 'snowluma', reason: 'SnowLuma 未就绪（3000/3001 未全部监听），请先启动 SnowLuma 再启动 qq-bridge' };
      }
    }

    const state = loadState();
    const existing = state.services[id];
    if (existing) {
      const details = await listProcessDetails();
      if (verifyProcess(existing, details).ok) {
        return { ok: false, reason: '该服务已由本软件启动并在运行', already: true };
      }
      delete state.services[id];
      saveState(state);
    }

    if (await anyPortOpen(def.ports)) {
      return { ok: false, reason: '端口已被占用：可能是外部启动的实例，本软件不会重复启动', external: true };
    }
    if (def.listenPort && await tcpProbe(def.listenPort, '127.0.0.1', 500)) {
      return { ok: false, reason: 'SnowLuma WebUI（5099）已在监听：已有实例正在启动或运行', external: true };
    }
    const details = await listProcessDetails();
    if (id === 'dsh') {
      const running = details.find((item) => item.exe.toLowerCase() === String(def.exe).toLowerCase());
      if (running) return { ok: false, reason: 'DSH 已在运行（外部实例），不重复启动', external: true };
    }

    log('control', `start ${id}`);
    if (def.launcher === 'vbs') return startHiddenSnowluma(def, state);
    if (def.launcher === 'vbs-bridge') return startHiddenBridge(def, state);
    if (def.scriptFile) {
      const scriptPath = path.join(stateDir, def.scriptFile);
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(scriptPath, `& "${path.join(getSettings().snowlumaRoot, 'node.exe')}" "index.mjs"\r\n`, 'utf8');
      def.args = def.args.map((arg) => (arg === '' ? scriptPath : arg));
    }
    let child;
    let logFd = null;
    try {
      if (def.logFile) {
        fs.mkdirSync(stateDir, { recursive: true });
        logFd = fs.openSync(path.join(stateDir, def.logFile), 'a');
      }
      child = spawn(def.exe, def.args, {
        cwd: def.cwd,
        detached: def.detached !== false,
        stdio: logFd ? ['ignore', logFd, logFd] : 'ignore',
        windowsHide: true,
        env: { ...process.env, ...(def.env || {}), ...(env || {}) }
      });
      child.unref();
      if (logFd) fs.closeSync(logFd);
      logFd = null;
    } catch (error) {
      if (logFd) { try { fs.closeSync(logFd); } catch { /* ignore */ } }
      return { ok: false, reason: `启动失败：${error.message}` };
    }

    let exited = null;
    child.once('exit', (code, signal) => { exited = { code, signal }; });
    child.once('error', (error) => { exited = { error: error.message }; });

    const deadline = now() + (def.waitMs || 15000);
    let record = null;
    while (now() < deadline) {
      await sleep(400);
      if (exited) {
        await cleanupFailedSpawn(child.pid, def);
        return { ok: false, rolledBack: true, reason: `进程启动后立即退出（code=${exited.code ?? '—'}${exited.error ? `, ${exited.error}` : ''}），已清理残留` };
      }
      const list = await listProcessDetails();
      const found = list.find((item) => item.pid === child.pid);
      if (!found) continue;
      const waitPorts = def.readyPorts && def.readyPorts.length ? def.readyPorts : def.ports;
      if (waitPorts && waitPorts.length && !(await anyPortOpen(waitPorts))) continue;
      if (def.signature && !found.cmdline.toLowerCase().includes(String(def.signature).toLowerCase())) continue;
      record = {
        id,
        pid: found.pid,
        startMs: found.startMs,
        exe: found.exe,
        cmdline: found.cmdline,
        parentPid: found.parentPid,
        signature: def.signature,
        startedAt: new Date(now()).toISOString()
      };
      break;
    }
    if (!record) {
      const cleaned = await cleanupFailedSpawn(child.pid, def);
      return { ok: false, rolledBack: true, cleaned: cleaned.killed, reason: `启动超时：${def.waitMs}ms 内未就绪，已清理本次启动的进程` };
    }

    if (id === 'bridge') {
      const childPid = await readBridgeChild();
      if (childPid) {
        const list = await listProcessDetails();
        const found = list.find((item) => item.pid === childPid);
        if (found && found.cmdline.toLowerCase().includes(String(def.bridgeSignature).toLowerCase())) {
          record.child = {
            pid: found.pid,
            startMs: found.startMs,
            exe: found.exe,
            cmdline: found.cmdline,
            parentPid: found.parentPid,
            signature: def.bridgeSignature
          };
        }
      }
    }

    state.services[id] = record;
    saveState(state);
    clearStoppedByUser(stateDir, id);
    // 启动成功后，只释放「桌面创建」的哨兵；用户自己的哨兵永远不会被删。
    if (readSentinelMarker()?.createdByDesktop) removeSentinel();
    log('control', `started ${id} pid=${record.pid}`);
    if (def.ports && def.ports.length && !(await allPortsOpen(def.ports))) {
      return {
        ok: true,
        starting: true,
        record,
        reason: id === 'snowluma'
          ? 'SnowLuma WebUI 已启动，但 QQ 尚未登录：请打开 http://127.0.0.1:5099 完成登录，登录后 3000/3001 才会就绪'
          : '进程已启动，但服务端口尚未全部就绪'
      };
    }
    return { ok: true, record };
  }

  async function stopUnlocked(id, { force = false, confirmBusy = false, ignoreEnabled = false } = {}) {
    if (!enabled() && !ignoreEnabled) return { ok: false, reason: '真实控制未启用，请先在服务页显式开启' };
    const defs = buildDefinitions();
    const def = defs[id];
    if (!def) return { ok: false, reason: `未知服务：${id}` };

    const state = loadState();
    const record = state.services[id];
    if (!record) {
      return { ok: false, reason: '该服务不是由本软件启动的，拒绝停止（外部实例请自行处理）', external: true };
    }

    const busy = assessBusy(getSettings().repoRoot, { now: now() });
    if (busy.state !== 'idle' && !confirmBusy) {
      return {
        ok: false,
        busy: busy.state,
        needsConfirm: true,
        reasons: busy.reasons,
        reason: busy.state === 'busy'
          ? '检测到最近的 agent 活动/消息处理/记忆写入，默认拒绝停止'
          : '无法确认是否空闲（状态未知），默认拒绝停止；如确认可以中断，请人工确认'
      };
    }

    const details = await listProcessDetails();
    const tree = verifyTree(record, details, {
      exeIncludes: def.treeExeIncludes || [],
      signatures: def.treeSignatures || []
    });
    if (!tree.ok) {
      return {
        ok: false,
        treeUnverified: true,
        identity: tree.rootOk === false ? false : undefined,
        reason: `整树归属校验失败：${tree.reason}；为避免误伤无关进程，已拒绝停止`,
        unknown: tree.unknown || []
      };
    }

    const sentinel = id === 'bridge' ? ensureSentinel() : { created: false };
    const targets = [record, ...tree.descendants];

    // TOCTOU：真正发终止信号前，用最新的进程快照再校验一次根/子进程身份。
    const recheckIdentity = async () => {
      const fresh = await listProcessDetails();
      const rootCheck = verifyProcess(record, fresh);
      if (!rootCheck.ok) return { ok: false, reason: `终止前身份复核失败：${rootCheck.reason}` };
      if (record.child) {
        const childCheck = verifyProcess(record.child, fresh);
        if (!childCheck.ok) return { ok: false, reason: `终止前子进程身份复核失败：${childCheck.reason}` };
      }
      return { ok: true };
    };

    const beforeKill = await recheckIdentity();
    if (!beforeKill.ok) {
      if (sentinel.created) restoreSentinel();
      return { ok: false, identity: false, reason: beforeKill.reason };
    }
    log('control', `stop ${id} tree=${targets.map((t) => t.pid).join(',')} force=${force}`);

    // 先对根进程发正常退出（taskkill /T 会把退出信号覆盖整棵树），再逐个检查。
    await taskkill(record.pid, { force: false, tree: true });
    const alive = [];
    for (const target of targets) {
      if (!(await waitUntilGone(target.pid, stopTimeoutMs / Math.max(1, targets.length)))) alive.push(target);
    }

    if (alive.length && !force) {
      if (sentinel.created) restoreSentinel();
      return {
        ok: false,
        needsForce: true,
        alive: alive.map((item) => ({ pid: item.pid, startMs: item.startMs })),
        reason: '正常退出超时；继续需要确认强制结束'
      };
    }

    let forced = false;
    if (alive.length) {
      const confirm = await recheckIdentity();
      if (!confirm.ok) {
        return { ok: false, identity: false, reason: confirm.reason, alive: alive.map((item) => item.pid) };
      }
      // Re-check each surviving descendant immediately before force-killing it.
      // The earlier tree snapshot is not enough: PIDs can be reused between checks.
      const fresh = await listProcessDetails();
      for (const target of alive) {
        const check = verifyProcess(target, fresh);
        if (!check.ok) {
          return {
            ok: false,
            identity: false,
            reason: `强制终止前后代身份复核失败：PID ${target.pid} ${check.reason}`,
            alive: alive.map((item) => item.pid)
          };
        }
      }
      forced = true;
      for (const target of alive) await taskkill(target.pid, { force: true, tree: true });
      for (const target of alive) await waitUntilGone(target.pid, 5000);
    }

    const stillAlive = targets.filter((target) => isAlive(target.pid));
    if (stillAlive.length) {
      return { ok: false, reason: `仍有进程存活：${stillAlive.map((t) => t.pid).join(',')}`, alive: stillAlive };
    }

    delete state.services[id];
    saveState(state);
    setStoppedByUser(stateDir, id, { now: now(), reason: 'user-stop' });
    if (sentinel.created) {
      writeJson(sentinelMarker, {
        createdByDesktop: true,
        createdAt: new Date(now()).toISOString(),
        operationId: `stop-${id}-${now()}`
      });
      log('control', 'watchdog sentinel kept while service is stopped');
    }
    log('control', `stopped ${id}${forced ? ' (forced)' : ''}`);
    return { ok: true, forced, sentinel: sentinel.created };
  }

  /**
   * 哨兵恢复：
   * - 仅处理「桌面创建」的哨兵（marker.createdByDesktop）；
   * - 桥接已在运行时，说明停顿状态已结束，删除哨兵，让 watchdog 恢复工作；
   * - 桥接未运行时保留哨兵（这是有意的停止状态），避免 5 分钟后被拉起。
   */
  async function recoverSentinel({ bridgeRunning } = {}) {
    const marker = readSentinelMarker();
    if (!marker || !marker.createdByDesktop) {
      return { ok: false, reason: '当前哨兵不是桌面创建的，拒绝修改' };
    }
    const running = bridgeRunning === undefined ? await tcpProbe(3100, '127.0.0.1', 800) : Boolean(bridgeRunning);
    if (!running) {
      return { ok: false, kept: true, reason: '桥接未运行，哨兵保留（服务处于停止状态）；启动服务后会按记录释放' };
    }
    removeSentinel();
    log('control', 'watchdog sentinel recovered (bridge running)');
    return { ok: true, removed: true, reason: '桥接已在运行，已恢复 watchdog' };
  }

  async function startOriginalBridge() {
    if (!enabled()) return { ok: false, reason: '真实控制未启用，请先在服务页显式开启' };
    if (getIntent(stateDir, 'bridge')) {
      return { ok: false, reason: 'bridge 被标记为用户主动停止，拒绝用原启动方式自动拉起（如需启动请显式清除意图）' };
    }
    const repo = getSettings().repoRoot;
    const vbs = path.join(repo, 'start-qq-bridge-hidden.vbs');
    const cmd = path.join(repo, 'start-qq-bridge-silent.cmd');
    if (!fs.existsSync(vbs) && !fs.existsSync(cmd)) {
      return { ok: false, reason: '找不到原启动器（start-qq-bridge-hidden.vbs / start-qq-bridge-silent.cmd）' };
    }
    if (await tcpProbe(3100, '127.0.0.1', 800)) {
      return { ok: false, reason: '3100 已在监听：已有实例，拒绝重复启动' };
    }
    const exe = fs.existsSync(vbs) ? 'wscript.exe' : 'cmd.exe';
    const args = fs.existsSync(vbs) ? [vbs] : ['/c', cmd];
    try {
      const child = spawn(exe, args, { cwd: repo, detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
    } catch (error) {
      return { ok: false, reason: `原启动方式失败：${error.message}` };
    }
    const deadline = now() + 30000;
    while (now() < deadline) {
      await sleep(500);
      if (await tcpProbe(3100, '127.0.0.1', 800)) {
        log('control', 'bridge started via original launcher');
        return { ok: true, method: 'original', external: true, note: '由原启动器启动，本软件不接管停止' };
      }
    }
    return { ok: false, reason: '原启动方式 30 秒内未监听 3100' };
  }

  async function preflight() {
    const settings = getSettings();
    const defs = buildDefinitions();
    const checks = [];
    const add = (id, label, state, detail) => checks.push({ id, label, state, detail });

    const bridgePort = await tcpProbe(3100, '127.0.0.1', 800);
    const snowPorts = [await tcpProbe(3000, '127.0.0.1', 500), await tcpProbe(3001, '127.0.0.1', 500)];

    const backups = listBackups(settings.repoRoot, backupRoots)
      .filter((item) => item.desktop && item.manifest)
      .slice(0, 1);
    if (!backups.length) {
      add('backup', '可用备份', 'warn', '没有找到桌面备份；首次真实操作前建议先创建一次');
    } else {
      const verify = verifyBackup(backups[0].dir);
      add('backup', '可用备份', verify.ok ? 'ok' : 'bad',
        `${path.basename(backups[0].dir)} · ${verify.ok ? '校验通过' : `校验失败：${verify.errors[0]}`}`);
    }

    const details = await listProcessDetails();
    const state = loadState();
    for (const id of Object.keys(defs)) {
      const record = state.services[id];
      if (record) {
        const check = verifyProcess(record, details);
        add(`process:${id}`, `${defs[id].id} 身份`, check.ok ? 'ok' : 'bad',
          check.ok ? `PID ${record.pid} 身份匹配` : `PID ${record.pid} 校验失败：${check.reason}`);
      } else {
        add(`process:${id}`, `${defs[id].id} 身份`, 'ok', '无桌面启动记录（视为外部/未运行）');
      }
    }

    add('ports', '端口状态', snowPorts.every(Boolean) ? 'ok' : 'warn',
      `3000=${snowPorts[0] ? '开' : '关'} / 3001=${snowPorts[1] ? '开' : '关'} / 3100=${bridgePort ? '开' : '关'}`);

    const marker = readSentinelMarker();
    const sentinelExists = fs.existsSync(sentinelPath());
    if (!sentinelExists) add('watchdog', 'watchdog 状态', 'ok', '未设置禁用哨兵，watchdog 正常');
    else add('watchdog', 'watchdog 状态', 'warn',
      `哨兵存在（${marker?.createdByDesktop ? '桌面创建' : '用户设置'}）；桥接运行时应恢复`);

    const launcher = path.join(settings.repoRoot, 'start-qq-bridge-hidden.vbs');
    add('launcher', '原启动方式', fs.existsSync(launcher) ? 'ok' : 'warn',
      fs.existsSync(launcher) ? 'start-qq-bridge-hidden.vbs 可用（回滚用）' : '找不到原启动器');

    add('duplicate', '重复实例检查', bridgePort ? 'warn' : 'ok',
      bridgePort ? '3100 已在监听；启动会拒绝，避免重复实例' : '3100 空闲，可安全启动');

    const bad = checks.filter((check) => check.state === 'bad').length;
    return { ok: bad === 0, checks, enabled: Boolean(settings.controlEnabled), at: now() };
  }

  async function reconcile() {
    const state = loadState();
    const details = await listProcessDetails();
    let changed = false;
    for (const [id, record] of Object.entries(state.services)) {
      if (!verifyProcess(record, details).ok) {
        delete state.services[id];
        changed = true;
        log('control', `reconcile: drop ${id}`);
      }
    }

    // supervisor 会在 bridge 崩溃后拉起新的子进程；锁文件是子进程的最新身份来源。
    const bridgeRecord = state.services.bridge;
    if (bridgeRecord) {
      const childPid = await readBridgeChild();
      const found = childPid ? details.find((item) => item.pid === childPid) : null;
      if (found && found.cmdline.toLowerCase().includes('bridge.js')) {
        const fresh = {
          pid: found.pid,
          startMs: found.startMs,
          exe: found.exe,
          cmdline: found.cmdline,
          parentPid: found.parentPid,
          signature: 'bridge.js'
        };
        const old = bridgeRecord.child;
        if (!old || old.pid !== fresh.pid || Math.abs(Number(old.startMs) - Number(fresh.startMs)) > 3000) {
          bridgeRecord.child = fresh;
          changed = true;
          log('control', `reconcile: bridge child refreshed pid=${fresh.pid}`);
        }
      } else if (bridgeRecord.child && !verifyProcess(bridgeRecord.child, details).ok) {
        delete bridgeRecord.child;
        changed = true;
        log('control', 'reconcile: stale bridge child removed');
      }
    }
    if (changed) saveState(state);

    // 崩溃恢复：桌面创建的哨兵如果对应的桥接已经在运行，说明停止流程已结束/被外部拉起。
    const marker = readSentinelMarker();
    if (marker?.createdByDesktop && fs.existsSync(sentinelPath()) && (await tcpProbe(3100, '127.0.0.1', 600))) {
      removeSentinel();
      log('control', 'reconcile: stale watchdog sentinel removed (bridge running)');
    }
    return state.services;
  }

  async function describe(id) {
    const record = loadState().services[id];
    if (!record) return { owned: false, record: null };
    const details = await listProcessDetails();
    const check = verifyProcess(record, details);
    return { owned: check.ok, record, check };
  }

  async function stopOwnedServices() {
    const order = ['bridge', 'snowluma'];
    const results = [];
    // DSH 是智能体宿主，可能是用户外部实例；退出管理器不自动终止它。
    for (const id of order) {
      const record = loadState().services[id];
      if (!record) continue;
      try {
        const result = await stop(id, { force: true, confirmBusy: true, ignoreEnabled: true });
        results.push({ id, ...result });
      } catch (error) {
        results.push({ id, ok: false, reason: error.message });
      }
    }
    return results;
  }

  const serviceLocks = new Map();
  function withServiceLock(id, fn) {
    const previous = serviceLocks.get(id) || Promise.resolve();
    const current = previous.catch(() => {}).then(fn);
    serviceLocks.set(id, current.finally(() => {
      if (serviceLocks.get(id) === current) serviceLocks.delete(id);
    }));
    return current;
  }

  function start(id, options) {
    return withServiceLock(id, () => startUnlocked(id, options));
  }

  function stop(id, options) {
    return withServiceLock(id, () => stopUnlocked(id, options));
  }

  return {
    start,
    stop,
    stopOwnedServices,
    reconcile,
    describe,
    recoverSentinel,
    startOriginalBridge,
    preflight,
    enabled,
    records: () => loadState().services,
    sentinel: () => ({
      path: sentinelPath(),
      marker: readSentinelMarker(),
      exists: fs.existsSync(sentinelPath())
    }),
    buildDefinitions
  };
}

module.exports = { createController };
