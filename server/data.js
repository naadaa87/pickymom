// 공개 화면에 쓰는 데이터 읽기
import { nowIso } from './util.js';

// 공개된 글: 바로 공개했거나, 예약 시각이 지난 글
export const PUB = `(p.status = 'published' OR (p.status = 'scheduled' AND p.publish_at <= ?))`;

export async function productsFor(env, postIds, { withChecks = true, withFollowups = true } = {}) {
  if (!postIds.length) return [];
  const qs = postIds.map(() => '?').join(',');
  const { results: products } = await env.DB.prepare(`SELECT * FROM products WHERE post_id IN (${qs}) ORDER BY post_id, sort, id`).bind(...postIds).all();
  if (!products.length) return products;
  const pids = products.map((x) => x.id);
  const pq = pids.map(() => '?').join(',');
  const [checks, followups] = await Promise.all([
    withChecks ? env.DB.prepare(`SELECT * FROM checks WHERE product_id IN (${pq}) ORDER BY product_id, sort, id`).bind(...pids).all() : { results: [] },
    withFollowups ? env.DB.prepare(`SELECT * FROM followups WHERE product_id IN (${pq}) AND skipped = 0 ORDER BY day, id`).bind(...pids).all() : { results: [] },
  ]);
  for (const pr of products) {
    pr.checks = checks.results.filter((c) => c.product_id === pr.id);
    pr.followups = followups.results.filter((f) => f.product_id === pr.id);
  }
  return products;
}

export async function loadPost(env, id, { anyStatus = false } = {}) {
  const now = nowIso();
  const post = anyStatus
    ? await env.DB.prepare('SELECT * FROM posts p WHERE p.id = ?').bind(id).first()
    : await env.DB.prepare(`SELECT * FROM posts p WHERE p.id = ? AND ${PUB}`).bind(id, now).first();
  if (!post) return null;
  post.products = post.type === 'review' ? await productsFor(env, [post.id]) : [];
  return post;
}

// 목록용: 글마다 대표 제품 하나(조건에 맞는 것, 없으면 '다시 산다', 그것도 없으면 첫 번째)
export async function listPosts(env, { type = '', category = '', verdict = '', sort = 'new', limit = 12, offset = 0, exclude = 0 } = {}) {
  const where = [PUB];
  const args = [nowIso()];
  if (type) { where.push('p.type = ?'); args.push(type); }
  if (category) { where.push('p.category = ?'); args.push(category); }
  if (verdict) { where.push('EXISTS (SELECT 1 FROM products x WHERE x.post_id = p.id AND x.verdict = ?)'); args.push(verdict); }
  if (exclude) { where.push('p.id <> ?'); args.push(exclude); }
  const order = sort === 'fresh'
    ? `CASE WHEN p.refreshed_at > p.publish_at THEN p.refreshed_at ELSE p.publish_at END DESC, p.id DESC`
    : 'p.publish_at DESC, p.id DESC';
  const { results } = await env.DB.prepare(`SELECT p.id, p.type, p.slug, p.title, p.summary, p.body, p.category, p.item, p.period, p.cover_id, p.publish_at, p.refreshed_at FROM posts p WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...args, limit + 1, offset).all();
  const more = results.length > limit;
  const posts = results.slice(0, limit);
  const reviewIds = posts.filter((p) => p.type === 'review').map((p) => p.id);
  const products = await productsFor(env, reviewIds, { withChecks: false, withFollowups: false });
  for (const p of posts) {
    const mine = products.filter((x) => x.post_id === p.id);
    p.products = mine;
    p.lead = (verdict && mine.find((x) => x.verdict === verdict)) || mine.find((x) => x.verdict === 'buy') || mine[0] || null;
  }
  return { posts, more };
}

// 첫 화면 '요즘 다시 산다'
export async function rebuyProducts(env, limit = 4) {
  const { results } = await env.DB.prepare(`SELECT x.*, p.slug AS post_slug, p.title AS post_title, p.cover_id AS post_cover, p.category AS post_category
    FROM products x JOIN posts p ON p.id = x.post_id
    WHERE ${PUB} AND p.type = 'review' AND x.verdict = 'buy' AND x.stage <> 'first'
    ORDER BY CASE WHEN p.refreshed_at > p.publish_at THEN p.refreshed_at ELSE p.publish_at END DESC, x.id DESC LIMIT ?`)
    .bind(nowIso(), limit).all();
  return results;
}

export async function publishedLists(env) {
  const { results } = await env.DB.prepare(`SELECT l.*, (SELECT COUNT(*) FROM list_items i WHERE i.list_id = l.id) AS n FROM lists l WHERE l.status = 'published' ORDER BY l.sort, l.id`).all();
  return results;
}

export async function loadList(env, key, { anyStatus = false } = {}) {
  const byId = /^\d+$/.test(key);
  const sql = `SELECT * FROM lists WHERE ${byId ? 'id = ?' : 'slug = ?'}${anyStatus ? '' : ` AND status = 'published'`}`;
  const list = await env.DB.prepare(sql).bind(byId ? Number(key) : key).first();
  if (!list) return null;
  const { results } = await env.DB.prepare(`SELECT i.*, p.slug AS post_slug, p.type AS post_type,
      CASE WHEN p.id IS NOT NULL AND (p.status = 'published' OR (p.status = 'scheduled' AND p.publish_at <= ?)) THEN 1 ELSE 0 END AS post_live
    FROM list_items i LEFT JOIN posts p ON p.id = i.post_id WHERE i.list_id = ? ORDER BY i.sort, i.id`).bind(nowIso(), list.id).all();
  list.items = results;
  return list;
}

export const postPath = (p) => `/${p.type === 'diary' ? 'diary' : 'review'}/${p.id}${p.slug ? '-' + p.slug : ''}`;
export const listPath = (l) => `/list/${l.slug || l.id}`;
