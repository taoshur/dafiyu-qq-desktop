'use strict';

const { execFile } = require('node:child_process');

// 通过 CIM 读取进程的 PID / 启动时间 / 可执行路径 / 命令行，用于防止 PID 复用误杀。
// 固定脚本 + EncodedCommand，避免任何命令行拼接与 shell 注入。
const PROCESS_SCRIPT = [
  'Get-CimInstance Win32_Process |',
  'Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine,',
  '@{n="StartMs";e={[int64]([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds()}} |',
  'ConvertTo-Json -Compress'
].join(' ');

function runPowershell(script, timeoutMs = 9000) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024
    }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout || ''));
    });
  });
}

async function listProcessDetails() {
  const raw = (await runPowershell(PROCESS_SCRIPT)).trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list
    .filter((item) => item && Number.isInteger(Number(item.ProcessId)))
    .map((item) => ({
      pid: Number(item.ProcessId),
      parentPid: Number(item.ParentProcessId) || 0,
      name: String(item.Name || ''),
      exe: item.ExecutablePath ? String(item.ExecutablePath) : '',
      cmdline: item.CommandLine ? String(item.CommandLine) : '',
      startMs: Number(item.StartMs) || 0
    }));
}

function samePath(a, b) {
  if (!a || !b) return false;
  return String(a).replace(/[\\/]+/g, '\\').toLowerCase() === String(b).replace(/[\\/]+/g, '\\').toLowerCase();
}

/**
 * 严格校验：PID 存在、启动时间一致（±3s）、可执行路径一致、命令行包含特征串。
 * 任一不满足都视为「不是我们启动的那个进程」，拒绝操作。
 */
function verifyProcess(record, details) {
  if (!record) return { ok: false, reason: '没有本软件的启动记录' };
  const found = details.find((item) => item.pid === record.pid);
  if (!found) return { ok: false, reason: `PID ${record.pid} 已不存在` };
  if (record.startMs && Math.abs(found.startMs - record.startMs) > 3000) {
    return { ok: false, reason: '进程启动时间与记录不一致（PID 可能被复用）', found };
  }
  if (record.exe && !samePath(found.exe, record.exe)) {
    return { ok: false, reason: '可执行文件路径不一致', found };
  }
  if (record.parentPid && Number(found.parentPid) !== Number(record.parentPid)) {
    return { ok: false, reason: '父进程 PID 不一致（父子关系已变化）', found };
  }
  const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (record.cmdline) {
    if (normalize(found.cmdline) !== normalize(record.cmdline)) {
      return { ok: false, reason: '完整命令行不匹配', found };
    }
  } else {
    const signature = String(record.signature || '').toLowerCase();
    if (signature && !found.cmdline.toLowerCase().includes(signature)) {
      return { ok: false, reason: '命令行特征不匹配', found };
    }
  }
  return { ok: true, found };
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === 'EPERM';
  }
}

function taskkill(pid, { force = false, tree = true } = {}) {
  const args = ['/PID', String(pid)];
  if (tree) args.push('/T');
  if (force) args.push('/F');
  return new Promise((resolve) => {
    execFile('taskkill', args, { windowsHide: true, timeout: 15000 }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

async function waitUntilGone(pid, timeoutMs, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return !isAlive(pid);
}

function collectTree(details, rootPid) {
  const byParent = new Map();
  for (const item of details) {
    if (!byParent.has(item.parentPid)) byParent.set(item.parentPid, []);
    byParent.get(item.parentPid).push(item);
  }
  const root = details.find((item) => item.pid === rootPid) || null;
  const collected = [];
  const queue = [rootPid];
  const seen = new Set([rootPid]);
  while (queue.length) {
    const pid = queue.shift();
    for (const child of byParent.get(pid) || []) {
      if (seen.has(child.pid)) continue;
      seen.add(child.pid);
      collected.push(child);
      queue.push(child.pid);
    }
  }
  return { root, descendants: collected };
}

/**
 * 整树归属校验：根进程必须匹配记录；每个后代都必须命中允许的可执行文件或命令行特征。
 * 任何一个后代无法证明属于该服务时，返回 ok=false，调用方必须拒绝停止。
 */
function verifyTree(record, details, { exeIncludes = [], signatures = [] } = {}) {
  const rootCheck = verifyProcess(record, details);
  if (!rootCheck.ok) return { ok: false, rootOk: false, reason: rootCheck.reason, descendants: [] };
  const { descendants } = collectTree(details, record.pid);
  const unknown = [];
  for (const child of descendants) {
    const sigOk = signatures.some((needle) => child.cmdline.toLowerCase().includes(String(needle).toLowerCase()));
    const exeOk = exeIncludes.some((needle) => child.exe.toLowerCase().includes(String(needle).toLowerCase()));
    // Windows 控制台宿主 conhost 是 Node 子进程自动派生的，不属于业务子进程。
    const consoleHost = String(child.name || '').toLowerCase() === 'conhost.exe';
    // 有特征串时只认特征串（防止“同是 node.exe 的无关子进程”混进来）；没有特征串时才退回 exe 匹配。
    const allowed = consoleHost || (signatures.length ? sigOk : exeOk);
    if (!allowed) unknown.push({ pid: child.pid, name: child.name, exe: child.exe, cmdline: child.cmdline });
  }
  if (unknown.length) {
    return {
      ok: false,
      reason: `进程树中存在 ${unknown.length} 个无法证明归属的子进程`,
      descendants,
      unknown
    };
  }
  return { ok: true, rootOk: true, descendants, unknown: [] };
}

module.exports = { listProcessDetails, verifyProcess, collectTree, verifyTree, isAlive, taskkill, waitUntilGone, samePath, runPowershell };
