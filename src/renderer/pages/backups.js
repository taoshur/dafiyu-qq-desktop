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
      ${downloading ? `${progressBar(task.percent || 0)}<p class="embed-hint">正在下载 ${esc(task.latestVersion || '')} · ${task.percent == null ? '—' : `${task.percent}%`} · ${fmtSize(task.received)} / ${fmtSize(task.total)}</p>` : ''}
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
