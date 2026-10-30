function maskQq(value) {
  const s = String(value || '');
  return /^\d{5,12}$/.test(s) ? `QQ***${s.slice(-4)}` : s;
}

function memoryDate(item) {
  const t = item.happened_at || item.created_at;
  return fmtTime(t);
}

function memoryKindLabel(kind) {
  if (kind === 'fact') return '事实';
  if (kind === 'event') return '事件';
  return kind || '—';
}

function memoryStatusLabel(status) {
  if (status === 'pending') return '待确认';
  if (status === 'applied') return '已采纳';
  if (status === 'rejected') return '已拒绝';
  return status || '—';
}

function memoryQualityLabel(quality) {
  if (quality === 'valid') return '校验通过';
  if (quality === 'invalid') return '校验未通过';
  return quality || '—';
}

function memoryScopeLabel(scope) {
  const text = String(scope || '');
  if (text.startsWith('group:')) return `群聊 ${text.slice(6)}`;
  if (text.startsWith('private:')) return `私聊 ${text.slice(8)}`;
  if (text === 'global') return '全局';
  return text || '—';
}

function memoryTimePrecisionLabel(precision) {
  if (precision === 'exact') return '时间明确';
  if (precision === 'day') return '只到日期';
  if (precision === 'approx') return '大概时间';
  return precision || '—';
}

