"""Apply v0.4.14 patches to Blossom Chat desktop client.
Run from clients/desktop directory.
Idempotent.
"""
import re, sys, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HTML = ROOT / 'renderer' / 'index.html'
CSS  = ROOT / 'renderer' / 'styles' / 'app.css'
JS   = ROOT / 'renderer' / 'js' / 'app.js'

def patch(p, old, new, required=True):
    text = p.read_text(encoding='utf-8')
    if old not in text:
        if required:
            raise SystemExit(f'PATCH FAIL [{p.name}]: not found:\n---\n{old[:200]}\n---')
        return False
    if new in text and old != new:
        # already applied (heuristic)
        pass
    text2 = text.replace(old, new, 1)
    p.write_text(text2, encoding='utf-8', newline='\n')
    return True

# ── 1. composer 강제 노출: hidden 속성 제거하고 CSS로 제어 ──
patch(HTML,
      '<footer class="composer" id="composer" hidden>',
      '<footer class="composer" id="composer">')

# 빈 상태일 때만 CSS로 숨김
if 'body.no-active-room .composer' not in CSS.read_text(encoding='utf-8'):
    CSS.write_text(
        CSS.read_text(encoding='utf-8') +
        '\n/* 활성 방 없을 때 composer 숨김 (defensive) */\n'
        'body.no-active-room .composer { display: none !important; }\n',
        encoding='utf-8', newline='\n')

# JS: composer.hidden 사용하던 부분을 body 클래스 토글로 교체
js = JS.read_text(encoding='utf-8')
js = js.replace("$('emptyHint').hidden = true;\n    $('composer').hidden = false;",
                "$('emptyHint').hidden = true;\n    $('composer').hidden = false;\n    document.body.classList.remove('no-active-room');")
js = js.replace("$('emptyHint').hidden = false;\n        $('composer').hidden = true;",
                "$('emptyHint').hidden = false;\n        $('composer').hidden = true;\n        document.body.classList.add('no-active-room');")
JS.write_text(js, encoding='utf-8', newline='\n')

# ── 2. 사이드바 섹션 헤더: caret 제거, +버튼 유지, 클릭으로 접기/펼치기 (이미 click 동작 존재 가정)
# index.html: caret svg 제거 + 글리프-아이콘 흰색 유지 + 헤더 배경 투명 유지
patch(HTML,
      '<button class="section-toggle" data-target="channelList" aria-expanded="true">\n'
      '              <svg class="caret" viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>\n'
      '              <img class="section-icon" src="assets/svg/chat/free-icon-font-channel.svg" alt="" aria-hidden="true" />\n'
      '              Channel',
      '<button class="section-toggle" data-target="channelList" aria-expanded="true">\n'
      '              <img class="section-icon" src="assets/svg/chat/free-icon-font-channel.svg" alt="" aria-hidden="true" />\n'
      '              Channel')

patch(HTML,
      '<button class="section-toggle" data-target="dmList" aria-expanded="true">\n'
      '              <svg class="caret" viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>\n'
      '              <img class="section-icon" src="assets/svg/chat/free-icon-font-comment.svg" alt="" aria-hidden="true" />\n'
      '              Direct Message',
      '<button class="section-toggle" data-target="dmList" aria-expanded="true">\n'
      '              <img class="section-icon" src="assets/svg/chat/free-icon-font-comment.svg" alt="" aria-hidden="true" />\n'
      '              Direct Message')

# CSS: 섹션 헤더 - 흰 반투명 배경
css = CSS.read_text(encoding='utf-8')
if '.side-section-head { background: rgba' not in css:
    css = css.replace(
        '.side-section-head {\n'
        '  display: flex;\n'
        '  align-items: center;\n'
        '  justify-content: space-between;\n'
        '  padding: 4px 16px 4px 14px;\n'
        '  color: var(--sidebar-section-fg);\n'
        '  font-size: 13px;\n'
        '}',
        '.side-section-head {\n'
        '  display: flex;\n'
        '  align-items: center;\n'
        '  justify-content: space-between;\n'
        '  padding: 6px 12px 6px 12px;\n'
        '  margin: 4px 8px 2px;\n'
        '  background: rgba(255,255,255,0.10);\n'
        '  border-radius: 6px;\n'
        '  color: #ffffff;\n'
        '  font-size: 13px;\n'
        '}')
    CSS.write_text(css, encoding='utf-8', newline='\n')

