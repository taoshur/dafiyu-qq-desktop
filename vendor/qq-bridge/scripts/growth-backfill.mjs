// 补记：给已经形成的 2 个兴趣补 trait_versions，并尽可能补回证据的 conv_key / note 主题前缀。
// 只改元数据（版本、归属、备注），**不动任何证据条数、强度、阈值**。
// 用法：node scripts/growth-backfill.mjs [--apply]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(ROOT, 'state', 'memory.db');
const APPLY = process.argv.includes('--apply');

const db = new DatabaseSync(DB);
const traits = db.prepare("SELECT * FROM traits WHERE category='interest'").all();

let versionsAdded = 0;
let convFilled = 0;
let convAmbiguous = 0;
let notesFixed = 0;

db.exec('BEGIN IMMEDIATE');
try {
  for (const t of traits) {
    const topic = String(t.trait_key).replace(/^interest:/, '');
    const evidence = db.prepare('SELECT * FROM trait_evidence WHERE trait_key=? ORDER BY id').all(t.trait_key);
    const journal = db.prepare("SELECT * FROM growth_journal WHERE trait_key=? AND kind='interest_formed' ORDER BY id LIMIT 1").get(t.trait_key);

    // 1) 版本补记（只在完全没有版本时）
    const hasVersion = db.prepare('SELECT 1 FROM trait_versions WHERE trait_key=? LIMIT 1').get(t.trait_key);
    if (!hasVersion) {
      const ids = evidence.map((e) => e.id);
      db.prepare(`INSERT INTO trait_versions(trait_key, before_strength, after_strength, reason, evidence_ids, source, at)
        VALUES(?,?,?,?,?,?,?)`).run(t.trait_key, 0, Number(t.initial_strength),
        `补记：兴趣形成（实际证据 ${evidence.length} 条，审计回填）`, JSON.stringify(ids), 'system',
        Number(journal?.at) || Number(t.created_at) || Date.now());
      versionsAdded += 1;
      // 日记里的 before_state / evidence_ids 也补上（原来 before 是 null）
      if (journal && (journal.before_state === null || journal.evidence_ids === null)) {
        db.prepare('UPDATE growth_journal SET before_state=?, evidence_ids=? WHERE id=?')
          .run(journal.before_state ?? '0.00', journal.evidence_ids ?? JSON.stringify(ids), journal.id);
      }
    }

    // 2) 证据 conv_key 补回（只在能唯一确定会话时）
    for (const e of evidence) {
      if (e.conv_key) continue;
      const day = e.day;
      const oldNote = String(e.note || '');
      const matches = db.prepare(
        `SELECT DISTINCT conv_key FROM interest_signals
         WHERE topic=? AND note=? AND date(at/1000,'unixepoch')=? AND conv_key IS NOT NULL`
      ).all(topic, oldNote, day);
      if (matches.length === 1) {
        db.prepare('UPDATE trait_evidence SET conv_key=? WHERE id=?').run(matches[0].conv_key, e.id);
        convFilled += 1;
      } else if (matches.length > 1) {
        convAmbiguous += 1;
      }
    }

    // 3) 备注补主题前缀（invalidateEvidenceForTopic 按 LIKE %topic% 匹配 note）
    for (const e of evidence) {
      const note = String(e.note || '');
      if (note.startsWith(topic)) continue;
      db.prepare('UPDATE trait_evidence SET note=? WHERE id=?').run(`${topic} ${note}`.slice(0, 60), e.id);
      notesFixed += 1;
    }
  }
  console.log(`模式=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`兴趣数=${traits.length} 补版本=${versionsAdded} 补conv(唯一)=${convFilled} conv多义(未动)=${convAmbiguous} 备注补前缀=${notesFixed}`);
  if (APPLY) db.exec('COMMIT'); else db.exec('ROLLBACK');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
} finally {
  db.close();
}
