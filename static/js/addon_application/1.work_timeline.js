// 10-1-1.work_timeline — wrk_report DB 연동
/* ==== 데이터 & 유틸 ==== */
let DEPTS = [];
let TASKS = [];

const STATUS_MAP = {
	'REVIEW':'pending', 'APPROVED':'pending', 'SCHEDULED':'pending',
	'IN_PROGRESS':'progress',
	'COMPLETED':'done', 'ARCHIVED':'done'
};
const STATUS_LABEL = {
	'REVIEW':'검토중', 'APPROVED':'승인됨', 'SCHEDULED':'예정됨',
	'IN_PROGRESS':'진행중', 'COMPLETED':'완료', 'ARCHIVED':'보관'
};
function mapStatus(s){ return STATUS_MAP[(s||'').toUpperCase()] || 'pending'; }
/* 현재시각 기준 실시간 상태 판별 */
function liveStatus(t){
	const now = Date.now();
	if(now < t.start) return 'pending';   // 예비작업
	if(now > t.end)   return 'done';      // 종료작업
	return 'progress';                     // 현재작업
}

async function fetchTasks(){
	try{
		const resp = await fetch('/api/wrk/reports?view=all&limit=500&status=APPROVED,SCHEDULED,IN_PROGRESS,COMPLETED,ARCHIVED');
		if(!resp.ok){ console.warn('wrk_report API 응답 오류:', resp.status); return; }
		const data = await resp.json();
		if(!data.success || !Array.isArray(data.items)) return;

		TASKS = data.items
			.filter(item => item.start_datetime && item.end_datetime)
			.map(item=>({
			id: item.id,
			title: item.task_title || item.task_name || '',
			dept: item.owner_dept_name || item.owner_dept || '미지정',
			assignee: item.owner_name || item.owner || '미지정',
			status: mapStatus(item.status),
			rawStatus: item.status || '',
			start: new Date(item.start_datetime).getTime(),
			end: new Date(item.end_datetime).getTime(),
			impact: item.impact || '',
			service: item.service || '',
			classifications: (item.classifications||[]).join(', '),
			worktypes: (item.worktypes||[]).join(', '),
		}));

		TASKS.sort((a,b)=>{
			const order={progress:0, pending:1, done:2};
			const sa=liveStatus(a), sb=liveStatus(b);
			if(order[sa]!==order[sb]) return order[sa]-order[sb];
			return a.start-b.start;
		});

		// 부서 목록 동적 갱신
		const wasAll = SELECTED.size===DEPTS.length || DEPTS.length===0;
		DEPTS = [...new Set(TASKS.map(t=>t.dept).filter(Boolean))].sort();
		if(wasAll) SELECTED = new Set(DEPTS);
		else SELECTED = new Set([...SELECTED].filter(d=>DEPTS.includes(d)));
		buildMenu();
		renderAll();
	}catch(e){
		console.error('fetchTasks error:', e);
	}
}
const $ = s=>document.querySelector(s);
const tooltip = document.getElementById("tooltip");

/* ==== 스크롤바 폭 계산 (헤더/바디 정렬) ==== */
function measureScrollbarWidth(){
	// body-scroll과 동일한 scrollbar-width:thin 스타일로 측정해야 정확
	const d = document.createElement('div');
	d.style.visibility = 'hidden';
	d.style.overflowY = 'scroll';
	d.style.width = '100px';
	d.style.height = '100px';
	d.style.scrollbarWidth = 'thin'; // Firefox
	// Webkit thin scrollbar 재현
	const sheet = document.createElement('style');
	sheet.textContent = '._sbw-probe::-webkit-scrollbar{width:5px}';
	document.head.appendChild(sheet);
	d.className = '_sbw-probe';
	document.body.appendChild(d);
	const inner = document.createElement('div'); inner.style.width = '100%'; inner.style.height = '200px';
	d.appendChild(inner);
	const sbw = d.offsetWidth - d.clientWidth;
	document.body.removeChild(d);
	document.head.removeChild(sheet);
	return Math.max(0, sbw || 0);
}
function applyScrollbarWidthVar(){
	const sbw = measureScrollbarWidth();
	document.documentElement.style.setProperty('--sbw', sbw + 'px');
}

