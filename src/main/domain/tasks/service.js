'use strict';

/**
 * Unified task service for install and update.
 * Existing managers still own their platform-specific steps; this service owns
 * the single-active-task rule, cancellation routing, status DTO and history.
 */
function createTaskService({ installManager, updateManager, journal = null } = {}) {
  let active = null;

  function activeState() {
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
    const result = installManager.start(args);
    if (result.ok) active = 'install';
    return result;
  }

  function startUpdate() {
    if (activeState()) return { ok: false, reason: '已有安装/更新任务在进行中', task: status() };
    const result = updateManager.downloadAndRun();
    if (result && typeof result.then === 'function') {
      return result.then((value) => {
        if (value?.ok) active = 'update';
        return value;
      });
    }
    if (result?.ok) active = 'update';
    return result;
  }

  async function cancel() {
    const kind = activeState();
    if (!kind) return { ok: false, reason: '没有可取消的任务' };
    const result = kind === 'install' ? await installManager.cancel() : await updateManager.cancel?.();
    active = null;
    return result;
  }

  return { status, startInstall, startUpdate, cancel, check: () => updateManager.check() };
}

module.exports = { createTaskService };
