'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { classifyServiceState, canAutoRecover } = require('./service-state');
const { decideRecovery } = require('./recovery-policy');
const { createLease } = require('./recovery-lease');
const { canManagerRecover, ownerOf } = require('./recovery-ownership');

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 恢复引擎：
 * - 只处理“有启动记录且身份校验通过”的 crashed 服务；
 * - 用户停止意图最高优先级；
 * - BusyGuard 非 idle 时禁止自动恢复；
 * - 租约保证跨进程唯一恢复者；
 * - 退避/限速/熔断由 recovery-policy 决定；
 * - 每次尝试写入 recovery-history.jsonl（原因、结果、耗时、次数）。
 */
function createRecoveryEngine({
  stateDir,
  getSettings,
  getRecords,
  getIntent,
  probe,
  assessBusyFn,
  startService,
  stopService,
  lease = null,
  now = () => Date.now(),
  log = () => {},
  notify = () => {}
} = {}) {
  const stateFile = path.join(stateDir, 'recovery-state.json');
  const historyFile = path.join(stateDir, 'recovery-history.jsonl');
  const running = { active: false };

  const loadState = () => {
    let raw = null;
    try {
      raw = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch (error) {
      if (fs.existsSync(stateFile)) {
        try { fs.renameSync(stateFile, `${stateFile}.corrupt-${now()}`); } catch { /* ignore */ }
        log('recovery', `state file corrupt, moved aside: ${error.message}`);
      }
      raw = {};
    }
    const services = {};
    if (raw && typeof raw.services === 'object' && raw.services) {
      for (const [id, value] of Object.entries(raw.services)) {
        if (!value || typeof value !== 'object') continue;
        const attempts = Array.isArray(value.attempts)
          ? value.attempts.map(Number).filter((at) => Number.isFinite(at) && at > now() - 86400_000).slice(-200)
          : [];
        const failures = Number.isFinite(Number(value.failures)) ? Math.max(0, Math.min(1000, Number(value.failures))) : 0;
        const total = Number.isFinite(Number(value.total)) ? Math.max(0, Number(value.total)) : 0;
        services[id] = {
          attempts,
          failures,
          total,
          lastResult: typeof value.lastResult === 'string' ? value.lastResult : undefined,
          lastDurationMs: Number.isFinite(Number(value.lastDurationMs)) ? Number(value.lastDurationMs) : undefined,
          lastAt: Number.isFinite(Number(value.lastAt)) ? Number(value.lastAt) : undefined
        };
      }
    }
    return { services };
  };
  const saveState = (state) => {
    try {
      writeJson(stateFile, state);
      return true;
    } catch (error) {
      log('recovery', `state save failed: ${error.message}`);
      return false;
    }
  };

  const appendHistory = (entry) => {
    try {
      fs.mkdirSync(path.dirname(historyFile), { recursive: true });
      fs.appendFileSync(historyFile, JSON.stringify(entry) + '\n', 'utf8');
      const stat = fs.statSync(historyFile);
      if (stat.size > 1024 * 1024) {
        const lines = fs.readFileSync(historyFile, 'utf8').trim().split(/\r?\n/).filter(Boolean);
        fs.writeFileSync(historyFile, lines.slice(-1000).join('\n') + '\n', 'utf8');
      }
    } catch (error) {
      log('recovery', `history write failed: ${error.message}`);
    }
  };

  const defaultLease = lease || createLease({
    file: path.join(stateDir, 'recovery-lease.json'),
    ownerId: `engine-${process.pid}-${now()}`,
    ttlMs: 30000
  });

  async function runOnce() {
    if (running.active) return { skipped: 'already-running' };
    const settings = getSettings();
    if (!settings.autoRecovery) return { skipped: 'auto-recovery-disabled' };
    if (!settings.controlEnabled) return { skipped: 'control-disabled' };
    if (settings.safeMode) return { skipped: 'safe-mode' };

    running.active = true;
    const summary = { at: now(), checked: 0, recovered: [], skipped: [], failed: [], lease: null };
    try {
      const leaseResult = defaultLease.acquire();
      summary.lease = leaseResult.reason;
      if (!leaseResult.acquired) {
        log('recovery', `lease held by ${leaseResult.holder?.ownerId || 'unknown'}`);
        return summary;
      }
      defaultLease.heartbeat();

      const records = getRecords() || {};
      for (const [id, record] of Object.entries(records)) {
        summary.checked += 1;
        const intent = getIntent ? getIntent(id) : null;
        if (intent) { summary.skipped.push({ id, state: 'stopped-by-user', reason: 'stop-intent' }); continue; }
        if (!canManagerRecover(id)) {
          summary.skipped.push({ id, state: 'not-owned-by-manager', reason: `恢复控制权归 ${ownerOf(id)}` });
          continue;
        }

        const health = await probe(id, record);
        const busy = assessBusyFn ? await assessBusyFn(id) : { state: 'idle' };
        const classified = classifyServiceState({
          record,
          identityOk: health.identityOk,
          processAlive: health.processAlive,
          portOpen: health.portOpen,
          busy: busy.state,
          intent
        });

        if (!canAutoRecover(classified.state)) {
          summary.skipped.push({ id, state: classified.state, reason: classified.reason });
          continue;
        }
        if (busy.state !== 'idle') {
          summary.skipped.push({ id, state: 'busy-guard', reason: `BusyGuard=${busy.state}：不执行可能中断任务的自动操作` });
          continue;
        }

        const state = loadState();
        const entry = state.services[id] || { attempts: [], failures: 0, total: 0 };
        const decision = decideRecovery({
          enabled: true,
          stopIntent: null,
          attempts: entry.attempts,
          consecutiveFailures: entry.failures,
          now: now()
        });
        if (decision.action !== 'restart') {
          summary.skipped.push({ id, state: 'circuit', reason: decision.reason });
          continue;
        }

        // 启动前再确认一次：并发看门狗/其他恢复者可能已经拉起服务或用户已要求停止。
        const recheck = await probe(id, record);
        if (!(recheck.processAlive === false && recheck.portOpen === false)) {
          summary.skipped.push({ id, state: 'already-recovered', reason: '启动前复检发现服务已恢复' });
          continue;
        }
        if (getIntent && getIntent(id)) {
          summary.skipped.push({ id, state: 'stopped-by-user', reason: '启动前发现用户停止意图' });
          continue;
        }

        const startedAt = now();
        let result;
        try {
          result = await startService(id);
        } catch (error) {
          result = { ok: false, reason: error.message };
        }
        const durationMs = now() - startedAt;

        let healthy = false;
        if (result && result.ok) {
          const newRecord = result.record || record;
          for (let i = 0; i < 10; i += 1) {
            const after = await probe(id, newRecord);
            if (after.identityOk && after.processAlive && after.portOpen !== false) { healthy = true; break; }
            await sleep(500);
          }
        }

        const lateIntent = getIntent ? getIntent(id) : null;
        if (lateIntent) {
          if (result && result.ok) {
            try { await stopService(id, { force: true, confirmBusy: true }); } catch { /* ignore */ }
          }
          summary.failed.push({ id, reason: 'recovery aborted: user stop intent appeared', durationMs });
          entry.attempts.push(now());
          entry.failures += 1;
          entry.lastResult = 'aborted-by-user';
          entry.lastDurationMs = durationMs;
          state.services[id] = entry;
          saveState(state);
          appendHistory({ at: now(), service: id, trigger: 'crashed', result: 'aborted-by-user', durationMs, attempts: entry.attempts.length, failures: entry.failures, reason: 'user stop during recovery' });
          continue;
        }

        if (healthy) {
          entry.attempts.push(now());
          entry.failures = 0;
          entry.total += 1;
          entry.lastResult = 'recovered';
          entry.lastDurationMs = durationMs;
          entry.lastAt = now();
          state.services[id] = entry;
          saveState(state);
          summary.recovered.push({ id, durationMs, total: entry.total });
          log('recovery', `${id} recovered in ${durationMs}ms (total ${entry.total})`);
          appendHistory({ at: now(), service: id, trigger: 'crashed', result: 'recovered', durationMs, attempts: entry.attempts.length, failures: entry.failures, total: entry.total });
        } else {
          entry.attempts.push(now());
          entry.failures += 1;
          entry.lastResult = 'failed';
          entry.lastDurationMs = durationMs;
          state.services[id] = entry;
          saveState(state);
          summary.failed.push({ id, reason: result?.reason || 'health check failed after restart', durationMs });
          log('recovery', `${id} recovery failed: ${result?.reason || 'health check'}`);
          appendHistory({ at: now(), service: id, trigger: 'crashed', result: 'failed', durationMs, attempts: entry.attempts.length, failures: entry.failures, reason: result?.reason || 'health check failed' });
        }

        if (notify) notify({ id, healthy, durationMs });
      }

      defaultLease.release();
      return summary;
    } finally {
      running.active = false;
    }
  }

  async function classifyAll() {
    const out = [];
    const records = getRecords() || {};
    for (const [id, record] of Object.entries(records)) {
      const intent = getIntent ? getIntent(id) : null;
      const health = await probe(id, record);
      const busy = assessBusyFn ? await assessBusyFn(id) : { state: 'idle' };
      const classified = classifyServiceState({
        record,
        identityOk: health.identityOk,
        processAlive: health.processAlive,
        portOpen: health.portOpen,
        busy: busy.state,
        intent
      });
      out.push({ id, owner: ownerOf(id), state: classified.state, reason: classified.reason });
    }
    return out;
  }

  return {
    runOnce,
    classifyAll,
    state: () => loadState(),
    history: (limit = 20) => {
      try {
        return fs.readFileSync(historyFile, 'utf8').trim().split(/\r?\n/).filter(Boolean).slice(-limit).map((line) => JSON.parse(line));
      } catch { return []; }
    }
  };
}

module.exports = { createRecoveryEngine };
