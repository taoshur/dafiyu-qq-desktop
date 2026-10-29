'use strict';

function progressBar(percent, label = '') {
  const value = percent == null ? 8 : Math.max(2, Math.min(100, Number(percent) || 0));
  return `<div class="install-bar"${label ? ` aria-label="${esc(label)}"` : ''}><i style="width:${value}%"></i></div>`;
}
