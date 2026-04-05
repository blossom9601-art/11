/**
 * 비즈니스 관리 페이지 스크립트
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

    const API_ENDPOINT = '/api/work-statuses';
    const JSON_HEADERS = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    };
    const DEFAULT_STATUS_COLOR_CLASS = 'ws-run';
    const STATUS_COLOR_SWATCHES = [
        DEFAULT_STATUS_COLOR_CLASS,
        ...Array.from({ length: 10 }, (_, idx) => `ws-c${idx + 1}`)
    ];
    const STATUS_COLOR_CLASS_POOL = Array.from(new Set(['ws-run', 'ws-idle', 'ws-wait', ...STATUS_COLOR_SWATCHES]));

    function sanitizeCountValue(value){
        const parsed = toIntOrBlank(value);
        if(parsed === '' || parsed == null){
            return null;
        }
        return parsed;
    }

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
    // Upload template (Work Status schema)
    const UPLOAD_HEADERS_KO = [
        '업무 상태','설명','하드웨어(수량)','소프트웨어(수량)','비고'
    ];
    const HEADER_KO_TO_KEY = {
        // 호환: 레거시 '업무 분류'도 허용
        '업무 상태':'wc_name',
        '업무 분류':'wc_name',
        '설명':'wc_desc',
        '하드웨어(수량)':'hw_count',
        '소프트웨어(수량)':'sw_count',
        '비고':'note'
    };
    const ENUM_SETS = { };
    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
    function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }
    function normStatusName(s){ return String(s??'').trim(); }
    function hasStatusName(name, excludeId){
        const key = normStatusName(name);
        if(!key) return false;
        return state.data.some(r => normStatusName(r.wc_name) === key && (excludeId==null || r.id !== excludeId));
    }

    function makeUniqueStatusName(baseName, takenSet){
        const trimmedBase = String(baseName || '').trim() || 'STATUS';
        const normalizedBase = normStatusName(trimmedBase) || 'status';
        let candidate = `${trimmedBase}_COPY`;
        let suffix = 2;
        while(takenSet.has(normStatusName(candidate))){
            candidate = `${trimmedBase}_COPY${suffix++}`;
        }
        takenSet.add(normStatusName(candidate));
        return candidate;
    }

    // Data + State
    const BASE_VISIBLE_COLUMNS = [
        // NOTE: '비고(note)'는 모달/DB에만 저장하고 리스트에서는 표시하지 않습니다.
        'wc_name','wc_desc','hw_count','sw_count'
    ];
    const COLUMN_ORDER = [
        'wc_name','wc_desc','hw_count','sw_count','note'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '업무 상태', columns: ['wc_name','wc_desc','hw_count','sw_count','note'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        wc_name:{label:'업무 상태',group:'업무 상태'},
        wc_desc:{label:'설명',group:'업무 상태'},
        hw_count:{label:'하드웨어(수량)',group:'업무 상태'},
        sw_count:{label:'소프트웨어(수량)',group:'업무 상태'},
        note:{label:'비고',group:'업무 상태'}
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
    };

    function normalizeCount(value){
        if(value === null || value === undefined || value === '') return null;
        const num = parseInt(value, 10);
        return Number.isNaN(num) ? null : num;
    }

    function normalizeRecord(item){
        if(!item) return null;
        const safeName = item.wc_name || '';
        const color = item.wc_color || item.status_level || getFallbackColorByName(safeName) || DEFAULT_STATUS_COLOR_CLASS;
        return {
            id: item.id,
            status_code: item.status_code || '',
            status_level: item.status_level || '',
            wc_name: safeName,
            wc_desc: item.wc_desc || '',
            hw_count: normalizeCount(item.hw_count),
            sw_count: normalizeCount(item.sw_count),
            note: item.note || '',
            wc_color: color,
            created_at: item.created_at,
            updated_at: item.updated_at,
        };
    }

    async function apiRequest(url, options){
        const opts = Object.assign({ method: 'GET' }, options || {});
        opts.headers = Object.assign({}, JSON_HEADERS, opts.headers || {});
        const res = await fetch(url, opts);
        let data = null;
        try {
            data = await res.json();
        } catch(_e) {
            data = null;
        }
        if(!res.ok || (data && data.success === false)){
            const message = (data && data.message) || `요청에 실패했습니다. (HTTP ${res.status})`;
            const err = new Error(message);
            err.response = res;
            err.data = data;
            throw err;
        }
        return data;
    }

    async function apiFetchStatuses(){
        const url = `${API_ENDPOINT}?t=${Date.now()}`;
        const data = await apiRequest(url, { method: 'GET' });
        const items = Array.isArray(data?.items) ? data.items : [];
        return items.map(normalizeRecord).filter(Boolean);
    }

    async function apiCreateStatus(payload){
        const data = await apiRequest(API_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        return normalizeRecord(data?.item);
    }

    async function apiUpdateStatus(id, payload){
        const data = await apiRequest(`${API_ENDPOINT}/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        return normalizeRecord(data?.item);
    }

    async function apiDeleteStatuses(ids){
        return apiRequest(`${API_ENDPOINT}/bulk-delete`, {
            method: 'POST',
            body: JSON.stringify({ ids })
        });
    }

    async function reloadStatuses(showError){
        state.isLoading = true;
        render();
        try {
            const rows = await apiFetchStatuses();
            state.data = rows;
            state.selected.clear();
            state.isLoading = false;
            applyFilter();
        } catch(err){
            state.isLoading = false;
            render();
            if(showError !== false){
                showMessage(extractErrorMessage(err, '업무 상태 목록을 불러오지 못했습니다.'), '오류');
            }
        }
    }

    function setButtonLoading(button, isLoading, loadingText){
        if(!button) return;
        if(isLoading){
            if(!button.dataset.originalText){
                button.dataset.originalText = button.textContent;
            }
            button.disabled = true;
            if(loadingText){
                button.textContent = loadingText;
            }
            button.classList.add('is-busy');
        } else {
            button.disabled = false;
            if(button.dataset.originalText){
                button.textContent = button.dataset.originalText;
                delete button.dataset.originalText;
            }
            button.classList.remove('is-busy');
        }
    }

    function extractErrorMessage(error, fallback){
        if(!error) return fallback;
        if(typeof error === 'string') return error;
        if(error.message) return error.message;
        return fallback;
    }

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;

    async function initData(){
        await reloadStatuses(true);
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

    function render(highlightContext){
        const tbody = document.getElementById(TBODY_ID);
        if(!tbody) return;
        if(state.isLoading){
            const colCount = COLUMN_ORDER.length + 2; // checkbox + actions
            tbody.innerHTML = `<tr class="table-loading-row"><td colspan="${colCount}" class="loading-cell">데이터를 불러오는 중입니다...</td></tr>`;
            const emptyEl = document.getElementById('system-empty');
            if(emptyEl) emptyEl.hidden = true;
            const infoEl = document.getElementById(PAGINATION_INFO_ID);
            if(infoEl) infoEl.textContent = '불러오는 중...';
            const container = document.getElementById(PAGE_NUMBERS_ID);
            if(container) container.innerHTML='';
            ['system-first','system-prev','system-next','system-last'].forEach(id=>{
                const btn = document.getElementById(id);
                if(btn) btn.disabled = true;
            });
            return;
        }
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
                    if(titleEl) titleEl.textContent = '업무 상태 내역이 없습니다.';
                    if(descEl) descEl.textContent = "우측 상단 '추가' 버튼을 눌러 첫 업무 상태를 등록하세요.";
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
                    if((col==='wc_desc' || col==='note') && typeof rawVal==='string'){
                        // single-line for table display
                        rawVal = rawVal.replace(/\r?\n|\r/g,' ');
                    }
                    const displayVal = (rawVal==null || String(rawVal).trim()==='') ? '-' : rawVal;
                    let cellValue = highlight(displayVal, col);
                    // 업무 상태 컬럼: 상태 점(도트) + 텍스트 칩 스타일 적용
                    if(col === 'wc_name'){
                        const text = String(displayVal).trim();
                        let cls = '';
                        try{
                            const rec = state.data.find(r=> r.id === row.id);
                            cls = rec?.wc_color || getFallbackColorByName(text) || 'ws-wait';
                        }catch(_e){ cls = 'ws-wait'; }
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
        }
        table.querySelectorAll('thead th[data-col], tbody td[data-col]').forEach(cell=>{
            const col = cell.getAttribute('data-col');
            if(col==='actions') return;
            if(state.visibleCols.has(col)) cell.classList.remove('col-hidden'); else cell.classList.add('col-hidden');
        });
    }

    function saveColumnSelection(){
        // 컬럼 선택 기능 제거: 항상 모든 컬럼 표시
    }
    function loadColumnSelection(){
        // 컬럼 선택 기능 제거: 기본 컬럼만 표시 (비고는 리스트에서 숨김)
        state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
        try {
            localStorage.removeItem('work_class_visible_cols');
            localStorage.removeItem('system_visible_cols');
        } catch(_e){}
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

    function buildPayloadFromFormData(data){
        const payload = {
            wc_name: (data.wc_name || '').trim(),
            wc_desc: (data.wc_desc || '').trim(),
            note: (data.note || '').trim(),
            hw_count: sanitizeCountValue(data.hw_count),
            sw_count: sanitizeCountValue(data.sw_count),
            wc_color: (data.wc_color || '').trim(),
        };
        if(!payload.wc_color){
            payload.wc_color = getFallbackColorByName(payload.wc_name) || DEFAULT_STATUS_COLOR_CLASS;
        }
        return payload;
    }

    function fillEditForm(row){
        const form = document.getElementById(EDIT_FORM_ID); if(!form) return;
        form.innerHTML='';
        form.dataset.recordId = row?.id || '';
        const groups = [
            { title:'업무 상태', cols:['wc_name','wc_desc','note'] }
        ];
        groups.forEach(g=>{
            const section = document.createElement('div'); section.className='form-section';
            section.innerHTML = `<div class="section-header"><h4>${g.title}</h4></div>`;
            const grid = document.createElement('div'); grid.className='form-grid';
            g.cols.forEach(c=>{ if(!COLUMN_META[c]) return; const wrap=document.createElement('div');
                // Make only note field span full width; description stays single-line
                wrap.className = (c === 'note') ? 'form-row form-row-wide' : 'form-row';
                const labelText = COLUMN_META[c]?.label||c;
                wrap.innerHTML=`<label>${labelText}</label>${generateFieldInput(c,row[c])}`; grid.appendChild(wrap); });
            section.appendChild(grid); form.appendChild(section);
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
            // Include an inline color dot and palette for selecting status color
            return `
                <div class="status-input-wrap">
                    <input name="wc_name" class="form-input" value="${value??''}" required>
                    <button type="button" class="status-color-btn" title="상태 색상 선택" aria-label="상태 색상 선택"></button>
                    <div class="status-color-palette" role="menu" aria-label="상태 색상" hidden>
                        ${STATUS_COLOR_SWATCHES.map(cls=>`<button type="button" class="status-color-swatch ${cls}" data-color="${cls}" aria-label="색상 ${cls}"></button>`).join('')}
                    </div>
                    <input type="hidden" name="wc_color" value="">
                </div>`;
        }
        if(col==='note'){
            return `<textarea name="${col}" class="form-input textarea-large" rows="6">${value??''}</textarea>`;
        }
        if(col==='wc_desc'){
            return `<input name="wc_desc" class="form-input" value="${value??''}" placeholder="설명">`;
        }
        if(col==='hw_count' || col==='sw_count'){
            return `<input name="${col}" type="number" min="0" step="1" class="form-input" value="${value??''}" placeholder="숫자만">`;
        }
        return `<input name="${col}" class="form-input" value="${value??''}">`;
    }
    // Attach color picker events to a form (Add/Edit)
    function attachStatusColorPicker(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        const wrap = form.querySelector('.status-input-wrap');
        if(!wrap || wrap.dataset.pickerEnhanced === '1'){
            return;
        }
        if(form._statusColorOutsideHandler){
            document.removeEventListener('click', form._statusColorOutsideHandler);
            form._statusColorOutsideHandler = null;
        }
        const btn = wrap.querySelector('.status-color-btn');
        const palette = wrap.querySelector('.status-color-palette');
        const hidden = wrap.querySelector('input[name="wc_color"]');
        if(!btn || !hidden) return;
        wrap.dataset.pickerEnhanced = '1';
        const setColor = (cls)=>{
            hidden.value = cls || '';
            btn.classList.remove(...STATUS_COLOR_CLASS_POOL);
            if(cls){
                btn.classList.add(cls);
            }
            if(palette){
                palette.hidden = true;
            }
        };
        btn.addEventListener('click', ()=>{
            if(!palette) return;
            palette.hidden = !palette.hidden;
        });
        palette?.addEventListener('click', (e)=>{
            const sw = e.target.closest('.status-color-swatch');
            if(!sw) return;
            const cls = sw.getAttribute('data-color');
            setColor(cls);
        });
        const outsideHandler = (e)=>{
            if(!palette || palette.hidden) return;
            if(wrap.contains(e.target)) return;
            palette.hidden = true;
        };
        document.addEventListener('click', outsideHandler);
        form._statusColorOutsideHandler = outsideHandler;
        form._setStatusColorUI = setColor;
    }
    function getFallbackColorByName(name){
        const map = { '가동':'ws-run', '유휴':'ws-idle', '대기':'ws-wait' };
        return map[String(name||'').trim()] || DEFAULT_STATUS_COLOR_CLASS;
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
    const filename = `work_status_list_${yyyy}${mm}${dd}.csv`;
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
                    // live-sync for license fields within edit form
                    attachLicenseLiveSync(EDIT_FORM_ID);
                    // enhance date inputs with Flatpickr
                    initDatePickers(EDIT_FORM_ID);
                    // attach status color picker and set initial color
                    attachStatusColorPicker(EDIT_FORM_ID);
                    try{
                        const form = document.getElementById(EDIT_FORM_ID);
                        const initColor = row.wc_color || getFallbackColorByName(row.wc_name) || DEFAULT_STATUS_COLOR_CLASS;
                        form?._setStatusColorUI?.(initColor);
                    }catch(_e){}
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
    document.getElementById(ADD_BTN_ID)?.addEventListener('click', ()=> { 
            openModal(ADD_MODAL_ID);
            attachStatusColorPicker(ADD_FORM_ID);
            try{
                const form = document.getElementById(ADD_FORM_ID);
                form?._setStatusColorUI?.(DEFAULT_STATUS_COLOR_CLASS);
            }catch(_e){}
        });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(ADD_FORM_ID);
            if(!form) return;
            if(!form.checkValidity()){ form.reportValidity(); return; }
            const raw = collectForm(form);
            const payload = buildPayloadFromFormData(raw);
            if(!payload.wc_name){
                showMessage('업무 상태명을 입력하세요.', '안내');
                return;
            }
            if(hasStatusName(payload.wc_name)){
                showMessage('이미 존재하는 업무 상태입니다. 다른 이름을 입력하세요.', '중복 확인');
                return;
            }
            const button = document.getElementById(ADD_SAVE_ID);
            try {
                setButtonLoading(button, true, '등록 중...');
                await apiCreateStatus(payload);
                form.reset();
                form?._setStatusColorUI?.(DEFAULT_STATUS_COLOR_CLASS);
                closeModal(ADD_MODAL_ID);
                await reloadStatuses();
                showMessage('업무 상태가 등록되었습니다.', '완료');
            } catch(err){
                showMessage(extractErrorMessage(err, '업무 상태 등록 중 오류가 발생했습니다.'), '오류');
            } finally {
                setButtonLoading(button, false);
            }
        });
        // edit modal
    document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(EDIT_FORM_ID);
            if(!form) return;
            if(!form.checkValidity()){ form.reportValidity(); return; }
            const recordId = parseInt(form.dataset.recordId || '-1', 10);
            if(!Number.isInteger(recordId) || recordId <= 0){
                showMessage('수정할 항목을 찾을 수 없습니다.', '오류');
                return;
            }
            const raw = collectForm(form);
            const payload = buildPayloadFromFormData(raw);
            if(hasStatusName(payload.wc_name, recordId)){
                showMessage('이미 존재하는 업무 상태입니다. 다른 이름을 입력하세요.', '중복 확인');
                return;
            }
            const button = document.getElementById(EDIT_SAVE_ID);
            try {
                setButtonLoading(button, true, '저장 중...');
                await apiUpdateStatus(recordId, payload);
                closeModal(EDIT_MODAL_ID);
                await reloadStatuses();
                showMessage('업무 상태가 수정되었습니다.', '완료');
            } catch(err){
                showMessage(extractErrorMessage(err, '업무 상태 수정 중 오류가 발생했습니다.'), '오류');
            } finally {
                setButtonLoading(button, false);
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
                        const wide = ['소프트웨어 이름','라이선스 설명'];
                        const mid = ['소프트웨어 구분','소프트웨어 제조사','소프트웨어 담당부서','소프트웨어 담당자'];
                        if(wide.includes(h)) return { wch: 20 };
                        if(mid.includes(h)) return { wch: 16 };
                        return { wch: 14 };
                    });

                // Guide sheet: rules and allowed values (Korean)
                const rules = [
                    ['엑셀 업로드 가이드'],
                    [''],
                    ['작성 규칙'],
                    ['- 첫 행의 컬럼 제목은 아래 순서와 완전히 일치해야 합니다. (순서/이름 변경 불가)'],
                    ['- "라이선스 전체수량", "라이선스 할당수량", "라이선스 유휴수량"은 숫자만 입력하세요.'],
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
                XLSX.writeFile(wb, 'work_status_upload_template.xlsx');
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
            reader.onload = async ()=>{
                try{
                    const data = new Uint8Array(reader.result);
                    const wb = window.XLSX.read(data, {type:'array'});
                    const sheetName = wb.SheetNames[0]; if(!sheetName){ showMessage('엑셀 시트를 찾을 수 없습니다.', '업로드 오류'); return; }
                    const ws = wb.Sheets[sheetName];
                    const rows = window.XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
                    if(!rows || rows.length===0){ showMessage('엑셀 데이터가 비어있습니다.', '업로드 오류'); return; }
                    const header = rows[0].map(h=> String(h).trim());
                    // Header validation: exact match and order (allow optional wc_color column at the end in the future)
                    const allowExtraColor = header.length === UPLOAD_HEADERS_KO.length + 1 && header[header.length-1] === '상태색상(선택)';
                    if((!allowExtraColor && (header.length !== UPLOAD_HEADERS_KO.length || !header.every((h,i)=> h===UPLOAD_HEADERS_KO[i])))){
                        // Special handling: if '보안 점수' 포함, 안내 메시지 추가
                        showMessage('업로드 실패: 컬럼 제목이 현재 테이블과 일치하지 않습니다.\n반드시 아래 순서로 작성하세요:\n- ' + UPLOAD_HEADERS_KO.join(', '), '업로드 실패');
                        return;
                    }
                    const errors = [];
                    const imported = [];
                    // Track duplicates within the file
                    const seenInFile = new Set();
                    // Existing names in current data
                    const existingNames = new Set(state.data.map(r=> normStatusName(r.wc_name)).filter(Boolean));
                    for(let r=1; r<rows.length; r++){
                        const row = rows[r]; if(isEmptyRow(row)) continue;
                        const rec = {};
                        for(let c=0; c<header.length; c++){
                            const label = header[c]; const key = HEADER_KO_TO_KEY[label];
                            if(key){
                                rec[key] = String(row[c]??'').trim();
                            } else if(label==='상태색상(선택)'){
                                rec.wc_color = String(row[c]??'').trim();
                            }
                        }
                        // Required: 업무 상태 명 존재
                        const nameKey = normStatusName(rec.wc_name);
                        if(!nameKey){ errors.push(`Row ${r+1}: 업무 상태는 필수입니다.`); }
                        // Duplicate check within file
                        if(nameKey){
                            if(seenInFile.has(nameKey)){
                                errors.push(`Row ${r+1}: 업로드 파일 내 중복된 업무 상태 '${rec.wc_name}' 입니다.`);
                            } else {
                                seenInFile.add(nameKey);
                            }
                            // Duplicate against existing data
                            if(existingNames.has(nameKey)){
                                errors.push(`Row ${r+1}: 현재 목록에 이미 존재하는 업무 상태 '${rec.wc_name}' 입니다.`);
                            }
                        }
                        // Numeric validations for this page
                        if(rec.hw_count !== '' && !isIntegerLike(rec.hw_count)) errors.push(`Row ${r+1}: 하드웨어(수량)은 숫자만 입력하세요.`);
                        if(rec.sw_count !== '' && !isIntegerLike(rec.sw_count)) errors.push(`Row ${r+1}: 소프트웨어(수량)은 숫자만 입력하세요.`);
                        // Normalize numbers
                        const hwNorm = toIntOrBlank(rec.hw_count);
                        const swNorm = toIntOrBlank(rec.sw_count);
                        rec.hw_count = hwNorm === '' ? null : hwNorm;
                        rec.sw_count = swNorm === '' ? null : swNorm;
                        // Assign color fallback if not provided
                        rec.wc_color = rec.wc_color || getFallbackColorByName(rec.wc_name) || DEFAULT_STATUS_COLOR_CLASS;
                        imported.push(rec);
                    }
                    if(errors.length){
                        const preview = errors.slice(0, 20).join('\n');
                        const more = errors.length>20 ? `\n...외 ${errors.length-20}건` : '';
                        showMessage(`업로드 실패: 유효성 검사 오류가 있습니다.\n\n${preview}${more}`, '업로드 실패');
                        return;
                    }
                    await persistImportedStatuses(imported);
                }catch(e){ console.error(e); showMessage('엑셀 파싱 중 오류가 발생했습니다. 파일을 확인해주세요.', '업로드 오류'); }
            };
            reader.onerror = ()=> showMessage('파일을 읽는 중 오류가 발생했습니다.', '업로드 오류');
            reader.readAsArrayBuffer(f);
        });

    async function persistImportedStatuses(records){
        if(!records || !records.length){
            showMessage('업로드할 데이터가 없습니다.', '업로드 안내');
            return;
        }
        const button = document.getElementById(UPLOAD_CONFIRM_ID);
        try { setButtonLoading(button, true, '업로드 중...'); } catch(_e){}
        let success = 0;
        const failures = [];
        const takenNames = new Set(state.data.map(r=> normStatusName(r.wc_name)).filter(Boolean));
        for(const rec of records){
            // Ensure name uniqueness vs latest data to prevent collisions during batch imports
            if(takenNames.has(normStatusName(rec.wc_name))){
                failures.push(`${rec.wc_name}: 이미 존재하는 업무 상태입니다.`);
                continue;
            }
            try {
                await apiCreateStatus(rec);
                success += 1;
                takenNames.add(normStatusName(rec.wc_name));
            } catch(err){
                failures.push(`${rec.wc_name || '(이름 없음)'}: ${extractErrorMessage(err, '등록 실패')}`);
            }
        }
        setButtonLoading(button, false);
        await reloadStatuses();
        closeModal(UPLOAD_MODAL_ID);
        if(success && !failures.length){
            showMessage(`${success}개 행이 업로드되었습니다.`, '업로드 완료');
            return;
        }
        if(!success && failures.length){
            const preview = failures.slice(0, 5).join('\n');
            const more = failures.length > 5 ? `\n...외 ${failures.length - 5}건 실패` : '';
            showMessage(`업로드에 실패했습니다.\n${preview}${more}`, '업로드 실패');
            return;
        }
        const preview = failures.slice(0, 5).join('\n');
        const more = failures.length > 5 ? `\n...외 ${failures.length - 5}건 실패` : '';
        showMessage(`${success}건 성공, ${failures.length}건 실패\n${preview}${more}`, '업로드 결과');
    }
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
            const originals = state.data.filter(r=> state.selected.has(r.id));
            if(!originals.length){
                showMessage('선택된 행을 찾을 수 없습니다.', '오류');
                closeModal('system-duplicate-modal');
                return;
            }
            const button = document.getElementById('system-duplicate-confirm');
            const taken = new Set(state.data.map(r=> normStatusName(r.wc_name)).filter(Boolean));
            const failures = [];
            let success = 0;
            try {
                setButtonLoading(button, true, '복제 중...');
                for(const row of originals){
                    const cloneName = makeUniqueStatusName(row.wc_name, taken);
                    const payload = {
                        wc_name: cloneName,
                        wc_desc: row.wc_desc || '',
                        note: row.note || '',
                        hw_count: row.hw_count ?? null,
                        sw_count: row.sw_count ?? null,
                        wc_color: row.wc_color || getFallbackColorByName(row.wc_name) || DEFAULT_STATUS_COLOR_CLASS,
                    };
                    try {
                        await apiCreateStatus(payload);
                        success += 1;
                    } catch(err){
                        failures.push(`${cloneName}: ${extractErrorMessage(err, '복제 실패')}`);
                    }
                }
            } finally {
                setButtonLoading(button, false);
            }
            closeModal('system-duplicate-modal');
            await reloadStatuses();
            if(!failures.length){
                showMessage(`${success}개 행이 복제되었습니다.`, '완료');
            } else {
                const preview = failures.slice(0, 5).join('\n');
                const more = failures.length > 5 ? `\n...외 ${failures.length - 5}건 실패` : '';
                showMessage(`${success}건 성공, ${failures.length}건 실패\n${preview}${more}`, '복제 결과');
            }
        });
        // dispose (불용처리)
        document.getElementById(DISPOSE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('불용처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('dispose-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 업무 상태를 정말 불용처리하시겠습니까?`; }
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
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 업무 상태를 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', async ()=>{
            const ids = [...state.selected].map(id=> parseInt(id, 10)).filter(id=> Number.isInteger(id) && id > 0);
            if(!ids.length){
                showMessage('삭제할 행을 선택하세요.', '안내');
                return;
            }
            const button = document.getElementById(DELETE_CONFIRM_ID);
            try {
                setButtonLoading(button, true, '삭제 중...');
                await apiDeleteStatuses(ids);
                closeModal(DELETE_MODAL_ID);
                await reloadStatuses();
                showMessage(`${ids.length}개 항목이 삭제되었습니다.`, '완료');
            } catch(err){
                showMessage(extractErrorMessage(err, '삭제 처리 중 오류가 발생했습니다.'), '오류');
            } finally {
                setButtonLoading(button, false);
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
                if(editSaveEl){ editSaveEl.setAttribute('data-index', realIndex); }
                return;
            }
            // 2개 이상 → 일괄변경 모달
                    const subtitle = document.getElementById('bulk-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 소프트웨어에서 지정한 필드를 일괄 변경합니다.`; }
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
            const payload = {};
            entries.forEach(({field, value})=>{
                if(field === 'hw_count' || field === 'sw_count'){
                    const normalized = sanitizeCountValue(value);
                    if(normalized !== null) payload[field] = normalized;
                    return;
                }
                const trimmed = String(value || '').trim();
                if(trimmed !== '') payload[field] = trimmed;
            });
            if(Object.keys(payload).length === 0){
                showMessage('적용할 값을 입력하세요.', '안내');
                return;
            }
            const ids = [...state.selected].map(id=> parseInt(id, 10)).filter(id=> Number.isInteger(id) && id > 0);
            if(!ids.length){
                showMessage('일괄변경할 행을 선택하세요.', '안내');
                return;
            }
            const button = document.getElementById(BULK_APPLY_ID);
            const failures = [];
            try {
                setButtonLoading(button, true, '적용 중...');
                for(const id of ids){
                    try {
                        await apiUpdateStatus(id, payload);
                    } catch(err){
                        failures.push(`ID ${id}: ${extractErrorMessage(err, '적용 실패')}`);
                    }
                }
            } finally {
                setButtonLoading(button, false);
            }
            closeModal(BULK_MODAL_ID);
            await reloadStatuses();
            if(!failures.length){
                showMessage(`${ids.length}개 항목에 일괄 변경이 적용되었습니다.`, '완료');
            } else {
                const preview = failures.slice(0, 5).join('\n');
                const more = failures.length > 5 ? `\n...외 ${failures.length - 5}건 실패` : '';
                showMessage(`${ids.length - failures.length}건 성공, ${failures.length}건 실패\n${preview}${more}`, '일괄 변경 결과');
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
            if(col === 'wc_desc'){
                return `<input class="form-input" data-bulk-field="${col}" placeholder="설명">`;
            }
            return `<input class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }
        const GROUPS = [
            { title:'업무 상태', cols:['wc_name','wc_desc','note'] }
        ];
        form.innerHTML = GROUPS.map(g=>{
            const fields = g.cols.filter(c=> !EXCLUDE.has(c));
            if(!fields.length) return '';
            const grid = fields.map(col=>{
                const meta = COLUMN_META[col]; if(!meta) return '';
                const wide = (col === 'note');
                return `<div class="${wide ? 'form-row form-row-wide' : 'form-row'}"><label>${meta.label}</label>${inputFor(col)}</div>`;
            }).join('');
            return `
                <div class="form-section">
                    <div class="section-header"><h4>${g.title}</h4></div>
                    <div class="form-grid">${grid}</div>
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
    // Top 10 by 업무 상태 (sum of counts per 상태)
        const hwByClass = sumBy(rows, 'wc_name', 'hw_count');
        const swByClass = sumBy(rows, 'wc_name', 'sw_count');
    renderStatBlock('stats-software', '하드웨어 Top 10 (업무 상태)', hwByClass, null, { topN: 10, includeOther: false });
    renderStatBlock('stats-software', '소프트웨어 Top 10 (업무 상태)', swByClass, null, { topN: 10, includeOther: false });
    }
    }

    // (조건 필터 관련 함수 제거됨)

    function init(){
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
        initData();
        bindEvents();
        render();
        // Page adornments (animation + popover)
}
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


