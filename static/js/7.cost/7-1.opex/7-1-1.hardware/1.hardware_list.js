// cost opex hardware list JS (pattern: empty state, manage_no links, no mock data)
(function(){
  const state = { data: [], pageSize: 10, page: 1, filtered: [] };
  const tbody = document.getElementById('system-table-body');
  const countBadge = document.getElementById('system-count');
  const emptyEl = document.getElementById('system-empty');
  const searchInput = document.getElementById('system-search');
  const pageSizeSelect = document.getElementById('system-page-size');
  const paginationInfo = document.getElementById('system-pagination-info');
  const pageNumbers = document.getElementById('system-page-numbers');

  function keyFromDetailUrl(href) {
    try {
      const url = new URL(String(href || ''), window.location.origin);
      const m = String(url.pathname || '').match(/^\/p\/([^\/]+)/);
      return (m && m[1]) ? String(m[1]) : '';
    } catch (_e) {
      return '';
    }
  }

  async function setCostDetailContextAndGo(detailUrl, row) {
    const href = String(detailUrl || '').replace(/\/$/, '');
    if (!href) return;
    const key = keyFromDetailUrl(href);
    if (!key) return;

    const pageToken = (row && (row.page_token || row.pageToken) || '').toString().trim();
    const manageNo = (row && row.manage_no || '').toString().trim();

    try {
      await fetch('/api/cost/detail-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, token: pageToken, manage_no: manageNo }),
        credentials: 'same-origin',
      });
    } catch (_e) {}

    window.location.href = href;
  }
  function render(){
    state.filtered = applyFilter(state.data);
    const total = state.filtered.length;
    countBadge.textContent = total;
    tbody.innerHTML='';
    if(total===0){
      emptyEl.hidden = false;
      paginationInfo.textContent = '0개 항목';
      pageNumbers.innerHTML='';
      return;
    }
    emptyEl.hidden = true;
    const start = (state.page-1)*state.pageSize;
    const rows = state.filtered.slice(start,start+state.pageSize);
    rows.forEach(row => tbody.appendChild(buildRow(row)));
    paginationInfo.textContent = total+'개 항목';
    buildPages(total);
  }
  function buildRow(row){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="row-check"></td>
      <td data-col="contract_status">${row.contract_status||'-'}</td>
      <td data-col="contract_name">${row.contract_name||'-'}</td>
      <td data-col="manage_no"></td>
      <td data-col="maint_vendor">${row.maint_vendor||'-'}</td>
      <td data-col="maint_qty_total">${row.maint_qty_total||'-'}</td>
      <td data-col="maint_qty_active">${row.maint_qty_active||'-'}</td>
      <td data-col="maint_start">${row.maint_start||'-'}</td>
      <td data-col="maint_end">${row.maint_end||'-'}</td>
      <td data-col="maint_amount">${row.maint_amount||'-'}</td>
      <td data-col="inspection_target">${row.inspection_target||'-'}</td>
      <td data-col="memo">${row.memo||'-'}</td>
      <td data-col="actions"><button type="button" class="mini-btn" title="열기">▶</button></td>`;
    const manageTd = tr.querySelector('[data-col="manage_no"]');
    const manageNo = row.manage_no || '-';
    const pageToken = (row.page_token || row.pageToken || '').toString().trim();
    const base = (window.__MODULE_DETAIL_URL || '').toString().replace(/\/$/, '');
    const detailHref = base || '';
    if (manageNo !== '-') {
      const a = document.createElement('a');
      a.textContent = manageNo;
      a.href = detailHref || '#';
      a.className = 'link-cell';
      a.addEventListener('click', (ev) => {
        if (!detailHref) { ev.preventDefault(); return; }
        ev.preventDefault();
        try {
          const selected = Object.assign({}, row);
          if(selected.id == null || selected.id === '') selected.id = manageNo;
          window.sessionStorage.setItem('cost_opex_hardware:selected:row', JSON.stringify(selected));
        } catch(_e) {}

        setCostDetailContextAndGo(detailHref, row);
      });
      manageTd.appendChild(a);
    } else {
      manageTd.textContent = '-';
    }

    const openBtn = tr.querySelector('button.mini-btn');
    if(openBtn){
      openBtn.addEventListener('click', () => {
        try {
          const selected = Object.assign({}, row);
          const fallbackKey = (selected.manage_no || selected.id || manageNo || '').toString();
          if(selected.id == null || selected.id === '') selected.id = fallbackKey;
          window.sessionStorage.setItem('cost_opex_hardware:selected:row', JSON.stringify(selected));
        } catch(_e) {}
        if (detailHref) setCostDetailContextAndGo(detailHref, row);
      });
    }
    return tr;
  }
  function applyFilter(data){
    const q = (searchInput.value||'').trim();
    if(!q) return data.slice();
    const parts = q.split('%').map(s=>s.trim().toLowerCase()).filter(Boolean);
    return data.filter(r => parts.every(p => Object.values(r).some(v => String(v).toLowerCase().includes(p))));
  }
  function buildPages(total){
    const pages = Math.ceil(total/state.pageSize)||1;
    if(state.page>pages) state.page = pages;
    pageNumbers.innerHTML='';
    for(let i=1;i<=pages;i++){
      const b=document.createElement('button');
      b.type='button';
      b.className='page-number-btn'+(i===state.page?' active':'');
      b.textContent=i;
      b.addEventListener('click',()=>{state.page=i;render();});
      pageNumbers.appendChild(b);
    }
  }
  pageSizeSelect.addEventListener('change',()=>{state.pageSize=parseInt(pageSizeSelect.value,10)||10;state.page=1;render();});
  searchInput.addEventListener('input',()=>{state.page=1;render();});
  // initial (no mock data)
  render();
})();
