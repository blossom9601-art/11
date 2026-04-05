// Access Dashboard: Center-wise weekly trend + 1y center-stacked access + IO/purpose/stay stats with filters
(function() {
	const ACCESS_RECORDS_KEY = 'access:records';
	const ACCESS_SYSTEMS_KEY = 'access:systems';
	const ACCESS_CHART_STYLE_KEY = 'access:chart-style';
	let charts = { visitTrend: null, monthlyCenter: null, ioMonthly3: null, ioDonut: null, purpose: null, stay: null };

	function loadRecords() {
		try { return JSON.parse(localStorage.getItem(ACCESS_RECORDS_KEY) || '[]'); } catch(_) { return []; }
	}

	function parseDate(s) {
		if (!s) return null;
		const t = Date.parse(s.replace(' ', 'T'));
		return Number.isNaN(t) ? null : new Date(t);
	}

	function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
	function endOfDay(d) { const x = new Date(d); x.setHours(23,59,59,999); return x; }
	function startOfMonth(d) { const x = new Date(d.getFullYear(), d.getMonth(), 1); x.setHours(0,0,0,0); return x; }
	function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
	function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth()+n); return x; }
	function startOfHour(d) { const x = new Date(d); x.setMinutes(0,0,0); return x; }
	function addHours(d, n) { const x = new Date(d); x.setHours(x.getHours()+n); return x; }

	// Period helpers for filtering
	function getPeriodRange(period) {
		const now = new Date();
		if (period === 'week') return { start: startOfDay(addDays(now, -6)), end: endOfDay(now) };
		if (period === 'month') return { start: startOfDay(addDays(now, -29)), end: endOfDay(now) };
		if (period === 'quarter') return { start: startOfDay(addDays(now, -89)), end: endOfDay(now) };
		if (period === 'year') return { start: startOfDay(addDays(now, -364)), end: endOfDay(now) };
		return { start: startOfDay(now), end: endOfDay(now) };
	}

	function countByMonthLast12(records) {
		const now = new Date();
		const labels = [];
		const values = [];
		let cursor = startOfMonth(addMonths(now, -11));
		for (let i=0;i<12;i++) {
			const monthStart = startOfMonth(addMonths(cursor, i));
			const monthEnd = endOfDay(addMonths(startOfMonth(addMonths(cursor, i+1)), -1));
			const label = `${monthStart.getFullYear()}-${String(monthStart.getMonth()+1).padStart(2,'0')}`;
			labels.push(label);
			values.push(records.filter(r => {
				const di = parseDate(r.date_in);
				return di && di >= monthStart && di <= monthEnd;
			}).length);
		}
		return { labels, values };
	}

	function countByWeekLast8(records) {
		const now = new Date();
		const labels = [];
		const values = [];
		let start = startOfDay(addDays(now, -55));
		for (let i = 0; i < 8; i++) {
			const weekStart = addDays(start, i * 7);
			const weekEnd = addDays(weekStart, 6);
			labels.push(`${String(weekStart.getMonth()+1).padStart(2,'0')}/${String(weekStart.getDate()).padStart(2,'0')}`);
			const cnt = records.filter(r => { const d=parseDate(r.date_in); return d && d>=weekStart && d<=weekEnd; }).length;
			values.push(cnt);
		}
		return { labels, values };
	}

	// Counts by quarter for last 6 quarters (oldest -> newest)
	function countByQuarterLast6(records){
		const now = new Date();
		let y = now.getFullYear();
		let q = Math.floor(now.getMonth()/3)+1; // 1..4
		const qs = [];
		for(let i=0;i<6;i++){ qs.push({y,q}); q--; if(q===0){ q=4; y--; } }
		qs.reverse();
		const labels = []; const values = [];
		qs.forEach(({y,q})=>{
			const start = new Date(y, (q-1)*3, 1); start.setHours(0,0,0,0);
			const end = new Date(y, q*3, 0); end.setHours(23,59,59,999);
			labels.push(`${y} Q${q}`);
			const cnt = (records||[]).filter(r=>{ const d=parseDate(r.date_in); return d && d>=start && d<=end; }).length;
			values.push(cnt);
		});
		return { labels, values };
	}

	// Counts by year for last 5 years (oldest -> newest)
	function countByYearLast5(records){
		const now = new Date(); const curY = now.getFullYear();
		const labels = []; const values = [];
		for(let y=curY-4; y<=curY; y++){
			const start = new Date(y,0,1); start.setHours(0,0,0,0);
			const end = new Date(y,12,0); end.setHours(23,59,59,999);
			labels.push(`${y}`);
			const cnt = (records||[]).filter(r=>{ const d=parseDate(r.date_in); return d && d>=start && d<=end; }).length;
			values.push(cnt);
		}
		return { labels, values };
	}

	// New: Daily counts for last 30 days (inclusive of today)
	function countByDayLast30(records) {
		const now = new Date();
		const start = startOfDay(addDays(now, -29));
		const labels = [];
		const values = [];
		for (let i = 0; i < 30; i++) {
			const day = addDays(start, i);
			labels.push(`${String(day.getMonth()+1).padStart(2,'0')}/${String(day.getDate()).padStart(2,'0')}`);
			const cnt = records.filter(r => {
				const d = parseDate(r.date_in);
				return d && startOfDay(d).getTime() === day.getTime();
			}).length;
			values.push(cnt);
		}
		return { labels, values };
	}

	// New: Daily counts for last 7 days (inclusive of today)
	function countByDayLast7(records) {
		const now = new Date();
		const start = startOfDay(addDays(now, -6));
		const labels = [];
		const values = [];
		for (let i = 0; i < 7; i++) {
			const day = addDays(start, i);
			labels.push(`${String(day.getMonth()+1).padStart(2,'0')}/${String(day.getDate()).padStart(2,'0')}`);
			const cnt = records.filter(r => {
				const d = parseDate(r.date_in);
				return d && startOfDay(d).getTime() === day.getTime();
			}).length;
			values.push(cnt);
		}
		return { labels, values };
	}

	function ensureChart(containerId, labels, values, opts) {
		const container = document.getElementById(containerId);
		if (!container) return null;
		container.innerHTML = '';
		
		// Fallback when Chart.js is not available
		if (typeof Chart === 'undefined') {
			// Support grouped values by summing series per label
			const isGrouped = Array.isArray(values) && Array.isArray(values[0]);
			const totals = isGrouped
				? labels.map((_, idx)=> values.reduce((s, arr)=> s + (arr[idx] || 0), 0))
				: values;
			const max = Math.max(1, ...totals);
			const wrap = document.createElement('div');
			wrap.className = 'chart-bars';
			wrap.style.height = (opts && opts.height ? `${opts.height}px` : '200px');
			labels.forEach((label, i) => {
				const v = totals[i] || 0;
				const div = document.createElement('div');
				div.className = 'bar';
				div.style.height = `${(v / max) * 100}%`;
				div.style.width = `${Math.max(8, Math.floor(100/labels.length)-2)}%`;
				div.setAttribute('data-tip', `${label}: ${v}`);
				wrap.appendChild(div);
			});
			container.appendChild(wrap);
			return null;
		}

		const canvas = document.createElement('canvas');
		canvas.style.width = '100%';
		canvas.style.height = (opts && opts.height ? `${opts.height}px` : '260px');
		container.appendChild(canvas);
		
		const ctx = canvas.getContext('2d');
		
		// Modern gradient creation
		const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
		gradient.addColorStop(0, '#8b5cf6');
		gradient.addColorStop(0.5, '#6366f1');
		gradient.addColorStop(1, '#3b82f6');

		// Support single or grouped series
		const makeBar = (label, data, color) => ({
			label,
			data,
			backgroundColor: color || gradient,
			hoverBackgroundColor: color || '#7c3aed',
			borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 },
			maxBarThickness: 48,
			borderSkipped: false,
			type: 'bar',
			borderWidth: 0,
			barPercentage: 0.9,
			categoryPercentage: 0.7
		});

		let datasets = [];
		if (Array.isArray(values) && Array.isArray(values[0])) {
			// values = [series1, series2, ...]
			const palette = ['#6366f1', '#60a5fa', '#ef4444', '#f59e0b', '#06b6d4', '#10b981'];
			datasets = values.map((arr, i) => {
				const label = (opts?.seriesLabels && opts.seriesLabels[i]) || (i===0 ? (opts?.labelA || '출입') : (opts?.labelB || `시리즈 ${i+1}`));
				return makeBar(label, arr, palette[i % palette.length]);
			});
		} else {
			datasets = [makeBar(opts?.label || '출입', values)];
		}

		if (opts?.lineValues && Array.isArray(opts.lineValues)) {
			datasets.push({
				label: opts.lineLabel || '이동평균',
				data: opts.lineValues,
				borderColor: opts.lineColor || '#10b981',
				backgroundColor: 'transparent',
				borderWidth: 3,
				tension: 0.4,
				pointRadius: 0,
				pointHoverRadius: 6,
				pointHoverBackgroundColor: opts.lineColor || '#10b981',
				pointHoverBorderColor: '#ffffff',
				pointHoverBorderWidth: 2,
				fill: false,
				type: 'line',
				yAxisID: 'y',
				pointStyle: 'circle'
			});
		}

		return new Chart(ctx, {
			data: { labels, datasets },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: {
					duration: 800,
					easing: 'easeOutQuart',
					onProgress: function(animation) {
						const chart = animation.chart;
						const ctx = chart.ctx;
						// subtle glow during animation
						if (animation.currentStep < animation.numSteps) {
							ctx.shadowColor = 'rgba(139, 92, 246, 0.3)';
							ctx.shadowBlur = 10;
						} else {
							ctx.shadowBlur = 0;
						}
					}
				},
				interaction: { intersect: false, mode: 'index' },
				plugins: {
					legend: {
						display: (typeof opts?.showLegend === 'boolean') ? opts.showLegend : ((Array.isArray(values) && Array.isArray(values[0])) || !!opts?.lineValues),
						position: opts?.legendPosition || 'top',
						labels: {
							usePointStyle: true,
							boxWidth: 8,
							boxHeight: 8,
							padding: 20,
							font: { size: 12, weight: '600' },
							// Hide trend (line) datasets from legend
							filter: function(item, data) {
								let ds = undefined;
								if (data && Array.isArray(data.datasets)) {
									ds = data.datasets[item.datasetIndex];
								} else if (data && data.data && Array.isArray(data.data.datasets)) {
									ds = data.data.datasets[item.datasetIndex];
								}
								return (ds?.type) !== 'line';
							}
						},
						position: 'top',
						align: 'start'
					},
					tooltip: {
						backgroundColor: 'rgba(30, 41, 59, 0.95)',
						titleColor: '#ffffff',
						bodyColor: '#e2e8f0',
						borderColor: 'rgba(139, 92, 246, 0.3)',
						borderWidth: 1,
						cornerRadius: 12,
						displayColors: true,
						padding: 16,
						titleFont: { size: 14, weight: '600' },
						bodyFont: { size: 13 },
						callbacks: {
							label: (ctx) => {
								const val = ctx.raw ?? 0;
								const fmt = (n) => new Intl.NumberFormat('ko-KR').format(n);
								return `${ctx.dataset.label}: ${fmt(val)} 건`;
							}
						}
					}
				},
				scales: {
					x: {
						ticks: {
							maxRotation: opts?.rotateX ?? 0,
							minRotation: opts?.rotateX ?? 0,
							autoSkip: true,
							maxTicksLimit: opts?.maxTicks || undefined,
							font: { size: 11, weight: '500' },
							color: '#64748b'
						},
						grid: { display: false, drawBorder: false },
						border: { display: false }
					},
					y: {
						beginAtZero: true,
						grid: { color: 'rgba(226, 232, 240, 0.6)', drawBorder: false, lineWidth: 1 },
						ticks: {
							stepSize: opts?.yTick || undefined,
							precision: 0,
							font: { size: 11, weight: '500' },
							color: '#64748b',
							padding: 8,
							callback: (v)=> new Intl.NumberFormat('ko-KR').format(v)
						},
						suggestedMax: opts?.yMax || undefined,
						border: { display: false }
					}
				}
			}
		});
	}

	// --- Center helpers ---
	function loadSystems(){ try { return JSON.parse(localStorage.getItem(ACCESS_SYSTEMS_KEY)||'[]'); } catch(_) { return []; } }
	function centerFromPlace(place){ if(!place) return ''; const p=String(place).trim(); const i=p.indexOf('('); return i>0? p.slice(0,i).trim() : p; }
	function uniqueCenters(records, systems){ const set=new Set(); (records||[]).forEach(r=>{ const c=centerFromPlace(r.place); if(c) set.add(c); }); (systems||[]).forEach(s=>{ const c=centerFromPlace(s.place); if(c) set.add(c); }); return Array.from(set); }
	function filterRecordsByCenter(records, center){ if(!center || center==='__all__') return records; return (records||[]).filter(r=> centerFromPlace(r.place)===center); }

	function setText(id, val) { 
		const el = document.getElementById(id); 
		if (el) {
			el.textContent = String(val);
			// Add subtle animation
			el.style.transform = 'scale(1.1)';
			setTimeout(() => {
				el.style.transform = 'scale(1)';
			}, 200);
		}
	}

	// --- Aggregations for monthly center stack & IO 3 cats ---
	function countMonthlyCenterStack(records){
		const now = new Date();
		const months=[]; for(let i=11;i>=0;i--){ const d=new Date(now.getFullYear(), now.getMonth()-i, 1); months.push({ key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }); }
		const labels = months.map(m=>m.key);
		const centers = Array.from(new Set((records||[]).map(r=>centerFromPlace(r.place)).filter(Boolean)));
		const series = centers.reduce((acc,c)=>{ acc[c]=Array(12).fill(0); return acc; }, {});
		records.forEach(r=>{ const c=centerFromPlace(r.place); if(!c) return; const di=parseDate(r.date_in); if(!di) return; const key=`${di.getFullYear()}-${String(di.getMonth()+1).padStart(2,'0')}`; const idx=labels.indexOf(key); if(idx>=0) series[c][idx]++; });
		return { labels, centers, series };
	}

	function countMonthlyIOLast12_3(records){
		const now=new Date(); const months=[]; for(let i=11;i>=0;i--){ const d=new Date(now.getFullYear(), now.getMonth()-i, 1); months.push({ key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}); }
		const labels = months.map(m=>m.key);
		const cats=['반입','반출','교체'];
		const data = { '반입':Array(12).fill(0), '반출':Array(12).fill(0), '교체':Array(12).fill(0) };
		records.forEach(r=>{ const di=parseDate(r.date_in); if(!di) return; const key=`${di.getFullYear()}-${String(di.getMonth()+1).padStart(2,'0')}`; const idx=labels.indexOf(key); if(idx<0) return; const t=(r.io_type||'').trim(); if(data[t]) data[t][idx]++; });
		return { labels, cats, data };
	}

	function renderAll(){
		const records = loadRecords();
		const systems = loadSystems();
	const centers = uniqueCenters(records, systems);
	const sel = document.getElementById('select-center');
		const centerVal = sel ? sel.value : '__all__';
		// populate centers once
	if (sel && sel.options.length <= 1) {
			centers.forEach(c=>{ const o=document.createElement('option'); o.value=c; o.textContent=c; sel.appendChild(o); });
		}
		const periodSel = document.getElementById('select-period');
		const period = periodSel ? periodSel.value : 'week';
		const { start: pStart, end: pEnd } = getPeriodRange(period);
		// Chart style selection (persisted)
		const styleSel = document.getElementById('chart-style');
		const chartStyle = styleSel ? (styleSel.value || localStorage.getItem(ACCESS_CHART_STYLE_KEY) || 'stacked') : 'stacked';
		if (styleSel && styleSel.value !== chartStyle) styleSel.value = chartStyle;
		// populate centers once
	if (sel && sel.options.length <= 1) {
			centers.forEach(c=>{ const o=document.createElement('option'); o.value=c; o.textContent=c; sel.appendChild(o); });
		}

		// Hero date & today count
		const now = new Date();
		const todayText = now.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'short' });
		const elDate = document.getElementById('hero-date'); if (elDate) elDate.textContent = todayText;
		const todayStart = startOfDay(now), todayEnd = endOfDay(now);
		const recF = filterRecordsByCenter(records, centerVal).filter(r=>{ const d=parseDate(r.date_in); return d && d>=pStart && d<=pEnd; });
		const todayCount = recF.filter(r=>{ const d=parseDate(r.date_in); return d && d>=todayStart && d<=todayEnd; }).length;
		const elToday = document.getElementById('hero-today-count'); if (elToday) elToday.textContent = String(todayCount);

		// Visit trend: adapt to selected period
		let trend;
		if (period === 'month') {
			trend = countByDayLast30(recF);
		} else if (period === 'quarter') {
			// use all records filtered by center (no pStart/pEnd limit) then bucket to last 6 quarters
			trend = countByQuarterLast6(filterRecordsByCenter(records, centerVal));
		} else if (period === 'year') {
			trend = countByYearLast5(filterRecordsByCenter(records, centerVal));
		} else { // week
			trend = countByDayLast7(recF);
		}
		const seriesVals = trend.values.slice();
		const dMax = Math.max(0, ...seriesVals);
		const dStep = dMax <= 10 ? 2 : dMax <= 30 ? 5 : dMax <= 100 ? 10 : 20;
		if (charts.visitTrend) { charts.visitTrend.destroy?.(); charts.visitTrend=null; }
		const maxTicks = period==='year' ? 5 : period==='quarter' ? 6 : (period==='month'? 15 : 7);
		const rotateX = period==='month' && trend.labels.length>12 ? 0 : 0;
		charts.visitTrend = ensureChart('chart-visit-trend', trend.labels, seriesVals, { height:220, yTick:dStep, maxTicks, rotateX, label:'출입', showLegend:true, legendPosition:'top' });

	// 1y center-stacked monthly access (removed from UI; keep logic only if element exists)
	const centerAgg = countMonthlyCenterStack(filterRecordsByCenter(records, centerVal));
	const canvas1 = document.getElementById('chart-monthly-center');
	if (canvas1) {
			// Destroy previous instance
			if (charts.monthlyCenter && charts.monthlyCenter.destroy) { charts.monthlyCenter.destroy(); charts.monthlyCenter = null; }
			// Fallback without Chart.js: render simple DOM bars into parent
			if (typeof Chart==='undefined') {
				const parent = canvas1.parentElement;
				if (parent) {
					parent.innerHTML='';
					const totals = centerAgg.labels.map((_,i)=> centerAgg.centers.reduce((s,c)=> s+(centerAgg.series[c][i]||0),0));
					const max = Math.max(1, ...totals);
					const wrap = document.createElement('div'); wrap.className='chart-bars'; wrap.style.height='220px';
					centerAgg.labels.forEach((label, i)=>{
						const v = totals[i]||0; const d=document.createElement('div'); d.className='bar'; d.style.height=`${(v/max)*100}%`; d.style.width=`${Math.max(8, Math.floor(100/centerAgg.labels.length)-2)}%`; d.setAttribute('data-tip', `${label}: ${v} 건`); wrap.appendChild(d);
					});
					parent.appendChild(wrap);
				}
			} else {
				// Ensure enough space for rotated ticks and legend
				canvas1.height = 340; // px
				canvas1.style.height = '340px';
				const ctx = canvas1.getContext('2d');
				// Purple/Violet/Indigo cohesive palette (matches modal theme)
				const palette=[
					'#6366f1', // indigo-500
					'#818cf8', // indigo-400
					'#8b5cf6', // violet-500
					'#7c3aed', // violet-600
					'#a78bfa', // violet-400
					'#a855f7', // purple-500
					'#c084fc', // purple-400
					'#e879f9', // fuchsia-400
					'#6d28d9', // violet-700
					'#9333ea', // purple-600
					'#9d4edd'  // deep purple
				];
				const datasets = centerAgg.centers.map(function(c,i){
					return {
						label: c,
						data: centerAgg.series[c].slice(),
						backgroundColor: palette[i % palette.length],
						borderWidth: 0,
						maxBarThickness: 42,
						stack: 'center',
						borderSkipped: false
					};
				});
				// If percent style, normalize each month to 100%
				if (chartStyle === 'percent') {
					for (let i=0;i<centerAgg.labels.length;i++) {
						const total = centerAgg.centers.reduce((s,c)=> s + (centerAgg.series[c][i]||0), 0) || 1;
						datasets.forEach(ds => { ds.data[i] = Number(((ds.data[i]||0) / total * 100).toFixed(2)); });
					}
				}
				// Build per-center trend lines (raw counts or percent to match current mode)
				const lineDatasets = centerAgg.centers.map(function(c,i){
					const raw = centerAgg.series[c].slice();
					let dataLine = raw;
					if (chartStyle === 'percent') {
						dataLine = raw.map((v,idx)=>{
							const total = centerAgg.centers.reduce((s,k)=> s + (centerAgg.series[k][idx]||0), 0) || 1;
							return Number(((v||0) / total * 100).toFixed(2));
						});
					}
					return {
						label: c + ' (추세)',
						data: dataLine,
						type: 'line',
						borderColor: palette[i % palette.length],
						backgroundColor: palette[i % palette.length],
						borderWidth: 2,
						tension: 0.3,
						pointRadius: 3,
						pointHoverRadius: 5,
						fill: false,
						yAxisID: 'y',
						order: 99
					};
				});
				// Round both ends of the stack (keep middle layers square)
				if (datasets.length > 0) {
					const bottom = datasets[0];
					const top = datasets[datasets.length - 1];
					bottom.borderRadius = { topLeft: 0, topRight: 0, bottomLeft: 8, bottomRight: 8 };
					top.borderRadius = { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 };
				}
				charts.monthlyCenter = new Chart(ctx, {
					type: 'bar',
					data: { labels: centerAgg.labels, datasets: datasets.concat(lineDatasets) },
					options: {
						responsive: true,
						maintainAspectRatio: false,
						datasets: { bar: { categoryPercentage: 0.75, barPercentage: 0.9, maxBarThickness: 42 } },
						elements: { bar: { borderRadius: 0, borderSkipped: false } },
						interaction: { intersect: false, mode: 'index' },
						animation: { duration: 700, easing: 'easeOutQuart' },
						plugins: {
							legend: { 
								display: true, 
								position: 'bottom', 
								labels: { 
									usePointStyle: true, 
									boxWidth: 8, 
									boxHeight: 8, 
									padding: 14, 
									font: { size: 12, weight: '600' },
									// Hide trend (line) datasets from legend
									filter: function(item, data) {
										let ds = undefined;
										if (data && Array.isArray(data.datasets)) {
											ds = data.datasets[item.datasetIndex];
										} else if (data && data.data && Array.isArray(data.data.datasets)) {
											ds = data.data.datasets[item.datasetIndex];
										}
										return (ds?.type) !== 'line';
									}
								}
							},
							tooltip: { 
								backgroundColor: 'rgba(30, 41, 59, 0.95)', 
								titleColor: '#fff', 
								bodyColor: '#e2e8f0', 
								borderColor: 'rgba(148, 163, 184, 0.35)', 
								borderWidth: 1, 
								cornerRadius: 10, 
								padding: 12, 
								// Remove trend (line) items from tooltip display
								filter: function(item) { return (item?.dataset?.type) !== 'line'; },
								callbacks: { label: (c)=> `${c.dataset.label}: ${c.raw}${chartStyle==='percent'?'%':' 건'}` } 
							}
						},
						layout: { padding: { bottom: 28, left: 6, right: 6, top: 4 } },
						scales: {
							x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { padding: 6, maxRotation: 30, minRotation: 30, color: '#475569', font: { size: 11, weight: '600' } } },
							y: { stacked: true, beginAtZero: true, suggestedMax: chartStyle==='percent'?100:undefined, grid: { color: 'rgba(226,232,240,.5)', drawBorder: false }, border: { display: false }, ticks: { precision: 0, callback: (v)=> chartStyle==='percent'? `${v}%` : v, color: '#475569', font: { size: 11, weight: '500' } } }
						}
					}
				});
			}
		}

		// 1y IO stacked (반입/반출/교체)
	const io3 = countMonthlyIOLast12_3(filterRecordsByCenter(records, centerVal));
	const canvas2 = document.getElementById('chart-io-monthly-3');
	if (canvas2) {
			if (charts.ioMonthly3 && charts.ioMonthly3.destroy) { charts.ioMonthly3.destroy(); charts.ioMonthly3 = null; }
			if (typeof Chart==='undefined') {
				const parent = canvas2.parentElement;
				if (parent) {
					parent.innerHTML='';
					const totals = io3.labels.map((_,i)=> ['반입','반출','교체'].reduce((s,k)=> s+(io3.data[k][i]||0),0));
					const max = Math.max(1, ...totals);
					const wrap = document.createElement('div'); wrap.className='chart-bars'; wrap.style.height='220px';
					io3.labels.forEach((label,i)=>{ const v=totals[i]||0; const d=document.createElement('div'); d.className='bar'; d.style.height=`${(v/max)*100}%`; d.style.width=`${Math.max(8, Math.floor(100/io3.labels.length)-2)}%`; d.setAttribute('data-tip', `${label}: ${v} 건`); wrap.appendChild(d); });
					parent.appendChild(wrap);
				}
			} else {
				// Ensure enough space for rotated ticks and legend
				canvas2.height = 340; // px
				canvas2.style.height = '340px';
				const ctx = canvas2.getContext('2d');
				// Match categories to purple family for cohesive theme
				const colors={ '반입':'#6366f1', '반출':'#a855f7', '교체':'#e879f9' };
				const datasets = ['반입','반출','교체'].map(function(k){ return { label: k, data: io3.data[k].slice(), backgroundColor: colors[k], borderWidth: 0, maxBarThickness: 40, stack: 'io3', borderRadius: 0, borderSkipped: false }; });
				if (chartStyle === 'percent') {
					for (let i=0;i<io3.labels.length;i++) {
						const total = ['반입','반출','교체'].reduce((s,k)=> s + (io3.data[k][i]||0), 0) || 1;
						datasets.forEach(ds => { ds.data[i] = Number(((ds.data[i]||0) / total * 100).toFixed(2)); });
					}
				}
				// Round both ends of the stack: bottom('반입') and top('교체')
				const bottomIdx = datasets.findIndex(d => d.label==='반입');
				const topIdx = datasets.findIndex(d => d.label==='교체');
				if (bottomIdx >= 0) datasets[bottomIdx].borderRadius = { topLeft: 0, topRight: 0, bottomLeft: 8, bottomRight: 8 };
				if (topIdx >= 0) datasets[topIdx].borderRadius = { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 };
				charts.ioMonthly3 = new Chart(ctx, { 
					type: 'bar', 
					data: { labels: io3.labels, datasets }, 
					options: { 
						responsive: true, 
						maintainAspectRatio: false, 
						datasets: { bar: { categoryPercentage: 0.75, barPercentage: 0.9, maxBarThickness: 40 } },
						elements: { bar: { borderRadius: 0, borderSkipped: false } },
						interaction: { intersect: false, mode: 'index' }, 
						animation: { duration: 700, easing: 'easeOutQuart' },
						plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 14, font: { size: 12, weight: '600' } } }, tooltip: { backgroundColor: 'rgba(30, 41, 59, 0.95)', titleColor: '#fff', bodyColor: '#e2e8f0', borderColor: 'rgba(148, 163, 184, 0.35)', borderWidth: 1, cornerRadius: 10, padding: 12, callbacks: { label: (c)=> `${c.dataset.label}: ${c.raw}${chartStyle==='percent'?'%':' 건'}` } } }, 
						layout: { padding: { bottom: 28, left: 6, right: 6, top: 4 } },
						scales: { x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { padding: 6, maxRotation: 30, minRotation: 30, color: '#475569', font: { size: 11, weight: '600' } } }, y: { stacked: true, beginAtZero: true, suggestedMax: chartStyle==='percent'?100:undefined, grid: { color: 'rgba(226,232,240,.5)', drawBorder: false }, border: { display: false }, ticks: { precision: 0, callback: (v)=> chartStyle==='percent'? `${v}%` : v, color: '#475569', font: { size: 11, weight: '500' } } } } 
					} 
				});
			}
		}

		// IO donut within selected period
		(function renderIODonut(){
			const target = document.getElementById('chart-io-donut');
			if (!target) return;
			const counts = { '반입':0, '반출':0, '교체':0 };
			recF.forEach(r=>{ const t=(r.io_type||'').trim(); if (counts[t] !== undefined) counts[t]++; });
			const labels = Object.keys(counts);
			const values = labels.map(k=>counts[k]);
			if (charts.ioDonut && charts.ioDonut.destroy) { charts.ioDonut.destroy(); charts.ioDonut=null; }
			if (typeof Chart==='undefined') { target.parentElement && (target.parentElement.textContent = labels.map((l,i)=>`${l}:${values[i]}`).join(' ')); return; }
			const ctx = target.getContext('2d');
			charts.ioDonut = new Chart(ctx, { type:'doughnut', data:{ labels, datasets:[{ data: values, backgroundColor:['#60a5fa','#ef4444','#f59e0b'], borderWidth:0 }] }, options:{ plugins:{ legend:{ display:true, position:'bottom' } }, cutout:'55%', responsive:true, maintainAspectRatio:false } });
		})();

		// Purpose stats within selected period (fixed categories: 점검/작업/장애처리/기타)
		(function renderPurpose(){
			const target = document.getElementById('chart-purpose');
			if (!target) return;
			const labels = ['점검','작업','장애처리','기타'];
			const counts = { '점검':0, '작업':0, '장애처리':0, '기타':0 };
			recF.forEach(r=>{
				const raw = (r.purpose||'').trim();
				let cat = '기타';
				if (raw.includes('점검')) cat = '점검';
				else if (raw.includes('작업')) cat = '작업';
				else if (raw.includes('장애')) cat = '장애처리';
				counts[cat]++;
			});
			const values = labels.map(l=>counts[l]||0);
			if (charts.purpose && charts.purpose.destroy) { charts.purpose.destroy(); charts.purpose=null; }
			if (typeof Chart==='undefined') { target.parentElement && (target.parentElement.textContent = labels.map((l,i)=>`${l}:${values[i]}`).join(' ')); return; }
			const ctx = target.getContext('2d');
			charts.purpose = new Chart(ctx, { 
				type:'pie', 
				data:{ 
					labels, 
					datasets:[{ 
						data: values, 
						backgroundColor:[ '#6366f1', '#22c55e', '#f59e0b', '#ef4444' ], 
						borderColor:'#ffffff', 
						borderWidth:2, 
						hoverOffset:8,
						spacing: 2
					}] 
				}, 
				options:{ 
					animation:{ animateRotate:true, animateScale:true, duration:500 },
					layout:{ padding: 4 },
					onHover:(evt, els)=>{ const c = evt?.native?.target; if (c) c.style.cursor = els?.length ? 'pointer' : 'default'; },
					plugins:{ 
						legend:{ display:true, position:'top', labels:{ boxWidth:12, color:'#334155', font:{ size:11, weight:'600' }, usePointStyle:false } }, 
						tooltip:{ callbacks:{ label:(ctx)=>{ const total = ctx.dataset.data.reduce((a,b)=>a+(+b||0),0); const v = +ctx.raw || 0; const pct = total? ((v/total)*100).toFixed(1) : 0; return `${ctx.label}: ${v}건 (${pct}%)`; } } } 
					}, 
					responsive:true, 
					maintainAspectRatio:false 
				} 
			});
		})();

		// Stay time bubble heatmap within selected period
		// X: 기간에 따라 달라짐 — week/month: 일자, quarter: 최근 6분기, year: 최근 5개년
		// Y: 시간대(0~23시), 버블 크기: 해당 기간·시간 슬롯 총 체류시간(분)
		(function renderStay(){
			const target = document.getElementById('chart-stay-time');
			if (!target) return;
			// Ensure enough height for axes and labels
			target.height = 360;
			target.style.height = '360px';

			// Build bucket labels and ranges depending on period
			const bucketLabels = [];
			const bucketRanges = [];
			const now2 = new Date();
			if (period === 'quarter') {
				// Last 6 quarters ending current quarter, oldest -> newest
				let y = now2.getFullYear();
				let q = Math.floor(now2.getMonth() / 3) + 1; // 1..4
				const tmp = [];
				for (let i=0;i<6;i++){
					tmp.push({ y, q });
					q--; if (q===0){ q=4; y--; }
				}
				tmp.reverse();
				tmp.forEach(({y,q})=>{
					const start = new Date(y, (q-1)*3, 1);
					const end = endOfDay(new Date(y, q*3, 0)); // last day of quarter
					bucketLabels.push(`${y} Q${q}`);
					bucketRanges.push({ start, end });
				});
			} else if (period === 'year') {
				// Last 5 years including current, oldest -> newest
				const curY = now2.getFullYear();
				for (let y = curY-4; y<=curY; y++){
					const start = new Date(y, 0, 1);
					const end = endOfDay(new Date(y, 12, 0)); // Dec 31
					bucketLabels.push(`${y}`);
					bucketRanges.push({ start, end });
				}
			} else {
				// Default: day-level buckets between pStart..pEnd
				let dCur = startOfDay(pStart);
				while (dCur <= pEnd) { 
					const d = new Date(dCur);
					bucketLabels.push(`${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`);
					bucketRanges.push({ start: startOfDay(d), end: endOfDay(d) });
					dCur = addDays(dCur, 1); 
				}
			}

			// Determine records for stay chart: apply center filter and our bucket-wide date range
			const stayStart = bucketRanges[0]?.start || pStart;
			const stayEnd = bucketRanges[bucketRanges.length-1]?.end || pEnd;
			const recS = filterRecordsByCenter(records, centerVal).filter(r=>{
				const di = parseDate(r.date_in); const doo = parseDate(r.date_out);
				if (!di || !doo) return false;
				return doo >= stayStart && di <= stayEnd; // overlap
			});

			// Matrix totalMinutes[hour][bucketIdx]
			const matrix = Array.from({length: 24}, ()=> Array(bucketLabels.length).fill(0));
			const bucketIndexFor = (dt)=>{
				for (let i=0;i<bucketRanges.length;i++){
					const r = bucketRanges[i];
					if (dt >= r.start && dt <= r.end) return i;
				}
				return -1;
			};
			recS.forEach(r=>{
				const di = parseDate(r.date_in); const doo = parseDate(r.date_out);
				if (!di || !doo) return;
				let cursor = startOfHour(di);
				const end = new Date(doo);
				while (cursor <= end) {
					const slotStart = new Date(cursor);
					const slotEnd = addHours(slotStart, 1);
					const overlapStart = di > slotStart ? di : slotStart;
					const overlapEnd = doo < slotEnd ? doo : slotEnd;
					const minutes = Math.max(0, Math.round((overlapEnd - overlapStart)/60000));
					if (minutes > 0) {
						const bIdx = bucketIndexFor(slotStart);
						if (bIdx >= 0) {
							const hour = slotStart.getHours();
							matrix[hour][bIdx] += minutes;
						}
					}
					cursor = slotEnd;
				}
			});

			const flat = matrix.flat();
			const maxVal = Math.max(0, ...flat);
			const minR = 3, maxR = 18;
			const toRadius = (m)=> m<=0?0: (minR + (maxVal? (m/maxVal)*(maxR-minR) : 0));
			const colorFor = (m)=>{
				if (m<=0) return 'rgba(2,132,199,0.06)';
				const t = maxVal ? (m / maxVal) : 0;
				const alpha = 0.25 + t * 0.55;
				return `rgba(2,132,199,${alpha})`;
			};
			const data = [];
			const colors = [];
			const bucketIndexMap = Object.fromEntries(bucketLabels.map((d,i)=>[d,i]));
			for (let h=0; h<24; h++) {
				for (let bi=0; bi<bucketLabels.length; bi++) {
					const m = matrix[h][bi];
					if (m<=0) continue;
					data.push({ x: bucketLabels[bi], y: h, r: toRadius(m) });
					colors.push(colorFor(m));
				}
			}
			if (charts.stay && charts.stay.destroy) { charts.stay.destroy(); charts.stay=null; }
			if (typeof Chart==='undefined') {
				target.parentElement && (target.parentElement.textContent = '체류시간 버블 히트맵(기간×시간대)');
				return;
			}
			const ctx = target.getContext('2d');
			charts.stay = new Chart(ctx, { 
				type:'bubble', 
				data:{ datasets:[{ label:'체류시간(분)', data, backgroundColor: colors, borderColor:'#0284c7', borderWidth:1.5, hoverBorderColor:'#0369a1', hoverBorderWidth:2 }] }, 
				options:{ 
					plugins:{ 
						legend:{ display:true, position:'top', labels:{ usePointStyle:true, boxWidth:8, boxHeight:8, padding:12, font:{ size:12, weight:'600' } } }, 
						tooltip:{
							backgroundColor: 'rgba(30, 41, 59, 0.95)',
							titleColor: '#fff',
							bodyColor: '#e2e8f0',
							borderColor: 'rgba(148, 163, 184, 0.35)',
							borderWidth: 1,
							cornerRadius: 10,
							padding: 12,
							callbacks: {
								label: (ctx)=>{
									const label = ctx.raw.x;
									const idx = bucketIndexMap[label];
									const hour = Math.round(ctx.raw.y);
									const minutes = matrix[hour][idx]||0;
									return `${label} · ${hour}시: ${minutes}분`;
								}
							}
						}
					}, 
					scales:{ 
						x:{ type:'category', labels: bucketLabels, offset:true, grid:{ color:'rgba(226,232,240,0.35)', offset:true }, 
							ticks:{ autoSkip:false, color:'#475569', font:{ size:11, weight:'600' } }, border:{ display:false } }, 
						y:{ type:'linear', min:0, max:24, grid:{ color:'rgba(226,232,240,0.5)', borderDash:[4,4] }, 
							ticks:{ stepSize:2, precision:0, callback:(v)=> Number.isInteger(v) && v%2===0 ? `${v}시` : '', color:'#475569', font:{ size:11, weight:'600' } }, reverse:false, border:{ display:false }, grace: '2%' }
					}, 
					responsive:true, maintainAspectRatio:false 
				}
			});
		})();
	}

	function countInOutLast30(records){
		const now = new Date();
		const start = startOfDay(addDays(now, -29));
		const labels = [];
		const inValues = [];
		const outValues = [];
		for (let i=0;i<30;i++) {
			const day = addDays(start, i);
			labels.push(`${String(day.getMonth()+1).padStart(2,'0')}/${String(day.getDate()).padStart(2,'0')}`);
			const arr = records.filter(r => { 
				const d=parseDate(r.date_in); 
				return d && startOfDay(d).getTime() === day.getTime(); 
			});
			inValues.push(arr.filter(r=> (r.io_type||'').trim()==='반입').length);
			outValues.push(arr.filter(r=> (r.io_type||'').trim()==='반출').length);
		}
		return { labels, inValues, outValues };
	}

	function ensureStacked(containerId, labels, inVals, outVals, opts){
		const el = document.getElementById(containerId); 
		if(!el) return;
		el.innerHTML='';
		
		if (typeof Chart==='undefined') {
			// Enhanced fallback with better styling
			const totals = labels.map((_,i)=> (inVals[i]||0)+(outVals[i]||0));
			const wrap = document.createElement('div'); 
			wrap.className='chart-bars'; 
			wrap.style.height=(opts?.height?`${opts.height}px`:'200px');
			const max = Math.max(1, ...totals);
			
			totals.forEach((v,i)=>{
				const d=document.createElement('div'); 
				d.className='bar'; 
				d.style.height=`${(v/max)*100}%`; 
				d.style.width=`${Math.max(8, Math.floor(100/labels.length)-2)}%`; 
				d.setAttribute('data-tip', `${labels[i]}: 반입 ${inVals[i]||0}, 반출 ${outVals[i]||0}`); 
				wrap.appendChild(d); 
			});
			el.appendChild(wrap); 
			return;
		}
		
		const canvas = document.createElement('canvas'); 
		canvas.style.width='100%'; 
		canvas.style.height=(opts?.height?`${opts.height}px`:'200px'); 
		el.appendChild(canvas);
		
		const ctx = canvas.getContext('2d');
		
		// Create modern gradients for stacked bars
		const inGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
		inGradient.addColorStop(0, '#60a5fa');
		inGradient.addColorStop(1, '#3b82f6');
		
		const outGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
		outGradient.addColorStop(0, '#f97316');
		outGradient.addColorStop(1, '#ea580c');
		
		new Chart(ctx, {
			type: 'bar',
			data: {
				labels,
				datasets: [
					{ 
						label:'반입', 
						data: inVals, 
						backgroundColor: inGradient,
						hoverBackgroundColor: '#3b82f6',
						borderRadius: {
							topLeft: 6,
							topRight: 6,
							bottomLeft: 0,
							bottomRight: 0
						},
						maxBarThickness: 45, 
						stack:'io',
						borderWidth: 0
					},
					{ 
						label:'반출', 
						data: outVals, 
						backgroundColor: outGradient,
						hoverBackgroundColor: '#ea580c',
						borderRadius: {
							topLeft: 6,
							topRight: 6,
							bottomLeft: 0,
							bottomRight: 0
						},
						maxBarThickness: 45, 
						stack:'io',
						borderWidth: 0
					}
				]
			},
			options: {
				responsive: true, 
				maintainAspectRatio: false,
				animation: {
					duration: 800,
					easing: 'easeOutQuart'
				},
				interaction: {
					intersect: false,
					mode: 'index'
				},
				plugins: { 
					legend: { 
						display: true,
						position: 'top',
						align: 'start',
						labels: {
							usePointStyle: true,
							boxWidth: 8,
							boxHeight: 8,
							padding: 20,
							font: {
								size: 12,
								weight: '600'
							}
						}
					}, 
					tooltip: { 
						backgroundColor: 'rgba(30, 41, 59, 0.95)',
						titleColor: '#ffffff',
						bodyColor: '#e2e8f0',
						borderColor: 'rgba(139, 92, 246, 0.3)',
						borderWidth: 1,
						cornerRadius: 12,
						padding: 16,
						callbacks: { 
							label: (c)=> `${c.dataset.label}: ${c.raw} 건` 
						} 
					} 
				}, 
				scales: { 
					x: { 
						stacked: true, 
						grid: { display: false },
						border: { display: false },
						ticks: {
							font: { size: 11, weight: '500' },
							color: '#64748b'
						}
					}, 
					y: { 
						stacked: true, 
						beginAtZero: true, 
						grid: { 
							color: 'rgba(226, 232, 240, 0.6)',
							drawBorder: false
						},
						border: { display: false },
						ticks: {
							font: { size: 11, weight: '500' },
							color: '#64748b'
						}
					} 
				} 
			}
		});
	}

	function countDeptLast30(records, topN=8){
		const now=new Date(); 
		const start=startOfDay(addDays(now,-29));
		const map=new Map();
		records.forEach(r=>{ 
			const d=parseDate(r.date_in); 
			if(!d || d<start) return; 
			const dept=(r.company||'').trim(); 
			if(!dept) return; 
			map.set(dept,(map.get(dept)||0)+1); 
		});
		const arr=[...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0, topN);
		return { labels: arr.map(x=>x[0]), values: arr.map(x=>x[1]) };
	}

	function ensureHorizontalBar(containerId, labels, values, opts){
		const el=document.getElementById(containerId); 
		if(!el) return;
		el.innerHTML='';
		
		if (typeof Chart==='undefined'){
			// Enhanced fallback with better styling
			const wrap=document.createElement('div'); 
			wrap.className='chart-bars'; 
			wrap.style.height=(opts?.height?`${opts.height}px`:'200px');
			const max=Math.max(1,...values);
			values.forEach((v,i)=>{ 
				const d=document.createElement('div'); 
				d.className='bar'; 
				d.style.height=`${(v/max)*100}%`; 
				d.style.width=`${Math.max(8, Math.floor(100/labels.length)-2)}%`; 
				d.setAttribute('data-tip', `${labels[i]}: ${v}`); 
				wrap.appendChild(d); 
			});
			el.appendChild(wrap); 
			return;
		}
		
		const canvas=document.createElement('canvas'); 
		canvas.style.width='100%'; 
		canvas.style.height=(opts?.height?`${opts.height}px`:'200px'); 
		el.appendChild(canvas);
		
		const ctx=canvas.getContext('2d');
		
		// Create modern gradient for horizontal bars
		const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
		gradient.addColorStop(0, '#4ade80');
		gradient.addColorStop(1, '#22c55e');
		
		new Chart(ctx, {
			type:'bar',
			data:{ 
				labels, 
				datasets:[{ 
					label:'부서 건수', 
					data: values, 
					backgroundColor: gradient,
					hoverBackgroundColor: '#16a34a',
					borderRadius: {
						topLeft: 0,
						topRight: 6,
						bottomLeft: 0,
						bottomRight: 6
					},
					maxBarThickness: 45,
					borderWidth: 0
				}]
			},
			options:{ 
				indexAxis:'y', 
				responsive:true, 
				maintainAspectRatio:false,
				animation: {
					duration: 800,
					easing: 'easeOutQuart'
				},
				interaction: {
					intersect: false,
					mode: 'index'
				},
				plugins:{ 
					legend:{ 
						display:false 
					}, 
					tooltip:{ 
						backgroundColor: 'rgba(30, 41, 59, 0.95)',
						titleColor: '#ffffff',
						bodyColor: '#e2e8f0',
						borderColor: 'rgba(34, 197, 94, 0.3)',
						borderWidth: 1,
						cornerRadius: 12,
						padding: 16,
						callbacks:{ 
							label:(c)=> `${c.raw} 건` 
						} 
					} 
				}, 
				scales:{ 
					x:{ 
						beginAtZero:true, 
						grid:{ 
							color: 'rgba(226, 232, 240, 0.6)',
							drawBorder: false
						},
						border: { display: false },
						ticks: {
							font: { size: 11, weight: '500' },
							color: '#64748b'
						}
					}, 
					y:{ 
						grid:{ 
							display:false 
						},
						border: { display: false },
						ticks: {
							font: { size: 11, weight: '500' },
							color: '#64748b'
						}
					} 
				} 
			} 
		});
	}

	function movingAverage(values, window) {
		const out = [];
		let sum = 0;
		for (let i = 0; i < values.length; i++) {
			sum += values[i] || 0;
			if (i >= window) sum -= values[i - window] || 0;
			const denom = Math.min(i + 1, window);
			out.push(Number((sum / denom).toFixed(2)));
		}
		return out;
	}

	// Enhanced initialization with smooth animations
	document.addEventListener('DOMContentLoaded', function() {
		// Add loading state
		const cards = document.querySelectorAll('.card');
		cards.forEach(card => { card.style.opacity='0'; card.style.transform='translateY(20px)'; });

		// Wire controls
	const sel = document.getElementById('select-center'); if (sel) sel.addEventListener('change', renderAll);
		const periodSel = document.getElementById('select-period'); if (periodSel) periodSel.addEventListener('change', renderAll);
		const btn = document.getElementById('hero-refresh'); if (btn) btn.addEventListener('click', renderAll);

		// Register modal events
		const openReg = document.getElementById('open-register');
		const modal = document.getElementById('access-register-modal');
		const closeReg = document.getElementById('access-register-close');
		const saveReg = document.getElementById('access-register-save');
		if (openReg && modal) openReg.addEventListener('click', ()=>{ modal.style.display='block'; });
		if (closeReg && modal) closeReg.addEventListener('click', ()=>{ modal.style.display='none'; });
		if (saveReg) saveReg.addEventListener('click', ()=>{
			try{
				const rec = {
					date_in: document.getElementById('reg-date-in')?.value || '',
					company: document.getElementById('reg-company')?.value || '',
					person_name: document.getElementById('reg-person')?.value || '',
					purpose: document.getElementById('reg-purpose')?.value || '',
					place: document.getElementById('reg-place')?.value || '',
					io_type: document.getElementById('reg-io')?.value || ''
				};
				const arr = loadRecords(); arr.push(rec); localStorage.setItem(ACCESS_RECORDS_KEY, JSON.stringify(arr));
				if (modal) modal.style.display='none';
				renderAll();
			} catch(_){}
		});
		const styleSel = document.getElementById('chart-style');
		if (styleSel) {
			const saved = localStorage.getItem(ACCESS_CHART_STYLE_KEY) || 'stacked';
			styleSel.value = saved;
			styleSel.addEventListener('change', function(){
				localStorage.setItem(ACCESS_CHART_STYLE_KEY, styleSel.value);
				renderAll();
			});
		}

		// Animate cards in sequence
		setTimeout(() => { cards.forEach((card, i) => { setTimeout(()=>{ card.style.transition='all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'; card.style.opacity='1'; card.style.transform='translateY(0)'; }, i*100); }); }, 300);

		// Initial render
		renderAll();
	});
})();
