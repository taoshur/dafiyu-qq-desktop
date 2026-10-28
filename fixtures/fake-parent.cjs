'use strict';

// 隔离测试：父进程故意拉起一个「无归属特征」的子进程，用来验证整树校验会拒绝停止。
const { spawn } = require('node:child_process');

spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
setInterval(() => {}, 1000);
