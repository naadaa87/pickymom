// 관리 화면 API (/api/admin/...)
// 로그인한 사람만 쓸 수 있어요. 고칠 때마다 공개 화면 캐시 번호(ver)를 올려요.
import { json, fail, html, readBody, clip, oneLine, pick, nowIso, kstDay, addMonths, slugify, safeLink, sameOrigin } from './util.js';
import { bumpVersion } from './schema.js';
import { uploadImage } from './images.js';
import { productsFor } from './data.js';
import { reviewArticle } from './pages.js';
import { page } from './layout.js';
import { insertSamples } from './samples.js';
import { CATS, ITEMS, PERIODS, VERDICTS, STAGES, IN_USE, MARKS, POINTS, CHECK_DEFAULTS, PRICE_BANDS, LIST_STATES } from './labels.js';

const IMG_ID = /^[A-Za-z0-9_-]{8,40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const BODY_COUPANG = /coupang\.com|coupa\.ng/i;

// ───────── 글 정리와 검사 ─────────
function normalizePost(b) {
  const type = pick(b.type, ['review', 'diary'], 'review');
  const post = {
    id: Number(b.id) || 0,
    type,
    title: oneLine(b.title, 120),
    slug: slugify(b.slug),
    summary: oneLine(b.summary, 200),
    body: clip(b.body, 30000),
    downside: type === 'review' ? clip(b.downside, 3000) : '',
    category: type === 'review' ? pick(b.category, Object.keys(CATS), '') : '',
    item: type === 'review' ? oneLine(b.item, 30) : '',
    period: pick(b.period, PERIODS, ''),
    acquired: pick(b.acquired, ['own', 'gift'], 'own'),
    cover_id: IMG_ID.test(b.cover_id || '') ? b.cover_id : '',
  };
  const products = type === 'review' ? (Array.isArray(b.products) ? b.products : []).slice(0, 6).map((x, i) => ({
    id: Number(x.id) || 0,
    sort: i,
    name: oneLine(x.name, 80),
    bought_at: DAY.test(x.bought_at || '') ? x.bought_at : '',
    price_band: oneLine(x.price_band, 30),
    shop: oneLine(x.shop, 30),
    photo_id: IMG_ID.test(x.photo_id || '') ? x.photo_id : '',
    verdict: pick(x.verdict, Object.keys(VERDICTS), 'maybe'),
    stage: pick(x.stage, Object.keys(STAGES), 'first'),
    one_line: oneLine(x.one_line, 120),
    in_use: pick(x.in_use, Object.keys(IN_USE), 'yes'),
    link_url: safeLink(x.link_url),
    link_raw: clip(x.link_url, 600),
    checks: (Array.isArray(x.checks) ? x.checks : []).slice(0, 10)
      .map((c, j) => ({ sort: j, label: oneLine(c.label, 20), mark: pick(c.mark, Object.keys(MARKS), ''), note: oneLine(c.note, 100) }))
      .filter((c) => c.label),
  })) : [];
  return { post, products };
}

function checkPost(post, products, publishing, checklist) {
  const errs = [];
  if (!post.title) errs.push('제목을 적어 주세요.');
  if (BODY_COUPANG.test(post.body) || BODY_COUPANG.test(post.downside)) errs.push('구매 링크는 본문이 아니라 제품 카드의 구매 링크 칸에만 넣어 주세요.');
  for (const x of products) {
    if (x.link_raw && !x.link_url) errs.push(`'${x.name || '제품'}'의 구매 링크는 https로 시작하는 주소여야 해요.`);
    if (x.link_url && x.verdict !== 'buy') errs.push(`'${x.name || '제품'}'은 판정이 '다시 산다'가 아니어서 구매 링크를 달 수 없어요.`);
    if (x.link_url && x.stage === 'first') errs.push(`'${x.name || '제품'}'은 첫인상 글이라 구매 링크를 달 수 없어요. 한 달 넘게 써 본 뒤에 달아 주세요.`);
  }
  if (products.filter((x) => x.link_url).length > 2) errs.push('구매 링크는 글 하나에 둘까지만 달 수 있어요.');
  if (publishing) {
    if (!checklist) errs.push('올리기 전 점검표를 모두 체크해 주세요.');
    if (post.type === 'review') {
      if (!post.category) errs.push('분야(주방, 생활, 육아)를 골라 주세요.');
      if (!products.length) errs.push('제품 카드를 하나 이상 채워 주세요.');
      if (products.some((x) => !x.name)) errs.push('제품 카드에 이름을 적어 주세요.');
      if (!post.downside) errs.push('아쉬운 점을 한 가지 이상 적어 주세요.');
    } else if (!post.body) {
      errs.push('본문을 적어 주세요.');
    }
  }
  return errs;
}

// ───────── 글 저장 ─────────
async function savePost(request, env) {
  const b = await readBody(request, 200000);
  if (!b) return fail('보낸 내용을 읽지 못했어요.');
  const { post, products } = normalizePost(b);
  const action = pick(b.action, ['draft', 'publish', 'schedule'], 'draft');
  const publishing = action !== 'draft';
  const errs = checkPost(post, products, publishing, b.checklist === true);
  let scheduleAt = '';
  if (action === 'schedule') {
    const t = new Date(String(b.publish_at || ''));
    if (isNaN(t)) errs.push('예약할 날짜와 시간을 골라 주세요.');
    else if (t.getTime() < Date.now() + 60e3) errs.push('예약은 지금보다 뒤의 시간으로 골라 주세요.');
    else scheduleAt = t.toISOString();
  }
  if (errs.length) return json({ ok: false, message: errs[0], errors: errs }, 400);

  const now = nowIso();
  let prev = null;
  if (post.id) {
    prev = await env.DB.prepare('SELECT id, status, publish_at, created_at FROM posts WHERE id = ?').bind(post.id).first();
    if (!prev) return fail('고칠 글을 찾지 못했어요. 목록에서 다시 열어 주세요.', 404);
  }
  let status = 'draft';
  let publishAt = prev ? prev.publish_at : '';
  if (action === 'publish') {
    status = 'published';
    const wasLive = prev && publishAt && publishAt <= now && (prev.status === 'published' || prev.status === 'scheduled');
    if (!wasLive) publishAt = now;
  } else if (action === 'schedule') {
    status = 'scheduled';
    publishAt = scheduleAt;
  } else if (prev && prev.status === 'scheduled' && publishAt > now) {
    publishAt = '';
  }

  const cols = [post.type, post.slug, post.title, post.summary, post.body, post.downside, post.category, post.item, post.period, post.acquired, post.cover_id, status, publishAt, publishing ? 1 : 0, now];
  let id = post.id;
  if (id) {
    await env.DB.prepare(`UPDATE posts SET type = ?, slug = ?, title = ?, summary = ?, body = ?, downside = ?, category = ?, item = ?, period = ?, acquired = ?, cover_id = ?, status = ?, publish_at = ?, checklist_ok = ?, updated_at = ? WHERE id = ?`)
      .bind(...cols, id).run();
  } else {
    const r = await env.DB.prepare(`INSERT INTO posts (type, slug, title, summary, body, downside, category, item, period, acquired, cover_id, status, publish_at, checklist_ok, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(...cols, now).run();
    id = r.meta.last_row_id;
  }

  // 제품 카드: 보낸 목록에 없는 카드는 지우고, 있는 카드는 고치거나 새로 넣어요.
  const { results: existing } = await env.DB.prepare('SELECT id FROM products WHERE post_id = ?').bind(id).all();
  const keepIds = new Set(products.map((x) => x.id).filter(Boolean));
  const removed = existing.map((r) => r.id).filter((pid) => !keepIds.has(pid));
  for (const pid of removed) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM checks WHERE product_id = ?').bind(pid),
      env.DB.prepare('DELETE FROM followups WHERE product_id = ?').bind(pid),
      env.DB.prepare('DELETE FROM clicks WHERE product_id = ?').bind(pid),
      env.DB.prepare('DELETE FROM products WHERE id = ?').bind(pid),
    ]);
  }
  const owned = new Set(existing.map((r) => r.id));
  for (const x of products) {
    const vals = [x.sort, x.name, x.bought_at, x.price_band, x.shop, x.photo_id, x.verdict, x.stage, x.one_line, x.in_use, x.link_url, now];
    let pid = x.id && owned.has(x.id) ? x.id : 0;
    if (pid) {
      const old = await env.DB.prepare('SELECT link_url FROM products WHERE id = ?').bind(pid).first();
      const linkChanged = !old || old.link_url !== x.link_url;
      await env.DB.prepare(`UPDATE products SET sort = ?, name = ?, bought_at = ?, price_band = ?, shop = ?, photo_id = ?, verdict = ?, stage = ?, one_line = ?, in_use = ?, link_url = ?, updated_at = ?${linkChanged ? `, link_broken = 0, link_checked = ''` : ''} WHERE id = ?`)
        .bind(...vals, pid).run();
    } else {
      const r = await env.DB.prepare(`INSERT INTO products (post_id, sort, name, bought_at, price_band, shop, photo_id, verdict, stage, one_line, in_use, link_url, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, ...vals).run();
      pid = r.meta.last_row_id;
    }
    const stmts = [env.DB.prepare('DELETE FROM checks WHERE product_id = ?').bind(pid)];
    for (const c of x.checks) stmts.push(env.DB.prepare('INSERT INTO checks (product_id, sort, label, mark, note) VALUES (?, ?, ?, ?, ?)').bind(pid, c.sort, c.label, c.mark, c.note));
    await env.DB.batch(stmts);
  }
  await bumpVersion(env);
  return json({ ok: true, id, status, publish_at: publishAt });
}

async function getPost(env, id) {
  const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  if (!post) return fail('글을 찾지 못했어요.', 404);
  const products = post.type === 'review' ? await productsFor(env, [id]) : [];
  if (products.length) {
    const pids = products.map((x) => x.id);
    const { results } = await env.DB.prepare(`SELECT * FROM followups WHERE product_id IN (${pids.map(() => '?').join(',')}) ORDER BY day, id`).bind(...pids).all();
    for (const x of products) x.followups = results.filter((f) => f.product_id === x.id);
  }
  post.products = products;
  return json({ ok: true, post });
}

async function listAdminPosts(env) {
  const { results } = await env.DB.prepare(`SELECT p.id, p.type, p.title, p.status, p.publish_at, p.updated_at, p.category, p.cover_id,
      (SELECT COUNT(*) FROM products x WHERE x.post_id = p.id) AS n_products,
      (SELECT COUNT(*) FROM products x WHERE x.post_id = p.id AND x.link_url <> '') AS n_links,
      (SELECT x.verdict FROM products x WHERE x.post_id = p.id ORDER BY x.sort LIMIT 1) AS verdict
    FROM posts p ORDER BY CASE p.status WHEN 'draft' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, p.updated_at DESC LIMIT 500`).all();
  return json({ ok: true, posts: results, now: nowIso() });
}

async function deletePost(env, id) {
  const { results } = await env.DB.prepare('SELECT id FROM products WHERE post_id = ?').bind(id).all();
  const stmts = [];
  for (const r of results) {
    stmts.push(env.DB.prepare('DELETE FROM checks WHERE product_id = ?').bind(r.id));
    stmts.push(env.DB.prepare('DELETE FROM followups WHERE product_id = ?').bind(r.id));
    stmts.push(env.DB.prepare('DELETE FROM clicks WHERE product_id = ?').bind(r.id));
  }
  stmts.push(env.DB.prepare('DELETE FROM products WHERE post_id = ?').bind(id));
  stmts.push(env.DB.prepare('UPDATE list_items SET post_id = 0 WHERE post_id = ?').bind(id));
  stmts.push(env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id));
  await env.DB.batch(stmts);
  await bumpVersion(env);
  return json({ ok: true });
}

