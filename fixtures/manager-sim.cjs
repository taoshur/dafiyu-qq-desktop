'use strict';

// 模拟“管理器启动服务后进程退出”：服务应继续运行，状态记录保留给下一次管理器接管。
const fs = require('node:fs');
const path = require('node:path');
const { createController } = require('../src/main/control');

const [stateDir, repoRoot, fixture, markerFile] = process.argv.slice(2);
const settings = {
  repoRoot,
  snowlumaRoot: path.dirname(repoRoot),
  dshExe: process.execPath,
  controlEnabled: true
};
const def = {
  id: 'fake',
  exe: process.execPath,
  args: [fixture, 'manager'],
  cwd: path.dirname(fixture),
  signature: 'fake-service.cjs',
  ports: [],
  waitMs: 9000
};
const controller = createController({
  stateDir,
  getSettings: () => settings,
  extraDefinitions: { fake: def },
  backupRoots: [],
  stopTimeoutMs: 1200,
  log: () => {}
});

controller.start('fake').then((result) => {
  fs.writeFileSync(markerFile, JSON.stringify(result), 'utf8');
  process.exit(result.ok ? 0 : 1);
});
