// CCTV dashboard: summarize systems inventory
(function(){
	'use strict';
	const KEY='cctv:systems';
	function load(){ try { return JSON.parse(localStorage.getItem(KEY)||'[]'); } catch(_) { return []; } }
	function ensureBar(elId, labels, values, opts={}){
		const el=document.getElementById(elId); if(!el) return; const ctx=el.getContext('2d'); const prev=Chart.getChart(el); if(prev) prev.destroy();
		const color = opts.color || '#14b8a6';
		const tickSuffix = opts.tickSuffix || '';
		new Chart(ctx,{ type:'bar', data:{ labels, datasets:[{ label: opts.label||'', data:values, backgroundColor:color, maxBarThickness:42 }] }, options:{ plugins:{ legend:{ display:false } }, scales:{ x:{ grid:{ display:false } }, y:{ beginAtZero:true, ticks:{ callback:(v)=> tickSuffix ? `${v}${tickSuffix}` : v } } }, responsive:true, maintainAspectRatio:false } });
	}
	function ensureDoughnut(elId, labels, values, colors){
		const el=document.getElementById(elId); if(!el) return; const ctx=el.getContext('2d'); const prev=Chart.getChart(el); if(prev) prev.destroy();
		new Chart(ctx,{ type:'doughnut', data:{ labels, datasets:[{ data:values, backgroundColor: colors||['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'] }] }, options:{ plugins:{ legend:{ position:'bottom' } }, cutout:'60%' } });
	}
	function countBy(arr, key){ const m=new Map(); arr.forEach(o=>{ const k=o[key]||'기타'; m.set(k,(m.get(k)||0)+1); }); return m; }
	function topEntries(mapLike, n=8){ const arr=[...mapLike.entries()].sort((a,b)=> b[1]-a[1]); return arr.slice(0,n); }

	function render(){
		const rows = load();
		// center distribution
		const byCenter = countBy(rows, 'place');
		const cTop = topEntries(byCenter, 8);
		ensureBar('chart-cctv-by-center', cTop.map(x=>x[0]), cTop.map(x=>x[1]), { color:'#3b82f6', label:'대수' });
		// vendor share
		const byVendor = countBy(rows, 'vendor');
		const vTop = topEntries(byVendor, 6);
		ensureDoughnut('chart-cctv-by-vendor', vTop.map(x=>x[0]), vTop.map(x=>x[1]));
		// status counts
		const byStatus = countBy(rows, 'status');
		const sArr = topEntries(byStatus, 5);
		ensureBar('chart-cctv-status', sArr.map(x=>x[0]), sArr.map(x=>x[1]), { color:'#10b981', label:'대수' });
		// recent table
		const tbody = document.getElementById('table-recent-cctv');
		if(tbody){
			const head = '<thead><tr><th>벤더</th><th>모델</th><th>장소</th><th>위치</th><th>IP</th><th>상태</th></tr></thead>';
			const body = '<tbody>' + rows.slice(-10).reverse().map(r=>`<tr><td>${r.vendor||''}</td><td>${r.model||''}</td><td>${r.place||''}</td><td>${r.location||''}</td><td>${r.ip||''}</td><td>${r.status||'-'}</td></tr>`).join('') + '</tbody>';
			tbody.innerHTML = head + body;
		}
	}

	// seed minimal if missing (reuse system seed)
	if(!localStorage.getItem(KEY)){
		localStorage.setItem(KEY, JSON.stringify([
			{ task_name:'CCTV', vendor:'Hanwha', model:'XNO-6085R', serial:'CAM-0001', place:'퓨처센터(5층)', location:'서고5층', zone:'A', ip:'10.10.5.11', auth:'-', status:'online' },
			{ task_name:'CCTV', vendor:'Axis', model:'P3245-LV', serial:'CAM-0002', place:'퓨처센터(6층)', location:'서고6층', zone:'B', ip:'10.10.6.12', auth:'-', status:'online' },
			{ task_name:'CCTV', vendor:'Hikvision', model:'DS-2CD2143G2', serial:'CAM-0003', place:'을지트윈타워(15층)', location:'서고15층', zone:'C', ip:'10.20.15.21', auth:'-', status:'offline' }
		]));
	}

	render();
})();
