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
  const labels = {
    info: '看了视频', subtitle: '读了字幕', search: '搜索视频', hot: '看了热门',
    rank: '看了排行', weekly: '看了每周必看', buzzwords: '看了热搜',
    comments: '看了评论', danmaku: '看了弹幕', user_info: '查了UP主',
    user_videos: '看了UP主投稿', favorite: '看了收藏夹'
  };
  return labels[kind] || kind || '活动';
}

function biliEntryText(item) {
  if (item.title) return item.title;
  if (item.kind === 'search') return `搜索「${item.query || '—'}」${item.count ? ` · ${item.count} 条结果` : ''}`;
  if (item.kind === 'hot') return `浏览热门${item.count ? ` · ${item.count} 条` : ''}`;
  if (item.kind === 'rank') return `浏览排行 ${item.category || ''}${item.day ? ` · ${item.day} 日` : ''}${item.count ? ` · ${item.count} 条` : ''}`;
  if (item.kind === 'weekly') return `浏览每周必看${item.week ? ` · 第 ${item.week} 期` : ''}`;
  if (item.kind === 'buzzwords') return '浏览热搜词';
  if (item.kind === 'comments') return `看评论${item.count != null ? ` · ${item.count} 条` : ''}${item.error ? ' · 抓取失败' : ''}`;
  if (item.kind === 'danmaku') return `看弹幕${item.count != null ? ` · ${item.count} 条` : ''}`;
  if (item.kind === 'user_info') return `查看 UP 主${item.name ? `「${item.name}」` : ''}${item.uid ? ` · ${item.uid}` : ''}`;
  if (item.kind === 'user_videos') return `查看 UP 主投稿${item.uid ? ` · ${item.uid}` : ''}${item.count ? ` · ${item.count} 条` : ''}`;
  return biliKindLabel(item.kind);
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
      <td><b>${esc(biliEntryText(item))}</b><span class="memory-detail">${esc(item.bvid || '')}${meta ? ` · ${esc(meta)}` : ''}</span></td>
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
      <section class="card stat"><span>累计动作</span><b>${s.counts.total}</b><small>搜索/热榜/视频/字幕等记录</small></section>
      <section class="card stat"><span>今天动作</span><b class="${s.counts.today ? 'ok' : ''}">${s.counts.today}</b><small>今天 · 涉及 ${s.counts.todayVideos || 0} 个视频</small></section>
      <section class="card stat"><span>看过的视频</span><b>${s.counts.videos}</b><small>按 BV 号去重（不把搜索/热榜算成视频）</small></section>
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
          <tbody>${rows || '<tr><td colspan="4" class="log-empty">还没有 B 站活动。新版内置 B 站 MCP 会记录搜索、热榜、排行、视频详情、字幕、评论等动作；如果仍然为空，确认使用的是安装包内置版本并重启 DSH。</td></tr>'}</tbody>
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
