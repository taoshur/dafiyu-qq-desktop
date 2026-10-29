'use strict';

const api = window.dafiyu;

const state = {
  page: 'overview',
  info: null,
  settings: null,
  snap: null,
  lastRenderedPage: null,
  logsList: null,
  logs: { source: 'bridge', lines: 120, query: '', follow: true, data: null, viewCleared: false },
  backups: null,
  backupBusy: false,
  backupHint: '',
  control: { enabled: false, records: {}, sentinel: null, definitions: [] },
  preflight: null,
  startup: null,
  recovery: null,
  watchdog: null,
  startupStatus: null,
  memory: {
    mode: 'prod',
    status: null,
    list: null,
    type: 'candidates',
    q: '',
    dateFrom: '',
    dateTo: '',
    status: 'pending',
    selected: null,
    detail: null,
    busy: false,
    error: null
  },
  memoryOverview: null,
  bili: { status: null, busy: false, error: null, timer: null, lastToastAt: 0 },
  update: { check: null, busy: false, error: null, task: null, timer: null },
  embed: { service: 'snowluma', result: null, error: null, busy: false },
  setup: { status: null, busy: false, error: null },
  environment: { status: null, busy: false, error: null },
  install: { task: null, targetDir: '', timer: null, busy: false },
  wizard: { open: false, step: 0, status: null, busy: false, error: null, ownerTitle: '爸爸' },
  busy: false,
  error: null,
  recent: null
};

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const PAGE_META = {
  overview: ['总览', '三件套的健康状态一眼看清'],
  services: ['服务', '按依赖顺序启动，只停止由本软件启动的服务'],
  embed: ['服务网页', '内嵌本机 WebUI；页面权限与原服务一致'],
  setup: ['首次设置', '首次部署时设置 SnowLuma 密码；bridge 令牌由本机自动生成'],
  environment: ['环境安装', '检测 SnowLuma / qq-bridge / DSH；可自动安装的部分才提供一键安装'],
  startup: ['启动与恢复', '三个开关互相独立；默认全部关闭'],
  logs: ['运行日志', '只读查看，不会删除或截断原文件'],
  env: ['环境检查', '启动前先确认运行时、配置与数据目录'],
  config: ['配置', '默认只读；令牌与凭据不会显示在这里'],
  memory: ['长期记忆', '大肥鱼记住的人和事；真实记忆只读，练习副本可审核'],
  bilibili: ['B站活动', '大肥鱼在 B 站看了什么；本机台账，不上传'],
  backups: ['数据备份', 'SQLite 一致性快照 + manifest 校验'],
  about: ['关于', '大肥鱼桌面控制台 · 第三阶段（服务控制）']
};

function fmtSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtTime(ms) {
  if (!ms) return '—';
  const date = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function greeting(title = '爸爸') {
  const hour = new Date().getHours();
  const who = String(title || '爸爸').trim() || '爸爸';
  if (hour < 6) return `夜深了，${who}`;
  if (hour < 11) return `早上好，${who}`;
  if (hour < 14) return `中午好，${who}`;
  if (hour < 18) return `下午好，${who}`;
  return `晚上好，${who}`;
}

function stateText(serviceState) {
  if (serviceState === 'running') return '在线';
  if (serviceState === 'degraded') return '异常';
  if (serviceState === 'starting') return '启动中';
  return '未运行';
}

function iconFor(id) {
  if (id === 'snowluma') {
    return '<svg viewBox="0 0 24 24"><path d="M3 8c2.2 0 2.2 3 4.4 3S9.6 8 11.8 8s2.2 3 4.4 3 2.2-3 4.4-3"/><path d="M3 14c2.2 0 2.2 3 4.4 3s2.2-3 4.4-3 2.2 3 4.4 3 2.2-3 4.4-3"/></svg>';
  }
  if (id === 'dsh') {
    return '<svg viewBox="0 0 24 24"><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z"/></svg>';
  }
  return '<svg viewBox="0 0 24 24"><path d="M4 12c3-4 6-4 8 0s5 4 8 0"/><circle cx="12" cy="12" r="2.4"/><path d="M12 4v2M12 18v2"/></svg>';
}

function serviceCard(service) {
  const cls = service.state === 'running' ? 'state-running' : service.state === 'degraded' || service.state === 'starting' ? 'state-degraded' : 'state-stopped';
  const iconCls = service.id === 'dsh' ? 'pink' : service.id === 'bridge' ? 'blue' : '';
  const ports = service.ports && service.ports.length ? service.ports.map((p) => `:${p}`).join(' ') : '—';
  const pid = service.pid ? `PID ${service.pid}` : 'PID —';
  const running = service.state === 'running';
  const owned = Boolean(state.control?.records?.[service.id]);
  const controlOn = Boolean(state.control?.enabled);
  const snowRunning = state.snap?.services?.find((item) => item.id === 'snowluma')?.state === 'running';
  const dependencyBlocked = service.id === 'bridge' && !snowRunning;
  const starting = service.state === 'starting';
  const canStart = !running && !starting && controlOn && !dependencyBlocked;
  const canStop = running && owned && controlOn;
  const canRestart = running && owned && controlOn;
  const ownership = owned
    ? '<span class="meta-pill" style="color:var(--teal)">桌面启动</span>'
    : running ? '<span class="meta-pill">外部运行</span>' : '';
  const title = (allowed, why) => (allowed ? '' : ` title="${why}"`);
  const ownerLabel = state.recovery?.ownership?.find((item) => item.id === service.id)?.owner;
  const ownerText = ownerLabel === 'watchdog'
    ? '恢复：原 watchdog'
    : ownerLabel === 'manager'
      ? (owned ? '恢复：管理器' : '恢复：管理器（未托管）')
      : ownerLabel === 'none' ? '恢复：不托管' : '';
  const recState = state.recovery?.states?.find((item) => item.id === service.id);
  const warn = recState && ['degraded', 'unknown'].includes(recState.state)
    ? `<p class="service-detail" style="color:var(--amber)">${recState.state === 'degraded' ? '异常（未自动修复）' : '状态未知（未自动修复）'}：${esc(recState.reason)}</p>`
    : '';
  return `
    <article class="card service-card">
      <div class="service-head">
        <span class="service-icon ${iconCls}">${iconFor(service.id)}</span>
        <div class="service-title">
          <h4>${esc(service.name)}</h4>
          <p>${esc(service.role)}</p>
        </div>
        <span class="state-pill ${cls}"><i class="dot"></i>${stateText(service.state)}</span>
      </div>
      <div class="service-meta">
        <span class="meta-pill">${esc(ports)}</span>
        <span class="meta-pill">${esc(pid)}</span>
        ${ownership}
        ${ownerText ? `<span class="meta-pill">${esc(ownerText)}</span>` : ''}
      </div>
      <p class="service-detail">${esc(service.detail)}</p>
      ${warn}
      <div class="service-actions">
        <button class="btn primary" data-control-start="${service.id}" type="button" ${canStart ? '' : 'disabled'}${title(canStart, running ? '已在运行（外部实例不会被重复启动）' : starting ? '正在启动/等待 QQ 登录，请稍候' : dependencyBlocked ? 'SnowLuma 未就绪：请先启动 SnowLuma，再启动 qq-bridge' : '请先在服务页启用真实控制')}>${starting ? '启动中…' : '启动'}</button>
        <button class="btn" data-control-stop="${service.id}" type="button" ${canStop ? '' : 'disabled'}${title(canStop, running ? (owned ? '请先启用真实控制' : '外部启动的实例只能检测，不能由本软件停止') : '服务未运行')}>停止</button>
        <button class="btn ghost" data-control-restart="${service.id}" type="button" ${canRestart ? '' : 'disabled'}${title(canRestart, '仅对桌面启动且正在运行的服务可用')}>重启</button>
      </div>
    </article>`;
}

function envMini(snapshot) {
  const rows = (snapshot.env || []).slice(0, 5).map((item) => `
    <div class="env-mini-row">
      <i class="mini-dot ${item.state}"></i>
      <span>${esc(item.label)}</span>
      <b>${item.state === 'ok' ? '正常' : item.state === 'warn' ? '注意' : '异常'}</b>
    </div>`).join('');
  return rows || '<div class="env-mini-row"><i class="mini-dot warn"></i><span>尚未检测</span></div>';
}

function hero(snapshot) {
  const running = (snapshot.services || []).filter((s) => s.state === 'running').length;
  const total = (snapshot.services || []).length;
  const ports = snapshot.ports || {};
  const okCount = (snapshot.env || []).filter((e) => e.state === 'ok').length;
  const badCount = (snapshot.env || []).filter((e) => e.state === 'bad').length;
  return `
    <section class="card hero fade-in">
      <img class="hero-avatar" src="assets/deepseek-chan.png" alt="" />
      <div class="hero-text">
        <h3>${greeting(state.settings?.ownerTitle)}，今天也一起把家看好</h3>
        <p>服务控制默认关闭；在服务页显式启用后，才可启动/停止由本软件启动的实例。外部实例只检测，不误杀。</p>
        <div class="hero-chips">
          <span class="chip">服务 <b>${running}/${total}</b> 在线</span>
          <span class="chip">端口 <b>${ports.console || '—'} / ${ports.dshRelay || '—'}</b></span>
          <span class="chip">体检 <b>${okCount} 正常</b>${badCount ? ` · <b>${badCount} 异常</b>` : ''}</span>
          <span class="chip">检测耗时 <b>${snapshot.elapsedMs || 0} ms</b></span>
        </div>
      </div>
    </section>`;
}

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

function setupPage() {
  const s = state.setup.status;
  if (!s) return `<div class="log-empty" style="padding:30px">正在读取首次设置状态…${state.setup.error ? `<br><span style="color:var(--danger)">${esc(state.setup.error)}</span>` : ''}<br><button class="btn" id="setup-refresh" type="button" style="margin-top:12px">重试</button></div>`;
  const initialized = Boolean(s.webuiInitialized);
  return `
    <div class="notice">首次部署只需要做两件事：给 SnowLuma 设一次 WebUI 密码；qq-bridge 控制台令牌由本机自动生成，内嵌页面自动注入，不需要你手动输入。</div>
    ${deepSeekHelpBlock()}
    <div class="grid grid-2" style="margin-top:16px">
      <section class="card panel">
        <div class="section-title"><h3>1. SnowLuma WebUI</h3><span class="state-pill ${initialized ? 'state-running' : 'state-degraded'}"><i class="dot"></i>${initialized ? '已初始化' : '首次设置'}</span></div>
        <p class="embed-hint">配置目录：${esc(s.snowlumaRoot)}</p>
        ${initialized
          ? '<p class="setup-ok">已有 config/webui.json：继续使用原来的 WebUI 密码。忘记密码请参考首次登录文档，不要直接删除生产配置。</p>'
          : `<p class="setup-ok">还没有 config/webui.json。设置一个强密码，桌面会把它作为 SnowLuma 的首次 bootstrap 密码；启动后用它登录 5099，并立即改密。</p>
             <label class="field-label" for="setup-snow-password">SnowLuma 初始密码</label>
             <input class="input setup-input" id="setup-snow-password" type="password" autocomplete="new-password" placeholder="至少 10 位，含大小写和特殊符号">
             <label class="field-label" for="setup-snow-password2">再输一次</label>
             <input class="input setup-input" id="setup-snow-password2" type="password" autocomplete="new-password" placeholder="确认密码">
             <button class="btn primary" id="setup-snow-start" type="button" ${s.controlEnabled && !state.setup.busy ? '' : 'disabled'}>设置并启动 SnowLuma</button>
             ${s.controlEnabled ? '' : '<button class="btn" id="setup-enable-control" type="button">先启用真实控制</button>'}`}
        <p class="embed-hint">${s.snowlumaOnline ? '5099 已在线。' : 'SnowLuma 当前未运行。'}启动成功后到「服务网页 → SnowLuma WebUI」登录。</p>
      </section>
      <section class="card panel">
        <div class="section-title"><h3>2. qq-bridge 控制台</h3><span class="state-pill ${s.bridgeTokenReady ? 'state-running' : 'state-degraded'}"><i class="dot"></i>${s.bridgeTokenReady ? '令牌已生成' : '等待首次启动'}</span></div>
        <p class="embed-hint">令牌文件：${esc(s.repoRoot)}\\state\\console-token</p>
        ${s.bridgeTokenReady
          ? '<p class="setup-ok">本机令牌已存在。内嵌控制台由主进程注入 x-console-token，不需要你输入；外部浏览器才需要手动读取该文件。</p>'
          : '<p class="setup-ok">首次启动 qq-bridge 时会自动生成令牌。启动后重新打开本页即可看到状态；内嵌控制台仍然不需要手输。</p>'}
        <p class="embed-hint">${s.bridgeOnline ? '3100 已在线。' : 'qq-bridge 当前未运行；启动前请先让 SnowLuma 的 3000/3001 就绪。'}</p>
        <button class="btn" id="setup-open-embed" type="button">打开服务网页</button>
      </section>
    </div>
    <div class="backup-toolbar" style="margin-top:14px">
      <button class="btn primary" id="setup-wizard" type="button">打开步骤向导</button>
      <button class="btn" id="setup-refresh" type="button" ${state.setup.busy ? 'disabled' : ''}>刷新检测</button>
      <span class="backup-hint">${state.setup.error ? esc(state.setup.error) : '只读取状态；不会显示密码或令牌内容'}</span>
    </div>`;
}

function envStateClass(state) {
  if (state === 'running' || state === 'ok') return 'state-running';
  if (state === 'installed-unconfigured' || state === 'configured-not-running' || state === 'warn') return 'state-degraded';
  return 'state-stopped';
}

function environmentCard(item) {
  const auto = ['bridge', 'snowluma'].includes(item.id) && item.status === 'not-installed';
  const snow = item.id === 'snowluma';
  return `
    <section class="card panel env-component">
      <div class="section-title">
        <h3>${esc(item.name)}</h3>
        <span class="state-pill ${envStateClass(item.status)}"><i class="dot"></i>${esc(item.label)}</span>
      </div>
      <p class="env-reason">${esc(item.reason || '')}</p>
      <div class="service-meta">
        <span class="meta-pill">版本 ${esc(item.version || 'unknown')}</span>
        ${item.running ? '<span class="meta-pill">运行中</span>' : ''}
        ${snow ? '<span class="meta-pill">官方完整包</span>' : item.manualOnly ? '<span class="meta-pill">手动安装</span>' : '<span class="meta-pill">安装包内置源码</span>'}
      </div>
      ${item.nextAction ? `<p class="embed-hint">下一步：${esc(item.nextAction)}</p>` : ''}
      ${item.official?.releases ? `<p class="env-link">官方：${esc(item.official.releases)}</p>` : ''}
      ${item.official?.project ? `<p class="env-link">官方：${esc(item.official.project)}</p>` : ''}
      ${snow ? '<p class="env-link">安装前必须接受官方 LICENSE 与 EULA；下载的是官方未修改完整发行版。</p><label class="env-check"><input id="accept-snowluma-license" type="checkbox"> 我已阅读并接受 SnowLuma LICENSE / EULA</label>' : ''}
      ${snow ? `<p class="env-link">LICENSE：${esc(item.official?.license || '')} · EULA：${esc(item.official?.eula || '')}</p>` : ''}
      ${auto ? `<button class="btn primary" data-env-install="${snow ? 'snowluma' : 'bridge'}" type="button">${snow ? '安装 SnowLuma 官方包' : '安装内置 qq-bridge'}</button>` : ''}
    </section>`;
}

function installTaskPanel() {
  const task = state.install.task;
  if (!task) return '';
  const active = !['completed', 'failed', 'cancelled'].includes(task.status);
  const pct = task.percent == null ? '—' : `${task.percent}%`;
  return `
    <section class="card panel" style="margin-top:16px">
      <div class="section-title"><h3>安装任务</h3><span class="state-pill ${task.status === 'completed' ? 'state-running' : task.status === 'failed' ? 'state-stopped' : 'state-degraded'}"><i class="dot"></i>${esc(task.status)}</span></div>
      <p class="env-reason">${esc(task.step || '')} · ${esc(task.component)} · ${pct}</p>
      <div class="install-bar"><i style="width:${task.percent == null ? 8 : Math.max(2, Math.min(100, task.percent))}%"></i></div>
      <div class="service-meta"><span class="meta-pill">目标：${esc(task.targetDir)}</span>${task.total ? `<span class="meta-pill">${fmtSize(task.received)} / ${fmtSize(task.total)}</span>` : ''}</div>
      ${task.error ? `<div class="notice danger">${esc(task.error)}</div>` : ''}
      <div class="backup-toolbar">
        ${active ? '<button class="btn" data-install-cancel type="button">取消安装</button>' : ''}
        ${task.status === 'failed' ? '<button class="btn primary" data-install-retry type="button">重试</button>' : ''}
        ${task.status === 'failed' ? '<button class="btn" data-install-copy-error type="button">复制失败排查提示词</button>' : ''}
        ${task.status === 'completed' && task.result?.root ? `<button class="btn primary" data-install-use type="button">${task.component === 'snowluma' ? '设为 SnowLuma 路径' : '设为 qq-bridge 路径'}</button>` : ''}
      </div>
      <pre class="install-log">${(task.logs || []).slice(-30).map((item) => esc(item.line)).join('\n') || '暂无日志'}</pre>
    </section>`;
}

function installFailurePrompt(task) {
  const name = task?.component === 'snowluma' ? 'SnowLuma' : task?.component === 'bridge' ? 'qq-bridge' : task?.component || '组件';
  const logs = (task?.logs || []).slice(-8).map((item) => `- ${item.line}`).join('\n');
  return `我的大肥鱼桌面控制中心在安装 ${name} 时失败了。请帮我排查并完成安装。

失败信息：
- 组件：${name}
- 版本：${task?.version || 'unknown'}
- 目标目录：${task?.targetDir || 'unknown'}
- 错误：${task?.error || 'unknown'}
- 最近日志：
${logs || '- 无'}

请按以下规则处理：
1. 先解释最可能的失败原因，不要直接重复安装。
2. 只使用官方来源；不要用未知镜像或来源不明的脚本。
3. SnowLuma 只能下载官方未修改完整发行版，并需要我确认 LICENSE/EULA；不要修改或再分发。
4. qq-bridge 使用官方源码；npm 安装失败时先检查 Node/npm、网络、权限和残留目录。
5. 不要向我索要 QQ 密码、B站 cookie、token 或 API Key。
6. 每一步先说明会改哪些目录/进程；需要覆盖已有目录时必须先备份并征得我确认。
7. 如果无法自动修复，请给出可复制的 PowerShell 命令和回滚方式。

不要假装安装成功；以实际检测结果为准。`;
}

function deepSeekGuidePrompt() {
  return `你是我的 Windows 11 部署助手。我要部署“大肥鱼桌面控制中心”的运行环境。

项目与组件：
- 控制中心：https://github.com/taoshur/dafiyu-qq-desktop
- SnowLuma：https://github.com/SnowLuma/SnowLuma/releases （官方 Windows 完整发行包；用户主动确认并接受 LICENSE/EULA 后，可在本项目内自动下载未修改完整包；不要修改、打包、再分发或自建镜像）
- qq-bridge：https://github.com/Derpyu520/qq-bridge （MIT；固定源码 v0.2.1-r1，下载地址 https://codeload.github.com/Derpyu520/qq-bridge/zip/refs/tags/v0.2.1-r1，SHA256 9DB4365C5816BB7FF971420423316D141B533FC66F171E2536A8B67E7D4501C9；需要 Node >=22.13 和 npm）
- DeepSeek Harness：https://deepseek.com/harness （官方桌面应用，手动安装）

请按以下规则帮助我：
1. 先检查我的 Windows 版本、CPU 架构、Node/npm/Git 版本，并说明是否满足。
2. 只使用上述官方来源。执行前先列出要下载的文件、版本、SHA256 和用途，等我确认。
3. SnowLuma 只能在用户接受官方 LICENSE/EULA 后，从官方渠道下载未修改的完整发行版并安装；不要修改、打包、再分发或自建镜像。DSH 只指导我手动安装；不要绕过登录/授权。
4. qq-bridge 可以指导下载官方源码归档、校验 SHA256、解压和 npm install；不要使用未知镜像。
5. 不要向我索要 QQ 密码、token、API Key；不要读取或上传聊天记录。
6. 每一步先说明会修改哪些目录/进程，完成后验证 package.json、src/bridge.js、node_modules、端口和配置。
7. 遇到许可证、权限、端口冲突或版本不兼容，先停下来解释，不要强行覆盖已有环境。
8. 如果你不能直接执行，请给出我可以复制到 PowerShell 的固定命令，并说明风险和回滚方式。

请从“检查环境”开始，一步一步来。`;
}

function deepSeekHelpBlock() {
  const prompt = deepSeekGuidePrompt();
  return `
    <details class="deepseek-help">
      <summary>不会部署？让 DeepSeek 按提示词帮你（可复制）</summary>
      <p class="embed-hint">把下面这段复制给 DeepSeek / DSH。它只应使用官方来源，并在执行前征求你的确认；不要在里面粘贴 token、密码或聊天记录。</p>
      <pre class="deepseek-prompt" id="deepseek-prompt">${esc(prompt)}</pre>
      <button class="btn" data-copy-deepseek type="button">复制提示词</button>
    </details>`;
}

function environmentPage() {
  const env = state.environment.status;
  if (!env) {
    return `
      <section class="card panel">
        <div class="section-title"><h3>环境安装向导</h3><span>${state.environment.busy ? '检测中…' : '尚未检测'}</span></div>
        <p class="env-reason">首次使用需要检查 SnowLuma、qq-bridge、DSH 和运行依赖。安装任务与运行状态分开管理；不会自动覆盖已有环境。</p>
        ${state.environment.error ? `<div class="notice danger">${esc(state.environment.error)}</div>` : ''}
        <div class="backup-toolbar">
          <button class="btn primary" data-env-detect type="button" ${state.environment.busy ? 'disabled' : ''}>开始检测</button>
          <span class="backup-hint">检测只读；不会安装、启动或停止任何服务</span>
        </div>
      </section>`;
  }
  const blocking = env.summary?.blocking || [];
  const manual = (env.components || []).filter((item) => item.manualOnly && ['not-installed', 'incompatible'].includes(item.status));
  return `
    <div class="notice">检测时间 ${new Date(env.checkedAt).toLocaleString()} · 正常运行 ${env.summary?.running || 0}/3。SnowLuma / qq-bridge 可在确认官方许可后自动下载安装；DSH 需要手动安装。</div>
    ${deepSeekHelpBlock()}
    <div class="grid grid-3">${(env.components || []).map(environmentCard).join('')}</div>
    ${manual.length ? `<div class="notice">${manual.map((item) => `${item.name} 需要手动安装：${item.official?.releases || item.official?.project || ''}`).join('；')}</div>` : ''}
    <div class="grid grid-2" style="margin-top:16px">
      <section class="card panel">
        <div class="section-title"><h3>运行依赖</h3><span>只检测，不把失败当未安装</span></div>
        ${(env.checks || []).map((item) => `<div class="check-row"><span class="check-icon ${item.state}">${item.state === 'ok' ? '✓' : item.state === 'warn' ? '!' : '×'}</span><div class="check-main"><h5>${esc(item.label)}</h5><p>${esc(item.detail)}${item.hint ? ` · ${esc(item.hint)}` : ''}</p></div></div>`).join('')}
      </section>
      <section class="card panel">
        <div class="section-title"><h3>安装来源</h3><span>${esc(env.network?.state || 'unknown')}</span></div>
        ${(env.network?.targets || []).map((item) => `<p class="env-link">${esc(item.label)}：${esc(item.state)} ${item.detail ? `· ${esc(item.detail)}` : ''}</p>`).join('') || '<p class="embed-hint">未检查网络</p>'}
        <p class="embed-hint">qq-bridge 使用固定版本源码归档 + SHA256 校验；不会执行来源不明的远程脚本。</p>
      </section>
    </div>
    <div class="backup-toolbar" style="margin-top:14px">
      <button class="btn primary" data-env-detect type="button" ${state.environment.busy ? 'disabled' : ''}>重新检测</button>
      ${blocking.includes('bridge') ? `<input class="input setup-input" id="install-target" value="${esc(state.install.targetDir)}" placeholder="qq-bridge 安装目录（绝对路径）"><button class="btn" data-env-install="bridge" type="button" ${state.install.busy ? 'disabled' : ''}>安装 qq-bridge</button>` : ''}
      <button class="btn ghost" data-page-jump="config" type="button">手动指定已有安装路径</button>
    </div>
    ${installTaskPanel()}`;
}

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

function logsPage() {
  const sources = state.logsList || [];
  const tabs = sources.map((source) => `
    <button class="source-tab ${source.id === state.logs.source ? 'is-active' : ''}" data-source="${source.id}" type="button">
      ${esc(source.label)}${source.exists ? '' : '（无文件）'}
    </button>`).join('');
  return `
    <div class="logs-toolbar">
      <div class="source-tabs">${tabs}</div>
      <input class="search-input" id="log-search" placeholder="搜索日志内容…" value="${esc(state.logs.query)}" />
      <select class="select" id="log-lines">
        ${[60, 120, 240, 400].map((n) => `<option value="${n}" ${n === state.logs.lines ? 'selected' : ''}>${n} 行</option>`).join('')}
      </select>
      <button class="btn" id="log-follow" type="button">跟随：${state.logs.follow ? '开' : '关'}</button>
      <button class="btn" id="log-copy" type="button">复制</button>
      <button class="btn ghost" id="log-clear" type="button">清空视图</button>
    </div>
    <section class="card log-panel">
      <div class="log-head">
        <b id="log-file">—</b>
        <span id="log-meta"></span>
        <span class="spacer"></span>
        <span>只读 · 不修改原文件</span>
      </div>
      <pre class="log-body" id="log-body"><span class="log-empty">读取中…</span></pre>
    </section>`;
}

function envPage(snapshot) {
  const checks = snapshot.env || [];
  const bad = checks.filter((c) => c.state === 'bad').length;
  const warn = checks.filter((c) => c.state === 'warn').length;
  const rows = checks.map((item) => `
    <div class="check-row">
      <span class="check-icon ${item.state}">${item.state === 'ok' ? '✓' : item.state === 'warn' ? '!' : '×'}</span>
      <div class="check-main">
        <h5>${esc(item.label)}</h5>
        <p>${esc(item.detail)}</p>
        ${item.hint ? `<div class="check-hint">${esc(item.hint)}</div>` : ''}
      </div>
    </div>`).join('');
  return `
    <div class="hero-chips" style="margin-bottom:14px">
      <span class="chip">共 <b>${checks.length}</b> 项</span>
      <span class="chip">正常 <b>${checks.length - bad - warn}</b></span>
      <span class="chip">注意 <b>${warn}</b></span>
      <span class="chip">异常 <b>${bad}</b></span>
    </div>
    <section class="card">${rows || '<div class="log-empty" style="padding:20px">尚未检测</div>'}</section>`;
}

function configPage(snapshot) {
  const cfg = snapshot.config || {};
  const ports = cfg.ports || {};
  const flags = cfg.flags || {};
  const paths = cfg.paths || {};
  const yes = (value) => (value ? '是' : '否');
  return `
    <div class="notice">只读视图：不会显示任何令牌/凭据值，也不会在这里修改 config.json。需要改配置请先备份，再使用外部编辑器。</div>
    <section class="card panel" style="margin-top:14px">
      <div class="section-title"><h3>桌面路径设置</h3><span>只写桌面自己的配置，不修改 qq-bridge/config.json</span></div>
      <div class="memory-filters">
        <input class="input" id="cfg-ownerTitle" style="min-width:240px" maxlength="16" placeholder="大肥鱼对您的称呼（默认：爸爸）" value="${esc(state.settings?.ownerTitle || '爸爸')}" />
        <input class="input" id="cfg-repoRoot" style="min-width:360px" value="${esc(state.settings?.repoRoot || snapshot.paths.repoRoot)}" />
        <input class="input" id="cfg-snowlumaRoot" style="min-width:240px" value="${esc(state.settings?.snowlumaRoot || snapshot.paths.snowlumaRoot)}" />
        <input class="input" id="cfg-dshExe" style="min-width:360px" value="${esc(state.settings?.dshExe || snapshot.paths.dshExe)}" />
        <button class="btn primary" id="cfg-save-paths" type="button">保存桌面设置</button>
      </div>
      <p class="service-detail">修改后可重新检测环境；不会自动启动或重启任何服务。</p>
    </section>
    <div class="section-title" style="margin-top:16px"><h3>项目配置（只读）</h3><span>来自项目 config.json</span></div>
    <div class="section-title" style="margin-top:16px"><h3>端口</h3><span>来自项目 config.json</span></div>
    <div class="kv-grid">
      <div class="kv"><span>SnowLuma HTTP</span><b>${ports.snowlumaHttp || '—'}</b></div>
      <div class="kv"><span>SnowLuma WS</span><b>${ports.snowlumaWs || '—'}</b></div>
      <div class="kv"><span>DSH 中继</span><b>${ports.dshRelay || '—'}</b></div>
      <div class="kv"><span>桥接控制台</span><b>${ports.console || '—'}</b></div>
    </div>
    <div class="section-title" style="margin-top:18px"><h3>运行开关</h3><span>只显示布尔状态</span></div>
    <div class="kv-grid">
      <div class="kv"><span>观察模式（不自动写入）</span><b>${yes(flags.observeOnly)}</b></div>
      <div class="kv"><span>语音能力</span><b>${yes(flags.voiceEnabled)}</b></div>
      <div class="kv"><span>DSH 允许远程</span><b>${yes(flags.allowRemote)}</b></div>
      <div class="kv"><span>ownerQQ 已配置</span><b>${yes(flags.hasOwnerQQ)}</b></div>
      <div class="kv"><span>SnowLuma 令牌</span><b>${yes(flags.hasSnowlumaToken)}</b></div>
      <div class="kv"><span>控制台令牌</span><b>${yes(flags.hasConsoleToken)}（未配置时自动生成）</b></div>
    </div>
    <div class="section-title" style="margin-top:18px"><h3>长期记忆</h3><span>只读；真实记忆不在这里修改</span></div>
    <div class="kv-grid">
      <div class="kv"><span>观察模式</span><b>${yes(cfg.memory?.observeOnly)}</b></div>
      <div class="kv"><span>检索注入</span><b>${yes(cfg.memory?.retrieval)}</b></div>
      <div class="kv"><span>自动抽取</span><b>${yes(cfg.memory?.extract)}</b></div>
      <div class="kv"><span>消息入库</span><b>${yes(cfg.memory?.ingest)}</b></div>
      <div class="kv"><span>数据库</span><b>${esc(cfg.memory?.dbPath || 'state/memory.db')}</b></div>
      <div class="kv"><span>抽取模型</span><b>${esc(cfg.memory?.model || '—')}</b></div>
    </div>
    <div class="section-title" style="margin-top:18px"><h3>模型与连接（脱敏）</h3><span>只显示是否存在，不显示密钥</span></div>
    <div class="kv-grid">
      <div class="kv"><span>API 主机</span><b>${esc(cfg.memory?.apiHost || '—')}</b></div>
      <div class="kv"><span>API Key</span><b>${cfg.memory?.hasApiKey ? '已配置（隐藏）' : '未配置'}</b></div>
      <div class="kv"><span>ownerQQ</span><b>${cfg.memory?.ownerConfigured ? '已配置（隐藏）' : '未配置'}</b></div>
      <div class="kv"><span>语音</span><b>${cfg.memory?.voiceEnabled ? '开启' : '关闭'}</b></div>
    </div>
    <div class="section-title" style="margin-top:18px"><h3>路径</h3><span>只读</span></div>
    <div class="kv-grid">
      <div class="kv"><span>SnowLuma 主目录</span><b>${esc(paths.snowlumaHome || '—')}</b></div>
      <div class="kv"><span>成长数据库</span><b>${esc(paths.growthDb || 'state/memory.db')}</b></div>
      <div class="kv"><span>语音目录</span><b>${esc(paths.voiceDir || '—')}</b></div>
      <div class="kv"><span>项目根目录</span><b>${esc(snapshot.paths.repoRoot)}</b></div>
    </div>`;
}

function maskQq(value) {
  const s = String(value || '');
  return /^\d{5,12}$/.test(s) ? `QQ***${s.slice(-4)}` : s;
}

function memoryDate(item) {
  const t = item.happened_at || item.created_at;
  return fmtTime(t);
}

function memoryKindLabel(kind) {
  if (kind === 'fact') return '事实';
  if (kind === 'event') return '事件';
  return kind || '—';
}

function memoryStatusLabel(status) {
  if (status === 'pending') return '待确认';
  if (status === 'applied') return '已采纳';
  if (status === 'rejected') return '已拒绝';
  return status || '—';
}

function memoryQualityLabel(quality) {
  if (quality === 'valid') return '校验通过';
  if (quality === 'invalid') return '校验未通过';
  return quality || '—';
}

function memoryScopeLabel(scope) {
  const text = String(scope || '');
  if (text.startsWith('group:')) return `群聊 ${text.slice(6)}`;
  if (text.startsWith('private:')) return `私聊 ${text.slice(8)}`;
  if (text === 'global') return '全局';
  return text || '—';
}

function memoryTimePrecisionLabel(precision) {
  if (precision === 'exact') return '时间明确';
  if (precision === 'day') return '只到日期';
  if (precision === 'approx') return '大概时间';
  return precision || '—';
}

function fmtBiliDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return '—';
  const mins = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function fmtBiliView(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万播放`;
  return `${n} 播放`;
}

function biliKindLabel(kind) {
  if (kind === 'info') return '看了视频';
  if (kind === 'subtitle') return '读了字幕';
  return kind || '活动';
}

function biliPromptText(watchLog = '') {
  const repoRoot = String(watchLog || '').replace(/[\\/]state[\\/]bili-watch\.jsonl$/i, '') || '<qq-bridge 路径>';
  return `你是我的 Windows 部署助手。我要让“大肥鱼”在 DeepSeek Harness 里能刷 B 站。

当前环境：
- qq-bridge 已安装在：${repoRoot}
- B 站 MCP 工具在：${repoRoot}\\tools\\bilibili-mcp
- 我需要让大肥鱼能搜索视频、看热门/排行、读视频详情和字幕，并在控制中心看到观看台账。

请按以下规则帮我：
1. 先检查 Python 3.10+、qq-bridge 的 tools/bilibili-mcp/requirements.txt 和现有 DSH profile，不要覆盖已有 MCP 配置。
2. 需要安装依赖时，在 qq-bridge 下创建独立 venv（如 tools/bili-venv），不要用系统 Python 污染环境。
3. 在 DSH 的 cordis.patch.yml 里增加/修正 bilibili MCP server，指向 mcp_server.py，并设置 BILI_MCP_TOOLS；修改前备份。
4. 不要向我索要 B站 cookie、SESSDATA 或扫码内容；登录二维码由我自己扫。
5. 不要修改 B站 MCP 的源码，不要上传凭据或聊天记录。
6. 配置完成后重启 DSH，让我先测试 bili_hot_videos / bili_search；再测试 bili_login 扫码和 bili_check_credential。
7. 如果无法直接修改，请给出可复制的命令和配置片段，并说明回滚方式。

不要假装已经完成；每一步都以实际检测结果为准。`;
}

function biliPage() {
  const b = state.bili;
  if (b.error) return `<div class="notice danger">B站活动读取失败：${esc(b.error)}</div>`;
  const s = b.status;
  if (!s) return '<div class="log-empty" style="padding:30px">正在读取 B 站活动…</div>';
  const entries = s.entries || [];
  const rows = entries.map((item) => {
    const meta = [item.author, fmtBiliDuration(item.duration), fmtBiliView(item.view)].filter(Boolean).join(' · ');
    return `<tr>
      <td>${esc(fmtTime(item.at))}</td>
      <td><span class="tag">${esc(biliKindLabel(item.kind))}</span></td>
      <td><b>${esc(item.title || '（无标题）')}</b><span class="memory-detail">${esc(item.bvid || '')}${meta ? ` · ${esc(meta)}` : ''}</span></td>
      <td>${esc(item.bvid || '—')}</td>
    </tr>`;
  }).join('');
  const mcpReady = s.mcp?.serverExists;
  const configured = s.mcp?.configured;
  const loggedIn = s.credential?.loggedIn;
  return `
    <div class="notice">${loggedIn
      ? '大肥鱼的 B 站 MCP 已登录。这里显示本机观看台账，不是 B 站账号的公开历史。'
      : '大肥鱼的 B 站 MCP 还没有登录。热榜/搜索/详情通常可用；字幕、评论、回复等需要它自己扫码登录。'}</div>
    <div class="grid grid-4 memory-stats">
      <section class="card stat"><span>累计记录</span><b>${s.counts.total}</b><small>本机台账条数</small></section>
      <section class="card stat"><span>今天</span><b class="${s.counts.today ? 'ok' : ''}">${s.counts.today}</b><small>今天的观看/读字幕记录</small></section>
      <section class="card stat"><span>看过的视频</span><b>${s.counts.videos}</b><small>按 BV 号去重</small></section>
      <section class="card stat"><span>登录状态</span><b class="${loggedIn ? 'ok' : 'warn'}">${loggedIn ? '已登录' : '未登录'}</b><small>${s.mcp?.serverExists ? (configured ? 'MCP 已配置' : 'MCP 未配置') : 'MCP 未安装'}</small></section>
    </div>
    <div class="notice" style="margin-top:12px">最近一次活动：${s.lastAt ? esc(fmtTime(s.lastAt)) : '还没有记录'} · 观看台账：${esc(s.watchLog || '未找到')}</div>
    <div class="backup-toolbar">
      <button class="btn primary" id="bili-refresh" type="button" ${b.busy ? 'disabled' : ''}>刷新</button>
      <button class="btn" id="bili-copy-prompt" type="button">复制“接入 B 站”提示词</button>
      <span class="backup-hint">桌面只读台账，不控制 B 站账号，也不读取 cookie</span>
    </div>
    <section class="card panel" style="margin-top:14px">
      <div class="section-title"><h3>它最近看了什么</h3><span>按本机时间倒序</span></div>
      <div class="memory-table-wrap">
        <table class="table">
          <thead><tr><th>时间</th><th>动作</th><th>内容</th><th>BV 号</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" class="log-empty">还没有观看记录。大肥鱼查看视频详情或读字幕时才会写入这里；只看热榜/搜索时，当前 B 站 MCP 不一定记账。</td></tr>'}</tbody>
        </table>
      </div>
    </section>
    <section class="card panel" style="margin-top:14px">
      <div class="section-title"><h3>接入状态</h3><span>只检测，不自动改 DSH 配置</span></div>
      <div class="check-row"><span class="check-icon ${mcpReady ? 'ok' : 'bad'}">${mcpReady ? '✓' : '×'}</span><div class="check-main"><h5>B 站 MCP 工具</h5><p>${mcpReady ? '已找到 tools/bilibili-mcp/mcp_server.py' : '没有找到 tools/bilibili-mcp，需要先安装/更新 qq-bridge 的 B 站工具'}</p></div></div>
      <div class="check-row"><span class="check-icon ${configured ? 'ok' : 'warn'}">${configured ? '✓' : '!'}</span><div class="check-main"><h5>DSH 接入</h5><p>${configured ? `已在 profile 中发现 bilibili MCP：${esc((s.mcp.profiles || []).join('、'))}` : 'DSH 的 cordis.patch.yml 里还没有发现 bilibili MCP'}</p></div></div>
      <div class="check-row"><span class="check-icon ${loggedIn ? 'ok' : 'warn'}">${loggedIn ? '✓' : '!'}</span><div class="check-main"><h5>B 站登录</h5><p>${loggedIn ? '本机已有有效凭证；不会在界面显示 cookie' : '还没有本机凭证；让大肥鱼调用 bili_login 生成二维码，你自己扫码'}</p></div></div>
      <details class="deepseek-help" style="margin-top:12px">
        <summary>让大肥鱼刷 B 站：手动接入步骤</summary>
        <ol class="wizard-list">
          <li>确认 qq-bridge 的 <code>tools/bilibili-mcp</code> 存在；需要 Python 3.10+。</li>
          <li>在 qq-bridge 下创建独立 venv：<code>tools\\bili-venv</code>，安装 <code>tools\\bilibili-mcp\\requirements.txt</code>。</li>
          <li>在 DSH profile 的 <code>cordis.patch.yml</code> 添加 bilibili MCP server，指向 <code>mcp_server.py</code>，并配置 <code>BILI_MCP_TOOLS</code>。</li>
          <li>重启 DSH；让大肥鱼先测试 <code>bili_hot_videos</code> / <code>bili_search</code>。</li>
          <li>需要字幕/评论时，让它调用 <code>bili_login</code>，你扫码后再调用 <code>bili_check_credential</code>。</li>
        </ol>
        <p class="embed-hint">桌面不会自动改 DSH 配置；点上面的按钮复制完整提示词给 DeepSeek，让它帮你按现有环境完成接入。</p>
      </details>
    </section>`;
}

function memoryPage() {
  const m = state.memory;
  const status = m.status;
  if (m.error) {
    return `<div class="notice danger">记忆读取失败：${esc(m.error)}</div>`;
  }
  if (!status) return '<div class="log-empty" style="padding:30px">正在读取长期记忆…</div>';
  const counts = status.counts || {};
  const modeTest = m.mode === 'test';
  const rows = m.list?.rows || [];
  const sourceLabel = modeTest ? '练习副本' : '真实记忆（只读）';
  const testExists = status.testDbExists;
  const reviewDisabled = !modeTest || !m.selected;
  const table = rows.map((item) => {
    const id = Number(item.id);
    const kind = item.kind || item.type;
    const subject = item.subject_name || maskQq(item.subject_qq) || '—';
    const title = item.summary || item.value || item.attr || '（无标题）';
    const detail = item.detail ? ` · ${String(item.detail).slice(0, 60)}` : '';
    const date = memoryDate(item);
    const confidence = Number(item.confidence);
    const tags = [
      item.scope ? `<span class="meta-pill">${esc(memoryScopeLabel(item.scope))}</span>` : '',
      item.visibility ? `<span class="meta-pill">${esc(item.visibility === 'public' ? '群内可见' : item.visibility === 'private' ? '仅自己可见' : item.visibility)}</span>` : '',
      item.time_precision ? `<span class="meta-pill">${esc(memoryTimePrecisionLabel(item.time_precision))}</span>` : '',
      item.status ? `<span class="meta-pill">${esc(memoryStatusLabel(item.status))}</span>` : '',
      item.quality ? `<span class="meta-pill">${esc(memoryQualityLabel(item.quality))}</span>` : '',
      item.lifecycle_state ? `<span class="meta-pill">${item.lifecycle_state === 'archived' ? '已归档' : item.lifecycle_state === 'dormant' ? '休眠' : '活跃'}</span>` : ''
    ].filter(Boolean).join(' ');
    return `<tr class="memory-row ${Number(m.selected) === id ? 'is-selected' : ''}" data-memory-id="${id}" data-memory-kind="${esc(kind)}">
      <td><span class="tag">${esc(memoryKindLabel(kind))}</span></td>
      <td><b>${esc(title)}</b><span class="memory-detail">${esc(detail)}</span></td>
      <td>${esc(subject)}</td>
      <td>${esc(date)}</td>
      <td>${Number.isFinite(confidence) ? confidence.toFixed(2) : '—'}</td>
      <td>${tags}</td>
    </tr>`;
  }).join('');

  const selected = m.detail?.candidate || null;
  const evidence = m.detail?.evidence || [];
  const detailHtml = !selected ? '<div class="log-empty" style="padding:20px">选择一条记忆查看来源与证据</div>' : `
    <div class="memory-detail-head">
      <span class="tag">${esc(memoryKindLabel(selected.kind))}</span>
      <b>${esc(selected.summary || selected.value || selected.attr || `候选 #${selected.id}`)}</b>
      <span class="meta-pill">${esc(memoryStatusLabel(selected.status))}</span>
    </div>
    <div class="kv-grid">
      <div class="kv"><span>涉及谁</span><b>${esc(selected.subject_name || maskQq(selected.subject_qq) || '—')}</b></div>
      <div class="kv"><span>可信度</span><b>${esc(selected.confidence ?? '—')}</b></div>
      <div class="kv"><span>生效范围</span><b>${esc(memoryScopeLabel(selected.scope))}</b></div>
      <div class="kv"><span>可见范围</span><b>${esc(selected.visibility || '—')}</b></div>
      <div class="kv"><span>发生时间</span><b>${esc(selected.happened_at ? fmtTime(selected.happened_at) : '—')}</b></div>
      <div class="kv"><span>时间准确度</span><b>${esc(memoryTimePrecisionLabel(selected.time_precision))}</b></div>
      <div class="kv"><span>质量检查</span><b>${esc(memoryQualityLabel(selected.quality))}</b></div>
      <div class="kv"><span>记忆状态</span><b>${selected.lifecycle_state === 'archived' ? '已归档（仍可检索）' : selected.lifecycle_state === 'dormant' ? '休眠' : '活跃'}</b></div>
      <div class="kv"><span>活跃度</span><b>${selected.activation == null ? '—' : Number(selected.activation).toFixed(2)}</b></div>
      <div class="kv"><span>重要度</span><b>${selected.importance == null ? '—' : Number(selected.importance).toFixed(2)}</b></div>
      <div class="kv"><span>不采纳原因</span><b>${esc(selected.reason || '—')}</b></div>
    </div>
    ${selected.detail ? `<p class="service-detail">${esc(selected.detail)}</p>` : ''}
    <div class="section-title" style="margin-top:14px"><h3>来源消息</h3><span>仅在本机显示，不导出</span></div>
    ${evidence.length ? evidence.map((msg) => `
      <div class="memory-evidence">
        <span class="meta-pill">${msg.is_self ? '大肥鱼' : msg.is_owner ? '你' : '其他人'}</span>
        <span class="meta-pill">${esc(msg.sender_name || maskQq(msg.sender_qq) || '—')}</span>
        <span class="meta-pill">${fmtTime(msg.sent_at)}</span>
        <p>${esc(msg.text || msg.media_note || '（无文本）')}</p>
      </div>`).join('') : '<div class="log-empty" style="padding:12px">这条候选找不到原始消息（可能来自练习副本或旧数据）</div>'}
    ${modeTest ? `<div class="flow-actions" style="margin-top:14px">
      <button class="btn primary" data-memory-review="apply" data-memory-id="${selected.id}" type="button">确认并写入练习副本</button>
      <button class="btn danger" data-memory-review="reject" data-memory-id="${selected.id}" type="button">不记住这条</button>
    </div>` : '<div class="notice" style="margin-top:14px">真实记忆只能看，不能在这里批准或删除。想练习审核，请切换到「练习副本」。</div>'}
  `;

  return `
    <div class="notice">${modeTest ? '你正在看「练习副本」：这里的批准/拒绝只影响练习数据，不会改动真实记忆。' : '你正在看真实记忆：只能阅读，不能修改、删除或批准。想练习审核，请切换到「练习副本」。'}</div>
    <p class="service-detail" style="margin:8px 0 0">这里不是聊天记录，而是大肥鱼对人和事形成的长期印象。AI 先把它觉得值得记的内容放进「待确认」，确认后才会成为正式事实或事件。</p>
    <div class="memory-toolbar" style="margin-top:12px">
      <div class="segmented">
        <button class="btn ${m.mode === 'prod' ? 'primary' : ''}" data-memory-mode="prod" type="button">真实记忆（只读）</button>
        <button class="btn ${m.mode === 'test' ? 'primary' : ''}" data-memory-mode="test" type="button">练习副本</button>
      </div>
      <span class="meta-pill">${sourceLabel}</span>
      ${modeTest && !testExists ? '<button class="btn" id="memory-init-test" type="button">创建练习副本</button>' : ''}
      <button class="btn" id="memory-refresh" type="button">刷新</button>
    </div>
    <div class="grid grid-4 memory-stats">
      <section class="card stat"><span>观察模式</span><b class="${status.observeOnly ? 'warn' : 'ok'}">${status.observeOnly ? '开启' : '关闭'}</b><small>${status.observeOnly ? '只生成候选，不自动写入' : '会自动写入正式记忆'} · 检索${status.retrieval ? '已开启' : '关闭'}</small></section>
      <section class="card stat"><span>已确认事实 / 已记录事件</span><b>${counts.facts} / ${counts.events}</b><small>已生效事实 / 已记录事件</small></section>
      <section class="card stat"><span>待你确认</span><b class="${counts.pending ? 'warn' : ''}">${counts.pending}</b><small>其中已采纳 ${counts.applied} 条</small></section>
      <section class="card stat"><span>数据库自检</span><b class="${status.integrity === 'ok' ? 'ok' : 'warn'}">${status.integrity === 'ok' ? '正常' : '需检查'}</b><small>数据库 ${fmtSize(status.file.size)} + 写日志 ${fmtSize(status.wal.size)}</small></section>
    </div>
    <div class="notice" style="margin-top:12px">数据库位置：${esc(status.dbPath)} ${status.error ? ` · 读取错误：${esc(status.error)}` : ''}</div>
    <section class="card panel" style="margin-top:14px">
      <div class="section-title"><h3>查找记忆</h3><span>当前查看：${sourceLabel}</span></div>
      <div class="memory-filters">
        <div class="segmented">
          ${['candidates', 'events', 'facts'].map((t) => `<button class="btn ${m.type === t ? 'primary' : ''}" data-memory-type="${t}" type="button">${t === 'candidates' ? '待确认候选' : t === 'events' ? '已记录事件' : '已确认事实'}</button>`).join('')}
        </div>
        <input id="memory-search" class="input" placeholder="搜索内容、人物或关键词" value="${esc(m.q)}" />
        <input id="memory-from" class="input" type="date" value="${esc(m.dateFrom)}" title="起始日期" />
        <input id="memory-to" class="input" type="date" value="${esc(m.dateTo)}" title="结束日期" />
        ${m.type === 'candidates' ? `<select id="memory-status" class="input">
          <option value="pending" ${m.status === 'pending' ? 'selected' : ''}>待确认</option>
          <option value="applied" ${m.status === 'applied' ? 'selected' : ''}>已采纳</option>
          <option value="rejected" ${m.status === 'rejected' ? 'selected' : ''}>已拒绝</option>
        </select>` : ''}
        <button class="btn primary" id="memory-apply-filters" type="button">筛选</button>
        <button class="btn" id="memory-reset-filters" type="button">重置</button>
      </div>
      <div class="memory-result-meta">共 ${m.list?.total ?? 0} 条，显示 ${rows.length} 条 · 排序：${m.type === 'events' ? '按发生时间' : m.type === 'facts' ? '按更新时间' : '按产生/发生时间'}</div>
      <div class="memory-table-wrap">
        <table class="table memory-table">
          <thead><tr><th>会变成</th><th>内容</th><th>涉及谁</th><th>时间</th><th>可信度</th><th>范围 / 状态</th></tr></thead>
          <tbody>${table || '<tr><td colspan="6" class="log-empty">没有匹配记录</td></tr>'}</tbody>
        </table>
      </div>
    </section>
    <section class="card panel" style="margin-top:14px">
      <div class="section-title"><h3>这条记忆的详情</h3><span>${modeTest ? '可在练习副本中操作' : '真实记忆只读'}</span></div>
      ${detailHtml}
    </section>`;
}

function backupsPage() {
  const list = state.backups || [];
  const rows = list.map((item) => `
    <tr>
      <td>${esc(item.name)}</td>
      <td>${fmtSize(item.size)}</td>
      <td>${fmtTime(item.mtimeMs)}</td>
      <td>
        ${item.desktop ? '<span class="tag mem">桌面备份</span>' : ''}
        ${item.manifest ? '<span class="tag man">manifest</span>' : ''}
        ${item.manifest && item.manifest.sqlite ? '<span class="tag">SQLite</span>' : ''}
      </td>
      <td><span class="meta-pill">${esc(item.root.includes('D:') ? 'D 盘' : '备份目录')}</span></td>
      <td class="row-actions">
        ${item.desktop ? `<button class="btn" data-verify="${esc(item.dir)}" type="button">校验</button>
        <button class="btn ghost" data-restore="${esc(item.dir)}" type="button">恢复演练</button>` : ''}
        ${item.desktop ? '' : '<button class="btn ghost" disabled title="只支持桌面备份的恢复演练">恢复</button>'}
      </td>
    </tr>`).join('');
  return `
    <div class="notice">备份使用 SQLite <code>VACUUM INTO</code> 一致性快照（包含 WAL 中已提交的数据），<b>不会</b>直接复制运行中的 memory.db；不包含日志、模型与音频。恢复功能暂未开放。</div>
    <div class="backup-toolbar">
      <button class="btn primary" id="backup-create" type="button" ${state.backupBusy ? 'disabled' : ''}>${state.backupBusy ? '备份中…' : '立即备份'}</button>
      <button class="btn" id="backup-refresh" type="button">刷新列表</button>
      <span class="backup-hint">${esc(state.backupHint || '建议在改动配置或升级前备份一次')}</span>
    </div>
    <section class="card" style="padding:6px 14px 10px">
      <table class="table">
        <thead><tr><th>备份目录</th><th>大小</th><th>时间</th><th>内容</th><th>位置</th><th>操作</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="log-empty">还没有备份，点「立即备份」生成第一份</td></tr>'}</tbody>
      </table>
    </section>`;
}

function updatePanel() {
  const u = state.update;
  const check = u.check;
  const task = u.task;
  const downloading = task && !['completed', 'failed', 'cancelled'].includes(task.status);
  return `
    <section class="card panel" style="margin-top:16px">
      <div class="section-title"><h3>检查更新</h3><span>从 GitHub Releases 读取，不自动安装</span></div>
      <div class="kv-grid">
        <div class="kv"><span>当前版本</span><b>${esc(state.info?.version || '—')}</b></div>
        <div class="kv"><span>最新版本</span><b>${esc(check?.latestVersion || '—')}</b></div>
      </div>
      ${u.error ? `<div class="notice danger">检查更新失败：${esc(u.error)}</div>` : ''}
      ${check && !check.ok ? `<div class="notice danger">${esc(check.error || '无法获取最新版本')}</div>` : ''}
      ${check?.ok && check.available ? `<div class="notice">发现新版本 <b>${esc(check.latestVersion)}</b>。安装包来自 GitHub Release，会先校验 SHA256，再打开安装程序。</div>` : ''}
      ${check?.ok && !check.available ? '<p class="embed-hint">当前已经是最新版本。</p>' : ''}
      ${downloading ? `<div class="install-bar"><i style="width:${task.percent || 0}%"></i></div><p class="embed-hint">正在下载 ${esc(task.latestVersion || '')} · ${task.percent == null ? '—' : `${task.percent}%`} · ${fmtSize(task.received)} / ${fmtSize(task.total)}</p>` : ''}
      ${task?.status === 'failed' ? `<div class="notice danger">更新下载失败：${esc(task.error || '未知错误')}</div>` : ''}
      ${task?.status === 'cancelled' ? '<div class="notice">更新下载已取消。</div>' : ''}
      <div class="backup-toolbar">
        <button class="btn ${check?.available ? '' : 'primary'}" id="update-check" type="button" ${u.busy || downloading ? 'disabled' : ''}>${u.busy ? '检查中…' : '检查更新'}</button>
        ${check?.available ? `<button class="btn primary" id="update-download" type="button" ${downloading ? 'disabled' : ''}>下载并打开安装包</button>` : ''}
        ${check?.releaseUrl ? `<button class="btn ghost" id="update-release" type="button">打开发布页</button>` : ''}
      </div>
      <p class="embed-hint">不静默安装、不替换正在运行的程序；安装完成后需要你手动重启控制中心。</p>
    </section>`;
}

function aboutPage() {
  const info = state.info || {};
  return `
    <section class="card about-hero">
      <img src="assets/deepseek-chan.png" alt="" />
      <div>
        <h3>大肥鱼 · 桌面控制台</h3>
        <p>版本 ${esc(info.version || '0.1.0')} · 阶段 ${esc(info.phase || 'phase-2-mock')}<br/>
        Electron ${esc(info.electron || '—')} · Chromium ${esc(info.chrome || '—')} · Node ${esc(info.node || '—')}</p>
        <p style="margin-top:10px">一个只负责「看着家」的桌面外壳：启动管理、状态监控、日志、体检与备份。机器人核心仍是 SnowLuma + qq-bridge + DSH，本软件不改写它们。</p>
      </div>
    </section>
    <div class="grid grid-2" style="margin-top:16px">
      <section class="card panel">
        <div class="section-title"><h3>安全原则</h3></div>
        <div class="principle"><b>不执行任意命令</b><span>所有进程操作使用固定可执行文件 + 固定参数，渲染进程无法传入 shell 命令。</span></div>
        <div class="principle"><b>不碰生产数据</b><span>只读检测；配置与数据库写入要等后续阶段单独批准。</span></div>
        <div class="principle"><b>不按名字杀进程</b><span>只停止自己记录过、且命令行指纹匹配的 PID。</span></div>
        <div class="principle"><b>凭据不出主进程</b><span>config.json 只读取端口/开关，不把令牌传给界面或写入日志。</span></div>
      </section>
      <section class="card panel">
        <div class="section-title"><h3>阶段路线</h3></div>
        <div class="principle"><b>已完成</b><span>只读摸底、架构与数据清单、外壳方案。</span></div>
        <div class="principle"><b>当前</b><span>第三阶段第二步：真实服务控制代码完成，默认关闭；进程归属、supervisor/watchdog 协调、优雅停止已实现并经隔离测试。</span></div>
        <div class="principle"><b>下一阶段</b><span>首次真实操作的审批与验证；数据恢复；自定义路径；安装包。</span></div>
        <div class="principle"><b>未验证</b><span>真实 QQ 收发、TTS/RVC/ASR、DSH 会话；本阶段不把它们当作已验证。</span></div>
      </section>
    </div>
    <section class="card panel" style="margin-top:16px">
      <div class="section-title"><h3>署名与许可</h3></div>
      <p class="embed-hint">SnowLuma 由 SnowLumaDevs 开发；本项目已获其书面授权，在非商业开源范围内启动/停止用户自行安装的官方 SnowLuma、并内嵌访问本机 WebUI。</p>
      <p class="embed-hint">官方项目：https://github.com/SnowLuma/SnowLuma · LICENSE：https://github.com/SnowLuma/SnowLuma/blob/main/LICENSE · EULA：https://github.com/SnowLuma/SnowLuma/blob/main/EULA.md</p>
      <p class="embed-hint">本项目代码使用 PolyForm Noncommercial 1.0.0，仅允许非商业用途；SnowLuma 仍受其自身许可约束。</p>
    </section>
    <section class="card panel" style="margin-top:16px">
      <div class="section-title"><h3>本机路径</h3><span>可在设置中修改</span></div>
      <div class="kv-grid">
        <div class="kv"><span>桌面配置</span><b>${esc(info.paths?.config || '—')}</b></div>
        <div class="kv"><span>桌面日志</span><b>${esc(info.paths?.logs || '—')}</b></div>
      </div>
    </section>
    ${updatePanel()}`;
}

function render() {
  const meta = PAGE_META[state.page] || PAGE_META.overview;
  $('page-title').textContent = meta[0];
  $('page-subtitle').textContent = meta[1];
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.page === state.page);
  });

  const on = Boolean(state.control?.enabled);
  const safeMode = Boolean(state.info?.safeMode);
  const pill = document.getElementById('mode-pill');
  if (pill) {
    pill.textContent = safeMode ? '安全模式' : on ? '控制：开启' : '控制：关闭';
    pill.classList.toggle('control-off', !on);
    pill.classList.toggle('control-on', on);
  }

  const view = $('view');
  if (state.error) {
    view.innerHTML = `<div class="card panel"><div class="section-title"><h3>检测失败</h3></div><p class="service-detail">${esc(state.error)}</p></div>`;
    return;
  }

  const snapshot = state.snap;
  if (!snapshot && !['setup', 'environment', 'bilibili'].includes(state.page)) {
    view.innerHTML = '<div class="log-empty" style="padding:30px">正在读取运行状态…</div>';
    return;
  }

  let html = '';
  if (state.page === 'overview') html = overview(snapshot);
  else if (state.page === 'services') html = servicesPage(snapshot);
  else if (state.page === 'embed') html = embedPage(snapshot);
  else if (state.page === 'setup') html = setupPage();
  else if (state.page === 'environment') html = environmentPage();
  else if (state.page === 'bilibili') html = biliPage();
  else if (state.page === 'startup') html = startupPage();
  else if (state.page === 'logs') html = logsPage();
  else if (state.page === 'env') html = envPage(snapshot);
  else if (state.page === 'config') html = configPage(snapshot);
  else if (state.page === 'memory') html = memoryPage();
  else if (state.page === 'backups') html = backupsPage();
  else html = aboutPage();

  const pageChanged = state.lastRenderedPage !== state.page;
  if (state.update.check?.available && state.page !== 'about') {
    html = `<div class="notice">发现新版本 <b>${esc(state.update.check.latestVersion)}</b>，可以到「关于」页检查并更新。<button class="btn" id="update-go-about" type="button" style="margin-left:10px">查看更新</button></div>${html}`;
  }
  view.innerHTML = html;
  if (pageChanged) {
    view.classList.remove('fade-in');
    void view.offsetWidth;
    view.classList.add('fade-in');
    state.lastRenderedPage = state.page;
  }

  if (state.page === 'overview') loadRecentLog();
  if (state.page === 'logs') {
    renderLogBody();
    loadLogs();
  }
  if (state.page === 'embed') setTimeout(() => { placeEmbed(); }, 0);
}

async function loadRecentLog() {
  try {
    const result = await api.logsTail({ source: 'bridge', lines: 6 });
    const target = $('recent-log');
    if (!target) return;
    if (!result.exists) {
      target.textContent = '还没有 bridge.log（桥接尚未启动过）';
      return;
    }
    target.textContent = (result.lines || []).join('\n') || '（空）';
    target.scrollTop = target.scrollHeight;
  } catch (error) {
    const target = $('recent-log');
    if (target) target.textContent = `读取失败：${error.message}`;
  }
}

function highlight(line) {
  const escaped = esc(line);
  const query = state.logs.query.trim();
  if (!query) return escaped;
  try {
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return escaped.replace(pattern, (match) => `<mark>${match}</mark>`);
  } catch {
    return escaped;
  }
}

function renderLogBody() {
  const body = $('log-body');
  if (!body) return;
  const data = state.logs.data;
  if (!data) {
    body.innerHTML = '<span class="log-empty">读取中…</span>';
    return;
  }
  if (!data.exists) {
    body.innerHTML = `<span class="log-empty">日志文件尚未生成：${esc(data.file)}</span>`;
    return;
  }
  if (state.logs.viewCleared) {
    body.innerHTML = '<span class="log-empty">视图已清空（原文件未改动）。点「跟随」或切换来源可重新读取。</span>';
    return;
  }
  const query = state.logs.query.trim().toLowerCase();
  const lines = (data.lines || []).filter((line) => !query || line.toLowerCase().includes(query));
  if (!lines.length) {
    body.innerHTML = `<span class="log-empty">${query ? '没有匹配的行' : '（空）'}</span>`;
    return;
  }
  body.innerHTML = lines.map((line, index) => {
    const cls = /error|失败|异常|fatal|exception/i.test(line) ? 'err'
      : /warn|警告|超时|timeout/i.test(line) ? 'warn'
        : /info|在线|已启动|connected/i.test(line) ? 'info' : '';
    return `<span class="log-line ${cls}"><span class="ln">${index + 1}</span>${highlight(line)}</span>`;
  }).join('');
  const meta = $('log-meta');
  if (meta) meta.textContent = `${fmtSize(data.size)} · ${fmtTime(data.mtimeMs)} · 显示 ${lines.length} 行${data.truncated ? '（已截断）' : ''}`;
  const file = $('log-file');
  if (file) file.textContent = data.file;
  if (state.logs.follow) body.scrollTop = body.scrollHeight;
}

async function loadLogs(force = true) {
  if (!force || state.busy) return;
  try {
    const data = await api.logsTail({ source: state.logs.source, lines: state.logs.lines });
    state.logs.data = data;
    state.logs.viewCleared = false;
    renderLogBody();
  } catch (error) {
    const body = $('log-body');
    if (body) body.innerHTML = `<span class="log-empty">读取失败：${esc(error.message)}</span>`;
  }
}

async function refreshBackups(doRender = true) {
  try {
    state.backups = await api.backups();
  } catch (error) {
    toast(`读取备份列表失败：${error.message}`);
  }
  if (doRender && state.page === 'backups') render();
}

async function runBackup() {
  if (state.backupBusy) return;
  state.backupBusy = true;
  state.backupHint = '正在生成 SQLite 一致性快照并校验…';
  render();
  try {
    const result = await api.backupCreate();
    const verifyText = result.verify && result.verify.ok ? '校验通过' : '校验失败';
    state.backupHint = `最近备份 ${new Date(result.createdAt).toLocaleString()} · ${result.files} 个文件 · ${verifyText}`;
    toast(`备份完成：${result.files} 个文件，${fmtSize(result.sizeBytes)}，${verifyText}\n${result.dir}`);
    await refreshBackups(false);
  } catch (error) {
    state.backupHint = '备份失败，详见桌面日志';
    toast(`备份失败：${error.message}`);
  } finally {
    state.backupBusy = false;
    if (state.page === 'backups') render();
  }
}

async function runVerify(dir) {
  toast('正在校验备份…');
  try {
    const result = await api.backupVerify(dir);
    if (result.ok) {
      const counts = result.counts ? `traits ${result.counts.traits} / evidence ${result.counts.evidence}` : '';
      toast(`校验通过：${result.checked} 个文件${result.integrity ? '，SQLite 完整性正常' : ''}${counts ? `（${counts}）` : ''}`);
    } else {
      toast(`校验失败：${result.errors.slice(0, 5).join('；')}`);
    }
  } catch (error) {
    toast(`校验失败：${error.message}`);
  }
}

function askRestoreDrill(dir) {
  showModal({
    title: '恢复演练？',
    body: [
      '只把备份中的 memory.db 复制到桌面 userData/state/restore-drill.db，并做完整性检查。',
      '不会覆盖生产 memory.db、WAL 或聊天记录；不会停止服务。',
      '这是验证备份可用性，不是生产恢复。'
    ].join('\n'),
    confirmText: '开始演练',
    onConfirm: async () => {
      try {
        const r = await api.backupRestoreDrill(dir);
        toast(`恢复演练${r.ok ? '通过' : '未通过'}：integrity=${r.integrity}，facts=${r.counts.facts}，events=${r.counts.events}`);
      } catch (error) {
        toast(`恢复演练失败：${error.message}`);
      }
    }
  });
}

function showModal({ title, body, confirmText = '确认', danger = false, onConfirm }) {
  const root = $('modal-root');
  root.innerHTML = `
    <div class="modal-mask">
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        <div class="modal-body">${esc(body)}</div>
        <div class="modal-actions">
          <button class="btn" data-modal-cancel type="button">取消</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" data-modal-confirm type="button">${esc(confirmText)}</button>
        </div>
      </div>
    </div>`;
  const close = () => { root.innerHTML = ''; };
  root.querySelector('[data-modal-cancel]').addEventListener('click', close);
  root.querySelector('[data-modal-confirm]').addEventListener('click', () => { close(); onConfirm(); });
  root.querySelector('.modal-mask').addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-mask')) close();
  });
}

async function refreshControl() {
  try {
    state.control = await api.controlState();
  } catch {
    /* 控制状态读取失败不影响只读展示 */
  }
}

async function refreshAll() {
  await refresh(false);
  await refreshControl();
  render();
}

async function startService(id, env = {}) {
  if (!state.control.enabled) { toast('真实控制未启用：请先在服务页开启'); return; }
  toast('正在启动，等待健康检查…');
  try {
    const result = await api.controlStart(id, env);
    if (result.ok) {
      toast(result.starting ? result.reason : `已启动 ${id}（PID ${result.record.pid}）`);
    } else {
      toast(`启动失败：${result.reason}`);
    }
  } catch (error) {
    toast(`启动失败：${error.message}`);
  }
  await refreshAll();
}

async function stopService(id, { force = false, thenStart = false, confirmBusy = false } = {}) {
  try {
    const result = await api.controlStop(id, force, confirmBusy);
    if (result.ok) {
      toast(`已停止 ${id}${result.forced ? '（强制结束）' : ''}${result.sentinel ? '；已保留 watchdog 哨兵，避免被自动拉起' : ''}`);
      await refreshAll();
      if (thenStart) await startService(id);
      return;
    }
    if (result.needsConfirm && result.busy) {
      const reasons = (result.reasons || []).join('\n· ');
      showModal({
        title: result.busy === 'busy' ? '检测到正在活动' : '无法确认是否空闲',
        body: [
          result.busy === 'busy'
            ? '最近 10 秒内有消息处理、工具调用或记忆写入的迹象。'
            : '活动信号缺失或处于灰区，无法确认任务是否空闲。',
          '',
          `· ${reasons}`,
          '',
          '停止可能中断正在执行的 agent 任务或丢失未完成的记忆写入。只有在你确认可以中断时才继续。'
        ].join('\n'),
        confirmText: '仍然停止',
        danger: true,
        onConfirm: () => stopService(id, { force, thenStart, confirmBusy: true })
      });
      return;
    }
    if (result.needsForce) {
      const pids = (result.alive || []).map((item) => item.pid).join(', ');
      showModal({
        title: '正常退出超时',
        body: `进程 ${pids} 在等待时间内没有退出。\n\n强制结束可能丢失未落盘的数据；只有在确认服务确实无响应时才继续。`,
        confirmText: '强制结束',
        danger: true,
        onConfirm: () => stopService(id, { force: true, thenStart })
      });
      return;
    }
    toast(`停止失败：${result.reason}`);
  } catch (error) {
    toast(`停止失败：${error.message}`);
  }
}

function askStop(id) {
  const service = (state.snap.services || []).find((item) => item.id === id) || { name: id, pid: '—', ports: [] };
  const record = state.control.records[id];
  if (!record) { toast('该服务不是由本软件启动的，拒绝停止'); return; }
  showModal({
    title: `停止 ${service.name}？`,
    body: [
      `PID：${record.pid}`,
      `启动时间：${new Date(record.startMs).toLocaleString()}`,
      `可执行文件：${record.exe}`,
      '',
      id === 'bridge'
        ? '停止 qq-bridge 会同时停掉 supervisor 及其子进程，并临时写入 state\\watchdog.disabled，避免 watchdog 在 5 分钟内把它拉起来。'
        : '只会停止由本软件启动的这个实例；外部启动的进程不会被触碰。',
      '',
      '优先尝试正常退出；超时后再由你确认是否强制结束。'
    ].join('\n'),
    confirmText: '停止',
    danger: true,
    onConfirm: () => stopService(id)
  });
}

function askRestart(id) {
  const record = state.control.records[id];
  if (!record) { toast('只有由本软件启动的服务才能重启'); return; }
  showModal({
    title: `重启 ${id}？`,
    body: '会先停止再启动，期间服务短暂不可用。停止阶段同样优先正常退出，超时需再次确认强制结束。',
    confirmText: '重启',
    danger: true,
    onConfirm: () => stopService(id, { thenStart: true })
  });
}

function toggleControl() {
  if (state.control.enabled) {
    showModal({
      title: '关闭真实服务控制？',
      body: '关闭后启动/停止按钮会禁用；这不会停止任何正在运行的服务，也不会改动 watchdog 设置。',
      confirmText: '关闭',
      onConfirm: async () => {
        await api.controlSetEnabled(false);
        await refreshControl();
        render();
        toast('真实控制已关闭');
      }
    });
    return;
  }
  showModal({
    title: '启用真实服务控制？',
    body: [
      '启用后，「启动 / 停止 / 重启」会真实作用于本机进程。',
      '',
      '安全约束：',
      '· 只会停止由本软件启动、且 PID + 启动时间 + 路径 + 命令行都匹配的进程；',
      '· 外部启动的服务只检测，不提供停止；',
      '· 停止 qq-bridge 会协调 supervisor 与 watchdog，避免被自动拉起；',
      '· 桌面软件关闭不会停止机器人。',
      '',
      '首次真实操作前，请确认目标进程与影响范围。'
    ].join('\n'),
    confirmText: '启用',
    onConfirm: async () => {
      await api.controlSetEnabled(true);
      await refreshControl();
      render();
      toast('真实控制已启用');
    }
  });
}

async function runPreflight() {
  toast('正在做首次操作预检…');
  try {
    state.preflight = await api.controlPreflight();
    render();
    toast(state.preflight.ok ? '预检通过：未发现阻断项' : '预检发现问题，请查看列表');
  } catch (error) {
    toast(`预检失败：${error.message}`);
  }
}

async function recoverSentinel() {
  try {
    const result = await api.controlRecoverSentinel();
    toast(result.ok ? result.reason : `未恢复：${result.reason}`);
  } catch (error) {
    toast(`恢复失败：${error.message}`);
  }
  await refreshAll();
}

function askOriginalLaunch() {
  showModal({
    title: '用原启动方式启动 qq-bridge？',
    body: [
      '将调用项目自带的隐藏启动脚本（与计划任务相同的启动方式）。',
      '启动后本软件不接管停止；若需要接管，请改用「启动」按钮由桌面拉起。',
      '仅在 qq-bridge 未运行时可用，避免重复实例。'
    ].join('\n'),
    confirmText: '启动',
    onConfirm: async () => {
      try {
        const result = await api.controlStartOriginal();
        toast(result.ok ? '已通过原启动器启动（本软件不接管停止）' : `启动失败：${result.reason}`);
      } catch (error) {
        toast(`启动失败：${error.message}`);
      }
      await refreshAll();
    }
  });
}

async function saveOwnerTitle(title) {
  const current = state.settings || await api.settingsGet();
  state.settings = await api.settingsSave({ ...current, ownerTitle: title });
  state.wizard.ownerTitle = state.settings.ownerTitle;
  return state.settings;
}

async function saveDesktopPaths() {
  const ownerTitle = $('cfg-ownerTitle')?.value.trim();
  const repoRoot = $('cfg-repoRoot')?.value.trim();
  const snowlumaRoot = $('cfg-snowlumaRoot')?.value.trim();
  const dshExe = $('cfg-dshExe')?.value.trim();
  try {
    const current = await api.settingsGet();
    const saved = await api.settingsSave({ ...current, ownerTitle, repoRoot, snowlumaRoot, dshExe });
    state.settings = saved;
    toast('桌面设置已保存（未重启服务，未改项目配置）');
    await refresh(true);
  } catch (error) {
    toast(`保存失败：${error.message}`);
  }
}

async function refreshStartup() {
  try { state.startup = await api.startupInfo(); } catch { state.startup = null; }
}

async function toggleStartupSetting(key) {
  try {
    const current = await api.settingsGet();
    const next = { ...current, [key]: !current[key] };
    await api.settingsSave(next);
    await refreshStartup();
    render();
    toast(`${key} 已${next[key] ? '开启' : '关闭'}（只写入桌面配置，不自动修改系统任务）`);
  } catch (error) {
    toast(`保存失败：${error.message}`);
  }
}

function askAutostartRegister() {
  showModal({
    title: '注册登录自启任务？',
    body: [
      '将在 Windows 计划任务中创建 DafiyuManager：',
      '· 触发方式：用户登录时',
      '· 运行：当前控制中心可执行文件 --hidden',
      '',
      '不会修改或删除原有的 qq-bridge-watchdog / qq-bridge 任务。',
      '若已存在同名但命令不同的任务，会拒绝覆盖并报告冲突。'
    ].join('\n'),
    confirmText: '注册',
    onConfirm: async () => {
      try {
        const result = await api.autostartRegister();
        toast(result.ok ? `注册结果：${result.action}` : `注册失败：${result.reason}`);
      } catch (error) {
        toast(`注册失败：${error.message}`);
      }
      await refreshStartup();
      render();
    }
  });
}

function askAutostartUnregister() {
  showModal({
    title: '注销登录自启任务？',
    body: '只会删除由本软件创建且仍匹配的 DafiyuManager 任务；外部创建或已被修改的任务会被拒绝删除。原有 qq-bridge 任务不受影响。',
    confirmText: '注销',
    danger: true,
    onConfirm: async () => {
      try {
        const result = await api.autostartUnregister();
        toast(result.ok ? `注销结果：${result.action}` : `注销失败：${result.reason}`);
      } catch (error) {
        toast(`注销失败：${error.message}`);
      }
      await refreshStartup();
      render();
    }
  });
}

async function refreshMemory(doRender = true) {
  const m = state.memory;
  m.busy = true;
  try {
    m.status = await api.memoryStatus(m.mode);
    m.list = await api.memoryList({
      mode: m.mode, type: m.type, q: m.q, dateFrom: m.dateFrom, dateTo: m.dateTo,
      status: m.statusFilter || m.status, limit: 80
    });
    m.error = null;
    if (m.selected) {
      await loadMemoryDetail(m.selected, m.selectedKind);
    }
  } catch (error) {
    m.error = error.message;
  } finally {
    m.busy = false;
  }
  if (doRender && state.page === 'memory') render();
}

async function loadMemoryDetail(id, kind = '') {
  const m = state.memory;
  m.selected = Number(id);
  m.selectedKind = kind;
  if (kind === 'fact' || kind === 'event') {
    const row = (m.list?.rows || []).find((item) => Number(item.id) === Number(id));
    m.detail = { candidate: row || null, evidence: [] };
    if (state.page === 'memory') render();
    return;
  }
  try {
    m.detail = await api.memoryCandidate({ mode: m.mode, id: Number(id) });
  } catch (error) {
    m.detail = { candidate: null, evidence: [] };
    toast(`读取候选失败：${error.message}`);
  }
  if (state.page === 'memory') render();
}

async function switchMemoryMode(mode) {
  state.memory.mode = mode === 'test' ? 'test' : 'prod';
  state.memory.selected = null;
  state.memory.detail = null;
  await refreshMemory();
}

async function initMemoryTest() {
  showModal({
    title: '创建练习副本？',
    body: [
      '会在本机桌面目录创建一个练习用的记忆库，里面是合成数据，不包含真实聊天或真实记忆。',
      '真实记忆仍然只读，不会被复制、修改或删除。',
      '创建后可以在练习副本里体验“确认/不记住”的审核流程。'
    ].join('\n'),
    confirmText: '创建',
    onConfirm: async () => {
      try {
        const r = await api.memoryInitTest();
        toast(r.created ? '练习副本已创建' : '练习副本已存在');
        await switchMemoryMode('test');
      } catch (error) {
        toast(`创建失败：${error.message}`);
      }
    }
  });
}

function askMemoryReview(action, id) {
  if (state.memory.mode !== 'test') {
    toast('真实记忆只读：请先切换到「练习副本」再审核');
    return;
  }
  const label = action === 'apply' ? '确认并写入练习副本' : '不记住这条';
  showModal({
    title: `${label} #${id}？`,
    body: action === 'apply'
      ? '只会写入练习副本，不会修改真实记忆。写入前会检查涉及的人和生效范围。'
      : '只是把练习副本里的这条候选标记为“不采纳”，不会删除来源消息。',
    confirmText: label,
    danger: action === 'reject',
    onConfirm: async () => {
      try {
        const result = await api.memoryReview({ mode: 'test', id, action, reason: `desktop ${action}` });
        toast(`${label}完成${result.refId ? `（#${result.refId}）` : ''}`);
        await refreshMemory();
      } catch (error) {
        toast(`${label}失败：${error.message}`);
      }
    }
  });
}

