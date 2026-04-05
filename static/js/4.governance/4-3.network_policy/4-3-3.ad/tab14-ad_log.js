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

  function escapeHtml(s){
    return String(s ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function tabLabel(tabKey){
    const k = String(tabKey || '').trim();
    if(k === 'gov_ad_policy_detail') return '기본정보';
    if(k === 'gov_ad_policy_domain') return '도메인 관리';
    if(k === 'gov_ad_policy_account') return '계정 관리';
    if(k === 'gov_ad_policy_file') return '구성/파일';
    if(k === 'gov_ad_policy_log') return '변경이력';
    return k || '-';
  }

  ready(async function(){
    const idRaw = qs('id') || govDetailId();
    const adId = idRaw ? parseInt(idRaw, 10) : NaN;

    const emptyEl = document.getElementById('lg-empty');
    const table = document.getElementById('lg-spec-table');
    const tbody = table ? table.querySelector('tbody') : null;
    const pageSizeSel = document.getElementById('lg-page-size');
    const addBtn = document.getElementById('lg-row-add');

    const detailModalClose = document.getElementById('lg-detail-close');
    const detailText = document.getElementById('lg-detail-text');

    if(addBtn){
      // logs are auto-generated; keep button but disable to avoid confusion
      addBtn.disabled = true;
      addBtn.style.opacity = '0.5';
      addBtn.title = '변경이력은 자동으로 기록됩니다.';
      addBtn.setAttribute('aria-label', '변경이력은 자동으로 기록됩니다.');
    }

    if(detailModalClose){
      detailModalClose.addEventListener('click', function(){ closeModal('lg-detail-modal'); });
    }

    let pageSize = 50;
    if(pageSizeSel){
      pageSize = parseInt(pageSizeSel.value, 10) || 50;
      pageSizeSel.addEventListener('change', function(){
        pageSize = parseInt(pageSizeSel.value, 10) || 50;
        refreshLogs().catch(function(){});
      });
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

    function render(items){
      if(!tbody) return;
      tbody.innerHTML = '';

      if(!items || items.length === 0){
        if(emptyEl) emptyEl.style.display = '';
        return;
      }
      if(emptyEl) emptyEl.style.display = 'none';

      for(const it of items){
        const diffText = it.diff ? JSON.stringify(it.diff, null, 2) : '';
        const msg = it.message || '-';
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="checkbox" class="lg-row" data-id="${escapeHtml(it.log_id)}" aria-label="선택"></td>
          <td>${escapeHtml(it.created_at || '-')}</td>
          <td>${escapeHtml(it.action || '-')}</td>
          <td>${escapeHtml(it.actor || '-')}</td>
          <td>${escapeHtml(tabLabel(it.tab_key))}</td>
          <td>${escapeHtml(msg)}</td>
          <td>
            <button type="button" class="btn-primary" data-action="view" data-id="${escapeHtml(it.log_id)}">보기</button>
          </td>
        `;
        tr.dataset.detail = diffText || msg;
        tbody.appendChild(tr);
      }
    }

    async function refreshLogs(){
      if(!Number.isFinite(adId)){
        render([]);
        return;
      }
      const data = await apiRequest(`/api/network/ad/${encodeURIComponent(adId)}/logs?page=1&page_size=${encodeURIComponent(pageSize)}`, { method: 'GET' });
      const items = Array.isArray(data.items) ? data.items : [];
      render(items);
    }

    if(tbody){
      tbody.addEventListener('click', function(e){
        const btn = e.target && e.target.closest ? e.target.closest('button[data-action="view"]') : null;
        if(!btn) return;
        const row = btn.closest('tr');
        const detail = row ? (row.dataset.detail || '') : '';
        if(detailText) detailText.value = detail;
        openModal('lg-detail-modal');
      });
    }

    await refreshHeader();
    await refreshLogs();
  });
})();
