/**
 * Memory V4 lifecycle: separate truth (confidence) from importance and activation.
 * No physical deletion: archived records stay in SQLite and remain available to deep recall.
 */
const DAY = 24 * 60 * 60 * 1000;

export const DEFAULT_LIFECYCLE = Object.freeze({
  enabled: true,
  tauDays: 30,
  dormantThreshold: 0.35,
  archiveThreshold: 0.15,
  recallBoost: 0.08,
  protectImportance: 0.8,
  sweepHours: 6
});

export function lifecycleConfig(config = {}) {
  return {
    ...DEFAULT_LIFECYCLE,
    ...(config.lifecycle || {}),
    enabled: config.lifecycleEnabled !== false,
    tauDays: Number(config.decayTauDays) || Number(config.lifecycle?.tauDays) || DEFAULT_LIFECYCLE.tauDays,
    dormantThreshold: Number(config.dormantThreshold) || DEFAULT_LIFECYCLE.dormantThreshold,
    archiveThreshold: Number(config.archiveThreshold) || DEFAULT_LIFECYCLE.archiveThreshold,
    recallBoost: Number(config.recallBoost) || DEFAULT_LIFECYCLE.recallBoost,
    protectImportance: Number(config.protectImportance) || DEFAULT_LIFECYCLE.protectImportance,
    sweepHours: Number(config.sweepHours) || DEFAULT_LIFECYCLE.sweepHours
  };
}

export function ensureLifecycleSchema(db) {
  const factCols = db.prepare('PRAGMA table_info(facts)').all().map((c) => c.name);
  for (const [name, type] of [
    ['importance', 'REAL NOT NULL DEFAULT 0.5'],
    ['activation', 'REAL NOT NULL DEFAULT 1'],
    ['last_recalled_at', 'INTEGER'],
    ['reinforcement_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['lifecycle_state', "TEXT NOT NULL DEFAULT 'active'"]
  ]) {
    if (!factCols.includes(name)) db.exec(`ALTER TABLE facts ADD COLUMN ${name} ${type}`);
  }
  const eventCols = db.prepare('PRAGMA table_info(events)').all().map((c) => c.name);
  for (const [name, type] of [
    ['importance', 'REAL NOT NULL DEFAULT 0.5'],
    ['activation', 'REAL NOT NULL DEFAULT 1'],
    ['last_recalled_at', 'INTEGER'],
    ['reinforcement_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['lifecycle_state', "TEXT NOT NULL DEFAULT 'active'"]
  ]) {
    if (!eventCols.includes(name)) db.exec(`ALTER TABLE events ADD COLUMN ${name} ${type}`);
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_facts_lifecycle ON facts(status, lifecycle_state, activation)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_lifecycle ON events(lifecycle_state, activation)');
  db.exec('CREATE TABLE IF NOT EXISTS memory_lifecycle_sweeps (id INTEGER PRIMARY KEY CHECK(id=1), last_at INTEGER)');
}

export function importanceFor(category, confidence = 0.6) {
  const base = {
    trait: 0.9, habit: 0.75, profile: 0.75, relationship: 0.8,
    plan: 0.6, preference: 0.55, social: 0.5, tech: 0.2
  }[String(category || '').toLowerCase()] || 0.5;
  return Math.max(0.05, Math.min(1, base * (0.7 + 0.3 * Math.max(0, Math.min(1, Number(confidence) || 0)))));
}

function tauDaysFor(row, cfg) {
  const category = String(row.category || '').toLowerCase();
  const base = ['trait', 'habit', 'profile', 'relationship'].includes(category) ? cfg.tauDays * 2
    : category === 'plan' ? cfg.tauDays * 0.5
      : category === 'tech' ? cfg.tauDays * 0.25
        : cfg.tauDays;
  return Math.max(1, base);
}

export function activationAt(row, now = Date.now(), config = {}) {
  const cfg = lifecycleConfig(config);
  const base = Number(row.activation) || 1;
  const last = Number(row.last_recalled_at) || Number(row.updated_at) || Number(row.happened_at) || Number(row.created_at) || now;
  const days = Math.max(0, (Number(now) - last) / DAY);
  const decayed = base * Math.exp(-days / tauDaysFor(row, cfg));
  const importance = Number(row.importance) || 0;
  // High-importance memories cool down, but never disappear from ranking entirely.
  return Math.max(decayed, Math.min(0.3, importance * 0.3));
}

export function stateAt(row, now = Date.now(), config = {}) {
  const cfg = lifecycleConfig(config);
  if (!cfg.enabled) return 'active';
  const importance = Number(row.importance) || 0;
  const activation = activationAt(row, now, cfg);
  if (importance >= cfg.protectImportance || activation >= cfg.dormantThreshold) return 'active';
  if (activation >= cfg.archiveThreshold) return 'dormant';
  return 'archived';
}

export function lifecyclePenalty(row, now = Date.now(), config = {}) {
  const state = stateAt(row, now, config);
  return state === 'archived' ? 0.25 : state === 'dormant' ? 0.1 : 0;
}

export function touchRecalled(db, items, { now = Date.now(), config = {} } = {}) {
  const cfg = lifecycleConfig(config);
  if (!cfg.enabled) return;
  const updateFact = db.prepare(`UPDATE facts SET activation=?, last_recalled_at=?, lifecycle_state=?, updated_at=updated_at WHERE id=?`);
  const updateEvent = db.prepare(`UPDATE events SET activation=?, last_recalled_at=?, lifecycle_state=? WHERE id=?`);
  db.exec('BEGIN');
  try {
    for (const item of items) {
      const row = item.row || item;
      const type = item.type || (row.summary ? 'event' : 'fact');
      const activation = Math.min(1, Math.max(0, activationAt(row, now, cfg) + cfg.recallBoost));
      const next = { ...row, activation, last_recalled_at: now };
      const state = stateAt(next, now, cfg);
      if (type === 'event') updateEvent.run(activation, now, state, row.id);
      else updateFact.run(activation, now, state, row.id);
    }
    db.exec('COMMIT');
  } catch {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
  }
}

export function sweepLifecycle(db, { now = Date.now(), config = {}, force = false } = {}) {
  const cfg = lifecycleConfig(config);
  if (!cfg.enabled) return { skipped: true };
  ensureLifecycleSchema(db);
  const last = Number(db.prepare('SELECT last_at FROM memory_lifecycle_sweeps WHERE id=1').get()?.last_at) || 0;
  if (!force && now - last < cfg.sweepHours * 3600 * 1000) return { skipped: true };
  const facts = db.prepare("SELECT * FROM facts WHERE status='active'").all();
  const events = db.prepare('SELECT * FROM events').all();
  const updateFact = db.prepare('UPDATE facts SET activation=?, lifecycle_state=? WHERE id=?');
  const updateEvent = db.prepare('UPDATE events SET activation=?, lifecycle_state=? WHERE id=?');
  db.exec('BEGIN');
  try {
    for (const row of facts) updateFact.run(activationAt(row, now, cfg), stateAt(row, now, cfg), row.id);
    for (const row of events) updateEvent.run(activationAt(row, now, cfg), stateAt(row, now, cfg), row.id);
    db.prepare('INSERT INTO memory_lifecycle_sweeps(id, last_at) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET last_at=excluded.last_at').run(now);
    db.exec('COMMIT');
  } catch {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    return { error: true };
  }
  return { facts: facts.length, events: events.length };
}
