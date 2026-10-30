/**
 * Lightweight, dependency-free guided tour.
 *
 * The tour never performs a privileged action. It only highlights the real
 * control and explains the next click; the user still operates the app.
 */
const GUIDE_STEPS = Object.freeze([
  {
    page: 'overview',
    selector: '[data-guide-target="overview-status"]',
    title: '先看三个服务',
    body: '绿色表示在线。SnowLuma 是 QQ 网关，DSH 是智能体宿主，qq-bridge 负责收发消息。三个都绿色，QQ 链路才算完整。'
  },
  {
    page: 'overview',
    selector: '[data-guide-target="services-nav"]',
    waitFor: '[data-guide-target="services-nav"]',
    title: '打开服务页',
    body: '以后启动、停止、重启服务都在这里。点击高亮的「服务」继续。'
  },
  {
    page: 'services',
    selector: '[data-guide-target="control-toggle"]',
    title: '真实控制开关',
    body: '默认关闭是安全保护。如果这里显示「启用真实控制」，可以点它开启；如果已经显示「关闭真实控制」，说明已开启，直接点下一步，不要为了教程把它关掉。'
  },
  {
    page: 'services',
    selector: '[data-guide-target="bridge-start"]',
    waitFor: '[data-guide-target="bridge-start"]',
    title: '按顺序启动',
    body: '顺序是 SnowLuma → DSH → qq-bridge。先保证网关在线，再启动 bridge；点击高亮的启动按钮试试。'
  },
  {
    page: 'services',
    selector: '[data-guide-target="memory-nav"]',
    waitFor: '[data-guide-target="memory-nav"]',
    title: '看看长期记忆',
    body: '这里能看到大肥鱼记住的事。点击「长期记忆」继续。'
  },
  {
    page: 'memory',
    selector: '[data-guide-target="memory-candidates"]',
    title: '候选需要你确认',
    body: '模型抽出的内容先进入「待确认候选」。你可以批准、编辑或拒绝；observeOnly 开启时不会自动写入正式记忆。'
  },
  {
    page: 'memory',
    selector: '[data-guide-target="maibot-import"]',
    title: '也可以导入旧记忆',
    body: '这里可以导入 MaiBot 记忆。导入只会生成待审核候选，不会直接改人格或正式记忆。'
  },
  {
    page: 'memory',
    selector: '[data-guide-target="sidebar"]',
    title: '关闭窗口不是退出程序',
    body: '点右上角 × 只会隐藏到托盘，机器人继续运行。要完全退出，右键托盘图标，选择「退出并停止我启动的服务（快速）」或「仅退出界面」。'
  }
]);

function guideHtmlFor(state) {
  const step = GUIDE_STEPS[state.guide.step];
  if (!step) return '';
  const target = document.querySelector(step.selector);
  let spot = '';
  let bubbleStyle = 'left:50%;top:50%;transform:translate(-50%,-50%)';
  if (target) {
    const rect = target.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const pad = 7;
      spot = `<div class="guide-spot" style="left:${Math.max(0, rect.left - pad)}px;top:${Math.max(0, rect.top - pad)}px;width:${rect.width + pad * 2}px;height:${rect.height + pad * 2}px"></div>`;
      const width = Math.min(340, window.innerWidth - 24);
      let left = rect.left;
      let top = rect.bottom + 14;
      const estimatedHeight = 190;
      if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
      if (left < 12) left = 12;
      if (top + estimatedHeight > window.innerHeight - 12) top = Math.max(12, rect.top - estimatedHeight - 14);
      bubbleStyle = `left:${left}px;top:${top}px;width:${width}px`;
    }
  }
  const nextLabel = step.waitFor ? '跳过这步' : (state.guide.step === GUIDE_STEPS.length - 1 ? '完成' : '下一步');
  return `
    <div class="guide-backdrop ${target ? 'has-spot' : ''}"></div>
    ${spot}
    <section class="guide-bubble" style="${bubbleStyle}" role="dialog" aria-modal="true" aria-label="新手教程">
      <div class="guide-progress">${state.guide.step + 1} / ${GUIDE_STEPS.length}</div>
      <h4>${esc(step.title)}</h4>
      <p>${esc(step.body)}</p>
      <div class="guide-actions">
        <button class="btn" data-guide-close type="button">退出教程</button>
        <div class="guide-nav">
          ${state.guide.step > 0 ? '<button class="btn" data-guide-back type="button">上一步</button>' : ''}
          ${step.waitFor ? '<span class="guide-wait">请点击高亮位置</span>' : ''}
          <button class="btn primary" data-guide-next type="button">${nextLabel}</button>
        </div>
      </div>
    </section>`;
}

function renderGuide(state) {
  const root = document.getElementById('guide-root');
  if (!root) return;
  if (!state.guide.open) {
    root.innerHTML = '';
    return;
  }
  const step = GUIDE_STEPS[state.guide.step];
  if (step?.selector) {
    const target = document.querySelector(step.selector);
    if (target && target.scrollIntoView && !target.dataset.guideScrolled) {
      target.dataset.guideScrolled = '1';
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }
  }
  root.innerHTML = guideHtmlFor(state);
}

function guideAdvance(state, delta = 1) {
  state.guide.step = Math.max(0, Math.min(GUIDE_STEPS.length - 1, state.guide.step + delta));
  renderGuide(state);
}

function guideClose(state) {
  state.guide.open = false;
  try { localStorage.setItem('dafiyu.guide.completed.v1', '1'); } catch { /* ignore */ }
  renderGuide(state);
}

function guideStart(state) {
  state.guide.open = true;
  state.guide.step = 0;
  try { localStorage.removeItem('dafiyu.guide.completed.v1'); } catch { /* ignore */ }
  renderGuide(state);
}
