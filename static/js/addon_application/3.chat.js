// Chat UI interactions (Korean-localized)
(function(){
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
    activeDirectoryKey: null,
  };
  const SELF_CONV_PREFIX = 'self-';
  const FAVORITES_STORAGE_KEY = 'chat-favorites-v1';
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
      if (key) locallyDeletedContactKeys.add(key);
      return key;
    } catch (_) {
      return null;
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
      return { roomsUrl: '/api/chat/rooms', apiRoot: '/api/chat', profileId: null, userName: '', empNo: '' };
    }
    const roomsUrlAttr = el.getAttribute('data-rooms-url') || '/api/chat/rooms';
    const apiRootAttr = el.getAttribute('data-api-root');
    const directoryUrlAttr = el.getAttribute('data-directory-url') || '/api/chat/directory';
    const profileIdAttr = parseInt(el.getAttribute('data-profile-id'), 10);
    const userDeptAttr = el.getAttribute('data-user-dept') || '';
    const cfg = {
      roomsUrl: roomsUrlAttr,
      apiRoot: apiRootAttr || deriveApiRoot(roomsUrlAttr),
      directoryUrl: directoryUrlAttr,
      profileId: Number.isFinite(profileIdAttr) ? profileIdAttr : null,
      userName: el.getAttribute('data-user-name') || '',
      empNo: el.getAttribute('data-user-emp-no') || '',
      userDept: userDeptAttr || '',
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

  function renderAvatarInto(container, src, label){
    if (!container) return;
    container.innerHTML = '';
    container.classList.add('has-image');
    container.classList.remove('avatar-token');
    container.style.background = '';
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
      return {
        id: uid,
        name: user.name || '',
        department: member.department || user.department || '',
        email: member.email || user.email || '',
        avatar: avatarSrc,
        extPhone,
        mobilePhone,
        empNo,
        isSelf: state.currentUserId != null && uid === state.currentUserId,
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
        isSelf: !!member.isSelf,
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

  function normalizeRoomFromApi(room){
    if (!room || typeof room !== 'object') return null;
    const isGroup = String(room.room_type || '').toUpperCase() === 'GROUP';
    const members = Array.isArray(room.members) ? room.members.map(normalizeMemberFromApi).filter(Boolean) : [];
    const contact = isGroup ? null : selectPrimaryMember(members);
    const name = room.room_name || (contact ? contact.name : `Room #${room.id}`);
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
          url: f.file_path,
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
      if (!entry.avatar) entry.avatar = resolveAvatarSrc('', name);
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
      avatar: resolveAvatarSrc('', name),
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
    liveRefreshTimer = setInterval(()=>{
      hydrateFromApi({ silent: true });
      const activeConv = conversations.find(c => c.id === activeId && c.roomId);
      if (activeConv) {
        requestMessageRefresh(activeConv.roomId);
      }
    }, POLL_INTERVAL_MS);
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
          locallyDeletedRoomIds.add(conv.id);
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
    var items = conversations
      .filter(function(c){
        if (filter === 'favorites') return !!c.fav;
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
        const left = Array.isArray(c.groupAvatars) && c.groupAvatars.length ? (()=>{
          const wrap = createEl('div', 'avatar-stack sm');
          c.groupAvatars.slice(0,3).forEach(src => {
            const im = document.createElement('img');
            im.src = resolveAvatarSrc(src, c.name || 'member');
            im.alt = 'member';
            im.onerror = () => { im.src = fallbackAvatar; };
            wrap.appendChild(im);
          });
          return wrap;
        })() : avatarImg(contact?.avatar || c.avatar, contact?.name || c.name);
        const deptRaw = contact?.department || c.dept || '';
        const deptLabel = deptRaw ? displayDeptName(deptRaw) : '';
        const subline = (deptLabel && deptLabel !== '소속 미지정') ? `<div class="subline">${deptLabel}</div>` : '';
        const previewLine = c.preview ? `<div class="preview">${c.preview}</div>` : '';
        const main = createEl('div', null,
          `<div class="name">${c.name || ''}</div>${subline}${previewLine}`
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
        const sys = createEl('div', 'system-line', m.text);
        frag.appendChild(sys);
        return;
      }
      const div = createEl('div', `message ${m.who}`);
      const isEmojiOnly = typeof m.text === 'string' && emojiOnlyRe.test(m.text.trim());
      const hasFiles = Array.isArray(m.files) && m.files.length;
      const t = (typeof m.text === 'string' ? m.text : '');
      const tTrim = t.trim();
      const isAttachmentPlaceholder = !!hasFiles && tTrim === '[첨부파일]';
      const hasText = tTrim.length > 0 && !isAttachmentPlaceholder;
      if (hasText || !hasFiles) {
        const text = createEl('div', isEmojiOnly ? 'emoji-only' : null, t || '');
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
          }
          row.appendChild(chip);
        });
        div.appendChild(row);
      }
      const meta = createEl('div', 'meta', m.time);
      div.appendChild(meta);
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
    const hasSelf = members.some(member => member?.isSelf);
    const hasOthers = members.some(member => member && !member.isSelf);
    return hasSelf && !hasOthers;
  }

  function materializeMembers(conv){
    if (!conv || !Array.isArray(conv.members)) return [];
    return conv.members.map(resolveMemberMeta).map(enrichMemberProfile).filter(Boolean);
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
    if (profile.nameEl) {
      profile.nameEl.textContent = conv ? (isGroup ? (conv.name || '') : (contact?.name || conv.name || '')) : '';
    }
    if (profile.emailEl) {
      profile.emailEl.textContent = contact?.email || '';
    }
    if (profile.extPhoneEl) {
      profile.extPhoneEl.textContent = contact?.extPhone || '';
    }
    if (profile.mobilePhoneEl) {
      profile.mobilePhoneEl.textContent = contact?.mobilePhone || contact?.phone || '';
    }
    if (profile.locationEl) {
      profile.locationEl.textContent = contact?.department || conv?.dept || '';
    }
    if (profile.avatarEl) {
      const baseSrc = conv ? (isGroup ? conv.avatar : (contact?.avatar || conv.avatar)) : null;
      renderAvatarInto(profile.avatarEl, baseSrc, contact?.name || conv?.name || '');
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
    const resp = await fetch(getRoomsUrl(), {
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
      throw new Error('failed to create direct room');
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
    locallyDeletedRoomIds.delete(normalized.id);
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

  function setActive(id){
    activeId = id;
    state.activeDirectoryKey = null;
    closeAddMemberMenu();
    const conv = conversations.find(c => c.id === id) || null;
    const prevUnread = conv ? (conv.unread || 0) : 0;
    const prevInteracted = conv ? (conv.lastInteracted || 0) : 0;
    const isGroup = isGroupConversation(conv);

    if (delBtn) {
      const canDelete = !conv
        ? false
        : (!conv.roomId || state.currentUserId == null || conv.createdByUserId == null)
          ? true
          : Number(conv.createdByUserId) === Number(state.currentUserId);
      delBtn.disabled = !canDelete;
      delBtn.setAttribute('aria-disabled', canDelete ? 'false' : 'true');
      delBtn.title = canDelete ? '삭제' : '삭제(생성자만 가능)';
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
      thread.nameEl.textContent = conv ? (conv.name || '') : '';
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
    if (attachments.length) localMessage.files = attachments.map(f => ({ name: f?.name || '파일', size: f?.size }));

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
      if (!conv.roomId && chatConfig.roomsUrl) {
        const entry = findEntryForConversation(conv) || buildPseudoEntryFromConversation(conv);
        if (entry) {
          try {
            const created = await createDirectRoomForEntry(entry);
            if (created && created.id) {
              setActive(created.id);
              conv = created;
            }
          } catch (err) {
            console.warn('[chat] Failed to create room before send', err);
          }
        }
      }

      if (!conv.roomId) {
        restoreDraft();
        window.alert('채팅방을 만들 수 없어 메시지를 보낼 수 없습니다. 잠시 후 다시 시도해주세요.');
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
  setInterval(() => {
    const conv = conversations.find(c => c.id === activeId);
    if (conv && conv.lastInteracted && profile.lastEl){
      profile.lastEl.textContent = formatRelative(conv.lastInteracted);
    }
  }, 60000);

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
    } catch (err) {
      console.warn('[chat] Failed to resolve whoami', err);
    }
  }

  ensureCurrentUserId().finally(()=>{
    hydrateFromApi();
  });

  function closeDeleteModal(){
    if (!deleteModal) return;
    deleteModal.hidden = true;
    deleteModal.setAttribute('aria-hidden','true');
    deleteModal.classList.remove('open');
    pendingDeleteId = null;
  }

  function performDeleteConversation(targetId, options = {}){
    if (!targetId) return;
    const { isLive = false } = options;
    if (isLive) locallyDeletedRoomIds.add(targetId);
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
    const label = isGroup ? '이 그룹 채팅을 삭제할까요?' : `${conv.name || '대화'}과의 채팅을 삭제할까요?`;
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
    // Always keep a local tombstone so a deleted conversation doesn't reappear.
    locallyDeletedRoomIds.add(conv.id);

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
            window.alert('채팅룸 삭제는 생성자만 가능합니다.');
            return false;
          }
          throw new Error('room delete failed');
        }
      } catch (err) {
        console.warn('[chat] Failed to delete room', err);
        window.alert('채팅을 삭제하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
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
          const resp = await fetch(getRoomsUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
          });
          if (!resp.ok) throw new Error('failed to create group room');
          const roomData = await resp.json();
          const normalized = normalizeRoomFromApi(roomData);
          if (!normalized) return null;
          conversations.unshift(normalized);
          locallyDeletedRoomIds.delete(normalized.id);
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
  function onDragOver(e){ e.preventDefault(); threadContainer.classList.add('droppable'); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; }
  function onDragLeave(){ threadContainer.classList.remove('droppable'); }
  async function onDrop(e){
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    threadContainer.classList.remove('droppable');
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
    // no drop on header (avoid duplicate handling)
  }
  if (messagesEl){
    ['dragenter','dragover'].forEach(evt => messagesEl.addEventListener(evt, onDragOver, true));
    messagesEl.addEventListener('dragleave', onDragLeave, true);
    // no drop on messages (avoid duplicate handling)
  }
  if (threadInput){
    ['dragenter','dragover'].forEach(evt => threadInput.addEventListener(evt, onDragOver, true));
    threadInput.addEventListener('dragleave', onDragLeave, true);
    // no drop on input (avoid duplicate handling)
  }

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

  // Avatar is non-interactive by design; no handlers attached.
})();