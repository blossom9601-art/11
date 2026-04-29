// Blossom Chat — 데스크탑 (web /addon/chat 와 동기화)
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // v0.4.32: 하드코딩 서버 주소 제거 — 최초 로그인 시 사용자가 입력
  const DEFAULT_SERVER_URL = '';
  const POLL_INTERVAL_MS = 1000;
  const IDLE_LOCK_EVENTS = ['pointerdown', 'keydown', 'scroll', 'click', 'touchstart', 'wheel'];
  function getIdleLockMs() {
    let m = parseInt((state.settings && state.settings.autoLockMin) || 30, 10);
    if (isNaN(m) || m < 1) m = 30;
    if (m > 240) m = 240;
    return m * 60 * 1000;
  }
  const LOCK_REASON_TEXT = {
    idle_auto: '30분 이상 미사용으로 자동 잠금되었습니다.',
    manual: '수동으로 잠금하셨습니다.',
    admin: '관리자에 의해 채팅이 잠금되었습니다.',
    session_expired: '세션이 만료되어 잠금 화면으로 전환되었습니다.',
  };
  const PIN_MASK = '******';

  const state = {
    serverUrl: '',
    me: null,
    profile: null,
    currentUserId: null,
    rooms: [],
    activeRoomId: null,
    activeRoom: null,
    messagesByRoom: {},      // roomId → [messages]
    lastMessageIdByRoom: {}, // roomId → max id
    pollTimer: null,
    polling: false,
    openRoomGen: 0,          // 방 전환 세대 카운터 (in-flight reload 방지)
    directoryCache: null,
    favorites: new Set(),
    deptCollapsed: new Set(),
    lastDirectoryUsers: [],
    lastPeopleQuery: '',
    // v0.4.40: 답장/고정/멘션
    replyTo: null,            // { id, sender_user_id, sender_name, content_text }
    pinnedByRoom: {},         // roomId → [pin items]
    settings: {
      theme: 'auto',
      fontSize: '15',
      language: 'ko',
      notifyOnFocus: false,
      notifySound: true,
      notifySoundId: 'default',
      notifyMaster: true,
      notifyMention: true,
      notifyDm: true,
      notifyChannel: true,
      notifyKeywords: '',
      dndEnabled: false,
      dndStart: '22:00',
      dndEnd: '08:00',
      autoStart: false,
      minimizeToTray: true,
      chatDensity: 'cozy',
      sidebarWidth: 280,
      uiAnimations: true,
      reduceMotion: false,
      appPinEnabled: false,
      autoLockMin: 30,
      fileDownloadRestrict: false,
      allowedFileExtensions: 'pdf,png,jpg,jpeg,gif,webp,txt,log,json,xml,doc,docx,hwp,hwpx,zip',
      maxUploadMb: 50,
      copyRestrict: false,
      certPinning: true,
      refreshTokenRotation: true,
      auditLogLocal: true,
      settingsHistory: true,
      proxyMode: 'system',
      proxyUrl: '',
      adminPolicyServerLock: false,
      releaseNotes: 'v0.4.58\n- 설정 화면 구조 개편\n- 채팅 잠금 화면 개선\n- Windows 설치 프로그램 배포',
    },
  };

  function staticAssetSrc(path) {
    const raw = String(path || '').trim();
    if (!raw) return '';
    if (/^(data:|assets\/|https?:)/i.test(raw)) return encodeURI(raw);
    const localStatic = raw.match(/^\/static\/image\/svg\/chat\/([^/]+\.svg)$/i);
    if (localStatic) return 'assets/svg/chat/' + localStatic[1];
    const base = (state.serverUrl || (window.Api && window.Api.serverUrl) || DEFAULT_SERVER_URL || '').replace(/\/+$/, '');
    return encodeURI(base + raw);
  }
  window.blossomAssetSrc = staticAssetSrc;

  function stripMessageMarkers(text) {
    return String(text || '')
      .replace(/<!--BLS_SCHED:[\s\S]*?-->/g, '')
      .replace(/<!--BLS_POLL:[\s\S]*?-->/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // ── 토스트 ──
  function toast(msg, type) {
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = msg;
    $('toastContainer').appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  // ── 설정 ──
  async function loadSettings() {
    for (const k of Object.keys(state.settings)) {
      const v = await blossom.settings.get(k);
      if (v !== undefined && v !== null) state.settings[k] = v;
    }
    state.serverUrl = (await blossom.settings.get('serverUrl')) || DEFAULT_SERVER_URL;
    if (state.settings.notifySoundId == null) {
      state.settings.notifySoundId = state.settings.notifySound === false ? 'none' : 'default';
    }
    Api.setServer(state.serverUrl);
    applyTheme();
    applyFontSize();
    applyDisplayPreferences();
  }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.settings.theme || 'auto');
  }
  function applyFontSize() {
    document.documentElement.style.setProperty('--font-size-base', (state.settings.fontSize || '15') + 'px');
  }
  function applyDisplayPreferences() {
    const s = state.settings;
    document.body.setAttribute('data-chat-density', s.chatDensity || 'cozy');
    const sw = Math.min(400, Math.max(240, parseInt(String(s.sidebarWidth || 280), 10) || 280));
    const sb = document.getElementById('sidebar');
    if (sb) sb.style.width = sw + 'px';
    const elV = document.getElementById('st_sidebarWidthVal');
    if (elV) elV.textContent = sw + 'px';
    const red = !!s.reduceMotion || s.uiAnimations === false;
    document.documentElement.setAttribute('data-reduce-motion', red ? '1' : '0');
    applyFileInputPolicy();
  }
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  function syncSystemTheme() {
    document.documentElement.setAttribute('data-system-theme', mq.matches ? 'dark' : 'light');
  }
  syncSystemTheme();
  mq.addEventListener('change', syncSystemTheme);

  function isChatSessionUnlocked() {
    const sh = $('appShell');
    const lm = $('loginModal');
    return sh && !sh.hidden && lm && lm.hidden && !lm.classList.contains('locked');
  }
  function scheduleIdleLock() {
    if (state._idleLockTimer) clearTimeout(state._idleLockTimer);
    state._idleLockTimer = setTimeout(function () {
      if (typeof window.__blossomLockApp === 'function') {
        try { window.__blossomLockApp('idle_auto'); } catch (_) {}
      }
    }, getIdleLockMs());
  }
  function onIdleActivity() {
    if (!isChatSessionUnlocked()) return;
    scheduleIdleLock();
  }
  function startIdleLockMonitor() {
    stopIdleLockMonitor();
    scheduleIdleLock();
    if (state._idleActivityBound) return;
    const handler = onIdleActivity;
    state._idleActivityHandler = handler;
    IDLE_LOCK_EVENTS.forEach(function (ev) {
      document.addEventListener(ev, handler, { capture: true, passive: true });
    });
    state._idleActivityBound = true;
  }
  function stopIdleLockMonitor() {
    if (state._idleLockTimer) {
      clearTimeout(state._idleLockTimer);
      state._idleLockTimer = null;
    }
    if (state._idleActivityHandler) {
      const h = state._idleActivityHandler;
      IDLE_LOCK_EVENTS.forEach(function (ev) {
        document.removeEventListener(ev, h, { capture: true });
      });
      state._idleActivityHandler = null;
    }
    state._idleActivityBound = false;
  }
  function setLockUnlockLoading(on) {
    const btn = $('btnUnlock');
    const def = btn && btn.querySelector('.btn-unlock-default');
    const work = $('btnUnlockWorking');
    const sw = $('btnLockSwitch');
    if (!btn) return;
    btn.setAttribute('aria-busy', on ? 'true' : 'false');
    if (on) {
      if (def) def.setAttribute('hidden', '');
      if (work) work.removeAttribute('hidden');
      btn.disabled = true;
      if (sw) sw.disabled = true;
    } else {
      if (def) def.removeAttribute('hidden');
      if (work) work.setAttribute('hidden', '');
      btn.disabled = false;
      if (sw) sw.disabled = false;
    }
  }
  function setLockInputMode(usePin) {
    const label = $('loginPasswordLabel');
    const input = $('loginPassword');
    if (label) {
      const text = usePin ? '잠금 PIN' : '비밀번호';
      let changed = false;
      Array.from(label.childNodes || []).forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE && !changed) {
          n.nodeValue = text + '\n        ';
          changed = true;
        }
      });
      if (!changed) label.insertBefore(document.createTextNode(text + '\n        '), label.firstChild || null);
    }
    if (!input) return;
    input.value = '';
    input.placeholder = usePin ? '6자리 숫자 PIN' : '';
    input.autocomplete = usePin ? 'one-time-code' : 'current-password';
    input.inputMode = usePin ? 'numeric' : '';
    if (usePin) {
      input.setAttribute('maxlength', '6');
      input.setAttribute('pattern', '[0-9]*');
    } else {
      input.removeAttribute('maxlength');
      input.removeAttribute('pattern');
    }
  }

  // ── 부팅 ──
  async function boot() {
    await loadSettings();
    // v0.4.34: 항상 로그인 화면을 띄우고, 잔존 세션/자동로그인 우회 금지.
    //          남아있던 서버 세션 쿠키를 먼저 무효화한다.
    try { await Api.logout(); } catch (_) {}
    // v0.4.55: 초기 상태는 활성 대화 없음 → composer 숨김
    document.body.classList.add('no-active-room');
    showLogin();
  }

  function showLogin() {
    $('appShell').hidden = true;
    $('loginModal').hidden = false;
    $('loginModal').classList.remove('locked');
    delete $('loginModal').dataset.lockedEmpNo;
    delete $('loginModal').dataset.lockReason;
    delete $('loginModal').dataset.unlockMode;
    setLockInputMode(false);
    const lb0 = $('lockScreenBlock');
    if (lb0) lb0.setAttribute('hidden', '');
    const acts = $('lockActions');
    if (acts) acts.setAttribute('hidden', '');
    blossom.credentials.load().then((cred) => {
      if (cred && cred.empNo) {
        $('loginEmpNo').value = cred.empNo;
        $('loginRemember').checked = !!cred.autoLogin;
        setTimeout(() => $('loginPassword').focus(), 50);
      } else {
        setTimeout(() => $('loginEmpNo').focus(), 50);
      }
    }).catch(() => setTimeout(() => $('loginEmpNo').focus(), 50));
  }
  function hideLogin() {
    $('loginModal').hidden = true;
    $('loginModal').classList.remove('locked');
    delete $('loginModal').dataset.lockedEmpNo;
    delete $('loginModal').dataset.lockReason;
    delete $('loginModal').dataset.unlockMode;
    setLockInputMode(false);
    const lb = $('lockScreenBlock');
    if (lb) lb.setAttribute('hidden', '');
    setLockUnlockLoading(false);
    const err = $('loginError');
    if (err) err.classList.remove('login-error-shake');
    $('loginEmpNo').readOnly = false;
    const rem = $('loginRemember');
    if (rem && rem.parentElement) rem.parentElement.style.display = '';
    $('appShell').hidden = false;
  }

  async function doLogin() {
    const empNo = $('loginEmpNo').value.trim();
    const pw = $('loginPassword').value;
    const remember = $('loginRemember').checked;
    if (!empNo || !pw) {
      $('loginError').hidden = false;
      $('loginError').textContent = '사번과 비밀번호를 입력하세요.';
      return;
    }
    // v0.4.36: 서버 주소는 별도 다이얼로그에서 설정. 미설정 시 안내.
    if (!state.serverUrl) {
      $('loginError').hidden = false;
      $('loginError').textContent = '서버 주소가 설정되지 않았습니다. 아래 "서버 설정·접속 정보 관리"에서 입력하세요.';
      return;
    }
    $('loginError').hidden = true;
    $('btnLogin').disabled = true;
    try {
      await Api.login(empNo, pw);
      if (remember) await blossom.credentials.save(empNo, pw);
      else await blossom.credentials.clear();
      hideLogin();
      $('loginPassword').value = '';
      await afterLogin();
    } catch (e) {
      $('loginError').hidden = false;
      $('loginError').textContent = '로그인 실패: ' + (e.message || '');
    } finally {
      $('btnLogin').disabled = false;
    }
  }
  $('btnLogin').addEventListener('click', doLogin);
  // v0.4.36: 로그인 화면의 "서버 설정·접속 정보 관리" 다이얼로그
  (function bindConnSettingsDialog() {
    const open = document.getElementById('btnLoginConnSettings');
    const save = document.getElementById('btnConnSettingsSave');
    const test = document.getElementById('btnConnTest');
    const reset = document.getElementById('btnConnReset');
    const input = document.getElementById('connServer');
    const err = document.getElementById('connSettingsError');
    const ok = document.getElementById('connSettingsOk');
    function setMsg(kind, text) {
      if (err) { err.hidden = kind !== 'err'; if (kind === 'err') err.textContent = text; }
      if (ok)  { ok.hidden  = kind !== 'ok';  if (kind === 'ok')  ok.textContent  = text; }
    }
    function readUrl() {
      const v = (input && input.value || '').trim();
      if (!v) { setMsg('err', '서버 주소를 입력하세요.'); return null; }
      if (!/^https?:\/\//i.test(v)) { setMsg('err', '서버 주소는 http:// 또는 https:// 로 시작해야 합니다.'); return null; }
      return v.replace(/\/+$/, '');
    }
    async function doTest(url) {
      setMsg('clear');
      try { if (window.blossom && blossom.net && blossom.net.trustHost) await blossom.net.trustHost(url); } catch (_) {}
      const target = url + '/api/auth/session-check';
      const t0 = Date.now();
      const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const timer = setTimeout(function () { try { ctrl && ctrl.abort(); } catch (_) {} }, 8000);
      try {
        const opts = { method: 'GET', credentials: 'include', cache: 'no-store' };
        if (ctrl) opts.signal = ctrl.signal;
        const res = await fetch(target, opts);
        const ms = Date.now() - t0;
        // 200(JSON), 401, 403 모두 "서버 응답 OK"로 간주
        if (res.status >= 200 && res.status < 500) {
          setMsg('ok', '서버 연결 성공 (HTTP ' + res.status + ', ' + ms + 'ms)');
          return true;
        }
        setMsg('err', '서버 응답 오류: HTTP ' + res.status);
        return false;
      } catch (e) {
        const ms = Date.now() - t0;
        const aborted = (e && (e.name === 'AbortError' || /aborted/i.test(e.message || '')));
        const msg = aborted ? ('연결 실패: 8초 내 응답 없음 (' + ms + 'ms). 서버 주소·포트·방화벽·와이파이를 확인하세요.')
                            : ('연결 실패: ' + (e && e.message ? e.message : '네트워크 오류'));
        setMsg('err', msg);
        return false;
      } finally {
        clearTimeout(timer);
      }
    }
    if (open) open.addEventListener('click', () => {
      if (input) input.value = state.serverUrl || '';
      setMsg('clear');
      const m = document.getElementById('connSettingsModal');
      if (m) { m.hidden = false; setTimeout(() => input && input.focus(), 30); }
    });
    if (test) test.addEventListener('click', async () => {
      const v = readUrl(); if (!v) return;
      test.disabled = true; const old = test.textContent; test.textContent = '테스트 중...';
      try { await doTest(v); } finally { test.disabled = false; test.textContent = old; }
    });
    if (save) save.addEventListener('click', async () => {
      const v = readUrl(); if (!v) return;
      save.disabled = true;
      try {
        const okConn = await doTest(v);
        if (!okConn) {
          if (!confirm('서버 연결에 실패했습니다. 그래도 저장하시겠습니까?')) return;
        }
        try { await blossom.settings.set('serverUrl', v); } catch (_) {}
        state.serverUrl = v;
        Api.setServer(v);
        const m = document.getElementById('connSettingsModal');
        if (m) m.hidden = true;
      } finally { save.disabled = false; }
    });
    if (reset) reset.addEventListener('click', async () => {
      if (!confirm('저장된 서버 주소, 자동로그인 정보, 모든 쿠키와 캐시를 삭제한 뒤 앱을 재시작합니다.\n계속하시겠습니까?')) return;
      try { if (blossom.credentials && blossom.credentials.clear) await blossom.credentials.clear(); } catch (_) {}
      try {
        if (blossom.app && blossom.app.resetAll) await blossom.app.resetAll();
        else location.reload();
      } catch (_) { location.reload(); }
    });
  })();
  ['loginEmpNo', 'loginPassword'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    if (id === 'loginPassword') {
      el.addEventListener('input', () => {
        const m = $('loginModal');
        if (m && m.dataset.unlockMode === 'pin') {
          el.value = el.value.replace(/\D/g, '').slice(0, 6);
        }
      });
    }
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const m = $('loginModal');
        if (m && m.classList.contains('locked')) unlockApp();
        else doLogin();
      }
    });
  });
  // v0.4.21: 잠금 해제 / 다른 계정으로 전환
  const _btnUnlock = document.getElementById('btnUnlock');
  if (_btnUnlock) _btnUnlock.addEventListener('click', unlockApp);
  const _btnLockSwitch = document.getElementById('btnLockSwitch');
  if (_btnLockSwitch) _btnLockSwitch.addEventListener('click', async () => {
    try { await Api.logout(); } catch (_) {}
    stopPolling();
    stopIdleLockMonitor();
    const m = $('loginModal');
    m.classList.remove('locked');
    delete m.dataset.lockedEmpNo;
    delete m.dataset.lockReason;
    delete m.dataset.unlockMode;
    setLockInputMode(false);
    const lb = $('lockScreenBlock');
    if (lb) lb.setAttribute('hidden', '');
    const acts2 = $('lockActions');
    if (acts2) acts2.setAttribute('hidden', '');
    setLockUnlockLoading(false);
    $('loginPassword').value = '';
    const errEl = $('loginError'); if (errEl) { errEl.hidden = true; errEl.classList.remove('login-error-shake'); }
    setTimeout(() => $('loginEmpNo').focus(), 50);
  });

  // ── 로그인 후 ──
  async function afterLogin() {
    try {
      const p = await Api.myProfile();
      if (p && p.success) {
        state.profile = p.item;
        state.currentUserId = p.item && (p.item.id || p.item.user_id);
      }
    } catch (e) { console.warn('myProfile failed', e); }
    // /api/me/profile 응답에는 user.id 가 없으므로 디렉터리에서 emp_no/이름으로 매칭해 보정
    if (!state.currentUserId && state.profile) {
      try {
        const dir = await Api.listDirectory({ q: '', limit: 500 });
        const list = Array.isArray(dir) ? dir : [];
        const emp = (state.profile.emp_no || '').trim();
        const name = (state.profile.name || '').trim();
        let match = null;
        if (emp) match = list.find((u) => (u.emp_no || '').trim() === emp);
        if (!match && name) match = list.find((u) => (u.name || '').trim() === name);
        if (match && match.id) state.currentUserId = match.id;
      } catch (e) { console.warn('directory lookup failed', e); }
    }
    if (state.currentUserId) {
      console.info('[afterLogin] currentUserId =', state.currentUserId);
    } else {
      console.warn('[afterLogin] currentUserId 미확인 — 채팅/DM 작동 불가');
      toast('내 사용자 ID를 확인하지 못했습니다. 다시 로그인해 주세요.', 'error');
    }
    renderMe();
    await loadRooms();
    setTab('chat');
    startPolling();
    startIdleLockMonitor();
    try {
      const log = JSON.parse(localStorage.getItem('blossom_login_log') || '[]');
      log.unshift({ at: new Date().toISOString(), type: 'login' });
      localStorage.setItem('blossom_login_log', JSON.stringify(log.slice(0, 50)));
    } catch (_) {}
    // v0.4.45: 서버와 시계 동기화 (실패 시 시스템 시계 사용)
    try { syncServerClock(); } catch (_) {}
    try {
      if (!state._clockSyncTimer) {
        state._clockSyncTimer = setInterval(() => { try { syncServerClock(); } catch (_) {} }, 5 * 60 * 1000);
      }
    } catch (_) {}
  }

  function renderMe() {
    setAvatar($('meAvatar'), (state.profile && state.profile.profile_image) || null, state.currentUserId, state.profile && (state.profile.name || state.profile.nickname));
  }

  // ── 아바타 ──
  const AVATAR_COLORS = [
    '#6366F1', '#3B82F6', '#0EA5E9', '#06B6D4', '#10B981', '#84CC16',
    '#EAB308', '#F59E0B', '#F97316', '#EF4444', '#EC4899', '#8B5CF6',
    '#A855F7', '#14B8A6',
  ];
  function colorForId(id) {
    const n = Math.abs(parseInt(id, 10) || hashCode(String(id)));
    return AVATAR_COLORS[n % AVATAR_COLORS.length];
  }
  function hashCode(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  const PERSON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
  function initialsFor(name) {
    const s = String(name || '').trim();
    if (!s) return '';
    // 한글 이름이면 마지막 두 글자(또는 전체 1~2자)
    if (/[\uac00-\ud7af]/.test(s)) {
      return s.length >= 2 ? s.slice(-2) : s;
    }
    // 영문/숫자: 단어별 첫 글자 최대 2자
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return s.slice(0, 2).toUpperCase();
  }
  function setAvatar(el, imgPath, idOrSeed, name) {
    if (!el) return;
    el.innerHTML = '';
    el.style.color = '#ffffff';
    const renderFallback = () => {
      el.innerHTML = '';
      el.style.background = colorForId(idOrSeed || name || 0);
      const init = initialsFor(name);
      if (init) {
        const span = document.createElement('span');
        span.className = 'avatar-initials';
        span.textContent = init;
        el.appendChild(span);
      } else {
        el.innerHTML = PERSON_SVG;
      }
    };
    if (imgPath && /\.(svg|png|jpe?g|webp|gif)$/i.test(imgPath)) {
      // 일단 컬러 + 이니셜로 채워둔 뒤, 이미지 로드 성공 시 흰 배경 + 이미지로 교체
      renderFallback();
      const img = new Image();
      img.onload = () => {
        el.innerHTML = '';
        el.style.background = '#ffffff';
        el.appendChild(img);
      };
      img.onerror = () => { /* keep fallback */ };
      img.src = imgPath.startsWith('http') || imgPath.startsWith('assets/') ? imgPath : (state.serverUrl + imgPath);
    } else {
      renderFallback();
    }
  }

  // ── 사이드바 탭 ──
  // v0.4.55: composer 가시성은 body.no-active-room 클래스로만 제어. 
  // 대화가 선택되면 openRoom() 에서 remove, 해제/삭제 시 _afterRoomRemoved() 에서 add.
  function _setComposerVisible(_visible) { /* no-op (CSS 담당) */ }
  function setTab(name) {
    $$('.rail-btn[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    const isFull = (name === 'calendar' || name === 'memo');
    // 사이드바/메인페인 ↔ 풀페인 전환
    const sb = $('sidebar'); if (sb) sb.hidden = !!isFull;
    const mp = document.querySelector('section.main-pane'); if (mp) mp.hidden = !!isFull;
    const calP = $('calendarPane'); if (calP) calP.hidden = name !== 'calendar';
    const memoP = $('memoPane'); if (memoP) memoP.hidden = name !== 'memo';
    if (!isFull) {
      $$('.sidebar-pane').forEach((p) => { p.hidden = p.dataset.pane !== name; });
      if (sb) sb.dataset.tab = name;
      const title = $('wsTitle');
      if (title) title.textContent = name === 'people' ? '동료' : '채팅';
      if (name === 'people' && !state.directoryCache) loadDirectoryInto('peopleList', '');
    }
    if (name === 'calendar') { try { CalendarView.open(); } catch (e) { console.warn(e); } }
    if (name === 'memo') { try { MemoView.open(); } catch (e) { console.warn(e); } }
  }
  $$('.rail-btn[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  // ── 방 목록 ──
  async function loadRooms() {
    try {
      const rows = await Api.listRooms();
      state.rooms = Array.isArray(rows) ? rows : (rows && rows.items) || [];
      renderRooms();
      updateBadge();
    } catch (e) {
      console.warn('listRooms failed', e);
    }
  }

  function roomTitle(room) {
    const t = (room.room_type || 'DIRECT').toUpperCase();
    if (room.room_name && String(room.room_name).trim()) return room.room_name;
    if (t === 'DIRECT') {
      const others = (room.members || []).filter((m) => m.user_id !== state.currentUserId);
      if (others.length) {
        const u = others[0].user || {};
        return u.name || ('user#' + others[0].user_id);
      }
      return room.room_name || '대화';
    }
    if (t === 'GROUP') {
      const others = (room.members || []).filter((m) => m.user_id !== state.currentUserId && !m.left_at);
      if (others.length) {
        const first = others[0].user || {};
        const name = first.name || first.nickname || ('user#' + others[0].user_id);
        return '@' + name + (others.length > 1 ? ' 외 ' + (others.length - 1) + '명' : '');
      }
    }
    return room.room_name || '#room' + room.id;
  }
  function roomAvatarSeed(room) {
    if ((room.room_type || '').toUpperCase() === 'DIRECT') {
      const o = (room.members || []).find((m) => m.user_id !== state.currentUserId);
      return o ? o.user_id : room.id;
    }
    return 'r' + room.id;
  }
  function roomAvatarImage(room) {
    if ((room.room_type || '').toUpperCase() === 'DIRECT') {
      const o = (room.members || []).find((m) => m.user_id !== state.currentUserId);
      if (o) return (o.user && o.user.profile_image) || o.profile_image || null;
    }
    return null;
  }

  // v0.4.30: 비공개 채널은 GROUP + room_name(이름 있음)으로 구분
  function getGroupDmIds() {
    if (state._groupDmSet) return state._groupDmSet;
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem('bls_group_dm_ids') || '[]') || []; } catch (_) {}
    state._groupDmSet = new Set(arr.map((n) => parseInt(n, 10)).filter(Boolean));
    return state._groupDmSet;
  }
  function rememberGroupDm(roomId) {
    if (!roomId) return;
    const s = getGroupDmIds();
    s.add(parseInt(roomId, 10));
    try { localStorage.setItem('bls_group_dm_ids', JSON.stringify(Array.from(s))); } catch (_) {}
  }
  function isPrivateChannel(r) {
    const t = (r.room_type || '').toUpperCase();
    return t === 'GROUP' && !!(r.room_name && String(r.room_name).trim()) && !getGroupDmIds().has(parseInt(r.id, 10));
  }
  function isChannelLike(r) {
    const t = (r.room_type || '').toUpperCase();
    return t === 'CHANNEL' || isPrivateChannel(r);
  }
  function isDmLike(r) {
    const t = (r.room_type || '').toUpperCase();
    if (t === 'DIRECT') return true;
    if (t === 'GROUP' && getGroupDmIds().has(parseInt(r.id, 10))) return true;
    if (t === 'GROUP') return !isPrivateChannel(r); // 이름 없는 GROUP = 다자 DM
    return false;
  }

  function renderRooms() {
    const q = (state.chatSearchQuery || '').toLowerCase();
    const matchQ = (r) => !q || roomTitle(r).toLowerCase().indexOf(q) >= 0;
    const hidden = getHiddenDmIds();
    const showHidden = !!state.showHiddenRooms;
    const channels = state.rooms.filter((r) => isChannelLike(r) && (showHidden || !hidden.has(r.id))).filter(matchQ);
    const dms = state.rooms.filter((r) => isDmLike(r) && (showHidden || !hidden.has(r.id))).filter(matchQ);
    fillRoomList('channelList', channels, null);
    fillRoomList('dmList', dms, '@');
  }

  // v0.4.29: 대화 숨기기 (클라이언트 로컬에서 DM 목록만 가림 — 서버 멤버십 유지)
  function getHiddenDmIds() {
    if (state._hiddenDmSet) return state._hiddenDmSet;
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem('bls_hidden_dm_ids') || '[]') || []; } catch (_) {}
    state._hiddenDmSet = new Set(arr.map((n) => parseInt(n, 10)).filter(Boolean));
    return state._hiddenDmSet;
  }
  function saveHiddenDmIds() {
    try { localStorage.setItem('bls_hidden_dm_ids', JSON.stringify(Array.from(getHiddenDmIds()))); } catch (_) {}
  }
  function hideDmRoom(roomId) {
    if (!roomId) return;
    getHiddenDmIds().add(roomId);
    saveHiddenDmIds();
    if (state.activeRoomId === roomId) {
      state.activeRoomId = null; state.activeRoom = null;
      const ti = $('convTitle'); if (ti) ti.textContent = '대화를 선택하세요';
      const ic = $('convIcon'); if (ic) ic.textContent = '#';
      const me2 = $('convMeta'); if (me2) me2.textContent = '';
      const ar = $('messageArea'); if (ar) ar.innerHTML = '';
      const eh = $('emptyHint'); if (eh) eh.hidden = false;
      // v0.4.50: 단일 헬퍼로 composer 숨김
      _setComposerVisible(false);
      document.body.classList.add('no-active-room');
    }
    renderRooms();
  }
  function unhideDmRoom(roomId) {
    getHiddenDmIds().delete(roomId);
    saveHiddenDmIds();
    renderRooms();
  }

  function updateBadge() {
    let total = 0;
    state.rooms.forEach((r) => { total += (r.viewer_unread_count || 0); });
    blossom.badge(total);
  }

  function fillRoomList(elId, rows, prefix) {
    const ul = $(elId);
    ul.innerHTML = '';
    if (!rows.length) {
      const li = document.createElement('li');
      li.className = 'conv-item';
      li.style.color = 'var(--sidebar-fg-dim)';
      li.style.fontStyle = 'italic';
      li.textContent = elId === 'channelList' ? '아직 채널이 없습니다' : '아직 대화가 없습니다';
      ul.appendChild(li);
      return;
    }
    const hiddenSet = getHiddenDmIds();
    rows.forEach((r) => {
      const li = document.createElement('li');
      li.className = 'conv-item';
      if (r.id === state.activeRoomId) li.classList.add('active');
      if (hiddenSet.has(r.id)) li.classList.add('is-hidden-room');
      const pref = document.createElement('span');
      pref.className = 'prefix';
      // v0.4.30: 채널은 공개(#) / 비공개(자물쇠) 구분 표시
      let displayPrefix = prefix;
      if (elId === 'channelList') {
        if (isPrivateChannel(r)) {
          pref.classList.add('prefix-lock');
          pref.setAttribute('title', '비공개 채널');
          pref.innerHTML = '<img src="assets/svg/chat/free-icon-font-key.svg" alt="" />';
          li.appendChild(pref);
          const label = document.createElement('span');
          label.className = 'label';
          label.textContent = roomTitle(r);
          li.appendChild(label);
          const unread = r.viewer_unread_count || 0;
          if (unread > 0) {
            const b = document.createElement('span');
            b.className = 'unread-dot';
            b.title = '읽지 않은 메시지 ' + unread + '개';
            li.appendChild(b);
          }
          li.addEventListener('click', () => openRoom(r));
          li.addEventListener('contextmenu', (ev) => {
            ev.preventDefault();
            showRoomContextMenu(ev.clientX, ev.clientY, r);
          });
          ul.appendChild(li);
          return;
        } else {
          displayPrefix = '#';
          pref.setAttribute('title', '공개 채널');
        }
      }
      pref.textContent = displayPrefix;
      li.appendChild(pref);
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = roomTitle(r);
      li.appendChild(label);
      const unread = r.viewer_unread_count || 0;
      if (unread > 0) {
        const b = document.createElement('span');
        b.className = 'unread-dot';
        b.title = '읽지 않은 메시지 ' + unread + '개';
        li.appendChild(b);
      }
      li.addEventListener('click', () => openRoom(r));
      li.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        showRoomContextMenu(ev.clientX, ev.clientY, r);
      });
      ul.appendChild(li);
    });
  }

  function findRoomById(id) { return state.rooms.find((r) => r.id === id); }

  // ── 방 열기 ──
  async function openRoom(room) {
    if (!room || !room.id) return;
    // v0.4.56: 이미 열려 있는 방을 다시 클릭하면 아무것도 하지 않음
    //          (메시지 영역 wipe 및 재로드로 "대화 내용이 사라지는" 현상 방지)
    if (state.activeRoomId === room.id) {
      document.body.classList.remove('no-active-room');
      try { setActiveRoomTab(_activeRoomTab || 'chat'); } catch (_) {}
      try { refreshRoomTabDots(room.id); } catch (_) {}
      try { setTimeout(() => $('composerInput').focus(), 30); } catch (_) {}
      return;
    }
    // v0.4.29: 숨겨놓은 DM이라도 직접 열면 자동으로 다시 표시
    try { if (getHiddenDmIds().has(room.id)) unhideDmRoom(room.id); } catch (_) {}
    if (typeof closeConvSearch === 'function') closeConvSearch();
    state.activeRoomId = room.id;
    state.activeRoom = room;
    const myGen = ++state.openRoomGen;
    // v0.4.57: 캐시 우선 렌더 — 이전에 한 번이라도 본 방이면 캐시된 메시지를 즉시 그리고
    //          서버 응답이 도착하면 누락분만 추가한다. 캐시는 절대 비우지 않는다.
    const _area0 = $('messageArea');
    if (_area0) {
      _area0.innerHTML = '';
      const cached = state.messagesByRoom[room.id] || [];
      if (cached.length) {
        cached.forEach((m) => appendMessageToArea(_area0, m));
        _area0.scrollTop = _area0.scrollHeight;
      }
    }
    renderRooms();
    const t = (room.room_type || '').toUpperCase();
    $('convIcon').textContent = t === 'CHANNEL' ? '#' : '@';
    $('convTitle').textContent = roomTitle(room);
    const memberCount = (room.members || []).filter((m) => !m.left_at).length;
    $('convMeta').textContent = (memberCount ? memberCount + '명' : '') + (room.last_message_preview ? '' : '');
    $('emptyHint').hidden = true;
    // v0.4.56: composer 는 항상 표시 — 별도 표시 조작 불요
    document.body.classList.remove('no-active-room');
    // v0.4.57: lastMessageIdByRoom 은 캐시 보존을 위해 유지. full reload 는 reloadMessages 가 알아서 처리.
    setReplyTo(null);
    state.pinnedByRoom[room.id] = [];
    const pb = $('pinnedBar'); if (pb) pb.hidden = true;
    _activeChatKindFilter = 'all';
    document.querySelectorAll('.rcc-filter').forEach((x) => x.classList.toggle('active', x.dataset.chatKind === 'all'));
    try { setActiveRoomTab('chat'); } catch (_) {}
    try { _updateMembersTabVisibility(); } catch (_) {}
    try { refreshRoomTabDots(room.id); } catch (_) {}
    await reloadMessages(room.id, true, myGen);
    if (myGen !== state.openRoomGen) return; // 그 사이 다른 방으로 전환됨
    try { await reloadPinned(room.id); } catch (_) {}
    try { await Api.markRoomRead(room.id); room.viewer_unread_count = 0; renderRooms(); updateBadge(); } catch (_) {}
    setTimeout(() => $('composerInput').focus(), 30);
  }

  // 헤더 더보기 버튼 → 방 컨텍스트 메뉴
  (function bindConvMenu() {
    const btn = $('btnConvMenu');
    if (!btn) return;
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!state.activeRoom) { toast('대화를 먼저 선택하세요.', 'info'); return; }
      const r = btn.getBoundingClientRect();
      showRoomContextMenu(r.right - 4, r.bottom + 4, state.activeRoom);
    });
  })();

  // ── 대화 내 검색 ──
  const convSearch = {
    open: false,
    query: '',
    hits: [],     // [{el: <mark>, msgEl: <div.msg>}]
    cursor: -1,
  };

  function escRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function clearMessageHighlights() {
    const area = $('messageArea');
    if (!area) return;
    area.querySelectorAll('mark.search-hit').forEach((m) => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });
  }

  function highlightInNode(node, regex, hits, msgEl) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue;
      if (!text) return;
      regex.lastIndex = 0;
      let m;
      const segments = [];
      let last = 0;
      while ((m = regex.exec(text)) !== null) {
        if (m.index > last) segments.push({ t: text.slice(last, m.index), hit: false });
        segments.push({ t: m[0], hit: true });
        last = m.index + m[0].length;
        if (m[0].length === 0) regex.lastIndex++;
      }
      if (!segments.length) return;
      if (last < text.length) segments.push({ t: text.slice(last), hit: false });
      const frag = document.createDocumentFragment();
      segments.forEach((s) => {
        if (s.hit) {
          const mk = document.createElement('mark');
          mk.className = 'search-hit';
          mk.textContent = s.t;
          frag.appendChild(mk);
          hits.push({ el: mk, msgEl: msgEl });
        } else {
          frag.appendChild(document.createTextNode(s.t));
        }
      });
      node.parentNode.replaceChild(frag, node);
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName;
      if (tag === 'CODE' || tag === 'A' || tag === 'MARK' || tag === 'SCRIPT' || tag === 'STYLE') return;
      const kids = Array.from(node.childNodes);
      kids.forEach((k) => highlightInNode(k, regex, hits, msgEl));
    }
  }

  function recomputeSearch() {
    clearMessageHighlights();
    convSearch.hits = [];
    convSearch.cursor = -1;
    const q = (convSearch.query || '').trim();
    const countEl = $('convSearchCount');
    if (!q) { if (countEl) countEl.textContent = '0/0'; return; }
    const area = $('messageArea');
    if (!area) return;
    const re = new RegExp(escRegExp(q), 'gi');
    area.querySelectorAll('.msg .msg-content').forEach((c) => {
      highlightInNode(c, re, convSearch.hits, c.closest('.msg'));
    });
    if (convSearch.hits.length) {
      convSearch.cursor = convSearch.hits.length - 1; // 가장 최근(아래) 결과부터
      focusCurrentHit();
    }
    if (countEl) {
      countEl.textContent = convSearch.hits.length
        ? ((convSearch.cursor + 1) + '/' + convSearch.hits.length)
        : '0/0';
    }
  }

  function focusCurrentHit() {
    convSearch.hits.forEach((h, i) => {
      h.el.classList.toggle('current', i === convSearch.cursor);
    });
    const cur = convSearch.hits[convSearch.cursor];
    if (cur && cur.el && cur.el.scrollIntoView) {
      cur.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    const countEl = $('convSearchCount');
    if (countEl) {
      countEl.textContent = convSearch.hits.length
        ? ((convSearch.cursor + 1) + '/' + convSearch.hits.length)
        : '0/0';
    }
  }

  function moveSearch(delta) {
    if (!convSearch.hits.length) return;
    const n = convSearch.hits.length;
    convSearch.cursor = ((convSearch.cursor + delta) % n + n) % n;
    focusCurrentHit();
  }

  function openConvSearch() {
    if (!state.activeRoomId) { toast('대화를 먼저 선택하세요.', 'info'); return; }
    convSearch.open = true;
    $('convSearchBar').hidden = false;
    $('btnConvSearch').classList.add('active');
    const inp = $('convSearchInput');
    inp.value = convSearch.query || '';
    setTimeout(() => { inp.focus(); inp.select(); }, 20);
    recomputeSearch();
  }

  function closeConvSearch() {
    convSearch.open = false;
    $('convSearchBar').hidden = true;
    $('btnConvSearch').classList.remove('active');
    clearMessageHighlights();
    convSearch.hits = [];
    convSearch.cursor = -1;
  }

  (function bindConvSearch() {
    const btn = $('btnConvSearch');
    if (!btn) return;
    btn.addEventListener('click', () => { convSearch.open ? closeConvSearch() : openConvSearch(); });
    $('convSearchClose').addEventListener('click', closeConvSearch);
    $('convSearchPrev').addEventListener('click', () => moveSearch(-1));
    $('convSearchNext').addEventListener('click', () => moveSearch(1));
    let t = null;
    $('convSearchInput').addEventListener('input', (e) => {
      convSearch.query = e.target.value;
      clearTimeout(t);
      t = setTimeout(recomputeSearch, 120);
    });
    $('convSearchInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        moveSearch(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeConvSearch();
      }
    });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        openConvSearch();
      }
    });
  })();

  async function reloadMessages(roomId, full, gen) {
    const myGen = (typeof gen === 'number') ? gen : state.openRoomGen;
    try {
      // v0.4.57: full=true 라도 캐시가 있으면 lastId 이후만 가져온다 (캐시 보존).
      //          캐시가 비어 있을 때만 전체 80개 페이지를 받는다.
      const cachedLastId = state.lastMessageIdByRoom[roomId] || 0;
      const useAfterId = cachedLastId > 0;
      const data = await Api.listMessages(roomId, Object.assign(
        useAfterId ? { afterId: cachedLastId } : { perPage: 80 },
        { viewerUserId: state.currentUserId }
      ));
      // 그 사이 다른 방으로 전환됐으면 이 응답은 폐기
      if (myGen !== state.openRoomGen || roomId !== state.activeRoomId) return;
      const items = (data && data.items) || [];
      const area = $('messageArea');
      if (full && !useAfterId) {
        // 캐시 자체가 없을 때만 area 를 리셋한다 (캐시가 있으면 이미 openRoom 에서 그려둠).
        area.innerHTML = '';
        state.messagesByRoom[roomId] = [];
      }
      items.forEach((m) => {
        if (state.lastMessageIdByRoom[roomId] && m.id <= state.lastMessageIdByRoom[roomId]) return;
        state.messagesByRoom[roomId] = (state.messagesByRoom[roomId] || []);
        state.messagesByRoom[roomId].push(m);
        if (roomId === state.activeRoomId && myGen === state.openRoomGen) appendMessageToArea(area, m);
        if (m.id > (state.lastMessageIdByRoom[roomId] || 0)) state.lastMessageIdByRoom[roomId] = m.id;
      });
      if (roomId === state.activeRoomId && myGen === state.openRoomGen) {
        updateChatContextCounts();
        applyChatKindFilter();
      }
      if (items.length && roomId === state.activeRoomId && myGen === state.openRoomGen) area.scrollTop = area.scrollHeight;
      if (roomId === state.activeRoomId && myGen === state.openRoomGen && convSearch && convSearch.open && items.length) {
        recomputeSearch();
      }
    } catch (e) {
      console.warn('listMessages failed', e);
    }
  }

  function renderMessage(m) {
    const wrap = document.createElement('div');
    wrap.className = 'msg' + (m.is_system ? ' msg-system' : '') + (m.is_pinned ? ' is-pinned' : '');
    wrap.dataset.msgId = String(m.id || '');
    wrap.dataset.msgKind = classifyMessageKind(m);
    const av = document.createElement('span');
    av.className = 'avatar avatar-md';
    const sender = m.sender || {};
    setAvatar(av, sender.profile_image || null, m.sender_user_id || sender.id || 0, sender.name || sender.nickname);
    wrap.appendChild(av);
    const body = document.createElement('div');
    body.className = 'msg-body';
    // v0.4.40: 답장 인용 — 원문 메시지를 캐시에서 조회
    if (m.reply_to_message_id) {
      const orig = _findMessageInRoom(m.room_id, m.reply_to_message_id);
      const quote = document.createElement('div');
      quote.className = 'msg-reply-quote';
      quote.title = '원본 메시지로 이동';
      const qIcon = document.createElement('span');
      qIcon.className = 'rq-icon';
      qIcon.innerHTML = '<img src="assets/svg/chat/free-icon-font-hand-back-point-left.svg" alt="" />';
      const qName = document.createElement('span');
      qName.className = 'rq-name';
      qName.textContent = ((orig && orig.sender && orig.sender.name) || '대화 원문') + '에게 답장';
      const qText = document.createElement('span');
      qText.className = 'rq-text';
      qText.textContent = orig ? _shortenText(orig.content_text || '', 80) : '메시지를 찾을 수 없습니다';
      quote.appendChild(qIcon); quote.appendChild(qName); quote.appendChild(qText);
      quote.addEventListener('click', () => _scrollToMessage(m.reply_to_message_id));
      body.appendChild(quote);
    }
    const head = document.createElement('div');
    head.className = 'msg-head';
    const name = document.createElement('span');
    name.className = 'msg-author';
    name.textContent = sender.name || ('user#' + (m.sender_user_id || ''));
    head.appendChild(name);
    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = formatTime(m.created_at);
    head.appendChild(time);
    if (m.is_pinned) {
      const pinSpan = document.createElement('span');
      pinSpan.className = 'msg-pin-icon';
      pinSpan.title = '고정된 메시지';
      pinSpan.innerHTML = '<img src="assets/svg/chat/free-icon-font-thumbtack2.svg" alt="" />';
      head.appendChild(pinSpan);
    }
    body.appendChild(head);
    const content = document.createElement('div');
    content.className = 'msg-content';
    const text = m.content_text || '';
    // v0.4.28: 일정 공유 마커 처리 → "내 일정에 추가" 버튼
    let displayText = text;
    let schedMarker = null;
    let pollMarker = null;
    const markerMatch = text.match(/<!--BLS_SCHED:(\{[\s\S]*?\})-->/);
    if (markerMatch) {
      try { schedMarker = JSON.parse(markerMatch[1]); } catch (_) {}
      displayText = text.replace(markerMatch[0], '').replace(/\n+$/, '');
    }
    const pollMatch = displayText.match(/<!--BLS_POLL:([\s\S]*?)-->/);
    if (pollMatch) {
      try { pollMarker = JSON.parse(pollMatch[1]); } catch (_) {}
      displayText = displayText.replace(pollMatch[0], '').replace(/^📊\s*/, '').replace(/\n+$/, '');
    }
    content.innerHTML = formatMessage(displayText);
    if (pollMarker) {
      content.classList.add('msg-poll-intro');
      const icon = document.createElement('img');
      icon.src = staticAssetSrc('/static/image/svg/chat/free-icon-font-vote-yea.svg');
      icon.alt = '';
      content.prepend(icon);
    }
    // v0.4.42: 이모지만 입력된 메시지는 크게 표시
    try {
      const stripped = (displayText || '').replace(/\s+/g, '');
      if (stripped.length) {
        const emojiOnlyRe = /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*|[\u2600-\u27BF])+$/u;
        if (emojiOnlyRe.test(stripped)) {
          content.classList.add('is-emoji-only');
          // 1~3개면 더 크게
          const count = Array.from(stripped.replace(/\uFE0F|\u200D/g, '')).length;
          if (count <= 3) content.classList.add('emoji-jumbo');
        }
      }
    } catch (_) {}
    body.appendChild(content);
    if (schedMarker) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'msg-sched-add';
      addBtn.textContent = '＋ 내 일정에 추가';
      addBtn.addEventListener('click', async () => {
        addBtn.disabled = true;
        try {
          await Api.createCalendarSchedule({
            title: schedMarker.title || '(제목 없음)',
            start_datetime: schedMarker.start,
            end_datetime: schedMarker.end,
            location: schedMarker.location || '',
            description: schedMarker.description || '',
            share_scope: 'PRIVATE',
            event_type: '기타',
          });
          addBtn.textContent = '✓ 내 일정에 추가됨';
          if (window.CalendarView && window.CalendarView.reload) {
            try { await window.CalendarView.reload(); } catch (_) {}
          }
        } catch (e) {
          addBtn.disabled = false;
          alert('일정 추가 실패: ' + (e && e.message || ''));
        }
      });
      body.appendChild(addBtn);
    }
    if (pollMarker) body.appendChild(renderPollCard(m, pollMarker));
    (m.files || []).forEach((f) => {
      const url = fileUrl(f, { inline: true });
      if (_fileKind(f) === 'image' && url) {
        const preview = document.createElement('button');
        preview.type = 'button';
        preview.className = 'msg-image-preview';
        const img = document.createElement('img');
        img.src = url;
        img.alt = f.original_name || 'image';
        preview.appendChild(img);
        const caption = document.createElement('span');
        caption.textContent = f.original_name || 'image';
        preview.appendChild(caption);
        preview.addEventListener('click', () => openFilePreview(f));
        body.appendChild(preview);
        return;
      }
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'msg-attach';
      const icon = document.createElement('span');
      icon.textContent = '📎';
      const name = document.createElement('span');
      name.className = 'msg-attach-name';
      name.textContent = f.original_name || 'file';
      link.appendChild(icon);
      link.appendChild(name);
      if (f.file_size) {
        const meta = document.createElement('span');
        meta.className = 'msg-attach-meta';
        meta.textContent = _humanFileSize(f.file_size);
        link.appendChild(meta);
      }
      link.addEventListener('click', () => {
        if (isFilePreviewable(f)) openFilePreview(f);
        else openExternalUrl(fileUrl(f));
      });
      body.appendChild(link);
    });
    wrap.appendChild(body);
    // v0.4.40: 호버 시 떠오르는 메시지 액션 (답장/고정)
    if (!m.is_system && m.id) {
      const actions = document.createElement('div');
      actions.className = 'msg-actions';
      const btnReply = document.createElement('button');
      btnReply.type = 'button';
      btnReply.className = 'icon-btn ma-btn';
      btnReply.title = '답장';
      btnReply.setAttribute('aria-label', '답장');
      btnReply.innerHTML = '<img src="assets/svg/chat/free-icon-font-hand-back-point-left.svg" alt="" />';
      btnReply.addEventListener('click', (ev) => { ev.stopPropagation(); setReplyTo(m); });
      actions.appendChild(btnReply);
      const btnPin = document.createElement('button');
      btnPin.type = 'button';
      btnPin.className = 'icon-btn ma-btn';
      btnPin.title = m.is_pinned ? '고정 해제' : '고정';
      btnPin.setAttribute('aria-label', btnPin.title);
      btnPin.innerHTML = '<img src="assets/svg/chat/free-icon-font-thumbtack2.svg" alt="" />';
      btnPin.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const wasPinned = !!m.is_pinned;
        try {
          if (wasPinned) await Api.unpinMessage(m.room_id, m.id, state.currentUserId);
          else await Api.pinMessage(m.room_id, m.id, state.currentUserId);
          // 캐시/UI 비파괴 갱신: 메시지 객체 + 해당 .msg 요소만 업데이트
          m.is_pinned = !wasPinned;
          try {
            const cached = _findMessageInRoom(m.room_id, m.id);
            if (cached) cached.is_pinned = m.is_pinned;
          } catch (_) {}
          try { wrap.classList.toggle('is-pinned', m.is_pinned); } catch (_) {}
          try {
            const head = wrap.querySelector('.msg-head');
            if (head) {
              const old = head.querySelector('.msg-pin-icon');
              if (m.is_pinned && !old) {
                const pinSpan = document.createElement('span');
                pinSpan.className = 'msg-pin-icon';
                pinSpan.title = '고정된 메시지';
                pinSpan.innerHTML = '<img src="assets/svg/chat/free-icon-font-thumbtack2.svg" alt="" />';
                head.appendChild(pinSpan);
              } else if (!m.is_pinned && old) {
                old.remove();
              }
            }
          } catch (_) {}
          btnPin.title = m.is_pinned ? '고정 해제' : '고정';
          btnPin.setAttribute('aria-label', btnPin.title);
          // 상단 핀 배너만 다시 로드 (메시지 영역은 건드리지 않음)
          try { await reloadPinned(m.room_id); } catch (_) {}
        } catch (e) { toast('고정 처리 실패: ' + (e.message || ''), 'error'); }
      });
      actions.appendChild(btnPin);
      wrap.appendChild(actions);
    }
    return wrap;
  }

  // v0.4.40: 메시지 캐시에서 ID로 찾기
  function _findMessageInRoom(roomId, msgId) {
    const arr = state.messagesByRoom[roomId] || [];
    for (let i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === msgId) return arr[i];
    return null;
  }
  function _shortenText(s, n) {
    s = stripMessageMarkers(s).replace(/^📊\s*/, '').replace(/\s+/g, ' ').trim();
    if (s.length <= n) return s;
    return s.substring(0, n) + '…';
  }

  const POLL_VOTE_KEY = 'blossom.desktop.pollVotes.v1';
  function loadPollVotes() {
    try {
      const raw = JSON.parse(localStorage.getItem(POLL_VOTE_KEY) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (_) { return {}; }
  }
  function savePollVote(messageId, optionIndex) {
    const votes = loadPollVotes();
    votes[String(messageId)] = Number(optionIndex);
    try { localStorage.setItem(POLL_VOTE_KEY, JSON.stringify(votes)); } catch (_) {}
  }
  function getPollVote(messageId) {
    const v = loadPollVotes()[String(messageId)];
    return Number.isInteger(v) ? v : null;
  }
  function formatPollEndAt(value) {
    if (!value) return '';
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleString();
    } catch (_) { return String(value); }
  }
  function renderPollCard(message, poll, showResults) {
    const card = document.createElement('div');
    card.className = 'msg-poll-card';
    const title = document.createElement('div');
    title.className = 'msg-poll-title';
    title.textContent = poll && poll.question ? poll.question : '투표';
    card.appendChild(title);
    if (poll && poll.end_at) {
      const end = document.createElement('div');
      end.className = 'msg-poll-meta';
      end.textContent = '기간: ' + formatPollEndAt(poll.end_at) + '까지';
      card.appendChild(end);
    }
    const options = Array.isArray(poll && poll.options) ? poll.options.slice(0, 10) : [];
    const selected = getPollVote(message.id);
    showResults = !!showResults;
    options.forEach((option, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'msg-poll-option';
      if (selected === idx) btn.classList.add('selected');
      const label = document.createElement('span');
      label.textContent = String(option || ('항목 ' + (idx + 1)));
      const stateText = document.createElement('small');
      stateText.textContent = showResults ? (selected === idx ? '1표' : '0표') : (selected === idx ? '내 선택' : '투표');
      btn.appendChild(label);
      btn.appendChild(stateText);
      btn.addEventListener('click', () => {
        savePollVote(message.id, idx);
        card.replaceWith(renderPollCard(message, poll));
      });
      card.appendChild(btn);
    });
    const actions = document.createElement('div');
    actions.className = 'msg-poll-actions';
    const resultBtn = document.createElement('button');
    resultBtn.type = 'button';
    resultBtn.className = 'btn-secondary msg-poll-result';
    resultBtn.textContent = '결과보기';
    resultBtn.addEventListener('click', () => {
      card.replaceWith(renderPollCard(message, poll, true));
    });
    actions.appendChild(resultBtn);
    card.appendChild(actions);
    return card;
  }
  function _scrollToMessage(msgId) {
    const area = $('messageArea');
    if (!area) return;
    const node = area.querySelector('.msg[data-msg-id="' + msgId + '"]');
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add('msg-flash');
    setTimeout(() => node.classList.remove('msg-flash'), 1200);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  // v0.4.45: 서버 시각 문자열 파싱 (서버는 naive UTC ISO 문자열을 보냄). 끝에 'Z'/오프셋이 없으면 UTC로 간주.
  function _parseServerDate(s) {
    if (!s) return null;
    if (s instanceof Date) return s;
    let str = String(s);
    // ISO 형태이지만 타임존 표기가 없으면 UTC로 보정
    if (/T\d{2}:\d{2}/.test(str) && !/[zZ]|[+\-]\d{2}:?\d{2}$/.test(str)) {
      str = str + 'Z';
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    return d;
  }
  // 서버와의 시계 오프셋(ms) — Api.serverTime()으로 주기 동기화. 실패 시 0(시스템 시계 사용).
  if (typeof state !== 'undefined' && state && typeof state.serverClockOffsetMs !== 'number') {
    state.serverClockOffsetMs = 0;
  }
  function nowServer() { return new Date(Date.now() + ((state && state.serverClockOffsetMs) || 0)); }
  async function syncServerClock() {
    try {
      const t0 = Date.now();
      const r = await Api.serverTime();
      const t1 = Date.now();
      const rtt = t1 - t0;
      const serverMs = (r && (r.epoch_ms || (r.utc && Date.parse(r.utc)))) || 0;
      if (serverMs > 0) {
        // 보정: 서버시각 + RTT/2 ≈ 응답 도착 시점
        state.serverClockOffsetMs = (serverMs + Math.floor(rtt / 2)) - t1;
      }
    } catch (_) {
      // 실패 시 시스템 시간 사용
      state.serverClockOffsetMs = 0;
    }
  }
  function formatMessage(s) {
    let out = escapeHtml(s);
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    out = out.replace(/\{c:(#[0-9a-fA-F]{3,8})\}([\s\S]*?)\{\/c\}/g, (_m, c, t) => '<span style="color:' + c + '">' + t + '</span>');
    out = out.replace(/(^|\s)\*(\S(?:.*?\S)?)\*(?=\s|$)/g, '$1<strong>$2</strong>');
    out = out.replace(/(^|\s)_(\S(?:.*?\S)?)_(?=\s|$)/g, '$1<em>$2</em>');
    out = out.replace(/(^|\s)\+\+(\S(?:.*?\S)?)\+\+(?=\s|$)/g, '$1<u>$2</u>');
    out = out.replace(/(^|\s)~(\S(?:.*?\S)?)~(?=\s|$)/g, '$1<s>$2</s>');
    out = out.replace(/^(&gt;\s?)(.*)$/gm, '<blockquote>$2</blockquote>');
    // v0.4.40: 멘션 토큰 @이름 (활성 방 멤버 또는 디렉터리 매칭)
    out = out.replace(/@([\uAC00-\uD7A3A-Za-z0-9_.\-]{1,30})/g, function (_m, name) {
      const myName = (state.profile && state.profile.name) || '';
      const isMe = (name === myName);
      return '<span class="mention-tag' + (isMe ? ' mention-me' : '') + '">@' + name + '</span>';
    });
    return out;
  }
  function formatTime(s) {
    if (!s) return '';
    try {
      const d = _parseServerDate(s); if (!d) return '';
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return hh + ':' + mm;
    } catch (_) { return ''; }
  }

  // 메시지 사이 날짜 구분선: 2024년 1월 10일 (수)
  function _dayKey(s) {
    if (!s) return '';
    const d = _parseServerDate(s);
    if (!d) return '';
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function _formatDayLabel(s) {
    const d = _parseServerDate(s); if (!d) return '';
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + days[d.getDay()] + ')';
  }
  function _makeDateSeparator(createdAt) {
    const sep = document.createElement('div');
    sep.className = 'msg-day-sep';
    sep.dataset.daykey = _dayKey(createdAt);
    const span = document.createElement('span');
    span.className = 'msg-day-sep-label';
    span.textContent = _formatDayLabel(createdAt);
    sep.appendChild(span);
    return sep;
  }
  function appendMessageToArea(area, m) {
    const newKey = _dayKey(m.created_at);
    let lastKey = '';
    for (let i = area.children.length - 1; i >= 0; i--) {
      const ch = area.children[i];
      if (ch.classList && ch.classList.contains('msg-day-sep')) { lastKey = ch.dataset.daykey || ''; break; }
      if (ch.classList && ch.classList.contains('msg') && ch.dataset.daykey) { lastKey = ch.dataset.daykey; break; }
    }
    if (newKey && newKey !== lastKey) area.appendChild(_makeDateSeparator(m.created_at));
    const node = renderMessage(m);
    node.dataset.daykey = newKey;
    area.appendChild(node);
  }

  // ── 메시지 전송 ──
  async function sendCurrentMessage() {
    if (!state.activeRoomId || !state.currentUserId) return;
    const ta = $('composerInput');
    const text = ta.value.trim();
    if (!text) return;
    const replyTo = state.replyTo;
    ta.value = '';
    autoResize();
    setReplyTo(null);
    try {
      const opts = replyTo && replyTo.id ? { replyToMessageId: replyTo.id } : undefined;
      const saved = await Api.sendMessage(state.activeRoomId, state.currentUserId, text, opts);
      // 즉시 화면에 추가 (poll 이 곧 따라잡지만 즉시 반영)
      if (saved && saved.id) {
        state.lastMessageIdByRoom[state.activeRoomId] = Math.max(
          state.lastMessageIdByRoom[state.activeRoomId] || 0, saved.id
        );
        // sender 정보가 응답에 없으면 내 프로필로 보강
        if (!saved.sender && state.profile) {
          saved.sender = { id: state.currentUserId, name: state.profile.name, profile_image: state.profile.profile_image };
        }
        state.messagesByRoom[state.activeRoomId] = state.messagesByRoom[state.activeRoomId] || [];
        state.messagesByRoom[state.activeRoomId].push(saved);
        const area = $('messageArea');
        appendMessageToArea(area, saved);
        area.scrollTop = area.scrollHeight;
      }
    } catch (e) {
      toast('메시지 전송 실패: ' + (e.message || ''), 'error');
      ta.value = text;
      if (replyTo) setReplyTo(replyTo);
    }
  }
  $('btnSend').addEventListener('click', sendCurrentMessage);

  // ── v0.4.40: 답장 / 고정 / 멘션 ──
  function setReplyTo(m) {
    state.replyTo = m || null;
    const bar = $('replyPreview');
    if (!bar) return;
    if (!m) { bar.hidden = true; return; }
    bar.hidden = false;
    const senderName = (m.sender && m.sender.name) || ('user#' + (m.sender_user_id || ''));
    $('replyPreName').textContent = senderName;
    $('replyPreText').textContent = _shortenText(m.content_text || '', 120);
    const pre = $('replyPreview');
    if (pre) pre.title = senderName + '에게 답장';
    setTimeout(() => { const ta = $('composerInput'); if (ta) ta.focus(); }, 0);
  }
  (function bindReplyCancel() {
    const btn = $('replyPreCancel');
    if (btn) btn.addEventListener('click', () => setReplyTo(null));
  })();

  async function reloadPinned(roomId) {
    if (!roomId) return;
    try {
      const data = await Api.listPinned(roomId);
      const items = (data && data.items) || [];
      state.pinnedByRoom[roomId] = items;
      if (roomId === state.activeRoomId) renderPinnedBar();
    } catch (e) { /* silent */ }
  }
  function renderPinnedBar() {
    const bar = $('pinnedBar');
    if (!bar) return;
    const items = state.pinnedByRoom[state.activeRoomId] || [];
    if (!items.length) { bar.hidden = true; return; }
    bar.hidden = false;
    const top = items[0];
    const msg = top && top.message;
    const txt = msg ? ((msg.sender && msg.sender.name ? msg.sender.name + ': ' : '') + _shortenText(msg.content_text || '', 100)) : '고정된 메시지';
    const cntSuffix = items.length > 1 ? '  (+' + (items.length - 1) + ')' : '';
    $('pinnedBarText').textContent = txt + cntSuffix;
  }
  (function bindPinnedBar() {
    const txt = $('pinnedBarText');
    if (txt) txt.addEventListener('click', () => {
      const items = state.pinnedByRoom[state.activeRoomId] || [];
      if (items[0] && items[0].message) _scrollToMessage(items[0].message.id);
    });
    const more = $('pinnedBarMore');
    if (more) more.addEventListener('click', openPinnedListModal);
  })();
  function openPinnedListModal() {
    const m = $('pinnedListModal');
    const body = $('pinnedListBody');
    if (!m || !body) return;
    const items = state.pinnedByRoom[state.activeRoomId] || [];
    body.innerHTML = '';
    if (!items.length) {
      const p = document.createElement('div');
      p.style.cssText = 'padding:24px; text-align:center; color:var(--fg-2);';
      p.textContent = '고정된 메시지가 없습니다.';
      body.appendChild(p);
    } else {
      items.forEach((pin) => {
        const msg = pin.message || {};
        const it = document.createElement('div');
        it.className = 'pl-item';
        const head = document.createElement('div');
        head.className = 'pl-head';
        const a = document.createElement('span');
        a.className = 'pl-author';
        a.textContent = (msg.sender && msg.sender.name) || ('user#' + (msg.sender_user_id || ''));
        head.appendChild(a);
        const t = document.createElement('span');
        t.textContent = formatTime(msg.created_at);
        head.appendChild(t);
        it.appendChild(head);
        const text = document.createElement('div');
        text.className = 'pl-text';
        text.textContent = _shortenText(msg.content_text || '', 240);
        it.appendChild(text);
        const acts = document.createElement('div');
        acts.className = 'pl-actions';
        const goBtn = document.createElement('button');
        goBtn.type = 'button'; goBtn.className = 'btn-secondary';
        goBtn.textContent = '원문으로 이동';
        goBtn.addEventListener('click', (ev) => { ev.stopPropagation(); closeModalById('pinnedListModal'); _scrollToMessage(msg.id); });
        acts.appendChild(goBtn);
        const unBtn = document.createElement('button');
        unBtn.type = 'button'; unBtn.className = 'btn-secondary';
        unBtn.textContent = '고정 해제';
        unBtn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          try {
            await Api.unpinMessage(msg.room_id || state.activeRoomId, msg.id, state.currentUserId);
            // 캐시 비파괴 갱신: is_pinned 플래그 + 해당 .msg DOM만 토글
            try {
              const cached = _findMessageInRoom(state.activeRoomId, msg.id);
              if (cached) cached.is_pinned = false;
            } catch (_) {}
            try {
              const el = document.querySelector('.msg[data-msg-id="' + msg.id + '"]');
              if (el) {
                el.classList.remove('is-pinned');
                const ic = el.querySelector('.msg-pin-icon'); if (ic) ic.remove();
              }
            } catch (_) {}
            await reloadPinned(state.activeRoomId);
            openPinnedListModal();
          } catch (e) { toast('고정 해제 실패: ' + (e.message || ''), 'error'); }
        });
        acts.appendChild(unBtn);
        it.appendChild(acts);
        body.appendChild(it);
      });
    }
    m.hidden = false;
  }
  function closeModalById(id) { const m = document.getElementById(id); if (m) m.hidden = true; }
  document.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t && t.matches && t.matches('[data-close]')) {
      const id = t.getAttribute('data-close'); if (id) closeModalById(id);
    }
  });

  // ── 멘션 자동완성 ──
  const mention = { open: false, anchor: 0, query: '', items: [], active: 0 };
  function _getDirectoryUsers() {
    const out = [];
    if (Array.isArray(state.lastDirectoryUsers) && state.lastDirectoryUsers.length) {
      for (const u of state.lastDirectoryUsers) if (u && u.name) out.push({ id: u.id, name: u.name, dept: u.department || '' });
    }
    if (state.activeRoom && state.activeRoom.members) {
      for (const m of state.activeRoom.members) {
        if (!m || m.user_id === state.currentUserId) continue;
        if (m.left_at) continue;
        const nm = (m.user && m.user.name) || m.name || '';
        if (nm && !out.find((x) => x.name === nm)) out.push({ id: m.user_id, name: nm, dept: (m.user && m.user.department) || '' });
      }
    }
    return out;
  }
  function _findMentionContext(ta) {
    const v = ta.value || '';
    const pos = ta.selectionStart || 0;
    const left = v.substring(0, pos);
    const at = left.lastIndexOf('@');
    if (at < 0) return null;
    // @ 앞 글자가 공백/줄시작이어야 멘션
    if (at > 0 && !/\s/.test(left.charAt(at - 1))) return null;
    const token = left.substring(at + 1);
    if (/\s/.test(token)) return null;
    if (token.length > 30) return null;
    return { start: at, end: pos, query: token };
  }
  function _renderMentionPopover() {
    const pop = $('mentionPopover');
    if (!pop) return;
    if (!mention.open || !mention.items.length) { pop.hidden = true; pop.innerHTML = ''; return; }
    pop.hidden = false;
    pop.innerHTML = '';
    mention.items.forEach((u, idx) => {
      const it = document.createElement('div');
      it.className = 'mention-item' + (idx === mention.active ? ' active' : '');
      const nm = document.createElement('span'); nm.className = 'mi-name'; nm.textContent = u.name;
      const sub = document.createElement('span'); sub.className = 'mi-sub'; sub.textContent = u.dept || '';
      it.appendChild(nm);
      if (sub.textContent) { it.appendChild(document.createTextNode(' · ')); it.appendChild(sub); }
      it.addEventListener('mousedown', (ev) => { ev.preventDefault(); _applyMention(u); });
      pop.appendChild(it);
    });
  }
  function _applyMention(u) {
    const ta = $('composerInput');
    if (!ta || !u || !u.name) return;
    const ctx = _findMentionContext(ta);
    if (!ctx) return;
    const v = ta.value;
    const before = v.substring(0, ctx.start);
    const after = v.substring(ctx.end);
    const insert = '@' + u.name + ' ';
    ta.value = before + insert + after;
    const newPos = (before + insert).length;
    ta.setSelectionRange(newPos, newPos);
    mention.open = false; mention.items = []; mention.active = 0;
    _renderMentionPopover();
    ta.focus();
  }
  function _updateMention() {
    const ta = $('composerInput');
    if (!ta) return;
    const ctx = _findMentionContext(ta);
    if (!ctx) { mention.open = false; mention.items = []; _renderMentionPopover(); return; }
    const q = (ctx.query || '').toLowerCase();
    const all = _getDirectoryUsers();
    const filtered = all.filter((u) => !q || (u.name && u.name.toLowerCase().indexOf(q) >= 0)).slice(0, 8);
    mention.open = filtered.length > 0;
    mention.items = filtered;
    if (mention.active >= filtered.length) mention.active = 0;
    _renderMentionPopover();
  }
  (function bindMention() {
    const ta = $('composerInput');
    if (!ta) return;
    ta.addEventListener('input', _updateMention);
    ta.addEventListener('keyup', _updateMention);
    ta.addEventListener('click', _updateMention);
    ta.addEventListener('blur', () => setTimeout(() => { mention.open = false; _renderMentionPopover(); }, 100));
    ta.addEventListener('keydown', (ev) => {
      if (!mention.open || !mention.items.length) return;
      if (ev.key === 'ArrowDown') { ev.preventDefault(); mention.active = (mention.active + 1) % mention.items.length; _renderMentionPopover(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); mention.active = (mention.active - 1 + mention.items.length) % mention.items.length; _renderMentionPopover(); }
      else if (ev.key === 'Enter' || ev.key === 'Tab') {
        if (mention.items[mention.active]) { ev.preventDefault(); _applyMention(mention.items[mention.active]); }
      } else if (ev.key === 'Escape') { mention.open = false; _renderMentionPopover(); }
    }, true);
  })();

  // ── v0.4.41: 채팅방 내부 탭 (대화/파일/아이디어/업무리스트) ──
  let _activeRoomTab = 'chat';
  let _activeChatKindFilter = 'all';
  let _roomFileItems = [];
  let _activeFileTypeFilter = 'all';
  let _selectedRoomFileIds = new Set();
  function classifyMessageKind(m) {
    const text = String((m && m.content_text) || '').toLowerCase();
    const myName = String((state.profile && (state.profile.name || state.profile.nickname)) || '').toLowerCase();
    if (m && m.reply_to_message_id) return 'thread';
    if (m && m.is_system) return 'system';
    if (/공지|notice|\[공지\]/i.test(text)) return 'notice';
    if (/승인|approval|결재|검토 요청/i.test(text)) return 'approval';
    if (/장애|incident|alert|critical|down|failure|긴급/i.test(text)) return 'incident';
    if (myName && text.indexOf('@' + myName) >= 0) return 'mention';
    if (/@[^\s]+/.test(text)) return 'mention';
    return 'chat';
  }
  function applyChatKindFilter() {
    const area = $('messageArea');
    if (!area) return;
    area.querySelectorAll('.msg').forEach((node) => {
      const kind = node.dataset.msgKind || 'chat';
      node.hidden = _activeChatKindFilter !== 'all' && kind !== _activeChatKindFilter;
    });
  }
  function updateChatContextCounts() {
    const roomId = state.activeRoomId;
    const items = (roomId && state.messagesByRoom[roomId]) || [];
    const counts = { thread: 0, notice: 0, mention: 0, system: 0, approval: 0, incident: 0 };
    items.forEach((m) => {
      const k = classifyMessageKind(m);
      if (counts[k] !== undefined) counts[k] += 1;
    });
    const pairs = [
      ['rccThreadCount', '스레드 ', counts.thread],
      ['rccNoticeCount', '공지 ', counts.notice],
      ['rccMentionCount', '멘션 ', counts.mention],
      ['rccSystemCount', '시스템 로그 ', counts.system],
      ['rccApprovalCount', '승인 요청 ', counts.approval],
      ['rccIncidentCount', '장애 알림 ', counts.incident],
    ];
    pairs.forEach(([id, label, count]) => { const el = $(id); if (el) el.textContent = label + count; });
  }
  function setActiveRoomTab(tabName) {
    _activeRoomTab = tabName;
    const tabs = $('roomTabs');
    if (tabs && state.activeRoomId) tabs.hidden = false;
    document.querySelectorAll('.room-tab').forEach((b) => {
      const on = b.dataset.roomTab === tabName;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.room-pane').forEach((p) => {
      const on = p.dataset.roomPane === tabName;
      p.classList.toggle('is-active', on);
      p.hidden = !on;
    });
    const ctx = $('roomChatContext');
    if (ctx) ctx.hidden = tabName !== 'chat';
    const composer = $('composer');
    if (composer) {
      // v0.4.52: composer 는 항상 표시 — 탭 전환 시 아무것도 안 함
    }
    if (!state.activeRoomId) return;
    if (tabName === 'chat') { updateChatContextCounts(); applyChatKindFilter(); }
    if (tabName === 'files') reloadRoomFiles(state.activeRoomId);
    else if (tabName === 'ideas') reloadRoomIdeas(state.activeRoomId);
    else if (tabName === 'tasks') reloadRoomTasks(state.activeRoomId);
    else if (tabName === 'members') reloadRoomMembers(state.activeRoomId);
  }
  (function bindRoomTabs() {
    document.querySelectorAll('.room-tab').forEach((b) => {
      b.addEventListener('click', () => setActiveRoomTab(b.dataset.roomTab));
    });
    document.querySelectorAll('.rcc-filter').forEach((b) => {
      b.addEventListener('click', () => {
        _activeChatKindFilter = b.dataset.chatKind || 'all';
        document.querySelectorAll('.rcc-filter').forEach((x) => x.classList.toggle('active', x === b));
        applyChatKindFilter();
      });
    });
  })();

  // v0.4.48: 기본 노출 → 1:1/다자 DM이 확실한 경우에만 숨김
  function _updateMembersTabVisibility() {
    const tab = document.querySelector('.room-tab[data-room-tab="members"]');
    if (!tab) return;
    tab.style.display = '';
    tab.hidden = false;
  }
  function updateRoomTabDot(tabName, on) {
    const tab = document.querySelector('.room-tab[data-room-tab="' + tabName + '"]');
    const dot = tab && tab.querySelector('.rt-dot');
    if (dot) dot.hidden = !on;
  }
  function _roomTabSeenKey(roomId) { return 'blossom_room_tab_seen:' + roomId; }
  function _getRoomTabSeen(roomId) {
    try { return JSON.parse(localStorage.getItem(_roomTabSeenKey(roomId)) || '{}') || {}; } catch (_) { return {}; }
  }
  function _setRoomTabSeen(roomId, tabName, count) {
    if (!roomId || !tabName) return;
    try {
      const seen = _getRoomTabSeen(roomId);
      seen[tabName] = Number(count || 0);
      localStorage.setItem(_roomTabSeenKey(roomId), JSON.stringify(seen));
    } catch (_) {}
  }
  function updateRoomTabDotCount(tabName, count) {
    const roomId = state.activeRoomId;
    const n = Number(count || 0);
    const tab = document.querySelector('.room-tab[data-room-tab="' + tabName + '"]');
    const isActive = tab && tab.classList.contains('active');
    const seen = _getRoomTabSeen(roomId);
    if (seen[tabName] == null || isActive) {
      _setRoomTabSeen(roomId, tabName, n);
      updateRoomTabDot(tabName, false);
      return;
    }
    updateRoomTabDot(tabName, n > Number(seen[tabName] || 0));
  }
  async function refreshRoomTabDots(roomId) {
    if (!roomId) {
      ['files', 'ideas', 'tasks', 'members'].forEach((tab) => updateRoomTabDot(tab, false));
      return;
    }
    try {
      const [files, ideas, tasks, members] = await Promise.allSettled([
        Api.listRoomFiles(roomId),
        Api.listRoomIdeas(roomId),
        Api.listRoomTasks(roomId),
        Api.listRoomMembers(roomId),
      ]);
      if (roomId !== state.activeRoomId) return;
      updateRoomTabDotCount('files', ((files.value || {}).items || []).length);
      updateRoomTabDotCount('ideas', ((ideas.value || {}).items || []).length);
      updateRoomTabDotCount('tasks', ((tasks.value || {}).items || []).length);
      const memberItems = Array.isArray(members.value) ? members.value : (((members.value || {}).items) || []);
      updateRoomTabDotCount('members', memberItems.filter((m) => !m.left_at).length);
    } catch (_) {}
  }

  function _humanFileSize(n) {
    if (!n && n !== 0) return '';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0; let v = Number(n);
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return v.toFixed(v < 10 && i > 0 ? 1 : 0) + ' ' + u[i];
  }
  function _formatDateTime(s) {
    if (!s) return '';
    try {
      const d = _parseServerDate(s); if (!d) return '';
      const pad = (x) => String(x).padStart(2, '0');
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (_) { return ''; }
  }

  async function reloadRoomFiles(roomId) {
    const list = $('filesList'); const empty = $('filesEmpty'); const cnt = $('filesCount');
    if (!list) return;
    list.innerHTML = '<div class="rp-empty">불러오는 중…</div>';
    if (empty) empty.hidden = true;
    try {
      const data = await Api.listRoomFiles(roomId);
      if (roomId !== state.activeRoomId) return;
      const items = (data && data.items) || [];
      _roomFileItems = items;
      const liveIds = new Set(items.map((x) => String(x.id)));
      _selectedRoomFileIds.forEach((id) => { if (!liveIds.has(String(id))) _selectedRoomFileIds.delete(id); });
      updateRoomTabDotCount('files', items.length);
      renderRoomFiles();
    } catch (e) {
      list.innerHTML = '';
      if (empty) { empty.hidden = false; empty.textContent = '파일을 불러오지 못했습니다: ' + (e.message || ''); }
    }
  }
  function _fileKind(f) {
    const n = String((f && (f.original_name || f.file_name || f.file_path)) || '').toLowerCase();
    const ct = String((f && (f.content_type || f.file_type || f.mime_type)) || '').toLowerCase();
    if (ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(n)) return 'image';
    if (ct === 'application/pdf' || ct.startsWith('text/') || /\.(pdf|txt|md|csv|log|json|xml|docx?|hwp|hwpx)$/i.test(n)) return 'doc';
    if (/\.(zip|7z|rar|tar|gz)$/i.test(n)) return 'archive';
    return 'etc';
  }

  function _filePreviewKind(f) {
    const n = String((f && (f.original_name || f.file_name || f.file_path)) || '').toLowerCase();
    const ct = String((f && (f.content_type || f.file_type || f.mime_type)) || '').toLowerCase();
    if (ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(n)) return 'image';
    if (ct === 'application/pdf' || /\.pdf$/i.test(n)) return 'pdf';
    if (ct.startsWith('text/') || /\.(txt|log|json|xml)$/i.test(n)) return 'text';
    if (/\.(docx)$/i.test(n)) return 'word';
    if (/\.(doc)$/i.test(n)) return 'legacy-word';
    if (/\.(hwp|hwpx)$/i.test(n)) return 'hwp';
    if (/\.(zip)$/i.test(n)) return 'zip';
    return 'other';
  }

  function isFilePreviewable(f) {
    const kind = _filePreviewKind(f);
    return ['image', 'pdf', 'text', 'word', 'legacy-word', 'hwp', 'zip'].indexOf(kind) >= 0;
  }

  function fileExtensionOf(name) {
    const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }

  function normalizedAllowedFileExtensions() {
    const raw = String((state.settings && state.settings.allowedFileExtensions) || '').trim();
    return raw.split(/[\s,;]+/).map((x) => x.replace(/^\./, '').toLowerCase()).filter(Boolean);
  }

  function validateUploadFileByPolicy(file) {
    const maxMb = Math.min(500, Math.max(1, parseInt(String((state.settings && state.settings.maxUploadMb) || 50), 10) || 50));
    const maxBytes = maxMb * 1024 * 1024;
    if (file && file.size > maxBytes) {
      return '파일 용량은 ' + maxMb + 'MB 이하만 첨부할 수 있습니다: ' + file.name;
    }
    const allowed = normalizedAllowedFileExtensions();
    const ext = fileExtensionOf(file && file.name);
    if (allowed.length && (!ext || allowed.indexOf(ext) < 0)) {
      return '허용되지 않는 파일 형식입니다: ' + (file && file.name ? file.name : 'file') + ' (허용: ' + allowed.join(', ') + ')';
    }
    return '';
  }

  function applyFileInputPolicy() {
    const input = $('fileInput');
    if (!input) return;
    const allowed = normalizedAllowedFileExtensions();
    input.accept = allowed.length ? allowed.map((x) => '.' + x).join(',') : '';
  }

  function fileUrl(f, opts) {
    if (!f) return '';
    const path = f.file_path || f.download_url || f.raw_url || '';
    if (!path) return '';
    let url = path && /^https?:/i.test(path) ? path : (state.serverUrl + path);
    if (url && opts && opts.inline) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'inline=1';
    return url;
  }

  function openExternalUrl(url) {
    if (!url) return;
    try {
      if (window.blossom && window.blossom.app && window.blossom.app.openExternal) window.blossom.app.openExternal(url);
      else window.open(url, '_blank');
    } catch (_) {
      window.open(url, '_blank');
    }
  }

  let _filePreviewToken = 0;
  const _previewLibs = {};
  const _previewState = { pdf: null, image: null };

  function nodeModuleUrl(path) {
    return new URL('../node_modules/' + path, window.location.href).href;
  }

  function setPreviewToolbar(html) {
    const toolbar = $('filePreviewToolbar');
    if (!toolbar) return null;
    toolbar.innerHTML = html || '';
    toolbar.hidden = !html;
    return toolbar;
  }

  function setPreviewLoading(body, message) {
    body.className = 'file-preview-body';
    body.innerHTML = '<div class="file-preview-note"><strong>' + escapeHtml(message || '불러오는 중...') + '</strong></div>';
  }

  function setPreviewNote(body, title, message) {
    body.className = 'file-preview-body';
    body.innerHTML = '<div class="file-preview-note"><strong>' + escapeHtml(title || '미리보기 불가') + '</strong><br>' + escapeHtml(message || '다운로드해서 확인하세요.').replace(/\n/g, '<br>') + '</div>';
  }

  function normalizePreviewBuffer(raw) {
    if (!raw) return null;
    if (raw instanceof ArrayBuffer) return raw;
    if (ArrayBuffer.isView(raw)) {
      return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    }
    if (raw.type === 'Buffer' && Array.isArray(raw.data)) {
      const bytes = new Uint8Array(raw.data);
      return bytes.buffer;
    }
    if (Array.isArray(raw)) {
      const bytes = new Uint8Array(raw);
      return bytes.buffer;
    }
    return null;
  }

  async function fetchPreviewBufferViaMain(url) {
    if (!(window.blossom && window.blossom.preview && window.blossom.preview.fetchArrayBuffer)) return null;
    const viaMain = await window.blossom.preview.fetchArrayBuffer(url);
    if (viaMain && viaMain.ok && viaMain.buffer) {
      const normalized = normalizePreviewBuffer(viaMain.buffer);
      if (normalized) return normalized;
    }
    const err = new Error((viaMain && viaMain.error) || ('HTTP ' + ((viaMain && viaMain.status) || 0)));
    err.status = viaMain && viaMain.status;
    throw err;
  }

  async function fetchPreviewBuffer(url, opts) {
    if (opts && opts.preferMain) {
      const viaMain = await fetchPreviewBufferViaMain(url);
      if (viaMain) return viaMain;
    }
    try {
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) {
        const err = new Error('HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      return await res.arrayBuffer();
    } catch (fetchErr) {
      const viaMain = await fetchPreviewBufferViaMain(url);
      if (viaMain) return viaMain;
      throw fetchErr;
    }
  }

  function loadScriptOnce(src, globalName) {
    if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
    if (_previewLibs[src]) return _previewLibs[src];
    _previewLibs[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve(globalName ? window[globalName] : true);
      s.onerror = () => reject(new Error('라이브러리를 불러오지 못했습니다: ' + src));
      document.head.appendChild(s);
    });
    return _previewLibs[src];
  }

  async function loadPdfJs() {
    if (_previewLibs.pdfjs) return _previewLibs.pdfjs;
    _previewLibs.pdfjs = import(nodeModuleUrl('pdfjs-dist/legacy/build/pdf.mjs')).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = nodeModuleUrl('pdfjs-dist/legacy/build/pdf.worker.mjs');
      return pdfjs;
    });
    return _previewLibs.pdfjs;
  }

  async function renderPdfPreview(body, url, token) {
    body.className = 'file-preview-body is-document-preview';
    const scroll = document.createElement('div');
    scroll.className = 'file-preview-pdf-scroll';
    const canvas = document.createElement('canvas');
    canvas.className = 'file-preview-pdf-page';
    scroll.appendChild(canvas);
    body.innerHTML = '';
    body.appendChild(scroll);
    setPreviewToolbar('<button id="fpPdfPrev">이전</button><span id="fpPdfPage">- / -</span><button id="fpPdfNext">다음</button><span class="fpv-spacer"></span><button id="fpPdfFit">너비 맞춤</button><button id="fpPdfActual">실제 크기</button><button id="fpPdfOut">-</button><span id="fpPdfZoom">100%</span><button id="fpPdfIn">+</button>');
    const buffer = await fetchPreviewBuffer(url, { preferMain: true });
    if (!(new Uint8Array(buffer, 0, Math.min(5, buffer.byteLength || 0))[0] === 0x25)) {
      throw new Error('PDF 파일 데이터가 아닙니다. 로그인 만료 또는 다운로드 응답을 확인하세요.');
    }
    const pdfjs = await loadPdfJs();
    if (token !== _filePreviewToken) return;
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
    if (_previewState.pdf && _previewState.pdf.resizeObserver) {
      try { _previewState.pdf.resizeObserver.disconnect(); } catch (_) {}
    }
    _previewState.pdf = {
      pdf,
      page: 1,
      mode: 'fit',
      zoom: 1.1,
      canvas,
      scroll,
      resizeObserver: null,
      renderTask: null,
      resizeFrame: 0,
    };
    function computePdfScale(page, st) {
      const base = page.getViewport({ scale: 1 });
      if (st.mode === 'actual') return st.zoom;
      const available = Math.max(320, (st.scroll.clientWidth || body.clientWidth || 850) - 48);
      const fitScale = available / base.width;
      return Math.max(0.25, Math.min(4, fitScale * st.zoom));
    }
    async function renderPage() {
      const st = _previewState.pdf;
      if (!st || token !== _filePreviewToken) return;
      if (st.renderTask && st.renderTask.cancel) {
        try { st.renderTask.cancel(); } catch (_) {}
      }
      const page = await st.pdf.getPage(st.page);
      const scale = computePdfScale(page, st);
      const viewport = page.getViewport({ scale });
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      st.canvas.width = Math.floor(viewport.width * dpr);
      st.canvas.height = Math.floor(viewport.height * dpr);
      st.canvas.style.width = Math.floor(viewport.width) + 'px';
      st.canvas.style.height = Math.floor(viewport.height) + 'px';
      const ctx = st.canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      st.renderTask = page.render({ canvasContext: ctx, viewport });
      try {
        await st.renderTask.promise;
      } catch (e) {
        if (e && e.name === 'RenderingCancelledException') return;
        throw e;
      } finally {
        if (st && st.renderTask) st.renderTask = null;
      }
      const pageLabel = $('fpPdfPage');
      const zoomLabel = $('fpPdfZoom');
      if (pageLabel) pageLabel.textContent = st.page + ' / ' + st.pdf.numPages;
      if (zoomLabel) zoomLabel.textContent = (st.mode === 'fit' ? '맞춤 ' : '') + Math.round(st.zoom * 100) + '%';
      const prev = $('fpPdfPrev'), next = $('fpPdfNext');
      if (prev) prev.disabled = st.page <= 1;
      if (next) next.disabled = st.page >= st.pdf.numPages;
      const fit = $('fpPdfFit'), actual = $('fpPdfActual');
      if (fit) fit.disabled = st.mode === 'fit';
      if (actual) actual.disabled = st.mode === 'actual';
    }
    $('fpPdfPrev').onclick = () => { if (_previewState.pdf.page > 1) { _previewState.pdf.page -= 1; renderPage(); } };
    $('fpPdfNext').onclick = () => { if (_previewState.pdf.page < _previewState.pdf.pdf.numPages) { _previewState.pdf.page += 1; renderPage(); } };
    $('fpPdfFit').onclick = () => { _previewState.pdf.mode = 'fit'; _previewState.pdf.zoom = 1.1; renderPage(); };
    $('fpPdfActual').onclick = () => { _previewState.pdf.mode = 'actual'; _previewState.pdf.zoom = 1; renderPage(); };
    $('fpPdfOut').onclick = () => { _previewState.pdf.zoom = Math.max(.35, _previewState.pdf.zoom - .15); renderPage(); };
    $('fpPdfIn').onclick = () => { _previewState.pdf.zoom = Math.min(4, _previewState.pdf.zoom + .15); renderPage(); };
    if (window.ResizeObserver) {
      _previewState.pdf.resizeObserver = new ResizeObserver(() => {
        const st = _previewState.pdf;
        if (!st || token !== _filePreviewToken || st.mode !== 'fit') return;
        if (st.resizeFrame) cancelAnimationFrame(st.resizeFrame);
        st.resizeFrame = requestAnimationFrame(() => {
          st.resizeFrame = 0;
          renderPage();
        });
      });
      _previewState.pdf.resizeObserver.observe(scroll);
    }
    await renderPage();
  }

  function renderImagePreview(body, url, name) {
    body.className = 'file-preview-body is-document-preview';
    const wrap = document.createElement('div');
    wrap.className = 'file-preview-image-wrap';
    const img = document.createElement('img');
    img.className = 'file-preview-image';
    img.src = url;
    img.alt = name;
    let scale = 1;
    function applyScale() {
      img.style.maxWidth = 'none';
      img.style.maxHeight = 'none';
      img.style.width = scale === 1 ? 'auto' : (img.naturalWidth * scale) + 'px';
      img.style.height = scale === 1 ? 'auto' : (img.naturalHeight * scale) + 'px';
      const z = $('fpImgZoom');
      if (z) z.textContent = Math.round(scale * 100) + '%';
    }
    img.onload = () => {
      const s = $('fpImgSize');
      if (s) s.textContent = img.naturalWidth + ' x ' + img.naturalHeight;
      applyScale();
    };
    wrap.appendChild(img);
    body.innerHTML = '';
    body.appendChild(wrap);
    setPreviewToolbar('<button id="fpImgOut">-</button><span id="fpImgZoom">100%</span><button id="fpImgIn">+</button><button id="fpImgOriginal">원본 크기</button><span class="fpv-spacer"></span><span id="fpImgSize">-</span>');
    $('fpImgOut').onclick = () => { scale = Math.max(.2, scale - .2); applyScale(); };
    $('fpImgIn').onclick = () => { scale = Math.min(4, scale + .2); applyScale(); };
    $('fpImgOriginal').onclick = () => { scale = 1; applyScale(); };
  }

  async function renderWordPreview(body, url) {
    body.className = 'file-preview-body is-scroll-preview';
    setPreviewToolbar('');
    const doc = document.createElement('div');
    doc.className = 'file-preview-doc';
    doc.textContent = 'Word 문서를 불러오는 중...';
    body.innerHTML = '';
    body.appendChild(doc);
    const mammoth = await loadScriptOnce(nodeModuleUrl('mammoth/mammoth.browser.min.js'), 'mammoth');
    const buffer = await fetchPreviewBuffer(url);
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    doc.innerHTML = result.value || '<p>표시할 내용이 없습니다.</p>';
    if (result.messages && result.messages.length) {
      const warn = document.createElement('div');
      warn.className = 'file-preview-note';
      warn.textContent = '일부 서식은 원본과 다를 수 있습니다.';
      doc.prepend(warn);
    }
  }

  async function renderTextPreview(body, url, name) {
    body.className = 'file-preview-body is-scroll-preview';
    setPreviewToolbar('<span>텍스트 미리보기</span><span class="fpv-spacer"></span><span>대용량 파일은 일부만 표시될 수 있습니다.</span>');
    const pre = document.createElement('pre');
    pre.className = 'file-preview-text';
    pre.textContent = '텍스트를 불러오는 중...';
    body.innerHTML = '';
    body.appendChild(pre);
    const buffer = await fetchPreviewBuffer(url);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    pre.textContent = text.length > 1000000 ? text.slice(0, 1000000) + '\n\n... (1MB 이후 생략)' : text;
  }

  async function renderZipPreview(body, url) {
    body.className = 'file-preview-body is-scroll-preview';
    setPreviewToolbar('<span>ZIP 내부 파일 목록</span><span class="fpv-spacer"></span><span>압축 해제 없이 중앙 디렉터리만 읽습니다.</span>');
    const zipBox = document.createElement('div');
    zipBox.className = 'file-preview-zip';
    zipBox.textContent = '압축 파일 목록을 불러오는 중...';
    body.innerHTML = '';
    body.appendChild(zipBox);
    const JSZip = await loadScriptOnce(nodeModuleUrl('jszip/dist/jszip.min.js'), 'JSZip');
    const buffer = await fetchPreviewBuffer(url);
    const zip = await JSZip.loadAsync(buffer);
    const rows = Object.keys(zip.files).slice(0, 500).map((name) => {
      const item = zip.files[name];
      return '<div class="file-preview-zip-row"><strong title="' + escapeHtml(name) + '">' + escapeHtml(name) + '</strong><span>' + (item.dir ? '폴더' : _humanFileSize(item._data && item._data.uncompressedSize || 0)) + '</span><span>' + (item.date ? item.date.toLocaleString() : '') + '</span></div>';
    }).join('');
    zipBox.innerHTML = rows || '<div class="file-preview-note">압축 파일이 비어 있습니다.</div>';
  }

  function openFilePreview(f) {
    const modal = $('filePreviewModal');
    const body = $('filePreviewBody');
    const title = $('filePreviewTitle');
    const openBtn = $('filePreviewOpen');
    const downBtn = $('filePreviewDownload');
    if (!modal || !body) return;
    const token = ++_filePreviewToken;
    const url = fileUrl(f, { inline: true });
    const downloadUrl = fileUrl(f);
    const name = (f && (f.original_name || f.file_name)) || 'file';
    const kind = _filePreviewKind(f);
    if (title) title.textContent = name;
    setPreviewLoading(body, '미리보기를 준비하는 중...');
    if (openBtn) openBtn.onclick = () => openExternalUrl(url);
    if (downBtn) downBtn.onclick = () => openExternalUrl(downloadUrl);
    modal.hidden = false;
    Promise.resolve().then(async () => {
      if (kind === 'image') renderImagePreview(body, url, name);
      else if (kind === 'pdf') await renderPdfPreview(body, url, token);
      else if (kind === 'word') await renderWordPreview(body, url);
      else if (kind === 'text') await renderTextPreview(body, url, name);
      else if (kind === 'zip') await renderZipPreview(body, url);
      else if (kind === 'legacy-word') setPreviewNote(body, 'DOC 미리보기는 서버 변환이 필요합니다.', '구형 .doc 파일은 브라우저에서 직접 렌더링하기 어렵습니다. 서버에서 LibreOffice로 PDF 변환 후 PDF 뷰어로 보여주는 방식이 가장 안정적입니다.');
      else if (kind === 'hwp') setPreviewNote(body, 'HWP/HWPX 미리보기는 서버 변환이 필요합니다.', '브라우저 직접 렌더링 품질이 안정적이지 않습니다. 업로드 후 LibreOffice/전용 변환기 또는 문서 변환 서버에서 PDF로 변환해 미리보기하는 구조를 권장합니다.');
      else setPreviewNote(body, '미지원 파일 형식입니다.', '새 창으로 열거나 다운로드해서 확인하세요.');
    }).catch((e) => {
      if (token !== _filePreviewToken) return;
      setPreviewNote(body, '미리보기를 불러오지 못했습니다.', (e && e.status === 403) ? '파일 접근 권한이 없습니다.' : (e && e.message) || '손상 파일이거나 지원하지 않는 형식입니다.');
    });
  }

  function renderRoomFiles() {
    const list = $('filesList'); const empty = $('filesEmpty'); const cnt = $('filesCount');
    if (!list) return;
    const q = String(($('filesSearchInput') && $('filesSearchInput').value) || '').trim().toLowerCase();
    const type = _activeFileTypeFilter || 'all';
    const items = (_roomFileItems || []).filter((f) => {
      if (type !== 'all' && _fileKind(f) !== type) return false;
      if (!q) return true;
      const hay = [
        f.original_name,
        f.file_name,
        f.file_path,
        f.uploader && f.uploader.name,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    list.innerHTML = '';
    updateSelectedFilesDeleteButton();
    if (cnt) cnt.textContent = (_roomFileItems.length ? (_roomFileItems.length + '개') : '') + (q || type !== 'all' ? ' · 필터 ' + items.length + '개' : '');
    if (!items.length) { if (empty) { empty.hidden = false; empty.textContent = _roomFileItems.length ? '필터와 일치하는 파일이 없습니다.' : '아직 공유된 파일이 없습니다.'; } return; }
    if (empty) empty.hidden = true;
    items.forEach((f) => {
        const it = document.createElement('div');
        it.className = 'file-item';
        const sel = document.createElement('label');
        sel.className = 'fi-select';
        sel.title = '삭제할 파일 선택';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = _selectedRoomFileIds.has(String(f.id));
        cb.addEventListener('change', () => {
          if (cb.checked) _selectedRoomFileIds.add(String(f.id));
          else _selectedRoomFileIds.delete(String(f.id));
          updateSelectedFilesDeleteButton();
        });
        sel.appendChild(cb);
        it.appendChild(sel);
        const kind = _fileKind(f);
        const ic = document.createElement('div'); ic.className = 'fi-icon'; ic.textContent = kind === 'image' ? '🖼' : kind === 'doc' ? '📄' : kind === 'archive' ? '🗜' : '📎';
        it.appendChild(ic);
        const body = document.createElement('div'); body.className = 'fi-body';
        const nm = document.createElement('div'); nm.className = 'fi-name'; nm.textContent = f.original_name || 'file';
        body.appendChild(nm);
        const meta = document.createElement('div'); meta.className = 'fi-meta';
        const parts = [];
        if (f.uploader && f.uploader.name) parts.push(f.uploader.name);
        if (f.uploaded_at) parts.push(_formatDateTime(f.uploaded_at));
        if (f.file_size) parts.push(_humanFileSize(f.file_size));
        meta.textContent = parts.join(' · ');
        body.appendChild(meta);
        it.appendChild(body);
        const actions = document.createElement('div'); actions.className = 'fi-actions';
        const open = document.createElement('button');
        open.type = 'button'; open.className = 'btn-secondary fi-open';
        open.textContent = isFilePreviewable(f) ? '미리보기' : '열기';
        const openUrl = () => {
          const url = fileUrl(f);
          openExternalUrl(url);
        };
        open.addEventListener('click', () => {
          if (isFilePreviewable(f)) openFilePreview(f);
          else openUrl();
        });
        actions.appendChild(open);
        const down = document.createElement('button');
        down.type = 'button'; down.className = 'btn-secondary fi-open';
        down.textContent = '다운로드';
        down.addEventListener('click', openUrl);
        actions.appendChild(down);
        it.appendChild(actions);
        list.appendChild(it);
      });
  }
  function updateSelectedFilesDeleteButton() {
    const btn = $('filesDeleteSelected');
    if (!btn) return;
    const n = _selectedRoomFileIds.size;
    btn.disabled = n <= 0;
    btn.textContent = n > 0 ? '선택 삭제 (' + n + ')' : '선택 삭제';
  }
  async function deleteRoomFiles(ids) {
    const uniqueIds = Array.from(new Set((ids || []).map((x) => parseInt(String(x), 10)).filter((x) => x > 0)));
    if (!uniqueIds.length) return;
    if (!confirm(uniqueIds.length + '개 파일을 삭제하시겠습니까? 대화창의 해당 첨부도 함께 사라집니다.')) return;
    try {
      for (const id of uniqueIds) {
        await Api.deleteMessageFile(id);
        _selectedRoomFileIds.delete(String(id));
      }
      _roomFileItems = (_roomFileItems || []).filter((f) => uniqueIds.indexOf(parseInt(String(f.id), 10)) < 0);
      renderRoomFiles();
      if (state.activeRoomId) {
        await reloadMessages(state.activeRoomId, true);
        await reloadRoomFiles(state.activeRoomId);
      }
      toast('파일을 삭제했습니다.', 'success');
    } catch (e) {
      toast('파일 삭제 실패: ' + ((e && e.message) || ''), 'error');
    }
  }
  (function bindFileTools() {
    const si = $('filesSearchInput'); if (si) si.addEventListener('input', renderRoomFiles);
    const del = $('filesDeleteSelected'); if (del) del.addEventListener('click', () => deleteRoomFiles(Array.from(_selectedRoomFileIds)));
    document.querySelectorAll('#filesTypeFilter .rp-filter-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        _activeFileTypeFilter = btn.dataset.fileType || 'all';
        document.querySelectorAll('#filesTypeFilter .rp-filter-pill').forEach((x) => x.classList.toggle('active', x === btn));
        renderRoomFiles();
      });
    });
  })();

  // ── 아이디어 ──
  let _ideaEditingId = null;
  let _ideaEditingComments = [];
  function _ideaStatusLabel(s) { return ({ review: '검토중', in_progress: '진행중', done: '완료', hold: '보류' })[s] || '검토중'; }
  function _chatIcon(name) { return 'assets/svg/chat/' + name; }
  function _iconActionButton(iconName, label, extraClass) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-secondary icon-action' + (extraClass ? ' ' + extraClass : '');
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = '<img src="' + _chatIcon(iconName) + '" alt="" />';
    return btn;
  }
  function _userAvatarNode(user, sizeClass) {
    const av = document.createElement('span');
    av.className = 'avatar ' + (sizeClass || 'avatar-sm');
    setAvatar(av, user && user.profile_image, user && user.id, user && user.name);
    return av;
  }
  function _normalizeIdeaCommentUser(c) {
    const p = state.profile || {};
    const raw = c.user || { id: c.userId || c.user_id, name: c.name || '사용자', profile_image: c.profile_image };
    const sameAsMe = raw && (
      (raw.id && state.currentUserId && Number(raw.id) === Number(state.currentUserId)) ||
      (raw.name && p.name && raw.name === p.name)
    );
    const profileImage = (raw && raw.profile_image) || (sameAsMe ? p.profile_image : null) || 'assets/svg/profil/free-icon-bussiness-man.svg';
    return {
      id: (raw && raw.id) || c.userId || c.user_id || 0,
      name: (raw && raw.name) || c.name || (sameAsMe && (p.name || p.nickname)) || '사용자',
      profile_image: profileImage,
    };
  }
  function _parseIdeaBody(raw) {
    let s = String(raw || '');
    let comments = [];
    const cm = s.match(/\n?\[댓글데이터:([A-Za-z0-9+/=]+)\]\s*$/);
    if (cm) {
      try { comments = JSON.parse(decodeURIComponent(escape(atob(cm[1])))) || []; } catch (_) { comments = []; }
      s = s.slice(0, cm.index).trimEnd();
    }
    const m = s.match(/^\[상태:(review|in_progress|done|hold)\]\n?/);
    return { status: m ? m[1] : 'review', body: m ? s.slice(m[0].length) : s, comments: comments };
  }
  function _composeIdeaBody(body, status, comments) {
    let out = '[상태:' + (status || 'review') + ']\n' + (body || '');
    if (comments && comments.length) {
      try { out += '\n[댓글데이터:' + btoa(unescape(encodeURIComponent(JSON.stringify(comments)))) + ']'; } catch (_) {}
    }
    return out;
  }
  function _ideaLocalState(id) {
    try {
      const all = JSON.parse(localStorage.getItem('blossom_idea_state') || '{}');
      return all[String(id)] || { votes: [], comments: [] };
    } catch (_) { return { votes: [], comments: [] }; }
  }
  function _saveIdeaLocalState(id, st) {
    try {
      const all = JSON.parse(localStorage.getItem('blossom_idea_state') || '{}');
      all[String(id)] = st;
      localStorage.setItem('blossom_idea_state', JSON.stringify(all));
    } catch (_) {}
  }
  async function reloadRoomIdeas(roomId) {
    const list = $('ideasList'); const empty = $('ideasEmpty');
    if (!list) return;
    list.innerHTML = '<div class="rp-empty">불러오는 중…</div>';
    if (empty) empty.hidden = true;
    try {
      const data = await Api.listRoomIdeas(roomId);
      if (roomId !== state.activeRoomId) return;
      const items = (data && data.items) || [];
      updateRoomTabDotCount('ideas', items.length);
      list.innerHTML = '';
      if (!items.length) { if (empty) { empty.hidden = false; empty.textContent = '등록된 아이디어가 없습니다.'; } return; }
      items.forEach((it) => {
        const parsed = _parseIdeaBody(it.body || '');
        const local = _ideaLocalState(it.id);
        const dbLikes = it.likes || {};
        const likeUsers = Array.isArray(dbLikes.users) ? dbLikes.users : [];
        const dbComments = Array.isArray(it.comments) ? it.comments : null;
        const card = document.createElement('div');
        card.className = 'idea-item';
        const t = document.createElement('div'); t.className = 'ii-title'; t.textContent = it.title || '';
        card.appendChild(t);
        if (parsed.body) {
          const b = document.createElement('div'); b.className = 'ii-body'; b.textContent = parsed.body;
          card.appendChild(b);
        }
        const meta = document.createElement('div'); meta.className = 'ii-meta';
        const status = document.createElement('span');
        status.className = 'ii-status ii-status-' + parsed.status;
        status.textContent = _ideaStatusLabel(parsed.status);
        meta.appendChild(status);
        const vote = document.createElement('button');
        vote.type = 'button'; vote.className = 'ii-vote';
        const voted = dbLikes.liked_by_me || (local.votes || []).indexOf(state.currentUserId) >= 0;
        if (voted) vote.classList.add('is-voted');
        vote.innerHTML = '<img src="' + _chatIcon('free-icon-font-thumbs-up.svg') + '" alt="" /><span>' + (dbLikes.count != null ? dbLikes.count : ((local.votes || []).length || 0)) + '</span>';
        vote.addEventListener('click', async () => {
          try {
            await Api.toggleRoomIdeaLike(state.activeRoomId, it.id);
          } catch (e) {
            const st = _ideaLocalState(it.id);
            const arr = st.votes || [];
            const idx = arr.indexOf(state.currentUserId);
            if (idx >= 0) arr.splice(idx, 1); else arr.push(state.currentUserId);
            st.votes = arr;
            _saveIdeaLocalState(it.id, st);
          }
          reloadRoomIdeas(state.activeRoomId);
        });
        meta.appendChild(vote);
        const author = document.createElement('span');
        author.textContent = (it.created_by && it.created_by.name) || '';
        meta.appendChild(author);
        if (it.created_at) {
          const tm = document.createElement('span'); tm.textContent = _formatDateTime(it.created_at);
          meta.appendChild(tm);
        }
        const actions = document.createElement('div'); actions.className = 'ii-actions';
        const addC = _iconActionButton('free-icon-font-comment-pen.svg', '아이디어 댓글', 'ii-comment-add');
        actions.appendChild(addC);
        if (it.created_by_user_id === state.currentUserId) {
          const ed = _iconActionButton('free-icon-font-pen-square.svg', '아이디어 수정');
          ed.addEventListener('click', () => openIdeaForm(it, parsed));
          actions.appendChild(ed);
          const del = _iconActionButton('free-icon-font-trash-xmark.svg', '아이디어 삭제');
          del.addEventListener('click', async () => {
            if (!confirm('아이디어를 삭제할까요?')) return;
            try { await Api.deleteRoomIdea(state.activeRoomId, it.id); reloadRoomIdeas(state.activeRoomId); }
            catch (e) { toast('삭제 실패: ' + (e.message || ''), 'error'); }
          });
          actions.appendChild(del);
        }
        meta.appendChild(actions);
        card.appendChild(meta);
        if (likeUsers.length) {
          const likeBox = document.createElement('div');
          likeBox.className = 'ii-like-users';
          likeUsers.slice(0, 8).forEach((u) => {
            const chip = document.createElement('span');
            chip.className = 'ii-user-chip';
            chip.appendChild(_userAvatarNode(u, 'avatar-xs'));
            chip.appendChild(document.createTextNode(u.name || ('user#' + u.id)));
            likeBox.appendChild(chip);
          });
          if (likeUsers.length > 8) {
            const more = document.createElement('span');
            more.className = 'ii-user-more';
            more.textContent = '외 ' + (likeUsers.length - 8) + '명';
            likeBox.appendChild(more);
          }
          card.appendChild(likeBox);
        }
        const cmts = document.createElement('div'); cmts.className = 'ii-comments';
        const comments = dbComments || (parsed.comments || []).concat(local.comments || []);
        const cSummary = document.createElement('div');
        cSummary.textContent = comments.length ? ('댓글 ' + comments.length + '개') : '댓글 없음';
        cmts.appendChild(cSummary);
        comments.slice(-3).forEach((c) => {
          const row = document.createElement('div');
          row.className = 'ii-comment-row';
          const user = _normalizeIdeaCommentUser(c);
          row.appendChild(_userAvatarNode(user, 'avatar-xs'));
          const text = document.createElement('span');
          text.textContent = (user.name || '사용자') + ': ' + (c.body || c.text || '');
          row.appendChild(text);
          cmts.appendChild(row);
        });
        addC.addEventListener('click', () => {
          const exists = card.querySelector('.ii-comment-box');
          if (exists) { exists.remove(); return; }
          const box = document.createElement('div');
          box.className = 'ii-comment-box';
          const input = document.createElement('input');
          input.type = 'text';
          input.placeholder = '댓글 입력';
          const save = document.createElement('button');
          save.type = 'button';
          save.className = 'btn-primary';
          save.textContent = '등록';
          const submit = async () => {
            const text = input.value.trim();
            if (!text) return;
            try {
              await Api.createRoomIdeaComment(state.activeRoomId, it.id, text);
            } catch (e) {
              const me = state.profile || {};
              const fallbackComments = (parsed.comments || []).concat([{
                userId: state.currentUserId,
                user: { id: state.currentUserId, name: me.name || me.nickname || '나', profile_image: me.profile_image || null },
                text: text,
                at: new Date().toISOString(),
              }]);
              try {
                await Api.updateRoomIdea(state.activeRoomId, it.id, {
                  title: it.title || '',
                  body: _composeIdeaBody(parsed.body, parsed.status, fallbackComments),
                });
              } catch (_) {
                const st = _ideaLocalState(it.id);
                st.comments = st.comments || [];
                st.comments.push(fallbackComments[fallbackComments.length - 1]);
                _saveIdeaLocalState(it.id, st);
              }
            }
            reloadRoomIdeas(state.activeRoomId);
          };
          save.addEventListener('click', submit);
          input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') submit(); });
          box.appendChild(input);
          box.appendChild(save);
          cmts.appendChild(box);
          setTimeout(() => input.focus(), 0);
        });
        card.appendChild(cmts);
        list.appendChild(card);
      });
    } catch (e) {
      list.innerHTML = '';
      if (empty) { empty.hidden = false; empty.textContent = '아이디어를 불러오지 못했습니다: ' + (e.message || ''); }
    }
  }
  function openIdeaForm(item, parsedBody) {
    _ideaEditingId = item ? item.id : null;
    const parsed = parsedBody || _parseIdeaBody(item ? item.body : '');
    _ideaEditingComments = parsed.comments || [];
    $('ideaFormTitle').textContent = item ? '아이디어 수정' : '아이디어 추가';
    $('ideaFormTitleInput').value = item ? (item.title || '') : '';
    $('ideaFormBodyInput').value = item ? (parsed.body || '') : '';
    if ($('ideaFormStatus')) $('ideaFormStatus').value = parsed.status || 'review';
    $('ideaFormModal').hidden = false;
    setTimeout(() => $('ideaFormTitleInput').focus(), 30);
  }
  (function bindIdeaForm() {
    const addBtn = $('btnIdeaAdd'); if (addBtn) addBtn.addEventListener('click', () => openIdeaForm(null));
    const saveBtn = $('btnIdeaSave');
    if (saveBtn) saveBtn.addEventListener('click', async () => {
      const title = $('ideaFormTitleInput').value.trim();
      const body = $('ideaFormBodyInput').value.trim();
      const status = ($('ideaFormStatus') && $('ideaFormStatus').value) || 'review';
      if (!title) { toast('제목을 입력하세요.', 'info'); return; }
      if (!state.activeRoomId) { toast('채팅방을 먼저 선택하세요.', 'error'); return; }
      saveBtn.disabled = true;
      try {
        if (_ideaEditingId) await Api.updateRoomIdea(state.activeRoomId, _ideaEditingId, { title: title, body: _composeIdeaBody(body, status, _ideaEditingComments) });
        else await Api.createRoomIdea(state.activeRoomId, { title: title, body: _composeIdeaBody(body, status) });
        $('ideaFormModal').hidden = true;
        reloadRoomIdeas(state.activeRoomId);
      } catch (e) {
        const msg = (e && (e.message || (e.payload && (e.payload.message || e.payload.error)))) || '알 수 없는 오류';
        const status = e && e.status ? (' [HTTP ' + e.status + ']') : '';
        toast('아이디어 저장 실패' + status + ': ' + msg, 'error');
        try { console.error('idea save failed', e); } catch (_) {}
      } finally { saveBtn.disabled = false; }
    });
  })();

  // ── 업무리스트 ──
  let _taskEditingId = null;
  function _statusLabel(s) { return ({ 'todo': '대기', 'in_progress': '진행 중', 'done': '완료' })[s] || s; }
  function _priorityLabel(p) { return ({ 'low': '낮음', 'normal': '보통', 'high': '높음' })[p] || p; }
  function _parseTaskDescription(raw) {
    const s = String(raw || '');
    const approval = /^\[승인요청\]\n?/.test(s);
    let body = approval ? s.replace(/^\[승인요청\]\n?/, '') : s;
    let checklist = [];
    const marker = '\n[체크리스트]\n';
    const idx = body.indexOf(marker);
    if (idx >= 0) {
      const tail = body.slice(idx + marker.length);
      body = body.slice(0, idx).trim();
      checklist = tail.split(/\n/).map((x) => x.replace(/^-\s*\[[ x]\]\s*/i, '').trim()).filter(Boolean);
    }
    return { description: body, checklist: checklist, approval: approval };
  }
  function _composeTaskDescription(desc, checklistText, approval) {
    let out = (desc || '').trim();
    const lines = String(checklistText || '').split(/\n/).map((x) => x.trim()).filter(Boolean);
    if (lines.length) out += (out ? '\n' : '') + '[체크리스트]\n' + lines.map((x) => '- [ ] ' + x).join('\n');
    if (approval) out = '[승인요청]\n' + out;
    return out;
  }
  async function reloadRoomTasks(roomId) {
    const list = $('tasksList'); const empty = $('tasksEmpty');
    if (!list) return;
    list.innerHTML = '<div class="rp-empty">불러오는 중…</div>';
    if (empty) empty.hidden = true;
    try {
      const data = await Api.listRoomTasks(roomId);
      if (roomId !== state.activeRoomId) return;
      const items = (data && data.items) || [];
      updateRoomTabDotCount('tasks', items.length);
      list.innerHTML = '';
      if (!items.length) { if (empty) { empty.hidden = false; empty.textContent = '등록된 업무가 없습니다.'; } return; }
      items.forEach((it) => {
        const parsed = _parseTaskDescription(it.description || '');
        const card = document.createElement('div');
        card.className = 'task-item' + (it.status === 'done' ? ' is-done' : '');
        const chk = document.createElement('button'); chk.type = 'button'; chk.className = 'ti-check';
        chk.title = it.status === 'done' ? '완료 해제' : '완료 처리';
        chk.textContent = '✓';
        chk.addEventListener('click', async () => {
          const next = it.status === 'done' ? 'todo' : 'done';
          try { await Api.updateRoomTask(state.activeRoomId, it.id, { status: next }); reloadRoomTasks(state.activeRoomId); }
          catch (e) { toast('상태 변경 실패: ' + (e.message || ''), 'error'); }
        });
        card.appendChild(chk);
        const body = document.createElement('div'); body.className = 'ti-body';
        const t = document.createElement('div'); t.className = 'ti-title'; t.textContent = it.title || '';
        body.appendChild(t);
        if (parsed.description) { const d = document.createElement('div'); d.className = 'ti-desc'; d.textContent = parsed.description; body.appendChild(d); }
        if (parsed.checklist.length) {
          const cl = document.createElement('div'); cl.className = 'ti-checklist';
          parsed.checklist.slice(0, 6).forEach((line) => {
            const row = document.createElement('div'); row.className = 'ti-checkline';
            row.textContent = '☐ ' + line;
            cl.appendChild(row);
          });
          body.appendChild(cl);
        }
        const meta = document.createElement('div'); meta.className = 'ti-meta';
        const st = document.createElement('span'); st.className = 'ti-status'; st.textContent = _statusLabel(it.status); meta.appendChild(st);
        const pri = document.createElement('span'); pri.className = 'ti-pri ti-pri-' + (it.priority || 'normal'); pri.textContent = _priorityLabel(it.priority); meta.appendChild(pri);
        if (parsed.approval) { const ap = document.createElement('span'); ap.className = 'ti-approval'; ap.textContent = '운영/보안 승인 요청'; meta.appendChild(ap); }
        if (it.assignee && it.assignee.name) {
          const a = document.createElement('span');
          a.className = 'ti-meta-icon';
          a.innerHTML = '<img src="assets/svg/chat/free-icon-font-user.svg" alt="" />';
          a.appendChild(document.createTextNode(it.assignee.name));
          meta.appendChild(a);
        }
        if (it.due_date) {
          const dd = document.createElement('span');
          dd.className = 'ti-meta-icon';
          dd.innerHTML = '<img src="assets/svg/chat/free-icon-font-calendar-clock.svg" alt="" />';
          dd.appendChild(document.createTextNode(it.due_date));
          meta.appendChild(dd);
        }
        const actions = document.createElement('div'); actions.className = 'ti-actions';
        if (it.created_by_user_id === state.currentUserId || (it.assignee_user_id === state.currentUserId)) {
          const ed = _iconActionButton('free-icon-font-pen-square.svg', '업무 수정');
          ed.addEventListener('click', () => openTaskForm(it, parsed));
          actions.appendChild(ed);
        }
        if (it.created_by_user_id === state.currentUserId) {
          const del = _iconActionButton('free-icon-font-trash-xmark.svg', '업무 삭제');
          del.addEventListener('click', async () => {
            if (!confirm('업무를 삭제할까요?')) return;
            try { await Api.deleteRoomTask(state.activeRoomId, it.id); reloadRoomTasks(state.activeRoomId); }
            catch (e) { toast('삭제 실패: ' + (e.message || ''), 'error'); }
          });
          actions.appendChild(del);
        }
        meta.appendChild(actions);
        body.appendChild(meta);
        card.appendChild(body);
        list.appendChild(card);
      });
    } catch (e) {
      list.innerHTML = '';
      if (empty) { empty.hidden = false; empty.textContent = '업무를 불러오지 못했습니다: ' + (e.message || ''); }
    }
  }
  function _populateAssignees() {
    const sel = $('taskFormAssignee');
    if (!sel) return;
    sel.innerHTML = '<option value="">담당자 없음</option>';
    const room = state.activeRoom;
    if (!room || !room.members) return;
    room.members.forEach((m) => {
      if (m.left_at) return;
      const opt = document.createElement('option');
      opt.value = String(m.user_id);
      opt.textContent = (m.user && m.user.name) || m.name || ('user#' + m.user_id);
      sel.appendChild(opt);
    });
  }
  let _taskDueFp = null;
  function _ensureTaskDuePicker() {
    if (_taskDueFp || typeof window.flatpickr !== 'function') return _taskDueFp;
    const el = $('taskFormDue'); if (!el) return null;
    try {
      _taskDueFp = window.flatpickr(el, {
        dateFormat: 'Y-m-d',
        locale: (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.ko) || undefined,
        disableMobile: true,
        allowInput: true,
        position: 'auto center',
        appendTo: document.body,
        onOpen: function (_d, _s, fp) { try { fp.calendarContainer.classList.add('blossom-date-popup'); } catch (_) {} },
      });
    } catch (_) {}
    return _taskDueFp;
  }
  function openTaskForm(item, parsedDesc) {
    _taskEditingId = item ? item.id : null;
    const parsed = parsedDesc || _parseTaskDescription(item ? item.description : '');
    $('taskFormTitle').textContent = item ? '업무 수정' : '업무 추가';
    $('taskFormTitleInput').value = item ? (item.title || '') : '';
    $('taskFormDescInput').value = item ? (parsed.description || '') : '';
    $('taskFormStatus').value = item ? (item.status || 'todo') : 'todo';
    $('taskFormPriority').value = item ? (item.priority || 'normal') : 'normal';
    const dueVal = item ? (item.due_date || '') : '';
    $('taskFormDue').value = dueVal;
    _ensureTaskDuePicker();
    if (_taskDueFp) { try { _taskDueFp.setDate(dueVal || null, false); } catch (_) {} }
    _populateAssignees();
    $('taskFormAssignee').value = item && item.assignee_user_id ? String(item.assignee_user_id) : '';
    if ($('taskFormChecklist')) $('taskFormChecklist').value = parsed.checklist.join('\n');
    if ($('taskFormApproval')) $('taskFormApproval').checked = !!parsed.approval;
    $('taskFormModal').hidden = false;
    setTimeout(() => $('taskFormTitleInput').focus(), 30);
  }
  (function bindTaskForm() {
    const addBtn = $('btnTaskAdd'); if (addBtn) addBtn.addEventListener('click', () => openTaskForm(null));
    const saveBtn = $('btnTaskSave');
    if (saveBtn) saveBtn.addEventListener('click', async () => {
      const title = $('taskFormTitleInput').value.trim();
      if (!title) { toast('제목을 입력하세요.', 'info'); return; }
      const payload = {
        title: title,
        description: _composeTaskDescription(
          $('taskFormDescInput').value.trim(),
          $('taskFormChecklist') ? $('taskFormChecklist').value : '',
          $('taskFormApproval') ? $('taskFormApproval').checked : false
        ),
        status: $('taskFormStatus').value,
        priority: $('taskFormPriority').value,
        due_date: $('taskFormDue').value || null,
        assignee_user_id: ($('taskFormAssignee').value ? parseInt($('taskFormAssignee').value, 10) : null),
      };
      try {
        if (_taskEditingId) await Api.updateRoomTask(state.activeRoomId, _taskEditingId, payload);
        else await Api.createRoomTask(state.activeRoomId, payload);
        $('taskFormModal').hidden = true;
        reloadRoomTasks(state.activeRoomId);
      } catch (e) {
        const msg = (e && (e.message || (e.payload && (e.payload.message || e.payload.error)))) || '알 수 없는 오류';
        const status = e && e.status ? (' [HTTP ' + e.status + ']') : '';
        toast('업무 저장 실패' + status + ': ' + msg, 'error');
      }
    });
  })();

  // ── v0.4.44: 참여자정보 (채널 전용) ──
  let _membersCache = [];
  function _avatarHtml(u) {
    const name = (u && (u.name || u.nickname)) || '';
    const ch = (name.trim() || '?').slice(0, 1);
    const img = u && (u.profile_image || u.avatar_url || u.image_url);
    if (img) {
      const src = /^https?:\/\//i.test(img) ? img : (state.serverUrl || '') + img;
      return '<span class="avatar avatar-md mi-avatar"><img src="' + escapeHtml(src) + '" alt="" /></span>';
    }
    return '<span class="avatar avatar-md mi-avatar"><span class="avatar-initials">' + escapeHtml(ch) + '</span></span>';
  }
  async function reloadRoomMembers(roomId) {
    const list = $('membersList'); const empty = $('membersEmpty'); const cnt = $('membersCount');
    const inviteBtn = $('btnMemberInvite');
    if (!list) return;
    list.innerHTML = '<div class="rp-empty">불러오는 중…</div>';
    if (empty) empty.hidden = true;
    try {
      const data = await Api.listRoomMembers(roomId);
      if (roomId !== state.activeRoomId) return;
      const items = Array.isArray(data) ? data : (data && data.items) || [];
      _membersCache = items;
      updateRoomTabDotCount('members', items.filter((m) => !m.left_at).length);
      const room = state.activeRoom;
      if (inviteBtn) inviteBtn.hidden = !room;
      if (cnt) cnt.textContent = items.length ? ('(' + items.length + '명)') : '';
      list.innerHTML = '';
      if (!items.length) { if (empty) empty.hidden = false; return; }
      const ownerId = room && room.created_by_user_id;
      items.forEach((m) => {
        const card = document.createElement('div');
        card.className = 'member-item';
        const u = m.user || {};
        card.innerHTML = _avatarHtml(u);
        card.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          showUserProfileDialog(Object.assign({ id: m.user_id }, u));
        });
        const body = document.createElement('div'); body.className = 'mi-body';
        const nm = document.createElement('div'); nm.className = 'mi-name';
        nm.textContent = u.name || u.nickname || ('user#' + m.user_id);
        body.appendChild(nm);
        const sub = document.createElement('div'); sub.className = 'mi-sub';
        const subParts = [];
        if (u.emp_no) subParts.push(u.emp_no);
        if (u.dept || u.department) subParts.push(u.dept || u.department);
        if (u.position || u.job) subParts.push(u.position || u.job);
        sub.textContent = subParts.join(' · ');
        body.appendChild(sub);
        card.appendChild(body);
        const pres = document.createElement('span');
        pres.className = 'mi-presence' + (m.user_id === state.currentUserId ? ' is-online' : '');
        pres.textContent = m.user_id === state.currentUserId ? '온라인' : '오프라인';
        card.appendChild(pres);
        // 비공개 채널이고, 본인이 관리자라면 다른 사람 내보내기 가능
        if (isPrivateChannel(room) && state.currentUserId === ownerId && m.user_id !== ownerId) {
          const actions = document.createElement('div'); actions.className = 'mi-actions';
          const rm = document.createElement('button');
          rm.type = 'button'; rm.className = 'btn-secondary';
          rm.textContent = '내보내기';
          rm.addEventListener('click', async () => {
            if (!confirm((u.name || '사용자') + '님을 내보낼까요?')) return;
            try {
              await Api.removeRoomMember(roomId, m.id, m.user_id);
              reloadRoomMembers(roomId);
            } catch (e) { toast('내보내기 실패: ' + (e.message || ''), 'error'); }
          });
          actions.appendChild(rm);
          card.appendChild(actions);
        }
        list.appendChild(card);
      });
    } catch (e) {
      list.innerHTML = '';
      if (empty) { empty.hidden = false; empty.textContent = '참여자 정보를 불러오지 못했습니다: ' + (e.message || ''); }
    }
  }
  function _isAlreadyMember(userId) {
    return _membersCache.some((m) => m.user_id === userId);
  }
  async function addUserToActiveRoom(user) {
    if (!state.activeRoom || !state.currentUserId || !user || !user.id) return null;
    const activeType = String(state.activeRoom.room_type || '').toUpperCase();
    if (activeType === 'CHANNEL' || isPrivateChannel(state.activeRoom)) {
      await Api.inviteRoomMember(state.activeRoomId, user.id, state.currentUserId);
      await reloadRoomMembers(state.activeRoomId);
      refreshRoomTabDots(state.activeRoomId);
      toast('채널에 초대했습니다.', 'success');
      return state.activeRoom;
    }
    if (activeType === 'GROUP' && isDmLike(state.activeRoom)) {
      await Api.inviteRoomMember(state.activeRoomId, user.id, state.currentUserId);
      await loadRooms();
      const r = findRoomById(state.activeRoomId) || state.activeRoom;
      state.activeRoom = r;
      await reloadRoomMembers(state.activeRoomId);
      refreshRoomTabDots(state.activeRoomId);
      toast('그룹 채팅에 추가했습니다.', 'success');
      return r;
    }
    const ids = new Set([state.currentUserId, user.id]);
    (state.activeRoom.members || _membersCache || []).forEach((m) => {
      const id = m.user_id || (m.user && m.user.id);
      if (id && !m.left_at) ids.add(id);
    });
    const room = await Api.createRoom({
      room_type: 'GROUP',
      created_by_user_id: state.currentUserId,
      member_ids: Array.from(ids),
    });
    rememberGroupDm(room.id);
    await loadRooms();
    const r = findRoomById(room.id) || room;
    rememberGroupDm(r.id);
    setTab('chat');
    await openRoom(r);
    setActiveRoomTab('members');
    toast('그룹 채팅을 만들었습니다.', 'success');
    return r;
  }
  async function renameActiveRoom() {
    const room = state.activeRoom;
    if (!room || !room.id) return;
    const current = roomTitle(room);
    const label = (String(room.room_type || '').toUpperCase() === 'CHANNEL') ? '채널 이름' : '채팅 이름';
    const name = prompt(label + '을 입력하세요. (20자 이내)', current);
    if (name === null) return;
    const next = String(name || '').trim();
    if (!next) { toast('이름을 입력하세요.', 'error'); return; }
    try {
      const keepInDmList = String(room.room_type || '').toUpperCase() === 'GROUP' && isDmLike(room);
      if (keepInDmList) rememberGroupDm(room.id);
      const patch = { room_name: next.slice(0, 20), updated_by_user_id: state.currentUserId };
      await Api.patchRoom(room.id, patch);
      room.room_name = patch.room_name;
      $('convTitle').textContent = roomTitle(room);
      await loadRooms();
      renderRooms();
      toast('이름을 변경했습니다.', 'success');
    } catch (e) {
      toast('이름 변경 실패: ' + (e.message || ''), 'error');
    }
  }
  async function _renderInviteCandidates(query) {
    const list = $('inviteCandidateList'); const empty = $('inviteCandidateEmpty');
    if (!list) return;
    list.innerHTML = '<div class="rp-empty">불러오는 중…</div>';
    if (empty) empty.hidden = true;
    try {
      const dir = await Api.listDirectory({ q: query || '', limit: 200 });
      const all = Array.isArray(dir) ? dir : [];
      list.innerHTML = '';
      if (!all.length) { if (empty) empty.hidden = false; return; }
      all.forEach((u) => {
        const row = document.createElement('div');
        row.className = 'invite-candidate' + (_isAlreadyMember(u.id) ? ' is-member' : '');
        row.innerHTML = _avatarHtml(u);
        const body = document.createElement('div'); body.className = 'ic-body';
        const nm = document.createElement('div'); nm.className = 'ic-name';
        nm.textContent = u.name || u.nickname || ('user#' + u.id);
        body.appendChild(nm);
        const sub = document.createElement('div'); sub.className = 'ic-sub';
        const parts = [];
        if (u.emp_no) parts.push(u.emp_no);
        if (u.dept) parts.push(u.dept);
        if (u.position) parts.push(u.position);
        sub.textContent = parts.join(' · ');
        body.appendChild(sub);
        row.appendChild(body);
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn-primary ic-add';
        btn.textContent = _isAlreadyMember(u.id) ? '이미 참여' : '초대';
        if (!_isAlreadyMember(u.id)) {
          btn.addEventListener('click', async () => {
            btn.disabled = true; btn.textContent = '초대 중…';
            try {
              const room = await addUserToActiveRoom(u);
              const type = String((room && room.room_type) || '').toUpperCase();
              btn.textContent = type === 'CHANNEL' || isPrivateChannel(room || {}) ? '초대됨' : '추가됨';
              closeModal('inviteMembersModal');
            } catch (e) {
              btn.disabled = false; btn.textContent = '초대';
              toast('사용자 추가 실패: ' + (e.message || ''), 'error');
            }
          });
        }
        row.appendChild(btn);
        list.appendChild(row);
      });
    } catch (e) {
      list.innerHTML = '';
      if (empty) { empty.hidden = false; empty.textContent = '검색 실패: ' + (e.message || ''); }
    }
  }
  function openInviteMembersModal() {
    const inp = $('inviteSearchInput'); if (inp) inp.value = '';
    $('inviteMembersModal').hidden = false;
    _renderInviteCandidates('');
    setTimeout(() => { try { inp && inp.focus(); } catch (_) {} }, 30);
  }
  (function bindInviteMembers() {
    const btn = $('btnMemberInvite');
    if (btn) btn.addEventListener('click', openInviteMembersModal);
    const rn = $('btnRoomRename');
    if (rn) rn.addEventListener('click', renameActiveRoom);
    const inp = $('inviteSearchInput');
    if (inp) {
      let t = null;
      inp.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => _renderInviteCandidates(inp.value.trim()), 220);
      });
    }
  })();
  // v0.4.22: 일정 공유 — 현재 채팅방을 컨텍스트로 일정 등록 모달을 열고, 저장 후 카드 메시지 전송
  window.__shareScheduleToChat = async function (roomId, payload, savedItem) {
    if (!roomId || !state.currentUserId) return;
    const fmt = (iso) => {
      try {
        const d = new Date(iso);
        const y = d.getFullYear(), m = d.getMonth()+1, dd = d.getDate();
        const h = d.getHours(), mi = d.getMinutes();
        const dow = ['일','월','화','수','목','금','토'][d.getDay()];
        const pad2 = (n) => String(n).padStart(2,'0');
        return `${y}-${pad2(m)}-${pad2(dd)} (${dow}) ${pad2(h)}:${pad2(mi)}`;
      } catch (_) { return iso || ''; }
    };
    const lines = [
      '📅 일정이 등록되었습니다',
      '• 제목: ' + (payload.title || '-'),
      '• 시작: ' + fmt(payload.start_datetime),
      '• 종료: ' + fmt(payload.end_datetime),
    ];
    if (payload.location) lines.push('• 장소: ' + payload.location);
    if (payload.description && String(payload.description).trim()) {
      lines.push('• 내용: ' + String(payload.description).trim());
    }
    // v0.4.28: 수신측에서 "내 일정에 추가" 버튼을 만들 수 있도록 JSON 마커 첨부
    const marker = {
      title: payload.title || '',
      start: payload.start_datetime || '',
      end: payload.end_datetime || '',
      location: payload.location || '',
      description: payload.description || '',
    };
    lines.push('<!--BLS_SCHED:' + JSON.stringify(marker) + '-->');
    const text = lines.join('\n');
    const saved = await Api.sendMessage(roomId, state.currentUserId, text);
    if (saved && saved.id && roomId === state.activeRoomId) {
      state.lastMessageIdByRoom[roomId] = Math.max(
        state.lastMessageIdByRoom[roomId] || 0, saved.id
      );
      if (!saved.sender && state.profile) {
        saved.sender = { id: state.currentUserId, name: state.profile.name, profile_image: state.profile.profile_image };
      }
      const area = $('messageArea');
      if (area) { appendMessageToArea(area, saved); area.scrollTop = area.scrollHeight; }
    }
  };
  const _btnShareSched = document.getElementById('btnShareSchedule');
  if (_btnShareSched) _btnShareSched.addEventListener('click', () => {
    if (!state.activeRoomId) { toast('먼저 채팅방을 선택하세요.', 'info'); return; }
    if (!window.CalendarView || !window.CalendarView.openEdit) {
      toast('달력 모듈을 불러오지 못했습니다.', 'error'); return;
    }
    // 현재 채팅방을 일정 저장 후 공유 대상으로 표시
    const m = document.getElementById('calEditModal');
    if (m) m.dataset.shareRoomId = String(state.activeRoomId);
    window.CalendarView.openEdit(null);
  });
  async function sendPollMessage(question, options, endAt) {
    if (!state.activeRoomId || !state.currentUserId) { toast('먼저 채팅방을 선택하세요.', 'info'); return; }
    const marker = {
      question: String(question || '').trim(),
      options: options.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 10),
      end_at: String(endAt || '').trim(),
    };
    const text = '투표: ' + marker.question + '\n<!--BLS_POLL:' + JSON.stringify(marker) + '-->';
    const saved = await Api.sendMessage(state.activeRoomId, state.currentUserId, text);
    if (saved && saved.id) {
      state.lastMessageIdByRoom[state.activeRoomId] = Math.max(
        state.lastMessageIdByRoom[state.activeRoomId] || 0, saved.id
      );
      if (!saved.sender && state.profile) {
        saved.sender = { id: state.currentUserId, name: state.profile.name, profile_image: state.profile.profile_image };
      }
      state.messagesByRoom[state.activeRoomId] = state.messagesByRoom[state.activeRoomId] || [];
      state.messagesByRoom[state.activeRoomId].push(saved);
      const area = $('messageArea');
      if (area) { appendMessageToArea(area, saved); area.scrollTop = area.scrollHeight; }
    }
  }
  const pollBtn = $('btnPoll');
  if (pollBtn) pollBtn.addEventListener('click', () => {
    if (!state.activeRoomId) { toast('먼저 채팅방을 선택하세요.', 'info'); return; }
    const q = $('pollQuestion'), o = $('pollOptions'), end = $('pollEndAt'), err = $('pollError');
    if (q) q.value = '';
    if (o) o.value = '';
    if (end) end.value = '';
    if (err) err.hidden = true;
    openModal('pollModal');
    initPollDatePicker();
    setTimeout(() => { if (q) q.focus(); }, 30);
  });
  const pollCreateBtn = $('pollCreateBtn');
  if (pollCreateBtn) pollCreateBtn.addEventListener('click', async () => {
    const q = ($('pollQuestion') && $('pollQuestion').value || '').trim();
    const opts = ($('pollOptions') && $('pollOptions').value || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const endAt = ($('pollEndAt') && $('pollEndAt').value || '').trim();
    const err = $('pollError');
    if (!q || opts.length < 2) {
      if (err) { err.hidden = false; err.textContent = '질문과 2개 이상의 항목을 입력하세요.'; }
      return;
    }
    pollCreateBtn.disabled = true;
    try {
      await sendPollMessage(q, opts, endAt);
      closeModal('pollModal');
    } catch (e) {
      if (err) { err.hidden = false; err.textContent = '투표 전송 실패: ' + (e && e.message || ''); }
    } finally {
      pollCreateBtn.disabled = false;
    }
  });
  $('composerInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart, end = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + '\n' + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = start + 1;
      autoResize();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrentMessage(); }
    else if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); applyFmt('bold'); }
    else if (e.ctrlKey && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); applyFmt('italic'); }
    else if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); applyFmt('underline'); }
  });
  function initPollDatePicker() {
    const el = $('pollEndAt');
    if (!el || !window.flatpickr) return;
    const opts = {
      enableTime: true,
      time_24hr: true,
      minuteIncrement: 5,
      dateFormat: 'Y-m-d H:i',
      locale: (window.flatpickr.l10ns && window.flatpickr.l10ns.ko) || 'ko',
      allowInput: false,
      disableMobile: true,
    };
    try {
      if (!el._flatpickr) window.flatpickr(el, opts);
      else if (el.value) el._flatpickr.setDate(el.value, false, 'Y-m-d H:i');
    } catch (_) {}
  }
  function autoResize() {
    const ta = $('composerInput');
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px';
  }
  $('composerInput').addEventListener('input', autoResize);

  // ── 서식 버튼 ──
  function applyFmt(kind) {
    const ta = $('composerInput');
    const start = ta.selectionStart, end = ta.selectionEnd;
    const sel = ta.value.slice(start, end);
    const before = ta.value.slice(0, start), after = ta.value.slice(end);
    let wrap = '', placeholder = sel || '텍스트';
    let prefixLine = '';
    if (kind === 'bold') wrap = '*';
    else if (kind === 'italic') wrap = '_';
    else if (kind === 'underline') wrap = '++';
    else if (kind === 'strike') wrap = '~';
    else if (kind === 'code') wrap = '`';
    else if (kind === 'quote') prefixLine = '> ';
    else if (kind === 'ul') prefixLine = '• ';
    else if (kind === 'link') {
      const text = sel || '링크';
      const newVal = before + '[' + text + '](https://)' + after;
      ta.value = newVal;
      const pos = before.length + text.length + 3;
      ta.setSelectionRange(pos, pos + 8);
      ta.focus();
      autoResize();
      return;
    }
    if (prefixLine) {
      const newSel = (sel || placeholder).split('\n').map((l) => prefixLine + l).join('\n');
      ta.value = before + newSel + after;
      ta.setSelectionRange(before.length, before.length + newSel.length);
    } else {
      ta.value = before + wrap + placeholder + wrap + after;
      ta.setSelectionRange(before.length + wrap.length, before.length + wrap.length + placeholder.length);
    }
    ta.focus();
    autoResize();
  }
  $$('.fmt-btn[data-fmt]').forEach((b) => b.addEventListener('click', () => applyFmt(b.dataset.fmt)));

  // ── 글자색 picker ──
  const COLOR_PALETTE = [
    '#ef4444','#f97316','#f59e0b','#eab308','#84cc16','#22c55e','#10b981','#14b8a6',
    '#06b6d4','#0ea5e9','#3b82f6','#6366f1','#8b5cf6','#a855f7','#d946ef','#ec4899',
    '#ffffff','#d1d5db','#9ca3af','#6b7280','#4b5563','#1f2937','#000000'
  ];
  let lastColor = (function(){ try { return localStorage.getItem('chat:lastColor') || '#6366f1'; } catch(_){ return '#6366f1'; } })();
  function setLastColor(c){ lastColor = c; try { localStorage.setItem('chat:lastColor', c); } catch(_){} const bar = $('fmtColorBar'); if (bar) bar.style.background = c; }
  setLastColor(lastColor);
  function applyColor(color) {
    const ta = $('composerInput');
    const start = ta.selectionStart, end = ta.selectionEnd;
    const sel = ta.value.slice(start, end) || '텍스트';
    const before = ta.value.slice(0, start), after = ta.value.slice(end);
    if (!color) { // reset: 선택 영역의 {c:..}{/c} 래퍼 제거
      const stripped = sel.replace(/\{c:#[0-9a-fA-F]{3,8}\}/g, '').replace(/\{\/c\}/g, '');
      ta.value = before + stripped + after;
      ta.setSelectionRange(before.length, before.length + stripped.length);
    } else {
      const wrapped = '{c:' + color + '}' + sel + '{/c}';
      ta.value = before + wrapped + after;
      const inner = before.length + ('{c:' + color + '}').length;
      ta.setSelectionRange(inner, inner + sel.length);
    }
    ta.focus();
    autoResize();
  }
  function buildColorPopover(){
    const pop = $('colorPopover');
    if (!pop || pop.dataset.built) return;
    pop.dataset.built = '1';
    COLOR_PALETTE.forEach((c) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'color-swatch';
      sw.style.background = c;
      sw.title = c;
      sw.addEventListener('click', (e) => { e.stopPropagation(); setLastColor(c); applyColor(c); pop.hidden = true; });
      pop.appendChild(sw);
    });
    const rs = document.createElement('button');
    rs.type = 'button';
    rs.className = 'color-swatch reset';
    rs.title = '색상 제거';
    rs.addEventListener('click', (e) => { e.stopPropagation(); applyColor(null); pop.hidden = true; });
    pop.appendChild(rs);
  }
  if ($('btnFmtColor')) {
    $('btnFmtColor').addEventListener('click', (e) => {
      e.stopPropagation();
      // 기본 동작: 색상 팔레트 열기
      buildColorPopover();
      const pop = $('colorPopover');
      pop.hidden = !pop.hidden;
    });
    $('btnFmtColor').addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      // 우클릭: 마지막 색 즉시 적용
      applyColor(lastColor);
    });
    document.addEventListener('click', (e) => {
      const pop = $('colorPopover');
      if (!pop || pop.hidden) return;
      if (pop.contains(e.target) || $('btnFmtColor').contains(e.target)) return;
      pop.hidden = true;
    });
  }

  // ── 이모지 picker ──
  const EMOJIS = ('😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 ' +
    '😘 😗 ☺️ 😋 😜 🤪 🤔 🤨 😐 😑 😶 🙄 😏 😣 😥 😮 ' +
    '🤐 😯 😪 😫 🥱 😴 😌 😛 😜 🤤 😒 😓 😔 😕 🙃 🤑 ' +
    '👍 👎 👏 🙌 🙏 💪 🔥 ✨ 🎉 🎊 ❤️ 💛 💚 💙 💜 🖤 ' +
    '✅ ❌ ⭐ 🚀 💯 👀 🤝 🫡 🫶 ☕ 📌 📎 📝 ✏️ 🗓️ ⏰').split(' ');
  const popover = $('emojiPopover');
  EMOJIS.forEach((e) => {
    const b = document.createElement('button');
    b.className = 'emoji-cell';
    b.type = 'button';
    b.textContent = e;
    b.addEventListener('click', () => insertEmoji(e));
    popover.appendChild(b);
  });
  $('btnEmoji').addEventListener('click', (e) => {
    e.stopPropagation();
    popover.hidden = !popover.hidden;
  });
  document.addEventListener('click', (e) => {
    if (popover.hidden) return;
    if (e.target.closest('#emojiPopover') || e.target.closest('#btnEmoji')) return;
    popover.hidden = true;
  });
  function insertEmoji(emoji) {
    const ta = $('composerInput');
    const start = ta.selectionStart, end = ta.selectionEnd;
    ta.value = ta.value.slice(0, start) + emoji + ta.value.slice(end);
    const pos = start + emoji.length;
    ta.setSelectionRange(pos, pos);
    ta.focus();
    autoResize();
    popover.hidden = true;
  }

  // ── 첨부파일 ──
  $('btnAttach').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', async (e) => {
    if (!state.activeRoomId || !state.currentUserId) return;
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const f of files) {
      try {
        const policyError = validateUploadFileByPolicy(f);
        if (policyError) {
          toast(policyError, 'error');
          continue;
        }
        const upRec = await Api.uploadFile(f);
        const saved = await Api.sendMessage(state.activeRoomId, state.currentUserId, '첨부 파일: ' + f.name, { contentType: 'FILE' });
        await Api.attachFileToMessage(saved.id, {
          file_path: '/api/uploads/' + upRec.id + '/download',
          original_name: upRec.name || f.name,
          file_size: upRec.size,
          content_type: f.type || '',
          uploaded_by_user_id: state.currentUserId,
        });
        toast('첨부 전송: ' + f.name, 'success');
      } catch (err) {
        toast('첨부 실패: ' + (err.message || f.name), 'error');
      }
    }
    await reloadMessages(state.activeRoomId, true);
    if (_activeRoomTab === 'files') await reloadRoomFiles(state.activeRoomId);
  });

  // ── Polling (1초 간격, /addon/chat 와 동일) ──
  function startPolling() {
    if (state.pollTimer) return;
    state.pollTimer = setInterval(pollTick, POLL_INTERVAL_MS);
  }
  function stopPolling() {
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  }
  async function pollTick() {
    if (state.polling) return;
    state.polling = true;
    try {
      const rows = await Api.listRooms();
      const newRooms = Array.isArray(rows) ? rows : [];
      const changed = roomsSignature(newRooms) !== roomsSignature(state.rooms);
      state.rooms = newRooms;
      if (changed) { renderRooms(); updateBadge(); }
      if (state.activeRoomId) await reloadMessages(state.activeRoomId, false);
    } catch (_e) {} finally { state.polling = false; }
  }
  function roomsSignature(rows) {
    return rows.map((r) => r.id + ':' + (r.last_message_at || '') + ':' + (r.viewer_unread_count || 0)).join('|');
  }

  // ── 모달 ──
  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }
  $$('[data-close]').forEach((b) => b.addEventListener('click', () => closeModal(b.dataset.close)));

  // ── 채널 만들기 ──
  // v0.4.30: 사이드바 상단 "+" 버튼은 숨긴 항목 표시 토글로 사용
  (function bindHiddenToggle() {
    const btn = $('btnNewChannel');
    if (!btn) return;
    btn.title = '숨긴 대화 보기/감추기';
    btn.setAttribute('aria-label', '숨긴 대화 보기/감추기');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="m20.414,14h-5.828l-4.586-4.586V3.586L13.5.086l10.414,10.414-3.5,3.5Zm-11.632-3.141L.626,19.016c-.834.834-.834,2.187,0,3.021l1.337,1.337c.834.834,2.187.834,3.021,0l8.156-8.157-4.359-4.359Zm-2.041,4.985l2-2,1.414,1.414-2,2-1.414-1.414Z"/></svg>';
    btn.addEventListener('click', () => {
      state.showHiddenRooms = !state.showHiddenRooms;
      btn.classList.toggle('is-on', state.showHiddenRooms);
      btn.title = state.showHiddenRooms ? '숨긴 대화 감추기' : '숨긴 대화 보기';
      renderRooms();
    });
  })();
  $('btnAddChannel').addEventListener('click', openChannelModal);
  function openChannelModal() {
    $('newChannelName').value = '';
    $('newChannelDesc').value = '';
    $('channelError').hidden = true;
    openModal('channelModal');
    setTimeout(() => $('newChannelName').focus(), 30);
  }
  $('btnCreateChannel').addEventListener('click', async () => {
    const name = $('newChannelName').value.trim();
    if (!name) { $('channelError').hidden = false; $('channelError').textContent = '이름을 입력하세요'; return; }
    if (!state.currentUserId) { $('channelError').hidden = false; $('channelError').textContent = '내 프로필을 먼저 불러와야 합니다'; return; }
    // v0.4.30: 공개=CHANNEL, 비공개=GROUP(+room_name)
    let visibility = 'public';
    try { const sel = document.querySelector('input[name="newChannelType"]:checked'); if (sel) visibility = sel.value; } catch (_) {}
    const roomType = visibility === 'private' ? 'GROUP' : 'CHANNEL';
    try {
      const room = await Api.createRoom({
        room_type: roomType,
        room_name: name,
        created_by_user_id: state.currentUserId,
        member_ids: [state.currentUserId],
      });
      closeModal('channelModal');
      toast('채널 만들기 성공', 'success');
      await loadRooms();
      const r = findRoomById(room.id) || room;
      openRoom(r);
    } catch (e) {
      $('channelError').hidden = false;
      $('channelError').textContent = e.message || '실패';
    }
  });

  // ── DM (디렉터리 검색 → DIRECT 방 만들기/이어가기) ──
  $('btnAddDm').addEventListener('click', openDmModal);
  function openDmModal() {
    $('dmSearchInput').value = '';
    $('dmSearchResults').innerHTML = '';
    $('dmError').hidden = true;
    openModal('dmModal');
    setTimeout(() => { $('dmSearchInput').focus(); loadDirectoryInto('dmSearchResults', '', true); }, 30);
  }
  let dmSearchTimer = null;
  $('dmSearchInput').addEventListener('input', (e) => {
    clearTimeout(dmSearchTimer);
    const q = e.target.value.trim();
    dmSearchTimer = setTimeout(() => loadDirectoryInto('dmSearchResults', q, true), 200);
  });

  async function startDmWith(userId) {
    if (!state.currentUserId) return null;
    if (userId === state.currentUserId) return null;
    // 기존 DIRECT 방이 있는지 먼저 확인
    const existing = state.rooms.find((r) => {
      if ((r.room_type || '').toUpperCase() !== 'DIRECT') return false;
      const ids = (r.members || []).map((m) => m.user_id).sort();
      const want = [state.currentUserId, userId].sort();
      return ids.length === want.length && ids[0] === want[0] && ids[1] === want[1];
    });
    if (existing) {
      setTab('chat');
      openRoom(existing);
      return existing;
    }
    try {
      const room = await Api.createRoom({
        room_type: 'DIRECT',
        created_by_user_id: state.currentUserId,
        member_ids: [state.currentUserId, userId],
      });
      await loadRooms();
      const r = findRoomById(room.id) || room;
      setTab('chat');
      openRoom(r);
      return r;
    } catch (e) {
      toast('DM 시작 실패: ' + (e.message || ''), 'error');
      return null;
    }
  }

  // ── 방 나가기 ──
  async function hideRoomConfirm(room) {
    if (!room || !room.id) return;
    const me = state.currentUserId;
    if (!me) { toast('내 사용자 ID를 확인하지 못했습니다.', 'error'); return; }
    try {
      await Api.hideRoom(room.id, me);
    } catch (_) {
      // 서버가 아직 구버전이어도 사용자는 즉시 목록에서 숨길 수 있어야 한다.
    }
    hideDmRoom(room.id);
    _afterRoomRemoved(room.id, '대화를 숨겼습니다.');
  }

  function leaveConfirmText(room) {
    const t = (room.room_type || '').toUpperCase();
    if (t === 'DIRECT') {
      return '개인채팅을 나가시겠습니까?\n\n'
        + '이 대화를 나가면 내 기준으로 메시지, 파일, 아이디어, 업무공유 기록이 삭제되며 복구할 수 없습니다.\n'
        + '상대방이 다시 메시지를 보내도 기존 대화는 복구되지 않고 새 대화로 시작됩니다.';
    }
    if (t === 'CHANNEL') {
      return '채널을 나가시겠습니까?\n\n'
        + '채널에서 나가면 내 목록과 알림은 제거됩니다.\n'
        + '채널의 기존 메시지, 파일, 아이디어, 업무공유 기록은 삭제되지 않습니다.';
    }
    return '그룹채팅을 나가시겠습니까?\n\n'
      + '이 그룹에서 나가면 내 채팅 목록과 알림은 제거됩니다.\n'
      + '하지만 그룹에 다른 참여자가 남아 있는 경우 메시지, 파일, 아이디어, 업무공유 기록은 그룹에 계속 남습니다.';
  }

  function _leaveErrorMessage(payload, status, fallbackMsg) {
    const code = payload && (payload.error || payload.code);
    const rawMsg = (payload && (payload.message || payload.error)) || fallbackMsg || '';
    if (code === 'last_channel_manager_cannot_leave') return '마지막 관리자라 채널을 나갈 수 없습니다.';
    if (code === 'channel_required') return '필수 채널은 나갈 수 없습니다.';
    if (code === 'unauthorized' || status === 401) return '로그인 정보가 만료되어 다시 로그인해야 합니다.';
    if (code === 'room_not_found' || status === 404) return '대화방을 찾을 수 없습니다. 이미 정리되었을 수 있습니다.';
    if (status === 405 || /허용되지\s*않은\s*메서드|허용되지\s*않는\s*메서드|허용되지\s*않[는은]\s*메시지/.test(rawMsg)) {
      return '서버에 새로운 나가기 엔드포인트가 아직 적용되지 않았습니다. 서버를 재기동한 뒤 다시 시도해주세요.';
    }
    return rawMsg || '서버 오류가 발생했습니다.';
  }

  // v0.5.8: 채널 관리자 여부 — 생성자이거나 OWNER/ADMIN/MANAGER 역할.
  // 마지막 관리자가 "나가기"로 막힐 때 "삭제 / 위임 / 취소" 분기를 제공하기 위한 판단 기준.
  function _isChannelAdmin(room) {
    if (!room) return false;
    const t = (room.room_type || '').toUpperCase();
    if (t !== 'CHANNEL') return false;
    const me = state.currentUserId;
    if (!me) return false;
    if (room.created_by_user_id === me) return true;
    const myMember = (room.members || []).find((m) => m.user_id === me && !m.left_at);
    if (!myMember) return false;
    const role = (myMember.member_role || '').toUpperCase();
    return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
  }
  async function handleLeaveRoom(room) {
    if (!room || !room.id) return;
    const me = state.currentUserId;
    if (!me) { toast('내 사용자 ID를 확인하지 못했습니다.', 'error'); return; }
    let res;
    let serverFailed = false;
    let serverDetail = '';
    let blockedByLastManager = false;
    try {
      res = await Api.leaveRoom(room.id, me);
    } catch (e) {
      const status = e && e.status;
      const payload = e && e.payload;
      const fallback = (e && e.message) || '';
      const code = payload && (payload.error || payload.code);
      if (status === 404 || /not_a_member|already_left/i.test(fallback)) {
        _afterRoomRemoved(room.id, '이미 나간 대화방입니다.');
        return;
      }
      if (status === 403 && code === 'last_channel_manager_cannot_leave') {
        // v0.5.8: 토스트로 막다른 길을 만들지 말고, 삭제/위임/취소를 선택할 수 있게 다이얼로그로 분기.
        showLastManagerDialog(room);
        blockedByLastManager = true;
        return;
      }
      try { console.warn('[leaveRoom] api failed', status, payload, fallback); } catch (_) {}
      serverFailed = true;
      serverDetail = (payload && (payload.detail || payload.message || payload.error)) || fallback || ('HTTP ' + (status || '???'));
    }
    if (blockedByLastManager) return;
    if (res && res.success === false) {
      const code = res.error || res.code;
      if (code === 'last_channel_manager_cannot_leave') {
        showLastManagerDialog(room);
        return;
      }
      try { console.warn('[leaveRoom] api responded success=false', res); } catch (_) {}
      serverFailed = true;
      serverDetail = (res && (res.detail || res.message || res.error)) || '알 수 없는 오류';
    }
    if (serverFailed) {
      // 서버 처리 실패 시에도 사용자가 멈추지 않도록: 숨기기로 폴백 후 로컬 목록 정리.
      try { await Api.hideRoom(room.id, me); } catch (_) {}
      _afterRoomRemoved(room.id, '서버 처리 실패로 목록에서만 제거했습니다. (서버: ' + (serverDetail || '미상') + ') — 서버 코드를 갱신해야 완전히 처리됩니다.');
      return;
    }
    const action = (res && res.action) || 'LEFT';
    const degraded = !!(res && res.degraded);
    const baseNote = action === 'EXITED_PERMANENT'
      ? '개인채팅을 종료했습니다.'
      : action === 'UNSUBSCRIBED'
        ? '채널을 나갔습니다.'
        : action === 'ALREADY_LEFT' || action === 'NOT_A_MEMBER'
          ? '이미 나간 대화방입니다.'
          : '대화방에서 나갔습니다.';
    const note = degraded
      ? baseNote + ' (일부 후속 작업은 서버 점검 후 자동 정리됩니다)'
      : baseNote;
    _afterRoomRemoved(room.id, note);
  }
  async function leaveRoomConfirm(room) {
    if (!room || !room.id) return;
    if (!confirm(leaveConfirmText(room))) return;
    await handleLeaveRoom(room);
  }

  function _afterRoomRemoved(roomId, message) {
    state.rooms = state.rooms.filter((r) => r.id !== roomId);
    if (state.activeRoomId === roomId) {
      state.activeRoomId = null;
      state.activeRoom = null;
      const ti = $('convTitle'); if (ti) ti.textContent = '대화를 선택하세요';
      const ic = $('convIcon'); if (ic) ic.textContent = '#';
      const me2 = $('convMeta'); if (me2) me2.textContent = '';
      const ar = $('messageArea'); if (ar) ar.innerHTML = '';
      const eh = $('emptyHint'); if (eh) eh.hidden = false;
      _setComposerVisible(false);
      document.body.classList.add('no-active-room');
    }
    try { state.favorites && state.favorites.delete(roomId); saveFavorites && saveFavorites(); } catch (_) {}
    try { hideDmRoom(roomId); } catch (_) {}
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.indexOf('bls_room_cache_' + roomId) === 0) localStorage.removeItem(k);
      });
    } catch (_) {}
    renderRooms();
    updateBadge();
    if (message) toast(message, 'info');
    loadRooms().catch(() => {});
  }

  // ── v0.5.8: 채널 삭제 / 마지막 관리자 분기 다이얼로그 ──
  // 동적 생성 모달. 기존 modal/-card/-head/-actions 클래스를 그대로 재사용.
  function _buildModalShell(titleText) {
    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.style.zIndex = 10000;
    const card = document.createElement('div');
    card.className = 'modal-card';
    overlay.appendChild(card);
    const head = document.createElement('div');
    head.className = 'modal-head';
    const h2 = document.createElement('h2');
    h2.textContent = titleText;
    head.appendChild(h2);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'icon-btn';
    closeBtn.setAttribute('aria-label', '닫기');
    closeBtn.textContent = '×';
    head.appendChild(closeBtn);
    card.appendChild(head);
    const close = () => { try { overlay.remove(); } catch (_) {} document.removeEventListener('keydown', onKey, true); };
    function onKey(e) { if (e.key === 'Escape') close(); }
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    return { overlay, card, head, close };
  }

  // v0.5.9: Electron 에서 window.prompt() 가 동작하지 않으므로 confirm/prompt 대신
  // 커스텀 모달을 사용해 위험성 안내 + 이름 입력 확인을 한 화면에서 처리한다.
  async function deleteChannelConfirm(room) {
    if (!room || !room.id) return;
    const me = state.currentUserId;
    if (!me) { toast('내 사용자 ID를 확인하지 못했습니다.', 'error'); return; }
    const t = (room.room_type || '').toUpperCase();
    if (t !== 'CHANNEL') {
      toast('채널 삭제는 채널에서만 사용할 수 있습니다.', 'error');
      return;
    }
    if (!_isChannelAdmin(room)) {
      toast('채널 관리자만 삭제할 수 있습니다.', 'error');
      return;
    }
    const channelName = (room.room_name || room.title || ('채널 #' + room.id));
    const activeMembers = (room.members || []).filter((m) => !m.left_at);
    const otherCount = Math.max(0, activeMembers.length - 1);

    return new Promise((resolve) => {
      const { card, close } = _buildModalShell('채널 삭제');

      const warn = document.createElement('p');
      warn.style.margin = '4px 0 8px';
      warn.style.fontWeight = '600';
      warn.textContent = '"' + channelName + '" 채널을 완전히 삭제하시겠습니까?';
      card.appendChild(warn);

      const detail = document.createElement('ul');
      detail.style.margin = '0 0 14px 18px';
      detail.style.padding = '0';
      detail.style.fontSize = '13px';
      detail.style.color = 'var(--text-2, #94a3b8)';
      detail.style.lineHeight = '1.7';
      [
        '모든 메시지·파일·아이디어·업무공유 기록이 영구 삭제됩니다.',
        '다른 멤버 ' + otherCount + '명도 채널에서 제거됩니다.',
        '이 작업은 되돌릴 수 없습니다.',
      ].forEach((t) => {
        const li = document.createElement('li');
        li.textContent = t;
        detail.appendChild(li);
      });
      card.appendChild(detail);

      const lbl = document.createElement('label');
      lbl.style.display = 'block';
      lbl.style.marginBottom = '14px';
      const lblText = document.createElement('div');
      lblText.style.marginBottom = '6px';
      lblText.style.fontSize = '13px';
      lblText.innerHTML = '확인을 위해 채널 이름을 그대로 입력하세요: <code style="background:var(--bg-2,rgba(255,255,255,0.06));padding:1px 6px;border-radius:4px;">' + _escapeHtml(channelName) + '</code>';
      lbl.appendChild(lblText);
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = channelName;
      input.autocomplete = 'off';
      input.spellcheck = false;
      lbl.appendChild(input);
      card.appendChild(lbl);

      const actions = document.createElement('div');
      actions.className = 'modal-actions';

      const btnCancel = document.createElement('button');
      btnCancel.type = 'button';
      btnCancel.className = 'btn-secondary';
      btnCancel.textContent = '취소';
      btnCancel.addEventListener('click', () => { close(); resolve(false); });
      actions.appendChild(btnCancel);

      const btnDelete = document.createElement('button');
      btnDelete.type = 'button';
      btnDelete.className = 'btn-danger-solid';
      btnDelete.textContent = '영구 삭제';
      btnDelete.disabled = true;
      actions.appendChild(btnDelete);

      const updateState = () => {
        btnDelete.disabled = (input.value || '').trim() !== channelName;
      };
      input.addEventListener('input', updateState);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !btnDelete.disabled) { ev.preventDefault(); btnDelete.click(); }
      });

      btnDelete.addEventListener('click', async () => {
        if ((input.value || '').trim() !== channelName) return;
        btnDelete.disabled = true;
        btnDelete.textContent = '삭제 중…';
        btnCancel.disabled = true;
        try {
          await Api.deleteRoom(room.id, me);
          close();
          _afterRoomRemoved(room.id, '"' + channelName + '" 채널을 삭제했습니다.');
          resolve(true);
        } catch (e) {
          const status = e && e.status;
          const payload = e && e.payload;
          const dmsg = (payload && (payload.message || payload.error)) || (e && e.message) || ('HTTP ' + (status || '???'));
          toast('채널 삭제 실패: ' + dmsg, 'error');
          try { console.warn('[deleteChannel] failed', status, payload, e); } catch (_) {}
          btnDelete.disabled = false;
          btnDelete.textContent = '영구 삭제';
          btnCancel.disabled = false;
        }
      });

      card.appendChild(actions);
      setTimeout(() => { try { input.focus(); } catch (_) {} }, 30);
    });
  }

  function _escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showLastManagerDialog(room) {
    const me = state.currentUserId;
    const channelName = room.room_name || room.title || ('채널 #' + room.id);
    const activeMembers = (room.members || []).filter((m) => !m.left_at);
    const otherActive = activeMembers.filter((m) => m.user_id !== me);
    const { card, close } = _buildModalShell('채널을 어떻게 정리할까요?');

    const intro = document.createElement('p');
    intro.style.margin = '4px 0 12px';
    intro.style.color = 'var(--text-1, inherit)';
    intro.textContent = '"' + channelName + '"의 마지막 관리자라 그냥 나갈 수는 없습니다.';
    card.appendChild(intro);

    const sub = document.createElement('p');
    sub.style.margin = '0 0 16px';
    sub.style.fontSize = '13px';
    sub.style.color = 'var(--text-2, #94a3b8)';
    if (otherActive.length === 0) {
      sub.textContent = '현재 다른 활성 멤버가 없습니다. 채널을 삭제하거나 취소할 수 있습니다.';
    } else {
      sub.textContent = '다른 활성 멤버 ' + otherActive.length + '명에게 관리자를 위임하거나, 채널 자체를 삭제할 수 있습니다.';
    }
    card.appendChild(sub);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'btn-secondary';
    btnCancel.textContent = '취소';
    btnCancel.addEventListener('click', close);
    actions.appendChild(btnCancel);

    if (otherActive.length > 0) {
      const btnTransfer = document.createElement('button');
      btnTransfer.type = 'button';
      btnTransfer.className = 'btn-primary';
      btnTransfer.textContent = '관리자 위임 후 나가기';
      btnTransfer.addEventListener('click', () => {
        close();
        showTransferOwnershipDialog(room);
      });
      actions.appendChild(btnTransfer);
    }

    const btnDelete = document.createElement('button');
    btnDelete.type = 'button';
    btnDelete.className = 'btn-danger-solid';
    btnDelete.textContent = '채널 삭제';
    btnDelete.addEventListener('click', async () => {
      close();
      await deleteChannelConfirm(room);
    });
    actions.appendChild(btnDelete);

    card.appendChild(actions);
  }

  function showTransferOwnershipDialog(room) {
    const me = state.currentUserId;
    const activeMembers = (room.members || []).filter((m) => !m.left_at && m.user_id !== me);
    if (activeMembers.length === 0) {
      toast('위임할 다른 활성 멤버가 없습니다.', 'error');
      return;
    }
    const { card, close } = _buildModalShell('관리자 위임');

    const intro = document.createElement('p');
    intro.style.margin = '4px 0 12px';
    intro.textContent = '아래 멤버 중 한 명을 새 관리자로 지정합니다. 위임 후 자동으로 채널에서 나갑니다.';
    card.appendChild(intro);

    const list = document.createElement('div');
    list.style.maxHeight = '320px';
    list.style.overflow = 'auto';
    list.style.border = '1px solid var(--border-1, rgba(255,255,255,0.08))';
    list.style.borderRadius = '8px';
    list.style.padding = '4px';
    list.style.marginBottom = '12px';

    let selectedMember = null;

    activeMembers.forEach((m) => {
      const u = m.user || {};
      const row = document.createElement('label');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '10px';
      row.style.padding = '8px 10px';
      row.style.borderRadius = '6px';
      row.style.cursor = 'pointer';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = '__transferOwner';
      radio.value = String(m.user_id);
      radio.addEventListener('change', () => {
        selectedMember = m;
        btnConfirm.disabled = false;
      });
      row.appendChild(radio);
      const nameWrap = document.createElement('div');
      nameWrap.style.display = 'flex';
      nameWrap.style.flexDirection = 'column';
      const nm = document.createElement('div');
      nm.textContent = u.name || u.nickname || ('user#' + m.user_id);
      nm.style.fontWeight = '600';
      nameWrap.appendChild(nm);
      const meta = document.createElement('div');
      meta.style.fontSize = '12px';
      meta.style.color = 'var(--text-2, #94a3b8)';
      const role = (m.member_role || 'MEMBER').toUpperCase();
      meta.textContent = role + (u.department ? ' · ' + u.department : '');
      nameWrap.appendChild(meta);
      row.appendChild(nameWrap);
      row.addEventListener('mouseenter', () => { row.style.background = 'var(--bg-2, rgba(255,255,255,0.04))'; });
      row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
      list.appendChild(row);
    });
    card.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'btn-secondary';
    btnCancel.textContent = '취소';
    btnCancel.addEventListener('click', close);
    actions.appendChild(btnCancel);

    const btnConfirm = document.createElement('button');
    btnConfirm.type = 'button';
    btnConfirm.className = 'btn-primary';
    btnConfirm.textContent = '위임 후 나가기';
    btnConfirm.disabled = true;
    btnConfirm.addEventListener('click', async () => {
      if (!selectedMember) return;
      btnConfirm.disabled = true;
      btnConfirm.textContent = '처리 중…';
      try {
        await Api.updateRoomMember(room.id, selectedMember.id, { member_role: 'MANAGER' });
      } catch (e) {
        const detail = (e && e.payload && (e.payload.message || e.payload.error)) || (e && e.message) || '알 수 없는 오류';
        toast('관리자 위임 실패: ' + detail, 'error');
        btnConfirm.disabled = false;
        btnConfirm.textContent = '위임 후 나가기';
        return;
      }
      // 로컬 상태에도 즉시 반영해서 다시 leave 호출 시 last_manager 가드를 통과하도록 함.
      try {
        const r = findRoomById(room.id);
        if (r && r.members) {
          const target = r.members.find((mm) => mm.id === selectedMember.id);
          if (target) target.member_role = 'MANAGER';
        }
      } catch (_) {}
      close();
      await handleLeaveRoom(room);
    });
    actions.appendChild(btnConfirm);

    card.appendChild(actions);
  }

  // ── 컨텍스트 메뉴 (방 우클릭) ──
  function showRoomContextMenu(x, y, room) {
    closeContextMenu();
    const me = state.currentUserId;
    const t = (room.room_type || '').toUpperCase();
    const leaveLabel = t === 'CHANNEL' ? '채널 나가기' : '대화 나가기';
    const menu = document.createElement('div');
    menu.id = '__ctxMenu';
    menu.className = 'ctx-menu';
    const items = [
      { key: 'open', label: '열기', enabled: true },
      { key: 'sep1', sep: true },
    ];
    items.push({ key: 'hide', label: '대화 숨기기', enabled: true });
    items.push({ key: 'leave', label: leaveLabel, enabled: true, danger: true });
    // v0.5.8: 채널 관리자 전용 — "채널 삭제"는 "나가기"와 분리된 의도적 액션.
    if (_isChannelAdmin(room)) {
      items.push({ key: 'sep2', sep: true });
      items.push({ key: 'deleteChannel', label: '채널 삭제', enabled: true, danger: true });
    }
    items.forEach((it) => {
      if (it.sep) {
        const s = document.createElement('div');
        s.className = 'ctx-sep';
        menu.appendChild(s);
        return;
      }
      const row = document.createElement('div');
      row.className = 'ctx-item' + (it.danger ? ' danger' : '');
      if (!it.enabled) row.style.opacity = '0.45';
      row.textContent = it.label;
      row.addEventListener('click', (ev) => {
        ev.stopPropagation();
        closeContextMenu();
        if (!it.enabled) return;
        if (it.key === 'open') openRoom(room);
        else if (it.key === 'hide') hideRoomConfirm(room);
        else if (it.key === 'unhide') unhideDmRoom(room.id);
        else if (it.key === 'leave') leaveRoomConfirm(room);
        else if (it.key === 'deleteChannel') deleteChannelConfirm(room);
      });
      menu.appendChild(row);
    });
    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    const maxX = window.innerWidth - r.width - 6;
    const maxY = window.innerHeight - r.height - 6;
    menu.style.left = Math.max(6, Math.min(x, maxX)) + 'px';
    menu.style.top = Math.max(6, Math.min(y, maxY)) + 'px';
    setTimeout(() => {
      document.addEventListener('mousedown', onCtxOutside, true);
      document.addEventListener('keydown', onCtxKey, true);
    }, 0);
  }

  // ── 컨텍스트 메뉴 (동료 우클릭) ──
  function closeContextMenu() {
    const el = document.getElementById('__ctxMenu');
    if (el) el.remove();
    document.removeEventListener('mousedown', onCtxOutside, true);
    document.removeEventListener('keydown', onCtxKey, true);
  }
  function onCtxOutside(e) {
    const menu = document.getElementById('__ctxMenu');
    if (menu && menu.contains(e.target)) return; // 메뉴 내부 클릭은 무시
    closeContextMenu();
  }
  function onCtxKey(e) { if (e.key === 'Escape') closeContextMenu(); }
  function showUserContextMenu(x, y, user) {
    closeContextMenu();
    const me = state.currentUserId;
    const menu = document.createElement('div');
    menu.id = '__ctxMenu';
    menu.className = 'ctx-menu';
    const items = [
      { key: 'chat', label: '채팅하기', enabled: !!user && user.id !== me },
      { key: 'profile', label: '프로필 보기', enabled: true },
      { key: 'sep1', sep: true },
      { key: 'edit', label: '정보 변경', enabled: false },
      { key: 'star', label: state.favorites.has(user && user.id) ? '즐겨찾기 해제' : '즐겨찾기', enabled: !!user },
      { key: 'hide', label: '숨김', enabled: false },
      { key: 'sep2', sep: true },
      { key: 'remove', label: '삭제', enabled: false, danger: true },
      { key: 'block', label: '차단', enabled: false, danger: true },
    ];
    items.forEach((it) => {
      if (it.sep) {
        const s = document.createElement('div');
        s.className = 'ctx-sep';
        menu.appendChild(s);
        return;
      }
      const row = document.createElement('div');
      row.className = 'ctx-item' + (it.danger ? ' danger' : '');
      if (!it.enabled) row.style.opacity = '0.45';
      row.textContent = it.label;
      row.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        closeContextMenu();
        if (!it.enabled) { toast('준비 중인 기능입니다.', 'info'); return; }
        try {
          if (it.key === 'chat') {
            const r = await startDmWith(user.id);
            if (!r) toast('대화를 시작할 수 없습니다.', 'error');
          } else if (it.key === 'profile') {
            showUserProfileDialog(user);
          } else if (it.key === 'star') {
            toggleFavorite(user.id);
            renderPeopleList();
          }
        } catch (e) {
          toast(e.message || String(e), 'error');
        }
      });
      menu.appendChild(row);
    });
    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    const maxX = window.innerWidth - r.width - 6;
    const maxY = window.innerHeight - r.height - 6;
    menu.style.left = Math.max(6, Math.min(x, maxX)) + 'px';
    menu.style.top = Math.max(6, Math.min(y, maxY)) + 'px';
    setTimeout(() => {
      document.addEventListener('mousedown', onCtxOutside, true);
      document.addEventListener('keydown', onCtxKey, true);
    }, 0);
  }
  function showUserProfileDialog(u) {
    if (!u) return;
    setAvatar($('upAvatar'), u.profile_image, u.id, u.name || u.nickname);
    $('upName').textContent = u.name || u.nickname || ('user#' + u.id);
    const deptJob = [u.department, u.job].filter(Boolean).join(' · ');
    $('upDeptJob').textContent = deptJob || '-';
    $('upEmpNo').textContent = u.emp_no || '-';
    $('upDept').textContent = u.department || '-';
    $('upJob').textContent = u.job || '-';
    $('upEmail').textContent = u.email || '-';
    $('upMobile').textContent = u.mobile_phone || u.mobile || '-';
    $('upExt').textContent = u.ext_phone || u.ext || '-';
    const btn = $('btnUpStartChat');
    btn.disabled = !state.currentUserId || u.id === state.currentUserId;
    btn.onclick = async () => {
      closeModal('userProfileModal');
      const r = await startDmWith(u.id);
      if (!r) toast('대화를 시작할 수 없습니다.', 'error');
    };
    openModal('userProfileModal');
  }

  // ── 즐겨찾기 ──
  function loadFavorites() {
    try {
      const raw = localStorage.getItem('bls.favorites');
      const arr = raw ? JSON.parse(raw) : [];
      state.favorites = new Set(Array.isArray(arr) ? arr.map(Number).filter(Boolean) : []);
    } catch (e) { state.favorites = new Set(); }
  }
  function saveFavorites() {
    try { localStorage.setItem('bls.favorites', JSON.stringify(Array.from(state.favorites))); } catch (e) {}
  }
  function toggleFavorite(userId) {
    if (!userId) return;
    if (state.favorites.has(userId)) state.favorites.delete(userId);
    else state.favorites.add(userId);
    saveFavorites();
  }
  loadFavorites();

  function cleanMetaParts(values) {
    return (values || [])
      .map((v) => String(v || '').trim())
      .filter((v) => v && v !== '-' && v !== '－');
  }

  function buildPeopleItem(u) {
    const li = document.createElement('li');
    li.className = 'people-item';
    li.dataset.userId = String(u.id || '');
    li.dataset.name = u.name || u.nickname || '';
    li.dataset.empNo = u.emp_no || '';
    li.dataset.department = u.department || '';
    li.dataset.profileImage = u.profile_image || '';
    if (state.favorites.has(u.id)) li.classList.add('is-fav');
    const av = document.createElement('span');
    av.className = 'avatar avatar-md';
    setAvatar(av, u.profile_image, u.id, u.name || u.nickname);
    li.appendChild(av);
    const info = document.createElement('div');
    info.className = 'info';
    const nm = document.createElement('div');
    nm.className = 'name';
    nm.textContent = u.name || u.nickname || ('user#' + u.id);
    info.appendChild(nm);
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = cleanMetaParts([u.emp_no, u.department]).join(' · ');
    info.appendChild(meta);
    li.appendChild(info);
    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'fav-btn' + (state.favorites.has(u.id) ? ' on' : '');
    star.title = state.favorites.has(u.id) ? '즐겨찾기 해제' : '즐겨찾기';
    star.setAttribute('aria-label', star.title);
    const starIcon = document.createElement('img');
    starIcon.src = staticAssetSrc('/static/image/svg/chat/free-icon-font-star.svg');
    starIcon.alt = '';
    star.appendChild(starIcon);
    star.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleFavorite(u.id);
      renderPeopleList();
    });
    li.appendChild(star);
    li.addEventListener('click', async () => {
      try {
        const r = await startDmWith(u.id);
        if (!r) toast('대화를 시작할 수 없습니다.', 'error');
      } catch (e) {
        toast('대화 시작 실패: ' + (e.message || ''), 'error');
      }
    });
    li.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      showUserContextMenu(ev.clientX, ev.clientY, u);
    });
    return li;
  }

  function appendDeptGroup(ul, label, users, key) {
    if (!users.length) return;
    const collapsed = state.deptCollapsed.has(key);
    const head = document.createElement('li');
    head.className = 'people-group' + (collapsed ? ' collapsed' : '');
    head.innerHTML = '<span class="caret">▾</span><span class="g-label"></span><span class="g-count"></span>';
    head.querySelector('.g-label').textContent = label;
    head.querySelector('.g-count').textContent = users.length;
    head.addEventListener('click', () => {
      if (state.deptCollapsed.has(key)) state.deptCollapsed.delete(key);
      else state.deptCollapsed.add(key);
      renderPeopleList();
    });
    ul.appendChild(head);
    if (collapsed) return;
    users.forEach((u) => ul.appendChild(buildPeopleItem(u)));
  }

  function renderPeopleList() {
    const ul = $('peopleList');
    if (!ul) return;
    ul.innerHTML = '';
    const all = state.lastDirectoryUsers || [];
    if (!all.length) {
      const li = document.createElement('li');
      li.className = 'people-item';
      li.style.color = 'var(--sidebar-fg-dim)';
      li.textContent = '결과가 없습니다';
      ul.appendChild(li);
      return;
    }
    const sortByName = (a, b) => (a.name || '').localeCompare(b.name || '', 'ko');
    const favs = all.filter((u) => state.favorites.has(u.id)).sort(sortByName);
    appendDeptGroup(ul, '즐겨찾기', favs, '__fav__');
    const byDept = new Map();
    all.forEach((u) => {
      const d = (u.department || '').trim() || '미지정';
      if (!byDept.has(d)) byDept.set(d, []);
      byDept.get(d).push(u);
    });
    const deptKeys = Array.from(byDept.keys()).sort((a, b) => {
      if (a === '미지정') return 1;
      if (b === '미지정') return -1;
      return a.localeCompare(b, 'ko');
    });
    deptKeys.forEach((d) => {
      const arr = byDept.get(d).slice().sort(sortByName);
      appendDeptGroup(ul, d, arr, 'd:' + d);
    });
  }

  async function loadDirectoryInto(listId, q, asDm) {
    try {
      // v0.5.10: peopleList 와 DM 검색·캘린더 picker 가 같은 동료 fetch 경로를 공유한다.
      const users = await loadAllCoworkers({ q: q });
      if (listId === 'peopleList') {
        state.lastDirectoryUsers = users;
        state.lastPeopleQuery = q || '';
        state.directoryCache = true;
        renderPeopleList();
        return;
      }
      const ul = $(listId);
      if (!ul) return;
      ul.innerHTML = '';
      if (!users.length) {
        const li = document.createElement('li');
        li.className = 'people-item';
        li.style.color = 'var(--sidebar-fg-dim)';
        li.textContent = '결과가 없습니다';
        ul.appendChild(li);
        return;
      }
      users.forEach((u) => {
        const li = buildPeopleItem(u);
        if (asDm) {
          li.addEventListener('click', async () => {
            try {
              const r = await startDmWith(u.id);
              if (r) closeModal('dmModal');
            } catch (e) {}
          }, { once: false });
        }
        ul.appendChild(li);
      });
    } catch (e) {
      console.warn('directory failed', e);
    }
  }

  let peopleTimer = null;
  $('peopleSearch').addEventListener('input', (e) => {
    clearTimeout(peopleTimer);
    const q = e.target.value.trim();
    peopleTimer = setTimeout(() => loadDirectoryInto('peopleList', q, false), 200);
  });

  // ── 채팅 사이드바 검색 (채널/DM 필터) ──
  let chatSearchTimer = null;
  const _chatSearchEl = $('chatSearch');
  if (_chatSearchEl) {
    _chatSearchEl.addEventListener('input', (e) => {
      clearTimeout(chatSearchTimer);
      const q = e.target.value.trim();
      chatSearchTimer = setTimeout(() => {
        state.chatSearchQuery = q;
        renderRooms();
      }, 100);
    });
  }

  // ── 프로필 (v0.4.23: 팝업 메뉴 제거 → 클릭 시 바로 내 프로필 모달) ──
  $('btnProfile').addEventListener('click', (ev) => {
    ev.stopPropagation();
    openProfileModal();
  });

  function showUserPowerMenu() {
    // v0.4.23: 호환을 위해 함수는 남기되 동작하지 않음
    return;
  }

  async function doLogout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    try { await Api.logout(); } catch (_) {}
    try { await blossom.credentials.clear(); } catch (_) {}
    stopPolling();
    location.reload();
  }

  function doQuit() {
    if (!confirm('Blossom Chat을 종료하시겠습니까?')) return;
    if (window.blossom && blossom.app && blossom.app.quit) {
      blossom.app.quit();
    } else {
      window.close();
    }
  }

  /**
   * @param {'idle_auto'|'manual'|'admin'|'session_expired'|string} [lockReason] 잠금 사유(표시·추적용)
   */
  async function lockApp(lockReason) {
    stopIdleLockMonitor();
    setLockUnlockLoading(false);
    const reason = (lockReason && LOCK_REASON_TEXT[lockReason]) ? lockReason : 'manual';
    // 세션을 끊지 않고 UI만 잠금. PIN 설정 시 6자리 PIN으로 빠르게 해제.
    const prof = state.profile || {};
    const empNo = prof.emp_no || $('loginEmpNo').value || '';
    const name = prof.name || prof.nickname || empNo || '사용자';
    try { setAvatar($('lockAvatar'), prof.profile_image, prof.id || prof.user_id || 0, name); } catch (_) {}
    const nameEl = $('lockName');
    if (nameEl) nameEl.textContent = name;
    const rEl = $('lockReasonText');
    if (rEl) rEl.textContent = LOCK_REASON_TEXT[reason] || '';
    const m = $('loginModal');
    let usePin = false;
    try {
      const st = window.blossom && blossom.security && blossom.security.getAppPinStatus
        ? await blossom.security.getAppPinStatus()
        : null;
      usePin = !!(state.settings.appPinEnabled && st && st.enabled && st.hasPin);
    } catch (_) { usePin = !!state.settings.appPinEnabled; }
    setLockInputMode(usePin);
    m.classList.add('locked');
    m.dataset.lockedEmpNo = empNo;
    m.dataset.lockReason = reason;
    m.dataset.unlockMode = usePin ? 'pin' : 'password';
    const lb = $('lockScreenBlock');
    if (lb) lb.removeAttribute('hidden');
    const errEl = $('loginError');
    if (errEl) {
      errEl.hidden = true;
      errEl.classList.remove('login-error-shake');
    }
    m.hidden = false;
    const lacts = $('lockActions');
    if (lacts) lacts.removeAttribute('hidden');
    setTimeout(function () { $('loginPassword').focus(); }, 50);
  }

  async function unlockApp() {
    const m = $('loginModal');
    const empNo = (m && m.dataset.lockedEmpNo) || (state.profile && state.profile.emp_no) || '';
    const pw = $('loginPassword').value;
    const usePin = m && m.dataset.unlockMode === 'pin';
    const errEl = $('loginError');
    if (!empNo) { return showLogin(); }
    if (!pw) {
      const err0 = $('loginError');
      if (err0) {
        err0.hidden = false;
        err0.textContent = usePin ? '6자리 PIN을 입력하세요.' : '비밀번호를 입력하세요.';
        err0.classList.remove('login-error-shake');
        void err0.offsetWidth;
        err0.classList.add('login-error-shake');
        setTimeout(function () { err0.classList.remove('login-error-shake'); }, 500);
      }
      return;
    }
    if (usePin && !/^\d{6}$/.test(pw)) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = 'PIN은 숫자 6자리입니다.';
        errEl.classList.remove('login-error-shake');
        void errEl.offsetWidth;
        errEl.classList.add('login-error-shake');
        setTimeout(function () { errEl.classList.remove('login-error-shake'); }, 500);
      }
      $('loginPassword').focus();
      $('loginPassword').select();
      return;
    }
    if (errEl) {
      errEl.hidden = true;
      errEl.classList.remove('login-error-shake');
    }
    setLockUnlockLoading(true);
    try {
      if (usePin) {
        const r = await blossom.security.verifyAppPin(pw);
        if (!r || !r.ok) throw new Error('bad_pin');
      } else {
        await Api.login(empNo, pw);
      }
      hideLogin();
      $('loginPassword').value = '';
      if (usePin) startIdleLockMonitor();
      else try { await afterLogin(); } catch (_) {}
    } catch (e) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = usePin ? 'PIN이 올바르지 않습니다.' : '비밀번호가 올바르지 않습니다.';
        errEl.classList.remove('login-error-shake');
        void errEl.offsetWidth;
        errEl.classList.add('login-error-shake');
        setTimeout(function () { errEl.classList.remove('login-error-shake'); }, 500);
      }
      $('loginPassword').focus();
      $('loginPassword').select();
    } finally {
      setLockUnlockLoading(false);
    }
  }

  async function openProfileModal() {
    try {
      const p = await Api.myProfile();
      if (!p || !p.success) throw new Error('프로필 로드 실패');
      state.profile = p.item;
      const x = state.profile;
      setAvatar($('profileAvatar'), x.profile_image, x.id || x.user_id || 0, x.name || x.nickname);
      $('profileName').textContent = x.name || x.nickname || '-';
      $('profileEmpNo').textContent = '사번 ' + (x.emp_no || '-');
      $('profileDept').textContent = [x.department, x.job].filter(Boolean).join(' · ') || '소속 정보 없음';
      $('profNickname').value = x.nickname || '';
      $('profEmail').value = x.email || '';
      $('profMobile').value = x.mobile_phone || '';
      $('profMotto').value = x.motto || '';
      $('profileError').hidden = true;
      openModal('profileModal');
    } catch (e) {
      toast('프로필을 열 수 없습니다', 'error');
    }
  }
  $('btnSaveProfile').addEventListener('click', async () => {
    try {
      await Api.updateMyProfile({
        nickname: $('profNickname').value.trim(),
        email: $('profEmail').value.trim(),
        mobile_phone: $('profMobile').value.trim(),
        motto: $('profMotto').value.trim(),
      });
      toast('프로필 저장됨', 'success');
      const p = await Api.myProfile();
      if (p && p.success) { state.profile = p.item; renderMe(); }
      closeModal('profileModal');
    } catch (e) {
      $('profileError').hidden = false;
      $('profileError').textContent = e.message || '실패';
    }
  });

  // ── 설정 (v0.5: 다패널·diff 저장) ──
  function _serializeSettingsView() {
    return JSON.stringify({
      s: readSettingsObjectFromForm(),
      serverUrl: ($('st_serverUrl') && $('st_serverUrl').value.trim()) || state.serverUrl || '',
    });
  }
  function getActiveSettingsTab() {
    const b = document.querySelector('.settings-tab.active');
    return (b && b.dataset.settingsTab) || 'general';
  }
  function getSettingsKeysForTab(tab) {
    const map = {
      general: ['autoStart', 'minimizeToTray', 'language'],
      notify: ['notifyMaster', 'notifyMention', 'notifyDm', 'notifyChannel', 'notifyKeywords', 'dndEnabled', 'dndStart', 'dndEnd', 'notifySoundId', 'notifyOnFocus', 'notifySound'],
      display: ['theme', 'fontSize', 'chatDensity', 'uiAnimations', 'reduceMotion'],
      security: ['appPinEnabled', 'autoLockMin', 'fileDownloadRestrict', 'allowedFileExtensions', 'maxUploadMb', 'copyRestrict', 'certPinning', 'auditLogLocal', 'settingsHistory'],
      retention: [],
      connection: ['proxyMode', 'proxyUrl', 'adminPolicyServerLock'],
      data: [],
      about: ['releaseNotes'],
    };
    return map[tab] || [];
  }
  function serializeSettingsTab(tab) {
    const cur = readSettingsObjectFromForm();
    const payload = {};
    getSettingsKeysForTab(tab).forEach((k) => { payload[k] = cur[k]; });
    if (tab === 'security') {
      payload.pinNew = ($('st_pinNew') && $('st_pinNew').value) || '';
      payload.pinConfirm = ($('st_pinConfirm') && $('st_pinConfirm').value) || '';
    }
    if (tab === 'connection') payload.serverUrl = ($('st_serverUrl') && $('st_serverUrl').value.trim()) || state.serverUrl || '';
    return JSON.stringify(payload);
  }
  function isAdminUser() {
    const p = state.profile || {};
    const fields = [p.emp_no, p.employee_id, p.login_id, p.username, p.user_name, p.name, p.nickname].map((v) => String(v || '').toLowerCase());
    return fields.indexOf('admin') >= 0
      || fields.indexOf('administrator') >= 0
      || fields.indexOf('관리자') >= 0
      || !!p.is_admin
      || !!p.admin
      || ['ADMIN', 'SUPER_ADMIN', 'SUPERADMIN'].indexOf(String(p.role || '').toUpperCase()) >= 0
      || ['ADMIN', 'SUPER_ADMIN', 'SUPERADMIN'].indexOf(String(p.role_name || '').toUpperCase()) >= 0;
  }
  function readSettingsObjectFromForm() {
    const o = JSON.parse(JSON.stringify(state.settings));
    o.autoStart = !!$('st_autoStart') && $('st_autoStart').checked;
    o.minimizeToTray = !!$('st_minimizeToTray') && $('st_minimizeToTray').checked;
    o.language = ($('st_language') && $('st_language').value) || 'ko';
    o.notifyMaster = !!$('st_notifyMaster') && $('st_notifyMaster').checked;
    o.notifyMention = !!$('st_notifyMention') && $('st_notifyMention').checked;
    o.notifyDm = !!$('st_notifyDm') && $('st_notifyDm').checked;
    o.notifyChannel = !!$('st_notifyChannel') && $('st_notifyChannel').checked;
    o.notifyKeywords = ($('st_notifyKeywords') && $('st_notifyKeywords').value) || '';
    o.dndEnabled = !!$('st_dndEnabled') && $('st_dndEnabled').checked;
    o.dndStart = ($('st_dndStart') && $('st_dndStart').value) || '22:00';
    o.dndEnd = ($('st_dndEnd') && $('st_dndEnd').value) || '08:00';
    o.notifySoundId = ($('st_notifySoundId') && $('st_notifySoundId').value) || 'default';
    o.notifyOnFocus = !!$('st_notifyOnFocus') && $('st_notifyOnFocus').checked;
    o.notifySound = o.notifySoundId !== 'none';
    o.theme = (document.querySelector('input[name=theme]:checked') || {}).value || 'auto';
    o.fontSize = ($('st_fontSize') && $('st_fontSize').value) || '15';
    o.chatDensity = ($('st_chatDensity') && $('st_chatDensity').value) || 'cozy';
    o.sidebarWidth = Math.min(400, Math.max(240, parseInt(String(state.settings.sidebarWidth || 280), 10) || 280));
    o.uiAnimations = !!$('st_uiAnimations') && $('st_uiAnimations').checked;
    o.appPinEnabled = !!$('st_appPinEnabled') && $('st_appPinEnabled').checked;
    o.autoLockMin = Math.min(240, Math.max(1, parseInt(($('st_autoLockMin') && $('st_autoLockMin').value) || '30', 10) || 30));
    o.fileDownloadRestrict = !!$('st_fileDownloadRestrict') && $('st_fileDownloadRestrict').checked;
    o.allowedFileExtensions = (($('st_allowedFileExtensions') && $('st_allowedFileExtensions').value) || '').split(/[\s,;]+/).map((x) => x.replace(/^\./, '').toLowerCase()).filter(Boolean).join(',');
    o.maxUploadMb = Math.min(500, Math.max(1, parseInt(($('st_maxUploadMb') && $('st_maxUploadMb').value) || '50', 10) || 50));
    o.copyRestrict = !!$('st_copyRestrict') && $('st_copyRestrict').checked;
    o.certPinning = !!$('st_certPinning') && $('st_certPinning').checked;
    o.auditLogLocal = !!$('st_auditLogLocal') && $('st_auditLogLocal').checked;
    o.settingsHistory = !!$('st_settingsHistory') && $('st_settingsHistory').checked;
    o.proxyMode = ($('st_proxyMode') && $('st_proxyMode').value) || 'system';
    o.proxyUrl = ($('st_proxyUrl') && $('st_proxyUrl').value.trim()) || '';
    o.adminPolicyServerLock = !!$('st_adminPolicyServerLock') && $('st_adminPolicyServerLock').checked;
    o.releaseNotes = ($('releaseNotesEdit') && !$('releaseNotesEdit').hidden)
      ? $('releaseNotesEdit').value
      : (state.settings.releaseNotes || '');
    o.reduceMotion = !o.uiAnimations;
    return o;
  }
  function writeSettingsObjectToForm() {
    const s = state.settings;
    if ($('st_autoStart')) $('st_autoStart').checked = !!s.autoStart;
    if ($('st_minimizeToTray')) $('st_minimizeToTray').checked = s.minimizeToTray !== false;
    if ($('st_language')) $('st_language').value = s.language || 'ko';
    if ($('st_notifyMaster')) $('st_notifyMaster').checked = s.notifyMaster !== false;
    if ($('st_notifyMention')) $('st_notifyMention').checked = s.notifyMention !== false;
    if ($('st_notifyDm')) $('st_notifyDm').checked = s.notifyDm !== false;
    if ($('st_notifyChannel')) $('st_notifyChannel').checked = s.notifyChannel !== false;
    if ($('st_notifyKeywords')) $('st_notifyKeywords').value = s.notifyKeywords || '';
    if ($('st_dndEnabled')) $('st_dndEnabled').checked = !!s.dndEnabled;
    if ($('st_dndStart')) $('st_dndStart').value = s.dndStart || '22:00';
    if ($('st_dndEnd')) $('st_dndEnd').value = s.dndEnd || '08:00';
    if ($('st_notifySoundId')) $('st_notifySoundId').value = s.notifySoundId || (s.notifySound === false ? 'none' : 'default');
    if ($('st_notifyOnFocus')) $('st_notifyOnFocus').checked = !!s.notifyOnFocus;
    document.querySelectorAll('input[name=theme]').forEach((r) => { r.checked = (r.value === (s.theme || 'auto')); });
    if ($('st_fontSize')) $('st_fontSize').value = s.fontSize || '15';
    if ($('st_chatDensity')) $('st_chatDensity').value = s.chatDensity || 'cozy';
    if ($('st_sidebarWidth')) { $('st_sidebarWidth').value = String(s.sidebarWidth || 280); if ($('st_sidebarWidthVal')) $('st_sidebarWidthVal').textContent = (s.sidebarWidth || 280) + 'px'; }
    if ($('st_uiAnimations')) $('st_uiAnimations').checked = s.uiAnimations !== false;
    if ($('st_appPinEnabled')) $('st_appPinEnabled').checked = !!s.appPinEnabled;
    if ($('st_autoLockMin')) $('st_autoLockMin').value = String(s.autoLockMin || 30);
    if ($('st_fileDownloadRestrict')) $('st_fileDownloadRestrict').checked = !!s.fileDownloadRestrict;
    if ($('st_allowedFileExtensions')) $('st_allowedFileExtensions').value = s.allowedFileExtensions || 'pdf,png,jpg,jpeg,gif,webp,txt,log,json,xml,doc,docx,hwp,hwpx,zip';
    if ($('st_maxUploadMb')) $('st_maxUploadMb').value = String(s.maxUploadMb || 50);
    if ($('st_copyRestrict')) $('st_copyRestrict').checked = !!s.copyRestrict;
    if ($('st_certPinning')) $('st_certPinning').checked = s.certPinning !== false;
    if ($('st_auditLogLocal')) $('st_auditLogLocal').checked = s.auditLogLocal !== false;
    if ($('st_settingsHistory')) $('st_settingsHistory').checked = s.settingsHistory !== false;
    if ($('st_proxyMode')) $('st_proxyMode').value = s.proxyMode || 'system';
    if ($('st_proxyUrl')) $('st_proxyUrl').value = s.proxyUrl || '';
    if ($('st_adminPolicyServerLock')) $('st_adminPolicyServerLock').checked = !!s.adminPolicyServerLock;
    if ($('st_serverUrl')) { $('st_serverUrl').value = state.serverUrl || ''; $('st_serverUrl').disabled = !!s.adminPolicyServerLock; }
    renderReleaseNotesPanel(false);
    setSettingsDndRow();
    setSettingsProxyRow();
    setSettingsPolicyUi();
  }
  function setSettingsDndRow() {
    const d = $('st_dndRow');
    const on = $('st_dndEnabled') && $('st_dndEnabled').checked;
    if (d) d.hidden = !on;
  }
  function setSettingsProxyRow() {
    const c = ($('st_proxyMode') && $('st_proxyMode').value) || state.settings.proxyMode || 'system';
    const r = $('st_proxyRow');
    if (r) r.hidden = c !== 'custom';
  }
  function setSettingsPolicyUi() {
    const pol = ($('st_adminPolicyServerLock') && $('st_adminPolicyServerLock').checked) || false;
    const b = $('st_serverLockBadge');
    if (b) b.hidden = !pol;
    if ($('st_serverUrl')) $('st_serverUrl').disabled = pol;
    const admin = isAdminUser();
    const allowed = $('st_allowedFileExtensions');
    if (allowed) {
      allowed.disabled = !admin;
      allowed.title = admin ? '' : '관리자만 수정할 수 있습니다.';
    }
  }
  function markSettingsFormDirty() {
    const tab = getActiveSettingsTab();
    const cur = serializeSettingsTab(tab);
    const snap = state._settingsTabSnaps && state._settingsTabSnaps[tab];
    const dirty = snap && cur !== snap;
    const btn = $('btnSettingsSave');
    if (btn) btn.disabled = !dirty;
    const h = $('st_footDirty');
    if (h) {
      h.hidden = !dirty;
      h.textContent = dirty ? '현재 페이지에 저장되지 않은 변경이 있습니다' : '';
    }
  }
  function appendLocalSettingsHistory(changedKeys) {
    if (!state.settings.settingsHistory) return;
    try {
      const a = JSON.parse(localStorage.getItem('blossom_settings_history') || '[]');
      a.push({ t: new Date().toISOString(), keys: changedKeys });
      localStorage.setItem('blossom_settings_history', JSON.stringify(a.slice(-200)));
    } catch (_) {}
  }
  function appendLocalAudit(line) {
    if (!state.settings.auditLogLocal) return;
    try {
      const a = JSON.parse(localStorage.getItem('blossom_audit_log') || '[]');
      a.push({ t: new Date().toISOString(), line: line });
      localStorage.setItem('blossom_audit_log', JSON.stringify(a.slice(-500)));
    } catch (_) {}
  }
  async function refreshCertStatusLine() {
    const el = $('st_certStatus');
    if (!el) return;
    const u = (state.serverUrl || '').trim();
    if (!u) { el.textContent = '서버 주소가 없습니다. 연결 탭에서 설정하세요.'; return; }
    if (!/^https:\/\//i.test(u)) { el.textContent = 'HTTP — TLS(암호화) 미사용. 사내망·테스트에 한해 사용하세요.'; return; }
    el.textContent = 'TLS(HTTPS) — 브라우저/Electron이 시스템 신뢰 저장소로 인증서를 검증합니다.';
  }
  function renderReleaseNotesPanel(open) {
    const admin = isAdminUser();
    const panel = $('releaseNotesPanel');
    const view = $('releaseNotesView');
    const edit = $('releaseNotesEdit');
    const actions = $('releaseNotesActions');
    const notes = state.settings.releaseNotes || '등록된 릴리즈 노트가 없습니다.';
    if (panel) panel.hidden = open === false ? true : panel.hidden;
    if (view) view.textContent = notes;
    if (edit) {
      edit.hidden = !admin;
      edit.value = notes;
    }
    if (actions) actions.hidden = !admin;
  }

  let _retentionActiveType = 'CHANNEL';
  let _retentionPolicies = {};
  function retentionLabel(type) {
    return ({ CHANNEL: '채널', GROUP: '그룹채팅', DIRECT: '개인채팅' })[type] || '대화방';
  }
  function retentionSecondsFromForm() {
    const period = ($('rt_period') && $('rt_period').value) || '86400';
    if (period !== 'custom') return parseInt(period, 10) || 86400;
    const value = Math.max(1, parseInt(($('rt_customValue') && $('rt_customValue').value) || '24', 10) || 24);
    const unit = ($('rt_customUnit') && $('rt_customUnit').value) || 'hours';
    return value * (unit === 'days' ? 86400 : 3600);
  }
  function setRetentionCustomVisibility() {
    const custom = (($('rt_period') && $('rt_period').value) || '') === 'custom';
    if ($('rt_customValue')) $('rt_customValue').hidden = !custom;
    if ($('rt_customUnit')) $('rt_customUnit').hidden = !custom;
  }
  function retentionSecondsLabel(sec) {
    sec = parseInt(sec || 86400, 10) || 86400;
    if (sec % 86400 === 0) return (sec / 86400) + '일';
    if (sec % 3600 === 0) return (sec / 3600) + '시간';
    return Math.round(sec / 3600) + '시간';
  }
  function updateRetentionPreview() {
    const type = _retentionActiveType;
    const enabled = !!($('rt_enabled') && $('rt_enabled').checked);
    const sec = retentionSecondsFromForm();
    const label = retentionLabel(type);
    const text = enabled
      ? label + '은 마지막 대화 후 ' + retentionSecondsLabel(sec) + ' 동안 새 메시지가 없으면 대화 내용이 자동 삭제됩니다. 대화가 이어질 때마다 삭제 예정 시간이 연장됩니다.'
      : label + ' 자동삭제가 비활성화되어 있습니다.';
    if ($('retentionPreviewText')) $('retentionPreviewText').textContent = text;
  }
  function writeRetentionPolicyToForm(policy) {
    const p = policy || {};
    if ($('rt_enabled')) $('rt_enabled').checked = !!p.enabled;
    const sec = parseInt(p.retention_seconds || 86400, 10) || 86400;
    const presets = ['3600', '21600', '43200', '86400', '259200', '604800', '2592000'];
    if ($('rt_period')) $('rt_period').value = presets.indexOf(String(sec)) >= 0 ? String(sec) : 'custom';
    if ($('rt_customUnit')) $('rt_customUnit').value = sec % 86400 === 0 ? 'days' : 'hours';
    if ($('rt_customValue')) $('rt_customValue').value = String(sec % 86400 === 0 ? sec / 86400 : Math.max(1, Math.round(sec / 3600)));
    if ($('rt_resetOnNewActivity')) $('rt_resetOnNewActivity').checked = p.reset_on_new_activity !== false;
    if ($('rt_deleteAttachments')) $('rt_deleteAttachments').checked = p.delete_attachments !== false;
    if ($('rt_applyExisting')) $('rt_applyExisting').checked = p.apply_existing !== false;
    setRetentionCustomVisibility();
    const admin = isAdminUser();
    const lock = $('retentionAdminLock');
    if (lock) lock.hidden = admin;
    ['rt_enabled', 'rt_period', 'rt_customValue', 'rt_customUnit', 'rt_deleteAttachments', 'rt_applyExisting', 'btnRetentionSave', 'btnRetentionApplyExisting', 'btnRetentionCleanup'].forEach((id) => {
      if ($(id)) $(id).disabled = !admin;
    });
    updateRetentionPreview();
  }
  async function loadRetentionPolicies() {
    if (!isAdminUser()) {
      writeRetentionPolicyToForm(_retentionPolicies[_retentionActiveType] || { enabled: false, retention_seconds: 86400 });
      return;
    }
    try {
      const res = await Api.listRetentionPolicies();
      const items = (res && res.items) || [];
      _retentionPolicies = {};
      items.forEach((p) => { _retentionPolicies[p.room_type] = p; });
      writeRetentionPolicyToForm(_retentionPolicies[_retentionActiveType]);
    } catch (e) {
      toast('자동삭제 정책을 불러오지 못했습니다: ' + (e.message || ''), 'error');
      writeRetentionPolicyToForm(_retentionPolicies[_retentionActiveType] || { enabled: false, retention_seconds: 86400 });
    }
  }
  async function saveRetentionPolicy() {
    if (!isAdminUser()) { toast('관리자만 수정할 수 있습니다.', 'error'); return; }
    const payload = {
      enabled: !!($('rt_enabled') && $('rt_enabled').checked),
      retention_seconds: retentionSecondsFromForm(),
      delete_attachments: !!($('rt_deleteAttachments') && $('rt_deleteAttachments').checked),
      exclude_pinned: false,
      exclude_notice: false,
      exclude_important: false,
      reset_on_new_activity: true,
      apply_existing: !!($('rt_applyExisting') && $('rt_applyExisting').checked),
    };
    const res = await Api.updateRetentionPolicy(_retentionActiveType, payload);
    if (res && res.item) _retentionPolicies[_retentionActiveType] = res.item;
    writeRetentionPolicyToForm(_retentionPolicies[_retentionActiveType]);
    toast('자동삭제 정책을 저장했습니다.', 'success');
  }

  $('btnSettings').addEventListener('click', openSettingsModal);
  function openSettingsModal() {
    writeSettingsObjectToForm();
    if ($('st_pinNew')) $('st_pinNew').value = state.settings.appPinEnabled ? PIN_MASK : '';
    if ($('st_pinConfirm')) $('st_pinConfirm').value = state.settings.appPinEnabled ? PIN_MASK : '';
    if ($('st_pinHint')) $('st_pinHint').textContent = '';
    if ($('st_pinBox')) $('st_pinBox').hidden = !state.settings.appPinEnabled;
    state._settingsModalSnap = _serializeSettingsView();
    state._settingsTabSnaps = {};
    ['general', 'notify', 'display', 'security', 'retention', 'connection', 'data', 'about'].forEach((tab) => {
      state._settingsTabSnaps[tab] = serializeSettingsTab(tab);
    });
    markSettingsFormDirty();
    setSettingsTab('general');
    refreshCertStatusLine();
    if ($('st_connTestMsg')) { $('st_connTestMsg').hidden = true; $('st_connTestMsg').textContent = ''; }
    if (window.blossom && blossom.app && blossom.app.getVersion) {
      blossom.app.getVersion().then((v) => {
        const a = $('aboutVersion'); if (a) a.textContent = 'v' + v;
        const t = $('titlebarVersion'); if (t) t.textContent = 'v' + v;
      }).catch(() => {});
    }
    openModal('settingsModal');
  }
  function setSettingsTab(name) {
    $$('.settings-tab').forEach((b) => b.classList.toggle('active', b.dataset.settingsTab === name));
    $$('.settings-pane').forEach((p) => { p.hidden = p.dataset.pane !== name; });
    if (name === 'retention') loadRetentionPolicies();
    markSettingsFormDirty();
  }
  $$('.settings-tab').forEach((b) => b.addEventListener('click', () => setSettingsTab(b.dataset.settingsTab)));

  (function bindSettingsFormWatch() {
    const root = document.getElementById('settingsModal');
    if (!root) return;
    function on() { markSettingsFormDirty(); }
    ['st_pinNew', 'st_pinConfirm'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('focus', () => {
        if (el.value === PIN_MASK) el.value = '';
        markSettingsFormDirty();
      });
      el.addEventListener('input', () => {
        el.value = el.value.replace(/\D/g, '').slice(0, 6);
        markSettingsFormDirty();
      });
    });
    root.addEventListener('input', on);
    root.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'st_dndEnabled') setSettingsDndRow();
      if (e.target && e.target.id === 'st_proxyMode') setSettingsProxyRow();
      if (e.target && String(e.target.id || '').indexOf('rt_') === 0) {
        setRetentionCustomVisibility();
        updateRetentionPreview();
        return;
      }
      if (e.target && e.target.id === 'st_adminPolicyServerLock') {
        setSettingsPolicyUi();
        markSettingsFormDirty();
        return;
      }
      if (e.target && e.target.id === 'st_appPinEnabled' && $('st_pinBox')) {
        $('st_pinBox').hidden = !e.target.checked;
      }
      on();
    });
  })();
  $$('#retentionTypeTabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      _retentionActiveType = btn.dataset.retentionType || 'CHANNEL';
      $$('#retentionTypeTabs button').forEach((b) => b.classList.toggle('active', b === btn));
      writeRetentionPolicyToForm(_retentionPolicies[_retentionActiveType] || { enabled: false, retention_seconds: 86400 });
    });
  });
  if ($('btnRetentionSave')) $('btnRetentionSave').addEventListener('click', () => saveRetentionPolicy().catch((e) => toast('정책 저장 실패: ' + (e.message || ''), 'error')));
  if ($('btnRetentionReload')) $('btnRetentionReload').addEventListener('click', () => loadRetentionPolicies());
  if ($('btnRetentionApplyExisting')) $('btnRetentionApplyExisting').addEventListener('click', async () => {
    try { await Api.applyRetentionPoliciesToExisting(); toast('기존 대화방에 정책을 적용했습니다.', 'success'); }
    catch (e) { toast('기존 방 적용 실패: ' + (e.message || ''), 'error'); }
  });
  if ($('btnRetentionCleanup')) $('btnRetentionCleanup').addEventListener('click', async () => {
    if (!confirm('지금 자동삭제 정리 작업을 실행하시겠습니까?')) return;
    try {
      const res = await Api.runRetentionCleanup();
      const r = (res && res.result) || {};
      toast('정리 완료: 방 ' + (r.rooms || 0) + '개, 메시지 ' + (r.messages || 0) + '개', 'success');
    } catch (e) { toast('정리 작업 실패: ' + (e.message || ''), 'error'); }
  });
  const btnCancel = document.getElementById('btnSettingsCancel');
  if (btnCancel) {
    btnCancel.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      writeSettingsObjectToForm();
      state._settingsModalSnap = _serializeSettingsView();
      state._settingsTabSnaps = {};
      ['general', 'notify', 'display', 'security', 'retention', 'connection', 'data', 'about'].forEach((tab) => {
        state._settingsTabSnaps[tab] = serializeSettingsTab(tab);
      });
      markSettingsFormDirty();
      closeModal('settingsModal');
    });
  }

  $('btnSettingsSave').addEventListener('click', async () => {
    const activeTab = getActiveSettingsTab();
    const enPin = !!$('st_appPinEnabled') && $('st_appPinEnabled').checked;
    const p1a = ($('st_pinNew') && $('st_pinNew').value) || '';
    const p2a = ($('st_pinConfirm') && $('st_pinConfirm').value) || '';
    const pinMaskShown = p1a === PIN_MASK && p2a === PIN_MASK;
    const pinHasNew = !pinMaskShown && (p1a || p2a);
    if (activeTab === 'security' && enPin && pinHasNew) {
      if (!p1a || !p2a) { if ($('st_pinHint')) $('st_pinHint').textContent = 'PIN과 확인을 모두 입력하세요.'; return; }
      if (p1a !== p2a) { if ($('st_pinHint')) $('st_pinHint').textContent = 'PIN이 일치하지 않습니다.'; return; }
      if (!/^\d{6}$/.test(p1a)) { if ($('st_pinHint')) $('st_pinHint').textContent = 'PIN은 숫자 6자리여야 합니다.'; return; }
    }
    const before = state._settingsTabSnaps && state._settingsTabSnaps[activeTab];
    const nextSettings = readSettingsObjectFromForm();
    const newServer = (($('st_serverUrl') && $('st_serverUrl').value) || '').trim();
    if (nextSettings.adminPolicyServerLock) {
      /* 정책 잠금 시 서버 URL 폼은 비활성, 기존 값 유지 */ }
    const prev = JSON.parse(before || '{}');
    const changed = [];
    const keys = getSettingsKeysForTab(activeTab);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const a = nextSettings[k];
      const b = prev[k];
      if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(k);
    }
    const serverChanged = activeTab === 'connection' && newServer && newServer !== prev.serverUrl && !nextSettings.adminPolicyServerLock;
    const onlyPin = activeTab === 'security' && enPin && pinHasNew;
    if (changed.length === 0 && !serverChanged && !onlyPin) {
      toast('현재 페이지에 저장할 변경 사항이 없습니다.', 'info');
      return;
    }
    for (let j = 0; j < changed.length; j++) {
      const k = changed[j];
      state.settings[k] = nextSettings[k];
    }
    if (serverChanged) {
      state.serverUrl = newServer;
      await blossom.settings.set('serverUrl', newServer);
      Api.setServer(newServer);
      toast('서버 주소가 변경되었습니다. 적용을 위해 앱을 다시 시작하는 것이 좋습니다.', 'success');
    }
    for (let n = 0; n < changed.length; n++) {
      const k2 = changed[n];
      try { await blossom.settings.set(k2, state.settings[k2]); } catch (_) {}
    }
    if (activeTab === 'general' && blossom.app && blossom.app.setAutoStart) blossom.app.setAutoStart(!!state.settings.autoStart);
    appendLocalSettingsHistory(changed);
    if (changed.length) appendLocalAudit('설정 변경: ' + changed.join(', '));
    if (activeTab === 'security' && blossom.security && blossom.security.setAppPin) {
      const en = !!$('st_appPinEnabled') && $('st_appPinEnabled').checked;
      const p1 = ($('st_pinNew') && $('st_pinNew').value) || '';
      const p2 = ($('st_pinConfirm') && $('st_pinConfirm').value) || '';
      if (en) {
        if (p1 && p2 && !(p1 === PIN_MASK && p2 === PIN_MASK)) {
          const r = await blossom.security.setAppPin({ pin: p1, enable: true });
          if (r && !r.ok) {
            if ($('st_pinHint')) $('st_pinHint').textContent = r.error === 'format' ? 'PIN은 숫자 6자리여야 합니다.' : 'PIN을 저장할 수 없습니다(암호화 불가).';
            return;
          }
        }
        if ($('st_pinHint')) $('st_pinHint').textContent = '';
      } else {
        await blossom.security.setAppPin({ enable: false });
        state.settings.appPinEnabled = false;
        await blossom.settings.set('appPinEnabled', false);
      }
      if ($('st_pinNew')) $('st_pinNew').value = en ? PIN_MASK : '';
      if ($('st_pinConfirm')) $('st_pinConfirm').value = en ? PIN_MASK : '';
    }
    applyTheme();
    applyFontSize();
    applyDisplayPreferences();
    try {
      stopIdleLockMonitor();
      startIdleLockMonitor();
    } catch (_) {}
    state._settingsModalSnap = _serializeSettingsView();
    if (!state._settingsTabSnaps) state._settingsTabSnaps = {};
    state._settingsTabSnaps[activeTab] = serializeSettingsTab(activeTab);
    markSettingsFormDirty();
    toast('현재 페이지 설정을 저장했습니다', 'success');
  });

  const _stTest = document.getElementById('st_btnConnTest');
  if (_stTest) {
    _stTest.addEventListener('click', async () => {
      const url = (($('st_serverUrl') && $('st_serverUrl').value) || state.serverUrl || '').trim();
      const msg = $('st_connTestMsg');
      if (!url || !/^https?:\/\//i.test(url)) { if (msg) { msg.hidden = false; msg.textContent = '올바른 http(s) 주소를 입력하세요.'; } return; }
      try { if (window.blossom && blossom.net && blossom.net.trustHost) await blossom.net.trustHost(url); } catch (_) {}
      const t0 = Date.now();
      try {
        const res = await fetch(url.replace(/\/+$/, '') + '/api/auth/session-check', { method: 'GET', credentials: 'include', cache: 'no-store' });
        const ms = Date.now() - t0;
        if (msg) { msg.hidden = false; msg.textContent = '연결 성공 — HTTP ' + res.status + ', ' + ms + 'ms'; }
        toast('서버 응답 ' + res.status, 'success');
      } catch (e) {
        if (msg) { msg.hidden = false; msg.textContent = '연결 실패: ' + (e && e.message ? e.message : e); }
      }
    });
  }
  const _rLogout = document.getElementById('btnRemoteLogout');
  if (_rLogout) {
    _rLogout.addEventListener('click', async () => {
      if (!confirm('이 기기·다른 기기의 세션 정책에 따라 달라질 수 있습니다. 지금 이 클라이언트에서 로그아웃하시겠습니까?')) return;
      try { await Api.logout(); } catch (_) {}
      try { await blossom.credentials.clear(); } catch (_) {}
      stopPolling();
      closeModal('settingsModal');
      location.reload();
    });
  }
  const _hist = document.getElementById('btnLoginHistory');
  if (_hist) {
    _hist.addEventListener('click', () => {
      try {
        const raw = localStorage.getItem('blossom_login_log') || '[]';
        alert('최근 로그인(로컬 기록)\n' + raw);
      } catch (e) { alert(String(e)); }
    });
  }
  const _dlOpen = document.getElementById('btnDownloadOpen');
  if (_dlOpen) {
    _dlOpen.addEventListener('click', async () => {
      try {
        if (blossom.app && blossom.app.openDownloads) {
          const ok = await blossom.app.openDownloads();
          toast(ok ? '다운로드 폴더를 열었습니다' : '다운로드 폴더를 열 수 없습니다', ok ? 'success' : 'error');
        } else {
          toast('다운로드 폴더 열기 API를 사용할 수 없습니다.', 'error');
        }
      } catch (_) {
        toast('다운로드 폴더를 열 수 없습니다', 'error');
      }
    });
  }
  const _cc = document.getElementById('btnCacheClear');
  if (_cc) {
    _cc.addEventListener('click', async () => {
      if (!confirm('HTTP 캐시를 지웁니다. 계속하시겠습니까?')) return;
      try {
        if (blossom.app && blossom.app.clearCache) {
          const ok = await blossom.app.clearCache();
          toast(ok ? '캐시를 정리했습니다' : '캐시 정리에 실패했습니다', ok ? 'success' : 'error');
        } else {
          toast('캐시 API를 사용할 수 없습니다.', 'error');
        }
      } catch (e) { toast('캐시 정리에 실패했습니다', 'error'); }
    });
  }
  const _logc = document.getElementById('btnLogClear');
  if (_logc) {
    _logc.addEventListener('click', () => {
      if (!confirm('로컬 감사/이력 링크를 비웁니다. 계속?')) return;
      try {
        localStorage.removeItem('blossom_audit_log');
        localStorage.removeItem('blossom_settings_history');
        localStorage.removeItem('blossom_login_log');
        toast('로컬 로그/이력을 비웠습니다', 'success');
      } catch (_) { toast('실패', 'error'); }
    });
  }
  const _bchk = document.getElementById('btnCheckUpdate');
  if (_bchk) {
    _bchk.addEventListener('click', async () => {
      let v = '';
      try { if (blossom.app && blossom.app.getVersion) v = await blossom.app.getVersion(); } catch (_) {}
      toast('현재 앱 버전: v' + (v || '?') + ' — 별도 업데이트 서버가 없으면 NSIS/배포 채널을 확인하세요.', 'success');
    });
  }
  const _brn = document.getElementById('btnReleaseNotes');
  if (_brn) {
    _brn.addEventListener('click', () => {
      const panel = $('releaseNotesPanel');
      const license = $('licensePanel');
      if (license) license.hidden = true;
      if (panel) panel.hidden = !panel.hidden;
      renderReleaseNotesPanel(true);
      if (isAdminUser()) markSettingsFormDirty();
    });
  }
  const _brns = document.getElementById('btnReleaseNotesSave');
  if (_brns) {
    _brns.addEventListener('click', async () => {
      if (!isAdminUser()) { toast('admin 사용자만 릴리즈 노트를 저장할 수 있습니다.', 'error'); return; }
      state.settings.releaseNotes = (($('releaseNotesEdit') && $('releaseNotesEdit').value) || '').trim();
      await blossom.settings.set('releaseNotes', state.settings.releaseNotes);
      if (!state._settingsTabSnaps) state._settingsTabSnaps = {};
      state._settingsTabSnaps.about = serializeSettingsTab('about');
      renderReleaseNotesPanel(true);
      markSettingsFormDirty();
      toast('릴리즈 노트를 저장했습니다', 'success');
    });
  }
  const _blc = document.getElementById('btnLicense');
  if (_blc) {
    _blc.addEventListener('click', () => {
      const rn = $('releaseNotesPanel');
      if (rn) rn.hidden = true;
      const p = $('licensePanel');
      if (p) p.hidden = !p.hidden;
    });
  }
  const _bdata = document.getElementById('btnDataReset');
  if (_bdata) {
    _bdata.addEventListener('click', async () => {
      if (!confirm('이 PC에 저장된 접속 정보·쿠키·캐시·임시 데이터를 지우고 앱을 다시 시작합니다. 중앙 서버의 채팅 데이터는 삭제되지 않습니다. 계속하시겠습니까?')) return;
      try { await blossom.credentials.clear(); } catch (_) {}
      try {
        if (blossom.app && blossom.app.resetAll) await blossom.app.resetAll();
        else location.reload();
      } catch (_) { location.reload(); }
    });
  }
  const ssw = document.getElementById('st_sidebarWidth');
  if (ssw) {
    ssw.addEventListener('input', function () {
      const elV = document.getElementById('st_sidebarWidthVal');
      if (elV) elV.textContent = ssw.value + 'px';
      markSettingsFormDirty();
    });
  }

  // ── 섹션 toggle ──
  $$('.section-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const t = $(targetId);
      if (!t) return;
      const expanded = btn.getAttribute('aria-expanded') !== 'false';
      btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      t.hidden = expanded;
    });
  });

  // 트레이 navigate
  if (window.blossom && blossom.onNavigate) {
    blossom.onNavigate((p) => {
      if (p && p.roomId) {
        const r = findRoomById(p.roomId);
        if (r) { setTab('chat'); openRoom(r); }
      }
    });
  }

  // v0.4.27: lockApp을 외부 IIFE에서도 사용하도록 노출 (인자: 잠금 사유)
  try { window.__blossomLockApp = lockApp; } catch (_) {}

  boot();
})();


