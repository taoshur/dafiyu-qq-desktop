// tts-edge.mjs — 用 Edge 神经语音把文字合成为 mp3，放进语音库。
//
// 用法：
//   node scripts/tts-edge.mjs "要念的文字" audio/输出名.mp3 [音色]
//   node scripts/tts-edge.mjs --list
//
// 常用中文音色：zh-CN-XiaoxiaoNeural（女，自然）、zh-CN-XiaoyiNeural（女，活泼）、
// zh-CN-YunxiNeural（男，年轻）、zh-CN-YunjianNeural（男，浑厚）、zh-CN-YunyangNeural（男，播音）。
// 生成的是 24kHz/96kbps mp3，qq-bridge 发送时由 SnowLuma 自动转 SILK。

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

if (args[0] === '--list') {
  const tts = new MsEdgeTTS();
  const voices = await tts.getVoices();
  for (const v of voices.filter((x) => String(x.Locale || '').startsWith('zh-CN'))) {
    console.log(`${v.ShortName}\t${v.Gender}\t${v.FriendlyName || ''}`);
  }
  tts.close();
  process.exit(0);
}

const [text, outFile, voice = 'zh-CN-XiaoxiaoNeural'] = args;
if (!text || !outFile) {
  console.error('用法: node scripts/tts-edge.mjs "文字" audio/输出.mp3 [音色]');
  process.exit(2);
}

const tts = new MsEdgeTTS();
await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
// msedge-tts 的 toFile(dir, text) 把音频写进目录里的 audio.mp3，而不是写到指定文件。
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-tts-'));
try {
  await tts.toFile(tmpDir, text);
  const produced = path.join(tmpDir, 'audio.mp3');
  if (!fs.existsSync(produced)) throw new Error(`合成失败：没有生成 ${produced}`);
  const target = path.isAbsolute(outFile) ? outFile : path.join(ROOT, outFile);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(produced, target);
  console.log(`✅ ${voice} -> ${target}`);
} finally {
  tts.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
