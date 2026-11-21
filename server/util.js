// 서버 공통 도구
export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});
export const fail = (message, status = 400) => json({ ok: false, message }, status);

export const html = (body, status = 200, headers = {}) => new Response(body, {
  status,
  headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
});

// HTML에 넣기 전에 꼭 거쳐요
export const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const nowIso = () => new Date().toISOString();
const KST = 9 * 3600e3;
export const kstDay = (date = new Date()) => new Date(date.getTime() + KST).toISOString().slice(0, 10);

// 2026-11-21T... → 2026. 11. 21.
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + KST);
  if (isNaN(d)) return '';
  return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}.`;
}
// 2026-11-05 → 2026년 11월
export function fmtMonth(day) {
  const m = String(day || '').match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}년 ${Number(m[2])}월` : '';
}
// 2026-11-05 → 2026. 11. 5.
export function fmtDay(day) {
  const m = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.` : '';
}
// YYYY-MM-DD에 개월 더하기
export function addMonths(day, n) {
  const m = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + n, Number(m[3])));
  return d.toISOString().slice(0, 10);
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const randomToken = (n = 12) => b64u(crypto.getRandomValues(new Uint8Array(n)));

// 길이가 달라도 같은 시간이 걸리도록 해시끼리 비교
export async function sameSecret(a, b) {
  const [x, y] = await Promise.all([sha256Hex(String(a || '')), sha256Hex(String(b || ''))]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0 && !!a && !!b;
}

export async function readBody(request, maxBytes) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) return null;
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try { return JSON.parse(text); } catch (e) { return null; }
}

// 제어 문자를 빼고 앞뒤 공백을 지운 뒤 길이를 잘라요. 줄바꿈은 남겨요.
export const clip = (s, n) => String(s == null ? '' : s)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  .replace(/\r\n?/g, '\n').trim().slice(0, n);
export const oneLine = (s, n) => clip(s, n).replace(/\s+/g, ' ');
export const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

export async function ipHashOf(request) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
  return ip ? (await sha256Hex(`pickymom:${ip}:${kstDay()}`)).slice(0, 16) : '';
}

// 같은 사이트에서 보낸 요청인지 확인 (다른 사이트가 몰래 보내는 요청 막기)
export function sameOrigin(request) {
  const host = new URL(request.url).host;
  for (const h of ['origin', 'referer']) {
    const v = request.headers.get(h);
    if (v) {
      try { return new URL(v).host === host; } catch (e) { return false; }
    }
  }
  return false;
}

// 짧은 시간에 너무 많이 하는 것 막기
export async function tooMany(db, key, act, limit, minutes) {
  if (!key) return false;
  const since = new Date(Date.now() - minutes * 60e3).toISOString();
  const row = await db.prepare('SELECT COUNT(*) AS n FROM actions WHERE k = ? AND act = ? AND created_at > ?').bind(key, act, since).first();
  return !!(row && row.n >= limit);
}
export async function logAction(db, key, act) {
  if (!key) return;
  await db.prepare('INSERT INTO actions (k, act, created_at) VALUES (?, ?, ?)').bind(key, act, nowIso()).run();
  if (Math.random() < 0.05) {
    await db.prepare('DELETE FROM actions WHERE created_at < ?').bind(new Date(Date.now() - 2 * 86400e3).toISOString()).run();
  }
}

// 검색 로봇과 미리보기 봇
export function isBot(request) {
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  return !ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|kakaotalk-scrap|yeti|daum|headless|python|curl|wget/.test(ua);
}

// 주소 꼬리: 영문 소문자, 숫자, 하이픈만
export const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

// 구매 링크로 받을 수 있는 주소
export function safeLink(url) {
  const u = clip(url, 600);
  if (!u) return '';
  try {
    const p = new URL(u);
    return p.protocol === 'https:' ? p.toString() : '';
  } catch (e) { return ''; }
}
export const isCoupang = (url) => /(^|\.)coupang\.com$/i.test((() => { try { return new URL(url).hostname; } catch (e) { return ''; } })());
