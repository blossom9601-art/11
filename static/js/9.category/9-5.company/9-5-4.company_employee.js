// 회사 > 직원: dataset, table render, pagination, CSV (scoped to main content)
(function(){
	const state = { data: [], page: 1, pageSize: 10, sortKey: 'name', sortDir: 'asc', filtered: [], search: '' };
	const selected = new Set();

	function root(){ return document.querySelector('main.main-content') || document; }
	function q(sel){ const r=root(); return r? r.querySelector(sel):null; }
	function qa(sel){ const r=root(); return r? r.querySelectorAll(sel):[]; }

	function sampleData(){
		const depts=['인프라팀','플랫폼팀','보안팀','네트워크팀','데이터팀','클라우드팀','개발1팀','개발2팀','QA팀','운영팀','헬프데스크','PMO'];
		const names=['김민수','이서연','박지훈','최유진','정현우','한지민','조은서','신재욱','문다은','오상혁','강민지','배성호'];
		return names.map((n,i)=>({ name:n, dept: depts[i%depts.length], hw: (i%7)+1, sw: (i%5)+2 }));
	}
	function by(a,b,k,d){ const av=a[k], bv=b[k]; if(av===bv) return 0; const r=av>bv?1:-1; return d==='asc'?r:-r; }
	function render(){
		const s=(state.page-1)*state.pageSize, e=s+state.pageSize, rows=state.filtered.slice(s,e);
		const tbody=q('#physical-table-body'); if(!tbody) return;
		tbody.innerHTML=rows.map((r,i)=>{ const idx=s+i; const ck=selected.has(idx)?'checked':''; return `
			<tr data-index="${idx}" class="${selected.has(idx)?'selected':''}">
				<td><input type="checkbox" class="row-select" ${ck}></td>
				<td>${r.name||''}</td>
				<td>${r.dept||''}</td>
				<td>${r.hw??0}</td>
				<td>${r.sw??0}</td>
				<td>
					<button class="action-btn" title="수정" onclick="openServerEditModal(${idx})"><img src="/static/image/svg/edit.svg" class="action-icon" alt="수정"></button>
					<button class="action-btn" title="삭제" onclick="deleteSoftware(${idx})"><img src="/static/image/svg/delete.svg" class="action-icon" alt="삭제"></button>
				</td>
			</tr>`; }).join('');
		Array.from(tbody.querySelectorAll('tr')).forEach(tr=>{ const idx=Number(tr.getAttribute('data-index')); const cb=tr.querySelector('.row-select'); if(!cb) return; cb.addEventListener('change',()=>{ if(cb.checked) selected.add(idx); else selected.delete(idx); tr.classList.toggle('selected', cb.checked); updateSelectAllState(); }); tr.addEventListener('click',(e)=>{ if(e.target.closest('input,button,a')) return; cb.checked=!cb.checked; cb.dispatchEvent(new Event('change')); }); });
		const c=q('#physical-count'); if(c) c.textContent=state.filtered.length;
		const info=q('#physical-pagination-info'); if(info){ const total=state.filtered.length; const from=total? s+1:0; const to=Math.min(e,total); info.textContent=`${from}-${to} / ${total}개 항목`; }
		renderPages();
		updateSelectAllState();
	}
	function updateSelectAllState(){ const s=(state.page-1)*state.pageSize, e=Math.min(s+state.pageSize,state.filtered.length); let sel=0, total=0; for(let i=s;i<e;i++){ total++; if(selected.has(i)) sel++; } const all=q('#physical-select-all'); if(!all) return; if(sel===0){ all.indeterminate=false; all.checked=false; } else if(sel===total){ all.indeterminate=false; all.checked=true; } else { all.indeterminate=true; } }
	function sort(k){ if(state.sortKey===k) state.sortDir=state.sortDir==='asc'?'desc':'asc'; else { state.sortKey=k; state.sortDir='asc'; } state.filtered.sort((a,b)=>by(a,b,state.sortKey,state.sortDir)); render(); }
	function filter(){ const qy=state.search.trim().toLowerCase(); state.filtered = qy? state.data.filter(r=>[r.name,r.dept].some(v=>String(v||'').toLowerCase().includes(qy))) : [...state.data]; state.page=1; state.filtered.sort((a,b)=>by(a,b,state.sortKey,state.sortDir)); render(); }
	function renderPages(){ const totalPages=Math.max(1, Math.ceil(state.filtered.length/state.pageSize)); const c=q('#physical-page-numbers'); if(!c) return; c.innerHTML=Array.from({length:totalPages},(_,i)=>`<button class="page-btn${i+1===state.page?' active':''}" onclick="goToPage(${i+1})">${i+1}</button>`).join(''); const f=q('#physical-first-page'), p=q('#physical-prev-page'), n=q('#physical-next-page'), l=q('#physical-last-page'); if(f&&p&&n&&l){ f.onclick=()=>goToPage(1); p.onclick=()=>goToPage(Math.max(1,state.page-1)); n.onclick=()=>goToPage(Math.min(totalPages,state.page+1)); l.onclick=()=>goToPage(totalPages); } }
	function toCSV(rows){ const headers=['직원 이름','부서 이름','하드웨어','소프트웨어']; const body=rows.map(r=>[r.name||'',r.dept||'',r.hw??0,r.sw??0]); return [headers,...body].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n'); }

	window.sortServerTable=function(_t,k){ sort(k); };
	window.changeServerPageSize=function(){ const sel=q('#physical-page-size'); if(!sel) return; state.pageSize=Number(sel.value)||10; state.page=1; render(); };
	window.clearSearch=function(){ const i=q('#physical-search'); if(!i) return; i.value=''; state.search=''; const x=q('#physical-search-clear'); if(x) x.style.display='none'; filter(); };
	window.toggleServerSelectAll=function(){ const all=q('#physical-select-all'); if(!all) return; const s=(state.page-1)*state.pageSize, e=Math.min(s+state.pageSize,state.filtered.length); for(let i=s;i<e;i++){ all.checked?selected.add(i):selected.delete(i);} render(); };
	window.downloadServerCSV=function(){ const csv=toCSV(state.filtered); const blob=new Blob(["\ufeff"+csv],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); const d=new Date(); const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); a.href=url; a.download=`회사_직원_${y}${m}${dd}.csv`; a.click(); URL.revokeObjectURL(url); };
	window.openServerAddModal=function(){}; window.closeServerAddModal=function(){}; window.openServerEditModal=function(){}; window.closeServerEditModal=function(){}; window.openServerStatsModal=function(){}; window.closeServerStatsModal=function(){};
	window.goToPage=function(n){ state.page=n; render(); };
	window.completeSoftwareAdd=function(){}; window.populateEditModal=function(){}; window.saveSoftwareEdit=function(){};
	window.deleteSoftware=function(index){ const row=state.filtered[index]; if(!row) return; const abs=state.data.indexOf(row); if(abs>=0) state.data.splice(abs,1); filter(); };

	document.addEventListener('DOMContentLoaded', function(){ const i=q('#physical-search'); if(i) i.addEventListener('input',()=>{ state.search=i.value; const x=q('#physical-search-clear'); if(x) x.style.display=i.value?'inline-flex':'none'; filter(); }); state.data=sampleData(); state.filtered=[...state.data]; state.filtered.sort((a,b)=>by(a,b,state.sortKey,state.sortDir)); render(); });
})();

	function syncColumnChipSelected() { /* no-op */ }

	// Delegate clicks to chips, matching server modal interaction
	document.addEventListener('DOMContentLoaded', function() { /* no-op for column modal */ });
