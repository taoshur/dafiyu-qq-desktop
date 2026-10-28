'use strict';

/**
 * 恢复控制权归属：
 * - bridge：交给原 qq-bridge-watchdog（它不读管理器租约，避免双重恢复竞争）；
 * - snowluma：由管理器恢复（原 watchdog 只看 3100，不会碰它）；
 * - dsh：桌面应用，不由自动恢复接管。
 *
 * 只有 owner === 'manager' 的服务允许自动恢复；其余仅监控与告警。
 */
const RECOVERY_OWNERS = Object.freeze({
  bridge: 'watchdog',
  snowluma: 'manager',
  dsh: 'none'
});

function ownerOf(serviceId) {
  return RECOVERY_OWNERS[serviceId] || 'none';
}

function canManagerRecover(serviceId) {
  return ownerOf(serviceId) === 'manager';
}

function ownershipPlan() {
  return Object.entries(RECOVERY_OWNERS).map(([id, owner]) => ({ id, owner }));
}

module.exports = { RECOVERY_OWNERS, ownerOf, canManagerRecover, ownershipPlan };
