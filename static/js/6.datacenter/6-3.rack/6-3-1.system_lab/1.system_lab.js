/**
 * RACK 시스템 관리 페이지 스크립트
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
    // Lab1 overlay target
    const OVERLAY_ID = 'rack-overlay';

    // Dispose (불용처리)
    const DISPOSE_BTN_ID = 'system-dispose-btn';
    const DISPOSE_MODAL_ID = 'system-dispose-modal';
    const DISPOSE_CLOSE_ID = 'system-dispose-close';
    const DISPOSE_CONFIRM_ID = 'system-dispose-confirm';

    // Delete (삭제처리) — removed on this page
    const DELETE_BTN_ID = null;
    const DELETE_MODAL_ID = 'system-delete-modal';
    const DELETE_CLOSE_ID = 'system-delete-close';
    const DELETE_CONFIRM_ID = 'system-delete-confirm';

    // Edit/Save toggle (일괄변경 대체)
    const EDIT_TOGGLE_BTN_ID = 'system-edit-toggle-btn';
    const EDIT_TOGGLE_ICON_ID = 'system-edit-toggle-icon';
    const SAVE_ICON_SRC = '/static/image/svg/free-icon-disk.svg';
    const EDIT_ICON_SRC = '/static/image/svg/list/free-icon-pencil.svg';
    // (legacy bulk modal constants kept but feature hidden on this page)
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
    // Upload template (RACK 시스템 schema)
    const UPLOAD_HEADERS_KO = [
        '업무 상태','업무 이름',
        '시스템 제조사','시스템 모델명','시스템 일련번호',
        '시스템 장소','시스템 위치','시스템 높이',
        '시스템 담당부서','시스템 담당자','서비스 담당부서','서비스 담당자'
    ];
    const HEADER_KO_TO_KEY = {
        '업무 상태':'business_status','업무 이름':'business_name',
        '시스템 제조사':'vendor','시스템 모델명':'model','시스템 일련번호':'serial',
        '시스템 장소':'place','시스템 위치':'location','시스템 높이':'system_height',
        '시스템 담당부서':'system_owner_dept','시스템 담당자':'system_owner',
        '서비스 담당부서':'service_owner_dept','서비스 담당자':'service_owner'
    };
    const ENUM_SETS = { };
    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
    function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }

    // Data + State
    const BASE_VISIBLE_COLUMNS = [
        'business_status','business_name',
        'vendor','model','serial','place','location','system_height'
    ];
    const COLUMN_ORDER = [
        'business_status','business_name',
        'vendor','model','serial','place','location','system_height',
        'system_owner_dept','system_owner','service_owner_dept','service_owner'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '비즈니스', columns: ['business_status','business_name'] },
        { group: '시스템', columns: ['vendor','model','serial','place','location','system_height'] },
        { group: '담당자', columns: ['system_owner_dept','system_owner','service_owner_dept','service_owner'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        business_status:{label:'업무 상태',group:'비즈니스'},
        business_name:{label:'업무 이름',group:'비즈니스'},
        vendor:{label:'시스템 제조사',group:'시스템'},
        model:{label:'시스템 모델명',group:'시스템'},
        serial:{label:'시스템 일련번호',group:'시스템'},
        place:{label:'시스템 장소',group:'시스템'},
        location:{label:'시스템 위치',group:'시스템'},
        system_height:{label:'시스템 높이',group:'시스템'},
        system_owner_dept:{label:'시스템 담당부서',group:'담당자'},
        system_owner:{label:'시스템 담당자',group:'담당자'},
        service_owner_dept:{label:'서비스 담당부서',group:'담당자'},
        service_owner:{label:'서비스 담당자',group:'담당자'}
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
        columnFilters: {}, // { col: value | [values...] } (조건 필터 기능 제거 예정 - 빈 유지)
        editMode: false // 레이아웃 편집 모드 (드래그/리사이즈)
    };

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;

    // RACK 시스템 페이지: 샘플 데이터 5개 제공
    function mockData(count=5){
        const rows = [
            {
                id: 1,
                business_status: '가동', business_name: '통합인증',
                vendor: 'HPE', model: 'ProLiant DL380 Gen10', serial: 'SGH12345',
                place: '판교센터', location: 'R01-12', system_height: '2U',
                system_owner_dept: '인프라팀', system_owner: '홍길동',
                service_owner_dept: '보안팀', service_owner: '김영희'
            },
            {
                id: 2,
                business_status: '유휴', business_name: 'DW',
                vendor: 'Dell', model: 'PowerEdge R740', serial: 'D123-9876',
                place: '상암센터', location: 'R03-05', system_height: '2U',
                system_owner_dept: '플랫폼팀', system_owner: '이철수',
                service_owner_dept: '데이터팀', service_owner: '박민수'
            },
            {
                id: 3,
                business_status: '가동', business_name: 'ERP',
                vendor: 'Cisco', model: 'UCS C240 M5', serial: 'CIS-5566',
                place: '판교센터', location: 'R02-20', system_height: '4U',
                system_owner_dept: '인프라팀', system_owner: '최가을',
                service_owner_dept: '재무팀', service_owner: '오상준'
            },
            {
                id: 4,
                business_status: '대기', business_name: '차세대API',
                vendor: 'Lenovo', model: 'ThinkSystem SR650', serial: 'LN-8899',
                place: '광주센터', location: 'R07-33', system_height: '2U',
                system_owner_dept: '플랫폼팀', system_owner: '윤하늘',
                service_owner_dept: '플랫폼팀', service_owner: '윤하늘'
            },
            {
                id: 5,
                business_status: '가동', business_name: '모바일뱅킹',
                vendor: 'Supermicro', model: 'SYS-2029P', serial: 'SMC-2029P-01',
                place: '상암센터', location: 'R10-01', system_height: '2U',
                system_owner_dept: '인프라팀', system_owner: '한별',
                service_owner_dept: '서비스개발팀', service_owner: '강동원'
            }
        ];
        return rows.slice(0, Math.max(0, count|0));
    }

    function initData(){
        state.data = mockData(5);
        state.nextId = state.data.length + 1;
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
    // Overlay label highlight (search over slab-box labels)
    try{ updateOverlaySearchHighlight(flatTokens); }catch(_e){}
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
                    if(titleEl) titleEl.textContent = 'RACK 시스템이 없습니다.';
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
                    if(col==='lic_desc' && typeof rawVal==='string'){
                        // single-line for table display
                        rawVal = rawVal.replace(/\r?\n|\r/g,' ');
                    }
                    const displayVal = (rawVal==null || String(rawVal).trim()==='') ? '-' : rawVal;
                    let cellValue = highlight(displayVal, col);
                    // 업무 상태 배지 표시 (가동/유휴/대기)
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

    // ===== Lab1 helpers =====
    // Reuse work_status style color picker behavior
    // Render label so that each word (split by whitespace) appears on its own line
    function renderBoxLabel(box, tokens){
        const label = box.querySelector('.label'); if(!label) return;
        const raw = (box.getAttribute('data-label') || label.textContent || '').trim();
        const words = raw ? raw.split(/\s+/) : ['상면'];
        const normTokens = Array.isArray(tokens) ? tokens.filter(Boolean) : [];
        function highlight(word){
            let out = escapeHTML(word);
            normTokens.forEach(tok=>{
                const esc = String(tok).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const re = new RegExp(esc, 'ig');
                out = out.replace(re, m=>`<mark class="search-hit">${m}</mark>`);
            });
            return out;
        }
        const html = words.map(w=>`<span class="w">${highlight(w)}</span>`).join('');
        label.innerHTML = html;
    }
    // Highlight search hits in overlay labels and dim non-matching boxes
    function updateOverlaySearchHighlight(tokens){
        const overlay = document.getElementById(OVERLAY_ID); if(!overlay) return;
        const normTokens = Array.isArray(tokens) ? tokens.filter(Boolean).map(s=> String(s).toLowerCase()) : [];
        const boxes = overlay.querySelectorAll('.slab-box');
        boxes.forEach(b=>{
            const raw = String(b.getAttribute('data-label') || (b.querySelector('.label')?.textContent||'')).trim();
            const rawLower = raw.toLowerCase();
            const matched = normTokens.length ? normTokens.every(tokGroup=> rawLower.includes(tokGroup)) || normTokens.some(tok=> rawLower.includes(tok)) : true;
            // render with highlights
            renderBoxLabel(b, normTokens);
            b.classList.toggle('is-dimmed', !matched && normTokens.length>0);
        });
    }
    function attachStatusColorPickerForLab(formId){
        const form = document.getElementById(formId); if(!form) return;
        if(form.dataset.colorPickerAttached==='1') return;
        const wrap = form.querySelector('.status-input-wrap'); if(!wrap){ form.dataset.colorPickerAttached='1'; return; }
        const btn = wrap.querySelector('.status-color-btn');
        const palette = wrap.querySelector('.status-color-palette');
        const hidden = wrap.querySelector('input[name="slab_color"]');
        function setColor(cls){
            if(!hidden) return;
            hidden.value = cls || '';
            const all = Array.from({length:10},(_,i)=>`ws-c${i+1}`);
            btn.classList.remove(...all);
            if(cls) btn.classList.add(cls);
        }
        btn?.addEventListener('click', ()=>{ if(palette) palette.hidden = !palette.hidden; });
        palette?.addEventListener('click', (e)=>{
            const sw = e.target.closest('.status-color-swatch'); if(!sw) return;
            const cls = sw.getAttribute('data-color');
            setColor(cls);
            palette.hidden = true;
        });
        document.addEventListener('click', (e)=>{ if(!palette || palette.hidden) return; if(wrap.contains(e.target)) return; palette.hidden = true; });
        form._setStatusColorUI = setColor;
        form.dataset.colorPickerAttached='1';
    }
    function mapWsClassToHex(cls){
        const map = {
            'ws-c1':'#ef4444','ws-c2':'#f97316','ws-c3':'#f59e0b','ws-c4':'#84cc16','ws-c5':'#10b981',
            'ws-c6':'#06b6d4','ws-c7':'#3b82f6','ws-c8':'#a855f7','ws-c9':'#ec4899','ws-c10':'#6b7280'
        };
        return map[cls] || '#60a5fa';
    }

    // Rack search selector (hw_server_onpremise style)
    const RACK_SEARCH_PLACEHOLDER = '선택';
    function attachRackSearch(formId){
        const form = document.getElementById(formId); if(!form) return;
        if(form.dataset.rackSearchAttached==='1') return;
        const wrap = form.querySelector('.rack-search-wrap');
        const nativeInput = form.querySelector('#rack-search-native');
        const hidden = form.querySelector('#selected-rack-hidden');
        if(!wrap || !nativeInput || !hidden){ form.dataset.rackSearchAttached='1'; return; }

        // Build FK-style control dynamically (matches rack_list UI)
        const control = document.createElement('div');
        control.className = 'fk-searchable-control rack-search-control';
        const displayBtn = document.createElement('button');
        displayBtn.type = 'button';
        displayBtn.id = 'rack-search-display';
        displayBtn.className = 'fk-searchable-display';
        displayBtn.setAttribute('aria-haspopup', 'dialog');
        displayBtn.setAttribute('aria-expanded', 'false');
        const displayText = document.createElement('span');
        displayText.className = 'rack-search-display-text';
        displayText.textContent = RACK_SEARCH_PLACEHOLDER;
        displayBtn.appendChild(displayText);
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.id = 'rack-search-clear';
        clearBtn.className = 'fk-searchable-clear';
        clearBtn.textContent = '지우기';
        clearBtn.setAttribute('aria-label', '선택 초기화');
        clearBtn.hidden = true;
        nativeInput.classList.add('fk-search-native-hidden');
        nativeInput.setAttribute('aria-hidden', 'true');
        nativeInput.readOnly = true;
        control.appendChild(displayBtn);
        control.appendChild(clearBtn);
        control.appendChild(nativeInput);
        wrap.insertBefore(control, hidden);

        const panel = document.createElement('div');
        panel.id = 'rack-search-panel';
        panel.className = 'fk-search-panel rack-search-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'false');
        panel.setAttribute('aria-label', 'RACK 검색 패널');
        panel.hidden = true;
        const header = document.createElement('div');
        header.className = 'fk-search-panel__header';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.id = 'rack-search-input';
        searchInput.className = 'fk-search-panel__input';
        searchInput.placeholder = '검색어 입력';
        searchInput.autocomplete = 'off';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.id = 'rack-search-close';
        closeBtn.className = 'fk-search-panel__close';
        closeBtn.textContent = '닫기';
        header.appendChild(searchInput);
        header.appendChild(closeBtn);
        panel.appendChild(header);
        const loadingEl = document.createElement('div');
        loadingEl.id = 'rack-search-loading';
        loadingEl.className = 'search-select-loading';
        loadingEl.textContent = '검색 중';
        loadingEl.hidden = true;
        panel.appendChild(loadingEl);
        const listEl = document.createElement('div');
        listEl.id = 'rack-search-list';
        listEl.className = 'fk-search-panel__list';
        listEl.setAttribute('role', 'listbox');
        panel.appendChild(listEl);
        const emptyEl = document.createElement('div');
        emptyEl.id = 'rack-search-empty';
        emptyEl.className = 'fk-search-panel__empty';
        emptyEl.hidden = true;
        panel.appendChild(emptyEl);
        document.body.appendChild(panel);

        const rackCenterLabel = (form.getAttribute('data-rack-center-code') || LAB_CENTER_FILTER_CODE || '').trim();
        const rackCenterCodeHint = (form.getAttribute('data-center-code') || LAB_CENTER_CODE || '').trim();
        let selectedValue = (hidden.value || '').trim();
        let panelOpen = false;
        let fetchTimer = null;
        let abortController = null;
        let lastQuery = '';
        const centerLabelFallback = rackCenterLabel || LAB_CENTER_FILTER_CODE || '';
        const centerCodeHints = [];
        [rackCenterCodeHint, LAB_CENTER_CODE].forEach(code => {
            const trimmed = (code || '').trim();
            if(trimmed && !centerCodeHints.includes(trimmed)){
                centerCodeHints.push(trimmed);
            }
        });
        let rackCenterContext = {
            codes: [],
            metaByCode: new Map(),
            labelFallback: centerLabelFallback,
        };
        let centerContextPromise = null;
        const centerQueryCache = new Map();

        function syncHidden(){
            hidden.value = selectedValue;
            nativeInput.dataset.value = selectedValue;
            nativeInput.value = selectedValue;
        }
        function updateDisplay(){
            const target = displayBtn.querySelector('.rack-search-display-text') || displayBtn;
            if(!selectedValue){
                target.textContent = RACK_SEARCH_PLACEHOLDER;
                displayBtn.classList.remove('has-value');
                displayBtn.title = RACK_SEARCH_PLACEHOLDER;
                nativeInput.value = '';
                if(clearBtn) clearBtn.hidden = true;
                return;
            }
            target.textContent = selectedValue;
            displayBtn.title = selectedValue;
            displayBtn.classList.add('has-value');
            nativeInput.value = selectedValue;
            if(clearBtn) clearBtn.hidden = false;
        }
        function syncListSelectionState(){
            const items = listEl?.querySelectorAll('.fk-search-panel__item');
            if(!items) return;
            items.forEach(item=>{
                const value = item.dataset.value;
                const active = value === selectedValue;
                item.classList.toggle('is-selected', !!active);
                item.setAttribute('aria-selected', active ? 'true' : 'false');
            });
        }
        function syncAll(){ syncHidden(); updateDisplay(); syncListSelectionState(); }
        function closePanel(){
            if(!panelOpen) return;
            panelOpen = false;
            panel.hidden = true;
            displayBtn.setAttribute('aria-expanded','false');
            document.removeEventListener('click', handleOutside, true);
            document.removeEventListener('keydown', handleKeyDown, true);
            if(abortController){ abortController.abort(); abortController = null; }
        }
        function positionPanel(){
            const rect = displayBtn.getBoundingClientRect();
            const panelHeight = panel.offsetHeight || 320;
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            let top = rect.bottom + 8;
            let left = rect.left;
            if(top + panelHeight > viewportHeight - 16){
                top = Math.max(12, rect.top - panelHeight - 8);
            }
            if(left + panel.offsetWidth > viewportWidth - 12){
                left = Math.max(12, viewportWidth - (panel.offsetWidth || 320) - 12);
            }
            panel.style.top = `${Math.max(12, top)}px`;
            panel.style.left = `${Math.max(12, left)}px`;
        }
        function openPanel(opts){
            if(panelOpen) return;
            panelOpen = true;
            panel.hidden = false;
            displayBtn.setAttribute('aria-expanded','true');
            positionPanel();
            document.addEventListener('click', handleOutside, true);
            document.addEventListener('keydown', handleKeyDown, true);
            searchInput.value = '';
            searchInput.focus();
            const shouldForce = opts?.forceRefresh !== false;
            scheduleFetch('', shouldForce);
        }
        function handleOutside(event){
            if(panel.contains(event.target) || control.contains(event.target)) return;
            closePanel();
        }
        function handleKeyDown(event){
            if(event.key === 'Escape'){ event.preventDefault(); closePanel(); displayBtn.focus(); }
        }
        function setLoading(state){
            if(loadingEl){ loadingEl.hidden = !state; }
            listEl.setAttribute('aria-busy', state ? 'true' : 'false');
        }
        function getCenterLabelByCode(centerCode){
            if(centerCode && rackCenterContext.metaByCode instanceof Map && rackCenterContext.metaByCode.has(centerCode)){
                const entry = rackCenterContext.metaByCode.get(centerCode);
                const label = (entry?.center_name || '').trim();
                if(label) return label;
            }
            if(centerCode && !rackCenterContext.labelFallback){
                return centerCode;
            }
            return rackCenterContext.labelFallback || centerCode || '';
        }
        function getDistinctValues(list){
            const seen = new Set();
            return list.map(val => (val || '').trim()).filter(val => {
                if(!val || seen.has(val)) return false;
                seen.add(val);
                return true;
            });
        }
        function queryCenters(term){
            const key = (term && term.trim()) || '__all__';
            if(centerQueryCache.has(key)){
                return centerQueryCache.get(key);
            }
            const job = (async ()=>{
                try{
                    const url = new URL(ORG_CENTER_API_ENDPOINT, window.location.origin);
                    if(term && term.trim()){ url.searchParams.set('q', term.trim()); }
                    const resp = await fetch(url.toString(), { headers:{ 'Accept':'application/json' } });
                    if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    const payload = await resp.json();
                    return Array.isArray(payload?.items) ? payload.items : [];
                } catch(err){
                    console.error('Failed to fetch org centers', err);
                    return [];
                }
            })();
            centerQueryCache.set(key, job);
            return job;
        }
        async function resolveRackCenterContext(forceReload){
            const existingCodes = Array.isArray(rackCenterContext.codes) ? rackCenterContext.codes : [];
            if(!forceReload && existingCodes.length){
                return rackCenterContext;
            }
            if(!forceReload && centerContextPromise){
                return centerContextPromise;
            }
            centerContextPromise = (async ()=>{
                const codes = new Set();
                const metaByCode = new Map(rackCenterContext.metaByCode || []);
                const namesToQuery = getDistinctValues([rackCenterLabel, centerLabelFallback]);
                for(const name of namesToQuery){
                    if(!name) continue;
                    const rows = await queryCenters(name);
                    rows.forEach(row => {
                        const code = (row?.center_code || '').trim();
                        if(!code) return;
                        metaByCode.set(code, row);
                    });
                    const exactMatches = rows.filter(row => (row?.center_name || '').trim() === name);
                    const subset = exactMatches.length ? exactMatches : rows.filter(row => (row?.center_name || '').includes(name));
                    subset.forEach(row => {
                        const code = (row?.center_code || '').trim();
                        if(code) codes.add(code);
                    });
                }
                if(!codes.size && centerCodeHints.length){
                    centerCodeHints.forEach(code => { if(code) codes.add(code); });
                }
                const context = {
                    codes: [...codes].filter(Boolean),
                    metaByCode,
                    labelFallback: centerLabelFallback,
                };
                rackCenterContext = context;
                return context;
            })().catch(err => {
                console.error('Failed to resolve rack center context', err);
                const context = {
                    codes: [...centerCodeHints],
                    metaByCode: new Map(),
                    labelFallback: centerLabelFallback,
                };
                rackCenterContext = context;
                return context;
            }).finally(()=>{ centerContextPromise = null; });
            return centerContextPromise;
        }
        function showEmpty(message){
            if(!emptyEl) return;
            emptyEl.hidden = false;
            emptyEl.innerHTML = message || '<strong>검색 결과가 없습니다.</strong><span>다른 키워드를 입력해 주세요.</span>';
        }
        function renderList(rows, query){
            listEl.innerHTML = '';
            const limit = 30;
            const normalized = Array.isArray(rows) ? rows.slice(0, limit) : [];
            const excludeBoxId = form?.dataset?.targetBoxId || form?.querySelector('#edit-target-box-id')?.value || '';
            const usedRacks = collectAssignedRackPositions({ excludeBoxId: excludeBoxId || null });
            const qNorm = (query || '').trim().toLowerCase();
            const defaultBtn = document.createElement('button');
            defaultBtn.type='button';
            defaultBtn.className='fk-search-panel__item rack-search-default-option';
            defaultBtn.dataset.value = '';
            defaultBtn.setAttribute('role','option');
            const isDefault = !selectedValue;
            if(isDefault){ defaultBtn.classList.add('is-selected'); }
            defaultBtn.setAttribute('aria-selected', isDefault ? 'true' : 'false');
            defaultBtn.innerHTML = `
                <span class="rack-search-option-label">선택</span>
                <span class="rack-search-option-meta">선택을 해제합니다.</span>
            `;
            listEl.appendChild(defaultBtn);
            if(!normalized.length){
                showEmpty();
                return;
            }
            emptyEl.hidden = true;
            normalized.forEach(row => {
                const value = (row?.rack_position || '').trim();
                if(!value) return;
                if(qNorm && !value.toLowerCase().includes(qNorm)) return;
                if(usedRacks.has(value) && value !== selectedValue){
                    return; // prevent double-assignment while still showing the value if it is already selected
                }
                const btn = document.createElement('button');
                btn.type='button';
                btn.className='fk-search-panel__item';
                btn.dataset.value = value;
                btn.setAttribute('role','option');
                const isSelected = value === selectedValue;
                if(isSelected){ btn.classList.add('is-selected'); }
                btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                btn.innerHTML = `
                    <span class="rack-search-option-label">${escapeHTML(value)}</span>
                `;
                listEl.appendChild(btn);
            });
            if(!listEl.children.length){
                showEmpty();
            }
        }
        async function fetchRackOptions(query){
            if(abortController){ abortController.abort(); }
            const controller = new AbortController();
            abortController = controller;
            setLoading(true);
            emptyEl.hidden = true;
            listEl.innerHTML = '';
            let codesToTry = [];
            try{
                const context = await resolveRackCenterContext();
                if(context && Array.isArray(context.codes) && context.codes.length){
                    codesToTry = [...context.codes];
                }
            } catch(err){
                console.error('Failed to resolve rack center context before loading racks', err);
            }
            if(!codesToTry.length){
                codesToTry = [''];
            }
            for(let idx=0; idx<codesToTry.length; idx+=1){
                const code = codesToTry[idx];
                try{
                    const url = new URL(ORG_RACK_API_ENDPOINT, window.location.origin);
                    if(code) url.searchParams.set('center_code', code);
                    if(query) url.searchParams.set('q', query);
                    const resp = await fetch(url.toString(), { signal: controller.signal, headers:{ 'Accept':'application/json' } });
                    if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    const payload = await resp.json();
                    const rows = Array.isArray(payload?.items) ? payload.items : [];
                    if(rows.length || idx === codesToTry.length - 1){
                        renderList(rows, query);
                        break;
                    }
                } catch(err){
                    if(err.name === 'AbortError') return;
                    console.error('Failed to load rack list', err);
                    if(idx === codesToTry.length - 1){
                        showEmpty(`<strong>목록을 불러오지 못했습니다.</strong><span>${escapeHTML(err?.message || '잠시 후 다시 시도해 주세요.')}</span>`);
                    }
                }
            }
            setLoading(false);
            if(abortController === controller){ abortController = null; }
        }
        function scheduleFetch(value, force){
            const normalized = value.trim();
            if(fetchTimer) clearTimeout(fetchTimer);
            if(!force && normalized === lastQuery){ return; }
            lastQuery = normalized;
            fetchTimer = setTimeout(()=> fetchRackOptions(normalized), 180);
        }

        displayBtn.addEventListener('click', openPanel);
        clearBtn?.addEventListener('click', (event)=>{ event.preventDefault(); selectedValue=''; syncAll(); });
        listEl.addEventListener('click', (event)=>{
            const item = event.target.closest('.fk-search-panel__item'); if(!item) return;
            const value = (item.dataset.value || '').trim();
            selectedValue = value;
            syncAll();
            closePanel();
        });
        searchInput.addEventListener('input', ()=> scheduleFetch(searchInput.value));
        searchInput.addEventListener('keydown', (event)=>{
            if(event.key === 'Enter'){ event.preventDefault(); }
            if(event.key === 'Escape'){ event.preventDefault(); closePanel(); displayBtn.focus(); }
        });
        form.addEventListener('submit', ()=> closePanel());
        closeBtn?.addEventListener('click', ()=>{ closePanel(); displayBtn.focus(); });
        window.addEventListener('resize', ()=>{ if(panelOpen){ positionPanel(); } });
        window.addEventListener('scroll', ()=>{ if(panelOpen){ positionPanel(); } }, true);
        const addClose = document.getElementById(ADD_CLOSE_ID);
        addClose?.addEventListener('click', ()=>{ selectedValue=''; syncAll(); closePanel(); });

        form._rackSearch = {
            setSelected(values){
                const value = Array.isArray(values) ? values[0] : values;
                selectedValue = (value || '').trim();
                syncAll();
            },
            getSelected(){ return selectedValue ? [selectedValue] : []; },
            clear(){ selectedValue=''; syncAll(); },
            open(opts){ openPanel({ forceRefresh: opts?.force !== false }); },
            close(){ closePanel(); }
        };
        syncAll();
        form.dataset.rackSearchAttached='1';
    }

    function makeDraggableResizable(el){
        let isDragging=false, startX=0, startY=0, startLeft=0, startTop=0;
        let isResizing=false, startW=0, startH=0;
        function onMouseDown(e){
            // 편집모드가 아닐 경우 무시
            if(!state.editMode) return;
            // 클릭 시 활성 박스로 지정 (키보드 이동용)
            try {
                setActiveBox(el);
            } catch(_e) {}
            const rect = el.getBoundingClientRect();
            const withinHandle = (e.clientX > rect.right-16 && e.clientY > rect.bottom-16);
            if(withinHandle){
                isResizing = true; startW = rect.width; startH = rect.height; startX = e.clientX; startY = e.clientY;
                e.preventDefault();
                return;
            }
            isDragging = true; startX = e.clientX; startY = e.clientY;
            const cs = window.getComputedStyle(el);
            startLeft = parseFloat(cs.left)||0; startTop = parseFloat(cs.top)||0;
            e.preventDefault();
        }
        function onMouseMove(e){
            if(isDragging){
                const dx = e.clientX - startX; const dy = e.clientY - startY;
                el.style.left = (startLeft + dx) + 'px';
                el.style.top = (startTop + dy) + 'px';
            } else if(isResizing){
                const dx = e.clientX - startX; const dy = e.clientY - startY;
                const w = Math.max(40, startW + dx);
                const h = Math.max(24, startH + dy);
                el.style.width = w + 'px';
                el.style.height = h + 'px';
                el.dataset.w = String(w);
                el.dataset.h = String(h);
                el.style.setProperty('--w', w + 'px');
                el.style.setProperty('--h', h + 'px');
            }
        }
        function onMouseUp(){ isDragging=false; isResizing=false; }
        el.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        // Touch support (basic)
        el.addEventListener('touchstart', (e)=>{ const t=e.touches[0]; if(!state.editMode) return; onMouseDown({ clientX:t.clientX, clientY:t.clientY, preventDefault:()=>e.preventDefault() }); }, {passive:false});
        window.addEventListener('touchmove', (e)=>{ const t=e.touches[0]; onMouseMove({ clientX:t.clientX, clientY:t.clientY }); }, {passive:false});
        window.addEventListener('touchend', onMouseUp, {passive:true});
    }

    // ----- Rack overlay persistence -----
    // Use a rack-specific storage key to avoid collisions with thermometer pages
    /* ── config from data-* (universal) ── */
    const _labCfg = document.getElementById('rack-lab-config')?.dataset || {};
    const OVERLAY_STORE_KEY  = _labCfg.overlayStoreKey  || 'rack_lab1_overlay_boxes';
    const SURFACE_API_BASE   = _labCfg.surfaceApiBase   || '';
    const ORG_RACK_API_ENDPOINT   = '/api/org-racks';
    const ORG_CENTER_API_ENDPOINT = '/api/org-centers';
    const overlayRoot = document.getElementById(OVERLAY_ID);
    const LAB_CENTER_CODE        = overlayRoot?.dataset.centerCode      || '';
    const LAB_CENTER_FILTER_CODE = overlayRoot?.dataset.rackFilterCode  || '';
    let overlaySaveInFlight = null;
    function updateEditToggleVisual(){
        const icon = document.getElementById(EDIT_TOGGLE_ICON_ID);
        const btn = document.getElementById(EDIT_TOGGLE_BTN_ID);
        const overlay = document.getElementById(OVERLAY_ID);
        if(icon){ icon.src = state.editMode ? SAVE_ICON_SRC : EDIT_ICON_SRC; icon.alt = state.editMode ? '저장' : '수정'; }
        if(btn){ const t = state.editMode ? '저장' : '수정'; btn.title = t; btn.setAttribute('aria-label', t); }
        if(overlay){ overlay.classList.toggle('is-editing', !!state.editMode); }
    }
    function setEditMode(on){
        state.editMode = !!on;
        updateEditToggleVisual();
        const overlay = document.getElementById(OVERLAY_ID);
        if(overlay){
            const boxes = overlay.querySelectorAll('.slab-box');
            if(state.editMode){
                boxes.forEach(b=>{ try{ b.setAttribute('tabindex','0'); }catch(_e){} });
            } else {
                boxes.forEach(b=>{ b.removeAttribute('tabindex'); b.classList.remove('is-active'); });
            }
        }
    }
    function ensureBoxPercents(box){
        const overlay = document.getElementById(OVERLAY_ID); if(!overlay) return;
        const ow = overlay.clientWidth || overlay.offsetWidth || 1;
        const oh = overlay.clientHeight || overlay.offsetHeight || 1;
        const left = parseFloat(box.style.left)||box.offsetLeft||0;
        const top = parseFloat(box.style.top)||box.offsetTop||0;
        const width = parseFloat(box.style.width)||box.offsetWidth||0;
        const height = parseFloat(box.style.height)||box.offsetHeight||0;
        box.dataset.leftPct = (left / ow).toFixed(6);
        box.dataset.topPct = (top / oh).toFixed(6);
        box.dataset.widthPct = (width / ow).toFixed(6);
        box.dataset.heightPct = (height / oh).toFixed(6);
    }
    function applyBoxPercents(box){
        const overlay = document.getElementById(OVERLAY_ID); if(!overlay) return;
        const ow = overlay.clientWidth || overlay.offsetWidth || 1;
        const oh = overlay.clientHeight || overlay.offsetHeight || 1;
        const lp = parseFloat(box.dataset.leftPct||'0');
        const tp = parseFloat(box.dataset.topPct||'0');
        const wp = parseFloat(box.dataset.widthPct||'0');
        const hp = parseFloat(box.dataset.heightPct||'0');
        const left = Math.round(lp * ow);
        const top = Math.round(tp * oh);
        const width = Math.max(40, Math.round(wp * ow));
        const height = Math.max(24, Math.round(hp * oh));
        box.style.left = left + 'px';
        box.style.top = top + 'px';
        box.style.width = width + 'px';
        box.style.height = height + 'px';
        box.dataset.w = String(width);
        box.dataset.h = String(height);
        box.style.setProperty('--w', width + 'px');
        box.style.setProperty('--h', height + 'px');
    }
    function reflowAllBoxPercents(){
        const overlay = document.getElementById(OVERLAY_ID); if(!overlay) return;
        overlay.querySelectorAll('.slab-box').forEach(box=> applyBoxPercents(box));
    }
    function scheduleOverlayReflow(){
        if(typeof requestAnimationFrame === 'function'){
            requestAnimationFrame(()=>{ requestAnimationFrame(reflowAllBoxPercents); });
        } else {
            setTimeout(reflowAllBoxPercents, 0);
        }
    }
    // ----- Keyboard movement helpers (edit mode) -----
    function getActiveBox(){
        const overlay = document.getElementById(OVERLAY_ID); if(!overlay) return null;
        return overlay.querySelector('.slab-box.is-active');
    }
    function clearActiveBox(){
        const overlay = document.getElementById(OVERLAY_ID); if(!overlay) return;
        overlay.querySelectorAll('.slab-box.is-active').forEach(b=> b.classList.remove('is-active'));
    }
    function setActiveBox(box){
        if(!box) return;
        const overlay = document.getElementById(OVERLAY_ID); if(!overlay) return;
        overlay.querySelectorAll('.slab-box.is-active').forEach(b=>{ if(b!==box) b.classList.remove('is-active'); });
        box.classList.add('is-active');
        // Make focusable in edit mode for accessibility
        try{ box.setAttribute('tabindex','0'); box.focus({preventScroll:true}); }catch(_e){}
    }
    let keyPersistTimer = null;
    function schedulePersistAfterKey(){
        if(keyPersistTimer) clearTimeout(keyPersistTimer);
        keyPersistTimer = setTimeout(()=>{
            persistOverlay().catch(err=> console.warn('Overlay auto-save via keyboard failed', err));
        }, 200);
    }
    function moveActiveBoxBy(dx, dy){
        const overlay = document.getElementById(OVERLAY_ID); if(!overlay) return;
        const box = getActiveBox(); if(!box) return;
        // current position/size
        const cs = window.getComputedStyle(box);
        let left = parseFloat(cs.left)||0;
        let top = parseFloat(cs.top)||0;
        const w = parseFloat(cs.width)||box.offsetWidth||0;
        const h = parseFloat(cs.height)||box.offsetHeight||0;
        const maxLeft = Math.max(0, (overlay.clientWidth||overlay.offsetWidth||0) - w);
        const maxTop = Math.max(0, (overlay.clientHeight||overlay.offsetHeight||0) - h);
        left = Math.min(maxLeft, Math.max(0, left + dx));
        top = Math.min(maxTop, Math.max(0, top + dy));
        box.style.left = Math.round(left) + 'px';
        box.style.top = Math.round(top) + 'px';
        ensureBoxPercents(box);
        schedulePersistAfterKey();
    }
    function getOverlayData(){
        const overlay = document.getElementById(OVERLAY_ID); if(!overlay) return [];
        const boxes = [...overlay.querySelectorAll('.slab-box')];
        return boxes.map(b=>{
            ensureBoxPercents(b);
            const surfaceId = parseInt(b.dataset.surfaceId||'', 10);
            return {
                id: b.id || '',
                surfaceId: Number.isFinite(surfaceId) ? surfaceId : null,
                leftPct: parseFloat(b.dataset.leftPct||'0') || 0,
                topPct: parseFloat(b.dataset.topPct||'0') || 0,
                widthPct: parseFloat(b.dataset.widthPct||'0') || 0,
                heightPct: parseFloat(b.dataset.heightPct||'0') || 0,
                color: b.style.background || b.style.backgroundColor || '',
                text: b.getAttribute('data-label') || b.querySelector('.label')?.textContent || '',
                racks: getBoxRacks(b),
                remark: getBoxRemark(b) || ''
            };
        });
    }
    function cacheOverlaySnapshot(snapshot){
        try { localStorage.setItem(OVERLAY_STORE_KEY, JSON.stringify(snapshot)); } catch(_e){}
    }
    function persistOverlay(options){
        const snapshot = getOverlayData();
        cacheOverlaySnapshot(snapshot);
        if(options && options.skipRemote === true){
            return Promise.resolve({ skipped: true });
        }
        const payload = snapshot
            .filter(item=> Number.isFinite(item.surfaceId))
            .map(item=>({
                id: item.surfaceId,
                left_pct: item.leftPct,
                top_pct: item.topPct,
                width_pct: item.widthPct,
                height_pct: item.heightPct,
            }));
        if(!payload.length){
            return Promise.resolve({ skipped: true });
        }
        const requestBody = JSON.stringify({ items: payload });
        if (!SURFACE_API_BASE) { overlaySaveInFlight = null; return; }
        const req = fetch(`${SURFACE_API_BASE}/bulk-geometry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody,
        }).then(async resp=>{
            let data = null;
            try{ data = await resp.json(); }catch(_e){ data = null; }
            if(!resp.ok || (data && data.success === false)){
                const message = data?.message || `상면 좌표 저장 중 오류가 발생했습니다. (HTTP ${resp.status})`;
                throw new Error(message);
            }
            return data;
        });
        overlaySaveInFlight = req;
        return req.finally(()=>{
            if(overlaySaveInFlight === req){ overlaySaveInFlight = null; }
        });
    }
    function loadOverlayFromLocalStorage(){
        const overlay = document.getElementById(OVERLAY_ID); if(!overlay) return;
        let arr = [];
        try { arr = JSON.parse(localStorage.getItem(OVERLAY_STORE_KEY)||'[]') || []; } catch(_e){ arr = []; }
        overlay.innerHTML = '';
        arr.forEach(item=>{
            const box = document.createElement('div');
            box.className = 'slab-box';
            if(item.id) box.id = item.id;
            if(item.color) box.style.background = item.color;
            // Prefer percent-based data; support migration from px-based
            if(typeof item.leftPct === 'number' && typeof item.topPct === 'number'){
                box.dataset.leftPct = String(item.leftPct);
                box.dataset.topPct = String(item.topPct);
                box.dataset.widthPct = String(item.widthPct ?? 0);
                box.dataset.heightPct = String(item.heightPct ?? 0);
                applyBoxPercents(box);
            } else if(typeof item.left === 'number'){
                // Legacy px fields -> apply and compute percents
                box.style.left = (item.left||0) + 'px';
                box.style.top = (item.top||0) + 'px';
                if(item.width){ box.style.width = item.width + 'px'; box.dataset.w = String(parseInt(item.width,10)||0); box.style.setProperty('--w', box.style.width); }
                if(item.height){ box.style.height = item.height + 'px'; box.dataset.h = String(parseInt(item.height,10)||0); box.style.setProperty('--h', box.style.height); }
                ensureBoxPercents(box);
                applyBoxPercents(box);
            }
            // Racks
            if(item.racks && Array.isArray(item.racks)) setBoxRacks(box, item.racks);
            if(typeof item.remark === 'string'){ setBoxRemark(box, item.remark); }
            if(Number.isFinite(item.surfaceId)){
                box.dataset.surfaceId = String(item.surfaceId);
            }
            // Label
            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = item.text || '상면';
            // preserve a raw value for word-per-line rendering and search
            box.setAttribute('data-label', item.text || '상면');
            box.appendChild(label);
            overlay.appendChild(box);
            makeDraggableResizable(box);
        });
        scheduleOverlayReflow();
        // Re-apply current search highlight if any
        try{
            const qRaw = state.search||'';
            const tokens = qRaw.trim() ? qRaw.trim().split('%').flatMap(g=> g.split(',')).map(s=>s.trim()).filter(Boolean).map(s=>s.toLowerCase()) : [];
            updateOverlaySearchHighlight(tokens);
        }catch(_e){}
    }
    async function loadOverlayFromServer(){
        const overlay = document.getElementById(OVERLAY_ID); if(!overlay) return;
        overlay.innerHTML = '';
        try{
            if (!SURFACE_API_BASE) return [];
            const url = new URL(SURFACE_API_BASE, window.location.origin);
            url.searchParams.set('center_code', LAB_CENTER_CODE);
            const resp = await fetch(url.toString(), { headers: { 'Accept': 'application/json' } });
            if(!resp.ok){ throw new Error('HTTP '+resp.status); }
            const payload = await resp.json();
            if(!payload || payload.success !== true){ throw new Error(payload?.message || 'load_failed'); }
            const records = Array.isArray(payload.items) ? payload.items : [];
            records.forEach(renderSurfaceBoxFromRecord);
            await persistOverlay({ skipRemote: true });
            scheduleOverlayReflow();
            try{
                const qRaw = state.search||'';
                const tokens = qRaw.trim() ? qRaw.trim().split('%').flatMap(g=> g.split(',')).map(s=>s.trim()).filter(Boolean).map(s=>s.toLowerCase()) : [];
                updateOverlaySearchHighlight(tokens);
            }catch(_e){}
        } catch(err){
            console.error('Failed to load surfaces from server, falling back to local cache.', err);
            loadOverlayFromLocalStorage();
        }
    }
    function renderSurfaceBoxFromRecord(record){
        const overlay = document.getElementById(OVERLAY_ID); if(!overlay) return;
        const box = document.createElement('div');
        box.className = 'slab-box';
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = record?.surface_name || '상면';
        label.style.color = '#fff';
        box.appendChild(label);
        overlay.appendChild(box);
        if(record?.box_identifier){
            box.id = record.box_identifier;
        } else if(Number.isFinite(record?.id)){
            box.id = 'slab_'+record.id;
        } else {
            assignBoxId(box);
        }
        applyRecordToBox(box, record || {});
        makeDraggableResizable(box);
    }
    function loadOverlayFromStorage(){
        // Primary source is the API; fallback handled inside
        return loadOverlayFromServer();
    }
    function enableOverlayAutoSave(){
        const overlay = document.getElementById(OVERLAY_ID); if(!overlay) return;
        // Save on mouseup/touchend after potential drag/resize
        const save = ()=>{ if(state.editMode){
            // update percents before persist
            overlay.querySelectorAll('.slab-box').forEach(b=> ensureBoxPercents(b));
            persistOverlay().catch(err=> console.warn('Overlay auto-save failed', err));
        }};
        overlay.addEventListener('mouseup', save);
        overlay.addEventListener('touchend', save, {passive:true});
    }
    function observeOverlayResize(){
        const overlay = document.getElementById(OVERLAY_ID); if(!overlay || !('ResizeObserver' in window)) return;
        const ro = new ResizeObserver(()=>{
            // Re-apply percent geometry to pixels
            overlay.querySelectorAll('.slab-box').forEach(b=> applyBoxPercents(b));
        });
        ro.observe(overlay);
    }

    // ----- racks per box helpers -----
    function getBoxRacks(box){
        try { const raw = box.getAttribute('data-racks'); if(!raw) return []; const arr = JSON.parse(raw); return Array.isArray(arr)? arr : []; } catch(_e){ return []; }
    }
    function setBoxRacks(box, arr){
        try { box.setAttribute('data-racks', JSON.stringify(Array.isArray(arr)? arr : [])); } catch(_e){}
    }
    function collectAssignedRackPositions(opts){
        const overlay = document.getElementById(OVERLAY_ID); if(!overlay) return new Set();
        const excludeId = opts?.excludeBoxId ? String(opts.excludeBoxId) : '';
        const assigned = new Set();
        overlay.querySelectorAll('.slab-box').forEach(box=>{
            if(excludeId && box.id === excludeId) return;
            getBoxRacks(box).forEach(rack=>{
                const value = (rack || '').trim();
                if(value){ assigned.add(value); }
            });
        });
        return assigned;
    }
    function getBoxRemark(box){
        return box.getAttribute('data-remark') || '';
    }
    function setBoxRemark(box, value){
        if(!box) return; box.setAttribute('data-remark', String(value||''));
    }

    function clamp01(value){
        const num = Number(value);
        if(!Number.isFinite(num)) return 0;
        return Math.max(0, Math.min(1, num));
    }
    function pickNumber(){
        for(let i=0;i<arguments.length;i+=1){
            const raw = arguments[i];
            if(raw === null || raw === undefined) continue;
            const num = Number(raw);
            if(Number.isFinite(num)) return num;
        }
        return null;
    }
    function buildRackArray(record){
        if(Array.isArray(record)) return record;
        if(!record) return [];
        return [record];
    }

    async function sendSurfaceRequest(method, url, payload){
        const options = { method, headers:{ 'Accept':'application/json' } };
        if(payload && method !== 'GET'){
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(payload);
        }
        const resp = await fetch(url, options);
        let data = null;
        try { data = await resp.json(); } catch(_e) { data = null; }
        if(!resp.ok || (data && data.success === false)){
            const msg = data?.message || '상면 정보를 저장하지 못했습니다.';
            throw new Error(msg);
        }
        return data;
    }
    function buildSurfacePayload({ box, name, centerCode, color, racks, remark }){
        ensureBoxPercents(box);
        return {
            surface_name: name || '상면',
            center_code: centerCode || LAB_CENTER_CODE,
            rack_position: Array.isArray(racks) && racks.length ? racks[0] : '',
            color_hex: color || '#60a5fa',
            remark: remark || '',
            box_identifier: box.id || null,
            left_pct: clamp01(parseFloat(box.dataset.leftPct||'0')||0),
            top_pct: clamp01(parseFloat(box.dataset.topPct||'0')||0),
            width_pct: clamp01(parseFloat(box.dataset.widthPct||'0')||0),
            height_pct: clamp01(parseFloat(box.dataset.heightPct||'0')||0)
        };
    }
    function applyRecordToBox(box, record){
        if(!box || !record) return;
        const label = box.querySelector('.label');
        const name = (record.surface_name || box.getAttribute('data-label') || '상면').trim();
        if(label){ label.textContent = name; label.style.color = '#fff'; }
        box.setAttribute('data-label', name);
        try{
            const qRaw = state.search||'';
            const tokens = qRaw.trim()? qRaw.trim().split('%').flatMap(g=> g.split(',')).map(s=> s.trim()).filter(Boolean).map(s=> s.toLowerCase()) : [];
            renderBoxLabel(box, tokens);
        }catch(_e){}
        if(record.color_hex){ box.style.background = record.color_hex; }
        if(Number.isFinite(record.id)){ box.dataset.surfaceId = String(record.id); }
        const left = pickNumber(record.left_pct, record.position_x);
        const top = pickNumber(record.top_pct, record.position_y);
        const width = pickNumber(record.width_pct);
        const height = pickNumber(record.height_pct);
        if(left !== null) box.dataset.leftPct = String(left);
        if(top !== null) box.dataset.topPct = String(top);
        if(width !== null) box.dataset.widthPct = String(width);
        if(height !== null) box.dataset.heightPct = String(height);
        const racks = Array.isArray(record.rack_positions) ? record.rack_positions : buildRackArray(record.rack_position);
        setBoxRacks(box, racks);
        setBoxRemark(box, record.remark || record.note || '');
        box.id = record.box_identifier || box.id || assignBoxId(box);
        // Apply percent-based geometry before re-deriving percents to avoid wiping API values
        applyBoxPercents(box);
        ensureBoxPercents(box);
    }
    async function createSurfaceRecord(payload){
        const data = await sendSurfaceRequest('POST', SURFACE_API_BASE, payload);
        return data?.item || null;
    }
    async function updateSurfaceRecord(surfaceId, payload){
        const data = await sendSurfaceRequest('PUT', `${SURFACE_API_BASE}/${surfaceId}`, payload);
        return data?.item || null;
    }
    async function deleteSurfaceRecord(surfaceId){
        if(!surfaceId) return;
        const data = await sendSurfaceRequest('DELETE', `${SURFACE_API_BASE}/${surfaceId}`);
        return data?.deleted || 0;
    }
    function readRacksFromForm(form){
        if(form?._rackSearch?.getSelected){
            return form._rackSearch.getSelected();
        }
        const hid = form?.querySelector('#selected-rack-hidden');
        if(!hid) return [];
        const value = (hid.value||'').trim();
        return value ? [value] : [];
    }
    function writeRacksToForm(form, arr){
        if(form?._rackSearch?.setSelected){
            form._rackSearch.setSelected(arr);
            return;
        }
        const hid = form?.querySelector('#selected-rack-hidden');
        if(!hid) return;
        const value = Array.isArray(arr) ? (arr[0] || '') : (arr || '');
        hid.value = value;
    }

    // View modal helpers
    function openViewModalForBox(box){
        // Use raw label to preserve spaces as typed
        const name = (box.getAttribute('data-label') || box.querySelector('.label')?.textContent || '상면');
        const color = box.style.background || window.getComputedStyle(box).backgroundColor || '#60a5fa';
    const racks = getBoxRacks(box);
    const remark = getBoxRemark(box);
        const nameEl = document.getElementById('system-view-name');
        const colorSwatch = document.getElementById('system-view-color');
        const racksBox = document.getElementById('system-view-racks');
        const remarkEl = document.getElementById('system-view-remark');
        if(nameEl) nameEl.textContent = name;
        if(colorSwatch) colorSwatch.style.background = color;
        if(remarkEl) remarkEl.textContent = remark || '-';
        if(racksBox){
            racksBox.innerHTML = '';
            const arr = Array.isArray(racks) ? racks : [];
            if(arr.length === 0){
                racksBox.textContent = '-';
            } else {
                arr.forEach(v=>{
                    const chip = document.createElement('span');
                    chip.className='rack-chip';
                    chip.innerHTML = `<span class="t">${v}</span>`;
                    racksBox.appendChild(chip);
                });
            }
        }
        openModal('system-view-modal');
    }

    // ----- Context menu for overlay boxes (edit/delete) -----
    function initOverlayContextMenu(){
        const overlay = document.getElementById(OVERLAY_ID); if(!overlay) return;
        const menu = document.getElementById('overlay-context-menu');
        const btnEdit = document.getElementById('overlay-menu-edit');
        const btnDelete = document.getElementById('overlay-menu-delete');
        // Move menu to body to avoid inheriting parent opacity/transform contexts
        if(menu && menu.parentElement !== document.body){ document.body.appendChild(menu); }
        let targetBox = null;
        function hideMenu(){ if(menu){ menu.style.display='none'; menu.setAttribute('aria-hidden','true'); } targetBox=null; }
        function placeMenu(x, y){
            if(!menu) return;
            const vw = window.innerWidth, vh = window.innerHeight;
            const mw = menu.offsetWidth || 140; const mh = menu.offsetHeight || 80;
            let left = x, top = y;
            if(left + mw > vw - 8) left = vw - mw - 8;
            if(top + mh > vh - 8) top = vh - mh - 8;
            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
        }
        overlay.addEventListener('contextmenu', (e)=>{
            if(!state.editMode) return; // only in edit mode
            const box = e.target.closest('.slab-box');
            if(!box) return; // right-click outside a box → ignore
            e.preventDefault();
            targetBox = box;
            if(menu){
                menu.style.display='block';
                menu.setAttribute('aria-hidden','false');
                placeMenu(e.clientX, e.clientY);
            }
        });
        document.addEventListener('click', (e)=>{
            if(!menu || menu.style.display==='none') return;
            if(menu.contains(e.target)) return; // clicking on menu handled separately
            if(e.target.closest('.slab-box') && e.target.closest('#'+OVERLAY_ID)) return; // allow right-click sequence
            hideMenu();
        });
        window.addEventListener('resize', hideMenu);
        window.addEventListener('scroll', hideMenu, true);
        btnEdit?.addEventListener('click', ()=>{
            if(!targetBox) return;
            // Open add modal as edit: prefill slab_name and color, keep position/size
            const form = document.getElementById(ADD_FORM_ID); if(!form) return;
            const nameEl = form.querySelector('input[name="slab_name"]');
            const hiddenColor = form.querySelector('input[name="slab_color"]');
            const btnColor = form.querySelector('.status-color-btn');
            // Prefer raw label with spaces preserved; fallback to joining .w spans
            const rawName = getBoxRawName(targetBox);
            if(nameEl) nameEl.value = rawName;
            // map current inline color to a ws-c class is not trivial; store hex directly
            const bg = targetBox.style.background || window.getComputedStyle(targetBox).backgroundColor;
            if(hiddenColor) hiddenColor.value = bg;
            if(btnColor){ btnColor.className = 'status-color-btn'; btnColor.style.background = bg; }
            // Prefill racks chips from box attribute
            writeRacksToForm(form, getBoxRacks(targetBox));
            // mark form in edit mode with reference to the box
            const id = assignBoxId(targetBox);
            form.dataset.editTarget = '1';
            form.dataset.targetBoxId = id;
            const hiddenId = form.querySelector('#edit-target-box-id'); if(hiddenId) hiddenId.value = id;
            // Modal heading -> 수정
            setAddModalVisual(true);
            openModal(ADD_MODAL_ID);
            hideMenu();
        });
        btnDelete?.addEventListener('click', async ()=>{
            if(!targetBox) return;
            const surfaceId = parseInt(targetBox.dataset.surfaceId||'', 10);
            targetBox.remove();
            await persistOverlay({ skipRemote: true });
            hideMenu();
            if(Number.isFinite(surfaceId)){
                try{ await deleteSurfaceRecord(surfaceId); }
                catch(err){ console.error(err); showMessage(err?.message || '삭제 중 오류가 발생했습니다.', '오류'); }
            }
        });
    }
    function assignBoxId(box){
        if(!box.id){ box.id = 'slab_'+Math.random().toString(36).slice(2,9); }
        return box.id;
    }

    // ----- Add/Edit modal heading helper -----
    function setAddModalVisual(isEdit){
        const title = document.getElementById('system-add-title');
        const sub = document.getElementById('system-add-subtitle');
        const saveBtn = document.getElementById(ADD_SAVE_ID);
        if(isEdit){
            if(title) title.textContent = '상면 수정';
            if(sub) sub.textContent = '상면 정보를 수정합니다.';
            if(saveBtn) saveBtn.textContent = '저장';
        } else {
            if(title) title.textContent = '상면 등록';
            if(sub) sub.textContent = '새로운 상면을 등록합니다.';
            if(saveBtn) saveBtn.textContent = '등록';
            // Also set default color UI when entering add mode visuals
            try{
                const form = document.getElementById(ADD_FORM_ID);
                if(form){
                    const ADD_BTN_COLOR = '#6a5acd';
                    const hiddenColor = form.querySelector('input[name="slab_color"]');
                    const btnColor = form.querySelector('.status-color-btn');
                    if(hiddenColor) hiddenColor.value = ADD_BTN_COLOR;
                    if(btnColor){ btnColor.className='status-color-btn'; btnColor.style.background = ADD_BTN_COLOR; }
                }
            }catch(_e){}
        }
    }

    // Normalize a box name string from box DOM with spaces preserved
    function getBoxRawName(box){
        if(!box) return '';
        const label = box.querySelector('.label');
        let rawName = box.getAttribute('data-label') || '';
        if(!rawName && label){
            const ws = [...label.querySelectorAll('.w')].map(n=> n.textContent||'').filter(Boolean);
            rawName = ws.length ? ws.join(' ') : (label.textContent||'');
        }
        return rawName;
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
        const illustImg = document.querySelector('#'+modalId+' .message-illust img');
        if(titleEl) titleEl.textContent = title || '알림';
        if(contentEl) contentEl.textContent = String(message || '');
        // Swap sticker based on message title
        if(illustImg){
            if(title === '저장 완료'){
                illustImg.src = '/static/image/svg/free-sticker-approved.svg';
                illustImg.alt = 'Approved Illustration';
            } else {
                // default sticker
                illustImg.src = '/static/image/svg/list/free-sticker-solution.svg';
                illustImg.alt = 'Solution Illustration';
            }
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
                // Migration: if stored selection equals previous default (that included 개인 담당자 2개),
                // replace with new defaults (부서만 포함, 개인 담당자 제외)
                const ownerFields = new Set(['system_owner_dept','system_owner','service_owner_dept','service_owner']);
                const prevDefaultA = [
                    'business_status','business_name','vendor','model','serial','place','location','system_height','system_owner','service_owner'
                ];
                const prevDefaultB = [
                    'business_status','business_name','vendor','model','serial','place','location','system_height','system_owner_dept','service_owner_dept'
                ];
                const isPrevA = state.visibleCols.size === prevDefaultA.length && prevDefaultA.every(k=> state.visibleCols.has(k));
                const isPrevB = state.visibleCols.size === prevDefaultB.length && prevDefaultB.every(k=> state.visibleCols.has(k));
                const hasOnlyOwnerExtras = [...state.visibleCols].some(k=> ownerFields.has(k));
                if(isPrevA || isPrevB || hasOnlyOwnerExtras){
                    state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
                }
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
            { title:'비즈니스', cols:['business_status','business_name'] },
            { title:'시스템', cols:['vendor','model','serial','place','location','system_height'] },
            { title:'담당자', cols:['system_owner_dept','system_owner','service_owner_dept','service_owner'] }
        ];
        groups.forEach(g=>{
            const section = document.createElement('div'); section.className='form-section';
            section.innerHTML = `<div class="section-header"><h4>${g.title}</h4></div>`;
            const grid = document.createElement('div'); grid.className='form-grid';
            g.cols.forEach(c=>{ if(!COLUMN_META[c]) return; const wrap=document.createElement('div');
                wrap.className = 'form-row';
                const labelText = COLUMN_META[c]?.label||c;
                wrap.innerHTML=`<label>${labelText}</label>${generateFieldInput(c,row[c])}`; grid.appendChild(wrap); });
            section.appendChild(grid); form.appendChild(section);
        });
    }

    function generateFieldInput(col,value=''){
        // 비즈니스
        if(col==='business_status'){
            const v = String(value??'');
            return `<select name="business_status" class="form-input">
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="가동" ${v==='가동'?'selected':''}>가동</option>
                <option value="유휴" ${v==='유휴'?'selected':''}>유휴</option>
                <option value="대기" ${v==='대기'?'selected':''}>대기</option>
            </select>`;
        }
        if(col==='business_name'){
            return `<input name="business_name" class="form-input" placeholder="필수" value="${value??''}" required>`;
        }
        // 시스템/담당자 공통: 검색 선택
        if(['vendor','model','place','location','system_owner_dept','system_owner','service_owner_dept','service_owner'].includes(col)){
            return `<input name="${col}" class="form-input search-select" placeholder="검색 선택" value="${value??''}">`;
        }
        if(col==='serial'){
            return `<input name="serial" class="form-input" value="${value??''}">`;
        }
        if(col==='system_height'){
            return `<input name="system_height" class="form-input" value="${value??''}">`;
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
    const filename = `rack_systems_${yyyy}${mm}${dd}.csv`;
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
                    // no license/date fields used in RACK 시스템
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
            attachStatusColorPickerForLab(ADD_FORM_ID);
            attachRackSearch(ADD_FORM_ID);
            const form = document.getElementById(ADD_FORM_ID);
            if(form){
                delete form.dataset.editTarget; delete form.dataset.targetBoxId;
                const hid=form.querySelector('#edit-target-box-id'); if(hid) hid.value='';
                // reset modal heading and clear racks UI
                setAddModalVisual(false);
                writeRacksToForm(form, []);
                // Default color preselect: match add button purple
                try{
                    const ADD_BTN_COLOR = '#6a5acd';
                    const hiddenColor = form.querySelector('input[name="slab_color"]');
                    const btnColor = form.querySelector('.status-color-btn');
                    if(hiddenColor) hiddenColor.value = ADD_BTN_COLOR;
                    if(btnColor){ btnColor.className='status-color-btn'; btnColor.style.background = ADD_BTN_COLOR; }
                }catch(_e){}
            }
            openModal(ADD_MODAL_ID);
            try { form?._rackSearch?.open({ force:true }); } catch(_e){}
        });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=>{ const form=document.getElementById(ADD_FORM_ID); if(form){ delete form.dataset.editTarget; delete form.dataset.targetBoxId; const hid=form.querySelector('#edit-target-box-id'); if(hid) hid.value=''; } closeModal(ADD_MODAL_ID); });
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(ADD_FORM_ID); if(!form) return;
            if(!form.checkValidity()){ form.reportValidity(); return; }
            const overlay = document.getElementById(OVERLAY_ID);
            if(!overlay){ closeModal(ADD_MODAL_ID); return; }
            const name = form.slab_name?.value?.trim();
            const colorToken = form.slab_color?.value?.trim();
            const ADD_BTN_COLOR = '#6a5acd';
            const color = colorToken && colorToken.startsWith('ws-c') ? mapWsClassToHex(colorToken) : (colorToken || ADD_BTN_COLOR);
            const racks = readRacksFromForm(form);
            const remark = form.remark?.value?.trim() || '';
            const centerCode = form.getAttribute('data-center-code') || LAB_CENTER_CODE;
            const hiddenId = form.querySelector('#edit-target-box-id');
            const targetId = (hiddenId?.value || form.dataset.targetBoxId || '').trim();
            const saveBtn = document.getElementById(ADD_SAVE_ID);
            const restoreFormState = ()=>{
                delete form.dataset.editTarget;
                delete form.dataset.targetBoxId;
                if(hiddenId) hiddenId.value = '';
            };
            let tempBox = null;
            saveBtn?.setAttribute('disabled','disabled');
            try{
                if(form.dataset.editTarget === '1' && targetId){
                    const box = document.getElementById(targetId);
                    if(!box) throw new Error('수정할 상면을 찾을 수 없습니다.');
                    box.style.background = color;
                    const payload = buildSurfacePayload({ box, name, centerCode, color, racks, remark });
                    let surfaceId = parseInt(box.dataset.surfaceId||'', 10);
                    let record;
                    if(Number.isFinite(surfaceId)){
                        record = await updateSurfaceRecord(surfaceId, payload);
                    } else {
                        record = await createSurfaceRecord(payload);
                        surfaceId = record?.id ?? null;
                    }
                    applyRecordToBox(box, record || payload);
                    await persistOverlay({ skipRemote: true });
                } else {
                    const box = document.createElement('div');
                    box.className = 'slab-box';
                    box.style.background = color;
                    box.style.left = '20%';
                    box.style.top = '20%';
                    box.style.width = '180px';
                    box.style.height = '60px';
                    box.dataset.w = '180';
                    box.dataset.h = '60';
                    const label = document.createElement('span');
                    label.className = 'label';
                    label.textContent = name || '상면';
                    label.style.color = '#fff';
                    box.setAttribute('data-label', name || '상면');
                    box.appendChild(label);
                    overlay.appendChild(box);
                    tempBox = box;
                    assignBoxId(box);
                    makeDraggableResizable(box);
                    ensureBoxPercents(box);
                    applyBoxPercents(box);
                    setEditMode(true);
                    try{ setActiveBox(box); }catch(_e){}
                    const payload = buildSurfacePayload({ box, name, centerCode, color, racks, remark });
                    const record = await createSurfaceRecord(payload);
                    applyRecordToBox(box, record || payload);
                    await persistOverlay({ skipRemote: true });
                }
                restoreFormState();
                form.reset();
                try {
                    const wrap = form.querySelector('.status-input-wrap');
                    const btn = wrap?.querySelector('.status-color-btn');
                    if(btn){ btn.className = 'status-color-btn'; btn.removeAttribute('style'); }
                } catch(_e){}
                try{
                    const selBox = form.querySelector('#rack-selected'); if(selBox) selBox.innerHTML='';
                    const hiddenSel = form.querySelector('#selected-rack-hidden'); if(hiddenSel) hiddenSel.value='';
                    const suggest = form.querySelector('#rack-suggest'); if(suggest) suggest.hidden=true;
                }catch(_e){}
                closeModal(ADD_MODAL_ID);
            } catch(err){
                console.error(err);
                if(tempBox && !tempBox.dataset.surfaceId){
                    try { tempBox.remove(); } catch(_e){}
                }
                if(err?.message){ showMessage(err.message, '오류'); }
                else { showMessage('상면 정보를 저장하지 못했습니다.', '오류'); }
            } finally {
                saveBtn?.removeAttribute('disabled');
            }
        });
        // 편집/저장 토글 버튼
        const editToggleBtn = document.getElementById(EDIT_TOGGLE_BTN_ID);
        editToggleBtn?.addEventListener('click', async ()=>{
            if(!state.editMode){
                // 수정 모드로 전환
                setEditMode(true);
                return;
            }
            if(editToggleBtn.dataset.saving === '1') return;
            editToggleBtn.dataset.saving = '1';
            editToggleBtn.setAttribute('aria-busy', 'true');
            editToggleBtn.setAttribute('disabled', 'disabled');
            try{
                await persistOverlay();
                setEditMode(false);
                showMessage('레이아웃이 저장되었습니다.', '저장 완료');
            } catch(err){
                console.error(err);
                showMessage(err?.message || '레이아웃 저장 중 오류가 발생했습니다.', '오류');
            } finally {
                editToggleBtn.removeAttribute('disabled');
                editToggleBtn.removeAttribute('aria-busy');
                delete editToggleBtn.dataset.saving;
            }
        });
        // View mode: clicking a box opens read-only modal
        const overlayEl = document.getElementById(OVERLAY_ID);
        overlayEl?.addEventListener('click', (e)=>{
            if(state.editMode){
                // In edit mode: clicking a box selects it; clicking empty area clears selection
                const box = e.target.closest('.slab-box');
                if(box && overlayEl.contains(box)) setActiveBox(box); else clearActiveBox();
                return;
            }
            // only in view mode
            const box = e.target.closest('.slab-box');
            if(!box || !overlayEl.contains(box)) return;
            openViewModalForBox(box);
        });
        document.getElementById('system-view-close')?.addEventListener('click', ()=> closeModal('system-view-modal'));
        document.getElementById('system-view-ok')?.addEventListener('click', ()=> closeModal('system-view-modal'));
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
        // 배치도 프린트
        async function performRackPrint(){
            try {
        const layout = document.getElementById('rack-layout');
        const img = layout?.querySelector('img');
        const overlay = document.getElementById(OVERLAY_ID);
        if(!layout || !img || !overlay){ showMessage('배치도를 찾을 수 없습니다.', '오류'); return; }

                // Ensure base image is loaded
                if(!img.complete){ await new Promise(res=>{ img.addEventListener('load', res, {once:true}); img.addEventListener('error', res, {once:true}); }); }

                // Use overlay size as the single source of truth (matches box percents)
                // Overlay size in CSS px (used to compute crop, but export will be natural px based)
                const widthCSS = Math.max(1, overlay.clientWidth || overlay.offsetWidth || 1);
                const heightCSS = Math.max(1, overlay.clientHeight || overlay.offsetHeight || 1);

                // Prepare canvas
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if(!ctx){ showMessage('캔버스 컨텍스트를 생성할 수 없습니다.', '오류'); return; }
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // Draw base image to canvas using an offscreen Image to avoid tainting
                const srcUrl = img.currentSrc || img.src;
                const base = new Image();
                base.crossOrigin = 'anonymous'; // best effort; same-origin assumed in this app
                const useUrl = new URL(srcUrl, window.location.origin).toString();
                await new Promise((resolve, reject)=>{ base.onload = resolve; base.onerror = reject; base.src = useUrl; });
                // Crop base image to the exact overlay area in case of padding/margins
                const imgRect = img.getBoundingClientRect();
                const orect2 = overlay.getBoundingClientRect();
                const ovWcss = widthCSS; // overlay client width in CSS px
                const ovHcss = heightCSS; // overlay client height in CSS px
                const imgCSSW = Math.max(1, Math.round(imgRect.width));
                const imgCSSH = Math.max(1, Math.round(imgRect.height));
                const scaleX = (imgCSSW > 0 && base.naturalWidth) ? (base.naturalWidth / imgCSSW) : 1;
                const scaleY = (imgCSSH > 0 && base.naturalHeight) ? (base.naturalHeight / imgCSSH) : 1;
                // Round CSS deltas to pixel grid to mimic layout
                const deltaLeftCSS = Math.round(orect2.left - imgRect.left);
                const deltaTopCSS = Math.round(orect2.top - imgRect.top);
                let sx = deltaLeftCSS * scaleX;
                let sy = deltaTopCSS * scaleY;
                let sW = ovWcss * scaleX;
                let sH = ovHcss * scaleY;
                // Clamp crop rect within the image bounds
                sx = Math.max(0, Math.min(sx, base.naturalWidth - 1));
                sy = Math.max(0, Math.min(sy, base.naturalHeight - 1));
                sW = Math.max(1, Math.min(sW, base.naturalWidth - sx));
                sH = Math.max(1, Math.min(sH, base.naturalHeight - sy));
                // If mapping fails (e.g., zero), fallback to full image scaled
                const nearEqual = (Math.abs(ovWcss - imgCSSW) <= 1) && (Math.abs(ovHcss - imgCSSH) <= 1) && (Math.abs(deltaLeftCSS) <= 1) && (Math.abs(deltaTopCSS) <= 1);
                // Determine natural crop rect and set canvas size to crop for zoom-independent export
                let cropSX, cropSY, cropSW, cropSH;
                if(nearEqual){
                    cropSX = 0; cropSY = 0; cropSW = base.naturalWidth; cropSH = base.naturalHeight;
                } else if(!isFinite(sx) || !isFinite(sy) || !isFinite(sW) || !isFinite(sH) || sW<=0 || sH<=0){
                    cropSX = 0; cropSY = 0; cropSW = base.naturalWidth; cropSH = base.naturalHeight;
                } else {
                    cropSX = Math.max(0, Math.min(Math.round(sx), base.naturalWidth - 1));
                    cropSY = Math.max(0, Math.min(Math.round(sy), base.naturalHeight - 1));
                    cropSW = Math.max(1, Math.min(Math.round(sW), base.naturalWidth - cropSX));
                    cropSH = Math.max(1, Math.min(Math.round(sH), base.naturalHeight - cropSY));
                }
                const exportWidth = cropSW;
                const exportHeight = cropSH;
                canvas.width = exportWidth;
                canvas.height = exportHeight;
                // Solid background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, exportWidth, exportHeight);
                // Draw base
                ctx.drawImage(base, cropSX, cropSY, cropSW, cropSH, 0, 0, exportWidth, exportHeight);

                // Draw boxes
                const boxes = [...overlay.querySelectorAll('.slab-box')];
                boxes.forEach(b=>{
                    // Get box rect relative to image size: use percent-based for accuracy
                    const lp = parseFloat(b.dataset.leftPct||'0');
                    const tp = parseFloat(b.dataset.topPct||'0');
                    const wp = parseFloat(b.dataset.widthPct||'0');
                    const hp = parseFloat(b.dataset.heightPct||'0');
                    // Replicate applyBoxPercents using export (natural) pixels
                    // Map CSS min sizes (40x24) to natural using image scale factor
                    const imgRect2 = img.getBoundingClientRect();
                    const imgCSSW2 = Math.max(1, Math.round(imgRect2.width));
                    const imgCSSH2 = Math.max(1, Math.round(imgRect2.height));
                    const scaleX2 = (imgCSSW2 > 0 && base.naturalWidth) ? (base.naturalWidth / imgCSSW2) : 1;
                    const scaleY2 = (imgCSSH2 > 0 && base.naturalHeight) ? (base.naturalHeight / imgCSSH2) : 1;
                    const minW = Math.max(1, Math.round(40 * scaleX2));
                    const minH = Math.max(1, Math.round(24 * scaleY2));
                    const x = Math.round(lp * exportWidth);
                    const y = Math.round(tp * exportHeight);
                    const w = Math.max(minW, Math.round(wp * exportWidth));
                    const h = Math.max(minH, Math.round(hp * exportHeight));
                    const bg = b.style.background || b.style.backgroundColor || '#60a5fa';
                    // Box
                    ctx.fillStyle = bg;
                    ctx.fillRect(x, y, w, h);
                    // No border: fill edge-to-edge for a tighter look matching on-screen
                    // Label text
                    const text = (b.getAttribute('data-label') || b.querySelector('.label')?.textContent || '').trim();
                    if(text){
                        // Scale font relative to box size
                        const fontPx = Math.max(10, Math.min(28, Math.floor(Math.min(w, h) / 4.5)));
                        ctx.font = `${fontPx}px Inter, Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif`;
                        ctx.font = `600 ${fontPx}px Inter, Pretendard, Apple SD Gothic Neo, Malgun Gothic, sans-serif`;
                        ctx.fillStyle = '#fff';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        // Render like screen: split on spaces to one word per line
                        const words = text.split(/\s+/).filter(Boolean);
                        const lines = words.length ? words : ['상면'];
                        const lineHeight = Math.round(fontPx * 1.15);
                        const totalH = lines.length * lineHeight;
                        let sy = y + Math.round((h - totalH)/2) + Math.round(lineHeight/2);
                        lines.forEach(line=>{
                            ctx.fillText(line, x + Math.round(w/2), sy);
                            sy += lineHeight;
                        });
                    }
                });

                // Print inline without opening a new window
                const dataUrl = canvas.toDataURL('image/png');
                const body = document.body;
                let root = document.getElementById('rack-print-root');
                if(!root){
                    root = document.createElement('div');
                    root.id = 'rack-print-root';
                    body.appendChild(root);
                }
                root.innerHTML = '';
                // Print header: show page title (left) and 기준일자 (right)
                const pageTitle = (document.querySelector('.tab-header-left h2')?.textContent || '퓨처센터(5층) 배치도').trim();
                const headerEl = document.createElement('div');
                headerEl.className = 'rack-print-header';
                const leftSpan = document.createElement('span');
                leftSpan.className = 'left';
                leftSpan.textContent = pageTitle;
                const rightSpan = document.createElement('span');
                rightSpan.className = 'right';
                const daysKO = ['일','월','화','수','목','금','토'];
                const now = new Date();
                const yyyy = now.getFullYear();
                const mm = String(now.getMonth()+1).padStart(2,'0');
                const dd = String(now.getDate()).padStart(2,'0');
                const dow = daysKO[now.getDay()];
                rightSpan.textContent = `기준일자: ${yyyy}년 ${mm}월 ${dd}일(${dow})`;
                headerEl.appendChild(leftSpan);
                headerEl.appendChild(rightSpan);
                root.appendChild(headerEl);
                const imgEl = document.createElement('img');
                imgEl.alt = '배치도';
                imgEl.src = dataUrl;
                root.appendChild(imgEl);
                // Toggle print mode
                body.classList.add('printing-rack');
                // Temporarily set document title to page heading so the browser header shows desired title
                const originalTitle = document.title;
                const pageTitleEl = document.querySelector('.tab-header-left h2');
                const desiredTitle = (pageTitleEl?.textContent || '퓨처센터(5층) 배치도').trim();
                document.title = desiredTitle;
                const cleanup = ()=>{
                    try{ body.classList.remove('printing-rack'); }catch(_e){}
                    try{ root.innerHTML = ''; }catch(_e){}
                    try{ document.title = originalTitle; }catch(_e){}
                };
                const onAfterPrint = ()=>{ window.removeEventListener('afterprint', onAfterPrint); cleanup(); };
                window.addEventListener('afterprint', onAfterPrint);
                setTimeout(()=>{ window.print(); }, 0);
                // Removed legacy one-time printer tip; rely solely on the print guide modal
            } catch(_e){
                showMessage('배치도 프린트에 실패했습니다.', '오류');
            }
        }
        const dlBtn = document.getElementById('system-download-btn');
        if(dlBtn){
            dlBtn.addEventListener('click', ()=>{
                // Open guidance modal first
                openModal('system-print-modal');
            });
        }
        // Print modal buttons
        document.getElementById('system-print-cancel')?.addEventListener('click', ()=> closeModal('system-print-modal'));
        document.getElementById('system-print-confirm')?.addEventListener('click', async ()=>{
            closeModal('system-print-modal');
            await performRackPrint();
        });

        // Keyboard arrow movement in edit mode
        document.addEventListener('keydown', (e)=>{
            // Skip if any modal is open or typing in inputs
            if(!state.editMode) return;
            const activeTag = document.activeElement?.tagName?.toLowerCase?.() || '';
            if(['input','textarea','select'].includes(activeTag)) return;
            if(document.querySelector('.modal-open')) return;
            const key = e.key;
            const moveKeys = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
            if(!moveKeys.includes(key)) return;
            e.preventDefault();
            const base = e.altKey ? 1 : (e.shiftKey ? 10 : 2);
            let dx = 0, dy = 0;
            if(key==='ArrowUp') dy = -base;
            else if(key==='ArrowDown') dy = base;
            else if(key==='ArrowLeft') dx = -base;
            else if(key==='ArrowRight') dx = base;
            moveActiveBoxBy(dx, dy);
        });

        function wrapText(ctx, text, maxWidth){
            const words = text.split(/\s+/);
            const lines = [];
            let line = '';
            for(const w of words){
                const test = line ? line + ' ' + w : w;
                if(ctx.measureText(test).width <= maxWidth){
                    line = test;
                } else {
                    if(line) lines.push(line);
                    line = w;
                }
            }
            if(line) lines.push(line);
            return lines.slice(0, 5); // hard cap to avoid excessive rows
        }
    // Ensure color picker wired in case modal is already in DOM
    attachStatusColorPickerForLab(ADD_FORM_ID);
    attachRackSearch(ADD_FORM_ID);
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
                    const wide = ['업무 이름','시스템 위치'];
                    const mid = ['업무 상태','시스템 제조사','시스템 모델명','시스템 장소','시스템 담당부서','시스템 담당자','서비스 담당부서','서비스 담당자'];
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
                    ['- "시스템 높이"는 예: 2U 형태로 기입하세요.'],
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
                XLSX.writeFile(wb, 'rack_systems_upload_template.xlsx');
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
                        // RACK 시스템: 별도 숫자 필드 검증 없음 (system_height는 자유 형식)
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
                copy.business_name = copy.business_name ? copy.business_name + '_COPY' : copy.business_name;
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
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 시스템을 정말 불용처리하시겠습니까?`; }
            openModal(DISPOSE_MODAL_ID);
        });
    document.getElementById(DISPOSE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DISPOSE_MODAL_ID));
        document.getElementById(DISPOSE_CONFIRM_ID)?.addEventListener('click', ()=>{
            // 수집 대상 열: 비즈니스/시스템/담당자 주요 필드
            const fields = ['business_status','business_name','vendor','model','serial','place','location','system_height','system_owner_dept','system_owner','service_owner_dept','service_owner'];
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
        // delete (삭제처리) — button removed on this page
        if(DELETE_BTN_ID && document.getElementById(DELETE_BTN_ID)) document.getElementById(DELETE_BTN_ID).addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('삭제처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('delete-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 시스템을 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        if(document.getElementById(DELETE_CLOSE_ID)) document.getElementById(DELETE_CLOSE_ID).addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        // bulk 버튼은 이 페이지에서 토글 버튼으로 대체되어 미사용
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
                if(editSaveEl){ editSaveEl.setAttribute('data-index', realIndex); }
                return;
            }
            // 2개 이상 → 일괄변경 모달
            const subtitle = document.getElementById('bulk-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 시스템에서 지정한 필드를 일괄 변경합니다.`; }
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
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ [ADD_MODAL_ID,EDIT_MODAL_ID,COLUMN_MODAL_ID,DISPOSE_MODAL_ID,DELETE_MODAL_ID,BULK_MODAL_ID,UPLOAD_MODAL_ID,'system-message-modal','system-duplicate-modal','system-print-modal','system-view-modal'].forEach(closeModal); }});
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
                return `<select class="form-input" data-bulk-field="business_status">
                    <option value="">선택</option>
                    <option value="가동">가동</option>
                    <option value="유휴">유휴</option>
                    <option value="대기">대기</option>
                </select>`;
            }
            return `<input class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }
        const GROUPS = [
            { title:'비즈니스', cols:['business_status','business_name'] },
            { title:'시스템', cols:['vendor','model','serial','place','location','system_height'] },
            { title:'담당자', cols:['system_owner_dept','system_owner','service_owner_dept','service_owner'] }
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
        // RACK 시스템 통계
        renderStatBlock('stats-software', '업무 상태', countBy(rows, 'business_status', ['가동','유휴','대기']), ['가동','유휴','대기']);
        renderStatBlock('stats-software', '시스템 제조사', countBy(rows, 'vendor'));
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
// Load saved overlay boxes and autosave wiring
        loadOverlayFromStorage();
        enableOverlayAutoSave();
        initOverlayContextMenu();
        // 초기에는 보기 모드로 설정
        setEditMode(false);
        // Responsive: observe overlay size changes
        observeOverlayResize();
        window.addEventListener('load', scheduleOverlayReflow, { once: true });
        try {
            const rackImage = document.querySelector('#rack-layout img');
            rackImage?.addEventListener('load', scheduleOverlayReflow, { once: false });
        } catch(_imgErr){}
        // If search has an initial value, apply highlight
        try{
            const el = document.getElementById(SEARCH_ID);
            if(el && el.value){
                const tokens = el.value.trim().split('%').flatMap(g=> g.split(',')).map(s=>s.trim()).filter(Boolean).map(s=>s.toLowerCase());
                updateOverlaySearchHighlight(tokens);
            }
        }catch(_e){}
    }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

// 전역 스코프 밖으로 나가기 전에 즉시실행함수 내부에 두어야 하지만, 위 스코프 안에서 참조되도록 아래 함수를 위로 이동시킬 수 없어 여기서 정의 후 바인딩은 상단에서 호출
(function(){
    // 이 클로저는 위 즉시실행 함수의 변수에는 접근하지 못하므로 window를 통해 접근
})();



