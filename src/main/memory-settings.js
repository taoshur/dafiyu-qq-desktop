'use strict';

const fs = require('node:fs');
const path = require('node:path');

function configFile(repoRoot) {
  return path.join(repoRoot, 'config.json');
}

function readConfig(repoRoot) {
  try { return JSON.parse(fs.readFileSync(configFile(repoRoot), 'utf8')); } catch { return {}; }
}

function get(repoRoot) {
  const review = readConfig(repoRoot)?.socialV2?.memory?.autoReview || {};
  return {
    enabled: review.enabled === true,
    minConfidence: Number.isFinite(Number(review.minConfidence)) ? Number(review.minConfidence) : 0.55,
    maxPerDay: Number.isFinite(Number(review.maxPerDay)) ? Math.max(0, Number(review.maxPerDay)) : 0,
    kinds: Array.isArray(review.kinds) ? review.kinds.filter((x) => ['fact', 'event'].includes(x)) : ['fact', 'event']
  };
}

function save(repoRoot, input) {
  const cfg = readConfig(repoRoot);
  if (!cfg.socialV2 || typeof cfg.socialV2 !== 'object') cfg.socialV2 = {};
  if (!cfg.socialV2.memory || typeof cfg.socialV2.memory !== 'object') cfg.socialV2.memory = {};
  const minConfidence = Math.min(1, Math.max(0.05, Number(input?.minConfidence) || 0.55));
  const maxPerDay = Math.max(0, Math.floor(Number(input?.maxPerDay) || 0));
  const kinds = Array.isArray(input?.kinds) ? input.kinds.filter((x) => ['fact', 'event'].includes(x)) : ['fact', 'event'];
  cfg.socialV2.memory.autoReview = {
    enabled: input?.enabled === true,
    minConfidence,
    maxPerDay,
    kinds: kinds.length ? kinds : ['fact']
  };
  const file = configFile(repoRoot);
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, file);
  return get(repoRoot);
}

module.exports = { get, save };
