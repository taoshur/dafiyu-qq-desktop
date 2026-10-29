function servicesPage(snapshot) {
  const plan = snapshot.plan || [];
  const byId = Object.fromEntries((snapshot.services || []).map((item) => [item.id, item]));
  const controlOn = Boolean(state.control?.enabled);
  const safeMode = Boolean(state.info?.safeMode);
  const bridgeRunning = byId.bridge?.state === 'running';
  const snowRunning = byId.snowluma?.state === 'running';
  const owned = (id) => Boolean(state.control?.records?.[id]);
  const steps = plan.map((item, index) => {
    const state = byId[item.id] || { state: 'stopped', pid: null, ports: item.ports || [] };
    const running = state.state === 'running';
    const dependencyBlocked = item.id === 'bridge' && !snowRunning;
    const starting = state.state === 'starting';
    const canStart = !running && !starting && controlOn && !dependencyBlocked;
    const canStop = running && owned(item.id) && controlOn;
    return `
    <div class="flow-step">
      <div class="flow-index">
        <span>${item.order}</span>
        ${index < plan.length - 1 ? '<i class="flow-line"></i>' : ''}
      </div>
      <div class="card flow-card">
        <h4>${esc(item.name)} <span class="meta-pill">${esc(item.role)}</span>${item.detectOnlyByDefault ? '<span class="state-pill state-degraded" style="margin-left:8px">默认仅检测</span>' : ''}${owned(item.id) ? '<span class="meta-pill" style="color:var(--teal)">桌面启动</span>' : running ? '<span class="meta-pill">外部运行</span>' : ''}</h4>
        <p>${esc(item.notes)}</p>
        <div class="service-meta" style="margin-top:9px">
          ${(item.ports || []).map((p) => `<span class="meta-pill">:${p}</span>`).join('') || '<span class="meta-pill">动态端口</span>'}
          ${state.pid ? `<span class="meta-pill">PID ${state.pid}</span>` : ''}
        </div>
        <div class="flow-actions">
          <button class="btn primary" data-control-start="${item.id}" type="button" ${canStart ? '' : 'disabled'}${dependencyBlocked ? ' title="SnowLuma 未就绪：请先启动 SnowLuma"' : ''}>${starting ? '启动中…' : '启动'}</button>
          <button class="btn" data-control-stop="${item.id}" type="button" ${canStop ? '' : 'disabled'}>停止</button>
          <button class="btn ghost" data-control-restart="${item.id}" type="button" ${canStop ? '' : 'disabled'}>重启</button>
        </div>
      </div>
    </div>`;
  }).join('');
  const sentinel = state.control?.sentinel;
  const wd = state.watchdog;  const wdHtml = wd && wd.verdict !== 'ok'
    ? `<div class="notice">原 watchdog 告警：${esc(wd.hint)}。管理器不会自动抢占 bridge 恢复权；请手动启动 bridge 或恢复 watchdog 任务。</div>`
    : '';
  const st = state.startupStatus;
  const orphanBridge = bridgeRunning && !snowRunning;
  const orphanHtml = orphanBridge
    ? '<div class="notice danger">qq-bridge 正在运行，但 SnowLuma 未就绪（3000/3001 未全部监听）：QQ 不会正常收发。请先启动 SnowLuma；当前 bridge 会持续重连。</div>'
    : '';
  const startupHtml = st
    ? `<div class="notice">自启现状：qq-bridge 任务 ${st.qqBridge.enabled ? '已启用' : '已禁用'} · SnowLuma 启动项 ${st.snowlumaStartup.exists ? '存在' : '已移除'} · 管理器登录自启 ${st.managerAutostartReady ? '已注册' : '未注册'}。${(!st.originalAutostartDisabled || !st.managerAutostartReady) ? '重启后需要手动打开管理器并启动服务。' : ''}</div>`
    : '';
  const sentinelHtml = sentinel?.exists
    ? `<div class="notice">watchdog 哨兵存在：${sentinel.marker?.createdByDesktop ? '由桌面在停止服务时创建，服务处于停止状态时保留' : '由用户手动设置，本软件不会修改'}。
        ${sentinel.marker?.createdByDesktop ? '<button class="btn" id="control-recover-sentinel" type="button" style="margin-left:8px">恢复 watchdog</button>' : ''}</div>`
    : '';
  const preflightHtml = state.preflight
    ? `<section class="card panel" style="margin-top:14px">
        <div class="section-title"><h3>首次操作预检</h3><span>${state.preflight.ok ? '未发现阻断项' : '存在需要处理的问题'}</span></div>
        ${state.preflight.checks.map((check) => `
          <div class="check-row">
            <span class="check-icon ${check.state}">${check.state === 'ok' ? '✓' : check.state === 'warn' ? '!' : '×'}</span>
            <div class="check-main"><h5>${esc(check.label)}</h5><p>${esc(check.detail)}</p></div>
          </div>`).join('')}
      </section>`
    : '';
  return `
    <div class="control-bar">
      <div class="control-text">
        <h4>真实服务控制 <span class="${controlOn ? 'control-on' : 'control-off'}">${controlOn ? '已启用' : '未启用'}</span></h4>
        <p>${controlOn ? '按钮会真实启动/停止本机进程；只操作由本软件启动的实例，外部实例只检测。' : '代码已就绪，但真实操作默认关闭。启用前请确认你了解会影响哪些进程。'}</p>
      </div>
      <button class="btn ${controlOn ? '' : 'primary'}" id="control-toggle" type="button" ${safeMode ? 'disabled title="安全模式（--safe-mode）下禁止真实控制"' : ''}>${safeMode ? '安全模式' : controlOn ? '关闭真实控制' : '启用真实控制'}</button>
    </div>
    ${safeMode ? '<div class="notice">当前以安全模式启动：只读检测、备份与日志可用，真实服务控制被强制关闭。</div>' : ''}
    <div class="notice">${controlOn
      ? '启动会按依赖顺序进行；停止优先正常退出，超时需要你再次确认才会强制结束。停止 qq-bridge 会临时写 state\\watchdog.disabled，防止 watchdog 在 5 分钟内拉起。'
      : '当前是安全模式：启动/停止按钮不可用。开启真实控制后，仍只能停止「由本软件启动」的服务，外部实例不会被误杀。'}</div>
    ${wdHtml}
    ${orphanHtml}
    ${startupHtml}
    ${sentinelHtml}
    <div class="backup-toolbar">
      <button class="btn" id="control-preflight" type="button">首次操作预检</button>
      <button class="btn" id="control-original" type="button" ${!bridgeRunning && controlOn ? '' : 'disabled'} title="仅在 qq-bridge 未运行时可用；由原启动器启动后，本软件不接管停止">用原启动方式启动 qq-bridge</button>
      <span class="backup-hint">预检只读：检查备份、进程身份、端口、watchdog 与原启动器</span>
    </div>
    ${preflightHtml}
    <div class="section-title" style="margin-top:16px"><h3>依赖顺序</h3><span>先网关、再智能体宿主、最后消息桥接</span></div>
    <div class="flow">${steps}</div>
    <div class="grid grid-2" style="margin-top:18px">
      <section class="card panel">
        <div class="section-title"><h3>停止时必须协调的两件事</h3></div>
        <div class="principle"><b>supervisor</b><span>只杀 bridge 会被 start-bridge.mjs 在 5 秒内拉起来，必须停 supervisor 整棵树。</span></div>
        <div class="principle"><b>watchdog</b><span>计划任务每 5 分钟检查 3100；停止期间需要临时写 state\\watchdog.disabled，并在启动时按原状态恢复。</span></div>
        <div class="principle"><b>归属</b><span>只停止本软件启动的服务；外部启动的实例只展示，不提供停止。</span></div>
      </section>
      <section class="card panel">
        <div class="section-title"><h3>安全边界</h3></div>
        <div class="principle"><b>不按进程名杀</b><span>只对记录过的 PID + 启动时间 + 可执行路径 + 命令行指纹执行 taskkill，身份不符直接拒绝。</span></div>
        <div class="principle"><b>先优雅后强制</b><span>先 taskkill 不带 /F；超时返回 needsForce，必须二次确认才强制结束。</span></div>
        <div class="principle"><b>DSH 不重复启动</b><span>默认只检测；用户主动启动前先确认已有实例，动态端口通过 401 探测发现。</span></div>
      </section>
    </div>`;
}