/* ==== 중앙 고정 시간 윈도우 ==== */
const VIEW_HOURS = 24; // 뷰포트 최대 표시 시간
let HOURS = 24;
let TOTAL_MS = HOURS*3600*1000;
function windowStart(){ return Date.now() - TOTAL_MS/2; }
function windowEnd(){ return Date.now() + TOTAL_MS/2; }
function setTimeRange(h){
	HOURS = h;
	TOTAL_MS = HOURS*3600*1000;
	renderAll();
	scrollToNow();
}

/* ==== 타임라인 스케일 & 스크롤 ==== */
function applyTimelineScale(){
	const pct = Math.max(100, HOURS / VIEW_HOURS * 100);
	const w = pct + '%';
	document.getElementById('ticksTop').style.width = w;
	document.getElementById('gridcol').style.width = w;
}
function scrollToNow(){
	const bs = document.getElementById('bodyScroll');
	if(!bs) return;
	requestAnimationFrame(()=>{
		const center = bs.scrollWidth / 2 - bs.clientWidth / 2;
		bs.scrollLeft = Math.max(0, center);
		const hs = document.getElementById('headScroll');
		if(hs) hs.scrollLeft = bs.scrollLeft;
		positionNowLine();
	});
}

/* ==== 부서 드롭다운 다중 선택 ==== */
let SELECTED = new Set(); // fetchTasks 후 동적 설정
function updateBtnLabel(){
	const n = SELECTED.size;
	const label = n===DEPTS.length ? "부서 선택: 전체" : n===0 ? "부서 선택: 없음" : `부서 선택: ${n}개`;
	document.getElementById("deptBtnLabel").textContent = label;
	document.getElementById("selCount").textContent = `${n} 선택됨`;
}
function buildMenu(list=DEPTS){
	const box = document.getElementById("deptList");
	box.innerHTML = "";
	list.forEach(d=>{
		const row=document.createElement("div"); row.className="row";
		const cb=document.createElement("input"); cb.type="checkbox"; cb.checked=SELECTED.has(d); cb.id="d-"+d;
		cb.addEventListener("change", ()=>{ if(cb.checked) SELECTED.add(d); else SELECTED.delete(d); renderAll(); updateBtnLabel(); });
		const lb=document.createElement("label"); lb.htmlFor="d-"+d; lb.textContent=d;
		row.appendChild(cb); row.appendChild(lb);
		box.appendChild(row);
	});
	updateBtnLabel();
}

