// Ticket modal initialization for complete_ticket workflow list
// API-backed shared DB

document.addEventListener('DOMContentLoaded', async () => {
	/* ── 유형 → 분류 종속 매핑 (workflow_progress 동일) ── */
	const KIND_TASK_MAP = {
		'장애': ['기능 오류','성능 문제','연동 오류','데이터 오류','인프라 장애'],
		'요청': ['계정','권한','데이터','설정','접근','기타 요청'],
		'변경': ['배포','설정 변경','정책 변경','인프라 변경','패치 적용'],
		'유지보수': ['계약 신청','계약 변경','계약 해지','기술지원 요청'],
		'감사': ['외부 감사','내부 감사','규제 점검'],
		'문제': ['원인 분석','재발 방지','구조 개선'],
		'작업': ['데이터 작업','시스템 작업','테스트 지원','문서 작업'],
		'점검': ['정기 점검','수시 점검','보안 점검','백업 점검','규제 점검','내부 점검']
	};
	function syncTaskOptions(kindValue){
		const taskSel = document.getElementById('wf-task');
		if(!taskSel) return;
		taskSel.innerHTML = '';
		const blank = document.createElement('option'); blank.value=''; blank.textContent='선택'; taskSel.appendChild(blank);
		(KIND_TASK_MAP[kindValue]||[]).forEach(s=>{ const o=document.createElement('option'); o.value=s; o.textContent=s; taskSel.appendChild(o); });
		if(window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance) window.BlossomSearchableSelect.enhance(taskSel);
	}

	function normalizeDueText(raw){
		const txt = (raw || '').toString().trim();
		if (!txt) return '';
		const m = txt.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?/);
		if (!m) return txt;
		const [, y, mo, d, h='00', mi='00'] = m;
		const pad = (v)=> String(v).padStart(2,'0');
		return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}`;
	}

	/* ── Shared API with workflow_progress page ── */
	const API_BASE = '/api/tickets';
	function mapFromAPI(item){
		var al = [];
		try { al = item.assignee_list || (item.assignee_json_raw ? JSON.parse(item.assignee_json_raw) : []); } catch(_){}
		var tl = [];
		try {
			if(Array.isArray(item.target_list)) tl = item.target_list;
			else if(item.target_object && String(item.target_object).charAt(0)==='[') tl = JSON.parse(item.target_object);
			else if(item.target_object) tl = [item.target_object];
		} catch(_){}
		return {
			id: item.id,
			title: item.title || '',
			kind: item.ticket_type || '',
			task: item.category || '',
			priority: item.priority || '',
			requester: item.requester_name || '',
			assignee: al.map(function(a){ return { value: a.name||'', display: a.display || (a.dept ? a.name+' ('+a.dept+')' : a.name) || '' }; }),
			status: item.status || 'PENDING',
			target: tl,
			due: item.due_at || '',
			detail: item.detail || '',
			attachments: (item.files||[]).map(function(f){ return { id:f.id, name:f.original_name||'', size:f.file_size||0, type:f.content_type||'', ticket_id:f.ticket_id }; }),
			created_at: item.created_at || '',
			updated_at: item.updated_at || '',
			done_at: item.closed_at || null,
			cleared: item.cleared ? true : false
		};
	}
	async function fetchDoneTickets(){
		try {
			var resp = await fetch(API_BASE + '?scope=my&status=DONE', {headers:{Accept:'application/json'}});
			var json = await resp.json();
			if(json.success && Array.isArray(json.items)) return json.items.map(mapFromAPI);
		} catch(e){ console.error('fetchDoneTickets error:', e); }
		return [];
	}

	/* ── Display helpers for array fields (workflow stores assignee/target as arrays) ── */
	function displayAssignee(v){
		if(!Array.isArray(v) || !v.length) return v || '';
		var names = v.map(function(o){ return typeof o==='string'? o : (o.value||o.display||''); }).filter(Boolean);
		if(!names.length) return '';
		if(names.length===1) return names[0];
		return names[0]+' 외 '+(names.length-1)+'명';
	}
	function displayTarget(v){
		if(!Array.isArray(v) || !v.length) return v || '';
		return v.map(function(o){
			if(typeof o==='object' && o!==null){
				var n = o.work_name||o.value||'';
				if(o.system_name) n += ' ('+o.system_name+')';
				return n;
			}
			return String(o);
		}).join(', ');
	}

	/* ── 대상 다중 선택 (업무명 + 시스템명) ── */
	const wfTargetState = { selected: [], debounce: null };
	function initTargetPicker(){
		const input  = document.getElementById('wf-target-input');
		const dd     = document.getElementById('wf-target-dropdown');
		const chipBox = document.getElementById('wf-target-tags');
		const hidden = document.getElementById('wf-target-hidden');
		if(!input || !dd || !chipBox || !hidden) return;
		function syncHidden(){ hidden.value = JSON.stringify(wfTargetState.selected); }
		function fmtLabel(item){
			if(typeof item === 'string') return item;
			return item.system_name ? item.work_name + ' (' + item.system_name + ')' : item.work_name;
		}
		function itemKey(item){
			if(typeof item === 'string') return item;
			return item.work_name + '||' + (item.system_name || '');
		}
		function renderChips(){
			chipBox.innerHTML = '';
			if(!wfTargetState.selected.length){ var empty=document.createElement('span'); empty.className='wf-sc-empty'; empty.textContent='선택된 대상 없음'; chipBox.appendChild(empty); syncHidden(); return; }
			wfTargetState.selected.forEach(function(v){
				var chip=document.createElement('span'); chip.className='wf-sc-chip target-chip'; chip.textContent=fmtLabel(v);
				var rm=document.createElement('button'); rm.type='button'; rm.className='wf-sc-chip-rm'; rm.innerHTML='&times;'; rm.title='제거';
				rm.onclick=function(e){ e.preventDefault(); e.stopPropagation(); var k=itemKey(v); wfTargetState.selected=wfTargetState.selected.filter(function(x){return itemKey(x)!==k;}); renderChips(); };
				chip.appendChild(rm); chipBox.appendChild(chip);
			}); syncHidden();
		}
		function showDropdown(items){
			dd.innerHTML = '';
			if(!items.length){ dd.hidden=true; return; }
			var selectedKeys = wfTargetState.selected.map(itemKey);
			items.forEach(function(pair){
				var key = itemKey(pair);
				if(selectedKeys.indexOf(key) !== -1) return;
				var label = fmtLabel(pair);
				var opt=document.createElement('div'); opt.className='wf-dd-option'; opt.textContent=label;
				opt.onmousedown=function(e){ e.preventDefault(); wfTargetState.selected.push(pair); renderChips(); input.value=''; dd.hidden=true; input.focus(); };
				dd.appendChild(opt);
			}); dd.hidden = dd.children.length===0;
		}
		function fetchWorkSystems(q){
			var url='/api/hardware-assets/suggest-work-systems?limit=30'+(q?'&q='+encodeURIComponent(q):'');
			fetch(url,{headers:{Accept:'application/json'}}).then(function(r){return r.json();}).then(function(json){ if(json&&json.success&&Array.isArray(json.items)) showDropdown(json.items); else dd.hidden=true; }).catch(function(){dd.hidden=true;});
		}
		input.addEventListener('input', function(){ clearTimeout(wfTargetState.debounce); wfTargetState.debounce=setTimeout(function(){ fetchWorkSystems(input.value.trim()); },200); });
		input.addEventListener('focus', function(){ fetchWorkSystems(input.value.trim()); });
		input.addEventListener('blur', function(){ setTimeout(function(){ dd.hidden=true; },180); });
		renderChips();
	}
	function resetTargetPicker(){
		wfTargetState.selected=[];
		var chipBox=document.getElementById('wf-target-tags'); if(chipBox) chipBox.innerHTML='';
		var hidden=document.getElementById('wf-target-hidden'); if(hidden) hidden.value='';
		var input=document.getElementById('wf-target-input'); if(input) input.value='';
	}

	/* ── 담당자 다중 선택 (org_user 검색) ── */
	const wfAssigneeState = { selected: [], debounce: null };
	function initAssigneePicker(){
		const input  = document.getElementById('wf-assignee-input');
		const dd     = document.getElementById('wf-assignee-dropdown');
		const chipBox = document.getElementById('wf-assignee-tags');
		const hidden = document.getElementById('wf-assignee-hidden');
		if(!input || !dd || !chipBox || !hidden) return;
		function syncHidden(){ hidden.value = wfAssigneeState.selected.map(function(o){return o.value;}).join(','); }
		function renderChips(){
			chipBox.innerHTML = '';
			if(!wfAssigneeState.selected.length){ var empty=document.createElement('span'); empty.className='wf-sc-empty'; empty.textContent='선택된 담당자 없음'; chipBox.appendChild(empty); syncHidden(); return; }
			wfAssigneeState.selected.forEach(function(o){
				var chip=document.createElement('span'); chip.className='wf-sc-chip'; chip.textContent=o.display;
				var rm=document.createElement('button'); rm.type='button'; rm.className='wf-sc-chip-rm'; rm.innerHTML='&times;'; rm.title='제거';
				rm.onclick=function(e){ e.preventDefault(); e.stopPropagation(); wfAssigneeState.selected=wfAssigneeState.selected.filter(function(x){return x.value!==o.value;}); renderChips(); };
				chip.appendChild(rm); chipBox.appendChild(chip);
			}); syncHidden();
		}
		function showDropdown(items){
			dd.innerHTML = '';
			var filtered=items.filter(function(it){return !wfAssigneeState.selected.some(function(s){return s.value===it.value;});});
			if(!filtered.length){ dd.hidden=true; return; }
			filtered.forEach(function(it){
				var opt=document.createElement('div'); opt.className='wf-dd-option'; opt.textContent=it.display;
				opt.onmousedown=function(e){ e.preventDefault(); wfAssigneeState.selected.push(it); renderChips(); input.value=''; dd.hidden=true; input.focus(); };
				dd.appendChild(opt);
			}); dd.hidden=false;
		}
		function fetchUsers(q){
			var url='/api/user-profiles?limit=50'+(q?'&q='+encodeURIComponent(q):'');
			fetch(url,{headers:{Accept:'application/json'}}).then(function(r){return r.json();}).then(function(json){
				if(!json||json.success===false){dd.hidden=true;return;}
				var items=Array.isArray(json.items)?json.items:[];
				var mapped=items.map(function(it){ var name=(it.name||'').trim(); if(!name) return null; var dept=(it.department||'').trim(); return {value:name, display:dept? name+' ('+dept+')':name}; }).filter(Boolean);
				showDropdown(mapped);
			}).catch(function(){dd.hidden=true;});
		}
		input.addEventListener('input', function(){ clearTimeout(wfAssigneeState.debounce); wfAssigneeState.debounce=setTimeout(function(){ fetchUsers(input.value.trim()); },200); });
		input.addEventListener('focus', function(){ fetchUsers(input.value.trim()); });
		input.addEventListener('blur', function(){ setTimeout(function(){ dd.hidden=true; },180); });
		renderChips();
	}
	function resetAssigneePicker(){
		wfAssigneeState.selected=[];
		var chipBox=document.getElementById('wf-assignee-tags'); if(chipBox) chipBox.innerHTML='';
		var hidden=document.getElementById('wf-assignee-hidden'); if(hidden) hidden.value='';
		var input=document.getElementById('wf-assignee-input'); if(input) input.value='';
	}

	/* ── Flatpickr lazy-loader (workflow_progress 동일) ── */
	const FP_VER='4.6.13';
	const FP_BASE=`/static/vendor/flatpickr/${FP_VER}`;
	const FP_CSS=`${FP_BASE}/flatpickr.min.css`;
	const FP_THEME=`${FP_BASE}/themes/airbnb.css`;
	const FP_JS=`${FP_BASE}/flatpickr.min.js`;
	const FP_KO=`${FP_BASE}/l10n/ko.js`;
	let __fpPromise=null;
	function ensureCss(href,id){ try{ const ex=document.getElementById(id); if(ex&&ex.tagName.toLowerCase()==='link'){if(ex.getAttribute('href')!==href)ex.setAttribute('href',href);return;} const l=document.createElement('link');l.rel='stylesheet';l.href=href;if(id)l.id=id;document.head.appendChild(l);}catch(_){} }
	function loadScript(src){ return new Promise((res,rej)=>{ try{const s=document.createElement('script');s.src=src;s.async=true;s.onload=()=>res(true);s.onerror=()=>rej(new Error('FAILED '+src));document.head.appendChild(s);}catch(e){rej(e);} }); }
	async function ensureFlatpickrAssets(){ ensureCss(FP_CSS,'flatpickr-css'); ensureCss(FP_THEME,'flatpickr-theme-css'); if(window.flatpickr) return; if(__fpPromise) return __fpPromise; __fpPromise=loadScript(FP_JS).then(()=>loadScript(FP_KO).catch(()=>null)).catch(e=>{__fpPromise=null;throw e;}); return __fpPromise; }
	function ensureTodayButton(fp){ try{const cal=fp&&fp.calendarContainer;if(!cal)return;if(cal.querySelector('.fp-today-btn'))return;const btn=document.createElement('button');btn.type='button';btn.className='fp-today-btn';btn.textContent='오늘';btn.addEventListener('click',()=>{fp.setDate(new Date(),true);});cal.appendChild(btn);}catch(_){} }
	async function initDueFlatpickr(){
		const el=document.querySelector('#wf-add-form input[name="due"].date-input'); if(!el) return;
		try{ await ensureFlatpickrAssets(); }catch(_){ return; }
		if(!window.flatpickr) return; if(el._flatpickr) return;
		const koLocale=(window.flatpickr.l10ns&&window.flatpickr.l10ns.ko)?window.flatpickr.l10ns.ko:'ko';
		window.flatpickr(el,{ enableTime:true, time_24hr:true, dateFormat:'Y-m-d H:i', allowInput:true, disableMobile:true, clickOpens:true, appendTo:document.body, locale:koLocale, onReady:(_s,_d,inst)=>ensureTodayButton(inst), onOpen:(_s,_d,inst)=>ensureTodayButton(inst) });
	}

	// Status helpers
	const STATUS_LABELS = {
		PENDING:'접수대기', ACCEPTED:'접수', INPROGRESS:'처리중', DONE:'완료',
		'접수대기':'접수대기','접수':'접수','처리중':'처리중','완료':'완료'
	};
	function displayStatus(v){ return STATUS_LABELS[v] || v || ''; }
	function statusWsClass(v){
		const label = displayStatus(v);
		if(label === '처리중') return 'ws-run';
		if(label === '완료') return 'ws-idle';
		if(label === '접수' || label === '접수대기') return 'ws-wait';
		return 'ws-wait';
	}

	// State — load DONE tickets from API
	const isDone = (t)=> { const s = t.status; return s==='DONE' || displayStatus(s)==='완료'; };
	let allTickets = await fetchDoneTickets();
	let rows = allTickets.filter(isDone);
	let filtered = rows.slice();
	async function reloadRows(){ allTickets = await fetchDoneTickets(); rows = allTickets.filter(isDone); filtered = rows.slice(); }
	const selected = new Set();

	// Column visibility (derive from thead initially)
	const thead = document.querySelector('#system-table thead');
	const headerCols = [...(thead?.querySelectorAll('th[data-col]')||[])].map(th=> th.getAttribute('data-col'));
	const dataCols = headerCols.filter(c=> c && c !== 'actions');
	// Persist selection like the on-premise page
	const VISIBLE_COLS_KEY = 'complete_ticket_visible_cols';
	function loadColumnSelection(){
		try{
			const raw = localStorage.getItem(VISIBLE_COLS_KEY);
			if(!raw){
				visibleCols = new Set(dataCols);
				localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify([...visibleCols]));
				return;
			}
			const arr = JSON.parse(raw);
			const valid = (Array.isArray(arr)? arr: []).filter(c=> dataCols.includes(c));
			visibleCols = new Set(valid.length? valid: dataCols);
			localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify([...visibleCols]));
		}catch(_e){ visibleCols = new Set(dataCols); }
	}
	function saveColumnSelection(){
		try{ localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify([...visibleCols])); }catch(_e){}
	}
	let visibleCols = new Set();
	loadColumnSelection();



	function renderTable(){
		const tbody = document.getElementById('system-table-body'); if(!tbody) return;
		tbody.innerHTML = filtered.map(t => {
			const checked = selected.has(String(t.id)) ? 'checked' : '';
			return `<tr data-id="${t.id}">`
				+ `<td><input type="checkbox" class="system-row-select" data-id="${t.id}" value="${t.id}" ${checked}></td>`
				+ `<td data-col="status"><span class="status-pill"><span class="status-dot ${statusWsClass(t.status)}" aria-hidden="true"></span><span class="status-text">${escapeHtml(displayStatus(t.status))}</span></span></td>`
				+ `<td data-col="title"><span class="ticket-title" data-ticket-id="${t.id}">${escapeHtml(t.title)}</span></td>`
				+ `<td data-col="kind">${escapeHtml(t.kind)}</td>`
				+ `<td data-col="task">${escapeHtml(t.task)}</td>`
				+ `<td data-col="priority"><span class="priority-inline"><span class="priority-dot pri-${escapeHtml(t.priority)}"></span>${escapeHtml(t.priority)}</span></td>`
				+ `<td data-col="requester">${escapeHtml(t.requester)}</td>`
				+ `<td data-col="assignee">${escapeHtml(displayAssignee(t.assignee))}</td>`
				+ `<td data-col="due">${escapeHtml(t.due)}</td>`
				+ `<td data-col="actions" data-label="관리" class="system-actions">`
				+ `<button type="button" class="action-btn" data-action="detail" data-id="${t.id}" title="상세보기" aria-label="상세보기">`
				+ `<img src="/static/image/svg/project/free-icon-tickets.svg" alt="상세" class="action-icon">`
				+ `</button>`
				+ `</td>`
				+ `</tr>`;
		}).join('');
		const countBadge = document.getElementById('system-count'); if (countBadge) countBadge.textContent = String(filtered.length);
		const emptyState = document.getElementById('system-empty'); if (emptyState) emptyState.hidden = filtered.length>0;
		applyColumnVisibility();
		syncSelectAll();
	}

	function applyColumnVisibility(){
		const table = document.getElementById('system-table'); if(!table) return;
		table.querySelectorAll('thead th[data-col], tbody td[data-col]').forEach(cell=>{
			const col = cell.getAttribute('data-col'); if(!col || col==='actions') return;
			if(visibleCols.has(col)) cell.classList.remove('col-hidden'); else cell.classList.add('col-hidden');
		});
	}

	function syncSelectAll(){
		const allRows = [...document.querySelectorAll('#system-table-body .system-row-select')];
		const allChecked = allRows.length>0 && allRows.every(cb=> cb.checked);
		const selAll = document.getElementById('system-select-all');
		if(selAll) selAll.checked = allChecked;
	}

	function allAssigneeNames(v){
		if(!Array.isArray(v)) return v || '';
		return v.map(function(o){ return typeof o==='string'? o : (o.value||o.display||''); }).join(', ');
	}

	function searchPipeline(){
		const q = (document.getElementById('system-search')?.value || '').trim().toLowerCase();
		if(!q){ filtered = rows.slice(); renderTable(); return; }
		filtered = rows.filter(t=>{
			const fields = [t.title, t.kind, t.task, t.priority, t.requester, allAssigneeNames(t.assignee), displayStatus(t.status), displayTarget(t.target), t.due];
			return fields.some(v=> String(v||'').toLowerCase().includes(q));
		});
		renderTable();
	}

	// Initial render
	renderTable();
	// Ensure spacing class untouched
	const tableEl = document.getElementById('system-table'); tableEl?.classList.remove('compact-overrides');

	// ========== Header buttons wiring (pruned unused actions) ==========
	const addBtn = document.getElementById('system-add-btn');
	const columnBtn = document.getElementById('system-column-btn');
	const statsBtn = document.getElementById('system-stats-btn');
	const downloadBtn = document.getElementById('system-download-btn');
	const deleteBtn = document.getElementById('system-delete-btn');

	// Delete — open modal instead of confirm()
	deleteBtn?.addEventListener('click', ()=>{
		if(!selected.size){ showMessage('삭제처리할 행을 먼저 선택하세요.', '안내'); return; }
		const subtitle = document.getElementById('delete-subtitle');
		if(subtitle){ subtitle.textContent = `선택된 ${selected.size}개의 티켓을 정말 삭제처리하시겠습니까?`; }
		openModal('system-delete-modal');
	});
	document.getElementById('system-delete-close')?.addEventListener('click', ()=> closeModal('system-delete-modal'));
	document.getElementById('system-delete-confirm')?.addEventListener('click', async ()=>{
		const count = selected.size;
		// Delete from server
		const deletePromises = [...selected].map(function(id){ return fetch(API_BASE + '/' + id, {method:'DELETE'}).catch(function(){}); });
		await Promise.all(deletePromises);
		rows = rows.filter(r => !selected.has(String(r.id)));
		filtered = filtered.filter(r => !selected.has(String(r.id)));
		selected.clear();
		closeModal('system-delete-modal');
		renderTable();
		showMessage(`${count}개 티켓이 삭제되었습니다.`, '삭제 완료');
	});

	function openModal(id){ const el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
	function closeModal(id){ const el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.server-add-modal.show, .server-edit-modal.show')) document.body.classList.remove('modal-open'); }
	function showMessage(message, title){
		const titleEl = document.getElementById('message-title');
		const contentEl = document.getElementById('message-content');
		if(titleEl) titleEl.textContent = title || '알림';
		if(contentEl) contentEl.textContent = String(message || '');
		openModal('system-message-modal');
	}
	document.getElementById('system-message-close')?.addEventListener('click', ()=> closeModal('system-message-modal'));
	document.getElementById('system-message-ok')?.addEventListener('click', ()=> closeModal('system-message-modal'));

	// Add opens ticket modal
	addBtn?.addEventListener('click', ()=> openModal('wf-add-modal'));

	// Column modal — build with grouped grid markup like on-premise
	function buildColumnModal(){
		const form = document.getElementById('system-column-form');
		if(!form) return;
		form.innerHTML = '';
		const section = document.createElement('div');
		section.className = 'form-section';
		section.innerHTML = `<div class="section-header"><h4>티켓</h4></div>`;
		const grid = document.createElement('div');
		grid.className = 'column-select-grid';
		dataCols.forEach(col=>{
			const th = document.querySelector(`#system-table thead th[data-col="${col}"]`);
			const label = (th ? th.textContent : col)?.trim() || col;
			const el = document.createElement('label');
			el.className = 'column-checkbox' + (visibleCols.has(col)?' is-active':'');
			el.innerHTML = `
				<input type="checkbox" value="${col}" ${visibleCols.has(col)?'checked':''}>
				<span class="col-check" aria-hidden="true"></span>
				<span class="col-text">${escapeHtml(label)}</span>`;
			grid.appendChild(el);
		});
		section.appendChild(grid);
		form.appendChild(section);
	}

	columnBtn?.addEventListener('click', ()=>{ buildColumnModal(); openModal('system-column-modal'); });
	document.getElementById('system-column-close')?.addEventListener('click', ()=> closeModal('system-column-modal'));
	document.getElementById('system-column-selectall-btn')?.addEventListener('click', ()=>{
		visibleCols = new Set(dataCols);
		// Rebuild to reflect active styling consistently
		buildColumnModal();
	});
	document.getElementById('system-column-form')?.addEventListener('change', (e)=>{
		const cb = e.target.closest('input[type=checkbox]'); if(!cb) return;
		const col = cb.value; const label = cb.closest('label.column-checkbox');
		if(cb.checked){ visibleCols.add(col); label?.classList.add('is-active'); }
		else { visibleCols.delete(col); label?.classList.remove('is-active'); }
		saveColumnSelection();
	});
	document.getElementById('system-column-apply')?.addEventListener('click', ()=>{ saveColumnSelection(); applyColumnVisibility(); closeModal('system-column-modal'); });
	document.getElementById('system-column-reset')?.addEventListener('click', ()=>{ visibleCols = new Set(dataCols); saveColumnSelection(); buildColumnModal(); applyColumnVisibility(); });

	// ========== Stats modal logic ==========
	function countBy(arr, key, fixedOptions){
		return window.blsStats.countBy(arr, key, fixedOptions);
	}

	function renderStatBlock(containerId, title, dist, fixedOptions, opts){
		return window.blsStats.renderCard(containerId, title, dist, fixedOptions, opts);
	}

	function equalizeStatsHeights(){
		return window.blsStats.equalizeHeights('system-stats-modal');
	}

	function buildStats(){
		const ids = ['stats-overview','stats-kind','stats-priority','stats-task'];
		ids.forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=''; });

		const data = filtered.length ? filtered : rows;
		const total = data.length;

		// ── 총 개요: 전체 건수 + 기한 초과 + 평균 처리 기간 ──
		const now = new Date();
		let overdueCount = 0;
		let durationSum = 0; let durationN = 0;
		data.forEach(r=>{
			if(r.due){ try { if(new Date(r.due) < now) overdueCount++; } catch(_){} }
			if(r.created_at && r.done_at){
				try {
					const d = (new Date(r.done_at) - new Date(r.created_at)) / (1000*60*60*24);
					if(d >= 0){ durationSum += d; durationN++; }
				} catch(_){}
			}
		});
		const avgDays = durationN ? (durationSum / durationN) : 0;

		const overviewEl = document.getElementById('stats-overview');
		if(overviewEl){
			function summaryCard(title, items){
				const rows = items.map(([label,value])=> `<div class="stat-item"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(String(value))}</span></div>`).join('');
				return `<div class="stat-card"><div class="stat-title">${escapeHtml(title)}</div><div class="stat-items">${rows}</div></div>`;
			}
			overviewEl.insertAdjacentHTML('beforeend', summaryCard('전체 현황', [
				['완료 티켓 수', total+'건'],
				['기한 초과 건수', overdueCount+'건'],
				['평균 처리 기간', durationN ? avgDays.toFixed(1)+'일' : '-']
			]));
			// illustration card
			overviewEl.insertAdjacentHTML('beforeend', '<div class="stat-card stat-illustration-card" aria-hidden="true"><img src="/static/image/svg/list/free-sticker-analysis.svg" alt="" loading="lazy"></div>');
		}

		// ── 유형별 (kind) ──
		const kindFixed = ['장애','요청','변경','유지보수','감사','문제','작업','점검'];
		renderStatBlock('stats-kind', '유형', countBy(data,'kind',kindFixed), kindFixed, {hideZero:true, zeroNote:true});

		// ── 우선순위별 (priority) ──
		const priFixed = ['긴급','일반','낮음'];
		renderStatBlock('stats-priority', '우선순위', countBy(data,'priority',priFixed), priFixed);

		// ── 분류별 (task) - variable domain ──
		renderStatBlock('stats-task', '분류 (Top 5)', countBy(data,'task'));


	}

	statsBtn?.addEventListener('click', ()=>{
		buildStats();
		openModal('system-stats-modal');
		requestAnimationFrame(()=> equalizeStatsHeights());
		window.addEventListener('resize', equalizeStatsHeights);
	});
	const closeStats = ()=>{ closeModal('system-stats-modal'); window.removeEventListener('resize', equalizeStatsHeights); };
	document.getElementById('system-stats-close')?.addEventListener('click', closeStats);
	document.getElementById('system-stats-ok')?.addEventListener('click', closeStats);

	downloadBtn?.addEventListener('click', ()=> openModal('system-download-modal'));
	document.getElementById('system-download-close')?.addEventListener('click', ()=> closeModal('system-download-modal'));
	document.getElementById('system-download-confirm')?.addEventListener('click', ()=>{
		// Export CSV for currently filtered rows and visible columns
		const cols = headerCols.filter(c=> c==='actions' ? false : visibleCols.has(c));
		const headers = cols.map(c=> (document.querySelector(`#system-table thead th[data-col="${c}"]`)?.textContent||c).trim());
		const lines = [headers, ...filtered.map(r=> cols.map(c=> r[c]??''))]
			.map(arr=> arr.map(v=> '"'+String(v).replace(/"/g,'""')+'"').join(','));
		const bom='\uFEFF';
		const csv = bom + lines.join('\r\n');
		const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a'); a.href=url; a.download='tickets.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
		closeModal('system-download-modal');
	});

	// Search wiring
	const searchInput = document.getElementById('system-search');
	const searchClear = document.getElementById('system-search-clear');
	searchInput?.addEventListener('input', ()=> searchPipeline());
	searchInput?.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ searchInput.value=''; searchPipeline(); searchInput.blur(); } });
	searchClear?.addEventListener('click', ()=>{ if(searchInput){ searchInput.value=''; searchPipeline(); searchInput.focus(); } });

	// Select-all and row selection
	document.getElementById('system-select-all')?.addEventListener('change', (e)=>{
		const flag = e.target.checked; filtered.forEach(r=>{ if(flag) selected.add(String(r.id)); else selected.delete(String(r.id)); }); renderTable();
	});
	document.getElementById('system-table-body')?.addEventListener('click', (e)=>{
		const a = e.target.closest('a'); if(a) return; // links skip selection toggle
		const act = e.target.closest('.action-btn'); if(act) return; // action buttons skip
		const tr = e.target.closest('tr'); if(!tr) return;
		const id = tr.getAttribute('data-id'); if(!id) return;
		if(selected.has(id)) selected.delete(id); else selected.add(id);
		renderTable();
	});
	document.getElementById('system-table-body')?.addEventListener('change', (e)=>{
		const cb = e.target.closest('.system-row-select'); if(!cb) return;
		const id = cb.getAttribute('data-id'); if(!id) return;
		if(cb.checked) selected.add(id); else selected.delete(id);
		const tr = cb.closest('tr'); if(tr) tr.classList.toggle('selected', cb.checked);
		syncSelectAll();
	});

	const addModal = document.getElementById('wf-add-modal');

	// Edit modal elements
	const editModal = document.getElementById('system-edit-modal');
	const editClose = document.getElementById('system-edit-close');
	const editSave = document.getElementById('system-edit-save');
	const editForm = document.getElementById('system-edit-form');

	function openEditModal(row){
		if(!editModal || !editForm) return;
		const kindOptions = Object.keys(KIND_TASK_MAP).map(k=> `<option value="${k}" ${row.kind===k?'selected':''}>${k}</option>`).join('');
		const taskOptions = (KIND_TASK_MAP[row.kind]||[]).map(s=> `<option value="${s}" ${row.task===s?'selected':''}>${s}</option>`).join('');
		editForm.innerHTML = `
		<div class="form-section">
			<div class="form-grid">
				<div class="form-row form-row-wide">
					<label>제목<span class="required">*</span></label>
					<input name="title" class="form-input" required maxlength="100" value="${escapeHtml(row.title)}">
				</div>
				<div class="form-row">
					<label>유형</label>
					<select name="kind" id="edit-kind" class="form-input">
						<option value="">선택</option>${kindOptions}
					</select>
				</div>
				<div class="form-row">
					<label>분류</label>
					<select name="task" id="edit-task" class="form-input">
						<option value="">선택</option>${taskOptions}
					</select>
				</div>
				<div class="form-row">
					<label>우선순위<span class="required">*</span></label>
					<select name="priority" class="form-input" required>
						<option value="긴급" ${row.priority==='긴급'?'selected':''}>긴급</option>
						<option value="일반" ${row.priority==='일반'?'selected':''}>일반</option>
						<option value="낮음" ${row.priority==='낮음'?'selected':''}>낮음</option>
					</select>
				</div>
				<div class="form-row">
					<label>기한<span class="required">*</span></label>
					<input type="text" name="due" class="form-input date-input" value="${escapeHtml(row.due)}" placeholder="YYYY-MM-DD HH:mm" autocomplete="off">
				</div>
				<div class="form-row">
					<label>담당자</label>
					<input name="assignee" class="form-input" value="${escapeHtml(displayAssignee(row.assignee))}" readonly>
				</div>
				<div class="form-row">
					<label>대상</label>
					<input name="target" class="form-input" value="${escapeHtml(displayTarget(row.target))}" readonly>
				</div>
				<div class="form-row form-row-wide">
					<label>세부내용</label>
					<textarea name="detail" class="form-input textarea-large" rows="6">${escapeHtml(row.detail||'')}</textarea>
				</div>
			</div>
		</div>`;
		openModal('system-edit-modal');
		// Wire kind→task dependency in edit modal
		const eKind = editForm.querySelector('#edit-kind');
		const eTask = editForm.querySelector('#edit-task');
		if(eKind && eTask){
			eKind.addEventListener('change', ()=>{
				eTask.innerHTML = '<option value="">선택</option>';
				(KIND_TASK_MAP[eKind.value]||[]).forEach(s=>{ const o=document.createElement('option'); o.value=s; o.textContent=s; eTask.appendChild(o); });
			});
		}
		editForm.dataset.editId = String(row.id);
	}

	editClose?.addEventListener('click', ()=> closeModal('system-edit-modal'));
	editModal?.addEventListener('mousedown', (e)=>{ if(e.target===editModal) closeModal('system-edit-modal'); });
		editSave?.addEventListener('click', async ()=>{
		if(!editForm.reportValidity()) return;
		const id = editForm.dataset.editId;
		const fd = new FormData(editForm);
		const dueText = normalizeDueText(fd.get('due'));
		const apiPatch = { title: fd.get('title'), ticket_type: fd.get('kind'), category: fd.get('task'), priority: fd.get('priority'), due_at: dueText, detail: (fd.get('detail')||'').trim() };
		try {
			await fetch(API_BASE + '/' + id, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(apiPatch)});
		} catch(_){}
		await reloadRows();
		filtered = rows.slice();
		renderTable();
		closeModal('system-edit-modal');
	});

	// Delegate detail button click (replaces edit)
	document.getElementById('system-table-body')?.addEventListener('click', (e)=>{
		const btn = e.target.closest('button.action-btn[data-action="detail"]');
		if(!btn) return;
		const id = btn.getAttribute('data-id'); if(!id) return;
		const row = rows.find(r=> String(r.id)===id); if(!row) return;
		e.stopPropagation(); // prevent row selection toggle
		openDetailModal(row);
	});

	// Ticket title (plain text now) click -> detail modal (no anchor)
	document.getElementById('system-table-body')?.addEventListener('click', (e)=>{
		const titleEl = e.target.closest('.ticket-title[data-ticket-id]');
		if(!titleEl) return;
		const id = titleEl.getAttribute('data-ticket-id'); if(!id) return;
		const row = rows.find(r=> String(r.id)===id); if(!row) return;
		openDetailModal(row);
	});
	const closeBtn = document.getElementById('wf-add-close');
	const saveBtn = document.getElementById('wf-add-save');
	const form = document.getElementById('wf-add-form');

	function formatBytes(size){
		const n = Number(size);
		if (!Number.isFinite(n) || n < 0) return '';
		const units = ['B','KB','MB','GB','TB'];
		let v = n; let i = 0;
		while (v >= 1024 && i < units.length - 1){ v /= 1024; i++; }
		const digits = (v < 10 && i > 0) ? 1 : 0;
		return `${v.toFixed(digits)} ${units[i]}`;
	}

	function initAddAttachmentsUI(){
		if (!form) return;
		const input = form.querySelector('#wf-attachments');
		const drop = document.getElementById('wf-attachment-drop');
		const list = document.getElementById('wf-attachment-list');
		const clearBtn = document.getElementById('wf-attachment-clear');
		if (!input || !drop || !list || !clearBtn) return;

		const MAX_FILES = 10;
		function setFiles(nextFiles){
			const dt = new DataTransfer();
			(nextFiles || []).slice(0, MAX_FILES).forEach(f => dt.items.add(f));
			input.files = dt.files;
		}
		function render(){
			const files = [...(input.files || [])];
			list.innerHTML = '';
			if (!files.length){
				list.hidden = true;
				clearBtn.hidden = true;
				return;
			}
			list.hidden = false;
			clearBtn.hidden = false;
			files.forEach((f, idx) => {
				const li = document.createElement('li');
				li.className = 'attachment-item';
				const name = document.createElement('span');
				name.className = 'attachment-name';
				name.textContent = f.name || '파일';
				const size = document.createElement('span');
				size.className = 'attachment-size';
				size.textContent = formatBytes(f.size);
				const remove = document.createElement('button');
				remove.type = 'button';
				remove.className = 'attachment-remove';
				remove.setAttribute('data-idx', String(idx));
				remove.setAttribute('aria-label', '첨부파일 제거');
				remove.title = '제거';
				remove.textContent = '×';
				li.appendChild(name);
				li.appendChild(size);
				li.appendChild(remove);
				list.appendChild(li);
			});
		}

		input.addEventListener('change', render);
		clearBtn.addEventListener('click', () => { input.value = ''; render(); });
		list.addEventListener('click', (e) => {
			const btn = e.target && e.target.closest ? e.target.closest('.attachment-remove') : null;
			if (!btn) return;
			const idx = parseInt(btn.getAttribute('data-idx') || '', 10);
			const files = [...(input.files || [])];
			if (!Number.isFinite(idx) || idx < 0 || idx >= files.length) return;
			files.splice(idx, 1);
			setFiles(files);
			render();
		});

		function stop(e){ e.preventDefault(); e.stopPropagation(); }
		['dragenter','dragover'].forEach(ev => {
			drop.addEventListener(ev, (e) => { stop(e); drop.classList.add('is-dragover'); });
		});
		['dragleave','dragend','drop'].forEach(ev => {
			drop.addEventListener(ev, (e) => { stop(e); drop.classList.remove('is-dragover'); });
		});
		drop.addEventListener('drop', (e) => {
			const dt = e.dataTransfer;
			if (!dt || !dt.files || !dt.files.length) return;
			const existing = [...(input.files || [])];
			const incoming = [...dt.files];
			const merged = [...existing, ...incoming].slice(0, MAX_FILES);
			setFiles(merged);
			render();
		});
		render();
	}

	// Close button wiring
	if (closeBtn) closeBtn.addEventListener('click', () => closeModal('wf-add-modal'));

	// Click outside to close
	addModal?.addEventListener('mousedown', (e) => { if (e.target === addModal) closeModal('wf-add-modal'); });

	// 유형 → 분류 종속
	const kindSel = document.getElementById('wf-kind');
	if(kindSel) kindSel.addEventListener('change', function(){ syncTaskOptions(this.value); });

	// Flatpickr for 기한 field
	initDueFlatpickr();

	// 담당자/대상 pickers
	initTargetPicker();
	initAssigneePicker();

	initAddAttachmentsUI();

	// ── Save handler (API POST) ──
	saveBtn && saveBtn.addEventListener('click', async () => {
		if (!form) return;
		const titleInput = form.querySelector('input[name="title"]');
		const title = (titleInput ? titleInput.value : '').trim();
		if (!title){ showMessage('제목을 입력하세요.', '안내'); return; }
		const assigneeNames = wfAssigneeState.selected.map(o=> o.value);
		const fd = new FormData(form);
		const dueRaw = (fd.get('due')||'').toString().trim();
		if (!assigneeNames.length){ showMessage('담당자를 선택하세요.', '안내'); return; }
		if (!dueRaw){ showMessage('기한을 입력하세요.', '안내'); return; }
		const priority = (fd.get('priority')||'').toString();
		if (!priority){ showMessage('우선순위를 선택하세요.', '안내'); return; }
		// Build FormData for API
		const apiForm = new FormData();
		apiForm.set('title', title);
		apiForm.set('kind', (fd.get('kind')||'').toString());
		apiForm.set('task', (fd.get('task')||'').toString());
		apiForm.set('priority', priority);
		apiForm.set('due', normalizeDueText(dueRaw));
		apiForm.set('detail', (fd.get('detail')||'').toString().trim());
		apiForm.set('status', 'PENDING');
		apiForm.set('assignee_json', JSON.stringify(wfAssigneeState.selected));
		apiForm.set('target', JSON.stringify(wfTargetState.selected));
		var fileInput = form.querySelector('#wf-attachments');
		if(fileInput && fileInput.files){
			for(var fi=0; fi<fileInput.files.length; fi++) apiForm.append('attachments', fileInput.files[fi]);
		}
		try {
			var resp = await fetch(API_BASE, {method:'POST', body:apiForm});
			var json = await resp.json();
			if(!json.success){ showMessage(json.message || '티켓 생성에 실패했습니다.', '오류'); return; }
		} catch(e){ showMessage('서버 오류가 발생했습니다.', '오류'); return; }
		// Reload DONE view
		await reloadRows();
		filtered = rows.slice();
		form.reset(); resetTargetPicker(); resetAssigneePicker();
		closeModal('wf-add-modal');
		renderTable();
	});

	// Detail modal logic
	const detailModal = document.getElementById('wf-detail-modal');
	const detailClose1 = document.getElementById('wf-detail-close');
	const detailClose2 = document.getElementById('wf-detail-close2');
	function populateDetail(row){
		const put = (id, val)=>{ const el=document.getElementById(id); if(el) el.textContent = val==null||val===''? '-': String(val); };
		put('wf-d-title', row.title);
		put('wf-d-task', row.task);
		put('wf-d-requester', row.requester);
		// Priority with colored dot
		const priEl = document.getElementById('wf-d-priority');
		if(priEl){
			priEl.textContent = row.priority || '-';
			priEl.classList.remove('pri-\uAE34\uAE09','pri-\uC77C\uBC18','pri-\uB0AE\uC74C');
			if(row.priority) priEl.classList.add('pri-'+row.priority);
		}
		// Assignee (multi-tag)
		(function(){
			var el = document.getElementById('wf-d-assignee'); if(!el) return;
			el.innerHTML = '';
			var arr = Array.isArray(row.assignee) ? row.assignee : (typeof row.assignee==='string' && row.assignee ? [{value:row.assignee, display:row.assignee}] : []);
			if(!arr.length){ el.textContent='-'; return; }
			arr.forEach(function(o){
				var chip = document.createElement('span'); chip.className='wf-d-tag';
				chip.textContent = typeof o==='object' ? (o.display||o.value) : o;
				el.appendChild(chip);
			});
		})();
		// Target (multi-tag)
		(function(){
			var el = document.getElementById('wf-d-target'); if(!el) return;
			el.innerHTML = '';
			var arr = Array.isArray(row.target) ? row.target : (typeof row.target==='string' && row.target ? row.target.split(',') : []);
			if(!arr.length){ el.textContent='-'; return; }
			arr.forEach(function(v){
				var chip = document.createElement('span'); chip.className='wf-d-tag';
				if(typeof v==='object' && v!==null){
					var txt = v.work_name||v.value||'';
					if(v.system_name) txt += ' ('+v.system_name+')';
					chip.textContent = txt;
				} else {
					chip.textContent = String(v||'').trim();
				}
				el.appendChild(chip);
			});
		})();
		put('wf-d-status', displayStatus(row.status));
		put('wf-d-due', row.due);
		// Detail with bullet styling
		(function(){
			var host = document.getElementById('wf-d-detail');
			if(!host){ put('wf-d-detail', row.detail); return; }
			var raw = (row.detail||'').toString();
			host.textContent = '';
			var lines = raw.split(/\r?\n/);
			if(!lines.length){ host.textContent = '-'; return; }
			lines.forEach(function(line){
				var div = document.createElement('div');
				div.className = 'wf-line';
				var trimmed = line.replace(/^\s+/, '');
				var cls = '', content = trimmed;
				if(/^\*/.test(trimmed)){ cls='marker-star'; content=trimmed.replace(/^\*\s?/,''); }
				else if(/^\-/.test(trimmed)){ cls='marker-dash'; content=trimmed.replace(/^\-\s?/,''); }
				else if(/^※/.test(trimmed)){ cls='marker-note'; content=trimmed.replace(/^※\s?/,''); }
				if(cls) div.classList.add(cls);
				div.appendChild(document.createTextNode(content || '\u00A0'));
				host.appendChild(div);
			});
		})();
		// Attachments (file chips)
		var filesHost = document.getElementById('wf-d-files');
		var filesRow = document.getElementById('wf-d-files-row');
		if(filesHost && filesRow){
			filesHost.innerHTML = '';
			var files = Array.isArray(row.attachments) ? row.attachments : [];
			if(files.length){
				filesRow.style.display = '';
				var list = document.createElement('div'); list.className = 'wf-file-list';
				var human = function(size){
					if(typeof size !== 'number') return '';
					var units=['B','KB','MB','GB','TB'], s=size, i=0;
					while(s>=1024 && i<units.length-1){ s/=1024; i++; }
					return s.toFixed(s<10&&i>0?1:0)+' '+units[i];
				};
				files.forEach(function(f){
					var chip = document.createElement('span'); chip.className='wf-file-chip';
					var sizeTxt = f && typeof f.size==='number' ? ' ('+human(f.size)+')' : '';
					chip.textContent = ((f&&f.name)?f.name:'파일')+sizeTxt;
					list.appendChild(chip);
				});
				filesHost.appendChild(list);
			} else {
				filesRow.style.display = 'none';
			}
		}
	}
	function openDetailModal(row){ populateDetail(row); openModal('wf-detail-modal'); }
	function closeDetailModal(){ closeModal('wf-detail-modal'); }
	detailClose1?.addEventListener('click', closeDetailModal);
	detailClose2?.addEventListener('click', closeDetailModal);
	detailModal?.addEventListener('mousedown', (e)=>{ if(e.target===detailModal) closeDetailModal(); });

	// Escape key closes modals
	document.addEventListener('keydown', (e)=>{
		if(e.key==='Escape'){
			['system-delete-modal','system-message-modal','system-stats-modal','system-download-modal','system-column-modal','wf-add-modal','system-edit-modal','wf-detail-modal'].forEach(closeModal);
		}
	});
});

// Simple HTML escape helper
function escapeHtml(str){
	if(str==null) return '';
	return String(str)
		.replace(/&/g,'&amp;')
		.replace(/</g,'&lt;')
		.replace(/>/g,'&gt;')
		.replace(/"/g,'&quot;')
		.replace(/'/g,'&#39;');
}

