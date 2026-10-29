// Android 模拟器控制 MCP server（stdio）。
//
// 给 QQ 智能体一套「用手玩手机」的能力：看屏幕、点、滑、打字、开 App。
// 只连本机 adb 上的模拟器（默认 emulator-5554），不暴露 shell / 安装 / 卸载这类危险动作。
//
// 设计要点：
// - 截图统一下采样到 960 宽再返回，960x540 的 PNG 约 200~400KB，原图 1080p 要 900KB+，
//   每轮都发原图会把上下文和传输都撑爆。
// - 除了截图，还提供 uiautomator 的「文字版界面树」android_ui：模型看图不稳时，
//   按文字 + 坐标点更可靠（尤其是弹窗、按钮文字明确的界面）。
// - 所有坐标按 1080p 实际分辨率传，服务端做边界钳制，避免点出屏幕。
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';

const STATE_DIR = process.env.QQ_BRIDGE_STATE_DIR
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'state');
const SHARES_DIR = path.join(STATE_DIR, 'shares');

// adb/ffmpeg 默认走 PATH（可用 ADB_PATH / FFMPEG_PATH 覆盖），不再写死本机安装路径。
const ADB = process.env.ADB_PATH || 'adb';
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const SERIAL = process.env.ANDROID_SERIAL || 'emulator-5554';
const MAX_TEXT = 200;

const server = new McpServer({ name: 'android-agent', version: '1.0.0' });

function adb(args, { timeout = 20000, binary = false } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      ADB,
      ['-s', SERIAL, ...args],
      { timeout, windowsHide: true, encoding: binary ? 'buffer' : 'utf8', maxBuffer: 48 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr || error.message || '').trim().slice(-300);
          reject(new Error(detail || 'adb 执行失败'));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

// 逻辑分辨率的可靠来源是截图本身：screencap 给的就是「当前旋转后」的画面。
// （dumpsys 里的旋转字段在不同 Android 版本叫法不一样，靠不住。）
let sizeCache = { at: 0, w: 0, h: 0 };

function pngSize(buf) {
  if (!buf || buf.length < 33) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w > 0 && h > 0 && w < 10000 && h < 10000) return { w, h };
  return null;
}

async function screenSize() {
  if (Date.now() - sizeCache.at < 2000 && sizeCache.w) return { w: sizeCache.w, h: sizeCache.h };
  try {
    const png = await adb(['exec-out', 'screencap', '-p'], { binary: true, timeout: 15000 });
    const size = pngSize(png);
    if (size) {
      sizeCache = { at: Date.now(), w: size.w, h: size.h };
      return { w: size.w, h: size.h };
    }
  } catch {}
  try {
    const out = await adb(['shell', 'wm', 'size']);
    const m = /(\d+)x(\d+)/.exec(out);
    if (m) return { w: Number(m[1]), h: Number(m[2]) };
  } catch {}
  return { w: 1920, h: 1080 };
}

const APP_NAMES = {
  'com.happyelements.AndroidAnimal': '开心消消乐',
  'tv.danmaku.bili': '哔哩哔哩',
  'com.android.launcher3': '桌面'
};

function friendlyApp(pkg, activity) {
  const name = APP_NAMES[pkg];
  if (!name) return `${pkg}/${activity}`;
  return `${name}（${pkg}）`;
}

async function currentApp() {
  try {
    const out = await adb(['shell', 'dumpsys window | grep -E "mCurrentFocus|mFocusedApp"']);
    const m = /(?:mCurrentFocus|mFocusedApp)=.*?([a-zA-Z][\w.]*)\/([\w.$]+)/.exec(out);
    if (m) return friendlyApp(m[1], m[2]);
    return out.trim().split('\n')[0]?.trim() || '未知';
  } catch {
    return '未知';
  }
}

