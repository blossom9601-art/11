/**
 * 완료 프로젝트 (비우기 처리됨) 관리 페이지 스크립트
 * - scope=cleared 로 비우기 처리된 프로젝트만 조회
 * - 선택 후 복구 기능
 */
(function(){
  'use strict';

  const LOTTIE_CDN = 'https://unpkg.com/lottie-web@5.12.2/build/player/lottie.min.js';
  function ensureLottie(cb){ if(window.lottie){ cb(); return; } const s=document.createElement('script'); s.src=LOTTIE_CDN; s.async=true; s.onload=()=>cb(); document.head.appendChild(s); }
  function initBookAnim(){
    const el=document.getElementById('book-anim'); if(!el) return;
    ensureLottie(()=>{ try{ window.lottie.loadAnimation({container:el,renderer:'svg',loop:true,autoplay:true,path:'/static/image/svg/list/free-animated-book.json',rendererSettings:{preserveAspectRatio:'xMidYMid meet',progressiveLoad:true}}); }catch(_e){} });
  }

  /* ── 상태 ───────────────────────────── */
  let state = { data:[], filtered:[], page:1, pageSize:10, search:'', selected:new Set() };

  /* ── 유틸 ───────────────────────────── */
  async function fetchJson(url, opts){
    const res = await fetch(url, {
      method:(opts&&opts.method)||'GET',
      headers:Object.assign({'Accept':'application/json'},(opts&&opts.headers)||{}),
      body:(opts&&opts.body)||undefined,
    });
    let data=null; try{ data=await res.json(); }catch(_e){} return {res,data};
  }

  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  /* ── 모달 ───────────────────────────── */
  function openModal(id){ const m=document.getElementById(id); if(!m) return; document.body.classList.add('modal-open'); m.classList.add('show'); m.setAttribute('aria-hidden','false'); }
  function closeModal(id){ const m=document.getElementById(id); if(!m) return; m.classList.remove('show'); m.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open'); }
  function showMessage(msg, title){
    const titleEl=document.getElementById('message-title');
    const contentEl=document.getElementById('message-content');
    if(titleEl) titleEl.textContent = title||'알림';
    if(contentEl) contentEl.textContent = msg||'';
    openModal('system-message-modal');
  }

  /* ── 데이터 로드 ───────────────────── */
  function mapApiRow(item){
    if(!item) return null;
    return {
      id: item.id,
      status: item.status||'',
      project_name: item.project_name||'',
      project_type: item.project_type||'',
      owner_dept: item.owner_dept_name||'',
      owner: item.manager_name||'',
      participants: item.participants||'',
      priority: item.priority||'',
      start_date: item.start_date||'',
      end_date: item.expected_end_date||'',
      progress: (item.progress_percent==null ? '' : item.progress_percent),
    };
  }

  async function loadFromServer(){
    const {res, data} = await fetchJson('/api/prj/projects?scope=cleared&limit=2000');
    if(res.status===401){ showMessage('로그인이 필요합니다.','안내'); return null; }
    if(!res.ok||!data||data.success!==true) return null;
    return (Array.isArray(data.items)?data.items:[]).map(mapApiRow).filter(Boolean);
  }

  /* ── 필터/검색 ─────────────────────── */
  function applyFilter(){
    const terms = state.search.toLowerCase().split('%').map(t=>t.trim()).filter(Boolean);
    if(!terms.length){ state.filtered=[...state.data]; }
    else{ state.filtered = state.data.filter(r=> terms.every(t=> Object.values(r).some(v=> String(v).toLowerCase().includes(t)))); }
    state.page=1;
    render();
  }

  /* ── 렌더링 ────────────────────────── */
  const DETAIL_URL = window.__PROJ_COMPLETED_DETAIL_URL || '/p/proj_completed_detail';

  function statusPillHtml(s){
    const v = String(s||'');
    let cls = 'ws-wait';
    if(v === '진행') cls = 'ws-run';
    else if(v === '완료') cls = 'ws-idle';
    else if(v === '예정' || v === '보류') cls = 'ws-wait';
    return `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${escapeHtml(s)}</span></span>`;
  }
  function progressBarHtml(p){
    const n = parseInt(p,10); if(isNaN(n)) return '-';
    const cls = n>=80?'progress-high':n>=40?'progress-mid':'progress-low';
    return `<div class="progress-cell"><div class="mini-progress"><div class="mini-progress-fill ${cls}" style="width:${Math.min(n,100)}%"></div></div><span class="progress-num">${n}%</span></div>`;
  }
  function rowHtml(r){
    const chk = state.selected.has(r.id)?'checked':'';
    const nameHtml = `<a href="${DETAIL_URL}" class="work-name-link" data-id="${r.id}" title="상세 보기">${escapeHtml(r.project_name)}</a>`;
    return `<tr data-id="${r.id}">
      <td><input type="checkbox" class="row-chk" data-id="${r.id}" ${chk}></td>
      <td>${statusPillHtml(r.status)}</td>
      <td class="cell-ellipsis">${nameHtml}</td>
      <td>${escapeHtml(r.project_type)}</td>
      <td>${escapeHtml(r.owner_dept)}</td>
      <td>${escapeHtml(r.owner)}</td>
      <td>${escapeHtml(r.priority)}</td>
      <td>${escapeHtml(r.start_date)}</td>
      <td>${escapeHtml(r.end_date)}</td>
      <td>${progressBarHtml(r.progress)}</td>
    </tr>`;
  }

  function render(){
    const tbody = document.getElementById('system-table-body');
    const emptyEl = document.getElementById('system-empty');
    const countEl = document.getElementById('system-count');
    const infoEl = document.getElementById('system-pagination-info');
    if(!tbody) return;

    const total = state.filtered.length;
    const ps = state.pageSize;
    const maxPage = Math.max(1, Math.ceil(total/ps));
    if(state.page>maxPage) state.page=maxPage;
    const start = (state.page-1)*ps;
    const pageRows = state.filtered.slice(start, start+ps);

    if(countEl) countEl.textContent=total;
    const infoStart = total ? (state.page-1)*ps+1 : 0;
    const infoEnd = Math.min(total, state.page*ps);
    if(infoEl) infoEl.textContent=`${infoStart}-${infoEnd} / ${total}개 항목`;

    if(!total){ tbody.innerHTML=''; if(emptyEl) emptyEl.hidden=false; renderPagination(0,1); updateSelectAll(); return; }
    if(emptyEl) emptyEl.hidden=true;
    tbody.innerHTML = pageRows.map(rowHtml).join('');
    renderPagination(total, maxPage);
    updateSelectAll();
  }

  function renderPagination(total, maxPage){
    const first=document.getElementById('system-first');
    const prev=document.getElementById('system-prev');
    const next=document.getElementById('system-next');
    const last=document.getElementById('system-last');
    const nums=document.getElementById('system-page-numbers');
    if(!nums) return;
    const p=state.page;
    if(first) first.disabled=p===1;
    if(prev) prev.disabled=p===1;
    if(next) next.disabled=p===maxPage;
    if(last) last.disabled=p===maxPage;
    // page number buttons – windowed (nearby pages + first/last with ellipsis)
    nums.innerHTML='';
    const windowSize=5;
    let startPage=Math.max(1, p - Math.floor(windowSize/2));
    let endPage=Math.min(maxPage, startPage + windowSize - 1);
    if(endPage - startPage < windowSize - 1){
      startPage=Math.max(1, endPage - windowSize + 1);
    }
    // First page + ellipsis
    if(startPage > 1){
      const btn=document.createElement('button');
      btn.className='page-btn'+(p===1?' active':'');
      btn.textContent='1';
      btn.dataset.page=1;
      nums.appendChild(btn);
      if(startPage > 2){
        const dots=document.createElement('span');
        dots.className='page-ellipsis';
        dots.textContent='…';
        nums.appendChild(dots);
      }
    }
    for(let i=startPage;i<=endPage;i++){
      const btn=document.createElement('button');
      btn.className='page-btn'+(i===p?' active':'');
      btn.textContent=i;
      btn.dataset.page=i;
      nums.appendChild(btn);
    }
    // Last page + ellipsis
    if(endPage < maxPage){
      if(endPage < maxPage - 1){
        const dots=document.createElement('span');
        dots.className='page-ellipsis';
        dots.textContent='…';
        nums.appendChild(dots);
      }
      const btn=document.createElement('button');
      btn.className='page-btn'+(p===maxPage?' active':'');
      btn.textContent=maxPage;
      btn.dataset.page=maxPage;
      nums.appendChild(btn);
    }
  }

  function updateSelectAll(){
    const sa=document.getElementById('system-select-all'); if(!sa) return;
    const boxes=document.querySelectorAll('.row-chk');
    if(!boxes.length){ sa.checked=false; sa.indeterminate=false; return; }
    const checked=[...boxes].filter(b=>b.checked).length;
    sa.checked=checked===boxes.length;
    sa.indeterminate=checked>0&&checked<boxes.length;
  }

  /* ── 이벤트 ────────────────────────── */
  function bindEvents(){
    // 검색
    const searchInput=document.getElementById('system-search');
    const searchClear=document.getElementById('system-search-clear');
    let searchTimer=null;
    if(searchInput){
      searchInput.addEventListener('input',()=>{ clearTimeout(searchTimer); searchTimer=setTimeout(()=>{ state.search=searchInput.value; applyFilter(); },200); });
      searchInput.addEventListener('keydown',e=>{ if(e.key==='Escape'){ searchInput.value=''; state.search=''; applyFilter(); } });
    }
    if(searchClear) searchClear.addEventListener('click',()=>{ if(searchInput) searchInput.value=''; state.search=''; applyFilter(); });

    // 페이지네이션
    document.getElementById('system-first')?.addEventListener('click',()=>{ state.page=1; render(); });
    document.getElementById('system-prev')?.addEventListener('click',()=>{ state.page=Math.max(1,state.page-1); render(); });
    document.getElementById('system-next')?.addEventListener('click',()=>{ state.page++; render(); });
    document.getElementById('system-last')?.addEventListener('click',()=>{ state.page=Math.ceil(state.filtered.length/state.pageSize); render(); });
    document.getElementById('system-page-numbers')?.addEventListener('click',e=>{ if(e.target.classList.contains('page-btn')){ state.page=parseInt(e.target.dataset.page,10); render(); } });

    // 페이지 사이즈 셀렉터
    const pageSizeSel=document.getElementById('system-page-size');
    if(pageSizeSel){
      pageSizeSel.addEventListener('change',e=>{
        state.pageSize=parseInt(e.target.value,10)||10;
        try{ localStorage.setItem('system_page_size',String(state.pageSize)); }catch(_e){}
        state.page=1; render();
      });
    }

    // Select-all
    document.getElementById('system-select-all')?.addEventListener('change',function(){ const c=this.checked; document.querySelectorAll('.row-chk').forEach(b=>{ b.checked=c; const id=parseInt(b.dataset.id,10); if(c) state.selected.add(id); else state.selected.delete(id); }); updateSelectAll(); });
    document.getElementById('system-table-body')?.addEventListener('change',e=>{ if(!e.target.classList.contains('row-chk')) return; const id=parseInt(e.target.dataset.id,10); if(e.target.checked) state.selected.add(id); else state.selected.delete(id); updateSelectAll(); });

    // 프로젝트 이름 링크 클릭 처리 (상세 페이지 이동)
    document.getElementById('system-table-body')?.addEventListener('click',e=>{
      const nameLink = e.target.closest('.work-name-link');
      if(nameLink){
        e.preventDefault();
        const rid = parseInt(nameLink.getAttribute('data-id'),10);
        const row = state.data.find(r=> r.id === rid);
        if(row){
          const payload = {
            project_id: (!isNaN(rid) ? String(rid) : ''),
            id: (!isNaN(rid) ? String(rid) : ''),
            status: row.status || '',
            project_name: row.project_name || '',
            project_type: row.project_type || '',
            owner_dept: row.owner_dept || '',
            owner: row.owner || '',
            participants: row.participants || '',
            priority: row.priority || '',
            start_date: row.start_date || '',
            end_date: row.end_date || '',
            budget: row.budget != null ? String(row.budget) : '',
            task_count: row.task_count != null ? String(row.task_count) : '',
            progress: row.progress != null ? String(row.progress) : '',
            description: row.description || ''
          };
          try { sessionStorage.setItem('project_selected_row', JSON.stringify(payload)); } catch(_e){}
          window.location.href = DETAIL_URL;
        }
        return;
      }
    });

    // 복구 버튼
    const restoreBtn=document.getElementById('system-restore-btn');
    if(restoreBtn) restoreBtn.addEventListener('click', onRestoreClick);

    // 삭제처리
    const deleteBtn=document.getElementById('system-delete-btn');
    if(deleteBtn) deleteBtn.addEventListener('click', onDeleteClick);
    document.getElementById('system-delete-close')?.addEventListener('click',()=> closeModal('system-delete-modal'));
    document.getElementById('system-delete-confirm')?.addEventListener('click', doDelete);
    const deleteModal=document.getElementById('system-delete-modal');
    if(deleteModal) deleteModal.addEventListener('click',e=>{ if(e.target===deleteModal) closeModal('system-delete-modal'); });

    // 복구 모달
    document.getElementById('restore-modal-close')?.addEventListener('click',()=> closeModal('restore-modal'));
    document.getElementById('restore-modal-confirm')?.addEventListener('click', doRestore);
    const restoreModal=document.getElementById('restore-modal');
    if(restoreModal) restoreModal.addEventListener('click',e=>{ if(e.target===restoreModal) closeModal('restore-modal'); });

    // 메시지 모달
    document.getElementById('system-message-close')?.addEventListener('click',()=> closeModal('system-message-modal'));
    document.getElementById('system-message-ok')?.addEventListener('click',()=> closeModal('system-message-modal'));
    const msgModal=document.getElementById('system-message-modal');
    if(msgModal) msgModal.addEventListener('click',e=>{ if(e.target===msgModal) closeModal('system-message-modal'); });

    // Info popover
    const trigger = document.getElementById('info-trigger');
    const popover = document.getElementById('info-popover');
    if(trigger && popover){
      trigger.addEventListener('click',()=>{
        const open = !popover.hidden;
        popover.hidden = !popover.hidden;
        trigger.setAttribute('aria-expanded', String(!open));
      });
      const closeBtn = popover.querySelector('.info-popover-close');
      if(closeBtn) closeBtn.addEventListener('click',()=>{ popover.hidden=true; trigger.setAttribute('aria-expanded','false'); });
    }
  }

  function onDeleteClick(){
    const ids=[...state.selected];
    if(!ids.length){ showMessage('삭제처리할 프로젝트를 선택하세요.','안내'); return; }
    const subtitle=document.getElementById('delete-subtitle');
    if(subtitle) subtitle.textContent=`선택된 ${ids.length}개의 프로젝트를 정말 삭제처리하시겠습니까?`;
    openModal('system-delete-modal');
  }

  async function doDelete(){
    closeModal('system-delete-modal');
    const ids=[...state.selected];
    if(!ids.length) return;
    const btn=document.getElementById('system-delete-confirm');
    if(btn) btn.disabled=true;
    try{
      const {res, data} = await fetchJson('/api/prj/projects/bulk-delete',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ids}),
      });
      if(res.ok && data && data.success){
        state.selected.clear();
        const rows = await loadFromServer();
        state.data = rows||[];
        applyFilter();
        showMessage(`${data.deleted||0}개 프로젝트가 삭제되었습니다.`,'삭제 완료');
      } else {
        showMessage((data&&data.message)||'프로젝트 삭제 중 오류가 발생했습니다.','삭제 실패');
      }
    }catch(_e){
      showMessage('서버 통신 중 오류가 발생했습니다.','삭제 실패');
    }finally{
      if(btn) btn.disabled=false;
    }
  }

  function onRestoreClick(){
    const ids=[...state.selected];
    if(!ids.length){ showMessage('복구할 프로젝트를 선택하세요.','안내'); return; }
    const countEl=document.getElementById('restore-count');
    if(countEl) countEl.textContent=ids.length;
    openModal('restore-modal');
  }

  async function doRestore(){
    closeModal('restore-modal');
    const ids=[...state.selected];
    if(!ids.length) return;
    try{
      const {res, data} = await fetchJson('/api/prj/projects/batch-restore',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ids}),
      });
      if(res.ok && data && data.success){
        state.selected.clear();
        // 다시 조회
        const rows = await loadFromServer();
        state.data = rows||[];
        applyFilter();
        showMessage(`${data.restored||0}개 프로젝트가 복구되었습니다.`,'완료');
      } else {
        showMessage((data&&data.message)||'복구 처리 중 오류가 발생했습니다.','오류');
      }
    }catch(_e){
      showMessage('서버 통신 중 오류가 발생했습니다.','오류');
    }
  }

  /* ── 초기화 ────────────────────────── */
  async function init(){
    initBookAnim();
    // Load persisted page size (allowed values only)
    try{
      const psRaw=localStorage.getItem('system_page_size');
      if(psRaw){
        const val=parseInt(psRaw,10);
        if([10,20,50,100].includes(val)){
          state.pageSize=val;
          const sel=document.getElementById('system-page-size');
          if(sel) sel.value=String(val);
        }
      }
    }catch(_e){}
    bindEvents();
    try{
      const rows = await loadFromServer();
      if(rows){ state.data = rows; }
      else{ state.data = []; }
    }catch(_e){ state.data = []; }
    applyFilter();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
