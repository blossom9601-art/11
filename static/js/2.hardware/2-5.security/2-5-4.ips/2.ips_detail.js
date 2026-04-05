      // ips_detail.js: IPS detail shared behaviors (basic info + edit modal + context)
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
          var STORAGE_PREFIX = typeof window !== 'undefined' && window.STORAGE_PREFIX ? String(window.STORAGE_PREFIX) : 'ips';
          try {
            if (!window.STORAGE_PREFIX) window.STORAGE_PREFIX = STORAGE_PREFIX;
          } catch (_e0) {}

          var API_ENDPOINT = '/api/hardware/security/ips/assets';
          var DEVICE_TYPE_TOKEN = 'IPS';
          var DEFAULT_TITLE = 'IPS';

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
            vendor: 'manufacturer_code',
            model: 'server_code',
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

          function cleanPlaceholderValue(value) {
            var s = String(value == null ? '' : value).trim();
            if (!s) return '';
            if (s === '-') return '';
            if (s === '선택') return '';
            if (s === '부서를 먼저 선택' || s === '제조사를 먼저 선택' || s === '장소를 먼저 선택') return '';
            if (/선택$/.test(s)) return '';
            return s;
          }

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
              var msg = data && (data.message || data.error) ? data.message || data.error : 'HTTP ' + res.status;
              var err = new Error(msg);
              try {
                err.httpStatus = res.status;
                err.responseData = data;
                err.requestUrl = url;
              } catch (_e0) {}
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
            if ([r, g, b].some(function (n) { return isNaN(n); })) return null;
            return [r, g, b];
          }

          function renderWorkStatusPill(label, customColor, tokenClass) {
            var v = String(label == null ? '-' : label);
            var txt = escapeHTML(v && v.trim() ? v : '-');
            if (customColor) {
              var rgb = hexToRgbArray(customColor);
              var styleParts = ['--status-dot-color:' + String(customColor)];
              if (rgb) {
                var rgbStr = rgb.join(',');
                styleParts.push('--status-bg-color:rgba(' + rgbStr + ',0.16)');
                styleParts.push('--status-border-color:rgba(' + rgbStr + ',0.45)');
              }
              var styleAttr = styleParts.length ? ' style="' + styleParts.join(';') + '"' : '';
              return (
                '<span class="status-pill colored"' +
                styleAttr +
                '><span class="status-dot" aria-hidden="true"></span><span class="status-text">' +
                txt +
                '</span></span>'
              );
            }
            var cls = String(tokenClass || '').trim();
            if (!cls) {
              if (v === '가동') cls = 'ws-run';
              else if (v === '유휴') cls = 'ws-idle';
              else cls = 'ws-wait';
            }
            return (
              '<span class="status-pill"><span class="status-dot ' +
              escapeHTML(cls) +
              '" aria-hidden="true"></span><span class="status-text">' +
              txt +
              '</span></span>'
            );
          }

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

          async function ensureMasters() {
            if (masterCache) return masterCache;

            var endpoints = {
              workTypes: '/api/work-categories',
              workCategories: '/api/work-divisions',
              workStatuses: '/api/work-statuses',
              workOperations: '/api/work-operations',
              workGroups: '/api/work-groups',
              vendors: '/api/vendor-manufacturers',
              securityModels: '/api/hw-security-types',
              centers: '/api/org-centers',
              departments: '/api/org-departments',
            };

            var res = await Promise.all([
              apiJSON(endpoints.workTypes, { method: 'GET' }).catch(function () { return { items: [] }; }),
              apiJSON(endpoints.workCategories, { method: 'GET' }).catch(function () { return { items: [] }; }),
              apiJSON(endpoints.workStatuses, { method: 'GET' }).catch(function () { return { items: [] }; }),
              apiJSON(endpoints.workOperations, { method: 'GET' }).catch(function () { return { items: [] }; }),
              apiJSON(endpoints.workGroups, { method: 'GET' }).catch(function () { return { items: [] }; }),
              apiJSON(endpoints.vendors, { method: 'GET' }).catch(function () { return { items: [] }; }),
              apiJSON(endpoints.securityModels, { method: 'GET' }).catch(function () { return { items: [] }; }),
              apiJSON(endpoints.centers, { method: 'GET' }).catch(function () { return { items: [] }; }),
              apiJSON(endpoints.departments, { method: 'GET' }).catch(function () { return { items: [] }; }),
            ]);

            var workTypes = (res[0] && (res[0].items || res[0].data || res[0].list)) || [];
            var workCategories = (res[1] && (res[1].items || res[1].data || res[1].list)) || [];
            var workStatuses = (res[2] && (res[2].items || res[2].data || res[2].list)) || [];
            var workOperations = (res[3] && (res[3].items || res[3].data || res[3].list)) || [];
            var workGroups = (res[4] && (res[4].items || res[4].data || res[4].list)) || [];
            var vendors = (res[5] && (res[5].items || res[5].data || res[5].list)) || [];
            var securityModels = (res[6] && (res[6].items || res[6].data || res[6].list)) || [];
            var centers = (res[7] && (res[7].items || res[7].data || res[7].list)) || [];
            var departments = (res[8] && (res[8].items || res[8].data || res[8].list)) || [];

            // Filter security models for IPS
            var modelsAll = Array.isArray(securityModels)
              ? securityModels.filter(function (it) {
                  var t = String((it && (it.security_type || it.device_type || it.type || it.device_type_code || it.token)) || '').trim();
                  return !t || String(t).toUpperCase() === DEVICE_TYPE_TOKEN;
                })
              : [];

            masterCache = {
              workTypes: workTypes,
              workCategories: workCategories,
              workStatuses: workStatuses,
              workOperations: workOperations,
              workGroups: workGroups,
              vendors: vendors,
              modelsAll: modelsAll,
              centers: centers,
              departments: departments,
            };
            return masterCache;
          }

          function buildSelect(name, items, valueKey, labelFn, selectedValue, extraClass) {
            var cls = extraClass ? ' class="' + escapeHTML(extraClass) + '"' : '';
            var opts = ['<option value="">-</option>'];
            (items || []).forEach(function (it) {
              try {
                var v = it && it[valueKey] != null ? String(it[valueKey]) : '';
                if (!v) return;
                var label = labelFn ? String(labelFn(it) || v) : v;
                var sel = selectedValue != null && String(selectedValue) === v ? ' selected' : '';
                opts.push('<option value="' + escapeHTML(v) + '"' + sel + '>' + escapeHTML(label) + '</option>');
              } catch (_e0) {}
            });
            return '<select name="' + escapeHTML(name) + '"' + cls + '>' + opts.join('') + '</select>';
          }

          function applyRequiredRulesToModalForm(form) {
            if (!form) return;
            Array.prototype.forEach.call(form.querySelectorAll('[name="work_status"], [name="work_name"], [name="system_name"]'), function (el) {
              try {
                el.setAttribute('required', 'required');
              } catch (_e) {}
            });
          }

          function markUserCleared(el) {
            if (!el) return;
            try {
              el.dataset.userCleared = '1';
            } catch (_e) {}
          }

          function captureInitialFormValues(form) {
            if (!form) return;
            Array.prototype.forEach.call(form.querySelectorAll('input, select, textarea'), function (el) {
              try {
                el.dataset.initialValue = el.value;
              } catch (_e) {}
            });
          }

          function validateRequiredModalForm(form) {
            try {
              if (form && typeof form.checkValidity === 'function') return form.checkValidity();
            } catch (_e) {}
            return true;
          }

          function wireBasicInfoDependencies(form, masters) {
            if (!form) return;

            var m = masters || null;

            function setSelectOptions(selectEl, items, valueKey, labelFn, selectedValue, placeholderText, placeholderDisabled) {
              if (!selectEl) return;
              var opts = [];
              if (placeholderText) {
                opts.push(
                  '<option value=""' + (placeholderDisabled ? ' disabled' : '') + (selectedValue ? '' : ' selected') + '>' +
                    escapeHTML(String(placeholderText)) +
                  '</option>'
                );
              } else {
                opts.push('<option value="">-</option>');
              }
              (items || []).forEach(function (it) {
                try {
                  var v = it && it[valueKey] != null ? String(it[valueKey]) : '';
                  if (!v) return;
                  var label = labelFn ? String(labelFn(it) || v) : v;
                  var sel = selectedValue != null && String(selectedValue) === v ? ' selected' : '';
                  opts.push('<option value="' + escapeHTML(v) + '"' + sel + '>' + escapeHTML(label) + '</option>');
                } catch (_e0) {}
              });
              selectEl.innerHTML = opts.join('');
            }

            function clearValue(el) {
              if (!el) return;
              try {
                el.value = '';
              } catch (_e) {}
              markUserCleared(el);
            }

            // vendor -> model
            var vendor = form.querySelector('[name="vendor"]');
            var model = form.querySelector('[name="model"]');
            if (vendor && model) {
              function applyVendor() {
                var vendorCode = String(vendor.value || '').trim();
                if (!vendorCode) {
                  clearValue(model);
                  model.disabled = true;
                  setSelectOptions(model, [], 'security_code', function (it) { return it.model_name || it.security_code; }, '', '제조사를 먼저 선택', true);
                  return;
                }
                model.disabled = false;
                var all = (m && m.modelsAll) ? m.modelsAll : [];
                var filtered = all.filter(function (it) {
                  var mc = String((it && it.manufacturer_code) || '').trim();
                  return !mc || mc === vendorCode;
                });
                var current = String(model.value || '').trim();
                if (!current) {
                  try { current = String((model.dataset && (model.dataset.prefillValue || model.dataset.initialValue)) || '').trim(); } catch (_eP0) { current = ''; }
                }
                setSelectOptions(model, filtered, 'security_code', function (it) { return it.model_name || it.security_code; }, current, '-', false);
              }
              vendor.addEventListener('change', applyVendor);
              applyVendor();
            }

            // center -> rack (location)
            var center = form.querySelector('[name="location_place"]');
            var rack = form.querySelector('[name="location_pos"]');
            if (center && rack) {
              async function applyCenter() {
                var centerCode = String(center.value || '').trim();
                if (!centerCode) {
                  clearValue(rack);
                  rack.disabled = true;
                  setSelectOptions(rack, [], 'rack_code', function (it) { return it.rack_name || it.rack_position || it.rack_code; }, '', '장소를 먼저 선택', true);
                  return;
                }
                rack.disabled = false;
                try {
                  var data = await apiJSON('/api/org-racks?center_code=' + encodeURIComponent(centerCode), { method: 'GET' });
                  var items = (data && (data.items || data.data || data.list)) || [];
                  var current = String(rack.value || '').trim();
                  if (!current) {
                    try { current = String((rack.dataset && (rack.dataset.prefillValue || rack.dataset.initialValue)) || '').trim(); } catch (_eP1) { current = ''; }
                  }
                  setSelectOptions(rack, items, 'rack_code', function (it) { return it.rack_name || it.rack_position || it.rack_code; }, current, '-', false);
                } catch (err) {
                  console.warn('[' + STORAGE_PREFIX + '-detail] racks load failed:', err);
                }
              }
              center.addEventListener('change', function(){ applyCenter(); });
              // initialize
              applyCenter();
            }

            // dept -> owner (sys/service)
            function wireDeptOwner(deptName, ownerName) {
              var dept = form.querySelector('[name="' + deptName + '"]');
              var owner = form.querySelector('[name="' + ownerName + '"]');
              if (!dept || !owner) return;
              async function applyDept() {
                var deptCode = String(dept.value || '').trim();
                if (!deptCode) {
                  clearValue(owner);
                  owner.disabled = true;
                  setSelectOptions(owner, [], 'emp_no', function (it) { return it.name || it.emp_no; }, '', '부서를 먼저 선택', true);
                  return;
                }
                owner.disabled = false;
                try {
                  var data = await apiJSON('/api/user-profiles?dept_code=' + encodeURIComponent(deptCode) + '&limit=2000', { method: 'GET' });
                  var users = (data && (data.items || data.data || data.list)) || [];
                  var current = String(owner.value || '').trim();
                  if (!current) {
                    try { current = String((owner.dataset && (owner.dataset.prefillValue || owner.dataset.initialValue)) || '').trim(); } catch (_eP2) { current = ''; }
                  }
                  setSelectOptions(owner, users, 'emp_no', function (it) { return it.name || it.emp_no; }, current, '-', false);
                } catch (err) {
                  console.warn('[' + STORAGE_PREFIX + '-detail] owners load failed:', err);
                }
              }
              dept.addEventListener('change', function(){ applyDept(); });
              applyDept();
            }
            wireDeptOwner('sys_dept', 'sys_owner');
            wireDeptOwner('svc_dept', 'svc_owner');
          }

          function resolveAssetId() {
            try {
              var qs = new URLSearchParams(location.search || '');
              var cand = qs.get('hardware_id') || qs.get('hardwareId') || qs.get('asset_id') || qs.get('assetId') || qs.get('id');
              var n1 = parseInt(cand, 10);
              if (!isNaN(n1) && n1 > 0) return n1;
            } catch (_e) {}

            try {
              var raw = sessionStorage.getItem(STORAGE_PREFIX + ':selected:asset_id') || localStorage.getItem(STORAGE_PREFIX + ':selected:asset_id');
              var n2 = parseInt(raw, 10);
              if (!isNaN(n2) && n2 > 0) return n2;
            } catch (_e2) {}

            try {
              var rawRow = sessionStorage.getItem(STORAGE_PREFIX + ':selected:row') || localStorage.getItem(STORAGE_PREFIX + ':selected:row');
              if (rawRow) {
                var row = JSON.parse(rawRow);
                var id = row && (row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id));
                var n3 = parseInt(id, 10);
                if (!isNaN(n3) && n3 > 0) return n3;
              }
            } catch (_e3) {}

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
                if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && String(obj[k]).trim() !== '') return obj[k];
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
                row.querySelector('.info-value') ||
                row.querySelector('.info-value') ||
                row.querySelector('.num-badge') ||
                row.querySelector('.ox-badge');
              if (!host) return;
              var s = cleanPlaceholderValue(value);
              host.textContent = s ? s : '-';
            }

            function getInfoRow(cardIdx, rowIdx) {
              return document.querySelector('.basic-info-card:nth-child(' + cardIdx + ') .info-row:nth-child(' + rowIdx + ')');
            }

            function setInfoRowStatusPill(cardIdx, rowIdx, label, customColor, tokenClass) {
              var row = getInfoRow(cardIdx, rowIdx);
              if (!row) return;
              var existing = row.querySelector('.status-pill');
              if (!existing) return;
              var wsLabel = cleanPlaceholderValue(label) || '-';
              // Replace the entire pill markup so colored status + dot class update correctly.
              existing.outerHTML = renderWorkStatusPill(wsLabel, customColor, tokenClass);
            }

            function setInfoRowNumBadge(cardIdx, rowIdx, value, kind) {
              var row = getInfoRow(cardIdx, rowIdx);
              if (!row) return;
              var badge = row.querySelector('.num-badge');
              if (!badge) return;

              var s = String(value == null ? '' : value).trim();
              if (!s) {
                badge.textContent = '-';
                badge.className = 'num-badge';
                return;
              }

              var n = parseInt(s, 10);
              var tone = '';
              if (!isNaN(n)) {
                if (kind === 'security_score') tone = n >= 8 ? 'tone-3' : n >= 6 ? 'tone-2' : 'tone-1';
                else tone = n >= 3 ? 'tone-3' : n === 2 ? 'tone-2' : 'tone-1';
              }

              var show = isNaN(n) ? String(s) : String(n);
              badge.textContent = show && show.trim() ? show : '-';
              badge.className = 'num-badge' + (tone ? ' ' + tone : '');
            }

            function setInfoRowOxBadge(cardIdx, rowIdx, value) {
              var row = getInfoRow(cardIdx, rowIdx);
              if (!row) return;
              var badge = row.querySelector('.ox-badge');
              if (!badge) return;

              var s = String(value == null ? '' : value).trim().toUpperCase();
              if (!(s === 'O' || s === 'X')) s = '-';
              var cls = s === 'O' ? 'on' : s === 'X' ? 'off' : 'is-empty';
              badge.textContent = s;
              badge.className = 'ox-badge ' + cls;
            }

            function setInfoRowHTML(cardIdx, rowIdx, html, fallbackText) {
              var row = document.querySelector('.basic-info-card:nth-child(' + cardIdx + ') .info-row:nth-child(' + rowIdx + ')');
              if (!row) return;
              var host = row.querySelector('.info-value') || row.querySelector('.info-value');
              if (!host) return;
              var h = html == null ? '' : String(html);
              if (h && h.trim() && h !== '-') host.innerHTML = h;
              else host.textContent = (fallbackText != null && String(fallbackText).trim()) ? String(fallbackText) : '-';
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

            try {
              if (document.querySelector('.basic-info-grid')) {
                var wsLabel = cleanPlaceholderValue(pick(item, ['work_status_name', 'work_status_label', 'work_status', 'work_status_code'])) || '-';
                setInfoRowStatusPill(1, 1, wsLabel, item.work_status_color, item.work_status_token);
                setInfoRowValue(1, 2, pick(item, ['work_type_name', 'work_type']));
                setInfoRowValue(1, 3, pick(item, ['work_category_name', 'work_category']));
                setInfoRowValue(1, 4, pick(item, ['work_operation_name', 'work_operation']));
                setInfoRowValue(1, 5, pick(item, ['work_group_name', 'work_group']));
                setInfoRowValue(1, 6, pick(item, ['work_name']));
                setInfoRowValue(1, 7, pick(item, ['system_name']));
                setInfoRowValue(1, 8, pick(item, ['system_ip']));
                setInfoRowValue(1, 9, pick(item, ['mgmt_ip', 'manage_ip']));

                setInfoRowValue(2, 1, pick(item, ['manufacturer_name', 'vendor', 'vendor_name']));
                setInfoRowValue(2, 2, pick(item, ['server_model_name', 'model_name', 'model']));
                setInfoRowValue(2, 3, pick(item, ['serial_number', 'serial']));
                setInfoRowValue(2, 4, pick(item, ['virtualization_type', 'virtualization']));
                setInfoRowValue(2, 5, pick(item, ['center_name', 'location_place']));
                setInfoRowValue(2, 6, pick(item, ['rack_name', 'location_pos']));
                setInfoRowValue(2, 7, pick(item, ['slot', 'system_slot']));
                setInfoRowValue(2, 8, pick(item, ['u_size', 'system_size']));
                setInfoRowValue(2, 9, (pick(item, ['rack_face']) === 'REAR') ? '후면' : '전면');

                setInfoRowValue(3, 1, pick(item, ['system_dept_name', 'sys_dept']));
                setInfoRowValue(3, 2, pick(item, ['system_owner_name', 'sys_owner']));
                setInfoRowValue(3, 3, pick(item, ['service_dept_name', 'svc_dept']));
                setInfoRowValue(3, 4, pick(item, ['service_owner_name', 'svc_owner']));

                var c = pick(item, ['cia_confidentiality', 'confidentiality']);
                var i = pick(item, ['cia_integrity', 'integrity']);
                var a = pick(item, ['cia_availability', 'availability']);
                var sc = pick(item, ['security_score']);
                setInfoRowNumBadge(4, 1, c, 'confidentiality');
                setInfoRowNumBadge(4, 2, i, 'integrity');
                setInfoRowNumBadge(4, 3, a, 'availability');
                setInfoRowNumBadge(4, 4, sc, 'security_score');
                setInfoRowValue(4, 5, pick(item, ['system_grade', 'grade']));
                setInfoRowValue(4, 6, normalizeCoreFlag(pick(item, ['core_flag', 'is_core_system'])));

                var dr = normalizeOX(pick(item, ['dr_built', 'has_dr_site']));
                var ha = normalizeOX(pick(item, ['svc_redundancy', 'has_service_ha']));
                setInfoRowOxBadge(4, 7, dr);
                setInfoRowOxBadge(4, 8, ha);
              }
            } catch (_eGrid) {}

            try {
              localStorage.setItem(STORAGE_PREFIX + ':current:vendor', String(pick(item, ['manufacturer_name', 'vendor', 'vendor_name']) || ''));
              localStorage.setItem(STORAGE_PREFIX + ':current:model', String(pick(item, ['server_model_name', 'model_name', 'model']) || ''));
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

          async function buildEditFormFromAssetItem(item) {
            var form = document.getElementById(EDIT_FORM_ID);
            if (!form) return;

            var m = await ensureMasters();

            var data = {
              // Canonical API: work_type_code = 업무 분류, work_category_code = 업무 구분
              // Keep fallbacks for older/aliased payloads to avoid future regressions.
              work_type: item.work_type_code || item.work_type || item.work_category_code || '',
              work_category: item.work_category_code || item.work_category || item.work_division_code || '',
              work_status: item.work_status_code || item.work_status || '',
              work_operation: item.work_operation_code || item.work_operation || '',
              work_group: item.work_group_code || item.work_group || '',
              work_name: item.work_name || '',
              system_name: item.system_name || '',
              system_ip: item.system_ip || '',
              manage_ip: item.mgmt_ip || item.manage_ip || '',
              vendor: item.manufacturer_code || item.vendor || '',
              model: item.server_code || item.security_code || item.model || '',
              serial: item.serial_number || item.serial || '',
              virtualization: item.virtualization_type || item.virtualization || '',
              location_place: item.center_code || item.location_place || '',
              location_pos: item.rack_code || item.location_pos || item.rack || '',
              slot: item.system_slot != null ? item.system_slot : item.slot,
              u_size: item.system_size != null ? item.system_size : item.u_size,
              rack_face: item.rack_face || 'FRONT',
              sys_dept: item.system_dept_code || item.system_department || item.sys_dept || '',
              sys_owner: item.system_owner_emp_no || item.system_owner || item.sys_owner || '',
              svc_dept: item.service_dept_code || item.service_department || item.svc_dept || '',
              svc_owner: item.service_owner_emp_no || item.service_owner || item.svc_owner || '',
              confidentiality: item.cia_confidentiality != null ? item.cia_confidentiality : item.confidentiality,
              integrity: item.cia_integrity != null ? item.cia_integrity : item.integrity,
              availability: item.cia_availability != null ? item.cia_availability : item.availability,
              security_score: item.security_score != null ? item.security_score : '',
              system_grade: item.system_grade || '',
              core_flag: item.is_core_system != null ? (String(item.is_core_system) === '1' ? '핵심' : '일반') : (item.core_flag || ''),
              dr_built: item.has_dr_site != null ? (String(item.has_dr_site) === '1' ? 'O' : 'X') : (item.dr_built || ''),
              svc_redundancy: item.has_service_ha != null ? (String(item.has_service_ha) === '1' ? 'O' : 'X') : (item.svc_redundancy || ''),
            };

            function row(label, inputHtml) {
              return '<div class="form-row"><label>' + escapeHTML(label) + '</label>' + inputHtml + '</div>';
            }
            function section(title, rowsHtml) {
              return (
                '<div class="form-section">' +
                '<div class="section-header"><h4>' + escapeHTML(title) + '</h4></div>' +
                '<div class="form-grid">' + rowsHtml + '</div>' +
                '</div>'
              );
            }
            function input(name, value, extra) {
              return '<input name="' + escapeHTML(name) + '" class="form-input"' + (extra || '') + ' value="' + escapeHTML(value == null ? '' : String(value)) + '">';
            }
            function selectSimple(name, options, selected) {
              var opts = ['<option value="">-</option>'];
              (options || []).forEach(function (o) {
                var v = String(o == null ? '' : o);
                var sel = selected != null && String(selected) === v ? ' selected' : '';
                opts.push('<option value="' + escapeHTML(v) + '"' + sel + '>' + escapeHTML(v || '-') + '</option>');
              });
              return '<select name="' + escapeHTML(name) + '" class="form-input search-select">' + opts.join('') + '</select>';
            }

            var html = '';
            html += section(
              '비즈니스',
              [
                row(
                  '업무 분류',
                  buildSelect(
                    'work_type',
                    m.workTypes,
                    'category_code',
                    function (it) {
                      return it.wc_name || it.category_name || it.category_code;
                    },
                    data.work_type,
                    'search-select'
                  )
                ),
                row(
                  '업무 구분',
                  buildSelect(
                    'work_category',
                    m.workCategories,
                    'division_code',
                    function (it) {
                      return it.wc_name || it.division_name || it.division_code;
                    },
                    data.work_category,
                    'search-select'
                  )
                ),
                row(
                  '업무 상태',
                  buildSelect(
                    'work_status',
                    m.workStatuses,
                    'status_code',
                    function (it) {
                      return it.wc_name || it.status_name || it.status_code;
                    },
                    data.work_status,
                    'search-select'
                  )
                ),
                row(
                  '업무 운영',
                  buildSelect(
                    'work_operation',
                    m.workOperations,
                    'operation_code',
                    function (it) {
                      return it.wc_name || it.operation_name || it.operation_code;
                    },
                    data.work_operation,
                    'search-select'
                  )
                ),
                row(
                  '업무 그룹',
                  buildSelect(
                    'work_group',
                    m.workGroups,
                    'group_code',
                    function (it) {
                      return it.wc_name || it.group_name || it.group_code;
                    },
                    data.work_group,
                    'search-select'
                  )
                ),
                row('업무 이름', input('work_name', data.work_name)),
                row('시스템 이름', input('system_name', data.system_name)),
                row('시스템 IP', input('system_ip', data.system_ip)),
                row('관리 IP', input('manage_ip', data.manage_ip)),
              ].join('')
            );

            html += section(
              '시스템',
              [
                row(
                  '시스템 제조사',
                  buildSelect(
                    'vendor',
                    m.vendors,
                    'manufacturer_code',
                    function (it) {
                      return it.manufacturer_name || it.manufacturer_code;
                    },
                    data.vendor,
                    'search-select'
                  )
                ),
                row(
                  '시스템 모델명',
                  '<select name="model" class="form-input search-select"></select>'
                ),
                row('시스템 일련번호', input('serial', data.serial)),
                row('시스템 가상화', selectSimple('virtualization', ['물리', '가상'], data.virtualization)),
                row(
                  '시스템 장소',
                  buildSelect(
                    'location_place',
                    m.centers,
                    'center_code',
                    function (it) {
                      return it.center_name || it.center_code;
                    },
                    data.location_place,
                    'search-select'
                  )
                ),
                row('시스템 위치', '<select name="location_pos" class="form-input search-select"></select>'),
                row('시스템 슬롯', input('slot', data.slot, ' type="number" min="0" step="1"')),
                row('시스템 크기', input('u_size', data.u_size, ' type="number" min="0" step="1"')),
                row('RACK 전면/후면', '<select name="rack_face" class="form-input search-select" data-searchable="true" data-placeholder="선택"><option value="">선택</option><option value="FRONT"' + (data.rack_face !== 'REAR' ? ' selected' : '') + '>전면</option><option value="REAR"' + (data.rack_face === 'REAR' ? ' selected' : '') + '>후면</option></select>'),
              ].join('')
            );

            html += section(
              '담당자',
              [
                row(
                  '시스템 담당부서',
                  buildSelect(
                    'sys_dept',
                    m.departments,
                    'dept_code',
                    function (it) {
                      return it.dept_name || it.dept_code;
                    },
                    data.sys_dept,
                    'search-select'
                  )
                ),
                row('시스템 담당자', '<select name="sys_owner" class="form-input search-select"></select>'),
                row(
                  '서비스 담당부서',
                  buildSelect(
                    'svc_dept',
                    m.departments,
                    'dept_code',
                    function (it) {
                      return it.dept_name || it.dept_code;
                    },
                    data.svc_dept,
                    'search-select'
                  )
                ),
                row('서비스 담당자', '<select name="svc_owner" class="form-input search-select"></select>'),
              ].join('')
            );

            html += section(
              '점검',
              [
                row('기밀성', selectSimple('confidentiality', ['1', '2', '3'], data.confidentiality)),
                row('무결성', selectSimple('integrity', ['1', '2', '3'], data.integrity)),
                row('가용성', selectSimple('availability', ['1', '2', '3'], data.availability)),
                row('보안 점수', input('security_score', data.security_score, ' type="number" readonly placeholder="자동 합계"')),
                row('시스템 등급', selectSimple('system_grade', ['1등급', '2등급', '3등급'], data.system_grade)),
                row('핵심/일반', selectSimple('core_flag', ['핵심', '일반'], data.core_flag)),
                row('DR 구축여부', selectSimple('dr_built', ['O', 'X'], data.dr_built)),
                row('서비스 이중화', selectSimple('svc_redundancy', ['O', 'X'], data.svc_redundancy)),
              ].join('')
            );

            form.innerHTML = html;

            // Set model/ rack / owner selects with placeholders; dependencies will hydrate.
            try {
              var modelSel = form.querySelector('[name="model"]');
              if (modelSel) {
                modelSel.dataset.prefillValue = String(data.model || '');
                // Seed an option so `select.value` isn't lost before options hydrate.
                modelSel.innerHTML = '<option value="" selected>-</option>' + (data.model ? ('<option value="' + escapeHTML(String(data.model)) + '" selected>' + escapeHTML(String(data.model)) + '</option>') : '');
              }
              var rackSel = form.querySelector('[name="location_pos"]');
              if (rackSel) {
                rackSel.dataset.prefillValue = String(data.location_pos || '');
                rackSel.innerHTML = '<option value="" selected>-</option>' + (data.location_pos ? ('<option value="' + escapeHTML(String(data.location_pos)) + '" selected>' + escapeHTML(String(data.location_pos)) + '</option>') : '');
              }
              var sysOwnerSel = form.querySelector('[name="sys_owner"]');
              if (sysOwnerSel) {
                sysOwnerSel.dataset.prefillValue = String(data.sys_owner || '');
                sysOwnerSel.innerHTML = '<option value="" selected>-</option>' + (data.sys_owner ? ('<option value="' + escapeHTML(String(data.sys_owner)) + '" selected>' + escapeHTML(String(data.sys_owner)) + '</option>') : '');
              }
              var svcOwnerSel = form.querySelector('[name="svc_owner"]');
              if (svcOwnerSel) {
                svcOwnerSel.dataset.prefillValue = String(data.svc_owner || '');
                svcOwnerSel.innerHTML = '<option value="" selected>-</option>' + (data.svc_owner ? ('<option value="' + escapeHTML(String(data.svc_owner)) + '" selected>' + escapeHTML(String(data.svc_owner)) + '</option>') : '');
              }
            } catch (_e0) {}

            // Security score recompute
            (function(){
              var scoreInput = form.querySelector('input[name="security_score"]');
              if(!scoreInput) return;
              function recompute(){
                var c = parseInt((form.querySelector('[name="confidentiality"]')||{}).value||'0',10)||0;
                var i = parseInt((form.querySelector('[name="integrity"]')||{}).value||'0',10)||0;
                var a = parseInt((form.querySelector('[name="availability"]')||{}).value||'0',10)||0;
                var total = c+i+a;
                scoreInput.value = total ? String(total) : '';
                var grade = form.querySelector('[name="system_grade"]');
                if(grade){
                  if(total>=8) grade.value='1등급';
                  else if(total>=6) grade.value='2등급';
                  else if(total>0) grade.value='3등급';
                }
              }
              ['confidentiality','integrity','availability'].forEach(function(n){
                var el = form.querySelector('[name="'+n+'"]');
                if(el) el.addEventListener('change', recompute);
              });
              recompute();
            })();

            applyRequiredRulesToModalForm(form);
            wireBasicInfoDependencies(form, m);
            captureInitialFormValues(form);

            // Prefer global FK hydration when available (matches server/workstation behavior).
            try {
              if (window.BlossomFkSelect && typeof window.BlossomFkSelect.enhance === 'function') {
                var modalRoot = document.getElementById(EDIT_MODAL_ID) || (form.closest ? form.closest('.modal-overlay-full') : null) || form;
                window.BlossomFkSelect.enhance(modalRoot);
              }
            } catch (_eFk) {}

            // Ensure searchable-select UI refresh if used on this page.
            try {
              if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function') {
                window.BlossomSearchableSelect.enhance(form.closest ? form.closest('.modal-overlay-full') || form : form);
              }
            } catch (_eSS) {}
          }

          async function loadAssetAndRender(assetId) {
            var data = await apiJSON(API_ENDPOINT + '/' + assetId, { method: 'GET' });
            currentAssetItem = data.item;
            applyAssetItemToPage(currentAssetItem);

            try {
              sessionStorage.setItem(STORAGE_PREFIX + ':selected:asset_id', String(assetId));
            } catch (_e2) {}
            try {
              localStorage.setItem(STORAGE_PREFIX + ':selected:asset_id', String(assetId));
            } catch (_e3) {}
          }

          async function fetchFirstAssetFromList() {
            var data = await apiJSON(API_ENDPOINT, { method: 'GET' });
            var items = data.items || data.rows || data.data || [];
            if (items && typeof items === 'object' && !Array.isArray(items)) {
              items = items.items || items.rows || items.data || [];
            }
            if (Array.isArray(items) && items.length) return items[0];
            return null;
          }

          async function bootstrapBasicInfo() {
            if (!document.getElementById('page-title')) return;

            var aid = resolveAssetId();
            if (!aid) {
              try {
                var first = await fetchFirstAssetFromList();
                if (first) {
                  var tmp = parseInt(first.id != null ? first.id : first.asset_id, 10);
                  if (!isNaN(tmp) && tmp > 0) {
                    aid = tmp;
                    currentAssetItem = first;
                    applyAssetItemToPage(first);
                    decorateTabLinksWithAssetId(aid);
                    try {
                      sessionStorage.setItem(STORAGE_PREFIX + ':selected:asset_id', String(aid));
                    } catch (_eS) {}
                    try {
                      localStorage.setItem(STORAGE_PREFIX + ':selected:asset_id', String(aid));
                    } catch (_eL) {}
                  }
                }
              } catch (errList) {
                console.warn('[' + STORAGE_PREFIX + '-detail] list fallback failed:', errList);
              }
            }
            if (!aid) return;
            currentAssetId = aid;

            try {
              if (currentAssetItem && (currentAssetItem.id === aid || String(currentAssetItem.id) === String(aid))) {
                applyAssetItemToPage(currentAssetItem);
                return;
              }
              await loadAssetAndRender(aid);
            } catch (err) {
              console.warn('[' + STORAGE_PREFIX + '-detail] bootstrap failed:', err);

              // If URL carries a stale/invalid asset_id (API returns 404), try to recover by
              // stripping the id and falling back to the first available asset.
              try {
                var status = err && (err.httpStatus || (err.responseData && err.responseData.status));
                if (status === 404) {
                  stripAssetIdFromUrl();
                  currentAssetId = null;
                  currentAssetItem = null;

                  var first = await fetchFirstAssetFromList();
                  if (first) {
                    var fid = parseInt(first.id != null ? first.id : first.asset_id, 10);
                    if (!isNaN(fid) && fid > 0) {
                      currentAssetId = fid;
                      currentAssetItem = first;
                      applyAssetItemToPage(first);
                      decorateTabLinksWithAssetId(fid);
                      try {
                        sessionStorage.setItem(STORAGE_PREFIX + ':selected:asset_id', String(fid));
                      } catch (_eS2) {}
                      try {
                        localStorage.setItem(STORAGE_PREFIX + ':selected:asset_id', String(fid));
                      } catch (_eL2) {}
                      return;
                    }
                  }

                  notify('대상을 찾을 수 없습니다.', 'error');
                }
              } catch (_eRecover) {}
            }
          }

          (function () {
            function openModalLocal(id) {
              var el = document.getElementById(id);
              if (!el) return;
              try { el.setAttribute('aria-hidden', 'false'); } catch (_e0) {}
              el.classList.add('show');
              document.body.classList.add('modal-open');
            }
            function closeModalLocal(id) {
              var el = document.getElementById(id);
              if (!el) return;
              try { el.setAttribute('aria-hidden', 'true'); } catch (_e1) {}
              el.classList.remove('show');
              document.body.classList.remove('modal-open');
            }

            var openBtn = document.getElementById(EDIT_OPEN_ID);
            if (openBtn) {
              openBtn.addEventListener('click', async function () {
                try {
                  if (!currentAssetId) currentAssetId = resolveAssetId();
                  if (currentAssetId && !currentAssetItem) await loadAssetAndRender(currentAssetId);
                } catch (err) {
                  console.warn('[' + STORAGE_PREFIX + '-detail] load before modal failed:', err);
                }

                try {
                  if (currentAssetItem) await buildEditFormFromAssetItem(currentAssetItem);
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
                  var data = await apiJSON(API_ENDPOINT + '/' + currentAssetId, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                  });

                  currentAssetItem = data.item;
                  applyAssetItemToPage(currentAssetItem);
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
