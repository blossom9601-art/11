/**
 * 데이터센터 관리 페이지 스크립트
 * - 컬럼 토글 (기본 10개 노출)
 * - 로컬(in-memory) 데이터 렌더링 + 페이징 + 검색
 * - 모달 (등록/수정/컬럼 선택)
 * - CSV 다운로드 (현재 페이지 or 전체)
 * NOTE: 서버 연동 전 단계로 mock 데이터 사용
 */

(function(){
    const USE_SERVER = true;
    const API_BASE = '/api/datacenter/data-deletion-systems';
    const API_MAX_PAGE_SIZE = 500;

    // --- FK dropdown sources (reused across pages, similar to 2.hardware) ---
    const FK_SOURCE_CONFIG = {
        business_status: { endpoint: '/api/work-statuses', valueKey: 'status_code', labelKey: 'wc_name' },
        place: { endpoint: '/api/org-centers', valueKey: 'center_code', labelKey: 'center_name' },
        system_owner_dept: { endpoint: '/api/org-departments', valueKey: 'dept_code', labelKey: 'dept_name' },
        service_owner_dept: { endpoint: '/api/org-departments', valueKey: 'dept_code', labelKey: 'dept_name' },
        system_owner: { endpoint: '/api/user-profiles', valueKey: 'emp_no', labelKey: 'name' },
        service_owner: { endpoint: '/api/user-profiles', valueKey: 'emp_no', labelKey: 'name' },
    };
    const fkSourceCache = new Map();

    function _extractItems(payload){
        if(Array.isArray(payload?.items)) return payload.items;
        if(Array.isArray(payload)) return payload;
        return [];
    }

    async function loadFkSource(fieldKey){
        if(fkSourceCache.has(fieldKey)) return fkSourceCache.get(fieldKey);
        const cfg = FK_SOURCE_CONFIG[fieldKey];
        if(!cfg){ fkSourceCache.set(fieldKey, []); return []; }
        try{
            const data = await _apiJson(cfg.endpoint, { method: 'GET' });
            const items = _extractItems(data);
            fkSourceCache.set(fieldKey, items);
            return items;
        }catch(_e){
            fkSourceCache.set(fieldKey, []);
            return [];
        }
    }

    function _formatFkLabel(fieldKey, item, value, label){
        if(fieldKey === 'system_owner' || fieldKey === 'service_owner'){
            const emp = String(value || '').trim();
            const nm = String(label || '').trim();
            if(emp && nm) return `${nm} (${emp})`;
            return nm || emp;
        }
        if(fieldKey === 'business_status'){
            const name = String(label || item?.status_name || item?.wc_name || item?.status_code || value || '').trim();
            return name;
        }
        return String(label || value || '').trim();
    }

    function _formatUserLabel(user, empNo, name, includeDeptName){
        const emp = String(empNo || '').trim();
        const nm = String(name || '').trim();
        const base = (emp && nm) ? `${nm} (${emp})` : (nm || emp);
        if(!base) return '';
        if(!includeDeptName) return base;
        const deptName = _getUserDeptName(user);
        if(deptName && !base.includes(deptName)) return `${base} - ${deptName}`;
        return base;
    }

    function getSearchablePlaceholder(select){
        return (select?.getAttribute('data-placeholder') || select?.dataset?.placeholder || '선택');
    }

    function buildFkOptions(fieldKey){
        const cfg = FK_SOURCE_CONFIG[fieldKey];
        if(!cfg) return [];
        const records = fkSourceCache.get(fieldKey) || [];
        const valueKey = cfg.valueKey || 'id';
        const labelKey = cfg.labelKey || 'name';
        const seen = new Set();
        const options = [];
        records.forEach(item => {
            const raw = item?.[valueKey];
            if(raw == null) return;
            const value = String(raw).trim();
            if(!value || seen.has(value)) return;
            const label = (fieldKey === 'system_owner' || fieldKey === 'service_owner')
                ? _formatUserLabel(item, value, item?.[labelKey], true)
                : _formatFkLabel(fieldKey, item, value, item?.[labelKey]);
            options.push({ value, label });
            seen.add(value);
        });
        options.sort((a,b)=> a.label.localeCompare(b.label, 'ko', { sensitivity: 'base' }) || a.value.localeCompare(b.value));
        return options;
    }

    function resolveFkLabelFromCache(fieldKey, value){
        const cfg = FK_SOURCE_CONFIG[fieldKey];
        if(!cfg) return null;
        const wanted = (value == null) ? '' : String(value).trim();
        if(!wanted) return null;

        const records = fkSourceCache.get(fieldKey) || [];
        const valueKey = cfg.valueKey || 'id';
        const labelKey = cfg.labelKey || 'name';
        const match = records.find(item => String(item?.[valueKey] ?? '').trim() === wanted);
        if(!match) return null;

        const label = (fieldKey === 'system_owner' || fieldKey === 'service_owner')
            ? _formatUserLabel(match, wanted, match?.[labelKey], true)
            : _formatFkLabel(fieldKey, match, wanted, match?.[labelKey]);
        return label || null;
    }

    function _collectNonEmptyTrimmedSet(rows, key){
        const set = new Set();
        (rows || []).forEach(r=>{
            const v = String(r?.[key] ?? '').trim();
            if(v) set.add(v);
        });
        return set;
    }

    function _stripTrailingIndexSuffix(value){
        const s = String(value ?? '').trim();
        if(!s) return '';
        const m = s.match(/^(.*?)(\(\d+\))$/);
        return (m && m[1]) ? String(m[1]).trimEnd() : s;
    }

    function _makeUniqueWithNumericSuffix(baseValue, existingSet){
        const base = _stripTrailingIndexSuffix(baseValue);
        if(!base) return '';
        let i = 1;
        let candidate = `${base}(${i})`;
        while(existingSet.has(candidate)){
            i += 1;
            if(i > 9999) break;
            candidate = `${base}(${i})`;
        }
        existingSet.add(candidate);
        return candidate;
    }

    function _normalizeUniqueValue(v){
        const s = String(v ?? '').trim();
        return s;
    }

    function _isSameId(a, b){
        const aa = String(a ?? '').trim();
        const bb = String(b ?? '').trim();
        return aa && bb && aa === bb;
    }

    async function assertUniqueSystemFields(payload, excludeId){
        // Enforce no-duplicates for key identity fields.
        const businessName = _normalizeUniqueValue(payload?.business_name);
        const systemName = _normalizeUniqueValue(payload?.system_name);
        const serial = _normalizeUniqueValue(payload?.serial);

        // Empty values are not checked.
        if(!businessName && !systemName && !serial) return;

        const rows = USE_SERVER ? await fetchAllForCurrentQuery() : (state.data || []);
        const findDup = (key, value)=>{
            if(!value) return null;
            return (rows || []).find(r=>{
                const other = _normalizeUniqueValue(r?.[key]);
                if(!other) return false;
                if(other !== value) return false;
                if(excludeId != null && _isSameId(r?.id, excludeId)) return false;
                return true;
            }) || null;
        };

        const dupBiz = findDup('business_name', businessName);
        if(dupBiz) throw new Error(`업무 이름이 중복됩니다: ${businessName}`);
        const dupSys = findDup('system_name', systemName);
        if(dupSys) throw new Error(`시스템 이름이 중복됩니다: ${systemName}`);
        const dupSer = findDup('serial', serial);
        if(dupSer) throw new Error(`시스템 일련번호가 중복됩니다: ${serial}`);
    }

    function setSelectOptions(select, options, selectedValue){
        const placeholder = getSearchablePlaceholder(select);
        const wanted = (selectedValue == null) ? '' : String(selectedValue).trim();
        const prevValue = wanted || String(select.value || '').trim();

        select.innerHTML = '';
        const opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = placeholder;
        select.appendChild(opt0);

        const values = new Set(['']);
        options.forEach(o=>{
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.label || o.value;
            select.appendChild(opt);
            values.add(o.value);
        });
        if(prevValue && !values.has(prevValue)){
            const extra = document.createElement('option');
            extra.value = prevValue;
            extra.textContent = prevValue;
            select.appendChild(extra);
        }
        select.value = prevValue;
    }

    function setSelectOptionsStrict(select, options, selectedValue){
        const placeholder = getSearchablePlaceholder(select);
        const wanted = (selectedValue == null) ? '' : String(selectedValue).trim();
        const prevValue = wanted || String(select.value || '').trim();

        select.innerHTML = '';
        const opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = placeholder;
        select.appendChild(opt0);

        const values = new Set(['']);
        options.forEach(o=>{
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.label || o.value;
            select.appendChild(opt);
            values.add(o.value);
        });
        select.value = values.has(prevValue) ? prevValue : '';
    }

    function _getUserDeptCode(user){
        const candidates = [
            user?.dept_code,
            user?.department_code,
            user?.deptCode,
            user?.departmentCode,
            user?.org_dept_code,
            user?.orgDeptCode,
        ];
        const v = candidates.find(x=> x != null && String(x).trim() !== '');
        return v == null ? '' : String(v).trim();
    }

    function _getUserDeptName(user){
        const candidates = [
            user?.dept_name,
            user?.department_name,
            user?.deptName,
            user?.departmentName,
            user?.org_dept_name,
            user?.orgDeptName,
        ];
        const v = candidates.find(x=> x != null && String(x).trim() !== '');
        return v == null ? '' : String(v).trim();
    }

    function buildUserOptionsFilteredByDept(deptValue, deptLabel, includeDeptName){
        const cfg = FK_SOURCE_CONFIG.system_owner;
        const records = fkSourceCache.get('system_owner') || fkSourceCache.get('service_owner') || [];
        const valueKey = cfg?.valueKey || 'emp_no';
        const labelKey = cfg?.labelKey || 'name';
        const deptCode = String(deptValue || '').trim();
        const deptName = String(deptLabel || '').trim();

        const options = [];
        const seen = new Set();
        records.forEach(user=>{
            const empRaw = user?.[valueKey];
            if(empRaw == null) return;
            const emp = String(empRaw).trim();
            if(!emp || seen.has(emp)) return;

            const userDeptCode = _getUserDeptCode(user);
            const userDeptName = _getUserDeptName(user);
            const deptMatch = !deptCode
                ? true
                : (userDeptCode && userDeptCode === deptCode) || (deptName && userDeptName && userDeptName === deptName);
            if(!deptMatch) return;

            const nm = String(user?.[labelKey] || '').trim();
            const label = _formatUserLabel(user, emp, nm, includeDeptName === true);
            options.push({ value: emp, label });
            seen.add(emp);
        });
        options.sort((a,b)=> a.label.localeCompare(b.label, 'ko', { sensitivity: 'base' }) || a.value.localeCompare(b.value));
        return options;
    }

    // --- Searchable select UI (floating search panel, like 2.hardware) ---
    const searchableSelectMeta = new WeakMap();
    let activeSearchPanel = null;

    // IMPORTANT: This page previously had its own searchable-select implementation.
    // However, `static/js/blossom.js` globally injects the shared helper
    // (`/static/js/ui/searchable_select.js`) with `defer`, which means this file can
    // run first and wrap selects before the shared helper initializes.
    // When that happens, the shared helper will skip already-enhanced selects and
    // the system tab ends up with a different dropdown UX than other tabs.
    //
    // To keep the UX consistent across tabs, we now delegate all searchable-select
    // behavior to the shared helper and DO NOT create local wrappers here.

    function _syncSharedSearchableSelects(scopeEl){
        const scope = scopeEl || document;
        try{
            if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
                window.BlossomSearchableSelect.syncAll(scope);
                return true;
            }
        }catch(_e){ /* ignore */ }

        // Shared helper is injected with `defer`; it may not be ready yet.
        // Retry once on the next tick so modals still get enhanced.
        try{
            setTimeout(()=>{
                try{
                    window.BlossomSearchableSelect && window.BlossomSearchableSelect.syncAll && window.BlossomSearchableSelect.syncAll(scope);
                }catch(_e2){ /* ignore */ }
            }, 0);
        }catch(_e3){ /* ignore */ }
        return false;
    }

    function isSearchableSelect(select){
        const explicit = select?.dataset?.searchable;
        if(explicit === 'true') return true;
        if(explicit === 'false') return false;
        return true;
    }

    function setupSearchableSelect(select){
        if(!select || !isSearchableSelect(select)) return;
        const scope = (select.closest && select.closest('.modal-overlay-full')) || select;
        _syncSharedSearchableSelects(scope);
    }

    function syncSearchableSelect(select){
        if(!select || !isSearchableSelect(select)) return;
        const scope = (select.closest && select.closest('.modal-overlay-full')) || select;
        _syncSharedSearchableSelects(scope);
    }

    function buildSearchPanelOptions(select, placeholder){
        return Array.from(select?.options || []).map(opt=>{
            const value = String(opt.value || '');
            const label = (opt.textContent || '').trim() || value || placeholder;
            return { value, label, searchLabel: label.toLowerCase(), valueLower: value.toLowerCase() };
        });
    }

    function renderPanel(state){
        state.list.innerHTML = '';
        if(!state.filtered.length){
            state.empty.hidden = false;
            return;
        }
        state.empty.hidden = true;
        const currentValue = state.select.value || '';
        state.filtered.forEach(opt=>{
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'fk-search-panel__item';
            btn.textContent = opt.label;
            btn.dataset.value = opt.value;
            if(opt.value === currentValue) btn.classList.add('selected');
            btn.addEventListener('click', e=>{
                e.preventDefault();
                state.select.value = opt.value;
                state.select.dispatchEvent(new Event('change', { bubbles: true }));
                syncSearchableSelect(state.select);
                closeSearchDropdown();
            });
            state.list.appendChild(btn);
        });
    }

    function filterPanel(state){
        const term = state.input.value.trim().toLowerCase();
        state.filtered = term
            ? state.options.filter(o=> o.searchLabel.includes(term) || o.valueLower.includes(term))
            : state.options.slice();
        renderPanel(state);
    }

    function positionPanel(state){
        const rect = state.anchor.getBoundingClientRect();
        const margin = 8;
        const width = Math.max(rect.width, 280);
        state.panel.style.width = `${width}px`;
        let left = rect.left;
        if(left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
        left = Math.max(margin, left);
        let top = rect.bottom + margin;
        const panelHeight = state.panel.offsetHeight;
        const below = window.innerHeight - rect.bottom - margin;
        const above = rect.top - margin;
        if(panelHeight > below && above > below){
            top = rect.top - panelHeight - margin;
            state.panel.classList.add('placement-above');
        } else {
            state.panel.classList.remove('placement-above');
        }
        top = Math.max(margin, top);
        state.panel.style.left = `${left}px`;
        state.panel.style.top = `${top}px`;
    }

    function openSearchDropdown(select){
        // No-op: handled by the shared helper UI.
        // (We keep the function for compatibility with existing call sites.)
        return;
    }

    function closeSearchDropdown(targetSelect){
        try{
            if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.close === 'function'){
                window.BlossomSearchableSelect.close();
                return;
            }
        }catch(_e){ /* ignore */ }

        // Fallback for older state if any local panel is open
        if(!activeSearchPanel) return;
        if(targetSelect && activeSearchPanel.select !== targetSelect) return;
        const state = activeSearchPanel;
        state.trigger?.setAttribute('aria-expanded', 'false');
        if(state.panel?.parentNode) state.panel.parentNode.removeChild(state.panel);
        if(state.outsideHandler) document.removeEventListener('pointerdown', state.outsideHandler, true);
        if(state.keyHandler) document.removeEventListener('keydown', state.keyHandler, true);
        if(state.resizeHandler){
            window.removeEventListener('resize', state.resizeHandler);
            window.removeEventListener('scroll', state.resizeHandler, true);
        }
        activeSearchPanel = null;
    }

    function enhanceFormSearchableSelects(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        _syncSharedSearchableSelects(form);
    }

    async function prepareFormFkSelects(formId, initialValues){
        const form = document.getElementById(formId);
        if(!form) return;
        const selects = [...form.querySelectorAll('select[data-fk]')];
        if(!selects.length) return;

        // Show searchable dropdown UI immediately (even before options load)
        enhanceFormSearchableSelects(formId);

        const fields = [...new Set(selects.map(s=> s.dataset.fk).filter(Boolean))];
        await Promise.all(fields.map(f=> loadFkSource(f)));
        selects.forEach(select=>{
            const key = select.dataset.fk;
            const options = buildFkOptions(key);
            const initial = initialValues ? initialValues[key] : null;
            setSelectOptions(select, options, initial);
        });

        // Dept -> User dependency (system/service owners)
        wireDeptUserDependency(formId, 'system_owner_dept', 'system_owner', initialValues);
        wireDeptUserDependency(formId, 'service_owner_dept', 'service_owner', initialValues);

        enhanceFormSearchableSelects(formId);
    }

    function wireDeptUserDependency(formId, deptFk, userFk, initialValues){
        const form = document.getElementById(formId);
        if(!form) return;
        const deptSelect = form.querySelector(`select[data-fk="${deptFk}"]`);
        const userSelect = form.querySelector(`select[data-fk="${userFk}"]`);
        if(!deptSelect || !userSelect) return;
        if(userSelect.dataset.deptDependencyWired === '1'){
            // Still update options for the currently selected dept when reopening
            _updateUserOptionsForDept(deptSelect, userSelect, initialValues);
            return;
        }
        userSelect.dataset.deptDependencyWired = '1';

        deptSelect.addEventListener('change', ()=>{
            _updateUserOptionsForDept(deptSelect, userSelect, null);
        });
        _updateUserOptionsForDept(deptSelect, userSelect, initialValues);
    }

    function _updateUserOptionsForDept(deptSelect, userSelect, initialValues){
        const deptValue = String(deptSelect.value || '').trim();
        const deptLabel = (deptSelect.selectedOptions && deptSelect.selectedOptions[0])
            ? String(deptSelect.selectedOptions[0].textContent || '').trim()
            : '';

        // Enforce "부서 먼저 선택" UX: disable user select until dept chosen.
        if(!deptValue){
            userSelect.disabled = true;
            setSelectOptionsStrict(userSelect, [], '');
            setupSearchableSelect(userSelect);
            syncSearchableSelect(userSelect);
            return;
        }

        userSelect.disabled = false;

        const currentInitial = initialValues ? initialValues[userSelect.dataset.fk] : null;
        const selectedValue = currentInitial != null ? currentInitial : userSelect.value;

        const options = buildUserOptionsFilteredByDept(deptValue, deptLabel, false);
        // Strict: if selected user isn't in dept list, clear it.
        setSelectOptionsStrict(userSelect, options, selectedValue);
        setupSearchableSelect(userSelect);
        syncSearchableSelect(userSelect);
    }

    // External dependencies
    const LOTTIE_CDN = 'https://unpkg.com/lottie-web@5.12.2/build/player/lottie.min.js';
    const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    function ensureLottie(cb){
        if(window.lottie){ cb(); return; }
        const s = document.createElement('script'); s.src = LOTTIE_CDN; s.async = true; s.onload = ()=> cb(); document.head.appendChild(s);
    }
    function ensureXLSX(){
        return new Promise((resolve, reject)=>{
            if(window.XLSX){ resolve(); return; }
            const s = document.createElement('script'); s.src = XLSX_CDN; s.async = true; s.onload = ()=> resolve(); s.onerror=()=> reject(new Error('XLSX load failed')); document.head.appendChild(s);
        });
    }
    // Flatpickr (calendar) loader and initializer
    const FLATPICKR_CSS = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
    const FLATPICKR_THEME_NAME = 'airbnb'; // use neutral theme; colors overridden to match accent
    const FLATPICKR_THEME_HREF = `https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/${FLATPICKR_THEME_NAME}.css`;
    const FLATPICKR_JS = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.js';
    const FLATPICKR_KO = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/ko.js';
    function ensureCss(href, id){
        const existing = document.getElementById(id);
        if(existing && existing.tagName.toLowerCase() === 'link'){
            if(existing.getAttribute('href') !== href){ existing.setAttribute('href', href); }
            return;
        }
        const l = document.createElement('link'); l.rel='stylesheet'; l.href = href; l.id = id; document.head.appendChild(l);
    }
    function loadScript(src){
        return new Promise((resolve, reject)=>{
            const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ()=> resolve(); s.onerror = ()=> reject(new Error('Script load failed: '+src)); document.head.appendChild(s);
        });
    }
    async function ensureFlatpickr(){
        // Always ensure base CSS and the selected theme (update if already present)
        ensureCss(FLATPICKR_CSS, 'flatpickr-css');
        ensureCss(FLATPICKR_THEME_HREF, 'flatpickr-theme-css');
        if(window.flatpickr){ return; }
        await loadScript(FLATPICKR_JS);
        try { await loadScript(FLATPICKR_KO); } catch(_e){}
    }
    async function initDatePickers(formId){
        const form = document.getElementById(formId); if(!form) return;
        try { await ensureFlatpickr(); } catch(_e){ return; }
        const dateEl = form.querySelector('[name="work_date"]');
        function ensureTodayButton(fp){
            const cal = fp?.calendarContainer; if(!cal) return;
            if(cal.querySelector('.fp-today-btn')) return; // already added
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'fp-today-btn';
            btn.textContent = '오늘';
            btn.addEventListener('click', ()=>{
                const now = new Date();
                fp.setDate(now, true); // set and trigger change
                // optionally keep open; if you want to close: fp.close();
            });
            cal.appendChild(btn);
        }
        const opts = {
            locale: (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.ko) ? window.flatpickr.l10ns.ko : 'ko',
            dateFormat: 'Y-m-d',
            allowInput: true,
            disableMobile: true,
            onReady: function(selectedDates, dateStr, instance){ ensureTodayButton(instance); },
            onOpen: function(selectedDates, dateStr, instance){ ensureTodayButton(instance); }
        };
        if(dateEl && !dateEl._flatpickr){ window.flatpickr(dateEl, opts); }
    }
    let uploadAnim = null; // keep a single instance for upload modal
    function initUploadAnim(){
        const el = document.getElementById('upload-anim'); if(!el) return;
        ensureLottie(()=>{
            try {
                // Destroy any previous instance and clear container to prevent duplicates
                if(uploadAnim && typeof uploadAnim.destroy === 'function'){
                    uploadAnim.destroy();
                }
                el.innerHTML = '';
                uploadAnim = window.lottie.loadAnimation({
                    container: el,
                    renderer:'svg',
                    loop:true,
                    autoplay:true,
                    path:'/static/image/svg/list/free-animated-upload.json',
                    rendererSettings:{ preserveAspectRatio:'xMidYMid meet', progressiveLoad:true }
                });
            } catch(_e){}
        });
    }
    const TABLE_ID = 'system-table';
    const TBODY_ID = 'system-table-body';
    const COUNT_ID = 'system-count';
    const SEARCH_ID = 'system-search';
    const SEARCH_CLEAR_ID = 'system-search-clear';
    const PAGE_SIZE_ID = 'system-page-size';
    const PAGINATION_INFO_ID = 'system-pagination-info';
    const PAGE_NUMBERS_ID = 'system-page-numbers';
    const SELECT_ALL_ID = 'system-select-all';

    // Column modal
    const COLUMN_MODAL_ID = 'system-column-modal';
    const COLUMN_FORM_ID = 'system-column-form';
    const COLUMN_BTN_ID = 'system-column-btn';
    const COLUMN_CLOSE_ID = 'system-column-close';
    const COLUMN_APPLY_ID = 'system-column-apply';
    const COLUMN_RESET_ID = 'system-column-reset';
    const COLUMN_SELECTALL_BTN_ID = 'system-column-selectall-btn';

    // Add/Edit modal
    const ADD_MODAL_ID = 'system-add-modal';
    const ADD_BTN_ID = 'system-add-btn';
    const ADD_CLOSE_ID = 'system-add-close';
    const ADD_SAVE_ID = 'system-add-save';
    const ADD_FORM_ID = 'system-add-form';
    const EDIT_MODAL_ID = 'system-edit-modal';
    const EDIT_FORM_ID = 'system-edit-form';
    const EDIT_CLOSE_ID = 'system-edit-close';
    const EDIT_SAVE_ID = 'system-edit-save';

    // Dispose (불용처리)
    const DISPOSE_BTN_ID = 'system-dispose-btn';
    const DISPOSE_MODAL_ID = 'system-dispose-modal';
    const DISPOSE_CLOSE_ID = 'system-dispose-close';
    const DISPOSE_CONFIRM_ID = 'system-dispose-confirm';

    // Delete (삭제처리)
    const DELETE_BTN_ID = 'system-delete-btn';
    const DELETE_MODAL_ID = 'system-delete-modal';
    const DELETE_CLOSE_ID = 'system-delete-close';
    const DELETE_CONFIRM_ID = 'system-delete-confirm';

    // Bulk Edit (일괄변경)
    const BULK_BTN_ID = 'system-bulk-btn';
    const BULK_MODAL_ID = 'system-bulk-modal';
    const BULK_CLOSE_ID = 'system-bulk-close';
    const BULK_FORM_ID = 'system-bulk-form';
    const BULK_APPLY_ID = 'system-bulk-apply';

    // Stats (통계)
    const STATS_BTN_ID = 'system-stats-btn';
    const STATS_MODAL_ID = 'system-stats-modal';
    const STATS_CLOSE_ID = 'system-stats-close';
    const STATS_OK_ID = 'system-stats-ok';

    // Upload (엑셀 업로드)
    const UPLOAD_BTN_ID = 'system-upload-btn';
    const UPLOAD_MODAL_ID = 'system-upload-modal';
    const UPLOAD_CLOSE_ID = 'system-upload-close';
    const UPLOAD_INPUT_ID = 'upload-input';
    const UPLOAD_DROPZONE_ID = 'upload-dropzone';
    const UPLOAD_META_ID = 'upload-meta';
    const UPLOAD_FILE_CHIP_ID = 'upload-file-chip';
    const UPLOAD_TEMPLATE_BTN_ID = 'upload-template-download';
    const UPLOAD_CONFIRM_ID = 'system-upload-confirm';
    // Upload template (Data Deletion System schema)
    const UPLOAD_HEADERS_KO = [
        '업무 상태','업무 이름','시스템 이름','시스템 IP','관리 IP','시스템 제조사','시스템 모델명','시스템 일련번호','시스템 장소','시스템 위치','시스템 담당부서','시스템 담당자','서비스 담당부서','서비스 담당자'
    ];
    const HEADER_KO_TO_KEY = {
        '업무 상태':'business_status',
        '업무 이름':'business_name',
        '시스템 이름':'system_name',
        '시스템 IP':'system_ip',
        '관리 IP':'manage_ip',
        '시스템 제조사':'vendor',
        '시스템 모델명':'model',
        '시스템 일련번호':'serial',
        '시스템 장소':'place',
        '시스템 위치':'location',
        '시스템 담당부서':'system_owner_dept',
        '시스템 담당자':'system_owner',
        '서비스 담당부서':'service_owner_dept',
        '서비스 담당자':'service_owner'
    };
    const ENUM_SETS = { };
    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
    function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }

    // Data + State
    const BASE_VISIBLE_COLUMNS = [
        // 비즈니스 (기본)
        'business_status','business_name','system_name','system_ip','manage_ip',
        // 시스템 (기본)
        'vendor','model','serial','place','location'
        // 담당자 (기본 제외)
        // 'system_owner_dept','system_owner','service_owner_dept','service_owner'
    ];
    const COLUMN_ORDER = [
        'business_status','business_name','system_name','system_ip','manage_ip','vendor','model','serial','place','location','system_owner_dept','system_owner','service_owner_dept','service_owner'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '비즈니스', columns: ['business_status','business_name','system_name','system_ip','manage_ip'] },
        { group: '시스템', columns: ['vendor','model','serial','place','location'] },
        { group: '담당자', columns: ['system_owner_dept','system_owner','service_owner_dept','service_owner'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        business_status:{label:'업무 상태',group:'비즈니스'},
        business_name:{label:'업무 이름',group:'비즈니스'},
        system_name:{label:'시스템 이름',group:'시스템'},
        system_ip:{label:'시스템 IP',group:'시스템'},
        manage_ip:{label:'관리 IP',group:'시스템'},
        vendor:{label:'시스템 제조사',group:'시스템'},
        model:{label:'시스템 모델명',group:'시스템'},
        serial:{label:'시스템 일련번호',group:'시스템'},
        place:{label:'시스템 장소',group:'시스템'},
        location:{label:'시스템 위치',group:'시스템'},
        system_owner_dept:{label:'시스템 담당부서',group:'담당자'},
        system_owner:{label:'시스템 담당자',group:'담당자'},
        service_owner_dept:{label:'서비스 담당부서',group:'담당자'},
        service_owner:{label:'서비스 담당자',group:'담당자'}
    };

    let state = {
        data: [],
        filtered: [],
        total: 0,
        pageSize: 10,
        page: 1,
        visibleCols: new Set(BASE_VISIBLE_COLUMNS),
        search: '',
        // 선택된 행 (row id 기반) 저장하여 리렌더 후에도 유지
        selected: new Set(),
        nextId: 1, // mockData 초기화 후 재설정
        sortKey: null,
        sortDir: 'asc',
    columnFilters: {} // { col: value | [values...] } (조건 필터 기능 제거 예정 - 빈 유지)
    };

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;

    // 데이터 삭제 시스템: 샘플 데이터 5개 제공
    function mockData(count=5){
        const rows = [
            { id:1, business_status:'가동', business_name:'주문 처리', system_name:'order-api-01', system_ip:'10.0.10.21', manage_ip:'10.0.200.21', vendor:'Dell', model:'PowerEdge R650', serial:'DELL-1A2B3C', place:'서울1센터', location:'R1-C03-U12', system_owner_dept:'인프라팀', system_owner:'홍길동', service_owner_dept:'플랫폼팀', service_owner:'김영수' },
            { id:2, business_status:'유휴', business_name:'데이터 마트', system_name:'dwh-node-02', system_ip:'10.0.20.52', manage_ip:'10.0.220.52', vendor:'HPE', model:'DL380 Gen10', serial:'HPE-9Z88XY', place:'서울1센터', location:'R2-C10-U20', system_owner_dept:'인프라팀', system_owner:'이영희', service_owner_dept:'데이터팀', service_owner:'박민수' },
            { id:3, business_status:'대기', business_name:'결제 백오피스', system_name:'pay-mgmt-01', system_ip:'10.0.30.11', manage_ip:'10.0.230.11', vendor:'Lenovo', model:'SR650', serial:'LEN-7777AA', place:'판교센터', location:'R3-C05-U08', system_owner_dept:'운영팀', system_owner:'최가을', service_owner_dept:'경영관리', service_owner:'정하늘' },
            { id:4, business_status:'가동', business_name:'알림 처리', system_name:'notify-svc-03', system_ip:'10.0.40.33', manage_ip:'10.0.240.33', vendor:'Cisco', model:'UCS C220', serial:'CSC-ABC999', place:'서울2센터', location:'R4-C02-U02', system_owner_dept:'운영팀', system_owner:'김철수', service_owner_dept:'플랫폼팀', service_owner:'문지은' },
            { id:5, business_status:'가동', business_name:'로그 수집', system_name:'log-in-01', system_ip:'10.0.50.70', manage_ip:'10.0.250.70', vendor:'Supermicro', model:'SYS-1029', serial:'SMC-QQ12ZZ', place:'부산센터', location:'R5-C08-U40', system_owner_dept:'인프라팀', system_owner:'박보라', service_owner_dept:'보안팀', service_owner:'오세훈' }
        ];
        return rows.slice(0, Math.max(0, count|0));
    }

    function _parseSearchTokens(raw){
        const trimmed = String(raw || '').trim();
        const groups = trimmed
            ? trimmed.split('%').map(g=> g.split(',').map(s=>s.trim()).filter(Boolean).map(s=>s.toLowerCase())).filter(arr=>arr.length>0)
            : [];
        return { raw: String(raw || ''), tokens: groups.flat() };
    }

    function _resolveOrderParam(){
        if(!state.sortKey) return null;
        const key = state.sortKey;
        const map = {
            business_status: 'business_status_code',
            business_name: 'business_name',
            system_name: 'system_name',
            system_ip: 'system_ip',
            manage_ip: 'mgmt_ip',
            vendor: 'manufacturer_code',
            model: 'system_model_name',
            serial: 'serial_number',
            place: 'center_code',
            location: 'rack_position',
            system_owner_dept: 'system_dept_code',
            system_owner: 'system_manager_id',
            service_owner_dept: 'service_dept_code',
            service_owner: 'service_manager_id',
            id: 'id',
        };
        const mapped = map[key] || key;
        return (state.sortDir === 'desc' ? '-' : '') + mapped;
    }

    async function _apiJson(url, options){
        const res = await fetch(url, {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', ...(options?.headers||{}) },
            ...options,
        });
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch(_e){}
        if(!res.ok){
            const msg = (data && (data.message || data.error)) ? (data.message || data.error) : (text || `HTTP ${res.status}`);
            throw new Error(msg);
        }
        return data;
    }

    async function refreshFromServer(){
        if(!USE_SERVER) return;
        const searchWrapper = document.getElementById('system-search-wrapper');
        const searchLoader = document.getElementById('system-search-loader');
        try {
            if(searchWrapper){ searchWrapper.classList.add('active-searching'); }
            if(searchLoader){ searchLoader.setAttribute('aria-hidden','false'); }

            // Ensure FK caches are available for table label rendering.
            // Without this, the server's code values can appear in the table.
            try{
                await Promise.all([
                    loadFkSource('business_status'),
                    loadFkSource('place'),
                ]);
                // Best-effort retry once if an endpoint temporarily returned empty.
                const bs = fkSourceCache.get('business_status') || [];
                const pc = fkSourceCache.get('place') || [];
                if((bs.length === 0) || (pc.length === 0)){
                    await Promise.all([
                        loadFkSource('business_status'),
                        loadFkSource('place'),
                    ]);
                }
            }catch(_e){ /* non-fatal */ }

            const params = new URLSearchParams();
            params.set('page', String(state.page || 1));
            params.set('page_size', String(state.pageSize || 10));
            const q = (state.search || '').trim();
            if(q) params.set('q', q);
            const order = _resolveOrderParam();
            if(order) params.set('order', order);

            const payload = await _apiJson(`${API_BASE}?${params.toString()}`, { method: 'GET' });
            if(payload && payload.success === false){
                throw new Error(payload.message || '조회 중 오류가 발생했습니다.');
            }
            state.data = Array.isArray(payload?.items) ? payload.items : [];
            state.filtered = state.data;
            state.total = Number.isFinite(payload?.total) ? payload.total : (payload?.total || 0);
            state.page = payload?.page || state.page;
            state.pageSize = payload?.page_size || state.pageSize;
        } catch(err){
            showMessage(err?.message || '데이터를 불러오지 못했습니다.', '오류');
            state.data = [];
            state.filtered = [];
            state.total = 0;
        } finally {
            if(searchWrapper){ searchWrapper.classList.remove('active-searching'); }
            if(searchLoader){ searchLoader.setAttribute('aria-hidden','true'); }
            render(_parseSearchTokens(state.search));
        }
    }

    async function createSystem(payload){
        const res = await _apiJson(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {}),
        });
        if(res?.success === false){ throw new Error(res?.message || '생성 중 오류가 발생했습니다.'); }
        return res?.item;
    }

    async function updateSystem(systemId, payload){
        const res = await _apiJson(`${API_BASE}/${encodeURIComponent(systemId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {}),
        });
        if(res?.success === false){ throw new Error(res?.message || '수정 중 오류가 발생했습니다.'); }
        return res?.item;
    }

    async function bulkDeleteSystems(ids){
        const res = await _apiJson(`${API_BASE}/bulk-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: ids || [] }),
        });
        if(res?.success === false){ throw new Error(res?.message || '삭제 중 오류가 발생했습니다.'); }
        return res?.deleted || 0;
    }

    async function fetchAllForCurrentQuery(){
        if(!USE_SERVER) return [...(state.filtered || [])];
        const q = (state.search || '').trim();
        const order = _resolveOrderParam();

        let page = 1;
        const pageSize = API_MAX_PAGE_SIZE;
        const items = [];
        let total = null;

        while(true){
            const params = new URLSearchParams();
            params.set('page', String(page));
            params.set('page_size', String(pageSize));
            if(q) params.set('q', q);
            if(order) params.set('order', order);

            const payload = await _apiJson(`${API_BASE}?${params.toString()}`, { method: 'GET' });
            if(payload && payload.success === false){
                throw new Error(payload.message || '조회 중 오류가 발생했습니다.');
            }
            const chunk = Array.isArray(payload?.items) ? payload.items : [];
            items.push(...chunk);
            total = Number.isFinite(payload?.total) ? payload.total : total;
            if(chunk.length < pageSize) break;
            if(total != null && items.length >= total) break;
            page += 1;
            if(page > 1000) break;
        }
        return items;
    }

    function _promisePool(tasks, limit=6){
        const queue = [...tasks];
        const workers = Array.from({length: Math.max(1, limit|0)}, async ()=>{
            while(queue.length){
                const fn = queue.shift();
                await fn();
            }
        });
        return Promise.all(workers);
    }

    function initData(){
        if(!USE_SERVER){
            state.data = mockData(5);
            state.nextId = state.data.length + 1;
            applyFilter();
            return;
        }
        state.data = [];
        state.filtered = [];
        state.total = 0;
        refreshFromServer();
    }

    function applyFilter(){
        if(USE_SERVER){
            state.page = 1;
            refreshFromServer();
            return;
        }
        const qRaw = state.search; // original input
        const trimmed = qRaw.trim();
        // 그룹 분리: % 기준 AND, 그룹 내 , 기준 OR (같은 열 기준 다중검색)
        // 예) "HPE,IBM%홍길동" => [ ['hpe','ibm'], ['홍길동'] ]
        const groups = trimmed
            ? trimmed.split('%').map(g=> g.split(',').map(s=>s.trim()).filter(Boolean).map(s=>s.toLowerCase())).filter(arr=>arr.length>0)
            : [];
        // Always search across all defined columns
        const searchCols = Object.keys(COLUMN_META);
        // 1단계: 기본 검색
        let base = [];
        if(!groups.length){
            base = [...state.data];
        } else {
            base = state.data.filter(row =>
                // 모든 그룹(%)이 만족해야 함
                groups.every(alts => {
                    // 하나의 그룹 내에서는 같은 열에서 OR 매칭(하나라도 포함되면 통과)
                    return searchCols.some(col => {
                        const v = row[col]; if(v==null) return false;
                        const cell = String(v).toLowerCase();
                        return alts.some(tok => cell.includes(tok));
                    });
                })
            );
        }
    state.filtered = base;
        state.page = 1;
    // 하이라이트는 모든 대안 토큰을 납작하게(flat) 전달
    const flatTokens = groups.flat();
    render({ raw:qRaw, tokens: flatTokens });
    }

    function getPageSlice(){
        return state.filtered;
    }

    function totalPages(){
        const total = USE_SERVER ? (state.total || 0) : state.filtered.length;
        return Math.max(1, Math.ceil(total / state.pageSize));
    }

    function render(highlightContext){
        const tbody = document.getElementById(TBODY_ID);
        if(!tbody) return;
        tbody.innerHTML='';
        const slice = USE_SERVER ? (state.data || []) : getPageSlice();
        const emptyEl = document.getElementById('system-empty');
        const totalCount = USE_SERVER ? (state.total || 0) : state.filtered.length;
        if(totalCount === 0){
            if(emptyEl){
                emptyEl.hidden = false;
                // 검색어가 있을 때와 데이터 자체가 없을 때 메시지 구분
                const titleEl = document.getElementById('system-empty-title');
                const descEl = document.getElementById('system-empty-desc');
                    if(state.search.trim()){
                        if(titleEl) titleEl.textContent = '검색 결과가 없습니다.';
                        if(descEl) descEl.textContent = '검색어를 변경하거나 필터를 초기화하세요.';
                    } else {
                        if(titleEl) titleEl.textContent = '시스템 항목이 없습니다.';
                        if(descEl) descEl.textContent = "우측 상단 '추가' 버튼을 눌러 첫 시스템을 등록하세요.";
                    }
            }
        } else if(emptyEl){
            // 데이터가 존재하면 항상 숨김
            emptyEl.hidden = true;
        }
        const highlightInfo = highlightContext || { raw:'', tokens:[] };
        const tokens = Array.isArray(highlightInfo.tokens) ? highlightInfo.tokens.filter(Boolean) : [];
        const highlightCols = Object.keys(COLUMN_META);
        function highlight(val, col){
            if(!val || !tokens.length || !highlightCols.includes(col)) return escapeHTML(val);
            let output = escapeHTML(String(val));
            tokens.forEach(tok=>{
                const esc = tok.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
                const regex = new RegExp(esc, 'ig');
                output = output.replace(regex, m=>`<mark class=\"search-hit\">${m}</mark>`);
            });
            return output;
        }
        slice.forEach((row)=>{
            const tr = document.createElement('tr');
            const checked = row.id && state.selected.has(row.id) ? 'checked' : '';
            tr.setAttribute('data-id', row.id ?? '');
            tr.innerHTML = `<td><input type="checkbox" class="system-row-select" data-id="${row.id??''}" ${checked}></td>`
                + COLUMN_ORDER.map(col=>{
                    if(!COLUMN_META[col]) return '';
                    const tdClass = state.visibleCols.has(col)?'':'col-hidden';
                    const label = COLUMN_META[col].label;
                    let rawVal = row[col];
                    if(col==='fail_reason' && typeof rawVal==='string'){
                        // single-line for table display
                        rawVal = rawVal.replace(/\r?\n|\r/g,' ');
                    }

                    // Server payload may contain code values for FK fields.
                    // Convert to human-readable labels for table display.
                    if(col === 'business_status'){
                        const mapped = resolveFkLabelFromCache('business_status', rawVal);
                        if(mapped) rawVal = mapped;
                    } else if(col === 'place'){
                        const mapped = resolveFkLabelFromCache('place', rawVal);
                        if(mapped) rawVal = mapped;
                    }

                    const displayVal = (rawVal==null || String(rawVal).trim()==='') ? '-' : rawVal;
                    let cellValue = highlight(displayVal, col);
                    // 업무 상태 배지: 가동/유휴/대기
                    if(col === 'business_status'){
                        const v = String(displayVal);
                        const map = { '가동':'ws-run', '유휴':'ws-idle', '대기':'ws-wait' };
                        const cls = map[v] || 'ws-wait';
                        cellValue = `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${highlight(displayVal, col)}</span></span>`;
                    }
                    return `<td data-col="${col}" data-label="${label}" class="${tdClass}">${cellValue}</td>`;
                }).join('')
                + `<td data-col="actions" data-label="관리" class="system-actions">`
                + `<button type="button" class="action-btn" data-action="edit" data-id="${row.id}" title="수정" aria-label="수정">
                    <img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon">
                   </button>`
                + `</td>`;
            if(row.id && state.selected.has(row.id)) tr.classList.add('selected');
            tbody.appendChild(tr);
        });
        const countEl = document.getElementById(COUNT_ID);
        if(countEl){
            const prev = parseInt(countEl.getAttribute('data-count') || (countEl.textContent||'0').replace(/,/g,''), 10) || 0;
            let next = USE_SERVER ? (state.total || 0) : state.filtered.length;
            if(DEMO_COUNTER != null){ next = DEMO_COUNTER; }
            const display = (DEMO_COUNTER != null) ? next.toLocaleString('ko-KR') : String(next);
            countEl.textContent = display;
            countEl.setAttribute('data-count', String(next));
            // size class management
            countEl.classList.remove('large-number','very-large-number');
            if(next >= 1000) countEl.classList.add('very-large-number');
            else if(next >= 100) countEl.classList.add('large-number');
            // pulse animation on change
            if(prev !== next){
                countEl.classList.remove('is-updating');
                void countEl.offsetWidth; // reflow to restart animation
                countEl.classList.add('is-updating');
            }
        }
        updatePagination();
        applyColumnVisibility();
        // select-all 상태 동기화
        const selectAll = document.getElementById(SELECT_ALL_ID);
        if(selectAll){
            const checkboxes = tbody.querySelectorAll('.system-row-select');
            if(checkboxes.length){
                selectAll.checked = [...checkboxes].every(cb=>cb.checked);
            } else {
                selectAll.checked = false;
            }
        }
        updateSortIndicators();
    }

    function escapeHTML(str){
        return String(str).replace(/[&<>'"]/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[s]));
    }

    function escapeAttr(str){
        return String(str).replace(/[&<>'"]/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[s]));
    }

    // Pagination UI
    function updatePagination(){
        const infoEl = document.getElementById(PAGINATION_INFO_ID);
        if(infoEl){
            const total = USE_SERVER ? (state.total || 0) : state.filtered.length;
            const start = total ? (state.page-1)*state.pageSize+1 : 0;
            const end = Math.min(total, state.page*state.pageSize);
            infoEl.textContent = `${start}-${end} / ${total}개 항목`;
        }
        const pages = totalPages();
        const container = document.getElementById(PAGE_NUMBERS_ID);
        if(container){
            container.innerHTML='';
            for(let p=1;p<=pages && p<=50;p++){ // hard cap to 50 buttons
                const btn = document.createElement('button');
                btn.className = 'page-btn'+(p===state.page?' active':'');
                btn.textContent = p;
                btn.dataset.page = p;
                container.appendChild(btn);
            }
        }
        togglePageButtons();
    }

    function togglePageButtons(){
        const first = document.getElementById('system-first');
        const prev = document.getElementById('system-prev');
        const next = document.getElementById('system-next');
        const last = document.getElementById('system-last');
        const pages = totalPages();
        if(first){ first.disabled = state.page===1; }
        if(prev){ prev.disabled = state.page===1; }
        if(next){ next.disabled = state.page===pages; }
        if(last){ last.disabled = state.page===pages; }
    }

    // Column handling
    function buildColumnModal(){
        const form = document.getElementById(COLUMN_FORM_ID);
        if(!form) return;
        form.innerHTML='';
        // 지정된 COLUMN_MODAL_GROUPS 순서대로 렌더
        COLUMN_MODAL_GROUPS.forEach(groupDef=>{
            const section = document.createElement('div');
            section.className='form-section';
            section.innerHTML = `<div class="section-header"><h4>${groupDef.group}</h4></div>`;
            const grid = document.createElement('div');
            grid.className='column-select-grid';
            groupDef.columns.forEach(col=>{
                if(!COLUMN_META[col]) return; // 안전 검사
                const active = state.visibleCols.has(col)?' is-active':'';
                const label = document.createElement('label');
                label.className='column-checkbox'+active;
                label.innerHTML=`<input type="checkbox" value="${col}" ${state.visibleCols.has(col)?'checked':''}>`+
                    `<span class="col-check" aria-hidden="true"></span>`+
                    `<span class="col-text">${COLUMN_META[col].label}</span>`;
                grid.appendChild(label);
            });
            section.appendChild(grid);
            form.appendChild(section);
        });
        // select-all 버튼 레이블 동기화
        syncColumnSelectAll();
    }

    function syncColumnSelectAll(){
        const btn = document.getElementById(COLUMN_SELECTALL_BTN_ID);
        const form = document.getElementById(COLUMN_FORM_ID); if(!btn || !form) return;
        const boxes = [...form.querySelectorAll('input[type=checkbox]')];
        // 항상 '전체 선택'만 보여준다 (전체 해제는 제공하지 않음)
        btn.textContent = '전체 선택';
    }

    function openModal(id){
        const el = document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
    function closeModal(id){
        const el = document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show')){ document.body.classList.remove('modal-open'); }}

    // Unified message modal (replaces browser alert)
    function showMessage(message, title){
        const modalId = 'system-message-modal';
        const titleEl = document.getElementById('message-title');
        const contentEl = document.getElementById('message-content');
        if(titleEl) titleEl.textContent = title || '알림';
        if(contentEl) contentEl.textContent = String(message || '');
        openModal(modalId);
    }

    function applyColumnVisibility(){
        const table = document.getElementById(TABLE_ID); if(!table) return;
        // Safety net: if current visible set does not contain any valid keys, restore defaults
        const validKeys = new Set(Object.keys(COLUMN_META));
        const hasAnyValid = [...state.visibleCols].some(k => validKeys.has(k));
        if(!hasAnyValid){
            state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
            saveColumnSelection();
        }
        table.querySelectorAll('thead th[data-col], tbody td[data-col]').forEach(cell=>{
            const col = cell.getAttribute('data-col');
            if(col==='actions') return;
            if(state.visibleCols.has(col)) cell.classList.remove('col-hidden'); else cell.classList.add('col-hidden');
        });
    }

    function saveColumnSelection(){
        try { localStorage.setItem('system_visible_cols', JSON.stringify([...state.visibleCols])); } catch(e){}
    }
    function loadColumnSelection(){
        try {
            const raw = localStorage.getItem('system_visible_cols');
            if(!raw) return; // nothing stored, keep defaults
            let parsed = [];
            try { parsed = JSON.parse(raw); } catch(_e) { parsed = []; }
            if(!Array.isArray(parsed)) parsed = [];
            // Sanitize: keep only known columns; de-dup
            const allowed = new Set(Object.keys(COLUMN_META));
            const filtered = [...new Set(parsed.filter(k => allowed.has(String(k))))];
            if(filtered.length > 0){
                state.visibleCols = new Set(filtered);
                // Clear any deprecated columns persisted from older versions
                ['sw_type','sw_status','sw_vendor','sw_name','sw_version','sw_dept','sw_owner','lic_type','lic_total','lic_assigned','lic_idle','lic_desc','lic_key','lic_period']
                    .forEach(k=> state.visibleCols.delete(k));
                // persist sanitized (and possibly migrated) version
                try { localStorage.setItem('system_visible_cols', JSON.stringify([...state.visibleCols])); } catch(_e){}
            } else {
                // Stored value was empty or invalid — fall back to defaults and persist
                state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
                try { localStorage.setItem('system_visible_cols', JSON.stringify([...state.visibleCols])); } catch(_e){}
            }
        } catch(e){}
    }

    // ---- Sort persistence ----
    function saveSortPreference(){
        try{
            if(state.sortKey){
                localStorage.setItem('system_sort_key', state.sortKey);
                localStorage.setItem('system_sort_dir', state.sortDir==='desc' ? 'desc' : 'asc');
            } else {
                localStorage.removeItem('system_sort_key');
                localStorage.removeItem('system_sort_dir');
            }
        }catch(e){}
    }
    function loadSortPreference(){
        try{
            const key = localStorage.getItem('system_sort_key');
            const dir = localStorage.getItem('system_sort_dir');
            if(key && COLUMN_META[key]){
                state.sortKey = key;
                state.sortDir = (dir === 'desc') ? 'desc' : 'asc';
            }
        }catch(e){}
    }

    function handleColumnFormApply(){
        const form = document.getElementById(COLUMN_FORM_ID); if(!form) return;
        const checked = [...form.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.value);
        // 최소 표시 컬럼 수 제한
        const MIN_COLS = 7;
        if(checked.length < MIN_COLS){
            showMessage(`최소 ${MIN_COLS}개 이상 선택해야 합니다.`, '안내');
            return;
        }
        state.visibleCols = new Set(checked);
        saveColumnSelection();
        applyColumnVisibility();
        closeModal(COLUMN_MODAL_ID);
    }

    function resetColumnSelection(){
        state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
        saveColumnSelection();
        buildColumnModal();
        applyColumnVisibility();
    }

    // Add / Edit
    function collectForm(form){
        const data={};
        form.querySelectorAll('input,select,textarea').forEach(el=>{ data[el.name]=el.value.trim(); });
        return data;
    }

    function fillEditForm(row){
        const form = document.getElementById(EDIT_FORM_ID); if(!form) return;
        form.innerHTML='';
        const groups = [
            { title:'비즈니스', cols:['business_status','business_name','system_name','system_ip','manage_ip'] },
            { title:'시스템', cols:['vendor','model','serial','place','location'] },
            { title:'담당자', cols:['system_owner_dept','system_owner','service_owner_dept','service_owner'] }
        ];
        groups.forEach(g=>{
            const section = document.createElement('div'); section.className='form-section';
            section.innerHTML = `<div class="section-header"><h4>${g.title}</h4></div>`;
            const grid = document.createElement('div'); grid.className='form-grid';
            g.cols.forEach(c=>{ if(!COLUMN_META[c]) return; const wrap=document.createElement('div');
                wrap.className = 'form-row';
                let labelText = COLUMN_META[c]?.label||c;
                if(c==='business_status' || c==='business_name' || c==='system_name' || c==='vendor' || c==='model' || c==='place'){
                    labelText += ' <span class="required">*</span>';
                }
                wrap.innerHTML=`<label>${labelText}</label>${generateFieldInput(c,row[c])}`; grid.appendChild(wrap); });
            section.appendChild(grid); form.appendChild(section);
        });
    }

    function generateFieldInput(col,value=''){
        // 비즈니스
        if(col==='business_status'){
            const v = String(value ?? '').trim();
            return `<select name="business_status" class="form-input search-select fk-select" data-fk="business_status" data-placeholder="업무 상태 선택" data-searchable="true" required>
                <option value="">선택</option>
                ${v ? `<option value="${escapeAttr(v)}" selected>${escapeHTML(v)}</option>` : ''}
            </select>`;
        }
        if(col==='business_name'){
            const v = String(value??'');
            return `<input name="business_name" class="form-input" placeholder="입력" required value="${v}">`;
        }
        // 시스템
        if(col==='system_name'){
            const v = String(value??'');
            return `<input name="system_name" class="form-input" placeholder="입력" required value="${v}">`;
        }
        if(col==='system_ip'){
            const v = String(value??'');
            return `<input name="system_ip" class="form-input" placeholder="예: 10.0.0.1" value="${v}">`;
        }
        if(col==='manage_ip'){
            const v = String(value??'');
            return `<input name="manage_ip" class="form-input" placeholder="예: 192.168.0.1" value="${v}">`;
        }
        if(col === 'vendor'){
            const v = String(value ?? '');
            return `<input name="vendor" class="form-input" placeholder="입력" required value="${escapeAttr(v)}">`;
        }
        if(col === 'model'){
            const v = String(value ?? '');
            return `<input name="model" class="form-input search-select" placeholder="입력" required value="${escapeAttr(v)}">`;
        }
        if(col === 'serial'){
            const v = String(value ?? '');
            return `<input name="serial" class="form-input" placeholder="입력" title="입력" value="${escapeAttr(v)}">`;
        }
        if(col === 'place'){
            const v = String(value ?? '').trim();
            return `<select name="place" class="form-input search-select fk-select" data-fk="place" data-placeholder="센터 선택" data-searchable="true" required>
                <option value="">선택</option>
                ${v ? `<option value="${escapeAttr(v)}" selected>${escapeHTML(v)}</option>` : ''}
            </select>`;
        }
        if(col === 'system_owner_dept'){
            const v = String(value ?? '').trim();
            return `<select name="system_owner_dept" class="form-input search-select fk-select" data-fk="system_owner_dept" data-placeholder="부서 선택" data-searchable="true">
                <option value="">선택</option>
                ${v ? `<option value="${escapeAttr(v)}" selected>${escapeHTML(v)}</option>` : ''}
            </select>`;
        }
        if(col === 'service_owner_dept'){
            const v = String(value ?? '').trim();
            return `<select name="service_owner_dept" class="form-input search-select fk-select" data-fk="service_owner_dept" data-placeholder="부서 선택" data-searchable="true">
                <option value="">선택</option>
                ${v ? `<option value="${escapeAttr(v)}" selected>${escapeHTML(v)}</option>` : ''}
            </select>`;
        }
        if(col === 'system_owner'){
            const v = String(value ?? '').trim();
            return `<select name="system_owner" class="form-input search-select fk-select" data-fk="system_owner" data-placeholder="담당자 선택" data-searchable="true">
                <option value="">선택</option>
                ${v ? `<option value="${escapeAttr(v)}" selected>${escapeHTML(v)}</option>` : ''}
            </select>`;
        }
        if(col === 'service_owner'){
            const v = String(value ?? '').trim();
            return `<select name="service_owner" class="form-input search-select fk-select" data-fk="service_owner" data-placeholder="담당자 선택" data-searchable="true">
                <option value="">선택</option>
                ${v ? `<option value="${escapeAttr(v)}" selected>${escapeHTML(v)}</option>` : ''}
            </select>`;
        }
        if(['location'].includes(col)){
            const v = String(value ?? '');
            return `<input name="${col}" class="form-input search-select" placeholder="입력" value="${escapeAttr(v)}">`;
        }
        return `<input name="${col}" class="form-input" value="${value??''}">`;
    }

    // (removed) license/virtualization/security helpers from legacy schema

    function addRow(data){
        // 고유 id 부여
        data.id = state.nextId++;
        state.data.unshift(data); // 맨 앞 삽입
        applyFilter();
    }

    function updateRow(index,data){
        if(state.data[index]){ state.data[index] = {...state.data[index], ...data}; applyFilter(); }
    }

    function updateSortIndicators(){
        const thead = document.querySelector(`#${TABLE_ID} thead`); if(!thead) return;
        thead.querySelectorAll('th[data-col]').forEach(th=>{
            const col = th.getAttribute('data-col');
            if(col && col === state.sortKey){
                th.setAttribute('aria-sort', state.sortDir==='asc'?'ascending':'descending');
            } else {
                th.setAttribute('aria-sort','none');
            }
            // 필터 표시
            const cf = state.columnFilters[col];
            const filtActive = Array.isArray(cf)? cf.length>0 : (cf != null && cf !== '');
            th.classList.toggle('is-filtered', !!filtActive);
        });
    }

    function exportCSV(onlySelected){
        const doExport = async ()=>{
            const allRows = USE_SERVER ? await fetchAllForCurrentQuery() : state.filtered;
            let dataForCsv = allRows;

            if(onlySelected === true){
                const selIds = new Set(state.selected);
                dataForCsv = allRows.filter(r=> selIds.has(r.id));
            }

            const headers = ['No', ...COLUMN_ORDER.filter(c=>state.visibleCols.has(c)).map(c=>COLUMN_META[c].label)];
            const visibleCols = COLUMN_ORDER.filter(c=>state.visibleCols.has(c));
            const rows = dataForCsv.map((r,i)=> [i+1, ...visibleCols.map(c=> r[c]??'')]);
            const lines = [headers, ...rows].map(arr=> arr.map(val=>`"${String(val).replace(/"/g,'""')}"`).join(','));
            const csvCore = lines.join('\r\n');
            const bom = '\uFEFF';
            const csv = bom + csvCore;

            const d = new Date();
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth()+1).padStart(2,'0');
            const dd = String(d.getDate()).padStart(2,'0');
            const filename = `data_deletion_systems_${yyyy}${mm}${dd}.csv`;

            const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };

        doExport().catch(err=> showMessage(err?.message || 'CSV 다운로드 중 오류가 발생했습니다.', '오류'));
    }

    // Event wiring
    let searchDebounceTimer = null;
    function bindEvents(){
        // 탭 (현재 1개지만 향후 확장 대비)
        document.querySelector('.system-tabs')?.addEventListener('click', e=>{
            const btn = e.target.closest('.system-tab-btn');
            if(!btn) return;
            const targetId = btn.getAttribute('data-tab');
            document.querySelectorAll('.system-tabs .system-tab-btn').forEach(b=> b.classList.toggle('active', b===btn));
            document.querySelectorAll('.tab-content .tab-pane').forEach(p=> p.classList.toggle('active', p.id===targetId));
        });
        const search = document.getElementById(SEARCH_ID);
        const searchWrapper = document.getElementById('system-search-wrapper');
        const searchLoader = document.getElementById('system-search-loader');
        const clearBtn = document.getElementById(SEARCH_CLEAR_ID);
        function updateClearVisibility(){ if(clearBtn){ clearBtn.classList.toggle('visible', !!search.value); } }
        if(search){
            search.addEventListener('input', e=>{
                state.search = e.target.value;
                updateClearVisibility();
                if(searchWrapper){ searchWrapper.classList.add('active-searching'); }
                if(searchLoader){ searchLoader.setAttribute('aria-hidden','false'); }
                if(searchDebounceTimer) clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(()=>{
                    if(USE_SERVER){
                        state.page = 1;
                        refreshFromServer();
                    } else {
                        applyFilter();
                    }
                    if(searchWrapper){ searchWrapper.classList.remove('active-searching'); }
                    if(searchLoader){ searchLoader.setAttribute('aria-hidden','true'); }
                }, 220); // debounce 220ms
            });
            search.addEventListener('keydown', e=>{
                if(e.key==='Escape'){
                    if(search.value){
                        search.value='';
                        state.search='';
                        updateClearVisibility();
                        if(USE_SERVER){ state.page = 1; refreshFromServer(); } else { applyFilter(); }
                    }
                    search.blur();
                }
            });
        }
        if(clearBtn){
            clearBtn.addEventListener('click', ()=>{
                if(search){
                    search.value='';
                    state.search='';
                    updateClearVisibility();
                    if(USE_SERVER){ state.page = 1; refreshFromServer(); } else { applyFilter(); }
                    search.focus();
                }
            });
        }
        // global '/' focus shortcut (ignore when typing in inputs or modals open)
        document.addEventListener('keydown', e=>{
            if(e.key==='/' && !e.altKey && !e.ctrlKey && !e.metaKey){
                const activeTag = document.activeElement?.tagName.toLowerCase();
                if(['input','textarea','select'].includes(activeTag)) return; // already in a field
                const anyModalOpen = document.querySelector('.modal-open');
                if(anyModalOpen) return; // skip if modal open
                e.preventDefault();
                search?.focus();
            }
        });
        updateClearVisibility();
        const pageSizeSel = document.getElementById(PAGE_SIZE_ID);
        if(pageSizeSel){
            pageSizeSel.addEventListener('change', e=>{
                state.pageSize = parseInt(e.target.value,10)||10;
                try { localStorage.setItem('system_page_size', String(state.pageSize)); } catch(err){}
                state.page=1;
                if(USE_SERVER) refreshFromServer();
                else render();
            });
        }
        document.getElementById(PAGE_NUMBERS_ID)?.addEventListener('click', e=>{
            if(e.target.classList.contains('page-btn')){
                state.page = parseInt(e.target.dataset.page,10);
                if(USE_SERVER) refreshFromServer(); else render();
            }
        });
        ['system-first','system-prev','system-next','system-last'].forEach(id=>{
            const el = document.getElementById(id); if(!el) return; el.addEventListener('click', ()=>{
                const pages = totalPages();
                if(id==='system-first') state.page=1;
                else if(id==='system-prev' && state.page>1) state.page--;
                else if(id==='system-next' && state.page<pages) state.page++;
                else if(id==='system-last') state.page=pages;
                if(USE_SERVER) refreshFromServer(); else render();
            });
        });
        // select all
        const selectAll = document.getElementById(SELECT_ALL_ID);
        if(selectAll){ selectAll.addEventListener('change', e=>{
            const checked = e.target.checked;
            document.querySelectorAll(`#${TBODY_ID} tr`).forEach(tr=>{
                const cb = tr.querySelector('.system-row-select');
                if(!cb) return;
                cb.checked = checked;
                const id = parseInt(tr.getAttribute('data-id'),10);
                if(checked){
                    tr.classList.add('selected');
                    if(!isNaN(id)) state.selected.add(id);
                } else {
                    tr.classList.remove('selected');
                    if(!isNaN(id)) state.selected.delete(id);
                }
            });
        }); }
        // row edit delegation
        const tbodyEl = document.getElementById(TBODY_ID);
        tbodyEl?.addEventListener('click', e=>{
            const btn = e.target.closest('.action-btn');
            if(btn){
                const rid = parseInt(btn.getAttribute('data-id'),10);
                const realIndex = state.data.findIndex(r=>r.id===rid);
                if(realIndex===-1) return;
                const row = state.data[realIndex];
                const action = btn.getAttribute('data-action');
                if(action==='edit'){
                    fillEditForm(row);
                    openModal(EDIT_MODAL_ID);
                    // enhance date inputs with Flatpickr
                    initDatePickers(EDIT_FORM_ID);
                    prepareFormFkSelects(EDIT_FORM_ID, row);
                    const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                    if(editSaveEl){
                        editSaveEl.setAttribute('data-index', realIndex);
                        editSaveEl.setAttribute('data-id', String(rid));
                    }
                }
                return; // 액션 버튼 클릭 처리 후 종료
            }
            // 행 내부 다른 영역 클릭 시 선택 토글 (체크박스/액션 영역 제외)
            if(e.target.closest('.system-actions')) return; // 관리 버튼 영역 제외
            const tr = e.target.closest('tr');
            if(!tr) return;
            const cb = tr.querySelector('.system-row-select');
            if(!cb) return;
            if(e.target.classList.contains('system-row-select')) return; // 체크박스 자체 클릭은 change 이벤트 처리
            cb.checked = !cb.checked;
            // change 이벤트 로직 재사용 위해 디스패치
            cb.dispatchEvent(new Event('change', {bubbles:true}));
        });
        // 컬럼 헤더 정렬 클릭
        const thead = document.querySelector(`#${TABLE_ID} thead`);
        if(thead){
            thead.querySelectorAll('th[data-col]').forEach(th=>{
                const col = th.getAttribute('data-col');
                if(col && col !== 'actions'){
                    th.classList.add('sortable');
                    th.setAttribute('aria-sort', 'none');
                }
            });
            thead.addEventListener('click', e=>{
                const th = e.target.closest('th[data-col]');
                if(!th) return;
                const col = th.getAttribute('data-col');
                if(!col || col==='actions') return;
                if(state.sortKey === col){
                    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    state.sortKey = col; state.sortDir = 'asc';
                }
                state.page = 1;
                saveSortPreference();
                if(USE_SERVER) refreshFromServer(); else render();
            });
            // (조건 필터 모달 제거됨) 우클릭: 기본 브라우저 메뉴 (정렬 방지 없음)
        }
        // 개별 행 선택 (체크박스) 변경 -> 강조 토글
        tbodyEl?.addEventListener('change', e=>{
            const cb = e.target.closest('.system-row-select');
            if(!cb) return;
            const tr = cb.closest('tr');
            const id = parseInt(cb.getAttribute('data-id')||tr.getAttribute('data-id'),10);
            if(cb.checked){
                tr.classList.add('selected');
                if(!isNaN(id)) state.selected.add(id);
            } else {
                tr.classList.remove('selected');
                if(!isNaN(id)) state.selected.delete(id);
            }
            // select-all 동기화
            if(selectAll){
                const all = document.querySelectorAll(`#${TBODY_ID} .system-row-select`);
                selectAll.checked = all.length>0 && [...all].every(x=>x.checked);
            }
        });
        // column modal
        document.getElementById(COLUMN_BTN_ID)?.addEventListener('click', ()=>{ buildColumnModal(); openModal(COLUMN_MODAL_ID); });
        document.getElementById(COLUMN_CLOSE_ID)?.addEventListener('click', ()=> closeModal(COLUMN_MODAL_ID));
    document.getElementById(COLUMN_APPLY_ID)?.addEventListener('click', handleColumnFormApply);
        document.getElementById(COLUMN_RESET_ID)?.addEventListener('click', resetColumnSelection);
        // 컬럼 전체 선택 (버튼)
        document.getElementById(COLUMN_SELECTALL_BTN_ID)?.addEventListener('click', ()=>{
            const form = document.getElementById(COLUMN_FORM_ID); if(!form) return;
            const boxes = [...form.querySelectorAll('input[type=checkbox]')];
            if(!boxes.length) return;
            // 항상 전체 선택만 수행 (전체 해제 제공하지 않음)
            boxes.forEach(box=>{
                box.checked = true;
                const label = box.closest('label.column-checkbox');
                if(label){ label.classList.add('is-active'); }
            });
            state.visibleCols = new Set(boxes.map(b=> b.value));
            saveColumnSelection();
            syncColumnSelectAll();
        });
        // toggle active style on click
        document.getElementById(COLUMN_FORM_ID)?.addEventListener('change', e=>{
            const label = e.target.closest('label.column-checkbox'); if(label){ label.classList.toggle('is-active', e.target.checked); }
            // 개별 체크 변경 시 select-all 상태 반영 및 state.visibleCols 동기화 지연 적용
            if(e.target.matches('input[type=checkbox]') && e.target.form?.id===COLUMN_FORM_ID){
                const form = document.getElementById(COLUMN_FORM_ID);
                const checkedCols = [...form.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.value);
                if(checkedCols.length){ state.visibleCols = new Set(checkedCols); saveColumnSelection(); }
                syncColumnSelectAll();
            }
        });
        // add modal
        document.getElementById(ADD_BTN_ID)?.addEventListener('click', ()=> {
            openModal(ADD_MODAL_ID);
            prepareFormFkSelects(ADD_FORM_ID, null);
        });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(ADD_FORM_ID); if(!form.checkValidity()){ form.reportValidity(); return; }
            const data = collectForm(form);
            if(!USE_SERVER){
                await assertUniqueSystemFields(data, null);
                addRow(data); form.reset(); closeModal(ADD_MODAL_ID);
                return;
            }
            try{
                await assertUniqueSystemFields(data, null);
                await createSystem(data);
                form.reset();
                closeModal(ADD_MODAL_ID);
                state.page = 1;
                refreshFromServer();
            }catch(err){
                showMessage(err?.message || '등록 중 오류가 발생했습니다.', '오류');
            }
        });
        // edit modal
    document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(EDIT_FORM_ID);
            const indexEl = document.getElementById(EDIT_SAVE_ID);
            const data = collectForm(form);
            if(!USE_SERVER){
                const index = parseInt(indexEl?.getAttribute('data-index')||'-1',10);
                await assertUniqueSystemFields(data, (state.data?.[index]?.id ?? null));
                updateRow(index, data);
                closeModal(EDIT_MODAL_ID);
                return;
            }
            const systemId = indexEl?.getAttribute('data-id');
            if(!systemId){ showMessage('수정할 항목을 찾을 수 없습니다.', '오류'); return; }
            try{
                await assertUniqueSystemFields(data, systemId);
                await updateSystem(systemId, data);
                closeModal(EDIT_MODAL_ID);
                refreshFromServer();
            }catch(err){
                showMessage(err?.message || '수정 중 오류가 발생했습니다.', '오류');
            }
        });
        // csv
        // CSV download: open confirmation modal similar to delete/dispose
        const dlBtn = document.getElementById('system-download-btn');
        if(dlBtn){ dlBtn.addEventListener('click', ()=>{
            // prepare modal state
            const total = USE_SERVER ? (state.total || 0) : (state.filtered.length || state.data.length);
            const selectedCount = state.selected.size;
            const subtitle = document.getElementById('download-subtitle');
            if(subtitle){
                subtitle.textContent = selectedCount > 0
                    ? `선택된 ${selectedCount}개 또는 전체 ${total}개 결과 중 범위를 선택하세요.`
                    : `현재 결과 ${total}개 항목을 CSV로 내보냅니다.`;
            }
            const rowSelected = document.getElementById('csv-range-row-selected');
            const optSelected = document.getElementById('csv-range-selected');
            const optAll = document.getElementById('csv-range-all');
            if(rowSelected){ rowSelected.hidden = !(selectedCount > 0); }
            if(optSelected){ optSelected.disabled = !(selectedCount > 0); optSelected.checked = selectedCount > 0; }
            if(optAll){ optAll.checked = !(selectedCount > 0); }
            openModal('system-download-modal');
        }); }
        document.getElementById('system-download-close')?.addEventListener('click', ()=> closeModal('system-download-modal'));
        document.getElementById('system-download-confirm')?.addEventListener('click', ()=>{
            const selectedOpt = document.getElementById('csv-range-selected');
            const onlySelected = !!(selectedOpt && selectedOpt.checked);
            exportCSV(onlySelected);
            closeModal('system-download-modal');
        });
        // upload modal
        document.getElementById(UPLOAD_BTN_ID)?.addEventListener('click', ()=>{
            // reset previous state
            const meta = document.getElementById(UPLOAD_META_ID); if(meta) meta.hidden = true;
            const chip = document.getElementById(UPLOAD_FILE_CHIP_ID); if(chip) chip.textContent = '';
            const input = document.getElementById(UPLOAD_INPUT_ID); if(input) input.value = '';
            const confirmBtn = document.getElementById(UPLOAD_CONFIRM_ID); if(confirmBtn) confirmBtn.disabled = true;
            openModal(UPLOAD_MODAL_ID);
            // Ensure animation is booted when modal opens
            initUploadAnim();
        });
    document.getElementById(UPLOAD_CLOSE_ID)?.addEventListener('click', ()=>{ try{ uploadAnim?.stop?.(); }catch(_){} closeModal(UPLOAD_MODAL_ID); });
        // dropzone interactions
        (function(){
            const dz = document.getElementById(UPLOAD_DROPZONE_ID);
            const input = document.getElementById(UPLOAD_INPUT_ID);
            const meta = document.getElementById(UPLOAD_META_ID);
            const chip = document.getElementById(UPLOAD_FILE_CHIP_ID);
            const confirmBtn = document.getElementById(UPLOAD_CONFIRM_ID);
            // inline select button and label removed in revised design
            if(!dz || !input) return;
            function accept(file){
                const name = (file?.name||'').toLowerCase();
                const okExt = name.endsWith('.xls') || name.endsWith('.xlsx');
                const okSize = (file?.size||0) <= 10*1024*1024; // 10MB
                return okExt && okSize;
            }
            function setFile(f){
                if(!f){ if(meta) meta.hidden=true; if(chip) chip.textContent=''; if(confirmBtn) confirmBtn.disabled=true; return; }
                if(!accept(f)){ showMessage('지원하지 않는 파일이거나 10MB를 초과합니다. .xls/.xlsx만 가능합니다.', '업로드 오류'); return; }
                const sizeKb = Math.max(1, Math.round(f.size/1024));
                if(chip) chip.textContent = `${f.name} (${sizeKb} KB)`;
                if(meta) meta.hidden = false;
                if(confirmBtn) confirmBtn.disabled = false;
            }
            dz.addEventListener('click', ()=> input.click());
            dz.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); input.click(); }});
            dz.addEventListener('dragover', (e)=>{ e.preventDefault(); dz.classList.add('dragover'); });
            dz.addEventListener('dragleave', ()=> dz.classList.remove('dragover'));
            dz.addEventListener('drop', (e)=>{
                e.preventDefault(); dz.classList.remove('dragover');
                const f = e.dataTransfer?.files?.[0]; if(f) { input.files = e.dataTransfer.files; setFile(f); }
            });
            input.addEventListener('change', ()=>{ const f = input.files?.[0]; setFile(f); });
            // Removed explicit remove button; user can reselect or cancel selection via file dialog
        })();
        // template download — provide an XLSX with Korean headers (no '보안 점수') matching expected upload
        document.getElementById(UPLOAD_TEMPLATE_BTN_ID)?.addEventListener('click', async ()=>{
            try{ await ensureXLSX(); }catch(_e){ showMessage('템플릿 생성을 위한 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.', '오류'); return; }
            try{
                const XLSX = window.XLSX;
                // Main template sheet: headers only (order enforced by validator)
                const wsTemplate = XLSX.utils.aoa_to_sheet([UPLOAD_HEADERS_KO]);
                // Set reasonable column widths
                wsTemplate['!cols'] = UPLOAD_HEADERS_KO.map((h)=>{
                    const wide = ['업무 이름','시스템 이름'];
                    const mid = ['시스템 제조사','시스템 모델명','시스템 일련번호','시스템 장소','시스템 위치','시스템 담당부서','시스템 담당자','서비스 담당부서','서비스 담당자'];
                    if(wide.includes(h)) return { wch: 24 };
                    if(mid.includes(h)) return { wch: 18 };
                    return { wch: 14 };
                });

                // Guide sheet: rules and allowed values (Korean)
                const rules = [
                    ['엑셀 업로드 가이드'],
                    [''],
                    ['작성 규칙'],
                    ['- 첫 행의 컬럼 제목은 아래 순서와 완전히 일치해야 합니다. (순서/이름 변경 불가)'],
                    ['- 업무 상태는 가동/유휴/대기 중 하나여야 합니다.'],
                    ['- 업무 이름과 시스템 이름은 필수로 입력하세요.'],
                    ['- IP는 IPv4 형식을 권장합니다. 예: 10.0.0.1'],
                    ['- 나머지는 검색 선택으로 입력하거나 공란으로 둘 수 있습니다.'],
                    [''],
                    ['컬럼 순서 (복사/참고용)'],
                    [UPLOAD_HEADERS_KO.join(', ')],
                ];
                const wsGuide = XLSX.utils.aoa_to_sheet(rules);
                wsGuide['!cols'] = [{ wch: 120 }];

                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template');
                XLSX.utils.book_append_sheet(wb, wsGuide, '가이드');
                XLSX.writeFile(wb, 'data_deletion_system_upload_template.xlsx');
            }catch(e){ console.error(e); showMessage('템플릿 생성 중 오류가 발생했습니다.', '오류'); }
        });
        // confirm upload with parse + validation
        document.getElementById(UPLOAD_CONFIRM_ID)?.addEventListener('click', async ()=>{
            const input = document.getElementById(UPLOAD_INPUT_ID);
            const f = input?.files?.[0];
            if(!f){ showMessage('파일을 선택하세요.', '업로드 안내'); return; }
            try{
                await ensureXLSX();
            }catch(_e){ showMessage('엑셀 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.', '오류'); return; }
            const reader = new FileReader();
            reader.onload = ()=>{
                try{
                    const data = new Uint8Array(reader.result);
                    const wb = window.XLSX.read(data, {type:'array'});
                    const sheetName = wb.SheetNames[0]; if(!sheetName){ showMessage('엑셀 시트를 찾을 수 없습니다.', '업로드 오류'); return; }
                    const ws = wb.Sheets[sheetName];
                    const rows = window.XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
                    if(!rows || rows.length===0){ showMessage('엑셀 데이터가 비어있습니다.', '업로드 오류'); return; }
                    const header = rows[0].map(h=> String(h).trim());
                    // Header validation: exact match and order
                    if(header.length !== UPLOAD_HEADERS_KO.length || !header.every((h,i)=> h===UPLOAD_HEADERS_KO[i])){
                        showMessage('업로드 실패: 컬럼 제목이 현재 테이블과 일치하지 않습니다.\n반드시 아래 순서로 작성하세요:\n- ' + UPLOAD_HEADERS_KO.join(', '), '업로드 실패');
                        return;
                    }
                    const errors = [];
                    const imported = [];
                    for(let r=1; r<rows.length; r++){
                        const row = rows[r]; if(isEmptyRow(row)) continue;
                        const rec = {};
                        for(let c=0; c<header.length; c++){
                            const label = header[c]; const key = HEADER_KO_TO_KEY[label];
                            rec[key] = String(row[c]??'').trim();
                        }
                        // Validation rules (system schema)
                        const bs = rec.business_status;
                        const okBS = bs==='' || bs==='가동' || bs==='유휴' || bs==='대기';
                        if(!okBS) errors.push(`Row ${r+1}: 업무 상태는 가동/유휴/대기 중 하나여야 합니다.`);
                        if(!rec.business_name) errors.push(`Row ${r+1}: 업무 이름은 필수입니다.`);
                        if(!rec.system_name) errors.push(`Row ${r+1}: 시스템 이름은 필수입니다.`);
                        const ipRe = /^(25[0-5]|2[0-4]\d|[01]?\d?\d)(\.(25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/;
                        if(rec.system_ip && !ipRe.test(rec.system_ip)) errors.push(`Row ${r+1}: 시스템 IP 형식이 올바르지 않습니다.`);
                        if(rec.manage_ip && !ipRe.test(rec.manage_ip)) errors.push(`Row ${r+1}: 관리 IP 형식이 올바르지 않습니다.`);
                        imported.push(rec);
                    }
                    if(errors.length){
                        const preview = errors.slice(0, 20).join('\n');
                        const more = errors.length>20 ? `\n...외 ${errors.length-20}건` : '';
                        showMessage(`업로드 실패: 유효성 검사 오류가 있습니다.\n\n${preview}${more}`, '업로드 실패');
                        return;
                    }

                    if(!USE_SERVER){
                        imported.forEach(item=> addRow(item));
                        showMessage(`${imported.length}개 행이 업로드되었습니다.`, '업로드 완료');
                        closeModal(UPLOAD_MODAL_ID);
                        return;
                    }

                    const tasks = imported.map(item=> async ()=>{ await createSystem(item); });
                    _promisePool(tasks, 6)
                        .then(()=>{
                            closeModal(UPLOAD_MODAL_ID);
                            state.page = 1;
                            refreshFromServer();
                            showMessage(`${imported.length}개 행이 업로드되었습니다.`, '업로드 완료');
                        })
                        .catch(err=> showMessage(err?.message || '업로드 중 오류가 발생했습니다.', '업로드 오류'));
                }catch(e){ console.error(e); showMessage('엑셀 파싱 중 오류가 발생했습니다. 파일을 확인해주세요.', '업로드 오류'); }
            };
            reader.onerror = ()=> showMessage('파일을 읽는 중 오류가 발생했습니다.', '업로드 오류');
            reader.readAsArrayBuffer(f);
        });
        // stats open
        document.getElementById(STATS_BTN_ID)?.addEventListener('click', ()=>{
            const openWithRows = (rows)=>{
                const swEl = document.getElementById('stats-software');
                const verEl = document.getElementById('stats-versions');
                const checkEl = document.getElementById('stats-check');
                if(swEl) swEl.innerHTML = '';
                if(verEl) verEl.innerHTML = '';
                if(checkEl) checkEl.innerHTML = '';
                renderStatBlock('stats-software', '업무 상태 분포', countBy(rows, 'business_status', ['가동','유휴','대기']), ['가동','유휴','대기'], { hideZero:true, zeroNote:true });
                renderStatBlock('stats-versions', '시스템 담당부서', countBy(rows, 'system_owner_dept'));
                renderStatBlock('stats-versions', '서비스 담당부서', countBy(rows, 'service_owner_dept'));
                renderStatBlock('stats-check', '시스템 담당자', countBy(rows, 'system_owner'));
                renderStatBlock('stats-check', '서비스 담당자', countBy(rows, 'service_owner'));
                openModal(STATS_MODAL_ID);
                requestAnimationFrame(()=> equalizeStatsHeights());
                window.addEventListener('resize', equalizeStatsHeights);
            };

            if(!USE_SERVER){
                buildStats();
                openModal(STATS_MODAL_ID);
                requestAnimationFrame(()=> equalizeStatsHeights());
                window.addEventListener('resize', equalizeStatsHeights);
                return;
            }

            fetchAllForCurrentQuery()
                .then(rows=> openWithRows(rows))
                .catch(err=> showMessage(err?.message || '통계 조회 중 오류가 발생했습니다.', '오류'));
        });
        const closeStats = ()=>{
            closeModal(STATS_MODAL_ID);
            window.removeEventListener('resize', equalizeStatsHeights);
        };
        document.getElementById(STATS_CLOSE_ID)?.addEventListener('click', closeStats);
        document.getElementById(STATS_OK_ID)?.addEventListener('click', closeStats);
        // duplicate selected rows — open confirm modal first
        document.getElementById('system-duplicate-btn')?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('복제할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('duplicate-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 행을 복제합니다.`; }
            openModal('system-duplicate-modal');
        });
        document.getElementById('system-duplicate-close')?.addEventListener('click', ()=> closeModal('system-duplicate-modal'));
        document.getElementById('system-duplicate-confirm')?.addEventListener('click', ()=>{
            const ids = [...state.selected].filter(x=> Number.isFinite(x));
            if(!ids.length){ showMessage('선택된 행을 찾을 수 없습니다.', '오류'); closeModal('system-duplicate-modal'); return; }

            if(!USE_SERVER){
                const originals = state.data.filter(r=> state.selected.has(r.id));
                if(!originals.length){ showMessage('선택된 행을 찾을 수 없습니다.', '오류'); closeModal('system-duplicate-modal'); return; }
                const existingBiz = _collectNonEmptyTrimmedSet(state.data, 'business_name');
                const existingSys = _collectNonEmptyTrimmedSet(state.data, 'system_name');
                const existingSer = _collectNonEmptyTrimmedSet(state.data, 'serial');
                const clones = originals.map(o=>{
                    const copy = {...o};
                    delete copy.id;
                    const biz = String(copy.business_name ?? '').trim();
                    const sys = String(copy.system_name ?? '').trim();
                    const ser = String(copy.serial ?? '').trim();
                    if(biz) copy.business_name = _makeUniqueWithNumericSuffix(biz, existingBiz);
                    if(sys) copy.system_name = _makeUniqueWithNumericSuffix(sys, existingSys);
                    if(ser) copy.serial = _makeUniqueWithNumericSuffix(ser, existingSer);
                    return copy;
                });
                clones.forEach(c=> addRow(c));
                closeModal('system-duplicate-modal');
                showMessage(clones.length + '개 행이 복제되었습니다.', '완료');
                return;
            }

            fetchAllForCurrentQuery()
                .then(async (rows)=>{
                    const idSet = new Set(ids);
                    const originals = rows.filter(r=> idSet.has(r.id));
                    if(!originals.length) throw new Error('선택된 행을 찾을 수 없습니다.');
                    const existingBiz = _collectNonEmptyTrimmedSet(rows, 'business_name');
                    const existingSys = _collectNonEmptyTrimmedSet(rows, 'system_name');
                    const existingSer = _collectNonEmptyTrimmedSet(rows, 'serial');
                    const clones = originals.map(o=>{
                        const copy = {...o};
                        delete copy.id;
                        const biz = String(copy.business_name ?? '').trim();
                        const sys = String(copy.system_name ?? '').trim();
                        const ser = String(copy.serial ?? '').trim();
                        if(biz) copy.business_name = _makeUniqueWithNumericSuffix(biz, existingBiz);
                        if(sys) copy.system_name = _makeUniqueWithNumericSuffix(sys, existingSys);
                        if(ser) copy.serial = _makeUniqueWithNumericSuffix(ser, existingSer);
                        return copy;
                    });
                    const tasks = clones.map(c=> async ()=>{ await createSystem(c); });
                    await _promisePool(tasks, 6);
                    closeModal('system-duplicate-modal');
                    state.selected.clear();
                    refreshFromServer();
                    showMessage(originals.length + '개 행이 복제되었습니다.', '완료');
                })
                .catch(err=>{
                    closeModal('system-duplicate-modal');
                    showMessage(err?.message || '복제 중 오류가 발생했습니다.', '오류');
                });
        });
        // dispose (불용처리)
        document.getElementById(DISPOSE_BTN_ID)?.addEventListener('click', ()=>{
            if(USE_SERVER){
                showMessage('불용처리는 처리 정책/대상 메뉴 연동이 필요해 준비 중입니다.', '안내');
                return;
            }
            const count = state.selected.size;
            if(count===0){ showMessage('불용처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('dispose-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 시스템을 정말 불용처리하시겠습니까?`; }
            openModal(DISPOSE_MODAL_ID);
        });
    document.getElementById(DISPOSE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DISPOSE_MODAL_ID));
        document.getElementById(DISPOSE_CONFIRM_ID)?.addEventListener('click', ()=>{
            // 수집 대상 열 (데이터 삭제 스키마 기준)
            const fields = ['business_status','business_name','system_name','system_ip','manage_ip','vendor','model','serial','place','location','system_owner_dept','system_owner','service_owner_dept','service_owner'];
            const selected = state.data.filter(r=> state.selected.has(r.id)).map(r=>{
                const obj = { id: r.id };
                fields.forEach(f=> obj[f] = r[f] ?? '');
                return obj;
            });
            try {
                sessionStorage.setItem('dispose_selected_rows', JSON.stringify(selected));
            } catch(_e){}
            closeModal(DISPOSE_MODAL_ID);
            // TODO: 불용자산 페이지로 이동 경로 확정 시 적용
        });
        // delete (삭제)
        document.getElementById(DELETE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('삭제할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('delete-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 시스템을 삭제합니다.`; }
            const msg = document.getElementById('delete-msg');
            if(msg){ msg.textContent = `선택한 ${count}개의 시스템을 삭제하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById('system-delete-cancel')?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', ()=>{
            const ids = [...state.selected].filter(x=> Number.isFinite(x));
            if(ids.length === 0){ closeModal(DELETE_MODAL_ID); return; }
            if(!USE_SERVER){
                // mock mode
                const before = state.data.length;
                const idSet = new Set(ids);
                state.data = state.data.filter(r => !idSet.has(r.id));
                const removed = before - state.data.length;
                state.selected.clear();
                applyFilter();
                closeModal(DELETE_MODAL_ID);
                if(removed > 0){ setTimeout(()=> showMessage(`${removed}개 항목이 삭제되었습니다.`, '완료'), 0); }
                return;
            }
            bulkDeleteSystems(ids)
                .then((deleted)=>{
                    state.selected.clear();
                    closeModal(DELETE_MODAL_ID);
                    // keep current page if still valid
                    const pages = totalPages();
                    if(state.page > pages) state.page = pages;
                    refreshFromServer();
                    setTimeout(()=> showMessage(`${deleted}개 항목이 삭제되었습니다.`, '완료'), 0);
                })
                .catch(err=> showMessage(err?.message || '삭제 중 오류가 발생했습니다.', '오류'));
        });
        // bulk (일괄변경): 1개 선택 시에는 수정 모달로 전환
        document.getElementById(BULK_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('일괄변경할 행을 먼저 선택하세요.', '안내'); return; }
            if(count===1){
                // 단일 선택 → 수정 모달 열기
                const [onlyId] = [...state.selected];
                const realIndex = state.data.findIndex(r=> r.id === onlyId);
                if(realIndex === -1){ showMessage('선택된 행을 찾을 수 없습니다.', '오류'); return; }
                const row = state.data[realIndex];
                fillEditForm(row);
                openModal(EDIT_MODAL_ID);
                initDatePickers(EDIT_FORM_ID);
                // Ensure FK dropdowns are searchable and populated in this path, too
                prepareFormFkSelects(EDIT_FORM_ID, row);
                const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                if(editSaveEl){
                    editSaveEl.setAttribute('data-index', realIndex);
                    editSaveEl.setAttribute('data-id', String(onlyId));
                }
                return;
            }
            // 2개 이상 → 일괄변경 모달
            const subtitle = document.getElementById('bulk-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 기록에서 지정한 필드를 일괄 변경합니다.`; }
            buildBulkForm();
            openModal(BULK_MODAL_ID);
            prepareFormFkSelects(BULK_FORM_ID, null);
        });
        document.getElementById(BULK_CLOSE_ID)?.addEventListener('click', ()=> closeModal(BULK_MODAL_ID));
        document.getElementById(BULK_APPLY_ID)?.addEventListener('click', ()=>{
            const form = document.getElementById(BULK_FORM_ID); if(!form) return;
            const entries = [...form.querySelectorAll('[data-bulk-field]')]
                .map(el=>({ field: el.getAttribute('data-bulk-field'), value: el.value }))
                .filter(p=> p.value !== '');
            if(!entries.length){ showMessage('변경할 값을 1개 이상 입력하세요.', '안내'); return; }
            const ids = [...state.selected].filter(x=> Number.isFinite(x));
            if(!ids.length){ showMessage('선택된 항목을 찾을 수 없습니다.', '오류'); return; }
            const patch = {};
            entries.forEach(({field, value})=>{ patch[field] = value; });

            if(!USE_SERVER){
                const idSet = new Set(ids);
                state.data = state.data.map(row=>{
                    if(!idSet.has(row.id)) return row;
                    const updated = { ...row };
                    entries.forEach(({field, value})=>{ updated[field] = value; });
                    return updated;
                });
                applyFilter();
                closeModal(BULK_MODAL_ID);
                setTimeout(()=> showMessage(`${ids.length}개 항목에 일괄 변경이 적용되었습니다.`, '완료'), 0);
                return;
            }

            const tasks = ids.map(id=> async ()=>{ await updateSystem(id, patch); });
            _promisePool(tasks, 6)
                .then(()=>{
                    closeModal(BULK_MODAL_ID);
                    state.selected.clear();
                    refreshFromServer();
                    setTimeout(()=> showMessage(`${ids.length}개 항목에 일괄 변경이 적용되었습니다.`, '완료'), 0);
                })
                .catch(err=> showMessage(err?.message || '일괄 변경 중 오류가 발생했습니다.', '오류'));
        });
        // esc close
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ [ADD_MODAL_ID,EDIT_MODAL_ID,COLUMN_MODAL_ID,DISPOSE_MODAL_ID,DELETE_MODAL_ID,BULK_MODAL_ID,UPLOAD_MODAL_ID,'system-download-modal','system-message-modal','system-duplicate-modal'].forEach(closeModal); }});
    // include stats modal in esc close
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeModal(STATS_MODAL_ID); }});

        // message modal bindings
        document.getElementById('system-message-close')?.addEventListener('click', ()=> closeModal('system-message-modal'));
        document.getElementById('system-message-ok')?.addEventListener('click', ()=> closeModal('system-message-modal'));

    function buildBulkForm(){
        const form = document.getElementById(BULK_FORM_ID); if(!form) return;
        const EXCLUDE = new Set([]);
        function inputFor(col){
            if(col === 'business_status'){
                return `<select class="form-input search-select fk-select" data-bulk-field="business_status" data-fk="business_status" data-placeholder="업무 상태 선택" data-searchable="true"><option value="">업무 상태 선택</option></select>`;
            }
            // FK fields: render as searchable dropdowns
            if(['place','system_owner_dept','service_owner_dept','system_owner','service_owner'].includes(col)){
                const placeholderMap = {
                    place: '센터 선택',
                    system_owner_dept: '부서 선택',
                    service_owner_dept: '부서 선택',
                    system_owner: '담당자 선택',
                    service_owner: '담당자 선택',
                };
                const ph = placeholderMap[col] || '선택';
                return `<select class="form-input search-select fk-select" data-bulk-field="${col}" data-fk="${col}" data-placeholder="${ph}" data-searchable="true"><option value="">${ph}</option></select>`;
            }
            if(col === 'vendor'){
                return `<input class="form-input" data-bulk-field="vendor" placeholder="입력">`;
            }
            return `<input class="form-input" data-bulk-field="${col}" placeholder="입력">`;
        }
        const GROUPS = [
            { title:'비즈니스', cols:['business_status','business_name','system_name','system_ip','manage_ip'] },
            { title:'시스템', cols:['vendor','model','serial','place','location'] },
            { title:'담당자', cols:['system_owner_dept','system_owner','service_owner_dept','service_owner'] }
        ];
        form.innerHTML = GROUPS.map(g=>{
            const fields = g.cols.filter(c=> !EXCLUDE.has(c));
            if(!fields.length) return '';
            const grid = fields.map(col=>{
                const meta = COLUMN_META[col]; if(!meta) return '';
                const wide = false;
                return `<div class="${wide ? 'form-row form-row-wide' : 'form-row'}"><label>${meta.label}</label>${inputFor(col)}</div>`;
            }).join('');
            return `
                <div class="form-section">
                    <div class="section-header"><h4>${g.title}</h4></div>
                    <div class="form-grid">${grid}</div>
                </div>`;
        }).join('');
    // 수정 모달과 동일하게 날짜 피커 적용
    initDatePickers(BULK_FORM_ID);
    }

    // ----- Stats helpers -----
    function renderStatBlock(containerId, title, dist, fixedOptions, opts){
        return window.blsStats.renderCard(containerId, title, dist, fixedOptions, opts);
    }
    function equalizeStatsHeights(){
        return window.blsStats.equalizeHeights(STATS_MODAL_ID);
    }
    function countBy(rows, key, fixedOptions){
        return window.blsStats.countBy(rows, key, fixedOptions);
    }

    function buildStats(){
        const swEl = document.getElementById('stats-software');
        const verEl = document.getElementById('stats-versions');
        const checkEl = document.getElementById('stats-check');
        if(swEl) swEl.innerHTML = '';
        if(verEl) verEl.innerHTML = '';
        if(checkEl) checkEl.innerHTML = '';
        // 대상 데이터: 현재 필터/정렬 적용 전부를 기준으로 통계 (state.filtered)
        const rows = state.filtered.length ? state.filtered : state.data;
        // 업무 상태 분포 (고정 순서)
        renderStatBlock('stats-software', '업무 상태 분포', countBy(rows, 'business_status', ['가동','유휴','대기']), ['가동','유휴','대기'], { hideZero:true, zeroNote:true });
        // 담당 부서/자 분포
        renderStatBlock('stats-versions', '시스템 담당부서', countBy(rows, 'system_owner_dept'));
        renderStatBlock('stats-versions', '서비스 담당부서', countBy(rows, 'service_owner_dept'));
        renderStatBlock('stats-check', '시스템 담당자', countBy(rows, 'system_owner'));
        renderStatBlock('stats-check', '서비스 담당자', countBy(rows, 'service_owner'));
    }
    }

    // (조건 필터 관련 함수 제거됨)

    function init(){
        // Always start in a fully reset state (like pressing '초기화')
        function resetAllToDefaults(){
            try {
                localStorage.removeItem('system_visible_cols');
                localStorage.removeItem('system_page_size');
                localStorage.removeItem('system_sort_key');
                localStorage.removeItem('system_sort_dir');
            } catch(_e){}
            state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
            state.pageSize = 10;
            state.page = 1;
            state.search = '';
            state.selected = new Set();
            state.sortKey = null;
            state.sortDir = 'asc';
            state.columnFilters = {};
            // Sync UI controls if present
            const pageSizeSel = document.getElementById(PAGE_SIZE_ID);
            if(pageSizeSel) pageSizeSel.value = '10';
            const search = document.getElementById(SEARCH_ID);
            if(search) search.value = '';
        }
        // Demo counter param parsing (e.g., ?demoCounter=1500 or ?demoCounter=1,500)
        try {
            const params = new URLSearchParams(window.location.search || '');
            const raw = params.get('demoCounter') || params.get('demo-counter');
            if(raw){
                const n = parseInt(String(raw).replace(/,/g,'').trim(), 10);
                if(Number.isFinite(n) && n >= 0){ DEMO_COUNTER = n; }
            } else if(window.location.hash){
                const m = window.location.hash.match(/demoCounter=([^&]+)/i) || window.location.hash.match(/demo-counter=([^&]+)/i);
                if(m && m[1]){
                    const n = parseInt(String(m[1]).replace(/,/g,'').trim(), 10);
                    if(Number.isFinite(n) && n >= 0){ DEMO_COUNTER = n; }
                }
            }
        } catch(_e){}
        resetAllToDefaults();
        initData();
        bindEvents();
        // Re-sync UI controls again after events are bound (ensures clear button is hidden)
        const pageSizeSel2 = document.getElementById(PAGE_SIZE_ID);
        if(pageSizeSel2) pageSizeSel2.value = '10';
        const search2 = document.getElementById(SEARCH_ID);
        if(search2) search2.value = '';
        render();
        // Page adornments (animation + popover)
}
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


