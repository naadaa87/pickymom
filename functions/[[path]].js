// 픽키맘 서버 (Cloudflare Pages Functions)
// 정적 파일(/assets, /admin, 아이콘)을 뺀 모든 주소가 여기로 와요. 실제 처리는 server/ 폴더에 있어요.
//
// Cloudflare 설정 (Pages 프로젝트 → 설정)
// - D1 데이터베이스 바인딩: 변수 이름 DB (필수)
// - 비밀 값: ADMIN_PASSWORD (필수, 관리 화면 비밀번호)
// - R2 버킷 바인딩: 변수 이름 IMAGES (선택. 없으면 사진을 D1에 저장해요)
// 표는 처음 요청이 들어올 때 저절로 만들어져요.

import { json, fail, html, readBody, isBot, kstDay } from '../server/util.js';
import { ensureSchema, contentVersion } from '../server/schema.js';
import { adminLogin, adminAuthed } from '../server/auth.js';
import { admin } from '../server/admin.js';
import { serveImage } from '../server/images.js';
import { sitemap, rss, robots } from '../server/feeds.js';
import { page } from '../server/layout.js';
import {
  homePage, reviewListPage, postPage, diaryListPage, listIndexPage, listPage,
  aboutPage, disclosurePage, privacyPage, notFoundPage,
} from '../server/pages.js';

const CATS = new Set(['kitchen', 'living', 'baby']);

// ───────── API ─────────
async function api(context, parts, url) {
  const { request, env } = context;
  const route = parts[0] || '';
  if (route === 'health') return json({ ok: true, db: !!env.DB, admin: !!env.ADMIN_PASSWORD, images: env.IMAGES ? 'r2' : 'd1' });
  if (!env.DB) return fail('저장 공간(D1)이 아직 연결되지 않았어요. README의 설정 순서를 확인해 주세요.', 503);
  await ensureSchema(env);

  if (route === 'click' && request.method === 'POST') {
    // 구매 링크 클릭 수 (날짜별 합계)
    const b = await readBody(request, 300);
    const pid = b && Number(b.p);
    if (pid && !isBot(request)) {
      const ok = await env.DB.prepare(`SELECT 1 AS ok FROM products WHERE id = ? AND link_url <> ''`).bind(pid).first();
      if (ok) {
        await env.DB.prepare('INSERT INTO clicks (product_id, day, n) VALUES (?, ?, 1) ON CONFLICT (product_id, day) DO UPDATE SET n = n + 1').bind(pid, kstDay()).run();
      }
    }
    return new Response(null, { status: 204 });
  }

  if (route === 'admin') {
    if (parts[1] === 'login' && request.method === 'POST') return adminLogin(request, env);
    if (!(await adminAuthed(request, env))) {
      return fail(env.ADMIN_PASSWORD ? '다시 로그인해 주세요.' : 'Cloudflare에 ADMIN_PASSWORD가 아직 없어요.', 401);
    }
    return admin(request, env, parts.slice(1), url);
  }
  return fail('없는 기능이에요.', 404);
}

// ───────── 공개 화면 캐시 ─────────
// 글을 고칠 때마다 올라가는 번호(ver)와 10분 단위 시간을 열쇠로 써요.
// 예약해 둔 글은 늦어도 10분 안에 보여요.
async function cached(context, url, render) {
  const { env } = context;
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const noStore = (res) => {
    const out = new Response(res.body, res);
    out.headers.set('cache-control', 'no-cache');
    return out;
  };
  if (!cache) return noStore(await render());
  let key;
  try {
    const ver = await contentVersion(env);
    const bucket = Math.floor(Date.now() / 600e3);
    key = new Request(`${url.origin}/__page/${ver}/${bucket}${url.pathname}${url.search}`);
    const hit = await cache.match(key);
    if (hit) return noStore(hit);
  } catch (e) { key = null; }
  const res = await render();
  if (key && res.status === 200) {
    const copy = new Response(res.clone().body, res);
    copy.headers.set('cache-control', 'public, max-age=600');
    try { context.waitUntil(cache.put(key, copy)); } catch (e) { /* 캐시 없이 계속 */ }
  }
  return noStore(res);
}

