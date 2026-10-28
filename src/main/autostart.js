'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { runPowershell } = require('./proc');

const TASK_NAME = 'DafiyuManager';
const SCHEDULE = 'ONLOGON';

function run(cmd, args, timeoutMs = 15000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, code: error ? error.code : 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function parseSchtasksList(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) out[match[1].trim()] = match[2].trim();
  }
  return out;
}

/** 真实后端：查询走 PowerShell（UTF-8 JSON，避免 schtasks 的 GBK 输出乱码）；创建/删除用 schtasks 固定参数。 */
const realBackend = {
  async query(name) {
    const safe = String(name).replace(/'/g, "''");
    const script = [
      '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
      `$t = Get-ScheduledTask -TaskName '${safe}' -ErrorAction Stop`,
      `$i = Get-ScheduledTaskInfo -TaskName '${safe}' -ErrorAction SilentlyContinue`,
      '$trigger = $t.Triggers | Select-Object -First 1',
      '[pscustomobject]@{',
      '  name = $t.TaskName',
      '  state = [string]$t.State',
      '  execute = if ($t.Actions.Count) { [string]$t.Actions[0].Execute } else { "" }',
      '  arguments = if ($t.Actions.Count) { [string]$t.Actions[0].Arguments } else { "" }',
      '  trigger = if ($trigger) { [string]$trigger.CimClass.CimClassName } else { "" }',
      '  runAs = [string]$t.Principal.UserId',
      '  lastRun = if ($i -and $i.LastRunTime) { $i.LastRunTime.ToString("o") } else { "" }',
      '} | ConvertTo-Json -Compress'
    ].join('\n');
    let raw;
    try {
      raw = (await runPowershell(script, 8000)).trim();
    } catch (error) {
      const message = String(error.message || '');
      if (/denied|拒绝访问/i.test(message)) throw new Error(message);
      return null;
    }
    if (!raw) return null;
    let data;
    try { data = JSON.parse(raw); } catch { return null; }
    if (!data || !data.name) return null;
    const trigger = /Logon/i.test(data.trigger) ? 'ONLOGON'
      : /Boot/i.test(data.trigger) ? 'BOOT'
        : /Time/i.test(data.trigger) ? 'TIME' : 'UNKNOWN';
    return {
      name: data.name,
      command: `${data.execute || ''} ${data.arguments || ''}`.trim(),
      schedule: trigger,
      status: data.state || '',
      state: data.state || '',
      runAs: data.runAs || '',
      lastRun: data.lastRun || ''
    };
  },
  async create({ name, command }) {
    const result = await run('schtasks', ['/Create', '/TN', name, '/TR', command, '/SC', 'ONLOGON', '/RL', 'LIMITED']);
    if (!result.ok) throw new Error(result.stderr.trim() || result.stdout.trim() || 'schtasks 创建失败');
  },
  async remove(name) {
    const result = await run('schtasks', ['/Delete', '/TN', name, '/F']);
    if (!result.ok) throw new Error(result.stderr.trim() || result.stdout.trim() || 'schtasks 删除失败');
  }
};

function normalized(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function commandMatches(actual, exePath) {
  const a = normalized(actual);
  const exe = normalized(exePath);
  return a.includes(exe) && a.includes('--hidden');
}

function scheduleMatches(actual) {
  return /onlogon|登录时/i.test(String(actual || ''));
}

function readState(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { return {}; }
}

function writeState(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, file);
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  }
}

function buildManagerCommand(exePath) {
  return `"${exePath}" --hidden`;
}

function createAutostart({ backend = realBackend, stateFile, taskName = TASK_NAME, exePath, log = () => {} }) {
  const expectedCommand = buildManagerCommand(exePath);

  async function status() {
    const state = readState(stateFile);
    let existing = null;
    try { existing = await backend.query(taskName); } catch (error) {
      return { state: 'error', reason: error.message, taskName, expectedCommand, owned: Boolean(state.owned) };
    }
    if (!existing) return { state: 'absent', taskName, expectedCommand, owned: Boolean(state.owned) };
    const same = commandMatches(existing.command, exePath) && scheduleMatches(existing.schedule);
    if (!same) {
      return {
        state: 'conflict',
        taskName,
        expectedCommand,
        existing,
        reason: '已存在同名任务，但命令或触发方式不同；拒绝覆盖'
      };
    }
    return {
      state: state.owned ? 'registered' : 'registered-unowned',
      taskName,
      expectedCommand,
      existing,
      owned: Boolean(state.owned)
    };
  }

  let ensureTask = null;
  let removeTask = null;

  async function ensure() {
    if (ensureTask) return ensureTask;
    ensureTask = ensureImpl();
    try { return await ensureTask; } finally { ensureTask = null; }
  }

  async function ensureImpl() {
    const before = await status();
    if (before.state === 'error') return { ok: false, action: 'none', reason: before.reason };
    if (before.state === 'registered') return { ok: true, action: 'already', ...before };
    if (before.state === 'registered-unowned') return { ok: true, action: 'present-external', ...before };
    if (before.state === 'conflict') return { ok: false, action: 'none', reason: before.reason, ...before };

    let created = false;
    try {
      await backend.create({ name: taskName, command: expectedCommand, schedule: SCHEDULE });
      created = true;
      const after = await backend.query(taskName);
      if (!after || !(commandMatches(after.command, exePath) && scheduleMatches(after.schedule))) {
        throw new Error('注册后核验失败：任务未按预期创建');
      }
      writeState(stateFile, { owned: true, createdAt: new Date().toISOString(), command: expectedCommand });
      log('autostart', 'manager task registered');
      return { ok: true, action: 'created', taskName, expectedCommand, existing: after };
    } catch (error) {
      if (created) {
        try { await backend.remove(taskName); } catch { /* 回滚失败留给人工处理 */ }
      }
      try { fs.rmSync(stateFile, { force: true }); } catch { /* ignore */ }
      log('autostart', `register failed: ${error.message}`);
      return { ok: false, action: 'rolled-back', reason: error.message };
    }
  }

  async function remove() {
    if (removeTask) return removeTask;
    removeTask = removeImpl();
    try { return await removeTask; } finally { removeTask = null; }
  }

  async function removeImpl() {
    const before = await status();
    if (before.state === 'error') return { ok: false, action: 'none', reason: before.reason };
    if (before.state === 'absent') {
      try { fs.rmSync(stateFile, { force: true }); } catch { /* ignore */ }
      return { ok: true, action: 'already-absent', taskName };
    }
    if (before.state === 'registered-unowned') {
      return { ok: false, action: 'none', reason: '任务不是本软件注册的，拒绝删除', taskName };
    }
    if (before.state === 'conflict') {
      return { ok: false, action: 'none', reason: before.reason, taskName };
    }
    try {
      await backend.remove(taskName);
      const after = await backend.query(taskName);
      if (after) throw new Error('删除后任务仍然存在');
      try { fs.rmSync(stateFile, { force: true }); } catch { /* ignore */ }
      log('autostart', 'manager task removed');
      return { ok: true, action: 'removed', taskName };
    } catch (error) {
      return { ok: false, action: 'none', reason: error.message, taskName };
    }
  }

  return { status, ensure, remove, taskName, expectedCommand };
}

module.exports = { createAutostart, realBackend, TASK_NAME, SCHEDULE, buildManagerCommand };
