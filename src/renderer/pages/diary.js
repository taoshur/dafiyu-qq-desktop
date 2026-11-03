function diaryDateLabel(date) {
  const raw = String(date || '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  return `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日`;
}

function diaryWeekday(date) {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
}

function diaryPage() {
  const d = state.diary || {};
  const entries = Array.isArray(d.entries) ? d.entries : [];
  const detail = d.detail;
  const selected = d.date || entries[0]?.date || '';
  const rows = entries.map((entry) => `
    <button class="diary-date ${entry.date === selected ? 'is-active' : ''}" data-diary-date="${esc(entry.date)}" type="button">
      <span class="diary-date-main">${esc(entry.date)}</span>
      <span class="diary-date-sub">${esc(diaryWeekday(entry.date))}${entry.mood?.length ? ` · ${entry.mood.map(esc).join(' / ')}` : ''}</span>
    </button>`).join('');
  const mood = Array.isArray(detail?.mood) ? detail.mood : [];
  const highlights = Array.isArray(detail?.highlights) ? detail.highlights : [];
  return `
    <div class="diary-layout">
      <section class="card diary-list">
        <div class="section-title"><h3>日记</h3><span>${entries.length} 篇</span></div>
        <div class="diary-toggle-row">
          <div>
            <b>允许大肥鱼自己写日记</b>
            <p>没有定时任务；它想写时才会写。修改后需重启 qqbridge 生效。</p>
          </div>
          <label class="switch"><input id="diary-enabled-toggle" type="checkbox" ${d.enabled ? 'checked' : ''}><span></span></label>
        </div>
        <div class="diary-dates">${rows || '<div class="log-empty" style="padding:18px">还没有日记。等它自己想写，或者先在聊天里让它写一篇。</div>'}</div>
        <button class="btn ghost" id="diary-refresh" type="button" style="margin-top:10px">刷新</button>
      </section>
      <section class="card diary-detail">
        ${detail ? `
          <div class="section-title"><h3>${esc(detail.title || diaryDateLabel(detail.date))}</h3><span>${esc(diaryDateLabel(detail.date))} · ${esc(diaryWeekday(detail.date))}</span></div>
          ${mood.length ? `<div class="diary-moods">${mood.map((m) => `<span class="tag mem">${esc(m)}</span>`).join('')}</div>` : ''}
          <div class="diary-body">${esc(detail.body || '').split('\n').map((line) => `<p>${line || '<br>'}</p>`).join('')}</div>
          ${highlights.length ? `<div class="diary-highlights"><h4>当天片段</h4><ul>${highlights.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
          <div class="diary-meta">
            <span>消息 ${Number(detail.source_messages) || 0}</span>
            <span>事件 ${Number(detail.source_events) || 0}</span>
            <span>事实 ${Number(detail.source_facts) || 0}</span>
            <span>更新 ${fmtTime(detail.updated_at)}</span>
          </div>` : `<div class="log-empty" style="padding:40px">选一篇日记查看，或者等大肥鱼想写的时候。</div>`}
      </section>
    </div>`;
}
