/**
 * 데이터센터 관리 페이지 스크립트
 * - 컬럼 토글 (기본 10개 노출)
 * - 로컬(in-memory) 데이터 렌더링 + 페이징 + 검색
 * - 모달 (등록/수정/컬럼 선택)
 * - CSV 다운로드 (현재 페이지 or 전체)
 * NOTE: 서버 연동 전 단계로 mock 데이터 사용
 */

(function(){
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
    // Flatpickr (calendar) loader and initializer — local vendor copies (no CDN)
    const FLATPICKR_CSS = '/static/vendor/flatpickr/4.6.13/flatpickr.min.css';
    const FLATPICKR_THEME_NAME = 'airbnb'; // use neutral theme; colors overridden to match accent
    const FLATPICKR_THEME_HREF = '/static/vendor/flatpickr/4.6.13/themes/airbnb.css';
    const FLATPICKR_JS = '/static/vendor/flatpickr/4.6.13/flatpickr.min.js';
    const FLATPICKR_KO = '/static/vendor/flatpickr/4.6.13/l10n/ko.js';
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
        let flatReady = false;
        try { await ensureFlatpickr(); flatReady = !!window.flatpickr; } catch(_e){ flatReady = false; }
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
            });
            cal.appendChild(btn);
        }
        const opts = {
            locale: (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.ko) ? window.flatpickr.l10ns.ko : 'ko',
            dateFormat: 'Y-m-d',
            allowInput: true,
            disableMobile: true,
            clickOpens: true,
            appendTo: document.body,
            onReady: function(selectedDates, dateStr, instance){ ensureTodayButton(instance); },
            onOpen: function(selectedDates, dateStr, instance){ ensureTodayButton(instance); }
        };
        if(flatReady){
            if(dateEl && !dateEl.disabled){
                if(dateEl.type === 'date'){ try{ dateEl.type = 'text'; }catch(_){} }
                if(!dateEl._flatpickr){ window.flatpickr(dateEl, opts); }
            }
        } else {
            // Fallback: use native date input if flatpickr is unavailable
            if(dateEl && !dateEl.disabled){ try{ dateEl.type = 'date'; }catch(_){} }
        }
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
    // Upload template (Data Deletion schema)
    const UPLOAD_HEADERS_KO = [
        '상태','작업일자','작업부서','작업자','요청부서','요청자','제조사','모델명','일련번호','성공여부','실패사유','비고'
    ];
    const HEADER_KO_TO_KEY = {
        '상태':'status','작업일자':'work_date','작업부서':'work_dept','작업자':'worker','요청부서':'req_dept','요청자':'requester','제조사':'vendor','모델명':'model','일련번호':'serial','성공여부':'success','실패사유':'fail_reason','비고':'remark'
    };
    const ENUM_SETS = { };
    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
    function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }

    // Data + State
    const BASE_VISIBLE_COLUMNS = [
        'status','work_date','work_dept','worker','req_dept','requester','vendor','model','serial','success'
    ];
    const COLUMN_ORDER = [
        'status','work_date','work_dept','worker','req_dept','requester','vendor','model','serial','success','fail_reason','remark'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '작업 관리', columns: ['status','work_date','work_dept','worker','req_dept','requester'] },
        { group: '대상', columns: ['vendor','model','serial'] },
        { group: '결과', columns: ['success','fail_reason'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        status:{label:'상태',group:'작업'},
        work_date:{label:'작업일자',group:'작업'},
        work_dept:{label:'작업부서',group:'작업'},
        worker:{label:'작업자',group:'작업'},
        req_dept:{label:'요청부서',group:'요청'},
        requester:{label:'요청자',group:'요청'},
        vendor:{label:'제조사',group:'대상'},
        model:{label:'모델명',group:'대상'},
        serial:{label:'일련번호',group:'대상'},
    success:{label:'성공여부',group:'결과'},
    remark:{label:'비고',group:'결과'},
    fail_reason:{label:'실패사유',group:'결과'}
    };

    const DATA_DELETE_API_BASE = '/api/datacenter/data-deletion';
    const DATA_DELETE_FETCH_LIMIT = 500;
    const DATA_DELETE_HEADERS = { 'Content-Type': 'application/json', 'Accept': 'application/json' };

    const FK_SOURCE_CONFIG = {
        ORG_DEPT: {
            endpoint: '/api/org-departments',
            valueKey: 'dept_code',
            labelKey: 'dept_name',
        },
        USER_PROFILE: {
            endpoint: '/api/user-profiles?limit=500',
            valueKey: 'id',
            labelKey: 'name',
        },
        VENDOR: {
            endpoint: '/api/vendor-manufacturers',
            valueKey: 'manufacturer_code',
            labelKey: 'manufacturer_name',
        },
        DISK: {
            endpoint: '/api/cmp-disk-types',
            valueKey: 'disk_code',
            labelKey: 'model_name',
        }
    };

    const FK_FIELD_SPECS = {
        work_dept: {
            source: 'ORG_DEPT',
            placeholder: '작업부서 선택',
            optionBuilder: buildDepartmentOption,
        },
        req_dept: {
            source: 'ORG_DEPT',
            placeholder: '요청부서 선택',
            optionBuilder: buildDepartmentOption,
        },
        worker: {
            source: 'USER_PROFILE',
            placeholder: '작업자 선택',
            optionBuilder: buildUserProfileOption,
        },
        requester: {
            source: 'USER_PROFILE',
            placeholder: '요청자 선택',
            optionBuilder: buildUserProfileOption,
        },
        vendor: {
            source: 'VENDOR',
            placeholder: '제조사 선택',
            optionBuilder: buildVendorOption,
        },
        model: {
            source: 'DISK',
            placeholder: '모델 선택',
            optionBuilder: buildDiskOption,
        }
    };

    const FORM_TO_API_FIELD_MAP = {
        status: 'status',
        work_date: 'work_date',
        work_dept: 'work_dept_code',
        worker: 'worker_id',
        req_dept: 'request_dept_code',
        requester: 'requester_id',
        vendor: 'manufacturer_code',
        model: 'disk_code',
        serial: 'serial_number',
        success: 'success',
        fail_reason: 'failure_reason',
        remark: 'remark'
    };

    // Required fields (matches backend create_data_delete_register requirements)
    const REQUIRED_FORM_FIELDS = new Set([
        'status','work_date','work_dept','worker','req_dept','requester','vendor','model','serial','success'
    ]);

    const FK_BOOTSTRAP_FIELDS = ['work_dept','req_dept','worker','requester','vendor','model'];
    const fkSourceCache = new Map();
    const fkLabelCache = new Map();

    // ── 행 복제 헬퍼 ──
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

    function _promisePool(tasks, limit){
        limit = limit || 6;
        const queue = [...tasks];
        const workers = Array.from({length: Math.max(1, limit|0)}, async ()=>{
            while(queue.length){
                const fn = queue.shift();
                await fn();
            }
        });
        return Promise.all(workers);
    }

    async function fetchAllForCurrentQuery(){
        const q = (state.search || '').trim();
        let page = 1;
        const pageSize = DATA_DELETE_FETCH_LIMIT;
        const items = [];
        let total = null;
        while(true){
            const params = new URLSearchParams();
            params.set('page', String(page));
            params.set('page_size', String(pageSize));
            if(q) params.set('q', q);
            const payload = await fetchJSON(`${DATA_DELETE_API_BASE}?${params.toString()}`);
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

    async function createEntry(payload){
        const res = await fetchJSON(DATA_DELETE_API_BASE, {
            method: 'POST',
            headers: DATA_DELETE_HEADERS,
            body: JSON.stringify(payload || {}),
        });
        if(res?.success === false){ throw new Error(res?.message || '생성 중 오류가 발생했습니다.'); }
        return res?.item;
    }
    // ── /행 복제 헬퍼 ──

    let state = {
        data: [],
        filtered: [],
        pageSize: 10,
        page: 1,
        visibleCols: new Set(BASE_VISIBLE_COLUMNS),
        search: '',
        // 선택된 행 (row id 기반) 저장하여 리렌더 후에도 유지
        selected: new Set(),
        nextId: 1, // mockData 초기화 후 재설정
        sortKey: null,
        sortDir: 'asc',
        columnFilters: {}, // { col: value | [values...] } (조건 필터 기능 제거 예정 - 빈 유지)
        serverTotal: 0,
        isLoading: false,
        lastError: null,
    };

    function buildDepartmentOption(item){
        const code = String(item?.dept_code || item?.deptName || '').trim();
        const name = String(item?.dept_name || item?.deptName || '').trim();
        if(!code && !name) return null;
        const label = name || code;
        return { value: code || name, label };
    }

    function buildUserProfileOption(item){
        const id = item?.id;
        const name = String(item?.name || '').trim();
        const emp = String(item?.emp_no || '').trim();
        const dept = String(item?.department || '').trim();
        if(!id) return null;
        // Display policy: show only the name (no employee number / department)
        const label = name || emp || `ID:${id}`;
        return { value: String(id), label };
    }

    function buildVendorOption(item){
        const code = String(item?.manufacturer_code || item?.code || '').trim();
        const name = String(item?.manufacturer_name || item?.vendor || '').trim();
        if(!code && !name) return null;
        const label = name || code;
        return { value: code || name, label };
    }

    function buildDiskOption(item){
        const code = String(item?.disk_code || item?.code || '').trim();
        const name = String(item?.model_name || item?.model || '').trim();
        const vendor = String(item?.manufacturer_name || item?.vendor || '').trim();
        if(!code && !name) return null;
        const label = name || code;
        return { value: code || name, label };
    }

    function fkSelectMarkup(field, value, opts){
        opts = opts || {};
        const spec = FK_FIELD_SPECS[field] || {};
        const placeholder = spec.placeholder || '선택';
        const attrs = [
            `name="${field}"`,
            'class="form-input search-select fk-select"',
            `data-fk="${field}"`,
            `data-placeholder="${placeholder}"`
        ];
        const required = (opts.required !== undefined)
            ? !!opts.required
            : REQUIRED_FORM_FIELDS.has(field);
        if(required){
            attrs.push('required');
        }
        if(opts.initialLabel != null && String(opts.initialLabel).trim() !== ''){
            attrs.push(`data-initial-label="${escapeAttr(String(opts.initialLabel))}"`);
        }
        if(value != null && value !== ''){
            attrs.push(`data-initial-value="${escapeAttr(String(value))}"`);
        }
        const initial = (value == null) ? '' : String(value).trim();
        let initialOpt = '';
        if(initial){
            const label = String(
                (opts.initialLabel && String(opts.initialLabel).trim())
                    ? opts.initialLabel
                    : (resolveFkLabel(field, initial) || initial)
            ).trim();
            initialOpt = `<option value="${escapeAttr(initial)}" selected>${escapeHTML(label)}</option>`;
        }
        return `<select ${attrs.join(' ')}><option value="">${escapeHTML(placeholder)}</option>${initialOpt}</select>`;
    }

    function markFormRequiredAttributes(form){
        if(!form) return;
        REQUIRED_FORM_FIELDS.forEach(name => {
            const el = form.querySelector(`[name="${name}"]`);
            if(!el) return;
            try { el.required = true; } catch(_e){}
        });
    }

    function ensureFormValidOrMark(form){
        if(!form) return false;
        try { form.classList.remove('show-required-errors'); } catch(_e){}
        // Ensure required attributes are present (esp. for dynamic edit form)
        markFormRequiredAttributes(form);
        const ok = !!form.checkValidity();
        if(ok) return true;
        try { form.classList.add('show-required-errors'); } catch(_e){}
        try {
            const firstInvalid = form.querySelector(':invalid');
            firstInvalid?.focus?.();
        } catch(_e){}
        // Native tooltip (not a modal) + triggers :invalid
        try { form.reportValidity(); } catch(_e){}
        return false;
    }

    function upgradeStaticFkFields(){
        const form = document.getElementById(ADD_FORM_ID);
        if(!form) return;
        Object.keys(FK_FIELD_SPECS).forEach(field=>{
            const target = form.querySelector(`[name="${field}"]`);
            if(!target) return;
            if(target.tagName && target.tagName.toLowerCase() === 'select'){
                target.dataset.fk = field;
                target.classList.add('fk-select');
                target.dataset.placeholder = FK_FIELD_SPECS[field].placeholder || '선택';
                if(!target.children.length){
                    target.innerHTML = `<option value="">${escapeHTML(target.dataset.placeholder)}</option>`;
                }
                return;
            }
            const wrapper = document.createElement('div');
            wrapper.innerHTML = fkSelectMarkup(field, target.value);
            const select = wrapper.firstElementChild;
            target.replaceWith(select);
        });
    }

    async function loadFkSource(sourceKey){
        if(fkSourceCache.has(sourceKey)){
            return fkSourceCache.get(sourceKey);
        }
        const config = FK_SOURCE_CONFIG[sourceKey];
        if(!config){
            fkSourceCache.set(sourceKey, []);
            return [];
        }
        try {
            const resp = await fetch(config.endpoint, { headers:{ 'Accept': 'application/json' } });
            let payload = {};
            try { payload = await resp.json(); } catch(_e){ payload = {}; }
            if(!resp.ok || payload.success === false){
                throw new Error(payload.message || '데이터를 불러오지 못했습니다.');
            }
            const items = Array.isArray(payload.items)
                ? payload.items
                : (Array.isArray(payload.data) ? payload.data : (Array.isArray(payload) ? payload : []));
            fkSourceCache.set(sourceKey, items);
            return items;
        } catch(err){
            console.warn('[DATA_DELETE] FK source load failed:', sourceKey, err);
            fkSourceCache.set(sourceKey, []);
            return [];
        }
    }

    function defaultFkOption(item, spec, config){
        const valueKey = spec.valueKey || config.valueKey || 'id';
        const labelKey = spec.labelKey || config.labelKey || valueKey;
        const valueRaw = item?.[valueKey];
        const labelRaw = item?.[labelKey];
        const value = (valueRaw ?? labelRaw ?? '').toString().trim();
        const label = (labelRaw ?? valueRaw ?? '').toString().trim();
        if(!value || !label) return null;
        return { value, label };
    }

    function recordFkLabels(field, options){
        if(!fkLabelCache.has(field)){
            fkLabelCache.set(field, new Map());
        }
        const map = fkLabelCache.get(field);
        options.forEach(opt=>{
            const key = String(opt.value ?? '').trim();
            if(!key) return;
            map.set(key, opt.label);
        });
    }

    function resolveFkLabel(field, value){
        if(value == null) return '';
        const map = fkLabelCache.get(field);
        if(!map) return '';
        return map.get(String(value)) || '';
    }

    // ----- Vendor filtering (제조사: cmp_disk_type에 등록된 제조사만 노출) -----
    // Cache is derived from DISK source (`/api/cmp-disk-types`).
    let allowedVendorKeysPromise = null;

    async function getAllowedVendorKeysFromDiskTypes(){
        if(allowedVendorKeysPromise){
            return allowedVendorKeysPromise;
        }
        allowedVendorKeysPromise = (async () => {
            try {
                const diskRows = await loadFkSource('DISK');
                const keys = new Set();
                (Array.isArray(diskRows) ? diskRows : []).forEach(row => {
                    const code = String(row?.manufacturer_code || row?.vendor_code || '').trim();
                    const name = String(row?.manufacturer_name || row?.vendor || row?.manufacturer || '').trim();
                    if(code) keys.add(code);
                    if(name) keys.add(name);
                });
                // If disk types are empty, treat as "no filter" to avoid hiding everything.
                return keys.size ? keys : null;
            } catch(_e){
                // On errors, do not filter vendor list.
                return null;
            }
        })();
        return allowedVendorKeysPromise;
    }

    // ----- Dept-member constraint helpers (작업자/요청자 = 선택 부서의 부서원) -----
    const userOptionsByDeptCodeCache = new Map(); // dept_code -> options
    const deptMemberBoundForms = new WeakSet();

    function getFormFieldValue(form, name){
        const el = form?.querySelector(`[name="${name}"]`);
        return (el?.value ?? '').toString().trim();
    }

    async function getUserProfileOptionsForDeptCode(deptCode){
        const code = String(deptCode || '').trim();
        if(!code) return [];
        if(userOptionsByDeptCodeCache.has(code)){
            return userOptionsByDeptCodeCache.get(code);
        }
        const url = `/api/user-profiles?limit=2000&dept_code=${encodeURIComponent(code)}`;
        const payload = await fetchJSON(url, { headers:{ 'Accept':'application/json' } });
        const items = Array.isArray(payload?.items) ? payload.items : [];
        const options = items
            .map(buildUserProfileOption)
            .filter(Boolean)
            .map(o => ({ value: String(o.value ?? '').trim(), label: String(o.label ?? '').trim() }))
            .filter(o => o.value && o.label);
        // Keep label caches warm for table rendering
        recordFkLabels('worker', options);
        recordFkLabels('requester', options);
        userOptionsByDeptCodeCache.set(code, options);
        return options;
    }

    function clearSelectToPlaceholder(select){
        if(!select) return;
        select.value = '';
        try { select.removeAttribute('data-initial-value'); } catch(_e){}
        select.dispatchEvent(new Event('change', { bubbles:true }));
        syncSearchableSelect(select);
    }

    async function applyDeptMemberConstraint(form, deptField, userField){
        if(!form) return;
        const deptCode = getFormFieldValue(form, deptField);
        const userSelect = form.querySelector(`select[name="${userField}"]`);
        if(!userSelect) return;

        // If no dept selected yet, keep user list empty (placeholder only)
        if(!deptCode){
            const prev = userSelect.value;
            userSelect.disabled = true;
            try { userSelect.removeAttribute('data-initial-value'); } catch(_e){}
            populateFkSelect(userSelect, []);
            if(prev) clearSelectToPlaceholder(userSelect);
            syncSearchableSelect(userSelect);
            return;
        }

        userSelect.disabled = false;

        const prevValue = (userSelect.value ?? '').toString().trim();
        try { userSelect.removeAttribute('data-initial-value'); } catch(_e){}
        let options = [];
        try {
            options = await getUserProfileOptionsForDeptCode(deptCode);
        } catch(err){
            console.warn('[DATA_DELETE] Failed to load dept members', deptField, deptCode, err);
            options = [];
        }
        populateFkSelect(userSelect, options);
        // Preserve selection only if still a member
        if(prevValue && options.some(o => o.value === prevValue)){
            userSelect.value = prevValue;
        } else {
            userSelect.value = '';
        }
        syncSearchableSelect(userSelect);
    }

    function bindDeptMemberConstraints(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        // Avoid duplicate bindings
        if(deptMemberBoundForms.has(form)){
            // Still re-apply once (values/options may have changed)
            void applyDeptMemberConstraint(form, 'work_dept', 'worker');
            void applyDeptMemberConstraint(form, 'req_dept', 'requester');
            return;
        }
        deptMemberBoundForms.add(form);

        const workDept = form.querySelector('select[name="work_dept"]');
        const reqDept = form.querySelector('select[name="req_dept"]');

        workDept?.addEventListener('change', ()=>{ void applyDeptMemberConstraint(form, 'work_dept', 'worker'); });
        reqDept?.addEventListener('change', ()=>{ void applyDeptMemberConstraint(form, 'req_dept', 'requester'); });

        // Initial apply
        void applyDeptMemberConstraint(form, 'work_dept', 'worker');
        void applyDeptMemberConstraint(form, 'req_dept', 'requester');
    }

    async function assertUserIsMemberOfDept(deptCode, userId, deptLabel, userLabel){
        const dc = String(deptCode || '').trim();
        const uid = String(userId || '').trim();
        if(!dc || !uid) return;
        const options = await getUserProfileOptionsForDeptCode(dc);
        if(!options.some(o => o.value === uid)){
            throw new Error(`${userLabel}는 ${deptLabel}의 부서원이어야 합니다.`);
        }
    }

    async function validateDeptMemberConstraints(form){
        if(!form) return;
        const workDept = getFormFieldValue(form, 'work_dept');
        const worker = getFormFieldValue(form, 'worker');
        const reqDept = getFormFieldValue(form, 'req_dept');
        const requester = getFormFieldValue(form, 'requester');
        await assertUserIsMemberOfDept(workDept, worker, '작업부서', '작업자');
        await assertUserIsMemberOfDept(reqDept, requester, '요청부서', '요청자');
    }

    // Searchable select helpers (ported from hw_server_onpremise style)
    const searchableSelectMeta = new WeakMap();
    let activeSearchPanel = null;

    function isSearchableSelect(select){
        if(!select || select.tagName !== 'SELECT'){ return false; }
        if(select.multiple){ return false; }
        if(select.dataset.searchable === 'false'){ return false; }
        // Some templates/builders mark FK selects as `fk-select` but may omit `search-select`.
        // Treat FK selects as searchable by default so the modal UX is consistent.
        return select.classList.contains('search-select') || (select.classList.contains('fk-select') && !!select.dataset.fk);
    }

    function getSearchablePlaceholder(select){
        return select?.getAttribute('data-placeholder') || select?.dataset?.placeholder || '선택';
    }

    function setupSearchableSelect(select){
        // Prefer the shared global enhancer if present to avoid double-enhancement
        // conflicts (both implementations historically used the same `data-search-enhanced` flag).
        if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
            return;
        }
        if(!isSearchableSelect(select) || select.dataset.searchEnhanced === '1'){
            return;
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'fk-searchable-control';
        const displayBtn = document.createElement('button');
        displayBtn.type = 'button';
        displayBtn.className = 'fk-searchable-display';
        displayBtn.setAttribute('aria-haspopup', 'dialog');
        displayBtn.setAttribute('aria-expanded', 'false');
        displayBtn.dataset.placeholder = getSearchablePlaceholder(select);
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'fk-searchable-clear';
        clearBtn.textContent = '지움';
        clearBtn.setAttribute('aria-label', '선택 해제');
        clearBtn.hidden = true;
        clearBtn.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            closeSearchDropdown(select);
            select.value = '';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            syncSearchableSelect(select);
        });
        displayBtn.addEventListener('click', event => {
            event.preventDefault();
            if(select.disabled){ return; }
            openSearchDropdown(select);
        });
        const parent = select.parentNode;
        if(parent){ parent.insertBefore(wrapper, select); }
        wrapper.appendChild(displayBtn);
        wrapper.appendChild(clearBtn);
        wrapper.appendChild(select);
        select.classList.add('fk-search-native-hidden');
        select.dataset.searchEnhanced = '1';
        select.addEventListener('change', () => syncSearchableSelect(select));
        searchableSelectMeta.set(select, { wrapper, displayBtn, clearBtn });
    }

    function syncSearchableSelect(select){
        // Delegate to the shared enhancer when available.
        if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
            try {
                const scope = (select && select.closest) ? (select.closest('form') || document) : document;
                window.BlossomSearchableSelect.syncAll(scope);
            } catch(_e){}
            return;
        }
        if(!isSearchableSelect(select)){
            return;
        }
        let meta = searchableSelectMeta.get(select);
        if(!meta){
            setupSearchableSelect(select);
            meta = searchableSelectMeta.get(select);
            if(!meta){ return; }
        }
        const placeholder = getSearchablePlaceholder(select);
        const selectedOption = select.selectedOptions && select.selectedOptions[0];
        const optionLabel = (selectedOption?.textContent || '').trim();
        const value = select.value || '';
        const label = optionLabel || value || placeholder;
        meta.displayBtn.textContent = label;
        meta.displayBtn.title = label;
        meta.displayBtn.dataset.placeholder = placeholder;
        const hasValue = !!value;
        meta.displayBtn.classList.toggle('has-value', hasValue);
        meta.clearBtn.hidden = !hasValue;
        const disabled = !!select.disabled;
        meta.wrapper.classList.toggle('is-disabled', disabled);
        meta.displayBtn.disabled = disabled;
        meta.clearBtn.disabled = disabled;
        if(disabled){
            closeSearchDropdown(select);
        }
    }

    function buildSearchPanelOptions(select, placeholder){
        const options = [];
        Array.from(select?.options || []).forEach(opt => {
            const rawLabel = (opt.textContent || '').trim();
            const value = opt.value || '';
            const label = rawLabel || value || placeholder;
            options.push({
                value,
                label,
                searchLabel: label.toLowerCase(),
                valueLower: value.toLowerCase()
            });
        });
        return options;
    }

    function openSearchDropdown(select){
        if(!isSearchableSelect(select) || select.disabled){
            return;
        }
        const meta = searchableSelectMeta.get(select);
        if(!meta){ return; }
        closeSearchDropdown();
        const placeholder = getSearchablePlaceholder(select);
        const panel = document.createElement('div');
        panel.className = 'fk-search-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', `${placeholder} 검색`);
        const header = document.createElement('div');
        header.className = 'fk-search-panel__header';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'fk-search-panel__input';
        input.placeholder = '검색어 입력';
        input.setAttribute('aria-label', '검색어 입력');
        input.autocomplete = 'off';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'fk-search-panel__close';
        closeBtn.textContent = '닫기';
        closeBtn.setAttribute('aria-label', '닫기');
        header.appendChild(input);
        header.appendChild(closeBtn);
        panel.appendChild(header);
        const list = document.createElement('div');
        list.className = 'fk-search-panel__list';
        list.setAttribute('role', 'listbox');
        panel.appendChild(list);
        const empty = document.createElement('div');
        empty.className = 'fk-search-panel__empty';
        empty.textContent = '검색 결과가 없습니다.';
        empty.hidden = true;
        panel.appendChild(empty);
        document.body.appendChild(panel);
        const options = buildSearchPanelOptions(select, placeholder);
        const state = {
            select,
            panel,
            trigger: meta.displayBtn,
            anchor: meta.wrapper,
            input,
            closeBtn,
            list,
            empty,
            placeholder,
            options,
            filtered: options.slice(),
            focusIndex: -1
        };
        activeSearchPanel = state;
        meta.displayBtn.setAttribute('aria-expanded', 'true');
        renderSearchPanelOptions(state);
        positionSearchPanel(state);
        setTimeout(()=> input.focus(), 0);
        closeBtn.addEventListener('click', event => {
            event.preventDefault();
            closeSearchDropdown();
        });
        input.addEventListener('keydown', event => handleSearchInputKeydown(event, state));
        input.addEventListener('input', () => filterSearchPanelOptions(state));
        list.addEventListener('keydown', event => handleSearchListKeydown(event, state));
        state.handleOutside = event => {
            if(panel.contains(event.target) || meta.wrapper.contains(event.target)){
                return;
            }
            closeSearchDropdown();
        };
        document.addEventListener('pointerdown', state.handleOutside, true);
        state.handleKeydown = event => {
            if(event.key === 'Escape'){
                event.preventDefault();
                event.stopPropagation();
                closeSearchDropdown();
            }
        };
        document.addEventListener('keydown', state.handleKeydown, true);
        state.handleResize = () => closeSearchDropdown();
        window.addEventListener('resize', state.handleResize);
        state.handleScroll = () => closeSearchDropdown();
        window.addEventListener('scroll', state.handleScroll, true);
        state.handleFocus = event => {
            if(panel.contains(event.target) || meta.wrapper.contains(event.target)){
                return;
            }
            closeSearchDropdown();
        };
        document.addEventListener('focusin', state.handleFocus, true);
    }

    function renderSearchPanelOptions(state){
        state.list.innerHTML = '';
        const currentValue = state.select.value || '';
        if(!state.filtered.length){
            state.empty.hidden = false;
            state.focusIndex = -1;
            return;
        }
        state.empty.hidden = true;
        state.filtered.forEach((opt, index) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'fk-search-panel__item';
            btn.textContent = opt.label;
            btn.dataset.value = opt.value;
            btn.setAttribute('role', 'option');
            btn.tabIndex = -1;
            if(opt.value === currentValue){
                btn.classList.add('selected');
                btn.setAttribute('aria-selected', 'true');
                state.focusIndex = index;
            } else {
                btn.setAttribute('aria-selected', 'false');
            }
            btn.addEventListener('click', event => {
                event.preventDefault();
                commitSearchPanelSelection(state, opt.value);
            });
            state.list.appendChild(btn);
        });
    }

    function focusSearchPanelItem(state, index, opts){
        const items = state.list.querySelectorAll('.fk-search-panel__item');
        if(!items.length){ return; }
        const maxIndex = items.length - 1;
        const targetIndex = Math.max(0, Math.min(index, maxIndex));
        state.focusIndex = targetIndex;
        items.forEach((btn, idx) => {
            const isActive = idx === targetIndex;
            btn.classList.toggle('active', isActive);
        });
        const target = items[targetIndex];
        if(opts?.focus !== false){
            target.focus({ preventScroll: true });
        }
        if(opts?.ensureVisible){
            const listEl = state.list;
            const itemTop = target.offsetTop;
            const itemBottom = itemTop + target.offsetHeight;
            if(itemBottom > listEl.scrollTop + listEl.clientHeight){
                listEl.scrollTop = itemBottom - listEl.clientHeight;
            } else if(itemTop < listEl.scrollTop){
                listEl.scrollTop = itemTop;
            }
        }
    }

    function handleSearchInputKeydown(event, state){
        if(event.key === 'ArrowDown'){
            event.preventDefault();
            if(!state.filtered.length){ return; }
            if(state.focusIndex === -1){
                focusSearchPanelItem(state, 0, { ensureVisible: true });
            } else {
                focusSearchPanelItem(state, state.focusIndex, { ensureVisible: true });
            }
        } else if(event.key === 'Enter'){
            if(state.focusIndex >= 0 && state.filtered[state.focusIndex]){
                event.preventDefault();
                commitSearchPanelSelection(state, state.filtered[state.focusIndex].value);
            }
        }
    }

    function handleSearchListKeydown(event, state){
        const isItem = !!(event.target && event.target.classList && event.target.classList.contains('fk-search-panel__item'));
        if(!isItem){ return; }
        if(event.key === 'ArrowDown'){
            event.preventDefault();
            focusSearchPanelItem(state, (state.focusIndex >= 0 ? state.focusIndex + 1 : 0), { ensureVisible: true });
        } else if(event.key === 'ArrowUp'){
            event.preventDefault();
            if(state.focusIndex <= 0){
                state.focusIndex = -1;
                state.input.focus();
                return;
            }
            focusSearchPanelItem(state, state.focusIndex - 1, { ensureVisible: true });
        } else if(event.key === 'Home'){
            event.preventDefault();
            focusSearchPanelItem(state, 0, { ensureVisible: true });
        } else if(event.key === 'End'){
            event.preventDefault();
            focusSearchPanelItem(state, state.filtered.length - 1, { ensureVisible: true });
        } else if(event.key === 'Enter' || event.key === ' '){
            if(state.focusIndex >= 0 && state.filtered[state.focusIndex]){
                event.preventDefault();
                commitSearchPanelSelection(state, state.filtered[state.focusIndex].value);
            }
        } else if(event.key === 'Escape'){
            event.preventDefault();
            event.stopPropagation();
            closeSearchDropdown();
        }
    }

    function commitSearchPanelSelection(state, value){
        state.select.value = value;
        state.select.dispatchEvent(new Event('change', { bubbles: true }));
        syncSearchableSelect(state.select);
        closeSearchDropdown();
    }

    function filterSearchPanelOptions(state){
        const term = state.input.value.trim().toLowerCase();
        if(!term){
            state.filtered = state.options.slice();
        } else {
            state.filtered = state.options.filter(opt => opt.searchLabel.includes(term) || opt.valueLower.includes(term));
        }
        state.focusIndex = state.filtered.findIndex(opt => opt.value === state.select.value);
        renderSearchPanelOptions(state);
    }

    function closeSearchDropdown(targetSelect){
        if(!activeSearchPanel){ return; }
        if(targetSelect && activeSearchPanel.select !== targetSelect){
            return;
        }
        const state = activeSearchPanel;
        state.trigger?.setAttribute('aria-expanded', 'false');
        if(state.panel?.parentNode){
            state.panel.parentNode.removeChild(state.panel);
        }
        if(state.handleOutside){ document.removeEventListener('pointerdown', state.handleOutside, true); }
        if(state.handleKeydown){ document.removeEventListener('keydown', state.handleKeydown, true); }
        if(state.handleFocus){ document.removeEventListener('focusin', state.handleFocus, true); }
        if(state.handleResize){ window.removeEventListener('resize', state.handleResize); }
        if(state.handleScroll){ window.removeEventListener('scroll', state.handleScroll, true); }
        activeSearchPanel = null;
    }

    function positionSearchPanel(state){
        const { panel, anchor } = state;
        if(!panel || !anchor){ return; }
        const rect = anchor.getBoundingClientRect();
        const margin = 8;
        const width = Math.max(rect.width, 280);
        panel.style.width = `${width}px`;
        let left = rect.left;
        if(left + width > window.innerWidth - margin){
            left = window.innerWidth - width - margin;
        }
        left = Math.max(margin, left);
        let top = rect.bottom + margin;
        const availableBelow = window.innerHeight - rect.bottom - margin;
        const availableAbove = rect.top - margin;
        const panelHeight = panel.offsetHeight;
        if(panelHeight > availableBelow && availableAbove > availableBelow){
            top = rect.top - panelHeight - margin;
        }
        top = Math.max(margin, top);
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
    }

    function enhanceFormSearchableSelects(formId){
        const form = document.getElementById(formId);
        if(!form){ return; }
        // Prefer shared enhancer if present (consistent UX + no conflicts).
        if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
            try { window.BlossomSearchableSelect.syncAll(form); } catch(_e){}
            return;
        }
        form.querySelectorAll('select.search-select, select.fk-select[data-fk]').forEach(select => {
            setupSearchableSelect(select);
            syncSearchableSelect(select);
        });
    }

    document.addEventListener('reset', event => {
        const form = event.target;
        if(!(form instanceof HTMLFormElement)){ return; }
        setTimeout(() => {
            if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
                try { window.BlossomSearchableSelect.syncAll(form); } catch(_e){}
            }
            form.querySelectorAll('select.search-select, select.fk-select[data-fk]').forEach(select => syncSearchableSelect(select));
            try { syncFailReasonEnabled(form); } catch(_e){}
        }, 0);
    });

    // ----- Fail reason enable/disable (성공여부 == 'X'일 때만 실패사유 활성화) -----
    const failReasonBoundForms = new WeakSet();

    function _getSuccessAndFailReasonEls(form){
        if(!form) return { successEl: null, failEl: null };
        const successEl = form.querySelector('[name="success"], [data-bulk-field="success"]');
        const failEl = form.querySelector('[name="fail_reason"], [data-bulk-field="fail_reason"]');
        return { successEl, failEl };
    }

    function syncFailReasonEnabled(form){
        const { successEl, failEl } = _getSuccessAndFailReasonEls(form);
        if(!successEl || !failEl) return;
        const v = String(successEl.value ?? '').trim();
        const enabled = (v === 'X');
        // Visual rule: when success == 'O', show gray interior on the fail_reason input.
        try {
            // (Reusing existing CSS class name for gray styling)
            failEl.classList.toggle('fail-reason-x', v === 'O');
        } catch(_e){}
        failEl.disabled = !enabled;
        // If success is confirmed (O) or not selected, failure reason should not be filled.
        if(!enabled && (v === 'O' || v === '')){
            try { failEl.value = ''; } catch(_e){}
        }
    }

    function bindFailReasonToggle(formId){
        const form = typeof formId === 'string' ? document.getElementById(formId) : formId;
        if(!form) return;
        if(failReasonBoundForms.has(form)){
            syncFailReasonEnabled(form);
            return;
        }
        const { successEl } = _getSuccessAndFailReasonEls(form);
        if(!successEl) return;
        failReasonBoundForms.add(form);
        successEl.addEventListener('change', ()=> syncFailReasonEnabled(form));
        syncFailReasonEnabled(form);
    }

    async function getFkOptions(field){
        const spec = FK_FIELD_SPECS[field];
        if(!spec) return [];
        const sourceConfig = FK_SOURCE_CONFIG[spec.source] || {};
        const records = await loadFkSource(spec.source);
        const seen = new Set();
        const options = [];
        records.forEach(item => {
            const built = spec.optionBuilder
                ? spec.optionBuilder(item)
                : defaultFkOption(item, spec, sourceConfig);
            if(!built) return;
            const value = (built.value ?? '').toString().trim();
            const label = (built.label ?? '').toString().trim();
            if(!value || !label) return;
            const key = `${value}__${label}`;
            if(seen.has(key)) return;
            seen.add(key);
            options.push({ value, label });
        });
        options.sort((a,b)=> a.label.localeCompare(b.label, 'ko', { sensitivity: 'base' }) || a.value.localeCompare(b.value, 'ko', { sensitivity: 'base' }));
        // Keep label cache populated from the full vendor list for stable table rendering,
        // but restrict the actual dropdown options to manufacturers referenced by cmp_disk_type.
        if(field === 'vendor'){
            recordFkLabels(field, options);
            const allowed = await getAllowedVendorKeysFromDiskTypes();
            return allowed ? options.filter(opt => allowed.has(opt.value) || allowed.has(opt.label)) : options;
        }

        recordFkLabels(field, options);
        return options;
    }

    function populateFkSelect(select, options){
        if(!select) return;
        const placeholder = select.getAttribute('data-placeholder') || '선택';
        const field = select.getAttribute('data-fk') || select.name || '';
        const initial = String(select.getAttribute('data-initial-value') || '').trim();
        const initialLabelAttr = String(select.getAttribute('data-initial-label') || '').trim();
        const frag = document.createDocumentFragment();
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = placeholder;
        frag.appendChild(defaultOpt);
        const normalizedOptions = Array.isArray(options) ? options : [];
        const hasInitialInOptions = !!(initial && normalizedOptions.some(o => String(o?.value ?? '').trim() === initial));
        if(initial && !hasInitialInOptions){
            const label = initialLabelAttr || resolveFkLabel(field, initial) || initial;
            const opt = document.createElement('option');
            opt.value = initial;
            opt.textContent = label;
            frag.appendChild(opt);
        }
        normalizedOptions.forEach(opt=>{
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            frag.appendChild(option);
        });
        select.innerHTML = '';
        select.appendChild(frag);
        select.value = initial;
        select.disabled = false;
        // Sync searchable UI (shared helper preferred).
        if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
            try { window.BlossomSearchableSelect.syncAll(select.closest('form') || document); } catch(_e){}
        } else {
            setupSearchableSelect(select);
            syncSearchableSelect(select);
        }
    }

    async function initFkSelects(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        const selects = [...form.querySelectorAll('select[data-fk]')];
        if(!selects.length) return;
        await Promise.all(selects.map(async select => {
            const field = select.getAttribute('data-fk') || select.name;
            let options = [];
            try {
                options = await getFkOptions(field);
            } catch(err){
                console.warn('[DATA_DELETE] FK options load failed', field, err);
                options = [];
            }
            populateFkSelect(select, options);
        }));
    }

    function resetFkSelects(form){
        if(!form) return;
        form.querySelectorAll('select[data-fk]').forEach(select=>{
            const placeholder = select.getAttribute('data-placeholder') || '선택';
            if(!select.options.length){
                select.innerHTML = `<option value="">${escapeHTML(placeholder)}</option>`;
            }
            select.value = '';
            select.disabled = false;
            syncSearchableSelect(select);
        });
    }

    function decorateRowWithFkLabels(row){
        if(!row || typeof row !== 'object') return;
        Object.keys(FK_FIELD_SPECS).forEach(field=>{
            const label = resolveFkLabel(field, row[field]);
            if(label){
                row[`${field}_label`] = label;
            }
        });
    }

    function decorateRowsWithFkLabels(rows){
        if(!Array.isArray(rows)) return;
        rows.forEach(decorateRowWithFkLabels);
    }

    function buildPayloadFromForm(form){
        if(!form) throw new Error('폼을 찾을 수 없습니다.');
        const formData = new FormData(form);
        const mapping = FORM_TO_API_FIELD_MAP;
        const payload = {};
        Object.entries(mapping).forEach(([formKey, apiKey])=>{
            let raw = formData.get(formKey);
            if(raw == null) return;
            raw = String(raw).trim();
            if(apiKey === 'worker_id' || apiKey === 'requester_id'){
                if(raw === '') return;
                const parsed = parseInt(raw, 10);
                if(!Number.isFinite(parsed)){
                    throw new Error('사용자 선택값이 올바르지 않습니다.');
                }
                payload[apiKey] = parsed;
                return;
            }
            if(raw === '' && apiKey !== 'success') return;
            payload[apiKey] = raw;
        });
        const requiredMessages = {
            status: '상태를 선택하세요.',
            work_date: '작업일자를 입력하세요.',
            work_dept_code: '작업부서를 선택하세요.',
            worker_id: '작업자를 선택하세요.',
            request_dept_code: '요청부서를 선택하세요.',
            requester_id: '요청자를 선택하세요.',
            manufacturer_code: '제조사를 선택하세요.',
            disk_code: '모델을 선택하세요.',
            serial_number: '일련번호를 입력하세요.'
        };
        Object.keys(requiredMessages).forEach(key=>{
            if(!payload[key]){
                throw new Error(requiredMessages[key]);
            }
        });
        return payload;
    }

    async function createEntryFromForm(form){
        await validateDeptMemberConstraints(form);
        const payload = buildPayloadFromForm(form);
        await fetchJSON(DATA_DELETE_API_BASE, {
            method: 'POST',
            headers: DATA_DELETE_HEADERS,
            body: JSON.stringify(payload)
        });
        await refreshFromServer();
    }

    async function updateEntryFromForm(entryId, form){
        if(!entryId && entryId !== 0) throw new Error('수정할 대상을 찾을 수 없습니다.');
        await validateDeptMemberConstraints(form);
        const payload = buildPayloadFromForm(form);
        await fetchJSON(`${DATA_DELETE_API_BASE}/${entryId}`, {
            method: 'PUT',
            headers: DATA_DELETE_HEADERS,
            body: JSON.stringify(payload)
        });
        await refreshFromServer();
    }

    async function deleteEntries(ids){
        const safeIds = (ids || []).map(id=> parseInt(id, 10)).filter(id=> Number.isFinite(id));
        if(!safeIds.length) throw new Error('삭제할 항목을 선택하세요.');
        if(safeIds.length === 1){
            await fetchJSON(`${DATA_DELETE_API_BASE}/${safeIds[0]}`, { method:'DELETE', headers:{ 'Accept':'application/json' } });
        } else {
            await fetchJSON(`${DATA_DELETE_API_BASE}/bulk-delete`, {
                method:'POST',
                headers: DATA_DELETE_HEADERS,
                body: JSON.stringify({ ids: safeIds })
            });
        }
        await refreshFromServer();
    }

    async function applyBulkUpdate(ids, entries){
        const safeIds = (ids || []).map(id=> parseInt(id,10)).filter(id=> Number.isFinite(id));
        if(!safeIds.length) throw new Error('변경할 항목을 선택하세요.');
        const payload = {};
        entries.forEach(({ field, value })=>{
            const key = FORM_TO_API_FIELD_MAP[field];
            if(!key) return;
            if(key === 'worker_id' || key === 'requester_id'){
                const parsed = parseInt(value, 10);
                if(Number.isFinite(parsed)) payload[key] = parsed;
                return;
            }
            if(value !== '') payload[key] = value;
        });
        // Bulk constraints: if changing worker/requester, dept must be provided too.
        if(payload.worker_id && !payload.work_dept_code){
            throw new Error('작업자를 일괄 변경하려면 작업부서도 함께 선택하세요.');
        }
        if(payload.requester_id && !payload.request_dept_code){
            throw new Error('요청자를 일괄 변경하려면 요청부서도 함께 선택하세요.');
        }
        // Validate membership for bulk update targets (single dept scope)
        if(payload.worker_id && payload.work_dept_code){
            await assertUserIsMemberOfDept(payload.work_dept_code, String(payload.worker_id), '작업부서', '작업자');
        }
        if(payload.requester_id && payload.request_dept_code){
            await assertUserIsMemberOfDept(payload.request_dept_code, String(payload.requester_id), '요청부서', '요청자');
        }
        if(!Object.keys(payload).length) throw new Error('적용할 값을 입력하세요.');
        await Promise.all(safeIds.map(id=> fetchJSON(`${DATA_DELETE_API_BASE}/${id}`, {
            method:'PUT',
            headers: DATA_DELETE_HEADERS,
            body: JSON.stringify(payload)
        })));
        await refreshFromServer();
    }

    async function fetchJSON(url, options){
        const opts = options || {};
        if(!opts.headers){
            opts.headers = { 'Accept': 'application/json' };
        } else if(!opts.headers['Accept']){
            opts.headers['Accept'] = 'application/json';
        }
        const resp = await fetch(url, opts);
        let payload = null;
        try { payload = await resp.json(); } catch(_e){ payload = {}; }
        if(!resp.ok || payload?.success === false){
            const message = (payload && payload.message) ? payload.message : `요청이 실패했습니다. (HTTP ${resp.status})`;
            const error = new Error(message);
            error.payload = payload;
            error.status = resp.status;
            throw error;
        }
        return payload;
    }

    function normalizeSuccessValue(raw){
        if(raw === 'O' || raw === 'o' || raw === 1 || raw === '1') return 'O';
        if(raw === 'X' || raw === 'x' || raw === 0 || raw === '0') return 'X';
        return '';
    }

    function adaptServerItem(item){
        if(!item) return null;
        const success = normalizeSuccessValue(item.success ?? item.success_yn);
        return {
            id: item.id,
            status: item.status || '',
            work_date: item.work_date || '',
            work_dept: item.work_dept_code || '',
            work_dept_code: item.work_dept_code || '',
            worker: item.worker_id ?? '',
            worker_id: item.worker_id ?? '',
            req_dept: item.request_dept_code || '',
            req_dept_code: item.request_dept_code || '',
            requester: item.requester_id ?? '',
            requester_id: item.requester_id ?? '',
            vendor: item.manufacturer_code || '',
            manufacturer_code: item.manufacturer_code || '',
            model: item.disk_code || '',
            disk_code: item.disk_code || '',
            serial: item.serial_number || '',
            serial_number: item.serial_number || '',
            success,
            success_yn: typeof item.success_yn === 'number' ? item.success_yn : (success === 'O' ? 1 : (success === 'X' ? 0 : null)),
            fail_reason: item.failure_reason || '',
            remark: item.remark || '',
            created_at: item.created_at,
            updated_at: item.updated_at,
        };
    }

    async function refreshFromServer(){
        state.isLoading = true;
        try {
            const query = new URLSearchParams({ page_size: String(DATA_DELETE_FETCH_LIMIT) });
            const payload = await fetchJSON(`${DATA_DELETE_API_BASE}?${query.toString()}`);
            const items = Array.isArray(payload.items) ? payload.items : [];
            const mapped = items.map(adaptServerItem).filter(Boolean);
            state.data = mapped;
            state.serverTotal = typeof payload.total === 'number' ? payload.total : mapped.length;
            const maxId = mapped.reduce((acc,row)=> Math.max(acc, Number(row?.id)||0), 0);
            state.nextId = maxId + 1;
            state.selected.clear();
            decorateRowsWithFkLabels(state.data);
            applyFilter();
        } catch(err){
            state.lastError = err;
            state.data = [];
            state.serverTotal = 0;
            state.filtered = [];
            render();
            throw err;
        } finally {
            state.isLoading = false;
        }
    }

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;

    async function loadBootstrapFkData(){
        try {
            await Promise.all(FK_BOOTSTRAP_FIELDS.map(field => getFkOptions(field)));
        } catch(err){
            console.warn('[DATA_DELETE] FK bootstrap failed', err);
        }
    }

    async function initData(){
        try {
            await loadBootstrapFkData();
        } catch(_e){}
        try {
            await refreshFromServer();
        } catch(err){
            console.error('Failed to load data deletion records', err);
            showMessage(err.message || '데이터 삭제 기록을 불러오지 못했습니다.', '오류');
        }
    }

    function applyFilter(){
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
        // 2단계: 컬럼 개별 필터 적용 (오른쪽 클릭 필터)
        const filterEntries = Object.entries(state.columnFilters).filter(([k,v])=> {
            if(Array.isArray(v)) return v.length>0; return v!=null && v!=='';
        });
        if(filterEntries.length){
            base = base.filter(row => filterEntries.every(([col,val])=>{
                const cell = String(row[col]??'');
                if(Array.isArray(val)) return val.includes(cell);
                return cell === String(val);
            }));
        }
    state.filtered = base;
        state.page = 1;
    // 하이라이트는 모든 대안 토큰을 납작하게(flat) 전달
    const flatTokens = groups.flat();
    render({ raw:qRaw, tokens: flatTokens });
    }

    function getPageSlice(){
        const start = (state.page-1)*state.pageSize;
        return state.filtered.slice(start, start+state.pageSize);
    }

    function totalPages(){
        return Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    }

    function getDisplayValue(row, col){
        if(!row) return '';
        if(FK_FIELD_SPECS[col]){
            return row[`${col}_label`] || row[col] || '';
        }
        if(col === 'success'){
            return row.success || normalizeSuccessValue(row.success_yn) || '';
        }
        return row[col];
    }

    function render(highlightContext){
        const tbody = document.getElementById(TBODY_ID);
        if(!tbody) return;
        tbody.innerHTML='';
        // 정렬 적용 (필터 결과에 대해)
        let working = state.filtered;
        if(state.sortKey){
            const k = state.sortKey;
            const dir = state.sortDir==='asc'?1:-1;
            working = [...state.filtered].sort((a,b)=>{
                let va=a[k], vb=b[k];
                const na = va!=='' && va!=null && !isNaN(va);
                const nb = vb!=='' && vb!=null && !isNaN(vb);
                if(na && nb){ va=parseFloat(va); vb=parseFloat(vb);} else { va=(va==null?'':String(va)).toLowerCase(); vb=(vb==null?'':String(vb)).toLowerCase(); }
                if(va===vb) return 0;
                if(va==='' && vb!=='') return 1;
                if(vb==='' && va!=='') return -1;
                return va>vb?dir:-dir;
            });
        }
        const start = (state.page-1)*state.pageSize;
        const slice = working.slice(start, start+state.pageSize);
        const emptyEl = document.getElementById('system-empty');
        if(state.filtered.length === 0){
            if(emptyEl){
                emptyEl.hidden = false;
                // 검색어가 있을 때와 데이터 자체가 없을 때 메시지 구분
                const titleEl = document.getElementById('system-empty-title');
                const descEl = document.getElementById('system-empty-desc');
                    if(state.search.trim()){
                        if(titleEl) titleEl.textContent = '검색 결과가 없습니다.';
                        if(descEl) descEl.textContent = '검색어를 변경하거나 필터를 초기화하세요.';
                    } else {
                        if(titleEl) titleEl.textContent = '삭제 기록이 없습니다.';
                        if(descEl) descEl.textContent = "우측 상단 '추가' 버튼을 눌러 첫 기록을 등록하세요.";
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
                    let rawVal = getDisplayValue(row, col);
                    if(col==='fail_reason' && typeof rawVal==='string'){
                        // single-line for table display
                        rawVal = rawVal.replace(/\r?\n|\r/g,' ');
                    }
                    const displayVal = (rawVal==null || String(rawVal).trim()==='') ? '-' : rawVal;
                    let cellValue = highlight(displayVal, col);
                    // 상태 배지: 완료 -> ws-run, 대기 -> ws-wait
                    if(col === 'status'){
                        const v = String(displayVal);
                        let cls = 'ws-wait';
                        if(v === '완료') cls = 'ws-run';
                        else if(v === '대기') cls = 'ws-wait';
                        cellValue = `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${highlight(displayVal, col)}</span></span>`;
                    }
                    // 성공여부: O/X 배지
                    if(col === 'success'){
                        const v = String(displayVal).toUpperCase();
                        const on = v === 'O';
                        cellValue = `<span class="ox-badge ${on?'on':'off'}" aria-hidden="true">${on?'O':'X'}</span>`;
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
            let next = state.filtered.length;
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
        return String(str).replace(/[&<>'"]/g, function(ch){
            switch(ch){
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                case "'": return '&#39;';
                default: return ch;
            }
        });
    }

    function escapeAttr(str){
        return String(str).replace(/"/g,'&quot;');
    }

    // Pagination UI
    function updatePagination(){
        const infoEl = document.getElementById(PAGINATION_INFO_ID);
        if(infoEl){
            const start = state.filtered.length? (state.page-1)*state.pageSize+1 : 0;
            const end = Math.min(state.filtered.length, state.page*state.pageSize);
            infoEl.textContent = `${start}-${end} / ${state.filtered.length}개 항목`;
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
        const REQUIRED_COLS = new Set(['status','work_date','work_dept','worker','req_dept','requester','vendor','model','serial','success']);
        const groups = [
            { title:'작업 관리', cols:['status','work_date','work_dept','worker','req_dept','requester'] },
            { title:'대상', cols:['vendor','model','serial'] },
            { title:'결과', cols:['success','fail_reason','remark'] }
        ];
        groups.forEach(g=>{
            const section = document.createElement('div'); section.className='form-section';
            section.innerHTML = `<div class="section-header"><h4>${g.title}</h4></div>`;
            const grid = document.createElement('div'); grid.className='form-grid';
            g.cols.forEach(c=>{ if(!COLUMN_META[c]) return; const wrap=document.createElement('div');
                wrap.className = (c === 'remark') ? 'form-row form-row-wide' : 'form-row';
                const labelText = COLUMN_META[c]?.label||c;
                const req = REQUIRED_COLS.has(c) ? ' <span class="required">*</span>' : '';
                wrap.innerHTML=`<label>${labelText}${req}</label>${generateFieldInput(c,row[c],row)}`; grid.appendChild(wrap); });
            section.appendChild(grid); form.appendChild(section);
        });
    }

    function generateFieldInput(col,value='',row){
        // data deletion selects/inputs
        if(col==='status'){
            const v = String(value??'');
            return `<select name="status" class="form-input search-select" required>
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="대기" ${v==='대기'?'selected':''}>대기</option>
                <option value="진행" ${v==='진행'?'selected':''}>진행</option>
                <option value="완료" ${v==='완료'?'selected':''}>완료</option>
            </select>`;
        }
        if(col==='success'){
            const v = String(value??'');
            return `<select name="success" class="form-input search-select" required>
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="O" ${v==='O'?'selected':''}>O</option>
                <option value="X" ${v==='X'?'selected':''}>X</option>
            </select>`;
        }
        if(col==='work_date'){
            const v = String(value??'');
            return `<input type="date" name="work_date" class="form-input date-input" placeholder="YYYY-MM-DD" value="${v}" required>`;
        }
        if(['work_dept','worker','req_dept','requester','vendor','model'].includes(col)){
            // Use canonical FK values for edit forms.
            // Prefer *_code / *_id fields over potentially decorated display values.
            let initial = value;
            if(row && typeof row === 'object'){
                if(col === 'work_dept') initial = row.work_dept_code ?? row.work_dept ?? value;
                else if(col === 'worker') initial = row.worker_id ?? row.worker ?? value;
                else if(col === 'req_dept') initial = row.req_dept_code ?? row.req_dept ?? value;
                else if(col === 'requester') initial = row.requester_id ?? row.requester ?? value;
                else if(col === 'vendor') initial = row.manufacturer_code ?? row.vendor ?? value;
                else if(col === 'model') initial = row.disk_code ?? row.model ?? value;
            }
            const initialStr = (initial == null) ? '' : String(initial).trim();
            const initialLabel = (row && row[`${col}_label`]) ? String(row[`${col}_label`]).trim() : '';
            return fkSelectMarkup(col, initialStr, initialLabel ? { initialLabel } : undefined);
        }
        if(col==='serial'){
            return `<input name="serial" class="form-input" value="${value??''}" required>`;
        }
    if(col==='fail_reason') return `<input name="fail_reason" class="form-input" placeholder="사유" value="${value??''}" disabled>`;
    if(col==='remark') return `<textarea name="remark" class="form-input textarea-large" rows="6" placeholder="비고">${escapeHTML(String(value??''))}</textarea>`;
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
        // Build header labels using only currently visible columns (plus sequence No)
        const headers = ['No', ...COLUMN_ORDER.filter(c=>state.visibleCols.has(c)).map(c=>COLUMN_META[c].label)];
        // Respect current sort order in export (same logic as render)
        let dataForCsv = state.filtered;
        if(state.sortKey){
            const k = state.sortKey; const dir = state.sortDir==='asc'?1:-1;
            dataForCsv = [...state.filtered].sort((a,b)=>{
                let va=a[k], vb=b[k];
                const na = va!=='' && va!=null && !isNaN(va);
                const nb = vb!=='' && vb!=null && !isNaN(vb);
                if(na && nb){ va=parseFloat(va); vb=parseFloat(vb);} else { va=(va==null?'':String(va)).toLowerCase(); vb=(vb==null?'':String(vb)).toLowerCase(); }
                if(va===vb) return 0;
                if(va==='' && vb!=='') return 1; if(vb==='' && va!=='') return -1; return va>vb?dir:-dir;
            });
        }
        // Apply selection scope if specified (modal drives this)
        if(onlySelected === true){
            const selIds = new Set(state.selected);
            dataForCsv = dataForCsv.filter(r=> selIds.has(r.id));
        } // else: all filtered rows
        const visibleCols = COLUMN_ORDER.filter(c=>state.visibleCols.has(c));
        const rows = dataForCsv.map((r,i)=> [i+1, ...visibleCols.map(c=> r[c]??'')]);
        // Escape and join with CRLF for better Windows Excel compatibility
        const lines = [headers, ...rows].map(arr=> arr.map(val=>`"${String(val).replace(/"/g,'""')}"`).join(','));
        const csvCore = lines.join('\r\n');
        // Prepend UTF-8 BOM so that Excel (especially on Windows) correctly detects encoding for Korean text
        const bom = '\uFEFF';
        const csv = bom + csvCore;
        // Dynamic filename: system_list_YYYYMMDD.csv (local date)
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth()+1).padStart(2,'0');
        const dd = String(d.getDate()).padStart(2,'0');
        const filename = `data_deletion_records_${yyyy}${mm}${dd}.csv`;
        const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a); // Safari support
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
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
                    applyFilter();
                    if(searchWrapper){ searchWrapper.classList.remove('active-searching'); }
                    if(searchLoader){ searchLoader.setAttribute('aria-hidden','true'); }
                }, 220); // debounce 220ms
            });
            search.addEventListener('keydown', e=>{
                if(e.key==='Escape'){
                    if(search.value){ search.value=''; state.search=''; updateClearVisibility(); applyFilter(); }
                    search.blur();
                }
            });
        }
        if(clearBtn){
            clearBtn.addEventListener('click', ()=>{
                if(search){ search.value=''; state.search=''; updateClearVisibility(); applyFilter(); search.focus(); }
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
                state.page=1; render();
            });
        }
        document.getElementById(PAGE_NUMBERS_ID)?.addEventListener('click', e=>{ if(e.target.classList.contains('page-btn')){ state.page = parseInt(e.target.dataset.page,10); render(); }});
        ['system-first','system-prev','system-next','system-last'].forEach(id=>{
            const el = document.getElementById(id); if(!el) return; el.addEventListener('click', ()=>{
                const pages = totalPages();
                if(id==='system-first') state.page=1;
                else if(id==='system-prev' && state.page>1) state.page--;
                else if(id==='system-next' && state.page<pages) state.page++;
                else if(id==='system-last') state.page=pages;
                render();
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
        tbodyEl?.addEventListener('click', async e=>{
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
                    await initDatePickers(EDIT_FORM_ID);
                    try {
                        await initFkSelects(EDIT_FORM_ID);
                    } catch(err){
                        console.warn('[DATA_DELETE] edit FK init failed', err);
                    } finally {
                        enhanceFormSearchableSelects(EDIT_FORM_ID);
                        bindDeptMemberConstraints(EDIT_FORM_ID);
                        bindFailReasonToggle(EDIT_FORM_ID);
                    }
                    const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                    if(editSaveEl){ editSaveEl.setAttribute('data-entry-id', row.id ?? ''); }
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
                render();
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
        document.getElementById(ADD_BTN_ID)?.addEventListener('click', async ()=> {
            // Ensure static FK inputs are converted to FK selects (dropbox) before showing the modal.
            try { upgradeStaticFkFields(); } catch(_e){}
            openModal(ADD_MODAL_ID);
            await initDatePickers(ADD_FORM_ID);
            // Show searchable dropdown UI immediately (even if FK options load slowly).
            try { enhanceFormSearchableSelects(ADD_FORM_ID); } catch(_e){}
            try { await initFkSelects(ADD_FORM_ID); }
            catch(err){ console.warn('[DATA_DELETE] add form FK init failed', err); }
            finally {
                enhanceFormSearchableSelects(ADD_FORM_ID);
                bindDeptMemberConstraints(ADD_FORM_ID);
                bindFailReasonToggle(ADD_FORM_ID);
            }
        });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(ADD_FORM_ID);
            if(!form) return;
            if(!ensureFormValidOrMark(form)) return;
            try {
                await createEntryFromForm(form);
                form.reset();
                resetFkSelects(form);
                try { form.classList.remove('show-required-errors'); } catch(_e){}
                closeModal(ADD_MODAL_ID);
                showMessage('삭제 기록이 등록되었습니다.', '완료');
            } catch(err){
                console.error(err);
                showMessage(err.message || '등록 중 오류가 발생했습니다.', '오류');
            }
        });
        // edit modal
        document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(EDIT_FORM_ID);
            const btn = document.getElementById(EDIT_SAVE_ID);
            const entryId = parseInt(btn?.getAttribute('data-entry-id') || '-1', 10);
            if(!form) return;
            if(!ensureFormValidOrMark(form)) return;
            try {
                await updateEntryFromForm(entryId, form);
                try { form.classList.remove('show-required-errors'); } catch(_e){}
                closeModal(EDIT_MODAL_ID);
                showMessage('삭제 기록이 수정되었습니다.', '완료');
            } catch(err){
                console.error(err);
                showMessage(err.message || '수정 중 오류가 발생했습니다.', '오류');
            }
        });
        // csv
        // CSV download: open confirmation modal similar to delete/dispose
        const dlBtn = document.getElementById('system-download-btn');
        if(dlBtn){ dlBtn.addEventListener('click', ()=>{
            // prepare modal state
            const total = state.filtered.length || state.data.length;
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
                    const wide = ['실패사유'];
                    const mid = ['작업부서','작업자','요청부서','요청자','제조사','모델명','일련번호','비고'];
                    if(wide.includes(h)) return { wch: 24 };
                    if(mid.includes(h)) return { wch: 16 };
                    return { wch: 12 };
                });

                // Guide sheet: rules and allowed values (Korean)
                const rules = [
                    ['엑셀 업로드 가이드'],
                    [''],
                    ['작성 규칙'],
                    ['- 첫 행의 컬럼 제목은 아래 순서와 완전히 일치해야 합니다. (순서/이름 변경 불가)'],
                    ['- 상태는 대기/완료 중 하나여야 합니다. 성공여부는 O/X 중 하나여야 합니다.'],
                    ['- 작업일자는 YYYY-MM-DD 형식으로 입력하세요.'],
                    ['- 그 외 항목은 자유롭게 입력하되, 필요 시 공란으로 둘 수 있습니다.'],
                    [''],
                    ['컬럼 순서 (복사/참고용)'],
                    [UPLOAD_HEADERS_KO.join(', ')],
                ];
                const wsGuide = XLSX.utils.aoa_to_sheet(rules);
                wsGuide['!cols'] = [{ wch: 120 }];

                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template');
                XLSX.utils.book_append_sheet(wb, wsGuide, '가이드');
                XLSX.writeFile(wb, 'data_deletion_upload_template.xlsx');
            }catch(e){ console.error(e); showMessage('템플릿 생성 중 오류가 발생했습니다.', '오류'); }
        });
        // confirm upload with parse + validation
        document.getElementById(UPLOAD_CONFIRM_ID)?.addEventListener('click', ()=>{
            showMessage('엑셀 업로드는 서버 연동 준비 중입니다. 추후 업데이트를 기다려주세요.', '안내');
        });
        // stats open
        document.getElementById(STATS_BTN_ID)?.addEventListener('click', ()=>{
            buildStats();
            openModal(STATS_MODAL_ID);
            // align card heights after layout
            requestAnimationFrame(()=> equalizeStatsHeights());
            // keep aligned on resize while open
            window.addEventListener('resize', equalizeStatsHeights);
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

            fetchAllForCurrentQuery()
                .then(async (rows)=>{
                    const mapped = rows.map(adaptServerItem).filter(Boolean);
                    const idSet = new Set(ids);
                    const originals = mapped.filter(r=> idSet.has(r.id));
                    if(!originals.length) throw new Error('선택된 행을 찾을 수 없습니다.');
                    const existingSer = _collectNonEmptyTrimmedSet(mapped, 'serial');
                    const clones = originals.map(o=>{
                        const apiPayload = {};
                        apiPayload.status = o.status || '';
                        apiPayload.work_date = o.work_date || '';
                        apiPayload.work_dept_code = o.work_dept_code || o.work_dept || '';
                        apiPayload.worker_id = o.worker_id ?? o.worker ?? '';
                        if(apiPayload.worker_id !== '') apiPayload.worker_id = parseInt(apiPayload.worker_id, 10) || '';
                        apiPayload.request_dept_code = o.req_dept_code || o.req_dept || '';
                        apiPayload.requester_id = o.requester_id ?? o.requester ?? '';
                        if(apiPayload.requester_id !== '') apiPayload.requester_id = parseInt(apiPayload.requester_id, 10) || '';
                        apiPayload.manufacturer_code = o.manufacturer_code || o.vendor || '';
                        apiPayload.disk_code = o.disk_code || o.model || '';
                        const ser = String(o.serial_number || o.serial || '').trim();
                        apiPayload.serial_number = ser ? _makeUniqueWithNumericSuffix(ser, existingSer) : '';
                        apiPayload.success = o.success || '';
                        apiPayload.failure_reason = o.fail_reason || '';
                        apiPayload.remark = o.remark || '';
                        return apiPayload;
                    });
                    const tasks = clones.map(c=> async ()=>{ await createEntry(c); });
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
            const count = state.selected.size;
            if(count===0){ showMessage('불용처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('dispose-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 기록을 정말 불용처리하시겠습니까?`; }
            openModal(DISPOSE_MODAL_ID);
        });
    document.getElementById(DISPOSE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DISPOSE_MODAL_ID));
        document.getElementById(DISPOSE_CONFIRM_ID)?.addEventListener('click', ()=>{
            // 수집 대상 열 (데이터 삭제 스키마 기준)
            const fields = ['status','work_date','work_dept','worker','req_dept','requester','vendor','model','serial','success','remark','fail_reason'];
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
        // delete (삭제처리)
        document.getElementById(DELETE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('삭제할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('delete-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 기록을 삭제합니다.`; }
            const msg = document.getElementById('delete-msg');
            if(msg){ msg.textContent = `선택한 ${count}개의 기록을 삭제하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById('system-delete-cancel')?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', async ()=>{
            const ids = [...state.selected];
            if(!ids.length){ closeModal(DELETE_MODAL_ID); return; }
            try {
                await deleteEntries(ids);
                state.selected.clear();
                closeModal(DELETE_MODAL_ID);
                showMessage(`${ids.length}개 항목이 삭제되었습니다.`, '완료');
            } catch(err){
                console.error(err);
                showMessage(err.message || '삭제 중 오류가 발생했습니다.', '오류');
            }
        });
        // bulk (일괄변경): 1개 선택 시에는 수정 모달로 전환
        document.getElementById(BULK_BTN_ID)?.addEventListener('click', async ()=>{
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
                await initDatePickers(EDIT_FORM_ID);
                // Ensure searchable dropdown UI is ready immediately.
                try { enhanceFormSearchableSelects(EDIT_FORM_ID); } catch(_e){}
                const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                if(editSaveEl){ editSaveEl.setAttribute('data-entry-id', row.id ?? ''); }
                try {
                    await initFkSelects(EDIT_FORM_ID);
                } catch(err){
                    console.warn('[DATA_DELETE] edit FK init failed', err);
                } finally {
                    enhanceFormSearchableSelects(EDIT_FORM_ID);
                    bindDeptMemberConstraints(EDIT_FORM_ID);
                    bindFailReasonToggle(EDIT_FORM_ID);
                }
                return;
            }
            // 2개 이상 → 일괄변경 모달
            const subtitle = document.getElementById('bulk-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 기록에서 지정한 필드를 일괄 변경합니다.`; }
            buildBulkForm();
            openModal(BULK_MODAL_ID);
            // Show searchable dropdown UI immediately (even if FK options load slowly).
            try { enhanceFormSearchableSelects(BULK_FORM_ID); } catch(_e){}
            initFkSelects(BULK_FORM_ID)
                .catch(err=> console.warn('[DATA_DELETE] bulk FK init failed', err))
                .finally(()=>{
                    try { enhanceFormSearchableSelects(BULK_FORM_ID); } catch(_e){}
                    bindDeptMemberConstraints(BULK_FORM_ID);
                    bindFailReasonToggle(BULK_FORM_ID);
                });
        });
        document.getElementById(BULK_CLOSE_ID)?.addEventListener('click', ()=> closeModal(BULK_MODAL_ID));
        document.getElementById(BULK_APPLY_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(BULK_FORM_ID); if(!form) return;
            const entries = [...form.querySelectorAll('[data-bulk-field]')]
                .map(el=>({ field: el.getAttribute('data-bulk-field'), value: el.value.trim() }))
                .filter(p=> p.value !== '');
            if(!entries.length){ showMessage('변경할 값을 1개 이상 입력하세요.', '안내'); return; }
            const ids = [...state.selected];
            if(!ids.length){ showMessage('선택된 항목이 없습니다.', '안내'); return; }
            try {
                await applyBulkUpdate(ids, entries);
                closeModal(BULK_MODAL_ID);
                showMessage(`${ids.length}개 항목에 일괄 변경이 적용되었습니다.`, '완료');
            } catch(err){
                console.error(err);
                showMessage(err.message || '일괄 변경 중 오류가 발생했습니다.', '오류');
            }
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
            if(col === 'status'){
                return `<select class="form-input search-select" data-bulk-field="status" data-searchable="true">
                    <option value="">선택</option>
                    <option value="대기">대기</option>
                    <option value="진행">진행</option>
                    <option value="완료">완료</option>
                </select>`;
            }
            if(col === 'success'){
                return `<select class="form-input search-select" data-bulk-field="success" data-searchable="true">
                    <option value="">선택</option>
                    <option value="O">O</option>
                    <option value="X">X</option>
                </select>`;
            }
            if(['work_dept','req_dept','worker','requester','vendor','model'].includes(col)){
                const markup = fkSelectMarkup(col, '', { required:false });
                return markup.replace('<select', '<select data-bulk-field="'+col+'"').replace('name="'+col+'"', 'name="'+col+'"');
            }
            if(col === 'fail_reason') return `<input class="form-input" data-bulk-field="fail_reason" placeholder="사유" disabled>`;
            if(col === 'remark') return `<textarea class="form-input textarea-large" data-bulk-field="remark" rows="6" placeholder="비고"></textarea>`;
            if(col === 'work_date') return `<input type="date" class="form-input date-input" data-bulk-field="work_date" placeholder="YYYY-MM-DD">`;
            return `<input class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }
        const GROUPS = [
            { title:'작업 관리', cols:['status','work_date','work_dept','worker','req_dept','requester'] },
            { title:'대상', cols:['vendor','model','serial'] },
            { title:'결과', cols:['success','fail_reason','remark'] }
        ];
        form.innerHTML = GROUPS.map(g=>{
            const fields = g.cols.filter(c=> !EXCLUDE.has(c));
            if(!fields.length) return '';
            const grid = fields.map(col=>{
                const meta = COLUMN_META[col]; if(!meta) return '';
                const wide = (col === 'remark');
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
    // 상태 분포 (요약 섹션)
    renderStatBlock('stats-software', '상태 분포', countBy(rows, 'status'));
    // 부서 분포 섹션
    renderStatBlock('stats-versions', '작업부서 분포', countBy(rows, 'work_dept'));
    renderStatBlock('stats-versions', '요청부서 분포', countBy(rows, 'req_dept'));
        // 성공여부 O/X
        renderStatBlock('stats-check', '성공여부', countBy(rows, 'success'), null, { toggleOX: true });
    }
    }

    // (조건 필터 관련 함수 제거됨)

    async function init(){
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
        upgradeStaticFkFields();
        await initData();
        bindEvents();
        // Re-sync UI controls again after events are bound (ensures clear button is hidden)
        const pageSizeSel2 = document.getElementById(PAGE_SIZE_ID);
        if(pageSizeSel2) pageSizeSel2.value = '10';
        const search2 = document.getElementById(SEARCH_ID);
        if(search2) search2.value = '';
        render();
        // Page adornments (animation + popover)
}
    function runInit(){ init().catch(err=> { console.error('데이터 삭제 페이지 초기화 실패', err); showMessage(err.message || '페이지 초기화 중 오류가 발생했습니다.', '오류'); }); }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', runInit); else runInit();
})();


