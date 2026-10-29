'use strict';

// Thin domain boundary around the existing, well-tested controller.
// The controller still owns Windows process semantics; this facade keeps IPC
// handlers from depending on its implementation details.
function createServiceSupervisor({ controller }) {
  if (!controller) throw new Error('controller is required');
  return {
    controller,
    reconcile: (...args) => controller.reconcile(...args),
    records: () => controller.records(),
    sentinel: () => controller.sentinel(),
    buildDefinitions: () => controller.buildDefinitions(),
    start: (id, options) => controller.start(id, options),
    stop: (id, options) => controller.stop(id, options),
    preflight: () => controller.preflight(),
    recoverSentinel: () => controller.recoverSentinel(),
    startOriginalBridge: () => controller.startOriginalBridge(),
    stopOwnedServices: () => controller.stopOwnedServices()
  };
}

module.exports = { createServiceSupervisor };
