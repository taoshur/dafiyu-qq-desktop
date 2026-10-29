#!/usr/bin/env node
/**
 * B 站"观看"本地台账（方案 C）。
 *
 * 背景：她刷 B 站走的是 API（热门/详情/字幕），**不会**写进 B 站账号的观看历史，
 * 也不会增加播放量。这里自己记一份：她看过哪个视频、什么时候、读了多少字幕。
 * 只读本地文件，不碰 B 站账号数据。
 *
 * 用法：
 *   node scripts/bili-watch.mjs            # 最近 24 小时
 *   node scripts/bili-watch.mjs --days 7   # 最近 7 天
 *   node scripts/bili-watch.mjs --all      # 全部
 *   node scripts/bili-watch.mjs --json     # 输出 JSON
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const LOG = path.join(ROOT, 'state', 'bili-watch.jsonl');

const argv = process.argv.slice(2);
const jsonOut = argv.includes('--json');
const all = argv.includes('--all');
const daysIdx = argv.indexOf('--days');
const days = daysIdx >= 0 ? Number(argv[daysIdx + 1]) || 1 : 1;
const since = all ? 0 : Date.now() - days * 24 * 3600 * 1000;

function readAll() {
  let text = '';
  try { text = fs.readFileSync(LOG, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch {}
  }
  return out;
}

const rows = readAll().filter((r) => Number(r.at) >= since);
const byVideo = new Map();
for (const r of rows) {
  const key = r.bvid || '?';
  const cur = byVideo.get(key) || { bvid: key, title: r.title || '', times: 0, subtitle: false, segments: 0, last: 0 };
  cur.times += 1;
  cur.title = cur.title || r.title || '';
  if (r.kind === 'subtitle') {
    cur.subtitle = true;
    cur.segments = Math.max(cur.segments, Number(r.segments) || 0);
  }
  cur.last = Math.max(cur.last, Number(r.at) || 0);
  byVideo.set(key, cur);
}
const videos = [...byVideo.values()].sort((a, b) => b.last - a.last);

if (jsonOut) {
  console.log(JSON.stringify({ window: all ? 'all' : `${days}d`, events: rows.length, videos }, null, 2));
  process.exit(0);
}

console.log(`B 站本地观看台账（${all ? '全部' : `最近 ${days} 天`}）：${rows.length} 条事件 / ${videos.length} 个视频`);
if (!videos.length) {
  console.log('（这段时间她没有看过 B 站内容）');
  process.exit(0);
}
for (const v of videos.slice(0, 20)) {
  const when = new Date(v.last).toLocaleString();
  const seen = v.subtitle ? `字幕 ${v.segments} 段` : '只看信息';
  console.log(`- ${when}  ${v.bvid}  ${v.title.slice(0, 40)}  [${seen}]`);
}
if (videos.length > 20) console.log(`… 另有 ${videos.length - 20} 个`);
