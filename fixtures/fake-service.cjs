'use strict';

// 隔离测试用假服务：只监听回环端口并保持存活，不接触任何真实服务。
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const label = process.argv[2] || 'fake';
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('ok');
});

server.listen(0, '127.0.0.1', () => {
  const file = path.join(os.tmpdir(), `dafiyu-fake-${label}-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid, port: server.address().port }), 'utf8');
});

setInterval(() => {}, 1000);
