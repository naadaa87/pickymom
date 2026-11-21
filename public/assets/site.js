// 픽키맘 공개 화면 스크립트
(function () {
  'use strict';
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* 저장 안 되는 브라우저 */ } },
    del: function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* 무시 */ } },
  };

  // 구매 링크 클릭 수 (날짜별 합계만 세요. 관리 화면에서 '이 기기 빼기'를 켠 기기는 세지 않아요)
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-p]');
    if (!a || store.get('pm-noself') === '1') return;
    var data = JSON.stringify({ p: Number(a.getAttribute('data-p')) });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon('/api/click', new Blob([data], { type: 'application/json' }));
      else fetch('/api/click', { method: 'POST', headers: { 'content-type': 'application/json' }, body: data, keepalive: true });
    } catch (err) { /* 세지 못해도 이동은 그대로 */ }
  });

  // 준비물 목록: 체크는 이 기기에만 저장
  var page = document.querySelector('.list-page');
  if (page) {
    var key = 'pm-list:' + page.getAttribute('data-list');
    var saved = {};
    try { saved = JSON.parse(store.get(key) || '{}') || {}; } catch (e) { saved = {}; }
    var boxes = page.querySelectorAll('input[type="checkbox"][data-k]');
    var paint = function (box) { box.closest('li').classList.toggle('done', box.checked); };
    boxes.forEach(function (box) {
      box.checked = !!saved[box.getAttribute('data-k')];
      paint(box);
      box.addEventListener('change', function () {
        if (box.checked) saved[box.getAttribute('data-k')] = 1; else delete saved[box.getAttribute('data-k')];
        store.set(key, JSON.stringify(saved));
        paint(box);
      });
    });
    var chips = page.querySelectorAll('.list-filter [data-f]');
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var f = chip.getAttribute('data-f');
        chips.forEach(function (c) { c.classList.toggle('on', c === chip); c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
        page.querySelectorAll('.li li').forEach(function (li) { li.hidden = !!f && li.getAttribute('data-state') !== f; });
        page.querySelectorAll('.lg').forEach(function (g) {
          g.hidden = !g.querySelector('.li li:not([hidden])');
        });
      });
    });
    page.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.getAttribute('data-act') === 'print') window.print();
      if (btn.getAttribute('data-act') === 'clear' && window.confirm('이 기기에 남긴 체크를 모두 지울까요?')) {
        saved = {};
        store.del(key);
        boxes.forEach(function (box) { box.checked = false; paint(box); });
      }
    });
  }
})();
