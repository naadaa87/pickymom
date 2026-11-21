/* 픽키맘 관리 화면
   휴대폰 브라우저에서 글을 쓰고, 제품 카드와 깐깐 체크를 채우고, 점검표를 확인한 뒤 공개해요.
   서버 API: /api/admin/... (server/admin.js) */
(function () {
  'use strict';

  // ───────── 도구 ─────────
  var lastHash = '';
  var app = document.getElementById('app');
  var toastEl = document.getElementById('toast');
  var L = null; // 서버에서 받은 이름표
  var TOKEN_KEY = 'pm-admin-token';
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } },
  };
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toast(msg, kind) {
    toastEl.textContent = msg;
    toastEl.className = 'show ' + (kind || '');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { toastEl.className = ''; }, kind === 'err' ? 5200 : 2600);
  }
  function today() {
    var d = new Date(Date.now() + 9 * 3600e3);
    return d.toISOString().slice(0, 10);
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '.';
  }
  function fmtDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var h = d.getHours();
    return fmtDate(iso) + ' ' + (h < 12 ? '오전 ' : '오후 ') + ((h % 12) || 12) + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function fmtDay(day) {
    var m = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] + '. ' + Number(m[2]) + '. ' + Number(m[3]) + '.' : '';
  }
  function monthsSince(day) {
    var m = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return -1;
    var t = today().split('-').map(Number);
    var n = (t[0] - Number(m[1])) * 12 + (t[1] - Number(m[2]));
    if (t[2] < Number(m[3])) n -= 1;
    return n;
  }
  function suggestStage(day) {
    var n = monthsSince(day);
    if (n < 0) return '';
    return n >= 6 ? 'six' : n >= 1 ? 'month' : 'first';
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ───────── 서버와 주고받기 ─────────
  function token() { return store.get(TOKEN_KEY) || ''; }
  function api(method, path, body, opts) {
    opts = opts || {};
    var headers = { 'x-admin-token': token() };
    var payload;
    if (body instanceof Blob) { payload = body; headers['content-type'] = body.type; }
    else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
    if (opts.headers) Object.keys(opts.headers).forEach(function (k) { headers[k] = opts.headers[k]; });
    return fetch('/api/admin/' + path, { method: method, headers: headers, body: payload }).then(function (res) {
      if (res.status === 401 && path !== 'login') { logout(true); throw new Error('다시 로그인해 주세요.'); }
      if (opts.raw) return res;
      var ct = res.headers.get('content-type') || '';
      return (ct.indexOf('json') >= 0 ? res.json() : res.text().then(function (t) { return { ok: res.ok, text: t }; })).then(function (data) {
        if (!res.ok || data.ok === false) {
          var err = new Error((data && data.message) || '문제가 생겼어요. 잠시 뒤에 다시 해 주세요.');
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }
  function logout(expired) {
    store.del(TOKEN_KEY);
    L = null;
    if (expired) toast('로그인이 끝났어요. 다시 로그인해 주세요.', 'err');
    location.hash = '#/login';
    route();
  }

  // ───────── 사진 올리기 (휴대폰에서 줄이고 위치 정보 지우기) ─────────
  function loadBitmap(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(file); }).catch(function () { return loadImg(file); });
    }
    return loadImg(file);
  }
  function loadImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('사진을 열지 못했어요. 다른 사진을 골라 주세요.')); };
      img.src = url;
    });
  }
  function shrink(file) {
    return loadBitmap(file).then(function (bmp) {
      var max = 1600;
      var w = bmp.width, h = bmp.height;
      var k = Math.min(1, max / Math.max(w, h));
      var cw = Math.round(w * k), ch = Math.round(h * k);
      var canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(bmp, 0, 0, cw, ch);
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) {
          if (!blob) reject(new Error('사진을 줄이지 못했어요.'));
          else resolve({ blob: blob, w: cw, h: ch });
        }, 'image/jpeg', 0.84);
      });
    });
  }
  function pickPhoto() {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = function () { resolve(input.files && input.files[0]); };
      input.click();
    });
  }
  function uploadPhoto() {
    return pickPhoto().then(function (file) {
      if (!file) return null;
      toast('사진을 줄여서 올리는 중이에요…');
      return shrink(file).then(function (r) {
        return api('POST', 'images', r.blob, { headers: { 'x-img-w': String(r.w), 'x-img-h': String(r.h) } });
      }).then(function (res) { toast('사진을 올렸어요.'); return res.id; });
    }).catch(function (e) { toast(e.message, 'err'); return null; });
  }

  // ───────── 틀 ─────────
  var TABS = [
    ['#/', '글', 'posts'],
    ['#/due', '다시 쓰기', 'due'],
    ['#/lists', '준비물', 'lists'],
    ['#/more', '더 보기', 'more'],
  ];
  function shell(active, title, inner, opts) {
    opts = opts || {};
    var tabs = TABS.map(function (t) {
      return '<a href="' + t[0] + '"' + (t[2] === active ? ' aria-current="page"' : '') + '>' + t[1] + (t[2] === 'due' && shell.due ? '<i class="dot">' + shell.due + '</i>' : '') + '</a>';
    }).join('');
    app.innerHTML =
      '<header class="top"><div class="top-in">' +
      (opts.back ? '<a class="back" href="' + opts.back + '" aria-label="뒤로">‹</a>' : '<a class="brand" href="#/">픽키맘<span class="chk"></span><small>관리</small></a>') +
      '<h1>' + esc(title) + '</h1>' +
      '<a class="site" href="/" target="_blank" rel="noopener">홈페이지 ↗</a>' +
      '</div></header>' +
      '<main id="view" class="view' + (opts.wide ? ' wide' : '') + '">' + inner + '</main>' +
      (opts.noTabs ? '' : '<nav class="tabs">' + tabs + '</nav>');
    window.scrollTo(0, opts.keepScroll || 0);
    return document.getElementById('view');
  }
  shell.due = 0;

  function seg(name, options, value, extra) {
    return '<div class="seg" role="radiogroup">' + options.map(function (o) {
      return '<button type="button" role="radio" aria-checked="' + (o[0] === value) + '" class="' + (o[0] === value ? 'on' : '') + '" data-act="set" ' + name + ' data-v="' + esc(o[0]) + '"' + (extra || '') + '>' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }
  function entries(obj) { return Object.keys(obj).map(function (k) { return [k, obj[k]]; }); }
  var VB = { buy: 'b-buy', maybe: 'b-maybe', no: 'b-no' };
  function vBadge(v) { return v && L.VERDICTS[v] ? '<span class="b ' + VB[v] + '">' + L.VERDICTS[v] + '</span>' : ''; }

  // ───────── 로그인 ─────────
  function viewLogin() {
    app.innerHTML =
      '<div class="login"><div class="login-box">' +
      '<div class="login-logo">픽키맘<span class="chk"></span></div>' +
      '<p class="muted">글을 쓰는 사람만 들어올 수 있어요.</p>' +
      '<form id="lf"><label class="fl">비밀번호<input type="password" name="pw" autocomplete="current-password" required></label>' +
      '<label class="ck"><input type="checkbox" name="remember" checked> 이 기기에서 30일 동안 로그인 유지</label>' +
      '<button class="btn btn-c btn-full" type="submit">들어가기</button></form>' +
      '<p class="muted small">비밀번호는 Cloudflare에 넣어 둔 ADMIN_PASSWORD예요.</p>' +
      '</div></div>';
    document.getElementById('lf').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      var btn = f.querySelector('button');
      btn.disabled = true;
      api('POST', 'login', { pw: f.pw.value, remember: f.remember.checked }).then(function (r) {
        store.set(TOKEN_KEY, r.token);
        location.hash = '#/';
        route();
      }).catch(function (err) { toast(err.message, 'err'); btn.disabled = false; });
    });
  }

  // ───────── 글 목록 ─────────
  var postFilter = 'all';
  function viewPosts() {
    var v = shell('posts', '글', '<p class="muted pad">불러오는 중…</p>');
    Promise.all([api('GET', 'posts'), api('GET', 'due').catch(function () { return { due: [] }; })]).then(function (res) {
      var data = res[0];
      shell.due = (res[1].due || []).length;
      var now = data.now;
      var stateOf = function (p) {
        if (p.status === 'scheduled' && p.publish_at > now) return ['scheduled', '예약 ' + fmtDateTime(p.publish_at)];
        if (p.status === 'published' || p.status === 'scheduled') return ['published', '공개 ' + fmtDate(p.publish_at)];
        return ['draft', '초안'];
      };
      var counts = { all: data.posts.length, draft: 0, scheduled: 0, published: 0 };
      data.posts.forEach(function (p) { counts[stateOf(p)[0]]++; });
      var list = data.posts.filter(function (p) { return postFilter === 'all' || stateOf(p)[0] === postFilter; });
      var html =
        '<div class="new-btns"><a class="btn btn-c" href="#/edit/new/review">＋ 리뷰 쓰기</a><a class="btn btn-line" href="#/edit/new/diary">＋ 일기 쓰기</a></div>' +
        (shell.due ? '<a class="banner" href="#/due">다시 쓸 때가 된 후기가 <b>' + shell.due + '개</b> 있어요 →</a>' : '') +
        '<div class="filter">' + [['all', '전체'], ['draft', '초안'], ['scheduled', '예약'], ['published', '공개']].map(function (f) {
          return '<button type="button" data-act="pf" data-v="' + f[0] + '" class="' + (postFilter === f[0] ? 'on' : '') + '">' + f[1] + ' ' + counts[f[0]] + '</button>';
        }).join('') + '</div>' +
        (list.length ? '<ul class="plist">' + list.map(function (p) {
          var st = stateOf(p);
          return '<li><a href="#/edit/' + p.id + '">' +
            '<span class="pthumb">' + (p.cover_id ? '<img src="/img/' + esc(p.cover_id) + '" alt="">' : '') + '</span>' +
            '<span class="ptx"><b>' + esc(p.title || '(제목 없음)') + '</b>' +
            '<span class="pmeta"><span class="b b-type">' + (p.type === 'diary' ? '일기' : '리뷰') + '</span>' +
            '<span class="b st-' + st[0] + '">' + esc(st[1]) + '</span>' + (p.type === 'review' ? vBadge(p.verdict) : '') +
            (p.n_links ? '<span class="b b-disc">링크 ' + p.n_links + '</span>' : '') + '</span></span></a></li>';
        }).join('') + '</ul>' : '<div class="empty">' + (data.posts.length ? '이 상태의 글이 없어요.' : '아직 글이 없어요. 위의 단추로 첫 글을 써 보세요.<br><span class="small">화면이 어떻게 보이는지 먼저 보려면 더 보기 → 예시 글 넣기를 눌러 보세요.</span>') + '</div>');
      v = shell('posts', '글', html);
      v.addEventListener('click', function (e) {
        var b = e.target.closest('[data-act="pf"]');
        if (b) { postFilter = b.getAttribute('data-v'); viewPosts(); }
      });
    }).catch(function (e) { v.innerHTML = '<p class="err pad">' + esc(e.message) + '</p>'; });
  }

  // ───────── 글쓰기 ─────────
  var E = null; // 지금 쓰는 글
  var CHECKLIST = [
    ['사진', [
      ['p1', '송장, 우편물, 창밖, 현관이 찍히지 않았다'],
      ['p2', '반사되는 물건에 얼굴이나 집 안이 비치지 않았다'],
      ['p3', '아이와 가족의 얼굴, 이름이 없다'],
      ['p4', '모두 직접 찍은 사진이다'],
    ]],
    ['글', [
      ['w1', '써 본 내용만 썼다'],
      ['w2', '아쉬운 점이 들어 있다', 'review'],
      ['w3', '병, 체중, 면역 같은 효능 표현이 없다'],
      ['w4', "'검증', '테스트', '인증' 같은 말이 없다"],
      ['w5', '동네, 병원, 날짜 같은 단서가 없다'],
    ]],
    ['표시와 링크', [
      ['d1', '대가 관계(내 돈으로 샀다 / 제공받았다)를 골랐다', 'review'],
      ['d2', "구매 링크는 '다시 산다'이고 한 달 넘게 써 본 물건에만 있다", 'link'],
      ['d3', '링크를 눌러 열리는지 확인했다', 'link'],
    ]],
  ];
  var WATCH_WORDS = ['검증', '테스트', '인증', '최고', '인생템', '무조건', '역대급', '강추', '면역', '치료', '예방', '다이어트', '체중', '완벽'];

  function newProduct(cat) {
    return {
      id: 0, name: '', bought_at: today(), price_band: '', shop: '', photo_id: '', verdict: 'maybe', stage: 'first',
      one_line: '', in_use: 'yes', link_url: '', followups: [],
      checks: (L.CHECK_DEFAULTS[cat] || []).map(function (l) { return { label: l, mark: '', note: '' }; }),
    };
  }
  function newPost(type) {
    return {
      id: 0, type: type, title: '', slug: '', summary: '', body: '', downside: '', category: 'kitchen', item: '', period: '',
      acquired: 'own', cover_id: '', status: 'draft', publish_at: '', products: type === 'review' ? [newProduct('kitchen')] : [],
    };
  }
  var linkOk = function (x) { return x.verdict === 'buy' && x.stage !== 'first'; };
  var hasLinks = function () { return E.post.type === 'review' && E.post.products.some(function (x) { return x.link_url; }); };

  function viewEditor(id, type) {
    var start = function (post) {
      E = { post: post, dirty: false, check: {}, mode: 'publish', scheduleAt: '', fu: null };
      renderEditor();
    };
    if (id === 'new') { start(newPost(type === 'diary' ? 'diary' : 'review')); return; }
    shell('posts', '글 고치기', '<p class="muted pad">불러오는 중…</p>', { back: '#/', noTabs: true });
    api('GET', 'posts/' + id).then(function (r) { start(r.post); }).catch(function (e) { toast(e.message, 'err'); location.hash = '#/'; });
  }

  function problems(publishing) {
    var p = E.post;
    var out = [];
    if (!p.title.trim()) out.push('제목을 적어 주세요.');
    if (/coupang\.com|coupa\.ng/i.test(p.body + p.downside)) out.push('구매 링크는 본문이 아니라 제품 카드의 구매 링크 칸에 넣어 주세요.');
    p.products.forEach(function (x) {
      var n = x.name || '제품';
      if (x.link_url && !/^https:\/\//i.test(x.link_url)) out.push("'" + n + "'의 구매 링크는 https로 시작해야 해요.");
      if (x.link_url && !linkOk(x)) out.push("'" + n + "'은 '다시 산다'이면서 한 달 넘게 써 본 물건일 때만 링크를 달 수 있어요.");
    });
    if (p.products.filter(function (x) { return x.link_url; }).length > 2) out.push('구매 링크는 글 하나에 둘까지만 달 수 있어요.');
    if (publishing) {
      if (p.type === 'review') {
        if (!p.products.length) out.push('제품 카드를 하나 이상 채워 주세요.');
        if (p.products.some(function (x) { return !x.name.trim(); })) out.push('제품 카드에 이름을 적어 주세요.');
        if (!p.downside.trim()) out.push('아쉬운 점을 한 가지 이상 적어 주세요.');
      } else if (!p.body.trim()) out.push('본문을 적어 주세요.');
      if (!checklistDone()) out.push('올리기 전 점검표를 모두 체크해 주세요.');
      if (E.mode === 'schedule' && !E.scheduleAt) out.push('예약할 날짜와 시간을 골라 주세요.');
    }
    return out;
  }
  function checklistItems() {
    var p = E.post;
    var out = [];
    CHECKLIST.forEach(function (g) {
      var items = g[1].filter(function (it) {
        if (it[2] === 'review') return p.type === 'review';
        if (it[2] === 'link') return hasLinks();
        return true;
      });
      if (items.length) out.push([g[0], items]);
    });
    return out;
  }
  function checklistDone() {
    return checklistItems().every(function (g) { return g[1].every(function (it) { return E.check[it[0]]; }); });
  }

  function statusLine() {
    var p = E.post;
    if (!p.id) return '<span class="b st-draft">새 글</span>';
    var now = new Date().toISOString();
    if (p.status === 'scheduled' && p.publish_at > now) return '<span class="b st-scheduled">예약됨 · ' + esc(fmtDateTime(p.publish_at)) + ' 공개</span>';
    if (p.status === 'published' || p.status === 'scheduled') return '<span class="b st-published">공개 중 · ' + esc(fmtDate(p.publish_at)) + '</span> <a class="small" href="' + publicPath(p) + '" target="_blank" rel="noopener">공개 화면 보기 ↗</a>';
    return '<span class="b st-draft">초안</span>';
  }
  function publicPath(p) { return '/' + (p.type === 'diary' ? 'diary' : 'review') + '/' + p.id + (p.slug ? '-' + p.slug : ''); }

  function photoBox(id, act, label, pi) {
    var attr = pi != null ? ' data-pi="' + pi + '"' : '';
    return '<div class="photo">' +
      (id ? '<img src="/img/' + esc(id) + '" alt=""><div class="photo-btns"><button type="button" class="btn btn-sm btn-line" data-act="' + act + '"' + attr + '>바꾸기</button><button type="button" class="btn btn-sm btn-ghost" data-act="' + act + '-del"' + attr + '>빼기</button></div>'
        : '<button type="button" class="photo-add" data-act="' + act + '"' + attr + '><span>＋</span>' + esc(label) + '</button>') +
      '</div>';
  }

  function productHtml(x, i) {
    var p = E.post;
    var sug = suggestStage(x.bought_at);
    var stageHint = sug && sug !== x.stage
      ? '<p class="hint">산 날로 보면 <b>' + L.STAGES[sug] + '</b>예요. <button type="button" class="linkbtn" data-act="set" data-pf="stage" data-pi="' + i + '" data-v="' + sug + '">이걸로 바꾸기</button></p>' : '';
    var canLink = linkOk(x);
    var fus = (x.followups || []);
    return '<section class="card pcard" id="pc' + i + '">' +
      '<div class="card-hd"><b>' + (p.products.length > 1 ? '제품 ' + (i + 1) : '제품 카드') + '</b>' +
      (p.products.length > 1 ? '<span class="row-btns"><button type="button" class="icon" data-act="pup" data-pi="' + i + '" aria-label="위로">↑</button><button type="button" class="icon" data-act="pdown" data-pi="' + i + '" aria-label="아래로">↓</button><button type="button" class="icon danger" data-act="pdel" data-pi="' + i + '" aria-label="이 제품 빼기">✕</button></span>' : '') + '</div>' +
      '<label class="fl">이름<input data-pf="name" data-pi="' + i + '" value="' + esc(x.name) + '" placeholder="예: 2단 식기건조대" maxlength="80"></label>' +
      '<div class="two"><label class="fl">산 날<input type="date" data-pf="bought_at" data-pi="' + i + '" value="' + esc(x.bought_at) + '" max="' + today() + '"></label>' +
      '<label class="fl">값<select data-pf="price_band" data-pi="' + i + '"><option value="">고르기</option>' + L.PRICE_BANDS.map(function (b) { return '<option' + (b === x.price_band ? ' selected' : '') + '>' + esc(b) + '</option>'; }).join('') + '</select></label></div>' +
      '<label class="fl">산 곳<input data-pf="shop" data-pi="' + i + '" value="' + esc(x.shop) + '" placeholder="예: 온라인, 마트, 선물" list="shops" maxlength="30"></label>' +
      '<div class="fl">제품 사진 <span class="muted small">(없으면 대표 사진을 써요)</span>' + photoBox(x.photo_id, 'pphoto', '제품 사진 고르기', i) + '</div>' +
      '<div class="fl">판정' + seg('data-pf="verdict" data-pi="' + i + '"', entries(L.VERDICTS), x.verdict) + '</div>' +
      '<div class="fl">써 본 기간' + seg('data-pf="stage" data-pi="' + i + '"', entries(L.STAGES), x.stage) + stageHint + '</div>' +
      (x.stage === 'first' && x.verdict === 'buy' ? '<p class="warn">첫인상 글에는 \'다시 산다\'를 달지 않기로 했어요. 한 달 넘게 써 본 뒤에 판정해 주세요.</p>' : '') +
      '<div class="fl">지금도 쓰나요' + seg('data-pf="in_use" data-pi="' + i + '"', entries(L.IN_USE), x.in_use) + '</div>' +
      '<label class="fl">한 줄 평<input data-pf="one_line" data-pi="' + i + '" value="' + esc(x.one_line) + '" placeholder="예: 좁은 싱크대 옆에서 물때 걱정을 덜어 준 건조대" maxlength="120"></label>' +
      '<div class="fl">깐깐 체크 <span class="muted small">○ 좋음 · △ 보통 · ✕ 아쉬움 · 고르지 않은 항목은 공개 화면에 안 보여요</span>' +
      '<div class="checks">' + x.checks.map(function (c, j) {
        return '<div class="crow"><input class="clabel" data-cf="label" data-pi="' + i + '" data-ci="' + j + '" value="' + esc(c.label) + '" maxlength="20" aria-label="항목">' +
          '<div class="marks">' + entries(L.MARKS).map(function (m) {
            return '<button type="button" class="mk' + (c.mark === m[0] ? ' on mk-' + m[0] : '') + '" data-act="mark" data-pi="' + i + '" data-ci="' + j + '" data-v="' + m[0] + '" aria-label="' + m[0] + '">' + m[1] + '</button>';
          }).join('') + '</div>' +
          '<button type="button" class="icon minus" data-act="cdel" data-pi="' + i + '" data-ci="' + j + '" aria-label="이 항목 빼기" title="이 항목 빼기">−</button>' +
          '<input class="cnote" data-cf="note" data-pi="' + i + '" data-ci="' + j + '" value="' + esc(c.note) + '" placeholder="한 줄 이유" maxlength="100" aria-label="한 줄 이유"></div>';
      }).join('') + '</div>' +
      '<div class="row-btns left"><button type="button" class="btn btn-sm btn-line" data-act="cadd" data-pi="' + i + '">＋ 항목 추가</button><button type="button" class="btn btn-sm btn-ghost" data-act="cdefault" data-pi="' + i + '">기본 항목으로 다시 채우기</button></div></div>' +
      '<label class="fl">구매 링크 <span class="muted small">(쿠팡 파트너스 링크)</span><input type="url" inputmode="url" data-pf="link_url" data-pi="' + i + '" value="' + esc(x.link_url) + '" placeholder="' + (canLink ? 'https://link.coupang.com/a/...' : "'다시 산다' + 한 달 넘게 써 본 뒤에 달 수 있어요") + '"' + (canLink || x.link_url ? '' : ' disabled') + '></label>' +
      (x.link_url && !canLink ? '<p class="warn">지금 판정과 기간으로는 이 링크가 공개되지 않아요. 지우거나 판정을 다시 확인해 주세요.</p>' : '') +
      (x.id ? '<div class="fl">다시 쓰는 후기' + (fus.length ? '<ul class="fus">' + fus.map(function (f) {
        return '<li><span class="b b-stage">' + esc(L.POINTS[f.point] || '덧붙임') + '</span> <span class="muted small">' + esc(fmtDay(f.day)) + '</span>' + (f.skipped ? ' <span class="muted small">건너뜀</span>' : '') + (f.verdict ? ' ' + vBadge(f.verdict) : '') +
          '<p>' + esc(f.content).slice(0, 140) + '</p><button type="button" class="linkbtn danger" data-act="fudel" data-id="' + f.id + '">지우기</button></li>';
      }).join('') + '</ul>' : '<p class="muted small">아직 없어요.</p>') +
        (E.fu && E.fu.product_id === x.id ? fuForm(E.fu) : '<button type="button" class="btn btn-sm btn-line" data-act="fuopen" data-pi="' + i + '">＋ 지금 덧붙이기</button>') + '</div>'
        : '') +
      '</section>';
  }

  function fuForm(f) {
    return '<div class="fuform">' +
      '<div class="fl">언제 쓴 후기인가요' + seg('data-ff="point"', entries(L.POINTS), f.point) + '</div>' +
      '<label class="fl">날짜<input type="date" data-ff="day" value="' + esc(f.day) + '" max="' + today() + '"></label>' +
      '<label class="fl">덧붙일 내용<textarea data-ff="content" rows="4" placeholder="예: 한 달째 매일 써요. 물받이 홈에 물때가 조금 생겨요.">' + esc(f.content) + '</textarea></label>' +
      '<div class="fl">지금도 쓰나요' + seg('data-ff="in_use"', entries(L.IN_USE), f.in_use) + '</div>' +
      '<div class="fl">판정이 바뀌었나요' + seg('data-ff="verdict"', [['', '그대로']].concat(entries(L.VERDICTS)), f.verdict) + '</div>' +
      '<div class="row-btns left"><button type="button" class="btn btn-c btn-sm" data-act="fusave">덧붙이기</button>' +
      (f.point !== 'other' ? '<button type="button" class="btn btn-sm btn-line" data-act="fuskip">이번엔 건너뛰기</button>' : '') +
      '<button type="button" class="btn btn-sm btn-ghost" data-act="fuclose">닫기</button></div></div>';
  }

  function renderEditor(keep) {
    var p = E.post;
    var isReview = p.type === 'review';
    var watch = WATCH_WORDS.filter(function (w) { return (p.title + p.body + p.downside + p.products.map(function (x) { return x.one_line + x.checks.map(function (c) { return c.note; }).join(' '); }).join(' ')).indexOf(w) >= 0; });
    var probs = problems(true);
    var items = checklistItems();
    var html =
      '<div class="ed-status">' + statusLine() + '</div>' +
      (!p.id ? '<div class="fl">무엇을 쓰나요' + seg('data-f="type"', [['review', '픽키 리뷰'], ['diary', '살림 일기']], p.type) + '</div>' : '') +
      '<label class="fl">제목<input data-f="title" value="' + esc(p.title) + '" placeholder="' + (isReview ? '예: 식기건조대 셋을 써 보고 하나만 남긴 이유' : '예: 임신하고 나서 바뀐 주방 동선') + '" maxlength="120"></label>' +
      (isReview ?
        '<div class="fl">분야' + seg('data-f="category"', entries(L.CATS), p.category) + '</div>' +
        '<div class="two"><label class="fl">품목<input data-f="item" value="' + esc(p.item) + '" list="items" placeholder="고르거나 적기" maxlength="30"></label>' +
        '<label class="fl">시기 표시<select data-f="period"><option value="">없음</option>' + L.PERIODS.map(function (x) { return '<option' + (x === p.period ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></label></div>' +
        '<div class="fl">대가 관계' + seg('data-f="acquired"', [['own', '내 돈으로 샀다'], ['gift', '제공받았다']], p.acquired) +
        '<p class="hint">' + (p.acquired === 'gift' ? "글머리에 '제공받음'과 '업체에서 물건을 제공받아 써 보고 씁니다.'가 붙어요." : "글머리에 '내돈내산'이 붙어요.") + ' 구매 링크를 넣으면 \'수수료 링크\'와 쿠팡 문구도 자동으로 붙어요.</p></div>'
        : '') +
      '<div class="fl">대표 사진' + photoBox(p.cover_id, 'cover', '사진 고르기') + '</div>' +
      (isReview ? p.products.map(productHtml).join('') + '<button type="button" class="btn btn-line btn-full" data-act="padd">＋ 제품 추가 (여러 개를 비교한 글)</button>' : '') +
      '<div class="fl">본문' +
      '<div class="tools"><button type="button" data-act="md" data-v="h2">소제목</button><button type="button" data-act="md" data-v="b">굵게</button><button type="button" data-act="md" data-v="ul">목록</button><button type="button" data-act="md" data-v="img">사진 넣기</button><button type="button" data-act="md" data-v="a">링크</button></div>' +
      '<textarea id="body" data-f="body" rows="12" placeholder="' + (isReview ? '왜 샀나, 어떻게 골랐나, 써 보니, 맞는 집과 안 맞는 집…' : '그날의 살림 이야기를 적어 주세요.') + '">' + esc(p.body) + '</textarea>' +
      '<details class="help"><summary>쓰는 법</summary><p>## 소제목 · **굵게** · 줄 앞에 - 를 쓰면 목록 · 빈 줄로 문단 나누기. 구매 링크는 본문에 넣지 말고 제품 카드에 넣어 주세요.</p></details></div>' +
      (isReview ? '<label class="fl">아쉬운 점 <span class="req">꼭</span><textarea data-f="downside" rows="4" placeholder="- 생각보다 폭이 넓어요.">' + esc(p.downside) + '</textarea></label>' : '') +
      '<details class="more"><summary>검색과 주소 (적지 않아도 돼요)</summary>' +
      '<label class="fl">검색 설명<input data-f="summary" value="' + esc(p.summary) + '" placeholder="비워 두면 한 줄 평이나 본문 앞부분을 써요" maxlength="200"></label>' +
      '<label class="fl">주소 영문<input data-f="slug" value="' + esc(p.slug) + '" placeholder="예: dish-rack" maxlength="50" autocapitalize="off"></label>' +
      '<p class="hint">주소는 /' + (isReview ? 'review' : 'diary') + '/번호-영문 으로 만들어져요. 공개한 뒤에는 바꾸지 않는 게 좋아요.</p></details>' +
      (watch.length ? '<p class="warn">이런 말이 들어 있어요: <b>' + watch.map(esc).join(', ') + '</b>. 시험한 것처럼 들리거나 효능을 말하는 표현이 아닌지 한 번 더 봐 주세요.</p>' : '') +
      '<section class="card cl"><div class="card-hd"><b>올리기 전 점검표</b><span class="muted small">모두 체크해야 공개할 수 있어요</span></div>' +
      items.map(function (g) {
        return '<div class="clg"><h3>' + esc(g[0]) + '</h3>' + g[1].map(function (it) {
          return '<label class="ck"><input type="checkbox" data-chk="' + it[0] + '"' + (E.check[it[0]] ? ' checked' : '') + '> ' + esc(it[1]) + '</label>';
        }).join('') + '</div>';
      }).join('') + '</section>' +
      '<section class="card pub"><div class="fl">공개 방법' + seg('data-f="mode"', [['publish', '바로 공개'], ['schedule', '예약']], E.mode) + '</div>' +
      (E.mode === 'schedule' ? '<label class="fl">공개할 날짜와 시간<input type="datetime-local" data-f="scheduleAt" value="' + esc(E.scheduleAt) + '"></label><p class="hint">예약한 시간이 지나면 10분 안에 홈페이지에 보여요.</p>' : '') +
      (probs.length ? '<ul class="probs">' + probs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p class="ok">공개할 준비가 됐어요.</p>') +
      '</section>' +
      (p.id ? '<div class="danger-zone"><button type="button" class="linkbtn danger" data-act="delete">이 글 지우기</button></div>' : '') +
      '<datalist id="items">' + (L.ITEMS[p.category] || []).map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>' +
      '<datalist id="shops"><option value="온라인"><option value="쿠팡"><option value="마트"><option value="백화점"><option value="선물"></datalist>' +
      '<div class="bar"><button type="button" class="btn btn-line" data-act="preview">미리보기</button><button type="button" class="btn btn-line" data-act="save">초안 저장</button>' +
      '<button type="button" class="btn btn-c" data-act="publish"' + (probs.length ? ' aria-disabled="true"' : '') + '>' + (E.mode === 'schedule' ? '예약하기' : (p.status === 'published' ? '고친 내용 공개' : '공개하기')) + '</button></div>';
    var v = shell('posts', p.id ? '글 고치기' : (isReview ? '리뷰 쓰기' : '일기 쓰기'), html, { back: '#/', noTabs: true, keepScroll: keep ? window.scrollY : 0 });
    v.querySelectorAll('textarea').forEach(grow);
    bindEditor(v);
  }
  function grow(t) { t.style.height = 'auto'; t.style.height = Math.min(Math.max(t.scrollHeight + 2, 90), 1400) + 'px'; }

  function refreshChecks() {
    // 입력 중에는 전체를 다시 그리지 않고 아래쪽 안내만 바꿔요.
    var probs = problems(true);
    var pub = document.querySelector('.pub');
    if (!pub) return;
    var old = pub.querySelector('.probs, .ok');
    var html = probs.length ? '<ul class="probs">' + probs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p class="ok">공개할 준비가 됐어요.</p>';
    if (old) old.outerHTML = html;
    var btn = document.querySelector('.bar [data-act="publish"]');
    if (btn) { if (probs.length) btn.setAttribute('aria-disabled', 'true'); else btn.removeAttribute('aria-disabled'); }
  }

  function bindEditor(v) {
    v.addEventListener('input', function (e) {
      var t = e.target;
      var p = E.post;
      if (t.tagName === 'TEXTAREA') grow(t);
      if (t.hasAttribute('data-f')) {
        var f = t.getAttribute('data-f');
        if (f === 'scheduleAt') E.scheduleAt = t.value; else p[f] = t.value;
        E.dirty = true;
      } else if (t.hasAttribute('data-pf')) {
        var x = p.products[Number(t.getAttribute('data-pi'))];
        x[t.getAttribute('data-pf')] = t.value;
        E.dirty = true;
        if (t.getAttribute('data-pf') === 'bought_at') { renderEditor(true); return; }
      } else if (t.hasAttribute('data-cf')) {
        var c = p.products[Number(t.getAttribute('data-pi'))].checks[Number(t.getAttribute('data-ci'))];
        c[t.getAttribute('data-cf')] = t.value;
        E.dirty = true;
      } else if (t.hasAttribute('data-ff')) {
        E.fu[t.getAttribute('data-ff')] = t.value;
        return;
      } else if (t.hasAttribute('data-chk')) {
        E.check[t.getAttribute('data-chk')] = t.checked;
      }
      refreshChecks();
    });
    v.addEventListener('change', function (e) {
      var t = e.target;
      if (t.tagName === 'SELECT' || t.type === 'date' || t.type === 'checkbox') {
        // input 이벤트가 없는 브라우저 대비
        if (t.hasAttribute('data-f')) E.post[t.getAttribute('data-f')] = t.value;
        if (t.hasAttribute('data-pf')) E.post.products[Number(t.getAttribute('data-pi'))][t.getAttribute('data-pf')] = t.value;
        if (t.hasAttribute('data-chk')) E.check[t.getAttribute('data-chk')] = t.checked;
        E.dirty = true;
        refreshChecks();
      }
    });
    v.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      var p = E.post;
      var pi = b.hasAttribute('data-pi') ? Number(b.getAttribute('data-pi')) : -1;
      var ci = b.hasAttribute('data-ci') ? Number(b.getAttribute('data-ci')) : -1;
      var x = pi >= 0 ? p.products[pi] : null;
      var val = b.getAttribute('data-v');
      if (act === 'set') {
        if (b.hasAttribute('data-f')) {
          var f = b.getAttribute('data-f');
          if (f === 'mode') E.mode = val;
          else if (f === 'type') {
            p.type = val;
            if (val === 'review' && !p.products.length) p.products.push(newProduct(p.category));
          } else if (f === 'category') {
            var before = p.category;
            p.category = val;
            if (before !== val) {
              p.products.forEach(function (pr) {
                if (pr.checks.every(function (c) { return !c.note; })) pr.checks = newProduct(val).checks;
              });
              if (p.item && (L.ITEMS[before] || []).indexOf(p.item) >= 0) p.item = '';
            }
          } else p[f] = val;
        } else if (b.hasAttribute('data-pf')) {
          x[b.getAttribute('data-pf')] = val;
        } else if (b.hasAttribute('data-ff')) {
          E.fu[b.getAttribute('data-ff')] = val;
        }
        E.dirty = true;
        renderEditor(true);
        return;
      }
      if (act === 'mark') { x.checks[ci].mark = x.checks[ci].mark === val ? '' : val; E.dirty = true; renderEditor(true); return; }
      if (act === 'cdel') { x.checks.splice(ci, 1); E.dirty = true; renderEditor(true); return; }
      if (act === 'cadd') { x.checks.push({ label: '', mark: '', note: '' }); E.dirty = true; renderEditor(true); return; }
      if (act === 'cdefault') {
        if (x.checks.some(function (c) { return c.note; }) && !confirm('적어 둔 한 줄 이유가 지워져요. 기본 항목으로 다시 채울까요?')) return;
        x.checks = newProduct(p.category).checks; E.dirty = true; renderEditor(true); return;
      }
      if (act === 'padd') { p.products.push(newProduct(p.category)); E.dirty = true; renderEditor(true); return; }
      if (act === 'pdel') {
        if (!confirm("'" + (x.name || '이 제품') + "' 카드를 뺄까요?" + (x.id ? ' 이 제품의 다시 쓰는 후기도 함께 지워져요.' : ''))) return;
        p.products.splice(pi, 1); E.dirty = true; renderEditor(true); return;
      }
      if (act === 'pup' && pi > 0) { p.products.splice(pi - 1, 0, p.products.splice(pi, 1)[0]); renderEditor(true); return; }
      if (act === 'pdown' && pi < p.products.length - 1) { p.products.splice(pi + 1, 0, p.products.splice(pi, 1)[0]); renderEditor(true); return; }
      if (act === 'cover' || act === 'pphoto') {
        uploadPhoto().then(function (id) {
          if (!id) return;
          if (act === 'cover') p.cover_id = id; else x.photo_id = id;
          E.dirty = true; renderEditor(true);
        });
        return;
      }
      if (act === 'cover-del') { p.cover_id = ''; E.dirty = true; renderEditor(true); return; }
      if (act === 'pphoto-del') { x.photo_id = ''; E.dirty = true; renderEditor(true); return; }
      if (act === 'md') { markdown(val); return; }
      if (act === 'preview') { preview(); return; }
      if (act === 'save') { save('draft'); return; }
      if (act === 'publish') {
        var probs = problems(true);
        if (probs.length) { toast(probs[0], 'err'); var pub = document.querySelector('.pub'); if (pub) pub.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
        save(E.mode === 'schedule' ? 'schedule' : 'publish');
        return;
      }
      if (act === 'delete') {
        if (!confirm('이 글을 지울까요? 지운 글은 되살릴 수 없어요.')) return;
        api('DELETE', 'posts/' + p.id).then(function () { E.dirty = false; toast('글을 지웠어요.'); location.hash = '#/'; }).catch(function (er) { toast(er.message, 'err'); });
        return;
      }
      if (act === 'fuopen') {
        var done = (x.followups || []).map(function (f) { return f.point; });
        var point = x.stage === 'first' && done.indexOf('month') < 0 ? 'month' : (done.indexOf('six') < 0 && monthsSince(x.bought_at) >= 6 ? 'six' : 'other');
        E.fu = { product_id: x.id, point: point, day: today(), content: '', in_use: x.in_use || 'yes', verdict: '' };
        renderEditor(true); return;
      }
      if (act === 'fuclose') { E.fu = null; renderEditor(true); return; }
      if (act === 'fusave' || act === 'fuskip') {
        var body = clone(E.fu);
        if (act === 'fuskip') body.skipped = true;
        if (E.dirty && !confirm('고친 내용을 먼저 저장하지 않으면 사라질 수 있어요. 그래도 덧붙일까요?')) return;
        api('POST', 'followups', body).then(function () {
          toast(act === 'fuskip' ? '이번 후기는 건너뛰었어요.' : '후기를 덧붙였어요.');
          E.fu = null; E.dirty = false;
          viewEditor(String(p.id));
        }).catch(function (er) { toast(er.message, 'err'); });
        return;
      }
      if (act === 'fudel') {
        if (!confirm('이 후기를 지울까요?')) return;
        api('DELETE', 'followups/' + b.getAttribute('data-id')).then(function () { toast('지웠어요.'); viewEditor(String(p.id)); }).catch(function (er) { toast(er.message, 'err'); });
      }
    });
  }

  function markdown(kind) {
    var t = document.getElementById('body');
    if (!t) return;
    var s = t.selectionStart, e = t.selectionEnd, v = t.value, sel = v.slice(s, e);
    var insert = function (text, selFrom, selTo) {
      t.value = v.slice(0, s) + text + v.slice(e);
      E.post.body = t.value; E.dirty = true;
      t.focus();
      t.setSelectionRange(s + selFrom, s + selTo);
      grow(t);
    };
    var lineStart = v.lastIndexOf('\n', s - 1) + 1;
    if (kind === 'h2') {
      t.value = v.slice(0, lineStart) + '## ' + v.slice(lineStart);
      E.post.body = t.value; E.dirty = true; t.focus(); t.setSelectionRange(s + 3, e + 3); grow(t); return;
    }
    if (kind === 'ul') {
      t.value = v.slice(0, lineStart) + '- ' + v.slice(lineStart);
      E.post.body = t.value; E.dirty = true; t.focus(); t.setSelectionRange(s + 2, e + 2); grow(t); return;
    }
    if (kind === 'b') { var w = sel || '굵게 쓸 말'; insert('**' + w + '**', 2, 2 + w.length); return; }
    if (kind === 'a') {
      var url = prompt('링크 주소를 넣어 주세요 (https://...)\n구매 링크는 여기에 넣지 말고 제품 카드에 넣어 주세요.');
      if (!url) return;
      if (/coupang\.com|coupa\.ng/i.test(url)) { toast('구매 링크는 제품 카드의 구매 링크 칸에 넣어 주세요.', 'err'); return; }
      var label = sel || '링크';
      insert('[' + label + '](' + url.trim() + ')', 1, 1 + label.length);
      return;
    }
    if (kind === 'img') {
      uploadPhoto().then(function (id) {
        if (!id) return;
        v = t.value;
        var before = s > 0 && v[s - 1] !== '\n' ? '\n\n' : '';
        var text = before + '![사진 설명](/img/' + id + ')\n';
        t.value = v.slice(0, s) + text + v.slice(e);
        E.post.body = t.value; E.dirty = true;
        t.focus();
        var from = s + before.length + 2;
        t.setSelectionRange(from, from + 5);
        grow(t);
        toast("'사진 설명' 자리에 어떤 사진인지 적어 주세요.");
      });
    }
  }

  function payload(action) {
    var p = clone(E.post);
    p.action = action;
    p.checklist = checklistDone();
    if (action === 'schedule') p.publish_at = new Date(E.scheduleAt).toISOString();
    return p;
  }
  function save(action) {
    var bar = document.querySelector('.bar');
    if (bar) bar.classList.add('busy');
    api('POST', 'posts', payload(action)).then(function (r) {
      var wasNew = !E.post.id;
      E.post.id = r.id; E.post.status = r.status; E.post.publish_at = r.publish_at;
      E.dirty = false;
      toast(action === 'draft' ? '초안으로 저장했어요.' : action === 'schedule' ? '예약했어요. ' + fmtDateTime(r.publish_at) + '에 공개돼요.' : '공개했어요.');
      if (action !== 'draft') E.check = {};
      if (wasNew) { history.replaceState(null, '', '#/edit/' + r.id); lastHash = location.hash; }
      // 새로 생긴 제품 번호를 받으려고 다시 불러와요.
      return api('GET', 'posts/' + r.id).then(function (d) {
        var keepMode = E.mode, keepAt = E.scheduleAt;
        E = { post: d.post, dirty: false, check: E.check, mode: keepMode, scheduleAt: keepAt, fu: null };
        renderEditor(true);
      });
    }).catch(function (e) {
      toast(e.message, 'err');
      if (bar) bar.classList.remove('busy');
    });
  }
  function preview() {
    api('POST', 'preview', payload('draft')).then(function (r) {
      var wrap = document.createElement('div');
      wrap.className = 'modal';
      wrap.innerHTML = '<div class="modal-in"><div class="modal-hd"><b>미리보기</b><button type="button" class="btn btn-sm btn-line" data-close>닫기</button></div><iframe title="미리보기"></iframe></div>';
      document.body.appendChild(wrap);
      document.body.classList.add('noscroll');
      wrap.querySelector('iframe').srcdoc = r.text;
      wrap.addEventListener('click', function (e) {
        if (e.target === wrap || e.target.hasAttribute('data-close')) { wrap.remove(); document.body.classList.remove('noscroll'); }
      });
    }).catch(function (e) { toast(e.message, 'err'); });
  }

  // ───────── 다시 쓸 후기 ─────────
  var dueForm = null;
  function viewDue() {
    var v = shell('due', '다시 쓰는 후기', '<p class="muted pad">불러오는 중…</p>');
    api('GET', 'due').then(function (d) {
      shell.due = d.due.length;
      var row = function (it, isDue) {
        var open = dueForm && dueForm.product_id === it.product_id;
        return '<li class="card due">' +
          '<div class="due-top"><span class="pthumb">' + (it.photo_id ? '<img src="/img/' + esc(it.photo_id) + '" alt="">' : '') + '</span>' +
          '<div><b>' + esc(it.name) + '</b><div class="muted small">' + esc(it.post_title) + '</div>' +
          '<div class="pmeta"><span class="b ' + (isDue ? 'st-scheduled' : 'b-stage') + '">' + esc(L.POINTS[it.point]) + ' · ' + esc(fmtDay(it.due)) + (isDue ? '부터' : '쯤') + '</span>' + vBadge(it.verdict) + '</div></div></div>' +
          (open ? fuFormDue() : '<div class="row-btns left"><button type="button" class="btn btn-sm btn-c" data-act="open" data-id="' + it.product_id + '" data-point="' + it.point + '" data-use="' + esc(it.in_use) + '">덧붙이기</button>' +
            (isDue ? '<button type="button" class="btn btn-sm btn-ghost" data-act="skip" data-id="' + it.product_id + '" data-point="' + it.point + '">이번엔 건너뛰기</button>' : '') +
            '<a class="btn btn-sm btn-ghost" href="#/edit/' + it.post_id + '">글 열기</a></div>') +
          '</li>';
      };
      var html = '<p class="lead">산 날을 기준으로 한 달, 여섯 달이 된 물건이에요. 세 줄이면 충분하고, 건너뛰어도 돼요.</p>' +
        (d.due.length ? '<h2 class="h2">지금 쓸 때가 됐어요</h2><ul class="cards">' + d.due.map(function (it) { return row(it, true); }).join('') + '</ul>' : '<div class="empty">지금 다시 쓸 후기가 없어요.</div>') +
        (d.soon.length ? '<h2 class="h2">한 달 안에 돌아와요</h2><ul class="cards">' + d.soon.map(function (it) { return row(it, false); }).join('') + '</ul>' : '');
      v = shell('due', '다시 쓰는 후기', html);
      v.querySelectorAll('textarea').forEach(grow);
      v.addEventListener('input', function (e) {
        var t = e.target;
        if (t.hasAttribute('data-ff')) { dueForm[t.getAttribute('data-ff')] = t.value; if (t.tagName === 'TEXTAREA') grow(t); }
      });
      v.addEventListener('click', function (e) {
        var b = e.target.closest('[data-act]');
        if (!b) return;
        var act = b.getAttribute('data-act');
        if (act === 'open') { dueForm = { product_id: Number(b.getAttribute('data-id')), point: b.getAttribute('data-point'), day: today(), content: '', in_use: b.getAttribute('data-use') || 'yes', verdict: '' }; viewDue(); return; }
        if (act === 'set' && b.hasAttribute('data-ff')) { dueForm[b.getAttribute('data-ff')] = b.getAttribute('data-v'); var y = window.scrollY; viewDue(); setTimeout(function () { window.scrollTo(0, y); }, 60); return; }
        if (act === 'fuclose') { dueForm = null; viewDue(); return; }
        if (act === 'skip' || act === 'fuskip' || act === 'fusave') {
          var body = act === 'skip' ? { product_id: Number(b.getAttribute('data-id')), point: b.getAttribute('data-point'), skipped: true } : clone(dueForm);
          if (act === 'fuskip') body.skipped = true;
          api('POST', 'followups', body).then(function () {
            toast(body.skipped ? '이번 후기는 건너뛰었어요.' : '후기를 덧붙였어요.');
            dueForm = null; viewDue();
          }).catch(function (er) { toast(er.message, 'err'); });
        }
      });
    }).catch(function (e) { v.innerHTML = '<p class="err pad">' + esc(e.message) + '</p>'; });
  }
  function fuFormDue() { return fuForm(dueForm); }

  // ───────── 준비물 목록 ─────────
  function viewLists() {
    var v = shell('lists', '준비물 목록', '<p class="muted pad">불러오는 중…</p>');
    api('GET', 'lists').then(function (d) {
      var html = '<div class="new-btns"><a class="btn btn-c" href="#/list/new">＋ 새 목록</a></div>' +
        (d.lists.length ? '<ul class="plist">' + d.lists.map(function (l) {
          return '<li><a href="#/list/' + l.id + '"><span class="ptx"><b>' + esc(l.title) + '</b><span class="pmeta"><span class="b ' + (l.status === 'published' ? 'st-published' : 'st-draft') + '">' + (l.status === 'published' ? '공개' : '초안') + '</span><span class="muted small">' + l.n + '가지 · /list/' + esc(l.slug || l.id) + '</span></span></span></a></li>';
        }).join('') + '</ul>' : '<div class="empty">아직 목록이 없어요.</div>');
      shell('lists', '준비물 목록', html);
    }).catch(function (e) { v.innerHTML = '<p class="err pad">' + esc(e.message) + '</p>'; });
  }

  var LE = null;
  function viewListEdit(id) {
    shell('lists', '목록', '<p class="muted pad">불러오는 중…</p>', { back: '#/lists', noTabs: true });
    var load = id === 'new'
      ? Promise.resolve({ list: { id: 0, title: '', slug: '', intro: '', status: 'draft', items: [{ grp: '', name: '', state: 'choosing', note: '', post_id: 0 }] } })
      : api('GET', 'lists/' + id);
    Promise.all([load, api('GET', 'posts')]).then(function (r) {
      LE = { list: r[0].list, posts: r[1].posts.filter(function (p) { return p.status !== 'draft'; }), dirty: false };
      renderListEdit();
    }).catch(function (e) { toast(e.message, 'err'); location.hash = '#/lists'; });
  }
  function renderListEdit(keep) {
    var l = LE.list;
    var groups = [];
    l.items.forEach(function (it) { if (it.grp && groups.indexOf(it.grp) < 0) groups.push(it.grp); });
    var html =
      '<label class="fl">목록 이름<input data-lf="title" value="' + esc(l.title) + '" placeholder="예: 출산 준비물: 산 것, 미룬 것, 안 산 것" maxlength="80"></label>' +
      '<label class="fl">주소 영문<input data-lf="slug" value="' + esc(l.slug) + '" placeholder="예: birth" maxlength="50" autocapitalize="off"></label>' +
      '<label class="fl">소개<textarea data-lf="intro" rows="3" placeholder="이 목록을 어떻게 만들었는지 짧게">' + esc(l.intro) + '</textarea></label>' +
      '<div class="fl">공개' + seg('data-lf="status"', [['draft', '초안'], ['published', '공개']], l.status) + '</div>' +
      '<h2 class="h2">항목 ' + l.items.length + '가지</h2>' +
      '<ul class="cards">' + l.items.map(function (it, i) {
        return '<li class="card item">' +
          '<div class="two"><label class="fl">묶음<input data-if="grp" data-ii="' + i + '" value="' + esc(it.grp) + '" list="grps" placeholder="예: 수유" maxlength="30"></label>' +
          '<label class="fl">이름<input data-if="name" data-ii="' + i + '" value="' + esc(it.name) + '" placeholder="예: 젖병" maxlength="80"></label></div>' +
          '<div class="fl">상태' + seg('data-if="state" data-ii="' + i + '"', entries(L.LIST_STATES), it.state) + '</div>' +
          '<label class="fl">메모<input data-if="note" data-ii="' + i + '" value="' + esc(it.note) + '" placeholder="예: 솔을 빼서 삶을 수 있는 것으로" maxlength="200"></label>' +
          '<label class="fl">이어 줄 글<select data-if="post_id" data-ii="' + i + '"><option value="0">없음</option>' + LE.posts.map(function (p) { return '<option value="' + p.id + '"' + (Number(it.post_id) === p.id ? ' selected' : '') + '>' + esc(p.title) + '</option>'; }).join('') + '</select></label>' +
          '<div class="row-btns"><button type="button" class="icon" data-act="iup" data-ii="' + i + '" aria-label="위로">↑</button><button type="button" class="icon" data-act="idown" data-ii="' + i + '" aria-label="아래로">↓</button><button type="button" class="icon danger" data-act="idel" data-ii="' + i + '" aria-label="빼기">✕</button></div>' +
          '</li>';
      }).join('') + '</ul>' +
      '<button type="button" class="btn btn-line btn-full" data-act="iadd">＋ 항목 추가</button>' +
      '<datalist id="grps">' + groups.map(function (g) { return '<option value="' + esc(g) + '">'; }).join('') + '</datalist>' +
      (l.id ? '<div class="danger-zone"><button type="button" class="linkbtn danger" data-act="ldel">이 목록 지우기</button></div>' : '') +
      '<div class="bar"><a class="btn btn-line" href="' + (l.id && l.status === 'published' ? '/list/' + esc(l.slug || l.id) : '#') + '" target="_blank" rel="noopener"' + (l.id && l.status === 'published' ? '' : ' aria-disabled="true"') + '>공개 화면</a><button type="button" class="btn btn-c" data-act="lsave">저장</button></div>';
    var v = shell('lists', l.id ? '목록 고치기' : '새 목록', html, { back: '#/lists', noTabs: true, keepScroll: keep ? window.scrollY : 0 });
    v.querySelectorAll('textarea').forEach(grow);
    v.addEventListener('input', function (e) {
      var t = e.target;
      if (t.tagName === 'TEXTAREA') grow(t);
      if (t.hasAttribute('data-lf')) l[t.getAttribute('data-lf')] = t.value;
      if (t.hasAttribute('data-if')) l.items[Number(t.getAttribute('data-ii'))][t.getAttribute('data-if')] = t.value;
      LE.dirty = true;
    });
    v.addEventListener('change', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-if')) l.items[Number(t.getAttribute('data-ii'))][t.getAttribute('data-if')] = t.value;
      LE.dirty = true;
    });
    v.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      var i = Number(b.getAttribute('data-ii'));
      if (act === 'set') {
        if (b.hasAttribute('data-lf')) l[b.getAttribute('data-lf')] = b.getAttribute('data-v');
        if (b.hasAttribute('data-if')) l.items[i][b.getAttribute('data-if')] = b.getAttribute('data-v');
        LE.dirty = true; renderListEdit(true); return;
      }
      if (act === 'iadd') { var last = l.items[l.items.length - 1]; l.items.push({ grp: last ? last.grp : '', name: '', state: 'choosing', note: '', post_id: 0 }); LE.dirty = true; renderListEdit(true); return; }
      if (act === 'idel') { l.items.splice(i, 1); LE.dirty = true; renderListEdit(true); return; }
      if (act === 'iup' && i > 0) { l.items.splice(i - 1, 0, l.items.splice(i, 1)[0]); LE.dirty = true; renderListEdit(true); return; }
      if (act === 'idown' && i < l.items.length - 1) { l.items.splice(i + 1, 0, l.items.splice(i, 1)[0]); LE.dirty = true; renderListEdit(true); return; }
      if (act === 'lsave') {
        api('POST', 'lists', l).then(function (r) {
          LE.dirty = false; toast('목록을 저장했어요.');
          if (!l.id) { l.id = r.id; history.replaceState(null, '', '#/list/' + r.id); lastHash = location.hash; }
          renderListEdit(true);
        }).catch(function (er) { toast(er.message, 'err'); });
        return;
      }
      if (act === 'ldel') {
        if (!confirm('이 목록을 지울까요?')) return;
        api('DELETE', 'lists/' + l.id).then(function () { LE.dirty = false; toast('목록을 지웠어요.'); location.hash = '#/lists'; }).catch(function (er) { toast(er.message, 'err'); });
      }
    });
  }

  // ───────── 더 보기: 링크 점검, 숫자, 설정 ─────────
  function viewMore() {
    var showStats = store.get('pm-show-stats') === '1';
    var html = '<ul class="menu">' +
      '<li><a href="#/links"><b>링크 점검</b><span>구매 링크가 열리는지 한 달에 한 번 확인해요</span></a></li>' +
      (showStats ? '<li><a href="#/stats"><b>숫자</b><span>제품별 구매 링크 클릭 수</span></a></li>' : '') +
      '<li><a href="#/settings"><b>설정과 도움말</b><span>예시 글, 백업, 이 기기 설정, 쓰는 법</span></a></li>' +
      '</ul>' +
      '<button type="button" class="btn btn-line btn-full" data-act="logout">로그아웃</button>';
    var v = shell('more', '더 보기', html);
    v.addEventListener('click', function (e) { if (e.target.closest('[data-act="logout"]')) logout(); });
  }

  function viewLinks() {
    var v = shell('more', '링크 점검', '<p class="muted pad">불러오는 중…</p>', { back: '#/more' });
    api('GET', 'links').then(function (d) {
      var stale = function (day) {
        if (!day) return true;
        return (new Date(d.today) - new Date(day)) / 86400e3 > 30;
      };
      var html = '<p class="lead">링크를 열어 상품 페이지가 제대로 나오는지 보고, 결과를 눌러 주세요. 안 열린다고 표시한 링크는 홈페이지에서 숨겨져요.</p>' +
        (d.links.length ? '<ul class="cards">' + d.links.map(function (x) {
          var eligible = x.verdict === 'buy' && x.stage !== 'first';
          return '<li class="card link' + (x.link_broken ? ' broken' : '') + '">' +
            '<b>' + esc(x.name) + '</b><div class="muted small">' + esc(x.post_title) + '</div>' +
            '<div class="pmeta">' + (x.link_broken ? '<span class="b b-no">안 열림 · 숨김</span>' : stale(x.link_checked) ? '<span class="b st-scheduled">' + (x.link_checked ? '30일 넘게 확인 안 함' : '아직 확인 안 함') + '</span>' : '<span class="b st-published">' + esc(fmtDay(x.link_checked)) + ' 확인</span>') +
            (!eligible ? '<span class="b b-maybe">판정 때문에 공개 안 됨</span>' : '') + '</div>' +
            '<div class="row-btns left"><a class="btn btn-sm btn-line" href="' + esc(x.link_url) + '" target="_blank" rel="noopener noreferrer">열어 보기 ↗</a>' +
            '<button type="button" class="btn btn-sm btn-c" data-act="ok" data-id="' + x.id + '">열려요</button>' +
            '<button type="button" class="btn btn-sm btn-ghost" data-act="broken" data-id="' + x.id + '">안 열려요</button>' +
            '<a class="btn btn-sm btn-ghost" href="#/edit/' + x.post_id + '">글 열기</a></div></li>';
        }).join('') + '</ul>' : '<div class="empty">아직 구매 링크가 없어요.</div>');
      v = shell('more', '링크 점검', html, { back: '#/more' });
      v.addEventListener('click', function (e) {
        var b = e.target.closest('[data-act="ok"], [data-act="broken"]');
        if (!b) return;
        api('POST', 'links/' + b.getAttribute('data-id'), { state: b.getAttribute('data-act') }).then(function () { toast('표시했어요.'); viewLinks(); }).catch(function (er) { toast(er.message, 'err'); });
      });
    }).catch(function (e) { v.innerHTML = '<p class="err pad">' + esc(e.message) + '</p>'; });
  }

  function viewStats(days) {
    days = days || 30;
    var v = shell('more', '숫자', '<p class="muted pad">불러오는 중…</p>', { back: '#/more' });
    api('GET', 'stats?days=' + days).then(function (d) {
      var total = d.byDay.reduce(function (a, r) { return a + r.n; }, 0);
      var html = '<div class="filter">' + [[7, '7일'], [30, '30일'], [90, '90일'], [365, '1년']].map(function (x) {
        return '<button type="button" data-days="' + x[0] + '" class="' + (x[0] === d.days ? 'on' : '') + '">' + x[1] + '</button>';
      }).join('') + '</div>' +
        '<div class="stat"><b>' + total + '</b><span>최근 ' + d.days + '일 구매 링크 클릭</span></div>' +
        (d.products.length ? '<table class="tbl"><thead><tr><th>제품</th><th>' + d.days + '일</th><th>전체</th></tr></thead><tbody>' + d.products.map(function (x) {
          return '<tr><td>' + esc(x.name) + '<div class="muted small">' + esc(x.post_title) + '</div></td><td>' + x.n_period + '</td><td>' + x.n_total + '</td></tr>';
        }).join('') + '</tbody></table>' : '<div class="empty">아직 숫자가 없어요.</div>') +
        '<p class="muted small">방문자 수는 Cloudflare 대시보드의 Web Analytics에서 볼 수 있어요. 쿠팡 주문과 수익은 쿠팡 파트너스 리포트에서 확인해요.</p>';
      v = shell('more', '숫자', html, { back: '#/more' });
      v.addEventListener('click', function (e) {
        var b = e.target.closest('[data-days]');
        if (b) viewStats(Number(b.getAttribute('data-days')));
      });
    }).catch(function (e) { v.innerHTML = '<p class="err pad">' + esc(e.message) + '</p>'; });
  }

  function viewSettings() {
    var v = shell('more', '설정과 도움말', '<p class="muted pad">불러오는 중…</p>', { back: '#/more' });
    api('GET', 'status').then(function (s) {
      var noself = store.get('pm-noself') === '1';
      var showStats = store.get('pm-show-stats') === '1';
      var html =
        '<section class="card"><div class="card-hd"><b>연결 상태</b></div>' +
        '<ul class="kv"><li><span>데이터베이스(D1)</span><b class="okc">연결됨</b></li>' +
        '<li><span>사진 저장</span><b>' + (s.images === 'r2' ? 'R2 버킷' : 'D1 (R2 연결 안 함)') + '</b></li>' +
        '<li><span>글</span><b>' + s.counts.posts + '편</b></li><li><span>제품 카드</span><b>' + s.counts.products + '개</b></li><li><span>사진</span><b>' + s.counts.images + '장</b></li></ul></section>' +
        '<section class="card"><div class="card-hd"><b>이 기기</b></div>' +
        '<label class="ck"><input type="checkbox" data-pref="pm-noself"' + (noself ? ' checked' : '') + '> 이 기기에서 누른 구매 링크는 세지 않기</label>' +
        '<label class="ck"><input type="checkbox" data-pref="pm-show-stats"' + (showStats ? ' checked' : '') + "> '더 보기'에 숫자 메뉴 보이기</label>" +
        '<p class="hint">숫자는 쓰는 사람이 신경 쓰지 않도록 기본으로 숨겨 두었어요. 지원하는 쪽 기기에서만 켜 주세요.</p></section>' +
        '<section class="card"><div class="card-hd"><b>예시 글</b></div><p class="small">화면이 어떻게 보이는지 확인할 수 있게 초안 상태의 예시 글(리뷰 2편, 일기 1편, 출산 준비물 목록)을 넣어요. 공개되지 않고, 필요 없으면 지우면 돼요.</p><button type="button" class="btn btn-sm btn-line" data-act="samples">예시 글 넣기</button></section>' +
        '<section class="card"><div class="card-hd"><b>백업</b></div><p class="small">한 달에 한 번 내려받아 보관해 주세요. 글, 제품 카드, 후기, 목록이 들어 있어요. 사진 원본은 휴대폰 사진첩에 있어요.</p><button type="button" class="btn btn-sm btn-line" data-act="backup">백업 내려받기</button></section>' +
        '<section class="card help-card"><div class="card-hd"><b>쓰는 법</b></div>' +
        '<ul><li><b>판정</b>: 다시 산다 · 고민 중 · 안 산다. 구매 링크는 \'다시 산다\'이면서 한 달 넘게 써 본 물건에만 달 수 있어요.</li>' +
        '<li><b>써 본 기간</b>: 산 지 한 달이 안 됐으면 첫인상. 산 날을 넣으면 알맞은 기간을 알려 줘요.</li>' +
        '<li><b>깐깐 체크</b>: ○ 좋음, △ 보통, ✕ 아쉬움과 한 줄 이유. 시험한 것처럼 쓰지 않아요.</li>' +
        '<li><b>다시 쓰는 후기</b>: 산 날에서 한 달, 여섯 달이 되면 \'다시 쓰기\' 탭에 나타나요. 세 줄이면 충분해요.</li>' +
        '<li><b>본문</b>: ## 소제목, **굵게**, 줄 앞에 - 를 쓰면 목록. 빈 줄로 문단을 나눠요.</li>' +
        '<li><b>사진</b>: 올리면 휴대폰에서 크기를 줄이고 촬영 위치 정보를 지운 뒤 저장돼요.</li></ul></section>';
      v = shell('more', '설정과 도움말', html, { back: '#/more' });
      v.addEventListener('change', function (e) {
        var t = e.target;
        if (t.hasAttribute('data-pref')) {
          if (t.checked) store.set(t.getAttribute('data-pref'), '1'); else store.del(t.getAttribute('data-pref'));
          toast('바꿨어요.');
        }
      });
      v.addEventListener('click', function (e) {
        var b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.getAttribute('data-act') === 'samples') {
          if (!confirm('초안 상태의 예시 글을 넣을까요?')) return;
          api('POST', 'samples').then(function () { toast('예시 글을 넣었어요. 글 탭에서 확인해 보세요.'); }).catch(function (er) { toast(er.message, 'err'); });
        }
        if (b.getAttribute('data-act') === 'backup') {
          api('GET', 'backup', undefined, { raw: true }).then(function (res) {
            if (!res.ok) throw new Error('백업을 만들지 못했어요.');
            return res.blob();
          }).then(function (blob) {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'pickymom-backup-' + today() + '.json';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
          }).catch(function (er) { toast(er.message, 'err'); });
        }
      });
    }).catch(function (e) { v.innerHTML = '<p class="err pad">' + esc(e.message) + '</p>'; });
  }

  // ───────── 길 찾기 ─────────
  function dirty() { return (E && E.dirty && /^#\/edit\//.test(lastHash)) || (LE && LE.dirty && /^#\/list\//.test(lastHash)); }
  function route() {
    var h = location.hash || '#/';
    if (dirty() && h !== lastHash && !confirm('저장하지 않은 내용이 있어요. 나갈까요?')) {
      history.replaceState(null, '', lastHash);
      return;
    }
    if (E && h !== lastHash && !/^#\/edit\//.test(h)) E = null;
    if (LE && h !== lastHash && !/^#\/list\//.test(h)) LE = null;
    lastHash = h;
    if (!token()) { viewLogin(); return; }
    if (!L) {
      app.innerHTML = '<p class="boot">불러오는 중…</p>';
      api('GET', 'status').then(function (s) { L = s.labels; route(); }).catch(function (e) {
        app.innerHTML = '<div class="login"><div class="login-box"><p class="err">' + esc(e.message) + '</p><p class="muted small">Cloudflare 설정(D1 연결, ADMIN_PASSWORD)을 README대로 했는지 확인해 주세요.</p><button class="btn btn-line" onclick="location.reload()">다시 시도</button></div></div>';
      });
      return;
    }
    var m;
    if (h === '#/login') { location.hash = '#/'; return; }
    if ((m = h.match(/^#\/edit\/new\/(review|diary)$/))) return viewEditor('new', m[1]);
    if ((m = h.match(/^#\/edit\/(\d+)$/))) return viewEditor(m[1]);
    if (h === '#/due') return viewDue();
    if (h === '#/lists') return viewLists();
    if ((m = h.match(/^#\/list\/(new|\d+)$/))) return viewListEdit(m[1]);
    if (h === '#/more') return viewMore();
    if (h === '#/links') return viewLinks();
    if (h === '#/stats') return viewStats();
    if (h === '#/settings') return viewSettings();
    return viewPosts();
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', function (e) {
    if (dirty()) { e.preventDefault(); e.returnValue = ''; }
  });
  route();
})();