// === BLOSSOM_RAIL_HANDLERS_v3 ===
(function bindRailExtras() {
  const $$ = (id) => document.getElementById(id);
  const api = (window.blossom && window.blossom.app) || null;

  const btnTrayHide = $$('btnTrayHide');
  if (btnTrayHide) {
    // v0.4.27: '트레이로 숨기기' → 작업표시줄로 최소화 (아이콘이 사라지는 문제 해결)
    btnTrayHide.title = '최소화';
    btnTrayHide.setAttribute('aria-label', '최소화');
    btnTrayHide.addEventListener('click', () => {
      try { if (api && api.minimize) api.minimize(); else if (api && api.hideToTray) api.hideToTray(); } catch (e) {}
    });
  }

  const btnQuit = $$('btnQuit');
  if (btnQuit) btnQuit.addEventListener('click', () => {
    if (!confirm('Blossom Chat을 종료하시겠습니까?')) return;
    try { if (api && api.quit) api.quit(); else window.close(); } catch (e) {}
  });

  const btnLock = $$('btnLock');
  if (btnLock) btnLock.addEventListener('click', () => {
    try {
      if (typeof window.__blossomLockApp === 'function') window.__blossomLockApp('manual');
      else console.error('lockApp not available');
    } catch (e) { console.error(e); }
  });
})();

