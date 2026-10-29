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
