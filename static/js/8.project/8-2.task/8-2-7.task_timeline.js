// Task Timeline — data, render, controls, ticker settings
(() => {
	// Skip on Task Timeline page to avoid double-binding with the scoped implementation below
	if (document.querySelector('.task-timeline-page')) return;
	// Utilities
	const $ = (sel, root = document) => root.querySelector(sel);
	const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
	const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

	// Constants
	const DEPTS = [
		'Ops( Operations: 운영 )',
		'Net( Network: 네트워크 )',
		'Sec( Security: 보안 )',
		'DB( DataBase: 데이터베이스 )'
	];
	const PEOPLE = ['김민수','이서연','박지훈','최윤아','정우진','한소희','오지원','신도현'];
	const TITLES = [
		'Wazuh( Wazuh: 와주 ) 에이전트 배포 (Deployment: 배포)',
		'VM( Virtual Machine: 가상 머신 ) 마이그레이션',
		'XCP-ng( Xen Cloud Platform-next generation ) 업그레이드',
		'LUKS( Linux Unified Key Setup: 리눅스 통합 키 설정 ) 키 교체',
		'로그 파이프라인 튜닝 (ETL: Extract-Transform-Load)',
		'Rack( Equipment Rack: 장비 랙 ) 레이아웃 업데이트',
		'FW( Firmware: 펌웨어 ) 업데이트',
		'DB( Database: 데이터베이스 ) 인덱스 재구성',
		'WAS( Web Application Server ) 자원 튜닝',
	];

	// Random helpers for sample data
	function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
	function pick(arr) { return arr[rand(0, arr.length - 1)]; }

	// Generate N sample tasks within +/- 12h from now
	function makeData(n = 28) {
		const now = Date.now();
		const hour = 3600 * 1000;
		const out = [];
		for (let i = 0; i < n; i++) {
			const startOffset = rand(-8, 10) * hour;
			const dur = rand(1, 8) * hour; // 1~8h
			const start = now + startOffset;
			const end = start + dur;
			const status = start > now ? 'pending' : (end < now ? 'done' : 'progress');
			out.push({
				id: 't' + i,
				dept: pick(DEPTS),
				title: pick(TITLES),
				owner: pick(PEOPLE),
				start, end, status
			});
		}
		return out.sort((a, b) => a.start - b.start);
	}

	// State
	let TASKS = makeData();
	let selectedDepts = new Set(DEPTS); // default all selected
	let tickerMessages = [
		{ level: 'crit', text: '전원 테스트 — 중요 데이터 저장 중단 권고' },
		{ level: 'imp',  text: '중요 보안 패치(CVE) 긴급 적용 대상 확인' },
		{ level: 'info', text: 'NOW Now: 지금 시간 기준 타임라인 갱신 중' },
	];
	let tickerSpeed = 40; // seconds; lower is faster
	let tickerPaused = false;

	// DOM refs
	const track = $('#track');
	const rowsEl = $('#rows');
	const timeScaleEl = $('#timeScale');
	const timelineContent = $('#timelineContent');
		const nowText = $('#nowText');
	const kpiPending = $('#kpiPending');
	const kpiProgress = $('#kpiProgress');
	const kpiDone = $('#kpiDone');
	const tooltip = $('#tooltip');

	// Dept dropdown
	const dropdown = $('#deptDropdown');
	const btnDept = $('#btnDept');
	const deptCount = $('#deptCount');
	const btnSelectAll = $('#selectAll');
	const btnClearAll = $('#clearAll');

	// Controls
	const btnRefreshData = $('#btnRefreshData');

	// Modal controls
	const modal = $('#tickerModal');
	const modalBg = $('#modalBg');
	const openTickerSettings = $('#openTickerSettings');
	const toggleDarkModeBtn = $('#toggleDarkMode');
	const toggleHeaderBtn = $('#toggleHeader');
	const closeModal = $('#closeModal');
	const speedRange = $('#speedRange');
	const speedVal = $('#speedVal');
	const pauseTicker = $('#pauseTicker');
	const msgInput = $('#msgInput');
	const msgLevel = $('#msgLevel');
	const addMsg = $('#addMsg');
	const msgTable = $('#msgTable');
	const exportBtn = $('#exportBtn');
	const importBtn = $('#importBtn');
	const importFile = $('#importFile');

	// Layout constants
	const HOURS = 24;
	const PX_PER_HOUR = 100; // match CSS --pxh
	const ROW_HEIGHT = 56;

	// Render time scale (fixed 24hr centered at now)
	function renderScale() {
		const now = new Date();
		const base = new Date(now);
		base.setMinutes(0, 0, 0);
		// Set scale so that 12 hours before now is at x=0 and 12 hours after is at x=width
		timeScaleEl.innerHTML = '';
		for (let h = -12; h <= 12; h++) {
			const t = new Date(now.getTime() + h * 3600 * 1000);
			const label = t.getHours().toString().padStart(2, '0') + ':00';
			const x = (h + 12) * PX_PER_HOUR;
			const mark = document.createElement('div');
			mark.className = 'mark';
			mark.style.left = x + 'px';
			mark.textContent = label;
			timeScaleEl.appendChild(mark);
		}
	}

	// Filtered tasks by selectedDepts
	function getFiltered() {
		return TASKS.filter(t => selectedDepts.has(t.dept));
	}

	// Group by dept
	function groupByDept(tasks) {
		const map = new Map();
		for (const d of DEPTS) map.set(d, []);
		for (const t of tasks) map.get(t.dept)?.push(t);
		return Array.from(map.entries()).filter(([_, arr]) => arr.length > 0);
	}

	// Compute x/width from start/end relative to now-centered window [now-12h, now+12h]
	function toXWidth(start, end) {
		const now = Date.now();
		const windowStart = now - 12 * 3600 * 1000;
		const windowEnd = now + 12 * 3600 * 1000;
		const total = windowEnd - windowStart;
		const widthPx = HOURS * PX_PER_HOUR;

		const clampedStart = clamp(start, windowStart, windowEnd);
		const clampedEnd = clamp(end, windowStart, windowEnd);
		const x = ((clampedStart - windowStart) / total) * widthPx;
		const w = Math.max(4, ((clampedEnd - clampedStart) / total) * widthPx);
		return [x, w];
	}

	// Tooltip helpers
	function showTip(html, x, y) {
		tooltip.innerHTML = html;
		tooltip.style.display = 'block';
		const pad = 10;
		const rect = tooltip.getBoundingClientRect();
		const left = Math.min(window.innerWidth - rect.width - pad, x + pad);
		const top = Math.min(window.innerHeight - rect.height - pad, y + pad);
		tooltip.style.left = left + 'px';
		tooltip.style.top = top + 'px';
	}
	function hideTip() { tooltip.style.display = 'none'; }

	// Render rows and bars
	function renderRows() {
		const grouped = groupByDept(getFiltered());
		rowsEl.innerHTML = '';
		grouped.forEach(([dept, items], rowIdx) => {
			const row = document.createElement('div');
			row.className = 'row';
			row.style.top = rowIdx * ROW_HEIGHT + 'px';

			const label = document.createElement('div');
			label.className = 'label';
			label.textContent = dept;
			row.appendChild(label);

			const bars = document.createElement('div');
			bars.className = 'bars';
			for (const t of items) {
				const [x, w] = toXWidth(t.start, t.end);
				const bar = document.createElement('div');
				bar.className = `bar ${t.status}`;
				bar.style.left = x + 'px';
				bar.style.width = w + 'px';
				bar.innerHTML = `<span>${t.title}</span>`;
				bar.dataset.id = t.id;
				bar.addEventListener('mousemove', (e) => {
					const st = new Date(t.start).toLocaleString();
					const et = new Date(t.end).toLocaleString();
					showTip(`<div style="font-weight:800;margin-bottom:4px;">${t.title}</div>
									 <div>부서: ${t.dept}</div>
									 <div>담당: ${t.owner}</div>
									 <div>상태: ${t.status}</div>
									 <div>시작: ${st}</div>
									 <div>종료: ${et}</div>`, e.clientX, e.clientY);
				});
				bar.addEventListener('mouseleave', hideTip);
				bars.appendChild(bar);
			}
			row.appendChild(bars);
			rowsEl.appendChild(row);
		});

		// Set container height to rows
		const totalRows = grouped.length;
		rowsEl.style.height = totalRows * ROW_HEIGHT + 'px';
	}

	// KPIs
	function renderKPI() {
		const f = getFiltered();
		kpiPending.textContent = f.filter(t => t.status === 'pending').length;
		kpiProgress.textContent = f.filter(t => t.status === 'progress').length;
		kpiDone.textContent = f.filter(t => t.status === 'done').length;
	}

	// Now text refresh
		function renderNow() {
			if (!nowText) return; // 페이지 상단 현재시간 UI가 제거된 경우 안전하게 무시
			const d = new Date();
			const s = d.toLocaleString('ko-KR', { hour12: false });
			nowText.textContent = `NOW Now: 지금 · ${s}`;
		}

	// Populate time scale once per render
	function renderScaleAndWidth() {
		// Ensure timeline content width matches 24h
		timelineContent.style.setProperty('--hours', HOURS);
		timelineContent.style.setProperty('--pxh', PX_PER_HOUR + 'px');
		renderScale();
	}

	// Full render
	function renderAll() {
		updateStatuses();
		renderScaleAndWidth();
		renderRows();
		renderKPI();
		renderNow();
	}

	// Update statuses relative to current time
	function updateStatuses() {
		const now = Date.now();
		for (const t of TASKS) {
			t.status = t.start > now ? 'pending' : (t.end < now ? 'done' : 'progress');
		}
	}

	// Dept dropdown logic
	function updateDeptCount() {
		deptCount.textContent = `${selectedDepts.size}개`;
	}
	function bindDeptCheckboxes() {
		$$('.dropdown-menu input[type="checkbox"]', dropdown).forEach(cb => {
			cb.checked = selectedDepts.has(cb.dataset.dept);
			cb.addEventListener('change', () => {
				if (cb.checked) selectedDepts.add(cb.dataset.dept);
				else selectedDepts.delete(cb.dataset.dept);
				updateDeptCount();
				renderAll();
			});
		});
	}

	btnDept?.addEventListener('click', () => {
		dropdown.classList.toggle('open');
	});
	document.addEventListener('click', (e) => {
		if (!dropdown.contains(e.target)) dropdown.classList.remove('open');
	});
	btnSelectAll?.addEventListener('click', () => {
		selectedDepts = new Set(DEPTS);
		bindDeptCheckboxes();
		updateDeptCount();
		renderAll();
	});
	btnClearAll?.addEventListener('click', () => {
		selectedDepts.clear();
		bindDeptCheckboxes();
		updateDeptCount();
		renderAll();
	});

	// Refresh sample data
	btnRefreshData?.addEventListener('click', () => {
		TASKS = makeData();
		renderAll();
	});

	// Position NOW tag horizontally center
	function placeNowTag() {
		const tag = $('#nowTag');
		if (!tag) return;
		// Already CSS centers using left:50%; translateX(-50%)
		tag.title = new Date().toLocaleString();
	}

	// Ticker rendering and controls
	function renderTicker() {
		if (!track) return;
		track.innerHTML = '';
		track.style.setProperty('--ticker-speed', `${tickerSpeed}s`);
		track.classList.toggle('paused', tickerPaused);
		// Duplicate sequence x2 for seamless loop
		const seq = [...tickerMessages, ...tickerMessages];
		for (const m of seq) {
			const div = document.createElement('div');
			div.className = `msg ${m.level}`;
			const pill = document.createElement('span');
			pill.className = 'tag';
			pill.textContent = m.level.toUpperCase();
			div.appendChild(pill);
			const text = document.createElement('span');
			text.textContent = m.text;
			div.appendChild(text);
			track.appendChild(div);
		}
	}

	// Modal open/close
	function openModal() {
		modal.classList.add('show');
		modalBg.classList.add('show');
		// init values
		speedRange.value = tickerSpeed;
		speedVal.textContent = tickerSpeed;
		pauseTicker.checked = tickerPaused;
		renderMsgTable();
	}
	function closeModalFn() {
		modal.classList.remove('show');
		modalBg.classList.remove('show');
	}
	openTickerSettings?.addEventListener('click', openModal);
	closeModal?.addEventListener('click', closeModalFn);
	modalBg?.addEventListener('click', closeModalFn);

	// Header hide/show + persist
	function applyHeaderVisibility(hidden){
		const header = document.querySelector('header.main-header');
		if(!header) return;
		header.classList.toggle('tt-hidden', hidden);
		toggleHeaderBtn?.classList.toggle('active', hidden);
		const title = hidden ? '헤더 보이기' : '헤더 숨기기';
		toggleHeaderBtn?.setAttribute('title', title);
		toggleHeaderBtn?.setAttribute('aria-label', title);
	}
	const HEADER_KEY='tt.headerHidden';
	toggleHeaderBtn?.addEventListener('click', ()=>{
		const hidden = localStorage.getItem(HEADER_KEY)==='1';
		const next = !hidden;
		localStorage.setItem(HEADER_KEY, next?'1':'0');
		applyHeaderVisibility(next);
	});

	// Dark mode toggle (scoped via class on body)
	toggleDarkModeBtn?.addEventListener('click', ()=>{
		document.body.classList.toggle('dark');
	});

	// Modal controls
	speedRange?.addEventListener('input', () => {
		tickerSpeed = Number(speedRange.value);
		speedVal.textContent = tickerSpeed;
		renderTicker();
	});
	pauseTicker?.addEventListener('change', () => {
		tickerPaused = pauseTicker.checked;
		renderTicker();
	});

	addMsg?.addEventListener('click', () => {
		const text = (msgInput.value || '').trim();
		if (!text) return;
		const level = msgLevel.value || 'info';
		tickerMessages.push({ level, text });
		msgInput.value = '';
		renderMsgTable();
		renderTicker();
	});

	function renderMsgTable() {
		msgTable.innerHTML = '';
		tickerMessages.forEach((m, i) => {
			const tr = document.createElement('tr');
			tr.innerHTML = `<td>${m.level.toUpperCase()}</td>
											<td>${m.text}</td>
											<td>
												<button class="button" data-act="up" data-i="${i}">위</button>
												<button class="button" data-act="down" data-i="${i}">아래</button>
												<button class="button" data-act="del" data-i="${i}">삭제</button>
											</td>`;
			msgTable.appendChild(tr);
		});
		// Wire operations
		$$('button[data-act]', msgTable).forEach(btn => {
			const i = Number(btn.dataset.i);
			const act = btn.dataset.act;
			btn.addEventListener('click', () => {
				if (act === 'del') tickerMessages.splice(i, 1);
				else if (act === 'up' && i > 0) [tickerMessages[i-1], tickerMessages[i]] = [tickerMessages[i], tickerMessages[i-1]];
				else if (act === 'down' && i < tickerMessages.length - 1) [tickerMessages[i+1], tickerMessages[i]] = [tickerMessages[i], tickerMessages[i+1]];
				renderMsgTable();
				renderTicker();
			});
		});
	}

	// Export/Import
	exportBtn?.addEventListener('click', () => {
		const data = { tickerMessages, tickerSpeed, tickerPaused };
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url; a.download = 'ticker_settings.json'; a.click();
		URL.revokeObjectURL(url);
	});
	importBtn?.addEventListener('click', () => importFile.click());
	importFile?.addEventListener('change', async () => {
		const f = importFile.files?.[0];
		if (!f) return;
		const txt = await f.text();
		try {
			const obj = JSON.parse(txt);
			if (Array.isArray(obj.tickerMessages)) tickerMessages = obj.tickerMessages;
			if (typeof obj.tickerSpeed === 'number') tickerSpeed = obj.tickerSpeed;
			if (typeof obj.tickerPaused === 'boolean') tickerPaused = obj.tickerPaused;
			renderMsgTable();
			renderTicker();
		} catch { /* ignore */ }
	});

	// Auto refresh
	setInterval(() => {
		renderAll();
		placeNowTag();
	}, 5000);

	// Initial wiring
	function init() {
		// Ensure all dept checkboxes exist and checked
		bindDeptCheckboxes();
		updateDeptCount();
		renderTicker();
		renderAll();
		placeNowTag();
	}
	document.addEventListener('DOMContentLoaded', init);
})();
// Task Timeline (8-2-7) — all page logic lives here
(function(){
	const scope = document.querySelector('.task-timeline-page');
	if(!scope) return; // only run on this page

	// Shortcuts scoped to page
	const $ = (sel, root = scope) => root.querySelector(sel);
	const $$ = (sel, root = scope) => Array.from(root.querySelectorAll(sel));
	const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));

	// Data constants (부서-직원)
	const DEPTS = ['IT인프라운영1팀','IT인프라운영2팀','IT기획팀','IT상황실운영팀','정보보안팀'];
	const STAFF_BY_DEPT = {
		'IT인프라운영1팀': ['김민수','이서연','박지훈'],
		'IT인프라운영2팀': ['최윤아','정우진'],
		'IT기획팀': ['한소희','오지원'],
		'IT상황실운영팀': ['신도현','김유진'],
		'정보보안팀': ['박서준','이다은']
	};
	const TITLES = [
		'Wazuh 에이전트 배포',
		'VM 마이그레이션',
		'XCP-ng 업그레이드',
		'LUKS 키 교체',
		'로그 파이프라인 튜닝',
		'Rack 레이아웃 업데이트',
		'Firmware 업데이트',
		'DB 인덱스 재구성',
		'WAS 자원 튜닝'
	];

	// Sample data
	const HOUR = 3600*1000;
	const rand = (a,b)=>Math.floor(Math.random()*(b-a+1))+a;
	const pick = arr => arr[rand(0,arr.length-1)];
	function makeData(n=28){
		const now = Date.now();
		const arr = [];
		for(let i=0;i<n;i++){
			const start = now + rand(-8,10)*HOUR;
			const end = start + rand(1,8)*HOUR;
			const status = start>now?'pending':(end<now?'done':'progress');
			const dept = pick(DEPTS);
			const staff = STAFF_BY_DEPT[dept] || [];
			const owner = staff.length ? pick(staff) : '담당자미정';
			arr.push({ id:'t'+i, dept, title:pick(TITLES), owner, start, end, status });
		}
		return arr.sort((a,b)=>a.start-b.start);
	}

	// State
	let TASKS = makeData();
	let selectedDepts = new Set(DEPTS);
	let tickerMessages = [
		{ level:'crit', text:'전원 테스트 — 중요 데이터 저장 중단 권고' },
		{ level:'imp', text:'중요 보안 패치(CVE) 긴급 적용 대상 확인' },
		{ level:'info', text:'NOW Now: 지금 기준 타임라인 갱신 중' }
	];
	let tickerSpeed = 40;
	let tickerPaused = false;

	// Elements
	const track = $('#track');
	const rowsEl = $('#rows');
	const timeScaleEl = $('#timeScale');
	const timelineContent = $('#timelineContent');
	const nowText = $('#nowText');
	const kpiPending = $('#kpiPending');
	const kpiProgress = $('#kpiProgress');
	const kpiDone = $('#kpiDone');
	const tooltip = $('#tooltip');

	const dropdown = $('#deptDropdown');
	const btnDept = $('#btnDept');
	const deptCount = $('#deptCount');
	const btnSelectAll = $('#selectAll');
	const btnClearAll = $('#clearAll');
	const btnRefreshData = $('#btnRefreshData');

	const modal = $('#tickerModal');
	const modalBg = $('#modalBg');
	const openTickerSettings = $('#openTickerSettings');
	// Top-right quick actions
	const toggleDarkModeBtn = $('#toggleDarkMode');
	const toggleHeaderBtn = $('#toggleHeader');
	const closeModal = $('#closeModal');
	const speedRange = $('#speedRange');
	const speedVal = $('#speedVal');
	const pauseTicker = $('#pauseTicker');
	const msgInput = $('#msgInput');
	const msgLevel = $('#msgLevel');
	const addMsg = $('#addMsg');
	const msgTable = $('#msgTable');
	const exportBtn = $('#exportBtn');
	const importBtn = $('#importBtn');
	const importFile = $('#importFile');

	// Layout constants
	const HOURS = 24; const PXH = 100; const ROW_H = 56;

	// Fixed base window (rebased hourly) to enable smooth leftward motion
	const alignHour = (ts)=>{ const d=new Date(ts); d.setMinutes(0,0,0); return d.getTime(); };
	let BASE_START = alignHour(Date.now()) - 12*HOUR; // left edge of the 24h content

	// Helpers
	function updateStatuses(){
		const now = Date.now();
		TASKS.forEach(t=>{ t.status = t.start>now?'pending':(t.end<now?'done':'progress'); });
	}
	function getFiltered(){ return TASKS.filter(t=>selectedDepts.has(t.dept)); }
	// 직원별 행 렌더링을 위해 owner로 그룹핑. 필터는 부서 기준 유지.
	function groupByOwner(list){
		const map = new Map();
		list.forEach(t=>{
			if(!map.has(t.owner)) map.set(t.owner, []);
			map.get(t.owner).push(t);
		});
		return Array.from(map.entries()).sort((a,b)=> a[0].localeCompare(b[0]));
	}
	function toXW(start,end){
		const ws = BASE_START; const we = BASE_START + 24*HOUR; const total = we-ws;
		const widthPx = HOURS*PXH;
		const cs = clamp(start, ws, we), ce = clamp(end, ws, we);
		const x = ((cs-ws)/total)*widthPx;
		const w = Math.max(4, ((ce-cs)/total)*widthPx);
		return [x,w];
	}

	// Render
	function renderScale(){
		timeScaleEl.innerHTML='';
		for(let i=0; i<=24; i++){
			const t = new Date(BASE_START + i*HOUR);
			const label = String(t.getHours()).padStart(2,'0')+':00';
			const x = i*PXH;
			const el = document.createElement('div');
			el.className='mark'; el.style.left=x+'px'; el.textContent=label;
			timeScaleEl.appendChild(el);
		}
	}
	function renderRows(){
		const grouped = groupByOwner(getFiltered());
		rowsEl.innerHTML='';
		grouped.forEach(([owner,items], i)=>{
			const row = document.createElement('div');
			row.className='row'; row.style.top = (i*ROW_H)+'px';
			const label = document.createElement('div');
			label.className='label'; label.textContent = owner; row.appendChild(label);
			const bars = document.createElement('div'); bars.className='bars';
			for(const t of items){
				const [x,w]=toXW(t.start,t.end);
				const bar=document.createElement('div');
				bar.className='bar '+t.status; bar.style.left=x+'px'; bar.style.width=w+'px';
				bar.textContent=t.title; bar.title=`${t.dept}`;
				bar.addEventListener('mousemove', (e)=>{
					const st=new Date(t.start).toLocaleString(); const et=new Date(t.end).toLocaleString();
					showTip(`<b>${t.title}</b><br>부서: ${t.dept}<br>담당: ${t.owner}<br>상태: ${t.status}<br>시작: ${st}<br>종료: ${et}`, e.clientX, e.clientY);
				});
				bar.addEventListener('mouseleave', hideTip);
				bars.appendChild(bar);
			}
			row.appendChild(bars); rowsEl.appendChild(row);
		});
		rowsEl.style.height = (grouped.length*ROW_H)+'px';
	}
	function renderKPI(){
		const f=getFiltered();
		kpiPending.textContent = f.filter(t=>t.status==='pending').length;
		kpiProgress.textContent = f.filter(t=>t.status==='progress').length;
		kpiDone.textContent = f.filter(t=>t.status==='done').length;
	}
	function renderNow(){
		// 현재시간 상단 텍스트가 없는 페이지도 있으므로 안전 가드
		if(!nowText) return;
		nowText.textContent = 'NOW Now: 지금 · '+ new Date().toLocaleString('ko-KR',{hour12:false});
	}

	// Center "NOW" tag shows live time HH:MM:SS
	function updateNowTag(){
		const tag = $('#nowTag');
		if(!tag) return;
		const d = new Date();
		const hh = String(d.getHours()).padStart(2,'0');
		const mm = String(d.getMinutes()).padStart(2,'0');
		const ss = String(d.getSeconds()).padStart(2,'0');
		tag.textContent = `NOW (Now: 지금 · ${hh}:${mm}:${ss})`;
		tag.title = d.toLocaleString('ko-KR', { hour12:false });
	}
	function renderTicker(){
		if(!track) return;
		track.innerHTML='';
		track.style.setProperty('--ticker-speed', `${tickerSpeed}s`);
		track.classList.toggle('paused', tickerPaused);
		const seq=[...tickerMessages, ...tickerMessages];
		seq.forEach(m=>{
			const el=document.createElement('div'); el.className='msg '+m.level;
			const tag=document.createElement('span'); tag.className='tag'; tag.textContent=m.level.toUpperCase();
			const tx=document.createElement('span'); tx.textContent=m.text;
			el.append(tag, tx); track.appendChild(el);
		});
	}
	function renderAll(){
		updateStatuses();
		timelineContent.style.setProperty('--hours', HOURS);
		timelineContent.style.setProperty('--pxh', PXH+'px');
		renderScale();
		renderRows();
		renderKPI();
		renderNow();
		updateNowTag();
		updatePan();
	}

	// Header hide/show + persist (scoped)
	function applyHeaderVisibility(hidden){
		const header = document.querySelector('header.main-header');
		if(!header) return;
		header.classList.toggle('tt-hidden', hidden);
		// reflect state on button
		if (toggleHeaderBtn){
			toggleHeaderBtn.classList.toggle('active', hidden);
			const title = hidden ? '헤더 보이기' : '헤더 숨기기';
			toggleHeaderBtn.setAttribute('title', title);
			toggleHeaderBtn.setAttribute('aria-label', title);
		}
	}

	// Move content left so NOW stays centered
	function updatePan(){
		const widthPx = HOURS*PXH;
		const total = 24*HOUR;
		const now = Date.now();
		const nowX = ((now - BASE_START)/total) * widthPx;
		const viewport = $('#viewport');
		if(!viewport) return;
		const vw = viewport.clientWidth;
		const offset = (vw/2) - nowX;
		timelineContent.style.transform = `translateX(${offset}px)`;
	}

	function rebaseIfNeeded(){
		// If the current hour changes, slide the base to keep labels in sync
		const centerHour = alignHour(Date.now());
		const baseCenterHour = alignHour(BASE_START + 12*HOUR);
		if(centerHour !== baseCenterHour){
			BASE_START = centerHour - 12*HOUR;
			renderScale();
			renderRows();
			updatePan();
		}
	}

	// Tooltip
	function showTip(html,x,y){
		tooltip.innerHTML=html; tooltip.style.display='block';
		const r=tooltip.getBoundingClientRect(); const pad=10;
		const left=Math.min(window.innerWidth-r.width-pad, x+pad);
		const top=Math.min(window.innerHeight-r.height-pad, y+pad);
		tooltip.style.left=left+'px'; tooltip.style.top=top+'px';
	}
	function hideTip(){ tooltip.style.display='none'; }

	// Dropdown
	function bindDeptCheckboxes(){
		$$('.dropdown-menu input[type="checkbox"]').forEach(cb=>{
			cb.checked = selectedDepts.has(cb.dataset.dept);
			cb.addEventListener('change', ()=>{
				if(cb.checked) selectedDepts.add(cb.dataset.dept); else selectedDepts.delete(cb.dataset.dept);
				updateDeptCount(); renderAll();
			});
		});
	}
	function updateDeptCount(){ deptCount.textContent = `${selectedDepts.size}개`; }
	btnDept?.addEventListener('click', ()=> dropdown.classList.toggle('open'));
	document.addEventListener('click', (e)=>{ if(!dropdown.contains(e.target)) dropdown.classList.remove('open'); });
	btnSelectAll?.addEventListener('click', ()=>{ selectedDepts=new Set(DEPTS); bindDeptCheckboxes(); updateDeptCount(); renderAll(); });
	btnClearAll?.addEventListener('click', ()=>{ selectedDepts.clear(); bindDeptCheckboxes(); updateDeptCount(); renderAll(); });

	// Data refresh
	btnRefreshData?.addEventListener('click', ()=>{ TASKS = makeData(); renderAll(); });

	// Modal
	function openModal(){ modal.classList.add('show'); modalBg.classList.add('show'); speedRange.value=tickerSpeed; speedVal.textContent=tickerSpeed; pauseTicker.checked=tickerPaused; renderMsgTable(); }
	function closeModalFn(){ modal.classList.remove('show'); modalBg.classList.remove('show'); }
	openTickerSettings?.addEventListener('click', openModal);
	closeModal?.addEventListener('click', closeModalFn);
	modalBg?.addEventListener('click', closeModalFn);
	speedRange?.addEventListener('input', ()=>{ tickerSpeed=Number(speedRange.value); speedVal.textContent=tickerSpeed; renderTicker(); });
	pauseTicker?.addEventListener('change', ()=>{ tickerPaused=pauseTicker.checked; renderTicker(); });
	addMsg?.addEventListener('click', ()=>{ const text=(msgInput.value||'').trim(); if(!text) return; tickerMessages.push({ level:msgLevel.value||'info', text }); msgInput.value=''; renderMsgTable(); renderTicker(); });

	// Quick actions: dark mode, header toggle (persisted)
	const HEADER_KEY = 'tt.headerHidden';
	toggleDarkModeBtn?.addEventListener('click', ()=>{
		document.body.classList.toggle('dark');
	});
	toggleHeaderBtn?.addEventListener('click', ()=>{
		const hidden = localStorage.getItem(HEADER_KEY)==='1';
		const next = !hidden;
		localStorage.setItem(HEADER_KEY, next?'1':'0');
		applyHeaderVisibility(next);
	});

	function renderMsgTable(){
		msgTable.innerHTML='';
		tickerMessages.forEach((m,i)=>{
			const tr=document.createElement('tr');
			tr.innerHTML = `<td>${m.level.toUpperCase()}</td><td>${m.text}</td><td class="col-actions-140">
				<button class="button" data-act="up" data-i="${i}">위</button>
				<button class="button" data-act="down" data-i="${i}">아래</button>
				<button class="button" data-act="del" data-i="${i}">삭제</button></td>`;
			msgTable.appendChild(tr);
		});
		$$("button[data-act]", msgTable).forEach(btn=>{
			const i=Number(btn.dataset.i), act=btn.dataset.act;
			btn.addEventListener('click', ()=>{
				if(act==='del') tickerMessages.splice(i,1);
				else if(act==='up' && i>0) [tickerMessages[i-1],tickerMessages[i]]=[tickerMessages[i],tickerMessages[i-1]];
				else if(act==='down' && i<tickerMessages.length-1) [tickerMessages[i+1],tickerMessages[i]]=[tickerMessages[i],tickerMessages[i+1]];
				renderMsgTable(); renderTicker();
			});
		});
	}

	// Export/Import
	exportBtn?.addEventListener('click', ()=>{
		const data={ tickerMessages, tickerSpeed, tickerPaused };
		const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
		const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='ticker_settings.json'; a.click(); URL.revokeObjectURL(url);
	});
	importBtn?.addEventListener('click', ()=> importFile.click());
	importFile?.addEventListener('change', async ()=>{
		const f=importFile.files?.[0]; if(!f) return; const txt=await f.text();
		try{ const obj=JSON.parse(txt); if(Array.isArray(obj.tickerMessages)) tickerMessages=obj.tickerMessages; if(typeof obj.tickerSpeed==='number') tickerSpeed=obj.tickerSpeed; if(typeof obj.tickerPaused==='boolean') tickerPaused=obj.tickerPaused; renderMsgTable(); renderTicker(); }catch(e){}
	});

	// Auto refresh: 5s for full render; use rAF for ultra-smooth pan and 1s clock tick
	setInterval(()=>{ renderAll(); }, 5000);
	setInterval(()=>{ updateNowTag(); rebaseIfNeeded(); }, 1000);

	// rAF loop for smooth panning (~60fps)
	function rafLoop(){
		updatePan();
		requestAnimationFrame(rafLoop);
	}
	requestAnimationFrame(rafLoop);

	// Init
	function init(){
		// set defaults
		document.body.style.background = '#f5f7fb';
		bindDeptCheckboxes(); updateDeptCount();
		renderTicker(); renderAll(); updateNowTag(); updatePan();
		// apply persisted header visibility
		const hidden = localStorage.getItem('tt.headerHidden')==='1';
		applyHeaderVisibility(hidden);
	}
	document.addEventListener('DOMContentLoaded', init);
})();
