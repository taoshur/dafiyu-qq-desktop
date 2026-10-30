'use strict';

const { status: memoryStatus, list: listMemory, candidate: getCandidate, initTestDb, review: reviewCandidate } = require('../../domain/memory/repository');
const { listDeadLetters, retryDeadLetter } = require('../../memory');
const { unlockProductionReview, reviewProductionCandidate, listAudit } = require('../../memory-review');
const { memoryDbPath } = require('../../memory');
const { previewMaiBotImport, importMaiBot } = require('../../maibot-import');
const path = require('node:path');

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
      offset: Number(payload?.offset) || 0,
      sort: ['newest', 'oldest', 'confidence', 'happened'].includes(payload?.sort) ? payload.sort : 'newest'
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

  router.handle('memory:dead-letters', async (_event, payload) => {
    const settings = getSettings();
    return listDeadLetters({ settings, paths, mode: memoryMode(payload) });
  });

  router.handle('memory:retry-dead', async (_event, payload) => {
    const settings = getSettings();
    const result = retryDeadLetter({ settings, paths, mode: memoryMode(payload), batchKey: payload?.batchKey, confirm: payload?.confirm === true });
    log('memory', `dead-letter retry ${result.batchKey} messages=${result.messages}`);
    return result;
  });

  router.handle('memory:review-unlock', async (_event, payload) => {
    const result = unlockProductionReview({ confirmText: payload?.confirmText });
    log('memory', `production review unlocked actor=${result.actor} expires=${result.expiresAt}`);
    return result;
  });

  router.handle('memory:review-audit', async (_event, payload) => {
    return listAudit({ settings: getSettings(), paths, candidateId: payload?.candidateId || null, limit: 50 });
  });

  router.handle('memory:maibot-pick', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog({
      title: '选择 MaiBot 记忆数据库',
      properties: ['openFile'],
      filters: [
        { name: 'SQLite 数据库', extensions: ['db', 'sqlite', 'sqlite3'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths?.[0]) return { ok: false, cancelled: true };
    return { ok: true, path: path.resolve(result.filePaths[0]) };
  });

  router.handle('memory:maibot-preview', async (_event, payload) => {
    return previewMaiBotImport({ sourcePath: String(payload?.sourcePath || '') });
  });

  router.handle('memory:maibot-import', async (_event, payload) => {
    const settings = getSettings();
    const targetPath = memoryMode(payload) === 'test' ? paths.memoryTestDb : memoryDbPath(settings);
    const result = importMaiBot({
      sourcePath: String(payload?.sourcePath || ''),
      targetPath,
      limit: 10000,
      backupDir: paths.stateDir
    });
    log('memory', `maibot import imported=${result.imported} duplicates=${result.duplicates} skipped=${result.skipped} table=${result.table}`);
    return result;
  });

  router.handle('memory:review', async (_event, payload) => {
    if (memoryMode(payload) === 'prod') {
      const result = await reviewProductionCandidate({
        settings: getSettings(), paths,
        id: Number(payload?.id) || 0,
        action: String(payload?.action || ''),
        edit: payload?.edit || null,
        reason: String(payload?.reason || '').slice(0, 300),
        requestId: payload?.requestId || null,
        traceId: payload?.traceId || null,
        token: payload?.token || ''
      });
      log('memory', `production review ${payload?.action} candidate=${Number(payload?.id) || 0} trace=${result.traceId}`);
      return result;
    }
    if (memoryMode(payload) !== 'test') throw new Error('未知记忆模式');
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
