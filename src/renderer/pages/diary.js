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

function diaryDateParts(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!m) return { day: '', month: '' };
  return { day: m[3], month: `${Number(m[2])} 月` };
}

function diaryPage() {
  const d = state.diary || {};
  const entries = Array.isArray(d.entries) ? d.entries : [];
  const detail = d.detail;
  const selected = d.date || entries[0]?.date || '';
  const rows = entries.map((entry) => {
    const parts = diaryDateParts(entry.date);
    return `
      <button class="diary-date ${entry.date === selected ? 'is-active' : ''}" data-diary-date="${esc(entry.date)}" type="button">
        <span class="diary-date-day">${esc(parts.day)}</span>
        <span class="diary-date-meta">
          <b>${esc(parts.month)}</b>
          <small>${esc(diaryWeekday(entry.date))}${entry.mood?.length ? ` · ${entry.mood.map((m) => esc(m)).join(' / ')}` : ''}</small>
        </span>
      </button>`;
  }).join('');
  const mood = Array.isArray(detail?.mood) ? detail.mood : [];
  const highlights = Array.isArray(detail?.highlights) ? detail.highlights : [];
  return `
    <div class="diary-shell">
      <aside class="card diary-side">
        <div class="diary-side-head">
          <div>
            <span class="diary-kicker">私人日记</span>
            <h3>日记 <small>${entries.length} 篇</small></h3>
          </div>
          <label class="switch" title="允许大肥鱼自己写日记">
            <input id="diary-enabled-toggle" type="checkbox" ${d.enabled ? 'checked' : ''}>
            <span></span>
          </label>
        </div>
        <p class="diary-side-note">没有定时任务。它想写的时候才会写；修改开关后需重启 qqbridge。</p>
        <div class="diary-dates">${rows || `
          <div class="diary-side-empty">
            <span class="diary-side-empty-mark">○</span>
            <b>还没有日记</b>
            <p>等它自己想写，或者在聊天里让它写一篇。</p>
          </div>`}</div>
        <button class="btn ghost diary-refresh" id="diary-refresh" type="button">刷新</button>
      </aside>
      <article class="card diary-paper">
        ${detail ? `
          <header class="diary-paper-head">
            <div class="diary-kicker">${esc(diaryDateLabel(detail.date))} · ${esc(diaryWeekday(detail.date))}</div>
            <h2>${esc(detail.title || '无题')}</h2>
            ${mood.length ? `<div class="diary-moods">${mood.map((m) => `<span class="tag mem">${esc(m)}</span>`).join('')}</div>` : ''}
          </header>
          <div class="diary-body">${esc(detail.body || '').split('\n').map((line) => `<p>${line || '<br>'}</p>`).join('')}</div>
          ${highlights.length ? `<div class="diary-highlights"><h4>当天片段</h4><ul>${highlights.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
          <footer class="diary-meta">
            <span>消息 ${Number(detail.source_messages) || 0}</span>
            <span>事件 ${Number(detail.source_events) || 0}</span>
            <span>事实 ${Number(detail.source_facts) || 0}</span>
            <span>更新 ${fmtTime(detail.updated_at)}</span>
          </footer>` : `
          <div class="diary-empty">
            <div class="diary-empty-mark">✎</div>
            <h2>今天还没有日记</h2>
            <p>大肥鱼想写的时候，会自己留下一篇。<br>不会每天打卡，也不会自动发到 QQ。</p>
            <button class="btn" id="diary-refresh" type="button">刷新看看</button>
          </div>`}
      </article>
    </div>`;
}
