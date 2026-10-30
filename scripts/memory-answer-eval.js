'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const CASES = [
  {
    id: 'answer-no-support', question: '我们去年在月球上吃过饭吗？', context: '',
    expected: ['没有相关记忆'], forbidden: ['吃过', '月球上吃过'], category: '不存在事件'
  },
  {
    id: 'answer-attribution', question: '爸爸喜欢什么游戏？', context: '爸爸喜欢消消乐。别人喜欢别的游戏。',
    expected: ['消消乐'], forbidden: ['别人喜欢'], category: '人物归属'
  },
  {
    id: 'answer-time', question: '昨天我们做了什么？', context: '昨天一起吃了火锅。',
    expected: ['火锅'], forbidden: ['今天', '前天'], category: '时间错误'
  },
  {
    id: 'answer-no-evidence', question: '我小时候最难忘的旅行是哪次？', context: '',
    expected: ['没有相关记忆'], forbidden: ['一定是', '应该是', '肯定'], category: '无依据补充'
  }
];

function evaluateAnswer(item, answer) {
  const text = String(answer || '');
  const expectedOk = item.expected.some((word) => text.includes(word));
  const forbidden = item.forbidden.filter((word) => text.includes(word));
  return {
    id: item.id, category: item.category,
    expectedOk, forbiddenHits: forbidden,
    pass: expectedOk && forbidden.length === 0
  };
}

function callDeepSeek({ apiKey, baseUrl, model, prompt, timeoutMs = 30000 }) {
  const url = `${String(baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '')}/chat/completions`;
  const body = JSON.stringify({
    model: model || 'deepseek-chat', temperature: 0,
    messages: [{ role: 'user', content: prompt }]
  });
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST', timeout: timeoutMs,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}`, 'content-length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}`);
          resolve(String(json?.choices?.[0]?.message?.content || ''));
        } catch (error) { reject(error); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('answer eval timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

async function evaluate({ generate = null } = {}) {
  const rows = [];
  for (const item of CASES) {
    if (!generate) {
      rows.push({ ...evaluateAnswer(item, ''), answer: null, skipped: true });
      continue;
    }
    const answer = await generate(item);
    rows.push({ ...evaluateAnswer(item, answer), answer });
  }
  return {
    version: 1, at: new Date().toISOString(), dataset: 'anonymized-answer-baseline-v1',
    status: generate ? 'run' : 'not-run',
    cases: rows,
    metrics: {
      cases: rows.length,
      pass: rows.filter((item) => item.pass).length,
      hallucinationCases: rows.filter((item) => item.category === '不存在事件' && item.answer && item.pass === false).length
    }
  };
}

if (require.main === module) {
  const key = process.env.DEEPSEEK_API_KEY || process.env.DAFIYU_EVAL_API_KEY || '';
  const generate = key ? (item) => callDeepSeek({
    apiKey: key,
    prompt: `只根据下面的记忆回答；没有依据就说“没有相关记忆”。不要补充未给出的事实。\n记忆：${item.context || '（空）'}\n问题：${item.question}`
  }) : null;
  evaluate({ generate }).then((report) => {
    const dir = path.join(__dirname, '..', 'artifacts');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'memory-answer-eval-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify(report.metrics, null, 2));
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { evaluate, evaluateAnswer, CASES };
