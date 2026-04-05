/**
 * 데이터센터 관리 페이지 스크립트
 * - 컬럼 토글 (기본 10개 노출)
 * - 로컬(in-memory) 데이터 렌더링 + 페이징 + 검색
 * - 모달 (등록/수정/컬럼 선택)
 * - CSV 다운로드 (현재 페이지 or 전체)
 * NOTE: 서버 연동 전 단계로 mock 데이터 사용
 */

(function(){
    // Mark body for Authority Control page to enable page-scoped CSS in center.css
    try { document.body.classList.add('page-authority-control'); } catch(_e){}
    // Flatpickr (calendar) loader and initializer
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
    const startEl = form.querySelector('[name="auth_start_date"]');
    const endEl = form.querySelector('[name="auth_end_date"]');
    const changedEl = form.querySelector('[name="auth_changed_date"]');
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
            clickOpens: true,
            appendTo: document.body,
            onReady: function(selectedDates, dateStr, instance){ ensureTodayButton(instance); },
            onOpen: function(selectedDates, dateStr, instance){ ensureTodayButton(instance); }
        };
        if(flatReady){
            if(startEl && !startEl.disabled){
                if(startEl.type === 'date'){ try{ startEl.type = 'text'; }catch(_){} }
                if(!startEl._flatpickr){ window.flatpickr(startEl, opts); }
            }
            if(endEl && !endEl.disabled){
                if(endEl.type === 'date'){ try{ endEl.type = 'text'; }catch(_){} }
                if(!endEl._flatpickr){ window.flatpickr(endEl, opts); }
            }
            if(changedEl && !changedEl.disabled){
                if(changedEl.type === 'date'){ try{ changedEl.type = 'text'; }catch(_){} }
                if(!changedEl._flatpickr){ window.flatpickr(changedEl, opts); }
            }
        } else {
            // Fallback: use native date input if flatpickr is unavailable (offline, CDN blocked, etc.)
            if(startEl && !startEl.disabled){ try{ startEl.type = 'date'; }catch(_){} }
            if(endEl && !endEl.disabled){ try{ endEl.type = 'date'; }catch(_){} }
            if(changedEl && !changedEl.disabled){ try{ changedEl.type = 'date'; }catch(_){} }
        }
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

    // Data + State
    // 기본 고정 컬럼 (동적 zone 컬럼은 API에서 로드 후 추가)
    const FIXED_VISIBLE_COLUMNS = [
        'status','affiliation','name','employee_type','access_level'
    ];
    const FIXED_COLUMN_ORDER = [
        'status','affiliation','name','employee_type','access_level','note','auth_start_date','auth_end_date','auth_changed_date'
    ];
    const FIXED_COLUMN_META = {
        status:{label:'상태',group:'권한 관리'},
        affiliation:{label:'부서',group:'권한 관리'},
        name:{label:'이름',group:'권한 관리'},
        employee_type:{label:'구분',group:'권한 관리'},
        access_level:{label:'수준',group:'권한 관리'},
        note:{label:'비고',group:'권한 관리'},
        auth_start_date:{label:'권한시작일',group:'권한 관리'},
        auth_end_date:{label:'권한종료일',group:'권한 관리'},
        auth_changed_date:{label:'권한변경일',group:'권한 관리'}
    };

    // 동적 zone 데이터 (API에서 로드)
    let zoneList = []; // [{id, zone_name, zone_key, sort_order}]
    let BASE_VISIBLE_COLUMNS = [...FIXED_VISIBLE_COLUMNS];
    let COLUMN_ORDER = [...FIXED_COLUMN_ORDER];
    let COLUMN_MODAL_GROUPS = [
        { group: '권한 관리', columns: [...FIXED_COLUMN_ORDER] },
        { group: '권한 구역', columns: [] }
    ];
    let COLUMN_META = Object.assign({}, FIXED_COLUMN_META);

    const ZONES_API_BASE = '/api/datacenter/access/zones';

    function rebuildZoneColumns(){
        // zone 목록으로 동적 컬럼 재구성
        const zoneKeys = zoneList.map(z => z.zone_key);
        COLUMN_ORDER = [...FIXED_COLUMN_ORDER, ...zoneKeys];
        BASE_VISIBLE_COLUMNS = [...FIXED_VISIBLE_COLUMNS, ...zoneKeys];
        COLUMN_META = Object.assign({}, FIXED_COLUMN_META);
        zoneKeys.forEach((key, i) => {
            COLUMN_META[key] = { label: zoneList[i].zone_name, group: '권한 구역' };
        });
        COLUMN_MODAL_GROUPS = [
            { group: '권한 관리', columns: [...FIXED_COLUMN_ORDER] },
            { group: '권한 구역', columns: [...zoneKeys] }
        ];
        // 테이블 헤더에 동적 zone <th> 삽입
        rebuildZoneHeaders();
        // 추가 모달의 구역 그리드 재구성
        rebuildAddFormZoneGrid();
    }

    function rebuildZoneHeaders(){
        const thead = document.querySelector('#' + TABLE_ID + ' thead tr');
        if(!thead) return;
        // 기존 동적 zone th 제거
        thead.querySelectorAll('th[data-zone-dynamic]').forEach(th => th.remove());
        // actions th 앞에 삽입
        const actionsTh = thead.querySelector('th[data-col="actions"]');
        zoneList.forEach(z => {
            const th = document.createElement('th');
            th.setAttribute('data-col', z.zone_key);
            th.setAttribute('data-zone-dynamic', '1');
            // 이름에 공백이 있으면 <br>로 줄바꿈
            const parts = z.zone_name.split(' ');
            if(parts.length >= 2){
                th.innerHTML = parts.slice(0, -1).join(' ') + '<br>' + parts[parts.length - 1];
            } else {
                th.textContent = z.zone_name;
            }
            thead.insertBefore(th, actionsTh);
        });
    }

    function rebuildAddFormZoneGrid(){
        const grid = document.getElementById('add-form-zone-grid');
        if(!grid) return;
        grid.innerHTML = '';
        zoneList.forEach(z => {
            const row = document.createElement('div');
            row.className = 'form-row';
            row.innerHTML = '<label>' + escapeHTML(z.zone_name) + '</label>' +
                '<select name="' + z.zone_key + '" class="form-input search-select" data-placeholder="선택">' +
                '<option value="">선택</option><option value="O">O</option><option value="X">X</option></select>';
            grid.appendChild(row);
        });
    }

    async function loadZones(){
        try {
            const zones = await apiFetchJson(ZONES_API_BASE + '?_=' + Date.now(), { method: 'GET' });
            zoneList = Array.isArray(zones) ? zones : [];
        } catch(e){
            console.warn('Failed to load zones', e);
            zoneList = [];
        }
        rebuildZoneColumns();
    }

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

    // ---- API wiring (access_permission) ----
    const PERMISSIONS_API_BASE = '/api/datacenter/access/permissions';
    const ORG_DEPARTMENTS_API = '/api/org-departments';
    const USER_PROFILES_API = '/api/user-profiles';

    let orgDepartmentsCache = null; // [{id, dept_name, ...}]
    const deptNameToId = new Map();
    const userProfilesByDeptId = new Map(); // deptId -> [{id, name, department_id, ...}]
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

    async function ensureOrgDepartments(){
        if(Array.isArray(orgDepartmentsCache)) return orgDepartmentsCache;
        const res = await apiFetchJson(`${ORG_DEPARTMENTS_API}?include_deleted=false`, { method: 'GET' });
        const items = res?.items || res?.data?.items || [];
        orgDepartmentsCache = Array.isArray(items) ? items : [];
        deptNameToId.clear();
        orgDepartmentsCache.forEach((d)=>{
            const name = String(d?.dept_name || d?.deptName || '').trim();
            const id = parseInt(d?.id, 10);
            if(name && Number.isFinite(id)) deptNameToId.set(name, id);
        });
        return orgDepartmentsCache;
    }

    async function ensureUserProfilesForDeptId(deptId){
        const key = String(deptId || '');
        if(!key) return [];
        if(userProfilesByDeptId.has(key)) return userProfilesByDeptId.get(key);
        const url = `${USER_PROFILES_API}?department_id=${encodeURIComponent(key)}&limit=2000`;
        const res = await apiFetchJson(url, { method: 'GET' });
        const items = res?.items || res?.data?.items || [];
        const list = Array.isArray(items) ? items : [];
        userProfilesByDeptId.set(key, list);
        return list;
    }

    function _syncSearchableSelectsIn(container){
        try{
            if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
                window.BlossomSearchableSelect.syncAll(container || document);
            }
        }catch(_e){}
    }

    function _ensureSelectHasPlaceholder(selectEl){
        if(!(selectEl instanceof HTMLSelectElement)) return;
        const first = selectEl.options && selectEl.options[0];
        if(first && first.value === '') return;
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '선택';
        selectEl.insertBefore(opt, selectEl.firstChild);
    }

    function _clearSelectOptions(selectEl){
        if(!(selectEl instanceof HTMLSelectElement)) return;
        const keepFirst = (selectEl.options && selectEl.options.length && selectEl.options[0].value === '') ? 1 : 0;
        while(selectEl.options.length > keepFirst){
            selectEl.remove(keepFirst);
        }
    }

    function _ensureOption(selectEl, value, label){
        if(!(selectEl instanceof HTMLSelectElement)) return;
        const v = String(value ?? '');
        const exists = Array.from(selectEl.options || []).some(o => String(o.value) === v);
        if(exists) return;
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = String(label ?? v);
        selectEl.appendChild(opt);
    }

    function _getSelectedDeptIdFromSelect(deptSelect){
        const name = String(deptSelect?.value || '').trim();
        if(!name) return null;
        const id = deptNameToId.get(name);
        return Number.isFinite(id) ? id : null;
    }

    function _resolveUserIdFromForm(form){
        const deptSelect = form.querySelector('select[name="affiliation"]');
        const userSelect = form.querySelector('select[name="name"]');
        const deptId = _getSelectedDeptIdFromSelect(deptSelect);
        const userName = String(userSelect?.value || '').trim();
        if(!deptId || !userName) return null;
        const users = userProfilesByDeptId.get(String(deptId)) || [];
        const u = users.find(p => String(p?.name || '').trim() === userName);
        return u ? Number(u.id) : null;
    }

    function _injectResolvedIds(form, data){
        const deptSelect = form.querySelector('select[name="affiliation"]');
        const deptId = _getSelectedDeptIdFromSelect(deptSelect);
        if(deptId) data.department_id = deptId;
        const userId = _resolveUserIdFromForm(form);
        if(userId) data.user_id = userId;
    }

    async function wireDeptUserControls(container, initial){
        const root = container || document;
        const deptSelect = root.querySelector('select[name="affiliation"], select[data-bulk-field="affiliation"]');
        const userSelect = root.querySelector('select[name="name"], select[data-bulk-field="name"]');
        if(!(deptSelect instanceof HTMLSelectElement) || !(userSelect instanceof HTMLSelectElement)) return;

        _ensureSelectHasPlaceholder(deptSelect);
        _ensureSelectHasPlaceholder(userSelect);

        // Populate department list
        await ensureOrgDepartments().catch(()=>[]);
        _clearSelectOptions(deptSelect);
        (orgDepartmentsCache || []).forEach((d)=>{
            const name = String(d?.dept_name || d?.deptName || '').trim();
            if(!name) return;
            _ensureOption(deptSelect, name, name);
        });

        const initialAff = String(initial?.affiliation || '').trim();
        if(initialAff){
            _ensureOption(deptSelect, initialAff, initialAff);
            deptSelect.value = initialAff;
        }

        const initialName = String(initial?.name || '').trim();
        let didApplyInitialName = false;

        async function refreshUsers(){
            const deptId = _getSelectedDeptIdFromSelect(deptSelect);
            _clearSelectOptions(userSelect);
            if(!deptId){
                userSelect.value = '';
                userSelect.disabled = true;
                _syncSearchableSelectsIn(root);
                return;
            }

            userSelect.disabled = false;
            const users = await ensureUserProfilesForDeptId(deptId).catch(()=>[]);
            users.forEach((u)=>{
                const name = String(u?.name || '').trim();
                if(!name) return;
                _ensureOption(userSelect, name, name);
            });

            if(!didApplyInitialName && initialName){
                didApplyInitialName = true;
                _ensureOption(userSelect, initialName, initialName);
                userSelect.value = initialName;
            }

            _syncSearchableSelectsIn(root);
        }

        if(deptSelect.dataset.deptUserWired !== '1'){
            deptSelect.dataset.deptUserWired = '1';
            deptSelect.addEventListener('change', ()=>{
                // changing dept clears name selection
                userSelect.value = '';
                refreshUsers().catch(()=>{});
            });
        }

        await refreshUsers();
        _syncSearchableSelectsIn(root);
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

    async function loadPermissionsFromApi(){
        const items = await apiFetchJson(`${PERMISSIONS_API_BASE}?_=${Date.now()}`, { method: 'GET' });
        const arr = Array.isArray(items) ? items : [];
        // API returns both permission_id and id alias. UI uses id.
        state.data = arr.map((r)=>{
            const id = r && (r.id ?? r.permission_id);
            return Object.assign({}, r, { id: Number(id) });
        }).filter(r=> Number.isFinite(r.id) && r.id > 0);
        state.selected.clear();
        state.nextId = (state.data.reduce((m, r)=> Math.max(m, Number(r.id)||0), 0) || 0) + 1;
        applyFilter();
    }

    // 권한 등록 페이지: 샘플 데이터 5개 제공
    function mockData(count=5){
        const rows = [
            { id: 1, status: '활성', name: '홍길동', affiliation: '인프라팀', employee_type: '내부직원', access_level: '상시출입', note: '', auth_start_date: '', auth_end_date: '', auth_changed_date: '', zone_futurecenter_dc: 'O', zone_futurecenter_ops: 'O', zone_eulji_dc: 'X', zone_drs_dc: 'X' },
            { id: 2, status: '활성', name: '김철수', affiliation: '개발1팀', employee_type: '협력직원', access_level: '임시출입', note: '테스트', auth_start_date: '2025-08-01', auth_end_date: '2025-08-31', auth_changed_date: '2025-08-15', zone_futurecenter_dc: 'O', zone_futurecenter_ops: 'X', zone_eulji_dc: 'O', zone_drs_dc: 'X' },
            { id: 3, status: '만료', name: '이영희', affiliation: '플랫폼팀', employee_type: '외부직원', access_level: '임시출입', note: '', auth_start_date: '2025-07-01', auth_end_date: '2025-07-31', auth_changed_date: '', zone_futurecenter_dc: 'X', zone_futurecenter_ops: 'O', zone_eulji_dc: 'X', zone_drs_dc: 'O' },
            { id: 4, status: '활성', name: '박보라', affiliation: '보안팀', employee_type: '내부직원', access_level: '상시출입', note: '', auth_start_date: '', auth_end_date: '', auth_changed_date: '2025-05-10', zone_futurecenter_dc: 'O', zone_futurecenter_ops: 'O', zone_eulji_dc: 'O', zone_drs_dc: 'O' },
            { id: 5, status: '만료', name: '최가을', affiliation: 'DB운영팀', employee_type: '협력직원', access_level: '임시출입', note: '프로젝트 종료', auth_start_date: '2025-06-01', auth_end_date: '2025-06-30', auth_changed_date: '2025-06-15', zone_futurecenter_dc: 'X', zone_futurecenter_ops: 'X', zone_eulji_dc: 'X', zone_drs_dc: 'X' }
        ];
        return rows.slice(0, Math.max(0, count|0));
    }

    function initData(){
        // Start empty; load from API (persisted DB) instead of mock data.
        state.data = [];
        state.nextId = 1;
        applyFilter();
        loadPermissionsFromApi().catch((e)=>{
            console.warn('Failed to load access permissions', e);
            showMessage('권한 등록 데이터를 불러오지 못했습니다. (API 연동 확인 필요)', '오류');
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
    // 권한 등록: 특수 상태 필터 없음
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

    // ---- Effective status helpers ----
    function parseYmd(str){
        if(!str || typeof str !== 'string') return null;
        const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if(!m) return null;
        const y = parseInt(m[1],10), mo = parseInt(m[2],10)-1, d = parseInt(m[3],10);
        const dt = new Date(y, mo, d);
        return (dt instanceof Date && !isNaN(dt)) ? dt : null;
    }
    function isExpired(dateStr){
        const dt = parseYmd(dateStr);
        if(!dt) return false;
        const today = new Date(); today.setHours(0,0,0,0);
        return dt < today;
    }
    function computeEffectiveStatus(row){
        try{
            if(isExpired(row.auth_end_date)) return '만료';
        }catch(_e){}
        return String(row.status ?? '').trim() || '';
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
                if(k === 'status'){ va = computeEffectiveStatus(a); vb = computeEffectiveStatus(b); }
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
                    const displayVal = (rawVal==null || String(rawVal).trim()==='') ? '-' : rawVal;
                    let cellValue = highlight(displayVal, col);
                    // 상태 배지 표시 (활성/만료)
                    if(col === 'status'){
                        const eff = computeEffectiveStatus(row) || displayVal;
                        const v = String(eff);
                        let cls = (v === '만료') ? 'ws-idle' : 'ws-run';
                        const text = highlight(v, col);
                        cellValue = `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${text||'-'}</span></span>`;
                    }
                    // 권한 구역 O/X (동적 zone)
                    if(col.startsWith('zone_')){
                        const ox = String(row[col] ?? '').trim();
                        const badge = `<span class="ox-badge ${ox==='O'?'on':'off'}">${ox||'-'}</span>`;
                        cellValue = `<span class="cell-ox with-badge">${badge}</span>`;
                    }
                    // 권한종료일 만료/임박/여유 점 표시 (서버 EOSL 스타일)
                    if(col === 'auth_end_date'){
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
                                    dotColor = accent; // >=1 month
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

    // Date helper: YYYY-MM-DD (local)
    function todayYmd(){
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth()+1).padStart(2,'0');
        const dd = String(d.getDate()).padStart(2,'0');
        return `${yyyy}-${mm}-${dd}`;
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
        const MIN_COLS = 6;
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
            { title:'권한 관리', cols:['status','affiliation','name','employee_type','access_level','note','auth_start_date','auth_end_date','auth_changed_date'] },
            { title:'권한 구역', cols: zoneList.map(z => z.zone_key) }
        ];
        groups.forEach(g=>{
            const section = document.createElement('div'); section.className='form-section';
            section.innerHTML = `<div class="section-header"><h4>${g.title}</h4></div>`;
            const grid = document.createElement('div'); grid.className='form-grid';
            g.cols.forEach(c=>{ if(!COLUMN_META[c]) return; const wrap=document.createElement('div');
                // All fields use standard size rows (no wide row for 'note')
                wrap.className = 'form-row';
                const labelText = COLUMN_META[c]?.label||c;
                wrap.innerHTML=`<label>${labelText}</label>${generateFieldInput(c,row[c])}`; grid.appendChild(wrap); });
            section.appendChild(grid); form.appendChild(section);
        });
        enforceAuthDateFieldsEnabledByVisibleCols(EDIT_FORM_ID);
        attachAccessLevelToggle(EDIT_FORM_ID);
        initDatePickers(EDIT_FORM_ID);
        wireDeptUserControls(form, { affiliation: row?.affiliation, name: row?.name }).catch(()=>{});
    }

    function generateFieldInput(col,value=''){
        if(col==='status'){
            const v = String(value??'');
            return `<select name="status" class="form-input search-select" data-searchable="true" data-placeholder="선택">
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="활성" ${v==='활성'?'selected':''}>활성</option>
                <option value="만료" ${v==='만료'?'selected':''}>만료</option>
            </select>`;
        }
        if(col==='employee_type'){
            const v = String(value??'');
            const opts = ['', '내부직원','협력직원','외부직원'];
            return `<select name="employee_type" class="form-input search-select" data-searchable="true" data-placeholder="선택">${opts.map(o=>`<option value="${o}" ${o===v?'selected':''}>${o===''?'선택':o}</option>`).join('')}</select>`;
        }
        if(col==='access_level'){
            const v = String(value??'');
            const opts = ['', '상시출입','임시출입'];
            return `<select name="access_level" class="form-input search-select" data-searchable="true" data-placeholder="선택">${opts.map(o=>`<option value="${o}" ${o===v?'selected':''}>${o===''?'선택':o}</option>`).join('')}</select>`;
        }
        if(col==='auth_start_date' || col==='auth_end_date'){
            const v = String(value??'');
            // Always render enabled so users can select; visibility still controls table columns
            return `<input name="${col}" class="form-input" value="${v}" placeholder="YYYY-MM-DD">`;
        }
        if(col==='auth_changed_date'){
            const v = String(value??'');
            // Read-only locked field
            return `<input name="auth_changed_date" class="form-input" value="${v}" placeholder="YYYY-MM-DD" disabled readonly>`;
        }
        if(col.startsWith('zone_')){
            const v = String(value??'');
            return `<select name="${col}" class="form-input search-select" data-searchable="true" data-placeholder="선택"><option value="">선택</option><option value="O" ${v==='O'?'selected':''}>O</option><option value="X" ${v==='X'?'selected':''}>X</option></select>`;
        }
        if(col==='affiliation'){
            const v = String(value??'');
            return `<select name="affiliation" class="form-input search-select" data-searchable="true" data-placeholder="선택">
                <option value="">선택</option>
                ${v?`<option value="${escapeHTML(v)}" selected>${escapeHTML(v)}</option>`:''}
            </select>`;
        }
        if(col==='name'){
            const v = String(value??'');
            return `<select name="name" class="form-input search-select" data-searchable="true" data-placeholder="선택" disabled>
                <option value="">선택</option>
                ${v?`<option value="${escapeHTML(v)}" selected>${escapeHTML(v)}</option>`:''}
            </select>`;
        }
        if(col==='note') return `<input name="note" class="form-input" value="${value??''}">`;
        return `<input name="${col}" class="form-input" value="${value??''}">`;
    }

    function attachAccessLevelToggle(formId){
        const form = document.getElementById(formId); if(!form) return;
        const levelSel = form.querySelector('[name="access_level"]');
        function apply(){
            enforceAuthDateFieldsEnabledByVisibleCols(formId);
            initDatePickers(formId);
        }
        levelSel?.addEventListener('change', apply);
        apply();
    }

    function enforceAuthDateFieldsEnabledByVisibleCols(formId){
        const form = document.getElementById(formId); if(!form) return;
        const startEl = form.querySelector('[name="auth_start_date"]');
        const endEl = form.querySelector('[name="auth_end_date"]');
        // Always enable for selection; save-time logic will clear when not 임시출입
        if(startEl){ startEl.disabled = false; startEl.readOnly = false; try{ startEl.removeAttribute('disabled'); startEl.removeAttribute('readonly'); }catch(_){} }
        if(endEl){ endEl.disabled = false; endEl.readOnly = false; try{ endEl.removeAttribute('disabled'); endEl.removeAttribute('readonly'); }catch(_){} }
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
        // Prefer server-assigned ids. If missing (should be rare), fall back to local id.
        if(data && (data.id == null || !Number.isFinite(Number(data.id)))){
            data.id = state.nextId++;
        }else{
            data.id = Number(data.id);
            if(Number.isFinite(data.id)) state.nextId = Math.max(state.nextId, data.id + 1);
        }
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
    const rows = dataForCsv.map((r,i)=> [i+1, ...visibleCols.map(c=> c==='status' ? (computeEffectiveStatus(r) || '') : (r[c]??''))]);
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
    const filename = `authority_registration_list_${yyyy}${mm}${dd}.csv`;
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
                    attachAccessLevelToggle(EDIT_FORM_ID);
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
    document.getElementById(ADD_BTN_ID)?.addEventListener('click', async ()=> {
        openModal(ADD_MODAL_ID);
        enforceAuthDateFieldsEnabledByVisibleCols(ADD_FORM_ID);
        attachAccessLevelToggle(ADD_FORM_ID);
        initDatePickersSafe();
        const form = document.getElementById(ADD_FORM_ID);
        if(form){
            await wireDeptUserControls(form, { affiliation: form.querySelector('[name="affiliation"]')?.value, name: form.querySelector('[name="name"]')?.value }).catch(()=>{});
        }
    });
    function initDatePickersSafe(){ try{ initDatePickers(ADD_FORM_ID); }catch(_e){} }
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(ADD_FORM_ID); if(!form.checkValidity()){ form.reportValidity(); return; }
            // Set change date at submission time (read-only field)
            const changedEl = form.querySelector('[name="auth_changed_date"]');
            if(changedEl){ changedEl.value = todayYmd(); }
            const data = collectForm(form);
            _injectResolvedIds(form, data);
            zoneList.forEach(z => { if(data[z.zone_key]) data[z.zone_key] = data[z.zone_key].toUpperCase(); });
            if(data.access_level !== '임시출입'){
                data.auth_start_date = '';
                data.auth_end_date = '';
            }
            try{
                const actorId = await ensureActorUserId().catch(()=> null);
                const created = await apiFetchJson(PERMISSIONS_API_BASE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(Object.assign({}, data, actorId ? { actor_user_id: actorId } : {}))
                });
                addRow(created);
                form.reset();
                closeModal(ADD_MODAL_ID);
                setTimeout(()=> showMessage('등록이 완료되었습니다.', '완료'), 0);
            }catch(e){
                console.error(e);
                showMessage(`등록 실패: ${e?.message || '오류가 발생했습니다.'}`, '오류');
            }
        });
        // edit modal
    document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(EDIT_FORM_ID);
            const indexEl = document.getElementById(EDIT_SAVE_ID);
            const index = parseInt(indexEl?.getAttribute('data-index')||'-1',10);
            // Set change date on save
            const changedEl = form.querySelector('[name="auth_changed_date"]');
            if(changedEl){ changedEl.value = todayYmd(); }
            const data = collectForm(form);
            _injectResolvedIds(form, data);
            zoneList.forEach(z => { if(data[z.zone_key]) data[z.zone_key] = data[z.zone_key].toUpperCase(); });
            if(data.access_level !== '임시출입'){
                data.auth_start_date = '';
                data.auth_end_date = '';
            }
            const existing = state.data[index];
            const id = existing && existing.id ? Number(existing.id) : null;
            if(!id){ showMessage('수정할 행을 찾을 수 없습니다.', '오류'); return; }
            try{
                const actorId = await ensureActorUserId();
                if(!actorId){ showMessage('수정 권한 확인에 실패했습니다. 다시 로그인 후 시도하세요.', '오류'); return; }
                const updated = await apiFetchJson(`${PERMISSIONS_API_BASE}/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(Object.assign({}, data, { actor_user_id: actorId }))
                });
                updateRow(index, updated);
                closeModal(EDIT_MODAL_ID);
                setTimeout(()=> showMessage('수정이 완료되었습니다.', '완료'), 0);
            }catch(e){
                console.error(e);
                showMessage(`수정 실패: ${e?.message || '오류가 발생했습니다.'}`, '오류');
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
            try{
                const actorId = await ensureActorUserId().catch(()=> null);
                let ok = 0;
                for(const c of clones){
                    try{
                        await apiFetchJson(PERMISSIONS_API_BASE, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(Object.assign({}, c, actorId ? { actor_user_id: actorId } : {}))
                        });
                        ok += 1;
                    }catch(e){ console.error('Duplicate create failed', e); }
                }
                await loadPermissionsFromApi().catch(()=>{});
                closeModal('system-duplicate-modal');
                showMessage(ok + '개 행이 복제되었습니다.', '완료');
            }catch(e){
                console.error(e);
                showMessage(`복제 실패: ${e?.message || '오류가 발생했습니다.'}`, '오류');
            }
        });
        // delete (삭제처리)
        document.getElementById(DELETE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('삭제처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('delete-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 출입 등록을 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', async ()=>{
            const ids = Array.from(state.selected || []);
            if(!ids.length){ closeModal(DELETE_MODAL_ID); return; }
            try{
                const actorId = await ensureActorUserId();
                if(!actorId){ showMessage('삭제 권한 확인에 실패했습니다. 다시 로그인 후 시도하세요.', '오류'); return; }
                await apiFetchJson(`${PERMISSIONS_API_BASE}/bulk-delete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids, actor_user_id: actorId })
                });
                state.selected.clear();
                await loadPermissionsFromApi().catch(()=>{});
                closeModal(DELETE_MODAL_ID);
                setTimeout(()=> showMessage(`${ids.length}개 항목이 삭제되었습니다.`, '완료'), 0);
            }catch(e){
                console.error(e);
                showMessage(`삭제 실패: ${e?.message || '오류가 발생했습니다.'}`, '오류');
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
                attachAccessLevelToggle(EDIT_FORM_ID);
                initDatePickers(EDIT_FORM_ID);
                const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                if(editSaveEl){ editSaveEl.setAttribute('data-index', realIndex); }
                return;
            }
            // 2개 이상 → 일괄변경 모달
            const subtitle = document.getElementById('bulk-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 권한 등록에서 지정한 필드를 일괄 변경합니다.`; }
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
            const ids = Array.from(state.selected || []);
            try{
                const actorId = await ensureActorUserId();
                if(!actorId){ showMessage('수정 권한 확인에 실패했습니다. 다시 로그인 후 시도하세요.', '오류'); return; }
                // Normalize O/X values
                entries.forEach((p)=>{
                    if(p.field.startsWith('zone_')){
                        p.value = String(p.value || '').toUpperCase();
                    }
                });
                for(const id of ids){
                    const payload = { actor_user_id: actorId };
                    entries.forEach(({field, value})=>{ payload[field] = value; });
                    await apiFetchJson(`${PERMISSIONS_API_BASE}/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }
                closeModal(BULK_MODAL_ID);
                state.selected.clear();
                await loadPermissionsFromApi().catch(()=>{});
                setTimeout(()=> showMessage(`${ids.length}개 항목에 일괄 변경이 적용되었습니다.`, '완료'), 0);
            }catch(e){
                console.error(e);
                showMessage(`일괄 변경 실패: ${e?.message || '오류가 발생했습니다.'}`, '오류');
            }
        });
        // esc close
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ [ADD_MODAL_ID,EDIT_MODAL_ID,COLUMN_MODAL_ID,DELETE_MODAL_ID,BULK_MODAL_ID,'system-download-modal','system-message-modal','system-duplicate-modal','system-zone-add-modal'].forEach(closeModal); }});
    // include stats modal in esc close
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeModal(STATS_MODAL_ID); }});

        // message modal bindings
        document.getElementById('system-message-close')?.addEventListener('click', ()=> closeModal('system-message-modal'));
        document.getElementById('system-message-ok')?.addEventListener('click', ()=> closeModal('system-message-modal'));

        // 장소추가 모달
        document.getElementById('system-zone-add-btn')?.addEventListener('click', ()=>{
            renderZoneList();
            openModal('system-zone-add-modal');
        });
        document.getElementById('system-zone-add-close')?.addEventListener('click', ()=> closeModal('system-zone-add-modal'));
        document.getElementById('system-zone-add-save')?.addEventListener('click', async ()=>{
            const form = document.getElementById('system-zone-add-form');
            if(!form) return;
            const nameInput = form.querySelector('[name="zone_name"]');
            const zoneName = (nameInput?.value || '').trim();
            if(!zoneName){
                return;
            }
            try {
                await apiFetchJson(ZONES_API_BASE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ zone_name: zoneName })
                });
                nameInput.value = '';
                // 구역 목록 리로드 → 컬럼 재구성 → 데이터 리로드
                await loadZones();
                // 컬럼 선택 상태 갱신
                state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
                saveColumnSelection();
                await loadPermissionsFromApi().catch(()=>{});
                renderZoneList();
            } catch(e){
                console.error(e);
            }
        });

    function renderZoneList(){
        const container = document.getElementById('zone-list-container');
        if(!container) return;
        if(!zoneList.length){
            container.innerHTML = '<p style="color:var(--text-muted,#888);padding:8px 0;">등록된 구역이 없습니다.</p>';
            return;
        }
        container.innerHTML = zoneList.map(z =>
            '<div class="zone-list-item" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border-color,#eee);">' +
            '<span>' + escapeHTML(z.zone_name) + '</span>' +
            '<button type="button" class="zone-delete-btn" data-zone-id="' + z.id + '" title="삭제" style="background:none;border:none;cursor:pointer;color:var(--text-muted,#888);padding:4px 8px;">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</button></div>'
        ).join('');
        container.querySelectorAll('.zone-delete-btn').forEach(btn => {
            btn.addEventListener('click', async ()=>{
                const zoneId = parseInt(btn.getAttribute('data-zone-id'), 10);
                if(!zoneId) return;
                try {
                    await apiFetchJson(ZONES_API_BASE + '/' + zoneId, { method: 'DELETE' });
                    await loadZones();
                    state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
                    saveColumnSelection();
                    await loadPermissionsFromApi().catch(()=>{});
                    renderZoneList();
                } catch(e){
                    console.error(e);
                }
            });
        });
    }

    function buildBulkForm(){
        const form = document.getElementById(BULK_FORM_ID); if(!form) return;
        function inputFor(col){
            if(col === 'status') return `<select class="form-input search-select" data-searchable="true" data-placeholder="선택" data-bulk-field="status"><option value="">선택</option><option value="활성">활성</option><option value="만료">만료</option></select>`;
            if(col === 'affiliation') return `<select class="form-input search-select" data-searchable="true" data-placeholder="선택" data-bulk-field="affiliation" name="affiliation"><option value="">선택</option></select>`;
            if(col === 'name') return `<select class="form-input search-select" data-searchable="true" data-placeholder="선택" data-bulk-field="name" name="name" disabled><option value="">선택</option></select>`;
            if(col === 'employee_type') return `<select class="form-input search-select" data-searchable="true" data-placeholder="선택" data-bulk-field="employee_type"><option value="">선택</option><option value="내부직원">내부직원</option><option value="협력직원">협력직원</option><option value="외부직원">외부직원</option></select>`;
            if(col === 'access_level') return `<select class="form-input search-select" data-searchable="true" data-placeholder="선택" data-bulk-field="access_level"><option value="">선택</option><option value="상시출입">상시출입</option><option value="임시출입">임시출입</option></select>`;
            if(col.startsWith('zone_')) return `<select class="form-input search-select" data-searchable="true" data-placeholder="선택" data-bulk-field="${col}"><option value="">선택</option><option value="O">O</option><option value="X">X</option></select>`;
            if(col === 'auth_start_date' || col === 'auth_end_date' || col === 'auth_changed_date') return `<input class="form-input" data-bulk-field="${col}" placeholder="YYYY-MM-DD">`;
            if(col === 'note') return `<input class="form-input" data-bulk-field="note" placeholder="설명">`;
            return `<input class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }
        const GROUPS = [
            { title:'권한 관리', cols:['status','affiliation','name','employee_type','access_level','note','auth_start_date','auth_end_date','auth_changed_date'] },
            { title:'권한 구역', cols: zoneList.map(z => z.zone_key) }
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
        wireDeptUserControls(form, {}).catch(()=>{});
        _syncSearchableSelectsIn(form);
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
        const rowsForStatus = rows.map(r=> ({ ...r, status: computeEffectiveStatus(r) }));
        renderStatBlock('stats-software', '상태', countBy(rowsForStatus, 'status'));
        renderStatBlock('stats-versions', '구분', countBy(rows, 'employee_type'));
        renderStatBlock('stats-versions', '수준', countBy(rows, 'access_level'));
        // 동적 구역 통계
        zoneList.forEach(z => {
            renderStatBlock('stats-check', z.zone_name, countBy(rows, z.zone_key, ['O','X']), ['O','X'], { toggleOX:true, hideZero:true });
        });
    }
    }

    // (조건 필터 관련 함수 제거됨)

    async function init(){
        // 1) 동적 구역 목록을 먼저 로드 (컬럼 메타 구성에 필요)
        await loadZones();
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
        initData();
        bindEvents();
        render();
        // Page adornments (animation + popover)
}
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', function(){ init(); }); else init();
})();


