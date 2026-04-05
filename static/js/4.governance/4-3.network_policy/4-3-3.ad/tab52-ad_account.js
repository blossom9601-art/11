(function(){
  'use strict';

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function qs(name){
    try{ return new URLSearchParams(window.location.search).get(name); }catch(_e){ return null; }
  }

  function govDetailId(){
    try{ return (document.body.dataset.govDetailId || '').trim() || null; }
    catch(_e){ return null; }
  }

  async function apiRequest(path, options){
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options && options.headers ? options.headers : {}) },
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

  function setText(id, value){
    const el = document.getElementById(id);
    if(!el) return;
    const v = (value == null || String(value).trim() === '') ? '-' : String(value);
    el.textContent = v;
  }

  function openModal(id){
    const modal = document.getElementById(id);
    if(!modal) return;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeModal(id){
    const modal = document.getElementById(id);
    if(!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function formToPayload(form){
    const fd = new FormData(form);
    const payload = {};
    for(const [k,v] of fd.entries()){
      payload[k] = typeof v === 'string' ? v.trim() : v;
    }
    return payload;
  }

  function escapeHtml(s){
    return String(s ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  // ---------------------------
  // Message modal (on-premise parity)
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

  // ---------------------------
  // Confirm modal (on-premise parity)
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

  function normalizeDateLabel(s){
    const v = String(s ?? '').trim();
    return v === '' ? '-' : v;
  }

  ready(async function(){
    const idRaw = qs('id') || govDetailId();
    const adId = idRaw ? parseInt(idRaw, 10) : NaN;

    const addBtn = document.getElementById('ad-account-add');
    const emptyEl = document.getElementById('ad-account-empty');
    const table = document.getElementById('ad-account-table');
    const tbody = table ? table.querySelector('tbody') : null;

    const modalClose = document.getElementById('ad-account-close');
    const modalSave = document.getElementById('ad-account-save');
    const modalTitle = document.getElementById('ad-account-modal-title');
    const form = document.getElementById('ad-account-form');

    const ownerUserSelect = document.getElementById('ad-account-owner-user');
    const ownerDeptHidden = document.getElementById('ad-account-owner-dept-id');

    let editingAccountId = null;
    let accounts = [];
    let userProfiles = [];

    function showError(message){
      notifyMessage(message, '오류', {kind: 'error'});
    }

    function resetForm(){
      if(!form) return;
      form.reset();
      const typeEl = form.querySelector('[name="account_type"]');
      if(typeEl) typeEl.value = 'SERVICE';
      const statusEl = form.querySelector('[name="status"]');
      if(statusEl) statusEl.value = 'ACTIVE';

      if(ownerUserSelect) ownerUserSelect.value = '';
      if(ownerDeptHidden) ownerDeptHidden.value = '';
    }

    function fillForm(item){
      if(!form) return;
      const set = (name, v) => {
        const el = form.querySelector(`[name="${name}"]`);
        if(el) el.value = (v == null) ? '' : String(v);
      };
      set('username', item.username);
      set('display_name', item.display_name);
      set('account_type', item.account_type || 'SERVICE');
      set('status', item.status || 'ACTIVE');
      set('owner', item.owner);
      set('owner_user_id', item.owner_user_id);
      set('owner_dept_id', item.owner_dept_id);
      set('privilege', item.privilege);
      set('password_expires_at', item.password_expires_at);
      set('password_rotated_at', item.password_rotated_at);
      set('purpose', item.purpose);
      set('note', item.note);
    }

    async function refreshUserProfiles(){
      if(!ownerUserSelect) return;
      try{
        const data = await apiRequest(`/api/user-profiles?limit=2000`, { method: 'GET' });
        userProfiles = Array.isArray(data.items) ? data.items : [];
      }catch(_e){
        userProfiles = [];
      }

      // Rebuild options (keep first manual option)
      const firstOpt = ownerUserSelect.querySelector('option[value=""]');
      ownerUserSelect.innerHTML = '';
      if(firstOpt){
        ownerUserSelect.appendChild(firstOpt);
      } else {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(직접입력)';
        ownerUserSelect.appendChild(opt);
      }

      for(const u of userProfiles){
        const opt = document.createElement('option');
        opt.value = String(u.id);
        const dept = u.department ? String(u.department) : '';
        const name = u.name ? String(u.name) : (u.emp_no ? String(u.emp_no) : String(u.id));
        const emp = u.emp_no ? String(u.emp_no) : '';
        opt.textContent = `${dept ? dept + ' / ' : ''}${name}${emp ? ' (' + emp + ')' : ''}`;
        opt.dataset.deptId = (u.department_id == null) ? '' : String(u.department_id);
        opt.dataset.deptName = dept;
        opt.dataset.userName = name;
        ownerUserSelect.appendChild(opt);
      }
    }

    function applyOwnerSelection(){
      if(!form || !ownerUserSelect) return;
      const ownerInput = form.querySelector('[name="owner"]');
      const selectedId = ownerUserSelect.value;
      if(!selectedId){
        if(ownerDeptHidden) ownerDeptHidden.value = '';
        return;
      }
      const opt = ownerUserSelect.querySelector(`option[value="${CSS.escape(selectedId)}"]`);
      if(!opt) return;
      const deptId = opt.dataset.deptId || '';
      const deptName = opt.dataset.deptName || '';
      const userName = opt.dataset.userName || '';
      if(ownerDeptHidden) ownerDeptHidden.value = deptId;
      // Keep legacy owner string filled for display/compat
      if(ownerInput){
        ownerInput.value = `${deptName ? deptName + ' ' : ''}${userName}`.trim();
      }
    }

    function render(){
      if(!tbody) return;
      tbody.innerHTML = '';

      if(!accounts || accounts.length === 0){
        if(emptyEl) emptyEl.style.display = '';
        return;
      }
      if(emptyEl) emptyEl.style.display = 'none';

      for(const item of accounts){
        const tr = document.createElement('tr');
        const ownerLabel = item.owner_user_name || (item.owner_user && item.owner_user.name) || item.owner || '-';
        tr.innerHTML = `
          <td><input type="checkbox" class="ad-account-row" data-id="${escapeHtml(item.account_id)}" aria-label="선택"></td>
          <td>${escapeHtml(item.username)}</td>
          <td>${escapeHtml(item.account_type || '-')}</td>
          <td>${escapeHtml(item.status || '-')}</td>
          <td>${escapeHtml(ownerLabel)}</td>
          <td>${escapeHtml(normalizeDateLabel(item.password_expires_at))}</td>
          <td>${escapeHtml((item.purpose || item.note) ? `${item.purpose || ''}${(item.purpose && item.note) ? ' / ' : ''}${item.note || ''}` : '-') }</td>
          <td>
            <button type="button" class="btn-primary" data-action="edit" data-id="${escapeHtml(item.account_id)}">수정</button>
            <button type="button" class="btn-secondary" data-action="delete" data-id="${escapeHtml(item.account_id)}">삭제</button>
          </td>
        `;
        tbody.appendChild(tr);
      }
    }

    async function refreshHeader(){
      if(!Number.isFinite(adId)){
        setText('page-header-title', 'AD POLICY');
        setText('page-header-subtitle', '대상 ID가 없습니다. 목록에서 항목을 선택하세요.');
        return;
      }
      try{
        const data = await apiRequest(`/api/network/ad/${encodeURIComponent(adId)}`, { method: 'GET' });
        setText('page-header-title', data.domain_name || data.domain || 'AD POLICY');
        setText('page-header-subtitle', data.role || '-');
      }catch(err){
        setText('page-header-title', 'AD POLICY');
        setText('page-header-subtitle', err && err.message ? err.message : 'AD 조회 실패');
      }
    }

    async function refreshAccounts(){
      if(!Number.isFinite(adId)){
        accounts = [];
        render();
        return;
      }
      const data = await apiRequest(`/api/network/ad/${encodeURIComponent(adId)}/accounts`, { method: 'GET' });
      accounts = Array.isArray(data.items) ? data.items : [];
      render();
    }

    function openCreate(){
      editingAccountId = null;
      if(modalTitle) modalTitle.textContent = '계정 추가';
      resetForm();
      applyOwnerSelection();
      openModal('ad-account-modal');
    }

    function openEdit(accountId){
      const item = accounts.find(x => String(x.account_id) === String(accountId));
      if(!item){ showError('대상을 찾을 수 없습니다.'); return; }
      editingAccountId = item.account_id;
      if(modalTitle) modalTitle.textContent = '계정 수정';
      fillForm(item);
      // Ensure select-driven owner wiring reflects current values
      applyOwnerSelection();
      openModal('ad-account-modal');
    }

    async function save(){
      if(!Number.isFinite(adId)){
        showError('대상 ID가 없습니다.');
        return;
      }
      if(!form) return;
      const payload = formToPayload(form);
      try{
        if(editingAccountId){
          await apiRequest(`/api/network/ad/accounts/${encodeURIComponent(editingAccountId)}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
        } else {
          await apiRequest(`/api/network/ad/${encodeURIComponent(adId)}/accounts`, {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        }
        closeModal('ad-account-modal');
        await refreshAccounts();
      }catch(err){
        showError(err && err.message ? err.message : '저장 실패');
      }
    }

    async function remove(accountId){
      const item = accounts.find(x => String(x.account_id) === String(accountId));
      const name = item ? item.username : '';
      const confirmed = await confirmMessage(`삭제하시겠습니까?${name ? `\n- ${name}` : ''}`, '삭제 확인');
      if(!confirmed) return;
      try{
        await apiRequest(`/api/network/ad/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
        await refreshAccounts();
      }catch(err){
        showError(err && err.message ? err.message : '삭제 실패');
      }
    }

    if(modalClose){
      modalClose.addEventListener('click', function(){ closeModal('ad-account-modal'); });
    }
    if(addBtn){
      addBtn.addEventListener('click', openCreate);
    }
    if(modalSave){
      modalSave.addEventListener('click', save);
    }

    if(ownerUserSelect){
      ownerUserSelect.addEventListener('change', applyOwnerSelection);
    }

    if(tbody){
      tbody.addEventListener('click', function(e){
        const btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
        if(!btn) return;
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        if(action === 'edit') openEdit(id);
        if(action === 'delete') remove(id);
      });
    }

    await refreshHeader();
    await refreshUserProfiles();
    await refreshAccounts();
  });
})();
