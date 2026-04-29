// Chat UI interactions (Korean-localized)
(function(){
  // === SPA 재진입 시 이전 인스턴스의 setInterval 만 안전하게 정리 ===
  // setInterval/setTimeout 식별자를 const 로 가리지 않는다 (브라우저별로 const
  // shadowing + 호스트 함수 분리 호출 시 'Illegal invocation' 등 회귀가 발생).
  // 글로벌 인터벌 ID 배열만 노출해, 새 IIFE 진입 시 즉시 비운다.
  try {
    if (window.__blossomChatIntervals && window.__blossomChatIntervals.length) {
      window.__blossomChatIntervals.forEach(function(id){
        try { window.clearInterval(id); } catch(_) {}
      });
    }
  } catch(_) {}
  window.__blossomChatIntervals = [];
  // setInterval 호출을 후킹하지 않고, 명시적으로 등록한 인터벌만 추적한다.
  function __chatRegisterInterval(id){
    try { window.__blossomChatIntervals.push(id); } catch(_) {}
    return id;
  }

  const listEl = document.getElementById('chat-list');
  const messagesEl = document.getElementById('chat-messages');
  const messagesScrollbar = document.getElementById('messages-scrollbar');
  const messagesScrollbarThumb = messagesScrollbar ? messagesScrollbar.querySelector('.thumb') : null;
  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('btn-send');
  const searchEl = document.getElementById('chat-search');
  const tabs = Array.from(document.querySelectorAll('.chat-tab'));
  const attachBtn = document.getElementById('btn-attach');
  const fileInput = document.getElementById('file-input');
  const emojiBtn = document.getElementById('btn-emoji');
  const emojiPopover = document.getElementById('emoji-popover');
  const threadInputEl = document.querySelector('.thread-input');
  const favBtn = document.getElementById('btn-favorite');
  const leaveBtn = document.getElementById('btn-leave');
  const delBtn = document.getElementById('btn-delete');
  const addMemberBtn = document.getElementById('btn-add-member');
  const deptFilterWrap = document.getElementById('dept-filter-wrap');
  const deptFilterSelect = document.getElementById('dept-filter');
  const deleteModal = document.getElementById('chat-delete-modal');
  const deleteModalMessage = document.getElementById('chat-delete-message');
  const deleteModalConfirm = document.getElementById('chat-delete-confirm');
  const deleteModalCancel = document.getElementById('chat-delete-cancel');
  const deleteModalBackdrop = document.getElementById('chat-delete-backdrop');
  const infoModal = document.getElementById('chat-info-modal');
  const infoModalTitle = document.getElementById('chat-info-title');
  const infoModalMessage = document.getElementById('chat-info-message');
  const infoModalIcon = document.getElementById('chat-info-icon');
  const infoModalConfirm = document.getElementById('chat-info-confirm');
  const infoModalBackdrop = document.getElementById('chat-info-backdrop');
  const searchModal = document.getElementById('chat-search-modal');
  const searchModalBackdrop = document.getElementById('chat-search-backdrop');
  const searchModalClose = document.getElementById('chat-search-close');
  const searchModalInput = document.getElementById('chat-search-input');
  const searchModalStatus = document.getElementById('chat-search-status');
  const searchModalResults = document.getElementById('chat-search-results');
  const searchModalScopeBtns = document.querySelectorAll('.chat-search-scope-btn');
  const btnMsgSearch = document.getElementById('btn-msg-search');
  // No toast container; member-add notices render as plain text in the message list

  const profile = {
    nameEl: document.getElementById('profile-name'),
    lastEl: document.getElementById('profile-last'),
    emailEl: document.getElementById('profile-email'),
    extPhoneEl: document.getElementById('profile-ext-phone'),
    mobilePhoneEl: document.getElementById('profile-mobile-phone'),
    locationEl: document.getElementById('profile-location'),
    infoWrap: document.getElementById('profile-info'),
    membersWrap: document.getElementById('profile-members'),
    membersList: document.getElementById('member-list'),
    avatarEl: document.getElementById('profile-avatar'),
  };
  const initialProfileDeptLabel = profile.locationEl?.textContent?.trim() || '';
  const profileEmailBtn = document.getElementById('profile-email-btn');
  const thread = {
    nameEl: document.getElementById('thread-name'),
    statusEl: document.getElementById('thread-status'),
    avatarEl: document.getElementById('thread-avatar')
  };
  const threadContainer = document.querySelector('.chat-thread');

  const fallbackAvatar = '/static/image/center/avatar-default.svg';
  const avatarIconPool = [
    '/static/image/svg/profil/001-boy.svg',
    '/static/image/svg/profil/002-girl.svg',
    '/static/image/svg/profil/003-boy.svg',
    '/static/image/svg/profil/004-girl.svg',
    '/static/image/svg/profil/005-man.svg',
    '/static/image/svg/profil/006-girl.svg',
    '/static/image/svg/profil/007-boy.svg',
    '/static/image/svg/profil/008-girl.svg',
    '/static/image/svg/profil/009-boy.svg',
    '/static/image/svg/profil/010-girl.svg',
    '/static/image/svg/profil/011-man.svg',
    '/static/image/svg/profil/012-girl.svg',
    '/static/image/svg/profil/013-man.svg',
    '/static/image/svg/profil/014-girl.svg',
    '/static/image/svg/profil/015-boy.svg',
    '/static/image/svg/profil/016-girl.svg',
    '/static/image/svg/profil/017-boy.svg',
    '/static/image/svg/profil/018-girl.svg',
    '/static/image/svg/profil/019-boy.svg',
    '/static/image/svg/profil/020-girl.svg',
    '/static/image/svg/profil/free-icon-bussiness-man.svg',
  ];

  const chatConfig = resolveChatConfig();
  const state = {
    isLive: false,
    currentUserId: Number.isFinite(parseInt(chatConfig.profileId, 10)) ? parseInt(chatConfig.profileId, 10) : null,
    currentUserImage: chatConfig.userImage || '',
    activeDirectoryKey: null,
  };
  const SELF_CONV_PREFIX = 'self-';
  const FAVORITES_STORAGE_KEY = 'chat-favorites-v1';
  const TOMBSTONE_STORAGE_KEY = 'chat-tombstones-v1';
  const locallyDeletedRoomIds = new Set();
  // If a user deletes a conversation, we also tombstone the *contact key* so
  // colleagues-tab synthetic chats can never reuse old cached messages.
  const locallyDeletedContactKeys = new Set();
  const favoriteStore = {
    convIds: new Set(),
  };
  const POLL_INTERVAL_MS = 1000;
  const MESSAGE_FETCH_LIMIT = 200;
  const MESSAGE_FETCH_ORDER = 'desc';
  const UPLOADS_API_URL = '/api/uploads';
  let liveRefreshTimer = null;
  let lastRenderedFilter = 'all';
  const messageLoadState = new Map();
  const messageRefreshTick = new Map();
  const externalDirectory = new Map();
  let directoryEntries = [];
  let currentDeptFilter = 'ALL';
  const expandedDepartments = new Set();
  let lastOwnDeptOwnerKey = null;
  const DND_MIME = 'application/x-chat-item';
  let hydrateRefreshScheduled = false;
  let pendingDeleteId = null;

  function syntheticConversationIdForKey(key){
    if (!key) return null;
    return `dir-${key}`;
  }

  function removeConversationLocal(convId){
    if (!convId) return;
    const idx = conversations.findIndex(c => c.id === convId);
    if (idx >= 0) {
      conversations.splice(idx, 1);
    }
    delete messageMap[convId];
    favoriteStore.convIds.delete(convId);
  }

  function tombstoneContactForConversation(conv){
    try {
      const contact = primaryContact(conv);
      const key = directoryKeyFor(contact);
      if (key) {
        locallyDeletedContactKeys.add(key);
        persistTombstones();
      }
      return key;
    } catch (_) {
      return null;
    }
  }

  function rememberDeletedRoomId(id){
    if (!id) return;
    if (!locallyDeletedRoomIds.has(id)) {
      locallyDeletedRoomIds.add(id);
      persistTombstones();
    }
  }

  function forgetDeletedRoomId(id){
    if (!id) return;
    if (locallyDeletedRoomIds.delete(id)) persistTombstones();
  }

  function loadTombstones(){
    const storage = getStorage();
    if (!storage) return;
    try {
      const raw = storage.getItem(TOMBSTONE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.roomIds)) {
        parsed.roomIds.forEach(id => { if (id) locallyDeletedRoomIds.add(id); });
      }
      if (parsed && Array.isArray(parsed.contactKeys)) {
        parsed.contactKeys.forEach(k => { if (k) locallyDeletedContactKeys.add(k); });
      }
    } catch (err) {
      console.warn('[chat] Failed to read tombstones from storage', err);
    }
  }

  function persistTombstones(){
    const storage = getStorage();
    if (!storage) return;
    try {
      const payload = {
        roomIds: Array.from(locallyDeletedRoomIds),
        contactKeys: Array.from(locallyDeletedContactKeys),
      };
      storage.setItem(TOMBSTONE_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('[chat] Failed to persist tombstones', err);
    }
  }

  function purgeConversationHistory(convId){
    if (!convId) return;
    delete messageMap[convId];
    const conv = conversations.find(c => c.id === convId);
    if (conv) {
      conv.preview = '';
      conv.time = '';
      conv.displayTime = '';
      conv.unread = 0;
      conv.previewSignature = computePreviewSignature('', conv.lastInteracted || 0);
    }
  }

  function purgeSyntheticForContact(contact){
    const key = directoryKeyFor(contact);
    const syntheticId = syntheticConversationIdForKey(key);
    if (!syntheticId) return;
    purgeConversationHistory(syntheticId);
    removeConversationLocal(syntheticId);
  }

  function isSelfUserId(candidate){
    if (candidate == null || state.currentUserId == null) return false;
    const num = Number(candidate);
    if (!Number.isFinite(num)) return false;
    return num === Number(state.currentUserId);
  }

  function isSelfIdentity(member){
    if (!member) return false;
    if (isSelfUserId(member.id)) return true;
    const memberEmp = String(member.empNo || member.emp_no || '').trim().toLowerCase();
    const selfEmp = String(chatConfig.empNo || '').trim().toLowerCase();
    if (memberEmp && selfEmp && memberEmp === selfEmp) return true;
    const memberName = String(member.name || '').trim().toLowerCase();
    const selfName = String(chatConfig.userName || '').trim().toLowerCase();
    if (memberName && selfName && memberName === selfName) return true;
    return false;
  }

  function getStorage(){
    try {
      if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    } catch (_) {}
    return null;
  }

  function loadFavoriteStore(){
    const storage = getStorage();
    if (!storage) return;
    try {
      const raw = storage.getItem(FAVORITES_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.convIds)) {
        parsed.convIds.forEach(id => {
          if (typeof id === 'string' && id) favoriteStore.convIds.add(id);
        });
      }
    } catch (err) {
      console.warn('[chat] Failed to read favorites from storage', err);
    }
  }

  function persistFavoriteStore(){
    const storage = getStorage();
    if (!storage) return;
    try {
      const payload = {
        convIds: Array.from(favoriteStore.convIds),
      };
      storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('[chat] Failed to persist favorites', err);
    }
  }

  function syncFavoriteFlag(conv){
    if (!conv) return;
    conv.fav = favoriteStore.convIds.has(conv.id);
  }

  function applyFavoriteFlags(){
    const knownIds = new Set(conversations.map(c => c.id));
    favoriteStore.convIds.forEach(id => {
      if (!knownIds.has(id)) favoriteStore.convIds.delete(id);
    });
    conversations.forEach(conv => syncFavoriteFlag(conv));
  }

  function setConversationFavorite(conv, shouldFavorite){
    if (!conv) return;
    if (shouldFavorite) favoriteStore.convIds.add(conv.id);
    else favoriteStore.convIds.delete(conv.id);
    conv.fav = !!shouldFavorite;
    if (conv.fav && !conv.favoritedAt) conv.favoritedAt = Date.now();
    persistFavoriteStore();
  }

  loadFavoriteStore();
  loadTombstones();

  function setDragPayload(evt, payload, fallback){
    if (!evt || !evt.dataTransfer) return;
    try {
      evt.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
    } catch (_) {}
    if (fallback) {
      try { evt.dataTransfer.setData('text/plain', fallback); } catch (_) {}
    }
  }

  function readDragPayload(evt){
    if (!evt || !evt.dataTransfer) return null;
    let raw = '';
    try { raw = evt.dataTransfer.getData(DND_MIME); } catch (_) { raw = ''; }
    if (!raw) {
      try { raw = evt.dataTransfer.getData('text/plain'); } catch (_) { raw = ''; }
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {
      return { type: 'conversation', id: raw };
    }
    return null;
  }

  function placeholderAvatar(seed){
    if (!avatarIconPool.length) return fallbackAvatar;
    const label = (seed || '').trim() || 'guest';
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
      hash = (hash * 33 + label.charCodeAt(i)) >>> 0;
    }
    return avatarIconPool[hash % avatarIconPool.length] || fallbackAvatar;
  }

  function resolveAvatarSrc(src, seed){
    const trimmed = (src || '').trim();
    if (trimmed) return trimmed;
    return placeholderAvatar(seed);
  }

  let conversations = [];
  let messageMap = {};
  let activeId = null;
  let lastRoomsSignature = null;
  let lastListRenderSignature = null;

  function computeRoomsSignature(list){
    if (!Array.isArray(list) || !list.length) return '';
    return list.map(conv => {
      const baseSig = conv.previewSignature || computePreviewSignature(conv.preview || '', conv.lastInteracted || 0);
      const fav = conv.fav ? 1 : 0;
      const unread = Number.isFinite(Number(conv.unread)) ? Number(conv.unread) : 0;
      const roomId = conv.roomId != null ? String(conv.roomId) : '';
      return `${conv.id}|${roomId}|${baseSig}|${unread}|${fav}`;
    }).join(';;');
  }
  function getActiveFilter(){
    const activeTab = tabs.find(t => t.classList.contains('active')) || tabs[0];
    return (activeTab && activeTab.getAttribute('data-filter')) || 'all';
  }

  function resolveChatConfig(){
    const el = document.getElementById('chat-config');
    if (!el) {
      return { roomsUrl: '/api/chat/rooms', apiRoot: '/api/chat', profileId: null, userName: '', empNo: '', userImage: '' };
    }
    const roomsUrlAttr = el.getAttribute('data-rooms-url') || '/api/chat/rooms';
    const roomsCreateUrlAttr = el.getAttribute('data-rooms-create-url') || '/api/chat/rooms';
    const apiRootAttr = el.getAttribute('data-api-root');
    const directoryUrlAttr = el.getAttribute('data-directory-url') || '/api/chat/directory';
    const profileIdAttr = parseInt(el.getAttribute('data-profile-id'), 10);
    const userDeptAttr = el.getAttribute('data-user-dept') || '';
    const userImageAttr = el.getAttribute('data-user-image') || '';
    const cfg = {
      roomsUrl: roomsUrlAttr,
      roomsCreateUrl: roomsCreateUrlAttr,
      apiRoot: apiRootAttr || deriveApiRoot(roomsUrlAttr),
      directoryUrl: directoryUrlAttr,
      profileId: Number.isFinite(profileIdAttr) ? profileIdAttr : null,
      userName: el.getAttribute('data-user-name') || '',
      empNo: el.getAttribute('data-user-emp-no') || '',
      userDept: userDeptAttr || '',
      userImage: userImageAttr || '',
    };
    if (typeof el.remove === 'function') {
      el.remove();
    } else {
      el.setAttribute('hidden', 'true');
    }
    return cfg;
  }

  function deriveApiRoot(roomsUrl){
    if (!roomsUrl) return '/api/chat';
    try {
      const url = new URL(roomsUrl, window.location.origin);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        return `/${parts.slice(0, parts.length - 1).join('/')}`;
      }
    } catch (_) {
      const tokens = roomsUrl.split('?')[0].split('/').filter(Boolean);
      if (tokens.length >= 2) {
        return `/${tokens.slice(0, tokens.length - 1).join('/')}`;
      }
    }
    return '/api/chat';
  }

  function createEl(tag, cls, html){
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }

  // ---- 안전한 메시지 텍스트 렌더링 (코드블럭 + 인라인 코드 지원) ----
  // 입력 텍스트를 escape 한 뒤 ```lang ... ``` 와 `code` 를 DOM 노드로 변환해 컨테이너에 추가한다.
  function renderMessageText(container, rawText){
    if (!container) return;
    const text = (rawText == null) ? '' : String(rawText);
    if (!text.length) return;
    // 1) 펜스드 코드블럭 분리: ```lang\n...\n```
    const fenceRe = /```([A-Za-z0-9_+\-]*)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;
    function appendInline(segment){
      if (!segment) return;
      // 인라인 코드 처리
      const inlineRe = /`([^`\n]+)`/g;
      let li = 0, im;
      while ((im = inlineRe.exec(segment)) !== null) {
        if (im.index > li) appendPlainWithBreaks(container, segment.slice(li, im.index));
        const codeEl = document.createElement('code');
        codeEl.className = 'msg-inline-code';
        codeEl.textContent = im[1];
        container.appendChild(codeEl);
        li = im.index + im[0].length;
      }
      if (li < segment.length) appendPlainWithBreaks(container, segment.slice(li));
    }
    function appendPlainWithBreaks(parent, str){
      const lines = str.split('\n');
      lines.forEach(function(line, idx){
        if (idx > 0) parent.appendChild(document.createElement('br'));
        if (line.length) parent.appendChild(document.createTextNode(line));
      });
    }
    while ((match = fenceRe.exec(text)) !== null) {
      if (match.index > lastIndex) appendInline(text.slice(lastIndex, match.index));
      const lang = (match[1] || '').trim();
      const code = match[2].replace(/\n$/, '');
      const pre = document.createElement('pre');
      pre.className = 'msg-codeblock' + (lang ? ' lang-' + lang.toLowerCase() : '');
      const codeEl = document.createElement('code');
      codeEl.textContent = code;
      pre.appendChild(codeEl);
      // 복사 버튼
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'msg-codeblock-copy';
      copyBtn.textContent = '복사';
      copyBtn.setAttribute('aria-label', '코드 복사');
      copyBtn.addEventListener('click', function(ev){
        ev.stopPropagation();
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code);
          } else {
            const ta = document.createElement('textarea');
            ta.value = code;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
          const prev = copyBtn.textContent;
          copyBtn.textContent = '복사됨';
          setTimeout(function(){ copyBtn.textContent = prev; }, 1200);
        } catch (_){}
      });
      pre.appendChild(copyBtn);
      if (lang) {
        const tag = document.createElement('span');
        tag.className = 'msg-codeblock-lang';
        tag.textContent = lang;
        pre.appendChild(tag);
      }
      container.appendChild(pre);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) appendInline(text.slice(lastIndex));
  }

  function avatarImg(src, alt, size='md'){
    const node = document.createElement('div');
    const sizeClass = size === 'sm' ? ' avatar-sm' : (size === 'lg' ? ' avatar-lg' : '');
    node.className = `avatar${sizeClass}`;
    const img = document.createElement('img');
    img.alt = alt || 'avatar';
    img.src = resolveAvatarSrc(src, alt);
    img.onerror = () => {
      img.onerror = null;
      img.src = fallbackAvatar;
    };
    node.appendChild(img);
    return node;
  }

  // 채널 전용 아이콘 (SVG mask로 #6366F1 제니용 적용)
  const CHANNEL_ICON_SRC = '/static/image/svg/chat/free-icon-font-channel.svg';
  const CHANNEL_ICON_COLOR = '#6366F1';
  function _applyChannelMask(el, ratio){
    el.style.background = CHANNEL_ICON_COLOR;
    const url = `url('${CHANNEL_ICON_SRC}')`;
    el.style.webkitMask = url + ' no-repeat center / ' + ratio;
    el.style.mask = url + ' no-repeat center / ' + ratio;
  }
  function channelIconNode(size='md'){
    const sizeClass = size === 'sm' ? ' avatar-sm' : (size === 'lg' ? ' avatar-lg' : '');
    const node = document.createElement('div');
    node.className = 'avatar avatar-channel' + sizeClass;
    _applyChannelMask(node, '60% 60%');
    return node;
  }
  function isChannelConversation(c){
    return !!(c && String(c.roomType || '').toUpperCase() === 'CHANNEL');
  }
  function renderChannelAvatarInto(container){
    if (!container) return;
    container.innerHTML = '';
    container.classList.remove('has-image');
    container.classList.add('avatar-channel');
    _applyChannelMask(container, '50% 50%');
  }

  function renderAvatarInto(container, src, label){
    if (!container) return;
    container.innerHTML = '';
    container.classList.add('has-image');
    container.classList.remove('avatar-token');
    container.classList.remove('avatar-channel');
    container.style.background = '';
    container.style.mask = '';
    container.style.webkitMask = '';
    const img = document.createElement('img');
    img.alt = label || 'avatar';
    img.src = resolveAvatarSrc(src, label);
    img.onerror = () => {
      img.onerror = null;
      img.src = fallbackAvatar;
    };
    container.appendChild(img);
  }

  function getRoomsUrl(){
    return (chatConfig.roomsUrl || '/api/chat/rooms').split('?')[0];
  }

  // v1 방 생성/관리 endpoint. v2 conversations(GET 전용)와 분리.
  function getRoomsCreateUrl(){
    return (chatConfig.roomsCreateUrl || '/api/chat/rooms').split('?')[0];
  }

  function buildRoomUrl(roomId){
    const base = getRoomsUrl().replace(/\/+$/, '');
    return `${base}/${roomId}`;
  }

  function formatListTime(isoString){
    if (!isoString) return '';
    try {
      const ms = typeof isoString === 'string' ? parseTimestampMs(isoString) : null;
      const date = ms != null ? new Date(ms) : (typeof isoString === 'string' ? new Date(isoString) : isoString);
      return date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch (_) {
      return '';
    }
  }

  function formatClockLabel(isoString){
    if (!isoString) return '';
    try {
      const ms = typeof isoString === 'string' ? parseTimestampMs(isoString) : null;
      const date = ms != null ? new Date(ms) : (typeof isoString === 'string' ? new Date(isoString) : isoString);
      return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }

  // Signature is used for detecting new messages between room list polls.
  // It must be stable across different time-formatting codepaths.
  function computePreviewSignature(preview, lastInteracted){
    const stamp = Number.isFinite(Number(lastInteracted)) ? Number(lastInteracted) : 0;
    return [preview || '', stamp].join('__');
  }

  function parseTimestampMs(raw){
    if (!raw) return null;
    let text = String(raw).trim();
    if (!text) return null;
    // Accept common Python formats ("YYYY-MM-DD HH:MM:SS(.ffffff)")
    // and normalize to ISO.
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text)) {
      text = text.replace(' ', 'T');
    }
    // Python isoformat() often yields microseconds (6 digits) and no timezone,
    // which some browsers parse inconsistently. Normalize to millisecond precision.
    let normalized = text.replace(
      /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.(\d{3})\d+)?/,
      (_m, head, _frac, ms) => (ms ? `${head}.${ms}` : head)
    );

    // If the timestamp has no explicit timezone, assume UTC.
    // Server uses utcnow() but serializes without tzinfo, which otherwise gets
    // interpreted as local time in the browser.
    const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized);
    if (!hasTz && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(normalized)) {
      normalized += 'Z';
    }

    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeMemberFromApi(member){
    if (!member) return null;
    if (typeof member === 'object' && member.user) {
      const user = member.user || {};
      const uid = member.user_id || user.id || member.id || null;
      const extPhone = member.ext_phone || member.extPhone || user.ext_phone || user.extPhone || '';
      const mobilePhone = member.mobile_phone || member.mobilePhone || user.mobile_phone || user.mobilePhone || member.phone || '';
      const empNoRaw = member.emp_no || member.empNo || user.emp_no || user.empNo || '';
      const empNo = empNoRaw ? String(empNoRaw) : '';
      const avatarSrc = resolveAvatarSrc(member.avatar || member.profile_image || user.profile_image || user.avatar_url, user.name || member.name);
      const candidate = {
        id: uid,
        empNo,
        name: user.name || member.name || '',
      };
      return {
        id: uid,
        name: user.name || '',
        department: member.department || user.department || '',
        email: member.email || user.email || '',
        avatar: avatarSrc,
        extPhone,
        mobilePhone,
        empNo,
        isSelf: isSelfIdentity(candidate),
      };
    }
    if (typeof member === 'object' && member.name) {
      const extPhone = member.ext_phone || member.extPhone || member.phone_ext || '';
      const mobilePhone = member.mobile_phone || member.mobilePhone || member.phone || '';
      const empNoRaw = member.emp_no || member.empNo || '';
      const empNo = empNoRaw ? String(empNoRaw) : '';
      return {
        id: member.id || null,
        name: member.name,
        department: member.department || member.dept || '',
        email: member.email || '',
        avatar: resolveAvatarSrc(member.avatar, member.name),
        extPhone,
        mobilePhone,
        empNo,
        isSelf: !!member.isSelf || isSelfIdentity(member),
      };
    }
    return null;
  }

  function resolveMemberMeta(token){
    if (!token) return null;
    if (typeof token === 'object') {
      return normalizeMemberFromApi(token);
    }
    const ref = conversations.find(c => c.id === token && !Array.isArray(c.groupAvatars));
    if (!ref) return null;
    const contact = (ref.contact && typeof ref.contact === 'object') ? ref.contact : null;
    const derivedId = contact && contact.id != null ? contact.id : (ref.contact_id != null ? ref.contact_id : null);
    return {
      id: derivedId != null ? derivedId : ref.id,
      name: (contact && contact.name) || ref.name,
      department: (contact && contact.department) || ref.dept || ref.department || '',
      email: (contact && contact.email) || ref.email || '',
      avatar: resolveAvatarSrc((contact && contact.avatar) || ref.avatar, (contact && contact.name) || ref.name),
      extPhone: (contact && (contact.extPhone || contact.ext_phone || contact.phone_ext)) || ref.extPhone || '',
      mobilePhone: (contact && (contact.mobilePhone || contact.mobile_phone || contact.phone)) || ref.mobilePhone || '',
      isSelf: !!(contact && contact.isSelf),
    };
  }

  function selectPrimaryMember(members){
    if (!Array.isArray(members) || !members.length) return null;
    const nonSelf = members.find(m => !m?.isSelf);
    return nonSelf || members[0];
  }

  function isPlaceholderName(value){
    const text = String(value == null ? '' : value).trim();
    if (!text) return true;
    const lowered = text.toLowerCase();
    return lowered === '-' || lowered === '—' || lowered === 'null' || lowered === 'none' || lowered === 'undefined';
  }

  function displayNameForConversation(conv){
    if (!conv) return '';
    const isGroup = isGroupConversation(conv);
    const contact = isGroup ? null : primaryContact(conv);
    const contactName = contact && !isPlaceholderName(contact.name) ? String(contact.name).trim() : '';
    const roomName = !isPlaceholderName(conv.name) ? String(conv.name).trim() : '';
    if (isGroup) return roomName || '그룹 채팅';
    return contactName || roomName || '대화';
  }

  function normalizeRoomFromApi(room){
    if (!room || typeof room !== 'object') return null;
    const isGroup = String(room.room_type || '').toUpperCase() === 'GROUP';
    const members = Array.isArray(room.members) ? room.members.map(normalizeMemberFromApi).filter(Boolean) : [];
    const contact = isGroup ? null : selectPrimaryMember(members);
    const rawRoomName = !isPlaceholderName(room.room_name) ? String(room.room_name).trim() : '';
    const contactName = contact && !isPlaceholderName(contact.name) ? String(contact.name).trim() : '';
    const name = isGroup
      ? (rawRoomName || '그룹 채팅')
      : (contactName || rawRoomName || '대화');
    const lastStamp = room.last_message_at || room.updated_at || room.created_at;
    const convId = `room-${room.id}`;
    const lastInteracted = (lastStamp ? parseTimestampMs(lastStamp) : null) ?? 0;
    return {
      id: convId,
      roomId: room.id,
      roomType: room.room_type || 'DIRECT',
      createdByUserId: room.created_by_user_id ?? room.createdByUserId ?? null,
      name,
      preview: room.last_message_preview || '',
      time: formatListTime(lastStamp) || '',
      displayTime: formatListTime(lastStamp) || '',
      lastInteracted,
      unread: Number(room.viewer_unread_count) || 0,
      lastReadMessageId: room.viewer_last_read_message_id || null,
      fav: false,
      friend: !isGroup,
      members: members.length ? members : (contact ? [contact] : []),
      contact,
      email: contact?.email || '',
      dept: contact?.department || '',
      avatar: resolveAvatarSrc(contact?.avatar || room.avatar, contact?.name || name),
      groupAvatars: isGroup ? members.slice(0, 3).map(m => resolveAvatarSrc(m.avatar, m?.name || name)) : null,
      previewSignature: computePreviewSignature(room.last_message_preview || '', lastInteracted),
    };
  }

  function mapMessageFromApi(message){
    if (!message) return null;
    const when = message.created_at || message.updated_at;
    const createdAt = when ? parseTimestampMs(when) : null;
    const isSystem = !!(message.is_system || String(message.content_type || '').toUpperCase() === 'SYSTEM');
    const isMine = !isSystem && state.currentUserId != null && message.sender_user_id === state.currentUserId;
    const files = Array.isArray(message.files)
      ? message.files.map(f => ({
          id: f.id,
          name: f.original_name || f.name || '파일',
          size: f.file_size,
          url: f.file_path || f.download_url || f.raw_url || f.url || '',
        }))
      : [];
    return {
      id: message.id,
      who: isSystem ? 'system' : (isMine ? 'out' : 'in'),
      text: message.content_text || message.content || message.body || '',
      time: formatClockLabel(when) || '',
      createdAt,
      files: files.length ? files : undefined,
      unreadCount: typeof message.unread_count === 'number' ? message.unread_count : null,
      pinned: !!message.is_pinned,
      reactions: Array.isArray(message.reactions) ? message.reactions.map(function(r){
        return {
          emoji: r.emoji,
          count: Number(r.count) || 0,
          mine: !!r.mine,
          userIds: Array.isArray(r.user_ids) ? r.user_ids.slice() : [],
        };
      }) : [],
    };
  }

  function directoryKeyFor(member){
    if (!member) return null;
    if (member.id != null) return `user-${member.id}`;
    if (member.empNo) return `emp-${member.empNo}`;
    if (member.email) return `email-${member.email.toLowerCase()}`;
    if (member.name && member.department) return `namedep-${member.name}-${member.department}`;
    if (member.name) return `name-${member.name}`;
    return null;
  }

  function lookupDirectoryEntry(member){
    const key = directoryKeyFor(member);
    if (!key) return null;
    if (externalDirectory.has(key)) return externalDirectory.get(key);
    const fromLocal = directoryEntries.find(entry => entry.key === key);
    return fromLocal || null;
  }

  function enrichMemberProfile(member){
    if (!member) return member;
    const entry = lookupDirectoryEntry(member);
    if (!entry) return member;
    if (entry.avatar) member.avatar = entry.avatar;
    if (entry.department) member.department = entry.department;
    if (entry.email) member.email = entry.email;
    if (entry.extPhone) member.extPhone = entry.extPhone;
    if (entry.mobilePhone) member.mobilePhone = entry.mobilePhone;
    return member;
  }

  function displayDeptName(raw){
    const cleaned = raw && String(raw).trim();
    return cleaned && cleaned.length ? cleaned : '소속 미지정';
  }

  function defaultSelfName(){
    return (chatConfig.userName || '').trim() || '나';
  }

  function defaultSelfDept(){
    return displayDeptName(chatConfig.userDept || initialProfileDeptLabel || '');
  }

  function resolveSelfAvatar(){
    return resolveAvatarSrc(state.currentUserImage || chatConfig.userImage || '', defaultSelfName());
  }

  function syncHeaderAvatarWithSelf(){
    const accountBtn = document.getElementById('btn-account');
    if (!accountBtn) return;
    const img = accountBtn.querySelector('img.header-avatar-icon');
    if (!img) return;
    img.src = resolveSelfAvatar();
  }

  function requestHydrateRefresh(){
    if (hydrateRefreshScheduled) return;
    hydrateRefreshScheduled = true;
    const refreshOptions = state.isLive ? { silent: true } : {};
    setTimeout(()=>{
      hydrateRefreshScheduled = false;
      hydrateFromApi(refreshOptions);
    }, 50);
  }

  function tryBindCurrentUserIdFromDirectory(){
    if (state.currentUserId != null) return false;
    const empTarget = (chatConfig.empNo || '').trim();
    const nameTarget = (chatConfig.userName || '').trim().toLowerCase();
    let match = null;
    if (empTarget) {
      match = directoryEntries.find(entry => (entry.empNo || '').trim() === empTarget);
    }
    if (!match && nameTarget) {
      match = directoryEntries.find(entry => (entry.name || '').trim().toLowerCase() === nameTarget);
    }
    if (!match && chatConfig.userDept) {
      const deptTarget = displayDeptName(chatConfig.userDept);
      const candidates = directoryEntries.filter(entry => displayDeptName(entry.department) === deptTarget);
      if (candidates.length === 1) {
        match = candidates[0];
      }
    }
    if (match && Number.isFinite(Number(match.userId))) {
      state.currentUserId = Number(match.userId);
      chatConfig.profileId = state.currentUserId;
      return true;
    }
    return false;
  }

  function normalizeDirectoryUser(record){
    if (!record) return null;
    const member = {
      id: record.id != null ? record.id : record.user_id,
      empNo: record.emp_no || record.empNo,
      name: record.name || record.nickname || '',
      department: record.department || record.dept || '',
      email: record.email || '',
      avatar: resolveAvatarSrc(record.profile_image || record.avatar, record.name || record.nickname),
      extPhone: record.ext_phone || record.extPhone || '',
      mobilePhone: record.mobile_phone || record.mobilePhone || '',
      job: record.job || '',
    };
    const dept = (member.department || '').trim();
    if (!dept) return null;
    const key = directoryKeyFor(member);
    if (!key) return null;
    const isSelf = isSelfUserId(member.id);
    return {
      key,
      userId: member.id,
      empNo: member.empNo ? String(member.empNo) : '',
      name: member.name,
      department: dept,
      email: member.email,
      avatar: member.avatar,
      extPhone: member.extPhone || '',
      mobilePhone: member.mobilePhone || '',
      job: member.job || '',
      isSelf,
    };
  }

  function rebuildDirectory(){
    const registry = new Map();
    externalDirectory.forEach(entry => {
      registry.set(entry.key, {
        key: entry.key,
        userId: entry.userId,
        empNo: entry.empNo ? String(entry.empNo) : '',
        name: entry.name,
        department: entry.department,
        email: entry.email,
        avatar: resolveAvatarSrc(entry.avatar, entry.name),
        extPhone: entry.extPhone || '',
        mobilePhone: entry.mobilePhone || '',
        job: entry.job || '',
        convIds: new Set(),
        preferredConvId: null,
        isFavorite: false,
        isSelf: !!entry.isSelf,
      });
    });
    conversations.forEach(conv => {
      const members = materializeMembers(conv)
        .filter(m => !m?.isSelf)
        .filter(m => !!((m?.department || '').trim()));
      const isGroupConv = Array.isArray(conv.groupAvatars);
      members.forEach(member => {
        const key = directoryKeyFor(member);
        if (!key) return;
        const dept = (member.department || '').trim();
        if (!dept) return;
        if (!registry.has(key)) {
          registry.set(key, {
            key,
            userId: member.id,
            empNo: member.empNo ? String(member.empNo) : '',
            name: member.name || '',
            department: dept,
            email: member.email || '',
            avatar: resolveAvatarSrc(member.avatar, member.name),
            extPhone: member.extPhone || '',
            mobilePhone: member.mobilePhone || '',
            job: member.job || '',
            convIds: new Set(),
            preferredConvId: null,
            isFavorite: false,
            isSelf: !!member.isSelf,
          });
        }
        const entry = registry.get(key);
        if (!entry.empNo && member.empNo) {
          entry.empNo = String(member.empNo);
        }
        entry.convIds.add(conv.id);
        if (!isGroupConv && !entry.preferredConvId) {
          entry.preferredConvId = conv.id;
        }
        entry.isFavorite = entry.isFavorite || !!conv.fav;
        if (member.isSelf) entry.isSelf = true;
      });
    });
    directoryEntries = Array.from(registry.values()).map(entry => {
      const ids = Array.from(entry.convIds);
      const orderedIds = entry.preferredConvId
        ? [entry.preferredConvId, ...ids.filter(id => id !== entry.preferredConvId)]
        : ids;
      return {
        key: entry.key,
        userId: entry.userId,
        empNo: entry.empNo || '',
        name: entry.name,
        department: entry.department,
        email: entry.email,
        avatar: entry.avatar,
        extPhone: entry.extPhone || '',
        mobilePhone: entry.mobilePhone || '',
        job: entry.job || '',
        isFavorite: entry.isFavorite,
        convIds: orderedIds,
        isSelf: !!entry.isSelf,
      };
    });
    ensureSelfDirectoryEntry();
    directoryEntries.sort((a, b) => {
      const deptA = displayDeptName(a.department);
      const deptB = displayDeptName(b.department);
      if (deptA === deptB) return a.name.localeCompare(b.name, 'ko-KR');
      return deptA.localeCompare(deptB, 'ko-KR');
    });
    primeOwnDepartmentExpansion();
    updateDeptFilterOptions();
    const bound = tryBindCurrentUserIdFromDirectory();
    if (bound && !state.isLive) {
      requestHydrateRefresh();
    }
  }

  function collectSelfConversationIds(){
    return conversations.filter(isSelfConversation).map(conv => conv.id);
  }

  function ensureSelfDirectoryEntry(){
    const name = defaultSelfName();
    const dept = defaultSelfDept();
    const normalizedDept = dept || '소속 미지정';
    const empNo = (chatConfig.empNo || '').trim();
    const configuredId = Number.isFinite(parseInt(chatConfig.profileId, 10)) ? parseInt(chatConfig.profileId, 10) : null;
    const selfUserId = state.currentUserId != null ? state.currentUserId : configuredId;
    const keySource = {};
    if (selfUserId != null) keySource.id = selfUserId;
    if (empNo) keySource.empNo = empNo;
    if (name) keySource.name = name;
    if (normalizedDept) keySource.department = normalizedDept;
    const lookupKey = directoryKeyFor(keySource);
    const selfConvIds = collectSelfConversationIds();
    const favoriteFlag = selfConvIds.some(id => {
      const conv = conversations.find(c => c.id === id);
      return !!(conv && conv.fav);
    });

    let entry = directoryEntries.find(item => item.isSelf);
    if (!entry && selfUserId != null) {
      entry = directoryEntries.find(item => item.userId === selfUserId);
    }
    if (!entry && empNo) {
      entry = directoryEntries.find(item => (item.empNo || '').trim() === empNo);
    }
    if (!entry && lookupKey) {
      entry = directoryEntries.find(item => item.key === lookupKey);
    }

    if (entry) {
      entry.isSelf = true;
      if (selfUserId != null && entry.userId == null) entry.userId = selfUserId;
      if (empNo && !entry.empNo) entry.empNo = empNo;
      if (!entry.name) entry.name = name;
      if (!entry.department) entry.department = normalizedDept;
      entry.avatar = resolveSelfAvatar();
      const merged = new Set(entry.convIds || []);
      selfConvIds.forEach(id => merged.add(id));
      entry.convIds = Array.from(merged);
      if (favoriteFlag) entry.isFavorite = true;
      return;
    }

    const key = lookupKey || `${SELF_CONV_PREFIX}${Date.now()}`;
    directoryEntries.push({
      key,
      userId: selfUserId,
      empNo: empNo || '',
      name,
      department: normalizedDept,
      email: '',
      avatar: resolveSelfAvatar(),
      extPhone: '',
      mobilePhone: '',
      job: '',
      isFavorite: favoriteFlag,
      convIds: selfConvIds.slice(),
      isSelf: true,
    });
  }

  function resolveOwnDepartmentLabel(){
    if (state.currentUserId != null) {
      const matchById = directoryEntries.find(entry => entry.userId === state.currentUserId);
      if (matchById) return displayDeptName(matchById.department);
    }
    if (chatConfig.empNo) {
      const targetEmp = String(chatConfig.empNo).trim();
      if (targetEmp) {
        const matchByEmp = directoryEntries.find(entry => String(entry.empNo || '').trim() === targetEmp);
        if (matchByEmp) return displayDeptName(matchByEmp.department);
      }
    }
    if (chatConfig.userName) {
      const target = chatConfig.userName.trim().toLowerCase();
      if (target) {
        const matchByName = directoryEntries.find(entry => (entry.name || '').trim().toLowerCase() === target);
        if (matchByName) return displayDeptName(matchByName.department);
      }
    }
    if (chatConfig.userDept && chatConfig.userDept.trim()) {
      return displayDeptName(chatConfig.userDept);
    }
    if (initialProfileDeptLabel && initialProfileDeptLabel.trim()) {
      return displayDeptName(initialProfileDeptLabel);
    }
    return null;
  }

  function resolveOwnDepartmentOwnerKey(){
    if (state.currentUserId != null) return `uid:${state.currentUserId}`;
    const empNoKey = String(chatConfig.empNo || '').trim();
    if (empNoKey) return `emp:${empNoKey}`;
    const nameKey = (chatConfig.userName || '').trim().toLowerCase();
    if (nameKey) return `name:${nameKey}`;
    const deptKey = (chatConfig.userDept || '').trim();
    if (deptKey) return `dept:${deptKey}`;
    const initialDeptKey = (initialProfileDeptLabel || '').trim();
    if (initialDeptKey) return `initial:${initialDeptKey}`;
    return 'unknown';
  }

  function primeOwnDepartmentExpansion(){
    const ownerKey = resolveOwnDepartmentOwnerKey();
    if (ownerKey === lastOwnDeptOwnerKey) return;
    expandedDepartments.clear();
    expandOwnDepartment();
    lastOwnDeptOwnerKey = ownerKey;
  }

  function resetOwnDepartmentExpansion(){
    expandedDepartments.clear();
    expandOwnDepartment();
    lastOwnDeptOwnerKey = resolveOwnDepartmentOwnerKey();
  }

  function expandOwnDepartment(){
    const dept = resolveOwnDepartmentLabel();
    if (!dept) return;
    expandedDepartments.add(dept);
  }

  function ensureLiveRefreshTimer(){
    if (liveRefreshTimer) return;
    const hasLiveRooms = state.isLive || conversations.some(conv => !!conv.roomId);
    if (!hasLiveRooms) return;
    liveRefreshTimer = __chatRegisterInterval(setInterval(()=>{
      hydrateFromApi({ silent: true });
      const activeConv = conversations.find(c => c.id === activeId && c.roomId);
      if (activeConv) {
        requestMessageRefresh(activeConv.roomId);
      }
    }, POLL_INTERVAL_MS));
  }

  function requestMessageRefresh(roomId){
    if (!roomId) return;
    const now = Date.now();
    const last = messageRefreshTick.get(roomId) || 0;
    if (now - last < 2500) return;
    messageRefreshTick.set(roomId, now);
    ensureMessagesLoaded(roomId, { force: true });
  }

  function findEntryByKey(key){
    if (!key) return null;
    return directoryEntries.find(entry => entry.key === key) || null;
  }

  function findEntryForConversation(conv){
    if (!conv) return null;
    const contact = primaryContact(conv);
    const key = directoryKeyFor(contact);
    return key ? findEntryByKey(key) : null;
  }

  async function hydrateDirectoryFromApi(){
    if (!chatConfig.directoryUrl) return;
    try {
      const resp = await fetch(chatConfig.directoryUrl, { credentials: 'same-origin' });
      if (!resp.ok) throw new Error('directory fetch failed');
      const data = await resp.json();
      externalDirectory.clear();
      if (Array.isArray(data)) {
        data.map(normalizeDirectoryUser).filter(Boolean).forEach(entry => {
          externalDirectory.set(entry.key, entry);
        });
      }
      rebuildDirectory();
      const filter = getActiveFilter();
      if (filter === 'colleagues' || filter === 'favorites') {
        renderList(filter, searchEl?.value || '');
      }
    } catch (err) {
      console.warn('[chat] Failed to load directory', err);
    }
  }

  function updateDeptFilterOptions(){
    if (!deptFilterSelect) return;
    const previous = currentDeptFilter;
    const departments = Array.from(new Set(directoryEntries.map(entry => displayDeptName(entry.department)))).sort((a, b) => a.localeCompare(b, 'ko-KR'));
    const options = ['<option value="ALL">전체 부서</option>'].concat(
      departments.map(dept => `<option value="${dept}">${dept}</option>`)
    );
    deptFilterSelect.innerHTML = options.join('');
    if (departments.includes(previous)) {
      currentDeptFilter = previous;
      deptFilterSelect.value = previous;
    } else {
      currentDeptFilter = 'ALL';
      deptFilterSelect.value = 'ALL';
    }
  }

  async function hydrateFromApi(options = {}){
    const { silent = false } = options;
    if (!chatConfig.roomsUrl) return;
    try {
      const previousConversations = new Map(conversations.map(conv => [conv.id, conv]));
      const query = [
        'include_members=1',
        'limit=100',
      ];
      if (state.currentUserId != null) {
        query.push(`user_id=${state.currentUserId}`);
      }
      const resp = await fetch(`${getRoomsUrl()}?${query.join('&')}`, { credentials: 'same-origin' });
      if (!resp.ok) throw new Error('rooms fetch failed');
      const data = await resp.json();
      state.isLive = true;
      const mappedRaw = Array.isArray(data) ? data.map(normalizeRoomFromApi).filter(Boolean) : [];
      // Keep a local tombstone list for deleted rooms so they don't pop back in
      // due to eventual-consistency or transient backend issues.
      // (We intentionally do NOT auto-clear locallyDeletedRoomIds here.)
      const filtered = mappedRaw.filter(conv => !locallyDeletedRoomIds.has(conv.id));
      const mapped = filtered.map(conv => {
        const previous = previousConversations.get(conv.id);
        const newSignature = conv.previewSignature || computePreviewSignature(conv.preview, conv.lastInteracted);
        const prevSignature = previous?.previewSignature || null;
        // Use server-provided unread count as primary source.
        let unread = conv.unread || 0;
        // If the server didn't provide a count but the signature changed, increment the local count.
        if (unread === 0 && previous && prevSignature && prevSignature !== newSignature && conv.id !== activeId) {
          unread = Math.max(previous.unread || 0, 0) + 1;
        }
        if (conv.id === activeId) unread = 0;
        // Preserve lastReadMessageId: prefer server value, fall back to previous local value.
        const lastReadMessageId = conv.lastReadMessageId || (previous ? previous.lastReadMessageId : null);
        return { ...conv, unread, lastReadMessageId, previewSignature: newSignature };
      });
      const currentFilter = getActiveFilter();
      if (!mapped.length) {
        conversations = [];
        messageMap = {};
        activeId = null;
        rebuildDirectory();
        renderList(currentFilter, searchEl?.value || '');
        setActive(null);
        return;
      }
      const previousActive = activeId;
      const knownIds = new Set(mapped.map(conv => conv.id));
      if (!silent) {
        messageMap = {};
      } else {
        Object.keys(messageMap).forEach(cid => {
          if (!knownIds.has(cid)) delete messageMap[cid];
        });
      }
      conversations = mapped;
      applyFavoriteFlags();

      // Silent polling runs every second; re-rendering the whole list each tick
      // causes avatar/profile flicker. If nothing meaningful changed, do nothing.
      const nextSignature = computeRoomsSignature(conversations);
      if (silent && lastRoomsSignature && nextSignature === lastRoomsSignature) {
        ensureLiveRefreshTimer();
        return;
      }
      lastRoomsSignature = nextSignature;

      rebuildDirectory();
      renderList(currentFilter, searchEl?.value || '');
      if (!silent) {
        const firstRoom = mapped[0] || null;
        activeId = firstRoom ? firstRoom.id : null;
        if (activeId) {
          setActive(activeId);
          if (firstRoom?.roomId) ensureMessagesLoaded(firstRoom.roomId);
        } else {
          setActive(null);
        }
      } else {
        // Silent polling should NOT re-run setActive() each tick; it causes
        // profile/avatar flicker because setActive() re-renders the avatar DOM.
        if (previousActive && knownIds.has(previousActive)) {
          activeId = previousActive;
          const activeRoom = mapped.find(conv => conv.id === previousActive) || null;
          if (activeRoom?.roomId) requestMessageRefresh(activeRoom.roomId);
        } else {
          const fallback = mapped[0] || null;
          activeId = fallback ? fallback.id : null;
          setActive(activeId);
        }
      }
      ensureLiveRefreshTimer();
    } catch (err) {
      console.warn('[chat] Failed to load chat rooms', err);
    }
  }

  function ensureMessagesLoaded(roomId, options = {}){
    const { force = false } = options;
    if (!roomId) return;
    const conv = conversations.find(c => c.roomId === roomId);
    if (!conv) return;
    if (!force && messageMap[conv.id] && messageMap[conv.id].length) return;
    if (messageLoadState.has(roomId)) return;
    const loader = fetchRoomMessages(roomId, { replace: true }).finally(() => messageLoadState.delete(roomId));
    messageLoadState.set(roomId, loader);
  }

  async function fetchRoomMessages(roomId, options = {}){
    const { replace = true } = options;
    try {
      if (state.currentUserId == null) {
        await ensureCurrentUserId();
      }
      const params = new URLSearchParams({
        per_page: MESSAGE_FETCH_LIMIT,
        order: MESSAGE_FETCH_ORDER,
        include_files: '1',
      });
      if (state.currentUserId != null) {
        params.set('viewer_user_id', String(state.currentUserId));
      }
      const resp = await fetch(`${buildRoomUrl(roomId)}/messages?${params.toString()}`, { credentials: 'same-origin' });
      if (resp.status === 404) {
        // Room may have been deleted (or never existed). Remove it locally so it
        // doesn't stay stuck in the list and keep throwing errors.
        const conv = conversations.find(c => c.roomId === roomId);
        if (conv) {
          rememberDeletedRoomId(conv.id);
          performDeleteConversation(conv.id, { isLive: true });
        }
        return;
      }
      if (!resp.ok) throw new Error('messages fetch failed');
      const data = await resp.json();
      const rawItems = Array.isArray(data?.items) ? data.items : [];
      const items = MESSAGE_FETCH_ORDER === 'desc' ? rawItems.slice().reverse() : rawItems;
      const mapped = items.map(mapMessageFromApi).filter(Boolean);
      const conv = conversations.find(c => c.roomId === roomId);
      if (conv) {
        const prevMessages = messageMap[conv.id] || [];
        const prevIds = new Set(prevMessages.map(m => m.id));
        if (replace || !messageMap[conv.id]) {
          messageMap[conv.id] = mapped;
        } else if (mapped.length) {
          messageMap[conv.id] = mapped;
        }
        if (mapped.length) {
          const last = mapped[mapped.length - 1];
          conv.preview = last.text;
          conv.displayTime = last.time;
          // Keep lastInteracted stable and aligned with server ordering.
          // Using Date.now() here causes signature churn and phantom unread counts.
          conv.lastInteracted = last.createdAt != null ? last.createdAt : conv.lastInteracted;
          conv.previewSignature = computePreviewSignature(conv.preview, conv.lastInteracted);
        }
        if (conv.id === activeId) {
          conv.unread = 0;
          // Server-side mark-read for active conversation receiving new messages.
          if (conv.roomId) {
            fetch(`${chatConfig.apiRoot}/rooms/${conv.roomId}/mark-read`, {
              method: 'POST', credentials: 'same-origin',
              headers: {'Content-Type': 'application/json'},
            }).catch(function(){});
          }
          renderMessages(conv.id);
          // Update lastReadMessageId AFTER rendering so divider can appear.
          if (mapped.length) {
            conv.lastReadMessageId = mapped[mapped.length - 1].id;
          }
          // Ensure badge disappears immediately in the conversation list.
          if (lastRenderedFilter !== 'colleagues' && lastRenderedFilter !== 'favorites') {
            renderList(lastRenderedFilter, searchEl?.value || '');
          }
        } else {
          const newMessages = mapped.filter(m => !prevIds.has(m.id));
          if (newMessages.length) {
            conv.unread = (conv.unread || 0) + newMessages.length;
            // Reflect unread increment immediately in the list.
            if (lastRenderedFilter !== 'colleagues' && lastRenderedFilter !== 'favorites') {
              renderList(lastRenderedFilter, searchEl?.value || '');
            }
          }
        }
      }
    } catch (err) {
      console.warn('[chat] Failed to load messages', err);
    }
  }

  function buildPseudoEntryFromConversation(conv){
    if (!conv) return null;
    const contact = primaryContact(conv);
    const userId = contact && contact.id != null ? Number(contact.id) : null;
    if (!Number.isFinite(userId)) return null;
    return {
      key: `user-${userId}`,
      userId,
      name: (contact && contact.name) || conv.name || '',
      department: (contact && contact.department) || conv.dept || '',
      email: (contact && contact.email) || conv.email || '',
      avatar: (contact && contact.avatar) || conv.avatar || '',
      isSelf: false,
    };
  }

  function renderList(filter='all', q=''){
    const previousFilter = lastRenderedFilter;
    lastRenderedFilter = filter;
    if (filter === 'colleagues' && previousFilter !== 'colleagues') {
      resetOwnDepartmentExpansion();
    }
    if (filter === 'colleagues' || filter === 'favorites') {
      lastListRenderSignature = null;
      renderDirectoryList(filter, q);
      return;
    }
    renderConversationList(filter, q);
  }

  function renderConversationList(filter='all', q=''){
    var ql = (q || '').trim().toLowerCase();
    function isChannelConv(c){
      var t = String((c && c.roomType) || '').toUpperCase();
      return t === 'CHANNEL';
    }
    var items = conversations
      .filter(function(c){
        if (filter === 'favorites') return !!c.fav;
        // '채널' 탭(all): CHANNEL 만 표시
        if (filter === 'all') return isChannelConv(c);
        // '채팅' 탭(chat): CHANNEL 제외 (DIRECT/GROUP/SELF)
        if (filter === 'chat') return !isChannelConv(c);
        return true;
      })
      .filter(function(c){
        if (!ql) return true;
        var deptMatch = c.dept && c.dept.toLowerCase().indexOf(ql) >= 0;
        var previewMatch = c.preview && c.preview.toLowerCase().indexOf(ql) >= 0;
        var nameMatch = c.name && c.name.toLowerCase().indexOf(ql) >= 0;
        return nameMatch || previewMatch || deptMatch;
      })
      // Always show most recently active conversations first.
      .slice()
      .sort(function(a, b){ return (b.lastInteracted || 0) - (a.lastInteracted || 0); });
    // Build a lightweight render signature so we can skip DOM rebuild
    // when nothing visually changed (prevents avatar image flicker).
    var sig = items.map(function(c){
      return [c.id, c.name||'', c.preview||'', c.displayTime||c.time||'', c.unread||0, c.fav?1:0, c.id===activeId?1:0].join('|');
    }).join(';;');
    if (sig === lastListRenderSignature) return;
    lastListRenderSignature = sig;
    var frag = document.createDocumentFragment();
    if (!items.length) {
      const empty = createEl('li', 'chat-item empty', '<div class="name" style="white-space:nowrap;">대화가 없습니다.</div>');
      empty.setAttribute('aria-hidden', 'true');
      frag.appendChild(empty);
    } else {
      items.forEach(c => {
        const li = createEl('li', 'chat-item' + (c.id === activeId ? ' active' : ''));
        li.dataset.id = c.id;
        const contact = primaryContact(c);
        const selfConv = isSelfConversation(c);
        const channelConv = isChannelConversation(c);
        const left = channelConv ? channelIconNode('sm') : (Array.isArray(c.groupAvatars) && c.groupAvatars.length ? (()=>{
          const wrap = createEl('div', 'avatar-stack sm');
          c.groupAvatars.slice(0,3).forEach(src => {
            const im = document.createElement('img');
            im.src = resolveAvatarSrc(src, c.name || 'member');
            im.alt = 'member';
            im.onerror = () => { im.src = fallbackAvatar; };
            wrap.appendChild(im);
          });
          return wrap;
        })() : avatarImg(selfConv ? resolveSelfAvatar() : (contact?.avatar || c.avatar), contact?.name || c.name));
        const deptRaw = contact?.department || c.dept || '';
        const deptLabel = channelConv ? '채널' : (deptRaw ? displayDeptName(deptRaw) : '');
        const subline = (deptLabel && deptLabel !== '소속 미지정') ? `<div class="subline">${deptLabel}</div>` : '';
        const previewLine = c.preview ? `<div class="preview">${c.preview}</div>` : '';
        const main = createEl('div', null,
          `<div class="name">${displayNameForConversation(c) || ''}</div>${subline}${previewLine}`
        );
        const right = createEl('div', 'right',
          `<span class="time">${c.displayTime || c.time || ''}</span>${c.unread ? `<span class="badge">${c.unread}</span>` : ''}`
        );
        li.appendChild(left);
        li.appendChild(main);
        li.appendChild(right);

        if (!Array.isArray(c.groupAvatars) && c.friend) {
          li.setAttribute('draggable', 'true');
          li.addEventListener('dragstart', (e)=>{
            setDragPayload(e, { type: 'conversation', id: c.id }, c.id);
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
          });
        }
        frag.appendChild(li);
      });
    }
    listEl.innerHTML = '';
    listEl.appendChild(frag);
  }

  function renderDirectoryList(mode='colleagues', q=''){
    const ql = (q || '').trim().toLowerCase();
    const deptSelection = mode === 'colleagues' && currentDeptFilter !== 'ALL' ? currentDeptFilter : null;
    const grouped = new Map();
    const ownDeptLabel = mode === 'colleagues' ? resolveOwnDepartmentLabel() : null;

    directoryEntries
      .filter(entry => {
        if (mode === 'favorites') return entry.isFavorite;
        return true;
      })
      .filter(entry => {
        if (!deptSelection) return true;
        return displayDeptName(entry.department) === deptSelection;
      })
      .filter(entry => {
        if (!ql) return true;
        const nameMatch = (entry.name || '').toLowerCase().includes(ql);
        const deptMatch = displayDeptName(entry.department).toLowerCase().includes(ql);
        const emailMatch = (entry.email || '').toLowerCase().includes(ql);
        return nameMatch || deptMatch || emailMatch;
      })
      .forEach(entry => {
        const deptLabel = displayDeptName(entry.department);
        if (!grouped.has(deptLabel)) grouped.set(deptLabel, []);
        grouped.get(deptLabel).push(entry);
      });

    const departments = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b, 'ko-KR'));
    const validDeptSet = new Set(departments);
    const stale = [];
    expandedDepartments.forEach(dept => { if (!validDeptSet.has(dept)) stale.push(dept); });
    stale.forEach(dept => expandedDepartments.delete(dept));

    const frag = document.createDocumentFragment();
    if (!departments.length) {
      const emptyLabel = mode === 'favorites' ? '즐겨찾기한 동료가 없습니다.' : '표시할 동료가 없습니다.';
      const empty = createEl('li', 'chat-item empty', `<div class="name" style="white-space:nowrap;">${emptyLabel}</div>`);
      empty.setAttribute('aria-hidden', 'true');
      frag.appendChild(empty);
    } else {
      departments.forEach(deptLabel => {
        const members = grouped.get(deptLabel).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko-KR'));
        const forceExpand = deptSelection ? deptSelection === deptLabel : false;
        if (forceExpand) expandedDepartments.add(deptLabel);
        const defaultExpand = !deptSelection && ownDeptLabel && deptLabel === ownDeptLabel;
        const isExpanded = forceExpand || expandedDepartments.has(deptLabel) || defaultExpand;
        if (defaultExpand) expandedDepartments.add(deptLabel);
        const header = createEl('li', 'chat-section dept-header',
          `<button type="button" class="dept-toggle" aria-expanded="${isExpanded ? 'true' : 'false'}" data-dept="${deptLabel}">
            <span class="caret">${isExpanded ? '▾' : '▸'}</span>
            <span class="label">${deptLabel} (${members.length})</span>
          </button>`
        );
        frag.appendChild(header);
        if (!isExpanded) return;
        members.forEach(entry => {
          const convId = entry.convIds[0] || '';
          const hasActiveConv = convId && entry.convIds.includes(activeId);
          const isActive = hasActiveConv || state.activeDirectoryKey === entry.key;
          const li = createEl('li', 'chat-item colleague' + (isActive ? ' active' : ''));
          if (convId) li.dataset.id = convId;
          li.dataset.entryKey = entry.key;
          const avatar = avatarImg(entry.avatar, entry.name);
          const main = createEl('div', null,
            `<div class="name">${entry.name || ''}</div>${entry.email ? `<div class="preview">${entry.email}</div>` : ''}`
          );
          li.appendChild(avatar);
          li.appendChild(main);

          if (!entry.isSelf) {
            li.setAttribute('draggable', 'true');
            li.addEventListener('dragstart', (e)=>{
              const payload = { type: 'directory', entryKey: entry.key };
              if (convId) payload.convId = convId;
              setDragPayload(e, payload, convId || entry.key);
              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
            });
          }
          frag.appendChild(li);
        });
      });
    }

    listEl.innerHTML = '';
    listEl.appendChild(frag);
  }

  function setDeptFilterVisibility(filter){
    if (!deptFilterWrap) return;
    const show = filter === 'colleagues';
    deptFilterWrap.hidden = !show;
  }


  function renderMessages(id){
    if (!id) {
      messagesEl.innerHTML = '';
      requestMessagesScrollbarUpdate();
      return;
    }
    // Capture scroll state before re-render to decide if we should auto-scroll.
    const prevScrollTop = messagesEl.scrollTop;
    const prevScrollHeight = messagesEl.scrollHeight;
    const prevClientHeight = messagesEl.clientHeight;
    const nearBottomThreshold = 80;
    renderMessages._prevScrollHeight = prevScrollHeight;
    renderMessages._wasNearBottom = (prevScrollTop + prevClientHeight >= prevScrollHeight - nearBottomThreshold);
    const msgs = messageMap[id] || [];
    const conv = conversations.find(c => c.id === id) || null;
    const lastReadId = conv ? conv.lastReadMessageId : null;
    const unreadCount = conv ? (conv._prevUnread || conv.unread || 0) : 0;
    // Determine if we need an unread divider.
    // Case 1: lastReadId is set → show divider before first incoming msg with id > lastReadId.
    // Case 2: lastReadId is null but unreadCount > 0 → count backwards from end
    //         to place divider before the Nth-from-last incoming message.
    let unreadDividerInserted = false;
    let unreadDividerBeforeIdx = -1;
    if (lastReadId == null && unreadCount > 0) {
      // Find the insertion point: walk backwards, count incoming messages.
      let remaining = unreadCount;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].who === 'in') {
          remaining--;
          if (remaining <= 0) { unreadDividerBeforeIdx = i; break; }
        }
      }
      if (unreadDividerBeforeIdx < 0 && remaining < unreadCount) {
        unreadDividerBeforeIdx = 0; // all messages are unread
      }
    }
    const frag = document.createDocumentFragment();
    const emojiOnlyRe = /^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}|[\u2190-\u21FF\u2600-\u27BF\uFE0F])+$/u;
    const dayNames = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
    let lastDateKey = null;
    msgs.forEach((m, idx) => {
      // ---- Date separator ----
      if (m.createdAt != null) {
        const d = new Date(m.createdAt);
        const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (dateKey !== lastDateKey) {
          lastDateKey = dateKey;
          const label = `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${dayNames[d.getDay()]}`;
          const sep = createEl('div', 'date-separator', `<span>${label}</span>`);
          frag.appendChild(sep);
        }
      }
      // render system notice as plain text (no bubble)
      if (m.who === 'system') {
        const sys = createEl('div', 'system-line');
        renderMessageText(sys, m.text);
        frag.appendChild(sys);
        return;
      }
      const div = createEl('div', `message ${m.who}${m.pinned ? ' is-pinned' : ''}`);
      if (m.id != null) div.setAttribute('data-msg-id', String(m.id));
      const isEmojiOnly = typeof m.text === 'string' && emojiOnlyRe.test(m.text.trim());
      const hasFiles = Array.isArray(m.files) && m.files.length;
      const t = (typeof m.text === 'string' ? m.text : '');
      const tTrim = t.trim();
      const isAttachmentPlaceholder = !!hasFiles && tTrim === '[첨부파일]';
      const hasText = tTrim.length > 0 && !isAttachmentPlaceholder;
      if (hasText || !hasFiles) {
        const text = createEl('div', isEmojiOnly ? 'emoji-only' : null);
        renderMessageText(text, t || '');
        div.appendChild(text);
      }
      if (m.files && m.files.length){
        const row = createEl('div', 'attachments');
        m.files.forEach(f=>{
          const icon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 8v7a6 6 0 1 1-12 0V6a4 4 0 1 1 8 0v8a2 2 0 1 1-4 0V8" stroke="#64748b" stroke-width="2" stroke-linecap="round"/></svg>`;
          const label = `${icon}${f.name || '파일'}`;
          const chip = f.url
            ? createEl('a', 'attachment-chip', label)
            : createEl('div', 'attachment-chip', label);
          if (f.url) {
            chip.href = f.url;
            chip.target = '_blank';
            chip.rel = 'noopener';
            chip.setAttribute('download', f.name || 'download');
            chip.addEventListener('click', (ev)=>{ ev.stopPropagation(); });
          }
          row.appendChild(chip);
        });
        div.appendChild(row);
      }
      const meta = createEl('div', 'meta', m.time);
      div.appendChild(meta);
      // ---- 이모지 반응 chips ----
      if (m.who !== 'system' && m.id != null && Array.isArray(m.reactions) && m.reactions.length) {
        const wrap = createEl('div', 'msg-reactions');
        m.reactions.forEach(function(r){
          if (!r || !r.emoji) return;
          const chip = createEl('button', 'react-chip' + (r.mine ? ' is-mine' : ''));
          chip.setAttribute('type', 'button');
          chip.setAttribute('data-react-msg', String(m.id));
          chip.setAttribute('data-react-emoji', r.emoji);
          chip.setAttribute('title', r.mine ? '반응 취소' : '반응 추가');
          chip.innerHTML = `<span class="rc-emoji">${r.emoji}</span><span class="rc-count">${r.count}</span>`;
          wrap.appendChild(chip);
        });
        div.appendChild(wrap);
      }
      // Pin/Unpin 버튼 (시스템 메시지 제외, id 있는 경우만)
      if (m.who !== 'system' && m.id != null) {
        const pinBtn = createEl('button', 'msg-pin-btn', m.pinned
          ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M16 3l5 5-2 2-1-1-4 4 1 4-2 2-5-5-5 5v-2l5-5-5-5 2-2 4 1 4-4-1-1z"/></svg>'
          : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M16 3l5 5-2 2-1-1-4 4 1 4-2 2-5-5-5 5v-2l5-5-5-5 2-2 4 1 4-4-1-1z"/></svg>');
        pinBtn.setAttribute('type', 'button');
        pinBtn.setAttribute('title', m.pinned ? '고정 해제' : '메시지 고정');
        pinBtn.setAttribute('aria-label', m.pinned ? '고정 해제' : '메시지 고정');
        pinBtn.setAttribute('data-pin-msg', String(m.id));
        pinBtn.setAttribute('data-pinned', m.pinned ? '1' : '0');
        div.appendChild(pinBtn);
        // 이모지 반응 추가 버튼
        const reactBtn = createEl('button', 'msg-react-btn', '😊');
        reactBtn.setAttribute('type', 'button');
        reactBtn.setAttribute('title', '반응 추가');
        reactBtn.setAttribute('aria-label', '반응 추가');
        reactBtn.setAttribute('data-react-add', String(m.id));
        div.appendChild(reactBtn);
      }
      // Show "안읽음" indicator outside the bubble, positioned absolutely to the left.
      if (m.who === 'out' && m.unreadCount != null && m.unreadCount > 0) {
        div.style.position = 'relative';
        const unreadLabel = createEl('span', 'unread-badge', m.unreadCount > 1 ? String(m.unreadCount) : '안읽음');
        div.appendChild(unreadLabel);
      }
      frag.appendChild(div);
    });
    messagesEl.innerHTML = '';
    messagesEl.appendChild(frag);
    // Only auto-scroll if user was already near the bottom or this is a fresh open.
    if (renderMessages._forceScroll || !renderMessages._prevScrollHeight) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else {
      // Restore scroll position relative to the bottom.
      const wasNearBottom = renderMessages._wasNearBottom;
      if (wasNearBottom) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }
    renderMessages._forceScroll = false;
    requestMessagesScrollbarUpdate();
  }

  let messagesScrollRAF = null;
  function requestMessagesScrollbarUpdate(){
    if (!messagesScrollbar || !messagesScrollbarThumb || !messagesEl) return;
    if (messagesScrollRAF) cancelAnimationFrame(messagesScrollRAF);
    messagesScrollRAF = window.requestAnimationFrame(()=>{
      messagesScrollRAF = null;
      updateMessagesScrollbar();
    });
  }

  function updateMessagesScrollbar(){
    if (!messagesScrollbar || !messagesScrollbarThumb || !messagesEl) return;
    const scrollHeight = messagesEl.scrollHeight;
    const clientHeight = messagesEl.clientHeight;
    if (!scrollHeight || scrollHeight <= clientHeight + 1) {
      messagesScrollbar.classList.remove('visible');
      return;
    }
    messagesScrollbar.classList.add('visible');
    const trackHeight = messagesScrollbar.clientHeight;
    const ratio = clientHeight / scrollHeight;
    const thumbHeight = Math.max(28, Math.round(trackHeight * ratio));
    const maxScrollTop = Math.max(1, scrollHeight - clientHeight);
    const offset = Math.min(trackHeight - thumbHeight, (messagesEl.scrollTop / maxScrollTop) * (trackHeight - thumbHeight));
    messagesScrollbarThumb.style.height = `${thumbHeight}px`;
    messagesScrollbarThumb.style.transform = `translateY(${offset}px)`;
  }

  function jumpMessagesToRatio(ratio){
    if (!messagesEl) return;
    const maxScroll = messagesEl.scrollHeight - messagesEl.clientHeight;
    if (maxScroll <= 0) return;
    const clamped = Math.max(0, Math.min(1, ratio));
    messagesEl.scrollTop = maxScroll * clamped;
  }

  const messagesScrollbarDrag = { active: false, startY: 0, startScroll: 0 };
  function onThumbPointerDown(evt){
    if (!messagesScrollbar || !messagesScrollbarThumb || !messagesEl) return;
    evt.preventDefault();
    messagesScrollbarDrag.active = true;
    messagesScrollbarDrag.startY = evt.clientY;
    messagesScrollbarDrag.startScroll = messagesEl.scrollTop;
    window.addEventListener('pointermove', onThumbPointerMove, true);
    window.addEventListener('pointerup', onThumbPointerUp, true);
    window.addEventListener('pointercancel', onThumbPointerUp, true);
  }

  function onThumbPointerMove(evt){
    if (!messagesScrollbarDrag.active || !messagesScrollbar || !messagesScrollbarThumb || !messagesEl) return;
    const delta = evt.clientY - messagesScrollbarDrag.startY;
    const trackHeight = messagesScrollbar.clientHeight;
    const thumbHeight = messagesScrollbarThumb.offsetHeight || 1;
    const trackScrollable = Math.max(1, trackHeight - thumbHeight);
    const maxScroll = Math.max(0, messagesEl.scrollHeight - messagesEl.clientHeight);
    if (maxScroll <= 0) return;
    const next = messagesScrollbarDrag.startScroll + (delta / trackScrollable) * maxScroll;
    messagesEl.scrollTop = next;
  }

  function onThumbPointerUp(){
    if (!messagesScrollbarDrag.active) return;
    messagesScrollbarDrag.active = false;
    window.removeEventListener('pointermove', onThumbPointerMove, true);
    window.removeEventListener('pointerup', onThumbPointerUp, true);
    window.removeEventListener('pointercancel', onThumbPointerUp, true);
  }

  function onScrollbarTrackPointerDown(evt){
    if (!messagesScrollbar || evt.target === messagesScrollbarThumb) return;
    evt.preventDefault();
    const rect = messagesScrollbar.getBoundingClientRect();
    if (!rect.height) return;
    const ratio = (evt.clientY - rect.top) / rect.height;
    jumpMessagesToRatio(ratio);
  }

  // --- System message helper (plain text line) ---
  function addSystemMessage(convId, text){
    const arr = messageMap[convId] = messageMap[convId] || [];
    arr.push({ id: Date.now(), who: 'system', text, time: '' });
    renderMessages(convId);
    updateLastInteraction(convId);
  }

  // --- Last interaction helpers ---
  function formatRelative(when){
    if (!when) return '';
    const now = Date.now();
    const diff = Math.max(0, now - when);
    const sec = Math.floor(diff / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    if (sec < 60) return '방금 전';
    if (min < 60) return `${min}분 전`;
    if (hr < 24) return `${hr}시간 전`;
    if (day === 1) return '어제';
    try { return new Date(when).toLocaleDateString('ko-KR'); } catch { return '';
    }
  }
  function updateLastInteraction(convId){
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;
    conv.lastInteracted = Date.now();
    if (activeId === convId && profile.lastEl){
      profile.lastEl.textContent = formatRelative(conv.lastInteracted);
    }
  }

  function isGroupConversation(conv){
    if (!conv) return false;
    if (typeof conv.roomType === 'string') {
      return conv.roomType.toUpperCase() === 'GROUP';
    }
    return Array.isArray(conv.groupAvatars) && conv.groupAvatars.length >= 2;
  }

  function isSelfConversation(conv){
    if (!conv) return false;
    if (typeof conv.id === 'string' && conv.id.startsWith(SELF_CONV_PREFIX)) return true;
    const members = materializeMembers(conv);
    if (!members.length) return false;
    const hasSelf = members.some(member => isSelfIdentity(member) || member?.isSelf);
    const hasOthers = members.some(member => member && !(isSelfIdentity(member) || member.isSelf));
    return hasSelf && !hasOthers;
  }

  function materializeMembers(conv){
    if (!conv || !Array.isArray(conv.members)) return [];
    return conv.members
      .map(resolveMemberMeta)
      .map(enrichMemberProfile)
      .filter(Boolean)
      .map(member => ({ ...member, isSelf: !!member.isSelf || isSelfIdentity(member) }));
  }

  function primaryContact(conv){
    if (!conv) return null;
    if (conv.contact) {
      const direct = resolveMemberMeta(conv.contact);
      if (direct) {
        const clone = { ...direct };
        return enrichMemberProfile(clone);
      }
    }
    const members = materializeMembers(conv);
    if (!members.length) return null;
    const nonSelf = members.find(m => !m.isSelf);
    return nonSelf || members[0];
  }

  function updateProfilePanel(conv, isGroup){
    const contact = conv ? primaryContact(conv) : null;
    const selfConv = isSelfConversation(conv);
    const channelConv = isChannelConversation(conv);
    if (profile.nameEl) {
      profile.nameEl.textContent = conv ? (channelConv ? (displayNameForConversation(conv) || '') : (isGroup ? displayNameForConversation(conv) : (contact?.name || displayNameForConversation(conv) || ''))) : '';
    }
    if (profile.emailEl) {
      profile.emailEl.textContent = channelConv ? '' : (contact?.email || '');
    }
    if (profile.extPhoneEl) {
      profile.extPhoneEl.textContent = channelConv ? '' : (contact?.extPhone || '');
    }
    if (profile.mobilePhoneEl) {
      profile.mobilePhoneEl.textContent = channelConv ? '' : (contact?.mobilePhone || contact?.phone || '');
    }
    if (profile.locationEl) {
      profile.locationEl.textContent = channelConv ? '채널' : (contact?.department || conv?.dept || '');
    }
    if (profile.avatarEl) {
      if (isChannelConversation(conv)) {
        const channelAvatarSrc = selfConv ? resolveSelfAvatar() : (contact?.avatar || conv?.avatar || '');
        if (channelAvatarSrc) {
          renderAvatarInto(profile.avatarEl, channelAvatarSrc, contact?.name || conv?.name || '');
        } else {
          renderChannelAvatarInto(profile.avatarEl);
        }
      } else {
        const baseSrc = conv ? (selfConv ? resolveSelfAvatar() : (isGroup ? conv.avatar : (contact?.avatar || conv.avatar))) : null;
        renderAvatarInto(profile.avatarEl, baseSrc, contact?.name || conv?.name || '');
      }
    }
    if (profile.lastEl) {
      if (conv && conv.lastInteracted) {
        profile.lastEl.textContent = formatRelative(conv.lastInteracted);
      } else {
        profile.lastEl.textContent = '';
      }
    }
  }

  function renderDirectoryProfile(entry){
    if (!entry) {
      state.activeDirectoryKey = null;
      return;
    }
    state.activeDirectoryKey = entry.key;
    if (profile.nameEl) {
      profile.nameEl.textContent = entry.name || '';
    }
    if (profile.emailEl) {
      profile.emailEl.textContent = entry.email || '';
    }
    if (profile.extPhoneEl) {
      profile.extPhoneEl.textContent = entry.extPhone || '';
    }
    if (profile.mobilePhoneEl) {
      profile.mobilePhoneEl.textContent = entry.mobilePhone || '';
    }
    if (profile.locationEl) {
      profile.locationEl.textContent = entry.department || '';
    }
    if (profile.lastEl) {
      profile.lastEl.textContent = '';
    }
    if (profile.avatarEl) {
      renderAvatarInto(profile.avatarEl, entry.avatar, entry.name || '');
    }
    if (profile.infoWrap) {
      profile.infoWrap.hidden = false;
    }
    if (profile.membersWrap) {
      profile.membersWrap.hidden = true;
    }
    if (profileEmailBtn) {
      const hasEmail = !!entry.email;
      profileEmailBtn.disabled = !hasEmail;
      profileEmailBtn.setAttribute('aria-disabled', hasEmail ? 'false' : 'true');
      profileEmailBtn.title = hasEmail ? '이메일 보내기' : '';
    }
  }

  function findConversationForEntry(entry){
    if (!entry) return null;
    const contactTombstoned = !entry.isSelf && !!entry.key && locallyDeletedContactKeys.has(entry.key);
    if (entry.isSelf) {
      const selfConv = conversations.find(isSelfConversation);
      if (selfConv) return selfConv;
    }
    if (Array.isArray(entry.convIds)) {
      for (const cid of entry.convIds) {
        const existing = conversations.find(c => c.id === cid);
        if (!existing) continue;
        if (contactTombstoned && !existing.roomId) continue;
        return existing;
      }
    }
    if (entry.userId != null) {
      const targetId = Number(entry.userId);
      if (Number.isFinite(targetId)) {
        const direct = conversations.find(conv => {
          if (Array.isArray(conv?.groupAvatars)) return false;
          const members = materializeMembers(conv);
          return members.some(member => member?.id === targetId);
        });
        if (direct) {
          if (contactTombstoned && !direct.roomId) return null;
          return direct;
        }
      }
    }
    return null;
  }

  function buildSyntheticConversation(entry){
    const syntheticId = entry.isSelf ? `${SELF_CONV_PREFIX}${entry.key}` : `dir-${entry.key}`;
    const legacyId = entry.isSelf ? `dir-${entry.key}` : null;
    let conv = conversations.find(c => c.id === syntheticId || (legacyId && c.id === legacyId));
    if (!conv) {
      const now = Date.now();
      const memberId = entry.userId != null ? entry.userId : entry.key;
      const member = {
        id: memberId,
        name: entry.name,
        department: entry.department,
        email: entry.email,
        avatar: resolveAvatarSrc(entry.avatar, entry.name),
        extPhone: entry.extPhone || '',
        mobilePhone: entry.mobilePhone || '',
        isSelf: !!entry.isSelf,
      };
      conv = {
        id: syntheticId,
        name: entry.name,
        dept: entry.department,
        email: entry.email,
        avatar: resolveAvatarSrc(entry.avatar, entry.name),
        roomType: entry.isSelf ? 'SELF' : 'DIRECT',
        friend: !entry.isSelf,
        members: [member],
        contact: member,
        preview: '',
        time: '',
        displayTime: '',
        lastInteracted: now,
        unread: 0,
        fav: false,
        previewSignature: computePreviewSignature('', now, ''),
      };
      conversations.push(conv);
      syncFavoriteFlag(conv);
      rebuildDirectory();
    }
    return conv;
  }

  async function createDirectRoomForEntry(entry){
    if (!chatConfig.roomsUrl) return null;
    if (state.currentUserId == null || entry.userId == null) return null;
    const myId = Number(state.currentUserId);
    const otherId = Number(entry.userId);
    const memberIds = Array.from(new Set([myId, otherId].filter(Number.isFinite)));
    if (memberIds.length < 2) return null;
    const payload = {
      room_type: 'DIRECT',
      created_by_user_id: myId,
      member_ids: memberIds,
    };
    const resp = await fetch(getRoomsCreateUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      if (resp.status === 400) {
        await hydrateFromApi();
        return findConversationForEntry(entry);
      }
      throw new Error('failed to create direct room (HTTP ' + resp.status + ')');
    }
    const roomData = await resp.json();
    const normalized = normalizeRoomFromApi(roomData);
    if (!normalized) return null;

    // If we previously had a synthetic (offline) conversation for this contact,
    // wipe it so old local messages cannot resurface.
    const syntheticId = syntheticConversationIdForKey(entry.key);
    if (syntheticId) {
      purgeConversationHistory(syntheticId);
      removeConversationLocal(syntheticId);
    }
    state.isLive = true;
    conversations.unshift(normalized);
    forgetDeletedRoomId(normalized.id);
    syncFavoriteFlag(normalized);
    messageMap[normalized.id] = messageMap[normalized.id] || [];
    rebuildDirectory();
    return normalized;
  }

  async function ensureConversationForEntry(entry){
    if (!entry) return null;
    const contactTombstoned = !entry.isSelf && !!entry.key && locallyDeletedContactKeys.has(entry.key);
    const existing = findConversationForEntry(entry);
    if (existing) return existing;
    if (entry.isSelf) {
      return buildSyntheticConversation(entry);
    }

    if (contactTombstoned) {
      const syntheticId = syntheticConversationIdForKey(entry.key);
      if (syntheticId) {
        purgeConversationHistory(syntheticId);
        removeConversationLocal(syntheticId);
      }
    }
    if (chatConfig.roomsUrl && state.currentUserId != null && entry.userId != null) {
      try {
        const created = await createDirectRoomForEntry(entry);
        if (created) return created;
      } catch (err) {
        console.warn('[chat] Failed to create direct room', err);
      }
    }
    const fallback = buildSyntheticConversation(entry);
    if (contactTombstoned && fallback) {
      purgeConversationHistory(fallback.id);
      fallback.unread = 0;
      fallback.lastInteracted = Date.now();
      fallback.previewSignature = computePreviewSignature('', fallback.lastInteracted || 0);
    }
    return fallback;
  }

  async function startConversationFromEntry(entry){
    if (!entry) return;
    if (!entry.isSelf && entry.key && locallyDeletedContactKeys.has(entry.key)) {
      const syntheticId = syntheticConversationIdForKey(entry.key);
      if (syntheticId) {
        purgeConversationHistory(syntheticId);
        removeConversationLocal(syntheticId);
      }
    }
    const conv = await ensureConversationForEntry(entry);
    if (!conv) return;
    setActive(conv.id);
    renderDirectoryProfile(entry);
    renderList(getActiveFilter(), searchEl.value);
  }

  function finalizeGroupResult(result){
    if (!result || !result.conv) return;
    setActive(result.conv.id);
    rebuildDirectory();
    renderList(getActiveFilter(), searchEl.value);
    if (result.addedName) addSystemMessage(result.conv.id, `${result.addedName}님이 추가되었습니다.`);
  }

  async function addEntryToActiveConversation(entry){
    if (!entry) return;
    const activeConv = conversations.find(c => c.id === activeId);
    if (!activeConv) {
      await startConversationFromEntry(entry);
      return;
    }
    if (entry.isSelf) {
      await startConversationFromEntry(entry);
      return;
    }
    const friendConv = await ensureConversationForEntry(entry);
    if (!friendConv || friendConv.id === activeConv.id) return;
    if (Array.isArray(friendConv.groupAvatars)) {
      setActive(friendConv.id);
      return;
    }
    const result = await createGroupFromActiveAnd(friendConv);
    finalizeGroupResult(result);
  }

  async function handleConversationDrop(conv){
    if (!conv) return;
    const activeConv = conversations.find(c => c.id === activeId);
    if (!activeConv || conv.id === activeId || Array.isArray(conv.groupAvatars) || isSelfConversation(conv)) {
      setActive(conv.id);
      renderList(getActiveFilter(), searchEl.value);
      return;
    }
    const result = await createGroupFromActiveAnd(conv);
    finalizeGroupResult(result);
  }

  function renderThreadAvatar(conv){
    const wrap = thread.avatarEl; if (!wrap) return;
    wrap.innerHTML = '';
    if (!conv) return;
    if (isChannelConversation(conv)) {
      wrap.className = 'avatar-group avatar-single';
      wrap.appendChild(channelIconNode('sm'));
      return;
    }
    const members = materializeMembers(conv).filter((member, idx, arr) => (
      member && member.id != null ? arr.findIndex(m => m && m.id === member.id) === idx : true
    ));
    const isGroup = isGroupConversation(conv);
    wrap.className = isGroup ? 'avatar-group' : 'avatar-group avatar-single';
    if (isGroup && members.length >= 2) {
      const maxVisible = Math.min(members.length, 3);
      members.slice(0, maxVisible).forEach(mem => {
        wrap.appendChild(avatarImg(mem.avatar, mem.name || 'member', 'sm'));
      });
      if (members.length > 3) {
        const extra = document.createElement('div');
        extra.className = 'avatar avatar-token avatar-sm';
        extra.textContent = '+' + (members.length - 3);
        extra.style.background = '#0f172a';
        wrap.appendChild(extra);
      }
      return;
    }
    if (Array.isArray(conv.groupAvatars) && conv.groupAvatars.length && isGroup) {
      conv.groupAvatars.slice(0,3).forEach(src => {
        wrap.appendChild(avatarImg(src, 'member', 'sm'));
      });
      return;
    }
    if (isSelfConversation(conv)) {
      wrap.appendChild(avatarImg(resolveSelfAvatar(), defaultSelfName(), 'sm'));
      return;
    }
    const contact = primaryContact(conv);
    wrap.appendChild(avatarImg((contact && contact.avatar) || conv.avatar, contact?.name || conv.name || 'avatar', 'sm'));
  }

  const addMemberMenu = document.createElement('div');
  addMemberMenu.className = 'chat-add-menu';
  addMemberMenu.hidden = true;
  document.body.appendChild(addMemberMenu);

  function closeAddMemberMenu(){
    if (addMemberMenu.hidden) return;
    addMemberMenu.hidden = true;
    addMemberMenu.innerHTML = '';
  }

  function openAddMemberMenu(anchor){
    if (!anchor) return;
    if (!directoryEntries.length) {
      hydrateDirectoryFromApi();
    }
    const activeConv = conversations.find(c => c.id === activeId) || null;
    addMemberMenu.innerHTML = '';
    const search = document.createElement('input');
    search.type = 'text';
    search.placeholder = '이름, 부서 검색';
    search.className = 'add-search';
    const list = document.createElement('ul');
    list.className = 'add-list';
    addMemberMenu.appendChild(search);
    addMemberMenu.appendChild(list);

    const entryInActive = (entry) => {
      if (!entry || !activeConv) return false;
      return Array.isArray(entry.convIds) && entry.convIds.includes(activeConv.id);
    };

    function renderOptions(){
      const term = (search.value || '').trim().toLowerCase();
      const pool = directoryEntries.filter(entry => {
        if (entry.isSelf) return false;
        if (entryInActive(entry)) return false;
        if (!term) return true;
        const nameMatch = (entry.name || '').toLowerCase().includes(term);
        const deptMatch = displayDeptName(entry.department).toLowerCase().includes(term);
        const emailMatch = (entry.email || '').toLowerCase().includes(term);
        return nameMatch || deptMatch || emailMatch;
      }).slice(0, 15);
      list.innerHTML = '';
      if (!pool.length) {
        const empty = document.createElement('li');
        empty.className = 'empty-state';
        empty.textContent = directoryEntries.length ? '검색 결과가 없습니다.' : '표시할 동료가 없습니다.';
        list.appendChild(empty);
        return;
      }
      pool.forEach(entry => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'add-item';
        const avatar = avatarImg(entry.avatar, entry.name, 'sm');
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.innerHTML = `<strong>${entry.name || ''}</strong><span>${displayDeptName(entry.department)}</span>`;
        btn.appendChild(avatar);
        btn.appendChild(meta);
        btn.addEventListener('click', async ()=>{
          closeAddMemberMenu();
          await addEntryToActiveConversation(entry);
        });
        list.appendChild(btn);
      });
    }

    search.addEventListener('input', renderOptions);
    renderOptions();

    const rect = anchor.getBoundingClientRect();
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    const menuWidth = 260;
    const menuHeight = 320;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const left = Math.min(scrollX + rect.right - menuWidth, scrollX + viewportWidth - menuWidth - 12);
    const top = Math.min(scrollY + rect.bottom + 8, scrollY + viewportHeight - menuHeight - 12);
    addMemberMenu.style.left = `${Math.max(scrollX + 12, left)}px`;
    addMemberMenu.style.top = `${Math.max(scrollY + 12, top)}px`;
    addMemberMenu.hidden = false;
    setTimeout(()=> search.focus(), 10);
  }

  // ===== Pinned messages (메시지 고정) =====
  const pinnedMap = {}; // convId -> array of pin items
  const pinBarEl = document.getElementById('chat-pinned-bar');
  const pinBarTextEl = document.getElementById('cpb-text');
  const pinBarCountEl = document.getElementById('cpb-count');
  const pinBarBodyBtn = document.getElementById('cpb-body');
  const pinBarListBtn = document.getElementById('cpb-list-btn');
  let pinBarPopoverEl = null;

  function pinPreviewText(item) {
    const msg = item && item.message;
    if (!msg) return '(메시지 없음)';
    const t = (msg.content_text || msg.content || '').trim();
    if (t) return t;
    if (msg.file_id || msg.content_type === 'FILE') return '[첨부파일]';
    return '(빈 메시지)';
  }

  function renderPinnedBar(convId) {
    if (!pinBarEl) return;
    const list = pinnedMap[convId] || [];
    if (!list.length) {
      pinBarEl.hidden = true;
      if (pinBarPopoverEl) pinBarPopoverEl.hidden = true;
      if (pinBarListBtn) pinBarListBtn.classList.remove('is-open');
      return;
    }
    pinBarEl.hidden = false;
    const top = list[0];
    if (pinBarTextEl) pinBarTextEl.textContent = pinPreviewText(top);
    if (pinBarBodyBtn) pinBarBodyBtn.setAttribute('data-msg-id', String(top.message_id || ''));
    if (pinBarCountEl) {
      if (list.length > 1) {
        pinBarCountEl.hidden = false;
        pinBarCountEl.textContent = `+${list.length - 1}`;
      } else {
        pinBarCountEl.hidden = true;
      }
    }
    if (pinBarPopoverEl && !pinBarPopoverEl.hidden) renderPinnedPopover(convId);
  }

  function renderPinnedPopover(convId) {
    if (!pinBarPopoverEl) return;
    const list = pinnedMap[convId] || [];
    pinBarPopoverEl.innerHTML = '';
    if (!list.length) {
      const empty = createEl('div', 'cpp-empty', '고정된 메시지가 없습니다');
      pinBarPopoverEl.appendChild(empty);
      return;
    }
    list.forEach(function(item){
      const row = createEl('div', 'cpp-item');
      row.setAttribute('data-msg-id', String(item.message_id || ''));
      const body = createEl('div');
      body.style.flex = '1';
      body.style.minWidth = '0';
      const text = createEl('div', 'cpp-text', pinPreviewText(item));
      const meta = createEl('div', 'cpp-meta', `${item.pinned_by && item.pinned_by.name ? item.pinned_by.name : ''} · ${item.pinned_at ? formatClockLabel(item.pinned_at) || '' : ''}`);
      body.appendChild(text);
      body.appendChild(meta);
      row.appendChild(body);
      const unpin = createEl('button', 'cpp-unpin', '해제');
      unpin.setAttribute('type', 'button');
      unpin.setAttribute('data-unpin-id', String(item.message_id || ''));
      row.appendChild(unpin);
      pinBarPopoverEl.appendChild(row);
    });
  }

  function ensurePinnedPopover() {
    if (pinBarPopoverEl || !pinBarEl) return;
    pinBarPopoverEl = createEl('div', 'chat-pinned-popover');
    pinBarPopoverEl.hidden = true;
    pinBarEl.appendChild(pinBarPopoverEl);
    pinBarPopoverEl.addEventListener('click', function(ev){
      const unpinBtn = ev.target.closest('[data-unpin-id]');
      if (unpinBtn) {
        ev.stopPropagation();
        const mid = parseInt(unpinBtn.getAttribute('data-unpin-id'), 10);
        if (mid) togglePinForMessage(mid, true);
        return;
      }
      const item = ev.target.closest('[data-msg-id]');
      if (item) {
        const mid = parseInt(item.getAttribute('data-msg-id'), 10);
        if (mid) scrollToMessage(mid);
      }
    });
  }

  function scrollToMessage(messageId) {
    if (!messagesEl || !messageId) return;
    const target = messagesEl.querySelector(`[data-msg-id="${messageId}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('is-pinned-target');
    // restart animation
    void target.offsetWidth;
    target.classList.add('is-pinned-target');
  }

  function loadPinnedMessages(convId) {
    const conv = conversations.find(function(c){ return c.id === convId; });
    if (!conv || !conv.roomId) {
      pinnedMap[convId] = [];
      renderPinnedBar(convId);
      return;
    }
    const url = `${chatConfig.apiRoot}/rooms/${conv.roomId}/pins`;
    fetch(url, { credentials: 'same-origin' })
      .then(function(r){ return r.ok ? r.json() : { items: [] }; })
      .then(function(data){
        pinnedMap[convId] = Array.isArray(data && data.items) ? data.items : [];
        renderPinnedBar(convId);
        // mark messages as pinned in messageMap
        const pinnedSet = new Set(pinnedMap[convId].map(function(p){ return p.message_id; }));
        const msgs = messageMap[convId] || [];
        let changed = false;
        msgs.forEach(function(m){
          const next = pinnedSet.has(m.id);
          if (!!m.pinned !== next) { m.pinned = next; changed = true; }
        });
        if (changed && activeId === convId) renderMessages(convId);
      })
      .catch(function(){
        pinnedMap[convId] = [];
        renderPinnedBar(convId);
      });
  }

  function togglePinForMessage(messageId, currentlyPinned) {
    const conv = conversations.find(function(c){ return c.id === activeId; });
    if (!conv || !conv.roomId) return;
    const url = `${chatConfig.apiRoot}/rooms/${conv.roomId}/messages/${messageId}/pin`;
    const opts = {
      method: currentlyPinned ? 'DELETE' : 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: currentlyPinned ? null : JSON.stringify({}),
    };
    fetch(url, opts)
      .then(function(r){ return r.ok ? r.json() : Promise.reject(r); })
      .then(function(){ loadPinnedMessages(conv.id); })
      .catch(function(err){
        try { console.error('pin toggle failed', err); } catch (_) {}
      });
  }

  // Click delegation for pin button on bubbles
  if (messagesEl) {
    messagesEl.addEventListener('click', function(ev){
      const btn = ev.target.closest('.msg-pin-btn');
      if (!btn) return;
      ev.stopPropagation();
      const mid = parseInt(btn.getAttribute('data-pin-msg'), 10);
      const isPinned = btn.getAttribute('data-pinned') === '1';
      if (mid) togglePinForMessage(mid, isPinned);
    });
  }

  // ===== Reactions: chip toggle + add picker =====
  const REACTION_EMOJIS = ['👍','👎','😀','😂','😍','😮','😢','😡','🎉','🔥','💯','✅','❗','🙏','👀','💡'];
  let reactPickerEl = null;

  function ensureReactPicker(){
    if (reactPickerEl) return reactPickerEl;
    reactPickerEl = createEl('div', 'react-picker-popover');
    reactPickerEl.hidden = true;
    document.body.appendChild(reactPickerEl);
    REACTION_EMOJIS.forEach(function(em){
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = em;
      b.setAttribute('data-emoji', em);
      reactPickerEl.appendChild(b);
    });
    reactPickerEl.addEventListener('click', function(ev){
      const btn = ev.target.closest('button[data-emoji]');
      if (!btn) return;
      ev.stopPropagation();
      const em = btn.getAttribute('data-emoji');
      const mid = parseInt(reactPickerEl.getAttribute('data-msg-id'), 10);
      if (mid && em) toggleReactionForMessage(mid, em);
      hideReactPicker();
    });
    document.addEventListener('click', function(ev){
      if (!reactPickerEl || reactPickerEl.hidden) return;
      if (reactPickerEl.contains(ev.target)) return;
      hideReactPicker();
    });
    return reactPickerEl;
  }
  function hideReactPicker(){
    if (reactPickerEl) reactPickerEl.hidden = true;
  }
  function showReactPickerFor(messageId, anchorEl){
    ensureReactPicker();
    reactPickerEl.setAttribute('data-msg-id', String(messageId));
    reactPickerEl.hidden = false;
    const r = anchorEl.getBoundingClientRect();
    const sx = window.scrollX || window.pageXOffset;
    const sy = window.scrollY || window.pageYOffset;
    reactPickerEl.style.position = 'absolute';
    reactPickerEl.style.left = (sx + Math.max(8, r.left - 4)) + 'px';
    reactPickerEl.style.top = (sy + Math.max(8, r.top - 200)) + 'px';
    setTimeout(function(){
      const pr = reactPickerEl.getBoundingClientRect();
      const vw = window.innerWidth;
      let left = parseFloat(reactPickerEl.style.left);
      let top = parseFloat(reactPickerEl.style.top);
      if (left + pr.width > sx + vw - 8) left = sx + vw - pr.width - 8;
      if (top - sy < 8) top = sy + r.bottom + 8;
      reactPickerEl.style.left = left + 'px';
      reactPickerEl.style.top = top + 'px';
    }, 0);
  }

  function toggleReactionForMessage(messageId, emoji){
    if (!messageId || !emoji) return;
    fetch(`${chatConfig.apiRoot}/messages/${messageId}/reactions`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji: emoji }),
    })
      .then(function(r){ return r.ok ? r.json() : Promise.reject(r); })
      .then(function(data){
        const list = Array.isArray(data && data.reactions) ? data.reactions.map(function(r){
          return {
            emoji: r.emoji,
            count: Number(r.count) || 0,
            mine: !!r.mine,
            userIds: Array.isArray(r.user_ids) ? r.user_ids.slice() : [],
          };
        }) : [];
        Object.keys(messageMap).forEach(function(cid){
          const arr = messageMap[cid];
          if (!arr) return;
          for (let i = 0; i < arr.length; i++) {
            if (arr[i] && arr[i].id === messageId) arr[i].reactions = list;
          }
        });
        if (activeId != null) renderMessages(activeId);
      })
      .catch(function(err){ try { console.error('reaction toggle failed', err); } catch(_){} });
  }

  if (messagesEl) {
    messagesEl.addEventListener('click', function(ev){
      const chip = ev.target.closest('.react-chip[data-react-emoji]');
      if (chip) {
        ev.stopPropagation();
        const mid = parseInt(chip.getAttribute('data-react-msg'), 10);
        const em = chip.getAttribute('data-react-emoji');
        if (mid && em) toggleReactionForMessage(mid, em);
        return;
      }
      const addBtn = ev.target.closest('.msg-react-btn[data-react-add]');
      if (addBtn) {
        ev.stopPropagation();
        const mid = parseInt(addBtn.getAttribute('data-react-add'), 10);
        if (mid) showReactPickerFor(mid, addBtn);
      }
    });
  }

  if (pinBarBodyBtn) {
    pinBarBodyBtn.addEventListener('click', function(){
      const mid = parseInt(pinBarBodyBtn.getAttribute('data-msg-id'), 10);
      if (mid) scrollToMessage(mid);
    });
  }
  if (pinBarListBtn) {
    pinBarListBtn.addEventListener('click', function(ev){
      ev.stopPropagation();
      ensurePinnedPopover();
      if (!pinBarPopoverEl) return;
      const willOpen = pinBarPopoverEl.hidden;
      if (willOpen) renderPinnedPopover(activeId);
      pinBarPopoverEl.hidden = !willOpen;
      pinBarListBtn.classList.toggle('is-open', willOpen);
    });
    document.addEventListener('click', function(ev){
      if (!pinBarPopoverEl || pinBarPopoverEl.hidden) return;
      if (pinBarEl && pinBarEl.contains(ev.target)) return;
      pinBarPopoverEl.hidden = true;
      pinBarListBtn.classList.remove('is-open');
    });
  }

  function setActive(id){
    activeId = id;
    state.activeDirectoryKey = null;
    closeAddMemberMenu();
    const conv = conversations.find(c => c.id === id) || null;
    const prevUnread = conv ? (conv.unread || 0) : 0;
    const prevInteracted = conv ? (conv.lastInteracted || 0) : 0;
    const isGroup = isGroupConversation(conv);

    if (delBtn) {
      // 서버는 방 생성자 또는 활성 멤버에게 삭제를 허용한다.
      // 대화 목록에 노출된 시점에서 사용자는 이미 활성 멤버이므로 클라이언트에서는 항상 활성화한다.
      const canDelete = !!conv;
      delBtn.disabled = !canDelete;
      delBtn.setAttribute('aria-disabled', canDelete ? 'false' : 'true');
      delBtn.title = '삭제';
    }
    if (leaveBtn) {
      const isCreator = !!(
        conv && conv.roomId && state.currentUserId != null && conv.createdByUserId != null
        && Number(conv.createdByUserId) === Number(state.currentUserId)
      );
      const canLeave = !!(conv && conv.roomId && state.currentUserId != null && !isCreator);
      leaveBtn.disabled = !canLeave;
      leaveBtn.setAttribute('aria-disabled', canLeave ? 'false' : 'true');
      leaveBtn.title = canLeave ? '나가기' : (isCreator ? '나가기(생성자는 불가)' : '나가기');
    }
    if (thread.nameEl) {
      thread.nameEl.textContent = conv ? displayNameForConversation(conv) : '';
    }
    updateProfilePanel(conv, isGroup);
    const contactForFavorite = conv && !isGroup ? primaryContact(conv) : null;
    if (conv){
      renderThreadAvatar(conv);
      conv._prevUnread = conv.unread || 0;
      conv.unread = 0;
      // Mark-read is deferred until after renderMessages so the unread divider
      // can use the previous lastReadMessageId during rendering.
      if (conv.roomId) {
        fetch(`${chatConfig.apiRoot}/rooms/${conv.roomId}/mark-read`, {
          method: 'POST', credentials: 'same-origin',
          headers: {'Content-Type': 'application/json'},
        }).then(function(r){ return r.json(); }).then(function(d){
          if (d && d.last_read_message_id != null) {
            conv.lastReadMessageId = d.last_read_message_id;
          }
        }).catch(function(){});
      }
      const last = (messageMap[id] || []).slice(-1)[0];
      if (last) {
        conv.preview = last.text;
        if (last.createdAt != null) {
          conv.lastInteracted = last.createdAt;
        }
      }
      conv.previewSignature = computePreviewSignature(conv.preview, conv.lastInteracted);
      if (favBtn) {
        const canFavorite = !!contactForFavorite;
        favBtn.disabled = !canFavorite;
        favBtn.setAttribute('aria-disabled', canFavorite ? 'false' : 'true');
        favBtn.setAttribute('aria-pressed', canFavorite && conv.fav ? 'true' : 'false');
      }
    } else if (favBtn){
      favBtn.disabled = true;
      favBtn.setAttribute('aria-disabled', 'true');
      favBtn.setAttribute('aria-pressed', 'false');
    }
    Array.from(listEl?.children || []).forEach(li => {
      const directMatch = li.dataset.id === id;
      let directoryMatch = false;
      if (!directMatch && li.dataset.entryKey) {
        const entry = directoryEntries.find(e => e.key === li.dataset.entryKey);
        directoryMatch = !!(entry && entry.convIds.includes(id));
      }
      li.classList.toggle('active', directMatch || directoryMatch);
    });
    if (conv && state.isLive && conv.roomId) {
      ensureMessagesLoaded(conv.roomId, { force: true });
    }
    renderMessages._forceScroll = true;
    renderMessages(id && conv ? id : null);
    if (id && conv && conv.roomId) {
      loadPinnedMessages(id);
    } else if (pinBarEl) {
      pinBarEl.hidden = true;
      if (pinBarPopoverEl) pinBarPopoverEl.hidden = true;
    }

    // Now that the divider has been rendered, update lastReadMessageId to latest.
    if (conv && conv.roomId) {
      const localMsgs = messageMap[id] || [];
      if (localMsgs.length) {
        conv.lastReadMessageId = localMsgs[localMsgs.length - 1].id;
      }
    }
    // Clean up temp unread snapshot.
    if (conv) delete conv._prevUnread;

    // Keep the left conversation list in sync (badge/order/preview), but avoid
    // needless rerenders when nothing changed.
    const currentFilter = getActiveFilter();
    const needsSync = !!(conv && (prevUnread > 0 || (conv.lastInteracted || 0) !== prevInteracted));
    if (needsSync && currentFilter !== 'colleagues') {
      renderList(currentFilter, searchEl?.value || '');
    }
    if (thread.nameEl) {
      const editable = !!(conv && isGroup);
      thread.nameEl.classList.toggle('is-editable', editable);
      thread.nameEl.title = editable ? '더블클릭하여 채팅방 이름을 수정하세요' : '';
    }
    if (profileEmailBtn) {
      profileEmailBtn.disabled = !conv;
      profileEmailBtn.setAttribute('aria-disabled', conv ? 'false' : 'true');
      if (conv) {
        profileEmailBtn.title = isGroup ? '참여자 모두에게 이메일 보내기' : '이메일 보내기';
      } else {
        profileEmailBtn.title = '';
      }
    }
    if (profile.infoWrap && profile.membersWrap){
      if (conv && isGroup){
        profile.infoWrap.hidden = true;
        profile.membersWrap.hidden = false;
        renderMembers(conv);
      } else {
        profile.infoWrap.hidden = false;
        profile.membersWrap.hidden = true;
      }
    }
  }

  listEl?.addEventListener('click', async (e)=>{
    const toggle = e.target.closest('.dept-toggle');
    if (toggle) {
      if (toggle.getAttribute('data-locked') === 'true') return;
      const dept = toggle.getAttribute('data-dept');
      if (dept) {
        if (expandedDepartments.has(dept)) expandedDepartments.delete(dept);
        else expandedDepartments.add(dept);
        renderList(getActiveFilter(), searchEl.value);
      }
      return;
    }
    const li = e.target.closest('.chat-item');
    if (!li) return;
    const entryKey = li.dataset.entryKey;
    const entry = entryKey ? directoryEntries.find(d => d.key === entryKey) : null;
    const convId = li.dataset.id;
    if (entry) {
      await startConversationFromEntry(entry);
      return;
    }
    if (convId) {
      setActive(convId);
      renderList(getActiveFilter(), searchEl.value);
    }
  });

  function updateSearchPlaceholder(byFilter){
    if (!searchEl) return;
    if (byFilter === 'colleagues') searchEl.setAttribute('placeholder', '동료 검색(이름, 부서)...');
    else if (byFilter === 'favorites') searchEl.setAttribute('placeholder', '즐겨찾기한 동료 검색...');
    else searchEl.setAttribute('placeholder', '사람, 그룹, 메시지 검색...');
  }

  tabs.forEach(tab => tab.addEventListener('click', ()=>{
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const f = tab.getAttribute('data-filter');
    updateSearchPlaceholder(f);
    setDeptFilterVisibility(f);
    renderList(f, searchEl.value);
  }));

  searchEl?.addEventListener('input', ()=>{
    renderList(getActiveFilter(), searchEl.value);
  });

  deptFilterSelect?.addEventListener('change', ()=>{
    currentDeptFilter = deptFilterSelect.value || 'ALL';
    if (currentDeptFilter !== 'ALL') {
      expandedDepartments.add(currentDeptFilter);
    }
    if (getActiveFilter() === 'colleagues') {
      renderList('colleagues', searchEl.value);
    }
  });

  function pushMessageToThread(convId, message){
    if (!convId || !message) return;
    const bucket = messageMap[convId] = messageMap[convId] || [];
    bucket.push(message);
    if (convId === activeId) {
      renderMessages(convId);
    }
  }

  async function send(){
    const text = (inputEl.value || '').trim();
    if (!text && !pendingFiles.length) return;
    let conv = conversations.find(c => c.id === activeId);
    if (!conv) return;
    const attachments = pendingFiles.slice();
    inputEl.value = '';
    pendingFiles = [];
    renderPendingAttachments();
    const when = new Date().toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'});
    const localMessage = { id: Date.now(), who: 'out', text: text || '', time: when };
    if (attachments.length) {
      localMessage.files = attachments.map(f => ({
        name: f?.name || '파일',
        size: f?.size,
        url: (f && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') ? URL.createObjectURL(f) : '',
      }));
    }

    const finalize = (previewText, displayLabel = when)=>{
      if (conv) {
        conv.preview = previewText || '';
        if (displayLabel) {
          conv.displayTime = displayLabel;
          conv.time = displayLabel;
        }
        conv.lastInteracted = Date.now();
        conv.previewSignature = computePreviewSignature(conv.preview, conv.lastInteracted);
        conv.unread = 0;
      }
      updateLastInteraction(activeId);
      renderList(getActiveFilter(), searchEl.value);
    };

    const restoreDraft = ()=>{
      inputEl.value = text;
      pendingFiles = attachments.slice();
      renderPendingAttachments();
    };

    const requiresServer = !!(conv && conv.roomType !== 'SELF' && !isSelfConversation(conv));
    const isFileOnly = !text && attachments.length;

    if (requiresServer) {
      // Ensure we have a usable server-side identity.
      try {
        if (state.currentUserId == null) {
          await ensureCurrentUserId();
        }
      } catch (err) {
        console.warn('[chat] whoami lookup failed', err);
      }
      if (state.currentUserId == null) {
        restoreDraft();
        window.alert('로그인 정보를 확인할 수 없어 메시지를 보낼 수 없습니다. 새로고침 후 다시 시도해주세요.');
        return;
      }

      // If this is a synthetic/direct conversation without a room yet, try creating it now.
      let _lastEntry = null;
      let _lastErr = null;
      if (!conv.roomId && chatConfig.roomsUrl) {
        const entry = findEntryForConversation(conv) || buildPseudoEntryFromConversation(conv);
        _lastEntry = entry;
        console.warn('[chat-send-debug] currentUserId=', state.currentUserId, 'entry=', entry, 'conv=', { id: conv.id, name: conv.name, roomType: conv.roomType, roomId: conv.roomId, members: conv.members });
        // Fallback: if entry exists but userId is missing, try to look it up by name+department from directory
        if (entry && entry.userId == null && Array.isArray(directory)) {
          const candidate = directory.find(u => (u.name || '') === (entry.name || '') && (u.department || '') === (entry.department || ''));
          if (candidate && candidate.id != null) {
            entry.userId = Number(candidate.id);
            console.warn('[chat-send-debug] entry.userId resolved via directory lookup ->', entry.userId);
          }
        }
        if (entry) {
          try {
            const created = await createDirectRoomForEntry(entry);
            if (created && created.id) {
              setActive(created.id);
              conv = created;
            }
          } catch (err) {
            _lastErr = err;
            console.warn('[chat] Failed to create room before send', err);
          }
        }
      }

      if (!conv.roomId) {
        restoreDraft();
        const detail = (_lastEntry == null)
          ? '대상 사용자 정보를 찾을 수 없습니다'
          : (_lastEntry.userId == null ? '대상 사용자 ID(userId)가 비어있습니다 (' + (_lastEntry.name || '?') + ')' : (_lastErr ? ('서버 오류: ' + _lastErr.message) : '서버 응답 없음'));
        window.alert('채팅방을 만들 수 없어 메시지를 보낼 수 없습니다.\n' + detail + '\n(F12 콘솔에서 [chat-send-debug] 로그 확인)');
        return;
      }
    }

    if (conv.roomId && chatConfig.roomsUrl && state.currentUserId != null) {
      try {
        // For file-only messages, upload first so we don't create an empty message
        // when the upload fails (e.g. 16MB limit).
        const preUploaded = [];
        if (isFileOnly && attachments.length) {
          for (const f of attachments) {
            const fd = new FormData();
            fd.append('file', f);
            const up = await fetch(UPLOADS_API_URL, {
              method: 'POST',
              credentials: 'same-origin',
              body: fd,
            });
            if (!up.ok) {
              if (up.status === 413) {
                throw new Error('upload too large');
              }
              throw new Error(`upload failed (${up.status})`);
            }
            const upRec = await up.json();
            preUploaded.push({ file: f, rec: upRec });
          }
          if (!preUploaded.length) {
            throw new Error('upload failed');
          }
        }

        const payload = {
          sender_user_id: state.currentUserId,
          content_type: (!text && attachments.length) ? 'FILE' : 'TEXT',
          content_text: text || '',
        };
        let resp = await fetch(`${buildRoomUrl(conv.roomId)}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        });

        // If the room disappeared (deleted/stale id), attempt to recover once.
        if (resp.status === 404) {
          try {
            await hydrateFromApi({ silent: true });
            const pseudoEntry = buildPseudoEntryFromConversation(conv);
            if (pseudoEntry) {
              const ensured = await createDirectRoomForEntry(pseudoEntry);
              if (ensured && ensured.roomId) {
                resp = await fetch(`${buildRoomUrl(ensured.roomId)}/messages`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'same-origin',
                  body: JSON.stringify(payload),
                });
              }
            }
          } catch (recoverErr) {
            console.warn('[chat] Failed to recover missing room', recoverErr);
          }
        }

        if (!resp.ok) {
          throw new Error(`message create failed (${resp.status})`);
        }
        const saved = await resp.json();

        // Upload attachments and link them to the message.
        let attachedFiles = [];
        if (attachments.length) {
          let failedCount = 0;
          let tooLargeCount = 0;

          const uploadAndAttach = async (file, upRec)=>{
            const fileMetaResp = await fetch(`${chatConfig.apiRoot}/messages/${saved.id}/files`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: JSON.stringify({
                file_path: `/api/uploads/${upRec.id}/download`,
                original_name: upRec.name || file.name,
                file_size: upRec.size,
                content_type: file.type || '',
                uploaded_by_user_id: state.currentUserId,
              }),
            });
            if (!fileMetaResp.ok) {
              throw new Error(`file metadata save failed (${fileMetaResp.status})`);
            }
            const fileMeta = await fileMetaResp.json();
            attachedFiles.push(fileMeta);
          };

          if (isFileOnly) {
            // We already uploaded everything above.
            try {
              for (const item of preUploaded) {
                await uploadAndAttach(item.file, item.rec);
              }
            } catch (err) {
              // Best-effort cleanup: don't leave an empty file-only message around.
              try {
                await fetch(`${chatConfig.apiRoot}/messages/${saved.id}`, {
                  method: 'DELETE',
                  credentials: 'same-origin',
                });
              } catch (cleanupErr) {
                console.warn('[chat] Failed to cleanup message after file attach error', cleanupErr);
              }
              throw err;
            }
          } else {
            // Text+attachments: message delivery should succeed even if a file upload fails.
            for (const f of attachments) {
              try {
                const fd = new FormData();
                fd.append('file', f);
                const up = await fetch(UPLOADS_API_URL, {
                  method: 'POST',
                  credentials: 'same-origin',
                  body: fd,
                });
                if (!up.ok) {
                  failedCount += 1;
                  if (up.status === 413) tooLargeCount += 1;
                  continue;
                }
                const upRec = await up.json();
                await uploadAndAttach(f, upRec);
              } catch (err) {
                failedCount += 1;
                console.warn('[chat] Attachment upload failed', err);
              }
            }

            if (failedCount) {
              if (tooLargeCount) {
                window.alert('일부 첨부파일이 16MB 제한을 초과하여 업로드되지 않았습니다.');
              } else {
                window.alert('일부 첨부파일 업로드에 실패했습니다.');
              }
            }
          }
        }

        const mapped = mapMessageFromApi({ ...saved, files: attachedFiles });
        pushMessageToThread(conv.id, mapped);
        // Align activity ordering/signatures with server timestamps when available.
        if (mapped && mapped.createdAt != null) {
          conv.lastInteracted = mapped.createdAt;
        }
        finalize(text || (attachments.length ? '[첨부파일]' : ''), mapped?.time || when);
        return;
      } catch (err) {
        console.warn('[chat] Failed to send via API', err);
        // For file-only messages, keep the draft so the user can retry/remove the file.
        // For text messages, don't force the same attachment loop forever.
        if (isFileOnly) {
          restoreDraft();
        }
        const msg = String(err && err.message ? err.message : '');
        if (msg.includes('upload too large')) {
          window.alert('첨부파일은 16MB 이하만 전송할 수 있습니다.');
        } else {
          window.alert('메시지 전송에 실패했습니다. 잠시 후 다시 시도해주세요.');
        }
        return;
      }
    }

    // Offline/local-only send is allowed only for SELF memo conversations.
    if (!requiresServer) {
      pushMessageToThread(conv.id, localMessage);
      finalize(text, when);
    } else {
      restoreDraft();
      window.alert('메시지 전송에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  // ---- @ / # 자동완성 팝오버 ----
  // @ = 사람 (directoryEntries), # = 채널 (conversations)
  const MENTION_MAX_ITEMS = 8;
  let mentionPopoverEl = null;
  let mentionState = { open: false, trigger: null, query: '', start: -1, items: [], activeIdx: 0 };

  function ensureMentionPopover(){
    if (mentionPopoverEl) return mentionPopoverEl;
    const el = document.createElement('div');
    el.className = 'mention-popover';
    el.setAttribute('role', 'listbox');
    el.hidden = true;
    document.body.appendChild(el);
    mentionPopoverEl = el;
    el.addEventListener('mousedown', function(ev){ ev.preventDefault(); }); // 포커스 유지
    el.addEventListener('click', function(ev){
      const li = ev.target.closest('[data-mention-idx]');
      if (!li) return;
      const idx = parseInt(li.getAttribute('data-mention-idx'), 10);
      if (!isNaN(idx)) commitMentionSelection(idx);
    });
    return el;
  }

  function hideMentionPopover(){
    mentionState.open = false;
    mentionState.items = [];
    if (mentionPopoverEl) mentionPopoverEl.hidden = true;
  }

  function getCaretPos(){
    if (!inputEl) return 0;
    const v = inputEl.selectionStart;
    return (typeof v === 'number') ? v : (inputEl.value || '').length;
  }

  // 캐럿 직전 텍스트에서 @xxx 또는 #xxx 토큰을 찾는다. 공백/줄바꿈 또는 시작점에서만 트리거.
  function detectMentionToken(){
    if (!inputEl) return null;
    const value = inputEl.value || '';
    const caret = getCaretPos();
    const before = value.slice(0, caret);
    // 토큰: 공백/시작 직후 @ 또는 # 로 시작, 이후 공백 없는 문자
    const m = before.match(/(^|[\s\n])([@#])([^\s@#]*)$/);
    if (!m) return null;
    const trigger = m[2];
    const query = m[3] || '';
    const start = before.length - (m[2].length + query.length);
    return { trigger, query, start };
  }

  function searchMentionCandidates(trigger, query){
    const q = (query || '').trim().toLowerCase();
    if (trigger === '@') {
      const list = (Array.isArray(directoryEntries) ? directoryEntries : []).slice();
      const filtered = q ? list.filter(function(e){
        const n = (e.name || '').toLowerCase();
        const dept = (typeof displayDeptName === 'function' ? displayDeptName(e.department) : (e.department || '')).toLowerCase();
        const job = (e.job || '').toLowerCase();
        return n.indexOf(q) !== -1 || dept.indexOf(q) !== -1 || job.indexOf(q) !== -1;
      }) : list;
      return filtered.slice(0, MENTION_MAX_ITEMS).map(function(e){
        return {
          label: e.name || '(이름없음)',
          sub: (typeof displayDeptName === 'function' ? displayDeptName(e.department) : (e.department || '')) + (e.job ? ' · ' + e.job : ''),
          insertText: '@' + (e.name || '').replace(/\s+/g, ''),
        };
      });
    }
    if (trigger === '#') {
      const list = (Array.isArray(conversations) ? conversations : []).slice();
      const filtered = q ? list.filter(function(c){
        return (c.name || '').toLowerCase().indexOf(q) !== -1;
      }) : list;
      return filtered.slice(0, MENTION_MAX_ITEMS).map(function(c){
        return {
          label: c.name || '(이름없음)',
          sub: c.roomId ? '채널' : '대화',
          insertText: '#' + (c.name || '').replace(/\s+/g, ''),
        };
      });
    }
    return [];
  }

  function renderMentionPopover(){
    const el = ensureMentionPopover();
    el.innerHTML = '';
    if (!mentionState.items.length) {
      const empty = document.createElement('div');
      empty.className = 'mention-empty';
      empty.textContent = '검색 결과가 없습니다';
      el.appendChild(empty);
    } else {
      mentionState.items.forEach(function(item, i){
        const row = document.createElement('div');
        row.className = 'mention-item' + (i === mentionState.activeIdx ? ' is-active' : '');
        row.setAttribute('data-mention-idx', String(i));
        row.setAttribute('role', 'option');
        const label = document.createElement('div');
        label.className = 'mention-label';
        label.textContent = item.label;
        row.appendChild(label);
        if (item.sub) {
          const sub = document.createElement('div');
          sub.className = 'mention-sub';
          sub.textContent = item.sub;
          row.appendChild(sub);
        }
        el.appendChild(row);
      });
    }
    positionMentionPopover();
    el.hidden = false;
  }

  function positionMentionPopover(){
    if (!mentionPopoverEl || !inputEl) return;
    const rect = inputEl.getBoundingClientRect();
    const popH = mentionPopoverEl.offsetHeight || 200;
    let top = rect.top - popH - 6;
    if (top < 8) top = rect.bottom + 6; // 위쪽 공간 부족 시 아래로
    let left = rect.left;
    const maxLeft = window.innerWidth - 280;
    if (left > maxLeft) left = maxLeft;
    if (left < 8) left = 8;
    mentionPopoverEl.style.top = top + 'px';
    mentionPopoverEl.style.left = left + 'px';
  }

  function updateMentionPopover(){
    if (!inputEl) return;
    const tok = detectMentionToken();
    if (!tok) { hideMentionPopover(); return; }
    const items = searchMentionCandidates(tok.trigger, tok.query);
    mentionState.open = true;
    mentionState.trigger = tok.trigger;
    mentionState.query = tok.query;
    mentionState.start = tok.start;
    mentionState.items = items;
    if (mentionState.activeIdx >= items.length) mentionState.activeIdx = 0;
    if (mentionState.activeIdx < 0) mentionState.activeIdx = 0;
    renderMentionPopover();
  }

  function commitMentionSelection(idx){
    if (!inputEl || !mentionState.open) return;
    const item = mentionState.items[idx];
    if (!item) { hideMentionPopover(); return; }
    const value = inputEl.value || '';
    const caret = getCaretPos();
    const before = value.slice(0, mentionState.start);
    const after = value.slice(caret);
    const insert = item.insertText + ' ';
    inputEl.value = before + insert + after;
    const newCaret = (before + insert).length;
    try { inputEl.setSelectionRange(newCaret, newCaret); } catch(_){}
    hideMentionPopover();
    inputEl.focus();
  }

  if (inputEl) {
    inputEl.addEventListener('input', updateMentionPopover);
    inputEl.addEventListener('blur', function(){ setTimeout(hideMentionPopover, 120); });
    // 자동완성 keydown은 send용 keydown보다 먼저 등록되어야 Enter 가로채기가 가능하다.
    inputEl.addEventListener('keydown', function(e){
      if (!mentionState.open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (mentionState.items.length) {
          mentionState.activeIdx = (mentionState.activeIdx + 1) % mentionState.items.length;
          renderMentionPopover();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (mentionState.items.length) {
          mentionState.activeIdx = (mentionState.activeIdx - 1 + mentionState.items.length) % mentionState.items.length;
          renderMentionPopover();
        }
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (mentionState.items.length) {
          e.preventDefault();
          e.stopImmediatePropagation(); // send 방지
          commitMentionSelection(mentionState.activeIdx);
        } else {
          hideMentionPopover();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hideMentionPopover();
      }
    });
    window.addEventListener('resize', function(){ if (mentionState.open) positionMentionPopover(); });
    window.addEventListener('scroll', function(){ if (mentionState.open) positionMentionPopover(); }, true);
  }

  inputEl?.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') send(); });
  sendBtn?.addEventListener('click', send);

  // Attachments handling
  let pendingFiles = [];
  let attachmentsRow = null;
  function renderPendingAttachments(){
    if (!pendingFiles.length){
      if (attachmentsRow){ attachmentsRow.remove(); attachmentsRow = null; }
      return;
    }
    if (!attachmentsRow){
      attachmentsRow = document.createElement('div');
      attachmentsRow.className = 'attachments attachments-temp';
      // place the row just above the input footer
      threadInputEl?.parentElement?.insertBefore(attachmentsRow, threadInputEl);
    }
    attachmentsRow.innerHTML = '';
    pendingFiles.forEach((f, idx)=>{
      const chip = createEl('div', 'attachment-chip', `${f.name}`);
      const rm = createEl('button', 'remove', '×');
      rm.addEventListener('click', ()=>{ pendingFiles.splice(idx,1); renderPendingAttachments(); });
      chip.appendChild(rm);
      attachmentsRow.appendChild(chip);
    });
  }
  attachBtn?.addEventListener('click', ()=> fileInput?.click());
  fileInput?.addEventListener('change', (e)=>{
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    pendingFiles.push(...files);
    fileInput.value = '';
    renderPendingAttachments();
  });

  // Emoji picker (lightweight, local list)
  const EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😎','🤔','👍','👎','🙏','👏','🔥','💯','✨','🎉','✅','❗','❓','🚀','💡','📎','🗂️','📝','📌','📍','📅','⏰','📞','💬'];
  function openEmoji(){
    if (!emojiPopover) return;
    emojiPopover.innerHTML = '';
    EMOJIS.forEach(e=>{
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = e;
      b.addEventListener('click', ()=>{ inputEl.value += e; inputEl.focus(); closeEmoji(); });
      emojiPopover.appendChild(b);
    });
    emojiPopover.hidden = false;
    emojiPopover.setAttribute('aria-hidden','false');
    document.addEventListener('click', onDocClickEmoji, { once: true });
  }
  function closeEmoji(){ if (!emojiPopover) return; emojiPopover.hidden = true; emojiPopover.setAttribute('aria-hidden','true'); }
  function onDocClickEmoji(ev){ if (!emojiPopover.contains(ev.target) && ev.target !== emojiBtn) closeEmoji(); }
  emojiBtn?.addEventListener('click', (e)=>{ e.stopPropagation(); if (emojiPopover.hidden) openEmoji(); else closeEmoji(); });

  // init
  updateSearchPlaceholder('all');
  rebuildDirectory();
  renderList('all', '');
  setDeptFilterVisibility('all');
  setActive(activeId);
  // cleanup stray visuals
  renderPendingAttachments(); // will remove empty row if any
  if (emojiPopover){ emojiPopover.hidden = true; emojiPopover.setAttribute('aria-hidden','true'); }
  // periodic refresh of recent label (once per minute)
  __chatRegisterInterval(setInterval(() => {
    const conv = conversations.find(c => c.id === activeId);
    if (conv && conv.lastInteracted && profile.lastEl){
      profile.lastEl.textContent = formatRelative(conv.lastInteracted);
    }
  }, 60000));

  hydrateDirectoryFromApi();
  // Resolve the authoritative current user id from the server session.
  // Even if a profileId was injected into the page, it can be stale/incorrect,
  // which breaks leave/join checks and can cause history to reappear.
  let whoamiRequested = false;
  async function ensureCurrentUserId(options = {}){
    const { force = false } = options;
    if (whoamiRequested && !force) return;
    if (!chatConfig.apiRoot) return;
    whoamiRequested = true;
    try {
      const resp = await fetch(`${chatConfig.apiRoot}/whoami`, { credentials: 'same-origin' });
      if (!resp.ok) return;
      const data = await resp.json();
      const uid = Number(data?.user_id);
      if (Number.isFinite(uid)) {
        state.currentUserId = uid;
        chatConfig.profileId = uid;
      }
      if (data?.profile_image) {
        state.currentUserImage = data.profile_image;
        chatConfig.userImage = data.profile_image;
      }
    } catch (err) {
      console.warn('[chat] Failed to resolve whoami', err);
    }
  }

  ensureCurrentUserId().finally(()=>{
    // Initialize current user's profile image from DB
    if (state.currentUserImage && profile.avatarEl) {
      renderAvatarInto(profile.avatarEl, state.currentUserImage, chatConfig.userName || '');
    }
    syncHeaderAvatarWithSelf();
    hydrateFromApi();
  });

  function closeDeleteModal(){
    if (!deleteModal) return;
    deleteModal.hidden = true;
    deleteModal.setAttribute('aria-hidden','true');
    deleteModal.classList.remove('open');
    pendingDeleteId = null;
  }

  function openInfoModal(message, opts){
    const options = opts || {};
    if (!infoModal || !infoModalMessage) {
      try { window.alert(message); } catch(_) {}
      return;
    }
    if (infoModalTitle) infoModalTitle.textContent = options.title || '알림';
    if (infoModalIcon) infoModalIcon.textContent = options.icon || 'ℹ️';
    infoModalMessage.textContent = message || '';
    infoModal.hidden = false;
    infoModal.setAttribute('aria-hidden','false');
    infoModal.classList.add('open');
    setTimeout(()=> infoModalConfirm?.focus(), 20);
  }
  function closeInfoModal(){
    if (!infoModal) return;
    infoModal.hidden = true;
    infoModal.setAttribute('aria-hidden','true');
    infoModal.classList.remove('open');
  }
  infoModalConfirm?.addEventListener('click', closeInfoModal);
  infoModalBackdrop?.addEventListener('click', closeInfoModal);

  // === 메시지 검색 모달 ===
  let searchScope = 'room';
  let searchDebounceTimer = null;
  let searchRequestSeq = 0;

  function escapeHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function highlightSnippet(snippet, q){
    const safe = escapeHtml(snippet);
    if (!q) return safe;
    try {
      const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
      return safe.replace(re, '<mark>$1</mark>');
    } catch(_) { return safe; }
  }
  function formatSearchTime(ts){
    if (!ts) return '';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return '';
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      if (sameDay) {
        return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      }
      return (d.getMonth()+1) + '/' + d.getDate();
    } catch(_) { return ''; }
  }
  function findConvByRoomId(roomId){
    return conversations.find(function(c){ return c.roomId === roomId; });
  }
  function openSearchModal(){
    if (!searchModal) return;
    searchModal.hidden = false;
    searchModal.setAttribute('aria-hidden','false');
    searchModal.classList.add('open');
    if (searchModalInput) {
      searchModalInput.value = '';
      setTimeout(function(){ searchModalInput.focus(); }, 30);
    }
    if (searchModalResults) searchModalResults.innerHTML = '';
    if (searchModalStatus) searchModalStatus.textContent = '검색어를 입력하세요.';
    setSearchScope(activeId ? 'room' : 'global');
  }
  function closeSearchModal(){
    if (!searchModal) return;
    searchModal.hidden = true;
    searchModal.setAttribute('aria-hidden','true');
    searchModal.classList.remove('open');
    if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null; }
  }
  function setSearchScope(scope){
    searchScope = scope;
    if (searchModalScopeBtns) {
      searchModalScopeBtns.forEach(function(b){
        if (b.getAttribute('data-scope') === scope) b.classList.add('is-active');
        else b.classList.remove('is-active');
      });
    }
    // 활성 채팅방이 없으면 room scope 비활성화
    if (scope === 'room' && !activeId) {
      searchScope = 'global';
      if (searchModalScopeBtns) {
        searchModalScopeBtns.forEach(function(b){
          if (b.getAttribute('data-scope') === 'global') b.classList.add('is-active');
          else b.classList.remove('is-active');
        });
      }
    }
    if (searchModalInput && searchModalInput.value.trim().length >= 1) {
      runSearch(searchModalInput.value);
    }
  }
  function runSearch(q){
    const keyword = (q || '').trim();
    const seq = ++searchRequestSeq;
    if (!searchModalResults || !searchModalStatus) return;
    if (keyword.length < (searchScope === 'global' ? 2 : 1)) {
      searchModalResults.innerHTML = '';
      searchModalStatus.textContent = searchScope === 'global'
        ? '전체 검색은 2자 이상 입력해주세요.'
        : '검색어를 입력하세요.';
      return;
    }
    searchModalStatus.textContent = '검색 중…';

    let url;
    if (searchScope === 'room') {
      const conv = activeId ? conversations.find(function(c){ return c.id === activeId; }) : null;
      if (!conv || !conv.roomId) {
        searchModalStatus.textContent = '현재 선택된 채팅방이 없습니다.';
        searchModalResults.innerHTML = '';
        return;
      }
      const params = new URLSearchParams({ q: keyword, limit: '50' });
      if (state.currentUserId != null) params.set('viewer_user_id', String(state.currentUserId));
      url = chatConfig.apiRoot + '/rooms/' + conv.roomId + '/search?' + params.toString();
    } else {
      const params = new URLSearchParams({ q: keyword, limit: '50' });
      if (state.currentUserId != null) params.set('viewer_user_id', String(state.currentUserId));
      url = chatConfig.apiRoot + '/search?' + params.toString();
    }
    fetch(url, { credentials: 'same-origin' })
      .then(function(r){ return r.ok ? r.json() : { items: [] }; })
      .then(function(data){
        if (seq !== searchRequestSeq) return;
        const items = (data && Array.isArray(data.items)) ? data.items : [];
        renderSearchResults(items, keyword);
      })
      .catch(function(){
        if (seq !== searchRequestSeq) return;
        searchModalStatus.textContent = '검색 중 오류가 발생했습니다.';
        searchModalResults.innerHTML = '';
      });
  }
  function renderSearchResults(items, keyword){
    if (!searchModalResults || !searchModalStatus) return;
    searchModalResults.innerHTML = '';
    if (!items.length) {
      searchModalStatus.textContent = '검색 결과가 없습니다.';
      return;
    }
    searchModalStatus.textContent = items.length + '건의 메시지를 찾았습니다.';
    const frag = document.createDocumentFragment();
    items.forEach(function(it){
      const li = document.createElement('li');
      li.className = 'chat-search-result';
      li.setAttribute('data-msg-id', String(it.id || ''));
      li.setAttribute('data-room-id', String(it.room_id || ''));
      const conv = findConvByRoomId(it.room_id);
      const roomName = conv ? (conv.name || '채팅방') : ('#' + (it.room_id || ''));
      const senderName = it.sender_user_name || it.sender_name || ('사용자 ' + (it.sender_user_id || ''));
      const timeStr = formatSearchTime(it.created_at);
      const snippet = highlightSnippet(it.snippet || it.text || '', keyword);
      const showRoomBadge = (searchScope === 'global');
      li.innerHTML =
        '<div class="chat-search-result__top">' +
          '<span class="chat-search-result__name">' + escapeHtml(senderName) + '</span>' +
          (showRoomBadge ? '<span class="chat-search-result__room">' + escapeHtml(roomName) + '</span>' : '') +
          '<span class="chat-search-result__time">' + escapeHtml(timeStr) + '</span>' +
        '</div>' +
        '<div class="chat-search-result__snippet">' + snippet + '</div>';
      li.addEventListener('click', function(){
        jumpToSearchResult(it.room_id, it.id);
      });
      frag.appendChild(li);
    });
    searchModalResults.appendChild(frag);
  }
  function flashSearchTarget(messageId){
    if (!messagesEl || !messageId) return false;
    const target = messagesEl.querySelector('[data-msg-id="' + messageId + '"]');
    if (!target) return false;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('is-search-target');
    void target.offsetWidth;
    target.classList.add('is-search-target');
    return true;
  }
  function jumpToSearchResult(roomId, messageId){
    if (!messageId) return;
    const conv = findConvByRoomId(roomId);
    closeSearchModal();
    if (!conv) {
      openInfoModal('해당 채팅방에 접근할 수 없습니다.', { title: '이동 불가', icon: '⚠️' });
      return;
    }
    const needSwitch = (activeId !== conv.id);
    if (needSwitch) {
      setActive(conv.id);
    }
    // 메시지 로드 후 스크롤 시도 (최대 1.5초 대기)
    let tries = 0;
    function tryScroll(){
      tries += 1;
      if (flashSearchTarget(messageId)) return;
      if (tries < 30) {
        setTimeout(tryScroll, 50);
      }
    }
    setTimeout(tryScroll, needSwitch ? 200 : 0);
  }
  if (btnMsgSearch) btnMsgSearch.addEventListener('click', openSearchModal);
  if (searchModalClose) searchModalClose.addEventListener('click', closeSearchModal);
  if (searchModalBackdrop) searchModalBackdrop.addEventListener('click', closeSearchModal);
  if (searchModalScopeBtns) {
    searchModalScopeBtns.forEach(function(b){
      b.addEventListener('click', function(){ setSearchScope(b.getAttribute('data-scope')); });
    });
  }
  if (searchModalInput) {
    searchModalInput.addEventListener('input', function(){
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      const v = searchModalInput.value;
      searchDebounceTimer = setTimeout(function(){ runSearch(v); }, 220);
    });
    searchModalInput.addEventListener('keydown', function(ev){
      if (ev.key === 'Escape') { closeSearchModal(); }
    });
  }

  function performDeleteConversation(targetId, options = {}){
    if (!targetId) return;
    const { isLive = false } = options;
    if (isLive) rememberDeletedRoomId(targetId);
    const idx = conversations.findIndex(c => c.id === targetId);
    if (idx < 0) return;
    tombstoneContactForConversation(conversations[idx]);
    conversations.splice(idx, 1);
    delete messageMap[targetId];
    favoriteStore.convIds.delete(targetId);
    persistFavoriteStore();
    rebuildDirectory();
    const nextIndex = Math.min(idx, conversations.length - 1);
    const next = nextIndex >= 0 ? conversations[nextIndex] : null;
    renderList(getActiveFilter(), searchEl.value);
    if (next) {
      setActive(next.id);
    } else {
      activeId = null;
      if (messagesEl) messagesEl.innerHTML = '';
      if (thread.nameEl) thread.nameEl.textContent = '';
      if (thread.avatarEl) thread.avatarEl.innerHTML = '';
      if (profile.nameEl) profile.nameEl.textContent = '';
    }
  }

  function performLeaveConversation(targetId){
    if (!targetId) return;
    const idx = conversations.findIndex(c => c.id === targetId);
    if (idx < 0) return;
    conversations.splice(idx, 1);
    delete messageMap[targetId];
    favoriteStore.convIds.delete(targetId);
    persistFavoriteStore();
    rebuildDirectory();
    const nextIndex = Math.min(idx, conversations.length - 1);
    const next = nextIndex >= 0 ? conversations[nextIndex] : null;
    renderList(getActiveFilter(), searchEl.value);
    if (next) {
      setActive(next.id);
    } else {
      activeId = null;
      if (messagesEl) messagesEl.innerHTML = '';
      if (thread.nameEl) thread.nameEl.textContent = '';
      if (thread.avatarEl) thread.avatarEl.innerHTML = '';
      if (profile.nameEl) profile.nameEl.textContent = '';
    }
  }

  function finalizeLeaveConversation(conv){
    if (!conv) return;
    // Purge any cached history so the leaver can never re-open and see old messages.
    purgeConversationHistory(conv.id);
    try {
      const contact = primaryContact(conv);
      if (contact) purgeSyntheticForContact(contact);
    } catch (_) {}
    performLeaveConversation(conv.id);
    requestHydrateRefresh();
  }

  async function requestLeaveConversation(conv){
    if (!conv) return false;
    if (conv.roomId && chatConfig.roomsUrl) {
      // Always confirm identity from session; injected ids can be wrong.
      await ensureCurrentUserId();
    }
    if (!conv.roomId || !chatConfig.roomsUrl) {
      finalizeLeaveConversation(conv);
      return true;
    }
    if (state.currentUserId == null) {
      window.alert('현재 사용자 정보를 확인할 수 없어 나가기를 완료할 수 없습니다. 새로고침 후 다시 시도해주세요.');
      return false;
    }
    try {
      // Preferred: server-side leave keyed by current session user.
      // This avoids relying on MsgRoomMember.id which can be wrong if identity is stale.
      const leaveUrl = `${buildRoomUrl(conv.roomId)}/leave?actor_user_id=${encodeURIComponent(String(state.currentUserId))}`;
      let resp = await fetch(leaveUrl, { method: 'DELETE', credentials: 'same-origin' });

      // Backward-compat: older servers may not have /leave.
      if (resp.status === 404) {
        let membersResp = await fetch(`${buildRoomUrl(conv.roomId)}/members`, { credentials: 'same-origin' });
        if (!membersResp.ok) {
          if (membersResp.status === 404) {
            finalizeLeaveConversation(conv);
            return true;
          }
          throw new Error('members fetch failed');
        }
        let members = await membersResp.json();
        let mine = Array.isArray(members)
          ? members.find(m => Number(m?.user_id) === Number(state.currentUserId))
          : null;
        if (!mine || !mine.id) {
          finalizeLeaveConversation(conv);
          return true;
        }
        const legacyUrl = `${buildRoomUrl(conv.roomId)}/members/${mine.id}?actor_user_id=${encodeURIComponent(String(state.currentUserId))}`;
        resp = await fetch(legacyUrl, { method: 'DELETE', credentials: 'same-origin' });
      }

      if (!resp.ok) throw new Error('leave failed');
    } catch (err) {
      console.warn('[chat] Failed to leave room', err);
      window.alert('채팅방 나가기 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      return false;
    }
    finalizeLeaveConversation(conv);
    return true;
  }

  function openDeleteModal(conv){
    if (!conv) return;
    const isGroup = Array.isArray(conv.groupAvatars);
    const label = isGroup ? '이 그룹 채팅을 삭제할까요?' : `${displayNameForConversation(conv)}과의 채팅을 삭제할까요?`;
    if (!deleteModal || !deleteModalMessage || !deleteModalConfirm) {
      if (window.confirm(label)) requestDeleteConversation(conv);
      return;
    }
    pendingDeleteId = conv.id;
    deleteModalMessage.textContent = label;
    deleteModal.hidden = false;
    deleteModal.setAttribute('aria-hidden','false');
    deleteModal.classList.add('open');
    setTimeout(()=> deleteModalConfirm?.focus(), 20);
  }

  async function requestDeleteConversation(conv){
    if (!conv) return false;
    // 서버에 보낼 actor 식별자가 비어있으면 세션 기반으로 한 번 더 시도
    if (conv.roomId && state.currentUserId == null) {
      try { await ensureCurrentUserId(); } catch(_) {}
    }
    // Always keep a local tombstone so a deleted conversation doesn't reappear.
    rememberDeletedRoomId(conv.id);

    // Also tombstone the contact key so colleague-tab synthetic chats never
    // reuse old cached messages after deletion.
    const deletedContactKey = tombstoneContactForConversation(conv);
    if (deletedContactKey) {
      const syntheticId = syntheticConversationIdForKey(deletedContactKey);
      if (syntheticId) {
        purgeConversationHistory(syntheticId);
        removeConversationLocal(syntheticId);
      }
    }

    // Also purge any synthetic/offline conversation for the same contact.
    // This prevents old local messages from resurfacing via the colleagues tab.
    try {
      const contact = primaryContact(conv);
      if (contact) purgeSyntheticForContact(contact);
    } catch (_) {}

    if (conv.roomId && chatConfig.roomsUrl) {
      try {
        const url = state.currentUserId != null
          ? `${buildRoomUrl(conv.roomId)}?updated_by_user_id=${encodeURIComponent(String(state.currentUserId))}`
          : buildRoomUrl(conv.roomId);
        const resp = await fetch(url, {
          method: 'DELETE',
          credentials: 'same-origin',
        });
        if (!resp.ok && resp.status !== 404) {
          if (resp.status === 403) {
            openInfoModal('채팅방 삭제 권한이 없습니다. (방 생성자 또는 활성 멤버만 삭제할 수 있습니다.)', { title: '삭제 불가', icon: '⚠️' });
            return false;
          }
          throw new Error('room delete failed');
        }
      } catch (err) {
        console.warn('[chat] Failed to delete room', err);
        openInfoModal('채팅을 삭제하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', { title: '오류', icon: '⚠️' });
        return false;
      }
    }
    performDeleteConversation(conv.id, { isLive: !!conv.roomId });
    return true;
  }

  // Favorite toggle
  favBtn?.addEventListener('click', ()=>{
    if (favBtn.disabled) return;
    const conv = conversations.find(c => c.id === activeId);
    if (!conv) return;
    const next = !conv.fav;
    setConversationFavorite(conv, next);
    favBtn.setAttribute('aria-pressed', next ? 'true' : 'false');
    rebuildDirectory();
    renderList(getActiveFilter(), searchEl.value);
  });

  // Delete current conversation
  delBtn?.addEventListener('click', ()=>{
    const conv = conversations.find(c => c.id === activeId);
    if (!conv) return;
    openDeleteModal(conv);
  });

  // Leave current conversation
  leaveBtn?.addEventListener('click', async ()=>{
    const conv = conversations.find(c => c.id === activeId);
    if (!conv) return;
    if (conv.roomId && state.currentUserId != null && conv.createdByUserId != null
      && Number(conv.createdByUserId) === Number(state.currentUserId)) {
      window.alert('생성자는 채팅방을 나갈 수 없습니다.');
      return;
    }
    const label = isGroupConversation(conv) ? '이 채팅방에서 나갈까요?' : '이 대화방에서 나갈까요?';
    if (!window.confirm(label)) return;
    await requestLeaveConversation(conv);
  });

  deleteModalCancel?.addEventListener('click', ()=>{
    closeDeleteModal();
  });
  deleteModalBackdrop?.addEventListener('click', ()=>{
    closeDeleteModal();
  });
  deleteModalConfirm?.addEventListener('click', async ()=>{
    const target = pendingDeleteId;
    closeDeleteModal();
    if (!target) return;
    const conv = conversations.find(c => c.id === target);
    if (!conv) return;
    await requestDeleteConversation(conv);
  });
  window.addEventListener('keydown', (evt)=>{
    if (evt.key === 'Escape' && deleteModal && !deleteModal.hidden) {
      closeDeleteModal();
    }
  });

  // --- Inline rename for group chats ---
  let nameBeforeEdit = '';
  function beginEditName(){
    const conv = conversations.find(c => c.id === activeId);
    if (!conv || !Array.isArray(conv.groupAvatars)) return; // only groups
    if (!thread.nameEl) return;
    nameBeforeEdit = conv.name || '';
    thread.nameEl.setAttribute('contenteditable', 'true');
    // select contents
    const sel = window.getSelection && window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(thread.nameEl);
      sel.removeAllRanges(); sel.addRange(range);
    }
    thread.nameEl.focus();
  }
  function endEditName(save){
    if (!thread.nameEl) return;
    const conv = conversations.find(c => c.id === activeId);
    const newName = (thread.nameEl.textContent || '').trim();
    thread.nameEl.removeAttribute('contenteditable');
    if (save && conv){
      const finalName = newName || nameBeforeEdit;
      conv.name = finalName;
  conv.nameLocked = true; // mark as user-customized to preserve name on future member additions
      thread.nameEl.textContent = finalName;
      profile.nameEl.textContent = finalName;
      // reflect change in list
      renderList(getActiveFilter(), searchEl.value);
    } else {
      thread.nameEl.textContent = nameBeforeEdit;
    }
    nameBeforeEdit = '';
  }
  // dblclick to start editing if group
  thread.nameEl?.addEventListener('dblclick', ()=>{
    if (!thread.nameEl.classList.contains('is-editable')) return;
    beginEditName();
  });
  // enter/escape
  thread.nameEl?.addEventListener('keydown', (e)=>{
    if (thread.nameEl.getAttribute('contenteditable') !== 'true') return;
    if (e.key === 'Enter') { e.preventDefault(); endEditName(true); }
    if (e.key === 'Escape') { e.preventDefault(); endEditName(false); }
  });
  // blur to save
  thread.nameEl?.addEventListener('blur', ()=>{
    if (thread.nameEl.getAttribute('contenteditable') === 'true') endEditName(true);
  });

  // --- Drag & Drop: create group chat by dropping a friend into the thread ---
  function getKoreanTime(){
    try { return new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true }); }
    catch { return ''; }
  }
  function unique(arr){ return Array.from(new Set(arr)); }
  function normalizeUserId(v){
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function sameMemberIds(a, b){
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    const sa = unique(a.map(normalizeUserId).filter(Number.isFinite)).sort((x,y)=>x-y);
    const sb = unique(b.map(normalizeUserId).filter(Number.isFinite)).sort((x,y)=>x-y);
    if (sa.length !== sb.length) return false;
    for (let i=0; i<sa.length; i++) if (sa[i] !== sb[i]) return false;
    return true;
  }
  function conversationMemberUserIds(conv){
    const members = materializeMembers(conv);
    return unique(members.map(m => normalizeUserId(m?.id)).filter(Number.isFinite));
  }
  function findServerGroupByMemberIds(memberIds){
    const target = unique(memberIds.map(normalizeUserId).filter(Number.isFinite));
    return conversations.find(c => {
      if (!c || !c.roomId) return false;
      if (String(c.roomType || '').toUpperCase() !== 'GROUP') return false;
      const ids = conversationMemberUserIds(c);
      return sameMemberIds(ids, target);
    }) || null;
  }
  function friendUserIdFromConversation(conv){
    const me = normalizeUserId(state.currentUserId);
    const contact = primaryContact(conv);
    const cid = normalizeUserId(contact?.id);
    if (cid != null && cid !== me) return cid;
    const members = materializeMembers(conv);
    const other = members.find(m => {
      const mid = normalizeUserId(m?.id);
      return mid != null && mid !== me;
    });
    return normalizeUserId(other?.id);
  }
  function buildGroupAvatarsLocal(memberTokens){
    if (!Array.isArray(memberTokens)) return [];
    const avatars = [];
    memberTokens.forEach(token => {
      if (avatars.length >= 3) return;
      const u = conversations.find(c => c.id === token && !isGroupConversation(c));
      const label = (u && u.name) || 'member';
      avatars.push(resolveAvatarSrc(u && u.avatar, label));
    });
    return avatars;
  }

  async function createGroupFromActiveAnd(friend){
    const activeConv = conversations.find(c => c.id === activeId);
    if (!activeConv || !friend) return null;

    const myId = normalizeUserId(state.currentUserId);
    const friendUserId = friendUserIdFromConversation(friend);
    const friendName = primaryContact(friend)?.name || friend.name || '';

    // Prefer server-backed group chat whenever we have real user ids.
    if (chatConfig.roomsUrl && myId != null && friendUserId != null) {
      try {
        const activeIsGroup = String(activeConv.roomType || '').toUpperCase() === 'GROUP';

        // Add member into existing server group.
        if (activeIsGroup && activeConv.roomId) {
          const existing = conversationMemberUserIds(activeConv);
          if (existing.includes(friendUserId)) return { conv: activeConv, addedName: null };

          const addResp = await fetch(`${buildRoomUrl(activeConv.roomId)}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ user_id: friendUserId, invited_by_user_id: myId }),
          });
          if (!addResp.ok && addResp.status !== 400) {
            throw new Error('failed to add group member');
          }
          // Refresh room to get updated member list.
          const roomResp = await fetch(buildRoomUrl(activeConv.roomId), { credentials: 'same-origin' });
          if (roomResp.ok) {
            const roomData = await roomResp.json();
            const normalized = normalizeRoomFromApi(roomData);
            if (normalized) {
              Object.assign(activeConv, normalized);
            }
          }
          return { conv: activeConv, addedName: friendName };
        }

        // Create (or reuse) a server group from active+friend.
        const baseIds = conversationMemberUserIds(activeConv);
        const memberIds = unique([myId, ...baseIds, friendUserId].map(normalizeUserId).filter(Number.isFinite));
        if (memberIds.length >= 3) {
          const existingGroup = findServerGroupByMemberIds(memberIds);
          if (existingGroup) return { conv: existingGroup, addedName: friendName };

          const payload = {
            room_type: 'GROUP',
            room_name: '그룹 채팅',
            created_by_user_id: myId,
            member_ids: memberIds,
          };
          const resp = await fetch(getRoomsCreateUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
          });
          if (!resp.ok) throw new Error('failed to create group room (HTTP ' + resp.status + ')');
          const roomData = await resp.json();
          const normalized = normalizeRoomFromApi(roomData);
          if (!normalized) return null;
          conversations.unshift(normalized);
          forgetDeletedRoomId(normalized.id);
          syncFavoriteFlag(normalized);
          messageMap[normalized.id] = messageMap[normalized.id] || [];
          return { conv: normalized, addedName: friendName };
        }
      } catch (err) {
        console.warn('[chat] Failed to create/add server group, falling back to local', err);
      }
    }

    // Local fallback (offline/synthetic)
    if (isGroupConversation(activeConv)) {
      const members = Array.isArray(activeConv.members) ? activeConv.members.slice() : [];
      if (members.includes(friend.id)) { return { conv: activeConv, addedName: null }; }
      const newMembers = unique([...members, friend.id]);
      activeConv.members = newMembers;
      activeConv.groupAvatars = buildGroupAvatarsLocal(newMembers);
      if (!activeConv.nameLocked) activeConv.name = '그룹 채팅';
      activeConv.time = getKoreanTime();
      return { conv: activeConv, addedName: friend.name };
    }

    const baseMembers = Array.isArray(activeConv.members) && activeConv.members.length ? activeConv.members.slice() : [activeConv.id];
    const newMembers = unique([...baseMembers, friend.id]);
    const gid = 'g' + Date.now();
    const conv = {
      id: gid,
      name: '그룹 채팅',
      time: getKoreanTime(),
      preview: '그룹 채팅이 시작되었습니다.',
      unread: 0,
      groupAvatars: buildGroupAvatarsLocal(newMembers),
      fav: false,
      friend: false,
      members: newMembers,
      nameLocked: false
    };
    conversations.push(conv);
    syncFavoriteFlag(conv);
    messageMap[gid] = [];
    return { conv, addedName: friend.name };
  }

  function renderMembers(conv){
    if (!profile.membersList) return;
    const members = materializeMembers(conv);
    const frag = document.createDocumentFragment();
    members.forEach(member => {
      const li = document.createElement('li');
      const avatar = avatarImg(member.avatar, member.name, 'sm');
      const text = document.createElement('div');
      text.innerHTML = `<div class="member-name">${member.name || ''}</div><div class="member-dept">${member.department || ''}</div>`;
      li.appendChild(avatar);
      li.appendChild(text);
      frag.appendChild(li);
    });
    profile.membersList.innerHTML = '';
    profile.membersList.appendChild(frag);
  }

  // Robust drop handlers (capture phase) on thread and key child areas
  const threadHeader = document.querySelector('.thread-header');
  const threadInput = document.querySelector('.thread-input');
  function isFileDrag(e){
    if (!e || !e.dataTransfer) return false;
    const types = e.dataTransfer.types;
    if (!types) return false;
    for (let i = 0; i < types.length; i++) {
      if (types[i] === 'Files' || types[i] === 'application/x-moz-file') return true;
    }
    return false;
  }
  function onDragOver(e){
    e.preventDefault();
    threadContainer.classList.add('droppable');
    if (isFileDrag(e)) threadContainer.classList.add('droppable-files');
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }
  function onDragLeave(){
    threadContainer.classList.remove('droppable');
    threadContainer.classList.remove('droppable-files');
  }
  async function onDrop(e){
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    threadContainer.classList.remove('droppable');
    threadContainer.classList.remove('droppable-files');

    // 1) 외부 파일 드롭: pendingFiles로 추가
    if (isFileDrag(e)) {
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (!files.length) return;
      const activeConv = conversations.find(c => c.id === activeId);
      if (!activeConv) {
        try { window.alert('파일을 추가하려면 먼저 대화방을 선택해주세요.'); } catch(_){}
        return;
      }
      // 50MB 제한 (서버 정책과 무관하게 사전 컷)
      const MAX = 50 * 1024 * 1024;
      const oversized = files.filter(f => f.size > MAX);
      const accepted = files.filter(f => f.size <= MAX);
      if (oversized.length) {
        try { window.alert(oversized.length + '개 파일이 50MB를 초과해 제외되었습니다.'); } catch(_){}
      }
      if (!accepted.length) return;
      pendingFiles.push.apply(pendingFiles, accepted);
      renderPendingAttachments();
      try { inputEl?.focus(); } catch(_){}
      return;
    }

    // 2) 기존: 친구/대화 드래그 처리
    const payload = readDragPayload(e);
    if (!payload) return;
    const activeConv = conversations.find(c => c.id === activeId) || null;

    if (payload.type === 'directory') {
      const entry = findEntryByKey(payload.entryKey);
      if (!entry) return;
      if (activeConv) await addEntryToActiveConversation(entry);
      else await startConversationFromEntry(entry);
      return;
    }

    const convId = payload.id || payload.convId || payload.entryKey;
    if (!convId) return;
    const droppedConv = conversations.find(c => c.id === convId);
    if (!droppedConv) return;

    if (!activeConv) {
      setActive(droppedConv.id);
      renderList(getActiveFilter(), searchEl.value);
      return;
    }

    await handleConversationDrop(droppedConv);
  }
  if (threadContainer){
    ['dragenter','dragover'].forEach(evt => threadContainer.addEventListener(evt, onDragOver, true));
    threadContainer.addEventListener('dragleave', onDragLeave, true);
    threadContainer.addEventListener('drop', onDrop, true);
  }
  if (threadHeader){
    ['dragenter','dragover'].forEach(evt => threadHeader.addEventListener(evt, onDragOver, true));
    threadHeader.addEventListener('dragleave', onDragLeave, true);
    threadHeader.addEventListener('drop', onDrop, true);
  }
  if (messagesEl){
    ['dragenter','dragover'].forEach(evt => messagesEl.addEventListener(evt, onDragOver, true));
    messagesEl.addEventListener('dragleave', onDragLeave, true);
    messagesEl.addEventListener('drop', onDrop, true);
  }
  if (threadInput){
    ['dragenter','dragover'].forEach(evt => threadInput.addEventListener(evt, onDragOver, true));
    threadInput.addEventListener('dragleave', onDragLeave, true);
    threadInput.addEventListener('drop', onDrop, true);
  }
  // 윈도우 밖에서 파일을 떨어뜨릴 때 브라우저 페이지 이동 방지 (chat 페이지에 한정)
  window.addEventListener('dragover', function(e){ if (isFileDrag(e)) e.preventDefault(); }, false);
  window.addEventListener('drop', function(e){ if (isFileDrag(e)) e.preventDefault(); }, false);

  // --- Context menu for chat list ---
  const contextMenu = document.createElement('div');
  contextMenu.className = 'chat-context-menu';
  contextMenu.hidden = true;
  document.body.appendChild(contextMenu);

  function closeContextMenu(){
    if (contextMenu.hidden) return;
    contextMenu.hidden = true;
    contextMenu.innerHTML = '';
  }

  function openContextMenu(x, y, actions){
    if (!actions || !actions.length) return;
    contextMenu.innerHTML = '';
    actions.forEach(action => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = action.label;
      if (action.disabled) btn.disabled = true;
      btn.addEventListener('click', ()=>{
        if (!btn.disabled && typeof action.onSelect === 'function') {
          Promise.resolve(action.onSelect()).catch(err => console.warn('[chat] context action failed', err));
        }
        closeContextMenu();
      });
      contextMenu.appendChild(btn);
    });
    const menuWidth = 180;
    const menuHeight = actions.length * 40 + 8;
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const maxX = scrollX + viewportWidth - menuWidth - 8;
    const maxY = scrollY + viewportHeight - menuHeight - 8;
    contextMenu.style.left = `${Math.min(x, maxX)}px`;
    contextMenu.style.top = `${Math.min(y, maxY)}px`;
    contextMenu.hidden = false;
  }

  document.addEventListener('click', (evt)=>{
    if (!contextMenu.contains(evt.target)) closeContextMenu();
    if (!addMemberMenu.contains(evt.target) && evt.target !== addMemberBtn) closeAddMemberMenu();
  });
  document.addEventListener('keydown', (evt)=>{
    if (evt.key === 'Escape') {
      closeContextMenu();
      closeAddMemberMenu();
    }
  });
  document.addEventListener('scroll', ()=>{
    closeContextMenu();
    closeAddMemberMenu();
  }, true);
  window.addEventListener('resize', closeAddMemberMenu);

  messagesEl?.addEventListener('scroll', requestMessagesScrollbarUpdate);
  window.addEventListener('resize', requestMessagesScrollbarUpdate);
  if (messagesScrollbar) {
    messagesScrollbar.addEventListener('pointerdown', onScrollbarTrackPointerDown);
  }
  messagesScrollbarThumb?.addEventListener('pointerdown', onThumbPointerDown);


  addMemberBtn?.addEventListener('click', (e)=>{
    e.preventDefault();
    e.stopPropagation();
    if (addMemberMenu.hidden) openAddMemberMenu(addMemberBtn); else closeAddMemberMenu();
  });

  listEl?.addEventListener('contextmenu', (e)=>{
    const li = e.target.closest('.chat-item');
    if (!li) return;
    e.preventDefault();
    closeContextMenu();
    const entryKey = li.dataset.entryKey;
    const entry = entryKey ? findEntryByKey(entryKey) : null;
    const convId = li.dataset.id;
    let conv = convId ? conversations.find(c => c.id === convId) : null;
    if (!conv && entry && Array.isArray(entry.convIds)) {
      for (const cid of entry.convIds) {
        const existing = conversations.find(c => c.id === cid);
        if (existing) { conv = existing; break; }
      }
    }
    const actions = [];
    actions.push({
      label: '대화하기',
      onSelect: async ()=>{
        if (entry) {
          await startConversationFromEntry(entry);
        } else if (conv) {
          setActive(conv.id);
          const linkedEntry = findEntryForConversation(conv);
          if (linkedEntry) renderDirectoryProfile(linkedEntry);
          else state.activeDirectoryKey = null;
          renderList(getActiveFilter(), searchEl.value);
        }
      },
      disabled: !entry && !conv,
    });
    const favoriteTarget = conv;
    actions.push({
      label: favoriteTarget && favoriteTarget.fav ? '즐겨찾기 해제' : '즐겨찾기 추가',
      disabled: !favoriteTarget,
      onSelect: ()=>{
        if (!favoriteTarget) return;
        setConversationFavorite(favoriteTarget, !favoriteTarget.fav);
        renderList(getActiveFilter(), searchEl.value);
      }
    });
    openContextMenu(e.pageX, e.pageY, actions);
  });

  // Email send handler (1:1 only)
  profileEmailBtn?.addEventListener('click', () => {
    const conv = conversations.find(c => c.id === activeId);
    if (!conv) return;
    const members = materializeMembers(conv);
    const isGroup = isGroupConversation(conv);
    let recipients = [];
    if (isGroup) {
      recipients = members.filter(m => m.email && !m.isSelf).map(m => m.email);
    } else {
      const target = members.find(m => m.email && !m.isSelf) || members.find(m => m.email);
      if (target) recipients = [target.email];
    }
    recipients = Array.from(new Set(recipients.filter(Boolean)));
    if (!recipients.length) return;
    const subject = encodeURIComponent(`[blossom] 메일`);
    const body = encodeURIComponent('안녕하세요.');
    const mailto = `mailto:${recipients.join(',')}?subject=${subject}&body=${body}`;
    window.location.href = mailto;
  });

  // Chat settings drawer (standalone DOM binding)
  (function initSettingsDrawer(){
    const settingsBtn = document.getElementById('btn-chat-settings');
    let drawer = document.getElementById('chat-settings-drawer');
    const profilePanel = document.querySelector('.chat-profile');
    if (!settingsBtn) return;

    // 알림 뮤트 (localStorage)
    const MUTE_KEY = 'chat-muted-v1';
    function loadMutedSet(){
      try { return new Set(JSON.parse(localStorage.getItem(MUTE_KEY) || '[]')); } catch(_){ return new Set(); }
    }
    function saveMutedSet(set){
      try { localStorage.setItem(MUTE_KEY, JSON.stringify(Array.from(set))); } catch(_){}
    }
    const mutedIds = loadMutedSet();
    function isMuted(convId){ return mutedIds.has(String(convId)); }
    function toggleMute(convId){
      const key = String(convId);
      if (mutedIds.has(key)) mutedIds.delete(key); else mutedIds.add(key);
      saveMutedSet(mutedIds);
    }
    window.__chatIsMuted = isMuted;

    function ensureDrawer(){
      if (drawer) return drawer;
      const aside = document.createElement('aside');
      aside.className = 'chat-settings-drawer';
      aside.id = 'chat-settings-drawer';
      aside.hidden = true;
      aside.setAttribute('aria-hidden', 'true');
      aside.setAttribute('aria-label', '설정');
      aside.innerHTML =
        '<div class="csd-header">' +
          '<h3 class="csd-title" id="csd-title">채팅 설정</h3>' +
          '<button class="icon-btn csd-close" id="btn-chat-settings-close" aria-label="설정 닫기">×</button>' +
        '</div>' +
        '<div class="csd-body">' +
          '<div class="csd-section">' +
            '<div class="csd-section-label">이름</div>' +
            '<div class="csd-row-edit">' +
              '<input class="csd-input" id="csd-name-input" type="text" maxlength="60" autocomplete="off" placeholder="이름 입력" />' +
            '</div>' +
          '</div>' +
          '<div class="csd-section" id="csd-section-invite">' +
            '<button class="csd-action-btn" id="csd-btn-invite">멤버 초대</button>' +
          '</div>' +
          '<div class="csd-section csd-danger-zone">' +
            '<button class="csd-action-btn csd-danger" id="csd-btn-leave">나가기</button>' +
            '<button class="csd-action-btn csd-danger" id="csd-btn-delete">삭제</button>' +
          '</div>' +
        '</div>';
      const wrapper = document.querySelector('.chat-wrapper');
      if (wrapper) wrapper.appendChild(aside);
      drawer = aside;
      drawer.querySelector('#btn-chat-settings-close')?.addEventListener('click', closeDrawer);
      drawer.querySelector('#csd-btn-invite')?.addEventListener('click', function(){
        closeDrawer();
        if (addMemberBtn && !addMemberBtn.disabled) addMemberBtn.click();
      });
      drawer.querySelector('#csd-btn-leave')?.addEventListener('click', function(){
        closeDrawer();
        if (leaveBtn && !leaveBtn.disabled) leaveBtn.click();
      });
      drawer.querySelector('#csd-btn-delete')?.addEventListener('click', function(){
        closeDrawer();
        if (delBtn && !delBtn.disabled) delBtn.click();
      });
      return drawer;
    }

    function openDrawer(){
      const currentDrawer = ensureDrawer();
      if (!currentDrawer) return;
      const titleEl = document.getElementById('csd-title');
      const threadNameEl = document.getElementById('thread-name');
      const nameInput = document.getElementById('csd-name-input');
      const descInput = document.getElementById('csd-desc-input');
      const descSection = document.getElementById('csd-section-desc');
      const inviteSection = document.getElementById('csd-section-invite');
      const muteSwitch = document.getElementById('csd-mute-switch');
      const conv = (typeof activeId !== 'undefined') ? conversations.find(c => c.id === activeId) : null;
      const roomType = String((conv && conv.roomType) || '').toUpperCase();
      const isChannel = roomType === 'CHANNEL';
      const isDirect = roomType === 'DIRECT';
      if (titleEl) titleEl.textContent = isChannel ? '채널 설정' : '채팅 설정';
      if (nameInput) nameInput.value = (conv && conv.name) || (threadNameEl ? (threadNameEl.textContent || '').trim() : '');
      if (descSection) {
        if (isChannel) descSection.classList.remove('csd-hidden');
        else descSection.classList.add('csd-hidden');
      }
      if (descInput) descInput.value = (conv && conv.description) || '';
      if (inviteSection) inviteSection.style.display = isDirect ? 'none' : '';
      if (muteSwitch && conv) {
        const muted = isMuted(conv.id);
        muteSwitch.setAttribute('aria-checked', muted ? 'true' : 'false');
      }
      const csdLeave = document.getElementById('csd-btn-leave');
      if (csdLeave && leaveBtn) { csdLeave.disabled = !!leaveBtn.disabled; }
      const csdDel = document.getElementById('csd-btn-delete');
      if (csdDel && delBtn) { csdDel.disabled = !!delBtn.disabled; csdDel.title = delBtn.title || '삭제'; }
      currentDrawer.hidden = false;
      currentDrawer.setAttribute('aria-hidden', 'false');
      settingsBtn.setAttribute('aria-expanded', 'true');
      if (profilePanel) profilePanel.hidden = true;
    }

    function closeDrawer(){
      const currentDrawer = ensureDrawer();
      if (!currentDrawer) return;
      currentDrawer.hidden = true;
      currentDrawer.setAttribute('aria-hidden', 'true');
      settingsBtn.setAttribute('aria-expanded', 'false');
      if (profilePanel) profilePanel.hidden = false;
    }

    const closeBtn = document.getElementById('btn-chat-settings-close');
    closeBtn?.addEventListener('click', closeDrawer);

    settingsBtn.addEventListener('click', function(evt){
      evt.preventDefault();
      const currentDrawer = ensureDrawer();
      if (!currentDrawer) return;
      if (currentDrawer.hidden) openDrawer();
      else closeDrawer();
    });

    listEl?.addEventListener('click', function(){
      const currentDrawer = ensureDrawer();
      if (currentDrawer && !currentDrawer.hidden) closeDrawer();
    });

    document.addEventListener('keydown', function(evt){
      if (evt.key !== 'Escape') return;
      const currentDrawer = ensureDrawer();
      if (currentDrawer && !currentDrawer.hidden) closeDrawer();
    });

    document.getElementById('csd-btn-invite')?.addEventListener('click', function(){
      closeDrawer();
      if (addMemberBtn && !addMemberBtn.disabled) addMemberBtn.click();
    });
    document.getElementById('csd-btn-leave')?.addEventListener('click', function(){
      closeDrawer();
      if (leaveBtn && !leaveBtn.disabled) leaveBtn.click();
    });
    document.getElementById('csd-btn-delete')?.addEventListener('click', function(){
      closeDrawer();
      if (delBtn && !delBtn.disabled) delBtn.click();
    });

    // 알림 토글
    const muteSwitch = document.getElementById('csd-mute-switch');
    if (muteSwitch) {
      const doToggle = function(){
        const conv = conversations.find(c => c.id === activeId);
        if (!conv) return;
        toggleMute(conv.id);
        muteSwitch.setAttribute('aria-checked', isMuted(conv.id) ? 'true' : 'false');
      };
      muteSwitch.addEventListener('click', function(e){ e.preventDefault(); doToggle(); });
      muteSwitch.addEventListener('keydown', function(e){
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); doToggle(); }
      });
    }

    // 통합 저장 버튼: 이름 + (채널) 설명
    const saveBtn = document.getElementById('csd-btn-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function(){
        const conv = conversations.find(c => c.id === activeId);
        if (!conv) return;
        const nameInput = document.getElementById('csd-name-input');
        const descInput = document.getElementById('csd-desc-input');
        const newName = (nameInput && nameInput.value || '').trim();
        const newDesc = descInput ? descInput.value : '';
        const isChannel = String(conv.roomType || '').toUpperCase() === 'CHANNEL';
        if (!newName) { if (nameInput) nameInput.focus(); return; }
        saveBtn.disabled = true;
        try {
          // 1) 방 이름 변경 (v1 PATCH /api/chat/rooms/<roomId>)
          if (conv.roomId) {
            try {
              const r = await fetch(`${chatConfig.apiRoot}/rooms/${conv.roomId}`, {
                method: 'PATCH',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify({ room_name: newName }),
              });
              if (r.ok) {
                conv.name = newName;
                const threadNameEl = document.getElementById('thread-name');
                if (threadNameEl) threadNameEl.textContent = newName;
                const profileNameEl = document.getElementById('profile-name');
                if (profileNameEl && !isChannel) profileNameEl.textContent = newName;
                lastListRenderSignature = null;
                if (typeof renderList === 'function') renderList(getActiveFilter(), searchEl ? searchEl.value : '');
              }
            } catch(_){}
          }
          // 2) 채널 설명 변경 (v2 PATCH /api/chat/v2/channels/<channelId>)
          if (isChannel && conv.channelId) {
            try {
              const r2 = await fetch(`/api/chat/v2/channels/${conv.channelId}`, {
                method: 'PATCH',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify({ name: newName, description: newDesc }),
              });
              if (r2.ok) { conv.description = newDesc; }
            } catch(_){}
          }
          closeDrawer();
        } finally {
          saveBtn.disabled = false;
        }
      });
    }
  })();

  // 새 채널 만들기 + 멤버 선택 모달 (remote_chat.js의 standalone 모듈을 통합)
  (function initNewChannelModal(){
    function $(id){ return document.getElementById(id); }
    function getCfg(){
      var el = document.getElementById('chat-config');
      return {
        apiRoot: (el && el.getAttribute('data-api-root')) || '/api/chat',
        directoryUrl: '/api/chat/directory'
      };
    }
    var directory = [];
    var directoryError = '';
    var directoryLoaded = false;
    var selectedIds = new Set();

    function loadDirectory(){
      var cfg = getCfg();
      directoryError = '';
      return fetch(cfg.directoryUrl, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function(r){
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function(rows){
          directory = Array.isArray(rows) ? rows : [];
          directoryLoaded = true;
        })
        .catch(function(err){
          directory = [];
          directoryLoaded = true;
          directoryError = (err && err.message) || '로드 실패';
        });
    }
    function renderMembers(){
      var listEl = $('new-channel-member-list');
      var searchEl = $('new-channel-member-search');
      if (!listEl) return;
      var term = ((searchEl && searchEl.value) || '').trim().toLowerCase();
      if (!term) { listEl.hidden = true; listEl.innerHTML = ''; return; }
      listEl.innerHTML = '';
      listEl.hidden = false;
      var pool = directory.filter(function(u){ return u && (u.user_id != null || u.id != null); });
      var matched = pool.filter(function(u){
        var name = String(u.name || u.display_name || '').toLowerCase();
        var dept = String(u.department || u.dept || '').toLowerCase();
        return name.indexOf(term) >= 0 || dept.indexOf(term) >= 0;
      });
      var LIMIT = 50;
      var filtered = matched.slice(0, LIMIT);
      if (!filtered.length) {
        var li = document.createElement('li');
        if (directoryError) { li.className = 'error'; li.textContent = '동료 목록을 불러오지 못했습니다 (' + directoryError + ')'; }
        else if (!directoryLoaded) { li.className = 'empty'; li.textContent = '동료 목록을 불러오는 중입니다...'; }
        else { li.className = 'empty'; li.textContent = '검색 결과가 없습니다.'; }
        listEl.appendChild(li);
        return;
      }
      filtered.forEach(function(u){
        var uid = u.user_id != null ? u.user_id : u.id;
        var li = document.createElement('li');
        var dept = u.department || u.dept || '';
        li.innerHTML = '<span>' + (u.name || u.display_name || '') + (dept ? ' <small style="color:#94a3b8;">· ' + dept + '</small>' : '') + '</span>';
        if (selectedIds.has(uid)) li.classList.add('selected');
        li.addEventListener('click', function(){
          if (selectedIds.has(uid)) selectedIds.delete(uid); else selectedIds.add(uid);
          renderMembers(); renderSelected();
        });
        listEl.appendChild(li);
      });
      if (matched.length > LIMIT) {
        var more = document.createElement('li');
        more.className = 'empty';
        more.textContent = '… ' + (matched.length - LIMIT) + '명 더 있음. 검색을 좁혀주세요.';
        listEl.appendChild(more);
      }
    }
    function renderSelected(){
      var wrap = $('new-channel-member-selected');
      if (!wrap) return;
      wrap.innerHTML = '';
      selectedIds.forEach(function(uid){
        var u = directory.find(function(x){ return (x.user_id != null ? x.user_id : x.id) === uid; });
        if (!u) return;
        var chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = u.name || u.display_name || ('#' + uid);
        var close = document.createElement('button');
        close.type = 'button';
        close.setAttribute('aria-label', '제거');
        close.textContent = '\u00d7';
        close.addEventListener('click', function(){
          selectedIds.delete(uid);
          renderSelected(); renderMembers();
        });
        chip.appendChild(close);
        wrap.appendChild(chip);
      });
    }
    function showError(msg){
      var el = $('new-channel-error');
      if (!el) return;
      if (!msg) { el.hidden = true; el.textContent = ''; return; }
      el.hidden = false; el.textContent = msg;
    }

    // ===== Member Picker (separate modal) =====
    var mpSelectedDept = null;
    var mpTempSelected = new Set();
    function _mpUserId(u){ return u.user_id != null ? u.user_id : u.id; }
    function buildDeptTree(){
      var tree = $('mp-tree');
      if (!tree) return;
      tree.innerHTML = '';
      var groups = {};
      directory.forEach(function(u){
        if (!u) return;
        var d = u.department || u.dept || '미지정';
        if (!groups[d]) groups[d] = [];
        groups[d].push(u);
      });
      var deptNames = Object.keys(groups).sort();
      function addItem(label, key, count){
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mp-tree-item' + ((mpSelectedDept === key) ? ' active' : '');
        btn.textContent = label + ' (' + count + ')';
        btn.addEventListener('click', function(){
          mpSelectedDept = key;
          var head = $('mp-list-head'); if (head) head.textContent = label;
          Array.prototype.forEach.call(tree.querySelectorAll('.mp-tree-item'), function(el){ el.classList.remove('active'); });
          btn.classList.add('active');
          buildMemberList();
        });
        tree.appendChild(btn);
      }
      addItem('전체', null, directory.length);
      deptNames.forEach(function(d){ addItem(d, d, groups[d].length); });
    }
    function buildMemberList(){
      var listEl = $('mp-list');
      var searchEl = $('mp-search');
      var countEl = $('mp-count');
      if (!listEl) return;
      listEl.innerHTML = '';
      var term = ((searchEl && searchEl.value) || '').trim().toLowerCase();
      var pool = directory.filter(function(u){
        if (!u) return false;
        if (mpSelectedDept != null && (u.department || u.dept || '미지정') !== mpSelectedDept) return false;
        if (term) {
          var name = String(u.name || u.display_name || '').toLowerCase();
          var dept = String(u.department || u.dept || '').toLowerCase();
          if (name.indexOf(term) < 0 && dept.indexOf(term) < 0) return false;
        }
        return true;
      });
      var LIMIT = 200;
      var slice = pool.slice(0, LIMIT);
      if (!slice.length) {
        var em = document.createElement('li');
        em.className = 'mp-empty';
        em.textContent = directoryError ? ('동료 목록 로드 실패: ' + directoryError) : (directoryLoaded ? '결과 없음' : '불러오는 중...');
        listEl.appendChild(em);
      } else {
        slice.forEach(function(u){
          var uid = _mpUserId(u);
          var li = document.createElement('li');
          li.className = 'mp-item';
          var checked = mpTempSelected.has(uid) ? 'checked' : '';
          var dept = u.department || u.dept || '';
          var name = u.name || u.display_name || ('#' + uid);
          li.innerHTML = '<label><input type="checkbox" data-uid="' + uid + '" ' + checked + ' /> <span class="mp-name">' + name + '</span>' + (dept ? ' <small class="mp-dept">' + dept + '</small>' : '') + '</label>';
          var cb = li.querySelector('input[type=checkbox]');
          cb.addEventListener('change', function(){
            if (cb.checked) mpTempSelected.add(uid); else mpTempSelected.delete(uid);
            if (countEl) countEl.textContent = '선택 ' + mpTempSelected.size + '명';
          });
          listEl.appendChild(li);
        });
        if (pool.length > LIMIT) {
          var more = document.createElement('li');
          more.className = 'mp-empty';
          more.textContent = '… ' + (pool.length - LIMIT) + '명 더 있음. 검색을 좁혀주세요.';
          listEl.appendChild(more);
        }
      }
      if (countEl) countEl.textContent = '선택 ' + mpTempSelected.size + '명';
    }
    function openMemberPicker(){
      var modal = $('member-picker-modal');
      if (!modal) return;
      if (modal.parentNode !== document.body) document.body.appendChild(modal);
      mpTempSelected = new Set();
      selectedIds.forEach(function(uid){ mpTempSelected.add(uid); });
      mpSelectedDept = null;
      var searchEl = $('mp-search'); if (searchEl) searchEl.value = '';
      var head = $('mp-list-head'); if (head) head.textContent = '전체';
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
      modal.classList.add('open');
      if (!directoryLoaded) {
        loadDirectory().then(function(){ buildDeptTree(); buildMemberList(); });
      } else {
        buildDeptTree(); buildMemberList();
      }
    }
    function closeMemberPicker(){
      var modal = $('member-picker-modal');
      if (!modal) return;
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      modal.classList.remove('open');
    }
    function applyMemberPicker(){
      selectedIds = new Set();
      mpTempSelected.forEach(function(uid){ selectedIds.add(uid); });
      renderSelected();
      closeMemberPicker();
    }

    function openModal(){
      var modal = $('chat-new-channel-modal');
      if (!modal) return;
      if (modal.parentNode !== document.body) { try { document.body.appendChild(modal); } catch(_){} }
      selectedIds.clear();
      var nameEl = $('new-channel-name');
      var descEl = $('new-channel-desc');
      var searchInputEl = $('new-channel-member-search');
      if (nameEl) nameEl.value = '';
      if (descEl) descEl.value = '';
      if (searchInputEl) searchInputEl.value = '';
      var visPublic = modal.querySelector('input[name="new-channel-visibility"][value="public"]');
      if (visPublic) visPublic.checked = true;
      showError('');
      renderSelected();
      var listEl = $('new-channel-member-list');
      if (listEl) { listEl.hidden = true; listEl.innerHTML = ''; }
      if (!directoryLoaded) loadDirectory();
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
      modal.classList.add('open');
      document.body.classList.add('chat-modal-open');
      setTimeout(function(){ if (nameEl) nameEl.focus(); }, 50);
    }
    function closeModal(){
      var modal = $('chat-new-channel-modal');
      if (!modal) return;
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      modal.classList.remove('open');
      document.body.classList.remove('chat-modal-open');
    }
    function submitForm(){
      var nameEl = $('new-channel-name');
      var descEl = $('new-channel-desc');
      var modal = $('chat-new-channel-modal');
      var confirmBtn = $('new-channel-confirm');
      var name = nameEl ? nameEl.value.trim() : '';
      if (!name) { showError('채널명을 입력하세요.'); if (nameEl) nameEl.focus(); return; }
      var visEl = modal ? modal.querySelector('input[name="new-channel-visibility"]:checked') : null;
      var visibility = visEl ? visEl.value : 'public';
      var description = descEl ? descEl.value.trim() : '';
      var memberIds = [];
      try { selectedIds.forEach(function(uid){ memberIds.push(uid); }); } catch(_){}
      // 뷰어(생성자) 식별 – data-profile-id 또는 whoami 폴백
      var cfgEl = document.getElementById('chat-config');
      var viewerId = cfgEl ? parseInt(cfgEl.getAttribute('data-profile-id') || '0', 10) : 0;

      function doPost(viewerOrNull){
        if (viewerOrNull && memberIds.indexOf(viewerOrNull) < 0) memberIds.unshift(viewerOrNull);
        var payload = {
          room_type: 'CHANNEL',
          room_name: name,
          member_ids: memberIds,
          member_role: 'MEMBER',
          visibility: visibility,
        };
        if (viewerOrNull) payload.created_by_user_id = viewerOrNull;
        if (description) payload.description = description;
        if (confirmBtn) confirmBtn.disabled = true;
        return fetch('/api/chat/rooms', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify(payload),
        }).then(function(r){
          return r.json().catch(function(){ return {}; }).then(function(d){ return { ok: r.ok, status: r.status, data: d }; });
        }).then(function(res){
          if (!res.ok) {
            var msg = (res.data && (res.data.message || res.data.error)) || ('채널 생성 실패 (HTTP ' + res.status + ')');
            showError(msg);
            return;
          }
          closeModal();
          window.location.reload();
        }).catch(function(){
          showError('네트워크 오류가 발생했습니다.');
        }).then(function(){
          if (confirmBtn) confirmBtn.disabled = false;
        });
      }

      if (viewerId) { doPost(viewerId); return; }
      // 폴백: whoami 로 사용자 ID 조회
      fetch('/api/chat/whoami', { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(j){
          var uid = j && (j.user_id || j.id || j.profile_id);
          if (!uid) { showError('로그인 정보가 없습니다. 다시 로그인 해주세요.'); return; }
          doPost(parseInt(uid, 10));
        })
        .catch(function(){
          // 서버 세션이 있으면 created_by_user_id 없이도 통과
          doPost(null);
        });
    }

    // 트리거 버튼 + 모달 위치 보정
    var triggerBtn = $('btn-new-channel');
    var modalRoot = $('chat-new-channel-modal');
    var pickerRoot = $('member-picker-modal');
    if (modalRoot && modalRoot.parentNode !== document.body) { try { document.body.appendChild(modalRoot); } catch(_){} }
    if (pickerRoot && pickerRoot.parentNode !== document.body) { try { document.body.appendChild(pickerRoot); } catch(_){} }
    if (triggerBtn) triggerBtn.addEventListener('click', function(e){ e.preventDefault(); openModal(); });

    // 위임 이벤트 (가장 안정적)
    document.addEventListener('click', function(e){
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('#btn-new-channel')) { e.preventDefault(); openModal(); return; }
      if (t.closest('#new-channel-cancel') || t.closest('#new-channel-cancel-2') || t.closest('#chat-new-channel-backdrop')) { e.preventDefault(); closeModal(); return; }
      if (t.closest('#new-channel-confirm')) { e.preventDefault(); submitForm(); return; }
      if (t.closest('#new-channel-dept-toggle')) { e.preventDefault(); openMemberPicker(); return; }
      if (t.closest('#member-picker-cancel') || t.closest('#member-picker-cancel-2') || t.closest('#member-picker-backdrop')) { e.preventDefault(); closeMemberPicker(); return; }
      if (t.closest('#member-picker-apply')) { e.preventDefault(); applyMemberPicker(); return; }
      // 자동완성 외부 클릭 시 닫기
      if (!(t.closest('#new-channel-member-list') || t.closest('#new-channel-member-search'))) {
        var le = $('new-channel-member-list'); if (le) le.hidden = true;
      }
    }, false);
    document.addEventListener('input', function(e){
      if (e.target && e.target.id === 'new-channel-member-search') renderMembers();
      if (e.target && e.target.id === 'mp-search') buildMemberList();
    }, false);
    document.addEventListener('keydown', function(e){
      if (e.key === 'Enter' && e.target && e.target.id === 'new-channel-name') { e.preventDefault(); submitForm(); }
      else if (e.key === 'Escape') {
        var m1 = $('chat-new-channel-modal'); if (m1 && !m1.hidden) closeModal();
        var m2 = $('member-picker-modal'); if (m2 && !m2.hidden) closeMemberPicker();
      }
    }, false);
  })();

  // Avatar is non-interactive by design; no handlers attached.
})();