/* ==== 틱/상태 ==== */
function fmt(ts){
	const d=new Date(ts);
	const yy=d.getFullYear();
	const mm=String(d.getMonth()+1).padStart(2,"0");
	const dd=String(d.getDate()).padStart(2,"0");
	const hh=String(d.getHours()).padStart(2,"0");
	const mi=String(d.getMinutes()).padStart(2,"0");
	const ss=String(d.getSeconds()).padStart(2,"0");
	return `${yy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}
function formatTick(ts){
	const d=new Date(ts);
	const hh=String(d.getHours()).padStart(2,"0");
	const mm=String(d.getMinutes()).padStart(2,"0");
	return `${hh}:${mm}`;
}
function renderTicks(){
	const ticksTop=document.getElementById("ticksTop");
	ticksTop.querySelectorAll(".tick,.tick-label").forEach(el=>el.remove());
	const start = windowStart();
	const end = windowEnd();
	const step = 3600*1000; // 1시간 눈금
	for(let t=Math.ceil(start/step)*step; t<=end; t+=step){
		const pct=(t-start)/TOTAL_MS*100;
		const tick=document.createElement("div"); tick.className="tick"; tick.style.left=`calc(${pct}% - 1px)`;
		const lbl=document.createElement("div"); lbl.className="tick-label"; lbl.style.left=`${pct}%`; lbl.textContent=formatTick(t);
		ticksTop.appendChild(tick); ticksTop.appendChild(lbl);
	}
}

/* ==== 표시 대상 ==== */
function visibleTasks(){
	if(SELECTED.size===0) return [];
	const wStart = windowStart(), wEnd = windowEnd();
	return TASKS.filter(t=> SELECTED.has(t.dept) && t.end > wStart && t.start < wEnd);
}

/* ==== 행/막대 렌더 ==== */
function renderRows(){
	const ycol=document.getElementById("ycol"), grid=document.getElementById("gridcol");
	ycol.innerHTML=""; grid.innerHTML="";

	// 바디 틱
	const start = windowStart();
	const end = windowEnd();
	const step = 3600*1000;
	for(let t=Math.ceil(start/step)*step; t<=end; t+=step){
		const pct=(t-start)/TOTAL_MS*100;
		const vt=document.createElement("div"); vt.className="tick"; vt.style.left=`calc(${pct}% - 1px)`;
		grid.appendChild(vt);
	}

	const rows = visibleTasks();
	if(rows.length === 0){
		/* 중앙에 안내 문구 */
		const empty=document.createElement("div"); empty.className="empty-notice";
		empty.textContent="등록된 작업이 없습니다";
		grid.appendChild(empty);
	}
	rows.forEach((t)=>{
		const lab=document.createElement("div");
		lab.className="row-label";
		lab.textContent = `${t.dept} - ${t.assignee}`;
		ycol.appendChild(lab);

		const row=document.createElement("div"); row.className="row";
		const bar=document.createElement("div");
		bar.className="bar "+liveStatus(t);
		bar.dataset.taskId=t.id;
		bar.textContent=t.title;
		// tooltip
		bar.addEventListener("mouseenter", (e)=> showTooltipForTask(t.id, e.clientX, e.clientY));
		bar.addEventListener("mousemove", (e)=> moveTooltip(e.clientX, e.clientY));
		bar.addEventListener("mouseleave", hideTooltip);
		// drag
		bar.addEventListener("mousedown", (e)=> startDrag(e, t.id));
		row.appendChild(bar); grid.appendChild(row);
	});
	/* 항상: 남은 공간을 빈 행으로 채움 */
	const bodyH = grid.parentElement ? grid.parentElement.clientHeight : 600;
	const usedRows = rows.length;
	const totalSlots = Math.max(usedRows + 1, Math.floor(bodyH / 34));
	for(let i=usedRows; i<totalSlots; i++){
		const lab=document.createElement("div"); lab.className="row-label"; lab.innerHTML="&nbsp;";
		ycol.appendChild(lab);
		const row=document.createElement("div"); row.className="row";
		grid.appendChild(row);
	}
}
function positionBars(){
	const start = windowStart();
	const grid=document.getElementById("gridcol");
	const bars=grid.querySelectorAll(".row .bar");

	const rows = visibleTasks();
	rows.forEach((t,idx)=>{
		const leftPct=Math.max(0,(t.start-start)/TOTAL_MS*100);
		const rightPct=Math.min(100,(t.end-start)/TOTAL_MS*100);
		const widthPct=Math.max(0,rightPct-leftPct);
		const el=bars[idx];
		if(!el) return;
		el.className="bar "+liveStatus(t);
		el.style.left=leftPct+"%";
		el.style.width=widthPct+"%";
		el.setAttribute("aria-label", `${t.title} — ${t.dept} — ${t.assignee}`);
	});

	// NOW 라벨/시계
	document.getElementById("nowChip").textContent = "NOW";
	const nowStr = fmt(Date.now());
	document.getElementById("clock").textContent = "NOW: " + nowStr;
	// 드롭다운 하단 시간 배지는 제거됨

	// KPI — 필터된 작업만 집계
	document.getElementById("kpiPending").textContent = rows.filter(x=>liveStatus(x)==="pending").length;
	document.getElementById("kpiProgress").textContent = rows.filter(x=>liveStatus(x)==="progress").length;
	document.getElementById("kpiDone").textContent     = rows.filter(x=>liveStatus(x)==="done").length;
}

/* ==== Tooltip ==== */
function showTooltipForTask(taskId, x, y){
	const t = TASKS.find(tt=>tt.id===taskId);
	if(!t) return;
	const ls = liveStatus(t);
	const LIVE_LABEL = {pending:'예비작업', progress:'현재작업', done:'종료작업'};
	const stLabel = LIVE_LABEL[ls] || ls;
	tooltip.innerHTML = `
		<div><strong>${t.title}</strong></div>
		<div class="t">· 부서: ${t.dept}</div>
		<div class="t">· 담당자: ${t.assignee}</div>
		<div class="t">· 상태: ${stLabel}</div>
		<div class="t">· 시작: ${fmt(t.start)}</div>
		<div class="t">· 종료: ${fmt(t.end)}</div>
		${t.impact ? '<div class="t">· 영향도: '+t.impact+'</div>' : ''}
	`;
	tooltip.style.display="block";
	moveTooltip(x,y);
}
function moveTooltip(x,y){
	const pad=14;
	const maxX=window.innerWidth-tooltip.offsetWidth-pad;
	const maxY=window.innerHeight-tooltip.offsetHeight-pad;
	tooltip.style.left=Math.min(x+12, maxX)+"px";
	tooltip.style.top=Math.min(y+12, maxY)+"px";
}
function hideTooltip(){ tooltip.style.display="none"; }

/* ==== Drag logic (Duration: 기간 유지) ==== */
let drag = null;
function startDrag(e, taskId){
	e.preventDefault();
	const grid = document.getElementById("gridcol");
	const rect = grid.getBoundingClientRect();
	const t = TASKS.find(tt=>tt.id===taskId);
	drag = {
		taskId,
		startSnap: t.start,
		endSnap: t.end,
		grabX: e.clientX,
		gridLeft: rect.left,
		gridWidth: rect.width
	};
	document.addEventListener("mousemove", onDrag);
	document.addEventListener("mouseup", endDrag);
	showTooltipForTask(taskId, e.clientX, e.clientY);
}
function onDrag(e){
	if(!drag) return;
	const dx = e.clientX - drag.grabX;
	const ratio = dx / drag.gridWidth;
	const shiftMs = ratio * TOTAL_MS;
	const t = TASKS.find(tt=>tt.id===drag.taskId);
	const dur = drag.endSnap - drag.startSnap;
	let newStart = drag.startSnap + shiftMs;
	let newEnd = newStart + dur;
	t.start = newStart;
	t.end = newEnd;
	positionBars();
	showTooltipForTask(drag.taskId, e.clientX, e.clientY);
}
function endDrag(e){
	document.removeEventListener("mousemove", onDrag);
	document.removeEventListener("mouseup", endDrag);
	drag = null;
}

/* ==== NOW 라인 위치 갱신 (timelineWrap 위에 겹쳐서 헤더~바디 전체 관통) ==== */
function positionNowLine(){
	const bs = document.getElementById('bodyScroll');
	const grid = document.getElementById('gridcol');
	const wrap = document.querySelector('.timelineWrap');
	const line = document.getElementById('nowLineFull');
	if(!bs || !grid || !wrap || !line) return;
	const gridW = grid.offsetWidth;
	const nowPct = 0.5; // 타임라인 중앙 = 현재 시각
	const nowPxInGrid = nowPct * gridW;
	const wrapRect = wrap.getBoundingClientRect();
	const bsRect  = bs.getBoundingClientRect();
	const gridLeftInWrap = bsRect.left - wrapRect.left; // y-col 너비만큼 오프셋
	const leftPx = gridLeftInWrap + nowPxInGrid - bs.scrollLeft;
	line.style.left = leftPx + 'px';
}

/* ==== 주기 갱신(5초) ==== */
function renderAll(){
	applyScrollbarWidthVar();
	applyTimelineScale();
	renderTicks();
	renderRows();
	positionBars();
	positionNowLine();
}
setInterval(renderAll, 5000);
window.addEventListener('resize', ()=>{ applyScrollbarWidthVar(); positionNowLine(); });
// 1초 주기로 NOW 시각만 갱신
setInterval(()=>{
	const nowStr = fmt(Date.now());
	const clockEl = document.getElementById("clock");
	if (clockEl) clockEl.textContent = "NOW: " + nowStr;
	// 드롭다운 하단 시간 배지는 제거됨
}, 1000);

/* ==== 전광판 공지 데이터/로직 (DB 연동) ==== */
let msgs = [];
const MAX_MSGS = 10;
function sevClass(sev){ return sev==="crit"?"sev-crit":sev==="warn"?"sev-warn":"sev-info"; }
function rebuildTrack(){
	const track = document.getElementById("track");
	track.innerHTML = "";
	if(!msgs.length) return;
	msgs.forEach((m,i)=>{
		const span = document.createElement("span"); span.className="msg"; span.dataset.index=i;
		const b = document.createElement("span"); b.className="badge "+sevClass(m.sev); b.textContent = m.sev.toUpperCase();
		const t = document.createElement("span"); t.textContent = m.text;
		span.appendChild(b); span.appendChild(t);
		track.appendChild(span);
	});
}
function applySpeed(){
	const track = document.getElementById("track");
	track.style.animationDuration = tickerState.speed + "s";
}
function togglePause(){
	const track = document.getElementById("track");
	track.classList.toggle("paused");
	tickerState.paused = track.classList.contains("paused");
	const pauseIcon = document.getElementById("pauseIcon");
	if(pauseIcon){ pauseIcon.src = tickerState.paused ? '/static/image/svg/play.svg' : '/static/image/svg/stop.svg'; pauseIcon.alt = tickerState.paused ? '재생' : '일시정지'; }
	document.getElementById("pausedState").textContent = tickerState.paused ? "상태: 일시정지" : "상태: 재생";
}
const tickerState = { speed:35, paused:false };

/* ==== Ticker API helpers ==== */
async function loadTickerFromDB(){
	try{
		const r = await fetch('/api/ticker/messages');
		if(!r.ok) return;
		const d = await r.json();
		if(!d.success) return;
		msgs = (d.items||[]).map(it=>({id:it.id, text:it.text, sev:it.sev, sort_order:it.sort_order}));
		if(d.config){
			tickerState.speed = d.config.speed || 35;
			tickerState.paused = !!d.config.paused;
		}
		rebuildTrack(); applySpeed();
		const track = document.getElementById('track');
		if(track) track.classList.toggle('paused', tickerState.paused);
	}catch(e){ console.error('loadTickerFromDB:', e); }
}
async function apiCreateMsg(text, sev){
	try{
		const r = await fetch('/api/ticker/messages', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text, sev})});
		const d = await r.json();
		return d.success ? d.item : null;
	}catch(e){ console.error('apiCreateMsg:', e); return null; }
}
async function apiUpdateMsg(id, payload){
	try{
		const r = await fetch(`/api/ticker/messages/${id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
		const d = await r.json();
		return d.success;
	}catch(e){ console.error('apiUpdateMsg:', e); return false; }
}
async function apiDeleteMsg(id){
	try{
		const r = await fetch(`/api/ticker/messages/${id}`, {method:'DELETE'});
		const d = await r.json();
		return d.success;
	}catch(e){ console.error('apiDeleteMsg:', e); return false; }
}
async function apiReorderMsgs(){
	try{
		const order = msgs.filter(m=>m.id && !m._draft).map(m=>m.id);
		await fetch('/api/ticker/messages/reorder', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({order})});
	}catch(e){ console.error('apiReorderMsgs:', e); }
}
async function apiSaveConfig(){
	try{
		await fetch('/api/ticker/config', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({speed:tickerState.speed, paused:tickerState.paused})});
	}catch(e){ console.error('apiSaveConfig:', e); }
}

