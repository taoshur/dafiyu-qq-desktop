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
