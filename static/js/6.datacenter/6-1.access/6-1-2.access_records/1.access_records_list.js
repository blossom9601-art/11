/**
 * 데이터센터 관리 페이지 스크립트
 * - 컬럼 토글 (기본 10개 노출)
 * - 로컬(in-memory) 데이터 렌더링 + 페이징 + 검색
 * - 모달 (등록/수정/컬럼 선택)
 * - CSV 다운로드 (현재 페이지 or 전체)
 * NOTE: 서버 연동 전 단계로 mock 데이터 사용
 */

(function(){
    // Mark body for Access Records page to enable page-scoped CSS in center.css
    try { document.body.classList.add('page-access-records'); } catch(_e){}
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
    // Initialize Flatpickr datetime pickers for access record edit form
    async function initAccessDateTimePickers(formId){
        const form = document.getElementById(formId); if(!form) return;
        try { await ensureFlatpickr(); } catch(_e){ return; }
        if(!window.flatpickr) return;
        function ensureTodayBtn(fp){
            const cal = fp?.calendarContainer; if(!cal) return;
            if(cal.querySelector('.fp-today-btn')) return;
            const btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'fp-today-btn'; btn.textContent = '오늘';
            btn.addEventListener('click', ()=>{ fp.setDate(new Date(), true); });
            cal.appendChild(btn);
        }
        const fields = ['entry_datetime','exit_datetime'];
        const opts = {
            locale: (window.flatpickr?.l10ns?.ko) || 'ko',
            enableTime: true,
            time_24hr: true,
            dateFormat: 'Y-m-d H:i',
            allowInput: true,
            disableMobile: true,
            clickOpens: true,
            appendTo: document.body,
            onReady: function(_, __, inst){ ensureTodayBtn(inst); },
            onOpen: function(_, __, inst){ ensureTodayBtn(inst); }
        };
        fields.forEach(name=>{
            const el = form.querySelector('[name="'+name+'"]');
            if(el && !el._flatpickr){
                try { window.flatpickr(el, opts); } catch(_e){}
            }
        });
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
    // Add modal/button removed on this page
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
    // Bulk UI removed on this page

    // Stats (통계)
    const STATS_BTN_ID = 'system-stats-btn';
    const STATS_MODAL_ID = 'system-stats-modal';
    const STATS_CLOSE_ID = 'system-stats-close';
    const STATS_OK_ID = 'system-stats-ok';

    // Upload (엑셀 업로드)
    // Upload UI removed on this page
    // Upload template (Access Registration schema)
    const UPLOAD_HEADERS_KO = [
        '상태','성명','소속','사번/번호','출입일시','퇴실일시','출입목적','출입구역','노트북사용','USB락사용','작업 관리부서','작업 담당자','출입 관리부서','출입 담당자','입출구분','물품구분','물품장비','물품수량','비고'
    ];
    const HEADER_KO_TO_KEY = {
        '상태':'status','성명':'name','소속':'affiliation','사번/번호':'id_number','출입일시':'entry_datetime','퇴실일시':'exit_datetime','출입목적':'entry_purpose','출입구역':'entry_area','노트북사용':'laptop_use','USB락사용':'usb_lock_use',
        '작업 관리부서':'work_management_dept','작업 담당자':'work_assignee','출입 관리부서':'access_management_dept','출입 담당자':'access_assignee',
        '입출구분':'in_out_type','물품구분':'goods_type','물품장비':'goods_item','물품수량':'goods_qty','비고':'note'
    };
    const ENUM_SETS = { };
    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
    function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }

    // Data + State
    const BASE_VISIBLE_COLUMNS = [
        'status','name','affiliation','id_number','entry_datetime','exit_datetime','entry_purpose','entry_area','laptop_use','usb_lock_use',
        'work_management_dept','work_assignee','access_management_dept','access_assignee'
    ];
    const COLUMN_ORDER = [
        'status','name','affiliation','id_number','entry_datetime','exit_datetime','entry_purpose','entry_area','laptop_use','usb_lock_use',
        'work_management_dept','work_assignee','access_management_dept','access_assignee',
        'in_out_type','goods_type','goods_item','goods_qty','note'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '출입 등록', columns: ['status','name','affiliation','id_number','entry_datetime','exit_datetime','entry_purpose','entry_area','laptop_use','usb_lock_use','work_management_dept','work_assignee','access_management_dept','access_assignee'] },
        { group: '물품 반출', columns: ['in_out_type','goods_type','goods_item','goods_qty','note'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        status:{label:'상태',group:'출입 등록'},
        name:{label:'성명',group:'출입 등록'},
        affiliation:{label:'소속',group:'출입 등록'},
        id_number:{label:'사번/번호',group:'출입 등록'},
        entry_datetime:{label:'출입일시',group:'출입 등록'},
        exit_datetime:{label:'퇴실일시',group:'출입 등록'},
        entry_purpose:{label:'출입목적',group:'출입 등록'},
        entry_area:{label:'출입구역',group:'출입 등록'},
        laptop_use:{label:'노트북사용',group:'출입 등록'},
        usb_lock_use:{label:'USB락사용',group:'출입 등록'},
        work_management_dept:{label:'작업 관리부서',group:'출입 등록'},
        work_assignee:{label:'작업 담당자',group:'출입 등록'},
        access_management_dept:{label:'출입 관리부서',group:'출입 등록'},
        access_assignee:{label:'출입 담당자',group:'출입 등록'},
        in_out_type:{label:'입출구분',group:'물품 반출'},
        goods_type:{label:'물품구분',group:'물품 반출'},
        goods_item:{label:'물품장비',group:'물품 반출'},
        goods_qty:{label:'물품수량',group:'물품 반출'},
        note:{label:'비고',group:'물품 반출'}
    };

    // Modal required fields: show red "*" and rely on native validity checks.
    const REQUIRED_MODAL_FIELDS = new Set(['name']);

    const ACCESS_RECORDS_API_BASE = '/api/datacenter/access/records';
    const ACCESS_RECORDS_FETCH_LIMIT = 500;

    const FK_SOURCE_CONFIG = {
        ORG_CENTER: {
            endpoint: '/api/org-centers',
            valueKey: 'center_name',
            labelKey: 'center_name'
        },
        ORG_DEPARTMENT: {
            endpoint: '/api/org-departments',
            valueKey: 'dept_name',
            labelKey: 'dept_name'
        },
        USER_PROFILE: {
            endpoint: '/api/user-profiles?limit=500',
            valueKey: 'name',
            labelKey: 'name'
        }
    };

    const FK_FIELD_SPECS = {
        entry_area: {
            source: 'ORG_CENTER',
            placeholder: '출입구역 선택',
            optionBuilder: buildCenterOption
        },
        work_management_dept: {
            source: 'ORG_DEPARTMENT',
            placeholder: '작업 관리부서 선택'
        },
        access_management_dept: {
            source: 'ORG_DEPARTMENT',
            placeholder: '출입 관리부서 선택'
        },
        work_assignee: {
            source: 'USER_PROFILE',
            placeholder: '작업 담당자 선택',
            optionBuilder: buildAssigneeOption
        },
        access_assignee: {
            source: 'USER_PROFILE',
            placeholder: '출입 담당자 선택',
            optionBuilder: buildAssigneeOption
        }
    };

    const fkSourceCache = new Map();

    function buildCenterOption(item){
        const name = String(item?.center_name || item?.center_code || '').trim();
        const locationRaw = String(item?.location || '').trim();
        if(!name) return null;
        if(!locationRaw) return { value: name, label: name };
        const needsWrap = !(locationRaw.startsWith('(') && locationRaw.endsWith(')'));
        const decorated = needsWrap ? `(${locationRaw})` : locationRaw;
        const label = `${name}${decorated}`;
        return { value: label, label };
    }

    function buildUserOption(item){
        const name = String(item?.name || '').trim();
        const dept = String(item?.department || '').trim();
        const emp = String(item?.emp_no || '').trim();
        if(!name && !emp) return null;
        const detailParts = [dept, emp].filter(Boolean);
        const detail = detailParts.length ? ` · ${detailParts.join(' · ')}` : '';
        const base = name || emp;
        const label = `${base}${detail}`.trim();
        return { value: label, label };
    }

    function buildAssigneeOption(item){
        const name = String(item?.name || '').trim();
        const dept = String(item?.department || '').trim();
        if(!name) return null;
        const legacyValue = dept ? `${dept}, ${name}` : name;
        return { value: legacyValue, label: name };
    }

    function _normStr(val){
        return String(val ?? '').trim();
    }

    function _getScopeForSelect(select){
        return select?.closest('form') || select?.closest('.modal-overlay-full') || document;
    }

    function _getDeptValueForAssignee(field, scope){
        const controlling = (field === 'work_assignee')
            ? 'work_management_dept'
            : (field === 'access_assignee' ? 'access_management_dept' : null);
        if(!controlling) return '';
        const el = scope?.querySelector?.(`[name="${controlling}"]`);
        return _normStr(el?.value);
    }

    function fkSelectMarkup(field, options){
        const opts = options || {};
        const placeholder = opts.placeholder || '선택';
        const attrs = [];
        if(opts.name !== false){
            attrs.push(`name="${opts.name || field}"`);
        }
        attrs.push(`class="${opts.className || 'form-input search-select fk-select'}"`);
        attrs.push(`data-fk="${field}"`);
        attrs.push(`data-placeholder="${placeholder}"`);
        attrs.push('disabled');
        if(opts.value){
            attrs.push(`data-initial-value="${escapeAttr(String(opts.value))}"`);
        }
        if(Array.isArray(opts.extraAttrs)){
            opts.extraAttrs.filter(Boolean).forEach(attr => attrs.push(attr));
        }
        return `<select ${attrs.join(' ')}><option value="">${escapeHTML(placeholder)}</option></select>`;
    }

    async function loadFkSource(sourceKey){
        if(fkSourceCache.has(sourceKey)){
            return fkSourceCache.get(sourceKey);
        }
        const config = FK_SOURCE_CONFIG[sourceKey];
        if(!config){
            fkSourceCache.set(sourceKey, []);
            return [];
        }
        try {
            const resp = await fetch(config.endpoint, { headers:{ 'Accept':'application/json' } });
            let payload = {};
            try { payload = await resp.json(); } catch(_e){ payload = {}; }
            if(!resp.ok || payload.success === false){
                throw new Error(payload.message || '데이터를 불러오지 못했습니다.');
            }
            const items = Array.isArray(payload.items)
                ? payload.items
                : (Array.isArray(payload.data) ? payload.data : (Array.isArray(payload) ? payload : []));
            fkSourceCache.set(sourceKey, items);
            return items;
        } catch(err){
            console.warn('[ACCESS_RECORDS] FK source load failed:', sourceKey, err);
            fkSourceCache.set(sourceKey, []);
            return [];
        }
    }

    function defaultFkOption(item, spec, config){
        const valueKey = spec.valueKey || config.valueKey || 'id';
        const labelKey = spec.labelKey || config.labelKey || valueKey;
        const valueRaw = item?.[valueKey];
        const labelRaw = item?.[labelKey];
        const value = (valueRaw ?? labelRaw ?? '').toString().trim();
        const label = (labelRaw ?? valueRaw ?? '').toString().trim();
        if(!value || !label) return null;
        return { value, label };
    }

    async function getFkOptions(field, scopeEl){
        const spec = FK_FIELD_SPECS[field];
        if(!spec) return [];
        const sourceConfig = FK_SOURCE_CONFIG[spec.source] || {};
        let records = await loadFkSource(spec.source);

        if(field === 'work_assignee' || field === 'access_assignee'){
            const deptValue = _getDeptValueForAssignee(field, scopeEl || document);
            if(deptValue){
                const deptNorm = deptValue.toLowerCase();
                records = (records || []).filter(item => _normStr(item?.department).toLowerCase() === deptNorm);
            }
        }
        const seen = new Set();
        const options = [];
        records.forEach(item => {
            const built = spec.optionBuilder
                ? spec.optionBuilder(item)
                : defaultFkOption(item, spec, sourceConfig);
            if(!built) return;
            const value = (built.value ?? '').toString().trim();
            const label = (built.label ?? '').toString().trim();
            if(!value || !label) return;
            const key = `${value}__${label}`;
            if(seen.has(key)) return;
            seen.add(key);
            options.push({ value, label });
        });
        options.sort((a,b)=> a.label.localeCompare(b.label, 'ko', { sensitivity: 'base' }) || a.value.localeCompare(b.value, 'ko', { sensitivity: 'base' }));
        return options;
    }

    async function populateFkSelect(select){
        if(!select) return;
        const field = select.dataset?.fk || select.name;
        if(!field || !FK_FIELD_SPECS[field]) return;
        const scope = _getScopeForSelect(select);
        const placeholder = select.getAttribute('data-placeholder') || FK_FIELD_SPECS[field].placeholder || '선택';
        // Preserve selection BEFORE we overwrite innerHTML.
        // Without this, async hydration can wipe a user's choice made while options are loading.
        const preservedInitial = select.dataset.initialValue || select.value || '';
        select.disabled = true;
        select.innerHTML = `<option value="">${escapeHTML(placeholder)} · 불러오는 중...</option>`;
        try {
            const options = await getFkOptions(field, scope);
            let html = `<option value="">${escapeHTML(placeholder)}</option>`;
            options.forEach(opt => {
                html += `<option value="${escapeAttr(opt.value)}">${escapeHTML(opt.label)}</option>`;
            });
            select.innerHTML = html;
            const initial = preservedInitial;
            if(initial){
                select.value = initial;
                if(select.value !== initial){
                    if(field === 'work_assignee' || field === 'access_assignee'){
                        select.value = '';
                    } else {
                        const extra = document.createElement('option');
                        extra.value = initial;
                        extra.textContent = initial;
                        extra.selected = true;
                        select.appendChild(extra);
                    }
                }
            } else {
                select.value = '';
            }
            if(select.dataset.initialValue){
                delete select.dataset.initialValue;
            }
        } catch(err){
            console.warn('[ACCESS_RECORDS] Failed to populate FK select:', field, err);
            select.innerHTML = `<option value="">데이터를 불러오지 못했습니다</option>`;
        } finally {
            select.disabled = false;
            setupSearchableSelect(select);
            syncSearchableSelect(select);
        }
    }

    async function hydrateFkFields(scope){
        const root = scope?.querySelectorAll ? scope : document;
        const selects = root.querySelectorAll ? root.querySelectorAll('select[data-fk]') : [];
        if(!selects.length) return;
        await Promise.all([...selects].map(select => populateFkSelect(select)));
    }

    function wireDeptAssigneeDependencies(scope){
        const root = scope?.querySelector ? scope : document;
        const pairs = [
            { dept: 'work_management_dept', assignee: 'work_assignee' },
            { dept: 'access_management_dept', assignee: 'access_assignee' },
        ];
        pairs.forEach(p => {
            const deptEl = root.querySelector(`[name="${p.dept}"]`);
            const assigneeEl = root.querySelector(`[name="${p.assignee}"]`);
            if(!deptEl || !assigneeEl) return;
            if(deptEl.dataset.depWired === '1') return;
            deptEl.dataset.depWired = '1';
            deptEl.addEventListener('change', async ()=>{
                try {
                    assigneeEl.value = '';
                    await populateFkSelect(assigneeEl);
                    try { syncSearchableSelect(assigneeEl); } catch(_e){}
                } catch(err){
                    console.warn('[ACCESS_RECORDS] Failed to refresh assignee options', p, err);
                }
            });
        });
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

    let isFetchingRecords = false;

    function ensureLoadingStyle(){
        if(document.getElementById('access-records-loading-style')) return;
        const style = document.createElement('style');
        style.id = 'access-records-loading-style';
        style.textContent = `
            #system-table.is-loading {
                position: relative;
                opacity: 0.55;
                pointer-events: none;
                transition: opacity 0.2s ease;
            }
            #system-table.is-loading::after {
                content: '출입 기록을 불러오는 중입니다...';
                position: absolute;
                inset: 40% 10%;
                text-align: center;
                font-size: 0.95rem;
                color: #555;
                background: rgba(255,255,255,0.9);
                border-radius: 12px;
                padding: 12px 16px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.08);
            }
        `;
        document.head.appendChild(style);
    }

    function setTableLoading(isLoading){
        const table = document.getElementById(TABLE_ID);
        if(table){
            table.classList.toggle('is-loading', !!isLoading);
        }
        const loader = document.getElementById('system-search-loader');
        if(loader){
            loader.setAttribute('aria-hidden', isLoading ? 'false' : 'true');
            loader.classList.toggle('is-inline-loading', !!isLoading);
        }
    }

    function coerceQty(value){
        if(value === '' || value == null) return '';
        const num = Number(value);
        return Number.isFinite(num) ? num : '';
    }

    function normalizeRow(row){
        if(!row) return null;
        const normalized = {};
        const rawId = Number(row.id ?? row.entry_id ?? row.ID);
        const fallbackId = state.nextId++;
        normalized.id = Number.isFinite(rawId) && rawId > 0 ? rawId : fallbackId;
        normalized.status = String(row.status ?? '').trim() || '퇴실';
        normalized.name = row.name || '';
        normalized.affiliation = row.affiliation || '';
        normalized.id_number = row.id_number || '';
        normalized.entry_datetime = row.entry_datetime || '';
        normalized.exit_datetime = row.exit_datetime || '';
        normalized.entry_purpose = row.entry_purpose || '';
        normalized.entry_area = row.entry_area || '';
        normalized.laptop_use = row.laptop_use || '';
        normalized.usb_lock_use = row.usb_lock_use || '';
        normalized.work_management_dept = row.work_management_dept || '';
        normalized.work_assignee = row.work_assignee || '';
        normalized.access_management_dept = row.access_management_dept || '';
        normalized.access_assignee = row.access_assignee || '';
        normalized.in_out_type = row.in_out_type || '';
        normalized.goods_type = row.goods_type || '';
        normalized.goods_item = row.goods_item || '';
        normalized.goods_qty = coerceQty(row.goods_qty);
        normalized.note = row.note || '';
        normalized.created_at = row.created_at || '';
        normalized.updated_at = row.updated_at || '';
        return normalized;
    }

    function applyRemoteItems(items, total){
        const normalized = (items || [])
            .map(normalizeRow)
            .filter(Boolean);
        state.data = normalized;
        const maxId = normalized.reduce((acc, row)=> Math.max(acc, Number(row.id) || 0), 0);
        state.nextId = Math.max(state.nextId, maxId + 1);
        state.selected.clear();
        if(typeof total === 'number'){
            state.remoteTotal = total;
        } else {
            state.remoteTotal = normalized.length;
        }
        state.page = 1;
        applyFilter();
    }

    function buildQuery(params){
        const searchParams = new URLSearchParams();
        Object.entries(params || {}).forEach(([key, value])=>{
            if(value === undefined || value === null) return;
            const stringified = String(value).trim();
            if(stringified === '') return;
            searchParams.set(key, stringified);
        });
        return searchParams.toString();
    }

    async function fetchAccessRecords(params){
        const query = buildQuery({
            view: 'records',
            page_size: ACCESS_RECORDS_FETCH_LIMIT,
            ...params
        });
        const url = query ? `${ACCESS_RECORDS_API_BASE}?${query}` : ACCESS_RECORDS_API_BASE;
        const resp = await fetch(url, {
            headers: { 'Accept': 'application/json' },
        });
        let payload = {};
        try { payload = await resp.json(); } catch(_e) { payload = {}; }
        if(!resp.ok || payload.success === false){
            throw new Error(payload.message || '출입 기록을 불러오지 못했습니다.');
        }
        return payload;
    }

    async function loadRecordsFromServer(options){
        const opts = options || {};
        if(isFetchingRecords) return;
        isFetchingRecords = true;
        ensureLoadingStyle();
        if(opts.showSpinner !== false) setTableLoading(true);
        try {
            const payload = await fetchAccessRecords({ include_deleted: opts.includeDeleted ? '1' : undefined });
            applyRemoteItems(payload.items || [], payload.total);
        } catch(err){
            console.error(err);
            if(opts.fallbackMock){
                state.data = mockData(5);
                state.nextId = state.data.length + 1;
                applyFilter();
            }
            showMessage(err.message || '출입 기록 조회 중 오류가 발생했습니다.', '오류');
        } finally {
            isFetchingRecords = false;
            if(opts.showSpinner !== false) setTableLoading(false);
        }
    }

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;

    // 출입 기록 페이지: 샘플 데이터 5개 제공 (항상 '퇴실')
    function mockData(count=5){
        const rows = [
            { id: 1, status: '퇴실', name: '홍길동', affiliation: '인프라팀', id_number: 'ID-001', entry_datetime: '2025-08-18 09:17', exit_datetime: '2025-08-18 18:00', entry_purpose: '장비 점검', entry_area: '퓨처센터(5층)', laptop_use: 'O', usb_lock_use: 'O', work_management_dept: '인프라팀', work_assignee: '홍길동', access_management_dept: '보안팀', access_assignee: '최관리자', in_out_type: '반입', goods_type: '교체', goods_item: 'SSD 2TB', goods_qty: 2, note: '' },
            { id: 2, status: '퇴실', name: '김철수', affiliation: '개발1팀', id_number: 'ID-002', entry_datetime: '2025-08-19 10:00', exit_datetime: '2025-08-19 17:30', entry_purpose: '소프트웨어 설치', entry_area: '퓨처센터(6층)', laptop_use: 'O', usb_lock_use: 'X', work_management_dept: '개발1팀', work_assignee: '김철수', access_management_dept: '보안팀', access_assignee: '박관리자', in_out_type: '반출', goods_type: '구매', goods_item: '네트워크 스위치', goods_qty: 1, note: '' },
            { id: 3, status: '퇴실', name: '이영희', affiliation: '플랫폼팀', id_number: 'ID-003', entry_datetime: '2025-08-20 09:30', exit_datetime: '2025-08-20 19:00', entry_purpose: '장비 교체', entry_area: '퓨처센터(5/6층)', laptop_use: 'X', usb_lock_use: 'X', work_management_dept: '플랫폼팀', work_assignee: '이영희', access_management_dept: '출입관리팀', access_assignee: '조관리자', in_out_type: '반입', goods_type: '임대', goods_item: '서버 메모리', goods_qty: 8, note: '' },
            { id: 4, status: '퇴실', name: '박보라', affiliation: '보안팀', id_number: 'ID-004', entry_datetime: '2025-08-21 08:50', exit_datetime: '2025-08-21 18:10', entry_purpose: '보안 점검', entry_area: '을지트윈타워(15층)', laptop_use: 'O', usb_lock_use: 'O', work_management_dept: '보안팀', work_assignee: '박보라', access_management_dept: '보안팀', access_assignee: '권관리자', in_out_type: '반출', goods_type: '교체', goods_item: '방화벽 모듈', goods_qty: 1, note: '' },
            { id: 5, status: '퇴실', name: '최가을', affiliation: 'DB운영팀', id_number: 'ID-005', entry_datetime: '2025-08-22 09:10', exit_datetime: '2025-08-22 18:30', entry_purpose: 'DB 점검', entry_area: '재해복구센터(4층)', laptop_use: 'O', usb_lock_use: 'X', work_management_dept: 'DB운영팀', work_assignee: '최가을', access_management_dept: '출입관리팀', access_assignee: '유관리자', in_out_type: '반입', goods_type: '구매', goods_item: 'HDD 8TB', goods_qty: 4, note: '' }
        ];
        // 만약 다른 개수를 명시했다면 상위 count개만 반환
        return rows.slice(0, Math.max(0, count|0));
    }

    async function initData(){
        await loadRecordsFromServer({ showSpinner: true, fallbackMock: true });
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
    // 출입 기록 페이지: 항상 '퇴실' 상태만 노출
    base = base.filter(row => String(row.status) === '퇴실');
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
                    if(titleEl) titleEl.textContent = '출입 기록이 없습니다.';
                    if(descEl) descEl.textContent = "등록 후 퇴실 처리된 기록이 이곳에 표시됩니다.";
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
                    if(col === 'work_assignee' || col === 'access_assignee'){
                        rawVal = displayAssigneeName(rawVal);
                    }
                    const displayVal = (rawVal==null || String(rawVal).trim()==='') ? '-' : rawVal;
                    let cellValue = highlight(displayVal, col);
                    // 상태 배지 표시
                    if(col === 'status'){
                        const v = String(displayVal);
                        // 매핑: 승인 -> ws-run, 대기 -> ws-wait, 퇴실 -> ws-idle
                        let cls = 'ws-wait';
                        if(v === '승인') cls = 'ws-run';
                        else if(v === '퇴실') cls = 'ws-idle';
                        cellValue = `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${highlight(displayVal, col)}</span></span>`;
                    }
                    // 노트북사용 / USB락사용: 서비스 이중화와 동일한 O/X 뱃지 스타일
                    if(col === 'laptop_use' || col === 'usb_lock_use'){
                        const ox = String(row[col] ?? '').trim();
                        const badge = `<span class="ox-badge ${ox==='O'?'on':'off'}">${ox||'-'}</span>`;
                        cellValue = `<span class="cell-ox with-badge">${badge}</span>`;
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

    const HTML_ESCAPE_MAP = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' };

    function displayAssigneeName(value){
        const raw = String(value ?? '').trim();
        if(!raw) return '';
        // Common legacy formats:
        // - "부서, 이름" -> show "이름"
        // - "이름 · 부서 · 사번" -> show "이름"
        if(raw.includes(',')){
            const parts = raw.split(',').map(p=>p.trim()).filter(Boolean);
            if(parts.length >= 2) return parts[parts.length - 1];
        }
        if(raw.includes('·')){
            const parts = raw.split('·').map(p=>p.trim()).filter(Boolean);
            if(parts.length >= 1) return parts[0];
        }
        return raw;
    }

    function escapeHTML(str){
        return String(str).replace(/[&<>'"]/g, s=> HTML_ESCAPE_MAP[s] || s);
    }

    function escapeAttr(str){
        return String(str).replace(/[&<>'"]/g, s=> HTML_ESCAPE_MAP[s] || s);
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

                // One-time migration: ensure the new 4 access responsibility columns
                // show up even if a previous saved column set predates them.
                const MIGRATION_KEY = 'dc_access_visible_cols_migrated_v4fields';
                try {
                    if(!localStorage.getItem(MIGRATION_KEY)){
                        ['work_management_dept','work_assignee','access_management_dept','access_assignee']
                            .forEach(k => { if(allowed.has(k)) state.visibleCols.add(k); });
                        localStorage.setItem(MIGRATION_KEY, '1');
                    }
                } catch(_e) {}

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

    // Searchable selects (hardware-style searchable dropdowns)
    const searchableSelectMeta = new WeakMap();
    let activeSearchPanel = null;

    function isSearchableSelect(select){
        if(!select || select.tagName !== 'SELECT'){ return false; }
        if(select.multiple){ return false; }
        if(select.dataset.searchable === 'false'){ return false; }
        return select.classList.contains('search-select');
    }

    function getSearchablePlaceholder(select){
        return select?.getAttribute('data-placeholder') || select?.dataset?.placeholder || '선택';
    }

    function setupSearchableSelect(select){
        if(!isSearchableSelect(select) || select.dataset.searchEnhanced === '1'){
            return;
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'fk-searchable-control';
        const displayBtn = document.createElement('button');
        displayBtn.type = 'button';
        displayBtn.className = 'fk-searchable-display';
        displayBtn.setAttribute('aria-haspopup', 'dialog');
        displayBtn.setAttribute('aria-expanded', 'false');
        displayBtn.dataset.placeholder = getSearchablePlaceholder(select);
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'fk-searchable-clear';
        clearBtn.textContent = '지움';
        clearBtn.setAttribute('aria-label', '선택 해제');
        clearBtn.hidden = true;
        clearBtn.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            closeSearchDropdown(select);
            select.value = '';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            syncSearchableSelect(select);
        });
        displayBtn.addEventListener('click', event => {
            event.preventDefault();
            if(select.disabled){ return; }
            openSearchDropdown(select);
        });
        const parent = select.parentNode;
        if(parent){ parent.insertBefore(wrapper, select); }
        wrapper.appendChild(displayBtn);
        wrapper.appendChild(clearBtn);
        wrapper.appendChild(select);
        select.classList.add('fk-search-native-hidden');
        select.dataset.searchEnhanced = '1';
        select.addEventListener('change', () => syncSearchableSelect(select));
        searchableSelectMeta.set(select, { wrapper, displayBtn, clearBtn });
    }

    function syncSearchableSelect(select){
        if(!isSearchableSelect(select)){
            return;
        }
        let meta = searchableSelectMeta.get(select);
        if(!meta){
            setupSearchableSelect(select);
            meta = searchableSelectMeta.get(select);
            if(!meta){ return; }
        }
        const placeholder = getSearchablePlaceholder(select);
        const selectedOption = select.selectedOptions && select.selectedOptions[0];
        const optionLabel = (selectedOption?.textContent || '').trim();
        const value = select.value || '';
        const label = optionLabel || value || placeholder;
        meta.displayBtn.textContent = label;
        meta.displayBtn.title = label;
        meta.displayBtn.dataset.placeholder = placeholder;
        const hasValue = !!value;
        meta.displayBtn.classList.toggle('has-value', hasValue);
        meta.clearBtn.hidden = !hasValue;
        const disabled = !!select.disabled;
        meta.wrapper.classList.toggle('is-disabled', disabled);
        meta.displayBtn.disabled = disabled;
        meta.clearBtn.disabled = disabled;
        if(disabled){
            closeSearchDropdown(select);
        }
    }

    function buildSearchPanelOptions(select, placeholder){
        const options = [];
        Array.from(select?.options || []).forEach(opt => {
            const rawLabel = (opt.textContent || '').trim();
            const value = opt.value || '';
            const label = rawLabel || value || placeholder;
            options.push({
                value,
                label,
                searchLabel: label.toLowerCase(),
                valueLower: value.toLowerCase()
            });
        });
        return options;
    }

    function openSearchDropdown(select){
        if(!isSearchableSelect(select) || select.disabled){
            return;
        }
        const meta = searchableSelectMeta.get(select);
        if(!meta){
            return;
        }
        closeSearchDropdown();
        const placeholder = getSearchablePlaceholder(select);
        const panel = document.createElement('div');
        panel.className = 'fk-search-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', `${placeholder} 검색`);
        const header = document.createElement('div');
        header.className = 'fk-search-panel__header';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'fk-search-panel__input';
        input.placeholder = '검색어 입력';
        input.setAttribute('aria-label', '검색어 입력');
        input.autocomplete = 'off';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'fk-search-panel__close';
        closeBtn.textContent = '닫기';
        closeBtn.setAttribute('aria-label', '닫기');
        header.appendChild(input);
        header.appendChild(closeBtn);
        panel.appendChild(header);
        const list = document.createElement('div');
        list.className = 'fk-search-panel__list';
        list.setAttribute('role', 'listbox');
        panel.appendChild(list);
        const empty = document.createElement('div');
        empty.className = 'fk-search-panel__empty';
        empty.textContent = '검색 결과가 없습니다.';
        empty.hidden = true;
        panel.appendChild(empty);
        document.body.appendChild(panel);
        const options = buildSearchPanelOptions(select, placeholder);
        const state = {
            select,
            panel,
            trigger: meta.displayBtn,
            anchor: meta.wrapper,
            input,
            closeBtn,
            list,
            empty,
            placeholder,
            options,
            filtered: options.slice(),
            focusIndex: -1
        };
        activeSearchPanel = state;
        meta.displayBtn.setAttribute('aria-expanded', 'true');
        renderSearchPanelOptions(state);
        positionSearchPanel(state);
        setTimeout(()=> input.focus(), 0);
        closeBtn.addEventListener('click', event => {
            event.preventDefault();
            closeSearchDropdown();
        });
        input.addEventListener('keydown', event => handleSearchInputKeydown(event, state));
        input.addEventListener('input', () => filterSearchPanelOptions(state));
        list.addEventListener('keydown', event => handleSearchListKeydown(event, state));
        state.handleOutside = event => {
            if(panel.contains(event.target) || meta.wrapper.contains(event.target)){
                return;
            }
            closeSearchDropdown();
        };
        document.addEventListener('pointerdown', state.handleOutside, true);
        state.handleKeydown = event => {
            if(event.key === 'Escape'){
                event.preventDefault();
                event.stopPropagation();
                closeSearchDropdown();
            }
        };
        document.addEventListener('keydown', state.handleKeydown, true);
        state.handleResize = () => closeSearchDropdown();
        window.addEventListener('resize', state.handleResize);
        state.handleScroll = () => closeSearchDropdown();
        window.addEventListener('scroll', state.handleScroll, true);
        state.handleFocus = event => {
            if(panel.contains(event.target) || meta.wrapper.contains(event.target)){
                return;
            }
            closeSearchDropdown();
        };
        document.addEventListener('focusin', state.handleFocus, true);
    }

    function renderSearchPanelOptions(state){
        state.list.innerHTML = '';
        const currentValue = state.select.value || '';
        if(!state.filtered.length){
            state.empty.hidden = false;
            state.focusIndex = -1;
            return;
        }
        state.empty.hidden = true;
        state.filtered.forEach((opt, index) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'fk-search-panel__item';
            btn.textContent = opt.label;
            btn.dataset.value = opt.value;
            btn.setAttribute('role', 'option');
            btn.tabIndex = -1;
            if(opt.value === currentValue){
                btn.classList.add('selected');
                btn.setAttribute('aria-selected', 'true');
                state.focusIndex = index;
            } else {
                btn.setAttribute('aria-selected', 'false');
            }
            btn.addEventListener('click', event => {
                event.preventDefault();
                commitSearchPanelSelection(state, opt.value);
            });
            state.list.appendChild(btn);
        });
    }

    function focusSearchPanelItem(state, index, opts){
        const items = state.list.querySelectorAll('.fk-search-panel__item');
        if(!items.length){ return; }
        const maxIndex = items.length - 1;
        const targetIndex = Math.max(0, Math.min(index, maxIndex));
        state.focusIndex = targetIndex;
        items.forEach((btn, idx) => {
            const isActive = idx === targetIndex;
            btn.classList.toggle('active', isActive);
        });
        const target = items[targetIndex];
        if(opts?.focus !== false){
            target.focus({ preventScroll: true });
        }
        if(opts?.ensureVisible){
            const listEl = state.list;
            const itemTop = target.offsetTop;
            const itemBottom = itemTop + target.offsetHeight;
            if(itemBottom > listEl.scrollTop + listEl.clientHeight){
                listEl.scrollTop = itemBottom - listEl.clientHeight;
            } else if(itemTop < listEl.scrollTop){
                listEl.scrollTop = itemTop;
            }
        }
    }

    function handleSearchInputKeydown(event, state){
        if(event.key === 'ArrowDown'){
            event.preventDefault();
            if(!state.filtered.length){ return; }
            if(state.focusIndex === -1){
                focusSearchPanelItem(state, 0, { ensureVisible: true });
            } else {
                focusSearchPanelItem(state, state.focusIndex, { ensureVisible: true });
            }
        } else if(event.key === 'Enter'){
            if(state.focusIndex >= 0 && state.filtered[state.focusIndex]){
                event.preventDefault();
                commitSearchPanelSelection(state, state.filtered[state.focusIndex].value);
            }
        }
    }

    function handleSearchListKeydown(event, state){
        const isItem = !!(event.target && event.target.classList && event.target.classList.contains('fk-search-panel__item'));
        if(!isItem){ return; }
        if(event.key === 'ArrowDown'){
            event.preventDefault();
            focusSearchPanelItem(state, (state.focusIndex >= 0 ? state.focusIndex + 1 : 0), { ensureVisible: true });
        } else if(event.key === 'ArrowUp'){
            event.preventDefault();
            if(state.focusIndex <= 0){
                state.focusIndex = -1;
                state.input.focus();
                return;
            }
            focusSearchPanelItem(state, state.focusIndex - 1, { ensureVisible: true });
        } else if(event.key === 'Home'){
            event.preventDefault();
            focusSearchPanelItem(state, 0, { ensureVisible: true });
        } else if(event.key === 'End'){
            event.preventDefault();
            focusSearchPanelItem(state, state.filtered.length - 1, { ensureVisible: true });
        } else if(event.key === 'Enter' || event.key === ' '){
            if(state.focusIndex >= 0 && state.filtered[state.focusIndex]){
                event.preventDefault();
                commitSearchPanelSelection(state, state.filtered[state.focusIndex].value);
            }
        } else if(event.key === 'Escape'){
            event.preventDefault();
            event.stopPropagation();
            closeSearchDropdown();
        }
    }

    function commitSearchPanelSelection(state, value){
        state.select.value = value;
        state.select.dispatchEvent(new Event('change', { bubbles: true }));
        syncSearchableSelect(state.select);
        closeSearchDropdown();
    }

    function filterSearchPanelOptions(state){
        const term = state.input.value.trim().toLowerCase();
        if(!term){
            state.filtered = state.options.slice();
        } else {
            state.filtered = state.options.filter(opt => opt.searchLabel.includes(term) || opt.valueLower.includes(term));
        }
        state.focusIndex = state.filtered.findIndex(opt => opt.value === state.select.value);
        renderSearchPanelOptions(state);
    }

    function closeSearchDropdown(targetSelect){
        if(!activeSearchPanel){ return; }
        if(targetSelect && activeSearchPanel.select !== targetSelect){
            return;
        }
        const state = activeSearchPanel;
        state.trigger?.setAttribute('aria-expanded', 'false');
        if(state.panel?.parentNode){
            state.panel.parentNode.removeChild(state.panel);
        }
        if(state.handleOutside){ document.removeEventListener('pointerdown', state.handleOutside, true); }
        if(state.handleKeydown){ document.removeEventListener('keydown', state.handleKeydown, true); }
        if(state.handleFocus){ document.removeEventListener('focusin', state.handleFocus, true); }
        if(state.handleResize){ window.removeEventListener('resize', state.handleResize); }
        if(state.handleScroll){ window.removeEventListener('scroll', state.handleScroll, true); }
        activeSearchPanel = null;
    }

    function positionSearchPanel(state){
        const { panel, anchor } = state;
        if(!panel || !anchor){ return; }
        const rect = anchor.getBoundingClientRect();
        const margin = 8;
        const width = Math.max(rect.width, 280);
        panel.style.width = `${width}px`;
        let left = rect.left;
        if(left + width > window.innerWidth - margin){
            left = window.innerWidth - width - margin;
        }
        left = Math.max(margin, left);
        let top = rect.bottom + margin;
        const availableBelow = window.innerHeight - rect.bottom - margin;
        const availableAbove = rect.top - margin;
        const panelHeight = panel.offsetHeight;
        if(panelHeight > availableBelow && availableAbove > availableBelow){
            top = rect.top - panelHeight - margin;
        }
        top = Math.max(margin, top);
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
    }

    function enhanceFormSearchableSelects(formId){
        const form = document.getElementById(formId);
        if(!form){ return; }
        form.querySelectorAll('select.search-select').forEach(select => {
            setupSearchableSelect(select);
            syncSearchableSelect(select);
        });
    }

    document.addEventListener('reset', event => {
        const form = event.target;
        if(!(form instanceof HTMLFormElement)){ return; }
        setTimeout(() => {
            form.querySelectorAll('select.search-select').forEach(select => syncSearchableSelect(select));
        }, 0);
    });

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
            { title:'출입 관리', cols:['status','name','affiliation','id_number','entry_datetime','exit_datetime','entry_purpose','entry_area','laptop_use','usb_lock_use','work_management_dept','work_assignee','access_management_dept','access_assignee'] },
            { title:'물품 반출', cols:['in_out_type','goods_type','goods_item','goods_qty','note'] }
        ];
        groups.forEach(g=>{
            const section = document.createElement('div'); section.className='form-section';
            section.innerHTML = `<div class="section-header"><h4>${g.title}</h4></div>`;
            const grid = document.createElement('div'); grid.className='form-grid';
            g.cols.forEach(c=>{ if(!COLUMN_META[c]) return; const wrap=document.createElement('div');
                // Make note field span full width; others standard
                wrap.className = (c === 'note') ? 'form-row form-row-wide' : 'form-row';
                const labelText = COLUMN_META[c]?.label||c;
                const labelHtml = REQUIRED_MODAL_FIELDS.has(c)
                    ? `${labelText}<span class="required">*</span>`
                    : labelText;
                wrap.innerHTML=`<label>${labelHtml}</label>${generateFieldInput(c,row[c])}`; grid.appendChild(wrap); });
            section.appendChild(grid); form.appendChild(section);
        });
        enhanceFormSearchableSelects(EDIT_FORM_ID);
        hydrateFkFields(form).catch(err => console.warn('[ACCESS_RECORDS] FK hydrate failed for edit form', err));
        wireDeptAssigneeDependencies(form);
    }

    function generateFieldInput(col,value=''){
        // access records (Edit modal): status uses the same disabled input style as entry_datetime
        if(col==='status'){
            const v = String(value ?? '퇴실');
            return `<input name="status" class="form-input" value="${v}" disabled aria-readonly="true">`;
        }
        if(col==='entry_datetime' || col==='exit_datetime'){
            // Editable: allow users to modify entry/exit timestamps
            const v = String(value??'');
            return `<input name="${col}" class="form-input" value="${v}" placeholder="YYYY-MM-DD HH:MM">`;
        }
        if(col==='entry_area'){
            return fkSelectMarkup('entry_area', { value: value ?? '', placeholder: '출입구역 선택' });
        }
        if(col==='name'){
            const v = String(value ?? '');
            return `<input name="name" class="form-input" value="${escapeAttr(v)}" required>`;
        }
        if(col==='laptop_use' || col==='usb_lock_use'){
            const v = String(value??'');
            return `<select name="${col}" class="form-input search-select" data-placeholder="선택">
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="O" ${v==='O'?'selected':''}>O</option>
                <option value="X" ${v==='X'?'selected':''}>X</option>
            </select>`;
        }
        if(col==='in_out_type'){
            const v = String(value??'');
            const opts = ['', '반입','반출','반입/반출'];
            return `<select name="in_out_type" class="form-input search-select" data-placeholder="선택">${opts.map(o=>`<option value="${o}" ${o===v?'selected':''}>${o===''?'선택':o}</option>`).join('')}</select>`;
        }
        if(col==='goods_type'){
            const v = String(value??'');
            const opts = ['', '교체','구매','임대'];
            return `<select name="goods_type" class="form-input search-select" data-placeholder="선택">${opts.map(o=>`<option value="${o}" ${o===v?'selected':''}>${o===''?'선택':o}</option>`).join('')}</select>`;
        }
        if(col==='work_management_dept') return fkSelectMarkup('work_management_dept', { value: value ?? '', placeholder: '작업 관리부서 선택' });
        if(col==='work_assignee') return fkSelectMarkup('work_assignee', { value: value ?? '', placeholder: '작업 담당자 선택' });
        if(col==='access_management_dept') return fkSelectMarkup('access_management_dept', { value: value ?? '', placeholder: '출입 관리부서 선택' });
        if(col==='access_assignee') return fkSelectMarkup('access_assignee', { value: value ?? '', placeholder: '출입 담당자 선택' });
        if(col==='goods_qty') return `<input name="${col}" type="number" min="0" step="1" class="form-input" value="${value??''}" placeholder="0">`;
        if(col==='note') return `<textarea name="note" class="form-input textarea-large" rows="6">${value??''}</textarea>`;
        return `<input name="${col}" class="form-input" value="${escapeAttr(String(value ?? ''))}">`;
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
    const filename = `access_records_list_${yyyy}${mm}${dd}.csv`;
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
                    // no special live-sync/datepickers needed for access form
                    // Attach datetime pickers for 출입일시/퇴실일시 (editable in 기록 페이지)
                    initAccessDateTimePickers(EDIT_FORM_ID);
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
        // add/bulk/upload UI removed on this page; no bindings required
        // edit modal
    document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', ()=>{
            const form = document.getElementById(EDIT_FORM_ID);
            const indexEl = document.getElementById(EDIT_SAVE_ID);
            const index = parseInt(indexEl?.getAttribute('data-index')||'-1',10);
            const data = collectForm(form);
            if(typeof data.goods_qty !== 'undefined'){
                const v = parseInt(data.goods_qty||'0',10);
                data.goods_qty = Number.isFinite(v) && v >= 0 ? v : 0;
            }
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
        // dispose (불용처리)
        document.getElementById(DISPOSE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('불용처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('dispose-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 출입 등록을 정말 불용처리하시겠습니까?`; }
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
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 출입 기록을 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', async ()=>{
            const ids = [...state.selected].map(v => Number(v)).filter(v => Number.isFinite(v) && v > 0);
            if(!ids.length){ closeModal(DELETE_MODAL_ID); return; }
            try {
                const resp = await fetch('/api/datacenter/access/entries/bulk-delete', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ ids })
                });
                let payload = {};
                try { payload = await resp.json(); } catch(_e){ payload = {}; }
                if(!resp.ok || payload.success === false){
                    throw new Error(payload.message || '삭제처리에 실패했습니다.');
                }

                const deleted = Number(payload.deleted ?? ids.length) || 0;
                state.selected.clear();
                closeModal(DELETE_MODAL_ID);
                await loadRecordsFromServer({ showSpinner: true });
                if(deleted > 0){ setTimeout(()=> showMessage(`${deleted}개 항목이 삭제되었습니다.`, '완료'), 0); }
            } catch(err){
                console.error(err);
                showMessage(err.message || '삭제처리 중 오류가 발생했습니다.', '오류');
            }
        });
        // esc close (only existing modals)
        document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ [EDIT_MODAL_ID,COLUMN_MODAL_ID,DISPOSE_MODAL_ID,DELETE_MODAL_ID,'system-download-modal','system-message-modal','system-duplicate-modal',STATS_MODAL_ID].forEach(closeModal); }});
    // include stats modal in esc close
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeModal(STATS_MODAL_ID); }});

        // message modal bindings
        document.getElementById('system-message-close')?.addEventListener('click', ()=> closeModal('system-message-modal'));
        document.getElementById('system-message-ok')?.addEventListener('click', ()=> closeModal('system-message-modal'));

    // bulk form UI removed on this page

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
        bindEvents();
        render();
        // Page adornments (animation + popover)
await initData();
    }
    function boot(){
        init().catch(err=>{
            console.error('Access records init failed', err);
            showMessage('페이지 초기화 중 오류가 발생했습니다.', '오류');
        });
    }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();


