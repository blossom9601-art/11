// Thermometer dashboard: 온도/습도 추이, 알람 분포, 센서 가동률
(function(){
	'use strict';
	// Data keys
	// readings: [{ date:"YYYY-MM-DD HH:MM", center:"...", zone:"1번-Cool존"|"12번-Hot존"|..., temp: number, hum: number }]
	// alerts: [{ date:"YYYY-MM-DD HH:MM", center:"...", type:"고온|저온|고습|저습" }]
	// uptime: [{ center:"...", uptimePct: number }]
	const READINGS_KEY = 'thermo:readings';
	const ALERTS_KEY = 'thermo:alerts';
	const UPTIME_KEY = 'thermo:uptime';

	function load(key){ try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch(_) { return []; } }

	const CENTERS = ['퓨처센터(5층)','퓨처센터(6층)','을지트윈타워(15층)','재해복구센터(4층)'];

	function bucketLabels(period){
		const now = new Date();
		if (period==='quarter'){
			let y = now.getFullYear(); let q = Math.floor(now.getMonth()/3)+1; const arr=[];
			for(let i=0;i<6;i++){ arr.push({y,q}); q--; if(q===0){q=4;y--;}} arr.reverse();
			return arr.map(({y,q})=>`${y} Q${q}`);
		}
		if (period==='year'){
			const cy = now.getFullYear(); const labels=[]; for(let y=cy-4;y<=cy;y++) labels.push(`${y}`); return labels;
		}
		const days = period==='week' ? 7 : 30; const labels=[]; const start=new Date(); start.setDate(start.getDate()-(days-1)); start.setHours(0,0,0,0);
		for(let i=0;i<days;i++){ const d=new Date(start); d.setDate(start.getDate()+i); labels.push(`${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`); }
		return labels;
	}

	function keyFromDate(d, period){
		if (period==='quarter') return `${d.getFullYear()} Q${Math.floor(d.getMonth()/3)+1}`;
		if (period==='year') return `${d.getFullYear()}`;
		return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
	}

	// Compute compliance % per time bucket for a given field with thresholds per zone type (Cool vs Hot).
	function computeCompliance(readings, center, period, field){
		const labels = bucketLabels(period);
		const ok = Object.fromEntries(labels.map(l=>[l,0]));
		const total = Object.fromEntries(labels.map(l=>[l,0]));
		const filtered = readings.filter(r=> (center==='__all__' || !center ? true : r.center===center));
		filtered.forEach(r=>{
			const dt=Date.parse(String(r.date).replace(' ','T')); if(isNaN(dt)) return; const d=new Date(dt); const k=keyFromDate(d, period); if(!(k in ok)) return;
			const isHot = typeof r.zone==='string' && r.zone.includes('Hot');
			const t = Number(r.temp), h = Number(r.hum);
			let pass=false;
			if (field==='temp') pass = isHot ? (t>=18 && t<=30) : (t>=15 && t<=27);
			else pass = (h>=20 && h<=70);
			total[k]++; if(pass) ok[k]++;
		});
		const values = labels.map(l=> total[l] ? Math.round((ok[l]/total[l])*100) : 0);
		return { labels, values };
	}

	function topExtremes(readings, center, period, field, topN){
		const labels = bucketLabels(period);
		const labelSet = new Set(labels);
		const filtered = readings.filter(r=> {
			if (!(center==='__all__' || !center ? true : r.center===center)) return false;
			const dt=Date.parse(String(r.date).replace(' ','T')); if(isNaN(dt)) return false; const d=new Date(dt); const k=keyFromDate(d, period);
			return labelSet.has(k);
		});
		const agg = new Map(); // zone -> max
		filtered.forEach(r=>{ const key=r.zone||'unknown'; const v=Number(r[field]); if(!isFinite(v)) return; const prev=agg.get(key); if(prev==null || v>prev) agg.set(key, v); });
		const arr=[...agg.entries()].sort((a,b)=>b[1]-a[1]).slice(0, topN);
		return { labels: arr.map(([k])=>k), values: arr.map(([,v])=>v) };
	}

	function computeUptime(uptime, center){
		const centers = center && center!=='__all__' ? [center] : CENTERS;
		return centers.map(c=>{ const arr=uptime.filter(u=>u.center===c); const v = arr.length? Math.round(arr.reduce((s,u)=>s+(Number(u.uptimePct)||0),0)/arr.length) : 0; return { name:c, value:v }; });
	}

	function ensureLine(elId, labels, values, color, label){
		const el=document.getElementById(elId); if(!el) return; const ctx=el.getContext('2d'); const prev=Chart.getChart(el); if(prev) prev.destroy();
		new Chart(ctx,{ type:'line', data:{ labels, datasets:[{ label, data:values, borderColor:color, backgroundColor:color+'33', fill:true, tension:0.3, pointRadius:2 }] }, options:{ plugins:{ legend:{ position:'top' } }, scales:{ x:{ grid:{ display:false } }, y:{ beginAtZero:true, max:100, ticks:{ callback:(v)=>v+"%" } } }, responsive:true, maintainAspectRatio:false } });
	}

	function ensureStacked(elId, labels, seriesObj, colors){
		const el=document.getElementById(elId); if(!el) return; const ctx=el.getContext('2d'); const prev=Chart.getChart(el); if(prev) prev.destroy();
		const datasets=Object.keys(seriesObj).map(k=>({ label:k, data:seriesObj[k], backgroundColor:colors[k]||'#999', stack:'s', borderWidth:0, maxBarThickness:42 }));
		new Chart(ctx,{ type:'bar', data:{ labels, datasets }, options:{ plugins:{ legend:{ position:'top' } }, scales:{ x:{ stacked:true, grid:{ display:false } }, y:{ stacked:true, beginAtZero:true, ticks:{ precision:0 } } }, responsive:true, maintainAspectRatio:false } });
	}

	function ensureBar(elId, labels, values, label, options={}){
		const el=document.getElementById(elId); if(!el) return; const ctx=el.getContext('2d'); const prev=Chart.getChart(el); if(prev) prev.destroy();
		const color = options.color || '#14b8a6';
		const max = options.max;
		const tickSuffix = options.tickSuffix || '';
		new Chart(ctx,{ type:'bar', data:{ labels, datasets:[{ label, data:values, backgroundColor:color }] }, options:{ plugins:{ legend:{ position:'top' } }, scales:{ x:{ grid:{ display:false } }, y:{ beginAtZero:true, ...(max!=null? { max } : {}), ticks:{ callback:(v)=> tickSuffix ? `${v}${tickSuffix}` : v } } }, responsive:true, maintainAspectRatio:false } });
	}

	function renderAll(){
		const centerSel = document.getElementById('select-center');
		const periodSel = document.getElementById('select-period');
		const center = centerSel ? centerSel.value : '__all__';
		const period = periodSel ? periodSel.value : 'week';

		const readings = load(READINGS_KEY);
		const { labels: tcLabels, values: tcValues } = computeCompliance(readings, center, period, 'temp');
		const { labels: hcLabels, values: hcValues } = computeCompliance(readings, center, period, 'hum');
		ensureLine('chart-temp-compliance', tcLabels, tcValues, '#ef4444', '적합 온도 비율(%)');
		ensureLine('chart-hum-compliance', hcLabels, hcValues, '#3b82f6', '적합 습도 비율(%)');

	const topT = topExtremes(readings, center, period, 'temp', 5);
	const topH = topExtremes(readings, center, period, 'hum', 5);
	ensureBar('chart-top-temp', topT.labels, topT.values, '최고 온도(°C)', { color:'#f97316', tickSuffix:'°C' });
	ensureBar('chart-top-hum', topH.labels, topH.values, '최고 습도(%)', { color:'#3b82f6', tickSuffix:'%' });
	}

	// Seed demo data if empty (safe, idempotent)
	(function seed(){
		if (!localStorage.getItem(READINGS_KEY)){
			const centers=CENTERS; const now=new Date(); const days=30; const data=[];
			for(const c of centers){
				for(let i=0;i<days;i++){
					const d=new Date(now); d.setDate(now.getDate()-i); d.setHours(9,0,0,0);
					const zones=[
						'1번-Cool존','2번-Cool존','3번-Cool존','4번-Cool존','5번-Cool존','6번-Cool존','7번-Cool존','8번-Cool존',
						'9번-Cool존','10번-Cool존','11번-Cool존','12번-Hot존','13번-Hot존','14번-Hot존','15번-Hot존','16번-Hot존'
					];
					const zone = zones[Math.floor(Math.random()*zones.length)];
					const isHot = zone.includes('Hot');
					const baseT = (isHot? 25 : 22) + (Math.random()*6-3);
					const baseH = 45 + (Math.random()*14-7);
					data.push({ date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:00`, center:c, zone, temp:+baseT.toFixed(1), hum:+baseH.toFixed(1) });
				}
			}
			localStorage.setItem(READINGS_KEY, JSON.stringify(data));
		}
		if (!localStorage.getItem(ALERTS_KEY)){
			const types=['고온','저온','고습','저습']; const arr=[]; const now=new Date();
			for(let i=0;i<40;i++){ const d=new Date(now); d.setDate(now.getDate()-Math.floor(Math.random()*28)); const c=CENTERS[Math.floor(Math.random()*CENTERS.length)]; const t=types[Math.floor(Math.random()*types.length)]; arr.push({ date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} 10:00`, center:c, type:t }); }
			localStorage.setItem(ALERTS_KEY, JSON.stringify(arr));
		}
		if (!localStorage.getItem(UPTIME_KEY)){
			const arr=CENTERS.map(c=>({ center:c, uptimePct: 95 + Math.round(Math.random()*5) }));
			localStorage.setItem(UPTIME_KEY, JSON.stringify(arr));
		}
	})();

	renderAll();
	document.getElementById('select-center')?.addEventListener('change', renderAll);
	document.getElementById('select-period')?.addEventListener('change', renderAll);
})();
