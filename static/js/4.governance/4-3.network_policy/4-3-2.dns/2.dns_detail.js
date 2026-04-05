(function(){
  'use strict';

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

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

  function qs(name){
    try{
      const url = new URL(window.location.href);
      const v = url.searchParams.get(name);
      return v == null ? '' : String(v);
    }catch(_e){
      return '';
    }
  }

  /** Resolve the policy ID from body data attribute (set by pages.py after session redirect). */
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
    return body || {};
  }

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, (m)=>(
      { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]
    ));
  }

  // ---------------------------
  // Message modal (IP range parity)
  // ---------------------------

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
          <div class="server-add-title">
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

  function openMessageModal(message, title, options){
    const modal = ensureMessageModal();
    if(!modal) return;
    // Make sure dropdown overlays are closed before showing the modal.
    try{ if(typeof closeNativeSearchDropdown === 'function') closeNativeSearchDropdown(); }catch(_e){}
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

  function closeMessageModal(){
    const modal = document.getElementById('blossom-message-modal');
    if(!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  // ---------------------------
  // Confirm modal (browser confirm() parity)
  // ---------------------------

  let activeConfirmResolver = null;

  function ensureConfirmModal(){
    let modal = document.getElementById('blossom-confirm-modal');
    if(modal && document.body.contains(modal)) return modal;

    modal = document.createElement('div');
    modal.id = 'blossom-confirm-modal';
    modal.className = 'server-add-modal modal-overlay-full blossom-confirm-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="server-add-content" role="document">
        <div class="server-add-header">
          <div class="server-add-title">
            <h3 id="blossom-confirm-modal-title">확인</h3>
            <p class="server-add-subtitle" id="blossom-confirm-modal-subtitle"></p>
          </div>
          <button class="close-btn" type="button" data-confirm-modal="close" aria-label="닫기">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div class="server-add-body">
          <div class="dispose-content">
            <div class="dispose-text">
              <p id="blossom-confirm-modal-body"></p>
            </div>
            <div class="dispose-illust" aria-hidden="true">
              <img id="blossom-confirm-modal-illust" src="/static/image/svg/free-sticker-message.svg" alt="확인" loading="lazy" />
            </div>
          </div>
        </div>
        <div class="server-add-actions align-right">
          <div class="action-buttons right">
            <button type="button" class="btn-secondary" data-confirm-modal="cancel">취소</button>
            <button type="button" class="btn-primary" data-confirm-modal="ok">확인</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);

    const finalize = (result) => {
      try{ closeConfirmModal(); }catch(_e){}
      const resolver = activeConfirmResolver;
      activeConfirmResolver = null;
      if(typeof resolver === 'function'){
        try{ resolver(!!result); }catch(_e){}
      }
    };

    modal.addEventListener('click', (e) => {
      if(e.target === modal) finalize(false);
    });

    const btnClose = modal.querySelector('[data-confirm-modal="close"]');
    const btnCancel = modal.querySelector('[data-confirm-modal="cancel"]');
    const btnOk = modal.querySelector('[data-confirm-modal="ok"]');
    if(btnClose) btnClose.addEventListener('click', ()=> finalize(false));
    if(btnCancel) btnCancel.addEventListener('click', ()=> finalize(false));
    if(btnOk) btnOk.addEventListener('click', ()=> finalize(true));

    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape' && modal.classList.contains('show')) finalize(false);
    });

    return modal;
  }

  function closeConfirmModal(){
    const modal = document.getElementById('blossom-confirm-modal');
    if(!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function openConfirmModal(message, title, options){
    const modal = ensureConfirmModal();
    if(!modal){
      try{ return Promise.resolve(!!confirm(String(message ?? ''))); }catch(_e){ return Promise.resolve(false); }
    }

    try{ if(typeof closeNativeSearchDropdown === 'function') closeNativeSearchDropdown(); }catch(_e){}
    try{ window.BlossomSearchableSelect?.closeAll?.(); }catch(_e){}

    const titleEl = modal.querySelector('#blossom-confirm-modal-title');
    const subtitleEl = modal.querySelector('#blossom-confirm-modal-subtitle');
    const bodyEl = modal.querySelector('#blossom-confirm-modal-body');
    const illustEl = modal.querySelector('#blossom-confirm-modal-illust');
    const btnCancel = modal.querySelector('[data-confirm-modal="cancel"]');
    const btnOk = modal.querySelector('[data-confirm-modal="ok"]');

    const t = (title != null && String(title).trim()) ? String(title).trim() : '확인';
    const m = (message != null) ? String(message) : '';
    const opts = options && typeof options === 'object' ? options : {};
    const kind = (opts.kind ? String(opts.kind).toLowerCase() : 'info');
    const subtitleText = (opts.subtitle != null) ? String(opts.subtitle) : '';
    const okText = (opts.okText != null) ? String(opts.okText) : '확인';
    const cancelText = (opts.cancelText != null) ? String(opts.cancelText) : '취소';
    const illustSrc = opts.illustrationSrc
      ? String(opts.illustrationSrc)
      : (kind === 'error')
        ? '/static/image/svg/error/free-sticker-report.svg'
        : '/static/image/svg/free-sticker-message.svg';

    if(titleEl) titleEl.textContent = t;
    if(subtitleEl) subtitleEl.textContent = subtitleText;
    if(bodyEl) bodyEl.textContent = m;
    if(btnOk) btnOk.textContent = okText;
    if(btnCancel) btnCancel.textContent = cancelText;
    if(illustEl){
      illustEl.src = illustSrc;
      illustEl.alt = kind === 'error' ? '주의' : '확인';
    }

    // Auto-cancel any previous pending confirm.
    if(typeof activeConfirmResolver === 'function'){
      try{ activeConfirmResolver(false); }catch(_e){}
      activeConfirmResolver = null;
    }

    modal.classList.add('show');
    modal.removeAttribute('aria-hidden');
    document.body.classList.add('modal-open');

    return new Promise((resolve) => {
      activeConfirmResolver = resolve;
      requestAnimationFrame(() => { try{ btnOk && btnOk.focus(); }catch(_e){} });
    });
  }

  async function confirmMessage(message, title, options){
    try{ return await openConfirmModal(message, title, options); }
    catch(_e){ try{ return !!confirm(String(message ?? '')); }catch(_e2){ return false; } }
  }

  // ------------------------------------------------------------
  // Embedded searchable-select enhancer
  // ------------------------------------------------------------

  (function ensureSearchableSelectEnhancer(){
    if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') return;

    const searchableSelectMeta = new WeakMap();
    let activePanel = null;

    function isSearchableSelect(select){
      if(!(select instanceof HTMLSelectElement)) return false;
      if(!select.classList.contains('search-select')) return false;
      const explicit = (select.dataset && Object.prototype.hasOwnProperty.call(select.dataset, 'searchable'))
        ? select.dataset.searchable
        : select.getAttribute('data-searchable');
      if(explicit === 'false') return false;
      return true;
    }

    function getPlaceholder(select){
      return (
        select.getAttribute('data-placeholder') ||
        (select.dataset ? select.dataset.placeholder : '') ||
        '선택'
      );
    }

    function setup(select){
      if(!isSearchableSelect(select) || select.dataset.searchEnhanced === '1') return;

      const wrapper = document.createElement('div');
      wrapper.className = 'fk-searchable-control';

      const displayBtn = document.createElement('button');
      displayBtn.type = 'button';
      displayBtn.className = 'fk-searchable-display';
      displayBtn.setAttribute('aria-haspopup', 'dialog');
      displayBtn.setAttribute('aria-expanded', 'false');

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'fk-searchable-clear';
      clearBtn.setAttribute('aria-label', '선택 해제');
      clearBtn.title = '선택 해제';
      clearBtn.textContent = '지움';
      clearBtn.hidden = true;

      clearBtn.addEventListener('click', (event)=>{
        event.preventDefault();
        event.stopPropagation();
        close(select);
        select.value = '';
        select.dispatchEvent(new Event('change', { bubbles:true }));
        sync(select);
      });

      displayBtn.addEventListener('click', (event)=>{
        event.preventDefault();
        if(select.disabled) return;
        open(select);
      });

      const parent = select.parentNode;
      if(parent) parent.insertBefore(wrapper, select);
      wrapper.appendChild(displayBtn);
      wrapper.appendChild(clearBtn);
      wrapper.appendChild(select);

      select.classList.add('fk-search-native-hidden');
      select.dataset.searchEnhanced = '1';
      select.addEventListener('change', ()=> sync(select));

      searchableSelectMeta.set(select, { wrapper, displayBtn, clearBtn });
    }

    function sync(select){
      if(!isSearchableSelect(select)) return;
      let meta = searchableSelectMeta.get(select);
      if(!meta){
        setup(select);
        meta = searchableSelectMeta.get(select);
        if(!meta) return;
      }

      const placeholder = getPlaceholder(select);
      const selectedOption = select.selectedOptions && select.selectedOptions[0];
      const optionLabel = (selectedOption && selectedOption.textContent ? selectedOption.textContent : '').trim();
      const value = select.value || '';
      const label = (optionLabel || value || placeholder).trim();

      meta.displayBtn.textContent = label;
      meta.displayBtn.title = label;

      const hasValue = !!value;
      meta.displayBtn.classList.toggle('has-value', hasValue);
      meta.clearBtn.hidden = !hasValue;

      meta.wrapper.classList.toggle('is-disabled', !!select.disabled);
      meta.displayBtn.disabled = !!select.disabled;
      meta.clearBtn.disabled = !!select.disabled;

      if(select.disabled) close(select);
    }

    function buildOptions(select){
      const placeholder = getPlaceholder(select);
      return Array.from(select.options || []).map((opt)=>{
        const rawLabel = (opt.textContent || '').trim();
        const value = opt.value || '';
        const label = (rawLabel || value || placeholder).trim();
        return {
          value,
          label,
          searchLabel: label.toLowerCase(),
          valueLower: value.toLowerCase(),
        };
      });
    }

    function closeActive(){
      if(!activePanel) return;
      const state = activePanel;
      activePanel = null;
      try{ state.anchor.setAttribute('aria-expanded', 'false'); }catch(_e){}
      if(state.panel && state.panel.parentNode) state.panel.parentNode.removeChild(state.panel);
      document.removeEventListener('keydown', state._onKeydown, true);
      document.removeEventListener('mousedown', state._onDocMouseDown, true);
    }

    function getForcedPanelWidth(select){
      try{
        const raw = select.getAttribute('data-panel-width') || (select.dataset ? select.dataset.panelWidth : '');
        const n = parseInt(String(raw || '').trim(), 10);
        if(!Number.isFinite(n)) return 0;
        return Math.max(180, Math.min(420, n));
      }catch(_e){
        return 0;
      }
    }

    function position(state){
      const rect = state.anchor.getBoundingClientRect();
      const panel = state.panel;

      const margin = 6;
      const forcedWidth = state.forcedWidth || 0;
      const preferredWidth = forcedWidth || Math.max(220, rect.width);
      panel.style.width = preferredWidth + 'px';
      panel.style.minWidth = preferredWidth + 'px';
      panel.style.maxWidth = preferredWidth + 'px';

      let top = rect.bottom + margin;
      panel.style.left = Math.round(rect.left) + 'px';
      panel.style.top = Math.round(top) + 'px';

      const panelRect = panel.getBoundingClientRect();
      if(top + panelRect.height > window.innerHeight - margin){
        const above = rect.top - margin - panelRect.height;
        if(above >= margin) top = above;
      }

      const maxLeft = window.innerWidth - margin - panelRect.width;
      const left = Math.max(margin, Math.min(rect.left, maxLeft));

      panel.style.left = Math.round(left) + 'px';
      panel.style.top = Math.round(top) + 'px';
    }

    function render(state){
      state.list.innerHTML = '';
      state.itemButtons = [];

      if(!state.filtered.length){
        state.empty.hidden = false;
        state.focusIndex = -1;
        return;
      }

      state.empty.hidden = true;

      const currentValue = state.select.value || '';
      state.filtered.forEach((opt, idx)=>{
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

        btn.addEventListener('click', (e)=>{
          e.preventDefault();
          selectOption(state, idx);
        });

        state.list.appendChild(btn);
        state.itemButtons.push(btn);
      });
    }

    function setFocus(state, nextIndex){
      const max = state.filtered.length - 1;
      if(max < 0){ state.focusIndex = -1; return; }
      const clamped = Math.max(0, Math.min(nextIndex, max));
      state.focusIndex = clamped;
      state.itemButtons.forEach((btn, idx)=>{
        const active = idx === clamped;
        btn.classList.toggle('active', active);
        btn.classList.toggle('is-active', active);
      });
      const activeBtn = state.itemButtons[clamped];
      if(activeBtn) activeBtn.scrollIntoView({ block:'nearest' });
    }

    function filter(state){
      const q = (state.input.value || '').trim().toLowerCase();
      if(!q) state.filtered = state.options.slice();
      else state.filtered = state.options.filter((opt)=> opt.searchLabel.includes(q) || opt.valueLower.includes(q));
      state.focusIndex = -1;
      render(state);
    }

    function selectOption(state, idx){
      const opt = state.filtered[idx];
      if(!opt) return;
      state.select.value = opt.value;
      state.select.dispatchEvent(new Event('change', { bubbles:true }));
      sync(state.select);
      close(state.select);
    }

    function open(select){
      if(!isSearchableSelect(select)) return;
      setup(select);
      sync(select);

      const meta = searchableSelectMeta.get(select);
      if(!meta) return;

      closeActive();

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

      const state = {
        select,
        anchor: meta.displayBtn,
        panel,
        input,
        list,
        empty,
        forcedWidth: getForcedPanelWidth(select),
        options: buildOptions(select),
        filtered: [],
        focusIndex: -1,
        itemButtons: [],
        _onKeydown: null,
        _onDocMouseDown: null,
      };
      state.filtered = state.options.slice();
      render(state);

      closeBtn.addEventListener('click', (e)=>{ e.preventDefault(); close(select); });
      input.addEventListener('input', ()=> filter(state));

      state._onKeydown = (event)=>{
        if(!activePanel) return;
        if(activePanel.select !== select) return;
        if(event.key === 'Escape'){
          event.preventDefault();
          close(select);
          return;
        }
        if(event.key === 'ArrowDown'){
          event.preventDefault();
          if(state.filtered.length) setFocus(state, state.focusIndex < 0 ? 0 : state.focusIndex + 1);
          return;
        }
        if(event.key === 'ArrowUp'){
          event.preventDefault();
          if(state.filtered.length) setFocus(state, state.focusIndex < 0 ? state.filtered.length - 1 : state.focusIndex - 1);
          return;
        }
        if(event.key === 'Enter'){
          if(state.focusIndex >= 0 && state.focusIndex < state.filtered.length){
            event.preventDefault();
            selectOption(state, state.focusIndex);
          }
        }
      };

      state._onDocMouseDown = (evt)=>{
        if(!activePanel) return;
        const t = evt.target;
        if(!t) return;
        if(panel.contains(t)) return;
        if(meta.wrapper.contains(t)) return;
        close(select);
      };

      meta.displayBtn.setAttribute('aria-expanded', 'true');
      activePanel = state;
      document.body.appendChild(panel);
      position(state);

      document.addEventListener('keydown', state._onKeydown, true);
      document.addEventListener('mousedown', state._onDocMouseDown, true);

      window.addEventListener('resize', ()=>{ if(activePanel === state) position(state); }, { passive:true });
      window.addEventListener('scroll', ()=>{ if(activePanel === state) position(state); }, { passive:true, capture:true });

      requestAnimationFrame(()=>{ try{ input.focus(); }catch(_e){} });
    }

    function close(select){
      if(!activePanel) return;
      if(select && activePanel.select !== select) return;
      closeActive();
    }

    function syncAll(root){
      const scope = root || document;
      const selects = Array.from(scope.querySelectorAll('select.search-select'));
      selects.forEach((sel)=>{
        if(!isSearchableSelect(sel)) return;
        setup(sel);
        sync(sel);
      });
    }

    window.BlossomSearchableSelect = {
      syncAll,
      sync,
      open,
      close,
      closeAll: closeActive,
    };

    ready(()=>{ try{ syncAll(document); }catch(_e){} });
  })();

  // ------------------------------------------------------------
  // Shared helpers
  // ------------------------------------------------------------

  const policyCache = new Map();

  function setPageHeaderFromPolicy(policy){
    try{
      const headerTitle = document.getElementById('page-header-title');
      const headerSubtitle = document.getElementById('page-header-subtitle');
      const domain = policy && policy.domain != null ? String(policy.domain).trim() : '';
      const role = policy && policy.role != null ? String(policy.role).trim() : '';
      if(headerTitle) headerTitle.textContent = domain ? domain : '\u00A0';
      if(headerSubtitle) headerSubtitle.textContent = role ? role : '\u00A0';
    }catch(_e){}
  }

  function formatTtlDisplay(v){
    if(v == null) return '-';
    const raw = String(v).replace(/,/g,'').trim();
    if(raw === '') return '-';
    const n = parseInt(raw, 10);
    if(!Number.isFinite(n)) return '-';
    try{ return n.toLocaleString('ko-KR'); }catch(_e){ return String(n); }
  }

  function formatCommaNumberInput(raw){
    const digits = String(raw == null ? '' : raw).replace(/[^0-9]/g, '');
    if(digits === '') return '';
    try{ return parseInt(digits, 10).toLocaleString('en-US'); }catch(_e){ return digits; }
  }

  function statusPillHtml(statusLabel){
    const v = String(statusLabel == null ? '' : statusLabel).trim() || '-';
    const map = { '활성':'ws-run', '예약':'ws-idle', '비활성':'ws-wait' };
    const cls = map[v] || 'ws-wait';
    return `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${escapeHtml(v)}</span></span>`;
  }

  function openModal(modal){
    if(!modal) return;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden','false');
    document.body.classList.add('modal-open');
  }

  function closeModal(modal){
    if(!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden','true');
    document.body.classList.remove('modal-open');
  }

  const POLICY_API = '/api/network/dns-policies';

  async function fetchPolicy(policyId){
    const id = parseInt(policyId || '0', 10) || 0;
    if(!id) throw new Error('정책 ID가 없습니다.');
    if(policyCache.has(id)) return policyCache.get(id);
    const detail = await apiJson(`${POLICY_API}/${id}`);
    const policy = detail.item || detail;
    policyCache.set(id, policy);
    return policy;
  }

  function renderDonut({ pieEl, totalEl, legendEl, emptyEl, counts, order, colors }){
    if(!pieEl || !legendEl) return;
    const total = Object.values(counts).reduce((a,b)=>a+(b||0),0);
    if(totalEl) totalEl.textContent = String(total);

    const legendKeysRaw = Array.isArray(order) && order.length ? order : Object.keys(counts || {});
    const legendKeys = legendKeysRaw.filter((k)=>{
      const key = String(k == null ? '' : k).trim();
      if(key === '') return false;
      const v = (counts && counts[key]) ? (counts[key] || 0) : (counts && counts[k] ? (counts[k] || 0) : 0);
      if(key === '-' && v <= 0) return false;
      return true;
    });

    legendEl.innerHTML = legendKeys.map((k)=>{
      const key = String(k == null ? '' : k).trim();
      const v = counts && counts[key] ? (counts[key] || 0) : (counts && counts[k] ? (counts[k] || 0) : 0);
      const pct = total > 0 ? Math.round((v / total) * 100) : 0;
      const c = (colors && (colors[key] || colors[k])) ? (colors[key] || colors[k]) : '#999';
      return `<li class="legend-item"><span class="legend-dot" style="background:${c}"></span><span class="legend-host">${escapeHtml(key)}</span><span class="legend-size">${v} (${pct}%)</span></li>`;
    }).join('');

    const keys = legendKeys.filter(k => (counts[k] || 0) > 0);
    if(total <= 0 || keys.length === 0){
      pieEl.style.background = '';
      var pieWrap = pieEl.closest('.pie-wrap');
      if(pieWrap) pieWrap.style.display = 'none';
      if(emptyEl){ emptyEl.hidden = false; try{ showNoDataImage(emptyEl, '상태 데이터가 없습니다.'); }catch(_e){} }
      return;
    }
    if(emptyEl) emptyEl.hidden = true;
    var pieWrapShow = pieEl.closest('.pie-wrap');
    if(pieWrapShow) pieWrapShow.style.display = '';

    let acc = 0;
    const stops = keys.map((k)=>{
      const v = (counts && counts[k]) ? (counts[k] || 0) : 0;
      const start = acc;
      acc += v;
      const startPct = (start / total) * 100;
      const endPct = (acc / total) * 100;
      const c = (colors && colors[k]) ? colors[k] : '#999';
      return `${c} ${startPct.toFixed(2)}% ${endPct.toFixed(2)}%`;
    });
    pieEl.style.background = `conic-gradient(${stops.join(', ')})`;
  }

  // ------------------------------------------------------------
  // DNS basic tab
  // ------------------------------------------------------------

  async function initBasicTab(){
    const statusEl = document.getElementById('dns-status');
    const domainEl = document.getElementById('dns-domain');
    if(!statusEl || !domainEl) return;

    const policyId = parseInt(qs('id') || qs('policy_id') || qs('policyId') || govDetailId() || '0', 10) || 0;
    if(!policyId) return;

    const recordCountEl = document.getElementById('dns-record-count');
    const typeEl = document.getElementById('dns-type');
    const ttlEl = document.getElementById('dns-ttl');
    const managedByEl = document.getElementById('dns-managed-by');
    const roleEl = document.getElementById('dns-role');
    const remarkEl = document.getElementById('dns-remark');

    const editBtn = document.getElementById('dns-policy-edit-btn');
    const editModal = document.getElementById('dns-policy-edit-modal');
    const editClose = document.getElementById('dns-policy-edit-close');
    const editForm = document.getElementById('dns-policy-edit-form');
    const editSave = document.getElementById('dns-policy-edit-save');

    let current = null;

    function fillBasic(policy){
      current = policy;
      setPageHeaderFromPolicy(policy);
      try{ statusEl.innerHTML = statusPillHtml(policy.status); }
      catch(_e){ statusEl.textContent = policy.status || '-'; }
      domainEl.textContent = policy.domain || '-';
      if(recordCountEl) recordCountEl.textContent = (policy.record_count == null || policy.record_count === '') ? '-' : String(policy.record_count);
      if(typeEl) typeEl.textContent = policy.dns_type || '-';
      if(ttlEl) ttlEl.textContent = formatTtlDisplay(policy.ttl);
      if(managedByEl) managedByEl.textContent = policy.managed_by || '-';
      if(roleEl) roleEl.textContent = policy.role || '-';
      if(remarkEl) remarkEl.textContent = policy.remark || '-';
    }

    function buildEditForm(policy){
      if(!editForm) return;
      editForm.innerHTML = '';

      const section = document.createElement('div');
      section.className = 'form-section';
      section.innerHTML = `<div class="section-header"><h4>DNS 정책</h4></div>`;

      const grid = document.createElement('div');
      grid.className = 'form-grid';
      grid.innerHTML = `
        <div class="form-row"><label>상태</label>
          <select name="status" class="form-input search-select fk-select" data-placeholder="상태 선택">
            <option value="" ${!policy.status?'selected':''}>선택</option>
            <option value="활성" ${policy.status==='활성'?'selected':''}>활성</option>
            <option value="예약" ${policy.status==='예약'?'selected':''}>예약</option>
            <option value="비활성" ${policy.status==='비활성'?'selected':''}>비활성</option>
          </select>
        </div>
        <div class="form-row"><label>도메인명</label><input name="domain" class="form-input" value="${escapeHtml(policy.domain||'')}" placeholder="example.com"></div>
        <div class="form-row"><label>레코드수</label><input name="record_count" type="text" class="form-input locked-input" value="${(policy.record_count==null || policy.record_count==='') ? '-' : policy.record_count}" placeholder="-" readonly disabled></div>
        <div class="form-row"><label>유형</label>
          <select name="dns_type" class="form-input search-select fk-select" data-placeholder="유형 선택">
            <option value="" ${!policy.dns_type?'selected':''}>선택</option>
            <option value="Primary" ${policy.dns_type==='Primary'?'selected':''}>Primary</option>
            <option value="Secondary" ${policy.dns_type==='Secondary'?'selected':''}>Secondary</option>
            <option value="Stub" ${policy.dns_type==='Stub'?'selected':''}>Stub</option>
            <option value="Forward" ${policy.dns_type==='Forward'?'selected':''}>Forward</option>
            <option value="Delegated" ${policy.dns_type==='Delegated'?'selected':''}>Delegated</option>
            <option value="External" ${policy.dns_type==='External'?'selected':''}>External</option>
            <option value="AD-Integrated" ${policy.dns_type==='AD-Integrated'?'selected':''}>AD-Integrated</option>
          </select>
        </div>
        <div class="form-row"><label>TTL</label><input name="ttl" type="text" inputmode="numeric" autocomplete="off" class="form-input" value="${escapeHtml(formatCommaNumberInput((policy.ttl==null || policy.ttl==='') ? 3600 : policy.ttl))}" placeholder="0"></div>
        <div class="form-row"><label>관리주체</label>
          <select name="managed_by" class="form-input search-select fk-select" data-placeholder="관리주체 선택">
            <option value="" ${!policy.managed_by?'selected':''}>선택</option>
            <option value="Internal" ${policy.managed_by==='Internal'?'selected':''}>Internal</option>
            <option value="External" ${policy.managed_by==='External'?'selected':''}>External</option>
            <option value="AD" ${policy.managed_by==='AD'?'selected':''}>AD</option>
            <option value="MSP" ${policy.managed_by==='MSP'?'selected':''}>MSP</option>
            <option value="Cloud" ${policy.managed_by==='Cloud'?'selected':''}>Cloud</option>
          </select>
        </div>
        <div class="form-row"><label>역할</label><input name="role" class="form-input" value="${escapeHtml(policy.role||'')}" placeholder="예: 내부/외부/CDN"></div>
        <div class="form-row form-row-wide"><label>비고</label><textarea name="remark" class="form-input textarea-large" rows="6">${escapeHtml(policy.remark||'')}</textarea></div>
      `;

      section.appendChild(grid);
      editForm.appendChild(section);

      try{
        const ttlInput = editForm.querySelector('input[name="ttl"]');
        if(ttlInput){
          ttlInput.addEventListener('input', ()=>{ ttlInput.value = formatCommaNumberInput(ttlInput.value); });
          ttlInput.addEventListener('blur', ()=>{ ttlInput.value = formatCommaNumberInput(ttlInput.value); });
        }
      }catch(_e){}

      try{
        if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
          window.BlossomSearchableSelect.syncAll(editForm);
        }
      }catch(_e){}
    }

    function collectEditPayload(){
      if(!editForm) return {};
      const fd = new FormData(editForm);
      const payload = {};
      for(const [k,v] of fd.entries()) payload[k] = String(v == null ? '' : v).trim();
      const ttlDigits = String(payload.ttl == null ? '' : payload.ttl).replace(/[^0-9]/g,'');
      payload.ttl = ttlDigits === '' ? 3600 : (parseInt(ttlDigits, 10) || 3600);
      return payload;
    }

    async function refresh(){
      const detail = await apiJson(`${POLICY_API}/${policyId}`);
      const policy = detail.item || detail;
      fillBasic(policy);

      try{
        const pieEl = document.getElementById('dns-record-status-pie');
        const totalEl = document.getElementById('dns-record-status-total');
        const legendEl = document.getElementById('dns-record-status-legend');
        const emptyEl = document.getElementById('dns-record-status-empty');

        const res = await apiJson(`${POLICY_API}/${policyId}/records?page=1&page_size=500`);
        const items = res.items || [];
        const counts = {};
        for(const r of items){
          const raw = String((r && r.status) ? r.status : '').trim();
          const s = (raw === '활성' || raw === '예약' || raw === '비활성') ? raw : '-';
          counts[s] = (counts[s] || 0) + 1;
        }
        const order = ['활성','예약','비활성','-'];
        const colors = {
          '활성':'#2f7bf6',
          '예약':'#f6b12f',
          '비활성':'#9aa4b2',
          '-':'#d0d7de'
        };
        renderDonut({ pieEl, totalEl, legendEl, emptyEl, counts, order, colors });
      }catch(_e){}
    }

    editBtn?.addEventListener('click', async ()=>{
      if(!current) await refresh();
      buildEditForm(current || {});
      openModal(editModal);
    });
    editClose?.addEventListener('click', ()=> closeModal(editModal));
    editModal?.addEventListener('click', (e)=>{ if(e.target === editModal) closeModal(editModal); });
    document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && editModal?.classList.contains('show')) closeModal(editModal); });

    editSave?.addEventListener('click', async ()=>{
      try{
        const payload = collectEditPayload();
        const updated = await apiJson(`${POLICY_API}/${policyId}`, {
          method: 'PUT',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify(payload),
        });
        fillBasic(updated.item || updated);
        closeModal(editModal);
      }catch(err){
        notifyMessage(err.message || '저장 중 오류가 발생했습니다.', '저장 실패', { kind: 'error' });
      }
    });

    await refresh();
  }

  // ------------------------------------------------------------
  // DNS record tab
  // ------------------------------------------------------------

  async function initRecordTab(){
    const table = document.getElementById('dns-record-table');
    const tbody = document.getElementById('dns-record-table-body');
    const pageSizeSel = document.getElementById('dns-record-page-size');
    if(!tbody || !pageSizeSel) return;

    const policyId = parseInt(qs('id') || qs('policy_id') || qs('policyId') || govDetailId() || '0', 10) || 0;
    if(!policyId) return;

    const downloadBtn = document.getElementById('dns-record-download-btn');

    const paginationInfo = document.getElementById('dns-record-pagination-info');
    const btnFirst = document.getElementById('dns-record-first');
    const btnPrev = document.getElementById('dns-record-prev');
    const btnNext = document.getElementById('dns-record-next');
    const btnLast = document.getElementById('dns-record-last');
    const pageNumbers = document.getElementById('dns-record-page-numbers');
    const selectAll = document.getElementById('dns-record-select-all');

    const empty = document.getElementById('dns-record-empty');
    const ipDatalist = document.getElementById('dns-record-ip-datalist');

    const EDIT_ICON_SRC = '/static/image/svg/list/free-icon-pencil.svg';
    const SAVE_ICON_SRC = '/static/image/svg/save.svg';

    // ── Delete-confirmation modal (interface tab style) ──
    let _dnsRecordPendingDeleteId = 0;

    function dnsRecordOpenDeleteModal(recordId){
      _dnsRecordPendingDeleteId = recordId;
      var msgEl = document.getElementById('dns-record-delete-msg');
      if(msgEl) msgEl.textContent = '이 DNS 레코드를 삭제하시겠습니까?';
      var modal = document.getElementById('dns-record-delete-modal');
      if(modal){ document.body.classList.add('modal-open'); modal.classList.add('show'); modal.setAttribute('aria-hidden','false'); }
    }

    function dnsRecordCloseDeleteModal(){
      _dnsRecordPendingDeleteId = 0;
      var modal = document.getElementById('dns-record-delete-modal');
      if(modal){ modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
    }

    function dnsRecordPerformDelete(){
      var id = _dnsRecordPendingDeleteId;
      dnsRecordCloseDeleteModal();
      if(id) executeDelete(id);
    }

    (function wireDnsRecordDeleteModal(){
      var modal = document.getElementById('dns-record-delete-modal');
      if(!modal) return;
      var confirmBtn = document.getElementById('dns-record-delete-confirm');
      var cancelBtn  = document.getElementById('dns-record-delete-cancel');
      var closeBtn   = document.getElementById('dns-record-delete-close');
      if(confirmBtn) confirmBtn.addEventListener('click', dnsRecordPerformDelete);
      if(cancelBtn)  cancelBtn.addEventListener('click', dnsRecordCloseDeleteModal);
      if(closeBtn)   closeBtn.addEventListener('click', dnsRecordCloseDeleteModal);
      modal.addEventListener('click', function(e){ if(e.target === modal) dnsRecordCloseDeleteModal(); });
      document.addEventListener('keydown', function(e){
        try{ if(e.key === 'Escape' && modal.classList.contains('show')) dnsRecordCloseDeleteModal(); }catch(_){ }
      });
    })();

    // Row click toggles selection (IP range tab parity).
    // - ignores clicks on buttons/inputs/selects/labels/etc.
    // - ignores inline editor rows
    table?.addEventListener('click', (ev) => {
      const tr = ev.target && ev.target.closest ? ev.target.closest('tr[data-id]') : null;
      if(!tr || !tr.parentNode || tr.parentNode !== tbody) return;
      if(tr.classList && tr.classList.contains('dns-record-editor')) return;

      const onCheckbox = ev.target && ev.target.closest ? ev.target.closest('input.dns-record-row-select') : null;
      const onActionBtn = ev.target && ev.target.closest ? ev.target.closest('button.action-btn') : null;
      const isControl = ev.target && ev.target.closest
        ? ev.target.closest('button, a, input, select, textarea, label, .fk-searchable-display')
        : null;

      if(onActionBtn) return;
      if(isControl && !onCheckbox) return;
      if(onCheckbox) return;

      const cb = tr.querySelector('input.dns-record-row-select');
      if(!cb) return;
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change', { bubbles:true }));
    });

    let state = { page: 1, pageSize: parseInt(pageSizeSel.value,10)||10, total: 0, items: [], selected: new Set() };
    let inlineEditor = { active: false, mode: '', recordId: 0, originalRowHtml: '' };

    function setDisabled(el, disabled){
      if(!el) return;
      el.disabled = !!disabled;
      el.setAttribute('aria-disabled', (!!disabled).toString());
    }

    function updateDownloadButtonState(){
      if(!downloadBtn) return;
      const hasRows = (state.total || 0) > 0;
      setDisabled(downloadBtn, !hasRows);
      downloadBtn.title = hasRows ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
    }

    function csvEscape(value){
      const s = String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const needsQuotes = /[",\n]/.test(s);
      const escaped = s.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    }

    function buildRecordsCsv(items){
      const headers = ['상태','유형','호스트명','FQDN','IP','Priority','서비스','비고'];
      let csv = '\uFEFF';
      csv += headers.map(csvEscape).join(',') + '\n';

      const rows = Array.isArray(items) ? items : [];
      for(const it of rows){
        const values = [
          it && it.status,
          it && it.record_type,
          it && it.host_name,
          it && (it.fqdn || fqdnFrom(it.host_name, cachedDomain)),
          it && it.ip_address,
          (it && (it.priority == null || it.priority === '')) ? '' : (it && it.priority),
          it && it.service_name,
          it && it.remark,
        ];
        csv += values.map(csvEscape).join(',') + '\n';
      }
      return csv;
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

    async function fetchAllRecordsForCsv(){
      let page = 1;
      const requestedPageSize = 500;
      const all = [];
      let lastPage = 1;

      while(page <= lastPage){
        const res = await apiJson(`${POLICY_API}/${policyId}/records?page=${page}&page_size=${requestedPageSize}`);
        const total = res.total || 0;
        const currentSize = res.page_size || requestedPageSize;
        lastPage = Math.max(1, Math.ceil(total / currentSize));

        const items = res.items || [];
        for(const it of items) all.push(it);
        page += 1;
      }

      return all;
    }

    async function getRecordsForCsv(){
      const pickedIds = Array.from(state.selected || []);
      const all = await fetchAllRecordsForCsv();
      if(!pickedIds.length) return all;

      const picked = new Set(pickedIds.map((v)=>parseInt(String(v||'0'),10)).filter(Boolean));
      return (all || []).filter((it)=> it && it.id && picked.has(it.id));
    }

    function syncSearchableSelects(root){
      try{
        if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
          window.BlossomSearchableSelect.syncAll(root || document);
          return true;
        }
      }catch(_e){}
      return false;
    }

    function syncSearchableSelectsSoon(root){
      const ok = syncSearchableSelects(root);
      if(ok) return;
      setTimeout(()=> syncSearchableSelects(root), 0);
      setTimeout(()=> syncSearchableSelects(root), 120);
      setTimeout(()=> syncSearchableSelects(root), 300);
      setTimeout(()=> syncSearchableSelects(root), 700);
      setTimeout(()=> syncSearchableSelects(root), 1200);
      setTimeout(()=> syncSearchableSelects(root), 2000);
      setTimeout(()=> syncSearchableSelects(root), 3500);
    }

    function fqdnFrom(host, domain){
      const h = String(host||'').trim();
      const d = String(domain||'').trim();
      if(!d) return h;
      if(!h || h === '@') return d;
      if(h.endsWith('.')) return h.slice(0,-1);
      return `${h}.${d}`;
    }

    let cachedDomain = '';
    try{
      const policy = await fetchPolicy(policyId);
      setPageHeaderFromPolicy(policy);
      cachedDomain = String(policy.domain || '').trim();
    }catch(_e){}

    function buildRow(r){
      const checked = state.selected.has(r.id) ? 'checked' : '';
      const selectedClass = state.selected.has(r.id) ? 'selected' : '';
      const status = r.status || '-';
      const type = r.record_type || '-';
      const host = r.host_name || '-';
      const fqdn = r.fqdn || fqdnFrom(r.host_name, cachedDomain) || '-';
      const ip = r.ip_address || '-';
      const pr = (r.priority == null || r.priority === '') ? '-' : String(r.priority);
      const svc = r.service_name || '-';
      const remark = r.remark || '-';
      return `
        <tr data-id="${r.id}" class="${selectedClass}">
          <td><input type="checkbox" class="dns-record-row-select" data-id="${r.id}" ${checked}></td>
          <td>${statusPillHtml(status)}</td>
          <td>${escapeHtml(type)}</td>
          <td>${escapeHtml(host)}</td>
          <td>${escapeHtml(fqdn)}</td>
          <td>${escapeHtml(ip)}</td>
          <td>${escapeHtml(pr)}</td>
          <td>${escapeHtml(svc)}</td>
          <td>${escapeHtml(remark)}</td>
          <td class="system-actions">
            <button type="button" class="action-btn" data-action="edit" data-id="${r.id}" title="수정" aria-label="수정">
              <img src="${EDIT_ICON_SRC}" alt="수정" class="action-icon">
            </button>
            <button type="button" class="action-btn" data-action="delete" data-id="${r.id}" title="삭제" aria-label="삭제">
              <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">
            </button>
          </td>
        </tr>
      `;
    }

    function updateSelectAll(){
      if(!selectAll) return;
      const boxes = tbody.querySelectorAll('.dns-record-row-select');
      if(!boxes.length){ selectAll.checked = false; return; }
      selectAll.checked = [...boxes].every(b=>b.checked);
    }

    function totalPages(){
      return Math.max(1, Math.ceil((state.total || 0) / (state.pageSize || 10)));
    }

    function renderPagination(){
      const total = state.total || 0;
      const page = state.page;
      const pages = totalPages();

      if(paginationInfo){
        if(total <= 0) paginationInfo.textContent = `0-0 / 0개 항목`;
        else {
          const start = ((page - 1) * state.pageSize) + 1;
          const end = Math.min(total, page * state.pageSize);
          paginationInfo.textContent = `${start}-${end} / ${total}개 항목`;
        }
      }

      if(btnFirst) btnFirst.disabled = page <= 1;
      if(btnPrev) btnPrev.disabled = page <= 1;
      if(btnNext) btnNext.disabled = page >= pages;
      if(btnLast) btnLast.disabled = page >= pages;

      if(pageNumbers){
        pageNumbers.innerHTML = '';
        const totalPagesSafe = Math.max(1, pages || 1);
        const max = 7;
        let start = Math.max(1, page - Math.floor(max / 2));
        let end = start + max - 1;
        if(end > totalPagesSafe){
          end = totalPagesSafe;
          start = Math.max(1, end - max + 1);
        }
        const parts = [];
        for(let p=start; p<=end; p++){
          parts.push(`<button type="button" class="page-btn${p===page?' active':''}" data-page="${p}">${p}</button>`);
        }
        pageNumbers.innerHTML = parts.join('');
      }
    }

    function closeInlineEditor({ restore } = { restore:true }){
      try{ window.BlossomSearchableSelect && window.BlossomSearchableSelect.closeAll && window.BlossomSearchableSelect.closeAll(); }catch(_e){}

      const row = tbody.querySelector('tr.dns-record-editor');
      if(!row) return;

      if(inlineEditor.active && inlineEditor.mode === 'edit' && restore && inlineEditor.originalRowHtml){
        const tmp = document.createElement('tbody');
        tmp.innerHTML = inlineEditor.originalRowHtml;
        const restored = tmp.firstElementChild;
        if(restored) row.replaceWith(restored);
        else row.remove();
      }else{
        row.remove();
      }

      inlineEditor = { active:false, mode:'', recordId:0, originalRowHtml:'' };
      if(empty) empty.hidden = (state.total || 0) !== 0;
    }

    async function ensureNoInlineEditor(){
      const row = tbody.querySelector('tr.dns-record-editor');
      if(!row) return true;
      const ok = await confirmMessage('편집 중인 행이 있습니다. 취소하고 진행할까요?', '편집 취소', { kind: 'info', okText: '진행', cancelText: '취소' });
      if(!ok) return false;
      closeInlineEditor({ restore:true });
      return true;
    }

    function editorRowHtml({ mode, record }){
      const r = record || {};
      const recordId = r.id ? parseInt(r.id, 10) : 0;
      const fqdn = fqdnFrom(r.host_name, cachedDomain);
      const statusVal = String(r.status || '').trim();
      const typeVal = String(r.record_type || '').trim();
      const priorityVal = (r.priority == null || r.priority === '') ? '' : String(r.priority);
      const ttlVal = (r.ttl == null || r.ttl === '') ? '3600' : String(r.ttl);

      return `
        <tr class="dns-record-editor" data-mode="${escapeHtml(mode)}" data-id="${recordId}">
          <td><input type="checkbox" disabled aria-label="선택" /></td>
          <td>
            <select name="status" class="form-input search-select fk-select" data-placeholder="상태 선택" data-searchable-scope="page" aria-label="상태">
              <option value="" ${!statusVal?'selected':''}>상태 선택</option>
              <option value="활성" ${statusVal==='활성'?'selected':''}>활성</option>
              <option value="예약" ${statusVal==='예약'?'selected':''}>예약</option>
              <option value="비활성" ${statusVal==='비활성'?'selected':''}>비활성</option>
            </select>
          </td>
          <td>
            <select name="record_type" class="form-input search-select fk-select dns-record-inline-type" data-placeholder="유형 선택" data-searchable-scope="page" aria-label="유형">
              <option value="" ${!typeVal?'selected':''}>유형 선택</option>
              <option value="A" ${typeVal==='A'?'selected':''}>A</option>
              <option value="AAAA" ${typeVal==='AAAA'?'selected':''}>AAAA</option>
              <option value="CNAME" ${typeVal==='CNAME'?'selected':''}>CNAME</option>
              <option value="MX" ${typeVal==='MX'?'selected':''}>MX</option>
              <option value="SRV" ${typeVal==='SRV'?'selected':''}>SRV</option>
              <option value="TXT" ${typeVal==='TXT'?'selected':''}>TXT</option>
              <option value="NS" ${typeVal==='NS'?'selected':''}>NS</option>
              <option value="PTR" ${typeVal==='PTR'?'selected':''}>PTR</option>
            </select>
          </td>
          <td><input type="text" name="host_name" class="form-input dns-record-inline-host" value="${escapeHtml(r.host_name||'')}" placeholder="예: www (@=루트)" aria-label="호스트명"></td>
          <td><input type="text" name="fqdn" class="form-input locked-input dns-record-inline-fqdn" value="${escapeHtml(fqdn)}" readonly disabled aria-label="FQDN"></td>
          <td><input type="text" name="ip_address" class="form-input dns-record-inline-ip" value="${escapeHtml(r.ip_address||'')}" placeholder="예: 10.0.0.10" list="dns-record-ip-datalist" aria-label="IP"></td>
          <td><input name="priority" class="form-input dns-record-inline-priority" type="text" inputmode="numeric" value="${escapeHtml(priorityVal)}" placeholder="(MX/SRV)" aria-label="Priority"></td>
          <td><input type="text" name="service_name" class="form-input" value="${escapeHtml(r.service_name||'')}" placeholder="예: api" aria-label="서비스"></td>
          <td><input type="text" name="remark" class="form-input" value="${escapeHtml(r.remark||'')}" aria-label="비고"></td>
          <td class="system-actions">
            <input type="hidden" name="ttl" value="${escapeHtml(ttlVal)}">
            <button type="button" class="action-btn" data-action="save" title="저장" aria-label="저장">
              <img src="${SAVE_ICON_SRC}" alt="저장" class="action-icon">
            </button>
            <span class="action-btn-spacer" aria-hidden="true"></span>
          </td>
        </tr>
      `;
    }

    function syncInlineFqdn(row){
      try{
        const hostEl = row.querySelector('.dns-record-inline-host');
        const fqdnEl = row.querySelector('.dns-record-inline-fqdn');
        if(!hostEl || !fqdnEl) return;
        fqdnEl.value = fqdnFrom(hostEl.value, cachedDomain);
      }catch(_e){}
    }

    function syncInlinePriority(row){
      try{
        const typeEl = row.querySelector('.dns-record-inline-type');
        const prEl = row.querySelector('.dns-record-inline-priority');
        if(!typeEl || !prEl) return;
        const t = String(typeEl.value || '').toUpperCase();
        const enabled = (t === 'MX' || t === 'SRV');
        prEl.disabled = !enabled;
        prEl.readOnly = !enabled;
        prEl.classList.toggle('locked-input', !enabled);
        if(!enabled) prEl.value = '';
      }catch(_e){}
    }

    function collectInlinePayload(row){
      const get = (sel)=>{
        const el = row.querySelector(sel);
        return el ? String(el.value == null ? '' : el.value).trim() : '';
      };
      const payload = {
        status: get('select[name="status"]'),
        record_type: get('select[name="record_type"]'),
        host_name: get('input[name="host_name"]'),
        ip_address: get('input[name="ip_address"]'),
        ttl: get('input[name="ttl"]'),
        service_name: get('input[name="service_name"]'),
        remark: get('input[name="remark"]'),
        priority: get('input[name="priority"]'),
      };

      if(payload.status === '') delete payload.status;
      if(payload.record_type === '') delete payload.record_type;
      if(payload.host_name === '') delete payload.host_name;
      if(payload.ip_address === '') delete payload.ip_address;
      if(payload.service_name === '') delete payload.service_name;
      if(payload.remark === '') delete payload.remark;

      if(payload.ttl === '') payload.ttl = 3600;
      else payload.ttl = parseInt(String(payload.ttl).replace(/[^0-9]/g,''), 10) || 3600;

      if(payload.priority === '') delete payload.priority;
      else payload.priority = parseInt(String(payload.priority).replace(/[^0-9\-]/g,''), 10);

      return payload;
    }

    async function openInlineCreate(){
      if(!await ensureNoInlineEditor()) return;
      const html = editorRowHtml({ mode:'create', record:null });
      tbody.insertAdjacentHTML('afterbegin', html);
      const row = tbody.querySelector('tr.dns-record-editor');
      inlineEditor = { active:true, mode:'create', recordId:0, originalRowHtml:'' };
      if(empty) empty.hidden = true;
      if(row){
        syncSearchableSelectsSoon(row);
        syncInlineFqdn(row);
        syncInlinePriority(row);
        const focusEl = row.querySelector('select[name="record_type"], input[name="host_name"], input');
        try{ focusEl && focusEl.focus && focusEl.focus(); }catch(_e){}
      }
    }

    async function openInlineEdit(record){
      if(!record || !record.id) return;
      if(!await ensureNoInlineEditor()) return;
      const tr = tbody.querySelector(`tr[data-id="${record.id}"]`);
      if(!tr) return;
      const original = tr.outerHTML;
      tr.insertAdjacentHTML('afterend', editorRowHtml({ mode:'edit', record }));
      const editorRow = tr.nextElementSibling;
      tr.remove();
      inlineEditor = { active:true, mode:'edit', recordId:record.id, originalRowHtml:original };
      if(empty) empty.hidden = true;
      if(editorRow){
        syncSearchableSelectsSoon(editorRow);
        syncInlineFqdn(editorRow);
        syncInlinePriority(editorRow);
      }
    }

    async function refresh(){
      if(!cachedDomain){
        try{
          const policy = await fetchPolicy(policyId);
          cachedDomain = String(policy.domain || '').trim();
        }catch(_e){ cachedDomain = ''; }
      }
      const res = await apiJson(`${POLICY_API}/${policyId}/records?page=${state.page}&page_size=${state.pageSize}`);
      state.items = res.items || [];
      state.total = res.total || 0;
      tbody.innerHTML = state.items.map(buildRow).join('');
      inlineEditor = { active:false, mode:'', recordId:0, originalRowHtml:'' };

      if(empty) empty.hidden = (state.total || 0) !== 0;
      renderPagination();
      updateSelectAll();
      updateDownloadButtonState();
    }

    async function executeDelete(recordId){
      try{
        await apiJson(`${POLICY_API}/${policyId}/records/${recordId}`, { method:'DELETE' });
        state.selected.delete(recordId);
        await refresh();
      }catch(err){
        notifyMessage(err.message || '삭제 중 오류가 발생했습니다.', '삭제 실패', { kind: 'error' });
      }
    }

    function handleDelete(recordId){
      dnsRecordOpenDeleteModal(recordId);
    }

    tbody.addEventListener('click', (e)=>{
      const btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
      if(!btn) return;
      const action = btn.getAttribute('data-action');

      if(action === 'save'){
        const row = btn.closest('tr.dns-record-editor');
        if(!row) return;
        (async ()=>{
          try{
            const payload = collectInlinePayload(row);
            const mode = row.getAttribute('data-mode') || 'create';
            const recordId = parseInt(row.getAttribute('data-id') || '0', 10) || 0;

            btn.disabled = true;
            if(mode === 'edit' && recordId){
              await apiJson(`${POLICY_API}/${policyId}/records/${recordId}`, {
                method:'PUT',
                headers:{ 'Content-Type':'application/json' },
                body: JSON.stringify(payload),
              });
            }else{
              await apiJson(`${POLICY_API}/${policyId}/records`, {
                method:'POST',
                headers:{ 'Content-Type':'application/json' },
                body: JSON.stringify(payload),
              });
            }
            await refresh();
          }catch(err){
            btn.disabled = false;
            notifyMessage(err.message || '저장 중 오류가 발생했습니다.', '저장 실패', { kind: 'error' });
          }
        })();
        return;
      }

      const id = parseInt(btn.getAttribute('data-id')||'0',10) || 0;
      if(!id) return;
      const rec = state.items.find(x=>x.id === id);
      if(action === 'edit'){ openInlineEdit(rec); }
      if(action === 'delete') handleDelete(id);
    });

    tbody.addEventListener('input', (e)=>{
      const row = e.target && e.target.closest ? e.target.closest('tr.dns-record-editor') : null;
      if(!row) return;
      if(e.target.classList && e.target.classList.contains('dns-record-inline-host')) syncInlineFqdn(row);

      if(e.target.classList && e.target.classList.contains('dns-record-inline-ip')){
        if(!ipDatalist) return;
        const q = String(e.target.value || '').trim();
        clearTimeout(row._ipSuggestTimer);
        row._ipSuggestTimer = setTimeout(async ()=>{
          try{
            if(q.length < 2){ ipDatalist.innerHTML = ''; return; }
            const res = await apiJson(`/api/network/ip-addresses/suggest?q=${encodeURIComponent(q)}&limit=20`);
            const items = res.items || [];
            ipDatalist.innerHTML = items.map(v=>`<option value="${escapeHtml(v)}"></option>`).join('');
          }catch(_e){}
        }, 150);
      }
    });

    tbody.addEventListener('change', (e)=>{
      const row = e.target && e.target.closest ? e.target.closest('tr.dns-record-editor') : null;
      if(row && e.target.classList && e.target.classList.contains('dns-record-inline-type')) syncInlinePriority(row);
    });

    tbody.addEventListener('change', (e)=>{
      const cb = e.target;
      if(!cb || !cb.classList || !cb.classList.contains('dns-record-row-select')) return;
      const id = parseInt(cb.getAttribute('data-id')||'0',10) || 0;
      if(!id) return;
      if(cb.checked) state.selected.add(id);
      else state.selected.delete(id);
      try{
        const tr = cb.closest && cb.closest('tr');
        if(tr) tr.classList.toggle('selected', !!cb.checked);
      }catch(_e){}
      updateSelectAll();
    });

    selectAll?.addEventListener('change', ()=>{
      const boxes = tbody.querySelectorAll('.dns-record-row-select');
      state.selected.clear();
      boxes.forEach((b)=>{
        b.checked = selectAll.checked;
        const id = parseInt(b.getAttribute('data-id')||'0',10) || 0;
        if(selectAll.checked && id) state.selected.add(id);
        try{
          const tr = b.closest && b.closest('tr');
          if(tr) tr.classList.toggle('selected', !!selectAll.checked);
        }catch(_e){}
      });
    });

    pageNumbers?.addEventListener('click', (e)=>{
      const btn = e.target && e.target.closest ? e.target.closest('button[data-page]') : null;
      if(!btn) return;
      state.page = parseInt(btn.getAttribute('data-page')||'0',10) || 1;
      refresh();
    });

    btnFirst?.addEventListener('click', ()=>{ state.page = 1; refresh(); });
    btnPrev?.addEventListener('click', ()=>{ state.page = Math.max(1, state.page-1); refresh(); });
    btnNext?.addEventListener('click', ()=>{ state.page = Math.min(totalPages(), state.page+1); refresh(); });
    btnLast?.addEventListener('click', ()=>{ state.page = totalPages(); refresh(); });

    pageSizeSel.addEventListener('change', ()=>{
      state.pageSize = parseInt(pageSizeSel.value,10) || 10;
      state.page = 1;
      refresh();
    });

    const addBtn = document.getElementById('dns-record-row-add-btn');
    addBtn?.addEventListener('click', ()=>{ openInlineCreate(); });

    if(downloadBtn){
      setDisabled(downloadBtn, true);
      downloadBtn.title = 'CSV 내보낼 항목이 없습니다.';
      downloadBtn.addEventListener('click', async ()=>{
        try{
          setDisabled(downloadBtn, true);
          downloadBtn.title = 'CSV를 준비 중입니다...';

          const items = await getRecordsForCsv();
          if(!items || !items.length){
            notifyMessage('CSV 내보낼 항목이 없습니다.', 'CSV 다운로드', { kind: 'info' });
            return;
          }

          const csv = buildRecordsCsv(items);
          const today = new Date().toISOString().slice(0,10);
          downloadTextAsFile(`dns_records_${policyId}_${today}.csv`, csv, 'text/csv;charset=utf-8;');
          notifyMessage('CSV 파일이 다운로드되었습니다.', 'CSV 다운로드', { kind: 'success' });
        }catch(err){
          const msg = (err && err.message) ? err.message : 'CSV 다운로드 중 오류가 발생했습니다.';
          notifyMessage(msg, 'CSV 다운로드 실패', { kind: 'error' });
        }finally{
          updateDownloadButtonState();
        }
      });
    }

    document.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape'){
        const row = tbody.querySelector('tr.dns-record-editor');
        if(row) closeInlineEditor({ restore:true });
      }
    });

    await refresh();
    syncSearchableSelectsSoon(table || tbody);
  }

  // ------------------------------------------------------------
  // Log tab — 공유 tab14-log.js 가 처리 (initLogTab 제거됨)
  // ------------------------------------------------------------


  // ------------------------------------------------------------
  // File tab (diagram + attachments)
  // ------------------------------------------------------------

  async function initFileTab(){
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

    if(!diagramBox && !attachDrop && !attachList) return;

    const policyId = parseInt(qs('id') || qs('policy_id') || qs('policyId') || govDetailId() || '0', 10) || 0;
    if(!policyId) return;

    try{
      const policy = await fetchPolicy(policyId);
      setPageHeaderFromPolicy(policy);
    }catch(_e){}

    function showNotice(msg){
      const text = (msg == null) ? '' : String(msg);
      try{ alert(text); }catch(_e){}
      if(noticeText) noticeText.textContent = text;
      closeModal(noticeModal);
    }

    function hideNotice(){ closeModal(noticeModal); }

    noticeOk?.addEventListener('click', (e)=>{ e.preventDefault(); hideNotice(); });
    noticeClose?.addEventListener('click', (e)=>{ e.preventDefault(); hideNotice(); });
    noticeModal?.addEventListener('click', (e)=>{ if(e.target === noticeModal) hideNotice(); });

    function setDiagramPreview(url){
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

    diagramImg?.addEventListener('error', ()=>{ setDiagramPreview(''); });

    function downloadUrlFromToken(token){
      if(!token) return '';
      return `/api/uploads/${encodeURIComponent(token)}/download`;
    }

    function updateAttachCount(){
      if(!attachCount) return;
      const n = attachList ? attachList.querySelectorAll('li').length : 0;
      attachCount.textContent = String(n);
      attachCount.classList.remove('large-number','very-large-number');
      if(n >= 100) attachCount.classList.add('very-large-number');
      else if(n >= 10) attachCount.classList.add('large-number');
    }

    function humanSize(bytes){
      const n = (typeof bytes === 'number') ? bytes : parseInt(String(bytes || ''), 10);
      if(!Number.isFinite(n) || n < 0) return '-';
      if(n < 1024) return `${n} B`;
      const units = ['KB','MB','GB','TB'];
      let v = n / 1024;
      let i = 0;
      while(v >= 1024 && i < units.length - 1){
        v /= 1024;
        i++;
      }
      const digits = v >= 100 ? 0 : (v >= 10 ? 1 : 2);
      return `${v.toFixed(digits)} ${units[i]}`;
    }

    async function uploadFile(file){
      const fd = new FormData();
      fd.append('file', file);
      const rec = await apiJson('/api/uploads', { method:'POST', body: fd });
      return {
        uploadToken: rec.id,
        fileName: rec.name,
        fileSize: rec.size,
        downloadUrl: downloadUrlFromToken(rec.id),
      };
    }

    async function listDiagrams(){
      const res = await apiJson(`/api/network/dns-diagrams?policy_id=${policyId}`);
      return res.items || [];
    }

    async function createDiagram(payload){
      const res = await apiJson('/api/network/dns-diagrams', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(payload),
      });
      return res.item;
    }

    async function deleteDiagram(diagramId){
      const res = await apiJson(`/api/network/dns-diagrams/${diagramId}`, { method:'DELETE' });
      return res.deleted;
    }

    function renderAttachList(items){
      if(!attachList) return;
      const attachItems = items.filter(x => (x.entry_type||'') === 'ATTACHMENT');
      attachList.innerHTML = '';
      (attachItems || []).forEach((it)=>{
        const li = document.createElement('li');
        li.className = 'attach-item';
        li.dataset.id = String(it.id);
        li.dataset.uploadToken = String(it.upload_token || '');

        const fileName = it.file_name || it.title || '파일';
        const sizeText = humanSize(it.file_size);
        const token = it.upload_token || '';
        const href = it.file_path || (token ? downloadUrlFromToken(token) : '');
        const ext = (String(fileName).split('.').pop() || '').slice(0, 6).toUpperCase();

        li.innerHTML = `
          <div class="file-chip"><span class="file-badge">${escapeHtml(ext || 'FILE')}</span><span class="name">${escapeHtml(String(fileName))}</span><span class="size">${escapeHtml(sizeText)}</span></div>
          <div class="chip-actions">
            <button class="icon-btn js-att-dl" type="button" title="다운로드" aria-label="다운로드" ${href ? '' : 'disabled'}>
              <img src="/static/image/svg/list/free-icon-download.svg" alt="다운" class="action-icon">
            </button>
            <button type="button" class="icon-btn danger js-att-del" data-action="delete" data-id="${it.id}" title="삭제" aria-label="삭제">
              <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">
            </button>
          </div>
        `;
        li.dataset.href = href;
        attachList.appendChild(li);
      });
      updateAttachCount();
    }

    let currentPrimary = null;
    let pendingDiagramFile = null;

    // Reduce confirm fatigue: once user confirms replace/delete, keep going
    // without re-prompting for the rest of this page session.
    let skipReplaceConfirm = false;
    let skipDeleteConfirm = false;

    function showReplaceConfirm(file){
      pendingDiagramFile = file || null;

      if(skipReplaceConfirm){
        handleConfirmedReplace();
        return;
      }

      const name = file && file.name ? String(file.name) : '';
      const msg = name ? `기존 구성도를 "${name}" 파일로 교체하시겠습니까?` : '기존 구성도를 교체하시겠습니까?';
      if(replaceText) replaceText.textContent = msg;
      let ok = false;
      try{ ok = !!confirm(msg); }catch(_e){ ok = false; }
      if(ok){
        skipReplaceConfirm = true;
        handleConfirmedReplace();
      }else{
        pendingDiagramFile = null;
      }
    }

    function hideReplaceConfirm(){
      pendingDiagramFile = null;
      closeModal(replaceModal);
    }

    replaceCancel?.addEventListener('click', (e)=>{ e.preventDefault(); hideReplaceConfirm(); });
    replaceClose?.addEventListener('click', (e)=>{ e.preventDefault(); hideReplaceConfirm(); });
    replaceModal?.addEventListener('click', (e)=>{ if(e.target === replaceModal) hideReplaceConfirm(); });

    async function refresh(){
      const items = await listDiagrams();
      currentPrimary = items.find(x => x.entry_type === 'DIAGRAM' && x.is_primary) || null;
      if(currentPrimary && currentPrimary.upload_token) setDiagramPreview(downloadUrlFromToken(currentPrimary.upload_token));
      else setDiagramPreview('');
      renderAttachList(items);
    }

    async function handleConfirmedReplace(){
      const file = pendingDiagramFile;
      hideReplaceConfirm();
      if(!file) return;
      try{
        if(currentPrimary){
          await deleteDiagram(currentPrimary.id);
          currentPrimary = null;
        }
        const up = await uploadFile(file);
        const created = await createDiagram({
          policy_id: policyId,
          entry_type: 'DIAGRAM',
          file_name: up.fileName,
          file_size: up.fileSize,
          upload_token: up.uploadToken,
          is_primary: true,
        });
        currentPrimary = created;
        await refresh();
      }catch(err){
        showNotice(err.message || '구성도 업로드 중 오류가 발생했습니다.');
      }
    }

    replaceOk?.addEventListener('click', (e)=>{ e.preventDefault(); handleConfirmedReplace(); });
    replaceOk?.addEventListener('click', ()=>{ skipReplaceConfirm = true; });

    function isImageFile(file){
      const mime = (file?.type || '').toLowerCase();
      const name = (file?.name || '').toLowerCase();
      return mime.startsWith('image/') && (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.gif') || name.endsWith('.webp'));
    }

    async function handleDiagramPick(file){
      if(!file) return;
      if(!isImageFile(file)){
        showNotice('이미지 파일만 업로드 가능합니다.');
        return;
      }
      if(currentPrimary) showReplaceConfirm(file);
      else {
        try{
          const up = await uploadFile(file);
          currentPrimary = await createDiagram({
            policy_id: policyId,
            entry_type: 'DIAGRAM',
            file_name: up.fileName,
            file_size: up.fileSize,
            upload_token: up.uploadToken,
            is_primary: true,
          });
          await refresh();
        }catch(err){
          showNotice(err.message || '구성도 업로드 중 오류가 발생했습니다.');
        }
      }
    }

    diagramBox?.addEventListener('click', ()=>{ diagramInput?.click(); });
    diagramBox?.addEventListener('keydown', (e)=>{ if(e.key === 'Enter' || e.key === ' ') diagramInput?.click(); });
    diagramInput?.addEventListener('change', ()=>{ const f = diagramInput.files && diagramInput.files[0]; handleDiagramPick(f); diagramInput.value=''; });

    diagramBox?.addEventListener('dragover', (e)=>{ e.preventDefault(); diagramBox.classList.add('dragover'); });
    diagramBox?.addEventListener('dragleave', ()=>{ diagramBox.classList.remove('dragover'); });
    diagramBox?.addEventListener('drop', (e)=>{
      e.preventDefault();
      diagramBox.classList.remove('dragover');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      handleDiagramPick(f);
    });

    diagramClear?.addEventListener('click', async (e)=>{
      e.preventDefault();
      if(!currentPrimary) return;
      {
        if(!skipDeleteConfirm){
          let ok = false;
          try{ ok = !!confirm('구성도를 삭제하시겠습니까?'); }catch(_e){ ok = false; }
          if(!ok) return;
          skipDeleteConfirm = true;
        }
      }
      try{
        await deleteDiagram(currentPrimary.id);
        currentPrimary = null;
        await refresh();
      }catch(err){
        showNotice(err.message || '삭제 중 오류가 발생했습니다.');
      }
    });

    async function handleAttachFiles(files){
      const list = Array.from(files || []).filter(Boolean);
      if(!list.length) return;
      try{
        for(const f of list){
          const up = await uploadFile(f);
          await createDiagram({
            policy_id: policyId,
            entry_type: 'ATTACHMENT',
            file_name: up.fileName,
            file_size: up.fileSize,
            upload_token: up.uploadToken,
          });
        }
        await refresh();
      }catch(err){
        showNotice(err.message || '첨부파일 업로드 중 오류가 발생했습니다.');
      }
    }

    attachDrop?.addEventListener('click', ()=>{ attachInput?.click(); });
    attachInput?.addEventListener('change', ()=>{ handleAttachFiles(attachInput.files); attachInput.value=''; });

    attachDrop?.addEventListener('dragover', (e)=>{ e.preventDefault(); attachDrop.classList.add('dragover'); });
    attachDrop?.addEventListener('dragleave', ()=>{ attachDrop.classList.remove('dragover'); });
    attachDrop?.addEventListener('drop', (e)=>{
      e.preventDefault();
      attachDrop.classList.remove('dragover');
      handleAttachFiles(e.dataTransfer && e.dataTransfer.files);
    });

    attachList?.addEventListener('click', async (e)=>{
      const dlBtn = e.target && e.target.closest ? e.target.closest('.js-att-dl') : null;
      if(dlBtn){
        const li = e.target.closest('li.attach-item');
        const href = li && li.dataset ? (li.dataset.href || '') : '';
        if(href) window.open(href, '_blank', 'noopener');
        return;
      }

      const delBtn = e.target && e.target.closest ? e.target.closest('button[data-action="delete"]') : null;
      if(!delBtn) return;
      const id = parseInt(delBtn.getAttribute('data-id')||'0',10) || 0;
      if(!id) return;
      {
        if(!skipDeleteConfirm){
          let ok = false;
          try{ ok = !!confirm('삭제하시겠습니까?'); }catch(_e){ ok = false; }
          if(!ok) return;
          skipDeleteConfirm = true;
        }
      }
      try{
        await deleteDiagram(id);
        await refresh();
      }catch(err){
        showNotice(err.message || '삭제 중 오류가 발생했습니다.');
      }
    });

    await refresh();
  }

  ready(async ()=>{
    try{ await initBasicTab(); }catch(_e){ try{ console.error('[dns-detail] initBasicTab error:', _e); }catch(_){} }
    try{ await initRecordTab(); }catch(_e){ try{ console.error('[dns-detail] initRecordTab error:', _e); }catch(_){} }
    // 변경이력(Log) 탭은 공유 tab14-log.js 가 처리
    try{ await initFileTab(); }catch(_e){ try{ console.error('[dns-detail] initFileTab error:', _e); }catch(_){} }
  });
})();
