// 回归：图片诊断（分类、脱敏、失败阶段、404/超时/空响应/HTML 伪装）
import assert from 'node:assert/strict';
import { classifyImageBuffer, sanitizeMediaUrl, formatMediaFailure, describeFetchError } from '../src/media-probe.js';

let pass = 0;
let fail = 0;
function ok(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass += 1; } catch (error) {
    console.error(`  ✗ ${name}: ${error?.message ?? error}`); fail += 1;
  }
}

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const gif = Buffer.from('GIF89a......', 'utf8');
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(4)]);
const html = Buffer.from('<!DOCTYPE html><html><body>404</body></html>');
const json = Buffer.from('{"error":"not found"}');

console.log('[字节分类]');
ok('PNG 识别为图片', () => assert.deepEqual(classifyImageBuffer(png), { ok: true, kind: 'png', label: 'PNG' }));
ok('JPEG 识别为图片', () => assert.equal(classifyImageBuffer(jpeg).kind, 'jpeg'));
ok('GIF 识别为图片', () => assert.equal(classifyImageBuffer(gif).kind, 'gif'));
ok('WebP 识别为图片', () => assert.equal(classifyImageBuffer(webp).kind, 'webp'));
ok('HTML 伪装图片被拒绝', () => { const r = classifyImageBuffer(html); assert.equal(r.ok, false); assert.equal(r.kind, 'html'); });
ok('JSON 错误响应被拒绝', () => { const r = classifyImageBuffer(json); assert.equal(r.ok, false); assert.equal(r.kind, 'json'); });
ok('空响应被拒绝', () => { const r = classifyImageBuffer(Buffer.alloc(0)); assert.equal(r.ok, false); assert.equal(r.kind, 'empty'); });
ok('随机字节被拒绝', () => { const r = classifyImageBuffer(Buffer.from([0x00, 0x01, 0x02, 0x03])); assert.equal(r.ok, false); assert.equal(r.kind, 'unknown'); });

console.log('[脱敏]');
ok('去掉 query（含签名/凭证）只留 host+path', () => {
  const s = sanitizeMediaUrl('https://p.qpic.cn/qq_expression/123/abc?token=SECRET&sig=XYZ');
  assert.equal(s, 'https://p.qpic.cn/qq_expression/123/abc');
  assert.ok(!s.includes('SECRET'));
});
ok('去掉 userinfo', () => {
  const s = sanitizeMediaUrl('https://user:pass@example.com/a/b?x=1');
  assert.ok(!s.includes('user') && !s.includes('pass'));
  assert.ok(s.includes('example.com/a/b'));
});
ok('超长路径被截断', () => {
  const s = sanitizeMediaUrl(`https://e.com/${'a'.repeat(300)}`);
  assert.ok(s.length < 170, `长度 ${s.length}`);
  assert.ok(s.endsWith('…'));
});
ok('非法 URL 也不会抛异常', () => assert.equal(typeof sanitizeMediaUrl('not a url?t=1'), 'string'));

console.log('[失败诊断]');
ok('404 诊断含阶段/状态/类型/耗时/字节', () => {
  const line = formatMediaFailure({ stage: 'url#2', source: 'emoji-cdn', url: 'https://gxh.vip.qq.com/club/x/raw300.gif?k=1', status: 404, contentType: 'text/plain; charset=utf-8', bytes: 0, ms: 7091 });
  assert.match(line, /阶段=url#2/);
  assert.match(line, /来源=emoji-cdn/);
  assert.match(line, /状态=404/);
  assert.match(line, /类型=text\/plain/);
  assert.match(line, /字节=0/);
  assert.match(line, /耗时=7091ms/);
  assert.ok(!line.includes('?k=1'), '不应记录 query');
});
ok('超时诊断含原因', () => {
  const line = describeFetchError(Object.assign(new Error('请求超时：gxh.vip.qq.com'), {}), { stage: 'url#2', source: 'emoji-cdn', url: 'https://gxh.vip.qq.com/a', ms: 6000 });
  assert.match(line, /耗时=6000ms/);
  assert.match(line, /原因=请求超时/);
});
ok('空响应诊断', () => {
  const line = formatMediaFailure({ stage: 'url#1', status: 200, contentType: 'image/jpeg', bytes: 0, error: '空响应' });
  assert.match(line, /字节=0/);
  assert.match(line, /原因=空响应/);
});
ok('safeFetchBuffer 抛出的错误能被还原成状态码/类型', () => {
  const error = Object.assign(new Error('图片抓取失败：HTTP 404'), { statusCode: 404, contentType: 'text/plain', bytes: 0 });
  const line = describeFetchError(error, { stage: 'url#2', source: 'emoji-cdn', url: 'https://x/y', ms: 1234 });
  assert.match(line, /状态=404/);
  assert.match(line, /类型=text\/plain/);
  assert.match(line, /原因=图片抓取失败/);
});
ok('成功路径的字节分类仍为图片（防止误判）', () => assert.equal(classifyImageBuffer(jpeg).ok, true));

console.log(`\n${fail ? '❌' : '✅'} test-media-diagnostics：${pass} 项通过，${fail} 项失败`);
if (fail) process.exitCode = 1;
