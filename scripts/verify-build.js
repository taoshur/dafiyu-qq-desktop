'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const checks = [
  ['installer', path.join(root, 'dist', 'Dafiyu-Control-Center-Setup.exe')],
  ['unpacked app', path.join(root, 'dist', 'win-unpacked', 'Dafiyu Control Center.exe')],
  ['bundled qq-bridge', path.join(root, 'dist', 'win-unpacked', 'resources', 'qq-bridge', 'package.json')],
  ['Memory V4 recall', path.join(root, 'dist', 'win-unpacked', 'resources', 'qq-bridge', 'src', 'memory', 'recall-v4.js')],
  ['Bilibili MCP', path.join(root, 'dist', 'win-unpacked', 'resources', 'qq-bridge', 'tools', 'bilibili-mcp', 'mcp_server.py')],
  ['license', path.join(root, 'LICENSE')],
  ['third party notices', path.join(root, 'THIRD_PARTY_NOTICES.md')]
];

const missing = checks.filter(([, file]) => !fs.existsSync(file)).map(([name, file]) => `${name}: ${file}`);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!pkg.build?.extraResources?.some((item) => item.to === 'qq-bridge')) missing.push('package.json: qq-bridge extraResources missing');
const secrets = [];
for (const file of ['package.json', 'README.md', 'LICENSE']) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  if (/SUPER-SECRET|BEGIN PRIVATE KEY|password\s*[:=]\s*\S+/i.test(text)) secrets.push(file);
}
if (secrets.length) missing.push(`secret-like content: ${secrets.join(', ')}`);

if (missing.length) {
  console.error('[verify-build] FAIL');
  for (const item of missing) console.error(` - ${item}`);
  process.exit(1);
}
console.log(`[verify-build] OK version=${pkg.version} checks=${checks.length}`);
