'use strict';

// 启动桌面外壳。清理 ELECTRON_RUN_AS_NODE（部分环境/工具会设置它，
// 导致 electron.exe 退化成纯 Node 模式，窗口不会出现）。
const path = require('node:path');
const { spawn } = require('node:child_process');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.'], { cwd: root, env, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
