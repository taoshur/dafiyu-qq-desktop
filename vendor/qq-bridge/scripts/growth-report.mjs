/**
 * Memory V4 24 小时观察报告生成器
 * 由 Windows 计划任务每天 20:07 运行，输出 state/growth-report-24h.md(+json)。
 *
 * 设计原则：**真实流量指标与单元测试结果分开写**；样本不足明确标注，绝不用单测通过率
 * 冒充线上成功率。所有数据只读（日志 + state/memory.db），不重置任何统计。
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const ROOT = process.env.QQ_BRIDGE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.env.NODE_BIN || 'node';
const HOURS = (() => {
  const i = process.argv.indexOf('--hours');
  const v = i >= 0 ? Number(process.argv[i + 1]) : 24;
  return Number.isFinite(v) && v > 0 ? v : 24;
})();
const SINCE = Date.now() - HOURS * 3600 * 1000;
const outMd = path.join(ROOT, 'state', 'growth-report-24h.md');
const outJson = path.join(ROOT, 'state', 'growth-report-24h.json');

function run(script, args = []) {
  try {
    return execFileSync(NODE, [path.join(ROOT, 'scripts', script), ...args], { encoding: 'utf8', timeout: 180000 });
  } catch (e) {
    return `(执行失败: ${e.message})\n${e.stdout || ''}${e.stderr || ''}`;
  }
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function readJsonl(file) {
  const out = [];
  for (const line of readText(file).split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch {}
  }
  return out;
}

function pct(part, total) {
  if (!total) return '—';
  return `${((part / total) * 100).toFixed(1)}%`;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function fmtMs(v) {
  if (v == null) return '—';
  return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;
}

// ── 通道真实成功率（只用桥接日志里的真实收发记录） ──────────────────────────
const bridgeLog = readText(path.join(ROOT, 'state', 'bridge.log'));
const bridgeLogPrev = readText(path.join(ROOT, 'state', 'bridge.log.1'));
const logText = bridgeLogPrev + '\n' + bridgeLog;

const mediaOk = [...logText.matchAll(/\[media\] *(表情|图片)已获取（(\d+) 字节，(\d+)ms，来源 ([^）]+)）/g)]
  .map((m) => ({ kind: m[1], bytes: Number(m[2]), ms: Number(m[3]), via: m[4] }));
const mediaFail = [...logText.matchAll(/\[media\] *(表情|图片)获取失败（(\d+) 次尝试(?:，(\d+)ms)?）：(.+)$/gm)]
  .map((m) => ({ kind: m[1], attempts: Number(m[2]), ms: Number(m[3] || 0), reason: m[4].slice(0, 160) }));
const voiceSent = [...logText.matchAll(/\[voice\] (?:\(操作者\) )?(\S+) 已发送语音 [^\n]*?(?:发送耗时 (\d+)ms)?$/gm)]
  .map((m) => ({ key: m[1], ms: Number(m[2] || 0) }));
const voiceFailLogged = [...logText.matchAll(/\[voice\] [^\n]*(失败|出错|超时)/g)].length;

const tts = readJsonl(path.join(ROOT, 'state', 'voice-tts-metrics.jsonl')).filter((e) => Number(e.at) >= SINCE);
const ttsOk = tts.filter((e) => e.ok);
const ttsFail = tts.filter((e) => !e.ok);
const ttsRetries = tts.reduce((sum, e) => sum + Math.max(0, (Number(e.attempts) || 0) - 1), 0);
const ttsBreaker = ttsFail.filter((e) => /breaker-open/i.test(String(e.error))).length;
const ttsTimeouts = ttsFail.filter((e) => /timeout|timed out|websocket/i.test(String(e.error))).length;
const ttsOkMs = ttsOk.map((e) => Number(e.ms)).filter((n) => n > 0);
const ttsProviders = [...new Set(tts.map((e) => String(e.provider || 'qwen')))];

const toolCalls = readJsonl(path.join(ROOT, 'state', 'tool-calls.jsonl')).filter((e) => Number(e.time ? Date.parse(e.time) : 0) >= SINCE);
const mediaTools = toolCalls.filter((e) => /get_message_images|get_sticker_image|sticker_image|send_sticker|qq_say|send_voice/i.test(String(e.tool || '')));
const mediaToolCalls = mediaTools.filter((e) => e.type === 'call');
const mediaToolResults = mediaTools.filter((e) => e.type === 'result');

// ── 稳定性 ────────────────────────────────────────────────────────────────
const restarts = readJsonl(path.join(ROOT, 'state', 'restart-log.jsonl')).filter((e) => Date.parse(e.at) >= SINCE);
const downTotal = restarts.reduce((s, e) => s + (Number(e.downMs) || 0), 0);
// 按原因分类统计：部署/手动、DSH 重启、看门狗、模拟器离线保护——四类不能混在一起看。
const RESTART_KINDS = [
  { key: 'deploy', label: '部署/手动', test: (r) => !/watchdog|dsh|offline|play/i.test(String(r.reason || '')) },
  { key: 'dsh', label: 'DSH 重启', test: (r) => /dsh/i.test(String(r.reason || '')) },
  { key: 'watchdog', label: '看门狗', test: (r) => /watchdog/i.test(String(r.reason || '')) },
  { key: 'offline', label: '模拟器保护', test: (r) => /offline|play/i.test(String(r.reason || '')) }
];
const restartBreakdown = RESTART_KINDS.map((k) => {
  const rows = restarts.filter(k.test);
  return { ...k, count: rows.length, downMs: rows.reduce((s, e) => s + (Number(e.downMs) || 0), 0) };
});
const restartBreakdownLine = restartBreakdown
  .filter((k) => k.count)
  .map((k) => `${k.label} ${k.count} 次/${k.downMs} ms`)
  .join(' · ') || '无';
const growthErrors = [...logText.matchAll(/\[growth\] [^\n]*失败/g)].length;
const growthDegraded = [...logText.matchAll(/\[growth\] [^\n]*(降级|不可用)/g)].length;

// ── V3 检索 / V4 注入 ────────────────────────────────────────────────────
const injects = readJsonl(path.join(ROOT, 'state', 'memory-inject.jsonl')).filter((e) => Number(e.at) >= SINCE);
const injectTokens = injects.map((e) => Number(e.tokens) || 0);
const growthInjects = readJsonl(path.join(ROOT, 'state', 'growth-inject.jsonl')).filter((e) => Number(e.at) >= SINCE);
const growthTokens = growthInjects.map((e) => Number(e.tokens) || 0);
// B 站本地观看台账（方案 C）：API 读数据不会写 B 站观看历史，这里用本地记录代替
const biliWatch = readJsonl(path.join(ROOT, 'state', 'bili-watch.jsonl')).filter((e) => Number(e.at) >= SINCE);

// ── 成长数据（只读 DB） ──────────────────────────────────────────────────
let dbMetrics = { error: null };
try {
  const db = new DatabaseSync(path.join(ROOT, 'state', 'memory.db'), { readOnly: true });
  const q = (sql, ...args) => {
    try { return db.prepare(sql).all(...args); } catch (e) { return [{ error: String(e.message).slice(0, 80) }]; }
  };
  const candidatesByStatus = q('SELECT status, COUNT(*) AS c FROM growth_candidates GROUP BY status');
  const rejected = q("SELECT reason, COUNT(*) AS c FROM growth_candidates WHERE status='rejected' GROUP BY reason ORDER BY c DESC LIMIT 5");
  const interests = q("SELECT trait_key, name, strength, evidence_count, distinct_days, first_evidence_at, last_evidence_at FROM traits WHERE category='interest' ORDER BY strength DESC");
  const rel = q('SELECT COUNT(*) AS total, SUM(CASE WHEN familiarity>0.6 THEN 1 ELSE 0 END) AS close FROM relationships');
  const journalRows = q('SELECT kind, source, COUNT(*) AS c FROM growth_journal WHERE at>=? GROUP BY kind, source ORDER BY c DESC', SINCE);
  const corrections = q("SELECT COUNT(*) AS c FROM growth_journal WHERE at>=? AND (source='correction' OR kind='growth_rollback')", SINCE);
  const evidence = q('SELECT COUNT(*) AS c FROM trait_evidence');
  const participates = q("SELECT topic, COUNT(*) AS c, COUNT(DISTINCT substr(datetime(at/1000,'unixepoch'),1,10)) AS days FROM interest_signals WHERE kind='participate' GROUP BY topic ORDER BY c DESC LIMIT 6");
  const signals = q('SELECT kind, COUNT(*) AS c FROM interest_signals WHERE at>=? GROUP BY kind', SINCE);
  const interestFollow = interests.slice(0, 4).map((t) => {
    const topic = String(t.trait_key).replace(/^interest:/, '');
    const row = q("SELECT COUNT(*) AS c FROM interest_signals WHERE kind='participate' AND topic=? AND at>?", topic, Number(t.first_evidence_at) || 0)[0];
    return { topic, after: Number(row?.c || 0) };
  });
  dbMetrics = {
    candidatesByStatus, rejected, interests,
    rel: rel[0] || {}, journal: journalRows,
    corrections: Number(corrections[0]?.c || 0),
    evidence: Number(evidence[0]?.c || 0),
    participates, signals, interestFollow
  };
  db.close();
} catch (error) {
  dbMetrics = { error: String(error?.message ?? error) };
}

// ── 子脚本输出 ───────────────────────────────────────────────────────────
const report = run('memory-report.mjs', ['--hours', String(HOURS), '--write']);
const evalOut = run('memory-eval.mjs', ['--sample', '60']);
const growth = run('growth.mjs', ['--status']);
const pendingCandidates = run('growth.mjs', ['--candidates', '--status', 'pending']);
const reviewCandidates = run('growth.mjs', ['--candidates', '--kind', 'review', '--status', 'pending']);
const candidateStats = run('growth.mjs', ['--candidate-stats']);
const journal = run('growth.mjs', ['--journal']);
const quality = run('memory-extract.mjs', ['--quality']);

// ── 报告片段（先算好字符串，避免嵌套模板字面量） ──────────────────────────
const mediaTotal = mediaOk.length + mediaFail.length;
const ttsTotal = ttsOk.length + ttsFail.length;
const mediaVia = [...new Set(mediaOk.map((x) => x.via))].join('/') || '无成功';
const ttsNote = ttsTotal
  ? `P50 ${fmtMs(percentile(ttsOkMs, 50))} · P95 ${fmtMs(percentile(ttsOkMs, 95))} · 超时 ${ttsTimeouts} 次 · 熔断 ${ttsBreaker} 次 · 重试 ${ttsRetries} 次 · 供应商 ${ttsProviders.join('/')}`
  : '样本不足';
const voiceNote = voiceSent.length
  ? `发送耗时中位数 ${fmtMs(percentile(voiceSent.map((v) => v.ms).filter(Boolean), 50))}`
  : '样本不足';
const mediaNote = mediaTotal ? `来源：${mediaVia}` : '样本不足';
const mediaFailLines = mediaFail.slice(-3)
  .map((f) => `- [${f.kind}] 尝试 ${f.attempts} 次${f.ms ? ' · ' + fmtMs(f.ms) : ''}：${f.reason}`)
  .join('\n');
const restartLines = restarts.length
  ? restarts.map((r) => `${new Date(r.at).toLocaleString()}（${r.reason || '—'}）`).join('；')
  : '无';
const interestFollowNote = Array.isArray(dbMetrics.interestFollow) && dbMetrics.interestFollow.length
  ? dbMetrics.interestFollow.map((x) => `${x.topic} +${x.after}`).join('；')
  : '暂无兴趣 trait';

const now = new Date();
const md = `# Memory V4 · ${HOURS} 小时观察报告

生成时间：${now.toLocaleString()}
观察窗口：最近 ${HOURS} 小时（${new Date(SINCE).toLocaleString()} 起）

## 1. API 与成本

\`\`\`json
${report}
\`\`\`

> 口径说明：
> - \`tokensPerTurn\` = 一整轮里**所有步骤**的输入合计 ÷ 轮数（一轮十几步，数值偏大）。
> - \`tokensPerStep\` = 输入合计 ÷ 步数，是**单次请求**的真实成本口径。
> - \`cacheHit\` / \`cacheMiss\` / \`outputTokens\` 分开统计：命中输入、未命中输入、输出各自独立。
> - \`relativeCost\` 是**内部相对成本代理**（命中×0.1 + 未命中×1 + 输出×2 + 抽取 tokens），
>   只用于横向比较，**不是真实费用**，也不能换算成人民币/美元。

## 2. 记忆质量（V3 提取 / 检索评估）

\`\`\`
${evalOut}
\`\`\`

## 3. 成长状态（V4）

\`\`\`
${growth}
\`\`\`

## 4. 待审成长候选

\`\`\`
${pendingCandidates || '（无）'}
\`\`\`

**被否决兴趣的复核候选（kind=review；只列待审，已处理的只进统计，避免重复提醒）**

\`\`\`
${reviewCandidates || '（无）'}
\`\`\`

**候选统计（按 kind / status 计数）**

\`\`\`
${candidateStats || '（无）'}
\`\`\`

## 5. 成长日记

\`\`\`
${journal || '（无）'}
\`\`\`

## 6. 提取候选质量

\`\`\`json
${quality}
\`\`\`

## 7. 通道真实成功率（只统计桥接日志里的真实收发）

> 统计范围：bridge.log + bridge.log.1（桥接没有跨天切分日志），是「最近一到两份日志」的近似窗口；失败记录里可能混有修复前的历史样本。

| 通道 | 样本 | 成功 | 失败 | 成功率 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 图片/表情下载 | ${mediaTotal} | ${mediaOk.length} | ${mediaFail.length} | ${pct(mediaOk.length, mediaTotal)} | ${mediaNote} |
| 语音发送（QQ 语音条） | ${voiceSent.length} | ${Math.max(0, voiceSent.length - voiceFailLogged)} | ${voiceFailLogged} | ${pct(Math.max(0, voiceSent.length - voiceFailLogged), voiceSent.length)} | ${voiceNote} |
| TTS 合成（云端） | ${ttsTotal} | ${ttsOk.length} | ${ttsFail.length} | ${pct(ttsOk.length, ttsTotal)} | ${ttsNote} |

- MCP 媒体/语音工具调用（真实流量）：调用 ${mediaToolCalls.length} 次，结果 ${mediaToolResults.length} 条，失败 ${mediaToolResults.filter((e) => e.ok === false).length} 条
${mediaFailLines ? '\n失败原因（最近 3 条）：\n' + mediaFailLines + '\n' : ''}
${mediaTotal === 0 ? '> ⚠️ 本窗口没有真实的图片/表情下载记录，成功率无法评估，不要用单测结果代替。\n' : ''}

## 8. 稳定性

- 桥接重启：${restarts.length} 次，累计停机 ${downTotal} ms
- 按原因分类：${restartBreakdownLine}
- 重启记录：${restartLines}
- 成长模块异常日志：${growthErrors} 条；降级标记：${growthDegraded} 处

## 9. Memory V3 检索

- 注入次数：${injects.length}，token 中位数 ${percentile(injectTokens, 50) ?? '—'}，最大 ${injectTokens.length ? Math.max(...injectTokens) : '—'}
- 命中条数中位数：${percentile(injects.map((e) => Number(e.hits) || 0), 50) ?? '—'}
- 无关召回 / 隐私隔离：见第 2 节 \`memory-eval\` 的隔离检查（本报告不做推测）

## 10. Memory V4 成长（真实数据）

\`\`\`json
${JSON.stringify(dbMetrics, null, 1)}
\`\`\`

- 成长上下文注入：${growthInjects.length} 次，token 中位数 ${percentile(growthTokens, 50) ?? '—'}，最大 ${growthTokens.length ? Math.max(...growthTokens) : '—'}
- 兴趣形成后仍有真实参与：${interestFollowNote}
- 纠错联动（记忆删除 → 证据失效）：${dbMetrics.corrections ?? 0} 次

## 11. B 站本地观看台账

- 事件：${biliWatch.length} 条（看信息 + 读字幕）
- 视频数：${new Set(biliWatch.map((e) => e.bvid)).size}
- 读过字幕的：${biliWatch.filter((e) => e.kind === 'subtitle').length} 次
${biliWatch.length ? '- 最近：' + biliWatch.slice(-3).map((e) => (e.title || e.bvid).slice(0, 24)).join(' / ') : '- 本窗口没有观看记录'}
- 说明：这些是**本地记录**。B 站账号的观看历史/播放量不会因为 API 调用而变化（播放器才会打点）。

## 12. 说明

- 第 7–11 节全部来自**真实运行日志 / 生产数据库**；第 2 节是记忆评估脚本输出，第 3–6 节是成长状态与候选清单。
- 单元测试不写进本报告：单测证明代码路径正确，不能证明线上真的成功；样本不足处已显式标注。
- 人物事实仍是 observeOnly：自动提取只写候选，不自动写正式事实。
- 人格类成长只出候选；表达/兴趣类在严格门槛下可小幅自动生效（maxDelta 0.1）。
- 所有生效都有 trait_versions 版本记录，可 \`node scripts/growth.mjs --rollback <id>\` 回滚。
`;

fs.writeFileSync(outMd, md);
fs.writeFileSync(outJson, JSON.stringify({
  at: now.toISOString(), hours: HOURS,
  channels: {
    mediaOk, mediaFail,
    voiceSent,
    tts: { total: ttsTotal, ok: ttsOk.length, fail: ttsFail.length, retries: ttsRetries, timeouts: ttsTimeouts }
  },
  stability: { restarts, growthErrors, growthDegraded },
  v3: { injects: injects.length },
  v4: { growthInjects: growthInjects.length, ...dbMetrics },
  report, evalOut, growth, candidates: pendingCandidates, journal, quality
}, null, 2));
console.log('written', outMd);