const asHtml = (s, status = 200) => (s instanceof Response ? s : html(s, status));

// ───────── 공개 화면 ─────────
async function route(context, url) {
  const { request, env } = context;
  const p = url.pathname;
  let m;
  if (p === '/') return asHtml(await homePage(request, env));
  if (p === '/review') return asHtml(await reviewListPage(request, env));
  if ((m = p.match(/^\/review\/([a-z]+)$/)) && CATS.has(m[1])) return asHtml(await reviewListPage(request, env, m[1]));
  if ((m = p.match(/^\/(review|diary)\/(\d{1,9})(?:-([a-z0-9-]{1,60}))?$/))) {
    const r = await postPage(request, env, m[1], Number(m[2]), m[3] || '');
    return r ? asHtml(r) : null;
  }
  if (p === '/diary') return asHtml(await diaryListPage(request, env));
  if (p === '/list') return asHtml(await listIndexPage(request, env));
  if ((m = p.match(/^\/list\/([a-z0-9-]{1,60})$/))) {
    const r = await listPage(request, env, m[1]);
    return r ? asHtml(r) : null;
  }
  if (p === '/about') return asHtml(aboutPage(request));
  if (p === '/disclosure') return asHtml(disclosurePage(request));
  if (p === '/privacy') return asHtml(privacyPage(request));
  return null;
}

function setupPage(request) {
  const body = `<div class="wrap wrap-r"><div class="nf">
    <h1>홈페이지를 준비하고 있어요</h1>
    <p>곧 첫 글과 함께 문을 열게요.</p>
  </div></div>`;
  return html(page(request, { title: '준비 중', path: '/', body, noindex: true }), 503, { 'cache-control': 'no-store', 'retry-after': '3600' });
}

// 화면 응답에 붙이는 보안 머리글
function secure(res) {
  const type = res.headers.get('content-type') || '';
  if (!type.includes('text/html')) return res;
  const out = new Response(res.body, res);
  out.headers.set('x-content-type-options', 'nosniff');
  out.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  out.headers.set('x-frame-options', 'SAMEORIGIN');
  out.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  return out;
}

export async function onRequest(context) {
  return secure(await handle(context));
}

async function handle(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  try {
    if (path.startsWith('/api/')) return await api(context, path.slice(5).split('/').filter(Boolean), url);

    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405 });

    if (path.length > 1 && path.endsWith('/')) return Response.redirect(url.origin + path.replace(/\/+$/, '') + url.search, 301);
    if (path === '/robots.txt') return robots(request);
    if (path === '/favicon.ico') return Response.redirect(url.origin + '/favicon.svg', 301);
    if (!env.DB) return setupPage(request);
    await ensureSchema(env);

    if (path.startsWith('/img/')) return await serveImage(request, env, path.slice(5), context);
    if (path === '/sitemap.xml') return await sitemap(request, env);
    if (path === '/feed.xml' || path === '/rss.xml') return await rss(request, env);

    const res = await cached(context, url, async () => (await route(context, url)) || html(notFoundPage(request), 404));
    return res;
  } catch (e) {
    console.error(e && e.stack ? e.stack : e);
    if (path.startsWith('/api/')) return fail('잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요.', 500);
    return html(page(request, { title: '잠시 문제가 생겼어요', path, noindex: true, body: '<div class="wrap wrap-r"><div class="nf"><h1>잠시 문제가 생겼어요</h1><p>조금 뒤에 다시 열어 주세요.</p><p><a class="btn" href="/">첫 화면으로</a></p></div></div>' }), 500, { 'cache-control': 'no-store' });
  }
}
