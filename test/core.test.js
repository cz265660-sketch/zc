import test from 'node:test';
import assert from 'node:assert/strict';
import { initialCatalog, validateCatalog, signSession, validSession, handleApi } from '../src/core.js';

const password = 'test-only-long-password-9842';
const origin = 'https://zc.cz265660.workers.dev';
function store() {
  let data = initialCatalog();
  let attempts = 0;
  return {
    load: async () => structuredClone(data),
    save: async (catalog, revision) => {
      if (revision !== data.revision) return null;
      data = { ...catalog, revision: data.revision + 1 };
      return structuredClone(data);
    },
    attempt: async () => ++attempts <= 10,
    clearAttempts: async () => { attempts = 0; },
  };
}
const request = (path, method = 'GET', body, cookie, extra = {}) => new Request(origin + path, {
  method, headers: { ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...extra },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
test('seeds 8 editable tutorials without temporary URLs', () => {
  const data = initialCatalog();
  assert.equal(data.videos.length, 8);
  assert.ok(data.videos.every(v => !v.url));
  assert.equal(validateCatalog(data).videos.length, 8);
});
test('rejects unsafe URLs, duplicate ids, and oversize catalogs', () => {
  for (const url of ['javascript:alert(1)', 'http://example.com/a.mp4', 'https://u:p@example.com/a', 'https://localhost/a', 'https://127.0.0.1/a']) {
    const data = initialCatalog(); data.videos[0].url = url;
    assert.throws(() => validateCatalog(data));
  }
  const data = initialCatalog(); data.videos[1].id = data.videos[0].id;
  assert.throws(() => validateCatalog(data));
  assert.throws(() => validateCatalog({ ...initialCatalog(), videos: Array(101).fill(initialCatalog().videos[0]) }));
});
test('sessions reject tampering, expiration and password rotation', async () => {
  const token = await signSession(password, 1000);
  assert.equal(await validSession(token, password, 1001), true);
  assert.equal(await validSession(token + 'x', password, 1001), false);
  assert.equal(await validSession(token, password, 1000 + 8 * 3600 + 1), false);
  assert.equal(await validSession(token, password + 'changed', 1001), false);
});
test('missing or short secret fails closed; anonymous writes fail', async () => {
  const db = store();
  for (const secret of [undefined, 'short']) {
    const response = await handleApi(request('/api/login', 'POST', { password }), { ADMIN_PASSWORD: secret }, db);
    assert.equal(response.status, 503);
  }
  assert.equal((await handleApi(request('/api/admin/catalog', 'PUT', initialCatalog()), { ADMIN_PASSWORD: password }, db)).status, 401);
});
test('login throttles guessing and rejects cross-origin requests', async () => {
  const db = store(); const env = { ADMIN_PASSWORD: password };
  for (let i = 0; i < 10; i++) assert.equal((await handleApi(request('/api/login', 'POST', { password: 'wrong' }), env, db)).status, 401);
  assert.equal((await handleApi(request('/api/login', 'POST', { password }), env, db)).status, 429);
  assert.equal((await handleApi(request('/api/login', 'POST', { password }, null, { Origin: 'https://evil.test' }), env, db)).status, 403);
});
test('authenticated catalog edit persists, stale revisions conflict, and draft entries remain private', async () => {
  const db = store(); const env = { ADMIN_PASSWORD: password };
  const login = await handleApi(request('/api/login', 'POST', { password }), env, db);
  assert.equal(login.status, 200);
  const cookie = login.headers.get('Set-Cookie').split(';')[0];
  assert.match(login.headers.get('Set-Cookie'), /HttpOnly; Secure; SameSite=Strict/);
  const data = await (await handleApi(request('/api/admin/catalog', 'GET', undefined, cookie), env, db)).json();
  data.title = 'My updated guides'; data.videos[0].url = 'https://example.com/guide.mp4'; data.videos[1].enabled = false;
  const save = await handleApi(request('/api/admin/catalog', 'PUT', data, cookie), env, db);
  assert.equal(save.status, 200);
  const publicData = await (await handleApi(request('/api/catalog'), env, db)).json();
  assert.equal(publicData.title, data.title);
  assert.equal(publicData.videos.length, 7);
  assert.equal(publicData.videos[0].url, data.videos[0].url);
  assert.equal((await handleApi(request('/api/admin/catalog', 'PUT', data, cookie), env, db)).status, 409);
});
test('malformed input returns a user-facing error and logout clears cookie', async () => {
  const db = store(); const env = { ADMIN_PASSWORD: password };
  const malformed = new Request(origin + '/api/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{' });
  assert.equal((await handleApi(malformed, env, db)).status, 400);
  const response = await handleApi(request('/api/logout', 'POST', {}), env, db);
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/);
});
