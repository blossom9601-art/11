/**
 * 네트워크 정책 관리 - DNS 페이지 스크립트
 * - 컬럼 토글 (기본 10개 노출)
 * - 로컬(in-memory) 데이터 렌더링 + 페이징 + 검색
 * - 모달 (등록/수정/컬럼 선택)
 * - CSV 다운로드 (현재 페이지 or 전체)
 * NOTE: 서버 연동 전 단계로 mock 데이터 사용
 */

(function(){
    // External dependencies
    const LOTTIE_CDN = 'https://unpkg.com/lottie-web@5.12.2/build/player/lottie.min.js';
    function ensureLottie(cb){
        if(window.lottie){ cb(); return; }
        const s = document.createElement('script'); s.src = LOTTIE_CDN; s.async = true; s.onload = ()=> cb(); document.head.appendChild(s);
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

    // Stats (통계)
    const STATS_BTN_ID = 'system-stats-btn';
    const STATS_MODAL_ID = 'system-stats-modal';
    const STATS_CLOSE_ID = 'system-stats-close';
    const STATS_OK_ID = 'system-stats-ok';

    // Data + State
    const BASE_VISIBLE_COLUMNS = [
        'status','domain','record_count','dns_type','ttl','managed_by','role'
    ];
    const COLUMN_ORDER = [
        'status','domain','record_count','dns_type','ttl','managed_by','role'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '기본', columns: ['status'] },
        { group: '도메인', columns: ['domain'] },
        { group: '정보', columns: ['record_count','dns_type','ttl','managed_by','role'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        status:{label:'상태',group:'기본'},
        domain:{label:'도메인명',group:'도메인'},
        record_count:{label:'레코드수',group:'정보'},
        dns_type:{label:'유형',group:'정보'},
        ttl:{label:'TTL',group:'정보'},
        managed_by:{label:'관리주체',group:'정보'},
        role:{label:'역할',group:'정보'}
    };

    const API_ENDPOINT = '/api/network/dns-policies';
    const JSON_HEADERS = { 'Content-Type': 'application/json' };
    const API_PAGE_SIZE = 200;

    let state = {
        data: [],
        filtered: [],
        pageSize: 10,
        page: 1,
        // DNS 페이지는 화면 컬럼을 항상 전체 노출 (컬럼 선택 기능 사용 안함)
        visibleCols: new Set(COLUMN_ORDER),
        search: '',
        // 선택된 행 (row id 기반) 저장하여 리렌더 후에도 유지
        selected: new Set(),
        sortKey: null,
        sortDir: 'asc',
        columnFilters: {}, // { col: value | [values...] } (조건 필터 기능 제거 예정 - 빈 유지)
        isFetching: false,
    };

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;

    async function fetchJson(url, options){
        const resp = await fetch(url, options);
        let data = null;
        try {
            data = await resp.json();
        } catch(_err){
            data = null;
        }
        const success = data == null || data.success !== false;
        if(!resp.ok || !success){
            const message = data && data.message ? data.message : `요청 실패: ${resp.status}`;
            throw new Error(message);
        }
        return data || {};
    }

    function normalizeDnsRow(raw){
        if(!raw) return null;
        const ttlRaw = (raw.ttl ?? 3600);
        const ttlParsed = parseInt(String(ttlRaw).replace(/,/g, '').trim(), 10);
        return {
            id: raw.id,
            status: raw.status || '',
            domain: raw.domain || '',
            record_count: raw.record_count ?? raw.recordCount ?? '',
            dns_type: raw.dns_type ?? raw.dnsType ?? raw.type ?? '',
            ttl: Number.isFinite(ttlParsed) && ttlParsed >= 0 ? ttlParsed : 3600,
            managed_by: raw.managed_by ?? raw.managedBy ?? raw.owner ?? '',
            role: raw.role || '',
            note: raw.note || raw.remark || '',
            remark: raw.remark || raw.note || '',
            created_at: raw.created_at || '',
            created_by: raw.created_by || '',
            updated_at: raw.updated_at || '',
            updated_by: raw.updated_by || '',
        };
    }

    function toggleSearchLoader(flag){
        const loader = document.getElementById('system-search-loader');
        if(loader){ loader.classList.toggle('is-active', !!flag); }
    }

    async function loadAllPolicies(){
        state.isFetching = true;
        toggleSearchLoader(true);
        try {
            const rows = [];
            let page = 1;
            let total = 0;
            while(true){
                const qs = new URLSearchParams({ page: String(page), page_size: String(API_PAGE_SIZE) });
                const payload = await fetchJson(`${API_ENDPOINT}?${qs.toString()}`);
                const items = (payload.items || []).map(normalizeDnsRow).filter(Boolean);
                rows.push(...items);
                total = payload.total ?? rows.length;
                if(rows.length >= total || items.length === 0){
                    break;
                }
                page += 1;
            }
            state.data = rows;
            state.selected.clear();
            applyFilter();
        } catch(err){
            console.error(err);
            state.data = [];
            state.selected.clear();
            applyFilter();
        } finally {
            state.isFetching = false;
            toggleSearchLoader(false);
        }
    }

    async function initData(){
        await loadAllPolicies();
    }

    function buildPayloadFromForm(raw){
        const rcRaw = raw.record_count ?? raw.recordCount;
        const payload = {
            status: raw.status || '',
            domain: raw.domain || '',
            dns_type: raw.dns_type || '',
            managed_by: raw.managed_by || '',
            role: raw.role || '',
        };
        const rcStr = (rcRaw == null) ? '' : String(rcRaw).trim();
        if(rcStr !== '' && rcStr !== '-'){
            const rc = parseInt(rcStr, 10);
            if(Number.isFinite(rc) && rc >= 0){
                payload.record_count = rc;
            }
        }
        const ttlStr = (raw.ttl == null) ? '' : String(raw.ttl).trim();
        if(ttlStr === ''){
            payload.ttl = 3600;
        } else {
            const ttlClean = ttlStr.replace(/,/g, '');
            const ttl = parseInt(ttlClean, 10);
            if(Number.isFinite(ttl) && ttl >= 0){
                payload.ttl = ttl;
            }
        }
        payload.note = raw.note ?? '';
        payload.remark = raw.note ?? '';
        return payload;
    }

    async function createRemotePolicy(data){
        const resp = await fetchJson(API_ENDPOINT, {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify(data),
        });
        if(!resp.item){ throw new Error('응답 데이터가 올바르지 않습니다.'); }
        return normalizeDnsRow(resp.item);
    }

    async function updateRemotePolicy(id, data){
        const resp = await fetchJson(`${API_ENDPOINT}/${id}`, {
            method: 'PUT',
            headers: JSON_HEADERS,
            body: JSON.stringify(data),
        });
        if(!resp.item){ throw new Error('응답 데이터가 올바르지 않습니다.'); }
        return normalizeDnsRow(resp.item);
    }

    async function deleteRemotePolicies(ids){
        if(!ids || !ids.length) return { deleted: 0 };
        if(ids.length === 1){
            const resp = await fetchJson(`${API_ENDPOINT}/${ids[0]}`, { method: 'DELETE' });
            return resp;
        }
        return await fetchJson(`${API_ENDPOINT}/bulk-delete`, {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify({ ids }),
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
                    if(titleEl) titleEl.textContent = 'DNS 레코드 내역이 없습니다.';
                    if(descEl) descEl.textContent = "우측 상단 '추가' 버튼을 눌러 첫 DNS 레코드를 등록하세요.";
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
                let tokenForRegex = tok;
                if(col === 'ttl' && /^\d+$/.test(tok)){
                    try { tokenForRegex = Number(tok).toLocaleString('ko-KR'); } catch(_e){}
                }
                const esc = tokenForRegex.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
                const regex = new RegExp(esc, 'ig');
                output = output.replace(regex, m=>`<mark class=\"search-hit\">${m}</mark>`);
            });
            return output;
        }
        // (DNS 표에는 범위 계산 등 특수 렌더링 없음)

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
                    // DNS 상태 배지 표시
                    if(col === 'status'){
                        const v = String(displayVal);
                        const map = { '활성':'ws-run', '예약':'ws-idle', '비활성':'ws-wait' };
                        const cls = map[v] || 'ws-wait';
                        cellValue = `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${highlight(displayVal, col)}</span></span>`;
                    }
                    // 도메인명: 상세 페이지 링크
                    if(col === 'domain'){
                        const href = row.id ? (`/p/gov_dns_policy_detail?id=${encodeURIComponent(String(row.id))}`) : '';
                        const labelHtml = highlight(displayVal, col);
                        cellValue = href ? `<a class="work-name-link" href="${href}">${labelHtml}</a>` : labelHtml;
                    }
                    // TTL: 화면에서는 3자리 콤마 포맷(예: 1,000). 저장/DB는 숫자만 유지.
                    if(col === 'ttl'){
                        const ttlNum = parseInt(String(rawVal ?? '').replace(/,/g, '').trim(), 10);
                        if(Number.isFinite(ttlNum)){
                            const ttlDisplay = ttlNum.toLocaleString('ko-KR');
                            cellValue = highlight(ttlDisplay, col);
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

    const VISIBLE_COLS_KEY = 'dns_visible_cols';
    function saveColumnSelection(){
        // no-op: DNS 페이지는 항상 전체 컬럼 노출
    }
    function loadColumnSelection(){
        // DNS 페이지는 컬럼 선택을 사용하지 않으므로 항상 전체 컬럼 노출
        state.visibleCols = new Set(COLUMN_ORDER);
        try { localStorage.removeItem(VISIBLE_COLS_KEY); } catch(_e){}
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
        // 컬럼 선택 기능 비활성: 항상 전체 컬럼 노출
        state.visibleCols = new Set(COLUMN_ORDER);
        applyColumnVisibility();
        closeModal(COLUMN_MODAL_ID);
    }

    function resetColumnSelection(){
        // 컬럼 선택 기능 비활성: 항상 전체 컬럼 노출
        state.visibleCols = new Set(COLUMN_ORDER);
        buildColumnModal();
        applyColumnVisibility();
    }

    // Add / Edit
    function collectForm(form){
        const data={};
        form.querySelectorAll('input,select,textarea').forEach(el=>{ data[el.name]=el.value.trim(); });
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

    function formatIntKO(n){
        const parsed = parseInt(String(n ?? '').replace(/,/g,'').trim(), 10);
        if(!Number.isFinite(parsed)) return '';
        try { return parsed.toLocaleString('ko-KR'); } catch(_e){
            return String(parsed).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        }
    }

    function attachTtlCommaFormatting(root){
        const el = root?.querySelector?.('[name="ttl"]');
        if(!el) return;

        let isFormatting = false;
        function caretPosFromDigits(formatted, digitsBefore){
            if(digitsBefore <= 0) return 0;
            let count = 0;
            for(let i=0;i<formatted.length;i++){
                if(/\d/.test(formatted[i])){
                    count++;
                    if(count >= digitsBefore) return i+1;
                }
            }
            return formatted.length;
        }

        // real-time format: digits only (commas are inserted automatically)
        el.addEventListener('input', ()=>{
            if(isFormatting) return;
            isFormatting = true;
            try {
                const v = String(el.value ?? '');
                const caret = el.selectionStart ?? v.length;
                const digitsBefore = (v.slice(0, caret).match(/\d/g) || []).length;
                const digits = v.replace(/\D/g, '');
                if(digits === ''){
                    el.value = '';
                    el.setSelectionRange?.(0,0);
                    return;
                }
                const formatted = formatIntKO(digits);
                el.value = formatted;
                const nextCaret = caretPosFromDigits(formatted, digitsBefore);
                el.setSelectionRange?.(nextCaret, nextCaret);
            } finally {
                isFormatting = false;
            }
        });

        // On focus: keep value as-is; caret-friendly editing happens via input handler
        el.addEventListener('focus', ()=>{
            // no-op
        });

        // format on blur (default to 3600 if blank)
        el.addEventListener('blur', ()=>{
            const cleaned = String(el.value ?? '').replace(/\D/g,'').trim();
            if(cleaned === ''){
                el.value = formatIntKO(3600);
                return;
            }
            el.value = formatIntKO(cleaned);
        });

        // initial format
        const initial = String(el.value ?? '').trim();
        if(initial !== '') el.value = formatIntKO(initial);
    }
    function attachIpFormEnhancements(formId, outputSpanId){
        const form = document.getElementById(formId); if(!form) return;
        const startEl = form.querySelector('[name="start_ip"]');
        const endEl = form.querySelector('[name="end_ip"]');
        const out = outputSpanId ? form.querySelector(`#${outputSpanId}`) : null;
        const sanitize = (el)=>{
            if(!el) return;
            const v = el.value;
            const nv = v.replace(/[^0-9\.:]/g, '');
            if(v !== nv) el.value = nv;
        };
        const update = ()=>{
            if(!out) return;
            const s = startEl?.value?.trim();
            const e = endEl?.value?.trim();
            const cnt = countIPsGlobal(s, e);
            // Support both span text and disabled input value
            if(out.tagName && out.tagName.toLowerCase() === 'input'){
                out.value = (cnt==null) ? '-' : formatBigIntKO(cnt);
            } else {
                out.textContent = (cnt==null) ? '-' : formatBigIntKO(cnt);
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
        const section = document.createElement('div'); section.className='form-section';
    section.innerHTML = `<div class="section-header"><h4>DNS 레코드</h4></div>`;
        const grid = document.createElement('div'); grid.className='form-grid';
        const ttlDisplay = formatIntKO((row && row.ttl != null && row.ttl !== '') ? row.ttl : 3600);
        grid.innerHTML = `
            <div class="form-row"><label>상태</label>
                <select name="status" class="form-input search-select fk-select" data-placeholder="상태 선택" data-searchable-scope="page">
                    <option value="" ${!row.status?'selected':''}>선택</option>
                    <option value="활성" ${row.status==='활성'?'selected':''}>활성</option>
                    <option value="예약" ${row.status==='예약'?'selected':''}>예약</option>
                    <option value="비활성" ${row.status==='비활성'?'selected':''}>비활성</option>
                </select>
            </div>
            <div class="form-row"><label>도메인명</label><input name="domain" class="form-input" value="${row.domain??''}" placeholder="example.com"></div>
            <div class="form-row"><label>레코드수</label><input name="record_count" type="text" class="form-input locked-input" value="${(row.record_count==null || row.record_count==='') ? '-' : row.record_count}" placeholder="-" readonly disabled></div>
            <div class="form-row"><label>유형</label>
                <select name="dns_type" class="form-input search-select fk-select" data-placeholder="유형 선택" data-searchable-scope="page">
                    <option value="" ${!row.dns_type?'selected':''}>선택</option>
                    <option value="Primary" ${row.dns_type==='Primary'?'selected':''}>Primary</option>
                    <option value="Secondary" ${row.dns_type==='Secondary'?'selected':''}>Secondary</option>
                    <option value="Stub" ${row.dns_type==='Stub'?'selected':''}>Stub</option>
                    <option value="Forward" ${row.dns_type==='Forward'?'selected':''}>Forward</option>
                    <option value="Delegated" ${row.dns_type==='Delegated'?'selected':''}>Delegated</option>
                    <option value="External" ${row.dns_type==='External'?'selected':''}>External</option>
                    <option value="AD-Integrated" ${row.dns_type==='AD-Integrated'?'selected':''}>AD-Integrated</option>
                </select>
            </div>
            <div class="form-row"><label>TTL</label><input name="ttl" type="text" inputmode="numeric" pattern="[0-9,]*" class="form-input" value="${ttlDisplay}" autocomplete="off"></div>
            <div class="form-row"><label>관리주체</label>
                <select name="managed_by" class="form-input search-select fk-select" data-placeholder="관리주체 선택" data-searchable-scope="page">
                    <option value="" ${!row.managed_by?'selected':''}>선택</option>
                    <option value="Internal" ${row.managed_by==='Internal'?'selected':''}>Internal</option>
                    <option value="External" ${row.managed_by==='External'?'selected':''}>External</option>
                    <option value="AD" ${row.managed_by==='AD'?'selected':''}>AD</option>
                    <option value="MSP" ${row.managed_by==='MSP'?'selected':''}>MSP</option>
                    <option value="Cloud" ${row.managed_by==='Cloud'?'selected':''}>Cloud</option>
                </select>
            </div>
            <div class="form-row"><label>역할</label><input name="role" class="form-input" value="${row.role??''}" placeholder="예: 내부/외부/CDN"></div>
            <div class="form-row form-row-wide"><label>비고</label><textarea name="note" class="form-input textarea-large" rows="6">${row.note??''}</textarea></div>
        `;
        section.appendChild(grid);
        form.appendChild(section);

        // TTL comma formatting in edit modal
        attachTtlCommaFormatting(form);
    }

    function generateFieldInput(col,value=''){
        // software selects/search-selects
        if(col==='sw_status'){
            const v = String(value??'');
            return `<select name="sw_status" class="form-input search-select fk-select" data-placeholder="상태 선택" data-searchable-scope="page">
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="사용" ${v==='사용'?'selected':''}>사용</option>
                <option value="미사용" ${v==='미사용'?'selected':''}>미사용</option>
            </select>`;
        }
        if(col==='sw_type'){
            const v = String(value??'');
            return `<select name="sw_type" class="form-input search-select fk-select" data-placeholder="유형 선택" data-searchable-scope="page">
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
            return `<select name="lic_type" class="form-input search-select fk-select" data-placeholder="라이선스 선택" data-searchable-scope="page">${opts.map(o=>`<option value="${o}" ${o===v?'selected':''}>${o===''?'선택':o}</option>`).join('')}</select>`;
        }
        if(col==='lic_total') return `<input name="${col}" type="number" min="0" step="1" class="form-input" value="${value??''}" placeholder="숫자만">`;
        if(col==='lic_assigned') return `<input name="${col}" type="number" min="0" step="1" class="form-input" value="${value??''}" placeholder="-" readonly disabled>`;
        if(col==='lic_idle') return `<input name="${col}" type="number" min="0" step="1" class="form-input" value="${value??''}" placeholder="자동 계산" readonly disabled>`;
        // lic_key / lic_period removed
                    if(col==='lic_desc') return `<textarea name="${col}" class="form-input textarea-large" rows="6">${value??''}</textarea>`;
        return `<input name="${col}" class="form-input" value="${value??''}">`;
    }

    // Live-sync helpers for license fields in Add/Edit forms
    function attachLicenseLiveSync(formId){
    // No-op for DNS 페이지; kept to avoid breaking shared wiring
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


    function addRow(data){
        if(!data || data.id == null){ return; }
        const idx = state.data.findIndex(row=> row.id === data.id);
        if(idx === -1){
            state.data.unshift(data);
        } else {
            state.data[idx] = { ...state.data[idx], ...data };
        }
        applyFilter();
    }

    function updateRow(id,data){
        if(id == null) return;
        const index = state.data.findIndex(row=> row.id === id);
        if(index !== -1){
            state.data[index] = { ...state.data[index], ...data };
            applyFilter();
        }
    }

    function removeRowsByIds(ids){
        if(!ids || !ids.length) return 0;
        const idSet = new Set(ids.map(id=> parseInt(id, 10)).filter(Number.isFinite));
        if(!idSet.size) return 0;
        const before = state.data.length;
        state.data = state.data.filter(row=> !idSet.has(row.id));
        idSet.forEach(id=> state.selected.delete(id));
        applyFilter();
        return before - state.data.length;
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
            ...visibleCols.map(c=> r[c] ?? '')
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
    const filename = `dns_record_list_${yyyy}${mm}${dd}.csv`;
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
                    const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                    if(editSaveEl){ editSaveEl.setAttribute('data-id', String(rid)); }
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
        const addSaveBtn = document.getElementById(ADD_SAVE_ID);
        let addPending = false;
        document.getElementById(ADD_BTN_ID)?.addEventListener('click', ()=> { openModal(ADD_MODAL_ID); });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));

        // TTL comma formatting in add modal
        attachTtlCommaFormatting(document.getElementById(ADD_FORM_ID));

        addSaveBtn?.addEventListener('click', async ()=>{
            if(addPending) return;
            const form = document.getElementById(ADD_FORM_ID);
            if(!form.checkValidity()){ form.reportValidity(); return; }
            const raw = collectForm(form);
            const payload = buildPayloadFromForm(raw);
            addPending = true;
            addSaveBtn.disabled = true;
            try {
                const created = await createRemotePolicy(payload);
                addRow(created);
                form.reset();
                closeModal(ADD_MODAL_ID);
                showMessage('DNS 레코드가 등록되었습니다.', '완료');
            } catch(err){
                console.error(err);
                showMessage(err.message || 'DNS 레코드 등록 중 오류가 발생했습니다.', '오류');
            } finally {
                addPending = false;
                addSaveBtn.disabled = false;
            }
        });
        // edit modal
        document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        const editSaveBtn = document.getElementById(EDIT_SAVE_ID);
        let editPending = false;
        editSaveBtn?.addEventListener('click', async ()=>{
            if(editPending) return;
            const form = document.getElementById(EDIT_FORM_ID);
            if(!form.checkValidity()){ form.reportValidity(); return; }
            const rowId = parseInt(editSaveBtn.getAttribute('data-id') || '-1', 10);
            if(!Number.isInteger(rowId) || rowId <= 0){ showMessage('수정 대상이 올바르지 않습니다.', '오류'); return; }
            const payload = buildPayloadFromForm(collectForm(form));
            editPending = true;
            editSaveBtn.disabled = true;
            try {
                const updated = await updateRemotePolicy(rowId, payload);
                updateRow(rowId, updated);
                closeModal(EDIT_MODAL_ID);
                showMessage('DNS 레코드가 수정되었습니다.', '완료');
            } catch(err){
                console.error(err);
                showMessage(err.message || 'DNS 레코드 수정 중 오류가 발생했습니다.', '오류');
            } finally {
                editPending = false;
                editSaveBtn.disabled = false;
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
        // delete (삭제처리)
        document.getElementById(DELETE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('삭제처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('delete-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 DNS 레코드를 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        const deleteConfirmBtn = document.getElementById(DELETE_CONFIRM_ID);
        let deletePending = false;
        deleteConfirmBtn?.addEventListener('click', async ()=>{
            if(deletePending) return;
            const ids = [...state.selected];
            if(ids.length === 0){ closeModal(DELETE_MODAL_ID); return; }
            deletePending = true;
            deleteConfirmBtn.disabled = true;
            try {
                const result = await deleteRemotePolicies(ids);
                const removed = removeRowsByIds(ids);
                closeModal(DELETE_MODAL_ID);
                const deletedCount = result?.deleted ?? removed;
                if(deletedCount > 0){
                    showMessage(`${deletedCount}개 항목이 삭제되었습니다.`, '완료');
                }
            } catch(err){
                console.error(err);
                showMessage(err.message || 'DNS 정책 삭제 중 오류가 발생했습니다.', '오류');
            } finally {
                deletePending = false;
                deleteConfirmBtn.disabled = false;
            }
        });
        // esc close
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ [ADD_MODAL_ID,EDIT_MODAL_ID,COLUMN_MODAL_ID,DELETE_MODAL_ID,'system-download-modal','system-message-modal'].forEach(closeModal); }});
    // include stats modal in esc close
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeModal(STATS_MODAL_ID); }});

        // message modal bindings
        document.getElementById('system-message-close')?.addEventListener('click', ()=> closeModal('system-message-modal'));
        document.getElementById('system-message-ok')?.addEventListener('click', ()=> closeModal('system-message-modal'));

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
        // DNS 요약 통계
        // 1) 상태 분포
        renderStatBlock('stats-software', '상태', countBy(rows, 'status', ['활성','예약','비활성']));
        // 2) 역할 Top5
        renderStatBlock('stats-software', '역할', countBy(rows, 'role'));
        // 3) 도메인 Top5
        renderStatBlock('stats-versions', '도메인', countBy(rows, 'domain'));
        // 4) 레코드수 Top5
        renderStatBlock('stats-check', '레코드수', countBy(rows, 'record_count'));
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
        initData();
        bindEvents();
        render();
        // Page adornments (animation + popover)
}
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


