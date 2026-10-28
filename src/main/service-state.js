'use strict';

const STATES = ['unmanaged', 'healthy', 'busy', 'unknown', 'degraded', 'stopped-by-user', 'crashed'];

/**
 * 服务状态机（纯函数）：
 * 优先级：用户停止 > 身份未知 > 忙碌/未知 > 进程退出 > 端口异常 > 健康。
 * 只用日志时间判断“忙碌”，不能用它判断“故障”。
 */
function classifyServiceState({ record, identityOk, processAlive, portOpen, busy, intent }) {
  if (intent) {
    return { state: 'stopped-by-user', reason: '用户主动停止（stop-intent 优先）' };
  }
  if (!record) {
    return { state: 'unmanaged', reason: '没有桌面启动记录，视为外部/未托管' };
  }
  // 进程不存在 = crashed（此时不可能做身份校验）；PID 仍存在但身份不符才是 unknown（防止 PID 复用误杀）。
  if (processAlive === false) {
    return { state: 'crashed', reason: '托管进程已退出' };
  }
  if (!identityOk) {
    return { state: 'unknown', reason: '进程身份校验失败（PID/启动时间/路径/命令行/父子关系不一致）' };
  }
  if (portOpen === false) {
    return { state: 'degraded', reason: '进程存在但端口未就绪' };
  }
  if (portOpen === undefined || portOpen === null) {
    return { state: 'unknown', reason: '端口状态未知，无法判断是否健康' };
  }
  if (busy === 'busy') {
    return { state: 'busy', reason: '检测到正在处理消息/工具调用/记忆写入' };
  }
  if (busy === 'unknown') {
    return { state: 'unknown', reason: 'BusyGuard 无法确认是否空闲' };
  }
  return { state: 'healthy', reason: '进程身份与端口均正常' };
}

function canAutoRecover(state) {
  return state === 'crashed';
}

module.exports = { STATES, classifyServiceState, canAutoRecover };
