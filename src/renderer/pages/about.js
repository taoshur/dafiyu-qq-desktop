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
      <button class="btn primary" id="guide-start" type="button" style="align-self:flex-start">重新观看新手教程</button>
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
    <div id="update-live">${updatePanel()}</div>`;
}
