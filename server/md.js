// 본문 쓰기 규칙 (간단한 마크다운)
//   ## 소제목, ### 작은 제목
//   - 목록, 1. 번호 목록
//   > 인용
//   **굵게**, [글자](주소), ![사진 설명](/img/사진번호)
//   빈 줄로 문단을 나눠요. 한 줄 바꿈은 그대로 줄이 바뀌어요.
// 모든 글자는 먼저 이스케이프한 뒤 위 규칙만 HTML로 바꿔요.
import { esc } from './util.js';

function safeHref(url) {
  const u = String(url || '').trim();
  if (/^\/[A-Za-z0-9/_\-.?=&#%]*$/.test(u)) return u;
  if (/^https:\/\/[^\s"'<>]+$/i.test(u)) return u;
  return '';
}

function inline(text) {
  // 사진과 링크를 먼저 자리표로 빼 두고, 나머지를 이스케이프해요.
  const slots = [];
  const keep = (h) => { slots.push(h); return `\u0000${slots.length - 1}\u0000`; };
  let s = String(text);
  s = s.replace(/!\[([^\]\n]{0,120})\]\(([^)\s]+)\)/g, (m, alt, url) => {
    const href = safeHref(url);
    if (!href) return m;
    return keep(`<img src="${esc(href)}" alt="${esc(alt)}" loading="lazy" decoding="async">`);
  });
  s = s.replace(/\[([^\]\n]{1,200})\]\(([^)\s]+)\)/g, (m, label, url) => {
    const href = safeHref(url);
    if (!href) return m;
    const ext = href.startsWith('http');
    return keep(`<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener nofollow"' : ''}>${esc(label)}</a>`);
  });
  s = esc(s);
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => slots[Number(i)]);
  return s;
}

export function renderMarkdown(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null; // { tag, items }
  let quote = [];

  const flushPara = () => {
    if (para.length) {
      const only = para.length === 1 && /^!\[[^\]]*\]\([^)]+\)$/.test(para[0].trim());
      out.push(only ? `<figure>${inline(para[0].trim())}</figure>` : `<p>${para.map(inline).join('<br>')}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) { out.push(`<${list.tag}>${list.items.map((t) => `<li>${inline(t)}</li>`).join('')}</${list.tag}>`); list = null; }
  };
  const flushQuote = () => {
    if (quote.length) { out.push(`<blockquote><p>${quote.map(inline).join('<br>')}</p></blockquote>`); quote = []; }
  };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    let m;
    if (!line.trim()) { flushAll(); continue; }
    if ((m = line.match(/^(#{2,3})\s+(.+)$/))) {
      flushAll();
      const tag = m[1].length === 2 ? 'h2' : 'h3';
      out.push(`<${tag}>${inline(m[2])}</${tag}>`);
      continue;
    }
    if ((m = line.match(/^\s*[-*]\s+(.+)$/))) {
      flushPara(); flushQuote();
      if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.+)$/))) {
      flushPara(); flushQuote();
      if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; }
      list.items.push(m[1]);
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara(); flushList();
      quote.push(m[1]);
      continue;
    }
    flushList(); flushQuote();
    para.push(line);
  }
  flushAll();
  return out.join('\n');
}

// 검색 설명이나 목록에 쓸 맨 글자
export function plainText(src, n = 160) {
  const t = String(src || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*([-*>]|\d+[.)])\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > n ? t.slice(0, n - 1).trim() + '…' : t;
}

// 본문 속 사진 번호들
export function imageIds(src) {
  const ids = [];
  String(src || '').replace(/\/img\/([A-Za-z0-9_-]{8,40})/g, (m, id) => { ids.push(id); return m; });
  return ids;
}