let toastTimer = null;
function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 4200);
}

async function simulate(id, op) {
  try {
    const result = await api.serviceAction({ id, action: op });
    const plan = (result.plan || []).join('\n· ');
    toast(`${result.message}\n· ${plan}`);
    if (state.page === 'logs') loadLogs();
  } catch (error) {
    toast(`模拟操作失败：${error.message}`);
  }
}

async function refresh(showSpin = true) {
  if (state.busy) return;
  state.busy = true;
  if (showSpin) $('refresh-btn').classList.add('is-spinning');
  try {
    state.snap = await api.snapshot();
    state.error = null;
    updateBubble(state.snap);
  } catch (error) {
    state.error = `无法读取运行状态：${error.message}`;
  } finally {
    state.busy = false;
    if (showSpin) setTimeout(() => $('refresh-btn').classList.remove('is-spinning'), 400);
  }
  await refreshControl();
  try { state.recovery = await api.recoveryStatus(); } catch { state.recovery = null; }
  try { state.watchdog = await api.watchdogStatus(); } catch { state.watchdog = null; }
  try { state.startupStatus = await api.startupStatus(); } catch { state.startupStatus = null; }
  try { state.memoryOverview = await api.memoryStatus('prod'); } catch { state.memoryOverview = null; }
  if (state.page !== 'logs' && state.page !== 'setup') render();
  else if (state.page === 'logs') updateLogMetaOnly();
}

