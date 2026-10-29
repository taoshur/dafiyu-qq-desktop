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

function renderLiveUpdate() {
  const el = $('update-live');
  if (el) el.innerHTML = updatePanel();
  else render();
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
        if (state.page === 'about') renderLiveUpdate();
        if (task?.status === 'completed') toast('安装程序已打开；完成后请手动重启控制中心');
        if (task?.status === 'failed') toast(`更新失败：${task.error || '未知错误'}`);
      } else if (state.page === 'about') renderLiveUpdate();
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

function renderLiveInstall() {
  const el = $('install-live');
  if (el) el.innerHTML = installTaskPanel();
  else render();
}

async function pollInstall() {
  try {
    state.install.task = await api.installStatus();
    if (!state.install.task) return;
    const active = !['completed', 'failed', 'cancelled'].includes(state.install.task.status);
    if (!active) {
      stopInstallPolling();
      state.install.busy = false;
      if (state.page === 'environment') renderLiveInstall();
      return;
    }
    if (state.page === 'environment') renderLiveInstall();
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
    if (state.page === 'environment') renderLiveInstall();
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
