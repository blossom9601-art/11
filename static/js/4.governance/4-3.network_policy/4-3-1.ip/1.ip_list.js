/**
 * 네트워크 정책 관리 - IP 정책 페이지 스크립트
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
    // Upload template (IP 정책) — 초기 버전: CSV/XLSX 구조 정의만, 검증은 최소화
    const UPLOAD_HEADERS_KO = ['상태','IP 버전','시작주소','종료주소','IP 범위','할당률','위치','역할','비고'];
    const HEADER_KO_TO_KEY = {
        '상태':'status','IP 버전':'ip_version','시작주소':'start_ip','종료주소':'end_ip','IP 범위':'ip_range','할당률':'allocation_rate','위치':'location','역할':'role','비고':'note'
    };
    const ENUM_SETS = { };
    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
    function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }

    // Data + State
    const BASE_VISIBLE_COLUMNS = [
        'status','ip_version','start_ip','end_ip','ip_range','allocation_rate','location','role'
    ];
    const COLUMN_ORDER = [
        'status','ip_version','start_ip','end_ip','ip_range','allocation_rate','location','role'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '기본', columns: ['status','ip_version','allocation_rate'] },
        { group: '주소', columns: ['start_ip','end_ip','ip_range'] },
        { group: '속성', columns: ['location','role'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        status:{label:'상태',group:'기본'},
        ip_version:{label:'IP 버전',group:'기본'},
        start_ip:{label:'시작주소',group:'주소'},
        end_ip:{label:'종료주소',group:'주소'},
        ip_range:{label:'IP 범위',group:'주소'},
        allocation_rate:{label:'할당률',group:'기본'},
        location:{label:'위치',group:'속성'},
        role:{label:'역할',group:'속성'},
        note:{label:'비고',group:'속성'}
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
        sortKey: null,
        sortDir: 'asc',
        columnFilters: {}, // { col: value | [values...] } (조건 필터 기능 제거 예정 - 빈 유지)
        isFetching: false,
    };

    const DEFAULT_LOCATION_OPTIONS = ['퓨처센터'];

    const searchableSelectMeta = new WeakMap();
    let activeSearchPanel = null;

    const API_ENDPOINT = '/api/network/ip-policies';
    const API_PAGE_SIZE = 200;
    const JSON_HEADERS = { 'Content-Type': 'application/json' };
    const DETAIL_CACHE_KEY = 'gov:ipPolicy:lastRow';

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;

    async function fetchJson(url, options){
        const resp = await fetch(url, options);
        let data = null;
        try {
            data = await resp.json();
        } catch(_e){
            data = null;
        }
        const success = data == null || data.success !== false;
        if(!resp.ok || !success){
            const message = data && data.message ? data.message : `요청 실패: ${resp.status}`;
            throw new Error(message);
        }
        return data || {};
    }

    function normalizePolicyRow(raw){
        if(!raw) return null;
        const start = (raw.start_ip || '').toString().trim();
        const end = (raw.end_ip || '').toString().trim();
        return {
            id: raw.id,
            status: raw.status || '',
            ip_version: raw.ip_version || '',
            start_ip: start,
            end_ip: end,
            ip_range: raw.ip_range || (start && end ? `${start} ~ ${end}` : ''),
            allocation_rate: raw.allocation_rate ?? raw.utilization_rate ?? '',
            location: raw.location || raw.center_code || '',
            role: raw.role || '',
            note: raw.note || raw.description || '',
        };
    }

    function inferIpVersion(startIp, endIp, fallback){
        const hasColon = (ip)=> !!ip && ip.includes(':');
        const hasDot = (ip)=> !!ip && ip.includes('.');
        if(hasColon(startIp) || hasColon(endIp)) return 'IPv6';
        if(hasDot(startIp) || hasDot(endIp)) return 'IPv4';
        return fallback || '';
    }

    function sanitizeAllocationRate(value){
        if(value == null || value === '') return '';
        const numeric = Number(String(value).replace(/[^0-9.-]/g,''));
        if(!Number.isFinite(numeric)) return '';
        const clamped = Math.min(100, Math.max(0, numeric));
        return Number(clamped.toFixed(4));
    }

    function cacheDetailRow(row){
        if(!row || row.id == null) return;
        try {
            sessionStorage.setItem(DETAIL_CACHE_KEY, JSON.stringify(row));
        } catch(_e){ /* ignore quota errors */ }
    }

    function isSearchableSelect(select){
        if(!select) return false;
        if(select.dataset.searchable === 'false') return false;
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
        select.addEventListener('change', () => {
            syncSearchableSelect(select);
        });
        searchableSelectMeta.set(select, { wrapper, displayBtn, clearBtn });
        syncSearchableSelect(select);
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
        const selects = form.querySelectorAll('select.search-select');
        selects.forEach(select => {
            if(!select.dataset.searchable){
                select.dataset.searchable = 'true';
            }
            setupSearchableSelect(select);
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
                valueLower: value.toLowerCase(),
            });
        });
        return options;
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
            focusIndex: -1,
        };
        activeSearchPanel = state;
        meta.displayBtn.setAttribute('aria-expanded', 'true');
        renderSearchPanelOptions(state);
        positionSearchPanel(state);
        setTimeout(() => input.focus(), 0);
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

    document.addEventListener('reset', event => {
        const form = event.target;
        if(!(form instanceof HTMLFormElement)){
            return;
        }
        setTimeout(() => {
            form.querySelectorAll('select.search-select').forEach(select => {
                syncSearchableSelect(select);
            });
        }, 0);
    });

    function getLocationSelectValue(select){
        return (select?.value || '').trim();
    }

    function getKnownLocations(){
        const set = new Set(DEFAULT_LOCATION_OPTIONS.filter(Boolean));
        state.data.forEach(row => {
            const loc = (row.location || '').trim();
            if(loc){
                set.add(loc);
            }
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'ko-KR'));
    }

    function populateLocationSelect(select, desiredValue){
        if(!select) return;
        const valueToApply = typeof desiredValue === 'string' ? desiredValue.trim() : getLocationSelectValue(select);
        const placeholder = getSearchablePlaceholder(select) || '선택';
        const known = getKnownLocations();
        select.innerHTML = '';
        select.appendChild(new Option(placeholder, ''));
        known.forEach(loc => {
            select.appendChild(new Option(loc, loc));
        });
        if(valueToApply && !known.includes(valueToApply)){
            select.appendChild(new Option(valueToApply, valueToApply));
        }
        select.value = valueToApply && select.querySelector(`option[value="${CSS.escape(valueToApply)}"]`) ? valueToApply : '';
        select.dataset.currentValue = select.value;
        syncSearchableSelect(select);
    }

    function setupLocationFields(formId, initialValue){
        const form = document.getElementById(formId);
        if(!form) return;
        const selects = form.querySelectorAll('[data-location-select]');
        selects.forEach(select => {
            if(select.dataset.locationBound !== '1'){
                select.addEventListener('change', () => {
                    select.dataset.currentValue = getLocationSelectValue(select);
                });
                select.dataset.locationBound = '1';
            }
            const preset = typeof initialValue === 'string' ? initialValue : select.dataset.currentValue || '';
            populateLocationSelect(select, preset);
        });
    }

    function refreshLocationSelectOptions(){
        [ADD_FORM_ID, EDIT_FORM_ID].forEach(formId => {
            const form = document.getElementById(formId);
            if(!form) return;
            form.querySelectorAll('[data-location-select]').forEach(select => {
                const current = getLocationSelectValue(select);
                populateLocationSelect(select, current);
            });
        });
    }

    function buildPolicyPayload(data){
        const start = (data.start_ip || data.startIp || '').trim();
        const end = (data.end_ip || data.endIp || '').trim();
        const payload = {
            status: (data.status || '').trim(),
            start_ip: start,
            end_ip: end,
            ip_version: (data.ip_version || data.ipVersion || '').trim(),
            location: (data.location || '').trim(),
            role: (data.role || '').trim(),
            note: (data.note || '').trim(),
            description: (data.description || data.note || '').trim(),
        };
        const inferred = inferIpVersion(start, end, payload.ip_version);
        if(inferred) payload.ip_version = inferred;
        const rate = sanitizeAllocationRate(data.allocation_rate ?? data.utilization_rate);
        if(rate !== '') payload.allocation_rate = rate;
        if(payload.location){
            payload.center_code = payload.location;
        }
        return payload;
    }

    async function fetchPolicyPage(page){
        const params = new URLSearchParams({
            page: String(page),
            page_size: String(API_PAGE_SIZE),
            order: '-id',
        });
        const url = `${API_ENDPOINT}?${params.toString()}`;
        const data = await fetchJson(url, { method:'GET' });
        const items = Array.isArray(data.items) ? data.items : [];
        return {
            items,
            total: Number(data.total || items.length || 0),
            pageSize: Number(data.page_size || API_PAGE_SIZE),
        };
    }

    async function fetchAllPolicies(){
        const rows = [];
        let page = 1;
        while(true){
            const { items, total, pageSize } = await fetchPolicyPage(page);
            rows.push(...items.map(normalizePolicyRow).filter(Boolean));
            const received = rows.length;
            if(received >= total || items.length < pageSize){
                break;
            }
            page += 1;
            if(page > 1000) break; // 안전장치
        }
        return rows;
    }

    async function createPolicy(payload){
        const res = await fetchJson(API_ENDPOINT, {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify(payload),
        });
        return normalizePolicyRow(res.item);
    }

    async function updatePolicy(id, payload){
        if(!id) throw new Error('잘못된 ID입니다.');
        const res = await fetchJson(`${API_ENDPOINT}/${id}`, {
            method: 'PUT',
            headers: JSON_HEADERS,
            body: JSON.stringify(payload),
        });
        return normalizePolicyRow(res.item);
    }

    async function deletePolicies(ids){
        if(!ids || !ids.length) return;
        if(ids.length === 1){
            await fetchJson(`${API_ENDPOINT}/${ids[0]}`, { method:'DELETE' });
            return;
        }
        await fetchJson(`${API_ENDPOINT}/bulk-delete`, {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify({ ids }),
        });
    }

    async function refreshPolicies(forceLoading){
        const shouldShowLoading = !!forceLoading || state.data.length === 0;
        state.isFetching = true;
        if(shouldShowLoading){
            render();
        }
        let ok = false;
        try {
            const rows = await fetchAllPolicies();
            state.data = rows;
            state.selected.clear();
            ok = true;
        } catch(err){
            console.error(err);
            showMessage(err.message || 'IP 정책 목록 조회 중 오류가 발생했습니다.', '오류');
        } finally {
            state.isFetching = false;
        }
        if(ok){
            applyFilter();
            refreshLocationSelectOptions();
        } else if(shouldShowLoading){
            render();
        }
    }

    async function initData(){
        await refreshPolicies(true);
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
                if(state.isFetching && !state.data.length){
                    if(titleEl) titleEl.textContent = 'IP 정책을 불러오는 중입니다.';
                    if(descEl) descEl.textContent = '잠시만 기다려주세요.';
                } else if(state.search.trim()){
                    if(titleEl) titleEl.textContent = '검색 결과가 없습니다.';
                    if(descEl) descEl.textContent = '검색어를 변경하거나 필터를 초기화하세요.';
                } else {
                    if(titleEl) titleEl.textContent = 'IP 정책 내역이 없습니다.';
                    if(descEl) descEl.textContent = "우측 상단 '추가' 버튼을 눌러 첫 IP 정책을 등록하세요.";
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
        // Helpers for IP count rendering (IPv4/IPv6)
        function ipToBigInt(ip){
            if(!ip) return null;
            ip = String(ip).trim();
            // IPv4
            if(ip.includes('.') && !ip.includes(':')){
                const parts = ip.split('.');
                if(parts.length !== 4) return null;
                let n = 0n;
                for(const p of parts){
                    if(p === '') return null;
                    const v = Number(p);
                    if(!Number.isInteger(v) || v < 0 || v > 255) return null;
                    n = (n << 8n) + BigInt(v);
                }
                return n;
            }
            // IPv6 (support :: contraction)
            if(ip.includes(':')){
                // Normalize to full 8 hextets
                let hextets = ip.split('::');
                if(hextets.length > 2) return null; // invalid
                let left = hextets[0] ? hextets[0].split(':').filter(Boolean) : [];
                let right = hextets[1] ? hextets[1].split(':').filter(Boolean) : [];
                // Validate hextets
                const isValidHex = (s)=> /^[0-9a-fA-F]{0,4}$/.test(s);
                if(!left.every(isValidHex) || !right.every(isValidHex)) return null;
                const missing = 8 - (left.length + right.length);
                if(missing < 0) return null;
                const full = [...left, ...Array(missing).fill('0'), ...right].map(h=> h === '' ? '0' : h);
                if(full.length !== 8) return null;
                let n = 0n;
                for(const h of full){
                    if(!/^[0-9a-fA-F]{1,4}$/.test(h)) return null;
                    n = (n << 16n) + BigInt(parseInt(h, 16));
                }
                return n;
            }
            return null;
        }
        function countIPs(start, end){
            const a = ipToBigInt(start); const b = ipToBigInt(end);
            if(a == null || b == null) return null;
            if(b < a) return null;
            return (b - a + 1n);
        }
        function formatBigIntKO(nBig){
            try{ return nBig.toLocaleString('ko-KR'); }catch(_e){
                // Fallback manual comma insertion
                const s = nBig.toString();
                const neg = s.startsWith('-');
                const core = neg ? s.slice(1) : s;
                const out = core.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                return neg ? '-' + out : out;
            }
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
                    // IP 정책 상태 배지 표시
                    if(col === 'status'){
                        const v = String(displayVal);
                        const map = { '활성':'ws-run', '예약':'ws-idle', '비활성':'ws-wait' };
                        const cls = map[v] || 'ws-wait';
                        cellValue = `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${highlight(displayVal, col)}</span></span>`;
                    } else if(col === 'start_ip'){
                        // 시작주소 → 상세 페이지 링크 (AD의 domain 컬럼과 동일 패턴)
                        const detailUrl = (window.__MODULE_DETAIL_URL || '/p/gov_ip_policy_detail');
                        const txt = highlight(displayVal, col);
                        const linkId = row.id != null ? encodeURIComponent(row.id) : '';
                        const href = linkId ? `${detailUrl}?id=${linkId}` : detailUrl;
                        const dataId = row.id != null ? row.id : '';
                        cellValue = `<a href="${href}" class="work-name-link ip-detail-link" data-id="${dataId}" title="상세로 이동">${txt}</a>`;
                    } else if(col === 'allocation_rate'){
                        const n = parseInt(String(rawVal).replace(/[^0-9-]/g,''),10);
                        const pct = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
                        if(pct==null){
                            cellValue = '-';
                        } else {
                            const aria = `aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="할당률 ${pct}%"`;
                            cellValue = `<div class="progress-cell" role="progressbar" ${aria}>
                                <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
                                <span class="progress-value">${pct}%</span>
                            </div>`;
                        }
                    } else if(col === 'ip_range'){
                        // Display IP count computed from start/end, keep original as tooltip (no detail link)
                        const start = row.start_ip, end = row.end_ip;
                        const cnt = countIPs(start, end);
                        if(cnt == null){
                            cellValue = '-';
                        } else {
                            const title = `${escapeHTML(String(start||''))} ~ ${escapeHTML(String(end||''))}`;
                            cellValue = `<span class="ip-count" title="${title}">${formatBigIntKO(cnt)}</span>`;
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
        const MIN_COLS = 7; // enforce minimum visible columns (same as column modal apply)
        if(!hasAnyValid || state.visibleCols.size < MIN_COLS){
            state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
            saveColumnSelection();
        }
        table.querySelectorAll('thead th[data-col], tbody td[data-col]').forEach(cell=>{
            const col = cell.getAttribute('data-col');
            if(col==='actions') return;
            if(state.visibleCols.has(col)) cell.classList.remove('col-hidden'); else cell.classList.add('col-hidden');
        });
    }

    const VISIBLE_COLS_KEY = 'ip_visible_cols';
    function saveColumnSelection(){
        try { localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify([...state.visibleCols])); } catch(e){}
    }
    function loadColumnSelection(){
        try {
            const raw = localStorage.getItem(VISIBLE_COLS_KEY);
            if(!raw) return; // nothing stored for IP page yet → keep defaults
            let parsed = [];
            try { parsed = JSON.parse(raw); } catch(_e) { parsed = []; }
            if(!Array.isArray(parsed)) parsed = [];
            // Sanitize: keep only known columns; de-dup
            const allowed = new Set(Object.keys(COLUMN_META));
            const filtered = [...new Set(parsed.filter(k => allowed.has(String(k))))];
            if(filtered.length > 0){
                state.visibleCols = new Set(filtered);
                // Safety: ensure key columns are never hidden (user feedback: IP 범위 누락 방지)
                ['ip_range','allocation_rate'].forEach((k)=>{
                    if(COLUMN_META[k]) state.visibleCols.add(k);
                });
                try { localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify([...state.visibleCols])); } catch(_e){}
            } else {
                state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
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
            if(!el.name || el.disabled) return;
            data[el.name]=el.value.trim();
        });
        form.querySelectorAll('[data-location-select]').forEach(select => {
            const name = select.name;
            if(!name) return;
            data[name] = getLocationSelectValue(select);
        });
        return data;
    }

    // ---- IP input helpers (sanitization + range count preview) ----
    function ipToBigIntGlobal(ip){
        if(!ip) return null;
        ip = String(ip).trim();
        if(ip.includes('.') && !ip.includes(':')){
            const parts = ip.split('.');
            if(parts.length !== 4) return null;
            let n = 0n;
            for(const p of parts){
                if(p === '') return null;
                const v = Number(p);
                if(!Number.isInteger(v) || v < 0 || v > 255) return null;
                n = (n << 8n) + BigInt(v);
            }
            return n;
        }
        if(ip.includes(':')){
            let hextets = ip.split('::');
            if(hextets.length > 2) return null;
            let left = hextets[0] ? hextets[0].split(':').filter(Boolean) : [];
            let right = hextets[1] ? hextets[1].split(':').filter(Boolean) : [];
            const isValidHex = (s)=> /^[0-9a-fA-F]{0,4}$/.test(s);
            if(!left.every(isValidHex) || !right.every(isValidHex)) return null;
            const missing = 8 - (left.length + right.length);
            if(missing < 0) return null;
            const full = [...left, ...Array(missing).fill('0'), ...right].map(h=> h === '' ? '0' : h);
            if(full.length !== 8) return null;
            let n = 0n;
            for(const h of full){
                if(!/^[0-9a-fA-F]{1,4}$/.test(h)) return null;
                n = (n << 16n) + BigInt(parseInt(h, 16));
            }
            return n;
        }
        return null;
    }
    function countIPsGlobal(start, end){
        const a = ipToBigIntGlobal(start); const b = ipToBigIntGlobal(end);
        if(a == null || b == null) return null;
        if(b < a) return null;
        return (b - a + 1n);
    }
    function formatBigIntKO(nBig){
        try{ return nBig.toLocaleString('ko-KR'); }catch(_e){
            const s = nBig.toString();
            const neg = s.startsWith('-');
            const core = neg ? s.slice(1) : s;
            const out = core.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            return neg ? '-' + out : out;
        }
    }
    function attachIpFormEnhancements(formId, outputSpanId){
        const form = document.getElementById(formId); if(!form) return;
        const startEl = form.querySelector('[name="start_ip"]');
        const endEl = form.querySelector('[name="end_ip"]');
        const out = outputSpanId ? form.querySelector(`#${outputSpanId}`) : null;
        const utilizationEl = form.querySelector('#edit-utilization-rate');
        const originalStart = form.dataset.ipOriginalStart ?? '';
        const originalEnd = form.dataset.ipOriginalEnd ?? '';
        const originalPctText = form.dataset.ipOriginalPct ?? '';
        const sanitize = (el)=>{
            if(!el) return;
            const v = el.value;
            const nv = v.replace(/[^0-9\.:]/g, '');
            if(v !== nv) el.value = nv;
        };
        const update = ()=>{
            const s = startEl?.value?.trim();
            const e = endEl?.value?.trim();
            if(out){
                const cnt = countIPsGlobal(s, e);
                // Support both span text and disabled input value
                if(out.tagName && out.tagName.toLowerCase() === 'input'){
                    out.value = (cnt==null) ? '-' : formatBigIntKO(cnt);
                } else {
                    out.textContent = (cnt==null) ? '-' : formatBigIntKO(cnt);
                }
            }

            // Utilization is server-computed; if the range changes, show a clear hint.
            if(utilizationEl){
                const changed = (String(s||'') !== String(originalStart||'')) || (String(e||'') !== String(originalEnd||''));
                utilizationEl.value = changed ? '저장 후 계산' : (originalPctText || '-');
            }
        };
        ['input','change','blur'].forEach(ev=>{
            startEl?.addEventListener(ev, ()=>{ sanitize(startEl); update(); });
            endEl?.addEventListener(ev, ()=>{ sanitize(endEl); update(); });
        });
        // initial
        sanitize(startEl); sanitize(endEl); update();
    }

    function fillEditForm(row){
        const form = document.getElementById(EDIT_FORM_ID); if(!form) return;
        form.innerHTML='';

        const toPctText = (raw)=>{
            const s = raw == null ? '' : String(raw);
            const n = parseInt(s.replace(/[^0-9-]/g,''), 10);
            if(!Number.isFinite(n)) return '-';
            const pct = Math.min(100, Math.max(0, n));
            return `${pct}%`;
        };
        const utilizationRaw = (row.utilization_rate ?? row.allocation_rate ?? row.allocationRate);
        const pctText = toPctText(utilizationRaw);

        // Used by attachIpFormEnhancements to decide when to show “저장 후 계산”.
        form.dataset.ipOriginalStart = String(row.start_ip ?? '').trim();
        form.dataset.ipOriginalEnd = String(row.end_ip ?? '').trim();
        form.dataset.ipOriginalPct = pctText;

        const section = document.createElement('div'); section.className='form-section';
        section.innerHTML = `<div class="section-header"><h4>IP 정책</h4></div>`;
        const grid = document.createElement('div'); grid.className='form-grid';
        grid.innerHTML = `
            <div class="form-row"><label>상태</label>
                <select name="status" class="form-input search-select fk-select" data-placeholder="상태 선택" data-searchable-scope="page">
                    <option value="" ${!row.status?'selected':''}>선택</option>
                    <option value="활성" ${row.status==='활성'?'selected':''}>활성</option>
                    <option value="예약" ${row.status==='예약'?'selected':''}>예약</option>
                    <option value="비활성" ${row.status==='비활성'?'selected':''}>비활성</option>
                </select>
            </div>
            <div class="form-row"><label>IP 버전</label>
                <select name="ip_version" class="form-input search-select fk-select" data-placeholder="IP 버전 선택" data-searchable-scope="page">
                    <option value="" ${!row.ip_version?'selected':''}>선택</option>
                    <option value="IPv4" ${row.ip_version==='IPv4'?'selected':''}>IPv4</option>
                    <option value="IPv6" ${row.ip_version==='IPv6'?'selected':''}>IPv6</option>
                </select>
            </div>
            <div class="form-row"><label>시작주소<span class="required">*</span></label><input name="start_ip" class="form-input" value="${row.start_ip??''}" required pattern="[0-9:.]*" inputmode="text" placeholder="숫자, ., : 만 입력"></div>
            <div class="form-row"><label>종료주소<span class="required">*</span></label><input name="end_ip" class="form-input" value="${row.end_ip??''}" required pattern="[0-9:.]*" inputmode="text" placeholder="숫자, ., : 만 입력"></div>
            <div class="form-metrics">
                <div class="form-row"><label>IP 범위 수량</label>
                    <input id="edit-ip-range-count" type="text" class="form-input locked-input" placeholder="-" readonly disabled>
                </div>
                <div class="form-row"><label>할당률(%)</label>
                    <input id="edit-utilization-rate" type="text" class="form-input locked-input" value="${pctText}" placeholder="-" readonly disabled>
                </div>
            </div>
            <div class="form-row">
                <label>위치</label>
                <select name="location" class="form-input search-select fk-select" data-placeholder="위치 선택" data-location-select data-searchable-scope="page">
                    <option value="">선택</option>
                </select>
            </div>
            <div class="form-row"><label>역할</label><input name="role" class="form-input" value="${row.role??''}"></div>
            <div class="form-row form-row-wide"><label>비고</label><textarea name="note" class="form-input textarea-large" rows="6">${row.note??''}</textarea></div>
        `;
        section.appendChild(grid);
        form.appendChild(section);
        enhanceFormSearchableSelects(EDIT_FORM_ID);
        setupLocationFields(EDIT_FORM_ID, row.location || '');
    }

    function generateFieldInput(col,value=''){
        // software selects/search-selects
        if(col==='sw_status'){
            const v = String(value??'');
            return `<select name="sw_status" class="form-input">
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="사용" ${v==='사용'?'selected':''}>사용</option>
                <option value="미사용" ${v==='미사용'?'selected':''}>미사용</option>
            </select>`;
        }
        if(col==='sw_type'){
            const v = String(value??'');
            return `<select name="sw_type" class="form-input">
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="상용" ${v==='상용'?'selected':''}>상용</option>
                <option value="오픈소스" ${v==='오픈소스'?'selected':''}>오픈소스</option>
            </select>`;
        }
        if(['sw_vendor','sw_name','sw_version','sw_dept','sw_owner'].includes(col)){
            // Align placeholder text with Add modal
            const ph = '검색 선택';
            return `<input name="${col}" class="form-input search-select" placeholder="${ph}" value="${value??''}">`;
        }
        // license selects
        if(col==='lic_type'){
            const v = String(value??'');
            const opts = ['', '임시', '영구구매(1회)', '서브스크립션(1년)', '서브스크립션(2년)', '서브스크립션(3년)', '서브스크립션(4년)', '서브스크립션(5년)'];
            // Render '선택' label for the blank option for clarity
            return `<select name="lic_type" class="form-input">${opts.map(o=>`<option value="${o}" ${o===v?'selected':''}>${o===''?'선택':o}</option>`).join('')}</select>`;
        }
        if(col==='lic_total') return `<input name="${col}" type="number" min="0" step="1" class="form-input" value="${value??''}" placeholder="숫자만">`;
        if(col==='lic_assigned') return `<input name="${col}" type="number" min="0" step="1" class="form-input" value="${value??''}" placeholder="자동 할당(상세 연동 예정)" readonly disabled>`;
        if(col==='lic_idle') return `<input name="${col}" type="number" min="0" step="1" class="form-input" value="${value??''}" placeholder="자동 계산" readonly disabled>`;
        // lic_key / lic_period removed
                    if(col==='lic_desc') return `<textarea name="${col}" class="form-input textarea-large" rows="6">${value??''}</textarea>`;
        return `<input name="${col}" class="form-input" value="${value??''}">`;
    }

    // Live-sync helpers for license fields in Add/Edit forms
    function attachLicenseLiveSync(formId){
        // No-op for IP 정책 page; kept to avoid breaking shared wiring
        const form = document.getElementById(formId); if(!form) return;
        if(form.dataset.licLiveSyncAttached === '1') return;
        const totalEl = form.querySelector('[name="lic_total"]');
        const assignedEl = form.querySelector('[name="lic_assigned"]');
        const idleEl = form.querySelector('[name="lic_idle"]');
        function toInt(v){ const n = parseInt((v??'').toString(), 10); return isNaN(n) ? 0 : n; }
        function recomputeIdle(){ if(!idleEl) return; const t=toInt(totalEl?.value); const a=toInt(assignedEl?.value); idleEl.value = String(Math.max(0, t-a)); }
        totalEl?.addEventListener('input', recomputeIdle);
        assignedEl?.addEventListener('input', recomputeIdle);
        recomputeIdle();
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
        try {
            const payload = buildPolicyPayload(data);
            const created = await createPolicy(payload);
            if(!created) return;
            state.data.unshift(created);
            applyFilter();
            refreshLocationSelectOptions();
        } catch(err){
            console.error(err);
            showMessage(err.message || 'IP 정책 등록 중 오류가 발생했습니다.', '오류');
            throw err;
        }
    }

    async function updateRow(index,data){
        const target = state.data[index];
        if(!target){
            showMessage('선택된 행을 찾을 수 없습니다.', '오류');
            return;
        }
        try {
            const payload = buildPolicyPayload({ ...target, ...data });
            const updated = await updatePolicy(target.id, payload);
            if(!updated) return;
            state.data[index] = updated;
            applyFilter();
            refreshLocationSelectOptions();
        } catch(err){
            console.error(err);
            showMessage(err.message || 'IP 정책 수정 중 오류가 발생했습니다.', '오류');
        }
    }

    async function deleteRowsByIds(ids){
        if(!ids.length) return;
        try {
            await deletePolicies(ids);
            const drop = new Set(ids);
            state.data = state.data.filter(row => !drop.has(row.id));
            state.selected.clear();
            applyFilter();
            refreshLocationSelectOptions();
        } catch(err){
            console.error(err);
            showMessage(err.message || 'IP 정책 삭제 중 오류가 발생했습니다.', '오류');
            throw err;
        }
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
        const rows = dataForCsv.map((r,i)=> [
            i+1,
            ...visibleCols.map(c=>{
                if(c === 'ip_range'){
                    const cnt = countIPsGlobal(r.start_ip, r.end_ip);
                    return (cnt==null) ? '' : formatBigIntKO(cnt);
                }
                return r[c] ?? '';
            })
        ]);
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
    const filename = `ip_policy_list_${yyyy}${mm}${dd}.csv`;
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
                    attachIpFormEnhancements(EDIT_FORM_ID, 'edit-ip-range-count');
                    const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                    if(editSaveEl){ editSaveEl.setAttribute('data-index', realIndex); }
                }
                return; // 액션 버튼 클릭 처리 후 종료
            }
            // 행 내부 다른 영역 클릭 시 선택 토글 (체크박스/액션/링크 영역 제외)
            if(e.target.closest('.system-actions')) return; // 관리 버튼 영역 제외
            if(e.target.closest('.work-name-link')) return; // 링크 클릭 시 토글 금지
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
    document.getElementById(ADD_BTN_ID)?.addEventListener('click', ()=> { openModal(ADD_MODAL_ID); attachIpFormEnhancements(ADD_FORM_ID, 'add-ip-range-count'); });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', async ()=>{
            const form = document.getElementById(ADD_FORM_ID); if(!form.checkValidity()){ form.reportValidity(); return; }
            const data = collectForm(form);
            // Normalize IP policy fields
            // Compute IP count as IP 범위 value
            if(data.start_ip && data.end_ip){
                const cnt = countIPsGlobal(data.start_ip, data.end_ip);
                data.ip_range = (cnt==null) ? '' : formatBigIntKO(cnt);
            } else {
                data.ip_range = '';
            }
            if(Object.prototype.hasOwnProperty.call(data, 'allocation_rate') && data.allocation_rate !== ''){
                let n = parseInt(String(data.allocation_rate).replace(/[^0-9-]/g,''),10);
                if(!Number.isFinite(n)) n = 0;
                data.allocation_rate = Math.min(100, Math.max(0, n));
            }
            if(!data.ip_version){
                const s = String(data.start_ip||''); const e = String(data.end_ip||'');
                if(s.includes(':') || e.includes(':')) data.ip_version = 'IPv6';
                else if(s.includes('.') || e.includes('.')) data.ip_version = 'IPv4';
            }
            const btn = document.getElementById(ADD_SAVE_ID);
            if(btn) btn.disabled = true;
            try {
                await addRow(data);
                form.reset();
                closeModal(ADD_MODAL_ID);
            } finally {
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
            // Normalize IP policy fields
            // Compute IP count as IP 범위 value
            if(data.start_ip && data.end_ip){
                const cnt = countIPsGlobal(data.start_ip, data.end_ip);
                data.ip_range = (cnt==null) ? '' : formatBigIntKO(cnt);
            } else {
                data.ip_range = '';
            }
            if(Object.prototype.hasOwnProperty.call(data, 'allocation_rate') && data.allocation_rate !== ''){
                let n = parseInt(String(data.allocation_rate).replace(/[^0-9-]/g,''),10);
                if(!Number.isFinite(n)) n = 0;
                data.allocation_rate = Math.min(100, Math.max(0, n));
            }
            if(!data.ip_version){
                const s = String(data.start_ip||''); const e = String(data.end_ip||'');
                if(s.includes(':') || e.includes(':')) data.ip_version = 'IPv6';
                else if(s.includes('.') || e.includes('.')) data.ip_version = 'IPv4';
            }
            const btn = document.getElementById(EDIT_SAVE_ID);
            if(btn) btn.disabled = true;
            try {
                await updateRow(index, data);
                closeModal(EDIT_MODAL_ID);
            } finally {
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
        // template download — provide an XLSX with Korean headers (no '보안 점수') matching expected upload
        document.getElementById(UPLOAD_TEMPLATE_BTN_ID)?.addEventListener('click', async ()=>{
            try{ await ensureXLSX(); }catch(_e){ showMessage('템플릿 생성을 위한 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.', '오류'); return; }
            try{
                const XLSX = window.XLSX;
                // Main template sheet: headers only (order enforced by validator)
                const wsTemplate = XLSX.utils.aoa_to_sheet([UPLOAD_HEADERS_KO]);
                // Set reasonable column widths
                wsTemplate['!cols'] = UPLOAD_HEADERS_KO.map((h)=>{
                    if(h==='IP 범위') return { wch: 28 };
                    if(h==='시작주소' || h==='종료주소') return { wch: 22 };
                    if(h==='비고') return { wch: 24 };
                    return { wch: 14 };
                });

                // Guide sheet: rules and allowed values (Korean)
                const rules = [
                    ['엑셀 업로드 가이드'],
                    [''],
                    ['작성 규칙'],
                    ['- 첫 행의 컬럼 제목은 아래 순서와 완전히 일치해야 합니다. (순서/이름 변경 불가)'],
                    ['- "할당률"은 0~100 사이의 숫자만 입력하세요.'],
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
                XLSX.writeFile(wb, 'ip_policy_upload_template.xlsx');
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
                        // Validation rules (IP 정책)
                        if(rec.allocation_rate !== '' && !isIntegerLike(rec.allocation_rate)){
                            errors.push(`Row ${r+1}: 할당률은 0~100 사이의 숫자만 입력하세요.`);
                        }
                        if(rec.allocation_rate !== ''){
                            let n = parseInt(rec.allocation_rate,10);
                            if(!(n>=0 && n<=100)) errors.push(`Row ${r+1}: 할당률은 0~100 범위여야 합니다.`);
                            rec.allocation_rate = Math.min(100, Math.max(0, n));
                        }
                        const okStatus = ['활성','예약','비활성'];
                        if(rec.status && !okStatus.includes(rec.status)){
                            errors.push(`Row ${r+1}: 상태는 ${okStatus.join('/')} 중 하나여야 합니다.`);
                        }
                        const okVer = ['IPv4','IPv6'];
                        if(rec.ip_version && !okVer.includes(rec.ip_version)){
                            errors.push(`Row ${r+1}: IP 버전은 IPv4/IPv6 중 하나여야 합니다.`);
                        }
                        imported.push(rec);
                    }
                    if(errors.length){
                        const preview = errors.slice(0, 20).join('\n');
                        const more = errors.length>20 ? `\n...외 ${errors.length-20}건` : '';
                        showMessage(`업로드 실패: 유효성 검사 오류가 있습니다.\n\n${preview}${more}`, '업로드 실패');
                        return;
                    }
                    let success = 0;
                    try {
                        for(const item of imported){
                            await addRow(item);
                            success += 1;
                        }
                    } catch(_err){
                        if(success === 0){
                            showMessage('업로드 중 오류가 발생했습니다. 입력 데이터를 다시 확인해주세요.', '업로드 실패');
                        } else {
                            showMessage(`일부 행만 저장되었습니다. (성공: ${success}개)`, '업로드 경고');
                        }
                        return;
                    }
                    showMessage(`${success}개 행이 업로드되었습니다.`, '업로드 완료');
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
            const clones = originals.map(o=>{
                const copy = {...o};
                delete copy.id; // new id assigned
                if(copy.ip_range){ copy.ip_range = copy.ip_range + ' _COPY'; }
                return copy;
            });
            const confirmBtn = document.getElementById('system-duplicate-confirm');
            if(confirmBtn) confirmBtn.disabled = true;
            try {
                for(const clone of clones){
                    await addRow(clone);
                }
                closeModal('system-duplicate-modal');
                showMessage(clones.length + '개 행이 복제되었습니다.', '완료');
            } catch(_err){
                // addRow already 노출 오류
            } finally {
                if(confirmBtn) confirmBtn.disabled = false;
            }
        });
        // dispose (불용처리)
        document.getElementById(DISPOSE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('불용처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('dispose-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 IP 정책을 정말 불용처리하시겠습니까?`; }
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
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 IP 정책을 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', async ()=>{
            const ids = [...state.selected];
            if(ids.length === 0){ closeModal(DELETE_MODAL_ID); return; }
            const btn = document.getElementById(DELETE_CONFIRM_ID);
            if(btn) btn.disabled = true;
            try {
                await deleteRowsByIds(ids);
                closeModal(DELETE_MODAL_ID);
                setTimeout(()=> showMessage(`${ids.length}개 항목이 삭제되었습니다.`, '완료'), 0);
            } finally {
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
                const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                if(editSaveEl){ editSaveEl.setAttribute('data-index', realIndex); }
                return;
            }
            // 2개 이상 → 일괄변경 모달
            const subtitle = document.getElementById('bulk-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 IP 정책에서 지정한 필드를 일괄 변경합니다.`; }
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
            refreshLocationSelectOptions();
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
        const EXCLUDE = new Set([]);
        function inputFor(col){
            if(col === 'sw_status'){
                return `<select class="form-input" data-bulk-field="sw_status">
                    <option value="">선택</option>
                    <option value="사용">사용</option>
                    <option value="미사용">미사용</option>
                </select>`;
            }
            if(col === 'lic_type'){
                const opts = ['', '임시', '영구구매(1회)', '서브스크립션(1년)', '서브스크립션(2년)', '서브스크립션(3년)', '서브스크립션(4년)', '서브스크립션(5년)'];
                return `<select class="form-input" data-bulk-field="lic_type">${opts.map(o=>`<option value="${o}">${o===''?'선택':o}</option>`).join('')}</select>`;
            }
            if(col === 'lic_total') return `<input type="number" min="0" step="1" class="form-input" data-bulk-field="lic_total" placeholder="숫자">`;
            // lic_assigned / lic_idle: 일괄변경에서는 표시/변경하지 않음
            // lic_key, lic_period removed
            if(col === 'lic_desc') return `<textarea class="form-input textarea-large" rows="6" data-bulk-field="lic_desc" placeholder="설명"></textarea>`;
            return `<input class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }
        const GROUPS = [
            { title:'소프트웨어', cols:['sw_type','sw_status','sw_vendor','sw_name','sw_version'] },
            { title:'담당자', cols:['sw_dept','sw_owner'] },
            // 점검: 수정 모달과 동일한 배치에서 할당/유휴 제외, 키/기간 제거
            { title:'점검', cols:['lic_type','lic_total','lic_desc'] }
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
        // 수정 모달과 동일하게 날짜/계산 동기화 적용
        attachLicenseLiveSync(BULK_FORM_ID);
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
        // 소프트웨어 섹션
        // IP 정책에 맞춘 요약 통계
        // 1) 상태 분포
        renderStatBlock('stats-software', '상태', countBy(rows, 'status', ['활성','예약','비활성']));
        // 2) IP 버전 분포
        renderStatBlock('stats-software', 'IP 버전', countBy(rows, 'ip_version', ['IPv4','IPv6']));
        // 3) 위치 Top5
        renderStatBlock('stats-versions', '위치', countBy(rows, 'location'));
        // 4) 역할 Top5
        renderStatBlock('stats-check', '역할', countBy(rows, 'role'));
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
        bindEvents();
        enhanceFormSearchableSelects(ADD_FORM_ID);
        setupLocationFields(ADD_FORM_ID);
        render();
        initData();
        // Page adornments (animation + popover)
}
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


