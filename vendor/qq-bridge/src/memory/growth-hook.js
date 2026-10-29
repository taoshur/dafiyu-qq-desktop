/**
 * Memory V4 桥接挂钩：把真实行为记成经历，驱动成长；并给 prompt 一小段成长上下文。
 * 所有导出函数都不抛异常（DB/逻辑出错只记日志，绝不影响聊天）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openMemoryDb } from './db.js';
import {
  ensureGrowthSchema, recordExperience, addEvidence, evaluateGrowth, decayTraits, createInterestTraits,
  classifyInterestSignal, recordInterestSignal, invalidateEvidenceForTopic,
  noteInteraction, setAffect, addJournal, buildGrowthContext, growthStatus, reviewRejectedInterests } from './growth.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let db = null;
let timer = null;
let conf = {};
let logFn = () => {};
const stats = { experiences: 0, evidence: 0, passiveSkipped: 0, readOnlySkipped: 0, errors: 0, lastError: '' };
// 会话 → 最近一次「被指令去做某事」的时间（毫秒）。用于区分主动玩和被使唤去测。
const lastDirectiveAt = new Map();
// 评估防重入：定时器和启动自检可能同时到点。
let evaluating = false;

const TOPIC_TRAITS = [
  { re: /消消乐|游戏|关卡|攻略/, traits: ['playful'], topic: '消消乐' },
  { re: /B站|哔哩|视频|直播|唱歌|音乐|歌单/, traits: ['curious'], topic: 'B站' },
  { re: /token|白饭|省钱|省点|偷懒|摸鱼/, traits: ['lazy'], topic: 'token/白饭' },
  { re: /撒娇|摸头|可爱|嘿嘿/, traits: ['cute'], topic: '撒娇' },
  { re: /哼|才不是|随便你|傲娇/, traits: ['tsundere'], topic: '傲娇' },
  { re: /毒舌|吐槽|就这/, traits: ['sharp'], topic: '吐槽' }
];

// 只读类工具：看一眼、查一下，不等于"参与"。
// 审计（2026-10-25）发现消消乐 26 条参与信号里 15 条来自 screenshot/status/ui/capture_share，
// QQ空间 17 条里 8 条来自 qzone_feeds/detail —— 读信息被当成了主动参与。
// 这里把只读工具降级为 explore（权重 0.5）：它们仍算"接触过"，但不满足"实际参与≥2"的门槛。
const READ_ONLY_ACTIONS = new Set([
  'android__android_status',
  'android__android_screenshot',
  'android__android_ui',
  'android__android_capture_share',
  'snowluma__qq_qzone_feeds',
  'snowluma__qq_qzone_detail',
  'bilibili__bili_search',
  'bilibili__bili_hot_videos',
  'bilibili__bili_hot_buzzwords',
  'bilibili__bili_rank',
  'bilibili__bili_weekly_hot',
  'bilibili__bili_video_info',
  'bilibili__bili_comments',
  'bilibili__bili_danmaku',
  'bilibili__bili_subtitle',
  'bilibili__bili_user_info',
  'bilibili__bili_user_videos',
  'bilibili__bili_video_zones'
]);

/** 只读工具？android_adb 只有带 input 才算操作。 */
function isReadOnlyTool(name, args) {
  if (READ_ONLY_ACTIONS.has(name)) return true;
  if (name === 'android__android_adb') return !/\binput\b/.test(String(args || ''));
  return false;
}

// 关系里的"共同话题"：只根据对方真的说过的内容打标，覆盖常见日常话题（比兴趣信号的 6 个桶宽）。
// 一条消息可能同时命中多个（比如"加班到十点还没吃饭"），最多取 3 个。
const RELATION_TOPIC_RULES = [
  { re: /消消乐|游戏|关卡|过关|闯关/, topic: '游戏' },
  { re: /B站|哔哩|视频|直播|唱歌|听歌|音乐|歌单/, topic: '视频/唱歌' },
  { re: /吃饭|白饭|好吃|外卖|夜宵|奶茶|火锅/, topic: '吃饭' },
  { re: /上班|加班|工作|通勤|下班|开会/, topic: '上班' },
  { re: /睡觉|熬夜|失眠|困|早起/, topic: '睡觉' },
  { re: /猫|狗|宠物|仓鼠|兔子/, topic: '宠物' },
  { re: /天气|下雨|降温|好热|下雪|台风/, topic: '天气' },
  { re: /考试|学习|作业|上课|复习|论文/, topic: '学习' },
  { re: /出门|逛街|旅行|旅游|看电影|玩去/, topic: '出门玩' }
];
function relationTopicsOf(text) {
  const out = [];
  for (const r of RELATION_TOPIC_RULES) {
    if (r.re.test(String(text || '')) && !out.includes(r.topic)) out.push(r.topic);
    if (out.length >= 3) break;
  }
  return out;
}

