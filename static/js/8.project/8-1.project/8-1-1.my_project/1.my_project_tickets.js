(function(){
  // LocalStorage key
  const STORAGE_KEY = 'myProjectTickets';
  const STATUSES = ['접수대기','접수','처리중','완료'];

  // Elements
  const openBtn = document.getElementById('ticket-add-open');
  const totalCountEl = document.getElementById('ticket-total-count');

  // Ensure required DOM exists (page may load defer)
  if (!openBtn || !totalCountEl) return;

  // Modal setup
  // Create modal on the fly to avoid touching existing header/top areas
  const modal = document.createElement('div');
  modal.id = 'ticket-add-modal';
  modal.className = 'server-add-modal modal-overlay-full';
  modal.setAttribute('aria-hidden','true');
  modal.innerHTML = `
    <div class="server-add-content">
      <div class="server-add-header">
        <div class="server-add-title">
          <h3>티켓등록</h3>
          <p class="server-add-subtitle">티켓 정보를 입력하세요.</p>
        </div>
        <button class="close-btn" type="button" id="ticket-add-close" title="닫기">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div class="server-add-body">
        <form id="ticket-add-form">
          <div class="form-section">
            <div class="section-header"><h4>기본정보</h4></div>
            <div class="form-grid">
              <div class="form-row"><label>제목<span class="required">*</span></label><input name="title" class="form-input" required maxlength="100" placeholder="티켓 제목"></div>
              <div class="form-row"><label>담당자</label><input name="assignee" class="form-input" maxlength="40" placeholder="담당자"></div>
              <div class="form-row"><label>우선순위</label>
                <select name="priority" class="form-input">
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM" selected>MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>
              <div class="form-row form-row-wide"><label>설명</label><textarea name="desc" class="form-input textarea-large" rows="4" maxlength="300" placeholder="설명"></textarea></div>
            </div>
          </div>
        </form>
      </div>
      <div class="server-add-actions align-right">
        <div class="action-buttons right">
          <button type="button" class="btn-primary" id="ticket-add-save">등록</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const closeBtn = modal.querySelector('#ticket-add-close');
  const saveBtn = modal.querySelector('#ticket-add-save');
  const form = modal.querySelector('#ticket-add-form');

  // Column hosts
  const colPending    = document.getElementById('tcol-pending');
  const colAccepted   = document.getElementById('tcol-accepted');
  const colInProgress = document.getElementById('tcol-inprogress');
  const colDone       = document.getElementById('tcol-done');
  const colMap = {
    '접수대기': colPending,
    '접수': colAccepted,
    '처리중': colInProgress,
    '완료': colDone
  };

  // Load / Save
  let tickets = load();
  if (!tickets.length) {
    tickets = [mkTicket({ title:'샘플 티켓', desc:'프로젝트 티켓 샘플', assignee:'me', priority:'MEDIUM' })];
    persist();
  }

  // Event wiring
  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', function(e){ if(e.target===modal) closeModal(); });
  saveBtn.addEventListener('click', onSave);

  // Functions
  function openModal(){ modal.setAttribute('aria-hidden','false'); modal.classList.add('open'); }
  function closeModal(){ modal.setAttribute('aria-hidden','true'); modal.classList.remove('open'); }

  function mkTicket({ title, desc='', assignee='', priority='MEDIUM' }){
    const now = new Date().toISOString();
    return {
      id: 'MP-T'+Math.random().toString(36).slice(2,9).toUpperCase(),
      title, desc, assignee, priority, status:'접수대기', created_at: now, updated_at: now
    };
  }
  function load(){ try{ const raw=localStorage.getItem(STORAGE_KEY); return raw? JSON.parse(raw):[]; }catch(e){ return []; } }
  function persist(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets)); }

  function onSave(){
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const t = mkTicket({
      title: String(fd.get('title')||'').trim(),
      desc: String(fd.get('desc')||'').trim(),
      assignee: String(fd.get('assignee')||'').trim(),
      priority: String(fd.get('priority')||'MEDIUM')
    });
    tickets.push(t); persist(); form.reset(); closeModal(); render();
  }

  function render(){
    // Clear
    STATUSES.forEach(function(st){ if (colMap[st]) colMap[st].innerHTML=''; });
    // Counts
    const cnt = { '접수대기':0,'접수':0,'처리중':0,'완료':0 };
    tickets.forEach(function(t){ cnt[t.status] = (cnt[t.status]||0)+1; });
    STATUSES.forEach(function(st){ const el=document.querySelector('[data-ticket-count-for="'+st+'"]'); if (el) el.textContent = String(cnt[st]||0); });
    totalCountEl.textContent = String(tickets.length);

    // Render cards
    tickets.forEach(function(t){
      const host = colMap[t.status]; if (!host) return;
      host.appendChild(renderCard(t));
    });
  }

  function renderCard(t){
    const card = document.createElement('div');
    card.className = 'kanban-card';
    card.setAttribute('role','listitem');
    card.innerHTML = `
      <div class="kanban-card-header">
        <div class="kanban-card-title">${escapeHtml(t.title)}</div>
        <div class="kanban-card-tags">
          <span class="tag">${escapeHtml(t.priority)}</span>
        </div>
      </div>
      ${t.desc? `<div class="kanban-card-desc">${escapeHtml(t.desc)}</div>`:''}
      <div class="kanban-card-meta">${t.assignee? '담당: '+escapeHtml(t.assignee): ''}</div>
      <div class="kanban-card-actions">
        ${t.status!== '완료' ? '<button type="button" class="mini-btn" data-act="next">진행</button>':''}
        <button type="button" class="mini-btn danger" data-act="del">삭제</button>
      </div>`;

    card.querySelectorAll('button[data-act]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const act = btn.getAttribute('data-act');
        if (act==='next') advance(t.id);
        if (act==='del') remove(t.id);
      });
    });
    return card;
  }

  function advance(id){
    const idx = tickets.findIndex(function(x){ return x.id===id; });
    if (idx===-1) return;
    const st = tickets[idx].status;
    const order = STATUSES;
    const i = order.indexOf(st);
    if (i>-1 && i<order.length-1) tickets[idx].status = order[i+1];
    tickets[idx].updated_at = new Date().toISOString();
    persist(); render();
  }
  function remove(id){
    if (!confirm('삭제하시겠습니까?')) return;
    tickets = tickets.filter(function(x){ return x.id!==id; });
    persist(); render();
  }

  function escapeHtml(str){
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  // Initial render
  render();
})();
