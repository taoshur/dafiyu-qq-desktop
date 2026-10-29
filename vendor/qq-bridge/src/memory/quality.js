/**
 * Memory V3 阶段 2.1：提取质量闸门
 * 在写入候选前做规则判定，给每条候选打 quality 标签：
 *   valid | duplicate | over_inference | ops_event | expired_event | privacy_risk | misattribution | uncertain
 *
 * 原则（对应验收意见）：
 * - 单次行为不上升为人格：trait 需要 evidence_count>=3 或本人明确自述
 * - 临时计划带有效期，不当永久属性
 * - 技术事件进 ops_log，不进人物记忆
 * - 玩笑/反讽/引用/身份不确定默认不写
 */
import { tokenize } from './tokenize.js';
import { addEvent } from './db.js';

const PRIVATE_PATTERNS = [
  /手机号|身份证|银行卡|密码|验证码|住址|家里地址|门牌/,
  /工资|收入|存款|欠款|贷款|负债/,
  /生病|病危|住院|手术|癌症|抑郁/,
  /离婚|出轨|分手|怀孕/
];

const OPS_PATTERNS = [
  /掉线|断线|连不上|重启|崩溃|报错|超时|服务.*(挂|停|不可用)/,
  /模拟器|adb|桥接|网关|进程|端口|token 用|限额/
];

export function classifyCandidate(item, { convKey, now = Date.now() } = {}) {
  const isPrivate = String(convKey || '').startsWith('private:');
  const quality = [];
  let reject = null;

  const text = [item.attr, item.value, item.summary, item.detail].filter(Boolean).join(' ');

  // 1) 隐私风险：敏感字段一律不进长期记忆（不论公私）
  if (PRIVATE_PATTERNS.some((re) => re.test(text))) {
    quality.push('privacy_risk');
    reject = reject || 'privacy_risk';
  }

  // 2) 技术/运维事件：走 ops_log，不进人物记忆
  if (item.kind === 'event' && (item.category === 'tech' || item.category === 'ops' || OPS_PATTERNS.some((re) => re.test(text)))) {
    quality.push('ops_event');
    reject = reject || 'ops_event';
  }

  // 3) 证据门槛（不看模型自报的 confidence）：
  //    本人明确自述的爱好/偏好/习惯 → 单条即可
  //    推断出来的偏好/兴趣 → 至少 2 条独立证据
  //    推断出来的人格/性格 → 至少 3 条独立证据
  if (item.kind === 'fact') {
    const evidence = Number(item.evidence_count ?? item.evidenceCount) || 0;
    const selfStated = item.selfStated === true || item.self_stated === true;
    const cat = String(item.category || 'preference');
    if (!selfStated) {
      const needTrait = cat === 'trait' || cat === 'personality';
      const needPref = cat === 'preference' || cat === 'hobby' || cat === 'interest' || cat === 'habit';
      if ((needTrait && evidence < 3) || (needPref && evidence < 2)) {
        quality.push('over_inference');
        reject = reject || 'over_inference';
      }
    }
  }

  // 4) 玩笑/反讽/引用/身份不确定
  if (item.certainty === 'joke' || item.certainty === 'quote' || item.certainty === 'uncertain') {
    quality.push('uncertain');
    reject = reject || 'uncertain';
  }
  if (item.kind === 'fact' && !item.subjectQq && !item.subjectName) {
    quality.push('misattribution');
    reject = reject || 'misattribution';
  }

  // 5) 过期事件：太久远的事不进长期记忆
  if (item.kind === 'event' && Number(item.happenedAt) > 0 && now - Number(item.happenedAt) > 45 * 86400000) {
    quality.push('expired_event');
    reject = reject || 'expired_event';
  }

  // 6) 临时计划：必须有有效期，转 temporal
  let expiresAt = Number(item.expiresAt) || null;
  if (item.kind === 'fact' && item.category === 'plan') {
    const ttlDays = Number(item.ttlDays ?? item.ttl_days) > 0 ? Number(item.ttlDays ?? item.ttl_days) : 7;
    expiresAt = expiresAt || now + ttlDays * 86400000;
    if (quality.length === 0) quality.push('valid');
  }

  if (!quality.length) quality.push('valid');
  return { quality: quality.join(','), reject, expiresAt };
}

export function recordOpsEvent(db, item, { convKey, sourceKey } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS ops_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER, summary TEXT, detail TEXT, conv_key TEXT, source_key TEXT UNIQUE, created_at INTEGER
  )`);
  const at = Number(item.happenedAt) || Date.now();
  db.prepare(`INSERT OR IGNORE INTO ops_log(at, summary, detail, conv_key, source_key, created_at)
    VALUES(?,?,?,?,?,?)`)
    .run(at, String(item.summary || '').slice(0, 300), String(item.detail || '').slice(0, 600),
      convKey || null, sourceKey || `ops:${at}:${String(item.summary || '').slice(0, 40)}`, Date.now());
}

/** 候选质量汇总 */
export function qualitySummary(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS memory_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, subject_qq TEXT, subject_name TEXT,
    attr TEXT, value TEXT, summary TEXT, detail TEXT, participants TEXT, confidence REAL,
    scope TEXT, visibility TEXT, kind_of_fact TEXT, dedupe_key TEXT UNIQUE, batch_key TEXT,
    conv_key TEXT, source_type TEXT, status TEXT DEFAULT 'pending', reason TEXT, created_at INTEGER
  )`);
  const cols = db.prepare('PRAGMA table_info(memory_candidates)').all().map((c) => c.name);
  for (const [name, type] of [['quality', 'TEXT'], ['category', 'TEXT'], ['evidence_count', 'INTEGER'], ['self_stated', 'INTEGER'], ['expires_at', 'INTEGER']]) {
    if (!cols.includes(name)) db.exec(`ALTER TABLE memory_candidates ADD COLUMN ${name} ${type}`);
  }
  const rows = db.prepare('SELECT COALESCE(quality,\'unlabeled\') AS q, COUNT(*) AS c FROM memory_candidates GROUP BY q').all();
  const out = {};
  for (const r of rows) out[r.q] = Number(r.c);
  out.total = rows.reduce((a, r) => a + Number(r.c), 0);
  out.valid = out.valid || 0;
  out.ops_event = out.ops_event || 0;
  out.over_inference = out.over_inference || 0;
  out.privacy_risk = out.privacy_risk || 0;
  return out;
}
