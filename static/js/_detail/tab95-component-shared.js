/*
 * tab95-component-shared.js  v1.0
 * ────────────────────────────────────────────────────────
 * 컴포넌트 탭 공통 컨트롤러.
 * 모든 상세 페이지의 "컴포넌트" 탭이 이 단일 JS를 사용한다.
 *
 * 프리셋(data-preset)에 따라 컬럼·API·CSV·분석을 자동 구성:
 *   - comp-model           : 카테고리 > 컴포넌트 상세 (모델별 조회)
 *   - vendor-manufacturer  : 카테고리 > 벤더 > 제조사 (제조사별 조회)
 *   - vendor-maintenance   : 카테고리 > 벤더 > 유지보수사 (유지보수사별 조회)
 *
 * ★ 주의: 이 파일 외부에서 t95-* ID를 직접 조작하지 마세요.
 * ★ 수정 시 모든 컴포넌트 탭 동작 확인 필수.
 */
(function () {
	'use strict';

	/* ================================================================
	   유틸리티
	   ================================================================ */
	function ready(fn) {
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
		else fn();
	}
	function dash(v) { var s = String(v == null ? '' : v).trim(); return s || '-'; }
	function toInt(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
	function toast(msg, level) {
		try { if (window.showToast) window.showToast(String(msg || ''), level || 'error'); else alert(String(msg || '')); } catch (_) { }
	}
	function escapeCSV(val) { return '"' + String(val == null ? '' : val).replace(/"/g, '""') + '"'; }
	function downloadCSV(filename, lines) {
		var csv = '\uFEFF' + lines.join('\r\n');
		try {
			var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
			var url = URL.createObjectURL(blob);
			var a = document.createElement('a'); a.href = url; a.download = filename;
			document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
		} catch (_) {
			var a2 = document.createElement('a');
			a2.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
			a2.download = filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
		}
	}
	function openModal(id) {
		var el = document.getElementById(id); if (!el) return;
		document.body.classList.add('modal-open');
		el.classList.add('show');
		el.setAttribute('aria-hidden', 'false');
	}
	function closeModal(id) {
		var el = document.getElementById(id); if (!el) return;
		el.classList.remove('show');
		el.setAttribute('aria-hidden', 'true');
		if (!document.querySelector('.modal-overlay-full.show'))
			document.body.classList.remove('modal-open');
	}

	/* ================================================================
	   프리셋 정의 — 컬럼·CSV·분석 설정
	   ================================================================ */

	/*
	 * 각 프리셋은 다음을 정의:
	 *   columns    : [{key, label, numeric}] — 테이블 컬럼 (checkbox 제외)
	 *   csvHeaders : [label, ...] — CSV 헤더
	 *   csvCols    : [key, ...]   — CSV 데이터 컬럼
	 *   renderCell : function(item, col) → HTML string
	 *   resolveId  : function(root) → entityId (API 호출용)
	 *   buildUrl   : function(root, entityId) → API URL
	 *   tabOrder   : [string, ...] — 분석 탭 표시 순서
	 *   groupKey   : string — 분석 차트의 카테고리 그룹 키
	 *   subKey     : string — 분석 차트의 하위 그룹 키
	 */

	function statusDotHTML(color) {
		var bg = color || '#6b7280';
		return '<span class="t95-dot" style="background:' + bg + '" aria-hidden="true"></span>';
	}

	var PRESETS = {
		/* ── 카테고리 > 컴포넌트 상세 (모델별) ── */
		'comp-model': {
			columns: [
				{ key: 'category',       label: '구분' },
				{ key: 'type',           label: '유형' },
				{ key: 'work_operation', label: '업무운영' },
				{ key: 'work_group',     label: '업무그룹' },
				{ key: 'work_name',      label: '업무명' },
				{ key: 'system_name',    label: '시스템명' },
				{ key: 'serial_number',  label: '일련번호' },
				{ key: 'firmware',       label: '펌웨어' },
				{ key: 'qty',            label: '할당수량', numeric: true }
			],
			csvHeaders: ['구분', '유형', '업무운영', '업무그룹', '업무명', '시스템명', '일련번호', '펌웨어', '할당수량'],
			csvCols:    ['category', 'type', 'work_operation', 'work_group', 'work_name', 'system_name', 'serial_number', 'firmware', 'qty'],
			renderCell: function (it, col) {
				if (col === 'work_name') return statusDotHTML(it.work_status_color) + ' ' + dash(it.work_name);
				if (col === 'qty') return it.qty != null ? String(it.qty) : '-';
				return dash(it[col]);
			},
			resolveId: function () {
				/* 모델명을 page title에서 추출 */
				var el = document.getElementById('page-header-title');
				return el ? (el.textContent || '').trim() : '';
			},
			buildUrl: function (root, modelName) {
				var endpoint = root.getAttribute('data-api-endpoint') || '';
				if (endpoint) return endpoint.replace('{id}', encodeURIComponent(modelName));
				return '/api/category/comp-model-assets?model=' + encodeURIComponent(modelName);
			},
			tabOrder: ['서버', '스토리지', 'SAN', '네트워크', '보안장비'],
			groupKey: 'category',
			subKey: 'type'
		},

		/* ── 카테고리 > 벤더 > 제조사 ── */
		'vendor-manufacturer': {
			columns: [
				{ key: 'category',    label: '구분' },
				{ key: 'model',       label: '모델명' },
				{ key: 'work_name',   label: '업무명' },
				{ key: 'system_name', label: '시스템명' },
				{ key: 'qty',         label: '할당수량', numeric: true }
			],
			csvHeaders: ['구분', '모델명', '업무명', '시스템명', '할당수량'],
			csvCols:    ['category', 'model', 'work_name', 'system_name', 'qty'],
			renderCell: function (it, col) {
				if (col === 'work_name') return statusDotHTML(it.work_status_color) + ' ' + dash(it.work_name);
				if (col === 'qty') return it.qty != null ? String(it.qty) : '-';
				return dash(it[col]);
			},
			resolveId: function (root) {
				var sessKey = root.getAttribute('data-session-key') || 'manufacturer:context';
				try { var raw = sessionStorage.getItem(sessKey); if (!raw) return 0; return toInt(JSON.parse(raw).id); } catch (_) { return 0; }
			},
			buildUrl: function (root, vendorId) {
				var endpoint = root.getAttribute('data-api-endpoint') || '';
				if (endpoint) return endpoint.replace('{id}', vendorId);
				return '/api/vendor-manufacturers/' + vendorId + '/comp-assets';
			},
			tabOrder: ['CPU', 'GPU', 'MEMORY', 'DISK', 'NIC', 'HBA', 'ETC'],
			groupKey: 'category',
			subKey: 'model'
		},

		/* ── 카테고리 > 벤더 > 유지보수사 ── */
		'vendor-maintenance': {
			columns: [
				{ key: 'category',    label: '구분' },
				{ key: 'type',        label: '유형' },
				{ key: 'model',       label: '모델명' },
				{ key: 'serial',      label: '일련번호' },
				{ key: 'work_name',   label: '업무 이름' },
				{ key: 'system_name', label: '시스템 이름' },
				{ key: 'manage_no',   label: '관리번호' },
				{ key: 'qty',         label: '할당수량', numeric: true }
			],
			csvHeaders: ['구분', '유형', '모델명', '일련번호', '업무 이름', '시스템 이름', '관리번호', '할당수량'],
			csvCols:    ['category', 'type', 'model', 'serial', 'work_name', 'system_name', 'manage_no', 'qty'],
			renderCell: function (it, col) {
				if (col === 'work_name') return statusDotHTML(it.work_status_color) + ' ' + dash(it.work_name);
				if (col === 'manage_no') return statusDotHTML(it.contract_status_color) + dash(it.manage_no);
				if (col === 'qty') return it.qty != null ? String(it.qty) : '-';
				return dash(it[col]);
			},
			resolveId: function (root) {
				var sessKey = root.getAttribute('data-session-key') || 'maintenance:context';
				try { var raw = sessionStorage.getItem(sessKey); if (!raw) return 0; return toInt(JSON.parse(raw).id); } catch (_) { return 0; }
			},
			buildUrl: function (root, vendorId) {
				var endpoint = root.getAttribute('data-api-endpoint') || '';
				if (endpoint) return endpoint.replace('{id}', vendorId);
				return '/api/vendor-maintenance/' + vendorId + '/comp-assets';
			},
			tabOrder: ['CPU', 'GPU', 'MEMORY', 'DISK', 'NIC', 'HBA', 'ETC'],
			groupKey: 'category',
			subKey: 'model'
		}
	};

	/* ================================================================
	   메인 초기화
	   ================================================================ */
	function initTab95() {
		var root = document.querySelector('.tab95-component-root');
		if (!root) return;

		var preset = (root.getAttribute('data-preset') || 'comp-model').toLowerCase();
		var cfg = PRESETS[preset];
		if (!cfg) { console.warn('[tab95] unknown preset:', preset); return; }

		var table     = document.getElementById('t95-table');
		var colgroup  = document.getElementById('t95-colgroup');
		var thead     = document.getElementById('t95-thead');
		var tbody     = document.getElementById('t95-tbody');
		var emptyEl   = document.getElementById('t95-empty');
		var csvBtn    = document.getElementById('t95-download-btn');
		var analyticsBtn = document.getElementById('t95-analytics-btn');
		var pageSizeSel  = document.getElementById('t95-page-size');
		var infoEl    = document.getElementById('t95-pagination-info');
		var numsWrap  = document.getElementById('t95-page-numbers');
		var btnFirst  = document.getElementById('t95-first');
		var btnPrev   = document.getElementById('t95-prev');
		var btnNext   = document.getElementById('t95-next');
		var btnLast   = document.getElementById('t95-last');

		if (!table || !tbody) return;

		/* 초기화 방지 (SPA 재진입 시) */
		if (table.dataset && table.dataset.t95Init === '1') {
			reloadData();
			return;
		}
		try { if (table.dataset) table.dataset.t95Init = '1'; } catch (_) { }

		/* 통계 버튼 가시성 */
		var showAnalytics = (root.getAttribute('data-show-analytics') || 'true') !== 'false';
		if (analyticsBtn && !showAnalytics) {
			analyticsBtn.style.display = 'none';
		}

		/* ── 테이블 헤더 동적 생성 ── */
		(function buildHeader() {
			var colHTML = '<col style="width:40px">';
			var thHTML = '<tr><th class="col-chk"><input type="checkbox" id="t95-select-all" aria-label="전체 선택"></th>';
			cfg.columns.forEach(function (c) {
				colHTML += '<col>';
				thHTML += '<th data-sort-col="' + c.key + '" class="sortable">' + c.label + '</th>';
			});
			thHTML += '</tr>';
			if (colgroup) colgroup.innerHTML = colHTML;
			if (thead) thead.innerHTML = thHTML;
			/* cols-N 클래스 추가 (checkbox 포함) */
			table.className = table.className.replace(/\bcols-\d+\b/g, '');
			table.classList.add('cols-' + (cfg.columns.length + 1));
		})();

		var selectAll = document.getElementById('t95-select-all');
		var ROW_CHECK_CLASS = 't95-row-check';
		var state = { page: 1, pageSize: 10 };
		var lastLoadedItems = [];

		/* ── 페이지 사이즈 복원 ── */
		(function () {
			try {
				var storeKey = root.getAttribute('data-storage-key') || '';
				if (!storeKey) return;
				var saved = localStorage.getItem(storeKey);
				if (pageSizeSel && saved && ['10', '20', '50', '100'].indexOf(saved) > -1) {
					state.pageSize = parseInt(saved, 10);
					pageSizeSel.value = saved;
				}
				if (pageSizeSel) pageSizeSel.addEventListener('change', function () {
					var v = parseInt(pageSizeSel.value, 10);
					if (!isNaN(v)) {
						state.page = 1;
						state.pageSize = v;
						if (storeKey) localStorage.setItem(storeKey, String(v));
						renderPage();
					}
				});
			} catch (_) { }
		})();

		/* ── 페이지네이션 ── */
		function allRows() { return Array.from(tbody.querySelectorAll('tr')); }
		function totalRows() { return allRows().length; }
		function totalPages() { return Math.max(1, Math.ceil(totalRows() / Math.max(1, state.pageSize))); }
		function clamp() {
			if (state.page > totalPages()) state.page = totalPages();
			if (state.page < 1) state.page = 1;
		}

		function updatePagination() {
			if (infoEl) {
				var t = totalRows(), s = t ? (state.page - 1) * state.pageSize + 1 : 0;
				var e = Math.min(t, state.page * state.pageSize);
				infoEl.textContent = s + '-' + e + ' / ' + t + '개 항목';
			}
			if (numsWrap) {
				var p = totalPages();
				numsWrap.innerHTML = '';
				for (var i = 1; i <= p && i <= 50; i++) {
					var b = document.createElement('button');
					b.className = 'page-btn' + (i === state.page ? ' active' : '');
					b.textContent = String(i);
					b.dataset.page = String(i);
					numsWrap.appendChild(b);
				}
			}
			if (btnFirst) btnFirst.disabled = (state.page === 1);
			if (btnPrev)  btnPrev.disabled  = (state.page === 1);
			if (btnNext)  btnNext.disabled  = (state.page === totalPages());
			if (btnLast)  btnLast.disabled  = (state.page === totalPages());
		}

		function renderPage() {
			clamp();
			var list = allRows(), s = (state.page - 1) * state.pageSize, e = s + state.pageSize - 1;
			list.forEach(function (tr, idx) {
				var vis = idx >= s && idx <= e;
				tr.style.display = vis ? '' : 'none';
				if (vis) tr.removeAttribute('data-hidden');
				else tr.setAttribute('data-hidden', '1');
			});
			updatePagination();
			syncSelectAll();
		}

		function go(p) { state.page = p; renderPage(); }
		if (numsWrap) numsWrap.addEventListener('click', function (e) {
			var b = e.target.closest('button.page-btn');
			if (b) go(parseInt(b.dataset.page, 10));
		});
		if (btnFirst) btnFirst.addEventListener('click', function () { go(1); });
		if (btnPrev)  btnPrev.addEventListener('click', function () { go(state.page - 1); });
		if (btnNext)  btnNext.addEventListener('click', function () { go(state.page + 1); });
		if (btnLast)  btnLast.addEventListener('click', function () { go(totalPages()); });

		/* ── 빈 상태 ── */
		function updateEmpty() {
			var has = !!tbody.querySelector('tr');
			if (emptyEl) { emptyEl.hidden = has; emptyEl.style.display = has ? 'none' : ''; }
			if (csvBtn) { csvBtn.disabled = !has; csvBtn.title = has ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.'; }
			renderPage();
		}

		/* ── 체크박스 ── */
		function syncSelectAll() {
			if (!selectAll) return;
			var vc = table.querySelectorAll('tbody tr:not([data-hidden]) .' + ROW_CHECK_CLASS);
			selectAll.checked = vc.length ? Array.prototype.every.call(vc, function (c) { return c.checked; }) : false;
		}

		if (selectAll) selectAll.addEventListener('change', function () {
			table.querySelectorAll('tbody tr:not([data-hidden]) .' + ROW_CHECK_CLASS + ':not([disabled])')
				.forEach(function (c) {
					c.checked = !!selectAll.checked;
					c.closest('tr').classList.toggle('selected', !!c.checked);
				});
		});

		table.addEventListener('click', function (ev) {
			var onCb = ev.target.closest('input[type="checkbox"].' + ROW_CHECK_CLASS);
			if (onCb) {
				var tr0 = onCb.closest('tr');
				if (tr0) tr0.classList.toggle('selected', !!onCb.checked);
				syncSelectAll();
				return;
			}
			if (ev.target.closest('button, a, input, select, textarea, label')) return;
			var tr = ev.target.closest('tr');
			if (!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase() !== 'tbody') return;
			if (tr.hasAttribute('data-hidden') || tr.style.display === 'none') return;
			var cb = tr.querySelector('.' + ROW_CHECK_CLASS);
			if (!cb || cb.disabled) return;
			cb.checked = !cb.checked;
			tr.classList.toggle('selected', !!cb.checked);
			syncSelectAll();
		});

		/* ── 정렬 ── */
		var sortState = { col: null, dir: 'asc' };

		function sortRows() {
			var col = sortState.col; if (!col) return;
			var isNum = cfg.columns.some(function (c) { return c.key === col && c.numeric; });
			var rows = allRows();
			rows.sort(function (a, b) {
				var aEl = a.querySelector('[data-col="' + col + '"]');
				var bEl = b.querySelector('[data-col="' + col + '"]');
				var aVal = aEl ? (aEl.textContent || '').trim() : '';
				var bVal = bEl ? (bEl.textContent || '').trim() : '';
				if (isNum) {
					var aN = parseFloat(aVal) || 0, bN = parseFloat(bVal) || 0;
					return sortState.dir === 'asc' ? aN - bN : bN - aN;
				}
				var cmp = aVal.localeCompare(bVal, 'ko');
				return sortState.dir === 'asc' ? cmp : -cmp;
			});
			rows.forEach(function (tr) { tbody.appendChild(tr); });
			go(1);
		}

		function updateSortIndicators() {
			table.querySelectorAll('thead th.sortable').forEach(function (th) {
				th.classList.remove('sort-asc', 'sort-desc');
				if (th.getAttribute('data-sort-col') === sortState.col) {
					th.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc');
				}
			});
		}

		thead.addEventListener('click', function (ev) {
			var th = ev.target.closest('th[data-sort-col]');
			if (!th) return;
			var col = th.getAttribute('data-sort-col');
			if (sortState.col === col) { sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc'; }
			else { sortState.col = col; sortState.dir = 'asc'; }
			updateSortIndicators();
			sortRows();
		});

		/* ── 행 렌더링 ── */
		function renderRows(items) {
			tbody.innerHTML = '';
			(items || []).forEach(function (it) {
				var tr = document.createElement('tr');
				var html = '<td><input type="checkbox" class="' + ROW_CHECK_CLASS + '" aria-label="행 선택"></td>';
				cfg.columns.forEach(function (c) {
					html += '<td data-col="' + c.key + '">' + cfg.renderCell(it, c.key) + '</td>';
				});
				tr.innerHTML = html;
				tbody.appendChild(tr);
			});
			if (sortState.col) { sortRows(); } else { go(1); }
			updateEmpty();
		}

		/* ── 데이터 로드 ── */
		function loadData() {
			var entityId = cfg.resolveId(root);
			if (!entityId) { lastLoadedItems = []; updateEmpty(); return; }
			var url = cfg.buildUrl(root, entityId);
			fetch(url, { credentials: 'same-origin' })
				.then(function (r) { return r.json(); })
				.then(function (data) {
					if (data && data.success) {
						lastLoadedItems = data.items || [];
						renderRows(lastLoadedItems);
					} else {
						lastLoadedItems = [];
						updateEmpty();
					}
				})
				.catch(function () { lastLoadedItems = []; updateEmpty(); });
		}

		function reloadData() {
			sortState.col = null;
			sortState.dir = 'asc';
			updateSortIndicators();
			loadData();
		}

		loadData();

		/* ── SPA 재진입 ── */
		document.addEventListener('blossom:pageLoaded', function () {
			if (!document.querySelector('.tab95-component-root')) return;
			/* 컴포넌트 탭 활성 상태 확인 */
			var tab = document.querySelector('.server-detail-tab-btn.active');
			if (tab && tab.textContent && tab.textContent.indexOf('컴포넌트') >= 0) {
				setTimeout(function () { try { reloadData(); } catch (e) { } }, 0);
			}
		});

		/* tab45:reload 호환 이벤트 (기존 코드 호환) */
		table.addEventListener('tab45:reload', function () { reloadData(); });

		/* ── CSV 다운로드 ── */
		if (csvBtn) csvBtn.addEventListener('click', function () { openModal('t95-download-modal'); });
		var csvClose = document.getElementById('t95-download-close');
		var csvModal = document.getElementById('t95-download-modal');
		if (csvClose) csvClose.addEventListener('click', function () { closeModal('t95-download-modal'); });
		if (csvModal) csvModal.addEventListener('click', function (e) { if (e.target === csvModal) closeModal('t95-download-modal'); });

		var csvConfirm = document.getElementById('t95-download-confirm');
		if (csvConfirm) csvConfirm.addEventListener('click', function () {
			var rangeAll = document.getElementById('t95-csv-range-all');
			var all = !rangeAll || rangeAll.checked;
			var list = allRows();
			if (!all) list = list.filter(function (tr) {
				var cb = tr.querySelector('.' + ROW_CHECK_CLASS);
				return cb && cb.checked;
			});
			if (!list.length) { toast('내보낼 행이 없습니다.', 'warning'); return; }

			var header = cfg.csvHeaders.map(escapeCSV).join(',');
			var lines = [header];
			list.forEach(function (tr) {
				lines.push(cfg.csvCols.map(function (c) {
					var td = tr.querySelector('[data-col="' + c + '"]');
					return escapeCSV(td ? (td.textContent || '').trim() : '');
				}).join(','));
			});

			var prefix = root.getAttribute('data-file-prefix') || 'component_';
			var d = new Date();
			var datePart = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
			downloadCSV(prefix + datePart + '.csv', lines);
			closeModal('t95-download-modal');
			toast('CSV 다운로드가 완료되었습니다.', 'success');
		});

		/* ================================================================
		   통계 분석 모달
		   ================================================================ */
		var analyticsModal = document.getElementById('t95-analytics-modal');
		var analyticsClose = document.getElementById('t95-analytics-close');
		var analyticsEmpty = document.getElementById('t95-analytics-empty');
		var tabStrip   = document.getElementById('t95-tab-strip');
		var tabContent = document.getElementById('t95-tab-content');

		/* 도넛 컬러 팔레트 */
		var DONUT_COLORS = ['#6366F1', '#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7', '#94a3b8'];

		/* 플로팅 툴팁 */
		var donutTip = document.createElement('div');
		donutTip.className = 'va-sb-tooltip';
		donutTip.style.display = 'none';
		document.body.appendChild(donutTip);

		function buildCatMap(items) {
			var gk = cfg.groupKey, sk = cfg.subKey;
			var map = {};
			(items || []).forEach(function (it) {
				var cat = (it[gk] || '').trim() || '-';
				var sub = (it[sk] || '').trim() || '-';
				if (!map[cat]) map[cat] = { count: 0, subs: {} };
				map[cat].count++;
				map[cat].subs[sub] = (map[cat].subs[sub] || 0) + 1;
			});
			return map;
		}

		function renderTabStrip95(catMap) {
			if (!tabStrip) return [];
			var all = Object.keys(catMap);
			var cats = [];
			(cfg.tabOrder || []).forEach(function (t) { if (all.indexOf(t) >= 0) cats.push(t); });
			all.forEach(function (t) { if (cats.indexOf(t) < 0) cats.push(t); });
			var html = '';
			cats.forEach(function (c, i) {
				html += '<button class="va-tab' + (i === 0 ? ' active' : '') + '" data-cat="' + c + '">'
					+ c + ' <span class="va-tab-count">' + catMap[c].count + '</span></button>';
			});
			tabStrip.innerHTML = html;
			return cats;
		}

		function renderCatContent95(catData) {
			if (!tabContent) return;
			/* Top 9 + 기타 */
			var subs = Object.keys(catData.subs).sort(function (a, b) { return catData.subs[b] - catData.subs[a]; });
			var segs = [], etcCount = 0;
			subs.forEach(function (s, i) {
				if (i < 9) { segs.push({ name: s, count: catData.subs[s] }); }
				else { etcCount += catData.subs[s]; }
			});
			if (etcCount > 0) segs.push({ name: '기타 (' + (subs.length - 9) + '종)', count: etcCount });

			var total = catData.count;
			var R = 120, r = 76, cx = 140, cy = 140, svgSize = 280;
			var paths = '', angle = -90;

			segs.forEach(function (seg, si) {
				var pct = total > 0 ? (seg.count / total) : 0;
				var sweep = pct * 360;
				if (sweep <= 0) return;
				var col = DONUT_COLORS[si % DONUT_COLORS.length];
				var pctStr = (pct * 100).toFixed(1);
				var name = seg.name.replace(/"/g, '&quot;');
				var attrs = ' class="va-donut-seg" data-name="' + name + '" data-count="' + seg.count + '" data-pct="' + pctStr + '" data-color="' + col + '"';

				if (sweep >= 359.99) {
					paths += '<path d="M' + cx + ',' + (cy - R)
						+ ' A' + R + ',' + R + ' 0 1,1 ' + cx + ',' + (cy + R)
						+ ' A' + R + ',' + R + ' 0 1,1 ' + cx + ',' + (cy - R)
						+ ' M' + cx + ',' + (cy - r)
						+ ' A' + r + ',' + r + ' 0 1,0 ' + cx + ',' + (cy + r)
						+ ' A' + r + ',' + r + ' 0 1,0 ' + cx + ',' + (cy - r)
						+ 'Z" fill="' + col + '"' + attrs + '/>';
				} else {
					var a1 = angle * Math.PI / 180, a2 = (angle + sweep) * Math.PI / 180;
					var large = sweep > 180 ? 1 : 0;
					var ox1 = cx + R * Math.cos(a1), oy1 = cy + R * Math.sin(a1);
					var ox2 = cx + R * Math.cos(a2), oy2 = cy + R * Math.sin(a2);
					var ix2 = cx + r * Math.cos(a2), iy2 = cy + r * Math.sin(a2);
					var ix1 = cx + r * Math.cos(a1), iy1 = cy + r * Math.sin(a1);
					paths += '<path d="M' + ox1.toFixed(2) + ',' + oy1.toFixed(2)
						+ ' A' + R + ',' + R + ' 0 ' + large + ',1 ' + ox2.toFixed(2) + ',' + oy2.toFixed(2)
						+ ' L' + ix2.toFixed(2) + ',' + iy2.toFixed(2)
						+ ' A' + r + ',' + r + ' 0 ' + large + ',0 ' + ix1.toFixed(2) + ',' + iy1.toFixed(2)
						+ 'Z" fill="' + col + '"' + attrs + '/>';
				}
				angle += sweep;
			});

			var html = '<div class="va-donut-wrap">';
			html += '<div class="va-donut-chart">';
			html += '<svg viewBox="0 0 ' + svgSize + ' ' + svgSize + '">' + paths + '</svg>';
			html += '<div class="va-donut-center"><span class="va-donut-total">' + total + '</span><span class="va-donut-label">건</span></div>';
			html += '</div>';
			html += '<div class="va-donut-legend">';
			segs.forEach(function (seg, si) {
				var col = DONUT_COLORS[si % DONUT_COLORS.length];
				var pct = total > 0 ? (seg.count / total * 100).toFixed(1) : '0.0';
				html += '<div class="va-donut-legend-item" data-name="' + seg.name.replace(/"/g, '&quot;') + '" data-count="' + seg.count + '" data-pct="' + pct + '" data-color="' + col + '">';
				html += '<span class="va-donut-ldot" style="background:' + col + '"></span>';
				html += '<span class="va-donut-lname">' + seg.name + '</span>';
				html += '<span class="va-donut-lval">' + seg.count + '</span>';
				html += '<span class="va-donut-lpct">' + pct + '%</span>';
				html += '</div>';
			});
			html += '</div></div>';
			tabContent.innerHTML = html;
		}

		/* 툴팁 이벤트 (이벤트 위임) */
		if (tabContent) {
			tabContent.addEventListener('mouseover', function (e) {
				var seg = e.target.closest('.va-donut-seg');
				if (!seg) return;
				donutTip.innerHTML = '<span class="va-sb-tip-dot" style="background:' + seg.dataset.color + '"></span>'
					+ '<span class="va-sb-tip-name">' + seg.dataset.name + '</span>'
					+ '<span class="va-sb-tip-val">' + seg.dataset.count + '건 (' + seg.dataset.pct + '%)</span>';
				donutTip.style.display = '';
			});
			tabContent.addEventListener('mousemove', function (e) {
				if (donutTip.style.display === 'none') return;
				donutTip.style.left = (e.clientX + 12) + 'px';
				donutTip.style.top = (e.clientY - 36) + 'px';
			});
			tabContent.addEventListener('mouseout', function (e) {
				if (e.target.closest('.va-donut-seg')) donutTip.style.display = 'none';
			});
		}

		function renderAnalytics() {
			var items = lastLoadedItems;
			if (!items.length) {
				if (analyticsEmpty) analyticsEmpty.style.display = '';
				if (tabStrip) tabStrip.innerHTML = '';
				if (tabContent) tabContent.innerHTML = '';
				return;
			}
			if (analyticsEmpty) analyticsEmpty.style.display = 'none';
			var catMap = buildCatMap(items);
			var cats = renderTabStrip95(catMap);
			if (cats.length > 0) renderCatContent95(catMap[cats[0]]);
			if (tabStrip) tabStrip.onclick = function (e) {
				var btn = e.target.closest('.va-tab');
				if (!btn) return;
				tabStrip.querySelectorAll('.va-tab').forEach(function (t) { t.classList.remove('active'); });
				btn.classList.add('active');
				var cat = btn.getAttribute('data-cat');
				if (catMap[cat]) renderCatContent95(catMap[cat]);
			};
		}

		if (analyticsBtn && showAnalytics) {
			analyticsBtn.addEventListener('click', function () {
				renderAnalytics();
				openModal('t95-analytics-modal');
			});
		}
		if (analyticsClose) analyticsClose.addEventListener('click', function () { closeModal('t95-analytics-modal'); });
		if (analyticsModal) analyticsModal.addEventListener('click', function (e) {
			if (e.target === analyticsModal) closeModal('t95-analytics-modal');
		});
	}

	/* 초기화 */
	ready(initTab95);
	document.addEventListener('blossom:pageLoaded', function () {
		var tab = document.querySelector('.server-detail-tab-btn.active');
		if (tab && tab.textContent && tab.textContent.indexOf('컴포넌트') >= 0) {
			setTimeout(function () { try { initTab95(); } catch (e) { } }, 0);
		}
	});
})();