// 미리보기: 저장하지 않고 공개 화면 모양 그대로 그려요.
async function preview(request, env) {
  const b = await readBody(request, 200000);
  if (!b) return fail('보낸 내용을 읽지 못했어요.');
  const { post, products } = normalizePost(b);
  const fu = {};
  const pids = products.map((x) => x.id).filter(Boolean);
  if (pids.length) {
    const { results } = await env.DB.prepare(`SELECT * FROM followups WHERE product_id IN (${pids.map(() => '?').join(',')}) AND skipped = 0 ORDER BY day, id`).bind(...pids).all();
    for (const f of results) (fu[f.product_id] = fu[f.product_id] || []).push(f);
  }
  post.products = products.map((x) => ({ ...x, followups: fu[x.id] || [] }));
  post.publish_at = '';
  const body = `<div class="wrap wrap-r">${reviewArticle(post, [], { preview: true })}</div>`;
  return html(page(request, { title: post.title || '미리보기', path: '/preview', body, noindex: true }), 200, { 'cache-control': 'no-store' });
}

// ───────── 다시 쓸 후기 ─────────
async function dueList(env) {
  const { results: rows } = await env.DB.prepare(`SELECT x.id, x.name, x.bought_at, x.stage, x.verdict, x.in_use, x.photo_id, p.id AS post_id, p.title AS post_title, p.status AS post_status, p.cover_id
    FROM products x JOIN posts p ON p.id = x.post_id
    WHERE x.bought_at <> '' AND p.status IN ('published', 'scheduled') ORDER BY x.bought_at`).all();
  if (!rows.length) return json({ ok: true, due: [], soon: [] });
  const { results: fus } = await env.DB.prepare(`SELECT product_id, point FROM followups WHERE product_id IN (${rows.map(() => '?').join(',')})`).bind(...rows.map((r) => r.id)).all();
  const today = kstDay();
  const soonLimit = addMonths(today, 1);
  const due = [];
  const soon = [];
  for (const r of rows) {
    const done = new Set(fus.filter((f) => f.product_id === r.id).map((f) => f.point));
    for (const [point, months] of [['month', 1], ['six', 6]]) {
      if (done.has(point)) continue;
      if (point === 'month' && r.stage !== 'first') continue;
      if (point === 'six' && r.stage === 'six') continue;
      const at = addMonths(r.bought_at, months);
      const item = { product_id: r.id, name: r.name, post_id: r.post_id, post_title: r.post_title, photo_id: r.photo_id || r.cover_id, point, due: at, stage: r.stage, verdict: r.verdict, in_use: r.in_use };
      if (at <= today) { due.push(item); break; }
      if (at <= soonLimit) { soon.push(item); break; }
      break;
    }
  }
  due.sort((a, b) => (a.due < b.due ? -1 : 1));
  soon.sort((a, b) => (a.due < b.due ? -1 : 1));
  return json({ ok: true, due, soon, today });
}

