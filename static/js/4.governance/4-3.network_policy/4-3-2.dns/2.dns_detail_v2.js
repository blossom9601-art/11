(function(){
  'use strict';

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
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
    return String(s == null ? '' : s).replace(/[&<>"']/g, (m)=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[m]);
  }

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

    // Always render main legend keys (even when 0), but hide placeholder keys like '-' when they are 0.
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
      // Let CSS provide the neutral grey ring background
      pieEl.style.background = '';
      if(emptyEl) emptyEl.hidden = false;
      return;
    }
    if(emptyEl) emptyEl.hidden = true;

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

  async function initBasicTab(){
    const statusEl = document.getElementById('dns-status');
    const domainEl = document.getElementById('dns-domain');
    if(!statusEl || !domainEl) return;

    const policyId = parseInt(qs('id') || qs('policy_id') || qs('policyId') || '0', 10) || 0;
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

      // Page header: title=domain, subtitle=role
      setPageHeaderFromPolicy(policy);

      try{
        statusEl.innerHTML = statusPillHtml(policy.status);
      }catch(_e){
        statusEl.textContent = policy.status || '-';
      }
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

      // TTL: show comma grouping while typing, but keep only digits for saving.
      try{
        const ttlInput = editForm.querySelector('input[name="ttl"]');
        if(ttlInput){
          ttlInput.addEventListener('input', ()=>{
            const formatted = formatCommaNumberInput(ttlInput.value);
            ttlInput.value = formatted;
          });
          ttlInput.addEventListener('blur', ()=>{
            ttlInput.value = formatCommaNumberInput(ttlInput.value);
          });
        }
      }catch(_e){}

      // Enhance search-select (if blossom.js enhancer exists)
      try{
        if(window.enhanceSearchSelects){ window.enhanceSearchSelects(editForm); }
      }catch(_e){}
    }

    function collectEditPayload(){
      if(!editForm) return {};
      const fd = new FormData(editForm);
      const payload = {};
      for(const [k,v] of fd.entries()) payload[k] = String(v == null ? '' : v).trim();
      const ttlRaw = payload.ttl;
      const ttlDigits = String(ttlRaw == null ? '' : ttlRaw).replace(/[^0-9]/g,'');
      if(ttlDigits === '') payload.ttl = 3600;
      else payload.ttl = parseInt(ttlDigits, 10);
      return payload;
    }

    async function refresh(){
      const detail = await apiJson(`${POLICY_API}/${policyId}`);
      const policy = detail.item || detail;
      fillBasic(policy);

      // record status stats (from records tab)
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
      }catch(_e){
        // ignore stats failures
      }
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
        alert(err.message || '저장 중 오류가 발생했습니다.');
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

    const policyId = parseInt(qs('id') || qs('policy_id') || qs('policyId') || '0', 10) || 0;
    if(!policyId) return;

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

    let state = { page: 1, pageSize: parseInt(pageSizeSel.value,10)||10, total: 0, items: [], selected: new Set() };

    let inlineEditor = { active: false, mode: '', recordId: 0, originalRowHtml: '' };

    // Ensure the searchable-select helper is available early (prevents timing races).
    ensureSearchableSelectScript();

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
      const status = r.status || '-';
      const type = r.record_type || '-';
      const host = r.host_name || '-';
      const fqdn = r.fqdn || fqdnFrom(r.host_name, cachedDomain) || '-';
      const ip = r.ip_address || '-';
      const pr = (r.priority == null || r.priority === '') ? '-' : String(r.priority);
      const svc = r.service_name || '-';
      const remark = r.remark || '-';
      return `
        <tr data-id="${r.id}">
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
        if(total <= 0){
          paginationInfo.textContent = `0-0 / 0개 항목`;
        }else{
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
        for(let p = start; p <= end; p++){
          parts.push(`<button type="button" class="page-btn${p===page?' active':''}" data-page="${p}">${p}</button>`);
        }
        pageNumbers.innerHTML = parts.join('');
      }
    }

    function closeInlineEditor({ restore } = { restore: true }){
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

      inlineEditor = { active: false, mode: '', recordId: 0, originalRowHtml: '' };

      // If there are no items, show the empty state again.
      if(empty){
        empty.hidden = (state.total || 0) !== 0;
      }
    }

    function ensureNoInlineEditor(){
      const row = tbody.querySelector('tr.dns-record-editor');
      if(!row) return true;
      const ok = confirm('편집 중인 행이 있습니다. 취소하고 진행할까요?');
      if(!ok) return false;
      closeInlineEditor({ restore: true });
      return true;
    }

    const _pendingSearchableSelectRoots = [];
    let _searchableSelectScriptRequested = false;
    let _searchableSelectScriptBound = false;

    function syncSearchableSelects(root){
      try{
        if(!window.BlossomSearchableSelect || typeof window.BlossomSearchableSelect.syncAll !== 'function'){
          return false;
        }
        window.BlossomSearchableSelect.syncAll(root || document);
        return true;
      }catch(_e){
        // ignore
      }
      return false;
    }

    function flushPendingSearchableSelectRoots(){
      if(!window.BlossomSearchableSelect) return;
      while(_pendingSearchableSelectRoots.length){
        const r = _pendingSearchableSelectRoots.shift();
        try{ window.BlossomSearchableSelect.syncAll(r || document); }catch(_e){}
      }
    }

    function ensureSearchableSelectScript(){
      try{
        if(window.BlossomSearchableSelect){
          flushPendingSearchableSelectRoots();
          return true;
        }

        // If blossom.js already injected the script tag, bind load/error once.
        const existing = document.querySelector('script[src*="/static/js/ui/searchable_select.js"]');
        if(existing && !_searchableSelectScriptBound){
          _searchableSelectScriptBound = true;
          existing.addEventListener('load', () => flushPendingSearchableSelectRoots());
          existing.addEventListener('error', () => { /* ignore */ });
        }

        if(_searchableSelectScriptRequested) return false;
        _searchableSelectScriptRequested = true;

        if(existing) return false;

        const script = document.createElement('script');
        script.src = '/static/js/ui/searchable_select.js?v=1.0.1';
        script.addEventListener('load', () => flushPendingSearchableSelectRoots());
        script.addEventListener('error', () => { /* ignore */ });
        document.head.appendChild(script);
      }catch(_e){
        // ignore
      }
      return false;
    }

    function syncSearchableSelectsSoon(root){
      // In this page, selects are inserted dynamically (inline editor row).
      // The helper script may load after this file, so queue + retry.
      if(!window.BlossomSearchableSelect){
        if(root) _pendingSearchableSelectRoots.push(root);
        ensureSearchableSelectScript();
      }

      const ok = syncSearchableSelects(root);
      if(ok) return;
      setTimeout(()=> syncSearchableSelects(root), 0);
      setTimeout(()=> syncSearchableSelects(root), 120);
      setTimeout(()=> syncSearchableSelects(root), 300);
      setTimeout(()=> syncSearchableSelects(root), 700);
      setTimeout(()=> syncSearchableSelects(root), 1200);
      setTimeout(()=> syncSearchableSelects(root), 2000);
      setTimeout(()=> {
        // final attempt (also flush if helper arrived)
        ensureSearchableSelectScript();
        flushPendingSearchableSelectRoots();
        syncSearchableSelects(root);
      }, 3500);
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
            <select name="status" class="form-input search-select" data-searchable="true" data-searchable-scope="page" data-placeholder="선택" aria-label="상태">
              <option value="" ${!statusVal?'selected':''}>선택</option>
              <option value="활성" ${statusVal==='활성'?'selected':''}>활성</option>
              <option value="예약" ${statusVal==='예약'?'selected':''}>예약</option>
              <option value="비활성" ${statusVal==='비활성'?'selected':''}>비활성</option>
            </select>
          </td>
          <td>
            <select name="record_type" class="form-input search-select dns-record-inline-type" data-searchable="true" data-searchable-scope="page" data-placeholder="선택" aria-label="유형">
              <option value="" ${!typeVal?'selected':''}>선택</option>
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

      // Derived field
      delete payload.fqdn;

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

    function openInlineCreate(){
      if(!ensureNoInlineEditor()) return;
      const html = editorRowHtml({ mode: 'create', record: null });
      tbody.insertAdjacentHTML('afterbegin', html);
      const row = tbody.querySelector('tr.dns-record-editor');
      inlineEditor = { active: true, mode: 'create', recordId: 0, originalRowHtml: '' };
      if(empty) empty.hidden = true;
      if(row){
        syncSearchableSelectsSoon(row);
        syncInlineFqdn(row);
        syncInlinePriority(row);
        const focusEl = row.querySelector('select[name="record_type"], input[name="host_name"], input');
        try{ focusEl && focusEl.focus && focusEl.focus(); }catch(_e){}
      }
    }

    function openInlineEdit(record){
      if(!record || !record.id) return;
      if(!ensureNoInlineEditor()) return;
      const tr = tbody.querySelector(`tr[data-id="${record.id}"]`);
      if(!tr) return;
      const original = tr.outerHTML;
      tr.insertAdjacentHTML('afterend', editorRowHtml({ mode: 'edit', record }));
      const editorRow = tr.nextElementSibling;
      tr.remove();
      inlineEditor = { active: true, mode: 'edit', recordId: record.id, originalRowHtml: original };
      if(empty) empty.hidden = true;
      if(editorRow){
        syncSearchableSelectsSoon(editorRow);
        syncInlineFqdn(editorRow);
        syncInlinePriority(editorRow);
      }
    }

    async function refresh(){
      // Ensure domain cache (avoid relying on missing helpers)
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
      inlineEditor = { active: false, mode: '', recordId: 0, originalRowHtml: '' };

      if(empty){
        empty.hidden = (state.total || 0) !== 0;
      }
      renderPagination();
      updateSelectAll();
    }

    async function handleDelete(recordId){
      if(!confirm('삭제하시겠습니까?')) return;
      try{
        await apiJson(`${POLICY_API}/${policyId}/records/${recordId}`, { method:'DELETE' });
        state.selected.delete(recordId);
        await refresh();
      }catch(err){
        alert(err.message || '삭제 중 오류가 발생했습니다.');
      }
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
            alert(err.message || '저장 중 오류가 발생했습니다.');
          }
        })();
        return;
      }

      const id = parseInt(btn.getAttribute('data-id')||'0',10) || 0;
      if(!id) return;
      const rec = state.items.find(x=>x.id === id);
      if(action === 'edit') openInlineEdit(rec);
      if(action === 'delete') handleDelete(id);
    });

    tbody.addEventListener('input', (e)=>{
      const row = e.target && e.target.closest ? e.target.closest('tr.dns-record-editor') : null;
      if(!row) return;
      if(e.target.classList && e.target.classList.contains('dns-record-inline-host')){
        syncInlineFqdn(row);
      }

      if(e.target.classList && e.target.classList.contains('dns-record-inline-ip')){
        if(!ipDatalist) return;
        const q = String(e.target.value || '').trim();
        // simple debounce per-row
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
      if(row && e.target.classList && e.target.classList.contains('dns-record-inline-type')){
        syncInlinePriority(row);
      }
    });

    tbody.addEventListener('change', (e)=>{
      const cb = e.target;
      if(!cb || !cb.classList || !cb.classList.contains('dns-record-row-select')) return;
      const id = parseInt(cb.getAttribute('data-id')||'0',10) || 0;
      if(!id) return;
      if(cb.checked) state.selected.add(id);
      else state.selected.delete(id);
      updateSelectAll();
    });

    selectAll?.addEventListener('change', ()=>{
      const boxes = tbody.querySelectorAll('.dns-record-row-select');
      state.selected.clear();
      boxes.forEach(b=>{
        b.checked = selectAll.checked;
        const id = parseInt(b.getAttribute('data-id')||'0',10) || 0;
        if(selectAll.checked && id) state.selected.add(id);
      });
    });

    pageNumbers?.addEventListener('click', (e)=>{
      const btn = e.target && e.target.closest ? e.target.closest('button[data-page]') : null;
      if(!btn) return;
      const p = parseInt(btn.getAttribute('data-page')||'0',10) || 1;
      state.page = p;
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

    // Row-add button in header
    const addBtn = document.getElementById('dns-record-row-add-btn');
    addBtn?.addEventListener('click', ()=> openInlineCreate());

    document.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape'){
        const row = tbody.querySelector('tr.dns-record-editor');
        if(row) closeInlineEditor({ restore: true });
      }
    });

    await refresh();
    // Safety net: if the helper loads after this file, keep trying to enhance.
    syncSearchableSelectsSoon(table || tbody);
  }

  // ------------------------------------------------------------
  // Log tab (same DOM ids as IP log tab)
  // ------------------------------------------------------------

  async function initLogTab(){
    const table = document.getElementById('lg-spec-table');
    const empty = document.getElementById('lg-empty');
    const pageSizeSel = document.getElementById('lg-page-size');
    if(!table || !pageSizeSel) return;

    const tbody = table.querySelector('tbody');
    const policyId = parseInt(qs('id') || qs('policy_id') || qs('policyId') || '0', 10) || 0;
    if(!policyId) return;

    try{
      const policy = await fetchPolicy(policyId);
      setPageHeaderFromPolicy(policy);
    }catch(_e){}

    const paginationInfo = document.getElementById('lg-pagination-info');
    const btnFirst = document.getElementById('lg-first');
    const btnPrev = document.getElementById('lg-prev');
    const btnNext = document.getElementById('lg-next');
    const btnLast = document.getElementById('lg-last');
    const pageNumbers = document.getElementById('lg-page-numbers');

    const modal = document.getElementById('lg-detail-modal');
    const modalClose = document.getElementById('lg-detail-close');
    const modalOk = document.getElementById('lg-detail-save');
    const detailText = document.getElementById('lg-detail-text');
    const reasonInput = document.getElementById('lg-detail-reason');
    const reasonSave = document.getElementById('lg-detail-reason-save');

    let state = { page: 1, pageSize: parseInt(pageSizeSel.value,10)||10, total: 0, items: [], selected: new Set(), current: null };

    function totalPages(){
      return Math.max(1, Math.ceil((state.total||0)/(state.pageSize||10)));
    }

    function renderPagination(){
      const total = state.total || 0;
      const page = state.page;
      const pages = totalPages();
      if(paginationInfo) paginationInfo.textContent = `${total}개 항목`;
      if(btnFirst) btnFirst.disabled = page <= 1;
      if(btnPrev) btnPrev.disabled = page <= 1;
      if(btnNext) btnNext.disabled = page >= pages;
      if(btnLast) btnLast.disabled = page >= pages;

      if(pageNumbers){
        const maxBtns = 7;
        let start = Math.max(1, page - Math.floor(maxBtns/2));
        let end = Math.min(pages, start + maxBtns - 1);
        start = Math.max(1, end - maxBtns + 1);
        const nums = [];
        for(let p=start; p<=end; p++) nums.push(`<button type="button" class="page-number${p===page?' active':''}" data-page="${p}">${p}</button>`);
        pageNumbers.innerHTML = nums.join('');
      }
    }

    function openLogModal(item){
      state.current = item;
      if(detailText) detailText.textContent = item && item.detail ? String(item.detail) : '';
      if(reasonInput) reasonInput.value = item && item.reason ? String(item.reason) : '';
      openModal(modal);
    }

    async function refresh(){
      const res = await apiJson(`${POLICY_API}/${policyId}/logs?page=${state.page}&page_size=${state.pageSize}`);
      state.items = res.items || [];
      state.total = res.total || 0;

      if(!tbody) return;
      tbody.innerHTML = '';

      if(state.total === 0){
        if(empty) empty.hidden = false;
      }else if(empty){
        empty.hidden = true;
      }

      for(const item of state.items){
        const tr = document.createElement('tr');
        const checked = state.selected.has(item.id) ? 'checked' : '';
        tr.innerHTML = `
          <td><input type="checkbox" class="lg-row-select" data-id="${item.id}" ${checked}></td>
          <td>${escapeHtml(item.created_at || '')}</td>
          <td>${escapeHtml(item.action || '')}</td>
          <td>${escapeHtml(item.actor || '')}</td>
          <td>${escapeHtml(item.tab_key || '')}</td>
          <td>${escapeHtml(item.message || '')}</td>
          <td class="system-actions">
            <button type="button" class="action-btn" data-action="detail" data-id="${item.id}" title="세부내용" aria-label="세부내용">
              <img src="/static/image/svg/list/free-icon-search.svg" alt="보기" class="action-icon">
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      }

      renderPagination();
    }

    tbody?.addEventListener('click', (e)=>{
      const btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
      if(!btn) return;
      const id = parseInt(btn.getAttribute('data-id')||'0',10) || 0;
      if(!id) return;
      const item = state.items.find(x=>x.id===id);
      if(item) openLogModal(item);
    });

    tbody?.addEventListener('change', (e)=>{
      const cb = e.target;
      if(!cb || !cb.classList || !cb.classList.contains('lg-row-select')) return;
      const id = parseInt(cb.getAttribute('data-id')||'0',10) || 0;
      if(!id) return;
      if(cb.checked) state.selected.add(id);
      else state.selected.delete(id);
    });

    pageNumbers?.addEventListener('click', (e)=>{
      const btn = e.target && e.target.closest ? e.target.closest('button[data-page]') : null;
      if(!btn) return;
      state.page = parseInt(btn.getAttribute('data-page')||'1',10) || 1;
      refresh();
    });
    btnFirst?.addEventListener('click', ()=>{ state.page = 1; refresh(); });
    btnPrev?.addEventListener('click', ()=>{ state.page = Math.max(1, state.page-1); refresh(); });
    btnNext?.addEventListener('click', ()=>{ state.page = Math.min(totalPages(), state.page+1); refresh(); });
    btnLast?.addEventListener('click', ()=>{ state.page = totalPages(); refresh(); });

    pageSizeSel.addEventListener('change', ()=>{ state.pageSize = parseInt(pageSizeSel.value,10)||10; state.page = 1; refresh(); });

    modalClose?.addEventListener('click', ()=> closeModal(modal));
    modalOk?.addEventListener('click', ()=> closeModal(modal));
    modal?.addEventListener('click', (e)=>{ if(e.target === modal) closeModal(modal); });

    async function saveReason(){
      if(!state.current) return;
      const reason = reasonInput ? String(reasonInput.value||'') : '';
      try{
        const res = await apiJson(`${POLICY_API}/${policyId}/logs/${state.current.id}/reason`, {
          method:'PUT',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ reason }),
        });
        const updated = res.item || null;
        if(updated){
          state.current.reason = updated.reason;
          const idx = state.items.findIndex(x=>x.id===updated.id);
          if(idx >= 0) state.items[idx].reason = updated.reason;
        }
      }catch(err){
        alert(err.message || '변경 사유 저장 중 오류가 발생했습니다.');
      }
    }

    reasonSave?.addEventListener('click', (e)=>{ e.preventDefault(); saveReason(); });

    await refresh();
  }

  // ------------------------------------------------------------
  // File tab (diagram + attachments) for DNS: uses /api/network/dns-diagrams
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

    const policyId = parseInt(qs('id') || qs('policy_id') || qs('policyId') || '0', 10) || 0;
    if(!policyId) return;

    try{
      const policy = await fetchPolicy(policyId);
      setPageHeaderFromPolicy(policy);
    }catch(_e){}

    function showNotice(msg){
      const text = (msg == null) ? '' : String(msg);
      if(noticeText) noticeText.textContent = text;
      if(noticeModal){
        openModal(noticeModal);
      }else{
        alert(text);
      }
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

    async function uploadFile(file){
      const fd = new FormData();
      fd.append('file', file);
      const rec = await apiJson('/api/uploads', { method: 'POST', body: fd });
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
      attachList.innerHTML = attachItems.map((it)=>{
        const url = it.upload_token ? downloadUrlFromToken(it.upload_token) : '';
        const name = escapeHtml(it.file_name || '');
        return `<li data-id="${it.id}">
          <div class="attach-item">
            <a href="${url}" class="attach-name" target="_blank" rel="noopener">${name}</a>
            <button type="button" class="icon-btn danger" data-action="delete" data-id="${it.id}" title="삭제" aria-label="삭제">
              <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">
            </button>
          </div>
        </li>`;
      }).join('');
      updateAttachCount();
    }

    let currentPrimary = null;
    let pendingDiagramFile = null;

    function showReplaceConfirm(file){
      pendingDiagramFile = file || null;
      if(replaceText){
        const name = file && file.name ? String(file.name) : '';
        replaceText.textContent = name ? `기존 구성도를 "${name}" 파일로 교체하시겠습니까?` : '기존 구성도를 교체하시겠습니까?';
      }
      if(replaceModal) openModal(replaceModal);
      else {
        if(confirm('기존 구성도를 교체하시겠습니까?')) handleConfirmedReplace();
        else pendingDiagramFile = null;
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
      if(currentPrimary && currentPrimary.upload_token){
        setDiagramPreview(downloadUrlFromToken(currentPrimary.upload_token));
      }else{
        setDiagramPreview('');
      }
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
      if(!confirm('구성도를 삭제하시겠습니까?')) return;
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
      const btn = e.target && e.target.closest ? e.target.closest('button[data-action="delete"]') : null;
      if(!btn) return;
      const id = parseInt(btn.getAttribute('data-id')||'0',10) || 0;
      if(!id) return;
      if(!confirm('삭제하시겠습니까?')) return;
      try{
        await deleteDiagram(id);
        await refresh();
      }catch(err){
        showNotice(err.message || '삭제 중 오류가 발생했습니다.');
      }
    });

    await refresh();
  }

  ready(()=>{
    initBasicTab();
    initRecordTab();
    initLogTab();
    initFileTab();
  });
})();