async function foregroundPackage() {
  try {
    const out = await adb(['shell', 'dumpsys window | grep -E "mCurrentFocus|mFocusedApp"']);
    const m = /(?:mCurrentFocus|mFocusedApp)=.*?([a-zA-Z][\w.]*)\/([\w.$]+)/.exec(out);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

function playHint(app) {
  return String(app).includes('开心消消乐')
    ? ' · 玩法：点一个方块、再点相邻方块交换，三个同色连成线才消除；点完画面没变化说明这步无效，换一对相邻的。'
    : '';
}

// 1080p 原图约 900KB，缩到 960 宽再发给模型
function downscalePng(buf, width = 960) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(FFMPEG, [
        '-hide_banner', '-loglevel', 'error',
        '-i', 'pipe:0',
        '-vf', `scale=${width}:-2`,
        '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'
      ], { windowsHide: true });
    } catch {
      resolve(buf);
      return;
    }
    const chunks = [];
    let settled = false;
    const done = (out) => { if (!settled) { settled = true; resolve(out); } };
    child.stdout.on('data', (c) => chunks.push(c));
    child.on('close', () => done(Buffer.concat(chunks).length > 1000 ? Buffer.concat(chunks) : buf));
    child.on('error', () => done(buf));
    child.stdin.on('error', () => {});
    child.stdin.end(buf);
    setTimeout(() => { try { child.kill(); } catch {} done(buf); }, 8000);
  });
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.trunc(Number(n) || 0)));
}

// 统一截图入口：返回 PNG 缓冲 + 当前逻辑分辨率，供 screenshot / batch 复用
async function captureImage(width = 960) {
  const png = await adb(['exec-out', 'screencap', '-p'], { binary: true });
  if (!png || png.length < 1000) throw new Error('截图失败（返回为空）');
  const dims = pngSize(png);
  if (dims) sizeCache = { at: Date.now(), w: dims.w, h: dims.h };
  const small = await downscalePng(png, width);
  return { data: small, dims: dims || await screenSize() };
}

// ── 听声音 ────────────────────────────────────────────────────────────
// 模拟器的声音走系统默认播放设备。要“听”它，就把默认播放切到 VB-CABLE 的
// CABLE Input，再从 CABLE Output（录音端）录一段，最后把默认设备还原，否则
// 用户会突然没声音。转写复用 QQ 语音那套 faster-whisper（--plain 关掉热词）。
const AUDIO_DLL = process.env.AUDIO_DEVICE_DLL
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'AudioDeviceCmdlets.dll');
const ASR_PYTHON = process.env.ASR_PYTHON
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'rvc-venv', 'Scripts', 'python.exe');
const VOICE2TEXT = process.env.VOICE2TEXT
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'voice2text.py');
const CABLE_OUT = process.env.CABLE_OUT_DEVICE || 'CABLE Output (VB-Audio Virtual Cable)';

// 切换默认播放设备前把「原本是哪台」记到磁盘：MCP 进程被重启/杀掉时
// finally 不会执行，用户的电脑就会一直没声音——所以要能事后自愈。
const AUDIO_STATE_FILE = path.join(STATE_DIR, 'audio-device.json');

async function restoreDefaultPlaybackIfStuck() {
  try {
    if (!fs.existsSync(AUDIO_STATE_FILE)) return;
    const saved = JSON.parse(String(fs.readFileSync(AUDIO_STATE_FILE, 'utf8') || '{}').replace(/^\uFEFF/, ''));
    const cur = await runPwsh(`Import-Module '${AUDIO_DLL}'; (Get-AudioDevice -Playback).Name`);
    const name = String(cur || '').trim();
    if (!/CABLE (Input|Output)/i.test(name)) {
      // 当前不是虚拟声卡，说明已经是正常设备，只清理陈旧记录
      try { fs.unlinkSync(AUDIO_STATE_FILE); } catch {}
      return;
    }
    if (!saved.prevIndex) return;
    await runPwsh(`Import-Module '${AUDIO_DLL}'; Set-AudioDevice -Index ${saved.prevIndex} | Out-Null`);
    try { fs.unlinkSync(AUDIO_STATE_FILE); } catch {}
    console.error(`[audio] 检测到默认播放被留在虚拟声卡上，已还原到 index ${saved.prevIndex}`);
  } catch {}
}


// 这个 MCP 进程的 PATH 里没有 pwsh（只有 Windows PowerShell），所以写全路径。
const PWSH = process.env.PWSH_PATH || 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

function runPwsh(command, timeout = 20000) {
  return new Promise((resolve, reject) => {
    execFile(PWSH, ['-NoProfile', '-NonInteractive', '-Command', command],
      { timeout, windowsHide: true, encoding: 'utf8' },
      (error, stdout, stderr) => error ? reject(new Error(String(stderr || error.message).trim())) : resolve(String(stdout || '').trim()));
  });
}