function memoryPage() {
  const m = state.memory;
  const status = m.status;
  if (m.error) {
    return `<div class="notice danger">记忆读取失败：${esc(m.error)}</div>`;
  }
  if (!status) return '<div class="log-empty" style="padding:30px">正在读取长期记忆…</div>';
  const counts = status.counts || {};
  const modeTest = m.mode === 'test';
  const rows = m.list?.rows || [];
  const sourceLabel = modeTest ? '练习副本' : '真实记忆（只读）';
  const testExists = status.testDbExists;
  const reviewDisabled = !modeTest || !m.selected;
  const table = rows.map((item) => {
    const id = Number(item.id);
    const kind = item.kind || item.type;
    const subject = item.subject_name || maskQq(item.subject_qq) || '—';
    const title = item.summary || item.value || item.attr || '（无标题）';
    const detail = item.detail ? ` · ${String(item.detail).slice(0, 60)}` : '';
    const date = memoryDate(item);
    const confidence = Number(item.confidence);
    const tags = [
      item.scope ? `<span class="meta-pill">${esc(memoryScopeLabel(item.scope))}</span>` : '',
      item.visibility ? `<span class="meta-pill">${esc(item.visibility === 'public' ? '群内可见' : item.visibility === 'private' ? '仅自己可见' : item.visibility)}</span>` : '',
      item.time_precision ? `<span class="meta-pill">${esc(memoryTimePrecisionLabel(item.time_precision))}</span>` : '',
      item.status ? `<span class="meta-pill">${esc(memoryStatusLabel(item.status))}</span>` : '',
      item.quality ? `<span class="meta-pill">${esc(memoryQualityLabel(item.quality))}</span>` : '',
      item.lifecycle_state ? `<span class="meta-pill">${item.lifecycle_state === 'archived' ? '已归档' : item.lifecycle_state === 'dormant' ? '休眠' : '活跃'}</span>` : ''
    ].filter(Boolean).join(' ');
    return `<tr class="memory-row ${Number(m.selected) === id ? 'is-selected' : ''}" data-memory-id="${id}" data-memory-kind="${esc(kind)}">
      <td><span class="tag">${esc(memoryKindLabel(kind))}</span></td>
      <td><b>${esc(title)}</b><span class="memory-detail">${esc(detail)}</span></td>
      <td>${esc(subject)}</td>
      <td>${esc(date)}</td>
      <td>${Number.isFinite(confidence) ? confidence.toFixed(2) : '—'}</td>
      <td>${tags}</td>
    </tr>`;
  }).join('');

  const selected = m.detail?.candidate || null;
  const evidence = m.detail?.evidence || [];
  const detailHtml = !selected ? '<div class="log-empty" style="padding:20px">选择一条记忆查看来源与证据</div>' : `
    <div class="memory-detail-head">
      <span class="tag">${esc(memoryKindLabel(selected.kind))}</span>
      <b>${esc(selected.summary || selected.value || selected.attr || `候选 #${selected.id}`)}</b>
      <span class="meta-pill">${esc(memoryStatusLabel(selected.status))}</span>
    </div>
    <div class="kv-grid">
      <div class="kv"><span>涉及谁</span><b>${esc(selected.subject_name || maskQq(selected.subject_qq) || '—')}</b></div>
      <div class="kv"><span>可信度</span><b>${esc(selected.confidence ?? '—')}</b></div>
      <div class="kv"><span>生效范围</span><b>${esc(memoryScopeLabel(selected.scope))}</b></div>
      <div class="kv"><span>可见范围</span><b>${esc(selected.visibility || '—')}</b></div>
      <div class="kv"><span>发生时间</span><b>${esc(selected.happened_at ? fmtTime(selected.happened_at) : '—')}</b></div>
      <div class="kv"><span>时间准确度</span><b>${esc(memoryTimePrecisionLabel(selected.time_precision))}</b></div>
      <div class="kv"><span>质量检查</span><b>${esc(memoryQualityLabel(selected.quality))}</b></div>
      <div class="kv"><span>记忆状态</span><b>${selected.lifecycle_state === 'archived' ? '已归档（仍可检索）' : selected.lifecycle_state === 'dormant' ? '休眠' : '活跃'}</b></div>
      <div class="kv"><span>活跃度</span><b>${selected.activation == null ? '—' : Number(selected.activation).toFixed(2)}</b></div>
      <div class="kv"><span>重要度</span><b>${selected.importance == null ? '—' : Number(selected.importance).toFixed(2)}</b></div>
      <div class="kv"><span>不采纳原因</span><b>${esc(selected.reason || '—')}</b></div>
    </div>
    ${selected.detail ? `<p class="service-detail">${esc(selected.detail)}</p>` : ''}
    <div class="section-title" style="margin-top:14px"><h3>来源消息</h3><span>仅在本机显示，不导出</span></div>
    ${evidence.length ? evidence.map((msg) => `
      <div class="memory-evidence">
        <span class="meta-pill">${msg.is_self ? '大肥鱼' : msg.is_owner ? '你' : '其他人'}</span>
        <span class="meta-pill">${esc(msg.sender_name || maskQq(msg.sender_qq) || '—')}</span>
        <span class="meta-pill">${fmtTime(msg.sent_at)}</span>
        <p>${esc(msg.text || msg.media_note || '（无文本）')}</p>
      </div>`).join('') : '<div class="log-empty" style="padding:12px">这条候选找不到原始消息（可能来自练习副本或旧数据）</div>'}
    ${modeTest ? `<div class="flow-actions" style="margin-top:14px">
      <button class="btn primary" data-memory-review="apply" data-memory-id="${selected.id}" type="button">确认并写入练习副本</button>
      <button class="btn danger" data-memory-review="reject" data-memory-id="${selected.id}" type="button">不记住这条</button>
    </div>` : '<div class="notice" style="margin-top:14px">真实记忆只能看，不能在这里批准或删除。想练习审核，请切换到「练习副本」。</div>'}
  `;

  return `
    <div class="notice">${modeTest ? '你正在看「练习副本」：这里的批准/拒绝只影响练习数据，不会改动真实记忆。' : '你正在看真实记忆：只能阅读，不能修改、删除或批准。想练习审核，请切换到「练习副本」。'}</div>
    <p class="service-detail" style="margin:8px 0 0">这里不是聊天记录，而是大肥鱼对人和事形成的长期印象。AI 先把它觉得值得记的内容放进「待确认」，确认后才会成为正式事实或事件。</p>
    <div class="memory-toolbar" style="margin-top:12px">
      <div class="segmented">
        <button class="btn ${m.mode === 'prod' ? 'primary' : ''}" data-memory-mode="prod" type="button">真实记忆（只读）</button>
        <button class="btn ${m.mode === 'test' ? 'primary' : ''}" data-memory-mode="test" type="button">练习副本</button>
      </div>
      <span class="meta-pill">${sourceLabel}</span>
      ${modeTest && !testExists ? '<button class="btn" id="memory-init-test" type="button">创建练习副本</button>' : ''}
      <button class="btn" id="memory-refresh" type="button">刷新</button>
    </div>
    <div class="grid grid-4 memory-stats">
      <section class="card stat"><span>观察模式</span><b class="${status.observeOnly ? 'warn' : 'ok'}">${status.observeOnly ? '开启' : '关闭'}</b><small>${status.observeOnly ? '只生成候选，不自动写入' : '会自动写入正式记忆'} · 检索${status.retrieval ? '已开启' : '关闭'}</small></section>
      <section class="card stat"><span>已确认事实 / 已记录事件</span><b>${counts.facts} / ${counts.events}</b><small>已生效事实 / 已记录事件</small></section>
      <section class="card stat"><span>待你确认</span><b class="${counts.pending ? 'warn' : ''}">${counts.pending}</b><small>其中已采纳 ${counts.applied} 条</small></section>
      <section class="card stat"><span>数据库自检</span><b class="${status.integrity === 'ok' ? 'ok' : 'warn'}">${status.integrity === 'ok' ? '正常' : '需检查'}</b><small>数据库 ${fmtSize(status.file.size)} + 写日志 ${fmtSize(status.wal.size)}</small></section>
    </div>
    ${m.dead && m.dead.length ? `<section class="card panel" style="margin-top:14px">
      <div class="section-title"><h3>提取死信</h3><span>${m.dead.length} 个失败批次</span></div>
      <p class="service-detail">这些批次已超过最大重试次数，消息被暂时跳过。重试只会重新排队抽取，不会删除已有记忆。</p>
      <div class="memory-table-wrap"><table class="table memory-table">
        <thead><tr><th>批次</th><th>会话</th><th>消息数</th><th>尝试</th><th>错误</th><th>操作</th></tr></thead>
        <tbody>${m.dead.map((row) => `<tr>
          <td><code>${esc(String(row.batch_key).slice(0, 14))}</code></td>
          <td>${esc(memoryScopeLabel(row.conv_key))}</td>
          <td>${Number(row.messageCount) || 0}</td>
          <td>${Number(row.attempts) || 0}</td>
          <td title="${esc(row.error || '')}">${esc(String(row.error || '—').slice(0, 50))}</td>
          <td><button class="btn" data-memory-dead-retry="${esc(row.batch_key)}" type="button">重试</button></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </section>` : ''}
    <section class="card panel" style="margin-top:14px">
      <div class="section-title"><h3>审核状态总览</h3><span>事实、人格与候选分开显示</span></div>
      <div class="grid grid-4 memory-stats">
        <div class="stat"><span>正式记忆</span><b>${counts.facts} 事实 / ${counts.events} 事件</b><small>已进入 facts/events</small></div>
        <div class="stat"><span>待审记忆候选</span><b class="${counts.pending ? 'warn' : ''}">${counts.pending}</b><small>observeOnly=${status.observeOnly ? '开启' : '关闭'}</small></div>
        <div class="stat"><span>人格成长</span><b>${status.growth?.activeTraits || 0} 生效 / ${status.growth?.candidateTraits || 0} 候选</b><small>另有 ${status.growth?.pendingCandidates || 0} 条成长候选待审</small></div>
        <div class="stat"><span>自动表达调整</span><b class="${status.growth?.autoApplyExpression ? 'warn' : 'ok'}">${status.growth?.autoApplyExpression ? '允许小步自动' : '仅候选'}</b><small>与事实提取 observeOnly 是两个独立开关</small></div>
      </div>
    </section>
    <div class="notice" style="margin-top:12px">数据库位置：${esc(status.dbPath)} ${status.error ? ` · 读取错误：${esc(status.error)}` : ''}</div>
    <section class="card panel" style="margin-top:14px">
      <div class="section-title"><h3>查找记忆</h3><span>当前查看：${sourceLabel}</span></div>
      <div class="memory-filters">
        <div class="segmented">
          ${['candidates', 'events', 'facts'].map((t) => `<button class="btn ${m.type === t ? 'primary' : ''}" data-memory-type="${t}" type="button">${t === 'candidates' ? '待确认候选' : t === 'events' ? '已记录事件' : '已确认事实'}</button>`).join('')}
        </div>
        <input id="memory-search" class="input" placeholder="搜索内容、人物或关键词" value="${esc(m.q)}" />
        <input id="memory-from" class="input" type="date" value="${esc(m.dateFrom)}" title="起始日期" />
        <input id="memory-to" class="input" type="date" value="${esc(m.dateTo)}" title="结束日期" />
        ${m.type === 'candidates' ? `<select id="memory-status" class="input">
          <option value="pending" ${m.status === 'pending' ? 'selected' : ''}>待确认</option>
          <option value="applied" ${m.status === 'applied' ? 'selected' : ''}>已采纳</option>
          <option value="rejected" ${m.status === 'rejected' ? 'selected' : ''}>已拒绝</option>
        </select>` : ''}
        <button class="btn primary" id="memory-apply-filters" type="button">筛选</button>
        <button class="btn" id="memory-reset-filters" type="button">重置</button>
      </div>
      <div class="memory-result-meta">共 ${m.list?.total ?? 0} 条，显示 ${rows.length} 条 · 排序：${m.type === 'events' ? '按发生时间' : m.type === 'facts' ? '按更新时间' : '按产生/发生时间'}</div>
      <div class="memory-table-wrap">
        <table class="table memory-table">
          <thead><tr><th>会变成</th><th>内容</th><th>涉及谁</th><th>时间</th><th>可信度</th><th>范围 / 状态</th></tr></thead>
          <tbody>${table || '<tr><td colspan="6" class="log-empty">没有匹配记录</td></tr>'}</tbody>
        </table>
      </div>
    </section>
    <section class="card panel" style="margin-top:14px">
      <div class="section-title"><h3>这条记忆的详情</h3><span>${modeTest ? '可在练习副本中操作' : '真实记忆只读'}</span></div>
      ${detailHtml}
    </section>`;
}
