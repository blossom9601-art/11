/**
 * dynamic_tab_list.js
 * 동적으로 추가된 탭의 리스트 페이지 — 완전한 CRUD 지원
 * API: /api/dynamic-tab-records?route_key=xxx
 */
(function () {
  'use strict';

  /* ── 설정 ── */
  var tabDiv = document.getElementById('dynamic-system-tabs');
  var ROUTE_KEY = tabDiv ? tabDiv.getAttribute('data-current-key') : '';
  var API_BASE = '/api/dynamic-tab-records';
  var API_HEADERS = { 'Content-Type': 'application/json' };

  /* ── 상태 ── */
  var state = {
    data: [],
    filtered: [],
    selected: new Set(),
    page: 1,
    pageSize: 10,
    searchText: '',
    sortKey: '',
    sortDir: 'asc'
  };

  /* ── DOM 참조 ── */
  var $  = function (id) { return document.getElementById(id); };
  var tbody       = $('system-table-body');
  var countBadge  = $('system-count');
  var searchInput = $('system-search');
  var searchClear = $('system-search-clear');
  var pageSizeSel = $('system-page-size');
  var emptyEl     = $('system-empty');
  var tableCont   = document.querySelector('.system-table-container');
  var pagInfo     = $('system-pagination-info');
  var pagNumbers  = $('system-page-numbers');
  var selectAll   = $('system-select-all');

  /* ── API 헬퍼 ── */
  function api(url, opts) {
    var cfg = {
      method: (opts && opts.method) || 'GET',
      credentials: 'same-origin',
      headers: Object.assign({}, API_HEADERS, (opts && opts.headers) || {})
    };
    if (opts && opts.body != null) {
      cfg.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    }
    return fetch(url, cfg).then(function (r) { return r.json(); });
  }

  /* ── 데이터 로드 ── */
  function loadData() {
    var url = API_BASE + '?route_key=' + encodeURIComponent(ROUTE_KEY);
    if (state.searchText) url += '&q=' + encodeURIComponent(state.searchText);
    api(url).then(function (res) {
      state.data = (res && res.items) || [];
      state.selected.clear();
      if (selectAll) selectAll.checked = false;
      applyFilter();
    }).catch(function () {
      state.data = [];
      applyFilter();
    });
  }

  /* ── 필터 + 렌더 ── */
  function applyFilter() {
    var q = state.searchText.toLowerCase();
    state.filtered = q ? state.data.filter(function (r) {
      return (r.col_name || '').toLowerCase().indexOf(q) >= 0 ||
             (r.col_code || '').toLowerCase().indexOf(q) >= 0 ||
             (r.col_phone || '').toLowerCase().indexOf(q) >= 0 ||
             (r.col_address || '').toLowerCase().indexOf(q) >= 0 ||
             (r.col_note || '').toLowerCase().indexOf(q) >= 0;
    }) : state.data.slice();
    state.page = 1;
    render();
  }

  function render() {
    var total = state.filtered.length;
    if (countBadge) countBadge.textContent = total;

    var start = (state.page - 1) * state.pageSize;
    var pageRows = state.filtered.slice(start, start + state.pageSize);

    /* 빈 상태 */
    if (total === 0) {
      if (emptyEl) emptyEl.removeAttribute('hidden');
      if (tableCont) tableCont.style.display = 'none';
    } else {
      if (emptyEl) emptyEl.setAttribute('hidden', '');
      if (tableCont) tableCont.style.display = '';
    }

    /* 테이블 행 */
    if (tbody) {
      tbody.innerHTML = '';
      pageRows.forEach(function (row) {
        var tr = document.createElement('tr');
        tr.setAttribute('data-id', row.id);
        if (state.selected.has(row.id)) tr.classList.add('selected');
        tr.innerHTML =
          '<td><input type="checkbox" class="system-row-select" data-id="' + row.id + '"' + (state.selected.has(row.id) ? ' checked' : '') + '></td>' +
          '<td data-col="name">' + esc(row.col_name) + '</td>' +
          '<td data-col="code">' + esc(row.col_code) + '</td>' +
          '<td data-col="phone">' + esc(row.col_phone) + '</td>' +
          '<td data-col="address">' + esc(row.col_address) + '</td>' +
          '<td data-col="line_qty">' + (row.col_count1 || 0) + '</td>' +
          '<td data-col="actions" class="system-actions">' +
            '<button type="button" class="action-btn" data-action="edit" data-id="' + row.id + '" title="수정" aria-label="수정">' +
              '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon">' +
            '</button>' +
          '</td>';
        tbody.appendChild(tr);
      });
    }

    /* 페이지네이션 */
    var totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    if (pagInfo) {
      if (total === 0) {
        pagInfo.textContent = '0개 항목';
      } else {
        pagInfo.textContent = (start + 1) + '-' + Math.min(start + state.pageSize, total) + ' / ' + total + '개 항목';
      }
    }
    renderPageNumbers(totalPages);

    var first = $('system-first'), prev = $('system-prev');
    var next = $('system-next'), last = $('system-last');
    if (first) first.disabled = state.page <= 1;
    if (prev) prev.disabled = state.page <= 1;
    if (next) next.disabled = state.page >= totalPages;
    if (last) last.disabled = state.page >= totalPages;
  }

  function renderPageNumbers(totalPages) {
    if (!pagNumbers) return;
    pagNumbers.innerHTML = '';
    for (var p = 1; p <= totalPages && p <= 50; p++) {
      var btn = document.createElement('button');
      btn.className = 'page-btn' + (p === state.page ? ' active' : '');
      btn.textContent = p;
      btn.dataset.page = p;
      pagNumbers.appendChild(btn);
    }
  }

  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* ── 이벤트: 페이지네이션 ── */
  if ($('system-first')) $('system-first').addEventListener('click', function () { state.page = 1; render(); });
  if ($('system-prev'))  $('system-prev').addEventListener('click', function ()  { state.page = Math.max(1, state.page - 1); render(); });
  if ($('system-next'))  $('system-next').addEventListener('click', function ()  { state.page++; render(); });
  if ($('system-last'))  $('system-last').addEventListener('click', function ()  {
    state.page = Math.max(1, Math.ceil(state.filtered.length / state.pageSize)); render();
  });
  if (pagNumbers) pagNumbers.addEventListener('click', function (e) {
    if (e.target.classList.contains('page-btn')) {
      state.page = parseInt(e.target.dataset.page, 10); render();
    }
  });

  /* ── 이벤트: 페이지 사이즈 ── */
  if (pageSizeSel) pageSizeSel.addEventListener('change', function () {
    state.pageSize = parseInt(pageSizeSel.value, 10) || 10;
    state.page = 1;
    render();
  });

  /* ── 이벤트: 검색 ── */
  var searchTimer = null;
  if (searchInput) searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.searchText = (searchInput.value || '').trim();
      applyFilter();
    }, 220);
  });
  if (searchClear) searchClear.addEventListener('click', function () {
    if (searchInput) searchInput.value = '';
    state.searchText = '';
    applyFilter();
  });

  /* ── 이벤트: 체크박스 ── */
  if (selectAll) selectAll.addEventListener('change', function () {
    var start = (state.page - 1) * state.pageSize;
    var pageRows = state.filtered.slice(start, start + state.pageSize);
    pageRows.forEach(function (r) {
      if (selectAll.checked) state.selected.add(r.id); else state.selected.delete(r.id);
    });
    render();
  });
  if (tbody) tbody.addEventListener('change', function (e) {
    var chk = e.target.closest('.system-row-select');
    if (!chk) return;
    var id = parseInt(chk.getAttribute('data-id'), 10);
    if (chk.checked) state.selected.add(id); else state.selected.delete(id);
    var tr = chk.closest('tr');
    if (tr) tr.classList.toggle('selected', chk.checked);
  });

  /* ── 모달 헬퍼 ── */
  function openModal(id) {
    var m = $(id); if (!m) return;
    m.classList.add('show');
    m.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }
  function closeModal(id) {
    var m = $(id); if (!m) return;
    m.classList.remove('show');
    m.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  /* ── 추가 ── */
  var addBtn = $('system-add-btn');
  if (addBtn) addBtn.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation();
    var form = $('dyn-add-form');
    if (form) form.reset();
    openModal('dyn-add-modal');
  });

  var addSave = $('dyn-add-save');
  if (addSave) addSave.addEventListener('click', function () {
    var name = ($('dyn-add-name') || {}).value || '';
    if (!name.trim()) {
      if (typeof showToast === 'function') showToast('이름은 필수입니다.', 'error');
      return;
    }
    var payload = {
      route_key: ROUTE_KEY,
      name: name.trim(),
      code: (($('dyn-add-code') || {}).value || '').trim(),
      phone: (($('dyn-add-phone') || {}).value || '').trim(),
      address: (($('dyn-add-address') || {}).value || '').trim(),
      count1: parseInt(($('dyn-add-count1') || {}).value, 10) || 0,
      note: (($('dyn-add-note') || {}).value || '').trim()
    };
    api(API_BASE, { method: 'POST', body: payload }).then(function (res) {
      if (res && res.success) {
        closeModal('dyn-add-modal');
        if (typeof showToast === 'function') showToast('등록되었습니다.', 'success');
        loadData();
      } else {
        if (typeof showToast === 'function') showToast((res && res.message) || '등록 실패', 'error');
      }
    }).catch(function () {
      if (typeof showToast === 'function') showToast('등록 중 오류가 발생했습니다.', 'error');
    });
  });

  var addClose = $('dyn-add-close');
  if (addClose) addClose.addEventListener('click', function () { closeModal('dyn-add-modal'); });
  var addCancel = $('dyn-add-cancel');
  if (addCancel) addCancel.addEventListener('click', function () { closeModal('dyn-add-modal'); });

  /* ── 수정 + 행 클릭 선택 토글 ── */
  if (tbody) tbody.addEventListener('click', function (e) {
    var editBtn = e.target.closest('[data-action="edit"]');
    if (editBtn) {
      var id = parseInt(editBtn.getAttribute('data-id'), 10);
      var row = state.data.find(function (r) { return r.id === id; });
      if (!row) return;
    ($('dyn-edit-id') || {}).value = row.id;
    ($('dyn-edit-name') || {}).value = row.col_name || '';
    ($('dyn-edit-code') || {}).value = row.col_code || '';
    ($('dyn-edit-phone') || {}).value = row.col_phone || '';
    ($('dyn-edit-address') || {}).value = row.col_address || '';
    ($('dyn-edit-count1') || {}).value = row.col_count1 || 0;
    ($('dyn-edit-note') || {}).value = row.col_note || '';
    openModal('dyn-edit-modal');
      return;
    }
    /* 행 클릭 → 체크박스 토글 (관리 영역, 체크박스 자체 클릭 제외) */
    if (e.target.closest('.system-actions')) return;
    var tr = e.target.closest('tr');
    if (!tr) return;
    var cb = tr.querySelector('.system-row-select');
    if (!cb) return;
    if (e.target.classList.contains('system-row-select')) return;
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  });

  var editSave = $('dyn-edit-save');
  if (editSave) editSave.addEventListener('click', function () {
    var id = parseInt(($('dyn-edit-id') || {}).value, 10);
    if (!id) return;
    var payload = {
      name: (($('dyn-edit-name') || {}).value || '').trim(),
      code: (($('dyn-edit-code') || {}).value || '').trim(),
      phone: (($('dyn-edit-phone') || {}).value || '').trim(),
      address: (($('dyn-edit-address') || {}).value || '').trim(),
      count1: parseInt(($('dyn-edit-count1') || {}).value, 10) || 0,
      note: (($('dyn-edit-note') || {}).value || '').trim()
    };
    api(API_BASE + '/' + id, { method: 'PUT', body: payload }).then(function (res) {
      if (res && res.success) {
        closeModal('dyn-edit-modal');
        if (typeof showToast === 'function') showToast('수정되었습니다.', 'success');
        loadData();
      } else {
        if (typeof showToast === 'function') showToast((res && res.message) || '수정 실패', 'error');
      }
    }).catch(function () {
      if (typeof showToast === 'function') showToast('수정 중 오류가 발생했습니다.', 'error');
    });
  });

  var editClose = $('dyn-edit-close');
  if (editClose) editClose.addEventListener('click', function () { closeModal('dyn-edit-modal'); });
  var editCancel = $('dyn-edit-cancel');
  if (editCancel) editCancel.addEventListener('click', function () { closeModal('dyn-edit-modal'); });

  /* ── 삭제 ── */
  var deleteBtn = $('system-delete-btn');
  if (deleteBtn) deleteBtn.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation();
    if (state.selected.size === 0) {
      if (typeof showToast === 'function') showToast('삭제할 항목을 선택하세요.', 'info');
      return;
    }
    var cnt = $('dyn-delete-count');
    if (cnt) cnt.textContent = state.selected.size;
    openModal('dyn-delete-modal');
  });

  var deleteConfirm = $('dyn-delete-confirm');
  if (deleteConfirm) deleteConfirm.addEventListener('click', function () {
    var ids = Array.from(state.selected);
    api(API_BASE + '/bulk-delete', { method: 'POST', body: { ids: ids } }).then(function (res) {
      closeModal('dyn-delete-modal');
      if (res && res.success) {
        if (typeof showToast === 'function') showToast(ids.length + '개 항목이 삭제되었습니다.', 'success');
        loadData();
      } else {
        if (typeof showToast === 'function') showToast((res && res.message) || '삭제 실패', 'error');
      }
    }).catch(function () {
      closeModal('dyn-delete-modal');
      if (typeof showToast === 'function') showToast('삭제 중 오류가 발생했습니다.', 'error');
    });
  });

  var deleteClose = $('dyn-delete-close');
  if (deleteClose) deleteClose.addEventListener('click', function () { closeModal('dyn-delete-modal'); });
  var deleteCancel = $('dyn-delete-cancel');
  if (deleteCancel) deleteCancel.addEventListener('click', function () { closeModal('dyn-delete-modal'); });

  /* ── 통계/복제/다운로드: 안내 ── */
  ['system-bulk-btn', 'system-stats-btn', 'system-duplicate-btn'].forEach(function (id) {
    var btn = $(id);
    if (btn) btn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (typeof showToast === 'function') showToast('준비 중인 기능입니다.', 'info');
    });
  });

  /* ── CSV 다운로드 ── */
  var downloadBtn = $('system-download-btn');
  if (downloadBtn) downloadBtn.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation();
    if (state.filtered.length === 0) {
      if (typeof showToast === 'function') showToast('다운로드할 데이터가 없습니다.', 'info');
      return;
    }
    var headers = document.querySelectorAll('#system-table thead th[data-col]');
    var cols = [];
    headers.forEach(function (th) {
      var col = th.getAttribute('data-col');
      if (col && col !== 'actions') cols.push({ key: col, label: th.textContent.trim() });
    });
    var colMap = { name: 'col_name', code: 'col_code', phone: 'col_phone', address: 'col_address', line_qty: 'col_count1' };
    var bom = '\uFEFF';
    var csv = bom + cols.map(function (c) { return c.label; }).join(',') + '\n';
    state.filtered.forEach(function (row) {
      csv += cols.map(function (c) {
        var v = row[colMap[c.key]] || row[c.key] || '';
        return '"' + String(v).replace(/"/g, '""') + '"';
      }).join(',') + '\n';
    });
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = ROUTE_KEY + '_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    if (typeof showToast === 'function') showToast('CSV 다운로드 완료', 'success');
  });

  /* ── ESC 닫기 ── */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      ['dyn-add-modal', 'dyn-edit-modal', 'dyn-delete-modal'].forEach(function (id) {
        var m = $(id);
        if (m && m.classList.contains('show')) closeModal(id);
      });
    }
  });

  /* ── 탭 active 보정 (SPA 네비게이션 후 data-current-key 동기화 보장) ── */
  function fixTabActive() {
    if (!ROUTE_KEY) return;
    var tabs = document.querySelectorAll('.system-tabs .system-tab-btn');
    if (!tabs.length) return;
    tabs.forEach(function (t) {
      var href = t.getAttribute('href') || '';
      var isMatch = href === '/p/' + ROUTE_KEY;
      if (isMatch) {
        t.classList.add('active');
        t.setAttribute('aria-selected', 'true');
      } else {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      }
    });
  }
  // page_tab_renderer가 비동기로 탭을 생성하므로 지연 실행
  setTimeout(fixTabActive, 300);
  setTimeout(fixTabActive, 800);

  /* ── 모달 백드롭 닫기 ── */
  ['dyn-add-modal', 'dyn-edit-modal', 'dyn-delete-modal'].forEach(function (id) {
    var m = $(id);
    if (m) m.addEventListener('click', function (e) {
      if (e.target === m) closeModal(id);
    });
  });

  /* ── 빈 상태 관리 마커 ── */
  try { document.body.dataset.blossomListEmptyManaged = '1'; } catch (_e) {}

  /* ── 초기 로드 ── */
  if (ROUTE_KEY) loadData();
})();

