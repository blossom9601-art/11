(function(){
  // Configurable current user (assumption). Change to real account info when available.
  const CURRENT_USER = window.CURRENT_USER || '홍길동';
  const MODE = (window.TASK_PAGE_MODE || 'my').toLowerCase(); // 'my' or 'participating'
  const CONTAINER_ID = 'status-groups';
  const STATUS_ORDER = ['검토','승인','예정','진행','완료'];

  function initBookAnim(){
    const el = document.getElementById('book-anim'); if(!el) return;
    if(window.lottie){ try { window.lottie.loadAnimation({ container: el, renderer:'svg', loop:true, autoplay:true, path:'/static/image/svg/list/free-animated-book.json', rendererSettings:{ preserveAspectRatio:'xMidYMid meet', progressiveLoad:true } }); } catch(_){} }
  }

  function statusCodeToKo(code){
    const v = String(code||'').toUpperCase();
    if(v === 'REVIEW') return '검토';
    if(v === 'APPROVED') return '승인';
    if(v === 'SCHEDULED') return '예정';
    if(v === 'IN_PROGRESS') return '진행';
    if(v === 'COMPLETED' || v === 'ARCHIVED') return '완료';
    return '예정';
  }
  function toDisplayDateTime(v){
    if(!v) return '-';
    const s = String(v);
    // API returns ISO; keep same style used elsewhere: YYYY-MM-DD HH:MM
    if(s.includes('T')){
      const t = s.replace('T',' ').replace(/\.(\d+).*/, '');
      return t.slice(0, 16);
    }
    return s;
  }
  async function fetchTasksFromApi(){
    const view = (MODE === 'participating') ? 'participating' : 'my';
    const url = `/api/wrk/reports?view=${encodeURIComponent(view)}&limit=500`;
    try{
      const res = await fetch(url, { credentials: 'same-origin' });
      const json = await res.json().catch(()=> ({}));
      if(!res.ok || !json || json.success !== true){
        return [];
      }
      const items = Array.isArray(json.items) ? json.items : [];
      return items.map(it => ({
        id: it.id,
        status: statusCodeToKo(it.status || it.status_label || it.status_ko),
        task_name: it.task_name || it.task_title || '',
        start_datetime: toDisplayDateTime(it.start_datetime),
        end_datetime: toDisplayDateTime(it.end_datetime),
        owner: it.owner || it.owner_name || it.worker_name || CURRENT_USER,
        participants: it.participants || it.participants_text || ''
      }));
    }catch(_e){
      return [];
    }
  }

  function groupByStatus(rows){
    const map = new Map(); STATUS_ORDER.forEach(s => map.set(s, []));
    rows.forEach(r => { const s = STATUS_ORDER.includes(r.status) ? r.status : '예정'; map.get(s).push(r); });
    return map;
  }

  function escapeHTML(v){
    return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // Profile icon mapping
  const PROFILE_ICONS = [
    '001-boy.svg','002-girl.svg','003-boy.svg','004-girl.svg','005-man.svg',
    '006-girl.svg','007-boy.svg','008-girl.svg','009-boy.svg','010-girl.svg',
    '011-man.svg','012-girl.svg','013-man.svg','014-girl.svg','015-boy.svg',
    '016-girl.svg','017-boy.svg','018-girl.svg','019-boy.svg','020-girl.svg'
  ];
  function hashCode(s){ let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0; } return Math.abs(h); }
  function iconFor(name){
    if(!name) return '/static/image/svg/profil/001-boy.svg';
    const idx = hashCode(name) % PROFILE_ICONS.length;
    return '/static/image/svg/profil/' + PROFILE_ICONS[idx];
  }

  async function render(){
    const el = document.getElementById(CONTAINER_ID); if(!el) return;
    const data = await fetchTasksFromApi();
    // update total count badge if present
    const cntEl = document.getElementById('system-count');
    if (cntEl) cntEl.textContent = String(data.length);
    const grouped = groupByStatus(data);
    const blocks = [];
    grouped.forEach((items, status) =>{
      const count = items.length;
      let tableHtml = '';
      if(count){
        const rows = items.map(it => {
          const name = escapeHTML(it.task_name);
            const sdt = escapeHTML(it.start_datetime || '-');
            const edt = escapeHTML(it.end_datetime || '-');
            const owner = escapeHTML(it.owner || '-');
            const avatar = iconFor(owner);
          return `<tr data-id="${it.id}">
            <td class="col-check"><input type="checkbox" class="chk-row" aria-label="선택" data-id="${it.id}"></td>
              <td class="col-name" title="${name}">${name}</td>
              <td class="col-start" title="${sdt}">${sdt}</td>
              <td class="col-end" title="${edt}">${edt}</td>
              <td class="col-assigned" title="${owner}"><img class="avatar-img" src="${avatar}" alt="${owner}" width="24" height="24"/><span class="assignee">${owner}</span></td>
              <td class="col-actions"><button type="button" class="btn-view" data-id="${it.id}" title="보기"><img src="/static/image/svg/list/free-icon-search.svg" alt="보기" class="icon-view"/></button></td>
          </tr>`;
        }).join('');
        tableHtml = `
          <div class="table-wrapper">
            <table class="status-table" aria-label="${status} 작업 목록">
              <thead>
                <tr>
                  <th class="col-check" scope="col"><input type="checkbox" class="chk-all" aria-label="전체 선택"></th>
                    <th scope="col" class="col-name">작업 이름</th>
                    <th scope="col" class="col-start">시작일시</th>
                    <th scope="col" class="col-end">(예상)종료일시</th>
                    <th scope="col" class="col-assigned">담당자</th>
                    <th scope="col" class="col-actions">관리</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `;
      }
      blocks.push(`
        <section class="status-card" data-status="${status}">
          <div class="card-header">
            <div class="header-left">
              <h3>${status}</h3>
              <span class="count">${count}</span>
            </div>
          </div>
          ${count ? tableHtml : `<div class="empty-hint">해당 상태의 작업이 없습니다.</div>`}
        </section>
      `);
    });
    el.innerHTML = blocks.join('');
    bindInteractions(el);
  }

  function injectStyles(){
    if(document.getElementById('status-list-css')) return;
    const css = `
  .status-group-container{ display:block; }
  .status-card{ background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:12px 12px 8px 12px; margin:14px 0; box-shadow:0 1px 1px rgba(0,0,0,0.02); }
  .card-header{ display:flex; align-items:center; justify-content:space-between; padding:2px 4px 10px 4px; }
  .card-header .header-left{ display:flex; align-items:center; gap:8px; }
  .card-header h3{ font-size:16px; margin:0; font-weight:800; letter-spacing:-0.2px; color:#0f172a; }
  .card-header .count{ background:#eef2ff; color:#3730a3; border-radius:999px; padding:3px 9px; font-size:13px; font-weight:700; }
  .btn-new{ background:#3b82f6; color:#fff; border:none; border-radius:6px; padding:6px 10px; font-size:12px; font-weight:700; cursor:pointer; }
  .btn-new:hover{ background:#2563eb; }
  .table-wrapper{ overflow:auto; border-radius:6px; }
  .status-table{ width:100%; border-collapse:collapse; table-layout:fixed; }
  .status-table thead th{ text-align:left; font-size:13px; color:#475569; font-weight:700; padding:12px 14px; background:#f8fafc; border-bottom:1px solid #e5e7eb; }
  .status-table tbody td{ padding:12px 14px; border-bottom:1px solid #eef2f7; vertical-align:middle; text-align:left; font-size:13px; line-height:1.5; }
  .status-table tbody tr:nth-child(odd){ background:#fcfdff; }
  .status-table tbody tr:hover{ background:#f3f4f6; }
  .status-table tbody tr:last-child td{ border-bottom:none; }
  .status-table .col-check{ width:36px; text-align:center; }
  .status-table .col-name{ font-weight:700; color:#111827; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; }
  .status-table .col-start{ width:170px; white-space:nowrap; color:#374151; font-size:13px; }
  .status-table .col-end{ width:180px; white-space:nowrap; color:#374151; font-size:13px; }
  .status-table .col-assigned{ width:220px; display:flex; align-items:center; gap:8px; }
  .status-table .col-actions{ width:86px; text-align:center; }
  .btn-view{ padding:5px 8px; background:#f3f4f6; color:#111827; border:1px solid #e5e7eb; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
  .btn-view:hover{ background:#e5e7eb; }
  .icon-view{ width:16px; height:16px; display:block; }
  /* avatar + assignee */
  .avatar-img{ width:24px !important; height:24px !important; max-width:24px; max-height:24px; border-radius:999px; object-fit:cover; vertical-align:middle; flex:0 0 24px; }
  .assignee{ color:#111827; font-size:13px; }
  /* Safety: hide any legacy new-button if exists */
  .btn-new{ display:none !important; }
  .empty-hint{ color:#9ca3af; font-size:12px; padding:14px; border:1px dashed #e5e7eb; background:#fafafa; border-radius:6px; margin:0 4px 8px 4px; }
    `;
    const style = document.createElement('style'); style.id='status-list-css'; style.textContent = css; document.head.appendChild(style);
  }

  function bindInteractions(root){
    // Select all per section
    root.querySelectorAll('.status-card').forEach(section =>{
      const chkAll = section.querySelector('thead .chk-all');
      if(chkAll){
        chkAll.addEventListener('change', () =>{
          section.querySelectorAll('tbody .chk-row').forEach(ch => { ch.checked = chkAll.checked; });
        });
      }
      // Row check: if any unchecked then uncheck header
      section.querySelectorAll('tbody .chk-row').forEach(ch =>{
        ch.addEventListener('change', () =>{
          const rows = Array.from(section.querySelectorAll('tbody .chk-row'));
          const allChecked = rows.length>0 && rows.every(c=>c.checked);
          if(chkAll) chkAll.checked = allChecked;
        });
      });
      // View button click (stub)
      section.querySelectorAll('.btn-view').forEach(btn =>{
    btn.addEventListener('click', (e) =>{
      e && e.preventDefault && e.preventDefault();
      const idRaw = btn.getAttribute('data-id');
      const rid = idRaw ? parseInt(String(idRaw), 10) : NaN;
      if(!Number.isFinite(rid) || rid <= 0) return;
      try{
        const url = `/p/2.task_detail.html?id=${encodeURIComponent(rid)}`;
        const w = 1100;
        const h = 900;
        const left = Math.max(0, Math.floor((window.screen.width - w) / 2));
        const top = Math.max(0, Math.floor((window.screen.height - h) / 2));
        const features = `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`;
        const popup = window.open(url, 'wrk_report_detail', features);
        if(popup && popup.focus){ popup.focus(); }
        if(popup){
          const startAt = Date.now();
          const timer = window.setInterval(()=>{
            try{
              if(popup.closed){
                window.clearInterval(timer);
                if(Date.now() - startAt > 300){
                  render();
                }
              }
            }catch(_e){
              window.clearInterval(timer);
            }
          }, 700);
        }
      }catch(_e){
        window.location.href = `/p/2.task_detail.html?id=${encodeURIComponent(rid)}`;
      }
    });
      });
      // New task button (stub)
      // No New task button per latest requirement
    });
  }

  function init(){
    injectStyles();
    initBookAnim();
    render();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();