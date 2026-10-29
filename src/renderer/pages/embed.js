function embedPage(snapshot) {
  const e = state.embed;
  const service = e.service;
  const snow = snapshot.services?.find((item) => item.id === 'snowluma');
  const bridge = snapshot.services?.find((item) => item.id === 'bridge');
  const target = service === 'snowluma' ? snow : bridge;
  const info = e.result;
  const stateText = target?.state === 'running' ? '在线' : target?.state === 'starting' ? '启动中' : '未运行';
  const stateCls = target?.state === 'running' ? 'ok' : target?.state === 'starting' ? 'warn' : 'bad';
  return `
    <div class="notice">这里内嵌的是本机服务自己的 WebUI/SnowLuma 登录页。页面拥有原服务的管理权限，操作会真实影响机器人；不要在其中执行你不理解的操作。</div>
    <div class="backup-toolbar">
      <div class="segmented" role="tablist" aria-label="内嵌服务">
        <button class="seg-btn ${service === 'snowluma' ? 'is-active' : ''}" data-embed-service="snowluma" type="button">SnowLuma WebUI</button>
        <button class="seg-btn ${service === 'bridge' ? 'is-active' : ''}" data-embed-service="bridge" type="button">qq-bridge 控制台</button>
      </div>
      <button class="btn" id="embed-reload" type="button" ${e.busy ? 'disabled' : ''}>重新加载</button>
      <span class="backup-hint">${service === 'snowluma' ? '端口 5099；QQ 登录后 3000/3001 才会就绪' : '端口 3100；控制台令牌由主进程注入，不显示在 URL'}</span>
    </div>
    <section class="card panel embed-card">
      <div class="section-title">
        <h3>${service === 'snowluma' ? 'SnowLuma WebUI' : 'qq-bridge 控制台'}</h3>
        <span class="state-pill ${stateCls === 'ok' ? 'state-running' : stateCls === 'warn' ? 'state-degraded' : 'state-stopped'}"><i class="dot"></i>${stateText}</span>
      </div>
      <p class="embed-hint">${e.error ? esc(e.error) : info?.ok ? (info.running ? '页面已连接。' : '服务端口未监听，下方显示占位页。') : '正在连接…'}</p>
      <div id="embed-slot" class="embed-slot" data-service="${service}"></div>
    </section>`;
}
