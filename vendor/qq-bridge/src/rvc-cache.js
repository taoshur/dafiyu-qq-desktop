import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * RVC 结果缓存路径（MCP 与 CLI 共用，保证指纹算法完全一致）。
 *
 * 指纹 = 源文件（名字/大小/mtime）+ 所有影响音色的参数：
 * 换模型、改升调/索引率/protect/分段，或源文件被替换，都会得到新指纹，不会误用旧音频。
 *
 * @param {string} srcPath 源音频绝对路径
 * @param {{audioDir:string, model:string, pitch:number, indexRate:number, protect:number, chunkSec:number}} opts
 * @returns {{file:string, fingerprint:string}}
 */
export function rvcCachePath(srcPath, opts) {
  const o = opts || {};
  let st = { size: 0, mtimeMs: 0 };
  try { st = fs.statSync(srcPath); } catch {}
  const pitch = Number.isFinite(Number(o.pitch)) ? Math.trunc(Number(o.pitch)) : 0;
  const fingerprint = crypto.createHash('sha1').update(JSON.stringify({
    src: path.basename(srcPath),
    size: st.size,
    mtimeMs: Math.round(st.mtimeMs),
    model: String(o.model || ''),
    pitch,
    indexRate: o.indexRate,
    protect: o.protect,
    chunkSec: o.chunkSec
  })).digest('hex').slice(0, 10);
  const base = path.basename(srcPath, path.extname(srcPath))
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .slice(0, 40) || 'song';
  return { file: path.join(o.audioDir, `sing-${base}-${fingerprint}-vox.mp3`), fingerprint };
}

/** 语音库里的"歌"（排除她自己合成出来的 say-/sing- 与测试样音）。 */
export const SONG_EXT = new Set(['.mp3', '.wav', '.flac', '.m4a', '.ogg', '.opus']);
export function isSongLike(name) {
  const base = path.basename(String(name));
  // 排除她自己合成的、以及测试用的样音（这些不是"歌"，预缓存纯属浪费）
  if (/^say-/i.test(base)) return false;
  if (/^sing-/i.test(base)) return false;
  if (/^样音-/i.test(base)) return false;
  if (/^gsv-/i.test(base)) return false;
  if (/^qwen-/i.test(base)) return false;
  if (/^大肥鱼测试/i.test(base)) return false;
  return SONG_EXT.has(path.extname(base).toLowerCase());
}