# ── 3. 좌측 레일 아이콘 교체: 설정 / 프로필 + 신규(잠금/로그아웃/트레이/종료/달력)
# 기존 설정 SVG 교체
patch(HTML,
      '<button class="rail-btn" id="btnSettings" title="설정" aria-label="설정">\n'
      '        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.7 7.7 0 0 0 0-2l2-1.6a.5.5 0 0 0 .1-.6l-2-3.5a.5.5 0 0 0-.6-.2l-2.4 1a7.5 7.5 0 0 0-1.6-1L14.5 3a.5.5 0 0 0-.5-.4h-4a.5.5 0 0 0-.5.4l-.4 2.6a7.6 7.6 0 0 0-1.6 1l-2.4-1a.5.5 0 0 0-.6.2l-2 3.5a.5.5 0 0 0 .1.6L4.6 11a7.7 7.7 0 0 0 0 2L2.5 14.5a.5.5 0 0 0-.1.6l2 3.5a.5.5 0 0 0 .6.2l2.4-1a7.5 7.5 0 0 0 1.6 1l.4 2.6a.5.5 0 0 0 .5.4h4a.5.5 0 0 0 .5-.4l.4-2.6a7.5 7.5 0 0 0 1.6-1l2.4 1a.5.5 0 0 0 .6-.2l2-3.5a.5.5 0 0 0-.1-.6L19.4 13zM12 15.5a3.5 3.5 0 1 1 3.5-3.5 3.5 3.5 0 0 1-3.5 3.5z"/></svg>\n'
      '      </button>',
      '<button class="rail-btn rail-icon-img" id="btnSettings" title="설정" aria-label="설정">\n'
      '        <img src="assets/svg/chat/free-icon-font-settings.svg" alt="" />\n'
      '      </button>')

# 프로필 (avatar는 유지하지만 user 아이콘 fallback 추가용)
patch(HTML,
      '<button class="rail-btn rail-me" id="btnProfile" title="내 프로필" aria-label="내 프로필">\n'
      '        <span class="avatar avatar-sm" id="meAvatar"></span>\n'
      '      </button>',
      '<button class="rail-btn rail-me" id="btnProfile" title="내 프로필" aria-label="내 프로필">\n'
      '        <span class="avatar avatar-sm" id="meAvatar"></span>\n'
      '        <img class="rail-profile-fallback" src="assets/svg/chat/free-icon-font-circle-user.svg" alt="" hidden />\n'
      '      </button>')

# 레일에 잠금/로그아웃/트레이/종료/달력 버튼 추가 (설정 버튼 위에)
patch(HTML,
      '<div class="rail-grow"></div>\n'
      '      <button class="rail-btn rail-icon-img" id="btnSettings"',
      '<div class="rail-grow"></div>\n'
      '      <button class="rail-btn rail-icon-img" id="btnCalendar" title="달력" aria-label="달력">\n'
      '        <img src="assets/svg/chat/free-icon-font-calendar-clock.svg" alt="" />\n'
      '      </button>\n'
      '      <button class="rail-btn rail-icon-img" id="btnLock" title="잠금" aria-label="잠금">\n'
      '        <img src="assets/svg/chat/free-icon-font-unlock.svg" alt="" />\n'
      '      </button>\n'
      '      <button class="rail-btn rail-icon-img" id="btnLogoutRail" title="로그아웃" aria-label="로그아웃">\n'
      '        <img src="assets/svg/chat/free-icon-font-user-logout.svg" alt="" />\n'
      '      </button>\n'
      '      <button class="rail-btn rail-icon-img" id="btnTrayHide" title="트레이로 숨기기" aria-label="트레이로 숨기기">\n'
      '        <img src="assets/svg/chat/free-icon-font-holding-hand-dinner.svg" alt="" />\n'
      '      </button>\n'
      '      <button class="rail-btn rail-icon-img" id="btnQuit" title="종료" aria-label="종료">\n'
      '        <img src="assets/svg/chat/free-icon-font-exit-alt.svg" alt="" />\n'
      '      </button>\n'
      '      <button class="rail-btn rail-icon-img" id="btnSettings"')

