'use strict';

// 隔离模拟服务：监听指定回环端口并把 PID 写入锁文件。
const fs = require('node:fs');
const http = require('node:http');

const port = Number(process.argv[2]);
const lockFile = process.argv[3];
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('ok');
});

server.listen(port, '127.0.0.1', () => {
  if (lockFile) {
    fs.mkdirSync(require('node:path').dirname(lockFile), { recursive: true });
    fs.writeFileSync(lockFile, String(process.pid), 'utf8');
  }
});

setInterval(() => {}, 1000);
