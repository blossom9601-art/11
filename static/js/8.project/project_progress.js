(function(){
  function initTabs(root){
    if(!root) return;
    const tabs = root.querySelectorAll('.progress-tab');
    const panels = root.querySelectorAll('.progress-panel');
    tabs.forEach(tab=>{
      tab.addEventListener('click', ()=>{
        if(tab.classList.contains('active')) return;
        tabs.forEach(t=>{ t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
        panels.forEach(p=> p.classList.add('hidden'));
        const panel = root.querySelector('#'+tab.getAttribute('aria-controls'));
        tab.classList.add('active');
        tab.setAttribute('aria-selected','true');
        if(panel){ panel.classList.remove('hidden'); }
      });
    });
  }

  function donut(el){
    if(!el) return; el.innerHTML='';
    const total = 100; const completed = 40; const radius = 48; const circ = 2*Math.PI*radius;
    const pct = completed/total; const doneLen = circ * pct; const remain = circ - doneLen;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS,'svg');
    svg.setAttribute('viewBox','0 0 120 120');
    svg.setAttribute('width','120'); svg.setAttribute('height','120');
    const bg = document.createElementNS(svgNS,'circle');
    bg.setAttribute('cx','60'); bg.setAttribute('cy','60'); bg.setAttribute('r',radius);
    bg.setAttribute('stroke','#e5e7eb'); bg.setAttribute('stroke-width','12'); bg.setAttribute('fill','none');
    const fg = document.createElementNS(svgNS,'circle');
    fg.setAttribute('cx','60'); fg.setAttribute('cy','60'); fg.setAttribute('r',radius);
    fg.setAttribute('stroke','#6366f1'); fg.setAttribute('stroke-width','12'); fg.setAttribute('fill','none');
    fg.setAttribute('stroke-dasharray', doneLen+' '+remain);
    fg.setAttribute('stroke-linecap','round');
    fg.setAttribute('transform','rotate(-90 60 60)');
    const txt = document.createElementNS(svgNS,'text');
    txt.setAttribute('x','60'); txt.setAttribute('y','64'); txt.setAttribute('text-anchor','middle'); txt.setAttribute('font-size','18'); txt.setAttribute('fill','#374151');
    txt.textContent = Math.round(pct*100)+'%';
    svg.appendChild(bg); svg.appendChild(fg); svg.appendChild(txt); el.appendChild(svg);
    const totalEl = document.getElementById('summary-total'); if(totalEl) totalEl.textContent= total;
    const compEl = document.getElementById('summary-completed'); if(compEl) compEl.textContent= completed;
    const activeEl = document.getElementById('summary-active'); if(activeEl) activeEl.textContent= 30;
    const pendEl = document.getElementById('summary-pending'); if(pendEl) pendEl.textContent= 20;
    const overEl = document.getElementById('summary-overdue'); if(overEl) overEl.textContent= 10;
    // Build timeline chart after donut stats mount
    buildTimeline();
  }

  // Weekly tasks-over-time (last 4~5 weeks) line chart
  function buildTimeline(){
    const wrapParent = document.getElementById('panel-chart');
    if(!wrapParent) return;
    let host = wrapParent.querySelector('.timeline-chart');
    if(!host){
      host = document.createElement('div'); host.className='timeline-chart';
      wrapParent.appendChild(host);
    }
    const now = new Date();
    const oneDay = 86400000;
    const startRange = new Date(now.getTime() - 28*oneDay); // last 4 weeks approx
    // Build week buckets (Mon-based)
    function weekStart(d){ const wd=(d.getDay()+6)%7; const s=new Date(d); s.setDate(d.getDate()-wd); s.setHours(0,0,0,0); return s; }
    const buckets = [];
    let cursor = weekStart(startRange);
    while(cursor <= now){
      const end = new Date(cursor.getTime() + 6*oneDay);
      // pseudo count per week
      const idx = buckets.length;
      const count = 40 + Math.round(Math.sin(idx)*10 + idx*6 + (Math.random()*8));
      buckets.push({ start:new Date(cursor), end, count });
      cursor = new Date(cursor.getTime() + 7*oneDay);
    }
    const points = buckets; // rename for reuse
    const svgNS='http://www.w3.org/2000/svg';
    host.innerHTML='';
    const svg=document.createElementNS(svgNS,'svg');
    host.appendChild(svg);
    const pad={l:36,r:14,t:4,b:24};
  const w=host.clientWidth||300; const h=host.clientHeight||240; const iw=w-pad.l-pad.r; const ih=h-pad.t-pad.b;
    const maxY=Math.max(...points.map(p=>p.count))*1.15;
    // grid & axes
    const gGrid=document.createElementNS(svgNS,'g'); gGrid.setAttribute('class','tl-grid');
    const ySteps=4; for(let i=0;i<=ySteps;i++){ const y=pad.t+ih-(ih*(i/ySteps)); const ln=document.createElementNS(svgNS,'line'); ln.setAttribute('x1',pad.l); ln.setAttribute('x2',pad.l+iw); ln.setAttribute('y1',y); ln.setAttribute('y2',y); gGrid.appendChild(ln);} svg.appendChild(gGrid);
    const xSteps=points.length-1; for(let i=0;i<=xSteps;i++){ const x=pad.l+iw*(i/xSteps); const ln=document.createElementNS(svgNS,'line'); ln.setAttribute('x1',x); ln.setAttribute('x2',x); ln.setAttribute('y1',pad.t); ln.setAttribute('y2',pad.t+ih); ln.setAttribute('stroke','#f1f5f9'); svg.appendChild(ln);}    
    // area & line path
    function xy(p,i){ const x=pad.l+iw*(i/(points.length-1)); const y=pad.t+ih-(p.count/maxY)*ih; return [x,y]; }
    const pts=points.map(xy); const areaPath=document.createElementNS(svgNS,'path');
    const dArea=pts.map((p,i)=> (i?'L':'M')+p[0]+' '+p[1]).join(' ')+` L ${pad.l+iw} ${pad.t+ih} L ${pad.l} ${pad.t+ih} Z`; areaPath.setAttribute('d',dArea); areaPath.setAttribute('class','tl-area'); svg.appendChild(areaPath);
    const linePath=document.createElementNS(svgNS,'path'); linePath.setAttribute('d', pts.map((p,i)=> (i?'L':'M')+p[0]+' '+p[1]).join(' ')); linePath.setAttribute('class','tl-line'); svg.appendChild(linePath);
    pts.forEach(p=>{ const c=document.createElementNS(svgNS,'circle'); c.setAttribute('cx',p[0]); c.setAttribute('cy',p[1]); c.setAttribute('class','tl-dot'); svg.appendChild(c); });
    // axes labels (x)
    const gAxis=document.createElementNS(svgNS,'g'); gAxis.setAttribute('class','tl-axis');
    points.forEach((pt,i)=>{ const x=pad.l+iw*(i/(points.length-1)); const txt=document.createElementNS(svgNS,'text'); txt.setAttribute('x',x); txt.setAttribute('y',h-8); txt.setAttribute('text-anchor','middle'); const m=pt.start.getMonth()+1; const d=pt.start.getDate(); txt.textContent=`W${i+1}\n${m}/${d}`; gAxis.appendChild(txt); });
    // y labels
    for(let i=0;i<=ySteps;i++){ const val=Math.round(maxY*(i/ySteps)); const y=pad.t+ih-(ih*(i/ySteps)); const txt=document.createElementNS(svgNS,'text'); txt.setAttribute('x',10); txt.setAttribute('y',y+4); txt.textContent=val; txt.setAttribute('class','tl-axis'); gAxis.appendChild(txt);} svg.appendChild(gAxis);
  }

  function fileModule(root){
    const drop = root.querySelector('#progress-dropzone');
    const input = root.querySelector('#progress-file-input');
    const list = root.querySelector('#progress-file-list');
    if(!drop || !input || !list) return;

    function extIcon(ext){ return '.' + (ext||'').toUpperCase(); }
    function humanSize(bytes){
      if(bytes >= 1024*1024) return (bytes/1024/1024).toFixed(1)+' MB';
      if(bytes >= 1024) return Math.round(bytes/1024)+' KB';
      return bytes + ' B';
    }

    function setEmpty(){
      if(list.children.length===0){
        const li=document.createElement('li'); li.className='file-empty';
        li.textContent='업로드된 파일이 없습니다.'; list.appendChild(li);
      }
    }
    function clearEmpty(){
      const el = list.querySelector('.file-empty'); if(el) el.remove();
    }

    function renderRecord(rec){
      clearEmpty();
      const li = document.createElement('li'); li.className='file-row'; li.dataset.fileId = rec.id;
      const ext = (rec.name.split('.').pop()||'');
      li.innerHTML = `
        <div class="file-ext">${extIcon(ext)}</div>
        <div class="file-main">
          <div class="file-name" title="${rec.name}">${rec.name}</div>
          <div class="file-meta">${humanSize(rec.size||0)}</div>
        </div>
        <div class="file-actions">
          <button class="file-btn" data-action="download" title="다운로드" aria-label="다운로드"><img src="/static/image/svg/download.svg" alt="download" style="border-radius:50%;"/></button>
          <button class="file-btn" data-action="delete" title="삭제" aria-label="삭제"><img src="/static/image/svg/delete.svg" alt="delete" style="border-radius:50%;"/></button>
        </div>`;
      list.appendChild(li);
    }

    async function loadList(){
      list.innerHTML='';
      try {
        const res = await fetch('/api/uploads');
        if(!res.ok) throw new Error('list failed');
        const data = await res.json();
        if(Array.isArray(data) && data.length){ data.forEach(renderRecord); } else setEmpty();
      } catch(err){
        // Silent fail: show empty state instead of error text per request
        list.innerHTML='';
        setEmpty();
      }
    }

    function showUploading(file){
      clearEmpty();
      const li=document.createElement('li'); li.className='file-row uploading';
      li.innerHTML=`
        <div class="file-ext">${extIcon(file.name.split('.').pop()||'')}</div>
        <div class="file-main">
          <div class="file-name" title="${file.name}">${file.name}</div>
          <div class="file-meta">업로드 중...</div>
        </div>
        <div class="file-actions"><span class="spinner" style="width:16px;height:16px;border:3px solid #ccc;border-top-color:#6366f1;border-radius:50%;display:inline-block;animation:spin 0.8s linear infinite"></span></div>`;
      list.appendChild(li);
      return li;
    }

    async function uploadFile(file){
      const row = showUploading(file);
      const fd = new FormData(); fd.append('file', file);
      try {
        const res = await fetch('/api/uploads', { method:'POST', body: fd });
        if(!res.ok) throw new Error('upload failed');
        const rec = await res.json();
        row.remove();
        renderRecord(rec);
      } catch(err){
        row.querySelector('.file-meta').textContent='실패';
        row.classList.add('error');
      }
    }

    function handleFiles(fileList){
      [...fileList].forEach(f=> uploadFile(f));
    }

    drop.addEventListener('click', ()=> input.click());
    input.addEventListener('change', e=>{ if(e.target.files?.length){ handleFiles(e.target.files); input.value=''; } });
    drop.addEventListener('dragover', e=>{ e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', ()=> drop.classList.remove('drag'));
    drop.addEventListener('drop', e=>{ e.preventDefault(); drop.classList.remove('drag'); if(e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files); });

    list.addEventListener('click', async (e)=>{
      const btn = e.target.closest('button.file-btn'); if(!btn) return;
      const li = btn.closest('li.file-row'); if(!li) return;
      const id = li.dataset.fileId; if(!id) return;
      const action = btn.dataset.action;
      if(action==='delete'){
        li.classList.add('deleting');
        try{
          const res = await fetch('/api/uploads/'+id, { method:'DELETE' });
          if(!res.ok) throw new Error();
          li.remove(); setEmpty();
        }catch(err){
          li.classList.remove('deleting');
          alert('삭제 실패');
        }
      } else if(action==='download'){
        // simply navigate; browser downloads
        window.location.href = '/api/uploads/'+id+'/download';
      }
    });

    loadList();
  }

  function commentsModule(root){
    const wrap = root.querySelector('#comments');
    const input = root.querySelector('#comment-input');
    const btn = root.querySelector('#btn-comment');
    if(!wrap || !input){ return; }
    // If button missing (template mismatch), create it.
    let submitBtn = btn;
    if(!submitBtn){
      const actions = root.querySelector('#panel-comments .comment-actions') || (function(){
        const form = root.querySelector('#panel-comments .comment-form') || root.querySelector('#panel-comments');
        const act = document.createElement('div'); act.className='comment-actions'; form.appendChild(act); return act; })();
      submitBtn = document.createElement('button');
      submitBtn.type='button'; submitBtn.id='btn-comment'; submitBtn.className='btn btn-primary'; submitBtn.textContent='등록';
      actions.appendChild(submitBtn);
    }
    const seed = [
      { user:'문현필', text:'좋아 보입니다.', time: minutesAgo( (60*24)+10 ) },
      { user:'김동현', text:'최근 3년 문서도 같이 검토할까요?', time: minutesAgo( 4 ) },
      { user:'PM', text:'초기 위험 분석 완료 – 주요 3개 리스크 중 2개는 대응 계획 수립.', time: minutesAgo( 5 ) }
    ];
    seed.forEach(o=> append(o,false));
    requestAnimationFrame(()=>{ wrap.scrollTop = wrap.scrollHeight; });

  submitBtn.addEventListener('click', submitNew);
  input.addEventListener('keydown', e=>{
      if(e.key==='Enter' && !e.shiftKey){
        e.preventDefault(); submitNew();
      }
    });

    function submitNew(){
      const val = input.value.trim(); if(!val) return;
      append({ user:'ME', text: val, time:'방금 전' }, true);
      input.value='';
      input.style.height='';
    }

    function append(obj, autoscroll=true){
      const row = document.createElement('div'); row.className='comment-row';
      const safeUser = escapeHtml(obj.user||'USER');
      const safeText = escapeHtml(obj.text||'');
      const time = escapeHtml(obj.time||'');
      row.innerHTML = `
        <div class="comment-avatar" aria-hidden="true">${initialOrIcon(safeUser)}</div>
        <div class="comment-content">
          <div class="comment-header"><span class="comment-author" title="${safeUser}">${safeUser}</span><span class="comment-time">${time}</span><span class="comment-icon" aria-hidden="true"></span></div>
          <div class="comment-body">${safeText}</div>
        </div>`;
      wrap.appendChild(row);
      if(autoscroll){ wrap.scrollTop = wrap.scrollHeight; }
    }
    function escapeHtml(s){ return s.replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }

    // Auto-resize textarea
    function autoResize(){
  // Single-line mode: fix height
  input.style.height='38px';
    }
    input.addEventListener('input', autoResize);
    autoResize();

    function initialOrIcon(name){
      return name && name.length? name.charAt(0) : '·';
    }

    function minutesAgo(mins){
      const now = new Date();
      const past = new Date(now.getTime() - mins*60000);
      // If different day -> MM-DD HH:MM 24h
      const pad=n=> (''+n).padStart(2,'0');
      if(past.toDateString() !== now.toDateString()){
        return `${pad(past.getMonth()+1)}-${pad(past.getDate())} ${pad(past.getHours())}:${pad(past.getMinutes())}`;
      }
      // same day -> 오전/오후 h:mm
      let h = past.getHours(); const m = pad(past.getMinutes());
      const ko = h<12? '오전' : '오후';
      h = h%12; if(h===0) h=12;
      return `${ko} ${h}:${m}`;
    }
  }

  window.addEventListener('DOMContentLoaded', ()=>{
    const aside = document.getElementById('project-progress');
    if(!aside) return;
    initTabs(aside);
    donut(document.getElementById('summary-donut'));
    fileModule(aside);
    commentsModule(aside);
  });
})();
