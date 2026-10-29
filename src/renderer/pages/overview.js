function overview(snapshot) {
  const mem = state.memoryOverview;
  const memCfg = snapshot.config?.memory || {};
  const counts = mem?.counts || {};
  const memState = mem?.error ? '读取失败' : mem?.exists ? (mem.integrity === 'ok' ? '正常' : '需检查') : '未连接';
  const qqState = snapshot.services?.find((s) => s.id === 'snowluma')?.state === 'running' && snapshot.services?.find((s) => s.id === 'bridge')?.state === 'running' ? '链路在线' : '链路不完整';
  const uptime = Number(state.info?.uptimeSec);
  const uptimeText = Number.isFinite(uptime) ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m` : '—';
  const memErrors = (mem?.failures || [])
    .filter((item) => Date.now() - Number(item.updated_at || 0) < 24 * 3600 * 1000)
    .slice(0, 2);
  return `
    ${hero(snapshot)}
    <div class="section-title"><h3>服务状态</h3><span>SnowLuma → DSH → qq-bridge</span></div>
    <div class="grid grid-3">${(snapshot.services || []).map(serviceCard).join('')}</div>
    <div class="grid grid-4 memory-stats" style="margin-top:18px">
      <section class="card stat"><span>QQ 连接</span><b class="${qqState === '链路在线' ? 'ok' : 'warn'}">${qqState}</b><small>SnowLuma + bridge</small></section>
      <section class="card stat"><span>长期记忆</span><b class="${memState === '正常' ? 'ok' : 'warn'}">${memState}</b><small>${counts.facts || 0} 条事实 / ${counts.events || 0} 条事件 / ${counts.pending || 0} 条待确认</small></section>
      <section class="card stat"><span>数据库完整性</span><b class="${mem?.integrity === 'ok' ? 'ok' : 'warn'}">${esc(mem?.integrity === 'ok' ? '正常' : mem?.integrity || '—')}</b><small>观察模式${mem?.observeOnly ? '开启' : '关闭'} · ${fmtSize(mem?.file?.size)}</small></section>
      <section class="card stat"><span>模型 / 运行时长</span><b style="font-size:15px">${esc(mem?.model || memCfg.model || '—')}</b><small>桌面已运行 ${uptimeText}</small></section>
    </div>
    ${memErrors.length ? `<div class="notice">近 24 小时抽取失败：${memErrors.map((x) => `${new Date(Number(x.updated_at)).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${esc(x.conv_key || '未知会话')} · ${esc(String(x.last_error || '').slice(0, 80))}（第 ${x.attempts || 0} 次）`).join('；')}</div>` : ''}
    <div class="grid grid-2" style="margin-top:18px">
      <section class="card panel">
        <div class="section-title"><h3>体检摘要</h3><span>完整项在「环境检查」</span></div>
        <div class="env-mini">${envMini(snapshot)}</div>
      </section>
      <section class="card panel">
        <div class="section-title"><h3>桥接最近日志</h3><span>只读</span></div>
        <pre class="log-preview" id="recent-log">读取中…</pre>
      </section>
    </div>`;
}

async function refreshSetup() {
  try {
    state.setup.status = await api.setupStatus();
    state.setup.error = null;
  } catch (error) {
    state.setup.error = error.message;
  }
  if (state.page === 'setup') render();
}

async function setupStartSnowluma() {
  const password = $('setup-snow-password')?.value || '';
  const confirm = $('setup-snow-password2')?.value || '';
  const rules = [
    [password.length >= 10, '至少 10 位'],
    [/[a-z]/.test(password), '包含小写字母'],
    [/[A-Z]/.test(password), '包含大写字母'],
    [/[^A-Za-z0-9\s]/.test(password), '包含特殊符号'],
    [!/\s/.test(password), '不能包含空格']
  ];
  const failed = rules.filter(([ok]) => !ok).map(([, label]) => label);
  if (failed.length) { toast(`密码不符合：${failed.join('、')}`); return; }
  if (password !== confirm) { toast('两次输入的密码不一致'); return; }
  if (!state.control.enabled) { toast('请先启用真实控制'); return; }
  state.setup.busy = true;
  render();
  try {
    const result = await api.controlStart('snowluma', { SNOWLUMA_WEBUI_BOOTSTRAP_PASSWORD: password });
    if (result.ok) {
      toast(result.starting ? result.reason : 'SnowLuma 已启动；请到服务网页登录 5099');
      state.setup.status = await api.setupStatus();
    } else {
      toast(`SnowLuma 启动失败：${result.reason}`);
    }
  } catch (error) {
    toast(`SnowLuma 启动失败：${error.message}`);
  } finally {
    state.setup.busy = false;
    if (state.page === 'setup') render();
  }
}

function wizardPasswordRules(password) {
  const rules = [
    [password.length >= 10, '至少 10 位'],
    [/[a-z]/.test(password), '包含小写字母'],
    [/[A-Z]/.test(password), '包含大写字母'],
    [/[^A-Za-z0-9\s]/.test(password), '包含特殊符号'],
    [!/\s/.test(password), '不能包含空格']
  ];
  return rules.filter(([ok]) => !ok).map(([, label]) => label);
}

function closeWizard({ dismiss = true } = {}) {
  state.wizard.open = false;
  state.wizard.password = '';
  state.wizard.password2 = '';
  state.wizard.error = null;
  if (dismiss) {
    try { localStorage.setItem('dafiyu.onboarding.dismissed.v1', '1'); } catch { /* ignore */ }
  }
  renderWizard();
}

async function openWizard(step = 0) {
  state.wizard.open = true;
  state.wizard.step = step;
  state.wizard.busy = true;
  state.wizard.error = null;
  if (!state.settings) {
    try { state.settings = await api.settingsGet(); } catch { state.settings = null; }
  }
  state.wizard.ownerTitle = state.settings?.ownerTitle || '爸爸';
  renderWizard();
  try {
    state.wizard.status = await api.setupStatus();
  } catch (error) {
    state.wizard.error = error.message;
  } finally {
    state.wizard.busy = false;
    renderWizard();
  }
}

async function wizardRefreshStatus() {
  try { state.wizard.status = await api.setupStatus(); } catch (error) { state.wizard.error = error.message; }
  if (state.setup && state.wizard.status) state.setup.status = state.wizard.status;
  renderWizard();
  if (state.page === 'setup') render();
}

async function wizardStartSnowluma() {
  const password = $('wizard-snow-password')?.value || '';
  const confirm = $('wizard-snow-password2')?.value || '';
  const failed = wizardPasswordRules(password);
  if (failed.length) { toast(`密码不符合：${failed.join('、')}`); return; }
  if (password !== confirm) { toast('两次输入的密码不一致'); return; }
  if (!state.wizard.status?.controlEnabled) { toast('请先启用真实控制'); return; }
  state.wizard.busy = true;
  state.wizard.error = null;
  renderWizard();
  try {
    const result = await api.controlStart('snowluma', { SNOWLUMA_WEBUI_BOOTSTRAP_PASSWORD: password });
    if (result.ok) {
      await wizardRefreshStatus();
      state.wizard.step = 2;
      toast(result.starting ? result.reason : 'SnowLuma 已启动；下一步登录 5099');
    } else {
      state.wizard.error = result.reason;
      toast(`SnowLuma 启动失败：${result.reason}`);
    }
  } catch (error) {
    state.wizard.error = error.message;
    toast(`SnowLuma 启动失败：${error.message}`);
  } finally {
    state.wizard.busy = false;
    renderWizard();
  }
}

async function wizardStartBridge() {
  state.wizard.busy = true;
  renderWizard();
  try {
    const result = await api.controlStart('bridge', {});
    if (!result.ok) state.wizard.error = result.reason;
    await wizardRefreshStatus();
  } catch (error) {
    state.wizard.error = error.message;
  } finally {
    state.wizard.busy = false;
    renderWizard();
  }
}

function renderWizard() {
  const root = $('wizard-root');
  if (!root) return;
  if (!state.wizard.open) { root.innerHTML = ''; return; }
  const w = state.wizard;
  const s = w.status;
  const step = w.step;
  const total = 5;
  const dots = Array.from({ length: total }, (_, index) => `<span class="wizard-dot ${index === step ? 'is-active' : index < step ? 'is-done' : ''}"></span>`).join('');
  let body = '';
  if (!s && w.busy) {
    body = '<p class="wizard-p">正在读取首次设置状态…</p>';
  } else if (step === 0) {
    body = `
      <p class="wizard-p">欢迎使用大肥鱼控制中心。第一次部署只需要完成三步：</p>
      <ol class="wizard-list">
        <li>告诉大肥鱼怎么称呼你</li>
        <li>设置一次 SnowLuma WebUI 密码</li>
        <li>在 5099 登录 SnowLuma，然后启动 qq-bridge</li>
      </ol>
      <label class="field-label" for="wizard-owner-title">大肥鱼对您的称呼</label>
      <input class="input setup-input" id="wizard-owner-title" maxlength="16" value="${esc(w.ownerTitle || '爸爸')}" placeholder="例如：爸爸、主人、老板">
      <p class="wizard-p">只用于界面问候，不写入 QQ 配置，也不会上传；默认是“爸爸”。</p>`;
  } else if (step === 1) {
    body = s?.webuiInitialized
      ? `<p class="wizard-p">这台机器的 SnowLuma 已经初始化过（存在 <code>config/webui.json</code>），继续使用原来的 WebUI 密码即可，不需要重设。</p>
         <p class="wizard-p">忘记密码请参考首次登录文档，不要直接删除生产配置。</p>`
      : `<p class="wizard-p">这台机器还没有 SnowLuma WebUI 凭据。设置一个强密码；它只会作为本次启动的 bootstrap 密码传给 SnowLuma，不写入桌面配置、不写日志。</p>
         <label class="field-label" for="wizard-snow-password">SnowLuma 初始密码</label>
         <input class="input setup-input" id="wizard-snow-password" type="password" autocomplete="new-password" placeholder="至少 10 位，含大小写和特殊符号">
         <label class="field-label" for="wizard-snow-password2">再输一次</label>
         <input class="input setup-input" id="wizard-snow-password2" type="password" autocomplete="new-password" placeholder="确认密码">
         ${s?.controlEnabled ? '' : '<p class="wizard-warn">真实控制未启用，需要先启用才能启动 SnowLuma。</p><button class="btn" data-wizard-enable-control type="button">启用真实控制</button>'}`;
  } else if (step === 2) {
    body = `
      <p class="wizard-p">SnowLuma 的 WebUI 是 <code>http://127.0.0.1:5099</code>，用户名 <code>admin</code>，密码用上一步设置的那个。</p>
      <p class="wizard-p">${s?.snowlumaOnline ? '5099 已在线，可以现在登录。' : '如果还没有在线，请先在服务页启动 SnowLuma；首次登录可能需要在页面里完成。'}</p>
      <button class="btn primary" data-wizard-open-embed type="button">打开 SnowLuma 登录页</button>
      <p class="wizard-p">登录后请立即在 SnowLuma 里改成自己的密码。完成后点“下一步”继续配置 bridge。</p>`;
  } else if (step === 3) {
    body = `
      <p class="wizard-p">qq-bridge 控制台需要令牌，但本机令牌会自动生成，内嵌控制台也会自动注入；你不需要手动输入。</p>
      <p class="wizard-p">当前状态：${s?.bridgeTokenReady ? '令牌已生成' : '还没有令牌，首次启动 bridge 后自动生成'}；${s?.bridgeOnline ? '3100 在线' : 'bridge 未运行'}。</p>
      ${s?.bridgeTokenReady ? '' : '<p class="wizard-warn">如果希望现在生成，请先确保 SnowLuma 的 3000/3001 已就绪，然后点下面的按钮。</p>'}
      <button class="btn" data-wizard-start-bridge type="button" ${s?.controlEnabled && !w.busy ? '' : 'disabled'}>启动 qq-bridge</button>`;
  } else {
    body = `
      <p class="wizard-p">首次设置完成。之后可以直接从桌面启动，不需要再重复这些步骤。</p>
      <ul class="wizard-list">
        <li>SnowLuma：${s?.webuiInitialized ? '已初始化' : '仍需设置'}</li>
        <li>qq-bridge 令牌：${s?.bridgeTokenReady ? '已生成' : '待首次启动生成'}</li>
      </ul>`;
  }
  const canNext = step === 0 || step === 2 || step === 3 || (step === 1 && Boolean(s?.webuiInitialized));
  const nextLabel = step === total - 1 ? '完成' : '下一步';
  root.innerHTML = `
    <div class="wizard-backdrop" data-wizard-backdrop>
      <section class="wizard" role="dialog" aria-modal="true" aria-label="首次设置向导">
        <header class="wizard-head">
          <div><h3>首次设置</h3><p>一步一步完成，不会替你操作生产账号</p></div>
          <button class="icon-btn" data-wizard-close type="button" title="稍后再说">×</button>
        </header>
        <div class="wizard-dots">${dots}</div>
        <div class="wizard-body">${body}</div>
        ${w.error ? `<div class="wizard-error">${esc(w.error)}</div>` : ''}
        <footer class="wizard-foot">
          <button class="btn ghost" data-wizard-close type="button">稍后再说</button>
          <div class="wizard-nav">
            ${step > 0 ? '<button class="btn" data-wizard-back type="button">上一步</button>' : ''}
            ${step === 1 && !s?.webuiInitialized
              ? `<button class="btn primary" data-wizard-start-snow type="button" ${s?.controlEnabled && !w.busy ? '' : 'disabled'}>设置并启动 SnowLuma</button>`
              : `<button class="btn primary" data-wizard-next type="button" ${canNext && !w.busy ? '' : 'disabled'}>${nextLabel}</button>`}
          </div>
        </footer>
      </section>
    </div>`;
}

async function maybeOpenWizard() {
  let dismissed = false;
  try { dismissed = localStorage.getItem('dafiyu.onboarding.dismissed.v1') === '1'; } catch { /* ignore */ }
  if (dismissed) return;
  try {
    const status = await api.setupStatus();
    if (!status.webuiInitialized || !status.bridgeTokenReady) openWizard(0);
  } catch { /* 状态读取失败时不要挡住主界面 */ }
}
