/**
 * 하드웨어 리스트 관리 페이지 스크립트
 * - 컬럼 토글 (기본 10개 노출)
 * - API 연동 데이터 렌더링 + 페이징 + 검색
 * - 모달 (등록/수정/컬럼 선택)
 * - CSV 다운로드 (현재 페이지 or 전체)
 * NOTE: hw_server_type SQLite API와 동기화됨
 */

(function(){
    function hwTypeLabel(value){
        const v = String(value ?? '').trim();
        if(v === '서버' || v === '온프레미스') return '물리서버';
        if(v === '워크스테이션') return '가상서버';
        return v;
    }

    // Server tab should only display these types.
    const ALLOWED_SERVER_FORM_FACTORS = new Set(['서버', '온프레미스', '클라우드', '프레임', '워크스테이션']);

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
    const FLATPICKR_CSS = '/static/vendor/flatpickr/4.6.13/flatpickr.min.css';
    const FLATPICKR_THEME_NAME = 'airbnb'; // use neutral theme; colors overridden to match accent
    const FLATPICKR_THEME_HREF = `/static/vendor/flatpickr/4.6.13/themes/${FLATPICKR_THEME_NAME}.css`;
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
        try { await ensureFlatpickr(); } catch(_e){ return; }
        const startEl = form.querySelector('[name="release_date"]');
        const endEl = form.querySelector('[name="eosl"]');
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
    // Resolve a UI accent color from CSS variables or primary button styles
    function resolveAccentColor(){
        try{
            const root = document.documentElement;
            const rs = getComputedStyle(root);
            const varNames = ['--accent', '--accent-color', '--primary', '--primary-color', '--brand', '--brand-color'];
            for(const name of varNames){
                const v = rs.getPropertyValue(name).trim();
                if(v && v !== 'transparent' && v !== 'rgba(0, 0, 0, 0)') return v;
            }
            // Try primary action button background color
            const primaryBtn = document.querySelector('.btn-primary');
            if(primaryBtn){
                const cs = getComputedStyle(primaryBtn);
                const bg = cs.backgroundColor || cs.color;
                if(bg && bg !== 'rgba(0, 0, 0, 0)') return bg;
            }
        }catch(_e){}
        // Safe fallback
        return '#3f51b5';
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

    window.__analyticsGetData = function(){ var rows = state.filtered.length ? state.filtered : state.data; return rows.map(function(r){ return Object.assign({}, r, {hw_type: hwTypeLabel(r.hw_type)}); }); };

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
    // Upload template (Hardware schema)
    const UPLOAD_HEADERS_KO = [
        '모델명','제조사','유형','릴리즈 일자','EOSL 일자','수량','비고'
    ];
    const HEADER_KO_TO_KEY = {
        '모델명':'model',
        '제조사':'vendor',
        '유형':'hw_type',
        '릴리즈 일자':'release_date',
        'EOSL 일자':'eosl',
        '수량':'qty',
        '비고':'note'
    };
    const ENUM_SETS = { };
    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
    function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }

    const HW_API_BASE = '/api/hw-server-types';
    const VENDOR_MANUFACTURER_API = '/api/vendor-manufacturers';
    let vendorNameByCode = {};
    let vendorNameOptions = [];

    function buildVendorNameOptions(items){
        const names = new Set();
        (items||[]).forEach(item=>{
            const name = String(item?.manufacturer_name || '').trim();
            if(name) names.add(name);
        });
        return [...names].sort((a,b)=> a.localeCompare(b,'ko-KR'));
    }

    function buildVendorOptionsHtml(selectedValue, opts){
        const options = opts || {};
        const selected = String(selectedValue ?? '').trim();
        const list = Array.isArray(vendorNameOptions) ? vendorNameOptions : [];

        // Default: block free-form values (only allow values from list).
        // For edit forms, we allow showing a legacy unknown value as a disabled selected option.
        const allowLegacyUnknownSelected = !!options.allowLegacyUnknownSelected;

        let html = '';
        const hasSelected = selected && list.includes(selected);
        if(selected && !hasSelected && allowLegacyUnknownSelected){
            // Show but do not allow re-selecting after change.
            html += `<option value="${escapeHTML(selected)}" selected disabled>${escapeHTML(selected)} (등록되지 않은 제조사)</option>`;
        }
        html += `<option value="">선택</option>`;
        if(list.length === 0){
            html += `<option value="" disabled>등록된 제조사가 없습니다. 제조사 메뉴에서 먼저 등록하세요.</option>`;
            return html;
        }
        html += list
            .map(name=> `<option value="${escapeHTML(name)}" ${name===selected?'selected':''}>${escapeHTML(name)}</option>`)
            .join('');
        return html;
    }

    function syncVendorSelectOptions(select, opts){
        if(!select) return;
        const options = opts || {};
        const allowLegacyUnknownSelected = !!options.allowLegacyUnknownSelected;

        let current = String(select.value || '').trim();
        if(!allowLegacyUnknownSelected && current && !vendorNameOptions.includes(current)) current = '';

        select.innerHTML = buildVendorOptionsHtml(current, { allowLegacyUnknownSelected });

        try {
            if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
                window.BlossomSearchableSelect.syncAll(select.closest('.modal-overlay-full') || select);
            }
        } catch(_e){}
    }

    function syncVendorSelectsInModals(){
        // Keep all vendor selects (add/edit/bulk) in sync with the latest vendorNameOptions.
        // This fixes cases where the modal is opened before async vendor list loads.
        try{
            document.querySelectorAll('.modal-overlay-full select[name="vendor"].search-select').forEach((select)=>{
                const modalRoot = select.closest('.modal-overlay-full');
                const allowLegacyUnknownSelected = !!(modalRoot && modalRoot.id === EDIT_MODAL_ID);
                syncVendorSelectOptions(select, { allowLegacyUnknownSelected });
            });
        }catch(_e){}
    }

    function syncVendorSelectInAddForm(){
        const form = document.getElementById(ADD_FORM_ID);
        const select = form?.querySelector('select[name="vendor"]');
        if(!select) return;
        syncVendorSelectOptions(select, { allowLegacyUnknownSelected: false });
    }

    async function callApi(url, options){
        const opts = { method: (options && options.method) ? options.method.toUpperCase() : 'GET', headers: { 'X-Requested-With': 'XMLHttpRequest', ...(options?.headers||{}) } };
        const isJsonPayload = options && options.body && typeof options.body === 'object' && !(options.body instanceof FormData);
        if(opts.method !== 'GET' && opts.method !== 'HEAD' && isJsonPayload){
            opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
        }
        if(options && Object.prototype.hasOwnProperty.call(options, 'credentials')){
            opts.credentials = options.credentials;
        }
        if(options && Object.prototype.hasOwnProperty.call(options, 'body')){
            opts.body = isJsonPayload ? JSON.stringify(options.body) : options.body;
        }
        let response;
        try {
            response = await fetch(url, opts);
        } catch(err){
            throw new Error('서버와 통신하지 못했습니다. 잠시 후 다시 시도하세요.');
        }
        let data = null;
        try {
            data = await response.json();
        } catch(_e){
            data = null;
        }
        const successFlag = (data && Object.prototype.hasOwnProperty.call(data, 'success')) ? data.success : response.ok;
        if(!response.ok || successFlag === false){
            const message = (data && data.message) || `요청이 실패했습니다. (HTTP ${response.status})`;
            throw new Error(message);
        }
        return data;
    }

    function buildVendorMap(items){
        const map = {};
        (items||[]).forEach(item=>{
            const code = item?.manufacturer_code;
            if(!code) return;
            map[code] = item.manufacturer_name || code;
        });
        return map;
    }

    function findVendorCodeByName(name){
        const target = String(name || '').trim();
        if(!target) return '';
        const entries = Object.entries(vendorNameByCode || {});
        for(let i=0; i<entries.length; i++){
            const pair = entries[i];
            if(String(pair[1] || '').trim() === target) return String(pair[0] || '').trim();
        }
        return '';
    }

    function normalizeServerRecord(item){
        if(!item) return null;
        const vendorCode = item.manufacturer_code || '';
        const vendorName = vendorNameByCode[vendorCode] || vendorCode;
        const rawQty = (item.usage_count != null) ? item.usage_count : item.server_count;
        return {
            id: item.id,
            server_code: item.server_code,
            model: item.server_model_name || item.model_name || '',
            vendor: vendorName || '',
            vendor_code: vendorCode || '',
            hw_type: item.form_factor || '',
            release_date: item.release_date || '',
            eosl: item.eosl_date || '',
            qty: Number.isFinite(rawQty) ? rawQty : (parseInt(rawQty, 10) || 0),
            note: item.remark || ''
        };
    }

    function syncNextId(){
        const maxId = state.data.reduce((acc, row)=>{
            const value = Number(row.id) || 0;
            return value > acc ? value : acc;
        }, 0);
        state.nextId = maxId + 1;
    }

    function pruneSelection(rows){
        const validIds = new Set(rows.map(r=> Number(r.id)));
        state.selected = new Set([...state.selected].filter(id => validIds.has(Number(id))));
    }

    function upsertRow(row, opts){
        if(!row) return;
        const options = opts || {};
        const targetId = Number(row.id);
        const idx = state.data.findIndex(r=> Number(r.id) === targetId);
        if(idx >= 0){
            state.data[idx] = { ...state.data[idx], ...row };
        } else if(options.append){
            state.data.push(row);
        } else {
            state.data.unshift(row);
        }
        pruneSelection(state.data);
        syncNextId();
        applyFilter();
    }

    function removeRowsByIds(ids){
        if(!Array.isArray(ids) || !ids.length) return;
        const idSet = new Set(ids.map(id=> Number(id)));
        state.data = state.data.filter(row => !idSet.has(Number(row.id)));
        pruneSelection(state.data);
        syncNextId();
        applyFilter();
    }

    async function refreshServerData(options){
        const includeDeleted = options?.includeDeleted ? '1' : '0';
        state.loading = true;
        const emptyEl0 = document.getElementById('system-empty');
        if(emptyEl0) emptyEl0.hidden = true;
        try {
            const [vendorAllRes, vendorRes, serverRes] = await Promise.all([
                callApi(`${VENDOR_MANUFACTURER_API}?include_deleted=1`),
                callApi(`${VENDOR_MANUFACTURER_API}?include_deleted=${includeDeleted}`),
                callApi(`${HW_API_BASE}?group=server&include_deleted=${includeDeleted}`)
            ]);
            vendorNameByCode = buildVendorMap(vendorAllRes?.items || []);
            vendorNameOptions = buildVendorNameOptions(vendorRes?.items || []);
            // Sync vendor selects across add/edit/bulk modals (even if already opened)
            syncVendorSelectsInModals();
            const mapped = (serverRes?.items || [])
                .map(normalizeServerRecord)
                .filter(Boolean)
                .filter(r => ALLOWED_SERVER_FORM_FACTORS.has(String(r.hw_type || '').trim()));
            state.data = mapped;
            state.page = 1;
            pruneSelection(mapped);
            syncNextId();
            state.loading = false;
            applyFilter();
        } catch(err){
            console.error(err);
            state.data = [];
            state.filtered = [];
            state.page = 1;
            state.selected.clear();
            state.nextId = 1;
            state.loading = false;
            showMessage(err.message || '서버 목록을 불러오지 못했습니다.', '오류');
            render();
        }
    }

    function buildServerPayload(formData, opts){
        const existingRow = opts?.existingRow;
        const payload = {
            model_name: formData.model || '',
            form_factor: formData.hw_type || '',
            release_date: formData.release_date || '',
            eosl_date: formData.eosl || '',
            remark: formData.note || ''
        };
        // Qty is derived from hardware_asset usage count; do not send server_count.
        if(formData.server_code){ payload.server_code = formData.server_code; }
        const vendorInput = (formData.vendor || '').trim();
        const vendorLabel = (formData.vendor_label || '').trim();
        if(existingRow && vendorInput === (existingRow.vendor || '') && existingRow.vendor_code){
            payload.manufacturer_code = existingRow.vendor_code;
        } else if(vendorInput){
            // Select value can be either manufacturer_name or manufacturer_code depending on option source.
            const resolvedCode = (vendorNameByCode[vendorInput] ? vendorInput : findVendorCodeByName(vendorInput));
            if(resolvedCode){
                payload.manufacturer_code = resolvedCode;
            } else if(vendorLabel && vendorLabel !== vendorInput){
                payload.manufacturer_code = vendorInput;
                payload.manufacturer_name = vendorLabel;
            } else {
                payload.manufacturer_name = vendorInput;
            }
        }
        return payload;
    }

    // Data + State
    const BASE_VISIBLE_COLUMNS = [
        'model','vendor','hw_type','release_date','eosl','qty'
    ];
    const TABLE_COLUMN_ORDER = [
        'model','vendor','hw_type','release_date','eosl','qty'
    ];
    const COLUMN_ORDER = [
        'model','vendor','hw_type','release_date','eosl','qty','note'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '하드웨어', columns: ['model','vendor','hw_type','release_date','eosl','qty'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        model:{label:'모델명',group:'하드웨어'},
        vendor:{label:'제조사',group:'하드웨어'},
        hw_type:{label:'유형',group:'하드웨어'},
        release_date:{label:'릴리즈 일자',group:'하드웨어'},
        eosl:{label:'EOSL 일자',group:'하드웨어'},
        qty:{label:'수량',group:'하드웨어'},
        note:{label:'비고',group:'하드웨어'}
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
        nextId: 1,
        sortKey: null,
        sortDir: 'asc',
        loading: false,
    columnFilters: {} // { col: value | [values...] } (조건 필터 기능 제거 예정 - 빈 유지)
    };

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;

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
        if(state.loading){
            if(emptyEl) emptyEl.hidden = true;
        } else if(state.filtered.length === 0){
            if(emptyEl){
                emptyEl.hidden = false;
                // 검색어가 있을 때와 데이터 자체가 없을 때 메시지 구분
                const titleEl = document.getElementById('system-empty-title');
                const descEl = document.getElementById('system-empty-desc');
                if(state.search.trim()){
                    if(titleEl) titleEl.textContent = '검색 결과가 없습니다.';
                    if(descEl) descEl.textContent = '검색어를 변경하거나 필터를 초기화하세요.';
                } else {
                    if(titleEl) titleEl.textContent = '서버 내역이 없습니다.';
                    if(descEl) descEl.textContent = "우측 상단 '추가' 버튼을 눌러 첫 서버를 등록하세요.";
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
                + TABLE_COLUMN_ORDER.map(col=>{
                    if(!COLUMN_META[col]) return '';
                    const tdClass = state.visibleCols.has(col)?'':'col-hidden';
                    const label = COLUMN_META[col].label;
                    let rawVal = row[col];
                    let displayVal = (rawVal==null || String(rawVal).trim()==='') ? '-' : rawVal;
                    if(col === 'hw_type' && displayVal !== '-'){
                        displayVal = hwTypeLabel(displayVal);
                    }
                    let cellValue = highlight(displayVal, col);
                    // 링크: 모델명 클릭 시 서버 상세 페이지로 이동 (CPU 리스트와 동일한 스타일/클래스 적용)
                    if(col === 'model'){
                        // Dynamic detail routing (Unix pattern replication)
                        var base = (window.__HW_SERVER_DETAIL_URL || '');
                        try{
                            var params = new URLSearchParams();
                            params.set('id', (row.id==null?'' : String(row.id)));
                            params.set('model', row.model || '');
                            params.set('vendor', row.vendor || '');
                            params.set('server_code', row.server_code || '');
                            params.set('hw_type', row.hw_type || '');
                            params.set('release_date', row.release_date || '');
                            params.set('eosl', row.eosl || '');
                            params.set('qty', (row.qty==null?'' : String(row.qty)));
                            params.set('note', row.note || '');
                            var href = base ? (base + '?' + params.toString()) : '#';
                            cellValue = `<a href="${href}" class="work-name-link" data-id="${row.id??''}">${cellValue}</a>`;
                        }catch(_e){
                            cellValue = `<span class="work-name-link" data-id="${row.id??''}">${cellValue}</span>`;
                        }
                    }
                    // EOSL status indicator (three colors)
                    if(col === 'eosl'){
                        const accent = resolveAccentColor();
                        let dotColor = accent;
                        let titleTxt = '정보 없음';
                        if(displayVal && displayVal !== '-' && typeof displayVal === 'string'){
                            const m = displayVal.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                            if(m){
                                const y = parseInt(m[1],10), mo = parseInt(m[2],10)-1, d = parseInt(m[3],10);
                                const dateVal = new Date(y, mo, d);
                                const today = new Date(); today.setHours(0,0,0,0);
                                const msPerDay = 24*60*60*1000;
                                const daysLeft = Math.floor((dateVal - today)/msPerDay);
                                if(daysLeft < 0){
                                    dotColor = '#e53935'; // red
                                    titleTxt = '만료됨';
                                } else if(daysLeft < 30){
                                    dotColor = '#29b6f6'; // sky blue (<1 month)
                                    titleTxt = `임박 (${daysLeft}일 남음)`;
                                } else {
                                    dotColor = accent; // use Add button accent color (>=1 month)
                                    titleTxt = `여유 (${daysLeft}일 남음)`;
                                }
                            } else {
                                titleTxt = '형식 오류';
                            }
                        }
                        const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${dotColor};margin-right:6px;vertical-align:middle;" title="${titleTxt}" aria-hidden="true"></span>`;
                        cellValue = dot + cellValue;
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
        // Always show all supported list columns on screen.
        // (We keep 비고/note out of BASE_VISIBLE_COLUMNS to satisfy "비고는 화면에 안보이게" 요구사항.)
        state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
        try { localStorage.setItem('system_visible_cols', JSON.stringify([...state.visibleCols])); } catch(_e){}
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
    const MIN_COLS = 3;
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
        form.querySelectorAll('input,select,textarea').forEach(el=>{
            data[el.name]=el.value.trim();
            if(el.name === 'vendor' && el.tagName === 'SELECT'){
                const selectedOption = el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
                data.vendor_label = selectedOption ? String(selectedOption.textContent || '').trim() : '';
            }
        });
        return data;
    }

    function fillEditForm(row){
        const form = document.getElementById(EDIT_FORM_ID); if(!form) return;
        form.setAttribute('data-fk-ignore', '1');
        form.innerHTML='';
    const group = { title:'하드웨어', cols:['model','vendor','release_date','eosl'] };
        const section = document.createElement('div'); section.className='form-section';
        section.innerHTML = `<div class="section-header"><h4>${group.title}</h4></div>`;
        const grid = document.createElement('div'); grid.className='form-grid';
        group.cols.forEach(c=>{ if(!COLUMN_META[c]) return; const wrap=document.createElement('div');
            wrap.className = 'form-row';
            const labelText = COLUMN_META[c]?.label||c;
            wrap.innerHTML=`<label>${labelText}</label>${generateFieldInput(c,row[c])}`; grid.appendChild(wrap); });
        section.appendChild(grid);
        const noteRow = document.createElement('div');
        noteRow.className = 'form-row';
        noteRow.innerHTML = `<label>비고</label>${generateFieldInput('note', row?.note ?? '')}`;
        section.appendChild(noteRow); form.appendChild(section);
    }

    function generateFieldInput(col,value=''){
        if(col==='eosl' || col==='release_date'){
            // flatpickr target
            return `<input name="${col}" type="text" class="form-input date-input" value="${value??''}" placeholder="YYYY-MM-DD">`;
        }
        if(col==='model'){
            return `<input name="model" type="text" class="form-input" value="${value??''}" autocomplete="off">`;
        }
        if(col==='vendor'){
            const v = String(value ?? '').trim();
            return `<select name="vendor" class="form-input search-select" data-searchable="true" data-placeholder="선택" required>${buildVendorOptionsHtml(v, { allowLegacyUnknownSelected: true })}</select>`;
        }
        if(col==='qty'){
            return `<input name="qty" type="number" min="0" step="1" class="form-input" value="${value??''}" placeholder="숫자만">`;
        }
        if(col==='note'){
            return `<textarea name="note" class="form-input textarea-large" rows="6">${value??''}</textarea>`;
        }
        // default text input for model, vendor, hw_type
        return `<input name="${col}" class="form-input" value="${value??''}">`;
    }

    // License live-sync logic removed for hardware page

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

    function addRow(data){
        // 고유 id 부여
        data.id = state.nextId++;
        state.data.unshift(data); // 맨 앞 삽입
        applyFilter();
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
    const filename = `server_list_${yyyy}${mm}${dd}.csv`;
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
        // NOTE: Guarded so SPA swaps don't accumulate duplicate listeners.
        if(!window.__blossom_hw_server_slash_focus_wired){
            window.__blossom_hw_server_slash_focus_wired = true;
            document.addEventListener('keydown', e=>{
                if(e.key==='/' && !e.altKey && !e.ctrlKey && !e.metaKey){
                    const activeTag = document.activeElement?.tagName.toLowerCase();
                    if(['input','textarea','select'].includes(activeTag)) return; // already in a field
                    const anyModalOpen = document.querySelector('.modal-open');
                    if(anyModalOpen) return; // skip if modal open
                    e.preventDefault();
                    const s = document.getElementById(SEARCH_ID);
                    s?.focus();
                }
            });
        }
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
    // Persist clicked row to sessionStorage on model-link click (NOT during render)
    tbodyEl?.addEventListener('click', e=>{
            const link = e.target.closest('a.work-name-link');
            if(link){
                const rid = parseInt(link.getAttribute('data-id'),10);
                const row = state.data.find(r=> Number(r.id) === rid);
                if(row){ try{ sessionStorage.setItem('server_selected_row', JSON.stringify(row)); }catch(_s){} }
            }
        });
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
                    const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                    if(editSaveEl){
                        editSaveEl.setAttribute('data-id', String(row.id));
                    }
                    // attach date pickers for edit form
                    initDatePickers(EDIT_FORM_ID);
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
    document.getElementById(ADD_BTN_ID)?.addEventListener('click', ()=> { openModal(ADD_MODAL_ID); initDatePickers(ADD_FORM_ID); });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(ADD_FORM_ID);
            if(!form) return;
            if(!form.checkValidity()){ form.reportValidity(); return; }
            const formData = collectForm(form);
            let newRow = null;
            try{
                const payload = buildServerPayload(formData);
                const res = await callApi(HW_API_BASE, { method: 'POST', body: payload });
                newRow = normalizeServerRecord(res?.item);
            }catch(err){
                console.error(err);
                showMessage(err.message || '서버 등록 중 오류가 발생했습니다.', '오류');
                return;
            }
            if(newRow){
                const vendorDisplay = (formData.vendor_label || formData.vendor || '').trim();
                if(vendorDisplay && newRow.vendor_code){
                    vendorNameByCode[newRow.vendor_code] = vendorDisplay;
                    newRow.vendor = vendorDisplay;
                }
                upsertRow(newRow);
            }
            form.reset();
            closeModal(ADD_MODAL_ID);
            showMessage('서버가 등록되었습니다.', '완료');
        });
        // edit modal
        document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', async ()=>{
            const button = document.getElementById(EDIT_SAVE_ID);
            const form = document.getElementById(EDIT_FORM_ID);
            if(!form || !button) return;
            if(!form.checkValidity()){ form.reportValidity(); return; }
            const recordId = parseInt(button.getAttribute('data-id')||'-1',10);
            if(!Number.isFinite(recordId) || recordId <= 0){
                showMessage('수정할 항목을 찾을 수 없습니다.', '오류');
                return;
            }
            const existingRow = state.data.find(r=> Number(r.id) === recordId);
            const formData = collectForm(form);
            try{
                const payload = buildServerPayload(formData, { existingRow });
                const res = await callApi(`${HW_API_BASE}/${recordId}`, { method: 'PUT', body: payload });
                const updatedRow = normalizeServerRecord(res?.item);
                if(updatedRow){
                    const vendorDisplay = (formData.vendor_label || formData.vendor || '').trim();
                    if(vendorDisplay && updatedRow.vendor_code){
                        vendorNameByCode[updatedRow.vendor_code] = vendorDisplay;
                        updatedRow.vendor = vendorDisplay;
                    }
                    upsertRow(updatedRow, { append:false });
                }
                closeModal(EDIT_MODAL_ID);
                showMessage('서버가 수정되었습니다.', '완료');
            }catch(err){
                console.error(err);
                showMessage(err.message || '서버 수정 중 오류가 발생했습니다.', '오류');
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
            const wide = ['모델명','비고'];
            const mid = ['제조사','유형'];
                        if(wide.includes(h)) return { wch: 20 };
                        if(mid.includes(h)) return { wch: 16 };
                        return { wch: 12 };
                    });

                // Guide sheet: rules and allowed values (Korean)
                const rules = [
                    ['엑셀 업로드 가이드'],
                    [''],
                    ['작성 규칙'],
                    ['- 첫 행의 컬럼 제목은 아래 순서와 완전히 일치해야 합니다. (순서/이름 변경 불가)'],
                    ['- "수량"은 숫자만 입력하세요.'],
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
                XLSX.writeFile(wb, 'server_upload_template.xlsx');
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
                        // Validation rules (hardware)
                        if(rec.qty !== '' && !isIntegerLike(rec.qty)) errors.push(`Row ${r+1}: 수량은 숫자만 입력하세요.`);
                        // Normalize numbers
                        rec.qty = toIntOrBlank(rec.qty);
                        imported.push(rec);
                    }
                    if(errors.length){
                        const preview = errors.slice(0, 20).join('\n');
                        const more = errors.length>20 ? `\n...외 ${errors.length-20}건` : '';
                        showMessage(`업로드 실패: 유효성 검사 오류가 있습니다.\n\n${preview}${more}`, '업로드 실패');
                        return;
                    }
                    // Import rows
                    imported.forEach(item=> addRow(item));
                    showMessage(`${imported.length}개 행이 업로드되었습니다.`, '업로드 완료');
                    closeModal(UPLOAD_MODAL_ID);
                }catch(e){ console.error(e); showMessage('엑셀 파싱 중 오류가 발생했습니다. 파일을 확인해주세요.', '업로드 오류'); }
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
        document.getElementById('system-duplicate-confirm')?.addEventListener('click', ()=>{
            const originals = state.data.filter(r=> state.selected.has(r.id));
            if(!originals.length){ showMessage('선택된 행을 찾을 수 없습니다.', '오류'); closeModal('system-duplicate-modal'); return; }
            const clones = originals.map(o=>{
                const copy = {...o};
                delete copy.id; // new id assigned
                copy.model = copy.model ? (copy.model + '_COPY') : copy.model;
                return copy;
            });
            clones.forEach(c=> addRow(c));
            closeModal('system-duplicate-modal');
            showMessage(clones.length + '개 행이 복제되었습니다.', '완료');
        });
        // dispose (불용처리)
        document.getElementById(DISPOSE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('불용처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('dispose-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 서버를 정말 불용처리하시겠습니까?`; }
            openModal(DISPOSE_MODAL_ID);
        });
    document.getElementById(DISPOSE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DISPOSE_MODAL_ID));
        document.getElementById(DISPOSE_CONFIRM_ID)?.addEventListener('click', ()=>{
            // 수집 대상 열: 시스템 제조사, 시스템 모델명, 시스템 일련번호, 시스템 가상화, 시스템 장소, 시스템 위치, 시스템 슬롯, 시스템 크기, 시스템 담당부서, 시스템 담당자
            const fields = ['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','sys_dept','sys_owner'];
            const selected = state.data.filter(r=> state.selected.has(r.id)).map(r=>{
                const obj = { id: r.id };
                fields.forEach(f=> obj[f] = r[f] ?? '');
                return obj;
            });
            try {
                sessionStorage.setItem('dispose_selected_rows', JSON.stringify(selected));
            } catch(_e){}
            closeModal(DISPOSE_MODAL_ID);
            // TODO: 불용자산 페이지로 이동 예정. 라우팅 결정 후 아래 location.href 수정.
            // window.location.href = '/app/templates/2.hardware/2-1.server/2-1-1.onpremise/disposal.html';
        });
        // delete (삭제처리)
        document.getElementById(DELETE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('삭제처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('delete-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 서버를 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', async ()=>{
            const ids = [...state.selected].map(id=> Number(id)).filter(id=> Number.isFinite(id) && id > 0);
            if(!ids.length){ closeModal(DELETE_MODAL_ID); return; }
            const idSet = new Set(ids);
            const snapshotRows = state.data.filter(row=> idSet.has(Number(row.id)));
            try{
                await callApi(`${HW_API_BASE}/bulk-delete`, { method: 'POST', body: { ids } });
                removeRowsByIds(ids);
                state.selected.clear();
                try {
                    const fields = ['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','sys_dept','sys_owner'];
                    const snapshot = (window.__lastDeletedRows = (window.__lastDeletedRows||[]));
                    snapshot.push({
                        at: new Date().toISOString(),
                        rows: snapshotRows.map(row=>{
                            const entry = { id: row.id };
                            fields.forEach(f=> entry[f] = row[f] ?? '');
                            return entry;
                        })
                    });
                } catch(_e){}
                closeModal(DELETE_MODAL_ID);
                setTimeout(()=> showMessage(`${snapshotRows.length || ids.length}개 항목이 삭제되었습니다.`, '완료'), 0);
            }catch(err){
                console.error(err);
                showMessage(err.message || '삭제 처리 중 오류가 발생했습니다.', '오류');
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
                const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                if(editSaveEl){ editSaveEl.setAttribute('data-id', String(row.id)); }
                return;
            }
            // 2개 이상 → 일괄변경 모달
            const subtitle = document.getElementById('bulk-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 서버에서 지정한 필드를 일괄 변경합니다.`; }
            buildBulkForm();
            openModal(BULK_MODAL_ID);
            // Bulk form uses data-bulk-field; add name attrs for date fields then init flatpickr
            initDatePickers(BULK_FORM_ID);
        });
        document.getElementById(BULK_CLOSE_ID)?.addEventListener('click', ()=> closeModal(BULK_MODAL_ID));
        document.getElementById(BULK_APPLY_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(BULK_FORM_ID);
            const applyBtn = document.getElementById(BULK_APPLY_ID);
            if(!form || !applyBtn) return;

            const entries = [...form.querySelectorAll('[data-bulk-field]')]
                .map(el=>({ field: el.getAttribute('data-bulk-field'), value: String(el.value ?? '').trim() }))
                .filter(p=> p.field && p.value !== '');
            if(!entries.length){ showMessage('변경할 값을 1개 이상 입력하세요.', '안내'); return; }

            const ids = [...state.selected].map(id=> Number(id)).filter(id=> Number.isFinite(id) && id > 0);
            if(!ids.length){ showMessage('일괄변경할 행을 먼저 선택하세요.', '안내'); return; }

            // Map UI fields -> API fields (partial update)
            const payload = {};
            for(const {field, value} of entries){
                if(field === 'model') payload.model_name = value;
                else if(field === 'vendor') payload.manufacturer_name = value;
                else if(field === 'hw_type') payload.form_factor = value;
                else if(field === 'release_date') payload.release_date = value;
                else if(field === 'eosl') payload.eosl_date = value;
                else if(field === 'note') payload.remark = value;
            }

            if(Object.keys(payload).length === 0){
                showMessage('변경할 값이 유효하지 않습니다.', '안내');
                return;
            }

            applyBtn.disabled = true;
            try{
                const updatedRows = [];
                let failed = 0;
                for(const id of ids){
                    try{
                        const res = await callApi(`${HW_API_BASE}/${id}`, { method: 'PUT', body: payload });
                        const updated = normalizeServerRecord(res?.item);
                        if(updated) updatedRows.push(updated);
                    }catch(err){
                        failed += 1;
                        console.error(err);
                    }
                }

                if(updatedRows.length){
                    const byId = new Map(updatedRows.map(r=> [Number(r.id), r]));
                    state.data = state.data.map(row=>{
                        const hit = byId.get(Number(row.id));
                        return hit ? ({ ...row, ...hit }) : row;
                    });
                    pruneSelection(state.data);
                    syncNextId();
                    applyFilter();
                }

                closeModal(BULK_MODAL_ID);
                const okCount = updatedRows.length;
                const msg = failed
                    ? `${okCount}개 저장, ${failed}개 실패했습니다.`
                    : `${okCount || ids.length}개 항목이 저장되었습니다.`;
                setTimeout(()=> showMessage(msg, failed ? '안내' : '완료'), 0);
            } finally {
                applyBtn.disabled = false;
            }
        });
        // esc close
        // NOTE: Guarded so SPA swaps don't accumulate duplicate listeners.
        if(!window.__blossom_hw_server_esc_close_wired){
            window.__blossom_hw_server_esc_close_wired = true;
            document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ [ADD_MODAL_ID,EDIT_MODAL_ID,COLUMN_MODAL_ID,DISPOSE_MODAL_ID,DELETE_MODAL_ID,BULK_MODAL_ID,UPLOAD_MODAL_ID,'system-download-modal','system-message-modal','system-duplicate-modal'].forEach(closeModal); }});
            // include stats modal in esc close
            
    // Category-wide duplicate policy override
    (function(){
        const policyMessage = '카테고리 정책입니다.\n\n복제는 허용되지 않습니다.';
        const blockDuplicateAction = function(event){
            if(event){
                event.preventDefault();
                event.stopPropagation();
                if(typeof event.stopImmediatePropagation === 'function'){
                    event.stopImmediatePropagation();
                }
            }
            try { closeModal('system-duplicate-modal'); } catch(_e){}
            showMessage(policyMessage, '오류');
            return false;
        };

        const duplicateBtn = document.getElementById('system-duplicate-btn');
        const duplicateConfirm = document.getElementById('system-duplicate-confirm');
        if(duplicateBtn){ duplicateBtn.addEventListener('click', blockDuplicateAction, true); }
        if(duplicateConfirm){ duplicateConfirm.addEventListener('click', blockDuplicateAction, true); }
    })();

