
(function() {
	const state = {
		data: [],
		page: 1,
		pageSize: 10,
		sortKey: 'task_name',
		sortDir: 'asc',
		filtered: [],
		search: '',
		started: new Set(),
		startTimes: new Map()
	};

	const selected = new Set();

	function pad(n){return n.toString().padStart(2,'0');}
	function dt(d){
		const y=d.getFullYear();
		const m=pad(d.getMonth()+1);
		const day=pad(d.getDate());
		const hh=pad(d.getHours());
		const mm=pad(d.getMinutes());
		return `${y}-${m}-${day} ${hh}:${mm}`;
	}
	function durationMin(mins){ return `${mins}분`; }

	function sampleData() {
		// Generate ~80 sample in-progress tasks with planned and actual times
		const names = ['상품처리','개발/테스트','스토리지 디스크 교체'];
		const categories = ['개발','인프라','보안','운영'];
		const owners = ['김민수','이지은','박서준','최유진','홍길동'];
		const vendors = ['내부','ABC솔루션','넥스트테크','인프라웍스'];
		const engineers = ['정우성','김하늘','수지','강동원','아이유'];
		const impacts = ['낮음','중간','높음'];
		const now = new Date();
		const arr = [];
		for (let i=1;i<=80;i++){
			const pStart = new Date(now.getTime() - (i%5)*3600*1000);
			const pDur = 60 + (i%4)*30; // minutes
			const pEnd = new Date(pStart.getTime() + pDur*60000);
			arr.push({
				id: i,
				task_name: `${names[i%names.length]} ${pad(i)}`,
				task_category: categories[i%categories.length],
				task_owner: owners[i%owners.length],
				task_vendor: vendors[i%vendors.length],
				engineer: engineers[i%engineers.length],
				p_start: dt(pStart),
				p_end: dt(pEnd),
				p_duration: durationMin(pDur),
				impact: impacts[i%impacts.length]
			});
		}
		return arr;
	}

	function cmp(a,b,key,dir){
		const va = (a[key]||'').toString();
		const vb = (b[key]||'').toString();
		if (va<vb) return dir==='asc'?-1:1;
		if (va>vb) return dir==='asc'?1:-1;
		return 0;
	}

	function renderPageNumbers(){
		const cont = document.getElementById('physical-page-numbers'); if (!cont) return;
		cont.innerHTML='';
		const totalPages = Math.max(1, Math.ceil(state.filtered.length/state.pageSize));
		for (let p=1;p<=totalPages;p++){
			const btn = document.createElement('button');
			btn.className = 'page-btn'+(p===state.page?' active':'');
			btn.textContent = p;
			btn.onclick = ()=>{ state.page=p; render(); };
			cont.appendChild(btn);
		}
		const first = document.getElementById('physical-first-page');
		const prev = document.getElementById('physical-prev-page');
		const next = document.getElementById('physical-next-page');
		const last = document.getElementById('physical-last-page');
		const tp = Math.max(1, Math.ceil(state.filtered.length/state.pageSize));
		first && (first.onclick = ()=>{ state.page=1; render(); });
		prev && (prev.onclick = ()=>{ state.page=Math.max(1,state.page-1); render(); });
		next && (next.onclick = ()=>{ state.page=Math.min(tp,state.page+1); render(); });
		last && (last.onclick = ()=>{ state.page=tp; render(); });
	}

	function render() {
		const tbody = document.getElementById('physical-table-body');
		if (!tbody) return;
		tbody.innerHTML = '';
		const start = (state.page-1)*state.pageSize;
		const pageItems = state.filtered.slice(start, start+state.pageSize);
		for (let i=0;i<pageItems.length;i++){
			const r = pageItems[i];
			const tr = document.createElement('tr');
			const started = state.started.has(r.id);
			tr.innerHTML = `
				<td data-col-key="select"><input type="checkbox" data-id="${r.id}"></td>
				<td data-col-key="task_name">${r.task_name}</td>
				<td data-col-key="task_category">${r.task_category}</td>
				<td data-col-key="task_owner">${r.task_owner}</td>
				<td data-col-key="p_start">${r.p_start}</td>
				<td data-col-key="p_end">${r.p_end}</td>
				<td data-col-key="p_duration">${r.p_duration}</td>
				<td data-col-key="impact">${r.impact}</td>
				<td data-col-key="actions" class="actions">
				  <button class="action-btn" title="수정" onclick="openServerEditModal(${start+i})">
				    <img src="/static/image/svg/edit.svg" alt="수정" class="action-icon">
				  </button>
				  <button class="action-btn" title="삭제" onclick="window.__taskDelete(${r.id})">
				    <img src="/static/image/svg/delete.svg" alt="삭제" class="action-icon">
				  </button>
				  <button class="action-btn" title="${started ? '중지' : '시작'}" onclick="window.__taskToggleStart(${r.id})">
				    ${started
				      ? '<svg class="action-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'
				      : '<svg class="action-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8 5v14l11-7-11-7z"/></svg>'}
				  </button>
				  <button class="action-btn" title="완료" onclick="window.__taskComplete(${r.id})">
				    <img src="/static/image/svg/select_check_box.svg" alt="완료" class="action-icon">
				  </button>
				</td>`;
			tbody.appendChild(tr);
		}
		const info = document.getElementById('physical-pagination-info');
		if (info){
			const total = state.filtered.length;
			const from = total ? start+1 : 0;
			const to = Math.min(start+pageItems.length, total);
			info.textContent = `${from}-${to} / ${total}개 항목`;
		}
		renderPageNumbers();
		const cnt = document.getElementById('physical-count');
		if (cnt) cnt.textContent = state.filtered.length;
	}

	function sort(key){
		if (state.sortKey===key){ state.sortDir = state.sortDir==='asc'?'desc':'asc'; }
		else { state.sortKey=key; state.sortDir='asc'; }
		state.filtered.sort((a,b)=>cmp(a,b,state.sortKey,state.sortDir));
		state.page=1; render();
	}
	function filter(){
		const q = document.getElementById('physical-search')?.value.trim().toLowerCase() || '';
		state.search = q;
		if (!q){ state.filtered = state.data.slice(); }
		else {
			state.filtered = state.data.filter(r=>Object.values(r).some(v=>String(v).toLowerCase().includes(q)));
		}
		state.page=1; render();
	}
	function changePageSize(){
		const sel = document.getElementById('physical-page-size');
		if (sel){ state.pageSize = parseInt(sel.value,10)||10; state.page=1; render(); }
	}

	// Actions
	function findIndexById(id){ return state.data.findIndex(x=>x.id===id); }
	function removeById(id){
		const idx = findIndexById(id);
		if (idx>=0){ state.data.splice(idx,1); }
		const fidx = state.filtered.findIndex(x=>x.id===id);
		if (fidx>=0){ state.filtered.splice(fidx,1); }
	}
	function toggleStart(id){
		if (state.started.has(id)){
			state.started.delete(id);
			state.startTimes.delete(id);
		} else {
			state.started.add(id);
			if (!state.startTimes.has(id)) state.startTimes.set(id, new Date());
		}
		render();
	}
	function completeTask(id){
		const rec = state.data.find(x=>x.id===id);
		if (!rec) return;
		const aStart = state.startTimes.get(id) || new Date();
		const aEnd = new Date();
		const aDurMin = Math.max(0, Math.round((aEnd - aStart)/60000));
		const completed = {
			id: `p-${id}-${Date.now()}`,
			task_name: rec.task_name,
			task_category: rec.task_category,
			task_owner: rec.task_owner,
			a_start: dt(aStart),
			a_end: dt(aEnd),
			a_duration: durationMin(aDurMin),
			impact: rec.impact,
			__persist: true,
			__pid: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`
		};
		// persist to localStorage
		try{
			const key='completed_tasks';
			const arr = JSON.parse(localStorage.getItem(key) || '[]');
			arr.push(completed);
			localStorage.setItem(key, JSON.stringify(arr));
		}catch(e){ /* ignore */ }
		// remove from current list and re-render
		state.started.delete(id);
		state.startTimes.delete(id);
		removeById(id);
		render();
	}
	function deleteTask(id){
		state.started.delete(id);
		state.startTimes.delete(id);
		removeById(id);
		render();
	}

	// expose
	window.__taskToggleStart = toggleStart;
	window.__taskComplete = completeTask;
	window.__taskDelete = deleteTask;

	// Expose hooks
	window.sortServerTable = function(_tab, key){ sort(key); };
	window.changeServerPageSize = function(){ changePageSize(); };
	window.clearSearch = function(){ const i=document.getElementById('physical-search'); if(i){i.value='';} filter(); };
	window.toggleServerSelectAll = function(){
		const all = document.querySelectorAll('#physical-table tbody input[type="checkbox"][data-id]');
		const master = document.getElementById('physical-select-all');
		all.forEach(cb=>{ cb.checked = master?.checked || false; });
	};
	window.downloadServerCSV = function(){
		const headers = ['작업이름','작업분류','작업담당자','(예상)시작시간','(예상)종료시간','(예상)소요시간','작업영향도'];
		const keys = ['task_name','task_category','task_owner','p_start','p_end','p_duration','impact'];
		const rows = state.filtered.map(r=>keys.map(k=>`"${String(r[k]??'').replaceAll('"','""')}"`).join(','));
		const csv = [headers.join(','), ...rows].join('\n');
		const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a'); a.href=url; a.download='tasks_in_progress.csv'; a.click(); URL.revokeObjectURL(url);
	};

	// Add/Edit modal minimal wiring using existing IDs
	function openAdd(){ const m=document.getElementById('server-add-modal'); if(m){ document.body.classList.add('modal-open'); m.classList.add('show'); m.style.display='flex'; } }
	function closeAdd(){ const m=document.getElementById('server-add-modal'); if(m){ m.classList.remove('show'); m.style.display='none'; document.body.classList.remove('modal-open'); } }
	window.openServerAddModal = openAdd;
	window.closeServerAddModal = closeAdd;
	window.nextBackupAddStep = function(){};
	window.backBackupAddStep = function(){};
	window.completeBackupAdd = function(){ closeAdd(); };

	// Edit modal
	function openEdit(){ const m=document.getElementById('server-edit-modal'); if(m){ document.body.classList.add('modal-open'); m.classList.add('show'); m.style.display='flex'; } }
	function closeEdit(){ const m=document.getElementById('server-edit-modal'); if(m){ m.classList.remove('show'); m.style.display='none'; document.body.classList.remove('modal-open'); } }
	window.openServerEditModal = function(){ openEdit(); };
	window.closeServerEditModal = closeEdit;
	window.nextBackupEditStep = function(){};
	window.backBackupEditStep = function(){};
	window.saveBackupEdit = function(){ closeEdit(); };

	document.addEventListener('DOMContentLoaded', function() {
		state.data = sampleData();
		state.filtered = state.data.slice();
		render();
		const search = document.getElementById('physical-search');
		if (search){
			const clearBtn = document.getElementById('physical-search-clear');
			search.addEventListener('input', ()=>{ if(clearBtn) clearBtn.style.display = search.value ? 'inline-flex':'none'; filter(); });
		}
	});
})();
