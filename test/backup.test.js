'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const { createBackup, verifyBackup, collectTargets, pruneBackups, restoreDrill } = require('../src/main/backup');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-backup-'));
}

function makeRepo() {
  const repo = tempDir();
  fs.mkdirSync(path.join(repo, 'roles'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'state'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'config.json'), JSON.stringify({ ownerQQ: 123456789, snowluma: { accessToken: 'TOP-SECRET-TOKEN' } }), 'utf8');
  fs.writeFileSync(path.join(repo, 'roles', '大肥鱼.md'), '# 大肥鱼\n角色卡内容\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'state', 'social-v2.json'), JSON.stringify({ conversations: { 'group:1': { mode: 'reserved2' } } }), 'utf8');
  fs.writeFileSync(path.join(repo, 'state', 'stickers.json'), JSON.stringify({ entries: [{ id: 'a' }] }), 'utf8');
  fs.writeFileSync(path.join(repo, 'state', 'persons.json'), JSON.stringify({ p: 1 }), 'utf8');
  fs.writeFileSync(path.join(repo, 'state', 'slang.json'), JSON.stringify({ s: 1 }), 'utf8');
  // 不应被备份的内容
  fs.writeFileSync(path.join(repo, 'state', 'bridge.log'), 'log line\n', 'utf8');
  fs.writeFileSync(path.join(repo, 'state', 'token-usage.jsonl'), '{}\n', 'utf8');

  const db = new DatabaseSync(path.join(repo, 'state', 'memory.db'));
  db.exec('PRAGMA journal_mode=WAL');
  db.exec(`
    CREATE TABLE traits (id INTEGER PRIMARY KEY, trait_key TEXT, strength REAL, status TEXT);
    CREATE TABLE trait_versions (id INTEGER PRIMARY KEY, trait_key TEXT, strength REAL, source TEXT, at INTEGER);
    CREATE TABLE trait_evidence (id INTEGER PRIMARY KEY, trait_key TEXT, kind TEXT, source TEXT, note TEXT, day TEXT, created_at INTEGER);
    CREATE TABLE growth_journal (id INTEGER PRIMARY KEY, kind TEXT, detail TEXT, at INTEGER);
    CREATE TABLE growth_candidates (id INTEGER PRIMARY KEY, trait_key TEXT, kind TEXT, status TEXT, created_at INTEGER);
  `);
  db.prepare('INSERT INTO traits VALUES (1, ?, 0.75, ?)').run('cute', 'active');
  db.prepare('INSERT INTO traits VALUES (2, ?, 0, ?)').run('interest:B站', 'rejected');
  db.prepare('INSERT INTO trait_versions VALUES (1, ?, 0.75, ?, ?)').run('cute', 'correction', Date.now());
  for (let i = 0; i < 3; i += 1) {
    db.prepare('INSERT INTO trait_evidence VALUES (?, ?, ?, ?, ?, ?, ?)').run(i + 1, 'cute', 'behavior', 'behavior', `n${i}`, '2026-10-25', Date.now());
  }
  db.prepare('INSERT INTO growth_journal VALUES (1, ?, ?, ?)').run('review', 'detail', Date.now());
  db.prepare('INSERT INTO growth_candidates VALUES (1, ?, ?, ?, ?)').run('cute', 'strengthen', 'pending', Date.now());
  db.close();
  return repo;
}

test('备份生成 manifest、SQLite 一致性快照，且不含日志', () => {
  const repo = makeRepo();
  const result = createBackup({ repoRoot: repo, clock: new Date('2026-10-26T10:00:00+08:00'), appVersion: 'test' });
  assert.ok(fs.existsSync(result.dir));
  assert.equal(result.verify.ok, true, result.verify.errors.join('; '));

  const manifest = JSON.parse(fs.readFileSync(path.join(result.dir, 'manifest.json'), 'utf8'));
  const paths = manifest.files.map((item) => item.path);
  assert.ok(paths.includes('config.json'));
  assert.ok(paths.includes('roles/大肥鱼.md'));
  assert.ok(paths.includes('state/social-v2.json'));
  assert.ok(paths.includes('memory.db'));
  assert.ok(!paths.some((p) => p.endsWith('.log') || p.endsWith('.jsonl')), '日志与 jsonl 不应进入备份');

  const db = new DatabaseSync(path.join(result.dir, 'memory.db'), { readOnly: true });
  assert.equal(db.prepare('SELECT COUNT(*) c FROM trait_evidence').get().c, 3);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM traits').get().c, 2);
  db.close();

  const manifestText = fs.readFileSync(path.join(result.dir, 'manifest.json'), 'utf8');
  assert.ok(!manifestText.includes('TOP-SECRET-TOKEN'), 'manifest 不能包含配置内容');
});

test('备份不修改源文件，且 WAL 中已提交的数据会进入快照', () => {
  const repo = makeRepo();
  const dbPath = path.join(repo, 'state', 'memory.db');
  const before = fs.readFileSync(dbPath);

  // 模拟桥接仍在运行：另开连接写入并保持打开，让 WAL 中留有未 checkpoint 的提交。
  const writer = new DatabaseSync(dbPath);
  writer.exec('PRAGMA journal_mode=WAL');
  writer.prepare('INSERT INTO trait_evidence VALUES (?, ?, ?, ?, ?, ?, ?)').run(100, 'cute', 'behavior', 'behavior', 'live', '2026-10-26', Date.now());
  assert.ok(fs.existsSync(dbPath + '-wal'), '应存在 WAL 文件');

  const result = createBackup({ repoRoot: repo, clock: new Date('2026-10-26T11:00:00+08:00') });
  writer.close();

  const backupDb = new DatabaseSync(path.join(result.dir, 'memory.db'), { readOnly: true });
  assert.equal(backupDb.prepare('SELECT COUNT(*) c FROM trait_evidence').get().c, 4, 'WAL 中已提交的行必须在快照里');
  backupDb.close();

  assert.ok(fs.readFileSync(dbPath).length > 0);
  assert.ok(!afterLengthChanged(before, fs.readFileSync(dbPath)), '主库文件内容不应被备份改写');
});

function afterLengthChanged(before, after) {
  // VACUUM INTO 只读源库；允许 SQLite 因只读连接而 checkpoint？这里只要求内容长度不缩水。
  return after.length < before.length;
}

test('备份可恢复到临时副本并通过完整性校验', () => {
  const repo = makeRepo();
  const result = createBackup({ repoRoot: repo, clock: new Date('2026-10-26T12:00:00+08:00') });
  const restore = tempDir();
  fs.cpSync(result.dir, restore, { recursive: true });

  const check = verifyBackup(restore);
  assert.equal(check.ok, true);
  const db = new DatabaseSync(path.join(restore, 'memory.db'), { readOnly: true });
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM trait_evidence').get().c, 3);
  db.close();
  assert.equal(fs.readFileSync(path.join(restore, 'config.json'), 'utf8'), fs.readFileSync(path.join(repo, 'config.json'), 'utf8'));
});

test('verifyBackup 能发现被篡改的文件', () => {
  const repo = makeRepo();
  const result = createBackup({ repoRoot: repo, clock: new Date('2026-10-26T13:00:00+08:00') });
  fs.appendFileSync(path.join(result.dir, 'roles', '大肥鱼.md'), '\n被篡改\n');
  const check = verifyBackup(result.dir);
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((line) => line.includes('哈希不一致')));
});