function runFfmpeg(args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG, args, { timeout, windowsHide: true, encoding: 'utf8' },
      (error, stdout, stderr) => error ? reject(new Error(String(stderr || error.message).trim().slice(-300))) : resolve(String(stderr || '')));
  });
}

function parsePlan(plan) {
  const out = [];
  for (const raw of String(plan || '').split(/[;\n]+/)) {
    const seg = raw.trim();
    if (!seg) continue;
    const parts = seg.split(/\s+/);
    const type = parts[0];
    const nums = parts.slice(1).map(Number);
    if (type === 'tapN') out.push({ type, nx: nums[0], ny: nums[1] });
    else if (type === 'tap') out.push({ type, x: nums[0], y: nums[1] });
    else if (type === 'wait') out.push({ type, ms: nums[0] });
    else if (type === 'swipe') out.push({ type, x1: nums[0], y1: nums[1], x2: nums[2], y2: nums[3], ms: nums[4] });
    else if (type === 'key') out.push({ type, key: parts[1] });
    else if (type === 'text') out.push({ type, text: parts.slice(1).join(' ') });
    else throw new Error(`plan 里认不出的动作：${type}`);
  }
  return out;
}

server.tool(
  'android_listen',
  '听模拟器现在在放的声音（视频里的说话/歌声），录几秒转成文字。刷到唱歌、讲解、剧情时用，能知道唱的是什么、说了什么；纯音乐通常只能得到很少的字。',
  { seconds: z.number().min(3).max(20).optional().describe('录几秒，默认 8；唱到副歌可以录长一点') },
  async ({ seconds }) => {
    const secs = Math.max(3, Math.min(20, Number(seconds) || 8));
    const outWav = path.join(STATE_DIR, `listen-${Date.now()}.wav`);
    let prevPlayback = '';
    let switched = false;
    try {
      // 1) 记下当前默认播放设备，并切到 CABLE Input（模拟器的声音会流进虚拟声卡）
      const info = await runPwsh(`Import-Module '${AUDIO_DLL}'; $p=(Get-AudioDevice -Playback).Index; $c=(Get-AudioDevice -List | Where-Object { $_.Type -eq 'Playback' -and $_.Name -like 'CABLE Input*' } | Select-Object -First 1).Index; \"$p|$c\"`);
      const [prev, cable] = String(info).split('|');
      prevPlayback = String(prev || '').trim();
      const cableIndex = String(cable || '').trim();
      if (!prevPlayback || !cableIndex) throw new Error('找不到音频设备（VB-CABLE 装了吗？）');
      // 如果上一次没来得及还原（进程被杀），先用磁盘里记的原始设备纠偏
      try {
        if (fs.existsSync(AUDIO_STATE_FILE)) {
          const saved = JSON.parse(String(fs.readFileSync(AUDIO_STATE_FILE, 'utf8') || '{}').replace(/^\uFEFF/, ''));
          if (saved.prevIndex && String(saved.prevIndex) !== prevPlayback) prevPlayback = String(saved.prevIndex);
        }
        fs.writeFileSync(AUDIO_STATE_FILE, JSON.stringify({ prevIndex: prevPlayback, at: Date.now() }));
      } catch {}
      await runPwsh(`Import-Module '${AUDIO_DLL}'; Set-AudioDevice -Index ${cableIndex} | Out-Null`);
      switched = true;
      await new Promise((r) => setTimeout(r, 600));
      // 2) 录一段
      await runFfmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-f', 'dshow', '-i', `audio=${CABLE_OUT}`, '-t', String(secs), '-ac', '1', '-ar', '16000', outWav], secs * 1000 + 30000);
      // 3) 先把声音还回去，再做转写（转写要一两秒，不能让用户一直没声音）
      await runPwsh(`Import-Module '${AUDIO_DLL}'; Set-AudioDevice -Index ${prevPlayback} | Out-Null`);
      switched = false;
      // 4) 转写
      const text = await new Promise((resolve, reject) => {
        execFile(ASR_PYTHON, [VOICE2TEXT, outWav, '--plain'],
          { timeout: 120000, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', HF_HUB_OFFLINE: '1' }, maxBuffer: 8 * 1024 * 1024 },
          (error, stdout) => error ? reject(error) : resolve(String(stdout || '').trim()));
      });
      const heard = text || '';
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: true,
            seconds: secs,
            heard,
            note: heard ? '这是录到的声音转出来的文字' : '这段没听清人声（可能是纯音乐或太小声）'
          })
        }]
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `听声音失败：${error?.message ?? error}` }], isError: true };
    } finally {
      // 兜底：不管成功失败，都要把默认播放设备还原
      if (switched && prevPlayback) {
        try { await runPwsh(`Import-Module '${AUDIO_DLL}'; Set-AudioDevice -Index ${prevPlayback} | Out-Null`); } catch {}
        try { fs.unlinkSync(AUDIO_STATE_FILE); } catch {}
      }
      try { fs.unlinkSync(outWav); } catch {}
    }
  }
);

