'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const renderer = path.join(__dirname, '..', 'src', 'renderer');
const pages = fs.readdirSync(path.join(renderer, 'pages')).filter((name) => name.endsWith('.js'));
const app = fs.readFileSync(path.join(renderer, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(renderer, 'index.html'), 'utf8');

test('renderer page scripts are all loaded before app.js', () => {
  for (const name of pages) {
    assert.ok(html.includes(`pages/${name}`), `index.html missing pages/${name}`);
    assert.ok(html.indexOf(`pages/${name}`) < html.indexOf('app.js'), `${name} must load before app.js`);
  }
  assert.ok(fs.readFileSync(path.join(renderer, 'core', 'format.js'), 'utf8').includes('function fmtSize'));
  assert.ok(html.includes('core/format.js'));
});

test('renderer page entry points and PAGE_META remain defined', () => {
  assert.ok(app.includes('const PAGE_META = {'), 'PAGE_META missing');
  for (const name of ['overview', 'servicesPage', 'environmentPage', 'setupPage', 'embedPage', 'startupPage', 'logsPage', 'envPage', 'configPage', 'memoryPage', 'biliPage', 'backupsPage', 'aboutPage']) {
    const sources = [app, ...pages.map((file) => fs.readFileSync(path.join(renderer, 'pages', file), 'utf8'))];
    assert.ok(sources.some((source) => source.includes(`function ${name}(`)), `${name} missing`);
  }
});


test('select interactions are driven by change, not the opening click', () => {
  const clickStart = app.indexOf("document.addEventListener('click'");
  const changeStart = app.indexOf("document.addEventListener('change'");
  assert.ok(clickStart >= 0 && changeStart > clickStart);
  const clickHandler = app.slice(clickStart, changeStart);
  const changeHandler = app.slice(changeStart);
  assert.ok(clickHandler.includes("closest('select')"), 'click handler must ignore native selects');
  assert.ok(!clickHandler.includes("memory-sort"), 'memory sort must not refresh on click');
  assert.ok(changeHandler.includes("memory-sort"), 'memory sort must react on change');
});


test('update progress polls before the long update download IPC resolves', () => {
  const start = app.indexOf('function downloadUpdate()');
  const end = app.indexOf('async function openReleasePage()', start);
  assert.ok(start >= 0 && end > start);
  const body = app.slice(start, end);
  assert.ok(body.includes('const request = api.updateDownload()'));
  assert.ok(body.indexOf('pollUpdate()') < body.indexOf('await request'));
  const poll = app.slice(app.indexOf('function pollUpdate()'), app.indexOf('function downloadUpdate()'));
  assert.ok(poll.includes('startedAt'), 'poll must tolerate the task not appearing immediately');
  assert.ok(poll.includes('15000'), 'poll must have a bounded startup grace period');
});


test('memory page exposes the MaiBot import entry point', () => {
  const memory = fs.readFileSync(path.join(renderer, 'pages', 'memory.js'), 'utf8');
  assert.ok(memory.includes('memory-maibot-import'));
  assert.ok(app.includes('importMaiBotMemory'));
  assert.ok(app.includes('memoryMaiBotImport'));
});


test('native select options have readable light-popup colors', () => {
  const css = fs.readFileSync(path.join(renderer, 'styles.css'), 'utf8');
  assert.ok(css.includes('.input option'));
  assert.ok(css.includes('color: #111'));
  assert.ok(css.includes('background: #fff'));
});


test('guided tour is loaded before app and covers the first-run flow', () => {
  assert.ok(html.indexOf('components/guide.js') < html.indexOf('app.js'));
  assert.ok(html.includes('guide-root'));
  const guide = fs.readFileSync(path.join(renderer, 'components', 'guide.js'), 'utf8');
  assert.ok(guide.includes('GUIDE_STEPS'));
  assert.ok(guide.includes('请点击高亮位置'));
  assert.ok(app.includes('renderGuide(state)'));
  assert.ok(app.includes('startGuide'));
  assert.ok(fs.readFileSync(path.join(renderer, 'pages', 'about.js'), 'utf8').includes('guide-start'));
});


test('UX structure keeps overview actions, config labels and memory split', () => {
  const overview = fs.readFileSync(path.join(renderer, 'pages', 'overview.js'), 'utf8');
  const config = fs.readFileSync(path.join(renderer, 'pages', 'config.js'), 'utf8');
  const css = fs.readFileSync(path.join(renderer, 'styles.css'), 'utf8');
  assert.ok(overview.includes('overview-next'));
  assert.ok(overview.includes('newbie-bar'));
  assert.ok(config.includes('field-caption'));
  assert.ok(app.includes('layoutMemorySplit'));
  assert.ok(css.includes('.memory-split'));
});


test('config data management and services summary are wired', () => {
  const config = fs.readFileSync(path.join(renderer, 'pages', 'config.js'), 'utf8');
  const services = fs.readFileSync(path.join(renderer, 'pages', 'services.js'), 'utf8');
  assert.ok(config.includes('cfg-export'));
  assert.ok(config.includes('cfg-import'));
  assert.ok(services.includes('control-start-all'));
  assert.ok(app.includes('exportDesktopConfig'));
  assert.ok(app.includes('startAllServices'));
});


test('theme, guide targets and Bilibili polish are wired', () => {
  const config = fs.readFileSync(path.join(renderer, 'pages', 'config.js'), 'utf8');
  const css = fs.readFileSync(path.join(renderer, 'styles.css'), 'utf8');
  const guide = fs.readFileSync(path.join(renderer, 'components', 'guide.js'), 'utf8');
  assert.ok(config.includes('cfg-theme'));
  assert.ok(css.includes('html[data-theme="light"]'));
  assert.ok(guide.includes('data-guide-target="services-nav"'));
  assert.ok(app.includes('polishBiliTable'));
});