# CSS: rail-icon-img — img를 흰색으로 표시
css = CSS.read_text(encoding='utf-8')
if '.rail-icon-img img' not in css:
    css += (
        '\n/* 레일 이미지 아이콘 */\n'
        '.rail-icon-img { display: flex; align-items: center; justify-content: center; }\n'
        '.rail-icon-img img { width: 22px; height: 22px; filter: invert(1) brightness(1) opacity(.85); pointer-events: none; }\n'
        '.rail-icon-img:hover img { opacity: 1; }\n'
    )
    CSS.write_text(css, encoding='utf-8', newline='\n')

# ── 4. 로그인 모달 배경 이미지 ──
css = CSS.read_text(encoding='utf-8')
if 'login-bg-image' not in css:
    css += (
        '\n/* 로그인 배경 이미지 */\n'
        '#loginModal {\n'
        '  background: #000 url("../assets/login/america5.jpg") center/cover no-repeat;\n'
        '}\n'
        '#loginModal::before {\n'
        '  content: ""; position: absolute; inset: 0;\n'
        '  background: rgba(15, 18, 35, 0.55);\n'
        '  backdrop-filter: blur(2px);\n'
        '  pointer-events: none;\n'
        '}\n'
        '#loginModal .modal-card.login-card {\n'
        '  position: relative; z-index: 1;\n'
        '  background: rgba(20, 24, 40, 0.85);\n'
        '  backdrop-filter: blur(12px);\n'
        '  border: 1px solid rgba(255,255,255,0.12);\n'
        '}\n'
        '/* sentinel: login-bg-image */\n'
    )
    CSS.write_text(css, encoding='utf-8', newline='\n')

# ── 5. JS: 신규 버튼 핸들러 (잠금/로그아웃/트레이/종료/달력/메모) ──
js = JS.read_text(encoding='utf-8')
sentinel = '// === BLOSSOM_RAIL_HANDLERS_v1 ==='
if sentinel not in js:
    addon = '''

// === BLOSSOM_RAIL_HANDLERS_v1 ===
(function bindRailExtras() {
  const $$ = (id) => document.getElementById(id);

  const btnLogoutRail = $$('btnLogoutRail');
  if (btnLogoutRail) {
    btnLogoutRail.addEventListener('click', () => {
      const btn = $$('btnLogout');
      if (btn) btn.click();
      else if (typeof logout === 'function') logout();
      else { try { localStorage.removeItem('blossom:token'); } catch(_){}; location.reload(); }
    });
  }

  const btnTrayHide = $$('btnTrayHide');
  if (btnTrayHide) {
    btnTrayHide.addEventListener('click', () => {
      try {
        if (window.blossomAPI && typeof window.blossomAPI.hideToTray === 'function') {
          window.blossomAPI.hideToTray();
        } else if (window.blossomAPI && typeof window.blossomAPI.minimize === 'function') {
          window.blossomAPI.minimize();
        }
      } catch (e) { console.warn('tray hide:', e); }
    });
  }

  const btnQuit = $$('btnQuit');
  if (btnQuit) {
    btnQuit.addEventListener('click', () => {
      if (!confirm('Blossom Chat을 종료하시겠습니까?')) return;
      try {
        if (window.blossomAPI && typeof window.blossomAPI.quit === 'function') {
          window.blossomAPI.quit();
        } else if (window.close) {
          window.close();
        }
      } catch (e) { console.warn('quit:', e); }
    });
  }

  const btnLock = $$('btnLock');
  if (btnLock) {
    btnLock.addEventListener('click', () => {
      // 간이 잠금: 로그인 화면으로 다시 이동 (세션은 유지)
      const loginModal = $$('loginModal');
      const appShell = $$('appShell');
      if (loginModal) loginModal.hidden = false;
      if (appShell) appShell.hidden = true;
      const pw = $$('loginPassword'); if (pw) { pw.value = ''; pw.focus(); }
    });
  }

  const btnCalendar = $$('btnCalendar');
  if (btnCalendar) {
    btnCalendar.addEventListener('click', () => {
      // 추후 달력 패널 토글 — 현재는 알림만
      if (typeof toast === 'function') toast('달력은 다음 버전에서 제공됩니다.', 'info');
      else alert('달력은 다음 버전에서 제공됩니다.');
    });
  }
})();
'''
    js += addon
    JS.write_text(js, encoding='utf-8', newline='\n')

print('PATCHED OK')