server.tool(
  'android_capture_share',
  '把当前屏幕截一张图、存成可发送的图片，返回 shareId。之后的 qq_send_image(shareId, 一句话) 会把它发到聊天里——刷到好看的视频/图片时用。',
  { width: z.number().min(480).max(1280).optional().describe('截图宽度，默认 720；发送用 720 就够') },
  async ({ width }) => {
    try {
      const shot = await captureImage(width || 720);
      fs.mkdirSync(SHARES_DIR, { recursive: true });
      // 顺手清理 2 小时前的旧图，避免堆一堆
      try {
        const now = Date.now();
        for (const name of fs.readdirSync(SHARES_DIR)) {
          const full = path.join(SHARES_DIR, name);
          const stat = fs.statSync(full);
          if (now - stat.mtimeMs > 2 * 60 * 60 * 1000) fs.unlinkSync(full);
        }
      } catch {}
      const shareId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      fs.writeFileSync(path.join(SHARES_DIR, `${shareId}.png`), shot.data);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: true,
            shareId,
            screen: shot.dims ? `${shot.dims.w}x${shot.dims.h}` : '',
            hint: `要发出去就用 qq_send_image({ shareId: "${shareId}", message: "一句好看在哪" })`
          })
        }]
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `截图保存失败：${error?.message ?? error}` }], isError: true };
    }
  }
);

server.tool(
  'android_status',
  '查看安卓模拟器状态：是否连上、屏幕分辨率、当前前台 App。开玩之前先调这个确认环境。',
  {},
  async () => {
    try {
      const devices = await new Promise((resolve) => {
        execFile(ADB, ['devices'], { timeout: 10000, windowsHide: true }, (e, out) => resolve(String(out || '')));
      });
      const connected = devices.includes(`${SERIAL}\tdevice`);
      const size = await screenSize();
      const app = connected ? await currentApp() : '未连接';
      const orientation = size.w > size.h ? '横屏' : '竖屏';
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            connected,
            serial: SERIAL,
            screen: `${size.w}x${size.h}`,
            orientation,
            currentApp: app,
            hint: `点击坐标按 ${size.w}x${size.h} 这个逻辑分辨率算；截图宽度固定 960，把图上坐标 ×${(size.w / 960).toFixed(3)} 就是实际坐标`,
            devices: devices.trim()
          }, null, 2)
        }]
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `查询模拟器失败：${error?.message ?? error}` }], isError: true };
    }
  }
);

server.tool(
  'android_screenshot',
  '截一张模拟器当前画面（默认缩到 960 宽，可传 width 更小以加快识别）。看完决定下一步点哪里；连续操作时每次点完再截一张确认结果，不要盲点。坐标换算：截图宽 = width，乘 android_status 里给的系数即为实际坐标。',
  {
    width: z.number().int().min(480).max(1280).optional().describe('缩略图宽度，默认 960；想快一点可用 720')
  },
  async ({ width }) => {
    try {
      const w0 = Math.max(480, Math.min(1280, Number(width) || 960));
      const { data: small, dims: size } = await captureImage(w0);
      const app = await currentApp();
      const factor = (size.w / w0).toFixed(3);
      return {
        content: [
          { type: 'text', text: `截图：${SERIAL} 前台 ${app} · 逻辑分辨率 ${size.w}x${size.h}（${size.w > size.h ? '横屏' : '竖屏'}）· 缩略图宽 ${w0}（${Math.round(small.length / 1024)}KB）· 图上坐标 ×${factor} = 实际坐标${playHint(app)}` },
          { type: 'image', mimeType: 'image/png', data: small.toString('base64') }
        ]
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `截图失败：${error?.message ?? error}` }], isError: true };
    }
  }
);

