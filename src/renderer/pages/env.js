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
