// 发送结果分类：把「明确失败」和「结果未知」分开。
//
// 背景：网关请求超时（AbortSignal.timeout）时，消息可能已经发出，只是响应没回来。
// 把超时一律当失败会让模型重发，出现重复消息；把超时当成功又会丢消息。
// 所以这里只做分类与文案，不替调用方决定重发。
export function classifySendError(error) {
  const name = String(error?.name || '');
  const message = String(error?.message ?? error ?? '');
  if (name === 'AbortError' || name === 'TimeoutError' || /aborted|timeout|timed out|ETIMEDOUT|请求超时/i.test(message)) {
    return {
      kind: 'unknown',
      retryable: false,
      message: '发送结果未知（网关未在时限内返回，可能已经发出；不要立刻重发，先确认对方是否收到）'
    };
  }
  if (/fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network/i.test(message)) {
    return {
      kind: 'unknown',
      retryable: true,
      message: '发送结果未知（网络连接中断，可能已发出）'
    };
  }
  if (/OneBot .*失败|retcode|wording|HTTP 426|HTTP 5\d\d|HTTP 4\d\d/i.test(message)) {
    return { kind: 'failed', retryable: false, message };
  }
  return { kind: 'failed', retryable: false, message };
}

export function isUnknownOutcome(outcome) {
  return outcome?.kind === 'unknown';
}
