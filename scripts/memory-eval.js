'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openMemoryDb, addFact, addEvent } = require('../vendor/qq-bridge/src/memory/db.js');
const { ensureExtractSchema } = require('../vendor/qq-bridge/src/memory/extractor.js');
const { retrieveMemoryForPrompt } = require('../vendor/qq-bridge/src/memory/retrieve.js');

const CASES = [
  {
    id: 'exact-preference', category: '准确召回', convKey: 'group:1', speakerQqs: ['123456'], query: '我喜欢什么游戏',
    seeds: [{ type: 'fact', subjectQq: '123456', subjectName: '爸爸', attr: '喜欢的游戏', value: '消消乐', category: 'preference', confidence: 0.9 }]
  },
  {
    id: 'fuzzy-emotion', category: '模糊语义', convKey: 'group:1', speakerQqs: ['123456'], query: '你记得我以前为什么不开心吗',
    seeds: [{ type: 'fact', subjectQq: '123456', subjectName: '爸爸', attr: '心情', value: '长期努力学习却不知道生活的意义，感到迷茫', category: 'profile', confidence: 0.9 }]
  },
  {
    id: 'time-yesterday', category: '时间范围', convKey: 'group:1', speakerQqs: ['123456'], query: '昨天我们一起做了什么',
    seeds: [{ type: 'event', summary: '一起吃了火锅', detail: '聊了很久', happenedAt: Date.now() - 86400000, category: 'social', confidence: 0.9, participants: ['123456'] }]
  },
  {
    id: 'cross-person', category: '跨人物归属', convKey: 'group:1', speakerQqs: ['123456'], query: '我喜欢什么游戏',
    seeds: [
      { type: 'fact', subjectQq: '123456', subjectName: '爸爸', attr: '喜欢的游戏', value: '消消乐', category: 'preference', confidence: 0.9 },
      { type: 'fact', subjectQq: '999999', subjectName: '别人', attr: '喜欢的游戏', value: '别的游戏', category: 'preference', confidence: 0.9 }
    ],
    expectSubject: '123456'
  },
  {
    id: 'multi-turn', category: '多轮共同经历', convKey: 'group:1', speakerQqs: ['123456'], query: '上次我们一起修好记忆系统是什么时候',
    seeds: [{ type: 'event', summary: '一起修好了记忆系统，特别开心', detail: '反复测试后成功', happenedAt: Date.now() - 3 * 86400000, category: 'tech', confidence: 0.9, participants: ['123456'] }]
  },
  {
    id: 'absent', category: '不存在事件', convKey: 'group:1', speakerQqs: ['123456'], query: '我们去年在月球上吃过饭吗',
    seeds: []
  }
];

function seed(db, item) {
  if (item.type === 'fact') {
    return addFact(db, {
      subjectQq: item.subjectQq, subjectName: item.subjectName, attr: item.attr, value: item.value,
      category: item.category, confidence: item.confidence, scope: 'group:1', visibility: 'group',
      sourceType: 'eval', sourceKey: `eval:${item.subjectQq}:${item.attr}:${item.value}`
    }).id;
  }
  return addEvent(db, {
    summary: item.summary, detail: item.detail, participants: item.participants || [],
    happenedAt: item.happenedAt, timePrecision: 'day', category: item.category,
    confidence: item.confidence, scope: 'group:1', visibility: 'group', sourceType: 'eval'
  }).id;
}

function runCase(item) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dafiyu-memory-eval-'));
  const db = openMemoryDb(path.join(root, 'memory.db'));
  ensureExtractSchema(db);
  const ids = [];
  for (const entry of item.seeds) ids.push({ id: `${entry.type === 'fact' ? 'fact' : 'event'}:${seed(db, entry)}`, subject: entry.subjectQq || null });
  globalThis.__MEMORY_CONF__ = { recallV4: true, lifecycleEnabled: true };
  const result = retrieveMemoryForPrompt(db, {
    convKey: item.convKey, speakerQqs: item.speakerQqs, text: item.query, budgetTokens: 600, now: Date.now()
  });
  const selected = result.diagnostics?.selectedIds || [];
  const expected = item.id === 'absent' ? [] : [...new Set(ids
    .filter((entry) => !item.expectSubject || String(entry.subject) === String(item.expectSubject))
    .map((entry) => entry.id))];
  const hit = expected.filter((id) => selected.includes(id));
  const falsePositives = selected.filter((id) => !expected.includes(id));
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
  return {
    id: item.id, category: item.category,
    expected, selected, hit: hit.length,
    recall: expected.length ? hit.length / expected.length : 1,
    precision: selected.length ? hit.length / selected.length : 1,
    falsePositives: falsePositives.length,
    hallucination: expected.length === 0 && selected.length > 0 ? 1 : 0,
    tokens: Number(result.tokens) || 0,
    traceId: result.diagnostics?.traceId || null,
    text: result.text || ''
  };
}

function evaluate() {
  const cases = CASES.map(runCase);
  const totalExpected = cases.reduce((sum, item) => sum + item.expected.length, 0);
  const totalHits = cases.reduce((sum, item) => sum + item.hit, 0);
  const totalFalse = cases.reduce((sum, item) => sum + item.falsePositives, 0);
  return {
    version: 1,
    at: new Date().toISOString(),
    dataset: 'anonymized-memory-baseline-v1',
    cases,
    metrics: {
      cases: cases.length,
      recall: totalExpected ? totalHits / totalExpected : 0,
      precision: totalHits + totalFalse ? totalHits / (totalHits + totalFalse) : 1,
      falsePositiveCount: totalFalse,
      hallucinationRate: cases.filter((item) => item.hallucination).length / cases.length,
      avgTokens: cases.reduce((sum, item) => sum + item.tokens, 0) / cases.length
    }
  };
}

if (require.main === module) {
  const report = evaluate();
  const dir = path.join(__dirname, '..', 'artifacts');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'memory-eval-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  const lines = [
    '# Memory V4 基线评测',
    '',
    `- 数据集：${report.dataset}`,
    `- 用例：${report.metrics.cases}`,
    `- Recall：${(report.metrics.recall * 100).toFixed(1)}%`,
    `- Precision：${(report.metrics.precision * 100).toFixed(1)}%`,
    `- 误召回：${report.metrics.falsePositiveCount}`,
    `- 幻觉率：${(report.metrics.hallucinationRate * 100).toFixed(1)}%`,
    `- 平均 Token：${report.metrics.avgTokens.toFixed(1)}`,
    '',
    '| 用例 | 类型 | Recall | 误召回 | Token |',
    '|---|---|---:|---:|---:|',
    ...report.cases.map((item) => `| ${item.id} | ${item.category} | ${(item.recall * 100).toFixed(0)}% | ${item.falsePositives} | ${item.tokens} |`)
  ];
  fs.writeFileSync(path.join(dir, 'memory-eval-report.md'), lines.join('\n') + '\n', 'utf8');
  console.log(JSON.stringify(report.metrics, null, 2));
}

module.exports = { evaluate, CASES };
