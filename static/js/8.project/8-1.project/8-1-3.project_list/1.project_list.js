/**
 * 프로젝트 관리 페이지 스크립트
 * - 컬럼 토글 (기본 10개 노출)
 * - 로컬(in-memory) 데이터 렌더링 + 페이징 + 검색
 * - 모달 (등록/수정/컬럼 선택)
 * - CSV 다운로드 (현재 페이지 or 전체)
 * NOTE: 서버 연동 (prj_project)
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
        // Support both named inputs (add/edit) and bulk fields
        const startEl = form.querySelector('[name="start_date"], [data-bulk-field="start_date"]');
        const endEl = form.querySelector('[name="end_date"], [data-bulk-field="end_date"]');
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

    // Stats modal
    const STATS_BTN_ID = 'system-stats-btn';
    const STATS_MODAL_ID = 'system-stats-modal';
    const STATS_CLOSE_ID = 'system-stats-close';
    const STATS_OK_ID = 'system-stats-ok';

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

    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
    function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }

    // Data + State
    const BASE_VISIBLE_COLUMNS = [
        // 기본 컬럼에서 '참여자', '예산', '설명' 제외 (요청 반영)
        'status','project_name','project_type','owner_dept','owner','priority','start_date','end_date','task_count','progress'
    ];
    const COLUMN_ORDER = [
        'status','project_name','project_type','owner_dept','owner','participants','priority','start_date','end_date','budget','task_count','progress','description'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    // 추가/수정 모달과 동일한 섹션으로 분류
    const COLUMN_MODAL_GROUPS = [
        { group: '기본 정보', columns: ['project_name','project_type','owner_dept','owner','priority','participants','description'] },
        { group: '진행/일정', columns: ['status','start_date','end_date','budget','task_count','progress'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        status:{label:'상태',group:'프로젝트'},
        project_name:{label:'프로젝트 이름',group:'프로젝트'},
        project_type:{label:'유형',group:'프로젝트'},
    owner_dept:{label:'담당부서',group:'프로젝트'},
    owner:{label:'담당자',group:'프로젝트'},
        participants:{label:'참여자',group:'프로젝트'},
        priority:{label:'우선순위',group:'프로젝트'},
        start_date:{label:'시작일',group:'프로젝트'},
        end_date:{label:'(예상)종료일',group:'프로젝트'},
        budget:{label:'예산',group:'프로젝트'},
        task_count:{label:'작업수',group:'프로젝트'},
        progress:{label:'진행률(%)',group:'프로젝트'},
        description:{label:'설명',group:'프로젝트'}
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

    // 프로젝트 페이지: 요청에 따라 샘플 데이터 5개 제공
    function mockData(count=5){
        const rows = [
            { id: 1, status:'진행', project_name:'데이터센터 마이그레이션', project_type:'인프라', owner_dept:'인프라팀', owner:'홍길동', participants:'김철수,이영희', priority:'긴급', start_date:'2025-01-10', end_date:'2025-06-30', budget:120000000, task_count:42, progress:55, description:'센터 이전 프로젝트' },
            { id: 2, status:'예정', project_name:'ERP 업그레이드', project_type:'개발', owner_dept:'개발팀', owner:'김민수', participants:'박보라', priority:'일반', start_date:'2025-03-01', end_date:'2025-09-15', budget:50000000, task_count:18, progress:0, description:'ERP vNext' },
            { id: 3, status:'진행', project_name:'클라우드 전환 PoC', project_type:'운영', owner_dept:'운영팀', owner:'이영희', participants:'최가을,정우성', priority:'낮음', start_date:'2025-02-05', end_date:'2025-04-30', budget:20000000, task_count:12, progress:70, description:'PoC 진행' },
            { id: 4, status:'완료', project_name:'보안 점검', project_type:'보안', owner_dept:'보안팀', owner:'최가을', participants:'', priority:'일반', start_date:'2024-12-01', end_date:'2025-01-15', budget:8000000, task_count:9, progress:100, description:'정기 점검' },
            { id: 5, status:'보류', project_name:'네트워크 개선', project_type:'인프라', owner_dept:'인프라팀', owner:'정우성', participants:'홍길동', priority:'일반', start_date:'2025-01-20', end_date:'2025-05-10', budget:30000000, task_count:25, progress:35, description:'확대 검토' }
        ];
        return rows.slice(0, Math.max(0, count|0));
    }

    function getCurrentKey(){
        if(window.__PROJ_CURRENT_KEY){
            return String(window.__PROJ_CURRENT_KEY || '').trim();
        }
        // Fallback: try active tab link
        const active = document.querySelector('.system-tabs .system-tab-btn.active');
        if(active && active.getAttribute('href')){
            const href = active.getAttribute('href');
            const m = href.match(/key=([^&]+)/i);
            if(m && m[1]) return decodeURIComponent(m[1]);
        }
        return '';
    }

    function getViewScope(){
        const key = getCurrentKey();
        if(key === 'proj_status') return 'owned';
        if(key === 'proj_participating') return 'participating';
        // "프로젝트 현황" 탭은 요구사항에 따라 모든 프로젝트(all)
        return 'all';
    }

    function getCurrentTabLabel(){
        const key = getCurrentKey();
        if(key === 'proj_status') return '담당 프로젝트';
        if(key === 'proj_participating') return '참여 프로젝트';
        return '프로젝트 현황';
    }

    async function fetchJson(url, opts){
        const res = await fetch(url, {
            method: (opts && opts.method) || 'GET',
            headers: Object.assign({ 'Accept': 'application/json' }, (opts && opts.headers) || {}),
            body: (opts && opts.body) || undefined,
        });
        let data = null;
        try{ data = await res.json(); }catch(_e){ data = null; }
        return { res, data };
    }

    function mapApiProjectToRow(item){
        if(!item) return null;
        return {
            id: item.id,
            status: item.status || '',
            project_name: item.project_name || '',
            project_type: item.project_type || '',
            owner_dept: item.owner_dept_name || '',
            owner_dept_id: item.owner_dept_id || null,
            owner: item.manager_name || '',
            manager_user_id: item.manager_user_id || null,
            participants: item.stakeholder_names || item.participants || '',
            participant_user_ids: item.participant_user_ids || [],
            priority: item.priority || '',
            start_date: item.start_date || '',
            end_date: item.expected_end_date || '',
            budget: (item.budget_amount == null ? '' : item.budget_amount),
            task_count: (item.task_count_cached == null ? '' : item.task_count_cached),
            progress: (item.schedule_progress_rate == null ? '' : item.schedule_progress_rate),
            description: item.description || '',
        };
    }

    async function loadFromServer(){
        const scope = getViewScope();
        const url = `/api/prj/projects?scope=${encodeURIComponent(scope)}&limit=2000`;
        const { res, data } = await fetchJson(url);
        if(res.status === 401){
            // Keep it simple: show message; login flow is app-specific.
            showMessage('로그인이 필요합니다.', '안내');
            return null;
        }
        if(!res.ok || !data || data.success !== true){
            return null;
        }
        const items = Array.isArray(data.items) ? data.items : [];
        return items.map(mapApiProjectToRow).filter(Boolean);
    }

    async function initData(){
        try{
            const rows = await loadFromServer();
            if(rows && rows.length){
                state.data = rows;
                state.nextId = (Math.max(...rows.map(r=> r.id || 0)) || 0) + 1;
                applyFilter();
                return;
            }
            // If server returns empty list, keep it empty rather than mock
            if(rows && rows.length === 0){
                state.data = [];
                state.nextId = 1;
                applyFilter();
                return;
            }
        }catch(_e){}

        // Fallback to mock only if server call fails
        state.data = mockData(5);
        state.nextId = state.data.length + 1;
        applyFilter();
        showMessage('서버 데이터를 불러오지 못해 샘플 데이터를 표시합니다.', '안내');
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
        // NOTE: scope(담당/참여/전체)는 서버에서 결정합니다.
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
        const tableContainer = document.querySelector('.system-table-container');
        const paginationEl = document.getElementById('system-pagination');
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
        // ── 0건 early return (완료 프로젝트와 동일 패턴) ──
        if(state.filtered.length === 0){
            if(tableContainer) tableContainer.hidden = true;
            if(paginationEl) paginationEl.hidden = false;
            if(emptyEl){
                emptyEl.hidden = false;
                const titleEl = document.getElementById('system-empty-title');
                const descEl = document.getElementById('system-empty-desc');
                const tabLabel = getCurrentTabLabel();
                if(state.search.trim()){
                    if(titleEl) titleEl.textContent = '검색 결과가 없습니다.';
                    if(descEl) descEl.textContent = `${tabLabel}에서 검색어를 변경하거나 필터를 초기화하세요.`;
                } else {
                    if(titleEl) titleEl.textContent = `${tabLabel} 내역이 없습니다.`;
                    if(descEl) descEl.textContent = "우측 상단 '추가' 버튼을 눌러 첫 프로젝트를 등록하세요.";
                }
            }
            const countEl = document.getElementById(COUNT_ID);
            if(countEl){ countEl.textContent = '0'; countEl.setAttribute('data-count','0'); }
            updatePagination();
            return;
        }
        if(emptyEl){
            if(tableContainer) tableContainer.hidden = false;
            if(paginationEl) paginationEl.hidden = false;
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
                    const displayVal = (rawVal==null || String(rawVal).trim()==='') ? '-' : rawVal;
                    let cellValue = highlight(displayVal, col);
                    // 상태 배지
                    if(col === 'status'){
                        const v = String(displayVal);
                        let cls = 'ws-wait';
                        if(v === '진행') cls = 'ws-run';
                        else if(v === '완료') cls = 'ws-idle';
                        else if(v === '예정' || v === '보류') cls = 'ws-wait';
                        cellValue = `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${highlight(displayVal, col)}</span></span>`;
                    }
                    // 참여자 요약 표시: "첫번째 외 N명" (전체 목록은 title 툴팁)
                    if(col === 'participants'){
                        const raw = String(rawVal||'').trim();
                        if(raw){
                            const parts = raw.split(',').map(x=>x.trim()).filter(Boolean);
                            let summary = '-';
                            if(parts.length === 1){ summary = parts[0]; }
                            else if(parts.length > 1){ summary = `${parts[0]} 외 ${parts.length-1}명`; }
                            cellValue = `<span class="participants-summary" title="${escapeHTML(raw)}">${highlight(summary, col)}</span>`;
                        } else {
                            cellValue = '-';
                        }
                    }
                    // 우선순위 점만 표시 (둥근 배경 제거)
                    if(col === 'priority' && displayVal !== '-'){
                        const v = String(displayVal);
                        let cls = 'pri-일반';
                        if(v === '긴급') cls = 'pri-긴급';
                        else if(v === '낮음') cls = 'pri-낮음';
                        else if(v === '일반') cls = 'pri-일반';
                        cellValue = `<span class="priority-dot ${cls}" aria-hidden="true"></span><span class="priority-text">${highlight(displayVal, col)}</span>`;
                    }
                    // 예산 통화 포맷
                    if(col === 'budget' && displayVal !== '-'){
                        try{ const n = Number(displayVal); cellValue = isNaN(n) ? escapeHTML(displayVal) : n.toLocaleString('ko-KR'); }catch(_e){}
                    }
                    // 진행률 바
                    if(col === 'progress' && displayVal !== '-'){
                        const n = Math.max(0, Math.min(100, parseInt(displayVal,10)||0));
                        cellValue = `<div class="progress-cell"><div class="progress-bar"><span style="width:${n}%"></span></div><span class="progress-text">${n}%</span></div>`;
                    }
                    // 프로젝트 이름: 상세 페이지로 링크 처리 (동적 라우팅)
                    if(col === 'project_name'){
                        const detailHref = (window.__PROJ_COMPLETED_DETAIL_URL || '/p/proj_completed_detail');
                        const nameHtml = highlight(displayVal, col);
                        cellValue = `<a href="${detailHref}" class="work-name-link" data-id="${row.id??''}" title="상세 보기">${nameHtml}</a>`;
                    }
                    return `<td data-col="${col}" data-label="${label}" class="${tdClass}">${cellValue}</td>`;
                }).join('')
                + `<td data-col="actions" data-label="관리" class="system-actions">`
                    + `<a href="${(window.__PROJ_COMPLETED_DETAIL_URL || '/p/proj_completed_detail')}" class="action-btn" data-action="detail" data-id="${row.id}" title="상세보기" aria-label="상세보기">
                    <img src="/static/image/svg/project/free-icon-master-plan.svg" alt="상세보기" class="action-icon">
                   </a>`
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

    // Pagination UI – windowed (shows nearby pages + first/last with ellipsis)
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
            const windowSize = 5;
            let startPage = Math.max(1, state.page - Math.floor(windowSize / 2));
            let endPage = Math.min(pages, startPage + windowSize - 1);
            if(endPage - startPage < windowSize - 1){
                startPage = Math.max(1, endPage - windowSize + 1);
            }
            // First page + ellipsis
            if(startPage > 1){
                const btn = document.createElement('button');
                btn.className = 'page-btn' + (state.page===1?' active':'');
                btn.textContent = '1';
                btn.dataset.page = 1;
                container.appendChild(btn);
                if(startPage > 2){
                    const dots = document.createElement('span');
                    dots.className = 'page-ellipsis';
                    dots.textContent = '…';
                    container.appendChild(dots);
                }
            }
            for(let p=startPage; p<=endPage; p++){
                const btn = document.createElement('button');
                btn.className = 'page-btn'+(p===state.page?' active':'');
                btn.textContent = p;
                btn.dataset.page = p;
                container.appendChild(btn);
            }
            // Last page + ellipsis
            if(endPage < pages){
                if(endPage < pages - 1){
                    const dots = document.createElement('span');
                    dots.className = 'page-ellipsis';
                    dots.textContent = '…';
                    container.appendChild(dots);
                }
                const btn = document.createElement('button');
                btn.className = 'page-btn' + (state.page===pages?' active':'');
                btn.textContent = pages;
                btn.dataset.page = pages;
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
        const el = document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false');
        // Ensure hardware/software-style searchable dropdowns are enhanced when the modal opens.
        try {
            requestAnimationFrame(() => {
                try { window.BlossomSearchableSelect?.syncAll?.(el); } catch(_e) {}
            });
        } catch(_e) {}
    }
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

    const VISIBLE_COLS_KEY = 'project_visible_cols_v1';
    // 이전 기본값(마이그레이션 용): 참여자 포함 기본 세트
    const PREV_BASE_VISIBLE_COLUMNS = [
        'status','project_name','project_type','owner','participants','priority','start_date','end_date','budget','task_count','progress','description'
    ];
    // 직전 기본값(참여자 제외, 예산/설명 포함)
    const PREV_BASE_VISIBLE_COLUMNS_V2 = [
        'status','project_name','project_type','owner','priority','start_date','end_date','budget','task_count','progress','description'
    ];
    function saveColumnSelection(){
        try { localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify([...state.visibleCols])); } catch(e){}
    }
    function loadColumnSelection(){
        try {
            const raw = localStorage.getItem(VISIBLE_COLS_KEY);
            if(!raw){
                // No page-specific selection stored — default to reset state and persist
                state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
                try { localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify([...state.visibleCols])); } catch(_e){}
                // Clean up legacy global keys to avoid confusion across pages
                try { localStorage.removeItem('system_visible_cols'); localStorage.removeItem('system_visible_cols_schema'); } catch(_e){}
                return;
            }
            let parsed = [];
            try { parsed = JSON.parse(raw); } catch(_e) { parsed = []; }
            if(!Array.isArray(parsed)) parsed = [];
            // Sanitize to known columns & de-dup
            const allowed = new Set(Object.keys(COLUMN_META));
            const filtered = [...new Set(parsed.filter(k => allowed.has(String(k))))];
            // Migration: if user is still on a previous default set, migrate to the latest default.
            // - v1: included 'participants'
            // - v2: excluded 'participants' but included 'budget' and 'description'
            const sameAsPrevDefaultV1 = (function(){
                if(filtered.length !== PREV_BASE_VISIBLE_COLUMNS.length) return false;
                const a = new Set(filtered); const b = new Set(PREV_BASE_VISIBLE_COLUMNS);
                if(a.size !== b.size) return false; for(const k of a){ if(!b.has(k)) return false; } return true;
            })();
            const sameAsPrevDefaultV2 = (function(){
                if(filtered.length !== PREV_BASE_VISIBLE_COLUMNS_V2.length) return false;
                const a = new Set(filtered); const b = new Set(PREV_BASE_VISIBLE_COLUMNS_V2);
                if(a.size !== b.size) return false; for(const k of a){ if(!b.has(k)) return false; } return true;
            })();
            if(sameAsPrevDefaultV1 || sameAsPrevDefaultV2){
                state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
                try { localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify([...state.visibleCols])); } catch(_e){}
                return;
            }
            const MIN_COLS = 7;
            const mustHave = ['status','project_name','project_type','owner'];
            const hasMust = mustHave.every(k => filtered.includes(k));
            if(filtered.length > 0 && filtered.length >= MIN_COLS && hasMust){
                state.visibleCols = new Set(filtered);
            } else {
                state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
                try { localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify([...state.visibleCols])); } catch(_e){}
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
        form.querySelectorAll('input,select,textarea').forEach(el=>{
            if(!el || !el.name) return;
            if(el.disabled) return; // do not collect disabled (locked) fields
            data[el.name]=el.value.trim();
        });
        return data;
    }

    function fillEditForm(row){
        const form = document.getElementById(EDIT_FORM_ID); if(!form) return;
        const _e = (s)=> String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        /* ── 등록 모달 HTML과 100% 동일한 구조로 생성 ── */
        form.innerHTML = ''
          /* ── 기본 정보 섹션 ── */
          + '<div class="form-section">'
          +   '<div class="section-header"><h4>기본 정보</h4></div>'
          +   '<div class="form-grid">'
          +     '<div class="form-row form-row-wide"><label>프로젝트 이름<span class="required">*</span></label>'
          +       '<input name="project_name" class="form-input" placeholder="이름" value="' + _e(row.project_name) + '" required></div>'
          +     '<div class="form-row"><label>유형<span class="required">*</span></label>'
          +       generateFieldInput('project_type', row.project_type) + '</div>'
          +     '<input type="hidden" name="owner_dept" value="' + _e(row.owner_dept) + '">'
          +     '<input type="hidden" name="owner" value="' + _e(row.owner) + '">'
          +     '<div class="form-row"><label>우선순위</label>'
          +       generateFieldInput('priority', row.priority) + '</div>'
          +     '<input type="hidden" name="participants" value="' + _e(row.participants) + '">'
          +     '<div class="form-row form-row-wide"><label>설명</label>'
          +       '<textarea name="description" class="form-input textarea-large" placeholder="설명">' + _e(row.description) + '</textarea></div>'
          +   '</div>'
          + '</div>'
          /* ── 진행/일정 섹션 ── */
          + '<div class="form-section">'
          +   '<div class="section-header"><h4>진행/일정</h4></div>'
          +   '<div class="form-grid">'
          +     '<div class="form-row"><label>상태<span class="required">*</span></label>'
          +       generateFieldInput('status', row.status) + '</div>'
          +     '<div class="form-row"><label>예산</label>'
          +       generateFieldInput('budget', row.budget) + '</div>'
          +     '<div class="form-row"><label>시작일</label>'
          +       '<input name="start_date" class="form-input date-input" placeholder="YYYY-MM-DD" value="' + _e(row.start_date) + '" readonly></div>'
          +     '<div class="form-row"><label>(예상)종료일</label>'
          +       '<input name="end_date" class="form-input date-input" placeholder="YYYY-MM-DD" value="' + _e(row.end_date) + '" readonly></div>'
          +     '<input type="hidden" name="task_count" value="' + _e(row.task_count) + '">'
          +     '<input type="hidden" name="progress" value="' + _e(row.progress || '') + '">'
          +   '</div>'
          + '</div>';
    }

    function generateFieldInput(col,value=''){
        // software selects/search-selects
        if(col==='status'){
            const v = String(value??'');
            return `<select name="status" class="form-input search-select" data-searchable="true" data-placeholder="선택" required>
                <option value="예정" ${v==='예정'?'selected':''}>예정</option>
                <option value="진행" ${v==='진행'?'selected':''}>진행</option>
                <option value="완료" ${v==='완료'?'selected':''}>완료</option>
                <option value="보류" ${v==='보류'?'selected':''}>보류</option>
            </select>`;
        }
        if(col==='project_type'){
            const v = String(value??'');
            return `<select name="project_type" class="form-input search-select" data-searchable="true" data-placeholder="선택" required>
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="신규 구축" ${v==='신규 구축'?'selected':''}>신규 구축</option>
                <option value="개선/고도화" ${v==='개선/고도화'?'selected':''}>개선/고도화</option>
                <option value="유지보수" ${v==='유지보수'?'selected':''}>유지보수</option>
                <option value="운영지원" ${v==='운영지원'?'selected':''}>운영지원</option>
            </select>`;
        }
        if(['project_name','owner_dept','owner','participants','start_date','end_date'].includes(col)){
            const ph = col==='participants' ? ',로 구분' : (col.endsWith('_date') ? 'YYYY-MM-DD' : '입력');
            const req = (col==='owner' || col==='project_name' || col==='owner_dept') ? ' required' : '';
            if(col==='participants'){
                const display = (value==null || value==='') ? '' : String(value);
                return `<input name="participants" class="form-input locked-field" placeholder=",로 구분" value="${display}" disabled>`;
            }
            return `<input name="${col}" class="form-input" placeholder="${ph}" value="${value??''}"${req}>`;
        }
        if(col==='priority'){
            const v = String(value??'');
            return `<select name="priority" class="form-input search-select" data-searchable="true" data-placeholder="선택">
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="긴급" ${v==='긴급'?'selected':''}>긴급</option>
                <option value="일반" ${v==='일반'?'selected':''}>일반</option>
                <option value="낮음" ${v==='낮음'?'selected':''}>낮음</option>
            </select>`;
        }
        if(col==='budget'){
            const formatted = (value==null || value==='') ? '' : (Number(value).toLocaleString('ko-KR'));
            return `<input name="budget" type="text" inputmode="numeric" pattern="[0-9,]*" class="form-input" value="${formatted}" placeholder="숫자">`;
        }
        if(col==='task_count' || col==='progress'){
            const display = (value==null || value==='') ? '' : String(value);
            if(col==='progress'){
                const val = display ? (display.endsWith('%') ? display : `${display}%`) : '';
                return `<input name="progress" type="text" class="form-input locked-field" value="${val}" placeholder="-" disabled>`;
            }
            return `<input name="${col}" type="number" class="form-input locked-field" value="${display}" placeholder="-" disabled>`;
        }
        if(col==='description'){
            const v = (value==null ? '' : String(value));
            return `<textarea name="description" class="form-input textarea-large" placeholder="설명">${v.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>`;
        }
        return `<input name="${col}" class="form-input" value="${value??''}">`;
    }

    // (Removed) License live-sync helpers were used in software pages; not applicable for project schema

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

    async function apiDeleteProjects(ids){
        return fetchJson('/api/prj/projects/bulk-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
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
    const filename = `project_list_${yyyy}${mm}${dd}.csv`;
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
            // 프로젝트 이름 링크 클릭 처리 (컨텍스트 저장 + 파라미터 부여 후 이동)
            const nameLink = e.target.closest('.work-name-link');
            if(nameLink){
                e.preventDefault();
                const rid = parseInt(nameLink.getAttribute('data-id'),10);
                const row = state.data.find(r=> r.id === rid);
                if(row){
                    const payload = {
                        project_id: (!isNaN(rid) ? String(rid) : ''),
                        id: (!isNaN(rid) ? String(rid) : ''),
                        status: row.status || '',
                        project_name: row.project_name || '',
                        project_type: row.project_type || '',
                        owner_dept: row.owner_dept || '',
                        owner: row.owner || '',
                        participants: row.participants || '',
                        priority: row.priority || '',
                        start_date: row.start_date || '',
                        end_date: row.end_date || '',
                        budget: row.budget != null ? String(row.budget) : '',
                        task_count: row.task_count != null ? String(row.task_count) : '',
                        progress: row.progress != null ? String(row.progress) : '',
                        description: row.description || ''
                    };
                    try { sessionStorage.setItem('project_selected_row', JSON.stringify(payload)); } catch(_e){}
                    const base = (window.__PROJ_COMPLETED_DETAIL_URL || '/p/proj_completed_detail');
                    window.location.href = base;
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
                    fillEditForm(row);
                    // 검색형 셀렉트 + 날짜 피커 초기화 (detail 페이지와 동일)
                    try { const _ef = document.getElementById(EDIT_FORM_ID); if(_ef && window.BlossomSearchableSelect?.enhance) window.BlossomSearchableSelect.enhance(_ef); } catch(_ss){}
                    openModal(EDIT_MODAL_ID);
                    initDatePickers(EDIT_FORM_ID);
                    const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                    if(editSaveEl){ editSaveEl.setAttribute('data-index', realIndex); }
                }
                return; // 액션 버튼 클릭 처리 후 종료
            }
            // 프로젝트 이름 링크 클릭 시에는 행 선택 토글 방지 (상세 페이지 이동 우선)
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
    document.getElementById(ADD_BTN_ID)?.addEventListener('click', ()=> { openModal(ADD_MODAL_ID); initDatePickers(ADD_FORM_ID); });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', ()=>{
            const form = document.getElementById(ADD_FORM_ID); if(!form.checkValidity()){ form.reportValidity(); return; }
            const data = collectForm(form);
            // normalize budget (remove commas)
            if(typeof data.budget === 'string'){ data.budget = data.budget.replace(/,/g,''); }
            if(data.budget === '') delete data.budget; else data.budget = parseInt(data.budget,10)||0;
            addRow(data); form.reset(); closeModal(ADD_MODAL_ID); });
        // edit modal
    document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', ()=>{
            const form = document.getElementById(EDIT_FORM_ID);
            if(!form.checkValidity()){ form.reportValidity(); return; }
            const indexEl = document.getElementById(EDIT_SAVE_ID);
            const index = parseInt(indexEl?.getAttribute('data-index')||'-1',10);
            const data = collectForm(form);
            if(typeof data.budget === 'string'){ data.budget = data.budget.replace(/,/g,''); }
            if(data.budget === '') delete data.budget; else data.budget = parseInt(data.budget,10)||0;
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
        // esc close (removed actions pruned)
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ [ADD_MODAL_ID,EDIT_MODAL_ID,COLUMN_MODAL_ID,DELETE_MODAL_ID,'system-download-modal','system-message-modal'].forEach(closeModal); }});
    // include stats modal in esc close
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeModal(STATS_MODAL_ID); }});

        // delete (삭제처리)
        document.getElementById(DELETE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('삭제처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('delete-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 프로젝트를 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', async ()=>{
            const ids = [...state.selected];
            if(!ids.length){ showMessage('삭제할 프로젝트를 선택하세요.', '안내'); return; }
            const btn = document.getElementById(DELETE_CONFIRM_ID);
            if(btn){ btn.disabled = true; }
            try{
                const { res, data } = await apiDeleteProjects(ids);
                if(res.ok && data && data.success){
                    state.selected.clear();
                    closeModal(DELETE_MODAL_ID);
                    const rows = await loadFromServer();
                    state.data = rows || [];
                    state.nextId = (Math.max(...state.data.map(r=> r.id||0))||0)+1;
                    applyFilter();
                    showMessage(`${data.deleted||0}개 프로젝트가 삭제되었습니다.`, '삭제 완료');
                } else {
                    showMessage((data&&data.message)||'프로젝트 삭제 중 오류가 발생했습니다.', '삭제 실패');
                }
            }catch(err){
                console.error(err);
                showMessage('서버 통신 중 오류가 발생했습니다.', '삭제 실패');
            }finally{
                if(btn){ btn.disabled = false; }
            }
        });

        // message modal bindings
        document.getElementById('system-message-close')?.addEventListener('click', ()=> closeModal('system-message-modal'));
        document.getElementById('system-message-ok')?.addEventListener('click', ()=> closeModal('system-message-modal'));
    }

    function buildBulkForm(){
        const form = document.getElementById(BULK_FORM_ID); if(!form) return;
        const EXCLUDE = new Set([]);
        function inputFor(col){
            if(col === 'status'){
                return `<select class="form-input" data-bulk-field="status">
                    <option value="">선택</option>
                    <option value="예정">예정</option>
                    <option value="진행">진행</option>
                    <option value="완료">완료</option>
                    <option value="보류">보류</option>
                </select>`;
            }
            if(col === 'project_type'){
                return `<select class="form-input" data-bulk-field="project_type">
                    <option value="">선택</option>
                    <option value="개발">개발</option>
                    <option value="인프라">인프라</option>
                    <option value="보안">보안</option>
                    <option value="운영">운영</option>
                </select>`;
            }
            if(col === 'priority'){
                return `<select class="form-input" data-bulk-field="priority">
                    <option value="">선택</option>
                    <option value="긴급">긴급</option>
                    <option value="일반">일반</option>
                    <option value="낮음">낮음</option>
                </select>`;
            }
            if(col === 'budget'){
                return `<input type="text" inputmode="numeric" pattern="[0-9,]*" class="form-input" data-bulk-field="budget" placeholder="숫자">`;
            }
            if(col==='task_count' || col==='progress'){
                return `<input type="number" class="form-input locked-field" data-bulk-field="${col}" placeholder="-" disabled>`;
            }
            if(col === 'start_date' || col === 'end_date'){
                return `<input class="form-input" data-bulk-field="${col}" placeholder="YYYY-MM-DD">`;
            }
            if(col === 'participants'){
                return `<input class="form-input locked-field" data-bulk-field="participants" placeholder=",로 구분" disabled>`;
            }
            if(col === 'description'){
                return `<input class="form-input" data-bulk-field="description" placeholder="설명">`;
            }
            return `<input class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }
        const GROUPS = [
            { title:'기본 정보', cols:['project_name','project_type','owner','priority','participants','description'] },
            { title:'진행/일정', cols:['status','start_date','end_date','budget','task_count','progress'] }
        ];
        form.innerHTML = GROUPS.map(g=>{
            const fields = g.cols.filter(c=> !EXCLUDE.has(c));
            if(!fields.length) return '';
            const grid = fields.map(col=>{
                const meta = COLUMN_META[col]; if(!meta) return '';
                return `<div class="form-row"><label>${meta.label}</label>${inputFor(col)}</div>`;
            }).join('');
            return `
                <div class="form-section">
                    <div class="section-header"><h4>${g.title}</h4></div>
                    <div class="form-grid">${grid}</div>
                </div>`;
        }).join('');
        // 날짜 입력 달력 적용
        initDatePickers(BULK_FORM_ID);

        // Attach auto-comma formatting for budget in bulk form
        const bulkForm = document.getElementById(BULK_FORM_ID);
        const bulkBudget = bulkForm?.querySelector('[data-bulk-field="budget"]');
        if(bulkBudget){
            bulkBudget.addEventListener('input', (e)=>{
                const raw = e.target.value.replace(/[^0-9]/g,'');
                e.target.value = raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            });
        }
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
        // 프로젝트 섹션
        renderStatBlock('stats-software', '상태', countBy(rows, 'status'));
    renderStatBlock('stats-software', '유형', countBy(rows, 'project_type'));
        // 참여자 수 분포
        const participantDist = rows.reduce((acc, r)=>{
            const s = String(r.participants||'').trim();
            const cnt = s ? s.split(',').map(x=>x.trim()).filter(Boolean).length : 0;
            const bucket = cnt>=5? '5명 이상' : `${cnt}명`;
            acc[bucket] = (acc[bucket]||0)+1;
            return acc;
        }, {});
        renderStatBlock('stats-versions', '참여자 수', participantDist);
        // 예산 구간 분포
        const budgetDist = rows.reduce((acc, r)=>{
            const n = parseInt(r.budget||'0',10)||0;
            let bucket = '0';
            if(n>=100000000) bucket='1억 이상';
            else if(n>=50000000) bucket='5천만~1억';
            else if(n>=10000000) bucket='1천만~5천만';
            else if(n>0) bucket='1천만 미만';
            acc[bucket] = (acc[bucket]||0)+1;
            return acc;
        }, {});
        renderStatBlock('stats-check', '예산 구간', budgetDist);
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
        await initData();
        // Auto-comma formatting for budget in add/edit forms (event delegation)
        document.addEventListener('input', (e)=>{
            const el = e.target;
            if(!(el instanceof HTMLElement)) return;
            if(el.matches('#'+ADD_FORM_ID+' [name="budget"], #'+EDIT_FORM_ID+' [name="budget"]')){
                const raw = el.value.replace(/[^0-9]/g,'');
                el.value = raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            }
        });
        // Page adornments (animation + popover)
}
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


