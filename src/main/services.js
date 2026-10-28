'use strict';

const path = require('node:path');

/**
 * 服务定义（第二阶段只用于展示与模拟，不执行任何 spawn）。
 * 真实启动命令来自第一阶段验证：
 *  - SnowLuma: C:\path\to\SnowLuma\node.exe index.mjs，cwd C:\path\to\SnowLuma
 *  - qq-bridge: node scripts/start-bridge.mjs（supervisor 再拉起 relay + bridge）
 *  - DSH: DeepSeek Harness.exe（默认只检测，可选启动）
 */
function definitions(settings) {
  return {
    snowluma: {
      id: 'snowluma',
      name: 'SnowLuma',
      role: 'QQ 网关',
      order: 1,
      start: {
        exe: path.join(settings.snowlumaRoot, 'node.exe'),
        args: ['index.mjs'],
        cwd: settings.snowlumaRoot
      },
      ports: [3000, 3001],
      logSources: ['snowluma'],
      notes: 'OneBot v11 HTTP/WS；启动后监听 3000/3001。'
    },
    dsh: {
      id: 'dsh',
      name: 'DeepSeek Harness',
      role: '智能体宿主',
      order: 2,
      detectOnlyByDefault: true,
      start: { exe: settings.dshExe, args: [], cwd: path.dirname(settings.dshExe) },
      ports: [],
      logSources: [],
      notes: '桌面应用，Web 端口每次随机；由桥接的 dsh-port-proxy 自动发现。默认不主动启动。'
    },
    bridge: {
      id: 'bridge',
      name: 'qq-bridge',
      role: '消息桥接',
      order: 3,
      start: {
        exe: process.execPath,
        args: [path.join(settings.repoRoot, 'scripts', 'start-bridge.mjs')],
        cwd: settings.repoRoot
      },
      ports: [3100, 3080],
      logSources: ['bridge', 'activity'],
      notes: 'supervisor 负责 relay + bridge，并带 5 秒自动重启；停止必须停 supervisor。'
    }
  };
}

/** 第二阶段：任何操作都只返回模拟结果，绝不 spawn / kill / 写文件。 */
function simulateAction(defs, serviceId, action) {
  const def = defs[serviceId];
  if (!def) return { ok: false, error: `未知服务：${serviceId}` };
  if (!['start', 'stop', 'restart'].includes(action)) return { ok: false, error: `未知操作：${action}` };
  const plans = {
    start: [
      `检查 ${def.ports.join(' / ')} 端口是否已被占用`,
      `按依赖顺序启动（当前服务序号 ${def.order}）`,
      '等待健康检查通过，再刷新总览'
    ],
    stop: [
      '记录 watchdog 原始状态（state\\watchdog.disabled）',
      '仅当服务由本软件启动时才允许停止',
      '先请求正常退出，超时后再确认强制结束'
    ],
    restart: ['先执行停止预检', '再按启动顺序拉起', '记录本次操作到桌面日志']
  };
  return {
    ok: true,
    simulated: true,
    service: serviceId,
    action,
    message: `第二阶段为模拟模式：「${def.name}」${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'}未真实执行。`,
    plan: plans[action]
  };
}

function dependencyPlan(defs) {
  return Object.values(defs)
    .sort((a, b) => a.order - b.order)
    .map((def) => ({
      id: def.id,
      name: def.name,
      role: def.role,
      order: def.order,
      ports: def.ports,
      detectOnlyByDefault: Boolean(def.detectOnlyByDefault),
      notes: def.notes
    }));
}

module.exports = { definitions, simulateAction, dependencyPlan };
