#!/usr/bin/env node
/**
 * 预缓存：把语音库里的歌批量跑一遍 RVC，生成和 qq_sing 完全同名的缓存文件。
 *
 * 这样她以后点歌就是「缓存命中，直接发」（几秒），不用现场等 60 多秒。
 * 指纹算法与 MCP 共用 src/rvc-cache.js，两边算出来的文件名一定一致。
 *
 * 用法：
 *   node scripts/rvc-precache.mjs                # 扫 audio/ 里所有"像歌"的文件
 *   node scripts/rvc-precache.mjs --files a.mp3,b.mp3
 *   node scripts/rvc-precache.mjs --dry-run      # 只列出会做什么
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rvcCachePath, isSongLike } from '../src/rvc-cache.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = path.join(ROOT, 'audio');
const PY = path.join(ROOT, 'tools', 'rvc-venv', 'Scripts', 'python.exe');
const CONVERT = path.join(ROOT, 'tools', 'rvc_convert.py');

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const rvc = cfg.socialV2?.rvc ?? {};
const opts = {
  audioDir: AUDIO,
  model: String(rvc.model || 'yao.pth'),
  pitch: Number.isFinite(Number(rvc.pitch)) ? Math.trunc(Number(rvc.pitch)) : 0,
  indexRate: Number.isFinite(Number(rvc.indexRate)) ? Number(rvc.indexRate) : 0.75,
  protect: Number.isFinite(Number(rvc.protect)) ? Number(rvc.protect) : 0.33,
  chunkSec: Number.isFinite(Number(rvc.chunkSec)) && Number(rvc.chunkSec) > 0 ? Math.trunc(Number(rvc.chunkSec)) : 60
};

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const filesIdx = argv.indexOf('--files');
const explicit = filesIdx >= 0 ? String(argv[filesIdx + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : [];

const candidates = explicit.length
  ? explicit.map((f) => path.resolve(AUDIO, f))
  : fs.readdirSync(AUDIO)
      .filter((f) => isSongLike(f))
      .map((f) => path.join(AUDIO, f))
      .sort();

console.log(`预缓存：${candidates.length} 首歌 · 模型 ${opts.model} · pitch ${opts.pitch} · indexRate ${opts.indexRate} · 分段 ${opts.chunkSec}s`);
let done = 0;
let skipped = 0;
let failed = 0;

for (const src of candidates) {
  if (!fs.existsSync(src)) {
    console.log(`  跳过（不存在）：${path.basename(src)}`);
    skipped += 1;
    continue;
  }
  const cache = rvcCachePath(src, opts);
  const name = path.basename(cache.file);
  if (fs.existsSync(cache.file)) {
    console.log(`  已缓存：${name}`);
    skipped += 1;
    continue;
  }
  if (dryRun) {
    console.log(`  会转换：${path.basename(src)} → ${name}`);
    continue;
  }
  const tmp = path.join(AUDIO, `sing-${Date.now()}-vox.mp3`);
  const started = Date.now();
  try {
    execFileSync(PY, [
      CONVERT,
      '--model', opts.model,
      '--input', src,
      '--output', tmp,
      '--pitch', String(opts.pitch),
      '--index-rate', String(opts.indexRate),
      '--protect', String(opts.protect),
      '--chunk-sec', String(opts.chunkSec)
    ], { cwd: ROOT, stdio: 'pipe', timeout: 900000, encoding: 'utf8' });
    fs.renameSync(tmp, cache.file);
    const sec = Math.round((Date.now() - started) / 1000);
    const mb = (fs.statSync(cache.file).size / 1024 / 1024).toFixed(2);
    console.log(`  ✓ ${path.basename(src)} → ${name}（${sec}s，${mb} MB）`);
    done += 1;
  } catch (error) {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
    const msg = (error?.stderr || error?.message || String(error)).slice(-300);
    console.log(`  ✗ ${path.basename(src)} 失败：${msg}`);
    failed += 1;
  }
}

console.log(`完成：新增 ${done}，跳过 ${skipped}，失败 ${failed}`);
