/**
 * 문구관리 설정 페이지 JS
 * authentication/11-3.admin/11-3-3.setting/6.info_message.js  v3.4.0
 * — 온프레미스 모달 패턴, 검색 드롭다운, 행 클릭 선택, 모달 알림
 */
(function(){
	'use strict';

	var API  = '/api/info-messages';
	var HDRS = { 'Content-Type': 'application/json' };
	var COL_COUNT = 8;

	/* ── 대분류/중분류 매핑 ── */
	var CATEGORIES = {
		system:     { name: '시스템',     subs: { server: '서버', storage: '스토리지', san: 'SAN', network: '네트워크', security: '보안장비' } },
		governance: { name: '거버넌스',   subs: { backup_policy: '백업 정책', package_management: '패키지 관리', vulnerability: '취약점 분석', ip_policy: 'IP 정책', vpn_policy: 'VPN 정책', dedicated_line_policy: '전용회선 정책', disposal_asset: '불용자산 관리' } },
		datacenter: { name: '데이터센터', subs: { access_control: '출입 관리', data_deletion: '데이터 삭제 관리', rack: 'RACK 관리', temperature_humidity: '온/습도 관리', cctv: 'CCTV 관리' } },
		cost:       { name: '비용관리',   subs: { opex: 'OPEX', capex: 'CAPEX' } },
		project:    { name: '프로젝트',   subs: { project_status: '프로젝트 현황', work_status: '작업 현황', ticket_status: '티켓 현황', workflow_builder: '워크플로우 제작' } },
		insight:    { name: '인사이트',   subs: { tech_docs: '기술자료', blog: '블로그' } },
		category:   { name: '카테고리',   subs: { business: '비즈니스', hardware: '하드웨어', software: '소프트웨어', component: '컴포넌트', company: '회사', customer: '고객', vendor: '벤더' } }
	};

	/* ── 상태 ── */
	var state = { items: [], selected: new Set(), page: 1, pageSize: 10 };

	/* ── DOM 캐시 ── */
	var tbody      = document.getElementById('im-tbody');
	var emptyEl    = document.getElementById('im-empty');
	var countBadge = document.getElementById('im-count');
	var filterCat  = document.getElementById('im-filter-cat');
	var filterEn   = document.getElementById('im-filter-enabled');
	var searchIn   = document.getElementById('im-search');
	var searchClear= document.getElementById('im-search-clear');
	var selectAll  = document.getElementById('im-select-all');
	var pageSizeSel= document.getElementById('im-page-size');

	/* 모달 */
	var modal        = document.getElementById('im-modal');
	var modalTitle   = document.getElementById('im-modal-title');
	var modalSubtitle= document.getElementById('im-modal-subtitle');
	var btnSave      = document.getElementById('im-save-btn');
	var btnCancel    = document.getElementById('im-cancel-btn');
	var btnClose     = document.getElementById('im-modal-close');

	var elId         = document.getElementById('im-edit-id');
	var elMainCode   = document.getElementById('im-main-code');
	var elSubCode    = document.getElementById('im-sub-code');
	var elMenuKey    = document.getElementById('im-menu-key');
	var elMainSelect = document.getElementById('im-main-select');
	var elSubSelect  = document.getElementById('im-sub-select');
	var elTitle      = document.getElementById('im-title');
	var elContent    = document.getElementById('im-content');

	/* 페이지네이션 DOM */
	var pagInfo    = document.getElementById('im-pagination-info');
	var pagFirst   = document.getElementById('im-first');
	var pagPrev    = document.getElementById('im-prev');
	var pagNext    = document.getElementById('im-next');
	var pagLast    = document.getElementById('im-last');
	var pagNumbers = document.getElementById('im-page-numbers');

	/* 알림/확인 모달 DOM */
	var msgModal      = document.getElementById('im-message-modal');
	var msgTitle      = document.getElementById('im-msg-title');
	var msgContent    = document.getElementById('im-msg-content');
	var msgOk         = document.getElementById('im-msg-ok');
	var msgClose      = document.getElementById('im-msg-close');
	var confirmModal  = document.getElementById('im-confirm-modal');
	var confirmTitle  = document.getElementById('im-confirm-title');
	var confirmSub    = document.getElementById('im-confirm-subtitle');
	var confirmText   = document.getElementById('im-confirm-content');
	var confirmOk     = document.getElementById('im-confirm-ok');
	var confirmCancel = document.getElementById('im-confirm-cancel');
	var confirmClose  = document.getElementById('im-confirm-close');
	var _confirmCb    = null;

	/* ── 유틸 ── */
	function esc(str) {
		if (!str) return '';
		var d = document.createElement('div');
		d.appendChild(document.createTextNode(str));
		return d.innerHTML;
	}

	/* ── searchable select 동기화 ── */
	function syncSearchable(el) {
		if (window.BlossomSearchableSelect) {
			window.BlossomSearchableSelect.enhance(el);
		}
	}

	/* ── 알림 모달 (온프레미스 showMessage 동일) ── */
	function showMessage(message, title) {
		msgTitle.textContent = title || '알림';
		msgContent.textContent = String(message || '');
		msgModal.classList.add('show');
		msgModal.setAttribute('aria-hidden', 'false');
	}
	function closeMessage() {
		msgModal.classList.remove('show');
		msgModal.setAttribute('aria-hidden', 'true');
	}

	/* ── 확인 모달 (온프레미스 삭제확인 동일) ── */
	function showConfirm(message, title, subtitle, callback) {
		confirmTitle.textContent = title || '확인';
		confirmSub.textContent = subtitle || '';
		confirmText.textContent = String(message || '');
		_confirmCb = callback || null;
		confirmModal.classList.add('show');
		confirmModal.setAttribute('aria-hidden', 'false');
	}
	function closeConfirm(accepted) {
		confirmModal.classList.remove('show');
		confirmModal.setAttribute('aria-hidden', 'true');
		if (accepted && typeof _confirmCb === 'function') _confirmCb();
		_confirmCb = null;
	}

	/* ── 대분류 select 채우기 ── */
	function populateMainSelect() {
		var html = '<option value="">선택</option>';
		for (var code in CATEGORIES) {
			html += '<option value="' + code + '">' + esc(CATEGORIES[code].name) + '</option>';
		}
		elMainSelect.innerHTML = html;
		syncSearchable(elMainSelect);
	}

	/* ── 중분류 select 채우기 (대분류 종속) ── */
	function populateSubSelect(mainCode) {
		var html = '<option value="">선택</option>';
		if (mainCode && CATEGORIES[mainCode]) {
			var subs = CATEGORIES[mainCode].subs;
			for (var code in subs) {
				html += '<option value="' + code + '">' + esc(subs[code]) + '</option>';
			}
		}
		elSubSelect.innerHTML = html;
		syncSearchable(elSubSelect);
	}

	/* ── 목록 로드 ── */
	function loadList() {
		var params = [];
		var cat = filterCat.value;
		var en  = filterEn.value;
		var q   = (searchIn.value || '').trim();
		if (cat) params.push('main_category=' + encodeURIComponent(cat));
		if (en !== '') params.push('is_enabled=' + en);
		if (q)  params.push('q=' + encodeURIComponent(q));
		var url = API + (params.length ? '?' + params.join('&') : '');
		tbody.innerHTML = '<tr><td colspan="' + COL_COUNT + '" style="text-align:center;padding:40px;color:#9ca3af">조회 중...</td></tr>';
		emptyEl.hidden = true;

		fetch(url, { credentials: 'same-origin' })
			.then(function(r){ return r.json(); })
			.then(function(data){
				if (!data.success) throw new Error(data.message || '조회 실패');
				state.items = data.items || [];
				state.selected.clear();
				if (selectAll) selectAll.checked = false;
				state.page = 1;
				countBadge.textContent = state.items.length;
				countBadge.classList.remove('large-number','very-large-number');
				if (state.items.length >= 1000) countBadge.classList.add('very-large-number');
				else if (state.items.length >= 100) countBadge.classList.add('large-number');
				renderPage();
			})
			.catch(function(err){
				tbody.innerHTML = '<tr><td colspan="' + COL_COUNT + '" style="text-align:center;padding:40px;color:#ef4444">오류: ' + esc(err.message) + '</td></tr>';
				renderPagination(0, 0);
			});
	}

	/* ── 페이지 렌더 ── */
	function renderPage() {
		var total = state.items.length;
		var totalPages = Math.max(1, Math.ceil(total / state.pageSize));
		if (state.page > totalPages) state.page = totalPages;
		var start = (state.page - 1) * state.pageSize;
		var slice = state.items.slice(start, start + state.pageSize);

		if (!total) {
			tbody.innerHTML = '';
			emptyEl.hidden = false;
			renderPagination(0, 0);
			return;
		}
		emptyEl.hidden = true;
		var html = '';
		for (var i = 0; i < slice.length; i++) {
			var r = slice[i];
			var globalIdx = start + i;
			var checked = r.id && state.selected.has(r.id) ? ' checked' : '';
			var selClass = r.id && state.selected.has(r.id) ? ' class="selected"' : '';
			var togChecked = r.is_enabled ? ' checked' : '';
			html += '<tr data-id="' + r.id + '"' + selClass + '>'
				+ '<td><input type="checkbox" class="im-row-select" data-id="' + (r.id || '') + '"' + checked + '></td>'
				+ '<td>' + esc(r.main_category_name) + '</td>'
				+ '<td>' + esc(r.sub_category_name) + '</td>'
				+ '<td style="display:none"><code style="font-size:12px;color:#6366f1">' + esc(r.menu_key) + '</code></td>'
				+ '<td>' + esc(r.info_title) + '</td>'
				+ '<td><label class="im-tbl-switch"><input type="checkbox" data-id="' + r.id + '"' + togChecked + '><span class="im-tbl-slider"></span></label></td>'
				+ '<td style="font-size:12px;color:#6b7280">' + esc(r.updated_at || r.created_at || '') + '</td>'
				+ '<td>' + esc(r.updated_by || r.created_by || '') + '</td>'
				+ '<td>'
				+   '<button type="button" class="action-btn" data-action="edit" data-idx="' + globalIdx + '" title="수정" aria-label="수정">'
				+     '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon">'
				+   '</button>'
				+ '</td>'
				+ '</tr>';
		}
		tbody.innerHTML = html;
		syncSelectAll();
		renderPagination(total, totalPages);
	}

	/* ── 페이지네이션 ── */
	function renderPagination(total, totalPages) {
		var start = (state.page - 1) * state.pageSize + 1;
		var end   = Math.min(state.page * state.pageSize, total);
		pagInfo.textContent = total ? (start + '-' + end + ' / ' + total + '개 항목') : '0개 항목';

		pagFirst.disabled = state.page <= 1;
		pagPrev.disabled  = state.page <= 1;
		pagNext.disabled  = state.page >= totalPages;
		pagLast.disabled  = state.page >= totalPages;

		pagNumbers.innerHTML = '';
		for (var p = 1; p <= totalPages && p <= 50; p++) {
			var btn = document.createElement('button');
			btn.className = 'page-btn' + (p === state.page ? ' active' : '');
			btn.type = 'button';
			btn.textContent = p;
			btn.setAttribute('data-page', p);
			pagNumbers.appendChild(btn);
		}
	}

	function goPage(p) {
		var totalPages = Math.max(1, Math.ceil(state.items.length / state.pageSize));
		state.page = Math.max(1, Math.min(p, totalPages));
		renderPage();
	}

	/* ── 체크박스 ── */
	function syncSelectAll() {
		if (!selectAll) return;
		var cbs = tbody.querySelectorAll('.im-row-select');
		selectAll.checked = cbs.length > 0 && Array.prototype.every.call(cbs, function(c){ return c.checked; });
	}

	function handleRowCheckbox(cb) {
		var tr = cb.closest('tr');
		var id = parseInt(cb.getAttribute('data-id'), 10);
		if (cb.checked) {
			tr.classList.add('selected');
			if (!isNaN(id)) state.selected.add(id);
		} else {
			tr.classList.remove('selected');
			if (!isNaN(id)) state.selected.delete(id);
		}
		syncSelectAll();
	}

	function handleSelectAll(checked) {
		var cbs = tbody.querySelectorAll('.im-row-select');
		for (var i = 0; i < cbs.length; i++) {
			cbs[i].checked = checked;
			var tr = cbs[i].closest('tr');
			var id = parseInt(cbs[i].getAttribute('data-id'), 10);
			if (checked) {
				tr.classList.add('selected');
				if (!isNaN(id)) state.selected.add(id);
			} else {
				tr.classList.remove('selected');
				if (!isNaN(id)) state.selected.delete(id);
			}
		}
	}

	/* ── 삭제 ── */
	function bulkDelete() {
		if (!state.selected.size) { showMessage('삭제할 항목을 선택하세요.', '안내'); return; }
		showConfirm(
			'확인 후에는 선택된 항목이 삭제됩니다.',
			'삭제처리',
			'선택된 ' + state.selected.size + '건을 삭제하시겠습니까?',
			function() {
				var ids = Array.from(state.selected);
				fetch(API + '/bulk-delete', {
					method: 'POST',
					headers: HDRS,
					credentials: 'same-origin',
					body: JSON.stringify({ ids: ids })
				})
				.then(function(r){ return r.json(); })
				.then(function(data){
					if (!data.success) throw new Error(data.message || '삭제 실패');
					showMessage(ids.length + '건이 삭제되었습니다.', '삭제 완료');
					loadList();
				})
				.catch(function(err){ showMessage(err.message, '삭제 실패'); });
			}
		);
	}

	/* ── 모달 ── */
	function openModal() { modal.classList.add('show'); modal.setAttribute('aria-hidden', 'false'); }
	function closeModal() { modal.classList.remove('show'); modal.setAttribute('aria-hidden', 'true'); }

	function openNew() {
		modalTitle.textContent = '안내 문구 신규 등록';
		modalSubtitle.textContent = '안내 문구 정보를 입력하세요.';
		elId.value = '';
		elMainCode.value = '';
		elSubCode.value = '';
		elMenuKey.value = '';
		elMainSelect.disabled = false;
		elSubSelect.disabled = false;
		elMainSelect.value = '';
		populateSubSelect('');
		elSubSelect.value = '';
		syncSearchable(elMainSelect);
		syncSearchable(elSubSelect);
		elTitle.value = '';
		elContent.value = '';
		openModal();
	}

	function openEdit(item) {
		modalTitle.textContent = '안내 문구 수정';
		modalSubtitle.textContent = '선택한 안내 문구를 수정합니다.';
		elId.value = item.id;
		elMainCode.value = item.main_category_code || '';
		elSubCode.value  = item.sub_category_code || '';
		elMenuKey.value  = item.menu_key || '';
		/* 대분류/중분류 select 세팅 */
		elMainSelect.disabled = false;
		elMainSelect.value = item.main_category_code || '';
		syncSearchable(elMainSelect);
		populateSubSelect(item.main_category_code || '');
		elSubSelect.disabled = false;
		elSubSelect.value = item.sub_category_code || '';
		syncSearchable(elSubSelect);
		elMainSelect.disabled = true;
		elSubSelect.disabled = true;
		syncSearchable(elMainSelect);
		syncSearchable(elSubSelect);
		elTitle.value   = item.info_title || '';
		elContent.value = item.info_content || '';
		openModal();
	}

	/* ── 저장 ── */
	function save() {
		var id = elId.value;
		var mainCode = elMainSelect.value;
		var subCode  = elSubSelect.value;
		if (!mainCode) { showMessage('대분류를 선택하세요.', '입력 오류'); return; }
		if (!subCode)  { showMessage('중분류를 선택하세요.', '입력 오류'); return; }
		var mainName = CATEGORIES[mainCode] ? CATEGORIES[mainCode].name : '';
		var subName  = (CATEGORIES[mainCode] && CATEGORIES[mainCode].subs[subCode]) || '';
		var menuKey  = mainCode + '.' + subCode;

		/* 신규 등록 시 대분류+중분류 중복 검사 */
		if (!id) {
			var dup = state.items.some(function(item) {
				return item.main_category_code === mainCode && item.sub_category_code === subCode;
			});
			if (dup) {
				showMessage('이미 동일한 대분류·중분류 조합이 등록되어 있습니다.\n(' + mainName + ' > ' + subName + ')', '중복 등록 불가');
				return;
			}
		}

		var payload = {
			menu_key: menuKey,
			main_category_code: mainCode,
			main_category_name: mainName,
			sub_category_code:  subCode,
			sub_category_name:  subName,
			info_title:   elTitle.value.trim(),
			info_content: elContent.value,
			sort_order:   0
		};
		/* 신규: 기본 사용, 수정: 기존 값 유지 (테이블 토글로 변경) */
		if (!id) payload.is_enabled = 1;
		if (!payload.info_title) { showMessage('제목을 입력하세요.', '입력 오류'); return; }

		var url    = id ? (API + '/' + id) : API;
		var method = id ? 'PUT' : 'POST';

		btnSave.disabled = true;
		btnSave.textContent = '저장 중...';

		fetch(url, {
			method: method,
			headers: HDRS,
			credentials: 'same-origin',
			body: JSON.stringify(payload)
		})
		.then(function(r){ return r.json(); })
		.then(function(data){
			if (!data.success) throw new Error(data.message || '저장 실패');
			closeModal();
			showMessage(id ? '안내 문구가 수정되었습니다.' : '안내 문구가 등록되었습니다.', id ? '수정 완료' : '등록 완료');
			loadList();
		})
		.catch(function(err){
			showMessage(err.message, '저장 실패');
		})
		.finally(function(){
			btnSave.disabled = false;
			btnSave.textContent = '저장';
		});
	}

	/* ── 이벤트 바인딩 ── */
	function init() {
		populateMainSelect();

		/* 대분류 변경 → 중분류 갱신 */
		elMainSelect.addEventListener('change', function(){
			populateSubSelect(this.value);
		});

		/* 툴바 */
		document.getElementById('im-search-btn').addEventListener('click', loadList);
		document.getElementById('im-add-btn').addEventListener('click', openNew);
		document.getElementById('im-delete-btn').addEventListener('click', bulkDelete);

		/* 모달 */
		btnSave.addEventListener('click', save);
		btnCancel.addEventListener('click', closeModal);
		btnClose.addEventListener('click', closeModal);

		/* 모달 외부 클릭 닫기 */
		modal.addEventListener('click', function(e){
			if (e.target === modal) closeModal();
		});

		/* 필터/검색 */
		filterCat.addEventListener('change', loadList);
		filterEn.addEventListener('change', loadList);
		searchIn.addEventListener('keydown', function(e){
			if (e.key === 'Enter') loadList();
		});
		searchClear.addEventListener('click', function(){
			searchIn.value = '';
			loadList();
		});

		/* 페이지 사이즈 */
		if (pageSizeSel) {
			pageSizeSel.addEventListener('change', function(){
				state.pageSize = parseInt(this.value, 10) || 10;
				state.page = 1;
				renderPage();
			});
		}

		/* 전체 선택 체크박스 */
		if (selectAll) {
			selectAll.addEventListener('change', function(){ handleSelectAll(this.checked); });
		}

/* tbody 이벤트 위임: 체크박스 + 액션 버튼 + 행 클릭 */
	tbody.addEventListener('change', function(e){
		var cb = e.target.closest('.im-row-select');
		if (cb) handleRowCheckbox(cb);
	});
	tbody.addEventListener('click', function(e){
		var btn = e.target.closest('.action-btn');
		if (btn) {
			var idx = parseInt(btn.getAttribute('data-idx'), 10);
			if (!isNaN(idx) && state.items[idx]) {
				openEdit(state.items[idx]);
			}
			return;
		}
		/* 체크박스/토글 클릭은 자체 change 이벤트로 처리 */
		if (e.target.classList.contains('im-row-select') || e.target.closest('.im-row-select')) return;
		if (e.target.closest('.im-tbl-switch')) return;
		/* 행 클릭 → 선택 토글 (온프레미스 동일) */
		var tr = e.target.closest('tr');
		if (!tr) return;
		var cb = tr.querySelector('.im-row-select');
		if (!cb) return;
		cb.checked = !cb.checked;
		cb.dispatchEvent(new Event('change', { bubbles: true }));
		});

		/* 사용 토글 (테이블 인라인 스위치) */
		tbody.addEventListener('change', function(e){
			var sw = e.target.closest('.im-tbl-switch input');
			if (!sw) return;
			var id = sw.getAttribute('data-id');
			if (!id) return;
			var newVal = sw.checked ? 1 : 0;
			fetch(API + '/' + id + '/toggle', {
				method: 'PUT',
				headers: HDRS,
				credentials: 'same-origin',
				body: JSON.stringify({ is_enabled: newVal })
			})
			.then(function(r){ return r.json(); })
			.then(function(data){
				if (!data.success) throw new Error(data.message || '토글 실패');
				/* 로컬 상태도 반영 */
				for (var i = 0; i < state.items.length; i++) {
					if (String(state.items[i].id) === String(id)) {
						state.items[i].is_enabled = newVal;
						break;
					}
				}
			})
			.catch(function(err){
				showMessage(err.message, '토글 실패');
				sw.checked = !sw.checked; /* 롤백 */
			});
		});

		/* 페이지네이션 */
		pagFirst.addEventListener('click', function(){ goPage(1); });
		pagPrev.addEventListener('click', function(){ goPage(state.page - 1); });
		pagNext.addEventListener('click', function(){ goPage(state.page + 1); });
		pagLast.addEventListener('click', function(){ goPage(Math.ceil(state.items.length / state.pageSize)); });
		pagNumbers.addEventListener('click', function(e){
			var btn = e.target.closest('.page-btn');
			if (btn) goPage(parseInt(btn.getAttribute('data-page'), 10));
		});

		/* ESC 모달 닫기 */
		document.addEventListener('keydown', function(e){
			if (e.key === 'Escape' && modal.classList.contains('show')) closeModal();
		});

		/* 알림 모달 이벤트 */
		msgOk.addEventListener('click', closeMessage);
		msgClose.addEventListener('click', closeMessage);
		msgModal.addEventListener('click', function(e){ if (e.target === msgModal) closeMessage(); });

		/* 확인 모달 이벤트 */
		confirmOk.addEventListener('click', function(){ closeConfirm(true); });
		confirmCancel.addEventListener('click', function(){ closeConfirm(false); });
		confirmClose.addEventListener('click', function(){ closeConfirm(false); });
		confirmModal.addEventListener('click', function(e){ if (e.target === confirmModal) closeConfirm(false); });

		loadList();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
