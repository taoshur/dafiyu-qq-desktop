'use strict';

const { status: memoryStatus, list: listMemory, candidate: getCandidate, initTestDb, review: reviewCandidate } = require('../../domain/memory/repository');

function memoryMode(payload) {
  return payload?.mode === 'test' ? 'test' : 'prod';
}

function registerMemoryHandlers(router, { paths, getSettings, log }) {
  router.handle('memory:status', async (_event, payload) => {
    const settings = getSettings();
    return memoryStatus({ settings, paths, mode: memoryMode(payload) });
  });

  router.handle('memory:list', async (_event, payload) => {
    const settings = getSettings();
    const type = ['facts', 'events', 'candidates'].includes(payload?.type) ? payload.type : 'candidates';
    const status = ['pending', 'applied', 'rejected'].includes(payload?.status) ? payload.status : 'pending';
    return listMemory({
      settings, paths, mode: memoryMode(payload), type,
      q: String(payload?.q || '').slice(0, 100),
      dateFrom: String(payload?.dateFrom || '').slice(0, 10),
      dateTo: String(payload?.dateTo || '').slice(0, 10),
      subject: String(payload?.subject || '').slice(0, 60),
      status,
      limit: Number(payload?.limit) || 50,
      offset: Number(payload?.offset) || 0
    });
  });

  router.handle('memory:candidate', async (_event, payload) => {
    const settings = getSettings();
    return getCandidate({ settings, paths, mode: memoryMode(payload), id: Number(payload?.id) || 0 });
  });

  router.handle('memory:test-init', async (_event, payload) => {
    if (payload?.confirm !== true) throw new Error('初始化隔离测试库需要确认');
    const result = await initTestDb({ settings: getSettings(), paths, reset: payload?.reset === true });
    log('memory', `test db init created=${result.created}`);
    return result;
  });

  router.handle('memory:review', async (_event, payload) => {
    if (memoryMode(payload) !== 'test') throw new Error('生产库只读：审核只能在隔离测试库进行');
    const action = payload?.action === 'reject' ? 'reject' : 'apply';
    const result = await reviewCandidate({
      settings: getSettings(), paths,
      id: Number(payload?.id) || 0,
      action,
      reason: String(payload?.reason || '').slice(0, 200)
    });
    log('memory', `test review ${action} candidate=${Number(payload?.id) || 0} -> ${result.status || result.action || 'ok'}`);
    return result;
  });
}

module.exports = { registerMemoryHandlers, memoryMode };
