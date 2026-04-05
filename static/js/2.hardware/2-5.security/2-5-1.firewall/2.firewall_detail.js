// firewall_detail.js: Firewall detail shared behaviors (basic info + edit modal + context)
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
        : 'firewall';
    try {
      if (!window.STORAGE_PREFIX) window.STORAGE_PREFIX = STORAGE_PREFIX;
    } catch (_e0) {}

    var API_ENDPOINT = '/api/hardware/security/firewall/assets';
    var DEVICE_TYPE_TOKEN = 'FW';
    var DEFAULT_TITLE = '방화벽';

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
        alert(String(msg || ''));
      } catch (_e) {}
    }

    async function apiJSON(url, options) {
      var opts = options || {};
      var headers = opts.headers || {};
      headers['Accept'] = 'application/json';
      if (opts.body != null) headers['Content-Type'] = 'application/json';

      var res = await fetch(url, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body,
        credentials: 'same-origin',
      });

      var data = null;
      try {
        data = await res.json();
      } catch (_e) {
        data = null;
      }
      if (!res.ok || !data || data.success === false) {
        var msg =
          data && (data.message || data.error)
            ? data.message || data.error
            : 'HTTP ' + res.status;
        throw new Error(msg);
      }
      return data;
    }

    function _tryRemoveStorageKey(key) {
      try {
        sessionStorage.removeItem(key);
      } catch (_eS) {}
      try {
        localStorage.removeItem(key);
      } catch (_eL) {}
    }

    function clearStoredSelection() {
      _tryRemoveStorageKey(STORAGE_PREFIX + ':selected:asset_id');
      _tryRemoveStorageKey(STORAGE_PREFIX + ':selected:row');
    }

    function isNotFoundError(err) {
      if (!err) return false;
      try {
        if (err.status === 404) return true;
      } catch (_e0) {}
      var msg = '';
      try {
        msg = String(err.message || err);
      } catch (_e1) {
        msg = '';
      }
      msg = msg.toLowerCase();
      return msg.indexOf('404') >= 0 || msg.indexOf('not found') >= 0;
    }

    async function apiJSONSafe(url, options) {
      var opts = options || {};
      var headers = opts.headers || {};
      headers['Accept'] = 'application/json';
      if (opts.body != null) headers['Content-Type'] = 'application/json';

      var res;
      try {
        res = await fetch(url, {
          method: opts.method || 'GET',
          headers: headers,
          body: opts.body,
          credentials: 'same-origin',
        });
      } catch (e) {
        var errNet = new Error('네트워크 오류');
        errNet.cause = e;
        throw errNet;
      }

      var text = '';
      try {
        text = await res.text();
      } catch (_eT) {
        text = '';
      }

      var data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (_eJ) {
          data = null;
        }
      }

      if (!res.ok || !data || data.success === false) {
        var msg =
          data && (data.message || data.error)
            ? data.message || data.error
            : text
              ? String(text).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 200)
              : 'HTTP ' + res.status;
        var err = new Error(msg);
        err.status = res.status;
        err.data = data;
        err.responseText = text;
        throw err;
      }

      return data;
    }

    function escapeHTML(v) {
      return String(v || '').replace(/[&<>"']/g, function (c) {
        return (
          {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          }[c] || c
        );
      });
    }

    function hexToRgbArray(hex) {
      if (!hex) return null;
      var s = String(hex).trim();
      if (!s) return null;
      if (s[0] === '#') s = s.slice(1);
      if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
      if (s.length !== 6) return null;
      var r = parseInt(s.slice(0, 2), 16);
      var g = parseInt(s.slice(2, 4), 16);
      var b = parseInt(s.slice(4, 6), 16);
      if ([r, g, b].some(function (n) {
        return isNaN(n);
      }))
        return null;
      return [r, g, b];
    }

    // NOTE: Keep "업무 상태" pill styling identical to on-premise detail.
    // Do NOT replace the pill markup; only update its dot class + text.

    function renderNumBadge(value, kind) {
      var s = String(value == null ? '' : value).trim();
      if (!s) return '<span class="cell-num"><span class="num-badge">-</span></span>';

      var n = parseInt(s, 10);
      var tone = 'tone-1';
      if (!isNaN(n)) {
        if (kind === 'security_score') tone = n >= 8 ? 'tone-3' : n >= 6 ? 'tone-2' : 'tone-1';
        else tone = n >= 3 ? 'tone-3' : n === 2 ? 'tone-2' : 'tone-1';
      }

      var show = isNaN(n) ? escapeHTML(s) : String(n);
      if (String(show).trim() === '-' || isNaN(n)) {
        return '<span class="cell-num"><span class="num-badge">' + (String(show).trim() ? show : '-') + '</span></span>';
      }
      return '<span class="cell-num"><span class="num-badge ' + tone + '">' + show + '</span></span>';
    }

    function deviceTypeToken(value) {
      var raw = String(value || '').trim();
      if (!raw) return '';
      var lowered = raw.toLowerCase();
      var compact = lowered.replace(/[\s\-_]/g, '');
      if (compact === 'fw' || compact === 'firewall' || lowered.indexOf('방화벽') > -1) return 'FW';
      if (compact === 'vpn') return 'VPN';
      if (compact === 'ids') return 'IDS';
      if (compact === 'ips') return 'IPS';
      return raw.toUpperCase();
    }

    async function ensureMasters() {
      if (masterCache) return masterCache;

      var endpoints = {
        workStatuses: '/api/work-statuses',
        vendors: '/api/vendor-manufacturers',
        securityModels: '/api/hw-security-types',
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

      try {
        var sec = (masterCache.securityModels || []).filter(function (it) {
          var t = deviceTypeToken(it.security_type || it.hw_type || it.type || it.form_factor);
          return t === DEVICE_TYPE_TOKEN;
        });
        masterCache.models = sec
          .map(function (it) {
            return {
              server_code: it.security_code || it.server_code || '',
              model_name: it.model_name || it.security_name || '',
              manufacturer_code: it.manufacturer_code || '',
            };
          })
          .filter(function (it) {
            return !!it.server_code;
          });
      } catch (_e2) {
        masterCache.models = [];
      }

      return masterCache;
    }

    function buildSelect(name, items, valueKey, labelFn, selectedValue, extraClass) {
      var sel = String(selectedValue == null ? '' : selectedValue);
      var opts = ['<option value="">-</option>'];
      (items || []).forEach(function (it) {
        var val = it && it[valueKey] != null ? String(it[valueKey]) : '';
        if (!val) return;
        var label = labelFn ? String(labelFn(it, val) || '') : val;
        if (!label) label = val;
        var selected = val === sel ? ' selected' : '';
        opts.push('<option value="' + escapeHTML(val) + '"' + selected + '>' + escapeHTML(label) + '</option>');
      });
      var cls = 'form-input' + (extraClass ? ' ' + String(extraClass) : '');
      return '<select name="' + escapeHTML(name) + '" class="' + escapeHTML(cls) + '">' + opts.join('') + '</select>';
    }

    var REQUIRED_MODAL_FIELDS = [{ name: 'work_status' }, { name: 'work_name' }, { name: 'system_name' }];

    function applyRequiredRulesToModalForm(form) {
      if (!form) return;
      REQUIRED_MODAL_FIELDS.forEach(function (f) {
        var el = form.querySelector('[name="' + f.name + '"]');
        if (!el) return;
        try {
          el.setAttribute('required', 'required');
        } catch (_e) {}
      });
    }

    function validateRequiredModalForm(form) {
      if (!form) return true;
      var firstInvalid = null;
      REQUIRED_MODAL_FIELDS.forEach(function (f) {
        var el = form.querySelector('[name="' + f.name + '"]');
        if (!el) return;
        var v = el.value == null ? '' : String(el.value).trim();
        if (!v) {
          if (!firstInvalid) firstInvalid = el;
          try {
            el.classList.add('input-error');
          } catch (_e1) {}
        } else {
          try {
            el.classList.remove('input-error');
          } catch (_e2) {}
        }
      });
      if (firstInvalid) {
        try {
          firstInvalid.focus();
        } catch (_e3) {}
        return false;
      }
      return true;
    }

    function captureInitialFormValues(form) {
      if (!form) return;
      try {
        Array.from(form.querySelectorAll('input[name], select[name], textarea[name]')).forEach(function (el) {
          try {
            el.dataset.initialValue = String(el.value == null ? '' : el.value);
            delete el.dataset.userCleared;
          } catch (_e) {}
        });
      } catch (_e2) {}
    }

    function markUserCleared(el) {
      if (!el) return;
      try {
        el.dataset.userCleared = '1';
      } catch (_e) {}
    }

    function wireBasicInfoDependencies(form) {
      if (!form) return;
      function clearValue(el) {
        if (!el) return;
        try {
          el.value = '';
        } catch (_e) {}
        markUserCleared(el);
      }

      var vendor = form.querySelector('[name="vendor"]');
      var model = form.querySelector('[name="model"]');
      if (vendor && model) {
        function applyVendor() {
          var has = !!(vendor.value && String(vendor.value).trim());
          if (!has) {
            clearValue(model);
            model.disabled = true;
          } else {
            model.disabled = false;
          }
        }
        vendor.addEventListener('change', applyVendor);
        applyVendor();
      }
    }

    function resolveAssetId() {
      try {
        var qs = new URLSearchParams(location.search || '');
        // NOTE: Do not accept generic `?id=` here.
        // It is used across modules and can contaminate asset resolution when navigating.
        var cand = qs.get('hardware_id') || qs.get('hardwareId') || qs.get('asset_id') || qs.get('assetId');
        var n1 = parseInt(cand, 10);
        if (!isNaN(n1) && n1 > 0) return n1;
      } catch (_e) {}

      // Prefer the page-scoped prefix, but also try the canonical 'firewall' prefix.
      // This avoids blank pages when a global STORAGE_PREFIX gets set by other modules.
      var prefixes = [STORAGE_PREFIX];
      if (STORAGE_PREFIX !== 'firewall') prefixes.push('firewall');

      for (var pi = 0; pi < prefixes.length; pi++) {
        var pfx = prefixes[pi];
        try {
          var raw =
            sessionStorage.getItem(pfx + ':selected:asset_id') ||
            localStorage.getItem(pfx + ':selected:asset_id');
          var n2 = parseInt(raw, 10);
          if (!isNaN(n2) && n2 > 0) return n2;
        } catch (_e2) {}

        try {
          var rawRow =
            sessionStorage.getItem(pfx + ':selected:row') ||
            localStorage.getItem(pfx + ':selected:row');
          if (rawRow) {
            var row = JSON.parse(rawRow);
            var id = row && (row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id));
            var n3 = parseInt(id, 10);
            if (!isNaN(n3) && n3 > 0) return n3;
          }
        } catch (_e3) {}
      }

      return null;
    }

    function stripAssetIdFromUrl() {
      try {
        var u = new URL(window.location.href);
        var changed = false;
        ['asset_id', 'assetId', 'id'].forEach(function (k) {
          try {
            if (u.searchParams.has(k)) {
              u.searchParams.delete(k);
              changed = true;
            }
          } catch (_e0) {}
        });
        if (!changed) return;
        history.replaceState(null, document.title, u.pathname + (u.search || '') + (u.hash || ''));
      } catch (_e1) {}
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

    function applyAssetItemToPage(item) {
      if (!item) return;

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
        // Prefer replacing the visible value slot (varies by row: pill/num/ox/value).
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
            // Fallback: the first non-label child.
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
        // If this is a pill, keep structure and only update its text.
        if (host.classList && host.classList.contains('status-pill')) {
          var txtEl = host.querySelector('.status-text');
          if (txtEl) txtEl.textContent = s ? s : '-';
          else host.textContent = s ? s : '-';
          return;
        }
        host.textContent = s ? s : '-';
      }

      function setInfoRowHTML(cardIdx, rowIdx, html, fallbackText) {
        var row = document.querySelector('.basic-info-card:nth-child(' + cardIdx + ') .info-row:nth-child(' + rowIdx + ')');
        if (!row) return;
        // Replace the visible value container (varies by row).
        var host =
          row.querySelector('.status-pill') ||
          row.querySelector('.cell-num') ||
          row.querySelector('.cell-ox') ||
          row.querySelector('.info-value') ||
          row.querySelector('.info-value');
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
        var h = html == null ? '' : String(html);
        if (h && h.trim() && h !== '-') {
          // Keep on-premise pill markup: never replace .status-pill.
          if (host.classList && host.classList.contains('status-pill')) {
            host.textContent = (fallbackText != null && String(fallbackText).trim()) ? String(fallbackText) : '-';
            return;
          }
          // For other containers (num/ox), swapping is safe.
          if (host.classList && (host.classList.contains('cell-num') || host.classList.contains('cell-ox'))) {
            try {
              host.outerHTML = h;
              return;
            } catch (_eSwap) {}
          }
          host.innerHTML = h;
        } else {
          host.textContent = (fallbackText != null && String(fallbackText).trim()) ? String(fallbackText) : '-';
        }
      }

      function setWorkStatusPill(cardIdx, rowIdx, value) {
        var row = document.querySelector('.basic-info-card:nth-child(' + cardIdx + ') .info-row:nth-child(' + rowIdx + ')');
        if (!row) return;
        var pill = row.querySelector('.status-pill');
        if (!pill) return;
        var s = String(value == null ? '' : value).trim();
        var txt = pill.querySelector('.status-text');
        if (txt) txt.textContent = s ? s : '-';
        var dot = pill.querySelector('.status-dot');
        if (dot) {
          try {
            dot.classList.remove('ws-run', 'ws-idle', 'ws-wait');
          } catch (_e0) {}
          var cls = s === '가동' ? 'ws-run' : s === '유휴' ? 'ws-idle' : 'ws-wait';
          try {
            dot.classList.add(cls);
          } catch (_e1) {}
        }
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

      function renderOxBadge(v) {
        var s = String(v == null ? '' : v).trim().toUpperCase();
        if (!(s === 'O' || s === 'X')) s = '-';
        var cls = s === 'O' ? 'on' : s === 'X' ? 'off' : 'is-empty';
        return '<span class="cell-ox with-badge"><span class="ox-badge ' + cls + '">' + escapeHTML(s) + '</span></span>';
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

      // Hydrate 기본정보 grid
      try {
        if (document.querySelector('.basic-info-grid')) {
          var wsLabel = String(pick(item, ['work_status_name', 'work_status_label', 'work_status', 'work_status_code']) || '-').trim() || '-';
          setWorkStatusPill(1, 1, wsLabel);
          setInfoRowValue(1, 2, pick(item, ['work_type_name', 'work_type']));
          setInfoRowValue(1, 3, pick(item, ['work_category_name', 'work_category']));
          setInfoRowValue(1, 4, pick(item, ['work_operation_name', 'work_operation']));
          setInfoRowValue(1, 5, pick(item, ['work_group_name', 'work_group']));
          setInfoRowValue(1, 6, pick(item, ['work_name']));
          setInfoRowValue(1, 7, pick(item, ['system_name']));
          setInfoRowValue(1, 8, pick(item, ['system_ip']));
          setInfoRowValue(1, 9, pick(item, ['mgmt_ip', 'manage_ip']));

          setInfoRowValue(2, 1, pick(item, ['manufacturer_name', 'vendor', 'vendor_name']));
          setInfoRowValue(2, 2, pick(item, ['server_model_name', 'model_name', 'model', 'server_code']));
          setInfoRowValue(2, 3, pick(item, ['serial_number', 'serial']));
          setInfoRowValue(2, 4, pick(item, ['virtualization_type', 'virtualization']));
          setInfoRowValue(2, 5, pick(item, ['center_name', 'location_place']));
          setInfoRowValue(2, 6, pick(item, ['rack_name', 'location_pos']));
          setInfoRowValue(2, 7, pick(item, ['slot', 'system_slot']));
          setInfoRowValue(2, 8, pick(item, ['u_size', 'system_size']));
          setInfoRowValue(2, 9, (pick(item, ['rack_face']) === 'REAR') ? '후면' : '전면');

          // Prefer human-readable names; fall back to normalized display fields; finally show codes if that's all we have.
          setInfoRowValue(3, 1, pick(item, ['system_dept_name', 'sys_dept', 'system_dept_code']));
          setInfoRowValue(3, 2, pick(item, ['system_owner_name', 'sys_owner', 'system_owner_emp_no']));
          setInfoRowValue(3, 3, pick(item, ['service_dept_name', 'svc_dept', 'service_dept_code']));
          setInfoRowValue(3, 4, pick(item, ['service_owner_name', 'svc_owner', 'service_owner_emp_no']));

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

      // Persist key hardware fields for other tabs (system row)
      try {
        localStorage.setItem(STORAGE_PREFIX + ':current:vendor', String(pick(item, ['manufacturer_name', 'vendor', 'vendor_name']) || ''));
        localStorage.setItem(STORAGE_PREFIX + ':current:model', String(pick(item, ['server_model_name', 'model_name', 'model', 'server_code']) || ''));
        localStorage.setItem(STORAGE_PREFIX + ':current:serial', String(pick(item, ['serial_number', 'serial']) || ''));
        localStorage.setItem(STORAGE_PREFIX + ':current:slot', String(pick(item, ['slot', 'system_slot']) || ''));
        localStorage.setItem(STORAGE_PREFIX + ':current:u_size', String(pick(item, ['u_size', 'system_size']) || ''));
        localStorage.setItem(STORAGE_PREFIX + ':current:rack_face', String(pick(item, ['rack_face']) || ''));
      } catch (_eStore) {}
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
            initial = el.dataset && Object.prototype.hasOwnProperty.call(el.dataset, 'initialValue')
              ? String(el.dataset.initialValue || '')
              : null;
          } catch (_e0) {
            initial = null;
          }

          var userCleared = false;
          try {
            userCleared = !!(el.dataset && el.dataset.userCleared === '1');
          } catch (_e1) {
            userCleared = false;
          }

          if ((initial != null && String(initial).trim() !== '') || userCleared) payload[payloadKey] = null;
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

    // Edit modal: match list/on-premise modal internal content.
    var COLUMN_META = {
      work_type: { label: '업무 분류' },
      work_category: { label: '업무 구분' },
      work_status: { label: '업무 상태' },
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
      svc_redundancy: { label: '서비스 이중화' },
    };

    function escapeAttr(v) {
      return String(v == null ? '' : v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function getStoredSelectedRow() {
      try {
        var raw =
          sessionStorage.getItem(STORAGE_PREFIX + ':selected:row') ||
          localStorage.getItem(STORAGE_PREFIX + ':selected:row');
        if (!raw) return null;
        var row = JSON.parse(raw);
        return row || null;
      } catch (_e) {
        return null;
      }
    }

    function mergeWithDisplayFallback(apiItem, storedRow) {
      if (!apiItem && !storedRow) return null;
      var merged = {};

      if (storedRow && typeof storedRow === 'object') {
        Object.keys(storedRow).forEach(function (k) {
          merged[k] = storedRow[k];
        });
      }

      if (apiItem && typeof apiItem === 'object') {
        Object.keys(apiItem).forEach(function (k) {
          var apiVal = apiItem[k];
          var storedVal = merged[k];
          var apiStr = String(apiVal == null ? '' : apiVal).trim();
          var storedStr = String(storedVal == null ? '' : storedVal).trim();

          var apiMeaningful = apiVal != null && apiStr !== '' && apiStr !== '-';
          var storedMeaningful = storedVal != null && storedStr !== '' && storedStr !== '-';

          if (apiMeaningful || !storedMeaningful) merged[k] = apiVal;
        });
      }

      return merged;
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

      // Work fields: list-row uses work_type_code/work_category_code;
      // DB/API uses work_category_code/work_division_code.
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

      // FK fields are handled by BlossomFkSelect (input -> select + options + deps)
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
        ].indexOf(col) > -1
      ) {
        // NOTE: fk_select.js has a defensive rule that prevents auto-conversion of
        // input[name="model"] -> select on hardware pages unless explicitly allowed.
        // Allow it here so "시스템 모델명" becomes searchable dropdown.
        var allow = col === 'model' ? ' data-fk-allow="1"' : '';
        return '<input name="' + escapeHTML(col) + '" class="form-input" value="' + escapeAttr(v) + '"' + allow + '>';
      }

      if (col === 'security_score') {
        return (
          '<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="' +
          escapeAttr(numberValue(v)) +
          '">' 
        );
      }

      if (opts[col]) {
        var isScoreField = ['confidentiality', 'integrity', 'availability'].indexOf(col) > -1;
        var cls = 'form-input search-select' + (isScoreField ? ' score-trigger' : '');
        return (
          '<select name="' +
          escapeHTML(col) +
          '" class="' +
          cls +
          '" data-searchable="true" data-placeholder="선택">' +
          opts[col]
            .map(function (o) {
              var ov = String(o);
              var sel = ov === String(v) ? ' selected' : '';
              return '<option value="' + escapeAttr(ov) + '"' + sel + '>' + escapeHTML(ov || '-') + '</option>';
            })
            .join('') +
          '</select>'
        );
      }

      if (col === 'rack_face') {
        var selF = (v||'').toUpperCase()==='REAR'||v==='후면' ? '' : ' selected';
        var selR = (v||'').toUpperCase()==='REAR'||v==='후면' ? ' selected' : '';
        return '<select name="rack_face" class="form-input search-select" data-searchable="true" data-placeholder="선택"><option value="">선택</option><option value="FRONT"'+selF+'>전면</option><option value="REAR"'+selR+'>후면</option></select>';
      }
      if (['slot', 'u_size'].indexOf(col) > -1) {
        return (
          '<input name="' +
          escapeHTML(col) +
          '" type="number" min="0" step="1" class="form-input" value="' +
          escapeAttr(numberValue(v)) +
          '">' 
        );
      }

      return '<input name="' + escapeHTML(col) + '" class="form-input" value="' + escapeAttr(v) + '">';
    }

    function attachSecurityScoreRecalc(formId) {
      var form = document.getElementById(formId);
      if (!form) return;
      var scoreInput = form.querySelector('input[name="security_score"]');
      if (!scoreInput) return;

      function recompute() {
        var c = parseInt((form.querySelector('[name="confidentiality"]') || {}).value || '0', 10) || 0;
        var i = parseInt((form.querySelector('[name="integrity"]') || {}).value || '0', 10) || 0;
        var a = parseInt((form.querySelector('[name="availability"]') || {}).value || '0', 10) || 0;
        var total = c + i + a;
        scoreInput.value = total ? String(total) : '';

        var gradeField = form.querySelector('[name="system_grade"]');
        if (gradeField) {
          if (total >= 8) gradeField.value = '1등급';
          else if (total >= 6) gradeField.value = '2등급';
          else if (total > 0) gradeField.value = '3등급';
        }
      }

      ['confidentiality', 'integrity', 'availability'].forEach(function (n) {
        var el = form.querySelector('[name="' + n + '"]');
        if (el) el.addEventListener('change', recompute);
      });
      recompute();
    }

    function enforceVirtualizationDash(form) {
      if (!form) return;
      var virt = form.querySelector('[name="virtualization"]');
      if (!virt) return;
      var v = String(virt.value || '').trim();
      var dashTargetsText = ['vendor', 'model', 'serial', 'location_pos'];
      var dashTargetsNumber = ['slot', 'u_size', 'rack_face'];

      function makeDash(el) {
        if (!el) return;
        if (String(el.tagName || '').toUpperCase() === 'SELECT') {
          el.value = '';
        } else {
          el.value = '-';
        }
      }

      function clearIfDash(el, fallbackType) {
        if (!el) return;
        if (String(el.tagName || '').toUpperCase() === 'SELECT') return;
        if (el.value === '-') el.value = '';
        if (fallbackType) {
          try {
            el.type = fallbackType;
          } catch (_e) {}
        }
      }

      if (v === '가상') {
        dashTargetsText.forEach(function (name) {
          var el = form.querySelector('[name="' + name + '"]');
          if (el) makeDash(el);
        });
        dashTargetsNumber.forEach(function (name) {
          var el = form.querySelector('[name="' + name + '"]');
          if (!el) return;
          if (!el.dataset.origType) el.dataset.origType = el.type || 'number';
          try {
            el.type = 'text';
          } catch (_e) {}
          makeDash(el);
        });
      } else {
        dashTargetsText.forEach(function (name) {
          var el = form.querySelector('[name="' + name + '"]');
          if (el) clearIfDash(el);
        });
        dashTargetsNumber.forEach(function (name) {
          var el = form.querySelector('[name="' + name + '"]');
          if (!el) return;
          var orig = el.dataset.origType || 'number';
          clearIfDash(el, orig);
          if (el.type === 'number') {
            el.min = '0';
            el.step = '1';
          }
        });
      }
    }

    function attachVirtualizationHandler(formId) {
      var form = document.getElementById(formId);
      if (!form) return;
      var virt = form.querySelector('[name="virtualization"]');
      if (!virt) return;
      virt.addEventListener('change', function () {
        enforceVirtualizationDash(form);
      });
      enforceVirtualizationDash(form);
    }

    function buildEditFormFromRow(row, fallbackItem) {
      var form = document.getElementById(EDIT_FORM_ID);
      if (!form) return;

      // Merge list-row (display + *_code fields) with API item (DB column keys) so modal can hydrate even when opened directly.
      var source = mergeWithDisplayFallback(fallbackItem || {}, row || {});

      var groups = [
        {
          title: '비즈니스',
          cols: ['work_type', 'work_category', 'work_status', 'work_operation', 'work_group', 'work_name', 'system_name', 'system_ip', 'manage_ip'],
        },
        {
          title: '시스템',
          cols: ['vendor', 'model', 'serial', 'virtualization', 'location_place', 'location_pos', 'slot', 'u_size', 'rack_face'],
        },
        {
          title: '담당자',
          cols: ['sys_dept', 'sys_owner', 'svc_dept', 'svc_owner'],
        },
        {
          title: '점검',
          cols: ['confidentiality', 'integrity', 'availability', 'security_score', 'system_grade', 'core_flag', 'dr_built', 'svc_redundancy'],
        },
      ];

      form.innerHTML = '';
      groups.forEach(function (g) {
        var section = document.createElement('div');
        section.className = 'form-section';
        section.innerHTML = '<div class="section-header"><h4>' + escapeHTML(g.title) + '</h4></div>';
        var grid = document.createElement('div');
        grid.className = 'form-grid';
        g.cols.forEach(function (c) {
          if (!COLUMN_META[c] && c !== 'security_score') return;
          var wrap = document.createElement('div');
          wrap.className = 'form-row';
          var labelText = c === 'security_score' ? '보안 점수' : (COLUMN_META[c] && COLUMN_META[c].label) || c;
          var valueForField = getFieldValueForEdit(source, c);
          wrap.innerHTML = '<label>' + escapeHTML(labelText) + '</label>' + generateFieldInput(c, valueForField);
          grid.appendChild(wrap);
        });
        section.appendChild(grid);
        form.appendChild(section);
      });

      // FK select + searchable-select enhancer
      try {
        var modalRoot = document.getElementById(EDIT_MODAL_ID) || form.closest('.modal-overlay-full');
        if (window.BlossomFkSelect && typeof window.BlossomFkSelect.enhance === 'function' && modalRoot) {
          window.BlossomFkSelect.enhance(modalRoot, { forcePopulate: true });
        }
      } catch (_eFk) {}
      try {
        var modalRoot2 = document.getElementById(EDIT_MODAL_ID) || form.closest('.modal-overlay-full');
        if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function' && modalRoot2) {
          window.BlossomSearchableSelect.syncAll(modalRoot2);
        }
      } catch (_eSearch) {}

      applyRequiredRulesToModalForm(form);
      wireBasicInfoDependencies(form);
      attachSecurityScoreRecalc(EDIT_FORM_ID);
      attachVirtualizationHandler(EDIT_FORM_ID);
      captureInitialFormValues(form);
    }

    // buildEditFormFromAssetItem removed in favor of buildEditFormFromRow(row)

    async function loadAssetAndRender(assetId) {
      var data = await apiJSONSafe(API_ENDPOINT + '/' + assetId, { method: 'GET' });
      currentAssetItem = data.item;
      var storedRow = null;
      try {
        storedRow = getStoredSelectedRow();
      } catch (_e0) {
        storedRow = null;
      }
      applyAssetItemToPage(mergeWithDisplayFallback(currentAssetItem, storedRow));

      try {
        sessionStorage.setItem(STORAGE_PREFIX + ':selected:asset_id', String(assetId));
      } catch (_e2) {}
      try {
        localStorage.setItem(STORAGE_PREFIX + ':selected:asset_id', String(assetId));
      } catch (_e3) {}

      // Keep canonical keys in sync (helps cross-tab navigation on firewall pages).
      if (STORAGE_PREFIX !== 'firewall') {
        try {
          sessionStorage.setItem('firewall:selected:asset_id', String(assetId));
        } catch (_e4) {}
        try {
          localStorage.setItem('firewall:selected:asset_id', String(assetId));
        } catch (_e5) {}
      }
    }

    async function bootstrapBasicInfo() {
      if (!document.getElementById('page-title')) return;

      var aid = resolveAssetId();
      if (!aid) return;
      currentAssetId = aid;

      try {
        if (currentAssetItem && (currentAssetItem.id === aid || String(currentAssetItem.id) === String(aid))) {
          var storedRow0 = null;
          try {
            storedRow0 = getStoredSelectedRow();
          } catch (_e0) {
            storedRow0 = null;
          }
          applyAssetItemToPage(mergeWithDisplayFallback(currentAssetItem, storedRow0));
          return;
        }
        await loadAssetAndRender(aid);
      } catch (err) {
        console.warn('[' + STORAGE_PREFIX + '-detail] bootstrap failed:', err);
        try {
          if (isNotFoundError(err)) {
            clearStoredSelection();
            currentAssetId = null;
            currentAssetItem = null;
          }
        } catch (_eC) {}
      }
    }

    (function () {
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
        try {
          var focusable = el.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
          if (focusable && typeof focusable.focus === 'function') focusable.focus();
          else {
            el.setAttribute('tabindex', '-1');
            el.focus && el.focus();
          }
        } catch (_eF) {}
      }

      function closeModalLocal(id) {
        var el = document.getElementById(id);
        if (!el) return;
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
          el.setAttribute('inert', '');
        } catch (_eI) {}
        if (!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open');
      }

      var openBtn = document.getElementById(EDIT_OPEN_ID);
      if (openBtn) {
        openBtn.addEventListener('click', async function () {
          try {
            if (!currentAssetId) currentAssetId = resolveAssetId();
            if (currentAssetId && !currentAssetItem) await loadAssetAndRender(currentAssetId);
          } catch (err) {
            console.warn('[' + STORAGE_PREFIX + '-detail] load before modal failed:', err);
            try {
              if (isNotFoundError(err)) {
                clearStoredSelection();
                currentAssetId = null;
                currentAssetItem = null;
              }
            } catch (_eC) {}
          }

          try {
            var storedRow = getStoredSelectedRow();
            buildEditFormFromRow(storedRow, currentAssetItem);
          } catch (_e0) {}

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
            var data = await apiJSONSafe(API_ENDPOINT + '/' + currentAssetId, {
              method: 'PUT',
              body: JSON.stringify(payload),
            });

            // PUT response may not include joined/display fields; refetch for reliable UI sync.
            try {
              var fresh = await apiJSONSafe(API_ENDPOINT + '/' + currentAssetId, { method: 'GET' });
              currentAssetItem = (fresh && fresh.item) ? fresh.item : (data ? data.item : null);
            } catch (_eGet) {
              currentAssetItem = data.item;
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
            try {
              if (isNotFoundError(err)) {
                clearStoredSelection();
                currentAssetId = null;
                currentAssetItem = null;
              }
            } catch (_eC2) {}
            notify(err && err.message ? err.message : '저장 중 오류가 발생했습니다.', 'error');
          } finally {
            try {
              saveBtn.disabled = false;
            } catch (_e3) {}
          }
        });
      }
    })();

    // Fast paint from stored row (helps title/subtitle on tab pages)
    try {
      var storedFast = getStoredSelectedRow();
      if (storedFast) {
        try {
          applyAssetItemToPage(mergeWithDisplayFallback(storedFast, storedFast));
        } catch (_eFast0) {
          applyAssetItemToPage(storedFast);
        }
      }
    } catch (_eFast1) {}

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