server.tool(
  'android_ui',
  '读取当前界面的「文字版界面树」：列出带文字/描述的控件及其中点坐标。看截图不方便或按钮文字明确时用这个，按坐标点。',
  {
    max: z.number().int().min(5).max(120).optional().describe('最多返回多少个控件（默认 40）')
  },
  async ({ max }) => {
    try {
      await adb(['shell', 'uiautomator', 'dump', '/sdcard/ui.xml'], { timeout: 30000 });
      const xml = await adb(['shell', 'cat', '/sdcard/ui.xml'], { timeout: 15000 });
      const nodes = [];
      const tagRe = /<node\b[^>]*>/g;
      let m;
      while ((m = tagRe.exec(xml))) {
        const tag = m[0];
        const attr = (name) => {
          const r = new RegExp(`${name}="([^"]*)"`).exec(tag);
          return r ? r[1] : '';
        };
        const text = attr('text').trim();
        const desc = attr('content-desc').trim();
        const bounds = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(tag);
        if (!bounds) continue;
        if (!text && !desc) continue;
        const [x1, y1, x2, y2] = bounds.slice(1).map(Number);
        if (x2 - x1 < 8 || y2 - y1 < 8) continue;
        nodes.push({
          text: text.slice(0, 40),
          desc: desc.slice(0, 40),
          clickable: attr('clickable') === 'true',
          x: Math.round((x1 + x2) / 2),
          y: Math.round((y1 + y2) / 2),
          w: x2 - x1,
          h: y2 - y1
        });
      }
      const limit = Math.max(5, Math.min(120, Number(max) || 40));
      const app = await currentApp();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ app, total: nodes.length, shown: Math.min(limit, nodes.length), nodes: nodes.slice(0, limit) }, null, 2)
        }]
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `读取界面树失败：${error?.message ?? error}` }], isError: true };
    }
  }
);

server.tool(
  'android_tap',
  '点击模拟器屏幕。两种给坐标的方式（二选一）：① 绝对坐标 x/y（按 android_status 的逻辑分辨率，如 1080x1920）；② 归一化 nx/ny（0~1，按截图里看到的相对位置，最省事、不用换算）。',
  {
    x: z.number().optional().describe('绝对横坐标'),
    y: z.number().optional().describe('绝对纵坐标'),
    nx: z.number().min(0).max(1).optional().describe('归一化横坐标 0~1（图像宽度方向）'),
    ny: z.number().min(0).max(1).optional().describe('归一化纵坐标 0~1（图像高度方向）')
  },
  async ({ x, y, nx, ny }) => {
    try {
      const { w, h } = await screenSize();
      const hasN = nx !== undefined || ny !== undefined;
      if (!hasN && (x === undefined || y === undefined)) throw new Error('需要 x/y 或 nx/ny');
      const px = hasN ? clamp(Math.round((Number(nx) || 0) * (w - 1)), 0, w - 1) : clamp(x, 0, w - 1);
      const py = hasN ? clamp(Math.round((Number(ny) || 0) * (h - 1)), 0, h - 1) : clamp(y, 0, h - 1);
      await adb(['shell', 'input', 'tap', String(px), String(py)]);
      return { content: [{ type: 'text', text: `已点击 (${px}, ${py}) / 逻辑 ${w}x${h}（adb shell input tap ${px} ${py}）` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `点击失败：${error?.message ?? error}` }], isError: true };
    }
  }
);

server.tool(
  'android_swipe',
  '在模拟器上滑动（比如翻页、拖动画布）。',
  {
    x1: z.number().describe('起点横坐标'),
    y1: z.number().describe('起点纵坐标'),
    x2: z.number().describe('终点横坐标'),
    y2: z.number().describe('终点纵坐标'),
    duration_ms: z.number().int().min(50).max(5000).optional().describe('滑动时长（毫秒），默认 300')
  },
  async ({ x1, y1, x2, y2, duration_ms }) => {
    try {
      const { w, h } = await screenSize();
      const args = [x1, y1, x2, y2].map((v, i) => clamp(v, 0, i % 2 === 0 ? w - 1 : h - 1));
      const d = Math.max(50, Math.min(5000, Number(duration_ms) || 300));
      await adb(['shell', 'input', 'swipe', ...args.map(String), String(d)]);
      return { content: [{ type: 'text', text: `已滑动 (${args[0]},${args[1]}) → (${args[2]},${args[3]})，${d}ms` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `滑动失败：${error?.message ?? error}` }], isError: true };
    }
  }
);

