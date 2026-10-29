/** 验证桥接挂钩在真实 DB 上可用（写入后立即删除，不留测试数据） */
import fs from 'node:fs';
import { initMemoryHook, noteMessageForMemory, memoryRuntimeStats } from '../src/memory/hook.js';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = process.env.QQ_BRIDGE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
initMemoryHook({ config: cfg.socialV2.memory, log: (m) => console.log('[hook]', m) });

noteMessageForMemory({
  convKey: 'group:hooktest',
  messageId: 'hook-selftest-1',
  senderQq: '999999',
  senderName: '自检',
  text: '这是一条挂钩自检消息',
  mediaNote: null,
  sentAt: Date.now(),
  isSelf: false
});

const db = new DatabaseSync(path.join(ROOT, 'state', 'memory.db'));
const row = db.prepare("SELECT * FROM messages WHERE conv_key='group:hooktest'").get();
console.log('写入结果:', row ? 'OK' : 'FAIL', row ? row.text : '');
console.log('运行时:', JSON.stringify(memoryRuntimeStats()));

db.prepare("DELETE FROM messages WHERE conv_key='group:hooktest'").run();
db.prepare("DELETE FROM extract_cursors WHERE conv_key='group:hooktest'").run();
console.log('已清理自检数据');
db.close();
