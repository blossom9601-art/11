// Access Rights: derive view from systems (place/location/zone)
(function(){
	const SYSTEMS_KEY = 'access:systems';
	const state = { rows: [], filtered: [], page: 1, pageSize: 10, sortKey: 'place', sortDir: 'asc', search: '' };

	function loadSystems(){ try { return JSON.parse(localStorage.getItem(SYSTEMS_KEY)||'[]'); } catch(_) { return []; } }
	function buildRows(sys){ return sys.map(s => ({ place: s.place||'', location: s.location||'', zone: s.zone||'', task_name: s.task_name||'', vendor: s.vendor||'', auth: s.auth||'' })); }
	function by(a,b,key,dir){ const av=(a[key]||'').toString().toLowerCase(); const bv=(b[key]||'').toString().toLowerCase(); if(av<bv) return dir==='asc'?-1:1; if(av>bv) return dir==='asc'?1:-1; return 0; }

	function filter(){
		const term = state.search.trim().toLowerCase();
		state.filtered = state.rows.filter(r => !term || Object.values(r).some(v => (v||'').toString().toLowerCase().includes(term)));
		state.filtered.sort((a,b)=>by(a,b,state.sortKey,state.sortDir));
		state.page = 1; render();
	}

	function paginate(rows){ const s=(state.page-1)*state.pageSize; return rows.slice(s, s+state.pageSize); }

	function render(){
		const tbody = document.getElementById('physical-table-body'); if(!tbody) return;
		const rows = paginate(state.filtered);
		const start = (state.page-1)*state.pageSize;
		tbody.innerHTML = rows.map((r,i)=>{
		  const idx = start + i;
		  return `
		  <tr>
			<td data-col-key="select"><input type="checkbox"></td>
			<td data-col-key="place">${escapeHtml(r.place)}</td>
			<td data-col-key="location">${escapeHtml(r.location)}</td>
			<td data-col-key="zone">${escapeHtml(r.zone)}</td>
			<td data-col-key="task_name">${escapeHtml(r.task_name)}</td>
			<td data-col-key="vendor">${escapeHtml(r.vendor)}</td>
			<td data-col-key="auth">${escapeHtml(r.auth)}</td>
			<td data-col-key="actions">
				<button class="action-btn" title="시스템에서 편집" onclick="openRightsInSystems(${idx})"><img src="/static/image/svg/edit.svg" class="action-icon"/></button>
				<button class="action-btn" title="시스템으로 이동" onclick="openRightsInSystems(${idx})"><img src="/static/image/svg/launch.svg" class="action-icon" onerror="this.src='/static/image/svg/open_in_new.svg'"/></button>
			</td>
		  </tr>`;
		}).join('');
		const cnt = document.getElementById('physical-count'); if(cnt) cnt.textContent = String(state.filtered.length);
		const first = state.filtered.length ? (state.page-1)*state.pageSize + 1 : 0;
		const last = Math.min(state.page*state.pageSize, state.filtered.length);
		const info = document.getElementById('physical-pagination-info'); if(info) info.textContent = `${first}-${last} / ${state.filtered.length}개 항목`;
		renderPageNumbers();

		// wire pagination controls
		const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
		const firstBtn = document.getElementById('physical-first-page');
		const prevBtn = document.getElementById('physical-prev-page');
		const nextBtn = document.getElementById('physical-next-page');
		const lastBtn = document.getElementById('physical-last-page');
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
		const c = document.getElementById('physical-page-numbers'); if(!c) return;
		c.innerHTML = '';
		for(let i=1;i<=pages;i++){
			const b = document.createElement('button'); b.className='page-btn'+(i===state.page?' active':''); b.textContent=String(i); b.addEventListener('click',()=>{ state.page=i; render(); }); c.appendChild(b);
		}
	}

	function escapeHtml(s){ return (s??'').toString().replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

	// Exposed hooks
	window.sortServerTable = function(tab, key){ if(tab!=='physical') return; if(state.sortKey===key){ state.sortDir = state.sortDir==='asc'?'desc':'asc'; } else { state.sortKey=key; state.sortDir='asc'; } filter(); };
	window.changeServerPageSize = function(){ const sel=document.getElementById('physical-page-size'); state.pageSize=parseInt(sel.value||'10',10); state.page=1; render(); };
	window.clearSearch = function(){ const ipt=document.getElementById('physical-search'); if(ipt){ ipt.value=''; } state.search=''; filter(); };
	window.toggleServerSelectAll = function(){ const all=document.getElementById('physical-select-all'); const tbody=document.getElementById('physical-table-body'); if(!tbody) return; tbody.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.checked=all.checked); };
	window.downloadServerCSV = function(){
		const headers=['시스템 장소','시스템 위치','시스템 구역','업무 이름','시스템 제조사','시스템 인증방식'];
		const keys=['place','location','zone','task_name','vendor','auth'];
		const csv=[headers.join(',')].concat(state.filtered.map(r=>keys.map(k=>`"${(r[k]||'').toString().replace(/"/g,'""')}"`).join(','))).join('\r\n');
		const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='access_rights.csv'; a.click(); URL.revokeObjectURL(a.href);
	};
	window.openServerAddModal = function(){}; window.closeServerAddModal=function(){}; window.openServerEditModal=function(){}; window.closeServerEditModal=function(){}; window.openServerStatsModal=function(){}; window.closeServerStatsModal=function(){};
	window.goToPage = function(n){ state.page=n; render(); };

	window.openRightsInSystems = function(index){
		const r = state.filtered[index]; if(!r) return;
		const q = [r.place, r.location, r.zone, r.task_name, r.vendor, r.auth].filter(Boolean).join(' ');
		const url = `/app/templates/6.datacenter/6-1.access/6-1-5.access_system.html?q=${encodeURIComponent(q)}`;
		window.location.href = url;
	};

	document.addEventListener('DOMContentLoaded', function(){
		state.rows = buildRows(loadSystems());
		const ipt = document.getElementById('physical-search');
		const clearBtn = document.getElementById('physical-search-clear');
		if(ipt){
			ipt.addEventListener('input', ()=>{ state.search=ipt.value||''; if (clearBtn) clearBtn.style.display = state.search ? 'inline-flex' : 'none'; filter(); });
			if (clearBtn) clearBtn.style.display = ipt.value ? 'inline-flex' : 'none';
		}
		filter();
	});
})();

	// Column-select chip helpers (no-ops if modal not present)
	window.toggleColumnCheckbox = function(el) {
		const input = el.querySelector('input[type="checkbox"]');
		if (!input) return;
		input.checked = !input.checked;
		el.classList.toggle('selected', input.checked);
	};

	function syncColumnChipSelected() {
		const nodes = document.querySelectorAll('#server-column-select-modal .column-checkbox');
		nodes.forEach(node => {
			const input = node.querySelector('input[type="checkbox"]');
			node.classList.toggle('selected', !!(input && input.checked));
		});
	}

	// Delegate clicks to chips, matching server modal interaction
	document.addEventListener('DOMContentLoaded', function() {
		const modal = document.getElementById('server-column-select-modal');
		if (!modal) return;
		modal.addEventListener('click', function(e) {
			const node = e.target.closest('.column-checkbox');
			if (!node) return;
			// avoid double toggling when clicking the native checkbox
			if (e.target && e.target.matches('input[type="checkbox"]')) return;
			e.preventDefault();
			window.toggleColumnCheckbox(node);
		});

		// Also sync visual state when checkbox value changes (fallback for label/default toggles)
		modal.addEventListener('change', function(e) {
			if (!e.target || !e.target.matches('input[type="checkbox"]')) return;
			const chip = e.target.closest('.column-checkbox');
			if (chip) chip.classList.toggle('selected', !!e.target.checked);
		});
	});

	// Column selection modal: keep all columns visible; provide minimal UX stubs
	window.openServerColumnSelectModal = function(){
		const modal = document.getElementById('server-column-select-modal');
		if (!modal) return;
		syncColumnChipSelected();
		document.body.classList.add('modal-open');
		modal.style.display = 'flex';
		modal.classList.add('show');
	};
	window.closeServerColumnSelectModal = function(){
		const modal = document.getElementById('server-column-select-modal');
		if (!modal) return;
		modal.classList.remove('show');
		modal.style.display = 'none';
		document.body.classList.remove('modal-open');
	};
	window.applyServerColumnSelection = function(){
		// No column toggling on Rights page; columns are fixed
		window.closeServerColumnSelectModal();
	};
	window.resetServerColumnSelection = function(){
		const cbs = document.querySelectorAll('#server-column-select-modal input[type="checkbox"]');
		cbs.forEach(cb => { cb.checked = false; });
		syncColumnChipSelected();
	};