const PRAISE_RE = /真棒|厉害|可爱|喜欢你|谢谢|辛苦了|做得好/;
const ANGER_RE = /生气|烦|滚|闭嘴|没用|笨|讨厌/;

export function initGrowthHook({ config, log } = {}) {
  if (config) conf = config;
  if (log) logFn = log;
}

function getDb() {
  if (db) return db;
  const dbPath = path.isAbsolute(conf.dbPath || '') ? conf.dbPath : path.join(ROOT, conf.dbPath || 'state/memory.db');
  db = openMemoryDb(dbPath);
  ensureGrowthSchema(db);
  return db;
}

function safe(fn, label) {
  try { return fn(); } catch (error) {
    stats.errors += 1;
    stats.lastError = String(error?.message ?? error).slice(0, 160);
    try { logFn(`[growth] ${label} 失败：${stats.lastError}`); } catch {}
    return null;
  }
}

/** 聊天消息 → 关系推进 + 情绪试探 + 话题经历 */
export function noteGrowthMessage({ convKey, senderQq, senderName, text, isSelf }) {
  if (conf.enabled === false) return;
  safe(() => {
    const d = getDb();
    const content = String(text || '').slice(0, 300);
    if (!content) return;

    if (!isSelf && senderQq) {
      noteInteraction(d, { qq: senderQq, convKey, topic: topicOf(content), topics: relationTopicsOf(content) });
      if (PRAISE_RE.test(content)) setAffect(d, { convKey, label: '开心', intensity: 0.35, ttlMs: 20 * 60 * 1000 });
      else if (ANGER_RE.test(content)) setAffect(d, { convKey, label: '有点闷', intensity: 0.3, ttlMs: 15 * 60 * 1000 });
    }

    // 话题信号：只有"本人以外"的消息才算观察对象；自己的话不算证据
    if (content.length >= 6 && !isSelf) {
      const hit = TOPIC_TRAITS.find((t) => t.re.test(content));
      const sig = classifyInterestSignal(content);
      if (sig && sig.kind === 'instruction') {
        // 「你去玩玩看 / 帮我测试一下」是任务，不是她的兴趣。记下时间，供工具调用判定被动执行。
        lastDirectiveAt.set(convKey, Date.now());
        if (lastDirectiveAt.size > 200) {
          const cutoff = Date.now() - 30 * 60 * 1000;
          for (const [k, ts] of lastDirectiveAt) if (ts < cutoff) lastDirectiveAt.delete(k);
        }
      }
      if (hit && sig && sig.kind !== 'instruction') {
        recordInterestSignal(d, {
          topic: hit.topic, kind: sig.kind, source: 'chat', convKey, qq: senderQq || null,
          note: content, weight: sig.weight
        });
        // 只有"探索"这种主动行为才算弱证据；提到/讨厌都不进证据池
        if (sig.kind === 'explore') {
          for (const key of hit.traits) {
            const ev = addEvidence(d, { traitKey: key, convKey, note: content.slice(0, 60), kind: 'explore', source: 'explore', weight: 0.5 });
            if (ev && !ev.duplicate) stats.evidence += 1;
          }
        }
      }
    }
  }, 'noteMessage');
}

