/**
 * 센터/부서 리스트 관리 페이지 스크립트
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
    async function initDatePickers(_formId){ /* not used on Center page */ }
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
    const API_ENDPOINT = '/api/org-departments';
    const COMPANY_API_ENDPOINT = '/api/org-companies';
    const JSON_HEADERS = { 'Content-Type': 'application/json', 'Accept': 'application/json' };

    function parsePositiveInt(value){
        if(value === undefined || value === null) return null;
        const trimmed = String(value).trim();
        if(trimmed === '') return null;
        const parsed = Number.parseInt(trimmed, 10);
        if(Number.isFinite(parsed) && parsed >= 0) return parsed;
        return null;
    }

    function sanitizeText(value){
        return (value ?? '').trim();
    }

    function buildDepartmentPayload(source, options){
        const opts = options || {};
        const skipEmpty = !!opts.skipEmpty;
        const payload = {};
        const companyName = sanitizeText(source.company_name ?? source.company);
        if(companyName){
            payload.company_name = companyName;
        } else if(!skipEmpty){
            payload.company_name = '';
        }
        const name = sanitizeText(source.dept_name);
        if(name){
            payload.dept_name = name;
        } else if(!skipEmpty){
            payload.dept_name = '';
        }
        const description = sanitizeText(source.description);
        if(description){
            payload.description = description;
        } else if(!skipEmpty){
            payload.description = null;
        }
        const note = sanitizeText(source.note);
        if(note){
            payload.note = note;
        } else if(!skipEmpty){
            payload.note = null;
        }
        const staffCount = parsePositiveInt(source.staff_count ?? source.member_count);
        if(staffCount !== null){
            payload.staff_count = staffCount;
        } else if(!skipEmpty){
            payload.staff_count = 0;
        }
        // NOTE: hw_qty/sw_qty are treated as derived counts on the UI.
        // Only include them if they were explicitly provided by the caller.
        const hasHw = Object.prototype.hasOwnProperty.call(source, 'hw_qty') || Object.prototype.hasOwnProperty.call(source, 'hw_count');
        if(hasHw){
            const hwQty = parsePositiveInt(source.hw_qty ?? source.hw_count);
            if(hwQty !== null){
                payload.hw_qty = hwQty;
            } else if(!skipEmpty){
                payload.hw_qty = 0;
            }
        }
        const hasSw = Object.prototype.hasOwnProperty.call(source, 'sw_qty') || Object.prototype.hasOwnProperty.call(source, 'sw_count');
        if(hasSw){
            const swQty = parsePositiveInt(source.sw_qty ?? source.sw_count);
            if(swQty !== null){
                payload.sw_qty = swQty;
            } else if(!skipEmpty){
                payload.sw_qty = 0;
            }
        }
        return payload;
    }

    function normalizeDepartmentRow(row){
        const safeInt = (val)=>{
            if(val === undefined || val === null || val === '') return 0;
            const parsed = Number.parseInt(val, 10);
            return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
        };
        return {
            id: row?.id ?? null,
            dept_code: row?.dept_code || '',
            company_name: row?.company_name || row?.company || '',
            dept_name: row?.dept_name || '',
            description: row?.description || '',
            staff_count: safeInt(row?.staff_count ?? row?.member_count),
            member_count: safeInt(row?.member_count ?? row?.staff_count),
            rack_qty: safeInt(row?.rack_qty ?? row?.rack_count),
            rack_count: safeInt(row?.rack_count ?? row?.rack_qty),
            hw_qty: safeInt(row?.hw_qty ?? row?.hw_count),
            hw_count: safeInt(row?.hw_count ?? row?.hw_qty),
            sw_qty: safeInt(row?.sw_qty ?? row?.sw_count),
            sw_count: safeInt(row?.sw_count ?? row?.sw_qty),
            line_qty: safeInt(row?.line_qty ?? row?.line_count),
            line_count: safeInt(row?.line_count ?? row?.line_qty),
            note: row?.note || row?.remark || '',
            remark: row?.remark || row?.note || '',
            manager_name: row?.manager_name || '',
            manager_emp_no: row?.manager_emp_no || '',
            parent_dept_code: row?.parent_dept_code || '',
            created_at: row?.created_at || '',
            created_by: row?.created_by || '',
            updated_at: row?.updated_at || '',
            updated_by: row?.updated_by || '',
            is_deleted: row?.is_deleted || 0
        };
    }

    function normalizeDepartmentKey(companyName, deptName){
        const company = String(companyName || '').trim().toLowerCase();
        const dept = String(deptName || '').trim().toLowerCase();
        if(!company || !dept) return '';
        return `${company}::${dept}`;
    }

    function dedupeDepartmentRows(rows){
        const list = Array.isArray(rows) ? rows : [];
        const seen = new Set();
        const out = [];
        list.forEach((row)=>{
            if(!row) return;
            const key = normalizeDepartmentKey(row.company_name, row.dept_name);
            if(!key){
                out.push(row);
                return;
            }
            if(seen.has(key)) return;
            seen.add(key);
            out.push(row);
        });
        return out;
    }

    function hasDepartmentDuplicate(companyName, deptName, excludeId){
        const key = normalizeDepartmentKey(companyName, deptName);
        if(!key) return false;
        return state.data.some((row)=>{
            if(!row) return false;
            if(excludeId != null && Number(row.id) === Number(excludeId)) return false;
            return normalizeDepartmentKey(row.company_name, row.dept_name) === key;
        });
    }

    async function fetchDepartmentList(){
        const response = await fetch(`${API_ENDPOINT}?_=${Date.now()}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin'
        });
        const json = await response.json().catch(()=> ({}));
        if(!response.ok || json.success === false){
            throw new Error(json?.message || '부서 목록을 불러오지 못했습니다.');
        }
        const mapped = Array.isArray(json.items) ? json.items.map(normalizeDepartmentRow) : [];
        return dedupeDepartmentRows(mapped);
    }

    async function createDepartment(payload){
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: JSON_HEADERS,
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        });
        const json = await response.json().catch(()=> ({}));
        if(!response.ok || json.success === false){
            throw new Error(json?.message || '부서 등록에 실패했습니다.');
        }
        return normalizeDepartmentRow(json.item || {});
    }

    async function updateDepartment(id, payload){
        const response = await fetch(`${API_ENDPOINT}/${id}`, {
            method: 'PUT',
            headers: JSON_HEADERS,
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        });
        const json = await response.json().catch(()=> ({}));
        if(!response.ok || json.success === false){
            throw new Error(json?.message || '부서 수정에 실패했습니다.');
        }
        return normalizeDepartmentRow(json.item || {});
    }

    async function deleteDepartments(ids){
        const response = await fetch(`${API_ENDPOINT}/bulk-delete`, {
            method: 'POST',
            headers: JSON_HEADERS,
            credentials: 'same-origin',
            body: JSON.stringify({ ids })
        });
        const json = await response.json().catch(()=> ({}));
        if(!response.ok || json.success === false){
            throw new Error(json?.message || '부서 삭제에 실패했습니다.');
        }
        return json;
    }

    async function refreshDepartments(){
        try {
            state.isLoading = true;
            render();
            const rows = await fetchDepartmentList();
            state.data = rows;
            state.selected.clear();
            renderCompanyFilterOptions();
        } catch(err){
            console.error(err);
            showMessage(err.message || '부서 데이터를 불러오는 중 오류가 발생했습니다.', '오류');
        } finally {
            state.isLoading = false;
            applyFilter();
        }
    }

    let companyOptions = [];

    function renderCompanyFilterOptions(){
        const select = document.getElementById('system-company-filter');
        if(!select) return;

        const selected = String(state.companyFilter || '').trim();
        const dataCompanies = state.data
            .map((row)=> String(row?.company_name || '').trim())
            .filter(Boolean);
        const merged = Array.from(new Set([].concat(companyOptions, dataCompanies, selected ? [selected] : [])))
            .sort((a, b)=> a.localeCompare(b, 'ko'));

        const options = ['<option value="">전체 회사</option>'];
        merged.forEach((name)=>{
            const safe = escapeHTML(name);
            const selectedAttr = selected === name ? ' selected' : '';
            options.push(`<option value="${safe}"${selectedAttr}>${safe}</option>`);
        });
        select.innerHTML = options.join('');
    }

    async function ensureCompanyOptions(forceReload){
        if(!forceReload && companyOptions.length){
            return companyOptions;
        }
        const response = await fetch(`${COMPANY_API_ENDPOINT}?_=${Date.now()}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin'
        });
        const json = await response.json().catch(()=> ({}));
        if(!response.ok || json.success === false){
            throw new Error(json?.message || '회사 목록을 불러오지 못했습니다.');
        }
        const items = Array.isArray(json.items) ? json.items : [];
        companyOptions = items
            .map((row)=> String(row?.company_name || '').trim())
            .filter(Boolean);
        renderCompanyFilterOptions();
        return companyOptions;
    }

    function renderCompanySelect(selectEl, selectedValue){
        if(!selectEl) return;
        const selected = String(selectedValue || '').trim();
        const options = ['<option value="">회사 선택</option>'];
        companyOptions.forEach((name)=>{
            const safe = escapeHTML(name);
            const selectedAttr = selected === name ? ' selected' : '';
            options.push(`<option value="${safe}"${selectedAttr}>${safe}</option>`);
        });
        selectEl.innerHTML = options.join('');
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
    // Upload template (Department schema)
    const UPLOAD_HEADERS_KO = [
        '부서명','설명','담당자수','하드웨어(수량)','소프트웨어(수량)','비고'
    ];
    const HEADER_KO_TO_KEY = {
        '부서명':'dept_name',
        '설명':'description',
        '담당자수':'staff_count',
        'RACK(수량)':'rack_qty',
        '하드웨어(수량)':'hw_qty',
        '소프트웨어(수량)':'sw_qty',
        '회선(수량)':'line_qty',
        '비고':'note'
    };
    const ENUM_SETS = { };
    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
    function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }

    // Data + State
    const BASE_VISIBLE_COLUMNS = [
        'company_name','dept_name','description','staff_count','rack_qty','hw_qty','sw_qty','line_qty'
    ];
    const COLUMN_ORDER = [
        'company_name','dept_name','description','staff_count','rack_qty','hw_qty','sw_qty','line_qty','note'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '부서', columns: ['company_name','dept_name','description','staff_count','rack_qty','hw_qty','sw_qty','line_qty'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        company_name:{label:'회사',group:'부서'},
        dept_name:{label:'부서명',group:'부서'},
        description:{label:'설명',group:'부서'},
        staff_count:{label:'담당자수',group:'부서'},
        rack_qty:{label:'RACK(수량)',group:'부서'},
        hw_qty:{label:'하드웨어(수량)',group:'부서'},
        sw_qty:{label:'소프트웨어(수량)',group:'부서'},
        line_qty:{label:'회선(수량)',group:'부서'},
        note:{label:'비고',group:'부서'}
    };

    let state = {
        data: [],
        filtered: [],
        pageSize: 10,
        page: 1,
        visibleCols: new Set(BASE_VISIBLE_COLUMNS),
        search: '',
        companyFilter: '',
        // 선택된 행 (row id 기반) 저장하여 리렌더 후에도 유지
        selected: new Set(),
        sortKey: null,
        sortDir: 'asc',
        columnFilters: {}, // { col: value | [values...] } (조건 필터 기능 제거 예정 - 빈 유지)
        isLoading: false
    };

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;


    function applyFilter(){
        if(state.isLoading && state.data.length === 0){
            state.filtered = [];
            render();
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
        // 2단계: 회사 드롭다운 필터 적용
        if(state.companyFilter){
            const companyToken = String(state.companyFilter).trim().toLowerCase();
            base = base.filter(row => String(row.company_name || '').trim().toLowerCase() === companyToken);
        }

        // 3단계: 컬럼 개별 필터 적용 (오른쪽 클릭 필터)
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

    function getColumnCount(){
        const headerRow = document.querySelector(`#${TABLE_ID} thead tr`);
        if(headerRow && headerRow.children?.length){
            return headerRow.children.length;
        }
        return 8;
    }

    function render(highlightContext){
        const tbody = document.getElementById(TBODY_ID);
        if(!tbody) return;
        tbody.innerHTML='';
        if(state.isLoading){
            tbody.innerHTML = '';
            const emptyEl = document.getElementById('system-empty');
            if(emptyEl){ emptyEl.hidden = true; }
            updatePagination();
            return;
        }
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
                    if(titleEl) titleEl.textContent = '부서 내역이 없습니다.';
                    if(descEl) descEl.textContent = "우측 상단 '추가' 버튼을 눌러 첫 부서를 등록하세요.";
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
                    if((col==='note' || col==='description') && typeof rawVal==='string'){
                        // single-line for table display
                        rawVal = rawVal.replace(/\r?\n|\r/g,' ');
                    }
                    const displayVal = (rawVal==null || String(rawVal).trim()==='') ? '-' : rawVal;
                    let cellValue = highlight(displayVal, col);
                    // no date-based indicator on Center page
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
        // Column selection feature removed for Department page; keep the fixed default set.
        state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
        try { localStorage.removeItem('system_visible_cols'); } catch(_e){}
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
        form.querySelectorAll('input,select,textarea').forEach(el=>{ data[el.name]=el.value.trim(); });
        return data;
    }

    function fillEditForm(row){
        const form = document.getElementById(EDIT_FORM_ID); if(!form) return;
        form.innerHTML='';
        const group = { title:'부서', cols:['company_name','dept_name','description'] };
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

        // Keep staff_count unchanged (hidden field) while hiding it from the modal UI.
        const hiddenStaff = document.createElement('input');
        hiddenStaff.type = 'hidden';
        hiddenStaff.name = 'staff_count';
        hiddenStaff.value = String((row && row.staff_count != null) ? row.staff_count : 0);
        form.appendChild(hiddenStaff);
    }

    function generateFieldInput(col,value=''){
        if(col==='company_name'){
            const selected = String(value ?? '').trim();
            const options = ['<option value="">회사 선택</option>'];
            companyOptions.forEach((name)=>{
                const safe = escapeHTML(name);
                const selectedAttr = selected === name ? ' selected' : '';
                options.push(`<option value="${safe}"${selectedAttr}>${safe}</option>`);
            });
            return `<select name="company_name" class="form-input search-select" data-searchable="true" data-placeholder="회사 선택" required>${options.join('')}</select>`;
        }
        if(col==='rack_qty' || col==='hw_qty' || col==='sw_qty' || col==='line_qty'){
            return `<input name="${col}" type="number" min="0" step="1" class="form-input qty-dashed-lock" value="${value??''}" placeholder="0" readonly tabindex="-1" style="opacity:0.65;cursor:default">`;
        }
        if(col==='staff_count'){
            return `<input name="${col}" type="number" min="0" step="1" class="form-input qty-dashed-lock" value="${value??''}" placeholder="0">`;
        }
        if(col==='description'){
            return `<input name="description" class="form-input" value="${value??''}" placeholder="예: 네트워크/보안 담당">`;
        }
        if(col==='note'){
            return `<textarea name="note" class="form-input textarea-large" rows="6">${value??''}</textarea>`;
        }
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
    const filename = `department_list_${yyyy}${mm}${dd}.csv`;
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
        const companyFilterSel = document.getElementById('system-company-filter');
        if(companyFilterSel){
            companyFilterSel.addEventListener('change', e=>{
                state.companyFilter = String(e.target.value || '').trim();
                applyFilter();
            });
        }
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
                    try {
                        await ensureCompanyOptions();
                    } catch (err) {
                        showMessage(err.message || '회사 목록 조회 중 오류가 발생했습니다.', '오류');
                        return;
                    }
                    fillEditForm(row);
                    openModal(EDIT_MODAL_ID);
                    try{ window.BlossomSearchableSelect?.syncAll?.(document.getElementById(EDIT_FORM_ID)); }catch(_e){}
                    const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                    if(editSaveEl){
                        editSaveEl.setAttribute('data-id', String(rid));
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
        // column selection feature removed for Department page
    // add modal
    document.getElementById(ADD_BTN_ID)?.addEventListener('click', async ()=> {
            try {
                await ensureCompanyOptions();
                const addForm = document.getElementById(ADD_FORM_ID);
                const companySelect = addForm ? addForm.querySelector('[name="company_name"]') : null;
                renderCompanySelect(companySelect, '');
            } catch (err) {
                showMessage(err.message || '회사 목록 조회 중 오류가 발생했습니다.', '오류');
                return;
            }
            openModal(ADD_MODAL_ID);
            try{ window.BlossomSearchableSelect?.syncAll?.(document.getElementById(ADD_FORM_ID)); }catch(_e){}
        });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(ADD_FORM_ID); if(!form) return;
            if(!form.checkValidity()){ form.reportValidity(); return; }
            const data = collectForm(form);
            const payload = buildDepartmentPayload(data);
            if(!payload.company_name){ showMessage('회사를 선택하세요.', '안내'); return; }
            if(!payload.dept_name){ showMessage('부서명을 입력하세요.', '안내'); return; }
            if(hasDepartmentDuplicate(payload.company_name, payload.dept_name, null)){
                showMessage('중복된 부서명입니다. 동일 회사 내 부서명은 중복 등록할 수 없습니다.', '중복 금지');
                return;
            }
            const btn = document.getElementById(ADD_SAVE_ID);
            try {
                if(btn) btn.disabled = true;
                await createDepartment(payload);
                form.reset();
                closeModal(ADD_MODAL_ID);
                await refreshDepartments();
                showMessage('부서가 등록되었습니다.', '완료');
            } catch(err){
                console.error(err);
                showMessage(err.message || '부서 등록 중 오류가 발생했습니다.', '오류');
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
            const recordId = parseInt(saveBtn?.getAttribute('data-id') || '-1', 10);
            if(!Number.isFinite(recordId) || recordId <= 0){
                showMessage('수정 대상 정보를 찾을 수 없습니다.', '오류');
                return;
            }
            const data = collectForm(form);
            const payload = buildDepartmentPayload(data);
            if(!payload.company_name){ showMessage('회사를 선택하세요.', '안내'); return; }
            if(!payload.dept_name){ showMessage('부서명을 입력하세요.', '안내'); return; }
            if(hasDepartmentDuplicate(payload.company_name, payload.dept_name, recordId)){
                showMessage('중복된 부서명입니다. 동일 회사 내 부서명은 중복 저장할 수 없습니다.', '중복 금지');
                return;
            }
            try {
                if(saveBtn) saveBtn.disabled = true;
                await updateDepartment(recordId, payload);
                closeModal(EDIT_MODAL_ID);
                await refreshDepartments();
                showMessage('부서 정보가 저장되었습니다.', '완료');
            } catch(err){
                console.error(err);
                showMessage(err.message || '부서 수정 중 오류가 발생했습니다.', '오류');
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
            showMessage('카테고리 중복 금지 정책으로 행 복제는 비활성화되었습니다.', '중복 금지');
        });
        document.getElementById('system-duplicate-close')?.addEventListener('click', ()=> closeModal('system-duplicate-modal'));
        document.getElementById('system-duplicate-confirm')?.addEventListener('click', async ()=>{
            closeModal('system-duplicate-modal');
            showMessage('카테고리 중복 금지 정책으로 행 복제는 비활성화되었습니다.', '중복 금지');
        });
        // delete (삭제처리)
        document.getElementById(DELETE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('삭제처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('delete-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 부서를 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', async ()=>{
            const ids = [...state.selected];
            if(ids.length === 0){ closeModal(DELETE_MODAL_ID); return; }
            const btn = document.getElementById(DELETE_CONFIRM_ID);
            try {
                if(btn) btn.disabled = true;
                await deleteDepartments(ids);
                state.selected.clear();
                closeModal(DELETE_MODAL_ID);
                await refreshDepartments();
                showMessage(`${ids.length}개 항목이 삭제되었습니다.`, '완료');
            } catch(err){
                console.error(err);
                showMessage(err.message || '부서 삭제 중 오류가 발생했습니다.', '오류');
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
                try{ window.BlossomSearchableSelect?.syncAll?.(document.getElementById(EDIT_FORM_ID)); }catch(_e){}
                const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                if(editSaveEl){ editSaveEl.setAttribute('data-id', String(onlyId)); }
                return;
            }
            // 2개 이상 → 일괄변경 모달
            const subtitle = document.getElementById('bulk-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 부서에서 지정한 필드를 일괄 변경합니다.`; }
            buildBulkForm();
            openModal(BULK_MODAL_ID);
            try{ window.BlossomSearchableSelect?.syncAll?.(document.getElementById(BULK_FORM_ID)); }catch(_e){}
        });
        document.getElementById(BULK_CLOSE_ID)?.addEventListener('click', ()=> closeModal(BULK_MODAL_ID));
        document.getElementById(BULK_APPLY_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(BULK_FORM_ID); if(!form) return;
            const entries = [...form.querySelectorAll('[data-bulk-field]')]
                .map(el=>({ field: el.getAttribute('data-bulk-field'), value: el.value.trim() }))
                .filter(p=> p.value !== '');
            if(!entries.length){ showMessage('변경할 값을 1개 이상 입력하세요.', '안내'); return; }
            const ids = [...state.selected];
            if(!ids.length){ showMessage('선택된 행이 없습니다.', '안내'); return; }
            const rawPatch = entries.reduce((acc, cur)=>{ acc[cur.field] = cur.value; return acc; }, {});
            const payload = buildDepartmentPayload(rawPatch, { skipEmpty: true });
            if(!Object.keys(payload).length){ showMessage('적용할 필드를 확인할 수 없습니다.', '오류'); return; }
            const btn = document.getElementById(BULK_APPLY_ID);
            try {
                if(btn) btn.disabled = true;
                for(const id of ids){
                    await updateDepartment(id, payload);
                }
                closeModal(BULK_MODAL_ID);
                await refreshDepartments();
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
        function inputFor(col){
            if(col === 'company_name'){
                const options = ['<option value="">회사 선택</option>'];
                companyOptions.forEach((name)=>{
                    const safe = escapeHTML(name);
                    options.push(`<option value="${safe}">${safe}</option>`);
                });
                return `<select class="form-input search-select" data-searchable="true" data-placeholder="회사 선택" data-bulk-field="company_name">${options.join('')}</select>`;
            }
            if(col === 'hw_qty' || col === 'sw_qty') return `<input type="number" min="0" step="1" class="form-input qty-dashed-lock" data-bulk-field="${col}" placeholder="0">`;
            if(col === 'description') return `<input class="form-input" data-bulk-field="description" placeholder="예: 네트워크/보안 담당">`;
            if(col === 'note') return `<textarea class="form-input textarea-large" rows="6" data-bulk-field="note" placeholder="비고"></textarea>`;
            return `<input class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }
        const GROUP = { title:'부서', cols:['company_name','dept_name','description'] };
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
        // 부서 통계: 담당자수/하드웨어(수량)/소프트웨어(수량)
        renderStatBlock('stats-software', '담당자수', countBy(rows, 'staff_count'));
        renderStatBlock('stats-versions', '하드웨어(수량)', countBy(rows, 'hw_qty'));
        renderStatBlock('stats-check', '소프트웨어(수량)', countBy(rows, 'sw_qty'));
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
        // 초기 화면은 컬럼선택 모달에서 '초기화'를 누른 상태와 동일하게 적용
        // (사용자 저장된 컬럼 선택은 무시하고 기본 컬럼 셋을 사용)
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
        ensureCompanyOptions().catch(()=>{});
        state.isLoading = true;
        render();
        refreshDepartments();
        // Page adornments (animation + popover)
}
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