function updateLogMetaOnly() {
  const meta = $('log-meta');
  if (meta && state.logs.data) {
    meta.textContent = `${fmtSize(state.logs.data.size)} · ${fmtTime(state.logs.data.mtimeMs)}`;
  }
}

function updateBubble(snapshot) {
  const bubble = $('side-bubble');
  if (!bubble) return;
  const running = (snapshot.services || []).filter((s) => s.state === 'running').length;
  if (running === 3) bubble.textContent = '三件套都在线，我盯着呢～';
  else if (running === 0) bubble.textContent = '大家都没在跑，要不要去服务页看看？';
  else bubble.textContent = `${running}/3 在线，剩下的在环境检查里有线索。`;
}

async function placeEmbed() {
  if (state.page !== 'embed') return;
  const slot = $('embed-slot');
  if (!slot) return;
  const rect = slot.getBoundingClientRect();
  try {
    await api.embedBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  } catch { /* ignore */ }
}

async function syncEmbed() {
  if (state.page !== 'embed') return;
  const e = state.embed;
  e.busy = true;
  e.error = null;
  render();
  try {
    const result = await api.embedShow(e.service);
    e.result = result;
    if (!result?.ok) e.error = result?.reason || '内嵌页面加载失败';
  } catch (error) {
    e.result = null;
    e.error = error.message;
  } finally {
    e.busy = false;
    render();
    await placeEmbed();
  }
}

