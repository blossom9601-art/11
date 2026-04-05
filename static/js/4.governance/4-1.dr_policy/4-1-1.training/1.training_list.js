/**
 * 전용회선 관리 페이지 스크립트
 * - 컬럼 토글 (기본 10개 노출)
 * - 로컬(in-memory) 데이터 렌더링 + 페이징 + 검색
 * - 모달 (등록/수정/컬럼 선택)
 * - CSV 다운로드 (현재 페이지 or 전체)
 * NOTE: 서버 연동 전 단계로 mock 데이터 사용
 */

(function(){
    // Increment this when table schema changes to force column visibility reset
    const SCHEMA_VERSION = 'v3-2025-10-03-note-hidden';
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
        // Apply flatpickr to all train_date inputs within the form (add, edit, bulk)
        const dateEls = form.querySelectorAll('input[name="train_date"]');
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
            onReady: function(selectedDates, dateStr, instance){ ensureTodayButton(instance); },
            onOpen: function(selectedDates, dateStr, instance){ ensureTodayButton(instance); }
        };
        dateEls.forEach(el=>{ if(el && !el._flatpickr){ window.flatpickr(el, opts); } });
    }

    // Validate date pair in a form before save/apply
    function validateOpenClose(formId){
        const form = document.getElementById(formId); if(!form) return true;
        const s = form.querySelector('[name="open_date"]')?.value?.trim();
        const e = form.querySelector('[name="close_date"]')?.value?.trim();
        if(!s || !e) return true; // only enforce when both present
        const mS = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const mE = e.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if(!mS || !mE) return true; // let other validators handle format
        const sd = new Date(+mS[1], +mS[2]-1, +mS[3]);
        const ed = new Date(+mE[1], +mE[2]-1, +mE[3]);
        if(sd.getTime() > ed.getTime()){
            showMessage('개통일자는 해지일자보다 늦을 수 없습니다.', '유효성 오류');
            return false;
        }
        return true;
    }

    // ---------------------------------------------------------------------
    // API (DB-backed) - DR Trainings
    // ---------------------------------------------------------------------

    const API_ENDPOINT = '/api/governance/dr-trainings';
    const JSON_HEADERS = { 'Content-Type': 'application/json', 'Accept': 'application/json' };

    function normalizeTrainingRow(row){
        const safeInt = (val)=>{
            if(val === undefined || val === null || val === '') return 0;
            const parsed = Number.parseInt(val, 10);
            return Number.isFinite(parsed) ? parsed : 0;
        };
        return {
            id: row?.id ?? row?.training_id ?? null,
            status: row?.status || row?.training_status || '',
            train_date: row?.train_date || row?.training_date || '',
            train_name: row?.train_name || row?.training_name || '',
            train_type: row?.train_type || row?.training_type || '',
            target_systems: safeInt(row?.target_systems ?? row?.target_system_count),
            participant_count: safeInt(row?.participant_count),
            orgs: row?.orgs || row?.participant_org || '',
            recovery_time: row?.recovery_time || row?.recovery_time_text || '',
            result: row?.result || row?.training_result || '',
            note: row?.note || row?.training_remark || '',
            is_deleted: safeInt(row?.is_deleted)
        };
    }

    async function fetchTrainingList(){
        const response = await fetch(`${API_ENDPOINT}?_=${Date.now()}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin'
        });
        const json = await response.json().catch(()=> ({}));
        if(!response.ok || json.success === false){
            const msg = json?.message || `조회 실패 (HTTP ${response.status})`;
            throw new Error(msg);
        }
        const items = Array.isArray(json.items) ? json.items : [];
        return items.map(normalizeTrainingRow);
    }

    function buildTrainingPayload(source, options){
        const opts = options || {};
        const skipEmpty = !!opts.skipEmpty;
        const s = (v)=> (v ?? '').toString().trim();
        const payload = {};
        const status = s(source.status);
        if(status) payload.status = status; else if(!skipEmpty) payload.status = '';
        const trainDate = s(source.train_date);
        if(trainDate) payload.train_date = trainDate; else if(!skipEmpty) payload.train_date = '';
        const trainName = s(source.train_name);
        if(trainName) payload.train_name = trainName; else if(!skipEmpty) payload.train_name = '';
        const trainType = s(source.train_type);
        if(trainType) payload.train_type = trainType; else if(!skipEmpty) payload.train_type = '';
        const result = s(source.result);
        if(result) payload.result = result; else if(!skipEmpty) payload.result = '';

        // numbers: default 0
        const toNonNegInt = (v)=>{
            if(v === undefined || v === null || String(v).trim() === '') return 0;
            const n = Number.parseInt(String(v).trim(), 10);
            return Number.isFinite(n) && n >= 0 ? n : 0;
        };
        if('target_systems' in source || !skipEmpty) payload.target_systems = toNonNegInt(source.target_systems);
        if('participant_count' in source || !skipEmpty) payload.participant_count = toNonNegInt(source.participant_count);

        const orgs = s(source.orgs);
        if(orgs) payload.orgs = orgs; else if(!skipEmpty) payload.orgs = '';
        const recovery = s(source.recovery_time);
        if(recovery) payload.recovery_time = recovery; else if(!skipEmpty) payload.recovery_time = '';
        const note = s(source.note);
        if(note) payload.note = note; else if(!skipEmpty) payload.note = '';

        return payload;
    }

    async function createTraining(source){
        const payload = buildTrainingPayload(source, { skipEmpty: false });
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: JSON_HEADERS,
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        });
        const json = await response.json().catch(()=> ({}));
        if(!response.ok || json.success === false){
            const msg = json?.message || `등록 실패 (HTTP ${response.status})`;
            throw new Error(msg);
        }
        return normalizeTrainingRow(json.item);
    }

    async function updateTraining(id, patch){
        const payload = buildTrainingPayload(patch, { skipEmpty: true });
        const response = await fetch(`${API_ENDPOINT}/${encodeURIComponent(String(id))}`, {
            method: 'PUT',
            headers: JSON_HEADERS,
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        });
        const json = await response.json().catch(()=> ({}));
        if(!response.ok || json.success === false){
            const msg = json?.message || `수정 실패 (HTTP ${response.status})`;
            throw new Error(msg);
        }
        return normalizeTrainingRow(json.item);
    }

    async function bulkDeleteTrainings(ids){
        const response = await fetch(`${API_ENDPOINT}/bulk-delete`, {
            method: 'POST',
            headers: JSON_HEADERS,
            credentials: 'same-origin',
            body: JSON.stringify({ ids })
        });
        const json = await response.json().catch(()=> ({}));
        if(!response.ok || json.success === false){
            const msg = json?.message || `삭제 실패 (HTTP ${response.status})`;
            throw new Error(msg);
        }
        return json.deleted ?? 0;
    }

    async function bulkUpdateTrainings(ids, patch){
        const payload = buildTrainingPayload(patch, { skipEmpty: true });
        const response = await fetch(`${API_ENDPOINT}/bulk-update`, {
            method: 'POST',
            headers: JSON_HEADERS,
            credentials: 'same-origin',
            body: JSON.stringify({ ids, patch: payload })
        });
        const json = await response.json().catch(()=> ({}));
        if(!response.ok || json.success === false){
            const msg = json?.message || `일괄변경 실패 (HTTP ${response.status})`;
            throw new Error(msg);
        }
        return json.updated ?? 0;
    }

    async function bulkDuplicateTrainings(ids){
        const response = await fetch(`${API_ENDPOINT}/bulk-duplicate`, {
            method: 'POST',
            headers: JSON_HEADERS,
            credentials: 'same-origin',
            body: JSON.stringify({ ids })
        });
        const json = await response.json().catch(()=> ({}));
        if(!response.ok || json.success === false){
            const msg = json?.message || `복제 실패 (HTTP ${response.status})`;
            throw new Error(msg);
        }
        const items = Array.isArray(json.items) ? json.items : [];
        return items.map(normalizeTrainingRow);
    }

    async function bulkCreateTrainings(items){
        const response = await fetch(`${API_ENDPOINT}/bulk-create`, {
            method: 'POST',
            headers: JSON_HEADERS,
            credentials: 'same-origin',
            body: JSON.stringify({ items: items.map(it=> buildTrainingPayload(it, { skipEmpty:false })) })
        });
        const json = await response.json().catch(()=> ({}));
        if(!response.ok || json.success === false){
            const msg = json?.message || `업로드 실패 (HTTP ${response.status})`;
            throw new Error(msg);
        }
        const out = Array.isArray(json.items) ? json.items : [];
        return out.map(normalizeTrainingRow);
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
    // Year filter (replaces page-size UI)
    const YEAR_FILTER_ID = 'system-year-filter';
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
    // Upload template (DR training schema - 8 columns; target_systems/participant_count are integration-only for now)
    const UPLOAD_HEADERS_KO = [
        '상태','훈련일자','훈련명','훈련유형','참여기관','복구시간','결과','비고'
    ];
    const HEADER_KO_TO_KEY = {
        '상태':'status','훈련일자':'train_date','훈련명':'train_name','훈련유형':'train_type','참여기관':'orgs','복구시간':'recovery_time','결과':'result','비고':'note'
    };
    const ENUM_SETS = { };
    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
    function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }

    // Data + State
    const BASE_VISIBLE_COLUMNS = [
        // 기본 표시 열 (비고는 기본 비표시, 컬럼선택으로 활성화)
        'status','train_date','train_name','train_type','target_systems','participant_count','orgs','recovery_time','result'
    ];
    const COLUMN_ORDER = [
        // 테이블 렌더 순서 (관리 열 제외)
        'status','train_date','train_name','train_type','target_systems','participant_count','orgs','recovery_time','result','note'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '기본', columns: ['status','train_date','train_name','train_type','target_systems','participant_count','orgs','recovery_time','result','note'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        status:{label:'상태',group:'기본'},
        train_date:{label:'훈련일자',group:'기본'},
        train_name:{label:'훈련명',group:'기본'},
        train_type:{label:'훈련유형',group:'기본'},
        target_systems:{label:'대상 시스템',group:'기본'},
        participant_count:{label:'참여인원',group:'기본'},
        orgs:{label:'참여기관',group:'기본'},
        recovery_time:{label:'복구시간',group:'기본'},
        result:{label:'결과',group:'기본'},
        note:{label:'비고',group:'기본'}
    };

    // 통신사 로고 매핑 (표시 전용)
    const TELCO_LOGOS = {
        'KT': '/static/image/svg/telecom/KT_Logo.svg',
        'SKB': '/static/image/svg/telecom/SKT_Logo.svg',
        'LG': '/static/image/svg/telecom/LGU_Logo.svg'
    };

    // Speed tiering: prepend a colored dot before speed based on Mbps
    const SPEED_TIER_MODE = 5; // set to 3 for low/med/high
    function parseSpeedToMbps(val){
        const s = String(val||'').trim().toLowerCase();
        if(!s) return null;
        // match e.g., 10g, 1 g, 100m, 500 mbps, 64k, 64 kbps
        const m = s.match(/^(\d+(?:\.\d+)?)\s*(k|kbps|m|mbps|g|gbps)?$/i);
        if(!m) return null;
        const num = parseFloat(m[1]);
        const unit = (m[2]||'m').toLowerCase();
        let mult = 1; // default Mbps
        if(unit==='k' || unit==='kbps') mult = 0.001;
        else if(unit==='m' || unit==='mbps') mult = 1;
        else if(unit==='g' || unit==='gbps') mult = 1000;
        return num * mult;
    }
    function getSpeedTier(mbps){
        if(!isFinite(mbps) || mbps<0) return { tier:0, name:'미정' };
        if(SPEED_TIER_MODE === 3){
            // 3-tier: <100, 100-999, >=1000
            if(mbps < 100) return { tier:1, name:'저속(<100Mbps)' };
            if(mbps < 1000) return { tier:2, name:'중속(100Mbps~1Gbps 미만)' };
            return { tier:3, name:'고속(≥1Gbps)' };
        }
        // 5-tier: <10, 10-99, 100-999, 1000-4999, >=5000
        if(mbps < 10) return { tier:1, name:'매우 낮음(<10Mbps)' };
        if(mbps < 100) return { tier:2, name:'낮음(10~99Mbps)' };
        if(mbps < 1000) return { tier:3, name:'보통(100Mbps~1Gbps 미만)' };
        if(mbps < 5000) return { tier:4, name:'높음(1~5Gbps 미만)' };
        return { tier:5, name:'매우 높음(≥5Gbps)' };
    }

    let state = {
        data: [],
    filtered: [],
    pageSize: 10,
        page: 1,
    yearFilter: '', // '' means all years
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
    // Track whether a year filter value was persisted, to decide default selection behavior
    let HAD_PERSISTED_YEAR = false;

    // 샘플 데이터 (DR 훈련)
    function mockData(count=5){
        const rows = [
            { id:1, status:'완료', train_date:'2025-06-15', train_name:'상반기 DR 모의훈련', train_type:'자체 모의훈련', target_systems:8, participant_count:15, orgs:'본사, 센터', recovery_time:'2시간', result:'성공', note:'' },
            { id:2, status:'예정', train_date:'2025-08-20', train_name:'3분기 DR 합동훈련',   train_type:'합동 모의훈련', target_systems:5, participant_count:10, orgs:'센터',       recovery_time:'',     result:'취소', note:'(샘플) 일정 변경' },
            { id:3, status:'완료', train_date:'2025-09-01', train_name:'분기 DR 점검',       train_type:'자체 모의훈련', target_systems:10,participant_count:20, orgs:'지점A',     recovery_time:'3시간', result:'부분성공', note:'' },
            { id:4, status:'보류', train_date:'2025-10-12', train_name:'하반기 DR 워크스루', train_type:'자체 모의훈련', target_systems:3, participant_count:7,  orgs:'지점B',     recovery_time:'',     result:'취소', note:'인력 이슈' },
            { id:5, status:'완료', train_date:'2025-12-05', train_name:'연말 DR 리허설',     train_type:'합동 모의훈련', target_systems:6, participant_count:12, orgs:'본사',       recovery_time:'1시간 30분', result:'성공', note:'' }
        ];
    return rows.slice(0, Math.max(0, count|0));
    }

    async function initData(){
        try {
            const rows = await fetchTrainingList();
            state.data = rows;
            const maxId = rows.reduce((m,r)=> Math.max(m, Number.parseInt(r?.id,10) || 0), 0);
            state.nextId = maxId + 1;
        } catch(e){
            // Fallback to mock data if API is unavailable.
            console.warn('[dr-training] API load failed; using mock data', e);
            state.data = mockData(5);
            state.nextId = state.data.length + 1;
            try { showMessage('DB 연동에 실패하여 샘플 데이터로 표시합니다. (API 확인 필요)', '연동 오류'); } catch(_e){}
        }
        refreshYearFilterOptions();
        applyFilter();
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
        // 2단계: 연도 필터 적용 (훈련일자 기반)
        const yf = String(state.yearFilter||'').trim();
        if(yf){
            base = base.filter(row=>{
                const d = String(row.train_date||'');
                const m = d.match(/^(\d{4})-\d{2}-\d{2}$/);
                return !!(m && m[1] === yf);
            });
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

    // Compute distinct years from data (train_date) in descending order
    function computeYearOptions(rows){
        const years = new Set();
        (rows||[]).forEach(r=>{
            const d = String(r.train_date||'');
            const m = d.match(/^(\d{4})-\d{2}-\d{2}$/);
            if(m){ years.add(m[1]); }
        });
        return [...years].sort((a,b)=> b.localeCompare(a));
    }

    function refreshYearFilterOptions(){
        const sel = document.getElementById(YEAR_FILTER_ID);
        if(!sel) return;
        const current = String(state.yearFilter||'');
        const years = computeYearOptions(state.data);
        // Rebuild options: 첫 항목은 전체
        const frag = document.createDocumentFragment();
        const optAll = document.createElement('option'); optAll.value = ''; optAll.textContent = '전체 연도'; frag.appendChild(optAll);
        years.forEach(y=>{ const o = document.createElement('option'); o.value=y; o.textContent=y; frag.appendChild(o); });
        sel.innerHTML = ''; sel.appendChild(frag);
        // Restore selection if still valid; if invalid and years exist, fall back to latest year
        if(current && years.includes(current)){
            sel.value = current;
        } else if(current && years.length){
            state.yearFilter = years[0];
            sel.value = state.yearFilter;
            try { localStorage.setItem('training_year_filter', state.yearFilter); } catch(_e){}
        } else {
            sel.value = '';
        }
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
                    if(titleEl) titleEl.textContent = '모의훈련 내역이 없습니다.';
                    if(descEl) descEl.textContent = "우측 상단 '추가' 버튼을 눌러 첫 훈련을 등록하세요.";
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
                    if(col==='lic_desc' && typeof rawVal==='string'){
                        // single-line for table display
                        rawVal = rawVal.replace(/\r?\n|\r/g,' ');
                    }
                    const displayVal = (rawVal==null || String(rawVal).trim()==='') ? '-' : rawVal;
                    let cellValue = highlight(displayVal, col);
                    // 결과/상태 배지 표시
                    if(col === 'result'){
                        const v = String(displayVal);
                        let cls = 'ws-wait';
                        if(v === '성공') cls = 'ws-run';
                        else if(v === '부분성공') cls = 'ws-wait';
                        else if(v === '실패') cls = 'ws-wait';
                        else if(v === '취소') cls = 'ws-wait';
                        cellValue = `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${highlight(displayVal, col)}</span></span>`;
                    }
                    if(col === 'status'){
                        const v = String(displayVal);
                        let cls = 'ws-wait';
                        if(v === '완료') cls = 'ws-run';
                        else if(v === '예정') cls = 'ws-wait';
                        else if(v === '보류') cls = 'ws-wait';
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
            saveColumnSelection();
        }
        table.querySelectorAll('thead th[data-col], tbody td[data-col]').forEach(cell=>{
            const col = cell.getAttribute('data-col');
            if(col==='actions') return;
            if(state.visibleCols.has(col)) cell.classList.remove('col-hidden'); else cell.classList.add('col-hidden');
        });
    }

    function saveColumnSelection(){
        try {
            localStorage.setItem('training_visible_cols', JSON.stringify([...state.visibleCols]));
            localStorage.setItem('training_schema_version', SCHEMA_VERSION);
        } catch(e){}
    }
    function loadColumnSelection(){
        try {
            // migrate from old key if present
            const legacy = localStorage.getItem('backup_visible_cols');
            if(legacy && !localStorage.getItem('training_visible_cols')){
                localStorage.setItem('training_visible_cols', legacy);
            }
            // Reset on schema version change
            const ver = localStorage.getItem('training_schema_version');
            if(ver !== SCHEMA_VERSION){
                state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
                saveColumnSelection();
                return;
            }
            const raw = localStorage.getItem('training_visible_cols');
            if(!raw) return; // nothing stored, keep defaults
            let parsed = [];
            try { parsed = JSON.parse(raw); } catch(_e) { parsed = []; }
            if(!Array.isArray(parsed)) parsed = [];
            // Sanitize: keep only known columns; de-dup
            const allowed = new Set(Object.keys(COLUMN_META));
            const filtered = [...new Set(parsed.filter(k => allowed.has(String(k))))];
            if(filtered.length > 0){
                state.visibleCols = new Set(filtered);
                // persist sanitized (and possibly migrated) version
                try { saveColumnSelection(); } catch(_e){}
            } else {
                // Stored value was empty or invalid — fall back to defaults and persist
                state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
                try { saveColumnSelection(); } catch(_e){}
            }
        } catch(e){}
    }

    // ---- Sort persistence ----
    function saveSortPreference(){
        try{
            if(state.sortKey){
                localStorage.setItem('training_sort_key', state.sortKey);
                localStorage.setItem('training_sort_dir', state.sortDir==='desc' ? 'desc' : 'asc');
            } else {
                localStorage.removeItem('training_sort_key');
                localStorage.removeItem('training_sort_dir');
            }
        }catch(e){}
    }
    function loadSortPreference(){
        try{
            // migrate legacy keys if any
            const legacyKey = localStorage.getItem('backup_sort_key');
            const legacyDir = localStorage.getItem('backup_sort_dir');
            if(legacyKey && !localStorage.getItem('training_sort_key')){
                localStorage.setItem('training_sort_key', legacyKey);
                localStorage.setItem('training_sort_dir', legacyDir||'asc');
            }
            const key = localStorage.getItem('training_sort_key');
            const dir = localStorage.getItem('training_sort_dir');
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
        form.classList.remove('show-required-errors');
        form.innerHTML='';
        const REQUIRED_FIELDS = new Set(['status','train_date','train_name','train_type']);
        const groups = [
            { title:'기본', cols:['status','train_date','train_name','train_type','orgs','recovery_time','result','note'] }
        ];
        groups.forEach(g=>{
            const section = document.createElement('div'); section.className='form-section';
            section.innerHTML = `<div class="section-header"><h4>${g.title}</h4></div>`;
            const grid = document.createElement('div'); grid.className='form-grid';
            g.cols.forEach(c=>{ if(!COLUMN_META[c]) return; const wrap=document.createElement('div');
                // Make note span full width (match Add modal); keep others normal
                wrap.className = (c === 'note' || c === 'lic_desc') ? 'form-row form-row-wide' : 'form-row';
                const labelText = COLUMN_META[c]?.label||c;
                const labelHtml = REQUIRED_FIELDS.has(c)
                    ? `${labelText}<span class="required">*</span>`
                    : labelText;
                wrap.innerHTML=`<label>${labelHtml}</label>${generateFieldInput(c,row[c])}`; grid.appendChild(wrap); });
            section.appendChild(grid); form.appendChild(section);
        });
    }

    function generateFieldInput(col,value=''){
        const v = String(value??'');
        if(col==='status'){
            return `<select name="status" class="form-input search-select" data-searchable="true" data-placeholder="선택" required>
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="완료" ${v==='완료'?'selected':''}>완료</option>
                <option value="예정" ${v==='예정'?'selected':''}>예정</option>
                <option value="보류" ${v==='보류'?'selected':''}>보류</option>
            </select>`;
        }
        if(col==='train_type'){
            return `<select name="train_type" class="form-input search-select" data-searchable="true" data-placeholder="선택" required>
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="자체 모의훈련" ${v==='자체 모의훈련'?'selected':''}>자체 모의훈련</option>
                <option value="합동 모의훈련" ${v==='합동 모의훈련'?'selected':''}>합동 모의훈련</option>
                <option value="연동 모의훈련" ${v==='연동 모의훈련'?'selected':''}>연동 모의훈련</option>
            </select>`;
        }
        if(col==='result'){
            return `<select name="result" class="form-input search-select" data-searchable="true" data-placeholder="선택">
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="성공" ${v==='성공'?'selected':''}>성공</option>
                <option value="부분성공" ${v==='부분성공'?'selected':''}>부분성공</option>
                <option value="실패" ${v==='실패'?'selected':''}>실패</option>
                <option value="취소" ${v==='취소'?'selected':''}>취소</option>
            </select>`;
        }
        if(col==='train_date') return `<input name="train_date" class="form-input" value="${value??''}" placeholder="YYYY-MM-DD" required>`;
        if(col==='train_name') return `<input name="train_name" class="form-input" value="${value??''}" placeholder="예: 2025 상반기 DR 모의훈련" required>`;
        if(col==='target_systems' || col==='participant_count') return `<input name="${col}" type="number" class="form-input" value="${value??''}" min="0" step="1" placeholder="0">`;
    if(col==='note') return `<textarea name="note" class="form-input" rows="6">${value??''}</textarea>`;
        return `<input name="${col}" class="form-input" value="${value??''}" placeholder="입력">`;
    }

    function validateRequiredFormOrShow(form){
        if(!form) return false;
        form.classList.add('show-required-errors');
        try { window.BlossomSearchableSelect?.syncAll?.(form); } catch(_e) {}
        if(!form.checkValidity()){
            form.reportValidity();
            try { window.BlossomSearchableSelect?.syncAll?.(form); } catch(_e) {}
            return false;
        }
        return true;
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

    async function addRow(data){
        const created = await createTraining(data);
        state.data.unshift(created);
        refreshYearFilterOptions();
        applyFilter();
        return created;
    }

    async function updateRow(index,data){
        const existing = state.data[index];
        if(!existing || !existing.id) return null;
        const updated = await updateTraining(existing.id, data);
        state.data[index] = { ...existing, ...updated };
        refreshYearFilterOptions();
        applyFilter();
        return updated;
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
    const filename = `dr_training_list_${yyyy}${mm}${dd}.csv`;
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
        // Year filter selector
        const yearSel = document.getElementById(YEAR_FILTER_ID);
        if(yearSel){
            yearSel.addEventListener('change', e=>{
                state.yearFilter = String(e.target.value||'');
                try { localStorage.setItem('training_year_filter', state.yearFilter); } catch(_){}
                applyFilter();
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
                    // enhance date inputs with Flatpickr
                    initDatePickers(EDIT_FORM_ID);
                    const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                    if(editSaveEl){ editSaveEl.setAttribute('data-index', realIndex); }
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
            const form = document.getElementById(ADD_FORM_ID);
            form?.classList?.remove('show-required-errors');
            openModal(ADD_MODAL_ID);
            initDatePickers(ADD_FORM_ID);
        });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(ADD_FORM_ID);
            if(!validateRequiredFormOrShow(form)) return;
            const data = collectForm(form);
            if(isIntegerLike(data.target_systems)) data.target_systems = parseInt(data.target_systems, 10);
            if(isIntegerLike(data.participant_count)) data.participant_count = parseInt(data.participant_count, 10);
            try {
                await addRow(data);
                form.reset();
                form.classList.remove('show-required-errors');
                closeModal(ADD_MODAL_ID);
            } catch(e){
                showMessage(String(e?.message||e||'등록 중 오류가 발생했습니다.'), '등록 실패');
            }
        });
        // edit modal
    document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(EDIT_FORM_ID);
            const indexEl = document.getElementById(EDIT_SAVE_ID);
            // training basic validation handled by HTML5 + later parsing
            const index = parseInt(indexEl?.getAttribute('data-index')||'-1',10);
            if(!validateRequiredFormOrShow(form)) return;
            const data = collectForm(form);
            if(isIntegerLike(data.target_systems)) data.target_systems = parseInt(data.target_systems, 10);
            if(isIntegerLike(data.participant_count)) data.participant_count = parseInt(data.participant_count, 10);
            try {
                await updateRow(index, data);
                form.classList.remove('show-required-errors');
                closeModal(EDIT_MODAL_ID);
            } catch(e){
                showMessage(String(e?.message||e||'수정 중 오류가 발생했습니다.'), '수정 실패');
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
    // template download — provide an XLSX with Korean headers matching expected upload
        document.getElementById(UPLOAD_TEMPLATE_BTN_ID)?.addEventListener('click', async ()=>{
            try{ await ensureXLSX(); }catch(_e){ showMessage('템플릿 생성을 위한 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.', '오류'); return; }
            try{
                const XLSX = window.XLSX;
                // Main template sheet: headers only (order enforced by validator)
                const wsTemplate = XLSX.utils.aoa_to_sheet([UPLOAD_HEADERS_KO]);
                // Set fixed column widths for new schema
                wsTemplate['!cols'] = [
                    { wch: 10 }, // 상태
                    { wch: 12 }, // 훈련일자
                    { wch: 28 }, // 훈련명
                    { wch: 16 }, // 훈련유형
                    { wch: 12 }, // 대상 시스템
                    { wch: 12 }, // 참여인원
                    { wch: 28 }, // 참여기관
                    { wch: 14 }, // 복구시간
                    { wch: 12 }, // 결과
                    { wch: 28 }, // 비고
                ];

                // Guide sheet: rules and allowed values (Korean)
                const rules = [
                    ['엑셀 업로드 가이드'],
                    [''],
                    ['작성 규칙'],
                    ['- 첫 행의 컬럼 제목은 아래 순서와 완전히 일치해야 합니다. (순서/이름 변경 불가)'],
                    ['- "대상 시스템", "참여인원"은 숫자만 입력하세요.'],
                    ['- 상태는 완료/예정/보류 중 하나를 권장합니다.'],
                    ['- 결과는 성공/부분성공/실패/취소 중 하나를 권장합니다.'],
                    ['- 참여기관은 쉼표(,)로 복수 입력 가능합니다.'],
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
                XLSX.writeFile(wb, 'dr_training_upload_template.xlsx');
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
                        // Validation rules (DR training new schema)
                        if(rec.train_date && !/^\d{4}-\d{2}-\d{2}$/.test(rec.train_date)) errors.push(`Row ${r+1}: 훈련일자는 YYYY-MM-DD 형식이어야 합니다.`);
                        if(rec.target_systems!=='' && !isIntegerLike(rec.target_systems)) errors.push(`Row ${r+1}: 대상 시스템은 숫자여야 합니다.`);
                        if(rec.participant_count!=='' && !isIntegerLike(rec.participant_count)) errors.push(`Row ${r+1}: 참여인원은 숫자여야 합니다.`);
                        // coerce integers if valid
                        if(isIntegerLike(rec.target_systems)) rec.target_systems = parseInt(rec.target_systems, 10);
                        if(isIntegerLike(rec.participant_count)) rec.participant_count = parseInt(rec.participant_count, 10);
                        imported.push(rec);
                    }
                    if(errors.length){
                        const preview = errors.slice(0, 20).join('\n');
                        const more = errors.length>20 ? `\n...외 ${errors.length-20}건` : '';
                        showMessage(`업로드 실패: 유효성 검사 오류가 있습니다.\n\n${preview}${more}`, '업로드 실패');
                        return;
                    }
                    // Import rows (DB)
                    (async ()=>{
                        try{
                            const created = await bulkCreateTrainings(imported);
                            // Refresh from API to keep server as source of truth
                            try{ state.data = await fetchTrainingList(); }catch(_e){ /* ignore */ }
                            state.selected.clear();
                            refreshYearFilterOptions();
                            applyFilter();
                            showMessage(`${created.length}개 행이 업로드되었습니다.`, '업로드 완료');
                            closeModal(UPLOAD_MODAL_ID);
                        }catch(e){
                            showMessage(String(e?.message||e||'업로드 중 오류가 발생했습니다.'), '업로드 실패');
                        }
                    })();
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
        document.getElementById('system-duplicate-confirm')?.addEventListener('click', async ()=>{
            const ids = [...state.selected];
            if(!ids.length){ showMessage('복제할 행을 먼저 선택하세요.', '안내'); closeModal('system-duplicate-modal'); return; }
            try{
                const created = await bulkDuplicateTrainings(ids);
                // Refresh list to reflect server state
                state.data = await fetchTrainingList();
                state.selected.clear();
                refreshYearFilterOptions();
                applyFilter();
                closeModal('system-duplicate-modal');
                showMessage(created.length + '개 행이 복제되었습니다.', '완료');
            }catch(e){
                showMessage(String(e?.message||e||'복제 중 오류가 발생했습니다.'), '복제 실패');
            }
        });
        // delete (삭제처리)
        document.getElementById(DELETE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('삭제처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('delete-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 항목을 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', async ()=>{
            const ids = [...state.selected];
            if(!ids.length){ closeModal(DELETE_MODAL_ID); return; }
            try{
                const deleted = await bulkDeleteTrainings(ids);
                state.data = await fetchTrainingList();
                state.selected.clear();
                refreshYearFilterOptions();
                applyFilter();
                closeModal(DELETE_MODAL_ID);
                if(deleted > 0){ setTimeout(()=> showMessage(`${deleted}개 항목이 삭제되었습니다.`, '완료'), 0); }
            }catch(e){
                showMessage(String(e?.message||e||'삭제 중 오류가 발생했습니다.'), '삭제 실패');
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
                initDatePickers(EDIT_FORM_ID);
                const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                if(editSaveEl){ editSaveEl.setAttribute('data-index', realIndex); }
                return;
            }
            // 2개 이상 → 일괄변경 모달
            const subtitle = document.getElementById('bulk-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 항목에서 지정한 필드를 일괄 변경합니다.`; }
            buildBulkForm();
            openModal(BULK_MODAL_ID);
            // enhance bulk date input with Flatpickr
            initDatePickers(BULK_FORM_ID);
        });
        document.getElementById(BULK_CLOSE_ID)?.addEventListener('click', ()=> closeModal(BULK_MODAL_ID));
        document.getElementById(BULK_APPLY_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(BULK_FORM_ID); if(!form) return;
            const entries = [...form.querySelectorAll('[data-bulk-field]')]
                .map(el=>({ field: el.getAttribute('data-bulk-field'), value: el.value }))
                .filter(p=> p.value !== '');
            if(!entries.length){ showMessage('변경할 값을 1개 이상 입력하세요.', '안내'); return; }
            // Validate date pair if both provided in bulk
            if(!validateOpenClose(BULK_FORM_ID)) return;
            const ids = [...state.selected];
            const patch = {};
            entries.forEach(({field, value})=>{ patch[field] = value; });
            try{
                const updatedCount = await bulkUpdateTrainings(ids, patch);
                state.data = await fetchTrainingList();
                refreshYearFilterOptions();
                applyFilter();
                closeModal(BULK_MODAL_ID);
                setTimeout(()=> showMessage(`${updatedCount}개 항목에 일괄 변경이 적용되었습니다.`, '완료'), 0);
            }catch(e){
                showMessage(String(e?.message||e||'일괄변경 중 오류가 발생했습니다.'), '일괄변경 실패');
            }
        });
        // esc close
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ [ADD_MODAL_ID,EDIT_MODAL_ID,COLUMN_MODAL_ID,DELETE_MODAL_ID,BULK_MODAL_ID,UPLOAD_MODAL_ID,'system-download-modal','system-message-modal','system-duplicate-modal'].forEach(closeModal); }});
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
                return `<select name="status" class="form-input search-select" data-searchable="true" data-placeholder="선택" data-bulk-field="status">
                    <option value="">선택</option>
                    <option value="완료">완료</option>
                    <option value="예정">예정</option>
                    <option value="보류">보류</option>
                </select>`;
            }
            if(col === 'train_type'){
                return `<select name="train_type" class="form-input search-select" data-searchable="true" data-placeholder="선택" data-bulk-field="train_type">
                    <option value="">선택</option>
                    <option value="자체 모의훈련">자체 모의훈련</option>
                    <option value="합동 모의훈련">합동 모의훈련</option>
                    <option value="연동 모의훈련">연동 모의훈련</option>
                </select>`;
            }
            if(col === 'result'){
                return `<select name="result" class="form-input search-select" data-searchable="true" data-placeholder="선택" data-bulk-field="result">
                    <option value="">선택</option>
                    <option value="성공">성공</option>
                    <option value="부분성공">부분성공</option>
                    <option value="실패">실패</option>
                    <option value="취소">취소</option>
                </select>`;
            }
            if(col === 'train_date') return `<input name="train_date" class="form-input" data-bulk-field="train_date" placeholder="YYYY-MM-DD">`;
            if(col === 'note') return `<textarea name="note" class="form-input" data-bulk-field="note" rows="6" placeholder="메모"></textarea>`;
            return `<input name="${col}" class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }
        const GROUPS = [
            { title:'기본', cols:['status','train_date','train_name','train_type','orgs','recovery_time','result','note'] }
        ];
        form.innerHTML = GROUPS.map(g=>{
            const fields = g.cols.filter(c=> !EXCLUDE.has(c));
            if(!fields.length) return '';
            const grid = fields.map(col=>{
                const meta = COLUMN_META[col]; if(!meta) return '';
                const wide = (col === 'note' || col === 'lic_desc');
                return `<div class="${wide ? 'form-row form-row-wide' : 'form-row'}"><label>${meta.label}</label>${inputFor(col)}</div>`;
            }).join('');
            return `
                <div class="form-section">
                    <div class="section-header"><h4>${g.title}</h4></div>
                    <div class="form-grid">${grid}</div>
                </div>`;
        }).join('');
    // 날짜 입력기 적용
    // no date picker required
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
    // 정책 현황/분포
    renderStatBlock('stats-software', '상태', countBy(rows, 'status'), ['완료','예정','보류']);
    renderStatBlock('stats-software', '결과', countBy(rows, 'result'), ['성공','부분성공','실패','취소']);
    renderStatBlock('stats-versions', '훈련유형', countBy(rows, 'train_type'));
    renderStatBlock('stats-versions', '참여기관', countBy(rows, 'orgs'));
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
        // Load persisted year filter
        try {
            const raw = localStorage.getItem('training_year_filter');
            HAD_PERSISTED_YEAR = raw !== null;
            const yf = raw || '';
            state.yearFilter = String(yf||'');
        } catch(_){}
        // Load persisted sort (if any)
        loadSortPreference();
        initData();
        // Build year options after data init
        refreshYearFilterOptions();
        // If no persisted year and no explicit selection, default to the most recent year
        if(!HAD_PERSISTED_YEAR && !state.yearFilter){
            const years = computeYearOptions(state.data);
            if(years.length){
                state.yearFilter = years[0];
                const ysel = document.getElementById(YEAR_FILTER_ID);
                if(ysel){ ysel.value = state.yearFilter; }
                try { localStorage.setItem('training_year_filter', state.yearFilter); } catch(_e){}
            }
        } else {
            // Reflect persisted selection into the control
            const ysel = document.getElementById(YEAR_FILTER_ID); if(ysel){ ysel.value = String(state.yearFilter||''); }
        }
        bindEvents();
        render();
        // Page adornments (animation + popover)
}
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


