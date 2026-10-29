'use strict';

function registerEmbedHandlers(router, { embed, log }) {
  router.handle('embed:show', async (_event, payload) => {
    if (!embed) return { ok: false, reason: '内嵌页面未初始化' };
    const service = payload?.service;
    if (service !== 'snowluma' && service !== 'bridge') return { ok: false, reason: '不支持的内嵌服务' };
    const result = await embed.show(service);
    if (result?.ok) log('embed', `show ${service} running=${result.running}`);
    return result;
  });

  router.handle('embed:bounds', async (_event, payload) => {
    if (!embed) return { ok: false };
    const rect = payload?.rect || {};
    const nums = ['x', 'y', 'width', 'height'].map((key) => Number(rect[key]));
    if (!nums.every(Number.isFinite)) return { ok: false, reason: 'bounds 必须是数字' };
    embed.setBounds({ x: nums[0], y: nums[1], width: nums[2], height: nums[3] });
    return { ok: true };
  });

  router.handle('embed:hide', async () => {
    if (embed) embed.hide();
    return { ok: true };
  });

  router.handle('embed:state', async () => (embed ? embed.state() : { service: null }));
}

module.exports = { registerEmbedHandlers };
