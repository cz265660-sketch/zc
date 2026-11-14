const encoder = new TextEncoder();
const SESSION_SECONDS = 8 * 3600;
export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
export function initialCatalog() {
  const names = [
    ['初次使用教程', 'Getting started', 'Getting started'], ['杯子清洗', 'Cleaning your cup', 'Getting started'],
    ['管理者指纹录制', 'Register an administrator fingerprint', 'Setup'], ['使用者指纹录制', 'Register a user fingerprint', 'Setup'],
    ['指纹删除', 'Remove a fingerprint', 'Setup'], ['配件检查', 'Check accessories', 'Troubleshooting'],
    ['电量检查', 'Check the battery', 'Troubleshooting'], ['漏水检查', 'Check for leaks', 'Troubleshooting'],
  ];
  return { revision: 0, brand: 'ZC', title: 'Product video guides', titleZh: '产品使用视频合集', subtitle: 'A little guidance. A better everyday.', subtitleZh: '简单几步，让日常使用更轻松。', supportEmail: '', videos: names.map(([titleZh, title, category], i) => ({ id: 'guide-' + (i + 1), title, titleZh, category, description: '', descriptionZh: '', url: '', poster: '', enabled: true })) };
}
function text(value, max, name, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(name + ' 格式不正确');
  return value.trim();
}
function httpsUrl(value, name) {
  const result = text(value, 2048, name);
  if (!result) return '';
  let url;
  try { url = new URL(result); } catch { throw new Error(name + ' 必须是完整的 HTTPS 地址'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.startsWith('[') || /^[\d.]+$/.test(url.hostname) || !url.hostname.includes('.')) throw new Error(name + ' 必须是公开的 HTTPS 地址');
  return result;
}
export function validateCatalog(data) {
  if (!data || !Number.isSafeInteger(data.revision) || data.revision < 0 || !Array.isArray(data.videos) || data.videos.length > 100) throw new Error('目录格式不正确，最多支持 100 个视频');
  const result = { revision: data.revision };
  for (const field of ['brand', 'title', 'titleZh', 'subtitle', 'subtitleZh']) result[field] = text(data[field], field === 'brand' ? 40 : 200, field, ['brand', 'title'].includes(field));
  result.supportEmail = text(data.supportEmail, 200, '联系邮箱');
  if (result.supportEmail && !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(result.supportEmail)) throw new Error('联系邮箱格式不正确');
  const ids = new Set();
  result.videos = data.videos.map(v => {
    if (!v || typeof v.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(v.id) || ids.has(v.id) || typeof v.enabled !== 'boolean') throw new Error('视频编号重复或格式不正确');
    ids.add(v.id);
    return { id: v.id, title: text(v.title, 160, '英文标题', true), titleZh: text(v.titleZh, 160, '中文标题'), category: text(v.category, 60, '分类', true), description: text(v.description, 600, '英文说明'), descriptionZh: text(v.descriptionZh, 600, '中文说明'), url: httpsUrl(v.url, '视频链接'), poster: httpsUrl(v.poster, '封面链接'), enabled: v.enabled };
  });
  return result;
}
function b64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
async function mac(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode('zc-video-session-v1:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}
function equal(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
export async function signSession(secret, now = Math.floor(Date.now() / 1000)) {
  const payload = String(now + SESSION_SECONDS) + '.' + crypto.randomUUID();
  return payload + '.' + await mac(payload, secret);
}
export async function validSession(token, secret, now = Math.floor(Date.now() / 1000)) {
  if (!secret || !token || token.length > 200) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[0])) return false;
  const expiration = Number(parts[0]);
  if (expiration <= now || expiration > now + SESSION_SECONDS) return false;
  return equal(await mac(parts[0] + '.' + parts[1], secret), parts[2]);
}
function cookie(value, age = SESSION_SECONDS) { return '__Host-zc_session=' + value + '; Path=/; Max-Age=' + age + '; HttpOnly; Secure; SameSite=Strict'; }
async function authorized(request, secret) {
  const match = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)__Host-zc_session=([^;]+)/);
  return validSession(match?.[1], secret);
}
async function body(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error('请使用 JSON 格式');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('内容为空');
  let size = 0; const parts = [];
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > 256 * 1024) { await reader.cancel(); throw new Error('内容超过 256 KB'); }
    parts.push(chunk.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('内容格式不正确'); }
}
export async function handleApi(request, env, store) {
  const path = new URL(request.url).pathname; const method = request.method;
  const secret = env.ADMIN_PASSWORD;
  const configured = typeof secret === 'string' && secret.length >= 12;
  if (!['GET', 'POST', 'PUT'].includes(method)) return json({ error: '不支持的请求方式' }, 405);
  if (method !== 'GET' && request.headers.get('Origin') !== new URL(request.url).origin) return json({ error: '请求来源不被允许' }, 403);
  try {
    if (path === '/api/catalog' && method === 'GET') {
      const data = await store.load();
      return json({ ...data, videos: data.videos.filter(v => v.enabled) });
    }
    if (path === '/api/session' && method === 'GET') return json({ configured, authenticated: configured && await authorized(request, secret) });
    if (path === '/api/login' && method === 'POST') {
      if (!configured) return json({ error: '后台尚未启用：请在 Cloudflare → zc → Settings → Variables and Secrets 中添加至少 12 位的 ADMIN_PASSWORD Secret。' }, 503);
      const data = await body(request);
      if (typeof data?.password !== 'string' || data.password.length > 256) return json({ error: '密码格式不正确' }, 400);
      const bucket = await mac('login:' + (request.headers.get('CF-Connecting-IP') || 'unknown'), secret);
      if (!(await store.attempt(bucket))) return json({ error: '尝试次数过多，请 15 分钟后重试' }, 429, { 'Retry-After': '900' });
      if (!equal(await mac(data.password, secret), await mac(secret, secret))) return json({ error: '密码不正确' }, 401);
      await store.clearAttempts(bucket);
      return json({ ok: true }, 200, { 'Set-Cookie': cookie(await signSession(secret)) });
    }
    if (path === '/api/logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
    if (path === '/api/admin/catalog') {
      if (!configured || !(await authorized(request, secret))) return json({ error: '请先登录后台' }, 401);
      if (method === 'GET') return json(await store.load());
      if (method === 'PUT') {
        const data = validateCatalog(await body(request));
        const saved = await store.save(data, data.revision);
        if (!saved) return json({ error: '其他窗口已修改目录。请先备份当前内容，再刷新页面重新编辑。' }, 409);
        return json(saved);
      }
    }
    return json({ error: '接口不存在' }, 404);
  } catch (error) {
    if (error instanceof Error && !error.message.includes('internal')) return json({ error: error.message }, 400);
    return json({ error: '暂时无法处理，请稍后重试' }, 500);
  }
}
