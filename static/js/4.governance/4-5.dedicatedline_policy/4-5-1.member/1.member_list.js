/**
 * 전용회선 관리 페이지 스크립트
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
    const FLATPICKR_VENDOR_BASE = '/static/vendor/flatpickr/4.6.13';
    const FLATPICKR_CSS = `${FLATPICKR_VENDOR_BASE}/flatpickr.min.css`;
    const FLATPICKR_THEME_NAME = 'airbnb'; // use neutral theme; colors overridden to match accent
    const FLATPICKR_THEME_HREF = `${FLATPICKR_VENDOR_BASE}/themes/${FLATPICKR_THEME_NAME}.css`;
    const FLATPICKR_JS = `${FLATPICKR_VENDOR_BASE}/flatpickr.min.js`;
    const FLATPICKR_KO = `${FLATPICKR_VENDOR_BASE}/l10n/ko.js`;
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
        const startEl = form.querySelector('[name="open_date"]');
        const endEl = form.querySelector('[name="close_date"]');

        // simple YYYY-MM-DD parser avoiding timezone shifts
        function parseYMD(s){
            if(!s) return null; const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/); if(!m) return null;
            const y=+m[1], mo=(+m[2])-1, d=+m[3]; const dt = new Date(y, mo, d); if(dt.getFullYear()!==y||dt.getMonth()!==mo||dt.getDate()!==d) return null; return dt;
        }
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
        if(startEl && !startEl._flatpickr){ window.flatpickr(startEl, opts); }
        if(endEl && !endEl._flatpickr){ window.flatpickr(endEl, opts); }

        // Link pickers to prevent selecting invalid ranges and validate on manual input
        const startFp = startEl? startEl._flatpickr : null;
        const endFp = endEl? endEl._flatpickr : null;
        function syncRangeConstraints(){
            const s = parseYMD(startEl?.value);
            const e = parseYMD(endEl?.value);
            if(endFp){ endFp.set('minDate', s || null); }
            if(startFp){ startFp.set('maxDate', e || null); }
        }
        function validatePair(changed){
            const s = parseYMD(startEl?.value);
            const e = parseYMD(endEl?.value);
            if(s && e && s.getTime() > e.getTime()){
                // show message and clear the last changed field
                showMessage('개통일자는 해지일자보다 늦을 수 없습니다.', '유효성 오류');
                if(changed === 'start' && startEl){ startEl.value=''; startFp?.clear(); }
                if(changed === 'end' && endEl){ endEl.value=''; endFp?.clear(); }
                return false;
            }
            return true;
        }
        if(startFp){
            startFp.config.onChange.push(()=>{ syncRangeConstraints(); validatePair('start'); });
        }
        if(endFp){
            endFp.config.onChange.push(()=>{ syncRangeConstraints(); validatePair('end'); });
        }
        // Also validate on manual typing/blur
        if(startEl){ startEl.addEventListener('blur', ()=>{ syncRangeConstraints(); validatePair('start'); }); }
        if(endEl){ endEl.addEventListener('blur', ()=>{ syncRangeConstraints(); validatePair('end'); }); }
        // initial sync
        syncRangeConstraints();
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

    function normalizePolicyLabel(raw){
        const s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
        if(!s) return '';
        return s.replace(/\s*정책\s*$/, '').trim();
    }

    function resolvePolicyLabel(){
        let label = '';
        const tabsRoot = document.getElementById('dynamic-system-tabs');
        if(tabsRoot){
            const active = tabsRoot.querySelector('[aria-current="page"], .active, [aria-selected="true"]');
            if(active){
                label = normalizePolicyLabel(active.textContent || active.innerText || '');
            }
        }
        if(!label){
            const pageTitle = document.querySelector('.page-header h1');
            if(pageTitle){
                const title = String(pageTitle.textContent || pageTitle.innerText || '').trim();
                label = normalizePolicyLabel(title.replace(/\s*정책\s*관리\s*$/, '').replace(/\s*관리\s*$/, ''));
            }
        }
        if(!label){
            label = normalizePolicyLabel(window.__DL_LABEL || '');
        }
        return label || '전용회선';
    }

    function getPolicyTitleText(){
        return `${resolvePolicyLabel()} 정책`;
    }

    function getEmptyTitleText(){
        return `${resolvePolicyLabel()} 내역이 없습니다.`;
    }

    function applyDynamicLabelText(){
        const titleEl = document.querySelector('.tab-header-left h2');
        if(titleEl){
            const countEl = titleEl.querySelector('.count-badge');
            const countText = countEl ? (countEl.textContent || '0') : '0';
            titleEl.innerHTML = `${getPolicyTitleText()} <span class="count-badge" id="${COUNT_ID}">${countText}</span>`;
        }
        const emptyTitleEl = document.getElementById('system-empty-title');
        if(emptyTitleEl){
            emptyTitleEl.textContent = getEmptyTitleText();
        }
    }

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
    // Upload template (Dedicated line schema)
    const UPLOAD_HEADERS_KO = [
        '기관명','상태','통신사','프로토콜','관리주체','회선번호','회선명','업무','속도','개통일자','해지일자','장비명','통신장비','슬롯','포트','하위장비','하위포트','DR회선','당사관할국','기관관할국'
    ];
    const HEADER_KO_TO_KEY = {
        '기관명':'org_name','상태':'status','통신사':'telco','프로토콜':'protocol','관리주체':'manager','회선번호':'line_no','회선명':'line_name','업무':'business','속도':'speed','개통일자':'open_date','해지일자':'close_date','장비명':'device_name','통신장비':'network_device','슬롯':'slot','포트':'port','하위장비':'child_device','하위포트':'child_port','DR회선':'dr_line','당사관할국':'our_agency','기관관할국':'org_agency'
    };
    const ENUM_SETS = { };
    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
    function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }

    // Data + State
    const BASE_VISIBLE_COLUMNS = [
        'status','org_name','telco','protocol','manager','line_no','line_name','business','speed','device_name','network_device'
    ];
    const COLUMN_ORDER = [
        'status','org_name','telco','protocol','manager','line_no','line_name','business','speed','open_date','close_date','device_name','network_device','slot','port','child_device','child_port','dr_line','our_agency','org_agency'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '기본', columns: ['status','org_name','telco','protocol','manager'] },
        { group: '회선', columns: ['line_no','line_name','business','speed','open_date','close_date','dr_line'] },
        { group: '장비', columns: ['device_name','network_device','slot','port','child_device','child_port'] },
        { group: '관할', columns: ['our_agency','org_agency'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        org_name:{label:'기관명',group:'기본'},
        status:{label:'상태',group:'기본'},
        telco:{label:'통신사',group:'기본'},
        protocol:{label:'프로토콜',group:'기본'},
        manager:{label:'관리주체',group:'기본'},
        line_no:{label:'회선번호',group:'회선'},
        line_name:{label:'회선명',group:'회선'},
        business:{label:'업무',group:'회선'},
        speed:{label:'속도',group:'회선'},
        open_date:{label:'개통일자',group:'회선'},
        close_date:{label:'해지일자',group:'회선'},
        device_name:{label:'장비명',group:'장비'},
        network_device:{label:'통신장비',group:'장비'},
        slot:{label:'슬롯',group:'장비'},
        port:{label:'포트',group:'장비'},
        child_device:{label:'하위장비',group:'장비'},
        child_port:{label:'하위포트',group:'장비'},
        dr_line:{label:'DR회선',group:'회선'},
        our_agency:{label:'당사관할국',group:'관할'},
        org_agency:{label:'기관관할국',group:'관할'}
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
        visibleCols: new Set(BASE_VISIBLE_COLUMNS),
        search: '',
        // 선택된 행 (row id 기반) 저장하여 리렌더 후에도 유지
        selected: new Set(),
        nextId: 1, // mockData 초기화 후 재설정
        sortKey: null,
        sortDir: 'asc',
        currentUserId: null,
    columnFilters: {} // { col: value | [values...] } (조건 필터 기능 제거 예정 - 빈 유지)
    };

    // --- Governance / Dedicated Line Policy (DB-backed API) ---
    const LEASED_LINE_GROUP = window.__DL_LINE_GROUP || 'MEMBER';
    const LEASED_LINE_API = {
        sessionMe: '/api/session/me',
        lines: '/api/network/leased-lines',
    };

    function _coerceInt(v){
        if(v==null) return null;
        const n = parseInt(String(v), 10);
        return Number.isFinite(n) ? n : null;
    }

    async function apiRequestJson(url, options){
        const resp = await fetch(url, {
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', ...(options && options.headers ? options.headers : {}) },
            ...options,
        });
        let data = null;
        try { data = await resp.json(); } catch(_e){ data = null; }
        if(!resp.ok){
            const msg = (data && (data.message || data.error)) ? (data.message || data.error) : `요청 실패 (${resp.status})`;
            throw new Error(msg);
        }
        return data;
    }

    async function ensureActorUserId(){
        if(state.currentUserId) return state.currentUserId;
        try {
            const me = await apiRequestJson(LEASED_LINE_API.sessionMe, { method:'GET' });
            const id = _coerceInt(me?.user?.id);
            if(id){ state.currentUserId = id; return id; }
        } catch(_e){
            // list view can still render even when session isn't available
        }
        return null;
    }

    function leasedLineApiToUiRow(item){
        const slot = (item?.slot_no === 0) ? 0 : (item?.slot_no ?? '');
        return {
            id: item?.id,
            org_name: item?.org_name || '',
            status: item?.status_code || '',
            telco: item?.carrier_code || '',
            protocol: item?.protocol_code || '',
            manager: item?.management_owner || '',
            line_no: item?.line_no || '',
            line_name: item?.line_name || '',
            business: item?.business_purpose || '',
            speed: item?.speed_label || '',
            open_date: item?.opened_date || '',
            close_date: item?.closed_date || '',
            dr_line: item?.dr_line_no || '',
            device_name: item?.device_name || '',
            network_device: item?.comm_device || '',
            slot: slot,
            port: item?.port_no || '',
            child_device: item?.child_device_name || '',
            child_port: item?.child_port_no || '',
            our_agency: item?.our_jurisdiction || '',
            org_agency: item?.org_jurisdiction || '',
        };
    }

    function leasedLineUiToCreatePayload(ui, actorId){
        const slotNo = (ui?.slot==='' || ui?.slot==null) ? null : _coerceInt(ui.slot);
        return {
            line_group: LEASED_LINE_GROUP,
            org_name: String(ui?.org_name||'').trim() || null,
            status_code: String(ui?.status||'').trim() || null,
            carrier_code: String(ui?.telco||'').trim() || null,
            protocol_code: String(ui?.protocol||'').trim() || null,
            management_owner: String(ui?.manager||'').trim() || null,
            line_no: String(ui?.line_no||'').trim() || null,
            line_name: String(ui?.line_name||'').trim() || null,
            business_purpose: String(ui?.business||'').trim() || null,
            speed_label: String(ui?.speed||'').trim() || null,
            opened_date: String(ui?.open_date||'').trim() || null,
            closed_date: String(ui?.close_date||'').trim() || null,
            dr_line_no: String(ui?.dr_line||'').trim() || null,
            device_name: String(ui?.device_name||'').trim() || null,
            comm_device: String(ui?.network_device||'').trim() || null,
            slot_no: (slotNo==null ? null : slotNo),
            port_no: String(ui?.port||'').trim() || null,
            child_device_name: String(ui?.child_device||'').trim() || null,
            child_port_no: String(ui?.child_port||'').trim() || null,
            our_jurisdiction: String(ui?.our_agency||'').trim() || null,
            org_jurisdiction: String(ui?.org_agency||'').trim() || null,
            created_by_user_id: actorId,
        };
    }

    function leasedLineUiPatchToUpdatePayload(patch, actorId){
        const out = { updated_by_user_id: actorId };
        if('org_name' in patch) out.org_name = String(patch.org_name||'').trim() || null;
        if('status' in patch) out.status_code = String(patch.status||'').trim() || null;
        if('telco' in patch) out.carrier_code = String(patch.telco||'').trim() || null;
        if('protocol' in patch) out.protocol_code = String(patch.protocol||'').trim() || null;
        if('manager' in patch) out.management_owner = String(patch.manager||'').trim() || null;

        if('line_no' in patch) out.line_no = String(patch.line_no||'').trim() || null;
        if('line_name' in patch) out.line_name = String(patch.line_name||'').trim() || null;
        if('business' in patch) out.business_purpose = String(patch.business||'').trim() || null;
        if('speed' in patch) out.speed_label = String(patch.speed||'').trim() || null;
        if('open_date' in patch) out.opened_date = String(patch.open_date||'').trim() || null;
        if('close_date' in patch) out.closed_date = String(patch.close_date||'').trim() || null;
        if('dr_line' in patch) out.dr_line_no = String(patch.dr_line||'').trim() || null;

        if('device_name' in patch) out.device_name = String(patch.device_name||'').trim() || null;
        if('network_device' in patch) out.comm_device = String(patch.network_device||'').trim() || null;
        if('slot' in patch){
            const slotNo = (patch.slot==='' || patch.slot==null) ? null : _coerceInt(patch.slot);
            out.slot_no = (slotNo==null ? null : slotNo);
        }
        if('port' in patch) out.port_no = String(patch.port||'').trim() || null;
        if('child_device' in patch) out.child_device_name = String(patch.child_device||'').trim() || null;
        if('child_port' in patch) out.child_port_no = String(patch.child_port||'').trim() || null;

        if('our_agency' in patch) out.our_jurisdiction = String(patch.our_agency||'').trim() || null;
        if('org_agency' in patch) out.org_jurisdiction = String(patch.org_agency||'').trim() || null;

        return out;
    }

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;

    // 샘플 데이터 (회원사 전용회선)
    function mockData(count=5){
        const rows = [
            { id:1, org_name:'A은행', status:'운용', telco:'KT',  protocol:'TCP',    manager:'우리회사', line_no:'KT-001-AAA', line_name:'본사-센터 전용망', business:'업무망', speed:'1G',   open_date:'2022-03-01', close_date:'',            device_name:'Router-A', network_device:'Cisco ASR',  slot:1, port:'Gi0/1',     child_device:'SW-A1', child_port:'Gi1/0/24', dr_line:'O', our_agency:'서울', org_agency:'서울' },
            { id:2, org_name:'B손해보험', status:'운용', telco:'LG',  protocol:'X25',    manager:'기관',   line_no:'LG-203-XYZ',  line_name:'지점망',            business:'영업망', speed:'100M', open_date:'2021-07-15', close_date:'',            device_name:'Router-B', network_device:'Juniper MX', slot:0, port:'xe-0/0/1', child_device:'SW-B1', child_port:'xe-0/0/48', dr_line:'X', our_agency:'부산', org_agency:'부산' },
            { id:3, org_name:'C생명',   status:'운용', telco:'SKB', protocol:'TCP',    manager:'우리회사', line_no:'SK-778-QQQ', line_name:'DR백업망',        business:'DR망',  speed:'200M', open_date:'2023-01-10', close_date:'',            device_name:'Router-C', network_device:'Cisco ISR',  slot:2, port:'Gi0/0/0', child_device:'SW-C1', child_port:'Gi1/0/12', dr_line:'O', our_agency:'대전', org_agency:'대전' },
            { id:4, org_name:'D캐피탈', status:'해지', telco:'KT',  protocol:'X25',    manager:'기관',   line_no:'KT-909-ZZZ', line_name:'지사망',            business:'업무망', speed:'50M',  open_date:'2019-05-20', close_date:'2024-01-31', device_name:'Router-D', network_device:'Huawei NE', slot:1, port:'GE0/0/2', child_device:'SW-D1', child_port:'GE1/0/24', dr_line:'X', our_agency:'광주', org_agency:'광주' },
            { id:5, org_name:'E증권',   status:'운용', telco:'KT',  protocol:'TCP',    manager:'우리회사', line_no:'KT-123-ABC', line_name:'API전용선',        business:'대외망', speed:'500M', open_date:'2020-11-05', close_date:'',            device_name:'Router-E', network_device:'Cisco ASR',  slot:3, port:'Gi0/3',     child_device:'SW-E1', child_port:'Gi1/0/3',  dr_line:'O', our_agency:'서울', org_agency:'서울' }
        ];
        return rows.slice(0, Math.max(0, count|0));
    }

    async function loadDataFromServer(){
        const url = `${LEASED_LINE_API.lines}?line_group=${encodeURIComponent(LEASED_LINE_GROUP)}`;
        const res = await apiRequestJson(url, { method:'GET' });
        if(!res?.success) throw new Error(res?.message || '전용회선 목록 조회 실패');
        const items = Array.isArray(res.items) ? res.items : [];
        state.selected.clear();
        state.data = items.map(leasedLineApiToUiRow);
        applyFilter();
    }

    async function initData(){
        try {
            await loadDataFromServer();
        } catch(e){
            console.error(e);
            state.data = [];
            state.selected.clear();
            applyFilter();
        }
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
        applyDynamicLabelText();
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
                    if(titleEl) titleEl.textContent = getEmptyTitleText();
                    if(descEl) descEl.textContent = "우측 상단 '추가' 버튼을 눌러 첫 회선을 등록하세요.";
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
                    // 기관명: 상세 페이지 링크 적용 (work-name-link 스타일)
                    if(col === 'org_name' && displayVal !== '-'){
                        // Dedicated Line Member: 상세 페이지 링크 (global injected URL)
                        const baseHref = (window.__MODULE_DETAIL_URL || '/p/gov_dedicatedline_member_detail');
                        let href = baseHref;
                        if(row.id != null){
                            const sep = baseHref.includes('?') ? '&' : '?';
                            const params = new URLSearchParams();
                            params.set('id', String(row.id));
                            if(row.org_name != null && String(row.org_name).trim() !== ''){
                                params.set('org_name', String(row.org_name));
                            }
                            // protocol column maps to protocol_code in the leased-line API
                            if(row.protocol != null && String(row.protocol).trim() !== ''){
                                params.set('protocol_code', String(row.protocol));
                            }
                            href = `${baseHref}${sep}${params.toString()}`;
                        }
                        cellValue = `<a class="work-name-link" href="${href}">${highlight(displayVal, col)}</a>`;
                    }
                    // 상태 배지 표시
                    if(col === 'status'){
                        const v = String(displayVal);
                        let cls = 'ws-wait';
                        if(v === '운용') cls = 'ws-run';
                        else if(v === '해지') cls = 'ws-wait';
                        cellValue = `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${highlight(displayVal, col)}</span></span>`;
                    }
                    // 속도: 등급별 컬러 점 + 값
                    if(col === 'speed'){
                        const mbps = parseSpeedToMbps(rawVal);
                        if(mbps != null){
                            const { tier, name } = getSpeedTier(mbps);
                            const title = name + (Number.isFinite(mbps)? ` • 약 ${mbps >= 1 ? (mbps.toFixed(mbps>=100?0:1)) : mbps.toFixed(3)} Mbps` : '');
                            cellValue = `<span class="speed-pill" title="${escapeHTML(title)}"><span class="speed-dot tier-${tier}" aria-hidden="true"></span><span class="speed-text">${highlight(displayVal, col)}</span></span>`;
                        }
                    }
                    // 통신사: 로고 + 텍스트 표시 (로고가 있을 경우)
                    if(col === 'telco'){
                        const v = String(rawVal||'').toUpperCase();
                        // 정규화: LGU+ -> LG, SKT -> SKB (로고 자원 경로 반영)
                        const key = (v === 'LGU+') ? 'LG' : (v === 'SKT' ? 'SKB' : v);
                        const logo = TELCO_LOGOS[key];
                        if(logo && displayVal !== '-'){
                            const label = String(rawVal||'');
                            cellValue = `<img src="${logo}" alt="${escapeHTML(label)}" title="${escapeHTML(label)}" class="telco-logo">`;
                        } else {
                            // 표에서는 텍스트 미표시 정책: 로고가 없으면 대시로 처리
                            cellValue = '-';
                        }
                    }
                    // DR회선: O/X 원형 뱃지 스타일 적용 (onpremise의 'DR 구축여부'와 동일)
                    if(col === 'dr_line'){
                        const ox = String(displayVal).toUpperCase();
                        if(ox === 'O' || ox === 'X'){
                            cellValue = `<span class="cell-ox with-badge"><span class="ox-badge ${ox==='O'?'on':'off'}">${ox}</span></span>`;
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

    function escapeHTML(str){
        return String(str).replace(/[&<>'"]/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[s]));
    }

    function collectOrgNameOptions(){
        const set = new Set();
        state.data.forEach(row=>{
            const name = String(row?.org_name || '').trim();
            if(name) set.add(name);
        });
        return Array.from(set).sort((a,b)=> a.localeCompare(b, 'ko'));
    }

    function buildOrgNameSelectOptions(currentValue){
        const options = collectOrgNameOptions();
        const current = String(currentValue || '').trim();
        const merged = current && !options.includes(current) ? [current, ...options] : options;
        return ['<option value="">선택</option>']
            .concat(merged.map(v=>`<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`))
            .join('');
    }

    function applyOrgNameSearchable(scopeEl){
        const root = scopeEl || document;
        root.querySelectorAll('select[name="org_name"]').forEach(select=>{
            const current = String(select.value || select.getAttribute('data-current') || '').trim();
            select.innerHTML = buildOrgNameSelectOptions(current);
            if(current) select.value = current;
            select.classList.add('search-select');
            select.setAttribute('data-searchable', 'true');
            select.setAttribute('data-placeholder', '기관명 검색');
            select.setAttribute('data-allow-clear', 'true');
        });
        try{
            if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
                window.BlossomSearchableSelect.syncAll(root);
            }
        }catch(_e){}
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
        try { localStorage.setItem('member_visible_cols', JSON.stringify([...state.visibleCols])); } catch(e){}
    }
    function loadColumnSelection(){
        try {
            // One-time migration to restore default columns after cross-page key collision
            const VER_KEY = 'member_visible_cols_ver';
            const CURRENT_VER = '2';
            const storedVer = localStorage.getItem(VER_KEY);
            if(storedVer !== CURRENT_VER){
                // Reset to defaults and set version
                state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
                try { localStorage.setItem('member_visible_cols', JSON.stringify([...state.visibleCols])); } catch(_e){}
                try { localStorage.setItem(VER_KEY, CURRENT_VER); } catch(_e){}
                return; // use defaults on first load after migration
            }
            const raw = localStorage.getItem('member_visible_cols');
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
                try { localStorage.setItem('member_visible_cols', JSON.stringify([...state.visibleCols])); } catch(_e){}
            } else {
                // Stored value was empty or invalid — fall back to defaults and persist
                state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
                try { localStorage.setItem('member_visible_cols', JSON.stringify([...state.visibleCols])); } catch(_e){}
            }
        } catch(e){}
    }

    // ---- Sort persistence ----
    function saveSortPreference(){
        try{
            if(state.sortKey){
                localStorage.setItem('member_sort_key', state.sortKey);
                localStorage.setItem('member_sort_dir', state.sortDir==='desc' ? 'desc' : 'asc');
            } else {
                localStorage.removeItem('member_sort_key');
                localStorage.removeItem('member_sort_dir');
            }
        }catch(e){}
    }
    function loadSortPreference(){
        try{
            const key = localStorage.getItem('member_sort_key');
            const dir = localStorage.getItem('member_sort_dir');
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
            { title:'기본', cols:['status','org_name','telco','protocol','manager'] },
            { title:'회선', cols:['line_no','line_name','business','speed','open_date','close_date','dr_line'] },
            { title:'장비', cols:['device_name','network_device','slot','port','child_device','child_port'] },
            { title:'관할', cols:['our_agency','org_agency'] }
        ];
        groups.forEach(g=>{
            const section = document.createElement('div'); section.className='form-section';
            section.innerHTML = `<div class="section-header"><h4>${g.title}</h4></div>`;
            const grid = document.createElement('div'); grid.className='form-grid';
            g.cols.forEach(c=>{ if(!COLUMN_META[c]) return; const wrap=document.createElement('div');
                // Make only description field span full width; period stays in single column next to key
                wrap.className = (c === 'lic_desc') ? 'form-row form-row-wide' : 'form-row';
                const labelText = COLUMN_META[c]?.label||c;
                wrap.innerHTML=`<label>${labelText}</label>${generateFieldInput(c,row[c])}`; grid.appendChild(wrap); });
            section.appendChild(grid); form.appendChild(section);
        });
        applyOrgNameSearchable(form);
    }

    function generateFieldInput(col,value=''){
        if(col==='org_name'){
            const v = String(value??'').trim();
            return `<select name="org_name" class="form-input search-select" data-searchable="true" data-placeholder="기관명 검색" data-allow-clear="true" data-current="${escapeHTML(v)}" required></select>`;
        }
        if(col==='status'){
            const v = String(value??'');
            return `<select name="status" class="form-input search-select fk-select" data-placeholder="상태 선택">
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="운용" ${v==='운용'?'selected':''}>운용</option>
                <option value="해지" ${v==='해지'?'selected':''}>해지</option>
            </select>`;
        }
        if(col==='telco'){
            const v = String(value??'');
            const baseOpts = ['', 'KT', 'SKB', 'LG'];
            const hasV = v && baseOpts.includes(v);
            const opts = hasV ? baseOpts : (v ? [v, ...baseOpts] : baseOpts);
            return `<select name="telco" class="form-input search-select fk-select" data-placeholder="통신사 선택">${opts.map(o=>{
                const label = o===''? '선택' : (o===v && !hasV ? `${o} (기존값)` : o);
                const sel = v===o ? 'selected' : '';
                return `<option value="${o}" ${sel}>${label}</option>`;
            }).join('')}</select>`;
        }
        if(col==='protocol'){
            const v = String(value??'');
            const baseOpts = ['', 'TCP', 'X25'];
            const hasV = v && baseOpts.includes(v);
            const opts = hasV ? baseOpts : (v ? [v, ...baseOpts] : baseOpts);
            return `<select name="protocol" class="form-input search-select fk-select" data-placeholder="프로토콜 선택">${opts.map(o=>{
                const label = o===''? '선택' : (o===v && !hasV ? `${o} (기존값)` : o);
                const sel = v===o ? 'selected' : '';
                return `<option value="${o}" ${sel}>${label}</option>`;
            }).join('')}</select>`;
        }
        if(col==='dr_line'){
            const v = String(value??'');
            return `<select name="dr_line" class="form-input search-select fk-select" data-placeholder="DR회선 선택">
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="O" ${v==='O'?'selected':''}>O</option>
                <option value="X" ${v==='X'?'selected':''}>X</option>
            </select>`;
        }
        if(col==='line_no') return `<input name="${col}" class="form-input" value="${value??''}" placeholder="입력" required>`;
        if(col==='slot') return `<input name="${col}" type="number" min="0" step="1" class="form-input" value="${value??''}" placeholder="숫자만">`;
        if(col==='open_date' || col==='close_date') return `<input name="${col}" class="form-input" value="${value??''}" placeholder="YYYY-MM-DD">`;
        return `<input name="${col}" class="form-input" value="${value??''}" placeholder="입력">`;
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
        const actorId = await ensureActorUserId();
        if(!actorId) throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
        const payload = leasedLineUiToCreatePayload(data, actorId);
        const res = await apiRequestJson(LEASED_LINE_API.lines, { method:'POST', body: JSON.stringify(payload) });
        if(!res?.success) throw new Error(res?.message || '전용회선 등록 실패');
        const row = leasedLineApiToUiRow(res.item);
        state.data.unshift(row);
        applyFilter();
        applyOrgNameSearchable(document.getElementById(ADD_FORM_ID));
        return row;
    }

    async function updateRow(index,data){
        const existing = state.data[index];
        if(!existing || !existing.id) return;
        const actorId = await ensureActorUserId();
        if(!actorId) throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
        const body = leasedLineUiPatchToUpdatePayload(data, actorId);
        const res = await apiRequestJson(`${LEASED_LINE_API.lines}/${existing.id}`, { method:'PUT', body: JSON.stringify(body) });
        if(!res?.success) throw new Error(res?.message || '전용회선 수정 실패');
        state.data[index] = leasedLineApiToUiRow(res.item);
        applyFilter();
        applyOrgNameSearchable(document.getElementById(ADD_FORM_ID));
    }

    async function deleteSelectedOnServer(){
        const actorId = await ensureActorUserId();
        if(!actorId) throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
        const ids = [...state.selected].filter(Boolean);
        if(!ids.length) return { deleted: [] };
        const res = await apiRequestJson(`${LEASED_LINE_API.lines}/bulk-delete`, {
            method:'POST',
            body: JSON.stringify({ ids, actor_user_id: actorId }),
        });
        if(!res?.success) throw new Error(res?.message || '전용회선 삭제 실패');
        const deleted = Array.isArray(res.deleted) ? res.deleted : [];
        const delSet = new Set(deleted);
        state.data = state.data.filter(r=> !delSet.has(r.id));
        state.selected.clear();
        applyFilter();
        applyOrgNameSearchable(document.getElementById(ADD_FORM_ID));
        return { deleted };
    }

    async function bulkUpdateSelectedOnServer(entries){
        const actorId = await ensureActorUserId();
        if(!actorId) throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
        const ids = [...state.selected].filter(Boolean);
        if(!ids.length) return 0;

        const uiPatch = {};
        entries.forEach(({field, value})=>{ uiPatch[field] = value; });
        const body = leasedLineUiPatchToUpdatePayload(uiPatch, actorId);

        // Update sequentially for clearer error handling
        const updatedById = new Map();
        for(const id of ids){
            const res = await apiRequestJson(`${LEASED_LINE_API.lines}/${id}`, { method:'PUT', body: JSON.stringify(body) });
            if(!res?.success) throw new Error(res?.message || '전용회선 일괄 수정 실패');
            updatedById.set(id, leasedLineApiToUiRow(res.item));
        }
        state.data = state.data.map(r=> updatedById.has(r.id) ? updatedById.get(r.id) : r);
        applyFilter();
        return ids.length;
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
    const filename = `member_line_list_${yyyy}${mm}${dd}.csv`;
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
                    // enhance date inputs with Flatpickr
                    initDatePickers(EDIT_FORM_ID);
                    const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                    if(editSaveEl){ editSaveEl.setAttribute('data-index', realIndex); }
                }
                return; // 액션 버튼 클릭 처리 후 종료
            }
            // 기관명 링크 클릭 시에는 행 선택 토글을 방지하고 기본 이동만 수행
            if(e.target.closest('.work-name-link')) return;
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
    document.getElementById(ADD_BTN_ID)?.addEventListener('click', ()=> { applyOrgNameSearchable(document.getElementById(ADD_FORM_ID)); openModal(ADD_MODAL_ID); initDatePickers(ADD_FORM_ID); });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(ADD_FORM_ID); if(!form.checkValidity()){ form.reportValidity(); return; }
            if(!validateOpenClose(ADD_FORM_ID)) return;
            const data = collectForm(form);
            if(!data?.line_no){
                showMessage('회선번호는 필수입니다.', '유효성 오류');
                form.querySelector('[name="line_no"]')?.focus();
                return;
            }
            // no computed fields for dedicated line
            try {
                await addRow(data);
                form.reset();
                closeModal(ADD_MODAL_ID);
                showMessage('등록되었습니다.', '완료');
            } catch(e){
                console.error(e);
                showMessage(e?.message || '등록 중 오류가 발생했습니다.', '오류');
            }
        });
        // edit modal
    document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(EDIT_FORM_ID); if(!form) return;
            if(!form.checkValidity()){ form.reportValidity(); return; }
            const indexEl = document.getElementById(EDIT_SAVE_ID);
            if(!validateOpenClose(EDIT_FORM_ID)) return;
            const index = parseInt(indexEl?.getAttribute('data-index')||'-1',10);
            const data = collectForm(form);
            if(!data?.line_no){
                showMessage('회선번호는 필수입니다.', '유효성 오류');
                form.querySelector('[name="line_no"]')?.focus();
                return;
            }
            // no computed fields for dedicated line
            try {
                await updateRow(index, data);
                closeModal(EDIT_MODAL_ID);
                showMessage('수정되었습니다.', '완료');
            } catch(e){
                console.error(e);
                showMessage(e?.message || '수정 중 오류가 발생했습니다.', '오류');
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
                    const wide = ['기관명','회선명'];
                    const mid = ['회선번호','장비명','통신장비'];
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
                    ['- "라이선스 전체수량", "라이선스 할당수량", "라이선스 유휴수량"은 숫자만 입력하세요.'],
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
                XLSX.writeFile(wb, 'member_line_upload_template.xlsx');
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
                        // Validation rules (member line)
                        if(rec.slot !== '' && !isIntegerLike(rec.slot)) errors.push(`Row ${r+1}: 슬롯은 숫자만 입력하세요.`);
                        // Normalize numbers
                        rec.slot = toIntOrBlank(rec.slot);
                        imported.push(rec);
                    }
                    if(errors.length){
                        const preview = errors.slice(0, 20).join('\n');
                        const more = errors.length>20 ? `\n...외 ${errors.length-20}건` : '';
                        showMessage(`업로드 실패: 유효성 검사 오류가 있습니다.\n\n${preview}${more}`, '업로드 실패');
                        return;
                    }
                    // Import rows (server)
                    let createdCount = 0;
                    for(const item of imported){
                        await addRow(item);
                        createdCount++;
                    }
                    showMessage(`${createdCount}개 행이 업로드되었습니다.`, '업로드 완료');
                    closeModal(UPLOAD_MODAL_ID);
                }catch(e){ console.error(e); showMessage(e?.message || '엑셀 파싱/업로드 중 오류가 발생했습니다. 파일을 확인해주세요.', '업로드 오류'); }
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
            try {
                let createdCount = 0;
                for(const o of originals){
                    const copy = { ...o };
                    delete copy.id;
                    // Ensure unique constraint (line_group + line_no)
                    if(copy.line_no){ copy.line_no = String(copy.line_no) + '_COPY'; }
                    if(copy.line_name){ copy.line_name = String(copy.line_name) + '_COPY'; }
                    await addRow(copy);
                    createdCount++;
                }
                closeModal('system-duplicate-modal');
                showMessage(createdCount + '개 행이 복제되었습니다.', '완료');
            } catch(e){
                console.error(e);
                showMessage(e?.message || '복제 중 오류가 발생했습니다.', '오류');
            }
        });
        // dispose (불용처리)
        document.getElementById(DISPOSE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('불용처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('dispose-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 항목을 정말 불용처리하시겠습니까?`; }
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
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 항목을 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', async ()=>{
            if(state.selected.size === 0){ closeModal(DELETE_MODAL_ID); return; }
            try {
                const { deleted } = await deleteSelectedOnServer();
                closeModal(DELETE_MODAL_ID);
                if(deleted.length){ setTimeout(()=> showMessage(`${deleted.length}개 항목이 삭제되었습니다.`, '완료'), 0); }
            } catch(e){
                console.error(e);
                showMessage(e?.message || '삭제 중 오류가 발생했습니다.', '오류');
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
            try {
                const updatedCount = await bulkUpdateSelectedOnServer(entries);
                closeModal(BULK_MODAL_ID);
                setTimeout(()=> showMessage(`${updatedCount}개 항목에 일괄 변경이 적용되었습니다.`, '완료'), 0);
            } catch(e){
                console.error(e);
                showMessage(e?.message || '일괄 변경 중 오류가 발생했습니다.', '오류');
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
        const EXCLUDE = new Set([]);
        function inputFor(col){
            if(col === 'status'){
                return `<select name="status" class="form-input search-select fk-select" data-placeholder="상태 선택" data-bulk-field="status">
                    <option value="">선택</option>
                    <option value="운용">운용</option>
                    <option value="해지">해지</option>
                </select>`;
            }
            if(col === 'telco'){
                const opts = ['', 'KT', 'SKB', 'LG'];
                return `<select name="telco" class="form-input search-select fk-select" data-placeholder="통신사 선택" data-bulk-field="telco">${opts.map(o=>`<option value="${o}">${o===''?'선택':o}</option>`).join('')}</select>`;
            }
            if(col === 'protocol'){
                const opts = ['', 'TCP', 'X25'];
                return `<select name="protocol" class="form-input search-select fk-select" data-placeholder="프로토콜 선택" data-bulk-field="protocol">${opts.map(o=>`<option value="${o}">${o===''?'선택':o}</option>`).join('')}</select>`;
            }
            if(col === 'dr_line'){
                return `<select name="dr_line" class="form-input search-select fk-select" data-placeholder="DR회선 선택" data-bulk-field="dr_line">
                    <option value="">선택</option>
                    <option value="O">O</option>
                    <option value="X">X</option>
                </select>`;
            }
            if(col === 'slot') return `<input name="slot" type="number" min="0" step="1" class="form-input" data-bulk-field="slot" placeholder="숫자">`;
            if(col === 'open_date' || col === 'close_date') return `<input name="${col}" class="form-input" data-bulk-field="${col}" placeholder="YYYY-MM-DD">`;
            return `<input name="${col}" class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }
        const GROUPS = [
            { title:'기본', cols:['status','org_name','telco','protocol','manager'] },
            { title:'회선', cols:['line_no','line_name','business','speed','open_date','close_date','dr_line'] },
            { title:'장비', cols:['device_name','network_device','slot','port','child_device','child_port'] },
            { title:'관할', cols:['our_agency','org_agency'] }
        ];
        form.innerHTML = GROUPS.map(g=>{
            const fields = g.cols.filter(c=> !EXCLUDE.has(c));
            if(!fields.length) return '';
            const grid = fields.map(col=>{
                const meta = COLUMN_META[col]; if(!meta) return '';
                const wide = (col === 'lic_desc');
                return `<div class="${wide ? 'form-row form-row-wide' : 'form-row'}"><label>${meta.label}</label>${inputFor(col)}</div>`;
            }).join('');
            return `
                <div class="form-section">
                    <div class="section-header"><h4>${g.title}</h4></div>
                    <div class="form-grid">${grid}</div>
                </div>`;
        }).join('');
    // 날짜 입력기 적용
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
        const swEl = document.getElementById('stats-software');
        const verEl = document.getElementById('stats-versions');
        const checkEl = document.getElementById('stats-check');
        if(swEl) swEl.innerHTML = '';
        if(verEl) verEl.innerHTML = '';
        if(checkEl) checkEl.innerHTML = '';
        // 대상 데이터: 현재 필터/정렬 적용 전부를 기준으로 통계 (state.filtered)
        const rows = state.filtered.length ? state.filtered : state.data;
        // 회선 현황/분포
        renderStatBlock('stats-software', '상태', countBy(rows, 'status'), ['운용','해지']);
        renderStatBlock('stats-software', '통신사', countBy(rows, 'telco'));
        renderStatBlock('stats-software', '관리주체', countBy(rows, 'manager'));
        // 프로토콜 분포
        renderStatBlock('stats-versions', '프로토콜', countBy(rows, 'protocol'));
        // DR 회선 여부
        renderStatBlock('stats-check', 'DR회선', countBy(rows, 'dr_line'), ['O','X'], { toggleOX:true });
    }
    }

    // (조건 필터 관련 함수 제거됨)

    async function init(){
        applyDynamicLabelText();
        // Dynamic tabs may render after this script; refresh labels once more.
        setTimeout(applyDynamicLabelText, 250);

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
        await initData();
        applyOrgNameSearchable(document.getElementById(ADD_FORM_ID));
        bindEvents();
        render();
        // Page adornments (animation + popover)
}
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


