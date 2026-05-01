// 데이터 삭제 관리 - 데이터 삭제 기록: 렌더/정렬/검색/페이징/CSV
(function() {
  const LS_KEY_RECORDS = 'ERASURE_RECORDS';
  const dateKeys = new Set(['work_date']);
  const state = { data: [], filtered: [], page: 1, pageSize: 10, sortKey: 'work_date', sortDir: 'desc', search: '' };
  const selected = new Set(); // key: serial
  let actionsBound = false;
  let initialized = false;
  let editingSerial = null;

  function loadData(){
    try {
      const raw = localStorage.getItem(LS_KEY_RECORDS);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : null;
    } catch { return null; }
  }
  function saveData(arr){
    try { localStorage.setItem(LS_KEY_RECORDS, JSON.stringify(arr||[])); } catch {}
  }

  function cmp(a,b,key,dir){
    let av=a[key], bv=b[key];
    if (dateKeys.has(key)) { av=new Date(av).getTime(); bv=new Date(bv).getTime(); }
    else { av=(av??'').toString().toLowerCase(); bv=(bv??'').toString().toLowerCase(); }
    const r = av>bv?1:(av<bv?-1:0); return dir==='asc'?r:-r;
  }

  function render(){
    const start=(state.page-1)*state.pageSize; const end=Math.min(start+state.pageSize,state.filtered.length);
    const rows=state.filtered.slice(start,end); const tbody=document.getElementById('physical-table-body'); if(!tbody) return;
    tbody.innerHTML = rows.map(r=>{
      const checked = selected.has(r.serial)?'checked':''; const fr=r.fail_reason||'';
      return `
      <tr data-serial="${r.serial}">
        <td data-col-key="select"><input type="checkbox" data-serial="${r.serial}" ${checked}></td>
        <td data-col-key="work_date">${r.work_date}</td>
        <td data-col-key="work_dept">${r.work_dept}</td>
        <td data-col-key="worker">${r.worker}</td>
        <td data-col-key="req_dept">${r.req_dept}</td>
        <td data-col-key="req_person">${r.req_person}</td>
        <td data-col-key="vendor">${r.vendor}</td>
        <td data-col-key="model">${r.model}</td>
        <td data-col-key="serial">${r.serial}</td>
        <td data-col-key="success"><span class="status-chip ${r.success==='성공'?'ok':'err'}">${r.success}</span></td>
        <td data-col-key="fail_reason">${fr}</td>
        <td data-col-key="actions">
          <button class="action-btn" title="편집" data-action="edit" data-serial="${r.serial}"><img src="/static/image/svg/edit.svg" class="action-icon" alt="편집"></button>
          <button class="action-btn" title="삭제" data-action="del" data-serial="${r.serial}"><img src="/static/image/svg/delete.svg" class="action-icon" alt="삭제"></button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('input[type="checkbox"]').forEach(cb=>{
      cb.addEventListener('change', (e)=>{
        const s=e.currentTarget.getAttribute('data-serial');
        if(e.currentTarget.checked) selected.add(s); else selected.delete(s);
        const tr = e.currentTarget.closest('tr');
        if (tr) tr.classList.toggle('selected', e.currentTarget.checked);
        updateSelectAllState();
      });
    });

    // row click toggle selection
    tbody.addEventListener('click', (e) => {
      const tr = e.target.closest('tr');
      if (!tr) return;
      if (e.target.closest('button') || e.target.closest('input[type="checkbox"]')) return;
      const serial = tr.getAttribute('data-serial');
      if (!serial) return;
      const willSelect = !selected.has(serial);
      if (willSelect) selected.add(serial); else selected.delete(serial);
      tr.classList.toggle('selected', willSelect);
      const cb = tr.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = willSelect;
      updateSelectAllState();
    });

    // actions delegation (rack style)
    if (!actionsBound) {
      tbody.addEventListener('click', (e)=>{
        const btn = e.target.closest('button'); if(!btn) return;
        const action = btn.getAttribute('data-action');
        const tr = btn.closest('tr'); const serial = tr?.getAttribute('data-serial'); if(!serial) return;
        const idx = state.data.findIndex(x=>x.serial===serial); if(idx<0) return;
        if(action==='del') {
          state.data.splice(idx,1);
          saveData(state.data);
          selected.delete(serial);
          applyFilter();
        }
        else if(action==='edit') {
          editingSerial = serial;
          openEditModal(state.data[idx]);
        }
      });
      actionsBound = true;
    }

    const info=document.getElementById('physical-pagination-info');
    if(info){ const showingStart=state.filtered.length?start+1:0; info.textContent=`${showingStart}-${end} / ${state.filtered.length}개 항목`; }
    renderPageNumbers();
    const badge=document.getElementById('physical-count'); if(badge) badge.textContent=String(state.filtered.length);
  }

  function renderPageNumbers(){
    const totalPages=Math.max(1,Math.ceil(state.filtered.length/state.pageSize)); const c=document.getElementById('physical-page-numbers'); if(!c) return;
    c.innerHTML = Array.from({length: totalPages}, (_,i)=>{ const p=i+1; const cls=p===state.page?'page-btn active':'page-btn'; return `<button class="${cls}" data-page="${p}">${p}</button>`; }).join('');
    c.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{ state.page=parseInt(btn.getAttribute('data-page'),10); render(); }));
    const first=document.getElementById('physical-first-page'); const prev=document.getElementById('physical-prev-page'); const next=document.getElementById('physical-next-page'); const last=document.getElementById('physical-last-page');
    if(first) first.onclick=()=>{ state.page=1; render(); };
    if(prev) prev.onclick=()=>{ state.page=Math.max(1,state.page-1); render(); };
    if(next) next.onclick=()=>{ state.page=Math.min(totalPages,state.page+1); render(); };
    if(last) last.onclick=()=>{ state.page=totalPages; render(); };
    updateSelectAllState();
  }

  function updateSelectAllState(){
    const selAll=document.getElementById('physical-select-all'); if(!selAll) return;
    const start=(state.page-1)*state.pageSize; const end=Math.min(start+state.pageSize,state.filtered.length);
    let checked=0,total=0; for(let i=start;i<end;i++){ if(selected.has(state.filtered[i].serial)) checked++; total++; }
    selAll.indeterminate=checked>0&&checked<total; selAll.checked=total>0&&checked===total;
  }

  function applySort(){ state.filtered.sort((a,b)=>cmp(a,b,state.sortKey,state.sortDir)); }
  function applyFilter(){ const q=state.search.trim().toLowerCase(); const keys=['work_date','work_dept','worker','req_dept','req_person','vendor','model','serial','success','fail_reason']; state.filtered=q?state.data.filter(r=>keys.some(k=>String(r[k]??'').toLowerCase().includes(q))):state.data.slice(); state.page=1; applySort(); render(); }

  // Modal helpers (Access Control style)
  function showModal(){ const m=document.getElementById('physical-edit-modal'); if(!m) return; m.style.display='flex'; setTimeout(()=>m.classList.add('show'),0); document.body.classList.add('modal-open'); }
  function hideModal(){ const m=document.getElementById('physical-edit-modal'); if(!m) return; m.classList.remove('show'); setTimeout(()=>{ m.style.display='none'; },150); document.body.classList.remove('modal-open'); editingSerial=null; }
  function fillForm(row){
    const g=(id)=>document.getElementById(id);
    g('physical-f-work_date').value=row.work_date||'';
    g('physical-f-work_dept').value=row.work_dept||'';
    g('physical-f-worker').value=row.worker||'';
    g('physical-f-req_dept').value=row.req_dept||'';
    g('physical-f-req_person').value=row.req_person||'';
    g('physical-f-vendor').value=row.vendor||'';
    g('physical-f-model').value=row.model||'';
    g('physical-f-serial').value=row.serial||'';
    g('physical-f-success').value=row.success||'성공';
    g('physical-f-fail_reason').value=row.fail_reason||'';
  }
  function readForm(){
    const val=(id)=>document.getElementById(id).value.trim();
    const success=val('physical-f-success')||'성공';
    return {
      work_date: val('physical-f-work_date'),
      work_dept: val('physical-f-work_dept'),
      worker: val('physical-f-worker'),
      req_dept: val('physical-f-req_dept'),
      req_person: val('physical-f-req_person'),
      vendor: val('physical-f-vendor'),
      model: val('physical-f-model'),
      serial: val('physical-f-serial'),
      success,
      fail_reason: success==='실패' ? val('physical-f-fail_reason') : ''
    };
  }
  function openEditModal(row){ fillForm(row); showModal(); }

  window.sortServerTable=function(_tab,key){ if(state.sortKey===key) state.sortDir=state.sortDir==='asc'?'desc':'asc'; else {state.sortKey=key; state.sortDir='asc';} applySort(); render(); };
  window.changeServerPageSize=function(){ const sel=document.getElementById('physical-page-size'); state.pageSize=parseInt(sel?.value||'10',10)||10; state.page=1; render(); };
  window.clearSearch=function(){ const input=document.getElementById('physical-search'); if(input) input.value=''; const clearBtn=document.getElementById('physical-search-clear'); if(clearBtn) clearBtn.style.display='none'; state.search=''; applyFilter(); };
  window.toggleServerSelectAll=function(){ const selAll=document.getElementById('physical-select-all'); const start=(state.page-1)*state.pageSize; const end=Math.min(start+state.pageSize,state.filtered.length); for(let i=start;i<end;i++){ const s=state.filtered[i].serial; if(selAll.checked) selected.add(s); else selected.delete(s);} render(); };
  window.downloadServerCSV=function(){ const headers=['작업일자','작업부서','작업자','요청부서','요청자','제조사','모델명','일련번호','성공여부','실패사유']; const rows=state.filtered.map(r=>[r.work_date,r.work_dept,r.worker,r.req_dept,r.req_person,r.vendor,r.model,r.serial,r.success,r.fail_reason]); const bom='\uFEFF'; const csv=[headers.join(','),...rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(','))].join('\r\n'); const blob=new Blob([bom+csv],{type:'text/csv;charset=utf-8;'}); const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); const fname=`데이터삭제기록_${y}${m}${dd}.csv`; const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=fname; a.click(); URL.revokeObjectURL(url); };

  function init(){
    if (initialized) return; initialized = true;
    const persisted = loadData();
    state.data = persisted || [];
    if (!persisted) saveData(state.data);
    state.filtered=state.data.slice(); applySort();
    const input=document.getElementById('physical-search'); const clearBtn=document.getElementById('physical-search-clear'); if(input) input.addEventListener('input',()=>{ state.search=input.value; if(clearBtn) clearBtn.style.display=input.value?'inline-flex':'none'; applyFilter(); });
    // Modal bindings
    const closeBtn=document.getElementById('physical-close-edit'); if(closeBtn) closeBtn.addEventListener('click', hideModal);
    const modal=document.getElementById('physical-edit-modal'); if(modal) modal.addEventListener('click',(e)=>{ if(e.target===modal) hideModal(); });
    document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') hideModal(); });
    const saveBtn=document.getElementById('physical-edit-save'); if(saveBtn) saveBtn.addEventListener('click',(e)=>{
      e.preventDefault();
      if(!editingSerial) { hideModal(); return; }
      const idx=state.data.findIndex(r=>r.serial===editingSerial); if(idx<0){ hideModal(); return; }
  const updated=readForm();
  state.data[idx] = { ...state.data[idx], ...updated };
  saveData(state.data);
      hideModal();
      applyFilter();
    });
    render();
  }

  window.initializeServerPage=init;
  document.addEventListener('DOMContentLoaded', init);
})();
