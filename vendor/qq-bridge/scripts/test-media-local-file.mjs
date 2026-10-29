// 回归：本地图片文件分支的诊断（不存在 / 权限 / 空 / 超限 / 无效字节 / 正常）
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readLocalImageFile, classifyLocalImageFile, formatMediaFailure } from '../src/media-probe.js';

let pass = 0;
let fail = 0;
function ok(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass += 1; } catch (error) {
    console.error(`  ✗ ${name}: ${error?.message ?? error}`); fail += 1;
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-img-'));
const pngPath = path.join(dir, 'ok.png');
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
fs.writeFileSync(pngPath, png);
const emptyPath = path.join(dir, 'empty.png');
fs.writeFileSync(emptyPath, Buffer.alloc(0));
const htmlPath = path.join(dir, 'fake.png');
fs.writeFileSync(htmlPath, Buffer.from('<!DOCTYPE html><html>404</html>'));
const jpegPath = path.join(dir, 'ok.jpg');
fs.writeFileSync(jpegPath, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(24, 2)]));

console.log('[正常读取]');
ok('有效 PNG 文件可读取并通过校验', () => {
  const f = readLocalImageFile(pngPath);
  assert.equal(f.exists, true);
  assert.equal(f.readError, null);
  assert.equal(f.size, png.length);
  const v = classifyLocalImageFile(f);
  assert.equal(v.ok, true);
  assert.equal(v.kind, 'png');
});
ok('有效 JPEG 文件可通过', () => {
  const v = classifyLocalImageFile(readLocalImageFile(jpegPath));
  assert.equal(v.ok, true);
  assert.equal(v.kind, 'jpeg');
});

console.log('[失败分类]');
ok('文件不存在 → 文件不存在', () => {
  const f = readLocalImageFile(path.join(dir, 'nope.png'));
  assert.equal(f.exists, false);
  const v = classifyLocalImageFile(f);
  assert.equal(v.ok, false);
  assert.equal(v.reason, '文件不存在');
});
ok('空文件 → 空文件', () => {
  const f = readLocalImageFile(emptyPath);
  assert.equal(f.size, 0);
  assert.equal(classifyLocalImageFile(f).reason, '空文件');
});
ok('HTML 冒充 .png → 无效字节（扩展名不算数）', () => {
  const f = readLocalImageFile(htmlPath);
  const v = classifyLocalImageFile(f);
  assert.equal(v.ok, false);
  assert.match(v.reason, /无效图片字节/);
  assert.match(v.reason, /HTML/);
});
ok('权限不足（EACCES）→ 权限不足', () => {
  const fakeFs = { statSync: () => ({ size: 128 }), readFileSync: () => { const e = new Error('denied'); e.code = 'EACCES'; throw e; } };
  const f = readLocalImageFile('C:/x/a.png', { fsImpl: fakeFs });
  const v = classifyLocalImageFile(f);
  assert.equal(v.ok, false);
  assert.equal(v.reason, '权限不足');
});
ok('其他读取异常保留错误码', () => {
  const fakeFs = { statSync: () => ({ size: 128 }), readFileSync: () => { const e = new Error('io'); e.code = 'EIO'; throw e; } };
  const v = classifyLocalImageFile(readLocalImageFile('C:/x/a.png', { fsImpl: fakeFs }));
  assert.match(v.reason, /读取失败（EIO）/);
});
ok('超限文件不读进内存就判失败', () => {
  const f = readLocalImageFile(pngPath, { maxBytes: 4 });
  assert.equal(f.buffer, null);
  const v = classifyLocalImageFile({ ...f, maxBytes: 4 });
  assert.match(v.reason, /文件超限/);
});
ok('诊断行包含阶段=local-file 与原因', () => {
  const line = formatMediaFailure({ stage: 'local-file', source: 'get_image-file', url: 'C:/x/fake.png', bytes: 30, error: '无效图片字节：HTML/XML（伪装成图片）' });
  assert.match(line, /阶段=local-file/);
  assert.match(line, /来源=get_image-file/);
  assert.match(line, /原因=无效图片字节/);
});

console.log(`\n${fail ? '❌' : '✅'} test-media-local-file：${pass} 项通过，${fail} 项失败`);
if (fail) process.exitCode = 1;
