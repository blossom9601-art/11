// 회사 대시보드: 센터별/부서별 하드웨어·소프트웨어 수량 (개별 항목 기준)
(function(){
  'use strict';

  const q = (id) => document.getElementById(id);

  // 샘플 데이터 (리스트 페이지와 구조 일치)
  function sampleCenters(){
    const centers = [
      { name: '서울 데이터센터 A', address: '서울특별시 중구 세종대로 110' },
      { name: '서울 데이터센터 B', address: '서울특별시 강남구 테헤란로 152' },
      { name: '부산 데이터센터', address: '부산광역시 해운대구 센텀중앙로 97' },
      { name: '대구 데이터센터', address: '대구광역시 수성구 달구벌대로 2450' },
      { name: '광주 데이터센터', address: '광주광역시 서구 상무대로 981' },
      { name: '대전 데이터센터', address: '대전광역시 유성구 대학로 99' },
      { name: '인천 데이터센터', address: '인천광역시 연수구 인천타워대로 250' },
      { name: '수원 데이터센터', address: '경기도 수원시 영통구 삼성로 129' },
      { name: '춘천 데이터센터', address: '강원특별자치도 춘천시 세종대로 1' },
      { name: '전주 데이터센터', address: '전북특별자치도 전주시 완산구 팔달로 200' },
      { name: '창원 데이터센터', address: '경상남도 창원시 의창구 중앙대로 151' },
      { name: '청주 데이터센터', address: '충청북도 청주시 상당구 상당로 82' }
    ];
    return centers.map((c,i)=>({ ...c, hw: (i%9)+1, sw: (i%7)+2 }));
  }
  function sampleDepartments(){
    const names = ['인프라팀','플랫폼팀','보안팀','네트워크팀','데이터팀','클라우드팀','개발1팀','개발2팀','QA팀','운영팀','헬프데스크','PMO'];
    return names.map((n,i)=>({ name:n, desc:`${n} 업무를 담당합니다.`, hw:(i%8)+1, sw:(i%6)+2 }));
  }
  // 직원 차트는 현재 대시보드에서 제외

  function render(){
  const centers = sampleCenters();
  const depts = sampleDepartments();

  // 상단 카운트 배지 제거됨

    if (!window.Chart) return;
    // 전역 애니메이션 비활성화
    Chart.defaults.animation = false;
    Chart.defaults.transitions.active = { animation: { duration: 0 } };

  const renderGroupedBar = (canvasId, labels, hwData, swData) => {
    const el = document.getElementById(canvasId);
      if (!el) return;
      // 행 수에 따라 캔버스 높이 보정 (가독성)
      const rows = Math.max(1, labels.length);
  const desired = Math.max(480, rows * 30 + 96);
      try { el.height = desired; } catch(_){}
      const container = el.closest('.chart-container') || el.parentElement;
      if (container) {
        const rect = container.getBoundingClientRect();
        el.width = Math.max(0, Math.floor(rect.width));
      }

      const data = {
        labels,
        datasets: [
          { label: '하드웨어', data: hwData, backgroundColor: '#6366F1', borderWidth: 0, barThickness: 12 },
          { label: '소프트웨어', data: swData, backgroundColor: '#22D3EE', borderWidth: 0, barThickness: 12 }
        ]
      };
      const options = {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(107,114,128,0.15)' } },
          y: { ticks: { color: '#6b7280', autoSkip: false }, grid: { display: false } }
        },
        plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, color: '#6b7280' } } }
      };
      const ch = new Chart(el, { type: 'bar', data, options });
      try { ch.stop(); ch.update(0); } catch(_){}
    };

    // 상위 5개(총합 HW+SW 기준)만 표시
    const topN = (items, n) => {
      return (items || [])
        .map(it => ({ ...it, _total: (Number(it.hw)||0) + (Number(it.sw)||0) }))
        .sort((a,b) => b._total - a._total)
        .slice(0, n);
    };
    const cTop = topN(centers, 5);
    const dTop = topN(depts, 5);

    // 데이터 매핑 (상위 5개)
    renderGroupedBar('chart-center-hw-sw', cTop.map(c=>c.name), cTop.map(c=>c.hw), cTop.map(c=>c.sw));
    renderGroupedBar('chart-dept-hw-sw', dTop.map(d=>d.name), dTop.map(d=>d.hw), dTop.map(d=>d.sw));
  }

  document.addEventListener('DOMContentLoaded', render);
})();
