/* Blossom Chat - Mobile Shell
 * 모바일(폰) 전용 네이티브 앱 패턴 적용:
 *  - 상단 앱바 (제목 + 뒤로가기)
 *  - 하단 탭바 (채팅/동료/달력/메모/더보기)
 *  - 마스터-디테일 (채널 목록 ↔ 대화 화면 전환)
 *  - 데스크톱 .rail 버튼을 프록시 호출하여 기존 app.js 로직 재사용
 *
 * 모든 동작은 (max-width: 720px) 환경에서만 활성화.
 */
(function () {
  'use strict';

  // v0.4.40: Capacitor 모바일 클라이언트는 뷰포트 폭과 무관하게 항상 모바일 셸 활성화.
  // (랜드스케이프(>720px)에서도 하단 탭바 / 풀스크린 모달 적용)

  var $ = function (id) { return document.getElementById(id); };

  // ── 모바일 모드 마킹 ──
  document.documentElement.classList.add('m-mobile');
  document.body.dataset.mView = 'list';        // 'list' | 'conv' | 'full'
  document.body.dataset.mTab = 'chat';

  // ── 상단 앱바 주입 ──
  var topbar = document.createElement('header');
  topbar.className = 'm-topbar';
  topbar.innerHTML = ''
    + '<button class="m-topbar-btn m-back" id="mBack" aria-label="뒤로">'
    +   '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M15.5 4.5L13.6 2.6 4.2 12l9.4 9.4 1.9-1.9L8 12z"/></svg>'
    + '</button>'
    + '<h1 class="m-topbar-title" id="mTitle">Blossom Chat</h1>'
    + '<button class="m-topbar-btn m-action" id="mTopAction" aria-label="더보기" hidden>'
    +   '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>'
    + '</button>';

  // ── 하단 탭바 주입 ──
  var tabbar = document.createElement('nav');
  tabbar.className = 'm-tabbar';
  tabbar.setAttribute('role', 'tablist');
  var TABS = [
    { id: 'chat',     label: '채팅',  icon: 'M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z' },
    { id: 'people',   label: '동료',  icon: 'M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-8 0a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-2.7 0-8 1.3-8 4v3h10v-3a4.4 4.4 0 0 1 1.4-3.2A14 14 0 0 0 8 13zm8 0a13.6 13.6 0 0 0-1.6.1A4.5 4.5 0 0 1 16 17v3h8v-3c0-2.7-5.3-4-8-4z' },
    { id: 'calendar', label: '달력',  icon: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z' },
    { id: 'memo',     label: '메모',  icon: 'M3 17.25V21h3.75l11-11-3.75-3.75-11 11zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z' },
    { id: 'more',     label: '더보기', icon: 'M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z' }
  ];
  TABS.forEach(function (t) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'm-tab';
    b.dataset.mtab = t.id;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', t.label);
    b.innerHTML = ''
      + '<svg class="m-tab-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="' + t.icon + '"/></svg>'
      + '<span class="m-tab-label">' + t.label + '</span>';
    tabbar.appendChild(b);
  });

  // ── 더보기 시트 (잠금/숨기기/종료/설정/프로필) ──
  var moreSheet = document.createElement('div');
  moreSheet.className = 'm-sheet';
  moreSheet.id = 'mMoreSheet';
  moreSheet.hidden = true;
  moreSheet.innerHTML = ''
    + '<div class="m-sheet-backdrop" data-close-sheet></div>'
    + '<div class="m-sheet-card">'
    +   '<div class="m-sheet-grip"></div>'
    +   '<div class="m-sheet-title">더보기</div>'
    +   '<ul class="m-sheet-list">'
    +     '<li data-proxy="btnProfile">내 프로필</li>'
    +     '<li data-proxy="btnSettings">설정</li>'
    +     '<li data-proxy="btnLock">잠금</li>'
    +     '<li data-proxy="btnTrayHide">트레이로 숨기기</li>'
    +     '<li data-proxy="btnQuit" class="m-sheet-danger">앱 종료</li>'
    +   '</ul>'
    +   '<button class="m-sheet-cancel" data-close-sheet>닫기</button>'
    + '</div>';

  // ── DOM 부착 ──
  function attach() {
    document.body.insertBefore(topbar, document.body.firstChild);
    document.body.appendChild(tabbar);
    document.body.appendChild(moreSheet);
    syncShellVisibility();
  }
  if (document.body) attach();
  else document.addEventListener('DOMContentLoaded', attach);

  // ── 셸(상단/하단 바) 가시성: 로그인 전에는 숨김 ──
  function syncShellVisibility() {
    var shell = $('appShell');
    var loggedIn = shell && !shell.hidden;
    topbar.hidden = !loggedIn;
    tabbar.hidden = !loggedIn;
    document.body.classList.toggle('m-pre-login', !loggedIn);
  }
  // appShell hidden 속성 변화 감시 → 로그인/로그아웃 즉시 반영
  (function watchShell() {
    var attempt = function () {
      var shell = $('appShell');
      if (!shell) { setTimeout(attempt, 50); return; }
      syncShellVisibility();
      new MutationObserver(syncShellVisibility)
        .observe(shell, { attributes: true, attributeFilter: ['hidden'] });
    };
    attempt();
  })();

  // ── 뷰 전환 ──
  function setView(name) {
    document.body.dataset.mView = name;
    if (name === 'list') {
      $('mBack').hidden = true;
      $('mTopAction').hidden = true;
      updateTitleForTab(document.body.dataset.mTab);
    } else if (name === 'conv') {
      $('mBack').hidden = false;
      $('mTopAction').hidden = false;
      var t = $('convTitle');
      if (t) $('mTitle').textContent = (t.textContent || '대화').trim();
      // v0.4.42: conv 진입 시 컴포저 강제 표시
      try { document.body.classList.remove('no-active-room'); } catch (_) {}
      var cp = $('composer');
      if (cp) {
        cp.hidden = false;
        cp.removeAttribute('hidden');
        cp.style.display = '';
      }
      // 대화 서브탭으로 강제 전환 (입력창 노출 보장)
      try {
        if (typeof window.setActiveRoomTab === 'function') window.setActiveRoomTab('chat');
        var chatTab = document.querySelector('.room-tab[data-room-tab="chat"]');
        if (chatTab) chatTab.click();
      } catch (_) {}
    } else if (name === 'full') {
      $('mBack').hidden = true;
      $('mTopAction').hidden = true;
    }
  }

  function updateTitleForTab(tab) {
    var titles = { chat: '채팅', people: '동료', calendar: '달력', memo: '메모', more: '더보기' };
    $('mTitle').textContent = titles[tab] || 'Blossom Chat';
  }

  function setTab(name) {
    document.body.dataset.mTab = name;
    // 활성 탭 표시
    Array.prototype.forEach.call(tabbar.querySelectorAll('.m-tab'), function (b) {
      b.classList.toggle('active', b.dataset.mtab === name);
    });
    if (name === 'more') {
      moreSheet.hidden = false;
      requestAnimationFrame(function () { moreSheet.classList.add('open'); });
      return;
    }
    if (name === 'chat' || name === 'people') {
      // 데스크톱 rail 버튼 클릭으로 위임 → 기존 setTab 로직 재사용
      var rb = document.querySelector('.rail-btn[data-tab="' + name + '"]');
      if (rb) rb.click();
      setView('list');
    } else if (name === 'calendar') {
      var c = $('btnCalendar'); if (c) c.click();
      setView('full');
    } else if (name === 'memo') {
      var m = $('btnMemo'); if (m) m.click();
      setView('full');
    }
    updateTitleForTab(name);
  }

  // ── 이벤트: 탭 클릭 ──
  tabbar.addEventListener('click', function (e) {
    var btn = e.target.closest('.m-tab');
    if (!btn) return;
    setTab(btn.dataset.mtab);
  });

  // ── 이벤트: 뒤로가기 ──
  $('mBack') || document.addEventListener('DOMContentLoaded', function () {});
  document.addEventListener('click', function (e) {
    var t = e.target.closest('#mBack');
    if (!t) return;
    setView('list');
  });

  // ── 이벤트: 더보기 시트 ──
  moreSheet.addEventListener('click', function (e) {
    if (e.target.matches('[data-close-sheet]')) {
      moreSheet.classList.remove('open');
      setTimeout(function () { moreSheet.hidden = true; }, 220);
      // 더보기 탭 비활성화 후 이전 탭 복귀
      setTab(document.body.dataset.mTab === 'more' ? 'chat' : document.body.dataset.mTab);
      return;
    }
    var li = e.target.closest('[data-proxy]');
    if (!li) return;
    var id = li.dataset.proxy;
    var target = $(id);
    moreSheet.classList.remove('open');
    setTimeout(function () { moreSheet.hidden = true; }, 220);
    setTab('chat');
    if (target) target.click();
  });

  // ── 채널/사람 클릭 시 대화 화면으로 전환 ──
  document.addEventListener('click', function (e) {
    var li = e.target.closest('.conv-list > li, .people-list > li');
    if (!li) return;
    // 약간의 지연 후 제목 반영 (openRoom 비동기)
    setTimeout(function () {
      setView('conv');
    }, 30);
  });

  // ── 상단 액션(더보기 점) → 데스크톱 conv 메뉴로 위임 ──
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#mTopAction')) return;
    var c = $('btnConvMenu');
    if (c) c.click();
  });

  // ── 사이드바/메인페인 표시 제어 (CSS data-m-view에 의존하지만 hidden 속성 보정) ──
  // app.js의 setTab이 sb.hidden / mp.hidden을 토글하기 때문에 chat/people 진입 시 둘 다 보이도록 보장
  function ensureVisibilityForList() {
    var sb = $('sidebar'); if (sb) sb.hidden = false;
    var mp = document.querySelector('section.main-pane'); if (mp) mp.hidden = false;
  }

  // 초기: 채팅 탭으로 시작
  document.addEventListener('DOMContentLoaded', function () {
    // 로그인 후 appShell이 표시되면 초기 탭 설정
    var observer = new MutationObserver(function () {
      var shell = $('appShell');
      if (shell && !shell.hidden) {
        ensureVisibilityForList();
        Array.prototype.forEach.call(tabbar.querySelectorAll('.m-tab'), function (b) {
          b.classList.toggle('active', b.dataset.mtab === 'chat');
        });
        setView('list');
        updateTitleForTab('chat');
        observer.disconnect();
      }
    });
    var sh = $('appShell');
    if (sh) observer.observe(sh, { attributes: true, attributeFilter: ['hidden'] });
  });
})();
