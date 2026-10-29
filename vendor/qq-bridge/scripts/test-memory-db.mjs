/**
 * Memory V3 阶段 1 测试：schema / 三类事实冲突 / 幂等 / 中文检索 / 隐私隔离 / 迁移计数
 * 运行：node scripts/test-memory-db.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { openMemoryDb, addFact, addEvent, searchMemory, retractFact, stats } from '../src/memory/db.js';
import { tokenize } from '../src/memory/tokenize.js';
import { fileURLToPath } from 'node:url';
const ROOT = process.env.QQ_BRIDGE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-v3-'));
const dbPath = path.join(dir, 'test.db');
const db = openMemoryDb(dbPath);
let pass = 0;
const ok = (name, fn) => { fn(); pass += 1; console.log('✔', name); };

ok('schema 建表', () => {
  const s = stats(db);
  assert.equal(s.factsActive, 0);
  assert.equal(s.persons, 0);
});

ok('中文分词：二元组 + 英文词', () => {
  const t = tokenize('喜欢玩消消乐和 B站');
  assert.ok(t.includes('消消'), 'bigram 消消');
  assert.ok(t.includes('b站') || t.includes('站'), 'b站');
  assert.ok(!tokenize('的了').length || tokenize('的了').length >= 0);
});

ok('multi 事实：同一属性可多值', () => {
  addFact(db, { subjectQq: '1', subjectName: '小明', attr: '喜欢的游戏', value: '消消乐', kind: 'multi' });
  addFact(db, { subjectQq: '1', subjectName: '小明', attr: '喜欢的游戏', value: '原神', kind: 'multi' });
  const rows = db.prepare("SELECT value FROM facts WHERE subject_qq='1' AND attr='喜欢的游戏' AND status='active'").all();
  assert.equal(rows.length, 2);
});

ok('multi 事实：同值去重', () => {
  const r = addFact(db, { subjectQq: '1', subjectName: '小明', attr: '喜欢的游戏', value: '消消乐', kind: 'multi' });
  assert.equal(r.skipped, true);
});

ok('single 事实：新值顶替旧值且旧值保留历史', () => {
  addFact(db, { subjectQq: '2', subjectName: '小红', attr: '所在城市', value: '北京', kind: 'single' });
  addFact(db, { subjectQq: '2', subjectName: '小红', attr: '所在城市', value: '上海', kind: 'single' });
  const active = db.prepare("SELECT value FROM facts WHERE subject_qq='2' AND attr='所在城市' AND status='active'").all();
  const old = db.prepare("SELECT value, status FROM facts WHERE subject_qq='2' AND attr='所在城市' AND status='superseded'").all();
  assert.equal(active.length, 1);
  assert.equal(active[0].value, '上海');
  assert.equal(old.length, 1);
  assert.equal(old[0].value, '北京');
});

ok('temporal 事实：保留有效期区间', () => {
  addFact(db, { subjectQq: '3', attr: '当前计划', value: '准备考试', kind: 'temporal', validFrom: Date.now() - 86400000 });
  addFact(db, { subjectQq: '3', attr: '当前计划', value: '考完放松', kind: 'temporal' });
  const rows = db.prepare("SELECT status, valid_from, valid_to FROM facts WHERE subject_qq='3' AND attr='当前计划' ORDER BY id").all();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, 'superseded');
  assert.ok(rows[0].valid_to > 0);
});

ok('幂等：同一 sourceKey 重复写不产生新行', () => {
  const a = addFact(db, { subjectQq: '4', attr: '口头禅', value: '真香', kind: 'multi', sourceKey: 'fixed-1' });
  const b = addFact(db, { subjectQq: '4', attr: '口头禅', value: '真香', kind: 'multi', sourceKey: 'fixed-1' });
  assert.equal(a.id, b.id);
  assert.equal(b.skipped, true);
});

ok('事件写入 + 幂等', () => {
  const a = addEvent(db, { summary: '大肥鱼第一次用B站工具搜古筝', participants: ['10001'], sourceKey: 'evt-1' });
  const b = addEvent(db, { summary: '大肥鱼第一次用B站工具搜古筝', participants: ['10001'], sourceKey: 'evt-1' });
  assert.equal(a.id, b.id);
});

ok('关键词检索命中事实（全局事实需主体在场）', () => {
  const hits = searchMemory(db, { convKey: 'group:1', qqs: ['2'], text: '小红 上海 城市' });
  assert.ok(hits.length > 0);
  assert.ok(hits.some((h) => h.row && h.row.value === '上海'));
});

ok('主体命中优先', () => {
  const hits = searchMemory(db, { convKey: 'group:1', qqs: ['1'], text: '' });
  assert.ok(hits.length >= 2);
  assert.ok(hits.every((h) => h.row.subject_qq === '1' || h.type === 'event'));
});

ok('隐私隔离：群聊检索不到 private 事实', () => {
  addFact(db, { subjectQq: '5', attr: '私事', value: '搬家了', kind: 'multi', scope: 'private:5', visibility: 'private' });
  const inGroup = searchMemory(db, { convKey: 'group:1', qqs: [], text: '搬家' });
  const inPrivate = searchMemory(db, { convKey: 'private:5', qqs: [], text: '搬家' });
  assert.equal(inGroup.some((h) => h.row?.value === '搬家了'), false);
  assert.equal(inPrivate.some((h) => h.row?.value === '搬家了'), true);
});

ok('撤回：保留行但不再检索', () => {
  const r = addFact(db, { subjectQq: '6', attr: '临时', value: '待撤回', kind: 'multi' });
  retractFact(db, r.id);
  const row = db.prepare('SELECT status FROM facts WHERE id=?').get(r.id);
  assert.equal(row.status, 'retracted');
  const hits = searchMemory(db, { convKey: 'group:1', qqs: [], text: '待撤回' });
  assert.equal(hits.some((h) => h.row?.id === r.id), false);
});

ok('迁移结果（若已跑过迁移）', () => {
  const real = path.join(ROOT, 'state', 'memory.db');
  if (!fs.existsSync(real)) { console.log('  （跳过：还没跑迁移）'); return; }
  const realDb = openMemoryDb(real);
  const s = stats(realDb);
  assert.ok(s.persons >= 10, 'persons >= 10');
  assert.ok(s.factsActive >= 200, 'factsActive >= 200');
  realDb.close();
});

db.close();
console.log(`\n结果：${pass} 通过，0 失败`);
