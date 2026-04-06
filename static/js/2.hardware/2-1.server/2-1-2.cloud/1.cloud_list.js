/**
 * 시스템 관리 페이지 스크립트
 * - 컬럼 토글 (기본 10개 노출)
 * - 로컬(in-memory) 데이터 렌더링 + 페이징 + 검색
 * - 모달 (등록/수정/컬럼 선택)
 * - CSV 다운로드 (현재 페이지 or 전체)
 * NOTE: 서버 연동 전 단계로 mock 데이터 사용
 */

(function(){
    // Detail page route (injected from template if available)
    const DETAIL_URL = (typeof window !== 'undefined' && window.__HW_CLOUD_DETAIL_URL) || '/p/hw_server_cloud_detail';
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
    // Use a page-specific storage key to avoid collisions with other pages
    const VISIBLE_COLS_KEY = 'cloud_visible_cols';
    const OLD_VISIBLE_COLS_KEY = 'system_visible_cols';

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
    // Expected Korean headers for upload template (order must match exactly). '보안 점수' intentionally excluded; computed automatically.
    const UPLOAD_HEADERS_KO = [
        '업무 분류','업무 구분','업무 상태','업무 운영','업무 그룹','업무 이름',
        '시스템 이름','시스템 IP','관리 IP',
        '시스템 제조사','시스템 모델명','시스템 일련번호','시스템 가상화',
        '시스템 장소','시스템 위치','시스템 슬롯','시스템 크기','RACK 전면/후면',
        '시스템 담당부서','시스템 담당자','서비스 담당부서','서비스 담당자',
        '기밀성','무결성','가용성','시스템 등급','핵심/일반','DR 구축여부','서비스 이중화'
    ];
    const HEADER_KO_TO_KEY = {
        '업무 분류':'work_type','업무 구분':'work_category','업무 상태':'work_status','업무 운영':'work_operation','업무 그룹':'work_group','업무 이름':'work_name',
        '시스템 이름':'system_name','시스템 IP':'system_ip','관리 IP':'manage_ip',
        '시스템 제조사':'vendor','시스템 모델명':'model','시스템 일련번호':'serial','시스템 가상화':'virtualization',
        '시스템 장소':'location_place','시스템 위치':'location_pos','시스템 슬롯':'slot','시스템 크기':'u_size','RACK 전면/후면':'rack_face',
        '시스템 담당부서':'sys_dept','시스템 담당자':'sys_owner','서비스 담당부서':'svc_dept','서비스 담당자':'svc_owner',
        '기밀성':'confidentiality','무결성':'integrity','가용성':'availability',
        '시스템 등급':'system_grade','핵심/일반':'core_flag','DR 구축여부':'dr_built','서비스 이중화':'svc_redundancy'
    };
    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
    function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }

    // Data + State
    const BASE_VISIBLE_COLUMNS = [ // 기본 노출 요구: 업무 상태, 업무 그룹, 업무 이름, 시스템 이름, 시스템 IP, 관리 IP, 시스템 제조사, 시스템 모델명, 시스템 일련번호, 시스템 담당자
        'work_status','work_group','work_name','system_name','system_ip','manage_ip','vendor','model','serial','sys_owner'
    ];
    const COLUMN_ORDER = [
        'work_type','work_category','work_status','work_operation','work_group','work_name','system_name','system_ip','manage_ip','vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','rack_face','sys_dept','sys_owner','svc_dept','svc_owner','confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '비즈니스', columns: ['work_type','work_category','work_status','work_operation','work_group','work_name','system_name','system_ip','manage_ip'] },
        { group: '시스템', columns: ['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','rack_face'] },
        { group: '담당자', columns: ['sys_dept','sys_owner','svc_dept','svc_owner'] },
        { group: '점검', columns: ['confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        work_type:{label:'업무 분류',group:'업무'},
        work_category:{label:'업무 구분',group:'업무'},
        work_status:{label:'업무 상태',group:'업무'},
        work_operation:{label:'업무 운영',group:'업무'},
        work_group:{label:'업무 그룹',group:'업무'},
        work_name:{label:'업무 이름',group:'업무'},
        system_name:{label:'시스템 이름',group:'시스템'},
        system_ip:{label:'시스템 IP',group:'시스템'},
        manage_ip:{label:'관리 IP',group:'시스템'},
        vendor:{label:'시스템 제조사',group:'시스템'},
        model:{label:'시스템 모델명',group:'시스템'},
        serial:{label:'시스템 일련번호',group:'시스템'},
        virtualization:{label:'시스템 가상화',group:'시스템'},
        location_place:{label:'시스템 장소',group:'위치'},
        location_pos:{label:'시스템 위치',group:'위치'},
        slot:{label:'시스템 슬롯',group:'위치'},
        u_size:{label:'시스템 크기',group:'위치'},
        rack_face:{label:'RACK 전면/후면',group:'위치'},
        sys_dept:{label:'시스템 담당부서',group:'조직'},
        sys_owner:{label:'시스템 담당자',group:'조직'},
        svc_dept:{label:'서비스 담당부서',group:'조직'},
        svc_owner:{label:'서비스 담당자',group:'조직'},
        confidentiality:{label:'기밀성',group:'보안'},
        integrity:{label:'무결성',group:'보안'},
        availability:{label:'가용성',group:'보안'},
        security_score:{label:'보안 점수',group:'보안'},
        system_grade:{label:'시스템 등급',group:'보안'},
        core_flag:{label:'핵심/일반',group:'보안'},
        dr_built:{label:'DR 구축여부',group:'보안'},
        svc_redundancy:{label:'서비스 이중화',group:'보안'}
    };

    const API_ENDPOINT = '/api/hardware/cloud/assets';
    const API_PAGE_SIZE = 1000;
    const DEFAULT_ASSET_PREFIX = 'SRV-CLD';
    const FIELD_TO_PAYLOAD_KEY = {
        work_type: 'work_type',
        work_category: 'work_category',
        work_status: 'work_status',
        work_operation: 'work_operation',
        work_group: 'work_group',
        work_name: 'work_name',
        system_name: 'system_name',
        system_ip: 'system_ip',
        manage_ip: 'mgmt_ip',
        vendor: 'vendor',
        model: 'model',
        serial: 'serial_number',
        virtualization: 'virtualization_type',
        location_place: 'center_code',
        location_pos: 'rack_code',
        slot: 'system_slot',
        u_size: 'system_size',
        rack_face: 'rack_face',
        sys_dept: 'system_department',
        sys_owner: 'system_owner',
        svc_dept: 'service_department',
        svc_owner: 'service_owner',
        confidentiality: 'cia_confidentiality',
        integrity: 'cia_integrity',
        availability: 'cia_availability',
        security_score: 'security_score',
        system_grade: 'system_grade',
        core_flag: 'core_flag',
        dr_built: 'dr_built',
        svc_redundancy: 'svc_redundancy'
    };
    const NUMERIC_PAYLOAD_KEYS = new Set(['cia_confidentiality','cia_integrity','cia_availability','security_score','system_slot','system_size']);
    const ENABLE_CLOUD_DUPLICATE = false;
    const ENABLE_CLOUD_BULK_EDIT = false;
    const SERVER_MODEL_FORM_FACTOR_FILTER = '클라우드';

    const FK_SOURCE_CONFIG = {
        WORK_CATEGORY: { endpoint: '/api/work-categories', valueKey: 'category_code', labelKey: 'wc_name' },
        WORK_DIVISION: { endpoint: '/api/work-divisions', valueKey: 'division_code', labelKey: 'wc_name' },
        WORK_STATUS: { endpoint: '/api/work-statuses', valueKey: 'status_code', labelKey: 'wc_name' },
        WORK_OPERATION: { endpoint: '/api/work-operations', valueKey: 'operation_code', labelKey: 'wc_name' },
        WORK_GROUP: { endpoint: '/api/work-groups', valueKey: 'group_code', labelKey: 'group_name' },
        VENDOR: { endpoint: '/api/vendor-manufacturers', valueKey: 'manufacturer_code', labelKey: 'manufacturer_name' },
        SERVER_MODEL: { endpoint: '/api/hw-server-types', valueKey: 'server_code', labelKey: 'model_name' },
        ORG_CENTER: { endpoint: '/api/org-centers', valueKey: 'center_code', labelKey: 'center_name' },
        ORG_RACK: { endpoint: '/api/org-racks', valueKey: 'rack_code', labelKey: 'rack_name' },
        ORG_DEPT: { endpoint: '/api/org-departments', valueKey: 'dept_code', labelKey: 'dept_name' },
        USER_PROFILE: { endpoint: '/api/user-profiles', valueKey: 'emp_no', labelKey: 'name' },
    };

    function formatUserOption(item, value){
        const name = (item.name || '').trim();
        return name || (value || '');
    }

    function buildUserOptionMeta(item){
        return {
            ownerName: (item?.name || '').trim(),
            ownerDept: (item?.department || '').trim() || (item?.company || '').trim(),
            ownerEmp: (item?.emp_no || '').trim()
        };
    }

    function formatModelOption(item, value){
        const model = (item.model_name || '').trim();
        return model || (value || '');
    }

    function formatCenterOption(item, value){
        const name = (item.center_name || '').trim();
        const location = (item.location || '').trim();
        const usage = (item.usage || '').trim();
        const parts = [];
        if(name) parts.push(name);
        if(location) parts.push(location);
        if(usage) parts.push(usage);
        const label = parts.join(' · ');
        return label || value;
    }

    function formatRackOption(item, value){
        const rackName = (item.rack_name || '').trim();
        return rackName || (value || '');
    }

    const FK_FIELD_SPECS = {
        work_type: { source: 'WORK_CATEGORY', searchable: true },
        work_category: { source: 'WORK_DIVISION', searchable: true },
        work_status: { source: 'WORK_STATUS', searchable: true },
        work_operation: { source: 'WORK_OPERATION', searchable: true },
        work_group: { source: 'WORK_GROUP', searchable: true },
        vendor: { source: 'VENDOR', searchable: true },
        model: { source: 'SERVER_MODEL', optionFormatter: formatModelOption, searchable: true, dependsOn: 'vendor' },
        location_place: { source: 'ORG_CENTER', placeholder: '센터 선택', optionFormatter: formatCenterOption, searchable: true },
        location_pos: { source: 'ORG_RACK', placeholder: '랙 선택', optionFormatter: formatRackOption, searchable: true },
        sys_dept: { source: 'ORG_DEPT', placeholder: '부서 선택', searchable: true },
        svc_dept: { source: 'ORG_DEPT', placeholder: '부서 선택', searchable: true },
        sys_owner: {
            source: 'USER_PROFILE',
            placeholder: '담당자 선택',
            optionFormatter: formatUserOption,
            optionMeta: buildUserOptionMeta,
            skipAutoOptions: true,
            dependsOn: 'sys_dept',
            searchable: true
        },
        svc_owner: {
            source: 'USER_PROFILE',
            placeholder: '담당자 선택',
            optionFormatter: formatUserOption,
            optionMeta: buildUserOptionMeta,
            skipAutoOptions: true,
            dependsOn: 'svc_dept',
            searchable: true
        },
    };

    const fkSourceCache = new Map();
    let fkDataPromise = null;
    const deptCodeToName = new Map();
    const workGroupCodeToName = new Map();
    const userProfileByDeptCache = new Map();
    let ownerDependencyPairs = null;
    let modelDependencyPairs = null;
    let allUserProfilesPromise = null;
    let allUserProfilesCache = null;

    function getAllowedManufacturerCodesForPage(){
        if(!fkSourceCache.has('SERVER_MODEL')){
            return null;
        }
        const records = fkSourceCache.get('SERVER_MODEL') || [];
        const allowed = new Set();
        (Array.isArray(records) ? records : []).forEach(item => {
            const code = String(item?.manufacturer_code || item?.manufacturerCode || item?.vendor || '').trim();
            if(code){
                allowed.add(code);
            }
        });
        return allowed.size ? allowed : null;
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
        try{
            var __c = window.__blsFkCache && window.__blsFkCache.get(config.endpoint);
            const data = __c || await fetchJSON(config.endpoint, { method:'GET', headers:{'Accept':'application/json'} });
            if(!__c && window.__blsFkCache){ window.__blsFkCache.set(config.endpoint, data); }
            let items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
            if(sourceKey === 'SERVER_MODEL' && SERVER_MODEL_FORM_FACTOR_FILTER){
                const target = String(SERVER_MODEL_FORM_FACTOR_FILTER).trim();
                items = items.filter(it => String(it?.form_factor || it?.hw_type || '').trim() === target);
            }
            fkSourceCache.set(sourceKey, items);
            if(sourceKey === 'ORG_DEPT'){
                rebuildDeptNameLookup(items);
            } else if(sourceKey === 'WORK_GROUP'){
                rebuildWorkGroupNameLookup(items);
            } else if(sourceKey === 'USER_PROFILE'){
                clearUserProfileCache();
            }
            return items;
        }catch(err){
            console.warn('[cloud] FK source load failed:', sourceKey, err);
            fkSourceCache.set(sourceKey, []);
            return [];
        }
    }

    function defaultFkFormatter(value, label){
        const name = (label || '').trim();
        if(name){
            return name;
        }
        return value || '';
    }

    function getFkOptions(field){
        const spec = FK_FIELD_SPECS[field];
        if(!spec){
            return [];
        }
        const sourceConfig = FK_SOURCE_CONFIG[spec.source] || {};
        let records = fkSourceCache.get(spec.source) || [];
        if(field === 'vendor' && spec.source === 'VENDOR'){
            const allowed = getAllowedManufacturerCodesForPage();
            if(allowed != null){
                records = (Array.isArray(records) ? records : []).filter(item => {
                    const code = String(item?.manufacturer_code || item?.manufacturerCode || item?.vendor || '').trim();
                    return code && allowed.has(code);
                });
            }
        }
        const valueKey = spec.valueKey || sourceConfig.valueKey || 'id';
        const labelKey = spec.labelKey || sourceConfig.labelKey || 'name';
        const formatter = spec.optionFormatter || ((item, value, label) => defaultFkFormatter(value, label));
        const metaBuilder = typeof spec.optionMeta === 'function' ? spec.optionMeta : null;
        const options = [];
        const seen = new Set();
        records.forEach(item => {
            const valueRaw = item?.[valueKey];
            if(valueRaw == null) return;
            const value = String(valueRaw).trim();
            if(!value || seen.has(value)) return;
            const label = formatter(item, value, item?.[labelKey]) || value;
            const meta = metaBuilder ? metaBuilder(item, value, label) : null;
            options.push({ value, label, meta });
            seen.add(value);
        });
        options.sort((a,b)=>{
            return a.label.localeCompare(b.label, 'ko', { sensitivity: 'base' }) || a.value.localeCompare(b.value);
        });
        return options;
    }

    function toDataAttrName(key){
        return `data-${String(key).replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    }

    function buildOptionDataAttrs(meta){
        if(!meta || typeof meta !== 'object') return '';
        const parts = [];
        Object.entries(meta).forEach(([key, val])=>{
            if(val == null || val === '') return;
            parts.push(`${toDataAttrName(key)}="${escapeAttr(String(val))}"`);
        });
        return parts.length ? ` ${parts.join(' ')}` : '';
    }

    function buildFkOptionsMarkup(field, selectedValue, placeholderLabel){
        const placeholder = placeholderLabel || '선택';
        const options = getFkOptions(field);
        let hasSelected = !selectedValue;
        let html = `<option value="">${escapeHTML(placeholder)}</option>`;
        options.forEach(opt => {
            const selected = selectedValue && opt.value === selectedValue ? ' selected' : '';
            if(selected) hasSelected = true;
            const extra = buildOptionDataAttrs(opt.meta);
            html += `<option value="${escapeAttr(opt.value)}"${selected}${extra}>${escapeHTML(opt.label)}</option>`;
        });
        if(selectedValue && !hasSelected){
            html += `<option value="${escapeAttr(selectedValue)}" selected>${escapeHTML(selectedValue)}</option>`;
        }
        return html;
    }

    function isFieldSearchable(field){
        const spec = FK_FIELD_SPECS[field];
        if(!spec) return false;
        if(Object.prototype.hasOwnProperty.call(spec, 'searchable')){
            return !!spec.searchable;
        }
        return true;
    }

    function ensureSearchableDataset(select){
        if(!select) return;
        if(select.dataset && select.dataset.searchable != null){
            return;
        }
        const field = select.getAttribute('data-fk');
        if(!field) return;
        select.dataset.searchable = isFieldSearchable(field) ? 'true' : 'false';
    }

    function renderFkSelect(field, value){
        const spec = FK_FIELD_SPECS[field] || {};
        const placeholder = spec.placeholder || '선택';
        const selectedValue = value == null ? '' : String(value).trim();
        let optionsMarkup = '';
        if(spec.skipAutoOptions){
            const manualPlaceholder = spec.dependsOn ? '부서를 먼저 선택' : placeholder;
            optionsMarkup = `<option value="">${escapeHTML(manualPlaceholder)}</option>`;
            if(selectedValue){
                optionsMarkup += `<option value="${escapeAttr(selectedValue)}" selected>${escapeHTML(selectedValue)}</option>`;
            }
        } else {
            optionsMarkup = buildFkOptionsMarkup(field, selectedValue, placeholder);
        }
        const attrs = [
            `name="${field}"`,
            'class="form-input search-select fk-select"',
            `data-fk="${field}"`,
            `data-placeholder="${placeholder}"`
        ];
        if(selectedValue){
            attrs.push(`data-initial-value="${escapeAttr(selectedValue)}"`);
        }
        if(spec.dependsOn){
            attrs.push(`data-parent-field="${spec.dependsOn}"`);
        }
        if(spec.skipAutoOptions && !selectedValue){
            attrs.push('disabled');
        }
        attrs.push(`data-searchable="${isFieldSearchable(field) ? 'true' : 'false'}"`);
        return `<select ${attrs.join(' ')}>${optionsMarkup}</select>`;
    }

    const searchableSelectMeta = new WeakMap();
    let activeSearchPanel = null;

    function isSearchableSelect(select){
        if(!select) return false;
        const explicit = select.dataset?.searchable;
        if(explicit === 'true') return true;
        if(explicit === 'false') return false;
        const field = select.dataset?.fk || select.name;
        if(!field) return false;
        return isFieldSearchable(field);
    }

    function getSearchablePlaceholder(select){
        return (select?.getAttribute('data-placeholder') || select?.dataset?.placeholder || '선택');
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
        clearBtn.setAttribute('aria-label', '선택 해제');
        clearBtn.title = '선택 해제';
        clearBtn.textContent = '지움';
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
            if(select.disabled){
                return;
            }
            openSearchDropdown(select);
        });
        const parent = select.parentNode;
        if(parent){
            parent.insertBefore(wrapper, select);
        }
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
            if(!meta){
                return;
            }
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

    function enhanceFormSearchableSelects(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        const targets = [];
        const seen = new Set();
        const pushUnique = (select) => {
            if(!select || seen.has(select)) return;
            seen.add(select);
            targets.push(select);
        };
        form.querySelectorAll('select[data-fk]').forEach(select => {
            ensureSearchableDataset(select);
            pushUnique(select);
        });
        form.querySelectorAll('select.search-select:not([data-fk])').forEach(select => {
            if(!select.dataset.searchable){
                const flag = select.getAttribute('data-searchable') || 'true';
                select.dataset.searchable = flag;
            }
            pushUnique(select);
        });
        targets.forEach(select => {
            if(isSearchableSelect(select)){
                setupSearchableSelect(select);
                syncSearchableSelect(select);
            }
        });
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
        state.handleScroll = event => {
            const target = event?.target;
            if(target && (panel.contains(target) || meta.wrapper.contains(target))){
                return;
            }
            const modalRoot = meta.wrapper?.closest?.('.modal-overlay-full');
            if(modalRoot && target && modalRoot.contains(target)){
                positionSearchPanel(state);
                return;
            }
            closeSearchDropdown();
        };
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
        if(!items.length){
            return;
        }
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
            if(!state.filtered.length){
                return;
            }
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
        if(!isItem){
            return;
        }
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
        if(!activeSearchPanel){
            return;
        }
        if(targetSelect && activeSearchPanel.select !== targetSelect){
            return;
        }
        const state = activeSearchPanel;
        state.trigger?.setAttribute('aria-expanded', 'false');
        if(state.panel?.parentNode){
            state.panel.parentNode.removeChild(state.panel);
        }
        if(state.handleOutside){
            document.removeEventListener('pointerdown', state.handleOutside, true);
        }
        if(state.handleKeydown){
            document.removeEventListener('keydown', state.handleKeydown, true);
        }
        if(state.handleFocus){
            document.removeEventListener('focusin', state.handleFocus, true);
        }
        if(state.handleResize){
            window.removeEventListener('resize', state.handleResize);
        }
        if(state.handleScroll){
            window.removeEventListener('scroll', state.handleScroll, true);
        }
        activeSearchPanel = null;
    }

    function positionSearchPanel(state){
        const { panel, anchor } = state;
        if(!panel || !anchor){
            return;
        }
        const rect = anchor.getBoundingClientRect();
        const margin = 8;
        const width = Math.max(rect.width, 280);
        panel.style.width = `${width}px`;
        panel.style.zIndex = '5000';
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
            panel.classList.add('placement-above');
        } else {
            panel.classList.remove('placement-above');
        }
        top = Math.max(margin, top);
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
    }

    document.addEventListener('reset', event => {
        const form = event.target;
        if(!(form instanceof HTMLFormElement)){
            return;
        }
        setTimeout(() => {
            form.querySelectorAll('select[data-searchable="true"]').forEach(select => syncSearchableSelect(select));
        }, 0);
    });

    function populateFkSelectOptions(selectEl, field){
        if(!selectEl || !field) return;
        const spec = FK_FIELD_SPECS[field] || {};
        if(spec.skipAutoOptions){
            return;
        }
        const placeholder = selectEl.getAttribute('data-placeholder') || spec.placeholder || '선택';
        selectEl.setAttribute('data-placeholder', placeholder);
        const current = selectEl.value || '';
        const markup = buildFkOptionsMarkup(field, current, placeholder);
        selectEl.innerHTML = markup;
        syncSearchableSelect(selectEl);
    }

    function hydrateFkSelects(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        form.querySelectorAll('[data-fk]').forEach(select => {
            ensureSearchableDataset(select);
            populateFkSelectOptions(select, select.getAttribute('data-fk'));
        });
    }

    function refreshAddFormFkFields(){
        hydrateFkSelects(ADD_FORM_ID);
        enhanceFormSearchableSelects(ADD_FORM_ID);
        setupLocationCascadeForForm(ADD_FORM_ID);
        setupOwnerDependenciesForForm(ADD_FORM_ID);
        setupModelDependenciesForForm(ADD_FORM_ID);
    }

    async function preloadFkData(){
        const sources = [...new Set(
            Object.values(FK_FIELD_SPECS)
                .filter(spec => spec && !spec.skipAutoOptions)
                .map(spec => spec.source)
                .filter(Boolean)
        )];
        await Promise.all(sources.map(src => loadFkSource(src)));
    }

    function rebuildDeptNameLookup(records){
        deptCodeToName.clear();
        const rows = Array.isArray(records) ? records : (fkSourceCache.get('ORG_DEPT') || []);
        rows.forEach(item => {
            const code = (item?.dept_code || '').trim();
            if(!code) return;
            const name = (item?.dept_name || '').trim() || code;
            deptCodeToName.set(code, name);
        });
    }

    function rebuildWorkGroupNameLookup(records){
        workGroupCodeToName.clear();
        const rows = Array.isArray(records) ? records : (fkSourceCache.get('WORK_GROUP') || []);
        rows.forEach(item => {
            const code = (item?.group_code || '').trim();
            if(!code) return;
            const name = (item?.group_name || '').trim() || code;
            workGroupCodeToName.set(code, name);
        });
    }

    function getDeptNameByCode(code){
        if(!code && code !== 0) return '';
        const normalized = String(code).trim();
        return deptCodeToName.get(normalized) || '';
    }

    function getWorkGroupNameByCode(code){
        if(!code && code !== 0) return '';
        const normalized = String(code).trim();
        return workGroupCodeToName.get(normalized) || '';
    }

    function clearUserProfileCache(){
        userProfileByDeptCache.clear();
        invalidateAllUserProfilesCache();
    }

    function invalidateAllUserProfilesCache(){
        allUserProfilesCache = null;
        allUserProfilesPromise = null;
    }

    async function ensureAllUserProfiles(){
        if(allUserProfilesCache){
            return allUserProfilesCache;
        }
        if(!allUserProfilesPromise){
            const load = async ()=>{
                const data = await fetchJSON('/api/user-profiles?limit=500', { method:'GET', headers:{'Accept':'application/json'} });
                const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
                allUserProfilesCache = items;
                return items;
            };
            allUserProfilesPromise = load().catch(err => {
                allUserProfilesPromise = null;
                throw err;
            });
        }
        return allUserProfilesPromise;
    }

    function getOwnerDependencyPairs(){
        if(ownerDependencyPairs){
            return ownerDependencyPairs;
        }
        ownerDependencyPairs = Object.entries(FK_FIELD_SPECS)
            .filter(([, spec]) => spec && spec.source === 'USER_PROFILE' && spec.dependsOn)
            .map(([field, spec]) => ({ ownerField: field, deptField: spec.dependsOn }));
        return ownerDependencyPairs;
    }

    function getModelDependencyPairs(){
        if(modelDependencyPairs){
            return modelDependencyPairs;
        }
        modelDependencyPairs = Object.entries(FK_FIELD_SPECS)
            .filter(([, spec]) => spec && spec.source === 'SERVER_MODEL' && spec.dependsOn)
            .map(([field, spec]) => ({ modelField: field, vendorField: spec.dependsOn }));
        return modelDependencyPairs;
    }

    function extractManufacturerCodeFromModelRecord(item){
        return String(item?.manufacturer_code || item?.manufacturerCode || item?.vendor || '').trim();
    }

    function buildModelOptionsMarkupForVendor(vendorCode, selectedValue, placeholderLabel){
        const normalizedVendor = String(vendorCode || '').trim();
        const placeholder = placeholderLabel || '선택';
        const current = selectedValue == null ? '' : String(selectedValue).trim();

        const records = fkSourceCache.get('SERVER_MODEL') || [];
        const spec = FK_FIELD_SPECS.model || {};
        const sourceConfig = FK_SOURCE_CONFIG[spec.source] || {};
        const valueKey = spec.valueKey || sourceConfig.valueKey || 'id';
        const labelKey = spec.labelKey || sourceConfig.labelKey || 'name';
        const formatter = spec.optionFormatter || ((item, value, label) => defaultFkFormatter(value, label));
        const metaBuilder = typeof spec.optionMeta === 'function' ? spec.optionMeta : null;

        const filtered = (Array.isArray(records) ? records : []).filter(item => {
            if(!normalizedVendor){
                return true;
            }
            const code = extractManufacturerCodeFromModelRecord(item);
            return code && code === normalizedVendor;
        });

        const options = [];
        const seen = new Set();
        filtered.forEach(item => {
            const valueRaw = item?.[valueKey];
            if(valueRaw == null) return;
            const value = String(valueRaw).trim();
            if(!value || seen.has(value)) return;
            const label = formatter(item, value, item?.[labelKey]) || value;
            const meta = metaBuilder ? metaBuilder(item, value, label) : null;
            options.push({ value, label, meta });
            seen.add(value);
        });
        options.sort((a,b)=> a.label.localeCompare(b.label, 'ko', { sensitivity: 'base' }) || a.value.localeCompare(b.value));

        const hasAny = options.length > 0;
        const stateLabel = normalizedVendor && !hasAny ? '해당 제조사의 모델이 없습니다' : placeholder;

        let html = `<option value="">${escapeHTML(stateLabel)}</option>`;
        let hasSelected = !current;
        options.forEach(opt => {
            const selected = current && opt.value === current ? ' selected' : '';
            if(selected) hasSelected = true;
            const extra = buildOptionDataAttrs(opt.meta);
            html += `<option value="${escapeAttr(opt.value)}"${selected}${extra}>${escapeHTML(opt.label)}</option>`;
        });
        if(current && !hasSelected){
            html += `<option value="${escapeAttr(current)}" selected>${escapeHTML(current)}</option>`;
        }
        return html;
    }

    async function refreshModelSelect(modelSelect, vendorCode){
        if(!modelSelect) return;
        try{ await loadFkSource('SERVER_MODEL'); }catch(_err){}

        const field = modelSelect.getAttribute('data-fk') || modelSelect.name || 'model';
        const spec = FK_FIELD_SPECS[field] || FK_FIELD_SPECS.model || {};
        const placeholder = modelSelect.getAttribute('data-placeholder') || spec.placeholder || '선택';
        modelSelect.setAttribute('data-placeholder', placeholder);

        const normalizedVendor = String(vendorCode || '').trim();
        const currentValue = (modelSelect.value || '').trim();

        if(normalizedVendor && currentValue){
            const records = fkSourceCache.get('SERVER_MODEL') || [];
            const sourceConfig = FK_SOURCE_CONFIG[spec.source] || {};
            const valueKey = spec.valueKey || sourceConfig.valueKey || 'id';
            const stillValid = (Array.isArray(records) ? records : []).some(item => {
                const vendor = extractManufacturerCodeFromModelRecord(item);
                const value = String(item?.[valueKey] || '').trim();
                return vendor && vendor === normalizedVendor && value && value === currentValue;
            });
            if(!stillValid){
                modelSelect.value = '';
            }
        }

        const selected = (modelSelect.value || '').trim();
        modelSelect.innerHTML = buildModelOptionsMarkupForVendor(normalizedVendor, selected, placeholder);
        syncSearchableSelect(modelSelect);
    }

    function setupModelDependenciesForForm(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        getModelDependencyPairs().forEach(({ modelField, vendorField }) => {
            const modelSelect = form.querySelector(`[name="${modelField}"]`);
            const vendorSelect = form.querySelector(`[name="${vendorField}"]`);
            if(!modelSelect || !vendorSelect) return;
            if(!vendorSelect.dataset.modelDependencyBound){
                vendorSelect.addEventListener('change', ()=>{ refreshModelSelect(modelSelect, vendorSelect.value); });
                vendorSelect.dataset.modelDependencyBound = '1';
            }
            if(!modelSelect.dataset.vendorAutoSelectBound){
                modelSelect.addEventListener('change', async ()=>{
                    const modelValue = String(modelSelect.value || '').trim();
                    if(!modelValue){
                        return;
                    }
                    try{ await loadFkSource('SERVER_MODEL'); }catch(_err){}

                    const spec = FK_FIELD_SPECS[modelField] || FK_FIELD_SPECS.model || {};
                    const sourceConfig = FK_SOURCE_CONFIG[spec.source] || {};
                    const valueKey = spec.valueKey || sourceConfig.valueKey || 'id';
                    const records = fkSourceCache.get('SERVER_MODEL') || [];
                    const match = (Array.isArray(records) ? records : []).find(item => {
                        const value = String(item?.[valueKey] || '').trim();
                        return value && value === modelValue;
                    });
                    const manufacturerCode = extractManufacturerCodeFromModelRecord(match);
                    if(manufacturerCode && String(vendorSelect.value || '').trim() !== manufacturerCode){
                        vendorSelect.value = manufacturerCode;
                        vendorSelect.dispatchEvent(new Event('change', { bubbles: true }));
                        syncSearchableSelect(vendorSelect);
                    }
                });
                modelSelect.dataset.vendorAutoSelectBound = '1';
            }
            refreshModelSelect(modelSelect, vendorSelect.value);
        });
    }

    function getLocationCascadePairs(){
        return [{ parentField: 'location_place', childField: 'location_pos' }];
    }

    function extractCenterCodeFromRackRecord(item){
        return String(item?.center_code || item?.centerCode || item?.center || '').trim();
    }

    function buildRackOptionsMarkupForCenter(centerCode, selectedValue, placeholderLabel){
        const normalizedCenter = String(centerCode || '').trim();
        const placeholder = placeholderLabel || '랙 선택';
        const current = selectedValue == null ? '' : String(selectedValue).trim();

        if(!normalizedCenter){
            let html = `<option value="">${escapeHTML('센터를 먼저 선택')}</option>`;
            if(current){
                html += `<option value="${escapeAttr(current)}" selected>${escapeHTML(current)}</option>`;
            }
            return html;
        }

        const records = fkSourceCache.get('ORG_RACK') || [];
        const spec = FK_FIELD_SPECS.location_pos || {};
        const sourceConfig = FK_SOURCE_CONFIG[spec.source] || {};
        const valueKey = spec.valueKey || sourceConfig.valueKey || 'id';
        const labelKey = spec.labelKey || sourceConfig.labelKey || 'name';
        const formatter = spec.optionFormatter || ((item, value, label) => defaultFkFormatter(value, label));

        const filtered = (Array.isArray(records) ? records : []).filter(item => {
            const rackCenter = extractCenterCodeFromRackRecord(item);
            return rackCenter && rackCenter === normalizedCenter;
        });

        const options = [];
        const seen = new Set();
        filtered.forEach(item => {
            const valueRaw = item?.[valueKey];
            if(valueRaw == null) return;
            const value = String(valueRaw).trim();
            if(!value || seen.has(value)) return;
            const label = formatter(item, value, item?.[labelKey]) || value;
            options.push({ value, label });
            seen.add(value);
        });
        options.sort((a,b)=> a.label.localeCompare(b.label, 'ko', { sensitivity: 'base' }) || a.value.localeCompare(b.value));

        const hasAny = options.length > 0;
        const stateLabel = hasAny ? placeholder : '해당 센터의 랙이 없습니다';
        let html = `<option value="">${escapeHTML(stateLabel)}</option>`;
        let hasSelected = !current;
        options.forEach(opt => {
            const selected = current && opt.value === current ? ' selected' : '';
            if(selected) hasSelected = true;
            html += `<option value="${escapeAttr(opt.value)}"${selected}>${escapeHTML(opt.label)}</option>`;
        });
        if(current && !hasSelected){
            html += `<option value="${escapeAttr(current)}" selected>${escapeHTML(current)}</option>`;
        }
        return html;
    }

    function refreshRackSelectForCenter(rackSelect, centerCode, options){
        if(!rackSelect) return;
        const normalizedCenter = String(centerCode || '').trim();
        const keepValue = !!options?.keepValue;
        const placeholder = rackSelect.getAttribute('data-placeholder') || FK_FIELD_SPECS.location_pos?.placeholder || '랙 선택';
        const initialValue = rackSelect.getAttribute('data-initial-value') || '';
        const currentValue = keepValue ? (rackSelect.value || initialValue) : '';

        rackSelect.innerHTML = buildRackOptionsMarkupForCenter(normalizedCenter, currentValue, placeholder);

        const shouldDisable = !normalizedCenter;
        rackSelect.disabled = shouldDisable;
        rackSelect.classList.toggle('fk-disabled', shouldDisable);
        if(!keepValue){
            rackSelect.value = '';
        }
        rackSelect.removeAttribute('data-initial-value');
        syncSearchableSelect(rackSelect);
    }

    function setupLocationCascadeForForm(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        getLocationCascadePairs().forEach(({ parentField, childField }) => {
            const parentSelect = form.querySelector(`[name="${parentField}"]`);
            const childSelect = form.querySelector(`[name="${childField}"]`);
            if(!parentSelect || !childSelect) return;

            if(!parentSelect.dataset.locationCascadeBound){
                parentSelect.addEventListener('change', () => {
                    refreshRackSelectForCenter(childSelect, parentSelect.value, { keepValue: false });
                });
                parentSelect.dataset.locationCascadeBound = '1';
            }
            refreshRackSelectForCenter(childSelect, parentSelect.value, { keepValue: true });
        });
    }

    function resolveOwnerParentSelect(selectEl, explicitParent){
        if(explicitParent) return explicitParent;
        const parentField = selectEl?.getAttribute('data-parent-field');
        if(parentField && selectEl?.form){
            return selectEl.form.querySelector(`[name="${parentField}"]`);
        }
        return null;
    }

    async function fetchUserProfilesByDepartment(deptName, deptCode){
        const cacheKey = (deptCode || deptName || '').trim();
        if(!cacheKey){
            return [];
        }
        if(userProfileByDeptCache.has(cacheKey)){
            return userProfileByDeptCache.get(cacheKey);
        }
        const params = ['limit=500'];
        const nameTrimmed = (deptName || '').trim();
        if(nameTrimmed){
            params.push(`department=${encodeURIComponent(nameTrimmed)}`);
        }
        const codeTrimmed = (deptCode || '').trim();
        if(codeTrimmed){
            params.push(`dept_code=${encodeURIComponent(codeTrimmed)}`);
        }
        const url = `/api/user-profiles?${params.join('&')}`;
        try{
            const data = await fetchJSON(url, { method:'GET', headers:{'Accept':'application/json'} });
            const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
            userProfileByDeptCache.set(cacheKey, items);
            return items;
        }catch(err){
            console.warn('[cloud] Failed to load user profiles for', cacheKey, err);
            userProfileByDeptCache.delete(cacheKey);
            throw err;
        }
    }

    function filterProfilesByDepartment(records, deptName){
        const trimmed = (deptName || '').trim();
        if(!trimmed){
            return [];
        }
        const target = trimmed.toLowerCase();
        return (records || []).filter(item => {
            const dept = (item?.department || '').trim().toLowerCase();
            return dept && dept === target;
        });
    }

    function applyOwnerRecordsToSelect(selectEl, records, context){
        if(!selectEl) return;
        const field = selectEl.getAttribute('data-fk') || selectEl.name;
        const spec = FK_FIELD_SPECS[field] || {};
        const sourceConfig = FK_SOURCE_CONFIG[spec.source] || {};
        const valueKey = spec.valueKey || sourceConfig.valueKey || 'id';
        const labelKey = spec.labelKey || sourceConfig.labelKey || 'name';
        const formatter = spec.optionFormatter || ((item, value, label)=> defaultFkFormatter(value, label));
        const metaBuilder = typeof spec.optionMeta === 'function' ? spec.optionMeta : null;
        const currentValue = (context?.currentValue || '').trim();
        const contextDeptName = (context?.deptName || '').trim();
        const placeholder = spec.placeholder || '선택';
        const hasRecords = Array.isArray(records) && records.length > 0;
        let html = '';
        const stateLabel = hasRecords ? placeholder : '해당 부서 인원이 없습니다';
        html += `<option value="">${escapeHTML(stateLabel)}</option>`;
        const seen = new Set();
        if(hasRecords){
            records.forEach(item => {
                const valueRaw = item?.[valueKey];
                if(valueRaw == null) return;
                const value = String(valueRaw).trim();
                if(!value || seen.has(value)) return;
                const label = formatter(item, value, item?.[labelKey]) || value;
                const meta = metaBuilder ? metaBuilder(item, value, label) : null;
                const extra = buildOptionDataAttrs(meta);
                const selected = currentValue && value === currentValue ? ' selected' : '';
                html += `<option value="${escapeAttr(value)}"${selected}${extra}>${escapeHTML(label)}</option>`;
                seen.add(value);
            });
        }
        if(currentValue && !seen.has(currentValue)){
            const fallbackMeta = { ownerName: currentValue, ownerDept: contextDeptName };
            const extra = buildOptionDataAttrs(fallbackMeta);
            html += `<option value="${escapeAttr(currentValue)}" selected${extra}>${escapeHTML(currentValue)}</option>`;
        }
        selectEl.innerHTML = html;
        selectEl.disabled = false;
        selectEl.classList.remove('fk-disabled');
        if(currentValue){
            // Keep the current value selected even when it's not part of the fetched list.
            // (A fallback option was already injected above.)
            selectEl.value = currentValue;
        }
        selectEl.removeAttribute('data-owner-request-id');
        selectEl.removeAttribute('data-owner-fallback-tried');
        selectEl.removeAttribute('data-initial-value');
        syncSearchableSelect(selectEl);
    }

    async function refreshOwnerSelect(selectEl, deptCode, parentSelect){
        if(!selectEl) return;
        const field = selectEl.getAttribute('data-fk') || selectEl.name;
        const spec = FK_FIELD_SPECS[field] || {};
        if(!spec.skipAutoOptions){
            populateFkSelectOptions(selectEl, field);
            return;
        }
        const parent = resolveOwnerParentSelect(selectEl, parentSelect);
        const normalizedCode = deptCode == null ? '' : String(deptCode).trim();
        const parentLabel = (parent?.selectedOptions?.[0]?.textContent || '').trim();
        const deptName = (normalizedCode ? getDeptNameByCode(normalizedCode) : '') || parentLabel;
        const initialValue = selectEl.getAttribute('data-initial-value') || '';
        const currentValue = selectEl.value || initialValue;
        if(!deptName && !normalizedCode){
            const placeholder = parent && normalizedCode ? '부서를 불러오는 중...' : '부서를 먼저 선택';
            let html = `<option value="">${escapeHTML(placeholder)}</option>`;
            if(currentValue){
                html += `<option value="${escapeAttr(currentValue)}" selected>${escapeHTML(currentValue)}</option>`;
            }
            selectEl.innerHTML = html;
            selectEl.disabled = true;
            selectEl.classList.add('fk-disabled');
            syncSearchableSelect(selectEl);
            return;
        }
        const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        selectEl.dataset.ownerRequestId = requestId;
        selectEl.dataset.ownerFallbackTried = '0';
        selectEl.disabled = true;
        selectEl.classList.add('fk-disabled');
        selectEl.innerHTML = `<option value="">${escapeHTML('담당자 목록을 불러오는 중...')}</option>`;
        try{
            const records = await fetchUserProfilesByDepartment(deptName, normalizedCode);
            if(selectEl.dataset.ownerRequestId !== requestId){
                return;
            }
            applyOwnerRecordsToSelect(selectEl, records, { currentValue, deptName });
        }catch(err){
            if(selectEl.dataset.ownerRequestId !== requestId){
                return;
            }
            const alreadyFallback = selectEl.dataset.ownerFallbackTried === '1';
            const canFallback = !!deptName && !alreadyFallback;
            if(canFallback){
                try{
                    selectEl.dataset.ownerFallbackTried = '1';
                    const allProfiles = await ensureAllUserProfiles();
                    const filtered = filterProfilesByDepartment(allProfiles, deptName);
                    if(selectEl.dataset.ownerRequestId === requestId){
                        applyOwnerRecordsToSelect(selectEl, filtered, { currentValue, deptName });
                        return;
                    }
                }catch(fallbackErr){
                    console.warn('[cloud] owner fallback failed', fallbackErr);
                }
            }
            selectEl.innerHTML = `<option value="">${escapeHTML('담당자 목록을 불러오지 못했습니다')}</option>`;
            if(currentValue){
                selectEl.innerHTML += `<option value="${escapeAttr(currentValue)}" selected>${escapeHTML(currentValue)}</option>`;
            }
            selectEl.disabled = true;
            selectEl.classList.add('fk-disabled');
            selectEl.removeAttribute('data-owner-request-id');
            selectEl.removeAttribute('data-owner-fallback-tried');
            syncSearchableSelect(selectEl);
            console.warn('[cloud] 사용자 선택 갱신 실패', err);
        }
    }

    function setupOwnerDependenciesForForm(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        getOwnerDependencyPairs().forEach(({ ownerField, deptField }) => {
            const ownerSelect = form.querySelector(`[name="${ownerField}"]`);
            const deptSelect = form.querySelector(`[name="${deptField}"]`);
            if(!ownerSelect || !deptSelect) return;
            if(!deptSelect.dataset.ownerDependencyBound){
                deptSelect.addEventListener('change', ()=>{
                    refreshOwnerSelect(ownerSelect, deptSelect.value, deptSelect);
                });
                deptSelect.dataset.ownerDependencyBound = '1';
            }
            refreshOwnerSelect(ownerSelect, deptSelect.value, deptSelect);
        });
    }

    function ensureFkDataReady(){
        if(!fkDataPromise){
            fkDataPromise = preloadFkData().then(()=>{
                refreshAddFormFkFields();
            }).catch(err => {
                console.warn('[cloud] FK preload failed', err);
            });
        }
        return fkDataPromise;
    }

    async function fetchJSON(url, options){
        const opts = options ? {...options} : {};
        opts.headers = Object.assign({'Content-Type':'application/json'}, opts.headers || {});
        if(!opts.credentials){ opts.credentials = 'same-origin'; }
        const response = await fetch(url, opts);
        let data = null;
        try {
            data = await response.json();
        } catch(_err){
            throw new Error('서버 응답을 해석할 수 없습니다. 잠시 후 다시 시도해주세요.');
        }
        if(!response.ok || (data && data.success === false)){
            const msg = data?.message || data?.error || `요청이 실패했습니다. (HTTP ${response.status})`;
            const error = new Error(msg);
            error.status = response.status;
            throw error;
        }
        return data;
    }

    function normalizeVirtualizationLabel(raw){
        if(!raw) return '';
        const value = String(raw).trim();
        if(value.toLowerCase() === 'physical' || value === '물리') return '물리서버';
        if(value.toLowerCase() === 'virtual' || value === '가상') return '가상서버';
        if(value.toLowerCase() === 'cloud') return '클라우드';
        return value;
    }

    const STATUS_COLOR_TOKEN_MAP = {
        'ws-run': '#6366F1',
        'ws-idle': '#0EA5E9',
        'ws-wait': '#94A3B8',
        'ws-c1': '#EF4444',
        'ws-c2': '#F97316',
        'ws-c3': '#F59E0B',
        'ws-c4': '#84CC16',
        'ws-c5': '#10B981',
        'ws-c6': '#06B6D4',
        'ws-c7': '#3B82F6',
        'ws-c8': '#A855F7',
        'ws-c9': '#EC4899',
        'ws-c10': '#6B7280'
    };

    function normalizeHexColor(value){
        const raw = (value == null) ? '' : String(value).trim();
        if(!raw) return '';
        let hex = raw.startsWith('#') ? raw.slice(1) : raw;
        if(!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(hex)){
            return '';
        }
        if(hex.length === 3){
            hex = hex.split('').map(ch => ch + ch).join('');
        }
        return `#${hex.toUpperCase()}`;
    }

    function hexToRgbArray(hexValue){
        if(!hexValue) return null;
        const normalized = hexValue.startsWith('#') ? hexValue.slice(1) : hexValue;
        if(normalized.length !== 6) return null;
        const components = [
            parseInt(normalized.slice(0,2), 16),
            parseInt(normalized.slice(2,4), 16),
            parseInt(normalized.slice(4,6), 16)
        ];
        if(components.some(Number.isNaN)){
            return null;
        }
        return components;
    }

    function extractStatusToken(value){
        if(!value) return '';
        const raw = String(value).toLowerCase();
        const match = raw.match(/ws-[a-z0-9-]+/i);
        if(match && match[0]){
            return match[0].toLowerCase();
        }
        const sanitized = raw.replace(/[^a-z0-9_-]/g,'');
        return sanitized.startsWith('ws-') ? sanitized : '';
    }

    function deriveStatusColor(value){
        const raw = (value == null) ? '' : String(value).trim();
        if(!raw){
            return { hex:'', token:'' };
        }
        const hex = normalizeHexColor(raw);
        if(hex){
            return { hex, token:'' };
        }
        const rgbMatch = raw.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
        if(rgbMatch){
            const parts = rgbMatch.slice(1,4).map(num => {
                const parsed = parseInt(num, 10);
                if(Number.isNaN(parsed)) return 0;
                return Math.max(0, Math.min(255, parsed));
            });
            const [r,g,b] = parts;
            const hexFromRgb = `#${((1<<24) + (r<<16) + (g<<8) + b).toString(16).slice(1).toUpperCase()}`;
            return { hex: hexFromRgb, token:'' };
        }
        const token = extractStatusToken(raw);
        if(token){
            return { hex: '', token };
        }
        return { hex:'', token:'' };
    }

    function normalizeLabel(name, code){
        return name || code || '';
    }

    function normalizeAssetRecord(item){
        if(!item) return null;
        const coreFlag = item.is_core_system;
        const drFlag = item.has_dr_site;
        const svcHaFlag = item.has_service_ha;
        const statusColor = deriveStatusColor(item.work_status_color);
        const row = {
            id: item.id,
            asset_code: item.asset_code || '',
            asset_name: item.asset_name || '',
            work_type: normalizeLabel(item.work_type_name, item.work_type_code),
            work_type_code: item.work_type_code || '',
            work_category: normalizeLabel(item.work_category_name, item.work_category_code),
            work_category_code: item.work_category_code || '',
            work_status: normalizeLabel(item.work_status_name, item.work_status_code),
            work_status_color: statusColor.hex,
            work_status_token: statusColor.token,
            work_status_code: item.work_status_code || '',
            work_operation: normalizeLabel(item.work_operation_name, item.work_operation_code),
            work_operation_code: item.work_operation_code || '',
            work_group: normalizeLabel(String(item.work_group_name || '').trim() || getWorkGroupNameByCode(item.work_group_code), item.work_group_code),
            work_group_code: item.work_group_code || '',
            work_name: item.work_name || '',
            system_name: item.system_name || '',
            system_ip: item.system_ip || '',
            manage_ip: item.mgmt_ip || '',
            mgmt_ip: item.mgmt_ip || '',
            vendor: normalizeLabel(item.manufacturer_name, item.manufacturer_code),
            manufacturer_code: item.manufacturer_code || '',
            model: normalizeLabel(item.server_model_name, item.server_code),
            server_code: item.server_code || '',
            serial: item.serial_number || '-',
            virtualization: normalizeVirtualizationLabel(item.virtualization_type),
            virtualization_raw: item.virtualization_type || '',
            location_place: item.center_name || '',
            center_code: item.center_code || '',
            location_pos: item.rack_name || '',
            rack_code: item.rack_code || '',
            slot: item.slot || '-',
            u_size: item.u_size || '-',
            rack_face: item.rack_face === 'REAR' ? '후면' : '전면',
            sys_dept: normalizeLabel(String(item.system_dept_name || '').trim() || getDeptNameByCode(item.system_dept_code), item.system_dept_code),
            system_dept_code: item.system_dept_code || '',
            svc_dept: normalizeLabel(String(item.service_dept_name || '').trim() || getDeptNameByCode(item.service_dept_code), item.service_dept_code),
            service_dept_code: item.service_dept_code || '',
            sys_owner: normalizeLabel(item.system_owner_name, item.system_owner_emp_no),
            system_owner_emp_no: item.system_owner_emp_no || '',
            svc_owner: normalizeLabel(item.service_owner_name, item.service_owner_emp_no),
            service_owner_emp_no: item.service_owner_emp_no || '',
            confidentiality: item.cia_confidentiality != null ? String(item.cia_confidentiality) : '',
            integrity: item.cia_integrity != null ? String(item.cia_integrity) : '',
            availability: item.cia_availability != null ? String(item.cia_availability) : '',
            security_score: item.security_score != null ? String(item.security_score) : '',
            system_grade: item.system_grade || '',
            core_flag: coreFlag == null ? '-' : (coreFlag ? '핵심' : '일반'),
            is_core_system: coreFlag,
            dr_built: drFlag == null ? '-' : (drFlag ? 'O' : 'X'),
            has_dr_site: drFlag,
            svc_redundancy: svcHaFlag == null ? '-' : (svcHaFlag ? 'O' : 'X'),
            has_service_ha: svcHaFlag,
            service_ha_type: item.service_ha_type || ''
        };
        // fill missing optional display fields with '-'
        COLUMN_ORDER.forEach(col=>{
            if(row[col] == null || row[col] === ''){
                row[col] = '-';
            }
        });
        row.work_name = item.work_name || row.work_name;
        row.system_name = item.system_name || row.system_name;
        row.manage_ip = item.mgmt_ip || row.manage_ip;
        row._record = item;
        return row;
    }

    function randomBase36Chunk(length){
        const size = Math.max(1, Number(length) || 1);
        if(window.crypto?.getRandomValues){
            const buffer = new Uint32Array(1);
            window.crypto.getRandomValues(buffer);
            return buffer[0].toString(36).toUpperCase().padStart(size, '0').slice(-size);
        }
        return Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g,'').padStart(size, '0').slice(-size);
    }

    function collectExistingAssetCodes(){
        const codes = new Set();
        (state.data || []).forEach(row => {
            const code = (row?.asset_code || row?._record?.asset_code || '').trim();
            if(code){ codes.add(code); }
        });
        return codes;
    }

    function generateAssetCode(systemName, workName){
        const baseSource = (systemName || workName || DEFAULT_ASSET_PREFIX).replace(/[^A-Za-z0-9]/g,'').toUpperCase();
        const base = baseSource ? baseSource.slice(0,6) : 'AUTO';
        const timeChunk = Date.now().toString(36).toUpperCase().padStart(6, '0').slice(-6);
        const randomChunk = randomBase36Chunk(4);
        return `${DEFAULT_ASSET_PREFIX}-${base}-${timeChunk}${randomChunk}`;
    }

    function generateUniqueAssetCode(systemName, workName){
        const existingCodes = collectExistingAssetCodes();
        for(let attempt=0; attempt<10; attempt+=1){
            const candidate = generateAssetCode(systemName, workName);
            if(!existingCodes.has(candidate)){
                return candidate;
            }
        }
        return `${DEFAULT_ASSET_PREFIX}-${randomBase36Chunk(8)}`;
    }

    function buildAssetPayload(formData, existingRow){
        const payload = {
            asset_category: 'SERVER',
            asset_type: 'CLOUD'
        };
        Object.entries(FIELD_TO_PAYLOAD_KEY).forEach(([field, payloadKey])=>{
            const raw = formData[field];
            if(raw == null || raw === '') return;
            let value = raw;
            if(NUMERIC_PAYLOAD_KEYS.has(payloadKey)){
                const num = parseInt(raw, 10);
                if(Number.isNaN(num)) return;
                value = num;
            }
            payload[payloadKey] = value;
        });
        [
            { formKey: 'sys_owner_display', payloadKey: 'system_owner_display' },
            { formKey: 'svc_owner_display', payloadKey: 'service_owner_display' }
        ].forEach(({ formKey, payloadKey })=>{
            const val = formData[formKey];
            if(val != null && String(val).trim() !== ''){
                payload[payloadKey] = String(val).trim();
            }
        });
        if(!payload.asset_code){
            if(existingRow?.asset_code){
                payload.asset_code = existingRow.asset_code;
            } else {
                payload.asset_code = generateUniqueAssetCode(formData.system_name, formData.work_name);
            }
        }
        if(!payload.asset_name){
            payload.asset_name = existingRow?.asset_name || formData.work_name || formData.system_name || payload.asset_code;
        }
        Object.keys(payload).forEach(key=>{
            if(payload[key] === '' || payload[key] == null){ delete payload[key]; }
        });
        return payload;
    }

    async function apiListAssets(){
        const params = new URLSearchParams({ page_size: String(API_PAGE_SIZE) });
        const data = await fetchJSON(`${API_ENDPOINT}?${params.toString()}`, { method:'GET', headers:{'Accept':'application/json'} });
        return data;
    }

    async function apiCreateAsset(payload){
        const data = await fetchJSON(API_ENDPOINT, { method:'POST', body: JSON.stringify(payload) });
        return data.item;
    }

    async function apiUpdateAsset(id, payload){
        const data = await fetchJSON(`${API_ENDPOINT}/${id}`, { method:'PUT', body: JSON.stringify(payload) });
        return data.item;
    }

    async function apiDeleteAssets(ids){
        return fetchJSON(`${API_ENDPOINT}/bulk-delete`, { method:'POST', body: JSON.stringify({ ids }) });
    }

    function isDuplicateAssetCodeError(error){
        if(!error) return false;
        const msg = String(error.message || '').toLowerCase();
        return msg.includes('자산 코드') || msg.includes('asset code');
    }

    function assignFreshAssetCode(payload, formData){
        const priorCode = payload.asset_code || '';
        payload.asset_code = generateUniqueAssetCode(formData.system_name, formData.work_name);
        if(!formData.work_name && !formData.system_name && payload.asset_name === priorCode){
            payload.asset_name = payload.asset_code;
        }
    }

    async function createAssetWithAutoRetry(formData){
        const payload = buildAssetPayload(formData);
        try{
            await apiCreateAsset(payload);
            return;
        }catch(err){
            if(isDuplicateAssetCodeError(err)){
                assignFreshAssetCode(payload, formData);
                await apiCreateAsset(payload);
                return;
            }
            throw err;
        }
    }

    async function loadAssetsFromServer(options){
        const preservePage = !!(options && options.preservePage);
        try{
            toggleGlobalLoading(true);
            const result = await apiListAssets();
            const rows = Array.isArray(result.items) ? result.items.map(normalizeAssetRecord).filter(Boolean) : [];
            state.data = rows;
            state.serverTotal = result.total || rows.length;
            state.selected.clear();
            applyFilter({ preservePage });
        }catch(err){
            console.error(err);
            showMessage(err.message || '클라우드 자산 목록을 불러오지 못했습니다.', '조회 실패');
        }finally{
            toggleGlobalLoading(false);
        }
    }

    function toggleGlobalLoading(isLoading){
        const loader = document.getElementById('system-search-loader');
        if(loader){ loader.setAttribute('aria-hidden', isLoading ? 'false' : 'true'); }
        const tableWrapper = document.querySelector('.system-table-container');
        if(tableWrapper){ tableWrapper.classList.toggle('is-loading', !!isLoading); }
    }

    function getFieldValueForEdit(row, field){
        if(!row) return '';
        const map = {
            work_type: 'work_type_code',
            work_category: 'work_category_code',
            work_status: 'work_status_code',
            work_operation: 'work_operation_code',
            work_group: 'work_group_code',
            vendor: 'manufacturer_code',
            model: 'server_code',
            location_place: 'center_code',
            location_pos: 'rack_code',
            sys_dept: 'system_dept_code',
            svc_dept: 'service_dept_code',
            sys_owner: 'system_owner_emp_no',
            svc_owner: 'service_owner_emp_no'
        };
        if(field === 'manage_ip'){ return row.mgmt_ip || row.manage_ip || ''; }
        if(field === 'virtualization'){ return row.virtualization || row.virtualization_raw || ''; }
        if(map[field] && row[map[field]] != null){ return row[map[field]]; }
        return row[field] ?? '';
    }

    let state = {
        data: [],
        filtered: [],
        pageSize: 10,
        page: 1,
        visibleCols: new Set(BASE_VISIBLE_COLUMNS),
        search: '',
        selected: new Set(),
        sortKey: null,
        sortDir: 'asc',
        columnFilters: {},
        serverTotal: 0
    };

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;


    function applyFilter(options){
        const preservePage = !!(options && options.preservePage);
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
        if(preservePage){
            const maxPage = Math.max(1, Math.ceil(base.length / state.pageSize));
            state.page = Math.min(state.page, maxPage);
        } else {
            state.page = 1;
        }
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
                    if(titleEl) titleEl.textContent = '시스템 내역이 없습니다.';
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
                    const rawVal = row[col];
                    const displayVal = (rawVal==null || String(rawVal).trim()==='') ? '-' : rawVal;
                    let cellValue = highlight(displayVal, col);
                    // 업무 상태: 배지/특수 스타일 제거 -> 기본 텍스트 표시
                    // '업무 이름'(work_name) 컬럼: 값이 있을 때만 링크로 변환 ("-"는 링크로 만들지 않음)
                    if(col === 'work_name' && displayVal !== '-'){
                        // Link to cloud detail page when clicking the work name
                        cellValue = `<a href="${DETAIL_URL}" class="work-name-link" data-id="${row.id??''}">${cellValue}</a>`;
                    }
                    // 업무 상태: 가동/유휴/대기 → 컬러 점 + 텍스트
                    if(col === 'work_status'){
                        const v = String(displayVal);
                        const customColor = row.work_status_color;
                        const tokenClass = row.work_status_token;
                        if(customColor){
                            const rgb = hexToRgbArray(customColor);
                            const styleParts = [`--status-dot-color:${customColor}`];
                            if(rgb){
                                const rgbStr = rgb.join(',');
                                styleParts.push(`--status-bg-color:rgba(${rgbStr},0.16)`);
                                styleParts.push(`--status-border-color:rgba(${rgbStr},0.45)`);
                            }
                            const styleAttr = styleParts.length ? ` style="${styleParts.join(';')}"` : '';
                            cellValue = `<span class="status-pill colored"${styleAttr}><span class="status-dot" aria-hidden="true"></span><span class="status-text">${highlight(displayVal, col)}</span></span>`;
                        } else {
                            let cls = tokenClass || '';
                            if(!cls){
                                if(v === '가동') cls = 'ws-run';
                                else if(v === '유휴') cls = 'ws-idle';
                                else cls = 'ws-wait';
                            }
                            const dotClass = cls || 'ws-wait';
                            cellValue = `<span class="status-pill"><span class="status-dot ${dotClass}" aria-hidden="true"></span><span class="status-text">${highlight(displayVal, col)}</span></span>`;
                        }
                    }
                    // DR 구축여부 / 서비스 이중화: 원형 뱃지(O/X)로 표시 (O는 accent 컬러)
                    if((col === 'dr_built' || col === 'svc_redundancy')){
                        const ox = String(displayVal).toUpperCase();
                        if(ox === 'O' || ox === 'X'){
                            cellValue = `<span class="cell-ox with-badge"><span class="ox-badge ${ox==='O'?'on':'off'}">${ox}</span></span>`;
                        }
                    }
                    // 기밀성/무결성/가용성/보안 점수: 숫자를 동그라미 배지로 표시
                    if(['confidentiality','integrity','availability','security_score'].includes(col)){
                        const valStr = String(displayVal);
                        // '-'는 그대로 '-' 표시
                        if(valStr !== '-'){
                            const n = parseInt(valStr, 10);
                            // tone 매핑:
                            // - 기밀성/무결성/가용성: 1->tone-1, 2->tone-2, 3->tone-3
                            // - 보안 점수(security_score): 1-5->tone-1, 6-7->tone-2, 8-9->tone-3
                            let tone = 'tone-1';
                            if(!isNaN(n)){
                                if(col === 'security_score'){
                                    tone = (n >= 8) ? 'tone-3' : (n >= 6 ? 'tone-2' : 'tone-1');
                                } else {
                                    tone = (n >= 3) ? 'tone-3' : (n === 2 ? 'tone-2' : 'tone-1');
                                }
                            }
                            // 표시 숫자: security_score는 합계 그대로, 나머지는 원 숫자
                            const show = isNaN(n) ? escapeHTML(valStr) : String(n);
                            cellValue = `<span class="cell-num"><span class="num-badge ${tone}">${show}</span></span>`;
                        }
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

    function escapeAttr(str){
        return String(str).replace(/[&<>'"]/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[s]));
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

        // Safety: if current visible set contains no valid columns for this page, restore defaults
        const validKeys = new Set(Object.keys(COLUMN_META));
        const hasAnyValid = [...state.visibleCols].some(k => validKeys.has(k));
        if(!hasAnyValid){
            state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
            // persist repaired state
            try { localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify([...state.visibleCols])); } catch(_e){}
        }

        table.querySelectorAll('thead th[data-col], tbody td[data-col]').forEach(cell=>{
            const col = cell.getAttribute('data-col');
            if(col==='actions') return;
            if(state.visibleCols.has(col)) cell.classList.remove('col-hidden'); else cell.classList.add('col-hidden');
        });
    }

    function saveColumnSelection(){
        try { localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify([...state.visibleCols])); } catch(e){}
    }
    function loadColumnSelection(){
        try {
            // Prefer the page-specific key
            let raw = localStorage.getItem(VISIBLE_COLS_KEY);
            // Fallback/migration from old shared key
            if(!raw) raw = localStorage.getItem(OLD_VISIBLE_COLS_KEY);
            if(raw){
                const parsed = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
                const allowed = new Set(Object.keys(COLUMN_META));
                const filtered = [...new Set(parsed.filter(k => allowed.has(k)))];
                if(filtered.length){
                    state.visibleCols = new Set(filtered);
                    try { localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify(filtered)); } catch(_e){}
                } else {
                    state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
                    try { localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify([...state.visibleCols])); } catch(_e){}
                }
                // Best-effort cleanup of the old shared key to avoid future collisions
                try { localStorage.removeItem(OLD_VISIBLE_COLS_KEY); } catch(_e){}
            } else {
                // No stored preference; persist defaults so applyColumnVisibility has a stable base
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
            if(!el.name) return;
            data[el.name]=el.value.trim();
        });
        return attachOwnerDisplayValues(form, data);
    }

    function attachOwnerDisplayValues(form, data){
        if(!form) return data;
        ['sys_owner','svc_owner'].forEach(field=>{
            const select = form.querySelector(`[name="${field}"]`);
            if(!select) return;
            const selected = select.selectedOptions && select.selectedOptions[0];
            if(!selected) return;
            const displayName = (selected.dataset.ownerName || '').trim();
            if(displayName){
                data[`${field}_display`] = displayName;
            }
            const ownerEmp = (selected.dataset.ownerEmp || '').trim();
            if(ownerEmp){
                data[`${field}_emp_value`] = ownerEmp;
            }
            const ownerDept = (selected.dataset.ownerDept || '').trim();
            if(ownerDept){
                data[`${field}_dept_display`] = ownerDept;
            }
        });
        return data;
    }

    function fillEditForm(row){
        const form = document.getElementById(EDIT_FORM_ID); if(!form) return;
        form.innerHTML='';
        const groups = [
            { title:'비즈니스', cols:['work_type','work_category','work_status','work_operation','work_group','work_name','system_name','system_ip','manage_ip'] },
            { title:'시스템', cols:['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','rack_face'] },
            { title:'담당자', cols:['sys_dept','sys_owner','svc_dept','svc_owner'] },
            // 점검 섹션 순서를 '시스템 등록'과 동일하게 맞춤: 기밀성, 무결성, 가용성, 보안 점수, 시스템 등급, 핵심/일반, DR 구축여부, 서비스 이중화
            { title:'점검', cols:['confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'] }
        ];
        groups.forEach(g=>{
            const section = document.createElement('div'); section.className='form-section';
            section.innerHTML = `<div class="section-header"><h4>${g.title}</h4></div>`;
            const grid = document.createElement('div'); grid.className='form-grid';
            g.cols.forEach(c=>{ if(!COLUMN_META[c] && c!=='security_score') return; const wrap=document.createElement('div'); wrap.className='form-row';
                const labelText = (c==='security_score') ? '보안 점수' : (COLUMN_META[c]?.label||c);
                const valueForField = getFieldValueForEdit(row, c);
                wrap.innerHTML=`<label>${labelText}</label>${generateFieldInput(c,valueForField)}`; grid.appendChild(wrap); });
            section.appendChild(grid); form.appendChild(section);
        });
        hydrateFkSelects(EDIT_FORM_ID);
        enhanceFormSearchableSelects(EDIT_FORM_ID);
        setupLocationCascadeForForm(EDIT_FORM_ID);
        const fkReady = ensureFkDataReady();
        if(fkReady && typeof fkReady.then === 'function'){
            fkReady.then(()=>{
                hydrateFkSelects(EDIT_FORM_ID);
                enhanceFormSearchableSelects(EDIT_FORM_ID);
                setupLocationCascadeForForm(EDIT_FORM_ID);
            });
        }
        attachSecurityScoreRecalc(EDIT_FORM_ID);
        setupOwnerDependenciesForForm(EDIT_FORM_ID);
        setupModelDependenciesForForm(EDIT_FORM_ID);
    }

    function generateFieldInput(col,value=''){
        const opts={
            virtualization:['','물리서버','가상서버','클라우드'],
            confidentiality:['','1','2','3'], integrity:['','1','2','3'], availability:['','1','2','3'],
            system_grade:['','1등급','2등급','3등급'], core_flag:['','핵심','일반'], dr_built:['','O','X'], svc_redundancy:['','O','X']
        };
        if(FK_FIELD_SPECS[col]){
            return renderFkSelect(col, value);
        }
        if(col === 'security_score'){
            const v = (value==null? '': value);
            return `<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="${v}">`;
        }
        if(opts[col]){
            const isScoreField = ['confidentiality','integrity','availability'].includes(col);
            const classList = ['form-input','search-select'];
            if(isScoreField){ classList.push('score-trigger'); }
            return `<select name="${col}" class="${classList.join(' ')}" data-searchable="true" data-placeholder="선택">`+
                opts[col].map(o=>`<option value="${o}" ${o===String(value)?'selected':''}>${o||'-'}</option>`).join('')+`</select>`;
        }
        if(col==='rack_face'){
            const selF = (value||'').toUpperCase()==='REAR'||value==='후면' ? '' : ' selected';
            const selR = (value||'').toUpperCase()==='REAR'||value==='후면' ? ' selected' : '';
            return `<select name="rack_face" class="form-input search-select" data-searchable="true" data-placeholder="선택"><option value="">선택</option><option value="FRONT"${selF}>전면</option><option value="REAR"${selR}>후면</option></select>`;
        }
        if(['slot','u_size'].includes(col)) return `<input name="${col}" type="number" min="0" step="1" class="form-input" value="${value??''}">`;
        return `<input name="${col}" class="form-input" value="${value??''}">`;
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
        const dashTargetsText = ['vendor','model','serial','location_pos','rack_face'];
        const dashTargetsNumber = ['slot','u_size'];
        const makeDash = (el)=>{
            if(!el) return;
            if(el.tagName === 'SELECT'){
                el.value = '';
            } else {
                el.value = '-';
            }
        };
        const clearIfDash = (el, fallbackType)=>{
            if(!el) return;
            if(el.tagName === 'SELECT'){
                return;
            }
            if(el.value === '-') el.value = '';
            if(fallbackType){ try{ el.type = fallbackType; }catch(_){} }
        };
        if(v === '가상서버' || v === '클라우드'){
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
        const filename = `system_list_${yyyy}${mm}${dd}.csv`;
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
            // 업무 이름 클릭 시: 상세 페이지로 이동 전에 선택값 저장
            const workLink = e.target.closest('.work-name-link');
            if(workLink){
                try{
                    const rid = parseInt(workLink.getAttribute('data-id') || workLink.closest('tr')?.getAttribute('data-id') || '-1', 10);
                    const row = state.data.find(r=> r.id === rid);
                    if(row){
                        sessionStorage.setItem('cloud:selected:work_name', String(row.work_name||''));
                        sessionStorage.setItem('cloud:selected:system_name', String(row.system_name||''));
                        try{ sessionStorage.setItem('cloud:selected:row', JSON.stringify(row)); }catch(_e){}
                        try{ localStorage.setItem('cloud:selected:row', JSON.stringify(row)); }catch(_e){}
                        // 보안: URL에 work/system/asset_id를 넣지 않고, storage로 컨텍스트 전달
                        try{
                            const assetId = (row.id != null ? row.id : row.asset_id);
                            if(assetId != null){
                                try{ sessionStorage.setItem('cloud:selected:asset_id', String(assetId)); }catch(_e0){}
                                try{ localStorage.setItem('cloud:selected:asset_id', String(assetId)); }catch(_e1){}
                            }
                        }catch(_e2){}
                        e.preventDefault();
                        blsSpaNavigate(DETAIL_URL + '?asset_id=' + encodeURIComponent(String(row.id != null ? row.id : row.asset_id)));
                        return;
                    }
                }catch(_e){}
                // 행을 찾지 못한 경우 기본 링크 내비게이션 진행
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
                    attachVirtualizationHandler(EDIT_FORM_ID);
                    openModal(EDIT_MODAL_ID);
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
            refreshAddFormFkFields();
            const ready = ensureFkDataReady();
            if(ready && typeof ready.then === 'function'){
                ready.then(()=> refreshAddFormFkFields());
            }
            openModal(ADD_MODAL_ID);
            attachSecurityScoreRecalc(ADD_FORM_ID);
            attachVirtualizationHandler(ADD_FORM_ID);
            setupOwnerDependenciesForForm(ADD_FORM_ID);
        });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(ADD_FORM_ID);
            if(!form) return;
            if(!form.checkValidity()){ form.reportValidity(); return; }
            enforceVirtualizationDash(form);
            const formData = collectForm(form);
            const btn = document.getElementById(ADD_SAVE_ID);
            if(btn){ btn.disabled = true; }
            try{
                await createAssetWithAutoRetry(formData);
                form.reset();
                closeModal(ADD_MODAL_ID);
                await loadAssetsFromServer();
                showMessage('자산이 등록되었습니다.', '등록 완료');
            }catch(err){
                console.error(err);
                showMessage(err.message || '클라우드 자산 등록 중 오류가 발생했습니다.', '등록 실패');
            }finally{
                if(btn){ btn.disabled = false; }
            }
        });
        // edit modal
        document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(EDIT_FORM_ID);
            if(!form) return;
            const indexEl = document.getElementById(EDIT_SAVE_ID);
            const index = parseInt(indexEl?.getAttribute('data-index')||'-1',10);
            const row = Number.isInteger(index) ? state.data[index] : null;
            if(!row){ showMessage('선택된 자산을 찾을 수 없습니다.', '수정 실패'); return; }
            enforceVirtualizationDash(form);
            const formData = collectForm(form);
            const payload = buildAssetPayload(formData, row);
            const btn = document.getElementById(EDIT_SAVE_ID);
            if(btn){ btn.disabled = true; }
            try{
                await apiUpdateAsset(row.id, payload);
                closeModal(EDIT_MODAL_ID);
                var virtVal = (formData.virtualization || '').trim();
                var _virtTabMap = {'물리서버':'/p/hw_server_onpremise','가상서버':'/p/hw_server_workstation','클라우드':'/p/hw_server_cloud'};
                if(virtVal && _virtTabMap[virtVal] && _virtTabMap[virtVal] !== '/p/hw_server_cloud'){
                    showMessage('자산이 수정되었습니다. 해당 탭으로 이동합니다.', '수정 완료');
                    setTimeout(function(){ blsSpaNavigate(_virtTabMap[virtVal]); }, 800);
                    return;
                }
                await loadAssetsFromServer({ preservePage: true });
                showMessage('자산이 수정되었습니다.', '수정 완료');
            }catch(err){
                console.error(err);
                showMessage(err.message || '클라우드 자산 수정 중 오류가 발생했습니다.', '수정 실패');
            }finally{
                if(btn){ btn.disabled = false; }
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
                    const wide = ['업무 이름','시스템 이름','시스템 제조사','시스템 모델명','시스템 위치','시스템 담당부서','서비스 담당부서'];
                    const mid = ['업무 그룹','시스템 IP','관리 IP'];
                    if(wide.includes(h)) return { wch: 18 };
                    if(mid.includes(h)) return { wch: 15 };
                    return { wch: 12 };
                });

                // Guide sheet: rules and allowed values (Korean)
                const rules = [
                    ['엑셀 업로드 가이드'],
                    [''],
                    ['작성 규칙'],
                    ['- 첫 행의 컬럼 제목은 아래 순서와 완전히 일치해야 합니다. (순서/이름 변경 불가)'],
                    ['- "보안 점수"는 입력하지 않습니다. 기밀성+무결성+가용성 합계로 자동 계산됩니다.'],
                    ['- "시스템 가상화"가 "가상"인 경우 다음 필드는 "-"로 입력하세요: 시스템 제조사, 시스템 모델명, 시스템 일련번호, 시스템 위치, 시스템 슬롯, 시스템 크기'],
                    ['- "시스템 슬롯", "시스템 크기"는 숫자만 입력하세요.'],
                    ['- "RACK 전면/후면"은 전면 또는 후면만 입력하세요. (기본값: 전면)'],
                    [''],
                    ['컬럼 순서 (복사/참고용)'],
                    [UPLOAD_HEADERS_KO.join(', ')],
                    [''],
                    ['허용 값 (선택 컬럼)'],
                    ['- 기밀성: 1, 2, 3'],
                    ['- 무결성: 1, 2, 3'],
                    ['- 가용성: 1, 2, 3'],
                    ['- 시스템 등급: 1등급, 2등급, 3등급'],
                    ['- 핵심/일반: 핵심, 일반'],
                    ['- DR 구축여부: O, X'],
                    ['- 서비스 이중화: O, X'],
                ];
                const wsGuide = XLSX.utils.aoa_to_sheet(rules);
                wsGuide['!cols'] = [{ wch: 120 }];

                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template');
                XLSX.utils.book_append_sheet(wb, wsGuide, '가이드');
                XLSX.writeFile(wb, 'system_upload_template.xlsx');
            }catch(e){ console.error(e); showMessage('템플릿 생성 중 오류가 발생했습니다.', '오류'); }
        });
        // confirm upload with parse + validation
        document.getElementById(UPLOAD_CONFIRM_ID)?.addEventListener('click', ()=>{
            showMessage('엑셀 업로드는 아직 서버 연동 준비 중입니다.', '준비 중');
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
            if(!ENABLE_CLOUD_DUPLICATE){
                showMessage('행 복제는 아직 서버 연동 준비 중입니다.', '준비 중');
                closeModal('system-duplicate-modal');
                return;
            }
            const originals = state.data.filter(r=> state.selected.has(r.id));
            if(!originals.length){ showMessage('선택된 행을 찾을 수 없습니다.', '오류'); closeModal('system-duplicate-modal'); return; }
            // TODO: API 연동 시 복제 로직 구현
        });
        // dispose (불용처리)
        document.getElementById(DISPOSE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('불용처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('dispose-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 자산을 정말 불용처리하시겠습니까?`; }
            openModal(DISPOSE_MODAL_ID);
        });
    document.getElementById(DISPOSE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DISPOSE_MODAL_ID));
        document.getElementById(DISPOSE_CONFIRM_ID)?.addEventListener('click', async ()=>{
            const ids = [...state.selected];
            if(!ids.length){ closeModal(DISPOSE_MODAL_ID); return; }
            const btn = document.getElementById(DISPOSE_CONFIRM_ID);
            if(btn){ btn.disabled = true; }
            try {
                const res = await fetch('/api/hardware/assets/dispose', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ ids: ids, category: 'server' })
                });
                const data = await res.json();
                if(!data.success){ showMessage(data.message || '불용처리 실패', '오류'); return; }
                closeModal(DISPOSE_MODAL_ID);
                blsSpaNavigate('/p/gov_unused_server');
            } catch(err){
                showMessage('불용처리 중 오류가 발생했습니다.', '오류');
            } finally {
                if(btn){ btn.disabled = false; }
            }
        });
        // delete (삭제처리)
        document.getElementById(DELETE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('삭제처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('delete-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 자산을 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', async ()=>{
            const ids = [...state.selected];
            if(!ids.length){ showMessage('삭제할 자산을 선택하세요.', '안내'); return; }
            const btn = document.getElementById(DELETE_CONFIRM_ID);
            if(btn){ btn.disabled = true; }
            try{
                await apiDeleteAssets(ids);
                state.selected.clear();
                closeModal(DELETE_MODAL_ID);
                await loadAssetsFromServer({ preservePage: true });
                showMessage(`${ids.length}개 자산이 삭제되었습니다.`, '삭제 완료');
            }catch(err){
                console.error(err);
                showMessage(err.message || '자산 삭제 중 오류가 발생했습니다.', '삭제 실패');
            }finally{
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
                attachVirtualizationHandler(EDIT_FORM_ID);
                openModal(EDIT_MODAL_ID);
                const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                if(editSaveEl){ editSaveEl.setAttribute('data-index', realIndex); }
                return;
            }
            // 2개 이상 → 일괄변경 모달
            const subtitle = document.getElementById('bulk-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 자산에서 지정한 필드를 일괄 변경합니다.`; }
            buildBulkForm();
            openModal(BULK_MODAL_ID);
        });
        document.getElementById(BULK_CLOSE_ID)?.addEventListener('click', ()=> closeModal(BULK_MODAL_ID));
        document.getElementById(BULK_APPLY_ID)?.addEventListener('click', ()=>{
            if(!ENABLE_CLOUD_BULK_EDIT){ showMessage('일괄변경은 서버 연동 준비 중입니다.', '준비 중'); return; }
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
        // 제외: 시스템 IP, 관리 IP, 시스템 일련번호, (편집 모달 정책과 동일하게) 보안 점수는 직접 입력하지 않음
        const EXCLUDE = new Set(['system_ip','manage_ip','serial','security_score']);
        // 입력 컴포넌트 생성 규칙 (edit/add와 동일한 옵션)
        function inputFor(col){
            const opts={
                virtualization:['','물리서버','가상서버','클라우드'],
                confidentiality:['','1','2','3'], integrity:['','1','2','3'], availability:['','1','2','3'],
                system_grade:['','1등급','2등급','3등급'], core_flag:['','핵심','일반'], dr_built:['','O','X'], svc_redundancy:['','O','X']
            };
            if(opts[col]){
                return `<select class="form-input search-select" data-bulk-field="${col}" data-searchable="true" data-placeholder="선택">`+
                    opts[col].map(o=>`<option value="${o}">${o||'-'}</option>`).join('')+`</select>`;
            }
            if(col==='rack_face') return `<select class="form-input search-select" data-bulk-field="rack_face" data-searchable="true" data-placeholder="선택"><option value="">-</option><option value="FRONT">전면</option><option value="REAR">후면</option></select>`;
            if(['slot','u_size'].includes(col)) return `<input type="number" min="0" step="1" class="form-input" data-bulk-field="${col}" placeholder="숫자">`;
            return `<input class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }
        // 시스템 수정 모달과 동일한 그룹 구조 사용(필수 제외 필드는 건너뜀)
        const GROUPS = [
            { title:'비즈니스', cols:['work_type','work_category','work_status','work_operation','work_group','work_name','system_name','system_ip','manage_ip'] },
            { title:'시스템', cols:['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','rack_face'] },
            { title:'담당자', cols:['sys_dept','sys_owner','svc_dept','svc_owner'] },
            { title:'점검', cols:['confidentiality','integrity','availability','system_grade','core_flag','dr_built','svc_redundancy'] }
        ];
        // 섹션 마크업으로 렌더링 (form-section/form-grid 재사용) -> 컨텐츠 좌우 여백/구분선 자동 적용
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
                </div>
            `;
        }).join('');
        enhanceFormSearchableSelects(BULK_FORM_ID);
    }

    // ----- Stats helpers -----
    function renderStatBlock(containerId, title, dist, fixedOptions, opts){
        return window.blsStats.renderCard(containerId, title, dist, fixedOptions, opts);
    }

    // Make all stat cards the same height across the modal
    // Reference height: the card titled "업무 운영"; however, never shrink below the tallest card
    function equalizeStatsHeights(){
        return window.blsStats.equalizeHeights(STATS_MODAL_ID);
    }

    function countBy(rows, key, fixedOptions){
        return window.blsStats.countBy(rows, key, fixedOptions);
    }

    function buildStats(){
        const businessEl = document.getElementById('stats-business');
        const systemEl = document.getElementById('stats-system');
        const inspEl = document.getElementById('stats-inspection');
        if(businessEl) businessEl.innerHTML='';
        if(systemEl) systemEl.innerHTML='';
        if(inspEl) inspEl.innerHTML='';
        // 대상 데이터: 현재 필터/정렬 적용 전부를 기준으로 통계 (state.filtered)
        const rows = state.filtered.length ? state.filtered : state.data;
        // 비즈니스
        renderStatBlock('stats-business', '업무 분류', countBy(rows, 'work_type'));
        renderStatBlock('stats-business', '업무 구분', countBy(rows, 'work_category'));
    renderStatBlock('stats-business', '업무 상태', countBy(rows, 'work_status', ['가동','유휴','대기']), ['가동','유휴','대기']);
    // 업무 운영: 테이블 데이터 그대로(변동 도메인) 기반으로 렌더링
    renderStatBlock('stats-business', '업무 운영', countBy(rows, 'work_operation'));
        renderStatBlock('stats-business', '업무 그룹', countBy(rows, 'work_group'));
        // After rendering '업무 그룹', append the analysis illustration card right after it
        try {
            const bizGrid = document.getElementById('stats-business');
            if (bizGrid) {
                const cards = bizGrid.querySelectorAll('.stat-card');
                const workGroupCard = Array.from(cards).find(c => c.querySelector('.stat-title')?.textContent?.trim() === '업무 그룹');
                const illu = document.createElement('div');
                illu.className = 'stat-card stat-illustration-card';
                illu.setAttribute('aria-hidden','true');
                illu.innerHTML = '<img src="/static/image/svg/list/free-sticker-analysis.svg" alt="" loading="lazy">';
                if (workGroupCard && workGroupCard.nextSibling) {
                    workGroupCard.parentNode.insertBefore(illu, workGroupCard.nextSibling);
                } else if (bizGrid) {
                    bizGrid.appendChild(illu);
                }
            }
        } catch(_e){}
        // 시스템
        renderStatBlock('stats-system', '시스템 제조사', countBy(rows, 'vendor'));
        renderStatBlock('stats-system', '시스템 모델명', countBy(rows, 'model'));
        renderStatBlock('stats-system', '시스템 가상화', countBy(rows, 'virtualization', ['물리서버','가상서버','클라우드']), ['물리서버','가상서버','클라우드']);
        renderStatBlock('stats-system', '시스템 장소', countBy(rows, 'location_place'));
        // 점검
        renderStatBlock('stats-inspection', '보안 점수', countBy(rows, 'security_score', ['3','4','5','6','7','8','9']), ['3','4','5','6','7','8','9'], { hideZero:true, zeroNote:true });
        renderStatBlock('stats-inspection', '시스템 등급', countBy(rows, 'system_grade', ['1등급','2등급','3등급']), ['1등급','2등급','3등급']);
        renderStatBlock('stats-inspection', '핵심/일반', countBy(rows, 'core_flag', ['핵심','일반']), ['핵심','일반']);
        renderStatBlock('stats-inspection', 'DR 구축여부', countBy(rows, 'dr_built', ['O','X']), ['O','X'], { toggleOX:true });
        renderStatBlock('stats-inspection', '서비스 이중화', countBy(rows, 'svc_redundancy', ['O','X']), ['O','X'], { toggleOX:true });
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
        // SPA: immediately enforce column visibility on thead before async data loads
        applyColumnVisibility();
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
        refreshAddFormFkFields();
        ensureFkDataReady();
        applyFilter();
        loadAssetsFromServer();
        // SPA safety: re-apply column visibility after next paint
        requestAnimationFrame(function(){ applyColumnVisibility(); });
        // Page adornments (animation + popover)
}
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


