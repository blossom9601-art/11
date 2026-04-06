/**
 * tab14-log.js
 * ──────────────────────────────────────────
 * 변경이력(Change Event) 탭 — 중앙 집중 조회 클라이언트.
 *
 * - /api/change-events  GET  (목록 조회, 필터/페이징)
 * - /api/change-events/{id}  GET  (상세 diff 조회)
 * - 행추가 버튼 없음 — 변경이력은 서버에서 자동 기록
 * - 10개 보기 셀렉터는 오른쪽 정렬
 * - CSV 다운로드 지원
 */

(function () {
	'use strict';

	/* ═══════════════════════════════════
	 *  중복 초기화 방지
	 * ═══════════════════════════════════ */
	// SPA re-entry: 이전 sentinel 제거 → IIFE 전체 재정의
	if (window.BlossomTab14Log) delete window.BlossomTab14Log;

	/* ═══════════════════════════════════
	 *  유틸리티
	 * ═══════════════════════════════════ */

	function q(id) { return document.getElementById(id); }

	function escapeHtml(s) {
		return String(s == null ? '' : s)
			.replace(/&/g, '&amp;').replace(/</g, '&lt;')
			.replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}

	/** ADMIN 권한 감지 — initFromPage 내부에서 재평가 */
	var _isAdmin = false;
	function _detectAdmin() {
		var main = document.querySelector('main.main-content[data-user-role]');
		if (!main) return false;
		var role = (main.getAttribute('data-user-role') || '').toUpperCase();
		return role === 'ADMIN' || role === '관리자';
	}

	/** action_type 한글 라벨 매핑 */
	var ACTION_LABELS = {
		'CREATE': '생성', 'UPDATE': '수정', 'DELETE': '삭제',
		'BULK_UPDATE': '일괄변경', 'ATTACHMENT': '첨부', 'COMMENT': '코멘트'
	};
	function actionLabel(type) {
		return ACTION_LABELS[(type || '').toUpperCase()] || type || '-';
	}

	/* ═══════════════════════════════════
	 *  모달 헬퍼
	 * ═══════════════════════════════════ */

	function openModal(id) {
		if (typeof window.openModal === 'function') { window.openModal(id); return; }
		var el = q(id);
		if (!el) return;
		document.body.classList.add('modal-open');
		el.classList.add('show');
		el.setAttribute('aria-hidden', 'false');
	}
	function closeModal(id) {
		if (typeof window.closeModal === 'function') { window.closeModal(id); return; }
		var el = q(id);
		if (!el) return;
		el.classList.remove('show');
		el.setAttribute('aria-hidden', 'true');
		if (!document.querySelector('.modal-overlay-full.show'))
			document.body.classList.remove('modal-open');
	}

	/* ═══════════════════════════════════
	 *  API 호출
	 * ═══════════════════════════════════ */

	function buildQueryString(params) {
		var parts = [];
		for (var k in params) {
			if (params[k] != null && params[k] !== '') {
				parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
			}
		}
		return parts.join('&');
	}

	/** 변경이력 목록 조회 */
	function apiListEvents(params) {
		var url = '/api/change-events?' + buildQueryString(params);
		return fetch(url, { method: 'GET', cache: 'no-store', headers: { 'Accept': 'application/json' } })
			.then(function (r) { return r.json(); });
	}

	/** 변경이력 상세 조회 (diff 포함) */
	function apiGetEvent(id) {
		var url = '/api/change-events/' + encodeURIComponent(id);
		return fetch(url, { method: 'GET', cache: 'no-store', headers: { 'Accept': 'application/json' } })
			.then(function (r) { return r.json(); });
	}

	/* ═══════════════════════════════════
	 *  entity_type / entity_id 추출 (페이지 컨텍스트)
	 * ═══════════════════════════════════ */

	function getEntityContext() {
		// 서버 렌더링된 data 속성 또는 URL 에서 추출
		var main = document.querySelector('main.main-content');
		var etype = '', eid = '';
		var title = '', subtitle = '';
		try {
			if (main && main.dataset) {
				etype = main.dataset.entityType || '';
				eid = main.dataset.entityId || '';
			}
		} catch (_) {}
		// 페이지 타이틀/서브타이틀 추출
		try {
			var titleEl = document.getElementById('page-title') || document.getElementById('page-header-title');
			var subtitleEl = document.getElementById('page-subtitle') || document.getElementById('page-header-subtitle');
			if (titleEl) title = (titleEl.textContent || '').trim();
			if (subtitleEl) subtitle = (subtitleEl.textContent || '').trim();
			if (title === '-') title = '';
			if (subtitle === '-') subtitle = '';
		} catch (_) {}
		// URL 쿼리에서도 시도
		if (!etype || !eid) {
			try {
				var sp = new URLSearchParams(location.search);
				etype = etype || sp.get('entity_type') || '';
				eid = eid || sp.get('entity_id') || sp.get('asset_id') || '';
				// asset_id 로 추출했으면 entity_type 기본값 설정
				if (eid && !etype && sp.get('asset_id')) {
					etype = 'hardware_asset';
				}
			} catch (_) {}
		}
		return { entity_type: etype, entity_id: eid, title: title, subtitle: subtitle };
	}

	/* ═══════════════════════════════════
	 *  메인 초기화
	 * ═══════════════════════════════════ */

	function initFromPage() {
		var table = q('lg-spec-table');
		if (!table) return;
		if (table.dataset && table.dataset.lgInit === '1') return;
		if (table.dataset) table.dataset.lgInit = '1';

		/* DOM이 준비된 시점에서 admin 권한 재평가 */
		_isAdmin = _detectAdmin();

		var tbody = table.querySelector('tbody');
		var empty = q('lg-empty');
		var _isCentralized = table.getAttribute('data-mode') === 'centralized';

		/* ── 상태 ── */
		var state = {
			page: 1,
			size: 10,
			total: 0,
			totalPages: 1,
			events: [] // 현재 페이지 데이터
		};

		/* ── 페이지 사이즈 ── */
		var pageSizeEl = q('lg-page-size');
		if (pageSizeEl) {
			try {
				var saved = localStorage.getItem('lg:changeEventPageSize');
				if (saved && ['10','20','50','100'].indexOf(saved) > -1) {
					state.size = parseInt(saved, 10);
					pageSizeEl.value = saved;
				}
			} catch (_) {}
			pageSizeEl.addEventListener('change', function () {
				state.size = parseInt(pageSizeEl.value, 10) || 10;
				state.page = 1;
				try { localStorage.setItem('lg:changeEventPageSize', String(state.size)); } catch (_) {}
				loadData();
			});
		}

		/* ── 필터 ── */
		var fDateFrom = q('lg-filter-date-from');
		var fDateTo   = q('lg-filter-date-to');
		var fAction   = q('lg-filter-action');
		var fKeyword  = q('lg-filter-keyword');
		var fSearch   = q('lg-filter-search');

		function getFilterParams() {
			var p = {
				page: state.page,
				size: state.size,
				sort: 'occurred_at_desc'
			};
			if (fDateFrom && fDateFrom.value) p.date_from = fDateFrom.value;
			if (fDateTo && fDateTo.value)     p.date_to = fDateTo.value;
			if (fAction && fAction.value)     p.action_type = fAction.value;
			if (fKeyword && fKeyword.value.trim()) p.keyword = fKeyword.value.trim();

			// entity 컨텍스트 (현재 페이지의 자산)
			var ctx = getEntityContext();
			if (ctx.entity_type) p.entity_type = ctx.entity_type;
			if (ctx.entity_id)   p.entity_id = ctx.entity_id;
			// title/subtitle 필터: 중앙 집중 모드이거나,
			// entity 컨텍스트가 없을 때 title/subtitle로 필터링
			if (_isCentralized || (!ctx.entity_type && !ctx.entity_id)) {
				if (ctx.title)    p.title = ctx.title;
				if (ctx.subtitle) p.subtitle = ctx.subtitle;
			}
			return p;
		}

		if (fSearch) {
			fSearch.addEventListener('click', function () {
				state.page = 1;
				loadData();
			});
		}
		// Enter 키로도 검색
		if (fKeyword) {
			fKeyword.addEventListener('keydown', function (e) {
				if (e.key === 'Enter') { e.preventDefault(); state.page = 1; loadData(); }
			});
		}

		/* ── 데이터 로드 ── */
		function loadData() {
			var params = getFilterParams();
			apiListEvents(params).then(function (data) {
				if (!data || !data.success) {
					console.warn('[tab14-log] API error', data);
					return;
				}
				state.events = data.events || [];
				state.total = data.total || 0;
				state.totalPages = data.total_pages || 1;
				state.page = data.page || 1;
				renderTable();
				renderPagination();
				syncEmpty();
				if (selectAll) selectAll.checked = false;
				syncBulkDeleteBtn();
			}).catch(function (err) {
				console.error('[tab14-log] load failed', err);
			});
		}

		/* ── 테이블 렌더링 ── */
		function renderTable() {
			if (!tbody) return;
			tbody.innerHTML = '';
			state.events.forEach(function (ev) {
				var tr = document.createElement('tr');
				tr.setAttribute('data-event-id', ev.id);

				// 변경항목: page_key (탭 이름)
				var section = ev.page_key || ev.title || '-';

				var cells = [
					'<td><input type="checkbox" class="lg-row-check" aria-label="행 선택"></td>',
					'<td data-col="when">' + escapeHtml(ev.occurred_at) + '</td>',
					'<td data-col="type">' + escapeHtml(actionLabel(ev.action_type)) + '</td>',
					'<td data-col="actor">' + escapeHtml(ev.actor_name || ev.actor_id || '-') + '</td>',
					'<td data-col="section">' + escapeHtml(section) + '</td>'
				];

				if (_isCentralized) {
					// 통합로그: 타이틀 + 서브타이틀
					cells.push('<td data-col="title">' + escapeHtml(ev.title || '-') + '</td>');
					cells.push('<td data-col="subtitle">' + escapeHtml(ev.subtitle || '-') + '</td>');
				} else {
					// 개별 탭: 변경내용(summary)
					var summaryText = ev.summary || '-';
					if (summaryText.length > 80) summaryText = summaryText.substring(0, 77) + '...';
					cells.push('<td data-col="summary" title="' + escapeHtml(ev.summary || '') + '">' + escapeHtml(summaryText) + '</td>');
				}

				cells.push(
					'<td class="system-actions table-actions">'
						+ '<button class="action-btn js-lg-view" data-action="edit" type="button" title="상세보기" aria-label="상세보기">'
							+ '<img src="/static/image/svg/free-icon-assessment.svg" alt="상세보기" class="action-icon">'
						+ '</button>'
					+ '</td>'
				);

				tr.innerHTML = cells.join('');
				tbody.appendChild(tr);
			});
		}

		/* ── 빈 상태 동기화 ── */
		function syncEmpty() {
			var hasRows = state.total > 0;
			if (empty) {
				empty.hidden = hasRows;
				empty.style.display = hasRows ? 'none' : '';
			}
			var csvBtn = q('lg-download-btn');
			if (csvBtn) {
				csvBtn.disabled = !hasRows;
				csvBtn.title = hasRows ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
			}
		}

		/* ── 페이지네이션 ── */
		var infoEl   = q('lg-pagination-info');
		var numWrap  = q('lg-page-numbers');
		var btnFirst = q('lg-first');
		var btnPrev  = q('lg-prev');
		var btnNext  = q('lg-next');
		var btnLast  = q('lg-last');

		function renderPagination() {
			var start = state.total ? (state.page - 1) * state.size + 1 : 0;
			var end   = Math.min(state.total, state.page * state.size);
			if (infoEl) infoEl.textContent = start + '-' + end + ' / ' + state.total + '개 항목';

			if (numWrap) {
				numWrap.innerHTML = '';
				for (var p = 1; p <= state.totalPages && p <= 50; p++) {
					var b = document.createElement('button');
					b.className = 'page-btn' + (p === state.page ? ' active' : '');
					b.textContent = String(p);
					b.dataset.page = String(p);
					numWrap.appendChild(b);
				}
			}
			if (btnFirst) btnFirst.disabled = (state.page <= 1);
			if (btnPrev)  btnPrev.disabled  = (state.page <= 1);
			if (btnNext)  btnNext.disabled  = (state.page >= state.totalPages);
			if (btnLast)  btnLast.disabled  = (state.page >= state.totalPages);
		}

		function goPage(p) {
			state.page = Math.max(1, Math.min(p, state.totalPages));
			loadData();
		}

		if (numWrap) {
			numWrap.addEventListener('click', function (e) {
				var b = e.target.closest('button.page-btn');
				if (b) goPage(parseInt(b.dataset.page, 10));
			});
		}
		if (btnFirst) btnFirst.addEventListener('click', function () { goPage(1); });
		if (btnPrev)  btnPrev.addEventListener('click', function () { goPage(state.page - 1); });
		if (btnNext)  btnNext.addEventListener('click', function () { goPage(state.page + 1); });
		if (btnLast)  btnLast.addEventListener('click', function () { goPage(state.totalPages); });

		/* ── 전체 선택 체크박스 ── */
		var selectAll = q('lg-select-all');
		if (selectAll) {
			selectAll.addEventListener('change', function () {
				var checks = table.querySelectorAll('.lg-row-check');
				for (var i = 0; i < checks.length; i++) {
					checks[i].checked = selectAll.checked;
					var tr = checks[i].closest('tr');
					if (tr) tr.classList.toggle('selected', selectAll.checked);
				}
				syncBulkDeleteBtn();
			});
		}

		/* ── 행 클릭: 체크박스 토글 ── */
		/* ── 삭제 확인 모달 ── */
		var _pendingDeleteIds = [];
		var delModal   = q('lg-delete-modal');
		var delConfirm = q('lg-delete-confirm');
		var delCancel  = q('lg-delete-cancel');
		var delCloseX  = q('lg-delete-close');
		var delMsg     = q('lg-delete-msg');

		function openDeleteModal(ids) {
			_pendingDeleteIds = ids || [];
			if (delMsg) {
				delMsg.textContent = _pendingDeleteIds.length > 1
					? '선택한 ' + _pendingDeleteIds.length + '건의 변경이력을 삭제하시겠습니까?'
					: '이 변경이력을 삭제하시겠습니까?';
			}
			openModal('lg-delete-modal');
		}
		function closeDeleteModal() {
			_pendingDeleteIds = [];
			closeModal('lg-delete-modal');
		}

		if (delConfirm) delConfirm.addEventListener('click', function () {
			if (_pendingDeleteIds.length) deleteEvent(_pendingDeleteIds);
			closeDeleteModal();
		});
		if (delCancel)  delCancel.addEventListener('click', closeDeleteModal);
		if (delCloseX)  delCloseX.addEventListener('click', closeDeleteModal);
		if (delModal) {
			delModal.addEventListener('click', function (e) { if (e.target === delModal) closeDeleteModal(); });
		}

		/* ── 행 클릭: 상세보기 / 삭제 / 체크박스 ── */
		table.addEventListener('click', function (ev) {
			// 상세보기 버튼
			var viewBtn = ev.target.closest('.js-lg-view');
			if (viewBtn) {
				var tr = viewBtn.closest('tr');
				var eventId = tr ? tr.getAttribute('data-event-id') : null;
				if (eventId) openDetailModal(eventId);
				return;
			}
			// 행 클릭 → 체크박스 토글
			var row = ev.target.closest('tr');
			if (!row || !tbody || row.parentNode !== tbody) return;
			if (ev.target.closest('button, a, input, select, textarea')) return;
			var cb = row.querySelector('.lg-row-check');
			if (cb) {
				cb.checked = !cb.checked;
				row.classList.toggle('selected', cb.checked);
				syncBulkDeleteBtn();
			}
		});

		table.addEventListener('change', function (ev) {
			var cb = ev.target.closest('.lg-row-check');
			if (!cb) return;
			var tr = cb.closest('tr');
			if (tr) tr.classList.toggle('selected', cb.checked);
			// 전체 선택 동기화
			if (selectAll) {
				var all = table.querySelectorAll('.lg-row-check');
				selectAll.checked = all.length > 0 && Array.prototype.every.call(all, function (c) { return c.checked; });
			}
			syncBulkDeleteBtn();
		});

		/* ── 삭제 API (ADMIN) — ids 배열 지원 ── */
		function deleteEvent(ids) {
			if (!Array.isArray(ids)) ids = [ids];
			fetch('/api/change-events/bulk-delete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: ids })
			})
			.then(function (r) { return r.json(); })
			.then(function (data) {
				if (data && data.success) {
					loadData();
				} else {
					console.warn('[tab14-log] delete failed', data && data.error);
				}
			})
			.catch(function (err) {
				console.error('[tab14-log] delete error', err);
			});
		}

		/* ── 상세 모달 (diff 표시) ── */
		var detailModal   = q('lg-detail-modal');
		var detailContent = q('lg-detail-content');
		var detailClose   = q('lg-detail-close');
		var detailOk      = q('lg-detail-ok');

		function openDetailModal(eventId) {
			if (!detailModal || !detailContent) return;
			detailContent.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:40px 0;">불러오는 중...</p>';
			openModal('lg-detail-modal');

			apiGetEvent(eventId).then(function (data) {
				if (!data || !data.success || !data.event) {
					detailContent.innerHTML = '<p style="color:var(--danger); padding:40px 28px;">데이터를 불러올 수 없습니다.</p>';
					return;
				}
				var ev = data.event;
				var html = '';
				var at = (ev.action_type || '').toUpperCase();

				/* ── SVG 아이콘 ── */
				var SVG_CALENDAR = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
				var SVG_TYPE     = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>';
				var SVG_USER     = '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
				var SVG_SECTION  = '<svg viewBox="0 0 24 24"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>';

				/* ── 배지 클래스 ── */
				var badgeCls = 'lg-evt-badge lg-evt-badge--' + at.toLowerCase();

				/* ── 변경항목 (탭 이름) ── */
				var section = ev.page_key || ev.title || '-';

				/* ── 요약 카드 (2×2 그리드) ── */
				html += '<div class="lg-evt-meta">';
				html += _metaItem(SVG_CALENDAR, '변경일자', escapeHtml(ev.occurred_at || '-'));
				html += _metaItem(SVG_TYPE, '변경유형', '<span class="' + badgeCls + '">' + escapeHtml(actionLabel(at)) + '</span>');
				html += _metaItem(SVG_USER, '변경자', escapeHtml(ev.actor_name || ev.actor_id || '-'));
				html += _metaItem(SVG_SECTION, '변경항목', escapeHtml(section || '-'));
				html += '</div>';

				/* ── 요약 문장 ── */
				if (ev.summary) {
					html += '<div class="lg-evt-summary">' + escapeHtml(ev.summary) + '</div>';
				}

				/* ── Diff 테이블 ── */
				var diffs = ev.diffs || [];
				html += '<div class="lg-diff-wrap">';
				if (diffs.length > 0) {
					html += '<div class="lg-diff-title">변경 필드 상세</div>';
					html += '<table class="lg-diff-table">';
					html += '<thead><tr>'
						+ '<th style="width:25%">필드</th>'
						+ '<th style="width:33%">이전값</th>'
						+ '<th class="lg-th-arrow"></th>'
						+ '<th style="width:33%">이후값</th>'
						+ '</tr></thead><tbody>';
					diffs.forEach(function (d) {
						var ov = d.is_sensitive ? '****' : (d.old_value || '');
						var nv = d.is_sensitive ? '****' : (d.new_value || '');
						html += '<tr>';
						html += '<td class="lg-td-field">' + escapeHtml(d.field) + '</td>';
						html += '<td class="lg-td-old">' + (ov ? escapeHtml(ov) : '<span class="lg-diff-empty">(비어있음)</span>') + '</td>';
						html += '<td class="lg-td-arrow">→</td>';
						html += '<td class="lg-td-new">' + (nv ? escapeHtml(nv) : '<span class="lg-diff-empty">(비어있음)</span>') + '</td>';
						html += '</tr>';
					});
					html += '</tbody></table>';
				} else {
					html += '<div class="lg-no-diff">상세 변경 필드 정보가 없습니다.</div>';
				}
				html += '</div>';

				detailContent.innerHTML = html;
			}).catch(function (err) {
				detailContent.innerHTML = '<p style="color:var(--danger); padding:40px 28px;">오류: ' + escapeHtml(String(err)) + '</p>';
			});
		}

		/** 요약 카드 항목 헬퍼 */
		function _metaItem(svgIcon, label, valueHtml) {
			return '<div class="lg-evt-meta-item">'
				+ '<div class="lg-evt-meta-icon">' + svgIcon + '</div>'
				+ '<div>'
				+ '<div class="lg-evt-meta-label">' + escapeHtml(label) + '</div>'
				+ '<div class="lg-evt-meta-val">' + valueHtml + '</div>'
				+ '</div></div>';
		}

		function closeDetailModal() { closeModal('lg-detail-modal'); }
		if (detailClose) detailClose.addEventListener('click', closeDetailModal);
		if (detailOk)    detailOk.addEventListener('click', closeDetailModal);
		if (detailModal) {
			detailModal.addEventListener('click', function (e) { if (e.target === detailModal) closeDetailModal(); });
			document.addEventListener('keydown', function (e) {
				if (e.key === 'Escape' && detailModal.classList.contains('show')) closeDetailModal();
			});
		}

		/* ── 선택 삭제 버튼 (ADMIN) ── */
		var bulkDelBtn = q('lg-bulk-delete-btn');
		function syncBulkDeleteBtn() {
			if (!bulkDelBtn) return;
			var checked = table.querySelectorAll('.lg-row-check:checked');
			bulkDelBtn.disabled = checked.length === 0;
			bulkDelBtn.title = checked.length > 0
				? checked.length + '건 선택 삭제'
				: '삭제할 항목을 선택하세요';
		}
		if (bulkDelBtn) {
			bulkDelBtn.addEventListener('click', function () {
				var checked = table.querySelectorAll('.lg-row-check:checked');
				var ids = [];
				for (var i = 0; i < checked.length; i++) {
					var tr = checked[i].closest('tr');
					var eid = tr ? tr.getAttribute('data-event-id') : null;
					if (eid) ids.push(eid);
				}
				if (ids.length === 0) return;
				openDeleteModal(ids);
			});
		}

		/* ── CSV 다운로드 ── */
		(function () {
			var csvBtn     = q('lg-download-btn');
			var csvModal   = q('lg-download-modal');
			var csvClose   = q('lg-download-close');
			var csvConfirm = q('lg-download-confirm');

			function openCsvModal() { openModal('lg-download-modal'); }
			function closeCsvModal() { closeModal('lg-download-modal'); }

			if (csvBtn) csvBtn.addEventListener('click', function () {
				if (csvBtn.disabled) return;
				openCsvModal();
			});
			if (csvClose) csvClose.addEventListener('click', closeCsvModal);
			if (csvModal) {
				csvModal.addEventListener('click', function (e) { if (e.target === csvModal) closeCsvModal(); });
			}
			if (csvConfirm) csvConfirm.addEventListener('click', function () {
				var onlySel = !!(q('lg-csv-range-selected') && q('lg-csv-range-selected').checked);
				exportCSV(onlySel);
				closeCsvModal();
			});
		})();

		function exportCSV(onlySelected) {
			var headers = _isCentralized
				? ['변경일자', '변경유형', '변경자', '변경항목', '타이틀', '서브타이틀']
				: ['변경일자', '변경유형', '변경자', '변경항목', '변경내용'];
			var rows = [];
			var trs = Array.from(tbody.querySelectorAll('tr'));
			trs.forEach(function (tr) {
				if (onlySelected) {
					var cb = tr.querySelector('.lg-row-check');
					if (!cb || !cb.checked) return;
				}
				var row = [
					(tr.querySelector('[data-col="when"]') || {}).textContent || '',
					(tr.querySelector('[data-col="type"]') || {}).textContent || '',
					(tr.querySelector('[data-col="actor"]') || {}).textContent || '',
					(tr.querySelector('[data-col="section"]') || {}).textContent || ''
				];
				if (_isCentralized) {
					row.push((tr.querySelector('[data-col="title"]') || {}).textContent || '');
					row.push((tr.querySelector('[data-col="subtitle"]') || {}).textContent || '');
				} else {
					row.push((tr.querySelector('[data-col="summary"]') || {}).getAttribute('title') || (tr.querySelector('[data-col="summary"]') || {}).textContent || '');
				}
				rows.push(row);
			});
			if (rows.length === 0) return;

			function esc(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }
			var lines = [headers].concat(rows).map(function (arr) { return arr.map(esc).join(','); });
			var csv = '\uFEFF' + lines.join('\r\n');
			var d = new Date();
			var fname = 'change_log_' + d.getFullYear()
				+ String(d.getMonth()+1).padStart(2,'0')
				+ String(d.getDate()).padStart(2,'0') + '.csv';
			try {
				var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
				var url = URL.createObjectURL(blob);
				var a = document.createElement('a');
				a.href = url; a.download = fname;
				document.body.appendChild(a); a.click();
				document.body.removeChild(a); URL.revokeObjectURL(url);
			} catch (_) {}
		}

		/* ── flatpickr 달력 (SPA 모드 대응) ── */
		(function initFlatpickr() {
			if (!window.flatpickr) return;
			if (!fDateFrom && !fDateTo) return;
			try { flatpickr.localize(flatpickr.l10ns.ko); } catch (_) {}
			var fpOpts = { dateFormat: 'Y-m-d', allowInput: true, disableMobile: true };
			try { fpOpts.locale = flatpickr.l10ns.ko || 'ko'; } catch (_) {}
			if (fDateFrom && !fDateFrom._flatpickr) flatpickr(fDateFrom, fpOpts);
			if (fDateTo && !fDateTo._flatpickr) flatpickr(fDateTo, fpOpts);
		})();

		/* ── flatpickr CSS 동적 로드 (SPA 모드에서 <head> 미교체 대응) ── */
		(function ensureFlatpickrCss() {
			var hrefs = [
				'/static/vendor/flatpickr/4.6.13/flatpickr.min.css',
				'/static/vendor/flatpickr/4.6.13/themes/airbnb.css'
			];
			try {
				var existing = Array.from(document.querySelectorAll('head link[rel="stylesheet"]'));
				var loaded = {};
				existing.forEach(function (el) { loaded[el.getAttribute('href') || ''] = true; });
				hrefs.forEach(function (h) {
					if (loaded[h]) return;
					var link = document.createElement('link');
					link.rel = 'stylesheet'; link.href = h;
					document.head.appendChild(link);
				});
			} catch (_) {}
		})();

		/* ── 최초 로드 ── */
		loadData();
	}

	/* ═══════════════════════════════════
	 *  외부 인터페이스
	 * ═══════════════════════════════════ */

	window.BlossomTab14Log = { initFromPage: initFromPage };

	document.addEventListener('DOMContentLoaded', function () {
		try { initFromPage(); } catch (e) {
			try { console.warn('[tab14-log] auto init failed', e); } catch (_) {}
		}
	});

	// SPA: sentinel 제거 패턴으로 전환 — blossom:pageLoaded 리스너 불필요
	// (DCL 인터셉트가 initFromPage 호출을 보장)
})();