async function copyDeepSeekPrompt() {
  try {
    const result = await api.copyText(deepSeekGuidePrompt());
    toast(result.ok ? '提示词已复制，可以粘贴给 DeepSeek / DSH' : `复制失败：${result.reason || '未知原因'}`);
  } catch (error) {
    toast(`复制失败：${error.message}`);
  }
}

function updateBiliBadge(status) {
  const badge = $('nav-bili-badge');
  if (!badge) return;
  const count = Number(status?.counts?.unread) || 0;
  badge.textContent = count > 0 ? String(Math.min(count, 99)) : '';
  badge.style.display = count > 0 ? 'inline-flex' : 'none';
}

async function refreshBili({ silent = false } = {}) {
  if (state.bili.busy) return;
  state.bili.busy = true;
  try {
    const status = await api.bilibiliStatus();
    state.bili.status = status;
    state.bili.error = null;
    updateBiliBadge(status);
    const last = Number(status.lastAt) || 0;
    if (last && state.bili.lastToastAt === 0) state.bili.lastToastAt = last;
    if (last > state.bili.lastToastAt && state.page !== 'bilibili') {
      const entry = status.entries?.[0];
      if (entry) toast(`大肥鱼刚${biliKindLabel(entry.kind)}：${entry.title || entry.bvid || 'B站内容'}`);
      state.bili.lastToastAt = last;
    }
    if (state.page === 'bilibili' && !silent) render();
  } catch (error) {
    state.bili.error = error.message;
    if (!silent && state.page === 'bilibili') render();
  } finally {
    state.bili.busy = false;
  }
}

