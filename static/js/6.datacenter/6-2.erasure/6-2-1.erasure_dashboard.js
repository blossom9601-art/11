// 데이터 삭제 관리 - 대시보드 (기록 데이터 기반)
(function(){
  const LS_KEY_RECORDS = 'ERASURE_RECORDS';
  let charts = { d7: null, ratio: null };
  const filter = { center: '전체', period: 'week' }; // center: 전체/퓨처센터/재해복구센터, period: week|month|quarter|year

  function getRecords(){
    try{
      const raw=localStorage.getItem(LS_KEY_RECORDS);
      if(!raw) return [];
      const arr=JSON.parse(raw);
      return Array.isArray(arr)?arr:[];
    }catch{ return []; }
  }
  function setRecords(arr){ try{ localStorage.setItem(LS_KEY_RECORDS, JSON.stringify(arr||[])); }catch{} }

  function todayKey(d=new Date()){ return d.toISOString().slice(0,10); }
  function isSameWeek(d, ref=new Date()){
    const date=new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const r=new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    const day = (r.getDay()+6)%7; // Monday=0
    const monday=new Date(r); monday.setDate(r.getDate()-day);
    const sunday=new Date(monday); sunday.setDate(monday.getDate()+6);
    return date>=monday && date<=sunday;
  }
  function isSameMonth(d, ref=new Date()){ return d.getFullYear()===ref.getFullYear() && d.getMonth()===ref.getMonth(); }

  function inPeriod(date, period){
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const now = new Date();
    const n = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if(period==='week') { return isSameWeek(d, n); }
    if(period==='month') { return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth(); }
    if(period==='quarter') {
      const q = Math.floor(d.getMonth()/3), nq=Math.floor(n.getMonth()/3); return d.getFullYear()===n.getFullYear() && q===nq;
    }
    if(period==='year') { return d.getFullYear()===n.getFullYear(); }
    return true;
  }

  function applyCenter(records){
    if(filter.center==='전체') return records;
    // center 필드가 없으면 전체로 간주
    return records.filter(r=> (r.center||'전체')===filter.center);
  }

  function computeKPIs(records){
    records = applyCenter(records);
    const tk=todayKey();
    let today=0, week=0, month=0, succ=0;
    for(const r of records){
      const ds=new Date(r.work_date);
      const dkey=r.work_date;
      if(dkey===tk) today++;
      if(isSameWeek(ds)) week++;
      if(isSameMonth(ds)) month++;
      if(r.success==='성공') succ++;
    }
    const successRate = records.length? Math.round((succ/records.length)*100) : 0;
    return {today, week, month, successRate};
  }

  function lastNDaysLabels(n){ const arr=[]; const d=new Date(); for(let i=n-1;i>=0;i--){ const x=new Date(d); x.setDate(d.getDate()-i); arr.push(x.toISOString().slice(5,10)); } return arr; }
  function lastNMonthsLabels(n){ const arr=[]; const d=new Date(); for(let i=n-1;i>=0;i--){ const x=new Date(d.getFullYear(), d.getMonth()-i, 1); arr.push(`${String(x.getMonth()+1).padStart(2,'0')}월`); } return arr; }
  function lastNQuartersLabels(n){ const arr=[]; const d=new Date(); const curQ=Math.floor(d.getMonth()/3)+1; const base=d.getFullYear()*4+curQ; for(let i=n-1;i>=0;i--){ const v=base-i; const y=Math.floor((v-1)/4); const q=((v-1)%4)+1; arr.push(`${y} Q${q}`); } return arr; }
  function lastNYearsLabels(n){ const arr=[]; const y=new Date().getFullYear(); for(let i=n-1;i>=0;i--){ arr.push(`${y-i}년`); } return arr; }
  function groupByDayLast7(records){
    records = applyCenter(records).filter(r=> inPeriod(new Date(r.work_date), 'week'));
    const labels = lastNDaysLabels(7);
    const map = Object.fromEntries(labels.map(l=>[l,0]));
    const now=new Date();
    for(const r of records){
      const ds=new Date(r.work_date);
      const diffDays=Math.floor((now - ds)/(24*3600*1000));
      if(diffDays>=0 && diffDays<7){ const key=r.work_date.slice(5,10); map[key]=(map[key]||0)+1; }
    }
    return { labels, data: labels.map(l=>map[l]||0) };
  }
  function successFailCounts(records){
    records = applyCenter(records).filter(r=> inPeriod(new Date(r.work_date), filter.period));
    let ok=0, fail=0; for(const r of records){ if(r.success==='성공') ok++; else fail++; } return { ok, fail };
  }

  function ensureChart(key, ctx, cfg){
    try{
      if(charts[key]){ charts[key].destroy(); charts[key]=null; }
      charts[key] = new Chart(ctx, cfg);
      return charts[key];
    }catch{ return null; }
  }

  function render(records){
  const filteredForPeriod = applyCenter(records).filter(r=> inPeriod(new Date(r.work_date), filter.period));
  // KPI 카드 제거됨

    // 필터 카드 상단 텍스트
    const dateEl = document.getElementById('filter-date');
    const totalEl = document.getElementById('filter-total');
    const capEl = document.getElementById('filter-caption');
    if(dateEl){
      const now = new Date();
      const wday = ['일','월','화','수','목','금','토'][now.getDay()];
      const y=now.getFullYear(); const m=String(now.getMonth()+1).padStart(2,'0'); const d=String(now.getDate()).padStart(2,'0');
      dateEl.textContent = `${y}년 ${m}월 ${d}일 ${wday}`;
    }
    if(totalEl) totalEl.textContent = String(filteredForPeriod.length||0);
    if(capEl) capEl.textContent = `${labelPeriod(filter.period)} 처리 건수 (${filter.center})`;

    // 메인 차트 데이터 소스 (기간에 따라 스위치)
  const titleEl=document.getElementById('chart-main-title');
  let labels=[], data=[], chartType='bar';
    if(filter.period==='week'){
  const d7=groupByDayLast7(records); labels=d7.labels; data=d7.data; titleEl && (titleEl.textContent=`처리 건수`);
    } else if(filter.period==='month'){
      labels = lastNMonthsLabels(6);
      const map=Object.fromEntries(labels.map(l=>[l,0]));
      applyCenter(records).forEach(r=>{ const d=new Date(r.work_date); const key=`${String(d.getMonth()+1).padStart(2,'0')}월`; if(inPeriod(d,'year')) map[key]=(map[key]||0)+1; });
      data = labels.map(l=>map[l]||0);
  titleEl && (titleEl.textContent=`처리 건수`);
    } else if(filter.period==='quarter'){
      labels = lastNQuartersLabels(6);
      const map=Object.fromEntries(labels.map(l=>[l,0]));
      applyCenter(records).forEach(r=>{ const d=new Date(r.work_date); const q=Math.floor(d.getMonth()/3)+1; const key=`${d.getFullYear()} Q${q}`; map[key]=(map[key]||0)+1; });
      data = labels.map(l=>map[l]||0);
  titleEl && (titleEl.textContent=`처리 건수`);
    } else if(filter.period==='year'){
      labels = lastNYearsLabels(5);
      const map=Object.fromEntries(labels.map(l=>[l,0]));
      applyCenter(records).forEach(r=>{ const d=new Date(r.work_date); const key=`${d.getFullYear()}년`; map[key]=(map[key]||0)+1; });
      data = labels.map(l=>map[l]||0);
  titleEl && (titleEl.textContent=`처리 건수`);
    }
    const c1=document.getElementById('chart-7days');
    if(c1){ ensureChart('d7', c1, {
      type:'bar',
      data:{ labels, datasets:[{ label:'처리 건수', data, backgroundColor:'rgba(79,70,229,0.9)', borderRadius:6, maxBarThickness:32 }] },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
          legend:{ display:false },
          tooltip:{ mode:'index', intersect:false }
        },
        scales:{
          x:{ ticks:{ maxRotation:0 }, grid:{ display:false } },
          y:{ beginAtZero:true, ticks:{ precision:0, stepSize:1 }, grid:{ color:'rgba(0,0,0,0.05)' } }
        }
      }
    }); }

    const c2=document.getElementById('chart-success-ratio');
  if(c2){ const sf=successFailCounts(records); ensureChart('ratio', c2, {
      type:'doughnut',
      data:{ labels:['성공','실패'], datasets:[{ data:[sf.ok, sf.fail], backgroundColor:['#10B981','#EF4444'], hoverOffset:6, borderWidth:0 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'68%', plugins:{ legend:{ position:'bottom' }, tooltip:{ callbacks:{ label:(ctx)=> `${ctx.label}: ${ctx.parsed}건` } } } },
      plugins:[{
        id:'center-text',
        afterDraw(chart){
          const {ctx, chartArea:{left,right,top,bottom}} = chart;
          const total = (sf.ok+sf.fail)||1; const rate = Math.round((sf.ok/total)*100);
          ctx.save();
          ctx.fillStyle='#111827';
          ctx.font='600 20px Inter, sans-serif';
          ctx.textAlign='center';
          ctx.textBaseline='middle';
          ctx.fillText(`${rate}%`, (left+right)/2, (top+bottom)/2);
          ctx.restore();
        }
      }]
    }); }

    // 디스크 유형 통계 (레코드의 model 또는 별도 필드를 휴리스틱으로 분류)
    const cd=document.getElementById('chart-disk-type');
    if(cd){
      const kinds=['FC HDD','SATA HDD','SAS HDD','SATA SSD','SAS SSD','NVMe SSD','기타'];
      const counts=Object.fromEntries(kinds.map(k=>[k,0]));
      const classify=(t)=>{
        const txt=(t||'').toString().toUpperCase().replace(/\s|-/g,'');
        if(/NVME/.test(txt)) return 'NVMe SSD';
        if(/SSD/.test(txt)){
          if(/SAS/.test(txt)) return 'SAS SSD';
          if(/SATA/.test(txt)) return 'SATA SSD';
          return 'SATA SSD';
        }
        if(/HDD/.test(txt)){
          if(/SAS/.test(txt)) return 'SAS HDD';
          if(/FC/.test(txt)) return 'FC HDD';
          if(/SATA/.test(txt)) return 'SATA HDD';
          return 'SATA HDD';
        }
        if(/SAS/.test(txt)) return 'SAS HDD';
        if(/FC/.test(txt)) return 'FC HDD';
        if(/SATA/.test(txt)) return 'SATA HDD';
        return '기타';
      };
      filteredForPeriod.forEach(r=>{
        const key = classify(r.disk_type || r.model || '');
        counts[key] = (counts[key]||0)+1;
      });
      const dataKinds=kinds.map(k=>counts[k]);
      const totalDisk = dataKinds.reduce((a,b)=>a+b,0);
      ensureChart('disk', cd, {
        type:'bar',
        data:{ labels:kinds, datasets:[{ label:'건수', data:dataKinds, backgroundColor:'#6366F1', borderRadius:6, maxBarThickness:28 }]},
        options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(ctx)=> `${ctx.parsed.y}건` } } }, scales:{ x:{ grid:{ display:false } }, y:{ beginAtZero:true, ticks:{ precision:0, stepSize:1 } } } },
        plugins:[{
          id:'empty-dataset', afterDraw(chart){ if(totalDisk>0) return; const {ctx, chartArea:{left,right,top,bottom}}=chart; ctx.save(); ctx.fillStyle='#9CA3AF'; ctx.font='600 14px Inter, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('데이터 없음', (left+right)/2, (top+bottom)/2); ctx.restore(); }
        }]
      });
    }

    // 제조사 통계 (요청: EMC, HPE, DELL, Hitachi, Samsung)
    const cv=document.getElementById('chart-vendor');
    if(cv){
      const vendors=['EMC','HPE','DELL','Hitachi','Samsung','기타'];
      const map=Object.fromEntries(vendors.map(v=>[v,0]));
      const patterns={
        EMC:/(^|\b)(EMC|DELL\s*EMC|EMC2)(\b|$)/i,
        HPE:/(^|\b)(HPE|HP|Hewlett\s*Packard)(\b|$)/i,
        DELL:/(^|\b)(DELL)(\b|$)/i,
        Hitachi:/(^|\b)(Hitachi|HGST)(\b|$)/i,
        Samsung:/(^|\b)(Samsung|SAMSUNG\s*Electronics)(\b|$)/i
      };
      filteredForPeriod.forEach(r=>{
        const v=(r.vendor||'').toString();
        let matched=false;
        for(const k of ['EMC','HPE','DELL','Hitachi','Samsung']){
          if(patterns[k].test(v)){ map[k]++; matched=true; break; }
        }
        if(!matched) map['기타']++;
      });
      const vals=vendors.map(v=>map[v]);
      const totalVendor = vals.reduce((a,b)=>a+b,0);
      ensureChart('vendor', cv, {
        type:'pie',
        data:{ 
          labels:vendors, 
          datasets:[{ 
            data:vals, 
            backgroundColor:['#10B981','#FB923C','#60A5FA','#A78BFA','#F87171','#9CA3AF'], 
            borderWidth:2,
            borderColor:'#ffffff',
            hoverBorderWidth:3,
            hoverBorderColor:'#ffffff'
          }] 
        },
        options:{
          responsive:true, 
          maintainAspectRatio:false, 
          plugins:{ 
            legend:{ 
              position:'bottom',
              labels: {
                padding: 20,
                usePointStyle: true,
                pointStyle: 'circle'
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                  return `${label}: ${value}건 (${percentage}%)`;
                }
              }
            }
          }
        },
        plugins:[{
          id:'empty-dataset', 
          afterDraw(chart){ 
            if(totalVendor>0) return; 
            const {ctx, chartArea:{left,right,top,bottom}}=chart; 
            ctx.save(); 
            ctx.fillStyle='#9CA3AF'; 
            ctx.font='600 14px Inter, sans-serif'; 
            ctx.textAlign='center'; 
            ctx.textBaseline='middle'; 
            ctx.fillText('데이터 없음', (left+right)/2, (top+bottom)/2); 
            ctx.restore(); 
          }
        }]
      });
    }
  }

  function labelPeriod(p){
    return p==='week'?'주':p==='month'?'월':p==='quarter'?'분기':'년';
  }

  // 기록 페이지 모달과 동일한 폼 읽기
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

  function showModal(){ const m=document.getElementById('physical-edit-modal'); if(!m) return; m.style.display='flex'; setTimeout(()=>m.classList.add('show'),0); document.body.classList.add('modal-open'); }
  function hideModal(){ const m=document.getElementById('physical-edit-modal'); if(!m) return; m.classList.remove('show'); setTimeout(()=>{ m.style.display='none'; },150); document.body.classList.remove('modal-open'); }

  function bind(){
  // + 버튼으로 동일 모달 열기
    const btn=document.getElementById('open-register'); if(btn) btn.addEventListener('click', showModal);
    const close=document.getElementById('physical-close-edit'); if(close) close.addEventListener('click', hideModal);
    const modal=document.getElementById('physical-edit-modal'); if(modal) modal.addEventListener('click',(e)=>{ if(e.target===modal) hideModal(); });
    document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') hideModal(); });
    const save=document.getElementById('physical-edit-save'); if(save) save.addEventListener('click',(e)=>{
      e.preventDefault();
      const data=readForm();
      if(!data.work_date||!data.work_dept||!data.worker||!data.req_dept||!data.req_person||!data.vendor||!data.model||!data.serial){ alert('필수 항목을 입력하세요.'); return; }
      const arr=getRecords();
      if(arr.some(x=>x.serial===data.serial)) { alert('이미 존재하는 일련번호입니다.'); return; }
      arr.unshift(data); setRecords(arr); hideModal(); render(arr);
    });

  // 드롭다운 필터 바인딩
  const selCenter = document.getElementById('select-center');
  const selPeriod = document.getElementById('select-period');
  const btnRefresh = document.getElementById('btn-refresh');
  if(selCenter){ selCenter.addEventListener('change',()=>{ filter.center = selCenter.value; render(getRecords()); }); }
  if(selPeriod){ selPeriod.addEventListener('change',()=>{ filter.period = selPeriod.value; render(getRecords()); }); }
  // 새로고침 버튼 제거됨
  }

  document.addEventListener('DOMContentLoaded', ()=>{ bind(); render(getRecords()); });
})();
