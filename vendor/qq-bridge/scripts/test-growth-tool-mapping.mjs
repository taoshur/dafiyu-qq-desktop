// 回归：真实参与（bili_reply）进入成长证据链；只读仍为 explore；失败/重试不重复计数。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { openMemoryDb } from '../src/memory/db.js';

let pass = 0;
let fail = 0;
async function ok(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); pass += 1; } catch (error) {
    console.error(`  ✗ ${name}: ${error?.message ?? error}`); fail += 1;
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-map-'));
const dbPath = path.join(dir, 'm.db');
const hook = await import(`../src/memory/growth-hook.js?map=${Date.now()}`);
hook.initGrowthHook({ config: { dbPath }, log: () => {} });

const rows = (conv) => {
  const d = openMemoryDb(dbPath);
  try {
    return {
      signals: d.prepare('SELECT kind, source, note, conv_key FROM interest_signals WHERE conv_key=? ORDER BY id').all(conv),
      exp: d.prepare('SELECT kind, detail FROM experiences WHERE conv_key=? ORDER BY id').all(conv),
      evidence: d.prepare("SELECT kind, source, note FROM trait_evidence WHERE conv_key=? ORDER BY id").all(conv)
    };
  } finally { d.close(); }
};

console.log('[真实参与]');
await ok('bili_reply 成功 → participate 信号 + 评论经历 + curious 证据', () => {
  hook.noteGrowthTool({ convKey: 'private:9001', tool: 'mcp__bilibili__bili_reply', args: '{"bvid":"BV1xx","text":"好看"}', ok: true });
  const r = rows('private:9001');
  assert.equal(r.signals.length, 1);
  assert.equal(r.signals[0].kind, 'participate');
  assert.equal(r.signals[0].source, 'tool');
  assert.equal(r.signals[0].note, 'bilibili__bili_reply');
  assert.equal(r.exp.length, 1);
  assert.equal(r.exp[0].kind, 'comment');
  assert.ok(r.evidence.some((e) => e.kind === 'behavior'), '应有 behavior 证据');
});
await ok('bili_reply 失败（ok=false）不记账', () => {
  hook.noteGrowthTool({ convKey: 'private:9002', tool: 'mcp__bilibili__bili_reply', args: '{}', ok: false });
  const r = rows('private:9002');
  assert.equal(r.signals.length, 0);
  assert.equal(r.exp.length, 0);
});
await ok('同一天重复调用（重试）只计一次', () => {
  for (let i = 0; i < 3; i += 1) {
    hook.noteGrowthTool({ convKey: 'private:9003', tool: 'mcp__bilibili__bili_reply', args: '{}', ok: true });
  }
  const r = rows('private:9003');
  assert.equal(r.signals.length, 1, `应只有 1 条信号，实际 ${r.signals.length}`);
  assert.equal(r.exp.length, 1);
});
await ok('只读工具仍只记 explore（不冒充参与）', () => {
  hook.noteGrowthTool({ convKey: 'private:9004', tool: 'mcp__bilibili__bili_hot_videos', args: '{}', ok: true });
  const r = rows('private:9004');
  assert.equal(r.signals[0].kind, 'explore');
  assert.equal(r.signals[0].source, 'tool-read');
});
await ok('被明确指令后 10 分钟内的 bili_reply 只记 instruction（不算自主参与）', () => {
  hook.noteGrowthMessage({ convKey: 'private:9005', senderQq: '123', senderName: 'x', text: '你去试试B站发条评论', isSelf: false });
  hook.noteGrowthTool({ convKey: 'private:9005', tool: 'mcp__bilibili__bili_reply', args: '{}', ok: true });
  const r = rows('private:9005');
  const kinds = r.signals.map((s) => s.kind);
  assert.ok(kinds.includes('instruction'), `应有 instruction 信号，实际 ${kinds}`);
  assert.ok(!kinds.includes('participate'), `不应出现 participate，实际 ${kinds}`);
});

console.log(`\n${fail ? '❌' : '✅'} test-growth-tool-mapping：${pass} 项通过，${fail} 项失败`);
if (fail) process.exitCode = 1;
