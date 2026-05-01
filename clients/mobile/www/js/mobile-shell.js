/* Blossom Chat - native mobile shell */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var K = {
    chat: '\uCC44\uD305',
    people: '\uB3D9\uB8CC',
    calendar: '\uC77C\uC815',
    memo: '\uBA54\uBAA8',
    settings: '\uC124\uC815',
    loading: '\uBD88\uB7EC\uC624\uB294 \uC911',
    retry: '\uB2E4\uC2DC \uC2DC\uB3C4',
    all: '\uC804\uCCB4',
    noTeam: '\uBBF8\uC9C0\uC815',
    profile: '\uB0B4 \uD504\uB85C\uD544',
    lock: '\uC571 \uC7A0\uAE08',
    quit: '\uC571 \uC885\uB8CC'
  };

  var tabs = [
    { id: 'chat', label: K.chat, icon: 'assets/svg/chat/free-icon-font-comment.svg' },
    { id: 'people', label: K.people, icon: 'assets/svg/chat/free-icon-font-following.svg' },
    { id: 'calendar', label: K.calendar, icon: 'assets/svg/chat/free-icon-font-calendar-clock.svg' },
    { id: 'memo', label: K.memo, icon: 'assets/svg/chat/free-icon-font-edit.svg' },
    { id: 'settings', label: K.settings, icon: 'assets/svg/chat/free-icon-font-settings.svg' }
  ];

  var state = {
    ready: false,
    tab: 'chat',
    view: 'list',
    me: null,
    currentUserId: null,
    rooms: [],
    activeRoom: null,
    messages: [],
    people: [],
    peopleDepartment: '',
    peopleQuery: '',
    activePersonId: null,
    schedules: [],
    calendarError: '',
    scheduleForm: null,
    scheduleAttendees: [],
    scheduleAttendeeQuery: '',
    memoGroups: [],
    activeMemoGroup: null,
    activeMemoId: null,
    memoForm: null,
    memos: [],
    memoError: '',
    settingsPanel: '',
    loading: false,
    error: '',
    toast: ''
  };

  var root = document.createElement('div');
  root.id = 'mNativeRoot';
  root.className = 'm-native-root';
  root.hidden = true;
  root.innerHTML = ''
    + '<header class="mn-top">'
    +   '<button type="button" class="mn-icon-btn mn-back" data-action="back" aria-label="back" hidden></button>'
    +   '<button type="button" class="mn-logo-btn" data-action="account" aria-label="account"><img src="assets/app-icon.png" alt="" /></button>'
    +   '<div class="mn-titlebox"><h1 id="mnTitle">' + K.chat + '</h1></div>'
    + '</header>'
    + '<main class="mn-main" id="mnMain"></main>'
    + '<nav class="mn-tabs" id="mnTabs"></nav>'
    + '<div class="mn-toast" id="mnToast" hidden></div>'
    + '<div class="mn-sheet" id="mnSheet" hidden>'
    +   '<button type="button" class="mn-sheet-bg" data-action="close-sheet" aria-label="close"></button>'
    +   '<section class="mn-sheet-card">'
    +     '<div class="mn-sheet-grip"></div>'
    +     '<div class="mn-account"><img src="assets/app-icon.png" alt="" /><div><strong>Blossom Chat</strong><span id="mnAccountText">\uC5C5\uBB34\uC6A9 \uBCF4\uC548 \uBA54\uC2E0\uC800</span></div></div>'
    +     '<button type="button" data-action="settings-profile">' + K.profile + '<span>\uACC4\uC815 \uC815\uBCF4\uC640 \uC0C1\uD0DC</span></button>'
    +     '<button type="button" data-action="settings-lock">' + K.lock + '<span>\uD604\uC7AC \uC138\uC158 \uBCF4\uD638</span></button>'
    +     '<button type="button" data-action="settings-quit" class="danger">' + K.quit + '<span>Blossom Chat \uB2EB\uAE30</span></button>'
    +   '</section>'
    + '</div>';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function arr(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    if (data && Array.isArray(data.rows)) return data.rows;
    if (data && Array.isArray(data.data)) return data.data;
    if (data && Array.isArray(data.schedules)) return data.schedules;
    if (data && Array.isArray(data.events)) return data.events;
    if (data && Array.isArray(data.memos)) return data.memos;
    if (data && Array.isArray(data.groups)) return data.groups;
    return [];
  }

  function titleOf(tab) {
    var found = tabs.filter(function (t) { return t.id === tab; })[0];
    return found ? found.label : 'Blossom Chat';
  }

  function textOf(value, fallback) {
    var s = String(value == null ? '' : value).trim();
    return s || fallback || '';
  }

  function initials(name) {
    var s = textOf(name, 'B');
    return s.slice(0, 1).toUpperCase();
  }

  function mediaUrl(path) {
    if (!path) return '';
    if (/^(https?:|data:|blob:|capacitor:)/i.test(path)) return path;
    var base = (window.Api && window.Api.serverUrl) || '';
    if (path.charAt(0) === '/') return base + path;
    return path;
  }

  function avatarHtml(src, name, className) {
    var url = mediaUrl(src);
    if (url) return '<span class="' + (className || 'mn-avatar') + ' img"><img src="' + esc(url) + '" alt="" /></span>';
    return '<span class="' + (className || 'mn-avatar') + '">' + esc(initials(name)) + '</span>';
  }

  function roomName(room) {
    return textOf(room && (room.name || room.title || room.room_name || room.display_name), '\uB300\uD654\uBC29');
  }

  function roomType(room) {
    var type = String((room && (room.type || room.room_type)) || '').toUpperCase();
    return type === 'DM' || type === 'DIRECT' ? 'DM' : '\uCC44\uB110';
  }

  function msgText(m) {
    return textOf(m && (m.content_text || m.text || m.body || m.message || m.content), '');
  }

  function msgAuthor(m) {
    var sender = m && m.sender;
    return textOf(m && (m.sender_name || m.user_name || m.name || (sender && sender.name)), '\uC0AC\uC6A9\uC790');
  }

  function msgAvatar(m) {
    var sender = m && m.sender;
    return (m && (m.sender_profile_image || m.profile_image)) || (sender && sender.profile_image) || '';
  }

  function timeText(value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function dateIso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function groupId(g) {
    return g && (g.id || g.group_id || g.memo_group_id);
  }

  function memoId(m) {
    return m && (m.id || m.memo_id);
  }

  function userId(u) {
    return u && (u.id || u.user_id || u.employee_id || u.emp_no);
  }

  function serverUserId(u) {
    return u && (u.id || u.user_id);
  }

  function normalizeProfile(profile) {
    return (profile && (profile.item || profile.user || profile.profile)) || profile || null;
  }

  function sameValue(a, b) {
    var left = String(a == null ? '' : a).trim();
    var right = String(b == null ? '' : b).trim();
    return !!left && left === right;
  }

  async function ensureCurrentUserId() {
    if (state.currentUserId) return state.currentUserId;
    var profile = normalizeProfile(state.me);
    if (!profile && window.Api && window.Api.myProfile) {
      profile = normalizeProfile(await window.Api.myProfile());
      state.me = profile;
    } else if (profile !== state.me) {
      state.me = profile;
    }

    var id = serverUserId(profile);
    if (!id && window.Api && window.Api.fetchCoworkers) {
      var people = state.people && state.people.length ? state.people : arr(await window.Api.fetchCoworkers({ q: '', limit: 1000 }));
      if (people && people.length) state.people = people;
      var empNo = profile && (profile.emp_no || profile.employee_id || profile.empNo);
      var loginId = profile && (profile.login_id || profile.account || profile.username || profile.user_name);
      var name = profile && (profile.name || profile.display_name || profile.nickname);
      var match = people.filter(function (u) {
        return sameValue(u.emp_no || u.employee_id || u.empNo, empNo)
          || sameValue(u.login_id || u.account || u.username || u.user_name, loginId)
          || sameValue(u.name || u.display_name || u.nickname, name);
      })[0];
      id = serverUserId(match);
    }

    state.currentUserId = id || null;
    if (!state.currentUserId) throw new Error('\uD604\uC7AC \uC0AC\uC6A9\uC790 \uC815\uBCF4\uB97C \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uB85C\uADF8\uC778\uD574 \uC8FC\uC138\uC694.');
    return state.currentUserId;
  }

  function scheduleStart(s) {
    return s && (s.start || s.start_at || s.startAt || s.started_at || s.date || s.begin_at || s.start_time);
  }

  function scheduleTitle(s) {
    return textOf(s && (s.title || s.name || s.summary || s.subject), '\uC81C\uBAA9 \uC5C6\uB294 \uC77C\uC815');
  }

  function scheduleId(s) {
    return s && (s.id || s.schedule_id || s.event_id);
  }

  function scheduleEnd(s) {
    return s && (s.end || s.end_at || s.endAt || s.ended_at || s.end_datetime || s.end_time);
  }

  function scheduleShareScope(s) {
    var scope = String((s && (s.share_scope || s.shareScope)) || 'PRIVATE').toUpperCase();
    if (scope === 'PUBLIC') return 'ALL';
    return scope || 'PRIVATE';
  }

  function scheduleRepeatRule(s) {
    var raw = s && (s.repeat_rule || s.repeatRule);
    if (!raw) return {};
    if (typeof raw === 'string') {
      try {
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (_) { return {}; }
    }
    return typeof raw === 'object' ? raw : {};
  }

  function scheduleRepeatType(s) {
    return String((s && (s.repeat_type || s.repeatType)) || 'none').toLowerCase();
  }

  function attendeeLabel(u) {
    var name = textOf(u && (u.name || u.nickname || u.user_name), '');
    var dept = textOf(u && (u.department || u.team_name || u.dept_name || u.deptName), '');
    var emp = textOf(u && (u.emp_no || u.employee_id || u.employeeNo), '');
    var head = [dept, name].filter(Boolean).join(' · ');
    return emp ? head + ' (' + emp + ')' : (head || ('user#' + (serverUserId(u) || '')));
  }

  function normalizeScheduleAttendees(items) {
    var seen = {};
    return arr(items).map(function (item) {
      var user = item && (item.user || item);
      var id = serverUserId(item) || (item && item.user_id) || serverUserId(user);
      var label = textOf(item && (item.label || item.name), '') || attendeeLabel(user);
      return { userId: id, label: label };
    }).filter(function (ref) {
      var key = String(ref.userId || ref.label || '');
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function scheduleAttendeesFromEvent(s) {
    if (scheduleShareScope(s) !== 'SELECT') return [];
    if (Array.isArray(s && s.share_users) && s.share_users.length) {
      return normalizeScheduleAttendees(s.share_users.map(function (su) {
        var user = su.user || {};
        return {
          user_id: su.user_id || user.id,
          label: attendeeLabel({
            id: su.user_id || user.id,
            name: user.name || user.nickname,
            department: user.department,
            emp_no: user.emp_no
          })
        };
      }));
    }
    return normalizeScheduleAttendees((s && s.attendees) || []);
  }

  function buildScheduleFormFromEvent(s) {
    var rule = scheduleRepeatRule(s);
    return {
      id: scheduleId(s) || '',
      title: scheduleTitle(s),
      start: toInputDateTime(scheduleStart(s), 9),
      end: toInputDateTime(scheduleEnd(s), 10),
      allDay: !!(s && (s.is_all_day || s.all_day || s.isAllDay)),
      type: (s && s.event_type) || '\uAE30\uD0C0',
      share: scheduleShareScope(s),
      reminder: Array.isArray(s && s.reminders) ? (s.reminders[0] || '') : '',
      color: (s && s.color_code) || '#6366f1',
      important: !!(s && s.is_important),
      location: (s && s.location) || '',
      description: (s && s.description) || '',
      repeat: scheduleRepeatType(s),
      repeatEndType: rule.endType || 'never',
      repeatUntil: rule.untilDate || '',
      repeatCount: rule.count || 10,
      repeatInterval: rule.interval || 1,
      repeatFrequency: rule.frequency || scheduleRepeatType(s) || 'daily',
      repeatDays: Array.isArray(rule.daysOfWeek) ? rule.daysOfWeek : []
    };
  }

  function findSchedule(id) {
    return state.schedules.filter(function (s) { return String(scheduleId(s)) === String(id); })[0] || null;
  }

  function toInputDateTime(value, fallbackHour) {
    var d = value ? new Date(value) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    if (!value && fallbackHour != null) d.setHours(fallbackHour, 0, 0, 0);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
      + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function fromInputDateTime(value) {
    return value ? value + ':00' : '';
  }

  function findPerson(id) {
    return state.people.filter(function (u) { return String(userId(u)) === String(id); })[0] || null;
  }

  function findMemo(id) {
    return state.memos.filter(function (m) { return String(memoId(m)) === String(id); })[0] || null;
  }

  async function startDmWithPerson(person) {
    var targetId = serverUserId(person);
    var meId = await ensureCurrentUserId().catch(function () { return null; });
    if (!targetId || !meId || String(targetId) === String(meId)) {
      showToast('\uB300\uD654\uB97C \uC2DC\uC791\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.');
      return;
    }
    var existing = state.rooms.filter(function (r) {
      var type = String(r.room_type || r.type || '').toUpperCase();
      if (type !== 'DIRECT' && type !== 'DM') return false;
      var ids = arr(r.members).map(function (m) { return String(m.user_id || m.id); }).sort();
      return ids.indexOf(String(targetId)) >= 0 && ids.indexOf(String(meId)) >= 0;
    })[0];
    if (!existing) {
      existing = await window.Api.createRoom({
        room_type: 'DIRECT',
        created_by_user_id: meId,
        member_ids: [meId, targetId]
      });
      await loadRooms();
    }
    state.tab = 'chat';
    state.view = 'list';
    state.activePersonId = null;
    await openRoom(existing.id);
  }

  function memoPreview(value) {
    var raw = String(value == null ? '' : value);
    if (!raw) return '';
    raw = raw
      .replace(/<img\b[^>]*>/gi, ' [\uC774\uBBF8\uC9C0] ')
      .replace(/\[[^\]\s]*\.(?:png|jpe?g|gif|webp|bmp|svg)\]/gi, ' [\uC774\uBBF8\uC9C0] ')
      .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, ' [\uC774\uBBF8\uC9C0] ');
    var box = document.createElement('div');
    box.innerHTML = raw;
    return (box.textContent || box.innerText || raw)
      .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, ' [\uC774\uBBF8\uC9C0] ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
  }

  function attach() {
    document.body.appendChild(root);
    renderTabs();
    watchLoginState();
  }

  if (document.body) attach();
  else document.addEventListener('DOMContentLoaded', attach);

  function appVisible() {
    var shell = $('appShell');
    return !!(shell && !shell.hidden);
  }

  function watchLoginState() {
    var tick = function () {
      var visible = appVisible();
      root.hidden = !visible;
      document.body.classList.toggle('m-native-active', visible);
      if (visible && !state.ready) boot();
      if (!visible) {
        state.ready = false;
        state.currentUserId = null;
      }
    };
    tick();
    var shell = $('appShell');
    if (shell) new MutationObserver(tick).observe(shell, { attributes: true, attributeFilter: ['hidden'] });
    setInterval(tick, 1000);
  }

  async function boot() {
    state.ready = true;
    state.tab = 'chat';
    state.view = 'list';
    render();
    try {
      state.me = normalizeProfile(await window.Api.myProfile());
      try { await ensureCurrentUserId(); } catch (_) {}
      var label = $('mnAccountText');
      if (label) label.textContent = textOf(state.me && (state.me.name || state.me.employee_id || state.me.emp_no), '\uC5C5\uBB34\uC6A9 \uBCF4\uC548 \uBA54\uC2E0\uC800');
    } catch (_) {}
    await loadTab('chat');
  }

  function renderTabs() {
    var nav = $('mnTabs');
    if (!nav) return;
    nav.innerHTML = tabs.map(function (tab) {
      return '<button type="button" class="mn-tab" data-tab="' + tab.id + '">'
        + '<img src="' + tab.icon + '" alt="" />'
        + '<span>' + tab.label + '</span>'
        + '</button>';
    }).join('');
  }

  function showToast(message) {
    var toast = $('mnToast');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.hidden = true; }, 1800);
  }

  function readSetting(key, fallback) {
    try {
      var raw = window.localStorage && window.localStorage.getItem('blossom.setting.' + key);
      if (raw !== null && raw !== undefined) return JSON.parse(raw);
    } catch (_) {}
    return fallback;
  }

  async function writeSetting(key, value) {
    try {
      if (window.blossom && window.blossom.settings && window.blossom.settings.set) {
        await window.blossom.settings.set(key, value);
        return;
      }
    } catch (_) {}
    try {
      if (window.localStorage) window.localStorage.setItem('blossom.setting.' + key, JSON.stringify(value));
    } catch (_) {}
  }

  function boolControl(key, label, desc, fallback) {
    var checked = readSetting(key, fallback) !== false;
    return '<label class="mn-setting-row"><span><strong>' + label + '</strong><small>' + desc + '</small></span><input type="checkbox" data-setting-key="' + key + '" ' + (checked ? 'checked' : '') + ' /></label>';
  }

  function inputControl(key, label, desc, fallback, type) {
    return '<label class="mn-setting-row vertical"><span><strong>' + label + '</strong><small>' + desc + '</small></span><input type="' + (type || 'text') + '" data-setting-key="' + key + '" value="' + esc(readSetting(key, fallback) || '') + '" /></label>';
  }

  function selectControl(key, label, desc, fallback, options) {
    var value = String(readSetting(key, fallback));
    return '<label class="mn-setting-row vertical"><span><strong>' + label + '</strong><small>' + desc + '</small></span><select data-setting-key="' + key + '">'
      + options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === value ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('')
      + '</select></label>';
  }

  function setLoading(message) {
    state.loading = true;
    state.error = '';
    var main = $('mnMain');
    if (main) main.innerHTML = '<div class="mn-state"><span class="mn-spinner"></span><strong>' + esc(message || K.loading) + '</strong></div>';
  }

  function setError(message) {
    state.loading = false;
    state.error = message || '\uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.';
    render();
  }

  async function loadTab(tab) {
    if (!window.Api) {
      setError('API \uD074\uB77C\uC774\uC5B8\uD2B8\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.');
      return;
    }
    try {
      if (tab === 'chat') await loadRooms();
      if (tab === 'people') await loadPeople();
      if (tab === 'calendar') await loadSchedules();
      if (tab === 'memo') await loadMemo();
      if (tab === 'settings') render();
    } catch (e) {
      setError((e && e.message) || '\uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.');
    }
  }

  async function loadRooms() {
    setLoading('\uB300\uD654 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911');
    state.rooms = arr(await window.Api.listRooms());
    state.loading = false;
    render();
  }

  async function openRoom(id) {
    var room = state.rooms.filter(function (r) { return String(r.id) === String(id); })[0];
    if (!room) return;
    state.activeRoom = room;
    state.view = 'room';
    setLoading('\uBA54\uC2DC\uC9C0\uB97C \uBD88\uB7EC\uC624\uB294 \uC911');
    var meId = await ensureCurrentUserId().catch(function () { return null; });
    var opts = { perPage: 80 };
    if (meId) opts.viewerUserId = meId;
    state.messages = arr(await window.Api.listMessages(room.id, opts));
    state.loading = false;
    render();
    var thread = document.querySelector('.mn-thread');
    if (thread) thread.scrollTop = thread.scrollHeight;
  }

  async function sendMessage() {
    var input = $('mnComposer');
    var text = input && input.value.trim();
    if (!text || !state.activeRoom) return;
    input.value = '';
    try {
      var meId = await ensureCurrentUserId();
      await window.Api.sendMessage(state.activeRoom.id, meId, text);
      await openRoom(state.activeRoom.id);
    } catch (err) {
      input.value = text;
      throw err;
    }
  }

  async function loadPeople() {
    setLoading('\uB3D9\uB8CC \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uB294 \uC911');
    state.people = arr(await window.Api.fetchCoworkers({ q: '', limit: 1000 }));
    state.loading = false;
    render();
  }

  async function loadSchedules() {
    setLoading('\uC77C\uC815\uC744 \uBD88\uB7EC\uC624\uB294 \uC911');
    state.calendarError = '';
    var now = new Date();
    var start = new Date(now.getFullYear(), now.getMonth(), 1);
    var end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    try {
      state.schedules = arr(await window.Api.listCalendarSchedules({ start: dateIso(start), end: dateIso(end), limit: 500 }));
    } catch (firstErr) {
      try {
        state.schedules = arr(await window.Api.listCalendarSchedules({ limit: 500 }));
      } catch (secondErr) {
        state.schedules = [];
      }
    }
    state.loading = false;
    render();
  }

  async function loadMemo() {
    setLoading('\uBA54\uBAA8\uB97C \uBD88\uB7EC\uC624\uB294 \uC911');
    state.memoError = '';
    try {
      state.memoGroups = arr(await window.Api.listMemoGroups());
      if (!state.activeMemoGroup && state.memoGroups.length) state.activeMemoGroup = groupId(state.memoGroups[0]);
      if (state.activeMemoGroup) state.memos = arr(await window.Api.listMemos(state.activeMemoGroup, { pageSize: 200, sort: 'updated_desc' }));
      else state.memos = [];
    } catch (e) {
      state.memoGroups = state.memoGroups || [];
      state.memos = [];
      state.memoError = (e && e.message) || '\uBA54\uBAA8\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.';
    }
    state.loading = false;
    render();
  }

  async function createMemo() {
    if (!state.activeMemoGroup) {
      var group = await window.Api.createMemoGroup('\uAE30\uBCF8');
      state.activeMemoGroup = groupId(group);
    }
    state.memoForm = { id: '', title: '\uC0C8 \uBA54\uBAA8', body: '' };
    state.activeMemoId = '__form__';
    render();
  }

  async function saveMemoForm() {
    var titleEl = $('mnMemoTitle');
    var bodyEl = $('mnMemoBody');
    var title = (titleEl && titleEl.value.trim()) || '\uC81C\uBAA9 \uC5C6\uC74C';
    var body = (bodyEl && bodyEl.value) || '';
    if (!state.activeMemoGroup) {
      var group = await window.Api.createMemoGroup('\uAE30\uBCF8');
      state.activeMemoGroup = groupId(group);
    }
    if (state.memoForm && state.memoForm.id) await window.Api.updateMemo(state.memoForm.id, { title: title, body: body });
    else await window.Api.createMemo(state.activeMemoGroup, { title: title, body: body });
    state.memoForm = null;
    state.activeMemoId = null;
    await loadMemo();
    showToast('\uBA54\uBAA8\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.');
  }

  async function deleteMemoForm() {
    if (state.memoForm && state.memoForm.id) await window.Api.deleteMemo(state.memoForm.id);
    state.memoForm = null;
    state.activeMemoId = null;
    await loadMemo();
    showToast('\uBA54\uBAA8\uB97C \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.');
  }

  async function saveScheduleForm() {
    var title = (($('mnScheduleTitle') && $('mnScheduleTitle').value) || '').trim();
    var start = ($('mnScheduleStart') && $('mnScheduleStart').value) || '';
    var end = ($('mnScheduleEnd') && $('mnScheduleEnd').value) || '';
    var allDay = !!($('mnScheduleAllDay') && $('mnScheduleAllDay').checked);
    if (!title || !start || !end) {
      showToast('\uC81C\uBAA9\uACFC \uC2DC\uC791/\uC885\uB8CC \uC2DC\uAC04\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.');
      return;
    }
    if (allDay && String(end).slice(0, 10) < String(start).slice(0, 10)) {
      showToast('\uC885\uC77C \uC77C\uC815\uC758 \uC885\uB8CC \uB0A0\uC9DC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.');
      return;
    }
    var share = (($('mnScheduleShare') && $('mnScheduleShare').value) || 'PRIVATE');
    if (share === 'SELECT' && !state.scheduleAttendees.length) {
      showToast('\uC120\uD0DD\uACF5\uC720\uB294 \uCC38\uC11D\uC790\uB97C \uD55C \uBA85 \uC774\uC0C1 \uCD94\uAC00\uD574\uC8FC\uC138\uC694.');
      return;
    }
    var repeatType = (($('mnScheduleRepeat') && $('mnScheduleRepeat').value) || 'none').toLowerCase();
    var repeatFrequency = repeatType === 'custom'
      ? (($('mnScheduleRepeatFrequency') && $('mnScheduleRepeatFrequency').value) || 'daily')
      : repeatType;
    var repeatRule = {};
    if (repeatType !== 'none') {
      var interval = repeatType === 'custom' ? parseInt(($('mnScheduleRepeatInterval') && $('mnScheduleRepeatInterval').value) || '1', 10) : 1;
      if (isNaN(interval) || interval < 1) {
        showToast('\uBC18\uBCF5 \uC8FC\uAE30\uB294 1 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.');
        return;
      }
      var endType = (($('mnScheduleRepeatEndType') && $('mnScheduleRepeatEndType').value) || 'never');
      repeatRule = { interval: interval, frequency: repeatFrequency, endType: endType };
      if (repeatFrequency === 'weekly') {
        var days = Array.prototype.slice.call(root.querySelectorAll('input[name="mnRepeatDay"]:checked')).map(function (el) { return el.value; });
        if (!days.length) {
          showToast('\uB9E4\uC8FC \uBC18\uBCF5\uC740 \uC694\uC77C\uC744 \uD558\uB098 \uC774\uC0C1 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.');
          return;
        }
        repeatRule.daysOfWeek = days;
      }
      if (repeatFrequency === 'monthly' || repeatFrequency === 'yearly') repeatRule.monthDayPolicy = 'clamp';
      if (endType === 'until') {
        var until = (($('mnScheduleRepeatUntil') && $('mnScheduleRepeatUntil').value) || '').trim().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || until < String(start).slice(0, 10)) {
          showToast('\uBC18\uBCF5 \uC885\uB8CC \uB0A0\uC9DC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.');
          return;
        }
        repeatRule.untilDate = until;
      } else if (endType === 'count') {
        var count = parseInt(($('mnScheduleRepeatCount') && $('mnScheduleRepeatCount').value) || '0', 10);
        if (isNaN(count) || count < 1) {
          showToast('\uBC18\uBCF5 \uD69F\uC218\uB294 1 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.');
          return;
        }
        repeatRule.count = count;
      }
    }
    var reminder = (($('mnScheduleReminder') && $('mnScheduleReminder').value) || '');
    var startIso = allDay ? String(start).slice(0, 10) + 'T00:00:00' : fromInputDateTime(start);
    var endIso = allDay ? String(end).slice(0, 10) + 'T23:59:00' : fromInputDateTime(end);
    var payload = {
      title: title,
      start_datetime: startIso,
      end_datetime: endIso,
      location: (($('mnScheduleLocation') && $('mnScheduleLocation').value) || '').trim(),
      description: (($('mnScheduleDesc') && $('mnScheduleDesc').value) || ''),
      share_scope: share,
      event_type: (($('mnScheduleType') && $('mnScheduleType').value) || '\uAE30\uD0C0'),
      is_all_day: allDay,
      attendees: share === 'SELECT' ? state.scheduleAttendees.map(function (r) { return r.label; }) : [],
      reminders: reminder ? [reminder] : [],
      sticker: '',
      is_important: !!($('mnScheduleImportant') && $('mnScheduleImportant').checked),
      color_code: (($('mnScheduleColor') && $('mnScheduleColor').value) || '#6366f1'),
      repeat_type: repeatType,
      repeat_rule: repeatRule
    };
    if (share === 'SELECT') {
      payload.share_users = state.scheduleAttendees.map(function (r) {
        return { user_id: r.userId, can_edit: false, notification_enabled: true };
      }).filter(function (r) { return r.user_id; });
    }
    if (state.scheduleForm && state.scheduleForm.id) await window.Api.updateCalendarSchedule(state.scheduleForm.id, payload);
    else await window.Api.createCalendarSchedule(payload);
    state.scheduleForm = null;
    state.scheduleAttendees = [];
    state.scheduleAttendeeQuery = '';
    await loadSchedules();
    showToast('\uC77C\uC815\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.');
  }

  async function deleteScheduleForm() {
    if (state.scheduleForm && state.scheduleForm.id) await window.Api.deleteCalendarSchedule(state.scheduleForm.id);
    state.scheduleForm = null;
    state.scheduleAttendees = [];
    state.scheduleAttendeeQuery = '';
    await loadSchedules();
    showToast('\uC77C\uC815\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.');
  }

  function render() {
    var main = $('mnMain');
    var title = $('mnTitle');
    var back = root.querySelector('.mn-back');
    if (!main || !title) return;

    title.textContent = state.view === 'room' && state.activeRoom ? roomName(state.activeRoom) : titleOf(state.tab);
    if (back) back.hidden = !(state.tab === 'chat' && state.view === 'room')
      && !(state.tab === 'people' && state.activePersonId)
      && !(state.tab === 'memo' && state.activeMemoId)
      && !(state.tab === 'calendar' && state.scheduleForm)
      && !(state.tab === 'settings' && state.settingsPanel);

    Array.prototype.forEach.call(root.querySelectorAll('.mn-tab'), function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === state.tab);
    });

    if (state.loading) return;
    if (state.error) {
      main.innerHTML = '<div class="mn-state"><strong>' + esc(state.error) + '</strong><button type="button" data-action="refresh">' + K.retry + '</button></div>';
      return;
    }

    if (state.tab === 'chat' && state.view === 'room') main.innerHTML = renderRoom();
    else if (state.tab === 'chat') main.innerHTML = renderChat();
    else if (state.tab === 'people') main.innerHTML = state.activePersonId ? renderPersonDetail() : renderPeople();
    else if (state.tab === 'calendar') main.innerHTML = state.scheduleForm ? renderScheduleForm() : renderCalendar();
    else if (state.tab === 'memo') main.innerHTML = state.activeMemoId ? renderMemoDetail() : renderMemo();
    else main.innerHTML = renderSettings();
  }

  function renderChat() {
    if (!state.rooms.length) return '<div class="mn-state"><strong>\uB300\uD654\uBC29\uC774 \uC5C6\uC2B5\uB2C8\uB2E4</strong><span>\uC11C\uBC84\uC5D0\uC11C \uCC44\uB110\uACFC DM\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.</span></div>';
    var channels = [];
    var messages = [];
    state.rooms.forEach(function (room) {
      if (roomType(room) === 'DM') messages.push(room);
      else channels.push(room);
    });
    function roomButton(room) {
      var last = room.last_message_text || room.last_message || room.description || '';
      var unread = Number(room.viewer_unread_count || room.unread_count || 0);
      return '<button type="button" class="mn-room" data-room-id="' + esc(room.id) + '">'
        + '<span class="mn-room-avatar">' + (roomType(room) === 'DM' ? '@' : '#') + '</span>'
        + '<span class="mn-room-body"><strong>' + esc(roomName(room)) + '</strong><small>' + esc(last || roomType(room)) + '</small></span>'
        + (unread ? '<em>' + unread + '</em>' : '')
        + '</button>';
    }
    return '<section class="mn-chat-sections">'
      + '<section class="mn-chat-section"><h2>\uCC44\uB110</h2><div class="mn-list">' + (channels.map(roomButton).join('') || '<div class="mn-empty-row">\uD45C\uC2DC\uD560 \uCC44\uB110\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>') + '</div></section>'
      + '<section class="mn-chat-section"><h2>\uBA54\uC2DC\uC9C0</h2><div class="mn-list">' + (messages.map(roomButton).join('') || '<div class="mn-empty-row">\uD45C\uC2DC\uD560 \uBA54\uC2DC\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</div>') + '</div></section>'
      + '</section>';
  }

  function renderRoom() {
    var messages = state.messages.map(function (m) {
      var author = msgAuthor(m);
      return '<article class="mn-message">'
        + avatarHtml(msgAvatar(m), author, 'mn-avatar')
        + '<div><header><strong>' + esc(author) + '</strong><time>' + esc(timeText(m.created_at || m.sent_at || m.createdAt)) + '</time></header>'
        + '<p>' + esc(msgText(m)) + '</p></div>'
        + '</article>';
    }).join('');
    return '<section class="mn-room-view">'
      + '<div class="mn-thread">' + (messages || '<div class="mn-state"><strong>\uBA54\uC2DC\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4</strong></div>') + '</div>'
      + '<form class="mn-composer" data-action="send"><textarea id="mnComposer" rows="1" placeholder="\uBA54\uC2DC\uC9C0 \uBCF4\uB0B4\uAE30"></textarea><button type="submit">\uC804\uC1A1</button></form>'
      + '</section>';
  }

  function departments() {
    var map = {};
    state.people.forEach(function (u) {
      var dept = textOf(u.department || u.team_name || u.dept_name || u.deptName, K.noTeam);
      map[dept] = true;
    });
    return Object.keys(map).sort();
  }

  function renderPeople() {
    if (!state.people.length) return '<div class="mn-state"><strong>\uB3D9\uB8CC \uC815\uBCF4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4</strong><span>\uC11C\uBC84\uC758 \uC870\uC9C1 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uAC70\uB098 \uD45C\uC2DC\uD560 \uB3D9\uB8CC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</span></div>';
    var q = state.peopleQuery.trim().toLowerCase();
    var filtered = state.people.filter(function (u) {
      var dept = textOf(u.department || u.team_name || u.dept_name || u.deptName, K.noTeam);
      var hay = [u.name, u.nickname, u.user_name, u.emp_no, u.employee_id, dept, u.email].join(' ').toLowerCase();
      return (!q || hay.indexOf(q) >= 0) && (!state.peopleDepartment || dept === state.peopleDepartment);
    });
    var byDept = {};
    filtered.forEach(function (u) {
      var dept = textOf(u.department || u.team_name || u.dept_name || u.deptName, K.noTeam);
      if (!byDept[dept]) byDept[dept] = [];
      byDept[dept].push(u);
    });
    var tree = Object.keys(byDept).sort().map(function (dept) {
      return '<details class="mn-org" open><summary><strong>' + esc(dept) + '</strong><span>' + byDept[dept].length + '</span></summary>'
        + byDept[dept].map(function (u) {
          var name = textOf(u.name || u.nickname || u.user_name, '\uC774\uB984 \uC5C6\uC74C');
          var emp = u.emp_no || u.employee_id || u.employeeNo || '';
          var team = textOf(u.department || u.team_name || u.dept_name || u.deptName, '');
          var pic = u.profile_image || u.avatar_url || u.avatar || u.image_url || '';
          return '<button type="button" class="mn-person" data-person-id="' + esc(userId(u)) + '">'
            + avatarHtml(pic, name, 'mn-avatar')
            + '<span><strong>' + esc(name) + '</strong><small>' + esc([emp, team].filter(Boolean).join(' · ') || '\uC0AC\uBC88/\uD300 \uC815\uBCF4 \uC5C6\uC74C') + '</small></span>'
            + '</button>';
        }).join('') + '</details>';
    }).join('');
    return '<section class="mn-people">'
      + '<label class="mn-search"><input id="mnPeopleSearch" type="search" value="' + esc(state.peopleQuery) + '" placeholder="\uC774\uB984, \uC0AC\uBC88, \uD300 \uAC80\uC0C9" /></label>'
      + '<div class="mn-org-list">' + (tree || '<div class="mn-state inline"><strong>\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4</strong></div>') + '</div>'
      + '</section>';
  }

  function renderPersonDetail() {
    var u = findPerson(state.activePersonId);
    if (!u) return '<div class="mn-state"><strong>\uB3D9\uB8CC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4</strong></div>';
    var name = textOf(u.name || u.nickname || u.user_name, '\uC774\uB984 \uC5C6\uC74C');
    var emp = u.emp_no || u.employee_id || u.employeeNo || '';
    var team = textOf(u.department || u.team_name || u.dept_name || u.deptName, '');
    var pic = u.profile_image || u.avatar_url || u.avatar || u.image_url || '';
    return '<section class="mn-person-detail">'
      + '<article class="mn-profile-card">' + avatarHtml(pic, name, 'mn-avatar big') + '<div><strong>' + esc(name) + '</strong><span>' + esc([emp, team].filter(Boolean).join(' · ') || '\uC0AC\uBC88/\uD300 \uC815\uBCF4 \uC5C6\uC74C') + '</span></div></article>'
      + '<button type="button" class="mn-primary-wide" data-action="person-chat">\uCC44\uD305\uD558\uAE30</button>'
      + '</section>';
  }

  function renderCalendar() {
    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth();
    var first = new Date(y, m, 1);
    var last = new Date(y, m + 1, 0);
    var cells = [];
    for (var i = 0; i < first.getDay(); i++) cells.push('<span></span>');
    for (var d = 1; d <= last.getDate(); d++) {
      var iso = dateIso(new Date(y, m, d));
      var dayItems = state.schedules.filter(function (s) {
        var v = scheduleStart(s);
        return v && String(v).slice(0, 10) === iso;
      });
      var labels = dayItems.slice(0, 2).map(function (s) { return '<button type="button" data-schedule-id="' + esc(scheduleId(s)) + '">' + esc(scheduleTitle(s)) + '</button>'; }).join('');
      cells.push('<span class="' + (dateIso(now) === iso ? 'today' : '') + '"><b>' + d + '</b>' + labels + (dayItems.length > 2 ? '<em>+' + (dayItems.length - 2) + '</em>' : '') + '</span>');
    }
    return '<section class="mn-calendar">'
      + '<div class="mn-month-head"><strong>' + y + '\uB144 ' + (m + 1) + '\uC6D4</strong><button type="button" data-action="new-schedule">\uC77C\uC815 \uB4F1\uB85D</button></div>'
      + '<div class="mn-week"><span>\uC77C</span><span>\uC6D4</span><span>\uD654</span><span>\uC218</span><span>\uBAA9</span><span>\uAE08</span><span>\uD1A0</span></div>'
      + '<div class="mn-month">' + cells.join('') + '</div>'
      + '</section>';
  }

  function renderScheduleForm() {
    var f = state.scheduleForm || {};
    var selectedDays = {};
    (f.repeatDays || []).forEach(function (d) { selectedDays[d] = true; });
    var attendeeQuery = state.scheduleAttendeeQuery.trim().toLowerCase();
    var attendeeMatches = attendeeQuery ? state.people.filter(function (u) {
      var hay = [u.name, u.nickname, u.user_name, u.emp_no, u.employee_id, u.department, u.team_name].join(' ').toLowerCase();
      var already = state.scheduleAttendees.some(function (r) { return String(r.userId) === String(serverUserId(u)); });
      return !already && hay.indexOf(attendeeQuery) >= 0;
    }).slice(0, 8) : [];
    var attendeeChips = state.scheduleAttendees.map(function (r, idx) {
      return '<button type="button" class="mn-token" data-action="schedule-attendee-remove" data-attendee-index="' + idx + '">' + esc(r.label) + '</button>';
    }).join('');
    var attendeeResults = attendeeMatches.map(function (u) {
      return '<button type="button" class="mn-attendee-result" data-attendee-user="' + esc(serverUserId(u) || '') + '">'
        + avatarHtml(u.profile_image || u.avatar_url || '', u.name || u.nickname, 'mn-avatar')
        + '<span><strong>' + esc(u.name || u.nickname || '\uC774\uB984 \uC5C6\uC74C') + '</strong><small>' + esc([u.emp_no || u.employee_id, u.department || u.team_name].filter(Boolean).join(' · ')) + '</small></span>'
        + '</button>';
    }).join('');
    return '<form class="mn-edit-form" data-action="schedule-submit">'
      + '<label><span>\uC81C\uBAA9</span><div class="mn-title-line"><input id="mnScheduleTitle" value="' + esc(f.title || '') + '" placeholder="\uC77C\uC815 \uC81C\uBAA9" maxlength="200" /><span class="mn-check-inline"><input id="mnScheduleImportant" type="checkbox" ' + (f.important ? 'checked' : '') + ' /> \uC911\uC694</span></div></label>'
      + '<div class="mn-form-grid-2"><label><span>\uC2DC\uC791</span><input id="mnScheduleStart" type="datetime-local" value="' + esc(f.start || toInputDateTime(null, 9)) + '" /></label>'
      + '<label><span>\uC885\uB8CC</span><input id="mnScheduleEnd" type="datetime-local" value="' + esc(f.end || toInputDateTime(null, 10)) + '" /></label></div>'
      + '<label class="mn-check-inline"><input id="mnScheduleAllDay" type="checkbox" ' + (f.allDay ? 'checked' : '') + ' /> \uC885\uC77C</label>'
      + '<div class="mn-form-grid-2"><label><span>\uC77C\uC815 \uC720\uD615</span><select id="mnScheduleType">'
      + ['\uC791\uC5C5', '\uBBF8\uD305', '\uAD50\uC721', '\uD734\uAC00', '\uC678\uADFC', '\uAE30\uD0C0'].map(function (v) { return '<option value="' + v + '"' + ((f.type || '\uBBF8\uD305') === v ? ' selected' : '') + '>' + v + '</option>'; }).join('')
      + '</select></label>'
      + '<label><span>\uC77C\uC815 \uACF5\uC720</span><select id="mnScheduleShare"><option value="PRIVATE"' + ((f.share || 'PRIVATE') === 'PRIVATE' ? ' selected' : '') + '>\uAE30\uBCF8</option><option value="ALL"' + (f.share === 'ALL' ? ' selected' : '') + '>\uC804\uCCB4\uACF5\uC720</option><option value="DEPARTMENT"' + (f.share === 'DEPARTMENT' ? ' selected' : '') + '>\uBD80\uC11C\uACF5\uC720</option><option value="SELECT"' + (f.share === 'SELECT' ? ' selected' : '') + '>\uC120\uD0DD\uACF5\uC720</option></select></label></div>'
      + '<section class="mn-subform"><strong>\uBC18\uBCF5</strong><div class="mn-form-grid-2"><label><span>\uBC18\uBCF5</span><select id="mnScheduleRepeat"><option value="none"' + ((f.repeat || 'none') === 'none' ? ' selected' : '') + '>\uBC18\uBCF5 \uC548 \uD568</option><option value="daily"' + (f.repeat === 'daily' ? ' selected' : '') + '>\uB9E4\uC77C</option><option value="weekly"' + (f.repeat === 'weekly' ? ' selected' : '') + '>\uB9E4\uC8FC</option><option value="monthly"' + (f.repeat === 'monthly' ? ' selected' : '') + '>\uB9E4\uC6D4</option><option value="yearly"' + (f.repeat === 'yearly' ? ' selected' : '') + '>\uB9E4\uB144</option><option value="custom"' + (f.repeat === 'custom' ? ' selected' : '') + '>\uC0AC\uC6A9\uC790 \uC9C0\uC815</option></select></label>'
      + '<label><span>\uBC18\uBCF5 \uC885\uB8CC</span><select id="mnScheduleRepeatEndType"><option value="never"' + ((f.repeatEndType || 'never') === 'never' ? ' selected' : '') + '>\uC885\uB8CC \uC5C6\uC74C</option><option value="until"' + (f.repeatEndType === 'until' ? ' selected' : '') + '>\uD2B9\uC815 \uB0A0\uC9DC\uAE4C\uC9C0</option><option value="count"' + (f.repeatEndType === 'count' ? ' selected' : '') + '>N\uD68C \uBC18\uBCF5</option></select></label></div>'
      + '<div class="mn-form-grid-2"><label><span>\uC885\uB8CC \uB0A0\uC9DC</span><input id="mnScheduleRepeatUntil" type="date" value="' + esc(f.repeatUntil || '') + '" /></label><label><span>\uBC18\uBCF5 \uD69F\uC218</span><input id="mnScheduleRepeatCount" type="number" min="1" value="' + esc(f.repeatCount || 10) + '" /></label></div>'
      + '<div class="mn-form-grid-2"><label><span>\uBC18\uBCF5 \uC8FC\uAE30</span><input id="mnScheduleRepeatInterval" type="number" min="1" value="' + esc(f.repeatInterval || 1) + '" /></label><label><span>\uB2E8\uC704</span><select id="mnScheduleRepeatFrequency"><option value="daily"' + ((f.repeatFrequency || 'daily') === 'daily' ? ' selected' : '') + '>\uC77C</option><option value="weekly"' + (f.repeatFrequency === 'weekly' ? ' selected' : '') + '>\uC8FC</option><option value="monthly"' + (f.repeatFrequency === 'monthly' ? ' selected' : '') + '>\uAC1C\uC6D4</option><option value="yearly"' + (f.repeatFrequency === 'yearly' ? ' selected' : '') + '>\uB144</option></select></label></div>'
      + '<div class="mn-weekdays">' + [['SU','\uC77C'],['MO','\uC6D4'],['TU','\uD654'],['WE','\uC218'],['TH','\uBAA9'],['FR','\uAE08'],['SA','\uD1A0']].map(function (d) { return '<label><input type="checkbox" name="mnRepeatDay" value="' + d[0] + '"' + (selectedDays[d[0]] ? ' checked' : '') + ' />' + d[1] + '</label>'; }).join('') + '</div><small>\uC6D4/\uB144 \uBC18\uBCF5\uC740 \uC5C6\uB294 \uB0A0\uC9DC\uB97C \uD574\uB2F9 \uC6D4\uC758 \uB9C8\uC9C0\uB9C9 \uB0A0\uC9DC\uB85C \uBCF4\uC815\uD569\uB2C8\uB2E4.</small></section>'
      + '<section class="mn-subform"><strong>\uC120\uD0DD\uACF5\uC720 \uCC38\uC11D\uC790</strong><input id="mnScheduleAttendeeSearch" type="search" value="' + esc(state.scheduleAttendeeQuery) + '" placeholder="\uC774\uB984, \uC0AC\uBC88, \uBD80\uC11C \uAC80\uC0C9" /><div class="mn-token-list">' + (attendeeChips || '<span>\uC120\uD0DD\uB41C \uCC38\uC11D\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</span>') + '</div><div class="mn-attendee-results">' + attendeeResults + '</div></section>'
      + '<div class="mn-form-grid-2"><label><span>\uC54C\uB9BC</span><select id="mnScheduleReminder"><option value=""' + (!f.reminder ? ' selected' : '') + '>\uC54C\uB9BC \uC5C6\uC74C</option><option value="10\uBD84 \uC804"' + (f.reminder === '10\uBD84 \uC804' ? ' selected' : '') + '>10\uBD84 \uC804</option><option value="30\uBD84 \uC804"' + (f.reminder === '30\uBD84 \uC804' ? ' selected' : '') + '>30\uBD84 \uC804</option><option value="1\uC2DC\uAC04 \uC804"' + (f.reminder === '1\uC2DC\uAC04 \uC804' ? ' selected' : '') + '>1\uC2DC\uAC04 \uC804</option><option value="1\uC77C \uC804"' + (f.reminder === '1\uC77C \uC804' ? ' selected' : '') + '>1\uC77C \uC804</option></select></label>'
      + '<label><span>\uC77C\uC815 \uC0C9\uC0C1</span><input id="mnScheduleColor" type="color" value="' + esc(f.color || '#6366f1') + '" /></label></div>'
      + '<label><span>\uC7A5\uC18C</span><input id="mnScheduleLocation" value="' + esc(f.location || '') + '" placeholder="\uC7A5\uC18C" /></label>'
      + '<label><span>\uC124\uBA85</span><textarea id="mnScheduleDesc" rows="5">' + esc(f.description || '') + '</textarea></label>'
      + '<div class="mn-form-actions"><button type="submit">\uC800\uC7A5</button>' + (f.id ? '<button type="button" class="danger" data-action="schedule-delete">\uC0AD\uC81C</button>' : '') + '</div>'
      + '</form>';
  }

  function captureScheduleForm() {
    if (!state.scheduleForm) return;
    var f = state.scheduleForm;
    f.title = (($('mnScheduleTitle') && $('mnScheduleTitle').value) || f.title || '');
    f.start = (($('mnScheduleStart') && $('mnScheduleStart').value) || f.start || '');
    f.end = (($('mnScheduleEnd') && $('mnScheduleEnd').value) || f.end || '');
    f.allDay = !!($('mnScheduleAllDay') && $('mnScheduleAllDay').checked);
    f.important = !!($('mnScheduleImportant') && $('mnScheduleImportant').checked);
    f.type = (($('mnScheduleType') && $('mnScheduleType').value) || f.type || '\uBBF8\uD305');
    f.share = (($('mnScheduleShare') && $('mnScheduleShare').value) || f.share || 'PRIVATE');
    f.repeat = (($('mnScheduleRepeat') && $('mnScheduleRepeat').value) || f.repeat || 'none');
    f.repeatEndType = (($('mnScheduleRepeatEndType') && $('mnScheduleRepeatEndType').value) || f.repeatEndType || 'never');
    f.repeatUntil = (($('mnScheduleRepeatUntil') && $('mnScheduleRepeatUntil').value) || f.repeatUntil || '');
    f.repeatCount = (($('mnScheduleRepeatCount') && $('mnScheduleRepeatCount').value) || f.repeatCount || 10);
    f.repeatInterval = (($('mnScheduleRepeatInterval') && $('mnScheduleRepeatInterval').value) || f.repeatInterval || 1);
    f.repeatFrequency = (($('mnScheduleRepeatFrequency') && $('mnScheduleRepeatFrequency').value) || f.repeatFrequency || 'daily');
    f.repeatDays = Array.prototype.slice.call(root.querySelectorAll('input[name="mnRepeatDay"]:checked')).map(function (el) { return el.value; });
    f.reminder = (($('mnScheduleReminder') && $('mnScheduleReminder').value) || '');
    f.color = (($('mnScheduleColor') && $('mnScheduleColor').value) || f.color || '#6366f1');
    f.location = (($('mnScheduleLocation') && $('mnScheduleLocation').value) || '');
    f.description = (($('mnScheduleDesc') && $('mnScheduleDesc').value) || '');
  }

  function renderMemo() {
    if (state.activeMemoId) return renderMemoDetail();
    var groups = state.memoGroups.map(function (g) {
      var id = groupId(g);
      var active = String(id) === String(state.activeMemoGroup) ? ' active' : '';
      return '<button type="button" class="mn-chip' + active + '" data-memo-group="' + esc(id) + '">' + esc(g.name || g.title || '\uADF8\uB8F9') + '</button>';
    }).join('');
    var memos = state.memos.map(function (memo) {
      var preview = memoPreview(memo.body || memo.content || memo.html || memo.memo_body || '');
      return '<article class="mn-memo" data-memo-id="' + esc(memoId(memo) || '') + '"><strong>' + esc(memo.title || '\uC81C\uBAA9 \uC5C6\uC74C') + '</strong>' + (preview ? '<p>' + esc(preview) + '</p>' : '') + '</article>';
    }).join('');
    return '<section class="mn-memos">'
      + (state.memoError ? '<div class="mn-warn">' + esc(state.memoError) + '</div>' : '')
      + '<div class="mn-action-head"><div class="mn-chips">' + (groups || '<span class="mn-muted">\uBA54\uBAA8 \uADF8\uB8F9 \uC5C6\uC74C</span>') + '</div><button type="button" data-action="new-memo">\uC0C8 \uBA54\uBAA8</button></div>'
      + (memos || '<div class="mn-state"><strong>\uC791\uC131\uB41C \uBA54\uBAA8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4</strong><span>\uC0C8 \uBA54\uBAA8\uB97C \uB20C\uB7EC \uC5C5\uBB34 \uB178\uD2B8\uB97C \uCD94\uAC00\uD558\uC138\uC694.</span></div>')
      + '</section>';
  }

  function renderMemoDetail() {
    var memo = findMemo(state.activeMemoId);
    if (state.memoForm) return renderMemoForm();
    if (!memo) return '<div class="mn-state"><strong>\uBA54\uBAA8\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4</strong></div>';
    return '<section class="mn-memo-detail">'
      + '<article><strong>' + esc(memo.title || '\uC81C\uBAA9 \uC5C6\uC74C') + '</strong><p>' + esc(memoPreview(memo.body || memo.content || memo.html || memo.memo_body || '')) + '</p></article>'
      + '<div class="mn-form-actions"><button type="button" data-action="memo-edit">\uC218\uC815</button><button type="button" class="danger" data-action="memo-delete">\uC0AD\uC81C</button></div>'
      + '</section>';
  }

  function renderMemoForm() {
    var f = state.memoForm || {};
    return '<form class="mn-edit-form" data-action="memo-submit">'
      + '<label><span>\uC81C\uBAA9</span><input id="mnMemoTitle" value="' + esc(f.title || '') + '" placeholder="\uBA54\uBAA8 \uC81C\uBAA9" /></label>'
      + '<label><span>\uB0B4\uC6A9</span><textarea id="mnMemoBody" rows="12" placeholder="\uB0B4\uC6A9\uC744 \uC785\uB825\uD558\uC138\uC694">' + esc(f.body || '') + '</textarea></label>'
      + '<div class="mn-form-actions"><button type="submit">\uC800\uC7A5</button>' + (f.id ? '<button type="button" class="danger" data-action="memo-delete">\uC0AD\uC81C</button>' : '') + '</div>'
      + '</form>';
  }

  function renderSettings() {
    if (state.settingsPanel === 'profile') {
      var me = state.me || {};
      var name = textOf(me.name || me.nickname, '\uC0AC\uC6A9\uC790');
      return '<section class="mn-settings-detail">'
        + '<article class="mn-profile-card">' + avatarHtml(me.profile_image, name, 'mn-avatar big') + '<div><strong>' + esc(name) + '</strong><span>' + esc([me.employee_id || me.emp_no, me.department].filter(Boolean).join(' · ') || '\uACC4\uC815 \uC815\uBCF4') + '</span></div></article>'
        + '<button type="button" data-action="settings-root">\uC124\uC815\uC73C\uB85C \uB3CC\uC544\uAC00\uAE30</button>'
        + '</section>';
    }
    if (state.settingsPanel) return renderSettingsDetail(state.settingsPanel);
    return '<section class="mn-settings">'
      + settingsButton('general', '\uC77C\uBC18', '\uAE30\uBCF8 \uC0AC\uC6A9 \uD658\uACBD')
      + settingsButton('notify', '\uC54C\uB9BC', '\uBA54\uC2DC\uC9C0 \uC54C\uB9BC\uACFC \uD45C\uC2DC')
      + settingsButton('display', '\uD654\uBA74', '\uD14C\uB9C8\uC640 \uD654\uBA74 \uBCF4\uAE30')
      + settingsButton('security', '\uBCF4\uC548', '\uC571 \uC7A0\uAE08\uACFC \uC138\uC158 \uBCF4\uD638')
      + settingsButton('retention', '\uC790\uB3D9\uC0AD\uC81C', '\uBA54\uC2DC\uC9C0 \uBCF4\uAD00 \uC815\uCC45')
      + settingsButton('connection', '\uC5F0\uACB0', '\uC11C\uBC84 \uC5F0\uACB0 \uC815\uBCF4')
      + settingsButton('data', '\uB370\uC774\uD130', '\uB3D9\uAE30\uD654\uC640 \uCE90\uC2DC')
      + settingsButton('about', '\uC815\uBCF4', 'Blossom Chat \uC571 \uC815\uBCF4')
      + '</section>';
  }

  function settingsButton(id, title, desc) {
    return '<button type="button" data-settings-panel="' + id + '"><strong>' + title + '</strong><span>' + desc + '</span></button>';
  }

  function renderSettingsDetail(id) {
    var map = {
      general: ['\uC77C\uBC18',
        selectControl('language', '\uC5B8\uC5B4', '\uC571 \uD45C\uC2DC \uC5B8\uC5B4', 'ko', [['ko', '\uD55C\uAD6D\uC5B4'], ['en', 'English']])
        + boolControl('autoStart', '\uC790\uB3D9 \uC2DC\uC791', '\uAE30\uAE30 \uC2DC\uC791 \uC2DC \uC571\uC744 \uC900\uBE44\uD569\uB2C8\uB2E4.', false)
        + boolControl('minimizeToTray', '\uBC31\uADF8\uB77C\uC6B4\uB4DC \uC720\uC9C0', '\uC571\uC744 \uB2EB\uC544\uB3C4 \uC138\uC158\uC744 \uC720\uC9C0\uD569\uB2C8\uB2E4.', true)],
      notify: ['\uC54C\uB9BC',
        boolControl('notifyMaster', '\uC804\uCCB4 \uC54C\uB9BC', '\uBAA8\uB4E0 \uC54C\uB9BC\uC758 \uAE30\uBCF8 \uC2A4\uC704\uCE58', true)
        + boolControl('notifyMention', '\uBA58\uC158 \uC54C\uB9BC', '@\uBA58\uC158 \uC54C\uB9BC', true)
        + boolControl('notifyDm', 'DM \uC54C\uB9BC', '\uB2E4\uC774\uB809\uD2B8 \uBA54\uC2DC\uC9C0 \uC54C\uB9BC', true)
        + boolControl('notifyChannel', '\uCC44\uB110 \uC54C\uB9BC', '\uCC44\uB110 \uBA54\uC2DC\uC9C0 \uC54C\uB9BC', true)
        + inputControl('notifyKeywords', '\uD0A4\uC6CC\uB4DC', '\uC27C\uD45C\uB85C \uAD6C\uBD84', '', 'text')],
      display: ['\uD654\uBA74',
        selectControl('theme', '\uD14C\uB9C8', '\uD654\uBA74 \uD45C\uC2DC \uBAA8\uB4DC', 'auto', [['auto', '\uC2DC\uC2A4\uD15C'], ['light', '\uB77C\uC774\uD2B8'], ['dark', '\uB2E4\uD06C']])
        + selectControl('fontSize', '\uAE00\uC790 \uD06C\uAE30', '\uCC44\uD305 \uAE00\uC790 \uD06C\uAE30', '15', [['14', '\uC791\uAC8C'], ['15', '\uBCF4\uD1B5'], ['16', '\uD06C\uAC8C']])
        + selectControl('chatDensity', '\uBAA9\uB85D \uBCF4\uAE30', '\uCC44\uD305 \uBAA9\uB85D \uBC00\uB3C4', 'cozy', [['compact', '\uCEF4\uD329\uD2B8'], ['cozy', '\uBCF4\uD1B5'], ['comfortable', '\uB113\uAC8C']])
        + boolControl('uiAnimations', '\uC560\uB2C8\uBA54\uC774\uC158', '\uD654\uBA74 \uC804\uD658 \uD6A8\uACFC', true)],
      security: ['\uBCF4\uC548',
        boolControl('appPinEnabled', '\uC571 PIN \uC7A0\uAE08', '\uC571 \uC7A0\uAE08 \uC0AC\uC6A9', false)
        + inputControl('autoLockMin', '\uC790\uB3D9 \uC7A0\uAE08(\uBD84)', '\uBE44\uD65C\uC131 \uD6C4 \uC7A0\uAE08', '30', 'number')
        + boolControl('fileDownloadRestrict', '\uD30C\uC77C \uB2E4\uC6B4\uB85C\uB4DC \uC81C\uD55C', '\uD30C\uC77C \uBCF4\uC548 \uC815\uCC45', false)
        + boolControl('copyRestrict', '\uBCF5\uC0AC \uC81C\uD55C', '\uBA54\uC2DC\uC9C0 \uBCF5\uC0AC \uC81C\uD55C', false)],
      retention: ['\uC790\uB3D9\uC0AD\uC81C',
        boolControl('mobileRetentionEnabled', '\uC790\uB3D9\uC0AD\uC81C \uC0AC\uC6A9', '\uBAA8\uBC14\uC77C\uC5D0\uC11C \uC790\uB3D9\uC0AD\uC81C \uC815\uCC45 \uD45C\uC2DC', false)
        + selectControl('mobileRetentionDays', '\uBCF4\uAD00 \uAE30\uAC04', '\uBA54\uC2DC\uC9C0 \uBCF4\uAD00 \uAE30\uAC04', '30', [['7', '7\uC77C'], ['30', '30\uC77C'], ['90', '90\uC77C'], ['365', '1\uB144']])],
      connection: ['\uC5F0\uACB0',
        inputControl('serverUrl', '\uC11C\uBC84 \uC8FC\uC18C', 'API \uC5F0\uACB0 \uC8FC\uC18C', (window.Api && window.Api.serverUrl) || '', 'url')
        + selectControl('proxyMode', '\uD504\uB85D\uC2DC', '\uD504\uB85D\uC2DC \uC0AC\uC6A9 \uBC29\uC2DD', 'system', [['system', '\uC2DC\uC2A4\uD15C'], ['none', '\uC0AC\uC6A9 \uC548 \uD568'], ['manual', '\uC218\uB3D9']])
        + inputControl('proxyUrl', '\uD504\uB85D\uC2DC URL', '\uC218\uB3D9 \uD504\uB85D\uC2DC \uC8FC\uC18C', '', 'url')],
      data: ['\uB370\uC774\uD130',
        boolControl('auditLogLocal', '\uB85C\uCEEC \uAC10\uC0AC \uB85C\uADF8', '\uC124\uC815 \uBCC0\uACBD \uB85C\uADF8 \uC800\uC7A5', false)
        + boolControl('settingsHistory', '\uC124\uC815 \uC774\uB825', '\uC124\uC815 \uBCC0\uACBD \uC774\uB825 \uC800\uC7A5', true)
        + '<button type="button" class="mn-secondary-wide" data-action="mobile-clear-cache">\uB85C\uCEEC \uCE90\uC2DC \uC815\uB9AC</button>'],
      about: ['\uC815\uBCF4',
        '<article class="mn-setting-info"><strong>Blossom Chat Mobile</strong><span>\uC5C5\uBB34\uC6A9 \uBAA8\uBC14\uC77C \uBA54\uC2E0\uC800</span></article>'
        + '<article class="mn-setting-info"><strong>\uC5F0\uACB0</strong><span>' + esc((window.Api && window.Api.serverUrl) || '\uC124\uC815\uB418\uC9C0 \uC54A\uC74C') + '</span></article>']
    };
    var item = map[id] || map.general;
    return '<section class="mn-settings-detail"><div class="mn-settings-head"><strong>' + esc(item[0]) + '</strong><button type="button" data-action="settings-root">\uBaa9\uB85D</button></div>' + item[1] + '</section>';
  }

  async function switchTab(tab) {
    state.tab = tab;
    state.view = 'list';
    state.error = '';
    state.activeRoom = null;
    state.settingsPanel = '';
    render();
    await loadTab(tab);
  }

  function proxyClick(id) {
    var target = $(id);
    if (target) {
      target.click();
      return true;
    }
    return false;
  }

  async function handleAction(name, source) {
    if (name === 'back') {
      if (state.tab === 'people' && state.activePersonId) state.activePersonId = null;
      else if (state.tab === 'memo' && state.activeMemoId) { state.activeMemoId = null; state.memoForm = null; }
      else if (state.tab === 'calendar' && state.scheduleForm) { state.scheduleForm = null; state.scheduleAttendees = []; state.scheduleAttendeeQuery = ''; }
      else if (state.tab === 'settings' && state.settingsPanel) state.settingsPanel = '';
      else {
        state.view = 'list';
        state.activeRoom = null;
      }
      render();
    } else if (name === 'refresh') {
      await loadTab(state.tab);
    } else if (name === 'account') {
      $('mnSheet').hidden = false;
    } else if (name === 'close-sheet') {
      $('mnSheet').hidden = true;
    } else if (name === 'new-memo') {
      try { await createMemo(); showToast('\uBA54\uBAA8\uB97C \uB9CC\uB4E4\uC5C8\uC2B5\uB2C8\uB2E4.'); } catch (err) { showToast((err && err.message) || '\uBA54\uBAA8\uB97C \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.'); }
    } else if (name === 'new-schedule') {
      if (!state.people.length) {
        try { state.people = arr(await window.Api.fetchCoworkers({ q: '', limit: 1000 })); } catch (_) {}
      }
      state.scheduleAttendees = [];
      state.scheduleAttendeeQuery = '';
      state.scheduleForm = {
        id: '',
        title: '',
        start: toInputDateTime(null, 9),
        end: toInputDateTime(null, 10),
        allDay: false,
        share: 'PRIVATE',
        type: '\uBBF8\uD305',
        repeat: 'none',
        repeatEndType: 'never',
        repeatCount: 10,
        repeatInterval: 1,
        repeatFrequency: 'daily',
        repeatDays: [],
        reminder: '',
        color: '#6366f1',
        important: false
      };
      render();
    } else if (name === 'schedule-delete') {
      try { await deleteScheduleForm(); } catch (errS) { showToast((errS && errS.message) || '\uC77C\uC815\uC744 \uC0AD\uC81C\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.'); }
    } else if (name === 'schedule-attendee-remove') {
      captureScheduleForm();
      var indexEl = source && source.closest('[data-attendee-index]');
      var index = parseInt(indexEl && indexEl.dataset.attendeeIndex, 10);
      if (!isNaN(index)) state.scheduleAttendees.splice(index, 1);
      render();
    } else if (name === 'memo-edit') {
      var memo = findMemo(state.activeMemoId);
      if (memo) {
        state.memoForm = { id: memoId(memo), title: memo.title || '', body: memo.body || memo.content || memo.html || memo.memo_body || '' };
        render();
      }
    } else if (name === 'memo-delete') {
      try { await deleteMemoForm(); } catch (errM) { showToast((errM && errM.message) || '\uBA54\uBAA8\uB97C \uC0AD\uC81C\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.'); }
    } else if (name === 'person-chat') {
      try { await startDmWithPerson(findPerson(state.activePersonId)); } catch (err3) { showToast((err3 && err3.message) || '\uCC44\uD305\uC744 \uC2DC\uC791\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.'); }
    } else if (name === 'settings-root') {
      state.settingsPanel = '';
      render();
    } else if (name === 'settings-profile') {
      $('mnSheet').hidden = true;
      state.tab = 'settings';
      state.settingsPanel = 'profile';
      render();
    } else if (name === 'settings-lock') {
      $('mnSheet').hidden = true;
      if (!proxyClick('btnLock')) showToast('\uC7A0\uAE08 \uAE30\uB2A5\uC744 \uD638\uCD9C\uD588\uC2B5\uB2C8\uB2E4.');
      else showToast('\uC571 \uC7A0\uAE08\uC744 \uC694\uCCAD\uD588\uC2B5\uB2C8\uB2E4.');
    } else if (name === 'settings-quit') {
      $('mnSheet').hidden = true;
      if (!proxyClick('btnQuit')) showToast('\uC571 \uC885\uB8CC\uB97C \uC694\uCCAD\uD588\uC2B5\uB2C8\uB2E4.');
    } else if (name === 'mobile-clear-cache') {
      try {
        Object.keys(window.localStorage || {}).forEach(function (k) {
          if (/^(bls_room_cache_|blossom_idea_state|POLL_|chat:lastColor)/.test(k)) window.localStorage.removeItem(k);
        });
      } catch (_) {}
      showToast('\uB85C\uCEEC \uCE90\uC2DC\uB97C \uC815\uB9AC\uD588\uC2B5\uB2C8\uB2E4.');
    }
  }

  root.addEventListener('click', async function (e) {
    var tab = e.target.closest('[data-tab]');
    if (tab) {
      await switchTab(tab.dataset.tab);
      return;
    }
    var room = e.target.closest('[data-room-id]');
    if (room) {
      try { await openRoom(room.dataset.roomId); } catch (err) { setError((err && err.message) || '\uBA54\uC2DC\uC9C0\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.'); }
      return;
    }
    var dept = e.target.closest('[data-dept]');
    if (dept) {
      state.peopleDepartment = dept.dataset.dept || '';
      render();
      return;
    }
    var person = e.target.closest('[data-person-id]');
    if (person) {
      state.activePersonId = person.dataset.personId;
      render();
      return;
    }
    var memoCard = e.target.closest('[data-memo-id]');
    if (memoCard) {
      state.activeMemoId = memoCard.dataset.memoId;
      render();
      return;
    }
    var sched = e.target.closest('[data-schedule-id]');
    if (sched) {
      var s = findSchedule(sched.dataset.scheduleId);
      if (s) {
        if (!state.people.length) {
          try { state.people = arr(await window.Api.fetchCoworkers({ q: '', limit: 1000 })); } catch (_) {}
        }
        state.scheduleForm = buildScheduleFormFromEvent(s);
        state.scheduleAttendees = scheduleAttendeesFromEvent(s);
        state.scheduleAttendeeQuery = '';
        render();
      }
      return;
    }
    var attendee = e.target.closest('[data-attendee-user]');
    if (attendee) {
      captureScheduleForm();
      var u = state.people.filter(function (p) { return String(serverUserId(p)) === String(attendee.dataset.attendeeUser); })[0];
      if (u) state.scheduleAttendees = normalizeScheduleAttendees(state.scheduleAttendees.concat([{ userId: serverUserId(u), label: attendeeLabel(u) }]));
      state.scheduleAttendeeQuery = '';
      render();
      return;
    }
    var group = e.target.closest('[data-memo-group]');
    if (group) {
      state.activeMemoGroup = group.dataset.memoGroup;
      await loadMemo();
      return;
    }
    var settingsPanel = e.target.closest('[data-settings-panel]');
    if (settingsPanel) {
      state.settingsPanel = settingsPanel.dataset.settingsPanel;
      render();
      return;
    }
    var action = e.target.closest('[data-action]');
    if (action) {
      await handleAction(action.dataset.action, action);
    }
  });

  root.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'mnPeopleSearch') {
      state.peopleQuery = e.target.value || '';
      render();
      var input = $('mnPeopleSearch');
      if (input) {
        input.focus();
        try { input.setSelectionRange(input.value.length, input.value.length); } catch (_) {}
      }
    } else if (e.target && e.target.id === 'mnScheduleAttendeeSearch') {
      captureScheduleForm();
      state.scheduleAttendeeQuery = e.target.value || '';
      render();
      var attendeeInput = $('mnScheduleAttendeeSearch');
      if (attendeeInput) {
        attendeeInput.focus();
        try { attendeeInput.setSelectionRange(attendeeInput.value.length, attendeeInput.value.length); } catch (_) {}
      }
    }
  });

  root.addEventListener('change', async function (e) {
    var el = e.target && e.target.closest('[data-setting-key]');
    if (!el) return;
    var key = el.dataset.settingKey;
    var value = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'number') value = String(Math.max(1, parseInt(value || '1', 10)));
    await writeSetting(key, value);
    if (key === 'theme') document.documentElement.setAttribute('data-theme', value || 'auto');
    if (key === 'fontSize') document.documentElement.style.setProperty('--font-size-base', (value || 15) + 'px');
    if (key === 'serverUrl' && window.Api) window.Api.setServer(value || '');
    showToast('\uC124\uC815\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.');
  });

  root.addEventListener('submit', async function (e) {
    e.preventDefault();
    var form = e.target;
    var action = form && form.dataset && form.dataset.action;
    try {
      if (action === 'send') await sendMessage();
      else if (action === 'memo-submit') await saveMemoForm();
      else if (action === 'schedule-submit') await saveScheduleForm();
    } catch (err) {
      if (action === 'send') {
        showToast((err && err.message) || '\uBA54\uC2DC\uC9C0\uB97C \uBCF4\uB0B4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.');
        return;
      }
      setError((err && err.message) || '\uC694\uCCAD\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.');
    }
  });
})();
