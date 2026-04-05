// Access Systems page logic: data store, table rendering, CRUD
(function(){
	const KEY = 'access:systems';
	const state = { data: [], filtered: [], page: 1, pageSize: 10, sortKey: 'task_name', sortDir: 'asc', search: '' };
	const selected = new Set();

	function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(_) { return []; } }
	function save(arr) { try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch(_) {} }

	function seedIfEmpty() {
		const cur = load();
		if (cur.length) return;
		const demo = [
			{ task_name: '상면 비상문', vendor: 'Hikvision', model: 'DS-K1T', serial: 'HV-001', place: '퓨처센터', location: '서관5층', zone: '비상문', ip: '10.1.1.10', auth: '카드' },
			{ task_name: '출입 게이트 A', vendor: 'Suprema', model: 'XPass2', serial: 'SP-100', place: '퓨처센터', location: '서관5층', zone: '게이트', ip: '10.1.1.11', auth: '카드/얼굴' },
			{ task_name: '서버실 문서보관실', vendor: 'Samsung', model: 'EZON', serial: 'SS-200', place: '퓨처센터', location: '서관5층', zone: '문서보관', ip: '10.1.1.12', auth: '비밀번호' }
		];
		save(demo);
	}

	function by(a,b,key,dir){ const av=(a[key]||'').toString().toLowerCase(); const bv=(b[key]||'').toString().toLowerCase(); if(av<bv) return dir==='asc'?-1:1; if(av>bv) return dir==='asc'?1:-1; return 0; }

	function applyFilter(){
		const term = state.search.trim().toLowerCase();
		const list = state.data.filter(r => !term || Object.values(r).some(v => (v||'').toString().toLowerCase().includes(term)));
		state.filtered = list.sort((a,b)=>by(a,b,state.sortKey,state.sortDir));
		state.page = 1;
		render();
	}

	function paginate(rows){ const start=(state.page-1)*state.pageSize; return rows.slice(start, start+state.pageSize); }

	function render(){
		const tbody = document.getElementById('systems-table-body'); if(!tbody) return;
		const pageRows = paginate(state.filtered);
		tbody.innerHTML = pageRows.map((r,i)=>{
			const idx = (state.page-1)*state.pageSize + i;
			return `<tr>
				<td data-col-key="select"><input type="checkbox" data-index="${idx}" class="row-select"></td>
				<td data-col-key="task_name">${escapeHtml(r.task_name)}</td>
				<td data-col-key="vendor">${escapeHtml(r.vendor)}</td>
				<td data-col-key="model">${escapeHtml(r.model)}</td>
				<td data-col-key="serial">${escapeHtml(r.serial)}</td>
				<td data-col-key="place">${escapeHtml(r.place)}</td>
				<td data-col-key="location">${escapeHtml(r.location)}</td>
				<td data-col-key="zone">${escapeHtml(r.zone)}</td>
				<td data-col-key="ip">${escapeHtml(r.ip)}</td>
				<td data-col-key="auth">${escapeHtml(r.auth)}</td>
				<td data-col-key="actions">
					<button class="action-btn" title="편집" onclick="populateEditModal(${idx})"><img src="/static/image/svg/edit.svg" class="action-icon"/></button>
					<button class="action-btn" title="삭제" onclick="deleteSystem(${idx})"><img src="/static/image/svg/delete.svg" class="action-icon"/></button>
				</td>
			</tr>`;}).join('');
		// count
		const countEl = document.getElementById('systems-count'); if(countEl) countEl.textContent = String(state.filtered.length);
		// pagination info
		const first = state.filtered.length ? (state.page-1)*state.pageSize + 1 : 0;
		const last = Math.min(state.page*state.pageSize, state.filtered.length);
		const info = document.getElementById('systems-pagination-info'); if(info) info.textContent = `${first}-${last} / ${state.filtered.length}개 항목`;
		renderPageNumbers();
		// wire pagination buttons
		const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
		const firstBtn = document.getElementById('systems-first-page');
		const prevBtn = document.getElementById('systems-prev-page');
		const nextBtn = document.getElementById('systems-next-page');
		const lastBtn = document.getElementById('systems-last-page');
		if (firstBtn && prevBtn && nextBtn && lastBtn) {
			firstBtn.disabled = state.page === 1;
			prevBtn.disabled = state.page === 1;
			nextBtn.disabled = state.page === totalPages;
			lastBtn.disabled = state.page === totalPages;
			firstBtn.onclick = () => { state.page = 1; render(); };
			prevBtn.onclick = () => { if (state.page > 1) { state.page--; render(); } };
			nextBtn.onclick = () => { if (state.page < totalPages) { state.page++; render(); } };
			lastBtn.onclick = () => { state.page = totalPages; render(); };
		}
	}

	function renderPageNumbers(){
		const pages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
		const box = document.getElementById('systems-page-numbers'); if(!box) return;
		box.innerHTML = '';
		for(let i=1;i<=pages;i++){
			const btn = document.createElement('button');
			btn.className = 'page-btn' + (i===state.page?' active':'');
			btn.textContent = String(i);
			btn.addEventListener('click', ()=>{ state.page=i; render(); });
			box.appendChild(btn);
		}
	}

	function escapeHtml(s){ return (s??'').toString().replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

	function toCSV(rows){
		const headers = ['업무 이름','시스템 제조사','시스템 모델명','시스템 일련번호','시스템 장소','시스템 위치','시스템 구역','시스템 IP','시스템 인증방식'];
		const keys    = ['task_name','vendor','model','serial','place','location','zone','ip','auth'];
		const lines = [headers.join(',')].concat(rows.map(r=>keys.map(k=>`"${(r[k]||'').toString().replace(/"/g,'""')}"`).join(',')));
		return lines.join('\r\n');
	}

	function downloadCSV(){
		const csv = toCSV(state.filtered);
		const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8;'});
		const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'access_systems.csv'; a.click(); URL.revokeObjectURL(a.href);
	}

	// Exposed hooks (reuse common naming)
	window.sortServerTable = function(tab, key){ if(tab!=='systems') return; if(state.sortKey===key){ state.sortDir = state.sortDir==='asc'?'desc':'asc'; } else { state.sortKey=key; state.sortDir='asc'; } applyFilter(); };
	window.changeServerPageSize = function(tab){ if(tab!=='systems') return; const sel=document.getElementById('systems-page-size'); state.pageSize=parseInt(sel.value||'10',10); state.page=1; render(); };
	window.clearSearch = function(tab){ if(tab!=='systems') return; const ipt=document.getElementById('systems-search'); if(ipt){ ipt.value=''; } state.search=''; applyFilter(); };
	window.toggleServerSelectAll = function(tab){ if(tab!=='systems') return; const all=document.getElementById('systems-select-all'); const tbody=document.getElementById('systems-table-body'); if(!tbody) return; tbody.querySelectorAll('.row-select').forEach(cb=>{ cb.checked = all.checked; const idx = parseInt(cb.getAttribute('data-index')||'-1',10); if(all.checked) selected.add(idx); else selected.delete(idx); }); };
	window.downloadServerCSV = function(tab){ if(tab!=='systems') return; downloadCSV(); };

	window.openServerAddModal = function(){ document.getElementById('server-add-modal').style.display='block'; };
	window.closeServerAddModal = function(){ document.getElementById('server-add-modal').style.display='none'; };
	window.openServerEditModal = function(){ document.getElementById('server-edit-modal').style.display='block'; };
	window.closeServerEditModal = function(){ document.getElementById('server-edit-modal').style.display='none'; };

	window.completeSystemAdd = function(){
		const r = {
			task_name: document.getElementById('add-task-name').value.trim(),
			vendor: document.getElementById('add-vendor').value.trim(),
			model: document.getElementById('add-model').value.trim(),
			serial: document.getElementById('add-serial').value.trim(),
			place: document.getElementById('add-place').value.trim(),
			location: document.getElementById('add-location').value.trim(),
			zone: document.getElementById('add-zone').value.trim(),
			ip: document.getElementById('add-ip').value.trim(),
			auth: document.getElementById('add-auth').value.trim()
		};
		state.data.push(r); save(state.data); applyFilter(); window.closeServerAddModal();
	};

	window.populateEditModal = function(index){
		const r = state.filtered[index]; if(!r) return;
		const globalIndex = state.data.indexOf(r);
		document.getElementById('edit-index').value = String(globalIndex);
		document.getElementById('edit-task-name').value = r.task_name||'';
		document.getElementById('edit-vendor').value = r.vendor||'';
		document.getElementById('edit-model').value = r.model||'';
		document.getElementById('edit-serial').value = r.serial||'';
		document.getElementById('edit-place').value = r.place||'';
		document.getElementById('edit-location').value = r.location||'';
		document.getElementById('edit-zone').value = r.zone||'';
		document.getElementById('edit-ip').value = r.ip||'';
		document.getElementById('edit-auth').value = r.auth||'';
		window.openServerEditModal();
	};

	window.saveSystemEdit = function(){
		const idx = parseInt(document.getElementById('edit-index').value||'-1',10);
		if(idx<0 || idx>=state.data.length) return;
		const r = state.data[idx];
		r.task_name = document.getElementById('edit-task-name').value.trim();
		r.vendor = document.getElementById('edit-vendor').value.trim();
		r.model = document.getElementById('edit-model').value.trim();
		r.serial = document.getElementById('edit-serial').value.trim();
		r.place = document.getElementById('edit-place').value.trim();
		r.location = document.getElementById('edit-location').value.trim();
		r.zone = document.getElementById('edit-zone').value.trim();
		r.ip = document.getElementById('edit-ip').value.trim();
		r.auth = document.getElementById('edit-auth').value.trim();
		save(state.data); applyFilter(); window.closeServerEditModal();
	};

	window.deleteSystem = function(index){
		const r = state.filtered[index]; if(!r) return; const globalIndex = state.data.indexOf(r); if(globalIndex>=0){ state.data.splice(globalIndex,1); save(state.data); applyFilter(); }
	};

	document.addEventListener('DOMContentLoaded', function(){
		seedIfEmpty();
		state.data = load();
		const ipt = document.getElementById('systems-search');
		const clearBtn = document.getElementById('systems-search-clear');
		if(ipt){
			// prefill from ?q=
			const params = new URLSearchParams(window.location.search);
			const q = params.get('q') || '';
			if (q) { ipt.value = q; state.search = q; }
			if (clearBtn) clearBtn.style.display = ipt.value ? 'inline-flex' : 'none';
			ipt.addEventListener('input', ()=>{ state.search = ipt.value||''; if (clearBtn) clearBtn.style.display = state.search ? 'inline-flex' : 'none'; applyFilter(); });
		}
		applyFilter();
	});
})();
