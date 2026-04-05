/*
 * tab11-task.js  v1.8
 * 프로젝트 작업 현황 (wrk_report by system) – 하드웨어 상세 작업이력 탭
 * ─ 체크박스, 작업이름(팝업창), 작업구분, 상태 pill, 작업결과, 완료시 실제시간, 페이지네이션, 통계모달
 * ─ v1.8: 삭제 확인 모달 추가 (tab14 스타일)
 */

(function () {
	'use strict';

	function initTab11Task() {
		try {
			if (window.__BLS_TK_HISTORY_WIRED === true) return;

			var prjTable = document.getElementById('prj-task-table');
			var prjEmpty = document.getElementById('prj-task-empty');
			var prjInfo  = document.getElementById('prj-task-pagination-info');
			if (!prjTable) return;

			var prjTbody = prjTable.querySelector('tbody');
			if (!prjTbody) return;

			window.__BLS_TK_HISTORY_WIRED = true;

			/* ── pagination state ── */
			var allItems   = [];
			var pageSize   = 10;
			var currentPage = 1;

			var pageSizeEl  = document.getElementById('prj-task-page-size');
			var pageNumsEl  = document.getElementById('prj-task-page-numbers');
			var btnFirst    = document.getElementById('prj-task-first');
			var btnPrev     = document.getElementById('prj-task-prev');
			var btnNext     = document.getElementById('prj-task-next');
			var btnLast     = document.getElementById('prj-task-last');
			var selectAllEl = document.getElementById('prj-select-all');

			/* ── ADMIN 권한 감지 ── */
			var _isAdmin = (function () {
				var main = document.querySelector('main.main-content[data-user-role]');
				if (!main) return false;
				var role = (main.getAttribute('data-user-role') || '').toUpperCase();
				return role === 'ADMIN' || role === '관리자';
			})();

			/* ── 모달 헬퍼 ── */
			function openModal(id) {
				if (typeof window.openModal === 'function') { window.openModal(id); return; }
				var el = document.getElementById(id);
				if (!el) return;
				document.body.classList.add('modal-open');
				el.classList.add('show');
				el.setAttribute('aria-hidden', 'false');
			}
			function closeModal(id) {
				if (typeof window.closeModal === 'function') { window.closeModal(id); return; }
				var el = document.getElementById(id);
				if (!el) return;
				el.classList.remove('show');
				el.setAttribute('aria-hidden', 'true');
				if (!document.querySelector('.modal-overlay-full.show'))
					document.body.classList.remove('modal-open');
			}

			/* ── 관리 컬럼 헤더 동적 추가 (ADMIN) ── */
			if (_isAdmin) {
				var theadRow = prjTable.querySelector('thead tr');
				if (theadRow && !theadRow.querySelector('.tk-actions-th')) {
					var th = document.createElement('th');
					th.className = 'tk-actions-th';
					th.textContent = '관리';
					theadRow.appendChild(th);
					var colgroup = prjTable.querySelector('colgroup');
					if (colgroup) {
						var col = document.createElement('col');
						col.className = 'actions-col';
						colgroup.appendChild(col);
					}
				}
			}

			/* -- helpers -- */

			function apiFetch(url, options) {
				var opts = Object.assign(
					{ credentials: 'same-origin', headers: { Accept: 'application/json' } },
					options || {}
				);
				return fetch(url, opts).then(function (res) {
					if (!res.ok) console.warn('[tab11-task] API response not ok:', res.status, url);
					return res.json().then(
						function (json) { return { res: res, json: json }; },
						function ()     { return { res: res, json: null }; }
					);
				});
			}

			function toDisplayDT(v) {
				if (!v) return '-';
				var s = String(v);
				if (s.includes('T')) { s = s.replace('T', ' ').replace(/\.\d+.*/, ''); }
				return s.slice(0, 16) || '-';
			}

			/* ── status pill (dot + text) ── */
			function statusDotClass(code) {
				var c = String(code || '').toUpperCase();
				if (c === 'IN_PROGRESS')  return 'ws-run';
				if (c === 'ARCHIVED')     return 'ws-run';
				return 'ws-wait';
			}



			/* ── result_type dot class ── */
			function resultDotClass(v) {
				var s = String(v || '').trim();
				if (s === '정상완료') return 'rs-ok';
				if (s === '일부완료') return 'rs-partial';
				if (s === '미완료')   return 'rs-fail';
				if (s === '롤백')     return 'rs-rollback';
				return 'rs-none';
			}

			/* ── 작업보고서 팝업 창 (window.open) ── */
			function openReportPopup(id) {
				var url = '/p/2.task_detail.html?id=' + encodeURIComponent(id);
				var w = 960, h = 800;
				var left = Math.max(0, Math.round((screen.width - w) / 2));
				var top  = Math.max(0, Math.round((screen.height - h) / 2));
				var features = 'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top
					+ ',scrollbars=yes,resizable=yes,menubar=no,toolbar=no,location=no,status=no';
				window.open(url, 'wrk_report_' + id, features);
			}

			/* ── row builder ── */

			function makeProjectRow(item) {
				var tr = document.createElement('tr');
				var isArchived = String(item.status || '').toUpperCase() === 'ARCHIVED';

				/* 1) checkbox */
				var tdCb = document.createElement('td');
				tdCb.className = 'prj-td-cb';
				var cb = document.createElement('input');
				cb.type = 'checkbox';
				cb.className = 'prj-row-check';
				if (item.id) cb.dataset.id = item.id;
				cb.addEventListener('change', syncSelectAll);
				tdCb.appendChild(cb);
				tr.appendChild(tdCb);

				/* 2) status pill */
				var tdStatus = document.createElement('td');
				var pill = document.createElement('span');
				pill.className = 'status-pill';
				var dot = document.createElement('span');
				dot.className = 'status-dot ' + statusDotClass(item.status);
				dot.setAttribute('aria-hidden', 'true');
				var txt = document.createElement('span');
				txt.className = 'status-text';
				txt.textContent = item.status_label || item.status || '-';
				pill.appendChild(dot);
				pill.appendChild(txt);
				tdStatus.appendChild(pill);
				tr.appendChild(tdStatus);

				/* 3) task_name — opens popup window */
				var tdName = document.createElement('td');
				if (item.id) {
					var a = document.createElement('a');
					a.href = '#';
					a.className = 'prj-task-link';
					a.textContent = item.task_name || '-';
					a.title = '작업보고서 보기';
					a.addEventListener('click', function (e) {
						e.preventDefault();
						openReportPopup(item.id);
					});
					tdName.appendChild(a);
				} else {
					tdName.textContent = item.task_name || '-';
				}
				tr.appendChild(tdName);

				/* 4) 작업 구분 (work_type) */
				tr.appendChild(_td(item.work_type));

				/* 6-7) start / end datetime — 완료(ARCHIVED)시 실제 시간 우선 */
				var startVal, endVal;
				if (isArchived) {
					startVal = toDisplayDT(item.actual_start_time || item.start_datetime);
					endVal   = toDisplayDT(item.actual_end_time   || item.end_datetime);
				} else {
					startVal = toDisplayDT(item.start_datetime);
					endVal   = toDisplayDT(item.end_datetime);
				}
				tr.appendChild(_td(startVal));
				tr.appendChild(_td(endVal));

				/* 8) 작업 결과 (result_type) — colored dot */
				var tdResult = document.createElement('td');
				var resText = (item.result_type && String(item.result_type).trim()) || '';
				if (resText) {
					var resWrap = document.createElement('span');
					resWrap.className = 'result-inline';
					var resDot = document.createElement('span');
					resDot.className = 'result-dot ' + resultDotClass(resText);
					resDot.setAttribute('aria-hidden', 'true');
					var resTxt = document.createElement('span');
					resTxt.textContent = resText;
					resWrap.appendChild(resDot);
					resWrap.appendChild(resTxt);
					tdResult.appendChild(resWrap);
				} else {
					tdResult.textContent = '-';
				}
				tr.appendChild(tdResult);

				/* 9) 관리 (ADMIN only) — 삭제 버튼 */
				if (_isAdmin && item.id) {
					var tdActions = document.createElement('td');
					tdActions.className = 'system-actions table-actions';
					tdActions.innerHTML =
						'<button class="action-btn danger js-tk-del" data-action="delete" type="button" title="삭제" aria-label="삭제">'
						+ '<img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">'
						+ '</button>';
					tr.appendChild(tdActions);
				}

				if (item.id) tr.setAttribute('data-report-id', String(item.id));

				return tr;
			}

			function _td(text) {
				var cell = document.createElement('td');
				cell.textContent = (!text || String(text).trim() === '') ? '-' : String(text);
				return cell;
			}

			/* ── select-all checkbox ── */
			function syncSelectAll() {
				if (!selectAllEl) return;
				var cbs = prjTbody.querySelectorAll('.prj-row-check');
				if (!cbs.length) { selectAllEl.checked = false; selectAllEl.indeterminate = false; return; }
				var checked = 0;
				cbs.forEach(function (c) { if (c.checked) checked++; });
				selectAllEl.checked = checked === cbs.length;
				selectAllEl.indeterminate = checked > 0 && checked < cbs.length;
			}
			if (selectAllEl) {
				selectAllEl.addEventListener('change', function () {
					var cbs = prjTbody.querySelectorAll('.prj-row-check');
					var val = selectAllEl.checked;
					cbs.forEach(function (c) { c.checked = val; });
				});
			}

			/* ── 삭제 확인 모달 (tab14 스타일) ── */
			var _pendingDeleteIds = [];
			var delModal   = document.getElementById('tk-delete-modal');
			var delConfirm = document.getElementById('tk-delete-confirm');
			var delCancel  = document.getElementById('tk-delete-cancel');
			var delCloseX  = document.getElementById('tk-delete-close');
			var delMsg     = document.getElementById('tk-delete-msg');

			function openDeleteModal(ids) {
				_pendingDeleteIds = ids || [];
				if (delMsg) {
					delMsg.textContent = _pendingDeleteIds.length > 1
						? '선택한 ' + _pendingDeleteIds.length + '건의 작업이력을 삭제하시겠습니까?'
						: '이 작업이력을 삭제하시겠습니까?';
				}
				openModal('tk-delete-modal');
			}
			function closeDeleteModal() {
				_pendingDeleteIds = [];
				closeModal('tk-delete-modal');
			}

			if (delConfirm) delConfirm.addEventListener('click', function () {
				if (_pendingDeleteIds.length) deleteReports(_pendingDeleteIds);
				closeDeleteModal();
			});
			if (delCancel)  delCancel.addEventListener('click', closeDeleteModal);
			if (delCloseX)  delCloseX.addEventListener('click', closeDeleteModal);
			if (delModal) {
				delModal.addEventListener('click', function (e) { if (e.target === delModal) closeDeleteModal(); });
			}

			/* ── 테이블 클릭: 삭제 버튼 / 체크박스 토글 ── */
			prjTable.addEventListener('click', function (ev) {
				/* 삭제 버튼 클릭 → 모달 확인 */
				var delBtn = ev.target.closest('.js-tk-del');
				if (delBtn) {
					var trDel = delBtn.closest('tr');
					var delId = trDel ? trDel.getAttribute('data-report-id') : null;
					if (delId) openDeleteModal([delId]);
					return;
				}
				/* 행 클릭 → 체크박스 토글 */
				var row = ev.target.closest('tr');
				if (!row || !prjTbody || row.parentNode !== prjTbody) return;
				if (ev.target.closest('button, a, input, select, textarea')) return;
				var cb = row.querySelector('.prj-row-check');
				if (cb) {
					cb.checked = !cb.checked;
					row.classList.toggle('selected', cb.checked);
					syncSelectAll();
				}
			});

			/* ── 삭제 API (순차 DELETE) ── */
			function deleteReports(ids) {
				if (!Array.isArray(ids)) ids = [ids];
				var promises = ids.map(function (id) {
					return fetch('/api/wrk/reports/' + encodeURIComponent(id), {
						method: 'DELETE',
						credentials: 'same-origin',
						headers: { 'Content-Type': 'application/json' }
					}).then(function (r) { return r.json(); });
				});
				Promise.all(promises).then(function (results) {
					var anySuccess = results.some(function (d) { return d && d.success; });
					if (anySuccess) {
						loadProjectTasks();
					} else {
						console.warn('[tab11-task] delete failed', results);
					}
				}).catch(function (err) {
					console.error('[tab11-task] delete error', err);
				});
			}

			/* ── pagination helpers ── */

			function totalPages() { return Math.max(1, Math.ceil(allItems.length / pageSize)); }

			function renderPage() {
				prjTbody.innerHTML = '';
				if (!allItems.length) { updatePrjEmpty(0); renderPaginationControls(); return; }

				var start = (currentPage - 1) * pageSize;
				var slice = allItems.slice(start, start + pageSize);
				slice.forEach(function (item) { prjTbody.appendChild(makeProjectRow(item)); });
				updatePrjEmpty(allItems.length);
				renderPaginationControls();
				if (selectAllEl) { selectAllEl.checked = false; selectAllEl.indeterminate = false; }
			}

			function renderPaginationControls() {
				var tp = totalPages();
				if (btnFirst) btnFirst.disabled = currentPage <= 1;
				if (btnPrev)  btnPrev.disabled  = currentPage <= 1;
				if (btnNext)  btnNext.disabled  = currentPage >= tp;
				if (btnLast)  btnLast.disabled  = currentPage >= tp;

				if (!pageNumsEl) return;
				pageNumsEl.innerHTML = '';
				if (allItems.length === 0) return;

				var maxVisible = 5;
				var half = Math.floor(maxVisible / 2);
				var startP = Math.max(1, currentPage - half);
				var endP   = Math.min(tp, startP + maxVisible - 1);
				if (endP - startP + 1 < maxVisible) startP = Math.max(1, endP - maxVisible + 1);

				for (var p = startP; p <= endP; p++) {
					var btn = document.createElement('button');
					btn.type = 'button';
					btn.className = 'page-btn' + (p === currentPage ? ' active' : '');
					btn.textContent = p;
					btn.dataset.page = p;
					btn.addEventListener('click', function () {
						currentPage = parseInt(this.dataset.page, 10);
						renderPage();
					});
					pageNumsEl.appendChild(btn);
				}
			}

			/* pagination events */
			if (btnFirst) btnFirst.addEventListener('click', function () { currentPage = 1; renderPage(); });
			if (btnPrev)  btnPrev.addEventListener('click',  function () { if (currentPage > 1) { currentPage--; renderPage(); } });
			if (btnNext)  btnNext.addEventListener('click',  function () { if (currentPage < totalPages()) { currentPage++; renderPage(); } });
			if (btnLast)  btnLast.addEventListener('click',  function () { currentPage = totalPages(); renderPage(); });
			if (pageSizeEl) {
				pageSizeEl.addEventListener('change', function () {
					pageSize = parseInt(this.value, 10) || 10;
					currentPage = 1;
					renderPage();
				});
			}

			/* ── empty / count ── */

			function updatePrjEmpty(count) {
				if (prjEmpty) {
					prjEmpty.hidden = count > 0;
					prjEmpty.style.display = count > 0 ? 'none' : '';
				}
				if (prjInfo) {
					if (count > 0) {
						var s = (currentPage - 1) * pageSize + 1;
						var e = Math.min(count, currentPage * pageSize);
						prjInfo.textContent = s + '-' + e + ' / ' + count + '개 항목';
					} else {
						prjInfo.textContent = '0개 항목';
					}
				}
			}

			/* ── resolve work / system name ── */

			function _norm(v) {
				var s = String(v == null ? '' : v).trim();
				return (s && s !== '-') ? s : '';
			}

			function resolveNames() {
				var h1 = document.querySelector('.page-header h1');
				var p  = document.querySelector('.page-header p');
				var workName = _norm(h1 ? h1.textContent : '');
				var sysName  = _norm(p  ? p.textContent  : '');
				if (workName || sysName) return { work: workName, sys: sysName };

				try {
					var params = new URLSearchParams(window.location.search || '');
					workName = _norm(params.get('work'));
					sysName  = _norm(params.get('system'));
					if (workName || sysName) return { work: workName, sys: sysName };
				} catch (_e) { }

				var prefixes = [];
				try { if (window.STORAGE_PREFIX) prefixes.push(String(window.STORAGE_PREFIX)); } catch (_e) { }
				try {
					var pk = (window.location.pathname || '').replace(/^\/p\//, '').replace(/\.html$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
					if (pk) {
						prefixes.push(pk);
						var parts = pk.split('_');
						if (parts.length > 1) { parts.pop(); prefixes.push(parts.join('_')); }
					}
				} catch (_e) { }
				var common = [
					'onpremise','cloud','frame','workstation',
					'storage','backup','director','sansw',
					'l2','l4','l7','ap','dedicateline',
					'firewall','vpn','ids','ips','hsm','kms','wips','etc'
				];
				for (var ci = 0; ci < common.length; ci++) prefixes.push(common[ci]);

				for (var pi = 0; pi < prefixes.length; pi++) {
					var pf = prefixes[pi];
					if (!pf) continue;
					var stores = [sessionStorage, localStorage];
					for (var si = 0; si < stores.length; si++) {
						try {
							var store = stores[si];
							var w = _norm(store.getItem(pf + ':selected:work'))
								|| _norm(store.getItem(pf + ':selected:work_name'));
							var s = _norm(store.getItem(pf + ':selected:system'))
								|| _norm(store.getItem(pf + ':selected:system_name'));
							if (w || s) return { work: w, sys: s };
						} catch (_e) { }
					}
				}
				return { work: '', sys: '' };
			}

			/* ── data loader ── */

			function loadProjectTasks() {
				var names = resolveNames();
				var workName = names.work;
				var sysName  = names.sys;
				if (!workName && !sysName) {
					allItems = [];
					renderPage();
					return;
				}
				var qp = [];
				if (workName) qp.push('work_name='   + encodeURIComponent(workName));
				if (sysName)  qp.push('system_name=' + encodeURIComponent(sysName));
				var url = '/api/wrk/reports/by-system?' + qp.join('&');
				apiFetch(url, { method: 'GET' }).then(function (result) {
					var json = result.json;
					if (json && json.success && json.items && json.items.length > 0) {
						allItems = json.items;
					} else {
						allItems = [];
					}
					currentPage = 1;
					renderPage();
				}).catch(function (err) {
					console.warn('[tab11-task] fetch error:', err);
					allItems = [];
					renderPage();
				});
			}

			/* ══════════════════════════════════════════════
			   통계 모달 (Chart.js stacked bar — 월 × 작업구분)
			   ══════════════════════════════════════════════ */
			var statsModal   = document.getElementById('prj-stats-modal');
			var statsOpenBtn = document.getElementById('prj-stats-open');
			var statsCloseBtn= document.getElementById('prj-stats-close');
			var statsYearBar = document.getElementById('prj-stats-year-bar');
			var statsCanvas  = document.getElementById('prj-stats-chart');
			var statsChartToggle = document.getElementById('prj-stats-chart-toggle');
			var statsChart   = null;
			var statsYear    = new Date().getFullYear();
			var statsChartType = 'bar';   /* 'bar' | 'doughnut' */
			var statsLastData = null;     /* 마지막으로 받은 API 데이터 캐시 */

			/* work-type → color mapping */
			var WT_COLORS = {
				'점검': '#6366f1', '테스트': '#f59e0b', '개선': '#10b981',
				'변경': '#3b82f6', '장애대응': '#ef4444', '구축': '#8b5cf6',
				'복구': '#ec4899', '지원': '#14b8a6', '교육': '#f97316', '기타': '#94a3b8'
			};
			var WT_DEFAULT_COLOR = '#64748b';
			function wtColor(wt) { return WT_COLORS[wt] || WT_DEFAULT_COLOR; }

			function openStatsModal() {
				if (!statsModal) return;
				statsModal.classList.add('show');
				document.body.classList.add('modal-open', 'stats-modal-open');
				statsModal.setAttribute('aria-hidden', 'false');
				loadStats(statsYear);
			}
			function closeStatsModal() {
				if (!statsModal) return;
				statsModal.classList.remove('show');
				document.body.classList.remove('modal-open', 'stats-modal-open');
				statsModal.setAttribute('aria-hidden', 'true');
			}

			if (statsOpenBtn) statsOpenBtn.addEventListener('click', openStatsModal);
			if (statsCloseBtn) statsCloseBtn.addEventListener('click', closeStatsModal);
			if (statsModal) {
				statsModal.addEventListener('click', function (e) {
					if (e.target === statsModal) closeStatsModal();
				});
			}

			function renderYearButtons(available, selected) {
				if (!statsYearBar) return;
				statsYearBar.innerHTML = '';
				available.forEach(function (y) {
					var btn = document.createElement('button');
					btn.type = 'button';
					btn.className = 'prj-stats-year-btn' + (y === selected ? ' active' : '');
					btn.textContent = y + '년';
					btn.addEventListener('click', function () {
						statsYear = y;
						loadStats(y);
					});
					statsYearBar.appendChild(btn);
				});
			}

			function buildChart(data) {
				statsLastData = data;
				if (statsChartType === 'doughnut') { buildDoughnut(data); return; }
				buildBarChart(data);
			}

			function buildBarChart(data) {
				if (!statsCanvas) return;
				var ctx = statsCanvas.getContext('2d');
				if (statsChart) { statsChart.destroy(); statsChart = null; }

				var labels = data.months.map(function (m) { return m + '월'; });
				var datasets = data.work_types.map(function (wt) {
					return {
						label: wt,
						data: data.series[wt],
						backgroundColor: wtColor(wt),
						borderRadius: 4,
						borderSkipped: false,
						maxBarThickness: 40
					};
				});

				statsChart = new Chart(ctx, {
					type: 'bar',
					data: { labels: labels, datasets: datasets },
					options: {
						responsive: true,
						maintainAspectRatio: false,
						plugins: {
							legend: {
								position: 'bottom',
								labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12 } }
							},
							tooltip: {
								mode: 'index',
								callbacks: {
									title: function (items) { return items.length ? items[0].label : ''; },
									label: function (item) { return ' ' + item.dataset.label + ': ' + item.formattedValue + '건'; }
								}
							}
						},
						scales: {
							x: { stacked: true, grid: { display: false } },
							y: {
								stacked: true,
								beginAtZero: true,
								ticks: {
									stepSize: 1,
									callback: function (v) { return Number.isInteger(v) ? v : ''; }
								},
								title: { display: true, text: '건수', font: { size: 12 } }
							}
						}
					}
				});
			}

			function buildDoughnut(data) {
				if (!statsCanvas) return;
				var ctx = statsCanvas.getContext('2d');
				if (statsChart) { statsChart.destroy(); statsChart = null; }

				/* 작업 구분별 연간 합계 */
				var totals = {};
				data.work_types.forEach(function (wt) {
					var sum = 0;
					data.series[wt].forEach(function (v) { sum += v; });
					if (sum > 0) totals[wt] = sum;
				});
				var labels = Object.keys(totals);
				var values = labels.map(function (k) { return totals[k]; });
				var colors = labels.map(function (k) { return wtColor(k); });

				statsChart = new Chart(ctx, {
					type: 'doughnut',
					data: {
						labels: labels,
						datasets: [{
							data: values,
							backgroundColor: colors,
							borderWidth: 2,
							borderColor: '#fff',
							hoverOffset: 8
						}]
					},
					options: {
						responsive: true,
						maintainAspectRatio: false,
						cutout: '55%',
						plugins: {
							legend: {
								position: 'bottom',
								labels: { usePointStyle: true, pointStyle: 'circle', padding: 16, font: { size: 12 } }
							},
							tooltip: {
								callbacks: {
									label: function (item) {
										var total = item.dataset.data.reduce(function (a, b) { return a + b; }, 0);
										var pct = total ? Math.round(item.raw / total * 100) : 0;
										return ' ' + item.label + ': ' + item.formattedValue + '건 (' + pct + '%)';
									}
								}
							}
						}
					}
				});
			}

			/* 차트 타입 토글 */
			if (statsChartToggle) {
				statsChartToggle.addEventListener('click', function (e) {
					var btn = e.target.closest('.prj-chart-type-btn');
					if (!btn) return;
					var type = btn.getAttribute('data-chart');
					if (type === statsChartType) return;
					statsChartType = type;
					/* 버튼 active 토글 */
					var btns = statsChartToggle.querySelectorAll('.prj-chart-type-btn');
					btns.forEach(function (b) { b.classList.remove('active'); });
					btn.classList.add('active');
					/* 차트 재빌드 */
					if (statsLastData) buildChart(statsLastData);
				});
			}

			function loadStats(year) {
				var names = resolveNames();
				var qp = [];
				if (names.work) qp.push('work_name=' + encodeURIComponent(names.work));
				if (names.sys)  qp.push('system_name=' + encodeURIComponent(names.sys));
				qp.push('year=' + encodeURIComponent(year));
				var url = '/api/wrk/reports/stats-by-system?' + qp.join('&');
				apiFetch(url).then(function (result) {
					var d = result.json;
					if (d && d.success) {
						renderYearButtons(d.available_years, d.year);
						buildChart(d);
					}
				}).catch(function (err) {
					console.warn('[tab11-task] stats fetch error:', err);
				});
			}

			/* ── wait for page title ── */
			var attemptCount = 0;
			var maxAttempts  = 30;
			function tryLoad() {
				var names = resolveNames();
				if ((names.work || names.sys) || attemptCount >= maxAttempts) {
					loadProjectTasks();
				} else {
					attemptCount++;
					setTimeout(tryLoad, 300);
				}
			}
			tryLoad();

		} catch (e) {
			console.warn('[tab11-task] init error', e);
		}
	}

	window.__blsInitTab11Task = initTab11Task;

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initTab11Task);
	} else {
		initTab11Task();
	}
})();