// === CalendarView v1: 웹 Blossom /api/calendar/schedules 동기화 ===
window.CalendarView = (function () {
  const $ = (id) => document.getElementById(id);
  const state = { ym: null, items: [], me: null };
  let initialized = false;

  function openLocalModal(id) {
    const modal = $(id);
    if (modal) modal.hidden = false;
  }

  function closeLocalModal(id) {
    const modal = $(id);
    if (modal) modal.hidden = true;
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymKey(d) { return d.getFullYear() + '-' + pad(d.getMonth()+1); }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
  function isoLocal(d) {
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())+':00';
  }
  function fromIsoLocal(s) {
    if (!s) return null;
    return new Date(s);
  }
  function toLocalInputValue(d) {
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
  }
  function fromLocalInputValue(v) {
    const raw = String(v || '').trim();
    if (!raw) return '';
    if (raw.includes('T')) return raw.length === 16 ? raw + ':00' : raw;
    return raw.replace(' ', 'T') + (raw.length === 16 ? ':00' : '');
  }
  function normalizeDateTimeInput(v) {
    return String(v || '').trim().replace('T', ' ').slice(0, 16);
  }
  function setSelectValue(id, value, fallback) {
    const el = $(id);
    if (el) el.value = value || fallback || '';
  }

  async function ensureMe() {
    if (state.me) return state.me;
    try { state.me = await Api.myProfile(); } catch (_) {}
    return state.me;
  }

  async function open() {
    if (!initialized) bind();
    initialized = true;
    if (!state.ym) state.ym = ymKey(new Date());
    render();
    try { await ensureMe(); } catch (e) { console.warn('calendar profile failed', e); }
    await reload();
  }

  async function reload() {
    const [y, m] = state.ym.split('-').map(Number);
    const start = new Date(y, m-1, 1);
    const end = new Date(y, m, 0, 23, 59, 59);
    try {
      const resp = await Api.listCalendarSchedules({
        start: isoLocal(start), end: isoLocal(end),
      });
      state.items = (resp && resp.items) || [];
    } catch (e) {
      console.warn('cal load failed', e);
      state.items = [];
    }
    render();
  }

  async function moveScheduleToDate(evt, targetDate) {
    if (!evt || !evt.id || !targetDate) return;
    const start = new Date(evt.start_datetime);
    const end = new Date(evt.end_datetime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
    const duration = end.getTime() - start.getTime();
    const nextStart = new Date(targetDate);
    nextStart.setHours(evt.is_all_day ? 0 : start.getHours(), evt.is_all_day ? 0 : start.getMinutes(), 0, 0);
    const nextEnd = evt.is_all_day
      ? new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate(), 23, 59, 0, 0)
      : new Date(nextStart.getTime() + Math.max(duration, 30 * 60 * 1000));
    try {
      await Api.updateCalendarSchedule(evt.id, {
        title: evt.title || '',
        start_datetime: isoLocal(nextStart),
        end_datetime: isoLocal(nextEnd),
        location: evt.location || '',
        description: evt.description || '',
        share_scope: evt.share_scope || 'PRIVATE',
        event_type: evt.event_type || '기타',
        is_all_day: !!evt.is_all_day,
        attendees: evt.attendees || [],
        reminders: evt.reminders || [],
        sticker: '',
        is_important: !!evt.is_important,
        color_code: evt.color_code || '#6366f1',
      });
      await reload();
    } catch (e) {
      alert('일정 이동 실패: ' + ((e && e.payload && e.payload.message) || (e && e.message) || ''));
    }
  }

  function render() {
    const [y, m] = state.ym.split('-').map(Number);
    const lbl = $('calCurrentLabel'); if (lbl) lbl.textContent = y + '년 ' + m + '월';
    const grid = $('calMonthGrid'); if (!grid) return;
    grid.innerHTML = '';
    const dows = ['일','월','화','수','목','금','토'];
    dows.forEach((d, idx) => {
      const el = document.createElement('div');
      el.className = 'cal-mh' + (idx === 0 ? ' dow-sun' : (idx === 6 ? ' dow-sat' : ''));
      el.textContent = d;
      grid.appendChild(el);
    });
    const first = new Date(y, m-1, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const prevDays = new Date(y, m-1, 0).getDate();
    const today = dateKey(new Date());
    // 일정을 날짜별로 그룹핑
    const byDate = {};
    state.items.forEach((evt) => {
      const sd = new Date(evt.start_datetime);
      const ed = new Date(evt.end_datetime);
      // 멀티데이는 시작일에만 표시 (간단화)
      const k = dateKey(sd);
      if (!byDate[k]) byDate[k] = [];
      byDate[k].push(evt);
    });
    function makeCell(d, monthOffset) {
      const realDate = new Date(y, m-1 + monthOffset, d);
      const key = dateKey(realDate);
      const dow = realDate.getDay();
      const cell = document.createElement('div');
      cell.className = 'cal-mc' + (monthOffset !== 0 ? ' other' : '');
      if (key === today) cell.classList.add('today');
      if (dow === 0) cell.classList.add('dow-sun');
      if (dow === 6) cell.classList.add('dow-sat');
      const num = document.createElement('div');
      num.className = 'cal-mc-num';
      num.textContent = String(d);
      cell.appendChild(num);
      const evts = byDate[key] || [];
      const MAX = 3;
      evts.slice(0, MAX).forEach((e) => {
        const b = document.createElement('button');
        b.className = 'cal-evt';
        b.type = 'button';
        b.draggable = true;
        b.style.background = e.color_code || '#6366f1';
        b.textContent = (e.is_all_day ? '' : '') + (e.title || '(제목 없음)');
        b.addEventListener('click', (ev) => { ev.stopPropagation(); openEdit(e); });
        b.addEventListener('dragstart', (ev) => {
          ev.stopPropagation();
          ev.dataTransfer.effectAllowed = 'move';
          ev.dataTransfer.setData('text/plain', String(e.id));
        });
        cell.appendChild(b);
      });
      if (evts.length > MAX) {
        const more = document.createElement('div');
        more.className = 'cal-evt more';
        more.textContent = '+' + (evts.length - MAX) + ' 더보기';
        cell.appendChild(more);
      }
      cell.addEventListener('dragover', (ev) => {
        if (ev.dataTransfer && ev.dataTransfer.types && Array.from(ev.dataTransfer.types).includes('text/plain')) {
          ev.preventDefault();
          cell.classList.add('is-drag-over');
        }
      });
      cell.addEventListener('dragleave', () => cell.classList.remove('is-drag-over'));
      cell.addEventListener('drop', (ev) => {
        ev.preventDefault();
        cell.classList.remove('is-drag-over');
        const id = parseInt(ev.dataTransfer.getData('text/plain') || '0', 10);
        const evt = state.items.find((item) => Number(item.id) === id);
        if (evt) moveScheduleToDate(evt, realDate);
      });
      cell.addEventListener('click', () => openEdit(null, realDate));
      return cell;
    }
    // 앞쪽 이전달
    for (let i = startDow - 1; i >= 0; i--) {
      grid.appendChild(makeCell(prevDays - i, -1));
    }
    // 이번달
    for (let d = 1; d <= daysInMonth; d++) {
      grid.appendChild(makeCell(d, 0));
    }
    // 6주 채움
    const filled = startDow + daysInMonth;
    const trailing = (42 - filled);
    for (let d = 1; d <= trailing; d++) {
      grid.appendChild(makeCell(d, 1));
    }
  }

  function fmtDT(d) {
    return toLocalInputValue(d).replace('T', ' ');
  }
  function fmtDateOnly(d) {
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
  }
  let calAttendees = [];
  let calSelectedSticker = '';
  const CAL_COLOR_PALETTE = [
    '#6366f1', '#3b82f6', '#06b6d4', '#14b8a6', '#22c55e',
    '#84cc16', '#eab308', '#f59e0b', '#f97316', '#ef4444',
    '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#64748b',
    '#0f766e', '#2563eb', '#7c3aed', '#be123c', '#111827',
  ];
  const CAL_STICKERS = [
    ['001-listening.svg', '리스닝 1'],
    ['002-dumbbell.svg', '운동'],
    ['003-tea time.svg', '티타임'],
    ['004-play with pet.svg', '반려동물'],
    ['005-reading.svg', '독서 1'],
    ['006-video calling.svg', '화상통화 1'],
    ['007-stay at home.svg', '재택'],
    ['008-online training.svg', '온라인 교육'],
    ['009-watering plants.svg', '식물'],
    ['010-cooking.svg', '요리'],
    ['011-coffee time.svg', '커피'],
    ['012-guitar.svg', '기타'],
    ['013-laptop.svg', '노트북'],
    ['014-chatting.svg', '채팅 1'],
    ['015-video calling.svg', '화상통화 2'],
    ['016-listening.svg', '리스닝 2'],
    ['017-chatting.svg', '채팅 2'],
    ['018-drinking.svg', '음료'],
    ['019-bath.svg', '휴식'],
    ['020-reading.svg', '독서 2'],
  ].map(([file, label]) => ({ path: `/static/image/svg/search/${file}`, label }));
  function normalizeCalTokens(items) {
    const seen = new Set();
    return (Array.isArray(items) ? items : [])
      .map((item) => String(item || '').trim())
      .filter((item) => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      });
  }
  function renderCalAttendees(items) {
    calAttendees = normalizeCalTokens(items);
    const list = $('calFAttendeeList');
    if (!list) return;
    list.innerHTML = '';
    calAttendees.forEach((name) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-token';
      btn.dataset.name = name;
      btn.textContent = name + ' ×';
      list.appendChild(btn);
    });
  }
  function setCalImportant(flag) {
    const btn = $('calFImportant');
    if (!btn) return;
    btn.setAttribute('aria-pressed', flag ? 'true' : 'false');
    btn.classList.toggle('is-on', !!flag);
  }
  function isCalImportant() {
    const btn = $('calFImportant');
    return !!(btn && btn.getAttribute('aria-pressed') === 'true');
  }
  // v0.5.10: 캘린더 참석자 라벨 — 동료 화면에서 사용하는 동일 동료 모델을 받아 표시 라벨을 만든다.
  // 라벨은 "부서 · 이름 (사번)" 형태를 기본으로 하되, 검색·중복 판단에는 emp_no 토큰을 우선 사용한다.
  function calAttendeeLabel(u) {
    const name = (u && (u.name || u.nickname)) || '';
    const dept = (u && u.department) || '';
    const empNo = (u && u.emp_no) || '';
    const head = [dept, name].filter(Boolean).join(' · ');
    if (!head) return 'user#' + (u && u.id || '');
    return empNo ? (head + ' (' + empNo + ')') : head;
  }
  // 이미 참석자에 추가됐는지 여부 — 라벨/사번 어느 한쪽이라도 매칭되면 중복으로 본다.
  function isAttendeeAlreadyAdded(u) {
    if (!u) return false;
    const empNo = String((u && u.emp_no) || '').trim().toLowerCase();
    const targetLabel = calAttendeeLabel(u);
    return calAttendees.some((label) => {
      const lab = String(label || '').toLowerCase();
      if (lab === targetLabel.toLowerCase()) return true;
      if (empNo && lab.includes('(' + empNo + ')')) return true;
      return false;
    });
  }

  // v0.5.10: 동료 데이터 단일 소스. 동료 화면(`peopleList`)·캘린더 참석자 선택·DM 검색이 동일한 fetch 경로를 공유한다.
  // - 항상 신선한 결과를 가져온다 (검색어 캐시로 인한 stale 표시 방지).
  // - 실패 시 명시적으로 throw → 호출부가 에러 메시지를 그릴 수 있다.
  async function loadAllCoworkers(opts) {
    const o = opts || {};
    const q = String(o.q || '').trim();
    const rows = await Api.fetchCoworkers({ q, limit: 1000 });
    let users = Array.isArray(rows) ? rows.slice() : [];
    if (state.currentUserId) {
      users = users.filter((u) => u.id !== state.currentUserId);
    }
    return users;
  }

  // 캘린더 참석자 모달 상태
  const calAttendeePickerState = {
    fullList: [],
    loaded: false,
    error: null,
    keyword: '',
    requestId: 0,
  };

  function _matchCoworker(u, lower) {
    if (!lower) return true;
    return [u.name, u.nickname, u.department, u.emp_no, u.email, u.company]
      .some((v) => String(v || '').toLowerCase().includes(lower));
  }

  function _renderCalAttendeePickerStatus(message, kind) {
    const list = $('calAttendeeModalList');
    const count = $('calAttendeeModalCount');
    if (count) count.textContent = '';
    if (!list) return;
    list.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'people-item muted' + (kind === 'error' ? ' is-error' : '');
    li.textContent = message;
    list.appendChild(li);
  }

  function _renderCalAttendeePickerResults() {
    const list = $('calAttendeeModalList');
    const count = $('calAttendeeModalCount');
    if (!list) return;
    const lower = String(calAttendeePickerState.keyword || '').toLowerCase().trim();
    const seen = new Set();
    const matched = (calAttendeePickerState.fullList || []).filter((u) => {
      const key = String(u.id || u.emp_no || u.name || u.nickname || '').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return _matchCoworker(u, lower);
    });

    list.innerHTML = '';
    if (!matched.length) {
      const li = document.createElement('li');
      li.className = 'people-item muted';
      li.textContent = lower
        ? '검색어와 일치하는 동료가 없습니다'
        : '조회된 동료가 없습니다';
      list.appendChild(li);
      if (count) count.textContent = '';
      return;
    }

    if (count) {
      count.textContent = lower
        ? (matched.length + '명 검색됨 (전체 ' + (calAttendeePickerState.fullList || []).length + '명)')
        : (matched.length + '명');
    }

    matched.forEach((u) => {
      const li = document.createElement('li');
      li.className = 'people-item';
      const av = document.createElement('span');
      av.className = 'avatar avatar-md';
      setAvatar(av, u.profile_image, u.id, u.name || u.nickname);
      const info = document.createElement('div');
      info.className = 'info';
      const nm = document.createElement('div');
      nm.className = 'name';
      nm.textContent = u.name || u.nickname || ('user#' + u.id);
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = cleanMetaParts([u.emp_no, u.department]).join(' · ');
      info.appendChild(nm);
      info.appendChild(meta);
      li.appendChild(av);
      li.appendChild(info);

      const already = isAttendeeAlreadyAdded(u);
      if (already) li.classList.add('is-disabled');

      li.addEventListener('click', () => {
        if (li.classList.contains('is-disabled')) return;
        if (isAttendeeAlreadyAdded(u)) {
          toast('이미 참석자에 추가된 동료입니다.', 'info');
          return;
        }
        renderCalAttendees([].concat(calAttendees, [calAttendeeLabel(u)]));
        closeLocalModal('calAttendeeModal');
      });
      list.appendChild(li);
    });
  }

  async function _loadCalAttendeePickerList() {
    calAttendeePickerState.requestId += 1;
    const reqId = calAttendeePickerState.requestId;
    calAttendeePickerState.loaded = false;
    calAttendeePickerState.error = null;
    _renderCalAttendeePickerStatus('동료 리스트를 불러오는 중…');
    try {
      const users = await loadAllCoworkers({ q: '' });
      if (reqId !== calAttendeePickerState.requestId) return;
      calAttendeePickerState.fullList = users || [];
      calAttendeePickerState.loaded = true;
      calAttendeePickerState.error = null;
      _renderCalAttendeePickerResults();
    } catch (e) {
      if (reqId !== calAttendeePickerState.requestId) return;
      try { console.warn('[calAttendee] coworker fetch failed', e); } catch (_) {}
      calAttendeePickerState.fullList = [];
      calAttendeePickerState.loaded = false;
      calAttendeePickerState.error = e;
      _renderCalAttendeePickerStatus('동료 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
    }
  }

  function _bindCalAttendeeSearchOnce() {
    const input = $('calAttendeeSearchInput');
    if (!input || input.dataset.bound === '1') return;
    input.dataset.bound = '1';
    let t = null;
    input.addEventListener('input', (e) => {
      clearTimeout(t);
      const v = (e.target.value || '').trim();
      t = setTimeout(() => {
        calAttendeePickerState.keyword = v;
        if (calAttendeePickerState.loaded) {
          _renderCalAttendeePickerResults();
        }
      }, 80);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLocalModal('calAttendeeModal');
      }
    });
  }

  function openCalAttendeeModal() {
    _bindCalAttendeeSearchOnce();
    const input = $('calAttendeeSearchInput');
    if (input) input.value = '';
    calAttendeePickerState.keyword = '';
    openLocalModal('calAttendeeModal');
    setTimeout(() => { try { input && input.focus(); } catch (_) {} }, 30);
    _loadCalAttendeePickerList();
  }
  function stickerImageSrc(path) {
    const raw = String(path || '').trim();
    if (!raw) return '';
    if (/^(data:|assets\/)/i.test(raw)) return raw;
    const resolved = /^https?:/i.test(raw)
      ? raw
      : ((state.serverUrl || Api.serverUrl || DEFAULT_SERVER_URL || '').replace(/\/+$/, '') + raw);
    return encodeURI(resolved);
  }
  function setCalSticker(value) {
    const selected = String(value || '').trim();
    calSelectedSticker = selected;
    const select = $('calFSticker');
    if (select) {
      if (selected && !Array.from(select.options).some((opt) => opt.value === selected)) {
        const opt = document.createElement('option');
        opt.value = selected;
        opt.textContent = selected.split('/').pop() || selected;
        select.appendChild(opt);
      }
      select.value = selected;
    }
    const match = CAL_STICKERS.find((item) => item.path === selected);
    const label = $('calFStickerLabel');
    const preview = $('calFStickerPreview');
    if (label) label.textContent = match ? match.label : '선택 안 함';
    if (preview) {
      preview.innerHTML = '';
      if (match) {
        const img = document.createElement('img');
        img.src = stickerImageSrc(match.path);
        img.alt = '';
        preview.appendChild(img);
      }
    }
    document.querySelectorAll('#calFStickerMenu .cal-sticker-option').forEach((btn) => {
      btn.classList.toggle('is-active', (btn.dataset.sticker || '') === selected);
      const img = btn.querySelector('img');
      if (img && btn.dataset.sticker) img.src = stickerImageSrc(btn.dataset.sticker);
    });
  }
  function setCalColor(value) {
    const color = String(value || '#6366f1').trim();
    const input = $('calFColor');
    if (input) input.value = color;
    const preview = $('calFColorPreview');
    if (preview) preview.style.background = color;
    const label = $('calFColorLabel');
    if (label) label.textContent = color;
    document.querySelectorAll('#calFColorMenu .cal-color-swatch').forEach((btn) => {
      btn.classList.toggle('is-active', String(btn.dataset.color || '').toLowerCase() === color.toLowerCase());
    });
  }
  function renderCalColorPalette() {
    const wrap = $('calFColorMenu');
    if (!wrap || wrap.dataset.rendered === '1') return;
    CAL_COLOR_PALETTE.forEach((color) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-color-swatch';
      btn.dataset.color = color;
      btn.title = color;
      btn.style.background = color;
      btn.addEventListener('click', () => setCalColor(color));
      wrap.appendChild(btn);
    });
    wrap.dataset.rendered = '1';
  }
  function renderCalStickerMenu() {
    const wrap = $('calFStickerMenu');
    if (!wrap || wrap.dataset.rendered === '1') return;
    const none = document.createElement('button');
    none.type = 'button';
    none.className = 'cal-sticker-option is-active';
    none.dataset.sticker = '';
    none.textContent = '선택 안 함';
    wrap.appendChild(none);
    CAL_STICKERS.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-sticker-option';
      btn.dataset.sticker = item.path;
      const img = document.createElement('img');
      img.src = stickerImageSrc(item.path);
      img.alt = '';
      const span = document.createElement('span');
      span.textContent = item.label;
      btn.appendChild(img);
      btn.appendChild(span);
      wrap.appendChild(btn);
    });
    wrap.dataset.rendered = '1';
  }
  function toggleCalDropdown(panelId, triggerId, force) {
    const panel = $(panelId);
    const trigger = $(triggerId);
    if (!panel) return;
    const nextOpen = typeof force === 'boolean' ? force : panel.hidden;
    panel.hidden = !nextOpen;
    if (trigger) trigger.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
  }
  function closeCalDropdowns() {
    toggleCalDropdown('calFStickerMenu', 'calFStickerTrigger', false);
    toggleCalDropdown('calFColorMenu', 'calFColorTrigger', false);
  }
  function initCalDatePickers() {
    if (!window.flatpickr) return;
    const opts = {
      enableTime: true,
      time_24hr: true,
      minuteIncrement: 5,
      dateFormat: 'Y-m-d H:i',
      locale: (window.flatpickr.l10ns && window.flatpickr.l10ns.ko) || 'ko',
      allowInput: false,
      disableMobile: true,
      onChange: function (_selectedDates, dateStr, inst) {
        const startEl = $('calFStart');
        const endEl = $('calFEnd');
        if (!startEl || !endEl || inst.input !== startEl) return;
        const sd = new Date(fromLocalInputValue(dateStr));
        const ed = new Date(fromLocalInputValue(endEl.value));
        if (!endEl.value || ed <= sd) {
          const next = new Date(sd.getTime() + 60 * 60 * 1000);
          endEl.value = fmtDT(next);
          if (endEl._flatpickr) endEl._flatpickr.setDate(endEl.value, false, 'Y-m-d H:i');
        }
      },
    };
    ['calFStart', 'calFEnd'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      if (!el._flatpickr) window.flatpickr(el, opts);
      else if (el.value) el._flatpickr.setDate(el.value, false, 'Y-m-d H:i');
    });
  }
  function syncCalAllDayInputs() {
    const all = $('calFAllDay');
    const locked = !!(all && all.checked);
    ['calFStart', 'calFEnd'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      if (locked) {
        if (!el.dataset.fullValue && el.value) el.dataset.fullValue = el.value;
        const d = new Date(fromLocalInputValue(el.value || el.dataset.fullValue || ''));
        if (!isNaN(d.getTime())) el.value = fmtDateOnly(d);
      } else if (el.dataset.fullValue) {
        el.value = el.dataset.fullValue;
        delete el.dataset.fullValue;
      }
      el.disabled = locked;
      el.classList.toggle('is-locked', locked);
      try {
        if (el._flatpickr) {
          if (locked) el._flatpickr.close();
          el._flatpickr.set('clickOpens', !locked);
        }
      } catch (_) {}
    });
  }
  function openEdit(evt, defaultDate) {
    // v0.4.27: 채팅에서 직접 호출 시에도 저장/삭제 버튼이 동작하도록 bind 보장
    if (!initialized) { try { bind(); } catch (_) {} initialized = true; }
    const m = $('calEditModal'); if (!m) return;
    const titleEl = $('calEditTitle');
    const fT = $('calFTitle'), fS = $('calFStart'), fE = $('calFEnd'), fL = $('calFLocation'), fD = $('calFDesc'), fErr = $('calFError');
    const fAll = $('calFAllDay');
    const fSave = $('calFSave'), fDel = $('calFDelete');
    fErr.hidden = true; fErr.textContent = '';
    if (evt) {
      titleEl.textContent = '일정 수정';
      fT.value = evt.title || '';
      fS.value = evt.start_datetime ? fmtDT(new Date(evt.start_datetime)) : '';
      fE.value = evt.end_datetime ? fmtDT(new Date(evt.end_datetime)) : '';
      fL.value = evt.location || '';
      fD.value = evt.description || '';
      if (fAll) fAll.checked = !!evt.is_all_day;
      setSelectValue('calFType', evt.event_type, '기타');
      setSelectValue('calFShare', evt.share_scope, 'PRIVATE');
      setSelectValue('calFReminder', Array.isArray(evt.reminders) ? evt.reminders[0] : '', '');
      setCalSticker(evt.sticker || '');
      setCalColor(evt.color_code || '#6366f1');
      renderCalAttendees(evt.attendees || []);
      setCalImportant(!!evt.is_important);
      fDel.hidden = false;
      m.dataset.editId = String(evt.id);
    } else {
      titleEl.textContent = '일정 추가';
      const base = defaultDate || new Date();
      const s = new Date(base); s.setHours(9, 0, 0, 0);
      const e = new Date(base); e.setHours(10, 0, 0, 0);
      fT.value = ''; fS.value = fmtDT(s); fE.value = fmtDT(e);
      fL.value = ''; fD.value = '';
      if (fAll) fAll.checked = false;
      setSelectValue('calFType', '미팅');
      setSelectValue('calFShare', 'PRIVATE');
      setSelectValue('calFReminder', '');
      setCalSticker('');
      setCalColor('#6366f1');
      renderCalAttendees([]);
      setCalImportant(false);
      fDel.hidden = true;
      delete m.dataset.editId;
    }
    renderCalColorPalette();
    renderCalStickerMenu();
    setCalColor(($('calFColor') && $('calFColor').value) || '#6366f1');
    setCalSticker(($('calFSticker') && $('calFSticker').value) || '');
    initCalDatePickers();
    syncCalAllDayInputs();
    m.hidden = false;
    setTimeout(() => fT.focus(), 30);
  }

  function closeEdit() {
    const m = $('calEditModal'); if (m) m.hidden = true;
  }

  async function save() {
    const m = $('calEditModal');
    const fErr = $('calFError');
    const title = $('calFTitle').value.trim();
    const startV = ($('calFStart').value || '').trim();
    const endV = ($('calFEnd').value || '').trim();
    const allDay = !!($('calFAllDay') && $('calFAllDay').checked);
    if (!title) { fErr.textContent = '제목을 입력하세요.'; fErr.hidden = false; return; }
    if (!startV || !endV) { fErr.textContent = '시작/종료 일시를 입력하세요.'; fErr.hidden = false; return; }
    const startISO = allDay ? (startV.slice(0, 10) + 'T00:00:00') : fromLocalInputValue(startV);
    const endISO = allDay ? (endV.slice(0, 10) + 'T23:59:00') : fromLocalInputValue(endV);
    const payload = {
      title: title,
      start_datetime: startISO,
      end_datetime: endISO,
      location: $('calFLocation').value.trim(),
      description: $('calFDesc').value,
      share_scope: ($('calFShare') && $('calFShare').value) || 'PRIVATE',
      event_type: ($('calFType') && $('calFType').value) || '기타',
      is_all_day: allDay,
      attendees: calAttendees,
      reminders: ($('calFReminder') && $('calFReminder').value) ? [$('calFReminder').value] : [],
      sticker: '',
      is_important: isCalImportant(),
      color_code: ($('calFColor') && $('calFColor').value) || '#6366f1',
    };
    try {
      const editId = m.dataset.editId;
      let saved = null;
      if (editId) saved = await Api.updateCalendarSchedule(parseInt(editId, 10), payload);
      else saved = await Api.createCalendarSchedule(payload);
      // 채팅방으로 공유 모드인 경우, 일정 카드 메시지를 현재 방에 전송
      const shareRoomId = m.dataset.shareRoomId ? parseInt(m.dataset.shareRoomId, 10) : 0;
      if (shareRoomId && window.__shareScheduleToChat) {
        try { await window.__shareScheduleToChat(shareRoomId, payload, saved && saved.item); }
        catch (se) { console.warn('share to chat failed', se); }
      }
      delete m.dataset.shareRoomId;
      closeEdit();
      await reload();
    } catch (e) {
      fErr.textContent = (e && e.payload && e.payload.message) || (e && e.message) || '저장 실패';
      fErr.hidden = false;
    }
  }

  async function del() {
    const m = $('calEditModal');
    const editId = m.dataset.editId;
    if (!editId) return;
    if (!confirm('이 일정을 삭제하시겠습니까?')) return;
    try {
      await Api.deleteCalendarSchedule(parseInt(editId, 10));
      closeEdit();
      await reload();
    } catch (e) {
      const fErr = $('calFError');
      fErr.textContent = (e && e.payload && e.payload.message) || '삭제 실패';
      fErr.hidden = false;
    }
  }

  function bind() {
    const prev = $('calNavPrev'), next = $('calNavNext'), today = $('calNavToday');
    if (prev) prev.addEventListener('click', () => {
      const [y, m] = state.ym.split('-').map(Number);
      const nm = m === 1 ? 12 : m - 1, ny = m === 1 ? y - 1 : y;
      state.ym = ny + '-' + pad(nm);
      reload();
    });
    if (next) next.addEventListener('click', () => {
      const [y, m] = state.ym.split('-').map(Number);
      const nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y;
      state.ym = ny + '-' + pad(nm);
      reload();
    });
    if (today) today.addEventListener('click', () => {
      state.ym = ymKey(new Date());
      reload();
    });
    const btnNew = $('calNewBtn');
    if (btnNew) btnNew.addEventListener('click', () => openEdit(null));
    // v0.4.28: 동기화 버튼 — 서버에서 최신 일정 다시 불러오기
    const btnRefresh = $('calRefreshBtn');
    if (btnRefresh) btnRefresh.addEventListener('click', async () => {
      btnRefresh.disabled = true;
      btnRefresh.classList.add('is-syncing');
      try { await reload(); } finally {
        btnRefresh.disabled = false;
        btnRefresh.classList.remove('is-syncing');
      }
    });
    const refreshIcon = btnRefresh && btnRefresh.querySelector('img');
    if (refreshIcon) refreshIcon.src = window.blossomAssetSrc
      ? window.blossomAssetSrc('/static/image/svg/chat/free-icon-font-cloud-stairs.svg')
      : 'assets/svg/chat/free-icon-font-cloud-stairs.svg';
    const important = $('calFImportant');
    if (important && important.dataset.bound !== '1') {
      important.dataset.bound = '1';
      important.addEventListener('click', () => setCalImportant(!isCalImportant()));
    }
    renderCalColorPalette();
    renderCalStickerMenu();
    const colorInput = $('calFColor');
    if (colorInput && colorInput.dataset.bound !== '1') {
      colorInput.dataset.bound = '1';
      colorInput.addEventListener('input', () => setCalColor(colorInput.value));
    }
    const allDay = $('calFAllDay');
    if (allDay && allDay.dataset.bound !== '1') {
      allDay.dataset.bound = '1';
      allDay.addEventListener('change', syncCalAllDayInputs);
    }
    const stickerTrigger = $('calFStickerTrigger');
    if (stickerTrigger && stickerTrigger.dataset.bound !== '1') {
      stickerTrigger.dataset.bound = '1';
      stickerTrigger.addEventListener('click', () => {
        toggleCalDropdown('calFStickerMenu', 'calFStickerTrigger');
        toggleCalDropdown('calFColorMenu', 'calFColorTrigger', false);
      });
    }
    const stickerMenu = $('calFStickerMenu');
    if (stickerMenu && stickerMenu.dataset.bound !== '1') {
      stickerMenu.dataset.bound = '1';
      stickerMenu.addEventListener('click', (e) => {
        const btn = e.target.closest('.cal-sticker-option');
        if (!btn) return;
        setCalSticker(btn.dataset.sticker || '');
        toggleCalDropdown('calFStickerMenu', 'calFStickerTrigger', false);
      });
    }
    const colorTrigger = $('calFColorTrigger');
    if (colorTrigger && colorTrigger.dataset.bound !== '1') {
      colorTrigger.dataset.bound = '1';
      colorTrigger.addEventListener('click', () => {
        toggleCalDropdown('calFColorMenu', 'calFColorTrigger');
        toggleCalDropdown('calFStickerMenu', 'calFStickerTrigger', false);
      });
    }
    const colorMenu = $('calFColorMenu');
    if (colorMenu && colorMenu.dataset.bound !== '1') {
      colorMenu.dataset.bound = '1';
      colorMenu.addEventListener('click', (e) => {
        const btn = e.target.closest('.cal-color-swatch');
        if (!btn) return;
        setCalColor(btn.dataset.color || '#6366f1');
        toggleCalDropdown('calFColorMenu', 'calFColorTrigger', false);
      });
    }
    const attendeeAdd = $('calFAttendeeAdd');
    const attendeeInput = $('calFAttendeeInput');
    if (attendeeAdd && attendeeAdd.dataset.bound !== '1') {
      attendeeAdd.dataset.bound = '1';
      attendeeAdd.addEventListener('click', (e) => {
        e.preventDefault();
        openCalAttendeeModal();
      });
    }
    if (attendeeInput && attendeeInput.dataset.bound !== '1') {
      attendeeInput.dataset.bound = '1';
      attendeeInput.readOnly = true;
      attendeeInput.addEventListener('click', () => openCalAttendeeModal());
      attendeeInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (attendeeAdd) attendeeAdd.click();
      });
    }
    const attendeeList = $('calFAttendeeList');
    if (attendeeList && attendeeList.dataset.bound !== '1') {
      attendeeList.dataset.bound = '1';
      attendeeList.addEventListener('click', (e) => {
        const token = e.target.closest('.cal-token[data-name]');
        if (!token) return;
        renderCalAttendees(calAttendees.filter((item) => item !== token.dataset.name));
      });
    }
    document.addEventListener('click', (e) => {
      const dropdown = e.target.closest && e.target.closest('.cal-dropdown');
      if (!dropdown) closeCalDropdowns();
    });
    const fSave = $('calFSave'); if (fSave) fSave.addEventListener('click', save);
    const fDel = $('calFDelete'); if (fDel) fDel.addEventListener('click', del);
    const closeBtn = document.querySelector('[data-close="calEditModal"]');
    if (closeBtn) closeBtn.addEventListener('click', closeEdit);
  }

  return { open: open, reload: reload, openEdit: openEdit };
})();

