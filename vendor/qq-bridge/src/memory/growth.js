/**
 * Memory V4 · 人物成长系统
 *
 * 真实经历 → 观察记录(experiences) → 证据(evidence) → 趋势 → 成长候选(candidates)
 *   → 证据验证 → 渐进生效(traits 版本化) → 后续衰减/消退
 *
 * 硬约束：
 * - 单条消息/单次事件不能改变稳定性格
 * - 重复消息不重复计证据（同会话同内容 6 小时内只算一次）
 * - 人格类变化永远先进候选（observeOnly）；表达类低风险偏好可在严格门槛下自动小幅生效
 * - 核心身份/权限不在成长系统里，任何成长都不能改写它们
 * - 所有生效都有版本记录，可回滚
 */
import crypto from 'node:crypto';

const DAY = 86400000;

export const SEED_TRAITS = [
  { key: 'cute', name: '可爱', weight: 3, category: 'personality', desc: '语气软、爱撒娇、会找台阶' },
  { key: 'tsundere', name: '傲娇', weight: 3, category: 'personality', desc: '嘴硬心软，说完照样去做' },
  { key: 'playful', name: '贪玩', weight: 3, category: 'personality', desc: '坐不住，有得玩就上手' },
  { key: 'lazy', name: '偷懒（爱吃白饭）', weight: 3, category: 'personality', desc: '干活能省就省，能躺不坐' },
  { key: 'curious', name: '好奇', weight: 2, category: 'personality', desc: '对新东西眼睛发亮' },
  { key: 'sharp', name: '毒舌', weight: 1, category: 'personality', desc: '偶尔扎熟人，扎完补软' }
];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS traits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trait_key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'personality',
  description TEXT,
  strength REAL NOT NULL DEFAULT 0.5,
  initial_strength REAL NOT NULL DEFAULT 0.5,
  confidence REAL NOT NULL DEFAULT 0.5,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  distinct_days INTEGER NOT NULL DEFAULT 0,
  evidence_cursor INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  first_evidence_at INTEGER,
  last_evidence_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS experiences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  topic TEXT,
  detail TEXT,
  source TEXT,
  source_key TEXT UNIQUE,
  conv_key TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exp_topic ON experiences(topic, at);

CREATE TABLE IF NOT EXISTS trait_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trait_key TEXT NOT NULL,
  experience_id INTEGER,
  kind TEXT NOT NULL,
  day TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  evidence_key TEXT UNIQUE,
  conv_key TEXT,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ev_trait ON trait_evidence(trait_key, day);

CREATE TABLE IF NOT EXISTS growth_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trait_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  before_strength REAL,
  proposed_strength REAL,
  delta REAL,
  evidence_count INTEGER,
  distinct_days INTEGER,
  span_days REAL,
  basis_cursor INTEGER,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  applied_at INTEGER,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reconcile_state TEXT NOT NULL DEFAULT 'current',
  stale_reason TEXT
);

-- Counts are cumulative totals relative to the candidate cursor, not per-apply deltas.
CREATE TABLE IF NOT EXISTS growth_reconcile (
  candidate_id INTEGER PRIMARY KEY,
  trait_key TEXT NOT NULL,
  state TEXT NOT NULL,
  snapshot_evidence_count INTEGER,
  current_evidence_count INTEGER,
  consumed_total INTEGER NOT NULL DEFAULT 0,
  unconsumed_total INTEGER NOT NULL DEFAULT 0,
  ambiguous_total INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trait_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trait_key TEXT NOT NULL,
  before_strength REAL,
  after_strength REAL,
  reason TEXT,
  evidence_ids TEXT,
  source TEXT,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS growth_journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail TEXT,
  trait_key TEXT,
  before_state TEXT,
  after_state TEXT,
  evidence_ids TEXT,
  confidence REAL,
  verified INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  conv_key TEXT
);

CREATE TABLE IF NOT EXISTS relationship_topics (
  qq TEXT NOT NULL,
  conv_key TEXT NOT NULL,
  topic TEXT NOT NULL,
  mentions INTEGER NOT NULL DEFAULT 0,
  first_at INTEGER,
  last_at INTEGER,
  PRIMARY KEY (qq, conv_key, topic)
);

CREATE TABLE IF NOT EXISTS relationships (
  qq TEXT NOT NULL,
  conv_key TEXT NOT NULL,
  familiarity REAL NOT NULL DEFAULT 0.1,
  shared_topics TEXT,
  style_note TEXT,
  interactions INTEGER NOT NULL DEFAULT 0,
  last_interaction INTEGER,
  updated_at INTEGER,
  PRIMARY KEY(qq, conv_key)
);

CREATE TABLE IF NOT EXISTS affect (
  conv_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  intensity REAL NOT NULL DEFAULT 0.3,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS interest_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  topic TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('mention','explore','participate','dislike','instruction','self')),
  source TEXT,
  conv_key TEXT,
  qq TEXT,
  weight REAL NOT NULL DEFAULT 0,
  signal_key TEXT UNIQUE,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sig_topic ON interest_signals(topic, kind, at);
