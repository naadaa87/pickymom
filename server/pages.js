// 공개 화면
import { esc, fmtDate, fmtMonth, fmtDay, addMonths, kstDay } from './util.js';
import { renderMarkdown, plainText } from './md.js';
import { page, siteUrl, SITE } from './layout.js';
import { loadPost, listPosts, rebuyProducts, publishedLists, loadList, postPath, listPath } from './data.js';
import {
  CATS, VERDICTS, STAGES, IN_USE, MARKS, MARK_WORDS, POINTS, LIST_STATES, PRINCIPLES,
  COUPANG_SENTENCE, GIFT_SENTENCE, OWN_SENTENCE, label,
} from './labels.js';

const PER_PAGE = 12;

// ───────── 작은 조각 ─────────
const badge = (cls, text) => `<span class="b ${cls}">${esc(text)}</span>`;
export const verdictBadge = (v) => badge(`b-${v}`, label(VERDICTS, v, ''));
export const stageBadge = (s) => badge('b-stage', label(STAGES, s, ''));
const typeBadge = (t) => badge('b-type', t === 'diary' ? '살림 일기' : '리뷰');

function photo(id, alt, cls = '') {
  if (!id) return `<div class="ph-empty ${cls}" aria-hidden="true"></div>`;
  return `<img class="${cls}" src="/img/${esc(id)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
}

// 링크를 보여 줄 수 있는 제품: 다시 산다, 첫인상이 아님, 깨진 링크 아님
export const linkable = (x) => !!(x && x.link_url && x.verdict === 'buy' && x.stage !== 'first' && !x.link_broken);

function boughtLine(x) {
  return [x.bought_at ? `${fmtMonth(x.bought_at)}에 삼` : '', x.price_band, x.shop].filter(Boolean).map(esc).join(' · ');
}

function pager(base, pageNo, more, extra = '') {
  if (pageNo <= 1 && !more) return '';
  const q = (n) => `${base}?${extra ? extra + '&' : ''}page=${n}`;
  return `<nav class="pager" aria-label="쪽 넘기기">
    ${pageNo > 1 ? `<a class="btn btn-line" href="${esc(pageNo === 2 ? (extra ? `${base}?${extra}` : base) : q(pageNo - 1))}">← 앞 쪽</a>` : '<span></span>'}
    ${more ? `<a class="btn btn-line" href="${esc(q(pageNo + 1))}">다음 쪽 →</a>` : ''}
  </nav>`;
}

function postCard(p) {
  const x = p.lead;
  const cover = p.cover_id || (x && x.photo_id) || '';
  const line = (x && x.one_line) || p.summary || plainText(p.body, 70);
  return `<article class="card">
    <a href="${esc(postPath(p))}" class="card-a">
      <div class="card-ph">${photo(cover, '')}</div>
      <div class="card-tx">
        <div class="card-cat">${esc([label(CATS, p.category, ''), p.item].filter(Boolean).join(' · ') || (p.type === 'diary' ? '살림 일기' : ''))}</div>
        <h3 class="card-title">${esc(p.title)}</h3>
        ${line ? `<p class="card-line">${esc(line)}</p>` : ''}
        <div class="card-b">${x ? verdictBadge(x.verdict) + stageBadge(x.stage) : typeBadge(p.type)}</div>
      </div>
    </a>
  </article>`;
}

function postRow(p) {
  const x = p.lead;
  const cover = p.cover_id || (x && x.photo_id) || '';
  return `<li class="row">
    <a href="${esc(postPath(p))}">
      <div class="row-ph">${photo(cover, '')}</div>
      <div class="row-tx">
        <h3>${esc(p.title)}</h3>
        <div class="row-b">${typeBadge(p.type)}${x ? stageBadge(x.stage) : ''}<time>${fmtDate(p.publish_at)}</time></div>
      </div>
    </a>
  </li>`;
}

function emptyBox(text) {
  return `<div class="empty"><span class="empty-ic" aria-hidden="true">✓</span><p>${text}</p></div>`;
}

// ───────── 첫 화면 ─────────
export async function homePage(request, env) {
  const [rebuy, latest, lists] = await Promise.all([
    rebuyProducts(env, 4),
    listPosts(env, { limit: 6 }),
    publishedLists(env),
  ]);
  const rebuyHtml = rebuy.length ? `<section class="sec">
      <div class="sec-hd"><h2>요즘 다시 산다</h2><a href="/review?v=buy">모두 보기</a></div>
      <div class="mini-grid">${rebuy.map((x) => `<a class="mini" href="${esc(postPath({ type: 'review', id: x.post_id, slug: x.post_slug }))}#p-${x.id}">
          <div class="mini-ph">${photo(x.photo_id || x.post_cover, x.name)}</div>
          <div class="mini-name">${esc(x.name)}</div>
          ${x.one_line ? `<p class="mini-line">${esc(x.one_line)}</p>` : ''}
          <div class="mini-b">${verdictBadge(x.verdict)}${stageBadge(x.stage)}</div>
        </a>`).join('')}</div>
    </section>` : '';
  const latestHtml = `<section class="sec">
      <div class="sec-hd"><h2>새 글</h2>${latest.posts.length ? '<a href="/review">리뷰 모두 보기</a>' : ''}</div>
      ${latest.posts.length ? `<ul class="rows">${latest.posts.map(postRow).join('')}</ul>` : emptyBox('첫 글을 준비하고 있어요. 써 보고 나서 천천히 적을게요.')}
    </section>`;
  const listHtml = lists.length ? `<section class="sec">
      <div class="sec-hd"><h2>준비물 목록</h2></div>
      <div class="bands">${lists.map((l) => `<a class="band" href="${esc(listPath(l))}"><b>${esc(l.title)}</b><span>${l.n}가지 · 산 것, 미룬 것, 안 산 것 →</span></a>`).join('')}</div>
    </section>` : '';
  const body = `
  <section class="hero">
    <div class="wrap">
      <p class="hero-kicker">픽키맘의 깐깐한 살림템 기록</p>
      <h1 class="hero-title">까다롭게 고르고,<br>솔직하게 씁니다</h1>
      <p class="hero-sub">직접 써 본 주방·생활·육아용품을 고른 이유와 아쉬운 점까지 적어 둡니다. 한 달 뒤, 여섯 달 뒤에 다시 씁니다.</p>
      <div class="chips">${Object.entries(CATS).map(([k, v]) => `<a class="chip" href="/review/${k}">${v}</a>`).join('')}<a class="chip chip-line" href="/about">깐깐 원칙 보기</a></div>
    </div>
  </section>
  <div class="wrap">
    ${rebuyHtml}
    ${latestHtml}
    ${listHtml}
    <section class="sec">
      <div class="sec-hd"><h2>픽키맘이 지키는 것</h2><a href="/about">자세히</a></div>
      <ol class="rules">${PRINCIPLES.map(([t]) => `<li>${esc(t)}</li>`).join('')}</ol>
    </section>
  </div>`;
  return page(request, {
    path: '/',
    body,
    jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.siteName, alternateName: ['피키맘', 'pickymom'], url: siteUrl(request) + '/', description: SITE.description, inLanguage: 'ko-KR' },
  });
}

// ───────── 리뷰 목록 ─────────
export async function reviewListPage(request, env, category = '') {
  const url = new URL(request.url);
  const v = ['buy', 'maybe', 'no'].includes(url.searchParams.get('v')) ? url.searchParams.get('v') : '';
  const sort = url.searchParams.get('sort') === 'fresh' ? 'fresh' : 'new';
  const pageNo = Math.max(1, Math.min(500, Number(url.searchParams.get('page')) || 1));
  const { posts, more } = await listPosts(env, { type: 'review', category, verdict: v, sort, limit: PER_PAGE, offset: (pageNo - 1) * PER_PAGE });
  const base = category ? `/review/${category}` : '/review';
  const qs = (o) => {
    const p = new URLSearchParams();
    const vv = 'v' in o ? o.v : v; const ss = 'sort' in o ? o.sort : sort;
    if (vv) p.set('v', vv);
    if (ss === 'fresh') p.set('sort', 'fresh');
    const s = p.toString();
    return s ? `?${s}` : '';
  };
  const catChips = [['', '전체'], ...Object.entries(CATS)].map(([k, name]) =>
    `<a class="chip${k === category ? ' on' : ''}" href="${k ? `/review/${k}` : '/review'}${qs({})}">${name}</a>`).join('');
  const vChips = [['', '모든 판정'], ...Object.entries(VERDICTS)].map(([k, name]) =>
    `<a class="chip chip-sm${k === v ? ' on' : ''}" href="${base}${qs({ v: k })}">${name}</a>`).join('');
  const sortLinks = `<a class="${sort === 'new' ? 'on' : ''}" href="${base}${qs({ sort: 'new' })}">새 글 순</a><a class="${sort === 'fresh' ? 'on' : ''}" href="${base}${qs({ sort: 'fresh' })}">최근에 다시 쓴 순</a>`;
  const title = category ? `${CATS[category]} 리뷰` : '픽키 리뷰';
  const extra = qs({}).slice(1);
  const body = `<div class="wrap">
    <header class="pg-hd">
      <h1>${esc(title)}</h1>
      <p>직접 써 본 물건만, 판정과 아쉬운 점까지 적었어요.</p>
    </header>
    <div class="filters">
      <div class="chips" role="navigation" aria-label="분야">${catChips}</div>
      <div class="chips" role="navigation" aria-label="판정">${vChips}</div>
      <div class="sort" role="navigation" aria-label="정렬">${sortLinks}</div>
    </div>
    ${posts.length ? `<div class="grid">${posts.map(postCard).join('')}</div>` : emptyBox(v || category ? '아직 이 조건에 맞는 리뷰가 없어요.' : '첫 리뷰를 준비하고 있어요.')}
    ${pager(base, pageNo, more, extra)}
  </div>`;
  return page(request, {
    title, path: base + (pageNo > 1 ? `?page=${pageNo}` : ''), body, nav: '/review',
    description: category ? `픽키맘이 직접 써 보고 판정한 ${CATS[category]}용품 리뷰. 다시 산다, 고민 중, 안 산다로 골라 볼 수 있어요.` : SITE.description,
    noindex: !!(v || sort === 'fresh'),
  });
}

// ───────── 리뷰 한 편 ─────────
function disclosureBox(post, products) {
  if (post.type !== 'review') return '';
  const fee = products.some(linkable);
  const gift = post.acquired === 'gift';
  return `<aside class="disc" aria-label="대가 관계">
    <div class="disc-b">${badge('b-disc', gift ? '제공받음' : '내돈내산')}${fee ? badge('b-disc', '수수료 링크') : ''}</div>
    <p>${esc(gift ? GIFT_SENTENCE : OWN_SENTENCE)}</p>
    ${fee ? `<p>${esc(COUPANG_SENTENCE)}</p>` : ''}
  </aside>`;
}

function pickCard(x, post) {
  const cat = [label(CATS, post.category, ''), post.item].filter(Boolean).join(' · ');
  // 표시(○△✕)를 고른 항목만 보여 줘요. 고르지 않은 항목은 아직 판단하지 않은 것으로 봐요.
  const checks = (x.checks || []).filter((c) => c.label && c.mark);
  const latestUse = (x.followups || []).filter((f) => f.in_use).slice(-1)[0];
  const inUse = latestUse ? latestUse.in_use : x.in_use;
  return `<section class="pk" id="p-${x.id || 0}">
    <div class="pk-top">
      <div class="pk-ph">${photo(x.photo_id || post.cover_id, x.name)}</div>
      <div class="pk-info">
        ${cat ? `<div class="pk-cat">${esc(cat)}</div>` : ''}
        <h2 class="pk-name">${esc(x.name)}</h2>
        ${boughtLine(x) ? `<div class="pk-meta">${boughtLine(x)}</div>` : ''}
        <div class="pk-b">${verdictBadge(x.verdict)}${stageBadge(x.stage)}${inUse ? badge('b-use', label(IN_USE, inUse, '')) : ''}</div>
      </div>
    </div>
    ${x.one_line ? `<p class="pk-one"><b>한 줄 평</b> ${esc(x.one_line)}</p>` : ''}
    ${checks.length ? `<table class="pk-ck">
      <caption>깐깐 체크</caption>
      <tbody>${checks.map((c) => `<tr><th scope="row">${esc(c.label)}</th><td class="mk mk-${esc(c.mark)}"><span aria-hidden="true">${label(MARKS, c.mark, '')}</span><span class="sr">${label(MARK_WORDS, c.mark, '')}</span></td><td>${esc(c.note)}</td></tr>`).join('')}</tbody>
    </table>` : ''}
  </section>`;
}

// 여러 물건을 비교한 글: 맨 위에 한눈에 보는 표
function compareTable(products) {
  return `<section class="cmp" aria-label="한눈에 보기">
    <div class="cmp-hd">써 본 물건 ${products.length}가지</div>
    <ul class="cmp-list">${products.map((x) => `<li><a href="#p-${x.id || 0}"><span class="cmp-ph">${photo(x.photo_id, '')}</span><span class="cmp-name">${esc(x.name)}${x.one_line ? `<small>${esc(x.one_line)}</small>` : ''}</span><span class="cmp-b">${verdictBadge(x.verdict)}</span></a></li>`).join('')}</ul>
  </section>`;
}

function followupSection(products) {
  const multi = products.length > 1;
  const items = [];
  for (const x of products) {
    for (const f of x.followups || []) {
      if (f.skipped || !f.content) continue;
      items.push({ x, f });
    }
  }
  items.sort((a, b) => (a.f.day < b.f.day ? -1 : 1));
  const next = products
    .filter((x) => x.bought_at && x.stage !== 'six' && x.verdict !== 'no')
    .map((x) => {
      const done = new Set((x.followups || []).map((f) => f.point));
      const point = !done.has('month') && x.stage === 'first' ? 'month' : (!done.has('six') ? 'six' : '');
      if (!point) return '';
      const due = addMonths(x.bought_at, point === 'month' ? 1 : 6);
      return due ? `<li>${multi ? `${esc(x.name)}: ` : ''}${label(POINTS, point)}(${fmtMonth(due)}쯤)에 다시 씁니다.</li>` : '';
    }).filter(Boolean);
  if (!items.length && !next.length) return '';
  return `<section class="fu">
    <h2>다시 쓰는 후기</h2>
    ${items.length ? `<ol class="fu-list">${items.map(({ x, f }) => `<li>
      <div class="fu-hd">${badge('b-stage', label(POINTS, f.point, '덧붙임'))}<time datetime="${esc(f.day)}">${fmtDay(f.day)}</time>${f.verdict ? verdictBadge(f.verdict) : ''}</div>
      ${multi ? `<div class="fu-name">${esc(x.name)}</div>` : ''}
      <div class="fu-tx">${renderMarkdown(f.content)}</div>
      ${f.in_use ? `<div class="fu-use">지금은 ${esc(label(IN_USE, f.in_use, ''))}</div>` : ''}
    </li>`).join('')}</ol>` : ''}
    ${next.length ? `<ul class="fu-next">${next.join('')}</ul>` : ''}
  </section>`;
}

function buySection(products) {
  const xs = products.filter(linkable);
  if (!xs.length) return '';
  return `<section class="buy">
    <h2>다시 산다고 쓴 물건</h2>
    ${xs.map((x) => `<div class="buy-row">
      <div class="buy-name">${esc(x.name)}</div>
      <a class="btn btn-buy" href="${esc(x.link_url)}" target="_blank" rel="sponsored nofollow noopener" data-p="${x.id}">쿠팡에서 보기</a>
    </div>`).join('')}
    <p class="buy-note">${esc(COUPANG_SENTENCE)}</p>
  </section>`;
}

export function reviewArticle(post, related = [], { preview = false } = {}) {
  const products = post.products || [];
  const crumbs = post.type === 'review'
    ? `<a href="/review">리뷰</a>${post.category ? ` <span aria-hidden="true">›</span> <a href="/review/${esc(post.category)}">${esc(label(CATS, post.category, ''))}</a>` : ''}${post.item ? ` <span aria-hidden="true">›</span> <span>${esc(post.item)}</span>` : ''}`
    : '<a href="/diary">살림 일기</a>';
  const meta = [
    post.publish_at ? `<time datetime="${esc(post.publish_at)}">${fmtDate(post.publish_at)}</time>` : '<span>공개 전</span>',
    post.refreshed_at && post.refreshed_at > post.publish_at && fmtDate(post.refreshed_at) !== fmtDate(post.publish_at) ? `<span>${fmtDate(post.refreshed_at)} 덧붙임</span>` : '',
    post.period ? `<span>${esc(post.period)}</span>` : '',
  ].filter(Boolean).join('<span aria-hidden="true"> · </span>');
  const coverInCard = post.type === 'review' && products.length === 1 && !products[0].photo_id;
  return `<article class="post">
    ${preview ? '<div class="preview-bar">미리보기예요. 아직 공개되지 않았어요.</div>' : ''}
    <nav class="crumb" aria-label="위치">${crumbs}</nav>
    <h1 class="post-title">${esc(post.title)}</h1>
    <div class="post-meta">${meta}</div>
    ${disclosureBox(post, products)}
    ${post.cover_id && !coverInCard ? `<figure class="cover">${photo(post.cover_id, post.title)}</figure>` : ''}
    ${products.length > 1 ? compareTable(products) : products.map((x) => pickCard(x, post)).join('')}
    <div class="prose">${renderMarkdown(post.body)}</div>
    ${products.length > 1 ? `<h2 class="pk-hd">물건별 깐깐 체크</h2>${products.map((x) => pickCard(x, post)).join('')}` : ''}
    ${post.type === 'review' && post.downside ? `<aside class="downside"><h2>아쉬운 점</h2><div>${renderMarkdown(post.downside)}</div></aside>` : ''}
    ${post.type === 'review' ? followupSection(products) : ''}
    ${buySection(products)}
    ${related.length ? `<section class="sec rel"><div class="sec-hd"><h2>${post.type === 'review' ? '같은 분야 다른 리뷰' : '다른 일기'}</h2></div><ul class="rows">${related.map(postRow).join('')}</ul></section>` : ''}
  </article>`;
}

export async function postPage(request, env, type, id, slugInUrl) {
  const post = await loadPost(env, id);
  if (!post || post.type !== type) return null;
  const canonicalPath = postPath(post);
  if ((slugInUrl || '') !== (post.slug || '')) return Response.redirect(new URL(request.url).origin + canonicalPath, 301);
  const { posts: related } = await listPosts(env, { type, category: type === 'review' ? post.category : '', limit: 3, exclude: post.id });
  const products = post.products || [];
  const firstPhoto = post.cover_id || (products.find((x) => x.photo_id) || {}).photo_id || '';
  const description = post.summary || (products[0] && products[0].one_line) || plainText(post.body, 150) || SITE.description;
  const base = siteUrl(request);
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description,
    datePublished: post.publish_at,
    dateModified: post.refreshed_at || post.updated_at || post.publish_at,
    author: { '@type': 'Person', name: SITE.siteName },
    publisher: { '@type': 'Organization', name: SITE.siteName },
    mainEntityOfPage: base + canonicalPath,
    inLanguage: 'ko-KR',
    ...(firstPhoto ? { image: `${base}/img/${firstPhoto}` } : {}),
  };
  return page(request, {
    title: post.title,
    description,
    path: canonicalPath,
    image: firstPhoto ? `/img/${firstPhoto}` : '',
    type: 'article',
    nav: type === 'review' ? '/review' : '/diary',
    body: `<div class="wrap wrap-r">${reviewArticle(post, related)}</div>`,
    jsonld,
  });
}

// ───────── 살림 일기 ─────────
export async function diaryListPage(request, env) {
  const url = new URL(request.url);
  const pageNo = Math.max(1, Math.min(500, Number(url.searchParams.get('page')) || 1));
  const { posts, more } = await listPosts(env, { type: 'diary', limit: PER_PAGE, offset: (pageNo - 1) * PER_PAGE });
  const body = `<div class="wrap">
    <header class="pg-hd"><h1>살림 일기</h1><p>그날의 살림 이야기. 짧은 글과 사진 몇 장.</p></header>
    ${posts.length ? `<ul class="rows rows-lg">${posts.map(postRow).join('')}</ul>` : emptyBox('첫 일기를 준비하고 있어요.')}
    ${pager('/diary', pageNo, more)}
  </div>`;
  return page(request, { title: '살림 일기', path: '/diary' + (pageNo > 1 ? `?page=${pageNo}` : ''), body, nav: '/diary', description: '픽키맘의 살림 일기. 그날의 살림 이야기를 짧게 적어 둡니다.' });
}

// ───────── 준비물 목록 ─────────
export async function listIndexPage(request, env) {
  const lists = await publishedLists(env);
  const body = `<div class="wrap">
    <header class="pg-hd"><h1>준비물 목록</h1><p>시기별로 산 것, 미룬 것, 안 산 것을 적어 둔 목록이에요.</p></header>
    ${lists.length ? `<div class="bands">${lists.map((l) => `<a class="band" href="${esc(listPath(l))}"><b>${esc(l.title)}</b><span>${l.n}가지${l.intro ? ' · ' + esc(plainText(l.intro, 50)) : ''} →</span></a>`).join('')}</div>` : emptyBox('목록을 정리하고 있어요.')}
  </div>`;
  return page(request, { title: '준비물 목록', path: '/list', body, nav: '/list', description: '출산 준비물, 0~12개월 준비물을 산 것, 미룬 것, 안 산 것으로 나눠 적은 픽키맘의 목록.' });
}

export async function listPage(request, env, key) {
  const list = await loadList(env, key);
  if (!list) return null;
  if (list.slug && key !== list.slug) return Response.redirect(new URL(request.url).origin + listPath(list), 301);
  const groups = [];
  for (const it of list.items) {
    let g = groups.find((x) => x.name === it.grp);
    if (!g) { g = { name: it.grp, items: [] }; groups.push(g); }
    g.items.push(it);
  }
  const counts = Object.keys(LIST_STATES).map((k) => [k, list.items.filter((i) => i.state === k).length]);
  const body = `<div class="wrap wrap-r">
    <article class="post list-page" data-list="${esc(list.slug || String(list.id))}">
      <nav class="crumb" aria-label="위치"><a href="/list">준비물 목록</a></nav>
      <h1 class="post-title">${esc(list.title)}</h1>
      <div class="post-meta"><time>${fmtDate(list.updated_at)}</time> 고침</div>
      ${list.intro ? `<div class="prose">${renderMarkdown(list.intro)}</div>` : ''}
      <div class="chips list-filter" role="group" aria-label="골라 보기">
        <button type="button" class="chip on" data-f="">전체 ${list.items.length}</button>
        ${counts.filter(([, n]) => n).map(([k, n]) => `<button type="button" class="chip" data-f="${k}">${LIST_STATES[k]} ${n}</button>`).join('')}
      </div>
      ${groups.map((g) => `<section class="lg">
        ${g.name ? `<h2>${esc(g.name)}</h2>` : ''}
        <ul class="li">${g.items.map((it) => `<li data-state="${esc(it.state)}">
          <label class="li-main"><input type="checkbox" data-k="${it.id}"><span class="li-name">${esc(it.name)}</span></label>
          <span class="b b-st-${esc(it.state)}">${esc(label(LIST_STATES, it.state, ''))}</span>
          ${it.note ? `<p class="li-note">${esc(it.note)}</p>` : ''}
          ${it.post_id && it.post_live ? `<a class="li-link" href="${esc(postPath({ type: it.post_type, id: it.post_id, slug: it.post_slug }))}">${it.post_type === 'diary' ? '일기' : '리뷰'} 보기 →</a>` : ''}
        </li>`).join('')}</ul>
      </section>`).join('')}
      <div class="list-foot">
        <p class="hint">체크한 내용은 이 기기의 브라우저에만 남아요. 서버로 보내지 않아요.</p>
        <div class="list-btns"><button type="button" class="btn btn-line" data-act="print">인쇄하기</button><button type="button" class="btn btn-ghost" data-act="clear">체크 모두 지우기</button></div>
      </div>
    </article>
  </div>`;
  return page(request, {
    title: list.title, path: listPath(list), body, nav: '/list',
    description: plainText(list.intro, 150) || `${list.title}: 픽키맘이 산 것, 미룬 것, 안 산 것을 나눠 적은 목록.`,
  });
}

// ───────── 소개와 안내 ─────────
export function aboutPage(request) {
  const body = `<div class="wrap wrap-r">
  <article class="post">
    <h1 class="post-title">픽키맘 소개</h1>
    <div class="prose">
      <p class="lead">써 보고 남긴 것만 적습니다. 아쉬운 점과 안 산 이유도 같이 씁니다.</p>
      <p>픽키맘은 직접 써 본 주방용품, 생활용품, 육아용품을 고른 이유와 아쉬운 점까지 적어 두는 개인 기록입니다. '픽키(picky)'는 까다롭다는 뜻이에요. 아무거나 권하지 않겠다는 약속으로 이 이름을 골랐습니다.</p>
      <h2>깐깐 원칙 다섯 가지</h2>
      <ol class="rules rules-lg">${PRINCIPLES.map(([t, d]) => `<li><b>${esc(t)}</b> ${esc(d)}</li>`).join('')}</ol>
      <h2>판정을 읽는 법</h2>
      <p>점수나 별점은 쓰지 않습니다. 숫자는 측정한 결과처럼 보이기 쉽고, 집마다 다른 조건을 지워 버리기 때문이에요. 대신 세 가지로만 말합니다.</p>
      <ul class="legend">
        <li>${verdictBadge('buy')} 다 쓰거나 망가지면 같은 것을 다시 삽니다. 구매 링크는 이 판정에만, 한 달 넘게 써 본 뒤에만 답니다.</li>
        <li>${verdictBadge('maybe')} 쓸 만하지만 다음에는 다른 후보도 보겠습니다.</li>
        <li>${verdictBadge('no')} 다시 사지 않습니다. 이유를 분명히 씁니다.</li>
      </ul>
      <p>판정 옆에는 얼마나 써 보고 쓴 글인지 표시합니다.</p>
      <ul class="legend">
        <li>${stageBadge('first')} 산 지 한 달이 안 됐을 때의 글</li>
        <li>${stageBadge('month')} 한 달 넘게 써 본 뒤</li>
        <li>${stageBadge('six')} 여섯 달 넘게 써 본 뒤</li>
      </ul>
      <h2>깐깐 체크를 읽는 법</h2>
      <p>분야마다 정해 둔 항목에 ○(좋음), △(보통), ✕(아쉬움)를 매기고 한 줄로 이유를 적습니다. 장비로 잰 결과가 아니라 써 본 사람의 기준이에요. 우리 집 조건을 함께 적어 둘 테니, 읽는 분의 집에 맞춰 판단해 주세요.</p>
      <h2>대가 관계</h2>
      <p>모든 리뷰의 글머리에 내 돈으로 샀는지(내돈내산), 제공받았는지, 구매 링크에 수수료가 붙는지를 먼저 적습니다. 자세한 내용은 <a href="/disclosure">제휴 링크 안내</a>에 있어요.</p>
      <h2>다루지 않는 것</h2>
      <p>임신과 출산에 관한 의학 정보, 식품과 건강기능식품, 화장품의 효능은 다루지 않습니다. 육아용품은 KC 표시와 제조사 안내를 그대로 옮기고, 안전하다고 단정하지 않습니다.</p>
      ${SITE.contactEmail ? `<h2>문의</h2><p><a href="mailto:${esc(SITE.contactEmail)}">${esc(SITE.contactEmail)}</a></p>` : ''}
    </div>
  </article></div>`;
  return page(request, { title: '픽키맘 소개', path: '/about', body, nav: '/about', description: '픽키맘의 깐깐 원칙 다섯 가지, 판정과 깐깐 체크를 읽는 법, 대가 관계 안내.' });
}

export function disclosurePage(request) {
  const body = `<div class="wrap wrap-r">
  <article class="post">
    <h1 class="post-title">제휴 링크 안내</h1>
    <div class="prose">
      <p class="lead">픽키맘의 일부 구매 링크는 쿠팡 파트너스 링크입니다.</p>
      <p>이 링크를 거쳐 구매가 이뤄지면 일정액의 수수료를 받습니다. 사는 분이 내는 값은 달라지지 않습니다.</p>
      <h2>어디에 링크를 다나요</h2>
      <ul>
        <li>'다시 산다'고 판정한 물건에만 답니다.</li>
        <li>산 지 한 달이 안 된 '첫인상' 글에는 달지 않습니다.</li>
        <li>글 하나에 물건 하나, 많아야 둘입니다.</li>
        <li>화면을 가리는 광고나 따라다니는 배너는 두지 않습니다.</li>
      </ul>
      <h2>어떻게 표시하나요</h2>
      <p>구매 링크가 있는 글에는 제목 바로 아래에 다음 문구를 넣습니다.</p>
      <blockquote><p>${esc(COUPANG_SENTENCE)}</p></blockquote>
      <p>업체에서 물건을 제공받아 쓴 글이라면 제목 아래에 '제공받음'이라고 따로 밝힙니다. 그런 글도 아쉬운 점을 그대로 씁니다.</p>
      <h2>판정은 링크와 상관없습니다</h2>
      <p>링크는 판정이 끝난 뒤에 답니다. 수수료가 있다는 이유로 판정을 바꾸지 않습니다.</p>
    </div>
  </article></div>`;
  return page(request, { title: '제휴 링크 안내', path: '/disclosure', body, description: '픽키맘의 쿠팡 파트너스 링크와 대가 관계 표시 방법 안내.' });
}

export function privacyPage(request) {
  const body = `<div class="wrap wrap-r">
  <article class="post">
    <h1 class="post-title">개인정보 처리방침</h1>
    <div class="prose">
      <p class="lead">픽키맘은 방문하는 분의 개인정보를 받지 않습니다.</p>
      <h2>받지 않는 정보</h2>
      <p>회원가입, 댓글, 구독 기능이 없어서 이름, 연락처, 이메일 같은 개인정보를 받지 않습니다.</p>
      <h2>방문 통계</h2>
      <p>몇 명이 어떤 글을 봤는지는 Cloudflare Web Analytics로 합계만 봅니다. 이 도구는 쿠키를 쓰지 않고, 방문하는 분을 따로 알아보지 않습니다.</p>
      <h2>구매 링크를 누른 횟수</h2>
      <p>구매 링크를 누르면 어느 물건의 링크가 눌렸는지 날짜별 합계만 셉니다. 누가 눌렀는지 알 수 있는 정보는 저장하지 않습니다. 쿠팡으로 이동한 뒤에는 쿠팡의 개인정보 처리방침이 적용됩니다.</p>
      <h2>준비물 목록의 체크</h2>
      <p>준비물 목록에서 체크한 내용은 방문하는 분의 브라우저에만 저장되고 서버로 보내지 않습니다. '체크 모두 지우기'를 누르거나 브라우저의 사이트 데이터를 지우면 사라집니다.</p>
      <h2>관리 화면</h2>
      <p>글을 쓰는 사람만 쓰는 관리 화면은 보안을 위해 로그인에 실패한 기록을 접속 위치를 알아볼 수 없게 바꾼 값으로 이틀 동안 남깁니다.</p>
      ${SITE.contactEmail ? `<h2>문의</h2><p><a href="mailto:${esc(SITE.contactEmail)}">${esc(SITE.contactEmail)}</a></p>` : ''}
      <p class="muted">시행일: ${esc(SITE.policyDate || kstDay())}</p>
    </div>
  </article></div>`;
  return page(request, { title: '개인정보 처리방침', path: '/privacy', body, description: '픽키맘 개인정보 처리방침.' });
}

export function notFoundPage(request) {
  const body = `<div class="wrap wrap-r"><div class="nf">
    <p class="nf-code">404</p>
    <h1>찾는 글이 없어요</h1>
    <p>주소가 바뀌었거나 아직 공개되지 않은 글이에요.</p>
    <p><a class="btn" href="/">첫 화면으로</a> <a class="btn btn-line" href="/review">리뷰 보기</a></p>
  </div></div>`;
  return page(request, { title: '찾는 글이 없어요', path: new URL(request.url).pathname, body, noindex: true });
}
