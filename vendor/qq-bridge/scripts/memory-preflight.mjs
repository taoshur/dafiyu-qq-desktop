/** V4 启动自检：确认所有记忆/成长模块可加载、导出齐全 */
const mods = [
  ['db', '../src/memory/db.js', ['openMemoryDb', 'addFact', 'searchMemory']],
  ['tokenize', '../src/memory/tokenize.js', ['tokenize']],
  ['quality', '../src/memory/quality.js', ['classifyCandidate', 'qualitySummary']],
  ['extractor', '../src/memory/extractor.js', ['ingestMessage', 'writeExtraction', 'validateExtraction']],
  ['worker', '../src/memory/worker.js', ['runExtractionCycle', 'callDeepSeek']],
  ['retrieve', '../src/memory/retrieve.js', ['retrieveMemoryForPrompt', 'buildQueryFromState']],
  ['inject', '../src/memory/inject.js', ['memoryInjection']],
  ['growth', '../src/memory/growth.js', ['ensureGrowthSchema', 'createInterestTraits', 'classifyInterestSignal', 'recordInterestSignal', 'invalidateEvidenceForTopic', 'reassessTrait', 'decayTraits', 'addEvidence']],
  ['growth-hook', '../src/memory/growth-hook.js', ['noteGrowthMessage', 'noteGrowthTool', 'growthContext', 'initGrowthHook', 'startGrowthLoop', 'invalidateGrowthForTopic']]
];

let failed = 0;
for (const [name, file, exports] of mods) {
  try {
    const m = await import(file);
    const missing = exports.filter((e) => typeof m[e] === 'undefined' && typeof m[e] !== 'function');
    if (missing.length) { console.log(`✖ ${name}: 缺少导出 ${missing.join(',')}`); failed += 1; }
    else console.log(`✔ ${name}`);
  } catch (e) {
    console.log(`✖ ${name}: ${e.message}`);
    failed += 1;
  }
}
console.log(failed ? `\n自检失败：${failed} 个模块` : '\n自检通过，全部模块可加载');
process.exit(failed ? 1 : 0);