/** 工具行为 → 经历（玩游戏 / 看视频 / 发空间 / 唱歌） */
export function noteGrowthTool({ convKey, tool, args, ok }) {
  if (conf.enabled === false || !ok) return;
  safe(() => {
    const d = getDb();
    const name = String(tool || '').replace('mcp__', '');
    let kind = null; let topic = null; let traits = [];
    if (name.startsWith('android__')) {
      if (name.includes('android_close')) return;
      kind = 'play'; topic = '消消乐'; traits = ['playful'];
    } else if (name.includes('bili_reply')) {
      // 真实评论 = 参与行为（不是只读）：只有工具返回成功才会走到这里（!ok 在上方已 return）。
      // 注意与只读工具的区分：bili_hot/bili_search/bili_video_info 仍走上面的 explore 分支。
      kind = 'comment'; topic = 'B站'; traits = ['curious'];
    } else if (name.includes('bili_search') || name.includes('bili_hot') || name.includes('bili_video')) {
      kind = 'video'; topic = 'B站'; traits = ['curious'];
      const q = String(args || '').match(/"keyword":"([^"]{1,20})"/);
      if (q) topic = `B站·${q[1]}`;
    } else if (name.includes('qzone') || name.includes('signature')) {
      kind = 'expression'; topic = 'QQ空间'; traits = ['cute'];
    } else if (name.includes('qq_sing')) {
      kind = 'sing'; topic = '唱歌'; traits = ['playful', 'curious'];
    } else {
      return;
    }
    const r = recordExperience(d, {
      kind, topic, detail: name, source: 'tool', convKey,
      sourceKey: `tool|${convKey}|${name}|${new Date().toISOString().slice(0, 10)}`
    });
    if (!r.inserted) return;
    stats.experiences += 1;
    // 被动执行不算兴趣：10 分钟内被明确指令过（"你去玩玩看/帮我测试"）就只记经历、不投正向证据。
    // 真正长兴趣要靠她自己隔天还回来主动玩。
    const directedAt = lastDirectiveAt.get(convKey) || 0;
    const passive = Date.now() - directedAt < 10 * 60 * 1000;
    if (passive) {
      stats.passiveSkipped += 1;
      recordInterestSignal(d, { topic, kind: 'instruction', source: 'tool-directed', convKey, note: name, weight: 0 });
      return;
    }
    // 真做事（点/滑/开/发/评论）才算 participate；只看一眼记 explore（权重 0.5）。
    const readOnly = isReadOnlyTool(name, args);
    recordInterestSignal(d, {
      topic,
      kind: readOnly ? 'explore' : 'participate',
      source: readOnly ? 'tool-read' : 'tool',
      convKey,
      note: name,
      weight: readOnly ? 0.5 : 1
    });
    for (const key of traits) {
      const ev = addEvidence(d, {
        traitKey: key,
        convKey,
        experienceId: r.id,
        note: `${name} ${topic}`.slice(0, 60),
        kind: readOnly ? 'explore' : 'behavior',
        source: readOnly ? 'explore' : 'behavior',
        weight: readOnly ? 0.5 : 1
      });
      if (ev && !ev.duplicate) stats.evidence += 1;
    }
  }, 'noteTool');
}

/** 记忆被纠正/删除时调用：让相关证据失效并回滚不足的成长 */
export function invalidateGrowthForTopic({ topic, convKey, reason }) {
  if (conf.enabled === false) return null;
  return safe(() => invalidateEvidenceForTopic(getDb(), { topic, convKey, reason }), 'invalidate');
}

/** 给 prompt 的成长上下文（小、带预算） */
export function growthContext({ convKey, speakerQq }) {
  if (conf.enabled === false) return '';
  const r = safe(() => buildGrowthContext(getDb(), { convKey, speakerQq }), 'context');
  return r || '';
}

/** 周期性：评估成长候选 + 衰减 */
export function evaluateNow() {
  // 定时器和启动自检可能同时到点：重入会把同一批候选算两遍（甚至重复写日记）。
  if (evaluating) return null;
  evaluating = true;
  try { return evaluateNowInner(); } finally { evaluating = false; }
}

function evaluateNowInner() {
  return safe(() => {
    const d = getDb();
    const produced = evaluateGrowth(d, {
      minEvidence: Number(conf.minEvidence) || 5,
      minDistinctDays: Number(conf.minDistinctDays) || 2,
      minSpanDays: Number(conf.minSpanDays) || 2,
      maxAutoDelta: Number(conf.maxAutoDelta) || 0.1,
      autoApplyExpression: conf.autoApplyExpression !== false
    });
    const newInterests = createInterestTraits(d, {});
    // 被人工否决的兴趣：只有纠错之后新产生的真实参与证据够量，才产出待审候选（绝不自动恢复）。
    const reviews = reviewRejectedInterests(d, {
      minFreshEvidence: Number(conf.minEvidence) || 5,
      minDistinctDays: Number(conf.minDistinctDays) || 2
    });
    const decayed = decayTraits(d, { decayPerDay: Number(conf.decayPerDay) || 0.02 });
    if (produced.length) logFn(`[growth] 新候选 ${produced.length} 条`);
    if (reviews.length) logFn(`[growth] 被否决兴趣出现新证据，待复核 ${reviews.map((x) => x.trait).join('、')}`);
    if (decayed.length) logFn(`[growth] 自然回落 ${decayed.length} 项`);
    if (newInterests.length) logFn(`[growth] 新兴趣 ${newInterests.map((x) => x.topic).join('、')}`);
    return { produced, decayed, newInterests };
  }, 'evaluate');
}

export function startGrowthLoop() {
  if (conf.enabled === false || timer) return;
  timer = setInterval(() => { void evaluateNow(); }, 30 * 60 * 1000);
  timer.unref?.();
  setTimeout(() => { void evaluateNow(); }, 60 * 1000).unref?.();
}

export function growthRuntimeStats() {
  return { ...stats, enabled: conf.enabled !== false, loop: Boolean(timer) };
}

export function growthSnapshot() {
  return safe(() => growthStatus(getDb()), 'status');
}

function topicOf(text) {
  const hit = TOPIC_TRAITS.find((t) => t.re.test(text));
  return hit ? hit.topic : null;
}
