/**
 * 비즈니스 관리 페이지 스크립트
 * - 컬럼 토글 (기본 10개 노출)
 * - 로컬(in-memory) 데이터 렌더링 + 페이징 + 검색
 * - 모달 (등록/수정/컬럼 선택)
 * - CSV 다운로드 (현재 페이지 or 전체)
 * NOTE: 실데이터는 /api/work-groups REST API를 통해 불러옵니다.
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
        const startEl = form.querySelector('[name="lic_period_start"]');
        const endEl = form.querySelector('[name="lic_period_end"]');
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
        if(startEl && !startEl._flatpickr){ window.flatpickr(startEl, opts); }
        if(endEl && !endEl._flatpickr){ window.flatpickr(endEl, opts); }
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
    // Upload template (Work Group schema)
    const UPLOAD_HEADERS_KO = [
        '업무 그룹','업무 코드','하드웨어(수량)','소프트웨어(수량)','담당 부서','업무 상태','업무 우선순위','비고'
    ];
    const HEADER_KO_TO_KEY = {
        '업무 그룹':'wc_name',
        // Legacy support
        '업무 분류':'wc_name',
    '업무 코드':'group_code',
    '업무 설명':'wc_desc',
    '설명':'wc_desc',
        '하드웨어(수량)':'hw_count',
        '소프트웨어(수량)':'sw_count',
        '담당 부서':'sys_dept',
        '업무 상태':'work_status',
        '업무 우선순위':'work_priority',
        '비고':'note'
    };
    // Accept legacy header order as well
    const ALT_UPLOAD_HEADERS_KO = ['업무 분류','설명','하드웨어(수량)','소프트웨어(수량)','담당 부서','업무 상태','업무 우선순위','비고'];
    const ENUM_SETS = { };
    const API_ENDPOINT = '/api/work-groups';
    const ORG_DEPARTMENTS_ENDPOINT = '/api/org-departments';
    const WORK_STATUSES_ENDPOINT = '/api/work-statuses';
    const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };
    // Ensure the searchable-select helper is available before opening modals.
    // Some users can click very quickly before blossom.js finishes injecting the helper.
    function ensureSearchableSelectLoaded(){
        try {
            if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
                return Promise.resolve();
            }
            const existing = document.querySelector('script[src*="/static/js/ui/searchable_select.js"]');
            if(existing){
                return new Promise((resolve)=>{
                    existing.addEventListener('load', ()=> resolve(), { once:true });
                    // If it already loaded but the global isn't set for some reason, resolve anyway.
                    setTimeout(()=> resolve(), 350);
                });
            }
            return new Promise((resolve)=>{
                const script = document.createElement('script');
                script.src = '/static/js/ui/searchable_select.js?v=1.0.3';
                script.defer = true;
                script.onload = ()=> resolve();
                script.onerror = ()=> resolve();
                document.head.appendChild(script);
            });
        } catch(_e){
            return Promise.resolve();
        }
    }

    // Lookup caches for modal dropdowns
    const LOOKUPS = {
        departments: null, // [{ dept_code, dept_name }]
        statuses: null,    // [{ status_code, status_name }]
        deptNameByCode: null,
        deptCodeByName: null,
        statusNameByCode: null,
        statusCodeByName: null,
        statusColorByCode: null,
        loadPromise: null
    };

    function normalizeLookupKey(val){
        return String(val ?? '').trim().toLowerCase();
    }
    function hasDuplicateWorkGroupName(name, excludeId){
        const target = normalizeLookupKey(name);
        if(!target) return false;
        return state.data.some(row=>{
            const rowId = Number(row && row.id);
            if(excludeId != null && Number.isFinite(rowId) && rowId === Number(excludeId)) return false;
            return normalizeLookupKey(row && row.wc_name) === target;
        });
    }

    function rebuildLookupMaps(){
        // Build name<->code maps so UI can display names but persist codes (FK-safe)
        const deptNameByCode = Object.create(null);
        const deptCodeByName = Object.create(null);
        (LOOKUPS.departments || []).forEach(d=>{
            const code = String(d.dept_code ?? '').trim();
            const name = String(d.dept_name ?? '').trim();
            if(code) deptNameByCode[code] = name || code;
            if(code) deptCodeByName[normalizeLookupKey(code)] = code;
            if(name) deptCodeByName[normalizeLookupKey(name)] = code;
        });

        const statusNameByCode = Object.create(null);
        const statusCodeByName = Object.create(null);
        const statusColorByCode = Object.create(null);
        (LOOKUPS.statuses || []).forEach(s=>{
            const code = String(s.status_code ?? '').trim();
            const name = String(s.status_name ?? '').trim();
            const color = String((s.wc_color ?? s.status_level ?? '')).trim();
            if(code) statusNameByCode[code] = name || code;
            if(code) statusCodeByName[normalizeLookupKey(code)] = code;
            if(name) statusCodeByName[normalizeLookupKey(name)] = code;
            if(code && color) statusColorByCode[code] = color;
        });

        LOOKUPS.deptNameByCode = deptNameByCode;
        LOOKUPS.deptCodeByName = deptCodeByName;
        LOOKUPS.statusNameByCode = statusNameByCode;
        LOOKUPS.statusCodeByName = statusCodeByName;
        LOOKUPS.statusColorByCode = statusColorByCode;
    }

    async function fetchOrgDepartments(){
        const response = await fetch(`${ORG_DEPARTMENTS_ENDPOINT}?_=${Date.now()}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin'
        });
        const json = await response.json().catch(()=> ({}));
        if(!response.ok || json.success === false){
            throw new Error(json?.message || '부서 목록을 불러오지 못했습니다.');
        }
        const items = Array.isArray(json.items) ? json.items : [];
        const mapped = items.map((r)=>({
            dept_code: String(r.dept_code ?? r.deptCode ?? '').trim(),
            dept_name: String(r.dept_name ?? r.deptName ?? r.name ?? '').trim()
        })).filter(r=> r.dept_code && r.dept_name);
        mapped.sort((a,b)=> a.dept_name.localeCompare(b.dept_name,'ko-KR'));
        return mapped;
    }

    async function fetchWorkStatuses(){
        const response = await fetch(`${WORK_STATUSES_ENDPOINT}?_=${Date.now()}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin'
        });
        const json = await response.json().catch(()=> ({}));
        if(!response.ok || json.success === false){
            throw new Error(json?.message || '업무 상태 목록을 불러오지 못했습니다.');
        }
        const items = Array.isArray(json.items) ? json.items : [];
        const mapped = items.map((r)=>(
            {
                status_code: String(r.status_code ?? r.code ?? '').trim(),
                status_name: String(r.status_name ?? r.wc_name ?? r.name ?? '').trim(),
                // status tab stores wc_color as a CSS class (e.g. ws-run, ws-c3)
                wc_color: String(r.wc_color ?? r.status_level ?? '').trim()
            }
        )).filter(r=> r.status_code && r.status_name);
        mapped.sort((a,b)=> a.status_name.localeCompare(b.status_name,'ko-KR'));
        return mapped;
    }

    function ensureLookupsLoaded(){
        if(LOOKUPS.departments && LOOKUPS.statuses){
            return Promise.resolve({ departments: LOOKUPS.departments, statuses: LOOKUPS.statuses });
        }
        if(LOOKUPS.loadPromise) return LOOKUPS.loadPromise;
        LOOKUPS.loadPromise = (async()=>{
            const [departments, statuses] = await Promise.all([
                fetchOrgDepartments().catch((e)=>{ console.warn(e); return []; }),
                fetchWorkStatuses().catch((e)=>{ console.warn(e); return []; })
            ]);
            LOOKUPS.departments = departments;
            LOOKUPS.statuses = statuses;
            rebuildLookupMaps();
            return { departments, statuses };
        })();
        return LOOKUPS.loadPromise;
    }

    function setSelectOptions(select, options, getValue, getLabel){
        if(!select) return;
        const prev = String(select.value || '');
        let html = `<option value="">선택</option>`;
        (options || []).forEach(opt=>{
            const v = String(getValue(opt) || '').trim();
            const t = String(getLabel(opt) || '').trim();
            if(!v || !t) return;
            html += `<option value="${escapeHTML(v)}">${escapeHTML(t)}</option>`;
        });
        select.innerHTML = html;
        if(prev) select.value = prev;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        try {
            if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
                window.BlossomSearchableSelect.enhance(select.closest('.modal-overlay-full') || select);
            }
        } catch(_e){}
    }

    function populateAddModalSelects(){
        const form = document.getElementById(ADD_FORM_ID);
        if(!form) return;
        const deptSel = form.querySelector('select[name="sys_dept"]');
        const statusSel = form.querySelector('select[name="work_status"]');
        // Only overwrite existing options when the lookup list is non-empty.
        // This prevents wiping the fallback static options in templates when an API returns non-JSON/empty payload.
        if((LOOKUPS.departments || []).length){
            setSelectOptions(deptSel, LOOKUPS.departments || [], (r)=>r.dept_code, (r)=>r.dept_name);
        }
        if((LOOKUPS.statuses || []).length){
            setSelectOptions(statusSel, LOOKUPS.statuses || [], (r)=>r.status_code, (r)=>r.status_name);
        }
    }

    function getDisplayValue(row, col){
        if(!row) return '';
        const raw = row[col];
        if(raw == null) return raw;
        const key = String(raw).trim();
        if(key === '') return raw;
        if(col === 'sys_dept'){
            if(LOOKUPS.deptNameByCode && LOOKUPS.deptNameByCode[key]){
                return LOOKUPS.deptNameByCode[key];
            }
            // Fallback: API may include dept name even when dept lookup endpoint is unavailable.
            // Keep stored value as code (`sys_dept`) but display a friendly label when possible.
            const apiName = (row.sys_dept_name ?? row.dept_name);
            const txt = (apiName == null ? '' : String(apiName).trim());
            return txt ? txt : raw;
        }
        if(col === 'work_status'){
            return (LOOKUPS.statusNameByCode && LOOKUPS.statusNameByCode[key]) ? LOOKUPS.statusNameByCode[key] : raw;
        }
        return raw;
    }

    function normalizeWorkGroupRow(row){
        if(!row) return {};
        const toInt = (val)=>{
            const n = parseInt(val,10);
            return Number.isFinite(n) ? n : 0;
        };
        const toId = (val)=>{
            const n = parseInt(val,10);
            return Number.isFinite(n) ? n : null;
        };
        const text = (val)=> (val==null ? '' : String(val).trim());
        const wcName = row.group_name ?? row.wc_name;
        const desc = row.description ?? row.wc_desc;
        const status = row.status_code ?? row.work_status;
        const dept = row.dept_code ?? row.sys_dept;
        const deptName = row.dept_name ?? row.sys_dept_name;
        const priority = row.priority ?? row.work_priority;
        const note = row.remark ?? row.note;
        return {
            id: toId(row.id),
            group_code: text(row.group_code),
            wc_name: text(wcName),
            wc_desc: text(desc),
            work_status: text(status),
            sys_dept: text(dept),
            sys_dept_name: text(deptName),
            hw_count: toInt(row.hw_count),
            sw_count: toInt(row.sw_count),
            work_priority: toInt(priority),
            note: text(note),
            created_at: row.created_at || '',
            created_by: row.created_by || '',
            updated_at: row.updated_at || '',
            updated_by: row.updated_by || ''
        };
    }

    async function fetchWorkGroupList(){
        const response = await fetch(`${API_ENDPOINT}?_=${Date.now()}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin'
        });
        const json = await response.json().catch(()=> ({}));
        if(!response.ok || json.success === false){
            throw new Error(json?.message || '업무 그룹 목록을 불러오지 못했습니다.');
        }
        const items = Array.isArray(json.items) ? json.items : [];
        return items.map(normalizeWorkGroupRow);
    }

    async function createWorkGroup(payload){
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: JSON_HEADERS,
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        });
        const json = await response.json().catch(()=> ({}));
        if(!response.ok || json.success === false){
            throw new Error(json?.message || '업무 그룹 등록에 실패했습니다.');
        }
        return normalizeWorkGroupRow(json.item || {});
    }

    async function updateWorkGroup(id, payload){
        const response = await fetch(`${API_ENDPOINT}/${id}`, {
            method: 'PUT',
            headers: JSON_HEADERS,
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        });
        const json = await response.json().catch(()=> ({}));
        if(!response.ok || json.success === false){
            throw new Error(json?.message || '업무 그룹 수정에 실패했습니다.');
        }
        return normalizeWorkGroupRow(json.item || {});
    }

    async function deleteWorkGroups(ids){
        const response = await fetch(`${API_ENDPOINT}/bulk-delete`, {
            method: 'POST',
            headers: JSON_HEADERS,
            credentials: 'same-origin',
            body: JSON.stringify({ ids })
        });
        const json = await response.json().catch(()=> ({}));
        if(!response.ok || json.success === false){
            throw new Error(json?.message || '업무 그룹 삭제에 실패했습니다.');
        }
        return json;
    }
    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
    function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }

    // Data + State
    // NOTE: '업무 코드(group_code)'를 리스트 테이블에서도 표시합니다.
    const BASE_VISIBLE_COLUMNS = [
        // 화면 표에서는 체크박스 다음에 '업무 상태'를 먼저 보여줍니다
        // NOTE: '비고(note)'는 모달/DB에만 저장하고 리스트에서는 표시하지 않습니다.
        'work_status','wc_name','group_code','hw_count','sw_count','sys_dept','work_priority'
    ];
    const COLUMN_ORDER = [
        // 렌더 순서도 헤더와 동일하게 맞춥니다 (체크박스 제외)
        'work_status','wc_name','group_code','hw_count','sw_count','sys_dept','work_priority'
    ];

    // 검색은 표시 여부와 무관하게 description까지 포함 (화면에서는 숨김)
    const SEARCH_COLUMNS = [
        'work_status','wc_name','group_code','hw_count','sw_count','sys_dept','work_priority'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '업무 분류', columns: ['wc_name','group_code','hw_count','sw_count','sys_dept','work_status','work_priority'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        wc_name:{label:'업무 그룹',group:'업무 그룹'},
        group_code:{label:'업무 코드',group:'업무 그룹'},
        hw_count:{label:'하드웨어(수량)',group:'업무 그룹'},
        sw_count:{label:'소프트웨어(수량)',group:'업무 그룹'},
        sys_dept:{label:'담당 부서',group:'업무 그룹'},
        work_status:{label:'업무 상태',group:'업무 그룹'},
        work_priority:{label:'업무 우선순위',group:'업무 그룹'},
        note:{label:'비고',group:'업무 그룹'},
        // note is kept for modal/DB, but excluded from list rendering/CSV/search.
    };

    let state = {
        data: [],
        filtered: [],
        pageSize: 10,
        page: 1,
        visibleCols: new Set(BASE_VISIBLE_COLUMNS),
        search: '',
        // 선택된 행 (row id 기반) 저장하여 리렌더 후에도 유지
        selected: new Set(),
        sortKey: null,
        sortDir: 'asc',
        columnFilters: {}, // { col: value | [values...] } (조건 필터 기능 제거 예정 - 빈 유지)
        isLoading: false,
        lastError: null
    };

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;

    async function refreshWorkGroups(){
        try {
            state.isLoading = true;
            state.lastError = null;
            render();
            const rows = await fetchWorkGroupList();
            state.data = rows;
            state.selected.clear();
        } catch(err){
            console.error(err);
            state.lastError = err.message || '업무 그룹 데이터를 불러오는 중 오류가 발생했습니다.';
            showMessage(state.lastError, '오류');
        } finally {
            state.isLoading = false;
            applyFilter();
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
        // Search only across list columns (exclude note)
        const searchCols = SEARCH_COLUMNS;
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
                        const v = getDisplayValue(row, col); if(v==null) return false;
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
                const cell = String(getDisplayValue(row, col) ?? '');
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

    function render(highlightContext){
        const tbody = document.getElementById(TBODY_ID);
        if(!tbody) return;
        tbody.innerHTML='';
        const tableEl = document.getElementById(TABLE_ID);
        // 정렬 적용 (필터 결과에 대해)
        let working = state.filtered;
        if(state.sortKey){
            const k = state.sortKey;
            const dir = state.sortDir==='asc'?1:-1;
            working = [...state.filtered].sort((a,b)=>{
                let va=getDisplayValue(a,k), vb=getDisplayValue(b,k);
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
                if(tableEl) tableEl.hidden = true;
                // 검색어가 있을 때와 데이터 자체가 없을 때 메시지 구분
                const titleEl = document.getElementById('system-empty-title');
                const descEl = document.getElementById('system-empty-desc');
                if(state.isLoading){
                    if(titleEl) titleEl.textContent = '';
                    if(descEl) descEl.textContent = '';
                } else if(state.lastError){
                    if(titleEl) titleEl.textContent = '데이터를 불러오지 못했습니다.';
                    if(descEl) descEl.textContent = state.lastError;
                } else if(state.search.trim()){
                    if(titleEl) titleEl.textContent = '검색 결과가 없습니다.';
                    if(descEl) descEl.textContent = '검색어를 변경하거나 필터를 초기화하세요.';
                } else {
                    if(titleEl) titleEl.textContent = '업무 그룹 내역이 없습니다.';
                    if(descEl) descEl.textContent = "우측 상단 '추가' 버튼을 눌러 첫 업무 그룹을 등록하세요.";
                }
            }
        } else if(emptyEl){
            // 데이터가 존재하면 항상 숨김
            emptyEl.hidden = true;
            if(tableEl) tableEl.hidden = false;
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
        function statusDotClass(name){
            const v = String(name||'').trim();
            if(v==='가동') return 'ws-run';
            if(v==='유휴') return 'ws-idle';
            if(v==='대기') return 'ws-wait';
            if(v==='점검') return 'ws-wait';
            return '';
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
                    if(col==='group_code' && typeof rawVal==='string'){
                        // single-line for table display
                        rawVal = rawVal.replace(/\r?\n|\r/g,' ');
                    }
                    const displayVal = (rawVal==null || String(rawVal).trim()==='') ? '-' : rawVal;
                    let cellValue = highlight(displayVal, col);
                    if(col === 'work_status'){
                        const code = String(row.work_status || '').trim();
                        const cls = (LOOKUPS.statusColorByCode && code && LOOKUPS.statusColorByCode[code])
                            ? LOOKUPS.statusColorByCode[code]
                            : (statusDotClass(displayVal) || 'ws-wait');
                        const text = escapeHTML(String(displayVal));
                        cellValue = `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${text}</span></span>`;
                    }
                    // 업무 그룹명: 상세 페이지 링크 처리 (동적 라우팅)
                    if(col === 'wc_name'){
                        const detailHref = (window.__CAT_BUSINESS_GROUP_DETAIL_URL || '/p/cat_business_group_detail');
                        const nameHtml = highlight(displayVal, col);
                        cellValue = `<a href="${detailHref}" class="work-name-link" data-id="${row.id??''}" title="상세 보기">${nameHtml}</a>`;
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
        return String(str).replace(/[&<>'"]/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[s]));
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
        if(contentEl){
            contentEl.textContent = String(message || '');
            contentEl.style.whiteSpace = 'pre-line';
        }
        const modalEl = document.getElementById(modalId);
        const contentWrap = modalEl ? modalEl.querySelector('.server-add-content') : null;
        if(contentWrap){
            contentWrap.style.width = '620px';
            contentWrap.style.maxWidth = 'min(calc(100vw - 24px), 620px)';
        }
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
        try { localStorage.setItem('work_group_visible_cols', JSON.stringify([...state.visibleCols])); } catch(e){}
    }
    function loadColumnSelection(){
        try {
            // Prefer new key; fall back to legacy keys if present
            let raw = localStorage.getItem('work_group_visible_cols');
            if(!raw){ raw = localStorage.getItem('system_visible_cols') || localStorage.getItem('work_class_visible_cols'); }
            if(!raw) return; // nothing stored, keep defaults
            let parsed = [];
            try { parsed = JSON.parse(raw); } catch(_e) { parsed = []; }
            if(!Array.isArray(parsed)) parsed = [];
            // Sanitize: keep only known columns; de-dup
            const allowed = new Set(Object.keys(COLUMN_META));
            const filtered = [...new Set(parsed.filter(k => allowed.has(String(k))))];
            if(filtered.length > 0){
                state.visibleCols = new Set(filtered);
                // persist sanitized version
                try { localStorage.setItem('work_group_visible_cols', JSON.stringify([...state.visibleCols])); } catch(_e){}
            } else {
                // Stored value was empty or invalid — fall back to defaults and persist
                state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
                try { localStorage.setItem('work_group_visible_cols', JSON.stringify([...state.visibleCols])); } catch(_e){}
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
    const MIN_COLS = 2;
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
            // 모달: '업무 상태'를 '업무 그룹' 앞에 배치하고, 하드웨어/소프트웨어 수량 필드는 제외합니다
            { title:'업무 그룹', cols:['work_status','wc_name','group_code','sys_dept','work_priority'] }
        ];
        groups.forEach(g=>{
            const section = document.createElement('div'); section.className='form-section';
            section.innerHTML = `<div class="section-header"><h4>${g.title}</h4></div>`;
            const grid = document.createElement('div'); grid.className='form-grid';
            g.cols.forEach(c=>{ if(!COLUMN_META[c]) return; const wrap=document.createElement('div');
                wrap.className = 'form-row';
                const labelText = COLUMN_META[c]?.label||c;
                wrap.innerHTML=`<label>${labelText}</label>${generateFieldInput(c,row[c])}`; grid.appendChild(wrap); });
            section.appendChild(grid);
            if(COLUMN_META.note){
                const noteWrap = document.createElement('div');
                noteWrap.className = 'form-row';
                noteWrap.innerHTML = `<label>${COLUMN_META.note.label || '비고'}</label>${generateFieldInput('note', row?.note)}`;
                section.appendChild(noteWrap);
            }
            form.appendChild(section);
        });

        // Keep counts unchanged (hidden in modal)
        const hw = document.createElement('input');
        hw.type = 'hidden';
        hw.name = 'hw_count';
        hw.value = (row && row.hw_count != null) ? String(row.hw_count) : '';
        form.appendChild(hw);
        const sw = document.createElement('input');
        sw.type = 'hidden';
        sw.name = 'sw_count';
        sw.value = (row && row.sw_count != null) ? String(row.sw_count) : '';
        form.appendChild(sw);
    }

    function generateFieldInput(col,value=''){
        if(col==='wc_name'){
            return `<input name="wc_name" class="form-input" value="${value??''}" required>`;
        }
        if(col==='note'){
            return `<textarea name="${col}" class="form-input textarea-large" rows="6">${value??''}</textarea>`;
        }
        if(col==='group_code'){
            return `<input name="group_code" class="form-input" value="${value??''}" placeholder="업무 코드">`;
        }
        if(col==='hw_count' || col==='sw_count'){
            return `<input name="${col}" type="number" min="0" step="1" class="form-input" value="${value??''}" placeholder="숫자만">`;
        }
        if(col==='sys_dept'){
            const selected = String(value ?? '').trim();
            const opts = (LOOKUPS.departments || []).map(r=>{
                const v = escapeHTML(r.dept_code);
                const t = escapeHTML(r.dept_name);
                const sel = (r.dept_code === selected) ? ' selected' : '';
                return `<option value="${v}"${sel}>${t}</option>`;
            }).join('');
            return `<select name="sys_dept" class="form-input search-select" data-placeholder="담당 부서 선택" required>`+
                `<option value="">선택</option>`+
                `${opts}`+
                `</select>`;
        }
        if(col==='work_status'){
            const selected = String(value ?? '').trim();
            const options = (LOOKUPS.statuses || []).map(r=>{
                const v = String(r.status_code ?? '').trim();
                const t = String(r.status_name ?? '').trim();
                if(!v || !t) return '';
                const sel = (v === selected) ? ' selected' : '';
                return `<option value="${escapeHTML(v)}"${sel}>${escapeHTML(t)}</option>`;
            }).join('');
            return `<select name="work_status" class="form-input search-select" data-placeholder="업무 상태 선택" required>`+
                `<option value="">선택</option>`+
                `${options}`+
                `</select>`;
        }
        if(col==='work_priority'){
            return `<input name="work_priority" type="number" min="0" step="1" class="form-input" value="${value??''}" placeholder="업무 우선순위(숫자)">`;
        }
        return `<input name="${col}" class="form-input" value="${value??''}">`;
    }

    // Live-sync helpers for license fields in Add/Edit forms
    function attachLicenseLiveSync(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        if(form.dataset.licLiveSyncAttached === '1'){
            // already wired
            return;
        }
        const totalEl = form.querySelector('[name="lic_total"]');
        const assignedEl = form.querySelector('[name="lic_assigned"]');
        const idleEl = form.querySelector('[name="lic_idle"]');
    const startEl = form.querySelector('[name="lic_period_start"]');
    const endEl = form.querySelector('[name="lic_period_end"]');
    const hiddenPeriodEl = form.querySelector('[name="lic_period"]');

        function toInt(v){ const n = parseInt((v??'').toString(), 10); return isNaN(n) ? 0 : n; }
        function recomputeIdle(){
            if(!idleEl) return;
            const t = toInt(totalEl?.value);
            const a = toInt(assignedEl?.value);
            const idle = Math.max(0, t - a);
            idleEl.value = idle.toString();
        }
        function recomputePeriod(){ /* removed field */ }
        // Bind events (use 'input' for numbers for immediate feedback, 'change' for dates)
        totalEl?.addEventListener('input', recomputeIdle);
        assignedEl?.addEventListener('input', recomputeIdle);
        // lic_period removed
        // Initial compute on attach
        recomputeIdle();
        // recomputePeriod removed
        form.dataset.licLiveSyncAttached = '1';
    }

    function attachSecurityScoreRecalc(formId){
        const form=document.getElementById(formId); if(!form) return; const scoreInput=form.querySelector('input[name="security_score"]'); if(!scoreInput) return;
        function recompute(){
            const c=parseInt(form.querySelector('[name="confidentiality"]').value||'0',10)||0;
            const i=parseInt(form.querySelector('[name="integrity"]').value||'0',10)||0;
            const a=parseInt(form.querySelector('[name="availability"]').value||'0',10)||0;
            const total=c+i+a; scoreInput.value= total? total: '';
            // Optionally auto-pick system_grade
            const gradeField=form.querySelector('[name="system_grade"]'); if(gradeField){ if(total>=8) gradeField.value='1등급'; else if(total>=6) gradeField.value='2등급'; else if(total>0) gradeField.value='3등급'; }
        }
        ['confidentiality','integrity','availability'].forEach(n=> form.querySelector(`[name="${n}"]`)?.addEventListener('change',recompute));
        recompute();
    }
    // When virtualization is '가상', coerce specific fields to '-'
    function enforceVirtualizationDash(form){
        if(!form) return;
        const virt = form.querySelector('[name="virtualization"]');
        if(!virt) return;
        const v = String(virt.value || '').trim();
        const dashTargetsText = ['vendor','model','serial','location_pos'];
        const dashTargetsNumber = ['slot','u_size'];
        const makeDash = (el)=>{ if(!el) return; el.value='-'; };
        const clearIfDash = (el, fallbackType)=>{
            if(!el) return;
            if(el.value === '-') el.value = '';
            if(fallbackType){ try{ el.type = fallbackType; }catch(_){} }
        };
        if(v === '가상'){
            // text-like fields
            dashTargetsText.forEach(name=>{ const el=form.querySelector(`[name="${name}"]`); if(el) makeDash(el); });
            // number fields: switch to text to visibly show '-'
            dashTargetsNumber.forEach(name=>{
                const el=form.querySelector(`[name="${name}"]`);
                if(!el) return;
                // remember original type in dataset
                if(!el.dataset.origType){ el.dataset.origType = el.type || 'number'; }
                try{ el.type = 'text'; }catch(_e){}
                makeDash(el);
            });
        } else {
            // restore only if currently '-' so we don't wipe user inputs
            dashTargetsText.forEach(name=>{ const el=form.querySelector(`[name="${name}"]`); if(el) clearIfDash(el); });
            dashTargetsNumber.forEach(name=>{
                const el=form.querySelector(`[name="${name}"]`);
                if(!el) return;
                const orig = el.dataset.origType || 'number';
                clearIfDash(el, orig);
                // ensure numeric attributes exist when back to number
                if(el.type === 'number'){
                    el.min = '0'; el.step = '1';
                }
            });
        }
    }

    function attachVirtualizationHandler(formId){
        const form = document.getElementById(formId); if(!form) return;
        const virtSel = form.querySelector('[name="virtualization"]'); if(!virtSel) return;
        virtSel.addEventListener('change', ()=> enforceVirtualizationDash(form));
        // initial enforcement
        enforceVirtualizationDash(form);
    }

    function buildWorkGroupPayload(source, options){
        const opts = options || {};
        const partial = !!opts.partial;
        const payload = {};
        if(!source) return payload;
        const stringKeys = ['wc_name','wc_desc','sys_dept','work_status','note','group_code','description','remark','status_code','dept_code'];
        stringKeys.forEach(key=>{
            if(!(key in source)) return;
            const raw = source[key];
            const val = typeof raw === 'string' ? raw.trim() : (raw ?? '');
            if(partial && val === '') return;
            payload[key] = val;
        });
        const numberKeys = ['hw_count','sw_count','work_priority','staff_count','member_count'];
        numberKeys.forEach(key=>{
            if(!(key in source)) return;
            const raw = source[key];
            const val = typeof raw === 'number' ? raw : toIntOrBlank(raw);
            if(partial && (val === '' || val == null)) return;
            payload[key] = val;
        });
        if(payload.wc_name && !payload.group_name){ payload.group_name = payload.wc_name; }
        if(payload.wc_desc && !payload.description){ payload.description = payload.wc_desc; }
        if(payload.work_status && !payload.status_code){ payload.status_code = payload.work_status; }
        if(payload.sys_dept && !payload.dept_code){ payload.dept_code = payload.sys_dept; }
        if(payload.note && !payload.remark){ payload.remark = payload.note; }
        if(payload.work_priority != null && payload.work_priority !== '' && !payload.priority){ payload.priority = payload.work_priority; }
        if(payload.staff_count != null && payload.staff_count !== '' && !payload.member_count){ payload.member_count = payload.staff_count; }

        // Coerce to reference codes if user provided display names
        try {
            const deptRaw = String(payload.dept_code || payload.sys_dept || '').trim();
            if(deptRaw){
                const deptCode = (LOOKUPS.deptCodeByName && LOOKUPS.deptCodeByName[normalizeLookupKey(deptRaw)]) ? LOOKUPS.deptCodeByName[normalizeLookupKey(deptRaw)] : deptRaw;
                payload.dept_code = deptCode;
                payload.sys_dept = deptCode;
            }
            const statusRaw = String(payload.status_code || payload.work_status || '').trim();
            if(statusRaw){
                const statusCode = (LOOKUPS.statusCodeByName && LOOKUPS.statusCodeByName[normalizeLookupKey(statusRaw)]) ? LOOKUPS.statusCodeByName[normalizeLookupKey(statusRaw)] : statusRaw;
                payload.status_code = statusCode;
                payload.work_status = statusCode;
            }
        } catch(_e){}
        return payload;
    }

    function validateWorkGroupPayload(payload, options){
        const opts = options || {};
        const required = [
            { key: 'wc_name', label: '업무 그룹' },
            { key: 'work_status', label: '업무 상태' },
            { key: 'sys_dept', label: '담당 부서' }
        ];
        const missing = required.filter(item => !String(payload[item.key] || '').trim());
        if(missing.length){
            if(!opts.silent){
                const names = missing.map(m=> m.label).join(', ');
                showMessage(`${names} 항목을 입력하세요.`, '안내');
            }
            return false;
        }
        return true;
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
        const rows = dataForCsv.map((r,i)=> [i+1, ...visibleCols.map(c=> getDisplayValue(r,c) ?? '')]);
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
    const filename = `work_group_list_${yyyy}${mm}${dd}.csv`;
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
        function updateClearVisibility(){
            if(!clearBtn) return;
            clearBtn.classList.toggle('visible', !!(search && search.value));
        }
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
        tbodyEl?.addEventListener('click', async (e)=>{
            // 업무 그룹 이름 링크 클릭 처리 (컨텍스트 저장 + 파라미터 부여 후 이동)
            const nameLink = e.target.closest('.work-name-link');
            if(nameLink){
                e.preventDefault();
                const rid = parseInt(nameLink.getAttribute('data-id'),10);
                const row = state.data.find(r=> r.id === rid);
                if(row){
                    const payload = {
                        id: row.id != null ? String(row.id) : '',
                        group_id: row.id != null ? String(row.id) : '',
                        work_status: row.work_status || '',
                        wc_name: row.wc_name || '',
                        wc_desc: row.wc_desc || '',
                        group_code: row.group_code || '',
                        hw_count: row.hw_count != null ? String(row.hw_count) : '',
                        sw_count: row.sw_count != null ? String(row.sw_count) : '',
                        sys_dept: row.sys_dept || '',
                        work_priority: row.work_priority != null ? String(row.work_priority) : '',
                        note: row.note || ''
                    };
                    try { sessionStorage.setItem('work_group_selected_row', JSON.stringify(payload)); } catch(_e){}
                    const base = (window.__CAT_BUSINESS_GROUP_DETAIL_URL || '/p/cat_business_group_detail');
                    const params = new URLSearchParams();
                    Object.entries(payload).forEach(([k,v])=> params.set(k, v));
                    // Send model/vendor for server-side session title/subtitle
                    if(payload.wc_name) params.set('model', payload.wc_name);
                    if(payload.group_code) params.set('vendor', payload.group_code);
                    blsSpaNavigate(`${base}?${params.toString()}`);
                }
                return; // 링크 클릭 시 다른 처리 중단
            }
            const btn = e.target.closest('.action-btn');
            if(btn){
                const rid = parseInt(btn.getAttribute('data-id'),10);
                const realIndex = state.data.findIndex(r=>r.id===rid);
                if(realIndex===-1) return;
                const row = state.data[realIndex];
                const action = btn.getAttribute('data-action');
                if(action==='edit'){
                    try {
                        await ensureSearchableSelectLoaded();
                        await ensureLookupsLoaded();
                    } catch(err){
                        console.error(err);
                        showMessage(err?.message || '부서/업무 상태 목록을 불러오지 못했습니다.', '오류');
                        return;
                    }
                    fillEditForm(row);
                    openModal(EDIT_MODAL_ID);
                    try { window.BlossomSearchableSelect?.enhance(document.getElementById(EDIT_MODAL_ID) || document); } catch(_e){}
                    // live-sync for license fields within edit form
                    attachLicenseLiveSync(EDIT_FORM_ID);
                    // enhance date inputs with Flatpickr
                    initDatePickers(EDIT_FORM_ID);
                    const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                    if(editSaveEl){ editSaveEl.setAttribute('data-id', row.id || ''); }
                }
                return; // 액션 버튼 클릭 처리 후 종료
            }
            // 업무 그룹 이름 링크 클릭 시에는 행 선택 토글 방지 (상세 페이지 이동 우선)
            if(e.target.closest('a.work-name-link')) return;
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
            // Show the modal immediately so the button never feels "dead".
            openModal(ADD_MODAL_ID);
            try { window.BlossomSearchableSelect?.enhance(document.getElementById(ADD_MODAL_ID) || document); } catch(_e){}

            // Then load lookups / searchable-select enhancements.
            try {
                await ensureSearchableSelectLoaded();
                await ensureLookupsLoaded();
                populateAddModalSelects();
                try { window.BlossomSearchableSelect?.syncAll?.(document.getElementById(ADD_MODAL_ID) || document); } catch(_e){}
            } catch(err){
                console.error(err);
                showMessage(err?.message || '부서/업무 상태 목록을 불러오지 못했습니다.', '오류');
            }
        });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(ADD_FORM_ID);
            if(!form) return;
            if(!form.checkValidity()){ form.reportValidity(); return; }
            const data = collectForm(form);
            data.hw_count = toIntOrBlank(data.hw_count);
            data.sw_count = toIntOrBlank(data.sw_count);
            data.work_priority = toIntOrBlank(data.work_priority);
            data.staff_count = toIntOrBlank(data.staff_count);
            data.member_count = toIntOrBlank(data.member_count);
            const payload = buildWorkGroupPayload(data);
            if(!validateWorkGroupPayload(payload)) return;
            if(hasDuplicateWorkGroupName(payload.wc_name)){
                showMessage('이미 존재하는 업무 그룹입니다.\n\n중복 등록은 허용되지 않습니다.', '오류');
                return;
            }
            const btn = document.getElementById(ADD_SAVE_ID);
            try {
                if(btn) btn.disabled = true;
                await createWorkGroup(payload);
                form.reset();
                closeModal(ADD_MODAL_ID);
                await refreshWorkGroups();
                showMessage('업무 그룹이 등록되었습니다.', '완료');
            } catch(err){
                console.error(err);
                showMessage(err.message || '업무 그룹 등록 중 오류가 발생했습니다.', '오류');
            } finally {
                if(btn) btn.disabled = false;
            }
        });
        // edit modal
        document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(EDIT_FORM_ID);
            if(!form) return;
            if(!form.checkValidity()){ form.reportValidity(); return; }
            const saveBtn = document.getElementById(EDIT_SAVE_ID);
            const recordId = parseInt(saveBtn?.getAttribute('data-id')||'-1',10);
            if(!Number.isFinite(recordId) || recordId <= 0){
                showMessage('수정 대상 정보를 찾을 수 없습니다.', '오류');
                return;
            }
            const data = collectForm(form);
            data.hw_count = toIntOrBlank(data.hw_count);
            data.sw_count = toIntOrBlank(data.sw_count);
            data.work_priority = toIntOrBlank(data.work_priority);
            data.staff_count = toIntOrBlank(data.staff_count);
            data.member_count = toIntOrBlank(data.member_count);
            const payload = buildWorkGroupPayload(data);
            if(!validateWorkGroupPayload(payload)) return;
            if(hasDuplicateWorkGroupName(payload.wc_name, recordId)){
                showMessage('이미 존재하는 업무 그룹입니다.\n\n중복 수정은 허용되지 않습니다.', '오류');
                return;
            }
            try {
                if(saveBtn) saveBtn.disabled = true;
                await updateWorkGroup(recordId, payload);
                closeModal(EDIT_MODAL_ID);
                await refreshWorkGroups();
                showMessage('업무 그룹 정보가 저장되었습니다.', '완료');
            } catch(err){
                console.error(err);
                showMessage(err.message || '업무 그룹 수정 중 오류가 발생했습니다.', '오류');
            } finally {
                if(saveBtn) saveBtn.disabled = false;
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
                wsTemplate['!cols'] = UPLOAD_HEADERS_KO.map((h)=> ({ wch: Math.max(12, h.length + 4) }));

                // Guide sheet: rules and allowed values (Korean)
                const rules = [
                    ['엑셀 업로드 가이드'],
                    [''],
                    ['작성 규칙'],
                    ['- 첫 행의 컬럼 제목은 아래 순서와 완전히 일치해야 합니다. (순서/이름 변경 불가)'],
                    ['- 수량(하드웨어/소프트웨어)은 숫자만 입력하세요.'],
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
                XLSX.writeFile(wb, 'work_group_upload_template.xlsx');
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
            const confirmBtn = document.getElementById(UPLOAD_CONFIRM_ID);
            const reader = new FileReader();
            reader.onload = async ()=>{
                if(confirmBtn) confirmBtn.disabled = true;
                try{
                    const data = new Uint8Array(reader.result);
                    const wb = window.XLSX.read(data, {type:'array'});
                    const sheetName = wb.SheetNames[0]; if(!sheetName){ showMessage('엑셀 시트를 찾을 수 없습니다.', '업로드 오류'); return; }
                    const ws = wb.Sheets[sheetName];
                    const rows = window.XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
                    if(!rows || rows.length===0){ showMessage('엑셀 데이터가 비어있습니다.', '업로드 오류'); return; }
                    const header = rows[0].map(h=> String(h).trim());
                    // Header validation: exact match and order (accept legacy first column label)
                    const isNewHdr = header.length === UPLOAD_HEADERS_KO.length && header.every((h,i)=> h===UPLOAD_HEADERS_KO[i]);
                    const isOldHdr = header.length === ALT_UPLOAD_HEADERS_KO.length && header.every((h,i)=> h===ALT_UPLOAD_HEADERS_KO[i]);
                    if(!(isNewHdr || isOldHdr)){
                        // Special handling: if '보안 점수' 포함, 안내 메시지 추가
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
                        // Validation rules (업무 그룹): counts must be integers if provided
                        ['hw_count','sw_count','work_priority'].forEach(k=>{
                            const rawVal = rec[k];
                            if(rawVal !== '' && !isIntegerLike(rawVal)) errors.push(`Row ${r+1}: ${COLUMN_META[k]?.label||k}는 숫자만 입력하세요.`);
                        });
                        // Normalize numbers
                        rec.hw_count = toIntOrBlank(rec.hw_count);
                        rec.sw_count = toIntOrBlank(rec.sw_count);
                        rec.work_priority = toIntOrBlank(rec.work_priority);
                        // Default optional fields when missing in legacy uploads
                        rec.sys_dept = rec.sys_dept || '';
                        rec.work_status = rec.work_status || '';
                        rec.work_priority = rec.work_priority || '';
                        imported.push(rec);
                    }
                    if(errors.length){
                        const preview = errors.slice(0, 20).join('\n');
                        const more = errors.length>20 ? `\n...외 ${errors.length-20}건` : '';
                        showMessage(`업로드 실패: 유효성 검사 오류가 있습니다.\n\n${preview}${more}`, '업로드 실패');
                        return;
                    }
                    if(!imported.length){ showMessage('업로드할 데이터가 없습니다.', '업로드 안내'); return; }
                    let successCount = 0;
                    const failures = [];
                    for(let i=0; i<imported.length; i++){
                        const rowPayload = buildWorkGroupPayload(imported[i]);
                        if(!validateWorkGroupPayload(rowPayload, { silent: true })){
                            failures.push(`Row ${i+2}: 필수 값이 누락되었습니다.`);
                            continue;
                        }
                        try{
                            await createWorkGroup(rowPayload);
                            successCount += 1;
                        } catch(err){
                            console.error(err);
                            failures.push(`Row ${i+2}: ${err.message || '등록 실패'}`);
                            if(failures.length >= 10){
                                failures.push('... 추가 오류 생략 ...');
                                break;
                            }
                        }
                    }
                    if(successCount > 0){ await refreshWorkGroups(); }
                    if(failures.length){
                        showMessage(`일부 행을 업로드하지 못했습니다.\n\n${failures.join('\n')}`, '업로드 실패');
                        return;
                    }
                    showMessage(`${successCount}개 행이 업로드되었습니다.`, '업로드 완료');
                    closeModal(UPLOAD_MODAL_ID);
                }catch(e){ console.error(e); showMessage('엑셀 파싱 중 오류가 발생했습니다. 파일을 확인해주세요.', '업로드 오류'); }
                finally {
                    if(confirmBtn) confirmBtn.disabled = false;
                }
            };
            reader.onerror = ()=> showMessage('파일을 읽는 중 오류가 발생했습니다.', '업로드 오류');
            reader.readAsArrayBuffer(f);
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
        document.getElementById('system-duplicate-confirm')?.addEventListener('click', async ()=>{
            closeModal('system-duplicate-modal');
            showMessage('카테고리 정책입니다.\n\n복제는 허용되지 않습니다.', '오류');
        });
        // dispose (불용처리)
        document.getElementById(DISPOSE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('불용처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('dispose-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 업무 그룹을 정말 불용처리하시겠습니까?`; }
            openModal(DISPOSE_MODAL_ID);
        });
    document.getElementById(DISPOSE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DISPOSE_MODAL_ID));
        document.getElementById(DISPOSE_CONFIRM_ID)?.addEventListener('click', ()=>{
            closeModal(DISPOSE_MODAL_ID);
        });
        // delete (삭제처리)
        document.getElementById(DELETE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('삭제처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('delete-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 업무 그룹을 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', async ()=>{
            const ids = [...state.selected].map(id=> parseInt(id,10)).filter(id=> Number.isFinite(id) && id>0);
            if(!ids.length){ closeModal(DELETE_MODAL_ID); return; }
            const btn = document.getElementById(DELETE_CONFIRM_ID);
            try {
                if(btn) btn.disabled = true;
                await deleteWorkGroups(ids);
                state.selected.clear();
                closeModal(DELETE_MODAL_ID);
                await refreshWorkGroups();
                showMessage(`${ids.length}개 항목이 삭제되었습니다.`, '완료');
            } catch(err){
                console.error(err);
                showMessage(err.message || '업무 그룹 삭제 중 오류가 발생했습니다.', '오류');
            } finally {
                if(btn) btn.disabled = false;
            }
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
                attachLicenseLiveSync(EDIT_FORM_ID);
                initDatePickers(EDIT_FORM_ID);
                const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                if(editSaveEl){ editSaveEl.setAttribute('data-id', row.id || ''); }
                return;
            }
            // 2개 이상 → 일괄변경 모달
            const subtitle = document.getElementById('bulk-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 업무 그룹에서 지정한 필드를 일괄 변경합니다.`; }
            buildBulkForm();
            openModal(BULK_MODAL_ID);
        });
        document.getElementById(BULK_CLOSE_ID)?.addEventListener('click', ()=> closeModal(BULK_MODAL_ID));
        document.getElementById(BULK_APPLY_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(BULK_FORM_ID); if(!form) return;
            const entries = [...form.querySelectorAll('[data-bulk-field]')]
                .map(el=>({ field: el.getAttribute('data-bulk-field'), value: el.value }))
                .filter(p=> p.value !== '');
            if(!entries.length){ showMessage('변경할 값을 1개 이상 입력하세요.', '안내'); return; }
            const ids = [...state.selected].map(id=> parseInt(id,10)).filter(id=> Number.isFinite(id) && id>0);
            if(!ids.length){ showMessage('선택된 항목을 찾을 수 없습니다.', '오류'); return; }
            const partialData = {};
            entries.forEach(({field, value})=>{
                if(field === 'hw_count' || field === 'sw_count' || field === 'work_priority' || field === 'staff_count' || field === 'member_count'){
                    partialData[field] = toIntOrBlank(value);
                } else {
                    partialData[field] = value;
                }
            });
            const payload = buildWorkGroupPayload(partialData, { partial: true });
            if(Object.keys(payload).length === 0){ showMessage('적용할 필드를 확인하세요.', '안내'); return; }
            const btn = document.getElementById(BULK_APPLY_ID);
            try {
                if(btn) btn.disabled = true;
                for(const id of ids){
                    await updateWorkGroup(id, payload);
                }
                closeModal(BULK_MODAL_ID);
                await refreshWorkGroups();
                showMessage(`${ids.length}개 항목에 일괄 변경이 적용되었습니다.`, '완료');
            } catch(err){
                console.error(err);
                showMessage(err.message || '일괄 변경 중 오류가 발생했습니다.', '오류');
            } finally {
                if(btn) btn.disabled = false;
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
            if(col === 'hw_count' || col === 'sw_count'){
                return `<input type="number" min="0" step="1" class="form-input" data-bulk-field="${col}" placeholder="숫자">`;
            }
            if(col === 'note'){
                return `<textarea class="form-input textarea-large" rows="6" data-bulk-field="${col}" placeholder="비고"></textarea>`;
            }
            if(col === 'group_code'){
                return `<input class="form-input" data-bulk-field="${col}" placeholder="업무 코드">`;
            }
            if(col === 'sys_dept'){
                return `<input class="form-input" data-bulk-field="${col}" placeholder="담당 부서">`;
            }
            if(col === 'work_status'){
                return `<input class="form-input" data-bulk-field="${col}" placeholder="업무 상태">`;
            }
            if(col === 'work_priority'){
                return `<input type="number" min="0" step="1" class="form-input" data-bulk-field="${col}" placeholder="업무 우선순위(숫자)">`;
            }
            return `<input class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }
        const GROUPS = [
            { title:'업무 그룹', cols:['wc_name','group_code','sys_dept','work_status','work_priority'] }
        ];
        form.innerHTML = GROUPS.map(g=>{
            const fields = g.cols.filter(c=> !EXCLUDE.has(c));
            if(!fields.length) return '';
            const grid = fields.map(col=>{
                const meta = COLUMN_META[col]; if(!meta) return '';
                return `<div class="form-row"><label>${meta.label}</label>${inputFor(col)}</div>`;
            }).join('');
            const noteRow = COLUMN_META.note
                ? `<div class="form-row"><label>${COLUMN_META.note.label}</label>${inputFor('note')}</div>`
                : '';
            return `
                <div class="form-section">
                    <div class="section-header"><h4>${g.title}</h4></div>
                    <div class="form-grid">${grid}</div>
                    ${noteRow}
                </div>`;
        }).join('');
        // no extra widgets for this bulk form
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

    // Sum values by label key (e.g., sum hw_count by wc_name)
    function sumBy(rows, labelKey, valueKey){
        const dist = {};
        rows.forEach(r=>{
            const label = (r[labelKey]==null || String(r[labelKey]).trim()==='') ? '-' : String(r[labelKey]);
            if(label === '-') return; // skip empty labels
            const val = parseInt(r[valueKey]||0, 10) || 0;
            if(!Number.isFinite(val)) return;
            dist[label] = (dist[label] || 0) + val;
        });
        return dist;
    }

    function buildStats(){
    const swEl = document.getElementById('stats-software');
    if(swEl) swEl.innerHTML = '';
        // Reflect the CURRENT TABLE CONTENTS (current page slice, after search/sort)
        const rows = getPageSlice();
        const hwTotal = rows.reduce((acc, r)=> acc + (parseInt(r.hw_count||0,10)||0), 0);
        const swTotal = rows.reduce((acc, r)=> acc + (parseInt(r.sw_count||0,10)||0), 0);
        // Totals (current page)
        renderStatBlock('stats-software', '하드웨어 총합', { '전체': hwTotal });
        renderStatBlock('stats-software', '소프트웨어 총합', { '전체': swTotal });
        // Top 10 by 업무 그룹 (sum of counts per 그룹)
        const hwByClass = sumBy(rows, 'wc_name', 'hw_count');
        const swByClass = sumBy(rows, 'wc_name', 'sw_count');
        renderStatBlock('stats-software', '하드웨어 Top 10 (업무 그룹)', hwByClass, null, { topN: 10, includeOther: false });
    renderStatBlock('stats-software', '소프트웨어 Top 10 (업무 그룹)', swByClass, null, { topN: 10, includeOther: false });
    }
    }

    // (조건 필터 관련 함수 제거됨)

    async function init(){
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
    loadColumnSelection();
    // Enforce initial state equals pressing "초기화" in the column modal
    // (ignore any previously saved custom column visibility on first render)
    resetColumnSelection();
        // Load persisted page size (allowed values only)
        try {
            const psRaw = localStorage.getItem('system_page_size');
            if(psRaw){
                const val = parseInt(psRaw,10);
                if([10,20,50,100].includes(val)){
                    state.pageSize = val;
                    const sel = document.getElementById(PAGE_SIZE_ID);
                    if(sel) sel.value = String(val);
                }
            }
        } catch(err){}
        // Load persisted sort (if any)
        loadSortPreference();
        bindEvents();
        state.isLoading = true;
        render();
        try { await ensureLookupsLoaded(); } catch(_e){}
        await refreshWorkGroups();
        // Page adornments (animation + popover)
}
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


