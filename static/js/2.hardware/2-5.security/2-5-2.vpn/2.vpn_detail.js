// vpn_detail.js: VPN detail shared behaviors (basic info + edit modal + context)
// Tab behaviors are handled by /static/js/_detail/tabXX-*.js included per tab template.

(function () {
  // Early: apply saved sidebar state to reduce flash
  try {
    document.documentElement.classList.add('sidebar-preload');
    var state = localStorage.getItem('sidebarState');
    var style = document.createElement('style');
    if (state === 'collapsed') {
      style.innerHTML = '.sidebar{width:70px !important} .main-content{margin-left:70px !important}';
    } else if (state === 'hidden') {
      style.innerHTML = '.sidebar{transform:translateX(-100%) !important;width:260px !important} .main-content{margin-left:0 !important}';
    } else {
      style.innerHTML = '';
    }
    try {
      if (document.head) document.head.appendChild(style);
    } catch (_e) {}
  } catch (_e2) {}

  function __detailMain() {
    // Mark page-size selects as chosen after interaction (used by some shared CSS)
    (function () {
      function wireChosen(id) {
        var sel = document.getElementById(id);
        if (!sel) return;
        function apply() {
          if (sel.value) sel.classList.add('is-chosen');
        }
        sel.addEventListener('change', apply);
        apply();
      }
      [
        'lg-page-size',
        'hw-page-size',
        'sw-page-size',
        'bk-page-size',
        'if-page-size',
        'am-page-size',
        'au-page-size',
        'ac-page-size',
        'fw-page-size',
        'st-page-size',
        'tk-page-size',
        'vl-page-size',
        'pk-page-size',
        'mt-page-size',
        'asg-page-size',
      ].forEach(wireChosen);
    })();

    // Edit modal wiring IDs
    var EDIT_MODAL_ID = 'system-edit-modal';
    var EDIT_FORM_ID = 'system-edit-form';
    var EDIT_OPEN_ID = 'detail-edit-open';
    var EDIT_CLOSE_ID = 'system-edit-close';
    var EDIT_SAVE_ID = 'system-edit-save';

    // Detail context
    var STORAGE_PREFIX =
      typeof window !== 'undefined' && window.STORAGE_PREFIX
        ? String(window.STORAGE_PREFIX)
        : 'vpn';
    try {
      if (!window.STORAGE_PREFIX) window.STORAGE_PREFIX = STORAGE_PREFIX;
    } catch (_e0) {}

    var API_ENDPOINT = '/api/hardware/security/vpn/assets';
    var DEVICE_TYPE_TOKEN = 'VPN';
    var DEFAULT_TITLE = 'VPN';

    var masterCache = null;
    var currentAssetId = null;
    var currentAssetItem = null;

    var FIELD_TO_PAYLOAD_KEY = {
      work_type: 'work_type',
      work_category: 'work_category',
      work_status: 'work_status',
      work_operation: 'work_operation',
      work_group: 'work_group',
      work_name: 'work_name',
      system_name: 'system_name',
      system_ip: 'system_ip',
      manage_ip: 'mgmt_ip',
      vendor: 'vendor',
      model: 'model',
      serial: 'serial_number',
      virtualization: 'virtualization_type',
      location_place: 'center_code',
      location_pos: 'rack_code',
      slot: 'system_slot',
      u_size: 'system_size',
      rack_face: 'rack_face',
      sys_dept: 'system_department',
      sys_owner: 'system_owner',
      svc_dept: 'service_department',
      svc_owner: 'service_owner',
      confidentiality: 'cia_confidentiality',
      integrity: 'cia_integrity',
      availability: 'cia_availability',
      security_score: 'security_score',
      system_grade: 'system_grade',
      core_flag: 'core_flag',
      dr_built: 'dr_built',
      svc_redundancy: 'svc_redundancy',
    };

    var NUMERIC_PAYLOAD_KEYS = new Set([
      'cia_confidentiality',
      'cia_integrity',
      'cia_availability',
      'security_score',
      'system_slot',
      'system_size',
    ]);

    function notify(msg, type) {
      var t = String(type || '').toLowerCase();
      if (t !== 'error') return;
      try {
        if (window.BlUI && typeof window.BlUI.toast === 'function') {
          window.BlUI.toast(String(msg || ''), { variant: 'danger' });
          return;
        }
      } catch (_e0) {}
      try {
        alert(String(msg || ''));
      } catch (_e1) {}
    }

    function safeInt(v) {
      var n = parseInt(String(v == null ? '' : v), 10);
      return !isNaN(n) && n > 0 ? n : null;
    }

    function getStoredSelectedRow() {
      var raw = null;
      try {
        raw = sessionStorage.getItem(STORAGE_PREFIX + ':selected:row');
      } catch (_e0) {
        raw = null;
      }
      if (!raw) {
        try {
          raw = localStorage.getItem(STORAGE_PREFIX + ':selected:row');
        } catch (_e1) {
          raw = null;
        }
      }
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (_e2) {
        return null;
      }
    }

    function resolveAssetId() {
      // 1) query
      try {
        var qs = new URLSearchParams(location.search || '');
        var qid = safeInt(qs.get('hardware_id') || qs.get('hardwareId') || qs.get('asset_id') || qs.get('assetId') || qs.get('id'));
        if (qid) return qid;
      } catch (_e) {}

      // 2) template injected
      try {
        var injected = safeInt(window.__VPN_SELECTED_ASSET_ID__);
        if (injected) return injected;
      } catch (_e2) {}

      // 3) stored id
      try {
        var sid = safeInt(sessionStorage.getItem(STORAGE_PREFIX + ':selected:asset_id'));
        if (sid) return sid;
      } catch (_e3) {}
      try {
        var lid = safeInt(localStorage.getItem(STORAGE_PREFIX + ':selected:asset_id'));
        if (lid) return lid;
      } catch (_e4) {}

      // 4) stored row
      var row = getStoredSelectedRow();
      var rid = row ? safeInt(row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id)) : null;
      return rid;
    }

    function stripAssetIdFromUrl() {
      try {
        var u = new URL(window.location.href);
        var changed = false;
        ['asset_id', 'assetId', 'id'].forEach(function (k) {
          if (u.searchParams.has(k)) {
            u.searchParams.delete(k);
            changed = true;
          }
        });
        if (!changed) return;
        history.replaceState(null, document.title, u.pathname + (u.search || '') + (u.hash || ''));
      } catch (_e) {}
    }

    function decorateTabLinksWithAssetId(assetId) {
      if (!assetId) return;
      try {
        var tabs = document.querySelectorAll('.server-detail-tabs a');
        if (!tabs || !tabs.length) return;
        Array.prototype.forEach.call(tabs, function (a) {
          try {
            var href = a.getAttribute('href') || '';
            if (!href || href.indexOf('javascript:') === 0) return;
            var u = new URL(href, window.location.origin);
            u.searchParams.set('asset_id', String(assetId));
            a.setAttribute('href', u.pathname + (u.search || ''));
          } catch (_e0) {}
        });
      } catch (_e1) {}
    }

    function apiJSON(url, options) {
      var opt = options || {};
      opt.headers = opt.headers || {};
      if (!opt.headers['Content-Type'] && opt.method && opt.method !== 'GET') {
        opt.headers['Content-Type'] = 'application/json';
      }
      return fetch(url, opt).then(function (res) {
        return res
          .json()
          .catch(function () {
            return null;
          })
          .then(function (data) {
            if (!res.ok) {
              var msg = (data && (data.message || data.error)) || res.statusText || 'Request failed';
              var err = new Error(msg);
              try {
                err.status = res.status;
                err.url = url;
                err.body = data;
              } catch (_e0) {}
              throw err;
            }
            return data;
          });
      });
    }

    function _setHeader(work, system) {
      try {
        var titleEl = document.getElementById('page-title');
        var subEl = document.getElementById('page-subtitle');
        var w = String(work == null ? '' : work).trim();
        var s = String(system == null ? '' : system).trim();
        if (titleEl && w) titleEl.textContent = w;
        if (subEl && s) subEl.textContent = s;
      } catch (_e0) {}
    }

    function _headerLooksEmpty() {
      function norm(v) {
        var s = String(v == null ? '' : v).trim();
        if (!s || s === '-' || s === '—') return '';
        return s;
      }
      try {
        var titleEl = document.getElementById('page-title');
        var subEl = document.getElementById('page-subtitle');
        return !(norm(titleEl ? titleEl.textContent : '') && norm(subEl ? subEl.textContent : ''));
      } catch (_e0) {
        return true;
      }
    }

    function _applyHeaderFromKnownContext() {
      // Prefer server-injected prefill, then stored row.
      try {
        var pre = window.__VPN_ASSET_PREFILL__;
        if (pre && typeof pre === 'object') {
          _setHeader(pre.work_name || pre.workName, pre.system_name || pre.systemName);
        }
      } catch (_e0) {}

      if (!_headerLooksEmpty()) return;

      try {
        var row = getStoredSelectedRow();
        if (row && typeof row === 'object') {
          _setHeader(row.work_name || row.workName, row.system_name || row.systemName);
        }
      } catch (_e1) {}
    }

    function escapeHTML(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function mergeWithDisplayFallback(apiItem, storedRow) {
      if (!storedRow || typeof storedRow !== 'object') return apiItem;
      if (!apiItem || typeof apiItem !== 'object') return storedRow;
      var merged = {};
      Object.keys(storedRow).forEach(function (k) {
        merged[k] = storedRow[k];
      });
      Object.keys(apiItem).forEach(function (k) {
        var apiVal = apiItem[k];
        var storedVal = merged[k];
        var apiStr = String(apiVal == null ? '' : apiVal).trim();
        var storedStr = String(storedVal == null ? '' : storedVal).trim();
        var apiMeaningful = apiVal != null && apiStr !== '' && apiStr !== '-';
        var storedMeaningful = storedVal != null && storedStr !== '' && storedStr !== '-';
        if (apiMeaningful || !storedMeaningful) merged[k] = apiVal;
      });
      return merged;
    }

    async function ensureMasters() {
      if (masterCache) return masterCache;
      var endpoints = {
        workCategories: '/api/work-categories',
        workDivisions: '/api/work-divisions',
        workStatuses: '/api/work-statuses',
        workOperations: '/api/work-operations',
        workGroups: '/api/work-groups',
        vendors: '/api/vendor-manufacturers',
        serverModels: '/api/hw-server-types',
        securityModels: '/api/hw-security-types',
        centers: '/api/org-centers',
        racks: '/api/org-racks',
        depts: '/api/org-departments',
        users: '/api/user-profiles',
      };
      var results = await Promise.all(
        Object.keys(endpoints).map(async function (k) {
          try {
            var data = await apiJSON(endpoints[k], { method: 'GET' });
            return [k, data.items || []];
          } catch (_e) {
            return [k, []];
          }
        })
      );
      masterCache = {};
      results.forEach(function (pair) {
        masterCache[pair[0]] = pair[1];
      });

      // Build device model list (prefer hw_server_type; fallback to hw_security_type)
      try {
        var server = (masterCache.serverModels || []).filter(function (it) {
          return String(it.form_factor || it.hw_type || it.type || '')
            .trim()
            .toUpperCase() === DEVICE_TYPE_TOKEN;
        });
        if (server.length) {
          masterCache.models = server.map(function (it) {
            return {
              server_code: it.server_code,
              model_name: it.model_name,
              manufacturer_code: it.manufacturer_code,
              form_factor: it.form_factor,
            };
          });
        } else {
          var sec = (masterCache.securityModels || []).filter(function (it) {
            return String(it.security_type || it.hw_type || it.type || '')
              .trim()
              .toUpperCase() === DEVICE_TYPE_TOKEN;
          });
          masterCache.models = sec.map(function (it) {
            return {
              server_code: it.security_code,
              model_name: it.model_name,
              manufacturer_code: it.manufacturer_code,
              form_factor: it.security_type,
            };
          });
        }
      } catch (_e2) {
        masterCache.models = [];
      }

      // Build quick lookup maps for display rendering (code -> name)
      (function () {
        function s(v) {
          return v == null ? '' : String(v).trim();
        }
        function pickName(it, keys) {
          if (!it || !keys) return '';
          for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var v = s(it[k]);
            if (v) return v;
          }
          return '';
        }
        function build(items, codeKey, nameKeys) {
          var map = new Map();
          (Array.isArray(items) ? items : []).forEach(function (it) {
            var code = s(it && it[codeKey]);
            if (!code) return;
            var name = pickName(it, nameKeys);
            map.set(code, name || code);
          });
          return map;
        }

        masterCache.lookup = {
          workTypeByCode: build(masterCache.workCategories, 'category_code', ['wc_name', 'category_name', 'category_code']),
          workCategoryByCode: build(masterCache.workDivisions, 'division_code', ['wc_name', 'division_name', 'division_code']),
          workStatusByCode: build(masterCache.workStatuses, 'status_code', ['wc_name', 'status_name', 'status_code']),
          workOperationByCode: build(masterCache.workOperations, 'operation_code', ['wc_name', 'operation_name', 'operation_code']),
          workGroupByCode: build(masterCache.workGroups, 'group_code', ['group_name', 'wc_name', 'group_code']),
          vendorByCode: build(masterCache.vendors, 'manufacturer_code', ['manufacturer_name', 'manufacturer_code']),
          modelByCode: build(masterCache.models, 'server_code', ['model_name', 'server_code']),
          centerByCode: build(masterCache.centers, 'center_code', ['center_name', 'center_code']),
          rackByCode: build(masterCache.racks, 'rack_code', ['rack_name', 'rack_position', 'rack_code']),
          deptByCode: build(masterCache.depts, 'dept_code', ['dept_name', 'dept_code']),
          userByEmpNo: build(masterCache.users, 'emp_no', ['name', 'emp_no']),
        };
      })();

      return masterCache;
    }

    function applyAssetItemToPage(item) {
      if (!item) return;

      // Ensure master dictionaries are available; re-apply once loaded.
      if (!masterCache) {
        ensureMasters()
          .then(function () {
            try {
              applyAssetItemToPage(item);
            } catch (_e0) {}
          })
          .catch(function () {});
      }

      function pick(obj, keys) {
        if (!obj) return '';
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
          if (obj[k] == null) continue;
          var s = String(obj[k]).trim();
          if (s === '' || s === '-') continue;
          return obj[k];
        }
        return '';
      }

      function normalizeCoreFlag(v) {
        if (v == null) return '-';
        var s = String(v).trim();
        if (!s) return '-';
        if (s === '1' || s.toLowerCase() === 'true' || s === 'Y') return '핵심';
        if (s === '0' || s.toLowerCase() === 'false' || s === 'N') return '일반';
        return s;
      }

      function normalizeOX(v) {
        if (v == null) return '-';
        var s = String(v).trim().toUpperCase();
        if (!s) return '-';
        if (s === 'O' || s === 'X') return s;
        if (s === '1' || s === 'TRUE' || s === 'Y') return 'O';
        if (s === '0' || s === 'FALSE' || s === 'N') return 'X';
        return '-';
      }

      function setInfoRowValue(cardIdx, rowIdx, value) {
        var row = document.querySelector('.basic-info-card:nth-child(' + cardIdx + ') .info-row:nth-child(' + rowIdx + ')');
        if (!row) return;
        var host =
          row.querySelector('.status-pill') ||
          row.querySelector('.cell-num') ||
          row.querySelector('.cell-ox') ||
          row.querySelector('.info-value') ||
          row.querySelector('.info-value') ||
          row.querySelector('.num-badge') ||
          row.querySelector('.ox-badge');
        if (!host) {
          try {
            var children = row.children || [];
            for (var ci = 0; ci < children.length; ci++) {
              var ch = children[ci];
              if (!ch) continue;
              if (String(ch.tagName || '').toUpperCase() === 'LABEL') continue;
              host = ch;
              break;
            }
          } catch (_e0) {}
        }
        if (!host) return;
        var s = String(value == null ? '' : value).trim();
        if (host.classList && host.classList.contains('status-pill')) {
          var txtEl = host.querySelector('.status-text');
          if (txtEl) txtEl.textContent = s ? s : '-';
          else host.textContent = s ? s : '-';
          return;
        }
        host.textContent = s ? s : '-';
      }

      function setNumBadge(cardIdx, rowIdx, value, kind) {
        var row = document.querySelector('.basic-info-card:nth-child(' + cardIdx + ') .info-row:nth-child(' + rowIdx + ')');
        if (!row) return;
        var badge = row.querySelector('.num-badge');
        if (!badge) return;
        var raw = String(value == null ? '' : value).trim();
        badge.textContent = raw ? raw : '-';
        try {
          badge.classList.remove('tone-1', 'tone-2', 'tone-3');
        } catch (_e0) {}
        var n = parseInt(raw, 10);
        if (!isNaN(n)) {
          var tone = 'tone-1';
          if (kind === 'security_score') tone = n >= 8 ? 'tone-3' : n >= 6 ? 'tone-2' : 'tone-1';
          else tone = n >= 3 ? 'tone-3' : n === 2 ? 'tone-2' : 'tone-1';
          try {
            badge.classList.add(tone);
          } catch (_e1) {}
        } else {
          try {
            badge.classList.add('tone-1');
          } catch (_e2) {}
        }
      }

      function setOxBadge(cardIdx, rowIdx, value) {
        var row = document.querySelector('.basic-info-card:nth-child(' + cardIdx + ') .info-row:nth-child(' + rowIdx + ')');
        if (!row) return;
        var ox = row.querySelector('.ox-badge');
        if (!ox) return;
        var vv = String(value == null ? '' : value).trim();
        var upper = vv.toUpperCase();
        if (upper === 'TRUE') vv = 'O';
        if (upper === 'FALSE') vv = 'X';
        if (vv === '—' || vv === '-') vv = '';
        var mark = '';
        if (vv) mark = vv === 'X' ? 'X' : 'O';
        try {
          ox.classList.remove('on', 'off', 'is-empty');
        } catch (_e0) {}
        if (!mark) {
          ox.textContent = '-';
          try {
            ox.classList.add('is-empty');
          } catch (_eEmpty) {}
          try {
            ox.setAttribute('aria-label', '');
          } catch (_e1) {}
        } else {
          ox.textContent = mark;
          try {
            ox.setAttribute('aria-label', mark);
          } catch (_e2) {}
          try {
            ox.classList.add(mark === 'O' ? 'on' : 'off');
          } catch (_e3) {}
        }
      }

      function setWorkStatusPill(cardIdx, rowIdx, wsLabel) {
        var row = document.querySelector('.basic-info-card:nth-child(' + cardIdx + ') .info-row:nth-child(' + rowIdx + ')');
        if (!row) return;
        var pill = row.querySelector('.status-pill');
        if (!pill) return;
        var dot = pill.querySelector('.status-dot');
        var txt = pill.querySelector('.status-text');
        var label = String(wsLabel || '').trim() || '-';

        function classFor(labelText) {
          var l = String(labelText || '').trim();
          if (!l || l === '-') return 'ws-wait';
          if (l.indexOf('운영') >= 0 || l.indexOf('가동') >= 0 || l.toLowerCase() === 'run') return 'ws-run';
          if (l.indexOf('대기') >= 0 || l.indexOf('준비') >= 0) return 'ws-wait';
          if (l.indexOf('중지') >= 0 || l.indexOf('정지') >= 0 || l.indexOf('종료') >= 0) return 'ws-idle';
          if (l.indexOf('점검') >= 0 || l.indexOf('보류') >= 0) return 'ws-wait';
          return 'ws-wait';
        }

        var cls = classFor(label);
        try {
          if (dot) {
            dot.classList.remove('ws-run', 'ws-idle', 'ws-wait');
            dot.classList.add(cls);
          }
        } catch (_e0) {}
        try {
          if (txt) txt.textContent = label;
          else pill.textContent = label;
        } catch (_e1) {}
      }

      try {
        var titleEl = document.getElementById('page-title');
        if (titleEl) {
          var work = String(item.work_name || '').trim();
          titleEl.textContent = work || DEFAULT_TITLE;
        }
        var subEl = document.getElementById('page-subtitle');
        if (subEl) {
          var sys = String(item.system_name || '').trim();
          subEl.textContent = sys || '-';
        }
      } catch (_e3) {}

      function s(v) {
        return v == null ? '' : String(v).trim();
      }
      function lookup(mapName, code) {
        var c = s(code);
        if (!c) return '';
        try {
          var m = masterCache && masterCache.lookup ? masterCache.lookup[mapName] : null;
          if (m && typeof m.get === 'function') return s(m.get(c));
        } catch (_e) {}
        return '';
      }
      function label(name, code, mapName) {
        var n = s(name);
        if (n) return n;
        var fromMaster = mapName ? lookup(mapName, code) : '';
        if (fromMaster) return fromMaster;
        var c = s(code);
        return c || '-';
      }

      try {
        if (document.querySelector('.basic-info-grid')) {
          var wsLabel = label(
            pick(item, ['work_status_name', 'work_status_label', 'work_status']),
            pick(item, ['work_status_code']),
            'workStatusByCode'
          );
          setWorkStatusPill(1, 1, wsLabel);
          setInfoRowValue(1, 2, label(pick(item, ['work_type_name', 'work_type']), pick(item, ['work_type_code']), 'workTypeByCode'));
          setInfoRowValue(1, 3, label(pick(item, ['work_category_name', 'work_category']), pick(item, ['work_category_code']), 'workCategoryByCode'));
          setInfoRowValue(1, 4, label(pick(item, ['work_operation_name', 'work_operation']), pick(item, ['work_operation_code']), 'workOperationByCode'));
          setInfoRowValue(1, 5, label(pick(item, ['work_group_name', 'work_group']), pick(item, ['work_group_code']), 'workGroupByCode'));
          setInfoRowValue(1, 6, pick(item, ['work_name']));
          setInfoRowValue(1, 7, pick(item, ['system_name']));
          setInfoRowValue(1, 8, pick(item, ['system_ip']));
          setInfoRowValue(1, 9, pick(item, ['mgmt_ip', 'manage_ip']));

          setInfoRowValue(
            2,
            1,
            label(pick(item, ['manufacturer_name', 'vendor_name', 'vendor']), pick(item, ['manufacturer_code', 'vendor_code']), 'vendorByCode')
          );
          setInfoRowValue(
            2,
            2,
            label(pick(item, ['server_model_name', 'model_name', 'model']), pick(item, ['server_code', 'model_code']), 'modelByCode')
          );
          setInfoRowValue(2, 3, pick(item, ['serial_number', 'serial']));
          setInfoRowValue(2, 4, pick(item, ['virtualization_type', 'virtualization']));
          setInfoRowValue(2, 5, label(pick(item, ['center_name', 'location_place']), pick(item, ['center_code']), 'centerByCode'));
          setInfoRowValue(2, 6, label(pick(item, ['rack_name', 'location_pos']), pick(item, ['rack_code']), 'rackByCode'));
          setInfoRowValue(2, 7, pick(item, ['slot', 'system_slot']));
          setInfoRowValue(2, 8, pick(item, ['u_size', 'system_size']));
          setInfoRowValue(2, 9, (pick(item, ['rack_face']) === 'REAR') ? '후면' : '전면');

          setInfoRowValue(
            3,
            1,
            label(pick(item, ['system_dept_name', 'sys_dept']), pick(item, ['system_dept_code', 'system_department']), 'deptByCode')
          );
          setInfoRowValue(
            3,
            2,
            label(pick(item, ['system_owner_name', 'sys_owner']), pick(item, ['system_owner_emp_no', 'system_owner']), 'userByEmpNo')
          );
          setInfoRowValue(
            3,
            3,
            label(pick(item, ['service_dept_name', 'svc_dept']), pick(item, ['service_dept_code', 'service_department']), 'deptByCode')
          );
          setInfoRowValue(
            3,
            4,
            label(pick(item, ['service_owner_name', 'svc_owner']), pick(item, ['service_owner_emp_no', 'service_owner']), 'userByEmpNo')
          );

          var c = pick(item, ['cia_confidentiality', 'confidentiality']);
          var i = pick(item, ['cia_integrity', 'integrity']);
          var a = pick(item, ['cia_availability', 'availability']);
          var sc = pick(item, ['security_score']);
          setNumBadge(4, 1, c, 'confidentiality');
          setNumBadge(4, 2, i, 'integrity');
          setNumBadge(4, 3, a, 'availability');
          setNumBadge(4, 4, sc, 'security_score');
          setInfoRowValue(4, 5, pick(item, ['system_grade', 'grade']));
          setInfoRowValue(4, 6, normalizeCoreFlag(pick(item, ['is_core_system', 'core_flag'])));

          var dr = normalizeOX(pick(item, ['has_dr_site', 'dr_built']));
          var ha = normalizeOX(pick(item, ['has_service_ha', 'svc_redundancy']));
          setOxBadge(4, 7, dr);
          setOxBadge(4, 8, ha);
        }
      } catch (_eGrid) {}

      try {
        localStorage.setItem(
          STORAGE_PREFIX + ':current:vendor',
          String(label(pick(item, ['manufacturer_name', 'vendor_name', 'vendor']), pick(item, ['manufacturer_code', 'vendor_code']), 'vendorByCode') || '')
        );
        localStorage.setItem(
          STORAGE_PREFIX + ':current:model',
          String(label(pick(item, ['server_model_name', 'model_name', 'model']), pick(item, ['server_code', 'model_code']), 'modelByCode') || '')
        );
        localStorage.setItem(STORAGE_PREFIX + ':current:serial', String(pick(item, ['serial_number', 'serial']) || ''));
        localStorage.setItem(STORAGE_PREFIX + ':current:slot', String(pick(item, ['slot', 'system_slot']) || ''));
        localStorage.setItem(STORAGE_PREFIX + ':current:u_size', String(pick(item, ['u_size', 'system_size']) || ''));
        localStorage.setItem(STORAGE_PREFIX + ':current:rack_face', String(pick(item, ['rack_face']) || ''));
      } catch (_eStore) {}
    }

    function bootstrapBasicInfo() {
      currentAssetId = resolveAssetId();

      // Many tabs (account/interface/etc) include this script for shared header/sidebar behavior.
      // Only the "기본정보" tab needs full hydration; other tabs should not spam API calls.
      var hasBasicGrid = false;
      try {
        hasBasicGrid = !!document.querySelector('.basic-info-grid');
      } catch (_eG) {
        hasBasicGrid = false;
      }

      // Always try to render title/subtitle without requiring an API call.
      _applyHeaderFromKnownContext();

      // Non-basic tabs: only do a best-effort header fetch if still empty.
      if (!hasBasicGrid) {
        if (!currentAssetId) return;
        if (!_headerLooksEmpty()) return;
        apiJSON(API_ENDPOINT + '/' + currentAssetId, { method: 'GET' })
          .then(function (data) {
            var item = data && data.item ? data.item : data;
            _setHeader(item && item.work_name, item && item.system_name);
          })
          .catch(function (_err) {
            // Silent: header fetch is optional on non-basic tabs.
          });
        return;
      }

      if (!currentAssetId) {
        // Keep console clean; basic tab will show placeholder until selection exists.
        return;
      }

      apiJSON(API_ENDPOINT + '/' + currentAssetId, { method: 'GET' })
        .then(function (data) {
          var item = data && data.item ? data.item : data;
          currentAssetItem = item;
          try {
            sessionStorage.setItem(STORAGE_PREFIX + ':selected:asset_id', String(currentAssetId));
          } catch (_eS0) {}
          try {
            localStorage.setItem(STORAGE_PREFIX + ':selected:asset_id', String(currentAssetId));
          } catch (_eL0) {}
          try {
            sessionStorage.setItem(STORAGE_PREFIX + ':selected:row', JSON.stringify(item || {}));
          } catch (_eS1) {}
          try {
            localStorage.setItem(STORAGE_PREFIX + ':selected:row', JSON.stringify(item || {}));
          } catch (_eL1) {}
          try {
            var storedRow = getStoredSelectedRow();
            applyAssetItemToPage(mergeWithDisplayFallback(item, storedRow));
          } catch (_eApply) {
            applyAssetItemToPage(item);
          }
        })
        .catch(function (err) {
          // If the selected id is stale/mismatched, avoid noisy console output.
          // Still try to show header from stored context.
          try {
            if (err && err.status === 404) {
              _applyHeaderFromKnownContext();
              return;
            }
          } catch (_eS) {}
          console.warn('[' + STORAGE_PREFIX + '-detail] fetch failed:', err);
          _applyHeaderFromKnownContext();
        });
    }

    function captureInitialFormValues(form) {
      if (!form) return;
      try {
        Array.prototype.forEach.call(form.querySelectorAll('input[name], select[name], textarea[name]'), function (el) {
          try {
            el.dataset.initialValue = String(el.value == null ? '' : el.value);
          } catch (_e0) {}
          try {
            delete el.dataset.userCleared;
          } catch (_e1) {
            try {
              el.dataset.userCleared = '0';
            } catch (_e2) {}
          }
        });
      } catch (_e3) {}
    }

    function wireExplicitClearTracking(form) {
      if (!form) return;
      function isRequiredField(name) {
        return name === 'work_status' || name === 'work_name' || name === 'system_name';
      }
      function getInitial(el) {
        try {
          if (el && el.dataset && Object.prototype.hasOwnProperty.call(el.dataset, 'initialValue')) {
            return String(el.dataset.initialValue || '');
          }
        } catch (_e0) {}
        return null;
      }
      function onChangeOrInput(el) {
        try {
          if (!el || !el.dataset) return;
          var name = String(el.getAttribute('name') || '').trim();
          if (!name) return;
          var v = String(el.value == null ? '' : el.value).trim();
          if (v === '') {
            if (isRequiredField(name)) return;
            var initial = getInitial(el);
            if (initial != null && String(initial).trim() !== '') {
              el.dataset.userCleared = '1';
            }
          } else {
            try {
              delete el.dataset.userCleared;
            } catch (_e1) {
              el.dataset.userCleared = '0';
            }
          }
        } catch (_e2) {}
      }
      try {
        Array.prototype.forEach.call(form.querySelectorAll('input[name], select[name], textarea[name]'), function (el) {
          el.addEventListener('change', function () {
            onChangeOrInput(el);
          });
          el.addEventListener('input', function () {
            onChangeOrInput(el);
          });
        });
      } catch (_e3) {}
    }

    // --- Edit modal (same behavior as firewall/on-premise)

    var __lastFocusBeforeModal = null;

    function __containsActive(el) {
      try {
        return !!(el && document.activeElement && el.contains(document.activeElement));
      } catch (_e) {
        return false;
      }
    }

    function __focusReturnTarget() {
      try {
        // Prefer the explicit opener on this page.
        var openBtn = document.getElementById(EDIT_OPEN_ID);
        if (openBtn && typeof openBtn.focus === 'function') {
          openBtn.focus();
          return true;
        }
      } catch (_e0) {}
      try {
        if (__lastFocusBeforeModal && document.contains(__lastFocusBeforeModal) && typeof __lastFocusBeforeModal.focus === 'function') {
          __lastFocusBeforeModal.focus();
          return true;
        }
      } catch (_e1) {}
      try {
        document.body && document.body.focus && document.body.focus();
      } catch (_e2) {}
      return false;
    }

    function closeModalLocal(id) {
      var el = document.getElementById(id);
      if (!el) return;

      // Chrome warns (Blocked aria-hidden) if a focused descendant remains inside
      // when we set aria-hidden=true. Move focus out first.
      try {
        if (__containsActive(el)) {
          try {
            document.activeElement && document.activeElement.blur && document.activeElement.blur();
          } catch (_eB) {}
          __focusReturnTarget();
        }
      } catch (_eF) {}

      el.classList.remove('show');
      try {
        el.setAttribute('aria-hidden', 'true');
      } catch (_eA) {}
      try {
        // Best-effort inert to prevent focus/interaction when hidden.
        el.setAttribute('inert', '');
      } catch (_eI) {}

      if (!document.querySelector('.modal-overlay-full.show')) {
        document.body.classList.remove('modal-open');
      }
    }

    function openModalLocal(id) {
      var el = document.getElementById(id);
      if (!el) return;
      try {
        __lastFocusBeforeModal = document.activeElement || null;
      } catch (_e0) {
        __lastFocusBeforeModal = null;
      }

      document.body.classList.add('modal-open');
      el.classList.add('show');
      try {
        el.setAttribute('aria-hidden', 'false');
      } catch (_eA) {}
      try {
        el.removeAttribute('inert');
      } catch (_eI) {}

      // Put focus into the modal to avoid leaving it on background elements.
      try {
        var focusable = el.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable && typeof focusable.focus === 'function') {
          focusable.focus();
        } else {
          el.setAttribute('tabindex', '-1');
          el.focus && el.focus();
        }
      } catch (_eF) {}
    }

    function getFieldValueForEdit(source, field) {
      if (!source) return '';

      function firstNonEmpty() {
        for (var i = 0; i < arguments.length; i++) {
          var v = arguments[i];
          if (v == null) continue;
          var s = String(v).trim();
          if (s !== '' && s !== '-') return v;
        }
        return '';
      }

      if (field === 'work_type') {
        return firstNonEmpty(source.work_type_code, source.work_category_code, source.work_type, source.work_category);
      }
      if (field === 'work_category') {
        return firstNonEmpty(source.work_category_code, source.work_division_code, source.work_category, source.work_division);
      }
      if (field === 'work_status') {
        return firstNonEmpty(source.work_status_code, source.work_status);
      }
      if (field === 'work_operation') {
        return firstNonEmpty(source.work_operation_code, source.work_operation);
      }
      if (field === 'work_group') {
        return firstNonEmpty(source.work_group_code, source.work_group);
      }

      if (field === 'manage_ip') return firstNonEmpty(source.mgmt_ip, source.manage_ip, source.manageIp, source.manage_ip);
      if (field === 'vendor') return firstNonEmpty(source.manufacturer_code, source.vendor);
      if (field === 'model') return firstNonEmpty(source.server_code, source.model);
      if (field === 'serial') return firstNonEmpty(source.serial_number, source.serial);
      if (field === 'virtualization') return firstNonEmpty(source.virtualization_raw, source.virtualization_type, source.virtualization);
      if (field === 'location_place') return firstNonEmpty(source.center_code, source.location_place);
      if (field === 'location_pos') return firstNonEmpty(source.rack_code, source.location_pos);
      if (field === 'slot') return firstNonEmpty(source.system_slot, source.slot);
      if (field === 'u_size') return firstNonEmpty(source.system_size, source.u_size);
      if (field === 'rack_face') return firstNonEmpty(source.rack_face);
      if (field === 'sys_dept') return firstNonEmpty(source.system_dept_code, source.system_department, source.sys_dept);
      if (field === 'svc_dept') return firstNonEmpty(source.service_dept_code, source.service_department, source.svc_dept);
      if (field === 'sys_owner') return firstNonEmpty(source.system_owner_emp_no, source.system_owner, source.sys_owner);
      if (field === 'svc_owner') return firstNonEmpty(source.service_owner_emp_no, source.service_owner, source.svc_owner);

      if (field === 'confidentiality') return firstNonEmpty(source.cia_confidentiality, source.confidentiality);
      if (field === 'integrity') return firstNonEmpty(source.cia_integrity, source.integrity);
      if (field === 'availability') return firstNonEmpty(source.cia_availability, source.availability);
      if (field === 'security_score') return firstNonEmpty(source.security_score);
      if (field === 'system_grade') return firstNonEmpty(source.system_grade);

      if (field === 'core_flag') {
        var cf = firstNonEmpty(source.core_flag);
        if (cf) return cf;
        if (source.is_core_system != null) return source.is_core_system ? '핵심' : '일반';
        return '';
      }
      if (field === 'dr_built') {
        var drb = firstNonEmpty(source.dr_built);
        if (drb) return drb;
        if (source.has_dr_site != null) return source.has_dr_site ? 'O' : 'X';
        return '';
      }
      if (field === 'svc_redundancy') {
        var shr = firstNonEmpty(source.svc_redundancy);
        if (shr) return shr;
        if (source.has_service_ha != null) return source.has_service_ha ? 'O' : 'X';
        return '';
      }

      return source[field] != null ? source[field] : '';
    }

    function generateFieldInput(col, value) {
      var v = value == null ? '' : String(value);

      function numberValue(val) {
        var s = String(val == null ? '' : val).trim();
        if (!s || s === '-') return '';
        return s;
      }

      var opts = {
        virtualization: ['', '물리', '가상'],
        confidentiality: ['', '1', '2', '3'],
        integrity: ['', '1', '2', '3'],
        availability: ['', '1', '2', '3'],
        system_grade: ['', '1등급', '2등급', '3등급'],
        core_flag: ['', '핵심', '일반'],
        dr_built: ['', 'O', 'X'],
        svc_redundancy: ['', 'O', 'X'],
      };

      if (
        [
          'work_type',
          'work_category',
          'work_status',
          'work_operation',
          'work_group',
          'vendor',
          'model',
          'location_place',
          'location_pos',
          'sys_dept',
          'svc_dept',
          'sys_owner',
          'svc_owner',
        ].indexOf(col) >= 0
      ) {
        return (
          '<input type="text" class="form-input" name="' +
          escapeHTML(col) +
          '" value="' +
          escapeHTML(v) +
          '" data-fk="1" data-fk-allow="1" autocomplete="off">'
        );
      }

      if (opts[col]) {
        // Match other detail modals: show '-' when value is empty.
        // (If we leave the empty option label as '', the searchable display looks blank.)
        var html = '<select class="form-input search-select" data-placeholder="-" name="' + escapeHTML(col) + '">';
        opts[col].forEach(function (o) {
          var sel = String(o) === String(v) ? ' selected' : '';
          var label = (o === '' || o == null) ? '-' : o;
          html += '<option value="' + escapeHTML(o) + '"' + sel + '>' + escapeHTML(label) + '</option>';
        });
        html += '</select>';
        return html;
      }

      if (col === 'slot' || col === 'u_size' || col === 'security_score') {
        return '<input type="number" class="form-input" name="' + escapeHTML(col) + '" value="' + escapeHTML(numberValue(v)) + '" inputmode="numeric">';
      }
      if (col === 'system_ip' || col === 'manage_ip') {
        return '<input type="text" class="form-input" name="' + escapeHTML(col) + '" value="' + escapeHTML(v) + '" placeholder="0.0.0.0">';
      }
      return '<input type="text" class="form-input" name="' + escapeHTML(col) + '" value="' + escapeHTML(v) + '">';
    }

    function buildEditFormHTML(source) {
      var f = function (k) {
        return getFieldValueForEdit(source, k);
      };

      function row(label, col, required) {
        var req = required ? '<span class="req-star" aria-hidden="true">*</span>' : '';
        return (
          '<div class="form-row">' +
          '<label>' +
          escapeHTML(label) +
          req +
          '</label>' +
          generateFieldInput(col, f(col)) +
          '</div>'
        );
      }

      function section(title, rowsHtml) {
        return (
          '<div class="form-section">' +
          '<div class="section-header"><h4>' +
          escapeHTML(title) +
          '</h4></div>' +
          '<div class="form-grid">' +
          rowsHtml.join('') +
          '</div>' +
          '</div>'
        );
      }

      var s1 = section('비즈니스', [
        row('업무 상태', 'work_status', true),
        row('업무 분류', 'work_type', false),
        row('업무 구분', 'work_category', false),
        row('업무 운영', 'work_operation', false),
        row('업무 그룹', 'work_group', false),
        row('업무 이름', 'work_name', true),
        row('시스템 이름', 'system_name', true),
        row('시스템 IP', 'system_ip', false),
        row('관리 IP', 'manage_ip', false),
      ]);
      var s2 = section('시스템', [
        row('시스템 제조사', 'vendor', false),
        row('시스템 모델명', 'model', false),
        row('시스템 일련번호', 'serial', false),
        row('시스템 가상화', 'virtualization', false),
        row('시스템 장소', 'location_place', false),
        row('시스템 위치', 'location_pos', false),
        row('시스템 슬롯', 'slot', false),
        row('시스템 크기', 'u_size', false),
      ]);
      var s3 = section('담당자', [
        row('시스템 담당부서', 'sys_dept', false),
        row('시스템 담당자', 'sys_owner', false),
        row('서비스 담당부서', 'svc_dept', false),
        row('서비스 담당자', 'svc_owner', false),
      ]);
      var s4 = section('점검', [
        row('기밀성', 'confidentiality', false),
        row('무결성', 'integrity', false),
        row('가용성', 'availability', false),
        row('보안 점수', 'security_score', false),
        row('시스템 등급', 'system_grade', false),
        row('핵심/일반', 'core_flag', false),
        row('DR 구축여부', 'dr_built', false),
        row('서비스 이중화', 'svc_redundancy', false),
      ]);

      return [s1, s2, s3, s4].join('');
    }

    function validateRequiredModalForm(form) {
      var required = ['work_status', 'work_name', 'system_name'];
      for (var i = 0; i < required.length; i++) {
        var name = required[i];
        var el = form.querySelector('[name="' + name + '"]');
        if (!el) continue;
        var v = String(el.value == null ? '' : el.value).trim();
        if (!v) return false;
      }
      return true;
    }

    function buildUpdatePayload(form) {
      var payload = {};
      Object.keys(FIELD_TO_PAYLOAD_KEY).forEach(function (field) {
        var el = form.querySelector('[name="' + field + '"]');
        if (!el) return;
        var raw = el.value;
        if (raw == null) return;
        var s = String(raw).trim();
        var payloadKey = FIELD_TO_PAYLOAD_KEY[field];
        var isRequired = field === 'work_status' || field === 'work_name' || field === 'system_name';
        if (s === '') {
          if (isRequired) return;
          var initial = null;
          try {
            initial = el.dataset && Object.prototype.hasOwnProperty.call(el.dataset, 'initialValue') ? String(el.dataset.initialValue || '') : null;
          } catch (_e0) {
            initial = null;
          }
          var userCleared = false;
          try {
            userCleared = !!(el.dataset && el.dataset.userCleared === '1');
          } catch (_e1) {
            userCleared = false;
          }
          if ((initial != null && String(initial).trim() !== '') || userCleared) {
            payload[payloadKey] = null;
          }
          return;
        }
        if (NUMERIC_PAYLOAD_KEYS.has(payloadKey)) {
          var num = parseInt(s, 10);
          if (isNaN(num)) return;
          payload[payloadKey] = num;
        } else {
          payload[payloadKey] = s;
        }
      });
      return payload;
    }

    (function wireEditModal() {
      var openBtn = document.getElementById(EDIT_OPEN_ID);
      if (openBtn) {
        openBtn.addEventListener('click', function () {
          var form = document.getElementById(EDIT_FORM_ID);
          if (!form) return;

          var storedRow = getStoredSelectedRow();
          var src = mergeWithDisplayFallback(currentAssetItem, storedRow);
          form.innerHTML = buildEditFormHTML(src);

          // Stash initial values + wire explicit-clear tracking (WIPS/ETC-style)
          captureInitialFormValues(form);
          wireExplicitClearTracking(form);

          // Enhance FK inputs if available
          try {
            if (window.BlBlossomFkSelect && typeof window.BlBlossomFkSelect.apply === 'function') {
              window.BlBlossomFkSelect.apply(form);
            }
          } catch (_eFk) {}

          openModalLocal(EDIT_MODAL_ID);
        });
      }

      var closeBtn = document.getElementById(EDIT_CLOSE_ID);
      if (closeBtn) closeBtn.addEventListener('click', function () { closeModalLocal(EDIT_MODAL_ID); });

      var saveBtn = document.getElementById(EDIT_SAVE_ID);
      if (saveBtn) {
        saveBtn.addEventListener('click', async function () {
          var form = document.getElementById(EDIT_FORM_ID);
          if (!form) {
            closeModalLocal(EDIT_MODAL_ID);
            return;
          }

          if (!validateRequiredModalForm(form)) {
            notify('필수 값을 입력해 주세요.', 'error');
            return;
          }

          try {
            if (!currentAssetId) currentAssetId = resolveAssetId();
            if (!currentAssetId) {
              notify('자산 ID를 찾을 수 없습니다. 목록에서 다시 선택해 주세요.', 'error');
              return;
            }

            var payload = buildUpdatePayload(form);
            if (!payload || Object.keys(payload).length === 0) {
              closeModalLocal(EDIT_MODAL_ID);
              return;
            }

            saveBtn.disabled = true;
            var data = await apiJSON(API_ENDPOINT + '/' + currentAssetId, {
              method: 'PUT',
              body: JSON.stringify(payload),
            });

            // Refetch to ensure joined/display fields exist
            try {
              var fresh = await apiJSON(API_ENDPOINT + '/' + currentAssetId, { method: 'GET' });
              currentAssetItem = fresh && fresh.item ? fresh.item : (data ? data.item : null);
            } catch (_eGet) {
              currentAssetItem = data ? data.item : null;
            }

            try {
              var storedRow1 = getStoredSelectedRow();
              applyAssetItemToPage(mergeWithDisplayFallback(currentAssetItem, storedRow1));
            } catch (_eApply) {
              applyAssetItemToPage(currentAssetItem);
            }
            closeModalLocal(EDIT_MODAL_ID);
          } catch (err) {
            console.warn('[' + STORAGE_PREFIX + '-detail] save failed:', err);
            notify(err && err.message ? err.message : '저장 중 오류가 발생했습니다.', 'error');
          } finally {
            try {
              saveBtn.disabled = false;
            } catch (_e3) {}
          }
        });
      }
    })();

    try {
      var _assetId = resolveAssetId();
      if (_assetId != null) {
        decorateTabLinksWithAssetId(_assetId);
        try {
          sessionStorage.setItem(STORAGE_PREFIX + ':selected:asset_id', String(_assetId));
        } catch (_eS) {}
        try {
          localStorage.setItem(STORAGE_PREFIX + ':selected:asset_id', String(_assetId));
        } catch (_eL) {}
      }
      stripAssetIdFromUrl();
    } catch (_eZ) {}

    bootstrapBasicInfo();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', __detailMain);
  else __detailMain();
})();
/*
  Legacy/corrupted VPN detail script (disabled).
  This file previously contained duplicated/truncated code which broke parsing in the browser.
  Keeping it commented out avoids cache issues while preserving history.

// vpn_detail.js: VPN "기본정보" hydration + tab asset_id linkage

(function(){
  'use strict';

  var STORAGE_PREFIX = 'vpn';
  var API_BASE = '/api/hardware/security/vpn/assets';
  var DEFAULT_TITLE = 'VPN';

  function safeInt(v){
    var n = parseInt(String(v == null ? '' : v), 10);
    return (!isNaN(n) && n > 0) ? n : null;
  }

  function storageGet(key){
    try{ return sessionStorage.getItem(key); }catch(_e0){}
    try{ return localStorage.getItem(key); }catch(_e1){}
    return null;
  }
  function storageSet(key, val){
    try{ sessionStorage.setItem(key, String(val)); }catch(_e0){}
    try{ localStorage.setItem(key, String(val)); }catch(_e1){}
  }

  function readSelectedRow(prefix){
    var raw = storageGet(prefix + ':selected:row');
    if(!raw) return null;
    try{ return JSON.parse(raw); }catch(_){ return null; }
  }
  function writeSelectedRow(prefix, row){
    if(!row) return;
    try{ storageSet(prefix + ':selected:row', JSON.stringify(row)); }catch(_e){ }
  }

  function resolveAssetId(){
    // 1) query
    try{
      var qs = new URLSearchParams(location.search || '');
      var qid = safeInt(qs.get('hardware_id') || qs.get('hardwareId') || qs.get('asset_id') || qs.get('assetId') || qs.get('id'));
      if(qid) return qid;
    }catch(_e){ }

    // 2) template injected (optional)
    try{
      var injected = safeInt(window.__VPN_SELECTED_ASSET_ID__);
      if(injected) return injected;
    }catch(_e2){ }

    // 3) stored id
    var sid = safeInt(storageGet(STORAGE_PREFIX + ':selected:asset_id'));
    if(sid) return sid;

    // 4) stored row
    var row = readSelectedRow(STORAGE_PREFIX);
    var rid = row ? safeInt(row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id)) : null;
    return rid;
  }

  function stripAssetIdFromUrl(){
    try{
      var u = new URL(window.location.href);
      var changed = false;
      ['asset_id','assetId','id'].forEach(function(k){
        if(u.searchParams.has(k)){ u.searchParams.delete(k); changed = true; }
      });
      if(!changed) return;
      history.replaceState(null, document.title, u.pathname + (u.search || '') + (u.hash || ''));
    }catch(_e){ }
  }

  function decorateTabLinks(assetId){
    if(!assetId) return;
    try{
      var tabs = document.querySelectorAll('.server-detail-tabs a');
      if(!tabs || !tabs.length) return;
      Array.prototype.forEach.call(tabs, function(a){
        try{
          var href = a.getAttribute('href') || '';
          if(!href || href.indexOf('javascript:') === 0) return;
          var u = new URL(href, window.location.origin);
          u.searchParams.set('asset_id', String(assetId));
          a.setAttribute('href', u.pathname + (u.search || ''));
        }catch(_e0){ }
      });
    }catch(_e1){ }
  }

  function pick(obj, keys){
    if(!obj) return '';
    for(var i=0;i<keys.length;i++){
      var k = keys[i];
      if(Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && String(obj[k]).trim() !== '') return obj[k];
    }
    return '';
  }

  function setRowValue(cardIdx, rowIdx, value){
    var rowSel = '.basic-info-card:nth-child(' + cardIdx + ') .info-row:nth-child(' + rowIdx + ')';
    var row = document.querySelector(rowSel);
    if(!row) return;
    var target = row.querySelector('.info-value') || row.querySelector('.info-value') || row.querySelector('.num-badge') || row.querySelector('.ox-badge');
    if(!target) return;
    var s = String(value == null ? '' : value).trim();
    target.textContent = s ? s : '-';
  }

  function normalizeCoreFlag(v){
    if(v == null) return '-';
    var s = String(v).trim();
    if(!s) return '-';
    if(s === '1' || s.toLowerCase() === 'true' || s === 'Y') return '핵심';
    if(s === '0' || s.toLowerCase() === 'false' || s === 'N') return '일반';
    return s;
  }

  function normalizeOX(v){
    if(v == null) return '-';
    var s = String(v).trim().toUpperCase();
    if(!s) return '-';
    if(s === 'O' || s === 'X') return s;
    if(s === '1' || s === 'TRUE' || s === 'Y') return 'O';
    if(s === '0' || s === 'FALSE' || s === 'N') return 'X';
    return '-';
  }

  function renderWorkStatus(item){
    var pill = document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill');
    if(!pill) return;
    var label = pick(item, ['work_status_name','work_status_label','work_status','work_status_code']);
    var txt = pill.querySelector('.status-text');
    if(txt) txt.textContent = String(label || '-').trim() || '-';
    var dot = pill.querySelector('.status-dot');
    if(dot){
      dot.classList.remove('ws-run','ws-idle','ws-wait');
      var v = String(label || '').trim();
      var cls = (v === '가동') ? 'ws-run' : ((v === '유휴') ? 'ws-idle' : 'ws-wait');
      dot.classList.add(cls);
    }
    try{
      var color = pick(item, ['work_status_color']);
      if(color) pill.style.setProperty('--status-color', String(color));
    }catch(_e){ }
  }

  function renderBasicInfo(item){
    if(!item) return;
    // header
    try{
      var titleEl = document.getElementById('page-title');
      if(titleEl){
        var t = String(pick(item, ['work_name']) || DEFAULT_TITLE).trim();
        titleEl.textContent = t || DEFAULT_TITLE;
      }
      var subEl = document.getElementById('page-subtitle');
      if(subEl){
        var sub = String(pick(item, ['system_name']) || '-').trim();
        subEl.textContent = sub || '-';
      }
    }catch(_e0){ }

    renderWorkStatus(item);

    // 비즈니스 (card 1)
    setRowValue(1, 2, pick(item, ['work_type_name','work_type']));
    setRowValue(1, 3, pick(item, ['work_category_name','work_category']));
    setRowValue(1, 4, pick(item, ['work_operation_name','work_operation']));
    setRowValue(1, 5, pick(item, ['work_group_name','work_group']));
    setRowValue(1, 6, pick(item, ['work_name']));
    setRowValue(1, 7, pick(item, ['system_name']));
    setRowValue(1, 8, pick(item, ['system_ip']));
    setRowValue(1, 9, pick(item, ['mgmt_ip','manage_ip']));

    // 시스템 (card 2)
    setRowValue(2, 1, pick(item, ['manufacturer_name','vendor','vendor_name']));
    setRowValue(2, 2, pick(item, ['server_model_name','model_name','model']));
    setRowValue(2, 3, pick(item, ['serial_number','serial']));
    setRowValue(2, 4, pick(item, ['virtualization_type','virtualization']));
    setRowValue(2, 5, pick(item, ['center_name','location_place']));
    setRowValue(2, 6, pick(item, ['rack_name','location_pos']));
    setRowValue(2, 7, pick(item, ['slot','system_slot']));
    setRowValue(2, 8, pick(item, ['u_size','system_size']));
    setRowValue(2, 9, (pick(item, ['rack_face']) === 'REAR') ? '후면' : '전면');

    // 담당자 (card 3)
    setRowValue(3, 1, pick(item, ['system_dept_name','sys_dept']));
    setRowValue(3, 2, pick(item, ['system_owner_name','sys_owner']));
    setRowValue(3, 3, pick(item, ['service_dept_name','svc_dept']));
    setRowValue(3, 4, pick(item, ['service_owner_name','svc_owner']));

    // 점검 (card 4)
    setRowValue(4, 1, pick(item, ['cia_confidentiality','confidentiality']));
    setRowValue(4, 2, pick(item, ['cia_integrity','integrity']));
    setRowValue(4, 3, pick(item, ['cia_availability','availability']));
    setRowValue(4, 4, pick(item, ['security_score']));
    setRowValue(4, 5, pick(item, ['system_grade']));
    setRowValue(4, 6, normalizeCoreFlag(pick(item, ['core_flag','is_core_system'])));
    setRowValue(4, 7, normalizeOX(pick(item, ['dr_built','has_dr_site'])));
    setRowValue(4, 8, normalizeOX(pick(item, ['svc_redundancy','has_service_ha'])));
  }

  function persistSelection(assetId, item){
    if(assetId){
      storageSet(STORAGE_PREFIX + ':selected:asset_id', String(assetId));
      // Back-compat keys used elsewhere
      storageSet('vpn:selected:asset_id', String(assetId));
      storageSet('SECURITY_VPN:selected:asset_id', String(assetId));
      storageSet('hw_security_vpn:selected:asset_id', String(assetId));
    }
    if(item){
      var row = {
        id: item.id != null ? item.id : item.asset_id,
        asset_id: item.id != null ? item.id : item.asset_id,
        work_name: item.work_name,
        system_name: item.system_name,
        system_ip: item.system_ip,
        mgmt_ip: item.mgmt_ip,
        manage_ip: item.manage_ip
      };
      writeSelectedRow(STORAGE_PREFIX, row);
      try{ storageSet('vpn:selected:row', JSON.stringify(row)); }catch(_){ }
      try{ storageSet('hw_security_vpn:selected:row', JSON.stringify(row)); }catch(_){ }
    }
  }

  function fetchAsset(assetId){
    return fetch(API_BASE + '/' + String(assetId), { method:'GET', headers:{'Accept':'application/json'}, credentials:'same-origin' })
      .then(function(res){
        return res.json().catch(function(){ return null; }).then(function(data){
          if(!res.ok || !data || data.success === false) throw new Error((data && (data.message||data.error)) ? (data.message||data.error) : ('HTTP '+res.status));
          return data;
        });
      });
  }

  function applySidebarPreload(){
    try{
      document.documentElement.classList.add('sidebar-preload');
      var state = localStorage.getItem('sidebarState');
      var style = document.createElement('style');
      if(state === 'collapsed') style.innerHTML = '.sidebar{width:70px !important} .main-content{margin-left:70px !important}';
      else if(state === 'hidden') style.innerHTML = '.sidebar{transform:translateX(-100%) !important;width:260px !important} .main-content{margin-left:0 !important}';
      else style.innerHTML = '';
      try{ if(document.head) document.head.appendChild(style); }catch(_e0){}
    }catch(_e1){}
  }

  async function main(){
    applySidebarPreload();
    var assetId = resolveAssetId();
    if(assetId){
      persistSelection(assetId, null);
      decorateTabLinks(assetId);
      stripAssetIdFromUrl();
    }

    // Fast paint from stored row
    var stored = readSelectedRow(STORAGE_PREFIX);
    if(stored){
      renderBasicInfo(stored);
    }

    if(!assetId) return;
    try{
      var data = await fetchAsset(assetId);
      var item = data && data.item ? data.item : null;
      if(item){
        persistSelection(assetId, item);
        renderBasicInfo(item);
      }
    }catch(err){
      try{ console.warn('[VPN_DETAIL] fetch failed:', err); }catch(_e){}
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
  else main();
})();
              try{ sessionStorage.setItem(storagePrefix+':selected:row', JSON.stringify(upgraded)); }catch(_e7){}
              try{ localStorage.setItem(storagePrefix+':selected:row', JSON.stringify(upgraded)); }catch(_e8){}
            }catch(_e9){
              applyRowToBasicInfo(row);
            }
          }
        }catch(_e){
          // ignore: storage row already applied (if any)
        }
      })();
    })();
    // Mark page-size selects as chosen after interaction, so CSS can style as white text
    (function(){
      function wireChosen(id){
        var sel = document.getElementById(id); if(!sel) return;
        function apply(){ if(sel.value){ sel.classList.add('is-chosen'); } }
        sel.addEventListener('change', apply);
        // If value came from localStorage, reflect on load
        apply();
      }
      ['lg-page-size','hw-page-size','sw-page-size','bk-page-size','if-page-size','am-page-size','au-page-size','ac-page-size','fw-page-size','st-page-size','tk-page-size','vl-page-size','pk-page-size','mt-page-size','asg-page-size']
        .forEach(wireChosen);
    })();
    // IDs and labels for the edit modal
    var EDIT_MODAL_ID = 'system-edit-modal';
    var EDIT_FORM_ID = 'system-edit-form';
    var EDIT_OPEN_ID = 'detail-edit-open';
    var EDIT_CLOSE_ID = 'system-edit-close';
    var EDIT_SAVE_ID = 'system-edit-save';

    // Helpers to parse capacity strings like "100 TB" or "96000 GB" to GB
    function parseCapacityToGB(str){
      if(!str) return NaN;
      var s=String(str).trim();
      var m=s.match(/([0-9]*\.?[0-9]+)\s*(TB|GB|tb|gb)?/); if(!m) return NaN;
      var val=parseFloat(m[1]); var unit=(m[2]||'GB').toUpperCase();
      if(unit==='TB') return val*1024; return val; // treat GB as base
    }
    function formatGBToPretty(gb){ if(!isFinite(gb)) return ''; if(gb>=1024) return (Math.round(gb/102.4)/10)+' TB'; return Math.round(gb)+' GB'; }

    // Fallback column labels if a global COLUMN_META is not present
    var COLUMN_META = window.COLUMN_META || {
      work_status: { label: '업무 상태' },
      work_type: { label: '업무 분류' },
      work_category: { label: '업무 구분' },
      work_operation: { label: '업무 운영' },
      work_group: { label: '업무 그룹' },
      work_name: { label: '업무 이름' },
      system_name: { label: '시스템 이름' },
      system_ip: { label: '시스템 IP' },
      manage_ip: { label: '관리 IP' },
      vendor: { label: '시스템 제조사' },
      model: { label: '시스템 모델명' },
      serial: { label: '시스템 일련번호' },
      virtualization: { label: '시스템 가상화' },
      location_place: { label: '시스템 장소' },
      location_pos: { label: '시스템 위치' },
      slot: { label: '시스템 슬롯' },
      u_size: { label: '시스템 크기' },
      rack_face: { label: 'RACK 전면/후면' },
      sys_dept: { label: '시스템 담당부서' },
      sys_owner: { label: '시스템 담당자' },
      svc_dept: { label: '서비스 담당부서' },
      svc_owner: { label: '서비스 담당자' },
      confidentiality: { label: '기밀성' },
      integrity: { label: '무결성' },
      availability: { label: '가용성' },
      security_score: { label: '보안 점수' },
      system_grade: { label: '시스템 등급' },
      core_flag: { label: '핵심/일반' },
      dr_built: { label: 'DR 구축여부' },
      svc_redundancy: { label: '서비스 이중화' }
    };

    // Minimal FK dropdowns for the Basic Info edit modal (vendor/model)
    // - vendor: /api/vendor-manufacturers (manufacturer_code)
    // - model:  /api/hw-server-types (server_code) filtered to security_type=VPN
    var _vpnFkCache = { vendors: null, models: null, promise: null };
    function _normalizeSecurityType(v){
      return String(v || '').trim().toUpperCase().replace(/\s+/g, '').replace(/[-_]/g, '');
    }
    function _isVpnModelRow(item){
      var expected = _normalizeSecurityType('VPN');
      var type = _normalizeSecurityType(item && (item.security_type || item.hw_type || item.type || item.form_factor));
      return !!expected && !!type && type === expected;
    }
    async function _fetchJSON(url){
      var r = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
      var j = await r.json().catch(function(){ return null; });
      if(!r.ok){
        var msg = (j && (j.message || j.error)) ? (j.message || j.error) : ('HTTP ' + r.status);
        throw new Error(msg);
      }
      return j;
    }
    function _getItems(payload){
      if(Array.isArray(payload)) return payload;
      if(payload && Array.isArray(payload.items)) return payload.items;
      return [];
    }
    function _sortByLabel(a, b){
      var la = String(a.label || '').trim();
      var lb = String(b.label || '').trim();
      return la.localeCompare(lb, 'ko', { sensitivity: 'base' });
    }
    async function _loadVpnFkData(){
      if(_vpnFkCache.promise) return _vpnFkCache.promise;
      _vpnFkCache.promise = (async function(){
        var vendorsPayload = await _fetchJSON('/api/vendor-manufacturers');
        var modelsPayload = await _fetchJSON('/api/hw-server-types');
        var vendors = _getItems(vendorsPayload);
        var modelsAll = _getItems(modelsPayload);
        var models = modelsAll.filter(function(m){ return _isVpnModelRow(m); });
        _vpnFkCache.vendors = vendors;
        _vpnFkCache.models = models;
        return _vpnFkCache;
      })().catch(function(err){
        console.warn('[VPN_DETAIL] FK load failed:', err);
        _vpnFkCache.vendors = [];
        _vpnFkCache.models = [];
        return _vpnFkCache;
      });
      return _vpnFkCache.promise;
    }
    function _buildSelectOptions(select, options, placeholder){
      if(!select) return;
      select.innerHTML = '';
      var opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = placeholder || '선택';
      select.appendChild(opt0);
      (options || []).forEach(function(o){
        var opt = document.createElement('option');
        opt.value = String(o.value);
        opt.textContent = String(o.label);
        select.appendChild(opt);
      });
    }
    function _ensureSelectedOption(select, value, label){
      if(!select) return;
      var v = (value == null ? '' : String(value)).trim();
      if(!v) return;
      var found = Array.from(select.options || []).some(function(o){ return String(o.value) === v; });
      if(!found){
        var opt = document.createElement('option');
        opt.value = v;
        opt.textContent = (label == null ? v : String(label));
        select.appendChild(opt);
      }
      select.value = v;
    }
    function _findVendorCodeByName(vendors, name){
      var nm = String(name || '').trim();
      if(!nm) return '';
      var hit = (vendors || []).find(function(v){
        return String(v && v.manufacturer_name || '').trim() === nm;
      });
      return hit ? String(hit.manufacturer_code || '').trim() : '';
    }
    function _findModelCodeByName(models, name){
      var nm = String(name || '').trim();
      if(!nm) return '';
      var hit = (models || []).find(function(m){
        return String(m && m.model_name || '').trim() === nm;
      });
      return hit ? String(hit.server_code || '').trim() : '';
    }
    function _buildVendorOptions(vendors, models){
      // Only show vendors that have VPN models.
      var allowed = new Set();
      (models || []).forEach(function(m){
        var code = String(m && m.manufacturer_code || '').trim();
        if(code) allowed.add(code);
      });
      var opts = (vendors || []).filter(function(v){
        var code = String(v && v.manufacturer_code || '').trim();
        return code && allowed.has(code);
      }).map(function(v){
        return { value: String(v.manufacturer_code || '').trim(), label: String(v.manufacturer_name || '').trim() || String(v.manufacturer_code || '').trim() };
      });
      opts.sort(_sortByLabel);
      return opts;
    }
    function _buildModelOptions(models, vendorCode){
      var code = String(vendorCode || '').trim();
      var filtered = (models || []).filter(function(m){
        if(!code) return true;
        return String(m && m.manufacturer_code || '').trim() === code;
      });
      var opts = filtered.map(function(m){
        return { value: String(m.server_code || '').trim(), label: String(m.model_name || '').trim() || String(m.server_code || '').trim() };
      });
      opts.sort(_sortByLabel);
      return opts;
    }
    async function _initVendorModelSelects(formEl, initial){
      if(!formEl || !formEl.querySelector) return;
      var vendorSel = formEl.querySelector('select[name="vendor"]');
      var modelSel  = formEl.querySelector('select[name="model"]');
      if(!vendorSel && !modelSel) return;
      var cache = await _loadVpnFkData();
      var vendors = cache.vendors || [];
      var models = cache.models || [];

      var vendorCode = (initial && (initial.vendor_code || initial.manufacturer_code)) ? String(initial.vendor_code || initial.manufacturer_code) : '';
      vendorCode = String(vendorCode || '').trim();
      if(!vendorCode && initial && initial.vendor){
        vendorCode = _findVendorCodeByName(vendors, initial.vendor);
      }
      var modelCode = (initial && (initial.model_code || initial.server_code)) ? String(initial.model_code || initial.server_code) : '';
      modelCode = String(modelCode || '').trim();
      if(!modelCode && initial && initial.model){
        modelCode = _findModelCodeByName(models, initial.model);
      }

      if(vendorSel){
        _buildSelectOptions(vendorSel, _buildVendorOptions(vendors, models), '선택');
        _ensureSelectedOption(vendorSel, vendorCode, (initial && initial.vendor) ? initial.vendor : null);
      }

      function rebuildModels(){
        if(!modelSel) return;
        var currentVendor = vendorSel ? String(vendorSel.value || '').trim() : '';
        var hasVendor = !!currentVendor;
        // Model is meaningful only after vendor is chosen.
        try {
          modelSel.disabled = !hasVendor;
        } catch (_eDis) {}

        // Keep searchable placeholder consistent with other pages.
        try {
          modelSel.dataset.placeholder = '모델 선택';
          modelSel.setAttribute('data-placeholder', '모델 선택');
        } catch (_ePh) {}

        if (!hasVendor) {
          _buildSelectOptions(modelSel, [], '제조사를 먼저 선택');
          try {
            modelSel.value = '';
            if (modelSel.dataset) modelSel.dataset.desiredValue = '';
          } catch (_eClr) {}
        } else {
          _buildSelectOptions(modelSel, _buildModelOptions(models, currentVendor), '선택');
          var desired = String(modelSel.dataset.desiredValue || modelCode || '').trim();
          if(desired){
            _ensureSelectedOption(modelSel, desired, (initial && initial.model) ? initial.model : null);
          }
        }

        // Ensure searchable UI reflects the new disabled state.
        try{
          if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
            window.BlossomSearchableSelect.syncAll(modelSel);
          }
        }catch(_eSync){ }
      }

      if(modelSel){
        if(modelCode){ modelSel.dataset.desiredValue = modelCode; }
        rebuildModels();
      }

      if(vendorSel && modelSel){
        vendorSel.addEventListener('change', function(){
          rebuildModels();
          try{
            if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
              window.BlossomSearchableSelect.syncAll(formEl);
            }
          }catch(_e){ }
        });
      }

      try{
        if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
          window.BlossomSearchableSelect.syncAll(formEl);
        }
      }catch(_e2){ }
    }
    function buildEditFormFromPage(){
      var form = document.getElementById(EDIT_FORM_ID); if(!form) return;
      // If tab31-basic-storage context, don't auto-build old groups
      var basicStoragePane = document.getElementById('basic');
      if(basicStoragePane && basicStoragePane.querySelector('#bs-physical-total')){
        // Populate modal fields from current values
        function t(id){ var el=document.getElementById(id); return el? (el.textContent||'').trim():''; }
        form.innerHTML = form.innerHTML; // ensure DOM exists
        var mappings = [
          ['bs-physical-total','bs-physical-total-input'],
          ['bs-logical-total','bs-logical-total-input'],
          ['bs-raid-level','bs-raid-level-input'],
          ['bs-allocated-total','bs-allocated-total-input'],
          ['bs-unallocated-total','bs-unallocated-total-input'],
          ['bs-cache-memory','bs-cache-memory-input'],
          ['bs-volume-count','bs-volume-count-input'],
          ['bs-host-count','bs-host-count-input'],
          ['bs-sync-enabled','bs-sync-enabled-input'],
          ['bs-sync-method','bs-sync-method-input'],
          ['bs-sync-storage','bs-sync-storage-input'],
          ['bs-phone','bs-phone-input']
        ];
        mappings.forEach(function(mp){ var v=t(mp[0]); var input=document.getElementById(mp[1]); if(input){ if(input.tagName==='SELECT'){ var opts=Array.from(input.options); var found=opts.find(function(o){ return (o.value||o.text)===v; }); if(found){ input.value = found.value; } } else { input.value = v; } } });
        // Wire auto-calc and constraint: logical <= physical; unallocated = logical - allocated
        var physEl = document.getElementById('bs-physical-total-input');
        var logiEl = document.getElementById('bs-logical-total-input');
        var allocEl = document.getElementById('bs-allocated-total-input');
        var unallocEl = document.getElementById('bs-unallocated-total-input');
        function recompute(){
          var p=parseCapacityToGB(physEl.value);
          var l=parseCapacityToGB(logiEl.value);
          var a=parseCapacityToGB(allocEl.value);
          if(isFinite(p) && isFinite(l) && l>p){
            // clamp logical to physical
            logiEl.value = formatGBToPretty(p);
            l=p;
          }
          if(isFinite(l) && isFinite(a)){
            var u = l - a; if(u<0) u=0; unallocEl.value = formatGBToPretty(u);
          } else {
            unallocEl.value = '';
          }
        }
        ;['input','change'].forEach(function(ev){ if(physEl) physEl.addEventListener(ev,recompute); if(logiEl) logiEl.addEventListener(ev,recompute); if(allocEl) allocEl.addEventListener(ev,recompute); });
        recompute();
        return; // skip legacy build
      }
      function text(sel){ var el=document.querySelector(sel); return (el? el.textContent.trim() : ''); }
      function setText(sel, value){
        try{
          var el = document.querySelector(sel);
          if(!el) return;
          var v = (value === 0) ? '0' : (value == null ? '' : String(value));
          v = v.trim();
          el.textContent = v || '-';
        }catch(_){ }
      }
      function badgeVal(sel){ var el=document.querySelector(sel); return (el? el.textContent.trim() : ''); }
      function cia(sel){ var el=document.querySelector(sel); return (el? el.textContent.trim() : ''); }
      var selectedRowData = null;
      try{
        var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'vpn';
        var raw = sessionStorage.getItem(storagePrefix+':selected:row') || localStorage.getItem(storagePrefix+':selected:row');
        if(raw){
          var selectedRow = JSON.parse(raw);
          selectedRowData = {};
          function isPlaceholderValue(s){
            var t = String(s == null ? '' : s).trim();
            if(!t) return true;
            // Common UI placeholder labels that must never be persisted/shown as real data.
            if(t === '선택' || t === '부서 선택' || t === '장소 선택') return true;
            if(t.indexOf('먼저 선택') > -1) return true;
            if(t === '-' || t === '—') return true;
            return false;
          }
          function take(k){
            if(selectedRow && selectedRow[k] != null){
              var v = String(selectedRow[k]).trim();
              if(v !== '' && !isPlaceholderValue(v)) selectedRowData[k] = v;
            }
          }

          // Business FK fields: prefer *_code for correct saving.
          selectedRowData.work_status = String((selectedRow.work_status_code != null ? selectedRow.work_status_code : (selectedRow.work_status || selectedRow.work_status_name || ''))).trim();
          selectedRowData.work_type = String((selectedRow.work_type_code != null ? selectedRow.work_type_code : (selectedRow.work_type || selectedRow.work_type_name || ''))).trim();
          selectedRowData.work_category = String((selectedRow.work_category_code != null ? selectedRow.work_category_code : (selectedRow.work_category || selectedRow.work_category_name || ''))).trim();
          selectedRowData.work_operation = String((selectedRow.work_operation_code != null ? selectedRow.work_operation_code : (selectedRow.work_operation || selectedRow.work_operation_name || ''))).trim();
          selectedRowData.work_group = String((selectedRow.work_group_code != null ? selectedRow.work_group_code : (selectedRow.work_group || selectedRow.work_group_name || ''))).trim();

          // Keep display labels too (used when we need to add missing selected options)
          take('work_status_name');
          take('work_type_name');
          take('work_category_name');
          take('work_operation_name');
          take('work_group_name');

          // Vendor/model codes for dependent dropdowns
          take('vendor_code');
          take('manufacturer_code');
          take('model_code');
          take('server_code');
          take('vendor');
          take('model');

          // Location codes (FK selects expect codes, not labels)
          if(selectedRow && selectedRow.location_place_code != null){
            selectedRowData.location_place = String(selectedRow.location_place_code).trim();
          }
          if(selectedRow && selectedRow.location_pos_code != null){
            selectedRowData.location_pos = String(selectedRow.location_pos_code).trim();
          }

          // Others
          ['work_name','system_name','system_ip','manage_ip','serial','virtualization','location_place','location_pos','slot','u_size','sys_dept','sys_owner','svc_dept','svc_owner','confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy']
            .forEach(take);
        }
      }catch(_e){ selectedRowData = null; }
  var data = selectedRowData || {
        work_type: badgeVal('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value'),
        work_category: badgeVal('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value'),
  work_status: text('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text'),
        work_operation: text('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value'),
        work_group: badgeVal('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value'),
        work_name: text('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value'),
        system_name: text('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value'),
        system_ip: text('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value'),
        manage_ip: text('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value'),
        vendor: badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value'),
        model: badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value'),
        serial: text('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value'),
        virtualization: badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value'),
        location_place: badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value'),
        location_pos: badgeVal('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value'),
        slot: text('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value'),
        u_size: text('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value'),
        sys_dept: badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value'),
        sys_owner: badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value'),
        svc_dept: badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value'),
        svc_owner: badgeVal('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value'),
        confidentiality: cia('.basic-info-card:nth-child(4) .info-row:nth-child(1) .num-badge'),
        integrity: cia('.basic-info-card:nth-child(4) .info-row:nth-child(2) .num-badge'),
        availability: cia('.basic-info-card:nth-child(4) .info-row:nth-child(3) .num-badge'),
        security_score: cia('.basic-info-card:nth-child(4) .info-row:nth-child(4) .num-badge'),
        system_grade: text('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value'),
        core_flag: text('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value'),
        dr_built: (function(){ var el=document.querySelector('.basic-info-card:nth-child(4) .info-row:nth-child(7) .ox-badge'); return el? el.textContent.trim() : ''; })(),
        svc_redundancy: (function(){ var el=document.querySelector('.basic-info-card:nth-child(4) .info-row:nth-child(8) .ox-badge'); return el? el.textContent.trim() : ''; })()
      };

      // Page header (parity with onpremise detail): show work name + system name
      setText('.page-header h1', data.work_name || '-');
      setText('.page-header p', data.system_name || '-');
      var GROUPS = [
        { title:'비즈니스', cols:['work_type','work_category','work_status','work_operation','work_group','work_name','system_name','system_ip','manage_ip'] },
        { title:'시스템', cols:['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','rack_face'] },
        { title:'담당자', cols:['sys_dept','sys_owner','svc_dept','svc_owner'] },
        { title:'점검', cols:['confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'] }
      ];
      function escAttr(v){
        return String(v == null ? '' : v)
          .replace(/&/g,'&amp;')
          .replace(/"/g,'&quot;')
          .replace(/</g,'&lt;')
          .replace(/>/g,'&gt;');
      }
      function fieldInput(col, value){
        var fkFields = {
          work_status:true, work_type:true, work_category:true, work_operation:true, work_group:true,
          location_place:true, location_pos:true, sys_dept:true, sys_owner:true, svc_dept:true, svc_owner:true
        };
        var opts={
          virtualization:['','물리','가상'],
          confidentiality:['','1','2','3'], integrity:['','1','2','3'], availability:['','1','2','3'],
          system_grade:['','1등급','2등급','3등급'], core_flag:['','핵심','일반'], dr_built:['','O','X'], svc_redundancy:['','O','X']
        };
        var v = (value == null) ? '' : String(value);
        if(col==='security_score') return '<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="'+(value||'')+'">';
        if(opts[col]){
          return '<select name="'+col+'" class="form-input search-select '+(['confidentiality','integrity','availability'].indexOf(col)>-1?'score-trigger':'')+'" data-searchable="true">'+
            opts[col].map(function(o){ return '<option value="'+o+'" '+(String(o)===String(value)?'selected':'')+'>'+(o||'-')+'</option>'; }).join('')+
          '</select>';
        }
        if(fkFields[col]){
          var parent = '';
          if(col==='location_pos') parent = ' data-parent-field="location_place"';
          if(col==='sys_owner') parent = ' data-parent-field="sys_dept"';
          if(col==='svc_owner') parent = ' data-parent-field="svc_dept"';
          return '<select name="'+col+'" class="form-input search-select fk-select" data-fk="'+col+'" data-searchable="true" data-initial-value="'+escAttr(v)+'"'+parent+'><option value="">선택</option></select>';
        }
        if(col==='vendor'){
          return '<select name="vendor" class="form-input search-select fk-select" data-fk="vendor" data-searchable="true" data-initial-value="'+escAttr(v)+'"><option value="">선택</option></select>';
        }
        if(col==='model'){
          return '<select name="model" class="form-input search-select fk-select" data-fk="model" data-searchable="true" data-depends-on="vendor" data-initial-value="'+escAttr(v)+'"><option value="">선택</option></select>';
        }
        if(col==='rack_face'){
            var selF=(value||'').toUpperCase()==='REAR'||value==='후면'?'':' selected';
            var selR=(value||'').toUpperCase()==='REAR'||value==='후면'?' selected':'';
            return '<select name="rack_face" class="form-input search-select" data-searchable="true" data-placeholder="선택"><option value="">선택</option><option value="FRONT"'+selF+'>전면</option><option value="REAR"'+selR+'>후면</option></select>';
        }
        if(['slot','u_size'].indexOf(col)>-1) return '<input name="'+col+'" type="number" min="0" step="1" class="form-input" value="'+(value||'')+'">';
        return '<input name="'+col+'" class="form-input" value="'+(value||'')+'">';
      }
      var html = GROUPS.map(function(g){
        var grid = g.cols.map(function(c){ var meta=COLUMN_META[c]||{label:c}; return '<div class="form-row"><label>'+(c==='security_score'?'보안 점수':meta.label)+'</label>'+ fieldInput(c, data[c]) +'</div>'; }).join('');
        return '<div class="form-section"><div class="section-header"><h4>'+g.title+'</h4></div><div class="form-grid">'+grid+'</div></div>';
      }).join('');
      form.innerHTML = html;
      // Prefill values before FK/searchable enhancers run.
      // fk_select.js relies on select.value or dataset._initialValue to restore selection.
      try{
        Array.prototype.forEach.call(form.querySelectorAll('[data-initial-value]'), function(el){
          if(!el) return;
          var v = String(el.getAttribute('data-initial-value') || '').trim();
          if(!v) return;
          try {
            if(el.tagName === 'SELECT'){
              el.value = v;
              if(el.dataset) el.dataset._initialValue = v;
            } else {
              el.value = v;
            }
          } catch (_eSet) {}
        });
      }catch(_ePrefill){ }

      // Let global FK/select enhancer populate FK selects inside this modal.
      try{
        if(window.BlossomFkSelect && typeof window.BlossomFkSelect.enhance === 'function'){
          window.BlossomFkSelect.enhance(document.getElementById(EDIT_MODAL_ID) || form);
        }
      }catch(_eEnh){ }

      // Dependency clear/disable rules (parent cleared -> child cleared+disabled)
      (function(){
        function syncSearchableSelect(selectEl){
          try{
            if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
              window.BlossomSearchableSelect.syncAll(selectEl);
            }
          }catch(_e){ }
        }
        function clearAndDisableOnParentEmpty(parentName, childName){
          var parentEl = form.querySelector('[name="'+parentName+'"]');
          var childEl = form.querySelector('[name="'+childName+'"]');
          if(!parentEl || !childEl) return;
          if(parentEl.dataset.parentChildBound === '1') return;
          parentEl.dataset.parentChildBound = '1';
          function apply(){
            if(!String(parentEl.value||'').trim()){
              childEl.value = '';
              childEl.disabled = true;
              childEl.classList.add('fk-disabled');
              syncSearchableSelect(childEl);
            } else {
              childEl.disabled = false;
              childEl.classList.remove('fk-disabled');
              syncSearchableSelect(childEl);
            }
          }
          parentEl.addEventListener('change', apply);
          apply();
        }
        clearAndDisableOnParentEmpty('location_place','location_pos');
        clearAndDisableOnParentEmpty('sys_dept','sys_owner');
        clearAndDisableOnParentEmpty('svc_dept','svc_owner');
      })();
      attachSecurityScoreRecalc(EDIT_FORM_ID);
      attachVirtualizationHandler(EDIT_FORM_ID);
      try{ _initVendorModelSelects(form, data); }catch(_eInit){ }
    }

    function attachSecurityScoreRecalc(formId){
      var form=document.getElementById(formId); if(!form) return;
      var scoreInput=form.querySelector('input[name="security_score"]'); if(!scoreInput) return;
      function recompute(){
        var c=parseInt(form.querySelector('[name="confidentiality"]').value||'0',10)||0;
        var i=parseInt(form.querySelector('[name="integrity"]').value||'0',10)||0;
        var a=parseInt(form.querySelector('[name="availability"]').value||'0',10)||0;
        var total=c+i+a; scoreInput.value = total? total: '';
        var gradeField=form.querySelector('[name="system_grade"]'); if(gradeField){ if(total>=8) gradeField.value='1등급'; else if(total>=6) gradeField.value='2등급'; else if(total>0) gradeField.value='3등급'; }
      }
      ['confidentiality','integrity','availability'].forEach(function(n){ var el=form.querySelector('[name="'+n+'"]'); if(el) el.addEventListener('change',recompute); });
      recompute();
    }

    function enforceVirtualizationDash(form){
      if(!form) return; var virt=form.querySelector('[name="virtualization"]'); if(!virt) return;
      var v=String(virt.value||'').trim();
      var dashText=['vendor','model','serial','location_pos']; var dashNum=['slot','u_size','rack_face'];
      function setDash(el){ if(!el) return; el.value='-'; }
      function clearIfDash(el, t){ if(!el) return; if(el.value==='-') el.value=''; if(t){ try{ el.type=t; }catch(_){} } }
      if(v==='가상'){
        dashText.forEach(function(n){ setDash(form.querySelector('[name="'+n+'"]')); });
        dashNum.forEach(function(n){ var el=form.querySelector('[name="'+n+'"]'); if(!el) return; if(!el.dataset.origType){ el.dataset.origType=el.type||'number'; } try{ el.type='text'; }catch(_){} setDash(el); });
      } else {
        dashText.forEach(function(n){ clearIfDash(form.querySelector('[name="'+n+'"]')); });
        dashNum.forEach(function(n){ var el=form.querySelector('[name="'+n+'"]'); if(!el) return; var orig=el.dataset.origType||'number'; clearIfDash(el, orig); if(el.type==='number'){ el.min='0'; el.step='1'; } });
      }
    }
    function attachVirtualizationHandler(formId){ var form=document.getElementById(formId); if(!form) return; var sel=form.querySelector('[name="virtualization"]'); if(!sel) return; sel.addEventListener('change', function(){ enforceVirtualizationDash(form); }); enforceVirtualizationDash(form); }

    function updatePageFromForm(){
      var form=document.getElementById(EDIT_FORM_ID); if(!form) return;

      // Tab31 basic-storage support
      var isBasicStorage = !!document.getElementById('bs-physical-total');
      if(isBasicStorage){
        function setTextById(id, val){ var el=document.getElementById(id); if(el) el.textContent = String(val||''); }
        function valById(id){ var el=form.querySelector('#'+id); return el? el.value : ''; }
        // Ensure constraints: logical <= physical and unallocated = logical - allocated
        var pGB=parseCapacityToGB(valById('bs-physical-total-input'));
        var lGB=parseCapacityToGB(valById('bs-logical-total-input'));
        if(isFinite(pGB) && isFinite(lGB) && lGB>pGB){ lGB = pGB; }
        var aGB=parseCapacityToGB(valById('bs-allocated-total-input'));
        var uGB = (isFinite(lGB)&&isFinite(aGB)) ? Math.max(0, lGB - aGB) : NaN;
        setTextById('bs-physical-total', valById('bs-physical-total-input'));
        setTextById('bs-logical-total', isFinite(lGB)? formatGBToPretty(lGB): valById('bs-logical-total-input'));
        setTextById('bs-raid-level', valById('bs-raid-level-input'));
        setTextById('bs-allocated-total', valById('bs-allocated-total-input'));
        setTextById('bs-unallocated-total', isFinite(uGB)? formatGBToPretty(uGB): valById('bs-unallocated-total-input'));
        setTextById('bs-cache-memory', valById('bs-cache-memory-input'));
        setTextById('bs-volume-count', valById('bs-volume-count-input'));
        setTextById('bs-host-count', valById('bs-host-count-input'));
        // Update O/X badge for 동기화 여부
        (function(){
          var badge = document.getElementById('bs-sync-enabled');
          if(badge){
            var vv = valById('bs-sync-enabled-input');
            var isOn = (vv==='O');
            badge.textContent = isOn ? 'O' : 'X';
            badge.classList.remove('on','off');
            badge.classList.add(isOn ? 'on' : 'off');
            badge.setAttribute('aria-label', isOn ? '예' : '아니오');
          }
        })();
        setTextById('bs-sync-method', valById('bs-sync-method-input'));
        setTextById('bs-sync-storage', valById('bs-sync-storage-input'));
        setTextById('bs-phone', valById('bs-phone-input'));
        return; // do not run legacy update
      }

      function setText(sel, val){
        try{
          var el=document.querySelector(sel);
          if(!el) return;
          var v = (val === 0) ? '0' : (val == null ? '' : String(val));
          v = v.trim();
          el.textContent = v || '-';
        }catch(_e){ }
      }
      function setBadge(sel, val){ setText(sel, val); }
      function readField(name){
        var el=form.querySelector('[name="'+name+'"]');
        if(!el) return { code:'', label:'' };
        if(el.tagName==='SELECT'){
          var code = String(el.value||'');
          // If value is empty, treat as truly empty (do NOT use placeholder option text).
          if(!code.trim()) return { code:'', label:'' };
          var opt = (el.options && el.selectedIndex >= 0) ? el.options[el.selectedIndex] : null;
          var lbl = opt ? String(opt.textContent||'').trim() : '';
          return { code: code.trim(), label: (lbl || code).trim() };
        }
        var vv = String(el.value||'');
        return { code: vv.trim(), label: vv.trim() };
      }
      function v(name){ return readField(name).label; }
      function c(name){ return readField(name).code; }

      setText('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text', v('work_status'));
      try{
        var pill = document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill');
        if(pill){
          var dot=pill.querySelector('.status-dot');
          var lbl=v('work_status');
          var cls=(lbl==='가동'?'ws-run': (lbl==='유휴'?'ws-idle':'ws-wait'));
          if(dot){ dot.classList.remove('ws-run','ws-idle','ws-wait'); dot.classList.add(cls); }
        }
      }catch(_e){ }

      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value', v('work_type'));
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value', v('work_category'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value', v('work_operation'));
      setBadge('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value', v('work_group'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value', v('work_name'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value', v('system_name'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value', v('system_ip'));
      setText('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value', v('manage_ip'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value', v('vendor'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value', v('model'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value', v('serial'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value', v('virtualization'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value', v('location_place'));
      setBadge('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value', v('location_pos'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value', v('slot'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value', v('u_size'));
      setText('.basic-info-card:nth-child(2) .info-row:nth-child(9) .info-value', (item.rack_face === 'REAR') ? '후면' : '전면');
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value', v('sys_dept'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value', v('sys_owner'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value', v('svc_dept'));
      setBadge('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value', v('svc_owner'));
      function setNumBadge(sel, num){
        var badge=document.querySelector(sel);
        if(!badge) return;
        var s = (num === 0) ? '0' : (num == null ? '' : String(num));
        s = s.trim();
        badge.textContent = s || '-';
        var n=parseInt(s,10);
        badge.classList.remove('tone-1','tone-2','tone-3');
        if(!isNaN(n)) badge.classList.add(n>=3?'tone-3':(n===2?'tone-2':'tone-1'));
      }
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(1) .num-badge', v('confidentiality'));
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(2) .num-badge', v('integrity'));
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(3) .num-badge', v('availability'));
      setNumBadge('.basic-info-card:nth-child(4) .info-row:nth-child(4) .num-badge', v('security_score'));
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value', v('system_grade'));
      setText('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value', v('core_flag'));
      function setOX(rowSel, name){
        var el=document.querySelector(rowSel+' .ox-badge');
        if(!el) return;
        var raw=v(name);
        var vv = (raw == null ? '' : String(raw)).trim();
        // Workstation parity: empty values show '-' with no on/off class.
        if(vv === '-' || vv === '—') vv = '';
        var ox = '';
        if(vv){
          ox = (vv === 'X' || vv === '0' || vv.toLowerCase() === 'false') ? 'X' : 'O';
        }
        el.classList.remove('on','off');
        if(!ox){
          el.textContent = '-';
          try{ el.setAttribute('aria-label',''); }catch(_e0){}
          return;
        }
        el.textContent = ox;
        try{ el.setAttribute('aria-label', ox); }catch(_e1){}
        el.classList.add(ox === 'O' ? 'on' : 'off');
      }
      // Update OX badges for DR 구축여부 and 서비스 이중화
      setOX('.basic-info-card:nth-child(4) .info-row:nth-child(7)', 'dr_built');
      setOX('.basic-info-card:nth-child(4) .info-row:nth-child(8)', 'svc_redundancy');

      // Persist full row context (codes + labels) for cross-tab + next modal open.
      try{
        var storagePrefix = (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'vpn';
        var raw = sessionStorage.getItem(storagePrefix+':selected:row') || localStorage.getItem(storagePrefix+':selected:row');
        var obj = raw ? (JSON.parse(raw) || {}) : {};
        // Business FK codes
        obj.work_status_code = c('work_status');
        obj.work_type_code = c('work_type');
        obj.work_category_code = c('work_category');
        obj.work_operation_code = c('work_operation');
        obj.work_group_code = c('work_group');
        // Location FK codes
        obj.location_place_code = c('location_place');
        obj.location_pos_code = c('location_pos');
        // Business display
        obj.work_status_name = v('work_status');
        obj.work_type_name = v('work_type');
        obj.work_category_name = v('work_category');
        obj.work_operation_name = v('work_operation');
        obj.work_group_name = v('work_group');
        obj.work_status_display = v('work_status');
        obj.work_type_display = v('work_type');
        obj.work_category_display = v('work_category');
        obj.work_operation_display = v('work_operation');
        obj.work_group_display = v('work_group');

        // Vendor/model codes
        obj.vendor_code = c('vendor');
        obj.model_code = c('model');
        // Vendor/model display
        obj.vendor = v('vendor');
        obj.model = v('model');

        // Common fields
        obj.work_name = v('work_name');
        obj.system_name = v('system_name');
        obj.system_ip = v('system_ip');
        obj.manage_ip = v('manage_ip');
        obj.serial = v('serial');
        obj.virtualization = v('virtualization');
        obj.location_place = v('location_place');
        obj.location_pos = v('location_pos');
        obj.slot = v('slot');
        obj.u_size = v('u_size');
        obj.sys_dept = v('sys_dept');
        obj.sys_owner = v('sys_owner');
        obj.svc_dept = v('svc_dept');
        obj.svc_owner = v('svc_owner');
        obj.confidentiality = v('confidentiality');
        obj.integrity = v('integrity');
        obj.availability = v('availability');
        obj.security_score = v('security_score');
        obj.system_grade = v('system_grade');
        obj.core_flag = v('core_flag');
        obj.dr_built = v('dr_built');
        obj.svc_redundancy = v('svc_redundancy');

        try{ sessionStorage.setItem(storagePrefix+':selected:row', JSON.stringify(obj)); }catch(_s0){}
        try{ localStorage.setItem(storagePrefix+':selected:row', JSON.stringify(obj)); }catch(_s1){}
      }catch(_persist){ }

      // Persist key hardware fields for cross-tab usage (hardware tab system row)
      try{
        var vendorVal = v('vendor');
        var modelVal  = v('model');
        var serialVal = v('serial');
        var slotVal   = v('slot');
        var uSizeVal  = v('u_size');
        // Use VTL-specific keys to avoid cross-page contamination
  localStorage.setItem('vpn:current:vendor', String(vendorVal||''));
  localStorage.setItem('vpn:current:model',  String(modelVal||''));
  localStorage.setItem('vpn:current:serial', String(serialVal||''));
  localStorage.setItem('vpn:current:slot',   String(slotVal||''));
  localStorage.setItem('vpn:current:u_size', String(uSizeVal||''));
      }catch(_){ }
    }
    // Legacy Basic Info modal wiring disabled.
    // The API-backed modal is wired in wireEditModal() above.

      // [Tabs moved to /static/js/_detail/tab*.js]


    // ---------- Authority table interactions (tab06-authority) ----------
    (function(){
      var table = document.getElementById('au-spec-table'); if(!table) return;
      var empty = document.getElementById('au-empty');
      // CSV helpers (selection-aware)
      function auEscapeCSV(val){ return '"' + String(val).replace(/"/g,'""') + '"'; }
      // Saved-only helpers: exclude rows currently in inline edit mode
      function auRowSaved(tr){ var t=tr.querySelector('.js-au-toggle'); var inEdit=t && t.getAttribute('data-action')==='save'; if(inEdit) return false; return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea'); }
      function auVisibleRows(){ var tbody=table.querySelector('tbody'); if(!tbody) return []; return Array.from(tbody.querySelectorAll('tr')).filter(function(tr){ return !(tr.hasAttribute('data-hidden') || tr.style.display==='none'); }); }
      function auSavedVisibleRows(){ return auVisibleRows().filter(auRowSaved); }
      function auExportCSV(onlySelected){
        var tbody = table.querySelector('tbody'); if(!tbody) return;
        var headers = ['구분','대상','동작','명령(옵션)','비고'];
        var trs = auSavedVisibleRows();
        if(onlySelected){ trs = trs.filter(function(tr){ var cb = tr.querySelector('.au-row-check'); return cb && cb.checked; }); }
        if(trs.length===0) return;
        function text(tr, col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : ''; }
        var rows = trs.map(function(tr){ return ['type','target','action','command','remark'].map(function(c){ return text(tr,c); }); });
        var lines = [headers].concat(rows).map(function(arr){ return arr.map(auEscapeCSV).join(','); });
        var csv = '\uFEFF' + lines.join('\r\n');
        var d=new Date(); var yyyy=d.getFullYear(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0');
        var filename = 'authority_'+yyyy+mm+dd+'.csv';
        try{ var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }
        catch(_){ var a2=document.createElement('a'); a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a2.download=filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2); }
      }
      // Pagination (parity with Change Log)
      var auState = { page:1, pageSize:10 };
  (function initPageSize(){ try{ var saved=localStorage.getItem('vpn:au:pageSize'); var sel=document.getElementById('au-page-size'); if(sel){ if(saved && ['10','20','50','100'].indexOf(saved)>-1){ auState.pageSize=parseInt(saved,10); sel.value=saved; } sel.addEventListener('change', function(){ var v=parseInt(sel.value,10); if(!isNaN(v)){ auState.page=1; auState.pageSize=v; localStorage.setItem('vpn:au:pageSize', String(v)); auRenderPage(); } }); } }catch(_){ } })();
      var infoEl=document.getElementById('au-pagination-info'); var numWrap=document.getElementById('au-page-numbers'); var btnFirst=document.getElementById('au-first'); var btnPrev=document.getElementById('au-prev'); var btnNext=document.getElementById('au-next'); var btnLast=document.getElementById('au-last');
      function auRows(){ var tbody=table.querySelector('tbody'); return tbody? Array.from(tbody.querySelectorAll('tr')): []; }
      function auTotal(){ return auRows().length; }
      function auPages(){ var total=auTotal(); return Math.max(1, Math.ceil(total / auState.pageSize)); }
      function auClampPage(){ var pages=auPages(); if(auState.page>pages) auState.page=pages; if(auState.page<1) auState.page=1; }
      function auRenderPage(){ auClampPage(); var rows=auRows(); var startIdx=(auState.page-1)*auState.pageSize; var endIdx=startIdx + auState.pageSize - 1; rows.forEach(function(tr,idx){ var visible=idx>=startIdx && idx<=endIdx; tr.style.display = visible? '' : 'none'; if(visible){ tr.removeAttribute('data-hidden'); } else { tr.setAttribute('data-hidden','1'); } var cb=tr.querySelector('.au-row-check'); if(cb){ tr.classList.toggle('selected', !!cb.checked && visible); } }); auUpdatePaginationUI(); var sa=document.getElementById('au-select-all'); if(sa){ var visChecks=table.querySelectorAll('tbody tr:not([data-hidden]) .au-row-check'); if(visChecks.length){ sa.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { sa.checked=false; } } }
      function auUpdatePaginationUI(){ if(infoEl){ var total=auTotal(); var start = total? (auState.page-1)*auState.pageSize+1 : 0; var end=Math.min(total, auState.page*auState.pageSize); infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목'; } if(numWrap){ var pages=auPages(); numWrap.innerHTML=''; for(var p=1;p<=pages && p<=50;p++){ var b=document.createElement('button'); b.className='page-btn'+(p===auState.page?' active':''); b.textContent=String(p); b.dataset.page=String(p); numWrap.appendChild(b); } } var pages2=auPages(); if(btnFirst) btnFirst.disabled=(auState.page===1); if(btnPrev) btnPrev.disabled=(auState.page===1); if(btnNext) btnNext.disabled=(auState.page===pages2); if(btnLast) btnLast.disabled=(auState.page===pages2); var sizeSel=document.getElementById('au-page-size'); if(sizeSel){ var none=(auTotal()===0); sizeSel.disabled=none; if(none){ try{ sizeSel.value='10'; auState.pageSize=10; }catch(_){ } } } }
      function auGo(p){ auState.page=p; auRenderPage(); }
      function auGoDelta(d){ auGo(auState.page + d); }
      function auGoFirst(){ auGo(1); }
      function auGoLast(){ auGo(auPages()); }
      if(numWrap){ numWrap.addEventListener('click', function(e){ var b=e.target.closest('button.page-btn'); if(!b) return; var p=parseInt(b.dataset.page,10); if(!isNaN(p)) auGo(p); }); }
      if(btnFirst) btnFirst.addEventListener('click', auGoFirst);
      if(btnPrev) btnPrev.addEventListener('click', function(){ auGoDelta(-1); });
      if(btnNext) btnNext.addEventListener('click', function(){ auGoDelta(1); });
      if(btnLast) btnLast.addEventListener('click', auGoLast);
      function updateEmptyState(){
        try{
          var hasRows = table.querySelector('tbody tr') != null;
          if(empty){ empty.hidden = !!hasRows; empty.style.display = hasRows ? 'none' : ''; }
        }catch(_){ if(empty){ empty.hidden = false; empty.style.display = ''; } }
        // CSV button enable/disable and pagination sync
        var csvBtn=document.getElementById('au-download-btn'); if(csvBtn){ var has=!!table.querySelector('tbody tr'); csvBtn.disabled = !has; csvBtn.setAttribute('aria-disabled', (!has).toString()); csvBtn.title = has? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.'; }
        auRenderPage();
      }
      function wireCommandDependency(root){
        try{
          var typeSel = root.querySelector('td[data-col="type"] select');
          var cmdInp = root.querySelector('td[data-col="command"] input');
          if(!typeSel || !cmdInp) return;
          function apply(){ var en = (typeSel.value === 'sudo'); cmdInp.disabled = !en; }
          typeSel.addEventListener('change', apply);
          apply();
        }catch(_){ }
      }
      updateEmptyState();

      // Select all (visible rows only)
      var selectAll = document.getElementById('au-select-all');
      if(selectAll){
        selectAll.addEventListener('change', function(){
          var checks = table.querySelectorAll('.au-row-check:not([disabled])');
          checks.forEach(function(c){ var tr=c.closest('tr'); var hidden=tr && (tr.hasAttribute('data-hidden') || tr.style.display==='none'); if(!hidden){ c.checked = !!selectAll.checked; } if(tr){ tr.classList.toggle('selected', !!c.checked && !hidden); } });
        });
      }

      // Row click toggling and selection syncing
      table.addEventListener('click', function(ev){ (function(){ var tr=ev.target.closest('tr'); if(!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase()!=='tbody') return; var isControl=ev.target.closest('button, a, input, select, textarea, label'); var onCheckbox=ev.target.closest('input[type="checkbox"].au-row-check'); if(isControl && !onCheckbox) return; if(onCheckbox) return; var cb=tr.querySelector('.au-row-check'); if(!cb) return; var hidden=tr.hasAttribute('data-hidden') || tr.style.display==='none'; if(hidden) return; cb.checked = !cb.checked; tr.classList.toggle('selected', cb.checked); var sa=document.getElementById('au-select-all'); if(sa){ var visChecks=table.querySelectorAll('tbody tr:not([data-hidden]) .au-row-check'); if(visChecks.length){ sa.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { sa.checked=false; } } })(); });
      table.addEventListener('change', function(ev){ var cb=ev.target.closest('.au-row-check'); if(!cb) return; var tr=cb.closest('tr'); if(tr){ var hidden=tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cb.checked && !hidden); } var sa=document.getElementById('au-select-all'); if(sa){ var visChecks=table.querySelectorAll('tbody tr:not([data-hidden]) .au-row-check'); if(visChecks.length){ sa.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { sa.checked=false; } } });

      // CSV modal wiring
      (function(){
        var btn=document.getElementById('au-download-btn');
        var modalId='au-download-modal';
        var closeBtn=document.getElementById('au-download-close');
        var confirmBtn=document.getElementById('au-download-confirm');
        function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
        function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
  if(btn){ btn.addEventListener('click', function(){ if(btn.disabled) return; var saved=auSavedVisibleRows(); var total=saved.length; if(total<=0) return; var selectedCount = saved.filter(function(tr){ var cb=tr.querySelector('.au-row-check'); return cb && cb.checked; }).length; var subtitle=document.getElementById('au-download-subtitle'); if(subtitle){ subtitle.textContent = selectedCount>0 ? ('선택된 '+selectedCount+'개 또는 전체 '+total+'개 결과 중 범위를 선택하세요.') : ('현재 결과 '+total+'개 항목을 CSV로 내보냅니다.'); } var rowSelectedWrap=document.getElementById('au-csv-range-row-selected'); var optSelected=document.getElementById('au-csv-range-selected'); var optAll=document.getElementById('au-csv-range-all'); if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount>0); if(optSelected){ optSelected.disabled = !(selectedCount>0); optSelected.checked = selectedCount>0; } if(optAll){ optAll.checked = !(selectedCount>0); } openModalLocal(modalId); }); }
        if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); }
        var modalEl=document.getElementById(modalId);
        if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); }); }
        if(confirmBtn){ confirmBtn.addEventListener('click', function(){ var onlySel = !!(document.getElementById('au-csv-range-selected') && document.getElementById('au-csv-range-selected').checked); auExportCSV(onlySel); closeModalLocal(modalId); }); }
      })();

      // Add row
      var addBtn = document.getElementById('au-row-add');
      if(addBtn){
        addBtn.addEventListener('click', function(){
          var tbody = table.querySelector('tbody'); if(!tbody) return;
          var tr = document.createElement('tr');
          tr.innerHTML = `
            <td><input type=\"checkbox\" class=\"au-row-check\" aria-label=\"행 선택\"></td>
            <td data-col=\"type\">
              <select>
                <option value=\"\" selected disabled>선택</option>
                <option value=\"sudo\">sudo</option>
                <option value=\"cron.allow\">cron.allow</option>
                <option value=\"cron.deny\">cron.deny</option>
                <option value=\"at.allow\">at.allow</option>
                <option value=\"at.deny\">at.deny</option>
              </select>
            </td>
            <td data-col=\"target\"><input type=\"text\" placeholder=\"예: user01, %wheel, %admin\"></td>
            <td data-col=\"action\">
              <select>
                <option value=\"\" selected disabled>선택</option>
                <option value=\"allow\">allow</option>
                <option value=\"deny\">deny</option>
              </select>
            </td>
            <td data-col=\"command\"><input type=\"text\" placeholder=\"sudo일 때만 활성화 (예: ALL, /usr/bin/systemctl)\"></td>
            <td data-col=\"remark\"><input type=\"text\" placeholder=\"비고\"></td>
            <td class=\"system-actions table-actions\">
              <button class=\"action-btn js-au-toggle\" data-action=\"save\" type=\"button\" title=\"저장\" aria-label=\"저장\"><img src=\"/static/image/svg/save.svg\" alt=\"저장\" class=\"action-icon\"></button>
              <button class=\"action-btn danger js-au-del\" data-action=\"delete\" type=\"button\" title=\"삭제\" aria-label=\"삭제\"><img src=\"/static/image/svg/list/free-icon-trash.svg\" alt=\"삭제\" class=\"action-icon\"></button>
            </td>`;
          tbody.appendChild(tr);
          try{ auGoLast(); }catch(_){ }
          updateEmptyState();
          wireCommandDependency(tr);
        });
      }

      // Delegate actions
      table.addEventListener('click', function(ev){
        var target = ev.target.closest('.js-au-del, .js-au-edit, .js-au-commit, .js-au-toggle'); if(!target) return;
        var tr = ev.target.closest('tr'); if(!tr) return;

        // delete
        if(target.classList.contains('js-au-del')){
          if(tr && tr.parentNode){ tr.parentNode.removeChild(tr); }
          try{ auClampPage(); }catch(_){ }
          updateEmptyState();
          return;
        }

        // edit -> save
        if(
          target.classList.contains('js-au-edit') ||
          (target.classList.contains('js-au-toggle') && target.getAttribute('data-action') === 'edit')
        ){
          function toInput(name, placeholder){
            var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return;
            var current = (td.textContent||'').trim();
            if(name==='type'){
              var tv = current; if(tv==='-') tv='';
              var topts = ['<option value=""'+(tv?'':' selected')+' disabled>선택</option>',
                '<option value="sudo"'+(tv==='sudo'?' selected':'')+'>sudo</option>',
                '<option value="cron.allow"'+(tv==='cron.allow'?' selected':'')+'>cron.allow</option>',
                '<option value="cron.deny"'+(tv==='cron.deny'?' selected':'')+'>cron.deny</option>',
                '<option value="at.allow"'+(tv==='at.allow'?' selected':'')+'>at.allow</option>',
                '<option value="at.deny"'+(tv==='at.deny'?' selected':'')+'>at.deny</option>'].join('');
              td.innerHTML = '<select>'+topts+'</select>';
              return;
            }
            if(name==='action'){
              var av = current; if(av==='-') av='';
              var aopts = ['<option value=""'+(av?'':' selected')+' disabled>선택</option>',
                '<option value="allow"'+(av==='allow'?' selected':'')+'>allow</option>',
                '<option value="deny"'+(av==='deny'?' selected':'')+'>deny</option>'].join('');
              td.innerHTML = '<select>'+aopts+'</select>';
              return;
            }
            td.innerHTML = '<input type="text" value="'+current+'" placeholder="'+(placeholder||'')+'">';
          }
          ['type','target','action','command','remark'].forEach(function(n){ toInput(n); });
          wireCommandDependency(tr);
          var toggleBtn = tr.querySelector('.js-au-toggle');
          if(toggleBtn){
            toggleBtn.setAttribute('data-action','save');
            toggleBtn.title='저장'; toggleBtn.setAttribute('aria-label','저장');
            toggleBtn.innerHTML='<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
          } else {
            var actions = tr.querySelector('.table-actions');
            if(actions){ actions.classList.add('system-actions'); actions.innerHTML = '<button class="action-btn js-au-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button> <button class="action-btn danger js-au-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'; }
          }
        }
      });
    })();

    // tab15-file is handled by /static/js/_detail/tab15-file.js

    
    // tab04-interface is handled by /static/js/_detail/tab04-interface.js
      if(addBtn){
        addBtn.addEventListener('click', function(){
          var tbody = table.querySelector('tbody'); if(!tbody) return;
          var tr = document.createElement('tr');
          tr.innerHTML = `
            <td><input type="checkbox" class="vl-row-check" aria-label="행 선택"></td>
            <td data-col="category"><input type="text" placeholder="분류 (필수)"></td>
            <td data-col="item"><input type="text" placeholder="점검항목 (필수)"></td>
              <td data-col="space">
                <select>
                  <option value="" selected disabled>공간 선택 (필수)</option>
                  ${Array.from({length: bayCount}, function(_,i){ var v='BAY'+(i+1); return '<option value="'+v+'">'+v+'</option>'; }).join('')}
                </select>
              </td>
            </td>
            <td data-col="action">
              <select>
                <option value="" selected disabled>선택</option>
                <option value="O">O</option>
                <option value="X">X</option>
              </select>
            </td>
            <td data-col="remark"><input type="text" placeholder="비고"></td>
            <td class="system-actions table-actions">
              <button class="action-btn js-vl-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>
              <button class="action-btn danger js-vl-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>
            </td>`;
          tbody.appendChild(tr);
          updateEmptyState();
        });
      }

      // Detail modal wiring (for 점검내용)
      var detailModal = document.getElementById('vl-detail-modal');
      var detailText = document.getElementById('vl-detail-text');
      var detailLabel = document.getElementById('vl-detail-label');
      var detailClose = document.getElementById('vl-detail-close');
      var detailSave = document.getElementById('vl-detail-save');
      var activeDetailTarget = null; // { tr, col }
      function openDetail(labelText, currentVal){
        if(!detailModal) return; document.body.classList.add('modal-open');
        if(detailLabel) detailLabel.textContent = labelText || '세부내용';
        if(detailText) detailText.value = currentVal || '';
        detailModal.classList.add('show'); detailModal.setAttribute('aria-hidden','false');
        if(detailText){ try{ detailText.focus(); }catch(_){} }
      }
      function closeDetail(){
        if(!detailModal) return; detailModal.classList.remove('show'); detailModal.setAttribute('aria-hidden','true');
        if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); }
      // tab07-activate is handled by /static/js/_detail/tab07-activate.js
                var cv = current; if(cv==='-') cv='';
*/