// === MemoView v1: 웹 Blossom /api/memo/groups 동기화 ===
window.MemoView = (function () {
  const $ = (id) => document.getElementById(id);
  const state = { groups: [], activeGroupId: null, memos: [], activeMemoId: null, saveTimer: null, imgMap: {} };
  let initialized = false;
  let memoSort = 'custom';
  let memoGroupSort = 'custom';
  let memoDragId = null;
  let memoGroupDragId = null;
  const LOCAL_MEMO_KEY = 'blossom.desktop.memo.v1';
  const MEMO_TEXT_COLORS = [
    '#111827', '#374151', '#6b7280', '#ffffff', '#ef4444',
    '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
    '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6',
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  ];
  let memoLastTextColor = '#111827';

  function loadLocalMemoStore() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_MEMO_KEY) || '{}');
      if (raw && Array.isArray(raw.groups) && Array.isArray(raw.memos)) return raw;
    } catch (_) {}
    return {
      seq: 2,
      groups: [{ id: 1, name: '기본보기', memo_count: 0, sort_order: 0 }],
      memos: [],
    };
  }

  function saveLocalMemoStore(store) {
    try { localStorage.setItem(LOCAL_MEMO_KEY, JSON.stringify(store)); } catch (_) {}
  }

  function touchLocalMemo(item) {
    item.updated_at = new Date().toISOString();
    if (!item.created_at) item.created_at = item.updated_at;
    return item;
  }

  function sortMemoRows(rows) {
    const list = Array.isArray(rows) ? rows : [];
    list.sort((a, b) => {
      if (!!b.starred !== !!a.starred) return (b.starred ? 1 : 0) - (a.starred ? 1 : 0);
      if (memoSort === 'updated-asc') return String(a.updated_at || '').localeCompare(String(b.updated_at || '')) || a.id - b.id;
      if (memoSort === 'created-desc') return String(b.created_at || '').localeCompare(String(a.created_at || '')) || b.id - a.id;
      if (memoSort === 'created-asc') return String(a.created_at || '').localeCompare(String(b.created_at || '')) || a.id - b.id;
      if (memoSort === 'custom') return (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id;
      return String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || b.id - a.id;
    });
    return list;
  }

  function sortMemoGroupRows(rows) {
    const list = Array.isArray(rows) ? rows : [];
    list.sort((a, b) => {
      const an = (a.name || '').trim(), bn = (b.name || '').trim();
      if (an === '기본보기') return -1;
      if (bn === '기본보기') return 1;
      if (memoGroupSort === 'name') return an.localeCompare(bn, 'ko') || a.id - b.id;
      return (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id;
    });
    return list;
  }

  function useLocalMemoStore(reason) {
    state.memoLocalMode = true;
    if (reason) console.warn('memo local fallback:', reason);
    const store = loadLocalMemoStore();
    const counts = {};
    store.memos.filter((m) => !m.is_deleted).forEach((m) => { counts[m.group_id] = (counts[m.group_id] || 0) + 1; });
    state.groups = store.groups.filter((g) => !g.is_deleted).map((g) => Object.assign({}, g, { memo_count: counts[g.id] || 0 }));
    state.groups.sort((a, b) => {
      const an = (a.name || '').trim(), bn = (b.name || '').trim();
      if (an === '기본보기') return -1;
      if (bn === '기본보기') return 1;
      return (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id;
    });
    if (!state.activeGroupId && state.groups.length) state.activeGroupId = state.groups[0].id;
    state.memos = store.memos.filter((m) => !m.is_deleted && m.group_id === state.activeGroupId);
    sortMemoRows(state.memos);
  }

  // v0.4.26: Electron BrowserWindow은 window.prompt() 미지원 → 커스텀 입력 모달
  function inputDialog(title, defaultValue) {
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.className = 'mini-dialog-overlay';
      ov.innerHTML = '<div class="mini-dialog"><div class="md-title"></div>'
        + '<input class="md-input" type="text" />'
        + '<div class="md-actions"><button class="md-cancel">취소</button>'
        + '<button class="md-ok btn-primary">확인</button></div></div>';
      document.body.appendChild(ov);
      ov.querySelector('.md-title').textContent = title;
      const inp = ov.querySelector('.md-input');
      inp.value = defaultValue || '';
      setTimeout(() => { inp.focus(); inp.select(); }, 20);
      function close(val) { ov.remove(); resolve(val); }
      ov.querySelector('.md-cancel').addEventListener('click', () => close(null));
      ov.querySelector('.md-ok').addEventListener('click', () => close(inp.value));
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); close(inp.value); }
        else if (e.key === 'Escape') { e.preventDefault(); close(null); }
      });
      ov.addEventListener('click', (e) => { if (e.target === ov) close(null); });
    });
  }

  // v0.4.31: 편집 시 이미지가 인라인으로 보이도록 contenteditable 리치 에디터 사용.
  // 기존 텍스트영역(memoBody)은 마크다운 백업 저장소로만 유지(항상 hidden).
  function shortenBodyForEdit(body) { return String(body || ''); }
  function expandBodyForSave(body) { return String(body || ''); }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  function looksLikeRichHtml(body) {
    return /<\/?(div|p|span|strong|b|em|i|u|s|strike|mark|img|label|input|br)\b/i.test(String(body || ''));
  }

  function sanitizeMemoHtml(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    tpl.content.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach((node) => node.remove());
    tpl.content.querySelectorAll('*').forEach((node) => {
      Array.from(node.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || '').trim();
        if (name.startsWith('on')) node.removeAttribute(attr.name);
        if ((name === 'src' || name === 'href') && /^(javascript:|data:(?!image\/))/i.test(value)) {
          node.removeAttribute(attr.name);
        }
      });
      if (node.nodeName === 'INPUT') {
        node.setAttribute('type', 'checkbox');
      }
    });
    return tpl.innerHTML;
  }

  function markdownToRichHtml(md) {
    if (looksLikeRichHtml(md)) return sanitizeMemoHtml(md);
    const lines = String(md || '').split('\n');
    return lines.map(function (line) {
      const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
      const parts = [];
      let last = 0, m;
      while ((m = re.exec(line)) !== null) {
        if (m.index > last) parts.push(escapeHtml(line.slice(last, m.index)));
        const alt = escapeHtml(m[1] || '');
        const src = m[2] || '';
        if (/^(data:image\/|https?:\/\/)/i.test(src)) {
          const safe = escapeAttr(src);
          parts.push('<img alt="' + alt + '" src="' + safe + '" data-src="' + safe + '" class="memo-edit-img" />');
        } else {
          parts.push(escapeHtml(m[0]));
        }
        last = m.index + m[0].length;
      }
      if (last < line.length) parts.push(escapeHtml(line.slice(last)));
      return '<div>' + (parts.join('') || '<br>') + '</div>';
    }).join('');
  }

  function richHtmlToMarkdown(root) {
    return sanitizeMemoHtml(root ? root.innerHTML : '');
  }

  async function open() {
    if (!initialized) bind();
    initialized = true;
    await loadGroups();
  }

  async function loadGroups() {
    if (state.memoLocalMode) {
      useLocalMemoStore();
      renderGroups();
      renderList();
      renderEditor();
      return;
    }
    try {
      const resp = await Api.listMemoGroups();
      state.groups = (resp && resp.items) || [];
      sortMemoGroupRows(state.groups);
    } catch (e) {
      console.warn('memo groups failed', e);
      useLocalMemoStore(e);
      renderGroups();
      renderList();
      renderEditor();
      return;
    }
    if (!state.activeGroupId && state.groups.length) state.activeGroupId = state.groups[0].id;
    renderGroups();
    if (state.activeGroupId) await loadMemos();
  }

  async function loadMemos() {
    if (state.memoLocalMode) {
      useLocalMemoStore();
      if (!state.memos.find((m) => m.id === state.activeMemoId)) {
        state.activeMemoId = state.memos.length ? state.memos[0].id : null;
      }
      renderGroups();
      renderList();
      renderEditor();
      return;
    }
    try {
      const resp = await Api.listMemos(state.activeGroupId, { pageSize: 200, sort: memoSort });
      state.memos = (resp && resp.items) || [];
      sortMemoRows(state.memos);
    } catch (e) {
      console.warn('memos failed', e);
      useLocalMemoStore(e);
    }
    if (!state.memos.find((m) => m.id === state.activeMemoId)) {
      state.activeMemoId = state.memos.length ? state.memos[0].id : null;
    }
    renderList();
    renderEditor();
  }

  function renderGroups() {
    const ul = $('memoGroupList'); if (!ul) return;
    ul.innerHTML = '';
    sortMemoGroupRows(state.groups).forEach((g) => {
      const li = document.createElement('li');
      li.dataset.id = String(g.id);
      li.draggable = (g.name || '').trim() !== '기본보기' && memoGroupSort === 'custom';
      if (g.id === state.activeGroupId) li.classList.add('active');
      const name = document.createElement('span');
      name.textContent = g.name;
      const cnt = document.createElement('span');
      cnt.className = 'gcount';
      cnt.textContent = String(g.memo_count || 0);
      li.appendChild(name); li.appendChild(cnt);
      li.addEventListener('click', () => {
        state.activeGroupId = g.id;
        state.activeMemoId = null;
        state.memoEditing = false;
        renderGroups();
        loadMemos();
      });
      li.addEventListener('dragstart', (ev) => {
        memoGroupDragId = g.id;
        ev.dataTransfer.effectAllowed = 'move';
      });
      li.addEventListener('dragover', (ev) => {
        if (!memoGroupDragId || memoGroupDragId === g.id || memoGroupSort !== 'custom') return;
        ev.preventDefault();
        li.classList.add('is-drag-over');
      });
      li.addEventListener('dragleave', () => li.classList.remove('is-drag-over'));
      li.addEventListener('drop', async (ev) => {
        ev.preventDefault();
        li.classList.remove('is-drag-over');
        if (!memoGroupDragId || memoGroupDragId === g.id || memoGroupSort !== 'custom') return;
        await reorderMemoGroup(memoGroupDragId, g.id, ev.offsetY > li.clientHeight / 2 ? 'after' : 'before');
        memoGroupDragId = null;
      });
      li.addEventListener('dragend', () => { memoGroupDragId = null; li.classList.remove('is-drag-over'); });
      // 우클릭 → 그룹 삭제 (기본보기 제외)
      li.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        if ((g.name || '').trim() === '기본보기') return;
        if (!confirm('"' + g.name + '" 그룹을 삭제하시겠습니까? (포함된 메모도 모두 삭제됩니다)')) return;
        if (state.memoLocalMode) {
          const store = loadLocalMemoStore();
          const group = store.groups.find((row) => row.id === g.id);
          if (group) group.is_deleted = 1;
          store.memos.forEach((memo) => { if (memo.group_id === g.id) memo.is_deleted = 1; });
          saveLocalMemoStore(store);
          if (state.activeGroupId === g.id) state.activeGroupId = null;
          loadGroups();
          return;
        }
        Api.deleteMemoGroup(g.id).then(() => {
          if (state.activeGroupId === g.id) state.activeGroupId = null;
          loadGroups();
        });
      });
      ul.appendChild(li);
    });
  }

  function closeMemoContextMenu() {
    const menu = document.getElementById('__memoCtxMenu');
    if (menu) menu.remove();
    document.removeEventListener('mousedown', onMemoContextOutside, true);
    document.removeEventListener('keydown', onMemoContextKey, true);
  }

  function onMemoContextOutside(ev) {
    const menu = document.getElementById('__memoCtxMenu');
    if (menu && menu.contains(ev.target)) return;
    closeMemoContextMenu();
  }

  function onMemoContextKey(ev) {
    if (ev.key === 'Escape') closeMemoContextMenu();
  }

  function placeMemoContextMenu(menu, x, y) {
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - rect.width - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - rect.height - 8) + 'px';
    setTimeout(() => {
      document.addEventListener('mousedown', onMemoContextOutside, true);
      document.addEventListener('keydown', onMemoContextKey, true);
    }, 0);
  }

  async function moveMemoToGroup(mm, groupId) {
    if (!mm || !groupId || groupId === mm.group_id) return;
    if (state.memoLocalMode) {
      const store = loadLocalMemoStore();
      const row = store.memos.find((m) => m.id === mm.id);
      if (row) {
        row.group_id = groupId;
        touchLocalMemo(row);
        saveLocalMemoStore(store);
      }
      state.activeGroupId = groupId;
      state.activeMemoId = mm.id;
      await loadGroups();
      return;
    }
    try {
      await Api.updateMemo(mm.id, { group_id: groupId });
      state.activeGroupId = groupId;
      state.activeMemoId = mm.id;
      await loadGroups();
    } catch (e) {
      alert('그룹 이동 실패: ' + ((e && e.payload && e.payload.message) || (e && e.message) || ''));
    }
  }

  async function reorderMemo(sourceId, targetId, position) {
    if (!sourceId || !targetId || sourceId === targetId || !state.activeGroupId) return;
    if (state.memoLocalMode) {
      const store = loadLocalMemoStore();
      const rows = store.memos.filter((m) => !m.is_deleted && m.group_id === state.activeGroupId && !!m.starred === !!(state.memos.find((x) => x.id === sourceId) || {}).starred)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);
      const ids = rows.map((m) => m.id);
      if (!ids.includes(sourceId) || !ids.includes(targetId)) return;
      ids.splice(ids.indexOf(sourceId), 1);
      ids.splice(ids.indexOf(targetId) + (position === 'after' ? 1 : 0), 0, sourceId);
      ids.forEach((id, idx) => {
        const row = store.memos.find((m) => m.id === id);
        if (row) row.sort_order = idx + 1;
      });
      saveLocalMemoStore(store);
      useLocalMemoStore();
      renderList();
      return;
    }
    try {
      await Api.reorderMemos(state.activeGroupId, { source_id: sourceId, target_id: targetId, position: position || 'before' });
      await loadMemos();
    } catch (e) {
      alert('메모 순서 변경 실패: ' + ((e && e.payload && e.payload.message) || (e && e.message) || ''));
    }
  }

  async function reorderMemoGroup(sourceId, targetId, position) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (state.memoLocalMode) {
      const store = loadLocalMemoStore();
      const ids = store.groups.filter((g) => !g.is_deleted && (g.name || '').trim() !== '기본보기')
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id)
        .map((g) => g.id);
      if (!ids.includes(sourceId) || !ids.includes(targetId)) return;
      ids.splice(ids.indexOf(sourceId), 1);
      ids.splice(ids.indexOf(targetId) + (position === 'after' ? 1 : 0), 0, sourceId);
      ids.forEach((id, idx) => {
        const row = store.groups.find((g) => g.id === id);
        if (row) row.sort_order = idx + 1;
      });
      saveLocalMemoStore(store);
      useLocalMemoStore();
      renderGroups();
      return;
    }
    try {
      await Api.reorderMemoGroups({ source_id: sourceId, target_id: targetId, position: position || 'before' });
      await loadGroups();
    } catch (e) {
      alert('그룹 순서 변경 실패: ' + ((e && e.payload && e.payload.message) || (e && e.message) || ''));
    }
  }

  async function deleteMemoItem(mm) {
    if (!mm) return;
    if (!confirm('이 메모를 삭제하시겠습니까?')) return;
    if (state.memoLocalMode) {
      const store = loadLocalMemoStore();
      const row = store.memos.find((m) => m.id === mm.id);
      if (row) row.is_deleted = 1;
      saveLocalMemoStore(store);
      if (state.activeMemoId === mm.id) state.activeMemoId = null;
      await loadMemos();
      return;
    }
    try {
      await Api.deleteMemo(mm.id);
      if (state.activeMemoId === mm.id) state.activeMemoId = null;
      await loadMemos();
    } catch (e) {
      alert('삭제 실패: ' + (e && e.message || ''));
    }
  }

  function showMemoMoveMenu(x, y, mm) {
    closeMemoContextMenu();
    const groups = (state.groups || []).filter((g) => g.id !== mm.group_id && (g.name || '').trim() !== '기본보기');
    if (!groups.length) {
      alert('이동할 수 있는 그룹이 없습니다.');
      return;
    }
    const menu = document.createElement('div');
    menu.id = '__memoCtxMenu';
    menu.className = 'ctx-menu memo-context-menu';
    groups.forEach((g) => {
      const item = document.createElement('div');
      item.className = 'ctx-item';
      item.textContent = g.name || '그룹';
      item.addEventListener('click', () => {
        closeMemoContextMenu();
        moveMemoToGroup(mm, g.id);
      });
      menu.appendChild(item);
    });
    placeMemoContextMenu(menu, x, y);
  }

  function showMemoContextMenu(x, y, mm) {
    closeMemoContextMenu();
    const menu = document.createElement('div');
    menu.id = '__memoCtxMenu';
    menu.className = 'ctx-menu memo-context-menu';
    const move = document.createElement('div');
    move.className = 'ctx-item';
    move.textContent = '그룹 이동';
    move.addEventListener('click', () => showMemoMoveMenu(x + 16, y + 12, mm));
    menu.appendChild(move);
    const sep = document.createElement('div');
    sep.className = 'ctx-sep';
    menu.appendChild(sep);
    const del = document.createElement('div');
    del.className = 'ctx-item danger';
    del.textContent = '삭제';
    del.addEventListener('click', () => {
      closeMemoContextMenu();
      deleteMemoItem(mm);
    });
    menu.appendChild(del);
    placeMemoContextMenu(menu, x, y);
  }

  function renderList() {
    const ul = $('memoList'); if (!ul) return;
    ul.innerHTML = '';
    sortMemoRows(state.memos).forEach((mm) => {
      const li = document.createElement('li');
      li.dataset.id = String(mm.id);
      li.draggable = memoSort === 'custom';
      if (mm.id === state.activeMemoId) li.classList.add('active');
      const t = document.createElement('div'); t.className = 'mli-title';
      t.textContent = mm.title || '(제목 없음)';
      const star = document.createElement('img');
      star.className = 'mli-star';
      star.alt = '즐겨찾기';
      star.src = memoAssetSrc('/static/image/svg/chat/free-icon-font-star.svg');
      star.hidden = !mm.starred;
      const sn = document.createElement('div'); sn.className = 'mli-snippet';
      const bodyForSnippet = document.createElement('div');
      bodyForSnippet.innerHTML = markdownToRichHtml(mm.body || '');
      sn.textContent = (bodyForSnippet.textContent || '').slice(0, 100);
      const tm = document.createElement('div'); tm.className = 'mli-time';
      tm.textContent = mm.updated_at ? new Date(mm.updated_at).toLocaleString() : '';
      li.appendChild(t); li.appendChild(star); li.appendChild(sn); li.appendChild(tm);
      li.addEventListener('click', () => {
        state.activeMemoId = mm.id;
        state.memoEditing = false;
        renderList(); renderEditor();
      });
      li.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        state.activeMemoId = mm.id;
        state.memoEditing = false;
        renderList();
        renderEditor();
        showMemoContextMenu(ev.clientX, ev.clientY, mm);
      });
      li.addEventListener('dragstart', (ev) => {
        memoDragId = mm.id;
        ev.dataTransfer.effectAllowed = 'move';
      });
      li.addEventListener('dragover', (ev) => {
        if (!memoDragId || memoDragId === mm.id || memoSort !== 'custom') return;
        ev.preventDefault();
        li.classList.add('is-drag-over');
      });
      li.addEventListener('dragleave', () => li.classList.remove('is-drag-over'));
      li.addEventListener('drop', async (ev) => {
        ev.preventDefault();
        li.classList.remove('is-drag-over');
        if (!memoDragId || memoDragId === mm.id || memoSort !== 'custom') return;
        await reorderMemo(memoDragId, mm.id, ev.offsetY > li.clientHeight / 2 ? 'after' : 'before');
        memoDragId = null;
      });
      li.addEventListener('dragend', () => { memoDragId = null; li.classList.remove('is-drag-over'); });
      ul.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function memoAssetSrc(path) {
    const raw = String(path || '').trim();
    if (!raw) return '';
    if (/^(data:|assets\/|https?:)/i.test(raw)) return encodeURI(raw);
    return window.blossomAssetSrc ? window.blossomAssetSrc(raw) : raw.replace(/^\/static\/image\/svg\/chat\//, 'assets/svg/chat/');
  }
  function renderMemoPreview(text) {
    if (looksLikeRichHtml(text)) return sanitizeMemoHtml(text);
    // Replace markdown image ![alt](src) with <img>; preserve other text safely
    const parts = [];
    const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(escapeHtml(text.slice(last, m.index)));
      const alt = escapeHtml(m[1] || '');
      const src = m[2] || '';
      // Only allow data: image and http(s)
      if (/^(data:image\/|https?:\/\/)/i.test(src)) {
        parts.push('<img alt="' + alt + '" src="' + src.replace(/"/g, '&quot;') + '" />');
      } else {
        parts.push(escapeHtml(m[0]));
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(escapeHtml(text.slice(last)));
    return parts.join('');
  }

  function markMemoDirty() {
    const st = $('memoStatus'); if (st) st.textContent = '변경됨 (저장 안 됨)';
    state.dirty = true;
  }

  function focusMemoEditor() {
    const rich = document.getElementById('memoBodyRich');
    if (rich && rich.contentEditable === 'true') rich.focus();
    return rich;
  }

  function insertMemoHtml(html) {
    const rich = focusMemoEditor();
    if (!rich) return;
    document.execCommand('insertHTML', false, html);
    const b = $('memoBody');
    if (b) b.value = richHtmlToMarkdown(rich);
    markMemoDirty();
  }

  function syncMemoRichBody(rich) {
    const b = $('memoBody');
    if (rich && b) b.value = richHtmlToMarkdown(rich);
    markMemoDirty();
  }

  function selectionInsideMemoEditor(rich, sel) {
    if (!rich || !sel || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    return rich.contains(range.commonAncestorContainer) || rich === range.commonAncestorContainer;
  }

  function makeMemoCheckHtml(text) {
    const safeText = escapeHtml(String(text || ''));
    return '<label class="memo-check-item"><input type="checkbox"> <span>' + (safeText || '<br>') + '</span></label>';
  }

  function applyMemoCheckbox() {
    const rich = focusMemoEditor();
    if (!rich) return;
    const sel = window.getSelection();
    if (!selectionInsideMemoEditor(rich, sel) || sel.isCollapsed) {
      insertMemoHtml(makeMemoCheckHtml('체크 항목') + '<div><br></div>');
      return;
    }
    const selectedText = String(sel.toString() || '').replace(/\r\n/g, '\n');
    const lines = selectedText.split('\n');
    while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    const targets = lines.length ? lines : [selectedText];
    const html = targets.map((line) => makeMemoCheckHtml(line)).join('');
    document.execCommand('insertHTML', false, html + '<div><br></div>');
    syncMemoRichBody(rich);
  }

  function applyMemoInlineStyle(styleText) {
    const rich = focusMemoEditor();
    if (!rich) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.setAttribute('style', styleText);
    span.appendChild(range.extractContents());
    range.insertNode(span);
    sel.removeAllRanges();
    const after = document.createRange();
    after.selectNodeContents(span);
    sel.addRange(after);
    const b = $('memoBody');
    if (b) b.value = richHtmlToMarkdown(rich);
    markMemoDirty();
  }

  function applyMemoTextColor(color) {
    const rich = focusMemoEditor();
    if (!rich || !color) return;
    memoLastTextColor = color;
    const dot = $('memoColorDot');
    if (dot) dot.style.background = color;
    const sel = window.getSelection();
    if (selectionInsideMemoEditor(rich, sel) && !sel.isCollapsed) {
      applyMemoInlineStyle('color:' + color + ';');
      return;
    }
    document.execCommand('foreColor', false, color);
    syncMemoRichBody(rich);
  }

  function applyMemoBox() {
    const rich = focusMemoEditor();
    if (!rich) return;
    const sel = window.getSelection();
    if (!selectionInsideMemoEditor(rich, sel) || sel.isCollapsed) {
      insertMemoHtml('<div class="memo-box"><br></div><div><br></div>');
      return;
    }
    const range = sel.getRangeAt(0);
    const box = document.createElement('div');
    box.className = 'memo-box';
    const contents = range.extractContents();
    if (!contents.textContent && !contents.querySelector) {
      box.appendChild(document.createElement('br'));
    } else {
      box.appendChild(contents);
      if (!box.childNodes.length) box.appendChild(document.createElement('br'));
    }
    range.insertNode(box);
    sel.removeAllRanges();
    const after = document.createRange();
    after.selectNodeContents(box);
    sel.addRange(after);
    syncMemoRichBody(rich);
  }

  function insertMemoImageFile(file) {
    if (!file || !/^image\//.test(file.type || '')) {
      alert('이미지 파일만 첨부할 수 있습니다.');
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      const src = escapeAttr(String(reader.result || ''));
      insertMemoHtml('<img alt="' + escapeAttr(file.name || 'image') + '" src="' + src + '" data-src="' + src + '" class="memo-edit-img" />');
    };
    reader.readAsDataURL(file);
  }

  function bindMemoToolbar() {
    const toolbar = $('memoToolbar');
    if (!toolbar || toolbar.dataset.bound === '1') return;
    toolbar.dataset.bound = '1';
    toolbar.addEventListener('mousedown', (ev) => {
      if (ev.target.closest('button')) ev.preventDefault();
    });
    toolbar.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button');
      if (!btn || toolbar.classList.contains('is-disabled')) return;
      if (btn.classList.contains('memo-color-swatch')) {
        applyMemoTextColor(btn.dataset.color || memoLastTextColor);
        const menu = $('memoColorMenu');
        if (menu) menu.hidden = true;
        return;
      }
      const cmd = btn.dataset.cmd;
      const action = btn.dataset.action;
      if (cmd) {
        focusMemoEditor();
        document.execCommand(cmd, false, null);
        const rich = document.getElementById('memoBodyRich');
        const b = $('memoBody');
        if (rich && b) b.value = richHtmlToMarkdown(rich);
        markMemoDirty();
        return;
      }
      if (action === 'highlight') {
        applyMemoInlineStyle('background-color:#fef08a;color:#111827;');
      } else if (action === 'checkbox') {
        applyMemoCheckbox();
      } else if (action === 'image') {
        const input = $('memoImageInput');
        if (input) input.click();
      } else if (action === 'color') {
        const menu = $('memoColorMenu');
        if (menu) {
          menu.hidden = !menu.hidden;
          menu.style.left = btn.offsetLeft + 'px';
          menu.style.top = (btn.offsetTop + btn.offsetHeight + 6) + 'px';
        }
      } else if (action === 'box') {
        applyMemoBox();
      } else if (action === 'star') {
        const mm = state.memos.find((x) => x.id === state.activeMemoId);
        if (!mm) return;
        mm.starred = !mm.starred;
        btn.classList.toggle('active', !!mm.starred);
        btn.setAttribute('aria-pressed', mm.starred ? 'true' : 'false');
        renderList();
        saveActive({ stayEditing: true });
      }
    });
    const size = $('memoFontSize');
    if (size) size.addEventListener('change', () => {
      if (size.value) applyMemoInlineStyle('font-size:' + size.value + ';');
      size.value = '';
    });
    const family = $('memoFontFamily');
    if (family) family.addEventListener('change', () => {
      if (family.value) applyMemoInlineStyle('font-family:' + family.value + ';');
      family.value = '';
    });
    const colorMenu = $('memoColorMenu');
    if (colorMenu && colorMenu.dataset.bound !== '1') {
      colorMenu.dataset.bound = '1';
      colorMenu.innerHTML = '';
      MEMO_TEXT_COLORS.forEach((color) => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'memo-color-swatch' + (color === '#ffffff' ? ' is-light' : '');
        swatch.dataset.color = color;
        swatch.title = color;
        swatch.style.background = color;
        colorMenu.appendChild(swatch);
      });
      const dot = $('memoColorDot');
      if (dot) dot.style.background = memoLastTextColor;
    }
    document.addEventListener('click', (ev) => {
      const menu = $('memoColorMenu');
      if (!menu || menu.hidden) return;
      if (ev.target.closest && ev.target.closest('#memoColorMenu, #memoColorBtn')) return;
      menu.hidden = true;
    });
    const imageInput = $('memoImageInput');
    if (imageInput) imageInput.addEventListener('change', () => {
      const file = imageInput.files && imageInput.files[0];
      insertMemoImageFile(file);
      imageInput.value = '';
    });
  }

  function renderEditor() {
    const t = $('memoTitle'), b = $('memoBody'), st = $('memoStatus'), del = $('memoDeleteBtn');
    const mm = state.memos.find((x) => x.id === state.activeMemoId);
    const toolbar = $('memoToolbar');
    const starBtn = $('memoStarBtn');
    // 미리보기 컨테이너 보장
    let preview = document.getElementById('memoPreview');
    if (!preview) {
      preview = document.createElement('div');
      preview.id = 'memoPreview';
      preview.className = 'memo-preview';
      b.parentNode.insertBefore(preview, b);
    }
    // v0.4.31: 리치 편집 영역 (contenteditable) — 이미지를 인라인으로 표시
    let rich = document.getElementById('memoBodyRich');
    if (!rich) {
      rich = document.createElement('div');
      rich.id = 'memoBodyRich';
      rich.className = 'memo-body-rich';
      rich.contentEditable = 'true';
      rich.setAttribute('spellcheck', 'false');
      b.parentNode.insertBefore(rich, b);
      // 텍스트영역은 백업 저장용으로만 유지 (사용자에게 보이지 않음)
      b.style.display = 'none';
      rich.addEventListener('input', function () {
        b.value = richHtmlToMarkdown(rich);
        const st2 = $('memoStatus'); if (st2) st2.textContent = '변경됨 (저장 안 됨)';
        state.dirty = true;
      });
      rich.addEventListener('change', function (ev) {
        const box = ev.target && ev.target.closest && ev.target.closest('input[type="checkbox"]');
        if (!box) return;
        if (box.checked) box.setAttribute('checked', 'checked');
        else box.removeAttribute('checked');
        b.value = richHtmlToMarkdown(rich);
        const st2 = $('memoStatus'); if (st2) st2.textContent = '변경됨 (저장 안 됨)';
        state.dirty = true;
      });
      // 붙여넣기 시 서식 제거 (이미지 데이터 URL 등은 그대로 통과)
      rich.addEventListener('paste', function (ev) {
        try {
          const cd = ev.clipboardData || window.clipboardData;
          if (!cd) return;
          // 이미지 파일 붙여넣기 → data URL 로 삽입
          const items = cd.items ? Array.from(cd.items) : [];
          const imgItem = items.find((it) => it.kind === 'file' && /^image\//.test(it.type));
          if (imgItem) {
            ev.preventDefault();
            const file = imgItem.getAsFile();
            const reader = new FileReader();
            reader.onload = function () {
              const src = String(reader.result || '');
              const safe = src.replace(/"/g, '&quot;');
              document.execCommand('insertHTML', false, '<img alt="image" src="' + safe + '" data-src="' + safe + '" class="memo-edit-img" />');
              b.value = richHtmlToMarkdown(rich);
              state.dirty = true;
            };
            reader.readAsDataURL(file);
            return;
          }
          const text = cd.getData('text/plain');
          if (text != null) {
            ev.preventDefault();
            document.execCommand('insertText', false, text);
          }
        } catch (_) {}
      });
    }
    // v0.4.28: footer 안에 편집/저장 버튼 동적 주입 (삭제 버튼과 동일 row)
    const foot = document.querySelector('.memo-editor-foot');
    let editBtn = document.getElementById('memoEditToggle');
    let saveBtn = document.getElementById('memoSaveBtn');
    if (foot && !editBtn) {
      // 기존 status / delete 버튼 사이에 편집·저장 버튼 삽입
      editBtn = document.createElement('button');
      editBtn.id = 'memoEditToggle';
      editBtn.type = 'button';
      editBtn.className = 'btn-secondary memo-foot-btn';
      editBtn.textContent = '수정';
      saveBtn = document.createElement('button');
      saveBtn.id = 'memoSaveBtn';
      saveBtn.type = 'button';
      saveBtn.className = 'btn-primary memo-foot-btn';
      saveBtn.textContent = '저장';
      // 삭제 버튼 앞에 삽입 (자동 정렬)
      if (del && del.parentNode === foot) {
        foot.insertBefore(editBtn, del);
        foot.insertBefore(saveBtn, del);
      } else {
        foot.appendChild(editBtn);
        foot.appendChild(saveBtn);
      }
      editBtn.addEventListener('click', function () {
        state.memoEditing = true;
        renderEditor();
        setTimeout(() => {
          const r = document.getElementById('memoBodyRich');
          if (r) r.focus();
        }, 10);
      });
      saveBtn.addEventListener('click', () => { saveActive(); });
    }
    if (!mm) {
      t.value = ''; b.value = ''; st.textContent = ''; del.hidden = true;
      t.disabled = true; b.disabled = true;
      preview.innerHTML = ''; preview.hidden = true;
      rich.innerHTML = ''; rich.hidden = false; rich.contentEditable = 'false';
      if (editBtn) editBtn.style.display = 'none';
      if (saveBtn) saveBtn.style.display = 'none';
      if (toolbar) toolbar.hidden = true;
      if (starBtn) starBtn.classList.remove('active');
      return;
    }
    const editing = !!state.memoEditing;
    if (editBtn) editBtn.style.display = editing ? 'none' : '';
    if (saveBtn) saveBtn.style.display = editing ? '' : 'none';
    if (toolbar) {
      toolbar.hidden = !editing;
      toolbar.classList.toggle('is-disabled', !editing);
    }
    if (starBtn) {
      starBtn.classList.toggle('active', !!mm.starred);
      starBtn.setAttribute('aria-pressed', mm.starred ? 'true' : 'false');
      const img = starBtn.querySelector('img');
      if (img) img.src = memoAssetSrc('/static/image/svg/chat/free-icon-font-star.svg');
    }
    t.disabled = false; t.readOnly = !editing; b.disabled = !editing;
    rich.contentEditable = editing ? 'true' : 'false';
    rich.classList.toggle('is-readonly', !editing);
    t.value = mm.title || '';
    // v0.4.31: 본문은 마크다운 그대로 유지하고, 리치 영역은 이미지 인라인으로 렌더
    const fullBody = mm.body || '';
    b.value = fullBody;
    rich.innerHTML = markdownToRichHtml(fullBody);
    rich.hidden = false; preview.hidden = true;
    if (editBtn) editBtn.textContent = '수정';
    st.textContent = mm.updated_at ? '저장됨 · ' + new Date(mm.updated_at).toLocaleString() : '';
    del.hidden = false;
    state.dirty = false;
  }

  function scheduleSave() {
    if (state.saveTimer) clearTimeout(state.saveTimer);
    const st = $('memoStatus'); if (st) st.textContent = '저장 중…';
    state.saveTimer = setTimeout(saveActive, 600);
  }

  async function saveActive(options) {
    options = options || {};
    const mm = state.memos.find((x) => x.id === state.activeMemoId);
    if (!mm) return;
    // v0.4.31: 리치 에디터에서 최신 마크다운을 추출
    const rich = document.getElementById('memoBodyRich');
    const b = $('memoBody');
    if (rich && rich.contentEditable === 'true') {
      b.value = richHtmlToMarkdown(rich);
    }
    const payload = { title: $('memoTitle').value, body: b.value, starred: !!mm.starred };
    if (state.memoLocalMode) {
      const store = loadLocalMemoStore();
      const row = store.memos.find((m) => m.id === mm.id);
      if (row) {
        Object.assign(row, payload);
        touchLocalMemo(row);
        saveLocalMemoStore(store);
        Object.assign(mm, row);
        renderList();
        if (!options.stayEditing) {
          state.memoEditing = false;
          renderEditor();
        }
        const st = $('memoStatus'); if (st) st.textContent = '저장됨 · ' + new Date(row.updated_at).toLocaleString();
      }
      return;
    }
    try {
      const resp = await Api.updateMemo(mm.id, payload);
      const it = resp && resp.item;
      if (it) {
        Object.assign(mm, it);
        renderList();
        if (!options.stayEditing) {
          state.memoEditing = false;
          renderEditor();
        }
        const st = $('memoStatus'); if (st) st.textContent = '저장됨 · ' + new Date(it.updated_at || Date.now()).toLocaleString();
      }
    } catch (e) {
      const st = $('memoStatus'); if (st) st.textContent = '저장 실패: ' + (e && e.message || '');
    }
  }

  async function newMemo() {
    if (!state.activeGroupId) { alert('먼저 그룹을 선택하세요.'); return; }
    if (state.memoLocalMode) {
      const store = loadLocalMemoStore();
      const id = Number(store.seq || 2);
      store.seq = id + 1;
      const row = touchLocalMemo({ id, group_id: state.activeGroupId, title: '새 메모', body: '', starred: false, pinned: false });
      store.memos.unshift(row);
      saveLocalMemoStore(store);
      state.activeMemoId = id;
      await loadMemos();
      state.memoEditing = true;
      renderEditor();
      const t = $('memoTitle'); if (t) { t.focus(); t.select(); }
      return;
    }
    try {
      const resp = await Api.createMemo(state.activeGroupId, { title: '새 메모', body: '' });
      if (resp && resp.item) {
        state.activeMemoId = resp.item.id;
        await loadMemos();
        state.memoEditing = true;
        renderEditor();
        const t = $('memoTitle'); if (t) { t.focus(); t.select(); }
      } else {
        alert('메모 생성 응답이 비어 있습니다.');
      }
    } catch (e) {
      const msg = (e && e.payload && e.payload.message) || (e && e.message) || '알 수 없는 오류';
      alert('메모 생성 실패 (' + (e && e.status || '?') + '): ' + msg);
      console.error('createMemo failed', e);
    }
  }

  async function deleteActive() {
    const mm = state.memos.find((x) => x.id === state.activeMemoId);
    if (!mm) return;
    if (!confirm('이 메모를 삭제하시겠습니까?')) return;
    if (state.memoLocalMode) {
      const store = loadLocalMemoStore();
      const row = store.memos.find((m) => m.id === mm.id);
      if (row) row.is_deleted = 1;
      saveLocalMemoStore(store);
      state.activeMemoId = null;
      await loadMemos();
      return;
    }
    try {
      await Api.deleteMemo(mm.id);
      state.activeMemoId = null;
      await loadMemos();
    } catch (e) { alert('삭제 실패: ' + (e && e.message || '')); }
  }

  async function newGroup() {
    // v0.4.26: Electron prompt() 미지원 → 커스텀 모달 사용
    const name = await inputDialog('새 그룹 이름을 입력하세요 (10글자 이내)', '');
    if (!name || !name.trim()) return;
    const groupName = name.trim();
    if (groupName.length > 10) {
      alert('그룹명은 10글자를 넘을 수 없습니다.');
      return;
    }
    if (state.memoLocalMode) {
      const store = loadLocalMemoStore();
      const id = Number(store.seq || 2);
      store.seq = id + 1;
      store.groups.push({ id, name: groupName, memo_count: 0, sort_order: store.groups.length });
      saveLocalMemoStore(store);
      state.activeGroupId = id;
      await loadGroups();
      return;
    }
    try {
      const resp = await Api.createMemoGroup(groupName);
      if (resp && resp.item) state.activeGroupId = resp.item.id;
      await loadGroups();
    } catch (e) {
      const msg = (e && e.payload && e.payload.message) || (e && e.message) || '알 수 없는 오류';
      alert('그룹 생성 실패 (' + (e && e.status || '?') + '): ' + msg);
      console.error('createMemoGroup failed', e);
    }
  }

  function bind() {
    const t = $('memoTitle'), b = $('memoBody');
    bindMemoToolbar();
    // v0.4.28: 자동저장 제거 — 저장 버튼만 사용. 단 입력 시 상태만 표시
    if (t) t.addEventListener('input', () => { const st = $('memoStatus'); if (st) st.textContent = '변경됨 (저장 안 됨)'; state.dirty = true; });
    if (b) b.addEventListener('input', () => { const st = $('memoStatus'); if (st) st.textContent = '변경됨 (저장 안 됨)'; state.dirty = true; });
    const newBtn = $('memoNewBtn'); if (newBtn) newBtn.addEventListener('click', newMemo);
    const del = $('memoDeleteBtn'); if (del) del.addEventListener('click', deleteActive);
    const ng = $('memoNewGroupBtn'); if (ng) ng.addEventListener('click', newGroup);
    const memoSortEl = $('memoSortSelect');
    if (memoSortEl) {
      memoSortEl.value = memoSort;
      memoSortEl.addEventListener('change', async () => {
        memoSort = memoSortEl.value || 'custom';
        await loadMemos();
      });
    }
    const groupSortEl = $('memoGroupSortSelect');
    if (groupSortEl) {
      groupSortEl.value = memoGroupSort;
      groupSortEl.addEventListener('change', () => {
        memoGroupSort = groupSortEl.value || 'custom';
        renderGroups();
      });
    }
  }

  return { open: open, save: saveActive };
})();