async function openBiliPage() {
  await refreshBili();
  const last = Number(state.bili.status?.lastAt) || 0;
  if (last) {
    try { await api.bilibiliAck(last); } catch { /* ignore */ }
    await refreshBili();
  }
}

async function copyBiliPrompt() {
  try {
    const result = await api.copyText(biliPromptText(state.bili.status?.watchLog));
    toast(result.ok ? 'B站接入提示词已复制，可以粘贴给 DeepSeek / DSH' : `复制失败：${result.reason || '未知原因'}`);
  } catch (error) {
    toast(`复制失败：${error.message}`);
  }
}

async function refreshUpdate({ silent = false } = {}) {
  if (state.update.busy) return;
  state.update.busy = true;
  state.update.error = null;
  try {
    state.update.check = await api.updateCheck();
    if (state.update.check?.available && silent) {
      toast(`发现新版本 ${state.update.check.latestVersion}，可在「关于」页更新`);
    }
    if (state.page === 'about') render();
  } catch (error) {
    state.update.error = error.message;
    if (state.page === 'about') render();
  } finally {
    state.update.busy = false;
  }
}

function pollUpdate() {
  if (state.update.timer) return;
  state.update.timer = setInterval(async () => {
    try {
      const task = await api.updateStatus();
      if (task) state.update.task = task;
      const active = task && !['completed', 'failed', 'cancelled'].includes(task.status);
      if (!active) {
        clearInterval(state.update.timer);
        state.update.timer = null;
        if (state.page === 'about') render();
        if (task?.status === 'completed') toast('安装程序已打开；完成后请手动重启控制中心');
        if (task?.status === 'failed') toast(`更新失败：${task.error || '未知错误'}`);
      } else if (state.page === 'about') render();
    } catch { /* ignore transient poll errors */ }
  }, 800);
}

