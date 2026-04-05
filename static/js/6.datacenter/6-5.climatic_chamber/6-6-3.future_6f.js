
// RACK 관리 - 퓨처센터(5층): 데이터셋, 렌더, 정렬/검색/페이징, CSV 내보내기
(function() {
	const NUM_ROWS = 52;
	const numericKeys = new Set(['height_u','device_count']);
	const state = { data: [], filtered: [], page: 1, pageSize: 10, sortKey: 'rack_name', sortDir: 'asc', search: '' };
	const selected = new Set();

	function sampleData() {
		const statuses = ['운영','대기','점검','장애'];
		// 할당 상면 샘플 (A~F열 + 01~20번)
		const vendors = ['Dell','HPE','IBM','Cisco','Lenovo'];
		const models = ['42U','45U','48U','NetShelter','Rack-Std'];
		const rows = ['A','B','C','D','E','F'];
		const arr = [];
		for (let i = 1; i <= NUM_ROWS; i++) {
			arr.push({
				rack_name: `FC5F-R${String(i).padStart(2,'0')}`,
				rack_business: `${rows[(i-1) % rows.length]}열-${String(((i-1) % 20) + 1).padStart(2,'0')}번`,
				rack_vendor: vendors[i % vendors.length],
				rack_model: models[i % models.length],
				status: statuses[i % statuses.length],
				height_u: [42,45,48][i % 3],
				device_count: (i * 3) % 40 + 1,
				power_panel: `PP-${(i % 6) + 1}`
			});
		}
		return arr;
	}

	function cmp(a, b, key, dir) {
		let av = a[key];
		let bv = b[key];
		if (numericKeys.has(key)) { av = Number(av) || 0; bv = Number(bv) || 0; }
		else { av = String(av ?? ''); bv = String(bv ?? ''); }
		const r = av > bv ? 1 : (av < bv ? -1 : 0);
		return dir === 'asc' ? r : -r;
	}

	function render() {
		const start = (state.page - 1) * state.pageSize;
		const end = Math.min(start + state.pageSize, state.filtered.length);
		const rows = state.filtered.slice(start, end);
		const tbody = document.getElementById('physical-table-body');
		if (!tbody) return;
		tbody.innerHTML = rows.map((row, i) => {
			const idx = start + i;
			return `
				<tr data-index="${idx}" class="${selected.has(idx) ? 'selected' : ''}">
					<td><input type="checkbox" data-index="${idx}" ${selected.has(idx)?'checked':''}></td>
					<td data-col-key="rack_name">${row.rack_name}</td>
					<td data-col-key="rack_business">${row.rack_business}</td>
					<td data-col-key="rack_vendor">${row.rack_vendor}</td>
					<td data-col-key="rack_model">${row.rack_model}</td>
					<td data-col-key="status">${row.status}</td>
					<td data-col-key="height_u">${row.height_u}</td>
					<td data-col-key="device_count">${row.device_count}</td>
					<td data-col-key="power_panel">${row.power_panel}</td>
					<td data-col-key="actions">
						<button class="action-btn" title="편집"><img src="/static/image/svg/edit.svg" class="action-icon" alt="편집"></button>
						<button class="action-btn" title="삭제"><img src="/static/image/svg/delete.svg" class="action-icon" alt="삭제"></button>
					</td>
				</tr>
			`;
		}).join('');

		// checkbox handlers
		tbody.querySelectorAll('input[type="checkbox"]').forEach(cb => {
			cb.addEventListener('change', (e) => {
				const idx = parseInt(e.target.getAttribute('data-index'), 10);
				if (e.target.checked) selected.add(idx); else selected.delete(idx);
				updateSelectAllState();
				const tr = e.target.closest('tr');
				if (tr) tr.classList.toggle('selected', e.target.checked);
			});
		});
		// row click select toggle
		tbody.querySelectorAll('tr').forEach(tr => {
			const idx = parseInt(tr.getAttribute('data-index'), 10);
			tr.addEventListener('click', (e) => {
				if (e.target.closest('button')) return;
				const will = !selected.has(idx);
				if (will) selected.add(idx); else selected.delete(idx);
				tr.classList.toggle('selected', will);
				const cb = tr.querySelector('input[type="checkbox"]');
				if (cb) cb.checked = will;
				updateSelectAllState();
			});
		});

		// pagination text
		const info = document.getElementById('physical-pagination-info');
		if (info) {
			const total = state.filtered.length;
			const from = total ? start + 1 : 0;
			info.textContent = `${from}-${end} / ${total}개 항목`;
		}

		renderPageNumbers();

		const badge = document.getElementById('physical-count');
		if (badge) badge.textContent = state.filtered.length;
	}

	function renderPageNumbers() {
		const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
		const c = document.getElementById('physical-page-numbers');
		if (!c) return;
		c.innerHTML = Array.from({length: totalPages}, (_, i) => {
			const p = i + 1; return `<button class="page-btn ${p===state.page?'active':''}" data-page="${p}">${p}</button>`;
		}).join('');
		c.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
			state.page = parseInt(btn.getAttribute('data-page'), 10);
			render();
		}));
		const first = document.getElementById('physical-first-page');
		const prev = document.getElementById('physical-prev-page');
		const next = document.getElementById('physical-next-page');
		const last = document.getElementById('physical-last-page');
		if (first) first.onclick = () => { state.page = 1; render(); };
		if (prev) prev.onclick = () => { state.page = Math.max(1, state.page - 1); render(); };
		if (next) next.onclick = () => { state.page = Math.min(totalPages, state.page + 1); render(); };
		if (last) last.onclick = () => { state.page = totalPages; render(); };
		updateSelectAllState();
	}

	function updateSelectAllState() {
		const selAll = document.getElementById('physical-select-all');
		if (!selAll) return;
		const start = (state.page - 1) * state.pageSize;
		const end = Math.min(start + state.pageSize, state.filtered.length);
		let checked = 0, total = 0;
		for (let i = start; i < end; i++) { total++; if (selected.has(i)) checked++; }
		selAll.indeterminate = checked > 0 && checked < total;
		selAll.checked = total > 0 && checked === total;
	}

	function applySort() {
		state.filtered.sort((a,b)=>cmp(a,b,state.sortKey,state.sortDir));
	}

	function applyFilter() {
		const q = state.search.trim().toLowerCase();
		state.filtered = q ? state.data.filter(r =>
			['rack_name','rack_business','rack_vendor','rack_model','status','power_panel']
				.some(k => String(r[k]??'').toLowerCase().includes(q))
			|| String(r.height_u).includes(q) || String(r.device_count).includes(q)
		) : state.data.slice();
		state.page = 1; applySort(); render();
	}

	// Expose hooks
	window.sortServerTable = function(_tab, key) {
		if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
		else { state.sortKey = key; state.sortDir = 'asc'; }
		applySort(); render();
	};
	window.changeServerPageSize = function() {
		const sel = document.getElementById('physical-page-size');
		state.pageSize = parseInt(sel?.value || '10', 10) || 10;
		state.page = 1; render();
	};
	window.clearSearch = function() {
		const input = document.getElementById('physical-search');
		if (input) input.value = '';
		const clearBtn = document.getElementById('physical-search-clear');
		if (clearBtn) clearBtn.style.display = 'none';
		state.search = ''; applyFilter();
	};
	window.toggleServerSelectAll = function() {
		const selAll = document.getElementById('physical-select-all');
		const start = (state.page - 1) * state.pageSize;
		const end = Math.min(start + state.pageSize, state.filtered.length);
		for (let i = start; i < end; i++) { if (selAll.checked) selected.add(i); else selected.delete(i); }
		render();
	};
	window.downloadServerCSV = function() {
		const headers = ['RACK 이름','할당 상면','제조사','모델','상태','높이','장치수','분전반'];
		const rows = state.filtered.map(r => [r.rack_name, r.rack_business, r.rack_vendor, r.rack_model, r.status, r.height_u, r.device_count, r.power_panel]);
		const bom = '\uFEFF'; // UTF-8 BOM for Excel Korean
		const csv = [headers.join(','), ...rows.map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(','))].join('\r\n');
		const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
		const d = new Date();
		const y = d.getFullYear();
		const m = String(d.getMonth()+1).padStart(2,'0');
		const dd = String(d.getDate()).padStart(2,'0');
		const fname = `퓨처센터5층_rack_${y}${m}${dd}.csv`;
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a'); a.href = url; a.download = fname; a.click(); URL.revokeObjectURL(url);
	};

	// Stats rendering and modal (UNIX-style with Chart.js)
	function openStats() {
		const m = document.getElementById('physical-stats-modal'); if (!m) return;
		const countBy = (key) => {
			const mp = new Map();
			state.filtered.forEach(r => mp.set(r[key], (mp.get(r[key])||0)+1));
			return Array.from(mp.entries()).sort((a,b)=>b[1]-a[1]);
		};
		const labelsAndValues = (key) => {
			const kv = countBy(key);
			return { labels: kv.map(([k])=>String(k??'')), values: kv.map(([,v])=>v) };
		};
		window.__rackCharts = window.__rackCharts || [];
		window.__rackCharts.forEach(ch => { try { ch.destroy(); } catch(_){} });
		window.__rackCharts = [];
		const colors = ['#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f','#edc949','#af7aa1','#ff9da7','#9c755f','#bab0ab'];
		function makePie(canvasId, labels, values, countId, legendId) {
			const total = values.reduce((a,b)=>a+b,0);
			const countEl = document.getElementById(countId); if (countEl) countEl.textContent = `${total}개`;
			const ctx = document.getElementById(canvasId)?.getContext('2d'); if (!ctx) return;
			const chart = new Chart(ctx, { type:'pie', data:{ labels, datasets:[{ data: values, backgroundColor: labels.map((_,i)=>colors[i%colors.length]) }] }, options:{ plugins:{ legend:{ display:false } }, responsive:true, maintainAspectRatio:false } });
			window.__rackCharts.push(chart);
			const legend = document.getElementById(legendId);
			if (legend) legend.innerHTML = labels.map((l,i)=>{ const c=colors[i%colors.length]; const v=values[i]; return `<span class="legend-item" style="display:inline-flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:2px;background:${c};display:inline-block;"></span>${l} (${v})</span>`; }).join('');
		}
		function makeBar(canvasId, labels, values, countId, legendId) {
			const total = values.reduce((a,b)=>a+b,0);
			const countEl = document.getElementById(countId); if (countEl) countEl.textContent = `${total}개`;
			const ctx = document.getElementById(canvasId)?.getContext('2d'); if (!ctx) return;
			const chart = new Chart(ctx, { type:'bar', data:{ labels, datasets:[{ data: values, backgroundColor: labels.map((_,i)=>colors[i%colors.length]) }] }, options:{ plugins:{ legend:{ display:false } }, responsive:true, maintainAspectRatio:false, scales:{ x:{ beginAtZero:true }, y:{ beginAtZero:true, ticks:{ precision:0 } } } } });
			window.__rackCharts.push(chart);
			const legend = document.getElementById(legendId);
			if (legend) legend.innerHTML = labels.map((l,i)=>{ const c=colors[i%colors.length]; const v=values[i]; return `<span class=\"legend-item\" style=\"display:inline-flex;align-items:center;gap:6px;\"><span style=\"width:10px;height:10px;border-radius:2px;background:${c};display:inline-block;\"></span>${l} (${v})</span>`; }).join('');
		}
		const v = labelsAndValues('rack_vendor');
		makePie('physical-stats-vendor-chart', v.labels, v.values, 'physical-stats-vendor-count', 'physical-stats-vendor-legend');
		const mvals = labelsAndValues('rack_model');
		makePie('physical-stats-model-chart', mvals.labels, mvals.values, 'physical-stats-model-count', 'physical-stats-model-legend');
		const svals = labelsAndValues('status');
		makeBar('physical-stats-status-chart', svals.labels, svals.values, 'physical-stats-status-count', 'physical-stats-status-legend');
		m.style.display = 'flex'; m.classList.add('show'); document.body.classList.add('modal-open');
		const close = document.getElementById('physical-close-stats'); if (close) close.onclick = () => { m.classList.remove('show'); m.style.display='none'; document.body.classList.remove('modal-open'); };
	}

	// Add/Edit modal
	function openEdit(mode, index) {
		const m = document.getElementById('physical-edit-modal');
		const title = document.getElementById('physical-edit-title');
		const f = (id)=>document.getElementById('physical-f-'+id);
		if (!m || !title) return;
		title.textContent = mode === 'add' ? 'RACK 등록' : 'RACK 수정';
		if (mode === 'edit' && typeof index === 'number') {
			const row = state.filtered[index];
			if (row) {
				f('rack_name').value = row.rack_name;
				f('rack_business').value = row.rack_business;
				f('rack_vendor').value = row.rack_vendor;
				f('rack_model').value = row.rack_model;
				f('status').value = row.status;
				f('height_u').value = row.height_u;
				f('device_count').value = row.device_count;
				f('power_panel').value = row.power_panel;
				m.setAttribute('data-edit-index', String(index));
			}
		} else {
			['rack_name','rack_business','rack_vendor','rack_model','status','height_u','device_count','power_panel']
				.forEach(k => f(k).value = '');
			m.removeAttribute('data-edit-index');
		}
		m.style.display = 'flex'; m.classList.add('show'); document.body.classList.add('modal-open');
		const closeBtn = document.getElementById('physical-close-edit');
		const saveBtn = document.getElementById('physical-edit-save');
		if (saveBtn) saveBtn.textContent = (mode === 'add') ? '등록' : '저장';
		function close(){ m.classList.remove('show'); m.style.display='none'; document.body.classList.remove('modal-open'); }
		if (closeBtn) closeBtn.onclick = close;
		if (saveBtn) saveBtn.onclick = () => {
			const newRow = {
				rack_name: f('rack_name').value.trim(),
				rack_business: f('rack_business').value.trim(),
				rack_vendor: f('rack_vendor').value.trim(),
				rack_model: f('rack_model').value.trim(),
				status: f('status').value.trim(),
				height_u: Number(f('height_u').value)||0,
				device_count: Number(f('device_count').value)||0,
				power_panel: f('power_panel').value.trim(),
			};
			const editIdxAttr = m.getAttribute('data-edit-index');
			if (editIdxAttr !== null) {
				// find original index in state.data
				const rowInFiltered = state.filtered[Number(editIdxAttr)];
				const origIdx = state.data.indexOf(rowInFiltered);
				if (origIdx >= 0) state.data[origIdx] = newRow;
			} else {
				state.data.push(newRow);
			}
			state.filtered = state.data.slice();
			applySort();
			render();
			close();
		};
	}

	// Attach buttons and row action hooks after DOM ready
	function wireExtras() {
		const sbtn = document.getElementById('physical-open-stats'); if (sbtn) sbtn.onclick = openStats;
		const abtn = document.getElementById('physical-open-add'); if (abtn) abtn.onclick = () => openEdit('add');
		// delegate edit/delete in table
		const tbody = document.getElementById('physical-table-body');
		if (tbody) tbody.addEventListener('click', (e) => {
			const editBtn = e.target.closest('button')?.querySelector('img[alt="편집"]') ? e.target.closest('button') : (e.target.alt === '편집' ? e.target.closest('button') : null);
			const delBtn = e.target.closest('button')?.querySelector('img[alt="삭제"]') ? e.target.closest('button') : (e.target.alt === '삭제' ? e.target.closest('button') : null);
			const tr = e.target.closest('tr');
			if (!tr) return;
			const idx = parseInt(tr.getAttribute('data-index'), 10);
			if (editBtn) { openEdit('edit', idx); }
			else if (delBtn) {
				const row = state.filtered[idx];
				const origIdx = state.data.indexOf(row);
				if (origIdx >= 0) { state.data.splice(origIdx,1); state.filtered = state.data.slice(); applySort(); render(); }
			}
		});
	}

	function init() {
		state.data = sampleData();
		state.filtered = state.data.slice();
		applySort();
		const input = document.getElementById('physical-search');
		const clearBtn = document.getElementById('physical-search-clear');
		if (input) input.addEventListener('input', () => {
			state.search = input.value; if (clearBtn) clearBtn.style.display = input.value ? 'inline-flex' : 'none'; applyFilter();
		});
		render();
		wireExtras();
	}

	window.initializeServerPage = init;
	document.addEventListener('DOMContentLoaded', init);
})();