`;

/**
 * 最小事务包装：node:sqlite 的 DatabaseSync 没有 .transaction()，
 * 手写 BEGIN IMMEDIATE / COMMIT / ROLLBACK。写入失败时整组回滚，
 * 不会留下「版本记了、强度没改」这类半截成长状态。
 */
function withTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

export function ensureGrowthSchema(db) {
  db.exec(SCHEMA);
  // 兼容老库：补 tier / source 列
  const tCols = db.prepare('PRAGMA table_info(traits)').all().map((c) => c.name);
  if (!tCols.includes('tier')) db.exec("ALTER TABLE traits ADD COLUMN tier TEXT DEFAULT 'long'");
  if (!tCols.includes('evidence_cursor')) db.exec('ALTER TABLE traits ADD COLUMN evidence_cursor INTEGER NOT NULL DEFAULT 0');
  const reconcileCols = db.prepare('PRAGMA table_info(growth_reconcile)').all().map((c) => c.name);
  for (const [oldName, newName] of [['consumed_count', 'consumed_total'], ['unconsumed_count', 'unconsumed_total'], ['ambiguous_count', 'ambiguous_total']]) {
    if (reconcileCols.includes(oldName) && !reconcileCols.includes(newName)) {
      db.exec(`ALTER TABLE growth_reconcile RENAME COLUMN ${oldName} TO ${newName}`);
    }
  }
  const cCols = db.prepare('PRAGMA table_info(growth_candidates)').all().map((c) => c.name);
  if (!cCols.includes('basis_cursor')) db.exec('ALTER TABLE growth_candidates ADD COLUMN basis_cursor INTEGER');
  if (!cCols.includes('reconcile_state')) db.exec("ALTER TABLE growth_candidates ADD COLUMN reconcile_state TEXT NOT NULL DEFAULT 'current'");
  if (!cCols.includes('stale_reason')) db.exec('ALTER TABLE growth_candidates ADD COLUMN stale_reason TEXT');
  // Old schema used UNIQUE(trait_key,kind,status), which allowed only one applied
  // strengthen candidate forever. Rebuild once so history can retain many applied
  // versions while only one pending candidate is allowed.
  const candSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='growth_candidates'").get()?.sql || '';
  if (/UNIQUE\s*\(\s*trait_key\s*,\s*kind\s*,\s*status\s*\)/i.test(candSql)) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`CREATE TABLE growth_candidates_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trait_key TEXT NOT NULL,
        kind TEXT NOT NULL,
        before_strength REAL,
        proposed_strength REAL,
        delta REAL,
        evidence_count INTEGER,
        distinct_days INTEGER,
        span_days REAL,
        basis_cursor INTEGER,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        applied_at INTEGER,
        created_at INTEGER NOT NULL,
        reviewed_at INTEGER,
        reconcile_state TEXT NOT NULL DEFAULT 'current',
        stale_reason TEXT
      )`);
      const nowCols = db.prepare('PRAGMA table_info(growth_candidates)').all().map((c) => c.name);
      const copyCols = nowCols.filter((name) => name !== 'basis_cursor');
      db.exec(`INSERT INTO growth_candidates_new (${copyCols.join(',')}, basis_cursor)
        SELECT ${copyCols.join(',')}, NULL FROM growth_candidates`);
      db.exec('DROP TABLE growth_candidates');
      db.exec('ALTER TABLE growth_candidates_new RENAME TO growth_candidates');
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw error;
    }
  }
  db.exec('DROP INDEX IF EXISTS uniq_growth_pending');
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS uniq_growth_pending ON growth_candidates(trait_key, kind) WHERE status='pending' AND reconcile_state='current'");
  db.exec('CREATE TABLE IF NOT EXISTS growth_meta(key TEXT PRIMARY KEY, value TEXT)');
  if (!db.prepare("SELECT 1 FROM growth_meta WHERE key='legacy_reconcile_v1'").get()) {
    const legacy = db.prepare("SELECT * FROM growth_candidates WHERE basis_cursor IS NULL").all();
    for (const c of legacy) {
      const currentEvidence = Number(db.prepare('SELECT COUNT(*) c FROM trait_evidence WHERE trait_key=?').get(c.trait_key).c);
      const state = c.status === 'applied' ? 'legacy-applied' : c.status === 'rejected' ? 'legacy-rejected' : 'legacy-ambiguous';
      db.prepare('UPDATE growth_candidates SET reconcile_state=?, stale_reason=? WHERE id=?')
        .run(state, state === 'legacy-ambiguous' ? '旧候选缺少 basis_cursor，需人工对账' : null, c.id);
      db.prepare(`INSERT OR REPLACE INTO growth_reconcile
        (candidate_id, trait_key, state, snapshot_evidence_count, current_evidence_count,
         consumed_total, unconsumed_total, ambiguous_total, note, created_at, updated_at)
        VALUES(?,?,?,?,?,0,0,?,?,?,?)`).run(
        c.id, c.trait_key, state, Number(c.evidence_count) || 0, currentEvidence,
        currentEvidence, state === 'legacy-ambiguous' ? '历史证据消费情况无法可靠确认，禁止自动应用' : '历史已处理，仅保留审计',
        Date.now(), Date.now());
      if (state === 'legacy-ambiguous') {
        db.prepare(`INSERT INTO growth_journal(at, kind, summary, detail, trait_key, evidence_ids, confidence, verified, source)
          VALUES(?,?,?,?,?,?,?,?,?)`).run(Date.now(), 'legacy_reconcile',
          '旧成长候选等待人工对账', 'basis_cursor 为空；不自动补算 delta', c.trait_key, '[]', 0.3, 0, 'migration');
      }
    }
    db.prepare("INSERT OR REPLACE INTO growth_meta(key,value) VALUES('legacy_reconcile_v1','1')").run();
  }
  // One-time migration only: existing traits already consumed their historical
  // evidence when strength was built. A meta flag prevents this from swallowing
  // newly added evidence on every evaluation.
  db.exec('CREATE TABLE IF NOT EXISTS growth_meta(key TEXT PRIMARY KEY, value TEXT)');
  if (!db.prepare("SELECT 1 FROM growth_meta WHERE key='evidence_cursor_v1'").get()) {
    db.prepare('UPDATE traits SET evidence_cursor=(SELECT COALESCE(MAX(id),0) FROM trait_evidence WHERE trait_key=traits.trait_key)').run();
    db.prepare("INSERT OR REPLACE INTO growth_meta(key,value) VALUES('evidence_cursor_v1','1')").run();
  }
  const eCols = db.prepare('PRAGMA table_info(trait_evidence)').all().map((c) => c.name);
  if (!eCols.includes('source')) db.exec("ALTER TABLE trait_evidence ADD COLUMN source TEXT DEFAULT 'behavior'");
  const now = Date.now();
  for (const t of SEED_TRAITS) {
    const s = Math.min(1, t.weight / 4);
    db.prepare(`INSERT OR IGNORE INTO traits
      (trait_key, name, category, description, strength, initial_strength, confidence, tier, created_at, updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(t.key, t.name, t.category, t.desc, s, s, 0.9, 'long', now, now);
  }
}

