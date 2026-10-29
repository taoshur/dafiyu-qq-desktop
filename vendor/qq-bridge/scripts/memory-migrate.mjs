/**
 * Memory V3 第一阶段迁移：把 JSON 里的老记忆导入 SQLite（只读 JSON，不删不改）。
 *
 * 导入内容：
 *   persons.json  → persons / aliases / facts(attr=性格, kind=multi)
 *   social-v2.json 的 memberImpressions → facts(attr=印象, kind=multi, scope=该会话)
 *
 * 幂等：每行都有 source_key，重复执行只会跳过，不会翻倍。
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import { openMemoryDb, upsertPerson, addAlias, addFact, stats } from '../src/memory/db.js';

const ROOT = process.env.QQ_BRIDGE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = path.join(ROOT, 'state', 'memory.db');
const PERSONS = path.join(ROOT, 'state', 'persons.json');
const SOCIAL = path.join(ROOT, 'state', 'social-v2.json');

const hash = (...p) => crypto.createHash('sha1').update(p.join('|')).digest('hex').slice(0, 24);

const persons = JSON.parse(fs.readFileSync(PERSONS, 'utf8'));
const social = JSON.parse(fs.readFileSync(SOCIAL, 'utf8'));

const db = openMemoryDb(DB_PATH);
const report = { persons: 0, aliases: 0, traitFacts: 0, impressionFacts: 0, skipped: 0 };

// name(按会话) -> qq 反查表
const nameToQq = new Map();
for (const [qq, p] of Object.entries(persons)) {
  const names = p.names && typeof p.names === 'object' ? p.names : {};
  for (const [conv, name] of Object.entries(names)) {
    if (name) nameToQq.set(`${conv}|${name}`, qq);
  }
}

for (const [qq, p] of Object.entries(persons)) {
  const names = p.names && typeof p.names === 'object' ? p.names : {};
  const nameList = Object.values(names).filter((n) => n && n !== '私聊');
  const nickname = nameList[0] || p.nickname || qq;
  upsertPerson(db, { qq, nickname, at: p.lastSeenAt || Date.now() });
  db.prepare(`UPDATE persons SET msg_count=?, note_count=?, first_seen_at=COALESCE(first_seen_at, ?), last_seen_at=? WHERE qq=?`)
    .run(Number(p.msgCount) || 0, Number(p.noteCount) || 0, Number(p.firstSeenAt) || Date.now(), Number(p.lastSeenAt) || Date.now(), String(qq));
  report.persons += 1;

  for (const [conv, name] of Object.entries(names)) {
    if (!name) continue;
    addAlias(db, { qq, name, convKey: conv });
    report.aliases += 1;
  }

  for (const trait of Array.isArray(p.traits) ? p.traits : []) {
    const r = addFact(db, {
      subjectQq: qq,
      subjectName: nickname,
      attr: '性格',
      value: trait,
      kind: 'multi',
      scope: 'global',
      visibility: 'global',
      confidence: 0.5,
      sourceType: 'legacy:persons',
      sourceKey: hash('legacy:persons', qq, trait)
    });
    if (r.skipped) report.skipped += 1; else report.traitFacts += 1;
  }
}

for (const [convKey, st] of Object.entries(social.conversations || {})) {
  const mi = st.memberImpressions && typeof st.memberImpressions === 'object' ? st.memberImpressions : {};
  const visibility = convKey.startsWith('private:') ? 'private' : 'group';
  for (const [name, entry] of Object.entries(mi)) {
    if (!name || name === '我' || name === '自己') continue;
    const qq = nameToQq.get(`${convKey}|${name}`) || (/^\d{5,12}$/.test(name) ? name : null);
    for (const trait of Array.isArray(entry?.traits) ? entry.traits : []) {
      const r = addFact(db, {
        subjectQq: qq,
        subjectName: name,
        attr: '印象',
        value: trait,
        kind: 'multi',
        scope: convKey,
        visibility,
        confidence: 0.45,
        sourceType: 'legacy:impressions',
        sourceKey: hash('legacy:impressions', convKey, name, trait)
      });
      if (r.skipped) report.skipped += 1; else report.impressionFacts += 1;
    }
    if (qq) addAlias(db, { qq, name, convKey });
  }
}

const s = stats(db);
console.log('迁移完成：', JSON.stringify(report));
console.log('库内统计：', JSON.stringify(s));
console.log('DB:', DB_PATH, (fs.statSync(DB_PATH).size / 1024).toFixed(1) + 'KB');
db.close();
