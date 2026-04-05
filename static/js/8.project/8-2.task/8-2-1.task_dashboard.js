(function(){
  function rand(n){return Math.max(0,Math.round(n + (Math.random()-0.5)*n*0.4));}
  function makeDonutData(labels){
    const values = labels.map(()=>rand(20)+5);
    const bg = ['#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f','#edc949','#af7aa1'];
    return {labels, datasets:[{data:values, backgroundColor:bg.slice(0,labels.length)}]};
  }
  function makeBarData(labels){
    const values = labels.map(()=>rand(25)+3);
    return {labels, datasets:[{label:'건수', data:values, backgroundColor:'#6366f1'}]};
  }

  function init(){
    const el1 = document.getElementById('chart-task-status');
    const el2 = document.getElementById('chart-task-assignee');
    const el3 = document.getElementById('chart-task-category');
    const el4 = document.getElementById('chart-task-weekly');
    if (!el1 || !el2 || !el3 || !el4) return;

    new Chart(el1, {type:'doughnut', data: makeDonutData(['진행중','예정','완료']), options:{plugins:{legend:{position:'bottom'}}}});
    new Chart(el2, {type:'bar', data: makeBarData(['김민수','이지은','박서준','최유진','홍길동']), options:{plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}}}});
    new Chart(el3, {type:'doughnut', data: makeDonutData(['개발','인프라','보안','운영']), options:{plugins:{legend:{position:'bottom'}}}});
    new Chart(el4, {type:'line', data: {labels:['W-4','W-3','W-2','W-1','이번주'], datasets:[{label:'완료', data:[3,5,4,7,6], borderColor:'#10b981', backgroundColor:'rgba(16,185,129,.2)', tension:.3, fill:true}]} , options:{plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}}}});
  }

  document.addEventListener('DOMContentLoaded', init);
})();