document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeModal(STATS_MODAL_ID); }});
        }

        // message modal bindings
        document.getElementById('system-message-close')?.addEventListener('click', ()=> closeModal('system-message-modal'));
        document.getElementById('system-message-ok')?.addEventListener('click', ()=> closeModal('system-message-modal'));

    function buildBulkForm(){
        const form = document.getElementById(BULK_FORM_ID); if(!form) return;
        function inputFor(col){
            if(col === 'eosl' || col === 'release_date') return `<input type="text" name="${col}" class="form-input date-input" data-bulk-field="${col}" placeholder="YYYY-MM-DD">`;
            if(col === 'vendor'){
                return `<select class="form-input search-select" data-searchable="true" data-placeholder="선택" data-bulk-field="vendor">${buildVendorOptionsHtml('', { allowLegacyUnknownSelected: false })}</select>`;
            }
            if(col === 'note') return `<textarea class="form-input textarea-large" rows="6" data-bulk-field="note" placeholder="설명"></textarea>`;
            return `<input class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }
        const GROUP = { title:'하드웨어', cols:['model','vendor','eosl'] };
        const grid = GROUP.cols.map(col=>{
            const meta = COLUMN_META[col]; if(!meta) return '';
            const wide = (col === 'note');
            return `<div class="${wide ? 'form-row form-row-wide' : 'form-row'}"><label>${meta.label}</label>${inputFor(col)}</div>`;
        }).join('');
        form.innerHTML = `
            <div class="form-section">
                <div class="section-header"><h4>${GROUP.title}</h4></div>
                <div class="form-grid">${grid}</div>
            </div>`;
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
        // 하드웨어 통계
        renderStatBlock('stats-software', '제조사', countBy(rows, 'vendor'));
        renderStatBlock('stats-versions', '유형', countBy(rows.map(r=>({ ...r, hw_type: hwTypeLabel(r.hw_type) })), 'hw_type'));
        // EOSL 연도 분포
        const eoslDist = rows.reduce((acc, r)=>{
            const v = String(r.eosl||'').trim();
            if(!v) return acc;
            const m = v.match(/^(\d{4})/);
            const y = m ? m[1] : '기타';
            acc[y] = (acc[y]||0)+1;
            return acc;
        }, {});
        renderStatBlock('stats-check', 'EOSL 연도', eoslDist);
    }
    }

    // (조건 필터 관련 함수 제거됨)

    function init(){
        // Guard: initialize only on the server list page instance.
        const pane = document.querySelector('#system-list-pane[data-page-key="cat_hw_server"]');
        if(!pane) return;
        if(pane.dataset.blossomInitHwServerList === '1') return;
        pane.dataset.blossomInitHwServerList = '1';
        try { document.removeEventListener('DOMContentLoaded', init); } catch(_e) {}

        state.loading = true;
        try { const emptyEl0 = document.getElementById('system-empty'); if(emptyEl0) emptyEl0.hidden = true; } catch(_e) {}

        // Model fields on hardware pages are plain text inputs.
        // Templates opt out of global FK select conversion via data-fk-ignore,
        // so we don't need a MutationObserver-based normalizer here.
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
        applyFilter();
        refreshServerData();
        // Page adornments (animation + popover)
}
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
    // SPA navigation support: Blossom fullscreen swap dispatches blossom:pageLoaded.
    document.addEventListener('blossom:pageLoaded', init);
})();


