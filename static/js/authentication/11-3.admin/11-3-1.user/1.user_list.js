// 1.user_list.js (rebuilt)
// 사용자 관리 페이지 스크립트 (간소 + 안정화 버전)
// 요구사항:
//  - '비고(note)' 컬럼 제거
//  - 컬럼 선택 모달을 "기본 정보" / "감사 정보" 두 섹션으로 구분
//  - 초기에는 감사 정보(AUDIT) 컬럼 전체 숨김 (localStorage 없을 때)
//  - 기존 localStorage 키: user_columns_hidden (숨김 컬럼 집합 저장)
//  - 행 선택, 페이징, 검색, 통계/일괄/삭제 기본 기능 유지

(function(){
    'use strict';

    // Idempotency guard: prevent double initialization when SPA loader re-injects this script
    if(window.__userListInitialized){
        console.warn('[user_list] initialization skipped (already initialized)');
        return;
    }
    window.__userListInitialized = true;

    // -------------------- 상수/상태 --------------------
    const COUNT_ID = 'system-count';
    const TBODY_ID = 'system-table-body';
    const SEARCH_ID = 'system-search';
    const SEARCH_CLEAR_ID = 'system-search-clear';
    const PAGE_SIZE_ID = 'system-page-size';
    const PAGINATION_INFO_ID = 'system-pagination-info';
    const PAGE_NUMBERS_ID = 'system-page-numbers';
    const FIRST_ID = 'system-first';
    const PREV_ID = 'system-prev';
    const NEXT_ID = 'system-next';
    const LAST_ID = 'system-last';

    const BASE_INFO_COLS = ['profile','emp_no','name','nickname','company','department','role','employment_status','ext_phone','mobile_phone','email','job','allowed_ip'];
    const AUDIT_INFO_COLS = ['last_login_at','password_changed_at','password_expires_at','locked','fail_cnt','lock_reset','password_reset','created_at','updated_at'];
    // 숨김 기본값(기존 로직) -> 가시 컬럼 기본값으로 역변환
    const DEFAULT_HIDDEN_COLS = AUDIT_INFO_COLS.concat(['nickname','ext_phone','mobile_phone','email','job']);
    const ALL_TABLE_COLS = BASE_INFO_COLS.concat(AUDIT_INFO_COLS); // actions 제외
    const DEFAULT_VISIBLE_COLS = ALL_TABLE_COLS.filter(c => !DEFAULT_HIDDEN_COLS.includes(c));
    // 온프레미스 패턴과 동일한 키 사용: system_visible_cols (가시 컬럼 집합)
    const VISIBLE_COL_LS_KEY = 'system_visible_cols';
    function readVisibleSetEarly(){
        try {
            const raw = localStorage.getItem(VISIBLE_COL_LS_KEY);
            if(!raw) return new Set(DEFAULT_VISIBLE_COLS);
            const arr = JSON.parse(raw);
            if(!Array.isArray(arr) || !arr.length) return new Set(DEFAULT_VISIBLE_COLS);
            // 허용 컬럼만 유지
            const allowed = new Set(ALL_TABLE_COLS);
            const filtered = arr.filter(c => allowed.has(c));
            return filtered.length ? new Set(filtered) : new Set(DEFAULT_VISIBLE_COLS);
        } catch(_e){ return new Set(DEFAULT_VISIBLE_COLS); }
    }

    function allTableColumns(){
        return Array.from(document.querySelectorAll('#system-table thead th[data-col]')).map(th=>th.getAttribute('data-col'));
    }

    const state = { rows:[], filtered:[], pageSize:10, page:1, search:'', colFilters:{} };
    // 서명 이미지 맵 (emp_no → base64 data URL) — HTML 속성에 넣기엔 너무 큼
    const signatureMap = {};

    // 접근성/포커스 트랩 유틸 (간단 버전)
    function applyModalA11y(modal, initialFocus){
        if(!modal) return;
        const focusables = () => Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
            .filter(el => !el.disabled && el.offsetParent !== null);
        function onKey(e){
            if(e.key === 'Escape'){ e.preventDefault(); closeModal(modal); }
            if(e.key === 'Tab'){
                const list = focusables(); if(!list.length) return;
                const first = list[0]; const last = list[list.length-1];
                if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
                else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
            }
        }
        modal.__a11yHandler = onKey;
        document.addEventListener('keydown', onKey);
        if(initialFocus){
            const target = typeof initialFocus === 'string' ? modal.querySelector(initialFocus) : initialFocus;
            setTimeout(()=>{ target && target.focus && target.focus(); }, 10);
        }
        document.documentElement.classList.add('modal-open');
    }
    function closeModal(modal){
        if(!modal) return;
        if(modal.__a11yHandler){ document.removeEventListener('keydown', modal.__a11yHandler); delete modal.__a11yHandler; }
        document.documentElement.classList.remove('modal-open');
    }

    // -------------------- 유틸 --------------------
    function initState(){
        try {
            const raw = localStorage.getItem('system_page_size');
            const v = parseInt(raw,10);
            if([10,20,50,100].includes(v)){
                state.pageSize = v;
                const sel = document.getElementById(PAGE_SIZE_ID); if(sel) sel.value = String(v);
            }
        } catch(_e){}
        return true;
    }

    function applyFilter(){
        const q = state.search.trim().toLowerCase();
        let result = [...state.rows];
        if(q) result = result.filter(r => r.textContent.toLowerCase().includes(q));
        // Column-specific dropdown filters
        Object.keys(state.colFilters).forEach(col=>{
            const fv = state.colFilters[col];
            if(!fv) return;
            result = result.filter(r=>{
                const td = r.querySelector(`td[data-col="${col}"]`);
                return td && td.textContent.trim() === fv;
            });
        });
        state.filtered = result;
        state.page = 1;
        renderPage();
    }

    function totalPages(){ return Math.max(1, Math.ceil(state.filtered.length / state.pageSize)); }

    function renderPage(){
        const start = (state.page-1)*state.pageSize;
        const end = start + state.pageSize;
        state.filtered.forEach((tr, idx)=>{ tr.hidden = !(idx>=start && idx<end); });
        state.rows.forEach(r=>{ if(!state.filtered.includes(r)) r.hidden = true; });
        updateCountBadge();
        updatePagination();
    }

    function updateCountBadge(){
        const el = document.getElementById(COUNT_ID); if(!el) return;
        const next = state.filtered.length;
        el.textContent = String(next);
        el.setAttribute('data-count', String(next));
        el.classList.remove('large-number','very-large-number');
        if(next>=1000) el.classList.add('very-large-number'); else if(next>=100) el.classList.add('large-number');
    }

    function updatePagination(){
        const info = document.getElementById(PAGINATION_INFO_ID);
        if(info){
            const count = state.filtered.length;
            if(count===0) info.textContent = '0개 항목';
            else {
                const start = (state.page-1)*state.pageSize + 1;
                const end = Math.min(count, state.page*state.pageSize);
                info.textContent = `${start}-${end} / ${count}개 항목`;
            }
        }
        const pages = totalPages();
        const nums = document.getElementById(PAGE_NUMBERS_ID);
        if(nums){
            nums.innerHTML='';
            for(let p=1; p<=pages && p<=50; p++){
                const b = document.createElement('button');
                b.type='button';
                b.className='page-btn'+(p===state.page?' active':'');
                b.dataset.page = p;
                b.textContent = p;
                nums.appendChild(b);
            }
            if(pages===1 && !nums.querySelector('.page-btn')){
                const b = document.createElement('button'); b.type='button'; b.className='page-btn active'; b.dataset.page='1'; b.textContent='1'; nums.appendChild(b);
            }
        }
        togglePageNav();
    }

    // -------------------- 컬럼 드롭다운 필터 (검색 포함) --------------------
    const COL_FILTER_DEFS = {
        'role': { label:'역할', options:['관리자','사용자','팀장','승인권자','감사자'] },
        'employment_status': { label:'재직', options:['재직','휴직','퇴직'] }
    };

    function initColFilters(){
        // Inject CSS once
        if(!document.getElementById('col-filter-css')){
            const css = document.createElement('style'); css.id='col-filter-css';
            css.textContent = `
                .col-filter-btn{background:none;border:none;cursor:pointer;padding:2px 4px;margin-left:4px;font-size:11px;color:#6c757d;vertical-align:middle;position:relative}
                .col-filter-btn.active{color:#5b40e0;font-weight:bold}
                .col-filter-panel{position:fixed;z-index:99999;background:#fff;border:1px solid #d0d0d0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.15);min-width:180px;max-height:260px;display:flex;flex-direction:column;font-size:13px}
                .col-filter-panel .cfp-search{padding:6px 8px;border-bottom:1px solid #eee}
                .col-filter-panel .cfp-search input{width:100%;padding:5px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px;box-sizing:border-box}
                .col-filter-panel .cfp-list{overflow-y:auto;flex:1;padding:4px 0}
                .col-filter-panel .cfp-item{padding:6px 12px;cursor:pointer;white-space:nowrap}
                .col-filter-panel .cfp-item:hover{background:#f0edff}
                .col-filter-panel .cfp-item.selected{background:#ece8ff;font-weight:600;color:#5b40e0}
                .col-filter-panel .cfp-clear{padding:6px 12px;cursor:pointer;color:#e74c3c;border-top:1px solid #eee;text-align:center;font-size:12px}
                .col-filter-panel .cfp-clear:hover{background:#ffeaea}
            `;
            document.head.appendChild(css);
        }

        let openPanel = null;
        function closePanel(){ if(openPanel){ openPanel.remove(); openPanel=null; } }
        document.addEventListener('mousedown', function(e){
            if(openPanel && !openPanel.contains(e.target) && !e.target.classList.contains('col-filter-btn')) closePanel();
        });

        Object.keys(COL_FILTER_DEFS).forEach(col=>{
            const def = COL_FILTER_DEFS[col];
            const th = document.querySelector(`#system-table thead th[data-col="${col}"]`);
            if(!th) return;
            const btn = document.createElement('button');
            btn.type='button'; btn.className='col-filter-btn'; btn.innerHTML='▼'; btn.title=def.label+' 필터';
            th.appendChild(btn);

            btn.addEventListener('click', function(e){
                e.stopPropagation();
                if(openPanel){ const wasThis = openPanel.dataset.col===col; closePanel(); if(wasThis) return; }

                const panel = document.createElement('div'); panel.className='col-filter-panel'; panel.dataset.col=col;
                // Search box
                const searchDiv = document.createElement('div'); searchDiv.className='cfp-search';
                const searchInput = document.createElement('input'); searchInput.placeholder='검색...'; searchInput.type='text';
                searchDiv.appendChild(searchInput); panel.appendChild(searchDiv);
                // List
                const listDiv = document.createElement('div'); listDiv.className='cfp-list';
                function buildItems(filter){
                    listDiv.innerHTML='';
                    const fq = (filter||'').trim().toLowerCase();
                    const active = state.colFilters[col]||'';
                    def.options.forEach(opt=>{
                        if(fq && !opt.toLowerCase().includes(fq)) return;
                        const item = document.createElement('div');
                        item.className='cfp-item'+(opt===active?' selected':'');
                        item.textContent = opt;
                        item.addEventListener('click', function(){
                            state.colFilters[col] = opt;
                            btn.classList.add('active'); btn.innerHTML='▼';
                            closePanel(); applyFilter();
                        });
                        listDiv.appendChild(item);
                    });
                }
                buildItems();
                panel.appendChild(listDiv);
                // Clear button
                const clearDiv = document.createElement('div'); clearDiv.className='cfp-clear'; clearDiv.textContent='✕ 필터 해제';
                clearDiv.addEventListener('click', function(){
                    delete state.colFilters[col];
                    btn.classList.remove('active');
                    closePanel(); applyFilter();
                });
                panel.appendChild(clearDiv);
                // Search keyup
                searchInput.addEventListener('input', function(){ buildItems(searchInput.value); });
                // Position (fixed, below button)
                document.body.appendChild(panel);
                const rect = btn.getBoundingClientRect();
                let top = rect.bottom + 4; let left = rect.left;
                if(top + panel.offsetHeight > window.innerHeight) top = rect.top - panel.offsetHeight - 4;
                if(left + panel.offsetWidth > window.innerWidth) left = window.innerWidth - panel.offsetWidth - 8;
                panel.style.top = top+'px'; panel.style.left = left+'px';
                openPanel = panel;
                setTimeout(()=>searchInput.focus(), 30);
            });
        });
    }

    // -------------------- 검색 가능 드롭다운 셀렉트 (Searchable Select) --------------------
    var _ssStyled = false;
    function _injectSSCSS(){
        if(_ssStyled) return; _ssStyled = true;
        var s = document.createElement('style');
        s.textContent = [
            '.fk-searchable-control{position:relative;width:100%;}',
            '.fk-searchable-control .fk-search-native-hidden{display:none;}',
            '.fk-searchable-control .fk-searchable-display{',
            '  width:100%;box-sizing:border-box;border:1px solid #e5e7eb;background-color:#fff;border-radius:8px;',
            '  padding:12px 42px 12px 14px;min-height:44px;font-size:14px;text-align:left;color:#0f172a;',
            '  transition:border-color .15s ease, box-shadow .15s ease;position:relative;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
            '}',
            '.modal-overlay-full .fk-searchable-control .fk-searchable-display{border-width:1px;}',
            '.fk-searchable-control .fk-searchable-display:focus{outline:none;border-color:#e5e7eb;box-shadow:0 0 0 2px rgba(229,231,235,0.5);}',
            '.fk-searchable-control .fk-searchable-display::after{',
            '  content:"";position:absolute;top:50%;right:12px;width:0;height:0;',
            '  border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #475569;',
            '  transform:translateY(-25%);pointer-events:none;',
            '}',
            '.fk-searchable-control .fk-searchable-display:not(.has-value){color:#94a3b8;}',
            '.fk-searchable-control .fk-searchable-clear{',
            '  position:absolute;top:50%;right:34px;transform:translateY(-50%);border:none;background:transparent;',
            '  color:#94a3b8;font-size:12px;cursor:pointer;padding:2px 4px;opacity:0;transition:opacity .15s ease;',
            '}',
            '.fk-searchable-control:hover .fk-searchable-clear{opacity:1;}',
            '.fk-searchable-control .fk-searchable-clear:hover{color:#0f172a;}',
            '.fk-searchable-control.is-disabled .fk-searchable-display,.fk-searchable-control.is-disabled .fk-searchable-clear{cursor:not-allowed;opacity:.6;}',
            '.fk-search-panel{',
            '  position:fixed;background-color:#fff;border:1px solid #e5e7eb;border-radius:12px;',
            '  box-shadow:0 20px 40px rgba(15,23,42,.18);z-index:9999;max-height:380px;',
            '  display:flex;flex-direction:column;overflow:hidden;',
            '}',
            '.fk-search-panel__header{display:flex;gap:8px;padding:12px;border-bottom:1px solid #eef2f7;}',
            '.fk-search-panel__input{flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;font-size:14px;}',
            '.fk-search-panel__input:focus{outline:none;border-color:#e5e7eb;box-shadow:0 0 0 2px rgba(229,231,235,0.5);}',
            '.fk-search-panel__close{border:none;background:#f1f5f9;border-radius:8px;padding:0 12px;font-size:13px;cursor:pointer;color:#475569;}',
            '.fk-search-panel__list{padding:6px 0;max-height:260px;overflow-y:auto;overscroll-behavior:contain;}',
            '.fk-search-panel__item{width:100%;text-align:left;padding:10px 16px;border:none;background:transparent;cursor:pointer;font-size:14px;color:#0f172a;}',
            '.fk-search-panel__item:hover,.fk-search-panel__item.active{background-color:rgba(99,102,241,.08);}',
            '.fk-search-panel__item.selected,.fk-search-panel__item.is-selected{font-weight:600;color:#4f46e5;}',
            '.fk-search-panel__empty{padding:16px;font-size:14px;color:#6b7280;}'
        ].join('\n');
        document.head.appendChild(s);
    }

    var _ssActive = null;
    function _ssClose(){
        if(!_ssActive) return;
        var st = _ssActive; _ssActive = null;
        try{ document.removeEventListener('pointerdown', st._hOut, true); }catch(_){}
        try{ document.removeEventListener('keydown', st._hKey, true); }catch(_){}
        try{ window.removeEventListener('resize', st._hResize); }catch(_){}
        try{ window.removeEventListener('scroll', st._hScroll, true); }catch(_){}
        try{ st.panel.parentNode.removeChild(st.panel); }catch(_){}
        if(st.btn) st.btn.focus();
    }

    function _ssPosition(st){
        var rect = st.anchor.getBoundingClientRect();
        var w = Math.max(rect.width, 200);
        st.panel.style.width = w + 'px';
        var left = rect.left;
        if(left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
        if(left < 8) left = 8;
        var top = rect.bottom + 4;
        var pH = st.panel.offsetHeight || 180;
        if(pH > (window.innerHeight - rect.bottom - 8) && rect.top - 8 > window.innerHeight - rect.bottom - 8){
            top = rect.top - pH - 4;
        }
        if(top < 8) top = 8;
        st.panel.style.left = left + 'px';
        st.panel.style.top = top + 'px';
    }

    function blsSearchableSelect(sel){
        if(!sel || sel.dataset.blsSS) return;
        sel.dataset.blsSS = '1';
        _injectSSCSS();
        var td = sel.parentNode;
        var ctrl = document.createElement('div'); ctrl.className = 'fk-searchable-control';
        var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'fk-searchable-display';
        var clearBtn = document.createElement('button'); clearBtn.type = 'button'; clearBtn.className = 'fk-searchable-clear'; clearBtn.textContent = '✕'; clearBtn.title = '선택 해제';
        btn.setAttribute('aria-haspopup', 'dialog');
        sel.classList.add('fk-search-native-hidden');
        td.insertBefore(ctrl, sel);
        ctrl.appendChild(btn);
        ctrl.appendChild(clearBtn);
        ctrl.appendChild(sel);

        function syncBtn(){
            var o = sel.options[sel.selectedIndex];
            var hasVal = !!(o && o.value && !o.disabled);
            btn.textContent = hasVal ? o.text : '선택';
            btn.title = hasVal ? o.text : '선택';
            btn.classList.toggle('has-value', hasVal);
            btn.disabled = !!sel.disabled;
            clearBtn.style.visibility = hasVal ? 'visible' : 'hidden';
            ctrl.classList.toggle('is-disabled', !!sel.disabled);
        }

        function openPanel(){
            if(sel.disabled) return;
            _ssClose();
            var panel = document.createElement('div'); panel.className = 'fk-search-panel';
            panel.setAttribute('role', 'dialog');
            var hd = document.createElement('div'); hd.className = 'fk-search-panel__header';
            var inp = document.createElement('input'); inp.type = 'text'; inp.className = 'fk-search-panel__input';
            inp.placeholder = '검색어 입력'; inp.autocomplete = 'off';
            var cls = document.createElement('button'); cls.type = 'button'; cls.className = 'fk-search-panel__close'; cls.textContent = '닫기';
            hd.appendChild(inp); hd.appendChild(cls); panel.appendChild(hd);
            var list = document.createElement('div'); list.className = 'fk-search-panel__list'; list.setAttribute('role', 'listbox');
            panel.appendChild(list);
            var emptyEl = document.createElement('div'); emptyEl.className = 'fk-search-panel__empty'; emptyEl.textContent = '검색 결과가 없습니다.'; emptyEl.hidden = true;
            panel.appendChild(emptyEl);
            document.body.appendChild(panel);

            var allOpts = [];
            for(var i = 0; i < sel.options.length; i++){
                var o = sel.options[i];
                if(o.disabled && !o.value) continue;
                allOpts.push({ text: (o.text||o.value||'').trim(), value: o.value, lower: (o.text||o.value||'').trim().toLowerCase() });
            }
            var filtered = allOpts.slice(), focusIdx = -1;

            function renderItems(){
                list.innerHTML = '';
                if(!filtered.length){ emptyEl.hidden = false; focusIdx = -1; return; }
                emptyEl.hidden = true;
                var curVal = sel.value || '';
                filtered.forEach(function(it, j){
                    var b = document.createElement('button'); b.type = 'button';
                    b.className = 'fk-search-panel__item' + (it.value === curVal ? ' selected' : '');
                    b.textContent = it.text; b.dataset.val = it.value;
                    b.setAttribute('role', 'option'); b.tabIndex = -1;
                    if(it.value === curVal) focusIdx = j;
                    b.addEventListener('click', function(e){
                        e.preventDefault();
                        sel.value = it.value;
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                        syncBtn(); _ssClose();
                    });
                    list.appendChild(b);
                });
            }
            function filterItems(){
                var q = (inp.value || '').trim().toLowerCase();
                filtered = !q ? allOpts.slice() : allOpts.filter(function(it){ return it.lower.indexOf(q) >= 0; });
                focusIdx = -1; renderItems();
            }
            function focusItem(idx){
                var items = list.querySelectorAll('.fk-search-panel__item');
                if(!items.length) return;
                idx = Math.max(0, Math.min(idx, items.length - 1)); focusIdx = idx;
                items.forEach(function(b, i){ b.classList.toggle('active', i === idx); });
                items[idx].scrollIntoView({ block: 'nearest' });
            }

            renderItems();

            var st = { panel: panel, anchor: ctrl, btn: btn, inp: inp };
            _ssActive = st;
            _ssPosition(st);
            setTimeout(function(){ inp.focus(); }, 0);

            cls.addEventListener('click', function(e){ e.preventDefault(); _ssClose(); });
            inp.addEventListener('input', filterItems);
            inp.addEventListener('keydown', function(e){
                if(e.key === 'ArrowDown'){
                    e.preventDefault();
                    var items = list.querySelectorAll('.fk-search-panel__item');
                    if(items.length) focusItem(focusIdx < 0 ? 0 : Math.min(focusIdx + 1, items.length - 1));
                    if(items[focusIdx]) items[focusIdx].focus();
                } else if(e.key === 'Enter'){
                    e.preventDefault();
                    if(focusIdx >= 0 && filtered[focusIdx]){
                        sel.value = filtered[focusIdx].value;
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                        syncBtn(); _ssClose();
                    }
                } else if(e.key === 'Escape'){ _ssClose(); }
            });
            list.addEventListener('keydown', function(e){
                var isItem = e.target && e.target.classList.contains('fk-search-panel__item');
                if(!isItem) return;
                if(e.key === 'ArrowDown'){ e.preventDefault(); focusItem(focusIdx + 1); var items = list.querySelectorAll('.fk-search-panel__item'); if(items[focusIdx]) items[focusIdx].focus(); }
                else if(e.key === 'ArrowUp'){ e.preventDefault(); if(focusIdx <= 0){ inp.focus(); focusIdx = -1; return; } focusItem(focusIdx - 1); var items2 = list.querySelectorAll('.fk-search-panel__item'); if(items2[focusIdx]) items2[focusIdx].focus(); }
                else if(e.key === 'Escape'){ e.preventDefault(); _ssClose(); }
            });
            st._hOut = function(e){
                if(panel.contains(e.target) || ctrl.contains(e.target)) return;
                _ssClose();
            };
            document.addEventListener('pointerdown', st._hOut, true);
            st._hKey = function(e){ if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); _ssClose(); } };
            document.addEventListener('keydown', st._hKey, true);
            st._hResize = function(){ _ssClose(); };
            window.addEventListener('resize', st._hResize);
            st._hScroll = function(e){
                if(e.target && (panel.contains(e.target) || ctrl.contains(e.target))) return;
                _ssClose();
            };
            window.addEventListener('scroll', st._hScroll, true);
        }

        btn.addEventListener('click', function(e){ e.preventDefault(); openPanel(); });
        clearBtn.addEventListener('click', function(e){
            e.preventDefault();
            if(sel.disabled) return;
            sel.value = '';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            syncBtn();
        });
        sel.addEventListener('change', function(){ syncBtn(); });
        var mo = new MutationObserver(function(){ syncBtn(); });
        mo.observe(sel, { childList: true, attributes: true, attributeFilter: ['disabled'] });
        syncBtn();
        return ctrl;
    }

    // -------------------- 소속(부서) 드롭다운 데이터 --------------------
    var _deptOptionCache = null;
    var _deptOptionPending = null;
    var _companyOptionCache = null;
    var _companyOptionPending = null;

    function fetchCompanyNames(force){
        if(!force && Array.isArray(_companyOptionCache)) return Promise.resolve(_companyOptionCache.slice());
        if(!force && _companyOptionPending) return _companyOptionPending;
        var url = '/api/org-companies?_ts=' + Date.now();
        _companyOptionPending = fetch(url, { credentials: 'same-origin', cache: 'no-store' })
            .then(function(r){
                if(!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function(data){
                var items = Array.isArray(data && data.items) ? data.items : [];
                var seen = {};
                var names = [];
                items.forEach(function(it){
                    var name = (it && it.company_name ? String(it.company_name) : '').trim();
                    if(!name || seen[name]) return;
                    seen[name] = true;
                    names.push(name);
                });
                names.sort(function(a,b){ return a.localeCompare(b, 'ko'); });
                _companyOptionCache = names;
                return names.slice();
            })
            .catch(function(){
                return Array.isArray(_companyOptionCache) ? _companyOptionCache.slice() : [];
            })
            .finally(function(){ _companyOptionPending = null; });
        return _companyOptionPending;
    }

    function bindCompanySelect(selectEl, selectedValue){
        if(!selectEl) return;
        var selected = (selectedValue || '').trim();
        fetchCompanyNames().then(function(names){
            var exists = {};
            selectEl.innerHTML = '';
            var ph = document.createElement('option');
            ph.value = '';
            ph.textContent = '회사 선택';
            selectEl.appendChild(ph);
            names.forEach(function(name){
                var opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                exists[name] = true;
                selectEl.appendChild(opt);
            });
            if(selected && selected !== '-' && !exists[selected]){
                var legacy = document.createElement('option');
                legacy.value = selected;
                legacy.textContent = selected;
                selectEl.appendChild(legacy);
            }
            selectEl.value = (selected && selected !== '-') ? selected : '';
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            blsSearchableSelect(selectEl);
        });
    }

    function fetchDepartmentNames(force){
        if(!force && Array.isArray(_deptOptionCache)) return Promise.resolve(_deptOptionCache.slice());
        if(!force && _deptOptionPending) return _deptOptionPending;
        var url = '/api/org-departments?_ts=' + Date.now();
        _deptOptionPending = fetch(url, { credentials: 'same-origin', cache: 'no-store' })
            .then(function(r){
                if(!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function(data){
                var items = Array.isArray(data && data.items) ? data.items : [];
                var seen = {};
                var names = [];
                items.forEach(function(it){
                    var name = (it && it.dept_name ? String(it.dept_name) : '').trim();
                    if(!name || seen[name]) return;
                    seen[name] = true;
                    names.push(name);
                });
                names.sort(function(a,b){ return a.localeCompare(b, 'ko'); });
                _deptOptionCache = names;
                return names.slice();
            })
            .catch(function(){
                return Array.isArray(_deptOptionCache) ? _deptOptionCache.slice() : [];
            })
            .finally(function(){ _deptOptionPending = null; });
        return _deptOptionPending;
    }

    function bindDepartmentSelect(selectEl, selectedValue){
        if(!selectEl) return;
        var selected = (selectedValue || '').trim();
        fetchDepartmentNames().then(function(names){
            var exists = {};
            selectEl.innerHTML = '';
            var ph = document.createElement('option');
            ph.value = '';
            ph.textContent = '소속 선택';
            selectEl.appendChild(ph);
            names.forEach(function(name){
                var opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                exists[name] = true;
                selectEl.appendChild(opt);
            });
            if(selected && selected !== '-' && !exists[selected]){
                var legacy = document.createElement('option');
                legacy.value = selected;
                legacy.textContent = selected;
                selectEl.appendChild(legacy);
            }
            selectEl.value = (selected && selected !== '-') ? selected : '';
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            blsSearchableSelect(selectEl);
        });
    }

    // -------------------- 공용 POST 헬퍼 --------------------
    function apiPost(url, data){
        const fd = new FormData();
        Object.keys(data||{}).forEach(k=>{ if(data[k]!==undefined && data[k]!==null) fd.append(k, data[k]); });
        return fetch(url, {
            method:'POST',
            body:fd,
            credentials:'same-origin',
            headers: {
                // CSRF 미들웨어는 AJAX 헤더(X-Requested-With)를 허용 조건으로 사용한다.
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
            .then(r => {
                const ct = r.headers.get('content-type')||'';
                if(!r.ok) return r.text().then(t=>{ throw new Error('HTTP '+r.status+' '+t.slice(0,200)); });
                if(!/json/i.test(ct)) return r.text().then(t=>{ throw new Error('Non-JSON response '+ct); });
                return r.json();
            });
    }

    // -------------------- 팀장/승인권자 소속별 1명 제한 검증 --------------------
    const ROLE_LABEL_MAP = { 'TEAM_LEADER':'팀장', 'APPROVER':'승인권자' };
    const ROLE_DISPLAY_TO_CODE = { '팀장':'TEAM_LEADER', '승인권자':'APPROVER' };
    /**
     * 소속별 팀장/승인권자 중복 검증.
     * @param {string} roleCode - 'TEAM_LEADER' | 'APPROVER'
     * @param {string} department - 소속
     * @param {string} [excludeEmpNo] - 수정 중인 사용자 사번 (자기 자신 제외)
     * @returns {string|null} 에러 메시지 또는 null
     */
    function checkUniqueRolePerDept(roleCode, department, excludeEmpNo){
        const upper = (roleCode || '').toUpperCase();
        if(upper !== 'TEAM_LEADER' && upper !== 'APPROVER') return null;
        const dept = (department || '').trim();
        if(!dept) return null;
        const label = ROLE_LABEL_MAP[upper];
        // 테이블에서 같은 소속 + 같은 역할 행 탐색
        const rows = Array.from(document.querySelectorAll('#system-table tbody tr'));
        for(const tr of rows){
            const rowDept = (tr.querySelector("td[data-col='department']")?.textContent || '').trim();
            if(rowDept !== dept) continue;
            const rowRoleText = (tr.querySelector("td[data-col='role']")?.textContent || '').trim();
            const rowRoleCode = ROLE_DISPLAY_TO_CODE[rowRoleText] || rowRoleText.toUpperCase();
            if(rowRoleCode !== upper) continue;
            const rowEmpNo = (tr.querySelector("td[data-col='emp_no']")?.textContent || '').trim();
            if(excludeEmpNo && rowEmpNo === excludeEmpNo) continue;
            return `${dept} 소속에 이미 ${label}(${rowEmpNo})이(가) 존재합니다.\n소속별 ${label}은(는) 1명만 가능합니다.`;
        }
        return null;
    }

    function togglePageNav(){
        const pages = totalPages();
        const first = document.getElementById(FIRST_ID);
        const prev = document.getElementById(PREV_ID);
        const next = document.getElementById(NEXT_ID);
        const last = document.getElementById(LAST_ID);
        if(first) first.disabled = state.page===1; if(prev) prev.disabled = state.page===1;
        if(next) next.disabled = state.page===pages; if(last) last.disabled = state.page===pages;
    }

    // -------------------- 데이터 로드 --------------------
    function buildRow(u){
        const roleMap = { 'ADMIN':'관리자','admin':'관리자','USER':'사용자','user':'사용자','TEAM_LEADER':'팀장','team_leader':'팀장','APPROVER':'승인권자','approver':'승인권자','AUDITOR':'감사자','auditor':'감사자' };
        const roleLabel = roleMap[u.role] || u.role;
        const roleUpper = String(u.role || '').toUpperCase();
        const isAdminUser = (roleUpper === 'ADMIN' || roleLabel === '관리자');
        const disabled = isAdminUser ? ' disabled' : '';
        const visible = readVisibleSetEarly();
        const hc = c => visible.has(c) ? '' : ' col-hidden';
        // 관리자 아이콘 (경로 정정, 불필요한 fallback 제거하여 잔여 문자("'">") 출력 방지)
        const crown = (roleLabel === '관리자') ? '<span class="role-icon-wrapper"><img src="/static/image/svg/admin/free-icon-crown.svg" alt="관리자" class="role-icon"></span>' : '';
        return `<tr data-id="${u.emp_no}">`+
            `<td><input type="checkbox" class="system-row-select" value="${u.emp_no}" aria-label="${u.emp_no} 선택"${disabled}></td>`+
            `<td data-col="profile" class="profile-cell${hc('profile')}"><img src="${u.profile_image || '/static/image/svg/profil/free-icon-bussiness-man.svg'}" alt="${u.name || u.emp_no} 프로필" class="profile-avatar" loading="lazy" data-debug-user-avatar="${u.profile_image}"></td>`+
            `<td data-col="emp_no" class="${hc('emp_no')}">${u.emp_no}</td>`+
            `<td data-col="name" class="${hc('name')}">${u.name || '-'}</td>`+
            `<td data-col="nickname" class="${hc('nickname')}">${u.nickname || '-'}</td>`+
            `<td data-col="company" class="${hc('company')}">${u.company || '-'}</td>`+
            `<td data-col="department" class="${hc('department')}">${u.department || '-'}</td>`+
            `<td data-col="role" class="${hc('role')}">${crown}${roleLabel}</td>`+
            `<td data-col="employment_status" class="${hc('employment_status')}">${u.employment_status || '-'}</td>`+
            `<td data-col="ext_phone" class="${hc('ext_phone')}">${u.ext_phone || '-'}</td>`+
            `<td data-col="mobile_phone" class="${hc('mobile_phone')}">${u.mobile_phone || '-'}</td>`+
            `<td data-col="email" class="${hc('email')}">${u.email || '-'}</td>`+
            `<td data-col="job" class="${hc('job')}">${u.job || '-'}</td>`+
            `<td data-col="last_login_at" class="${hc('last_login_at')}">${u.last_login_at || '-'}</td>`+
            `<td data-col="password_changed_at" class="${hc('password_changed_at')}">${u.password_changed_at || '-'}</td>`+
            `<td data-col="password_expires_at" class="${hc('password_expires_at')}">${u.password_expires_at || '-'}</td>`+
            `<td data-col="locked" class="${hc('locked')}">${u.locked ? '잠금' : '정상'}</td>`+
            `<td data-col="fail_cnt" class="${hc('fail_cnt')}">${u.fail_cnt}</td>`+
            `<td data-col="lock_reset" class="${hc('lock_reset')}">`+
                `<form method="post" action="/admin/auth/locked" class="admin-actions" style="display:flex;">`+
                    `<input type="hidden" name="emp_no" value="${u.emp_no}">`+
                    `<button type="submit" class="action-btn" data-action="unlock" title="잠금 초기화" aria-label="잠금 초기화">`+
                        `<img src="/static/image/svg/admin/free-icon-refresh.svg" alt="잠금 초기화" class="action-icon">`+
                    `</button>`+
                `</form>`+
            `</td>`+
            `<td data-col="password_reset" class="${hc('password_reset')}">`+
                `<form method="post" action="/admin/auth/password_reset" class="admin-actions" style="display:flex;">`+
                    `<input type="hidden" name="emp_no" value="${u.emp_no}">`+
                    `<button type="submit" class="action-btn" data-action="pwreset" title="비밀번호 초기화" aria-label="비밀번호 초기화">`+
                        `<img src="/static/image/svg/admin/free-icon-refresh.svg" alt="비밀번호 초기화" class="action-icon">`+
                    `</button>`+
                `</form>`+
            `</td>`+
            `<td data-col="created_at" class="${hc('created_at')}">${u.created_at || '-'}</td>`+
            `<td data-col="updated_at" class="${hc('updated_at')}">${u.updated_at || '-'}</td>`+
            `<td data-col="allowed_ip" class="${hc('allowed_ip')}">${u.allowed_ip || '-'}</td>`+
            `<td data-col="actions" class="system-actions">`+
                `<button type="button" class="action-btn user-edit-btn" data-action="edit" data-emp-no="${u.emp_no}" title="수정" aria-label="${u.emp_no} 수정">`+
                    `<img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon">`+
                `</button>`+
            `</td>`+
        `</tr>`;
    }

    function fetchUsers(highlightEmpNo){
        const url = '/admin/auth/locked?format=json&_ts=' + Date.now();
        fetch(url, {credentials:'same-origin', cache:'no-store'})
            .then(r => {
                const ct = r.headers.get('content-type')||'';
                if(!r.ok) return r.text().then(t=>{ throw new Error('HTTP '+r.status+' '+t.slice(0,120)); });
                if(!/application\/json/i.test(ct)) return r.text().then(t=>{ throw new Error('Non-JSON '+ct+' '+t.slice(0,120)); });
                return r.json();
            })
            .then(data => {
                const list = Array.isArray(data.users) ? data.users : [];
                // 서명 맵 갱신
                list.forEach(u => { if(u.signature_image) signatureMap[u.emp_no] = u.signature_image; else delete signatureMap[u.emp_no]; });
                const tbody = document.getElementById(TBODY_ID); if(!tbody) return;
                tbody.innerHTML = list.map(buildRow).join('');
                state.rows = Array.from(tbody.querySelectorAll('tr'));
                applyFilter();
                initEditButtons();
                if(highlightEmpNo){
                    const tr = state.rows.find(r => r.querySelector('td[data-col="emp_no"]').textContent.trim() === highlightEmpNo);
                    if(tr){ tr.classList.add('just-created'); setTimeout(()=>tr.classList.remove('just-created'),4000); }
                }
                // 컬럼 숨김 초기 적용 (감사 정보 숨김)
                initColumnVisibility();
                ensureAdminAvatarSync();
            })
            .catch(err => { console.error('[user_list] fetch error', err); showMessage('오류','사용자 목록 로드 실패: '+err.message); });
    }

    // 헤더 아바타와 ADMIN 행 프로필 이미지 불일치시 헤더 갱신
    function ensureAdminAvatarSync(){
        try {
            const headerImg = document.querySelector('#btn-account .header-avatar-icon') || document.querySelector('#btn-account img');
            if(!headerImg) return;
            let currentEmp = localStorage.getItem('blossom.currentEmpNo');
            if(!currentEmp){
                // 테이블에서 role=관리자 행의 emp_no 추출하여 currentEmp 설정
                const adminRow = Array.from(document.querySelectorAll('#system-table tbody tr')).find(tr => {
                    return tr.querySelector("td[data-col='role']")?.textContent.includes('관리자');
                });
                const empCell = adminRow?.querySelector("td[data-col='emp_no']");
                if(empCell){
                    currentEmp = empCell.textContent.trim();
                    if(currentEmp) localStorage.setItem('blossom.currentEmpNo', currentEmp);
                }
            }
            if(!currentEmp) return; // 여전히 없음
            // 해당 emp의 행 이미지 찾기
            const targetRow = Array.from(document.querySelectorAll('#system-table tbody tr')).find(tr => tr.querySelector("td[data-col='emp_no']")?.textContent.trim() === currentEmp);
            const rowImg = targetRow?.querySelector("td[data-col='profile'] img");
            if(rowImg){
                const rowSrc = rowImg.getAttribute('src');
                const headerSrc = headerImg.getAttribute('src');
                if(rowSrc && headerSrc && rowSrc !== headerSrc){
                    window.dispatchEvent(new CustomEvent('blossom:avatarChanged',{ detail:{ src: rowSrc, empNo: currentEmp }}));
                }
            }
        } catch(e){ console.warn('[avatar-sync] error', e); }
    }

    // -------------------- 이벤트 바인딩 --------------------
    function bindEvents(){
        const search = document.getElementById(SEARCH_ID);
        const clearBtn = document.getElementById(SEARCH_CLEAR_ID);
        const pageSizeSel = document.getElementById(PAGE_SIZE_ID);
        search?.addEventListener('input', ()=>{ state.search = search.value; applyFilter(); });
        clearBtn?.addEventListener('click', ()=>{ if(!search) return; search.value=''; state.search=''; applyFilter(); search.focus(); });
        pageSizeSel?.addEventListener('change', e => { const v = parseInt(e.target.value,10); if([10,20,50,100].includes(v)){ state.pageSize = v; localStorage.setItem('system_page_size', String(v)); renderPage(); } });
        document.getElementById(PAGE_NUMBERS_ID)?.addEventListener('click', e=>{
            const btn = e.target.closest('.page-btn'); if(!btn) return; state.page = parseInt(btn.dataset.page,10); renderPage();
        });
        [FIRST_ID, PREV_ID, NEXT_ID, LAST_ID].forEach(id=>{
            const el = document.getElementById(id); if(!el) return;
            el.addEventListener('click', ()=>{
                const pages = totalPages();
                if(id===FIRST_ID) state.page = 1;
                else if(id===PREV_ID && state.page>1) state.page--;
                else if(id===NEXT_ID && state.page<pages) state.page++;
                else if(id===LAST_ID) state.page = pages;
                renderPage();
            });
        });
    }

    // -------------------- 컬럼 선택 (그룹) --------------------
    // 기존 위치에서 중복 선언 제거됨 (COL_LS_KEY 이미 상단 선언)
    // 가시 컬럼 기반 적용 (온프레미스 방식)
    function loadVisibleSet(){ return readVisibleSetEarly(); }
    function saveVisibleSet(set){ try { localStorage.setItem(VISIBLE_COL_LS_KEY, JSON.stringify(Array.from(set))); }catch(_e){} }
    function applyVisible(set){
        document.querySelectorAll('#system-table thead th[data-col], #system-table tbody td[data-col]').forEach(cell=>{
            const c = cell.getAttribute('data-col');
            if(c==='actions') return;
            cell.classList.toggle('col-hidden', !set.has(c));
        });
    }
    function initColumnVisibility(){ applyVisible(loadVisibleSet()); }

    function initColumnModal(){
        const openBtn = document.getElementById('system-column-btn');
        const modal = document.getElementById('system-column-modal');
        const form = document.getElementById('system-column-form');
        const closeBtn = document.getElementById('system-column-close');
        const applyBtn = document.getElementById('system-column-apply');
        const resetBtn = document.getElementById('system-column-reset');
        const selectAllBtn = document.getElementById('system-column-selectall-btn');
        if(!openBtn || !modal || !form || !closeBtn || !applyBtn) return;

        function currentCols(){ return allTableColumns().filter(c=> c!=='actions'); }
        // 요구사항: 두 섹션(기본 정보 / 보안 감사)만 사용
        const COLUMN_MODAL_GROUPS = [
            { group:'기본 정보', columns:['profile','emp_no','name','nickname','company','department','role','employment_status','ext_phone','mobile_phone','email','job','allowed_ip'] },
            { group:'보안 감사', columns:['last_login_at','password_changed_at','password_expires_at','locked','fail_cnt','lock_reset','password_reset','created_at','updated_at'] }
        ];
        function build(){
            const visible = loadVisibleSet();
            form.innerHTML='';
            COLUMN_MODAL_GROUPS.forEach(def=>{
                const section = document.createElement('div'); section.className='form-section';
                section.innerHTML = `<div class="section-header"><h4>${def.group}</h4></div>`;
                const grid = document.createElement('div'); grid.className='column-select-grid';
                def.columns.filter(c=> currentCols().includes(c)).forEach(c=>{
                    const th = document.querySelector(`#system-table thead th[data-col='${c}']`);
                    const labelText = th ? th.textContent.trim() : c;
                    const active = visible.has(c) ? ' is-active' : '';
                    const checked = visible.has(c) ? ' checked' : '';
                    const label = document.createElement('label');
                    label.className = 'column-checkbox'+active;
                    label.innerHTML = `<input type="checkbox" value="${c}" data-col="${c}"${checked}>`+
                                      `<span class="col-check" aria-hidden="true"></span>`+
                                      `<span class="col-text">${labelText}</span>`;
                    grid.appendChild(label);
                });
                section.appendChild(grid);
                form.appendChild(section);
            });
            if(selectAllBtn) selectAllBtn.textContent='전체 선택';
        }
        function open(){ build(); modal.classList.add('show'); modal.setAttribute('aria-hidden','false'); }
        function close(){ modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); }
        function apply(){
            const checked = Array.from(form.querySelectorAll('input[type=checkbox][data-col]:checked')).map(cb=> cb.getAttribute('data-col'));
            const MIN_COLS = 3;
            if(checked.length < MIN_COLS){ console.warn('[columns] 최소 선택 요구 미달'); return; }
            const nextVisible = new Set(checked);
            saveVisibleSet(nextVisible); applyVisible(nextVisible); close();
        }
        function reset(){ saveVisibleSet(new Set(DEFAULT_VISIBLE_COLS)); build(); }
        function selectAll(){ form.querySelectorAll('input[data-col]').forEach(cb=>{ cb.checked=true; const lbl=cb.closest('label.column-checkbox'); if(lbl) lbl.classList.add('is-active'); }); }

        openBtn.addEventListener('click', open);
        closeBtn.addEventListener('click', close);
        modal.addEventListener('click', e=>{ if(e.target===modal) close(); });
        applyBtn.addEventListener('click', apply);
        resetBtn?.addEventListener('click', ()=>{ reset(); });
        selectAllBtn?.addEventListener('click', ()=>{ selectAll(); });
        form.addEventListener('change', e=>{
            const cb = e.target.closest('input[type=checkbox][data-col]'); if(!cb) return;
            const label = cb.closest('label.column-checkbox'); if(label) label.classList.toggle('is-active', cb.checked);
        });
        // 초기 적용 (가시 컬럼 기반)
        setTimeout(()=>{ applyVisible(loadVisibleSet()); }, 100);
    }

    // 이전 hidden 기반 스토리지 키(user_columns_hidden) 존재 시 1회 마이그레이션
    (function migrateHiddenToVisible(){
        try {
            const legacy = localStorage.getItem('user_columns_hidden');
            if(!legacy) return;
            const hiddenArr = JSON.parse(legacy);
            if(Array.isArray(hiddenArr)){
                const hiddenSet = new Set(hiddenArr);
                const visible = ALL_TABLE_COLS.filter(c=> !hiddenSet.has(c));
                if(visible.length){ localStorage.setItem(VISIBLE_COL_LS_KEY, JSON.stringify(visible)); }
            }
            localStorage.removeItem('user_columns_hidden');
        }catch(_e){ /* ignore */ }
    })();

    // -------------------- 행 선택 --------------------
    function initRowSelection(){
        const selectAll = document.getElementById('system-select-all');
        const tbody = document.getElementById(TBODY_ID);
        if(!selectAll || !tbody) return;
        function sync(){
            const boxes = tbody.querySelectorAll('input.system-row-select');
            if(!boxes.length){ selectAll.checked=false; return; }
            selectAll.checked = [...boxes].every(b=>b.checked || b.disabled);
        }
        selectAll.addEventListener('change', ()=>{
            const boxes = tbody.querySelectorAll('input.system-row-select');
            boxes.forEach(b=>{ if(!b.disabled){ b.checked = selectAll.checked; b.dispatchEvent(new Event('change')); }});
            if(selectAll.checked && tbody.querySelector('input.system-row-select:disabled')){
                showMessage('알림','관리자 계정은 삭제할 수 없어 선택에서 제외됩니다.');
            }
        });
        tbody.addEventListener('change', e=>{
            const cb = e.target.closest('input.system-row-select'); if(!cb) return;
            const tr = cb.closest('tr'); if(tr){ tr.classList.toggle('selected', cb.checked); }
            sync();
        });
        // 행 영역 클릭 시 (체크박스/액션 버튼 제외) 선택 토글 - onpremise 리스트와 동일한 UX
        tbody.addEventListener('click', e=>{
            // 관리/액션 셀 내부 클릭은 무시
            if(e.target.closest('.system-actions')) return;
            // 체크박스 자체 클릭은 기본 change 처리 사용
            if(e.target.closest('input.system-row-select')) return;
            const tr = e.target.closest('tr'); if(!tr) return;
            const cb = tr.querySelector('input.system-row-select');
            if(!cb) return;
            if(cb.disabled){
                showMessage('알림','관리자 계정은 삭제할 수 없습니다.');
                return;
            }
            cb.checked = !cb.checked;
            // 기존 change 로직 재사용하여 스타일/전체선택 동기화
            cb.dispatchEvent(new Event('change', { bubbles: true }));
        });
        // 관리자 행의 비활성 체크박스 클릭 시 삭제 불가 안내
        tbody.addEventListener('click', e=>{
            const cb = e.target.closest('input.system-row-select:disabled');
            if(!cb) return;
            showMessage('알림','관리자 계정은 삭제할 수 없습니다.');
        });
    }

    // -------------------- 편집 버튼 (placeholder) --------------------
    function initEditButtons(){
        document.querySelectorAll('.user-edit-btn').forEach(btn=>{
            btn.addEventListener('click', ()=>{ const empNo = btn.dataset.empNo || btn.getAttribute('data-emp-no'); console.log('[edit] user', empNo); });
        });
    }

    // -------------------- 통계 모달 (비즈니스 단일 섹션 스타일) --------------------
    function initStatsModal(){
        const statsBtn = document.getElementById('system-stats-btn');
        const modal = document.getElementById('system-stats-modal');
        const closeBtn = document.getElementById('system-stats-close');
        const okBtn = document.getElementById('system-stats-ok');
        if(!statsBtn || !modal || !closeBtn || !okBtn) return;

        function countBy(arr, fn, fixed){
            const dist={};
            if(Array.isArray(fixed)) fixed.forEach(v=> dist[v]=0);
            arr.forEach(a=>{ const k = fn(a); if(k==null || k==='-' || k==='') return; dist[k]=(dist[k]||0)+1; });
            return dist;
        }
        function renderCard(title, dist, fixedOrder){
            const container = document.getElementById('stats-business');
            if(!container) return;
            const total = Object.values(dist).reduce((a,b)=>a+b,0)||0;
            function row(label,count){
                const pct = total? (count/total*100):0;
                const pctRounded = Math.round(pct);
                return `<div class="stat-item" role="listitem"><span class="label" title="${label}">${label}</span><div class="bar" aria-label="${label} 비율 ${pctRounded}%"><span style="width:${pctRounded}%"></span></div><span class="value">${count}</span></div>`;
            }
            let items='';
            if(Array.isArray(fixedOrder) && fixedOrder.length){
                items = fixedOrder.map(k=> row(k, dist[k]||0)).join('');
            } else {
                const entries = Object.entries(dist).sort((a,b)=> b[1]-a[1]);
                const top5 = entries.slice(0,5);
                const rest = entries.slice(5).reduce((a,[,v])=>a+v,0);
                items = top5.map(([k,v])=> row(k,v)).join('') + (rest? row('기타', rest):'');
            }
            container.insertAdjacentHTML('beforeend', `<div class="stat-card business-card"><div class="stat-title">${title}</div><div class="stat-items" role="list">${items}</div></div>`);
        }
        function insertIllustration(afterTitle){
            try {
                const container = document.getElementById('stats-business');
                if(!container) return;
                const target = Array.from(container.querySelectorAll('.stat-card')).find(c=> c.querySelector('.stat-title')?.textContent.trim()===afterTitle);
                const illu = document.createElement('div'); illu.className='stat-card stat-illustration-card business-card'; illu.setAttribute('aria-hidden','true'); illu.innerHTML='<img src="/static/image/svg/list/free-sticker-analysis.svg" alt="" loading="lazy">';
                if(target && target.nextSibling){ target.parentNode.insertBefore(illu, target.nextSibling); } else { container.appendChild(illu); }
            } catch(_e){}
        }
        function uniformHeights(){
            const cards = modal.querySelectorAll('#stats-business .business-card:not(.stat-illustration-card)');
            if(!cards.length) return;
            cards.forEach(c=> c.style.height='auto');
            let max=0; cards.forEach(c=>{ const h=c.getBoundingClientRect().height; if(h>max) max=h; });
            const hpx = Math.ceil(max)+'px';
            cards.forEach(c=> c.style.height=hpx);
        }
        function build(){
            const grid = document.getElementById('stats-business');
            if(grid) grid.innerHTML='';
            const users = state.rows.map(tr=>{
                const get = c => tr.querySelector(`td[data-col='${c}']`)?.textContent.trim() || '-';
                return {
                    role: get('role'),
                    status: get('locked').includes('잠금') ? '잠금' : '정상',
                    fails: parseInt(get('fail_cnt')||'0',10)||0
                };
            });
            if(!users.length){
                // 빈 데이터: 최소 카드(역할 / 계정 상태 / 실패 횟수)만 스켈레톤 표시
                const skeletons = [
                    {t:'역할',d:{'-':0}},
                    {t:'계정 상태',d:{'잠금':0,'정상':0}},
                    {t:'실패 횟수',d:{'0회':0,'1-3회':0,'4회 이상':0}}
                ];
                skeletons.forEach(sk=> renderCard(sk.t, sk.d, Object.keys(sk.d)));
                insertIllustration('역할');
                requestAnimationFrame(uniformHeights);
                return;
            }
            const roleDist = countBy(users, u=>u.role||'-');
            const statusDist = countBy(users, u=>u.status, ['잠금','정상']);
            const failBuckets = {'0회':0,'1-3회':0,'4회 이상':0};
            users.forEach(u=>{ if(u.fails===0) failBuckets['0회']++; else if(u.fails<=3) failBuckets['1-3회']++; else failBuckets['4회 이상']++; });
            // 카드 렌더 (위치/부서 제거 요청 반영)
            renderCard('역할', roleDist);
            renderCard('계정 상태', statusDist, ['잠금','정상']);
            renderCard('실패 횟수', failBuckets, ['0회','1-3회','4회 이상']);
            insertIllustration('역할');
            requestAnimationFrame(uniformHeights);
            window.addEventListener('resize', uniformHeights);
        }
        function open(){ build(); modal.classList.add('show'); modal.setAttribute('aria-hidden','false'); applyModalA11y(modal, '#system-stats-ok'); }
        function close(){ modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); window.removeEventListener('resize', uniformHeights); closeModal(modal); }
        statsBtn.addEventListener('click', ()=>{ if(!state.rows.length){ showMessage('알림','표시할 사용자가 없습니다.'); return; } open(); });
        closeBtn.addEventListener('click', close); okBtn.addEventListener('click', close);
        modal.addEventListener('click', e=>{ if(e.target===modal) close(); });
    }

    // -------------------- 일괄 변경 --------------------
    function initBulkModal(){
        const bulkBtn = document.getElementById('system-bulk-btn');
        const modal = document.getElementById('system-bulk-modal');
        const closeBtn = document.getElementById('system-bulk-close');
        const form = document.getElementById('system-bulk-form');
        const applyBtn = document.getElementById('system-bulk-apply');
        if(!bulkBtn || !modal || !closeBtn || !form || !applyBtn) return;
        function build(){
            // 필드 제거 버전 (이름/별명/내선전화/휴대전화/이메일 제외)
            console.log('[bulk-modal] build() 실행 - 최소 필드 버전 로드');
            form.innerHTML = `
                <div class="form-section">
                    <div class="section-header"><h4>프로필</h4></div>
                    <div class="profile-preview-wrapper">
                        <button type="button" id="bulk-profile-preview-btn" class="profile-preview-btn" aria-label="프로필 이미지 선택">
                            <img src="/static/image/svg/profil/free-icon-bussiness-man.svg" alt="현재 프로필" id="bulk-profile-preview-img" class="profile-preview-img" loading="lazy">
                        </button>
                        <p class="profile-preview-hint">이미지를 클릭하여 다른 프로필을 선택하세요.</p>
                    </div>
                    <input type="hidden" name="profile_image" id="bulk-profile-image-input" value="/static/image/svg/profil/free-icon-bussiness-man.svg">
                </div>
                <div class="form-section">
                    <div class="section-header"><h4>기본 정보 <small style=\"font-weight:400;\">(빈 값은 변경 안 함)</small></h4></div>
                    <div class="form-grid">
                        <div class="form-row"><label>회사</label><select class="form-input" name="company" id="bulk-company"><option value="">회사 선택</option></select></div>
                        <div class="form-row"><label>소속</label><select class="form-input" name="department" id="bulk-department"><option value="">소속 선택</option></select></div>
                        <div class="form-row"><label>재직</label><select class="form-input" name="employment_status">
                                <option value="">(변경 없음)</option>
                                <option value="재직">재직</option>
                                <option value="휴직">휴직</option>
                                <option value="퇴직">퇴직</option>
                            </select></div>
                        <div class="form-row"><label>역할</label><select class="form-input" name="role" aria-label="역할 변경">
                                <option value="">(변경 없음)</option>
                                <option value="USER">사용자</option>
                                <option value="TEAM_LEADER">팀장</option>
                                <option value="APPROVER">승인권자</option>
                                <option value="AUDITOR">감사자</option>
                                <option value="ADMIN">관리자</option>
                            </select></div>
                        <div class="form-row form-row-wide"><label>허용 IP</label><input class="form-input" type="text" name="allowed_ip" placeholder="허용 IP (쉼표 구분: 10.0.0.1,10.0.0.2)" maxlength="512"></div>
                        <div class="form-row form-row-wide"><label>업무</label><textarea class="form-input textarea-large" name="job" placeholder="업무" maxlength="1024" rows="6"></textarea></div>
                    </div>
                </div>`;
            const avatarBtn = form.querySelector('#bulk-profile-preview-btn');
            if(avatarBtn){ avatarBtn.addEventListener('click', ()=> openProfilePicker('bulk')); }
        }
        function open(){ build(); modal.classList.add('show'); modal.setAttribute('aria-hidden','false'); applyModalA11y(modal, '#system-bulk-apply'); }
        function hydrateMasterSelects(){
            bindCompanySelect(form.querySelector('select[name="company"]'));
            bindDepartmentSelect(form.querySelector('select[name="department"]'));
        }
        function close(){ modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); closeModal(modal); }
        function selectedRows(){ return Array.from(document.querySelectorAll('#system-table tbody tr')).filter(tr=>tr.querySelector('input.system-row-select:checked')); }
        bulkBtn.addEventListener('click', ()=>{
            const sel = selectedRows();
            const sub = document.getElementById('bulk-subtitle');
            // 선택 없음: 기본 자막 유지 + 메시지 모달 안내, 모달 자체는 열지 않음 (혼동 방지)
            if(!sel.length){
                if(sub) sub.textContent = '일괄변경할 행을 먼저 선택하세요.';
                console.debug('[bulk-modal] no selection, not opening modal');
                showMessage('알림','선택된 사용자가 없습니다. 행을 먼저 선택하세요.');
                return;
            }
            // 선택 있음: 동적 문구 설정 후 모달 오픈
            if(sub) sub.textContent = `선택된 ${sel.length}명의 사용자에서 지정한 필드를 일괄 변경합니다.`;
            console.debug('[bulk-modal] opening with selection count=', sel.length);
            open();
            hydrateMasterSelects();
            applyBtn.disabled = false;
        });
        closeBtn.addEventListener('click', close); modal.addEventListener('click', e=>{ if(e.target===modal) close(); });
        applyBtn.addEventListener('click', ()=>{
            const sel = selectedRows(); if(!sel.length){
                const sub = document.getElementById('bulk-subtitle');
                if(sub) sub.textContent = '일괄변경할 행을 먼저 선택하세요.';
                showMessage('알림','선택된 사용자가 없습니다.');
                applyBtn.disabled = true; return; }
            // 서버로 전송할 값 준비 (빈 값 제외)
            const payload = {};
            // Removed fields: 이름, 별명, 내선전화, 휴대전화, 이메일
            ['company','department','employment_status','role','allowed_ip','job','profile_image'].forEach(f=>{
                const v = form.querySelector(`[name=${f}]`)?.value.trim();
                if(v) payload[f] = v;
            });
            if(Object.keys(payload).length === 0){ showMessage('알림','변경할 값이 없습니다.'); return; }
            // 팀장/승인권자 일괄 변경 시 소속별 1명 제한 검증
            const bulkRole = (payload.role || '').toUpperCase();
            if(bulkRole === 'TEAM_LEADER' || bulkRole === 'APPROVER'){
                const bulkLabel = ROLE_LABEL_MAP[bulkRole];
                const bulkDept = payload.department || '';
                // 선택된 행들의 소속별 그룹 체크
                const deptMap = {};
                sel.forEach(tr => {
                    const dept = bulkDept || (tr.querySelector("td[data-col='department']")?.textContent || '').trim();
                    if(dept){ deptMap[dept] = (deptMap[dept] || 0) + 1; }
                });
                // 같은 소속에 2명 이상 선택 시
                for(const [dept, cnt] of Object.entries(deptMap)){
                    if(cnt > 1){ showMessage('알림', `${dept} 소속에 ${bulkLabel}을(를) ${cnt}명에게 일괄 배정할 수 없습니다.\n소속별 ${bulkLabel}은(는) 1명만 가능합니다.`); return; }
                }
                // 기존 테이블에서 해당 소속에 동일 역할이 이미 있는지 체크
                const selEmpNos = new Set(sel.map(tr => (tr.querySelector("td[data-col='emp_no']")?.textContent || '').trim()));
                for(const dept of Object.keys(deptMap)){
                    const err = checkUniqueRolePerDept(bulkRole, dept, null);
                    if(err){
                        // 기존 보유자가 선택 대상에 포함되면 OK (교체)
                        const rows = Array.from(document.querySelectorAll('#system-table tbody tr'));
                        const existing = rows.find(tr => {
                            const d = (tr.querySelector("td[data-col='department']")?.textContent || '').trim();
                            const r = (tr.querySelector("td[data-col='role']")?.textContent || '').trim();
                            const rc = ROLE_DISPLAY_TO_CODE[r] || r.toUpperCase();
                            return d === dept && rc === bulkRole;
                        });
                        const existingEmp = existing ? (existing.querySelector("td[data-col='emp_no']")?.textContent || '').trim() : '';
                        if(!existingEmp || !selEmpNos.has(existingEmp)){
                            showMessage('알림', err); return;
                        }
                    }
                }
            }
            payload.emp_nos = sel.map(tr=> tr.querySelector('td[data-col="emp_no"]')?.textContent.trim()).join(',');
            applyBtn.disabled = true;
            apiPost('/admin/auth/bulk_update', payload)
                .then(resp => {
                    if(resp.status === 'ok'){
                        // 로컬 행들 업데이트 (서버 적용된 필드 기반)
                        sel.forEach(tr=>{
                            Object.keys(payload).forEach(k=>{
                                if(k==='emp_nos') return;
                                if(k==='profile_image'){
                                    const img = tr.querySelector('td[data-col="profile"] img.profile-avatar');
                                    if(img){ img.src = payload[k]; }
                                } else if(k==='role'){
                                    const td = tr.querySelector('td[data-col="role"]');
                                    if(td){ const rv = payload[k]; td.textContent = rv==='ADMIN'?'관리자': rv==='USER'?'사용자': rv==='TEAM_LEADER'?'팀장': rv==='APPROVER'?'승인권자': rv==='AUDITOR'?'감사자': rv; }
                                } else {
                                    const td = tr.querySelector(`td[data-col='${k}']`); if(td && payload[k]) td.textContent = payload[k];
                                }
                            });
                            tr.classList.add('just-created'); setTimeout(()=>tr.classList.remove('just-created'),3000);
                        });
                        close();
                        showMessage('완료', `${resp.updated.length}개 사용자 일괄 변경 저장됨`);
                    } else if(resp.status === 'no_changes'){
                        showMessage('알림','서버가 변경할 값이 없다고 응답했습니다.');
                    } else {
                        showMessage('오류','일괄 변경 실패: '+(resp.message||'알 수 없는 오류'));
                    }
                })
                .catch(err => { console.error('[bulk_update] error', err); showMessage('오류','일괄 변경 실패: '+err.message); })
                .finally(()=>{ applyBtn.disabled = false; });
        });
    }

    // -------------------- 서명 이미지 업로드 헬퍼 --------------------
    function initSignatureUpload(prefix){
        // prefix: 'add' | 'edit'
        const fileInput = document.getElementById(prefix + '-signature-file');
        const imgEl = document.getElementById(prefix + '-signature-img');
        const placeholder = document.getElementById(prefix + '-signature-placeholder');
        const removeBtn = document.getElementById(prefix + '-signature-remove');
        const dataInput = document.getElementById(prefix + '-signature-data');
        const previewBox = document.getElementById(prefix + '-signature-preview');
        if(!fileInput || !imgEl || !dataInput) return;

        // wrapper 내부 actions/hint 참조
        const wrapper = previewBox?.closest('.signature-upload-wrapper');
        const actionsEl = wrapper?.querySelector('.signature-actions');
        const hintEl = wrapper?.querySelector('.signature-hint');

        function showImage(src){
            imgEl.src = src;
            imgEl.style.display = 'block';
            if(placeholder) placeholder.style.display = 'none';
            if(removeBtn) removeBtn.disabled = false;
            if(previewBox) previewBox.classList.add('has-image');
            dataInput.value = src;
            // 등록 후: 파일 선택 숨기고 제거만 표시
            if(actionsEl){
                const uploadLabel = actionsEl.querySelector('.signature-upload-btn');
                if(uploadLabel) uploadLabel.style.display = 'none';
                if(removeBtn) removeBtn.style.display = '';
            }
            if(hintEl) hintEl.style.display = 'none';
        }
        function clearImage(){
            imgEl.src = '';
            imgEl.style.display = 'none';
            if(placeholder) placeholder.style.display = '';
            if(removeBtn){ removeBtn.disabled = true; }
            if(previewBox) previewBox.classList.remove('has-image');
            dataInput.value = '';
            fileInput.value = '';
            // 제거 후: 파일 선택 복원
            if(actionsEl){
                const uploadLabel = actionsEl.querySelector('.signature-upload-btn');
                if(uploadLabel) uploadLabel.style.display = '';
            }
            if(hintEl) hintEl.style.display = '';
        }

        fileInput.addEventListener('change', function(){
            const file = this.files && this.files[0];
            if(!file) return;
            if(!file.type.startsWith('image/')){ return; }
            if(file.size > 2 * 1024 * 1024){ showMessage('알림','서명 이미지는 2MB 이하만 가능합니다.'); this.value=''; return; }
            const reader = new FileReader();
            reader.onload = function(e){ showImage(e.target.result); };
            reader.readAsDataURL(file);
        });

        if(removeBtn){ removeBtn.addEventListener('click', clearImage); }

        return { showImage, clearImage };
    }

    function enableAutoGrowTextarea(textarea){
        if(!textarea) return;
        const minHeight = textarea.getBoundingClientRect().height;
        function resize(){
            textarea.style.setProperty('height', 'auto', 'important');
            textarea.style.setProperty('height', Math.max(textarea.scrollHeight, minHeight) + 'px', 'important');
        }
        textarea.addEventListener('input', resize);
        textarea.addEventListener('change', resize);
        textarea.addEventListener('keyup', resize);
        resize();
    }

    // -------------------- 사용자 추가 모달 --------------------
    function initAddModal(){
        const addBtn = document.getElementById('system-add-btn');
        const modal = document.getElementById('user-add-modal');
        const closeBtn = document.getElementById('user-add-close');
        const form = document.getElementById('user-add-form');
        const saveBtn = document.getElementById('user-add-save');
        const jobTextarea = form ? form.querySelector('textarea[name="job"]') : null;
        if(!addBtn || !modal || !closeBtn || !form || !saveBtn) return;

        function open(){ modal.classList.add('show'); modal.setAttribute('aria-hidden','false'); validate(); if(jobTextarea){ jobTextarea.dispatchEvent(new Event('input', { bubbles:true })); } }
        function close(){ modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); if(jobTextarea){ jobTextarea.style.height=''; } }
        function validate(){
            const emp = form.emp_no.value.trim();
            const name = form.name.value.trim();
            const email = form.email.value.trim();
            // 역할 셀렉트가 비활성(옵션 없음) 상태이면 요구하지 않음
            const roleEl = form.querySelector('select[name="role"]');
            const roleVal = roleEl && roleEl.options.length ? roleEl.value.trim() : 'USER';
            saveBtn.disabled = !(emp && name && email); // role 강제조건 제거
        }
        function collect(){
            return {
                emp_no: form.emp_no.value.trim(),
                name: form.name.value.trim(),
                nickname: form.nickname.value.trim(),
                company: form.company?.value.trim(),
                department: form.department.value.trim(),
                employment_status: form.employment_status.value.trim() || '재직',
                ext_phone: form.ext_phone.value.trim(),
                mobile_phone: form.mobile_phone.value.trim(),
                email: form.email.value.trim(),
                role: (function(){
                    const roleEl = form.querySelector('select[name="role"]');
                    if(roleEl && roleEl.options.length){ return roleEl.value.trim() || 'USER'; }
                    return 'USER';
                })(),
                allowed_ip: form.allowed_ip.value.trim(),
                job: form.job.value.trim(),
                profile_image: form.profile_image.value.trim(),
                signature_image: (document.getElementById('add-signature-data')||{}).value || '',
                // audit defaults
                last_login_at: '-', password_changed_at: '-', password_expires_at: '-',
                locked: false, fail_cnt: 0, created_at: new Date().toISOString().slice(0,10), updated_at: new Date().toISOString().slice(0,10)
            };
        }
        function addUserServer(user){
            saveBtn.disabled = true;
            apiPost('/admin/auth/create', user)
                .then(resp => {
                    if(resp.status !== 'ok'){ showMessage('오류','생성 실패: '+(resp.message||resp.error||'알 수 없는 오류')); return; }
                    const tbody = document.getElementById(TBODY_ID); if(!tbody) return;
                    const html = buildRow(resp.user);
                    const temp = document.createElement('tbody'); temp.innerHTML = html; const tr = temp.firstElementChild;
                    tbody.prepend(tr);
                    state.rows = Array.from(document.querySelectorAll('#system-table tbody tr'));
                    applyFilter();
                    // 숨김 컬럼 재적용 (새 행은 기본적으로 모든 컬럼 표시 상태이므로 사용자 숨김 설정 반영 필요)
                    try { applyHidden(readHiddenSet()); } catch(_e){}
                    tr.classList.add('just-created'); setTimeout(()=> tr.classList.remove('just-created'), 4000);
                    showMessage('완료', `사용자가 추가되었습니다. 초기 비밀번호: ${resp.initial_password}`);
                })
                .catch(err => { console.error('[create] error', err); showMessage('오류','생성 실패: '+err.message); })
                .finally(()=>{ saveBtn.disabled = false; });
        }
        addBtn.addEventListener('click', open);
        closeBtn.addEventListener('click', close);
        modal.addEventListener('click', e=>{ if(e.target===modal) close(); });
        form.addEventListener('input', validate);
        form.addEventListener('submit', e=>{ e.preventDefault(); if(saveBtn.disabled) return; const user = collect(); const roleErr = checkUniqueRolePerDept(user.role, user.department); if(roleErr){ showMessage('알림', roleErr); return; } addUserServer(user); form.reset(); if(jobTextarea){ jobTextarea.dispatchEvent(new Event('input', { bubbles:true })); } const sigCtrl = document.getElementById('add-signature-img'); if(sigCtrl){ sigCtrl.src=''; sigCtrl.style.display='none'; } const sigPh = document.getElementById('add-signature-placeholder'); if(sigPh) sigPh.style.display=''; const sigData = document.getElementById('add-signature-data'); if(sigData) sigData.value=''; const sigRm = document.getElementById('add-signature-remove'); if(sigRm) sigRm.disabled=true; validate(); close(); });
        // Profile preview button launches picker
        const addPreviewBtn = document.getElementById('profile-preview-btn');
        if(addPreviewBtn){ addPreviewBtn.addEventListener('click', ()=> openProfilePicker('add')); }
        // 서명 이미지 업로드 초기화
        initSignatureUpload('add');
        enableAutoGrowTextarea(jobTextarea);
        // 역할 옵션 자동 주입 (없을 경우)
        const roleSelect = form.querySelector('select[name="role"]');
        if(roleSelect && roleSelect.options.length === 0){
            [['','(선택)'],['USER','사용자'],['TEAM_LEADER','팀장'],['APPROVER','승인권자'],['AUDITOR','감사자'],['ADMIN','관리자']].forEach(([v,label])=>{
                const opt = document.createElement('option'); opt.value=v; opt.textContent=label; roleSelect.appendChild(opt);
            });
        }
        // 검색 가능 드롭다운 적용 (역할, 재직)
        blsSearchableSelect(form.querySelector('select[name="role"]'));
        blsSearchableSelect(form.querySelector('select[name="employment_status"]'));
        bindCompanySelect(form.querySelector('select[name="company"]'));
        bindDepartmentSelect(form.querySelector('select[name="department"]'));

        // 모달 오픈 시 최신 부서 목록 갱신
        addBtn.addEventListener('click', ()=>{
            bindCompanySelect(form.querySelector('select[name="company"]'));
            bindDepartmentSelect(form.querySelector('select[name="department"]'));
        });
    }

    // -------------------- 프로필 선택 공용 모달 --------------------
    let profilePickerInitialized = false;
    let currentProfileContext = null; // 'add' | 'bulk' | 'edit'
    const PROFILE_FALLBACK = ['/static/image/svg/profil/free-icon-bussiness-man.svg'];

    function fetchProfileImages(){
        const ts = Date.now();
        const candidatePaths = [
            '/admin/auth/profile_images', // expected
            '/profile_images',            // alt root
            '/auth/profile_images',       // alt prefix
        ];
        let tried = [];
        function attempt(idx){
            if(idx >= candidatePaths.length){
                console.warn('[profile-picker] 모든 경로 시도 실패:', tried);
                return Promise.resolve(PROFILE_FALLBACK);
            }
            const path = candidatePaths[idx] + '?ts=' + ts;
            tried.push(path);
            return fetch(path, {cache:'no-store'})
                .then(r => {
                    if(!r.ok){
                        console.warn('[profile-picker] 경로 실패', path, 'status', r.status);
                        throw new Error('HTTP '+r.status);
                    }
                    return r.json();
                })
                .then(data => {
                    const arr = Array.isArray(data.images) ? data.images : [];
                    console.log('[profile-picker] 사용 경로:', path, '이미지 수:', arr.length);
                    return arr.length ? arr : PROFILE_FALLBACK;
                })
                .catch(()=> attempt(idx+1));
        }
        return attempt(0);
    }

    function buildProfileGrid(images){
        const grid = document.getElementById('profile-picker-grid');
        const okBtn = document.getElementById('profile-picker-ok');
        if(!grid || !okBtn) return;
        if(!Array.isArray(images) || !images.length){
            grid.innerHTML = '<div class="profile-picker-empty">이미지 목록을 불러오지 못했습니다. 서버 재시작 후 다시 시도하세요.</div>';
            okBtn.disabled = true;
            return;
        }
        grid.innerHTML = images.map(src=>{
            const base = src.split('/').pop().replace(/\.[^.]+$/,'');
            const label = base.replace(/[-_]+/g,' ').replace(/\b\d+\b/g,'').trim() || '프로필';
            return `<button type="button" class="profile-pick-btn" data-src="${src}" aria-label="${label} 선택"><img src="${src}" alt="${label}" loading="lazy"></button>`;
        }).join('');
        okBtn.disabled = true;
        grid.addEventListener('click', e=>{
            const btn = e.target.closest('.profile-pick-btn'); if(!btn) return;
            grid.querySelectorAll('.profile-pick-btn.selected').forEach(b=> b.classList.remove('selected'));
            btn.classList.add('selected');
            okBtn.disabled = false;
        });
    }

    function openProfilePicker(ctx){
        currentProfileContext = ctx;
        const modal = document.getElementById('profile-picker-modal');
        if(!modal) return;
        modal.classList.add('show'); modal.setAttribute('aria-hidden','false');
        // 항상 최신 목록을 직접 가져오되, 실패 시 클라이언트 탐색(probing) 사용
        fetchProfileImages()
            .then(images => {
                if(images && images.length && images !== PROFILE_FALLBACK){
                    buildProfileGrid(images);
                } else {
                    // 서버 엔드포인트 실패 또는 fallback 한 개만 — 클라이언트에서 직접 존재하는 파일을 탐색
                    probeProfileImages().then(found => {
                        buildProfileGrid(found.length ? found : images);
                    });
                }
                profilePickerInitialized = true;
            });
    }
    function closeProfilePicker(){
        const modal = document.getElementById('profile-picker-modal');
        if(!modal) return; modal.classList.remove('show'); modal.setAttribute('aria-hidden','true');
    }
    function initProfilePicker(){
        const modal = document.getElementById('profile-picker-modal');
        const closeBtn = document.getElementById('profile-picker-close');
        const okBtn = document.getElementById('profile-picker-ok');
        if(!modal || !closeBtn || !okBtn) return;
        okBtn.addEventListener('click', ()=>{
            const grid = document.getElementById('profile-picker-grid');
            const sel = grid?.querySelector('.profile-pick-btn.selected');
            if(sel){
                const src = sel.getAttribute('data-src');
                if(currentProfileContext === 'add'){
                    const img = document.getElementById('profile-preview-img');
                    const input = document.getElementById('profile-image-input');
                    if(img) img.src = src; if(input) input.value = src;
                    // 현재 추가하는 사용자가 현재 로그인 사용자일 가능성은 낮음. 동기화는 생략.
                } else if(currentProfileContext === 'bulk'){
                    const img = document.getElementById('bulk-profile-preview-img');
                    const input = document.getElementById('bulk-profile-image-input');
                    if(img) img.src = src; if(input) input.value = src;
                } else if(currentProfileContext === 'edit'){
                    const img = document.getElementById('edit-profile-preview-img');
                    const input = document.getElementById('edit-profile-image-input');
                    if(img) img.src = src; if(input) input.value = src;
                    // 현재 사용자 사번이 없거나 불일치해도 일단 동기화 시도 (fallback)
                    try {
                        let currentEmp = localStorage.getItem('blossom.currentEmpNo');
                        const editingEmp = document.getElementById('edit-emp-no')?.value.trim();
                        if(!currentEmp && editingEmp){
                            localStorage.setItem('blossom.currentEmpNo', editingEmp);
                            currentEmp = editingEmp;
                        }
                        window.dispatchEvent(new CustomEvent('blossom:avatarChanged',{ detail:{ src, empNo: currentEmp || editingEmp || '' }}));
                    } catch {}
                }
            }
            closeProfilePicker();
        });
        closeBtn.addEventListener('click', closeProfilePicker);
        modal.addEventListener('click', e=>{ if(e.target===modal) closeProfilePicker(); });
    }

    // ---------- 클라이언트 측 이미지 존재 탐색 (백엔드 리스트 실패시) ----------
    function probeProfileImages(){
        // 알려진 파일 패턴 목록 (추후 확장 가능: 001-020, free-icon-bussiness-man)
        const base = '/static/image/svg/profil/';
        const names = [
            '001-boy.svg','002-girl.svg','003-boy.svg','004-girl.svg','005-man.svg','006-girl.svg','007-boy.svg','008-girl.svg','009-boy.svg','010-girl.svg',
            '011-man.svg','012-girl.svg','013-man.svg','014-girl.svg','015-boy.svg','016-girl.svg','017-boy.svg','018-girl.svg','019-boy.svg','020-girl.svg',
            'free-icon-bussiness-man.svg'
        ];
        const timeoutMs = 4000;
        function loadOne(src){
            return new Promise(resolve => {
                const img = new Image();
                let done = false;
                const timer = setTimeout(()=>{ if(!done){ done=true; resolve(null); } }, timeoutMs);
                img.onload = ()=>{ if(!done){ done=true; clearTimeout(timer); resolve(src); } };
                img.onerror = ()=>{ if(!done){ done=true; clearTimeout(timer); resolve(null); } };
                img.src = src + '?v=' + Date.now(); // cache busting
            });
        }
        return Promise.all(names.map(n=> loadOne(base + n)))
            .then(results => results.filter(Boolean));
    }

    // -------------------- 삭제 처리 (표시만) --------------------
    function initDeleteProcessing(){
        const triggerBtn = document.getElementById('system-delete-btn');
        const modal = document.getElementById('system-delete-modal');
        const closeBtn = document.getElementById('system-delete-close');
        const cancelBtn = document.getElementById('system-delete-cancel');
        const confirmBtn = document.getElementById('system-delete-confirm');
        const subtitle = document.getElementById('delete-subtitle');
        if(!triggerBtn || !modal || !closeBtn || !confirmBtn || !subtitle) return;

        function selectedRows(){
            return Array.from(document.querySelectorAll('#system-table tbody tr')).filter(tr=> tr.querySelector('input.system-row-select:checked'));
        }
        function open(){
            const rows = selectedRows();
            const count = rows.length;
            subtitle.textContent = `선택된 ${count}명의 사용자를 정말 삭제처리하시겠습니까?`;
            // Parity: confirm disabled when 0, enabled otherwise
            confirmBtn.disabled = count === 0;
            try {
                const illuImg = modal.querySelector('.dispose-illust img');
                if(illuImg){
                    illuImg.src = '/static/image/svg/list/free-sticker-process.svg';
                    illuImg.alt = '삭제 확인 이미지';
                }
            } catch(_e){ /* ignore swap errors */ }
            modal.classList.add('show');
            modal.setAttribute('aria-hidden','false');
            applyModalA11y(modal, '#system-delete-confirm');
        }
        function close(){
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden','true');
            closeModal(modal);
        }
        function proceed(){
            const rows = selectedRows();
            if(!rows.length){ close(); return; }
            const emp_nos = rows.map(r=> r.querySelector('td[data-col="emp_no"]')?.textContent.trim()).join(',');
            confirmBtn.disabled = true;
            apiPost('/admin/auth/delete', { emp_nos })
                .then(resp => {
                    if(resp.status === 'ok'){
                        rows.forEach(r=> r.remove());
                        state.rows = Array.from(document.querySelectorAll('#system-table tbody tr'));
                        applyFilter();
                        showMessage('완료', `${resp.count}개 사용자 삭제되었습니다.`);
                    } else {
                        showMessage('오류','삭제 실패: '+(resp.message||resp.error||'알 수 없는 오류'));
                    }
                })
                .catch(err => {
                    console.error('[delete] error', err);
                    if(/HTTP 404/.test(err.message)){
                        showMessage('오류','삭제 API(/admin/auth/delete)가 404입니다. 서버 재시작 또는 배포 반영이 필요합니다.');
                    } else {
                        showMessage('오류','삭제 실패: '+err.message);
                    }
                })
                .finally(()=>{ confirmBtn.disabled = false; close(); });
        }
        // 사용자가 요구: "선택될때만 나타나는 모달" -> 선택 없으면 모달 자체를 열지 않음
        triggerBtn.addEventListener('click', ()=>{
            const rows = selectedRows();
            if(!rows.length){
                // 안내만, 모달 열지 않음
                showMessage('알림','선택된 사용자가 없습니다. 먼저 행을 선택하세요.');
                return;
            }
            open();
        });
        closeBtn.addEventListener('click', close);
        if(cancelBtn) cancelBtn.addEventListener('click', close);
        modal.addEventListener('click', e=>{ if(e.target===modal) close(); });
        confirmBtn.addEventListener('click', proceed);
        // Dynamic update while modal is open (selection changes)
        const tbody = document.getElementById(TBODY_ID);
        if(tbody){
            tbody.addEventListener('change', ()=>{
                if(!modal.classList.contains('show')) return;
                const rows = selectedRows();
                const count = rows.length;
                subtitle.textContent = `선택된 ${count}명의 사용자를 정말 삭제처리하시겠습니까?`;
                confirmBtn.disabled = count === 0;
                // Dynamic illustration update while modal open
                const illuImg = modal.querySelector('.dispose-illust img');
                if(illuImg){
                    if(count === 0){
                        illuImg.src = '/static/image/svg/list/free-sticker-process.svg';
                        illuImg.alt = '선택 없음 안내 이미지';
                    } else {
                        illuImg.src = '/static/image/svg/list/free-sticker-option.svg';
                        illuImg.alt = '삭제 확인 이미지';
                    }
                }
            });
        }
    }

    // -------------------- 메시지 모달 --------------------
    function showMessage(title, msg){
        const modalMsg = document.getElementById('system-message-modal'); if(!modalMsg) return;
        modalMsg.querySelector('#message-title').textContent = title;
        modalMsg.querySelector('#message-content').textContent = msg;
        modalMsg.classList.add('show'); modalMsg.setAttribute('aria-hidden','false');
        const okBtn = document.getElementById('system-message-ok');
        const closeBtn = document.getElementById('system-message-close');
        const closeFn = () => { modalMsg.classList.remove('show'); modalMsg.setAttribute('aria-hidden','true'); };
        okBtn?.addEventListener('click', closeFn, { once:true });
        closeBtn?.addEventListener('click', closeFn, { once:true });
        modalMsg.addEventListener('click', e=>{ if(e.target===modalMsg) closeFn(); });
    }

    // -------------------- 초기화 --------------------
    // -------------------- 사용자 수정 모달 --------------------
    function initEditModal(){
        const modal = document.getElementById('user-edit-modal');
        if(!modal) return;
        const closeBtn = document.getElementById('user-edit-close');
        const saveBtn = document.getElementById('user-edit-save');
        const form = document.getElementById('user-edit-form');
        const jobTextarea = form ? form.querySelector('textarea[name="job"]') : null;
        const tbody = document.getElementById('system-table-body');
        const profileBtn = document.getElementById('edit-profile-preview-btn');
        const profileImg = document.getElementById('edit-profile-preview-img');
        const profileInput = document.getElementById('edit-profile-image-input');
        // 서명 업로드 컨트롤러 (아래에서 초기화)
        let editSigCtrl = null;

        function open(){ modal.classList.add('show'); modal.setAttribute('aria-hidden','false'); }
        function close(){
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden','true');
            form.reset();
            saveBtn.disabled = true;
            profileImg.src='/static/image/svg/profil/free-icon-bussiness-man.svg';
            // 서명 이미지 초기화 (editSigCtrl이 있으면 사용, 없으면 수동)
            if(editSigCtrl){
                editSigCtrl.clearImage();
            } else {
                const editSigImg = document.getElementById('edit-signature-img');
                if(editSigImg){ editSigImg.src=''; editSigImg.style.display='none'; }
                const editSigPh = document.getElementById('edit-signature-placeholder');
                if(editSigPh) editSigPh.style.display='';
                const editSigData = document.getElementById('edit-signature-data');
                if(editSigData) editSigData.value='';
                const editSigRm = document.getElementById('edit-signature-remove');
                if(editSigRm) editSigRm.disabled=true;
            }
            // ADMIN 역할 잠금 표시 제거 (모달 닫힐 때 초기화)
            const roleSel = form.querySelector('select[name="role"]');
            if(roleSel){
                roleSel.disabled = false;
                roleSel.classList.remove('locked-role');
                const lockEl = form.querySelector('.role-lock-indicator');
                if(lockEl) lockEl.remove();
                roleSel.dispatchEvent(new Event('change',{bubbles:true}));
            }
            // 재직 셀렉트 동기화
            const esSel = form.querySelector('select[name="employment_status"]');
            if(esSel) esSel.dispatchEvent(new Event('change',{bubbles:true}));
            if(jobTextarea){ jobTextarea.style.height=''; }
        }
        closeBtn?.addEventListener('click', close);
        modal.addEventListener('click', e=>{ if(e.target===modal) close(); });

        form?.addEventListener('input', ()=>{
            // 역할 셀렉트가 비어 있으면 제외
            const roleEl = form.querySelector('select[name="role"]');
            const requiredFilled = form.emp_no.value.trim() && form.name.value.trim() && form.email.value.trim();
            saveBtn.disabled = !requiredFilled;
        });

        if(profileBtn){
            profileBtn.addEventListener('click', ()=>{
                openProfilePicker('edit');
            });
        }
        // 서명 이미지 업로드 초기화
        editSigCtrl = initSignatureUpload('edit');
        enableAutoGrowTextarea(jobTextarea);
        // 검색 가능 드롭다운 적용 (역할, 재직)
        blsSearchableSelect(form.querySelector('select[name="role"]'));
        blsSearchableSelect(form.querySelector('select[name="employment_status"]'));
        bindCompanySelect(form.querySelector('select[name="company"]'));
        bindDepartmentSelect(form.querySelector('select[name="department"]'));

        tbody?.addEventListener('click', e=>{
            const btn = e.target.closest('button[data-action="edit"]');
            if(!btn) return;
            const tr = btn.closest('tr'); if(!tr) return;
            function get(col){ return tr.querySelector(`td[data-col='${col}']`)?.textContent.trim() || ''; }
            document.getElementById('edit-user-id').value = tr.getAttribute('data-id')||'';
            form.emp_no.value = get('emp_no');
            form.name.value = get('name');
            form.nickname.value = get('nickname');
            bindCompanySelect(form.querySelector('select[name="company"]'), get('company') === '-' ? '' : get('company'));
            bindDepartmentSelect(form.querySelector('select[name="department"]'), get('department'));
            { const es = get('employment_status'); const esSel = form.employment_status; if(esSel){ for(let i=0;i<esSel.options.length;i++){ if(esSel.options[i].value===es){esSel.selectedIndex=i;break;} } esSel.dispatchEvent(new Event('change',{bubbles:true})); } }
            form.ext_phone.value = get('ext_phone');
            form.mobile_phone.value = get('mobile_phone');
            form.email.value = get('email');
            // 역할 셀렉트가 비어있으면 기본 옵션 생성
            const roleSel = form.querySelector('select[name="role"]');
            if(roleSel && roleSel.options.length === 0){
                [['USER','사용자'],['TEAM_LEADER','팀장'],['APPROVER','승인권자'],['AUDITOR','감사자'],['ADMIN','관리자']].forEach(([v,label])=>{
                    const opt = document.createElement('option'); opt.value=v; opt.textContent=label; roleSel.appendChild(opt);
                });
            }
            if(roleSel){
                const rawRole = (get('role')||'USER');
                const normalized = rawRole.toUpperCase().includes('관리자')? 'ADMIN': (rawRole.toUpperCase().includes('감사')? 'AUDITOR': (rawRole.toUpperCase().includes('승인')? 'APPROVER': (rawRole.toUpperCase().includes('팀장')? 'TEAM_LEADER':'USER')));
                roleSel.value = normalized;
                roleSel.dispatchEvent(new Event('change',{bubbles:true}));
            }
            // ADMIN이면 역할 셀렉트 잠금 + 잠금 아이콘 삽입
            if(roleSel){
                // 기존 잠금 표시 제거 (재오픈 안전)
                const prevLock = form.querySelector('.role-lock-indicator');
                if(prevLock) prevLock.remove();
                roleSel.classList.remove('locked-role');
                roleSel.disabled = false;
                if(roleSel.value === 'ADMIN'){
                    roleSel.disabled = true;
                    roleSel.classList.add('locked-role');
                    const wrapper = roleSel.closest('.form-row');
                    if(wrapper){ wrapper.style.position='relative'; }
                    const span = document.createElement('span');
                    span.className = 'role-lock-indicator';
                    span.title = 'ADMIN 역할은 변경할 수 없습니다.';
                    span.innerHTML = '<svg class="lock-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 10V8a5 5 0 0 1 10 0v2" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="5" y="10" width="14" height="11" rx="2" ry="2" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="15.5" r="1.8" fill="#64748b"/></svg>';
                    // 검색 드롭다운 래퍼 밖에 삽입
                    const ssCtrl = roleSel.closest('.bls-ss-ctrl');
                    if(ssCtrl) ssCtrl.insertAdjacentElement('afterend', span);
                    else roleSel.insertAdjacentElement('afterend', span);
                }
            }
            form.allowed_ip.value = get('allowed_ip');
            form.job.value = get('job');
            if(jobTextarea){ jobTextarea.dispatchEvent(new Event('input', { bubbles:true })); }
            const imgEl = tr.querySelector('td[data-col="profile"] img');
            const src = imgEl? imgEl.getAttribute('src'): '/static/image/svg/profil/free-icon-bussiness-man.svg';
            profileImg.src = src; profileInput.value = src;
            // 서명 이미지 복원 (signatureMap에서 조회)
            const empNo = get('emp_no');
            const sigData = signatureMap[empNo] || '';
            if(editSigCtrl && sigData){
                editSigCtrl.showImage(sigData);
            } else if(editSigCtrl){
                editSigCtrl.clearImage();
            } else {
                // fallback (editSigCtrl 없을 때)
                const eSigImg = document.getElementById('edit-signature-img');
                const eSigPh = document.getElementById('edit-signature-placeholder');
                const eSigDataInput = document.getElementById('edit-signature-data');
                const eSigRm = document.getElementById('edit-signature-remove');
                if(sigData && eSigImg){
                    eSigImg.src = sigData; eSigImg.style.display = 'block';
                    if(eSigPh) eSigPh.style.display = 'none';
                    if(eSigDataInput) eSigDataInput.value = sigData;
                    if(eSigRm) eSigRm.disabled = false;
                } else {
                    if(eSigImg){ eSigImg.src=''; eSigImg.style.display='none'; }
                    if(eSigPh) eSigPh.style.display='';
                    if(eSigDataInput) eSigDataInput.value='';
                    if(eSigRm) eSigRm.disabled=true;
                }
            }
            // 저장 버튼 즉시 활성화 (변경 없더라도 재저장 허용)
            const requiredFilled = form.emp_no.value.trim() && form.name.value.trim() && form.email.value.trim();
            saveBtn.disabled = !requiredFilled;
            open();
        });

        saveBtn?.addEventListener('click', e=>{
            e.preventDefault();
            const emp_no = form.emp_no.value.trim();
            if(!emp_no){ showMessage('알림','사번이 비어 있습니다.'); return; }
            // 팀장/승인권자 소속별 1명 제한 검증
            const editRoleVal = form.role.value.trim();
            const editDeptVal = form.department.value.trim();
            const roleErr = checkUniqueRolePerDept(editRoleVal, editDeptVal, emp_no);
            if(roleErr){ showMessage('알림', roleErr); return; }
            saveBtn.disabled = true;
            const payload = {
                emp_no,
                name: form.name.value.trim(),
                nickname: form.nickname.value.trim(),
                company: form.company.value.trim(),
                department: form.department.value.trim(),
                employment_status: form.employment_status.value.trim() || '재직',
                ext_phone: form.ext_phone.value.trim(),
                mobile_phone: form.mobile_phone.value.trim(),
                email: form.email.value.trim(),
                role: form.role.value.trim(),
                allowed_ip: form.allowed_ip.value.trim(),
                job: form.job.value.trim(),
                profile_image: profileInput.value.trim(),
                signature_image: (document.getElementById('edit-signature-data')||{}).value || ''
            };
            apiPost('/admin/auth/update', payload)
                .then(resp => {
                    if(resp.status === 'ok'){
                        // 변경 내용 신선하게 반영: 전체 목록 재조회 (캐시/병합 문제 회피)
                        fetchUsers(emp_no);
                        showMessage('완료','사용자 정보가 저장되었습니다.');
                        // 저장 후 아바타 무조건 재동기화 (현재 사용자 사번이 비어있으면 채움)
                        try {
                            let currentEmp = localStorage.getItem('blossom.currentEmpNo');
                            if(!currentEmp){
                                localStorage.setItem('blossom.currentEmpNo', emp_no);
                                currentEmp = emp_no;
                            }
                            if(payload.profile_image){
                                window.dispatchEvent(new CustomEvent('blossom:avatarChanged',{ detail:{ src: payload.profile_image, empNo: currentEmp }}));
                            }
                        } catch {}
                        close();
                    } else {
                        showMessage('오류','수정 실패: '+(resp.message||resp.error||'알 수 없는 오류'));
                    }
                })
                .catch(err => { console.error('[update] error', err); showMessage('오류','수정 실패: '+err.message); })
                .finally(()=>{ saveBtn.disabled = false; });
        });
    }

    function init(){
        if(!initState()) return;
        bindEvents();
        initRowSelection();
        initColumnModal();
        initColFilters();
        initBulkModal();
        initStatsModal();
        initDeleteProcessing();
        initAddModal();
        initProfilePicker();
        initEditModal();
        fetchUsers();
    }

    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
