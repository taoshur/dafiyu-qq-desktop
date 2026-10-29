'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { status, ack } = require('../src/main/bilibili');
const { createPaths } = require('../src/main/paths');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-bili-'));
  const repo = path.join(root, 'qq-bridge');
  const mcp = path.join(repo, 'tools', 'bilibili-mcp');
  fs.mkdirSync(path.join(repo, 'state'), { recursive: true });
  fs.mkdirSync(mcp, { recursive: true });
  fs.writeFileSync(path.join(mcp, 'mcp_server.py'), '');
  fs.writeFileSync(path.join(mcp, 'bili_credential.json'), JSON.stringify({
    sessdata: 'SUPER-SECRET-SESSDATA',
    bili_jct: 'SUPER-SECRET-JCT',
    buvid3: 'SUPER-SECRET-BUVID',
    dedeuserid: '123456789'
  }));
  fs.writeFileSync(path.join(repo, 'state', 'bili-watch.jsonl'), [
    JSON.stringify({ at: 1000, bvid: 'BV1xx', title: '旧视频', kind: 'info', author: 'UP' }),
    JSON.stringify({ at: 2000, bvid: 'BV1xx', title: '新视频', kind: 'subtitle', segments: 2, chars: 10 })
  ].join('\n') + '\n');
  const paths = createPaths(path.join(root, 'userData'));
  return { root, repo, paths };
}

test('B站活动只读台账、登录状态和未读计数', () => {
  const f = fixture();
  const result = status({ settings: { repoRoot: f.repo }, paths: f.paths });
  assert.equal(result.counts.total, 2);
  assert.equal(result.counts.videos, 1);
  assert.equal(result.counts.unread, 2);
  assert.equal(result.entries[0].title, '新视频');
  assert.equal(result.credential.loggedIn, true);
  assert.equal(result.mcp.serverExists, true);
  const text = JSON.stringify(result);
  assert.ok(!text.includes('SUPER-SECRET'), '不能把 cookie 原值返回给界面');
});

test('标记已读后未读数清零，且不删除台账', () => {
  const f = fixture();
  const result = status({ settings: { repoRoot: f.repo }, paths: f.paths });
  ack({ paths: f.paths, at: result.lastAt });
  const after = status({ settings: { repoRoot: f.repo }, paths: f.paths });
  assert.equal(after.counts.unread, 0);
  assert.equal(after.counts.total, 2);
});