function downloadUpdate() {
  const check = state.update.check;
  if (!check?.available) { toast('当前没有可用更新'); return; }
  showModal({
    title: `下载并安装 ${check.latestVersion}？`,
    body: [
      `将从 GitHub Release 下载 ${check.asset?.name || '安装包'}。`,
      check.asset?.digest ? `SHA256：${check.asset.digest}` : '该 Release 没有提供摘要，将只校验来源域名。',
      '下载完成后会打开安装程序；不会静默安装，也不会自动关闭当前控制中心。'
    ].join('\n'),
    confirmText: '下载并打开',
    onConfirm: async () => {
      state.update.busy = true;
      try {
        const result = await api.updateDownload();
        state.update.task = result.task || null;
        if (!result.ok) {
          toast(`更新失败：${result.reason}`);
        } else {
          toast('安装程序已打开');
        }
        pollUpdate();
        if (state.page === 'about') render();
      } catch (error) {
        toast(`更新失败：${error.message}`);
      } finally {
        state.update.busy = false;
      }
    }
  });
}

async function openReleasePage() {
  const url = state.update.check?.releaseUrl;
  if (!url) return;
  try {
    const result = await api.openExternal(url);
    if (!result.ok) toast(result.reason || '打开失败');
  } catch (error) {
    toast(`打开失败：${error.message}`);
  }
}

async function refreshEnvironment() {
  if (state.environment.busy) return;
  state.environment.busy = true;
  state.environment.error = null;
  render();
  try {
    state.environment.status = await api.environmentDetect({ network: true });
    state.install.targetDir = state.install.targetDir || state.install.catalog?.defaultRoot || '';
  } catch (error) {
    state.environment.error = error.message;
  } finally {
    state.environment.busy = false;
    if (state.page === 'environment') render();
  }
}

function stopInstallPolling() {
  if (state.install.timer) {
    clearInterval(state.install.timer);
    state.install.timer = null;
  }
}

async function pollInstall() {
  try {
    state.install.task = await api.installStatus();
    if (!state.install.task) return;
    const active = !['completed', 'failed', 'cancelled'].includes(state.install.task.status);
    if (!active) {
      stopInstallPolling();
      state.install.busy = false;
      if (state.page === 'environment') render();
      return;
    }
    if (state.page === 'environment') render();
  } catch { /* ignore */ }
}

function startInstall(component) {
  const targetInput = $('install-target');
  const defaultRoot = state.install.catalog?.defaultRoot || state.install.targetDir || '';
  const targetDir = component === 'snowluma'
    ? `${defaultRoot}\\SnowLuma`
    : (targetInput?.value?.trim() || state.install.targetDir || defaultRoot);
  if (!targetDir) { toast('请填写安装目录'); return; }
  if (state.install.task && !['completed', 'failed', 'cancelled'].includes(state.install.task.status)) {
    toast('已有安装任务在进行中');
    return;
  }
  const snow = component === 'snowluma';
  const licenseAccepted = Boolean($('accept-snowluma-license')?.checked);
  if (snow && !licenseAccepted) {
    toast('请先勾选接受 SnowLuma LICENSE / EULA');
    return;
  }
  showModal({
    title: snow ? '安装 SnowLuma 官方发行版？' : '安装 qq-bridge？',
    body: snow
      ? [
        '将从 SnowLuma 官方 GitHub Releases 下载 v2.2.1 Windows x64 完整发行版，校验 SHA256，并解压到目标目录。',
        `目标目录：${targetDir}`,
        '下载的是官方未修改完整发行版；不会修改源代码或原生组件，不会自建镜像，不会打包再分发。',
        '安装完成后仍需首次登录 WebUI 并设置密码；不会自动启动服务。',
        '继续即表示你已阅读并接受 SnowLuma LICENSE / EULA。'
      ].join('\n')
      : [
        '将把安装包内置的 qq-bridge v0.2.1-r1 源码复制到目标目录，然后运行 npm install。',
        `目标目录：${targetDir}`,
        '不会覆盖非空目录；不会自动启动服务；不会修改 SnowLuma/DSH。'
      ].join('\n'),
    confirmText: '开始安装',
    onConfirm: async () => {
      state.install.busy = true;
      try {
        const result = await api.installStart(component, targetDir, true, licenseAccepted);
        if (!result.ok) {
          toast(`安装未开始：${result.reason}`);
          state.install.busy = false;
          return;
        }
        state.install.task = result.task;
        state.install.targetDir = targetDir;
        stopInstallPolling();
        state.install.timer = setInterval(pollInstall, 800);
        if (state.page === 'environment') render();
      } catch (error) {
        toast(`安装失败：${error.message}`);
        state.install.busy = false;
      }
    }
  });
}

