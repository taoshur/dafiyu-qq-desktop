'use strict';

const { status: biliStatus, ack: biliAck } = require('../../domain/bilibili/repository');

function registerBilibiliHandlers(router, { paths, getSettings }) {
  router.handle('bilibili:status', async () => biliStatus({ settings: getSettings(), paths }));
  router.handle('bilibili:ack', async (_event, payload) => biliAck({ paths, at: payload?.at }));
}

module.exports = { registerBilibiliHandlers };
