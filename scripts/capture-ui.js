'use strict';

// 截取界面用于验收：启动 Electron，加载完成后 capturePage 写 PNG，然后退出。
// 用法：node scripts/capture-ui.js [输出路径] [页面 id]
// 只在开发期使用；不接触任何真实服务。
const path = require('node:path');
const { spawn } = require('node:child_process');
const electron = require('electron');

const root = path.resolve(__dirname, '..');
const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'artifacts', 'ui-overview.png');
const page = process.argv[3] || '';

const env = { ...process.env, DAFIYU_CAPTURE: out };
delete env.ELECTRON_RUN_AS_NODE;
if (page) env.DAFIYU_PAGE = page;
else delete env.DAFIYU_PAGE;

const child = spawn(electron, ['.'], { cwd: root, env, stdio: 'inherit' });

child.on('exit', (code) => {
  console.log(`[capture] electron exited code=${code}, output=${out} page=${page || 'overview'}`);
  process.exit(code ?? 0);
});
