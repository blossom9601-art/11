(function(){
    const VERSION = '20260101a';
    if(typeof window !== 'undefined'){
        window.__THERMO_PICKER_VERSION__ = VERSION;
        try {
            console.info(`[thermo-picker] v${VERSION} ready`);
        } catch(_err){}
    }
    const ORG_THERMOMETER_API = '/api/org-thermometers';
    const WORK_STATUS_API = '/api/work-statuses';
    const FORM_SELECTOR = 'form[data-thermo-form="true"]';
    const DEFAULT_STATUS_TEXT = '상태 표시';
    const SEARCH_DELAY = 220;
    const MAX_RESULTS = 8;
    const INITIAL_SUGGESTION_LIMIT = 8;
    const SUPPORTS_ABORT = typeof AbortController !== 'undefined';
    const STATUS_CLASS_MAP = {
        '가동': 'thermo-status--live',
        '유휴': 'thermo-status--idle',
        '대기': 'thermo-status--wait',
        '예비': 'thermo-status--idle',
        '종료': 'thermo-status--wait',
    };
    const SEARCH_BRIDGE_STORAGE_KEY = 'thermo_search_bridge';
    const SEARCH_BRIDGE_TTL_MS = 10 * 60 * 1000;

    const escapeHTML = (value)=> String(value || '').replace(/[&<>"']/g, (ch)=>({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[ch]));

    const normalizeStatusToken = (value)=> String(value ?? '').trim().replace(/\s+/g, '');

    // Some UIs store work status as a code rather than the Korean label.
    // Resolve code -> label via /api/work-statuses so dots can be colored correctly.
    let workStatusLabelByCode = new Map();
    let workStatusMapPromise = null;

    function ensureWorkStatusLabelMap(){
        if(workStatusMapPromise) return workStatusMapPromise;
        const fetchOpts = { credentials: 'same-origin', cache: 'no-store' };
        workStatusMapPromise = fetch(WORK_STATUS_API, fetchOpts)
            .then(resp => (resp.ok ? resp.json() : null))
            .then(data => {
                const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
                const map = new Map();
                items.forEach(it => {
                    const code = String(it?.status_code || it?.value || '').trim();
                    const name = String(it?.status_name || it?.wc_name || it?.label || code).trim();
                    if(code){
                        map.set(code, name || code);
                    }
                });
                workStatusLabelByCode = map;
                return map;
            })
            .catch(() => {
                workStatusLabelByCode = new Map();
                return workStatusLabelByCode;
            });
        return workStatusMapPromise;
    }

    function resolveWorkStatusLabel(value){
        const raw = String(value ?? '').trim();
        if(!raw) return '';
        return workStatusLabelByCode.get(raw) || raw;
    }

    const resolveStatusClass = (value)=>{
        if(!value) return 'thermo-status--default';
        const normalized = normalizeStatusToken(value);
        // Allow variants like "가동(정상)" to still map correctly.
        if(normalized.startsWith('가동')) return 'thermo-status--live';
        if(normalized.startsWith('유휴') || normalized.startsWith('예비')) return 'thermo-status--idle';
        if(normalized.startsWith('대기') || normalized.startsWith('종료')) return 'thermo-status--wait';
        return STATUS_CLASS_MAP[normalized] || 'thermo-status--default';
    };

    const resolveWorkStatusDotClass = (value)=>{
        const label = resolveWorkStatusLabel(value);
        const normalized = normalizeStatusToken(label);
        if(!normalized) return '';
        if(normalized.startsWith('가동')) return 'ws-run';
        if(normalized.startsWith('유휴') || normalized.startsWith('예비')) return 'ws-idle';
        if(normalized.startsWith('대기') || normalized.startsWith('종료')) return 'ws-wait';
        return '';
    };
    function loadBridgePayload(){
        if(typeof window === 'undefined' || !window.localStorage) return null;
        try {
            const raw = window.localStorage.getItem(SEARCH_BRIDGE_STORAGE_KEY);
            if(!raw) return null;
            const parsed = JSON.parse(raw);
            const query = (parsed?.query || parsed?.business_name || '').trim();
            if(!query) return null;
            const timestamp = Number(parsed?.timestamp || 0);
            if(timestamp && Date.now() - timestamp > SEARCH_BRIDGE_TTL_MS){
                window.localStorage.removeItem(SEARCH_BRIDGE_STORAGE_KEY);
                return null;
            }
            return {
                query,
                tokens: Array.isArray(parsed?.tokens) ? parsed.tokens.filter(Boolean) : [],
                source: parsed?.source || 'thermometer-list'
            };
        } catch(err){
            console.warn('[thermo-picker] bridge parse failed', err);
            return null;
        }
    }
    class ThermoPicker{
        constructor(form){
            if(!form) return;
            this.form = form;
            this.center = (form.dataset.thermoCenter || '').trim();
            this.displayBtn = form.querySelector('[data-thermo-display]');
            this.clearBtn = form.querySelector('[data-thermo-clear]');
            this.placeholderSpan = this.displayBtn?.querySelector('[data-thermo-placeholder]');
            this.helperSpan = this.displayBtn?.querySelector('.thermo-display-helper');
            this.nameInput = form.querySelector('[data-thermo-input="true"]');
            this.codeInput = form.querySelector('#thermo-code-hidden');
            this.statusInput = form.querySelector('#thermo-status-hidden');
            this.statusDisplay = form.querySelector('.thermo-status-display') || form.querySelector('#thermo-status-display');
            if(!this.displayBtn || !this.nameInput){
                form.dataset.thermoWidgetAttached = '1';
                return;
            }
            this.defaultPlaceholder = this.placeholderSpan ? (this.placeholderSpan.textContent || '선택') : '선택';
            this.bridgeSuggestion = null;
            this.state = { timer:null, abortController:null, items:[], lastQuery:'' };
            this.hasInitialList = false;
            this.initialItems = [];
            this.lastRenderContext = null;
            this.buildPanel();
            this.bindEvents();
            this.syncFromInputs();
            form.__thermoReset = ()=> this.reset();
            form.dataset.thermoWidgetAttached = '1';
        }

        buildPanel(){
            const panel = document.createElement('div');
            panel.className = 'fk-search-panel thermo-search-panel';
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'false');
            panel.hidden = true;

            const header = document.createElement('div');
            header.className = 'fk-search-panel__header';
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.className = 'fk-search-panel__input';
            searchInput.placeholder = '검색어 입력';
            searchInput.autocomplete = 'off';
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'fk-search-panel__close';
            closeBtn.textContent = '닫기';
            header.append(searchInput, closeBtn);

            const loadingEl = document.createElement('div');
            loadingEl.className = 'search-select-loading';
            loadingEl.textContent = '검색 중';
            loadingEl.hidden = true;

            const listEl = document.createElement('div');
            listEl.className = 'fk-search-panel__list';
            listEl.setAttribute('role', 'listbox');

            const emptyEl = document.createElement('div');
            emptyEl.className = 'fk-search-panel__empty';
            emptyEl.hidden = false;
            emptyEl.textContent = '검색어를 입력해 주세요.';

            panel.append(header, loadingEl, listEl, emptyEl);
            document.body.appendChild(panel);

            this.panel = panel;
            this.searchInput = searchInput;
            this.closeBtn = closeBtn;
            this.loadingEl = loadingEl;
            this.listEl = listEl;
            this.emptyEl = emptyEl;
        }

        bindEvents(){
            this.displayBtn.addEventListener('click', ()=> this.togglePanel());
            this.clearBtn?.addEventListener('click', ()=> this.reset());
            this.closeBtn?.addEventListener('click', ()=> this.closePanel());
            this.form.addEventListener('submit', ()=> this.closePanel());
            this.form.addEventListener('keydown', (event)=>{ if(event.key === 'Escape') this.closePanel(); });
            this.searchInput.addEventListener('input', ()=> this.scheduleSearch());
            this.searchInput.addEventListener('keydown', (event)=>{
                if(event.key === 'Enter'){
                    event.preventDefault();
                    const manual = this.searchInput.value.trim();
                    if(manual){
                        this.applyManualEntry(manual);
                    }
                }
            });
            this.listEl.addEventListener('click', (event)=>{
                const btn = event.target.closest('.fk-search-panel__item');
                if(!btn) return;
                if(btn.dataset.role === 'clear'){
                    event.preventDefault();
                    this.reset();
                    return;
                }
                const index = Number(btn.dataset.index);
                if(Number.isNaN(index)) return;
                const item = this.state.items[index];
                if(item) this.applySelection(item);
            });
            this._handleOutsideClick = (event)=>{
                if(!this.panelOpen) return;
                if(this.panel.contains(event.target) || this.displayBtn.contains(event.target)) return;
                this.closePanel();
            };
            document.addEventListener('click', this._handleOutsideClick, true);
            this._handleWindowChange = ()=>{ if(this.panelOpen) this.closePanel(); };
            window.addEventListener('resize', this._handleWindowChange);
            window.addEventListener('scroll', this._handleWindowChange, true);
        }

        togglePanel(){
            if(this.panelOpen){
                this.closePanel();
            } else {
                this.openPanel();
            }
        }

        openPanel(){
            if(!this.panel) return;
            this.panel.hidden = false;
            this.panelOpen = true;
            this.displayBtn.setAttribute('aria-expanded', 'true');
            this.displayBtn.classList.add('is-open');
            this.positionPanel();
            this.searchInput.focus();
            // Preload status code -> label mapping (best-effort).
            ensureWorkStatusLabelMap().then(()=>{
                if(!this.panelOpen) return;
                if(this.state.items?.length && this.lastRenderContext){
                    this.renderResults(this.state.items, { ...this.lastRenderContext, reused:true });
                }
                const existingStatus = (this.statusInput?.value || '').trim();
                if(existingStatus){
                    this.updateStatus(existingStatus);
                }
            });
            // Keep the status display in sync with changes made elsewhere (e.g. thermometer list page).
            // This is best-effort and does not block opening the picker.
            this.refreshSelectedStatus();
            const existing = this.searchInput.value.trim();
            const bridgeQuery = (!existing && !this.nameInput.value && this.bridgeSuggestion?.query) ? this.bridgeSuggestion.query : '';
            if(bridgeQuery){
                this.searchInput.value = bridgeQuery;
                this.scheduleSearch();
            } else if(existing){
                this.scheduleSearch();
            } else if(this.hasInitialList && this.initialItems.length){
                this.renderResults([...this.initialItems], { initial:true, reused:true });
                // Refresh the initial list in the background so statuses stay up-to-date.
                this.fetchInitialList();
            } else {
                this.fetchInitialList();
            }
        }

        refreshSelectedStatus(){
            const code = (this.codeInput?.value || '').trim();
            if(!code) return;
            const params = new URLSearchParams();
            params.set('q', code);
            params.set('limit', '20');
            if(this.center){
                params.set('center', this.center);
            }
            const url = `${ORG_THERMOMETER_API}?${params.toString()}`;
            const fetchOpts = { credentials: 'same-origin', cache: 'no-store' };
            fetch(url, fetchOpts)
                .then(resp => { if(!resp.ok) throw new Error('status refresh failed'); return resp.json(); })
                .then(data => {
                    const items = Array.isArray(data?.items) ? data.items : [];
                    const match = items.find(it => {
                        const itCode = String(it?.thermo_code || it?.device_code || '').trim();
                        return itCode && itCode === code;
                    });
                    if(!match) return;
                    const nextStatus = String(match?.business_status || '').trim();
                    const prevStatus = String(this.statusInput?.value || '').trim();
                    if(nextStatus && nextStatus !== prevStatus){
                        if(this.statusInput) this.statusInput.value = nextStatus;
                        this.updateStatus(nextStatus);
                    }
                })
                .catch(()=>{});
        }

        closePanel(){
            if(!this.panel) return;
            this.panel.hidden = true;
            this.panelOpen = false;
            this.displayBtn.setAttribute('aria-expanded', 'false');
            this.displayBtn.classList.remove('is-open');
            this.searchInput.blur();
            this.cancelPending();
        }

        positionPanel(){
            const rect = this.displayBtn.getBoundingClientRect();
            const panelWidth = this.panel.offsetWidth || 360;
            const panelHeight = this.panel.offsetHeight || 320;
            const viewportWidth = window.innerWidth;
            let left = rect.left;
            if(left + panelWidth > viewportWidth - 16){
                left = viewportWidth - panelWidth - 16;
            }
            left = Math.max(12, left);
            let top = rect.bottom + 8;
            if(top + panelHeight > window.innerHeight - 12){
                top = rect.top - panelHeight - 8;
            }
            if(top < 12){
                top = 12;
            }
            this.panel.style.left = `${left}px`;
            this.panel.style.top = `${top}px`;
        }

        scheduleSearch(){
            if(this.state.timer) clearTimeout(this.state.timer);
            this.state.timer = setTimeout(()=>{
                this.runSearch(this.searchInput.value.trim());
            }, SEARCH_DELAY);
        }

        fetchInitialList(){
            this.runSearch('', { initial:true });
        }

        runSearch(query, options){
            const opts = options || {};
            const normalized = (query ?? '').trim();
            this.state.lastQuery = normalized;
            if(!normalized && !opts.initial){
                this.cancelPending();
                this.showIdleHint();
                return;
            }
            this.showLoading();
            this.fetchSuggestions(normalized, opts);
        }

        cancelPending(){
            if(this.state.timer) clearTimeout(this.state.timer);
            this.state.timer = null;
            if(SUPPORTS_ABORT && this.state.abortController){
                this.state.abortController.abort();
                this.state.abortController = null;
            }
        }

        showIdleHint(){
            if(!this.emptyEl) return;
            this.listEl.innerHTML = '';
            this.emptyEl.hidden = false;
            this.emptyEl.textContent = '검색어를 입력해 주세요.';
            this.loadingEl.hidden = true;
            this.state.items = [];
        }

        showLoading(){
            this.loadingEl.hidden = false;
            this.emptyEl.hidden = true;
        }

        fetchSuggestions(query, options){
            const opts = options || {};
            this.cancelPending();
            try {
                console.debug('[thermo-picker] querying', { query, center: this.center, initial: !!opts.initial });
            } catch(_err){}
            // Default behavior: keep search results scoped to the current center/tab.
            // If you explicitly want a global fallback when a center has no matches,
            // set data-thermo-allow-fallback="1" on the form.
            const allowFallback = String(this.form?.dataset?.thermoAllowFallback || '').trim() === '1';
            const controller = SUPPORTS_ABORT ? new AbortController() : null;
            this.state.abortController = controller;
            const params = new URLSearchParams();
            if(query){
                params.set('q', query);
                params.set('business_name', query);
            }
            const limitForRequest = opts.initial ? INITIAL_SUGGESTION_LIMIT : MAX_RESULTS;
            if(limitForRequest){
                params.set('limit', String(limitForRequest));
            }
            const fetchOptions = SUPPORTS_ABORT && controller ? { signal: controller.signal, cache: 'no-store' } : { cache: 'no-store' };
            const attempt = (centerValue)=>{
                const queryParams = new URLSearchParams(params);
                if(centerValue){
                    queryParams.set('center', centerValue);
                } else {
                    queryParams.delete('center');
                }
                const url = `${ORG_THERMOMETER_API}?${queryParams.toString()}`;
                return fetch(url, fetchOptions)
                    .then(resp => { if(!resp.ok) throw new Error('검색 실패'); return resp.json(); })
                    .then(data => Array.isArray(data?.items) ? data.items : []);
            };
            attempt(this.center)
                .then(items => {
                    const hasCenter = !!this.center;
                    if(items.length || !hasCenter){
                        return { items, fallback:false };
                    }
                    if(!allowFallback){
                        return { items: [], fallback:false };
                    }
                    return attempt(null)
                        .then(globalItems => ({ items: globalItems, fallback:true }));
                })
                .then(result => {
                    try {
                        console.debug('[thermo-picker] results', { count: result.items.length, fallback: result.fallback });
                    } catch(_err){}
                    this.renderResults(result.items, { fallback: result.fallback, initial: !!opts.initial });
                })
                .catch(err => {
                    if(SUPPORTS_ABORT && err.name === 'AbortError') return;
                    console.error('[thermo-picker] 검색 실패', err);
                    this.renderError();
                })
                .finally(()=>{
                    if(this.state.abortController === controller){
                        this.state.abortController = null;
                    }
                    this.loadingEl.hidden = true;
                });
        }

        renderResults(items, context){
            const ctx = context || {};
            this.lastRenderContext = ctx;
            const sliceLimit = ctx.initial ? INITIAL_SUGGESTION_LIMIT : MAX_RESULTS;
            const normalized = Array.isArray(items) ? items.slice(0, sliceLimit) : [];
            this.state.items = normalized;
            if(ctx.initial){
                this.hasInitialList = true;
                if(!ctx.reused){
                    this.initialItems = [...normalized];
                }
            }
            const fallbackNotice = ctx.fallback
                ? '<div class="search-select-hint">연결된 센터에서 찾지 못해 전체 센터에서 검색한 결과입니다.</div>'
                : '';
            const selectionCode = (this.codeInput?.value || '').trim();
            const currentName = (this.nameInput?.value || '').trim();
            const defaultSelected = !currentName;
            const defaultOption = `<button type="button" class="fk-search-panel__item thermo-default-option${defaultSelected ? ' is-selected' : ''}" data-role="clear" role="option" aria-selected="${defaultSelected ? 'true' : 'false'}">`
                + '<span class="rack-search-option-label">선택</span>'
                + '<span class="rack-search-option-meta">선택을 해제합니다.</span>'
                + '</button>';
            const optionsHTML = normalized.map((item, index)=>{
                const status = (item.business_status || '').trim();
                const name = item.business_name || item.thermo_code || '온/습도계';
                const code = (item.thermo_code || item.device_code || '').trim();
                const isSelected = (selectionCode && code && selectionCode === code)
                    || (!selectionCode && currentName && currentName === name);
                const wsClass = resolveWorkStatusDotClass(status);
                const statusDot = `<span class="status-dot thermo-status-dot${wsClass ? ' '+wsClass : ''}" aria-hidden="true"></span>`;
                return `<button type="button" class="fk-search-panel__item${isSelected ? ' is-selected' : ''}" data-index="${index}" role="option" aria-selected="${isSelected ? 'true' : 'false'}">`
                    + `<span class="rack-search-option-label">${statusDot}<span class="thermo-option-name">${escapeHTML(name)}</span></span>`
                    + '</button>';
            }).join('');
            this.listEl.innerHTML = fallbackNotice + defaultOption + optionsHTML;
            if(!normalized.length){
                this.emptyEl.hidden = false;
                if(ctx.initial){
                    this.emptyEl.textContent = '등록된 온/습도계를 찾지 못했습니다.';
                } else if(ctx.fallback){
                    this.emptyEl.textContent = '연결된 센터와 전체 센터에서 검색 결과가 없습니다.';
                } else if(this.state.lastQuery){
                    this.emptyEl.textContent = '검색 결과가 없습니다.';
                } else {
                    this.emptyEl.textContent = '검색어를 입력해 주세요.';
                }
            } else {
                this.emptyEl.hidden = true;
            }
        }

        renderError(){
            this.listEl.innerHTML = '';
            this.emptyEl.hidden = false;
            this.emptyEl.textContent = '검색에 실패했습니다. 다시 시도해 주세요.';
        }

        applySelection(item){
            const name = (item?.business_name || item?.thermo_code || '').trim();
            const status = (item?.business_status || '').trim();
            const code = (item?.thermo_code || item?.device_code || '').trim();
            this.nameInput.value = name;
            if(this.codeInput) this.codeInput.value = code;
            if(this.statusInput) this.statusInput.value = status;
            this.bridgeSuggestion = null;
            this.updateDisplay(name);
            this.updateStatus(status);
            this.nameInput.dispatchEvent(new Event('input', { bubbles: true }));
            this.closePanel();
        }

        applyManualEntry(name){
            if(!name) return;
            this.nameInput.value = name;
            if(this.codeInput) this.codeInput.value = '';
            if(this.statusInput) this.statusInput.value = '';
            this.bridgeSuggestion = null;
            this.updateDisplay(name);
            this.updateStatus('');
            this.nameInput.dispatchEvent(new Event('input', { bubbles: true }));
            this.closePanel();
        }

        updateDisplay(name){
            const hasValue = !!name;
            if(this.placeholderSpan){
                const placeholderText = hasValue
                    ? name
                    : (this.bridgeSuggestion?.query || this.defaultPlaceholder || '선택');
                this.placeholderSpan.textContent = placeholderText;
            }
            this.displayBtn.classList.toggle('has-value', hasValue);
            this.displayBtn.classList.toggle('is-empty', !hasValue);
            if(!hasValue && this.bridgeSuggestion?.query){
                this.displayBtn.classList.add('thermo-bridge-ready');
                this.displayBtn.setAttribute('data-bridge-hint', this.bridgeSuggestion.query);
            } else {
                this.displayBtn.classList.remove('thermo-bridge-ready');
                this.displayBtn.removeAttribute('data-bridge-hint');
            }
            if(this.clearBtn) this.clearBtn.hidden = !hasValue;
            if(this.helperSpan){
                if(hasValue){
                    this.helperSpan.textContent = this.center || '연결된 센터';
                } else if(this.bridgeSuggestion?.query){
                    this.helperSpan.textContent = `최근 검색: ${this.bridgeSuggestion.query}`;
                } else {
                    this.helperSpan.textContent = '업무 이름을 검색해 선택하세요.';
                }
            }
        }

        updateStatus(status){
            if(!this.statusDisplay){
                return;
            }
            if(status){
                const displayStatus = resolveWorkStatusLabel(status);
                const statusClass = resolveStatusClass(displayStatus);
                this.statusDisplay.classList.add('has-status');
                this.statusDisplay.innerHTML = `<span class="thermo-status-pill ${statusClass}"><span class="status-dot"></span>${escapeHTML(displayStatus)}</span>`
                    + `<span class="thermo-status-note">${escapeHTML(this.center || '센터')} 연동</span>`;
            } else {
                this.statusDisplay.classList.remove('has-status');
                this.statusDisplay.textContent = DEFAULT_STATUS_TEXT;
            }
        }

        reset(){
            this.nameInput.value = '';
            if(this.codeInput) this.codeInput.value = '';
            if(this.statusInput) this.statusInput.value = '';
            this.searchInput.value = '';
            this.updateDisplay('');
            this.updateStatus('');
            this.closePanel();
        }

        syncFromInputs(){
            const existingName = (this.nameInput.value || '').trim();
            const existingStatus = (this.statusInput?.value || '').trim();
            this.updateDisplay(existingName);
            if(existingStatus){
                this.updateStatus(existingStatus);
            } else {
                this.updateStatus('');
            }
        }

        applyBridgeSuggestion(entry){
            const query = (entry?.query || entry?.business_name || '').trim();
            if(!query) return;
            const currentValue = (this.nameInput.value || '').trim();
            if(currentValue) return;
            this.bridgeSuggestion = {
                query,
                source: entry?.source || 'thermometer-list'
            };
            this.updateDisplay('');
        }

        clearBridgeSuggestion(){
            this.bridgeSuggestion = null;
            this.updateDisplay(this.nameInput.value || '');
        }
    }

    function init(){
        const forms = document.querySelectorAll(FORM_SELECTOR);
        if(!forms.length) return;
        ensureWorkStatusLabelMap();
        const instances = [];
        forms.forEach(form => {
            if(form.dataset.thermoWidgetAttached === '1') return;
            const picker = new ThermoPicker(form);
            if(picker.displayBtn) instances.push(picker);
        });
        const bridgePayload = loadBridgePayload();
        if(bridgePayload){
            instances.forEach(instance => {
                if(typeof instance.applyBridgeSuggestion === 'function'){
                    instance.applyBridgeSuggestion(bridgePayload);
                }
            });
        }
        const resetAll = ()=> instances.forEach(p => p.reset());
        document.getElementById('system-add-btn')?.addEventListener('click', resetAll);
        document.getElementById('system-add-close')?.addEventListener('click', resetAll);
    }

    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
