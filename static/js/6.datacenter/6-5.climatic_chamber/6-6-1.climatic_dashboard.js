// Climatic chamber dashboard: Stability & efficiency summaries with detail modals
(function(){
	'use strict';
	// readings: [{ date:"YYYY-MM-DD HH:MM", center:"...", equipment:"5F-1번", temp:number, hum:number }]
	const READINGS_KEY = 'climatic:readings';
	const CENTERS = ['퓨처센터(5층)','퓨처센터(6층)','을지트윈타워(15층)','재해복구센터(4층)'];

	function load(){ try { return JSON.parse(localStorage.getItem(READINGS_KEY)||'[]'); } catch(_) { return []; } }

	function bucketLabels(period){
		const now=new Date();
		if(period==='quarter'){
			let y=now.getFullYear(); let q=Math.floor(now.getMonth()/3)+1; const arr=[];
			for(let i=0;i<6;i++){ arr.push({y,q}); q--; if(q===0){q=4;y--;} }
			arr.reverse();
			return arr.map(({y,q})=>`${y} Q${q}`);
		}
		if(period==='year'){
			const cy=now.getFullYear(); const labels=[]; for(let y=cy-4;y<=cy;y++) labels.push(`${y}`); return labels;
		}
		const days=period==='week'?7:30; const labels=[]; const start=new Date(); start.setDate(start.getDate()-(days-1)); start.setHours(0,0,0,0);
		for(let i=0;i<days;i++){ const d=new Date(start); d.setDate(start.getDate()+i); labels.push(`${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`); }
		return labels;
	}
	function keyFromDate(d, period){
		if(period==='quarter') return `${d.getFullYear()} Q${Math.floor(d.getMonth()/3)+1}`;
		if(period==='year') return `${d.getFullYear()}`;
		return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
	}

	function ensureBar(elId, labels, values, opts={}){
		const el=document.getElementById(elId); if(!el) return; const ctx=el.getContext('2d'); const prev=Chart.getChart(el); if(prev) prev.destroy();
		const color = opts.color || '#14b8a6';
		const tickSuffix = opts.tickSuffix || '';
		new Chart(ctx,{ type:'bar', data:{ labels, datasets:[{ label: opts.label||'', data:values, backgroundColor:color, maxBarThickness:42 }] }, options:{ plugins:{ legend:{ display:false } }, scales:{ x:{ grid:{ display:false } }, y:{ beginAtZero:true, ticks:{ callback:(v)=> tickSuffix ? `${v}${tickSuffix}` : v } } }, responsive:true, maintainAspectRatio:false } });
	}

	function filterByCenterAndPeriod(all, center, period){
		const labels=bucketLabels(period); const set=new Set(labels);
		return all.filter(r=>{
			if(center && center!=='__all__' && r.center!==center) return false;
			const dt=Date.parse(String(r.date).replace(' ','T')); if(isNaN(dt)) return false; const d=new Date(dt); const k=keyFromDate(d, period);
			return set.has(k);
		});
	}

	// helpers to compute per-equipment stats
	function groupByEquipment(readings){ const m=new Map(); for(const r of readings){ const k=r.equipment||'unknown'; if(!m.has(k)) m.set(k,[]); m.get(k).push(r);} return m; }
	function computeStats(records){
		const arr=[...records].sort((a,b)=> new Date(a.date)-new Date(b.date));
		let minT=Infinity,maxT=-Infinity,sumT=0,cntT=0,belowT=0,aboveT=0;
		let minH=Infinity,maxH=-Infinity,sumH=0,cntH=0,outsideH=0,rapidH=0;
		let stable=0,total=0; let inBreach=false, breachStart=null; const recTimes=[]; let lastH=null;
		for(const r of arr){ const t=+r.temp, h=+r.hum, ts=new Date(r.date).getTime();
			if(isFinite(t)){ minT=Math.min(minT,t); maxT=Math.max(maxT,t); sumT+=t; cntT++; if(t<20) belowT++; else if(t>30) aboveT++; }
			if(isFinite(h)){ minH=Math.min(minH,h); maxH=Math.max(maxH,h); sumH+=h; cntH++; if(h<20||h>70) outsideH++; if(lastH!=null && Math.abs(h-lastH)>=5) rapidH++; lastH=h; }
			if(isFinite(t)&&isFinite(h)){ total++; const ok=(t>=20&&t<=30&&h>=20&&h<=70); if(ok) stable++; if(!inBreach && !ok){inBreach=true; breachStart=ts;} if(inBreach && ok){ inBreach=false; if(breachStart!=null) recTimes.push(Math.max(0,Math.round((ts-breachStart)/60000))); breachStart=null; } }
		}
		return { minT,maxT,avgT:cntT?sumT/cntT:null,belowT,aboveT,deviationT:(isFinite(maxT)&&isFinite(minT))?maxT-minT:null,
			avgH:cntH?sumH/cntH:null,outsideH,rapidH,stabilityRatio: total?stable/total:0, avgRecovery: recTimes.length? recTimes.reduce((a,b)=>a+b,0)/recTimes.length: null, records:arr };
	}
	function ensureLine(elId, labels, data, color, label, tickSuffix){
		const el=document.getElementById(elId); if(!el) return;
		const ctx=el.getContext('2d');
		const prev=Chart.getChart(el); if(prev) prev.destroy();
		new Chart(ctx, {
			type: 'line',
			data: {
				labels,
				datasets: [{
					label,
					borderColor: color,
					backgroundColor: color + '22',
					data,
					fill: false,
					tension: 0.3,
					pointRadius: 0
				}]
			},
			options: {
				plugins: { legend: { display: true } },
				scales: {
					x: { grid: { display: false } },
					y: { beginAtZero: true, ticks: { callback: (v)=> tickSuffix ? `${v}${tickSuffix}` : v } }
				},
				responsive: true,
				maintainAspectRatio: false
			}
		});
	}

	function renderAll(){
		const centerSel=document.getElementById('select-center');
		const periodSel=document.getElementById('select-period');
		const center=centerSel? centerSel.value : '__all__';
		const period=periodSel? periodSel.value : 'week';

		const all=load();
		const filtered=filterByCenterAndPeriod(all, center, period);

		// Build equipment stats
		const byEquip=groupByEquipment(filtered);
		const stats=[...byEquip.entries()].map(([eq, rec])=>({ eq, s: computeStats(rec)}));

		// 1) Temperature summary: show deviation (max-min) per equipment
		const tempSorted=[...stats].sort((a,b)=> (b.s.deviationT??-1) - (a.s.deviationT??-1)).slice(0,10);
		ensureBar('chart-temp-summary', tempSorted.map(x=>x.eq), tempSorted.map(x=> +(x.s.deviationT??0).toFixed(1)), { color:'#f97316', tickSuffix:'°C', label:'온도 편차(°C)' });

		// 2) Humidity summary: show rapid changes count per equipment (top10)
		const humSorted=[...stats].sort((a,b)=> (b.s.rapidH??0) - (a.s.rapidH??0)).slice(0,10);
		ensureBar('chart-hum-summary', humSorted.map(x=>x.eq), humSorted.map(x=> x.s.rapidH||0), { color:'#3b82f6', tickSuffix:'회', label:'급격 변동(±5%↑) 횟수' });

		// Efficiency summary removed per request

		// Populate modals
		const tRows=stats.map(({eq,s})=> `<tr><td>${eq}</td><td>${s.maxT?.toFixed?.(1)??'-'}</td><td>${s.minT?.toFixed?.(1)??'-'}</td><td>${s.avgT!=null? s.avgT.toFixed(1):'-'}</td><td>${s.aboveT}/${s.belowT}</td><td>${s.deviationT!=null? s.deviationT.toFixed(1):'-'}</td></tr>`).join('');
		document.getElementById('table-temp-stability').innerHTML = `<thead><tr><th>장비</th><th>최고(°C)</th><th>최저(°C)</th><th>평균(°C)</th><th>초과/미달</th><th>편차(°C)</th></tr></thead><tbody>${tRows}</tbody>`;
		const hRows=stats.map(({eq,s})=> `<tr><td>${eq}</td><td>${s.avgH!=null? s.avgH.toFixed(1):'-'}</td><td>${s.outsideH}</td><td>${s.rapidH}</td></tr>`).join('');
		document.getElementById('table-hum-stability').innerHTML = `<thead><tr><th>장비</th><th>평균 습도(%)</th><th>허용 벗어난 횟수</th><th>급격 변동 횟수</th></tr></thead><tbody>${hRows}</tbody>`;
		const eRows=stats.map(({eq,s})=> `<tr><td>${eq}</td><td>${(s.stabilityRatio*100).toFixed(1)}%</td><td>${s.avgRecovery!=null? s.avgRecovery.toFixed(1)+'분':'-'}</td></tr>`).join('');
		document.getElementById('table-efficiency').innerHTML = `<thead><tr><th>장비</th><th>정상 유지 비율</th><th>평균 복귀 시간</th></tr></thead><tbody>${eRows}</tbody>`;

		// Default trend targets: first equipment if available
		const eqs=stats.map(x=>x.eq).sort();
		const selT=document.getElementById('select-equip-temp'); const selH=document.getElementById('select-equip-hum');
		if(selT) selT.innerHTML = eqs.map(e=>`<option value="${e}">${e}</option>`).join('');
		if(selH) selH.innerHTML = eqs.map(e=>`<option value="${e}">${e}</option>`).join('');
		function trendData(eq, metric){
			const s=stats.find(x=>x.eq===eq)?.s; if(!s) return { labels:[], values:[] };
			const byDay=new Map();
			for(const r of s.records){ const d=r.date.split(' ')[0]; let o=byDay.get(d); if(!o) o={maxT:-Infinity,minT:Infinity,maxH:-Infinity,minH:Infinity}; o.maxT=Math.max(o.maxT,+r.temp); o.minT=Math.min(o.minT,+r.temp); o.maxH=Math.max(o.maxH,+r.hum); o.minH=Math.min(o.minH,+r.hum); byDay.set(d,o); }
			const labels=[...byDay.keys()].sort();
			const values=labels.map(d=>{ const o=byDay.get(d); return metric==='temp'? (o.maxT-o.minT) : (o.maxH-o.minH); });
			return { labels, values };
		}
		if(eqs.length){ const {labels,values}=trendData(eqs[0],'temp'); ensureLine('chart-temp-trend', labels, values, '#f97316', '일별 온도 편차', '°C'); }
		if(eqs.length){ const {labels,values}=trendData(eqs[0],'hum'); ensureLine('chart-hum-trend', labels, values, '#3b82f6', '일별 습도 변동', '%'); }

		// wiring for select changes
		selT?.addEventListener('change', (e)=>{ const {labels,values}=trendData(e.target.value,'temp'); ensureLine('chart-temp-trend', labels, values, '#f97316', '일별 온도 편차', '°C'); });
		selH?.addEventListener('change', (e)=>{ const {labels,values}=trendData(e.target.value,'hum'); ensureLine('chart-hum-trend', labels, values, '#3b82f6', '일별 습도 변동', '%'); });
	}

	// Seed demo data if empty
	(function seed(){
		if(localStorage.getItem(READINGS_KEY)) return;
		const centers=CENTERS; const now=new Date(); const days=30; const data=[];
		function equipmentsFor(center){
			if(center==='퓨처센터(5층)') return Array.from({length:10},(_,i)=>`5F-${i+1}번`);
			if(center==='퓨처센터(6층)') return Array.from({length:10},(_,i)=>`6F-${i+1}번`);
			if(center==='을지트윈타워(15층)') return Array.from({length:10},(_,i)=>`15F-${i+1}번`);
			return Array.from({length:10},(_,i)=>`4F-${i+1}번`);
		}
		centers.forEach(c=>{
			const equips=equipmentsFor(c);
			for(let i=0;i<days;i++){
				const d=new Date(now); d.setDate(now.getDate()-i); d.setHours(10,0,0,0);
				equips.forEach(eq=>{
					const baseT = (eq.startsWith('6F')? 24.0 : 23.0) + (Math.random()*4-2); // around 23-25
					const baseH = 42 + (Math.random()*12-6); // around 36-48
					data.push({ date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:00`, center:c, equipment:eq, temp:+baseT.toFixed(1), hum:+baseH.toFixed(1) });
				});
			}
		});
		localStorage.setItem(READINGS_KEY, JSON.stringify(data));
	})();

	// modal open/close wiring
	function showModal(id){ const m=document.getElementById(id); if(!m) return; m.style.display='flex'; }
	function hideModal(id){ const m=document.getElementById(id); if(!m) return; m.style.display='none'; }
	document.getElementById('btn-open-temp')?.addEventListener('click', ()=> showModal('modal-temp'));
	document.getElementById('btn-open-hum')?.addEventListener('click', ()=> showModal('modal-hum'));
	// Efficiency summary button removed per request
	document.querySelectorAll('[data-close]')?.forEach(btn=> btn.addEventListener('click', ()=> hideModal(btn.getAttribute('data-close'))));

	renderAll();
	document.getElementById('select-center')?.addEventListener('change', renderAll);
	document.getElementById('select-period')?.addEventListener('change', renderAll);
})();
