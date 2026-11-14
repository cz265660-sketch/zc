import { DurableObject } from 'cloudflare:workers';
import { handleApi, initialCatalog, json } from './core.js';
import { assets } from './assets.generated.js';
import qrcode from 'qrcode-generator';

const PUBLIC_URL = 'https://zc.cz265660.workers.dev';
export class CatalogStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS catalog (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS login_attempts (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)');
    this.sql.exec('INSERT OR IGNORE INTO catalog (id,body) VALUES (1,?)', JSON.stringify(initialCatalog()));
  }
  load() { return JSON.parse(this.sql.exec('SELECT body FROM catalog WHERE id=1').one().body); }
  save(data, revision) {
    const current = this.load();
    if (current.revision !== revision) return null;
    const next = { ...data, revision: revision + 1 };
    this.sql.exec('UPDATE catalog SET body=? WHERE id=1', JSON.stringify(next));
    return next;
  }
  attempt(bucket) {
    const now = Date.now();
    this.sql.exec('DELETE FROM login_attempts WHERE expires <= ?', now);
    const rows = this.sql.exec('SELECT count FROM login_attempts WHERE bucket=?', bucket).toArray();
    if (rows.length && rows[0].count >= 10) return false;
    this.sql.exec('INSERT INTO login_attempts (bucket,count,expires) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1', bucket, now + 15 * 60 * 1000);
    return true;
  }
  clearAttempts(bucket) { this.sql.exec('DELETE FROM login_attempts WHERE bucket=?', bucket); }
}

function secure(response) {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; media-src 'self' https: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('X-Frame-Options', 'DENY');
  return new Response(response.body, { status: response.status, headers });
}
export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url); let response;
      if (url.pathname.startsWith('/api/')) {
        const store = env.CATALOG.getByName('main');
        response = await handleApi(request, env, store);
      } else if (url.pathname === '/qr.svg' && request.method === 'GET') {
        const code = qrcode(0, 'M'); code.addData(PUBLIC_URL); code.make();
        response = new Response(code.createSvgTag({ cellSize: 8, margin: 32, scalable: true }), { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600', ...(url.searchParams.has('download') ? { 'Content-Disposition': 'attachment; filename="zc-video-guide-qr.svg"' } : {}) } });
      } else if (['GET', 'HEAD'].includes(request.method)) {
        const path = url.pathname === '/' ? '/index.html' : ['/admin', '/admin/'].includes(url.pathname) ? '/admin.html' : url.pathname;
        const file = assets[path];
        response = file ? new Response(request.method === 'HEAD' ? null : file.content, { headers: { 'Content-Type': file.type, 'Cache-Control': 'no-cache' } }) : new Response('Page not found', { status: 404 });
      } else response = new Response('Method not allowed', { status: 405 });
      return secure(response);
    } catch (error) {
      console.error('Request failed', error?.name || 'Error');
      return secure(json({ error: '服务暂时不可用，请稍后重试' }, 503));
    }
  },
};
