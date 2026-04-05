/**
 * 데이터센터 관리 페이지 스크립트
 * - 컬럼 토글 (기본 10개 노출)
 * - 로컬(in-memory) 데이터 렌더링 + 페이징 + 검색
 * - 모달 (등록/수정/컬럼 선택)
 * - CSV 다운로드 (현재 페이지 or 전체)
 * NOTE: 서버 연동 전 단계로 mock 데이터 사용
 */

(function(){
    // Mark body for Access System page to enable page-scoped CSS (if needed)
    try { document.body.classList.add('page-access-system'); } catch(_e){}
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
            const s = document.createElement('script');
            s.src = XLSX_CDN; s.async = true;
            s.onload = ()=> resolve();
            s.onerror = ()=> reject(new Error('XLSX load failed'));
            document.head.appendChild(s);
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
        const link = document.createElement('link');
        link.id = id; link.rel = 'stylesheet'; link.href = href;
        document.head.appendChild(link);
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
    // Upload template (Access Registration schema)
    const UPLOAD_HEADERS_KO = [
        '상태','성명','소속','사번/번호','출입일시','퇴실일시','출입목적','출입구역','노트북사용','USB락사용','담당관리자','출입관리자','입출구분','물품구분','물품장비','물품수량','비고'
    ];
    const HEADER_KO_TO_KEY = {
        '상태':'status','성명':'name','소속':'affiliation','사번/번호':'id_number','출입일시':'entry_datetime','퇴실일시':'exit_datetime','출입목적':'entry_purpose','출입구역':'entry_area','노트북사용':'laptop_use','USB락사용':'usb_lock_use','담당관리자':'manager_in_charge','출입관리자':'access_admin','입출구분':'in_out_type','물품구분':'goods_type','물품장비':'goods_item','물품수량':'goods_qty','비고':'note'
    };
    const ENUM_SETS = { };
    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
    function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }

    // Data + State
    const BASE_VISIBLE_COLUMNS = [
        'work_status','work_name','system_name','system_ip','manage_ip',
        'vendor','model','serial','location_place','location_pos'
    ];
    const COLUMN_ORDER = [
        'work_status','work_name','system_name','system_ip','manage_ip',
        'vendor','model','serial','location_place','location_pos',
        'sys_dept','sys_owner','svc_dept','svc_owner'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '비즈니스', columns: ['work_status','work_name','system_name','system_ip','manage_ip'] },
        { group: '시스템', columns: ['vendor','model','serial','location_place','location_pos'] },
        { group: '담당자', columns: ['sys_dept','sys_owner','svc_dept','svc_owner'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        work_status:{label:'업무 상태',group:'비즈니스'},
        work_name:{label:'업무 이름',group:'비즈니스'},
        system_name:{label:'시스템 이름',group:'비즈니스'},
        system_ip:{label:'시스템 IP',group:'비즈니스'},
        manage_ip:{label:'관리 IP',group:'비즈니스'},
        vendor:{label:'시스템 제조사',group:'시스템'},
        model:{label:'시스템 모델명',group:'시스템'},
        serial:{label:'시스템 일련번호',group:'시스템'},
        location_place:{label:'시스템 장소',group:'시스템'},
        location_pos:{label:'시스템 위치',group:'시스템'},
        sys_dept:{label:'시스템 담당부서',group:'담당자'},
        sys_owner:{label:'시스템 담당자',group:'담당자'},
        svc_dept:{label:'서비스 담당부서',group:'담당자'},
        svc_owner:{label:'서비스 담당자',group:'담당자'}
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
        nextId: 1, // legacy (mock) counter
        sortKey: null,
        sortDir: 'asc',
    columnFilters: {}, // { col: value | [values...] } (조건 필터 기능 제거 예정 - 빈 유지)
    // 퇴실 처리 후 5초 동안 표시 유지하기 위한 유예 타이머 (id -> expiry timestamp)
    exitGrace: new Map()
    };

    // ---- API wiring (dc_access_system) ----
    const ACCESS_SYSTEM_API_BASE = '/api/datacenter/access/systems';

    const directory = {
        loaded: false,
        deptCodeToName: new Map(),
        deptNameToCode: new Map(),
        centerCodeToName: new Map(),
        centerNameToCode: new Map(),
        deptNames: [],
        centerNames: [],
    };

    let actorUserIdPromise = null;

    async function apiFetchJson(url, options){
        const opts = options || {};
        const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
        const res = await fetch(url, Object.assign({}, opts, {
            headers,
            credentials: 'same-origin'
        }));
        const json = await res.json().catch(()=> ({}));
        if(!res.ok){
            const msg = (json && (json.message || json.error)) ? String(json.message || json.error) : `HTTP ${res.status}`;
            const err = new Error(msg);
            err.status = res.status;
            err.payload = json;
            throw err;
        }
        return json;
    }

    async function ensureActorUserId(){
        if(actorUserIdPromise) return actorUserIdPromise;
        actorUserIdPromise = (async ()=>{
            const json = await apiFetchJson('/api/chat/whoami', { method: 'GET' });
            const id = json && json.user_id ? Number(json.user_id) : null;
            return Number.isFinite(id) && id > 0 ? id : null;
        })().catch((e)=>{
            actorUserIdPromise = null;
            throw e;
        });
        return actorUserIdPromise;
    }

    function _normToken(v){ return String(v || '').trim(); }
    function _keyToken(v){ return _normToken(v).toLowerCase(); }

    async function ensureDirectoriesLoaded(){
        if(directory.loaded) return;
        try{
            const [deptJson, centerJson] = await Promise.all([
                apiFetchJson(`/api/org-departments?_=${Date.now()}`, { method: 'GET' }),
                apiFetchJson(`/api/org-centers?_=${Date.now()}`, { method: 'GET' }),
            ]);
            const deptItems = Array.isArray(deptJson?.items) ? deptJson.items : [];
            const centerItems = Array.isArray(centerJson?.items) ? centerJson.items : [];

            directory.deptCodeToName.clear();
            directory.deptNameToCode.clear();
            directory.centerCodeToName.clear();
            directory.centerNameToCode.clear();

            deptItems.forEach((r)=>{
                const code = _normToken(r.dept_code ?? r.deptCode);
                const name = _normToken(r.dept_name ?? r.deptName ?? r.name);
                if(!code || !name) return;
                directory.deptCodeToName.set(_keyToken(code), name);
                directory.deptNameToCode.set(_keyToken(name), code);
            });
            centerItems.forEach((r)=>{
                const code = _normToken(r.center_code ?? r.centerCode);
                const name = _normToken(r.center_name ?? r.centerName ?? r.name);
                if(!code || !name) return;
                directory.centerCodeToName.set(_keyToken(code), name);
                directory.centerNameToCode.set(_keyToken(name), code);
            });

            directory.deptNames = [...new Set(Array.from(directory.deptNameToCode.keys()).map(k=>{
                const code = directory.deptNameToCode.get(k);
                return directory.deptCodeToName.get(_keyToken(code)) || '';
            }))].filter(Boolean).sort((a,b)=> a.localeCompare(b, 'ko-KR'));
            directory.centerNames = [...new Set(Array.from(directory.centerNameToCode.keys()).map(k=>{
                const code = directory.centerNameToCode.get(k);
                return directory.centerCodeToName.get(_keyToken(code)) || '';
            }))].filter(Boolean).sort((a,b)=> a.localeCompare(b, 'ko-KR'));

            directory.loaded = true;
        }catch(e){
            console.warn('Failed to load dept/center directories', e);
            directory.loaded = false;
        }
    }

    function resolveDeptCode(input){
        const raw = _normToken(input);
        if(!raw) return null;
        const key = _keyToken(raw);
        if(directory.deptCodeToName.has(key)) return raw;
        return directory.deptNameToCode.get(key) || null;
    }

    function resolveCenterCode(input){
        const raw = _normToken(input);
        if(!raw) return null;
        const key = _keyToken(raw);
        if(directory.centerCodeToName.has(key)) return raw;
        return directory.centerNameToCode.get(key) || null;
    }

    function displayDept(input){
        const raw = _normToken(input);
        if(!raw) return '';
        return directory.deptCodeToName.get(_keyToken(raw)) || raw;
    }

    function displayCenter(input){
        const raw = _normToken(input);
        if(!raw) return '';
        return directory.centerCodeToName.get(_keyToken(raw)) || raw;
    }

    function normalizeRowFromApi(r){
        const row = Object.assign({}, r || {});
        row.work_status = row.work_status ?? row.business_status_code ?? '';
        row.work_name = row.work_name ?? row.business_name ?? '';
        row.vendor = row.vendor ?? row.manufacturer_name ?? '';
        row.model = row.model ?? row.system_model_name ?? '';
        row.serial = row.serial ?? row.serial_number ?? '';
        row.location_place = displayCenter(row.location_place ?? row.center_code ?? '');
        row.location_pos = row.location_pos ?? row.system_location ?? '';
        row.sys_dept = displayDept(row.sys_dept ?? row.system_dept_code ?? '');
        row.svc_dept = displayDept(row.svc_dept ?? row.service_dept_code ?? '');
        row.sys_owner = row.sys_owner ?? row.system_manager_id ?? '';
        row.svc_owner = row.svc_owner ?? row.service_manager_id ?? '';
        return row;
    }

    function buildCreatePayloadFromForm(data, actorUserId){
        const workStatus = _normToken(data.work_status);
        if(!workStatus){
            throw new Error('업무 상태는 필수입니다.');
        }
        const centerRaw = _normToken(data.location_place);
        const sysDeptRaw = _normToken(data.sys_dept);
        const svcDeptRaw = _normToken(data.svc_dept);

        const centerCode = centerRaw ? resolveCenterCode(centerRaw) : null;
        if(centerRaw && !centerCode){
            throw new Error('시스템 장소는 목록에서 선택된 값만 저장할 수 있습니다.');
        }
        const sysDeptCode = sysDeptRaw ? resolveDeptCode(sysDeptRaw) : null;
        if(sysDeptRaw && !sysDeptCode){
            throw new Error('시스템 담당부서는 목록에서 선택된 값만 저장할 수 있습니다.');
        }
        const svcDeptCode = svcDeptRaw ? resolveDeptCode(svcDeptRaw) : null;
        if(svcDeptRaw && !svcDeptCode){
            throw new Error('서비스 담당부서는 목록에서 선택된 값만 저장할 수 있습니다.');
        }

        return {
            system_code: `DCA-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`,
            business_status_code: workStatus,
            business_name: _normToken(data.work_name),
            system_name: _normToken(data.system_name),
            system_ip: _normToken(data.system_ip) || null,
            manage_ip: _normToken(data.manage_ip) || null,
            manufacturer_name: _normToken(data.vendor) || null,
            system_model_name: _normToken(data.model) || null,
            serial_number: _normToken(data.serial) || null,
            center_code: centerCode,
            system_location: _normToken(data.location_pos) || null,
            system_dept_code: sysDeptCode,
            service_dept_code: svcDeptCode,
            created_by: actorUserId,
        };
    }

    function buildUpdatePayloadFromForm(data, actorUserId){
        const payload = {
            updated_by: actorUserId,
            business_name: _normToken(data.work_name),
            system_name: _normToken(data.system_name),
            system_ip: _normToken(data.system_ip) || null,
            manage_ip: _normToken(data.manage_ip) || null,
            manufacturer_name: _normToken(data.vendor) || null,
            system_model_name: _normToken(data.model) || null,
            serial_number: _normToken(data.serial) || null,
            system_location: _normToken(data.location_pos) || null,
        };

        const workStatus = _normToken(data.work_status);
        if(workStatus){
            payload.business_status_code = workStatus;
        }

        const centerRaw = _normToken(data.location_place);
        if(centerRaw){
            const centerCode = resolveCenterCode(centerRaw);
            if(!centerCode) throw new Error('시스템 장소는 목록에서 선택된 값만 저장할 수 있습니다.');
            payload.center_code = centerCode;
        } else {
            payload.center_code = null;
        }

        const sysDeptRaw = _normToken(data.sys_dept);
        if(sysDeptRaw){
            const sysDeptCode = resolveDeptCode(sysDeptRaw);
            if(!sysDeptCode) throw new Error('시스템 담당부서는 목록에서 선택된 값만 저장할 수 있습니다.');
            payload.system_dept_code = sysDeptCode;
        } else {
            payload.system_dept_code = null;
        }

        const svcDeptRaw = _normToken(data.svc_dept);
        if(svcDeptRaw){
            const svcDeptCode = resolveDeptCode(svcDeptRaw);
            if(!svcDeptCode) throw new Error('서비스 담당부서는 목록에서 선택된 값만 저장할 수 있습니다.');
            payload.service_dept_code = svcDeptCode;
        } else {
            payload.service_dept_code = null;
        }

        return payload;
    }

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;

    async function initData(){
        await ensureDirectoriesLoaded();
        try{
            const items = await apiFetchJson(`${ACCESS_SYSTEM_API_BASE}?_=${Date.now()}`, { method: 'GET' });
            const rows = Array.isArray(items) ? items : [];
            state.data = rows.map(normalizeRowFromApi);
        }catch(e){
            console.error('Failed to load access systems', e);
            state.data = [];
            try{ showMessage('출입 시스템 데이터를 불러오지 못했습니다. (API 연동 확인 필요)', '오류'); }catch(_e){}
        }
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
        // '퇴실' 상태는 기본 제외하되, 유예 시간(exitGrace) 내엔 표시 유지
        base = base.filter(row => {
            const st = String(row.status);
            if(st !== '퇴실') return true;
            const exp = state.exitGrace.get(row.id);
            return typeof exp === 'number' && Date.now() < exp;
        });
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
                    if(titleEl) titleEl.textContent = '출입 등록 내역이 없습니다.';
                    if(descEl) descEl.textContent = "우측 상단 '추가' 버튼을 눌러 첫 출입 등록을 추가하세요.";
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
                    let displayVal = (rawVal==null || String(rawVal).trim()==='') ? '-' : rawVal;
                    let cellValue = highlight(displayVal, col);
                    // 업무 상태 배지 표시 (가동/대기/유휴)
                    if(col === 'work_status'){
                        const v = String(displayVal);
                        let cls = 'ws-wait';
                        if(v === '가동') cls = 'ws-run';
                        else if(v === '유휴') cls = 'ws-idle';
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

    // Search clear button visibility helper
    function updateClearVisibility(){
        const clearBtn = document.getElementById(SEARCH_CLEAR_ID);
        const inputEl = document.getElementById(SEARCH_ID);
        if(!clearBtn || !inputEl) return;
        const hasText = (inputEl.value || '').trim() !== '';
        // Show/hide using hidden attribute for simplicity
        clearBtn.hidden = !hasText;
        // Keep an aria-hidden in sync for assistive tech
        clearBtn.setAttribute('aria-hidden', hasText ? 'false' : 'true');
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
                // Remove deprecated columns from previous versions (software-era)
                ['sw_type','sw_status','sw_vendor','sw_name','sw_version','sw_dept','sw_owner','lic_type','lic_total','lic_assigned','lic_idle','lic_desc','lic_key','lic_period']
                    .forEach(k=> state.visibleCols.delete(k));
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
            { title:'비즈니스', cols:['work_status','work_name','system_name','system_ip','manage_ip'] },
            { title:'시스템', cols:['vendor','model','serial','location_place','location_pos'] },
            { title:'담당자', cols:['sys_dept','sys_owner','svc_dept','svc_owner'] }
        ];
        groups.forEach(g=>{
            const section = document.createElement('div'); section.className='form-section';
            section.innerHTML = `<div class="section-header"><h4>${g.title}</h4></div>`;
            const grid = document.createElement('div'); grid.className='form-grid';
            g.cols.forEach(c=>{ if(!COLUMN_META[c]) return; const wrap=document.createElement('div');
                wrap.className = 'form-row';
                const isRequired = (c === 'work_name' || c === 'system_name');
                const labelText = (COLUMN_META[c]?.label||c) + (isRequired ? ' <span class="required-asterisk" aria-hidden="true">*</span>' : '');
                wrap.innerHTML=`<label>${labelText}</label>${generateFieldInput(c,row[c])}`; grid.appendChild(wrap); });
            section.appendChild(grid); form.appendChild(section);
        });
        // Ensure searchable-select UI is synced after dynamic insertion
        try { window.BlossomSearchableSelect?.syncAll?.(form); } catch(_e){}
    }

    function generateFieldInput(col,value=''){
        // Business/System/Owner fields
        if(col==='work_status'){
            return buildSearchSelectHTML('work_status', value);
        }
        if(col==='location_place'){
            return buildSearchSelectHTML('location_place', value);
        }
        if(col==='vendor') return buildSearchSelectHTML('vendor', value);
        if(col==='model') return buildSearchSelectHTML('model', value);
        if(col==='location_pos') return `<input name="location_pos" class="form-input" value="${value??''}" placeholder="위치 입력" data-fk-ignore="1">`;
        if(col==='sys_dept') return buildSearchSelectHTML('sys_dept', value);
        if(col==='sys_owner') return buildSearchSelectHTML('sys_owner', value);
        if(col==='svc_dept') return buildSearchSelectHTML('svc_dept', value);
        if(col==='svc_owner') return buildSearchSelectHTML('svc_owner', value);
        if(col==='system_ip') return `<input name="system_ip" class="form-input" value="${value??''}" placeholder="예: 10.0.0.1" pattern="^(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)){3}$" title="IPv4 형식(예: 10.0.0.1)">`;
        if(col==='manage_ip') return `<input name="manage_ip" class="form-input" value="${value??''}" placeholder="예: 192.168.0.1" pattern="^(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)){3}$" title="IPv4 형식(예: 192.168.0.1)">`;
        if(col==='work_name') return `<input name="work_name" class="form-input" value="${value??''}" required>`;
        if(col==='system_name') return `<input name="system_name" class="form-input" value="${value??''}" required>`;
        return `<input name="${col}" class="form-input" value="${value??''}">`;
    }

    // Build unique options from current rows
    function uniqueValues(rows, key){
        const s = new Set();
        rows.forEach(r=>{ const v = (r[key]==null? '': String(r[key]).trim()); if(v) s.add(v); });
        return [...s].sort((a,b)=> a.localeCompare(b, 'ko')); 
    }
    function getSearchSelectOptions(field){
        if(field === 'work_status') return ['가동','대기','유휴'];
        if(field === 'location_place'){
            return directory.loaded ? (directory.centerNames || []) : uniqueValues(state.data, 'location_place');
        }

        if(field === 'vendor') return uniqueValues(state.data, 'vendor');
        if(field === 'model') return uniqueValues(state.data, 'model');
        if(field === 'sys_dept'){
            return directory.loaded ? (directory.deptNames || []) : uniqueValues(state.data, 'sys_dept');
        }
        if(field === 'svc_dept'){
            return directory.loaded ? (directory.deptNames || []) : uniqueValues(state.data, 'svc_dept');
        }
        if(field === 'sys_owner') return uniqueValues(state.data, 'sys_owner');
        if(field === 'svc_owner') return uniqueValues(state.data, 'svc_owner');
        return [];
    }

    function buildSearchSelectHTML(field, currentValue){
        const v = String(currentValue ?? '').trim();
        const options = getSearchSelectOptions(field);
        const unique = [];
        const seen = new Set();

        // Preserve current value (even if not in the suggestions)
        if(v){ seen.add(v); unique.push(v); }
        (options || []).forEach(o=>{
            const s = String(o ?? '').trim();
            if(!s || seen.has(s)) return;
            seen.add(s);
            unique.push(s);
        });

        const optionTags = ['<option value="">검색 선택</option>']
            .concat(unique.map(o=>`<option value="${escapeHTML(o)}" ${o===v?'selected':''}>${escapeHTML(o)}</option>`))
            .join('');

        return `<select name="${field}" class="form-input search-select" data-searchable="true" data-placeholder="검색 선택">${optionTags}</select>`;
    }

    function populateAddModalSearchSelects(){
        const form = document.getElementById(ADD_FORM_ID);
        if(!form) return;
        const fields = ['work_status','vendor','model','location_place','sys_dept','sys_owner','svc_dept','svc_owner'];
        fields.forEach((field)=>{
            const select = form.querySelector(`select[name="${field}"]`);
            if(!select) return;
            const current = String(select.value ?? '').trim();
            const html = buildSearchSelectHTML(field, current);
            // Replace just the options (keep the existing select element and its wrapper behavior)
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            const newSelect = tmp.querySelector('select');
            if(!newSelect) return;
            select.innerHTML = newSelect.innerHTML;
            select.value = current;
        });
        try { window.BlossomSearchableSelect?.syncAll?.(form); } catch(_e){}
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
        const actorUserId = await ensureActorUserId();
        if(!actorUserId){
            showMessage('로그인 정보가 확인되지 않습니다. (세션 만료 가능)', '안내');
            throw new Error('actor_user_id_missing');
        }
        const payload = buildCreatePayloadFromForm(data, actorUserId);
        const created = await apiFetchJson(ACCESS_SYSTEM_API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const normalized = normalizeRowFromApi(created);
        state.data.unshift(normalized);
        applyFilter();
        return normalized;
    }

    async function updateRow(index,data){
        const existing = state.data[index];
        if(!existing || !existing.id){
            showMessage('수정 대상 행을 찾을 수 없습니다.', '오류');
            return;
        }
        const actorUserId = await ensureActorUserId();
        if(!actorUserId){
            showMessage('로그인 정보가 확인되지 않습니다. (세션 만료 가능)', '안내');
            throw new Error('actor_user_id_missing');
        }
        const payload = buildUpdatePayloadFromForm(data, actorUserId);
        const updated = await apiFetchJson(`${ACCESS_SYSTEM_API_BASE}/${existing.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        state.data[index] = normalizeRowFromApi(updated);
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
    const filename = `access_system_list_${yyyy}${mm}${dd}.csv`;
        const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
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
            // anchors navigate; no JS tab switching needed here
        });
        // Initialize search UI state
        updateClearVisibility();
        const searchInput = document.getElementById(SEARCH_ID);
        const searchClear = document.getElementById(SEARCH_CLEAR_ID);
        if(searchInput){
            searchInput.addEventListener('input', (e)=>{
                const val = e.target.value || '';
                // Persist raw string; filtering handles tokenization
                state.search = val;
                // Debounce to avoid excessive re-render while typing
                if(searchDebounceTimer) clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(()=>{ applyFilter(); }, 120);
                updateClearVisibility();
            });
            // ESC clears search and resets
            searchInput.addEventListener('keydown', (e)=>{
                if(e.key === 'Escape'){
                    e.preventDefault();
                    searchInput.value = '';
                    state.search = '';
                    applyFilter();
                    updateClearVisibility();
                }
            });
        }
        if(searchClear){
            searchClear.addEventListener('click', ()=>{
                if(searchInput) searchInput.value = '';
                state.search = '';
                applyFilter();
                updateClearVisibility();
                searchInput?.focus();
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
        // utility: current date-time in 'YYYY-MM-DD HH:mm'
        function nowYmdHm(){
            const d = new Date();
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth()+1).padStart(2,'0');
            const dd = String(d.getDate()).padStart(2,'0');
            const hh = String(d.getHours()).padStart(2,'0');
            const mi = String(d.getMinutes()).padStart(2,'0');
            return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
        }
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
                    // no special live-sync/datepickers needed for access form
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
    document.getElementById(ADD_BTN_ID)?.addEventListener('click', ()=> { populateAddModalSearchSelects(); openModal(ADD_MODAL_ID); });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(ADD_FORM_ID); if(!form.checkValidity()){ form.reportValidity(); return; }
            const data = collectForm(form);
            // Required checks (redundant to required attribute but keeps consistent)
            if(!data.work_name){ showMessage('업무 이름은 필수입니다.', '입력 오류'); return; }
            if(!data.system_name){ showMessage('시스템 이름은 필수입니다.', '입력 오류'); return; }
            // Uniqueness: serial must be unique (if provided)
            if(data.serial){
                const dup = state.data.some(r=> String(r.serial||'').trim() === data.serial);
                if(dup){ showMessage('시스템 일련번호는 고유해야 합니다. 이미 존재합니다.', '입력 오류'); return; }
            }
            const btn = document.getElementById(ADD_SAVE_ID);
            if(btn) btn.disabled = true;
            try{
                await addRow(data);
                form.reset();
                closeModal(ADD_MODAL_ID);
            }catch(e){
                showMessage(e?.message || '등록 중 오류가 발생했습니다.', '오류');
            }finally{
                if(btn) btn.disabled = false;
            }
        });
        // edit modal
    document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(EDIT_FORM_ID);
            const indexEl = document.getElementById(EDIT_SAVE_ID);
            const index = parseInt(indexEl?.getAttribute('data-index')||'-1',10);
            const data = collectForm(form);
            // Required and uniqueness checks
            if(!data.work_name){ showMessage('업무 이름은 필수입니다.', '입력 오류'); return; }
            if(!data.system_name){ showMessage('시스템 이름은 필수입니다.', '입력 오류'); return; }
            if(data.serial){
                const currentId = state.data[index]?.id;
                const dup = state.data.some(r=> r.id !== currentId && String(r.serial||'').trim() === data.serial);
                if(dup){ showMessage('시스템 일련번호는 고유해야 합니다. 이미 존재합니다.', '입력 오류'); return; }
            }
            const btn = document.getElementById(EDIT_SAVE_ID);
            if(btn) btn.disabled = true;
            try{
                await updateRow(index, data);
                closeModal(EDIT_MODAL_ID);
            }catch(e){
                showMessage(e?.message || '수정 중 오류가 발생했습니다.', '오류');
            }finally{
                if(btn) btn.disabled = false;
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
                // Set reasonable column widths
                wsTemplate['!cols'] = UPLOAD_HEADERS_KO.map((h)=>{
                        const wide = ['성명','출입일시','퇴실일시','출입구역','물품장비','비고'];
                        const mid = ['소속','사번/번호','출입목적','담당관리자','출입관리자'];
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
                    ['- "물품수량"은 숫자만 입력하세요.'],
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
                XLSX.writeFile(wb, 'access_registration_upload_template.xlsx');
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
                        // Validation rules (access): goods_qty numeric
                        ['goods_qty'].forEach(k=>{
                            if(rec[k] !== '' && !isIntegerLike(rec[k])) errors.push(`Row ${r+1}: ${COLUMN_META[k]?.label||k}는 숫자만 입력하세요.`);
                        });
                        // Normalize numbers
                        rec.goods_qty = toIntOrBlank(rec.goods_qty);
                        imported.push(rec);
                    }
                    if(errors.length){
                        const preview = errors.slice(0, 20).join('\n');
                        const more = errors.length>20 ? `\n...외 ${errors.length-20}건` : '';
                        showMessage(`업로드 실패: 유효성 검사 오류가 있습니다.\n\n${preview}${more}`, '업로드 실패');
                        return;
                    }
                    // Import rows (persist via API)
                    const btn = document.getElementById(UPLOAD_CONFIRM_ID);
                    if(btn) btn.disabled = true;
                    try{
                        for(const item of imported){
                            await addRow(item);
                        }
                        showMessage(`${imported.length}개 행이 업로드되었습니다.`, '업로드 완료');
                        closeModal(UPLOAD_MODAL_ID);
                    }catch(e){
                        showMessage(e?.message || '업로드 저장 중 오류가 발생했습니다.', '업로드 오류');
                    }finally{
                        if(btn) btn.disabled = false;
                    }
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
            const originals = state.data.filter(r=> state.selected.has(r.id));
            if(!originals.length){ showMessage('선택된 행을 찾을 수 없습니다.', '오류'); closeModal('system-duplicate-modal'); return; }
            const clones = originals.map(o=>{
                const copy = {...o};
                delete copy.id; // new id assigned
                copy.name = copy.name ? copy.name + '_COPY' : copy.name;
                return copy;
            });
            const btn = document.getElementById('system-duplicate-confirm');
            if(btn) btn.disabled = true;
            try{
                for(const c of clones){
                    await addRow(c);
                }
                closeModal('system-duplicate-modal');
                showMessage(clones.length + '개 행이 복제되었습니다.', '완료');
            }catch(e){
                showMessage(e?.message || '복제 중 오류가 발생했습니다.', '오류');
            }finally{
                if(btn) btn.disabled = false;
            }
        });
        // delete (삭제처리)
        document.getElementById(DELETE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('삭제처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('delete-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 출입 시스템을 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', async ()=>{
            const ids = [...state.selected];
            if(!ids.length){ closeModal(DELETE_MODAL_ID); return; }
            const btn = document.getElementById(DELETE_CONFIRM_ID);
            if(btn) btn.disabled = true;
            try{
                const actorUserId = await ensureActorUserId();
                if(!actorUserId){
                    showMessage('로그인 정보가 확인되지 않습니다. (세션 만료 가능)', '안내');
                    return;
                }
                await apiFetchJson(`${ACCESS_SYSTEM_API_BASE}/bulk-delete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids, deleted_by: actorUserId })
                });
                state.selected.clear();
                await initData();
                closeModal(DELETE_MODAL_ID);
                showMessage(`${ids.length}개 항목이 삭제되었습니다.`, '완료');
            }catch(e){
                showMessage(e?.message || '삭제 중 오류가 발생했습니다.', '오류');
            }finally{
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
                // no special live-sync/datepickers needed for access form
                const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                if(editSaveEl){ editSaveEl.setAttribute('data-index', realIndex); }
                return;
            }
            // 2개 이상 → 일괄변경 모달
            const subtitle = document.getElementById('bulk-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 출입 시스템에서 지정한 필드를 일괄 변경합니다.`; }
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
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ [ADD_MODAL_ID,EDIT_MODAL_ID,COLUMN_MODAL_ID,DISPOSE_MODAL_ID,DELETE_MODAL_ID,BULK_MODAL_ID,UPLOAD_MODAL_ID,'system-download-modal','system-message-modal','system-duplicate-modal'].forEach(closeModal); }});
    // include stats modal in esc close
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeModal(STATS_MODAL_ID); }});

        // message modal bindings
        document.getElementById('system-message-close')?.addEventListener('click', ()=> closeModal('system-message-modal'));
        document.getElementById('system-message-ok')?.addEventListener('click', ()=> closeModal('system-message-modal'));

    function buildBulkForm(){
        const form = document.getElementById(BULK_FORM_ID); if(!form) return;
        function inputFor(col){
            if(col === 'work_status') return `<select class="form-input" data-bulk-field="work_status"><option value="">선택</option><option value="가동">가동</option><option value="대기">대기</option><option value="유휴">유휴</option></select>`;
            if(col === 'location_place') return `<select class="form-input" data-bulk-field="location_place"><option value="">선택</option><option value="퓨처센터(5층)">퓨처센터(5층)</option><option value="퓨처센터(6층)">퓨처센터(6층)</option><option value="퓨처센터(5/6층)">퓨처센터(5/6층)</option><option value="을지트윈타워(15층)">을지트윈타워(15층)</option><option value="재해복구센터(4층)">재해복구센터(4층)</option></select>`;
            return `<input class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }
        const GROUPS = [
            { title:'비즈니스', cols:['work_status','work_name','system_name','system_ip','manage_ip'] },
            { title:'시스템', cols:['vendor','model','serial','location_place','location_pos'] },
            { title:'담당자', cols:['sys_dept','sys_owner','svc_dept','svc_owner'] }
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
        // 출입 섹션
        renderStatBlock('stats-software', '상태', countBy(rows, 'status'));
        renderStatBlock('stats-software', '출입구역', countBy(rows, 'entry_area'));
        // 요약 섹션
        renderStatBlock('stats-versions', '노트북사용', countBy(rows, 'laptop_use'), ['O','X'], { toggleOX:true });
        renderStatBlock('stats-versions', 'USB락사용', countBy(rows, 'usb_lock_use'), ['O','X'], { toggleOX:true });
        // 분포 섹션
        renderStatBlock('stats-check', '입출구분', countBy(rows, 'in_out_type'));
        renderStatBlock('stats-check', '물품구분', countBy(rows, 'goods_type'));
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
    // Enforce first render equals "초기화" state
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
        await initData();
        bindEvents();
        render();
        // Page adornments (animation + popover)
}
    if(document.readyState==='loading'){
        document.addEventListener('DOMContentLoaded', ()=>{ init().catch((e)=> console.error(e)); });
    } else {
        init().catch((e)=> console.error(e));
    }
})();


