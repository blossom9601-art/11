/* ================================================================
   9.page_tab.js v2.0.0 — 페이지관리 (버전관리 스타일)
   ================================================================ */
(function () {
  'use strict';

  /* ── 유틸 ── */
  function esc(s) { var d = document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; }

  /* ── 페이지 코드 → 한글 매핑 ── */
  var PAGE_LABELS = {
    GOV_VPN_POLICY: '거버넌스 > VPN 정책',
    GOV_DEDICATED_LINE_POLICY: '거버넌스 > 전용회선 정책',
    CATEGORY_CUSTOMER: '카테고리 > 고객',
    DC_RACK: '데이터센터 > RACK 관리',
    DC_THERMOMETER: '데이터센터 > 온/습도 관리',
    DC_CCTV: '데이터센터 > CCTV 관리'
  };

  /* ── 삭제 불가 탭 (page_code → tab_code Set) ── */
  var LOCKED_TABS = {
    DC_RACK: { LIST: 1 },
    DC_THERMOMETER: { LIST: 1, LOG: 1 },
    DC_CCTV: { LIST: 1 }
  };
  function isLocked(t) {
    var m = LOCKED_TABS[t.page_code];
    return m && m[t.tab_code];
  }

  /* ── 상태 ── */
  var _allTabs = [];
  var _filtered = [];
  var _editingId = null;
  var _deletingIds = [];
  var _page = 1;
  var _pageSize = 10;
  var _searchTerm = '';
  var _pageFilter = '';
  var _pageCodes = [];
  var _sortCol = '';
  var _sortDir = 0; // 0=none, 1=asc, -1=desc

  /* ── DOM refs ── */
  function $(id) { return document.getElementById(id); }

  /* ══════════════════════════════════════════════
     DATA
  ══════════════════════════════════════════════ */
  function loadPageCodes() {
    fetch('/api/page-tabs/pages', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.success) return;
        _pageCodes = d.items || [];
        /* 필터 드롭다운 */
        var filterSel = $('pt-page-filter');
        if (filterSel) {
          for (var i = 0; i < _pageCodes.length; i++) {
            var opt = document.createElement('option');
            opt.value = _pageCodes[i];
            opt.textContent = PAGE_LABELS[_pageCodes[i]] || _pageCodes[i];
            filterSel.appendChild(opt);
          }
        }
        /* 모달 페이지 드롭다운 */
        var modalSel = $('edit-pt-page-code');
        if (modalSel) {
          for (var j = 0; j < _pageCodes.length; j++) {
            var opt2 = document.createElement('option');
            opt2.value = _pageCodes[j];
            opt2.textContent = PAGE_LABELS[_pageCodes[j]] || _pageCodes[j];
            modalSel.appendChild(opt2);
          }
        }
      })
      .catch(function () { _pageCodes = []; });
  }

  function loadAllTabs() {
    fetch('/api/page-tabs/all', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        _allTabs = (d && d.success && d.items) ? d.items : [];
        applyFilter();
      })
      .catch(function () { _allTabs = []; applyFilter(); });
  }

  /* ── 검색 / 필터 ── */
  function applyFilter() {
    var list = _allTabs.slice();
    /* 페이지 필터 */
    if (_pageFilter) {
      list = list.filter(function (t) { return t.page_code === _pageFilter; });
    }
    /* 검색어 */
    if (_searchTerm) {
      var terms = _searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter(function (t) {
        var blob = ((PAGE_LABELS[t.page_code] || t.page_code) + ' ' + t.tab_code + ' ' + t.tab_name + ' ' + (t.route_key || '')).toLowerCase();
        return terms.every(function (w) { return blob.indexOf(w) >= 0; });
      });
    }
    /* 정렬 */
    if (_sortCol && _sortDir !== 0) {
      var dir = _sortDir;
      list.sort(function (a, b) {
        var va, vb;
        if (_sortCol === 'page_code') {
          va = (PAGE_LABELS[a.page_code] || a.page_code).toLowerCase();
          vb = (PAGE_LABELS[b.page_code] || b.page_code).toLowerCase();
        } else if (_sortCol === 'tab_order') {
          va = a.tab_order; vb = b.tab_order;
          return (va - vb) * dir;
        } else if (_sortCol === 'is_active') {
          va = a.is_active; vb = b.is_active;
          return (va - vb) * dir;
        } else {
          va = ((a[_sortCol] || '') + '').toLowerCase();
          vb = ((b[_sortCol] || '') + '').toLowerCase();
        }
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
    }
    _filtered = list;
    _page = 1;
    renderAll();
  }

  /* ── 렌더 ── */
  function renderAll() {
    var total = _filtered.length;
    var totalPages = Math.max(1, Math.ceil(total / _pageSize));
    if (_page > totalPages) _page = totalPages;

    var start = (_page - 1) * _pageSize;
    var slice = _filtered.slice(start, start + _pageSize);

    renderTable(slice);
    renderPagination(total, totalPages);
    updateCount(total);
    updateEmptyState(total);
    updateDeleteBtn();
  }

  function renderTable(tabs) {
    var tbody = $('pt-tbody');
    if (!tbody) return;
    if (tabs.length === 0) { tbody.innerHTML = ''; return; }

    var html = '';
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      var locked = isLocked(t);
      var activeLabel = t.is_active
        ? '<span class="status-pill"><span class="status-dot" style="background:#6366F1"></span>사용</span>'
        : '<span class="status-pill"><span class="status-dot" style="background:#9ca3af"></span>미사용</span>';

      html += '<tr data-id="' + t.id + '">';
      html += '<td>';
      if (!locked) html += '<input type="checkbox" class="pt-row-cb" value="' + t.id + '" aria-label="선택">';
      html += '</td>';
      html += '<td>' + esc(PAGE_LABELS[t.page_code] || t.page_code) + '</td>';
      html += '<td>' + esc(t.tab_code) + '</td>';
      html += '<td>' + esc(t.tab_name) + '</td>';
      html += '<td>' + esc(t.route_key || '') + '</td>';
      html += '<td style="text-align:center">' + t.tab_order + '</td>';
      html += '<td>' + activeLabel + '</td>';
      html += '<td data-col="actions" class="system-actions">';
      html += '<button type="button" class="action-btn pt-edit-btn" data-action="edit" title="수정" data-id="' + t.id + '">';
      html += '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon">';
      html += '</button> ';
      if (!locked) {
        html += '<button type="button" class="action-btn pt-delete-btn" data-action="delete" title="삭제" data-id="' + t.id + '">';
        html += '<img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">';
        html += '</button>';
      }
      html += '</td>';
      html += '</tr>';
    }
    tbody.innerHTML = html;

    /* 체크박스 */
    var cbs = tbody.querySelectorAll('.pt-row-cb');
    for (var j = 0; j < cbs.length; j++) {
      cbs[j].addEventListener('change', onRowCheckChange);
    }
    var allCb = $('pt-check-all');
    if (allCb) allCb.checked = false;
  }

  function onRowCheckChange(e) {
    var tr = e.target.closest('tr');
    if (tr) { e.target.checked ? tr.classList.add('selected') : tr.classList.remove('selected'); }
    syncCheckAll();
    updateDeleteBtn();
  }

  function syncCheckAll() {
    var all = document.querySelectorAll('.pt-row-cb');
    var checked = document.querySelectorAll('.pt-row-cb:checked');
    var allCb = $('pt-check-all');
    if (allCb) allCb.checked = (all.length > 0 && all.length === checked.length);
  }

  function updateDeleteBtn() {
    var btn = $('pt-delete-btn');
    var cnt = document.querySelectorAll('.pt-row-cb:checked').length;
    if (btn) btn.disabled = (cnt === 0);
  }

  function updateCount(total) {
    var el = $('pt-count');
    if (el) el.textContent = total;
  }

  function updateEmptyState(total) {
    var tbl = $('pt-table');
    var empty = $('pt-empty');
    if (total === 0) {
      if (tbl) tbl.style.display = 'none';
      if (empty) { empty.hidden = false; empty.style.display = ''; }
    } else {
      if (tbl) tbl.style.display = '';
      if (empty) { empty.hidden = true; empty.style.display = 'none'; }
    }
  }

  /* ══════════════════════════════════════════════
     PAGINATION
  ══════════════════════════════════════════════ */
  function renderPagination(total, totalPages) {
    var infoEl = $('pt-pagination-info');
    if (infoEl) {
      var s = (_page - 1) * _pageSize + 1;
      var e = Math.min(_page * _pageSize, total);
      infoEl.textContent = total === 0 ? '0개 항목' : (s + '-' + e + ' / ' + total + '개 항목');
    }
    var firstBtn = $('pt-first'), prevBtn = $('pt-prev'), nextBtn = $('pt-next'), lastBtn = $('pt-last');
    if (firstBtn) firstBtn.disabled = (_page <= 1);
    if (prevBtn) prevBtn.disabled = (_page <= 1);
    if (nextBtn) nextBtn.disabled = (_page >= totalPages);
    if (lastBtn) lastBtn.disabled = (_page >= totalPages);

    var container = $('pt-page-numbers');
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
    var totalPages = Math.max(1, Math.ceil(_filtered.length / _pageSize));
    _page = Math.max(1, Math.min(p, totalPages));
    renderAll();
  }

  /* ══════════════════════════════════════════════
     MODALS
  ══════════════════════════════════════════════ */
  function showModal(id) {
    var el = $(id);
    if (el) { el.style.display = ''; el.classList.add('show'); el.setAttribute('aria-hidden', 'false'); document.body.classList.add('modal-open'); }
  }
  function hideModal(id) {
    var el = $(id);
    if (el) { el.classList.remove('show'); el.setAttribute('aria-hidden', 'true'); }
    if (!document.querySelector('.modal-overlay-full.show, .server-add-modal.show')) {
      document.body.classList.remove('modal-open');
    }
  }
  function hideAllModals() { hideModal('pt-edit-modal'); hideModal('pt-delete-modal'); hideModal('system-message-modal'); }

  function showMessage(message, title) {
    var modalId = 'system-message-modal';
    var titleEl = document.getElementById('message-title');
    var contentEl = document.getElementById('message-content');
    if (titleEl) titleEl.textContent = title || '알림';
    if (contentEl) contentEl.textContent = String(message || '');
    showModal(modalId);
  }

  /* ── 추가/수정 ── */
  function findTab(id) {
    for (var i = 0; i < _allTabs.length; i++) { if (_allTabs[i].id === id) return _allTabs[i]; }
    return null;
  }

  function openAddTab() {
    _editingId = null;
    $('pt-modal-title').textContent = '새 탭 추가';
    $('pt-edit-id').value = '';
    var pgSel = $('edit-pt-page-code');
    if (pgSel) { pgSel.value = _pageFilter || (_pageCodes.length ? _pageCodes[0] : ''); pgSel.disabled = false; }
    $('edit-pt-tab-code').value = '';
    $('edit-pt-tab-name').value = '';
    $('edit-pt-route-key').value = '';
    $('edit-pt-tab-order').value = _allTabs.length + 1;
    $('edit-pt-is-active').value = '1';
    $('edit-pt-description').value = '';
    resetImageState();
    toggleImageSection(pgSel ? pgSel.value : '', '');
    showModal('pt-edit-modal');
    syncSelects();
  }

  function openEditTab(id) {
    var t = findTab(id);
    if (!t) return;
    _editingId = id;
    $('pt-modal-title').textContent = '탭 수정';
    $('pt-edit-id').value = id;
    var pgSel = $('edit-pt-page-code');
    if (pgSel) { pgSel.value = t.page_code; pgSel.disabled = false; }
    $('edit-pt-tab-code').value = t.tab_code;
    $('edit-pt-tab-name').value = t.tab_name;
    $('edit-pt-route-key').value = t.route_key || '';
    $('edit-pt-tab-order').value = t.tab_order;
    $('edit-pt-is-active').value = t.is_active ? '1' : '0';
    $('edit-pt-description').value = t.description || '';
    resetImageState();
    toggleImageSection(t.page_code, t.tab_code);
    loadExistingImage(t);
    showModal('pt-edit-modal');
    syncSelects();
  }

  function syncSelects() {
    if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') {
      window.BlossomSearchableSelect.syncAll($('pt-edit-modal'));
    }
  }

  function saveTab() {
    var editId    = $('pt-edit-id').value;
    var pageCode  = $('edit-pt-page-code').value;
    var tabCode   = $('edit-pt-tab-code').value.trim();
    var tabName   = $('edit-pt-tab-name').value.trim();
    var routeKey  = $('edit-pt-route-key').value.trim();
    var tabOrder  = parseInt($('edit-pt-tab-order').value, 10) || 0;
    var isActive  = parseInt($('edit-pt-is-active').value, 10);
    var desc      = $('edit-pt-description').value.trim();

    if (!pageCode) { showMessage('페이지를 선택하세요.', '안내'); return; }
    if (!tabCode || !tabName) { showMessage('탭 코드와 탭 이름은 필수입니다.', '안내'); return; }

    /* 같은 페이지 내 탭 코드 중복 검사 */
    var dupTab = _allTabs.some(function (t) {
      return t.page_code === pageCode && t.tab_code === tabCode && (!editId || t.id !== parseInt(editId, 10));
    });
    if (dupTab) { showMessage('같은 페이지 내에 동일한 탭 코드가 이미 존재합니다.', '안내'); return; }

    /* 같은 페이지 내 라우트 키 중복 검사 */
    if (routeKey) {
      var dupRoute = _allTabs.some(function (t) {
        return t.page_code === pageCode && t.route_key === routeKey && (!editId || t.id !== parseInt(editId, 10));
      });
      if (dupRoute) { showMessage('같은 페이지 내에 동일한 라우트 키가 이미 존재합니다.', '안내'); return; }
    }

    /* 데이터센터 LAB 탭: 실장도 필수 */
    if (isDcPage(pageCode) && !isLockedTab(pageCode, tabCode)) {
      var existingTab = editId ? findTab(parseInt(editId, 10)) : null;
      var hasExisting = existingTab && existingTab.tab_image && !_pendingImageRemove;
      var hasStatic = STATIC_IMAGE_MAP[tabCode] && !_pendingImageRemove;
      if (!_pendingImageFile && !hasExisting && !hasStatic) {
        showMessage('실장도(배치도) 이미지는 필수입니다.', '안내');
        return;
      }
    }

    var payload = {
      page_code: pageCode, tab_code: tabCode, tab_name: tabName,
      route_key: routeKey, tab_order: tabOrder, is_active: isActive, description: desc
    };

    var url, method;
    if (editId) {
      url = '/api/page-tabs/' + editId;
      method = 'PUT';
    } else {
      url = '/api/page-tabs';
      method = 'POST';
    }

    fetch(url, { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.success) {
          var tabId = (d.item && d.item.id) || editId;
          if (isDcPage(pageCode) && (_pendingImageFile || _pendingImageRemove)) {
            uploadImageForTab(tabId, function () { hideModal('pt-edit-modal'); loadAllTabs(); });
          } else {
            hideModal('pt-edit-modal'); loadAllTabs();
          }
        } else { showMessage(d.message || d.error || '저장 실패', '오류'); }
      })
      .catch(function () { showMessage('서버 통신 오류', '오류'); });
  }

  /* ── 삭제 ── */
  function openDeleteTabs(ids) {
    /* 페이지별 최소 1개 탭 유지 검증 */
    var pageCounts = {};
    for (var i = 0; i < _allTabs.length; i++) {
      var pc = _allTabs[i].page_code;
      pageCounts[pc] = (pageCounts[pc] || 0) + 1;
    }
    var deleteCountByPage = {};
    for (var j = 0; j < ids.length; j++) {
      for (var k = 0; k < _allTabs.length; k++) {
        if (_allTabs[k].id === ids[j]) {
          var pcode = _allTabs[k].page_code;
          deleteCountByPage[pcode] = (deleteCountByPage[pcode] || 0) + 1;
          break;
        }
      }
    }
    var blocked = [];
    for (var pg in deleteCountByPage) {
      if ((pageCounts[pg] || 0) - deleteCountByPage[pg] < 1) {
        blocked.push(PAGE_LABELS[pg] || pg);
      }
    }
    if (blocked.length) {
      showMessage('각 페이지에는 최소 1개의 탭이 있어야 합니다.\n삭제 불가: ' + blocked.join(', '), '안내');
      return;
    }
    _deletingIds = ids;
    var msg = $('pt-delete-msg');
    if (msg) msg.textContent = '선택한 ' + ids.length + '개의 탭을 삭제하시겠습니까?';
    showModal('pt-delete-modal');
  }

  function confirmDelete() {
    if (!_deletingIds.length) return;
    var remaining = _deletingIds.slice();
    var deletedCount = 0;
    var errorMsgs = [];
    function next() {
      if (!remaining.length) {
        hideModal('pt-delete-modal');
        loadAllTabs();
        if (errorMsgs.length) {
          showMessage(errorMsgs.join('\n'), '오류');
        } else {
          setTimeout(function () { showMessage(deletedCount + '개 항목이 삭제되었습니다.', '완료'); }, 0);
        }
        return;
      }
      var id = remaining.shift();
      fetch('/api/page-tabs/' + id, { method: 'DELETE', credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (!d.success) { errorMsgs.push(id + ': ' + (d.message || '삭제 실패')); } else { deletedCount++; } next(); })
        .catch(function () { errorMsgs.push('서버 통신 오류'); next(); });
    }
    next();
  }

  /* ══════════════════════════════════════════════
     EVENTS
  ══════════════════════════════════════════════ */
  function bindEvents() {
    /* 추가 */
    var addBtn = $('pt-add-btn');
    if (addBtn) addBtn.addEventListener('click', openAddTab);

    /* 저장 */
    var saveBtn = $('btn-save-tab');
    if (saveBtn) saveBtn.addEventListener('click', saveTab);

    /* 삭제 확인 */
    var cfmBtn = $('pt-delete-confirm');
    if (cfmBtn) cfmBtn.addEventListener('click', confirmDelete);
    var cancelBtn = $('pt-delete-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function () { hideModal('pt-delete-modal'); });

    /* 상단 삭제 */
    var delBtn = $('pt-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', function () {
        var checked = document.querySelectorAll('.pt-row-cb:checked');
        if (!checked.length) return;
        var ids = [];
        for (var i = 0; i < checked.length; i++) ids.push(parseInt(checked[i].value, 10));
        openDeleteTabs(ids);
      });
    }

    /* 전체 선택 */
    var allCb = $('pt-check-all');
    if (allCb) {
      allCb.addEventListener('change', function () {
        var cbs = document.querySelectorAll('.pt-row-cb');
        for (var i = 0; i < cbs.length; i++) {
          cbs[i].checked = allCb.checked;
          var tr = cbs[i].closest('tr');
          if (tr) { allCb.checked ? tr.classList.add('selected') : tr.classList.remove('selected'); }
        }
        updateDeleteBtn();
      });
    }

    /* 모달 닫기 (X) */
    var editClose = $('pt-edit-close');
    if (editClose) editClose.addEventListener('click', function () { hideModal('pt-edit-modal'); });
    var delClose = $('pt-delete-close');
    if (delClose) delClose.addEventListener('click', function () { hideModal('pt-delete-modal'); });

    /* 메시지 모달 닫기 */
    var msgClose = document.getElementById('system-message-close');
    if (msgClose) msgClose.addEventListener('click', function () { hideModal('system-message-modal'); });
    var msgOk = document.getElementById('system-message-ok');
    if (msgOk) msgOk.addEventListener('click', function () { hideModal('system-message-modal'); });

    /* 모달 오버레이 클릭 닫기 */
    var modals = document.querySelectorAll('.modal-overlay-full');
    for (var m = 0; m < modals.length; m++) {
      modals[m].addEventListener('click', function (e) { if (e.target === this) hideAllModals(); });
    }

    /* 테이블 이벤트 위임 */
    var tbody = $('pt-tbody');
    if (tbody) {
      tbody.addEventListener('click', function (e) {
        var edit = e.target.closest('.pt-edit-btn');
        if (edit) { openEditTab(parseInt(edit.getAttribute('data-id'), 10)); return; }
        var del = e.target.closest('.pt-delete-btn');
        if (del) { openDeleteTabs([parseInt(del.getAttribute('data-id'), 10)]); return; }

        /* 체크박스 자체 클릭은 change 이벤트로 처리 */
        if (e.target.classList.contains('pt-row-cb') || e.target.closest('.pt-row-cb')) return;
        /* 관리 버튼 영역 클릭 제외 */
        if (e.target.closest('.system-actions')) return;

        /* 그 외: 행 클릭 시 선택 토글 (온프레미스 동일) */
        var tr = e.target.closest('tr');
        if (!tr) return;
        var cb = tr.querySelector('.pt-row-cb');
        if (!cb) return;
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    /* 검색 */
    var searchInput = $('pt-search');
    var searchClear = $('pt-search-clear');
    if (searchInput) {
      var debounce = null;
      searchInput.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () { _searchTerm = searchInput.value.trim(); applyFilter(); }, 200);
      });
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { searchInput.value = ''; _searchTerm = ''; applyFilter(); }
      });
    }
    if (searchClear) {
      searchClear.addEventListener('click', function () {
        if (searchInput) searchInput.value = '';
        _searchTerm = '';
        applyFilter();
      });
    }

    /* 페이지 필터 */
    var pageFilterSel = $('pt-page-filter');
    if (pageFilterSel) {
      pageFilterSel.addEventListener('change', function () {
        _pageFilter = pageFilterSel.value;
        applyFilter();
      });
    }

    /* 페이지 사이즈 */
    var pageSizeSel = $('pt-page-size');
    if (pageSizeSel) {
      pageSizeSel.addEventListener('change', function () {
        _pageSize = parseInt(pageSizeSel.value, 10) || 10;
        _page = 1;
        renderAll();
      });
    }

    /* 컬럼 헤더 클릭 정렬 */
    var thead = document.querySelector('#pt-table thead');
    if (thead) {
      thead.addEventListener('click', function (e) {
        var th = e.target.closest('th[data-col]');
        if (!th) return;
        var col = th.getAttribute('data-col');
        if (col === 'actions') return;
        if (_sortCol === col) {
          _sortDir = _sortDir === 1 ? -1 : (_sortDir === -1 ? 0 : 1);
        } else {
          _sortCol = col;
          _sortDir = 1;
        }
        if (_sortDir === 0) _sortCol = '';
        applyFilter();
      });
    }

    /* 페이지네이션 */
    var pgFirst = $('pt-first'), pgPrev = $('pt-prev'), pgNext = $('pt-next'), pgLast = $('pt-last');
    if (pgFirst) pgFirst.addEventListener('click', function () { goPage(1); });
    if (pgPrev) pgPrev.addEventListener('click', function () { goPage(_page - 1); });
    if (pgNext) pgNext.addEventListener('click', function () { goPage(_page + 1); });
    if (pgLast) pgLast.addEventListener('click', function () { goPage(Math.ceil(_filtered.length / _pageSize)); });

    var pgNumbers = $('pt-page-numbers');
    if (pgNumbers) {
      pgNumbers.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-page]');
        if (btn) goPage(parseInt(btn.getAttribute('data-page'), 10));
      });
    }
  }

  /* ══════════════════════════════════════════════
     실장도 이미지 (데이터센터 전용)
  ══════════════════════════════════════════════ */
  var _pendingImageFile = null;  // 새로 선택한 파일
  var _pendingImageRemove = false; // 이미지 삭제 예약

  /* ── 탭코드 → 정적 배치도 이미지 매핑 ── */
  var STATIC_IMAGE_MAP = {
    LAB1: '/static/image/center/system_lab1/system_lab1.png',
    LAB2: '/static/image/center/system_lab2/system_lab2.png',
    LAB3: '/static/image/center/system_lab3/system_lab3.png',
    LAB4: '/static/image/center/system_lab4/system_lab4.png'
  };

  function isDcPage(code) { return typeof code === 'string' && code.indexOf('DC_') === 0; }

  function isLockedTab(pageCode, tabCode) {
    var m = LOCKED_TABS[pageCode];
    return m && m[tabCode];
  }

  function toggleImageSection(pageCode, tabCode) {
    var sec = $('pt-image-section');
    if (!sec) return;
    var show = isDcPage(pageCode) && !isLockedTab(pageCode, tabCode);
    sec.style.display = show ? '' : 'none';
  }

  function showImagePreview(src) {
    var wrap = $('pt-image-preview');
    var img  = $('pt-image-preview-img');
    var drop = $('pt-image-dropzone');
    var dropText = $('pt-image-dropzone-text');
    if (wrap && img && src) {
      img.src = src;
      wrap.style.display = '';
      /* 이미지가 표시될 때 드롭존 텍스트를 '교체'로 변경, 드롭존은 계속 보임 */
      if (drop) drop.style.display = '';
      if (dropText) dropText.textContent = '다른 이미지로 교체하려면 클릭하세요';
    }
  }

  function hideImagePreview() {
    var wrap = $('pt-image-preview');
    var img  = $('pt-image-preview-img');
    var drop = $('pt-image-dropzone');
    var dropText = $('pt-image-dropzone-text');
    if (wrap) wrap.style.display = 'none';
    if (img)  img.src = '';
    if (drop) drop.style.display = '';
    if (dropText) dropText.textContent = '실장도 이미지를 선택하세요 (PNG, JPG, GIF, WebP, SVG / 최대 10MB)';
    var fileInput = $('pt-image-file');
    if (fileInput) fileInput.value = '';
  }

  function resetImageState() {
    _pendingImageFile = null;
    _pendingImageRemove = false;
    hideImagePreview();
  }

  function loadExistingImage(tab) {
    if (tab && tab.tab_image) {
      showImagePreview('/api/page-tabs/' + tab.id + '/image');
    } else if (tab && isDcPage(tab.page_code) && STATIC_IMAGE_MAP[tab.tab_code]) {
      showImagePreview(STATIC_IMAGE_MAP[tab.tab_code]);
    } else {
      hideImagePreview();
    }
  }

  function uploadImageForTab(tabId, callback) {
    if (_pendingImageRemove && !_pendingImageFile) {
      fetch('/api/page-tabs/' + tabId + '/image', { method: 'DELETE', credentials: 'same-origin' })
        .then(function () { callback(); })
        .catch(function () { callback(); });
      return;
    }
    if (!_pendingImageFile) { callback(); return; }
    var fd = new FormData();
    fd.append('image', _pendingImageFile);
    fetch('/api/page-tabs/' + tabId + '/image', { method: 'POST', credentials: 'same-origin', body: fd })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.success) showMessage(d.message || '이미지 업로드 실패', '오류');
        callback();
      })
      .catch(function () { showMessage('이미지 업로드 중 오류', '오류'); callback(); });
  }

  function bindImageEvents() {
    var fileInput = $('pt-image-file');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        _pendingImageFile = f;
        _pendingImageRemove = false;
        var reader = new FileReader();
        reader.onload = function (e) { showImagePreview(e.target.result); };
        reader.readAsDataURL(f);
      });
    }
    var removeBtn = $('pt-image-remove-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', function () {
        _pendingImageFile = null;
        _pendingImageRemove = true;
        hideImagePreview();
      });
    }
    /* page_code 변경 시 이미지 섹션 토글 */
    var pgSel = $('edit-pt-page-code');
    if (pgSel) {
      pgSel.addEventListener('change', function () {
        var tc = $('edit-pt-tab-code');
        toggleImageSection(pgSel.value, tc ? tc.value.trim() : '');
      });
    }
    /* tab_code 변경 시 이미지 섹션 토글 (LIST/LOG 선택 시 숨김) */
    var tcInput = $('edit-pt-tab-code');
    if (tcInput) {
      tcInput.addEventListener('input', function () {
        var pg = $('edit-pt-page-code');
        toggleImageSection(pg ? pg.value : '', tcInput.value.trim());
      });
    }
  }

  /* ══════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    bindImageEvents();
    loadPageCodes();
    loadAllTabs();
  });
})();
