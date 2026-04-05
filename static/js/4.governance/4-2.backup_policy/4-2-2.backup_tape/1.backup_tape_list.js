/**
 * 백업 테이프 페이지 스크립트
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
    const startEl = form.querySelector('[name="backup_created_date"]');
    const endEl = form.querySelector('[name="backup_expired_date"]');

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
                showMessage('백업 생성일자는 백업 만료일자보다 늦을 수 없습니다.', '유효성 오류');
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
        const s = form.querySelector('[name="backup_created_date"]')?.value?.trim();
    const e = form.querySelector('[name="backup_expired_date"]')?.value?.trim();
        if(!s || !e) return true; // only enforce when both present
        const mS = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const mE = e.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if(!mS || !mE) return true; // let other validators handle format
        const sd = new Date(+mS[1], +mS[2]-1, +mS[3]);
        const ed = new Date(+mE[1], +mE[2]-1, +mE[3]);
        if(sd.getTime() > ed.getTime()){
            showMessage('백업 생성일자는 백업 만료일자보다 늦을 수 없습니다.', '유효성 오류');
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

    // Delete (삭제처리)
    const DELETE_BTN_ID = 'system-delete-btn';
    const DELETE_MODAL_ID = 'system-delete-modal';
    const DELETE_CLOSE_ID = 'system-delete-close';
    const DELETE_CONFIRM_ID = 'system-delete-confirm';

    // Settings (기준 설정: 백업 라이브러리/위치)
    const SETTINGS_BTN_ID = 'system-settings-btn';
    const SETTINGS_MODAL_ID = 'system-settings-modal';
    const SETTINGS_CLOSE_ID = 'system-settings-close';
    const SETTINGS_APPLY_ID = 'system-settings-apply';

    // Expose a global fallback opener (can be called programmatically)
    window.__openBackupTapeSettingsModal = async function __openBackupTapeSettingsModal(){
        openModal(SETTINGS_MODAL_ID);
        try{
            await reloadSettingsData();
        }catch(err){
            showMessage(err?.message || '기준 설정 정보를 불러오지 못했습니다.', '오류');
        }
    };

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
    // Upload template (Backup tape schema)
    const UPLOAD_HEADERS_KO = [
        '백업 ID',
        '백업 정책 이름',
        '보관 구분',
        '백업 용량(K)',
        '백업 용량(T)',
        '백업 라이브러리',
        '백업 생성일자',
        '백업 생성년도',
        '백업 만료일자',
        '백업 상태',
        '백업 위치',
        '비고'
    ];
    const HEADER_KO_TO_KEY = {
        '백업 ID':'backup_id',
        '백업 정책 이름':'backup_policy_name',
        '보관 구분':'retention_type',
        '백업 용량(K)':'backup_size_k',
        '백업 용량(T)':'backup_size_t',
        '백업 라이브러리':'library_name',
        '백업 생성일자':'backup_created_date',
        '백업 생성년도':'backup_created_year',
        '백업 만료일자':'backup_expired_date',
        '백업 상태':'backup_status',
        '백업 위치':'location_name',
        '비고':'remark'
    };
    const ENUM_SETS = { };
    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function stripNumberSeparators(val){ return String(val ?? '').replace(/[\s,]/g, '').trim(); }
    function isIntegerLike(val){
        if(val==null) return false;
        const s = stripNumberSeparators(val);
        if(s==='') return false;
        return /^-?\d+$/.test(s);
    }
    function toIntOrBlank(val){
        const s = stripNumberSeparators(val);
        if(s==='') return '';
        return parseInt(s,10);
    }
    function formatIntWithCommas(val){
        const s = stripNumberSeparators(val);
        if(s==='') return '';
        // String-based formatting to avoid JS Number overflow.
        const sign = s.startsWith('-') ? '-' : '';
        const digits = sign ? s.slice(1) : s;
        if(!/^\d+$/.test(digits)) return '';
        const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return sign + grouped;
    }
    function formatTruncTBFromK(kVal){
        const s = stripNumberSeparators(kVal);
        if(s==='') return '';
        const k = Number(s);
        if(!Number.isFinite(k)) return '';
        const t = k / (1024*1024*1024);
        if(!Number.isFinite(t)) return '';
        return Math.trunc(t).toLocaleString('ko-KR');
    }
    function formatIntInputWithCommas(el){
        if(!el) return;
        const oldVal = String(el.value ?? '');
        const sel = (typeof el.selectionStart === 'number') ? el.selectionStart : oldVal.length;
        const digitsBefore = (oldVal.slice(0, sel).match(/\d/g) || []).length;

        const digitsOnly = oldVal.replace(/\D/g, '');
        if(!digitsOnly){
            el.value = '';
            return;
        }
        const formatted = digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        el.value = formatted;

        let pos = 0;
        let seen = 0;
        while(pos < formatted.length && seen < digitsBefore){
            if(/\d/.test(formatted[pos])) seen++;
            pos++;
        }
        try{ el.setSelectionRange(pos, pos); }catch(_e){}
    }

    // Data + State
    // FIXED_VISIBLE_COLUMNS: 컬럼 선택 모달에서 숨길 수 없게 항상 표시해야 하는 컬럼
    // (현재 테이프 페이지는 고정 컬럼 없음)
    const FIXED_VISIBLE_COLUMNS = [];
    const BASE_VISIBLE_COLUMNS = [
        'backup_id','backup_policy_name','retention_type','backup_size_k','backup_size_t','library_name','backup_created_date','backup_created_year','backup_expired_date','backup_status','location_name','remark'
    ];
    const COLUMN_ORDER = [
        'backup_id','backup_policy_name','retention_type','backup_size_k','backup_size_t','library_name','backup_created_date','backup_created_year','backup_expired_date','backup_status','location_name','remark'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '기본', columns: ['backup_id','backup_policy_name','retention_type','backup_size_k','backup_size_t','library_name','backup_created_date','backup_created_year','backup_expired_date','backup_status','location_name','remark'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        backup_id:{label:'백업 ID',group:'기본'},
        backup_policy_name:{label:'백업 정책 이름',group:'기본'},
        retention_type:{label:'보관 구분',group:'기본'},
        backup_size_k:{label:'백업 용량(K)',group:'기본'},
        backup_size_t:{label:'백업 용량(T)',group:'기본'},
        library_name:{label:'백업 라이브러리',group:'기본'},
        backup_created_date:{label:'백업 생성일자',group:'기본'},
        backup_created_year:{label:'백업 생성년도',group:'기본'},
        backup_expired_date:{label:'백업 만료일자',group:'기본'},
        backup_status:{label:'백업 상태',group:'기본'},
        location_name:{label:'백업 위치',group:'기본'},
        remark:{label:'비고',group:'기본'}
    };

    // Tape page: no telco logos

    // Tape page: no speed tiers

    let state = {
        data: [],
        filtered: [],
        pageSize: 10,
        page: 1,
        visibleCols: new Set(BASE_VISIBLE_COLUMNS),
        search: '',
        // 선택된 행 (row id 기반) 저장하여 리렌더 후에도 유지
        selected: new Set(),
        sortKey: null,
        sortDir: 'asc',
        columnFilters: {},
        libraries: [],
        locations: [],
        devices: [],
        settingsLibSelected: new Set(),
        settingsLocSelected: new Set(),
        settingsScope: 'lib',
        settingsLibDraft: null,
        settingsLocDraft: null,
        settingsLibEditingId: null,
        settingsLocEditingId: null,
        settingsLibEditDraft: null,
        settingsLocEditDraft: null,
        settingsLibPendingDeleteIds: null,
        settingsLocPendingDeleteIds: null
    };

    // ---- Shared persistence for dashboard sync (tapes) ----
    const TAPE_STORAGE_KEY = 'backup_tapes_v1';
    function sanitizeTapesForPersist(rows){
        // Persist only fields the dashboard uses
        // Dashboard currently expects: {status, backup_library, backup_size, expire_date}
        return rows.map(r=>{
            const k = Number(r.backup_size_k);
            const t = Number.isFinite(k) ? (k / (1024*1024*1024)) : (Number(r.backup_size_t) || 0);
            const tText = Number.isFinite(t) ? `${t.toFixed(3)}TB` : '';
            return {
                id: r.id,
                status: r.backup_status || '',
                backup_library: r.library_name || '',
                backup_size: tText,
                expire_date: r.backup_expired_date || ''
            };
        });
    }
    function persistTapes(){
        try{
            const payload = { ts: Date.now(), items: sanitizeTapesForPersist(state.data) };
            localStorage.setItem(TAPE_STORAGE_KEY, JSON.stringify(payload));
        }catch(_e){}
    }
    function loadPersistedTapes(){
        try{
            const raw = localStorage.getItem(TAPE_STORAGE_KEY);
            if(!raw) return null;
            const obj = JSON.parse(raw);
            if(!obj || !Array.isArray(obj.items)) return null;
            return obj;
        }catch(_e){ return null; }
    }

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;

    const API_BASE = '/api/governance/backup';
    const API_TAPES = `${API_BASE}/tapes`;
    const API_LIBS = `${API_BASE}/libraries`;
    const API_LOCS = `${API_BASE}/locations`;
    const API_DEVICES = '/api/hardware/storage/backup/assets';

    async function apiJson(url, options){
        const res = await fetch(url, {
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            ...options,
        });
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch(_e){ data = null; }
        if(!res.ok){
            const msg = data?.message || data?.error || `HTTP ${res.status}`;
            throw new Error(msg);
        }
        return data;
    }

    function normalizeTapeRow(item){
        const row = item || {};
        const kNum = row.backup_size_k == null || row.backup_size_k === '' ? null : Number(row.backup_size_k);
        const derivedT = (kNum == null || !Number.isFinite(kNum)) ? null : (kNum / (1024*1024*1024));
        return {
            id: row.id,
            backup_id: row.backup_id || '',
            backup_policy_name: row.backup_policy_name || '',
            retention_type: row.retention_type || '',
            backup_size_k: row.backup_size_k ?? '',
            backup_size_t: derivedT != null ? Number(derivedT.toFixed(6)) : (row.backup_size_t ?? ''),
            library_id: row.library_id ?? '',
            library_name: row.library_name || '',
            backup_created_date: row.backup_created_date || '',
            backup_created_year: row.backup_created_year ?? '',
            backup_expired_date: row.backup_expired_date || '',
            backup_status: row.backup_status || '',
            location_id: row.location_id ?? '',
            location_name: row.location_name || '',
            remark: row.remark || ''
        };
    }

    function fillSelectOptions(selectEl, items, valueKey, labelKey, selected){
        if(!selectEl) return;
        const selectedStr = selected == null ? '' : String(selected);
        const opts = ['<option value="">선택</option>'];
        (items || []).forEach(it=>{
            const v = it?.[valueKey];
            const l = it?.[labelKey];
            if(v == null) return;
            const vStr = String(v);
            const sel = (selectedStr && vStr === selectedStr) ? 'selected' : '';
            opts.push(`<option value="${escapeHTML(vStr)}" ${sel}>${escapeHTML(l ?? vStr)}</option>`);
        });
        selectEl.innerHTML = opts.join('');
    }

    function hydrateAddFormSelects(){
        const addForm = document.getElementById(ADD_FORM_ID);
        if(!addForm) return;
        fillSelectOptions(addForm.querySelector('select[name="library_id"]'), state.libraries, 'id', 'library_name', addForm.querySelector('select[name="library_id"]')?.value);
        fillSelectOptions(addForm.querySelector('select[name="location_id"]'), state.locations, 'id', 'location_name', addForm.querySelector('select[name="location_id"]')?.value);

        // Ensure searchable dropdown UI is applied/updated inside the add modal.
        try{ window.BlossomSearchableSelect?.syncAll?.(addForm); }catch(_e){}
    }

    function collectFormValues(form){
        const data = {};
        if(!form) return data;
        form.querySelectorAll('input,select,textarea').forEach(el=>{
            const name = el.name;
            if(!name) return;
            data[name] = (el.value ?? '').toString().trim();
        });
        return data;
    }

    function fillDeviceSelect(selectEl, selectedId){
        if(!selectEl) return;
        const current = String(selectedId || '');
        const opts = ['<option value="">선택</option>'];
        (state.devices || []).forEach(d=>{
            const id = d?.id;
            if(id == null) return;
            const idStr = String(id);
            const name = d.asset_name || d.name || idStr;
            const sel = current && current === idStr ? 'selected' : '';
            opts.push(`<option value="${escapeHTML(idStr)}" ${sel}>${escapeHTML(String(name))}</option>`);
        });
        selectEl.innerHTML = opts.join('');
        // If enhanced by the shared searchable-select UI, a change event syncs the display label.
        try{ selectEl.dispatchEvent(new Event('change', { bubbles: true })); }catch(_e){}
    }

    function resolveDeviceLabel(deviceId, explicitName){
        const name = (explicitName ?? '').toString().trim();
        if(name) return name;

        const idStr = (deviceId ?? '').toString().trim();
        if(!idStr) return '-';

        const found = (state.devices || []).find(d => String(d?.id) === idStr);
        const label = (found?.asset_name || found?.name || '').toString().trim();
        return label || idStr;
    }

    function setSettingsScope(scope){
        // NOTE: Settings modal now shows both tables (libraries + locations)
        // so we only keep scope in state for backward compatibility.
        const s = (scope === 'loc') ? 'loc' : 'lib';
        state.settingsScope = s;
    }

    function stripLeadingBullet(text){
        // Defensive: remove any leading bullet-like glyphs that may exist in stored values
        // or get injected by copy/paste. We remove even when there's no whitespace after.
        const s = (text ?? '').toString();
        return s
            .replace(/^\s*[\u00b7\u2022\u22c5\u2219\u30fb\u00b7\u2027\u2219\uFF0E\u002E]+\s*/u, '')
            .trimStart();
    }

    function renderSettingsLibraries(){
        const tbody = document.getElementById('lib-table-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        const editingId = state.settingsLibEditingId;

        if(state.settingsLibDraft){
            const draft = state.settingsLibDraft;
            const tr = document.createElement('tr');
            tr.className = 'settings-draft-row';
            tr.innerHTML = `
                <td class="text-center"><input type="checkbox" disabled></td>
                <td><input type="text" class="settings-inline-input" data-field="library_name" placeholder="입력" value="${escapeHTML(draft.library_name || '')}"></td>
                <td><select class="settings-inline-input settings-inline-select settings-lib-device search-select" data-searchable="true" data-placeholder="선택" data-field="backup_device_asset_id"></select></td>
                <td><input type="text" class="settings-inline-input" data-field="remark" placeholder="메모" value="${escapeHTML(draft.remark || '')}"></td>
                <td class="system-actions">
                    <button type="button" class="action-btn" data-action="lib-save-new" title="저장" aria-label="저장">
                        <img src="/static/image/svg/save.svg" alt="저장" class="action-icon">
                    </button>
                    <button type="button" class="action-btn" data-action="lib-cancel-new" title="삭제" aria-label="삭제">
                        <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
            fillDeviceSelect(tr.querySelector('select.settings-lib-device'), draft.backup_device_asset_id);
        }

        (state.libraries || []).forEach(row=>{
            const tr = document.createElement('tr');
            tr.dataset.id = String(row.id);
            const checked = state.settingsLibSelected.has(row.id) ? 'checked' : '';
            const isEditing = (editingId != null) && (String(editingId) === String(row.id));
            const draft = isEditing ? (state.settingsLibEditDraft || {}) : null;
            const nameVal = stripLeadingBullet(isEditing ? (draft.library_name ?? row.library_name ?? '') : (row.library_name || '-'));
            const devIdVal = isEditing ? (draft.backup_device_asset_id ?? row.backup_device_asset_id ?? '') : (row.backup_device_asset_id ?? '');
            const devNameVal = resolveDeviceLabel(row.backup_device_asset_id, row.backup_device_asset_name);
            const remarkVal = isEditing ? (draft.remark ?? row.remark ?? '') : (row.remark || '-');
            tr.innerHTML = `
                <td><input type="checkbox" class="lib-row-select" data-id="${escapeHTML(String(row.id))}" ${checked}></td>
                <td>${isEditing ? `<input type="text" class="settings-inline-input" data-edit="lib" data-field="library_name" value="${escapeHTML(String(nameVal))}">` : escapeHTML(String(nameVal))}</td>
                <td>${isEditing ? `<select class="settings-inline-input settings-inline-select settings-lib-device search-select" data-searchable="true" data-placeholder="선택" data-edit="lib" data-field="backup_device_asset_id"></select>` : escapeHTML(String(devNameVal))}</td>
                <td>${isEditing ? `<input type="text" class="settings-inline-input" data-edit="lib" data-field="remark" value="${escapeHTML(String(remarkVal))}">` : escapeHTML(String(remarkVal))}</td>
                <td class="system-actions">
                    <button type="button" class="action-btn" data-action="${isEditing ? 'lib-save' : 'lib-edit'}" data-id="${escapeHTML(String(row.id))}" title="${isEditing ? '저장' : '수정'}" aria-label="${isEditing ? '저장' : '수정'}">
                        <img src="${isEditing ? '/static/image/svg/save.svg' : '/static/image/svg/list/free-icon-pencil.svg'}" alt="${isEditing ? '저장' : '수정'}" class="action-icon">
                    </button>
                    <button type="button" class="action-btn" data-action="lib-delete" data-id="${escapeHTML(String(row.id))}" title="삭제" aria-label="삭제">
                        <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">
                    </button>
                </td>
            `;
            if(state.settingsLibSelected.has(row.id)) tr.classList.add('selected');
            tbody.appendChild(tr);

            if(isEditing){
                fillDeviceSelect(tr.querySelector('select.settings-lib-device'), devIdVal);
            }
        });

        const selectAll = document.getElementById('lib-select-all');
        if(selectAll){
            const boxes = tbody.querySelectorAll('.lib-row-select');
            selectAll.checked = boxes.length>0 && [...boxes].every(cb=>cb.checked);
        }
    }

    function renderSettingsLocations(){
        const tbody = document.getElementById('loc-table-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        const editingId = state.settingsLocEditingId;

        if(state.settingsLocDraft){
            const draft = state.settingsLocDraft;
            const tr = document.createElement('tr');
            tr.className = 'settings-draft-row';
            tr.innerHTML = `
                <td class="text-center"><input type="checkbox" disabled></td>
                <td><input type="text" class="settings-inline-input" data-field="location_name" placeholder="입력" value="${escapeHTML(draft.location_name || '')}"></td>
                <td><input type="text" class="settings-inline-input" data-field="location_detail" placeholder="입력" value="${escapeHTML(draft.location_detail || '')}"></td>
                <td><input type="text" class="settings-inline-input" data-field="remark" placeholder="메모" value="${escapeHTML(draft.remark || '')}"></td>
                <td class="system-actions">
                    <button type="button" class="action-btn" data-action="loc-save-new" title="저장" aria-label="저장">
                        <img src="/static/image/svg/save.svg" alt="저장" class="action-icon">
                    </button>
                    <button type="button" class="action-btn" data-action="loc-cancel-new" title="삭제" aria-label="삭제">
                        <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        }

        (state.locations || []).forEach(row=>{
            const tr = document.createElement('tr');
            tr.dataset.id = String(row.id);
            const checked = state.settingsLocSelected.has(row.id) ? 'checked' : '';
            const isEditing = (editingId != null) && (String(editingId) === String(row.id));
            const draft = isEditing ? (state.settingsLocEditDraft || {}) : null;
            const nameVal = stripLeadingBullet(isEditing ? (draft.location_name ?? row.location_name ?? '') : (row.location_name || '-'));
            const detailVal = isEditing ? (draft.location_detail ?? row.location_detail ?? '') : (row.location_detail || '-');
            const remarkVal = isEditing ? (draft.remark ?? row.remark ?? '') : (row.remark || '-');
            tr.innerHTML = `
                <td><input type="checkbox" class="loc-row-select" data-id="${escapeHTML(String(row.id))}" ${checked}></td>
                <td>${isEditing ? `<input type="text" class="settings-inline-input" data-edit="loc" data-field="location_name" value="${escapeHTML(String(nameVal))}">` : escapeHTML(String(nameVal))}</td>
                <td>${isEditing ? `<input type="text" class="settings-inline-input" data-edit="loc" data-field="location_detail" value="${escapeHTML(String(detailVal))}">` : escapeHTML(String(detailVal))}</td>
                <td>${isEditing ? `<input type="text" class="settings-inline-input" data-edit="loc" data-field="remark" value="${escapeHTML(String(remarkVal))}">` : escapeHTML(String(remarkVal))}</td>
                <td class="system-actions">
                    <button type="button" class="action-btn" data-action="${isEditing ? 'loc-save' : 'loc-edit'}" data-id="${escapeHTML(String(row.id))}" title="${isEditing ? '저장' : '수정'}" aria-label="${isEditing ? '저장' : '수정'}">
                        <img src="${isEditing ? '/static/image/svg/save.svg' : '/static/image/svg/list/free-icon-pencil.svg'}" alt="${isEditing ? '저장' : '수정'}" class="action-icon">
                    </button>
                    <button type="button" class="action-btn" data-action="loc-delete" data-id="${escapeHTML(String(row.id))}" title="삭제" aria-label="삭제">
                        <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">
                    </button>
                </td>
            `;
            if(state.settingsLocSelected.has(row.id)) tr.classList.add('selected');
            tbody.appendChild(tr);
        });

        const selectAll = document.getElementById('loc-select-all');
        if(selectAll){
            const boxes = tbody.querySelectorAll('.loc-row-select');
            selectAll.checked = boxes.length>0 && [...boxes].every(cb=>cb.checked);
        }
    }

    function buildLibEditForm(row){
        const form = document.getElementById('lib-edit-form');
        if(!form) return;
        form.innerHTML = `
            <div class="form-section">
                <div class="section-header"><h4>기본</h4></div>
                <div class="form-grid">
                    <div class="form-row"><label>백업 라이브러리<span class="required">*</span></label><input name="library_name" class="form-input" value="${escapeHTML(row.library_name || '')}" required></div>
                    <div class="form-row"><label>백업장치<span class="required">*</span></label>
                        <select name="backup_device_asset_id" class="form-input search-select" data-searchable="true" data-placeholder="선택" required></select>
                    </div>
                    <div class="form-row form-row-wide"><label>비고</label><input name="remark" class="form-input" value="${escapeHTML(row.remark || '')}"></div>
                </div>
            </div>
        `;
        fillDeviceSelect(form.querySelector('select[name="backup_device_asset_id"]'), row.backup_device_asset_id);

        // Apply searchable dropdown UI for the device select.
        try{ window.BlossomSearchableSelect?.syncAll?.(form); }catch(_e){}
    }

    function buildLocEditForm(row){
        const form = document.getElementById('loc-edit-form');
        if(!form) return;
        form.innerHTML = `
            <div class="form-section">
                <div class="section-header"><h4>기본</h4></div>
                <div class="form-grid">
                    <div class="form-row"><label>백업 위치<span class="required">*</span></label><input name="location_name" class="form-input" value="${escapeHTML(row.location_name || '')}" required></div>
                    <div class="form-row"><label>상세 위치</label><input name="location_detail" class="form-input" value="${escapeHTML(row.location_detail || '')}"></div>
                    <div class="form-row form-row-wide"><label>비고</label><input name="remark" class="form-input" value="${escapeHTML(row.remark || '')}"></div>
                </div>
            </div>
        `;
    }

    async function reloadSettingsData(){
        // Load devices (for library device select)
        try{
            const devRes = await apiJson(API_DEVICES, { method:'GET' });
            state.devices = Array.isArray(devRes?.items) ? devRes.items : (Array.isArray(devRes?.assets) ? devRes.assets : []);
        }catch(_e){
            state.devices = [];
        }

        // Load libraries/locations
        const [libsRes, locsRes] = await Promise.all([
            apiJson(API_LIBS, { method:'GET' }),
            apiJson(API_LOCS, { method:'GET' }),
        ]);
        state.libraries = Array.isArray(libsRes?.items) ? libsRes.items : [];
        state.locations = Array.isArray(locsRes?.items) ? locsRes.items : [];
        state.settingsLibSelected.clear();
        state.settingsLocSelected.clear();

        // keep drafts (inline add) untouched

        renderSettingsLibraries();
        renderSettingsLocations();

        // keep tape add form selects fresh
        hydrateAddFormSelects();

        // seed device select for add form (if present)
        fillDeviceSelect(document.querySelector('#lib-add-form select[name="backup_device_asset_id"]'));
    }

    function computeTapeDerivedFields(form){
        if(!form) return;
        const kEl = form.querySelector('[name="backup_size_k"]');
        const tEl = form.querySelector('[name="backup_size_t"]');
        const dateEl = form.querySelector('[name="backup_created_date"]');
        const yearEl = form.querySelector('[name="backup_created_year"]');

        if(kEl){
            // Keep commas visible while typing
            formatIntInputWithCommas(kEl);
        }

        const kRaw = stripNumberSeparators((kEl?.value ?? '').toString());
        const k = kRaw === '' ? null : Number(kRaw);
        if(tEl){
            if(k == null || !Number.isFinite(k)) tEl.value = '';
            else {
                // Truncate decimals below the dot
                const t = k / (1024*1024*1024);
                tEl.value = Number.isFinite(t) ? Math.trunc(t).toLocaleString('ko-KR') : '';
            }
        }
        if(yearEl){
            const s = (dateEl?.value ?? '').toString().trim();
            const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            yearEl.value = m ? m[1] : '';
        }
    }

    function attachDerivedSync(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        if(form.dataset.tapeDerivedAttached === '1'){
            computeTapeDerivedFields(form);
            return;
        }
        const kEl = form.querySelector('[name="backup_size_k"]');
        if(kEl){
            kEl.addEventListener('input', ()=> computeTapeDerivedFields(form));
            kEl.addEventListener('change', ()=> computeTapeDerivedFields(form));
            kEl.addEventListener('blur', ()=>{ formatIntInputWithCommas(kEl); computeTapeDerivedFields(form); });
        }
        form.querySelector('[name="backup_created_date"]')?.addEventListener('input', ()=> computeTapeDerivedFields(form));
        form.querySelector('[name="backup_created_date"]')?.addEventListener('change', ()=> computeTapeDerivedFields(form));
        form.dataset.tapeDerivedAttached = '1';
        computeTapeDerivedFields(form);
    }

    async function initData(){
        try{
            const [libsRes, locsRes, tapesRes] = await Promise.all([
                apiJson(API_LIBS, { method: 'GET' }),
                apiJson(API_LOCS, { method: 'GET' }),
                apiJson(API_TAPES, { method: 'GET' }),
            ]);
            state.libraries = Array.isArray(libsRes?.items) ? libsRes.items : [];
            state.locations = Array.isArray(locsRes?.items) ? locsRes.items : [];
            const items = Array.isArray(tapesRes?.items) ? tapesRes.items : [];
            state.data = items.map(normalizeTapeRow);
            applyFilter();
            persistTapes();
            hydrateAddFormSelects();
            attachDerivedSync(ADD_FORM_ID);
        }catch(err){
            state.libraries = [];
            state.locations = [];
            state.data = [];
            applyFilter();
            showMessage(err.message || '백업 테이프 목록을 불러오지 못했습니다.', '오류');
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
                        if(titleEl) titleEl.textContent = '백업 테이프 내역이 없습니다.';
                        if(descEl) descEl.textContent = "우측 상단 '추가' 버튼을 눌러 첫 데이터를 등록하세요.";
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

                    if(col === 'backup_size_k'){
                        const formatted = formatIntWithCommas(displayVal);
                        if(formatted) displayVal = formatted;
                    }
                    if(col === 'backup_size_t'){
                        const derived = formatTruncTBFromK(row?.backup_size_k);
                        if(derived) displayVal = derived;
                        else {
                            const formatted = formatIntWithCommas(displayVal);
                            if(formatted) displayVal = formatted;
                        }
                    }
                    let cellValue = highlight(displayVal, col);
                    // 상태 배지 표시 (Active/Full/Suspended)
                    if(col === 'backup_status'){
                        const v = String(displayVal);
                        const cls = (v === 'Active') ? 'ws-run' : (v === 'Full') ? 'ws-wait' : 'ws-wait';
                        cellValue = `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${highlight(displayVal, col)}</span></span>`;
                    }
                    return `<td data-col="${col}" data-label="${label}" class="${tdClass}">${cellValue}</td>`;
                }).join('')
                + `<td data-col="actions" data-label="관리" class="system-actions">`
                + `<button type="button" class="action-btn" data-action="edit" data-id="${row.id}" title="수정" aria-label="수정">
                    <img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon">
                   </button>`
                + `<button type="button" class="action-btn" data-action="delete" data-id="${row.id}" title="삭제" aria-label="삭제">
                    <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">
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

            const maxButtons = 7;
            let startP = Math.max(1, state.page - Math.floor(maxButtons/2));
            let endP = startP + maxButtons - 1;
            if(endP > pages){
                endP = pages;
                startP = Math.max(1, endP - maxButtons + 1);
            }
            function addEllipsis(){
                const s = document.createElement('span');
                s.className = 'page-ellipsis';
                s.textContent = '…';
                container.appendChild(s);
            }
            function addBtn(p){
                const btn = document.createElement('button');
                btn.className = 'page-btn'+(p===state.page?' active':'');
                btn.textContent = p;
                btn.dataset.page = p;
                container.appendChild(btn);
            }
            if(pages <= maxButtons){
                for(let p=1;p<=pages;p++) addBtn(p);
            } else {
                if(startP > 1){
                    addBtn(1);
                    if(startP > 2) addEllipsis();
                }
                for(let p=startP;p<=endP;p++) addBtn(p);
                if(endP < pages){
                    if(endP < pages-1) addEllipsis();
                    addBtn(pages);
                }
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
        const allChecked = boxes.length > 0 && boxes.every(b=>b.checked);
        btn.textContent = allChecked ? '전체 해제' : '전체 선택';
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
        try{
            const key = 'gov_backup_tape:visibleCols:v1';
            localStorage.setItem(key, JSON.stringify([...state.visibleCols]));
        }catch(_e){}
    }
    function loadColumnSelection(){
        state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
        try{
            const key = 'gov_backup_tape:visibleCols:v1';
            const raw = localStorage.getItem(key);
            if(raw){
                const arr = JSON.parse(raw);
                if(Array.isArray(arr)){
                    const valid = new Set(Object.keys(COLUMN_META));
                    const next = arr.filter(k=> valid.has(k));
                    if(next.length) state.visibleCols = new Set([...next, ...FIXED_VISIBLE_COLUMNS]);
                }
            }
        }catch(_e){}
    }

    // ---- Sort persistence ----
    function saveSortPreference(){
        try{
            if(state.sortKey){
                localStorage.setItem('tape_sort_key', state.sortKey);
                localStorage.setItem('tape_sort_dir', state.sortDir==='desc' ? 'desc' : 'asc');
            } else {
                localStorage.removeItem('tape_sort_key');
                localStorage.removeItem('tape_sort_dir');
            }
        }catch(e){}
    }
    function loadSortPreference(){
        try{
            const key = localStorage.getItem('tape_sort_key');
            const dir = localStorage.getItem('tape_sort_dir');
            if(key && COLUMN_META[key]){
                state.sortKey = key;
                state.sortDir = (dir === 'desc') ? 'desc' : 'asc';
            }
        }catch(e){}
    }

    function handleColumnFormApply(){
        const form = document.getElementById(COLUMN_FORM_ID); if(!form) return;
        const checked = [...form.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.value);
        const finalCols = new Set([...checked, ...FIXED_VISIBLE_COLUMNS]);
        if(checked.length === 0){
            showMessage('최소 1개 이상 컬럼을 선택하세요.', '안내');
            return;
        }
        state.visibleCols = finalCols;
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

    // Add / Edit (Backup tape schema)
    function collectTapePayload(form){
        computeTapeDerivedFields(form);
        const raw = {};
        form.querySelectorAll('input,select,textarea').forEach(el=>{
            if(!el.name) return;
            raw[el.name] = (el.value ?? '').toString().trim();
        });

        const payload = {
            backup_id: raw.backup_id || '',
            backup_policy_name: raw.backup_policy_name || '',
            retention_type: raw.retention_type || '',
            backup_size_k: raw.backup_size_k,
            library_id: raw.library_id,
            backup_created_date: raw.backup_created_date || '',
            backup_expired_date: raw.backup_expired_date || '',
            backup_status: raw.backup_status || '',
            location_id: raw.location_id,
            remark: raw.remark || '',
        };

        // Coerce numeric fields for API
        const kText = stripNumberSeparators(payload.backup_size_k);
        payload.backup_size_k = kText === '' ? null : parseInt(kText, 10);
        payload.library_id = payload.library_id === '' ? null : parseInt(payload.library_id, 10);
        payload.location_id = payload.location_id === '' ? null : parseInt(payload.location_id, 10);
        if(!Number.isFinite(payload.backup_size_k)) payload.backup_size_k = null;
        if(!Number.isFinite(payload.library_id)) payload.library_id = null;
        if(!Number.isFinite(payload.location_id)) payload.location_id = null;

        return payload;
    }

    function fillEditForm(row){
        const form = document.getElementById(EDIT_FORM_ID); if(!form) return;
        const r = row || {};
        form.innerHTML = '';
        const section = document.createElement('div');
        section.className = 'form-section';
        section.innerHTML = `<div class="section-header"><h4>기본</h4></div>`;
        const grid = document.createElement('div');
        grid.className = 'form-grid';

        const fields = [
            { name: 'backup_id', label: '백업 ID', wide: false },
            { name: 'backup_policy_name', label: '백업 정책 이름', wide: false },
            { name: 'retention_type', label: '보관 구분', wide: false },
            { name: 'backup_size_k', label: '백업 용량(K)', wide: false },
            { name: 'backup_size_t', label: '백업 용량(T)', wide: false, readonly: true },
            { name: 'library_id', label: '백업 라이브러리', wide: false },
            { name: 'backup_created_date', label: '백업 생성일자', wide: false },
            { name: 'backup_created_year', label: '백업 생성년도', wide: false, readonly: true },
            { name: 'backup_expired_date', label: '백업 만료일자', wide: false },
            { name: 'backup_status', label: '백업 상태', wide: false },
            { name: 'location_id', label: '백업 위치', wide: false },
            { name: 'remark', label: '비고', wide: true },
        ];

        fields.forEach(f=>{
            const wrap = document.createElement('div');
            wrap.className = f.wide ? 'form-row form-row-wide' : 'form-row';
            const value = r[f.name] ?? '';
            wrap.innerHTML = `<label>${f.label}</label>${generateTapeFieldInput(f.name, value, r, !!f.readonly)}`;
            grid.appendChild(wrap);
        });
        section.appendChild(grid);
        form.appendChild(section);

        // Populate selects (library/location)
        fillSelectOptions(form.querySelector('select[name="library_id"]'), state.libraries, 'id', 'library_name', r.library_id);
        fillSelectOptions(form.querySelector('select[name="location_id"]'), state.locations, 'id', 'location_name', r.location_id);

        // Ensure searchable dropdown UI is applied/updated inside the edit modal.
        try{ window.BlossomSearchableSelect?.syncAll?.(form); }catch(_e){}
    }

    function generateTapeFieldInput(name, value, row, readonly){
        const v = (value ?? '').toString();
        if(name === 'retention_type'){
            return `<select name="retention_type" class="form-input search-select" data-searchable="true" data-placeholder="선택" required>
                <option value="">선택</option>
                <option value="단기 보관" ${v==='단기 보관'?'selected':''}>단기 보관</option>
                <option value="장기 보관" ${v==='장기 보관'?'selected':''}>장기 보관</option>
            </select>`;
        }
        if(name === 'backup_status'){
            return `<select name="backup_status" class="form-input search-select" data-searchable="true" data-placeholder="선택" required>
                <option value="">선택</option>
                <option value="Active" ${v==='Active'?'selected':''}>Active</option>
                <option value="Full" ${v==='Full'?'selected':''}>Full</option>
                <option value="Suspended" ${v==='Suspended'?'selected':''}>Suspended</option>
            </select>`;
        }
        if(name === 'library_id'){
            return `<select name="library_id" class="form-input search-select" data-searchable="true" data-placeholder="선택" required><option value="">선택</option></select>`;
        }
        if(name === 'location_id'){
            return `<select name="location_id" class="form-input search-select" data-searchable="true" data-placeholder="선택" required><option value="">선택</option></select>`;
        }
        if(name === 'backup_size_k'){
            return `<input name="backup_size_k" type="text" inputmode="numeric" autocomplete="off" class="form-input" value="${escapeHTML(v)}" placeholder="정수" required>`;
        }
        if(name === 'backup_size_t'){
            return `<input name="backup_size_t" class="form-input" value="${escapeHTML(v)}" placeholder="자동 계산" readonly>`;
        }
        if(name === 'backup_created_date' || name === 'backup_expired_date'){
            const req = name === 'backup_created_date' ? 'required' : '';
            return `<input name="${name}" class="form-input" value="${escapeHTML(v)}" placeholder="YYYY-MM-DD" ${req}>`;
        }
        if(name === 'backup_created_year'){
            return `<input name="backup_created_year" class="form-input" value="${escapeHTML(v)}" placeholder="자동 계산" readonly>`;
        }
        if(name === 'remark'){
            return `<input name="remark" class="form-input" value="${escapeHTML(v)}" placeholder="메모">`;
        }
        // default text
        const req = (name === 'backup_id' || name === 'backup_policy_name') ? 'required' : '';
        const ro = readonly ? 'readonly' : '';
        return `<input name="${name}" class="form-input" value="${escapeHTML(v)}" placeholder="입력" ${req} ${ro}>`;
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

    async function createTape(payload){
        const res = await apiJson(API_TAPES, { method: 'POST', body: JSON.stringify(payload) });
        return normalizeTapeRow(res?.item);
    }
    async function updateTape(tapeId, payload){
        const res = await apiJson(`${API_TAPES}/${tapeId}`, { method: 'PUT', body: JSON.stringify(payload) });
        return normalizeTapeRow(res?.item);
    }

    async function addRow(payload){
        const created = await createTape(payload);
        state.data.unshift(created);
        applyFilter();
        persistTapes();
        return created;
    }

    async function updateRowById(tapeId, payload){
        const updated = await updateTape(tapeId, payload);
        const idx = state.data.findIndex(r=> r.id === tapeId);
        if(idx !== -1){ state.data[idx] = updated; }
        applyFilter();
        persistTapes();
        return updated;
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
    const filename = `backup_tape_list_${yyyy}${mm}${dd}.csv`;
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

        // Top-right header actions (delegation for robustness)
        document.querySelector('.tab-header-right')?.addEventListener('click', async (e)=>{
            const settingsBtn = e.target.closest(`#${SETTINGS_BTN_ID}`);
            if(!settingsBtn) return;
            e.preventDefault();
            openModal(SETTINGS_MODAL_ID);
            try{
                await reloadSettingsData();
            }catch(err){
                showMessage(err?.message || '기준 설정 정보를 불러오지 못했습니다.', '오류');
            }
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
                    hydrateAddFormSelects();
                    attachDerivedSync(EDIT_FORM_ID);
                    const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                    if(editSaveEl){ editSaveEl.setAttribute('data-id', String(row.id)); }
                }
                if(action==='delete'){
                    state.selected.clear();
                    state.selected.add(rid);
                    render();
                    const subtitle = document.getElementById('delete-subtitle');
                    if(subtitle){ subtitle.textContent = '선택된 1개의 항목을 정말 삭제처리하시겠습니까?'; }
                    openModal(DELETE_MODAL_ID);
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
            const allChecked = boxes.every(b=>b.checked);
            boxes.forEach((box, idx)=>{
                box.checked = !allChecked;
                if(allChecked && idx === 0) box.checked = true; // keep at least one
                const label = box.closest('label.column-checkbox');
                if(label){ label.classList.toggle('is-active', box.checked); }
            });
            const checkedCols = boxes.filter(b=>b.checked).map(b=>b.value);
            state.visibleCols = new Set([...checkedCols, ...FIXED_VISIBLE_COLUMNS]);
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
                if(checkedCols.length){ state.visibleCols = new Set([...checkedCols, ...FIXED_VISIBLE_COLUMNS]); saveColumnSelection(); }
                syncColumnSelectAll();
            }
        });

        // settings modal (기준 설정: 백업 라이브러리/위치)
        document.getElementById(SETTINGS_BTN_ID)?.addEventListener('click', async ()=>{
            openModal(SETTINGS_MODAL_ID);
            try{
                await reloadSettingsData();
            }catch(err){
                showMessage(err.message || '기준 설정 정보를 불러오지 못했습니다.', '오류');
            }
        });
        document.getElementById(SETTINGS_CLOSE_ID)?.addEventListener('click', ()=> closeModal(SETTINGS_MODAL_ID));
        document.getElementById(SETTINGS_APPLY_ID)?.addEventListener('click', ()=> closeModal(SETTINGS_MODAL_ID));

        // Library CRUD
        document.getElementById('lib-add-btn')?.addEventListener('click', ()=>{
            // Inline add row (no modal)
            if(!state.settingsLibDraft){
                state.settingsLibDraft = { library_name:'', backup_device_asset_id:'', remark:'' };
            }
            renderSettingsLibraries();
            const firstInput = document.querySelector('#lib-table-body .settings-draft-row input[data-field="library_name"]');
            firstInput?.focus();
        });
        document.getElementById('lib-add-close')?.addEventListener('click', ()=> closeModal('lib-add-modal'));
        document.getElementById('lib-edit-close')?.addEventListener('click', ()=> closeModal('lib-edit-modal'));
        document.getElementById('lib-delete-close')?.addEventListener('click', ()=> closeModal('lib-delete-modal'));

        document.getElementById('lib-select-all')?.addEventListener('change', e=>{
            const checked = e.target.checked;
            state.settingsLibSelected.clear();
            (state.libraries || []).forEach(r=>{ if(checked) state.settingsLibSelected.add(r.id); });
            renderSettingsLibraries();
        });
        document.getElementById('lib-table-body')?.addEventListener('change', e=>{
            // draft inputs
            const draftRow = e.target.closest('tr.settings-draft-row');
            if(draftRow && state.settingsLibDraft){
                const fieldEl = e.target.closest('[data-field]');
                const field = fieldEl?.getAttribute('data-field');
                if(field){
                    state.settingsLibDraft[field] = (e.target.value ?? '').toString();
                }
                return;
            }

            // editing row inputs
            if(e.target.closest('[data-edit="lib"]') && state.settingsLibEditDraft){
                const fieldEl = e.target.closest('[data-field]');
                const field = fieldEl?.getAttribute('data-field');
                if(field){
                    state.settingsLibEditDraft[field] = (e.target.value ?? '').toString();
                }
                return;
            }
            // selection checkboxes
            const cb = e.target.closest('.lib-row-select');
            if(!cb) return;
            const id = parseInt(cb.dataset.id,10);
            if(!Number.isFinite(id)) return;
            if(cb.checked) state.settingsLibSelected.add(id); else state.settingsLibSelected.delete(id);
            renderSettingsLibraries();
        });
        document.getElementById('lib-table-body')?.addEventListener('input', e=>{
            const draftRow = e.target.closest('tr.settings-draft-row');
            if(!draftRow || !state.settingsLibDraft) return;
            const fieldEl = e.target.closest('[data-field]');
            const field = fieldEl?.getAttribute('data-field');
            if(!field) return;
            state.settingsLibDraft[field] = (e.target.value ?? '').toString();
        });
        document.getElementById('lib-table-body')?.addEventListener('click', async e=>{
            const btn = e.target.closest('button[data-action]');
            if(!btn) return;
            const action = btn.getAttribute('data-action');

            if(action === 'lib-cancel-new'){
                state.settingsLibDraft = null;
                renderSettingsLibraries();
                return;
            }
            if(action === 'lib-save-new'){
                const draft = state.settingsLibDraft;
                if(!draft) return;
                const name = (draft.library_name || '').toString().trim();
                const devIdRaw = (draft.backup_device_asset_id || '').toString().trim();
                const devId = devIdRaw === '' ? NaN : parseInt(devIdRaw, 10);
                if(!name){ showMessage('백업 라이브러리를 입력하세요.', '안내'); return; }
                if(!Number.isFinite(devId)){ showMessage('백업장치를 선택하세요.', '안내'); return; }
                try{
                    await apiJson(API_LIBS, { method:'POST', body: JSON.stringify({
                        library_name: name,
                        backup_device_asset_id: devId,
                        remark: (draft.remark || '').toString().trim()
                    })});
                    state.settingsLibDraft = null;
                    await reloadSettingsData();
                }catch(err){
                    showMessage(err.message || '백업 라이브러리 등록 중 오류가 발생했습니다.', '오류');
                }
                return;
            }

            if(action === 'lib-edit'){
                const id = parseInt(btn.dataset.id,10);
                const row = (state.libraries || []).find(x=> x.id === id);
                if(!row) return;
                state.settingsLibEditingId = id;
                state.settingsLibEditDraft = {
                    library_name: row.library_name || '',
                    backup_device_asset_id: row.backup_device_asset_id ?? '',
                    remark: row.remark || ''
                };
                renderSettingsLibraries();
                return;
            }

            if(action === 'lib-save'){
                const id = parseInt(btn.dataset.id,10);
                const draft = state.settingsLibEditDraft;
                if(!id || !draft) return;
                const name = (draft.library_name || '').toString().trim();
                const devIdRaw = (draft.backup_device_asset_id || '').toString().trim();
                const devId = devIdRaw === '' ? NaN : parseInt(devIdRaw, 10);
                if(!name){ showMessage('백업 라이브러리를 입력하세요.', '안내'); return; }
                if(!Number.isFinite(devId)){ showMessage('백업장치를 선택하세요.', '안내'); return; }
                try{
                    await apiJson(`${API_LIBS}/${id}`, { method:'PUT', body: JSON.stringify({
                        library_name: name,
                        backup_device_asset_id: devId,
                        remark: (draft.remark || '').toString().trim()
                    })});
                    state.settingsLibEditingId = null;
                    state.settingsLibEditDraft = null;
                    await reloadSettingsData();
                }catch(err){
                    showMessage(err.message || '백업 라이브러리 수정 중 오류가 발생했습니다.', '오류');
                }
                return;
            }

            if(action === 'lib-delete'){
                const id = parseInt(btn.dataset.id,10);
                if(!id) return;
                state.settingsLibPendingDeleteIds = [id];
                const subtitle = document.getElementById('lib-delete-subtitle');
                if(subtitle) subtitle.textContent = '선택된 1개의 항목을 정말 삭제처리하시겠습니까?';
                openModal('lib-delete-modal');
                return;
            }
        });
        document.getElementById('lib-add-save')?.addEventListener('click', async ()=>{
            const form = document.getElementById('lib-add-form');
            if(!form) return;
            if(!form.checkValidity()){ form.reportValidity(); return; }
            try{
                const data = collectFormValues(form);
                await apiJson(API_LIBS, { method:'POST', body: JSON.stringify({
                    library_name: data.library_name,
                    backup_device_asset_id: parseInt(data.backup_device_asset_id,10),
                    remark: data.remark || ''
                })});
                form.reset();
                closeModal('lib-add-modal');
                await reloadSettingsData();
            }catch(err){
                showMessage(err.message || '백업 라이브러리 등록 중 오류가 발생했습니다.', '오류');
            }
        });
        document.getElementById('lib-edit-save')?.addEventListener('click', async (e)=>{
            const id = parseInt(e.currentTarget.getAttribute('data-id')||'0',10);
            const form = document.getElementById('lib-edit-form');
            if(!form || !id) return;
            if(!form.checkValidity()){ form.reportValidity(); return; }
            try{
                const data = collectFormValues(form);
                await apiJson(`${API_LIBS}/${id}`, { method:'PUT', body: JSON.stringify({
                    library_name: data.library_name,
                    backup_device_asset_id: parseInt(data.backup_device_asset_id,10),
                    remark: data.remark || ''
                })});
                closeModal('lib-edit-modal');
                await reloadSettingsData();
            }catch(err){
                showMessage(err.message || '백업 라이브러리 수정 중 오류가 발생했습니다.', '오류');
            }
        });
        document.getElementById('lib-delete-confirm')?.addEventListener('click', async ()=>{
            const ids = (Array.isArray(state.settingsLibPendingDeleteIds) && state.settingsLibPendingDeleteIds.length)
                ? state.settingsLibPendingDeleteIds
                : [...state.settingsLibSelected];
            if(!ids.length){ closeModal('lib-delete-modal'); return; }
            try{
                await apiJson(`${API_LIBS}/bulk-delete`, { method:'POST', body: JSON.stringify({ ids })});
                state.settingsLibPendingDeleteIds = null;
                closeModal('lib-delete-modal');
                await reloadSettingsData();
            }catch(err){
                showMessage(err.message || '백업 라이브러리 삭제 중 오류가 발생했습니다.', '오류');
            }
        });

        // Location CRUD
        document.getElementById('loc-add-btn')?.addEventListener('click', ()=>{
            // Inline add row (no modal)
            if(!state.settingsLocDraft){
                state.settingsLocDraft = { location_name:'', location_detail:'', remark:'' };
            }
            renderSettingsLocations();
            const firstInput = document.querySelector('#loc-table-body .settings-draft-row input[data-field="location_name"]');
            firstInput?.focus();
        });
        document.getElementById('loc-add-close')?.addEventListener('click', ()=> closeModal('loc-add-modal'));
        document.getElementById('loc-edit-close')?.addEventListener('click', ()=> closeModal('loc-edit-modal'));
        document.getElementById('loc-delete-close')?.addEventListener('click', ()=> closeModal('loc-delete-modal'));

        document.getElementById('loc-select-all')?.addEventListener('change', e=>{
            const checked = e.target.checked;
            state.settingsLocSelected.clear();
            (state.locations || []).forEach(r=>{ if(checked) state.settingsLocSelected.add(r.id); });
            renderSettingsLocations();
        });
        document.getElementById('loc-table-body')?.addEventListener('change', e=>{
            // draft inputs
            const draftRow = e.target.closest('tr.settings-draft-row');
            if(draftRow && state.settingsLocDraft){
                const fieldEl = e.target.closest('[data-field]');
                const field = fieldEl?.getAttribute('data-field');
                if(field){
                    state.settingsLocDraft[field] = (e.target.value ?? '').toString();
                }
                return;
            }

            // editing row inputs
            if(e.target.closest('[data-edit="loc"]') && state.settingsLocEditDraft){
                const fieldEl = e.target.closest('[data-field]');
                const field = fieldEl?.getAttribute('data-field');
                if(field){
                    state.settingsLocEditDraft[field] = (e.target.value ?? '').toString();
                }
                return;
            }
            // selection checkboxes
            const cb = e.target.closest('.loc-row-select');
            if(!cb) return;
            const id = parseInt(cb.dataset.id,10);
            if(!Number.isFinite(id)) return;
            if(cb.checked) state.settingsLocSelected.add(id); else state.settingsLocSelected.delete(id);
            renderSettingsLocations();
        });
        document.getElementById('loc-table-body')?.addEventListener('input', e=>{
            const draftRow = e.target.closest('tr.settings-draft-row');
            if(!draftRow || !state.settingsLocDraft) return;
            const fieldEl = e.target.closest('[data-field]');
            const field = fieldEl?.getAttribute('data-field');
            if(!field) return;
            state.settingsLocDraft[field] = (e.target.value ?? '').toString();
        });
        document.getElementById('loc-table-body')?.addEventListener('click', async e=>{
            const btn = e.target.closest('button[data-action]');
            if(!btn) return;
            const action = btn.getAttribute('data-action');

            if(action === 'loc-cancel-new'){
                state.settingsLocDraft = null;
                renderSettingsLocations();
                return;
            }
            if(action === 'loc-save-new'){
                const draft = state.settingsLocDraft;
                if(!draft) return;
                const name = (draft.location_name || '').toString().trim();
                if(!name){ showMessage('백업 위치를 입력하세요.', '안내'); return; }
                try{
                    await apiJson(API_LOCS, { method:'POST', body: JSON.stringify({
                        location_name: name,
                        location_detail: (draft.location_detail || '').toString().trim(),
                        remark: (draft.remark || '').toString().trim()
                    })});
                    state.settingsLocDraft = null;
                    await reloadSettingsData();
                }catch(err){
                    showMessage(err.message || '백업 위치 등록 중 오류가 발생했습니다.', '오류');
                }
                return;
            }

            if(action === 'loc-edit'){
                const id = parseInt(btn.dataset.id,10);
                const row = (state.locations || []).find(x=> x.id === id);
                if(!row) return;
                state.settingsLocEditingId = id;
                state.settingsLocEditDraft = {
                    location_name: row.location_name || '',
                    location_detail: row.location_detail || '',
                    remark: row.remark || ''
                };
                renderSettingsLocations();
                return;
            }

            if(action === 'loc-save'){
                const id = parseInt(btn.dataset.id,10);
                const draft = state.settingsLocEditDraft;
                if(!id || !draft) return;
                const name = (draft.location_name || '').toString().trim();
                if(!name){ showMessage('백업 위치를 입력하세요.', '안내'); return; }
                try{
                    await apiJson(`${API_LOCS}/${id}`, { method:'PUT', body: JSON.stringify({
                        location_name: name,
                        location_detail: (draft.location_detail || '').toString().trim(),
                        remark: (draft.remark || '').toString().trim()
                    })});
                    state.settingsLocEditingId = null;
                    state.settingsLocEditDraft = null;
                    await reloadSettingsData();
                }catch(err){
                    showMessage(err.message || '백업 위치 수정 중 오류가 발생했습니다.', '오류');
                }
                return;
            }

            if(action === 'loc-delete'){
                const id = parseInt(btn.dataset.id,10);
                if(!id) return;
                state.settingsLocPendingDeleteIds = [id];
                const subtitle = document.getElementById('loc-delete-subtitle');
                if(subtitle) subtitle.textContent = '선택된 1개의 항목을 정말 삭제처리하시겠습니까?';
                openModal('loc-delete-modal');
                return;
            }
        });
        document.getElementById('loc-add-save')?.addEventListener('click', async ()=>{
            const form = document.getElementById('loc-add-form');
            if(!form) return;
            if(!form.checkValidity()){ form.reportValidity(); return; }
            try{
                const data = collectFormValues(form);
                await apiJson(API_LOCS, { method:'POST', body: JSON.stringify({
                    location_name: data.location_name,
                    location_detail: data.location_detail || '',
                    remark: data.remark || ''
                })});
                form.reset();
                closeModal('loc-add-modal');
                await reloadSettingsData();
            }catch(err){
                showMessage(err.message || '백업 위치 등록 중 오류가 발생했습니다.', '오류');
            }
        });
        document.getElementById('loc-edit-save')?.addEventListener('click', async (e)=>{
            const id = parseInt(e.currentTarget.getAttribute('data-id')||'0',10);
            const form = document.getElementById('loc-edit-form');
            if(!form || !id) return;
            if(!form.checkValidity()){ form.reportValidity(); return; }
            try{
                const data = collectFormValues(form);
                await apiJson(`${API_LOCS}/${id}`, { method:'PUT', body: JSON.stringify({
                    location_name: data.location_name,
                    location_detail: data.location_detail || '',
                    remark: data.remark || ''
                })});
                closeModal('loc-edit-modal');
                await reloadSettingsData();
            }catch(err){
                showMessage(err.message || '백업 위치 수정 중 오류가 발생했습니다.', '오류');
            }
        });
        document.getElementById('loc-delete-confirm')?.addEventListener('click', async ()=>{
            const ids = (Array.isArray(state.settingsLocPendingDeleteIds) && state.settingsLocPendingDeleteIds.length)
                ? state.settingsLocPendingDeleteIds
                : [...state.settingsLocSelected];
            if(!ids.length){ closeModal('loc-delete-modal'); return; }
            try{
                await apiJson(`${API_LOCS}/bulk-delete`, { method:'POST', body: JSON.stringify({ ids })});
                state.settingsLocPendingDeleteIds = null;
                closeModal('loc-delete-modal');
                await reloadSettingsData();
            }catch(err){
                showMessage(err.message || '백업 위치 삭제 중 오류가 발생했습니다.', '오류');
            }
        });
        // add modal
    document.getElementById(ADD_BTN_ID)?.addEventListener('click', ()=> {
        hydrateAddFormSelects();
        openModal(ADD_MODAL_ID);
        initDatePickers(ADD_FORM_ID);
        attachDerivedSync(ADD_FORM_ID);
    });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', async ()=>{
            const btn = document.getElementById(ADD_SAVE_ID);
            const form = document.getElementById(ADD_FORM_ID);
            if(!form) return;
            if(!form.checkValidity()){ form.reportValidity(); return; }
            if(!validateOpenClose(ADD_FORM_ID)) return;
            try{
                if(btn) btn.disabled = true;
                const payload = collectTapePayload(form);
                await addRow(payload);
                form.reset();
                hydrateAddFormSelects();
                attachDerivedSync(ADD_FORM_ID);
                closeModal(ADD_MODAL_ID);
            }catch(err){
                showMessage(err.message || '등록 중 오류가 발생했습니다.', '오류');
            }finally{
                if(btn) btn.disabled = false;
            }
        });
        // edit modal
    document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', async ()=>{
            const btn = document.getElementById(EDIT_SAVE_ID);
            const form = document.getElementById(EDIT_FORM_ID);
            if(!form) return;
            if(!form.checkValidity()){ form.reportValidity(); return; }
            if(!validateOpenClose(EDIT_FORM_ID)) return;
            const tapeId = parseInt(btn?.getAttribute('data-id') || '0', 10);
            if(!tapeId){ showMessage('대상을 찾을 수 없습니다.', '오류'); return; }
            try{
                if(btn) btn.disabled = true;
                const payload = collectTapePayload(form);
                await updateRowById(tapeId, payload);
                closeModal(EDIT_MODAL_ID);
            }catch(err){
                showMessage(err.message || '수정 중 오류가 발생했습니다.', '오류');
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
                    const wide = ['백업 정책 이름', '비고'];
                    const mid = ['백업 ID', '백업 라이브러리', '백업 위치'];
                    if(wide.includes(h)) return { wch: 26 };
                    if(mid.includes(h)) return { wch: 18 };
                    if(h.includes('일자')) return { wch: 14 };
                    if(h.includes('용량')) return { wch: 14 };
                    return { wch: 12 };
                });

                // Guide sheet: rules and allowed values (Korean)
                const rules = [
                    ['엑셀 업로드 가이드'],
                    [''],
                    ['작성 규칙'],
                    ['- 첫 행의 컬럼 제목은 아래 순서와 완전히 일치해야 합니다. (순서/이름 변경 불가)'],
                    ['- "보관 구분"은 단기 보관/장기 보관 중 선택'],
                    ['- "백업 상태"는 Active/Full/Suspended 중 선택'],
                    ['- "백업 용량(K)"는 0 이상의 정수'],
                    ['- "백업 라이브러리"/"백업 위치"는 백업 설정 탭에 존재하는 이름과 일치해야 합니다.'],
                    [''],
                    ['컬럼 순서 (복사/참고용)'],
                    [UPLOAD_HEADERS_KO.join(', ')],
                ];
                const wsGuide = XLSX.utils.aoa_to_sheet(rules);
                wsGuide['!cols'] = [{ wch: 120 }];

                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template');
                XLSX.utils.book_append_sheet(wb, wsGuide, '가이드');
                XLSX.writeFile(wb, 'backup_tape_upload_template.xlsx');
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
                    const libByName = new Map((state.libraries||[]).map(l=> [String(l.library_name||'').trim(), l]));
                    const locByName = new Map((state.locations||[]).map(l=> [String(l.location_name||'').trim(), l]));
                    for(let r=1; r<rows.length; r++){
                        const row = rows[r]; if(isEmptyRow(row)) continue;
                        const rec = {};
                        for(let c=0; c<header.length; c++){
                            const label = header[c]; const key = HEADER_KO_TO_KEY[label];
                            rec[key] = String(row[c]??'').trim();
                        }
                        // Validation rules (backup tape)
                        if(!rec.backup_id) errors.push(`Row ${r+1}: 백업 ID는 필수입니다.`);
                        if(!rec.backup_policy_name) errors.push(`Row ${r+1}: 백업 정책 이름은 필수입니다.`);
                        if(rec.retention_type && !['단기 보관','장기 보관'].includes(rec.retention_type)) errors.push(`Row ${r+1}: 보관 구분은 단기 보관/장기 보관만 가능합니다.`);
                        if(!rec.retention_type) errors.push(`Row ${r+1}: 보관 구분은 필수입니다.`);
                        if(rec.backup_status && !['Active','Full','Suspended'].includes(rec.backup_status)) errors.push(`Row ${r+1}: 백업 상태는 Active/Full/Suspended만 가능합니다.`);
                        if(!rec.backup_status) errors.push(`Row ${r+1}: 백업 상태는 필수입니다.`);
                        if(rec.backup_size_k !== '' && !isIntegerLike(rec.backup_size_k)) errors.push(`Row ${r+1}: 백업 용량(K)은 정수만 입력하세요.`);
                        if(rec.backup_size_k === '') errors.push(`Row ${r+1}: 백업 용량(K)은 필수입니다.`);
                        if(rec.backup_created_date && !/^\d{4}-\d{2}-\d{2}$/.test(rec.backup_created_date)) errors.push(`Row ${r+1}: 백업 생성일자는 YYYY-MM-DD 형식입니다.`);
                        if(!rec.backup_created_date) errors.push(`Row ${r+1}: 백업 생성일자는 필수입니다.`);
                        if(rec.backup_expired_date && !/^\d{4}-\d{2}-\d{2}$/.test(rec.backup_expired_date)) errors.push(`Row ${r+1}: 백업 만료일자는 YYYY-MM-DD 형식입니다.`);
                        const libName = String(rec.library_name||'').trim();
                        const locName = String(rec.location_name||'').trim();
                        if(!libName) errors.push(`Row ${r+1}: 백업 라이브러리는 필수입니다.`);
                        if(!locName) errors.push(`Row ${r+1}: 백업 위치는 필수입니다.`);
                        if(libName && !libByName.has(libName)) errors.push(`Row ${r+1}: 백업 라이브러리(\"${libName}\")가 백업 설정에 없습니다.`);
                        if(locName && !locByName.has(locName)) errors.push(`Row ${r+1}: 백업 위치(\"${locName}\")가 백업 설정에 없습니다.`);

                        rec.backup_size_k = toIntOrBlank(rec.backup_size_k);
                        imported.push(rec);
                    }
                    if(errors.length){
                        const preview = errors.slice(0, 20).join('\n');
                        const more = errors.length>20 ? `\n...외 ${errors.length-20}건` : '';
                        showMessage(`업로드 실패: 유효성 검사 오류가 있습니다.\n\n${preview}${more}`, '업로드 실패');
                        return;
                    }
                    // Import rows via API
                    let ok = 0;
                    for(const item of imported){
                        const lib = libByName.get(String(item.library_name||'').trim());
                        const loc = locByName.get(String(item.location_name||'').trim());
                        const payload = {
                            backup_id: item.backup_id,
                            backup_policy_name: item.backup_policy_name,
                            retention_type: item.retention_type,
                            backup_size_k: item.backup_size_k,
                            library_id: lib?.id,
                            backup_created_date: item.backup_created_date,
                            backup_expired_date: item.backup_expired_date || '',
                            backup_status: item.backup_status,
                            location_id: loc?.id,
                            remark: item.remark || '',
                        };
                        await addRow(payload);
                        ok += 1;
                    }
                    showMessage(`${ok}개 행이 업로드되었습니다.`, '업로드 완료');
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
        document.getElementById('system-duplicate-confirm')?.addEventListener('click', async ()=>{
            const originals = state.data.filter(r=> state.selected.has(r.id));
            if(!originals.length){ showMessage('선택된 행을 찾을 수 없습니다.', '오류'); closeModal('system-duplicate-modal'); return; }
            try{
                let ok = 0;
                const ts = Date.now();
                for(let i=0; i<originals.length; i++){
                    const o = originals[i];
                    const payload = {
                        backup_id: `${o.backup_id}_COPY_${ts}_${i+1}`,
                        backup_policy_name: o.backup_policy_name,
                        retention_type: o.retention_type,
                        backup_size_k: o.backup_size_k,
                        library_id: o.library_id,
                        backup_created_date: o.backup_created_date,
                        backup_expired_date: o.backup_expired_date || '',
                        backup_status: o.backup_status,
                        location_id: o.location_id,
                        remark: o.remark || '',
                    };
                    await addRow(payload);
                    ok += 1;
                }
                closeModal('system-duplicate-modal');
                showMessage(ok + '개 행이 복제되었습니다.', '완료');
            }catch(err){
                showMessage(err.message || '복제 중 오류가 발생했습니다.', '오류');
            }
        });

        // delete (삭제처리)
        document.getElementById(DELETE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('삭제할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('delete-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 항목을 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', async ()=>{
            const ids = [...state.selected].filter(Boolean);
            if(!ids.length){ closeModal(DELETE_MODAL_ID); return; }
            const btn = document.getElementById(DELETE_CONFIRM_ID);
            try{
                if(btn) btn.disabled = true;
                const res = await apiJson(`${API_TAPES}/bulk-delete`, { method:'POST', body: JSON.stringify({ ids })});
                const deleted = Array.isArray(res?.deleted) ? res.deleted : [];
                if(deleted.length){
                    state.data = state.data.filter(r=> !deleted.includes(r.id));
                    state.selected.clear();
                    const selectAll = document.getElementById(SELECT_ALL_ID);
                    if(selectAll) selectAll.checked = false;
                    applyFilter();
                    persistTapes();
                }
                closeModal(DELETE_MODAL_ID);
                showMessage(`${deleted.length}개 항목이 삭제되었습니다.`, '완료');
            }catch(err){
                showMessage(err?.message || '삭제 중 오류가 발생했습니다.', '오류');
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
                initDatePickers(EDIT_FORM_ID);
                const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                if(editSaveEl){ editSaveEl.setAttribute('data-id', String(row.id)); }
                attachDerivedSync(EDIT_FORM_ID);
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
            const btn = document.getElementById(BULK_APPLY_ID);
            const ids = [...state.selected].filter(Boolean);
            if(!ids.length) return;
            try{
                if(btn) btn.disabled = true;
                const updates = {};
                entries.forEach(({field, value})=>{
                    if(field === 'backup_size_k') updates[field] = parseInt(stripNumberSeparators(value), 10);
                    else if(field === 'library_id' || field === 'location_id') updates[field] = parseInt(value, 10);
                    else updates[field] = value;
                });
                await Promise.all(ids.map(async (id)=>{
                    await updateRowById(id, updates);
                }));
                closeModal(BULK_MODAL_ID);
                showMessage(`${ids.length}개 항목에 일괄 변경이 적용되었습니다.`, '완료');
            }catch(err){
                showMessage(err.message || '일괄 변경 중 오류가 발생했습니다.', '오류');
            }finally{
                if(btn) btn.disabled = false;
            }
        });
        // esc close
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ [ADD_MODAL_ID,EDIT_MODAL_ID,COLUMN_MODAL_ID,DELETE_MODAL_ID,BULK_MODAL_ID,UPLOAD_MODAL_ID,'system-download-modal','system-message-modal','system-duplicate-modal',SETTINGS_MODAL_ID,'lib-add-modal','lib-edit-modal','lib-delete-modal','loc-add-modal','loc-edit-modal','loc-delete-modal'].forEach(closeModal); }});
    // include stats modal in esc close
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeModal(STATS_MODAL_ID); }});

        // message modal bindings
        document.getElementById('system-message-close')?.addEventListener('click', ()=> closeModal('system-message-modal'));
        document.getElementById('system-message-ok')?.addEventListener('click', ()=> closeModal('system-message-modal'));

    }

    function buildBulkForm(){
        const form = document.getElementById(BULK_FORM_ID); if(!form) return;
        function inputFor(col){
            if(col === 'retention_type'){
                return `<select name="retention_type" class="form-input" data-bulk-field="retention_type">
                    <option value="">선택</option>
                    <option value="단기 보관">단기 보관</option>
                    <option value="장기 보관">장기 보관</option>
                </select>`;
            }
            if(col === 'backup_status'){
                return `<select name="backup_status" class="form-input" data-bulk-field="backup_status">
                    <option value="">선택</option>
                    <option value="Active">Active</option>
                    <option value="Full">Full</option>
                    <option value="Suspended">Suspended</option>
                </select>`;
            }
            if(col === 'library_id'){
                const opts = ['<option value="">선택</option>'].concat((state.libraries||[]).map(l=>`<option value="${escapeHTML(String(l.id))}">${escapeHTML(String(l.library_name||''))}</option>`));
                return `<select name="library_id" class="form-input" data-bulk-field="library_id">${opts.join('')}</select>`;
            }
            if(col === 'location_id'){
                const opts = ['<option value="">선택</option>'].concat((state.locations||[]).map(l=>`<option value="${escapeHTML(String(l.id))}">${escapeHTML(String(l.location_name||''))}</option>`));
                return `<select name="location_id" class="form-input" data-bulk-field="location_id">${opts.join('')}</select>`;
            }
            if(col === 'backup_size_k') return `<input name="backup_size_k" type="text" inputmode="numeric" autocomplete="off" class="form-input" data-bulk-field="backup_size_k" placeholder="정수">`;
            if(col === 'backup_created_date' || col === 'backup_expired_date') return `<input name="${col}" class="form-input" data-bulk-field="${col}" placeholder="YYYY-MM-DD">`;
            if(col === 'remark') return `<input name="remark" class="form-input" data-bulk-field="remark" placeholder="메모">`;
            return `<input name="${col}" class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }

        const GROUPS = [
            { title:'기본', cols:['retention_type','backup_status','library_id','location_id','backup_size_k','backup_created_date','backup_expired_date','remark'] },
        ];
        const LABELS = {
            retention_type: '보관 구분',
            backup_status: '백업 상태',
            library_id: '백업 라이브러리',
            location_id: '백업 위치',
            backup_size_k: '백업 용량(K)',
            backup_created_date: '백업 생성일자',
            backup_expired_date: '백업 만료일자',
            remark: '비고',
        };

        form.innerHTML = GROUPS.map(g=>{
            const grid = g.cols.map(col=>{
                const label = LABELS[col] || (COLUMN_META[col]?.label) || col;
                const wide = (col === 'remark');
                return `<div class="${wide ? 'form-row form-row-wide' : 'form-row'}"><label>${label}</label>${inputFor(col)}</div>`;
            }).join('');
            return `
                <div class="form-section">
                    <div class="section-header"><h4>${g.title}</h4></div>
                    <div class="form-grid">${grid}</div>
                </div>`;
        }).join('');

        form.querySelectorAll('input[data-bulk-field="backup_size_k"]').forEach(el=>{
            el.addEventListener('input', ()=> formatIntInputWithCommas(el));
            el.addEventListener('blur', ()=> formatIntInputWithCommas(el));
        });

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
        // 테이프 현황/분포
        renderStatBlock('stats-software', '상태', countBy(rows, 'backup_status', ['Active','Full','Suspended']), ['Active','Full','Suspended']);
        renderStatBlock('stats-versions', '보관 구분', countBy(rows, 'retention_type', ['단기 보관','장기 보관']), ['단기 보관','장기 보관']);
        renderStatBlock('stats-check', '라이브러리', countBy(rows, 'library_name'));
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


