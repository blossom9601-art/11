/**
 * 온/습도 기록 페이지 스크립트
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
    // (통계 기능 제거: Chart.js 로더 삭제)
    async function ensureFlatpickr(){
        // Always ensure base CSS and the selected theme (update if already present)
        ensureCss(FLATPICKR_CSS, 'flatpickr-css');
        ensureCss(FLATPICKR_THEME_HREF, 'flatpickr-theme-css');
        if(window.flatpickr){ return; }
        await loadScript(FLATPICKR_JS);
        try { await loadScript(FLATPICKR_KO); } catch(_e){}
    }
    // Shared helper: add a consistent Today button inside Flatpickr calendar (used by Review + Stats)
    function addFlatpickrTodayButton(fp){
        const cal = fp?.calendarContainer; if(!cal) return;
        if(cal.querySelector('.fp-today-btn')) return; // already added
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fp-today-btn';
        btn.textContent = '오늘';
        btn.addEventListener('click', ()=>{
            const now = new Date();
            try { fp.setDate(now, true); } catch(_e){}
        });
        cal.appendChild(btn);
    }
    async function initEntryDatePicker(){
        try { await ensureFlatpickr(); } catch(_e){ return; }
        const form = document.getElementById('system-entry-form');
        const el = form?.querySelector('[name="date"]');
        if(!el) return;
        if(el._flatpickr) return;
        function ensureTodayButton(fp){
            const cal = fp?.calendarContainer; if(!cal) return;
            if(cal.querySelector('.fp-today-btn')) return; // already added
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'fp-today-btn';
            btn.textContent = '오늘';
            btn.addEventListener('click', ()=>{
                const now = new Date();
                try { fp.setDate(now, true); } catch(_e){}
            });
            cal.appendChild(btn);
        }
        const opts = {
            locale: (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.ko) ? window.flatpickr.l10ns.ko : 'ko',
            dateFormat: 'Y-m-d',
            allowInput: true,
            disableMobile: true,
                onReady: function(selectedDates, dateStr, instance){ ensureTodayButton(instance); },
                onOpen: function(selectedDates, dateStr, instance){ ensureTodayButton(instance); },
                onChange: function(){ updateDateMismatchWarning(); }
        };
        try { window.flatpickr(el, opts); } catch(_e){}
        // Also react to manual typing or programmatic changes
        el.addEventListener('change', updateDateMismatchWarning);
        el.addEventListener('input', updateDateMismatchWarning);
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

    // Allowed locations for place select in the unified modal
    const ALLOWED_PLACES = ['퓨처센터(5층)','퓨처센터(6층)','을지트윈타워(15층)','재해복구센터(4층)'];
    const PLACE_PLACEHOLDER_TEXT = '장소 선택';
    function normalizePlace(raw){
        if(!raw) return '';
        const s = String(raw).trim();
        // Try exact allowed value first
        if(ALLOWED_PLACES.includes(s)) return s;
        // If value starts with one of the allowed options (e.g., "퓨처센터(5층) Lab1"), pick that base
        const match = ALLOWED_PLACES.find(p=> s.startsWith(p));
        if(match) return match;
        // Fallback: take token before first space and try again
        const base = s.split(/\s+/)[0];
        if(ALLOWED_PLACES.includes(base)) return base;
        return '';
    }

    // === API (JSON store) ===
    const THERMO_LOGS_API_BASE = '/api/thermometer-logs';
    // API 사용 가능 여부 (목록 로드 성공 시 true)

    async function apiJson(method, url, body){
        const init = {
            method,
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
        };
        if(body != null){
            init.body = JSON.stringify(body);
        }
        const res = await fetch(url, init);
        let data = null;
        try{ data = await res.json(); }catch(_e){ data = null; }
        if(!res.ok){
            const msg = (data && data.message) ? data.message : `요청 실패 (${res.status})`;
            throw new Error(msg);
        }
        return data;
    }

    async function apiListThermoLogs(){
        return apiJson('GET', THERMO_LOGS_API_BASE);
    }
    async function apiCreateThermoLog(payload){
        return apiJson('POST', THERMO_LOGS_API_BASE, payload);
    }
    async function apiUpdateThermoLog(id, payload){
        return apiJson('PUT', `${THERMO_LOGS_API_BASE}/${id}`, payload);
    }
    async function apiBulkDeleteThermoLogs(ids){
        return apiJson('POST', `${THERMO_LOGS_API_BASE}/bulk-delete`, { ids });
    }

    function initPlaceSearchableControl(){
        const control = document.querySelector('[data-place-control="true"]');
        if(!control) return;

        const displayBtn = control.querySelector('[data-place-display="true"]');
        const clearBtn = control.querySelector('[data-place-clear="true"]');
        const nativeSelect = control.querySelector('select[name="place"]');
        const textEl = control.querySelector('[data-place-text]');

        if(!displayBtn || !nativeSelect || !textEl) return;

        let panelEl = null;
        let inputEl = null;
        let listEl = null;

        function syncDisplay(){
            const val = (nativeSelect.value || '').trim();
            const label = val ? (nativeSelect.selectedOptions?.[0]?.textContent || val) : PLACE_PLACEHOLDER_TEXT;
            textEl.textContent = label;
            displayBtn.classList.toggle('has-value', !!val);
            if(clearBtn){
                clearBtn.hidden = !val;
            }
        }

        function closePanel(){
            if(panelEl){
                panelEl.remove();
                panelEl = null;
                inputEl = null;
                listEl = null;
            }
            displayBtn.setAttribute('aria-expanded', 'false');
        }

        function placePanel(){
            if(!panelEl) return;
            const r = displayBtn.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            const desiredWidth = Math.max(260, Math.min(420, r.width));
            let left = Math.max(8, Math.min(vw - desiredWidth - 8, r.left));
            let top = r.bottom + 6;

            // keep below global header if present
            const header = document.querySelector('.main-header');
            if(header){
                const hb = header.getBoundingClientRect().bottom;
                if(top < hb + 8) top = hb + 8;
            }

            // if not enough space below, flip above
            const approxHeight = Math.min(380, 12 + 44 + 260);
            if(top + approxHeight > vh - 8){
                top = Math.max(8, r.top - approxHeight - 6);
            }

            panelEl.style.width = `${desiredWidth}px`;
            panelEl.style.left = `${left}px`;
            panelEl.style.top = `${top}px`;
        }

        function buildList(filterText){
            if(!listEl) return;
            const q = String(filterText || '').trim().toLowerCase();
            const options = [...nativeSelect.querySelectorAll('option')]
                .filter(o => !o.disabled && String(o.value || '').trim() !== '');

            const filtered = !q
                ? options
                : options.filter(o => {
                    const t = (o.textContent || '').toLowerCase();
                    const v = String(o.value || '').toLowerCase();
                    return t.includes(q) || v.includes(q);
                });

            listEl.innerHTML = '';
            if(!filtered.length){
                const empty = document.createElement('div');
                empty.className = 'fk-search-panel__empty';
                empty.textContent = '검색 결과가 없습니다.';
                listEl.appendChild(empty);
                return;
            }

            const current = (nativeSelect.value || '').trim();
            filtered.forEach(opt => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'fk-search-panel__option';
                btn.textContent = opt.textContent || opt.value;
                if(String(opt.value) === current){
                    btn.classList.add('is-selected');
                }
                btn.addEventListener('click', ()=>{
                    nativeSelect.value = opt.value;
                    try{ nativeSelect.dispatchEvent(new Event('change', { bubbles:true })); }catch(_e){}
                    syncDisplay();
                    closePanel();
                });
                listEl.appendChild(btn);
            });
        }

        function openPanel(){
            if(panelEl) return;
            panelEl = document.createElement('div');
            panelEl.className = 'fk-search-panel';
            panelEl.setAttribute('role', 'dialog');
            panelEl.setAttribute('aria-label', '장소 검색');
            panelEl.innerHTML = `
                <div class="fk-search-panel__header">
                    <input class="fk-search-panel__input" type="text" placeholder="장소 검색" autocomplete="off" />
                    <button type="button" class="fk-search-panel__close">닫기</button>
                </div>
                <div class="fk-search-panel__list"></div>
            `;
            document.body.appendChild(panelEl);
            inputEl = panelEl.querySelector('.fk-search-panel__input');
            listEl = panelEl.querySelector('.fk-search-panel__list');
            const closeBtn = panelEl.querySelector('.fk-search-panel__close');
            closeBtn?.addEventListener('click', closePanel);
            inputEl?.addEventListener('input', ()=> buildList(inputEl.value));
            inputEl?.addEventListener('keydown', (e)=>{
                if(e.key === 'Escape'){ e.preventDefault(); closePanel(); displayBtn.focus(); }
            });
            buildList('');
            placePanel();
            displayBtn.setAttribute('aria-expanded', 'true');
            setTimeout(()=>{ try{ inputEl?.focus(); }catch(_e){} }, 0);
        }

        function onDocClick(e){
            if(!panelEl) return;
            if(panelEl.contains(e.target) || displayBtn.contains(e.target) || control.contains(e.target)) return;
            closePanel();
        }

        function onDocKeydown(e){
            if(!panelEl) return;
            if(e.key === 'Escape'){ closePanel(); displayBtn.focus(); }
        }

        displayBtn.addEventListener('click', ()=>{
            if(panelEl) closePanel(); else openPanel();
        });
        clearBtn?.addEventListener('click', (e)=>{
            e.preventDefault();
            // reset to placeholder option
            nativeSelect.selectedIndex = 0;
            try{ nativeSelect.dispatchEvent(new Event('change', { bubbles:true })); }catch(_e){}
            syncDisplay();
            // keep focus on display for keyboard
            displayBtn.focus();
        });
        nativeSelect.addEventListener('change', ()=>{
            // normalize value to allowed base (supports older saved values like "... Lab1")
            const norm = normalizePlace(nativeSelect.value || '');
            if(norm && nativeSelect.value !== norm){
                nativeSelect.value = norm;
            }
            syncDisplay();
        });
        document.addEventListener('click', onDocClick);
        document.addEventListener('keydown', onDocKeydown);
        window.addEventListener('resize', ()=>{ if(panelEl) placePanel(); });
        window.addEventListener('scroll', ()=>{ if(panelEl) placePanel(); }, true);

        // initial paint
        // If the native select isn't set, keep placeholder.
        // If it is set (e.g., browser restores form), sync.
        try{
            const norm = normalizePlace(nativeSelect.value || '');
            if(norm && nativeSelect.value !== norm){ nativeSelect.value = norm; }
        }catch(_e){}
        syncDisplay();
    }

    // Column modal
    const COLUMN_MODAL_ID = 'system-column-modal';
    const COLUMN_FORM_ID = 'system-column-form';
    const COLUMN_BTN_ID = 'system-column-btn';
    const COLUMN_CLOSE_ID = 'system-column-close';
    const COLUMN_APPLY_ID = 'system-column-apply';
    const COLUMN_RESET_ID = 'system-column-reset';
    const COLUMN_SELECTALL_BTN_ID = 'system-column-selectall-btn';

    // Unified Entry modal (Add/Edit + Result Registration)
    const ENTRY_MODAL_ID = 'system-entry-modal';
    const ENTRY_TITLE_ID = 'system-entry-title';
    const ENTRY_SUB_ID = 'system-entry-subtitle';
    const ENTRY_CLOSE_ID = 'system-entry-close';
    const ENTRY_FORM_ID = 'system-entry-form';
    const ENTRY_SAVE_ID = 'system-entry-save';
    // Legacy tab/action ids (removed in single-flow UI) are intentionally unused
    const ADD_BTN_ID = 'system-add-btn';

    // Dispose (불용처리)
    // const DISPOSE_BTN_ID = 'system-dispose-btn'; // removed in UI
    const DISPOSE_MODAL_ID = 'system-dispose-modal';
    const DISPOSE_CLOSE_ID = 'system-dispose-close';
    const DISPOSE_CONFIRM_ID = 'system-dispose-confirm';

    // Delete (삭제처리)
    const DELETE_BTN_ID = 'system-delete-btn';
    const DELETE_MODAL_ID = 'system-delete-modal';
    const DELETE_CLOSE_ID = 'system-delete-close';
    const DELETE_CONFIRM_ID = 'system-delete-confirm';

    // Bulk Edit (일괄변경)
    // const BULK_BTN_ID = 'system-bulk-btn'; // removed in UI
    const BULK_MODAL_ID = 'system-bulk-modal';
    const BULK_CLOSE_ID = 'system-bulk-close';
    const BULK_FORM_ID = 'system-bulk-form';
    const BULK_APPLY_ID = 'system-bulk-apply';

    // (통계 기능 제거: 관련 상수 제거)
    // (unified modal constants declared above)

    // Criteria (기준 설정)
    const CRITERIA_BTN_ID = 'system-criteria-btn';
    const CRITERIA_MODAL_ID = 'system-criteria-modal';
    const CRITERIA_CLOSE_ID = 'system-criteria-close';
    const CRITERIA_APPLY_ID = 'system-criteria-apply';
    const CRITERIA_CANCEL_ID = 'system-criteria-cancel';
    const CRITERIA_TEMP_INPUT_ID = 'criteria-temp-max';
    const CRITERIA_HUMID_INPUT_ID = 'criteria-humid-max';

    // Upload (엑셀 업로드)
    // const UPLOAD_BTN_ID = 'system-upload-btn'; // removed in UI
    const UPLOAD_MODAL_ID = 'system-upload-modal';
    const UPLOAD_CLOSE_ID = 'system-upload-close';
    const UPLOAD_INPUT_ID = 'upload-input';
    const UPLOAD_DROPZONE_ID = 'upload-dropzone';
    const UPLOAD_META_ID = 'upload-meta';
    const UPLOAD_FILE_CHIP_ID = 'upload-file-chip';
    const UPLOAD_TEMPLATE_BTN_ID = 'upload-template-download';
    const UPLOAD_CONFIRM_ID = 'system-upload-confirm';
    // 결과등록 영역 (통합 모달 내부)
    const REGISTER_INPUT_ID = 'register-input';
    const REGISTER_DROPZONE_ID = 'register-dropzone';
    const REGISTER_META_ID = 'register-meta';
    const REGISTER_FILE_CHIP_ID = 'register-file-chip';
    const REGISTER_SAMPLE_BTN_ID = 'register-sample-download';
    const REGISTER_RESULTS_ID = 'register-results';
    const REGISTER_EMPTY_ID = 'register-empty';
    const REGISTER_OK_ID = 'system-register-ok';
    const REGISTER_WARNING_ID = 'register-warning';
    // Primary color for OK dots in criteria decoration
    // Default to CSS var --accent (same as "추가" button); fallback to a close indigo
    let PRIMARY_DOT_COLOR = 'var(--accent, #6366f1)';
    // Cache of last computed analysis summary from the Add (기록 분석) modal
    let ENTRY_LAST_SUMMARY = null; // { temp_max, temp_avg, humid_max, humid_avg, count, period }
    let ENTRY_LAST_DETAILS = null; // { rows: [...], overall: {...} }
    let ENTRY_DATE_MISMATCH = false; // true when basic form date doesn't match analysis period date(s)
    // (통계 기능 제거: 타임라인/차트 관련 유틸 및 렌더러 제거)

    // === Auto result classification based on criteria and 4 measures ===
    function classifyResultFromSummary(summary){
        if(!summary || typeof summary !== 'object') return '적정';
        const tMax = Number(summary.temp_max);
        const tAvg = Number(summary.temp_avg);
        const hMax = Number(summary.humid_max);
        const hAvg = Number(summary.humid_avg);
        const tCrit = (CRITERIA?.tempMax!=null) ? Number(CRITERIA.tempMax) : null;
        const hCrit = (CRITERIA?.humidMax!=null) ? Number(CRITERIA.humidMax) : null;
        const flags = [];
        if(tCrit!=null && Number.isFinite(tMax)) flags.push(tMax > tCrit);
        if(tCrit!=null && Number.isFinite(tAvg)) flags.push(tAvg > tCrit);
        if(hCrit!=null && Number.isFinite(hMax)) flags.push(hMax > hCrit);
        if(hCrit!=null && Number.isFinite(hAvg)) flags.push(hAvg > hCrit);
        if(flags.length === 0) return '적정';
        const vio = flags.filter(Boolean).length;
        if(vio === 0) return '적정';
        if(vio === flags.length) return '경고';
        return '주의';
    }
    function updateResultFieldFromSummary(){
        const form = document.getElementById(ENTRY_FORM_ID); if(!form) return;
        const resEl = form.querySelector('[name="result"]'); if(!resEl) return;
        const value = classifyResultFromSummary(ENTRY_LAST_SUMMARY);
        try { resEl.value = value; } catch(_){}
    }

    // Inline warning helper (shows a red message under 분석 결과 area)
    function showInlineWarning(message){
        const warnEl = document.getElementById(REGISTER_WARNING_ID);
        if(!warnEl) return;
        warnEl.textContent = String(message || '');
        warnEl.hidden = false;
        try { warnEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch(_e){}
    }

    // Update the date-mismatch warning based on current Basic Info date and rendered or cached analysis period
    function updateDateMismatchWarning(){
        const warnEl = document.getElementById(REGISTER_WARNING_ID);
        const form = document.getElementById(ENTRY_FORM_ID);
        const formDate = form?.querySelector('[name="date"]')?.value?.trim?.() || '';
        // Prefer cached overall period (Add mode after parsing), else read from rendered summary row
        let periodText = '';
        try{
            if(ENTRY_LAST_DETAILS && ENTRY_LAST_DETAILS.overall && ENTRY_LAST_DETAILS.overall.period){
                periodText = ENTRY_LAST_DETAILS.overall.period || '';
            } else {
                // Table no longer contains '측정기간' column; without cached period we skip mismatch check
                periodText = '';
            }
        }catch(_){ periodText=''; }
        if(!periodText || !formDate){
            ENTRY_DATE_MISMATCH = false;
            if(warnEl){ warnEl.hidden = true; warnEl.textContent = ''; }
            return;
        }
        const ymdMatches = String(periodText).match(/\d{4}-\d{2}-\d{2}/g) || [];
        if(ymdMatches.length === 0){
            // If we cannot parse any date from period, don't flag mismatch
            ENTRY_DATE_MISMATCH = false;
            if(warnEl){ warnEl.hidden = true; warnEl.textContent = ''; }
            return;
        }
        const uniqueYmd = Array.from(new Set(ymdMatches));
        const matches = uniqueYmd.includes(formDate);
        ENTRY_DATE_MISMATCH = !matches;
        if(warnEl){
            if(ENTRY_DATE_MISMATCH){
                warnEl.textContent = '등록날짜와 측정날짜가 다릅니다.';
                warnEl.hidden = false;
            } else {
                warnEl.textContent = '';
                warnEl.hidden = true;
            }
        }
    }
    // 업로드 템플릿 (온/습도 기록 schema)
    const UPLOAD_HEADERS_KO = [
        '날짜','장소','최고온도(℃)','평균온도(℃)','최고습도(%)','평균습도(%)','결과','비고'
    ];
    const HEADER_KO_TO_KEY = {
        '날짜':'date','장소':'place','최고온도(℃)':'temp_max','평균온도(℃)':'temp_avg','최고습도(%)':'humid_max','평균습도(%)':'humid_avg','결과':'result','비고':'note'
    };
    const ENUM_SETS = { };
    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
    function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }

    // Data + State
    const BASE_VISIBLE_COLUMNS = [
        'date','place','temp_max','temp_avg','humid_max','humid_avg','result','note'
    ];
    const COLUMN_ORDER = [
        'date','place','temp_max','temp_avg','humid_max','humid_avg','result','note'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '기록', columns: ['date','place','temp_max','temp_avg','humid_max','humid_avg','result','note'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        date:{label:'날짜',group:'기록'},
        place:{label:'장소',group:'기록'},
        temp_max:{label:'최고온도(℃)',group:'기록'},
        temp_avg:{label:'평균온도(℃)',group:'기록'},
        humid_max:{label:'최고습도(%)',group:'기록'},
        humid_avg:{label:'평균습도(%)',group:'기록'},
        result:{label:'결과',group:'기록'},
        note:{label:'비고',group:'기록'}
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
        apiAvailable: false,
    columnFilters: {} // { col: value | [values...] } (조건 필터 기능 제거 예정 - 빈 유지)
    };

    // Persisted 기준 값 (in-memory cache + localStorage)
    let CRITERIA = { tempMax: null, humidMax: null };
    function loadCriteria(){
        try{
            const raw = localStorage.getItem('thermo_criteria');
            if(!raw){ CRITERIA = { tempMax: null, humidMax: null }; return; }
            const obj = JSON.parse(raw);
            const t = Number(obj?.tempMax);
            const h = Number(obj?.humidMax);
            CRITERIA = {
                tempMax: Number.isFinite(t) ? t : null,
                humidMax: Number.isFinite(h) ? h : null
            };
        }catch(_e){ CRITERIA = { tempMax: null, humidMax: null }; }
    }
    function saveCriteria(obj){
        const t = Number(obj?.tempMax);
        const h = Number(obj?.humidMax);
        CRITERIA = {
            tempMax: Number.isFinite(t) ? t : null,
            humidMax: Number.isFinite(h) ? h : null
        };
        try{ localStorage.setItem('thermo_criteria', JSON.stringify(CRITERIA)); }catch(_e){}
    }
    function populateCriteriaForm(){
        const tEl = document.getElementById(CRITERIA_TEMP_INPUT_ID);
        const hEl = document.getElementById(CRITERIA_HUMID_INPUT_ID);
        if(tEl){ tEl.value = (CRITERIA.tempMax==null? '': String(CRITERIA.tempMax)); }
        if(hEl){ hEl.value = (CRITERIA.humidMax==null? '': String(CRITERIA.humidMax)); }
    }

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;

    // 온/습도 기록 페이지: 샘플 데이터 5개 제공
    function mockData(count=5){
        // Use older dates to avoid accidental duplicate conflicts during first-use demos
        const rows = [
            { id:1, date:'2025-09-01', place:'퓨처센터(5층) Lab1', temp_max: '27.3', temp_avg:'24.8', humid_max:'61', humid_avg:'55', result:'적정', note:'' },
            { id:2, date:'2025-09-01', place:'퓨처센터(6층) Lab2', temp_max: '28.1', temp_avg:'25.2', humid_max:'65', humid_avg:'57', result:'주의', note:'온도 상향' },
            { id:3, date:'2025-09-01', place:'을지트윈타워(15층) Lab3', temp_max: '26.0', temp_avg:'23.9', humid_max:'58', humid_avg:'52', result:'적정', note:'' },
            { id:4, date:'2025-09-01', place:'재해복구센터(4층) Lab4', temp_max: '29.4', temp_avg:'26.7', humid_max:'68', humid_avg:'60', result:'경고', note:'습도 상향' },
            { id:5, date:'2025-09-02', place:'퓨처센터(5층) Lab1', temp_max: '27.9', temp_avg:'25.1', humid_max:'63', humid_avg:'56', result:'적정', note:'' }
        ];
        return rows.slice(0, Math.max(0, count|0));
    }

    async function initData(){
        // API 우선 로드, 실패 시 mock 데이터로 fallback
        try{
            const res = await apiListThermoLogs();
            const items = res?.items;
            if(Array.isArray(items)){
                state.data = items;
                // fallback용 nextId 계산
                const maxId = items.reduce((m, r)=>{
                    const n = parseInt(r?.id, 10);
                    return Number.isFinite(n) ? Math.max(m, n) : m;
                }, 0);
                state.nextId = maxId + 1;
                state.apiAvailable = true;
                applyFilter();
                return;
            }
        }catch(_e){
            // ignore
        }
        state.apiAvailable = false;
        state.data = mockData(5);
        state.nextId = state.data.length + 1;
        applyFilter();
    }

    // Check for duplicate record by (date, place). Place is normalized to the base location names.
    // excludeId: if provided, the row with this id is ignored (useful for Edit mode).
    function hasDuplicate(dateStr, placeStr, excludeId){
        const date = String(dateStr || '').trim();
        const placeNorm = normalizePlace(placeStr || '');
        if(!date || !placeNorm) return false;
        return state.data.some(r => {
            if(excludeId != null && r.id === excludeId) return false;
            const rDate = String(r.date || '').trim();
            const rPlaceNorm = normalizePlace(r.place || '');
            return rDate === date && rPlaceNorm === placeNorm;
        });
    }
    // Return the actual conflicting row if exists, else null
    function findDuplicate(dateStr, placeStr, excludeId){
        const date = String(dateStr || '').trim();
        const placeNorm = normalizePlace(placeStr || '');
        if(!date || !placeNorm) return null;
        return state.data.find(r => {
            if(excludeId != null && r.id === excludeId) return false;
            const rDate = String(r.date || '').trim();
            const rPlaceNorm = normalizePlace(r.place || '');
            return rDate === date && rPlaceNorm === placeNorm;
        }) || null;
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
                    if(titleEl) titleEl.textContent = '온/습도 기록이 없습니다.';
                    if(descEl) descEl.textContent = "우측 상단 '추가' 버튼을 눌러 첫 기록을 등록하세요.";
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
        // helper: decorate numeric temp/humid cells with a dot based on criteria
        function criteriaDotFor(col, value){
            // Only apply to defined numeric columns
            const isTemp = (col === 'temp_max' || col === 'temp_avg');
            const isHumid = (col === 'humid_max' || col === 'humid_avg');
            if(!isTemp && !isHumid) return '';
            // Choose threshold by type
            const thr = isTemp ? (CRITERIA?.tempMax ?? null) : (CRITERIA?.humidMax ?? null);
            if(thr == null) return '';
            const num = parseFloat(String(value).replace(/[^0-9.+-]/g,''));
            if(!Number.isFinite(num)) return '';
            const exceed = num > thr;
            const color = exceed ? '#e15759' : (PRIMARY_DOT_COLOR || '#6366f1');
            return `<span class="criteria-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${color};margin-right:6px;vertical-align:middle;"></span>`;
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
                    if(typeof rawVal==='string') rawVal = rawVal;
                    // 숫자 컬럼 포맷 유지 (문자열로 보관하되 빈 값은 '-')
                    const displayVal = (rawVal==null || String(rawVal).trim()==='') ? '-' : rawVal;
                    let cellValue = highlight(displayVal, col);
                    // 결과 컬럼 배지 스타일
                    if(col === 'result'){
                        const v = String(displayVal);
                        const map = { '적정':'ws-run', '주의':'ws-idle', '경고':'ws-wait' };
                        const cls = map[v] || 'ws-run';
                        cellValue = `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${highlight(displayVal, col)}</span></span>`;
                    } else if(['temp_max','temp_avg','humid_max','humid_avg'].includes(col)){
                        // Prefix with criteria dot when threshold is set
                        const dot = criteriaDotFor(col, displayVal);
                        if(dot){ cellValue = `${dot}${cellValue}`; }
                    }
                    return `<td data-col="${col}" data-label="${label}" class="${tdClass}">${cellValue}</td>`;
                }).join('')
                + `<td data-col="actions" data-label="관리" class="system-actions">`
                + `<button type="button" class="action-btn" data-action="register-result" data-id="${row.id}" title="분석" aria-label="분석">`
                + `<img src="/static/image/svg/datacenter/free-icon-chart.svg" alt="분석" class="action-icon">`
                + `</button>`
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
                // 이전 저장값이 구 스키마면 기본값으로 교체
                const legacyKeys = ['business_status','business_name','vendor','model','serial','place','location','system_height','system_owner_dept','system_owner','service_owner_dept','service_owner'];
                const looksLegacy = [...state.visibleCols].some(k=> legacyKeys.includes(k));
                if(looksLegacy){ state.visibleCols = new Set(BASE_VISIBLE_COLUMNS); }
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
    const MIN_COLS = 5;
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

    function buildRecordForm(targetFormId, row){
        const form = document.getElementById(targetFormId); if(!form) return;
        form.innerHTML='';
        const groups = [
            { title:'기록', cols:['date','place','temp_max','temp_avg','humid_max','humid_avg','result','note'] }
        ];
        groups.forEach(g=>{
            const section = document.createElement('div'); section.className='form-section';
            section.innerHTML = `<div class="section-header"><h4>${g.title}</h4></div>`;
            const grid = document.createElement('div'); grid.className='form-grid';
            g.cols.forEach(c=>{ if(!COLUMN_META[c]) return; const wrap=document.createElement('div');
                wrap.className = 'form-row';
                const labelText = COLUMN_META[c]?.label||c;
                const val = row ? row[c] : '';
                wrap.innerHTML=`<label>${labelText}</label>${generateFieldInput(c,val)}`; grid.appendChild(wrap); });
            section.appendChild(grid); form.appendChild(section);
        });
    }

    function generateFieldInput(col,value=''){
        // 비즈니스
        if(['date','place','result','note'].includes(col)){
            return `<input name="${col}" class="form-input" value="${value??''}">`;
        }
        if(['temp_max','temp_avg','humid_max','humid_avg'].includes(col)){
            const v = String(value??'');
            return `<input name="${col}" class="form-input" inputmode="decimal" placeholder="숫자" value="${v}">`;
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

    async function addRow(data){
        // API가 가능하면 서버(JSON 파일)에 먼저 저장
        if(state.apiAvailable){
            try{
                const res = await apiCreateThermoLog(data);
                if(res?.success && res.item){
                    state.data.unshift(res.item);
                    applyFilter();
                    return res.item;
                }
            }catch(err){
                showMessage(err?.message || '온/습도 기록 등록 중 오류가 발생했습니다.', '오류');
                // API 저장 실패 시 로컬 저장으로 떨어지지 않도록(중복/불일치 방지) 여기서 중단
                return null;
            }
        }
        // fallback (mock/local)
        data.id = state.nextId++;
        state.data.unshift(data);
        applyFilter();
        return data;
    }

    async function updateRow(index, data){
        const existing = state.data[index];
        if(!existing) return null;

        if(state.apiAvailable && existing.id != null){
            try{
                const merged = { ...existing, ...data };
                const res = await apiUpdateThermoLog(existing.id, merged);
                if(res?.success && res.item){
                    state.data[index] = { ...existing, ...res.item };
                    applyFilter();
                    return res.item;
                }
            }catch(err){
                showMessage(err?.message || '온/습도 기록 수정 중 오류가 발생했습니다.', '오류');
                return null;
            }
        }

        state.data[index] = { ...existing, ...data };
        applyFilter();
        return state.data[index];
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
    const filename = `thermo_logs_${yyyy}${mm}${dd}.csv`;
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
                    setEntryMode('edit', realIndex);
                    // fill existing single-flow form
                    const form = document.getElementById(ENTRY_FORM_ID);
                    if(form){
                        ['date','place','temp_max','temp_avg','humid_max','humid_avg','result','note'].forEach(n=>{
                            const el = form.querySelector(`[name="${n}"]`);
                            if(!el) return;
                            if(n==='place' && el.tagName==='SELECT'){
                                el.value = normalizePlace(row[n] ?? '');
                            } else {
                                el.value = row[n] ?? '';
                            }
                        });
                        // Sync searchable place display
                        try{
                            const placeEl = form.querySelector('[name="place"]');
                            placeEl?.dispatchEvent(new Event('change', { bubbles:true }));
                        }catch(_e){}
                    }
                    // clear any previous file selection ui
                    const meta = document.getElementById(REGISTER_META_ID); if(meta) meta.hidden = true;
                    const chip = document.getElementById(REGISTER_FILE_CHIP_ID); if(chip) chip.textContent = '';
                    const input = document.getElementById(REGISTER_INPUT_ID); if(input) input.value = '';
                    openModal(ENTRY_MODAL_ID);
                } else if(action==='register-result'){
                    // 분석 모달: 결과 리뷰 모드로 열기 (파일등록 숨김)
                    setEntryMode('edit', realIndex);
                    const form = document.getElementById(ENTRY_FORM_ID);
                    if(form){
                        form.reset();
                        const dateEl = form.querySelector('[name="date"]'); if(dateEl) dateEl.value = row.date || '';
                        const placeEl = form.querySelector('[name="place"]');
                        if(placeEl){
                            // place is a select: preselect closest allowed option
                            placeEl.value = normalizePlace(row.place || '');
                            try{ placeEl.dispatchEvent(new Event('change', { bubbles:true })); }catch(_e){}
                        }
                        const resultEl = form.querySelector('[name="result"]'); if(resultEl) resultEl.value = row.result || '';
                        const noteEl = form.querySelector('[name="note"]'); if(noteEl) noteEl.value = row.note || '';
                        // 결과 입력 필드는 제거되었으므로 추가 초기화는 불필요
                    }
                    // reset file UI
                    const meta = document.getElementById(REGISTER_META_ID); if(meta) meta.hidden = true;
                    const chip = document.getElementById(REGISTER_FILE_CHIP_ID); if(chip) chip.textContent = '';
                    const input = document.getElementById(REGISTER_INPUT_ID); if(input) input.value = '';
                    const results = document.getElementById(REGISTER_RESULTS_ID); if(results) results.innerHTML = '';
                    const empty = document.getElementById(REGISTER_EMPTY_ID); if(empty) empty.hidden = true;
                    // Render review table: full details if available, else summary fallback
                    (function renderReview(){
                        const container = document.getElementById(REGISTER_RESULTS_ID); if(!container) return;
                        const warnEl = document.getElementById(REGISTER_WARNING_ID);
                        const fmt = (v)=>{
                            const n = parseFloat(String(v).replace(/[^0-9.+-]/g,''));
                            return Number.isFinite(n) ? n.toFixed(1) : '-';
                        };
                        const details = row.analysis_rows;
                        const overall = row.analysis_overall;
                        const table = document.createElement('table');
                        table.className = 'system-data-table server-data-table';
                        if(Array.isArray(details) && details.length){
                            const deviceCount = details.length;
                            table.innerHTML = `
                                <thead>
                                    <tr>
                                        <th>온/습도계</th>
                                        <th>측정횟수</th>
                                        <th>최고온도(℃)</th>
                                        <th>평균온도(℃)</th>
                                        <th>최고습도(%)</th>
                                        <th>평균습도(%)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${details.map(r=> `
                                        <tr>
                                            <td>${escapeHTML(r.name ?? '')}</td>
                                            <td>${r.count ?? '-'}</td>
                                            <td>${fmt(r.tMax)}</td>
                                            <td>${fmt(r.tAvg)}</td>
                                            <td>${fmt(r.hMax)}</td>
                                            <td>${fmt(r.hAvg)}</td>
                                        </tr>
                                    `).join('')}
                                    <tr class="table-summary-row">
                                        <td><strong>${deviceCount} 대</strong></td>
                                        <td><strong>${overall?.count ?? '-'}</strong></td>
                                        <td><strong>${fmt(overall?.tMax)}</strong></td>
                                        <td><strong>${fmt(overall?.tAvg)}</strong></td>
                                        <td><strong>${fmt(overall?.hMax)}</strong></td>
                                        <td><strong>${fmt(overall?.hAvg)}</strong></td>
                                    </tr>
                                </tbody>`;
                        } else {
                            // No per-device details; treat as 1 device row summary
                            table.innerHTML = `
                                <thead>
                                    <tr>
                                        <th>온/습도계</th>
                                        <th>측정횟수</th>
                                        <th>최고온도(℃)</th>
                                        <th>평균온도(℃)</th>
                                        <th>최고습도(%)</th>
                                        <th>평균습도(%)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr class="table-summary-row">
                                        <td><strong>1 대</strong></td>
                                        <td><strong>${overall?.count ?? '-'}</strong></td>
                                        <td><strong>${fmt(row.temp_max)}</strong></td>
                                        <td><strong>${fmt(row.temp_avg)}</strong></td>
                                        <td><strong>${fmt(row.humid_max)}</strong></td>
                                        <td><strong>${fmt(row.humid_avg)}</strong></td>
                                    </tr>
                                </tbody>`;
                        }
                        container.appendChild(table);
                        // Show/update mismatch warning in review mode (informational)
                        try{ ENTRY_LAST_DETAILS = { rows: details || [], overall: overall || null }; }catch(_){}
                        updateDateMismatchWarning();
                    })();
                    openModal(ENTRY_MODAL_ID);
                    initEntryDatePicker();
                    // no focus on dropzone in review mode (file section hidden)
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
        // 기준 설정 모달
        document.getElementById(CRITERIA_BTN_ID)?.addEventListener('click', ()=>{
            populateCriteriaForm();
            openModal(CRITERIA_MODAL_ID);
        });
        document.getElementById(CRITERIA_CLOSE_ID)?.addEventListener('click', ()=> closeModal(CRITERIA_MODAL_ID));
        document.getElementById(CRITERIA_APPLY_ID)?.addEventListener('click', ()=>{
            const tEl = document.getElementById(CRITERIA_TEMP_INPUT_ID);
            const hEl = document.getElementById(CRITERIA_HUMID_INPUT_ID);
            const tRaw = (tEl?.value ?? '').trim();
            const hRaw = (hEl?.value ?? '').trim();
            // Empty means clear
            const tVal = tRaw === '' ? null : Number(tRaw);
            const hVal = hRaw === '' ? null : Number(hRaw);
            if(hVal != null){
                if(!Number.isFinite(hVal) || hVal < 0 || hVal > 100){ showMessage('최고습도(%)는 0~100 사이의 숫자로 입력하세요.', '입력 오류'); return; }
            }
            if(tVal != null){
                if(!Number.isFinite(tVal)){ showMessage('최고온도(℃)는 숫자로 입력하세요.', '입력 오류'); return; }
            }
            saveCriteria({ tempMax: tVal, humidMax: hVal });
            closeModal(CRITERIA_MODAL_ID);
            // Lightweight feedback
            showMessage('기준값이 저장되었습니다.', '완료');
            // Re-render table to reflect dots based on new criteria
            render();
            // If entry modal is open with analysis, recompute auto result
            try{ updateResultFieldFromSummary(); }catch(_){ }
        });
        // Unified entry modal wiring (no tabs)
        function setEntryMode(mode, index){
            const titleEl = document.getElementById(ENTRY_TITLE_ID);
            const subEl = document.getElementById(ENTRY_SUB_ID);
            const saveBtn = document.getElementById(ENTRY_SAVE_ID);
            const fileSection = document.getElementById('register-file-section');
            const dlBtn = document.getElementById('register-results-download');
            const warnEl = document.getElementById(REGISTER_WARNING_ID);
            // Always reset warning visibility/state on mode switch
            if(warnEl){ warnEl.hidden = true; warnEl.textContent = ''; }
            ENTRY_DATE_MISMATCH = false;
            // Make result field read-only (disabled) and hint user
            const formEl = document.getElementById(ENTRY_FORM_ID);
            const resEl = formEl?.querySelector('[name="result"]');
            if(resEl){ resEl.disabled = true; resEl.setAttribute('aria-readonly','true'); resEl.title = '분석값으로 자동 결정됩니다.'; }
            if(mode==='edit'){
                titleEl && (titleEl.textContent = '결과 리뷰');
                subEl && (subEl.textContent = '선택한 온/습도 기록을 검토합니다.');
                saveBtn && saveBtn.setAttribute('data-mode','edit');
                if(typeof index==='number' && !isNaN(index)) saveBtn?.setAttribute('data-index', String(index));
                saveBtn && (saveBtn.textContent = '저장');
                // 분석 모달(행에서 진입): 파일 등록 섹션 숨김
                if(fileSection) fileSection.hidden = true;
                if(dlBtn){ dlBtn.hidden = false; dlBtn.disabled = false; } // 리뷰 모드: 보이기 + 활성화
            } else {
                // 추가 모달: 기록 분석
                titleEl && (titleEl.textContent = '기록 분석');
                subEl && (subEl.textContent = '기본 정보를 입력하고 파일을 업로드하여 기록을 분석하세요.');
                saveBtn && saveBtn.setAttribute('data-mode','add');
                saveBtn && saveBtn.removeAttribute('data-index');
                saveBtn && (saveBtn.textContent = '등록');
                // 추가 모달: 파일 등록 섹션 표시
                if(fileSection) fileSection.hidden = false;
                if(dlBtn){ dlBtn.hidden = true; dlBtn.disabled = true; } // 추가 모달: 아이콘 숨김
            }
        }
        window.setEntryMode = setEntryMode;
        document.getElementById(ADD_BTN_ID)?.addEventListener('click', ()=> {
            setEntryMode('add');
            const form = document.getElementById(ENTRY_FORM_ID);
            if(form){
                form.reset();
                // Sync searchable place display back to placeholder
                try{
                    const placeEl = form.querySelector('[name="place"]');
                    placeEl?.dispatchEvent(new Event('change', { bubbles:true }));
                }catch(_e){}
            }
            // clear file UI
            ENTRY_LAST_SUMMARY = null; // clear any previous analysis cache
            ENTRY_LAST_DETAILS = null;
            const meta = document.getElementById(REGISTER_META_ID); if(meta) meta.hidden = true;
            const chip = document.getElementById(REGISTER_FILE_CHIP_ID); if(chip) chip.textContent = '';
            const input = document.getElementById(REGISTER_INPUT_ID); if(input) input.value = '';
            const results = document.getElementById(REGISTER_RESULTS_ID); if(results) results.innerHTML = '';
            const empty = document.getElementById(REGISTER_EMPTY_ID); if(empty) empty.hidden = false;
            // ensure any previous single-file lock is released for a fresh Add session
            try { if(typeof window.unlockRegisterFileUI === 'function'){ window.unlockRegisterFileUI(); } } catch(_e){}
            openModal(ENTRY_MODAL_ID);
            // init date picker for date input
            initEntryDatePicker();
        });
        document.getElementById(ENTRY_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ENTRY_MODAL_ID));
        document.getElementById(ENTRY_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(ENTRY_FORM_ID); if(!form) return;
            if(!form.checkValidity()){ form.reportValidity(); return; }
            const data = collectForm(form);
            const saveBtn = document.getElementById(ENTRY_SAVE_ID);
            const mode = saveBtn?.getAttribute('data-mode')||'add';
            // Prevent double-submit
            if(saveBtn){
                if(saveBtn.disabled) return;
                saveBtn.disabled = true;
            }
            // Re-evaluate mismatch just before save to avoid stale state
            updateDateMismatchWarning();
            // Determine presence of period dates and actual mismatch for final gate
            const formDate = form?.querySelector('[name="date"]')?.value?.trim?.() || '';
            let periodText = '';
            try{
                if(ENTRY_LAST_DETAILS?.overall?.period){
                    periodText = ENTRY_LAST_DETAILS.overall.period || '';
                } else {
                    const summaryRow = document.querySelector(`#${REGISTER_RESULTS_ID} tbody tr.table-summary-row`);
                    const tds = summaryRow ? summaryRow.querySelectorAll('td') : null;
                    if(tds && tds[1]){ periodText = tds[1].textContent.trim(); }
                }
            }catch(_){ periodText=''; }
            const ymdMatches = String(periodText).match(/\d{4}-\d{2}-\d{2}/g) || [];
            const hasPeriodDate = ymdMatches.length > 0;
            const isMismatch = !!(formDate && hasPeriodDate && ENTRY_DATE_MISMATCH);
            if(isMismatch){
                showInlineWarning('등록날짜와 측정날짜가 다릅니다. 날짜를 맞춰주세요.');
                if(saveBtn) saveBtn.disabled = false;
                return;
            }
            // Duplicate guard: prevent same (date, place) pair more than once
            const formPlace = String(data.place || '').trim();
            if(mode==='edit'){
                const idx = parseInt(saveBtn?.getAttribute('data-index')||'-1',10);
                const currentId = (idx>=0 && state.data[idx]) ? state.data[idx].id : null;
                const dup = findDuplicate(formDate, formPlace, currentId);
                if(dup){
                    const existingPlace = normalizePlace(dup.place || '') || (dup.place || '');
                    showInlineWarning(`해당 날짜와 장소의 기록이 이미 존재합니다. 기존: ${dup.date} / ${existingPlace}`);
                    if(saveBtn) saveBtn.disabled = false;
                    return;
                }
            } else {
                const dup = findDuplicate(formDate, formPlace, null);
                if(dup){
                    const existingPlace = normalizePlace(dup.place || '') || (dup.place || '');
                    showInlineWarning(`해당 날짜와 장소의 기록이 이미 존재합니다. 기존: ${dup.date} / ${existingPlace}`);
                    if(saveBtn) saveBtn.disabled = false;
                    return;
                }
            }
            if(mode==='edit'){
                const idx = parseInt(saveBtn?.getAttribute('data-index')||'-1',10);
                const updated = await updateRow(idx, data);
                if(!updated){
                    if(saveBtn) saveBtn.disabled = false;
                    return;
                }
            } else {
                // Merge analysis summary from uploaded file (if available)
                if(ENTRY_LAST_SUMMARY && typeof ENTRY_LAST_SUMMARY === 'object'){
                    const fmt1 = (v)=> (v==null || !Number.isFinite(v)) ? '' : String(Number(v).toFixed(1));
                    data.temp_max = fmt1(ENTRY_LAST_SUMMARY.temp_max);
                    data.temp_avg = fmt1(ENTRY_LAST_SUMMARY.temp_avg);
                    data.humid_max = fmt1(ENTRY_LAST_SUMMARY.humid_max);
                    data.humid_avg = fmt1(ENTRY_LAST_SUMMARY.humid_avg);
                    // Auto result
                    data.result = classifyResultFromSummary(ENTRY_LAST_SUMMARY);
                    // persist detailed analysis for review mode later
                    if(ENTRY_LAST_DETAILS && typeof ENTRY_LAST_DETAILS === 'object'){
                        try{
                            data.analysis_rows = ENTRY_LAST_DETAILS.rows || [];
                            data.analysis_overall = ENTRY_LAST_DETAILS.overall || null;
                        }catch(_){}
                    }
                }
                const created = await addRow(data);
                if(!created){
                    if(saveBtn) saveBtn.disabled = false;
                    return;
                }
                // Clear cache after save
                ENTRY_LAST_SUMMARY = null;
                ENTRY_LAST_DETAILS = null;
            }
            form.reset();
            // Sync searchable place display back to placeholder
            try{
                const placeEl = form.querySelector('[name="place"]');
                placeEl?.dispatchEvent(new Event('change', { bubbles:true }));
            }catch(_e){}
            // Reset warning state upon successful save
            ENTRY_DATE_MISMATCH = false;
            const warnEl = document.getElementById(REGISTER_WARNING_ID);
            if(warnEl){ warnEl.hidden = true; warnEl.textContent = ''; }
            closeModal(ENTRY_MODAL_ID);
            if(saveBtn) saveBtn.disabled = false;
        });
        // unified modal handlers are wired above
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
            // 결과등록 (통합 모달 내부)
        (function(){
            const dz = document.getElementById(REGISTER_DROPZONE_ID);
            const input = document.getElementById(REGISTER_INPUT_ID);
            const meta = document.getElementById(REGISTER_META_ID);
            const chip = document.getElementById(REGISTER_FILE_CHIP_ID);
            const container = document.getElementById(REGISTER_RESULTS_ID);
            const empty = document.getElementById(REGISTER_EMPTY_ID);
            const sampleBtn = document.getElementById(REGISTER_SAMPLE_BTN_ID);
            const dlBtn = document.getElementById('register-results-download');
            // single-file lock state within add modal lifecycle
            let registerFileLocked = false;
            function lockFileUI(){
                registerFileLocked = true;
                if(dz){ dz.classList.add('dz-locked'); dz.setAttribute('aria-disabled','true'); dz.title = '파일은 1개만 등록할 수 있습니다.'; }
                if(input){ input.disabled = true; }
            }
            function unlockFileUI(){
                registerFileLocked = false;
                if(dz){ dz.classList.remove('dz-locked'); dz.removeAttribute('aria-disabled'); dz.removeAttribute('title'); }
                if(input){ input.disabled = false; }
            }
            // expose unlock so outer Add button handler can reset between sessions
            try { window.unlockRegisterFileUI = unlockFileUI; } catch(_e){}
            function setFile(f){
                if(!f){ if(meta) meta.hidden=true; if(chip) chip.textContent=''; return; }
                const name = (f?.name||'').toLowerCase();
                const okExt = name.endsWith('.xls') || name.endsWith('.xlsx');
                const okSize = (f?.size||0) <= 10*1024*1024;
                if(!okExt || !okSize){ showMessage('지원하지 않는 파일이거나 10MB를 초과합니다. .xls/.xlsx만 가능합니다.', '업로드 오류'); return; }
                const sizeKb = Math.max(1, Math.round(f.size/1024));
                if(chip) chip.textContent = `${f.name} (${sizeKb} KB)`;
                if(meta) meta.hidden = false;
                parseExcelFile(f);
            }
            dz?.addEventListener('click', ()=>{ if(registerFileLocked){ return; } input?.click(); });
            dz?.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); if(registerFileLocked){ return; } input?.click(); }});
            dz?.addEventListener('dragover', (e)=>{ if(registerFileLocked){ e.preventDefault(); return; } e.preventDefault(); dz.classList.add('dragover'); });
            dz?.addEventListener('dragleave', ()=> dz.classList.remove('dragover'));
            dz?.addEventListener('drop', (e)=>{ e.preventDefault(); dz.classList.remove('dragover'); if(registerFileLocked){ return; } const f = e.dataTransfer?.files?.[0]; if(f){ input.files = e.dataTransfer.files; setFile(f); } });
            input?.addEventListener('change', ()=>{ if(registerFileLocked){ input.value=''; return; } const f = input.files?.[0]; setFile(f); });

            async function parseExcelFile(f){
                try{ await ensureXLSX(); }catch(_e){ showMessage('엑셀 라이브러리를 불러오지 못했습니다.', '오류'); return; }
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
                        const expected = ['측정 일시','업무 이름','구분','값','비고'];
                        const looksExpected = expected.every((h,i)=> header[i]===h);
                        if(!looksExpected && header.length < 4){ showMessage('알 수 없는 양식입니다. 샘플 파일을 참고해 주세요.', '업로드 오류'); return; }
                        const recs = [];
                        function excelSerialToDate(n){
                            // Excel serial number (days since 1899-12-30), includes fractional day for time.
                            // Treat the serial as LOCAL time (not UTC) to avoid +9h shift in KST.
                            const ms = Math.round((Number(n) - 25569) * 86400 * 1000);
                            const utc = new Date(ms);
                            // Adjust by timezone offset so that 00:00 remains 00:00 in local time
                            const localMs = ms + utc.getTimezoneOffset() * 60000;
                            return new Date(localMs);
                        }
                        function formatYmdHm(d){
                            if(!(d instanceof Date) || isNaN(d)) return '';
                            const pad = (x)=> String(x).padStart(2,'0');
                            const y = d.getFullYear();
                            const m = pad(d.getMonth()+1);
                            const dd = pad(d.getDate());
                            const hh = pad(d.getHours());
                            const mm = pad(d.getMinutes());
                            return `${y}-${m}-${dd} ${hh}:${mm}`;
                        }
                        function normalizeWhen(v){
                            if(v==null) return '';
                            // If already a Date object
                            if(v instanceof Date && !isNaN(v)) return formatYmdHm(v);
                            // If numeric (serial) or numeric-looking string
                            const num = (typeof v==='number') ? v : (String(v).trim().match(/^\d+(?:\.\d+)?$/) ? Number(v) : NaN);
                            if(Number.isFinite(num)){
                                const d = excelSerialToDate(num);
                                return formatYmdHm(d);
                            }
                            // Try parse as string date
                            const s = String(v).trim();
                            const d2 = new Date(s);
                            if(!isNaN(d2)) return formatYmdHm(d2);
                            return s; // fallback (rendered as-is)
                        }
                        for(let r=1; r<rows.length; r++){
                            const row = rows[r]; if(!row || row.length===0) continue;
                            const whenRaw = rows[r][0];
                            const when = normalizeWhen(whenRaw);
                            const name = String(row[1]??'').trim();
                            const kind = String(row[2]??'').trim();
                            const valRaw = String(row[3]??'').trim();
                            const note = String(row[4]??'').trim();
                            if(!when || !name || !kind || !valRaw) continue;
                            const value = parseFloat(valRaw.replace(/[^0-9.+-]/g,''));
                            if(!Number.isFinite(value)) continue;
                            recs.push({ when, name, kind, value, note });
                        }
                        applyParsedResultsToForm(recs);
                    }catch(e){ console.error(e); showMessage('엑셀 파싱 중 오류가 발생했습니다.', '업로드 오류'); }
                };
                reader.onerror = ()=> showMessage('파일을 읽는 중 오류가 발생했습니다.', '업로드 오류');
                reader.readAsArrayBuffer(f);
            }
            // Simple Chart.js loader (local to entry modal)
            const CHARTJS_SRC = '/static/vendor/chartjs/chart.umd.min.4.4.3.js';
            async function ensureChart(){ if(window.Chart) return; await loadScript(CHARTJS_SRC); }
            let registerStatsChart = null;
            function destroyRegisterChart(){ try{ registerStatsChart?.destroy?.(); }catch(_e){} registerStatsChart = null; }
            function hours24(){ return Array.from({length:24}, (_,i)=> i); }
            function computeHourlySeries(recs, mode){
                const buckets = new Map(); // hour -> [values]
                recs.forEach(r=>{
                    const m = String(r.when||'').match(/\s(\d{2}):(\d{2})/);
                    if(!m) return;
                    const hour = parseInt(m[1],10);
                    if(!Number.isFinite(hour)) return;
                    const isTemp = String(r.kind||'').includes('온도');
                    const isHumid = String(r.kind||'').includes('습도');
                    if((mode==='temp' && !isTemp) || (mode==='humid' && !isHumid)) return;
                    const v = parseFloat(r.value);
                    if(!Number.isFinite(v)) return;
                    if(!buckets.has(hour)) buckets.set(hour, []);
                    buckets.get(hour).push(v);
                });
                const hours = hours24();
                const seriesAvg = hours.map(h=>{
                    const arr = buckets.get(h) || [];
                    if(!arr.length) return null;
                    const sum = arr.reduce((a,b)=> a+b, 0);
                    return sum/arr.length;
                });
                const seriesMax = hours.map(h=>{
                    const arr = buckets.get(h) || [];
                    if(!arr.length) return null;
                    return Math.max(...arr);
                });
                return { hours, seriesAvg, seriesMax };
            }
            function getRegisterBaseDate(){
                // Prefer the Basic Info date input; fallback to overall period's first date
                const form = document.getElementById(ENTRY_FORM_ID);
                const v = form?.querySelector('[name="date"]')?.value?.trim?.();
                if(v) return v;
                try{
                    const p = ENTRY_LAST_DETAILS?.overall?.period || '';
                    const m = p.match(/\d{4}-\d{2}-\d{2}/);
                    if(m) return m[0];
                }catch(_){}
                return '';
            }
            async function renderRegisterStats(recs, mode){
                const wrap = document.getElementById('register-stats'); if(!wrap) return;
                const divider = document.getElementById('register-stats-divider');
                if(!recs || !recs.length){
                    wrap.hidden = true; if(divider) divider.hidden = true; destroyRegisterChart(); return;
                }
                wrap.hidden = false; if(divider) divider.hidden = false;
                await ensureChart();
                destroyRegisterChart();
                const { hours, seriesAvg, seriesMax } = computeHourlySeries(recs, mode);
                const labels = hours.map(h=> String(h).padStart(2,'0'));
                const ctx = document.getElementById('register-stats-canvas'); if(!ctx) return;
                const isHumid = mode === 'humid';
                // Choose data series and cosmetics
                // Apply same behavior for humidity as temperature: use hourly maxima for bars
                const dataSeries = seriesMax; // both temp & humid use 최고값
                const barColorDefault = 'rgba(99,102,241,0.5)';
                const barColorAlert = 'rgba(244,63,94,0.40)'; // rose-500 with alpha
                const barColors = dataSeries.map((v)=>{
                    // Color red when exceeding the relevant criterion for current mode
                    const crit = isHumid
                        ? ((CRITERIA?.humidMax!=null) ? Number(CRITERIA.humidMax) : null)
                        : ((CRITERIA?.tempMax!=null) ? Number(CRITERIA.tempMax) : null);
                    if(crit!=null && Number.isFinite(v) && v > crit) return barColorAlert;
                    return barColorDefault;
                });
                const baseDate = getRegisterBaseDate();
                registerStatsChart = new window.Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [
                            { type:'bar', label: isHumid? '시간대 최고 습도(%)':'시간대 최고 온도(℃)', data: dataSeries, backgroundColor: barColors, borderWidth: 0 },
                            { type:'line', label: '추세선', data: dataSeries.map((v,i,arr)=>{
                                const w = [arr[i-1], arr[i], arr[i+1]].filter(x=> x!=null && !isNaN(x));
                                return w.length? w.reduce((a,b)=>a+b,0)/w.length : null;
                            }), borderColor: 'rgba(79,70,229,0.9)', backgroundColor: 'transparent', tension: 0.3, spanGaps: true, yAxisID: 'y' }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: { title: { display:true, text:'시' }, grid:{ drawTicks:false, tickLength:0 } },
                            y: { title: { display:true, text: isHumid? '%':'℃' }, min:0, max: isHumid? 100:60, beginAtZero:true, ticks:{ stepSize:10 } }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    title: (items)=>{
                                        if(!items || !items.length) return '';
                                        const h = items[0].label;
                                        const hour = parseInt(h,10);
                                        const ampm = (hour<12) ? 'AM' : 'PM';
                                        const hourStr = String(h).padStart(2,'0');
                                        const dateStr = baseDate || '';
                                        return dateStr ? `${dateStr} ${hourStr}시 ${ampm}` : `${hourStr}시 ${ampm}`;
                                    },
                                    label: (ctx)=>{
                                        const v = ctx.parsed.y;
                                        return isHumid ? `시간대 최고 습도(%): ${Number(v).toFixed(3)}` : `시간대 최고 온도(℃): ${Number(v).toFixed(3)}`;
                                    }
                                }
                            }
                        }
                    }
                });

                // Render violators for current mode under chart
                try{
                    const wrapEl = document.getElementById('register-stats');
                    let vioEl = document.getElementById('register-stats-violators');
                    if(!vioEl){
                        vioEl = document.createElement('div');
                        vioEl.id = 'register-stats-violators';
                        wrapEl.appendChild(vioEl);
                    }
                    const crit = isHumid
                        ? ((CRITERIA?.humidMax!=null) ? Number(CRITERIA.humidMax) : null)
                        : ((CRITERIA?.tempMax!=null) ? Number(CRITERIA.tempMax) : null);
                    if(crit!=null){
                        const names = new Set();
                        (recs||[]).forEach(r=>{
                            const kindOk = isHumid ? String(r.kind||'').includes('습도') : String(r.kind||'').includes('온도');
                            const v = parseFloat(r.value);
                            if(kindOk && Number.isFinite(v) && v > crit){ names.add(String(r.name||'').trim()||'-'); }
                        });
                        const arr = Array.from(names).filter(Boolean);
                        if(arr.length){
                            vioEl.className = 'stat-violators';
                            const title = isHumid ? '기준습도 초과 온/습도계' : '기준온도 초과 온/습도계';
                            vioEl.innerHTML = `<div class="violators-title">${title}</div>` +
                                `<div class="violators-list">${arr.map(n=>`<span class="violator-chip">${escapeHTML(n)}</span>`).join('')}</div>`;
                            vioEl.hidden = false;
                        } else { vioEl.hidden = true; vioEl.innerHTML=''; }
                    } else { if(vioEl){ vioEl.hidden = true; vioEl.innerHTML=''; } }
                }catch(_e){}
            }

            function applyParsedResultsToForm(recs){
                if(!container) return;
                container.innerHTML = '';
                if(empty) empty.hidden = true;
                if(!recs || recs.length===0){ if(empty){ empty.hidden=false; } return; }
                // lock further file uploads upon successful parse
                lockFileUI();
                // reset warning box
                const warnEl = document.getElementById(REGISTER_WARNING_ID);
                if(warnEl){ warnEl.hidden = true; warnEl.textContent = ''; }
                // group by sensor name and compute stats
                const groups = {};
                const allTemps = [];
                const allHumids = [];
                const allDates = [];
                recs.forEach(r=>{
                    const key = r.name || '-';
                    if(!groups[key]) groups[key] = { temps:[], humids:[], dates:[], count:0, times:new Set() };
                    if(r.kind.includes('온도')){ groups[key].temps.push(r.value); allTemps.push(r.value); }
                    if(r.kind.includes('습도')){ groups[key].humids.push(r.value); allHumids.push(r.value); }
                    groups[key].dates.push(r.when);
                    groups[key].count += 1; // raw rows count
                    if(r.when) groups[key].times.add(r.when); // unique timestamps (온도+습도 한 쌍 → 1회)
                    allDates.push(r.when);
                });
                const fmt = (v)=> v==null? '-' : Number.isFinite(v)? v.toFixed(1) : '-';
                const avg = (arr)=> arr && arr.length? (arr.reduce((a,b)=>a+b,0) / arr.length) : null;
                const maxv = (arr)=> arr && arr.length? Math.max(...arr) : null;
                const pad = (x)=> String(x).padStart(2,'0');
                function parseDateSafe(s){
                    const t = String(s||'').trim(); if(!t) return null;
                    const d = new Date(t);
                    return isNaN(d) ? null : d;
                }
                function minDate(arr){
                    const ds = (arr||[]).map(parseDateSafe).filter(Boolean);
                    if(!ds.length) return null;
                    return new Date(Math.min(...ds.map(d=> d.getTime())));
                }
                function maxDate(arr){
                    const ds = (arr||[]).map(parseDateSafe).filter(Boolean);
                    if(!ds.length) return null;
                    return new Date(Math.max(...ds.map(d=> d.getTime())));
                }
                function fmtYmdHm(d){
                    if(!(d instanceof Date) || isNaN(d)) return '';
                    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                }
                function rangeStr(arr){
                    const start = minDate(arr), end = maxDate(arr);
                    if(!start && !end) return '-';
                    if(start && end){
                        const sameDay = start.getFullYear()===end.getFullYear() && start.getMonth()===end.getMonth() && start.getDate()===end.getDate();
                        if(sameDay){
                            const ymd = `${start.getFullYear()}-${pad(start.getMonth()+1)}-${pad(start.getDate())}`;
                            return `${ymd} ${pad(start.getHours())}:${pad(start.getMinutes())} ~ ${pad(end.getHours())}:${pad(end.getMinutes())}`;
                        }
                        return `${fmtYmdHm(start)} ~ ${fmtYmdHm(end)}`;
                    }
                    return fmtYmdHm(start || end);
                }
                const rows = Object.entries(groups).map(([name, g])=>({
                    name,
                    // measurement count: count unique timestamps (온도+습도 2줄 → 1회)
                    count: g.times.size || g.count,
                    tMax: maxv(g.temps), tAvg: avg(g.temps),
                    hMax: maxv(g.humids), hAvg: avg(g.humids)
                }));
                // overall summary
                // Compute overall max/avg across sensors: max of per-sensor max, avg of per-sensor avg
                const perSensorStats = Object.values(groups).map(g=>({
                    tMax: maxv(g.temps),
                    tAvg: avg(g.temps),
                    hMax: maxv(g.humids),
                    hAvg: avg(g.humids)
                }));
                const overall = {
                    name: `${Object.keys(groups).length} 대`,
                    period: rangeStr(allDates),
                    // sum of unique timestamp counts across groups
                    count: Object.values(groups).reduce((acc, g)=> acc + (g.times?.size||0), 0) || recs.length,
                    tMax: maxv(perSensorStats.map(s=> s.tMax).filter(v=> v!=null)),
                    tAvg: avg(perSensorStats.map(s=> s.tAvg).filter(v=> v!=null)),
                    hMax: maxv(perSensorStats.map(s=> s.hMax).filter(v=> v!=null)),
                    hAvg: avg(perSensorStats.map(s=> s.hAvg).filter(v=> v!=null))
                };
                // persist to cache only when in Add(기록 분석) mode; edit mode hides file section
                try{
                    ENTRY_LAST_SUMMARY = { temp_max: overall.tMax, temp_avg: overall.tAvg, humid_max: overall.hMax, humid_avg: overall.hAvg, count: overall.count, period: overall.period };
                    ENTRY_LAST_DETAILS = { rows, overall };
                }catch(_){ }
                const table = document.createElement('table');
                table.className = 'system-data-table server-data-table';
                table.innerHTML = `
                    <thead>
                        <tr>
                            <th>온/습도계</th>
                            <th>측정횟수</th>
                            <th>최고온도(℃)</th>
                            <th>평균온도(℃)</th>
                            <th>최고습도(%)</th>
                            <th>평균습도(%)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r=> `
                            <tr>
                                <td>${escapeHTML(r.name)}</td>
                                <td>${r.count ?? '-'}</td>
                                <td>${fmt(r.tMax)}</td>
                                <td>${fmt(r.tAvg)}</td>
                                <td>${fmt(r.hMax)}</td>
                                <td>${fmt(r.hAvg)}</td>
                            </tr>
                        `).join('')}
                        <tr class="table-summary-row">
                            <td><strong>${escapeHTML(overall.name)}</strong></td>
                            <td><strong>${overall.count ?? '-'}</strong></td>
                            <td><strong>${fmt(overall.tMax)}</strong></td>
                            <td><strong>${fmt(overall.tAvg)}</strong></td>
                            <td><strong>${fmt(overall.hMax)}</strong></td>
                            <td><strong>${fmt(overall.hAvg)}</strong></td>
                        </tr>
                    </tbody>
                `;
                container.appendChild(table);
                // After rendering, evaluate/update date mismatch warning
                updateDateMismatchWarning();
                // Update auto result field in the form
                try{ updateResultFieldFromSummary(); }catch(_){ }
                // Entry-modal-only: render inline '통계 분석' for just-uploaded records
                try {
                    // Default to temperature chart
                    renderRegisterStats(recs, 'temp');
                    const tBtn = document.getElementById('register-stats-temp');
                    const hBtn = document.getElementById('register-stats-humid');
                    tBtn?.addEventListener('click', async ()=>{
                        tBtn.classList.add('active'); tBtn.setAttribute('aria-pressed','true');
                        hBtn?.classList.remove('active'); hBtn?.setAttribute('aria-pressed','false');
                        await renderRegisterStats(recs, 'temp');
                    });
                    hBtn?.addEventListener('click', async ()=>{
                        hBtn.classList.add('active'); hBtn.setAttribute('aria-pressed','true');
                        tBtn?.classList.remove('active'); tBtn?.setAttribute('aria-pressed','false');
                        await renderRegisterStats(recs, 'humid');
                    });
                } catch(_e){}
                // Toggle download button visibility/state based on current mode
                const mode = document.getElementById(ENTRY_SAVE_ID)?.getAttribute('data-mode');
                if(dlBtn){
                    if(mode === 'edit'){
                        dlBtn.hidden = false; dlBtn.disabled = false;
                    } else { // add mode: keep hidden per requirement
                        dlBtn.hidden = true; dlBtn.disabled = true;
                    }
                }
            }

            function downloadCurrentAnalysis(){
                const table = document.querySelector(`#${REGISTER_RESULTS_ID} table`);
                if(!table){ showMessage('다운로드할 분석 결과가 없습니다.', '안내'); return; }
                // Extract header and rows from the rendered table
                const headers = [...table.querySelectorAll('thead th')].map(th=> th.textContent.trim());
                const rows = [...table.querySelectorAll('tbody tr')].map(tr=> [...tr.querySelectorAll('td')].map(td=> td.textContent.trim()));
                const lines = [headers, ...rows].map(arr=> arr.map(val=>`"${String(val).replace(/"/g,'""')}"`).join(','));
                const csvCore = lines.join('\r\n');
                const bom = '\uFEFF';
                const csv = bom + csvCore;
                const d = new Date();
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth()+1).padStart(2,'0');
                const dd = String(d.getDate()).padStart(2,'0');
                const hh = String(d.getHours()).padStart(2,'0');
                const mi = String(d.getMinutes()).padStart(2,'0');
                const filename = `thermo_analysis_${yyyy}${mm}${dd}_${hh}${mi}.csv`;
                const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            }

            dlBtn?.addEventListener('click', downloadCurrentAnalysis);

            // 샘플 다운로드
            sampleBtn?.addEventListener('click', async ()=>{
                try{ await ensureXLSX(); }catch(_e){ showMessage('샘플 생성을 위한 라이브러리를 불러오지 못했습니다.', '오류'); return; }
                const XLSX = window.XLSX;
                const headers = ['측정 일시','업무 이름','구분','값','비고'];
                const data = [
                    headers,
                    ['2025-10-06 00:00','온습도1','온도','22.1','℃'],
                    ['2025-10-06 00:00','온습도1','습도','45.2','%'],
                    ['2025-10-06 00:20','온습도1','온도','22.1','℃'],
                    ['2025-10-06 00:20','온습도1','습도','45.2','%']
                ];
                const ws = XLSX.utils.aoa_to_sheet(data);
                ws['!cols'] = [ {wch:20},{wch:12},{wch:8},{wch:8},{wch:6} ];
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, '샘플');
                XLSX.writeFile(wb, 'thermo_result_sample.xlsx');
            });

            // no dedicated OK button in single-flow; values are saved via the main 저장/등록 버튼
        })();
        // upload modal
        /* toolbar upload button removed
        document.getElementById(UPLOAD_BTN_ID)?.addEventListener('click', ()=>{
            // reset previous state
            const meta = document.getElementById(UPLOAD_META_ID); if(meta) meta.hidden = true;
            const chip = document.getElementById(UPLOAD_FILE_CHIP_ID); if(chip) chip.textContent = '';
            const input = document.getElementById(UPLOAD_INPUT_ID); if(input) input.value = '';
            const confirmBtn = document.getElementById(UPLOAD_CONFIRM_ID); if(confirmBtn) confirmBtn.disabled = true;
            openModal(UPLOAD_MODAL_ID);
            // Ensure animation is booted when modal opens
            initUploadAnim();
        });*/
    document.getElementById(UPLOAD_CLOSE_ID)?.addEventListener('click', ()=>{ try{ uploadAnim?.stop?.(); }catch(_){} closeModal(UPLOAD_MODAL_ID); });
        // dropzone interactions
        (function(){
            const dz = document.getElementById(UPLOAD_DROPZONE_ID);
            const input = document.getElementById(UPLOAD_INPUT_ID);
            // ensure REGISTER dropzone is unlocked at start of Add modal
            try{
                const dz2 = document.getElementById(REGISTER_DROPZONE_ID);
                const inp2 = document.getElementById(REGISTER_INPUT_ID);
                dz2?.classList.remove('dz-locked');
                dz2?.removeAttribute('aria-disabled');
                dz2?.removeAttribute('title');
                if(inp2) inp2.disabled = false;
            }catch(_){ }
            const meta = document.getElementById(UPLOAD_META_ID);
            const chip = document.getElementById(UPLOAD_FILE_CHIP_ID);
            const confirmBtn = document.getElementById(UPLOAD_CONFIRM_ID);
            // ensure warning reflects initial empty state
            updateDateMismatchWarning();
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
                    const wide = ['장소','비고'];
                    const mid = ['날짜','최고온도(℃)','평균온도(℃)','최고습도(%)','평균습도(%)','결과'];
                    if(wide.includes(h)) return { wch: 22 };
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
                    ['- 온도/습도 값은 숫자로 입력하세요. 비고는 선택입니다.'],
                    [''],
                    ['컬럼 순서 (복사/참고용)'],
                    [UPLOAD_HEADERS_KO.join(', ')],
                ];
                const wsGuide = XLSX.utils.aoa_to_sheet(rules);
                wsGuide['!cols'] = [{ wch: 120 }];

                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template');
                XLSX.utils.book_append_sheet(wb, wsGuide, '가이드');
                XLSX.writeFile(wb, 'thermo_logs_upload_template.xlsx');
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
                    let skippedDuplicates = 0;
                    for(let r=1; r<rows.length; r++){
                        const row = rows[r]; if(isEmptyRow(row)) continue;
                        const rec = {};
                        for(let c=0; c<header.length; c++){
                            const label = header[c]; const key = HEADER_KO_TO_KEY[label];
                            rec[key] = String(row[c]??'').trim();
                        }
                        // Duplicate check against existing data (normalize place internally)
                        if(hasDuplicate(rec.date, rec.place, null)){
                            skippedDuplicates++;
                            continue;
                        }
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
                    const baseMsg = `${imported.length}개 행이 업로드되었습니다.`;
                    const dupMsg = skippedDuplicates>0 ? ` (중복 ${skippedDuplicates}개 건너뜀)` : '';
                    showMessage(baseMsg + dupMsg, '업로드 완료');
                    closeModal(UPLOAD_MODAL_ID);
                }catch(e){ console.error(e); showMessage('엑셀 파싱 중 오류가 발생했습니다. 파일을 확인해주세요.', '업로드 오류'); }
            };
            reader.onerror = ()=> showMessage('파일을 읽는 중 오류가 발생했습니다.', '업로드 오류');
            reader.readAsArrayBuffer(f);
        });
        // (통계 기능 제거: 통계 모달/버튼 관련 모든 이벤트 제거)
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
        /* dispose toolbar removed
        document.getElementById(DISPOSE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('불용처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('dispose-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 시스템을 정말 불용처리하시겠습니까?`; }
            openModal(DISPOSE_MODAL_ID);
        });*/
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
            const ids = [...state.selected].filter(x=> x!=null);
            if(ids.length === 0){ closeModal(DELETE_MODAL_ID); return; }

            // API 우선 삭제
            if(state.apiAvailable){
                try{
                    const res = await apiBulkDeleteThermoLogs(ids);
                    const removed = parseInt(res?.deleted, 10) || 0;
                    // 로컬 state 동기화
                    const idSet = new Set(ids);
                    state.data = state.data.filter(r => !idSet.has(r.id));
                    state.selected.clear();
                    applyFilter();
                    closeModal(DELETE_MODAL_ID);
                    if(removed > 0){ setTimeout(()=> showMessage(`${removed}개 항목이 삭제되었습니다.`, '완료'), 0); }
                    return;
                }catch(err){
                    showMessage(err?.message || '온/습도 기록 삭제 중 오류가 발생했습니다.', '오류');
                    return;
                }
            }

            // fallback (mock/local)
            const idSet = new Set(ids);
            const before = state.data.length;
            state.data = state.data.filter(r => !idSet.has(r.id));
            const removed = before - state.data.length;
            state.selected.clear();
            applyFilter();
            closeModal(DELETE_MODAL_ID);
            if(removed > 0){ setTimeout(()=> showMessage(`${removed}개 항목이 삭제되었습니다.`, '완료'), 0); }
        });
        // bulk (일괄변경)
        /* bulk toolbar removed
        document.getElementById(BULK_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('일괄변경할 행을 먼저 선택하세요.', '안내'); return; }
            // 일괄변경 모달 열기
            const subtitle = document.getElementById('bulk-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 시스템에서 지정한 필드를 일괄 변경합니다.`; }
            buildBulkForm();
            openModal(BULK_MODAL_ID);
        });*/
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
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ [ENTRY_MODAL_ID,COLUMN_MODAL_ID,DISPOSE_MODAL_ID,DELETE_MODAL_ID,BULK_MODAL_ID,UPLOAD_MODAL_ID,'system-download-modal','system-message-modal','system-duplicate-modal',CRITERIA_MODAL_ID].forEach(closeModal); }});
    // (통계 모달 ESC 닫기 제거)

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

    // (통계 관련 헬퍼/리스너 제거)
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
    // Load saved criteria (최고온도/최고습도)
    loadCriteria();
        // 데이터 로드는 비동기로 진행 (서버/API가 꺼져 있어도 버튼/모달은 즉시 동작해야 함)
        try{ initData(); }catch(_e){}
        initPlaceSearchableControl();
        bindEvents();
        render();
        // Page adornments (animation + popover)
// Snapshot primary color from root CSS variable --accent (aligns with Add button)
        try{
            const rootStyle = window.getComputedStyle(document.documentElement);
            const accent = rootStyle.getPropertyValue('--accent');
            if(accent && accent.trim()){
                PRIMARY_DOT_COLOR = accent.trim();
            }
        }catch(_e){}
    }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


