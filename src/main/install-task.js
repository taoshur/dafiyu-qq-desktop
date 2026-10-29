'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { catalogFor, planFor, defaultInstallRoot } = require('./install-catalog');

function findBundledBridge() {
  const candidates = [
    path.join(process.resourcesPath || '', 'qq-bridge'),
    path.join(__dirname, '..', '..', 'vendor', 'qq-bridge')
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'package.json'))) || null;
}

const TASK_STATUS = Object.freeze({
  IDLE: 'idle',
  CHECKING: 'checking',
  DOWNLOADING: 'downloading',
  INSTALLING: 'installing',
  CONFIGURING: 'configuring',
  VERIFYING: 'verifying',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLING: 'cancelling',
  CANCELLED: 'cancelled'
});

const ACTIVE = new Set([
  TASK_STATUS.CHECKING,
  TASK_STATUS.DOWNLOADING,
  TASK_STATUS.INSTALLING,
  TASK_STATUS.CONFIGURING,
  TASK_STATUS.VERIFYING,
  TASK_STATUS.CANCELLING
]);

function redact(text) {
  return String(text || '')
    .replace(/(token|password|secret|authorization)\s*[=:]\s*\S+/gi, '$1=<redacted>')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-<redacted>')
    .slice(0, 500);
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex').toUpperCase()));
  });
}

function download(url, target, { signal, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    let request = null;
    const follow = (current, redirects = 0) => {
      if (signal?.aborted) { reject(Object.assign(new Error('已取消'), { cancelled: true })); return; }
      if (redirects > 5) { reject(new Error('下载重定向过多')); return; }
      request = https.get(current, { headers: { 'user-agent': 'dafiyu-installer' }, timeout: 30000 }, (response) => {
        const status = Number(response.statusCode || 0);
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          response.resume();
          follow(new URL(response.headers.location, current).href, redirects + 1);
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(new Error(`下载失败：HTTP ${status}`));
          return;
        }
        const total = Number(response.headers['content-length'] || 0);
        let received = 0;
        const stream = fs.createWriteStream(target, { flags: 'w' });
        const abort = () => {
          try { request?.destroy(); } catch { /* ignore */ }
          try { stream.destroy(new Error('已取消')); } catch { /* ignore */ }
          reject(Object.assign(new Error('已取消'), { cancelled: true }));
        };
        if (signal) signal.addEventListener('abort', abort, { once: true });
        response.on('data', (chunk) => {
          received += chunk.length;
          if (onProgress) onProgress({ received, total });
        });
        response.on('error', (error) => reject(error));
        stream.on('error', (error) => reject(error));
        stream.on('finish', () => resolve({ bytes: received, total }));
        response.pipe(stream);
      });
      request.on('timeout', () => { request.destroy(new Error('下载超时')); });
      request.on('error', (error) => {
        if (signal?.aborted || error.message === '已取消') reject(Object.assign(new Error('已取消'), { cancelled: true }));
        else reject(error);
      });
    };
    follow(url);
  });
}