function updateAddBtnState(){
	const btn = document.getElementById("addBtn");
	if(!btn) return;
	const disabled = msgs.length >= MAX_MSGS;
	btn.disabled = disabled;
	btn.classList.toggle('disabled', disabled);
}

/* ==== 모달 제어 ==== */
function openModal(){
	loadTickerFromDB().then(()=>{
		document.getElementById("modalBg").classList.add("open");
		document.getElementById("tickerModal").classList.add("open");
		rebuildMsgTable();
		updateAddBtnState();
		document.getElementById("speedSel").value = String(tickerState.speed);
		document.getElementById("pausedState").textContent = tickerState.paused ? "상태: 일시정지" : "상태: 재생";
		const pauseIcon = document.getElementById("pauseIcon");
		if(pauseIcon){ pauseIcon.src = tickerState.paused ? '/static/image/svg/play.svg' : '/static/image/svg/stop.svg'; pauseIcon.alt = tickerState.paused ? '재생' : '일시정지'; }
	});
}
function closeModal(){
	// 미저장(draft) 행 제거 — 저장된 메시지만 유지
	msgs = msgs.filter(m => !m._draft);
	rebuildTrack(); applySpeed();
	document.getElementById("modalBg").classList.remove("open");
	document.getElementById("tickerModal").classList.remove("open");
}
function rebuildMsgTable(){
	const tbody = document.querySelector("#msgTable tbody");
	tbody.innerHTML = "";
	msgs.forEach((m,idx)=>{
		const tr = document.createElement("tr");
		tr.className = "draggable-row";
		tr.draggable = true;
		tr.dataset.index = String(idx);
		// drag events
		tr.addEventListener('dragstart', (e)=>{
			tr.classList.add('dragging');
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(idx));
		});
		tr.addEventListener('dragend', ()=>{
			tr.classList.remove('dragging');
			tbody.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));
		});
		tr.addEventListener('dragover', (e)=>{
			e.preventDefault();
			const overTr = e.currentTarget;
			overTr.classList.add('drop-target');
		});
		tr.addEventListener('dragleave', (e)=>{
			e.currentTarget.classList.remove('drop-target');
		});
		tr.addEventListener('drop', (e)=>{
			e.preventDefault();
			tbody.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));
			const fromIdx = Number(e.dataTransfer.getData('text/plain'));
			let toIdx = Number(tr.dataset.index);
			if(Number.isInteger(fromIdx) && Number.isInteger(toIdx) && fromIdx!==toIdx){
				const [moved] = msgs.splice(fromIdx,1);
				// adjust target index when dragging downward
				if(fromIdx < toIdx) toIdx = toIdx - 1;
				msgs.splice(toIdx,0,moved);
				rebuildMsgTable(); rebuildTrack(); applySpeed();
				apiReorderMsgs();
			}
		});

		// priority number
		const tdPri = document.createElement("td");
		const handle = document.createElement("span"); handle.className = 'drag-handle'; handle.textContent = String(idx+1);
		tdPri.appendChild(handle); tr.appendChild(tdPri);

		// severity
		const tdSev = document.createElement("td");
		const sel = document.createElement("select"); sel.className="input";
		["info","warn","crit"].forEach(v=>{
			const opt=document.createElement("option"); opt.value=v; opt.textContent=(v==="info"?"정보":v==="warn"?"주의":"중요"); if(v===m.sev) opt.selected=true;
			sel.appendChild(opt);
		});
		sel.addEventListener("change", ()=>{ m.sev = sel.value; rebuildTrack(); applySpeed(); if(m.id) apiUpdateMsg(m.id, {sev:m.sev}); });
		tdSev.appendChild(sel); tr.appendChild(tdSev);
		// text
		const tdText = document.createElement("td");
		const inp = document.createElement("input"); inp.className="input"; inp.style.width="100%"; inp.value=m.text || "";
		if(m._draft) inp.placeholder = "새 공지 입력";
		inp.addEventListener("input", ()=>{ m.text = inp.value; });
		tdText.appendChild(inp); tr.appendChild(tdText);
		// actions (관리): draft -> save+delete, saved -> edit+delete
		const tdAct = document.createElement("td"); tdAct.className="td-actions";
		if(m._draft){
			// --- 저장 버튼 ---
			const saveBtn=document.createElement("button"); saveBtn.className="icon-btn-sm";
			saveBtn.title='저장'; saveBtn.setAttribute('aria-label','저장');
			const saveIcon=document.createElement('img');
			saveIcon.src='/static/image/svg/save.svg'; saveIcon.alt='저장';
			saveBtn.appendChild(saveIcon);
			saveBtn.addEventListener('click', async ()=>{
				if(!m.text || !m.text.trim()){ alert('메시지를 입력하세요'); return; }
				const item = await apiCreateMsg(m.text.trim(), m.sev);
				if(item){
					m.id = item.id; m.text = item.text; m.sev = item.sev; delete m._draft;
					rebuildMsgTable(); rebuildTrack(); applySpeed();
				} else { alert('저장 실패'); }
			});
			tdAct.appendChild(saveBtn);
			// --- 삭제 버튼 ---
			const delBtn=document.createElement("button"); delBtn.className="icon-btn-sm";
			delBtn.title='삭제'; delBtn.setAttribute('aria-label','삭제');
			const delIcon=document.createElement('img');
			delIcon.src='/static/image/svg/list/free-icon-trash.svg'; delIcon.alt='삭제';
			delBtn.appendChild(delIcon);
			delBtn.addEventListener('click', async ()=>{
				if(m.id) await apiDeleteMsg(m.id);
				msgs.splice(idx,1); rebuildMsgTable(); rebuildTrack(); applySpeed();
			});
			tdAct.appendChild(delBtn);
		} else {
			// --- 수정/저장 토글 버튼 ---
			const editBtn=document.createElement("button"); editBtn.className="icon-btn-sm";
			const editIcon=document.createElement('img');
			let editing = false;
			editIcon.src='/static/image/svg/list/free-icon-pencil.svg'; editIcon.alt='수정';
			editBtn.title='수정'; editBtn.setAttribute('aria-label','수정');
			editBtn.appendChild(editIcon);
			// 읽기 전용 기본
			sel.disabled = true; sel.classList.add('readonly'); inp.readOnly = true; inp.classList.add('readonly');
			editBtn.addEventListener('click', async ()=>{
				if(!editing){
					editing = true;
					sel.disabled = false; sel.classList.remove('readonly'); inp.readOnly = false; inp.classList.remove('readonly');
					editIcon.src='/static/image/svg/save.svg'; editIcon.alt='저장';
					editBtn.title='저장'; editBtn.setAttribute('aria-label','저장');
					inp.focus();
				} else {
					if(!m.text || !m.text.trim()){ alert('메시지를 입력하세요'); return; }
					if(m.id) await apiUpdateMsg(m.id, {text:m.text.trim(), sev:m.sev});
					editing = false;
					sel.disabled = true; sel.classList.add('readonly'); inp.readOnly = true; inp.classList.add('readonly');
					editIcon.src='/static/image/svg/list/free-icon-pencil.svg'; editIcon.alt='수정';
					editBtn.title='수정'; editBtn.setAttribute('aria-label','수정');
					rebuildTrack(); applySpeed();
				}
			});
			tdAct.appendChild(editBtn);
			// --- 삭제 버튼 ---
			const delBtn2=document.createElement("button"); delBtn2.className="icon-btn-sm";
			delBtn2.title='삭제'; delBtn2.setAttribute('aria-label','삭제');
			const delIcon2=document.createElement('img');
			delIcon2.src='/static/image/svg/list/free-icon-trash.svg'; delIcon2.alt='삭제';
			delBtn2.appendChild(delIcon2);
			delBtn2.addEventListener('click', async ()=>{
				if(m.id) await apiDeleteMsg(m.id);
				msgs.splice(idx,1); rebuildMsgTable(); rebuildTrack(); applySpeed();
			});
			tdAct.appendChild(delBtn2);
		}
		tr.appendChild(tdAct);
		tbody.appendChild(tr);
	});
	updateAddBtnState();
}
function addNewMsg(){
	// limit maximum number of messages
	if (msgs.length >= MAX_MSGS) { alert(`전광판 메시지는 최대 ${MAX_MSGS}개까지 추가할 수 있습니다.`); updateAddBtnState(); return; }
	// append a draft row at the end
	msgs.push({ text: "", sev: "info", _draft: true });
	rebuildMsgTable();
	// focus new input
	const tbody = document.querySelector('#msgTable tbody');
	const lastRow = tbody && tbody.lastElementChild;
	const input = lastRow ? lastRow.querySelector('input') : null;
	if(input) input.focus();
}

