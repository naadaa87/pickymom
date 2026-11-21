// 사이트 지도, RSS, robots.txt
import { esc, nowIso } from './util.js';
import { siteUrl, SITE } from './layout.js';
import { PUB, postPath, listPath } from './data.js';
import { plainText } from './md.js';
import { CATS } from './labels.js';

export async function sitemap(request, env) {
  const base = siteUrl(request);
  const { results: posts } = await env.DB.prepare(`SELECT p.id, p.type, p.slug, p.publish_at, p.updated_at, p.refreshed_at FROM posts p WHERE ${PUB} ORDER BY p.publish_at DESC LIMIT 5000`).bind(nowIso()).all();
  const { results: lists } = await env.DB.prepare(`SELECT id, slug, updated_at FROM lists WHERE status = 'published'`).all();
  const fixed = ['/', '/review', ...Object.keys(CATS).map((k) => `/review/${k}`), '/diary', '/list', '/about', '/disclosure', '/privacy'];
  const day = (iso) => (iso ? String(iso).slice(0, 10) : '');
  const urls = [
    ...fixed.map((p) => ({ loc: base + p })),
    ...posts.map((p) => ({ loc: base + postPath(p), lastmod: day([p.refreshed_at, p.updated_at, p.publish_at].filter(Boolean).sort().pop()) })),
    ...lists.map((l) => ({ loc: base + listPath(l), lastmod: day(l.updated_at) })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

export async function rss(request, env) {
  const base = siteUrl(request);
  const { results: posts } = await env.DB.prepare(`SELECT p.id, p.type, p.slug, p.title, p.summary, p.body, p.publish_at FROM posts p WHERE ${PUB} ORDER BY p.publish_at DESC LIMIT 20`).bind(nowIso()).all();
  const rfc = (iso) => new Date(iso).toUTCString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${esc(SITE.siteName)}</title>
  <link>${esc(base)}/</link>
  <description>${esc(SITE.description)}</description>
  <language>ko</language>
${posts.map((p) => `  <item>
    <title>${esc(p.title)}</title>
    <link>${esc(base + postPath(p))}</link>
    <guid isPermaLink="true">${esc(base + postPath(p))}</guid>
    <pubDate>${rfc(p.publish_at)}</pubDate>
    <description>${esc(p.summary || plainText(p.body, 200))}</description>
  </item>`).join('\n')}
</channel>
</rss>`;
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

export function robots(request) {
  const base = siteUrl(request);
  return new Response(`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' },
  });
}
