// 데이터 삭제 관리 - 데이터 삭제 시스템: 50개 샘플, 렌더/정렬/검색/페이징/CSV
(function() {
  const LS_KEY_SYSTEMS = 'ERASURE_SYSTEMS';
  const NUM_ROWS = 50;
  const state = { data: [], filtered: [], page: 1, pageSize: 10, sortKey: 'sys_vendor', sortDir: 'asc', search: '' };
  const selected = new Set(); // key: sys_serial
  let actionsBound = false;
  let initialized = false;
  let editingSerial = null; // null => add, otherwise edit target

  function rand(arr, i) { return arr[i % arr.length]; }
  function pad(n, w=2){ return String(n).padStart(w,'0'); }
  function makeSerial(i) { const base=(70000000 + i*157)%99999999; return 'SYS' + String(base).padStart(8,'0'); }

  function sampleData(){
    const vendors=['Samsung','Seagate','Western Digital','Hitachi','Toshiba','Dell','HPE','Lenovo'];
    const models=['R730','R740','ProLiant DL380','ThinkSystem SR650','PowerEdge T640','Ultrastar 12G','PM9A3','X300'];
    const sites=['본사 IDC','판교 IDC','강남 센터','용인 센터'];
    const locations=['1층 A열','1층 B열','2층 C열','2층 D열','3층 E열'];
    const depts=['인프라운영팀','보안운영팀','데이터관리팀','서비스운영팀'];
    const owners=['김민수','박지민','이도윤','최예린','정우진','한서연','오승민','유다은'];
    const arr=[];
    for(let i=0;i<NUM_ROWS;i++){
      arr.push({
        sys_vendor: rand(vendors, i+1),
        sys_model: rand(models, i+2),
        sys_serial: makeSerial(i+1),
        sys_site: rand(sites, i+3),
        sys_location: rand(locations, i+4),
        sys_dept: rand(depts, i+5),
        sys_owner: rand(owners, i+6),
      });
    }
    return arr;
  }

  function loadData(){
    try {
      const raw = localStorage.getItem(LS_KEY_SYSTEMS);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : null;
    } catch { return null; }
  }
  function saveData(arr){
    try { localStorage.setItem(LS_KEY_SYSTEMS, JSON.stringify(arr||[])); } catch {}
  }

  function cmp(a,b,key,dir){ const av=(a[key]??'').toString().toLowerCase(); const bv=(b[key]??'').toString().toLowerCase(); const r=av>bv?1:(av<bv?-1:0); return dir==='asc'?r:-r; }

  function render(){
    const start=(state.page-1)*state.pageSize; const end=Math.min(start+state.pageSize,state.filtered.length);
    const rows=state.filtered.slice(start,end); const tbody=document.getElementById('physical-table-body'); if(!tbody) return;
    tbody.innerHTML = rows.map(r=>{
      const checked = selected.has(r.sys_serial)?'checked':'';
      return `
      <tr data-serial="${r.sys_serial}">
        <td data-col-key="select"><input type="checkbox" data-serial="${r.sys_serial}" ${checked}></td>
        <td data-col-key="sys_vendor">${r.sys_vendor}</td>
        <td data-col-key="sys_model">${r.sys_model}</td>
        <td data-col-key="sys_serial">${r.sys_serial}</td>
        <td data-col-key="sys_site">${r.sys_site}</td>
        <td data-col-key="sys_location">${r.sys_location}</td>
        <td data-col-key="sys_dept">${r.sys_dept}</td>
        <td data-col-key="sys_owner">${r.sys_owner}</td>
        <td data-col-key="actions">
          <button class="action-btn" title="편집" data-action="edit" data-serial="${r.sys_serial}"><img src="/static/image/svg/edit.svg" class="action-icon" alt="편집"></button>
          <button class="action-btn" title="삭제" data-action="del" data-serial="${r.sys_serial}"><img src="/static/image/svg/delete.svg" class="action-icon" alt="삭제"></button>
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

    // actions delegation (rack style) — bind once
    if (!actionsBound) {
      tbody.addEventListener('click', (e)=>{
        const btn = e.target.closest('button'); if(!btn) return;
        const action = btn.getAttribute('data-action');
        const tr = btn.closest('tr'); const serial = tr?.getAttribute('data-serial'); if(!serial) return;
        const idx = state.data.findIndex(x=>x.sys_serial===serial); if(idx<0) return;
  if(action==='del') { selected.delete(serial); state.data.splice(idx,1); saveData(state.data); applyFilter(); }
        else if(action==='edit') {
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
    let checked=0,total=0; for(let i=start;i<end;i++){ if(selected.has(state.filtered[i].sys_serial)) checked++; total++; }
    selAll.indeterminate=checked>0&&checked<total; selAll.checked=total>0&&checked===total;
  }

  function applySort(){ state.filtered.sort((a,b)=>cmp(a,b,state.sortKey,state.sortDir)); }
  function applyFilter(){ const q=state.search.trim().toLowerCase(); const keys=['sys_vendor','sys_model','sys_serial','sys_site','sys_location','sys_dept','sys_owner']; state.filtered=q?state.data.filter(r=>keys.some(k=>String(r[k]??'').toLowerCase().includes(q))):state.data.slice(); state.page=1; applySort(); render(); }

  window.sortServerTable=function(_tab,key){ if(state.sortKey===key) state.sortDir=state.sortDir==='asc'?'desc':'asc'; else {state.sortKey=key; state.sortDir='asc';} applySort(); render(); };
  window.changeServerPageSize=function(){ const sel=document.getElementById('physical-page-size'); state.pageSize=parseInt(sel?.value||'10',10)||10; state.page=1; render(); };
  window.clearSearch=function(){ const input=document.getElementById('physical-search'); if(input) input.value=''; const clearBtn=document.getElementById('physical-search-clear'); if(clearBtn) clearBtn.style.display='none'; state.search=''; applyFilter(); };
  window.toggleServerSelectAll=function(){ const selAll=document.getElementById('physical-select-all'); const start=(state.page-1)*state.pageSize; const end=Math.min(start+state.pageSize,state.filtered.length); for(let i=start;i<end;i++){ const s=state.filtered[i].sys_serial; if(selAll.checked) selected.add(s); else selected.delete(s);} render(); };
  window.downloadServerCSV=function(){ const headers=['시스템 제조사','시스템 모델명','시스템 일련번호','시스템 장소','시스템 위치','시스템 담당부서','시스템 담당자']; const rows=state.filtered.map(r=>[r.sys_vendor,r.sys_model,r.sys_serial,r.sys_site,r.sys_location,r.sys_dept,r.sys_owner]); const bom='\uFEFF'; const csv=[headers.join(','),...rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(','))].join('\r\n'); const blob=new Blob([bom+csv],{type:'text/csv;charset=utf-8;'}); const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); const fname=`데이터삭제시스템_${y}${m}${dd}.csv`; const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=fname; a.click(); URL.revokeObjectURL(url); };

  function qs(id){ return document.getElementById(id); }
  function fillForm(row){
    qs('physical-f-sys_vendor').value = row?.sys_vendor || '';
    qs('physical-f-sys_model').value = row?.sys_model || '';
    qs('physical-f-sys_serial').value = row?.sys_serial || '';
    qs('physical-f-sys_site').value = row?.sys_site || '';
    qs('physical-f-sys_location').value = row?.sys_location || '';
    qs('physical-f-sys_dept').value = row?.sys_dept || '';
    qs('physical-f-sys_owner').value = row?.sys_owner || '';
  }
  function readForm(){
    return {
      sys_vendor: qs('physical-f-sys_vendor').value.trim(),
      sys_model: qs('physical-f-sys_model').value.trim(),
      sys_serial: qs('physical-f-sys_serial').value.trim(),
      sys_site: qs('physical-f-sys_site').value.trim(),
      sys_location: qs('physical-f-sys_location').value.trim(),
      sys_dept: qs('physical-f-sys_dept').value.trim(),
      sys_owner: qs('physical-f-sys_owner').value.trim(),
    };
  }
  function openAddModal(){ editingSerial=null; qs('physical-edit-title').textContent='데이터 삭제 시스템 등록'; fillForm({}); showModal(true); }
  function openEditModal(row){ editingSerial=row.sys_serial; qs('physical-edit-title').textContent='데이터 삭제 시스템 수정'; fillForm(row); showModal(true); }
  function showModal(show){
    const m=qs('physical-edit-modal'); if(!m) return;
    if(show){
      m.style.display='flex';
      m.classList.add('show');
      document.body.classList.add('modal-open');
    } else {
      m.style.display='none';
      m.classList.remove('show');
      document.body.classList.remove('modal-open');
    }
  }

  function init(){
    if (initialized) { render(); return; }
    initialized = true;
    const persisted = loadData();
    state.data = persisted || sampleData();
    if (!persisted) saveData(state.data);
    state.filtered=state.data.slice(); applySort();
    const input=document.getElementById('physical-search'); const clearBtn=document.getElementById('physical-search-clear');
    if(input) input.addEventListener('input',()=>{ state.search=input.value; if(clearBtn) clearBtn.style.display=input.value?'inline-flex':'none'; applyFilter(); });
    // modal bindings
    const openAdd=qs('physical-open-add'); if(openAdd) openAdd.addEventListener('click', openAddModal);
    const closeBtn=qs('physical-close-edit'); if(closeBtn) closeBtn.addEventListener('click', ()=>showModal(false));
    const modal=qs('physical-edit-modal');
    if(modal){
      modal.addEventListener('click',(e)=>{ if(e.target===modal) showModal(false); });
      document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') showModal(false); });
    }
    const saveBtn=qs('physical-edit-save'); if(saveBtn) saveBtn.addEventListener('click', (e)=>{
      e.preventDefault();
      const data=readForm();
      // basic required check
      if(!data.sys_vendor||!data.sys_model||!data.sys_serial||!data.sys_site||!data.sys_location||!data.sys_dept||!data.sys_owner){
        alert('필수 항목을 입력하세요.');
        return;
      }
      if(editingSerial){
        const idx=state.data.findIndex(x=>x.sys_serial===editingSerial);
        if(idx>=0) state.data[idx] = { ...state.data[idx], ...data };
      } else {
        // prevent duplicate serials
        if(state.data.some(x=>x.sys_serial===data.sys_serial)){
          alert('이미 존재하는 일련번호입니다.');
          return;
        }
        state.data.unshift(data);
      }
      saveData(state.data); applyFilter(); showModal(false);
    });
  const selAll=qs('physical-select-all'); if(selAll) selAll.addEventListener('change', ()=>window.toggleServerSelectAll());
  render();
  }

  window.initializeServerPage=init;
  document.addEventListener('DOMContentLoaded', init);
})();
