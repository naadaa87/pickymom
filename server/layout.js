// 모든 공개 화면의 틀 (머리, 바닥, 검색용 정보)
import config from '../site.config.json';
import { esc } from './util.js';

export const ASSET_VER = '20261121';
export const SITE = config;

export function siteUrl(request) {
  // site.config.json의 주소를 쓰되, 비어 있으면 지금 접속한 주소를 써요.
  const base = String(config.siteUrl || '').replace(/\/+$/, '');
  return base || new URL(request.url).origin;
}

export const CHECK_SVG = '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#C73E4A"/><path d="M6.6 12.4l3.6 3.6 7.2-7.4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const NAV = [
  ['/review', '리뷰'],
  ['/diary', '일기'],
  ['/list', '준비물'],
  ['/about', '소개'],
];

export function page(request, opts) {
  const {
    title = '', description = config.description, path = '/', image = '', type = 'website',
    body = '', jsonld = null, noindex = false, nav = '', bodyClass = '',
  } = opts;
  const base = siteUrl(request);
  const fullTitle = title ? `${title} | ${config.siteName}` : config.siteTitle;
  const canonical = base + path;
  const ogImage = image ? (image.startsWith('http') ? image : base + image) : base + '/og-default.png';
  const ld = jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : '';
  const verify = [
    config.naverSiteVerification ? `<meta name="naver-site-verification" content="${esc(config.naverSiteVerification)}">` : '',
    config.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(config.googleSiteVerification)}">` : '',
  ].join('');
  const navHtml = NAV.map(([href, label]) => `<a href="${href}"${nav === href ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const contact = [
    config.instagram ? `<a href="https://www.instagram.com/${esc(config.instagram.replace(/^@/, ''))}/" target="_blank" rel="noopener">@${esc(config.instagram.replace(/^@/, ''))}</a>` : '',
    config.contactEmail ? `<a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a>` : '',
  ].filter(Boolean).join('<span aria-hidden="true"> · </span>');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
${config.keywords ? `<meta name="keywords" content="${esc(config.keywords)}">` : ''}
<link rel="canonical" href="${esc(canonical)}">
${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${esc(config.siteName)}">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${esc(title || config.siteTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ffffff">
${verify}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="${esc(config.siteName)} 새 글" href="/feed.xml">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="/assets/site.css?v=${ASSET_VER}">
${ld}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
<a class="skip" href="#main">본문 바로 가기</a>
<header class="hd">
  <div class="wrap hd-in">
    <a class="logo" href="/" aria-label="${esc(config.siteName)} 첫 화면">${esc(config.siteName)}<span class="logo-chk">${CHECK_SVG}</span></a>
    <nav class="nav" aria-label="메뉴">${navHtml}</nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="ft">
  <div class="wrap ft-in">
    <p class="ft-brand"><b>${esc(config.siteName)}</b><span>${esc(config.tagline)}</span></p>
    <p class="ft-note">이 홈페이지의 일부 구매 링크는 쿠팡 파트너스 링크이며, 이를 통해 구매가 이뤄지면 일정액의 수수료를 받습니다. 링크가 있는 글에는 글머리에 따로 표시합니다.</p>
    <p class="ft-links"><a href="/about">픽키맘 소개</a><a href="/disclosure">제휴 링크 안내</a><a href="/privacy">개인정보 처리방침</a></p>
    ${contact ? `<p class="ft-contact">${contact}</p>` : ''}
    <p class="ft-copy">© ${new Date().getFullYear()} ${esc(config.siteName)}</p>
  </div>
</footer>
<script src="/assets/site.js?v=${ASSET_VER}" defer></script>
</body>
</html>`;
}
