'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { compareVersion, normalizeRelease, isAllowedDownloadHost } = require('../src/main/updates');

test('版本比较只接受更新版本', () => {
  assert.equal(compareVersion('0.4.0', '0.4.0'), 0);
  assert.equal(compareVersion('0.4.0', '0.4.1'), -1);
  assert.equal(compareVersion('0.5.0', '0.4.9'), 1);
  assert.equal(compareVersion('v0.4.0', '0.4.0'), 0);
});

test('Release 归一化选择 Setup 并保留摘要', () => {
  const result = normalizeRelease({
    tag_name: 'v0.5.0',
    html_url: 'https://github.com/taoshur/dafiyu-qq-desktop/releases/tag/v0.5.0',
    body: 'notes',
    assets: [
      { name: 'other.zip', state: 'uploaded', browser_download_url: 'https://github.com/x' },
      {
        name: 'Dafiyu-Control-Center-Setup.exe',
        state: 'uploaded',
        browser_download_url: 'https://github.com/taoshur/dafiyu-qq-desktop/releases/download/v0.5.0/Dafiyu-Control-Center-Setup.exe',
        size: 100,
        digest: 'sha256:abc'
      }
    ]
  }, '0.4.0');
  assert.equal(result.available, true);
  assert.equal(result.latestVersion, '0.5.0');
  assert.equal(result.asset.name, 'Dafiyu-Control-Center-Setup.exe');
  assert.equal(result.asset.digest, 'sha256:abc');
});

test('更新下载只允许 GitHub 官方域名', () => {
  assert.equal(isAllowedDownloadHost('https://github.com/taoshur/x/releases/download/v1/a.exe'), true);
  assert.equal(isAllowedDownloadHost('https://release-assets.githubusercontent.com/x'), true);
  assert.equal(isAllowedDownloadHost('http://github.com/a'), false);
  assert.equal(isAllowedDownloadHost('https://evil.example.com/a'), false);
});