const hash = (...p) => crypto.createHash('sha1').update(p.join('|')).digest('hex').slice(0, 20);
const dayOf = (at) => new Date(Number(at) || Date.now()).toISOString().slice(0, 10);

/** 记录一次经历（工具行为/聊天/事件），幂等 */
export function recordExperience(db, { kind, topic, detail, source, sourceKey, convKey, at = Date.now() }) {
  ensureGrowthSchema(db);
  const key = sourceKey || hash('exp', kind, topic || '', convKey || '', dayOf(at), String(detail || '').slice(0, 40));
  const info = db.prepare(`INSERT OR IGNORE INTO experiences(at, kind, topic, detail, source, source_key, conv_key, created_at)
    VALUES(?,?,?,?,?,?,?,?)`)
    .run(Number(at), String(kind), topic || null, detail ? String(detail).slice(0, 300) : null,
      source || null, key, convKey || null, Date.now());
  return { inserted: Number(info.changes) > 0, id: Number(info.lastInsertRowid), key };
}

/**
 * 给某个 trait 追加证据。
 * 去重规则：同会话 + 同 trait + 同内容，6 小时内只算一次（防止重复刷）。
 */
export function addEvidence(db, { traitKey, kind = 'behavior', convKey = null, experienceId = null, note = '', weight = 1, at = Date.now(), source = 'behavior' }) {
  ensureGrowthSchema(db);
  // 证据来源白名单：模型自述 / 别人的指令 / 角色卡设定 都不能当独立证据
  if (source === 'self' || source === 'instruction' || source === 'rolecard' || source === 'summary') {
    return { rejected: true, reason: `source:${source}` };
  }
  const day = dayOf(at);
  // 同会话 + 同 trait + 同内容：同一天只算一次（比 6 小时窗口更严格）
  const contentKey = hash('ev', traitKey, convKey || '', String(note).slice(0, 60), day);
  const existing = db.prepare('SELECT id FROM trait_evidence WHERE evidence_key=?').get(contentKey);
  if (existing) return { duplicate: true, id: existing.id };

  const info = db.prepare(`INSERT INTO trait_evidence(trait_key, experience_id, kind, day, weight, evidence_key, conv_key, note, created_at, source)
    VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(traitKey, experienceId, kind, day, Number(weight) || 1, contentKey, convKey, String(note).slice(0, 200), Number(at) || Date.now(), source);
  const id = Number(info.lastInsertRowid);

  const agg = db.prepare(`SELECT COUNT(*) AS c, COUNT(DISTINCT day) AS days,
      MIN(created_at) AS firstAt, MAX(created_at) AS lastAt
    FROM trait_evidence WHERE trait_key=?`).get(traitKey);
  db.prepare(`UPDATE traits SET evidence_count=?, distinct_days=?, first_evidence_at=?, last_evidence_at=?, updated_at=? WHERE trait_key=?`)
    .run(Number(agg.c), Number(agg.days), Number(agg.firstAt), Number(agg.lastAt), Date.now(), traitKey);
  return { duplicate: false, id, count: Number(agg.c), days: Number(agg.days) };
}

/**
 * 从真实经历里长出新兴趣：同一话题 >=3 次、跨 >=2 天，就建一个 interest trait。
 * 只建 trait 与证据，不直接改六项性格。
 */
export function createInterestTraits(db, options = {}) {
  ensureGrowthSchema(db);
  // trait + 证据 + 计数 + 日记是一组写操作：中途失败不能留下半条兴趣。
  return withTransaction(db, () => createInterestTraitsTx(db, options));
}

function createInterestTraitsTx(db, { minWeight = 3, minBehavior = 2, minDays = 2 } = {}) {
  // 只看兴趣信号：mention 权重 0、dislike 负权重，只有 explore/participate 计入
  const rows = db.prepare(`
    SELECT topic,
      SUM(CASE WHEN kind='participate' THEN 1 ELSE 0 END) AS behavior,
      SUM(CASE WHEN kind='explore' THEN 0.5 ELSE 0 END) AS explore,
      SUM(CASE WHEN kind='dislike' THEN -1 ELSE 0 END) AS dislike,
      COUNT(DISTINCT strftime('%Y-%m-%d', at/1000, 'unixepoch')) AS days,
      COUNT(*) AS mentions
    FROM interest_signals
    WHERE topic IS NOT NULL
    GROUP BY topic`).all();
  const created = [];
  for (const r of rows) {
    const positive = Number(r.behavior) + Number(r.explore);
    if (positive < minWeight) continue;
    if (Number(r.behavior) < minBehavior) continue;      // 必须真的参与过
    if (Number(r.days) < minDays) continue;              // 跨天
    if (positive + Number(r.dislike) <= 0) continue;     // 明确讨厌就不生成正向兴趣
    const key = `interest:${r.topic}`.slice(0, 40);
    if (db.prepare('SELECT 1 FROM traits WHERE trait_key=?').get(key)) continue;
    const now = Date.now();
    db.prepare(`INSERT INTO traits(trait_key, name, category, description, strength, initial_strength, confidence, created_at, updated_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(key, `喜欢${r.topic}`, 'interest',
      `来自 ${r.behavior} 次实际参与 + ${r.explore} 分探索，跨 ${r.days} 天`, 0.35, 0.35, 0.55, now, now);
    const sigs = db.prepare(`SELECT * FROM interest_signals WHERE topic=? AND kind IN ('participate','explore') ORDER BY id DESC LIMIT 20`).all(r.topic);
    // 证据必须带上 conv_key：否则 invalidateEvidenceForTopic({convKey}) 永远匹配不到它们，
    // 「删掉某个会话的记忆 → 兴趣证据失效」这条链路就是断的（审计发现 17+5 条全是 NULL）。
    // note 里必须带 topic：invalidateEvidenceForTopic 是按 LIKE %topic% 匹配 note 的，
    // 只写工具名（android__android_batch）的话，删「消消乐」相关记忆永远匹配不到兴趣证据。
    const evidenceIds = [];
    for (const s of sigs) {
      const info = db.prepare(`INSERT OR IGNORE INTO trait_evidence(trait_key, experience_id, kind, day, weight, evidence_key, conv_key, note, created_at, source)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).run(key, null, s.kind, dayOf(s.at), s.kind === 'participate' ? 1 : 0.5,
        hash('ev', key, String(s.id)), s.conv_key || null, `${r.topic} ${String(s.note || '')}`.slice(0, 60), Number(s.at), s.kind === 'participate' ? 'behavior' : 'explore');
      if (Number(info.changes) > 0) evidenceIds.push(Number(info.lastInsertRowid));
    }
    const agg = db.prepare('SELECT COUNT(*) c, COUNT(DISTINCT day) d, MIN(created_at) a, MAX(created_at) b FROM trait_evidence WHERE trait_key=?').get(key);
    db.prepare('UPDATE traits SET evidence_count=?, distinct_days=?, first_evidence_at=?, last_evidence_at=?, evidence_cursor=? WHERE trait_key=?')
      .run(Number(agg.c), Number(agg.d), Number(agg.a), Number(agg.b), Number(db.prepare('SELECT COALESCE(MAX(id),0) m FROM trait_evidence WHERE trait_key=?').get(key).m), key);
    // 兴趣形成也是一次「状态变化」：不写版本就没法追溯、也没法 rollback（审计发现 versions=0）。
    // before=0 表示「之前没有这个兴趣」；回滚后强度归零，上下文只注入 >=0.55 的 trait，等于不再提它。
    db.prepare(`INSERT INTO trait_versions(trait_key, before_strength, after_strength, reason, evidence_ids, source, at)
      VALUES(?,?,?,?,?,?,?)`).run(key, 0, 0.35,
      `兴趣形成：实际参与 ${r.behavior} 次、探索 ${r.explore} 分、跨 ${r.days} 天`,
      JSON.stringify(evidenceIds), 'system', now);
    db.prepare(`INSERT INTO growth_journal(at, kind, summary, detail, trait_key, before_state, after_state, evidence_ids, confidence, verified, source)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(now, 'interest_formed', `开始喜欢${r.topic}`,
      `实际参与 ${r.behavior} 次、探索 ${r.explore} 分、跨 ${r.days} 天`, key, '0.00', '0.35', JSON.stringify(evidenceIds), 0.55, 1, 'system');
    created.push({ key, topic: r.topic, behavior: Number(r.behavior), explore: Number(r.explore) });
  }
  return created;
}

/** 话题-兴趣信号分类：提到、探索、参与、讨厌、指令、自述 */
export function classifyInterestSignal(text) {
  const s = String(text || '');
  if (!s.trim()) return null;
  // 指令 = 别人让她去做，不是她自己的兴趣。除了「你要/应该」，还要认
  // 「帮我玩/你去试试/测试一下/试玩」这类被动执行的说法。
  if (/你要|你应该|以后你|必须喜欢|给我喜欢|命令你|帮我(玩|试|测试|看看|试试)|你去(玩|试)|去玩(一下|玩|看)?|试试看|试玩|测试一下|给我(玩|试)/.test(s)) {
    return { kind: 'instruction', weight: 0 };
  }
  if (/不喜欢|讨厌|没意思|腻了|不想玩|不想看|无聊死/.test(s)) return { kind: 'dislike', weight: -1 };
  if (/攻略|怎么玩|研究|查一下|搜一下|教程|机制|玩法|出装|流派/.test(s)) return { kind: 'explore', weight: 0.5 };
  return { kind: 'mention', weight: 0 };
}

/** 记录兴趣信号（幂等：同会话同话题同类型同一天只算一次） */
export function recordInterestSignal(db, { topic, kind, source, convKey, qq, note, at = Date.now(), weight }) {
  ensureGrowthSchema(db);
  const day = dayOf(at);
  const key = hash('sig', topic, kind, convKey || '', day, String(note || '').slice(0, 40));
  const info = db.prepare(`INSERT OR IGNORE INTO interest_signals(at, topic, kind, source, conv_key, qq, weight, signal_key, note, created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(Number(at), topic, kind, source || null, convKey || null, qq || null,
      Number(weight) || 0, key, String(note || '').slice(0, 120), Date.now());
  return { inserted: Number(info.changes) > 0, id: Number(info.lastInsertRowid) };
}

/** 计算某 trait 的证据跨度（天） */
export function evidenceSpan(db, traitKey) {
  const row = db.prepare(`SELECT MIN(created_at) a, MAX(created_at) b, COUNT(DISTINCT day) d, COUNT(*) c
    FROM trait_evidence WHERE trait_key=?`).get(traitKey);
  const span = row?.a && row?.b ? (Number(row.b) - Number(row.a)) / DAY : 0;
  return { count: Number(row?.c || 0), days: Number(row?.d || 0), span };
}

/**
 * 评估成长：达到门槛就产出候选。
 * 表达/兴趣类（expression/interest/habit）在 autoApply 且幅度≤maxDelta 时自动生效；
 * 人格类永远只产出候选。
 */
export function evaluateGrowth(db, conf = {}) {
  ensureGrowthSchema(db);
  const cfg = {
    minEvidence: 5, minDistinctDays: 2, minSpanDays: 2,
    maxAutoDelta: 0.1, autoApplyExpression: true, ...conf
  };
  const traits = db.prepare("SELECT * FROM traits WHERE status IN ('active','candidate')").all();
  const produced = [];
  for (const t of traits) {
    const ev = evidenceSpan(db, t.trait_key);
    if (ev.count < cfg.minEvidence) continue;
    if (ev.days < cfg.minDistinctDays) continue;
    if (ev.span < cfg.minSpanDays) continue;

    // Only evidence added since the last consumed watermark may raise strength.
    // Re-evaluating the same evidence must not create another delta.
    const cursor = Number(t.evidence_cursor) || 0;
    const fresh = db.prepare('SELECT id FROM trait_evidence WHERE trait_key=? AND id>? ORDER BY id').all(t.trait_key, cursor);
    if (!fresh.length) continue;
    const basisCursor = Number(fresh[fresh.length - 1].id);
    const before = Number(t.strength);
    const desiredUp = 0.02 * fresh.length;
    const delta = Math.min(cfg.maxAutoDelta, desiredUp);
    const proposed = Math.max(0, Math.min(1, before + delta));
    if (Math.abs(proposed - before) < 0.005) continue;

    const pending = db.prepare("SELECT id FROM growth_candidates WHERE trait_key=? AND kind='strengthen' AND status='pending' AND reconcile_state='current'").get(t.trait_key);
    if (pending) continue;

    const auto = cfg.autoApplyExpression && (t.category === 'expression' || t.category === 'interest' || t.category === 'habit');
    const reason = `证据 ${ev.count} 条 / ${ev.days} 天 / 跨度 ${ev.span.toFixed(1)} 天`;
    const info = db.prepare(`INSERT INTO growth_candidates
      (trait_key, kind, before_strength, proposed_strength, delta, evidence_count, distinct_days, span_days, basis_cursor, reason, status, created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(t.trait_key, 'strengthen', before, proposed, proposed - before, ev.count, ev.days, ev.span, basisCursor, reason,
        'pending', Date.now());
    const id = Number(info.lastInsertRowid);
    if (auto) applyCandidate(db, id, { source: 'auto' });
    produced.push({ id, trait: t.trait_key, delta: proposed - before, auto });
  }
  return produced;
}

const REVIEW_READ_ONLY_NOTE = /bili_hot|bili_search|bili_video_info|bili_comments|bili_danmaku|bili_subtitle|qzone_feeds|qzone_detail|android_status|android_screenshot|android_ui|android_capture_share/i;

/**
 * 被否决兴趣的复核：只有「纠错之后新产生的真实参与证据」够量，才产出待审候选。
 * - 历史证据（纠错之前的）按 cutoff 排除；
 * - 只读探索（kind=explore / source=explore）不参与；
 * - 只读工具即便被误记成 behavior，也按 note 再挡一次；
 * - 绝不自动改回 active，必须人工 `--apply` 确认。
 */
export function reviewRejectedInterests(db, conf = {}) {
  ensureGrowthSchema(db);
  const cfg = { minFreshEvidence: 5, minDistinctDays: 2, proposedStrength: 0.35, ...conf };
  const rows = db.prepare("SELECT * FROM traits WHERE status='rejected'").all();
  const produced = [];
  for (const t of rows) {
    // 截止点：最近一次纠错时间；如果复核候选被人工驳回，也要从驳回之后重新算。
    const correction = db.prepare("SELECT MAX(at) a FROM trait_versions WHERE trait_key=? AND source='correction'").get(t.trait_key);
    const rejectedReview = db.prepare("SELECT MAX(reviewed_at) a FROM growth_candidates WHERE trait_key=? AND kind='review' AND status='rejected'").get(t.trait_key);
    const cutoff = Math.max(Number(correction?.a || 0), Number(rejectedReview?.a || 0));
    const fresh = db.prepare(`SELECT id, day, note, created_at FROM trait_evidence
      WHERE trait_key=? AND kind='behavior' AND source='behavior' AND created_at > ? ORDER BY id`).all(t.trait_key, cutoff);
    const genuine = fresh.filter((e) => !REVIEW_READ_ONLY_NOTE.test(String(e.note || '')));
    const days = new Set(genuine.map((e) => String(e.day))).size;
    if (genuine.length < cfg.minFreshEvidence) continue;
    if (days < cfg.minDistinctDays) continue;
    const pending = db.prepare("SELECT id FROM growth_candidates WHERE trait_key=? AND kind='review' AND status='pending'").get(t.trait_key);
    if (pending) continue;
    const stamps = genuine.map((e) => Number(e.created_at));
    const span = (Math.max(...stamps) - Math.min(...stamps)) / DAY;
    const reason = `被否决兴趣的新证据复核：纠错后真实参与 ${genuine.length} 条 / ${days} 天（不含只读探索与历史证据）`;
    const info = db.prepare(`INSERT INTO growth_candidates
      (trait_key, kind, before_strength, proposed_strength, delta, evidence_count, distinct_days, span_days, reason, status, created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run(t.trait_key, 'review', Number(t.strength), cfg.proposedStrength, cfg.proposedStrength - Number(t.strength),
        genuine.length, days, span, reason, 'pending', Date.now());
    const id = Number(info.lastInsertRowid);
    db.prepare(`INSERT INTO growth_journal(at, kind, summary, detail, trait_key, evidence_ids, confidence, verified, source)
      VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(Date.now(), 'review_requested', `${t.name} 出现新的真实证据`, reason, t.trait_key,
        JSON.stringify(genuine.map((e) => e.id)), 0.5, 0, 'system');
    produced.push({ id, trait: t.trait_key, count: genuine.length, days });
  }
  return produced;
}

/** 生效候选：写版本 + 更新 strength + 日记 */
export function applyCandidate(db, id, options = {}) {
  ensureGrowthSchema(db);
  // 改强度 + 改候选状态 + 写版本 + 写日记必须同进同退。
  return withTransaction(db, () => applyCandidateTx(db, id, options));
}

function applyCandidateTx(db, id, { source = 'manual', reason = '' } = {}) {
  const c = db.prepare('SELECT * FROM growth_candidates WHERE id=?').get(id);
  if (!c || c.status !== 'pending') return { ok: false, error: '候选不存在或已处理' };
  const t = db.prepare('SELECT * FROM traits WHERE trait_key=?').get(c.trait_key);
  if (!t) return { ok: false, error: 'trait 不存在' };

  // Re-read current state inside the transaction. A candidate based on an old
  // snapshot must never overwrite a newer trait strength.
  if (c.reconcile_state !== 'current') {
    return { ok: false, error: 'LEGACY_CANDIDATE_AMBIGUOUS: 旧候选需人工对账，禁止自动应用' };
  }
  if (c.basis_cursor == null) {
    db.prepare("UPDATE growth_candidates SET reconcile_state='legacy-ambiguous', stale_reason=? WHERE id=?")
      .run('缺少 basis_cursor，禁止自动应用', id);
    return { ok: false, error: 'LEGACY_CANDIDATE_AMBIGUOUS: 缺少证据水位，禁止自动应用' };
  }
  if (Math.abs(Number(t.strength) - Number(c.before_strength)) > 0.005) {
    db.prepare("UPDATE growth_candidates SET reconcile_state='stale', stale_reason=? WHERE id=?")
      .run(`候选 before=${Number(c.before_strength).toFixed(3)}，当前=${Number(t.strength).toFixed(3)}`, id);
    return { ok: false, error: `STALE_CANDIDATE: 当前 strength=${Number(t.strength).toFixed(3)}，候选基于 ${Number(c.before_strength).toFixed(3)}` };
  }

  const before = Number(t.strength);
  const after = Math.max(0, Math.min(1, Number(c.proposed_strength)));
  // 复核候选是「人工确认后」才生效的唯一入口：只有它能把 rejected 改回 active。
  // 普通 strengthen 候选保持原状态不动（原来也不改状态）。
  const nextStatus = c.kind === 'review' && t.status === 'rejected' ? 'active' : t.status;
  db.prepare(`UPDATE traits SET strength=?, status=?, evidence_cursor=MAX(COALESCE(evidence_cursor,0), COALESCE(?,0)), updated_at=? WHERE trait_key=?`)
    .run(after, nextStatus, Number(c.basis_cursor) || null, Date.now(), c.trait_key);
  db.prepare("UPDATE growth_candidates SET status='applied', applied_at=?, reviewed_at=?, reconcile_state='applied', stale_reason=NULL WHERE id=?").run(Date.now(), Date.now(), id);
  const basis = Number(c.basis_cursor) || 0;
  const consumed = Number(db.prepare('SELECT COUNT(*) c FROM trait_evidence WHERE trait_key=? AND id<=?').get(c.trait_key, basis).c);
  const unconsumed = Number(db.prepare('SELECT COUNT(*) c FROM trait_evidence WHERE trait_key=? AND id>?').get(c.trait_key, basis).c);
  db.prepare(`INSERT OR REPLACE INTO growth_reconcile
    (candidate_id, trait_key, state, snapshot_evidence_count, current_evidence_count,
     consumed_total, unconsumed_total, ambiguous_total, note, created_at, updated_at)
    VALUES(?,?, 'applied', ?, ?, ?, ?, 0, ?, ?, ?)`).run(
    id, c.trait_key, Number(c.evidence_count) || 0,
    consumed + unconsumed, consumed, unconsumed, '应用完成', Date.now(), Date.now());
  const evIds = db.prepare('SELECT id FROM trait_evidence WHERE trait_key=? ORDER BY id DESC LIMIT 20').all(c.trait_key).map((r) => r.id);
  db.prepare('INSERT INTO trait_versions(trait_key, before_strength, after_strength, reason, evidence_ids, source, at) VALUES(?,?,?,?,?,?,?)')
    .run(c.trait_key, before, after, reason || c.reason, JSON.stringify(evIds), source, Date.now());
  if (source === 'auto') {
    db.prepare(`INSERT INTO growth_journal(at, kind, summary, detail, trait_key, before_state, after_state, evidence_ids, confidence, verified, source)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run(Date.now(), 'trait_shift', `${t.name} 略有增强`, `强度 ${before.toFixed(2)} → ${after.toFixed(2)}（${c.reason}）`,
        c.trait_key, String(before.toFixed(2)), String(after.toFixed(2)), JSON.stringify(evIds), 0.6, 0, 'auto');
  }
  return { ok: true, trait: c.trait_key, before, after };
}

export function rejectCandidate(db, id, reason = '') {
  ensureGrowthSchema(db);
  db.prepare('UPDATE growth_candidates SET status=?, reviewed_at=?, reason=? WHERE id=?')
    .run('rejected', Date.now(), reason || 'manual reject', id);
  return { ok: true };
}

/** 回滚到某个版本 */
export function rollbackTrait(db, versionId) {
  ensureGrowthSchema(db);
  const v = db.prepare('SELECT * FROM trait_versions WHERE id=?').get(versionId);
  if (!v) return { ok: false, error: '版本不存在' };
  const t = db.prepare('SELECT * FROM traits WHERE trait_key=?').get(v.trait_key);
  db.prepare('UPDATE traits SET strength=?, updated_at=? WHERE trait_key=?').run(Number(v.before_strength), Date.now(), v.trait_key);
  db.prepare('INSERT INTO growth_journal(at, kind, summary, detail, trait_key, before_state, after_state, confidence, verified, source) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(Date.now(), 'rollback', `回滚 ${t?.name || v.trait_key}`, `回到 ${Number(v.before_strength).toFixed(2)}`, v.trait_key, String(t?.strength), String(v.before_strength), 1, 1, 'manual');
  return { ok: true, trait: v.trait_key, strength: Number(v.before_strength) };
}

/** 衰减：很久没有新证据的 trait 缓慢回落；低于阈值标记 faded */
export function decayTraits(db, { floor = 0.15 } = {}) {
  ensureGrowthSchema(db);
  const now = Date.now();
  const rows = db.prepare("SELECT * FROM traits WHERE status='active' AND last_evidence_at IS NOT NULL").all();
  const changed = [];
  for (const t of rows) {
    const idle = (now - Number(t.last_evidence_at)) / DAY;
    const strength = Number(t.strength);
    // 分层衰减：越稳定的兴趣，宽限期越长、衰减越慢
    // 长期（strength>=0.6）：30 天宽限，0.004/天
    // 中期（0.35~0.6）：14 天宽限，0.01/天
    // 短期（<0.35）：7 天宽限，0.02/天
    let grace; let rate;
    if (strength >= 0.6) { grace = 30; rate = 0.004; }
    else if (strength >= 0.35) { grace = 14; rate = 0.01; }
    else { grace = 7; rate = 0.02; }
    // 参与过很多次的长期兴趣再给宽限加成
    if (Number(t.evidence_count) >= 20 && strength >= 0.5) grace += 15;
    if (idle < grace) continue;
    const next = Math.max(floor, strength - rate * Math.min(60, idle - grace + 1));
    if (Math.abs(next - strength) < 0.004) continue;
    db.prepare('UPDATE traits SET strength=?, updated_at=? WHERE trait_key=?').run(next, now, t.trait_key);
    db.prepare('INSERT INTO trait_versions(trait_key, before_strength, after_strength, reason, source, at) VALUES(?,?,?,?,?,?)')
      .run(t.trait_key, strength, next, `闲置 ${idle.toFixed(0)} 天（宽限 ${grace} 天）自然回落`, 'decay', now);
    changed.push({ trait: t.trait_key, before: strength, after: next });
  }
  return changed;
}

/** 记忆被纠正/删除后：让相关证据失效，并重新评估 traits */
export function invalidateEvidenceForTopic(db, { topic, convKey = null, reason = '记忆被纠正/删除' } = {}) {
  ensureGrowthSchema(db);
  if (!topic) return { invalidated: 0 };
  const like = `%${String(topic).slice(0, 30)}%`;
  const rows = convKey
    ? db.prepare('SELECT * FROM trait_evidence WHERE conv_key=? AND (note LIKE ? OR evidence_key LIKE ?)').all(convKey, like, like)
    : db.prepare('SELECT * FROM trait_evidence WHERE note LIKE ?').all(like);
  const affected = new Set();
  for (const r of rows) {
    db.prepare('DELETE FROM trait_evidence WHERE id=?').run(r.id);
    affected.add(r.trait_key);
  }
  // 只在同一会话内失效兴趣信号：删 A 群的记忆不能顺手清掉 B 群的同类信号。
  // 成长证据本来就按 conv_key 隔离，兴趣信号必须一致；conv_key 为空的历史行不动，避免误伤。
  if (convKey) {
    db.prepare('DELETE FROM interest_signals WHERE topic LIKE ? AND conv_key = ?').run(like, String(convKey));
  } else {
    db.prepare('DELETE FROM interest_signals WHERE topic LIKE ?').run(like);
  }
  const reassessed = [];
  for (const key of affected) reassessed.push(reassessTrait(db, key, { reason }));
  return { invalidated: rows.length, affected: affected.size, reassessed };
}

/** 重新评估某 trait：证据不足时回滚到上一个版本并记日记 */
export function reassessTrait(db, traitKey, options = {}) {
  ensureGrowthSchema(db);
  // 证据计数回写 + 可能的回滚 + 日记必须同进同退。
  return withTransaction(db, () => reassessTraitTx(db, traitKey, options));
}

function reassessTraitTx(db, traitKey, { reason = '证据不足' } = {}) {
  const agg = evidenceSpan(db, traitKey);
  db.prepare('UPDATE traits SET evidence_count=?, distinct_days=?, updated_at=? WHERE trait_key=?')
    .run(agg.count, agg.days, Date.now(), traitKey);
  const t = db.prepare('SELECT * FROM traits WHERE trait_key=?').get(traitKey);
  if (!t) return { ok: false };
  if (agg.count >= 5 && agg.days >= 2) return { ok: true, kept: true };
  const v = db.prepare('SELECT * FROM trait_versions WHERE trait_key=? ORDER BY id ASC LIMIT 1').get(traitKey);
  const target = v ? Number(v.before_strength) : Number(t.initial_strength);
  const beforeStrength = Number(t.strength);
  // 已被人工否决的兴趣（status=rejected）不能在纠错重评里被重新激活：
  // decayTraits 只处理 active，一旦这里改回 active，0 强度会在闲置后被 floor(0.15) 抬起来，
  // 等于让错误的兴趣"自动复活"。所以 rejected 保持 rejected。
  const nextStatus = t.status === 'rejected' ? 'rejected' : 'active';
  db.prepare('UPDATE traits SET strength=?, status=?, updated_at=? WHERE trait_key=?')
    .run(target, nextStatus, Date.now(), traitKey);
  // 回滚同样写版本：否则「改回去」这件事本身不可追溯，也无法再被回滚/复核。
  db.prepare('INSERT INTO trait_versions(trait_key, before_strength, after_strength, reason, source, at) VALUES(?,?,?,?,?,?)')
    .run(traitKey, beforeStrength, target, `纠错回滚：${reason}`, 'correction', Date.now());
  db.prepare('INSERT INTO growth_journal(at, kind, summary, detail, trait_key, before_state, after_state, confidence, verified, source) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(Date.now(), 'growth_rollback', `撤销 ${t.name} 的成长`, `${reason}（剩余证据 ${agg.count} 条 / ${agg.days} 天）${nextStatus === 'rejected' ? '；该兴趣已被人工否决，保持 rejected' : ''}`,
      traitKey, String(beforeStrength.toFixed(2)), String(target.toFixed(2)), 1, 1, 'correction');
  return { ok: true, rolledBack: true, trait: traitKey, strength: target, status: nextStatus };
}

/** 关系演化：只按真实互动与话题缓慢变化，不推断私密感情 */
export function noteInteraction(db, { qq, convKey, topic, topics: moreTopics = [], positive = 0, at = Date.now() }) {
  if (!qq || !convKey) return { ok: false };
  ensureGrowthSchema(db);
  const q = String(qq);
  const conv = String(convKey);
  // 一条消息可能同时命中多个话题；去重后最多记 6 个，每个话题各自累计次数。
  const candidates = [...new Set([...(Array.isArray(moreTopics) ? moreTopics : []), ...(topic ? [topic] : [])]
    .filter(Boolean).map((t) => String(t).slice(0, 20)))].slice(0, 6);
  for (const t of candidates) {
    db.prepare(`INSERT INTO relationship_topics(qq, conv_key, topic, mentions, first_at, last_at) VALUES(?,?,?,1,?,?)
      ON CONFLICT(qq, conv_key, topic) DO UPDATE SET mentions=mentions+1, last_at=excluded.last_at`)
      .run(q, conv, t, at, at);
  }
  // 只有"说过不止一次"的话题才算共同话题；不足 2 次的保留在计数表里，不写进 shared_topics。
  const confirmed = candidates.length
    ? db.prepare('SELECT topic FROM relationship_topics WHERE qq=? AND conv_key=? AND mentions>=2 ORDER BY mentions DESC, last_at DESC LIMIT 8')
      .all(q, conv).map((r) => r.topic)
    : [];
  const row = db.prepare('SELECT * FROM relationships WHERE qq=? AND conv_key=?').get(q, conv);
  if (!row) {
    db.prepare(`INSERT INTO relationships(qq, conv_key, familiarity, shared_topics, interactions, last_interaction, updated_at)
      VALUES(?,?,?,?,?,?,?)`)
      .run(q, conv, 0.15, JSON.stringify(confirmed.slice(-8)), 1, at, Date.now());
    return { ok: true, familiarity: 0.15, sharedTopics: confirmed };
  }
  const topics = new Set(JSON.parse(row.shared_topics || '[]'));
  for (const t of confirmed) topics.add(t);
  // 频繁发消息 ≠ 亲密：同一个自然日里只给一次基础增长，正面信号加成也封顶 ±0.02，
  // 避免一个人刷屏几十条就把 familiarity 刷满（关系应跨天、靠真实互动慢慢长）。
  const lastDay = row.last_interaction ? dayOf(Number(row.last_interaction)) : '';
  const sameDay = lastDay && lastDay === dayOf(at);
  const base = sameDay ? 0 : 0.02;
  const positiveBonus = Math.max(-0.02, Math.min(0.02, Number(positive) * 0.02));
  const next = Math.max(0, Math.min(0.95, Number(row.familiarity) + base + positiveBonus));
  db.prepare('UPDATE relationships SET familiarity=?, shared_topics=?, interactions=interactions+1, last_interaction=?, updated_at=? WHERE qq=? AND conv_key=?')
    .run(next, JSON.stringify([...topics].slice(-8)), at, Date.now(), q, conv);
  return { ok: true, familiarity: next, sharedTopics: [...topics].slice(-8) };
}

/** 短期情绪：写入 + 自然衰减 */
export function setAffect(db, { convKey, label, intensity = 0.5, ttlMs = 40 * 60 * 1000 }) {
  ensureGrowthSchema(db);
  db.prepare(`INSERT INTO affect(conv_key, label, intensity, updated_at, expires_at) VALUES(?,?,?,?,?)
    ON CONFLICT(conv_key) DO UPDATE SET label=excluded.label, intensity=excluded.intensity,
      updated_at=excluded.updated_at, expires_at=excluded.expires_at`)
    .run(String(convKey), String(label).slice(0, 12), Math.max(0, Math.min(1, Number(intensity) || 0.3)), Date.now(), Date.now() + ttlMs);
}

export function getAffect(db, convKey) {
  ensureGrowthSchema(db);
  const row = db.prepare('SELECT * FROM affect WHERE conv_key=?').get(String(convKey));
  if (!row) return null;
  if (Number(row.expires_at) < Date.now()) {
    db.prepare('DELETE FROM affect WHERE conv_key=?').run(String(convKey));
    return null;
  }
  const left = (Number(row.expires_at) - Date.now()) / Math.max(1, Number(row.expires_at) - Number(row.updated_at));
  return { label: row.label, intensity: Number(row.intensity) * Math.max(0, Math.min(1, left)) };
}

/** 成长上下文：给 prompt 的一小段（≤120 tokens） */
export function buildGrowthContext(db, { convKey, speakerQq, maxTraits = 4 } = {}) {
  ensureGrowthSchema(db);
  const parts = [];
  const traits = db.prepare(`SELECT * FROM traits WHERE status='active' AND strength>=0.55
    ORDER BY strength DESC LIMIT ?`).all(maxTraits);
  if (traits.length) {
    parts.push('【慢慢养成的样子】' + traits.map((t) => `${t.name}（${Number(t.strength).toFixed(1)}）`).join('·'));
  }
  // 最近一周真实参与/探索过的话题：给行为一点倾向（她可以更自然地挑这类事做），
  // 但明确写成「不用刻意」，避免每轮都复读成长记录。
  const recent = db.prepare(`SELECT topic, MAX(at) AS last FROM interest_signals
    WHERE kind IN ('participate','explore') AND at > ? GROUP BY topic ORDER BY last DESC LIMIT 2`)
    .all(Date.now() - 7 * DAY);
  if (recent.length) {
    parts.push(`【最近常碰的】${recent.map((r) => r.topic).join('·')}（可以自然带出，不用刻意提）`);
  }
  const mood = getAffect(db, convKey);
  if (mood && mood.intensity > 0.25) parts.push(`【此刻情绪】${mood.label}（强度 ${mood.intensity.toFixed(1)}）`);
  if (speakerQq) {
    const rel = db.prepare('SELECT * FROM relationships WHERE qq=? AND conv_key=?').get(String(speakerQq), String(convKey));
    if (rel) {
      const level = Number(rel.familiarity) > 0.6 ? '熟' : Number(rel.familiarity) > 0.3 ? '认识' : '不熟';
      const topics = JSON.parse(rel.shared_topics || '[]').slice(-2);
      parts.push(`【和 TA 的关系】${level}${topics.length ? '·常聊' + topics.join('/') : ''}`);
    }
  }
  return parts.join('\n');
}

/** 成长日记（只记真实有意义的事） */
export function addJournal(db, { kind, summary, detail, traitKey, before, after, evidenceIds, confidence = 0.6, verified = 0, source = 'system', convKey }) {
  ensureGrowthSchema(db);
  db.prepare(`INSERT INTO growth_journal(at, kind, summary, detail, trait_key, before_state, after_state, evidence_ids, confidence, verified, source, conv_key)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(Date.now(), kind, String(summary).slice(0, 200), detail ? String(detail).slice(0, 500) : null,
      traitKey || null, before || null, after || null, evidenceIds ? JSON.stringify(evidenceIds) : null,
      confidence, verified ? 1 : 0, source, convKey || null);
}

export function growthStatus(db) {
  ensureGrowthSchema(db);
  const traits = db.prepare('SELECT trait_key, name, category, strength, evidence_count, distinct_days, status FROM traits ORDER BY strength DESC').all();
  const pending = db.prepare("SELECT COUNT(*) c FROM growth_candidates WHERE status='pending'").get().c;
  const journal = db.prepare('SELECT COUNT(*) c FROM growth_journal').get().c;
  const experiences = db.prepare('SELECT COUNT(*) c FROM experiences').get().c;
  const versions = db.prepare('SELECT COUNT(*) c FROM trait_versions').get().c;
  return { traits: traits.map((t) => ({ ...t, strength: Number(t.strength) })), pending, journal, experiences, versions };
}
