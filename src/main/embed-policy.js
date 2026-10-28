'use strict';

// 内嵌服务页面白名单：只允许本机固定端口的服务 WebUI。
// 这里不包含 qq-bridge 控制台令牌；令牌只在主进程注入请求头。
const POLICIES = {
  snowluma: {
    id: 'snowluma',
    title: 'SnowLuma WebUI',
    url: 'http://127.0.0.1:5099/',
    origins: ['http://127.0.0.1:5099'],
    port: 5099
  },
  bridge: {
    id: 'bridge',
    title: 'qq-bridge 控制台',
    url: 'http://127.0.0.1:3100/',
    origins: ['http://127.0.0.1:3100'],
    port: 3100
  }
};

function policyFor(service) {
  return POLICIES[service] || null;
}

function isAllowedNavigation(service, rawUrl) {
  const policy = policyFor(service);
  if (!policy) return false;
  try {
    const url = new URL(String(rawUrl));
    return policy.origins.includes(url.origin);
  } catch {
    return false;
  }
}

module.exports = { POLICIES, policyFor, isAllowedNavigation };
