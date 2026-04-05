/* version.js v4.0.0 — 버전관리 (온프레미스 스타일) */
(function () {
  'use strict';

  /* ── 유틸 ── */
  function esc(s) { var d = document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; }

  /* ── 상태 ── */
  var _notesAll = [];       /* 전체 릴리즈 */
  var _notesFiltered = [];  /* 검색 필터 적용 */
  var _currentVersion = '';
  var _editingVersion = null;
  var _deletingVersions = [];
  var _page = 1;
  var _pageSize = 10;
  var _searchTerm = '';

  /* ── DOM refs ── */
  function $(id) { return document.getElementById(id); }

  /* ══════════════════════════════════════════════
     DATA
  ══════════════════════════════════════════════ */
  function loadReleaseNotes() {
    fetch('/api/release-notes', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        _notesAll = (d && d.notes) ? d.notes : [];
        _currentVersion = (d && d.current_version) || '';
        applyFilter();
      })
      .catch(function () { _notesAll = []; applyFilter(); });
  }

  /* ── 검색 필터 ── */
  function applyFilter() {
    if (!_searchTerm) {
      _notesFiltered = _notesAll.slice();
    } else {
      var terms = _searchTerm.toLowerCase().split('%').filter(Boolean);
      _notesFiltered = _notesAll.filter(function (n) {
        var blob = (n.version + ' ' + (n.items || []).join(' ')).toLowerCase();
        return terms.every(function (t) { return blob.indexOf(t) >= 0; });
      });
    }
    _page = 1;
    renderAll();
  }

  /* ── 렌더 ── */
  function renderAll() {
    var total = _notesFiltered.length;
    var totalPages = Math.max(1, Math.ceil(total / _pageSize));
    if (_page > totalPages) _page = totalPages;

    var start = (_page - 1) * _pageSize;
    var slice = _notesFiltered.slice(start, start + _pageSize);

    renderTable(slice);
    renderPagination(total, totalPages);
    updateCount(total);
    updateEmptyState(total);
    updateDeleteBtn();
  }

  function renderTable(notes) {
    var tbody = $('vr-tbody');
    if (!tbody) return;
    if (notes.length === 0) { tbody.innerHTML = ''; return; }

    var html = '';
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      var isCur = (n.version === _currentVersion);
      var badge = isCur ? '<span class="rn-badge current">Current</span>' : '<span class="rn-badge">이전</span>';
      var items = (n.items || []).join(', ');
      if (items.length > 120) items = items.substring(0, 117) + '…';

      html += '<tr data-version="' + esc(n.version) + '">';
      html += '<td><input type="checkbox" class="vr-row-cb" value="' + esc(n.version) + '" aria-label="선택"></td>';
      html += '<td class="vr-col-ver">' + esc(n.version) + '</td>';
      html += '<td class="vr-col-items" title="' + esc((n.items || []).join('\n')) + '">' + esc(items) + '</td>';
      html += '<td>' + badge + '</td>';
      html += '<td data-col="actions" class="system-actions">';
      html += '<button type="button" class="action-btn rn-edit-btn" data-action="edit" title="수정" data-version="' + esc(n.version) + '">';
      html += '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon">';
      html += '</button> ';
      html += '<button type="button" class="action-btn rn-delete-btn" data-action="delete" title="삭제" data-version="' + esc(n.version) + '">';
      html += '<img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">';
      html += '</button>';
      html += '</td>';
      html += '</tr>';
    }
    tbody.innerHTML = html;

    /* 체크박스 & 행 선택 */
    var cbs = tbody.querySelectorAll('.vr-row-cb');
    for (var j = 0; j < cbs.length; j++) {
      cbs[j].addEventListener('change', onRowCheckChange);
    }
    var allCb = $('vr-check-all');
    if (allCb) allCb.checked = false;
  }

  function onRowCheckChange(e) {
    var tr = e.target.closest('tr');
    if (tr) { e.target.checked ? tr.classList.add('selected') : tr.classList.remove('selected'); }
    syncCheckAll();
    updateDeleteBtn();
  }

  function syncCheckAll() {
    var all = document.querySelectorAll('.vr-row-cb');
    var checked = document.querySelectorAll('.vr-row-cb:checked');
    var allCb = $('vr-check-all');
    if (allCb) allCb.checked = (all.length > 0 && all.length === checked.length);
  }

  function updateDeleteBtn() {
    var btn = $('vr-delete-btn');
    var cnt = document.querySelectorAll('.vr-row-cb:checked').length;
    if (btn) btn.disabled = (cnt === 0);
  }

  function updateCount(total) {
    var el = $('vr-count');
    if (el) el.textContent = total;
  }

  function updateEmptyState(total) {
    var tbl = $('vr-table');
    var empty = $('vr-empty');
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
    /* info */
    var infoEl = $('vr-pagination-info');
    if (infoEl) {
      var s = (_page - 1) * _pageSize + 1;
      var e = Math.min(_page * _pageSize, total);
      infoEl.textContent = total === 0 ? '0개 항목' : (s + '-' + e + ' / ' + total + '개 항목');
    }

    /* buttons */
    var firstBtn = $('vr-first'), prevBtn = $('vr-prev'), nextBtn = $('vr-next'), lastBtn = $('vr-last');
    if (firstBtn) firstBtn.disabled = (_page <= 1);
    if (prevBtn) prevBtn.disabled = (_page <= 1);
    if (nextBtn) nextBtn.disabled = (_page >= totalPages);
    if (lastBtn) lastBtn.disabled = (_page >= totalPages);

    /* page numbers */
    var container = $('vr-page-numbers');
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
    var totalPages = Math.max(1, Math.ceil(_notesFiltered.length / _pageSize));
    _page = Math.max(1, Math.min(p, totalPages));
    renderAll();
  }

  /* ══════════════════════════════════════════════
     MODALS (온프레미스 스타일)
  ══════════════════════════════════════════════ */
  function showModal(id) {
    var el = $(id);
    if (el) {
      el.style.display = '';
      el.classList.add('show');
      el.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    }
  }
  function hideModal(id) {
    var el = $(id);
    if (el) {
      el.classList.remove('show');
      el.setAttribute('aria-hidden', 'true');
    }
    if (!document.querySelector('.modal-overlay-full.show, .server-add-modal.show')) {
      document.body.classList.remove('modal-open');
    }
  }
  function hideAllModals() { hideModal('vr-edit-modal'); hideModal('vr-delete-modal'); }

  /* ── 릴리즈 추가/수정 ── */
  function openAddRelease() {
    _editingVersion = null;
    $('release-modal-title').textContent = '새 릴리즈 추가';
    $('edit-rn-version').value = '';
    $('edit-rn-items').value = '';
    showModal('vr-edit-modal');
  }

  function openEditRelease(version) {
    _editingVersion = version;
    $('release-modal-title').textContent = '릴리즈 수정';
    $('edit-rn-version').value = version;
    var items = [];
    for (var i = 0; i < _notesAll.length; i++) {
      if (_notesAll[i].version === version) { items = _notesAll[i].items || []; break; }
    }
    $('edit-rn-items').value = items.join('\n');
    showModal('vr-edit-modal');
  }

  function saveRelease() {
    var version = $('edit-rn-version').value.trim();
    var raw = $('edit-rn-items').value;
    var items = raw.split('\n').filter(function (l) { return l.trim(); }).map(function (l) { return l.trim(); });
    if (!version) { alert('버전을 입력하세요.'); return; }
    if (!items.length) { alert('릴리즈 내용을 입력하세요.'); return; }

    var url, method, body;
    if (_editingVersion) {
      url = '/api/release-notes/' + encodeURIComponent(_editingVersion);
      method = 'PUT';
      body = { new_version: version, items: items };
    } else {
      url = '/api/release-notes';
      method = 'POST';
      body = { version: version, items: items };
    }
    fetch(url, { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d.success) { hideModal('vr-edit-modal'); loadReleaseNotes(); } else alert(d.error || '저장 실패'); })
      .catch(function () { alert('서버 통신 오류'); });
  }

  /* ── 삭제 ── */
  function openDeleteRelease(versions) {
    _deletingVersions = versions;
    var sub = $('vr-delete-subtitle');
    if (sub) sub.textContent = '선택된 ' + versions.length + '개의 릴리즈를 삭제하시겠습니까?';
    showModal('vr-delete-modal');
  }

  function confirmDelete() {
    if (!_deletingVersions.length) return;
    var remaining = _deletingVersions.slice();
    function next() {
      if (!remaining.length) { hideModal('vr-delete-modal'); loadReleaseNotes(); return; }
      var v = remaining.shift();
      fetch('/api/release-notes/' + encodeURIComponent(v), { method: 'DELETE', credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (!d.success) alert(v + ': ' + (d.error || '삭제 실패')); next(); })
        .catch(function () { alert('서버 통신 오류'); next(); });
    }
    next();
  }

  /* ══════════════════════════════════════════════
     EVENTS
  ══════════════════════════════════════════════ */
  function bindEvents() {
    /* 추가 */
    var addBtn = $('vr-add-btn');
    if (addBtn) addBtn.addEventListener('click', openAddRelease);

    /* 저장 */
    var saveBtn = $('btn-save-release');
    if (saveBtn) saveBtn.addEventListener('click', saveRelease);

    /* 삭제 확인 */
    var cfmBtn = $('btn-confirm-delete');
    if (cfmBtn) cfmBtn.addEventListener('click', confirmDelete);

    /* 상단 삭제 */
    var delBtn = $('vr-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', function () {
        var checked = document.querySelectorAll('.vr-row-cb:checked');
        if (!checked.length) return;
        var vs = [];
        for (var i = 0; i < checked.length; i++) vs.push(checked[i].value);
        openDeleteRelease(vs);
      });
    }

    /* 전체 선택 */
    var allCb = $('vr-check-all');
    if (allCb) {
      allCb.addEventListener('change', function () {
        var cbs = document.querySelectorAll('.vr-row-cb');
        for (var i = 0; i < cbs.length; i++) {
          cbs[i].checked = allCb.checked;
          var tr = cbs[i].closest('tr');
          if (tr) { allCb.checked ? tr.classList.add('selected') : tr.classList.remove('selected'); }
        }
        updateDeleteBtn();
      });
    }

    /* 모달 닫기 (X 버튼) */
    var editClose = $('vr-edit-close');
    if (editClose) editClose.addEventListener('click', function () { hideModal('vr-edit-modal'); });
    var delClose = $('vr-delete-close');
    if (delClose) delClose.addEventListener('click', function () { hideModal('vr-delete-modal'); });

    /* 모달 오버레이 클릭 닫기 */
    var modals = document.querySelectorAll('.modal-overlay-full');
    for (var m = 0; m < modals.length; m++) {
      modals[m].addEventListener('click', function (e) {
        if (e.target === this) hideAllModals();
      });
    }

    /* 테이블 이벤트 위임 (수정/삭제) */
    var tbody = $('vr-tbody');
    if (tbody) {
      tbody.addEventListener('click', function (e) {
        var edit = e.target.closest('.rn-edit-btn');
        if (edit) { openEditRelease(edit.getAttribute('data-version')); return; }
        var del = e.target.closest('.rn-delete-btn');
        if (del) { openDeleteRelease([del.getAttribute('data-version')]); return; }
      });
    }

    /* 검색 */
    var searchInput = $('vr-search');
    var searchClear = $('vr-search-clear');
    if (searchInput) {
      var debounce = null;
      searchInput.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () {
          _searchTerm = searchInput.value.trim();
          applyFilter();
        }, 200);
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

    /* 페이지 사이즈 */
    var pageSizeSel = $('vr-page-size');
    if (pageSizeSel) {
      pageSizeSel.addEventListener('change', function () {
        _pageSize = parseInt(pageSizeSel.value, 10) || 10;
        _page = 1;
        renderAll();
      });
    }

    /* 페이지네이션 버튼 */
    var pgFirst = $('vr-first'), pgPrev = $('vr-prev'), pgNext = $('vr-next'), pgLast = $('vr-last');
    if (pgFirst) pgFirst.addEventListener('click', function () { goPage(1); });
    if (pgPrev) pgPrev.addEventListener('click', function () { goPage(_page - 1); });
    if (pgNext) pgNext.addEventListener('click', function () { goPage(_page + 1); });
    if (pgLast) pgLast.addEventListener('click', function () { goPage(Math.ceil(_notesFiltered.length / _pageSize)); });

    /* 페이지 번호 클릭 */
    var pgNumbers = $('vr-page-numbers');
    if (pgNumbers) {
      pgNumbers.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-page]');
        if (btn) goPage(parseInt(btn.getAttribute('data-page'), 10));
      });
    }
  }

  /* ══════════════════════════════════════════════
     일반 사용자 버전 페이지 (/p/settings_version)
  ══════════════════════════════════════════════ */
  function loadVersionInfo() {
    fetch('/api/version', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var el;
        el = $('ver-version');    if (el) el.textContent = d.version || '—';
        el = $('ver-release-date'); if (el) el.textContent = d.release_date || '—';
        el = $('ver-build');      if (el) el.textContent = d.build || '—';
        el = $('ver-environment'); if (el) el.textContent = d.environment || '—';
      })
      .catch(function () { /* keep default dashes */ });
  }

  function loadPublicReleaseNotes() {
    var container = $('release-notes-container');
    if (!container) return;
    /* Keep the section title (h2) that already exists in HTML */
    var titleEl = container.querySelector('.doc-section-title');
    fetch('/api/release-notes', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var notes = (d && d.notes) ? d.notes : [];
        var max = 5;
        var html = '';
        if (titleEl) html += titleEl.outerHTML;
        if (notes.length === 0) {
          html += '<p class="doc-note">등록된 릴리즈 노트가 없습니다.</p>';
          container.innerHTML = html;
          return;
        }
        var show = notes.slice(0, max);
        for (var i = 0; i < show.length; i++) {
          var n = show[i];
          var cur = (d.current_version && n.version === d.current_version);
          html += '<div class="doc-rn-block">';
          html += '<div class="doc-def-term">' + esc(n.version);
          if (cur) html += ' <span class="doc-rn-current">Current</span>';
          html += '</div>';
          if (n.items && n.items.length) {
            html += '<ul class="doc-bullet-list">';
            for (var j = 0; j < n.items.length; j++) {
              html += '<li>' + esc(n.items[j]) + '</li>';
            }
            html += '</ul>';
          }
          html += '</div>';
        }
        container.innerHTML = html;
      })
      .catch(function () {
        var html = '';
        if (titleEl) html += titleEl.outerHTML;
        html += '<p class="doc-note">릴리즈 노트를 불러오지 못했습니다.</p>';
        container.innerHTML = html;
      });
  }

  /* ── 초기화 ── */
  function init() {
    /* 일반 사용자 버전 페이지 */
    if ($('ver-version')) {
      loadVersionInfo();
      loadPublicReleaseNotes();
      return;
    }
    /* 관리자 버전관리 페이지 */
    loadReleaseNotes();
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