async function addFollowup(request, env) {
  const b = await readBody(request, 20000);
  if (!b) return fail('보낸 내용을 읽지 못했어요.');
  const pid = Number(b.product_id) || 0;
  const prod = await env.DB.prepare('SELECT id, post_id, stage FROM products WHERE id = ?').bind(pid).first();
  if (!prod) return fail('제품을 찾지 못했어요.', 404);
  const point = pick(b.point, Object.keys(POINTS), 'other');
  const skipped = b.skipped ? 1 : 0;
  const day = DAY.test(b.day || '') ? b.day : kstDay();
  const content = skipped ? '' : clip(b.content, 4000);
  if (!skipped && !content) return fail('덧붙일 내용을 적어 주세요. 이번에는 건너뛰려면 \'건너뛰기\'를 눌러 주세요.');
  if (BODY_COUPANG.test(content)) return fail('구매 링크는 제품 카드의 구매 링크 칸에만 넣어 주세요.');
  const inUse = pick(b.in_use, Object.keys(IN_USE), '');
  const verdict = pick(b.verdict, Object.keys(VERDICTS), '');
  const now = nowIso();
  const stmts = [env.DB.prepare('INSERT INTO followups (product_id, point, day, content, in_use, verdict, skipped, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(pid, point, day, content, skipped ? '' : inUse, skipped ? '' : verdict, skipped, now)];
  if (!skipped) {
    const order = { first: 0, month: 1, six: 2 };
    const newStage = point === 'six' ? 'six' : point === 'month' ? 'month' : prod.stage;
    const stage = order[newStage] > order[prod.stage] ? newStage : prod.stage;
    const sets = ['stage = ?', 'updated_at = ?'];
    const vals = [stage, now];
    if (inUse) { sets.push('in_use = ?'); vals.push(inUse); }
    if (verdict) { sets.push('verdict = ?'); vals.push(verdict); }
    stmts.push(env.DB.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, pid));
    // 판정이 '다시 산다'가 아니게 되면 구매 링크를 내려요.
    if (verdict && verdict !== 'buy') stmts.push(env.DB.prepare(`UPDATE products SET link_url = '' WHERE id = ?`).bind(pid));
    stmts.push(env.DB.prepare('UPDATE posts SET refreshed_at = ?, updated_at = ? WHERE id = ?').bind(now, now, prod.post_id));
  }
  await env.DB.batch(stmts);
  await bumpVersion(env);
  return json({ ok: true });
}

async function deleteFollowup(env, id) {
  await env.DB.prepare('DELETE FROM followups WHERE id = ?').bind(id).run();
  await bumpVersion(env);
  return json({ ok: true });
}

// ───────── 준비물 목록 ─────────
async function listLists(env) {
  const { results } = await env.DB.prepare(`SELECT l.*, (SELECT COUNT(*) FROM list_items i WHERE i.list_id = l.id) AS n FROM lists l ORDER BY l.sort, l.id`).all();
  return json({ ok: true, lists: results });
}
async function getList(env, id) {
  const list = await env.DB.prepare('SELECT * FROM lists WHERE id = ?').bind(id).first();
  if (!list) return fail('목록을 찾지 못했어요.', 404);
  const { results } = await env.DB.prepare('SELECT * FROM list_items WHERE list_id = ? ORDER BY sort, id').bind(id).all();
  list.items = results;
  return json({ ok: true, list });
}
async function saveList(request, env) {
  const b = await readBody(request, 100000);
  if (!b) return fail('보낸 내용을 읽지 못했어요.');
  const title = oneLine(b.title, 80);
  if (!title) return fail('목록 이름을 적어 주세요.');
  const slug = slugify(b.slug);
  const status = pick(b.status, ['draft', 'published'], 'draft');
  const intro = clip(b.intro, 3000);
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 300).map((it, i) => ({
    sort: i, grp: oneLine(it.grp, 30), name: oneLine(it.name, 80), state: pick(it.state, Object.keys(LIST_STATES), 'choosing'),
    note: oneLine(it.note, 200), post_id: Number(it.post_id) || 0,
  })).filter((it) => it.name);
  let id = Number(b.id) || 0;
  if (slug) {
    const dup = await env.DB.prepare('SELECT id FROM lists WHERE slug = ? AND id <> ?').bind(slug, id).first();
    if (dup) return fail('같은 주소를 쓰는 목록이 이미 있어요. 주소 영문을 바꿔 주세요.');
  }
  const now = nowIso();
  if (id) {
    const r = await env.DB.prepare('UPDATE lists SET slug = ?, title = ?, intro = ?, status = ?, sort = ?, updated_at = ? WHERE id = ?').bind(slug, title, intro, status, Number(b.sort) || 0, now, id).run();
    if (!r.meta.changes) return fail('목록을 찾지 못했어요.', 404);
  } else {
    const r = await env.DB.prepare('INSERT INTO lists (slug, title, intro, status, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(slug, title, intro, status, Number(b.sort) || 0, now).run();
    id = r.meta.last_row_id;
  }
  const stmts = [env.DB.prepare('DELETE FROM list_items WHERE list_id = ?').bind(id)];
  for (const it of items) stmts.push(env.DB.prepare('INSERT INTO list_items (list_id, sort, grp, name, state, note, post_id) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, it.sort, it.grp, it.name, it.state, it.note, it.post_id));
  await env.DB.batch(stmts);
  await bumpVersion(env);
  return json({ ok: true, id });
}
async function deleteList(env, id) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM list_items WHERE list_id = ?').bind(id),
    env.DB.prepare('DELETE FROM lists WHERE id = ?').bind(id),
  ]);
  await bumpVersion(env);
  return json({ ok: true });
}

