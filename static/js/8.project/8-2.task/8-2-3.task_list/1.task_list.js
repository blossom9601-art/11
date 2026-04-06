/**
 * 프로젝트 관리 페이지 스크립트
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
    const FLATPICKR_THEME_NAME = 'airbnb';
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
        ensureCss(FLATPICKR_CSS, 'flatpickr-css');
        ensureCss(FLATPICKR_THEME_HREF, 'flatpickr-theme-css');
        if(window.flatpickr){ return; }
        await loadScript(FLATPICKR_JS);
        try { await loadScript(FLATPICKR_KO); } catch(_e){}
    }
    async function initDatePickers(formId){
        const form = document.getElementById(formId); if(!form) return;
        try { await ensureFlatpickr(); } catch(_e){ return; }
        const startEl = form.querySelector('[name="start_datetime"]');
        const endEl = form.querySelector('[name="end_datetime"]');
        function ensureTodayButton(fp){
            const cal = fp?.calendarContainer; if(!cal) return;
            if(cal.querySelector('.fp-today-btn')) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'fp-today-btn';
            btn.textContent = '오늘';
            btn.addEventListener('click', ()=>{
                const now = new Date();
                fp.setDate(now, true);
            });
            cal.appendChild(btn);
        }
        const opts = {
            locale: (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.ko) ? window.flatpickr.l10ns.ko : 'ko',
            enableTime: true,
            time_24hr: true,
            dateFormat: 'Y-m-d H:i',
            allowInput: true,
            disableMobile: true,
            onReady: function(_, __, instance){ ensureTodayButton(instance); },
            onOpen: function(_, __, instance){ ensureTodayButton(instance); }
        };
        if(startEl && !startEl._flatpickr){ window.flatpickr(startEl, opts); }
        if(endEl && !endEl._flatpickr){ window.flatpickr(endEl, opts); }
    }
    let uploadAnim = null;
    function initUploadAnim(){
        const el = document.getElementById('upload-anim'); if(!el) return;
        ensureLottie(()=>{
            try {
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
    // Upload template (Task schema)
    const UPLOAD_HEADERS_KO = [
        '상태','작업 이름','작업 유형','작업 구분','담당부서','담당자','참여부서','참여자','유지보수 업체','유지보수 직원','영향도','서비스','작업 내용','시작일시','(예상)종료일시','프로젝트 번호','프로젝트 이름'
    ];
    const HEADER_KO_TO_KEY = {
        '상태':'status','작업 이름':'task_name','작업 유형':'task_type','작업 구분':'task_class','담당부서':'owner_dept','담당자':'owner','참여부서':'participant_dept','참여자':'participants','유지보수 업체':'maint_vendor','유지보수 직원':'maint_staff','영향도':'impact','서비스':'service','작업 내용':'task_desc','시작일시':'start_datetime','(예상)종료일시':'end_datetime','프로젝트 번호':'project_no','프로젝트 이름':'project_name'
    };
    const ENUM_SETS = { };
    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
    function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }

    // Data + State
    const BASE_VISIBLE_COLUMNS = [
        'status','doc_no','task_name','task_type','owner_dept','owner','actual_start_time','actual_end_time','actual_duration','result_type'
    ];
    const COLUMN_ORDER = [
        'status','doc_no','task_name','task_type','task_class','owner_dept','owner','participant_dept','participants','maint_vendor','maint_staff','impact','service','task_desc','start_datetime','end_datetime','actual_start_time','actual_end_time','actual_duration','result_type','project_no','project_name'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        // 표에서는 '작업 내용(task_desc)'은 숨김 유지 (폼/CSV 전용)
        { group: '작업', columns: ['status','doc_no','task_name','task_type','task_class','start_datetime','end_datetime','impact','service'] },
        { group: '담당', columns: ['owner_dept','owner','participant_dept','participants','maint_vendor','maint_staff'] },
        { group: '실적', columns: ['actual_start_time','actual_end_time','actual_duration','result_type'] },
        { group: '일정/연계', columns: ['project_no','project_name'] }
    ];
    const HIDDEN_TABLE_COLUMNS = new Set(['task_desc']);

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        status:{label:'상태',group:'작업'},
        doc_no:{label:'작업 번호',group:'작업'},
        task_name:{label:'작업 이름',group:'작업'},
        task_type:{label:'작업 유형',group:'작업'},
        task_class:{label:'작업 구분',group:'작업'},
        service:{label:'서비스',group:'작업'},
        task_desc:{label:'작업 내용',group:'작업'},
    owner_dept:{label:'담당부서',group:'담당'},
    owner:{label:'담당자',group:'담당'},
    participant_dept:{label:'참여부서',group:'담당'},
    participants:{label:'참여자',group:'담당'},
    maint_vendor:{label:'유지보수 업체',group:'담당'},
    maint_staff:{label:'유지보수 직원',group:'담당'},
        impact:{label:'영향도',group:'작업'},
        start_datetime:{label:'시작일시',group:'일정/연계'},
        end_datetime:{label:'(예상)종료일시',group:'일정/연계'},
        actual_start_time:{label:'실제 시작시간',group:'실적'},
        actual_end_time:{label:'실제 종료시간',group:'실적'},
        actual_duration:{label:'실제 소요시간',group:'실적'},
        result_type:{label:'결과 유형',group:'실적'},
        project_no:{label:'프로젝트 번호',group:'일정/연계'},
        project_name:{label:'프로젝트 이름',group:'일정/연계'}
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
        nextId: 1, // mockData 초기화 후 재설정
        sortKey: null,
        sortDir: 'asc',
    columnFilters: {} // { col: value | [values...] } (조건 필터 기능 제거 예정 - 빈 유지)
    };

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;

    // 작업 페이지: 샘플 데이터 5개 제공
    function mockData(count=5){
        const rows = [
            { id:1, status:'진행', task_name:'DB 마이그레이션 설계', task_type:'데이터베이스', task_class:'변경', owner_dept:'DB운영팀', owner:'홍길동', participant_dept:'DB운영팀', participants:'김철수,이영희', maint_vendor:'ABC 솔루션', maint_staff:'박기술', impact:'높음', service:'인증', start_datetime:'2025-01-15 09:00', end_datetime:'2025-01-31 18:00', project_no:'P-2025-001', project_name:'데이터센터 마이그레이션' },
            { id:2, status:'예정', task_name:'ERP 모듈 테스트', task_type:'미들웨어', task_class:'테스트', owner_dept:'QA팀', owner:'김민수', participant_dept:'QA팀', participants:'박보라', maint_vendor:'XYZ 테크', maint_staff:'최엔지', impact:'중간', service:'ERP', start_datetime:'2025-02-01 10:00', end_datetime:'2025-02-10 18:00', project_no:'P-2025-002', project_name:'ERP 업그레이드' },
            { id:3, status:'진행', task_name:'WAS 튜닝', task_type:'미들웨어', task_class:'개선', owner_dept:'플랫폼팀', owner:'이영희', participant_dept:'플랫폼팀', participants:'정우성', maint_vendor:'가온시스템', maint_staff:'한기술', impact:'낮음', service:'웹', start_datetime:'2025-01-20 14:00', end_datetime:'2025-02-05 18:00', project_no:'P-2025-003', project_name:'클라우드 전환 PoC' },
            { id:4, status:'완료', task_name:'정기 보안 점검', task_type:'보안S/W', task_class:'점검', owner_dept:'보안팀', owner:'최가을', participant_dept:'보안팀', participants:'서지우', maint_vendor:'세이프네트', maint_staff:'노수리', impact:'중간', service:'보안', start_datetime:'2024-12-05 09:00', end_datetime:'2024-12-05 18:00', project_no:'P-2024-099', project_name:'보안 점검' },
            { id:5, status:'검토', task_name:'네트워크 장비 교체', task_type:'네트워크', task_class:'변경', owner_dept:'인프라팀', owner:'정우성', participant_dept:'인프라팀', participants:'홍길동', maint_vendor:'유니넷', maint_staff:'강지원', impact:'높음', service:'네트워크', start_datetime:'2025-01-25 22:00', end_datetime:'2025-01-26 02:00', project_no:'P-2025-010', project_name:'네트워크 개선' }
        ];
        // 만약 다른 개수를 명시했다면 상위 count개만 반환
        return rows.slice(0, Math.max(0, count|0));
    }

    function statusCodeToKo(code){
        const v = String(code||'').toUpperCase();
        if(v === 'REVIEW') return '검토';
        if(v === 'APPROVED') return '승인';
        if(v === 'SCHEDULED') return '예정';
        if(v === 'IN_PROGRESS') return '진행';
        if(v === 'COMPLETED' || v === 'ARCHIVED') return '완료';
        // If already Korean, keep it
        if(['검토','승인','예정','진행','완료'].includes(String(code||'').trim())) return String(code).trim();
        return '예정';
    }
    function toDisplayDateTime(v){
        if(!v) return '';
        const s = String(v);
        if(s.includes('T')){
            const t = s.replace('T',' ').replace(/\.(\d+).*/, '');
            return t.slice(0, 16);
        }
        return s;
    }
    function normalizeApiItem(it){
        return {
            id: it.id,
            doc_no: it.doc_no || '',
            status: statusCodeToKo(it.status),
            task_name: it.task_name || it.task_title || '',
            task_type: it.task_type || '',
            task_class: it.task_class || '',
            owner_dept: it.owner_dept || it.owner_dept_name || '',
            owner: it.owner || it.owner_name || it.worker_name || '',
            participant_dept: it.participant_dept || '',
            participants: it.participants || '',
            maint_vendor: it.maint_vendor || '',
            maint_staff: it.maint_staff || '',
            impact: it.impact || '',
            service: it.service || '',
            start_datetime: toDisplayDateTime(it.start_datetime),
            end_datetime: toDisplayDateTime(it.end_datetime),
            actual_start_time: it.actual_start_time || '',
            actual_end_time: it.actual_end_time || '',
            actual_duration: it.actual_duration || '',
            result_type: it.result_type || '',
            project_no: it.project_no || '',
            project_name: it.project_name || '',
        };
    }

    function shouldUseMock(){
        try{
            return new URLSearchParams(window.location.search).get('mock') === '1';
        }catch(_e){
            return false;
        }
    }

    function initData(){
        // Fetch from backend (completed only).
        // Mock rows are only shown when explicitly requested via ?mock=1.
        const url = '/api/wrk/reports?view=all&status=COMPLETED,ARCHIVED&limit=1000';
        fetch(url, { credentials: 'same-origin' })
            .then(res => res.json().then(j => ({ ok: res.ok, json: j })).catch(() => ({ ok: res.ok, json: {} })))
            .then(({ ok, json }) => {
                if(!ok || !json || json.success !== true || !Array.isArray(json.items)){
                    state.data = shouldUseMock() ? mockData(5) : [];
                } else {
                    state.data = json.items.map(normalizeApiItem);
                }
                const maxId = state.data.reduce((m, r) => Math.max(m, Number(r.id)||0), 0);
                state.nextId = maxId + 1;
                applyFilter();
            })
            .catch(() => {
                state.data = shouldUseMock() ? mockData(5) : [];
                const maxId = state.data.reduce((m, r) => Math.max(m, Number(r.id)||0), 0);
                state.nextId = maxId + 1;
                applyFilter();
            });
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
        // 3단계: 완료 상태만 표시
        base = base.filter(row => String(row.status) === '완료');
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
        // 정렬 적용
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
        const emptyEl = document.getElementById('system-empty');
        if(state.filtered.length === 0){
            if(emptyEl){
                emptyEl.hidden = false;
                const descEl = document.getElementById('system-empty-desc');
                if(descEl){
                    descEl.textContent = state.search.trim() ? '검색 조건에 해당하는 작업이 없습니다.' : "우측 상단 '추가' 버튼을 눌러 첫 작업을 등록하세요.";
                }
            }
        } else if(emptyEl){
            emptyEl.hidden = true;
        }

        const start = (state.page-1)*state.pageSize;
        const slice = working.slice(start, start+state.pageSize);

        const tokens = Array.isArray(highlightContext?.tokens) ? highlightContext.tokens.filter(Boolean) : [];
        const visibleCols = COLUMN_ORDER.filter(c=> state.visibleCols.has(c));

        /* ---- colgroup + thead 동적 생성 ---- */
        const COL_WIDTHS = {
            status:'90px', doc_no:'140px', task_name:'240px', task_type:'80px', task_class:'80px',
            owner_dept:'110px', owner:'70px', participant_dept:'110px', participants:'100px',
            maint_vendor:'110px', maint_staff:'100px', impact:'70px', service:'80px',
            start_datetime:'140px', end_datetime:'150px',
            actual_start_time:'140px', actual_end_time:'140px', actual_duration:'90px',
            result_type:'85px', project_no:'120px', project_name:'150px'
        };
        const table = document.getElementById(TABLE_ID);
        if(table){
            /* colgroup */
            let oldCg = table.querySelector('colgroup'); if(oldCg) oldCg.remove();
            const cg = document.createElement('colgroup');
            const chkCol = document.createElement('col'); chkCol.style.width='42px'; cg.appendChild(chkCol);
            visibleCols.forEach(c=>{
                const col = document.createElement('col');
                col.style.width = COL_WIDTHS[c] || 'auto';
                cg.appendChild(col);
            });
            table.insertBefore(cg, table.firstChild);
        }
        const thead = document.getElementById('system-table-head');
        if(thead){
            const thHtml = '<tr><th><input type="checkbox" id="system-select-all"></th>'
                + visibleCols.map(c => `<th data-col="${c}">${COLUMN_META[c]?.label||c}</th>`).join('')
                + '</tr>';
            thead.innerHTML = thHtml;
            /* select-all 체크박스 리바인드 */
            const selAll = document.getElementById('system-select-all');
            if(selAll) selAll.addEventListener('change', function(){ const chk = this.checked; document.querySelectorAll('.system-row-select').forEach(cb=>{ cb.checked=chk; const rid=Number(cb.dataset.id); if(chk) state.selected.add(rid); else state.selected.delete(rid); cb.closest('tr')?.classList.toggle('selected',chk); }); });
        }

        function escapeHTML(v){
            return String(v==null?'':v)
                .replace(/&/g,'&amp;')
                .replace(/</g,'&lt;')
                .replace(/>/g,'&gt;')
                .replace(/"/g,'&quot;')
                .replace(/'/g,'&#39;');
        }
        function highlightHtml(text, col){
            if(!tokens.length || !COLUMN_META[col]) return escapeHTML(text);
            let out = escapeHTML(text);
            tokens.forEach(tok=>{
                const esc = tok.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
                const re = new RegExp(`(${esc})`, 'gi');
                out = out.replace(re, '<mark class="mark">$1</mark>');
            });
            return out;
        }
        function summarizeParticipants(val){
            const s = String(val||'').trim(); if(!s) return '';
            const parts = s.split(',').map(x=>x.trim()).filter(Boolean);
            if(parts.length<=1) return parts[0]||'';
            return `${parts[0]} 외 ${parts.length-1}명`;
        }
        function renderCell(col, val){
            if(col==='status'){
                const v = String(val||'');
                // Match project_list style: white pill + colored dot
                let cls = 'ws-wait';
                if(v === '진행') cls = 'ws-run';
                else if(v === '완료' || v === '승인') cls = 'ws-idle';
                else if(v === '예정' || v === '검토') cls = 'ws-wait';
                return `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${highlightHtml(v||'-', col)}</span></span>`;
            }
            if(col==='participant_dept' || col==='maint_vendor' || col==='maint_staff'){
                if(val==null || String(val).trim()==='') return '-';
                return highlightHtml(String(val), col);
            }
            // 영향도: priority-dot 스타일 재사용 (점 + 텍스트)
            if(col==='impact'){
                const v = String(val||'');
                if(!v){ return '-'; }
                // Map: 높음→긴급(빨강), 중간→일반(인디고), 낮음→낮음(초록)
                let dotCls = 'pri-일반';
                if(v === '높음') dotCls = 'pri-긴급';
                else if(v === '낮음') dotCls = 'pri-낮음';
                else if(v === '중간') dotCls = 'pri-일반';
                 // Use same inline wrapper spacing as priority-inline elsewhere
                 return `<span class="priority-inline"><span class="priority-dot ${dotCls}" aria-hidden="true"></span><span class="priority-text">${highlightHtml(v, col)}</span></span>`;
            }
            if(col==='participants'){
                const sum = summarizeParticipants(val);
                return sum ? highlightHtml(sum, col) : '-';
            }
            // 결과 유형: 색깔 점 + 텍스트
            if(col==='result_type'){
                const v = String(val||'').trim();
                if(!v) return '-';
                let dotCls = 'rt-default';
                if(v === '정상완료' || v === '성공') dotCls = 'rt-success';
                else if(v === '부분완료') dotCls = 'rt-partial';
                else if(v === '실패' || v === '장애') dotCls = 'rt-fail';
                else if(v === '취소' || v === '중단') dotCls = 'rt-cancel';
                return `<span class="result-type-inline"><span class="result-type-dot ${dotCls}" aria-hidden="true"></span><span>${highlightHtml(v, col)}</span></span>`;
            }
            if(val==null || String(val).trim()==='') return '-';
            return highlightHtml(String(val), col);
        }

        const rowsHtml = slice.map(r=>{
            const idAttr = `data-id="${r.id}"`;
                const tds = visibleCols.map(c=>{
                    if(c === 'task_name'){
                        // 작업 이름: 링크로 표시, 클릭 시 작업보고서 팝업. 긴 이름은 생략(ellipsis).
                        const raw = r[c];
                        const rendered = renderCell(c, raw);
                        return `<td data-col="task_name" class="task-name-cell"><a class="work-name-link task-name-ellipsis" href="2.task_detail.html?id=${encodeURIComponent(r.id)}" data-action="detail" data-id="${encodeURIComponent(r.id)}" title="${escapeHTML(raw)}">${rendered}</a></td>`;
                    }
                    if(c === 'project_name') {
                        // Wrap 프로젝트 이름 with link to 프로젝트 상세 페이지 (consistent navigation)
                        const raw = r[c];
                        const rendered = renderCell(c, raw);
                        return `<td data-col="project_name"><a href="/app/templates/8.project/8-1.project/8-1-3.project_list/2.project_detail.html" class="work-name-link" data-project-no="${r.project_no||''}" title="프로젝트 상세 보기">${rendered}</a></td>`;
                    }
                    return `<td data-col="${c}">${renderCell(c, r[c])}</td>`;
                }).join('');
            const selected = state.selected.has(r.id) ? ' selected' : '';
            return `<tr ${idAttr} class="${selected}">
                <td><input type="checkbox" class="system-row-select" data-id="${r.id}" ${selected? 'checked':''}></td>
                ${tds}
            </tr>`;
        }).join('');
        tbody.innerHTML = rowsHtml;

        // Count badge and pagination info
        const countEl = document.getElementById(COUNT_ID);
        const total = state.filtered.length;
        if(countEl){
            const demo = (DEMO_COUNTER!=null) ? DEMO_COUNTER : total;
            const disp = Number(demo).toLocaleString();
            countEl.textContent = disp;
        }
        const info = document.getElementById(PAGINATION_INFO_ID);
        if(info){ info.textContent = `${total.toLocaleString()}개 항목`; }
        renderPageNumbers();
        updateSortIndicators();
        applyColumnVisibility();
    }

    function renderPageNumbers(){
        const pages = totalPages();
        const wrap = document.getElementById(PAGE_NUMBERS_ID); if(!wrap) return;
        wrap.innerHTML = '';
        const maxBtns = 7;
        const cur = state.page;
        let start = Math.max(1, cur - Math.floor(maxBtns/2));
        let end = Math.min(pages, start + maxBtns - 1);
        start = Math.max(1, Math.min(start, end - maxBtns + 1));
        const frag = document.createDocumentFragment();
        for(let p=start; p<=end; p++){
            const btn = document.createElement('button');
            btn.className = 'page-btn'+(p===cur?' active':'');
            btn.dataset.page = String(p);
            btn.textContent = String(p);
            frag.appendChild(btn);
        }
        wrap.appendChild(frag);
        // enable/disable nav
        const first = document.getElementById('system-first');
        const prev = document.getElementById('system-prev');
        const next = document.getElementById('system-next');
        const last = document.getElementById('system-last');
        if(first) first.disabled = cur<=1;
        if(prev) prev.disabled = cur<=1;
        if(next) next.disabled = cur>=pages;
        if(last) last.disabled = cur>=pages;
    }

    function syncColumnSelectAll(){
        const btn = document.getElementById(COLUMN_SELECTALL_BTN_ID);
        const form = document.getElementById(COLUMN_FORM_ID); if(!btn || !form) return;
        const boxes = [...form.querySelectorAll('input[type=checkbox]')];
        // 항상 '전체 선택'만 보여준다 (전체 해제는 제공하지 않음)
        btn.textContent = '전체 선택';
    }

    function buildColumnModal(){
        const form = document.getElementById(COLUMN_FORM_ID); if(!form) return;
        form.innerHTML = '';
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
            // 숨김 대상 컬럼은 저장하지 않음
            const persist = [...state.visibleCols].filter(c=> !HIDDEN_TABLE_COLUMNS.has(c));
            localStorage.setItem('system_visible_cols', JSON.stringify(persist));
        } catch(e){}
    }
    function loadColumnSelection(){
        try {
            // Force reset once to apply new default visible columns
            const RESET_KEY = 'system_visible_cols_version';
            const CUR_VERSION = 'v6-2026-03-01';
            const prev = localStorage.getItem(RESET_KEY);
            if(prev !== CUR_VERSION){
                localStorage.removeItem('system_visible_cols');
                localStorage.setItem(RESET_KEY, CUR_VERSION);
            }
            const raw = localStorage.getItem('system_visible_cols');
            if(!raw) return; // nothing stored, keep defaults
            let parsed = [];
            try { parsed = JSON.parse(raw); } catch(_e) { parsed = []; }
            if(!Array.isArray(parsed)) parsed = [];
            // Sanitize: keep only known columns; de-dup
            const allowed = new Set(Object.keys(COLUMN_META));
            const filtered = [...new Set(parsed.filter(k => allowed.has(String(k)) && !HIDDEN_TABLE_COLUMNS.has(String(k))))];
            if(filtered.length > 0){
                state.visibleCols = new Set(filtered);
                // persist sanitized version
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
        const checked = [...form.querySelectorAll('input[type=checkbox]:checked')]
            .map(i=>i.value)
            .filter(v=> !HIDDEN_TABLE_COLUMNS.has(v));
        // 최소 표시 컬럼 수 제한
        const MIN_COLS = 7;
        if(checked.length < MIN_COLS){
            showMessage(`최소 ${MIN_COLS}개 이상 선택해야 합니다.`, '안내');
            return;
        }
        state.visibleCols = new Set(checked);
        saveColumnSelection();
        // 전체 적용은 헤더/바디를 다시 그려 새로운 셀을 생성해야 함
        render();
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
            { title:'작업', cols:['status','task_name','task_type','task_class','start_datetime','end_datetime','impact','service','task_desc'] },
            { title:'담당자', cols:['owner_dept','owner','participant_dept','participants','maint_vendor','maint_staff'] },
            { title:'일정/연계', cols:['project_no','project_name'] }
        ];
        function inputFor(col, value){
            if(col==='status'){
                const v = String(value??'');
                const opts = ['', '검토', '승인', '예정', '진행', '완료'];
                return `<select name="status" class="form-input">${opts.map(o=>`<option value="${o}" ${o===v?'selected':''}>${o===''?'선택':o}</option>`).join('')}</select>`;
            }
            if(col==='impact'){
                const v = String(value??'');
                const opts = ['', '높음', '중간', '낮음'];
                return `<select name="impact" class="form-input">${opts.map(o=>`<option value="${o}" ${o===v?'selected':''}>${o===''?'선택':o}</option>`).join('')}</select>`;
            }
            if(col==='task_class'){
                const v = String(value??'');
                const opts = ['', '테스트','개선','장애대응','변경','점검'];
                return `<select name="task_class" class="form-input">${opts.map(o=>`<option value="${o}" ${o===v?'selected':''}>${o===''?'선택':o}</option>`).join('')}</select>`;
            }
            if(col==='task_type'){
                const v = String(value??'');
                const opts = ['', '서버','스토리지','SAN','네트워크','보안장비','운영체제','데이터베이스','미들웨어','가상화','보안S/W','고가용성'];
                return `<select name="task_type" class="form-input">${opts.map(o=>`<option value="${o}" ${o===v?'selected':''}>${o===''?'선택':o}</option>`).join('')}</select>`;
            }
            if(col==='service'){
                return `<input name="service" class="form-input" value="${value??''}" placeholder="예: 인증, 결제, ERP 등">`;
            }
            if(col==='task_desc'){
                return `<textarea name="task_desc" class="form-input textarea-large" rows="6" placeholder="작업 상세 내용을 입력">${value??''}</textarea>`;
            }
            
            if(col==='participants'){
                return `<input name="participants" class="form-input search-select" value="${value??''}" placeholder="쉼표(,)로 구분">`;
            }
            if(col==='participant_dept' || col==='maint_vendor' || col==='maint_staff'){
                const cls = 'form-input search-select';
                return `<input name="${col}" class="${cls}" value="${value??''}">`;
            }
            if(col==='start_datetime' || col==='end_datetime'){
                return `<input name="${col}" class="form-input" value="${value??''}" placeholder="YYYY-MM-DD HH:MM">`;
            }
            const cls = (col==='owner' || col==='owner_dept') ? 'form-input search-select' : 'form-input';
            return `<input name="${col}" class="${cls}" value="${value??''}">`;
        }
        groups.forEach(g=>{
            const section = document.createElement('div'); section.className='form-section';
            section.innerHTML = `<div class="section-header"><h4>${g.title}</h4></div>`;
            const grid = document.createElement('div'); grid.className='form-grid';
            g.cols.forEach(c=>{
                if(!COLUMN_META[c]) return;
                const wrap = document.createElement('div');
                wrap.className = (c==='task_desc') ? 'form-row form-row-wide' : 'form-row';
                const labelText = COLUMN_META[c]?.label || c;
                wrap.innerHTML = `<label>${labelText}</label>${inputFor(c, row[c])}`;
                grid.appendChild(wrap);
            });
            section.appendChild(grid);
            form.appendChild(section);
        });
    }

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
    const filename = `task_list_${yyyy}${mm}${dd}.csv`;
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
            // Prevent row selection toggle when clicking the task name link
            if(e.target.closest('.work-name-link')){
                // 작업 이름 링크 클릭 → 팝업으로 작업 보고서 열기
                const link = e.target.closest('.work-name-link[data-action="detail"]');
                if(link){
                    e.preventDefault();
                    const rid = link.getAttribute('data-id');
                    try{
                        const url = link.getAttribute('href') || `2.task_detail.html?id=${encodeURIComponent(rid)}`;
                        const w = 1100;
                        const h = 900;
                        const left = Math.max(0, Math.floor((window.screen.width - w) / 2));
                        const top = Math.max(0, Math.floor((window.screen.height - h) / 2));
                        const features = `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`;
                        const popup = window.open(url, 'wrk_report_detail', features);
                        if(popup && popup.focus){ popup.focus(); }
                        if(popup){
                            const startAt = Date.now();
                            const timer = window.setInterval(()=>{
                                try{
                                    if(popup.closed){
                                        window.clearInterval(timer);
                                        if(Date.now() - startAt > 300){
                                            initData();
                                        }
                                    }
                                }catch(_e){
                                    window.clearInterval(timer);
                                }
                            }, 700);
                        }
                    }catch(_e){
                        blsSpaNavigate(link.getAttribute('href'));
                    }
                }
                return;
            }
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
            // 즉시 적용: 표시 컬럼을 전체로 설정하고 테이블을 재렌더
            // 모달에 표시된 컬럼만 대상으로 함 (숨김 대상 제외)
            const allCols = Array.from(new Set(COLUMN_MODAL_GROUPS.flatMap(g=> g.columns)))
                .filter(c => !!COLUMN_META[c] && !HIDDEN_TABLE_COLUMNS.has(c));
            state.visibleCols = new Set(allCols);
            saveColumnSelection();
            applyColumnVisibility();
            render();
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
        document.getElementById(ADD_BTN_ID)?.addEventListener('click', (e)=> {
            e && e.preventDefault && e.preventDefault();
            try{
                const url = '2.task_detail.html';
                const w = 1100;
                const h = 900;
                const left = Math.max(0, Math.floor((window.screen.width - w) / 2));
                const top = Math.max(0, Math.floor((window.screen.height - h) / 2));
                const features = `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`;
                const popup = window.open(url, 'wrk_report_detail', features);
                if(popup && popup.focus){ popup.focus(); }

				// When the popup closes, refresh list data
				if(popup){
					const startAt = Date.now();
					const timer = window.setInterval(()=>{
						try{
							if(popup.closed){
								window.clearInterval(timer);
								// Avoid immediate refresh if popup failed to open
								if(Date.now() - startAt > 300){
									initData();
								}
							}
						}catch(_e){
							window.clearInterval(timer);
						}
					}, 700);
				}
            }catch(_e){
                // fallback: same-tab navigation
                blsSpaNavigate('2.task_detail.html');
            }
        });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', ()=>{
            const form = document.getElementById(ADD_FORM_ID); if(!form.checkValidity()){ form.reportValidity(); return; }
            const data = collectForm(form);
            addRow(data); form.reset(); closeModal(ADD_MODAL_ID); });
        // edit modal
        document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', ()=>{
            const form = document.getElementById(EDIT_FORM_ID);
            const indexEl = document.getElementById(EDIT_SAVE_ID);
            const index = parseInt(indexEl?.getAttribute('data-index')||'-1',10);
            const data = collectForm(form);
            updateRow(index, data);
            closeModal(EDIT_MODAL_ID);
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
                const wsTemplate = XLSX.utils.aoa_to_sheet([UPLOAD_HEADERS_KO]);
                wsTemplate['!cols'] = UPLOAD_HEADERS_KO.map((h)=>{
                    const wide = ['작업 이름','작업 내용','프로젝트 이름'];
                    const mid = ['작업 유형','작업 구분','서비스','담당부서','담당자'];
                    if(wide.includes(h)) return { wch: 20 };
                    if(mid.includes(h)) return { wch: 16 };
                    return { wch: 14 };
                });
                const rules = [
                    ['엑셀 업로드 가이드'],
                    [''],
                    ['작성 규칙'],
                    ['- 첫 행의 컬럼 제목은 아래 순서와 완전히 일치해야 합니다. (순서/이름 변경 불가)'],
                    
                    ['- "작업 유형"은 다음 중 하나만 입력하세요: 서버, 스토리지, SAN, 네트워크, 보안장비, 운영체제, 데이터베이스, 미들웨어, 가상화, 보안S/W, 고가용성'],
                    ['- "작업 구분"은 다음 중 하나만 입력하세요: 테스트, 개선, 장애대응, 변경, 점검'],
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
                XLSX.writeFile(wb, 'task_upload_template.xlsx');
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
                    const TASK_TYPE_ALLOWED = new Set(['','서버','스토리지','SAN','네트워크','보안장비','운영체제','데이터베이스','미들웨어','가상화','보안S/W','고가용성']);
                    const TASK_CLASS_ALLOWED = new Set(['','테스트','개선','장애대응','변경','점검']);
                    for(let r=1; r<rows.length; r++){
                        const row = rows[r]; if(isEmptyRow(row)) continue;
                        const rec = {};
                        for(let c=0; c<header.length; c++){
                            const label = header[c]; const key = HEADER_KO_TO_KEY[label];
                            rec[key] = String(row[c]??'').trim();
                        }
                        // Validation rules (task)
                        
                        if(!TASK_TYPE_ALLOWED.has(rec.task_type||'')) errors.push(`Row ${r+1}: 작업 유형은 지정된 목록에서 선택하세요.`);
                        if(!TASK_CLASS_ALLOWED.has(rec.task_class||'')) errors.push(`Row ${r+1}: 작업 구분은 지정된 목록에서 선택하세요.`);
                        // Normalize
                        
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
        // ── 보고서 재활용 (완료 보고서 → 새 DRAFT 생성) ──
        document.getElementById('system-recycle-btn')?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count === 0){ showMessage('재활용할 보고서를 먼저 선택하세요.', '안내'); return; }
            if(count > 1){ showMessage('재활용은 한 번에 1개의 보고서만 선택할 수 있습니다.', '안내'); return; }
            const subtitle = document.getElementById('recycle-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 보고서를 기반으로 새 초안을 생성합니다.`; }
            openModal('system-recycle-modal');
        });
        document.getElementById('system-recycle-close')?.addEventListener('click', ()=> closeModal('system-recycle-modal'));
        document.getElementById('system-recycle-confirm')?.addEventListener('click', async ()=>{
            const [selectedId] = [...state.selected];
            if(!selectedId){ showMessage('선택된 보고서를 찾을 수 없습니다.', '오류'); closeModal('system-recycle-modal'); return; }
            const btn = document.getElementById('system-recycle-confirm');
            if(btn){ btn.disabled = true; btn.textContent = '처리 중…'; }
            try {
                // 1) 원본 보고서 상세 조회
                const detailRes = await fetch(`/api/wrk/reports/${selectedId}`, { credentials:'same-origin' });
                const detailJson = await detailRes.json().catch(()=>({}));
                if(!detailRes.ok || !detailJson.success){
                    showMessage('원본 보고서를 불러올 수 없습니다.', '오류'); return;
                }
                const src = detailJson.item || detailJson;
                // 2) 재활용 payload 구성 (결재·결과·날짜 제외, 본문 내용 복사)
                const payload = {
                    task_title: (src.task_title || src.task_name || '') + ' (재활용)',
                    project_name: src.project_name || '',
                    start_datetime: null,
                    end_datetime: null,
                    targets: src.targets || '',
                    target_pairs_json: src.target_pairs_json || null,
                    business: src.business || '',
                    impact: src.impact || '',
                    service: src.service || '',
                    draft_dept: src.draft_dept || '',
                    recv_dept: src.recv_dept || '',
                    overview: src.overview || '',
                    precheck: src.precheck || '',
                    procedure: src.procedure || '',
                    postcheck: src.postcheck || '',
                    resources: src.resources || '',
                    etc: src.etc || '',
                    worker_name: src.worker_name || '',
                    partner_dept_text: src.partner_dept_text || '',
                    participants_text: src.participants_text || '',
                    vendor_text: src.vendor_text || '',
                    vendor_staff_text: src.vendor_staff_text || '',
                    classifications: src.classifications || [],
                    worktypes: src.worktypes || [],
                    participant_user_ids: src.participant_user_ids || [],
                    participant_dept_ids: src.participant_dept_ids || [],
                    vendors: (src.vendors || []).map(v=> ({
                        vendor_name: v.vendor_name,
                        staffs: (v.staffs||[]).map(s=> ({ staff_name: s.staff_name, memo: s.memo }))
                    })),
                };
                // 3) 새 DRAFT 보고서 생성
                const createRes = await fetch('/api/wrk/reports', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify(payload)
                });
                const createJson = await createRes.json().catch(()=>({}));
                if(!createRes.ok || !createJson.success){
                    showMessage(createJson.message || '보고서 생성에 실패했습니다.', '오류'); return;
                }
                const newId = createJson.id || (createJson.item && createJson.item.id);
                closeModal('system-recycle-modal');
                // 4) 새 보고서 상세 페이지로 이동
                if(newId){
                    showMessage('보고서가 재활용되었습니다. 새 초안을 엽니다.', '완료');
                    setTimeout(()=>{
                        const url = `2.task_detail.html?id=${encodeURIComponent(newId)}`;
                        const w = 1100, h = 900;
                        const left = Math.max(0, Math.floor((window.screen.width - w) / 2));
                        const top = Math.max(0, Math.floor((window.screen.height - h) / 2));
                        const features = `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`;
                        const popup = window.open(url, 'wrk_report_detail', features);
                        if(popup && popup.focus){ popup.focus(); }
                    }, 600);
                } else {
                    showMessage('보고서가 재활용되었습니다.', '완료');
                    initData();
                }
            } catch(err){
                console.error('recycle error', err);
                showMessage('보고서 재활용 중 오류가 발생했습니다.', '오류');
            } finally {
                if(btn){ btn.disabled = false; btn.textContent = '재활용'; }
            }
        });
        // dispose (불용처리)
        document.getElementById(DISPOSE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('불용처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('dispose-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 작업을 정말 불용처리하시겠습니까?`; }
            openModal(DISPOSE_MODAL_ID);
        });
    document.getElementById(DISPOSE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DISPOSE_MODAL_ID));
        document.getElementById(DISPOSE_CONFIRM_ID)?.addEventListener('click', ()=>{
            // 수집 대상 열: 작업 스키마 기준 필드 스냅샷 (대상수 제거됨)
            const fields = ['status','task_name','task_type','task_class','owner_dept','owner','participants','impact','start_datetime','end_datetime','project_no','project_name'];
            const selected = state.data.filter(r=> state.selected.has(r.id)).map(r=>{
                const obj = { id: r.id };
                fields.forEach(f=> obj[f] = r[f] ?? '');
                return obj;
            });
            try {
                sessionStorage.setItem('dispose_selected_rows', JSON.stringify(selected));
            } catch(_e){}
            closeModal(DISPOSE_MODAL_ID);
            // TODO: 라우팅 결정 후 불용처리 페이지 이동 처리
            // window.location.href = '/app/templates/8.project/8-2.task/8-2-3.task_list/disposal.html';
        });
        // delete (삭제처리)
        document.getElementById(DELETE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('삭제처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('delete-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 작업을 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', async ()=>{
            const ids = [...state.selected];
            if(ids.length === 0){ closeModal(DELETE_MODAL_ID); return; }
            const btn = document.getElementById(DELETE_CONFIRM_ID);
            if(btn){ btn.disabled = true; }
            let deleted = 0;
            try {
                for(const id of ids){
                    try {
                        const res = await fetch(`/api/wrk/reports/${id}`, {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'same-origin'
                        });
                        if(res.ok) deleted++;
                    } catch(_e){}
                }
                state.selected.clear();
                closeModal(DELETE_MODAL_ID);
                // DB에서 다시 로드
                initData();
                if(deleted > 0){
                    setTimeout(()=> showMessage(`${deleted}개 항목이 삭제되었습니다.`, '삭제 완료'), 300);
                }
            } catch(err){
                console.error(err);
                showMessage('삭제 중 오류가 발생했습니다.', '삭제 실패');
            } finally {
                if(btn){ btn.disabled = false; }
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
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 작업에서 지정한 필드를 일괄 변경합니다.`; }
            buildBulkForm();
            openModal(BULK_MODAL_ID);
        });
        document.getElementById(BULK_CLOSE_ID)?.addEventListener('click', ()=> closeModal(BULK_MODAL_ID));
        document.getElementById(BULK_APPLY_ID)?.addEventListener('click', ()=>{
            const form = document.getElementById(BULK_FORM_ID); if(!form) return;
            const entries = [...form.querySelectorAll('[data-bulk-field]')]
                .map(el=>({ field: el.getAttribute('data-bulk-field'), value: el.value }))
                .filter(p=> p.value !== '');
            if(!entries.length){ showMessage('변경할 값을 1개 이상 입력하세요.', '안내'); return; }
            const ids = new Set(state.selected);
            // 적용: 현재 데이터에서 선택된 행들에만 입력된 필드를 덮어쓰기
            state.data = state.data.map(row=>{
                if(!ids.has(row.id)) return row;
                const updated = { ...row };
                entries.forEach(({field, value})=>{ updated[field] = value; });
                return updated;
            });
            applyFilter();
            closeModal(BULK_MODAL_ID);
            setTimeout(()=> showMessage(`${ids.size}개 항목에 일괄 변경이 적용되었습니다.`, '완료'), 0);
        });
        // esc close
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ [ADD_MODAL_ID,EDIT_MODAL_ID,COLUMN_MODAL_ID,DISPOSE_MODAL_ID,DELETE_MODAL_ID,BULK_MODAL_ID,UPLOAD_MODAL_ID,'system-download-modal','system-message-modal','system-recycle-modal'].forEach(closeModal); }});
    // include stats modal in esc close
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeModal(STATS_MODAL_ID); }});

        // message modal bindings
        document.getElementById('system-message-close')?.addEventListener('click', ()=> closeModal('system-message-modal'));
        document.getElementById('system-message-ok')?.addEventListener('click', ()=> closeModal('system-message-modal'));

    function buildBulkForm(){
        const form = document.getElementById(BULK_FORM_ID); if(!form) return;
        function inputFor(col){
            if(col==='status'){
                const opts = ['', '검토', '승인', '예정', '진행', '완료'];
                return `<select class="form-input" data-bulk-field="status">${opts.map(o=>`<option value="${o}">${o===''?'선택':o}</option>`).join('')}</select>`;
            }
            if(col==='impact'){
                const opts = ['', '높음', '중간', '낮음'];
                return `<select class="form-input" data-bulk-field="impact">${opts.map(o=>`<option value="${o}">${o===''?'선택':o}</option>`).join('')}</select>`;
            }
            if(col==='task_type'){
                const opts = ['', '서버','스토리지','SAN','네트워크','보안장비','운영체제','데이터베이스','미들웨어','가상화','보안S/W','고가용성'];
                return `<select class="form-input" data-bulk-field="task_type">${opts.map(o=>`<option value="${o}">${o===''?'선택':o}</option>`).join('')}</select>`;
            }
            if(col==='task_class'){
                const opts = ['', '테스트','개선','장애대응','변경','점검'];
                return `<select class="form-input" data-bulk-field="task_class">${opts.map(o=>`<option value=\"${o}\">${o===''?'선택':o}</option>`).join('')}</select>`;
            }
            if(col==='service') return `<input class="form-input" data-bulk-field="service" placeholder="예: 인증, 결제, ERP 등">`;
            if(col==='task_desc') return `<textarea class="form-input textarea-large" rows="4" data-bulk-field="task_desc" placeholder="작업 상세 내용을 입력"></textarea>`;
            if(col==='participant_dept' || col==='maint_vendor' || col==='maint_staff') return `<input class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
            
            if(col==='start_datetime' || col==='end_datetime') return `<input class="form-input" data-bulk-field="${col}" placeholder="YYYY-MM-DD HH:MM">`;
            return `<input class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }
        const GROUPS = [
            { title:'작업', cols:['status','task_name','task_type','task_class','start_datetime','end_datetime','impact','service','task_desc'] },
            { title:'담당자', cols:['owner_dept','owner','participant_dept','participants','maint_vendor','maint_staff'] },
            { title:'일정/연계', cols:['project_no','project_name'] }
        ];
        form.innerHTML = GROUPS.map(g=>{
            const grid = g.cols.map(col=>{
                const meta = COLUMN_META[col]; if(!meta) return '';
                return `<div class="form-row"><label>${meta.label}</label>${inputFor(col)}</div>`;
            }).join('');
            return `
                <div class="form-section">
                    <div class="section-header"><h4>${g.title}</h4></div>
                    <div class="form-grid">${grid}</div>
                </div>`;
        }).join('');
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
        const taskEl = document.getElementById('stats-software');   // 작업 현황
        const deptEl = document.getElementById('stats-versions');   // 담당 현황
        if(taskEl) taskEl.innerHTML = '';
        if(deptEl) deptEl.innerHTML = '';
        const rows = state.filtered.length ? state.filtered : state.data;

        // ── 작업 현황 ──
        renderStatBlock('stats-software', '작업 구분', countBy(rows, 'task_type'));
        renderStatBlock('stats-software', '영향도', countBy(rows, 'impact'));

        // ── 담당 현황 ──
        renderStatBlock('stats-versions', '담당부서', countBy(rows, 'owner_dept'));
        renderStatBlock('stats-versions', '참여부서', countBy(rows, 'participant_dept'));
        renderStatBlock('stats-versions', '유지보수 업체', countBy(rows, 'maint_vendor'));
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

// ---------- Column modal builder (kept outside to keep functions hoisted within IIFE scope) ----------
// (Removed duplicate global buildColumnModal/syncColumnSelectAll to avoid conflicts)