function runProcess(file, args, { cwd, signal, onLog, shell = false } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(file, args, { cwd, shell, windowsHide: true, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      reject(error); return;
    }
    const append = (chunk) => {
      const text = redact(chunk.toString('utf8'));
      if (text && onLog) onLog(text);
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    const abort = () => {
      if (!child || child.killed) return;
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        } else child.kill('SIGTERM');
      } catch { /* ignore */ }
    };
    if (signal) signal.addEventListener('abort', abort, { once: true });
    child.on('error', reject);
    child.on('exit', (code, sig) => {
      if (signal?.aborted) reject(Object.assign(new Error('已取消'), { cancelled: true }));
      else if (code === 0) resolve({ code });
      else reject(new Error(`进程退出：code=${code ?? '—'}${sig ? ` signal=${sig}` : ''}`));
    });
  });
}

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function createInstallManager({ paths, settings = {}, log = () => {}, component = 'bridge', journal = null } = {}) {
  const emitter = new EventEmitter();
  const stateFile = path.join(paths.stateDir, 'install.json');
  const tempRoot = path.join(paths.cacheDir, 'install');
  let task = null;
  let controller = null;
  let child = null;
  let taskSeq = 0;
  let lastJournalAt = 0;

  const emit = () => {
    if (!task) return;
    emitter.emit('update', JSON.parse(JSON.stringify(task)));
    const now = Date.now();
    const terminal = ['completed', 'failed', 'cancelled'].includes(task.status);
    if (journal && (terminal || now - lastJournalAt > 750)) {
      lastJournalAt = now;
      try { journal.record({ ...task, kind: 'install' }); } catch { /* journal must not break install */ }
    }
    if (typeof log === 'function') {
      const last = task.logs[task.logs.length - 1];
      if (last && last.seq !== task.lastLogged) {
        task.lastLogged = last.seq;
        log('install', `${task.status} ${task.component} ${last.line}`);
      }
    }
  };
  const addLog = (line) => {
    if (!task) return;
    task.logs.push({ seq: ++task.logSeq, at: Date.now(), line: redact(line) });
    if (task.logs.length > 300) task.logs.splice(0, task.logs.length - 300);
    emit();
  };
  const setStatus = (status, step) => {
    if (!task) return;
    task.status = status;
    if (step) task.step = step;
    task.updatedAt = Date.now();
    emit();
  };
  const fail = (error) => {
    if (!task) return;
    if (controller?.signal.aborted || error?.cancelled) {
      task.status = TASK_STATUS.CANCELLED;
      task.error = '已取消';
    } else {
      task.status = TASK_STATUS.FAILED;
      task.error = redact(error?.message || error);
    }
    task.finishedAt = Date.now();
    emit();
  };
  const cleanupTemp = () => {
    if (!task?.tempDir) return;
    try { fs.rmSync(task.tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  };
  const killChild = () => {
    if (!child) return;
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else child.kill('SIGTERM');
    } catch { /* ignore */ }
  };

  async function run() {
    if (!task) return;
    const item = catalogFor(task.component);
    if (!item?.autoInstall) throw new Error('该组件不支持自动安装');
    const target = task.targetDir;
    const tempDir = fs.mkdtempSync(path.join(tempRoot, `${task.component}-`));
    task.tempDir = tempDir;
    const archive = path.join(tempDir, 'source.zip');
    let targetCreated = false;
    try {
      setStatus(TASK_STATUS.CHECKING, '检查系统与目标目录');
      if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
        throw new Error('目标目录已存在且非空；请选择其他目录或复用已有安装，不能覆盖');
      }
      if (!fs.existsSync(path.dirname(target))) fs.mkdirSync(path.dirname(target), { recursive: true });
      if (!fs.existsSync(target)) { fs.mkdirSync(target, { recursive: true }); targetCreated = true; }

      if (item.bundled) {
        setStatus(TASK_STATUS.INSTALLING, '复制安装包内置的 qq-bridge 源码');
        const source = findBundledBridge();
        if (!source) throw new Error('安装包内没有找到内置 qq-bridge 源码');
        for (const entry of fs.readdirSync(source)) {
          fs.cpSync(path.join(source, entry), path.join(target, entry), { recursive: true });
        }
        addLog(`使用内置源码：${source}`);
      } else {
        setStatus(TASK_STATUS.DOWNLOADING, item.kind === 'binary-zip' ? '下载官方发行包' : '下载官方源码归档');
        addLog(`来源：${item.url}`);
        task.total = item.size || 0;
        emit();
        await download(item.url, archive, {
          signal: controller.signal,
          onProgress: ({ received, total }) => {
            task.received = received;
            task.total = total || task.total;
            task.percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : null;
            emit();
          }
        });
        if (controller.signal.aborted) throw Object.assign(new Error('已取消'), { cancelled: true });

        setStatus(TASK_STATUS.INSTALLING, '校验下载文件');
        const actual = await hashFile(archive);
        if (actual !== item.sha256) throw new Error(`SHA256 不匹配（期望 ${item.sha256}，实际 ${actual}）`);
        addLog(`SHA256 校验通过：${actual}`);

        setStatus(TASK_STATUS.INSTALLING, '解压官方发行包');
        const extractDir = path.join(tempDir, 'extract');
        fs.mkdirSync(extractDir, { recursive: true });
        await runProcess('tar.exe', ['-xf', archive, '-C', extractDir], { signal: controller.signal, onLog: addLog });
        const sourceDir = item.archiveRoot ? path.join(extractDir, item.archiveRoot) : extractDir;
        if (!fs.existsSync(sourceDir)) throw new Error(`归档中没有预期目录 ${item.archiveRoot || 'root'}`);
        for (const entry of fs.readdirSync(sourceDir)) {
          fs.renameSync(path.join(sourceDir, entry), path.join(target, entry));
        }
        addLog(item.kind === 'source-archive' ? '源码已解压到目标目录' : '官方发行包已解压到目标目录');
      }

      if (item.kind === 'source-archive' || item.bundled) {
        setStatus(TASK_STATUS.INSTALLING, '安装 npm 依赖');
        if (process.platform === 'win32') {
          await runProcess(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm install --no-audit --no-fund'], {
            cwd: target, signal: controller.signal,
            onLog: (line) => { addLog(line); }
          });
        } else {
          await runProcess('npm', ['install', '--no-audit', '--no-fund'], {
            cwd: target, signal: controller.signal,
            onLog: (line) => { addLog(line); }
          });
        }
      }

      setStatus(TASK_STATUS.CONFIGURING, item.kind === 'binary-zip' ? '保留官方 LICENSE/EULA，等待首次启动配置' : '初始化配置');
      if (item.configFile && item.configExample) {
        const cfg = path.join(target, item.configFile);
        const example = path.join(target, item.configExample);
        if (!fs.existsSync(cfg) && fs.existsSync(example)) {
          fs.copyFileSync(example, cfg);
          addLog('已从 config.example.json 初始化 config.json；仍需填写账号/API 配置');
        }
      } else if (item.kind === 'binary-zip') {
        addLog('未修改官方发行包内容；WebUI 初始密码在首次启动/登录时生成');
      }

      setStatus(TASK_STATUS.VERIFYING, '验证安装结果');
      const missing = (item.verifyEntries || []).filter((entry) => !fs.existsSync(path.join(target, entry)));
      if (missing.length) {
        throw new Error(`安装后验证失败：缺少 ${missing.join(', ')}`);
      }
      if (item.kind === 'source-archive' || item.bundled) {
        const entry = path.join(target, item.entry[0], item.entry[1]);
        await runProcess(process.execPath, ['--check', entry], { cwd: target, signal: controller.signal, onLog: addLog });
      }

      const registry = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { components: {} };
      registry.components = registry.components || {};
      registry.components[item.id] = {
        id: item.id,
        version: item.version,
        root: target,
        installedAt: Date.now(),
        source: item.url,
        sha256: item.sha256,
        licenseAcceptedAt: item.requiresLicenseAcceptance ? task.licenseAcceptedAt : null
      };
      writeAtomic(stateFile, registry);
      task.result = { root: target, version: item.version };
      task.percent = 100;
      setStatus(TASK_STATUS.COMPLETED, '安装完成（尚未启动服务）');
      addLog('安装完成；服务运行状态需单独检测，不会自动启动');
    } catch (error) {
      if (targetCreated && task.status !== TASK_STATUS.COMPLETED) {
        try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* ignore */ }
      }
      fail(error);
    } finally {
      cleanupTemp();
      task.tempDir = null;
      controller = null;
      child = null;
      emit();
    }
  }

  function start({ component: requested = component, targetDir = null, confirmed = false, licenseAccepted = false } = {}) {
    if (task && ACTIVE.has(task.status)) return { ok: false, reason: '已有安装任务在进行中', task: JSON.parse(JSON.stringify(task)) };
    if (!confirmed) return { ok: false, reason: '需要用户确认后才会下载和安装' };
    const plan = planFor({ component: requested, targetDir: targetDir || undefined, settings });
    if (!plan.ok) return { ok: false, reason: plan.reason, official: plan.official };
    if (plan.requiresLicenseAcceptance && !licenseAccepted) {
      return { ok: false, reason: '安装 SnowLuma 前必须由用户确认接受官方 LICENSE 与 EULA' };
    }
    controller = new AbortController();
    task = {
      id: `${requested}-${Date.now()}-${++taskSeq}`,
      component: requested,
      kind: 'install',
      status: TASK_STATUS.CHECKING,
      step: '准备',
      targetDir: plan.targetDir,
      version: plan.version,
      licenseAcceptedAt: plan.requiresLicenseAcceptance ? Date.now() : null,
      percent: null,
      received: 0,
      total: plan.size || 0,
      logs: [],
      logSeq: 0,
      lastLogged: 0,
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      finishedAt: null,
      result: null,
      tempDir: null
    };
    fs.mkdirSync(tempRoot, { recursive: true });
    emit();
    run().catch((error) => fail(error));
    return { ok: true, task: JSON.parse(JSON.stringify(task)) };
  }

  async function cancel() {
    if (!task || !ACTIVE.has(task.status)) return { ok: false, reason: '没有可取消的安装任务' };
    setStatus(TASK_STATUS.CANCELLING, '正在取消');
    try { controller?.abort(); } catch { /* ignore */ }
    killChild();
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (!task) return { ok: true };
    if (![TASK_STATUS.COMPLETED, TASK_STATUS.CANCELLED, TASK_STATUS.FAILED].includes(task.status)) {
      task.status = TASK_STATUS.CANCELLED;
      task.error = '已取消';
      task.finishedAt = Date.now();
      cleanupTemp();
      emit();
    }
    return { ok: true, task: JSON.parse(JSON.stringify(task)) };
  }

  function cleanupStale() {
    try {
      if (!fs.existsSync(tempRoot)) return;
      for (const entry of fs.readdirSync(tempRoot)) {
        const full = path.join(tempRoot, entry);
        try {
          if (Date.now() - fs.statSync(full).mtimeMs > 24 * 3600 * 1000) fs.rmSync(full, { recursive: true, force: true });
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }
  cleanupStale();

  return {
    start,
    cancel,
    status: () => (task ? JSON.parse(JSON.stringify(task)) : null),
    onUpdate: (listener) => emitter.on('update', listener),
    catalog: (id) => catalogFor(id),
    defaultInstallRoot
  };
}

module.exports = { createInstallManager, TASK_STATUS, ACTIVITY: ACTIVE };
