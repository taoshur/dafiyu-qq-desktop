// 回归：代理 fake-ip（198.18/15）环境下，safe-fetch 不能把整批外网请求判成「内网地址」。
//
// 线上事故（2026-10-23，state/bridge.log）：
//   [media] 表情获取失败（3 次尝试）：https://multimedia.nt.qq.com.cn/...:
//   域名解析到内网/本机地址，已阻止 | ... | get_image url: 域名解析到内网/本机地址，已阻止
// 根因：fake-ip 兜底地址和公共 DNS 拿到的真实地址一起被送进了内网校验。
// 修复后：fake-ip 条目只作为「走代理直连」的兜底，不参与 isPrivateIp 校验；
// 真实地址仍逐个校验，公共 DNS 拿不到结果时**照旧 fail closed**。
import dns from 'node:dns';

const FAKE = '198.18.0.5';
const REAL = '43.175.44.35';

let pass = 0;
let fail = 0;
function check(name, fn, expected) {
  try {
    const got = fn();
    if (expected !== undefined && expected !== got) throw new Error(`期望 ${expected}，实际 ${got}`);
    console.log(`  ✓ ${name}`);
    pass += 1;
  } catch (error) {
    console.error(`  ✗ ${name}: ${error?.message ?? error}`);
    fail += 1;
  }
}

const originalLookup = dns.promises.lookup;
const originalResolver = dns.promises.Resolver;

/** 用桩换掉 DNS，再以 cache-bust 的方式重新加载 safe-fetch（它在模块顶层捕获 dnsLookup）。 */
async function loadWithDns({ lookup, resolve4 }) {
  dns.promises.lookup = lookup;
  dns.promises.Resolver = class {
    setServers() {}
    resolve4(host) { return resolve4(host); }
  };
  const mod = await import(`../src/safe-fetch.js?dns=${Math.random()}`);
  return mod;
}

async function restoreAndRestoreDns(fn) {
  try { return await fn(); } finally {
    dns.promises.lookup = originalLookup;
    dns.promises.Resolver = originalResolver;
  }
}

console.log('[fake-ip 兜底地址不得被当成内网拒绝]');
await restoreAndRestoreDns(async () => {
  const mod = await loadWithDns({
    lookup: async () => [{ address: FAKE, family: 4 }],
    resolve4: async () => [REAL]
  });

  // 1) fake-ip + 公共 DNS 有真实结果 → 真实地址排在最前，fake-ip 留作兜底，不抛异常
  try {
    const addresses = await mod.resolveSafeAddresses('gxh.vip.qq.com');
    check('返回真实地址（首选）', () => addresses[0], REAL);
    check('fake-ip 保留在末尾作兜底', () => addresses.includes(FAKE), true);
    check('地址数量正确（真实 1 + fake 1）', () => addresses.length, 2);
  } catch (error) {
    check('fake-ip 环境不再整批拒绝', () => { throw error; });
  }

  // 2) 公共 DNS 失败 → 照旧 fail closed（不能拿没证明过的 fake-ip 硬放行）
  const failClosed = await loadWithDns({
    lookup: async () => [{ address: FAKE, family: 4 }],
    resolve4: async () => { throw new Error('公共 DNS 不可用'); }
  });
  try {
    await failClosed.resolveSafeAddresses('gxh.vip.qq.com');
    check('公共 DNS 失败时仍然拒绝', () => { throw new Error('居然放行了'); });
  } catch (error) {
    check('公共 DNS 失败时仍然拒绝', () => {
      if (!/内网|本机|解析/.test(String(error?.message ?? error))) throw new Error(`错误文案不对：${error?.message}`);
    });
  }

  // 3) 安全回归：公共 DNS 返回内网地址时，绝不能因为「有 fake-ip」就放行
  const privateDns = await loadWithDns({
    lookup: async () => [{ address: FAKE, family: 4 }],
    resolve4: async () => ['192.168.1.10']
  });
  try {
    await privateDns.resolveSafeAddresses('gxh.vip.qq.com');
    check('公共 DNS 给内网地址时拒绝', () => { throw new Error('居然放行了内网地址'); });
  } catch (error) {
    check('公共 DNS 给内网地址时拒绝', () => {
      if (!/内网|本机/.test(String(error?.message ?? error))) throw new Error(`错误文案不对：${error?.message}`);
    });
  }

  // 4) 正常公网解析不受影响（无双栈、无 fake-ip）
  const normal = await loadWithDns({
    lookup: async () => [{ address: REAL, family: 4 }],
    resolve4: async () => { throw new Error('不该走到公共 DNS'); }
  });
  const normalAddresses = await normal.resolveSafeAddresses('gxh.vip.qq.com');
  check('正常解析直接返回公网地址', () => normalAddresses.join(','), REAL);

  // 5) isPrivateIp 本身没有放松：198.18/15 仍是内网地址
  check('isPrivateIp 仍把 fake-ip 判为内网', () => mod.isPrivateIp(FAKE), true);
});

console.log('[可选请求头消毒]');
await restoreAndRestoreDns(async () => {
  const mod = await loadWithDns({
    lookup: async () => [{ address: REAL, family: 4 }],
    resolve4: async () => [REAL]
  });
  const clean = mod.sanitizeExtraHeaders({
    Referer: 'https://qun.qq.com/',
    'X-Test': 'ok',
    host: 'evil.example.com',
    Authorization: 'Bearer secret',
    cookie: 'a=b',
    'X-Bad-Name!': 'x',
    'X-CRLF': 'value\r\nInjected: 1'
  });
  check('保留 referer', () => clean.referer, 'https://qun.qq.com/');
  check('保留普通自定义头', () => clean['x-test'], 'ok');
  check('丢弃 host', () => 'host' in clean, false);
  check('丢弃 authorization', () => 'authorization' in clean, false);
  check('丢弃 cookie', () => 'cookie' in clean, false);
  check('丢弃非法头名', () => 'x-bad-name!' in clean, false);
  check('剔除 CRLF（防头注入）', () => clean['x-crlf'], 'valueInjected: 1');
  check('非对象输入返回空对象', () => Object.keys(mod.sanitizeExtraHeaders(null)).length, 0);
});

console.log(`\n${fail ? '❌' : '✅'} test-media-dns-fallback：${pass} 项通过，${fail} 项失败`);
if (fail) process.exitCode = 1;
