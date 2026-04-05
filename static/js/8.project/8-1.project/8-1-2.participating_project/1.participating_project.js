// 참여 프로젝트 — 칸반 보드 (담당 아님)
(function(){
  const LOTTIE_CDN = 'https://unpkg.com/lottie-web@5.12.2/build/player/lottie.min.js';
  function ensureLottie(cb){ if(window.lottie){ cb(); return; } const s=document.createElement('script'); s.src=LOTTIE_CDN; s.async=true; s.onload=cb; document.head.appendChild(s); }
  function initBookAnim(){ const el=document.getElementById('book-anim'); if(!el) return; ensureLottie(()=>{ try{ window.lottie.loadAnimation({ container:el, renderer:'svg', loop:true, autoplay:true, path:'/static/image/svg/list/free-animated-book.json'});}catch(_e){} }); }

  const COUNT_ID = 'system-count';
  const SEARCH_ID = 'system-search';
  const SEARCH_CLEAR_ID = 'system-search-clear';

  const STATUS_LIST = ['예정','진행','완료'];
  const COL_ID_BY_STATUS = { '예정':'col-planned', '진행':'col-doing', '완료':'col-done' };
  const state = { data: [], filtered: [], order: { '예정':[], '진행':[], '완료':[] } };
  let _pendingClearIds = [];

  async function fetchJson(url, opts){
    const res = await fetch(url, {
      method: (opts && opts.method) || 'GET',
      headers: Object.assign({ 'Accept': 'application/json' }, (opts && opts.headers) || {}),
      body: (opts && opts.body) || undefined,
    });
    let data = null;
    try{ data = await res.json(); }catch(_e){ data = null; }
    return { res, data };
  }

  function mapApiProjectToCardRow(item){
    if(!item) return null;
    return {
      id: item.id,
      status: item.status || '예정',
      project_name: item.project_name || '',
      project_type: item.project_type || '',
      owner: item.manager_name || '',
      participants: item.stakeholder_names || item.participants || '',
      participant_count: item.stakeholder_count || (Array.isArray(item.participant_user_ids) ? item.participant_user_ids.length : 0),
      priority: item.priority || '',
      start_date: item.start_date || '',
      end_date: item.expected_end_date || '',
      budget: (item.budget_amount == null ? null : item.budget_amount),
      task_count: (item.task_count_cached == null ? null : item.task_count_cached),
      progress: (item.schedule_progress_rate == null ? 0 : item.schedule_progress_rate),
      description: item.description || '',
    };
  }

  function loadPersistence(){
    try{
      const raw=localStorage.getItem('kanban_participating_order');
      if(raw){
        const p=JSON.parse(raw);
        if(p&&typeof p==='object'){
          delete p['보류'];
          state.order={...state.order,...p};
        }
      }
    }catch(_e){}
  }
  function savePersistence(){ try{ localStorage.setItem('kanban_participating_order', JSON.stringify(state.order)); }catch(_e){} }

  async function loadFromServer(){
    const url = '/api/prj/projects?scope=participating&limit=2000';
    const { res, data } = await fetchJson(url);
    if(res.status === 401){
      // No UI framework here; keep it minimal.
      try{ alert('로그인이 필요합니다.'); }catch(_e){}
      return null;
    }
    if(!res.ok || !data || data.success !== true){
      return null;
    }
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map(mapApiProjectToCardRow).filter(Boolean);
  }

  async function initData(){
    try{
      const rows = await loadFromServer();
      if(rows && rows.length){
        state.data = rows;
        // Seed order by status if empty
        STATUS_LIST.forEach(st=>{
          if(!Array.isArray(state.order[st]) || !state.order[st].length){
            state.order[st] = state.data.filter(r=>r.status===st).map(r=>r.id);
          }
        });
        applyFilter();
        return;
      }
      if(rows && rows.length === 0){
        state.data = [];
        STATUS_LIST.forEach(st=>{ state.order[st] = []; });
        applyFilter();
        return;
      }
    }catch(_e){}

    // If the API call fails (network/server), keep UI empty instead of showing mock data.
    state.data = [];
    STATUS_LIST.forEach(st=>{ state.order[st] = []; });
    applyFilter();
  }

  function getSearchTokens(){
    const raw = (document.getElementById(SEARCH_ID)?.value || '').toLowerCase();
    return raw.split(/[%\s]+/).map(s=>s.trim()).filter(Boolean);
  }
  function applyFilter(){
    const tokens = getSearchTokens();
    let base = [...state.data];
    if(tokens.length===0){ state.filtered = base; }
    else{
      state.filtered = base.filter(r=>{
        const vals = [r.status,r.project_name,r.project_type,r.owner,r.participants,r.priority,r.start_date,r.end_date,r.description].map(v=> (v==null? '': String(v).toLowerCase()));
        return tokens.every(tok => vals.some(v => v.includes(tok)));
      });
    }
    render();
  }

  function summarizeParticipants(p, count){
    const s = String(p||'').trim();
    const arr = s ? s.split(',').map(t=>t.trim()).filter(Boolean) : [];
    if(arr.length > 0){
      if(arr.length===1) return arr[0];
      return `${arr[0]} 외 ${arr.length-1}명`;
    }
    // 이름 없이 참여자 수만 있는 경우
    const n = Number(count) || 0;
    if(n > 0) return `${n}명`;
    return '-';
  }
  function escapeHtml(s){ return String(s).replace(/[&<>'"]/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }
  function escapeRegex(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function highlightHtml(text, tokens){
    const src = escapeHtml(text==null? '': String(text));
    if(!tokens || tokens.length===0) return src;
    let out = src;
    for(const t of tokens){ if(!t) continue; const re = new RegExp(`(${escapeRegex(t)})`, 'gi'); out = out.replace(re, '<mark class="search-hit">$1</mark>'); }
    return out;
  }

  function cardHTML(r, tokens){
    const p = Math.max(0, Math.min(100, Number(r.progress)||0));
    const participantsText = summarizeParticipants(r.participants, r.participant_count);
    const participantsTitle = String(r.participants||'').trim();
    const prioCls = r.priority ? `priority-${r.priority}` : '';
    const detailHref = (window.__PROJ_COMPLETED_DETAIL_URL || '/p/proj_completed_detail');
    return `
      <article class="kanban-card" draggable="true" data-id="${r.id}">
        <div class="card-top">
          <div class="card-title" title="${escapeHtml(r.project_name||'')}">
            <a href="${detailHref}" class="work-name-link" data-project-id="${r.id}">${highlightHtml(r.project_name||'-', tokens)}</a>
          </div>
          <span class="badge">${highlightHtml(r.project_type||'-', tokens)}</span>
        </div>
        <div class="card-row">
          <span class="badge">담당 ${highlightHtml(r.owner||'-', tokens)}</span>
          ${r.priority? `<span class="badge ${prioCls}">우선 ${highlightHtml(r.priority, tokens)}</span>`:''}
          <span class="badge">${highlightHtml(`작업 ${Number(r.task_count||0)}`, tokens)}</span>
        </div>
        <div class="card-row dates">${highlightHtml(`${r.start_date||'-'} ~ ${r.end_date||'-'}`, tokens)}</div>
        <div class="card-row participants" title="${escapeHtml(participantsTitle)}">참여 ${highlightHtml(participantsText, tokens)}</div>
        <div class="card-progress">
          <div class="progress-bar" aria-label="진행률"><span style="width:${p}%"></span></div>
          <div class="progress-text">${highlightHtml(`${p}%`, tokens)}</div>
        </div>
      </article>
    `;
  }

  function render(){
    STATUS_LIST.forEach(st=>{ const list=document.getElementById(COL_ID_BY_STATUS[st]); if(list){ list.innerHTML=''; list.classList.remove('is-dragover'); } });
    const byId = new Map(state.filtered.map(r=> [r.id, r]));
    const tokens = getSearchTokens();
    STATUS_LIST.forEach(st=>{
      const list = document.getElementById(COL_ID_BY_STATUS[st]); if(!list) return;
      const idsInColumn = (state.order[st]||[]).filter(id=> byId.has(id));
      const missing = state.filtered.filter(r=> r.status===st && !idsInColumn.includes(r.id)).map(r=> r.id);
      const finalOrder = [...idsInColumn, ...missing];
      finalOrder.forEach(id=>{ const r = byId.get(id); if(!r) return; list.insertAdjacentHTML('beforeend', cardHTML(r, tokens)); });
  const cb = document.querySelector(`[data-count-for="${st}"]`);
      if(cb) cb.textContent = String(finalOrder.length);
    });
    const countEl = document.getElementById(COUNT_ID); if(countEl){ countEl.textContent = String(state.filtered.length); }
    const emptyEl = document.getElementById('system-empty');
    if(emptyEl){
      emptyEl.hidden = state.filtered.length !== 0;
    }
    bindCardDnD();
  }

  function bindDetailNav(){
    document.addEventListener('click', e=>{
      const link = e.target.closest('a.work-name-link');
      if(!link) return;
      e.preventDefault();
      const pid = parseInt(link.getAttribute('data-project-id') || link.getAttribute('data-id') || '0', 10);
      if(!pid) return;
      const row = state.data.find(r=> r.id === pid);
      if(!row) return;
      const payload = {
        project_id: String(pid),
        id: String(pid),
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
      const base = (window.__PROJ_COMPLETED_DETAIL_URL || '/p/proj_completed_detail');
      window.location.href = base;
    });
  }

  function bindCardDnD(){
    document.querySelectorAll('.kanban-card').forEach(card=>{
      card.addEventListener('dragstart', e=>{ e.dataTransfer.setData('text/plain', card.getAttribute('data-id')); e.dataTransfer.effectAllowed = 'move'; });
    });
    document.querySelectorAll('.kanban-list').forEach(list=>{
      list.addEventListener('dragover', e=>{ e.preventDefault(); list.classList.add('is-dragover'); e.dataTransfer.dropEffect='move'; });
      list.addEventListener('dragleave', ()=> list.classList.remove('is-dragover'));
      list.addEventListener('drop', e=>{
        e.preventDefault(); list.classList.remove('is-dragover');
        const id = parseInt(e.dataTransfer.getData('text/plain'), 10); if(!id) return;
        const accept = list.getAttribute('data-accept'); if(!accept) return;
        const idx = state.data.findIndex(r=> r.id===id); if(idx!==-1){ state.data[idx] = { ...state.data[idx], status: accept }; }
        STATUS_LIST.forEach(st=>{ const arr = state.order[st]||[]; state.order[st] = arr.filter(v=> v!==id); });
        (state.order[accept] ||= []).push(id);
        savePersistence();
        applyFilter();
        // Persist status change to DB
        fetchJson(`/api/prj/projects/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: accept }),
        }).catch(err => console.error('[participating_project] status update failed', err));
      });
    });
  }

  function bindSearch(){
    const search = document.getElementById(SEARCH_ID);
    const clearBtn = document.getElementById(SEARCH_CLEAR_ID);
    const wrapper = document.getElementById('system-search-wrapper');
    const SPINNER_DURATION = 150;
    let t=null;
    function syncClear(){ if(!clearBtn || !search) return; clearBtn.classList.toggle('visible', !!search.value); }
    function debouncedFilter(){
      if(wrapper) wrapper.classList.add('active-searching');
      if(t) clearTimeout(t);
      t = setTimeout(()=>{ applyFilter(); if(wrapper) setTimeout(()=> wrapper.classList.remove('active-searching'), SPINNER_DURATION); }, 120);
    }
    if(search){
      search.addEventListener('input', ()=>{ syncClear(); debouncedFilter(); });
      search.addEventListener('keydown', e=>{ if(e.key==='Escape'){ search.value=''; applyFilter(); syncClear(); search.blur(); } });
    }
    if(clearBtn){ clearBtn.addEventListener('click', ()=>{ if(!search) return; search.value=''; search.focus(); applyFilter(); syncClear(); }); }
    document.addEventListener('keydown', e=>{
      if(e.key==='/' && !e.ctrlKey && !e.metaKey && !e.altKey){
        const tag = document.activeElement?.tagName?.toLowerCase();
        if(tag!=='input' && tag!=='textarea' && search){ e.preventDefault(); search.focus(); }
      }
    });
    syncClear();
  }

  function openModal(id){ const m=document.getElementById(id); if(!m) return; document.body.classList.add('modal-open'); m.classList.add('show'); m.setAttribute('aria-hidden','false'); }
  function closeModal(id){ const m=document.getElementById(id); if(!m) return; m.classList.remove('show'); m.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open'); }

  function bindClearDone(){
    const btn = document.getElementById('btn-clear-done'); if(!btn) return;
    btn.addEventListener('click', ()=>{
      const doneIds = state.data.filter(r=> r.status==='완료').map(r=> r.id);
      if(!doneIds.length){ return; }
      _pendingClearIds = doneIds;
      const subtitle = document.getElementById('prj-clear-subtitle');
      if(subtitle) subtitle.textContent = `완료된 ${doneIds.length}개 프로젝트를 목록에서 비우시겠습니까?`;
      openModal('prj-clear-modal');
    });

    document.getElementById('prj-clear-close')?.addEventListener('click', ()=> closeModal('prj-clear-modal'));
    document.getElementById('prj-clear-modal')?.addEventListener('click', e=>{ if(e.target.id==='prj-clear-modal') closeModal('prj-clear-modal'); });

    document.getElementById('prj-clear-confirm')?.addEventListener('click', async ()=>{
      closeModal('prj-clear-modal');
      const ids = _pendingClearIds || [];
      _pendingClearIds = [];
      if(!ids.length) return;
      try{
        await fetch('/api/prj/projects/batch-clear', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ scope:'participating', ids }),
        });
      }catch(_e){}
      // Remove cleared items from local data and re-render
      state.data = state.data.filter(r=> !ids.includes(r.id) || r.status!=='완료');
      STATUS_LIST.forEach(st=>{ state.order[st] = (state.order[st]||[]).filter(id=> state.data.some(r=> r.id===id)); });
      savePersistence();
      applyFilter();
    });
  }

  /* ── Flatpickr lazy-loader (workflow 동일) ── */
  const FP_VER='4.6.13';
  const FP_BASE=`/static/vendor/flatpickr/${FP_VER}`;
  const FP_CSS=`${FP_BASE}/flatpickr.min.css`;
  const FP_THEME=`${FP_BASE}/themes/airbnb.css`;
  const FP_JS=`${FP_BASE}/flatpickr.min.js`;
  const FP_KO=`${FP_BASE}/l10n/ko.js`;
  let __fpPromise=null;
  function ensureCss(href,id){ try{ const ex=document.getElementById(id); if(ex&&ex.tagName.toLowerCase()==='link'){ if(ex.getAttribute('href')!==href) ex.setAttribute('href',href); return; } const l=document.createElement('link'); l.rel='stylesheet'; l.href=href; if(id) l.id=id; document.head.appendChild(l); }catch(_){} }
  function loadScript(src){ return new Promise((res,rej)=>{ try{ const s=document.createElement('script'); s.src=src; s.async=true; s.onload=()=>res(true); s.onerror=()=>rej(new Error('FAILED '+src)); document.head.appendChild(s); }catch(e){ rej(e); } }); }
  async function ensureFlatpickrAssets(){ ensureCss(FP_CSS,'flatpickr-css'); ensureCss(FP_THEME,'flatpickr-theme-css'); if(window.flatpickr) return; if(__fpPromise) return __fpPromise; __fpPromise=loadScript(FP_JS).then(()=>loadScript(FP_KO).catch(()=>null)).catch(e=>{__fpPromise=null;throw e;}); return __fpPromise; }
  function ensureTodayButton(fp){ try{ const cal=fp&&fp.calendarContainer; if(!cal) return; if(cal.querySelector('.fp-today-btn')) return; const btn=document.createElement('button'); btn.type='button'; btn.className='fp-today-btn'; btn.textContent='오늘'; btn.addEventListener('click',()=>{ fp.setDate(new Date(),true); }); cal.appendChild(btn); }catch(_){} }
  async function initDateFlatpickrs(){
    const els=document.querySelectorAll('#system-add-form input.date-input');
    if(!els.length) return;
    try{ await ensureFlatpickrAssets(); }catch(_){ return; }
    if(!window.flatpickr) return;
    const koLocale=(window.flatpickr.l10ns&&window.flatpickr.l10ns.ko)?window.flatpickr.l10ns.ko:'ko';
    els.forEach(el=>{
      if(el._flatpickr) return;
      window.flatpickr(el,{ dateFormat:'Y-m-d', allowInput:true, disableMobile:true, clickOpens:true, appendTo:document.body, locale:koLocale, onReady:(_s,_d,inst)=>ensureTodayButton(inst), onOpen:(_s,_d,inst)=>ensureTodayButton(inst) });
    });
  }

  /* ── 프로젝트 추가 모달 ─────────────── */
  function collectForm(form){
    const data={};
    form.querySelectorAll('input,select,textarea').forEach(el=>{
      if(!el||!el.name) return;
      if(el.disabled) return;
      data[el.name]=el.value.trim();
    });
    return data;
  }

  async function addProjectFromForm(){
    const form = document.getElementById('system-add-form');
    if(!form) return;
    if(!form.checkValidity()){ form.reportValidity(); return; }
    const data = collectForm(form);
    // budget: strip commas, convert to integer
    let budgetRaw = (typeof data.budget==='string') ? data.budget.replace(/,/g,'') : (data.budget||'');
    const budgetVal = budgetRaw ? (parseInt(budgetRaw,10)||0) : null;
    // Build API payload
    const payload = {
      project_name: data.project_name || '',
      project_type: data.project_type || '',
      status: data.status || '예정',
      priority: data.priority || '',
      description: data.description || '',
      start_date: data.start_date || '',
      expected_end_date: data.end_date || '',
    };
    if(budgetVal !== null) payload.budget_amount = budgetVal;
    // Save button loading state
    const saveBtn = document.getElementById('system-add-save');
    if(saveBtn){ saveBtn.disabled = true; saveBtn.classList.add('is-loading'); }
    try{
      const { res, data: body } = await fetchJson('/api/prj/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if(!res.ok || !body || !body.success){
        const msg = (body && body.message) || '프로젝트 생성에 실패했습니다.';
        alert(msg);
        return;
      }
      // Use server-returned item (has real DB id)
      const card = mapApiProjectToCardRow(body.item);
      if(card){
        state.data.unshift(card);
        const st = card.status || '예정';
        if(state.order[st]) state.order[st].unshift(card.id);
        savePersistence();
        applyFilter();
      }
      form.reset();
      closeModal('system-add-modal');
    }catch(err){
      console.error('[participating_project] addProjectFromForm error', err);
      alert('프로젝트 생성 중 오류가 발생했습니다.');
    }finally{
      if(saveBtn){ saveBtn.disabled = false; saveBtn.classList.remove('is-loading'); }
    }
  }

  function bindAddModal(){
    document.getElementById('system-add-btn')?.addEventListener('click', ()=> openModal('system-add-modal'));
    document.getElementById('system-add-close')?.addEventListener('click', ()=> closeModal('system-add-modal'));
    document.getElementById('system-add-modal')?.addEventListener('click', e=>{ if(e.target.id==='system-add-modal') closeModal('system-add-modal'); });
    document.getElementById('system-add-save')?.addEventListener('click', addProjectFromForm);
    initDateFlatpickrs();
    // 예산 3자리 콤마
    const budgetEl=document.querySelector('#system-add-form input[name="budget"]');
    if(budgetEl) budgetEl.addEventListener('input', function(){ const raw=this.value.replace(/[^\d]/g,''); this.value=raw?Number(raw).toLocaleString('ko-KR'):''; });
  }

  async function init(){
    loadPersistence();
    await initData();
    bindSearch();
    bindClearDone();
    bindAddModal();
    render();
    bindDetailNav();
    initBookAnim();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


