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
      ${progressBar(task.percent)}
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
