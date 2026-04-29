// Blossom Chat — 데스크탑 (web /addon/chat 와 동기화)
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // v0.4.32: 하드코딩 서버 주소 제거 — 최초 로그인 시 사용자가 입력
  const DEFAULT_SERVER_URL = '';
  const POLL_INTERVAL_MS = 1000;

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
      notifyOnFocus: false,
      notifySound: true,
      autoStart: false,
      minimizeToTray: true,
      language: 'ko',
    },
  };

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
    const keys = Object.keys(state.settings);
    for (const k of keys) {
      const v = await blossom.settings.get(k);
      if (v !== undefined && v !== null) state.settings[k] = v;
    }
    state.serverUrl = (await blossom.settings.get('serverUrl')) || DEFAULT_SERVER_URL;
    Api.setServer(state.serverUrl);
    applyTheme();
    applyFontSize();
  }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.settings.theme || 'auto');
  }
  function applyFontSize() {
    document.documentElement.style.setProperty('--font-size-base', (state.settings.fontSize || '15') + 'px');
  }
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  function syncSystemTheme() {
    document.documentElement.setAttribute('data-system-theme', mq.matches ? 'dark' : 'light');
  }
  syncSystemTheme();
  mq.addEventListener('change', syncSystemTheme);

  // v0.4.44: 데모 빌드 감지 — 네이티브 인터페이스 또는 ?demo=1 쿼리스트링
  try {
    if ((window.BlossomNative && typeof window.BlossomNative.isDemo === 'function' && window.BlossomNative.isDemo()) ||
        /[?&]demo=1\b/.test(location.search)) {
      window.__BLOSSOM_DEMO__ = true;
    }
  } catch (_) {}

  // 데모 모드 전용 afterLogin: 네트워크 호출 없이 빈 UI만 보여줌
  async function afterLoginDemo() {
    state.profile = { name: '관리자', emp_no: 'admin', id: 0 };
    state.currentUserId = 0;
    state.rooms = [];
    try { renderMe(); } catch (_) {}
    try { renderRooms(); } catch (_) {}
    try { setTab('chat'); } catch (_) {}
    toast('데모 모드: 서버 연결 없이 UI만 표시됩니다.', 'info');
  }

  // ── 부팅 ──
  async function boot() {
    await loadSettings();
    // 데모 빌드는 잔존 세션 정리 호출(네트워크) 자체를 건너뛴다.
    if (!window.__BLOSSOM_DEMO__) {
      try { await Api.logout(); } catch (_) {}
    }
    showLogin();
  }

  function showLogin() {
    $('appShell').hidden = true;
    $('loginModal').hidden = false;
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
    // v0.4.44: 데모 빌드 — admin/admin 입력 시 서버 없이 로그인 통과 (UI 둘러보기 전용)
    if (window.__BLOSSOM_DEMO__) {
      if (empNo === 'admin' && pw === 'admin') {
        $('loginError').hidden = true;
        hideLogin();
        $('loginPassword').value = '';
        try { await afterLoginDemo(); } catch (e) { console.warn('demo afterLogin failed', e); }
        return;
      } else {
        $('loginError').hidden = false;
        $('loginError').textContent = '데모 빌드: 사번 admin / 비밀번호 admin 으로 접속하세요.';
        return;
      }
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
    $(id).addEventListener('keydown', (e) => {
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
    const m = $('loginModal');
    m.classList.remove('locked');
    delete m.dataset.lockedEmpNo;
    $('loginPassword').value = '';
    const errEl = $('loginError'); if (errEl) errEl.hidden = true;
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
      img.src = imgPath.startsWith('http') ? imgPath : (state.serverUrl + imgPath);
    } else {
      renderFallback();
    }
  }

  // ── 사이드바 탭 ──
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
    if (t === 'DIRECT') {
      const others = (room.members || []).filter((m) => m.user_id !== state.currentUserId);
      if (others.length) {
        const u = others[0].user || {};
        return u.name || ('user#' + others[0].user_id);
      }
      return room.room_name || '대화';
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
  function isPrivateChannel(r) {
    const t = (r.room_type || '').toUpperCase();
    return t === 'GROUP' && !!(r.room_name && String(r.room_name).trim());
  }
  function isChannelLike(r) {
    const t = (r.room_type || '').toUpperCase();
    return t === 'CHANNEL' || isPrivateChannel(r);
  }
  function isDmLike(r) {
    const t = (r.room_type || '').toUpperCase();
    if (t === 'DIRECT') return true;
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
      const cp = $('composer'); if (cp) cp.hidden = true;
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
            b.className = 'unread-badge';
            b.textContent = unread > 99 ? '99+' : String(unread);
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
        b.className = 'unread-badge';
        b.textContent = unread > 99 ? '99+' : String(unread);
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
    // v0.4.29: 숨겨놓은 DM이라도 직접 열면 자동으로 다시 표시
    try { if (getHiddenDmIds().has(room.id)) unhideDmRoom(room.id); } catch (_) {}
    if (typeof closeConvSearch === 'function') closeConvSearch();
    state.activeRoomId = room.id;
    state.activeRoom = room;
    const myGen = ++state.openRoomGen;
    // 방 전환 즉시 메시지 영역/캐시 초기화 — 이전 방의 메시지가 남아 보이는 현상 방지
    const _area0 = $('messageArea');
    if (_area0) _area0.innerHTML = '';
    state.messagesByRoom[room.id] = [];
    renderRooms();
    const t = (room.room_type || '').toUpperCase();
    $('convIcon').textContent = t === 'CHANNEL' ? '#' : '@';
    $('convTitle').textContent = roomTitle(room);
    const memberCount = (room.members || []).filter((m) => !m.left_at).length;
    $('convMeta').textContent = (memberCount ? memberCount + '명' : '') + (room.last_message_preview ? '' : '');
    $('emptyHint').hidden = true;
    $('composer').hidden = false;
    $('composer').removeAttribute('hidden');
    document.body.classList.remove('no-active-room');
    state.lastMessageIdByRoom[room.id] = 0;
    setReplyTo(null);
    state.pinnedByRoom[room.id] = [];
    const pb = $('pinnedBar'); if (pb) pb.hidden = true;
    try { setActiveRoomTab('chat'); } catch (_) {}
    try { _updateMembersTabVisibility(); } catch (_) {}
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
      const lastId = full ? 0 : (state.lastMessageIdByRoom[roomId] || 0);
      const data = await Api.listMessages(roomId, lastId ? { afterId: lastId } : { perPage: 80 });
      // 그 사이 다른 방으로 전환됐으면 이 응답은 폐기
      if (myGen !== state.openRoomGen || roomId !== state.activeRoomId) return;
      const items = (data && data.items) || [];
      if (!items.length && !full) return;
      const area = $('messageArea');
      if (full) {
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
      if (roomId === state.activeRoomId && myGen === state.openRoomGen) area.scrollTop = area.scrollHeight;
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
      const qName = document.createElement('span');
      qName.className = 'rq-name';
      qName.textContent = (orig && orig.sender && orig.sender.name) || '대화 원문';
      const qText = document.createElement('span');
      qText.className = 'rq-text';
      qText.textContent = orig ? _shortenText(orig.content_text || '', 80) : '메시지를 찾을 수 없습니다';
      quote.appendChild(qName); quote.appendChild(qText);
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
      pinSpan.innerHTML = '<img src="assets/svg/chat/free-icon-font-thumbtack.svg" alt="" />';
      head.appendChild(pinSpan);
    }
    body.appendChild(head);
    const content = document.createElement('div');
    content.className = 'msg-content';
    const text = m.content_text || '';
    // v0.4.28: 일정 공유 마커 처리 → "내 일정에 추가" 버튼
    let displayText = text;
    let schedMarker = null;
    const markerMatch = text.match(/<!--BLS_SCHED:(\{[\s\S]*?\})-->/);
    if (markerMatch) {
      try { schedMarker = JSON.parse(markerMatch[1]); } catch (_) {}
      displayText = text.replace(markerMatch[0], '').replace(/\n+$/, '');
    }
    content.innerHTML = formatMessage(displayText);
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
    (m.files || []).forEach((f) => {
      const link = document.createElement('a');
      link.className = 'msg-attach';
      const url = f.file_path && f.file_path.startsWith('http') ? f.file_path : (state.serverUrl + (f.file_path || ''));
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = '📎 ' + (f.original_name || 'file');
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
      btnReply.textContent = '↩';
      btnReply.addEventListener('click', (ev) => { ev.stopPropagation(); setReplyTo(m); });
      actions.appendChild(btnReply);
      const btnPin = document.createElement('button');
      btnPin.type = 'button';
      btnPin.className = 'icon-btn ma-btn';
      btnPin.title = m.is_pinned ? '고정 해제' : '고정';
      btnPin.setAttribute('aria-label', btnPin.title);
      btnPin.innerHTML = '<img src="assets/svg/chat/free-icon-font-thumbtack.svg" alt="" />';
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
                pinSpan.innerHTML = '<img src="assets/svg/chat/free-icon-font-thumbtack.svg" alt="" />';
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
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (s.length <= n) return s;
    return s.substring(0, n) + '…';
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
  function setActiveRoomTab(tabName) {
    _activeRoomTab = tabName;
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
    const composer = $('composer');
    if (composer) composer.style.display = (tabName === 'chat') ? '' : 'none';
    if (!state.activeRoomId) return;
    if (tabName === 'files') reloadRoomFiles(state.activeRoomId);
    else if (tabName === 'ideas') reloadRoomIdeas(state.activeRoomId);
    else if (tabName === 'tasks') reloadRoomTasks(state.activeRoomId);
    else if (tabName === 'members') reloadRoomMembers(state.activeRoomId);
  }
  (function bindRoomTabs() {
    document.querySelectorAll('.room-tab').forEach((b) => {
      b.addEventListener('click', () => setActiveRoomTab(b.dataset.roomTab));
    });
  })();

  // v0.4.48: 기본 노출 → 1:1/다자 DM이 확실한 경우에만 숨김
  function _updateMembersTabVisibility() {
    const tab = document.querySelector('.room-tab[data-room-tab="members"]');
    if (!tab) return;
    const room = state.activeRoom;
    let hide = false;
    try {
      if (room) {
        const t = String(room.room_type || '').toUpperCase();
        if (t === 'DIRECT') hide = true;
        else if (t === 'GROUP' && !(room.room_name && String(room.room_name).trim())) hide = true; // 이름없는 다자 DM
      }
    } catch (_) { hide = false; }
    tab.style.display = hide ? 'none' : '';
    tab.hidden = hide;
    if (hide && _activeRoomTab === 'members') setActiveRoomTab('chat');
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
      list.innerHTML = '';
      if (cnt) cnt.textContent = items.length ? (items.length + '개') : '';
      if (!items.length) { if (empty) empty.hidden = false; return; }
      items.forEach((f) => {
        const it = document.createElement('div');
        it.className = 'file-item';
        const ic = document.createElement('div'); ic.className = 'fi-icon'; ic.textContent = '📎';
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
        const open = document.createElement('button');
        open.type = 'button'; open.className = 'btn-secondary fi-open';
        open.textContent = '열기';
        open.addEventListener('click', () => {
          const url = (f.file_path && /^https?:/i.test(f.file_path)) ? f.file_path : (state.serverUrl + (f.file_path || ''));
          if (url) {
            try { if (window.blossom && window.blossom.app && window.blossom.app.openExternal) window.blossom.app.openExternal(url); else window.open(url, '_blank'); }
            catch (_) { window.open(url, '_blank'); }
          }
        });
        it.appendChild(open);
        list.appendChild(it);
      });
    } catch (e) {
      list.innerHTML = '';
      if (empty) { empty.hidden = false; empty.textContent = '파일을 불러오지 못했습니다: ' + (e.message || ''); }
    }
  }

  // ── 아이디어 ──
  let _ideaEditingId = null;
  async function reloadRoomIdeas(roomId) {
    const list = $('ideasList'); const empty = $('ideasEmpty');
    if (!list) return;
    list.innerHTML = '<div class="rp-empty">불러오는 중…</div>';
    if (empty) empty.hidden = true;
    try {
      const data = await Api.listRoomIdeas(roomId);
      if (roomId !== state.activeRoomId) return;
      const items = (data && data.items) || [];
      list.innerHTML = '';
      if (!items.length) { if (empty) { empty.hidden = false; empty.textContent = '등록된 아이디어가 없습니다.'; } return; }
      items.forEach((it) => {
        const card = document.createElement('div');
        card.className = 'idea-item';
        const t = document.createElement('div'); t.className = 'ii-title'; t.textContent = it.title || '';
        card.appendChild(t);
        if (it.body) {
          const b = document.createElement('div'); b.className = 'ii-body'; b.textContent = it.body;
          card.appendChild(b);
        }
        const meta = document.createElement('div'); meta.className = 'ii-meta';
        const author = document.createElement('span');
        author.textContent = (it.created_by && it.created_by.name) || '';
        meta.appendChild(author);
        if (it.created_at) {
          const tm = document.createElement('span'); tm.textContent = _formatDateTime(it.created_at);
          meta.appendChild(tm);
        }
        const actions = document.createElement('div'); actions.className = 'ii-actions';
        if (it.created_by_user_id === state.currentUserId) {
          const ed = document.createElement('button'); ed.type = 'button'; ed.className = 'btn-secondary';
          ed.textContent = '수정';
          ed.addEventListener('click', () => openIdeaForm(it));
          actions.appendChild(ed);
          const del = document.createElement('button'); del.type = 'button'; del.className = 'btn-secondary';
          del.textContent = '삭제';
          del.addEventListener('click', async () => {
            if (!confirm('아이디어를 삭제할까요?')) return;
            try { await Api.deleteRoomIdea(state.activeRoomId, it.id); reloadRoomIdeas(state.activeRoomId); }
            catch (e) { toast('삭제 실패: ' + (e.message || ''), 'error'); }
          });
          actions.appendChild(del);
        }
        meta.appendChild(actions);
        card.appendChild(meta);
        list.appendChild(card);
      });
    } catch (e) {
      list.innerHTML = '';
      if (empty) { empty.hidden = false; empty.textContent = '아이디어를 불러오지 못했습니다: ' + (e.message || ''); }
    }
  }
  function openIdeaForm(item) {
    _ideaEditingId = item ? item.id : null;
    $('ideaFormTitle').textContent = item ? '아이디어 수정' : '아이디어 추가';
    $('ideaFormTitleInput').value = item ? (item.title || '') : '';
    $('ideaFormBodyInput').value = item ? (item.body || '') : '';
    $('ideaFormModal').hidden = false;
    setTimeout(() => $('ideaFormTitleInput').focus(), 30);
  }
  (function bindIdeaForm() {
    const addBtn = $('btnIdeaAdd'); if (addBtn) addBtn.addEventListener('click', () => openIdeaForm(null));
    const saveBtn = $('btnIdeaSave');
    if (saveBtn) saveBtn.addEventListener('click', async () => {
      const title = $('ideaFormTitleInput').value.trim();
      const body = $('ideaFormBodyInput').value.trim();
      if (!title) { toast('제목을 입력하세요.', 'info'); return; }
      if (!state.activeRoomId) { toast('채팅방을 먼저 선택하세요.', 'error'); return; }
      saveBtn.disabled = true;
      try {
        if (_ideaEditingId) await Api.updateRoomIdea(state.activeRoomId, _ideaEditingId, { title: title, body: body });
        else await Api.createRoomIdea(state.activeRoomId, { title: title, body: body });
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
  async function reloadRoomTasks(roomId) {
    const list = $('tasksList'); const empty = $('tasksEmpty');
    if (!list) return;
    list.innerHTML = '<div class="rp-empty">불러오는 중…</div>';
    if (empty) empty.hidden = true;
    try {
      const data = await Api.listRoomTasks(roomId);
      if (roomId !== state.activeRoomId) return;
      const items = (data && data.items) || [];
      list.innerHTML = '';
      if (!items.length) { if (empty) { empty.hidden = false; empty.textContent = '등록된 업무가 없습니다.'; } return; }
      items.forEach((it) => {
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
        if (it.description) { const d = document.createElement('div'); d.className = 'ti-desc'; d.textContent = it.description; body.appendChild(d); }
        const meta = document.createElement('div'); meta.className = 'ti-meta';
        const st = document.createElement('span'); st.className = 'ti-status'; st.textContent = _statusLabel(it.status); meta.appendChild(st);
        const pri = document.createElement('span'); pri.className = 'ti-pri ti-pri-' + (it.priority || 'normal'); pri.textContent = _priorityLabel(it.priority); meta.appendChild(pri);
        if (it.assignee && it.assignee.name) { const a = document.createElement('span'); a.textContent = '👤 ' + it.assignee.name; meta.appendChild(a); }
        if (it.due_date) { const dd = document.createElement('span'); dd.textContent = '📅 ' + it.due_date; meta.appendChild(dd); }
        const actions = document.createElement('div'); actions.className = 'ti-actions';
        if (it.created_by_user_id === state.currentUserId || (it.assignee_user_id === state.currentUserId)) {
          const ed = document.createElement('button'); ed.type = 'button'; ed.className = 'btn-secondary';
          ed.textContent = '수정'; ed.addEventListener('click', () => openTaskForm(it));
          actions.appendChild(ed);
        }
        if (it.created_by_user_id === state.currentUserId) {
          const del = document.createElement('button'); del.type = 'button'; del.className = 'btn-secondary';
          del.textContent = '삭제';
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
  function openTaskForm(item) {
    _taskEditingId = item ? item.id : null;
    $('taskFormTitle').textContent = item ? '업무 수정' : '업무 추가';
    $('taskFormTitleInput').value = item ? (item.title || '') : '';
    $('taskFormDescInput').value = item ? (item.description || '') : '';
    $('taskFormStatus').value = item ? (item.status || 'todo') : 'todo';
    $('taskFormPriority').value = item ? (item.priority || 'normal') : 'normal';
    const dueVal = item ? (item.due_date || '') : '';
    $('taskFormDue').value = dueVal;
    _ensureTaskDuePicker();
    if (_taskDueFp) { try { _taskDueFp.setDate(dueVal || null, false); } catch (_) {} }
    _populateAssignees();
    $('taskFormAssignee').value = item && item.assignee_user_id ? String(item.assignee_user_id) : '';
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
        description: $('taskFormDescInput').value.trim(),
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
    return '<span class="avatar avatar-md mi-avatar" style="display:inline-flex;align-items:center;justify-content:center;background:var(--brand-soft);color:var(--brand);font-weight:700;border-radius:50%;">' + escapeHtml(ch) + '</span>';
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
      const room = state.activeRoom;
      const showInvite = !!(room && isPrivateChannel(room));
      if (inviteBtn) inviteBtn.hidden = !showInvite;
      if (cnt) cnt.textContent = items.length ? ('(' + items.length + '명)') : '';
      list.innerHTML = '';
      if (!items.length) { if (empty) empty.hidden = false; return; }
      const ownerId = room && room.created_by_user_id;
      items.forEach((m) => {
        const card = document.createElement('div');
        card.className = 'member-item';
        const u = m.user || {};
        card.innerHTML = _avatarHtml(u);
        const body = document.createElement('div'); body.className = 'mi-body';
        const nm = document.createElement('div'); nm.className = 'mi-name';
        nm.textContent = u.name || u.nickname || ('user#' + m.user_id);
        body.appendChild(nm);
        const sub = document.createElement('div'); sub.className = 'mi-sub';
        const subParts = [];
        if (u.emp_no) subParts.push(u.emp_no);
        if (u.dept) subParts.push(u.dept);
        if (u.position) subParts.push(u.position);
        sub.textContent = subParts.join(' · ');
        body.appendChild(sub);
        card.appendChild(body);
        const role = document.createElement('span');
        role.className = 'mi-role' + (m.user_id === ownerId ? ' is-owner' : '');
        role.textContent = m.user_id === ownerId ? '관리자' : (m.member_role === 'OWNER' ? '관리자' : '멤버');
        card.appendChild(role);
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
              await Api.inviteRoomMember(state.activeRoomId, u.id, state.currentUserId);
              btn.textContent = '초대됨';
              row.classList.add('is-member');
              await reloadRoomMembers(state.activeRoomId);
            } catch (e) {
              btn.disabled = false; btn.textContent = '초대';
              toast('초대 실패: ' + (e.message || ''), 'error');
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
  $('composerInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrentMessage(); }
    else if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); applyFmt('bold'); }
    else if (e.ctrlKey && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); applyFmt('italic'); }
    else if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); applyFmt('underline'); }
  });
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
        const upRec = await Api.uploadFile(f);
        const saved = await Api.sendMessage(state.activeRoomId, state.currentUserId, '', { contentType: 'FILE' });
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
  async function leaveRoomConfirm(room) {
    if (!room || !room.id) return;
    const me = state.currentUserId;
    if (!me) { toast('내 사용자 ID를 확인하지 못했습니다.', 'error'); return; }
    const t = (room.room_type || '').toUpperCase();
    const label = t === 'CHANNEL' ? '채널' : '대화';
    // v0.4.32: DIRECT/CHANNEL/GROUP 모두 일관되게 처리.
    // 생성자는 leave가 아니라 delete 해야 함(DM 포함).
    const isCreator = room.created_by_user_id === me;
    if (isCreator) {
      const ok = confirm(
        `이 ${label}을(를) 만든 사람입니다.\n나가는 대신 ${label} 전체가 삭제됩니다.\n` +
        `(메시지·멤버 모두 영구 삭제, 되돌릴 수 없습니다)\n\n계속하시겠습니까?`
      );
      if (!ok) return;
      try {
        await Api.deleteRoom(room.id, me);
      } catch (e) {
        const status = e && e.status;
        const msg = (e && e.payload && e.payload.error) || (e && e.message) || '';
        if (status !== 404 && !/not\s*found/i.test(msg)) {
          toast(label + ' 삭제 실패: ' + msg, 'error');
          return;
        }
      }
      _afterRoomRemoved(room.id, label + '을(를) 삭제했습니다.');
      return;
    }
    if (!confirm(`정말 이 ${label}에서 나가시겠습니까?`)) return;
    try {
      await Api.leaveRoom(room.id, me);
      _afterRoomRemoved(room.id, '나갔습니다.');
    } catch (e) {
      const status = e && e.status;
      const msg = (e && e.payload && e.payload.error) || (e && e.message) || '';
      if (status === 404 || /not\s*found/i.test(msg) || /not_a_member|already_left/i.test(msg)) {
        _afterRoomRemoved(room.id, '나갔습니다.');
        return;
      }
      toast('나가기 실패: ' + msg, 'error');
    }
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
      const cp = $('composer'); if (cp) cp.hidden = true;
      document.body.classList.add('no-active-room');
    }
    renderRooms();
    updateBadge();
    if (message) toast(message, 'info');
    loadRooms().catch(() => {});
  }

  // ── 컨텍스트 메뉴 (방 우클릭) ──
  function showRoomContextMenu(x, y, room) {
    closeContextMenu();
    const me = state.currentUserId;
    const t = (room.room_type || '').toUpperCase();
    const isCreator = room.created_by_user_id === me;
    const leaveLabel = t === 'CHANNEL' ? '채널 나가기' : '대화 나가기';
    const deleteLabel = t === 'CHANNEL' ? '채널 삭제' : '대화 삭제';
    const menu = document.createElement('div');
    menu.id = '__ctxMenu';
    menu.className = 'ctx-menu';
    const items = [
      { key: 'open', label: '열기', enabled: true },
      { key: 'sep1', sep: true },
    ];
    if (t === 'DIRECT') {
      // v0.4.29~0.4.30: DM은 숨기기/숨김해제(클라이언트) + 나가기(서버) 옵션 제공
      const isHidden = getHiddenDmIds().has(room.id);
      if (isHidden) {
        items.push({ key: 'unhide', label: '숨김 해제', enabled: true });
      } else {
        items.push({ key: 'hide', label: '대화 숨기기', enabled: true });
      }
      items.push({ key: 'leave', label: '대화 나가기', enabled: true, danger: true });
    } else if (t !== 'DIRECT' && isCreator) {
      // 생성자: 나가기 대신 삭제 옵션 노출
      items.push({ key: 'delete', label: deleteLabel, enabled: true, danger: true });
    } else {
      items.push({ key: 'leave', label: leaveLabel, enabled: true, danger: true });
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
        else if (it.key === 'hide') hideDmRoom(room.id);
        else if (it.key === 'unhide') unhideDmRoom(room.id);
        else if (it.key === 'leave' || it.key === 'delete') leaveRoomConfirm(room);
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

  function buildPeopleItem(u) {
    const li = document.createElement('li');
    li.className = 'people-item';
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
    meta.textContent = [u.emp_no, u.department, u.job].filter(Boolean).join(' · ');
    info.appendChild(meta);
    li.appendChild(info);
    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'fav-btn' + (state.favorites.has(u.id) ? ' on' : '');
    star.title = state.favorites.has(u.id) ? '즐겨찾기 해제' : '즐겨찾기';
    star.setAttribute('aria-label', star.title);
    star.textContent = state.favorites.has(u.id) ? '★' : '☆';
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
      const rows = await Api.listDirectory({ q: q, limit: 500 });
      let users = Array.isArray(rows) ? rows : [];
      if (state.currentUserId) users = users.filter((u) => u.id !== state.currentUserId);
      if (listId === 'peopleList') {
        state.lastDirectoryUsers = users;
        state.lastPeopleQuery = q || '';
        state.directoryCache = true;
        renderPeopleList();
        return;
      }
      const ul = $(listId);
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

  async function lockApp() {
    // v0.4.21: 세션을 끊지 않고 UI만 잠금. 비밀번호로 잠금 해제.
    const prof = state.profile || {};
    const empNo = prof.emp_no || $('loginEmpNo').value || '';
    const name = prof.name || prof.nickname || empNo || '사용자';
    // 프로필 영역 채우기
    try { setAvatar($('lockAvatar'), prof.profile_image, prof.id || prof.user_id || 0, name); } catch (_) {}
    const nameEl = $('lockName'); if (nameEl) nameEl.textContent = name + ' (' + (empNo || '-') + ')';
    // 잠금 모드 클래스
    const m = $('loginModal');
    m.classList.add('locked');
    m.dataset.lockedEmpNo = empNo;
    // 입력 초기화
    $('loginPassword').value = '';
    const errEl = $('loginError'); if (errEl) errEl.hidden = true;
    m.hidden = false;
    setTimeout(() => $('loginPassword').focus(), 50);
  }

  async function unlockApp() {
    const m = $('loginModal');
    const empNo = (m && m.dataset.lockedEmpNo) || (state.profile && state.profile.emp_no) || '';
    const pw = $('loginPassword').value;
    if (!empNo) { return showLogin(); }
    if (!pw) return;
    const errEl = $('loginError'); if (errEl) errEl.hidden = true;
    const btn = $('btnUnlock'); if (btn) btn.disabled = true;
    try {
      // 서버에 비밀번호 검증 (기존 세션을 새 세션으로 갱신)
      await Api.login(empNo, pw);
      hideLogin();
      $('loginPassword').value = '';
      // 세션이 갱신되었을 수 있으니 폴링 재개 + 프로필 재로딩 (가벼운 처리)
      try { await afterLogin(); } catch (_) {}
    } catch (e) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = '비밀번호가 올바르지 않습니다.';
      }
      $('loginPassword').focus();
      $('loginPassword').select();
    } finally {
      if (btn) btn.disabled = false;
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

  // ── 설정 ──
  $('btnSettings').addEventListener('click', openSettingsModal);
  function openSettingsModal() {
    const s = state.settings;
    $('setServer').value = state.serverUrl;
    $('setNotifyFocus').checked = !!s.notifyOnFocus;
    $('setNotifySound').checked = s.notifySound !== false;
    $('setAutoStart').checked = !!s.autoStart;
    $('setMinTray').checked = s.minimizeToTray !== false;
    $('setLanguage').value = s.language || 'ko';
    $('setFontSize').value = s.fontSize || '15';
    document.querySelectorAll('input[name=theme]').forEach((r) => { r.checked = (r.value === (s.theme || 'auto')); });
    setSettingsTab('general');
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
  }
  $$('.settings-tab').forEach((b) => b.addEventListener('click', () => setSettingsTab(b.dataset.settingsTab)));
  $('btnSettingsSave').addEventListener('click', async () => {
    const s = state.settings;
    s.theme = (document.querySelector('input[name=theme]:checked') || {}).value || 'auto';
    s.fontSize = $('setFontSize').value;
    s.notifyOnFocus = $('setNotifyFocus').checked;
    s.notifySound = $('setNotifySound').checked;
    s.autoStart = $('setAutoStart').checked;
    s.minimizeToTray = $('setMinTray').checked;
    s.language = $('setLanguage').value;
    const newServer = $('setServer').value.trim();
    if (newServer && newServer !== state.serverUrl) {
      await blossom.settings.set('serverUrl', newServer);
      toast('서버 주소 변경됨. 재시작 후 적용됩니다.', 'success');
    }
    for (const k of Object.keys(s)) await blossom.settings.set(k, s[k]);
    if (blossom.app && blossom.app.setAutoStart) blossom.app.setAutoStart(!!s.autoStart);
    applyTheme();
    applyFontSize();
    closeModal('settingsModal');
    toast('설정 저장됨', 'success');
  });
  $('btnLogout').addEventListener('click', async () => {
    try { await Api.logout(); } catch (_) {}
    try { await blossom.credentials.clear(); } catch (_) {}
    stopPolling();
    closeModal('settingsModal');
    location.reload();
  });
  // v0.4.36: 고급 설정에서 저장된 접속 정보 전체 초기화
  (function bindAdvReset() {
    const btn = document.getElementById('btnAdvReset');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      if (!confirm('저장된 서버 주소, 자동로그인 정보, 모든 쿠키와 캐시를 삭제한 뒤 앱을 재시작합니다.\n계속하시겠습니까?')) return;
      try { await blossom.credentials.clear(); } catch (_) {}
      try {
        if (blossom.app && blossom.app.resetAll) await blossom.app.resetAll();
        else location.reload();
      } catch (_) { location.reload(); }
    });
  })();

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

  // v0.4.27: lockApp을 외부 IIFE에서도 사용하도록 노출
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
      if (typeof window.__blossomLockApp === 'function') window.__blossomLockApp();
      else console.error('lockApp not available');
    } catch (e) { console.error(e); }
  });
})();

// === CalendarView v1: 웹 Blossom /api/calendar/schedules 동기화 ===
window.CalendarView = (function () {
  const $ = (id) => document.getElementById(id);
  const state = { ym: null, items: [], me: null };
  let initialized = false;

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

  async function ensureMe() {
    if (state.me) return state.me;
    try { state.me = await Api.myProfile(); } catch (_) {}
    return state.me;
  }

  async function open() {
    if (!initialized) bind();
    initialized = true;
    if (!state.ym) state.ym = ymKey(new Date());
    await ensureMe();
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
        b.style.background = e.color_code || '#6366f1';
        b.textContent = e.title || '(제목 없음)';
        b.addEventListener('click', (ev) => { ev.stopPropagation(); openEdit(e); });
        cell.appendChild(b);
      });
      if (evts.length > MAX) {
        const more = document.createElement('div');
        more.className = 'cal-evt more';
        more.textContent = '+' + (evts.length - MAX) + ' 더보기';
        cell.appendChild(more);
      }
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
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes());
  }
  function openEdit(evt, defaultDate) {
    // v0.4.27: 채팅에서 직접 호출 시에도 저장/삭제 버튼이 동작하도록 bind 보장
    if (!initialized) { try { bind(); } catch (_) {} initialized = true; }
    const m = $('calEditModal'); if (!m) return;
    const titleEl = $('calEditTitle');
    const fT = $('calFTitle'), fS = $('calFStart'), fE = $('calFEnd'), fL = $('calFLocation'), fD = $('calFDesc'), fErr = $('calFError');
    const fSave = $('calFSave'), fDel = $('calFDelete');
    fErr.hidden = true; fErr.textContent = '';
    if (evt) {
      titleEl.textContent = '일정 수정';
      fT.value = evt.title || '';
      fS.value = evt.start_datetime ? fmtDT(new Date(evt.start_datetime)) : '';
      fE.value = evt.end_datetime ? fmtDT(new Date(evt.end_datetime)) : '';
      fL.value = evt.location || '';
      fD.value = evt.description || '';
      fDel.hidden = false;
      m.dataset.editId = String(evt.id);
    } else {
      titleEl.textContent = '일정 추가';
      const base = defaultDate || new Date();
      const s = new Date(base); s.setHours(9, 0, 0, 0);
      const e = new Date(base); e.setHours(10, 0, 0, 0);
      fT.value = ''; fS.value = fmtDT(s); fE.value = fmtDT(e);
      fL.value = ''; fD.value = '';
      fDel.hidden = true;
      delete m.dataset.editId;
    }
    // Attach datetime picker
    if (window.DateTimePicker) {
      window.DateTimePicker.attach(fS, function (v) {
        // 시작 변경 시 종료가 시작보다 빠르면 1시간 뒤로
        try {
          const sd = new Date(v.replace(' ', 'T') + ':00');
          const ed = new Date(fE.value.replace(' ', 'T') + ':00');
          if (!fE.value || ed <= sd) {
            const ne = new Date(sd.getTime() + 60*60*1000);
            fE.value = fmtDT(ne);
          }
        } catch (_) {}
      });
      window.DateTimePicker.attach(fE);
    }
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
    if (!title) { fErr.textContent = '제목을 입력하세요.'; fErr.hidden = false; return; }
    if (!startV || !endV) { fErr.textContent = '시작/종료 일시를 입력하세요.'; fErr.hidden = false; return; }
    // 입력 형식 'YYYY-MM-DD HH:MM' → ISO 'YYYY-MM-DDTHH:MM:00'
    const startISO = startV.replace(' ', 'T') + ':00';
    const endISO = endV.replace(' ', 'T') + ':00';
    const payload = {
      title: title,
      start_datetime: startISO,
      end_datetime: endISO,
      location: $('calFLocation').value.trim(),
      description: $('calFDesc').value,
      share_scope: 'PRIVATE',
      event_type: '기타',
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
      const orig = btnRefresh.textContent;
      btnRefresh.textContent = '↻ 동기화 중…';
      try { await reload(); } finally {
        btnRefresh.disabled = false;
        btnRefresh.textContent = orig;
      }
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

  function markdownToRichHtml(md) {
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
          const safe = src.replace(/"/g, '&quot;');
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
    let out = '';
    function walk(node) {
      if (node.nodeType === 3) { out += node.nodeValue; return; }
      if (node.nodeType !== 1) return;
      const tag = node.nodeName;
      if (tag === 'IMG') {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('data-src') || node.getAttribute('src') || '';
        out += '![' + alt + '](' + src + ')';
        return;
      }
      if (tag === 'BR') { out += '\n'; return; }
      if (tag === 'DIV' || tag === 'P') {
        if (out.length && out.charAt(out.length - 1) !== '\n') out += '\n';
        node.childNodes.forEach(walk);
        if (out.charAt(out.length - 1) !== '\n') out += '\n';
        return;
      }
      node.childNodes.forEach(walk);
    }
    root.childNodes.forEach(walk);
    return out.replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '');
  }

  async function open() {
    if (!initialized) bind();
    initialized = true;
    await loadGroups();
  }

  async function loadGroups() {
    try {
      const resp = await Api.listMemoGroups();
      state.groups = (resp && resp.items) || [];
    } catch (e) {
      console.warn('memo groups failed', e);
      state.groups = [];
    }
    if (!state.activeGroupId && state.groups.length) state.activeGroupId = state.groups[0].id;
    renderGroups();
    if (state.activeGroupId) await loadMemos();
  }

  async function loadMemos() {
    try {
      const resp = await Api.listMemos(state.activeGroupId, { pageSize: 200, sort: 'updated-desc' });
      state.memos = (resp && resp.items) || [];
    } catch (e) {
      console.warn('memos failed', e);
      state.memos = [];
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
    state.groups.forEach((g) => {
      const li = document.createElement('li');
      li.dataset.id = String(g.id);
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
        renderGroups();
        loadMemos();
      });
      // 우클릭 → 그룹 삭제 (기본보기 제외)
      li.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        if ((g.name || '').trim() === '기본보기') return;
        if (!confirm('"' + g.name + '" 그룹을 삭제하시겠습니까? (포함된 메모도 모두 삭제됩니다)')) return;
        Api.deleteMemoGroup(g.id).then(() => {
          if (state.activeGroupId === g.id) state.activeGroupId = null;
          loadGroups();
        });
      });
      ul.appendChild(li);
    });
  }

  function renderList() {
    const ul = $('memoList'); if (!ul) return;
    ul.innerHTML = '';
    state.memos.forEach((mm) => {
      const li = document.createElement('li');
      li.dataset.id = String(mm.id);
      if (mm.id === state.activeMemoId) li.classList.add('active');
      const t = document.createElement('div'); t.className = 'mli-title';
      t.textContent = mm.title || '(제목 없음)';
      const sn = document.createElement('div'); sn.className = 'mli-snippet';
      sn.textContent = (mm.body || '').replace(/<[^>]+>/g, '').slice(0, 100);
      const tm = document.createElement('div'); tm.className = 'mli-time';
      tm.textContent = mm.updated_at ? new Date(mm.updated_at).toLocaleString() : '';
      li.appendChild(t); li.appendChild(sn); li.appendChild(tm);
      li.addEventListener('click', () => {
        state.activeMemoId = mm.id;
        renderList(); renderEditor();
      });
      ul.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function renderMemoPreview(text) {
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
  function renderEditor() {
    const t = $('memoTitle'), b = $('memoBody'), st = $('memoStatus'), del = $('memoDeleteBtn');
    const mm = state.memos.find((x) => x.id === state.activeMemoId);
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
      editBtn.className = 'icon-btn memo-foot-btn';
      editBtn.title = '미리보기';
      editBtn.setAttribute('aria-label', '미리보기');
      editBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 5C7 5 2.7 8.1 1 12.5 2.7 16.9 7 20 12 20s9.3-3.1 11-7.5C21.3 8.1 17 5 12 5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>';
      saveBtn = document.createElement('button');
      saveBtn.id = 'memoSaveBtn';
      saveBtn.type = 'button';
      saveBtn.className = 'icon-btn icon-btn-primary memo-foot-btn';
      saveBtn.title = '저장';
      saveBtn.setAttribute('aria-label', '저장');
      saveBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7zm-5 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm3-10H5V5h10z"/></svg>';
      // 삭제 버튼 앞에 삽입 (자동 정렬)
      if (del && del.parentNode === foot) {
        foot.insertBefore(editBtn, del);
        foot.insertBefore(saveBtn, del);
      } else {
        foot.appendChild(editBtn);
        foot.appendChild(saveBtn);
      }
      editBtn.addEventListener('click', function () {
        const editing = rich.hidden === false;
        if (editing) {
          state.previewing = true;
          rich.hidden = true; preview.hidden = false;
          this.title = '편집';
          this.setAttribute('aria-label', '편집');
          this.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75l11-11-3.75-3.75-11 11zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
          preview.innerHTML = renderMemoPreview(b.value || '');
        } else {
          state.previewing = false;
          rich.hidden = false; preview.hidden = true;
          this.title = '미리보기';
          this.setAttribute('aria-label', '미리보기');
          this.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 5C7 5 2.7 8.1 1 12.5 2.7 16.9 7 20 12 20s9.3-3.1 11-7.5C21.3 8.1 17 5 12 5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>';
          setTimeout(() => rich.focus(), 10);
        }
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
      return;
    }
    if (editBtn) editBtn.style.display = '';
    if (saveBtn) saveBtn.style.display = '';
    t.disabled = false; b.disabled = false;
    rich.contentEditable = 'true';
    t.value = mm.title || '';
    // v0.4.31: 본문은 마크다운 그대로 유지하고, 리치 영역은 이미지 인라인으로 렌더
    const fullBody = mm.body || '';
    b.value = fullBody;
    rich.innerHTML = markdownToRichHtml(fullBody);
    rich.hidden = false; preview.hidden = true;
    if (editBtn) {
      editBtn.title = '미리보기';
      editBtn.setAttribute('aria-label', '미리보기');
      editBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 5C7 5 2.7 8.1 1 12.5 2.7 16.9 7 20 12 20s9.3-3.1 11-7.5C21.3 8.1 17 5 12 5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>';
    }
    state.previewing = false;
    st.textContent = mm.updated_at ? '저장됨 · ' + new Date(mm.updated_at).toLocaleString() : '';
    del.hidden = false;
    state.dirty = false;
  }

  function scheduleSave() {
    if (state.saveTimer) clearTimeout(state.saveTimer);
    const st = $('memoStatus'); if (st) st.textContent = '저장 중…';
    state.saveTimer = setTimeout(saveActive, 600);
  }

  async function saveActive() {
    const mm = state.memos.find((x) => x.id === state.activeMemoId);
    if (!mm) return;
    // v0.4.31: 리치 에디터에서 최신 마크다운을 추출
    const rich = document.getElementById('memoBodyRich');
    const b = $('memoBody');
    if (rich && rich.contentEditable === 'true') {
      b.value = richHtmlToMarkdown(rich);
    }
    const payload = { title: $('memoTitle').value, body: b.value };
    try {
      const resp = await Api.updateMemo(mm.id, payload);
      const it = resp && resp.item;
      if (it) {
        Object.assign(mm, it);
        renderList();
        const st = $('memoStatus'); if (st) st.textContent = '저장됨 · ' + new Date(it.updated_at || Date.now()).toLocaleString();
      }
    } catch (e) {
      const st = $('memoStatus'); if (st) st.textContent = '저장 실패: ' + (e && e.message || '');
    }
  }

  async function newMemo() {
    if (!state.activeGroupId) { alert('먼저 그룹을 선택하세요.'); return; }
    try {
      const resp = await Api.createMemo(state.activeGroupId, { title: '새 메모', body: '' });
      if (resp && resp.item) {
        state.activeMemoId = resp.item.id;
        await loadMemos();
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
    try {
      await Api.deleteMemo(mm.id);
      state.activeMemoId = null;
      await loadMemos();
    } catch (e) { alert('삭제 실패: ' + (e && e.message || '')); }
  }

  async function newGroup() {
    // v0.4.26: Electron prompt() 미지원 → 커스텀 모달 사용
    const name = await inputDialog('새 그룹 이름을 입력하세요', '');
    if (!name || !name.trim()) return;
    try {
      const resp = await Api.createMemoGroup(name.trim());
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
    // v0.4.28: 자동저장 제거 — 저장 버튼만 사용. 단 입력 시 상태만 표시
    if (t) t.addEventListener('input', () => { const st = $('memoStatus'); if (st) st.textContent = '변경됨 (저장 안 됨)'; state.dirty = true; });
    if (b) b.addEventListener('input', () => { const st = $('memoStatus'); if (st) st.textContent = '변경됨 (저장 안 됨)'; state.dirty = true; });
    const newBtn = $('memoNewBtn'); if (newBtn) newBtn.addEventListener('click', newMemo);
    const del = $('memoDeleteBtn'); if (del) del.addEventListener('click', deleteActive);
    const ng = $('memoNewGroupBtn'); if (ng) ng.addEventListener('click', newGroup);
  }

  return { open: open, save: saveActive };
})();
