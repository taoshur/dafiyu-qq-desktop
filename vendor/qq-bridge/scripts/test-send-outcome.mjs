// 回归：发送超时/网络中断归类为「结果未知」，明确失败才归 failed。
import assert from 'node:assert/strict';
import { classifySendError, isUnknownOutcome } from '../src/send-outcome.js';

let pass = 0;
let fail = 0;
function ok(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass += 1; } catch (error) {
    console.error(`  ✗ ${name}: ${error?.message ?? error}`); fail += 1;
  }
}

console.log('[结果未知]');
ok('AbortError（15s 超时）→ unknown，且不可自动重试', () => {
  const e = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'AbortError' });
  const o = classifySendError(e);
  assert.equal(o.kind, 'unknown');
  assert.equal(o.retryable, false);
  assert.match(o.message, /结果未知/);
  assert.match(o.message, /不要立刻重发/);
  assert.equal(isUnknownOutcome(o), true);
});
ok('TimeoutError → unknown', () => {
  const o = classifySendError(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
  assert.equal(o.kind, 'unknown');
});
ok('fetch failed / ECONNRESET → unknown（网络中断）', () => {
  assert.equal(classifySendError(new Error('fetch failed')).kind, 'unknown');
  assert.equal(classifySendError(new Error('read ECONNRESET')).kind, 'unknown');
});

console.log('[明确失败]');
ok('OneBot retcode 100 → failed', () => assert.equal(classifySendError(new Error('OneBot send_custom_face 失败: retcode 100')).kind, 'failed'));
ok('HTTP 426 → failed（配置问题，不是超时）', () => assert.equal(classifySendError(new Error('OneBot send_group_msg 失败: HTTP 426')).kind, 'failed'));
ok('普通业务错误 → failed', () => assert.equal(classifySendError(new Error('找不到表情 x，请先用 qq_list_stickers 获取有效 id')).kind, 'failed'));
ok('failed 文案沿用原始错误（便于定位）', () => assert.match(classifySendError(new Error('找不到表情 x')).message, /找不到表情/));

console.log(`\n${fail ? '❌' : '✅'} test-send-outcome：${pass} 项通过，${fail} 项失败`);
if (fail) process.exitCode = 1;
