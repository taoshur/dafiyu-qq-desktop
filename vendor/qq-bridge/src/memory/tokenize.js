/**
 * 中文分词（第一版，不依赖 FTS5 的 unicode61）：
 * - 全角转半角、去标点、统一小写
 * - 中文取「二元组」（前面补 ^、后面补 $），比单字精确、比词典简单
 * - ASCII 单词/数字整体保留
 * - 去掉高频无意义二元组（的、了、是 等）
 *
 * 例："喜欢玩消消乐" → ^喜 喜欢 欢玩 玩消 消消 消乐 乐$
 */
const STOP_BIGRAMS = new Set([
  '的了', '了了', '是了', '是的', '我们', '你们', '他们', '这个', '那个', '一个',
  '就是', '什么', '怎么', '可以', '没有', '不是', '还是', '然后', '因为', '所以',
  '但是', '如果', '这样', '那样', '一下', '现在', '时候', '知道', '觉得'
]);

const PUNCT_RE = /[\s\u3000-\u303f\uff00-\uffef!-/:-@[-`{-~]+/g;

export function normalizeText(input) {
  return String(input || '')
    .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(PUNCT_RE, ' ')
    .toLowerCase()
    .trim();
}

export function tokenize(input) {
  const text = normalizeText(input);
  if (!text) return [];
  const out = new Set();

  for (const chunk of text.split(/\s+/)) {
    if (!chunk) continue;
    if (/^[a-z0-9_+.-]+$/.test(chunk)) {
      if (chunk.length >= 2) out.add(chunk);
      continue;
    }
    // 中文（含少量其他 CJK）走二元组
    const chars = [...chunk];
    for (let i = 0; i < chars.length; i++) {
      const a = chars[i];
      const b = chars[i + 1];
      if (!isCjk(a)) continue;
      if (b && isCjk(b)) {
        const bg = a + b;
        if (!STOP_BIGRAMS.has(bg)) out.add(bg);
      } else {
        out.add(a);
      }
    }
  }
  return [...out];
}

function isCjk(ch) {
  const code = ch.codePointAt(0);
  return (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf);
}
