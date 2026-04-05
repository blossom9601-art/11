// 고객 > VAN사: dataset, table render, pagination, CSV (scoped to main content)

(function() {
	const state = {
		data: [],
		page: 1,
		pageSize: 10,
		sortKey: 'name',
		sortDir: 'asc',
		filtered: [],
		search: ''
	};

	const selected = new Set();

	function root() {
		return document.querySelector('main.main-content') || document;
	}

	function q(sel) {
		const r = root();
		return r ? r.querySelector(sel) : null;
	}

	function qa(sel) {
		const r = root();
		return r ? r.querySelectorAll(sel) : [];
	}

	function sampleData() {
		const vans = [
			{ name: 'KSNET', address: '서울 영등포구 여의대로 108' },
			{ name: 'NICE정보통신', address: '서울 영등포구 국회대로 74길 20' },
			{ name: 'KIS정보통신', address: '서울 영등포구 은행로 37' },
			{ name: 'JTNet', address: '서울 중구 퇴계로 97' },
			{ name: 'BK정보통신', address: '서울 금천구 가산디지털1로 19' },
			{ name: '스마트로', address: '서울 금천구 가산디지털2로 98' },
			{ name: '코밴', address: '서울 구로구 디지털로26길 61' },
			{ name: 'KICC', address: '서울 중구 을지로 170' },
			{ name: '세틀뱅크', address: '서울 강남구 테헤란로 516' },
			{ name: '다날', address: '경기 성남시 분당구 대왕판교로 660' },
			{ name: 'KG이니시스', address: '서울 강남구 테헤란로 405' },
			{ name: '토스페이먼츠', address: '서울 강남구 테헤란로 142' },
			{ name: '카카오페이', address: '경기 성남시 분당구 분당내곡로 117' }
		];
		return vans.map((c, i) => ({
			...c,
			lines: (i % 8) + 1,
			managers: (i % 5) + 1
		}));
	}

	function by(a, b, key, dir) {
		const av = a[key]; const bv = b[key];
		if (av === bv) return 0;
		const r = av > bv ? 1 : -1;
		return dir === 'asc' ? r : -r;
	}

	function render() {
		const start = (state.page - 1) * state.pageSize;
		const end = start + state.pageSize;
		const rows = state.filtered.slice(start, end);
		const tbody = q('#physical-table-body');
		if (!tbody) return;
		tbody.innerHTML = rows.map((row, i) => {
			const idx = start + i;
			const checked = selected.has(idx) ? 'checked' : '';
			return `
				<tr data-index="${idx}" class="${selected.has(idx) ? 'selected' : ''}">
					<td><input type="checkbox" class="row-select" ${checked}></td>
					<td><a href="#" class="system-name-link" title="상세 보기" onclick="event.preventDefault();">${row.name || ''}</a></td>
					<td>${row.address || ''}</td>
					<td>${row.lines ?? 0}</td>
					<td>${row.managers ?? 0}</td>
					<td>
						<button class="action-btn" title="수정" onclick="openServerEditModal(${idx})">
							<img src="/static/image/svg/edit.svg" class="action-icon" alt="수정">
						</button>
						<button class="action-btn" title="삭제" onclick="deleteSoftware(${idx})">
							<img src="/static/image/svg/delete.svg" class="action-icon" alt="삭제">
						</button>
					</td>
				</tr>`;
		}).join('');

		Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
			const idx = Number(tr.getAttribute('data-index'));
			const cb = tr.querySelector('.row-select');
			if (!cb) return;
			cb.addEventListener('change', () => {
				if (cb.checked) selected.add(idx); else selected.delete(idx);
				tr.classList.toggle('selected', cb.checked);
				updateSelectAllState();
			});
			// Click row to toggle selection (ignore controls and links)
			tr.addEventListener('click', (e) => {
				if (e.target.closest('input,button,a')) return;
				cb.checked = !cb.checked;
				cb.dispatchEvent(new Event('change'));
			});
		});

		updateSelectAllState();

		const count = q('#physical-count');
		if (count) count.textContent = state.filtered.length;

		const info = q('#physical-pagination-info');
		if (info) {
			const total = state.filtered.length;
			const from = total ? start + 1 : 0;
			const to = Math.min(end, total);
			info.textContent = `${from}-${to} / ${total}개 항목`;
		}
		renderPageNumbers();
	}

	function updateSelectAllState() {
		const start = (state.page - 1) * state.pageSize;
		const end = Math.min(start + state.pageSize, state.filtered.length);
		let checkedCount = 0; let total = 0;
		for (let i = start; i < end; i++) { total++; if (selected.has(i)) checkedCount++; }
		const selAll = q('#physical-select-all');
		if (!selAll) return;
		if (checkedCount === 0) { selAll.indeterminate = false; selAll.checked = false; }
		else if (checkedCount === total) { selAll.indeterminate = false; selAll.checked = true; }
		else { selAll.indeterminate = true; selAll.checked = false; }
	}

	function sort(key) {
		if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
		else { state.sortKey = key; state.sortDir = 'asc'; }
		state.filtered.sort((a, b) => by(a, b, state.sortKey, state.sortDir));
		render();
	}

	function filter() {
		const qy = state.search.trim().toLowerCase();
		if (!qy) state.filtered = [...state.data];
		else state.filtered = state.data.filter(r => [r.name, r.address].some(v => String(v||'').toLowerCase().includes(qy)));
		state.page = 1;
		state.filtered.sort((a, b) => by(a, b, state.sortKey, state.sortDir));
		render();
	}

	function renderPageNumbers() {
		const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
		const c = q('#physical-page-numbers');
		if (!c) return;
		let html = '';
		for (let i = 1; i <= totalPages; i++) {
			html += `<button class="page-btn${i===state.page?' active':''}" onclick="goToPage(${i})">${i}</button>`;
		}
		c.innerHTML = html;
		const first = q('#physical-first-page');
		const prev = q('#physical-prev-page');
		const next = q('#physical-next-page');
		const last = q('#physical-last-page');
		if (first && prev && next && last) {
			first.onclick = () => goToPage(1);
			prev.onclick = () => goToPage(Math.max(1, state.page - 1));
			next.onclick = () => goToPage(Math.min(totalPages, state.page + 1));
			last.onclick = () => goToPage(totalPages);
		}
	}

	function toCSV(rows) {
		const headers = ['VAN사','주소','회선수','담당자'];
		const body = rows.map(r => [r.name||'', r.address||'', r.lines??0, r.managers??0]);
		return [headers, ...body].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
	}

	// hooks
	window.sortServerTable = function(_tab, key) { sort(key); };
	window.changeServerPageSize = function() { const sel = q('#physical-page-size'); if (!sel) return; state.pageSize = Number(sel.value)||10; state.page = 1; render(); };
	window.clearSearch = function() { const input = q('#physical-search'); if (!input) return; input.value = ''; state.search = ''; const x = q('#physical-search-clear'); if (x) x.style.display = 'none'; filter(); };
	window.toggleServerSelectAll = function() { const selAll = q('#physical-select-all'); if (!selAll) return; const start = (state.page - 1) * state.pageSize; const end = Math.min(start + state.pageSize, state.filtered.length); for (let i = start; i < end; i++) selAll.checked ? selected.add(i) : selected.delete(i); render(); };
	window.downloadServerCSV = function() { const csv = toCSV(state.filtered); const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); const today = new Date(); const y = today.getFullYear(); const m = String(today.getMonth()+1).padStart(2,'0'); const d = String(today.getDate()).padStart(2,'0'); a.href = url; a.download = `고객_VAN사_${y}${m}${d}.csv`; a.click(); URL.revokeObjectURL(url); };
	window.openServerAddModal = function(){}; window.closeServerAddModal = function(){}; window.openServerEditModal = function(){}; window.closeServerEditModal = function(){}; window.openServerStatsModal = function(){}; window.closeServerStatsModal = function(){};
	window.goToPage = function(n) { state.page = n; render(); };
	window.completeSoftwareAdd = function(){}; window.populateEditModal = function(){}; window.saveSoftwareEdit = function(){};
	window.deleteSoftware = function(index) { const row = state.filtered[index]; if (!row) return; const absIdx = state.data.indexOf(row); if (absIdx >= 0) state.data.splice(absIdx,1); filter(); };

	document.addEventListener('DOMContentLoaded', function() {
		const input = q('#physical-search');
		if (input) input.addEventListener('input', () => { state.search = input.value; const x = q('#physical-search-clear'); if (x) x.style.display = input.value ? 'inline-flex':'none'; filter(); });
		state.data = sampleData();
		state.filtered = [...state.data];
		state.filtered.sort((a, b) => by(a, b, state.sortKey, state.sortDir));
		render();
	});
})();