/* ==== 내보내기/가져오기 ==== */
function exportMsgs(){
	const data = { speed:tickerState.speed, paused:tickerState.paused, msgs };
	const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url; a.download = "ticker_settings.json"; a.click();
	URL.revokeObjectURL(url);
}
function importMsgs(file){
	const reader = new FileReader();
	reader.onload = ()=>{
		try{
			const data = JSON.parse(reader.result);
			if(Array.isArray(data.msgs)){
				msgs = data.msgs.map(m=>({text:String(m.text||""), sev:(m.sev==="crit"||m.sev==="warn")?m.sev:"info"}));
			}
			if(typeof data.speed==="number") tickerState.speed = data.speed;
			if(typeof data.paused==="boolean") tickerState.paused = data.paused;
			document.getElementById("speedSel").value = String(tickerState.speed);
			const track = document.getElementById("track");
			track.classList.toggle("paused", tickerState.paused);
			rebuildMsgTable(); rebuildTrack(); applySpeed();
			document.getElementById("pausedState").textContent = tickerState.paused ? "상태: 일시정지" : "상태: 재생";
		}catch(e){ alert("가져오기 실패(Invalid JSON: 잘못된 JSON)"); }
	};
	reader.readAsText(file);
}

/* ==== 초기화 ==== */

