(function(){
  'use strict';

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function qs(name){
    try{ return new URLSearchParams(window.location.search).get(name); }catch(_e){ return null; }
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
    if(!k) return '-';
    if(k.endsWith('_detail')) return '기본정보';
    if(k.endsWith('_manager')) return '담당자';
    if(k.endsWith('_task')) return '작업이력';
    if(k.endsWith('_log')) return '변경이력';
    if(k.endsWith('_file')) return '구성/파일';
    return k;
  }

  function actionLabel(action){
    const a = String(action || '').trim().toUpperCase();
    if(a === 'CREATE') return '등록';
    if(a === 'UPDATE') return '수정';
    if(a === 'DELETE') return '삭제';
    return a || '-';
  }

  function renderMessage(item){
    const msg = (item && item.message) ? String(item.message) : '';
    if(msg.trim() !== '') return msg;
    const a = actionLabel(item && item.action);
    return a !== '-' ? a : '-';
  }

  function renderDetailText(item){
    const msg = renderMessage(item);
    const diff = item && item.diff ? item.diff : null;
    if(!diff) return msg;
    try{
      const pretty = JSON.stringify(diff, null, 2);
      return msg + "\n\n" + pretty;
    }catch(_e){
      return msg;
    }
  }

  function setDetailContent(el, raw){
    if(!el) return;
    const text = (raw == null) ? '' : String(raw);
    if('value' in el){ el.value = text; return; }
    // keep simple: show as plain text, preserve newlines
    el.textContent = text;
  }

  ready(async function(){
    const idRaw = qs('id');
    const lineId = idRaw ? parseInt(idRaw, 10) : NaN;

    const emptyEl = document.getElementById('lg-empty');
    const table = document.getElementById('lg-spec-table');
    const tbody = table ? table.querySelector('tbody') : null;
    const pageSizeSel = document.getElementById('lg-page-size');
    const addBtn = document.getElementById('lg-row-add');

    const paginationInfo = document.getElementById('lg-pagination-info');
    const pageNumbers = document.getElementById('lg-page-numbers');
    const btnFirst = document.getElementById('lg-first');
    const btnPrev = document.getElementById('lg-prev');
    const btnNext = document.getElementById('lg-next');
    const btnLast = document.getElementById('lg-last');

    const detailModalClose = document.getElementById('lg-detail-close');
    const detailText = document.getElementById('lg-detail-text');
    const detailReason = document.getElementById('lg-detail-reason');
    const detailReasonSave = document.getElementById('lg-detail-reason-save');
    const detailSave = document.getElementById('lg-detail-save');

    let activeLogId = null;

    if(addBtn){
      addBtn.disabled = true;
      addBtn.style.opacity = '0.5';
      addBtn.title = '변경이력은 자동으로 기록됩니다.';
      addBtn.setAttribute('aria-label', '변경이력은 자동으로 기록됩니다.');
    }

    if(detailModalClose){
      detailModalClose.addEventListener('click', function(){ closeModal('lg-detail-modal'); });
    }
    if(detailSave){
      detailSave.addEventListener('click', function(){ closeModal('lg-detail-modal'); });
    }

    async function saveReason(){
      if(!Number.isFinite(lineId)) return;
      const logId = Number(activeLogId);
      if(!Number.isFinite(logId)) return;
      const reason = detailReason ? String(detailReason.value || '') : '';
      const res = await apiRequest(`/api/network/leased-lines/${encodeURIComponent(lineId)}/logs/${encodeURIComponent(logId)}/reason`, {
        method: 'PUT',
        body: JSON.stringify({ reason }),
      });
      const item = res && (res.item || res);
      const reasonSaved = item && typeof item.reason === 'string' ? item.reason : reason;
      try{
        const row = tbody ? tbody.querySelector(`tr[data-log-id="${String(logId)}"]`) : null;
        if(row) row.dataset.reason = reasonSaved || '';
      }catch(_e){ }
      return reasonSaved;
    }

    if(detailReasonSave){
      detailReasonSave.addEventListener('click', function(e){
        e.preventDefault();
        saveReason().catch(function(err){
          console.error(err);
          try{ alert(err && err.message ? err.message : '변경 사유 저장 중 오류가 발생했습니다.'); }catch(_e){}
        });
      });
    }
    if(detailReason){
      detailReason.addEventListener('keydown', function(e){
        if(e.key === 'Enter'){
          e.preventDefault();
          saveReason().catch(function(err){
            console.error(err);
            try{ alert(err && err.message ? err.message : '변경 사유 저장 중 오류가 발생했습니다.'); }catch(_e){}
          });
        }
      });
    }

    let pageSize = 10;
    let currentPage = 1;
    let totalItems = 0;
    if(pageSizeSel){
      pageSize = parseInt(pageSizeSel.value, 10) || 10;
      pageSizeSel.addEventListener('change', function(){
        pageSize = parseInt(pageSizeSel.value, 10) || 10;
        currentPage = 1;
        refreshLogs().catch(function(){});
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
        b.addEventListener('click', function(){
          if(p === currentPage) return;
          currentPage = p;
          refreshLogs().catch(function(){});
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

    if(btnFirst){
      btnFirst.addEventListener('click', function(){
        if(currentPage <= 1) return;
        currentPage = 1;
        refreshLogs().catch(function(){});
      });
    }
    if(btnPrev){
      btnPrev.addEventListener('click', function(){
        if(currentPage <= 1) return;
        currentPage = Math.max(1, currentPage - 1);
        refreshLogs().catch(function(){});
      });
    }
    if(btnNext){
      btnNext.addEventListener('click', function(){
        const tp = totalPages();
        if(currentPage >= tp) return;
        currentPage = Math.min(tp, currentPage + 1);
        refreshLogs().catch(function(){});
      });
    }
    if(btnLast){
      btnLast.addEventListener('click', function(){
        const tp = totalPages();
        if(currentPage >= tp) return;
        currentPage = tp;
        refreshLogs().catch(function(){});
      });
    }

    function renderRows(items){
      if(!tbody) return;
      tbody.innerHTML = '';

      for(const item of (items || [])){
        const tr = document.createElement('tr');
        tr.dataset.logId = String(item.log_id);
        tr.dataset.reason = (item.reason || '');

        const createdAt = item.created_at || '';
        const action = actionLabel(item.action);
        const actor = item.actor || '-';
        const tab = tabLabel(item.tab_key);
        const message = renderMessage(item);

        tr.innerHTML = [
          `<td><input type="checkbox" class="row-checkbox" aria-label="행 선택"></td>`,
          `<td>${escapeHtml(createdAt)}</td>`,
          `<td>${escapeHtml(action)}</td>`,
          `<td>${escapeHtml(actor)}</td>`,
          `<td>${escapeHtml(tab)}</td>`,
          `<td class="lg-message-cell">${escapeHtml(message)}</td>`,
          `<td><button type="button" class="btn-secondary" data-action="detail">상세</button></td>`,
        ].join('');

        const btn = tr.querySelector('button[data-action="detail"]');
        if(btn){
          btn.addEventListener('click', function(){
            activeLogId = item.log_id;
            setDetailContent(detailText, renderDetailText(item));
            if(detailReason) detailReason.value = (tr.dataset.reason || '');
            openModal('lg-detail-modal');
          });
        }

        tbody.appendChild(tr);
      }
    }

    async function refreshLogs(){
      if(!Number.isFinite(lineId)){
        if(emptyEl) emptyEl.style.display = '';
        if(tbody) tbody.innerHTML = '';
        totalItems = 0;
        updatePaginationUI(0);
        return;
      }

      const res = await apiRequest(`/api/network/leased-lines/${encodeURIComponent(lineId)}/logs?page=${encodeURIComponent(currentPage)}&page_size=${encodeURIComponent(pageSize)}`);
      const items = res && res.items ? res.items : [];
      totalItems = res && typeof res.total === 'number' ? res.total : (items ? items.length : 0);

      renderRows(items);

      const hasItems = Array.isArray(items) && items.length > 0;
      if(emptyEl) emptyEl.style.display = hasItems ? 'none' : '';

      updatePaginationUI(Array.isArray(items) ? items.length : 0);
    }

    try{
      await refreshLogs();
    }catch(err){
      console.error(err);
      try{ alert(err && err.message ? err.message : '변경이력 조회 중 오류가 발생했습니다.'); }catch(_e){}
    }
  });
})();