async function copyInstallFailure() {
  try {
    const result = await api.copyText(installFailurePrompt(state.install.task));
    toast(result.ok ? '失败排查提示词已复制，可以粘贴给 DeepSeek / DSH' : `复制失败：${result.reason || '未知原因'}`);
  } catch (error) {
    toast(`复制失败：${error.message}`);
  }
}

async function cancelInstall() {
  try {
    const result = await api.installCancel();
    state.install.task = result.task || state.install.task;
    stopInstallPolling();
    state.install.busy = false;
    if (state.page === 'environment') render();
  } catch (error) {
    toast(`取消失败：${error.message}`);
  }
}

async function useInstallResult() {
  const root = state.install.task?.result?.root;
  const component = state.install.task?.component;
  if (!root) { toast('没有可用的安装结果'); return; }
  try {
    const current = await api.settingsGet();
    if (component === 'snowluma') await api.settingsSave({ ...current, snowlumaRoot: root });
    else await api.settingsSave({ ...current, repoRoot: root });
    state.settings = await api.settingsGet();
    toast(component === 'snowluma' ? '已切换到新 SnowLuma 路径；请完成 WebUI 首次登录' : '已把 qq-bridge 路径切换到新安装目录；请到配置页补全账号/DSH/SnowLuma 字段');
    await refreshEnvironment();
  } catch (error) {
    toast(`切换路径失败：${error.message}`);
  }
}

async function openPage(page) {
  const previous = state.page;
  state.page = page;
  if (previous === 'embed' && page !== 'embed') {
    try { await api.embedHide(); } catch { /* ignore */ }
  }
  if (page === 'logs' && !state.logsList) {
    try { state.logsList = await api.logsList(); } catch { state.logsList = []; }
  }
  if (page === 'backups' && !state.backups) {
    try { state.backups = await api.backups(); } catch { state.backups = []; }
  }
  if (page === 'startup') {
    try { state.startup = await api.startupInfo(); } catch { state.startup = null; }
    try { state.startupStatus = await api.startupStatus(); } catch { state.startupStatus = null; }
  }
  if (page === 'memory') await refreshMemory(false);
  if (page === 'setup') {
    try { state.setup.status = await api.setupStatus(); } catch (error) { state.setup.status = null; state.setup.error = error.message; }
  }
  if (page === 'environment') {
    try { state.install.catalog = await api.installCatalog(); } catch { state.install.catalog = null; }
    if (!state.environment.status) await refreshEnvironment();
    if (state.install.task) pollInstall();
  }
  if (page === 'bilibili') await openBiliPage();
  if (page === 'config') {
    try { state.settings = await api.settingsGet(); } catch { state.settings = null; }
  }
  render();
  if (page === 'embed') await syncEmbed();
}

function bind() {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => openPage(btn.dataset.page));
  });

  $('refresh-btn').addEventListener('click', () => refresh(true));
  window.addEventListener('resize', () => { placeEmbed(); });
  window.addEventListener('scroll', () => { if (state.page === 'embed') placeEmbed(); }, true);

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-env-detect]')) { refreshEnvironment(); return; }
    if (event.target.closest('[data-copy-deepseek]')) { copyDeepSeekPrompt(); return; }
    if (event.target.closest('#bili-refresh')) { refreshBili(); return; }
    if (event.target.closest('#bili-copy-prompt')) { copyBiliPrompt(); return; }
    if (event.target.closest('#update-check')) { refreshUpdate(); return; }
    if (event.target.closest('#update-download')) { downloadUpdate(); return; }
    if (event.target.closest('#update-release')) { openReleasePage(); return; }
    if (event.target.closest('#update-go-about')) { openPage('about'); return; }
    const installBtn = event.target.closest('[data-env-install]');
    if (installBtn) { startInstall(installBtn.dataset.envInstall); return; }
    if (event.target.closest('[data-install-cancel]')) { cancelInstall(); return; }
    if (event.target.closest('[data-install-copy-error]')) { copyInstallFailure(); return; }
    if (event.target.closest('[data-install-retry]')) { startInstall('bridge'); return; }
    if (event.target.closest('[data-install-use]')) { useInstallResult(); return; }
    const jump = event.target.closest('[data-page-jump]');
    if (jump) { openPage(jump.dataset.pageJump); return; }
    if (event.target.closest('#setup-wizard')) { openWizard(0); return; }
    if (event.target.closest('[data-wizard-close]') || event.target.matches('[data-wizard-backdrop]')) { closeWizard(); return; }
    if (event.target.closest('[data-wizard-next]')) {
      if (state.wizard.step >= 4) { closeWizard(); return; }
      if (state.wizard.step === 0) {
        const title = $('wizard-owner-title')?.value || '爸爸';
        saveOwnerTitle(title).then(() => {
          state.wizard.step += 1;
          state.wizard.error = null;
          renderWizard();
        }).catch((error) => toast(`称呼保存失败：${error.message}`));
        return;
      }
      state.wizard.step += 1;
      state.wizard.error = null;
      renderWizard();
      return;
    }
    if (event.target.closest('[data-wizard-back]')) {
      state.wizard.step = Math.max(0, state.wizard.step - 1);
      state.wizard.error = null;
      renderWizard();
      return;
    }
    if (event.target.closest('[data-wizard-start-snow]')) { wizardStartSnowluma(); return; }
    if (event.target.closest('[data-wizard-start-bridge]')) { wizardStartBridge(); return; }
    if (event.target.closest('[data-wizard-open-embed]')) {
      closeWizard();
      openPage('embed');
      return;
    }
    if (event.target.closest('[data-wizard-enable-control]')) {
      (async () => {
        try {
          await api.controlSetEnabled(true);
          await refreshAll();
          await wizardRefreshStatus();
          toast('真实控制已启用');
        } catch (error) { toast(`启用失败：${error.message}`); }
      })();
      return;
    }
    if (event.target.closest('#setup-snow-start')) { setupStartSnowluma(); return; }
    if (event.target.closest('#setup-refresh')) { refreshSetup(); return; }
    if (event.target.closest('#setup-open-embed')) { openPage('embed'); return; }
    if (event.target.closest('#setup-enable-control')) {
      (async () => {
        try { await api.controlSetEnabled(true); await refreshAll(); await refreshSetup(); toast('真实控制已启用'); }
        catch (error) { toast(`启用失败：${error.message}`); }
      })();
      return;
    }
    const embedTab = event.target.closest('[data-embed-service]');
    if (embedTab) {
      const service = embedTab.dataset.embedService;
      if (service !== state.embed.service) {
        state.embed.service = service;
        state.embed.result = null;
        state.embed.error = null;
        api.embedHide().catch(() => {});
        render();
        syncEmbed();
      }
      return;
    }
    if (event.target.closest('#embed-reload')) { syncEmbed(); return; }
    const target = event.target.closest('[data-control-start]');
    if (target) { startService(target.dataset.controlStart); return; }
    const stopBtn = event.target.closest('[data-control-stop]');
    if (stopBtn) { askStop(stopBtn.dataset.controlStop); return; }
    const restartBtn = event.target.closest('[data-control-restart]');
    if (restartBtn) { askRestart(restartBtn.dataset.controlRestart); return; }
    if (event.target.closest('#control-toggle')) { toggleControl(); return; }
    const toggleBtn = event.target.closest('[data-toggle-setting]');
    if (toggleBtn) { toggleStartupSetting(toggleBtn.dataset.toggleSetting); return; }
    if (event.target.closest('#autostart-register')) { askAutostartRegister(); return; }
    if (event.target.closest('#autostart-unregister')) { askAutostartUnregister(); return; }
    if (event.target.closest('#control-preflight')) { runPreflight(); return; }
    if (event.target.closest('#control-original')) { askOriginalLaunch(); return; }
    if (event.target.closest('#control-recover-sentinel')) { recoverSentinel(); return; }
    const memoryModeBtn = event.target.closest('[data-memory-mode]');
    if (memoryModeBtn) { switchMemoryMode(memoryModeBtn.dataset.memoryMode); return; }
    const memoryTypeBtn = event.target.closest('[data-memory-type]');
    if (memoryTypeBtn) {
      state.memory.type = memoryTypeBtn.dataset.memoryType;
      state.memory.selected = null;
      state.memory.detail = null;
      refreshMemory();
      return;
    }
    if (event.target.closest('#memory-init-test')) { initMemoryTest(); return; }
    if (event.target.closest('#cfg-save-paths')) { saveDesktopPaths(); return; }
    if (event.target.closest('#memory-refresh')) { refreshMemory(); return; }
    if (event.target.closest('#memory-apply-filters')) { refreshMemory(); return; }
    if (event.target.closest('#memory-reset-filters')) {
      state.memory.q = ''; state.memory.dateFrom = ''; state.memory.dateTo = ''; state.memory.status = 'pending';
      refreshMemory();
      return;
    }
    const reviewBtn = event.target.closest('[data-memory-review]');
    if (reviewBtn) { askMemoryReview(reviewBtn.dataset.memoryReview, Number(reviewBtn.dataset.memoryId)); return; }
    const memoryRow = event.target.closest('[data-memory-id]');
    if (memoryRow && memoryRow.dataset.memoryId) {
      loadMemoryDetail(memoryRow.dataset.memoryId, memoryRow.dataset.memoryKind || '');
      return;
    }
    if (event.target.closest('#backup-create')) {
      runBackup();
      return;
    }
    if (event.target.closest('#backup-refresh')) {
      refreshBackups();
      return;
    }
    const verifyBtn = event.target.closest('[data-verify]');
    if (verifyBtn) {
      runVerify(verifyBtn.dataset.verify);
      return;
    }
    const restoreBtn = event.target.closest('[data-restore]');
    if (restoreBtn) {
      askRestoreDrill(restoreBtn.dataset.restore);
      return;
    }
    const source = event.target.closest('[data-source]');
    if (source) {
      state.logs.source = source.dataset.source;
      state.logs.viewCleared = false;
      document.querySelectorAll('.source-tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.source === state.logs.source));
      loadLogs();
      return;
    }
    if (event.target.closest('#log-follow')) {
      state.logs.follow = !state.logs.follow;
      $('log-follow').textContent = `跟随：${state.logs.follow ? '开' : '关'}`;
      if (state.logs.follow) loadLogs();
      return;
    }
    if (event.target.closest('#log-copy')) {
      const body = $('log-body');
      const text = body ? body.innerText : '';
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      area.remove();
      toast(ok ? '日志内容已复制' : '复制失败，请手动选择文本');
      return;
    }
    if (event.target.closest('#log-clear')) {
      state.logs.viewCleared = true;
      renderLogBody();
      toast('视图已清空，原日志文件未改动');
      return;
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.id === 'log-search') {
      state.logs.query = event.target.value;
      state.logs.viewCleared = false;
      renderLogBody();
    }
    if (event.target.id === 'memory-search') state.memory.q = event.target.value;
  });

  document.addEventListener('change', (event) => {
    if (event.target.id === 'log-lines') {
      state.logs.lines = Number(event.target.value);
      loadLogs();
    }
    if (event.target.id === 'memory-from') state.memory.dateFrom = event.target.value;
    if (event.target.id === 'memory-to') state.memory.dateTo = event.target.value;
    if (event.target.id === 'memory-status') state.memory.status = event.target.value;
  });
}

function startClock() {
  const tick = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    $('clock').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  };
  tick();
  setInterval(tick, 1000);
}

async function boot() {  bind();
  startClock();
  try { state.info = await api.info(); } catch { state.info = {}; }
  try { state.settings = await api.settingsGet(); } catch { state.settings = null; }
  await refreshControl();
  try { state.logsList = await api.logsList(); } catch { state.logsList = []; }
  try { state.backups = await api.backups(); } catch { state.backups = []; }
  await refresh(false);
  try { await refreshBili({ silent: true }); } catch { /* bili activity is optional */ }
  if (!state.bili.timer) state.bili.timer = setInterval(() => refreshBili({ silent: true }), 20000);
  render();
  refreshUpdate({ silent: true }).catch(() => {});
  maybeOpenWizard();
  setInterval(() => { if (state.page !== 'logs') refresh(false); }, 6000);
  setInterval(() => { if (state.page === 'logs' && state.logs.follow) loadLogs(); }, 4000);
}

window.__dafiyuMemoryTest = async () => {
  try {
    await api.memoryInitTest();
    state.memory.mode = 'test';
    state.memory.selected = null;
    state.memory.detail = null;
    await refreshMemory();
    return true;
  } catch (error) {
    return error.message;
  }
};

boot();
