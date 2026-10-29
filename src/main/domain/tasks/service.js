'use strict';

/**
 * Unified task service for install and update.
 * Existing managers still own their platform-specific steps; this service owns
 * the single-active-task rule, cancellation routing, status DTO and history.
 */
function createTaskService({ installManager, updateManager, journal = null } = {}) {
  let active = null;
  let pending = null;

  function activeState() {
    if (pending) return pending;
    if (active === 'install' && installManager?.status()) return 'install';
    if (active === 'update' && updateManager?.status()) return 'update';
    return null;
  }

  function status() {
    return {
      active: activeState(),
      install: installManager?.status() || null,
      update: updateManager?.status() || null,
      history: journal?.list?.() || []
    };
  }

  function startInstall(args) {
    if (activeState()) return { ok: false, reason: '已有安装/更新任务在进行中', task: status() };
    pending = 'install';
    try {
      const result = installManager.start(args);
      if (result.ok) active = 'install';
      return result;
    } finally {
      pending = null;
    }
  }

  function startUpdate() {
    if (activeState()) return Promise.resolve({ ok: false, reason: '已有安装/更新任务在进行中', task: status() });
    pending = 'update';
    let result;
    try { result = updateManager.downloadAndRun(); } catch (error) { pending = null; throw error; }
    if (result && typeof result.then === 'function') {
      return result.then((value) => {
        if (value?.ok) active = 'update';
        return value;
      }).finally(() => { pending = null; });
    }
    pending = null;
    if (result?.ok) active = 'update';
    return Promise.resolve(result);
  }

  async function cancel() {
    const kind = activeState();
    if (!kind || kind === 'update' && pending === 'update') return { ok: false, reason: '任务正在启动，请稍后再取消' };
    const result = kind === 'install' ? await installManager.cancel() : await updateManager.cancel?.();
    active = null;
    return result;
  }

  return { status, startInstall, startUpdate, cancel, check: () => updateManager.check() };
}

module.exports = { createTaskService };
