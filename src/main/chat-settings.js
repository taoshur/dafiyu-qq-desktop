'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const http = require('node:http');

function configFile(repoRoot) {
  return path.join(repoRoot, 'config.json');
}

function readConfig(repoRoot) {
  try { return JSON.parse(fs.readFileSync(configFile(repoRoot), 'utf8')); } catch { return {}; }
}

function fastPathConfig(repoRoot) {
  return readConfig(repoRoot)?.socialV2?.fastPath || {};
}

function get(repoRoot) {
  const fp = fastPathConfig(repoRoot);
  return {
    enabled: fp.enabled !== false,
    baseUrl: String(fp.baseUrl || 'https://api.deepseek.com'),
    model: String(fp.model || 'deepseek-chat'),
    hasApiKey: Boolean(String(fp.apiKey || '').trim())
  };
}

function normalizeBaseUrl(value) {
  let base = String(value || '').trim();
  if (!base) throw new Error('Base URL 不能为空');
  if (!/^https?:\/\//i.test(base)) throw new Error('Base URL 必须以 http:// 或 https:// 开头');
  base = base.replace(/\/+$/, '');
  base = base.replace(/\/chat\/completions$/i, '');
  base = base.replace(/\/models$/i, '');
  return base;
}

function requestJson(urlString, { apiKey, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const client = url.protocol === 'http:' ? http : https;
    const req = client.get(url, {
      timeout: timeoutMs,
      headers: {
        accept: 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
      }
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(body); } catch { parsed = null; }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const message = parsed?.error?.message || parsed?.message || String(body).slice(0, 300) || `HTTP ${res.statusCode}`;
          reject(new Error(`模型接口 HTTP ${res.statusCode}：${message}`));
          return;
        }
        resolve(parsed);
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('检测模型超时')); });
    req.on('error', reject);
  });
}

async function listModels(repoRoot, input = {}) {
  const saved = fastPathConfig(repoRoot);
  const baseUrl = normalizeBaseUrl(input.baseUrl || saved.baseUrl || 'https://api.deepseek.com');
  const apiKey = String(input.apiKey || '').trim() || String(saved.apiKey || '').trim();
  if (!apiKey) throw new Error('请先填写 API Key');
  const data = await requestJson(`${baseUrl}/models`, { apiKey });
  const raw = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  const models = [...new Set(raw.map((item) => String(item?.id || item?.name || item || '').trim()).filter(Boolean))].sort();
  if (!models.length) throw new Error('接口返回里没有找到模型列表');
  return { models, endpoint: `${baseUrl}/models` };
}

function save(repoRoot, input = {}) {
  const cfg = readConfig(repoRoot);
  if (!cfg.socialV2 || typeof cfg.socialV2 !== 'object') cfg.socialV2 = {};
  if (!cfg.socialV2.fastPath || typeof cfg.socialV2.fastPath !== 'object') cfg.socialV2.fastPath = {};
  const fp = cfg.socialV2.fastPath;
  fp.enabled = input.enabled !== false;
  if (input.baseUrl !== undefined) fp.baseUrl = normalizeBaseUrl(input.baseUrl);
  if (input.model !== undefined) fp.model = String(input.model || '').trim() || fp.model || 'deepseek-chat';
  const key = String(input.apiKey ?? '').trim();
  if (key) fp.apiKey = key;
  const file = configFile(repoRoot);
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, file);
  return get(repoRoot);
}

module.exports = { get, save, listModels, normalizeBaseUrl };
