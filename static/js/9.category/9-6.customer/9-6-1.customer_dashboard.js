// 고객 대시보드: 고객사/회원사 회선수·담당자(데모용) 그룹 바
(function(){
  'use strict';

  function sampleClients(){
    const names = ['삼성전자','LG전자','SK하이닉스','현대자동차','기아','네이버','카카오'];
    return names.map((n,i)=>({ name:n, lines:(i%7)+1, managers:(i%5)+1 }));
  }
  function sampleMembers(){
    const names = ['우리카드','국민카드','신한카드','하나카드','롯데카드','삼성카드','현대카드'];
    return names.map((n,i)=>({ name:n, lines:(i%6)+1, managers:(i%4)+1 }));
  }
  function sampleVans(){
    const names = ['KSNET','NICE정보통신','KIS정보통신','JTNet','스마트로','KICC','세틀뱅크'];
    return names.map((n,i)=>({ name:n, lines:(i%5)+1, managers:(i%3)+1 }));
  }

  function renderBar(canvasId, labels, aData, bData, aLabel, bLabel){
    const el = document.getElementById(canvasId);
    if (!el || !window.Chart) return;
    const rows = Math.max(1, labels.length);
    const desired = Math.max(360, rows*28 + 64);
    try { el.height = desired; } catch(_){}
    const data = { labels, datasets:[
      { label: aLabel, data: aData, backgroundColor:'#6366F1', barThickness:12 },
      { label: bLabel, data: bData, backgroundColor:'#22D3EE', barThickness:12 }
    ]};
    const options = { responsive:true, maintainAspectRatio:false, indexAxis:'y', scales:{
      x:{ grid:{ color:'rgba(107,114,128,0.15)'} }, y:{ grid:{ display:false }, ticks:{ autoSkip:false } }
    }, plugins:{ legend:{ position:'bottom' } } };
    new Chart(el, { type:'bar', data, options });
  }

  document.addEventListener('DOMContentLoaded', () => {
  const c = sampleClients();
  const m = sampleMembers();
  const v = sampleVans();
    renderBar('chart-clients', c.map(x=>x.name), c.map(x=>x.lines), c.map(x=>x.managers), '회선수', '담당자');
    renderBar('chart-members', m.map(x=>x.name), m.map(x=>x.lines), m.map(x=>x.managers), '회선수', '담당자');
  renderBar('chart-vans', v.map(x=>x.name), v.map(x=>x.lines), v.map(x=>x.managers), '회선수', '담당자');
  });
})();
