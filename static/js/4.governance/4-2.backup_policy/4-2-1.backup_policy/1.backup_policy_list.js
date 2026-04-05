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
                // 백업 정책(백업 대상 정책) 페이지
                // - bk_backup_target_policy CRUD 연동
                // - 스토리지 풀 기준설정(bk_storage_pool) CRUD 연동
                (function(){
                    const TABLE_ID = 'system-table';
                    const TBODY_ID = 'system-table-body';
                    const COUNT_ID = 'system-count';
                    const SEARCH_ID = 'system-search';
                    const SEARCH_CLEAR_ID = 'system-search-clear';
                    const PAGE_SIZE_ID = 'system-page-size';
                    const PAGINATION_INFO_ID = 'system-pagination-info';
                    const PAGE_NUMBERS_ID = 'system-page-numbers';
                    const SELECT_ALL_ID = 'system-select-all';

                    const ADD_MODAL_ID = 'system-add-modal';
                    const ADD_BTN_ID = 'system-add-btn';
                    const ADD_CLOSE_ID = 'system-add-close';
                    const ADD_SAVE_ID = 'system-add-save';
                    const ADD_FORM_ID = 'system-add-form';

                    const EDIT_MODAL_ID = 'system-edit-modal';
                    const EDIT_FORM_ID = 'system-edit-form';
                    const EDIT_CLOSE_ID = 'system-edit-close';
                    const EDIT_SAVE_ID = 'system-edit-save';

                    const DELETE_BTN_ID = 'system-delete-btn';
                    const DELETE_MODAL_ID = 'system-delete-modal';
                    const DELETE_CLOSE_ID = 'system-delete-close';
                    const DELETE_CONFIRM_ID = 'system-delete-confirm';

                    const DISPOSE_BTN_ID = 'system-dispose-btn';
                    const BULK_BTN_ID = 'system-bulk-btn';
                    const STATS_BTN_ID = 'system-stats-btn';
                    const DUPLICATE_BTN_ID = 'system-duplicate-btn';
                    const UPLOAD_BTN_ID = 'system-upload-btn';
                    const DOWNLOAD_BTN_ID = 'system-download-btn';
                    const COLUMN_BTN_ID = 'system-column-btn';

                    const EMPTY_ID = 'system-empty';
                    const EMPTY_TITLE_ID = 'system-empty-title';
                    const EMPTY_DESC_ID = 'system-empty-desc';

                    const API_POLICIES = '/api/governance/backup/target-policies';
                    const API_POOLS = '/api/governance/backup/storage-pools';
                    const API_STORAGE_ASSETS = '/api/hardware/storage/backup/assets';
                    const JSON_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

                    // Storage pool modal
                    const STORAGE_POOL_OPEN_BTN = 'storage-pool-open-btn';
                    const STORAGE_POOL_OPEN_INLINE_BTN = 'storage-pool-open-inline';
                    const STORAGE_POOL_MODAL_ID = 'storage-pool-modal';
                    const STORAGE_POOL_CLOSE_ID = 'storage-pool-close';
                    const STORAGE_POOL_FORM_ID = 'storage-pool-form';
                    const STORAGE_POOL_SAVE_ID = 'storage-pool-save';
                    const STORAGE_POOL_RESET_ID = 'storage-pool-reset';
                    const STORAGE_POOL_TBODY_ID = 'storage-pool-tbody';
                    const STORAGE_POOL_SELECT_ALL_ID = 'storage-pool-select-all';
                    const STORAGE_POOL_DELETE_ID = 'storage-pool-delete';

                    let state = {
                        data: [],
                        filtered: [],
                        pageSize: 10,
                        page: 1,
                        search: '',
                        selected: new Set(),
                        isLoading: false,
                    };

                    let storagePools = []; // {id, pool_name, storage_asset_id, storage_asset_name, remark}
                    let storageAssets = []; // hardware assets

                    function escapeHTML(s){
                        return String(s ?? '')
                            .replaceAll('&','&amp;')
                            .replaceAll('<','&lt;')
                            .replaceAll('>','&gt;')
                            .replaceAll('"','&quot;')
                            .replaceAll("'",'&#39;');
                    }

                    function openModal(id){
                        const el = document.getElementById(id); if(!el) return;
                        el.classList.add('show');
                        el.setAttribute('aria-hidden','false');
                        document.body.classList.add('modal-open');
                    }
                    function closeModal(id){
                        const el = document.getElementById(id); if(!el) return;
                        el.classList.remove('show');
                        el.setAttribute('aria-hidden','true');
                        if(!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show')){
                            document.body.classList.remove('modal-open');
                        }
                    }
                    function showMessage(message, title){
                        const titleEl = document.getElementById('message-title');
                        const contentEl = document.getElementById('message-content');
                        if(titleEl) titleEl.textContent = title || '알림';
                        if(contentEl) contentEl.textContent = String(message || '');
                        openModal('system-message-modal');
                    }

                    async function fetchJson(url, options){
                        const res = await fetch(url, options);
                        let body = null;
                        try { body = await res.json(); } catch(_e) {}
                        if(!res.ok || (body && body.success === false)){
                            const msg = body?.message || `HTTP ${res.status}`;
                            const err = new Error(msg);
                            err.status = res.status;
                            err.body = body;
                            throw err;
                        }
                        return body;
                    }

                    function retentionLabel(item){
                        const unit = String(item?.retention_unit || '').trim();
                        if(unit === 'Infinity') return '무기한';
                        const v = item?.retention_value;
                        if(v == null || String(v).trim() === '') return '';
                        return `${v}${unit}`;
                    }

                    function setEmptyState(visible){
                        const empty = document.getElementById(EMPTY_ID);
                        if(!empty) return;
                        empty.hidden = !visible;
                    }

                    function applySearch(){
                        const q = (state.search || '').trim().toLowerCase();
                        if(!q){
                            state.filtered = [...state.data];
                        } else {
                            state.filtered = state.data.filter(item => {
                                const hay = [
                                    item.backup_scope,
                                    item.backup_policy_name,
                                    item.backup_directory,
                                    item.data_type,
                                    item.backup_grade,
                                    item.storage_pool_name,
                                    item.offsite_yn,
                                    item.media_type,
                                    item.schedule_name,
                                    item.start_time,
                                    item.business_name,
                                    item.system_name,
                                    item.ip_address,
                                    item.remark,
                                    retentionLabel(item),
                                ].map(v => String(v ?? '').toLowerCase()).join(' ');
                                return hay.includes(q);
                            });
                        }
                        state.page = 1;
                    }

                    function pageCount(){
                        return Math.max(1, Math.ceil((state.filtered.length || 0) / state.pageSize));
                    }

                    function renderCount(){
                        const countEl = document.getElementById(COUNT_ID);
                        if(countEl) countEl.textContent = String(state.filtered.length || 0);
                        const infoEl = document.getElementById(PAGINATION_INFO_ID);
                        if(infoEl) infoEl.textContent = `${state.filtered.length || 0}개 항목`;
                    }

                    function renderPagination(){
                        const totalPages = pageCount();
                        if(state.page > totalPages) state.page = totalPages;
                        const container = document.getElementById(PAGE_NUMBERS_ID);
                        if(!container) return;
                        container.innerHTML = '';
                        const maxButtons = 7;
                        const start = Math.max(1, state.page - Math.floor(maxButtons/2));
                        const end = Math.min(totalPages, start + maxButtons - 1);
                        for(let p=start; p<=end; p++){
                            const btn = document.createElement('button');
                            btn.type='button';
                            btn.className = `page-number ${p===state.page?'active':''}`;
                            btn.textContent = String(p);
                            btn.addEventListener('click', ()=>{ state.page = p; render(); });
                            container.appendChild(btn);
                        }
                        // nav buttons
                        const firstBtn = document.getElementById('system-first');
                        const prevBtn = document.getElementById('system-prev');
                        const nextBtn = document.getElementById('system-next');
                        const lastBtn = document.getElementById('system-last');
                        if(firstBtn) firstBtn.disabled = state.page <= 1;
                        if(prevBtn) prevBtn.disabled = state.page <= 1;
                        if(nextBtn) nextBtn.disabled = state.page >= totalPages;
                        if(lastBtn) lastBtn.disabled = state.page >= totalPages;
                    }

                    function currentPageItems(){
                        const start = (state.page - 1) * state.pageSize;
                        return state.filtered.slice(start, start + state.pageSize);
                    }

                    function renderTable(){
                        const tbody = document.getElementById(TBODY_ID);
                        if(!tbody) return;
                        const rows = currentPageItems();
                        tbody.innerHTML = '';
                        setEmptyState(rows.length === 0);

                        rows.forEach(item => {
                            const tr = document.createElement('tr');
                            const checked = state.selected.has(String(item.id)) ? 'checked' : '';
                            tr.innerHTML = `
                                <td><input type="checkbox" class="system-row-select" data-id="${escapeHTML(item.id)}" ${checked}></td>
                                <td data-col="backup_scope">${escapeHTML(item.backup_scope)}</td>
                                <td data-col="backup_policy_name">${escapeHTML(item.backup_policy_name)}</td>
                                <td data-col="backup_directory">${escapeHTML(item.backup_directory)}</td>
                                <td data-col="data_type">${escapeHTML(item.data_type)}</td>
                                <td data-col="backup_grade">${escapeHTML(item.backup_grade)}</td>
                                <td data-col="retention">${escapeHTML(retentionLabel(item))}</td>
                                <td data-col="storage_pool_name">${escapeHTML(item.storage_pool_name || '')}</td>
                                <td data-col="offsite_yn">${escapeHTML(item.offsite_yn)}</td>
                                <td data-col="media_type">${escapeHTML(item.media_type)}</td>
                                <td data-col="schedule_name">${escapeHTML(item.schedule_name || '')}</td>
                                <td data-col="start_time">${escapeHTML(item.start_time || '')}</td>
                                <td data-col="business_name">${escapeHTML(item.business_name || '')}</td>
                                <td data-col="system_name">${escapeHTML(item.system_name)}</td>
                                <td data-col="ip_address">${escapeHTML(item.ip_address || '')}</td>
                                <td data-col="remark">${escapeHTML(item.remark || '')}</td>
                                <td data-col="actions" class="system-actions">
                                    <button type="button" class="action-btn" data-action="edit" data-id="${escapeHTML(item.id)}" title="수정" aria-label="수정">
                                        <img src="/static/image/svg/list/free-icon-edit.svg" alt="수정">
                                    </button>
                                </td>
                            `.trim();
                            tbody.appendChild(tr);
                        });
                    }

                    function render(){
                        renderCount();
                        renderTable();
                        renderPagination();
                    }

                    async function loadPolicies(){
                        state.isLoading = true;
                        try{
                            const data = await fetchJson(API_POLICIES);
                            state.data = Array.isArray(data?.items) ? data.items : [];
                            applySearch();
                            state.selected.clear();
                            render();
                        } catch(e){
                            showMessage(e.message || '백업 정책 조회 중 오류가 발생했습니다.');
                        } finally {
                            state.isLoading = false;
                        }
                    }

                    async function loadStoragePools(){
                        try{
                            const data = await fetchJson(API_POOLS);
                            storagePools = Array.isArray(data?.items) ? data.items : [];
                            refreshStoragePoolSelects();
                            renderStoragePoolTable();
                        } catch(e){
                            // only show when modal is open to avoid noisy toasts
                            const modal = document.getElementById(STORAGE_POOL_MODAL_ID);
                            if(modal && modal.classList.contains('show')) showMessage(e.message || '스토리지 풀 조회 중 오류가 발생했습니다.');
                        }
                    }

                    async function loadStorageAssets(){
                        try{
                            const data = await fetchJson(API_STORAGE_ASSETS);
                            storageAssets = Array.isArray(data?.items) ? data.items : [];
                            refreshStorageAssetSelect();
                        } catch(e){
                            storageAssets = [];
                        }
                    }

                    function refreshStoragePoolSelects(){
                        const addForm = document.getElementById(ADD_FORM_ID);
                        const addSel = addForm?.querySelector('select[name="storage_pool_id"]');
                        const editForm = document.getElementById(EDIT_FORM_ID);
                        const editSel = editForm?.querySelector('select[name="storage_pool_id"]');
                        const opts = (storagePools || [])
                            .filter(p => Number(p?.is_deleted || 0) === 0)
                            .map(p => ({ value: String(p.id), label: p.storage_asset_name ? `${p.pool_name} (${p.storage_asset_name})` : String(p.pool_name) }));

                        function apply(select){
                            if(!select) return;
                            const current = String(select.value || '');
                            select.innerHTML = '<option value="">선택</option>' + opts.map(o => `<option value="${escapeHTML(o.value)}">${escapeHTML(o.label)}</option>`).join('');
                            if(current) select.value = current;
                        }
                        apply(addSel);
                        apply(editSel);
                    }

                    function refreshStorageAssetSelect(){
                        const form = document.getElementById(STORAGE_POOL_FORM_ID);
                        const sel = form?.querySelector('select[name="storage_asset_id"]');
                        if(!sel) return;
                        const current = String(sel.value || '');
                        const opts = (storageAssets || [])
                            .filter(a => Number(a?.is_deleted || 0) === 0)
                            .map(a => ({ value: String(a.id), label: `${a.asset_name || ''} (${a.asset_code || a.id})` }));
                        sel.innerHTML = '<option value="">선택</option>' + opts.map(o => `<option value="${escapeHTML(o.value)}">${escapeHTML(o.label)}</option>`).join('');
                        if(current) sel.value = current;
                    }

                    function readForm(form){
                        const out = {};
                        form.querySelectorAll('input,select,textarea').forEach(el => {
                            if(!el.name) return;
                            out[el.name] = String(el.value ?? '').trim();
                        });
                        return out;
                    }

                    function validatePolicyPayload(payload){
                        if(!payload.backup_scope) return '백업 구분을 선택하세요.';
                        if(!payload.system_name) return '시스템 이름은 필수입니다.';
                        if(!payload.backup_policy_name) return '백업 정책명은 필수입니다.';
                        if(!payload.backup_directory) return '백업 디렉터리는 필수입니다.';
                        if(!payload.data_type) return '데이터 유형을 선택하세요.';
                        if(!payload.backup_grade) return '백업 등급을 선택하세요.';
                        if(!payload.storage_pool_id) return '스토리지 풀을 선택하세요.';
                        if(!payload.offsite_yn) return '소산여부를 선택하세요.';
                        if(!payload.media_type) return '미디어 구분을 선택하세요.';
                        if(!payload.retention_unit) return '보관 기간 단위를 선택하세요.';
                        if(payload.retention_unit !== 'Infinity'){
                            if(!payload.retention_value) return '보관 기간 숫자를 입력하세요.';
                            const v = Number(payload.retention_value);
                            if(!Number.isInteger(v) || v <= 0) return '보관 기간 숫자는 1 이상의 정수여야 합니다.';
                        }
                        return null;
                    }

                    async function createPolicyFromAddForm(){
                        const form = document.getElementById(ADD_FORM_ID);
                        if(!form) return;
                        const payload = readForm(form);
                        const err = validatePolicyPayload(payload);
                        if(err){ showMessage(err, '유효성 오류'); return; }
                        // coerce types
                        if(payload.retention_unit === 'Infinity') payload.retention_value = '';
                        try{
                            await fetchJson(API_POLICIES, { method:'POST', headers: JSON_HEADERS, body: JSON.stringify(payload) });
                            closeModal(ADD_MODAL_ID);
                            await loadPolicies();
                            showMessage('등록되었습니다.');
                        } catch(e){
                            showMessage(e.message || '등록 중 오류가 발생했습니다.');
                        }
                    }

                    function buildEditFormHtml(item){
                        const poolOptions = (storagePools || [])
                            .filter(p => Number(p?.is_deleted || 0) === 0)
                            .map(p => {
                                const label = p.storage_asset_name ? `${p.pool_name} (${p.storage_asset_name})` : String(p.pool_name);
                                return `<option value="${escapeHTML(p.id)}" ${String(p.id)===String(item.storage_pool_id)?'selected':''}>${escapeHTML(label)}</option>`;
                            })
                            .join('');
                        const sel = (name, options, selected) => {
                            return `<select name="${name}" class="form-input" required>
                                <option value="">선택</option>
                                ${options.map(o => `<option value="${escapeHTML(o)}" ${String(o)===String(selected)?'selected':''}>${escapeHTML(o)}</option>`).join('')}
                            </select>`;
                        };
                        return `
                            <input type="hidden" name="id" value="${escapeHTML(item.id)}">
                            <div class="form-section">
                                <div class="section-header"><h4>기본</h4></div>
                                <div class="form-grid">
                                    <div class="form-row"><label>백업 구분<span class="required">*</span></label>${sel('backup_scope', ['내부망','외부망'], item.backup_scope)}</div>
                                    <div class="form-row"><label>업무명</label><input name="business_name" class="form-input" value="${escapeHTML(item.business_name||'')}" placeholder="입력"></div>
                                    <div class="form-row"><label>시스템 이름<span class="required">*</span></label><input name="system_name" class="form-input" value="${escapeHTML(item.system_name||'')}" required></div>
                                    <div class="form-row"><label>IP 주소</label><input name="ip_address" class="form-input" value="${escapeHTML(item.ip_address||'')}" placeholder="예: 10.0.0.1"></div>
                                </div>
                            </div>
                            <div class="form-section">
                                <div class="section-header"><h4>정책</h4></div>
                                <div class="form-grid">
                                    <div class="form-row"><label>백업 정책명<span class="required">*</span></label><input name="backup_policy_name" class="form-input" value="${escapeHTML(item.backup_policy_name||'')}" required></div>
                                    <div class="form-row"><label>백업 디렉터리<span class="required">*</span></label><input name="backup_directory" class="form-input" value="${escapeHTML(item.backup_directory||'')}" required></div>
                                    <div class="form-row"><label>데이터 유형<span class="required">*</span></label>${sel('data_type', ['ARC','DB','FILE','LOG','OS','SRC','VM'], item.data_type)}</div>
                                </div>
                            </div>
                            <div class="form-section">
                                <div class="section-header"><h4>보관/매체</h4></div>
                                <div class="form-grid">
                                    <div class="form-row"><label>백업 등급<span class="required">*</span></label>${sel('backup_grade', ['1등급','2등급','3등급'], item.backup_grade)}</div>
                                    <div class="form-row"><label>보관 기간<span class="required">*</span></label>
                                        <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 10px;">
                                            <input name="retention_value" type="number" min="1" class="form-input" value="${escapeHTML(item.retention_value ?? '')}" placeholder="숫자">
                                            <select name="retention_unit" class="form-input" required>
                                                <option value="">단위 선택</option>
                                                <option value="주" ${item.retention_unit==='주'?'selected':''}>주</option>
                                                <option value="월" ${item.retention_unit==='월'?'selected':''}>월</option>
                                                <option value="년" ${item.retention_unit==='년'?'selected':''}>년</option>
                                                <option value="Infinity" ${item.retention_unit==='Infinity'?'selected':''}>무기한</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="form-row"><label>스토리지 풀<span class="required">*</span></label>
                                        <select name="storage_pool_id" class="form-input" required>
                                            <option value="">선택</option>
                                            ${poolOptions}
                                        </select>
                                    </div>
                                    <div class="form-row"><label>소산여부<span class="required">*</span></label>${sel('offsite_yn', ['O','X'], item.offsite_yn)}</div>
                                    <div class="form-row"><label>미디어 구분<span class="required">*</span></label>${sel('media_type', ['Client(Network)','Client(SAN)','Media Server'], item.media_type)}</div>
                                    <div class="form-row"><label>스케줄</label><input name="schedule_name" class="form-input" value="${escapeHTML(item.schedule_name||'')}" placeholder="예: FULL_Sat"></div>
                                    <div class="form-row"><label>시작시간</label><input name="start_time" type="time" class="form-input" value="${escapeHTML(item.start_time||'')}"></div>
                                    <div class="form-row"><label>비고</label><input name="remark" class="form-input" value="${escapeHTML(item.remark||'')}" placeholder="입력"></div>
                                </div>
                            </div>
                        `.trim();
                    }

                    function openEditModalById(id){
                        const item = state.data.find(x => String(x.id) === String(id));
                        if(!item){ showMessage('대상을 찾을 수 없습니다.'); return; }
                        const form = document.getElementById(EDIT_FORM_ID);
                        if(!form) return;
                        form.innerHTML = buildEditFormHtml(item);
                        openModal(EDIT_MODAL_ID);
                    }

                    async function saveEdit(){
                        const form = document.getElementById(EDIT_FORM_ID);
                        if(!form) return;
                        const payload = readForm(form);
                        const id = payload.id;
                        const err = validatePolicyPayload(payload);
                        if(err){ showMessage(err, '유효성 오류'); return; }
                        if(payload.retention_unit === 'Infinity') payload.retention_value = '';
                        try{
                            await fetchJson(`${API_POLICIES}/${encodeURIComponent(id)}`, { method:'PUT', headers: JSON_HEADERS, body: JSON.stringify(payload) });
                            closeModal(EDIT_MODAL_ID);
                            await loadPolicies();
                            showMessage('저장되었습니다.');
                        } catch(e){
                            showMessage(e.message || '저장 중 오류가 발생했습니다.');
                        }
                    }

                    function selectedIds(){
                        return Array.from(state.selected).map(String).filter(Boolean);
                    }

                    async function bulkDeleteSelected(){
                        const ids = selectedIds();
                        if(ids.length === 0){ showMessage('선택된 항목이 없습니다.'); return; }
                        try{
                            await fetchJson(`${API_POLICIES}/bulk-delete`, { method:'POST', headers: JSON_HEADERS, body: JSON.stringify({ ids }) });
                            closeModal(DELETE_MODAL_ID);
                            await loadPolicies();
                            showMessage('삭제처리 되었습니다.');
                        } catch(e){
                            showMessage(e.message || '삭제 중 오류가 발생했습니다.');
                        }
                    }

                    // --- Storage pool modal ---
                    function resetStoragePoolForm(){
                        const form = document.getElementById(STORAGE_POOL_FORM_ID);
                        if(!form) return;
                        form.reset();
                        form.querySelector('input[name="id"]')?.setAttribute('value','');
                        const idEl = form.querySelector('input[name="id"]');
                        if(idEl) idEl.value = '';
                    }

                    function renderStoragePoolTable(){
                        const tbody = document.getElementById(STORAGE_POOL_TBODY_ID);
                        if(!tbody) return;
                        const items = (storagePools || []).filter(p => Number(p?.is_deleted || 0) === 0);
                        tbody.innerHTML = items.map(p => {
                            return `
                                <tr>
                                    <td><input type="checkbox" class="storage-pool-row" data-id="${escapeHTML(p.id)}"></td>
                                    <td>${escapeHTML(p.pool_name)}</td>
                                    <td>${escapeHTML(p.storage_asset_name || '')}</td>
                                    <td>${escapeHTML(p.remark || '')}</td>
                                    <td class="system-actions">
                                        <button type="button" class="action-btn" data-action="pool-edit" data-id="${escapeHTML(p.id)}" title="수정" aria-label="수정">
                                            <img src="/static/image/svg/list/free-icon-edit.svg" alt="수정">
                                        </button>
                                    </td>
                                </tr>
                            `.trim();
                        }).join('');
                    }

                    function poolSelectedIds(){
                        return Array.from(document.querySelectorAll(`#${STORAGE_POOL_TBODY_ID} .storage-pool-row:checked`)).map(el => String(el.dataset.id || '')).filter(Boolean);
                    }

                    function fillStoragePoolFormById(id){
                        const item = (storagePools || []).find(x => String(x.id) === String(id));
                        if(!item) return;
                        const form = document.getElementById(STORAGE_POOL_FORM_ID);
                        if(!form) return;
                        form.querySelector('input[name="id"]').value = String(item.id);
                        form.querySelector('input[name="pool_name"]').value = item.pool_name || '';
                        form.querySelector('select[name="storage_asset_id"]').value = String(item.storage_asset_id || '');
                        form.querySelector('input[name="remark"]').value = item.remark || '';
                    }

                    async function saveStoragePool(){
                        const form = document.getElementById(STORAGE_POOL_FORM_ID);
                        if(!form) return;
                        const payload = readForm(form);
                        const id = payload.id;
                        if(!payload.pool_name){ showMessage('스토리지 풀명은 필수입니다.', '유효성 오류'); return; }
                        if(!payload.storage_asset_id){ showMessage('스토리지 장치를 선택하세요.', '유효성 오류'); return; }
                        try{
                            if(id){
                                await fetchJson(`${API_POOLS}/${encodeURIComponent(id)}`, { method:'PUT', headers: JSON_HEADERS, body: JSON.stringify(payload) });
                            } else {
                                await fetchJson(API_POOLS, { method:'POST', headers: JSON_HEADERS, body: JSON.stringify(payload) });
                            }
                            resetStoragePoolForm();
                            await loadStoragePools();
                            await loadPolicies();
                            showMessage('저장되었습니다.');
                        } catch(e){
                            showMessage(e.message || '스토리지 풀 저장 중 오류가 발생했습니다.');
                        }
                    }

                    async function deleteStoragePoolsSelected(){
                        const ids = poolSelectedIds();
                        if(ids.length === 0){ showMessage('선택된 스토리지 풀이 없습니다.'); return; }
                        try{
                            await fetchJson(`${API_POOLS}/bulk-delete`, { method:'POST', headers: JSON_HEADERS, body: JSON.stringify({ ids }) });
                            await loadStoragePools();
                            await loadPolicies();
                            showMessage('삭제처리 되었습니다.');
                        } catch(e){
                            showMessage(e.message || '스토리지 풀 삭제 중 오류가 발생했습니다.');
                        }
                    }

                    async function openStoragePoolModal(){
                        openModal(STORAGE_POOL_MODAL_ID);
                        await loadStorageAssets();
                        await loadStoragePools();
                    }

                    function bind(){
                        document.getElementById(ADD_BTN_ID)?.addEventListener('click', async ()=>{
                            const form = document.getElementById(ADD_FORM_ID);
                            if(form) form.reset();
                            await loadStoragePools();
                            openModal(ADD_MODAL_ID);
                        });
                        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
                        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', ()=> createPolicyFromAddForm());

                        document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
                        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', ()=> saveEdit());

                        document.getElementById(DELETE_BTN_ID)?.addEventListener('click', ()=>{
                            const ids = selectedIds();
                            if(ids.length === 0){ showMessage('선택된 항목이 없습니다.'); return; }
                            const subtitle = document.getElementById('delete-subtitle');
                            if(subtitle) subtitle.textContent = `선택된 ${ids.length}개의 백업 정책을 정말 삭제처리하시겠습니까?`;
                            openModal(DELETE_MODAL_ID);
                        });
                        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
                        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', ()=> bulkDeleteSelected());

                        // Search
                        const searchEl = document.getElementById(SEARCH_ID);
                        searchEl?.addEventListener('input', (e)=>{
                            state.search = e.target.value;
                            applySearch();
                            render();
                        });
                        document.getElementById(SEARCH_CLEAR_ID)?.addEventListener('click', ()=>{
                            if(searchEl) searchEl.value='';
                            state.search='';
                            applySearch();
                            render();
                        });

                        // Page size
                        document.getElementById(PAGE_SIZE_ID)?.addEventListener('change', (e)=>{
                            const v = parseInt(e.target.value, 10);
                            state.pageSize = Number.isFinite(v) && v > 0 ? v : 10;
                            state.page = 1;
                            render();
                        });

                        // Pagination buttons
                        document.getElementById('system-first')?.addEventListener('click', ()=>{ state.page = 1; render(); });
                        document.getElementById('system-prev')?.addEventListener('click', ()=>{ state.page = Math.max(1, state.page-1); render(); });
                        document.getElementById('system-next')?.addEventListener('click', ()=>{ state.page = Math.min(pageCount(), state.page+1); render(); });
                        document.getElementById('system-last')?.addEventListener('click', ()=>{ state.page = pageCount(); render(); });

                        // Table actions
                        document.getElementById(TBODY_ID)?.addEventListener('click', (e)=>{
                            const btn = e.target.closest('button[data-action]');
                            if(!btn) return;
                            const action = btn.dataset.action;
                            const id = btn.dataset.id;
                            if(action === 'edit') openEditModalById(id);
                        });
                        document.getElementById(TBODY_ID)?.addEventListener('change', (e)=>{
                            const cb = e.target.closest('input.system-row-select');
                            if(!cb) return;
                            const id = String(cb.dataset.id || '');
                            if(!id) return;
                            if(cb.checked) state.selected.add(id); else state.selected.delete(id);
                        });
                        document.getElementById(SELECT_ALL_ID)?.addEventListener('change', (e)=>{
                            const checked = !!e.target.checked;
                            const rows = currentPageItems();
                            rows.forEach(item => {
                                const id = String(item.id);
                                if(checked) state.selected.add(id); else state.selected.delete(id);
                            });
                            render();
                        });

                        // Message modal
                        document.getElementById('system-message-close')?.addEventListener('click', ()=> closeModal('system-message-modal'));
                        document.getElementById('system-message-ok')?.addEventListener('click', ()=> closeModal('system-message-modal'));

                        // Unsupported buttons -> show info
                        document.getElementById(DISPOSE_BTN_ID)?.addEventListener('click', ()=> showMessage('현재 페이지에서는 삭제처리를 사용하세요.'));
                        document.getElementById(BULK_BTN_ID)?.addEventListener('click', ()=> showMessage('일괄변경은 준비중입니다.'));
                        document.getElementById(STATS_BTN_ID)?.addEventListener('click', ()=> showMessage('통계는 준비중입니다.'));
                        document.getElementById(DUPLICATE_BTN_ID)?.addEventListener('click', ()=> showMessage('행 복제는 준비중입니다.'));
                        document.getElementById(UPLOAD_BTN_ID)?.addEventListener('click', ()=> showMessage('엑셀 업로드는 준비중입니다.'));
                        document.getElementById(DOWNLOAD_BTN_ID)?.addEventListener('click', ()=> showMessage('CSV 다운로드는 준비중입니다.'));
                        document.getElementById(COLUMN_BTN_ID)?.addEventListener('click', ()=> showMessage('컬럼 선택은 준비중입니다.'));

                        // Storage pool modal
                        document.getElementById(STORAGE_POOL_OPEN_BTN)?.addEventListener('click', ()=> openStoragePoolModal());
                        document.getElementById(STORAGE_POOL_OPEN_INLINE_BTN)?.addEventListener('click', ()=> openStoragePoolModal());
                        document.getElementById(STORAGE_POOL_CLOSE_ID)?.addEventListener('click', ()=> closeModal(STORAGE_POOL_MODAL_ID));
                        document.getElementById(STORAGE_POOL_RESET_ID)?.addEventListener('click', ()=> resetStoragePoolForm());
                        document.getElementById(STORAGE_POOL_SAVE_ID)?.addEventListener('click', ()=> saveStoragePool());
                        document.getElementById(STORAGE_POOL_DELETE_ID)?.addEventListener('click', ()=> deleteStoragePoolsSelected());
                        document.getElementById(STORAGE_POOL_SELECT_ALL_ID)?.addEventListener('change', (e)=>{
                            const checked = !!e.target.checked;
                            document.querySelectorAll(`#${STORAGE_POOL_TBODY_ID} .storage-pool-row`).forEach(cb => { cb.checked = checked; });
                        });
                        document.getElementById(STORAGE_POOL_TBODY_ID)?.addEventListener('click', (e)=>{
                            const btn = e.target.closest('button[data-action="pool-edit"]');
                            if(!btn) return;
                            fillStoragePoolFormById(btn.dataset.id);
                        });

                        // ESC closes modals
                        document.addEventListener('keydown', e=>{
                            if(e.key !== 'Escape') return;
                            [ADD_MODAL_ID, EDIT_MODAL_ID, DELETE_MODAL_ID, STORAGE_POOL_MODAL_ID, 'system-message-modal'].forEach(closeModal);
                        });
                    }

                    async function init(){
                        bind();
                        await loadStoragePools();
                        await loadPolicies();
                        // ensure empty-state copy matches this page
                        const t = document.getElementById(EMPTY_TITLE_ID);
                        const d = document.getElementById(EMPTY_DESC_ID);
                        if(t) t.textContent = '백업 정책 내역이 없습니다.';
                        if(d) d.textContent = "우측 상단 '추가' 버튼을 눌러 첫 정책을 등록하세요.";
                    }

                    init();
                })();
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
    columnFilters: {} // { col: value | [values...] } (조건 필터 기능 제거 예정 - 빈 유지)
    };

    // ---- Shared persistence for dashboard sync ----
    const STORAGE_KEY = 'backup_policies_v1';
    function sanitizeForPersist(rows){
        // Persist only fields needed by dashboard + essentials
        return rows.map(r=>({
            id: r.id,
            schedule: r.schedule || '',
            start_time: r.start_time || '',
            policy_name: r.policy_name || '',
            backup_dir: r.backup_dir || '',
            // map to dashboard naming expectations
            network: r.backup_net || '',
            status: r.status || ''
        }));
    }
    function persistPolicies(){
        try{
            const payload = { ts: Date.now(), items: sanitizeForPersist(state.data) };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        }catch(_e){}
    }
    function loadPersistedPolicies(){
        try{
            const raw = localStorage.getItem(STORAGE_KEY);
            if(!raw) return null;
            const obj = JSON.parse(raw);
            if(!obj || !Array.isArray(obj.items)) return null;
            return obj;
        }catch(_e){ return null; }
    }

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;

    // 샘플 데이터 (백업 정책)
        function mockData(count=5){
                const rows = [
                        { id:1, backup_net:'본사망', status:'운용', policy_name:'DB-일일-정책', backup_dir:'/data/db',  library:'LIB01', data:'RDBMS', grade:'1등급', retention:'30일', offsite:'O', media:'Tape', schedule:'매일', start_time:'01:00',
                            work_status:'운영중', work_group:'재무', work_name:'온라인뱅킹(DB)', system_name:'db01-prd', system_ip:'10.0.10.11' },
                        { id:2, backup_net:'센터망', status:'운용', policy_name:'WEB-주간-정책', backup_dir:'/var/www', library:'LIB02', data:'WEB',   grade:'2등급', retention:'14일', offsite:'X', media:'Disk', schedule:'주1회', start_time:'02:00',
                            work_status:'운영중', work_group:'웹서비스', work_name:'기업포털(WWW)', system_name:'web01-prd', system_ip:'10.0.20.21' },
                        { id:3, backup_net:'지점망', status:'중지', policy_name:'AP-월간-정책',   backup_dir:'/opt/app', library:'LIB03', data:'AP',    grade:'3등급', retention:'60일', offsite:'O', media:'Tape', schedule:'월1회', start_time:'03:00',
                            work_status:'중단',   work_group:'업무', work_name:'업무포털(APP)', system_name:'app01-dev', system_ip:'10.0.30.31' },
                        { id:4, backup_net:'본사망', status:'운용', policy_name:'LOG-일일-정책', backup_dir:'/var/log', library:'LIB01', data:'LOG',   grade:'2등급', retention:'7일',  offsite:'X', media:'Disk', schedule:'매일', start_time:'00:30',
                            work_status:'운영중', work_group:'플랫폼', work_name:'로그수집(LOG)', system_name:'log01-prd', system_ip:'10.0.40.41' },
                        { id:5, backup_net:'센터망', status:'운용', policy_name:'FS-주간-정책',   backup_dir:'/home',    library:'LIB02', data:'FS',    grade:'1등급', retention:'90일', offsite:'O', media:'Tape', schedule:'주1회', start_time:'23:00',
                            work_status:'운영중', work_group:'공통', work_name:'파일공유(FS)', system_name:'fs01-prd', system_ip:'10.0.50.51' }
                ];
        return rows.slice(0, Math.max(0, count|0));
    }

    function initData(){
        state.data = mockData(5);
        state.nextId = state.data.length + 1;
        applyFilter();
        persistPolicies(); // 초기 로드 후 대시보드 동기화 저장
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
                    if(titleEl) titleEl.textContent = '백업 정책 내역이 없습니다.';
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
                    // 상태 배지 표시
                    if(col === 'status'){
                        const v = String(displayVal);
                        let cls = 'ws-wait';
                        if(v === '운용') cls = 'ws-run';
                        else if(v === '중지') cls = 'ws-wait';
                        cellValue = `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${highlight(displayVal, col)}</span></span>`;
                    }
                    // 소산여부 O/X
                    if(col === 'offsite'){
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
        try { localStorage.setItem('backup_visible_cols', JSON.stringify([...state.visibleCols])); } catch(e){}
    }
    function loadColumnSelection(){
        try {
            const raw = localStorage.getItem('backup_visible_cols');
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
                try { localStorage.setItem('backup_visible_cols', JSON.stringify([...state.visibleCols])); } catch(_e){}
            } else {
                // Stored value was empty or invalid — fall back to defaults and persist
                state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
                try { localStorage.setItem('backup_visible_cols', JSON.stringify([...state.visibleCols])); } catch(_e){}
            }
        } catch(e){}
    }

    // ---- Sort persistence ----
    function saveSortPreference(){
        try{
            if(state.sortKey){
                localStorage.setItem('backup_sort_key', state.sortKey);
                localStorage.setItem('backup_sort_dir', state.sortDir==='desc' ? 'desc' : 'asc');
            } else {
                localStorage.removeItem('backup_sort_key');
                localStorage.removeItem('backup_sort_dir');
            }
        }catch(e){}
    }
    function loadSortPreference(){
        try{
            const key = localStorage.getItem('backup_sort_key');
            const dir = localStorage.getItem('backup_sort_dir');
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
            { title:'기본', cols:['backup_net','status','policy_name'] },
            { title:'대상', cols:['backup_dir','library','data'] },
            { title:'정책', cols:['grade','retention','offsite','media','schedule','start_time'] },
            { title:'업무', cols:['work_status','work_group','work_name','system_name','system_ip'] }
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
                <option value="중지" ${v==='중지'?'selected':''}>중지</option>
            </select>`;
        }
        if(col==='offsite'){
            const v = String(value??'');
            return `<select name="offsite" class="form-input">
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="O" ${v==='O'?'selected':''}>O</option>
                <option value="X" ${v==='X'?'selected':''}>X</option>
            </select>`;
        }
        if(col==='start_time') return `<input name="start_time" class="form-input" value="${value??''}" placeholder="HH:MM">`;
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

    function addRow(data){
        // 고유 id 부여
        data.id = state.nextId++;
        state.data.unshift(data); // 맨 앞 삽입
        applyFilter();
        persistPolicies(); // 추가 후 저장
    }

    function updateRow(index,data){
        if(state.data[index]){ state.data[index] = {...state.data[index], ...data}; applyFilter(); }
        persistPolicies(); // 수정 후 저장
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
    const filename = `backup_policy_list_${yyyy}${mm}${dd}.csv`;
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
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', ()=>{
            const form = document.getElementById(ADD_FORM_ID); if(!form.checkValidity()){ form.reportValidity(); return; }
            // no date pair validation on backup policy
            const data = collectForm(form);
            // no computed fields for backup policy
            addRow(data); form.reset(); closeModal(ADD_MODAL_ID); });
        // edit modal
    document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', ()=>{
            const form = document.getElementById(EDIT_FORM_ID);
            const indexEl = document.getElementById(EDIT_SAVE_ID);
            // no date pair validation on backup policy
            const index = parseInt(indexEl?.getAttribute('data-index')||'-1',10);
            const data = collectForm(form);
            // no computed fields for backup policy
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
                    const wide = ['정책명','백업 디렉터리'];
                    const mid = ['백업망','라이브러리','스케줄'];
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
                XLSX.writeFile(wb, 'backup_policy_upload_template.xlsx');
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
                        // Validation rules (backup policy)
                        if(rec.start_time && !/^\d{2}:\d{2}$/.test(rec.start_time)) errors.push(`Row ${r+1}: 시작시간은 HH:MM 형식이어야 합니다.`);
                        const ox = String(rec.offsite||'').toUpperCase();
                        if(ox && ox !== 'O' && ox !== 'X') errors.push(`Row ${r+1}: 소산여부는 O 또는 X로 입력하세요.`);
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
                copy.policy_name = copy.policy_name ? copy.policy_name + '_COPY' : copy.policy_name;
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
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 항목을 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', ()=>{
            // 실제 삭제 수행: 선택된 id들을 데이터셋에서 제거
            const ids = new Set(state.selected);
            const before = state.data.length;
            if(ids.size === 0){ closeModal(DELETE_MODAL_ID); return; }
            state.data = state.data.filter(r => !ids.has(r.id));
            const removed = before - state.data.length;
            state.selected.clear();
            applyFilter();
            persistPolicies(); // 삭제 후 저장
            closeModal(DELETE_MODAL_ID);
            // 선택사항: 삭제 로그/사전 데이터 저장 (원하시면 유지)
            try {
                const fields = ['backup_net','policy_name','backup_dir','library','data','grade','retention','offsite','media','schedule','start_time','work_status','work_group','work_name','system_name','system_ip'];
                const snapshot = (window.__lastDeletedRows = (window.__lastDeletedRows||[]));
                snapshot.push({
                    at: new Date().toISOString(),
                    rows: [...ids].map(id=>{
                        const r = { id };
                        fields.forEach(f=> r[f] = '');
                        return r;
                    })
                });
            } catch(_e){}
            // 사용자 피드백
            if(removed > 0){ setTimeout(()=> showMessage(`${removed}개 항목이 삭제되었습니다.`, '완료'), 0); }
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
        document.getElementById(BULK_APPLY_ID)?.addEventListener('click', ()=>{
            const form = document.getElementById(BULK_FORM_ID); if(!form) return;
            const entries = [...form.querySelectorAll('[data-bulk-field]')]
                .map(el=>({ field: el.getAttribute('data-bulk-field'), value: el.value }))
                .filter(p=> p.value !== '');
            if(!entries.length){ showMessage('변경할 값을 1개 이상 입력하세요.', '안내'); return; }
            // Validate date pair if both provided in bulk
            if(!validateOpenClose(BULK_FORM_ID)) return;
            const ids = new Set(state.selected);
            // 적용: 현재 데이터에서 선택된 행들에만 입력된 필드를 덮어쓰기
            state.data = state.data.map(row=>{
                if(!ids.has(row.id)) return row;
                const updated = { ...row };
                entries.forEach(({field, value})=>{ updated[field] = value; });
                return updated;
            });
            applyFilter();
            persistPolicies(); // 일괄변경 후 저장
            closeModal(BULK_MODAL_ID);
            setTimeout(()=> showMessage(`${ids.size}개 항목에 일괄 변경이 적용되었습니다.`, '완료'), 0);
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
        const EXCLUDE = new Set([]);
        function inputFor(col){
            if(col === 'status'){
                return `<select name="status" class="form-input" data-bulk-field="status">
                    <option value="">선택</option>
                    <option value="운용">운용</option>
                    <option value="중지">중지</option>
                </select>`;
            }
            if(col === 'offsite'){
                return `<select name="offsite" class="form-input" data-bulk-field="offsite">
                    <option value="">선택</option>
                    <option value="O">O</option>
                    <option value="X">X</option>
                </select>`;
            }
            if(col === 'start_time') return `<input name="start_time" class="form-input" data-bulk-field="start_time" placeholder="HH:MM">`;
            return `<input name="${col}" class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }
        const GROUPS = [
            { title:'기본', cols:['backup_net','status','policy_name'] },
            { title:'대상', cols:['backup_dir','library','data'] },
            { title:'정책', cols:['grade','retention','offsite','media','schedule','start_time'] },
            { title:'업무', cols:['work_status','work_group','work_name','system_name','system_ip'] }
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
    // no date picker required
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
    // 정책 현황/분포
    renderStatBlock('stats-software', '상태', countBy(rows, 'status'), ['운용','중지']);
    renderStatBlock('stats-software', '백업망', countBy(rows, 'backup_net'));
    renderStatBlock('stats-versions', '미디어', countBy(rows, 'media'));
    renderStatBlock('stats-check', '소산여부', countBy(rows, 'offsite'), ['O','X'], { toggleOX:true });
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


