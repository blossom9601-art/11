// Access Records page script: dataset, table render, pagination, and modal hooks



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

	const selected = new Set();

	// Persist records in localStorage and interop with 등록 page handoff
	const ACCESS_RECORDS_KEY = 'access:records';
	const ACCESS_RECORDS_SEED_VERSION_KEY = 'access:records:seedver';
	const ACCESS_RECORDS_SEED_VERSION = 'seed-600-v1';
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
		// Deterministic sample generator: 112 records across 2024-01 .. 2025-08
		const companies = ['AST글로벌','IT운영팀','네오시스','한빛보안','클라우드팀','데이타링크','보안팀','굿서버','DBA팀','에이치네트','플랫폼팀','테크윈','블로썸','퓨처소프트','라온테크','지니시스'];
		const names = ['김하늘','박철웅','최민수','오지훈','박지훈','서유리','유재석','강호동','이나영','이광수','김유정','박보검','문정한','송철수','정하나','김도훈','이수진','박상민'];
		const purposes = ['정기 점검','서버 점검','디스크 교체','네트워크 점검','DB 점검','방화벽 정책 변경','스토리지 점검','가상화 점검','APM 설정','보안 점검'];
		const places = ['퓨처센터(5층)','퓨처센터(6층)','을지트윈타워(15층)','재해복구센터(4층)'];
		const YN = ['No','Yes'];
		const managers = ['문정한','이수진','정하나'];
		const accessManagers = ['송철수','박상민','김도훈'];
		const ioTypes = ['반입','반출','교체'];
		const goodsTypes = ['구매','임대','교체'];
		const goodsNames = ['HPE SAS 300GB DISK','NVMe 1TB','DDR4 32GB','외장 SSD','콘솔 케이블','패치 케이블','테스터','KVM','RFID 카드','SAS 600GB'];

		function pick(arr, seed) { return arr[seed % arr.length]; }
		function fmt(dt) {
			return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
		}

		// Build month buckets from 2024-01 to 2025-08 inclusive (20 months)
		const months = [];
		for (let i = 0; i < 20; i++) {
			const d = new Date(2024, 0 + i, 1);
			months.push({ y: d.getFullYear(), m: d.getMonth() });
		}
		const total = 600; const base = Math.floor(total / months.length); // 30
		let extra = total % months.length; // remainder distribution

		const out = [];
		months.forEach((mm, idx) => {
			const count = base + (extra > 0 ? 1 : 0);
			if (extra > 0) extra--;
			for (let j = 0; j < count; j++) {
				// Deterministic day/hour/minute so samples look natural and spread
				const day = 1 + ((j * 3 + idx * 2) % 28); // 1..28
				const hour = 9 + ((j * 2 + idx) % 8); // 9..16
				const minuteTable = [0,5,10,15,20,25,30,35,40,45,50,55];
				const min = minuteTable[(j + idx) % minuteTable.length];
				const dtIn = new Date(mm.y, mm.m, day, hour, min);
				// 45..164 minutes later
				const offsetMin = 45 + ((j * 17 + idx * 13) % 120);
				const dtOut = new Date(dtIn.getTime() + offsetMin * 60000);
				out.push({
					date_in: fmt(dtIn),
					date_out: fmt(dtOut),
					company: pick(companies, idx + j),
					person_name: pick(names, idx * j + j),
					purpose: pick(purposes, idx + j * 2),
					place: pick(places, idx + j * 3),
					laptop: pick(YN, idx + j),
					task_link: pick(YN, idx + j + 1),
					manager: pick(managers, idx + j),
					access_manager: pick(accessManagers, j + idx * 2),
					io_type: pick(ioTypes, idx + j),
					goods_type: pick(goodsTypes, idx + 2 * j),
					goods_name: pick(goodsNames, idx * 3 + j),
					goods_qty: 1 + ((idx + j) % 6)
				});
			}
		});
		return out;
	}

	function by(a, b, key, dir) {
		const av = a[key] ?? '';
		const bv = b[key] ?? '';
		if (av === bv) return 0;
		const r = av > bv ? 1 : -1;
		return dir === 'asc' ? r : -r;
	}

	function render() {
		// Clamp page within bounds in case filtered/pageSize changed
		const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
		if (state.page > totalPages) state.page = totalPages;
		if (state.page < 1) state.page = 1;
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
				<td>${row.date_out || ''}</td>
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
				</td>
			</tr>`;
		}).join('');

		// selection: row click and checkbox sync
		Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
			const checkbox = tr.querySelector('input[type="checkbox"]');
			const idx = parseInt(tr.getAttribute('data-index'), 10);
			tr.addEventListener('click', (e) => {
				if (e.target && (e.target.matches('input[type="checkbox"], .action-btn, .action-btn *'))) return;
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
				`${r.date_in || ''} ${r.date_out || ''} ${r.company || ''} ${r.person_name || ''} ${r.purpose || ''} ${r.place || ''} ${r.laptop || ''} ${r.task_link || ''} ${r.manager || ''} ${r.access_manager || ''} ${r.io_type || ''} ${r.goods_type || ''} ${r.goods_name || ''} ${r.goods_qty ?? ''}`.toLowerCase().includes(q)
			);
		}
		state.page = 1;
		state.filtered.sort((a, b) => by(a, b, state.sortKey, state.sortDir));
		render();
	}

	function renderPageNumbers() {
		const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
		// Ensure page is within [1, totalPages]
		if (state.page > totalPages) state.page = totalPages;
		if (state.page < 1) state.page = 1;
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
		const headers = ['입실일자','퇴실일자','소속','이름','방문목적','방문장소','노트북사용','작업연계','담당관리자','출입관리자','입출구분','물품구분','입출장비명','입출수량'];
		const body = rows.map(r => [r.date_in || '', r.date_out || '', r.company || '', r.person_name || '', r.purpose || '', r.place || '', r.laptop || '', r.task_link || '', r.manager || '', r.access_manager || '', r.io_type || '', r.goods_type || '', r.goods_name || '', r.goods_qty ?? '']);
		return [headers, ...body].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
	}

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

	// ----- Stats (Records) -----
	function parseDateFlexible(s) {
		if (!s || typeof s !== 'string') return null;
		const t = s.trim();
		// Normalize common separators and formats: YYYY-MM-DD[ HH:mm[:ss]]
		const norm = t.replace(/[./]/g, '-').replace('T', ' ').replace(/\s+/, ' ');
		const m = norm.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
		if (m) {
			const y = parseInt(m[1], 10);
			const mo = parseInt(m[2], 10) - 1;
			const d = parseInt(m[3], 10);
			const hh = parseInt(m[4] || '0', 10);
			const mm = parseInt(m[5] || '0', 10);
			const ss = parseInt(m[6] || '0', 10);
			const dt = new Date(y, mo, d, hh, mm, ss);
			return isNaN(dt.getTime()) ? null : dt;
		}
		const dt = new Date(t);
		return isNaN(dt.getTime()) ? null : dt;
	}

	function countMonthlyLastYear(rows) {
		const now = new Date();
		const months = [];
		for (let i = 11; i >= 0; i--) {
			const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
			months.push({ key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, y: d.getFullYear(), m: d.getMonth() });
		}
		const map = new Map(months.map(m => [m.key, 0]));
		let parseFails = 0;
		rows.forEach(r => {
			const dt = parseDateFlexible(r.date_in || r.date_out);
			if (!dt) { parseFails++; return; }
			const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
			if (map.has(key)) map.set(key, map.get(key) + 1);
		});
		return {
			data: months.map(m => ({ label: m.key, value: map.get(m.key) || 0 })),
			parseFails
		};
	}

	function countDailyLastMonth(rows) {
		const now = new Date();
		const days = [];
		for (let i = 29; i >= 0; i--) {
			const d = new Date(now);
			d.setDate(d.getDate() - i);
			const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
			days.push(key);
		}
		const map = new Map(days.map(k => [k, 0]));
		let parseFails = 0;
		rows.forEach(r => {
			const dt = parseDateFlexible(r.date_in || r.date_out);
			if (!dt) { parseFails++; return; }
			const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
			if (map.has(key)) map.set(key, map.get(key) + 1);
		});
		return {
			data: days.map(k => ({ label: k.slice(5), value: map.get(k) || 0 })),
			parseFails
		};
	}

	// Simple tooltip helper per chart container
	function ensureTooltip(el) {
		let tip = el.querySelector('.chart-tooltip');
		if (!tip) {
			tip = document.createElement('div');
			tip.className = 'chart-tooltip';
			tip.style.position = 'absolute';
			tip.style.zIndex = '5';
			tip.style.pointerEvents = 'none';
			tip.style.background = '#ffffff';
			tip.style.border = '1px solid #e5e7eb';
			tip.style.borderRadius = '6px';
			tip.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
			tip.style.padding = '6px 8px';
			tip.style.fontSize = '12px';
			tip.style.color = '#111827';
			tip.style.display = 'none';
			tip.style.transform = 'translate(-50%, -120%)';
			el.style.position = 'relative';
			el.appendChild(tip);
		}
		return tip;
	}

	function renderBarTimeseries(containerId, data, opts) {
		const el = document.getElementById(containerId);
		if (!el) return;
		const options = Object.assign({ height: 220, barColor: '#4f46e5', bg:'#ffffff', grid:'#e5e7eb', axis:'#9ca3af', label:'#6b7280', maxXTicks: 8, showAllXLabels: false, labelFontSize: 10, rotateX: 0 }, opts || {});
		const n = data.length;
		const values = data.map(d => d.value);
		const sum = values.reduce((s,v)=>s+v,0);
		const maxVal = Math.max(1, ...values);
		// Y-axis scaling: allow fixed yMax/yTick via options; otherwise auto with 4 steps
		let steps = 4;
		let yTick;
		let yMax;
		if (typeof options.yMax === 'number' || typeof options.yTick === 'number') {
			if (typeof options.yMax === 'number' && typeof options.yTick === 'number') {
				yTick = options.yTick;
				steps = Math.max(1, Math.round(options.yMax / yTick));
				yMax = yTick * steps;
			} else if (typeof options.yTick === 'number') {
				yTick = options.yTick;
				steps = Math.max(1, Math.ceil(maxVal / yTick));
				yMax = yTick * steps;
			} else { // only yMax provided
				yMax = Math.max(options.yMax, 1);
				yTick = Math.max(1, Math.ceil(yMax / steps));
				// normalize yMax to a multiple of yTick
				steps = Math.max(1, Math.round(yMax / yTick));
				yMax = yTick * steps;
			}
		} else {
			steps = 4;
			yTick = Math.max(1, Math.ceil(maxVal / steps));
			yMax = yTick * steps;
		}
		// Extra bottom padding when labels are rotated so text isn't clipped
		const pad = { left: 38, right: 10, top: 10, bottom: (typeof options.xLabelPad === 'number') ? options.xLabelPad : (options.rotateX ? 72 : 28) };
		const width = el.clientWidth || 360;
		const height = options.height;
		// Prepare canvas
		el.innerHTML = '';
		const canvas = document.createElement('canvas');
		canvas.style.width = width + 'px';
		canvas.style.height = height + 'px';
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		el.appendChild(canvas);
		const ctx = canvas.getContext('2d');
		ctx.scale(dpr, dpr);
		// Draw background
		ctx.fillStyle = options.bg;
		ctx.fillRect(0,0,width,height);
		const plotW = width - pad.left - pad.right;
		const plotH = height - pad.top - pad.bottom;
		const originX = pad.left;
		const originY = height - pad.bottom;
		// Gridlines + y labels
		ctx.strokeStyle = options.grid;
		ctx.fillStyle = options.label;
		ctx.lineWidth = 1;
		ctx.font = `${options.labelFontSize}px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
		for (let i = 0; i <= steps; i++) {
			const yVal = (yMax / steps) * i;
			const y = originY - (yVal / yMax) * plotH + 0.5; // crisp line
			ctx.beginPath(); ctx.moveTo(originX, y); ctx.lineTo(originX + plotW, y); ctx.stroke();
			const label = String(yVal);
			ctx.fillText(label, 4, y + 3);
		}
		// X ticks step
		const xStep = options.showAllXLabels ? 1 : Math.max(1, Math.ceil(n / options.maxXTicks));
		// Bars
		const cellW = plotW / n;
		const barW = Math.max(4, Math.min(24, cellW * 0.68));
		// Blossom style gradient (top→bottom)
		let barFill = options.barColor;
		try {
			const grad = ctx.createLinearGradient(0, pad.top, 0, originY);
			grad.addColorStop(0, '#7c3aed'); // violet-600
			grad.addColorStop(1, '#6d28d9'); // violet-700
			barFill = grad;
		} catch(_) {}
		ctx.fillStyle = barFill;
		const hits = [];
		for (let i = 0; i < n; i++) {
			const v = values[i];
			const bh = Math.round((v / yMax) * plotH);
			const cx = originX + i * cellW + (cellW - barW) / 2;
			const top = originY - bh;
			// shadow
			ctx.save();
			ctx.shadowColor = 'rgba(124,58,237,0.28)';
			ctx.shadowBlur = 2; ctx.shadowOffsetY = 1;
			ctx.fillRect(cx, top, barW, Math.max(1, bh));
			ctx.restore();
			hits.push({x: cx, y: top, w: barW, h: Math.max(1, bh), label: data[i].label, value: v});
		}
		// X labels
		ctx.fillStyle = options.label;
		for (let i = 0; i < n; i += xStep) {
			const x = originX + i * cellW + cellW / 2;
			if (options.rotateX) {
				ctx.save();
				// Position just below the axis line but inside the bottom padding
				const baseY = originY + 6;
				ctx.translate(x, baseY);
				ctx.rotate(options.rotateX * Math.PI / 180);
				ctx.textAlign = 'right';
				ctx.textBaseline = 'top';
				ctx.fillText(data[i].label, 0, 0);
				ctx.restore();
			} else {
				ctx.textAlign = 'center';
				ctx.textBaseline = 'alphabetic';
				ctx.fillText(data[i].label, x, height - 8);
			}
		}
		// Empty-state
		if (sum === 0) {
			ctx.fillStyle = '#9ca3af';
			ctx.textAlign = 'center';
			ctx.fillText('데이터가 없습니다 (기간 내 기록 없음)', width/2, height/2);
		}

		// Interactions: show tooltip on hover (mousemove); hide on mouseleave
		const tip = ensureTooltip(el);
		function hitTest(x,y) {
			for (let i = 0; i < hits.length; i++) {
				const r = hits[i];
				if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
			}
			return null;
		}
		canvas.addEventListener('mousemove', (ev) => {
			const rect = canvas.getBoundingClientRect();
			const x = ev.clientX - rect.left; const y = ev.clientY - rect.top;
			const h = hitTest(x, y);
			canvas.style.cursor = h ? 'pointer' : 'default';
			if (h) {
				// Show tooltip above the hovered bar
				tip.textContent = `${h.label}: ${h.value}명`;
				tip.style.left = `${Math.min(Math.max(h.x + h.w/2, 50), width - 50)}px`;
				tip.style.top = `${Math.max(h.y, 24)}px`;
				tip.style.display = 'block';
			} else {
				tip.style.display = 'none';
			}
		});

		// On click, pin the tooltip near the mouse cursor position
		canvas.addEventListener('click', (ev) => {
			const rect = canvas.getBoundingClientRect();
			const x = ev.clientX - rect.left; const y = ev.clientY - rect.top;
			const h = hitTest(x, y);
			if (h) {
				tip.textContent = `${h.label}: ${h.value}명`;
				const lx = Math.min(Math.max(x, 50), width - 50);
				const ly = Math.max(y - 10, 24);
				tip.style.left = `${lx}px`;
				tip.style.top = `${ly}px`;
				tip.style.display = 'block';
			} else {
				tip.style.display = 'none';
			}
		});
		canvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
	}

	// (Removed) Donut chart renderer – only vertical bar charts are required

	function renderStatsCharts() {
		const monthly = countMonthlyLastYear(state.data);
		const daily = countDailyLastMonth(state.data);
		// diagnostics
		if ((monthly.parseFails || 0) > 0 || (daily.parseFails || 0) > 0) {
			console.warn(`[access-records] 날짜 파싱 실패: 월별 ${monthly.parseFails||0}건, 일별 ${daily.parseFails||0}건`);
		}
		// Dynamic y-axis scales
		const mStep = 10; // 월별: 10 단위
		const dStep = 5;  // 일별: 5 단위
		const mMaxVal = Math.max(0, ...monthly.data.map(d => d.value || 0));
		const dMaxVal = Math.max(0, ...daily.data.map(d => d.value || 0));
		const mYMax = Math.ceil((mMaxVal + mStep) / mStep) * mStep; // 최소 10 여유
		const dYMax = Math.ceil((dMaxVal + dStep) / dStep) * dStep; // 최소 5 여유
		renderBarTimeseries('access-stats-monthly', monthly.data, { height: 260, showAllXLabels: true, labelFontSize: 10, yMax: mYMax, yTick: mStep });
		renderBarTimeseries('access-stats-daily', daily.data, { height: 320, showAllXLabels: true, labelFontSize: 10, rotateX: -45, yMax: dYMax, yTick: dStep });
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
		render();
	};
	window.downloadServerCSV = function() {
		const csv = toCSV(state.filtered);
		const d = new Date();
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		const filename = `출입기록_${yyyy}${mm}${dd}.csv`;
		const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	};
	// Stats modal controls
	window.openServerStatsModal = function() { document.body.classList.add('modal-open'); openModal('server-stats-modal'); renderStatsCharts(); };
	window.closeServerStatsModal = function() { closeModal('server-stats-modal'); document.body.classList.remove('modal-open'); };
	window.openServerEditModal = function() { document.body.classList.add('modal-open'); openModal('server-edit-modal'); };
	window.closeServerEditModal = function() { closeModal('server-edit-modal'); document.body.classList.remove('modal-open'); };
	window.goToPage = function(n) {
		const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
		const target = Math.min(Math.max(parseInt(n, 10) || 1, 1), totalPages);
		state.page = target;
		render();
	};

	// Remove add flow in Records page: no direct add here

	window.populateEditModal = function(index) {
		const i = typeof index === 'number' ? index : (state.page - 1) * state.pageSize;
		const row = state.filtered[i];
		if (!row) return;
		document.getElementById('edit-date-in').value = row.date_in || '';
		document.getElementById('edit-person-type').value = row.person_type || '';
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
		document.getElementById('edit-goods-qty').value = row.goods_qty ?? 1;
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
		row.goods_qty = parseInt(document.getElementById('edit-goods-qty').value || '1', 10);
		saveAccessRecords(state.data);
		closeModal('server-edit-modal');
		filter();
	};

	// Delete action removed from Records (관리 열)

	document.addEventListener('DOMContentLoaded', function() {
		let stored = loadAccessRecords();
		// Versioned seeding: if data is missing or outdated, seed 600 samples
		const currentSeed = localStorage.getItem(ACCESS_RECORDS_SEED_VERSION_KEY);
		if (!stored || stored.length < 600 || currentSeed !== ACCESS_RECORDS_SEED_VERSION) {
			const seeded = sampleData();
			saveAccessRecords(seeded);
			localStorage.setItem(ACCESS_RECORDS_SEED_VERSION_KEY, ACCESS_RECORDS_SEED_VERSION);
			stored = seeded;
		}
		state.data = stored.length ? stored : sampleData();
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
		// Column visibility: store per-path selection
		function storageKey() { return `access:cols:${window.location.pathname}`; }
	function loadColState() {
		try { const j = localStorage.getItem(storageKey()); return j ? JSON.parse(j) : null; } catch(_) { return null; }
	}
	function saveColState(stateObj) {
		try { localStorage.setItem(storageKey(), JSON.stringify(stateObj)); } catch(_) {}
	}

	function applyInitialColumnVisibility() {
		const saved = loadColState();
		// Defaults: always-on => date_in, date_out, company(소속), person_name, purpose, place, laptop, manager, access_manager; others off
		const defaults = {
			date_in: true,
			date_out: true,
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
		stateToUse.date_out = true;
		// reflect into modal checkboxes
		Object.keys(stateToUse).forEach(key => {
			const cb = document.getElementById(`col-${key}`);
			if (cb) {
				cb.checked = !!stateToUse[key];
				if (key === 'manager' || key === 'access_manager' || key === 'date_out') cb.disabled = true;
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
		const defaults = { date_in:true, date_out:true, company:true, person_name:true, purpose:true, place:true, laptop:true, task_link:false, manager:true, access_manager:true, io_type:false, goods_type:false, goods_name:false, goods_qty:false };
		Object.keys(defaults).forEach(k => { const cb = document.getElementById(`col-${k}`); if (cb) cb.checked = !!defaults[k]; });
		// persist and apply without closing modal
		saveColState(defaults);
		syncColumnChipSelected();
		window.applyServerColumnSelection(true);
	};

	// Column selection modal handlers for this page
	window.applyServerColumnSelection = function(skipClose) {
		const keys = ['date_in','date_out','company','person_name','purpose','place','laptop','task_link','manager','access_manager','io_type','goods_type','goods_name','goods_qty'];
		const selected = {};
		keys.forEach(k => { const cb = document.getElementById(`col-${k}`); selected[k] = cb ? !!cb.checked : false; });
		// Force always-on
		selected.manager = true;
		selected.access_manager = true;
		selected.date_out = true;
		['manager','access_manager','date_out'].forEach(k => { const cb = document.getElementById(`col-${k}`); if (cb) { cb.checked = true; cb.disabled = true; } });
		saveColState(selected);
		// Toggle columns in the table
		const header = document.querySelector('#physical-table thead tr');
		const rows = document.querySelectorAll('#physical-table tbody tr');
		if (!header) return;
		const headers = Array.from(header.children);
		// column order: [select, date_in, date_out, company, person_name, purpose, place, laptop, task_link, manager, access_manager, io_type, goods_type, goods_name, goods_qty, actions]
		const keysInOrder = ['select','date_in','date_out','company','person_name','purpose','place','laptop','task_link','manager','access_manager','io_type','goods_type','goods_name','goods_qty','actions'];
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
		['manager','access_manager','date_out'].forEach(k => { const cb = document.getElementById(`col-${k}`); if (cb) { cb.checked = true; cb.disabled = true; } });
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
