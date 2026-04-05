(function(){
	const state = { data: [], page: 1, pageSize: 10, sortKey: 'task_name', sortDir: 'asc', filtered: [] };

	function pad(n){return n.toString().padStart(2,'0');}
	function dt(d){ const y=d.getFullYear(); const m=pad(d.getMonth()+1); const day=pad(d.getDate()); const hh=pad(d.getHours()); const mm=pad(d.getMinutes()); return `${y}-${m}-${day} ${hh}:${mm}`; }
	function durationMin(mins){ return `${mins}분`; }

	function sampleData(){
		const categories = ['개발','인프라','보안','운영'];
		const names = ['상품처리','개발/테스트','스토리지 디스크 교체'];
		const owners = ['김민수','이지은','박서준','최유진','홍길동'];
		const vendors = ['내부','ABC솔루션','넥스트테크','인프라웍스'];
		const engineers = ['정우성','김하늘','수지','강동원','아이유'];
		const impacts = ['낮음','중간','높음'];
		const base = new Date();
		const arr=[];
		for(let i=1;i<=60;i++){
			const pStart = new Date(base.getTime() + i*60*60000);
			const pDur = 30 + (i%5)*30;
			const pEnd = new Date(pStart.getTime() + pDur*60000);
			arr.push({
				id:i,
				task_name:`${names[i%names.length]} ${pad(i)}`,
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

	function cmp(a,b,key,dir){ const va=(a[key]||'').toString(); const vb=(b[key]||'').toString(); if(va<vb) return dir==='asc'?-1:1; if(va>vb) return dir==='asc'?1:-1; return 0; }

	function renderPageNumbers(){
		const cont=document.getElementById('physical-page-numbers'); if(!cont) return;
		cont.innerHTML='';
		const tp=Math.max(1,Math.ceil(state.filtered.length/state.pageSize));
		for(let p=1;p<=tp;p++){ const b=document.createElement('button'); b.className='page-btn'+(p===state.page?' active':''); b.textContent=p; b.onclick=()=>{state.page=p; render();}; cont.appendChild(b);}    
		const first=document.getElementById('physical-first-page');
		const prev=document.getElementById('physical-prev-page');
		const next=document.getElementById('physical-next-page');
		const last=document.getElementById('physical-last-page');
		first && (first.onclick=()=>{state.page=1; render();});
		prev && (prev.onclick=()=>{state.page=Math.max(1,state.page-1); render();});
		next && (next.onclick=()=>{const t=Math.max(1,Math.ceil(state.filtered.length/state.pageSize)); state.page=Math.min(t,state.page+1); render();});
		last && (last.onclick=()=>{state.page=Math.max(1,Math.ceil(state.filtered.length/state.pageSize)); render();});
	}

	function render(){
		const tbody=document.getElementById('physical-table-body'); if(!tbody) return;
		tbody.innerHTML='';
		const start=(state.page-1)*state.pageSize;
		const items=state.filtered.slice(start,start+state.pageSize);
		for(const r of items){
			const tr=document.createElement('tr');
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
				  <button class="action-btn" title="수정" onclick="openServerEditModal()">
				    <img src="/static/image/svg/edit.svg" alt="수정" class="action-icon">
				  </button>
				  <button class="action-btn" title="삭제" onclick="window.__planDelete(${r.id})">
				    <img src="/static/image/svg/delete.svg" alt="삭제" class="action-icon">
				  </button>
				  <button class="action-btn" title="시작" onclick="window.__planStart(${r.id})">
				    <svg class="action-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8 5v14l11-7-11-7z"/></svg>
				  </button>
				  <button class="action-btn" title="완료" onclick="window.__planComplete(${r.id})">
				    <img src="/static/image/svg/select_check_box.svg" alt="완료" class="action-icon">
				  </button>
				</td>`;
			tbody.appendChild(tr);
		}
		const info=document.getElementById('physical-pagination-info');
		if(info){ const total=state.filtered.length; const from=total?start+1:0; const to=Math.min(start+items.length,total); info.textContent=`${from}-${to} / ${total}개 항목`; }
		const cnt=document.getElementById('physical-count'); if(cnt) cnt.textContent=state.filtered.length;
		renderPageNumbers();
	}

	function filter(){
		const q=document.getElementById('physical-search')?.value.trim().toLowerCase()||'';
		state.filtered = q? state.data.filter(r=>Object.values(r).some(v=>String(v).toLowerCase().includes(q))) : state.data.slice();
		state.page=1; render();
	}
	function changePageSize(){ const sel=document.getElementById('physical-page-size'); if(sel){ state.pageSize=parseInt(sel.value,10)||10; state.page=1; render(); } }
	function sort(key){ if(state.sortKey===key){state.sortDir=state.sortDir==='asc'?'desc':'asc';} else {state.sortKey=key; state.sortDir='asc';} state.filtered.sort((a,b)=>cmp(a,b,state.sortKey,state.sortDir)); state.page=1; render(); }
	function downloadCSV(){
		const headers=['작업이름','작업분류','작업담당자','(예상)시작시간','(예상)종료시간','(예상)소요시간','작업영향도'];
		const keys=['task_name','task_category','task_owner','p_start','p_end','p_duration','impact'];
		const rows=state.filtered.map(r=>keys.map(k=>`"${String(r[k]??'').replaceAll('"','""')}"`).join(','));
		const csv=[headers.join(','),...rows].join('\n');
		const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
		const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='tasks_planned.csv'; a.click(); URL.revokeObjectURL(url);
	}

	function findIndexById(id){ return state.data.findIndex(x=>x.id===id); }
	function removeById(id){
		const i=findIndexById(id);
		if(i>=0) state.data.splice(i,1);
		const fi=state.filtered.findIndex(x=>x.id===id);
		if(fi>=0) state.filtered.splice(fi,1);
	}
	function startTask(id){
		// No runtime timer for plan, just mark started by moving into 진행중 local storage if needed
		try{
			const key='inprogress_tasks';
			const rec = state.data.find(x=>x.id===id);
			if(!rec) return;
			const arr=JSON.parse(localStorage.getItem(key)||'[]');
			arr.push({ ...rec, __from:'plan', __ts: Date.now() });
			localStorage.setItem(key, JSON.stringify(arr));
		}catch(e){}
	}
	function completeTask(id){
		const rec = state.data.find(x=>x.id===id);
		if(!rec) return;
		const aStart = new Date();
		const aEnd = new Date();
		const completed={
			id:`pl-${id}-${Date.now()}`,
			task_name: rec.task_name,
			task_category: rec.task_category,
			task_owner: rec.task_owner,
			a_start: dt(aStart),
			a_end: dt(aEnd),
			a_duration: durationMin(0),
			impact: rec.impact
		};
		try{
			const key='completed_tasks';
			const arr=JSON.parse(localStorage.getItem(key)||'[]');
			arr.push(completed);
			localStorage.setItem(key, JSON.stringify(arr));
		}catch(e){}
		removeById(id);
		render();
	}
	function deleteTask(id){ removeById(id); render(); }

	window.__planDelete = deleteTask;
	window.__planStart = startTask;
	window.__planComplete = completeTask;

	window.sortServerTable=function(_tab,key){ sort(key); };
	window.changeServerPageSize=function(){ changePageSize(); };
	window.clearSearch=function(){ const i=document.getElementById('physical-search'); if(i){ i.value=''; } filter(); };
	window.toggleServerSelectAll=function(){ const all=document.querySelectorAll('#physical-table tbody input[type="checkbox"][data-id]'); const m=document.getElementById('physical-select-all'); all.forEach(cb=> cb.checked = m?.checked || false); };
	window.downloadServerCSV=function(){ downloadCSV(); };

	// Minimal modal wiring
	window.openServerAddModal=function(){ const m=document.getElementById('server-add-modal'); if(m){ document.body.classList.add('modal-open'); m.style.display='flex'; m.classList.add('show'); }};
	window.closeServerAddModal=function(){ const m=document.getElementById('server-add-modal'); if(m){ m.classList.remove('show'); m.style.display='none'; document.body.classList.remove('modal-open'); }};
	window.nextBackupAddStep=function(){}; window.backBackupAddStep=function(){}; window.completeBackupAdd=function(){ window.closeServerAddModal(); };
	window.openServerEditModal=function(){ const m=document.getElementById('server-edit-modal'); if(m){ document.body.classList.add('modal-open'); m.style.display='flex'; m.classList.add('show'); }};
	window.closeServerEditModal=function(){ const m=document.getElementById('server-edit-modal'); if(m){ m.classList.remove('show'); m.style.display='none'; document.body.classList.remove('modal-open'); }};
	window.nextBackupEditStep=function(){}; window.backBackupEditStep=function(){}; window.saveBackupEdit=function(){ window.closeServerEditModal(); };

	document.addEventListener('DOMContentLoaded',()=>{
		state.data=sampleData();
		state.filtered=state.data.slice();
		state.filtered.sort((a,b)=>cmp(a,b,state.sortKey,state.sortDir));
		render();
		const s=document.getElementById('physical-search'); if(s){ const c=document.getElementById('physical-search-clear'); s.addEventListener('input',()=>{ if(c) c.style.display = s.value ? 'inline-flex':'none'; filter(); }); }
	});
})();
