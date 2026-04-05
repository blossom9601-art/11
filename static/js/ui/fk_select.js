/*
  Shared FK <select> loader + input->select converter
  - Goal: Make edit/bulk-edit modals behave like list add-modal:
    searchable dropdown + FK reference options.
  - Works with existing system.css searchable dropdown UX.
  - Safe to load globally.

  Behavior:
  - Inside modals, finds fields by common FK names (work_type, vendor, sys_dept, ...)
  - If the field is an <input>, replaces it with a <select class="search-select fk-select">.
  - Loads options from /api/* endpoints.
  - Supports basic dependencies:
    - sys_owner depends on sys_dept (dept_code)
    - svc_owner depends on svc_dept (dept_code)
    - model depends on vendor (manufacturer_code)
*/

(function () {
  if (window.BlossomFkSelect) return;

  const CACHE = new Map(); // key -> Promise(items)
  const MODAL_BOOT = new WeakSet();
  const MODAL_OBSERVERS = new WeakMap();

  function $(root, sel) {
    return root && root.querySelector ? root.querySelector(sel) : null;
  }

  function $all(root, sel) {
    return root && root.querySelectorAll ? Array.from(root.querySelectorAll(sel)) : [];
  }

  function normStr(v) {
    return (v == null ? '' : String(v)).trim();
  }

  function isFkIgnored(el) {
    try {
      if (!el) return false;
      if (el.getAttribute && el.getAttribute('data-fk-ignore') === '1') return true;
      if (el.dataset && el.dataset.fkIgnore === '1') return true;
      // Allow opting out at any ancestor level (form, modal, wrapper)
      const parent = el.closest && el.closest('[data-fk-ignore="1"]');
      return !!parent;
    } catch (_e) {
      return false;
    }
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function detectHwGroup() {
    // Prefer URL key-based detection (robust even before page scripts are parsed).
    const key = detectHwPageKeyFromUrl();
    if (key) {
      if (key.startsWith('hw_network_') || key.startsWith('cat_hw_network')) return 'network';
      if (key.startsWith('hw_security_') || key.startsWith('cat_hw_security')) return 'security';
      if (key.startsWith('hw_san_') || key.startsWith('cat_hw_san')) return 'san';
      if (key.startsWith('hw_storage_') || key.startsWith('cat_hw_storage')) return 'storage';
      if (key.startsWith('hw_server_') || key.startsWith('cat_hw_server')) return 'server';
    }

    // Heuristic fallback: infer from a page script URL.
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    const src = scripts
      .map((s) => s.getAttribute('src') || '')
      .find((u) => u.includes('/static/js/2.hardware/') || u.includes('/static/js/9.category/9-2.hardware/'));
    const u = src || '';
    // Support both legacy (2.hardware) and current (9.category/9-2.hardware) folder layouts.
    if (u.includes('/2-4.network/') || u.includes('/9-2-4.network/')) return 'network';
    if (u.includes('/2-5.security/') || u.includes('/9-2-5.security/')) return 'security';
    if (u.includes('/2-3.san/') || u.includes('/9-2-3.san/')) return 'san';
    if (u.includes('/2-2.storage/') || u.includes('/9-2-2.storage/')) return 'storage';
    if (u.includes('/2-1.server/') || u.includes('/9-2-1.server/')) return 'server';
    return '';
  }

  function detectHwPageKeyFromUrl() {
    try {
      const path = String(window.location && window.location.pathname ? window.location.pathname : '');
      const m = path.match(/\/p\/([^/?#]+)/);
      return m ? decodeURIComponent(m[1]) : '';
    } catch (_e) {
      return '';
    }
  }

  function detectHwScriptSrc() {
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    return (
      scripts
        .map((s) => s.getAttribute('src') || '')
        .find((u) => u.includes('/static/js/2.hardware/') || u.includes('/static/js/9.category/9-2.hardware/')) ||
      ''
    );
  }

  function normalizeCompactUpper(value) {
    return (value == null ? '' : String(value)).replace(/\s+/g, '').trim().toUpperCase();
  }

  function detectHwTypeFilter() {
    // Apply subtype scoping ONLY on legacy 2.hardware asset pages.
    // (9.category pages should keep full vendor/model lists.)
    const key = detectHwPageKeyFromUrl();
    if (key) {
      // Explicit key mapping is the most reliable.
      if (key === 'hw_server_onpremise') return '서버';
      if (key === 'hw_server_cloud') return '클라우드';
      if (key === 'hw_server_frame') return '프레임';
      if (key === 'hw_server_workstation') return '워크스테이션';

      if (key === 'hw_san_director') return 'DIRECTOR';
      if (key === 'hw_san_switch') return 'SWITCH';

      if (key === 'hw_network_l2') return 'L2';
      if (key === 'hw_network_l4') return 'L4';
      if (key === 'hw_network_l7') return 'L7';
      if (key === 'hw_network_ap') return 'AP';
      if (key === 'hw_network_dedicateline') return 'CIR';

      if (key === 'hw_security_firewall') return 'FW';
      if (key === 'hw_security_vpn') return 'VPN';
      if (key === 'hw_security_ids') return 'IDS';
      if (key === 'hw_security_ips') return 'IPS';
      if (key === 'hw_security_hsm') return 'HSM';
      if (key === 'hw_security_kms') return 'KMS';
      if (key === 'hw_security_wips') return 'WIPS';
      if (key === 'hw_security_etc') return 'ETC';

      // Storage tabs
      if (key === 'hw_storage_san') return 'SAN';
      // Storage Backup (PTL) pages should scope vendor/model dropdowns to backup device types.
      // Apply to list/detail and any tab variants.
      if (key === 'hw_storage_backup' || key === 'hw_storage_backup_detail' || key.startsWith('hw_storage_backup_') || key.startsWith('hw_storage_backup_detail_')) return 'PTL';

      // If this is a category page (cat_*), do not apply subtype filtering.
      if (key.startsWith('cat_')) return '';
    }

    const u = detectHwScriptSrc();
    if (!u || !u.includes('/static/js/2.hardware/')) return '';

    // Server
    if (u.includes('/2-1.server/2-1-1.onpremise/')) return '서버';
    if (u.includes('/2-1.server/2-1-2.cloud/')) return '클라우드';
    if (u.includes('/2-1.server/2-1-3.frame/')) return '프레임';
    if (u.includes('/2-1.server/2-1-4.workstation/')) return '워크스테이션';

    // SAN
    if (u.includes('/2-3.san/2-3-1.director/')) return 'DIRECTOR';
    if (u.includes('/2-3.san/2-3-2.sansw/')) return 'SWITCH';

    // Network
    if (u.includes('/2-4.network/2-4-1.l2/')) return 'L2';
    if (u.includes('/2-4.network/2-4-2.l4/')) return 'L4';
    if (u.includes('/2-4.network/2-4-3.l7/')) return 'L7';
    if (u.includes('/2-4.network/2-4-4.ap/')) return 'AP';
    if (u.includes('/2-4.network/2-4-5.dedicateline/')) return 'CIR';

    // Security
    if (u.includes('/2-5.security/2-5-1.firewall/')) return 'FW';
    if (u.includes('/2-5.security/2-5-2.vpn/')) return 'VPN';
    if (u.includes('/2-5.security/2-5-3.ids/')) return 'IDS';
    if (u.includes('/2-5.security/2-5-4.ips/')) return 'IPS';
    if (u.includes('/2-5.security/2-5-5.hsm/')) return 'HSM';
    if (u.includes('/2-5.security/2-5-6.kms/')) return 'KMS';
    if (u.includes('/2-5.security/2-5-7.wips/')) return 'WIPS';
    if (u.includes('/2-5.security/2-5-8.etc/')) return 'ETC';

    // Storage (stored as form_factor in hw_server_type rows on asset pages)
    if (u.includes('/2-2.storage/2-2-1.san/')) return 'SAN';
    if (u.includes('/2-2.storage/2-2-2.backup/')) return 'PTL';
    if (u.includes('/2-2.storage/2-2-2.ptl/')) return 'PTL';

    return '';
  }

  function matchesSanType(raw, target) {
    const upperCompact = normalizeCompactUpper(raw);
    const t = normalizeCompactUpper(target);
    if (!upperCompact || !t) return false;
    if (t === 'DIRECTOR') {
      return (
        upperCompact.includes('DIRECTOR') ||
        upperCompact.includes('DIR') ||
        upperCompact.includes('SANDIRECTOR') ||
        upperCompact.includes('디렉터')
      );
    }
    if (t === 'SWITCH') {
      return (
        upperCompact.includes('SWITCH') ||
        upperCompact.includes('SW') ||
        upperCompact.includes('SANSWITCH') ||
        upperCompact.includes('스위치')
      );
    }
    return upperCompact === t;
  }

  function normalizeSecurityType(raw) {
    const v = (raw == null ? '' : String(raw)).trim();
    if (!v) return 'ETC';
    const upper = v.toUpperCase();
    if (['FW', 'VPN', 'IDS', 'IPS', 'HSM', 'KMS', 'WIPS', 'ETC'].includes(upper)) return upper;
    const lowered = v.toLowerCase();
    if (['방화벽', 'firewall'].includes(lowered)) return 'FW';
    if (['vpn'].includes(lowered)) return 'VPN';
    if (['ids', '침입탐지', '침입 탐지', '침입탐지시스템', '침입 탐지 시스템'].includes(lowered)) return 'IDS';
    if (['ips', '침입방지', '침입 방지', '침입방지시스템', '침입 방지 시스템'].includes(lowered)) return 'IPS';
    if (['hsm'].includes(lowered)) return 'HSM';
    if (['kms'].includes(lowered)) return 'KMS';
    if (['wips'].includes(lowered)) return 'WIPS';
    if (['etc', '기타'].includes(lowered)) return 'ETC';
    return 'ETC';
  }

  function matchesTypeByGroup(group, itemType, target) {
    const g = (group || '').trim();
    const t = (target || '').trim();
    if (!t) return true;
    if (g === 'san') return matchesSanType(itemType, t);
    if (g === 'security') return normalizeSecurityType(itemType) === normalizeSecurityType(t);
    if (g === 'network') return normalizeCompactUpper(itemType) === normalizeCompactUpper(t);
    // server/storage: form_factor values vary (Korean labels, EN codes, mixed strings).
    // Normalize to a canonical label so subtype filtering stays reliable.
    function normalizeServerFormFactor(raw) {
      const rawStr = String(raw == null ? '' : raw).trim();
      // Legacy mojibake values observed in some SQLite rows.
      if (rawStr === 'Ŭ����') return '클라우드';
      if (rawStr === '����') return '서버';

      const v = normalizeCompactUpper(rawStr);
      if (!v) return '';
      if (v.includes('클라우드') || v.includes('CLOUD')) return '클라우드';
      if (v.includes('프레임') || v.includes('FRAME') || v.includes('ENCLOSURE')) return '프레임';
      if (v.includes('워크스테이션') || v.includes('WORKSTATION')) return '워크스테이션';
      if (v.includes('서버') || v.includes('SERVER')) return '서버';
      if (v.includes('SAN')) return 'SAN';
      if (v.includes('PTL') || v.includes('BACKUP') || v.includes('TAPE')) return 'PTL';
      return rawStr;
    }

    const a = normalizeServerFormFactor(itemType);
    const b = normalizeServerFormFactor(t);
    if (a && b) return a === b;
    return String(itemType || '').trim().toLowerCase() === t.toLowerCase();
  }

  function manufacturerCodeOf(item) {
    return normStr(item && (item.manufacturer_code || item.manufacturerCode || item.manufacturer_code || item.vendor_code || item.vendor));
  }

  function modelSourceForGroup() {
    const g = detectHwGroup();
    if (g === 'network') return { endpoint: '/api/hw-network-types', valueKey: 'network_code', labelKey: 'model_name', vendorFilterKey: 'manufacturer_code', typeKey: 'network_type', hwGroup: 'network' };
    if (g === 'security') return { endpoint: '/api/hw-security-types', valueKey: 'security_code', labelKey: 'model_name', vendorFilterKey: 'manufacturer_code', typeKey: 'security_type', hwGroup: 'security' };
    if (g === 'san') return { endpoint: '/api/hw-san-types', valueKey: 'san_code', labelKey: 'model_name', vendorFilterKey: 'manufacturer_code', typeKey: 'san_type', hwGroup: 'san' };
    // storage pages in this repo often reuse hw-server-types for the "model" field
    if (g === 'storage' || g === 'server') return { endpoint: '/api/hw-server-types', valueKey: 'server_code', labelKey: 'model_name', vendorFilterKey: 'manufacturer_code', typeKey: 'form_factor', hwGroup: g };
    return { endpoint: '/api/hw-server-types', valueKey: 'server_code', labelKey: 'model_name', vendorFilterKey: 'manufacturer_code', typeKey: 'form_factor', hwGroup: g || 'server' };
  }

  function fieldSpec(field) {
    const base = {
      work_type: { endpoint: '/api/work-categories', valueKey: 'category_code', labelKey: 'wc_name' },
      work_category: { endpoint: '/api/work-divisions', valueKey: 'division_code', labelKey: 'wc_name' },
      work_status: { endpoint: '/api/work-statuses', valueKey: 'status_code', labelKey: 'wc_name' },
      work_operation: { endpoint: '/api/work-operations', valueKey: 'operation_code', labelKey: 'wc_name' },
      work_group: { endpoint: '/api/work-groups', valueKey: 'group_code', labelKey: 'group_name' },
      vendor: { endpoint: '/api/vendor-manufacturers', valueKey: 'manufacturer_code', labelKey: 'manufacturer_name' },
      model: modelSourceForGroup(),
      location_place: { endpoint: '/api/org-centers', valueKey: 'center_code', labelKey: 'center_name' },
      location_pos: { endpoint: '/api/org-racks', valueKey: 'rack_code', labelKey: 'rack_name', dependsOn: 'location_place', dependsParam: 'center_code' },
      sys_dept: { endpoint: '/api/org-departments', valueKey: 'dept_code', labelKey: 'dept_name' },
      svc_dept: { endpoint: '/api/org-departments', valueKey: 'dept_code', labelKey: 'dept_name' },
      sys_owner: { endpoint: '/api/user-profiles', valueKey: 'emp_no', labelKey: 'name', dependsOn: 'sys_dept', dependsParam: 'dept_code', limit: 500 },
      svc_owner: { endpoint: '/api/user-profiles', valueKey: 'emp_no', labelKey: 'name', dependsOn: 'svc_dept', dependsParam: 'dept_code', limit: 500 },
    };
    return base[field] || null;
  }

  function buildCacheKey(url) {
    return url;
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  }

  async function loadItems(spec, ctx) {
    const baseUrl = spec.endpoint;
    const qs = [];
    if (spec.limit) qs.push('limit=' + encodeURIComponent(String(spec.limit)));
    if (spec.dependsOn && spec.dependsParam) {
      const parentVal = normStr(ctx && ctx.parentValue);
      if (parentVal) qs.push(encodeURIComponent(spec.dependsParam) + '=' + encodeURIComponent(parentVal));
    }
    const url = qs.length ? baseUrl + '?' + qs.join('&') : baseUrl;
    const key = buildCacheKey(url);

    if (CACHE.has(key)) return await CACHE.get(key);

    const p = (async () => {
      const data = await fetchJSON(url);
      if (!data) return [];
      const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
      return Array.isArray(items) ? items : [];
    })();

    CACHE.set(key, p);
    return await p;
  }

  function buildLabel(spec, item) {
    const labelKey = spec.labelKey;
    const raw = (item && item[labelKey] != null) ? String(item[labelKey]) : '';
    const label = raw.trim();
    return label;
  }

  function buildOptions(spec, items, opts) {
    const placeholder = (opts && opts.placeholder) ? String(opts.placeholder) : '선택';
    const selectedValue = normStr(opts && opts.selectedValue);
    const selectedLabel = normStr(opts && opts.selectedLabel);

    const options = [{ value: '', label: placeholder }];
    const seen = new Set();

    items.forEach((it) => {
      const value = normStr(it && it[spec.valueKey]);
      if (!value || seen.has(value)) return;
      let label = buildLabel(spec, it);
      if (!label) label = value;
      options.push({ value, label });
      seen.add(value);
    });

    // Ensure a current value is representable.
    if (selectedValue && !seen.has(selectedValue)) {
      options.push({ value: selectedValue, label: selectedLabel || selectedValue });
    }

    // Optional model filtering by vendor (manufacturer_code)
    if (opts && opts.vendorValue && spec.vendorFilterKey) {
      const v = normStr(opts.vendorValue);
      if (v) {
        const keep = [options[0]];
        for (let i = 1; i < options.length; i++) {
          const opt = options[i];
          // If we don't have access to raw item mapping here, filtering is best-effort;
          // we rely on a pre-filter step when building items (below).
          keep.push(opt);
        }
        return keep;
      }
    }

    options.sort((a, b) => {
      if (a.value === '') return -1;
      if (b.value === '') return 1;
      return a.label.localeCompare(b.label, 'ko', { sensitivity: 'base' }) || a.value.localeCompare(b.value);
    });

    return options;
  }

  function ensureSelectFromField(fieldEl, fkName) {
    if (!fieldEl) return null;

    // Some pages use common FK names (e.g. vendor) as plain-text fields.
    // If explicitly opted out, never convert input -> select.
    if (isFkIgnored(fieldEl)) return fieldEl;

    const tag = (fieldEl.tagName || '').toLowerCase();
    if (tag === 'select') {
      fieldEl.classList.add('search-select', 'fk-select');
      fieldEl.dataset.fk = fkName;
      // Ensure we have an empty option for clear button.
      if (!fieldEl.querySelector('option[value=""]')) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '선택';
        fieldEl.insertBefore(opt, fieldEl.firstChild);
      }
      return fieldEl;
    }

    if (tag !== 'input') return null;

    // Defensive: hardware pages treat `model` as plain text (free-form).
    // Do not auto-convert input -> select for `model` on hardware pages unless explicitly allowed.
    // This avoids UI hangs caused by competing converters/normalizers.
    if (fkName === 'model') {
      try {
        const hwGroup = detectHwGroup();
        const allow = (fieldEl.getAttribute && fieldEl.getAttribute('data-fk-allow') === '1') || (fieldEl.dataset && fieldEl.dataset.fkAllow === '1');
        if (hwGroup && !allow) return fieldEl;
      } catch (_e) {}
    }

    // Convert input -> select while preserving id/name/classes.
    const select = document.createElement('select');
    select.id = fieldEl.id;
    select.name = fieldEl.name;
    select.className = fieldEl.className;
    select.classList.add('search-select', 'fk-select');
    select.dataset.fk = fkName;

    // Carry placeholder if present.
    const placeholder = fieldEl.getAttribute('placeholder');
    if (placeholder) select.dataset.placeholder = placeholder;

    // Preserve current value (might be a label in some pages).
    const current = normStr(fieldEl.value);
    if (current) {
      select.dataset._initialValue = current;
    }

    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '선택';
    select.appendChild(opt0);

    // Preserve and surface the current value immediately.
    // Without this, select.value stays '' until async population completes.
    // Dependent FK fields (sys_owner/svc_owner) may incorrectly think their parent is empty
    // and clear/disable themselves, especially after a page refresh.
    try {
      const placeholderLike = new Set(['-', '—', '선택', '부서 선택', '부서를 먼저 선택', '장소를 먼저 선택', '제조사를 먼저 선택']);
      if (current && !placeholderLike.has(current)) {
        const opt1 = document.createElement('option');
        opt1.value = current;
        opt1.textContent = current;
        opt1.selected = true;
        select.appendChild(opt1);
        select.value = current;
      }
    } catch (_e) {}

    fieldEl.parentNode.replaceChild(select, fieldEl);
    return select;
  }

  function resolveCurrentSelectLabel(select) {
    if (!(select instanceof HTMLSelectElement)) return '';
    const opt = select.selectedOptions && select.selectedOptions[0];
    return opt && opt.textContent ? opt.textContent.trim() : '';
  }

  function defaultPlaceholderForFk(fkName, ctx) {
    const hasParent = !!(ctx && ctx.hasParentValue);
    if (fkName === 'sys_dept' || fkName === 'svc_dept') return '부서 선택';
    if (fkName === 'sys_owner' || fkName === 'svc_owner') return hasParent ? '담당자 선택' : '부서를 먼저 선택';
    if (fkName === 'model') return hasParent ? '모델 선택' : '제조사를 먼저 선택';
    if (fkName === 'location_place') return '장소 선택';
    if (fkName === 'location_pos') return hasParent ? '위치 선택' : '장소를 먼저 선택';
    return '선택';
  }

  function ensureFirstOptionLabel(select, label) {
    try {
      if (!(select instanceof HTMLSelectElement)) return;
      const opts = select.options;
      if (!opts || !opts.length) return;
      const first = opts[0];
      if (!first) return;
      if (String(first.value || '') !== '') return;
      first.textContent = String(label || '선택');
    } catch (_e) {}
  }

  function isPlaceholderLikeValue(v) {
    const s = normStr(v);
    if (!s) return true;
    return s === '-' || s === '—' || s === '선택' || s === '부서 선택' || s === '부서를 먼저 선택' || s === '장소를 먼저 선택' || s === '제조사를 먼저 선택';
  }

  function trySelectByLabel(select, label) {
    const target = normStr(label);
    if (!target) return false;
    const opts = Array.from(select.options || []);
    const found = opts.find((o) => normStr(o.textContent) === target);
    if (found) {
      select.value = found.value;
      return true;
    }
    return false;
  }

  function labelVariantsForMatch(label) {
    const raw = normStr(label);
    if (!raw) return [];
    const variants = [raw];

    // Also try a variant without any parenthetical suffix: "센터명(5층)" -> "센터명".
    try {
      const noParen = normStr(String(label).replace(/\([^)]*\)/g, ' '));
      if (noParen && !variants.includes(noParen)) variants.push(noParen);
    } catch (_e) {}

    // Some labels include extra metadata (e.g., "센터명 · 위치 · 용도").
    // When a page stored only the base name, allow matching by the first segment.
    try {
      const first = normStr(String(label).split('·')[0]);
      if (first && !variants.includes(first)) variants.push(first);

      // Combine dot-split with parentheses removal.
      const firstNoParen = normStr(String(first).replace(/\([^)]*\)/g, ' '));
      if (firstNoParen && !variants.includes(firstNoParen)) variants.push(firstNoParen);
    } catch (_e) {}
    return variants;
  }

  function trySelectByLabelAmong(select, label, allowedValues) {
    if (!(select instanceof HTMLSelectElement)) return false;
    const variants = labelVariantsForMatch(label);
    if (!variants.length) return false;

    const opts = Array.from(select.options || []);
    const current = normStr(select.value);

    // Prefer options that are part of the loaded master list (allowedValues).
    // This avoids selecting the synthetic "current value" option that buildOptions injects.
    for (let i = 0; i < opts.length; i++) {
      const opt = opts[i];
      const v = normStr(opt && opt.value);
      if (!v) continue;
      if (allowedValues && allowedValues.size && !allowedValues.has(v)) continue;
      if (current && v === current) continue;
      const t = normStr(opt && opt.textContent);
      if (!t) continue;
      if (variants.includes(t) || variants.includes(normStr(String(t).split('·')[0]))) {
        select.value = v;
        return true;
      }
    }

    // Fallback: label-only match.
    return trySelectByLabel(select, label);
  }

  async function populateFkSelect(select, fkName, root, opts) {
    const spec = fieldSpec(fkName);
    if (!spec) return;

    const resetOnEmptyParent = !!(opts && opts.resetOnEmptyParent);

    let parentValue = '';
    const parentField = spec.dependsOn;
    if (parentField) {
      const parentEl = root.querySelector(`[name="${CSS.escape(parentField)}"]`);
      if (parentEl) parentValue = normStr(parentEl.value);
    }

    const vendorEl = fkName === 'model' ? root.querySelector('[name="vendor"]') : null;
    const vendorValue = vendorEl ? normStr(vendorEl.value) : '';

    // Ensure sensible placeholder defaults (align with on-premise modal UX).
    const fallbackPlaceholder = defaultPlaceholderForFk(fkName, { hasParentValue: !!parentValue });
    const placeholder = select.getAttribute('data-placeholder') || (select.dataset ? select.dataset.placeholder : '') || fallbackPlaceholder;

    // Model should behave like a dependent select: it is only meaningful once vendor is chosen.
    if (fkName === 'model' && !vendorValue) {
      const ph = defaultPlaceholderForFk('model', { hasParentValue: false });
      try {
        const enabledPlaceholder = defaultPlaceholderForFk('model', { hasParentValue: true });
        select.dataset.placeholder = enabledPlaceholder;
        select.setAttribute('data-placeholder', enabledPlaceholder);
      } catch (_) {}

      select.innerHTML = `<option value="">${escapeHTML(ph)}</option>`;
      ensureFirstOptionLabel(select, ph);
      try {
        select.value = '';
      } catch (_) {}
      try {
        if (resetOnEmptyParent && select.dataset) select.dataset._initialValue = '';
      } catch (_) {}
      try {
        select.disabled = true;
      } catch (_) {}

      try {
        if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') {
          window.BlossomSearchableSelect.syncAll(select);
        }
      } catch (_) {}
      return;
    }

    // For dependent selects (sys_owner/svc_owner), do not load a giant list when parent is empty.
    // Instead, show a helpful placeholder and keep the control disabled until dept is chosen.
    if (spec.dependsOn && !parentValue) {
      const currentValue = normStr(select.value);
      const currentLabel = resolveCurrentSelectLabel(select) || currentValue;
      const initialFromInput = normStr(select.dataset && select.dataset._initialValue);
      const keepValueRaw = currentValue || initialFromInput;
      const keepValue = resetOnEmptyParent ? '' : (isPlaceholderLikeValue(keepValueRaw) ? '' : keepValueRaw);
      const keepLabel = currentLabel || keepValue;

      const ph = defaultPlaceholderForFk(fkName, { hasParentValue: false });
      // Keep data-placeholder aligned with on-premise UX (BlossomSearchableSelect prefers attribute).
      try {
        const enabledPlaceholder = defaultPlaceholderForFk(fkName, { hasParentValue: true });
        select.dataset.placeholder = enabledPlaceholder;
        select.setAttribute('data-placeholder', enabledPlaceholder);
      } catch (_) {}

      const options = [{ value: '', label: ph }];
      if (keepValue) {
        options.push({ value: keepValue, label: keepLabel || keepValue });
      }
      select.innerHTML = options.map((o) => `<option value="${escapeHTML(o.value)}">${escapeHTML(o.label)}</option>`).join('');
      ensureFirstOptionLabel(select, ph);
      if (keepValue) {
        select.value = keepValue;
        select.disabled = false;
      } else {
        select.value = '';
        select.disabled = true;
      }
      try {
        if (resetOnEmptyParent && select.dataset) select.dataset._initialValue = '';
      } catch (_) {}
      try {
        if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') {
          window.BlossomSearchableSelect.syncAll(select);
        }
      } catch (_) {}
      return;
    }

    // If we have parent value (or field isn't dependent), ensure enabled.
    try {
      select.disabled = false;
    } catch (_) {}

    // Keep existing current value/label.
    const beforeValue = normStr(select.value);
    const currentValue = beforeValue;
    const currentLabel = resolveCurrentSelectLabel(select) || currentValue;
    const initialFromInput = normStr(select.dataset && select.dataset._initialValue);

    const items = await loadItems(spec, { parentValue });

    // Track master values so we can distinguish a real option from a synthetic
    // "current value" (often a label stored by older pages).
    const allowedValues = new Set(
      (Array.isArray(items) ? items : [])
        .map((it) => normStr(it && it[spec.valueKey]))
        .filter(Boolean)
    );

    const hwTypeFilter = detectHwTypeFilter();
    const hwGroup = (spec && spec.hwGroup) ? String(spec.hwGroup) : detectHwGroup();

    let filteredItems = items;

    if (fkName === 'model') {
      // First: constrain to this page subtype (e.g., SAN switch vs director).
      if (spec.typeKey && hwTypeFilter) {
        const key = String(spec.typeKey);
        const raw = Array.isArray(filteredItems) ? filteredItems : [];
        const scoped = raw.filter((it) => matchesTypeByGroup(hwGroup, it && it[key], hwTypeFilter));
        // Enforce subtype scoping for legacy pages. If there is no match, we prefer showing an empty list
        // rather than silently falling back to all types.
        filteredItems = scoped;
      }

      // Then: constrain to selected manufacturer.
      if (vendorValue) {
        const key = spec.vendorFilterKey;
        const raw = Array.isArray(filteredItems) ? filteredItems : [];
        const byVendor = raw.filter((it) => {
          const code = normStr(it && (it[key] || it.manufacturerCode || it.vendor));
          return !code || code === vendorValue;
        });
        if (byVendor.length) filteredItems = byVendor;
      }
    }

    if (fkName === 'vendor' && hwTypeFilter) {
      // Constrain manufacturer list to those referenced by the subtype's model list.
      try {
        const modelSpec = modelSourceForGroup();
        const modelItems = await loadItems(modelSpec, { parentValue: '' });

        let scopedModels = modelItems;
        if (modelSpec.typeKey) {
          const key = String(modelSpec.typeKey);
          const raw = Array.isArray(scopedModels) ? scopedModels : [];
          const scoped = raw.filter((it) => matchesTypeByGroup(modelSpec.hwGroup || detectHwGroup(), it && it[key], hwTypeFilter));
          // Same rationale as model: enforce subtype scoping.
          scopedModels = scoped;
        }

        const allowed = new Set(
          (Array.isArray(scopedModels) ? scopedModels : [])
            .map((it) => manufacturerCodeOf(it))
            .filter(Boolean)
        );

        const rawVendors = Array.isArray(items) ? items : [];
        const scopedVendors = rawVendors.filter((it) => {
          const code = manufacturerCodeOf(it);
          return !code || allowed.has(code);
        });
        filteredItems = scopedVendors;
      } catch (_e) {
        // If anything fails, keep original vendor list.
        filteredItems = items;
      }
    }

    const options = buildOptions(spec, filteredItems, {
      placeholder,
      selectedValue: currentValue,
      selectedLabel: currentLabel,
      vendorValue,
    });

    // Render options.
    const desiredValue = currentValue || '';
    select.innerHTML = options.map((o) => `<option value="${escapeHTML(o.value)}">${escapeHTML(o.label)}</option>`).join('');

    // Restore selection.
    if (desiredValue && Array.from(select.options).some((o) => o.value === desiredValue)) {
      select.value = desiredValue;
    } else if (initialFromInput) {
      // Try matching the old input value by value first, then by label.
      if (Array.from(select.options).some((o) => o.value === initialFromInput)) {
        select.value = initialFromInput;
      } else {
        trySelectByLabelAmong(select, initialFromInput, allowedValues);
      }
    }

    // If the selected value isn't part of master data, try reverse-mapping by label.
    // This fixes cases where a page stored/displayed the label (e.g., center_name)
    // but the API expects the code (e.g., center_code).
    try {
      const v = normStr(select.value);
      if (v && allowedValues.size && !allowedValues.has(v)) {
        const labelToMap = resolveCurrentSelectLabel(select) || currentLabel || initialFromInput || v;
        trySelectByLabelAmong(select, labelToMap, allowedValues);
      }
    } catch (_e) {}

    // Flag invalid selections so callers can avoid sending them.
    try {
      const finalV = normStr(select.value);
      if (finalV && allowedValues.size && !allowedValues.has(finalV)) {
        select.dataset._fkInvalid = '1';
      } else {
        select.dataset._fkInvalid = '0';
      }
    } catch (_e) {}

    // If this field is a dependency parent, notify dependents.
    // (Programmatic select.value assignment doesn't fire 'change' automatically.)
    try {
      const afterValue = normStr(select.value);
      const isParent = fkName === 'sys_dept' || fkName === 'svc_dept' || fkName === 'vendor' || fkName === 'location_place';
      if (isParent && afterValue !== beforeValue) {
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch (_e) {}

    // Let searchable enhancer refresh UI.
    try {
      if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') {
        // Sync only this select to avoid O(N^2) work when many FK selects populate.
        window.BlossomSearchableSelect.syncAll(select);
      }
    } catch (_) {}
  }

  function findModalRoots() {
    return $all(document, '.modal-overlay-full');
  }

  function isModalVisible(modalRoot) {
    try {
      if (!modalRoot) return false;
      if (modalRoot.hidden) return false;
      const aria = (modalRoot.getAttribute && modalRoot.getAttribute('aria-hidden')) || '';
      if (aria === 'false') return true;
      if (aria === 'true') return false;
      // Fallback: many modals toggle a .show class.
      if (modalRoot.classList && modalRoot.classList.contains('show')) return true;
      return true;
    } catch (_e) {
      return true;
    }
  }

  function ensureModalOpenObserver(modalRoot) {
    if (!modalRoot) return;
    if (MODAL_OBSERVERS.has(modalRoot)) return;
    const obs = new MutationObserver(() => {
      try {
        if (!isModalVisible(modalRoot)) return;
        // Populate once on first open; subsequent opens are covered by page scripts
        // and by dependency change listeners. Also avoids keeping observers forever.
        obs.disconnect();
        MODAL_OBSERVERS.delete(modalRoot);
        enhanceModalRoot(modalRoot, { forcePopulate: true });
      } catch (_e) {}
    });
    try {
      obs.observe(modalRoot, { attributes: true, attributeFilter: ['aria-hidden', 'class', 'style'] });
      MODAL_OBSERVERS.set(modalRoot, obs);
    } catch (_e) {}
  }

  function enhanceModalRoot(modalRoot, opts) {
    const forms = $all(modalRoot, 'form');
    if (!forms.length) return;

    const forcePopulate = !!(opts && opts.forcePopulate);
    const visibleNow = isModalVisible(modalRoot);
    const shouldPopulateNow = forcePopulate || visibleNow;
    const alreadyBooted = !forcePopulate && MODAL_BOOT.has(modalRoot);

    // If modal is currently hidden, defer network requests until it opens.
    if (!shouldPopulateNow) {
      ensureModalOpenObserver(modalRoot);
    }

    const fkFields = [
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
      'sys_owner',
      'svc_dept',
      'svc_owner',
    ];

    function wireFormDependencyDelegates(form) {
      try {
        if (!form || !form.dataset) return;
        if (form.dataset._blsFkDepsWired === '1') return;
        form.dataset._blsFkDepsWired = '1';
      } catch (_e) {
        // If dataset isn't available, still try to wire once.
      }

      try {
        form.addEventListener('change', (e) => {
          try {
            const t = e && e.target;
            const name = t && t.getAttribute ? t.getAttribute('name') : '';
            if (!name) return;

            if (name === 'location_place') {
              const pos = form.querySelector('[name="location_pos"]');
              if (pos instanceof HTMLSelectElement) {
                populateFkSelect(pos, 'location_pos', form, { resetOnEmptyParent: true }).catch(() => {});
              }
              return;
            }

            if (name === 'sys_dept') {
              const owner = form.querySelector('[name="sys_owner"]');
              if (owner instanceof HTMLSelectElement) {
                populateFkSelect(owner, 'sys_owner', form, { resetOnEmptyParent: true }).catch(() => {});
              }
              return;
            }

            if (name === 'svc_dept') {
              const owner = form.querySelector('[name="svc_owner"]');
              if (owner instanceof HTMLSelectElement) {
                populateFkSelect(owner, 'svc_owner', form, { resetOnEmptyParent: true }).catch(() => {});
              }
              return;
            }

            if (name === 'vendor') {
              const model = form.querySelector('[name="model"]');
              if (model instanceof HTMLSelectElement) {
                populateFkSelect(model, 'model', form, { resetOnEmptyParent: true }).catch(() => {});
              }
              return;
            }
          } catch (_e2) {}
        });
      } catch (_e3) {}
    }

    forms.forEach((form) => {
      // Important: wire dependency listeners BEFORE starting async population.
      // Some parents (e.g., location_place) are populated and dispatch 'change' very quickly
      // (cache hit). Without this, dependents (e.g., location_pos) can miss the event.
      wireFormDependencyDelegates(form);

      fkFields.forEach((fkName) => {
        const spec = fieldSpec(fkName);
        if (!spec) return;

        const fieldEl = form.querySelector(`[name="${CSS.escape(fkName)}"]`);
        if (!fieldEl) return;

        // Allow page templates to opt out from FK conversion.
        if (isFkIgnored(fieldEl)) return;

        // Replace input with select if needed.
        const select = ensureSelectFromField(fieldEl, fkName);
        if (!select) return;

        // Mark as modal-scope searchable.
        try {
          select.dataset.searchableScope = 'modal';
          select.dataset.searchable = 'true';
          // Force placeholders to match on-premise UX.
          if (fkName === 'sys_dept' || fkName === 'svc_dept') {
            select.dataset.placeholder = '부서 선택';
            select.setAttribute('data-placeholder', '부서 선택');
            ensureFirstOptionLabel(select, '부서 선택');
          } else if (fkName === 'sys_owner' || fkName === 'svc_owner') {
            // data-placeholder is the generic label; the first option shows the contextual hint.
            select.dataset.placeholder = '담당자 선택';
            select.setAttribute('data-placeholder', '담당자 선택');
            // Keep 담당자 selects visually consistent with native <select> (no inline '지움' button).
            select.dataset.allowClear = 'false';
            select.setAttribute('data-allow-clear', 'false');

            const deptField = fkName === 'sys_owner' ? 'sys_dept' : 'svc_dept';
            const deptEl = form.querySelector(`[name="${CSS.escape(deptField)}"]`);
            const deptVal = deptEl ? normStr(deptEl.value) : '';
            if (!deptVal) {
              // Always enforce disabled+cleared when parent dept is empty.
              // This also keeps both sys_owner/svc_owner visually consistent on first open.
              try { select.value = ''; } catch (_e) {}
              ensureFirstOptionLabel(select, '부서를 먼저 선택');
              select.disabled = true;
              try {
                if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') {
                  window.BlossomSearchableSelect.syncAll(select);
                }
              } catch (_e2) {}
            }
          } else if (fkName === 'model') {
            // model depends on vendor; show contextual hint immediately.
            select.dataset.placeholder = '모델 선택';
            select.setAttribute('data-placeholder', '모델 선택');

            const vendorEl = form.querySelector('[name="vendor"]');
            const vendorVal = vendorEl ? normStr(vendorEl.value) : '';
            if (!vendorVal && !normStr(select.value)) {
              ensureFirstOptionLabel(select, '제조사를 먼저 선택');
              select.disabled = true;
            }
          } else {
            // Prefer explicit placeholder if present; otherwise use sensible defaults.
            const existing = select.getAttribute('data-placeholder') || (select.dataset ? select.dataset.placeholder : '') || '';
            const basePlaceholder = existing || defaultPlaceholderForFk(fkName, { hasParentValue: true });
            select.dataset.placeholder = basePlaceholder;
            select.setAttribute('data-placeholder', basePlaceholder);
          }
        } catch (_) {}

        // Populate only when modal is visible (best effort).
        // Many detail pages rebuild modal DOM on every open; in that case,
        // per-select population is needed even if the modal was previously booted.
        if (shouldPopulateNow && (!alreadyBooted || select.dataset._fkPopulated !== '1')) {
          populateFkSelect(select, fkName, form)
            .then(() => {
              try { select.dataset._fkPopulated = '1'; } catch (_e) {}
            })
            .catch(() => {});
        }

        // Wire dependencies.
        if (fkName === 'sys_owner') {
          const dept = form.querySelector('[name="sys_dept"]');
          if (dept && !dept.dataset._fkOwnerWired) {
            dept.dataset._fkOwnerWired = '1';
            dept.addEventListener('change', () => {
              // Immediate UX: clear+disable dependent when parent cleared.
              try {
                if (!normStr(dept.value)) {
                  select.value = '';
                  select.disabled = true;
                  if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') {
                    window.BlossomSearchableSelect.syncAll(select);
                  }
                }
              } catch (_e) {}
              populateFkSelect(select, fkName, form, { resetOnEmptyParent: true }).catch(() => {});
            });
          }
        }
        if (fkName === 'svc_owner') {
          const dept = form.querySelector('[name="svc_dept"]');
          if (dept && !dept.dataset._fkOwnerWired) {
            dept.dataset._fkOwnerWired = '1';
            dept.addEventListener('change', () => {
              try {
                if (!normStr(dept.value)) {
                  select.value = '';
                  select.disabled = true;
                  if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') {
                    window.BlossomSearchableSelect.syncAll(select);
                  }
                }
              } catch (_e) {}
              populateFkSelect(select, fkName, form, { resetOnEmptyParent: true }).catch(() => {});
            });
          }
        }
        if (fkName === 'model') {
          const vendor = form.querySelector('[name="vendor"]');
          if (vendor && !vendor.dataset._fkModelWired) {
            vendor.dataset._fkModelWired = '1';
            vendor.addEventListener('change', () => {
              try {
                if (!normStr(vendor.value)) {
                  select.value = '';
                  select.disabled = true;
                  if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') {
                    window.BlossomSearchableSelect.syncAll(select);
                  }
                }
              } catch (_e) {}
              populateFkSelect(select, fkName, form, { resetOnEmptyParent: true }).catch(() => {});
            });
          }
        }
        if (fkName === 'location_pos') {
          const place = form.querySelector('[name="location_place"]');
          if (place && !place.dataset._fkLocationWired) {
            place.dataset._fkLocationWired = '1';
            place.addEventListener('change', () => {
              try {
                if (!normStr(place.value)) {
                  select.value = '';
                  select.disabled = true;
                  if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') {
                    window.BlossomSearchableSelect.syncAll(select);
                  }
                }
              } catch (_e) {}
              populateFkSelect(select, fkName, form, { resetOnEmptyParent: true }).catch(() => {});
            });
          }
        }
      });

      // After conversions, ensure searchable UI wraps are created.
      try {
        if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function') {
          // Avoid heavy DOM work on hidden modals; enhance when opened.
          if (shouldPopulateNow) {
            window.BlossomSearchableSelect.enhance(modalRoot);
          }
        }
      } catch (_) {}
    });

    // If this modal is already visible, ensure we only do the initial populate once.
    try {
      if (shouldPopulateNow) MODAL_BOOT.add(modalRoot);
    } catch (_e) {}
  }

  function init() {
    // Initial pass
    findModalRoots().forEach(enhanceModalRoot);

    // Observe for dynamically rendered bulk/edit forms.
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes || []) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.classList && node.classList.contains('modal-overlay-full')) {
            enhanceModalRoot(node);
            continue;
          }
          const modal = node.closest ? node.closest('.modal-overlay-full') : null;
          if (modal) {
            enhanceModalRoot(modal);
          }
        }
      }
    });

    // In some templates, page-level scripts run in <head> and may cache form controls.
    // Start observing as early as possible so inputs are converted to searchable FK selects
    // before other handlers interact with the modal.
    try {
      if (document.body) {
        obs.observe(document.body, { childList: true, subtree: true });
      }
    } catch (_) {}
  }

  // Boot as early as possible (even while parsing) to avoid timing issues.
  // If body isn't ready yet, fall back to DOMContentLoaded.
  function bootOnce() {
    if (window.__blossomFkSelectBooted) return;
    window.__blossomFkSelectBooted = true;
    init();
  }

  if (document.readyState === 'loading') {
    if (document.body) bootOnce();
    document.addEventListener('DOMContentLoaded', bootOnce);
  } else {
    bootOnce();
  }

  window.BlossomFkSelect = {
    enhance: enhanceModalRoot,
  };
})();
