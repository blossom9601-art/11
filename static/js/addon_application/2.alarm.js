// 알림 센터 — API 연동 (v2.4)
document.addEventListener('DOMContentLoaded', function(){
	var $ = function(s, r){ return (r||document).querySelector(s); };
	var $$ = function(s, r){ return Array.from((r||document).querySelectorAll(s)); };

	var listEl       = $('#alarm-list');
	var emptyEl      = $('#alarm-empty');
	var lottieWrap   = $('#noti-lottie-wrap');
	var emptyTitleEl = $('#alarm-empty-title');
	var emptyDescEl  = $('#alarm-empty-desc');
	var unreadBadge  = $('#alarm-unread-badge');
	var headerLabel  = $('#noti-header-label');
	var readAllBtn   = $('#alarm-readall-btn');
	var paginationEl = $('#alarm-pagination');
	var lottieAnim   = null;

	var catTabs    = $$('.system-tab-btn[data-category]');
	var filterBtns = $$('.noti-filter-btn');

	var PER_PAGE = 10;
	var state = { category: '', readFilter: '', page: 1 };

	// ── 유틸 ──────────────────────────────────────────────

	function timeAgo(iso){
		if (!iso) return '';
		var d = new Date(iso);
		var now = new Date();
		var diff = Math.floor((now - d) / 1000);
		if (diff < 0) diff = 0;
		if (diff < 60) return '방금 전';
		if (diff < 3600) return Math.floor(diff/60) + '분 전';
		if (diff < 86400) return Math.floor(diff/3600) + '시간 전';
		if (diff < 604800) return Math.floor(diff/86400) + '일 전';
		var y = d.getFullYear();
		var m = String(d.getMonth()+1).padStart(2, '0');
		var day = String(d.getDate()).padStart(2, '0');
		var h = String(d.getHours()).padStart(2, '0');
		var min = String(d.getMinutes()).padStart(2, '0');
		return y + '.' + m + '.' + day + ' ' + h + ':' + min;
	}

	function _esc(s){
		var el = document.createElement('span');
		el.textContent = s;
		return el.innerHTML;
	}

	var TYPE_MAP = {
		'ticket_status': { icon: '/static/image/svg/alarm/free-icon-font-ticket-alt.svg', cls: 'noti-icon-ticket' },
		'task_status':   { icon: '/static/image/svg/alarm/free-icon-font-tools.svg', cls: 'noti-icon-task' },
		'calendar_24h':  { icon: '/static/image/svg/alarm/free-icon-font-calendar-pen.svg', cls: 'noti-icon-calendar' },
		'calendar_1h':   { icon: '/static/image/svg/alarm/free-icon-font-calendar-pen.svg', cls: 'noti-icon-calendar' }
	};

	var HEADER_LABELS = {
		'':         '전체 알림',
		'ticket':   '티켓 알림',
		'task':     '작업 알림',
		'calendar': '캘린더 알림'
	};

	var emptyCopy = {
		'':         { title: '알림이 없습니다', desc: '티켓·작업 상태가 변경되거나 일정이 다가오면 알려드립니다.' },
		'ticket':   { title: '티켓 알림이 없습니다', desc: '내가 접수 또는 신청한 티켓의 상태가 변경되면 표시됩니다.' },
		'task':     { title: '작업 알림이 없습니다', desc: '내가 접수 또는 신청한 작업의 상태가 변경되면 표시됩니다.' },
		'calendar': { title: '일정 알림이 없습니다', desc: '등록된 일정의 24시간 전, 1시간 전에 알려드립니다.' }
	};

	// ── Lottie ────────────────────────────────────────────

	function ensureLottie(){
		if (!lottieWrap || lottieAnim) return;
		if (typeof lottie === 'undefined') return;
		lottieAnim = lottie.loadAnimation({
			container: lottieWrap,
			renderer: 'svg',
			loop: true,
			autoplay: true,
			path: '/static/image/svg/alarm/free-animated-icon-envelope-settings-19017642.json'
		});
	}

	// ── API ───────────────────────────────────────────────

	function fetchNotifications(cb){
		var url = '/api/notifications?per_page=' + PER_PAGE + '&page=' + state.page;
		if (state.category) url += '&category=' + encodeURIComponent(state.category);
		if (state.readFilter) url += '&is_read=' + encodeURIComponent(state.readFilter);
		fetch(url, { credentials: 'same-origin' })
			.then(function(r){ return r.json(); })
			.then(function(data){
				if (data.success) cb(data);
				else cb({ rows: [], total: 0, unread: 0 });
			})
			.catch(function(){ cb({ rows: [], total: 0, unread: 0 }); });
	}

	function markRead(id, cb){
		fetch('/api/notifications/' + id + '/read', { method: 'PUT', credentials: 'same-origin' })
			.then(function(){ if (cb) cb(); }).catch(function(){});
	}

	function markAllRead(cb){
		fetch('/api/notifications/read-all', { method: 'POST', credentials: 'same-origin' })
			.then(function(){ if (cb) cb(); }).catch(function(){});
	}

	function deleteAll(cb){
		fetch('/api/notifications/delete-all', { method: 'POST', credentials: 'same-origin' })
			.then(function(res){ return res.json(); })
			.then(function(data){
				if (data.success && cb) cb();
			})
			.catch(function(err){ console.error('deleteAll error', err); });
	}

	// ── 렌더링 ────────────────────────────────────────────

	function updateBadge(count){
		if (!unreadBadge) return;
		if (count > 0){
			unreadBadge.textContent = count > 99 ? '99+' : String(count);
			unreadBadge.classList.add('visible');
		} else {
			unreadBadge.textContent = '';
			unreadBadge.classList.remove('visible');
		}
	}

	function render(data){
		var rows = data.rows || [];
		var total = data.total || 0;
		updateBadge(data.unread || 0);

		if (headerLabel) headerLabel.textContent = HEADER_LABELS[state.category] || '전체 알림';

		if (rows.length === 0 && state.page === 1){
			if (listEl) listEl.hidden = true;
			if (paginationEl) paginationEl.hidden = true;
			if (emptyEl) emptyEl.style.display = '';
			var copy = emptyCopy[state.category] || emptyCopy[''];
			if (emptyTitleEl) emptyTitleEl.textContent = copy.title;
			if (emptyDescEl) emptyDescEl.textContent = copy.desc;
			ensureLottie();
			if (listEl) listEl.innerHTML = '';
			return;
		}

		if (emptyEl) emptyEl.style.display = 'none';
		if (listEl) listEl.hidden = false;

		listEl.innerHTML = rows.map(function(item){
			var t = TYPE_MAP[item.noti_type] || { icon: '/static/image/svg/alarm/free-icon-font-ticket-alt.svg', cls: '' };
			var readCls = item.is_read ? ' is-read' : '';
			return '<li class="noti-row' + readCls + '" data-id="' + item.id + '">' +
				'<div class="noti-icon ' + t.cls + '"><img src="' + t.icon + '" alt=""></div>' +
				'<div class="noti-text">' +
					'<div class="noti-title">' + _esc(item.title) + '</div>' +
					'<div class="noti-msg">' + _esc(item.message || '') + '</div>' +
				'</div>' +
				'<div class="noti-meta">' +
					'<span class="noti-time">' + timeAgo(item.trigger_at) + '</span>' +
					(item.is_read ? '' : '<button class="noti-mark-btn" data-id="' + item.id + '">읽음</button>') +
				'</div>' +
			'</li>';
		}).join('');

		$$('.noti-mark-btn', listEl).forEach(function(btn){
			btn.addEventListener('click', function(e){
				e.stopPropagation();
				markRead(btn.getAttribute('data-id'), function(){ loadAndRender(); });
			});
		});
		$$('.noti-row', listEl).forEach(function(li){
			li.addEventListener('click', function(){
				if (!li.classList.contains('is-read')){
					markRead(li.getAttribute('data-id'), function(){ loadAndRender(); });
				}
			});
		});

		renderPagination(total);
	}

	function renderPagination(total){
		if (!paginationEl) return;
		var totalPages = Math.ceil(total / PER_PAGE);
		if (totalPages <= 1){ paginationEl.hidden = true; return; }
		paginationEl.hidden = false;

		var html = '';
		// Prev button
		html += '<button data-page="' + (state.page - 1) + '"' + (state.page <= 1 ? ' disabled' : '') + '>&lsaquo;</button>';

		// Page numbers with ellipsis
		var start = Math.max(1, state.page - 2);
		var end = Math.min(totalPages, state.page + 2);
		if (start > 1) {
			html += '<button data-page="1"' + (state.page === 1 ? ' class="active"' : '') + '>1</button>';
			if (start > 2) html += '<button disabled>&hellip;</button>';
		}
		for (var p = start; p <= end; p++){
			html += '<button data-page="' + p + '"' + (p === state.page ? ' class="active"' : '') + '>' + p + '</button>';
		}
		if (end < totalPages) {
			if (end < totalPages - 1) html += '<button disabled>&hellip;</button>';
			html += '<button data-page="' + totalPages + '"' + (state.page === totalPages ? ' class="active"' : '') + '>' + totalPages + '</button>';
		}

		// Next button
		html += '<button data-page="' + (state.page + 1) + '"' + (state.page >= totalPages ? ' disabled' : '') + '>&rsaquo;</button>';

		paginationEl.innerHTML = html;
		$$('button[data-page]', paginationEl).forEach(function(btn){
			if (btn.disabled) return;
			btn.addEventListener('click', function(){
				state.page = parseInt(btn.getAttribute('data-page'), 10);
				loadAndRender();
				// scroll to top of content
				var body = document.querySelector('.noti-body');
				if (body) body.scrollIntoView({ behavior: 'smooth', block: 'start' });
			});
		});
	}

	function loadAndRender(){
		fetchNotifications(function(data){ render(data); });
	}

	// ── 카테고리 탭 ───────────────────────────────────────

	catTabs.forEach(function(btn){
		btn.addEventListener('click', function(){
			catTabs.forEach(function(b){
				b.classList.toggle('active', b === btn);
				b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
			});
			state.category = btn.dataset.category || '';
			state.page = 1;
			loadAndRender();
		});
	});

	// ── 읽음 상태 필터 ────────────────────────────────────

	filterBtns.forEach(function(btn){
		btn.addEventListener('click', function(){
			filterBtns.forEach(function(b){ b.classList.toggle('active', b === btn); });
			state.readFilter = btn.dataset.read || '';
			state.page = 1;
			loadAndRender();
		});
	});

	// ── 전체 읽음 ─────────────────────────────────────────

	if (readAllBtn){
		readAllBtn.addEventListener('click', function(){
			markAllRead(function(){ loadAndRender(); });
		});
	}

	var clearAllBtn = $('#alarm-clearall-btn');
	if (clearAllBtn){
		clearAllBtn.addEventListener('click', function(){
			deleteAll(function(){ loadAndRender(); });
		});
	}

	// ── 초기 로드 + 폴링 ──────────────────────────────────

	loadAndRender();
	setInterval(loadAndRender, 30000);
});