// Dropdown
(function initDropdownOuter(){
	const menu = document.getElementById("deptMenu");
	document.getElementById("deptBtn").addEventListener("click", (e)=>{
		e.stopPropagation(); menu.classList.toggle("open");
	});
	// 검색 입력은 제거됨
	document.getElementById("selectAll").addEventListener("click", ()=>{ SELECTED = new Set(DEPTS); buildMenu(); renderAll(); });
	document.getElementById("clearAll").addEventListener("click", ()=>{ SELECTED.clear(); buildMenu(); renderAll(); });
	document.addEventListener("click", (e)=>{
		const drop = document.getElementById("deptDrop");
		if(!drop.contains(e.target)) menu.classList.remove("open");
	});
	buildMenu();
})();

// Ticker base — DB에서 로드
function rebuildTrackAndApply(){ rebuildTrack(); applySpeed(); }
loadTickerFromDB();

// Modal wiring
document.getElementById("openTickerSettings").addEventListener("click", openModal);
document.getElementById("closeModal").addEventListener("click", closeModal);
document.getElementById("modalBg").addEventListener("click", closeModal);
document.getElementById("speedSel").addEventListener("change", (e)=>{ tickerState.speed = Number(e.target.value); applySpeed(); apiSaveConfig(); });
document.getElementById("pauseBtn").addEventListener("click", ()=>{ togglePause(); apiSaveConfig(); });
document.getElementById("addBtn").addEventListener("click", addNewMsg);
document.getElementById("timeRange").addEventListener("change", (e)=>{ setTimeRange(Number(e.target.value)); });
// 내보내기/가져오기는 제거됨

