// 사진 저장과 보여 주기
// - R2 버킷을 IMAGES라는 이름으로 연결하면 R2에, 아니면 D1의 images 표에 저장해요.
// - 사진은 관리 화면(휴대폰 브라우저)에서 긴 변 1,600px로 줄여 다시 저장한 뒤 올라와요.
//   이 과정에서 촬영 위치 같은 정보가 빠져요. 서버는 JPEG·WebP·PNG만 받아요.
import { json, fail, randomToken, nowIso } from './util.js';

const MAX_BYTES = 1_400_000;
const TYPES = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };

function sniff(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp';
  return '';
}

function toBase64(bytes) {
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  return btoa(s);
}
function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function uploadImage(request, env) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BYTES) return fail('사진이 너무 커요. 다시 골라 주세요.', 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return fail('사진이 너무 크거나 비어 있어요.', 413);
  const mime = sniff(bytes);
  if (!mime) return fail('JPEG, WebP, PNG 사진만 올릴 수 있어요.');
  const w = Math.max(0, Math.min(10000, Number(request.headers.get('x-img-w')) || 0));
  const h = Math.max(0, Math.min(10000, Number(request.headers.get('x-img-h')) || 0));
  const id = randomToken(9);
  if (env.IMAGES) {
    await env.IMAGES.put(`img/${id}`, bytes, { httpMetadata: { contentType: mime }, customMetadata: { w: String(w), h: String(h) } });
    await env.DB.prepare('INSERT INTO images (id, mime, data, w, h, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, mime, '', w, h, bytes.length, nowIso()).run();
  } else {
    await env.DB.prepare('INSERT INTO images (id, mime, data, w, h, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, mime, toBase64(bytes), w, h, bytes.length, nowIso()).run();
  }
  return json({ ok: true, id, url: `/img/${id}`, w, h });
}

export async function serveImage(request, env, id, ctx) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return new Response('Not found', { status: 404 });
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(new URL(`/img/${id}`, request.url).toString());
  if (cache) {
    try { const hit = await cache.match(key); if (hit) return hit; } catch (e) { /* 캐시 없이 계속 */ }
  }
  const headers = { 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' };
  let res = null;
  if (env.IMAGES) {
    const obj = await env.IMAGES.get(`img/${id}`);
    if (obj) res = new Response(obj.body, { headers: { ...headers, 'content-type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/jpeg' } });
  }
  if (!res && env.DB) {
    const row = await env.DB.prepare('SELECT mime, data FROM images WHERE id = ?').bind(id).first();
    if (row && row.data) res = new Response(fromBase64(row.data), { headers: { ...headers, 'content-type': row.mime } });
  }
  if (!res) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  if (cache && ctx && ctx.waitUntil) {
    try { ctx.waitUntil(cache.put(key, res.clone())); } catch (e) { /* 무시 */ }
  }
  return res;
}

export async function imageSize(env, id) {
  if (!id) return null;
  const row = await env.DB.prepare('SELECT w, h FROM images WHERE id = ?').bind(id).first();
  return row ? { w: row.w, h: row.h } : null;
}

export const IMAGE_EXT = TYPES;
