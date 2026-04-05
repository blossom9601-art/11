(function(){
    const VERSION = '20250210a';
    const ORG_CCTV_API = '/api/org-cctvs';
    const FORM_SELECTOR = 'form[data-cctv-form="true"]';
    const SEARCH_BRIDGE_STORAGE_KEY = 'cctv_search_bridge';
    const SEARCH_BRIDGE_TTL = 10 * 60 * 1000;
    const DEFAULT_STATUS_TEXT = '상태 표시';
    const SEARCH_DELAY = 220;
    const MAX_RESULTS = 8;
    const SUPPORTS_ABORT = typeof AbortController !== 'undefined';
    const STATUS_CLASS_MAP = {
        '가동': 'cctv-status--live',
        '유휴': 'cctv-status--idle',
        '대기': 'cctv-status--wait'
    };

    function resolveWorkDotClass(value){
        const normalized = String(value || '').replace(/\s+/g, '');
        if(normalized === '가동') return 'ws-run';
        if(normalized === '유휴') return 'ws-idle';
        if(normalized === '대기') return 'ws-wait';
        return 'ws-wait';
    }

    function parseLegacyCompositeLabel(raw){
        const text = String(raw || '').trim();
        if(!text) return { raw:'', display:'', legacyStatus:'', legacyPlace:'' };
        const parts = text.split(',').map(s=> s.trim()).filter(Boolean);
        if(parts.length <= 1){
            return { raw: text, display: text, legacyStatus:'', legacyPlace:'' };
        }
        return {
            raw: text,
            display: parts[0] || text,
            legacyStatus: parts[1] || '',
            legacyPlace: parts.slice(2).join(', ')
        };
    }

    function simplifyDisplayName(rawName, code){
        const rawText = String(rawName || '').trim();
        const parsed = parseLegacyCompositeLabel(rawText);
        let display = String(parsed.display || rawText || '').trim();

        // Common admin-list composite labels: "<이름>분류 - <센터(층)>" or "<이름> - <센터>".
        if(display.includes(' - ')){
            display = display.split(' - ')[0].trim();
        }
        display = display.replace(/(분류|구분)\s*$/g, '').trim();

        const codeText = String(code || '').trim();
        if(codeText){
            if(display === codeText) return codeText;
            if(display.startsWith(codeText)){
                // e.g. "CCTV2분류" -> "CCTV2"
                return codeText;
            }
        }

        return display || codeText || rawText;
    }

    function resolveStatusClass(value){
        if(!value) return 'cctv-status--default';
        const normalized = String(value).replace(/\s+/g, '');
        return STATUS_CLASS_MAP[normalized] || 'cctv-status--default';
    }

    function escapeHTML(value){
        return String(value || '').replace(/[&<>"']/g, ch => ({
            '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
        }[ch]));
    }

    function normalizeCenterLabel(value){
        return (value || '').replace(/\s+/g, '').replace(/[()]/g, '').trim().toLowerCase();
    }

    function resolveItemCenterName(item){
        if(!item) return '';
        return (item.center_name || item.place_name || item.place || '').trim();
    }

    function resolveItemCode(item){
        return (item?.cctv_code || item?.device_code || item?.deviceCode || '').trim();
    }

    function loadBridgePayload(){
        if(typeof window === 'undefined' || !window.localStorage) return null;
        try {
            const raw = window.localStorage.getItem(SEARCH_BRIDGE_STORAGE_KEY);
            if(!raw) return null;
            const parsed = JSON.parse(raw);
            const timestamp = Number(parsed?.timestamp || 0);
            if(timestamp && Date.now() - timestamp > SEARCH_BRIDGE_TTL){
                window.localStorage.removeItem(SEARCH_BRIDGE_STORAGE_KEY);
                return null;
            }
            const query = (parsed?.query || '').trim();
            if(!query) return null;
            return {
                query,
                tokens: Array.isArray(parsed?.tokens) ? parsed.tokens.filter(Boolean) : [],
                source: parsed?.source || 'cctv-list'
            };
        } catch(err){
            console.warn('[cctv-picker] bridge parse failed', err);
            return null;
        }
    }

    class CctvPicker{
        constructor(form){
            if(!form) return;
            this.form = form;
            this.center = (form.dataset.cctvCenter || '').trim();
            this.centerToken = normalizeCenterLabel(this.center);
            this.displayBtn = form.querySelector('[data-cctv-display]');
            this.clearBtn = form.querySelector('[data-cctv-clear]');
            this.placeholderSpan = this.displayBtn?.querySelector('[data-cctv-placeholder]');
            this.nameInput = form.querySelector('[data-cctv-input]');
            this.codeInput = form.querySelector('#cctv-code-hidden');
            this.statusInput = form.querySelector('#cctv-status-hidden');
            this.statusDisplay = form.querySelector('.cctv-status-display');
            if(!this.displayBtn || !this.nameInput){
                form.dataset.cctvWidgetAttached = '1';
                return;
            }
            this.defaultPlaceholder = this.placeholderSpan ? (this.placeholderSpan.textContent || '선택') : '선택';
            this.bridgeSuggestion = loadBridgePayload();
            this.state = { timer:null, abortController:null, items:[], lastQuery:'' };
            this.buildPanel();
            this.bindEvents();
            this.syncFromInputs();
            form.__cctvReset = ()=> this.reset();
            form.__cctvPicker = this;
            form.dataset.cctvWidgetAttached = '1';
            try { console.info(`[cctv-picker] v${VERSION} ready`); } catch(_err){}
        }

        buildPanel(){
            const panel = document.createElement('div');
            panel.className = 'fk-search-panel cctv-search-panel';
            panel.setAttribute('role', 'dialog');
            panel.hidden = true;

            const header = document.createElement('div');
            header.className = 'fk-search-panel__header';
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'fk-search-panel__input';
            input.placeholder = '검색어 입력';
            input.autocomplete = 'off';
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'fk-search-panel__close';
            closeBtn.textContent = '닫기';
            header.append(input, closeBtn);

            const loadingEl = document.createElement('div');
            loadingEl.className = 'search-select-loading';
            loadingEl.textContent = '검색 중';
            loadingEl.hidden = true;

            const listEl = document.createElement('div');
            listEl.className = 'fk-search-panel__list';
            listEl.setAttribute('role', 'listbox');

            const emptyEl = document.createElement('div');
            emptyEl.className = 'fk-search-panel__empty';
            emptyEl.textContent = '검색어를 입력해 주세요.';

            panel.append(header, loadingEl, listEl, emptyEl);
            document.body.appendChild(panel);

            this.panel = panel;
            this.searchInput = input;
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
                    if(manual) this.applyManualEntry(manual);
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
            if(this.panelOpen){ this.closePanel(); }
            else { this.openPanel(); }
        }

        openPanel(){
            if(!this.panel) return;
            this.panel.hidden = false;
            this.panelOpen = true;
            this.displayBtn.setAttribute('aria-expanded', 'true');
            this.displayBtn.classList.add('is-open');
            this.positionPanel();
            this.searchInput.focus();
            const existing = this.searchInput.value.trim();
            if(existing){
                this.scheduleSearch();
            } else if(this.bridgeSuggestion?.query && !this.nameInput.value){
                this.searchInput.value = this.bridgeSuggestion.query;
                this.scheduleSearch();
            } else {
                this.runSearch('', { initial:true });
            }
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
            const vw = window.innerWidth;
            let left = rect.left;
            if(left + panelWidth > vw - 16){
                left = vw - panelWidth - 16;
            }
            left = Math.max(12, left);
            let top = rect.bottom + 8;
            if(top + panelHeight > window.innerHeight - 12){
                top = rect.top - panelHeight - 8;
            }
            if(top < 12) top = 12;
            this.panel.style.left = `${left}px`;
            this.panel.style.top = `${top}px`;
        }

        scheduleSearch(){
            if(this.state.timer) clearTimeout(this.state.timer);
            this.state.timer = setTimeout(()=>{
                this.runSearch(this.searchInput.value.trim());
            }, SEARCH_DELAY);
        }

        runSearch(query, options){
            const opts = options || {};
            const normalized = (query ?? '').trim();
            this.state.lastQuery = normalized;
            if(!normalized && !opts.initial){
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
            this.state.items = [];
            if(!this.emptyEl) return;
            this.listEl.innerHTML = '';
            this.emptyEl.hidden = false;
            this.emptyEl.textContent = '검색어를 입력해 주세요.';
            this.loadingEl.hidden = true;
        }

        showLoading(){
            this.loadingEl.hidden = false;
            this.emptyEl.hidden = true;
        }

        resolveEditTargetId(){
            const hidden = this.form.querySelector('#edit-target-box-id');
            const hidVal = (hidden?.value || '').trim();
            const datasetVal = (this.form.dataset.targetBoxId || '').trim();
            return hidVal || datasetVal || null;
        }

        resolveCurrentBoxCode(){
            const boxId = this.resolveEditTargetId();
            if(!boxId) return '';
            const target = document.getElementById(boxId);
            return (target?.dataset?.cctvCode || '').trim();
        }

        collectAssignedCodes(){
            const overlay = document.getElementById('rack-overlay');
            const skipId = this.resolveEditTargetId();
            const set = new Set();
            if(!overlay) return set;
            overlay.querySelectorAll('.slab-box').forEach(box=>{
                if(skipId && box.id === skipId) return;
                const code = (box.dataset?.cctvCode || '').trim();
                if(code) set.add(code);
            });
            return set;
        }

        filterAssignable(items){
            const normalized = Array.isArray(items) ? items : [];
            if(!normalized.length) return { items: normalized, removed: 0 };
            const assigned = this.collectAssignedCodes();
            const currentCode = this.resolveCurrentBoxCode();
            const filtered = normalized.filter(item=>{
                const code = resolveItemCode(item);
                if(!code) return true;
                if(currentCode && code === currentCode) return true;
                return !assigned.has(code);
            });
            return { items: filtered, removed: normalized.length - filtered.length };
        }

        matchesCenter(item){
            if(!this.centerToken) return true;
            const candidate = normalizeCenterLabel(resolveItemCenterName(item));
            return candidate && candidate === this.centerToken;
        }

        scopeItemsToCenter(items){
            if(!Array.isArray(items)) return [];
            if(!this.centerToken) return items;
            return items.filter(item => this.matchesCenter(item));
        }

        fetchSuggestions(query, options){
            const opts = options || {};
            this.cancelPending();
            const controller = SUPPORTS_ABORT ? new AbortController() : null;
            this.state.abortController = controller;
            const params = new URLSearchParams();
            if(query){
                params.set('q', query);
                params.set('business_name', query);
            }
            const limit = opts.initial ? MAX_RESULTS : MAX_RESULTS;
            params.set('limit', String(limit));
            const fetchOptions = SUPPORTS_ABORT && controller ? { signal: controller.signal } : {};
            const attempt = (centerValue)=>{
                const qp = new URLSearchParams(params);
                if(centerValue){ qp.set('center', centerValue); }
                const url = `${ORG_CCTV_API}?${qp.toString()}`;
                return fetch(url, fetchOptions)
                    .then(resp => { if(!resp.ok) throw new Error('검색 실패'); return resp.json(); })
                    .then(data => Array.isArray(data?.items) ? data.items : []);
            };
            const scopeLocked = !!this.centerToken;
            attempt(this.center)
                .then(items => {
                    const scoped = this.scopeItemsToCenter(items);
                    if(scopeLocked){
                        return { items: scoped, fallback:false };
                    }
                    if(scoped.length){
                        return { items: scoped, fallback:false };
                    }
                    return attempt(null).then(globalItems => ({ items: this.scopeItemsToCenter(globalItems), fallback:true }));
                })
                .then(result => {
                    this.renderResults(result.items, { fallback: result.fallback, initial: !!opts.initial });
                })
                .catch(err => {
                    if(SUPPORTS_ABORT && err.name === 'AbortError') return;
                    console.error('[cctv-picker] 검색 실패', err);
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
            const normalized = Array.isArray(items) ? items.slice(0, MAX_RESULTS) : [];
            const { items: filteredItems, removed } = this.filterAssignable(normalized);
            this.state.items = filteredItems;
            const fallbackNotice = ctx.fallback
                ? '<div class="search-select-hint">연결된 센터에서 찾지 못해 전체 센터에서 검색한 결과입니다.</div>'
                : '';
            const dedupeNotice = removed > 0
                ? '<div class="search-select-hint">이미 배치된 CCTV는 목록에서 숨겼습니다.</div>'
                : '';
            const selectionCode = (this.codeInput?.value || '').trim();
            const currentName = (this.nameInput?.value || '').trim();
            const defaultSelected = !currentName;
            const defaultOption = `<button type="button" class="fk-search-panel__item cctv-default-option${defaultSelected ? ' is-selected' : ''}" data-role="clear" role="option" aria-selected="${defaultSelected ? 'true' : 'false'}">`
                + '<span class="rack-search-option-label">선택</span>'
                + '<span class="rack-search-option-meta">선택을 해제합니다.</span>'
                + '</button>';
            const optionsHTML = filteredItems.map((item, index)=>{
                const rawName = (item.business_name || item.cctv_code || item.device_code || 'CCTV').trim();
                const parsed = parseLegacyCompositeLabel(rawName);
                const code = (item.cctv_code || item.device_code || '').trim();
                const name = simplifyDisplayName(rawName, code);
                const status = ((item.business_status || '').trim() || (parsed.legacyStatus || '').trim());
                const isSelected = (selectionCode && code && selectionCode === code)
                    || (!selectionCode && currentName && (currentName === name || currentName === rawName || currentName === parsed.display));
                const wsClass = status ? resolveWorkDotClass(status) : '';
                const statusDot = `<span class="status-dot cctv-status-dot${wsClass ? ' '+wsClass : ''}" aria-hidden="true"></span>`;
                return `<button type="button" class="fk-search-panel__item${isSelected ? ' is-selected' : ''}" data-index="${index}" role="option" aria-selected="${isSelected ? 'true' : 'false'}">`
                    + `<span class="rack-search-option-label">${statusDot}<span class="cctv-option-name">${escapeHTML(name)}</span></span>`
                    + '</button>';
            }).join('');
            this.listEl.innerHTML = fallbackNotice + dedupeNotice + defaultOption + optionsHTML;
            if(!filteredItems.length){
                this.emptyEl.hidden = false;
                if(removed > 0){
                    this.emptyEl.textContent = '이미 배치된 CCTV를 제외하니 남은 결과가 없습니다.';
                } else if(this.centerToken){
                    if(this.state.lastQuery){
                        this.emptyEl.textContent = '이 센터에서 검색 결과가 없습니다.';
                    } else {
                        this.emptyEl.textContent = '이 센터에 등록된 CCTV가 없습니다.';
                    }
                } else if(ctx.initial){
                    this.emptyEl.textContent = '등록된 CCTV를 찾지 못했습니다.';
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
            const rawName = (item?.business_name || item?.cctv_code || item?.device_code || '').trim();
            const parsed = parseLegacyCompositeLabel(rawName);
            const code = (item?.cctv_code || item?.device_code || '').trim();
            const name = simplifyDisplayName(rawName, code);
            const status = ((item?.business_status || '').trim() || (parsed.legacyStatus || '').trim());
            if(!name){
                this.applyManualEntry('');
                return;
            }
            this.nameInput.value = name;
            this.codeInput && (this.codeInput.value = code);
            this.statusInput && (this.statusInput.value = status);
            this.updateDisplay(name, status);
            this.updateStatus(status, item?.place_name || item?.place || '');
            this.closePanel();
        }

        applyManualEntry(label){
            this.nameInput.value = label;
            if(this.codeInput) this.codeInput.value = '';
            if(this.statusInput) this.statusInput.value = '';
            this.updateDisplay(label || this.defaultPlaceholder, '');
            this.updateStatus('');
            this.closePanel();
        }

        updateDisplay(text, status){
            const label = String(text || '').trim();
            const hasValue = !!label;
            const safe = escapeHTML(label || this.defaultPlaceholder);
            const dotHtml = (hasValue && status)
                ? `<span class="status-dot cctv-status-dot ${resolveWorkDotClass(status)}" aria-hidden="true"></span>`
                : '';
            const html = hasValue ? `${dotHtml}${safe}` : safe;
            if(this.placeholderSpan){
                this.placeholderSpan.innerHTML = html;
            } else {
                this.displayBtn.innerHTML = html;
            }
            if(this.displayBtn){
                this.displayBtn.classList.toggle('has-value', hasValue);
                this.displayBtn.classList.toggle('is-empty', !hasValue);
            }
            if(this.clearBtn){
                if(hasValue){ this.clearBtn.hidden = false; }
                else { this.clearBtn.hidden = true; }
            }
        }

        updateStatus(status, place){
            if(!this.statusDisplay){
                return;
            }
            if(status){
                const statusClass = resolveStatusClass(status);
                const noteText = place || this.center || '센터 연동';
                this.statusDisplay.classList.add('has-status');
                this.statusDisplay.innerHTML = `<span class="cctv-status-pill ${statusClass}"><span class="status-dot"></span>${escapeHTML(status)}</span>`
                    + `<span class="cctv-status-note">${escapeHTML(noteText)}</span>`;
            } else {
                this.statusDisplay.classList.remove('has-status');
                this.statusDisplay.textContent = DEFAULT_STATUS_TEXT;
            }
        }

        syncFromInputs(){
            const name = (this.nameInput.value || '').trim();
            const status = (this.statusInput?.value || '').trim();
            const place = '';
            if(name){
                this.updateDisplay(name, status);
                this.updateStatus(status, place);
                if(this.clearBtn) this.clearBtn.hidden = false;
            } else {
                this.reset();
            }
        }

        reset(){
            this.nameInput.value = '';
            if(this.codeInput) this.codeInput.value = '';
            if(this.statusInput) this.statusInput.value = '';
            this.updateDisplay('', '');
            this.updateStatus('');
        }
    }

    function initCctvPickers(){
        const forms = document.querySelectorAll(FORM_SELECTOR);
        forms.forEach(form => {
            if(form.dataset.cctvWidgetAttached === '1') return;
            new CctvPicker(form);
        });
    }

    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', initCctvPickers);
    } else {
        initCctvPickers();
    }
})();
