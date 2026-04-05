(function(){
	const state = { data: [], filtered: [], page: 1, pageSize: 10, sortKey: 'task_name', sortDir: 'asc' };

	function pad(n){ return n.toString().padStart(2,'0'); }
	function fmt(dt){ const y=dt.getFullYear(); const m=pad(dt.getMonth()+1); const d=pad(dt.getDate()); const hh=pad(dt.getHours()); const mm=pad(dt.getMinutes()); return `${y}-${m}-${d} ${hh}:${mm}`; }
	function dur(mins){ return `${mins}분`; }

	function sampleData(){
		const categories = ['개발','인프라','보안','운영'];
		const names = ['상품처리','개발/테스트','스토리지 디스크 교체'];
		const owners = ['김민수','이지은','박서준','최유진','홍길동'];
		const vendors = ['내부','ABC솔루션','넥스트테크','인프라웍스'];
		const engineers = ['정우성','김하늘','수지','강동원','아이유'];
		const impacts = ['낮음','중간','높음'];
		const base = new Date();
		const rows=[];
		for(let i=1;i<=80;i++){
			const pStart = new Date(base.getTime() - i*90*60000);
			const pDur = 30 + (i%5)*30; // 30,60,90,120,150
			const pEnd = new Date(pStart.getTime() + pDur*60000);
			const aStart = new Date(pStart.getTime() + ((i%3)-1)*10*60000); // -10,0,+10
			const aDur = pDur + ((i%4)-2)*5; // -10,-5,+0,+5
			const aEnd = new Date(aStart.getTime() + aDur*60000);
			rows.push({
				id: i,
				task_name: `${names[i%names.length]} ${pad(i)}`,
				task_category: categories[i%categories.length],
				task_owner: owners[i%owners.length],
				task_vendor: vendors[i%vendors.length],
				engineer: engineers[i%engineers.length],
				p_start: fmt(pStart),
				p_end: fmt(pEnd),
				p_duration: dur(pDur),
				a_start: fmt(aStart),
				a_end: fmt(aEnd),
				a_duration: dur(aDur),
				impact: impacts[i%impacts.length]
			});
		}
		return rows;
	}

	function cmp(a,b,key,dir){ const va=(a[key]??'').toString(); const vb=(b[key]??'').toString(); if(va<vb) return dir==='asc'?-1:1; if(va>vb) return dir==='asc'?1:-1; return 0; }

	function renderPageNumbers(){
		const cont = document.getElementById('physical-page-numbers'); if(!cont) return;
		cont.innerHTML='';
		const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
		for(let p=1;p<=totalPages;p++){
			const b=document.createElement('button');
			b.className='page-btn'+(p===state.page?' active':'');
			b.textContent=String(p);
			b.onclick=()=>{ state.page=p; render(); };
			cont.appendChild(b);
		}
		const first=document.getElementById('physical-first-page');
		const prev=document.getElementById('physical-prev-page');
		const next=document.getElementById('physical-next-page');
		const last=document.getElementById('physical-last-page');
		first && (first.onclick=()=>{ state.page=1; render(); });
		prev && (prev.onclick=()=>{ state.page=Math.max(1,state.page-1); render(); });
		next && (next.onclick=()=>{ state.page=Math.min(totalPages,state.page+1); render(); });
		last && (last.onclick=()=>{ state.page=totalPages; render(); });
	}

	function render(){
		const tbody=document.getElementById('physical-table-body'); if(!tbody) return;
		tbody.innerHTML='';
		const start=(state.page-1)*state.pageSize;
		const items=state.filtered.slice(start,start+state.pageSize);
		for(const r of items){
			const tr=document.createElement('tr');
			tr.innerHTML=`
				<td data-col-key="select"><input type="checkbox" data-id="${r.id}"></td>
				<td data-col-key="task_name">${r.task_name}</td>
				<td data-col-key="task_category">${r.task_category}</td>
				<td data-col-key="task_owner">${r.task_owner}</td>
				<td data-col-key="a_start">${r.a_start}</td>
				<td data-col-key="a_end">${r.a_end}</td>
				<td data-col-key="a_duration">${r.a_duration}</td>
				<td data-col-key="impact">${r.impact}</td>
				<td data-col-key="actions"><button class="action-btn" title="수정" onclick="openServerEditModal()"><img src="/static/image/svg/edit.svg" alt="수정" class="action-icon"></button></td>`;
			tbody.appendChild(tr);
		}
		const info=document.getElementById('physical-pagination-info');
		if(info){ const total=state.filtered.length; const from=total?start+1:0; const to=Math.min(start+items.length,total); info.textContent=`${from}-${to} / ${total}개 항목`; }
		const cnt=document.getElementById('physical-count'); if(cnt) cnt.textContent=state.filtered.length;
		renderPageNumbers();
	}

	function applyFilter(){
		const q=(document.getElementById('physical-search')?.value||'').trim().toLowerCase();
		state.filtered = q ? state.data.filter(r=>Object.values(r).some(v=>String(v).toLowerCase().includes(q))) : state.data.slice();
		state.page=1; render();
	}

	function changePageSize(){ const sel=document.getElementById('physical-page-size'); if(sel){ state.pageSize=parseInt(sel.value,10)||10; state.page=1; render(); } }
	function sort(key){ if(state.sortKey===key){ state.sortDir=state.sortDir==='asc'?'desc':'asc'; } else { state.sortKey=key; state.sortDir='asc'; } state.filtered.sort((a,b)=>cmp(a,b,state.sortKey,state.sortDir)); state.page=1; render(); }
	function downloadCSV(){
		const headers=['작업이름','작업분류','작업담당자','(실제)시작시간','(실제)종료시간','(실제)소요시간','작업영향도'];
		const keys=['task_name','task_category','task_owner','a_start','a_end','a_duration','impact'];
		const lines = state.filtered.map(r=> keys.map(k=>`"${String(r[k]??'').replaceAll('"','""')}"`).join(','));
		const csv=[headers.join(','), ...lines].join('\n');
		const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
		const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='tasks_completed.csv'; a.click(); URL.revokeObjectURL(url);
	}

	// window hooks used by HTML
	window.sortServerTable = function(_tab,key){ sort(key); };
	window.changeServerPageSize = function(){ changePageSize(); };
	window.clearSearch = function(){ const i=document.getElementById('physical-search'); if(i){ i.value=''; } applyFilter(); };
	window.toggleServerSelectAll = function(){ const all=document.querySelectorAll('#physical-table tbody input[type="checkbox"][data-id]'); const m=document.getElementById('physical-select-all'); all.forEach(cb=> cb.checked = m?.checked || false); };
	window.downloadServerCSV = function(){ downloadCSV(); };

	// Minimal modals
	window.openServerAddModal=function(){ const m=document.getElementById('server-add-modal'); if(m){ document.body.classList.add('modal-open'); m.style.display='flex'; m.classList.add('show'); }};
	window.closeServerAddModal=function(){ const m=document.getElementById('server-add-modal'); if(m){ m.classList.remove('show'); m.style.display='none'; document.body.classList.remove('modal-open'); }};
	window.completeBackupAdd=function(){ window.closeServerAddModal(); };
	window.nextBackupAddStep=function(){}; window.backBackupAddStep=function(){};
	window.openServerEditModal=function(){ const m=document.getElementById('server-edit-modal'); if(m){ document.body.classList.add('modal-open'); m.style.display='flex'; m.classList.add('show'); }};
	window.closeServerEditModal=function(){ const m=document.getElementById('server-edit-modal'); if(m){ m.classList.remove('show'); m.style.display='none'; document.body.classList.remove('modal-open'); }};
	window.nextBackupEditStep=function(){}; window.backBackupEditStep=function(){}; window.saveBackupEdit=function(){ window.closeServerEditModal(); };

	document.addEventListener('DOMContentLoaded',()=>{
		state.data = sampleData();
		try{
			const key='completed_tasks';
			const extras = JSON.parse(localStorage.getItem(key)||'[]');
			if (Array.isArray(extras) && extras.length){
				// keep only the expected fields
				const sanitized = extras.map(x=>({
					id: x.id || `ext-${Date.now()}`,
					task_name: x.task_name,
					task_category: x.task_category,
					task_owner: x.task_owner,
					a_start: x.a_start,
					a_end: x.a_end,
					a_duration: x.a_duration,
					impact: x.impact
				}));
				state.data = sanitized.concat(state.data);
			}
		}catch(e){}
		state.filtered = state.data.slice();
		state.filtered.sort((a,b)=>cmp(a,b,state.sortKey,state.sortDir));
		render();
		const s=document.getElementById('physical-search'); if(s){ const c=document.getElementById('physical-search-clear'); s.addEventListener('input',()=>{ if(c) c.style.display = s.value ? 'inline-flex':'none'; applyFilter(); }); }
	});
})();
