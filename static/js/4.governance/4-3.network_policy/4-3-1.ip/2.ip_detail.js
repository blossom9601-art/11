(function(){
  'use strict';

  /*
    Searchable <select> enhancer
    - Previously loaded via /static/js/ui/searchable_select.js
    - Included here so IP policy pages can run with only:
      - blossom.js
      - 2.ip_detail.js
  */

  (function ensureSearchableSelectEnhancer(){
    if (window.BlossomSearchableSelect) return;

    const searchableSelectMeta = new WeakMap();
    let activeSearchPanel = null;

    function isSearchableSelect(select) {
      if (!(select instanceof HTMLSelectElement)) return false;
      if (!select.classList.contains('search-select')) return false;
      const explicit = (select.dataset && Object.prototype.hasOwnProperty.call(select.dataset, 'searchable'))
        ? select.dataset.searchable
        : select.getAttribute('data-searchable');
      if (explicit === 'false') return false;
      return true;
    }

    function allowOutsideModal(select) {
      if (!(select instanceof HTMLSelectElement)) return false;
      const scope = (select.dataset && (select.dataset.searchableScope || select.dataset.searchScope)) || select.getAttribute('data-searchable-scope') || '';
      if (String(scope).toLowerCase() === 'page') return true;
      const explicit = (select.dataset && (select.dataset.enhanceOutsideModal || select.dataset.outsideModal)) || select.getAttribute('data-enhance-outside-modal') || '';
      return String(explicit).toLowerCase() === '1' || String(explicit).toLowerCase() === 'true';
    }

    function getSearchablePlaceholder(select) {
      return (
        select.getAttribute('data-placeholder') ||
        (select.dataset ? select.dataset.placeholder : '') ||
        '선택'
      );
    }

    function setupSearchableSelect(select) {
      if (!isSearchableSelect(select) || select.dataset.searchEnhanced === '1') return;

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

      clearBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeSearchDropdown(select);
        select.value = '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        syncSearchableSelect(select);
      });

      displayBtn.addEventListener('click', (event) => {
        event.preventDefault();
        if (select.disabled) return;
        openSearchDropdown(select);
      });

      const parent = select.parentNode;
      if (parent) parent.insertBefore(wrapper, select);

      wrapper.appendChild(displayBtn);
      wrapper.appendChild(clearBtn);
      wrapper.appendChild(select);

      select.classList.add('fk-search-native-hidden');
      select.dataset.searchEnhanced = '1';
      select.addEventListener('change', () => syncSearchableSelect(select));

      searchableSelectMeta.set(select, { wrapper, displayBtn, clearBtn });
    }

    function syncSearchableSelect(select) {
      if (!isSearchableSelect(select)) return;

      let meta = searchableSelectMeta.get(select);
      if (!meta) {
        setupSearchableSelect(select);
        meta = searchableSelectMeta.get(select);
        if (!meta) return;
      }

      const placeholder = getSearchablePlaceholder(select);
      const selectedOption = select.selectedOptions && select.selectedOptions[0];
      const optionLabel = (selectedOption && selectedOption.textContent ? selectedOption.textContent : '').trim();
      const value = select.value || '';
      const label = (optionLabel || value || placeholder).trim();

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
      if (disabled) closeSearchDropdown(select);
    }

    function buildSearchPanelOptions(select, placeholder) {
      const options = [];
      Array.from(select.options || []).forEach((opt) => {
        const rawLabel = (opt.textContent || '').trim();
        const value = opt.value || '';
        const label = (rawLabel || value || placeholder).trim();
        options.push({
          value,
          label,
          searchLabel: label.toLowerCase(),
          valueLower: value.toLowerCase(),
        });
      });
      return options;
    }

    function positionSearchPanel(state) {
      const rect = state.anchor.getBoundingClientRect();
      const panel = state.panel;

      const margin = 6;
      const preferredLeft = Math.max(margin, Math.min(rect.left, window.innerWidth - margin));
      const preferredWidth = Math.max(220, rect.width);

      panel.style.left = preferredLeft + 'px';
      panel.style.minWidth = preferredWidth + 'px';
      panel.style.maxWidth = Math.max(preferredWidth, 260) + 'px';

      const panelRect = panel.getBoundingClientRect();
      let top = rect.bottom + margin;

      if (top + panelRect.height > window.innerHeight - margin) {
        const aboveTop = rect.top - margin - panelRect.height;
        if (aboveTop >= margin) top = aboveTop;
      }

      const maxLeft = window.innerWidth - margin - panelRect.width;
      const left = Math.max(margin, Math.min(preferredLeft, maxLeft));

      panel.style.top = Math.round(top) + 'px';
      panel.style.left = Math.round(left) + 'px';
    }

    function renderSearchPanelOptions(state) {
      state.list.innerHTML = '';
      state.itemButtons = [];
      const currentValue = state.select.value || '';

      if (!state.filtered.length) {
        state.empty.hidden = false;
        state.focusIndex = -1;
        return;
      }

      state.empty.hidden = true;

      state.filtered.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fk-search-panel__item fk-search-panel__option';
        btn.setAttribute('role', 'option');
        btn.dataset.index = String(idx);
        btn.dataset.value = opt.value;
        btn.textContent = opt.label;

        const selected = opt.value === currentValue;
        btn.setAttribute('aria-selected', selected ? 'true' : 'false');
        if (selected) btn.classList.add('selected', 'is-selected');

        btn.addEventListener('click', (event) => {
          event.preventDefault();
          selectSearchOption(state, idx);
        });

        state.list.appendChild(btn);
        state.itemButtons.push(btn);
      });
    }

    function setFocusIndex(state, nextIndex) {
      const max = state.filtered.length - 1;
      if (max < 0) {
        state.focusIndex = -1;
        return;
      }
      const clamped = Math.max(0, Math.min(nextIndex, max));
      state.focusIndex = clamped;
      state.itemButtons.forEach((btn, idx) => {
        const isActive = idx === clamped;
        btn.classList.toggle('active', isActive);
        btn.classList.toggle('is-active', isActive);
      });
      const activeBtn = state.itemButtons[clamped];
      if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest' });
    }

    function filterSearchPanelOptions(state) {
      const q = (state.input.value || '').trim().toLowerCase();
      if (!q) state.filtered = state.options.slice();
      else state.filtered = state.options.filter((opt) => opt.searchLabel.includes(q) || opt.valueLower.includes(q));
      state.focusIndex = -1;
      renderSearchPanelOptions(state);
    }

    function selectSearchOption(state, idx) {
      const opt = state.filtered[idx];
      if (!opt) return;
      state.select.value = opt.value;
      state.select.dispatchEvent(new Event('change', { bubbles: true }));
      syncSearchableSelect(state.select);
      closeSearchDropdown(state.select);
    }

    function handleSearchInputKeydown(event, state) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (state.filtered.length) setFocusIndex(state, state.focusIndex < 0 ? 0 : state.focusIndex + 1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (state.filtered.length) setFocusIndex(state, state.focusIndex < 0 ? state.filtered.length - 1 : state.focusIndex - 1);
        return;
      }
      if (event.key === 'Enter') {
        if (state.focusIndex >= 0 && state.focusIndex < state.filtered.length) {
          event.preventDefault();
          selectSearchOption(state, state.focusIndex);
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSearchDropdown(state.select);
      }
    }

    function createSearchPanel(select) {
      const meta = searchableSelectMeta.get(select);
      if (!meta) return null;

      const panel = document.createElement('div');
      panel.className = 'fk-search-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'false');

      const header = document.createElement('div');
      header.className = 'fk-search-panel__header';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'fk-search-panel__input';
      input.placeholder = '검색';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'fk-search-panel__close';
      closeBtn.setAttribute('aria-label', '닫기');
      closeBtn.textContent = '닫기';

      header.appendChild(input);
      header.appendChild(closeBtn);

      const list = document.createElement('div');
      list.className = 'fk-search-panel__list';
      list.setAttribute('role', 'listbox');

      const empty = document.createElement('div');
      empty.className = 'fk-search-panel__empty';
      empty.textContent = '검색 결과가 없습니다.';
      empty.hidden = true;

      panel.appendChild(header);
      panel.appendChild(list);
      panel.appendChild(empty);

      const placeholder = getSearchablePlaceholder(select);
      const options = buildSearchPanelOptions(select, placeholder);
      const state = {
        select,
        anchor: meta.displayBtn,
        panel,
        input,
        list,
        empty,
        options,
        filtered: options.slice(),
        focusIndex: -1,
        itemButtons: [],
      };

      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeSearchDropdown(select);
      });

      input.addEventListener('input', () => filterSearchPanelOptions(state));
      input.addEventListener('keydown', (evt) => handleSearchInputKeydown(evt, state));

      renderSearchPanelOptions(state);
      return state;
    }

    function closeActivePanel() {
      if (!activeSearchPanel) return;
      const state = activeSearchPanel;
      activeSearchPanel = null;
      try {
        state.anchor.setAttribute('aria-expanded', 'false');
      } catch (_e) {}
      if (state.panel && state.panel.parentNode) state.panel.parentNode.removeChild(state.panel);
    }

    function openSearchDropdown(select) {
      if (!isSearchableSelect(select)) return;
      if (!allowOutsideModal(select)) {
        // The default enhancer behavior is modal-scoped;
        // if not allowed, simply fallback to native select.
        select.focus();
        return;
      }

      closeActivePanel();
      syncSearchableSelect(select);
      const meta = searchableSelectMeta.get(select);
      if (!meta) return;

      const state = createSearchPanel(select);
      if (!state) return;
      activeSearchPanel = state;
      document.body.appendChild(state.panel);
      meta.displayBtn.setAttribute('aria-expanded', 'true');
      positionSearchPanel(state);
      requestAnimationFrame(() => {
        try { state.input.focus(); } catch (_e) {}
      });

      const onDocClick = (evt) => {
        if (!activeSearchPanel) return;
        const t = evt.target;
        if (!t) return;
        if (state.panel.contains(t)) return;
        if (meta.wrapper.contains(t)) return;
        closeActivePanel();
        document.removeEventListener('mousedown', onDocClick, true);
      };
      document.addEventListener('mousedown', onDocClick, true);

      const onResize = () => {
        if (!activeSearchPanel) return;
        positionSearchPanel(state);
      };
      window.addEventListener('resize', onResize, { once: true });
      window.addEventListener('scroll', onResize, { once: true, capture: true });
    }

    function closeSearchDropdown(select) {
      if (!activeSearchPanel) return;
      if (select && activeSearchPanel.select !== select) return;
      closeActivePanel();
    }

    function syncAll(root) {
      const scope = root || document;
      const selects = Array.from(scope.querySelectorAll('select.search-select'));
      selects.forEach((sel) => {
        if (!isSearchableSelect(sel)) return;
        setupSearchableSelect(sel);
        syncSearchableSelect(sel);
      });
    }

    window.BlossomSearchableSelect = {
      syncAll,
      sync: syncSearchableSelect,
      open: openSearchDropdown,
      close: closeSearchDropdown,
      closeAll: closeActivePanel,
    };

    document.addEventListener('DOMContentLoaded', () => {
      try { syncAll(document); } catch (_e) {}
    });
  })();

  /* ── Lottie no-data animation helper ── */
  function showNoDataImage(container, altText){
    try{
      if(!container) return;
      container.innerHTML = '';
      var wrap = document.createElement('span');
      wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.justifyContent = 'center';
      wrap.style.padding = '12px 0'; wrap.style.minHeight = '140px'; wrap.style.width = '100%';
      wrap.style.boxSizing = 'border-box'; wrap.style.flexDirection = 'column';
      var jsonPath = '/static/image/svg/free-animated-no-data.json';
      function renderLottie(){
        try{
          if(!window.lottie) return false;
          var animBox = document.createElement('span');
          animBox.style.display = 'inline-block'; animBox.style.width = '240px'; animBox.style.maxWidth = '100%';
          animBox.style.height = '180px'; animBox.style.pointerEvents = 'none';
          var altMsg = altText || '데이터 없음';
          animBox.setAttribute('aria-label', (altMsg+'').split('\n')[0]);
          wrap.appendChild(animBox);
          try{
            window.lottie.loadAnimation({ container: animBox, renderer: 'svg', loop: true, autoplay: true, path: jsonPath });
            var capWrap = document.createElement('span'); capWrap.style.display='block'; capWrap.style.marginTop='8px'; capWrap.style.textAlign='center';
            (altMsg+'').split('\n').forEach(function(line, idx){ var cap=document.createElement('span'); cap.textContent=line; cap.style.display='block'; cap.style.fontSize = idx===0 ? '14px' : '13px'; cap.style.color = '#64748b'; capWrap.appendChild(cap); });
            wrap.appendChild(capWrap); container.appendChild(wrap); return true;
          }catch(_a){ return false; }
        }catch(_){ return false; }
      }
      function loadLottieAndRender(){
        try{
          var script = document.createElement('script'); script.src='https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js'; script.async=true;
          script.onload=function(){ if(!renderLottie()) renderImageFallback(); }; script.onerror=function(){ renderImageFallback(); }; document.head.appendChild(script);
        }catch(_){ renderImageFallback(); }
      }
      function renderImageFallback(){
        try{
          var img = document.createElement('img'); var altMsg = altText || '데이터 없음'; img.alt = (altMsg+'').split('\n')[0]; img.style.maxWidth='240px'; img.style.width='100%'; img.style.height='auto';
          var candidates = [
            '/static/image/svg/free-animated-no-data/no-data.svg','/static/image/svg/free-animated-no-data.svg',
            '/static/image/svg/free-animated-no-data/no-data.gif','/static/image/svg/free-animated-no-data.gif'
          ];
          var idx=0; function setNext(){ if(idx>=candidates.length) return; img.src=candidates[idx++]; }
          img.onerror=function(){ setNext(); }; setNext(); wrap.appendChild(img);
          var capWrap=document.createElement('span'); capWrap.style.display='block'; capWrap.style.marginTop='8px'; capWrap.style.textAlign='center';
          (altMsg+'').split('\n').forEach(function(line, i){ var cap=document.createElement('span'); cap.textContent=line; cap.style.display='block'; cap.style.fontSize = i===0 ? '14px' : '13px'; cap.style.color='#64748b'; capWrap.appendChild(cap); });
          wrap.appendChild(capWrap); container.appendChild(wrap);
        }catch(_f){ }
      }
      if(!renderLottie()){ if(!window.lottie){ loadLottieAndRender(); } else { renderImageFallback(); } }
    }catch(_){ }
  }

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  const API_BASE = '/api/network/ip-policies';
  const ORG_CENTER_API_BASE = '/api/org-centers';
  let centerLocationNamesCache = [];
  let centerLocationNamesPromise = null;

  function dedupeAndSortKorean(values){
    return [...new Set((values || []).map(v => String(v || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ko-KR'));
  }

  async function fetchCenterLocationNames(force){
    if(centerLocationNamesPromise && !force){
      return centerLocationNamesPromise;
    }
    centerLocationNamesPromise = (async ()=>{
      try {
        const data = await fetchJson(`${ORG_CENTER_API_BASE}?include_deleted=0`, { method:'GET' });
        const items = Array.isArray(data.items)
          ? data.items
          : (Array.isArray(data.rows) ? data.rows : []);
        centerLocationNamesCache = dedupeAndSortKorean(
          items.map(item => item && (item.center_name || item.centerName || ''))
        );
      } catch(err){
        console.warn('[IP Detail] 센터 목록 조회 실패:', err);
        centerLocationNamesCache = [];
      }
      return centerLocationNamesCache;
    })();
    return centerLocationNamesPromise;
  }

  // ------------------------------------------------------------
  // Modal helpers (detail.css: .modal-overlay-full.show)
  // ------------------------------------------------------------

  function openModalById(id){
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
    try{ document.body.classList.add('modal-open'); }catch(_e){}
  }

  function closeModalById(id){
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.remove('show');
    el.setAttribute('aria-hidden', 'true');
    try{ document.body.classList.remove('modal-open'); }catch(_e){}
  }

  // ------------------------------------------------------------
  // IP helpers (keep consistent with ip_list)
  // ------------------------------------------------------------

  function ipToBigIntGlobal(ip){
    if(!ip) return null;
    const s = String(ip).trim();
    if(!s) return null;
    // IPv4
    if(s.includes('.')){
      const parts = s.split('.');
      if(parts.length !== 4) return null;
      let n = 0n;
      for(const p of parts){
        if(!/^\d{1,3}$/.test(p)) return null;
        const v = parseInt(p, 10);
        if(v < 0 || v > 255) return null;
        n = (n << 8n) + BigInt(v);
      }
      return n;
    }
    // IPv6
    if(s.includes(':')){
      const hextets = s.split('::');
      if(hextets.length > 2) return null;
      let left = hextets[0] ? hextets[0].split(':').filter(Boolean) : [];
      let right = hextets[1] ? hextets[1].split(':').filter(Boolean) : [];
      const isValidHex = (x)=> /^[0-9a-fA-F]{0,4}$/.test(x);
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
    const a = ipToBigIntGlobal(start);
    const b = ipToBigIntGlobal(end);
    if(a == null || b == null) return null;
    if(b < a) return null;
    return (b - a + 1n);
  }

  function formatBigIntKO(nBig){
    try{ return nBig.toLocaleString('ko-KR'); }
    catch(_e){
      const s = nBig.toString();
      const neg = s.startsWith('-');
      const core = neg ? s.slice(1) : s;
      const out = core.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return neg ? '-' + out : out;
    }
  }

  function renderAllocationRateInto(el, raw){
    if(!el) return;
    const s = raw == null ? '' : String(raw);
    const n = parseInt(s.replace(/[^0-9-]/g,''), 10);
    const pct = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
    if(pct == null){
      el.textContent = '-';
      return;
    }
    const aria = `aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="할당률 ${pct}%"`;
    el.innerHTML = `<div class="progress-cell" role="progressbar" ${aria}>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span class="progress-value">${pct}%</span>
    </div>`;
  }

  // ------------------------------------------------------------
  // Policy edit modal (like ip_list)
  // ------------------------------------------------------------

  const POLICY_EDIT_MODAL_ID = 'ip-policy-edit-modal';
  const POLICY_EDIT_FORM_ID = 'ip-policy-edit-form';
  const POLICY_EDIT_BTN_ID = 'ip-policy-edit-btn';
  const POLICY_EDIT_CLOSE_ID = 'ip-policy-edit-close';
  const POLICY_EDIT_SAVE_ID = 'ip-policy-edit-save';

  function buildPolicyEditForm(record){
    const form = document.getElementById(POLICY_EDIT_FORM_ID);
    if(!form) return;
    const r = record || {};
    const status = (r.status || '').trim();
    const ipVersion = (r.ip_version || r.ipVersion || '').trim();
    const startIp = (r.start_ip || r.startIp || '').toString().trim();
    const endIp = (r.end_ip || r.endIp || '').toString().trim();
    const utilizationRaw = (r.utilization_rate ?? r.allocation_rate ?? r.allocationRate);
    const location = (r.location || r.center_code || r.centerCode || '').toString().trim();
    const role = (r.role || '').toString();
    const note = (r.note || r.description || '').toString();

    form.innerHTML = '';
    const section = document.createElement('div');
    section.className = 'form-section';
    section.innerHTML = `<div class="section-header"><h4>IP 정책</h4></div>`;

    const grid = document.createElement('div');
    grid.className = 'form-grid';

    grid.innerHTML = `
      <div class="form-row"><label>상태</label>
        <select name="status" class="form-input search-select fk-select" data-placeholder="상태 선택" data-searchable-scope="page">
          <option value="" ${!status?'selected':''}>선택</option>
          <option value="활성" ${status==='활성'?'selected':''}>활성</option>
          <option value="예약" ${status==='예약'?'selected':''}>예약</option>
          <option value="비활성" ${status==='비활성'?'selected':''}>비활성</option>
        </select>
      </div>
      <div class="form-row"><label>IP 버전</label>
        <select name="ip_version" class="form-input search-select fk-select" data-placeholder="IP 버전 선택" data-searchable-scope="page">
          <option value="" ${!ipVersion?'selected':''}>선택</option>
          <option value="IPv4" ${ipVersion==='IPv4'?'selected':''}>IPv4</option>
          <option value="IPv6" ${ipVersion==='IPv6'?'selected':''}>IPv6</option>
        </select>
      </div>
      <div class="form-row"><label>시작주소<span class="required">*</span></label><input name="start_ip" class="form-input" value="${startIp.replace(/"/g,'&quot;')}" required pattern="[0-9:.]*" inputmode="text" placeholder="숫자, ., : 만 입력"></div>
      <div class="form-row"><label>종료주소<span class="required">*</span></label><input name="end_ip" class="form-input" value="${endIp.replace(/"/g,'&quot;')}" required pattern="[0-9:.]*" inputmode="text" placeholder="숫자, ., : 만 입력"></div>
      <div class="form-metrics">
        <div class="form-row"><label>IP 범위 수량</label>
          <input id="edit-ip-range-count" type="text" class="form-input locked-input" placeholder="-" readonly disabled>
        </div>
        <div class="form-row"><label>할당률(%)</label>
          <input id="edit-utilization-rate" type="text" class="form-input locked-input" value="" placeholder="-" readonly disabled>
        </div>
      </div>
      <div class="form-row"><label>위치</label>
        <select name="location" class="form-input search-select fk-select" data-placeholder="위치 선택" data-location-select data-searchable-scope="page">
          <option value="">선택</option>
        </select>
      </div>
      <div class="form-row"><label>역할</label><input name="role" class="form-input" value="${role.replace(/"/g,'&quot;')}"></div>
      <div class="form-row form-row-wide"><label>비고</label><textarea name="note" class="form-input textarea-large" rows="6">${note.replace(/</g,'&lt;')}</textarea></div>
    `;

    section.appendChild(grid);
    form.appendChild(section);

    // Populate location options from org centers (center_name)
    const locSel = form.querySelector('select[name="location"]');
    if(locSel){
      const applyLocationOptions = (candidates)=>{
        const existing = new Set(Array.from(locSel.options).map((o)=> String(o.value || '').trim()));
        candidates.forEach((opt)=>{
          const v = String(opt || '').trim();
          if(!v || existing.has(v)) return;
          const o = document.createElement('option');
          o.value = v;
          o.textContent = v;
          locSel.appendChild(o);
          existing.add(v);
        });
        locSel.value = location && existing.has(location) ? location : '';
      };

      // Immediate candidates (current value), then async center names merge
      applyLocationOptions(dedupeAndSortKorean([location]));
      fetchCenterLocationNames().then((centerNames)=>{
        applyLocationOptions(dedupeAndSortKorean([location, ...centerNames]));
        try{ window.BlossomSearchableSelect?.syncAll?.(form); }catch(_e){}
      });
    }

    // Apply searchable select enhancement in this modal (after options/value are ready)
    try{ window.BlossomSearchableSelect?.syncAll?.(form); }catch(_e){}

    // IP range count live update (similar to ip_list)
    const startEl = form.querySelector('input[name="start_ip"]');
    const endEl = form.querySelector('input[name="end_ip"]');
    const out = form.querySelector('#edit-ip-range-count');
    const utilizationEl = form.querySelector('#edit-utilization-rate');

    const toPctText = (raw)=>{
      const s = raw == null ? '' : String(raw);
      const n = parseInt(s.replace(/[^0-9-]/g,''), 10);
      if(!Number.isFinite(n)) return '-';
      const pct = Math.min(100, Math.max(0, n));
      return `${pct}%`;
    };
    const originalStart = startIp;
    const originalEnd = endIp;
    const originalPctText = toPctText(utilizationRaw);
    if(utilizationEl) utilizationEl.value = originalPctText;
    const sanitize = (el)=>{
      if(!el) return;
      const v = el.value;
      const nv = v.replace(/[^0-9\.:]/g, '');
      if(v !== nv) el.value = nv;
    };
    const updateCount = ()=>{
      if(!out) return;
      const s = startEl?.value?.trim();
      const e = endEl?.value?.trim();
      const cnt = countIPsGlobal(s, e);
      out.value = (cnt == null) ? '-' : formatBigIntKO(cnt);

      // Utilization is server-computed; if the range changes, show a clear hint.
      if(utilizationEl){
        const changed = (String(s||'') !== String(originalStart||'')) || (String(e||'') !== String(originalEnd||''));
        utilizationEl.value = changed ? '저장 후 계산' : originalPctText;
      }
    };
    ['input','change','blur'].forEach((ev)=>{
      startEl?.addEventListener(ev, ()=>{ sanitize(startEl); updateCount(); });
      endEl?.addEventListener(ev, ()=>{ sanitize(endEl); updateCount(); });
    });
    sanitize(startEl); sanitize(endEl); updateCount();
  }

  function collectPolicyEditForm(){
    const form = document.getElementById(POLICY_EDIT_FORM_ID);
    if(!form) return null;
    const get = (name)=>{
      const el = form.querySelector(`[name="${name}"]`);
      if(!el) return '';
      return String(el.value ?? '').trim();
    };
    return {
      status: get('status'),
      ip_version: get('ip_version'),
      start_ip: get('start_ip'),
      end_ip: get('end_ip'),
      location: get('location'),
      role: get('role'),
      note: (function(){
        const el = form.querySelector('[name="note"]');
        return el ? String(el.value ?? '') : '';
      })(),
    };
  }

  function qs(name){
    try{ return new URLSearchParams(window.location.search).get(name); }
    catch(_e){ return null; }
  }

  /** Resolve the policy ID from query params OR body data attribute. */
  function govDetailId(){
    try{ return (document.body.dataset.govDetailId || '').trim() || null; }
    catch(_e){ return null; }
  }

  const resolveActor = (function(){
    let cached = null;
    return function(){
      if(cached !== null) return cached;
      try{
        const btn = document.getElementById('btn-account');
        const raw = btn && btn.dataset ? (btn.dataset.empNo || btn.getAttribute('data-emp-no') || '') : '';
        cached = String(raw || '').trim();
      }catch(_e){
        cached = '';
      }
      return cached;
    };
  })();

  async function apiRequest(url, options){
    const actor = resolveActor();
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(actor ? { 'X-Actor': actor } : {}),
        ...(options && options.headers ? options.headers : {})
      },
      ...options,
    });
    let body = null;
    try{ body = await res.json(); }catch(_e){ body = null; }
    if(!res.ok || (body && body.success === false)){
      const msg = (body && body.message) ? body.message : `요청 실패 (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  function normalizeRecord(payload){
    if(!payload) return null;
    if(payload.item) return payload.item;
    return payload;
  }

  // ------------------------------------------------------------
  // Message modal (on-premise parity)
  // Available to all init functions in this file.
  // ------------------------------------------------------------

  function ensureMessageModal(){
    let modal = document.getElementById('blossom-message-modal');
    if(modal && document.body.contains(modal)) return modal;

    modal = document.createElement('div');
    modal.id = 'blossom-message-modal';
    modal.className = 'server-add-modal modal-overlay-full blossom-message-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="server-add-content" role="document">
        <div class="server-add-header">
          <div class="server-add-title dispose-title">
            <h3 id="blossom-message-modal-title">알림</h3>
            <p class="server-add-subtitle" id="blossom-message-modal-subtitle"></p>
          </div>
          <button class="close-btn" type="button" data-message-modal="close" aria-label="닫기">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div class="server-add-body">
          <div class="dispose-content">
            <div class="dispose-text">
              <p id="blossom-message-modal-body"></p>
            </div>
            <div class="dispose-illust" aria-hidden="true">
              <img id="blossom-message-modal-illust" src="/static/image/svg/free-sticker-message.svg" alt="안내" loading="lazy" />
            </div>
          </div>
        </div>
        <div class="server-add-actions align-right">
          <div class="action-buttons right">
            <button type="button" class="btn-primary" data-message-modal="ok">확인</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);

    const close = () => closeMessageModal();
    modal.addEventListener('click', (e) => { if(e.target === modal) close(); });
    const btnClose = modal.querySelector('[data-message-modal="close"]');
    const btnOk = modal.querySelector('[data-message-modal="ok"]');
    if(btnClose) btnClose.addEventListener('click', close);
    if(btnOk) btnOk.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape' && modal.classList.contains('show')) close();
    });

    return modal;
  }

  function closeMessageModal(){
    const modal = document.getElementById('blossom-message-modal');
    if(!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function openMessageModal(message, title, options){
    const modal = ensureMessageModal();
    if(!modal) return;
    try{ window.BlossomSearchableSelect?.closeAll?.(); }catch(_e){}

    const titleEl = modal.querySelector('#blossom-message-modal-title');
    const subtitleEl = modal.querySelector('#blossom-message-modal-subtitle');
    const bodyEl = modal.querySelector('#blossom-message-modal-body');
    const illustEl = modal.querySelector('#blossom-message-modal-illust');

    const t = (title != null && String(title).trim()) ? String(title).trim() : '알림';
    const m = (message != null) ? String(message) : '';

    const opts = options && typeof options === 'object' ? options : {};
    const kind = (opts.kind ? String(opts.kind).toLowerCase() : 'info');
    const subtitleText = (opts.subtitle != null) ? String(opts.subtitle) : '';
    const illustSrc = opts.illustrationSrc
      ? String(opts.illustrationSrc)
      : (kind === 'success')
        ? '/static/image/svg/free-sticker-approved.svg'
        : (kind === 'error')
          ? '/static/image/svg/error/free-sticker-report.svg'
          : '/static/image/svg/free-sticker-message.svg';

    if(titleEl) titleEl.textContent = t;
    if(subtitleEl) subtitleEl.textContent = subtitleText;
    if(bodyEl) bodyEl.textContent = m;
    if(illustEl){
      illustEl.src = illustSrc;
      illustEl.alt = kind === 'success' ? '완료' : (kind === 'error' ? '오류' : '안내');
    }

    modal.classList.add('show');
    modal.removeAttribute('aria-hidden');
    document.body.classList.add('modal-open');

    const okBtn = modal.querySelector('[data-message-modal="ok"]');
    requestAnimationFrame(() => { try{ okBtn && okBtn.focus(); }catch(_e){} });
  }

  function notifyMessage(message, title, options){
    const m = (message != null) ? String(message) : '';
    const t = (title != null && String(title).trim()) ? String(title).trim() : '알림';
    const opts = options && typeof options === 'object' ? options : {};
    try{ openMessageModal(m, t, opts); }
    catch(_e){ try{ alert(m); }catch(_e2){} }
  }

  // ------------------------------------------------------------
  // File tab (gov_ip_policy_file): diagram + attachments
  // NOTE: Must be top-level so it runs on the file-tab page too.
  // ------------------------------------------------------------

  function initIpPolicyFileTab(){
    const diagramBox = document.getElementById('fi-diagram-box');
    const diagramInput = document.getElementById('fi-diagram-input');
    const diagramImg = document.getElementById('fi-diagram-img');
    const diagramEmpty = document.getElementById('fi-diagram-empty');
    const diagramClear = document.getElementById('fi-diagram-clear');

    const attachInput = document.getElementById('fi-attach-input');
    const attachDrop = document.getElementById('fi-attach-drop');
    const attachList = document.getElementById('fi-attach-list');
    const attachCount = document.getElementById('fi-attach-count');

    const noticeModal = document.getElementById('file-notice-modal');
    const noticeText = document.getElementById('file-notice-text');
    const noticeOk = document.getElementById('file-notice-ok');
    const noticeClose = document.getElementById('file-notice-close');

    const replaceModal = document.getElementById('diagram-replace-modal');
    const replaceText = document.getElementById('diagram-replace-text');
    const replaceOk = document.getElementById('diagram-replace-ok');
    const replaceCancel = document.getElementById('diagram-replace-cancel');
    const replaceClose = document.getElementById('diagram-replace-close');

    // Only run on the file tab page.
    if(!diagramBox && !attachDrop && !attachList) return;
    // Prevent double-wiring on SPA re-navigation
    if(diagramBox && diagramBox.dataset.ipFileInit === '1') return;
    if(diagramBox) diagramBox.dataset.ipFileInit = '1';

    const policyId = (function(){
      const id = qs('id') || qs('policy_id') || qs('policyId') || govDetailId();
      const n = parseInt(String(id || '').trim(), 10);
      return Number.isFinite(n) ? n : 0;
    })();

    function showNotice(msg){
      const text = (msg == null) ? '' : String(msg);
      notifyMessage(text, '알림');
      if(noticeText) noticeText.textContent = text;
      hideNotice();
    }
    function hideNotice(){
      if(noticeModal){
        noticeModal.classList.remove('show');
        noticeModal.setAttribute('aria-hidden','true');
        document.body.classList.remove('modal-open');
      }
    }
    noticeOk?.addEventListener('click', (e)=>{ e.preventDefault(); hideNotice(); });
    noticeClose?.addEventListener('click', (e)=>{ e.preventDefault(); hideNotice(); });
    noticeModal?.addEventListener('click', (e)=>{ if(e.target === noticeModal) hideNotice(); });
    document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && noticeModal?.classList.contains('show')) hideNotice(); });

    function setDiagramPreviewFromUrl(url){
      if(!diagramImg || !diagramEmpty) return;
      if(!url){
        diagramImg.removeAttribute('src');
        diagramImg.hidden = true;
        diagramEmpty.hidden = false;
        diagramBox?.classList.remove('has-image');
        return;
      }
      diagramImg.src = url;
      diagramImg.hidden = false;
      diagramEmpty.hidden = true;
      diagramBox?.classList.add('has-image');
    }

    // If the image fails to load (404/invalid), revert to placeholder instead of showing a broken image.
    diagramImg?.addEventListener('error', ()=>{
      try{ diagramImg.removeAttribute('src'); }catch(_e){}
      try{ diagramImg.hidden = true; }catch(_e){}
      try{ if(diagramEmpty) diagramEmpty.hidden = false; }catch(_e){}
      try{ diagramBox?.classList.remove('has-image'); }catch(_e){}
    });

    function downloadUrlFromToken(token){
      if(!token) return '';
      return `/api/uploads/${encodeURIComponent(token)}/download`;
    }

    function humanSize(bytes){
      try{
        if(bytes == null || bytes === '') return '-';
        const b = Number(bytes);
        if(!Number.isFinite(b)) return String(bytes);
        if(b < 1024) return `${b} B`;
        const units = ['KB','MB','GB','TB'];
        let v = b;
        let i = -1;
        while(v >= 1024 && i < units.length - 1){ v /= 1024; i += 1; }
        return `${v.toFixed(1)} ${units[i]}`;
      }catch(_e){
        return String(bytes || '-');
      }
    }

    function updateAttachCount(){
      if(!attachCount) return;
      const n = attachList ? attachList.querySelectorAll('li').length : 0;
      attachCount.textContent = String(n);
      attachCount.classList.remove('large-number','very-large-number');
      if(n >= 100) attachCount.classList.add('very-large-number');
      else if(n >= 10) attachCount.classList.add('large-number');
    }

    async function apiJson(url, options){
      const actor = resolveActor();
      const res = await fetch(url, {
        credentials: 'same-origin',
        headers: {
          ...(actor ? { 'X-Actor': actor } : {}),
          ...(options && options.headers ? options.headers : {}),
        },
        ...options,
      });
      let body = null;
      try{ body = await res.json(); }catch(_e){ body = null; }
      if(!res.ok || (body && body.success === false)){
        const msg = (body && (body.message || body.error)) ? (body.message || body.error) : `요청 실패 (${res.status})`;
        const err = new Error(msg);
        err.status = res.status;
        err.body = body;
        throw err;
      }
      return body;
    }

    async function uploadFileToServer(file){
      const fd = new FormData();
      fd.append('file', file);
      const rec = await apiJson('/api/uploads', { method: 'POST', body: fd });
      // rec: {id, name, size}
      return {
        uploadToken: rec.id,
        fileName: rec.name,
        fileSize: rec.size,
        downloadUrl: downloadUrlFromToken(rec.id),
      };
    }

    async function createDiagramRecord(payload){
      const res = await apiJson('/api/network/ip-diagrams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.item;
    }

    async function deleteDiagramRecord(diagramId){
      const res = await apiJson(`/api/network/ip-diagrams/${diagramId}`, { method: 'DELETE' });
      return res.deleted;
    }

    async function deleteUploadToken(token){
      if(!token) return;
      try{ await apiJson(`/api/uploads/${encodeURIComponent(token)}`, { method: 'DELETE' }); }
      catch(_e){ /* ignore: in-memory store may be gone */ }
    }

    function isImageFile(file){
      const mime = (file?.type || '').toLowerCase();
      const name = (file?.name || '').toLowerCase();
      return mime.startsWith('image/') && (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.gif') || name.endsWith('.webp'));
    }

    let currentPrimaryDiagram = null;
    let loading = false;

    let pendingDiagramFile = null;
    function showReplaceConfirm(file){
      pendingDiagramFile = file || null;
      if(replaceText){
        const name = file && file.name ? String(file.name) : '';
        replaceText.textContent = name
          ? `기존 구성도를 "${name}" 파일로 교체하시겠습니까?`
          : '기존 구성도를 교체하시겠습니까?';
      }
      const name = file && file.name ? String(file.name) : '';
      const msg = name
        ? `기존 구성도를 "${name}" 파일로 교체하시겠습니까?`
        : '기존 구성도를 교체하시겠습니까?';
      let ok = false;
      try{ ok = !!confirm(msg); }catch(_e){ ok = false; }
      if(ok) handleConfirmedReplace();
      else pendingDiagramFile = null;
    }
    function hideReplaceConfirm(){
      pendingDiagramFile = null;
      if(replaceModal){
        replaceModal.classList.remove('show');
        replaceModal.setAttribute('aria-hidden','true');
        document.body.classList.remove('modal-open');
      }
    }

    async function handleConfirmedReplace(){
      const file = pendingDiagramFile;
      hideReplaceConfirm();
      if(!file) return;

      // If there is an existing primary diagram, delete it first to truly "replace".
      if(currentPrimaryDiagram && currentPrimaryDiagram.id){
        if(loading) return;
        loading = true;
        try{
          const token = currentPrimaryDiagram.upload_token;
          await deleteDiagramRecord(currentPrimaryDiagram.id);
          await deleteUploadToken(token);
          currentPrimaryDiagram = null;
        }catch(err){
          console.error(err);
          showNotice(err?.message || '기존 구성도 삭제 중 오류가 발생했습니다.');
          try{ await loadState(); }catch(_e){}
          loading = false;
          return;
        }finally{
          loading = false;
        }
      }

      // Proceed with upload/create
      await handleDiagramFile(file);
    }

    replaceOk?.addEventListener('click', (e)=>{ e.preventDefault(); handleConfirmedReplace().catch((err)=>{ console.error(err); showNotice(err?.message || '구성도 교체 중 오류가 발생했습니다.'); }); });
    replaceCancel?.addEventListener('click', (e)=>{ e.preventDefault(); hideReplaceConfirm(); });
    replaceClose?.addEventListener('click', (e)=>{ e.preventDefault(); hideReplaceConfirm(); });
    replaceModal?.addEventListener('click', (e)=>{ if(e.target === replaceModal) hideReplaceConfirm(); });
    document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && replaceModal?.classList.contains('show')) hideReplaceConfirm(); });

    function renderAttachments(items){
      if(!attachList) return;
      attachList.innerHTML = '';
      (items || []).forEach((it)=>{
        const li = document.createElement('li');
        li.className = 'attach-item';
        li.dataset.id = String(it.id);
        li.dataset.uploadToken = String(it.upload_token || '');

        const fileName = it.file_name || it.title || '파일';
        const sizeText = humanSize(it.file_size);
        const token = it.upload_token || '';
        const href = it.file_path || (token ? downloadUrlFromToken(token) : '');
        const ext = (fileName.split('.').pop() || '').slice(0, 6).toUpperCase();

        li.innerHTML = `
          <div class="file-chip"><span class="file-badge">${ext || 'FILE'}</span><span class="name">${String(fileName).replace(/</g,'&lt;')}</span><span class="size">${sizeText}</span></div>
          <div class="chip-actions">
            <button class="icon-btn js-att-dl" type="button" title="다운로드" aria-label="다운로드" ${href ? '' : 'disabled'}>
              <img src="/static/image/svg/list/free-icon-download.svg" alt="다운" class="action-icon">
            </button>
            <button class="icon-btn danger js-att-del" type="button" title="삭제" aria-label="삭제">
              <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">
            </button>
          </div>
        `;
        li.dataset.href = href;
        attachList.appendChild(li);
      });
      updateAttachCount();
    }

    async function loadState(){
      if(!policyId){
        showNotice('policy id가 없습니다. 목록에서 다시 진입해주세요.');
        return;
      }
      const data = await apiJson(`/api/network/ip-diagrams?policy_id=${policyId}`);
      const items = Array.isArray(data.items) ? data.items : [];
      const diagrams = items.filter((it)=> String(it.entry_type || '').toUpperCase() === 'DIAGRAM');
      const primary = diagrams.find((it)=> !!it.is_primary) || diagrams[0] || null;
      currentPrimaryDiagram = primary;

      const primaryUrl = primary ? (primary.file_path || (primary.upload_token ? downloadUrlFromToken(primary.upload_token) : '')) : '';
      setDiagramPreviewFromUrl(primaryUrl);

      const attachments = items.filter((it)=> String(it.entry_type || '').toUpperCase() !== 'DIAGRAM');
      renderAttachments(attachments);
    }

    async function handleDiagramFile(file){
      if(loading) return;
      if(!file) return;
      if(!isImageFile(file)){
        showNotice('이미지 파일만 업로드 가능합니다.');
        return;
      }
      if(!policyId){
        showNotice('policy id가 없습니다.');
        return;
      }

      loading = true;
      try{
        // optimistic preview
        const localUrl = URL.createObjectURL(file);
        setDiagramPreviewFromUrl(localUrl);

        const uploaded = await uploadFileToServer(file);
        const created = await createDiagramRecord({
          policy_id: policyId,
          entry_type: 'DIAGRAM',
          file_name: uploaded.fileName,
          file_size: uploaded.fileSize,
          mime_type: file.type || 'application/octet-stream',
          upload_token: uploaded.uploadToken,
          file_path: uploaded.downloadUrl,
          is_primary: true,
          title: uploaded.fileName,
        });
        currentPrimaryDiagram = created;
        setDiagramPreviewFromUrl(created.file_path || uploaded.downloadUrl);
      } catch(err){
        console.error(err);
        showNotice(err?.message || '구성도 업로드 중 오류가 발생했습니다.');
        // rollback to server state
        try{ await loadState(); }catch(_e){}
      } finally {
        loading = false;
      }
    }

    async function clearDiagram(){
      if(loading) return;
      if(!currentPrimaryDiagram || !currentPrimaryDiagram.id){
        setDiagramPreviewFromUrl('');
        return;
      }
      loading = true;
      try{
        const token = currentPrimaryDiagram.upload_token;
        await deleteDiagramRecord(currentPrimaryDiagram.id);
        await deleteUploadToken(token);
        currentPrimaryDiagram = null;
        setDiagramPreviewFromUrl('');
      } catch(err){
        console.error(err);
        showNotice(err?.message || '구성도 삭제 중 오류가 발생했습니다.');
      } finally {
        loading = false;
      }
    }

    async function handleAttachmentFiles(files){
      if(loading) return;
      if(!policyId){
        showNotice('policy id가 없습니다.');
        return;
      }
      const list = Array.from(files || []).filter(Boolean);
      if(!list.length) return;

      loading = true;
      try{
        for(const f of list){
          const uploaded = await uploadFileToServer(f);
          await createDiagramRecord({
            policy_id: policyId,
            entry_type: 'ATTACHMENT',
            file_name: uploaded.fileName,
            file_size: uploaded.fileSize,
            mime_type: f.type || 'application/octet-stream',
            upload_token: uploaded.uploadToken,
            file_path: uploaded.downloadUrl,
            title: uploaded.fileName,
          });
        }
        await loadState();
      } catch(err){
        console.error(err);
        showNotice(err?.message || '첨부파일 업로드 중 오류가 발생했습니다.');
        try{ await loadState(); }catch(_e){}
      } finally {
        loading = false;
      }
    }

    // Wire UI
    function pickDiagram(){ diagramInput?.click(); }
    diagramBox?.addEventListener('click', pickDiagram);
    diagramBox?.addEventListener('keypress', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); pickDiagram(); } });
    ;['dragenter','dragover'].forEach((ev)=> diagramBox?.addEventListener(ev, (e)=>{ e.preventDefault(); e.stopPropagation(); diagramBox.classList.add('dragover'); }));
    ;['dragleave','drop'].forEach((ev)=> diagramBox?.addEventListener(ev, (e)=>{
      e.preventDefault(); e.stopPropagation();
      diagramBox.classList.remove('dragover');
      if(ev === 'drop'){
        const dt = e.dataTransfer;
        const file = dt && dt.files && dt.files[0];
        if(file){
          const hasExisting = !!(currentPrimaryDiagram && currentPrimaryDiagram.id);
          if(hasExisting) showReplaceConfirm(file);
          else handleDiagramFile(file);
        }
      }
    }));
    diagramInput?.addEventListener('change', ()=>{
      const file = diagramInput.files && diagramInput.files[0];
      if(file){
        const hasExisting = !!(currentPrimaryDiagram && currentPrimaryDiagram.id);
        if(hasExisting) showReplaceConfirm(file);
        else handleDiagramFile(file);
      }
      diagramInput.value='';
    });
    diagramClear?.addEventListener('click', (e)=>{
      e.preventDefault();
      if(typeof window.flOpenDeleteModal === 'function'){
        var fakeLi = document.createElement('li');
        fakeLi.innerHTML = '<div class="file-chip"><span class="name">대표 구성도</span></div>';
        window.flOpenDeleteModal(fakeLi, ()=>{ clearDiagram(); });
      } else {
        clearDiagram();
      }
    });

    function pickAttachments(){ attachInput?.click(); }
    attachDrop?.addEventListener('click', pickAttachments);
    attachDrop?.addEventListener('keypress', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); pickAttachments(); } });
    ;['dragenter','dragover'].forEach((ev)=> attachDrop?.addEventListener(ev, (e)=>{ e.preventDefault(); e.stopPropagation(); attachDrop.classList.add('dragover'); }));
    ;['dragleave','drop'].forEach((ev)=> attachDrop?.addEventListener(ev, (e)=>{
      e.preventDefault(); e.stopPropagation();
      attachDrop.classList.remove('dragover');
      if(ev === 'drop'){
        const dt = e.dataTransfer;
        if(dt && dt.files && dt.files.length) handleAttachmentFiles(dt.files);
      }
    }));
    attachInput?.addEventListener('change', ()=>{ const files = attachInput.files; if(files && files.length) handleAttachmentFiles(files); attachInput.value=''; });

    attachList?.addEventListener('click', async (e)=>{
      const delBtn = e.target.closest('.js-att-del');
      const dlBtn = e.target.closest('.js-att-dl');
      const li = e.target.closest('li.attach-item');
      if(!li) return;
      const id = parseInt(li.dataset.id || '', 10);
      const token = li.dataset.uploadToken || '';
      const href = li.dataset.href || '';
      if(dlBtn){
        e.preventDefault();
        if(href) window.open(href, '_blank');
        return;
      }
      if(delBtn){
        e.preventDefault();
        if(!Number.isFinite(id)) return;
        if(loading) return;
        const doDelete = async ()=>{
          loading = true;
          try{
            await deleteDiagramRecord(id);
            await deleteUploadToken(token);
            li.remove();
            updateAttachCount();
          } catch(err){
            console.error(err);
            showNotice(err?.message || '첨부파일 삭제 중 오류가 발생했습니다.');
            try{ await loadState(); }catch(_e){}
          } finally {
            loading = false;
          }
        };
        if(typeof window.flOpenDeleteModal === 'function'){
          window.flOpenDeleteModal(li, doDelete);
        } else {
          doDelete();
        }
      }
    });

    // Initial load
    loadState().catch((err)=>{
      console.error(err);
      showNotice(err?.message || '구성/파일 정보를 불러오지 못했습니다.');
    });
  }

  // ------------------------------------------------------------
  // Log tab (gov_ip_policy_log): history list + detail modal
  // NOTE: Included here to keep IP policy pages on only:
  // - /static/js/blossom.js
  // - /static/js/4.governance/4-3.network_policy/4-3-1.ip/2.ip_detail.js
  // ------------------------------------------------------------

  function initIpPolicyLogTab(){
    const emptyEl = document.getElementById('lg-empty');
    const table = document.getElementById('lg-spec-table');
    const tbody = table ? table.querySelector('tbody') : null;
    const pageSizeSel = document.getElementById('lg-page-size');
    const addBtn = document.getElementById('lg-row-add');

    const selectAll = document.getElementById('lg-select-all');

    const paginationInfo = document.getElementById('lg-pagination-info');
    const pageNumbers = document.getElementById('lg-page-numbers');
    const btnFirst = document.getElementById('lg-first');
    const btnPrev = document.getElementById('lg-prev');
    const btnNext = document.getElementById('lg-next');
    const btnLast = document.getElementById('lg-last');

    const downloadBtn = document.getElementById('lg-download-btn');

    const detailModalClose = document.getElementById('lg-detail-close');
    const detailText = document.getElementById('lg-detail-text');
    const detailReason = document.getElementById('lg-detail-reason');
    const detailReasonSave = document.getElementById('lg-detail-reason-save');
    const detailSave = document.getElementById('lg-detail-save');

    // Only run on the log tab page.
    if(!table && !tbody && !detailText) return;
    // Prevent double-wiring on SPA re-navigation
    if(table && table.dataset.ipLogInit === '1') return;
    if(table) table.dataset.ipLogInit = '1';

    const idRaw = qs('id') || govDetailId();
    const policyId = idRaw ? parseInt(idRaw, 10) : NaN;

    function escapeHtml(s){
      return String(s ?? '')
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;')
        .replace(/'/g,'&#39;');
    }

    function csvEscape(value){
      const s = String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const needsQuotes = /[",\n]/.test(s);
      const escaped = s.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    }

    function downloadTextAsFile(filename, content, mimeType){
      const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    function selectedLogIdsOnPage(){
      if(!tbody) return [];
      return Array.from(tbody.querySelectorAll('input.lg-row:checked'))
        .map((el)=> (el && el.getAttribute ? el.getAttribute('data-id') : ''))
        .map((v)=> String(v || '').trim())
        .filter(Boolean);
    }

    function selectionMode(){
      if(!tbody) return 'all';
      const boxes = Array.from(tbody.querySelectorAll('input.lg-row'));
      if(!boxes.length) return 'all';
      const checked = boxes.filter((b)=> !!b.checked);

      // Requirement:
      // - 일부 선택: 선택 다운로드
      // - 아무것도 선택 안 함 OR 모두 선택: 전체 다운로드
      if(checked.length === 0) return 'all';
      if(checked.length === boxes.length) return 'all';
      return 'selected';
    }

    function updateDownloadButtonState(){
      if(!downloadBtn || !tbody) return;
      const hasRows = !!tbody.querySelector('tr');
      downloadBtn.disabled = !hasRows;
      downloadBtn.setAttribute('aria-disabled', (!hasRows).toString());
      downloadBtn.title = hasRows ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
    }

    function savedVisibleRows(){
      if(!tbody) return [];
      return Array.from(tbody.querySelectorAll('tr'));
    }

    function syncRowSelectedState(tr, checked){
      if(!tr) return;
      tr.classList.toggle('selected', !!checked);
    }

    function syncSelectAllState(){
      if(!selectAll || !table) return;
      const checks = Array.from(table.querySelectorAll('tbody .lg-row'));
      if(!checks.length){
        selectAll.checked = false;
        selectAll.indeterminate = false;
        return;
      }
      const checkedCount = checks.reduce((acc, cb) => acc + (cb.checked ? 1 : 0), 0);
      selectAll.checked = checkedCount === checks.length;
      selectAll.indeterminate = checkedCount > 0 && checkedCount < checks.length;
    }

    function selectOnlyLogRow(targetRow){
      if(!table) return;
      const checks = Array.from(table.querySelectorAll('tbody .lg-row'));
      for(const cb of checks){
        const tr = cb.closest('tr');
        const isTarget = !!(targetRow && tr && tr === targetRow);
        cb.checked = isTarget;
        syncRowSelectedState(tr, isTarget);
      }
      syncSelectAllState();
    }

    function buildLogsCsv(items){
      const headers = ['변경일시', '변경유형', '변경자', '변경탭', '변경 내용', '변경 사유'];
      let csv = '\uFEFF';
      csv += headers.map(csvEscape).join(',') + '\n';

      const rows = Array.isArray(items) ? items : [];
      for(const it of rows){
        const normalizedMessage = normalizeLogMessage(it);
        const values = [
          it && it.created_at,
          actionLabel(it && it.action),
          it && it.actor,
          tabLabel(it && it.tab_key),
          normalizedMessage,
          it && (it.reason || ''),
        ];
        csv += values.map(csvEscape).join(',') + '\n';
      }
      return csv;
    }

    function getIpRangeChangedCountFromDiff(diff){
      if(!diff) return null;
      let obj = diff;
      if(typeof obj === 'string') obj = tryParseJson(obj);
      if(!obj) return null;
      if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;
      if(!isPlainObject(obj)) return null;

      // Prefer explicit count when backend provides it.
      if(Number.isFinite(parseInt(obj.changed_fields, 10))) return parseInt(obj.changed_fields, 10);

      const changed = obj.changed;
      if(Array.isArray(changed)){
        // Sum changed fields across rows when diff contains before/after.
        let total = 0;
        for(const row of changed){
          if(isPlainObject(row)){
            if(isPlainObject(row.changes)){
              total += Object.keys(row.changes).length;
              continue;
            }
            if(isPlainObject(row.before) && isPlainObject(row.after)){
              let n = 0;
              for(const k of Object.keys(row.after)){
                if(String(row.before[k] ?? '') !== String(row.after[k] ?? '')) n += 1;
              }
              total += (n || 0);
              continue;
            }
          }
          total += 1;
        }
        if(total > 0) return total;
        return changed.length;
      }
      if(isPlainObject(changed)) return Object.keys(changed).length;
      return null;
    }

    function stripCountNoise(message){
      // Remove UI-noise like "(1건)", "(1건 변경)" anywhere in the message.
      // Old logs sometimes include these tokens in the middle with commas.
      let s = String(message ?? '').trim();
      s = s.replace(/\(\s*\d+\s*건\s*변경\s*\)/gu, '');
      s = s.replace(/\(\s*\d+\s*건\s*\)/gu, '');
      // Cleanup leftover punctuation/spacing after removal.
      s = s.replace(/\s*,\s*,\s*/gu, ', ');
      s = s.replace(/\s+,/gu, ',');
      s = s.replace(/,\s*$/gu, '');
      s = s.replace(/\s{2,}/gu, ' ');
      return s.trim();
    }

    function parseChangedCountFromMessage(message){
      const s = String(message ?? '');
      let m = s.match(/(\d+)\s*건\s*변경/u);
      if(m && m[1]) return parseInt(m[1], 10);
      m = s.match(/(\d+)\s*건/u);
      if(m && m[1]) return parseInt(m[1], 10);
      return null;
    }

    function extractPrimaryFileNameFromLogDiff(diff){
      let obj = diff;
      if(typeof obj === 'string') obj = tryParseJson(obj);
      if(!obj) return '';
      if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;

      if(isPlainObject(obj)){
        const direct = obj.file_name || obj.fileName || obj.original_filename || obj.name || obj.title;
        if(direct) return String(direct).trim();

        const changes = isPlainObject(obj.changes) ? obj.changes : (isPlainObject(obj.changed) ? obj.changed : null);
        if(isPlainObject(changes) && isPlainObject(changes.file_name)){
          const entry = changes.file_name;
          const after = entry.after ?? entry.after_value ?? entry.new ?? entry.to;
          const before = entry.before ?? entry.before_value ?? entry.old ?? entry.from;
          const afterNames = extractFileNames(after);
          if(afterNames.length) return String(afterNames[0]).trim();
          const beforeNames = extractFileNames(before);
          if(beforeNames.length) return String(beforeNames[0]).trim();
        }

        const afterWrap = obj.after ?? obj.after_value ?? obj.new ?? obj.to ?? obj.created;
        const afterNames = extractFileNames(afterWrap);
        if(afterNames.length) return String(afterNames[0]).trim();

        const beforeWrap = obj.before ?? obj.before_value ?? obj.old ?? obj.from ?? obj.deleted;
        const beforeNames = extractFileNames(beforeWrap);
        if(beforeNames.length) return String(beforeNames[0]).trim();
      }

      const any = extractFileNames(obj);
      return any.length ? String(any[0]).trim() : '';
    }

    function normalizeLogMessage(it){
      const raw = (it && it.message != null) ? String(it.message) : '';
      const base = stripCountNoise(raw);

      const tabKey = String(it && it.tab_key ? it.tab_key : '');
      const action = String(it && it.action ? it.action : '').toUpperCase();

      if(tabKey === 'gov_ip_policy_file'){
        const fileName = extractPrimaryFileNameFromLogDiff(it && it.diff);
        if(fileName){
          const a = String(action || '').trim().toUpperCase();
          const verb = (a === 'DELETE' || a === 'REMOVE')
            ? '삭제'
            : ((a === 'CREATE' || a === 'UPLOAD' || a === 'ADD' || a === 'INSERT')
              ? '등록'
              : ((a === 'UPDATE' || a === 'EDIT' || a === 'MODIFY') ? '수정' : '변경'));
          return `구성/파일 ${verb} (${fileName})`;
        }
      }

      if(tabKey === 'gov_ip_policy_ip_range' && action === 'UPDATE'){
        // Backward-compat: old logs used "IP 범위 저장 (N건 변경)".
        // New UX: "IP 범위 수정 (데이터 N개 수정)".
        if(base.startsWith('IP 범위 저장') || base.startsWith('IP 범위 수정')){
          let n = getIpRangeChangedCountFromDiff(it && it.diff);
          if(!Number.isFinite(n) || n <= 0){
            const parsed = parseChangedCountFromMessage(raw);
            n = Number.isFinite(parsed) ? parsed : n;
          }
          if(Number.isFinite(n) && n > 0) return `IP 범위 수정 (데이터 ${n}개 수정)`;
          return 'IP 범위 수정';
        }
      }

      return base || '-';
    }

    async function fetchAllLogsForCsv(policyId){
      let page = 1;
      const requestedPageSize = 200;
      const all = [];
      let lastPage = 1;
      let safety = 0;

      while(page <= lastPage){
        safety += 1;
        if(safety > 500) break;
        const data = await apiRequest(`/api/network/ip-policies/${encodeURIComponent(policyId)}/logs?page=${encodeURIComponent(page)}&page_size=${encodeURIComponent(requestedPageSize)}`, { method: 'GET' });
        const total = data && Number.isFinite(parseInt(data.total, 10)) ? parseInt(data.total, 10) : 0;
        const currentSize = data && Number.isFinite(parseInt(data.page_size, 10)) ? parseInt(data.page_size, 10) : requestedPageSize;
        lastPage = Math.max(1, Math.ceil(total / (currentSize || requestedPageSize || 1)));

        const items = Array.isArray(data && data.items) ? data.items : [];
        for(const it of items) all.push(it);
        page += 1;
      }
      return all;
    }

    function isPlainObject(v){
      return !!v && typeof v === 'object' && !Array.isArray(v);
    }

    function tryParseJson(text){
      const s = String(text ?? '').trim();
      if(s === '') return null;
      if(!(s.startsWith('{') || s.startsWith('['))) return null;
      try{ return JSON.parse(s); }catch(_e){ return null; }
    }

    function normalizeToObject(v){
      if(isPlainObject(v)) return v;
      if(typeof v === 'string'){
        const parsed = tryParseJson(v);
        if(isPlainObject(parsed)) return parsed;
      }
      return null;
    }

    function extractBeforeAfter(root){
      let obj = root;
      if(typeof obj === 'string') obj = tryParseJson(obj);
      if(!obj) return null;

      if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;
      if(!isPlainObject(obj)) return null;

      const beforeRaw = (obj.before !== undefined) ? obj.before : (obj.before_value !== undefined ? obj.before_value : obj.old);
      const afterRaw = (obj.after !== undefined) ? obj.after : (obj.after_value !== undefined ? obj.after_value : obj.new);

      const beforeObj = normalizeToObject(beforeRaw);
      const afterObj = normalizeToObject(afterRaw);
      if(!(beforeObj && afterObj)) return null;
      return { beforeObj, afterObj };
    }

    function extractChangesEntries(root){
      let obj = root;
      if(typeof obj === 'string') obj = tryParseJson(obj);
      if(!obj) return null;
      if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;
      if(!isPlainObject(obj)) return null;

      const map = isPlainObject(obj.changes)
        ? obj.changes
        : (isPlainObject(obj.changed) ? obj.changed : null);
      if(!isPlainObject(map)) return null;

      const entries = [];
      for(const key of Object.keys(map)){
        const entry = map[key];
        if(isPlainObject(entry)){
          const beforeVal = (entry.before !== undefined) ? entry.before
            : ((entry.before_value !== undefined) ? entry.before_value
              : ((entry.old !== undefined) ? entry.old
                : (entry.from !== undefined ? entry.from : undefined)));
          const afterVal = (entry.after !== undefined) ? entry.after
            : ((entry.after_value !== undefined) ? entry.after_value
              : ((entry.new !== undefined) ? entry.new
                : (entry.to !== undefined ? entry.to : undefined)));
          if(beforeVal !== undefined || afterVal !== undefined){
            entries.push({ path: [key], beforeVal, afterVal });
          }
        }
      }
      if(entries.length === 0) return null;
      entries.sort((a, b)=> a.path.join('.').localeCompare(b.path.join('.')));
      return entries;
    }

    function extractAfterOnly(root){
      let obj = root;
      if(typeof obj === 'string') obj = tryParseJson(obj);
      if(!obj) return null;
      if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;
      if(!isPlainObject(obj)) return null;

      const afterRaw = (obj.after !== undefined) ? obj.after : (obj.created !== undefined ? obj.created : null);
      const afterObj = normalizeToObject(afterRaw);
      if(!afterObj) return null;
      return afterObj;
    }

    function extractBeforeOnly(root){
      let obj = root;
      if(typeof obj === 'string') obj = tryParseJson(obj);
      if(!obj) return null;
      if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;
      if(!isPlainObject(obj)) return null;

      const beforeRaw = (obj.before !== undefined) ? obj.before : (obj.deleted !== undefined ? obj.deleted : null);
      const beforeObj = normalizeToObject(beforeRaw);
      if(!beforeObj) return null;
      return beforeObj;
    }

    function valuesEqual(a, b){
      if(a === b) return true;
      const aObj = (a && typeof a === 'object');
      const bObj = (b && typeof b === 'object');
      if(aObj !== bObj) return false;
      if(!aObj || !bObj) return false;
      if(Array.isArray(a) || Array.isArray(b)){
        if(!Array.isArray(a) || !Array.isArray(b)) return false;
        if(a.length !== b.length) return false;
        for(let i = 0; i < a.length; i++){
          if(!valuesEqual(a[i], b[i])) return false;
        }
        return true;
      }
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      if(aKeys.length !== bKeys.length) return false;
      for(const k of aKeys){
        if(!(k in b)) return false;
        if(!valuesEqual(a[k], b[k])) return false;
      }
      return true;
    }

    function diffBeforeAfter(beforeObj, afterObj){
      const changes = [];
      function walk(path, beforeVal, afterVal){
        if(valuesEqual(beforeVal, afterVal)) return;
        const beforeIsObj = isPlainObject(beforeVal);
        const afterIsObj = isPlainObject(afterVal);
        if(beforeIsObj && afterIsObj){
          const keys = new Set([...Object.keys(beforeVal), ...Object.keys(afterVal)]);
          for(const k of keys) walk(path.concat([k]), beforeVal[k], afterVal[k]);
          return;
        }
        changes.push({ path, beforeVal, afterVal });
      }
      walk([], beforeObj, afterObj);
      return changes;
    }

    function formatValue(v){
      if(v === undefined) return 'null';
      if(v === null) return 'null';
      if(typeof v === 'string'){
        const t = v.trim();
        if(t === '' || t === '-') return 'null';
      }
      try{ return JSON.stringify(v); }catch(_e){ return String(v); }
    }

    const LG_FIELD_LABELS = {
      // IP policy (기본정보)
      status: '상태',
      ip_version: 'IP 버전',
      start_ip: '시작주소',
      end_ip: '종료주소',
      ip_range: 'IP 범위',
      ip_count: 'IP 개수',
      utilization_rate: '할당률',
      allocation_rate: '할당률',
      center_code: '위치',
      location: '위치',
      role: '역할',
      description: '비고',
      note: '비고',
      policy_name: '정책명',
      policy_code: '정책코드',
      created_at: '생성일시',
      updated_at: '수정일시',
      created_by: '생성자',
      updated_by: '수정자',
      // IP range (IP 범위)
      ip_address: '주소',
      address: '주소',
      dns: 'DNS',
      dns_name: 'DNS',
      dns_domain: 'DNS',
      system: '시스템',
      system_name: '시스템',
      port: '포트',
      rol: '역할',
      note: '비고',
      // File tab (구성/파일)
      entry_type: '구분',
      file_name: '파일명',
      title: '제목',
      kind: '분류',
      mime_type: 'MIME',
      is_primary: '대표 여부',
      sort_order: '정렬',
    };

    function toSnakeCase(s){
      const raw = String(s || '').trim();
      if(!raw) return '';
      return raw
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[-\s]+/g, '_')
        .toLowerCase();
    }

    function looksLikeIp(s){
      const v = String(s || '').trim();
      if(v === '') return false;
      if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(v)) return true;
      if(/^[0-9a-fA-F:]+$/.test(v) && v.includes(':')) return true;
      return false;
    }

    function labelForKey(key){
      const k = String(key || '').trim();
      if(!k) return '';
      if(Object.prototype.hasOwnProperty.call(LG_FIELD_LABELS, k)) return LG_FIELD_LABELS[k];
      const sn = toSnakeCase(k);
      if(sn && Object.prototype.hasOwnProperty.call(LG_FIELD_LABELS, sn)) return LG_FIELD_LABELS[sn];

      if(sn === 'startip' && Object.prototype.hasOwnProperty.call(LG_FIELD_LABELS, 'start_ip')) return LG_FIELD_LABELS.start_ip;
      if(sn === 'endip' && Object.prototype.hasOwnProperty.call(LG_FIELD_LABELS, 'end_ip')) return LG_FIELD_LABELS.end_ip;
      if(sn === 'ipversion' && Object.prototype.hasOwnProperty.call(LG_FIELD_LABELS, 'ip_version')) return LG_FIELD_LABELS.ip_version;
      if(sn === 'utilizationrate' && Object.prototype.hasOwnProperty.call(LG_FIELD_LABELS, 'utilization_rate')) return LG_FIELD_LABELS.utilization_rate;
      if(sn === 'allocationrate' && Object.prototype.hasOwnProperty.call(LG_FIELD_LABELS, 'allocation_rate')) return LG_FIELD_LABELS.allocation_rate;
      if(sn === 'dnsdomain' && Object.prototype.hasOwnProperty.call(LG_FIELD_LABELS, 'dns_domain')) return LG_FIELD_LABELS.dns_domain;
      if(sn === 'systemname' && Object.prototype.hasOwnProperty.call(LG_FIELD_LABELS, 'system_name')) return LG_FIELD_LABELS.system_name;
      return '';
    }

    function displayPath(tabKey, pathArr){
      const parts = Array.isArray(pathArr) ? pathArr.map((p)=> String(p)) : [String(pathArr || '')];
      if(parts.length === 0) return '항목';
      if(parts.length >= 2 && looksLikeIp(parts[0])){
        const fieldLabel = labelForKey(parts[parts.length - 1]) || '항목';
        return fieldLabel;
      }
      const last = parts[parts.length - 1];
      const lbl = labelForKey(last);
      if(lbl) return lbl;
      return '항목';
    }

    function extractFileNames(value){
      if(value == null) return [];
      if(typeof value === 'string'){
        const t = value.trim();
        return t ? [t] : [];
      }
      if(Array.isArray(value)){
        const out = [];
        for(const item of value){
          if(isPlainObject(item)){
            const n = item.file_name || item.fileName || item.original_filename || item.name || item.title;
            if(n) out.push(String(n));
          }else if(typeof item === 'string'){
            const t = item.trim();
            if(t) out.push(t);
          }
        }
        return out;
      }
      if(isPlainObject(value)){
        const n = value.file_name || value.fileName || value.original_filename || value.name || value.title;
        return n ? [String(n)] : [];
      }
      return [];
    }

    function formatValueForContext(tabKey, fieldKey, v){
      const tk = String(tabKey || '').trim();
      const fk = String(fieldKey || '').trim();
      if(tk === 'gov_ip_policy_file'){
        if(fk === 'file_name') return String(v ?? '');
        const names = extractFileNames(v);
        if(names.length > 0) return names.join(', ');
        return '';
      }
      return formatValue(v);
    }

    function extractChangedArrayEntries(root){
      // Handles: { changed: [ { ip_address, before:{...}, after:{...} }, ... ] }
      // Used by IP range save logs.
      let obj = root;
      if(typeof obj === 'string') obj = tryParseJson(obj);
      if(!obj) return null;
      if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;
      if(!isPlainObject(obj)) return null;

      const arr = obj.changed;
      if(!Array.isArray(arr) || arr.length === 0) return null;

      const entries = [];
      for(let i = 0; i < arr.length; i++){
        const row = arr[i];
        if(!isPlainObject(row)) continue;
        const ip = String(row.ip_address || row.ip || row.address || row.id || (i + 1));
        const beforeObj = normalizeToObject(row.before) || {};
        const afterObj = normalizeToObject(row.after) || {};

        if(!isPlainObject(beforeObj) || !isPlainObject(afterObj)){
          entries.push({ path: [ip], beforeVal: row.before, afterVal: row.after });
          continue;
        }

        const rowChanges = diffBeforeAfter(beforeObj, afterObj)
          .filter((c)=> Array.isArray(c.path) && c.path.length > 0);

        for(const c of rowChanges){
          entries.push({ path: [ip].concat(c.path), beforeVal: c.beforeVal, afterVal: c.afterVal });
        }
      }

      if(entries.length === 0) return null;
      entries.sort((a, b)=> a.path.join('.').localeCompare(b.path.join('.')));
      return entries;
    }

    function extractDeletedArrayEntries(root){
      // Handles: { deleted: [ {...}, ... ] } by rendering each item as before -> null.
      let obj = root;
      if(typeof obj === 'string') obj = tryParseJson(obj);
      if(!obj) return null;
      if(isPlainObject(obj) && isPlainObject(obj.diff)) obj = obj.diff;
      if(!isPlainObject(obj)) return null;

      const arr = obj.deleted;
      if(!Array.isArray(arr) || arr.length === 0) return null;

      const entries = [];
      for(let i = 0; i < arr.length; i++){
        const item = arr[i];
        if(!isPlainObject(item)) continue;
        const prefix = String(item.ip_address || item.file_name || item.id || (i + 1));
        for(const k of Object.keys(item).sort()){
          entries.push({ path: [prefix, k], beforeVal: item[k], afterVal: null });
        }
      }

      if(entries.length === 0) return null;
      return entries;
    }

    function filterEntriesForContext(tabKey, action, entries){
      const tk = String(tabKey || '').trim();
      if(!Array.isArray(entries) || entries.length === 0) return entries;
      if(tk === 'gov_ip_policy_file'){
        const isDelete = String(action || '').trim().toUpperCase() === 'DELETE';
        const filtered = entries.filter((e)=>{
          const p = Array.isArray(e.path) ? e.path : [];
          const last = p.length ? String(p[p.length - 1]) : '';
          return last === 'file_name';
        });
        if(filtered.length > 0) return filtered;
        const anyName = entries.map((e)=> extractFileNames(e.afterVal).concat(extractFileNames(e.beforeVal))).flat().filter(Boolean);
        const name = anyName.length ? anyName[0] : '';
        return [{ path: ['file_name'], beforeVal: isDelete ? name : null, afterVal: isDelete ? null : name }];
      }
      return entries;
    }

    function renderDiffHtml(obj, ctx){
      const tabKey = ctx && ctx.tabKey ? ctx.tabKey : '';
      const action = ctx && ctx.action ? ctx.action : '';
      const showArrow = String(tabKey || '').trim() !== 'gov_ip_policy_file';

      // 0) IP-range shape: { changed: [ {ip_address,before,after}, ... ] }
      const changedArrayEntries = extractChangedArrayEntries(obj);
      if(changedArrayEntries){
        const entries = filterEntriesForContext(tabKey, action, changedArrayEntries);
        return entries.map((c)=>{
          const key = escapeHtml(displayPath(tabKey, c.path));
          const fieldKey = Array.isArray(c.path) && c.path.length ? String(c.path[c.path.length - 1]) : '';
          const beforeText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.beforeVal));
          const afterText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.afterVal));
          return showArrow
            ? `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-arrow">→</span> <span class="diff-after">${afterText}</span>`
            : `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-after">${afterText}</span>`;
        }).join('\n');
      }

      // 0.5) Deleted-list shape: { deleted: [ {...}, ... ] }
      const deletedArrayEntries = extractDeletedArrayEntries(obj);
      if(deletedArrayEntries){
        const entries = filterEntriesForContext(tabKey, action, deletedArrayEntries);
        return entries.map((c)=>{
          const key = escapeHtml(displayPath(tabKey, c.path));
          const fieldKey = Array.isArray(c.path) && c.path.length ? String(c.path[c.path.length - 1]) : '';
          const beforeText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.beforeVal));
          const afterText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.afterVal));
          return showArrow
            ? `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-arrow">→</span> <span class="diff-after">${afterText}</span>`
            : `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-after">${afterText}</span>`;
        }).join('\n');
      }

      const changeEntries = extractChangesEntries(obj);
      if(changeEntries){
        const entries = filterEntriesForContext(tabKey, action, changeEntries);
        return entries.map((c)=>{
          const key = escapeHtml(displayPath(tabKey, c.path));
          const fieldKey = Array.isArray(c.path) && c.path.length ? String(c.path[c.path.length - 1]) : '';
          const beforeText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.beforeVal));
          const afterText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.afterVal));
          return showArrow
            ? `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-arrow">→</span> <span class="diff-after">${afterText}</span>`
            : `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-after">${afterText}</span>`;
        }).join('\n');
      }

      const extracted = extractBeforeAfter(obj);
      if(extracted){
        const beforeObj = extracted.beforeObj;
        const afterObj = extracted.afterObj;
        const changes = diffBeforeAfter(beforeObj, afterObj).filter((c)=> Array.isArray(c.path) && c.path.length > 0);
        if(changes.length === 0){
          try{ return escapeHtml(JSON.stringify({ before: beforeObj, after: afterObj }, null, 2)); }
          catch(_e){ return escapeHtml(String(obj)); }
        }
        changes.sort((a, b)=> a.path.join('.').localeCompare(b.path.join('.')));
        const entries = filterEntriesForContext(tabKey, action, changes);
        return entries.map((c)=>{
          const key = escapeHtml(displayPath(tabKey, c.path));
          const fieldKey = Array.isArray(c.path) && c.path.length ? String(c.path[c.path.length - 1]) : '';
          const beforeText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.beforeVal));
          const afterText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.afterVal));
          return showArrow
            ? `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-arrow">→</span> <span class="diff-after">${afterText}</span>`
            : `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-after">${afterText}</span>`;
        }).join('\n');
      }

      const afterOnly = extractAfterOnly(obj);
      if(afterOnly){
        const entries = Object.keys(afterOnly).sort().map((k)=> ({ path: [k], beforeVal: null, afterVal: afterOnly[k] }));
        const filtered = filterEntriesForContext(tabKey, action, entries);
        return filtered.map((c)=>{
          const key = escapeHtml(displayPath(tabKey, c.path));
          const fieldKey = Array.isArray(c.path) && c.path.length ? String(c.path[c.path.length - 1]) : '';
          const beforeText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.beforeVal));
          const afterText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.afterVal));
          return showArrow
            ? `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-arrow">→</span> <span class="diff-after">${afterText}</span>`
            : `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-after">${afterText}</span>`;
        }).join('\n');
      }

      const beforeOnly = extractBeforeOnly(obj);
      if(beforeOnly){
        const entries = Object.keys(beforeOnly).sort().map((k)=> ({ path: [k], beforeVal: beforeOnly[k], afterVal: null }));
        const filtered = filterEntriesForContext(tabKey, action, entries);
        return filtered.map((c)=>{
          const key = escapeHtml(displayPath(tabKey, c.path));
          const fieldKey = Array.isArray(c.path) && c.path.length ? String(c.path[c.path.length - 1]) : '';
          const beforeText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.beforeVal));
          const afterText = escapeHtml(formatValueForContext(tabKey, fieldKey, c.afterVal));
          return showArrow
            ? `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-arrow">→</span> <span class="diff-after">${afterText}</span>`
            : `${key}: <span class="diff-before">${beforeText}</span> <span class="diff-after">${afterText}</span>`;
        }).join('\n');
      }

      return null;
    }

    function renderDetailHtml(raw, ctx){
      // Prefer passing structured diff objects (no JSON.parse needed).
      if(raw && typeof raw === 'object'){
        const diffHtml = renderDiffHtml(raw, ctx);
        if(diffHtml != null) return diffHtml;
        try{ return escapeHtml(JSON.stringify(raw, null, 2)); }
        catch(_e){ return escapeHtml(String(raw)); }
      }

      const text = String(raw ?? '');
      if(text.trim() === '') return '';

      const parsed = tryParseJson(text);
      if(parsed){
        const diffHtml = renderDiffHtml(parsed, ctx);
        if(diffHtml != null) return diffHtml;
      }

      const highlightKeyLine = /^\s*"?(after|new|to|after_value|value_after|new_value)"?\s*:/i;

      return text.split('\n').map((line)=>{
        const trimmed = line.trimStart();

        const ctxTabKey = ctx && ctx.tabKey ? String(ctx.tabKey).trim() : '';
        const ctxShowArrow = ctxTabKey !== 'gov_ip_policy_file';

        const arrowMatch = line.match(/^(.*?)(\s*(?:->|=>|→)\s*)(.*)$/);
        if(arrowMatch){
          const left = escapeHtml(arrowMatch[1]);
          const sep = ctxShowArrow ? escapeHtml(arrowMatch[2]) : ' ';
          const right = escapeHtml(arrowMatch[3]);
          return `${left}${sep}<span class="diff-changed">${right}</span>`;
        }

        if(trimmed.startsWith('+') && !trimmed.startsWith('+++')){
          return `<span class="diff-changed">${escapeHtml(line)}</span>`;
        }

        if(highlightKeyLine.test(trimmed)){
          const idx = line.indexOf(':');
          if(idx >= 0){
            const head = escapeHtml(line.slice(0, idx + 1));
            const rawTail = String(line.slice(idx + 1));
            if(rawTail.trim().startsWith('{') || rawTail.trim().startsWith('[')){
              return `${head}${escapeHtml(rawTail)}`;
            }
            const tail = escapeHtml(rawTail);
            return `${head}<span class="diff-changed">${tail}</span>`;
          }
          return `<span class="diff-changed">${escapeHtml(line)}</span>`;
        }

        return escapeHtml(line);
      }).join('\n');
    }

    function setDetailContent(el, raw, ctx){
      if(!el) return;
      const html = renderDetailHtml(raw, ctx);
      if('value' in el){
        el.value = String(raw ?? '');
        return;
      }
      el.innerHTML = html;
    }

    function tabLabel(tabKey){
      const k = String(tabKey || '').trim();
      if(k === 'gov_ip_policy_detail') return '기본정보';
      if(k === 'gov_ip_policy_ip_range') return 'IP 범위';
      if(k === 'gov_ip_policy_file') return '구성/파일';
      if(k === 'gov_ip_policy_log') return '변경이력';
      return k || '-';
    }

    function actionLabel(action){
      const a = String(action || '').trim().toUpperCase();
      if(a === 'CREATE' || a === 'INSERT' || a === 'ADD') return '생성';
      if(a === 'UPDATE' || a === 'EDIT' || a === 'MODIFY') return '수정';
      if(a === 'DELETE' || a === 'REMOVE') return '삭제';
      if(a === 'UPLOAD') return '업로드';
      if(a === 'DOWNLOAD') return '다운로드';
      if(a === 'LOGIN') return '로그인';
      if(a === 'LOGOUT') return '로그아웃';
      return a || '-';
    }

    let activeLogId = null;
    const detailByLogId = new Map();

    if(addBtn){
      addBtn.disabled = true;
      addBtn.style.opacity = '0.5';
      addBtn.title = '변경이력은 자동으로 기록됩니다.';
      addBtn.setAttribute('aria-label', '변경이력은 자동으로 기록됩니다.');
    }

    detailModalClose?.addEventListener('click', ()=> closeModalById('lg-detail-modal'));
    detailSave?.addEventListener('click', ()=> closeModalById('lg-detail-modal'));

    let isSavingReason = false;
    function setReasonSavingState(saving){
      isSavingReason = !!saving;
      if(detailReasonSave){
        detailReasonSave.disabled = !!saving;
        detailReasonSave.setAttribute('aria-disabled', (!!saving).toString());
        detailReasonSave.title = saving ? '저장 중...' : '저장';
      }
    }

    async function saveReason(){
      if(isSavingReason) return;
      if(!Number.isFinite(policyId)){
        try{ openMessageModal('대상 ID가 없습니다.', '변경 사유 저장', { kind: 'error' }); }catch(_e){}
        return;
      }
      const logId = Number(activeLogId);
      if(!Number.isFinite(logId)){
        try{ openMessageModal('먼저 변경이력에서 항목을 열어주세요. (관리 > 보기)', '변경 사유 저장', { kind: 'info' }); }catch(_e){}
        return;
      }
      setReasonSavingState(true);
      const reason = detailReason ? String(detailReason.value || '') : '';
      try{
        const res = await apiRequest(`/api/network/ip-policies/${encodeURIComponent(policyId)}/logs/${encodeURIComponent(logId)}/reason`, {
          method: 'PUT',
          body: JSON.stringify({ reason }),
        });
        const item = res && (res.item || res);
        const reasonSaved = item && typeof item.reason === 'string' ? item.reason : reason;
        if(detailReason) detailReason.value = reasonSaved || '';
        try{
          const row = tbody ? tbody.querySelector(`tr[data-log-id="${String(logId)}"]`) : null;
          if(row) row.dataset.reason = reasonSaved || '';
        }catch(_e){ }
        try{ openMessageModal('저장되었습니다.', '변경 사유 저장', { kind: 'success' }); }catch(_e){}
        return reasonSaved;
      }finally{
        setReasonSavingState(false);
      }
    }

    detailReasonSave?.addEventListener('click', (e)=>{
      e.preventDefault();
      saveReason().catch((err)=>{
        console.error(err);
        const msg = err && err.message ? err.message : '변경 사유 저장 중 오류가 발생했습니다.';
        try{ openMessageModal(msg, '변경 사유 저장 실패', { kind: 'error' }); }catch(_e){ try{ alert(msg); }catch(_e2){} }
      });
    });

    detailReason?.addEventListener('keydown', (e)=>{
      if(e.key !== 'Enter') return;
      e.preventDefault();
      saveReason().catch((err)=>{
        console.error(err);
        const msg = err && err.message ? err.message : '변경 사유 저장 중 오류가 발생했습니다.';
        try{ openMessageModal(msg, '변경 사유 저장 실패', { kind: 'error' }); }catch(_e){ try{ alert(msg); }catch(_e2){} }
      });
    });

    let pageSize = 10;
    let currentPage = 1;
    let totalItems = 0;

    if(pageSizeSel){
      pageSize = parseInt(pageSizeSel.value, 10) || 10;
      pageSizeSel.addEventListener('change', ()=>{
        pageSize = parseInt(pageSizeSel.value, 10) || 10;
        currentPage = 1;
        refreshLogs().catch(()=>{});
      });
    }

    function totalPages(){
      return Math.max(1, Math.ceil((totalItems || 0) / (pageSize || 1)));
    }

    function setDisabled(el, disabled){
      if(!el) return;
      el.disabled = !!disabled;
      if(disabled) el.setAttribute('aria-disabled', 'true');
      else el.removeAttribute('aria-disabled');
    }

    function renderPageButtons(){
      if(!pageNumbers) return;
      pageNumbers.innerHTML = '';

      const tp = totalPages();
      const max = 7;
      let start = Math.max(1, currentPage - Math.floor(max / 2));
      let end = start + max - 1;
      if(end > tp){
        end = tp;
        start = Math.max(1, end - max + 1);
      }
      for(let p = start; p <= end; p++){
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'page-btn' + (p === currentPage ? ' active' : '');
        b.textContent = String(p);
        b.addEventListener('click', ()=>{
          if(p === currentPage) return;
          currentPage = p;
          refreshLogs().catch(()=>{});
        });
        pageNumbers.appendChild(b);
      }
    }

    function updatePaginationUI(itemsOnPage){
      const tp = totalPages();
      if(currentPage > tp) currentPage = tp;

      setDisabled(btnFirst, currentPage <= 1 || totalItems <= 0);
      setDisabled(btnPrev, currentPage <= 1 || totalItems <= 0);
      setDisabled(btnNext, currentPage >= tp || totalItems <= 0);
      setDisabled(btnLast, currentPage >= tp || totalItems <= 0);

      if(paginationInfo){
        const start = totalItems ? ((currentPage - 1) * pageSize + 1) : 0;
        const end = totalItems ? Math.min((currentPage - 1) * pageSize + (itemsOnPage || 0), totalItems) : 0;
        paginationInfo.textContent = `${start}-${end} / ${totalItems}개 항목`;
      }
      renderPageButtons();
    }

    btnFirst?.addEventListener('click', ()=>{
      if(currentPage <= 1) return;
      currentPage = 1;
      refreshLogs().catch(()=>{});
    });
    btnPrev?.addEventListener('click', ()=>{
      if(currentPage <= 1) return;
      currentPage = Math.max(1, currentPage - 1);
      refreshLogs().catch(()=>{});
    });
    btnNext?.addEventListener('click', ()=>{
      const tp = totalPages();
      if(currentPage >= tp) return;
      currentPage = Math.min(tp, currentPage + 1);
      refreshLogs().catch(()=>{});
    });
    btnLast?.addEventListener('click', ()=>{
      const tp = totalPages();
      if(currentPage >= tp) return;
      currentPage = tp;
      refreshLogs().catch(()=>{});
    });

    async function refreshHeader(){
      if(!Number.isFinite(policyId)){
        setText('page-header-title', '\u00A0');
        setText('page-header-subtitle', '대상 ID가 없습니다. 목록에서 항목을 선택하세요.');
        return;
      }
      try{
        const data = await apiRequest(`/api/network/ip-policies/${encodeURIComponent(policyId)}`, { method: 'GET' });
        const record = data && data.item ? data.item : data;
        const title = (record && record.start_ip)
          ? `${record.start_ip} ~ ${record.end_ip || ''}`.trim()
          : '\u00A0';
        const subtitle = (record && record.role)
          ? record.role
          : ((record && (record.location || record.center_code))
            ? (record.location || record.center_code)
            : '-');
        setText('page-header-title', title);
        setText('page-header-subtitle', subtitle);
      }catch(err){
        setText('page-header-title', '\u00A0');
        setText('page-header-subtitle', err && err.message ? err.message : 'IP 조회 실패');
      }
    }

    function render(items){
      if(!tbody) return;
      tbody.innerHTML = '';
      detailByLogId.clear();

      if(!items || items.length === 0){
        if(emptyEl) emptyEl.style.display = '';
        return;
      }
      if(emptyEl) emptyEl.style.display = 'none';

      for(const it of items){
        const diffText = it.diff ? JSON.stringify(it.diff, null, 2) : '';
        const msg = normalizeLogMessage(it);
        const actionRaw = String(it.action || '').trim();
        const actionKey = actionRaw ? actionRaw.toUpperCase() : '';
        const tr = document.createElement('tr');
        tr.dataset.logId = String(it.log_id);
        tr.dataset.reason = String(it.reason || '');
        tr.dataset.tabKey = String(it.tab_key || '');
        tr.dataset.action = actionKey;
        tr.innerHTML = `
          <td><input type="checkbox" class="lg-row" data-id="${escapeHtml(it.log_id)}" aria-label="선택"></td>
          <td>${escapeHtml(it.created_at || '-')}</td>
          <td class="lg-action-cell"><span class="lg-action-label">${escapeHtml(actionLabel(actionRaw))}</span></td>
          <td>${escapeHtml(it.actor || '-')}</td>
          <td>${escapeHtml(tabLabel(it.tab_key))}</td>
          <td>${escapeHtml(msg)}</td>
          <td class="system-actions">
            <button type="button" class="action-btn" data-action="edit" data-id="${escapeHtml(it.log_id)}" title="보기" aria-label="보기">
              <img src="/static/image/svg/free-icon-assessment.svg" alt="보기" class="action-icon">
            </button>
          </td>
        `;
        detailByLogId.set(String(it.log_id), it && it.diff ? it.diff : (diffText || msg));
        tr.dataset.detail = diffText || msg;
        tbody.appendChild(tr);
      }

      // Keep select-all + row highlight consistent after re-render.
      savedVisibleRows().forEach((tr) => {
        const cb = tr.querySelector('input.lg-row');
        syncRowSelectedState(tr, cb && cb.checked);
      });
      syncSelectAllState();
    }

    // Select-all toggles all rows on the current page.
    selectAll?.addEventListener('change', ()=>{
      if(!table) return;
      const checks = Array.from(table.querySelectorAll('tbody .lg-row'));
      const next = !!selectAll.checked;
      for(const cb of checks){
        cb.checked = next;
        const tr = cb.closest('tr');
        syncRowSelectedState(tr, next);
      }
      syncSelectAllState();
    });

    // Row click toggles selection (except when clicking buttons/inputs etc).
    table?.addEventListener('click', (ev)=>{
      if(!tbody) return;
      const tr = ev.target && ev.target.closest ? ev.target.closest('tr') : null;
      if(!tr || !tr.parentNode || tr.parentNode !== tbody) return;

      const isControl = ev.target && ev.target.closest
        ? ev.target.closest('button, a, input, select, textarea, label')
        : null;
      const onCheckbox = ev.target && ev.target.closest ? ev.target.closest('input.lg-row') : null;
      const onActionBtn = ev.target && ev.target.closest ? ev.target.closest('button.action-btn') : null;
      if(onActionBtn) return;
      if(isControl && !onCheckbox) return;
      if(onCheckbox) return;

      const cb = tr.querySelector('input.lg-row');
      if(!cb) return;
      cb.checked = !cb.checked;
      syncRowSelectedState(tr, cb.checked);
      syncSelectAllState();
    });

    // Direct checkbox changes should update row highlight + select-all.
    table?.addEventListener('change', (ev)=>{
      const cb = ev.target && ev.target.closest ? ev.target.closest('input.lg-row') : null;
      if(!cb) return;
      const tr = cb.closest('tr');
      syncRowSelectedState(tr, cb.checked);
      syncSelectAllState();
    });

    async function refreshLogs(){
      if(!Number.isFinite(policyId)){
        render([]);
        totalItems = 0;
        currentPage = 1;
        updatePaginationUI(0);
        return;
      }
      const data = await apiRequest(`/api/network/ip-policies/${encodeURIComponent(policyId)}/logs?page=${encodeURIComponent(currentPage)}&page_size=${encodeURIComponent(pageSize)}`, { method: 'GET' });
      const items = Array.isArray(data.items) ? data.items : [];
      totalItems = (data && Number.isFinite(parseInt(data.total, 10))) ? parseInt(data.total, 10) : 0;
      const serverPage = (data && Number.isFinite(parseInt(data.page, 10))) ? parseInt(data.page, 10) : currentPage;
      const tp = Math.max(1, Math.ceil((totalItems || 0) / (pageSize || 1)));
      currentPage = Math.min(Math.max(1, serverPage), tp);
      render(items);
      updatePaginationUI(items.length);
      updateDownloadButtonState();
    }

    downloadBtn?.addEventListener('click', async (e)=>{
      e.preventDefault();
      if(!Number.isFinite(policyId)) return;
      if(!tbody) return;

      const mode = selectionMode();
      const pickedIds = (mode === 'selected') ? selectedLogIdsOnPage() : [];
      try{
        downloadBtn.disabled = true;
        downloadBtn.title = 'CSV를 준비 중입니다...';

        let items = await fetchAllLogsForCsv(policyId);
        if(mode === 'selected' && Array.isArray(items) && pickedIds.length){
          const pickedSet = new Set(pickedIds);
          items = items.filter((it)=> pickedSet.has(String(it && it.log_id)));
        }

        if(!items || items.length === 0){
          try{ openMessageModal('CSV 내보낼 항목이 없습니다.', 'CSV 다운로드', { kind: 'info' }); }catch(_e){}
          return;
        }

        const csv = buildLogsCsv(items);
        const today = new Date().toISOString().slice(0, 10);
        downloadTextAsFile(`ip_policy_logs_${policyId}_${today}.csv`, csv, 'text/csv;charset=utf-8;');
        try{ openMessageModal('CSV 파일이 다운로드되었습니다.', 'CSV 다운로드', { kind: 'success' }); }catch(_e){}
      }catch(err){
        const msg = err && err.message ? String(err.message) : 'CSV 다운로드 중 오류가 발생했습니다.';
        try{ openMessageModal(msg, 'CSV 다운로드 실패', { kind: 'error' }); }catch(_e){ alert(msg); }
      }finally{
        updateDownloadButtonState();
      }
    });

    tbody?.addEventListener('click', (e)=>{
      const btn = e.target && e.target.closest ? e.target.closest('button[data-action="edit"]') : null;
      if(!btn) return;
      const row = btn.closest('tr');

       // UX: when opening detail, clear other selections and keep only this row selected.
      try{ selectOnlyLogRow(row); }catch(_e){}

      activeLogId = btn.getAttribute('data-id') || (row ? row.dataset.logId : null);
      const logId = activeLogId != null ? String(activeLogId) : '';
      const detail = detailByLogId.has(logId)
        ? detailByLogId.get(logId)
        : (row ? (row.dataset.detail || '') : '');
      const ctx = {
        tabKey: row ? (row.dataset.tabKey || '') : '',
        action: row ? (row.dataset.action || '') : '',
      };
      setDetailContent(detailText, detail, ctx);
      if(detailReason) detailReason.value = row ? (row.dataset.reason || '') : '';
      openModalById('lg-detail-modal');
    });

    updateDownloadButtonState();
    refreshHeader().then(()=> refreshLogs()).catch((err)=> console.error(err));
  }

  function _initIpPolicyTabs(){
    try{ initIpPolicyFileTab(); }catch(err){ console.error(err); }
    try{ initIpPolicyLogTab(); }catch(err){ console.error(err); }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _initIpPolicyTabs);
  } else {
    _initIpPolicyTabs();
  }
  // SPA partial-navigation support
  document.addEventListener('blossom:pageLoaded', _initIpPolicyTabs);

  async function fetchAllIpRangeItemsForStats(policyId){
    // Uses the same backend data as the IP 범위 tab.
    let page = 1;
    const requestedPageSize = 500;
    const all = [];
    let lastPage = 1;

    while(page <= lastPage){
      const data = await apiRequest(`/api/network/ip-policies/${policyId}/addresses?page=${page}&page_size=${requestedPageSize}`, { method: 'GET' });
      const total = data.total || 0;
      const currentSize = data.page_size || requestedPageSize;
      lastPage = Math.max(1, Math.ceil(total / currentSize));

      const items = data.items || [];
      for(const it of items) all.push(it);
      page += 1;
    }
    return all;
  }

  function initIpStatusStatsCard(policyId){
    const statsWrap = document.getElementById('ip-status-stats');
    const pie = document.getElementById('ip-status-pie');
    const legend = document.getElementById('ip-status-legend');
    const totalEl = document.getElementById('ip-status-total');
    const emptyEl = document.getElementById('ip-status-empty');
    if(!statsWrap || !pie || !legend) return;

    const statuses = [
      { key: '활성', color: '#6366F1', seg: 'seg1' },
      { key: '예약', color: '#F59E0B', seg: 'seg2' },
      { key: '미사용', color: '#6b7280', seg: 'seg3' },
      { key: 'DHCP', color: '#0EA5E9', seg: 'seg4' },
      { key: 'SLAAC', color: '#A855F7', seg: 'seg5' },
    ];

    // Expose colors to legend dots via CSS variables.
    statuses.forEach((s, idx) => {
      statsWrap.style.setProperty(`--seg${idx + 1}`, s.color);
    });

    const toDeg = (n) => Math.max(0, Math.min(360, n));
    const pctText = (count, total) => {
      if(!total) return '0%';
      const p = Math.round((count / total) * 100);
      return `${p}%`;
    };

    const renderLegend = (counts, total) => {
      legend.innerHTML = '';
      statuses.forEach((s) => {
        const count = counts[s.key] || 0;
        const li = document.createElement('li');
        li.className = 'legend-item';

        const dot = document.createElement('span');
        dot.className = `legend-dot ${s.seg}`;
        dot.setAttribute('aria-hidden', 'true');

        const host = document.createElement('span');
        host.className = 'legend-host';
        host.textContent = s.key;

        const size = document.createElement('span');
        size.className = 'legend-size';
        size.textContent = `${count} (${pctText(count, total)})`;

        li.appendChild(dot);
        li.appendChild(host);
        li.appendChild(size);
        legend.appendChild(li);
      });
    };

    const renderPie = (counts, total) => {
      if(totalEl) totalEl.textContent = String(total || 0);
      if(!total){
        statsWrap.style.display = 'none';
        if(emptyEl){ emptyEl.hidden = false; try{ showNoDataImage(emptyEl, '상태 데이터가 없습니다.'); }catch(_e){} }
        return;
      }

      statsWrap.style.display = '';
      if(emptyEl){ emptyEl.hidden = true; }

      let start = 0;
      const parts = [];

      statuses.forEach((s, idx) => {
        const count = counts[s.key] || 0;
        const isLast = idx === statuses.length - 1;
        const raw = (count / total) * 360;
        const end = isLast ? 360 : toDeg(start + raw);
        parts.push(`${s.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`);
        start = end;
      });

      pie.style.background = `conic-gradient(${parts.join(', ')})`;
      renderLegend(counts, total);
    };

    // Loading placeholder
    pie.style.background = 'conic-gradient(#e5e7eb 0 360deg)';
    legend.innerHTML = '';
    if(emptyEl) emptyEl.hidden = true;
    if(totalEl) totalEl.textContent = '...';

    fetchAllIpRangeItemsForStats(policyId)
      .then((items) => {
        const counts = {};
        statuses.forEach((s) => { counts[s.key] = 0; });

        (items || []).forEach((it) => {
          const raw = it && it.status ? String(it.status).trim() : '';
          if(raw && Object.prototype.hasOwnProperty.call(counts, raw)) counts[raw] += 1;
          else if(raw === '') counts['미사용'] += 0;
        });

        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        renderPie(counts, total);
      })
      .catch(() => {
        statsWrap.style.display = 'none';
        if(emptyEl){ emptyEl.hidden = false; try{ showNoDataImage(emptyEl, '상태 데이터가 없습니다.'); }catch(_e){} }
        if(totalEl) totalEl.textContent = '0';
      });
  }

  function setText(id, value){
    const el = document.getElementById(id);
    if(!el) return;
    const v = (value == null || String(value).trim() === '') ? '-' : String(value);
    el.textContent = v;
  }

  // ---------------------------
  // IP Range tab (tab51) logic
  // - Previously loaded via tab51-ip_range.js
  // ---------------------------

  function initIpRangeTab(){
    const tbody = document.getElementById('ip-range-table-body');
    if(!tbody) return; // not on IP range page

    const table = document.getElementById('ip-range-table');
    const downloadBtn = document.getElementById('ip-range-download-btn');
    const selectAllEl = document.getElementById('ip-range-select-all');

    const EDIT_ICON_SRC = '/static/image/svg/list/free-icon-pencil.svg';
    const SAVE_ICON_SRC = '/static/image/svg/save.svg';

    const STATUS_OPTIONS = ['활성', '예약', '미사용', 'DHCP', 'SLAAC'];
    const ROLE_OPTIONS = ['Loopback', 'Primary', 'Secondary', 'Anycast', 'VIP', 'VRRP', 'HSRP', 'GLBP', 'CARP'];

    const API_ADDR = (policyId) => `/api/network/ip-policies/${policyId}/addresses`;
    const API_DNS_DOMAIN_SUGGEST = '/api/network/dns-policies/suggest-domains';
    const API_DNS_LOOKUP_BY_IPS = '/api/network/dns-records/lookup-by-ips';
    const API_HW_SYSTEM_SUGGEST = '/api/hardware-assets/suggest-work-systems';

    const DEFAULT_PAGE_SIZE = 10;

    let dnsDomainCache = [];
    let systemNameCache = [];

    // Row selection (for CSV export)
    const selectedIps = new Set();
    const itemCacheByIp = new Map();

    // Note: DNS/시스템은 "상태"와 동일한 native select UI로 통일한다.

    function qsEl(sel, root){
      return (root || document).querySelector(sel);
    }
    function qsaEl(sel, root){
      return Array.from((root || document).querySelectorAll(sel));
    }

    function setDisabled(el, disabled){
      if(!el) return;
      el.disabled = !!disabled;
      el.setAttribute('aria-disabled', (!!disabled).toString());
    }

    function updateDownloadButtonState(){
      if(!downloadBtn) return;
      const hasRows = !!tbody.querySelector('tr');
      setDisabled(downloadBtn, !hasRows);
      downloadBtn.title = hasRows ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
    }

    function updateSelectAllState(){
      if(!selectAllEl) return;
      const boxes = qsaEl('input.ip-range-row-check', tbody);
      if(!boxes.length){
        selectAllEl.checked = false;
        selectAllEl.indeterminate = false;
        return;
      }
      const checkedCount = boxes.reduce((acc, b) => acc + (b.checked ? 1 : 0), 0);
      selectAllEl.checked = checkedCount === boxes.length;
      selectAllEl.indeterminate = checkedCount > 0 && checkedCount < boxes.length;
    }

    function syncRowSelectedState(tr, selected){
      if(!tr) return;
      tr.classList.toggle('selected', !!selected);
      try{ tr.setAttribute('aria-selected', (!!selected).toString()); }catch(_e){}
    }

    function clearIpRangeSelection(){
      selectedIps.clear();
      qsaEl('input.ip-range-row-check', tbody).forEach((cb) => {
        cb.checked = false;
        const tr = cb.closest ? cb.closest('tr[data-ip]') : null;
        syncRowSelectedState(tr, false);
      });
      updateSelectAllState();
    }

    function selectOnlyIpRangeRow(tr){
      if(!tr) return;
      clearIpRangeSelection();
      const cb = tr.querySelector('input.ip-range-row-check');
      if(!cb) return;
      cb.checked = true;
      const ip = cb.dataset.ip || '';
      if(ip) selectedIps.add(ip);
      syncRowSelectedState(tr, true);
      updateSelectAllState();
    }

    function syncRowCacheFromDom(tr){
      if(!tr) return;
      const ip = tr.dataset.ip;
      if(!ip) return;
      try{
        itemCacheByIp.set(ip, readRowItem(tr));
      }catch(_e){}
    }

    async function getItemsForCsv(policyId){
      const pickedIps = Array.from(selectedIps);
      if(!pickedIps.length) return await fetchAllIpRangeItems(policyId);

      // Refresh cached items for any visible rows before exporting.
      qsaEl('tr[data-ip]', tbody).forEach(syncRowCacheFromDom);

      let missing = 0;
      const pickedItems = [];
      for(const ip of pickedIps){
        const it = itemCacheByIp.get(ip);
        if(it) pickedItems.push(it);
        else missing += 1;
      }

      if(missing > 0){
        const all = await fetchAllIpRangeItems(policyId);
        for(const it of (all || [])){
          if(it && it.ip_address) itemCacheByIp.set(String(it.ip_address), it);
        }
        return pickedIps.map((ip) => itemCacheByIp.get(ip)).filter(Boolean);
      }

      return pickedItems;
    }

    function csvEscape(value){
      const s = String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const needsQuotes = /[",\n]/.test(s);
      const escaped = s.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    }

    function extractCellValue(td){
      if(!td) return '';

      // Skip action column.
      if(td.classList.contains('system-actions') || td.dataset.col === 'actions' || td.dataset.label === '관리') return '';

      const input = td.querySelector('input, textarea');
      if(input) return (input.value ?? '').trim();

      const select = td.querySelector('select');
      if(select){
        const opt = select.options && select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
        const text = opt ? (opt.textContent ?? opt.value ?? '') : (select.value ?? '');
        return String(text ?? '').trim();
      }

      const display = td.querySelector('.ip-range-display');
      if(display) return (display.textContent ?? '').trim();

      return (td.textContent ?? '').trim();
    }

    function buildCsvFromTable(){
      const table = document.getElementById('ip-range-table');
      if(!table) return null;

      const headers = Array.from(table.querySelectorAll('thead th'))
        .map((th) => (th.textContent ?? '').trim())
        .filter((h) => h && h !== '관리');

      const rows = Array.from(tbody.querySelectorAll('tr'));

      let csv = '\uFEFF';
      csv += headers.map(csvEscape).join(',') + '\n';

      for(const tr of rows){
        const cells = Array.from(tr.querySelectorAll('td'));
        const values = cells
          .map(extractCellValue)
          .filter((v) => v !== '');
        csv += values.map(csvEscape).join(',') + '\n';
      }

      return csv;
    }

    function buildCsvFromItems(items){
      const headers = ['주소', '상태', '역할', 'DNS', '시스템', '포트', '비고'];
      let csv = '\uFEFF';
      csv += headers.map(csvEscape).join(',') + '\n';

      const rows = Array.isArray(items) ? items : [];
      for(const item of rows){
        const values = [
          item && item.ip_address,
          item && item.status,
          item && item.role,
          item && item.dns_domain,
          item && item.system_name,
          item && item.port,
          item && item.note,
        ];
        csv += values.map(csvEscape).join(',') + '\n';
      }
      return csv;
    }

    async function fetchAllIpRangeItems(policyId){
      // Fetch all pages so CSV contains ALL rows, not just the current UI page.
      // Use a larger page size for fewer round-trips; backend may clamp it.
      let page = 1;
      const requestedPageSize = 500;
      const all = [];
      let lastPage = 1;

      while(page <= lastPage){
        const data = await fetchJson(`${API_ADDR(policyId)}?page=${page}&page_size=${requestedPageSize}`, { method: 'GET' });
        const total = data.total || 0;
        const currentSize = data.page_size || requestedPageSize;
        lastPage = Math.max(1, Math.ceil(total / currentSize));

        const items = data.items || [];
        for(const it of items) all.push(it);
        page += 1;
      }

      return all;
    }

    function downloadTextAsFile(filename, content, mimeType){
      const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    function getPolicyId(){
      const idRaw = qs('id') || govDetailId();
      const n = idRaw ? parseInt(idRaw, 10) : NaN;
      return Number.isFinite(n) ? n : null;
    }

    async function fetchJson(url, options){
      return apiRequest(url, options || { method: 'GET' });
    }

    function setActionButtonMode(btn, mode){
      if(!btn) return;
      const img = btn.querySelector('img');
      if(mode === 'save'){
        btn.dataset.action = 'save';
        btn.title = '저장';
        btn.setAttribute('aria-label', '저장');
        if(img){ img.src = SAVE_ICON_SRC; img.alt = '저장'; }
        return;
      }
      btn.dataset.action = 'edit';
      btn.title = '수정';
      btn.setAttribute('aria-label', '수정');
      if(img){ img.src = EDIT_ICON_SRC; img.alt = '수정'; }
    }

    function setRowEditable(tr, editable){
      if(!tr) return;
      tr.dataset.editing = editable ? '1' : '0';
      qsaEl('[data-field]', tr).forEach((el) => {
        if(el.dataset.locked === '1') return; // 상태/시스템/포트 잠금
        el.disabled = !editable;
      });
      if(!editable){
        try { window.BlossomSearchableSelect?.close?.(null); } catch(_e) {}
      }
    }

    function displayText(value){
      const t = value == null ? '' : String(value).trim();
      return t === '' ? '-' : t;
    }

    function createDisplaySpan(field, value){
      const span = document.createElement('span');
      span.className = 'ip-range-display';
      span.dataset.displayFor = field;
      span.textContent = displayText(value);
      return span;
    }

    function syncRowDisplay(tr){
      if(!tr) return;
      qsaEl('.ip-range-display[data-display-for]', tr).forEach((span) => {
        const field = span.dataset.displayFor;
        const input = tr.querySelector(`[data-field="${field}"]`);
        if(!input){ span.textContent = '-'; return; }
        var raw = String(input.value || '').trim();
        // For system_name, display work_name from cache when available.
        if(field === 'system_name' && raw && systemNameCache.length && typeof systemNameCache[0] === 'object'){
          var found = systemNameCache.find(function(p){ return String(p.system_name || '').trim() === raw; });
          if(found && found.work_name && found.work_name !== raw){ span.textContent = found.work_name; return; }
        }
        span.textContent = displayText(raw);
      });

      // Keep status dot color in sync with the current status value.
      const statusTd = tr.querySelector('td.ip-range-status-cell');
      if(statusTd){
        const statusSel = tr.querySelector('select[data-field="status"]');
        statusTd.dataset.status = statusSel ? String(statusSel.value || '').trim() : '';
      }
    }

    function lockOtherRows(exceptTr){
      qsaEl('tr[data-ip][data-editing="1"]', tbody).forEach((tr) => {
        if(exceptTr && tr === exceptTr) return;
        setRowEditable(tr, false);
        const b = tr.querySelector('.action-btn[data-action]');
        if(b) setActionButtonMode(b, 'edit');
      });
    }

    function renderActionsCell(){
      const td = document.createElement('td');
      td.className = 'system-actions';
      td.dataset.col = 'actions';
      td.dataset.label = '관리';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'action-btn';
      btn.dataset.action = 'edit';
      btn.title = '수정';
      btn.setAttribute('aria-label', '수정');

      const img = document.createElement('img');
      img.src = EDIT_ICON_SRC;
      img.alt = '수정';
      img.className = 'action-icon';

      btn.appendChild(img);
      td.appendChild(btn);
      return td;
    }

    function setSelectOptions(select, items, currentValue){
      if(!select) return;
      // system_name uses work-system pairs (objects)
      if(select.dataset.field === 'system_name' && items.length && typeof items[0] === 'object'){
        setSystemSelectOptions(select, items, currentValue);
        return;
      }
      const current = (currentValue == null ? (select.value || '') : currentValue) || '';

      const uniq = [];
      const seen = new Set();
      const add = (raw) => {
        const v = raw == null ? '' : String(raw).trim();
        if(!v) return;
        const key = v.toLowerCase();
        if(seen.has(key)) return;
        seen.add(key);
        uniq.push(v);
      };

      add(current);
      (items || []).forEach(add);

      select.innerHTML = '';
      select.appendChild(new Option('-', '', !current, !current));
      uniq.forEach((v) => select.appendChild(new Option(v, v, v === current, v === current)));
      if(current) select.value = current;
    }

    function setSystemSelectOptions(select, pairs, currentValue){
      if(!select) return;
      var current = (currentValue == null ? (select.value || '') : currentValue) || '';
      current = String(current).trim();
      select.innerHTML = '';
      select.appendChild(new Option('-', '', !current, !current));
      var seen = new Set();
      var addPair = function(p){
        var sn = String(p.system_name || '').trim();
        var wn = String(p.work_name || '').trim();
        if(!sn) return;
        var key = sn.toLowerCase();
        if(seen.has(key)) return;
        seen.add(key);
        var label = (wn && wn !== sn) ? wn + ' (' + sn + ')' : sn;
        var opt = new Option(label, sn, sn === current, sn === current);
        if(wn && wn !== sn){
          opt.setAttribute('data-display-label', wn);
          opt.setAttribute('data-search-text', wn + ' ' + sn);
        }
        select.appendChild(opt);
      };
      // Ensure current value appears first.
      if(current){
        var match = (pairs || []).find(function(p){ return String(p.system_name || '').trim() === current; });
        if(match){
          addPair(match);
        } else {
          seen.add(current.toLowerCase());
          select.appendChild(new Option(current, current, true, true));
        }
      }
      (pairs || []).forEach(addPair);
      if(current) select.value = current;
    }

    function syncSearchableSelects(root){
      try{
        window.BlossomSearchableSelect?.syncAll?.(root || document);
        return true;
      }catch(_e){
        return false;
      }
    }

    function syncSearchableSelectsSoon(root){
      // If this table doesn't contain searchable selects, do nothing.
      const scope = root || document;
      if(!scope || !scope.querySelector || !scope.querySelector('select.search-select')) return;

      const ok = syncSearchableSelects(root);
      if(ok) return;
      setTimeout(() => syncSearchableSelects(root), 0);
      setTimeout(() => syncSearchableSelects(root), 120);
      setTimeout(() => syncSearchableSelects(root), 300);
    }

    function syncFieldSelects(field, items){
      qsaEl(`select[data-field="${field}"]`, tbody).forEach((sel) => {
        setSelectOptions(sel, items, sel.value || '');
        try{ window.BlossomSearchableSelect?.sync?.(sel); }catch(_e){}
      });
      syncSearchableSelectsSoon(tbody);
      // Update read-only display spans for system_name with work_name.
      if(field === 'system_name' && items.length && typeof items[0] === 'object'){
        qsaEl('span.ip-range-display[data-display-for="system_name"]', tbody).forEach(function(span){
          var raw = span.textContent.trim();
          if(!raw || raw === '-') return;
          var p = items.find(function(it){ return String(it.system_name || '').trim() === raw; });
          if(p && p.work_name && p.work_name !== raw) span.textContent = p.work_name;
        });
      }
    }

    // ---------------------------
    // Native select + searchable dropdown panel
    // - DOES NOT change select styling (keeps select.form-input)
    // - Only replaces the open behavior with a searchable panel
    // ---------------------------

    let activeNativeSearchPanel = null;

    function closeNativeSearchDropdown(){
      if(!activeNativeSearchPanel) return;
      const state = activeNativeSearchPanel;
      activeNativeSearchPanel = null;
      try{
        if(state.handleOutside) document.removeEventListener('pointerdown', state.handleOutside, true);
        if(state.handleKeydown) document.removeEventListener('keydown', state.handleKeydown, true);
        if(state.handleResize) window.removeEventListener('resize', state.handleResize);
        if(state.handleScroll) window.removeEventListener('scroll', state.handleScroll, true);
      }catch(_e){}
      try{
        if(state.panel && state.panel.parentNode) state.panel.parentNode.removeChild(state.panel);
      }catch(_e){}
    }

    function buildNativeSearchOptions(select, placeholder){
      const options = [];
      Array.from(select.options || []).forEach((opt) => {
        const rawLabel = (opt.textContent || '').trim();
        const value = opt.value || '';
        const label = (rawLabel || value || placeholder).trim();
        options.push({
          value,
          label,
          searchLabel: label.toLowerCase(),
          valueLower: value.toLowerCase(),
        });
      });
      return options;
    }

    function positionNativeSearchPanel(state){
      const rect = state.anchor.getBoundingClientRect();
      const panel = state.panel;

      const margin = 6;
      const preferredLeft = Math.max(margin, Math.min(rect.left, window.innerWidth - margin));
      const preferredWidth = Math.max(220, rect.width);

      panel.style.left = preferredLeft + 'px';
      panel.style.minWidth = preferredWidth + 'px';
      panel.style.maxWidth = Math.max(preferredWidth, 260) + 'px';

      const panelRect = panel.getBoundingClientRect();
      let top = rect.bottom + margin;
      if(top + panelRect.height > window.innerHeight - margin){
        const aboveTop = rect.top - margin - panelRect.height;
        if(aboveTop >= margin) top = aboveTop;
      }

      const maxLeft = window.innerWidth - margin - panelRect.width;
      const left = Math.max(margin, Math.min(preferredLeft, maxLeft));

      panel.style.top = Math.round(top) + 'px';
      panel.style.left = Math.round(left) + 'px';
    }

    function renderNativeSearchPanelOptions(state){
      state.list.innerHTML = '';
      state.itemButtons = [];

      const currentValue = state.select.value || '';
      if(!state.filtered.length){
        state.empty.hidden = false;
        state.focusIndex = -1;
        return;
      }
      state.empty.hidden = true;

      state.filtered.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fk-search-panel__item fk-search-panel__option';
        btn.setAttribute('role', 'option');
        btn.dataset.index = String(idx);
        btn.dataset.value = opt.value;
        btn.textContent = opt.label;

        const selected = opt.value === currentValue;
        btn.setAttribute('aria-selected', selected ? 'true' : 'false');
        if(selected) btn.classList.add('selected', 'is-selected');

        btn.addEventListener('click', (event) => {
          event.preventDefault();
          const current = state.select.value || '';
          const next = (opt.value === current && current !== '') ? '' : opt.value;
          state.select.value = next;
          state.select.dispatchEvent(new Event('change', { bubbles:true }));
          closeNativeSearchDropdown();
        });

        state.list.appendChild(btn);
        state.itemButtons.push(btn);
      });
    }

    function setNativeFocusIndex(state, nextIndex){
      const max = state.filtered.length - 1;
      if(max < 0){
        state.focusIndex = -1;
        return;
      }
      const clamped = Math.max(0, Math.min(nextIndex, max));
      state.focusIndex = clamped;
      state.itemButtons.forEach((btn, idx) => {
        const isActive = idx === clamped;
        btn.classList.toggle('active', isActive);
        btn.classList.toggle('is-active', isActive);
      });
      const activeBtn = state.itemButtons[clamped];
      if(activeBtn) activeBtn.scrollIntoView({ block:'nearest' });
    }

    function filterNativeSearchPanelOptions(state){
      const q = (state.input.value || '').trim().toLowerCase();
      if(!q){
        state.filtered = state.options.slice();
      }else{
        state.filtered = state.options.filter((opt) => opt.searchLabel.includes(q) || opt.valueLower.includes(q));
      }
      state.focusIndex = -1;
      renderNativeSearchPanelOptions(state);
    }

    function updateNativePanelOptionsFromSelect(state){
      state.options = buildNativeSearchOptions(state.select, state.placeholder);
      filterNativeSearchPanelOptions(state);
    }

    function requestRemoteSuggestions(field, queryText){
      if(field === 'dns_domain') return refreshDnsDomains(queryText);
      if(field === 'system_name') return refreshSystemNames(queryText);
      return Promise.resolve();
    }

    function openNativeSearchDropdown(select){
      if(!(select instanceof HTMLSelectElement)) return;
      if(select.disabled) return;
      closeNativeSearchDropdown();

      const placeholder = (select.getAttribute('data-placeholder') || (select.dataset ? select.dataset.placeholder : '') || '-');
      const field = (select.dataset && select.dataset.field) ? String(select.dataset.field) : '';

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
      closeBtn.setAttribute('aria-label', '닫기');
      closeBtn.title = '닫기';
      closeBtn.textContent = '닫기';

      panel.classList.add('fk-search-panel--text-close');

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

      const state = {
        select,
        anchor: select,
        panel,
        input,
        closeBtn,
        list,
        empty,
        placeholder,
        field,
        options: [],
        filtered: [],
        focusIndex: -1,
        itemButtons: [],
        handleOutside: null,
        handleKeydown: null,
        handleResize: null,
        handleScroll: null,
      };
      activeNativeSearchPanel = state;

      updateNativePanelOptionsFromSelect(state);
      positionNativeSearchPanel(state);
      setTimeout(() => input.focus(), 0);

      closeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        closeNativeSearchDropdown();
      });

      // Local filtering + optional remote suggestions (DNS/시스템)
      let remoteTimer = null;
      const scheduleRemote = (q) => {
        if(!(field === 'dns_domain' || field === 'system_name')) return;
        clearTimeout(remoteTimer);
        remoteTimer = setTimeout(() => {
          requestRemoteSuggestions(field, q).then(() => {
            if(activeNativeSearchPanel !== state) return;
            updateNativePanelOptionsFromSelect(state);
            positionNativeSearchPanel(state);
          }).catch(() => {});
        }, 180);
      };

      input.addEventListener('input', () => {
        filterNativeSearchPanelOptions(state);
        scheduleRemote(String(input.value || ''));
      });

      // Initial remote load when opening (so it feels like the image)
      scheduleRemote('');

      input.addEventListener('keydown', (event) => {
        if(event.key === 'ArrowDown'){
          event.preventDefault();
          if(state.filtered.length) setNativeFocusIndex(state, state.focusIndex < 0 ? 0 : state.focusIndex + 1);
          return;
        }
        if(event.key === 'ArrowUp'){
          event.preventDefault();
          if(state.filtered.length) setNativeFocusIndex(state, state.focusIndex < 0 ? state.filtered.length - 1 : state.focusIndex - 1);
          return;
        }
        if(event.key === 'Enter'){
          if(state.focusIndex >= 0 && state.focusIndex < state.filtered.length){
            event.preventDefault();
            const picked = state.filtered[state.focusIndex];
            const current = state.select.value || '';
            const next = (picked.value === current && current !== '') ? '' : picked.value;
            state.select.value = next;
            state.select.dispatchEvent(new Event('change', { bubbles:true }));
            closeNativeSearchDropdown();
          }
        }
      });

      state.handleOutside = (event) => {
        if(panel.contains(event.target) || select.contains(event.target)) return;
        closeNativeSearchDropdown();
      };
      document.addEventListener('pointerdown', state.handleOutside, true);

      state.handleKeydown = (event) => {
        if(event.key === 'Escape') closeNativeSearchDropdown();
      };
      document.addEventListener('keydown', state.handleKeydown, true);

      state.handleResize = () => closeNativeSearchDropdown();
      state.handleScroll = (event) => {
        // NOTE: We intentionally listen to scroll in capture phase so we can
        // close the panel when the page/layout scrolls.
        // However, the list inside the panel is also scrollable; if we close
        // on *any* scroll event, the dropdown becomes impossible to scroll.
        if(event && event.target && panel.contains(event.target)) return;
        closeNativeSearchDropdown();
      };
      window.addEventListener('resize', state.handleResize);
      window.addEventListener('scroll', state.handleScroll, true);
    }

    function attachNativeSearchDropdown(select){
      if(!(select instanceof HTMLSelectElement)) return;
      if(select.dataset.nativeSearchAttached === '1') return;
      select.dataset.nativeSearchAttached = '1';

      // Replace open behavior only when enabled (edit mode)
      select.addEventListener('pointerdown', (event) => {
        if(select.disabled) return;
        event.preventDefault();
        try{ select.focus(); }catch(_e){}
        openNativeSearchDropdown(select);
      });

      // Fallbacks: some browsers/OS combos don't deliver pointerdown reliably on <select>
      select.addEventListener('mousedown', (event) => {
        if(select.disabled) return;
        event.preventDefault();
        try{ select.focus(); }catch(_e){}
        openNativeSearchDropdown(select);
      });

      select.addEventListener('click', (event) => {
        if(select.disabled) return;
        event.preventDefault();
        try{ select.focus(); }catch(_e){}
        openNativeSearchDropdown(select);
      });

      select.addEventListener('keydown', (event) => {
        if(select.disabled) return;
        if(event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown'){
          event.preventDefault();
          openNativeSearchDropdown(select);
        }
      });
    }

    async function refreshDnsDomains(queryText){
      const url = `${API_DNS_DOMAIN_SUGGEST}?q=${encodeURIComponent(queryText || '')}&limit=200`;
      const data = await fetchJson(url, { method: 'GET' });
      dnsDomainCache = (data.items || []).slice();
      syncFieldSelects('dns_domain', dnsDomainCache);
    }

    async function refreshSystemNames(queryText){
      const url = `${API_HW_SYSTEM_SUGGEST}?q=${encodeURIComponent(queryText || '')}&limit=200`;
      const data = await fetchJson(url, { method: 'GET' });
      systemNameCache = (data.items || []).slice();
      syncFieldSelects('system_name', systemNameCache);
    }

    function clampPageSize(value){
      const n = parseInt(value, 10);
      if(!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
      return Math.min(Math.max(n, 10), 200);
    }

    function setElText(sel, text){
      const el = qsEl(sel);
      if(!el) return;
      el.textContent = text;
    }

    function renderPageButtons(currentPage, lastPage, onPick){
      const wrap = qsEl('#ip-range-page-numbers');
      if(!wrap) return;
      wrap.innerHTML = '';

      const totalPages = Math.max(1, lastPage || 1);
      const max = 7;
      let start = Math.max(1, currentPage - Math.floor(max / 2));
      let end = start + max - 1;
      if(end > totalPages){
        end = totalPages;
        start = Math.max(1, end - max + 1);
      }

      for(let p = start; p <= end; p++){
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `page-btn${p === currentPage ? ' active' : ''}`;
        b.textContent = String(p);
        b.addEventListener('click', () => onPick(p));
        wrap.appendChild(b);
      }
    }

    function renderRow(item){
      const tr = document.createElement('tr');
      tr.dataset.ip = item.ip_address;
      tr.dataset.editing = '0';

      if(item && item.ip_address) itemCacheByIp.set(String(item.ip_address), item);

      const tdCheck = document.createElement('td');
      tdCheck.dataset.col = 'check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'ip-range-row-check';
      cb.setAttribute('aria-label', '행 선택');
      const ipKey = item && item.ip_address ? String(item.ip_address) : '';
      cb.dataset.ip = ipKey;
      cb.checked = !!ipKey && selectedIps.has(ipKey);
      cb.addEventListener('change', () => {
        const ip = cb.dataset.ip || '';
        if(!ip) return;
        if(cb.checked) selectedIps.add(ip);
        else selectedIps.delete(ip);
        syncRowSelectedState(tr, cb.checked);
        updateSelectAllState();
      });
      tdCheck.appendChild(cb);

      const tdAddr = document.createElement('td');
      tdAddr.textContent = item.ip_address || '-';

      const tdStatus = document.createElement('td');
      tdStatus.classList.add('ip-range-status-cell');
      tdStatus.dataset.status = String(item.status || '').trim();
      tdStatus.appendChild(createDisplaySpan('status', item.status));
      const statusSel = document.createElement('select');
      statusSel.className = 'form-input';
      statusSel.dataset.field = 'status';
      statusSel.dataset.locked = '1';
      statusSel.dataset.placeholder = '-';
      statusSel.disabled = true;
      statusSel.appendChild(new Option('-', '', !item.status, !item.status));
      STATUS_OPTIONS.forEach((opt) => statusSel.appendChild(new Option(opt, opt, item.status === opt, item.status === opt)));
      tdStatus.appendChild(statusSel);

      statusSel.addEventListener('change', () => {
        tdStatus.dataset.status = String(statusSel.value || '').trim();
      });

      const tdRole = document.createElement('td');
      tdRole.appendChild(createDisplaySpan('role', item.role));
      const roleSel = document.createElement('select');
      roleSel.className = 'form-input';
      roleSel.dataset.field = 'role';
      roleSel.dataset.placeholder = '-';
      roleSel.disabled = true;
      roleSel.appendChild(new Option('-', '', !item.role, !item.role));
      ROLE_OPTIONS.forEach((opt) => roleSel.appendChild(new Option(opt, opt, item.role === opt, item.role === opt)));
      tdRole.appendChild(roleSel);
      attachNativeSearchDropdown(roleSel);

      const tdDns = document.createElement('td');
      tdDns.appendChild(createDisplaySpan('dns_domain', item.dns_domain));
      const dnsSel = document.createElement('select');
      dnsSel.className = 'form-input';
      dnsSel.dataset.field = 'dns_domain';
      dnsSel.dataset.locked = '1';
      dnsSel.dataset.placeholder = '-';
      dnsSel.disabled = true;
      tdDns.appendChild(dnsSel);

      const tdSystem = document.createElement('td');
      tdSystem.appendChild(createDisplaySpan('system_name', item.system_name));
      const sysSel = document.createElement('select');
      sysSel.className = 'form-input';
      sysSel.dataset.field = 'system_name';
      sysSel.dataset.locked = '1';
      sysSel.dataset.placeholder = '-';
      sysSel.disabled = true;
      tdSystem.appendChild(sysSel);

      const tdPort = document.createElement('td');
      tdPort.appendChild(createDisplaySpan('port', item.port));
      const portInput = document.createElement('input');
      portInput.type = 'text';
      portInput.className = 'form-input';
      portInput.placeholder = '-';
      portInput.value = item.port || '';
      portInput.dataset.field = 'port';
      portInput.dataset.locked = '1';
      portInput.disabled = true;
      tdPort.appendChild(portInput);

      const tdNote = document.createElement('td');
      tdNote.appendChild(createDisplaySpan('note', item.note));
      const noteInput = document.createElement('input');
      noteInput.type = 'text';
      noteInput.className = 'form-input';
      noteInput.placeholder = '-';
      noteInput.value = item.note || '';
      noteInput.dataset.field = 'note';
      noteInput.disabled = true;
      tdNote.appendChild(noteInput);

      tr.appendChild(tdCheck);
      tr.appendChild(tdAddr);
      tr.appendChild(tdStatus);
      tr.appendChild(tdRole);
      tr.appendChild(tdDns);
      tr.appendChild(tdSystem);
      tr.appendChild(tdPort);
      tr.appendChild(tdNote);
      tr.appendChild(renderActionsCell());

      setSelectOptions(dnsSel, dnsDomainCache, item.dns_domain || '');
      setSelectOptions(sysSel, systemNameCache, item.system_name || '');

      // Keep highlight consistent with initial checkbox state.
      syncRowSelectedState(tr, cb.checked);

      return tr;
    }

    async function autoFillFromInterfaces(items){
      // Collect IPs that have no system_name or port yet.
      var ips = [];
      (items || []).forEach(function(item){
        var ip = String(item.ip_address || '').trim();
        if(!ip) return;
        var hasSys = String(item.system_name || '').trim();
        var hasPort = String(item.port || '').trim();
        if(!hasSys && !hasPort) ips.push(ip);
      });
      if(!ips.length) return;

      var res = await fetchJson('/api/hw-interfaces/lookup-by-ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ips: ips }),
      });
      var mapping = (res && res.mapping) || {};
      if(!Object.keys(mapping).length) return;

      // Apply to DOM rows.
      qsaEl('tr[data-ip]', tbody).forEach(function(tr){
        var ip = tr.dataset.ip || '';
        var info = mapping[ip];
        if(!info) return;
        // Only fill if the row has no saved values.
        var sysInput = tr.querySelector('[data-field="system_name"]');
        var portInput = tr.querySelector('[data-field="port"]');
        var sysDisplay = tr.querySelector('.ip-range-display[data-display-for="system_name"]');
        var portDisplay = tr.querySelector('.ip-range-display[data-display-for="port"]');

        var curSys = sysInput ? String(sysInput.value || '').trim() : '';
        var curPort = portInput ? String(portInput.value || '').trim() : '';

        if(!curSys && info.system_name){
          if(sysInput) sysInput.value = info.system_name;
          if(sysDisplay){
            // Prefer work_name from the API response (resolved from parent asset).
            var displayName = (info.work_name && info.work_name !== info.system_name) ? info.work_name : info.system_name;
            sysDisplay.textContent = displayName;
          }
          try{ window.BlossomSearchableSelect?.sync?.(sysInput); }catch(_e){}
        }
        if(!curPort && info.port){
          if(portInput) portInput.value = info.port;
          if(portDisplay) portDisplay.textContent = info.port;
        }
        // 시스템/포트가 채워졌으면 상태를 활성으로 자동 설정
        if(info.system_name || info.port){
          var statusSel = tr.querySelector('[data-field="status"]');
          var statusDisplay = tr.querySelector('.ip-range-display[data-display-for="status"]');
          var curStatus = statusSel ? String(statusSel.value || '').trim() : '';
          if(!curStatus || curStatus === '-'){
            if(statusSel) statusSel.value = '활성';
            if(statusDisplay) statusDisplay.textContent = '활성';
            var parentTd = statusSel && statusSel.closest('td');
            if(parentTd) parentTd.dataset.status = '활성';
          }
        }
      });
    }

    async function autoFillFromDnsRecords(items){
      var ips = [];
      (items || []).forEach(function(item){
        var ip = String(item.ip_address || '').trim();
        if(ip) ips.push(ip);
      });
      if(!ips.length) return;

      var res = await fetchJson(API_DNS_LOOKUP_BY_IPS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ips: ips }),
      });
      var mapping = (res && res.mapping) || {};

      qsaEl('tr[data-ip]', tbody).forEach(function(tr){
        var ip = tr.dataset.ip || '';
        var info = mapping[ip];
        var dnsDisplay = tr.querySelector('.ip-range-display[data-display-for="dns_domain"]');
        var dnsInput = tr.querySelector('[data-field="dns_domain"]');

        if(info){
          var fqdn = String(info.fqdn || '').trim();
          if(fqdn){
            if(dnsDisplay) dnsDisplay.textContent = fqdn;
            if(dnsInput){
              var hasOpt = Array.from(dnsInput.options || []).some(function(o){ return o.value === fqdn; });
              if(!hasOpt) dnsInput.appendChild(new Option(fqdn, fqdn));
              dnsInput.value = fqdn;
              try{ window.BlossomSearchableSelect?.sync?.(dnsInput); }catch(_e){}
            }
            return;
          }
        }

        // No FQDN match: clear any stale value.
        if(dnsDisplay) dnsDisplay.textContent = '-';
        if(dnsInput){
          dnsInput.value = '';
          try{ window.BlossomSearchableSelect?.sync?.(dnsInput); }catch(_e){}
        }
      });
    }

    async function loadTable(policyId, page, pageSize){
      tbody.innerHTML = '';
      const data = await fetchJson(`${API_ADDR(policyId)}?page=${page}&page_size=${pageSize}`, { method: 'GET' });

      const total = data.total || 0;
      const currentPage = data.page || 1;
      const currentSize = data.page_size || pageSize;
      const lastPage = Math.max(1, Math.ceil(total / currentSize));

      const items = data.items || [];
      items.forEach((item) => tbody.appendChild(renderRow(item)));
      syncSearchableSelectsSoon(tbody);

      // Auto-fill system_name & port from interface data (only for empty cells).
      autoFillFromInterfaces(items).catch(() => {});

      // Auto-fill dns_domain with FQDN from DNS records (only for empty cells).
      autoFillFromDnsRecords(items).catch(() => {});

      updateSelectAllState();

      updateDownloadButtonState();

      const startIdx = total === 0 ? 0 : (currentPage - 1) * currentSize + 1;
      const endIdx = total === 0 ? 0 : Math.min(startIdx + items.length - 1, total);
      setElText('#ip-range-pagination-info', `${startIdx}-${endIdx} / ${total}개 항목`);

      const firstBtn = qsEl('#ip-range-first');
      const prevBtn = qsEl('#ip-range-prev');
      const nextBtn = qsEl('#ip-range-next');
      const lastBtn = qsEl('#ip-range-last');
      if(firstBtn) firstBtn.disabled = currentPage <= 1;
      if(prevBtn) prevBtn.disabled = currentPage <= 1;
      if(nextBtn) nextBtn.disabled = currentPage >= lastPage;
      if(lastBtn) lastBtn.disabled = currentPage >= lastPage;

      return { total, page: currentPage, pageSize: currentSize, lastPage };
    }

    function readRowItem(tr){
      const ip = tr.dataset.ip;
      const pick = (field) => {
        const el = tr.querySelector(`[data-field="${field}"]`);
        if(!el) return '';
        return String(el.value || '').trim();
      };
      return {
        ip_address: ip,
        status: pick('status'),
        role: pick('role'),
        dns_domain: pick('dns_domain'),
        system_name: pick('system_name'),
        port: pick('port'),
        note: pick('note'),
      };
    }

    async function saveRow(policyId, tr){
      const item = readRowItem(tr);
      await fetchJson(API_ADDR(policyId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [item] }),
      });
    }

    function wireTypeahead(){
      let dnsTimer = null;
      let sysTimer = null;

      const schedule = (field, value) => {
        if(field === 'dns_domain'){
          clearTimeout(dnsTimer);
          dnsTimer = setTimeout(() => { refreshDnsDomains(String(value || '')).catch(() => {}); }, 180);
        }
        if(field === 'system_name'){
          clearTimeout(sysTimer);
          sysTimer = setTimeout(() => { refreshSystemNames(String(value || '')).catch(() => {}); }, 180);
        }
      };

      tbody.addEventListener('input', (e) => {
        const t = e.target;
        if(!t || !t.dataset || !t.dataset.field) return;
        schedule(t.dataset.field, t.value);
      });

      tbody.addEventListener('focusin', (e) => {
        const t = e.target;
        if(!t) return;
        if(t.dataset && t.dataset.field){
          schedule(t.dataset.field, t.value);
          return;
        }
        const displayBtn = t.closest && t.closest('.fk-searchable-display');
        if(!displayBtn) return;
        const control = displayBtn.closest('.fk-searchable-control');
        const sel = control ? control.querySelector('select.search-select[data-field]') : null;
        if(!sel || !sel.dataset || !sel.dataset.field) return;
        schedule(sel.dataset.field, '');
      });
    }

    async function main(){
      const policyId = getPolicyId();
      if(!policyId){
        notifyMessage('대상 ID가 없습니다.', '오류', {kind: 'error'});
        return;
      }

      // Row click toggles selection (except when clicking buttons/inputs etc).
      table?.addEventListener('click', (ev) => {
        const tr = ev.target && ev.target.closest ? ev.target.closest('tr[data-ip]') : null;
        if(!tr || !tr.parentNode || tr.parentNode !== tbody) return;
        if(tr.dataset && tr.dataset.editing === '1') return;

        const onCheckbox = ev.target && ev.target.closest ? ev.target.closest('input.ip-range-row-check') : null;
        const onActionBtn = ev.target && ev.target.closest ? ev.target.closest('button.action-btn') : null;
        const isControl = ev.target && ev.target.closest
          ? ev.target.closest('button, a, input, select, textarea, label, .fk-searchable-display')
          : null;

        if(onActionBtn) return;
        if(isControl && !onCheckbox) return;
        if(onCheckbox) return;

        const cb = tr.querySelector('input.ip-range-row-check');
        if(!cb) return;
        cb.checked = !cb.checked;

        const ip = cb.dataset.ip || '';
        if(ip){
          if(cb.checked) selectedIps.add(ip);
          else selectedIps.delete(ip);
        }

        syncRowSelectedState(tr, cb.checked);
        updateSelectAllState();
      });

      if(selectAllEl){
        selectAllEl.addEventListener('change', () => {
          const checked = !!selectAllEl.checked;
          qsaEl('input.ip-range-row-check', tbody).forEach((cb) => {
            cb.checked = checked;
            const tr = cb.closest ? cb.closest('tr[data-ip]') : null;
            syncRowSelectedState(tr, checked);
            const ip = cb.dataset.ip || '';
            if(!ip) return;
            if(checked) selectedIps.add(ip);
            else selectedIps.delete(ip);
          });
          updateSelectAllState();
        });
      }

      if(downloadBtn){
        setDisabled(downloadBtn, true);
        downloadBtn.title = 'CSV 내보낼 항목이 없습니다.';
        downloadBtn.addEventListener('click', async function(){
          try{
            setDisabled(downloadBtn, true);
            downloadBtn.title = 'CSV를 준비 중입니다...';

            const items = await getItemsForCsv(policyId);
            if(!items || !items.length){
              try{ openMessageModal('CSV 내보낼 항목이 없습니다.', 'CSV 다운로드', { kind: 'info' }); }catch(_e){}
              return;
            }

            const csv = buildCsvFromItems(items);
            const today = new Date().toISOString().slice(0, 10);
            downloadTextAsFile(`ip_range_${policyId}_${today}.csv`, csv, 'text/csv;charset=utf-8;');
            try{ openMessageModal('CSV 파일이 다운로드되었습니다.', 'CSV 다운로드', { kind: 'success' }); }catch(_e){}
          }catch(err){
            const msg = err && err.message ? String(err.message) : 'CSV 다운로드 중 오류가 발생했습니다.';
            try{ openMessageModal(msg, 'CSV 다운로드 실패', { kind: 'error' }); }catch(_e){ alert(msg); }
          }finally{
            updateDownloadButtonState();
          }
        });
      }

      refreshDnsDomains('').catch(() => {});
      refreshSystemNames('').catch(() => {});

      let state = { page: 1, pageSize: DEFAULT_PAGE_SIZE, lastPage: 1 };

      const pageSizeSel = qsEl('#ip-range-page-size');
      if(pageSizeSel){
        // Prefer the template's selected value; fallback to DEFAULT_PAGE_SIZE.
        const initial = clampPageSize(pageSizeSel.value);
        state.pageSize = initial;
        pageSizeSel.value = String(initial);
        pageSizeSel.addEventListener('change', async () => {
          state.pageSize = clampPageSize(pageSizeSel.value);
          state.page = 1;
          const meta = await loadTable(policyId, state.page, state.pageSize);
          if(meta) state.lastPage = meta.lastPage;
          renderPageButtons(state.page, state.lastPage, (picked) => goTo(picked));
        });
      }

      const prevBtn = qsEl('#ip-range-prev');
      const nextBtn = qsEl('#ip-range-next');
      const firstBtn = qsEl('#ip-range-first');
      const lastBtn = qsEl('#ip-range-last');

      const goTo = async (p) => {
        state.page = Math.min(Math.max(1, p), state.lastPage);
        const meta = await loadTable(policyId, state.page, state.pageSize);
        if(meta) state.lastPage = meta.lastPage;
        renderPageButtons(state.page, state.lastPage, (picked) => goTo(picked));
      };

      if(prevBtn) prevBtn.addEventListener('click', async () => { await goTo(state.page - 1); });
      if(nextBtn) nextBtn.addEventListener('click', async () => { await goTo(state.page + 1); });
      if(firstBtn) firstBtn.addEventListener('click', async () => { await goTo(1); });
      if(lastBtn) lastBtn.addEventListener('click', async () => { await goTo(state.lastPage); });

      wireTypeahead();

      tbody.addEventListener('click', async (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('.action-btn[data-action]') : null;
        if(!btn) return;
        const action = btn.dataset.action;
        const tr = btn.closest('tr[data-ip]');
        if(!tr) return;

        // UX: when editing/saving, clear other selections and focus this row only.
        try{ selectOnlyIpRangeRow(tr); }catch(_e){}

        if(action === 'edit'){
          lockOtherRows(tr);
          setRowEditable(tr, true);
          setActionButtonMode(btn, 'save');
          syncSearchableSelectsSoon(tr);
          const firstField = tr.querySelector('[data-field]');
          if(firstField) firstField.focus();
          return;
        }

        if(action !== 'save') return;

        try{
          btn.disabled = true;
          await saveRow(policyId, tr);
          syncRowCacheFromDom(tr);
          syncRowDisplay(tr);
          setRowEditable(tr, false);
          setActionButtonMode(btn, 'edit');
          try{ window.BlossomSearchableSelect?.closeAll?.(); }catch(_e){}
          syncSearchableSelectsSoon(tr);
          openMessageModal('변경 사항이 저장되었습니다.', '저장 완료', { kind: 'success', subtitle: '변경 사항이 정상적으로 반영되었습니다.' });
        }catch(err){
          const detail = (err && err.message) ? String(err.message) : '저장 중 오류가 발생했습니다.';
          openMessageModal(`상세: ${detail}`, '저장 실패', {
            kind: 'error',
            subtitle: '저장에 실패했습니다. 잠시 후 다시 시도해주세요.',
          });

        }finally{
          btn.disabled = false;
        }
      });

      const meta = await loadTable(policyId, state.page, state.pageSize);
      if(meta) state.lastPage = meta.lastPage;
      renderPageButtons(state.page, state.lastPage, (picked) => goTo(picked));
    }

    main().catch((e) => {
      notifyMessage(e && e.message ? e.message : 'IP 범위 로딩 중 오류가 발생했습니다.', '오류', {kind: 'error'});
    });
  }

  ready(async function(){
    const idRaw = qs('id') || govDetailId();
    const policyId = idRaw ? parseInt(idRaw, 10) : NaN;

    if(!Number.isFinite(policyId)){
      setText('page-header-title', '\u00A0');
      setText('page-header-subtitle', '대상 ID가 없습니다. 목록에서 항목을 선택하세요.');
      return;
    }

    let currentPolicyRecord = null;

    function renderBasicPolicy(record){
      if(!record) return;
      const startIp = (record.start_ip || record.startIp || '').toString().trim();
      const endIp = (record.end_ip || record.endIp || '').toString().trim();

      // 상태: ip_list와 동일한 status-pill(점+텍스트) 스타일
      const statusHost = document.getElementById('ip-status');
      if(statusHost){
        const v = (record.status ?? '').toString().trim();
        if(!v){
          statusHost.textContent = '-';
        } else {
          statusHost.textContent = '';
          const pill = document.createElement('span');
          pill.className = 'status-pill';
          const dot = document.createElement('span');
          const map = { '활성':'ws-run', '예약':'ws-idle', '비활성':'ws-wait' };
          dot.className = `status-dot ${map[v] || 'ws-wait'}`;
          dot.setAttribute('aria-hidden', 'true');
          const text = document.createElement('span');
          text.className = 'status-text';
          text.textContent = v;
          pill.appendChild(dot);
          pill.appendChild(text);
          statusHost.appendChild(pill);
        }
      }
      setText('ip-version', record.ip_version || record.ipVersion);
      setText('ip-start', startIp);
      setText('ip-end', endIp);

      // IP 범위: ip_list 스타일(수량)
      const rangeEl = document.getElementById('ip-range');
      if(rangeEl){
        const cnt = countIPsGlobal(startIp, endIp);
        if(cnt == null){
          rangeEl.textContent = '-';
          rangeEl.title = '-';
        } else {
          rangeEl.textContent = formatBigIntKO(cnt);
          rangeEl.title = `${startIp} ~ ${endIp}`;
        }
      }

      const locationText = record.location || record.center_code || record.centerCode;
      setText('ip-location', locationText);
      setText('ip-role', record.role || '-');

      // 할당률: ip_list progress-cell 스타일
      const allocationEl = document.getElementById('ip-allocation');
      renderAllocationRateInto(allocationEl, record.allocation_rate ?? record.utilization_rate ?? record.allocationRate);

      setText('ip-note', record.note || record.description);

      const title = startIp ? `${startIp} ~ ${endIp}`.trim() : '\u00A0';
      const subtitle = (record && record.role)
        ? record.role
        : ((record && (record.location || record.center_code || record.centerCode))
          ? (record.location || record.center_code || record.centerCode)
          : '-');
      setText('page-header-title', title);
      setText('page-header-subtitle', subtitle);
    }

    try{
      const payload = await apiRequest(`${API_BASE}/${encodeURIComponent(policyId)}`, { method: 'GET' });
      const record = normalizeRecord(payload);
      currentPolicyRecord = record;

      const title = (record && (record.start_ip || record.startIp))
        ? `${record.start_ip || record.startIp} ~ ${record.end_ip || record.endIp || ''}`.trim()
        : '\u00A0';
      const subtitle = (record && record.role)
        ? record.role
        : ((record && (record.location || record.center_code || record.centerCode))
          ? (record.location || record.center_code || record.centerCode)
          : '-');

      // Render using ip_list-like UI
      renderBasicPolicy(record);

      // Basic Info page: status donut stats (reads from IP 범위 tab DB/API)
      try{ initIpStatusStatsCard(policyId); }catch(_e){}

      // Wire edit modal
      const editBtn = document.getElementById(POLICY_EDIT_BTN_ID);
      const closeBtn = document.getElementById(POLICY_EDIT_CLOSE_ID);
      const saveBtn = document.getElementById(POLICY_EDIT_SAVE_ID);

      editBtn?.addEventListener('click', ()=>{
        if(!currentPolicyRecord) return;
        buildPolicyEditForm(currentPolicyRecord);
        openModalById(POLICY_EDIT_MODAL_ID);
      });
      closeBtn?.addEventListener('click', ()=> closeModalById(POLICY_EDIT_MODAL_ID));

      saveBtn?.addEventListener('click', async ()=>{
        if(!currentPolicyRecord) return;
        const form = document.getElementById(POLICY_EDIT_FORM_ID);
        if(form && typeof form.checkValidity === 'function'){
          if(!form.checkValidity()){
            form.reportValidity();
            return;
          }
        }
        const data = collectPolicyEditForm();
        if(!data) return;
        // Backend expects status not blank when provided
        if(!data.status){
          notifyMessage('상태를 선택하세요.', '오류', {kind: 'error'});
          return;
        }

        saveBtn.disabled = true;
        try{
          const updatedPayload = await apiRequest(`${API_BASE}/${encodeURIComponent(policyId)}`, {
            method: 'PUT',
            body: JSON.stringify({
              status: data.status,
              ip_version: data.ip_version,
              start_ip: data.start_ip,
              end_ip: data.end_ip,
              location: data.location,
              role: data.role,
              note: data.note,
            }),
          });
          const updated = normalizeRecord(updatedPayload);
          currentPolicyRecord = updated;
          renderBasicPolicy(updated);

          // Stats depend on IP range; refresh after update.
          try{ initIpStatusStatsCard(policyId); }catch(_e){}

          closeModalById(POLICY_EDIT_MODAL_ID);
        }catch(err){
          notifyMessage(err && err.message ? err.message : 'IP 정책 수정 중 오류가 발생했습니다.', '오류', {kind: 'error'});
        }finally{
          saveBtn.disabled = false;
        }
      });
    }catch(err){
      setText('page-header-title', '\u00A0');
      setText('page-header-subtitle', err && err.message ? err.message : 'IP 정책 조회 실패');
    }
  });

  ready(function(){
    initIpRangeTab();
  });
})();