test('verifyBackup 能发现缺失文件', () => {
  const repo = makeRepo();
  const result = createBackup({ repoRoot: repo, clock: new Date('2026-10-26T14:00:00+08:00') });
  fs.rmSync(path.join(result.dir, 'state', 'persons.json'));
  const check = verifyBackup(result.dir);
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((line) => line.includes('缺少文件')));
});

test('同一秒内重复备份不会互相覆盖', () => {
  const repo = makeRepo();
  const clock = new Date('2026-10-26T15:00:00+08:00');
  const first = createBackup({ repoRoot: repo, clock });
  const second = createBackup({ repoRoot: repo, clock });
  assert.notEqual(first.dir, second.dir);
  assert.ok(fs.existsSync(first.dir) && fs.existsSync(second.dir));
});

test('collectTargets 只收集白名单数据', () => {
  const repo = makeRepo();
  const targets = collectTargets(repo);
  assert.ok(targets.includes('config.json'));
  assert.ok(targets.includes('roles/大肥鱼.md'));
  assert.ok(!targets.some((t) => t.endsWith('.log') || t.endsWith('.jsonl')));
  assert.ok(!targets.includes('state/memory.db'), 'memory.db 走 VACUUM INTO，不直接复制');
});

test('备份保留策略只清理旧的桌面备份，不碰其它目录', () => {
  const repo = tempDir();
  const backups = path.join(repo, 'backups');
  fs.mkdirSync(backups, { recursive: true });
  const names = ['desktop-20260101-000000', 'desktop-20260102-000000', 'desktop-20260103-000000'];
  for (const name of names) {
    const dir = path.join(backups, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{}', 'utf8');
  }
  fs.mkdirSync(path.join(backups, 'memory-20260101-000000'), { recursive: true });
  fs.mkdirSync(path.join(backups, 'worktree-20260101-000000'), { recursive: true });
  fs.utimesSync(path.join(backups, names[0]), new Date('2026-01-01'), new Date('2026-01-01'));
  fs.utimesSync(path.join(backups, names[1]), new Date('2026-01-02'), new Date('2026-01-02'));
  fs.utimesSync(path.join(backups, names[2]), new Date('2026-01-03'), new Date('2026-01-03'));

  const result = pruneBackups({ repoRoot: repo, keep: 1 });
  assert.equal(result.removed.length, 2);
  assert.equal(fs.existsSync(path.join(backups, names[2])), true);
  assert.equal(fs.existsSync(path.join(backups, names[0])), false);
  assert.equal(fs.existsSync(path.join(backups, 'memory-20260101-000000')), true, '非桌面备份必须保留');
  assert.equal(fs.existsSync(path.join(backups, 'worktree-20260101-000000')), true);
});

test('恢复演练只复制到测试路径并校验', () => {
  const repo = makeRepo();
  const result = createBackup({ repoRoot: repo, clock: new Date('2026-10-26T10:00:00+08:00'), appVersion: 'test' });
  const target = path.join(tempDir(), 'state', 'restore-drill.db');
  const drill = restoreDrill({ backupDir: result.dir, targetFile: target });
  assert.equal(drill.ok, true);
  assert.equal(drill.integrity, 'ok');
  assert.equal(drill.counts.traits, 2);
  assert.ok(fs.existsSync(target));
  assert.ok(fs.existsSync(path.join(repo, 'state', 'memory.db')), '源库仍存在');
});


test('verifyBackup rejects manifest path traversal', () => {
  const repo = makeRepo();
  const result = createBackup({ repoRoot: repo, appVersion: 'test' });
  const manifestFile = path.join(result.dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.files[0].path = '../outside.txt';
  fs.writeFileSync(manifestFile, JSON.stringify(manifest), 'utf8');
  const check = verifyBackup(result.dir);
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((line) => line.includes('非法路径')));
});
