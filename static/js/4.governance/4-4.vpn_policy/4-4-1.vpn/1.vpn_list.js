/**
 * VPN 관리 페이지 스크립트
 * - 컬럼 토글 (기본 10개 노출)
 * - 로컬(in-memory) 데이터 렌더링 + 페이징 + 검색
 * - 모달 (등록/수정/컬럼 선택)
 * - CSV 다운로드 (현재 페이지 or 전체)
 * NOTE: 서버 연동 전 단계로 mock 데이터 사용
 */

(function(){
    function resolveVpnDetailUrl(){
        if(window.__GOV_VPN_POLICY_DETAIL_URL) return window.__GOV_VPN_POLICY_DETAIL_URL;
        const scope = String(window.__GOV_VPN_SCOPE || 'VPN1').toUpperCase();
        const map = {
            'VPN1': '/p/gov_vpn_policy_detail',
            'VPN2': '/p/gov_vpn_policy2_detail',
            'VPN3': '/p/gov_vpn_policy3_detail',
            'VPN4': '/p/gov_vpn_policy4_detail',
            'VPN5': '/p/gov_vpn_policy5_detail',
        };
        return map[scope] || '/p/gov_vpn_policy_detail';
    }

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
    // Upload template (VPN policy schema)
    const UPLOAD_HEADERS_KO = [
        '기관명','상태','회선속도','회선수','프로토콜','관리주체','암호화방식','상위국','상위국주소','하위국','하위국 주소','장비명'
    ];
    const HEADER_KO_TO_KEY = {
        '기관명':'org_name','상태':'status','회선속도':'line_speed','회선수':'line_count','프로토콜':'protocol','관리주체':'manager','암호화방식':'cipher','상위국':'upper_country','상위국주소':'upper_country_address','하위국':'lower_country','하위국 주소':'lower_country_address','장비명':'device_name'
    };
    const ENUM_SETS = { };
    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
    function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }

    // Data + State
    const BASE_VISIBLE_COLUMNS = [
        'org_name','status','line_speed','line_count','protocol','manager','cipher','upper_country','lower_country','device_name'
    ];
    const COLUMN_ORDER = [
        'org_name','status','line_speed','line_count','protocol','manager','cipher','upper_country','upper_country_address','lower_country','lower_country_address','device_name'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '기본', columns: ['org_name','status','line_speed','line_count','protocol','manager'] },
        { group: '정책', columns: ['cipher','upper_country','upper_country_address','lower_country','lower_country_address'] },
        { group: '장비', columns: ['device_name'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        org_name:{label:'기관명',group:'기본'},
        status:{label:'상태',group:'기본'},
        line_speed:{label:'회선속도',group:'기본'},
        line_count:{label:'회선수',group:'기본'},
        protocol:{label:'프로토콜',group:'기본'},
        manager:{label:'관리주체',group:'기본'},
        cipher:{label:'암호화방식',group:'정책'},
        upper_country:{label:'상위국',group:'정책'},
        upper_country_address:{label:'상위국주소',group:'정책'},
        lower_country:{label:'하위국',group:'정책'},
        lower_country_address:{label:'하위국 주소',group:'정책'},
        device_name:{label:'장비명',group:'장비'}
    };

    // 통신사 필드는 삭제됨
    const TELCO_LOGOS = {};

    // 회선속도 시각화 (전용회선 페이지와 동일한 로직 차용)
    const SPEED_TIER_MODE = 5; // 3 또는 5단계 지원
    function parseSpeedToMbps(val){
        const s = String(val||'').trim().toLowerCase();
        if(!s) return null;
        // 예: 10g, 1 g, 100m, 500 mbps, 64k, 64 kbps
        const m = s.match(/^(\d+(?:\.\d+)?)\s*(k|kbps|m|mbps|g|gbps)?$/i);
        if(!m) return null;
        const num = parseFloat(m[1]);
        const unit = (m[2]||'m').toLowerCase();
        let mult = 1; // 기본 Mbps
        if(unit==='k' || unit==='kbps') mult = 0.001;
        else if(unit==='m' || unit==='mbps') mult = 1;
        else if(unit==='g' || unit==='gbps') mult = 1000;
        return num * mult;
    }
    function getSpeedTier(mbps){
        if(!isFinite(mbps) || mbps<0) return { tier:0, name:'미정' };
        if(SPEED_TIER_MODE === 3){
            // 3단계: <100, 100-999, >=1000
            if(mbps < 100) return { tier:1, name:'저속(<100Mbps)' };
            if(mbps < 1000) return { tier:2, name:'중속(100Mbps~1Gbps 미만)' };
            return { tier:3, name:'고속(≥1Gbps)' };
        }
        // 5단계: <10, 10-99, 100-999, 1000-4999, >=5000
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

    // --- Governance / VPN Policy (DB-backed API) ---
    const VPN_SCOPE = String(window.__GOV_VPN_SCOPE || 'VPN1').trim() || 'VPN1';
    const VPN_API = {
        sessionMe: '/api/session/me',
        partners: '/api/network/vpn-partners',
        lines: '/api/network/vpn-lines',
        devices: '/api/network/vpn-line-devices',
    };

    let _partnerCacheById = new Map();
    let _partnerCacheByName = new Map();

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
            const me = await apiRequestJson(VPN_API.sessionMe, { method:'GET' });
            const id = _coerceInt(me?.user?.id);
            if(id){ state.currentUserId = id; return id; }
        } catch(_e){
            // list view can still load even when session isn't available
        }
        return null;
    }

    function _buildUiRow(partner, line, device){
        return {
            id: state.nextId++,
            org_name: partner?.org_name || '',
            status: line?.status || '',
            line_speed: line?.line_speed || '',
            line_count: (line?.line_count ?? '') === 0 ? 0 : (line?.line_count ?? ''),
            protocol: line?.protocol || '',
            manager: line?.manager || '',
            cipher: line?.cipher || '',
            upper_country: line?.upper_country || '',
            upper_country_address: line?.upper_country_address || '',
            lower_country: line?.lower_country || '',
            lower_country_address: line?.lower_country_address || '',
            device_name: device?.device_name || '',
            _partner_id: partner?.id ?? null,
            _line_id: line?.id ?? null,
            _device_id: device?.id ?? null,
        };
    }

    async function loadDataFromServer(){
        const scopeQ = `scope=${encodeURIComponent(VPN_SCOPE)}`;
        const [partnersRes, linesRes, devicesRes] = await Promise.all([
            apiRequestJson(VPN_API.partners, { method:'GET' }),
            apiRequestJson(`${VPN_API.lines}?${scopeQ}`, { method:'GET' }),
            apiRequestJson(`${VPN_API.devices}?${scopeQ}`, { method:'GET' }),
        ]);
        if(!partnersRes?.success) throw new Error(partnersRes?.message || 'VPN 기관 목록 조회 실패');
        if(!linesRes?.success) throw new Error(linesRes?.message || 'VPN 회선 목록 조회 실패');
        if(!devicesRes?.success) throw new Error(devicesRes?.message || 'VPN 장비 목록 조회 실패');

        const partners = Array.isArray(partnersRes.items) ? partnersRes.items : [];
        const lines = Array.isArray(linesRes.items) ? linesRes.items : [];
        const devices = Array.isArray(devicesRes.items) ? devicesRes.items : [];

        _partnerCacheById = new Map();
        _partnerCacheByName = new Map();
        partners.forEach(p=>{
            if(p?.id != null) _partnerCacheById.set(p.id, p);
            const nameKey = String(p?.org_name||'').trim();
            if(nameKey) _partnerCacheByName.set(nameKey, p);
        });

        const devicesByLine = new Map();
        devices.forEach(d=>{
            const lineId = d?.vpn_line_id;
            if(!lineId) return;
            if(!devicesByLine.has(lineId)) devicesByLine.set(lineId, []);
            devicesByLine.get(lineId).push(d);
        });

        const rows = [];
        lines.forEach(line=>{
            const partner = _partnerCacheById.get(line?.vpn_partner_id);
            const ds = devicesByLine.get(line?.id) || [];
            if(ds.length){
                ds.forEach(dev=> rows.push(_buildUiRow(partner, line, dev)));
            } else {
                rows.push(_buildUiRow(partner, line, null));
            }
        });
        state.selected.clear();
        state.data = rows;
        applyFilter();
    }

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;

    async function initData(){
        await ensureActorUserId();
        try {
            state.nextId = 1;
            await loadDataFromServer();
        } catch(e){
            console.error(e);
            showMessage(e?.message || 'VPN 정책 데이터를 불러오지 못했습니다.', '오류');
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
            if (!groups.length) {
                base = [...state.data];
            } else {
                base = state.data.filter(row => 
                    groups.every(alts => 
                        searchCols.some(col => {
                            const v = row[col]; 
                            if (v == null) return false;
                            const cell = String(v).toLowerCase();
                            return alts.some(tok => cell.includes(tok));
                        })
                    )
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
                    if(titleEl) titleEl.textContent = 'VPN 정책이 없습니다.';
                    if(descEl) descEl.textContent = "우측 상단 '추가' 버튼을 눌러 첫 정책을 등록하세요.";
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
                    // 기관명: 상세 페이지로 링크 처리 (서버 페이지의 모델명 링크 스타일과 동일하게 적용)
                    if(col === 'org_name'){
                        const detailHref = resolveVpnDetailUrl();
                        const lineId = (row._line_id ?? row.vpn_line_id ?? row.id ?? '');
                        const href = lineId ? `${detailHref}?vpn_line_id=${encodeURIComponent(lineId)}` : detailHref;
                        cellValue = `<a href="${href}" class="work-name-link" data-id="${row.id??''}" title="상세 보기">${cellValue}</a>`;
                    }
                    // 상태 배지 표시
                    if(col === 'status'){
                        const v = String(displayVal);
                        let cls = 'ws-wait';
                        if(v === '운용') cls = 'ws-run';
                        else if(v === '해지') cls = 'ws-wait';
                        cellValue = `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${highlight(displayVal, col)}</span></span>`;
                    }
                    // 회선속도: 등급 점 + 텍스트
                    if(col === 'line_speed'){
                        const mbps = parseSpeedToMbps(rawVal);
                        if(mbps != null){
                            const { tier, name } = getSpeedTier(mbps);
                            const approx = Number.isFinite(mbps) ? (mbps >= 1 ? (mbps.toFixed(mbps>=100?0:1)) : mbps.toFixed(3)) : '';
                            const title = name + (approx? ` • 약 ${approx} Mbps` : '');
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
                    // no DR indicator in VPN policy table
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
        try { localStorage.setItem('vpn_visible_cols', JSON.stringify([...state.visibleCols])); } catch(e){}
    }
    function loadColumnSelection(){
        try {
            // One-time migration to enforce new default visible columns (기본 컬럼)
            const colsVer = localStorage.getItem('vpn_visible_cols_ver');
            if(colsVer !== '2'){
                state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
                try {
                    localStorage.setItem('vpn_visible_cols', JSON.stringify([...state.visibleCols]));
                    localStorage.setItem('vpn_visible_cols_ver', '2');
                } catch(_e){}
                return; // use new defaults on first run after schema update
            }
            const raw = localStorage.getItem('vpn_visible_cols');
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
                try { localStorage.setItem('vpn_visible_cols', JSON.stringify([...state.visibleCols])); } catch(_e){}
            } else {
                // Stored value was empty or invalid — fall back to defaults and persist
                state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
                try { localStorage.setItem('vpn_visible_cols', JSON.stringify([...state.visibleCols])); } catch(_e){}
            }
        } catch(e){}
    }

    // ---- Sort persistence ----
    function saveSortPreference(){
        try{
            if(state.sortKey){
                localStorage.setItem('vpn_sort_key', state.sortKey);
                localStorage.setItem('vpn_sort_dir', state.sortDir==='desc' ? 'desc' : 'asc');
            } else {
                localStorage.removeItem('vpn_sort_key');
                localStorage.removeItem('vpn_sort_dir');
            }
        }catch(e){}
    }
    function loadSortPreference(){
        try{
            const key = localStorage.getItem('vpn_sort_key');
            const dir = localStorage.getItem('vpn_sort_dir');
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
            { title:'기본', cols:['org_name','status','line_speed','line_count','protocol','manager','cipher'] },
            { title:'주체', cols:['upper_country','upper_country_address','lower_country','lower_country_address'] },
            { title:'장비', cols:['device_name'] }
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
    }

    function generateFieldInput(col,value=''){
        if(col==='status'){
            const v = String(value??'');
            return `<select name="status" class="form-input">
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="운용" ${v==='운용'?'selected':''}>운용</option>
                <option value="해지" ${v==='해지'?'selected':''}>해지</option>
            </select>`;
        }
        if(col==='line_count') return `<input name="line_count" type="number" min="0" step="1" class="form-input" value="${value??''}" placeholder="숫자">`;
        if(col==='line_speed') return `<input name="line_speed" class="form-input" value="${value??''}" placeholder="예: 100M, 1G">`;
        if(col==='protocol') return `<select name="protocol" class="form-input">
                ${['','TCP','UDP','TCP/UDP'].map(o=>`<option value="${o}" ${String(value??'')===o?'selected':''}>${o===''?'선택':o}</option>`).join('')}
            </select>`;
        if(col==='cipher') return `<input name="cipher" class="form-input" value="${value??''}" placeholder="예: AES-256">`;
        return `<input name="${col}" class="form-input" value="${value??''}" placeholder="입력">`;
    }

    // Live-sync helpers for license fields in Add/Edit forms
    // virtualization and license helpers removed (not used in VPN policy)

    function addRow(data){
        // 고유 id 부여
        data.id = state.nextId++;
        state.data.unshift(data); // 맨 앞 삽입
        applyFilter();
    }

    function updateRow(index,data){
        if(state.data[index]){ state.data[index] = {...state.data[index], ...data}; applyFilter(); }
    }

    async function findOrCreatePartnerId(orgName){
        const key = String(orgName||'').trim();
        if(!key) throw new Error('기관명은 필수입니다.');
        const cached = _partnerCacheByName.get(key);
        if(cached?.id) return cached.id;
        const actorId = await ensureActorUserId();
        if(!actorId) throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
        const created = await apiRequestJson(VPN_API.partners, {
            method:'POST',
            body: JSON.stringify({ org_name: key, partner_type: 'DEFAULT', created_by_user_id: actorId }),
        });
        if(!created?.success) throw new Error(created?.message || '기관 등록 실패');
        const p = created.item;
        if(p?.id){
            _partnerCacheById.set(p.id, p);
            _partnerCacheByName.set(String(p.org_name||'').trim(), p);
            return p.id;
        }
        throw new Error('기관 등록 결과가 올바르지 않습니다.');
    }

    async function createPolicyFromForm(formData){
        const actorId = await ensureActorUserId();
        if(!actorId) throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');

        const partnerId = await findOrCreatePartnerId(formData.org_name);
        const linePayload = {
            vpn_partner_id: partnerId,
            scope: VPN_SCOPE,
            status: String(formData.status||'').trim() || null,
            line_speed: String(formData.line_speed||'').trim() || null,
            line_count: (formData.line_count===''||formData.line_count==null) ? null : _coerceInt(formData.line_count),
            protocol: String(formData.protocol||'').trim() || null,
            manager: String(formData.manager||'').trim() || null,
            cipher: String(formData.cipher||'').trim() || null,
            upper_country: String(formData.upper_country||'').trim() || null,
            upper_country_address: String(formData.upper_country_address||'').trim() || null,
            lower_country: String(formData.lower_country||'').trim() || null,
            lower_country_address: String(formData.lower_country_address||'').trim() || null,
            created_by_user_id: actorId,
        };
        const lineRes = await apiRequestJson(VPN_API.lines, { method:'POST', body: JSON.stringify(linePayload) });
        if(!lineRes?.success) throw new Error(lineRes?.message || 'VPN 회선 등록 실패');
        const line = lineRes.item;

        let device = null;
        const deviceName = String(formData.device_name||'').trim();
        if(deviceName){
            const devRes = await apiRequestJson(VPN_API.devices, {
                method:'POST',
                body: JSON.stringify({ vpn_line_id: line.id, device_name: deviceName, created_by_user_id: actorId }),
            });
            if(!devRes?.success) throw new Error(devRes?.message || 'VPN 장비 등록 실패');
            device = devRes.item;
        }

        const partner = _partnerCacheById.get(partnerId) || { id: partnerId, org_name: String(formData.org_name||'').trim() };
        return _buildUiRow(partner, line, device);
    }

    async function updatePolicyFromForm(existingRow, patch){
        const actorId = await ensureActorUserId();
        if(!actorId) throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');

        // partner (org_name)
        if(existingRow._partner_id && (patch.org_name != null)){
            const nextName = String(patch.org_name||'').trim();
            if(nextName && nextName !== String(existingRow.org_name||'').trim()){
                const res = await apiRequestJson(`${VPN_API.partners}/${existingRow._partner_id}`, {
                    method:'PUT',
                    body: JSON.stringify({ org_name: nextName, updated_by_user_id: actorId }),
                });
                if(!res?.success) throw new Error(res?.message || '기관명 수정 실패');
                const p = res.item;
                if(p?.id){
                    _partnerCacheById.set(p.id, p);
                    _partnerCacheByName.set(String(p.org_name||'').trim(), p);
                }
                // shared partner name
                state.data = state.data.map(r=> (r._partner_id === existingRow._partner_id) ? ({...r, org_name: nextName}) : r);
            }
        }

        // line fields
        if(existingRow._line_id){
            const lineFields = ['status','line_speed','line_count','protocol','manager','cipher','upper_country','upper_country_address','lower_country','lower_country_address'];
            const body = { updated_by_user_id: actorId };
            let has = false;
            lineFields.forEach(f=>{
                if(!(f in patch)) return;
                has = true;
                if(f === 'line_count') body[f] = (patch[f]===''||patch[f]==null) ? null : _coerceInt(patch[f]);
                else body[f] = String(patch[f]||'').trim() || null;
            });
            if(has){
                const res = await apiRequestJson(`${VPN_API.lines}/${existingRow._line_id}`, { method:'PUT', body: JSON.stringify(body) });
                if(!res?.success) throw new Error(res?.message || 'VPN 회선 수정 실패');
            }
        }

        // device
        const nextDeviceName = ('device_name' in patch) ? String(patch.device_name||'').trim() : null;
        if(nextDeviceName != null){
            if(existingRow._device_id){
                if(!nextDeviceName){
                    const res = await apiRequestJson(`${VPN_API.devices}/${existingRow._device_id}?actor_user_id=${encodeURIComponent(String(actorId))}`, { method:'DELETE' });
                    if(!res?.success) throw new Error(res?.message || 'VPN 장비 삭제 실패');
                    existingRow._device_id = null;
                } else {
                    const res = await apiRequestJson(`${VPN_API.devices}/${existingRow._device_id}`, {
                        method:'PUT',
                        body: JSON.stringify({ device_name: nextDeviceName, updated_by_user_id: actorId }),
                    });
                    if(!res?.success) throw new Error(res?.message || 'VPN 장비 수정 실패');
                }
            } else {
                if(nextDeviceName && existingRow._line_id){
                    const res = await apiRequestJson(VPN_API.devices, {
                        method:'POST',
                        body: JSON.stringify({ vpn_line_id: existingRow._line_id, device_name: nextDeviceName, created_by_user_id: actorId }),
                    });
                    if(!res?.success) throw new Error(res?.message || 'VPN 장비 등록 실패');
                    existingRow._device_id = res.item?.id ?? null;
                }
            }
        }
    }

    async function deleteSelectedOnServer(){
        const actorId = await ensureActorUserId();
        if(!actorId) throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
        const selectedRows = state.data.filter(r=> state.selected.has(r.id));
        const deviceIds = selectedRows.map(r=> r._device_id).filter(Boolean);
        const lineIds = selectedRows.filter(r=> !r._device_id).map(r=> r._line_id).filter(Boolean);

        if(deviceIds.length){
            const res = await apiRequestJson(`${VPN_API.devices}/bulk-delete`, {
                method:'POST',
                body: JSON.stringify({ ids: deviceIds, actor_user_id: actorId }),
            });
            if(!res?.success) throw new Error(res?.message || 'VPN 장비 삭제 실패');
        }
        if(lineIds.length){
            const res = await apiRequestJson(`${VPN_API.lines}/bulk-delete`, {
                method:'POST',
                body: JSON.stringify({ ids: lineIds, actor_user_id: actorId }),
            });
            if(!res?.success) throw new Error(res?.message || 'VPN 회선 삭제 실패');
        }

        const deviceSet = new Set(deviceIds);
        const lineSet = new Set(lineIds);
        state.data = state.data.filter(r=>{
            if(r._device_id && deviceSet.has(r._device_id)) return false;
            if(r._line_id && lineSet.has(r._line_id)) return false;
            return true;
        });
        state.selected.clear();
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
    const filename = `vpn_policy_list_${yyyy}${mm}${dd}.csv`;
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
            // If no data-tab is set, this is a page-navigation tab (href). Do not interfere.
            if(!targetId) return;
            e.preventDefault();
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
            // 기관명 링크 클릭 처리 (컨텍스트 저장 + 파라미터 부여 후 이동)
            const nameLink = e.target.closest('.work-name-link');
            if(nameLink){
                e.preventDefault();
                const rid = parseInt(nameLink.getAttribute('data-id'),10);
                const row = state.data.find(r=> r.id === rid);
                if(row){
                    const payload = {
                        vpn_line_id: (row._line_id ?? row.vpn_line_id ?? row.id ?? null),
                        org_name: row.org_name || '',
                        status: row.status || '',
                        line_speed: row.line_speed || '',
                        line_count: row.line_count || '',
                        protocol: row.protocol || '',
                        manager: row.manager || '',
                        cipher: row.cipher || '',
                        upper_country: row.upper_country || '',
                        upper_country_address: row.upper_country_address || '',
                        lower_country: row.lower_country || '',
                        lower_country_address: row.lower_country_address || '',
                        device_name: row.device_name || ''
                    };
                    try { sessionStorage.setItem('vpn_selected_row', JSON.stringify(payload)); } catch(_e){}
                    const base = resolveVpnDetailUrl();
                    const params = new URLSearchParams();
                    Object.entries(payload).forEach(([k,v])=> {
                        if(v == null) return;
                        params.set(k, v);
                    });
                    window.location.href = `${base}?${params.toString()}`;
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
    document.getElementById(ADD_BTN_ID)?.addEventListener('click', ()=> { openModal(ADD_MODAL_ID); initDatePickers(ADD_FORM_ID); });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(ADD_FORM_ID); if(!form.checkValidity()){ form.reportValidity(); return; }
            if(!validateOpenClose(ADD_FORM_ID)) return;
            const data = collectForm(form);
            try {
                const row = await createPolicyFromForm(data);
                addRow(row);
                form.reset();
                closeModal(ADD_MODAL_ID);
                setTimeout(()=> showMessage('등록되었습니다.', '완료'), 0);
            } catch(e){
                console.error(e);
                showMessage(e?.message || '등록 중 오류가 발생했습니다.', '오류');
            }
        });
        // edit modal
    document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(EDIT_FORM_ID);
            const indexEl = document.getElementById(EDIT_SAVE_ID);
            if(!validateOpenClose(EDIT_FORM_ID)) return;
            const index = parseInt(indexEl?.getAttribute('data-index')||'-1',10);
            const data = collectForm(form);
            const existing = state.data[index];
            if(!existing){ closeModal(EDIT_MODAL_ID); return; }
            try {
                await updatePolicyFromForm(existing, data);
                updateRow(index, { ...data, _device_id: existing._device_id });
                closeModal(EDIT_MODAL_ID);
                setTimeout(()=> showMessage('수정되었습니다.', '완료'), 0);
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
                    const wide = ['기관명','본사 구간','원격지 구간'];
                    const mid = ['장비명','암호화방식'];
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
                    ['- 날짜는 YYYY-MM-DD 형식으로 입력하세요.'],
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
                XLSX.writeFile(wb, 'vpn_policy_upload_template.xlsx');
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
                        // Validation rules (VPN policy updated)
                        if(rec.line_count && !isIntegerLike(rec.line_count)) errors.push(`Row ${r+1}: 회선수는 숫자만 입력하세요.`);
                        imported.push(rec);
                    }
                    if(errors.length){
                        const preview = errors.slice(0, 20).join('\n');
                        const more = errors.length>20 ? `\n...외 ${errors.length-20}건` : '';
                        showMessage(`업로드 실패: 유효성 검사 오류가 있습니다.\n\n${preview}${more}`, '업로드 실패');
                        return;
                    }
                    // Import rows (DB-backed)
                    (async ()=>{
                        try {
                            let ok = 0;
                            for(const item of imported){
                                const row = await createPolicyFromForm(item);
                                addRow(row);
                                ok++;
                            }
                            showMessage(`${ok}개 행이 업로드되었습니다.`, '업로드 완료');
                            closeModal(UPLOAD_MODAL_ID);
                        } catch(e){
                            console.error(e);
                            showMessage(e?.message || '업로드 처리 중 오류가 발생했습니다.', '업로드 오류');
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
            const originals = state.data.filter(r=> state.selected.has(r.id));
            if(!originals.length){ showMessage('선택된 행을 찾을 수 없습니다.', '오류'); closeModal('system-duplicate-modal'); return; }
            try {
                const actorId = await ensureActorUserId();
                if(!actorId) throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
                let createdCount = 0;
                for(const o of originals){
                    if(!o._partner_id) continue;
                    const lineRes = await apiRequestJson(VPN_API.lines, {
                        method:'POST',
                        body: JSON.stringify({
                            vpn_partner_id: o._partner_id,
                            status: o.status || null,
                            line_speed: o.line_speed || null,
                            line_count: (o.line_count===''||o.line_count==null) ? null : _coerceInt(o.line_count),
                            protocol: o.protocol || null,
                            manager: o.manager || null,
                            cipher: o.cipher || null,
                            upper_country: o.upper_country || null,
                            upper_country_address: o.upper_country_address || null,
                            lower_country: o.lower_country || null,
                            lower_country_address: o.lower_country_address || null,
                            created_by_user_id: actorId,
                        }),
                    });
                    if(!lineRes?.success) throw new Error(lineRes?.message || '복제(회선) 실패');
                    const line = lineRes.item;

                    let device = null;
                    const baseDev = String(o.device_name||'').trim();
                    if(baseDev){
                        const devRes = await apiRequestJson(VPN_API.devices, {
                            method:'POST',
                            body: JSON.stringify({ vpn_line_id: line.id, device_name: baseDev + '_COPY', created_by_user_id: actorId }),
                        });
                        if(!devRes?.success) throw new Error(devRes?.message || '복제(장비) 실패');
                        device = devRes.item;
                    }
                    const partner = _partnerCacheById.get(o._partner_id) || { id: o._partner_id, org_name: o.org_name };
                    addRow(_buildUiRow(partner, line, device));
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
            // 수집 대상 열 (VPN 정책 스냅샷)
            const fields = ['org_name','status','line_speed','line_count','protocol','manager','cipher','upper_country','upper_country_address','lower_country','lower_country_address','device_name'];
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
            const count = state.selected.size;
            if(count === 0){ closeModal(DELETE_MODAL_ID); return; }
            try {
                await deleteSelectedOnServer();
                closeModal(DELETE_MODAL_ID);
                setTimeout(()=> showMessage(`${count}개 항목이 삭제되었습니다.`, '완료'), 0);
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
            // No date fields in this schema; skip date validation
            const ids = new Set(state.selected);
            try {
                const selectedRows = state.data.filter(r=> ids.has(r.id));
                for(const row of selectedRows){
                    const patch = {};
                    entries.forEach(({field, value})=>{ patch[field] = value; });
                    await updatePolicyFromForm(row, patch);
                    Object.assign(row, patch);
                }
                applyFilter();
                closeModal(BULK_MODAL_ID);
                setTimeout(()=> showMessage(`${ids.size}개 항목에 일괄 변경이 적용되었습니다.`, '완료'), 0);
            } catch(e){
                console.error(e);
                showMessage(e?.message || '일괄변경 중 오류가 발생했습니다.', '오류');
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
                return `<select name="status" class="form-input" data-bulk-field="status">
                    <option value="">선택</option>
                    <option value="운용">운용</option>
                    <option value="해지">해지</option>
                </select>`;
            }
            if(col === 'protocol'){
                const opts = ['', 'TCP', 'UDP', 'TCP/UDP'];
                return `<select name="protocol" class="form-input" data-bulk-field="protocol">${opts.map(o=>`<option value="${o}">${o===''?'선택':o}</option>`).join('')}</select>`;
            }
            if(col === 'line_count') return `<input name="line_count" type="number" min="0" step="1" class="form-input" data-bulk-field="line_count" placeholder="숫자">`;
            if(col === 'cipher') return `<input name="cipher" class="form-input" data-bulk-field="cipher" placeholder="예: AES-256">`;
            return `<input name="${col}" class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }
        const GROUPS = [
            { title:'기본', cols:['org_name','status','line_speed','line_count','protocol','manager','cipher'] },
            { title:'주체', cols:['upper_country','upper_country_address','lower_country','lower_country_address'] },
            { title:'장비', cols:['device_name'] }
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
    // 날짜 입력 없음
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
    // 현황/분포 (새 스키마)
    renderStatBlock('stats-software', '상태', countBy(rows, 'status'), ['운용','해지']);
    renderStatBlock('stats-software', '회선속도', countBy(rows, 'line_speed'));
    renderStatBlock('stats-software', '프로토콜', countBy(rows, 'protocol'));
    renderStatBlock('stats-software', '관리주체', countBy(rows, 'manager'));
    // 구간 분포
    renderStatBlock('stats-versions', '상위국', countBy(rows, 'upper_country'));
    renderStatBlock('stats-versions', '하위국', countBy(rows, 'lower_country'));
    // 암호화 방식 분포
    renderStatBlock('stats-check', '암호화방식', countBy(rows, 'cipher'));
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
        document.addEventListener('DOMContentLoaded', ()=>{ init().catch((e)=>{ console.error(e); }); });
    } else {
        init().catch((e)=>{ console.error(e); });
    }
})();


