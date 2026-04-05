// Access Control page script: dataset, table render, pagination, and modal hooks


(function() {
	const state = {
		data: [],
		page: 1,
		pageSize: 10,
		sortKey: 'date_in',
		sortDir: 'desc',
		filtered: [],
		search: ''
	};

	// Track selected row indexes within the full filtered list
	const selected = new Set();

	// --- Cross-tab handoff storage (출입 기록) ---
	const ACCESS_RECORDS_KEY = 'access:records';
	function loadAccessRecords() {
		try {
			const raw = localStorage.getItem(ACCESS_RECORDS_KEY);
			return raw ? JSON.parse(raw) : [];
		} catch (_) { return []; }
	}
	function saveAccessRecords(arr) {
		try { localStorage.setItem(ACCESS_RECORDS_KEY, JSON.stringify(arr || [])); } catch (_) {}
	}

	function sampleData() {
		return [
			{ date_in: '2025-08-18 09:17', person_type:'외부', company:'AST글로벌', person_name:'박철웅', purpose:'빅데이터 AP#1 디스크 교체', place:'퓨처센터(5층)', laptop:'No', task_link:'Yes', manager:'문정한', access_manager:'송철수', io_type:'교체', goods_type:'교체', goods_name:'HPE SAS 300GB DISK', goods_qty:1 },
			{ date_in: '2025-08-18 10:05', person_type:'내부', company:'IT운영팀', person_name:'김하늘', purpose:'정기 점검', place:'퓨처센터(6층)', laptop:'Yes', task_link:'No', manager:'이수진', access_manager:'박상민', io_type:'반입', goods_type:'임대', goods_name:'테스트 노트북', goods_qty:1 },
			{ date_in: '2025-08-18 10:30', person_type:'외부', company:'네오시스', person_name:'최민수', purpose:'서버 메모리 증설', place:'을지트윈타워(15층)', laptop:'No', task_link:'Yes', manager:'문정한', access_manager:'송철수', io_type:'반입', goods_type:'구매', goods_name:'DDR4 32GB', goods_qty:4 },
			{ date_in: '2025-08-18 11:00', person_type:'외부', company:'한빛보안', person_name:'오지훈', purpose:'방화벽 정책 변경', place:'재해복구센터(4층)', laptop:'Yes', task_link:'Yes', manager:'정하나', access_manager:'김도훈', io_type:'반출', goods_type:'임대', goods_name:'USB 시리얼', goods_qty:1 },
			{ date_in: '2025-08-18 11:45', person_type:'내부', company:'클라우드팀', person_name:'박지훈', purpose:'가상화 호스트 점검', place:'퓨처센터(5층)', laptop:'Yes', task_link:'No', manager:'이수진', access_manager:'박상민', io_type:'교체', goods_type:'교체', goods_name:'NVMe 1TB', goods_qty:2 },
			{ date_in: '2025-08-18 12:20', person_type:'외부', company:'데이타링크', person_name:'서유리', purpose:'스위치 펌웨어 업그레이드', place:'퓨처센터(6층)', laptop:'Yes', task_link:'Yes', manager:'문정한', access_manager:'송철수', io_type:'반입', goods_type:'임대', goods_name:'콘솔 케이블', goods_qty:2 },
			{ date_in: '2025-08-18 13:10', person_type:'내부', company:'보안팀', person_name:'유재석', purpose:'접근 제어 점검', place:'을지트윈타워(15층)', laptop:'No', task_link:'No', manager:'정하나', access_manager:'김도훈', io_type:'반입', goods_type:'구매', goods_name:'RFID 카드', goods_qty:10 },
			{ date_in: '2025-08-18 14:02', person_type:'외부', company:'굿서버', person_name:'강호동', purpose:'스토리지 디스크 교체', place:'퓨처센터(5층)', laptop:'No', task_link:'Yes', manager:'문정한', access_manager:'송철수', io_type:'교체', goods_type:'교체', goods_name:'SAS 600GB', goods_qty:2 },
			{ date_in: '2025-08-18 14:40', person_type:'내부', company:'DBA팀', person_name:'이나영', purpose:'DB 서버 점검', place:'재해복구센터(4층)', laptop:'Yes', task_link:'No', manager:'이수진', access_manager:'박상민', io_type:'반입', goods_type:'임대', goods_name:'외장 SSD', goods_qty:1 },
			{ date_in: '2025-08-18 15:15', person_type:'외부', company:'에이치네트', person_name:'이광수', purpose:'L4 점검', place:'퓨처센터(6층)', laptop:'Yes', task_link:'Yes', manager:'정하나', access_manager:'김도훈', io_type:'반출', goods_type:'임대', goods_name:'테스터', goods_qty:1 },
			{ date_in: '2025-08-18 15:50', person_type:'내부', company:'플랫폼팀', person_name:'김유정', purpose:'APM 설정 변경', place:'을지트윈타워(15층)', laptop:'No', task_link:'No', manager:'이수진', access_manager:'박상민', io_type:'반입', goods_type:'구매', goods_name:'패치 케이블', goods_qty:5 },
			{ date_in: '2025-08-18 16:30', person_type:'외부', company:'테크윈', person_name:'박보검', purpose:'서버 점검', place:'퓨처센터(5층)', laptop:'Yes', task_link:'Yes', manager:'문정한', access_manager:'송철수', io_type:'반입', goods_type:'임대', goods_name:'KVM', goods_qty:1 }
		];
	}

	let charts = { group: null, name: null, version: null, nameVersion: null };

	function by(a, b, key, dir) {
		const av = a[key] ?? '';
		const bv = b[key] ?? '';
		if (av === bv) return 0;
		const r = av > bv ? 1 : -1;
		return dir === 'asc' ? r : -r;
	}

	function render() {
		const start = (state.page - 1) * state.pageSize;
		const end = start + state.pageSize;
		const rows = state.filtered.slice(start, end);
		const tbody = document.getElementById('physical-table-body');
		if (!tbody) return;
			tbody.innerHTML = rows.map((row, i) => {
			const idx = start + i;
			const isSel = selected.has(idx);
			return `
			<tr data-index="${idx}" class="${isSel ? 'selected' : ''}">
				<td><input type="checkbox" ${isSel ? 'checked' : ''}></td>
				<td>${row.date_in || ''}</td>
				<td>${row.company || ''}</td>
				<td>${row.person_name || ''}</td>
				<td>${row.purpose || ''}</td>
				<td>${row.place || ''}</td>
				<td>${row.laptop || ''}</td>
				<td>${row.task_link || ''}</td>
				<td>${row.manager || ''}</td>
				<td>${row.access_manager || ''}</td>
				<td>${row.io_type || ''}</td>
				<td>${row.goods_type || ''}</td>
				<td>${row.goods_name || ''}</td>
				<td class="text-right">${row.goods_qty ?? ''}</td>
				<td>
					<button class="action-btn" onclick="populateEditModal(${start + i})" title="편집">
						<img src="/static/image/svg/edit.svg" alt="편집" class="action-icon">
					</button>
					<button class="action-btn" onclick="deleteAccess(${start + i})" title="삭제">
						<img src="/static/image/svg/delete.svg" alt="삭제" class="action-icon">
					</button>
					<button class="action-btn" onclick="exitAccess(${start + i})" title="퇴실">
						<img src="/static/image/svg/exit.svg" alt="퇴실" class="action-icon">
					</button>
				</td>
			</tr>`;
		}).join('');

		// apply toggle interaction like server page
		// (optional) attach small toggles if needed later

		// selection: row click and checkbox sync
		Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
			const checkbox = tr.querySelector('input[type="checkbox"]');
			const idx = parseInt(tr.getAttribute('data-index'), 10);
			tr.addEventListener('click', (e) => {
				// avoid row selection when clicking the checkbox, action buttons, or toggle badges
				if (e.target && (e.target.matches('input[type="checkbox"], .action-btn, .action-btn *') || e.target.closest('.toggle-badge'))) return;
				const willSelect = !selected.has(idx);
				if (willSelect) {
					selected.add(idx);
					tr.classList.add('selected');
					if (checkbox) checkbox.checked = true;
				} else {
					selected.delete(idx);
					tr.classList.remove('selected');
					if (checkbox) checkbox.checked = false;
				}
				updateSelectAllState();
			});
			if (checkbox) {
				checkbox.addEventListener('change', (e) => {
					if (e.target.checked) {
						selected.add(idx);
						tr.classList.add('selected');
					} else {
						selected.delete(idx);
						tr.classList.remove('selected');
					}
					updateSelectAllState();
				});
			}
		});
		const count = document.getElementById('physical-count');
		if (count) count.textContent = state.filtered.length;

		// pagination info
		const info = document.getElementById('physical-pagination-info');
		if (info) {
			const from = state.filtered.length ? start + 1 : 0;
			const to = Math.min(end, state.filtered.length);
			info.textContent = `${from}-${to} / ${state.filtered.length}개 항목`;
		}
		renderPageNumbers();
		// Apply column visibility after rows are (re)rendered
		if (typeof window.applyServerColumnSelection === 'function') {
			try { window.applyServerColumnSelection(); } catch (_) {}
		}
	}

	function updateSelectAllState() {
		const start = (state.page - 1) * state.pageSize;
		const end = Math.min(start + state.pageSize, state.filtered.length);
		let checkedCount = 0; let total = 0;
		for (let i = start; i < end; i++) { total++; if (selected.has(i)) checkedCount++; }
		const selAll = document.getElementById('physical-select-all');
		if (!selAll) return;
		if (checkedCount === 0) { selAll.indeterminate = false; selAll.checked = false; }
		else if (checkedCount === total) { selAll.indeterminate = false; selAll.checked = true; }
		else { selAll.indeterminate = true; selAll.checked = false; }
	}

	function sort(key) {
		if (state.sortKey === key) {
			state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			state.sortKey = key;
			state.sortDir = 'asc';
		}
		state.filtered.sort((a, b) => by(a, b, state.sortKey, state.sortDir));
		render();
	}

		function filter() {
			const q = state.search.trim().toLowerCase();
			if (!q) {
				state.filtered = [...state.data];
			} else {
				state.filtered = state.data.filter(r =>
					`${r.date_in||''} ${r.company||''} ${r.person_name||''} ${r.purpose||''} ${r.place||''} ${r.laptop||''} ${r.task_link||''} ${r.manager||''} ${r.access_manager||''} ${r.io_type||''} ${r.goods_type||''} ${r.goods_name||''} ${r.goods_qty ?? ''}`.toLowerCase().includes(q)
				);
			}
			state.page = 1;
			state.filtered.sort((a, b) => by(a, b, state.sortKey, state.sortDir));
			render();
		}

		function renderPageNumbers() {
			const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
			const c = document.getElementById('physical-page-numbers');
			if (!c) return;
			let html = '';
			for (let i = 1; i <= totalPages; i++) {
				html += `<button class="page-btn ${i === state.page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
			}
			c.innerHTML = html;
			const first = document.getElementById('physical-first-page');
			const prev = document.getElementById('physical-prev-page');
			const next = document.getElementById('physical-next-page');
			const last = document.getElementById('physical-last-page');
			if (first && prev && next && last) {
				first.disabled = state.page === 1;
				prev.disabled = state.page === 1;
				next.disabled = state.page === totalPages;
				last.disabled = state.page === totalPages;
				first.onclick = () => { state.page = 1; render(); };
				prev.onclick = () => { if (state.page > 1) { state.page--; render(); } };
				next.onclick = () => { if (state.page < totalPages) { state.page++; render(); } };
				last.onclick = () => { state.page = totalPages; render(); };
			}
		}

		function toCSV(rows) {
			const headers = ['입실일자','소속','이름','방문목적','방문장소','노트북사용','작업연계','담당관리자','출입관리자','입출구분','물품구분','입출장비명','입출수량'];
			const body = rows.map(r => [r.date_in||'',r.company||'',r.person_name||'',r.purpose||'',r.place||'',r.laptop||'',r.task_link||'',r.manager||'',r.access_manager||'',r.io_type||'',r.goods_type||'',r.goods_name||'',r.goods_qty ?? '']);
			return [headers, ...body].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
		}

		// ---- Stats (Chart.js) ----
		function groupCounts(rows, field) {
			const m = new Map();
			rows.forEach(r => {
				const k = (r[field] || '-').toString();
				m.set(k, (m.get(k) || 0) + 1);
			});
			const labels = Array.from(m.keys());
			const values = Array.from(m.values());
			return { labels, values };
		}

		function palette(n) {
			const base = ['#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f','#edc949','#af7aa1','#ff9da7','#9c755f','#bab0ab'];
			const out = [];
			for (let i = 0; i < n; i++) out.push(base[i % base.length]);
			return out;
		}

		function groupNameVersion(rows) {
			// Build dataset per sw_name, x-axis = versions
			const versionsSet = new Set();
			const byName = new Map();
			rows.forEach(r => {
				const name = (r.sw_name || '-').toString();
				const ver = (r.sw_version || '-').toString();
				versionsSet.add(ver);
				if (!byName.has(name)) byName.set(name, new Map());
				const m = byName.get(name);
				m.set(ver, (m.get(ver) || 0) + 1);
			});
			const versions = Array.from(versionsSet);
			const datasets = [];
			const names = Array.from(byName.keys());
			const colors = palette(names.length);
			names.forEach((nm, i) => {
				const counts = versions.map(v => byName.get(nm).get(v) || 0);
				datasets.push({ label: nm, data: counts, backgroundColor: colors[i], borderWidth: 0 });
			});
			return { versions, datasets, names };
		}

		function renderLegend(containerId, labels, colors, values) {
			const el = document.getElementById(containerId);
			if (!el) return;
			el.innerHTML = labels.map((lb, i) => `
				<div class="legend-item">
					<span class="legend-swatch" style="background:${colors[i]}"></span>
					<span class="legend-label">${lb}</span>
					<span class="legend-value">${values[i]}</span>
				</div>
			`).join('');
		}

		function makeDoughnut(canvasId, labels, values) {
			const canvas = document.getElementById(canvasId);
			if (!canvas) return null;
			const ctx = canvas.getContext('2d');
			const colors = palette(labels.length);
			return new Chart(ctx, {
				type: 'doughnut',
				data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
				options: {
					plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed}` } } },
					responsive: true,
					maintainAspectRatio: false,
					cutout: '55%'
				}
			});
		}

		function makeBar(canvasId, labels, values) {
			const canvas = document.getElementById(canvasId);
			if (!canvas) return null;
			const ctx = canvas.getContext('2d');
			const colors = palette(labels.length);
			return new Chart(ctx, {
				type: 'bar',
				data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
				options: {
					plugins: { legend: { display: false } },
					responsive: true,
					maintainAspectRatio: false,
					scales: {
						x: { ticks: { autoSkip: true, maxRotation: 0, minRotation: 0 } },
						y: { beginAtZero: true, precision: 0 }
					}
				}
			});
		}

		function makeHStackedBar(canvasId, labels, datasets) {
			const canvas = document.getElementById(canvasId);
			if (!canvas) return null;
			const ctx = canvas.getContext('2d');
			return new Chart(ctx, {
				type: 'bar',
				data: { labels, datasets },
				options: {
					indexAxis: 'y',
					plugins: { legend: { display: true, position: 'bottom' } },
					responsive: true,
					maintainAspectRatio: false,
					scales: { x: { stacked: true, beginAtZero: true, precision: 0 }, y: { stacked: true } }
				}
			});
		}

		function updateCount(elId, count) { const el = document.getElementById(elId); if (el) el.textContent = `${count}개`; }

		function renderStats() {
			const rows = state.filtered;
			// Prepare data for new metrics
			const group = groupCounts(rows, 'sw_type');
			const name = groupCounts(rows, 'sw_name');
			const version = groupCounts(rows, 'sw_version');

			// Destroy previous charts
			['group','name','version','nameVersion'].forEach(k => { if (charts[k]) { charts[k].destroy(); charts[k] = null; } });

			// Build charts
			charts.group = makeDoughnut('stats-group-chart', group.labels, group.values);
			charts.name = makeDoughnut('stats-name-chart', name.labels, name.values);
			charts.version = makeBar('stats-version-chart', version.labels, version.values);

			// Legends
			if (charts.group) renderLegend('stats-group-legend', group.labels, palette(group.labels.length), group.values);
			if (charts.name) renderLegend('stats-name-legend', name.labels, palette(name.labels.length), name.values);
			if (charts.version) renderLegend('stats-version-legend', version.labels, palette(version.labels.length), version.values);
			// Name x Version chart (stacked horizontal)
			const nv = groupNameVersion(rows);
			charts.nameVersion = makeHStackedBar('stats-name-version-chart', nv.versions, nv.datasets);
			if (charts.nameVersion) renderLegend('stats-name-version-legend', nv.names, nv.datasets.map(d=>d.backgroundColor), nv.names.map((_,i)=>nv.datasets[i].data.reduce((a,b)=>a+b,0)));

			// Counts
			updateCount('stats-group-count', group.labels.length);
			updateCount('stats-name-count', name.labels.length);
			updateCount('stats-version-count', version.labels.length);
			if (charts.nameVersion) updateCount('stats-name-version-count', nv.names.length);
		}

		function cleanupStats() { ['group','name','version','nameVersion'].forEach(k => { if (charts[k]) { charts[k].destroy(); charts[k] = null; } }); }

		function openModal(id) {
			const m = document.getElementById(id);
			if (!m) return;
			m.classList.add('show');
			m.style.display = 'flex';
		}
		function closeModal(id) {
			const m = document.getElementById(id);
			if (!m) return;
			m.classList.remove('show');
			m.style.display = 'none';
		}

	// Expose required hooks expected by templates
	window.sortServerTable = function(tab, key) { sort(key); };
	window.changeServerPageSize = function() { const sel = document.getElementById('physical-page-size'); if (sel) { state.pageSize = parseInt(sel.value, 10); state.page = 1; render(); } };
	window.clearSearch = function() { const inp = document.getElementById('physical-search'); if (inp) { inp.value = ''; state.search = ''; filter(); } };
	window.toggleServerSelectAll = function() {
		const selAll = document.getElementById('physical-select-all');
		if (!selAll) return;
		const checked = selAll.checked;
		const start = (state.page - 1) * state.pageSize;
		const end = Math.min(start + state.pageSize, state.filtered.length);
		for (let i = start; i < end; i++) {
			if (checked) selected.add(i); else selected.delete(i);
		}
		render(); // re-render to sync checkboxes and row highlight
	};
	window.downloadServerCSV = function() {
		const csv = toCSV(state.filtered);
		const d = new Date();
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		const filename = `출입등록_${yyyy}${mm}${dd}.csv`;
		const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	};
	window.openServerAddModal = function() { document.body.classList.add('modal-open'); openModal('server-add-modal'); };
	window.closeServerAddModal = function() { closeModal('server-add-modal'); document.body.classList.remove('modal-open'); };
	window.openServerEditModal = function() { document.body.classList.add('modal-open'); openModal('server-edit-modal'); };
	window.closeServerEditModal = function() { closeModal('server-edit-modal'); document.body.classList.remove('modal-open'); };
	// no stats modal on access pages
	window.goToPage = function(n) { state.page = n; render(); };

	window.completeAccessAdd = function() {
		const row = {
			date_in: document.getElementById('add-date-in').value || '',
			person_type: document.getElementById('add-person-type').value || '',
			company: document.getElementById('add-company').value || '',
			person_name: document.getElementById('add-person-name').value || '',
			purpose: document.getElementById('add-purpose').value || '',
			place: document.getElementById('add-place').value || '',
			laptop: document.getElementById('add-laptop').value || 'No',
			task_link: document.getElementById('add-task-link').value || 'No',
			manager: document.getElementById('add-manager').value || '',
			access_manager: document.getElementById('add-access-manager').value || '',
			io_type: document.getElementById('add-io-type').value || '',
			goods_type: document.getElementById('add-goods-type').value || '',
			goods_name: document.getElementById('add-goods-name').value || '',
			goods_qty: parseInt(document.getElementById('add-goods-qty').value || '0', 10)
		};
		state.data.unshift(row);
		closeModal('server-add-modal');
		filter();
		if (typeof showToast === 'function') try { showToast('출입이 등록되었습니다.', 'success'); } catch(_) {}
	};

	window.populateEditModal = function(index) {
		const i = typeof index === 'number' ? index : (state.page - 1) * state.pageSize;
		const row = state.filtered[i];
		if (!row) return;
		document.getElementById('edit-date-in').value = row.date_in || '';
		document.getElementById('edit-person-type').value = row.person_type || '내부';
		document.getElementById('edit-company').value = row.company || '';
		document.getElementById('edit-person-name').value = row.person_name || '';
		document.getElementById('edit-purpose').value = row.purpose || '';
		document.getElementById('edit-place').value = row.place || '';
		document.getElementById('edit-laptop').value = row.laptop || 'No';
		document.getElementById('edit-task-link').value = row.task_link || 'No';
		document.getElementById('edit-manager').value = row.manager || '';
		document.getElementById('edit-access-manager').value = row.access_manager || '';
		document.getElementById('edit-io-type').value = row.io_type || '';
		document.getElementById('edit-goods-type').value = row.goods_type || '';
		document.getElementById('edit-goods-name').value = row.goods_name || '';
		document.getElementById('edit-goods-qty').value = row.goods_qty ?? 0;
		document.getElementById('edit-index').value = i;
		openModal('server-edit-modal');
	};

	window.saveAccessEdit = function() {
		const i = parseInt(document.getElementById('edit-index').value, 10);
		if (isNaN(i)) return;
		const row = state.filtered[i] || state.data[i];
		if (!row) return;
		row.date_in = document.getElementById('edit-date-in').value;
		row.person_type = document.getElementById('edit-person-type').value;
		row.company = document.getElementById('edit-company').value;
		row.person_name = document.getElementById('edit-person-name').value;
		row.purpose = document.getElementById('edit-purpose').value;
		row.place = document.getElementById('edit-place').value;
		row.laptop = document.getElementById('edit-laptop').value;
		row.task_link = document.getElementById('edit-task-link').value;
		row.manager = document.getElementById('edit-manager').value;
		row.access_manager = document.getElementById('edit-access-manager').value;
		row.io_type = document.getElementById('edit-io-type').value;
		row.goods_type = document.getElementById('edit-goods-type').value;
		row.goods_name = document.getElementById('edit-goods-name').value;
		row.goods_qty = parseInt(document.getElementById('edit-goods-qty').value || '0', 10);
		closeModal('server-edit-modal');
		filter();
		if (typeof showToast === 'function') try { showToast('저장되었습니다.', 'success'); } catch(_) {}
	};

	window.deleteAccess = function(index) {
		const i = typeof index === 'number' ? index : parseInt(document.getElementById('edit-index').value, 10);
		if (isNaN(i)) return;
		const row = state.filtered[i];
		if (!row) return;
		if (!confirm('선택한 항목을 삭제하시겠습니까?')) return;
		const idxInData = state.data.indexOf(row);
		if (idxInData > -1) state.data.splice(idxInData, 1);
		filter();
		if (typeof showToast === 'function') try { showToast('삭제되었습니다.', 'success'); } catch(_) {}
	};

	window.exitAccess = function(index) {
		const row = state.filtered[index];
		if (!row) return;
		const now = new Date();
		const timeLabel = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
		const dateTimeLabel = now.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\./g, '-').replace(/\s/g, ' ').replace(/-\s/g, '-');
		if (confirm(`퇴실 시간을 ${timeLabel}으로 기록하시겠습니까?`)) {
			// Move to 기록 storage with 퇴실일자
			const records = loadAccessRecords();
			const moved = { ...row, date_out: dateTimeLabel };
			records.unshift(moved);
			saveAccessRecords(records);
			// Remove from current list
			const idxInData = state.data.indexOf(row);
			if (idxInData > -1) state.data.splice(idxInData, 1);
			filter();
			if (typeof showToast === 'function') try { showToast(`퇴실이 기록되었습니다. (${timeLabel})`, 'success'); } catch(_) {}
		}
	};

	document.addEventListener('DOMContentLoaded', function() {
		state.data = sampleData();
		state.filtered = [...state.data];
		const search = document.getElementById('physical-search');
		if (search) {
			search.addEventListener('input', (e) => {
				state.search = e.target.value;
				const clearBtn = document.getElementById('physical-search-clear');
				if (clearBtn) clearBtn.style.display = state.search ? 'inline-flex' : 'none';
				filter();
			});
		}

		// Initialize column visibility from modal checkboxes (defaults)
		applyInitialColumnVisibility();
		render();
	});
})();
	// Column visibility: store per-path selection (access-specific)
	function storageKey() { return `access:cols:${window.location.pathname}`; }
	function loadColState() {
		try { const j = localStorage.getItem(storageKey()); return j ? JSON.parse(j) : null; } catch(_) { return null; }
	}
	function saveColState(stateObj) {
		try { localStorage.setItem(storageKey(), JSON.stringify(stateObj)); } catch(_) {}
	}

	function applyInitialColumnVisibility() {
		const saved = loadColState();
		// Defaults for Access: always on: date_in, company(소속), person_name, purpose, place, laptop, manager, access_manager
		const defaults = {
			date_in: true,
			company: true,
			person_name: true,
			purpose: true,
			place: true,
			laptop: true,
			task_link: false,
			manager: true,
			access_manager: true,
			io_type: false,
			goods_type: false,
			goods_name: false,
			goods_qty: false
		};
		const stateToUse = saved ? { ...saved } : { ...defaults };
		// Force always-on
		stateToUse.manager = true;
		stateToUse.access_manager = true;
		// reflect into modal checkboxes
		Object.keys(stateToUse).forEach(key => {
			const cb = document.getElementById(`col-${key}`);
			if (cb) {
				cb.checked = !!stateToUse[key];
				if (key === 'manager' || key === 'access_manager') cb.disabled = true;
			}
		});
		// sync visual selection states
		syncColumnChipSelected();
		// Persist back with enforced flags
		saveColState(stateToUse);
		applyServerColumnSelection();
	}

	// Reset to defaults (does not close the modal)
	window.resetServerColumnSelection = function() {
		const defaults = { date_in:true, company:true, person_name:true, purpose:true, place:true, laptop:true, task_link:false, manager:true, access_manager:true, io_type:false, goods_type:false, goods_name:false, goods_qty:false };
		Object.keys(defaults).forEach(k => { const cb = document.getElementById(`col-${k}`); if (cb) cb.checked = !!defaults[k]; });
		// persist and apply without closing modal
		saveColState(defaults);
		syncColumnChipSelected();
		window.applyServerColumnSelection(true);
	};

	// Column selection modal handlers for this page
	window.applyServerColumnSelection = function(skipClose) {
		const keys = ['date_in','company','person_name','purpose','place','laptop','task_link','manager','access_manager','io_type','goods_type','goods_name','goods_qty'];
		const selected = {};
		keys.forEach(k => { const cb = document.getElementById(`col-${k}`); selected[k] = cb ? !!cb.checked : false; });
		// Force always-on
		selected.manager = true;
		selected.access_manager = true;
		// Ensure UI reflects disabled and checked
		['manager','access_manager'].forEach(k => { const cb = document.getElementById(`col-${k}`); if (cb) { cb.checked = true; cb.disabled = true; } });
		saveColState(selected);
		// Toggle columns in the table
		const header = document.querySelector('#physical-table thead tr');
		const rows = document.querySelectorAll('#physical-table tbody tr');
		if (!header) return;
		const headers = Array.from(header.children);
		// column order for this table (person_type 제거)
		const keysInOrder = ['select','date_in','company','person_name','purpose','place','laptop','task_link','manager','access_manager','io_type','goods_type','goods_name','goods_qty','actions'];
		keysInOrder.forEach((k, idx) => {
			if (k === 'select' || k === 'actions') { headers[idx].style.display = ''; rows.forEach(r => { const c = r.children[idx]; if (c) c.style.display=''; }); return; }
			const show = !!selected[k];
			headers[idx].style.display = show ? '' : 'none';
			rows.forEach(r => { const c = r.children[idx]; if (c) c.style.display = show ? '' : 'none'; });
		});
		// Close modal after applying unless instructed to skip
		if (!skipClose && typeof window.closeServerColumnSelectModal === 'function') { try { window.closeServerColumnSelectModal(); } catch(_) {} }
	};

	window.openServerColumnSelectModal = function(/*tabName*/) {
		const modal = document.getElementById('server-column-select-modal');
		if (!modal) return;
		// sync checkboxes with saved state
		const saved = loadColState();
		if (saved) {
			Object.keys(saved).forEach(k => { const cb = document.getElementById(`col-${k}`); if (cb) cb.checked = !!saved[k]; });
		}
		// Enforce always-on in UI
		['manager','access_manager'].forEach(k => { const cb = document.getElementById(`col-${k}`); if (cb) { cb.checked = true; cb.disabled = true; } });
		syncColumnChipSelected();
		document.body.classList.add('modal-open');
		modal.style.display = 'flex';
		modal.classList.add('show');
	};

	window.closeServerColumnSelectModal = function() {
		const modal = document.getElementById('server-column-select-modal');
		if (!modal) return;
		modal.classList.remove('show');
		modal.style.display = 'none';
		document.body.classList.remove('modal-open');
	};

	// Chip toggle and sync helpers (server-like UX)
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
