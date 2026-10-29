function startupPage() {
  const info = state.startup;
  if (!info) return '<div class="log-empty" style="padding:30px">正在读取启动设置…</div>';
  const st = state.startupStatus;
  const s = info.settings || {};
  const task = info.autostart || { state: 'unknown' };
  const taskText = {
    absent: '未注册',
    registered: '已注册（由桌面创建）',
    'registered-unowned': '已注册（外部创建，桌面不会删除）',
    conflict: '冲突：已存在同名任务但命令/触发方式不同',
    error: '查询失败'
  }[task.state] || task.state || '未知';
  const toggles = [
    ['managerAutostart', '管理器自启', '登录 Windows 时启动控制中心（托盘常驻）。只影响管理器，不会自动启动机器人。'],
    ['botAutostart', '机器人自启', '管理器启动后自动拉起 SnowLuma 与 qq-bridge。不包含 DSH（默认仅检测）；用户主动停止的服务不会被拉起。'],
    ['autoRecovery', '异常自动恢复', '仅对“由管理器启动、且管理器正在运行”的服务生效。限速 3 次/小时、连续失败 5 次熔断；用户主动停止不恢复。']
  ].map(([key, title, desc]) => `
    <div class="check-row">
      <span class="check-icon ${s[key] ? 'ok' : 'warn'}">${s[key] ? '✓' : '·'}</span>
      <div class="check-main">
        <h5>${title}</h5>
        <p>${desc}</p>
      </div>
      <button class="toggle ${s[key] ? 'on' : ''}" data-toggle-setting="${key}" type="button" aria-pressed="${s[key] ? 'true' : 'false'}">${s[key] ? '已开启' : '已关闭'}</button>
    </div>`).join('');

  return `
    <div class="notice">三个开关互相独立，默认全部关闭。修改开关只写入桌面配置；系统任务注册/注销需要点下面的按钮并二次确认。</div>
    <section class="card" style="margin-top:14px">${toggles}</section>
    <div class="grid grid-2" style="margin-top:16px">
      <section class="card panel">
        <div class="section-title"><h3>Windows 计划任务</h3><span>只管理 DafiyuManager，不触碰原 qq-bridge 任务</span></div>
        <div class="kv-grid">
          <div class="kv"><span>任务名</span><b>${esc(task.taskName || 'DafiyuManager')}</b></div>
          <div class="kv"><span>状态</span><b>${esc(taskText)}</b></div>
          <div class="kv" style="grid-column: 1 / -1"><span>期望命令</span><b>${esc(task.expectedCommand || '—')}</b></div>
        </div>
        ${task.reason ? `<p class="service-detail" style="margin-top:8px">${esc(task.reason)}</p>` : ''}
        <div class="flow-actions" style="margin-top:12px">
          <button class="btn primary" id="autostart-register" type="button" ${!info.canRegister || task.state === 'conflict' || task.state === 'registered' ? 'disabled' : ''}>注册登录自启</button>
          <button class="btn" id="autostart-unregister" type="button" ${!info.canRegister || task.state !== 'registered' ? 'disabled' : ''}>注销登录自启</button>
        </div>
        <p class="service-detail" style="margin-top:10px">注册具有幂等性：已存在相同任务时不会重复创建；命令不一致时拒绝覆盖；失败会自动回滚本次创建。</p>
      </section>
      <section class="card panel">
        <div class="section-title"><h3>管理器退出后的恢复边界</h3><span>不要把它理解成“全部受守护”</span></div>
        <div class="principle"><b>服务继续运行</b><span>主进程退出后，已启动的服务继续运行（detached）。</span></div>
        <div class="principle"><b>自动恢复停止</b><span>管理器退出后不再执行异常自动恢复。</span></div>
        <div class="principle"><b>qq-bridge</b><span>仅当没有 <code>state\\watchdog.disabled</code> 哨兵时，由原计划任务 qq-bridge-watchdog 兜底。</span></div>
        <div class="principle"><b>SnowLuma / DSH</b><span>无自动恢复；需要重新打开管理器或手动启动。</span></div>
        ${info.intents && Object.keys(info.intents).length ? `<div class="principle"><b>用户停止意图</b><span>${Object.keys(info.intents).join('、')} 已被标记为主动停止，自动启动/恢复会跳过。</span></div>` : ''}
      </section>
    </div>
    <section class="card panel" style="margin-top:16px">
      <div class="section-title"><h3>自启现状</h3><span>只读查询，不修改任何任务或启动项</span></div>
      ${st ? [
        ['qq-bridge 计划任务', st.qqBridge.enabled ? '已启用' : '已禁用', st.qqBridge.enabled ? 'warn' : 'ok'],
        ['watchdog 计划任务', st.watchdog.enabled ? '已启用' : '已禁用', st.watchdog.enabled ? 'ok' : 'warn'],
        ['SnowLuma 启动项', st.snowlumaStartup.exists ? '存在' : '已移除', st.snowlumaStartup.exists ? 'warn' : 'ok'],
        ['管理器登录自启', st.managerAutostartReady ? '已注册' : (st.managerAutostart.exists ? '已注册但命令不匹配' : '未注册'), st.managerAutostartReady ? 'ok' : 'warn']
      ].map(([label, value, state]) => `
        <div class="check-row">
          <span class="check-icon ${state}">${state === 'ok' ? '✓' : '!'}</span>
          <div class="check-main"><h5>${esc(label)}</h5><p>${esc(value)}</p></div>
        </div>`).join('') : '<div class="log-empty" style="padding:14px">正在读取…</div>'}
      <p class="service-detail" style="margin-top:8px">原自启已禁用、管理器登录自启未注册：重启 Windows 后不会自动启动任何组件，需要手动打开管理器并启动服务。</p>
    </section>
    <section class="card panel" style="margin-top:16px">
      <div class="section-title"><h3>恢复控制权</h3><span>同一服务任何时刻只有一个自动恢复主体</span></div>
      ${(info.recovery?.ownership || []).map((item) => {
        const live = (info.recovery?.states || []).find((state) => state.id === item.id);
        const ownerText = item.owner === 'watchdog' ? '原 qq-bridge-watchdog' : item.owner === 'manager' ? '管理器恢复引擎' : '不自动恢复';
        const liveText = live ? `当前：${live.state}（${live.reason}）` : '当前：无托管记录';
        return `<div class="check-row">
          <span class="check-icon ${live && ['degraded', 'unknown'].includes(live.state) ? 'warn' : 'ok'}">${live && ['degraded', 'unknown'].includes(live.state) ? '!' : '·'}</span>
          <div class="check-main"><h5>${esc(item.id)} · ${esc(ownerText)}</h5><p>${esc(liveText)}</p></div>
        </div>`;
      }).join('')}
      <p class="service-detail" style="margin-top:8px">bridge 交给原 watchdog 是为了避免双重恢复；管理器只监控 bridge，不自动重启它。SnowLuma 由管理器恢复，DSH 不自动恢复。</p>
    </section>
    <section class="card panel" style="margin-top:16px">
      <div class="section-title"><h3>最近恢复记录</h3><span>仅在自动恢复开启、管理器运行且服务由桌面托管时产生</span></div>
      ${(info.recovery && info.recovery.history && info.recovery.history.length)
        ? info.recovery.history.slice().reverse().map((item) => `
          <div class="check-row">
            <span class="check-icon ${item.result === 'recovered' ? 'ok' : item.result === 'failed' ? 'bad' : 'warn'}">${item.result === 'recovered' ? '✓' : item.result === 'failed' ? '×' : '!'}</span>
            <div class="check-main">
              <h5>${esc(item.service)} · ${item.result === 'recovered' ? '已恢复' : item.result === 'failed' ? '恢复失败' : '已中止'}</h5>
              <p>${new Date(item.at).toLocaleString()} · 耗时 ${item.durationMs} ms · 连续失败 ${item.failures}${item.total ? ` · 累计 ${item.total} 次` : ''}${item.reason ? ` · ${esc(item.reason)}` : ''}</p>
            </div>
          </div>`).join('')
        : '<div class="log-empty" style="padding:14px">暂无恢复记录</div>'}
    </section>`;
}
