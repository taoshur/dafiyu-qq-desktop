function configPage(snapshot) {
  const cfg = snapshot.config || {};
  const ports = cfg.ports || {};
  const flags = cfg.flags || {};
  const paths = cfg.paths || {};
  const yes = (value) => (value ? '是' : '否');
  return `
    <div class="notice">这里可以修改桌面自身的称呼和路径；不会显示令牌/凭据，也不会直接改写 qq-bridge 的项目 config.json。</div>
    <section class="card panel" style="margin-top:14px">
      <div class="section-title"><h3>桌面路径设置</h3><span>只写桌面自己的配置，不修改 qq-bridge/config.json</span></div>
      <div class="memory-filters">
        <span class="field-caption">大肥鱼对您的称呼</span><input class="input" id="cfg-ownerTitle" style="min-width:240px" maxlength="16" placeholder="大肥鱼对您的称呼（默认：爸爸）" value="${esc(state.settings?.ownerTitle || '爸爸')}" />
        <span class="field-caption">qq-bridge 目录</span><input class="input" id="cfg-repoRoot" style="min-width:360px" value="${esc(state.settings?.repoRoot || snapshot.paths.repoRoot)}" />
        <span class="field-caption">SnowLuma 目录</span><input class="input" id="cfg-snowlumaRoot" style="min-width:240px" value="${esc(state.settings?.snowlumaRoot || snapshot.paths.snowlumaRoot)}" />
        <span class="field-caption">DSH 可执行文件</span><input class="input" id="cfg-dshExe" style="min-width:360px" value="${esc(state.settings?.dshExe || snapshot.paths.dshExe)}" />
        <span class="field-caption">界面主题</span>
        <select class="input" id="cfg-theme">
          <option value="dark" ${(state.settings?.theme || 'dark') === 'dark' ? 'selected' : ''}>深色</option>
          <option value="light" ${state.settings?.theme === 'light' ? 'selected' : ''}>浅色</option>
          <option value="auto" ${state.settings?.theme === 'auto' ? 'selected' : ''}>跟随系统</option>
        </select>
        <button class="btn primary" id="cfg-save-paths" type="button">保存桌面设置</button>
      </div>
      <p class="service-detail">修改后可重新检测环境；不会自动启动或重启任何服务。</p>
    </section>
    <section class="card panel" style="margin-top:14px">
      <div class="section-title"><h3>数据管理</h3><span>只导出桌面配置，不含令牌、API Key 或记忆库</span></div>
      <div class="memory-filters">
        <button class="btn primary" id="cfg-export" type="button">导出桌面配置</button>
        <button class="btn" id="cfg-import" type="button">导入桌面配置</button>
      </div>
      <p class="service-detail">配置文件只包含称呼、路径和启动开关。完整记忆/角色数据请使用「数据备份」。导入会先显示差异，确认后才写入；不会启动或重启服务。</p>
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
