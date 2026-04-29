(function () {
	'use strict';

	var state = { rows: [], selectedId: null };

	function qs(id) { return document.getElementById(id); }
	function esc(value) {
		return String(value == null ? '' : value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}
	function badgeClass(status) {
		if (status === '사용 가능' || status === '승인') return 'status-badge status-approved';
		if (status === '승인 대기') return 'status-badge status-pending';
		if (status === '반려') return 'status-badge status-rejected';
		if (status === '만료') return 'status-badge status-expired';
		return 'status-badge status-blocked';
	}
	function fetchJson(url, options) {
		return fetch(url, Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options || {})).then(function (res) {
			return res.json().then(function (data) {
				if (!res.ok || data.success === false) {
					throw new Error(data.message || data.error || '요청 처리 중 오류가 발생했습니다.');
				}
				return data;
			});
		});
	}
	function postJson(url, data) {
		return fetchJson(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
			body: JSON.stringify(data || {})
		});
	}
	function buildQuery() {
		var name = (qs('access-search-name').value || '').trim();
		var resourceType = (qs('access-type-filter').value || '').trim();
		var params = new URLSearchParams();
		params.set('status', '사용 가능');
		if (name) params.set('search', name);
		if (resourceType) params.set('resource_type', resourceType);
		return params.toString();
	}
	function setStateMessage(message) {
		qs('access-state').textContent = message;
		qs('access-state').hidden = false;
		qs('access-table').hidden = true;
	}
	function endpointBadge(kind) {
		var cls = kind === 'SSH' ? 'kind-SSH' : 'kind-WEB';
		return '<span class="endpoint-kind-tag ' + cls + '">' + esc(kind || '') + '</span>';
	}
	function buildEndpointsCell(row) {
		var eps = row.endpoints || [];
		if (!eps.length) return '<span class="ac-meta">등록된 접속점이 없습니다.</span>';
		return '<div class="ac-endpoint-list">' + eps.map(function (ep, idx) {
			var url = ep.url || (ep.host || '-');
			var label = ep.label || (ep.kind === 'SSH' ? 'SSH' : 'WEB');
			var primaryMark = ep.is_primary ? '<span class="ac-endpoint-primary" title="대표 접속점">★</span>' : '';
			return '<div class="ac-endpoint-item" data-ep-idx="' + idx + '">' +
				'<div class="ac-endpoint-meta">' + endpointBadge(ep.kind) + primaryMark +
					'<span class="ac-endpoint-label">' + esc(label) + '</span>' +
				'</div>' +
				'<div class="ac-endpoint-url"><span class="ac-mono">' + esc(url) + '</span></div>' +
				'<button class="action-chip action-primary ac-endpoint-connect" data-action="access" data-id="' + row.id + '" data-ep-idx="' + idx + '">' +
					'<img src="/static/image/svg/control/free-icon-font-door-open.svg" alt="" class="ac-action-icon" aria-hidden="true">' +
					'<span>접속</span>' +
				'</button>' +
			'</div>';
		}).join('') + '</div>';
	}
	function renderRows(rows) {
		var body = qs('access-table-body');
		body.innerHTML = rows.map(function (row) {
			var selected = String(row.id) === String(state.selectedId) ? ' is-selected' : '';
			return '' +
				'<tr class="ac-row' + selected + '" data-id="' + row.id + '">' +
				'<td><strong>' + esc(row.resource_name) + '</strong>' +
					(row.description ? '<div class="ac-meta">' + esc(row.description) + '</div>' : '') +
				'</td>' +
				'<td>' + buildEndpointsCell(row) + '</td>' +
				'<td>' + esc(row.grant_end_date || '-') + '</td>' +
				'<td>' + esc(row.last_accessed_at || '-') + '</td>' +
				'</tr>';
		}).join('');
		qs('access-total').textContent = rows.length + '건';
		qs('access-total').classList.toggle('has-items', rows.length > 0);
		qs('access-state').hidden = true;
		qs('access-table').hidden = false;
		if (!rows.length) {
			setStateMessage('승인된 자원이 없습니다. 신청 메뉴에서 권한을 신청하세요.');
		}
	}
	function detailRow(label, value) {
		return '<div class="ac-detail-row"><span class="ac-detail-label">' + esc(label) + '</span>' +
			'<span class="ac-detail-value">' + value + '</span></div>';
	}
	function renderDetail(item) {
		if (!item || !item.id) {
			qs('access-detail-panel').innerHTML = '<div class="state-box">목록에서 자원을 선택하세요.</div>';
			return;
		}
		var eps = item.endpoints || [];
		var epsHtml = eps.length
			? '<div class="ac-endpoint-list">' + eps.map(function (ep, idx) {
				var url = ep.url || (ep.host || '-');
				var label = ep.label || (ep.kind === 'SSH' ? 'SSH' : 'WEB');
				var primaryMark = ep.is_primary ? '<span class="ac-endpoint-primary" title="대표 접속점">★</span>' : '';
				return '<div class="ac-endpoint-item">' +
					'<div class="ac-endpoint-meta">' + endpointBadge(ep.kind) + primaryMark +
						'<span class="ac-endpoint-label">' + esc(label) + '</span>' +
						'<span class="ac-meta">' + esc(ep.protocol || '') + '</span>' +
					'</div>' +
					'<div class="ac-endpoint-url"><span class="ac-mono">' + esc(url) + '</span></div>' +
					'<button class="action-chip action-primary ac-endpoint-connect" data-action="access" data-id="' + item.id + '" data-ep-idx="' + idx + '">' +
						'<img src="/static/image/svg/control/free-icon-font-door-open.svg" alt="" class="ac-action-icon" aria-hidden="true">' +
						'<span>접속</span>' +
					'</button>' +
				'</div>';
			}).join('') + '</div>'
			: '<span class="ac-meta">등록된 접속점이 없습니다.</span>';

		var caution = item.caution_text ? esc(item.caution_text) : '주의사항이 없습니다.';
		var html = '' +
			'<div class="ac-detail-head">' +
				'<div>' +
					'<div class="ac-detail-title">' + esc(item.resource_name || '-') + '</div>' +
					'<div class="ac-meta">접속점 ' + eps.length + '개</div>' +
				'</div>' +
			'</div>' +
			'<div class="ac-detail-grid">' +
				detailRow('접속점', epsHtml) +
				detailRow('승인 상태', '<span class="' + badgeClass(item.access_status) + '">' + esc(item.access_status || '-') + '</span>') +
				detailRow('유효기간', esc(item.grant_end_date || '-')) +
			'</div>' +
			'<div class="ac-caution">' +
				'<strong>접속 시 주의사항</strong>' +
				'<p>' + caution + '</p>' +
			'</div>';
		qs('access-detail-panel').innerHTML = html;
	}
	function loadDetail(id) {
		state.selectedId = id;
		highlightRow(id);
		fetchJson('/api/access-control/resources/' + id)
			.then(function (data) { renderDetail(data.item || {}); })
			.catch(function (err) { qs('access-detail-panel').innerHTML = '<div class="state-box">' + esc(err.message) + '</div>'; });
	}
	function highlightRow(id) {
		var rows = document.querySelectorAll('#access-table-body tr.ac-row');
		for (var i = 0; i < rows.length; i++) {
			if (rows[i].getAttribute('data-id') === String(id)) rows[i].classList.add('is-selected');
			else rows[i].classList.remove('is-selected');
		}
	}
	function connectEndpoint(id, epIdx) {
		var row = state.rows.filter(function (item) { return String(item.id) === String(id); })[0];
		if (!row) return;
		var eps = row.endpoints || [];
		var ep = eps[epIdx] || row.primary_endpoint || eps[0];
		if (!ep) { window.alert('등록된 접속점이 없습니다.'); return; }
		postJson('/api/access-control/resources/' + id + '/access', { endpoint_id: ep.id })
			.then(function () {
				if (ep.kind === 'WEB' && ep.url) {
					window.open(ep.url, '_blank', 'noopener');
				} else if (ep.kind === 'SSH') {
					var cmd = 'ssh ' + (ep.host || '') + (ep.port && ep.port !== 22 ? ' -p ' + ep.port : '');
					if (navigator.clipboard && navigator.clipboard.writeText) {
						navigator.clipboard.writeText(cmd).then(function () {
							window.alert('SSH 접속 명령이 클립보드에 복사되었습니다:\n' + cmd);
						}, function () {
							window.prompt('아래 SSH 명령을 복사해 사용하세요.', cmd);
						});
					} else {
						window.prompt('아래 SSH 명령을 복사해 사용하세요.', cmd);
					}
				}
				loadRows();
			})
			.catch(function (err) { window.alert(err.message); });
	}
	function loadRows() {
		fetchJson('/api/access-control/resources?' + buildQuery())
			.then(function (data) {
				var rows = (data.rows || []).filter(function (r) { return r && r.can_access === true; });
				state.rows = rows;
				renderRows(state.rows);
				if (state.rows.length) {
					var pickId = state.selectedId;
					var hit = state.rows.filter(function (r) { return String(r.id) === String(pickId); })[0];
					loadDetail(hit ? pickId : state.rows[0].id);
				} else {
					state.selectedId = null;
					renderDetail(null);
				}
			})
			.catch(function (err) { setStateMessage(err.message); });
	}
	function bindEvents() {
		qs('access-filter-form').addEventListener('input', loadRows);
		qs('access-filter-form').addEventListener('change', loadRows);
		qs('access-table-body').addEventListener('click', function (event) {
			var button = event.target.closest('button[data-action="access"]');
			if (button) {
				event.stopPropagation();
				var idx = parseInt(button.getAttribute('data-ep-idx'), 10) || 0;
				connectEndpoint(button.getAttribute('data-id'), idx);
				return;
			}
			var row = event.target.closest('tr.ac-row');
			if (row) loadDetail(row.getAttribute('data-id'));
		});
		qs('access-detail-panel').addEventListener('click', function (event) {
			var btn = event.target.closest('button[data-action="access"]');
			if (btn) {
				var idx = parseInt(btn.getAttribute('data-ep-idx'), 10) || 0;
				connectEndpoint(btn.getAttribute('data-id'), idx);
			}
		});
	}
	document.addEventListener('DOMContentLoaded', function () { bindEvents(); loadRows(); });
	if (document.readyState === 'interactive' || document.readyState === 'complete') {
		try { bindEvents(); loadRows(); } catch (e) { console.error('[access_list init]', e); }
	}
})();
