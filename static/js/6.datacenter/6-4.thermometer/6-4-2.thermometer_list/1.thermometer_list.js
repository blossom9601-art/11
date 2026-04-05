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
    const ORG_THERMOMETER_API = '/api/org-thermometers';
    const ORG_THERMOMETER_BULK_DELETE_API = '/api/org-thermometers/bulk-delete';
    const ORG_THERMOMETER_BULK_UPDATE_API = '/api/org-thermometers/bulk-update';

    async function requestJSON(url, options){
        const opts = options ? { ...options } : {};
        opts.method = opts.method || 'GET';
        opts.credentials = opts.credentials || 'same-origin';
        const headers = { ...(opts.headers || {}) };
        if(opts.body && typeof opts.body !== 'string'){
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
            opts.body = JSON.stringify(opts.body);
        } else if((opts.method && opts.method !== 'GET' && opts.method !== 'HEAD') && !headers['Content-Type']){
            headers['Content-Type'] = 'application/json';
        }
        opts.headers = headers;
        let response;
        try {
            response = await fetch(url, opts);
        } catch(_networkErr){
            throw new Error('서버와 통신하지 못했습니다. 잠시 후 다시 시도해주세요.');
        }
        let payload = null;
        try {
            payload = await response.json();
        } catch(_jsonErr){ }
        if(!response.ok || (payload && payload.success === false)){
            const message = payload?.message || `요청 실패 (HTTP ${response.status})`;
            throw new Error(message);
        }
        return payload || {};
    }

    function normalizeThermometerRow(raw){
        if(!raw || typeof raw !== 'object') return null;
        return {
            id: raw.id,
            thermo_code: raw.thermo_code || raw.device_code || '',
            business_status: raw.business_status || '-',
            business_name: raw.business_name || '-',
            vendor: raw.vendor || raw.vendor_name || '-',
            model: raw.model || raw.model_name || '-',
            serial: raw.serial || raw.serial_number || '',
            place: raw.place || raw.place_name || '-',
            system_owner_dept: raw.system_owner_dept || '-',
            system_owner: raw.system_owner || raw.system_owner_name || '-',
            service_owner_dept: raw.service_owner_dept || '-',
            service_owner: raw.service_owner || raw.service_owner_name || '-',
            created_at: raw.created_at || '',
            created_by: raw.created_by || '',
            updated_at: raw.updated_at || '',
            updated_by: raw.updated_by || '',
            is_deleted: raw.is_deleted || 0,
        };
    }

    async function createThermometer(payload){
        const response = await requestJSON(ORG_THERMOMETER_API, { method: 'POST', body: payload });
        const row = normalizeThermometerRow(response?.item || response);
        if(!row){
            throw new Error('등록된 온/습도계 정보를 확인하지 못했습니다.');
        }
        return row;
    }

    async function updateThermometer(id, payload){
        if(id == null){
            throw new Error('수정할 대상이 지정되지 않았습니다.');
        }
        const url = `${ORG_THERMOMETER_API}/${id}`;
        const response = await requestJSON(url, { method: 'PUT', body: payload });
        const row = normalizeThermometerRow(response?.item || response);
        if(!row){
            throw new Error('수정된 온/습도계 정보를 확인하지 못했습니다.');
        }
        return row;
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
    const THERMO_SEARCH_BRIDGE_KEY = 'thermo_search_bridge';

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
    // Upload template (RACK 시스템 schema)
    const UPLOAD_HEADERS_KO = [
        '업무 상태','업무 이름',
        '시스템 제조사','시스템 모델명','시스템 일련번호',
        '시스템 장소',
        '시스템 담당부서','시스템 담당자','서비스 담당부서','서비스 담당자'
    ];
    const HEADER_KO_TO_KEY = {
        '업무 상태':'business_status','업무 이름':'business_name',
        '시스템 제조사':'vendor','시스템 모델명':'model','시스템 일련번호':'serial',
        '시스템 장소':'place',
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
        'vendor','model','serial','place'
    ];
    const COLUMN_ORDER = [
        'business_status','business_name',
        'vendor','model','serial','place',
        'system_owner_dept','system_owner','service_owner_dept','service_owner'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '비즈니스', columns: ['business_status','business_name'] },
        { group: '시스템', columns: ['vendor','model','serial','place'] },
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
        system_owner_dept:{label:'시스템 담당부서',group:'담당자'},
        system_owner:{label:'시스템 담당자',group:'담당자'},
        service_owner_dept:{label:'서비스 담당부서',group:'담당자'},
        service_owner:{label:'서비스 담당자',group:'담당자'}
    };

    // Thermometer required fields (aligned with app/services/org_thermometer_service.py)
    const REQUIRED_FIELDS = new Set([
        'business_status',
        'business_name',
        'vendor',
        'model',
        'place',
    ]);

    const SEARCH_SELECT_DEFINITIONS = {
        businessStatus: {
            // Load from biz_work_status
            url: '/api/work-statuses',
            normalize: (item)=>{
                const code = String(item?.status_code || '').trim();
                const name = String(item?.status_name || item?.wc_name || code).trim();
                if(!code && !name) return null;
                return {
                    value: code || name,
                    label: name || code,
                    meta: ''
                };
            },
        },
        vendors: {
            url: '/api/vendor-manufacturers',
            normalize: (item)=>{
                const code = String(item?.manufacturer_code || '').trim();
                const label = String(item?.manufacturer_name || code).trim();
                if(!label) return null;
                return {
                    value: label,
                    label,
                    meta: ''
                };
            },
        },
        centers: {
            url: '/api/org-centers',
            normalize: (item)=>{
                const code = String(item?.center_code || '').trim();
                const label = String(item?.center_name || code).trim();
                if(!label) return null;
                return {
                    value: label,
                    label,
                    meta: ''
                };
            },
        },
        departments: {
            url: '/api/org-departments',
            normalize: (item)=>{
                const code = String(item?.dept_code || '').trim();
                const label = String(item?.dept_name || code).trim();
                if(!label) return null;
                return {
                    value: label,
                    label,
                    meta: ''
                };
            },
        },
        users: {
            url: '/api/user-profiles?limit=200',
            normalize: (item)=>{
                const name = String(item?.name || '').trim();
                const emp = String(item?.emp_no || '').trim();
                const label = name || emp;
                if(!label) return null;
                // UI requirement: show only the name (no "(사번)")
                const display = name || emp;
                const dept = String(item?.department || item?.dept_name || '').trim();
                const deptCode = String(item?.dept_code || item?.department_code || '').trim();
                return {
                    value: label,
                    label: display,
                    meta: '',
                    extra: {
                        deptTokens: createDeptTokens(dept, deptCode)
                    }
                };
            },
        },
    };

    const FIELD_SEARCH_SOURCE = {
        business_status: 'businessStatus',
        place: 'centers',
        system_owner_dept: 'departments',
        system_owner: 'users',
        service_owner_dept: 'departments',
        service_owner: 'users'
    };

    const DEPENDENT_FIELD_MAP = {
        system_owner: 'system_owner_dept',
        service_owner: 'service_owner_dept'
    };

    const searchSelectCache = new Map(); // sourceKey -> { options, loaded, promise }
    const searchSelectBindings = new WeakSet();
    const searchSelectMeta = new WeakMap();
    let activeSearchPanel = null;
    let workStatusOptions = [];
    let workStatusByCode = new Map();
    const PARENT_PROMPTS = {
        system_owner: '시스템 담당부서를 먼저 선택하세요.',
        service_owner: '서비스 담당부서를 먼저 선택하세요.'
    };

    function normalizeToken(value){
        return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
    }

    async function prefetchWorkStatuses(){
        try {
            const options = await fetchSearchOptions('businessStatus');
            workStatusOptions = Array.isArray(options) ? options : [];
            workStatusByCode = new Map(
                workStatusOptions
                    .map(opt => ({
                        code: String(opt?.value || '').trim(),
                        label: String(opt?.label || opt?.value || '').trim(),
                    }))
                    .filter(o => o.code)
                    .map(o => [o.code, o.label || o.code])
            );
        } catch(_e){
            workStatusOptions = [];
            workStatusByCode = new Map();
        }
    }

    function getWorkStatusLabel(code){
        const key = String(code ?? '').trim();
        if(!key) return '';
        return workStatusByCode.get(key) || key;
    }

    function uniquePush(tokens, raw){
        const token = normalizeToken(raw);
        if(!token) return;
        if(!tokens.includes(token)) tokens.push(token);
    }

    function createDeptTokens(name, code){
        const tokens = [];
        uniquePush(tokens, name);
        uniquePush(tokens, code);
        return tokens;
    }

    function collectInputTokens(input){
        if(!input) return [];
        const tokens = [];
        uniquePush(tokens, input.dataset?.value);
        uniquePush(tokens, input.dataset?.display);
        uniquePush(tokens, input.value);
        return tokens;
    }

    function getParentFieldInput(child){
        if(!child?.dataset?.parentField) return null;
        const scope = child.closest('form') || document;
        return scope.querySelector(`[name="${child.dataset.parentField}"]`);
    }

    function ensureParentWatcher(child){
        const parentInput = getParentFieldInput(child);
        if(!parentInput) return;
        if(parentInput.dataset.dependencyWatcher !== '1'){
            parentInput.addEventListener('change', ()=> updateChildrenForParent(parentInput));
            parentInput.dataset.dependencyWatcher = '1';
        }
        updateChildrenForParent(parentInput);
    }

    function updateChildrenForParent(parentInput){
        if(!parentInput?.name) return;
        const scope = parentInput.closest('form') || document;
        const hasDept = collectInputTokens(parentInput).length>0;
        scope.querySelectorAll(`.search-select[data-parent-field="${parentInput.name}"]`).forEach(child => {
            const hadValue = !!child.dataset?.value;
            child.disabled = !hasDept;
            if(!hasDept && hadValue){
                applySearchSelectValue(child, '', '');
                if(activeSearchPanel?.input === child){
                    closeSearchDropdown();
                }
            }
            refreshSearchSelectLabel(child);
        });
    }

    async function fetchSearchOptions(sourceKey){
        if(!sourceKey || !SEARCH_SELECT_DEFINITIONS[sourceKey]) return [];
        const cached = searchSelectCache.get(sourceKey);
        if(cached?.loaded && Array.isArray(cached.options)){
            return cached.options;
        }
        if(cached?.promise){
            return cached.promise;
        }
        const def = SEARCH_SELECT_DEFINITIONS[sourceKey];
        if(def.type === 'static'){
            const options = Array.isArray(def.options) ? def.options : [];
            searchSelectCache.set(sourceKey, { options, loaded: true, promise: null });
            return options;
        }
        const url = (typeof def.url === 'function') ? def.url() : def.url;
        const promise = requestJSON(url).then(payload => {
            const items = Array.isArray(payload?.items) ? payload.items : [];
            const options = items.map(def.normalize).filter(Boolean);
            searchSelectCache.set(sourceKey, { options, loaded: true, promise: null });
            return options;
        }).catch(err => {
            console.error(`검색 목록(${sourceKey})을 불러오지 못했습니다.`, err);
            searchSelectCache.set(sourceKey, { options: [], loaded: false, promise: null });
            return [];
        });
        searchSelectCache.set(sourceKey, { options: [], loaded: false, promise });
        return promise;
    }

    function attachSearchSelect(input){
        if(!input || !input.dataset.searchSource || searchSelectBindings.has(input)) return;
        searchSelectBindings.add(input);
        const placeholder = input.getAttribute('placeholder') || '검색 선택';
        input.dataset.placeholder = placeholder;
        // prefill dataset for existing value (e.g., edit form)
        const current = (input.dataset.value || input.dataset.display || input.value || '').trim();
        if(current && !input.dataset.value){
            input.dataset.value = current;
            input.dataset.display = current;
        }
        ensureSearchSelectControl(input);
        refreshSearchSelectLabel(input);
        if(input.dataset.parentField){
            ensureParentWatcher(input);
        }
        const form = input.form;
        if(form && form.dataset.searchSelectResetBound !== '1'){
            form.addEventListener('reset', ()=>{
                requestAnimationFrame(()=>{
                    form.querySelectorAll('input.search-select[data-search-source]').forEach(field => {
                        delete field.dataset.value;
                        delete field.dataset.display;
                        field.value = '';
                        refreshSearchSelectLabel(field);
                    });
                    form.querySelectorAll('.search-select[data-parent-field]').forEach(child => {
                        const parent = getParentFieldInput(child);
                        if(parent){
                            updateChildrenForParent(parent);
                        }
                    });
                });
            });
            form.dataset.searchSelectResetBound = '1';
        }
    }

    function initSearchSelects(scope){
        const root = scope || document;
        root.querySelectorAll('input.search-select[data-search-source]').forEach(input => attachSearchSelect(input));
    }

    function ensureSearchSelectControl(input){
        if(!input) return null;
        if(searchSelectMeta.has(input)){
            return searchSelectMeta.get(input);
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'fk-searchable-control';
        const displayBtn = document.createElement('button');
        displayBtn.type = 'button';
        displayBtn.className = 'fk-searchable-display';
        displayBtn.setAttribute('aria-haspopup', 'dialog');
        displayBtn.setAttribute('aria-expanded', 'false');
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'fk-searchable-clear';
        clearBtn.textContent = '지움';
        clearBtn.title = '선택 해제';
        clearBtn.setAttribute('aria-label', '선택 해제');
        clearBtn.hidden = true;
        clearBtn.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            applySearchSelectValue(input, '', '');
            closeSearchDropdown();
        });
        displayBtn.addEventListener('click', event => {
            event.preventDefault();
            if(input.disabled) return;
            openSearchDropdown(input);
        });
        const parent = input.parentNode;
        if(parent){
            parent.insertBefore(wrapper, input);
        }
        wrapper.appendChild(displayBtn);
        wrapper.appendChild(clearBtn);
        wrapper.appendChild(input);
        input.classList.add('fk-search-native-hidden');
        input.setAttribute('aria-hidden', 'true');
        const meta = { wrapper, displayBtn, clearBtn };
        searchSelectMeta.set(input, meta);
        return meta;
    }

    function refreshSearchSelectLabel(input){
        if(!input) return;
        const meta = searchSelectMeta.get(input) || ensureSearchSelectControl(input);
        if(!meta) return;
        const placeholder = input.dataset.placeholder || input.getAttribute('placeholder') || '검색 선택';
        const code = (input.dataset.value || '').trim();
        const display = (input.dataset.display || input.value || '').trim();
        const labelText = display || placeholder;
        meta.displayBtn.textContent = labelText;
        meta.displayBtn.title = labelText;
        const hasValue = !!code;
        meta.displayBtn.classList.toggle('has-value', hasValue);
        meta.clearBtn.hidden = !hasValue;
        const disabled = !!input.disabled;
        meta.wrapper.classList.toggle('is-disabled', disabled);
        meta.displayBtn.disabled = disabled;
        meta.clearBtn.disabled = disabled;
    }

    function applySearchSelectValue(input, value, label){
        if(!input) return;
        const code = (value || '').trim();
        const display = (label || '').trim();
        if(code){
            input.dataset.value = code;
        } else {
            delete input.dataset.value;
        }
        if(display){
            input.dataset.display = display;
            input.value = display;
        } else {
            delete input.dataset.display;
            input.value = '';
        }
        refreshSearchSelectLabel(input);
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    async function openSearchDropdown(input){
        if(!input || input.disabled) return;
        const meta = searchSelectMeta.get(input) || ensureSearchSelectControl(input);
        if(!meta) return;
        closeSearchDropdown();
        const placeholder = input.dataset.placeholder || input.getAttribute('placeholder') || '검색 선택';
        const panel = document.createElement('div');
        panel.className = 'fk-search-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', `${placeholder} 검색`);
        const header = document.createElement('div');
        header.className = 'fk-search-panel__header';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'fk-search-panel__input';
        searchInput.placeholder = '검색어 입력';
        searchInput.setAttribute('aria-label', '검색어 입력');
        searchInput.autocomplete = 'off';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'fk-search-panel__close';
        closeBtn.textContent = '닫기';
        closeBtn.setAttribute('aria-label', '닫기');
        header.appendChild(searchInput);
        header.appendChild(closeBtn);
        panel.appendChild(header);
        const list = document.createElement('div');
        list.className = 'fk-search-panel__list';
        list.setAttribute('role', 'listbox');
        panel.appendChild(list);
        const empty = document.createElement('div');
        empty.className = 'fk-search-panel__empty';
        empty.textContent = '목록을 불러오는 중...';
        panel.appendChild(empty);
        document.body.appendChild(panel);
        const state = {
            input,
            panel,
            anchor: meta.wrapper,
            trigger: meta.displayBtn,
            searchInput,
            closeBtn,
            list,
            empty,
            placeholder,
            options: [],
            filtered: [],
            focusIndex: -1,
            dependencyMessage: ''
        };
        activeSearchPanel = state;
        meta.displayBtn.setAttribute('aria-expanded', 'true');
        positionSearchPanel(state);
        setTimeout(()=> searchInput.focus(), 0);
        closeBtn.addEventListener('click', event => {
            event.preventDefault();
            closeSearchDropdown();
        });
        searchInput.addEventListener('input', ()=> filterSearchPanelOptions(state));
        searchInput.addEventListener('keydown', event => handleSearchInputKeydown(event, state));
        list.addEventListener('keydown', event => handleSearchListKeydown(event, state));
        list.addEventListener('click', event => {
            const item = event.target.closest('.fk-search-panel__item');
            if(!item) return;
            event.preventDefault();
            commitSearchPanelSelection(state, item.dataset.value);
        });
        state.handleOutside = event => {
            if(panel.contains(event.target) || meta.wrapper.contains(event.target)) return;
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
        state.handleResize = () => positionSearchPanel(state);
        window.addEventListener('resize', state.handleResize, true);
        window.addEventListener('scroll', state.handleResize, true);
        showSearchPanelMessage(state, '목록을 불러오는 중...');
        const sourceKey = input.dataset.searchSource;
        try {
            const rawOptions = await fetchSearchOptions(sourceKey);
            const options = buildSearchPanelOptions(rawOptions);
            if(!options.length){
                showSearchPanelMessage(state, '선택할 항목이 없습니다.');
                return;
            }
            state.options = options;
            state.filtered = options.slice();
            state.dependencyMessage = '';
            applyParentFilter(state);
            const currentValue = (input.dataset.value || '').trim();
            state.focusIndex = currentValue ? state.filtered.findIndex(opt => opt.value === currentValue) : -1;
            renderSearchPanelOptions(state);
            positionSearchPanel(state);
        } catch(err){
            showSearchPanelMessage(state, err?.message || '목록을 불러오지 못했습니다.');
        }
    }

    function showSearchPanelMessage(state, message){
        if(!state) return;
        state.list.innerHTML = '';
        state.empty.textContent = message;
        state.empty.hidden = false;
        state.focusIndex = -1;
    }

    function buildSearchPanelOptions(items){
        return (items || []).map(item => {
            const value = String(item?.value ?? item?.label ?? '').trim();
            const label = String(item?.label ?? value).trim();
            if(!label && !value) return null;
            const detail = String(item?.meta || '').trim();
            const searchText = [value, label, detail].filter(Boolean).join(' ').toLowerCase();
            const tokens = Array.isArray(item?.extra?.deptTokens) ? item.extra.deptTokens : [];
            return { value: value || label, label: label || value, detail, searchText, tokens };
        }).filter(Boolean);
    }

    function applyParentFilter(state){
        if(!state?.input?.dataset?.parentField) return false;
        const parentInput = getParentFieldInput(state.input);
        const parentTokens = collectInputTokens(parentInput);
        if(!parentTokens.length){
            state.filtered = [];
            state.dependencyMessage = PARENT_PROMPTS[state.input.name] || '상위 항목을 먼저 선택하세요.';
            return true;
        }
        state.filtered = state.filtered.filter(opt => {
            const tokens = Array.isArray(opt.tokens) ? opt.tokens : [];
            if(!tokens.length) return false;
            return tokens.some(token => parentTokens.includes(token));
        });
        if(!state.filtered.length){
            state.dependencyMessage = '선택한 부서에 등록된 담당자가 없습니다.';
            return true;
        }
        state.dependencyMessage = '';
        return false;
    }

    function renderSearchPanelOptions(state){
        if(!state) return;
        state.list.innerHTML = '';
        if(!state.filtered.length){
            const message = state.dependencyMessage || (state.searchInput.value.trim() ? '검색 결과가 없습니다.' : '선택할 항목이 없습니다.');
            showSearchPanelMessage(state, message);
            return;
        }
        state.empty.hidden = true;
        const currentValue = (state.input.dataset.value || '').trim();
        state.filtered.forEach((opt, index) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'fk-search-panel__item';
            btn.dataset.value = opt.value;
            btn.setAttribute('role', 'option');
            btn.innerHTML = `<span class="fk-search-panel__label">${escapeHTML(opt.label)}</span>` +
                (opt.detail ? `<span class="fk-search-panel__meta">${escapeHTML(opt.detail)}</span>` : '');
            if(opt.value === currentValue){
                btn.classList.add('selected');
                btn.setAttribute('aria-selected', 'true');
                state.focusIndex = index;
            } else {
                btn.setAttribute('aria-selected', 'false');
            }
            state.list.appendChild(btn);
        });
        if(state.focusIndex >= 0){
            focusSearchPanelItem(state, state.focusIndex, { focus: false });
        } else {
            state.focusIndex = -1;
        }
    }

    function focusSearchPanelItem(state, index, opts){
        if(!state) return;
        const items = state.list.querySelectorAll('.fk-search-panel__item');
        if(!items.length) return;
        const maxIndex = items.length - 1;
        const targetIndex = Math.max(0, Math.min(index, maxIndex));
        state.focusIndex = targetIndex;
        items.forEach((btn, idx) => {
            const isActive = idx === targetIndex;
            btn.classList.toggle('active', isActive);
            if(isActive && opts?.focus !== false){
                btn.focus({ preventScroll: true });
            }
        });
        if(opts?.ensureVisible){
            const target = items[targetIndex];
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

    function filterSearchPanelOptions(state){
        if(!state) return;
        const term = state.searchInput.value.trim().toLowerCase();
        if(!term){
            state.filtered = state.options.slice();
        } else {
            state.filtered = state.options.filter(opt => opt.searchText.includes(term));
        }
        const currentValue = (state.input.dataset.value || '').trim();
        state.dependencyMessage = '';
        applyParentFilter(state);
        state.focusIndex = currentValue ? state.filtered.findIndex(opt => opt.value === currentValue) : -1;
        renderSearchPanelOptions(state);
    }

    function handleSearchInputKeydown(event, state){
        if(event.key === 'ArrowDown'){
            event.preventDefault();
            if(!state.filtered.length) return;
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
        } else if(event.key === 'Escape'){
            event.preventDefault();
            closeSearchDropdown();
        }
    }

    function handleSearchListKeydown(event, state){
        const isItem = !!event.target?.classList?.contains('fk-search-panel__item');
        if(!isItem) return;
        if(event.key === 'ArrowDown'){
            event.preventDefault();
            focusSearchPanelItem(state, (state.focusIndex >= 0 ? state.focusIndex + 1 : 0), { ensureVisible: true });
        } else if(event.key === 'ArrowUp'){
            event.preventDefault();
            if(state.focusIndex <= 0){
                state.focusIndex = -1;
                state.searchInput.focus();
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
            closeSearchDropdown();
        }
    }

    function commitSearchPanelSelection(state, value){
        if(!state || !state.input) return;
        const option = state.options.find(opt => opt.value === value);
        applySearchSelectValue(state.input, option?.value || '', option?.label || option?.value || '');
        closeSearchDropdown();
    }

    function positionSearchPanel(state){
        if(!state || !state.panel || !state.anchor) return;
        const rect = state.anchor.getBoundingClientRect();
        const margin = 8;
        const width = Math.max(rect.width, 280);
        state.panel.style.width = `${width}px`;
        state.panel.style.zIndex = '5000';
        let left = rect.left;
        if(left + width > window.innerWidth - margin){
            left = window.innerWidth - width - margin;
        }
        left = Math.max(margin, left);
        let top = rect.bottom + margin;
        const availableBelow = window.innerHeight - rect.bottom - margin;
        const availableAbove = rect.top - margin;
        const panelHeight = state.panel.offsetHeight || 320;
        if(panelHeight > availableBelow && availableAbove > availableBelow){
            top = rect.top - panelHeight - margin;
            state.panel.classList.add('placement-above');
        } else {
            state.panel.classList.remove('placement-above');
        }
        top = Math.max(margin, top);
        state.panel.style.left = `${left}px`;
        state.panel.style.top = `${top}px`;
    }

    function closeSearchDropdown(){
        if(!activeSearchPanel) return;
        const state = activeSearchPanel;
        activeSearchPanel = null;
        if(state.trigger){
            state.trigger.setAttribute('aria-expanded', 'false');
        }
        if(state.panel?.parentNode){
            state.panel.parentNode.removeChild(state.panel);
        }
        if(state.handleOutside){
            document.removeEventListener('pointerdown', state.handleOutside, true);
        }
        if(state.handleKeydown){
            document.removeEventListener('keydown', state.handleKeydown, true);
        }
        if(state.handleResize){
            window.removeEventListener('resize', state.handleResize, true);
            window.removeEventListener('scroll', state.handleResize, true);
        }
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
        columnFilters: {}, // { col: value | [values...] } (조건 필터 기능 제거 예정 - 빈 유지)
        isLoading: false,
        loadError: null
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
                place: '판교센터',
                system_owner_dept: '인프라팀', system_owner: '홍길동',
                service_owner_dept: '보안팀', service_owner: '김영희'
            },
            {
                id: 2,
                business_status: '유휴', business_name: 'DW',
                vendor: 'Dell', model: 'PowerEdge R740', serial: 'D123-9876',
                place: '상암센터',
                system_owner_dept: '플랫폼팀', system_owner: '이철수',
                service_owner_dept: '데이터팀', service_owner: '박민수'
            },
            {
                id: 3,
                business_status: '가동', business_name: 'ERP',
                vendor: 'Cisco', model: 'UCS C240 M5', serial: 'CIS-5566',
                place: '판교센터',
                system_owner_dept: '인프라팀', system_owner: '최가을',
                service_owner_dept: '재무팀', service_owner: '오상준'
            },
            {
                id: 4,
                business_status: '대기', business_name: '차세대API',
                vendor: 'Lenovo', model: 'ThinkSystem SR650', serial: 'LN-8899',
                place: '광주센터',
                system_owner_dept: '플랫폼팀', system_owner: '윤하늘',
                service_owner_dept: '플랫폼팀', service_owner: '윤하늘'
            },
            {
                id: 5,
                business_status: '가동', business_name: '모바일뱅킹',
                vendor: 'Supermicro', model: 'SYS-2029P', serial: 'SMC-2029P-01',
                place: '상암센터',
                system_owner_dept: '인프라팀', system_owner: '한별',
                service_owner_dept: '서비스개발팀', service_owner: '강동원'
            }
        ];
        return rows.slice(0, Math.max(0, count|0));
    }

    async function loadThermometerData(options){
        const opts = options || {};
        if(!opts.silent){
            state.isLoading = true;
            state.loadError = null;
            render();
        }
        try {
            // Ensure status code -> name mapping is ready for table rendering
            if(!workStatusByCode.size){
                await prefetchWorkStatuses();
            }
            const payload = await requestJSON(ORG_THERMOMETER_API);
            const items = Array.isArray(payload.items) ? payload.items : [];
            const normalized = items.map(normalizeThermometerRow).filter(Boolean);
            state.data = normalized;
            state.selected.clear();
            state.isLoading = false;
            state.loadError = null;
            const maxId = normalized.reduce((acc, row)=>{
                const rid = Number(row?.id);
                if(Number.isFinite(rid) && rid > acc){ return rid; }
                return acc;
            }, 0);
            state.nextId = Math.max(maxId + 1, 1);
            applyFilter();
        } catch(error){
            console.error(error);
            state.isLoading = false;
            state.loadError = error.message || '온/습도계 목록을 불러오지 못했습니다.';
            state.data = [];
            state.filtered = [];
            render();
            if(!opts.silent){
                showMessage(state.loadError, '오류');
            }
        }
    }

    function initData(){
        loadThermometerData();
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
    syncThermoSearchBridge(qRaw, flatTokens);
    }

    function syncThermoSearchBridge(rawQuery, tokens){
        if(typeof window === 'undefined' || !window.localStorage) return;
        const trimmed = (rawQuery || '').trim();
        try {
            if(trimmed){
                const payload = {
                    query: trimmed,
                    tokens: Array.isArray(tokens) ? tokens.filter(Boolean) : [],
                    source: 'thermometer-list',
                    timestamp: Date.now()
                };
                window.localStorage.setItem(THERMO_SEARCH_BRIDGE_KEY, JSON.stringify(payload));
            } else {
                window.localStorage.removeItem(THERMO_SEARCH_BRIDGE_KEY);
            }
        } catch(err){
            console.warn('[thermo-bridge] 저장 실패', err);
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
                if(state.isLoading){
                    if(titleEl) titleEl.textContent = '데이터를 불러오는 중입니다.';
                    if(descEl) descEl.textContent = '잠시만 기다려주세요.';
                } else if(state.loadError){
                    if(titleEl) titleEl.textContent = '목록을 불러오지 못했습니다.';
                    if(descEl) descEl.textContent = state.loadError;
                } else if(state.search.trim()){
                    if(titleEl) titleEl.textContent = '검색 결과가 없습니다.';
                    if(descEl) descEl.textContent = '검색어를 변경하거나 필터를 초기화하세요.';
                } else {
                    if(titleEl) titleEl.textContent = '온/습도계가 없습니다.';
                    if(descEl) descEl.textContent = "우측 상단 '추가' 버튼을 눌러 첫 온/습도계를 등록하세요.";
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
                        const code = String(rawVal ?? '').trim();
                        const label = code ? getWorkStatusLabel(code) : String(displayVal);
                        const map = { '가동':'ws-run', '유휴':'ws-idle', '대기':'ws-wait' };
                        const cls = map[label] || 'ws-wait';
                        cellValue = `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${highlight(label || '-', col)}</span></span>`;
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
    // loadColumnSelection 제거: 이 페이지는 항상 초기화 상태로 시작

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
        buildColumnModal();
        applyColumnVisibility();
    }

    // Add / Edit
    function collectForm(form){
        const data={};
        form.querySelectorAll('input,select,textarea').forEach(el=>{
            if(!el.name) return;
            const raw = (el.value ?? '').trim();
            if(el.classList?.contains('search-select') && Object.prototype.hasOwnProperty.call(el.dataset || {}, 'value')){
                const normalized = (el.dataset.value ?? '').trim();
                data[el.name] = normalized || raw;
            } else {
                data[el.name] = raw;
            }
        });
        return data;
    }

    function fillEditForm(row){
        const form = document.getElementById(EDIT_FORM_ID); if(!form) return;
        form.innerHTML='';
        if(row && row.id != null){
            form.dataset.recordId = String(row.id);
        } else {
            delete form.dataset.recordId;
        }
        const groups = [
            { title:'비즈니스', cols:['business_status','business_name'] },
            { title:'시스템', cols:['vendor','model','serial','place'] },
            { title:'담당자', cols:['system_owner_dept','system_owner','service_owner_dept','service_owner'] }
        ];
        groups.forEach(g=>{
            const section = document.createElement('div'); section.className='form-section';
            section.innerHTML = `<div class="section-header"><h4>${g.title}</h4></div>`;
            const grid = document.createElement('div'); grid.className='form-grid';
            g.cols.forEach(c=>{ if(!COLUMN_META[c]) return; const wrap=document.createElement('div');
                wrap.className = 'form-row';
                const labelText = COLUMN_META[c]?.label||c;
                const requiredMark = REQUIRED_FIELDS.has(c) ? ' <span class="required">*</span>' : '';
                wrap.innerHTML=`<label>${labelText}${requiredMark}</label>${generateFieldInput(c,row[c])}`; grid.appendChild(wrap); });
            section.appendChild(grid); form.appendChild(section);
        });
        form.querySelectorAll('.search-select').forEach(input=>{
            const current = (input.value || '').trim();
            if(!current){
                delete input.dataset.value;
                delete input.dataset.display;
                return;
            }
            // Default: show what we have.
            input.dataset.value = current;
            input.dataset.display = current;

            // Special case: work status is stored as code, but should DISPLAY as name.
            if(input.dataset.searchSource === 'businessStatus'){
                const applyLabel = ()=>{
                    const label = getWorkStatusLabel(current);
                    if(label && label !== current){
                        input.dataset.display = label;
                        input.value = label;
                        refreshSearchSelectLabel(input);
                    }
                };
                if(workStatusByCode && workStatusByCode.size){
                    applyLabel();
                } else {
                    prefetchWorkStatuses().then(applyLabel);
                }
            }
        });
        initSearchSelects(form);
    }

    function generateFieldInput(col,value=''){
        const val = escapeHTML(String(value ?? ''));
        const requiredAttr = REQUIRED_FIELDS.has(col) ? ' required' : '';
        if(col==='business_status'){
            return `<input name="business_status" class="form-input search-select" placeholder="검색 선택" data-search-source="${FIELD_SEARCH_SOURCE.business_status}" value="${val}"${requiredAttr}>`;
        }
        if(col==='business_name'){
            return `<input name="business_name" class="form-input" placeholder="필수" value="${val}" required>`;
        }
        if(col==='vendor'){
            // 제조사: 외래키/검색선택 사용하지 않고 자유 입력
            return `<input name="vendor" class="form-input" placeholder="입력" value="${val}"${requiredAttr}>`;
        }
        const sourceKey = FIELD_SEARCH_SOURCE[col];
        if(sourceKey){
            const parentAttr = DEPENDENT_FIELD_MAP[col] ? ` data-parent-field="${DEPENDENT_FIELD_MAP[col]}"` : '';
            return `<input name="${col}" class="form-input search-select" placeholder="검색 선택" data-search-source="${sourceKey}"${parentAttr} value="${val}"${requiredAttr}>`;
        }
        if(col==='model'){
            return `<input name="model" class="form-input" placeholder="입력" value="${val}"${requiredAttr}>`;
        }
        if(col==='serial'){
            return `<input name="serial" class="form-input" value="${val}">`;
        }
        return `<input name="${col}" class="form-input" value="${val}"${requiredAttr}>`;
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
        if(!data || typeof data !== 'object') return;
        const row = { ...data };
        const existingId = Number(row.id);
        if(Number.isFinite(existingId)){
            state.nextId = Math.max(state.nextId, existingId + 1);
            const idx = state.data.findIndex(r => Number(r.id) === existingId);
            if(idx !== -1){
                state.data[idx] = row;
            } else {
                state.data.unshift(row); // 맨 앞 삽입
            }
        } else {
            row.id = state.nextId++;
            state.data.unshift(row);
        }
        applyFilter();
    }

    function updateRow(index,data){
        if(state.data[index]){ state.data[index] = {...state.data[index], ...data}; applyFilter(); }
    }

    function normalizeNumberedCopyBase(value){
        const s = String(value ?? '').trim();
        if(!s || s === '-') return s;
        return s.replace(/\s*\(\d+\)\s*$/,'').trim();
    }

    function nextNumberedCopyValue(value, existingSet){
        const base = normalizeNumberedCopyBase(value);
        if(!base || base === '-') return value;
        let n = 1;
        let candidate = `${base} (${n})`;
        while(existingSet.has(candidate)){
            n += 1;
            candidate = `${base} (${n})`;
        }
        existingSet.add(candidate);
        return candidate;
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
        initSearchSelects(document);
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
        document.getElementById(ADD_BTN_ID)?.addEventListener('click', ()=> { openModal(ADD_MODAL_ID); });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(ADD_FORM_ID);
            const button = document.getElementById(ADD_SAVE_ID);
            if(!form?.checkValidity()){ form?.reportValidity(); return; }
            const payload = collectForm(form);
            button.disabled = true;
            try {
                const created = await createThermometer(payload);
                addRow(created);
                form.reset();
                closeModal(ADD_MODAL_ID);
                showMessage('온/습도계가 등록되었습니다.', '완료');
            } catch(error){
                console.error(error);
                showMessage(error?.message || '온/습도계 등록 중 오류가 발생했습니다.', '오류');
            } finally {
                button.disabled = false;
            }
        });
        // edit modal
        document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(EDIT_FORM_ID);
            const button = document.getElementById(EDIT_SAVE_ID);
            if(!form){ return; }
            if(!form.checkValidity()){ form.reportValidity(); return; }
            const recordId = parseInt(form.dataset.recordId || '', 10);
            if(!Number.isFinite(recordId)){
                showMessage('수정할 온/습도계를 찾을 수 없습니다.', '오류');
                return;
            }
            const payload = collectForm(form);
            button.disabled = true;
            try {
                const updated = await updateThermometer(recordId, payload);
                if(updated){
                    const idx = state.data.findIndex(r => Number(r.id) === Number(updated.id));
                    if(idx === -1){ addRow(updated); }
                    else { state.data[idx] = updated; applyFilter(); }
                }
                closeModal(EDIT_MODAL_ID);
                showMessage('온/습도계가 수정되었습니다.', '완료');
            } catch(error){
                console.error(error);
                showMessage(error?.message || '온/습도계 수정 중 오류가 발생했습니다.', '오류');
            } finally {
                button.disabled = false;
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
                    const wide = ['업무 이름'];
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
                        // RACK 시스템: 별도 숫자 필드 검증 없음
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
            if(subtitle){ subtitle.textContent = '선택된 행의 복제본을 생성합니다.'; }
            openModal('system-duplicate-modal');
        });
        document.getElementById('system-duplicate-close')?.addEventListener('click', ()=> closeModal('system-duplicate-modal'));
        document.getElementById('system-duplicate-confirm')?.addEventListener('click', ()=>{
            const originals = state.data.filter(r=> state.selected.has(r.id));
            if(!originals.length){ showMessage('선택된 행을 찾을 수 없습니다.', '오류'); closeModal('system-duplicate-modal'); return; }

            const existingBusinessNames = new Set(
                state.data
                    .map(r => String(r?.business_name ?? '').trim())
                    .filter(v => v && v !== '-')
            );
            const existingSerials = new Set(
                state.data
                    .map(r => String(r?.serial ?? '').trim())
                    .filter(v => v && v !== '-')
            );

            const clones = originals.map(o=>{
                const copy = {...o};
                delete copy.id; // new id assigned

                // 중복 불가: 업무 이름 + 시스템 일련번호
                if(copy.business_name){
                    copy.business_name = nextNumberedCopyValue(copy.business_name, existingBusinessNames);
                }
                if(copy.serial){
                    copy.serial = nextNumberedCopyValue(copy.serial, existingSerials);
                }

                return copy;
            });
            clones.forEach(c=> addRow(c));
            closeModal('system-duplicate-modal');
            showMessage(clones.length + '개 행이 복제되었습니다.', '완료');
        });
        // delete (삭제처리)
        document.getElementById(DELETE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('삭제처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('delete-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 시스템을 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', async ()=>{
            const confirmBtn = document.getElementById(DELETE_CONFIRM_ID);
            const selectedIds = [...state.selected]
                .map(v => {
                    const parsed = Number(v);
                    return Number.isFinite(parsed) ? parsed : null;
                })
                .filter(v => v != null);

            if(selectedIds.length === 0){
                closeModal(DELETE_MODAL_ID);
                return;
            }

            if(confirmBtn){
                confirmBtn.disabled = true;
            }
            try {
                await requestJSON(ORG_THERMOMETER_BULK_DELETE_API, {
                    method: 'POST',
                    body: { ids: selectedIds }
                });

                state.selected.clear();
                closeModal(DELETE_MODAL_ID);

                // Reload from server so the table reflects persisted state.
                await loadThermometerData({ silent: true });

                setTimeout(()=> showMessage(`${selectedIds.length}개 항목이 삭제되었습니다.`, '완료'), 0);
            } catch(error){
                console.error(error);
                showMessage(error?.message || '삭제처리 중 오류가 발생했습니다.', '오류');
            } finally {
                if(confirmBtn){
                    confirmBtn.disabled = false;
                }
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
                return;
            }
            // 2개 이상 → 일괄변경 모달
            const subtitle = document.getElementById('bulk-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 시스템에서 지정한 필드를 일괄 변경합니다.`; }
            buildBulkForm();
            openModal(BULK_MODAL_ID);
        });
        document.getElementById(BULK_CLOSE_ID)?.addEventListener('click', ()=> closeModal(BULK_MODAL_ID));
        document.getElementById(BULK_APPLY_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(BULK_FORM_ID); if(!form) return;
            const applyBtn = document.getElementById(BULK_APPLY_ID);
            const entries = [...form.querySelectorAll('[data-bulk-field]')]
                .map(el=>{
                    const field = el.getAttribute('data-bulk-field');
                    let value = (el.value ?? '');
                    // For search-select, prefer the underlying selected value (code)
                    if(el.classList?.contains('search-select') && Object.prototype.hasOwnProperty.call(el.dataset || {}, 'value')){
                        value = (el.dataset.value ?? '').trim() || String(value).trim();
                    } else {
                        value = String(value).trim();
                    }
                    return { field, value };
                })
                .filter(p=> p.value !== '');
            if(!entries.length){ showMessage('변경할 값을 1개 이상 입력하세요.', '안내'); return; }
            const selectedIds = [...state.selected]
                .map(v => {
                    const parsed = Number(v);
                    return Number.isFinite(parsed) ? parsed : null;
                })
                .filter(v => v != null);
            if(!selectedIds.length){
                showMessage('변경할 항목을 선택하세요.', '안내');
                return;
            }
            const updates = {};
            entries.forEach(({field, value})=>{ updates[field] = value; });

            if(applyBtn){
                applyBtn.disabled = true;
            }
            try {
                await requestJSON(ORG_THERMOMETER_BULK_UPDATE_API, {
                    method: 'POST',
                    body: { ids: selectedIds, updates }
                });
                closeModal(BULK_MODAL_ID);
                await loadThermometerData({ silent: true });
                setTimeout(()=> showMessage(`${selectedIds.length}개 항목에 일괄 변경이 적용되었습니다.`, '완료'), 0);
            } catch(error){
                console.error(error);
                showMessage(error?.message || '일괄변경 중 오류가 발생했습니다.', '오류');
            } finally {
                if(applyBtn){
                    applyBtn.disabled = false;
                }
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
        // Bulk edit should not include these fields.
        // - 업무 이름 (business_name)
        // - 시스템 일련번호 (serial)
        const EXCLUDE = new Set(['business_name', 'serial']);
        function inputFor(col){
            if(col === 'business_status'){
                return `<input name="business_status" class="form-input search-select" placeholder="검색 선택" data-search-source="businessStatus" data-bulk-field="business_status">`;
            }
            if(col === 'place'){
                return `<input name="place" class="form-input search-select" placeholder="검색 선택" data-search-source="centers" data-bulk-field="place">`;
            }
            if(col === 'system_owner_dept'){
                return `<input name="system_owner_dept" class="form-input search-select" placeholder="검색 선택" data-search-source="departments" data-bulk-field="system_owner_dept">`;
            }
            if(col === 'system_owner'){
                return `<input name="system_owner" class="form-input search-select" placeholder="검색 선택" data-search-source="users" data-parent-field="system_owner_dept" data-bulk-field="system_owner">`;
            }
            if(col === 'service_owner_dept'){
                return `<input name="service_owner_dept" class="form-input search-select" placeholder="검색 선택" data-search-source="departments" data-bulk-field="service_owner_dept">`;
            }
            if(col === 'service_owner'){
                return `<input name="service_owner" class="form-input search-select" placeholder="검색 선택" data-search-source="users" data-parent-field="service_owner_dept" data-bulk-field="service_owner">`;
            }
            return `<input name="${col}" class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }
        const GROUPS = [
            { title:'비즈니스', cols:['business_status'] },
            { title:'시스템', cols:['vendor','model','place'] },
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

        // Bind search-select controls inside bulk form (dynamic DOM)
        initSearchSelects(form);
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
        (function(){
            const dist = {};
            (workStatusOptions || []).forEach(o=>{
                const label = String(o?.label || o?.value || '').trim();
                if(label) dist[label] = 0;
            });
            rows.forEach(r=>{
                const code = String(r?.business_status ?? '').trim();
                if(!code) return;
                const label = getWorkStatusLabel(code);
                if(!label) return;
                dist[label] = (dist[label] || 0) + 1;
            });
            const fixed = Object.keys(dist);
            renderStatBlock('stats-software', '업무 상태', dist, fixed);
        })();
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
    // preload work statuses so the table shows status names (not codes)
    prefetchWorkStatuses().then(()=>{
        // If data already loaded, rerender to reflect labels
        if(state.data && state.data.length){
            render();
        }
    });

    // 기본 표 상태는 '컬럼 선택 → 초기화'와 동일하게 시작
    state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
    saveColumnSelection();
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


