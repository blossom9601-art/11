// Transformer dashboard: summarize systems inventory
(function(){
	'use strict';
	const KEY='transformer:systems';
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
	function bucketCapacity(rows){
		// <100, 100-199, 200-499, 500-999, >=1000 kVA
		const bins=[0,0,0,0,0];
		rows.forEach(r=>{ const c = Number(r.capacity_kva); if(!isFinite(c)) return; if(c<100) bins[0]++; else if(c<200) bins[1]++; else if(c<500) bins[2]++; else if(c<1000) bins[3]++; else bins[4]++; });
		return bins;
	}

	function render(){
		const rows = load();
		// center distribution
		const byCenter = countBy(rows, 'place');
		const cTop = topEntries(byCenter, 8);
		ensureBar('chart-tr-by-center', cTop.map(x=>x[0]), cTop.map(x=>x[1]), { color:'#3b82f6', label:'대수' });
		// vendor share
		const byVendor = countBy(rows, 'vendor');
		const vTop = topEntries(byVendor, 6);
		ensureDoughnut('chart-tr-by-vendor', vTop.map(x=>x[0]), vTop.map(x=>x[1]));
		// status counts
		const byStatus = countBy(rows, 'status');
		const sArr = topEntries(byStatus, 5);
		ensureBar('chart-tr-status', sArr.map(x=>x[0]), sArr.map(x=>x[1]), { color:'#10b981', label:'대수' });
		// capacity distribution
		const capLabels=['<100','100-199','200-499','500-999','1000+'];
		const capValues=bucketCapacity(rows);
		ensureBar('chart-tr-capacity', capLabels, capValues, { color:'#f59e0b', label:'장비', tickSuffix:'' });
		// recent table
		const tbody = document.getElementById('table-recent-tr');
		if(tbody){
			const head = '<thead><tr><th>벤더</th><th>모델</th><th>장소</th><th>위치</th><th>용량(kVA)</th><th>상태</th></tr></thead>';
			const body = '<tbody>' + rows.slice(-10).reverse().map(r=>`<tr><td>${r.vendor||''}</td><td>${r.model||''}</td><td>${r.place||''}</td><td>${r.location||''}</td><td>${r.capacity_kva??'-'}</td><td>${r.status||'-'}</td></tr>`).join('') + '</tbody>';
			tbody.innerHTML = head + body;
		}
	}

	// seed minimal if missing (Transformer-like)
	if(!localStorage.getItem(KEY)){
		localStorage.setItem(KEY, JSON.stringify([
			{ task_name:'Transformer', vendor:'Siemens', model:'SIVACON-T1', serial:'TR-0001', place:'퓨처센터(5층)', location:'전기실5F', zone:'A', capacity_kva:500, status:'online' },
			{ task_name:'Transformer', vendor:'ABB', model:'TXpert', serial:'TR-0002', place:'퓨처센터(6층)', location:'전기실6F', zone:'B', capacity_kva:750, status:'online' },
			{ task_name:'Transformer', vendor:'Hyosung', model:'PowerX', serial:'TR-0003', place:'을지트윈타워(15층)', location:'전기실15F', zone:'C', capacity_kva:1500, status:'maintenance' }
		]));
	}

	render();
})();
