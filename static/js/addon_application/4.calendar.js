// FullCalendar initialization for Blossom task calendar
// Features: ko locale, add by click/drag, edit/delete on click, drag-n-drop, localStorage persistence

(function () {
  const SHARE_SUGGEST_LIMIT = 12;
  const SHARE_SEARCH_MIN_CHARS = 1;
  const SHARE_SEARCH_DEBOUNCE_MS = 180;
  const SHARE_SCOPE_BY_MODE = { all: 'ALL', basic: 'PRIVATE', department: 'DEPARTMENT', custom: 'SELECT' };
  const SHARE_SUGGEST_USER_BLOCKLIST = ['ADMIN'];
  const MODE_BY_SCOPE = { ALL: 'all', PRIVATE: 'basic', DEPARTMENT: 'department', SELECT: 'custom' };
  const DEFAULT_FETCH_LIMIT = 500;
  const SCHEDULE_COLOR_PALETTE = [
    '#6366f1', '#60a5fa', '#3b82f6', '#0ea5e9', '#06b6d4',
    '#14b8a6', '#34d399', '#10b981', '#a3e635', '#f59e0b',
    '#f97316', '#ef4444', '#f472b6', '#f43f5e', '#ec4899',
    '#d946ef', '#c4b5fd', '#a855f7', '#64748b', '#111827',
  ];
  const CAL_REPEAT_WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const CAL_REPEAT_TYPES = ['none', 'daily', 'weekly', 'monthly', 'yearly', 'custom'];
  const shareSearchCache = new Map();
  const shareUserDirectory = new Map();
  const shareDeptDirectory = new Map();
  let shareSearchDebounceTimer = null;
  let shareSearchAbortController = null;
  let orgDeptLoadPromise = null;
  let shareSelectionSeq = 0;

  function shareModeToScope(mode) {
    if (!mode) return 'ALL';
    return SHARE_SCOPE_BY_MODE[mode] || 'ALL';
  }

  function shareScopeToMode(scope) {
    if (!scope) return 'all';
    const token = String(scope).toUpperCase();
    return MODE_BY_SCOPE[token] || 'all';
  }

  let calendarInstance = null;
  let calendarContainerEl = null;
  let isSyncing = false;
  let calendarConfigCache = null;
  let modalButtons = { save: null, delete: null };

  function getEventPermission(event, key) {
    const props = event && event.extendedProps ? event.extendedProps : null;
    if (!props || !(key in props)) return null;
    return props[key] === true;
  }

  function isCurrentUserOwnerOfEvent(event) {
    const props = event && event.extendedProps ? event.extendedProps : null;
    const currentId = getCurrentProfileId();
    const ownerId = Number(props && props.ownerUserId);
    return !!(currentId && ownerId && currentId === ownerId);
  }

  function canCurrentUserEditEvent(event) {
    const permission = getEventPermission(event, 'viewerCanEdit');
    if (permission !== null) return permission;
    return isCurrentUserOwnerOfEvent(event);
  }

  function canCurrentUserDeleteEvent(event) {
    const permission = getEventPermission(event, 'viewerCanDelete');
    if (permission !== null) return permission;
    return isCurrentUserOwnerOfEvent(event);
  }

  function resolveCalendarConfig() {
    if (calendarConfigCache) {
      return calendarConfigCache;
    }
    const el = document.getElementById('calendar-config');
    const schedulesBase = el ? (el.getAttribute('data-schedules-base') || '/api/calendar/schedules') : '/api/calendar/schedules';
    const apiRootAttr = el ? el.getAttribute('data-api-root') : '';
    const profileIdRaw = el ? el.getAttribute('data-profile-id') : null;
    const empNo = el ? el.getAttribute('data-emp-no') : '';
    const userName = el ? el.getAttribute('data-user-name') : '';
    const userRole = el ? el.getAttribute('data-user-role') : '';
    const profileImage = el ? el.getAttribute('data-profile-image') : '';
    const userDepartment = el ? el.getAttribute('data-user-department') : '';
    calendarConfigCache = {
      schedulesBase: schedulesBase || '/api/calendar/schedules',
      apiRoot: null,
      currentUser: {
        empNo: empNo || '',
        profileId: profileIdRaw ? parseInt(profileIdRaw, 10) : null,
        name: userName || '',
        role: userRole || '',
        profileImage: profileImage || '',
        department: userDepartment || '',
      },
    };
    calendarConfigCache.apiRoot = normalizeApiRoot(apiRootAttr, calendarConfigCache.schedulesBase);
    calendarDebugLog('calendarConfig', {
      schedulesBase: calendarConfigCache.schedulesBase,
      apiRoot: calendarConfigCache.apiRoot,
      currentUser: calendarConfigCache.currentUser,
    });
    if (el && typeof el.remove === 'function') {
      el.remove();
    } else if (el && el.parentElement) {
      el.parentElement.removeChild(el);
    }
    return calendarConfigCache;
  }

  function getSchedulesBase() {
    const cfg = resolveCalendarConfig();
    return (cfg && cfg.schedulesBase) || '/api/calendar/schedules';
  }

  function getCurrentProfileId() {
    const cfg = resolveCalendarConfig();
    const raw = cfg && cfg.currentUser ? cfg.currentUser.profileId : null;
    return Number.isFinite(raw) ? raw : null;
  }

  function getCurrentUserSnapshot() {
    const cfg = resolveCalendarConfig();
    const u = (cfg && cfg.currentUser) ? cfg.currentUser : {};
    return {
      emp_no: u.empNo || '',
      name: u.name || '',
      department: u.department || '',
      profile_image: u.profileImage || '',
      id: Number.isFinite(u.profileId) ? u.profileId : null,
    };
  }

  function normalizeApiRoot(attrValue, schedulesBase) {
    const attr = (attrValue || '').trim();
    if (attr) {
      return attr;
    }
    try {
      const resolved = new URL(schedulesBase || '/api/calendar/schedules', window.location.origin);
      let pathname = resolved.pathname || '/api';
      if (pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }
      const suffix = '/calendar/schedules';
      if (pathname.toLowerCase().endsWith(suffix)) {
        pathname = pathname.slice(0, -suffix.length) || '/api';
      }
      return pathname || '/api';
    } catch (_) {
      return '/api';
    }
  }

  function isLocalDevHost() {
    try {
      const host = (window.location && window.location.hostname) ? String(window.location.hostname) : '';
      return host === '127.0.0.1' || host === 'localhost';
    } catch (_) {
      return false;
    }
  }

  function calendarDebugLog(...args) {
    if (!isLocalDevHost()) return;
    try {
      console.info('[calendar]', ...args);
    } catch (_) {}
  }

  function getApiRoot() {
    const cfg = resolveCalendarConfig();
    return (cfg && cfg.apiRoot) || '/api';
  }

  function resolveApiUrl(path) {
    if (!path) {
      return getApiRoot();
    }
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const root = getApiRoot() || '';
    if (/^https?:\/\//i.test(root)) {
      const trimmed = root.endsWith('/') ? root.slice(0, -1) : root;
      return `${trimmed}${normalizedPath}`;
    }
    const trimmedRoot = root.endsWith('/') && root !== '/' ? root.slice(0, -1) : root;
    if (!trimmedRoot || trimmedRoot === '/') {
      return normalizedPath;
    }
    return `${trimmedRoot}${normalizedPath}`;
  }

  function buildUrlWithParams(base, params) {
    if (!params || !Object.keys(params).length) {
      return base;
    }
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      usp.append(key, value);
    });
    const query = usp.toString();
    return query ? `${base}?${query}` : base;
  }

  function escapeHtml(value) {
    if (value === undefined || value === null) return '';
    return String(value).replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return char;
      }
    });
  }

  async function apiRequest(method, url, payload, extraOptions) {
    const options = {
      method,
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin',
    };
    if (extraOptions && typeof extraOptions === 'object') {
      if (extraOptions.headers) {
        options.headers = { ...options.headers, ...extraOptions.headers };
      }
      Object.entries(extraOptions).forEach(([key, value]) => {
        if (key === 'headers') return;
        options[key] = value;
      });
    }
    if (payload && method !== 'GET') {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(payload);
    }
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type') || '';
    const expectsJson = contentType.includes('application/json');
    const data = expectsJson ? await response.json() : null;
    if (!response.ok || (data && data.success === false)) {
      const message = (data && data.message) || `요청에 실패했습니다. (HTTP ${response.status})`;
      throw new Error(message);
    }
    return data || { success: true };
  }

  function apiGetSchedules(params) {
    return apiRequest('GET', buildUrlWithParams(getSchedulesBase(), params), null);
  }

  function apiCreateSchedule(payload) {
    return apiRequest('POST', getSchedulesBase(), payload);
  }

  function apiUpdateSchedule(id, payload) {
    return apiRequest('PUT', `${getSchedulesBase()}/${id}`, payload);
  }

  function apiDeleteSchedule(id) {
    return apiRequest('DELETE', `${getSchedulesBase()}/${id}`);
  }

  // ── 삭제 확인 모달 ─────────────────────────────────────
  let _calConfirmResolve = null;
  function showCalConfirm(message, title) {
    return new Promise((resolve) => {
      _calConfirmResolve = resolve;
      const modal = document.getElementById('cal-confirm-modal');
      const titleEl = document.getElementById('cal-confirm-title');
      const bodyEl = document.getElementById('cal-confirm-body');
      if (titleEl) titleEl.textContent = title || '일정 삭제';
      if (bodyEl) bodyEl.textContent = message || '';
      if (modal) {
        modal.classList.add('show');
        modal.style.display = '';
        modal.removeAttribute('hidden');
        modal.setAttribute('aria-hidden', 'false');
      }
    });
  }
  function _resolveCalConfirm(val) {
    const modal = document.getElementById('cal-confirm-modal');
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
    if (_calConfirmResolve) { _calConfirmResolve(val); _calConfirmResolve = null; }
  }
  function bindCalendarCalConfirmUi() {
    if (window.__blossomCalendarCalConfirmBound) return;
    window.__blossomCalendarCalConfirmBound = true;
    document.getElementById('cal-confirm-ok')?.addEventListener('click', () => _resolveCalConfirm(true));
    document.getElementById('cal-confirm-cancel')?.addEventListener('click', () => _resolveCalConfirm(false));
    document.getElementById('cal-confirm-close')?.addEventListener('click', () => _resolveCalConfirm(false));
    const modal = document.getElementById('cal-confirm-modal');
    if (modal) {
      modal.addEventListener('click', (e) => { if (e.target === modal) _resolveCalConfirm(false); });
    }
    document.addEventListener('keydown', (e) => {
      const m = document.getElementById('cal-confirm-modal');
      if (e.key === 'Escape' && m && m.classList.contains('show')) {
        _resolveCalConfirm(false);
      }
    });
  }

  function apiGetSchedule(id) {
    const url = `${getSchedulesBase()}/${id}`;
    return apiRequest('GET', url, null).then((data) => {
      try {
        calendarDebugLog('apiGetSchedule', {
          id,
          url,
          ownerProfileImage: data?.item?.owner?.profile_image,
          ownerId: data?.item?.owner?.id,
        });
      } catch (_) {}
      return data;
    });
  }

  async function apiUploadScheduleAttachments(scheduleId, fileList) {
    const id = scheduleId ? String(scheduleId) : '';
    const files = Array.from(fileList || []).filter(Boolean);
    if (!id || !files.length) {
      return { success: true, items: [] };
    }
    const url = `${getSchedulesBase()}/${id}/attachments`;
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin',
      body: formData,
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok || (data && data.success === false)) {
      const message = (data && data.message) || `업로드에 실패했습니다. (HTTP ${response.status})`;
      throw new Error(message);
    }
    return data || { success: true, items: [] };
  }

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;
    bindCalendarCalConfirmUi();
    resolveCalendarConfig();
    calendarContainerEl = calendarEl.closest('.calendar-container') || calendarEl.parentElement || calendarEl;
    // New: sticky icons as draggable external events
    const iconsEl = document.getElementById('external-icons');
    if (iconsEl && window.FullCalendar && FullCalendar.Draggable) {
      new FullCalendar.Draggable(iconsEl, {
        itemSelector: '.sticky-icon',
        eventData: function (el) {
          const color = el.getAttribute('data-color') || '#8b5cf6';
          const cat = el.getAttribute('data-category') || 'note';
          return { title: '', backgroundColor: color, borderColor: color, extendedProps: { category: cat } };
        }
      });
    }

  // Modal elements (backup-style)
  const modal = document.getElementById('schedule-add-modal');
  const modalTitle = document.getElementById('schedule-modal-title');
  const modalSubtitle = document.getElementById('schedule-modal-subtitle');
  const modalClose = document.getElementById('schedule-modal-close');
  const ownerWrap = document.getElementById('schedule-owner-wrap');
  const ownerAvatar = document.getElementById('schedule-owner-avatar');
  const ownerName = document.getElementById('schedule-owner-name');
  const ownerMeta = document.getElementById('schedule-owner-meta');
  ensureOwnerAvatarFallbackBound();
  const inputName = document.getElementById('sch-name');
  const inputStartTime = document.getElementById('sch-start-time');
  const inputEndTime = document.getElementById('sch-end-time');
  const selectType = document.getElementById('sch-type');
  const shareCustomWrap = document.getElementById('share-custom');
  const shareSearch = document.getElementById('share-search');
  const shareSuggest = document.getElementById('share-suggest');
  const shareChips = document.getElementById('share-chips');
  const typeDropdownTrigger = document.getElementById('sch-type-trigger');
  const typeDropdownPanel = document.getElementById('sch-type-panel');
  const typeDropdownSearch = document.getElementById('sch-type-search');
  const typeDropdownOptions = Array.from(document.querySelectorAll('#sch-type-options .dropdown-option'));
  const typeSelectedLabel = document.getElementById('sch-type-selected');
  const shareModeHiddenInput = document.getElementById('share-mode-value');
  const shareModeChips = Array.from(document.querySelectorAll('.share-mode-chip'));
  const importantBtn = document.getElementById('sch-important-btn');
  const reminderSelect = document.getElementById('sch-reminder');
  const stickerSelect = document.getElementById('sch-sticker');
  const colorInput = document.getElementById('sch-color');
  const colorButton = document.getElementById('sch-color-btn');
  const colorPanel = document.getElementById('sch-color-panel');
  const colorPalette = document.getElementById('sch-color-palette');
  const repeatSelect = document.getElementById('sch-repeat');
  const repeatEndTypeSelect = document.getElementById('sch-repeat-end-type');
  const repeatUntilInput = document.getElementById('sch-repeat-until');
  const repeatCountInput = document.getElementById('sch-repeat-count');
  const repeatWeekdaysWrap = document.getElementById('sch-repeat-weekdays');
  const repeatMonthPolicy = document.getElementById('sch-repeat-month-policy');
  const repeatModal = document.getElementById('schedule-repeat-modal');
  const repeatModalOk = document.getElementById('schedule-repeat-modal-ok');
  const repeatModalCancel = document.getElementById('schedule-repeat-modal-cancel');
  const repeatModalClose = document.getElementById('schedule-repeat-modal-close');
  const repeatOpenBtn = document.getElementById('sch-repeat-open-btn');
  const repeatSummaryEl = document.getElementById('sch-repeat-summary');
  let repeatModalSnapshot = null;
  const inputLocation = document.getElementById('sch-location');
  const btnSave = document.getElementById('sch-save-btn');
  const btnCancel = document.getElementById('sch-cancel-btn');
  const btnDelete = document.getElementById('sch-delete-btn');
  const timeError = document.getElementById('time-error');
  const typeDot = document.getElementById('type-dot');
  const btnAllDay = document.getElementById('sch-allday-btn');
  const inputDesc = document.getElementById('sch-description');
  const inputAttachments = document.getElementById('sch-attachments');
  const attachmentsList = document.getElementById('sch-attachment-list');
  const attachmentDrop = document.getElementById('sch-attachment-drop');
  const attachmentClearBtn = document.getElementById('sch-attachment-clear');
  const formEl = document.getElementById('schedule-form');
  const viewWrap = document.getElementById('schedule-view');
  const viewName = document.getElementById('view-sch-name');
  const viewTime = document.getElementById('view-sch-time');
  const viewLocation = document.getElementById('view-sch-location');
  const viewType = document.getElementById('view-sch-type');
  const viewShare = document.getElementById('view-sch-share');
  const viewRepeat = document.getElementById('view-sch-repeat');
  const viewDesc = document.getElementById('view-sch-description');
  const viewAttachmentsWrap = document.getElementById('view-sch-attachments-wrap');
  const viewAttachments = document.getElementById('view-sch-attachments');
  const viewAttachmentsEmpty = document.getElementById('view-sch-attachments-empty');
  const SHARE_MODE_LABELS = { all: '전체공유', basic: '기본', department: '부서공유', custom: '선택공유' };
  const DEFAULT_SCHEDULE_COLOR = SCHEDULE_COLOR_PALETTE[0];
  const dropdownRegistry = {};
  let activeDropdownKey = null;
  let attachmentObjectUrls = [];
  modalButtons.save = btnSave;
  modalButtons.delete = btnDelete;
  const DEFAULT_START_TIME = '10:00';
  const DEFAULT_END_TIME = '11:00';
  const HOUR_IN_MS = 60 * 60 * 1000;
  let modalCtx = {
    mode: 'add',
    startStr: null,
    endStr: null,
    allDay: true,
    eventId: null,
    shares: [],
    shareUsersPayload: [],
    shareDepartmentsPayload: [],
    sourceEvent: null,
    lastShareMode: 'basic',
    openerEl: null,
    openerActiveEl: null,
    existingAttachments: [],
    attendees: [],
    important: false,
    canDelete: false,
  };
  // Preserve last explicit time range when toggling 종일 on/off
  let lastTimeRange = { start: '', end: '' };
  if (shareSearch) {
    shareSearch.disabled = true;
    shareSearch.setAttribute('autocomplete', 'off');
    shareSearch.setAttribute('placeholder', '팀 또는 구성원을 검색하세요');
  }
    function normalizePaletteColor(value) {
      const color = String(value || '').trim();
      return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_SCHEDULE_COLOR;
    }

    function setColorValue(value) {
      const color = normalizePaletteColor(value);
      if (colorInput) {
        colorInput.value = color;
      }
      if (typeDot) {
        typeDot.style.background = color;
      }
      if (colorButton) {
        colorButton.setAttribute('aria-label', `일정 색상 선택: ${color}`);
      }
      if (colorPalette) {
        colorPalette.querySelectorAll('.schedule-color-swatch').forEach((button) => {
          const selected = String(button.getAttribute('data-color') || '').toLowerCase() === color;
          button.classList.toggle('is-selected', selected);
          button.setAttribute('aria-checked', selected ? 'true' : 'false');
        });
      }
    }

    function closeColorPanel() {
      if (!colorPanel) return;
      colorPanel.hidden = true;
      if (colorButton) {
        colorButton.setAttribute('aria-expanded', 'false');
      }
    }

    function openColorPanel() {
      if (!colorPanel || modalCtx.mode === 'view') return;
      colorPanel.hidden = false;
      if (colorButton) {
        colorButton.setAttribute('aria-expanded', 'true');
      }
    }

    function toggleColorPanel() {
      if (!colorPanel) return;
      if (colorPanel.hidden) {
        openColorPanel();
      } else {
        closeColorPanel();
      }
    }

    function renderColorPalette() {
      if (!colorPalette || colorPalette.dataset.rendered === '1') return;
      colorPalette.innerHTML = SCHEDULE_COLOR_PALETTE.map((color) => `
        <button type="button" class="schedule-color-swatch" role="radio" aria-label="${escapeHtml(color)}" aria-checked="false" data-color="${escapeHtml(color)}" style="background:${escapeHtml(color)}"></button>
      `).join('');
      colorPalette.dataset.rendered = '1';
      colorPalette.addEventListener('click', (event) => {
        if (modalCtx.mode === 'view') return;
        const button = event.target.closest('.schedule-color-swatch[data-color]');
        if (!button) return;
        setColorValue(button.getAttribute('data-color') || DEFAULT_SCHEDULE_COLOR);
        closeColorPanel();
      });
      setColorValue(colorInput?.value || DEFAULT_SCHEDULE_COLOR);
    }

    function normalizeRepeatType(raw) {
      const token = String(raw || 'none').toLowerCase();
      return CAL_REPEAT_TYPES.includes(token) ? token : 'none';
    }

    function normalizeRepeatRule(raw) {
      if (!raw) return {};
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
          return {};
        }
      }
      return raw && typeof raw === 'object' ? { ...raw } : {};
    }

    function repeatRuleEndType(rule) {
      const token = String((rule && rule.endType) || (rule && rule.end_type) || 'never').toLowerCase();
      return ['never', 'until', 'count'].includes(token) ? token : 'never';
    }

    function repeatRuleInterval(rule) {
      const value = parseInt(String((rule && rule.interval) || '1'), 10);
      return Number.isFinite(value) && value > 0 ? value : 1;
    }

    function repeatRuleCount(rule) {
      const value = parseInt(String((rule && rule.count) || '10'), 10);
      return Number.isFinite(value) && value > 0 ? value : 10;
    }

    function repeatRuleFrequency(repeatType, rule) {
      if (repeatType !== 'custom') return repeatType;
      const token = String((rule && (rule.frequency || rule.freq || rule.unit)) || 'daily').toLowerCase();
      return ['daily', 'weekly', 'monthly', 'yearly'].includes(token) ? token : 'daily';
    }

    /** API의 repeat_type custom → 폼의 매일/매주/매월/매년 프리셋으로 표시 */
    function repeatUiPresetFromStored(storedType, rule) {
      const t = normalizeRepeatType(storedType);
      if (t !== 'custom') return t;
      const freq = repeatRuleFrequency('custom', rule);
      return ['daily', 'weekly', 'monthly', 'yearly'].includes(freq) ? freq : 'weekly';
    }

    function repeatRuleUntil(rule) {
      const raw = String((rule && (rule.untilDate || rule.until_date || rule.until)) || '').trim();
      const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
      return match ? match[0] : '';
    }

    function repeatWeekdayForInput(value) {
      const parsed = parseDateTimeInput(value);
      const date = parsed || new Date();
      return CAL_REPEAT_WEEKDAYS[date.getDay()];
    }

    function selectedRepeatWeekdays() {
      if (!repeatWeekdaysWrap) return [];
      return Array.from(repeatWeekdaysWrap.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
    }

    function setRepeatWeekdays(days) {
      const selected = new Set((Array.isArray(days) ? days : []).map((day) => String(day || '').toUpperCase()));
      if (!repeatWeekdaysWrap) return;
      repeatWeekdaysWrap.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.checked = selected.has(input.value);
      });
    }

    function effectiveRepeatFrequencyFromForm() {
      return normalizeRepeatType(repeatSelect?.value || 'none');
    }

    function syncRepeatUi(options) {
      const opts = options || {};
      const repeatType = normalizeRepeatType(repeatSelect?.value || 'none');
      const endType = String(repeatEndTypeSelect?.value || 'never').toLowerCase();
      const frequency = effectiveRepeatFrequencyFromForm();
      const enabled = repeatType !== 'none';
      if (repeatEndTypeSelect) repeatEndTypeSelect.hidden = !enabled;
      if (repeatUntilInput) {
        const hideUntil = !enabled || endType !== 'until';
        repeatUntilInput.hidden = hideUntil;
        if (hideUntil) {
          try { repeatUntilInput._flatpickr?.close(); } catch (_) {}
        }
      }
      if (repeatCountInput) repeatCountInput.hidden = !enabled || endType !== 'count';
      if (repeatWeekdaysWrap) repeatWeekdaysWrap.hidden = !enabled || frequency !== 'weekly';
      if (repeatMonthPolicy) repeatMonthPolicy.hidden = !enabled || (frequency !== 'monthly' && frequency !== 'yearly');
      if (enabled && frequency === 'weekly' && !opts.keepWeekdays && !selectedRepeatWeekdays().length) {
        setRepeatWeekdays([repeatWeekdayForInput(inputStartTime?.value || '')]);
      }
      syncRepeatUntilFlatpickr();
    }

    function setRepeatFields(event) {
      const props = event && event.extendedProps ? event.extendedProps : {};
      const storedType = normalizeRepeatType(props.repeatType || props.repeat_type || 'none');
      const rule = normalizeRepeatRule(props.repeatRule || props.repeat_rule || {});
      const uiPreset = repeatUiPresetFromStored(storedType, rule);
      if (repeatSelect) repeatSelect.value = uiPreset;
      if (repeatEndTypeSelect) repeatEndTypeSelect.value = repeatRuleEndType(rule);
      if (repeatUntilInput) repeatUntilInput.value = repeatRuleUntil(rule);
      if (repeatCountInput) repeatCountInput.value = String(repeatRuleCount(rule));
      const defaultWeekday = repeatWeekdayForInput(inputStartTime?.value || '');
      const ruleDays = Array.isArray(rule.daysOfWeek) ? rule.daysOfWeek : (Array.isArray(rule.days_of_week) ? rule.days_of_week : []);
      setRepeatWeekdays(ruleDays.length ? ruleDays : [defaultWeekday]);
      syncRepeatUi({ keepWeekdays: true });
      updateRepeatSummaryText();
    }

    function buildRepeatPayloadFromForm(startValue, existingRule) {
      const repeatType = normalizeRepeatType(repeatSelect?.value || 'none');
      if (repeatType === 'none') {
        return { repeat_type: 'none', repeat_rule: {} };
      }
      const frequency = effectiveRepeatFrequencyFromForm();
      const interval = 1;
      const endType = String(repeatEndTypeSelect?.value || 'never').toLowerCase();
      const startKey = String(startValue || '').slice(0, 10);
      const rule = { interval, frequency, endType };
      const previousRule = normalizeRepeatRule(existingRule || {});
      const previousExceptions = previousRule.exdates || previousRule.exceptionDates;
      if (Array.isArray(previousExceptions) && previousExceptions.length) {
        rule.exdates = previousExceptions.slice();
      }
      if (frequency === 'weekly') {
        const days = selectedRepeatWeekdays();
        if (!days.length) throw new Error('매주 반복 요일을 한 개 이상 선택하세요.');
        rule.daysOfWeek = days;
      }
      if (frequency === 'monthly' || frequency === 'yearly') {
        rule.monthDayPolicy = 'clamp';
      }
      if (endType === 'until') {
        const until = String(repeatUntilInput?.value || '').trim().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new Error('반복 종료 날짜를 입력하세요.');
        if (startKey && until < startKey) throw new Error('반복 종료일은 시작일보다 빠를 수 없습니다.');
        rule.untilDate = until;
      } else if (endType === 'count') {
        const count = parseInt(String(repeatCountInput?.value || '0'), 10);
        if (!Number.isFinite(count) || count < 1) throw new Error('반복 횟수는 1 이상이어야 합니다.');
        rule.count = count;
      }
      return { repeat_type: repeatType, repeat_rule: rule };
    }

    function repeatLabel(repeatType, rule) {
      const type = normalizeRepeatType(repeatType);
      if (type === 'none') return '반복 안 함';
      const normalizedRule = normalizeRepeatRule(rule || {});
      const base = {
        daily: '매일',
        weekly: '매주',
        monthly: '매월',
        yearly: '매년',
      }[type] || '사용자 지정';
      let label = base;
      if (type === 'custom') {
        const freq = repeatRuleFrequency(type, normalizedRule);
        const iv = repeatRuleInterval(normalizedRule);
        if (freq === 'weekly') {
          label = iv === 1 ? '매주' : `${iv}주마다`;
        } else {
          const unit = { daily: '일', monthly: '개월', yearly: '년' }[freq] || '일';
          label = iv === 1 && freq === 'daily' ? '매일' : `${iv}${unit}마다`;
        }
      }
      const endType = repeatRuleEndType(normalizedRule);
      if (endType === 'until') {
        const until = repeatRuleUntil(normalizedRule);
        if (until) label += ` · ${until}까지`;
      } else if (endType === 'count') {
        label += ` · ${repeatRuleCount(normalizedRule)}회`;
      }
      return label;
    }

    function captureRepeatState() {
      return {
        repeatType: normalizeRepeatType(repeatSelect?.value || 'none'),
        endType: String(repeatEndTypeSelect?.value || 'never').toLowerCase(),
        until: repeatUntilInput ? String(repeatUntilInput.value || '') : '',
        count: repeatCountInput ? String(repeatCountInput.value || '10') : '10',
        weekdays: selectedRepeatWeekdays().slice(),
      };
    }

    function applyRepeatState(snapshot) {
      if (!snapshot) return;
      if (repeatSelect) repeatSelect.value = snapshot.repeatType;
      if (repeatEndTypeSelect) repeatEndTypeSelect.value = snapshot.endType;
      if (repeatUntilInput) repeatUntilInput.value = snapshot.until || '';
      if (repeatCountInput) repeatCountInput.value = snapshot.count || '10';
      setRepeatWeekdays(snapshot.weekdays || []);
      syncRepeatUi({ keepWeekdays: true });
    }

    function repeatSummaryFromForm() {
      const repeatType = normalizeRepeatType(repeatSelect?.value || 'none');
      if (repeatType === 'none') return '반복 안 함';
      const frequency = effectiveRepeatFrequencyFromForm();
      const interval = 1;
      const endType = String(repeatEndTypeSelect?.value || 'never').toLowerCase();
      const rule = { interval, frequency, endType };
      if (endType === 'until') {
        const until = String(repeatUntilInput?.value || '').trim().slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(until)) rule.untilDate = until;
      } else if (endType === 'count') {
        const count = parseInt(String(repeatCountInput?.value || '10'), 10);
        rule.count = Number.isFinite(count) && count > 0 ? count : 10;
      }
      if (frequency === 'weekly') {
        const days = selectedRepeatWeekdays();
        if (days.length) rule.daysOfWeek = days;
      }
      if (frequency === 'monthly' || frequency === 'yearly') {
        rule.monthDayPolicy = 'clamp';
      }
      return repeatLabel(repeatType, rule);
    }

    function updateRepeatSummaryText() {
      if (!repeatSummaryEl) return;
      try {
        repeatSummaryEl.textContent = repeatSummaryFromForm();
      } catch (_) {
        repeatSummaryEl.textContent = '반복 안 함';
      }
      const rt = normalizeRepeatType(repeatSelect?.value || 'none');
      if (repeatOpenBtn) {
        repeatOpenBtn.classList.toggle('is-active', rt !== 'none');
      }
    }

    function isRepeatModalVisible() {
      if (!repeatModal) return false;
      return repeatModal.classList.contains('show') || repeatModal.style.display === 'block';
    }

    function forceCloseRepeatModal() {
      repeatModalSnapshot = null;
      try {
        repeatUntilInput?._flatpickr?.close();
      } catch (_) {}
      try {
        document.body.classList.remove('repeat-submodal-open');
      } catch (_) {}
      if (!repeatModal) return;
      repeatModal.classList.remove('show');
      repeatModal.style.display = 'none';
      repeatModal.setAttribute('aria-hidden', 'true');
      if (repeatOpenBtn) repeatOpenBtn.setAttribute('aria-expanded', 'false');
    }

    function closeRepeatModal(opts) {
      const restore = opts && opts.restore;
      if (restore && repeatModalSnapshot) {
        applyRepeatState(repeatModalSnapshot);
      }
      repeatModalSnapshot = null;
      try {
        repeatUntilInput?._flatpickr?.close();
      } catch (_) {}
      try {
        document.body.classList.remove('repeat-submodal-open');
      } catch (_) {}
      if (!repeatModal) return;
      repeatModal.classList.remove('show');
      repeatModal.style.display = 'none';
      repeatModal.setAttribute('aria-hidden', 'true');
      if (repeatOpenBtn) repeatOpenBtn.setAttribute('aria-expanded', 'false');
      try {
        if (restore && repeatOpenBtn && typeof repeatOpenBtn.focus === 'function') {
          repeatOpenBtn.focus({ preventScroll: true });
        }
      } catch (_) {}
    }

    function confirmRepeatModal() {
      updateRepeatSummaryText();
      closeRepeatModal({ restore: false });
      try {
        if (repeatOpenBtn && typeof repeatOpenBtn.focus === 'function') {
          repeatOpenBtn.focus({ preventScroll: true });
        }
      } catch (_) {}
    }

    function openRepeatModal() {
      if (!repeatModal || modalCtx.mode === 'view') return;
      repeatModalSnapshot = captureRepeatState();
      syncRepeatUi({ keepWeekdays: true });
      try {
        document.body.classList.add('repeat-submodal-open');
      } catch (_) {}
      repeatModal.classList.add('show');
      repeatModal.style.display = 'block';
      repeatModal.setAttribute('aria-hidden', 'false');
      if (repeatOpenBtn) repeatOpenBtn.setAttribute('aria-expanded', 'true');
      setTimeout(() => {
        try {
          repeatSelect?.focus();
        } catch (_) {}
      }, 0);
    }

    const DEFAULT_PROFILE_IMAGE = '/static/image/svg/profil/free-icon-bussiness-man.svg';

    function normalizeProfileImageSrc(raw) {
      let src = (raw || '').toString().trim();
      if (!src) return DEFAULT_PROFILE_IMAGE;
      const lowered = src.toLowerCase();
      if (lowered === 'null' || lowered === 'none' || lowered === 'undefined') return DEFAULT_PROFILE_IMAGE;
      // Normalize Windows-style paths to URL paths.
      src = src.replace(/\\+/g, '/');
      if (/^data:/i.test(src)) return src;
      if (/^https?:\/\//i.test(src)) return src;
      if (src.startsWith('/')) return src;
      return `/${src.replace(/^\/+/, '')}`;
    }

    function ensureOwnerAvatarFallbackBound() {
      if (!ownerAvatar) return;
      if (ownerAvatar.dataset && ownerAvatar.dataset.fallbackBound === '1') return;
      try {
        ownerAvatar.addEventListener('error', function () {
          try {
            const current = (ownerAvatar.getAttribute('src') || '').trim();
            if (current && current !== DEFAULT_PROFILE_IMAGE) {
              ownerAvatar.setAttribute('src', DEFAULT_PROFILE_IMAGE);
            }
          } catch (_) {}
        });
      } catch (_) {}
      try {
        if (ownerAvatar.dataset) ownerAvatar.dataset.fallbackBound = '1';
      } catch (_) {}
    }

    function withCacheBuster(src) {
      const s = (src || '').toString().trim();
      if (!s) return s;
      if (s === DEFAULT_PROFILE_IMAGE) return s;
      if (/^data:/i.test(s)) return s;
      // Only bust cache for local static assets to avoid breaking remote URLs.
      if (!s.startsWith('/static/')) return s;
      const sep = s.includes('?') ? '&' : '?';
      return `${s}${sep}cb=${Date.now()}`;
    }

    function renderParagraphsHtml(rawText) {
      const text = String(rawText || '').replace(/\r\n/g, '\n').trim();
      if (!text) return '';
      const paragraphs = text.split(/\n\s*\n+/g);
      return paragraphs
        .map((para) => {
          const lines = String(para || '')
            .split('\n')
            .map((line) => escapeHtml(line))
            .join('<br>');
          return `<p>${lines}</p>`;
        })
        .join('');
    }
    function formatViewDateTimeRange(startDate, endDate, isAllDay) {
      if (!startDate && !endDate) return '';
      if (isAllDay) {
        const s = startDate ? formatDateTimeInput(startDate).slice(0, 10) : '';
        const e = endDate ? formatDateTimeInput(endDate).slice(0, 10) : '';
        if (s && e && s !== e) return `${s} ~ ${e}`;
        return s || e;
      }
      const s = startDate ? formatDateTimeInput(startDate) : '';
      const e = endDate ? formatDateTimeInput(endDate) : '';
      if (s && e) return `${s} ~ ${e}`;
      return s || e;
    }

    function populateViewFromModalState({ typeLabel, shareModeLabel, shareTargetsLabel, repeatModeLabel, startDate, endDate }) {
      function setViewValue(el, value, opts) {
        if (!el) return;
        const useHtml = !!(opts && opts.html);
        const raw = (value === undefined || value === null) ? '' : String(value);
        const trimmed = raw.trim();
        const isEmpty = !trimmed || trimmed === '-';
        try { el.dataset.empty = isEmpty ? '1' : '0'; } catch (_) {}
        if (useHtml) {
          el.innerHTML = trimmed || '-';
        } else {
          el.textContent = trimmed || '-';
        }
      }

      setViewValue(viewName, (inputName?.value || '').trim());
      setViewValue(viewTime, formatViewDateTimeRange(startDate, endDate, !!modalCtx.allDay));
      setViewValue(viewLocation, (inputLocation?.value || '').trim());
      setViewValue(viewType, typeLabel || '-');
      setViewValue(viewRepeat, repeatModeLabel || '-');
      if (viewShare) {
        const base = shareModeLabel || '-';
        const combined = shareTargetsLabel ? `${base} · ${shareTargetsLabel}` : base;
        setViewValue(viewShare, combined);
      }
      if (viewDesc) {
        const desc = (inputDesc?.value || '').trim();
        if (!desc) {
          setViewValue(viewDesc, '-');
        } else {
          setViewValue(viewDesc, renderParagraphsHtml(desc), { html: true });
        }
      }

      // Attachments are persisted server-side; in view mode show persisted attachments.
      const existing = Array.isArray(modalCtx.existingAttachments) ? modalCtx.existingAttachments : [];
      if (!viewAttachmentsWrap) return;
      if (!existing.length) {
        if (viewAttachments) {
          viewAttachments.innerHTML = '';
          viewAttachments.hidden = true;
        }
        if (viewAttachmentsEmpty) {
          viewAttachmentsEmpty.style.display = '';
        }
        return;
      }
      if (viewAttachments) {
        const downloadSvg = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 3v10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M8 11l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5 21h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        `;

        function fileExtLabel(fileName, contentType) {
          const ct = String(contentType || '').trim().toLowerCase();
          if (ct === 'application/pdf') return 'PDF';
          const name = String(fileName || '').trim();
          const lastDot = name.lastIndexOf('.');
          const ext = lastDot >= 0 ? name.slice(lastDot + 1).trim() : '';
          const safe = (ext || '').toUpperCase();
          if (!safe) return 'FILE';
          return safe.length > 5 ? safe.slice(0, 5) : safe;
        }

        viewAttachments.innerHTML = existing.map((att) => {
          const name = att?.name || '';
          const url = att?.download_url || '#';
          const contentType = String(att?.content_type || '').trim().toLowerCase();
          const isImage = contentType.startsWith('image/');
          const size = typeof att?.size_bytes === 'number' ? formatFileSize(att.size_bytes) : '';

          const previewUrl = isImage
            ? `${url}${String(url).includes('?') ? '&' : '?'}inline=1`
            : '';
          const extLabel = fileExtLabel(name, contentType);
          const badgeHtml = isImage
            ? `
              <span class="attachment-badge attachment-badge--thumb" aria-hidden="true">
                <img src="${escapeHtml(previewUrl)}" alt="" loading="lazy" />
              </span>
            `
            : `
              <span class="attachment-badge attachment-badge--file" aria-hidden="true">${escapeHtml(extLabel)}</span>
            `;

          return `
            <li class="attachment-item attachment-pill">
              ${badgeHtml}
              <a class="attachment-name" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>
              <span class="attachment-size">${escapeHtml(size)}</span>
              <div class="attachment-actions" aria-label="첨부 파일 작업">
                <a class="attachment-action attachment-action--download" href="${escapeHtml(url)}" target="_blank" rel="noopener" aria-label="다운로드">
                  ${downloadSvg}
                </a>
              </div>
            </li>
          `;
        }).join('');
        viewAttachments.hidden = false;
      }
      if (viewAttachmentsEmpty) {
        viewAttachmentsEmpty.style.display = 'none';
      }
    }

    function setModalViewMode(flag) {
      const isView = !!flag;
      if (formEl) formEl.hidden = isView;
      if (viewWrap) viewWrap.hidden = !isView;
    }

    function setOwnerDisplay(owner) {
      if (!ownerWrap) return;
      if (typeof owner === 'string') {
        try {
          owner = JSON.parse(owner);
        } catch (_) {
          owner = null;
        }
      }
      if (!owner) {
        ownerWrap.hidden = true;
        return;
      }
      ownerWrap.hidden = false;
      const rawProfile = (
        owner.profile_image ||
        owner.profileImage ||
        owner.avatar ||
        ''
      );
      const imageSrc = normalizeProfileImageSrc(rawProfile);
      if (ownerAvatar) {
        const finalSrc = withCacheBuster(imageSrc);
        ownerAvatar.src = finalSrc;
        ownerAvatar.alt = owner.name || owner.emp_no || '일정 생성자';
        calendarDebugLog('setOwnerDisplay', {
          rawProfile,
          imageSrc,
          finalSrc,
          domSrc: ownerAvatar.getAttribute('src')
        });
      }
      if (ownerName) {
        ownerName.textContent = owner.name || owner.emp_no || '';
      }
      if (ownerMeta) {
        const dept = (owner.department || '').trim();
        ownerMeta.textContent = dept ? `일정 생성자 · ${dept}` : '일정 생성자';
      }
    }

    function setModalReadOnly(flag) {
      const isReadOnly = !!flag;
      const controls = [
        inputName,
        inputStartTime,
        inputEndTime,
        inputLocation,
        inputDesc,
        inputAttachments,
        reminderSelect,
        stickerSelect,
        colorInput,
        repeatSelect,
        repeatEndTypeSelect,
        repeatUntilInput,
        repeatCountInput,
      ].filter(Boolean);
      controls.forEach((el) => {
        try { el.disabled = isReadOnly; } catch (_) {}
      });
      if (btnAllDay) {
        btnAllDay.disabled = isReadOnly;
      }
      if (importantBtn) {
        importantBtn.disabled = isReadOnly;
      }
      if (colorButton) {
        colorButton.disabled = isReadOnly;
        if (isReadOnly) closeColorPanel();
      }
      if (colorPalette) {
        colorPalette.querySelectorAll('button').forEach((btn) => {
          btn.disabled = isReadOnly;
        });
      }
      if (repeatWeekdaysWrap) {
        repeatWeekdaysWrap.querySelectorAll('input').forEach((input) => {
          input.disabled = isReadOnly;
        });
      }
      if (repeatOpenBtn) {
        try { repeatOpenBtn.disabled = isReadOnly; } catch (_) {}
      }
      if (typeDropdownTrigger) {
        typeDropdownTrigger.disabled = isReadOnly;
      }
      if (shareModeChips.length) {
        shareModeChips.forEach((chip) => {
          chip.disabled = isReadOnly;
        });
      }
      if (shareSearch) {
        shareSearch.disabled = isReadOnly || (getShareModeValue() !== 'custom');
      }
      if (btnSave) {
        btnSave.style.display = isReadOnly ? 'none' : 'inline-flex';
      }
      if (btnDelete) {
        btnDelete.style.display = modalCtx.canDelete ? 'inline-flex' : 'none';
      }
      if (attachmentDrop) {
        attachmentDrop.setAttribute('aria-disabled', isReadOnly ? 'true' : 'false');
        // In view mode, hide the upload dropzone text entirely.
        attachmentDrop.style.display = isReadOnly ? 'none' : '';
      }
      if (attachmentClearBtn) {
        attachmentClearBtn.disabled = isReadOnly;
        attachmentClearBtn.style.display = isReadOnly ? 'none' : '';
      }

      // In view mode, hide the second datetime input box (end time).
      try {
        const endField = inputEndTime ? inputEndTime.closest('.datetime-field') : null;
        if (endField) {
          endField.style.display = isReadOnly ? 'none' : '';
        }
        const sep = modal ? modal.querySelector('.datetime-sep') : null;
        if (sep) {
          sep.style.display = isReadOnly ? 'none' : '';
        }
      } catch (_) {}
    }

  function openModal({ mode, startStr, endStr, allDay, event, ownerOverride, openerEl }) {
      if (!startStr && event?.startStr) startStr = event.startStr;
      if (!endStr && event?.endStr) endStr = event.endStr;
      const shareUsers = Array.isArray(event?.extendedProps?.shareUsers) ? event.extendedProps.shareUsers.slice() : [];
      const shareDepts = Array.isArray(event?.extendedProps?.shareDepartments) ? event.extendedProps.shareDepartments.slice() : [];
      if (shareDepts.length) {
        ensureOrgDepartmentsLoaded().catch(() => {});
      }
      const defaultShareMode = event ? (event.extendedProps?.shareMode || shareScopeToMode(event.extendedProps?.shareScope)) : getShareModeValue();
      const hasCustomShares = shareUsers.length || shareDepts.length;
      const resolvedShareMode = defaultShareMode || (hasCustomShares ? 'custom' : 'basic');
      const canDeleteSchedule = canCurrentUserDeleteEvent(event);
      shareSelectionSeq = 0;
      shareDepts.forEach((entry) => { if (entry) entry.__addedAt = ++shareSelectionSeq; });
      shareUsers.forEach((entry) => { if (entry) entry.__addedAt = ++shareSelectionSeq; });
      modalCtx = {
        mode,
        startStr,
        endStr,
        allDay,
        eventId: getScheduleIdFromEvent(event),
        shares: [],
        shareUsersPayload: shareUsers,
        shareDepartmentsPayload: shareDepts,
        sourceEvent: event || null,
        lastShareMode: resolvedShareMode,
        openerEl: openerEl || modalCtx.openerEl || null,
        openerActiveEl: (document && document.activeElement) ? document.activeElement : null,
        existingAttachments: Array.isArray(event?.extendedProps?.attachments) ? event.extendedProps.attachments.slice() : [],
        attendees: [],
        important: !!event?.extendedProps?.isImportant,
        canDelete: !!(event && canDeleteSchedule),
      };
      syncShareLabelsFromPayload();
      modalTitle.textContent = mode === 'edit' ? '일정 수정' : (mode === 'view' ? '일정 보기' : '일정 등록');
      if (modalSubtitle) {
        modalSubtitle.textContent = mode === 'edit' ? '일정 정보를 수정하세요.' : (mode === 'view' ? '일정을 확인하세요.' : '일정 정보를 입력하세요.');
      }
      // Creator header: for add mode show current user, for existing schedules show schedule owner.
      const initialOwner = ownerOverride || event?.extendedProps?.owner || null;
      if (mode === 'add') {
        setOwnerDisplay(getCurrentUserSnapshot());
      } else {
        setOwnerDisplay(initialOwner);
      }

      // Always refresh creator info from schedule detail API (prevents stale/default avatar).
      try {
        const scheduleId = getScheduleIdFromEvent(event);
        if (scheduleId) {
          (async () => {
            try {
              const res = await apiGetSchedule(scheduleId);
              const item = res && res.item;
              const detailEvent = item ? scheduleToEvent(item) : null;
              if (detailEvent) {
                modalCtx.canDelete = canCurrentUserDeleteEvent(detailEvent);
                if (btnDelete) {
                  btnDelete.style.display = modalCtx.canDelete ? 'inline-flex' : 'none';
                }
              }
              if (item && item.owner) {
                setOwnerDisplay(item.owner);
              }
              if (item && Array.isArray(item.attachments)) {
                modalCtx.existingAttachments = item.attachments.slice();
                if (mode === 'view') {
                  const selectedMode = getShareModeValue();
                  const shareModeLabel = SHARE_MODE_LABELS[selectedMode] || '-';
                  const shareTargetsLabel = Array.isArray(modalCtx.shares) && modalCtx.shares.length
                    ? modalCtx.shares.map((c) => shareChipSummary(c)).filter(Boolean).join(', ')
                    : '';
                  populateViewFromModalState({
                    typeLabel: selectType?.value || type || '-',
                    shareModeLabel,
                    shareTargetsLabel,
                    repeatModeLabel: repeatLabel(detailEvent?.extendedProps?.repeatType || 'none', detailEvent?.extendedProps?.repeatRule || {}),
                    startDate: parseDateTimeInput(inputStartTime?.value) || derivedStart,
                    endDate: parseDateTimeInput(inputEndTime?.value) || derivedEnd,
                  });
                } else {
                  refreshAttachmentList();
                }
              }
            } catch (_) {
              // ignore
            }
          })();
        }
      } catch (_) {
        // ignore
      }
      inputName.value = event?.title || '';
      const initialAllDay = !!(event ? event.allDay : allDay);
      const derivedStart = resolveDateTimeSeed(startStr || event?.start || event?.startStr, initialAllDay, DEFAULT_START_TIME);
      const derivedEnd = resolveDateTimeSeed(endStr || event?.end || event?.endStr, initialAllDay, DEFAULT_END_TIME, derivedStart);
      if (inputStartTime && derivedStart) {
        inputStartTime.value = formatDateTimeInput(derivedStart);
      }
      if (inputEndTime && derivedEnd) {
        inputEndTime.value = formatDateTimeInput(derivedEnd);
      }
      if (!initialAllDay) {
        ensureEndAlignedWithStart({ forceOneHourGap: mode !== 'edit' });
      }
      if (inputStartTime && !inputStartTime.value) {
        const fallbackStart = resolveDateTimeSeed(null, false, DEFAULT_START_TIME);
        inputStartTime.value = formatDateTimeInput(fallbackStart);
      }
      if (inputEndTime && !inputEndTime.value) {
        const fallbackEnd = resolveDateTimeSeed(null, false, DEFAULT_END_TIME, parseDateTimeInput(inputStartTime.value));
        inputEndTime.value = formatDateTimeInput(fallbackEnd);
      }
      lastTimeRange.start = inputStartTime?.value || '';
      lastTimeRange.end = inputEndTime?.value || '';
      const parsedStart = parseDateTimeInput(inputStartTime?.value);
      const parsedEnd = parseDateTimeInput(inputEndTime?.value);
      modalCtx.startStr = parsedStart ? toLocalIsoString(parsedStart) : modalCtx.startStr;
      modalCtx.endStr = parsedEnd ? toLocalIsoString(parsedEnd) : modalCtx.endStr;
        syncFlatpickrValues();
      const type = event?.extendedProps?.type || '';
      setTypeValue(type);
  inputLocation.value = event?.extendedProps?.location || '';
      // Share mode
      setShareModeValue(resolvedShareMode);
      renderShareChips(modalCtx.shares);
  // description
  inputDesc.value = event?.extendedProps?.description || '';
  modalCtx.attendees = [];
  setImportant(!!modalCtx.important);
  if (reminderSelect) {
    const reminders = event?.extendedProps?.reminders || [];
    reminderSelect.value = Array.isArray(reminders) && reminders.length ? String(reminders[0] || '') : '';
  }
  if (stickerSelect) stickerSelect.value = event?.extendedProps?.sticker || '';
  setColorValue(event?.backgroundColor || event?.extendedProps?.color || DEFAULT_SCHEDULE_COLOR);
  setRepeatFields(event || null);
  // set all-day UI state (after potential override)
  setAllDayUI(!!(event ? event.allDay : allDay));
  if (!modalCtx.allDay) {
    // focus first time field if creating a new timed event
    setTimeout(()=>{ try { inputStartTime?.focus(); } catch(_){} }, 50);
  }

  // show (use CSS .show for visibility) + inline fallback
  modal.classList.add('show');
  modal.style.display = 'block';
  modal.setAttribute('aria-hidden', 'false');
  modal.removeAttribute('hidden');
  try {
    modal.removeAttribute('inert');
    modal.inert = false;
  } catch (_) {}
      if (btnDelete) {
        btnDelete.style.display = modalCtx.canDelete ? 'inline-flex' : 'none';
        try { btnDelete.disabled = false; } catch (_) {}
      }
      setModalReadOnly(mode === 'view');
      setModalViewMode(mode === 'view');

      if (mode !== 'view') {
        refreshAttachmentList();
      }

      // Populate data-only view when viewing.
      if (mode === 'view') {
        const selectedMode = getShareModeValue();
        const shareModeLabel = SHARE_MODE_LABELS[selectedMode] || '-';
        const shareTargetsLabel = Array.isArray(modalCtx.shares) && modalCtx.shares.length
          ? modalCtx.shares.map((c) => shareChipSummary(c)).filter(Boolean).join(', ')
          : '';
        populateViewFromModalState({
          typeLabel: selectType?.value || type || '-',
          shareModeLabel,
          shareTargetsLabel,
          repeatModeLabel: repeatLabel(event?.extendedProps?.repeatType || 'none', event?.extendedProps?.repeatRule || {}),
          startDate: parseDateTimeInput(inputStartTime?.value) || derivedStart,
          endDate: parseDateTimeInput(inputEndTime?.value) || derivedEnd,
        });
      }
      document.body.classList.add('modal-open');
  document.documentElement.classList.add('modal-open');
      setTimeout(() => inputName.focus(), 0);
    }

    function closeModal() {
      forceCloseRepeatModal();
      closeDatePickers();
      closeActiveDropdown();
  // Move focus outside the modal BEFORE hiding it to avoid aria-hidden warnings.
  try { modalClose?.blur(); } catch (_) {}
  try {
    const target = modalCtx.openerEl || calendarEl || document.body;
    if (target && typeof target.focus === 'function') {
      target.focus({ preventScroll: true });
    } else if (document.body && typeof document.body.focus === 'function') {
      document.body.focus({ preventScroll: true });
    }
  } catch (_) {}
  try {
    modal.setAttribute('inert', '');
    modal.inert = true;
  } catch (_) {}
  // Hide this modal and any other server add/edit modals just in case
  modal.classList.remove('show');
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  modal.setAttribute('hidden', '');
  document.querySelectorAll('.server-add-modal.show, .server-edit-modal.show').forEach(el => el.classList.remove('show'));
  document.body.classList.remove('modal-open');
  document.documentElement.classList.remove('modal-open');
      hideShareSuggest();
      if (shareSearch) {
        shareSearch.value = '';
      }
      resetAttachments();
      modalCtx.existingAttachments = [];
      if (shareSearchAbortController) {
        try { shareSearchAbortController.abort(); } catch (_) {}
        shareSearchAbortController = null;
      }
    }

    function setImportant(flag) {
      modalCtx.important = !!flag;
      if (importantBtn) {
        importantBtn.classList.toggle('is-on', modalCtx.important);
        importantBtn.setAttribute('aria-pressed', modalCtx.important ? 'true' : 'false');
      }
    }
    modalClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    // Prevent native form submit (Enter) from reloading; route to save button
    formEl?.addEventListener('submit', (e) => {
      e.preventDefault();
      btnSave?.click();
    });

    shareSearch?.addEventListener('input', handleShareSearchInput);
    shareSearch?.addEventListener('keydown', handleShareSearchKeydown);
    importantBtn?.addEventListener('click', () => setImportant(!modalCtx.important));
    colorButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleColorPanel();
    });
    shareSuggest?.addEventListener('click', (event) => {
      const li = event.target.closest('li[data-user-id], li[data-dept-id]');
      if (!li) return;
      handleShareSuggestionSelection(li);
    });
    document.addEventListener('click', (event) => {
      if (colorPanel && !colorPanel.hidden && !colorPanel.contains(event.target) && !colorButton?.contains(event.target)) {
        closeColorPanel();
      }
      if (!shareCustomWrap || !shareSuggest || shareSuggest.hidden) return;
      if (shareCustomWrap.contains(event.target) || shareSuggest.contains(event.target)) return;
      hideShareSuggest();
    });

    function handleShareSearchInput() {
      if (!shareSearch || shareSearch.disabled) return;
      const keyword = (shareSearch.value || '').trim();
      if (shareSearchDebounceTimer) {
        clearTimeout(shareSearchDebounceTimer);
      }
      if (!keyword) {
        hideShareSuggest();
        return;
      }
      if (keyword.length < SHARE_SEARCH_MIN_CHARS) {
        showShareSuggestMessage(`최소 ${SHARE_SEARCH_MIN_CHARS}글자 이상 입력하세요.`);
        return;
      }
      shareSearchDebounceTimer = setTimeout(() => fetchCombinedShareSuggestions(keyword), SHARE_SEARCH_DEBOUNCE_MS);
    }

    function handleShareSearchKeydown(event) {
      if (!shareSearch || shareSearch.disabled) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        const firstOption = shareSuggest ? shareSuggest.querySelector('li[data-dept-id], li[data-user-id]') : null;
        if (firstOption) {
          handleShareSuggestionSelection(firstOption);
        }
      } else if (event.key === 'Escape') {
        hideShareSuggest();
      }
    }

    function handleShareSuggestionSelection(li) {
      if (!li) return;
      const deptIdAttr = li.getAttribute('data-dept-id');
      if (deptIdAttr) {
        const deptId = parseInt(deptIdAttr, 10);
        if (!deptId) return;
        if (isShareDeptAlreadySelected(deptId)) {
          showShareSuggestMessage('이미 선택된 팀입니다.');
          return;
        }
        const record = shareDeptDirectory.get(deptId) || {
          id: deptId,
          dept_name: li.getAttribute('data-dept-name') || li.textContent || '',
          dept_code: li.getAttribute('data-dept-code') || '',
        };
        addShareDepartmentFromRecord(record);
        shareSearch.value = '';
        hideShareSuggest();
        return;
      }
      const userId = parseInt(li.getAttribute('data-user-id') || '0', 10);
      if (!userId) return;
      if (isShareUserAlreadySelected(userId)) {
        showShareSuggestMessage('이미 선택된 사용자입니다.');
        return;
      }
      const profile = shareUserDirectory.get(userId);
      if (!profile) {
        showShareSuggestMessage('사용자 정보를 불러오지 못했습니다.');
        return;
      }
      addShareUserFromProfile(profile);
      shareSearch.value = '';
      hideShareSuggest();
    }

    async function fetchCombinedShareSuggestions(keyword) {
      const normalized = (keyword || '').trim();
      if (!normalized) {
        hideShareSuggest();
        return;
      }
      if (shareSearchAbortController) {
        shareSearchAbortController.abort();
      }
      shareSearchAbortController = new AbortController();
      setShareSuggestLoading();
      try {
        const [teams, users] = await Promise.all([
          fetchTeamResults(normalized, shareSearchAbortController.signal),
          fetchUserResults(normalized, shareSearchAbortController.signal),
        ]);
        renderShareSuggestionList(teams, users, normalized);
      } catch (err) {
        if (err.name === 'AbortError') return;
        showShareSuggestMessage(err.message || '검색 중 오류가 발생했습니다.');
      }
    }

    async function fetchTeamResults(keyword, signal) {
      const normalized = (keyword || '').trim();
      if (!normalized) return [];
      const cacheKey = `team:${normalized.toLowerCase()}`;
      if (shareSearchCache.has(cacheKey)) {
        return shareSearchCache.get(cacheKey);
      }
      const url = buildUrlWithParams(resolveApiUrl('/org-departments'), { q: normalized, limit: SHARE_SUGGEST_LIMIT * 2 });
      const data = await apiRequest('GET', url, null, { signal });
      const items = (data && data.items) || [];
      items.forEach((item) => {
        if (item && item.id) {
          shareDeptDirectory.set(Number(item.id), item);
        }
      });
      shareSearchCache.set(cacheKey, items);
      return items;
    }

    async function fetchUserResults(keyword, signal) {
      const normalized = (keyword || '').trim();
      if (!normalized) return [];
      const cacheKey = `user:${normalized.toLowerCase()}`;
      if (shareSearchCache.has(cacheKey)) {
        return shareSearchCache.get(cacheKey);
      }
      const url = buildUrlWithParams(resolveApiUrl('/user-profiles'), { q: normalized, limit: SHARE_SUGGEST_LIMIT });
      const data = await apiRequest('GET', url, null, { signal });
      const items = (data && data.items) || [];
      items.forEach((item) => {
        if (item && item.id) {
          shareUserDirectory.set(item.id, item);
        }
      });
      shareSearchCache.set(cacheKey, items);
      return items;
    }

    function isBlockedShareUser(record) {
      if (!record) return false;
      const tokens = [record.name, record.emp_no, record.empNo]
        .map((value) => (value || '').trim().toUpperCase())
        .filter(Boolean);
      if (!tokens.length) return false;
      return tokens.some((token) => SHARE_SUGGEST_USER_BLOCKLIST.includes(token));
    }

    function renderShareSuggestionList(teamItems, userItems, keyword) {
      if (!shareSuggest) return;
      const entries = [];
      if (Array.isArray(teamItems)) {
        teamItems.forEach((item) => {
          const deptId = Number(item?.id);
          if (!Number.isFinite(deptId)) return;
          const name = item.dept_name || item.dept_code || `팀 #${deptId}`;
          const metaPieces = [];
          if (item.manager_name) {
            metaPieces.push(item.manager_name);
          }
          entries.push({
            type: 'dept',
            deptId,
            name,
            code: item.dept_code || '',
            meta: metaPieces.join(' · '),
          });
        });
      }
      if (Array.isArray(userItems)) {
        userItems.forEach((item) => {
          const userId = Number(item?.id);
          if (!Number.isFinite(userId)) return;
          if (isBlockedShareUser(item)) return;
          const name = item.name || item.emp_no || '이름 없음';
          const dept = item.department || '';
          const metaPieces = [];
          if (dept) {
            metaPieces.push(dept);
          }
          entries.push({
            type: 'user',
            userId,
            name,
            meta: metaPieces.join(' · '),
          });
        });
      }
      if (!entries.length) {
        showShareSuggestMessage(`'${escapeHtml(keyword)}' 결과가 없습니다.`);
        return;
      }
      const html = entries.map((entry) => {
        if (entry.type === 'dept') {
          return `
            <li data-dept-id="${entry.deptId}" data-dept-name="${escapeHtml(entry.name)}" data-dept-code="${escapeHtml(entry.code || '')}">
              <span class="suggest-badge team">팀</span>
              <span class="suggest-content">
                <span class="suggest-name">${escapeHtml(entry.name)}</span>
                ${entry.meta ? `<span class="suggest-meta">${escapeHtml(entry.meta)}</span>` : ''}
              </span>
            </li>
          `;
        }
        return `
          <li data-user-id="${entry.userId}">
            <span class="suggest-badge user">구성원</span>
            <span class="suggest-content">
              <span class="suggest-name">${escapeHtml(entry.name)}</span>
              ${entry.meta ? `<span class="suggest-meta">${escapeHtml(entry.meta)}</span>` : ''}
            </span>
          </li>
        `;
      }).join('');
      shareSuggest.innerHTML = html;
      shareSuggest.hidden = false;
    }

    function showShareSuggestMessage(message) {
      if (!shareSuggest) return;
      shareSuggest.innerHTML = `<li class="share-suggest-status">${escapeHtml(message)}</li>`;
      shareSuggest.hidden = false;
    }

    function setShareSuggestLoading() {
      showShareSuggestMessage('검색 중...');
    }

    function hideShareSuggest() {
      if (!shareSuggest) return;
      shareSuggest.hidden = true;
      shareSuggest.innerHTML = '';
    }
    function ensureOrgDepartmentsLoaded() {
      if (orgDeptLoadPromise) return orgDeptLoadPromise;
      orgDeptLoadPromise = apiRequest('GET', resolveApiUrl('/org-departments'), null)
        .then((data) => {
          const items = (data && data.items) || [];
          items.forEach((item) => {
            if (item && item.id) {
              shareDeptDirectory.set(Number(item.id), item);
            }
          });
          if (modal?.classList?.contains('show')) {
            syncShareLabelsFromPayload();
            renderShareChips(modalCtx.shares);
          }
          return items;
        })
        .catch((err) => {
          console.warn('Failed to load departments', err);
          orgDeptLoadPromise = null;
          return [];
        });
      return orgDeptLoadPromise;
    }

    function ensureSharePayloadArray() {
      if (!Array.isArray(modalCtx.shareUsersPayload)) {
        modalCtx.shareUsersPayload = [];
      }
      return modalCtx.shareUsersPayload;
    }

    function ensureShareDeptPayloadArray() {
      if (!Array.isArray(modalCtx.shareDepartmentsPayload)) {
        modalCtx.shareDepartmentsPayload = [];
      }
      return modalCtx.shareDepartmentsPayload;
    }

    function syncShareLabelsFromPayload() {
      const chips = [];
      const deptPayload = ensureShareDeptPayloadArray();
      deptPayload.forEach((entry, index) => {
        chips.push({ type: 'dept', index, label: shareDeptLabel(entry), badge: '팀' });
      });
      const userPayload = ensureSharePayloadArray();
      userPayload.forEach((entry, index) => {
        chips.push({
          type: 'user',
          index,
          label: shareUserLabel(entry),
          badge: shareUserTeamBadge(entry),
        });
      });
      modalCtx.shares = chips;
    }

    function isShareUserAlreadySelected(userId) {
      const payload = ensureSharePayloadArray();
      return payload.some((entry) => Number(entry.user_id) === Number(userId));
    }

    function isShareDeptAlreadySelected(deptId) {
      const payload = ensureShareDeptPayloadArray();
      return payload.some((entry) => Number(entry.dept_id) === Number(deptId));
    }

    function addShareUserFromProfile(profile) {
      if (!profile || !profile.id) return;
      const payload = ensureSharePayloadArray();
      const userId = Number(profile.id);
      if (payload.some((entry) => Number(entry.user_id) === userId)) {
        return;
      }
      const record = {
        user_id: userId,
        can_edit: false,
        notification_enabled: true,
        user: {
          id: userId,
          emp_no: profile.emp_no || profile.empNo || '',
          name: profile.name || profile.emp_no || '',
          department: profile.department || '',
        },
      };
      record.__addedAt = ++shareSelectionSeq;
      payload.push(record);
      syncShareLabelsFromPayload();
      renderShareChips(modalCtx.shares);
    }

    function addShareDepartmentFromRecord(record) {
      if (!record || (!record.id && !record.dept_id)) return;
      const deptId = Number(record.id || record.dept_id);
      if (!deptId) return;
      const payload = ensureShareDeptPayloadArray();
      if (payload.some((entry) => Number(entry.dept_id) === deptId)) {
        return;
      }
      const deptName = record.dept_name || record.name || '';
      const deptCode = record.dept_code || record.deptCode || '';
      const entry = {
        dept_id: deptId,
        can_edit: false,
        notification_enabled: true,
        department: {
          id: deptId,
          dept_name: deptName,
          dept_code: deptCode,
        },
      };
      entry.__addedAt = ++shareSelectionSeq;
      payload.push(entry);
      shareDeptDirectory.set(deptId, {
        id: deptId,
        dept_name: deptName,
        dept_code: deptCode,
      });
      syncShareLabelsFromPayload();
      renderShareChips(modalCtx.shares);
    }

    function toggleShareCustom(show) {
      if (!shareCustomWrap) return;
      shareCustomWrap.style.display = show ? 'flex' : 'none';
      if (shareSearch) {
        shareSearch.disabled = !show;
        if (!show) {
          shareSearch.value = '';
        } else {
          setTimeout(() => {
            try { shareSearch.focus(); } catch (_) {}
          }, 80);
        }
      }
      if (!show) {
        hideShareSuggest();
      }
    }

    function markDropdownSelection(optionButtons, value) {
      if (!Array.isArray(optionButtons)) return;
      optionButtons.forEach((btn) => {
        const token = btn.getAttribute('data-value') || '';
        btn.classList.toggle('is-selected', token === value);
      });
    }

    function filterDropdownOptions(optionButtons, keyword) {
      if (!Array.isArray(optionButtons)) return;
      const term = (keyword || '').trim().toLowerCase();
      optionButtons.forEach((btn) => {
        const holder = btn.closest('li') || btn;
        if (!holder) return;
        const label = (btn.getAttribute('data-label') || btn.textContent || '').toLowerCase();
        holder.style.display = !term || label.includes(term) ? '' : 'none';
      });
    }

    function closeActiveDropdown() {
      if (activeDropdownKey && dropdownRegistry[activeDropdownKey]) {
        try { dropdownRegistry[activeDropdownKey].close(); } catch (_) {}
      }
    }

    function initSearchableDropdown(key, { trigger, panel, searchInput, optionButtons, onSelect }) {
      if (!key || !trigger || !panel || !Array.isArray(optionButtons) || !optionButtons.length || typeof onSelect !== 'function') {
        return;
      }
      const closeButton = panel.querySelector('[data-action="dropdown-close"]');
      const field = trigger.closest('.dropdown-field');
      function openPanel() {
        if (!panel.hidden) return;
        closeActiveDropdown();
        panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        field?.classList.add('open');
        activeDropdownKey = key;
        if (searchInput) {
          setTimeout(() => {
            try { searchInput.focus(); } catch (_) {}
          }, 10);
        }
      }
      function closePanel() {
        if (panel.hidden) return;
        panel.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        field?.classList.remove('open');
        if (activeDropdownKey === key) {
          activeDropdownKey = null;
        }
        if (searchInput) {
          searchInput.value = '';
          filterDropdownOptions(optionButtons, '');
        }
      }
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        if (panel.hidden) {
          openPanel();
        } else {
          closePanel();
        }
      });
      closeButton?.addEventListener('click', (e) => {
        e.preventDefault();
        closePanel();
      });
      optionButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const value = btn.getAttribute('data-value') || '';
          onSelect(value, btn.textContent.trim());
          closePanel();
        });
      });
      searchInput?.addEventListener('input', () => {
        filterDropdownOptions(optionButtons, searchInput.value);
      });
      document.addEventListener('click', (e) => {
        if (panel.hidden) return;
        if (panel.contains(e.target) || trigger.contains(e.target)) return;
        closePanel();
      });
      dropdownRegistry[key] = { close: closePanel };
    }

    function setTypeValue(value) {
      const normalized = value || '';
      if (selectType) selectType.value = normalized;
      if (typeSelectedLabel) {
        typeSelectedLabel.textContent = normalized || '선택';
        typeSelectedLabel.classList.toggle('placeholder', !normalized);
      }
      markDropdownSelection(typeDropdownOptions, normalized);
    }

    function getShareModeValue() {
      return shareModeHiddenInput?.value || 'basic';
    }

    function setShareModeValue(mode) {
      const normalized = SHARE_MODE_LABELS[mode] ? mode : 'basic';
      if (shareModeHiddenInput) {
        shareModeHiddenInput.value = normalized;
      }
      if (shareModeChips.length) {
        shareModeChips.forEach((chip) => {
          const token = chip.getAttribute('data-share-mode') || '';
          const isActive = token === normalized;
          chip.classList.toggle('is-active', isActive);
          chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
      }
      toggleShareCustom(normalized === 'custom');
      modalCtx.lastShareMode = normalized;
    }
    function renderShareChips(list) {
      if (!shareChips) return;
      if (!Array.isArray(list) || list.length === 0) {
        shareChips.innerHTML = '';
        return;
      }
      const html = list.map((chip) => {
        const badgeText =
          chip.type === 'dept'
            ? (chip.badge || '팀')
            : String(chip.badge || '').trim();
        const badgeHtml = badgeText
          ? `<span class="share-chip-badge">${escapeHtml(badgeText)}</span>`
          : '';
        return `
          <span class="share-chip share-chip-${chip.type}" data-share-type="${chip.type}" data-share-index="${chip.index}">
            ${badgeHtml}
            <span class="share-chip-label">${escapeHtml(chip.label)}</span>
            <button class="remove" data-share-type="${chip.type}" data-share-index="${chip.index}" aria-label="제거">×</button>
          </span>
        `;
      }).join('');
      shareChips.innerHTML = html;
    }
    shareChips?.addEventListener('click', (e) => {
      if (modalCtx.mode === 'view') return;
      const btn = e.target.closest('button.remove');
      if (!btn) return;
      const idx = parseInt(btn.getAttribute('data-share-index') || '-1', 10);
      const type = btn.getAttribute('data-share-type') || 'user';
      if (Number.isNaN(idx) || idx < 0) return;
      if (type === 'dept') {
        const payload = ensureShareDeptPayloadArray();
        if (idx < payload.length) {
          payload.splice(idx, 1);
        }
      } else {
        const payload = ensureSharePayloadArray();
        if (idx < payload.length) {
          payload.splice(idx, 1);
        }
      }
      syncShareLabelsFromPayload();
      renderShareChips(modalCtx.shares);
    });

    function formatFileSize(bytes) {
      if (!Number.isFinite(bytes)) return '';
      if (bytes >= 1048576) {
        return `${(bytes / 1048576).toFixed(1)} MB`;
      }
      if (bytes >= 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
      }
      return `${bytes} B`;
    }

    function refreshAttachmentList() {
      if (!attachmentsList) return;

      // Cleanup any previous object URLs (for local image previews)
      if (Array.isArray(attachmentObjectUrls) && attachmentObjectUrls.length) {
        attachmentObjectUrls.forEach((u) => {
          try { URL.revokeObjectURL(u); } catch (_) {}
        });
      }
      attachmentObjectUrls = [];

      const files = Array.from(inputAttachments?.files || []);
      const existing = Array.isArray(modalCtx.existingAttachments) ? modalCtx.existingAttachments : [];
      const hasAnything = existing.length || files.length;
      if (!hasAnything) {
        attachmentsList.innerHTML = '';
        attachmentsList.hidden = true;
        attachmentClearBtn?.setAttribute('hidden', '');
        return;
      }

      const downloadSvg = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12 3v10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M8 11l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 21h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      `;

      const trashSvg = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M4 7h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M10 11v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M14 11v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M6 7l1 14h10l1-14" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M9 7V4h6v3" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
      `;

      function fileExtLabel(fileName, contentType) {
        const ct = String(contentType || '').trim().toLowerCase();
        if (ct === 'application/pdf') return 'PDF';
        const name = String(fileName || '').trim();
        const lastDot = name.lastIndexOf('.');
        const ext = lastDot >= 0 ? name.slice(lastDot + 1).trim() : '';
        const safe = (ext || '').toUpperCase();
        if (!safe) return 'FILE';
        return safe.length > 5 ? safe.slice(0, 5) : safe;
      }

      function badgeHtml({ isImage, previewUrl, label }) {
        if (isImage && previewUrl) {
          return `
            <span class="attachment-badge attachment-badge--thumb" aria-hidden="true">
              <img src="${escapeHtml(previewUrl)}" alt="" loading="lazy" />
            </span>
          `;
        }
        return `<span class="attachment-badge attachment-badge--file" aria-hidden="true">${escapeHtml(label || 'FILE')}</span>`;
      }

      function renderPill({ name, size, url, isImage, previewUrl, contentType, kind, attachmentId, pendingIndex }) {
        const label = fileExtLabel(name, contentType);
        const badge = badgeHtml({ isImage, previewUrl, label });
        const nameHtml = url
          ? `<a class="attachment-name" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>`
          : `<span class="attachment-name">${escapeHtml(name)}</span>`;
        const canDelete = modalCtx.mode === 'edit';
        const downloadBtn = url
          ? `
            <a class="attachment-action attachment-action--download" href="${escapeHtml(url)}" target="_blank" rel="noopener" aria-label="다운로드">
              ${downloadSvg}
            </a>
          `
          : '';
        const deleteBtn = canDelete
          ? `
            <button type="button" class="attachment-action attachment-action--delete" aria-label="삭제"
              data-attachment-kind="${escapeHtml(kind || '')}"
              data-attachment-id="${escapeHtml(String(attachmentId || ''))}"
              data-pending-index="${escapeHtml(String(pendingIndex ?? ''))}">
              ${trashSvg}
            </button>
          `
          : '';
        const actionsHtml = (downloadBtn || deleteBtn)
          ? `<div class="attachment-actions" aria-label="첨부 파일 작업">${downloadBtn}${deleteBtn}</div>`
          : `<div class="attachment-actions" aria-hidden="true"></div>`;
        return `
          <li class="attachment-item attachment-pill">
            ${badge}
            ${nameHtml}
            <span class="attachment-size">${escapeHtml(size || '')}</span>
            ${actionsHtml}
          </li>
        `;
      }

      const existingHtml = existing.map((att) => {
        const name = att?.name || '';
        const url = att?.download_url || '';
        const contentType = String(att?.content_type || '').trim().toLowerCase();
        const isImage = contentType.startsWith('image/');
        const size = typeof att?.size_bytes === 'number' ? formatFileSize(att.size_bytes) : '';
        const previewUrl = (isImage && url)
          ? `${url}${String(url).includes('?') ? '&' : '?'}inline=1`
          : '';
        return renderPill({
          name,
          size,
          url,
          isImage,
          previewUrl,
          contentType,
          kind: 'existing',
          attachmentId: att?.id,
        });
      }).join('');

      const pendingHtml = files.map((file, idx) => {
        const name = file?.name || '';
        const contentType = String(file?.type || '').trim().toLowerCase();
        const isImage = contentType.startsWith('image/');
        const size = formatFileSize(file?.size);
        let previewUrl = '';
        if (isImage) {
          try {
            previewUrl = URL.createObjectURL(file);
            attachmentObjectUrls.push(previewUrl);
          } catch (_) {
            previewUrl = '';
          }
        }
        return renderPill({
          name,
          size,
          url: '',
          isImage,
          previewUrl,
          contentType,
          kind: 'pending',
          pendingIndex: idx,
        });
      }).join('');

      attachmentsList.innerHTML = `${existingHtml}${pendingHtml}`;
      attachmentsList.hidden = false;
      if (files.length) {
        attachmentClearBtn?.removeAttribute('hidden');
      } else {
        attachmentClearBtn?.setAttribute('hidden', '');
      }
    }

    function resetAttachments() {
      if (inputAttachments) {
        inputAttachments.value = '';
      }
      refreshAttachmentList();
    }

    inputAttachments?.addEventListener('change', refreshAttachmentList);

    attachmentsList?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button.attachment-action--delete');
      if (!btn) return;
      if (modalCtx.mode !== 'edit') return;
      e.preventDefault();

      const kind = (btn.getAttribute('data-attachment-kind') || '').trim();
      if (kind === 'pending') {
        const pendingIndex = parseInt(btn.getAttribute('data-pending-index') || '-1', 10);
        if (!inputAttachments || !Number.isFinite(pendingIndex) || pendingIndex < 0) return;
        try {
          const current = Array.from(inputAttachments.files || []);
          if (pendingIndex >= current.length) return;
          const dt = new DataTransfer();
          current.forEach((file, i) => {
            if (i !== pendingIndex) dt.items.add(file);
          });
          inputAttachments.files = dt.files;
        } catch (_) {
          // Fallback: if we cannot surgically remove, clear all
          try { inputAttachments.value = ''; } catch (_) {}
        }
        refreshAttachmentList();
        return;
      }

      if (kind === 'existing') {
        const attachmentId = parseInt(btn.getAttribute('data-attachment-id') || '-1', 10);
        if (!Number.isFinite(attachmentId) || attachmentId <= 0) return;
        const scheduleId = modalCtx.eventId;
        if (!scheduleId) return;
        try {
          const res = await fetch(`/api/calendar/schedules/${encodeURIComponent(String(scheduleId))}/attachments/${attachmentId}`, {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' },
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok || payload.success !== true) {
            alert(payload.message || '첨부 파일 삭제에 실패했습니다.');
            return;
          }
          const list = Array.isArray(modalCtx.existingAttachments) ? modalCtx.existingAttachments : [];
          modalCtx.existingAttachments = list.filter((a) => Number(a?.id) !== attachmentId);
          refreshAttachmentList();
        } catch (_) {
          alert('첨부 파일 삭제 중 오류가 발생했습니다.');
        }
      }
    });
    attachmentClearBtn?.addEventListener('click', () => {
      resetAttachments();
      inputAttachments?.focus();
    });
    if (attachmentDrop) {
      const stop = (event) => {
        event.preventDefault();
        event.stopPropagation();
      };
      ['dragenter', 'dragover'].forEach((evt) => {
        attachmentDrop.addEventListener(evt, (event) => {
          stop(event);
          attachmentDrop.classList.add('is-dragover');
        });
      });
      ['dragleave', 'dragend'].forEach((evt) => {
        attachmentDrop.addEventListener(evt, (event) => {
          stop(event);
          if (!attachmentDrop.contains(event.relatedTarget)) {
            attachmentDrop.classList.remove('is-dragover');
          }
        });
      });
      attachmentDrop.addEventListener('drop', (event) => {
        stop(event);
        attachmentDrop.classList.remove('is-dragover');
        if (!inputAttachments) return;
        const files = event.dataTransfer?.files;
        if (!files || !files.length) return;
        let assigned = false;
        if (typeof DataTransfer !== 'undefined') {
          try {
            const buffer = new DataTransfer();
            Array.from(files).forEach((file) => buffer.items.add(file));
            inputAttachments.files = buffer.files;
            assigned = true;
          } catch (_) {
            assigned = false;
          }
        }
        if (!assigned && event.dataTransfer) {
          try {
            inputAttachments.files = event.dataTransfer.files;
            assigned = true;
          } catch (_) {
            assigned = false;
          }
        }
        if (!assigned) {
          return;
        }
        refreshAttachmentList();
      });
    }

    renderColorPalette();
    setTypeValue(selectType?.value || '');
    setRepeatFields(null);
    updateRepeatSummaryText();
    [repeatSelect, repeatEndTypeSelect].filter(Boolean).forEach((control) => {
      control.addEventListener('change', () => {
        syncRepeatUi();
        if (!isRepeatModalVisible()) updateRepeatSummaryText();
      });
    });
    repeatWeekdaysWrap?.addEventListener('change', () => {
      syncRepeatUi({ keepWeekdays: true });
      if (!isRepeatModalVisible()) updateRepeatSummaryText();
    });
    inputStartTime?.addEventListener('change', () => {
      syncRepeatUi();
      updateRepeatSummaryText();
    });
    repeatOpenBtn?.addEventListener('click', () => openRepeatModal());
    repeatModalOk?.addEventListener('click', () => confirmRepeatModal());
    repeatModalCancel?.addEventListener('click', () => closeRepeatModal({ restore: true }));
    repeatModalClose?.addEventListener('click', () => closeRepeatModal({ restore: true }));
    repeatModal?.addEventListener('click', (event) => {
      if (event.target === repeatModal) closeRepeatModal({ restore: true });
    });
    setShareModeValue(getShareModeValue());
    if (shareModeChips.length) {
      shareModeChips.forEach((chip) => {
        chip.addEventListener('click', () => {
          if (modalCtx.mode === 'view') return;
          const nextMode = chip.getAttribute('data-share-mode') || 'basic';
          setShareModeValue(nextMode);
        });
      });
    }
    initSearchableDropdown('schedule-type', {
      trigger: typeDropdownTrigger,
      panel: typeDropdownPanel,
      searchInput: typeDropdownSearch,
      optionButtons: typeDropdownOptions,
      onSelect: (value) => setTypeValue(value),
    });

    function shareUserLabel(entry) {
      if (!entry) return '-';
      if (entry.user && entry.user.name) return entry.user.name;
      if (entry.user && entry.user.emp_no) return entry.user.emp_no;
      if (entry.user_id) return `USER#${entry.user_id}`;
      return '-';
    }

    function shareUserTeamBadge(entry) {
      if (!entry || !entry.user) return '';
      return String(entry.user.department || '').trim();
    }

    function shareDeptLabel(entry) {
      if (!entry) return '팀';
      const deptId = Number(entry.dept_id || entry.id);
      const details = entry.department || shareDeptDirectory.get(deptId);
      if (details) {
        const name = details.dept_name || details.name || entry.dept_name || '';
        const code = details.dept_code || '';
        return name || code || (deptId ? `팀 #${deptId}` : '팀');
      }
      if (entry.dept_name) return entry.dept_name;
      return deptId ? `팀 #${deptId}` : '팀';
    }

    function shareChipSummary(chip) {
      if (!chip) return '';
      if (chip.type === 'dept') {
        return String(chip.label || '').trim();
      }
      const team = String(chip.badge || '').trim();
      const name = String(chip.label || '').trim();
      if (team && name) return `${team} ${name}`;
      return name || team;
    }

    // Time validation helpers
    function toMinutes(value) {
      if (!value) return null;
      const parsed = parseDateTimeInput(value);
      if (parsed) {
        return parsed.getHours() * 60 + parsed.getMinutes();
      }
      const str = String(value).trim();
      const kor = str.match(/^(오전|오후)\s*(\d{1,2}):(\d{2})$/);
      if (kor) {
        let hours = parseInt(kor[2], 10);
        const minutes = parseInt(kor[3], 10);
        if (kor[1] === '오후' && hours < 12) hours += 12;
        if (kor[1] === '오전' && hours === 12) hours = 0;
        return hours * 60 + minutes;
      }
      const plain = str.match(/^([0-2]?\d):(\d{2})$/);
      if (plain) {
        const hours = parseInt(plain[1], 10);
        const minutes = parseInt(plain[2], 10);
        if (hours > 23 || minutes > 59) return null;
        return hours * 60 + minutes;
      }
      return null;
    }

    function validateTimes() {
      if (modalCtx.allDay) {
        if (timeError) timeError.style.display = 'none';
        return true;
      }
      const start = parseDateTimeInput(inputStartTime?.value);
      const end = parseDateTimeInput(inputEndTime?.value);
      if (!start || !end) {
        if (timeError) timeError.style.display = 'none';
        return true;
      }
      if (end.getTime() < start.getTime()) {
        if (timeError) timeError.style.display = 'block';
        return false;
      }
      if (timeError) timeError.style.display = 'none';
      return true;
    }

    function ensureEndAlignedWithStart({ forceOneHourGap = false } = {}) {
      if (modalCtx.allDay || !inputStartTime || !inputEndTime) return false;
      const startDate = parseDateTimeInput(inputStartTime.value);
      if (!startDate) return false;
      const currentEnd = parseDateTimeInput(inputEndTime.value);
      if (!forceOneHourGap && currentEnd && currentEnd.getTime() > startDate.getTime()) {
        return false;
      }
      const adjustedEnd = new Date(startDate.getTime() + HOUR_IN_MS);
      inputEndTime.value = formatDateTimeInput(adjustedEnd);
      syncEndSeed();
      syncFlatpickrValues();
      return true;
    }

    function syncStartSeed() {
      if (!inputStartTime) return;
      const parsed = parseDateTimeInput(inputStartTime.value);
      if (parsed) {
        modalCtx.startStr = toLocalIsoString(parsed);
        lastTimeRange.start = inputStartTime.value;
      }
    }

    function syncEndSeed() {
      if (!inputEndTime) return;
      const parsed = parseDateTimeInput(inputEndTime.value);
      if (parsed) {
        modalCtx.endStr = toLocalIsoString(parsed);
        lastTimeRange.end = inputEndTime.value;
      }
    }

    function closeDatePickers() {
      try { inputStartTime?._flatpickr?.close(); } catch (_) {}
      try { inputEndTime?._flatpickr?.close(); } catch (_) {}
      try { repeatUntilInput?._flatpickr?.close(); } catch (_) {}
    }

    inputStartTime?.addEventListener('change', () => {
      syncStartSeed();
      ensureEndAlignedWithStart({ forceOneHourGap: modalCtx.mode !== 'edit' });
      validateTimes();
    });
    inputEndTime?.addEventListener('change', () => {
      syncEndSeed();
      ensureEndAlignedWithStart();
      validateTimes();
    });
  // (Removed auto-blur so toggle back from 종일 works intuitively)

    // All-day toggle and helpers
    function setAllDayUI(flag) {
      modalCtx.allDay = flag;
      if (btnAllDay) {
        btnAllDay.setAttribute('aria-pressed', flag ? 'true' : 'false');
        btnAllDay.setAttribute('aria-label', '종일 토글');
        btnAllDay.setAttribute('role','switch');
        btnAllDay.setAttribute('aria-checked', flag ? 'true' : 'false');
      }
      // Store current times before visually dimming
      if (flag) {
        closeDatePickers();
        if (inputStartTime?.value) lastTimeRange.start = inputStartTime.value;
        if (inputEndTime?.value) lastTimeRange.end = inputEndTime.value;
      }
      const tr = inputStartTime ? inputStartTime.closest('.time-range') : null;
      if (tr) tr.classList.toggle('is-disabled', !!flag);
      if (!flag) {
        if (inputStartTime) {
          if (!lastTimeRange.start) {
            const fallbackStart = resolveDateTimeSeed(modalCtx.startStr, false, DEFAULT_START_TIME);
            lastTimeRange.start = formatDateTimeInput(fallbackStart);
          }
          inputStartTime.value = lastTimeRange.start;
          syncStartSeed();
        }
        if (inputEndTime) {
          if (!lastTimeRange.end) {
            const baseStart = parseDateTimeInput(inputStartTime?.value) || resolveDateTimeSeed(modalCtx.startStr, false, DEFAULT_START_TIME);
            const fallbackEnd = resolveDateTimeSeed(modalCtx.endStr, false, DEFAULT_END_TIME, baseStart);
            lastTimeRange.end = formatDateTimeInput(fallbackEnd);
          }
          inputEndTime.value = lastTimeRange.end;
          syncEndSeed();
        }
        syncFlatpickrValues();
        try { inputStartTime?.focus(); } catch (_) {}
      }
      validateTimes();
    }
    btnAllDay?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (modalCtx.mode === 'view') return;
      setAllDayUI(!modalCtx.allDay);
    });
    // Keyboard toggle support (Enter / Space)
    btnAllDay?.addEventListener('keydown', (e)=>{
      if (modalCtx.mode === 'view') return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAllDayUI(!modalCtx.allDay); }
    });

    const FLATPICKR_VENDOR_VER = '4.6.13';
    const FLATPICKR_VENDOR_BASE = `/static/vendor/flatpickr/${FLATPICKR_VENDOR_VER}`;
    const FLATPICKR_BASE_CSS = `${FLATPICKR_VENDOR_BASE}/flatpickr.min.css`;
    const FLATPICKR_THEME_CSS = `${FLATPICKR_VENDOR_BASE}/themes/airbnb.css`;
    const FLATPICKR_JS = `${FLATPICKR_VENDOR_BASE}/flatpickr.min.js`;
    const FLATPICKR_LOCALE_KO = `${FLATPICKR_VENDOR_BASE}/l10n/ko.js`;
    let flatpickrReadyPromise = null;

    function ensureCssLink(id, href) {
      if (document.getElementById(id)) return;
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }

    function loadScriptOnce(src) {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
      });
    }

    async function ensureFlatpickrAssets() {
      ensureCssLink('flatpickr-css', FLATPICKR_BASE_CSS);
      ensureCssLink('flatpickr-theme-airbnb', FLATPICKR_THEME_CSS);
      if (window.flatpickr) return;
      if (!flatpickrReadyPromise) {
        flatpickrReadyPromise = loadScriptOnce(FLATPICKR_JS).then(() => loadScriptOnce(FLATPICKR_LOCALE_KO).catch(() => {}));
      }
      await flatpickrReadyPromise;
    }

    function ensureFpTodayButton(instance) {
      const container = instance?.calendarContainer;
      if (!container) return;
      if (container.querySelector('.fp-today-btn')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fp-today-btn';
      btn.textContent = '오늘';
      btn.addEventListener('click', () => {
        const now = new Date();
        instance.setDate(now, true);
      });
      container.appendChild(btn);
    }

    /** 비용관리 OPEX(opex_contracts.js stylizeCalendar)와 동일 패턴 */
    function stylizeRepeatUntilFlatpickr(instance) {
      if (!instance) return;
      try {
        instance.set('position', 'auto');
      } catch (_) {}
      const cal = instance.calendarContainer;
      if (!cal) return;
      cal.classList.add('blossom-date-popup', 'calendar-repeat-until-popup', 'arrowTop');
      cal.classList.remove('arrowBottom', 'schedule-repeat-fp-cal');
      ensureFpTodayButton(instance);
    }

    function syncFlatpickrValues() {
      try {
        if (inputStartTime?._flatpickr && inputStartTime.value) {
          inputStartTime._flatpickr.setDate(inputStartTime.value, false, 'Y-m-d H:i');
        }
        if (inputEndTime?._flatpickr && inputEndTime.value) {
          inputEndTime._flatpickr.setDate(inputEndTime.value, false, 'Y-m-d H:i');
        }
      } catch (_) {}
    }
    function restoreManualDateInput(target) {
      if (!target) return;
      const fallbackRaw = target === inputStartTime
        ? (lastTimeRange.start || modalCtx.startStr)
        : (lastTimeRange.end || modalCtx.endStr);
      const fallbackDate = parseDateTimeInput(fallbackRaw);
      target.value = fallbackDate ? formatDateTimeInput(fallbackDate) : '';
    }

    function commitManualDateInput(target) {
      if (!target || modalCtx.allDay) return;
      const parsed = parseDateTimeInput(target.value);
      if (!parsed) {
        restoreManualDateInput(target);
        return;
      }
      target.value = formatDateTimeInput(parsed);
      if (target === inputStartTime) {
        syncStartSeed();
        ensureEndAlignedWithStart({ forceOneHourGap: modalCtx.mode !== 'edit' });
      } else if (target === inputEndTime) {
        syncEndSeed();
        ensureEndAlignedWithStart();
      }
      syncFlatpickrValues();
      if (!modalCtx.allDay && !validateTimes()) {
        ensureEndAlignedWithStart({ forceOneHourGap: true });
        validateTimes();
      }
    }

    function repeatUntilMinDateStr() {
      const raw = String(inputStartTime?.value || '').trim();
      const d = raw.slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
      try {
        const fromCtx = String(modalCtx?.startStr || '').trim().slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(fromCtx)) return fromCtx;
      } catch (_) {}
      return null;
    }

    function syncRepeatUntilFlatpickr() {
      try {
        const fp = repeatUntilInput?._flatpickr;
        if (!fp || !repeatUntilInput) return;
        const v = String(repeatUntilInput.value || '').trim().slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          fp.setDate(v, false, 'Y-m-d');
        } else {
          fp.clear(false);
        }
      } catch (_) {}
    }

    async function initRepeatUntilFlatpickr() {
      if (!repeatUntilInput || !repeatModal) return;
      try {
        await ensureFlatpickrAssets();
      } catch (err) {
        console.warn('Repeat until Flatpickr assets failed', err);
        return;
      }
      if (!window.flatpickr || repeatUntilInput._flatpickr) return;
      const locale = (window.flatpickr?.l10ns?.ko) || 'ko';
      window.flatpickr(repeatUntilInput, {
        locale,
        enableTime: false,
        dateFormat: 'Y-m-d',
        allowInput: true,
        disableMobile: true,
        appendTo: document.body,
        positionElement: repeatUntilInput,
        clickOpens: true,
        onReady: (selectedDates, dateStr, instance) => {
          stylizeRepeatUntilFlatpickr(instance);
        },
        onOpen: (selectedDates, dateStr, instance) => {
          stylizeRepeatUntilFlatpickr(instance);
          const md = repeatUntilMinDateStr();
          if (md) instance.set('minDate', md);
          else instance.set('minDate', null);
        },
        onValueUpdate: (selectedDates, dateStr) => {
          if (dateStr) repeatUntilInput.value = String(dateStr).slice(0, 10);
          else repeatUntilInput.value = '';
          updateRepeatSummaryText();
        },
      });
      syncRepeatUntilFlatpickr();
    }

    async function initScheduleDatePickers() {
      if (!inputStartTime && !inputEndTime) return;
      try {
        await ensureFlatpickrAssets();
      } catch (err) {
        console.warn('Flatpickr assets failed to load', err);
        return;
      }
      const locale = (window.flatpickr?.l10ns?.ko) || 'ko';
      const baseOptions = {
        locale,
        enableTime: true,
        time_24hr: true,
        dateFormat: 'Y-m-d H:i',
        allowInput: true,
        disableMobile: true,
        minuteIncrement: 1,
        onReady: (selectedDates, dateStr, instance) => ensureFpTodayButton(instance),
        onOpen: (selectedDates, dateStr, instance) => ensureFpTodayButton(instance),
        onValueUpdate: (selectedDates, dateStr, instance) => {
          if (instance.input === inputStartTime) {
            if (dateStr) inputStartTime.value = dateStr;
            syncStartSeed();
            ensureEndAlignedWithStart({ forceOneHourGap: modalCtx.mode !== 'edit' });
          } else if (instance.input === inputEndTime) {
            if (dateStr) inputEndTime.value = dateStr;
            syncEndSeed();
            ensureEndAlignedWithStart();
          }
          if (!modalCtx.allDay) validateTimes();
        }
      };
      if (inputStartTime) {
        const opts = { ...baseOptions };
        const fp = inputStartTime._flatpickr || window.flatpickr(inputStartTime, opts);
        if (inputStartTime.value) {
          fp.setDate(inputStartTime.value, false, 'Y-m-d H:i');
        }
      }
      if (inputEndTime) {
        const opts = { ...baseOptions };
        const fp = inputEndTime._flatpickr || window.flatpickr(inputEndTime, opts);
        if (inputEndTime.value) {
          fp.setDate(inputEndTime.value, false, 'Y-m-d H:i');
          inputStartTime?.addEventListener('blur', () => commitManualDateInput(inputStartTime));
          inputEndTime?.addEventListener('blur', () => commitManualDateInput(inputEndTime));
        }
      }
    }

    initScheduleDatePickers();
    initRepeatUntilFlatpickr().catch(() => {});

    function getScheduleIdFromEvent(ev) {
      if (!ev) return null;
      const fromExt = ev.extendedProps && ev.extendedProps.scheduleId ? String(ev.extendedProps.scheduleId).trim() : '';
      if (fromExt) return fromExt;
      // FullCalendar EventApi exposes id; some internal shapes expose _def.publicId.
      const direct = (ev.id !== undefined && ev.id !== null) ? String(ev.id).trim() : '';
      if (direct) return direct;
      const fromDef = ev._def && ev._def.publicId ? String(ev._def.publicId).trim() : '';
      if (fromDef) return fromDef;
      return null;
    }

  // (notifications removed)
    const calendar = new FullCalendar.Calendar(calendarEl, {
      // Korean locale for all texts
      locale: 'ko',
      initialView: 'dayGridMonth',
  // Show adjacent month dates but do not force 6 rows
  showNonCurrentDates: true,
  fixedWeekCount: false,
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
      },
  buttonText: { today: '오늘', month: '월', week: '주', day: '일', list: '목록' },
      height: '100%',
      expandRows: true,
      dayMaxEventRows: 3,
      selectable: true,
      selectMirror: true,
      editable: true,
      droppable: true,
  nowIndicator: true,
  events: [],
      // Strip the trailing '일' from day numbers (e.g., 3일 -> 3)
      dayCellContent: function(arg) {
        const text = arg.dayNumberText.replace('\uc77c','');
        return { html: `<span class="fc-daygrid-day-number">${text}</span>` };
      },
  // English month title; weekday headers only (no month/day numbers)
  titleFormat: { year: 'numeric', month: 'long' },
  weekText: '주',
  dayHeaderFormat: { weekday: 'short' },

      select: function (info) {
  openModal({ mode: 'add', startStr: info.startStr, endStr: info.endStr, allDay: info.allDay, openerEl: calendarEl });
        calendar.unselect();
      },

      eventClick: async function (info) {
        let enrichedEvent = info?.event;
        let ownerOverride = null;
        // Always hydrate from schedule detail API so owner avatar is correct.
        try {
          const scheduleId = getScheduleIdFromEvent(info?.event);
          if (scheduleId) {
            const res = await apiGetSchedule(scheduleId);
            const item = res && res.item;
            if (item) {
              ownerOverride = item.owner || null;
              enrichedEvent = scheduleToEvent(item) || enrichedEvent;
            }
          }
        } catch (_) {
          // ignore
        }

        const canEdit = canCurrentUserEditEvent(enrichedEvent);
        openModal({ mode: canEdit ? 'edit' : 'view', event: enrichedEvent, ownerOverride, openerEl: info?.jsEvent?.target || calendarEl });
      },

      eventDrop: function (info) {
        if (!canCurrentUserEditEvent(info?.event)) {
          info.revert();
          return;
        }
        persistEventMutation(info);
      },

      eventResize: function (info) {
        if (!canCurrentUserEditEvent(info?.event)) {
          info.revert();
          return;
        }
        persistEventMutation(info);
      },

      datesSet: function () {
        setTimeout(() => refreshCalendarEvents(), 0);
      },

      eventReceive: function(info) {
        handleExternalEventCreate(info);
      }
    });

    calendarInstance = calendar;
    calendar.render();
    refreshCalendarEvents();

    // Ensure calendar resizes correctly when sidebar collapses/hides
    function debounce(fn, wait) {
      let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), wait); };
    }
    const refreshCalendarSize = debounce(() => {
      try { calendar.updateSize(); } catch (_) {}
    }, 80);

    // Window resize
    window.addEventListener('resize', refreshCalendarSize);
    // Observe sidebar class/style changes
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    if (sidebar) {
      const mo = new MutationObserver(refreshCalendarSize);
      mo.observe(sidebar, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    if (mainContent) {
      mainContent.addEventListener('transitionend', refreshCalendarSize);
      const mo2 = new MutationObserver(refreshCalendarSize);
      mo2.observe(mainContent, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    // ResizeObserver on the calendar container
    try {
      const container = calendarEl.closest('.calendar-container') || calendarEl.parentElement;
      if (container && window.ResizeObserver) {
        const ro = new ResizeObserver(refreshCalendarSize);
        ro.observe(container);
      }
    } catch (_) {}
    // Initial follow-up refreshes (handle restored sidebar state)
    setTimeout(refreshCalendarSize, 50);
    setTimeout(refreshCalendarSize, 200);

  const createBtn = document.getElementById('create-event-btn');
    if (createBtn) {
      createBtn.addEventListener('click', function () {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const dd = String(today.getDate()).padStart(2,'0');
  openModal({ mode: 'add', startStr: `${yyyy}-${mm}-${dd}`, endStr: null, allDay: true });
      });
    }

    // Modal actions
    btnSave?.addEventListener('click', async function (e) {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      if (modalCtx.mode === 'view') return;
      if (!modalCtx.allDay && !validateTimes()) {
        ensureEndAlignedWithStart({ forceOneHourGap: true });
      }
      let title = (inputName.value || '').trim();
      if (!title) { title = '새 일정'; }
      const type = selectType.value || '미팅';
      const location = (inputLocation.value || '').trim();
      const description = (inputDesc?.value || '').trim();
      const color = normalizePaletteColor((colorInput && colorInput.value) || DEFAULT_SCHEDULE_COLOR);
      const selectedMode = getShareModeValue();
      const payloadBase = {
        title,
        type,
        location,
        description,
        color,
        startSeed: modalCtx.startStr || getEventStartSeed(modalCtx.sourceEvent),
        endSeed: modalCtx.endStr || getEventEndSeed(modalCtx.sourceEvent),
        allDay: modalCtx.allDay,
        startTimeValue: inputStartTime.value,
        endTimeValue: inputEndTime.value,
        shareMode: selectedMode,
        shareUsers: modalCtx.shareUsersPayload || [],
        shareDepartments: modalCtx.shareDepartmentsPayload || [],
        attendees: [],
        reminders: reminderSelect && reminderSelect.value ? [reminderSelect.value] : [],
        sticker: '',
        isImportant: !!modalCtx.important,
        existingRepeatRule: modalCtx.sourceEvent?.extendedProps?.repeatRule || {},
      };
      let payload;
      try {
        payload = buildSchedulePayloadFromForm(payloadBase);
      } catch (buildErr) {
        alert(buildErr.message || '일정 정보를 해석하지 못했습니다.');
        return;
      }
      payload.color_code = color;
      try {
        setModalBusy(true);
        let saved = null;
        if (modalCtx.mode === 'add') {
          saved = await apiCreateSchedule(payload);
        } else if (modalCtx.mode === 'edit' && modalCtx.eventId) {
          saved = await apiUpdateSchedule(modalCtx.eventId, payload);
        }

        const scheduleId = saved?.item?.id || modalCtx.eventId;
        if (scheduleId && inputAttachments?.files && inputAttachments.files.length) {
          await apiUploadScheduleAttachments(scheduleId, inputAttachments.files);
          resetAttachments();
        }
        await refreshCalendarEvents();
        closeModal();
        setTimeout(() => closeModal(), 30);
      } catch (err) {
        console.error('Failed to persist schedule', err);
        alert(err.message || '일정 저장 중 오류가 발생했습니다.');
      } finally {
        setModalBusy(false);
      }
    });

    btnDelete?.addEventListener('click', async function () {
      const deleteId = modalCtx.eventId || getScheduleIdFromEvent(modalCtx.sourceEvent);
      if (!modalCtx.canDelete || !deleteId) return;
      const confirmed = await showCalConfirm('선택한 일정을 삭제하시겠습니까?', '일정 삭제');
      if (!confirmed) return;
      try {
        setModalBusy(true);
        await apiDeleteSchedule(deleteId);
        await refreshCalendarEvents();
        closeModal();
      } catch (err) {
        console.error('Failed to delete schedule', err);
        alert(err.message || '일정 삭제 중 오류가 발생했습니다.');
      } finally {
        setModalBusy(false);
      }
    });

    async function refreshCalendarEvents() {
      if (!calendar || isSyncing) return;
      isSyncing = true;
      setCalendarBusy(true);
      try {
        const events = await fetchVisibleSchedules();
        calendar.removeAllEvents();
        (events || []).forEach((evt) => {
          if (evt) {
            calendar.addEvent(evt);
          }
        });
      } catch (err) {
        console.error('Failed to fetch schedules', err);
      } finally {
        isSyncing = false;
        setCalendarBusy(false);
      }
    }

    function dateKeyFromDate(dateObj) {
      if (!dateObj || Number.isNaN(dateObj.getTime())) return '';
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    function parseDateKeyToDate(dateKey) {
      const parts = String(dateKey || '').split('-').map((part) => parseInt(part, 10));
      if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return new Date(NaN);
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function addDaysToDateKey(dateKey, days) {
      const date = parseDateKeyToDate(dateKey);
      if (Number.isNaN(date.getTime())) return dateKey;
      date.setDate(date.getDate() + Number(days || 0));
      return dateKeyFromDate(date);
    }

    function daysBetweenDateKeys(startKey, endKey) {
      const startDate = parseDateKeyToDate(startKey);
      const endDate = parseDateKeyToDate(endKey);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
      return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
    }

    function getCalendarVisibleRange() {
      try {
        const view = calendarInstance && calendarInstance.view;
        const activeStart = view && view.activeStart ? new Date(view.activeStart) : null;
        const activeEnd = view && view.activeEnd ? new Date(view.activeEnd) : null;
        if (!activeStart || !activeEnd) return null;
        const inclusiveEnd = new Date(activeEnd.getTime() - 1);
        return {
          startDate: activeStart,
          endDate: inclusiveEnd,
          startKey: dateKeyFromDate(activeStart),
          endKey: dateKeyFromDate(inclusiveEnd),
        };
      } catch (_) {
        return null;
      }
    }

    function scheduleItemRangeKeys(item) {
      const startDate = parseDateTimeInput(item?.start_datetime || item?.startDate || item?.start);
      const endDate = parseDateTimeInput(item?.end_datetime || item?.endDate || item?.end) || startDate;
      if (!startDate || !endDate) return null;
      return {
        startKey: dateKeyFromDate(startDate),
        endKey: dateKeyFromDate(endDate),
      };
    }

    function repeatExceptionSet(rule) {
      const values = (rule && (rule.exdates || rule.exceptionDates)) || [];
      return new Set(Array.isArray(values) ? values.map((value) => String(value || '').slice(0, 10)).filter(Boolean) : []);
    }

    function lastDayOfMonth(year, monthIndex) {
      return new Date(year, monthIndex + 1, 0).getDate();
    }

    function clampedMonthDate(baseDate, offsetMonths) {
      const totalMonth = baseDate.getMonth() + offsetMonths;
      const year = baseDate.getFullYear() + Math.floor(totalMonth / 12);
      const month = ((totalMonth % 12) + 12) % 12;
      const day = Math.min(baseDate.getDate(), lastDayOfMonth(year, month));
      return new Date(year, month, day);
    }

    function clampedYearDate(baseDate, offsetYears) {
      const year = baseDate.getFullYear() + offsetYears;
      const month = baseDate.getMonth();
      const day = Math.min(baseDate.getDate(), lastDayOfMonth(year, month));
      return new Date(year, month, day);
    }

    function buildOccurrenceScheduleItem(item, occurrenceKey, occurrenceIndex) {
      const baseStart = parseDateTimeInput(item?.start_datetime);
      const baseEnd = parseDateTimeInput(item?.end_datetime) || baseStart;
      const occurrenceDate = parseDateKeyToDate(occurrenceKey);
      if (!baseStart || !baseEnd || Number.isNaN(occurrenceDate.getTime())) return null;
      let occurrenceStart;
      let occurrenceEnd;
      if (item.is_all_day) {
        const range = scheduleItemRangeKeys(item);
        const spanDays = range ? Math.max(1, daysBetweenDateKeys(range.startKey, range.endKey) + 1) : 1;
        occurrenceStart = new Date(occurrenceDate.getFullYear(), occurrenceDate.getMonth(), occurrenceDate.getDate(), 0, 0, 0, 0);
        occurrenceEnd = new Date(occurrenceDate.getFullYear(), occurrenceDate.getMonth(), occurrenceDate.getDate() + spanDays - 1, 23, 59, 59, 0);
      } else {
        occurrenceStart = new Date(
          occurrenceDate.getFullYear(), occurrenceDate.getMonth(), occurrenceDate.getDate(),
          baseStart.getHours(), baseStart.getMinutes(), baseStart.getSeconds(), 0
        );
        occurrenceEnd = new Date(occurrenceStart.getTime() + Math.max(baseEnd.getTime() - baseStart.getTime(), HOUR_IN_MS));
      }
      return {
        ...item,
        start_datetime: toLocalIsoString(occurrenceStart),
        end_datetime: toLocalIsoString(occurrenceEnd),
        __repeatInstance: true,
        __repeatMasterId: item.id,
        __repeatOccurrenceDate: occurrenceKey,
        __repeatOccurrenceStart: toLocalIsoString(occurrenceStart),
        __repeatOccurrenceEnd: toLocalIsoString(occurrenceEnd),
        __repeatIndex: occurrenceIndex,
      };
    }

    function occurrenceOverlapsVisible(item, visible) {
      const range = scheduleItemRangeKeys(item);
      if (!range || !visible) return true;
      return range.startKey <= visible.endKey && range.endKey >= visible.startKey;
    }

    function shouldStopRepeat(rule, occurrenceKey, producedCount, visibleEndKey) {
      const endType = repeatRuleEndType(rule);
      const untilKey = repeatRuleUntil(rule);
      const count = repeatRuleCount(rule);
      if (endType === 'until' && untilKey && occurrenceKey > untilKey) return true;
      if (endType === 'count' && count && producedCount >= count) return true;
      return endType !== 'count' && !untilKey && occurrenceKey > visibleEndKey;
    }

    function expandRecurringScheduleItem(item, visible) {
      const repeatType = normalizeRepeatType(item?.repeat_type || item?.repeatType || 'none');
      if (repeatType === 'none' || !visible) return [item];
      const baseRange = scheduleItemRangeKeys(item);
      if (!baseRange) return [];
      const baseStart = parseDateKeyToDate(baseRange.startKey);
      if (Number.isNaN(baseStart.getTime())) return [];
      const rule = normalizeRepeatRule(item.repeat_rule || item.repeatRule || {});
      const frequency = repeatRuleFrequency(repeatType, rule);
      const interval = repeatRuleInterval(rule);
      const exceptions = repeatExceptionSet(rule);
      const untilKey = repeatRuleUntil(rule);
      const loopEndKey = untilKey && untilKey < visible.endKey ? untilKey : visible.endKey;
      const occurrences = [];
      let producedCount = 0;
      let guard = 0;

      function maybeAdd(occurrenceKey) {
        if (shouldStopRepeat(rule, occurrenceKey, producedCount, visible.endKey)) return false;
        producedCount += 1;
        if (!exceptions.has(occurrenceKey)) {
          const occurrence = buildOccurrenceScheduleItem(item, occurrenceKey, producedCount - 1);
          if (occurrence && occurrenceOverlapsVisible(occurrence, visible)) {
            occurrences.push(occurrence);
          }
        }
        return true;
      }

      if (frequency === 'daily') {
        const cursor = new Date(baseStart);
        while (guard++ < 20000) {
          const occurrenceKey = dateKeyFromDate(cursor);
          if (!maybeAdd(occurrenceKey)) break;
          if (repeatRuleEndType(rule) !== 'count' && occurrenceKey > loopEndKey) break;
          cursor.setDate(cursor.getDate() + interval);
        }
        return occurrences;
      }

      if (frequency === 'weekly') {
        const ruleDays = Array.isArray(rule.daysOfWeek) ? rule.daysOfWeek : (Array.isArray(rule.days_of_week) ? rule.days_of_week : []);
        const selectedDays = ruleDays.length
          ? ruleDays.map((day) => String(day).toUpperCase())
          : [CAL_REPEAT_WEEKDAYS[baseStart.getDay()]];
        const cursor = new Date(baseStart);
        while (guard++ < 20000) {
          const occurrenceKey = dateKeyFromDate(cursor);
          const dayDiff = daysBetweenDateKeys(baseRange.startKey, occurrenceKey);
          const weekOffset = Math.floor(dayDiff / 7);
          if (dayDiff >= 0 && weekOffset % interval === 0 && selectedDays.includes(CAL_REPEAT_WEEKDAYS[cursor.getDay()])) {
            if (!maybeAdd(occurrenceKey)) break;
          }
          if (repeatRuleEndType(rule) !== 'count' && occurrenceKey > loopEndKey) break;
          cursor.setDate(cursor.getDate() + 1);
        }
        return occurrences;
      }

      if (frequency === 'monthly' || frequency === 'yearly') {
        let index = 0;
        while (guard++ < 20000) {
          const occurrenceDate = frequency === 'monthly'
            ? clampedMonthDate(baseStart, index * interval)
            : clampedYearDate(baseStart, index * interval);
          const occurrenceKey = dateKeyFromDate(occurrenceDate);
          if (!maybeAdd(occurrenceKey)) break;
          if (repeatRuleEndType(rule) !== 'count' && occurrenceKey > loopEndKey) break;
          index += 1;
        }
        return occurrences;
      }

      return [item];
    }

    async function fetchVisibleSchedules() {
      const visible = getCalendarVisibleRange();
      const params = { limit: DEFAULT_FETCH_LIMIT };
      if (visible && visible.startKey && visible.endKey) {
        params.start = `${visible.startKey}T00:00:00`;
        params.end = `${visible.endKey}T23:59:59`;
      }
      const res = await apiGetSchedules(params);
      if (!res || res.success === false || !Array.isArray(res.items)) {
        return [];
      }
      return (res.items || [])
        .reduce((items, item) => items.concat(expandRecurringScheduleItem(item, visible)), [])
        .map(scheduleToEvent)
        .filter(Boolean);
    }

    function scheduleToEvent(item) {
      if (!item) return null;
      const shareMode = shareScopeToMode(item.share_scope);
      const color = item.color_code || DEFAULT_SCHEDULE_COLOR;
      const currentId = getCurrentProfileId();
      const ownerId = Number(item.owner_user_id);
      const isOwner = currentId && ownerId && currentId === ownerId;
      const viewerCanEdit = !!(item.viewer_can_edit || isOwner);
      const viewerCanDelete = !!(item.viewer_can_delete || isOwner);
      const isRepeatInstance = !!item.__repeatInstance;
      const eventId = isRepeatInstance ? `${String(item.id)}::${String(item.__repeatOccurrenceDate || '')}` : String(item.id);
      return {
        id: eventId,
        title: item.title,
        start: item.start_datetime,
        end: item.end_datetime,
        startStr: item.start_datetime,
        endStr: item.end_datetime,
        allDay: !!item.is_all_day,
        backgroundColor: color,
        borderColor: color,
        editable: viewerCanEdit && !isRepeatInstance,
        startEditable: viewerCanEdit && !isRepeatInstance,
        durationEditable: viewerCanEdit && !isRepeatInstance,
        extendedProps: {
          type: item.event_type,
          shareMode,
          shareScope: item.share_scope,
          shareUsers: item.share_users || [],
          shareDepartments: item.share_departments || [],
          location: item.location || '',
          description: item.description || '',
          attendees: Array.isArray(item.attendees) ? item.attendees : [],
          reminders: Array.isArray(item.reminders) ? item.reminders : [],
          sticker: item.sticker || '',
          isImportant: !!item.is_important,
          attachments: Array.isArray(item.attachments) ? item.attachments : [],
          ownerUserId: item.owner_user_id || null,
          owner: item.owner || null,
          viewerCanEdit,
          viewerCanDelete,
          scheduleId: item.id,
          repeatType: normalizeRepeatType(item.repeat_type || item.repeatType || 'none'),
          repeatRule: normalizeRepeatRule(item.repeat_rule || item.repeatRule || {}),
          repeatInstance: isRepeatInstance,
          repeatMasterId: item.__repeatMasterId || item.id,
          repeatOccurrenceDate: item.__repeatOccurrenceDate || '',
          repeatOccurrenceStart: item.__repeatOccurrenceStart || '',
          repeatOccurrenceEnd: item.__repeatOccurrenceEnd || '',
        },
      };
    }

    async function hydrateEventForModal(fcEvent) {
      const scheduleId = getScheduleIdFromEvent(fcEvent);
      if (!fcEvent || !scheduleId) return fcEvent;
      const existingOwner = fcEvent.extendedProps?.owner;
      const existingImage = existingOwner && (existingOwner.profile_image || existingOwner.profileImage)
        ? String(existingOwner.profile_image || existingOwner.profileImage).trim()
        : '';
      if (existingOwner && existingImage) {
        return fcEvent;
      }
      try {
        const res = await apiGetSchedule(scheduleId);
        const item = res && res.item;
        const hydrated = scheduleToEvent(item);
        return hydrated || fcEvent;
      } catch (_) {
        return fcEvent;
      }
    }

    async function persistEventMutation(info) {
      if (!info || !info.event) return;
      try {
        setCalendarBusy(true);
        const scheduleId = getScheduleIdFromEvent(info.event);
        const payload = buildPayloadFromCalendarEvent(info.event);
        await apiUpdateSchedule(scheduleId, payload);
        await refreshCalendarEvents();
      } catch (err) {
        console.error('Failed to update schedule', err);
        info.revert();
        alert(err.message || '일정 변경 중 오류가 발생했습니다.');
      } finally {
        setCalendarBusy(false);
      }
    }

    async function handleExternalEventCreate(info) {
      if (!info || !info.event) return;
      const ev = info.event;
      if (!ev.id) ev.setProp('id', uuid());
      const cat = info.draggedEl?.getAttribute('data-category');
      const mappedType = cat === 'success' ? '작업'
                        : cat === 'warning' ? '점검'
                        : cat === 'danger' ? '휴가'
                        : '미팅';
      ev.setExtendedProp('type', mappedType);
      const color = ev.backgroundColor || info.draggedEl?.getAttribute('data-color') || DEFAULT_SCHEDULE_COLOR;
      ev.setProp('backgroundColor', color);
      ev.setProp('borderColor', color);
      try {
        setCalendarBusy(true);
        const payload = buildPayloadFromCalendarEvent(ev, { type: mappedType, color });
        await apiCreateSchedule(payload);
        await refreshCalendarEvents();
      } catch (err) {
        console.error('Failed to create schedule from external drop', err);
        ev.remove();
        alert(err.message || '일정 생성 중 오류가 발생했습니다.');
      } finally {
        setCalendarBusy(false);
      }
    }

    function buildPayloadFromCalendarEvent(fcEvent, overrides) {
      if (!fcEvent) throw new Error('이벤트 정보를 확인할 수 없습니다.');
      let startIso;
      let endIso;
      if (fcEvent.allDay) {
        const range = getAllDayRangeFromEvent(fcEvent);
        startIso = range.start;
        endIso = range.end;
      } else {
        startIso = toLocalIsoString(fcEvent.start);
        endIso = fcEvent.end ? toLocalIsoString(fcEvent.end) : startIso;
      }
      if (!startIso || !endIso) throw new Error('일정 시간을 확인할 수 없습니다.');
      const shareMode = overrides?.shareMode || fcEvent.extendedProps?.shareMode || 'all';
      const shareUsers = overrides?.shareUsers || fcEvent.extendedProps?.shareUsers || [];
      const shareDepartments = overrides?.shareDepartments || fcEvent.extendedProps?.shareDepartments || [];
      return {
        title: fcEvent.title || '새 일정',
        start_datetime: startIso,
        end_datetime: endIso,
        is_all_day: !!fcEvent.allDay,
        location: overrides?.location ?? fcEvent.extendedProps?.location ?? '',
        event_type: overrides?.type || fcEvent.extendedProps?.type || '기타',
        description: overrides?.description ?? fcEvent.extendedProps?.description ?? '',
        share_scope: shareModeToScope(shareMode),
        share_users: shareModeToScope(shareMode) === 'SELECT' ? shareUsers : [],
        share_departments: shareModeToScope(shareMode) === 'SELECT' ? shareDepartments : [],
        attendees: overrides?.attendees || fcEvent.extendedProps?.attendees || [],
        reminders: overrides?.reminders || fcEvent.extendedProps?.reminders || [],
        sticker: overrides?.sticker ?? fcEvent.extendedProps?.sticker ?? '',
        is_important: !!(overrides?.isImportant ?? fcEvent.extendedProps?.isImportant),
        color_code: overrides?.color || fcEvent.backgroundColor || null,
        repeat_type: overrides?.repeatType || fcEvent.extendedProps?.repeatType || 'none',
        repeat_rule: overrides?.repeatRule || fcEvent.extendedProps?.repeatRule || {},
      };
    }

    function getEventStartSeed(event) {
      if (!event) return null;
      if (event.startStr) return event.startStr;
      if (event.start) return event.start.toISOString();
      return null;
    }

    function getEventEndSeed(event) {
      if (!event) return null;
      if (event.endStr) return event.endStr;
      if (event.end) return event.end.toISOString();
      return null;
    }

    function buildSchedulePayloadFromForm(options) {
      const range = resolveDateTimes({
        startSeed: options.startSeed,
        endSeed: options.endSeed,
        allDay: options.allDay,
        startTimeValue: options.startTimeValue,
        endTimeValue: options.endTimeValue,
      });
      if (!range.start || !range.end) {
        throw new Error('시작/종료 시간을 확인할 수 없습니다.');
      }
      const shareScope = shareModeToScope(options.shareMode);
      const repeatPayload = buildRepeatPayloadFromForm(options.startTimeValue, options.existingRepeatRule || {});
      return {
        title: options.title,
        start_datetime: range.start,
        end_datetime: range.end,
        is_all_day: !!options.allDay,
        location: options.location || null,
        event_type: options.type || '기타',
        description: options.description || null,
        share_scope: shareScope,
        share_users: shareScope === 'SELECT' ? (options.shareUsers || []) : [],
        share_departments: shareScope === 'SELECT' ? (options.shareDepartments || []) : [],
        attendees: options.attendees || [],
        reminders: options.reminders || [],
        sticker: options.sticker || '',
        is_important: !!options.isImportant,
        color_code: options.color || null,
        repeat_type: repeatPayload.repeat_type,
        repeat_rule: repeatPayload.repeat_rule,
      };
    }

    function resolveDateTimes({ startSeed, endSeed, allDay, startTimeValue, endTimeValue }) {
      const now = new Date();
      const startFromInput = parseDateTimeInput(startTimeValue);
      const endFromInput = parseDateTimeInput(endTimeValue);
      const startFromSeed = parseDateTimeInput(startSeed);
      const endFromSeed = parseDateTimeInput(endSeed);
      let startDate = startFromInput || startFromSeed || now;
      let endDate = endFromInput || endFromSeed || (startFromInput ? new Date(startFromInput.getTime() + HOUR_IN_MS) : new Date(startDate.getTime() + HOUR_IN_MS));
      if (endDate.getTime() < startDate.getTime()) {
        endDate = new Date(startDate.getTime());
      }
      if (allDay) {
        const startPart = toDatePartString(startDate);
        const endPart = toDatePartString(endDate);
        return {
          start: `${startPart}T00:00:00`,
          end: `${endPart}T23:59:59`,
        };
      }
      return {
        start: toLocalIsoString(startDate),
        end: toLocalIsoString(endDate),
      };
    }

    function formatDateTimeInput(dateObj) {
      if (!dateObj) return '';
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const hours = String(dateObj.getHours()).padStart(2, '0');
      const minutes = String(dateObj.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    }

    function parseDateTimeInput(value) {
      if (value instanceof Date) {
        return new Date(value.getTime());
      }
      if (value == null) return null;
      const str = String(value).trim();
      if (!str) return null;
      const simple = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
      if (simple) {
        const year = parseInt(simple[1], 10);
        const month = parseInt(simple[2], 10) - 1;
        const day = parseInt(simple[3], 10);
        const hours = simple[4] != null ? parseInt(simple[4], 10) : 0;
        const minutes = simple[5] != null ? parseInt(simple[5], 10) : 0;
        const seconds = simple[6] != null ? parseInt(simple[6], 10) : 0;
        if (hours > 23 || minutes > 59 || seconds > 59) return null;
        return new Date(year, month, day, hours, minutes, seconds, 0);
      }
      const parsed = new Date(str);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function parseTimeParts(token, fallback = '00:00') {
      const target = (token || fallback || '00:00').toString();
      const match = target.match(/^(\d{1,2}):(\d{2})$/);
      if (!match) return { hours: 0, minutes: 0 };
      const hours = Math.min(23, parseInt(match[1], 10));
      const minutes = Math.min(59, parseInt(match[2], 10));
      return { hours, minutes };
    }

    function hasTimeComponent(value) {
      if (value instanceof Date) return true;
      if (value == null) return false;
      return /(\d{1,2}):(\d{2})/.test(String(value));
    }

    function resolveDateTimeSeed(seed, isAllDay, fallbackTime, referenceDate) {
      const parsedSeed = parseDateTimeInput(seed);
      if (parsedSeed) {
        if (!isAllDay && typeof seed === 'string' && !hasTimeComponent(seed) && fallbackTime) {
          const { hours, minutes } = parseTimeParts(fallbackTime);
          parsedSeed.setHours(hours, minutes, 0, 0);
        }
        return parsedSeed;
      }
      const base = referenceDate instanceof Date ? new Date(referenceDate.getTime()) : new Date();
      if (isAllDay) {
        base.setHours(0, 0, 0, 0);
      } else {
        const { hours, minutes } = parseTimeParts(fallbackTime || DEFAULT_START_TIME);
        base.setHours(hours, minutes, 0, 0);
      }
      return base;
    }

    // Close modal with Escape (반복 서브 모달이 열려 있으면 우선 닫기)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isRepeatModalVisible()) {
        e.preventDefault();
        closeRepeatModal({ restore: true });
        return;
      }
      const visible = modal && modal.style.display === 'block';
      if (visible && e.key === 'Escape') closeModal();
    });
  });

  function toLocalIsoString(dateObj) {
    if (!dateObj) return null;
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const seconds = String(dateObj.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }

  function toDatePartString(dateObj) {
    if (!dateObj) return null;
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getAllDayRangeFromEvent(fcEvent) {
    const startDate = toDatePartString(fcEvent?.start) || toDatePartString(new Date());
    let endAnchor = fcEvent?.end ? new Date(fcEvent.end.getTime() - 1000) : fcEvent?.start;
    if (!endAnchor) {
      endAnchor = fcEvent?.start || new Date();
    }
    const endDate = toDatePartString(endAnchor) || startDate;
    return {
      start: `${startDate}T00:00:00`,
      end: `${endDate}T23:59:59`,
    };
  }

  function toTime(dateObj) {
    const hh = String(dateObj.getHours()).padStart(2, '0');
    const mm = String(dateObj.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function setCalendarBusy(flag) {
    if (!calendarContainerEl) return;
    if (flag) {
      calendarContainerEl.classList.add('is-loading');
    } else {
      calendarContainerEl.classList.remove('is-loading');
    }
  }

  function setModalBusy(flag) {
    if (modalButtons.save) modalButtons.save.disabled = !!flag;
    if (modalButtons.delete) modalButtons.delete.disabled = !!flag;
  }
})();
