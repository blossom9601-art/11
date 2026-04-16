(function () {
  'use strict';

  window.BlossomOpexContracts = { initFromPage };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFromPage);
  } else {
    initFromPage();
  }
  document.addEventListener('blossom:pageLoaded', function(){
    try { initFromPage(); } catch (_e) {}
  });

  function _detectOpexTypeFromUrl() {
    var p = window.location.pathname || '';
    if (p.indexOf('cost_opex_hardware') >= 0) return 'HW';
    if (p.indexOf('cost_opex_software') >= 0) return 'SW';
    if (p.indexOf('cost_opex_etc') >= 0) return 'ETC';
    return null;
  }

  function initFromPage() {
    var urlType = _detectOpexTypeFromUrl();
    var root = document.querySelector('main[data-opex-type]') || (urlType ? document.querySelector('main.main-content') : null);
    if (!root) {
      return;
    }

    var resolvedType = urlType || (root.dataset.opexType || '').toUpperCase() || 'HW';
    try {
      if (root.dataset && root.dataset.opexContractsInit === resolvedType) return;
      root.dataset.opexContractsInit = resolvedType;
    } catch (_e) {}

    const TYPE_LABELS = { HW: '하드웨어', SW: '소프트웨어', ETC: '기타' };
    const OPEX_TYPE = resolvedType;
    const TYPE_LABEL = TYPE_LABELS[OPEX_TYPE] || 'OPEX';
    // Under partial navigation, inline <script> tags in swapped HTML won't execute.
    // Prefer the detail URL stored on the swapped <main> element; fallback to URL-based.
    var _DETAIL_URLS = { HW: '/p/cost_opex_hardware_detail', SW: '/p/cost_opex_software_detail', ETC: '/p/cost_opex_etc_detail' };
    const DETAIL_URL = (root.dataset.detailUrl || window.__MODULE_DETAIL_URL || _DETAIL_URLS[OPEX_TYPE] || null);
    const API_BASE = '/api/opex-contracts';
    const VENDOR_API = '/api/vendor-maintenance';
    const FLATPICKR_CSS = '/static/vendor/flatpickr/4.6.13/flatpickr.min.css';
    const FLATPICKR_THEME_NAME = 'airbnb';
    const FLATPICKR_THEME_HREF = '/static/vendor/flatpickr/4.6.13/themes/airbnb.css';
    const FLATPICKR_JS = '/static/vendor/flatpickr/4.6.13/flatpickr.min.js';
    const FLATPICKR_LOCALE = '/static/vendor/flatpickr/4.6.13/l10n/ko.js';
    const DATE_INPUT_SELECTOR = 'input.form-input.date-input';

    const els = {
      tbody: document.getElementById('system-table-body'),
      count: document.getElementById('system-count'),
      empty: document.getElementById('system-empty'),
      emptyTitle: document.getElementById('system-empty-title'),
      emptyDesc: document.getElementById('system-empty-desc'),
      search: document.getElementById('system-search'),
      searchClear: document.getElementById('system-search-clear'),
      searchHint: document.getElementById('system-search-hint'),
      pageSize: document.getElementById('system-page-size'),
      paginationInfo: document.getElementById('system-pagination-info'),
      pageNumbers: document.getElementById('system-page-numbers'),
      selectAll: document.getElementById('system-select-all'),
      pagination: {
        first: document.getElementById('system-first'),
        prev: document.getElementById('system-prev'),
        next: document.getElementById('system-next'),
        last: document.getElementById('system-last'),
      },
      columnBtn: document.getElementById('system-column-btn'),
      columnModal: document.getElementById('system-column-modal'),
      columnForm: document.getElementById('system-column-form'),
      columnClose: document.getElementById('system-column-close'),
      columnApply: document.getElementById('system-column-apply'),
      columnReset: document.getElementById('system-column-reset'),
      columnSelectAll: document.getElementById('system-column-selectall-btn'),
      addBtn: document.getElementById('system-add-btn'),
      addModal: document.getElementById('system-add-modal'),
      addForm: document.getElementById('system-add-form'),
      addSave: document.getElementById('system-add-save'),
      addClose: document.getElementById('system-add-close'),
      editModal: document.getElementById('system-edit-modal'),
      editForm: document.getElementById('system-edit-form'),
      editSave: document.getElementById('system-edit-save'),
      editClose: document.getElementById('system-edit-close'),
      deleteBtn: document.getElementById('system-delete-btn'),
      deleteModal: document.getElementById('system-delete-modal'),
      deleteClose: document.getElementById('system-delete-close'),
      deleteConfirm: document.getElementById('system-delete-confirm'),
      bulkBtn: document.getElementById('system-bulk-btn'),
      bulkModal: document.getElementById('system-bulk-modal'),
      duplicateBtn: document.getElementById('system-duplicate-btn'),
      duplicateModal: document.getElementById('system-duplicate-modal'),
      statsBtn: document.getElementById('system-stats-btn'),
      statsModal: document.getElementById('system-stats-modal'),
      uploadBtn: document.getElementById('system-upload-btn'),
      uploadModal: document.getElementById('system-upload-modal'),
      downloadBtn: document.getElementById('system-download-btn'),
      downloadModal: document.getElementById('system-download-modal'),
      downloadClose: document.getElementById('system-download-close'),
      downloadConfirm: document.getElementById('system-download-confirm'),
      csvRange: document.querySelectorAll('input[name="csv-range"]'),
      messageModal: document.getElementById('system-message-modal'),
      messageTitle: document.getElementById('message-title'),
      messageContent: document.getElementById('message-content'),
      messageClose: document.getElementById('system-message-close'),
      messageOk: document.getElementById('system-message-ok'),
      deleteSubtitle: document.getElementById('delete-subtitle'),
      duplicateSubtitle: document.getElementById('duplicate-subtitle'),
      bulkSubtitle: document.getElementById('bulk-subtitle'),
    };

    const EMPTY_TEXT = {
      defaultTitle: els.emptyTitle ? els.emptyTitle.textContent.trim() : '등록된 계약이 없습니다.',
      defaultDesc: els.emptyDesc ? els.emptyDesc.textContent.trim() : '우측 상단 "추가" 버튼으로 첫 계약을 등록하세요.',
      loadingTitle: '계약 목록을 불러오는 중입니다.',
      loadingDesc: `${TYPE_LABEL} 계약 데이터를 가져오는 중이에요. 잠시만 기다려 주세요.`,
      errorTitle: '계약 목록을 불러오지 못했습니다.',
      errorDesc: '잠시 후 다시 시도하거나 관리자에게 문의해 주세요.',
    };

    const COLUMN_KEYS = [
      'contract_status',
      'contract_name',
      'manage_no',
      'maint_vendor',
      'maint_qty_total',
      'maint_qty_active',
      'maint_start',
      'maint_end',
      'maint_amount',
      'inspection_target',
      'maint_manager',
      'memo',
    ];

    const COLUMN_META = {
      contract_status: { label: '계약상태', section: '계약' },
      contract_name: { label: '계약명', section: '계약' },
      manage_no: { label: '관리번호', section: '계약' },
      maint_vendor: { label: '유지보수 사업자', section: '계약' },
      maint_qty_total: { label: '유지보수 전체수량', section: '유지보수' },
      maint_qty_active: { label: '유지보수 활성수량', section: '유지보수' },
      maint_start: { label: '유지보수 시작일', section: '유지보수' },
      maint_end: { label: '유지보수 종료일', section: '유지보수' },
      maint_amount: { label: '유지보수 금액', section: '유지보수' },
      inspection_target: { label: '유지보수 점검대상', section: '유지보수' },
      maint_manager: { label: '유지보수 담당자', section: '유지보수' },
      memo: { label: '비고', section: '유지보수' },
    };

    const COLS_STORAGE_KEY = `opex_contract_visible_columns_v2_${OPEX_TYPE}`;
    // 'memo'(비고) is available but hidden by default.
    const DEFAULT_VISIBLE_COLUMNS = COLUMN_KEYS.filter((c) => c !== 'memo');
    const COLUMN_MODAL_EXCLUDED = new Set([]);

    const state = {
      records: [],
      filtered: [],
      vendors: [],
      vendorMap: new Map(),
      selected: new Set(),
      editingId: null,
      page: 1,
      pageSize: parseInt((els.pageSize && els.pageSize.value) || '10', 10) || 10,
      status: 'idle',
      errorMessage: '',
      visibleCols: new Set(DEFAULT_VISIBLE_COLUMNS),
      managerUsers: [],
    };

    // Restore visible columns preference
    try {
      const saved = JSON.parse(localStorage.getItem(COLS_STORAGE_KEY) || 'null');
      if (Array.isArray(saved) && saved.length) {
        const next = saved.filter((c) => COLUMN_KEYS.includes(c) && !COLUMN_MODAL_EXCLUDED.has(c));
        if (next.length) state.visibleCols = new Set(next);
      }
    } catch (_e) {}

    const searchableSelectMeta = new WeakMap();
    let activeSearchPanel = null;
    const wiredCommaInputs = new WeakSet();
    const wiredDateRangeForms = new WeakSet();

    bindEvents();
    enhanceSearchableSelects();
    wireCurrencyInputs();
    wireDateRangeConstraints();
    initDatePickers().catch(() => {});
    hydrate();

    function bindEvents() {
      if (els.search) {
        els.search.addEventListener('input', handleSearchInput);
        els.search.addEventListener('focus', () => toggleSearchHint(true));
        els.search.addEventListener('blur', () => toggleSearchHint(false));
      }
      if (els.searchClear) {
        els.searchClear.addEventListener('click', () => {
          if (!els.search) return;
          els.search.value = '';
          handleSearchInput();
          els.search.focus();
        });
      }
      document.addEventListener('keydown', handleShortcuts, true);

      if (els.pageSize) {
        els.pageSize.addEventListener('change', () => {
          state.pageSize = parseInt(els.pageSize.value || '10', 10) || 10;
          state.page = 1;
          render();
        });
      }

      if (els.selectAll) {
        els.selectAll.addEventListener('change', () => {
          const currentIds = currentPageRows().map((row) => row.id);
          if (els.selectAll.checked) {
            currentIds.forEach((id) => state.selected.add(id));
          } else {
            currentIds.forEach((id) => state.selected.delete(id));
          }
          renderTable();
          updateBulkLabels();
        });
      }

      if (els.tbody) {
        els.tbody.addEventListener('change', (evt) => {
          const target = evt.target;
          if (!target.classList.contains('system-row-select')) return;
          const id = Number(target.dataset.id);
          if (target.checked) {
            state.selected.add(id);
          } else {
            state.selected.delete(id);
          }
          updateSelectAllState();
          updateBulkLabels();
        });
        els.tbody.addEventListener('click', (evt) => {
          const targetEl = (evt.target instanceof Element)
            ? evt.target
            : (evt.target && evt.target.parentElement ? evt.target.parentElement : null);

          if (!targetEl) return;

          const link = targetEl.closest('a.manage-no-link');
          if (link && DETAIL_URL) {
            evt.preventDefault();
            const token = (link.dataset.pageToken || '').toString().trim();
            const manageNo = (link.dataset.manageNo || '').toString().trim();
            const cleanHref = (DETAIL_URL || '').toString().replace(/\/$/, '');
            const fallbackHref = (link.getAttribute('href') || cleanHref || '').toString();
            const key = keyFromDetailUrl(cleanHref);
            if (key) {
              setCostDetailContext(key, token, manageNo)
                .then(() => { blsSpaNavigate(cleanHref); })
                .catch(() => { blsSpaNavigate(fallbackHref); });
              return;
            }

            // If key extraction fails, fall back to href that includes ?id=...
            blsSpaNavigate(fallbackHref);
            return;
          }

          const btn = targetEl.closest('[data-action="edit"]');
          if (!btn) return;
          const id = Number(btn.dataset.id);
          openEditModal(id);
        });
      }

      Object.entries(els.pagination).forEach(([key, button]) => {
        if (!button) return;
        button.addEventListener('click', () => handlePaginationClick(key));
      });
      if (els.pageNumbers) {
        els.pageNumbers.addEventListener('click', (evt) => {
          const targetEl = (evt.target instanceof Element)
            ? evt.target
            : (evt.target && evt.target.parentElement ? evt.target.parentElement : null);
          if (!targetEl) return;
          const btn = targetEl.closest('button[data-page]');
          if (!btn) return;
          state.page = Number(btn.dataset.page) || 1;
          render();
        });
      }

      if (els.addBtn) {
        els.addBtn.addEventListener('click', () => {
          state.editingId = null;
          if (els.addForm) {
            els.addForm.reset();
            syncSearchableSelects(els.addForm);
            syncDateRangeConstraints(els.addForm);
          }
          openModal(els.addModal);
        });
      }
      if (els.addClose) {
        els.addClose.addEventListener('click', () => closeModal(els.addModal));
      }
      if (els.addSave) {
        els.addSave.addEventListener('click', handleAddSubmit);
      }

      if (els.editClose) {
        els.editClose.addEventListener('click', () => closeModal(els.editModal));
      }
      if (els.editSave) {
        els.editSave.addEventListener('click', handleEditSubmit);
      }

      if (els.deleteBtn) {
        els.deleteBtn.addEventListener('click', () => {
          if (!state.selected.size) {
            showMessage('삭제할 계약을 먼저 선택하세요.');
            return;
          }
          updateBulkLabels();
          openModal(els.deleteModal);
        });
      }
      if (els.deleteClose) {
        els.deleteClose.addEventListener('click', () => closeModal(els.deleteModal));
      }
      if (els.deleteConfirm) {
        els.deleteConfirm.addEventListener('click', handleDeleteSubmit);
      }

      // Column modal
      if (els.columnBtn) {
        els.columnBtn.addEventListener('click', () => {
          buildColumnModal();
          openModal(els.columnModal);
        });
      }
      if (els.columnClose) {
        els.columnClose.addEventListener('click', () => closeModal(els.columnModal));
      }
      if (els.columnApply) {
        els.columnApply.addEventListener('click', () => {
          if (!els.columnForm) return;
          const checked = [...els.columnForm.querySelectorAll('input[type=checkbox]:checked')]
            .map((i) => i.value)
            .filter((c) => COLUMN_KEYS.includes(c) && !COLUMN_MODAL_EXCLUDED.has(c));
          state.visibleCols = new Set(checked);
          try {
            localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify([...state.visibleCols]));
          } catch (_e) {}
          applyColumnVisibility();
          closeModal(els.columnModal);
        });
      }
      if (els.columnReset) {
        els.columnReset.addEventListener('click', () => {
          state.visibleCols = new Set(DEFAULT_VISIBLE_COLUMNS);
          try {
            localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify([...state.visibleCols]));
          } catch (_e) {}
          buildColumnModal();
          applyColumnVisibility();
        });
      }
      if (els.columnSelectAll) {
        els.columnSelectAll.addEventListener('click', () => {
          if (!els.columnForm) return;
          els.columnForm.querySelectorAll('input[type=checkbox]').forEach((i) => {
            i.checked = true;
          });
          els.columnForm.querySelectorAll('label.column-checkbox').forEach((l) => l.classList.add('is-active'));
        });
      }

      attachComingSoon(els.bulkBtn, '일괄변경 기능은 준비 중입니다.');
      attachComingSoon(els.duplicateBtn, '행 복제 기능은 준비 중입니다.');
      attachComingSoon(els.statsBtn, '통계 기능은 준비 중입니다.');
      attachComingSoon(els.uploadBtn, '엑셀 업로드 기능은 준비 중입니다.');

      if (els.downloadBtn) {
        els.downloadBtn.addEventListener('click', () => openModal(els.downloadModal));
      }
      if (els.downloadClose) {
        els.downloadClose.addEventListener('click', () => closeModal(els.downloadModal));
      }
      if (els.downloadConfirm) {
        els.downloadConfirm.addEventListener('click', handleDownload);
      }

      [els.messageClose, els.messageOk].forEach((button) => {
        if (!button) return;
        button.addEventListener('click', () => closeModal(els.messageModal));
      });

      document.addEventListener('reset', handleFormReset, true);
    }

    function getLabel(col) {
      return (COLUMN_META[col] && COLUMN_META[col].label) || col;
    }

    function buildColumnModal() {
      if (!els.columnForm) return;
      els.columnForm.innerHTML = '';
      var sections = [];
      var sectionMap = {};
      COLUMN_KEYS.forEach(function(col) {
        if (COLUMN_MODAL_EXCLUDED.has(col)) return;
        var meta = COLUMN_META[col] || {};
        var section = meta.section || '';
        if (!sectionMap[section]) {
          sectionMap[section] = [];
          sections.push(section);
        }
        sectionMap[section].push(col);
      });
      sections.forEach(function(section) {
        var formSection = document.createElement('div');
        formSection.className = 'form-section';
        formSection.innerHTML = '<div class="section-header"><h4>' + escapeHtml(section) + '</h4></div>';
        var grid = document.createElement('div');
        grid.className = 'column-select-grid';
        sectionMap[section].forEach(function(col) {
          var label = getLabel(col);
          var wrap = document.createElement('label');
          wrap.className = 'column-checkbox' + (state.visibleCols.has(col) ? ' is-active' : '');
          wrap.innerHTML = '<input type="checkbox" value="' + col + '" ' + (state.visibleCols.has(col) ? 'checked' : '') + '><span class="col-check" aria-hidden="true"></span><span class="col-text">' + label + '</span>';
          var input = wrap.querySelector('input');
          if (input) {
            input.addEventListener('change', function() {
              wrap.classList.toggle('is-active', this.checked);
            });
          }
          grid.appendChild(wrap);
        });
        formSection.appendChild(grid);
        els.columnForm.appendChild(formSection);
      });
    }

    function applyColumnVisibility() {
      const table = document.getElementById('system-table');
      if (!table) return;
      table.querySelectorAll('thead th[data-col], tbody td[data-col]').forEach((cell) => {
        const col = cell.getAttribute('data-col');
        if (!col || col === 'actions') return;
        if (COLUMN_MODAL_EXCLUDED.has(col)) {
          // Treat excluded columns as always hidden.
          cell.classList.add('col-hidden');
          return;
        }
        if (state.visibleCols.has(col)) cell.classList.remove('col-hidden');
        else cell.classList.add('col-hidden');
      });
    }

    function hydrate() {
      loadVendors();
      loadManagerUsers();
      loadContracts();
    }

    async function loadVendors() {
      try {
        const res = await fetch(VENDOR_API, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('유지보수사 목록을 불러오지 못했습니다.');
        const payload = await res.json();
        state.vendors = Array.isArray(payload.items) ? payload.items : [];
        state.vendorMap = new Map(state.vendors.map((item) => [Number(item.id), item]));
        populateVendorSelects();
      } catch (error) {
        console.error(error);
        showMessage(error.message || '유지보수사 목록을 불러오지 못했습니다.');
      }
    }

    async function loadContracts() {
      state.status = 'loading';
      render();
      try {
        const url = `${API_BASE}?opex_type=${encodeURIComponent(OPEX_TYPE)}`;
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('계약 목록을 불러오지 못했습니다.');
        const payload = await res.json();
        const items = Array.isArray(payload.items) ? payload.items : [];
        state.records = items.map(normalizeRecord);
        state.status = state.records.length ? 'ready' : 'empty';
        state.errorMessage = '';
        state.selected.clear();
        applyFilter();
      } catch (error) {
        console.error(error);
        state.records = [];
        state.filtered = [];
        state.status = 'error';
        state.errorMessage = error.message || '계약 목록을 불러오지 못했습니다.';
        render();
        showMessage(state.errorMessage);
      }
    }

    function normalizeRecord(row) {
      const rawInspection = row.inspection_target;
      let inspectionValue;
      if (rawInspection === true || rawInspection === 1 || rawInspection === '1') {
        inspectionValue = 'O';
      } else if (rawInspection === false || rawInspection === 0 || rawInspection === '0') {
        inspectionValue = 'X';
      } else {
        const inspStr = String(rawInspection == null ? '' : rawInspection).trim().toUpperCase();
        inspectionValue = inspStr === 'O' ? 'O' : 'X';
      }
      return {
        id: Number(row.id),
        vendor_id: Number(row.vendor_id) || null,
        contract_status: row.contract_status || '',
        contract_name: row.contract_name || '',
        manage_no: row.contract_code || '',
        maint_vendor: row.vendor_name || row.maint_vendor || '',
        maint_qty_total: parseNullableNumber(row.total_license_count),
        maint_qty_active: parseNullableNumber(row.active_license_count),
        maint_start: row.maintenance_start_date || '',
        maint_end: row.maintenance_end_date || '',
        maint_amount: parseNullableNumber(row.maintenance_amount),
        inspection_target: inspectionValue,
        maint_manager: row.maint_manager || '',
        memo: row.memo || row.description || '',
        description: row.description || row.memo || '',
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    }

    function parseNullableNumber(value) {
      if (value === null || value === undefined || value === '') return '';
      const num = Number(value);
      return Number.isNaN(num) ? '' : num;
    }

    function handleSearchInput() {
      const value = ((els.search && els.search.value) || '').trim();
      state.page = 1;
      applyFilter(value);
    }

    function toggleSearchHint(show) {
      if (!els.searchHint) return;
      if (show) {
        els.searchHint.removeAttribute('hidden');
        els.searchHint.setAttribute('aria-hidden', 'false');
      } else {
        els.searchHint.setAttribute('hidden', 'true');
        els.searchHint.setAttribute('aria-hidden', 'true');
      }
    }

    function handleShortcuts(evt) {
      if (evt.defaultPrevented) return;
      const activeTag = document.activeElement && document.activeElement.tagName;
      if (evt.key === '/' && !evt.metaKey && !evt.ctrlKey && !evt.altKey) {
        if (activeTag && ['INPUT', 'TEXTAREA'].includes(activeTag)) return;
        evt.preventDefault();
        if (els.search) els.search.focus();
      }
      if (evt.key === 'Escape' && document.activeElement === els.search) {
        evt.preventDefault();
        els.search.value = '';
        handleSearchInput();
      }
    }

    function applyFilter(keyword) {
      const keywordValue = keyword !== undefined ? keyword : ((els.search && els.search.value) || '');
      const q = String(keywordValue || '').trim().toLowerCase();
      if (!q) {
        state.filtered = [...state.records];
      } else {
        const tokens = q.split('%').map((token) => token.trim()).filter(Boolean);
        state.filtered = state.records.filter((row) =>
          tokens.every((token) =>
            COLUMN_KEYS.some((key) => String(row[key] == null ? '' : row[key]).toLowerCase().includes(token))
          )
        );
      }
      state.page = Math.min(state.page, Math.max(1, totalPages()));
      render();
    }

    function render() {
      renderTable();
      applyColumnVisibility();
      renderPagination();
      updateCounts();
      updateSelectAllState();
      updateBulkLabels();
    }

    function renderTable() {
      if (!els.tbody) return;
      els.tbody.innerHTML = '';

      const rows = currentPageRows();
      if (!rows.length) {
        switch (state.status) {
          case 'loading':
            showEmptyState(EMPTY_TEXT.loadingTitle, EMPTY_TEXT.loadingDesc);
            break;
          case 'error':
            showEmptyState(state.errorMessage || EMPTY_TEXT.errorTitle, EMPTY_TEXT.errorDesc);
            break;
          default:
            showEmptyState(EMPTY_TEXT.defaultTitle, `${TYPE_LABEL} 계약을 추가해 주세요.`);
            break;
        }
        return;
      }

      hideEmptyState();
      const fragment = document.createDocumentFragment();
      rows.forEach((row) => {
        const tr = document.createElement('tr');
        if (state.selected.has(row.id)) tr.classList.add('selected');
        tr.innerHTML = buildRowHtml(row);
        fragment.appendChild(tr);
      });
      els.tbody.appendChild(fragment);
    }

    function buildRowHtml(row) {
      const checkbox = `<td><input type="checkbox" class="system-row-select" data-id="${row.id}" ${state.selected.has(row.id) ? 'checked' : ''}></td>`;
      const cells = COLUMN_KEYS.map((key) => `<td data-col="${key}">${renderCell(key, row)}</td>`).join('');
      const actions = `<td data-col="actions" class="system-actions"><button type="button" class="action-btn" data-action="edit" data-id="${row.id}" title="수정" aria-label="수정"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon"></button></td>`;
      return checkbox + cells + actions;
    }

    function renderCell(key, row) {
      const value = row[key];
      if ((value === null || value === undefined || value === '') && key !== 'maint_amount') {
          if (key === 'inspection_target') return inspectionBadge('X');
          return '-';
      }
      switch (key) {
        case 'contract_status':
          return statusPill(row.contract_status);
        case 'manage_no':
          return manageLink(row.manage_no, row.id, row.page_token);
        case 'maint_amount':
          return formatCurrency(row.maint_amount);
        case 'inspection_target':
          return inspectionBadge(row.inspection_target);
        default:
          return escapeHtml(String(value));
      }
    }

    function statusPill(status) {
      const safe = escapeHtml(status || '-');
      let cls = 'ws-wait';
      if (status === '진행') cls = 'ws-run';
      else if (status === '해지') cls = 'ws-stop';
      return `<span class="status-pill"><span class="status-dot ${cls}"></span><span class="status-text">${safe}</span></span>`;
    }

    function manageLink(manageNo, rowId, pageToken) {
      if (!manageNo) return '-';
      const safe = escapeHtml(manageNo);
      if (!DETAIL_URL) return safe;

      // Robust navigation: include legacy id param so the server can set session
      // context even if the pre-navigation API call fails.
      const hrefBase = String(DETAIL_URL || '').replace(/\/$/, '');
      let href = hrefBase;
      try {
        const u = new URL(hrefBase, window.location.origin);
        u.searchParams.set('id', String(manageNo));
        href = u.pathname + u.search + u.hash;
      } catch (_e) {
        // fallback: add query param manually
        const sep = hrefBase.includes('?') ? '&' : '?';
        href = hrefBase + sep + 'id=' + encodeURIComponent(String(manageNo));
      }
      const token = (pageToken || '').toString().trim();
      const safeToken = escapeHtml(token);
      return `<a href="${href}" class="work-name-link manage-no-link" data-id="${rowId}" data-manage-no="${safe}" data-page-token="${safeToken}" aria-label="관리번호 ${safe} 상세보기">${safe}</a>`;
    }

    function keyFromDetailUrl(href) {
      try {
        const url = new URL(String(href || ''), window.location.origin);
        const m = String(url.pathname || '').match(/^\/p\/([^\/]+)/);
        return (m && m[1]) ? String(m[1]) : '';
      } catch (_e) {
        return '';
      }
    }

    async function setCostDetailContext(key, token, manageNo) {
      const r = await fetch('/api/cost/detail-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ key, token, manage_no: manageNo }),
        credentials: 'same-origin',
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.success) {
        throw new Error((j && j.message) ? j.message : ('HTTP ' + r.status));
      }
      return true;
    }

    function buildDetailHref(pageToken, manageNo) {
      const base = DETAIL_URL || '';
      return base.replace(/\/$/, '');
    }

    function inspectionBadge(flag) {
      const normalized = flag === 'O' ? 'O' : 'X';
      const cls = normalized === 'O' ? 'on' : 'off';
      return `<span class="cell-ox with-badge"><span class="ox-badge ${cls}">${normalized}</span></span>`;
    }

    function formatCurrency(value) {
      if (value === '' || value === null || value === undefined) return '-';
      const num = Number(value);
      if (Number.isNaN(num)) return escapeHtml(String(value));
      return `${num.toLocaleString('ko-KR')}원`;
    }

    function renderPagination() {
      if (!els.paginationInfo || !els.pageNumbers) return;
      const total = state.filtered.length;
      const start = total ? (state.page - 1) * state.pageSize + 1 : 0;
      const end = Math.min(total, state.page * state.pageSize);
      els.paginationInfo.textContent = `${start}-${end} / ${total}개 항목`;
      const pages = totalPages();
      els.pageNumbers.innerHTML = '';
      // Match CAPEX pagination styling/behavior (contract.css expects .page-btn)
      for (let i = 1; i <= pages && i <= 50; i += 1) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'page-btn' + (i === state.page ? ' active' : '');
        btn.dataset.page = String(i);
        btn.textContent = String(i);
        els.pageNumbers.appendChild(btn);
      }
      if (els.pagination.first) els.pagination.first.disabled = state.page <= 1;
      if (els.pagination.prev) els.pagination.prev.disabled = state.page <= 1;
      if (els.pagination.next) els.pagination.next.disabled = state.page >= pages;
      if (els.pagination.last) els.pagination.last.disabled = state.page >= pages;
    }

    function handlePaginationClick(which) {
      const pages = totalPages();
      if (pages <= 1) return;
      switch (which) {
        case 'first':
          state.page = 1;
          break;
        case 'prev':
          state.page = Math.max(1, state.page - 1);
          break;
        case 'next':
          state.page = Math.min(pages, state.page + 1);
          break;
        case 'last':
          state.page = pages;
          break;
        default:
          break;
      }
      render();
    }

    function updateCounts() {
      if (!els.count) return;
      els.count.textContent = String(state.filtered.length);
    }

    function currentPageRows() {
      const start = (state.page - 1) * state.pageSize;
      return state.filtered.slice(start, start + state.pageSize);
    }

    function totalPages() {
      return Math.max(1, Math.ceil(state.filtered.length / Math.max(1, state.pageSize)));
    }

    function showEmptyState(title, desc) {
      if (!els.empty) return;
      if (els.emptyTitle) els.emptyTitle.textContent = title;
      if (els.emptyDesc) els.emptyDesc.textContent = desc;
      els.empty.hidden = false;
    }

    function hideEmptyState() {
      if (els.empty) els.empty.hidden = true;
      if (els.emptyTitle) els.emptyTitle.textContent = EMPTY_TEXT.defaultTitle;
      if (els.emptyDesc) els.emptyDesc.textContent = EMPTY_TEXT.defaultDesc;
    }

    function populateVendorSelects() {
      const selects = document.querySelectorAll('select[name="vendor_id"][data-vendor-select]');
      const options = ['<option value="">선택</option>'].concat(
        state.vendors.map((vendor) => `<option value="${vendor.id}">${escapeHtml(vendor.maintenance_name)}</option>`)
      );
      selects.forEach((select) => {
        const current = select.value;
        select.innerHTML = options.join('');
        if (current) select.value = current;
        syncSearchableSelect(select);
      });
    }

    async function loadManagerUsers() {
      try {
        var res = await fetch('/api/user-profiles?limit=2000', { credentials: 'same-origin' });
        if (!res.ok) return;
        var payload = await res.json();
        var items = Array.isArray(payload.items) ? payload.items : [];
        state.managerUsers = items.map(function(u) {
          return { name: u.name || '', department: u.department || '' };
        }).filter(function(u) { return u.name; });
        populateManagerSelects();
      } catch (e) {
        console.error('유지보수 담당자 목록을 불러오지 못했습니다.', e);
      }
    }

    function populateManagerSelects() {
      var selects = document.querySelectorAll('select[name="maint_manager"][data-manager-select]');
      var options = ['<option value="">선택</option>'];
      state.managerUsers.forEach(function(u) {
        var display = u.department ? u.name + ' (' + u.department + ')' : u.name;
        options.push('<option value="' + escapeHtml(u.name) + '">' + escapeHtml(display) + '</option>');
      });
      var html = options.join('');
      selects.forEach(function(select) {
        var current = select.value;
        select.innerHTML = html;
        if (current) select.value = current;
        syncSearchableSelect(select);
      });
    }

    function openEditModal(id) {
      const record = state.records.find((item) => item.id === id);
      if (!record) {
        showMessage('대상 계약을 찾지 못했습니다.');
        return;
      }
      state.editingId = id;
      fillForm(els.editForm, record);
      syncDateRangeConstraints(els.editForm);
      ensureVendorOption(record.vendor_id, record.maint_vendor);
      ensureManagerOption(record.maint_manager);
      openModal(els.editModal);
    }

    function ensureVendorOption(vendorId, vendorName) {
      if (!vendorId || !vendorName || state.vendorMap.has(vendorId)) return;
      const placeholder = { id: vendorId, maintenance_name: vendorName };
      state.vendors.push(placeholder);
      state.vendorMap.set(vendorId, placeholder);
      populateVendorSelects();
      syncSearchableSelects();
    }

    function ensureManagerOption(managerName) {
      if (!managerName) return;
      var found = state.managerUsers.some(function(u) { return u.name === managerName; });
      if (!found) {
        state.managerUsers.push({ name: managerName, department: '' });
        populateManagerSelects();
      }
    }

    function fillForm(form, record) {
      if (!form || !record) return;
      const mapping = {
        contract_status: record.contract_status,
        contract_name: record.contract_name,
        manage_no: record.manage_no,
        vendor_id: record.vendor_id ? String(record.vendor_id) : '',
        maint_qty_total: record.maint_qty_total !== '' ? record.maint_qty_total : '',
        maint_qty_active: record.maint_qty_active !== '' ? record.maint_qty_active : '',
        maint_start: record.maint_start,
        maint_end: record.maint_end,
        // Display-only: keep comma separators in the input, but submit numeric-only via parseCurrencyInput().
        maint_amount: record.maint_amount !== '' ? formatCommaNumber(record.maint_amount) : '',
        inspection_target: record.inspection_target,
        maint_manager: record.maint_manager || '',
        memo: record.memo,
      };
      Object.entries(mapping).forEach(([name, value]) => {
        const input = form.querySelector(`[name="${name}"]`);
        if (!input) return;
        const v = value == null ? '' : value;
        input.value = v;
        // Flatpickr date inputs need setDate() to reflect the value in the calendar widget
        if (input._flatpickr) {
          input._flatpickr.setDate(v || null, false);
        }
      });
      syncSearchableSelects(form);
    }

    function wireCurrencyInputs() {
      [els.addForm, els.editForm].forEach((form) => {
        if (!form) return;
        const inputs = form.querySelectorAll('input[name="maint_amount"]');
        inputs.forEach((input) => attachCommaMask(input));
      });
    }

    function attachCommaMask(input) {
      if (!(input instanceof HTMLInputElement)) return;
      if (wiredCommaInputs.has(input)) return;
      wiredCommaInputs.add(input);

      // Initial format (e.g., when browser restores form state)
      input.value = formatCommaNumber(input.value);

      input.addEventListener('input', () => {
        applyCommaFormattingPreserveCaret(input);
      });
      // Ensure formatting stays after typing and after leaving the field.
      input.addEventListener('blur', () => {
        input.value = formatCommaNumber(input.value);
      });
    }

    function formatCommaNumber(value) {
      if (value === null || value === undefined) return '';
      const digits = String(value).replace(/\D/g, '');
      if (!digits) return '';
      const num = Number(digits);
      if (!Number.isFinite(num)) return '';
      return num.toLocaleString('ko-KR');
    }

    function applyCommaFormattingPreserveCaret(input) {
      const raw = input.value || '';
      const selectionStart = input.selectionStart == null ? raw.length : input.selectionStart;

      const digitsBefore = raw.slice(0, selectionStart).replace(/\D/g, '').length;
      const digits = raw.replace(/\D/g, '');
      const formatted = digits ? Number(digits).toLocaleString('ko-KR') : '';

      input.value = formatted;

      if (!formatted) return;
      if (digitsBefore <= 0) {
        input.setSelectionRange(0, 0);
        return;
      }
      if (digitsBefore >= digits.length) {
        input.setSelectionRange(formatted.length, formatted.length);
        return;
      }

      let pos = 0;
      let seenDigits = 0;
      while (pos < formatted.length) {
        if (/\d/.test(formatted[pos])) {
          seenDigits += 1;
          if (seenDigits >= digitsBefore) {
            pos += 1;
            break;
          }
        }
        pos += 1;
      }
      input.setSelectionRange(pos, pos);
    }

    async function handleAddSubmit() {
      if (!els.addForm) return;
      const payload = buildPayloadFromForm(els.addForm);
      if (!payload) return;
      payload.opex_type = OPEX_TYPE;
      await submitContract('POST', API_BASE, payload, els.addSave, () => closeModal(els.addModal));
    }

    async function handleEditSubmit() {
      if (!els.editForm || !state.editingId) return;
      const payload = buildPayloadFromForm(els.editForm, true);
      if (!payload) return;
      payload.opex_type = OPEX_TYPE;
      await submitContract('PUT', `${API_BASE}/${state.editingId}`, payload, els.editSave, () => closeModal(els.editModal));
    }

    function buildPayloadFromForm(form) {
      const data = new FormData(form);
      const vendorId = Number(data.get('vendor_id'));
      const amount = parseCurrencyInput(data.get('maint_amount'));
      const payload = {
        contract_status: (data.get('contract_status') || '').toString().trim(),
        contract_name: (data.get('contract_name') || '').toString().trim(),
        contract_code: (data.get('manage_no') || '').toString().trim(),
        vendor_id: vendorId,
        maintenance_start_date: (data.get('maint_start') || '').toString().trim(),
        maintenance_end_date: (data.get('maint_end') || '').toString().trim(),
        maintenance_amount: amount,
        inspection_target: normalizeInspection(data.get('inspection_target')),
        maint_manager: (data.get('maint_manager') || '').toString().trim(),
        memo: (data.get('memo') || '').toString().trim(),
      };

      if (!payload.contract_status || !payload.contract_name || !payload.contract_code || !vendorId || !payload.maintenance_start_date || !payload.maintenance_end_date || amount === null) {
        showMessage('필수 항목을 모두 입력해 주세요. (금액/사업자/기간 포함)');
        return null;
      }

      if (!isValidDateRange(payload.maintenance_start_date, payload.maintenance_end_date)) {
        showMessage('유지보수 시작일은 유지보수 종료일보다 뒤 날짜가 될 수 없습니다.');
        const endInput = form.querySelector('[name="maint_end"]');
        if (endInput && typeof endInput.focus === 'function') endInput.focus();
        return null;
      }

      // maint_qty_total / maint_qty_active are computed from tab61 (계약정보)
      // and should not be sent in the create/update payload.

      return payload;
    }

    function isValidDateRange(start, end) {
      const s = String(start || '').trim();
      const e = String(end || '').trim();
      if (!s || !e) return true;

      // ISO date (YYYY-MM-DD) can be safely compared lexicographically.
      if (isIsoDateString(s) && isIsoDateString(e)) {
        return s <= e;
      }

      const sd = new Date(s);
      const ed = new Date(e);
      if (Number.isNaN(sd.getTime()) || Number.isNaN(ed.getTime())) return true;
      return sd.getTime() <= ed.getTime();
    }

    function isIsoDateString(value) {
      return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
    }

    function normalizeInspection(value) {
      return String(value || '').trim().toUpperCase() === 'O' ? 'O' : 'X';
    }

    function parseCurrencyInput(value) {
      if (value === null || value === undefined) return null;
      const cleaned = String(value).replace(/[^0-9.-]/g, '');
      if (!cleaned.trim()) return null;
      const num = Number(cleaned);
      return Number.isNaN(num) ? null : num;
    }

    function parseIntSafe(value) {
      if (value === null || value === undefined || value === '') return null;
      const num = parseInt(String(value).replace(/[^0-9-]/g, ''), 10);
      if (Number.isNaN(num)) return null;
      return Math.max(0, num);
    }

    function wireDateRangeConstraints(scope = document) {
      const context = scope || document;
      const forms = context instanceof HTMLFormElement ? [context] : Array.from(context.querySelectorAll('form'));

      forms.forEach((form) => {
        if (!(form instanceof HTMLFormElement)) return;
        const startInput = form.querySelector('[name="maint_start"]');
        const endInput = form.querySelector('[name="maint_end"]');
        if (!(startInput instanceof HTMLInputElement) || !(endInput instanceof HTMLInputElement)) return;

        if (!wiredDateRangeForms.has(form)) {
          wiredDateRangeForms.add(form);
          const handler = () => syncDateRangeConstraints(form);
          startInput.addEventListener('input', handler);
          startInput.addEventListener('change', handler);
          endInput.addEventListener('input', handler);
          endInput.addEventListener('change', handler);
        }

        syncDateRangeConstraints(form);
      });
    }

    function syncDateRangeConstraints(form) {
      if (!(form instanceof HTMLFormElement)) return;
      const startInput = form.querySelector('[name="maint_start"]');
      const endInput = form.querySelector('[name="maint_end"]');
      if (!(startInput instanceof HTMLInputElement) || !(endInput instanceof HTMLInputElement)) return;

      const start = (startInput.value || '').toString().trim();
      const end = (endInput.value || '').toString().trim();

      if (endInput._flatpickr) {
        endInput._flatpickr.set('minDate', start || null);
      }
      if (startInput._flatpickr) {
        startInput._flatpickr.set('maxDate', end || null);
      }
    }

    async function submitContract(method, url, payload, button, onSuccess) {
      toggleBusy(button, true);
      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.success === false) throw new Error(body.message || '요청을 처리하지 못했습니다.');
        showMessage('정상적으로 저장되었습니다.', '완료');
        await loadContracts();
        if (typeof onSuccess === 'function') onSuccess();
      } catch (error) {
        console.error(error);
        showMessage(error.message || '요청을 처리하지 못했습니다.');
      } finally {
        toggleBusy(button, false);
      }
    }

    async function handleDeleteSubmit() {
      if (!state.selected.size) {
        showMessage('삭제할 계약을 선택하세요.');
        return;
      }
      toggleBusy(els.deleteConfirm, true);
      try {
        const res = await fetch(`${API_BASE}/bulk-delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ ids: Array.from(state.selected) }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.success === false) throw new Error(body.message || '삭제 중 오류가 발생했습니다.');
        showMessage('선택한 계약을 삭제했습니다.', '완료');
        closeModal(els.deleteModal);
        state.selected.clear();
        await loadContracts();
      } catch (error) {
        console.error(error);
        showMessage(error.message || '삭제 중 오류가 발생했습니다.');
      } finally {
        toggleBusy(els.deleteConfirm, false);
      }
    }

    function handleDownload() {
      const selectedOnly = Array.from(els.csvRange || []).some((input) => input.checked && input.value === 'selected');
      const rows = selectedOnly ? state.records.filter((row) => state.selected.has(row.id)) : state.filtered;
      if (!rows.length) {
        showMessage('내보낼 데이터가 없습니다.');
        return;
      }
      const headers = ['계약상태', '계약명', '관리번호', '유지보수사업자', '유지보수전체수량', '유지보수활성수량', '유지보수시작일', '유지보수종료일', '유지보수금액', '유지보수점검대상', '유지보수담당자', '비고'];
      const lines = [headers.join(',')];
      rows.forEach((row) => {
        const line = [
          row.contract_status,
          row.contract_name,
          row.manage_no,
          row.maint_vendor,
          row.maint_qty_total,
          row.maint_qty_active,
          row.maint_start,
          row.maint_end,
          row.maint_amount,
          row.inspection_target,
          row.memo,
        ].map(csvEscape);
        lines.push(line.join(','));
      });
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `opex_${TYPE_LABEL}_${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      closeModal(els.downloadModal);
    }

    function csvEscape(value) {
      if (value === null || value === undefined) return '';
      const text = String(value).replace(/"/g, '""');
      return text.includes(',') || text.includes('\n') ? `"${text}"` : text;
    }

    function updateSelectAllState() {
      if (!els.selectAll) return;
      const rows = currentPageRows();
      if (!rows.length) {
        els.selectAll.checked = false;
        els.selectAll.indeterminate = false;
        return;
      }
      const checkedCount = rows.filter((row) => state.selected.has(row.id)).length;
      els.selectAll.checked = checkedCount === rows.length;
      els.selectAll.indeterminate = checkedCount > 0 && checkedCount < rows.length;
    }

    function handleFormReset(event) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      setTimeout(() => {
        syncSearchableSelects(form);
      }, 0);
    }

    function enhanceSearchableSelects(scope = document) {
      if (!scope) return;
      scope.querySelectorAll('select.search-select').forEach((select) => {
        setupSearchableSelect(select);
        syncSearchableSelect(select);
      });
    }

    function syncSearchableSelects(scope = document) {
      if (!scope) return;
      scope.querySelectorAll('select.search-select').forEach((select) => syncSearchableSelect(select));
    }

    function isSearchableSelect(select) {
      if (!select || select.tagName !== 'SELECT') return false;
      if (select.multiple) return false;
      if (select.dataset.searchable === 'false') return false;
      return select.classList.contains('search-select');
    }

    function getSearchablePlaceholder(select) {
      if (!select) return '선택';
      const dataset = select.dataset;
      if (dataset && dataset.placeholder) return dataset.placeholder;
      const attr = select.getAttribute ? select.getAttribute('data-placeholder') : '';
      return attr || '선택';
    }

    function setupSearchableSelect(select) {
      if (!isSearchableSelect(select) || select.dataset.searchEnhanced === '1') return;
      const wrapper = document.createElement('div');
      wrapper.className = 'fk-searchable-control';

      const displayBtn = document.createElement('button');
      displayBtn.type = 'button';
      displayBtn.className = 'fk-searchable-display';
      displayBtn.setAttribute('aria-haspopup', 'dialog');
      displayBtn.setAttribute('aria-expanded', 'false');
      displayBtn.dataset.placeholder = getSearchablePlaceholder(select);

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'fk-searchable-clear';
      clearBtn.textContent = '지움';
      clearBtn.setAttribute('aria-label', '선택 해제');
      clearBtn.hidden = true;
      clearBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeSearchDropdown(select);
        select.value = '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        syncSearchableSelect(select);
      });

      displayBtn.addEventListener('click', (event) => {
        event.preventDefault();
        if (select.disabled) return;
        openSearchDropdown(select);
      });

      const parent = select.parentNode;
      if (parent) parent.insertBefore(wrapper, select);
      wrapper.appendChild(displayBtn);
      wrapper.appendChild(clearBtn);
      wrapper.appendChild(select);
      select.classList.add('fk-search-native-hidden');
      select.dataset.searchEnhanced = '1';
      select.addEventListener('change', () => syncSearchableSelect(select));
      searchableSelectMeta.set(select, { wrapper, displayBtn, clearBtn });
    }

    function syncSearchableSelect(select) {
      if (!isSearchableSelect(select)) return;
      let meta = searchableSelectMeta.get(select);
      if (!meta) {
        setupSearchableSelect(select);
        meta = searchableSelectMeta.get(select);
        if (!meta) return;
      }
      const placeholder = getSearchablePlaceholder(select);
      const selectedOption = select.selectedOptions && select.selectedOptions[0];
      const optionLabel = ((selectedOption && selectedOption.textContent) || '').trim();
      const value = select.value || '';
      const label = optionLabel || value || placeholder;
      meta.displayBtn.textContent = label;
      meta.displayBtn.title = label;
      meta.displayBtn.dataset.placeholder = placeholder;
      const hasValue = !!value;
      meta.displayBtn.classList.toggle('has-value', hasValue);
      meta.clearBtn.hidden = !hasValue;
      const disabled = !!select.disabled;
      meta.wrapper.classList.toggle('is-disabled', disabled);
      meta.displayBtn.disabled = disabled;
      meta.clearBtn.disabled = disabled;
      if (disabled) {
        closeSearchDropdown(select);
      }
    }

    function buildSearchPanelOptions(select, placeholder) {
      const options = [];
      Array.from((select && select.options) || []).forEach((opt) => {
        const label = (opt.textContent || '').trim() || opt.value || placeholder;
        options.push({
          value: opt.value || '',
          label,
          searchLabel: label.toLowerCase(),
          valueLower: (opt.value || '').toLowerCase(),
        });
      });
      return options;
    }

    function openSearchDropdown(select) {
      if (!isSearchableSelect(select) || select.disabled) return;
      const meta = searchableSelectMeta.get(select);
      if (!meta) return;
      closeSearchDropdown();
      const placeholder = getSearchablePlaceholder(select);
      const panel = document.createElement('div');
      panel.className = 'fk-search-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', `${placeholder} 검색`);

      const header = document.createElement('div');
      header.className = 'fk-search-panel__header';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'fk-search-panel__input';
      input.placeholder = '검색어 입력';
      input.setAttribute('aria-label', '검색어 입력');
      input.autocomplete = 'off';
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'fk-search-panel__close';
      closeBtn.textContent = '닫기';
      closeBtn.setAttribute('aria-label', '닫기');
      header.appendChild(input);
      header.appendChild(closeBtn);
      panel.appendChild(header);

      const list = document.createElement('div');
      list.className = 'fk-search-panel__list';
      list.setAttribute('role', 'listbox');
      panel.appendChild(list);

      const empty = document.createElement('div');
      empty.className = 'fk-search-panel__empty';
      empty.textContent = '검색 결과가 없습니다.';
      empty.hidden = true;
      panel.appendChild(empty);

      document.body.appendChild(panel);
      const options = buildSearchPanelOptions(select, placeholder);
      const dropdownState = {
        select,
        panel,
        trigger: meta.displayBtn,
        anchor: meta.wrapper,
        input,
        closeBtn,
        list,
        empty,
        placeholder,
        options,
        filtered: options.slice(),
        focusIndex: -1,
      };
      activeSearchPanel = dropdownState;
      meta.displayBtn.setAttribute('aria-expanded', 'true');
      renderSearchPanelOptions(dropdownState);
      positionSearchPanel(dropdownState);
      setTimeout(() => input.focus(), 0);

      closeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        closeSearchDropdown();
      });
      input.addEventListener('keydown', (event) => handleSearchInputKeydown(event, dropdownState));
      input.addEventListener('input', () => filterSearchPanelOptions(dropdownState));
      list.addEventListener('keydown', (event) => handleSearchListKeydown(event, dropdownState));

      dropdownState.handleOutside = (event) => {
        if (panel.contains(event.target) || meta.wrapper.contains(event.target)) return;
        closeSearchDropdown();
      };
      document.addEventListener('pointerdown', dropdownState.handleOutside, true);

      dropdownState.handleKeydown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeSearchDropdown();
        }
      };
      document.addEventListener('keydown', dropdownState.handleKeydown, true);

      dropdownState.handleResize = () => closeSearchDropdown();
      window.addEventListener('resize', dropdownState.handleResize);
      dropdownState.handleScroll = () => closeSearchDropdown();
      window.addEventListener('scroll', dropdownState.handleScroll, true);
      dropdownState.handleFocus = (event) => {
        if (panel.contains(event.target) || meta.wrapper.contains(event.target)) return;
        closeSearchDropdown();
      };
      document.addEventListener('focusin', dropdownState.handleFocus, true);
    }

    function renderSearchPanelOptions(panelState) {
      panelState.list.innerHTML = '';
      const currentValue = panelState.select.value || '';
      if (!panelState.filtered.length) {
        panelState.empty.hidden = false;
        panelState.focusIndex = -1;
        return;
      }
      panelState.empty.hidden = true;
      panelState.filtered.forEach((opt, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fk-search-panel__item';
        btn.textContent = opt.label;
        btn.dataset.value = opt.value;
        btn.setAttribute('role', 'option');
        btn.tabIndex = -1;
        if (opt.value === currentValue) {
          btn.classList.add('selected');
          btn.setAttribute('aria-selected', 'true');
          panelState.focusIndex = index;
        } else {
          btn.setAttribute('aria-selected', 'false');
        }
        btn.addEventListener('click', (event) => {
          event.preventDefault();
          commitSearchPanelSelection(panelState, opt.value);
        });
        panelState.list.appendChild(btn);
      });
    }

    function focusSearchPanelItem(panelState, index, options = {}) {
      const items = panelState.list.querySelectorAll('.fk-search-panel__item');
      if (!items.length) return;
      const targetIndex = Math.max(0, Math.min(index, items.length - 1));
      panelState.focusIndex = targetIndex;
      items.forEach((btn, idx) => {
        btn.classList.toggle('active', idx === targetIndex);
      });
      const target = items[targetIndex];
      if (options.focus !== false) {
        target.focus({ preventScroll: true });
      }
      if (options.ensureVisible) {
        const list = panelState.list;
        const itemTop = target.offsetTop;
        const itemBottom = itemTop + target.offsetHeight;
        if (itemBottom > list.scrollTop + list.clientHeight) {
          list.scrollTop = itemBottom - list.clientHeight;
        } else if (itemTop < list.scrollTop) {
          list.scrollTop = itemTop;
        }
      }
    }

    function handleSearchInputKeydown(event, panelState) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!panelState.filtered.length) return;
        if (panelState.focusIndex === -1) {
          focusSearchPanelItem(panelState, 0, { ensureVisible: true });
        } else {
          focusSearchPanelItem(panelState, panelState.focusIndex, { ensureVisible: true });
        }
      } else if (event.key === 'Enter') {
        if (panelState.focusIndex >= 0 && panelState.filtered[panelState.focusIndex]) {
          event.preventDefault();
          commitSearchPanelSelection(panelState, panelState.filtered[panelState.focusIndex].value);
        }
      }
    }

    function handleSearchListKeydown(event, panelState) {
      const target = event.target;
      const isItem = !!(target && target.classList && target.classList.contains('fk-search-panel__item'));
      if (!isItem) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusSearchPanelItem(panelState, panelState.focusIndex >= 0 ? panelState.focusIndex + 1 : 0, { ensureVisible: true });
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (panelState.focusIndex <= 0) {
          panelState.focusIndex = -1;
          panelState.input.focus();
          return;
        }
        focusSearchPanelItem(panelState, panelState.focusIndex - 1, { ensureVisible: true });
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusSearchPanelItem(panelState, 0, { ensureVisible: true });
      } else if (event.key === 'End') {
        event.preventDefault();
        focusSearchPanelItem(panelState, panelState.filtered.length - 1, { ensureVisible: true });
      } else if (event.key === 'Enter' || event.key === ' ') {
        if (panelState.focusIndex >= 0 && panelState.filtered[panelState.focusIndex]) {
          event.preventDefault();
          commitSearchPanelSelection(panelState, panelState.filtered[panelState.focusIndex].value);
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeSearchDropdown();
      }
    }

    function commitSearchPanelSelection(panelState, value) {
      panelState.select.value = value;
      panelState.select.dispatchEvent(new Event('change', { bubbles: true }));
      syncSearchableSelect(panelState.select);
      closeSearchDropdown();
    }

    function filterSearchPanelOptions(panelState) {
      const term = panelState.input.value.trim().toLowerCase();
      if (!term) {
        panelState.filtered = panelState.options.slice();
      } else {
        panelState.filtered = panelState.options.filter((opt) => opt.searchLabel.includes(term) || opt.valueLower.includes(term));
      }
      panelState.focusIndex = panelState.filtered.findIndex((opt) => opt.value === panelState.select.value);
      renderSearchPanelOptions(panelState);
    }

    function closeSearchDropdown(targetSelect) {
      if (!activeSearchPanel) return;
      if (targetSelect && activeSearchPanel.select !== targetSelect) return;
      const panelState = activeSearchPanel;
      if (panelState.trigger) panelState.trigger.setAttribute('aria-expanded', 'false');
      if (panelState.panel && panelState.panel.parentNode) {
        panelState.panel.parentNode.removeChild(panelState.panel);
      }
      if (panelState.handleOutside) document.removeEventListener('pointerdown', panelState.handleOutside, true);
      if (panelState.handleKeydown) document.removeEventListener('keydown', panelState.handleKeydown, true);
      if (panelState.handleFocus) document.removeEventListener('focusin', panelState.handleFocus, true);
      if (panelState.handleResize) window.removeEventListener('resize', panelState.handleResize);
      if (panelState.handleScroll) window.removeEventListener('scroll', panelState.handleScroll, true);
      activeSearchPanel = null;
    }

    function positionSearchPanel(panelState) {
      const { panel, anchor } = panelState;
      if (!panel || !anchor) return;
      const rect = anchor.getBoundingClientRect();
      const margin = 8;
      const width = Math.max(rect.width, 280);
      panel.style.width = `${width}px`;
      let left = rect.left;
      if (left + width > window.innerWidth - margin) {
        left = window.innerWidth - width - margin;
      }
      left = Math.max(margin, left);
      let top = rect.bottom + margin;
      const availableBelow = window.innerHeight - rect.bottom - margin;
      const availableAbove = rect.top - margin;
      const panelHeight = panel.offsetHeight;
      if (panelHeight > availableBelow && availableAbove > availableBelow) {
        top = rect.top - panelHeight - margin;
      }
      top = Math.max(margin, top);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    }

    function updateBulkLabels() {
      const count = state.selected.size;
      const text = `선택된 ${count}개의 계약`;
      if (els.deleteSubtitle) els.deleteSubtitle.textContent = `${text}을 정말 삭제처리하시겠습니까?`;
      if (els.duplicateSubtitle) els.duplicateSubtitle.textContent = `${text} 행을 복제합니다.`;
      if (els.bulkSubtitle) els.bulkSubtitle.textContent = `${text}에서 지정한 필드를 일괄 변경합니다.`;
    }

    function openModal(modal) {
      if (!modal) return;
      closeSearchDropdown();
      initDatePickers(modal)
        .then(() => {
          wireDateRangeConstraints(modal);
        })
        .catch(() => {
          wireDateRangeConstraints(modal);
        });
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    }

    function closeModal(modal) {
      closeSearchDropdown();
      if (!modal) return;
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      if (!document.querySelector('.modal-overlay-full.show')) {
        document.body.classList.remove('modal-open');
      }
    }

    function showMessage(message, title = '알림') {
      if (!els.messageModal) {
        alert(message);
        return;
      }
      if (els.messageTitle) els.messageTitle.textContent = title;
      if (els.messageContent) els.messageContent.textContent = message;
      openModal(els.messageModal);
    }

    function toggleBusy(button, busy) {
      if (!button) return;
      button.disabled = !!busy;
      button.classList.toggle('is-loading', !!busy);
    }

    function attachComingSoon(button, message) {
      if (!button) return;
      button.addEventListener('click', () => showMessage(message));
    }

    function ensureCss(href, id) {
      const existing = document.getElementById(id);
      if (existing && existing.tagName.toLowerCase() === 'link') {
        if (existing.getAttribute('href') !== href) existing.setAttribute('href', href);
        return;
      }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.id = id;
      document.head.appendChild(link);
    }

    function loadScript(src) {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Script load failed: ${src}`));
        document.head.appendChild(script);
      });
    }

    async function ensureFlatpickrAssets() {
      ensureCss(FLATPICKR_CSS, 'flatpickr-css');
      ensureCss(FLATPICKR_THEME_HREF, 'flatpickr-theme-css');
      if (window.flatpickr) return;
      await loadScript(FLATPICKR_JS);
      try {
        await loadScript(FLATPICKR_LOCALE);
      } catch (_err) {
        /* locale optional */
      }
    }

    function getFlatpickrLocale() {
      const fp = window.flatpickr;
      if (fp && fp.l10ns && fp.l10ns.ko) return fp.l10ns.ko;
      return 'ko';
    }

    function prepareDateInput(input) {
      if (!input || input.dataset.datePickerReady === '1') return;
      if (input.type === 'date') {
        try {
          input.type = 'text';
        } catch (_e) {
          /* ignore */
        }
      }
      input.dataset.datePickerReady = '1';
      input.autocomplete = 'off';
      input.inputMode = 'none';
    }

    function ensureTodayButton(instance) {
      const cal = instance && instance.calendarContainer;
      if (!cal || cal.querySelector('.fp-today-btn')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fp-today-btn';
      btn.textContent = '오늘';
      btn.addEventListener('click', () => {
        instance.setDate(new Date(), true);
      });
      cal.appendChild(btn);
    }

    function stylizeCalendar(instance) {
      if (!instance) return;
      instance.set('position', 'auto');
      const cal = instance.calendarContainer;
      if (!cal) return;
      cal.classList.add('blossom-date-popup');
      cal.classList.add('arrowTop');
      cal.classList.remove('arrowBottom');
      ensureTodayButton(instance);
    }

    async function initDatePickers(scope) {
      const context = scope || document;
      const inputs = context.querySelectorAll(DATE_INPUT_SELECTOR);
      if (!inputs.length) return;
      inputs.forEach(prepareDateInput);
      try {
        await ensureFlatpickrAssets();
      } catch (_err) {
        return;
      }
      inputs.forEach((input) => {
        if (input._flatpickr) return;
        window.flatpickr(input, {
          locale: getFlatpickrLocale(),
          dateFormat: 'Y-m-d',
          allowInput: true,
          disableMobile: true,
          appendTo: document.body,
          positionElement: input,
          clickOpens: true,
          onReady(selectedDates, dateStr, instance) {
            stylizeCalendar(instance);
          },
          onOpen(selectedDates, dateStr, instance) {
            stylizeCalendar(instance);
          },
        });
      });
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  }
})();