const KEY_MAP = {
  back: 'KEYCODE_BACK',
  home: 'KEYCODE_HOME',
  recents: 'KEYCODE_APP_SWITCH',
  enter: 'KEYCODE_ENTER',
  menu: 'KEYCODE_MENU',
  power: 'KEYCODE_POWER',
  volume_up: 'KEYCODE_VOLUME_UP',
  volume_down: 'KEYCODE_VOLUME_DOWN'
};

server.tool(
  'android_key',
  '按一个系统键：返回 / 回桌面 / 最近任务 / 回车 / 电源 / 音量。返回键在 App 内通常能关弹窗或退一层。',
  {
    key: z.enum(Object.keys(KEY_MAP)).describe('按键名')
  },
  async ({ key }) => {
    try {
      await adb(['shell', 'input', 'keyevent', KEY_MAP[key]]);
      return { content: [{ type: 'text', text: `已按 ${key}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `按键失败：${error?.message ?? error}` }], isError: true };
    }
  }
);

server.tool(  'android_batch',
  '一次执行多步操作（点/相对点/滑/按键/等待/输文字），最后可选截一张图。玩的时候用它把「连点弹窗、连续几步」合成一次调用，能省掉好几轮来回，比一步一调快很多。建议一次不超过 8 步。',
  {
    actions: z.array(z.object({
      type: z.enum(['tap', 'tapN', 'swipe', 'key', 'wait', 'text']).describe('动作类型：tap=绝对坐标点，tapN=0~1 相对坐标点，swipe=滑，key=按键，wait=等待，text=输入文字'),
      x: z.number().optional().describe('tap 的横坐标'),
      y: z.number().optional().describe('tap 的纵坐标'),
      nx: z.number().min(0).max(1).optional().describe('tapN 的相对横坐标 0~1'),
      ny: z.number().min(0).max(1).optional().describe('tapN 的相对纵坐标 0~1'),
      x1: z.number().optional(), y1: z.number().optional(),
      x2: z.number().optional(), y2: z.number().optional(),
      ms: z.number().int().min(50).max(5000).optional().describe('swipe 时长 / wait 毫秒数'),
      key: z.enum(Object.keys(KEY_MAP)).optional().describe('key 动作的按键名'),
      text: z.string().optional().describe('text 动作要输入的文字')
    })).min(1).max(20).optional().describe('按顺序执行的动作列表（给了 plan 时可以省略）'),
    plan: z.string().optional().describe('用一行文本描述动作序列（比嵌套 JSON 不容易写坏，长序列优先用它）。格式：分号或换行分隔，每步空白分隔。例：tapN 0.5 0.6; wait 300; tapN 0.3 0.42; swipe 0.5 0.7 0.5 0.3 400; key back; text 你好'),
    screenshot: z.boolean().optional().describe('执行完是否返回一张截图（默认 true）'),
    width: z.number().int().min(480).max(1280).optional().describe('截图宽度，默认 960；想快可用 720')
  },
  async ({ actions, plan, screenshot, width }) => {
    try {
      const parsed = Array.isArray(actions) && actions.length ? actions : parsePlan(plan);
      if (!parsed.length) throw new Error('actions 或 plan 至少给一个');
      actions = parsed;
      const { w, h } = await screenSize();
      const notes = [];
      for (const a of actions) {
        const type = String(a?.type || '');
        if (type === 'tap') {
          const px = clamp(a.x, 0, w - 1); const py = clamp(a.y, 0, h - 1);
          await adb(['shell', 'input', 'tap', String(px), String(py)]);
          notes.push(`点(${px},${py})`);
        } else if (type === 'tapN') {
          const px = clamp(Math.round((Number(a.nx) || 0) * (w - 1)), 0, w - 1);
          const py = clamp(Math.round((Number(a.ny) || 0) * (h - 1)), 0, h - 1);
          await adb(['shell', 'input', 'tap', String(px), String(py)]);
          notes.push(`点(${px},${py})`);
        } else if (type === 'swipe') {
          const px1 = clamp(a.x1, 0, w - 1); const py1 = clamp(a.y1, 0, h - 1);
          const px2 = clamp(a.x2, 0, w - 1); const py2 = clamp(a.y2, 0, h - 1);
          const d = Math.max(50, Math.min(5000, Number(a.ms) || 300));
          await adb(['shell', 'input', 'swipe', String(px1), String(py1), String(px2), String(py2), String(d)]);
          notes.push(`滑(${px1},${py1})→(${px2},${py2})`);
        } else if (type === 'key') {
          if (!KEY_MAP[a.key]) throw new Error(`未知按键 ${a.key}`);
          await adb(['shell', 'input', 'keyevent', KEY_MAP[a.key]]);
          notes.push(`按${a.key}`);
        } else if (type === 'wait') {
          const ms = Math.max(50, Math.min(5000, Number(a.ms) || 300));
          await new Promise((r) => setTimeout(r, ms));
          notes.push(`等${ms}ms`);
        } else if (type === 'text') {
          const raw = String(a.text || '').slice(0, MAX_TEXT);
          const escaped = raw.replace(/[\\"']/g, '').replace(/ /g, '%s');
          await adb(['shell', 'input', 'text', escaped]);
          notes.push(`输入${raw.length}字`);
        } else {
          throw new Error(`未知动作类型 ${type}`);
        }
        await new Promise((r) => setTimeout(r, 120));
      }
      const summary = `批量执行 ${notes.length} 步：${notes.join(' → ')}`;
      if (screenshot === false) {
        return { content: [{ type: 'text', text: summary }] };
      }
      const w0 = Math.max(480, Math.min(1280, Number(width) || 960));
      const { data: small, dims: size } = await captureImage(w0);
      const app = await currentApp();
      return {
        content: [
          { type: 'text', text: `${summary}\n截图：前台 ${app} · 逻辑分辨率 ${size.w}x${size.h} · 缩略图宽 ${w0} · 图上坐标 ×${(size.w / w0).toFixed(3)}${playHint(app)}` },
          { type: 'image', mimeType: 'image/png', data: small.toString('base64') }
        ]
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `批量操作失败：${error?.message ?? error}` }], isError: true };
    }
  }
);

server.tool(
  'android_text',
  '往当前输入框输入文字（英文/数字/常见符号；中文输入不保证，最好用 App 内的搜索联想）。',
  {
    text: z.string().describe('要输入的文字，最多 200 字')
  },
  async ({ text }) => {
    try {
      const raw = String(text || '').slice(0, MAX_TEXT);
      if (!raw) throw new Error('text 不能为空');
      // adb input text 用 %s 表示空格，并且不能带引号/反斜杠
      const escaped = raw.replace(/[\\"']/g, '').replace(/ /g, '%s');
      await adb(['shell', 'input', 'text', escaped]);
      return { content: [{ type: 'text', text: `已输入 ${raw.length} 个字符` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `输入失败：${error?.message ?? error}` }], isError: true };
    }
  }
);

server.tool(
  'android_launch',
  '按包名启动一个 App。开心消消乐：com.happyelements.AndroidAnimal；哔哩哔哩：tv.danmaku.bili。',
  {
    package: z.string().describe('Android 包名')
  },
  async ({ package: pkg }) => {
    try {
      const name = String(pkg || '').trim();
      if (!/^[a-zA-Z][\w.]*$/.test(name)) throw new Error('包名格式不对');
      await adb(['shell', 'monkey', '-p', name, '-c', 'android.intent.category.LAUNCHER', '1'], { timeout: 30000 });
      return { content: [{ type: 'text', text: `已启动 ${name}（稍等 1~2 秒再截图）` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `启动失败：${error?.message ?? error}` }], isError: true };
    }
  }
);

// 允许她自己关掉的 App：玩腻了随时能关，但只限游戏/视频这类，不去动系统界面
const CLOSABLE = new Set([
  'com.happyelements.AndroidAnimal',
  'tv.danmaku.bili'
]);

server.tool(
  'android_close',
  '关掉正在玩的游戏/视频（把 App 退到后台）。玩腻了想停就用它，不用请示；关掉后想玩再 android_launch 打开。',
  {
    package: z.string().optional().describe('要关的包名，省略则关当前前台 App（只允许消消乐 / 哔哩哔哩）')
  },
  async ({ package: pkg }) => {
    try {
      let target = String(pkg || '').trim();
      if (!target) {
        target = await foregroundPackage();
      }
      if (!CLOSABLE.has(target)) {
        throw new Error(`不允许关闭 ${target || '未知应用'}（只能关消消乐 / B 站）`);
      }
      await adb(['shell', 'am', 'force-stop', target]);
      return { content: [{ type: 'text', text: `已关掉 ${APP_NAMES[target] || target}（adb shell am force-stop ${target}）。想玩再 android_launch 打开。` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `关闭失败：${error?.message ?? error}` }], isError: true };
    }
  }
);

server.tool(
  'android_packages',
  '列出模拟器里已安装的 App 包名，可按关键词过滤。',
  {
    query: z.string().optional().describe('关键词，比如 bili / happy')
  },
  async ({ query }) => {
    try {
      const out = await adb(['shell', 'pm', 'list', 'packages']);
      const q = String(query || '').toLowerCase();
      const list = out.split(/\r?\n/)
        .map((l) => l.replace(/^package:/, '').trim())
        .filter(Boolean)
        .filter((p) => !q || p.toLowerCase().includes(q))
        .sort();
      return { content: [{ type: 'text', text: JSON.stringify({ total: list.length, packages: list.slice(0, 100) }, null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `查询包名失败：${error?.message ?? error}` }], isError: true };
    }
  }
);

// 直接跑 adb 的受控通道：允许 input / screencap / dumpsys / am / monkey / wm，
// pm 只允许 list。不接 shell 元字符（execFile 逐参数传，不经过 shell），
// 所以拿不到 rm / install / settings 这类能力。
const ADB_ALLOW = new Set(['input', 'screencap', 'dumpsys', 'am', 'monkey', 'wm']);

function validateAdbArgs(raw) {
  const arr = (Array.isArray(raw) ? raw : []).map((s) => String(s));
  if (!arr.length) throw new Error('args 不能为空');
  if (arr.some((t) => t.length > 200)) throw new Error('参数太长');
  // 拒绝 shell 元字符：adb shell 会把参数拼给设备端的 sh，`;` `|` `&&` 能绕过下面的子命令白名单
  // （比如 ["shell","input","tap","1","1",";","pm","uninstall",…]）。普通坐标/文本不需要这些字符。
  if (arr.some((t) => /[;&|<>`$()\n\r]/.test(t))) throw new Error('参数里不允许 shell 元字符（; & | < > ` $ ( ) 换行）');
  if (arr[0] === 'shell') {
    const sub = arr[1] || '';
    if (sub === 'pm') {
      if (arr[2] !== 'list') throw new Error('pm 只允许 list');
      return arr;
    }
    if (!ADB_ALLOW.has(sub)) throw new Error(`不允许的 adb 子命令：${sub}`);
    return arr;
  }
  if (arr[0] === 'exec-out' && arr[1] === 'screencap') return arr;
  throw new Error(`不允许的 adb 命令：${arr[0]}（只允许 shell input/screencap/dumpsys/am/monkey/wm/pm list）`);
}

server.tool(
  'android_adb',
  '直接执行一条受控的 adb 命令，返回原始输出。允许：`shell input ...`、`shell screencap ...`、`shell dumpsys ...`、`shell am ...`、`shell monkey ...`、`shell wm ...`、`shell pm list ...`、`exec-out screencap -p`。想自己拼复杂操作（比如连续 input tap、am start 带参数）时用它；常规点按仍建议 android_tap / android_batch。',
  {
    args: z.array(z.string()).min(1).max(20).describe('adb 参数数组，例如 ["shell","input","tap","540","1504"]')
  },
  async ({ args }) => {
    try {
      const argv = validateAdbArgs(args);
      const out = await adb(argv, { timeout: 30000, binary: false });
      const text = String(out || '').trim();
      return { content: [{ type: 'text', text: `adb ${argv.join(' ')}\n${text ? text.slice(0, 1500) : '(无输出)'}` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `adb 执行失败：${error?.message ?? error}` }], isError: true };
    }
  }
);

void restoreDefaultPlaybackIfStuck();

await server.connect(new StdioServerTransport());