// 첫 렌더 (DB에서 가져오기)
applyScrollbarWidthVar();
fetchTasks().then(()=> scrollToNow());
// 15초마다 DB 데이터 자동 갱신 (새 작업 즉시 반영)
setInterval(fetchTasks, 15000);

// 스크롤 동기화 (body → header, body → y-col, NOW 라인)
(function(){
	const bs = document.getElementById('bodyScroll');
	const hs = document.getElementById('headScroll');
	const yc = document.getElementById('ycol');
	if(bs){
		bs.addEventListener('scroll', ()=>{
			if(hs) hs.scrollLeft = bs.scrollLeft;
			if(yc) yc.scrollTop = bs.scrollTop;
			positionNowLine();
		});
	}
})();
/* ==== 자동 숨김: 시간/부서 선택박스 (5초 미조작 시 숨김) ==== */
(function(){
	const IDLE_MS = 5000;
	const targets = document.querySelectorAll('#timeRange, #deptDrop');
	targets.forEach(el => el.classList.add('auto-hide'));
	let timer = null;
	function show(){
		targets.forEach(el => el.classList.remove('hidden'));
		clearTimeout(timer);
		timer = setTimeout(hide, IDLE_MS);
	}
	function hide(){
		// 드롭다운 열려있으면 숨기지 않음
		const menu = document.getElementById('deptMenu');
		if(menu && menu.classList.contains('open')) return;
		targets.forEach(el => el.classList.add('hidden'));
	}
	document.addEventListener('mousemove', show);
	document.addEventListener('click', show);
	document.addEventListener('keydown', show);
	document.addEventListener('touchstart', show);
	timer = setTimeout(hide, IDLE_MS);
})();