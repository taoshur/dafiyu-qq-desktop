/** 成长挂钩自检：真实 DB 写入后清理 */
import fs from 'node:fs';
import { initGrowthHook, noteGrowthMessage, noteGrowthTool, growthRuntimeStats } from '../src/memory/growth-hook.js';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = process.env.QQ_BRIDGE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
initGrowthHook({ config: cfg.socialV2.growth, log: (m) => console.log('[hook]', m) });

noteGrowthMessage({ convKey: 'group:selftest', senderQq: '111111', senderName: '自检', text: '今天又在玩消消乐，卡在18关了', isSelf: false });
noteGrowthTool({ convKey: 'group:selftest', tool: 'mcp__android__android_batch', args: '{}', ok: true });

const db = new DatabaseSync(path.join(ROOT, 'state', 'memory.db'));
const exp = db.prepare("SELECT COUNT(*) c FROM experiences WHERE conv_key='group:selftest'").get().c;
const ev = db.prepare("SELECT COUNT(*) c FROM trait_evidence WHERE conv_key='group:selftest'").get().c;
const rel = db.prepare("SELECT familiarity FROM relationships WHERE conv_key='group:selftest'").get();
console.log('经历:', exp, '| 证据:', ev, '| 关系:', rel ? Number(rel.familiarity).toFixed(2) : 'none');
console.log('运行时:', JSON.stringify(growthRuntimeStats()));

db.prepare("DELETE FROM experiences WHERE conv_key='group:selftest'").run();
db.prepare("DELETE FROM trait_evidence WHERE conv_key='group:selftest'").run();
db.prepare("DELETE FROM relationships WHERE conv_key='group:selftest'").run();
db.prepare("DELETE FROM affect WHERE conv_key='group:selftest'").run();
console.log('已清理自检数据');
db.close();
