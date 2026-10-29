'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createBackup, verifyBackup, listBackups, restoreDrill } = require('../../backup');

function backupRoots(settings) {
  return [path.join(settings.repoRoot, 'backups'), 'D:\\qq-bridge-backups'];
}

function assertBackupDir(settings, dir) {
  const target = path.resolve(String(dir || ''));
  const roots = backupRoots(settings).map((root) => path.resolve(root) + path.sep);
  if (!roots.some((root) => (target + path.sep).startsWith(root))) throw new Error('只能校验备份目录内的路径');
  if (!fs.existsSync(target)) throw new Error('备份目录不存在');
  return target;
}

function registerBackupHandlers(router, { paths, getSettings, log }) {
  let backupRunning = false;

  router.handle('backups:list', async () => listBackups(getSettings().repoRoot, ['D:\\qq-bridge-backups']).slice(0, 50));

  router.handle('backups:create', async () => {
    if (backupRunning) throw new Error('已有备份任务在进行中');
    backupRunning = true;
    const settings = getSettings();
    try {
      log('backup', `start ${settings.repoRoot}`);
      const result = createBackup({
        repoRoot: settings.repoRoot,
        backupRoot: path.join(settings.repoRoot, 'backups'),
        appVersion: require('../../../../package.json').version
      });
      log('backup', `done ${path.basename(result.dir)} files=${result.files} ok=${result.verify.ok}`);
      return result;
    } finally {
      backupRunning = false;
    }
  });

  router.handle('backups:verify', async (_event, payload) => {
    const settings = getSettings();
    const dir = assertBackupDir(settings, payload?.dir);
    const result = verifyBackup(dir);
    log('backup', `verify ${path.basename(dir)} ok=${result.ok}`);
    return result;
  });

  router.handle('backups:restore-drill', async (_event, payload) => {
    const settings = getSettings();
    const dir = assertBackupDir(settings, payload?.dir);
    const target = path.join(paths.stateDir, 'restore-drill.db');
    const result = restoreDrill({ backupDir: dir, targetFile: target });
    log('backup', `restore drill ${path.basename(dir)} integrity=${result.integrity}`);
    return result;
  });
}

module.exports = { registerBackupHandlers };
