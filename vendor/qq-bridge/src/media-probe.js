// 媒体抓取诊断：把「哪一步失败、HTTP 状态、Content-Type、字节数、耗时、脱敏后的地址」拼成一行日志。
// 只做分类与格式化，不发请求、不改抓取行为（真正的校验仍在 safe-fetch / acceptImageBuffer 里）。
import fs from 'node:fs';

/** 按真实字节头分类；HTML/空响应/未知都会被判为不可用。 */
export function classifyImageBuffer(buf) {
  if (!buf || !buf.length) return { ok: false, kind: 'empty', label: '空响应' };
  const b = buf;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ok: true, kind: 'png', label: 'PNG' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ok: true, kind: 'jpeg', label: 'JPEG' };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { ok: true, kind: 'gif', label: 'GIF' };
  if (b.length >= 12 && b.toString('utf8', 0, 4) === 'RIFF' && b.toString('utf8', 8, 12) === 'WEBP') return { ok: true, kind: 'webp', label: 'WEBP' };
  const head = b.toString('utf8', 0, Math.min(64, b.length)).trim().toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<?xml') || head.startsWith('<')) {
    return { ok: false, kind: 'html', label: 'HTML/XML（伪装成图片）' };
  }
  if (head.startsWith('{') || head.startsWith('[')) return { ok: false, kind: 'json', label: 'JSON 错误响应' };
  return { ok: false, kind: 'unknown', label: '未知格式' };
}

/** 日志里不留 query（可能带签名/凭证）、不留 userinfo，只留 host + path。 */
export function sanitizeMediaUrl(raw) {
  const text = String(raw ?? '');
  if (!text) return '';
  try {
    const u = new URL(text);
    const path = u.pathname.length > 120 ? `${u.pathname.slice(0, 120)}…` : u.pathname;
    return `${u.protocol}//${u.host}${path}`;
  } catch {
    return text.split('?')[0].split('#')[0].slice(0, 140);
  }
}

/** 结构化一行诊断。字段全部可选，缺省就不打印。 */
export function formatMediaFailure({ stage, source, url, status, contentType, bytes, ms, error } = {}) {
  const parts = [`阶段=${stage || 'unknown'}`];
  if (source) parts.push(`来源=${String(source).slice(0, 40)}`);
  if (status !== undefined && status !== null && status !== '') parts.push(`状态=${status}`);
  if (contentType) parts.push(`类型=${String(contentType).split(';')[0].trim().slice(0, 40) || '—'}`);
  if (bytes !== undefined && bytes !== null) parts.push(`字节=${bytes}`);
  if (ms !== undefined && ms !== null) parts.push(`耗时=${ms}ms`);
  if (url) parts.push(`地址=${sanitizeMediaUrl(url)}`);
  if (error) parts.push(`原因=${String(error).slice(0, 140)}`);
  return parts.join(' ');
}

/** 从 safeFetchBuffer 抛出的错误里取出已挂载的元数据，统一格式化。 */
export function describeFetchError(error, { stage, source, url, ms } = {}) {
  return formatMediaFailure({
    stage,
    source,
    url,
    status: error?.statusCode,
    contentType: error?.contentType,
    bytes: error?.bytes,
    ms,
    error: error?.message ?? error
  });
}

/**
 * 读取本地图片文件（get_image 返回 file 路径时的分支）。
 * 只读取元数据与字节，不做图片判定；判定交给 classifyLocalImageFile。
 */
export function readLocalImageFile(filePath, { fsImpl = fs, maxBytes = 8 * 1024 * 1024 } = {}) {
  const io = fsImpl;
  const out = { exists: false, size: 0, readError: null, buffer: null };
  try {
    const st = io.statSync(filePath);
    out.exists = true;
    out.size = Number(st.size) || 0;
  } catch (error) {
    out.readError = error;
    return out;
  }
  // 空文件/超限文件不读进内存，避免诊断本身把内存撑爆。
  if (out.size === 0 || out.size > maxBytes) return out;
  try {
    out.buffer = io.readFileSync(filePath);
  } catch (error) {
    out.readError = error;
  }
  return out;
}

/** 本地文件的失败分类：不存在 / 权限不足 / 空文件 / 超限 / 读取失败 / 无效字节。 */
export function classifyLocalImageFile({ exists, size = 0, maxBytes = 0, readError = null, buffer = null } = {}) {
  if (!exists) return { ok: false, reason: '文件不存在', bytes: 0 };
  if (readError) {
    const code = String(readError.code || '');
    const reason = /EACCES|EPERM/.test(code)
      ? '权限不足'
      : `读取失败（${code || readError.message || '未知错误'}）`;
    return { ok: false, reason, bytes: Number(size) || 0 };
  }
  if (!size) return { ok: false, reason: '空文件', bytes: 0 };
  if (maxBytes && size > maxBytes) return { ok: false, reason: `文件超限（${size} 字节）`, bytes: size };
  if (!buffer || !buffer.length) return { ok: false, reason: '未读取到内容', bytes: 0 };
  const cls = classifyImageBuffer(buffer);
  if (!cls.ok) return { ok: false, reason: `无效图片字节：${cls.label}`, bytes: buffer.length, kind: cls.kind };
  return { ok: true, reason: '', bytes: buffer.length, kind: cls.kind };
}