// ───────── 링크 점검과 숫자 ─────────
async function links(env) {
  const { results } = await env.DB.prepare(`SELECT x.id, x.name, x.link_url, x.link_checked, x.link_broken, x.verdict, x.stage, p.id AS post_id, p.title AS post_title, p.status AS post_status
    FROM products x JOIN posts p ON p.id = x.post_id WHERE x.link_url <> '' ORDER BY x.link_broken DESC, x.link_checked, x.id`).all();
  return json({ ok: true, links: results, today: kstDay() });
}
async function markLink(request, env, id) {
  const b = (await readBody(request, 500)) || {};
  const broken = b.state === 'broken' ? 1 : 0;
  await env.DB.prepare('UPDATE products SET link_broken = ?, link_checked = ? WHERE id = ?').bind(broken, kstDay(), id).run();
  await bumpVersion(env);
  return json({ ok: true });
}
async function stats(env, url) {
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days')) || 30));
  const since = kstDay(new Date(Date.now() - (days - 1) * 86400e3));
  const { results } = await env.DB.prepare(`SELECT x.id, x.name, p.title AS post_title, p.id AS post_id,
      COALESCE((SELECT SUM(n) FROM clicks c WHERE c.product_id = x.id AND c.day >= ?), 0) AS n_period,
      COALESCE((SELECT SUM(n) FROM clicks c WHERE c.product_id = x.id), 0) AS n_total
    FROM products x JOIN posts p ON p.id = x.post_id WHERE x.link_url <> '' OR EXISTS (SELECT 1 FROM clicks c WHERE c.product_id = x.id)
    ORDER BY n_period DESC, n_total DESC`).bind(since).all();
  const { results: byDay } = await env.DB.prepare('SELECT day, SUM(n) AS n FROM clicks WHERE day >= ? GROUP BY day ORDER BY day').bind(since).all();
  return json({ ok: true, days, since, products: results, byDay });
}

