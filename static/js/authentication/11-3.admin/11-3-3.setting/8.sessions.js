/* sessions.js v2.0.0 — 세션관리 (온프레미스 스타일) */
(function(){
	'use strict';

	/* ── 유틸 ── */
	function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
	function $(id) { return document.getElementById(id); }
	var ROLE_MAP = { 'ADMIN':'관리자','admin':'관리자','USER':'사용자','user':'사용자','TEAM_LEADER':'팀장','team_leader':'팀장','APPROVER':'승인권자','approver':'승인권자','AUDITOR':'감사자','auditor':'감사자' };
	function roleLabel(r) { return ROLE_MAP[r] || r || '—'; }

	function relativeTime(dateStr) {
		if (!dateStr) return '—';
		var d = new Date(dateStr.replace(' ', 'T'));
		var now = new Date();
		var diff = Math.floor((now - d) / 1000);
		if (diff < 60) return '방금 전';
		if (diff < 3600) return Math.floor(diff / 60) + '분 전';
		if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
		return Math.floor(diff / 86400) + '일 전';
	}

	/* ── 상태 ── */
	var _rows = [];
	var _total = 0;
	var _page = 1;
	var _pageSize = 20;
	var _searchTerm = '';
	var _debounce = null;

	/* ══════════════════════════════════════════════
	   DATA
	══════════════════════════════════════════════ */
	function loadSessions() {
		var qs = '?page=' + _page + '&per_page=' + _pageSize;
		if (_searchTerm) qs += '&search=' + encodeURIComponent(_searchTerm);

		fetch('/admin/auth/active-sessions' + qs)
			.then(function(r) { return r.json(); })
			.then(function(data) {
				if (data.error) { showError(data.error); return; }
				_rows = data.rows || [];
				_total = data.total || 0;
				renderAll();
			})
			.catch(function() { showError('세션 목록을 불러올 수 없습니다.'); });
	}

	function showError(msg) {
		var tbody = $('sess-tbody');
		if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px 16px;color:#ef4444;font-size:14px;">' + esc(msg) + '</td></tr>';
	}

	/* ══════════════════════════════════════════════
	   RENDER
	══════════════════════════════════════════════ */
	function renderAll() {
		renderTable();
		renderPagination();
		updateSummary();
		updateEmptyState();
		updateBulkButton();
	}

	function renderTable() {
		var tbody = $('sess-tbody');
		if (!tbody) return;
		if (_rows.length === 0) { tbody.innerHTML = ''; return; }

		var html = '';
		for (var i = 0; i < _rows.length; i++) {
			var r = _rows[i];
			var isCurrent = r.is_current;
			var statusBadge = isCurrent
				? '<span class="status-pill"><span class="status-dot" style="background:#6366F1"></span>현재 세션</span>'
				: '<span class="status-pill"><span class="status-dot" style="background:#10b981"></span>활성</span>';
			var checkBox = isCurrent
				? '<input type="checkbox" disabled>'
				: '<input type="checkbox" class="sess-row-cb" data-id="' + r.id + '">';
			var terminateCell = isCurrent
				? '<span class="sess-muted">—</span>'
				: '<button type="button" class="action-btn sess-terminate-btn" data-action="terminate" data-id="' + r.id + '" title="종료">'
				+ '<img src="/static/image/svg/list/free-icon-ban.svg" alt="종료" class="action-icon">'
				+ '</button>';

			html += '<tr' + (isCurrent ? ' class="sess-row-current"' : '') + ' data-id="' + r.id + '">';
			html += '<td>' + checkBox + '</td>';
			html += '<td>' + esc(r.department || '—') + '</td>';
			html += '<td>' + esc(r.user_name || r.emp_no) + '</td>';
			html += '<td>' + esc(roleLabel(r.role)) + '</td>';
			html += '<td>' + esc(r.browser || '—') + ' / ' + esc(r.os || '—') + '</td>';
			html += '<td><code class="sess-ip">' + esc(r.ip_address || '—') + '</code></td>';
			html += '<td>' + esc(r.created_at || '—') + '</td>';
			html += '<td>' + relativeTime(r.last_active) + '<br><span class="sess-sub">' + esc(r.last_active || '') + '</span></td>';
			html += '<td>' + statusBadge + '</td>';
			html += '<td data-col="actions" class="system-actions">' + terminateCell + '</td>';
			html += '</tr>';
		}
		tbody.innerHTML = html;

		/* 체크박스 & 행 선택 */
		var cbs = tbody.querySelectorAll('.sess-row-cb');
		for (var j = 0; j < cbs.length; j++) {
			cbs[j].addEventListener('change', onRowCheckChange);
		}
		var allCb = $('sess-check-all');
		if (allCb) allCb.checked = false;

		/* 행 클릭 시 체크박스 토글 (온프레미스 동일) */
		var trs = tbody.querySelectorAll('tr');
		for (var k = 0; k < trs.length; k++) {
			trs[k].addEventListener('click', function(e) {
				if (e.target.classList.contains('sess-row-cb') || e.target.closest('.sess-row-cb')) return;
				if (e.target.closest('.system-actions') || e.target.closest('.sess-terminate-btn') || e.target.closest('.action-btn')) return;
				var tr = e.target.closest('tr');
				if (!tr) return;
				var cb = tr.querySelector('.sess-row-cb');
				if (!cb) return;
				cb.checked = !cb.checked;
				cb.dispatchEvent(new Event('change', { bubbles: true }));
			});
		}
	}

	function onRowCheckChange(e) {
		var tr = e.target.closest('tr');
		if (tr) { e.target.checked ? tr.classList.add('selected') : tr.classList.remove('selected'); }
		syncCheckAll();
		updateBulkButton();
	}

	function syncCheckAll() {
		var all = document.querySelectorAll('.sess-row-cb');
		var checked = document.querySelectorAll('.sess-row-cb:checked');
		var allCb = $('sess-check-all');
		if (allCb) allCb.checked = (all.length > 0 && all.length === checked.length);
	}

	function updateBulkButton() {
		var btn = $('sess-bulk-terminate-btn');
		if (btn) btn.disabled = (document.querySelectorAll('.sess-row-cb:checked').length === 0);
	}

	function updateSummary() {
		var totalEl = $('sess-total-count');
		var usersEl = $('sess-unique-users');
		var badgeEl = $('sess-count-badge');
		if (totalEl) totalEl.textContent = _total;
		if (badgeEl) {
			badgeEl.textContent = _total;
			badgeEl.classList.remove('large-number', 'very-large-number');
			if (_total >= 1000) badgeEl.classList.add('very-large-number');
			else if (_total >= 100) badgeEl.classList.add('large-number');
		}
		if (usersEl) {
			var unique = {};
			for (var i = 0; i < _rows.length; i++) unique[_rows[i].emp_no] = true;
			usersEl.textContent = Object.keys(unique).length;
		}
	}

	function updateEmptyState() {
		var tbl = $('sess-table');
		var empty = $('sess-empty');
		if (_rows.length === 0 && _total === 0) {
			if (tbl) tbl.style.display = 'none';
			if (empty) { empty.hidden = false; empty.style.display = ''; }
		} else {
			if (tbl) tbl.style.display = '';
			if (empty) { empty.hidden = true; empty.style.display = 'none'; }
		}
	}

	/* ══════════════════════════════════════════════
	   PAGINATION (온프레미스 스타일)
	══════════════════════════════════════════════ */
	function renderPagination() {
		var totalPages = Math.max(1, Math.ceil(_total / _pageSize));
		if (_page > totalPages) _page = totalPages;

		/* info */
		var infoEl = $('sess-pagination-info');
		if (infoEl) {
			var s = (_page - 1) * _pageSize + 1;
			var e = Math.min(_page * _pageSize, _total);
			infoEl.textContent = _total === 0 ? '0개 항목' : (s + '-' + e + ' / ' + _total + '개 항목');
		}

		/* nav buttons */
		var firstBtn = $('sess-first'), prevBtn = $('sess-prev'), nextBtn = $('sess-next'), lastBtn = $('sess-last');
		if (firstBtn) firstBtn.disabled = (_page <= 1);
		if (prevBtn) prevBtn.disabled = (_page <= 1);
		if (nextBtn) nextBtn.disabled = (_page >= totalPages);
		if (lastBtn) lastBtn.disabled = (_page >= totalPages);

		/* page numbers */
		var container = $('sess-page-numbers');
		if (!container) return;
		container.innerHTML = '';

		var range = 5;
		var startP = Math.max(1, _page - Math.floor(range / 2));
		var endP = Math.min(totalPages, startP + range - 1);
		if (endP - startP < range - 1) startP = Math.max(1, endP - range + 1);

		for (var p = startP; p <= endP; p++) {
			var btn = document.createElement('button');
			btn.className = 'page-btn' + (p === _page ? ' active' : '');
			btn.textContent = p;
			btn.setAttribute('data-page', p);
			container.appendChild(btn);
		}
	}

	function goPage(p) {
		var totalPages = Math.max(1, Math.ceil(_total / _pageSize));
		_page = Math.max(1, Math.min(p, totalPages));
		loadSessions();
	}

	/* ══════════════════════════════════════════════
	   MODAL (온프레미스 스타일)
	══════════════════════════════════════════════ */
	function showModal(id) {
		var el = $(id);
		if (el) { el.classList.add('show'); el.setAttribute('aria-hidden', 'false'); document.body.classList.add('modal-open'); }
	}
	function hideModal(id) {
		var el = $(id);
		if (el) { el.classList.remove('show'); el.setAttribute('aria-hidden', 'true'); document.body.classList.remove('modal-open'); }
	}

	function showConfirm(title, message, detail) {
		return new Promise(function(resolve) {
			var titleEl = $('sess-confirm-title');
			var msgEl = $('sess-confirm-message');
			var detailEl = $('sess-confirm-detail');
			var okBtn = $('sess-confirm-ok');
			var cancelBtn = $('sess-confirm-cancel');
			if (titleEl) titleEl.textContent = title;
			if (msgEl) msgEl.textContent = message;
			if (detailEl) detailEl.textContent = detail || '선택한 세션을 강제 종료합니다.';
			showModal('sess-confirm-modal');

			function onOk() { cleanup(); resolve(true); }
			function onCancel() { cleanup(); resolve(false); }
			function onOverlay(e) { if (e.target === $('sess-confirm-modal')) { cleanup(); resolve(false); } }
			function cleanup() {
				okBtn.removeEventListener('click', onOk);
				cancelBtn.removeEventListener('click', onCancel);
				$('sess-confirm-modal').removeEventListener('click', onOverlay);
				hideModal('sess-confirm-modal');
			}
			okBtn.addEventListener('click', onOk);
			cancelBtn.addEventListener('click', onCancel);
			$('sess-confirm-modal').addEventListener('click', onOverlay);
		});
	}

	/* ══════════════════════════════════════════════
	   API
	══════════════════════════════════════════════ */
	function terminateSession(id) {
		return fetch('/admin/auth/active-sessions/' + id, { method: 'DELETE' })
			.then(function(r) { return r.json(); });
	}

	function bulkTerminate(ids) {
		return fetch('/admin/auth/active-sessions/bulk-terminate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids: ids })
		}).then(function(r) { return r.json(); });
	}

	function terminateAll() {
		return fetch('/admin/auth/active-sessions/terminate-all', { method: 'POST' })
			.then(function(r) { return r.json(); });
	}

	/* ══════════════════════════════════════════════
	   EVENTS
	══════════════════════════════════════════════ */
	function bindEvents() {
		/* 검색 */
		var searchInput = $('sess-search');
		var searchClear = $('sess-search-clear');
		if (searchInput) {
			searchInput.addEventListener('input', function() {
				clearTimeout(_debounce);
				_debounce = setTimeout(function() {
					_searchTerm = searchInput.value.trim();
					_page = 1;
					loadSessions();
				}, 300);
			});
			searchInput.addEventListener('keydown', function(e) {
				if (e.key === 'Escape') { searchInput.value = ''; _searchTerm = ''; _page = 1; loadSessions(); }
			});
		}
		if (searchClear) {
			searchClear.addEventListener('click', function() {
				if (searchInput) searchInput.value = '';
				_searchTerm = '';
				_page = 1;
				loadSessions();
			});
		}

		/* 새로고침 */
		var refreshBtn = $('sess-refresh-btn');
		if (refreshBtn) refreshBtn.addEventListener('click', function() { loadSessions(); });

		/* 페이지 사이즈 */
		var pageSizeSel = $('sess-page-size');
		if (pageSizeSel) {
			pageSizeSel.addEventListener('change', function() {
				_pageSize = parseInt(pageSizeSel.value, 10) || 20;
				_page = 1;
				loadSessions();
			});
		}

		/* 페이지네이션 nav */
		var pgFirst = $('sess-first'), pgPrev = $('sess-prev'), pgNext = $('sess-next'), pgLast = $('sess-last');
		if (pgFirst) pgFirst.addEventListener('click', function() { goPage(1); });
		if (pgPrev) pgPrev.addEventListener('click', function() { goPage(_page - 1); });
		if (pgNext) pgNext.addEventListener('click', function() { goPage(_page + 1); });
		if (pgLast) pgLast.addEventListener('click', function() { goPage(Math.ceil(_total / _pageSize)); });

		/* 페이지 번호 */
		var pgNumbers = $('sess-page-numbers');
		if (pgNumbers) {
			pgNumbers.addEventListener('click', function(e) {
				var btn = e.target.closest('[data-page]');
				if (btn) goPage(parseInt(btn.getAttribute('data-page'), 10));
			});
		}

		/* 전체 선택 */
		var checkAll = $('sess-check-all');
		if (checkAll) {
			checkAll.addEventListener('change', function() {
				var cbs = document.querySelectorAll('.sess-row-cb');
				for (var i = 0; i < cbs.length; i++) {
					cbs[i].checked = checkAll.checked;
					var tr = cbs[i].closest('tr');
					if (tr) { checkAll.checked ? tr.classList.add('selected') : tr.classList.remove('selected'); }
				}
				updateBulkButton();
			});
		}

		/* 개별 종료 (이벤트 위임) */
		var tbody = $('sess-tbody');
		if (tbody) {
			tbody.addEventListener('click', function(e) {
				var btn = e.target.closest('.sess-terminate-btn');
				if (!btn) return;
				var id = parseInt(btn.dataset.id, 10);
				var row = null;
				for (var i = 0; i < _rows.length; i++) { if (_rows[i].id === id) { row = _rows[i]; break; } }
				var name = row ? (row.user_name || row.emp_no) : '';
				showConfirm('세션 종료', name + '의 세션을 종료하시겠습니까?', name + '의 세션을 강제 종료합니다.').then(function(ok) {
					if (!ok) return;
					terminateSession(id).then(function(result) {
						if (result.success) { if (window.showToast) window.showToast(result.message, 'success'); loadSessions(); }
						else { if (window.showToast) window.showToast(result.message || '종료 실패', 'error'); }
					});
				});
			});
		}

		/* 선택 종료 */
		var bulkBtn = $('sess-bulk-terminate-btn');
		if (bulkBtn) {
			bulkBtn.addEventListener('click', function() {
				var checked = document.querySelectorAll('.sess-row-cb:checked');
				if (!checked.length) return;
				var ids = [];
				for (var i = 0; i < checked.length; i++) ids.push(parseInt(checked[i].dataset.id, 10));
				showConfirm('선택 세션 종료', ids.length + '개의 세션을 종료하시겠습니까?', '선택된 ' + ids.length + '개 세션을 강제 종료합니다.').then(function(ok) {
					if (!ok) return;
					bulkTerminate(ids).then(function(result) {
						if (result.success) { if (window.showToast) window.showToast(result.message, 'success'); loadSessions(); }
						else { if (window.showToast) window.showToast(result.message || '종료 실패', 'error'); }
					});
				});
			});
		}

		/* 전체 종료 */
		var terminateAllBtn = $('sess-terminate-all-btn');
		if (terminateAllBtn) {
			terminateAllBtn.addEventListener('click', function() {
				showConfirm('전체 세션 종료', '본인을 제외한 모든 세션을 종료합니다.', '현재 사용 중인 세션을 제외한 모든 세션을 강제 종료합니다.').then(function(ok) {
					if (!ok) return;
					terminateAll().then(function(result) {
						if (result.success) { if (window.showToast) window.showToast(result.message, 'success'); loadSessions(); }
						else { if (window.showToast) window.showToast(result.message || '종료 실패', 'error'); }
					});
				});
			});
		}
	}

	/* ── 초기화 ── */
	function init() {
		loadSessions();
		bindEvents();
		/* 30초마다 자동 새로고침 */
		setInterval(function() { loadSessions(); }, 30000);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