// ───────── 상태, 백업 ─────────
async function status(env) {
  const counts = {};
  for (const t of ['posts', 'products', 'followups', 'lists', 'images']) {
    const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first();
    counts[t] = r ? r.n : 0;
  }
  return json({
    ok: true,
    db: true,
    images: env.IMAGES ? 'r2' : 'd1',
    counts,
    labels: { CATS, ITEMS, PERIODS, VERDICTS, STAGES, IN_USE, MARKS, POINTS, CHECK_DEFAULTS, PRICE_BANDS, LIST_STATES },
    today: kstDay(),
  });
}
async function backup(env) {
  const out = { exported_at: nowIso(), note: '사진 파일은 빠져 있어요. 사진 원본은 휴대폰 사진첩에 있어요.' };
  for (const t of ['posts', 'products', 'checks', 'followups', 'lists', 'list_items', 'clicks']) {
    const { results } = await env.DB.prepare(`SELECT * FROM ${t}`).all();
    out[t] = results;
  }
  const { results: imgs } = await env.DB.prepare('SELECT id, mime, w, h, bytes, created_at FROM images').all();
  out.images = imgs;
  return new Response(JSON.stringify(out, null, 1), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="pickymom-backup-${kstDay()}.json"`,
      'cache-control': 'no-store',
    },
  });
}

// ───────── 길 찾기 ─────────
export async function admin(request, env, parts, url) {
  const [a, b, c] = parts; // /api/admin/a/b/c
  const m = request.method;
  if (m !== 'GET' && m !== 'HEAD' && !sameOrigin(request)) return fail('다른 곳에서 보낸 요청은 받지 않아요.', 403);
  const id = Number(b) || 0;

  if (a === 'status' && m === 'GET') return status(env);
  if (a === 'posts') {
    if (!b && m === 'GET') return listAdminPosts(env);
    if (!b && m === 'POST') return savePost(request, env);
    if (id && m === 'GET') return getPost(env, id);
    if (id && m === 'DELETE') return deletePost(env, id);
  }
  if (a === 'preview' && m === 'POST') return preview(request, env);
  if (a === 'images' && m === 'POST') return uploadImage(request, env);
  if (a === 'due' && m === 'GET') return dueList(env);
  if (a === 'followups') {
    if (!b && m === 'POST') return addFollowup(request, env);
    if (id && m === 'DELETE') return deleteFollowup(env, id);
  }
  if (a === 'lists') {
    if (!b && m === 'GET') return listLists(env);
    if (!b && m === 'POST') return saveList(request, env);
    if (id && m === 'GET') return getList(env, id);
    if (id && m === 'DELETE') return deleteList(env, id);
  }
  if (a === 'links') {
    if (!b && m === 'GET') return links(env);
    if (id && m === 'POST') return markLink(request, env, id);
  }
  if (a === 'stats' && m === 'GET') return stats(env, url);
  if (a === 'samples' && m === 'POST') { await insertSamples(env); await bumpVersion(env); return json({ ok: true }); }
  if (a === 'backup' && m === 'GET') return backup(env);
  return fail('없는 기능이에요.', 404);
}
