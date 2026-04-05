/**
 * tab98-sla-shared.js  —  SLA 공통 탭 (유지보수사 상세)
 * v1.0  2026-02-19
 *
 * Columns: 구분, SLA 항목, 가중치, 기대수준, 최소수준
 * - "SLA 항목" click → SLA 기준 모달
 * - 합계 row: 가중치 합 (목표 100)
 * - Inline edit / save / delete per row
 */
(function () {
    'use strict';

    /* ── vendor ID ─────────────────────────────────────────── */
    function _getVid() {
        try {
            const ctx = JSON.parse(sessionStorage.getItem('maintenance:context') || '{}');
            if (ctx.id) return ctx.id;
        } catch (_) { /* */ }
        const p = new URLSearchParams(location.search);
        return p.get('vendor_id') || p.get('id') || '';
    }

    /* ── state ─────────────────────────────────────────────── */
    let _allItems = [];
    let _page = 1;
    let _pageSize = 10;
    const PREFIX = 'sla';

    /* ── DOM refs ──────────────────────────────────────────── */
    const $  = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);

    const tbody        = () => $(`#${PREFIX}-table-body`);
    const pageSizeSel  = () => $(`#${PREFIX}-page-size`);
    const selectAll    = () => $(`#${PREFIX}-select-all`);
    const emptyEl      = () => $(`#${PREFIX}-empty`);
    const weightSumEl  = () => $(`#${PREFIX}-weight-sum`);

    /* ── fetch ─────────────────────────────────────────────── */
    async function load() {
        const vid = _getVid();
        if (!vid) return;
        try {
            const res = await fetch(`/api/vendor-maintenance/${vid}/sla`);
            const j = await res.json();
            _allItems = j.success ? (j.items || []) : [];
        } catch (_) { _allItems = []; }
        renderPage();
    }

    /* ── render ────────────────────────────────────────────── */
    function renderPage() {
        const tb = tbody();
        if (!tb) return;
        tb.innerHTML = '';

        const total = _allItems.length;
        const pages = Math.max(1, Math.ceil(total / _pageSize));
        if (_page > pages) _page = pages;

        const start = (_page - 1) * _pageSize;
        const slice = _allItems.slice(start, start + _pageSize);

        if (!total) {
            const emp = emptyEl();
            if (emp) { emp.hidden = false; emp.style.display = ''; }
        } else {
            const emp = emptyEl();
            if (emp) { emp.hidden = true; emp.style.display = 'none'; }
        }

        slice.forEach(item => {
            const tr = document.createElement('tr');
            tr.dataset.id = item.id;
            tr.innerHTML = `
                <td><input type="checkbox" class="sla-row-check"></td>
                <td data-col="category">${esc(item.category)}</td>
                <td data-col="sla_item"><button type="button" class="sla-item-link" data-sla-id="${item.id}">${esc(item.sla_item)}</button></td>
                <td data-col="weight">${item.weight ?? 0}</td>
                <td data-col="expected_level">${esc(item.expected_level)}</td>
                <td data-col="minimum_level">${esc(item.minimum_level)}</td>
                <td data-col="actions">
                    <button class="action-btn" data-action="edit" title="수정">
                        <img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon">
                    </button>
                    <button class="action-btn" data-action="delete" title="삭제">
                        <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">
                    </button>
                </td>`;
            tb.appendChild(tr);
        });

        updateWeightSum();
        updatePagination(total, pages);
    }

    function esc(s) { return (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    function updateWeightSum() {
        const sum = _allItems.reduce((a, b) => a + (parseInt(b.weight, 10) || 0), 0);
        const el = weightSumEl();
        if (el) {
            el.textContent = sum;
            el.style.color = sum === 100 ? '#16a34a' : sum > 100 ? '#ef4444' : '#374151';
        }
    }

    /* ── pagination ────────────────────────────────────────── */
    function updatePagination(total, pages) {
        const s = total ? (_page - 1) * _pageSize + 1 : 0;
        const e = Math.min(total, _page * _pageSize);
        const info = $(`#${PREFIX}-pagination-info`);
        if (info) info.textContent = `${s}-${e} / ${total}개 항목`;
        const nums = $(`#${PREFIX}-page-numbers`);
        if (nums) {
            nums.innerHTML = '';
            for (let i = 1; i <= pages; i++) {
                const btn = document.createElement('button');
                btn.className = 'page-btn' + (i === _page ? ' active' : '');
                btn.textContent = i;
                btn.dataset.page = i;
                btn.onclick = () => { _page = i; renderPage(); };
                nums.appendChild(btn);
            }
        }
        const first = $(`#${PREFIX}-first`), prev = $(`#${PREFIX}-prev`);
        const next = $(`#${PREFIX}-next`), last = $(`#${PREFIX}-last`);
        if (first) { first.disabled = _page <= 1; first.onclick = () => { _page = 1; renderPage(); }; }
        if (prev) { prev.disabled = _page <= 1; prev.onclick = () => { _page = Math.max(1, _page - 1); renderPage(); }; }
        if (next) { next.disabled = _page >= pages; next.onclick = () => { _page = Math.min(pages, _page + 1); renderPage(); }; }
        if (last) { last.disabled = _page >= pages; last.onclick = () => { _page = pages; renderPage(); }; }
    }

    /* ── inline add row ────────────────────────────────────── */
    function addNewRow() {
        const vid = _getVid();
        if (!vid) return;
        const tb = tbody();
        if (!tb) return;
        const emp = emptyEl();
        if (emp) emp.hidden = true;

        const tr = document.createElement('tr');
        tr.classList.add('is-new');
        tr.innerHTML = `
            <td><input type="checkbox" class="sla-row-check"></td>
            <td data-col="category"><input type="text" placeholder="구분" style="width:100%;"></td>
            <td data-col="sla_item"><input type="text" placeholder="SLA 항목" style="width:100%;"></td>
            <td data-col="weight"><input type="number" min="0" max="100" placeholder="0" style="width:100%;"></td>
            <td data-col="expected_level" class="text-muted">-</td>
            <td data-col="minimum_level" class="text-muted">-</td>
            <td data-col="actions">
                <button class="action-btn" data-action="save" title="저장">
                    <img src="/static/image/svg/save.svg" alt="저장" class="action-icon">
                </button>
                <button class="action-btn" data-action="cancel" title="취소">
                    <img src="/static/image/svg/list/free-icon-trash.svg" alt="취소" class="action-icon">
                </button>
            </td>`;
        tb.prepend(tr);
    }

    /* ── enter edit mode ───────────────────────────────────── */
    function enterEdit(tr) {
        const item = _allItems.find(i => String(i.id) === tr.dataset.id);
        if (!item) return;
        const cols = ['category', 'sla_item', 'weight'];
        cols.forEach(c => {
            const td = tr.querySelector(`[data-col="${c}"]`);
            if (!td) return;
            const val = item[c] ?? '';
            if (c === 'weight') {
                td.innerHTML = `<input type="number" min="0" max="100" value="${val}" style="width:100%;">`;
            } else {
                td.innerHTML = `<input type="text" value="${esc(String(val))}" style="width:100%;">`;
            }
        });
        const actTd = tr.querySelector('[data-col="actions"]');
        if (actTd) {
            actTd.innerHTML = `
                <button class="action-btn" data-action="save" title="저장">
                    <img src="/static/image/svg/save.svg" alt="저장" class="action-icon">
                </button>
                <button class="action-btn" data-action="cancel" title="취소">
                    <img src="/static/image/svg/list/free-icon-trash.svg" alt="취소" class="action-icon">
                </button>`;
        }
    }

    /* ── save row ──────────────────────────────────────────── */
    async function saveRow(tr) {
        const vid = _getVid();
        if (!vid) return;
        const inputs = tr.querySelectorAll('td[data-col] input');
        const data = {};
        const cols = ['category', 'sla_item', 'weight'];
        cols.forEach((c, i) => { if (inputs[i]) data[c] = inputs[i].value; });

        const isNew = tr.classList.contains('is-new');
        const url = isNew
            ? `/api/vendor-maintenance/${vid}/sla`
            : `/api/vendor-maintenance/${vid}/sla/${tr.dataset.id}`;
        const method = isNew ? 'POST' : 'PUT';

        try {
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const j = await res.json();
            if (j.success) { await load(); } else { alert(j.message || '저장 실패'); }
        } catch (e) { alert('저장 중 오류: ' + e.message); }
    }

    /* ── delete row ────────────────────────────────────────── */
    async function deleteRow(tr) {
        const vid = _getVid();
        if (!vid || !tr.dataset.id) return;
        if (!confirm('삭제하시겠습니까?')) return;
        try {
            const res = await fetch(`/api/vendor-maintenance/${vid}/sla/${tr.dataset.id}`, { method: 'DELETE' });
            const j = await res.json();
            if (j.success) { await load(); } else { alert(j.message || '삭제 실패'); }
        } catch (e) { alert('삭제 중 오류: ' + e.message); }
    }

    /* ── textarea auto-expand ──────────────────────────────── */
    function autoExpand(ta) {
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
    }
    function initAutoExpand() {
        const form = $('#sla-criteria-form');
        if (!form) return;
        form.querySelectorAll('textarea.form-input').forEach(ta => {
            ta.removeEventListener('input', ta._autoExpand);
            ta._autoExpand = () => autoExpand(ta);
            ta.addEventListener('input', ta._autoExpand);
            autoExpand(ta);
        });
    }

    /* ── SLA criteria modal ────────────────────────────────── */
    let _currentSlaId = null;

    function openCriteriaModal(slaId) {
        _currentSlaId = slaId;
        const item = _allItems.find(i => i.id === slaId);
        const titleEl = $('#sla-criteria-subtitle');
        if (titleEl && item) titleEl.textContent = item.sla_item || 'SLA 항목';

        // Load criteria data
        fetch(`/api/vendor-maintenance/sla/${slaId}/criteria`)
            .then(r => r.json())
            .then(j => {
                const d = (j.success && j.item) ? j.item : {};
                const form = $('#sla-criteria-form');
                if (!form) return;
                const fields = ['purpose', 'measurement_standard', 'target_expected', 'target_minimum',
                    'measurement_method', 'measurement_period', 'report_frequency',
                    'measurement_target', 'exception_criteria', 'etc'];
                fields.forEach(f => {
                    const el = form.querySelector(`[name="${f}"]`);
                    if (el) el.value = d[f] || '';
                });
                initAutoExpand();
            })
            .catch(() => { /* ignore */ });

        const modal = $('#sla-criteria-modal');
        if (modal) { modal.classList.add('show'); modal.setAttribute('aria-hidden', 'false'); }
        setTimeout(initAutoExpand, 50);
    }

    function closeCriteriaModal() {
        const modal = $('#sla-criteria-modal');
        if (modal) { modal.classList.remove('show'); modal.setAttribute('aria-hidden', 'true'); }
        _currentSlaId = null;
    }

    async function saveCriteria() {
        if (!_currentSlaId) return;
        const form = $('#sla-criteria-form');
        if (!form) return;
        const fields = ['purpose', 'measurement_standard', 'target_expected', 'target_minimum',
            'measurement_method', 'measurement_period', 'report_frequency',
            'measurement_target', 'exception_criteria', 'etc'];
        const data = {};
        fields.forEach(f => {
            const el = form.querySelector(`[name="${f}"]`);
            if (el) data[f] = el.value;
        });
        try {
            const res = await fetch(`/api/vendor-maintenance/sla/${_currentSlaId}/criteria`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const j = await res.json();
            if (j.success) {
                closeCriteriaModal();
                await load();
            } else {
                alert(j.message || '저장 실패');
            }
        } catch (e) { alert('저장 중 오류: ' + e.message); }
    }

    /* ── CSV export ────────────────────────────────────────── */
    function exportCSV(onlySelected) {
        const headers = ['구분', 'SLA 항목', '가중치', '기대수준', '최소수준'];
        let rows = _allItems;
        if (onlySelected) {
            const checked = new Set();
            $$(`#${PREFIX}-table-body tr`).forEach(tr => {
                const cb = tr.querySelector('.sla-row-check');
                if (cb && cb.checked && tr.dataset.id) checked.add(tr.dataset.id);
            });
            rows = rows.filter(r => checked.has(String(r.id)));
        }
        const lines = [headers.join(',')];
        rows.forEach(r => {
            lines.push([r.category, r.sla_item, r.weight, r.expected_level, r.minimum_level]
                .map(v => `"${String(v || '').replace(/"/g, '""')}"`)
                .join(','));
        });
        const bom = '\uFEFF';
        const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `SLA_${_getVid()}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    /* ── event delegation ──────────────────────────────────── */
    let _initialized = false;
    function init() {
        const vid = _getVid();
        if (!vid) return;

        // Reset state on re-init (SPA swap)
        _allItems = []; _page = 1;

        if (!_initialized) {
        _initialized = true;

        // Table body delegation (registered once)
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (btn) {
                const tr = btn.closest('tr');
                if (!tr) return;
                const action = btn.dataset.action;
                if (action === 'edit') enterEdit(tr);
                else if (action === 'save') saveRow(tr);
                else if (action === 'delete') deleteRow(tr);
                else if (action === 'cancel') renderPage();
                return;
            }
            const link = e.target.closest('.sla-item-link');
            if (link) {
                e.preventDefault();
                const slaId = parseInt(link.dataset.slaId, 10);
                if (slaId) openCriteriaModal(slaId);
                return;
            }
        });

        // Add row
        const addBtn = $(`#${PREFIX}-row-add`);
        if (addBtn) addBtn.addEventListener('click', addNewRow);

        // Page size
        const ps = pageSizeSel();
        if (ps) ps.addEventListener('change', () => { _pageSize = parseInt(ps.value, 10); _page = 1; renderPage(); });

        // Select all
        const sa = selectAll();
        if (sa) sa.addEventListener('change', () => {
            $$(`#${PREFIX}-table-body .sla-row-check`).forEach(cb => { cb.checked = sa.checked; });
        });

        // Criteria modal
        const closeBtn = $('#sla-criteria-close');
        if (closeBtn) closeBtn.addEventListener('click', closeCriteriaModal);
        const modal = $('#sla-criteria-modal');
        if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeCriteriaModal(); });
        const saveBtn = $('#sla-criteria-save');
        if (saveBtn) saveBtn.addEventListener('click', saveCriteria);

        } // end if(!_initialized)

        // CSV download modal
        const dlBtn = $(`#${PREFIX}-download-btn`);
        const dlModal = $(`#${PREFIX}-download-modal`);
        const dlClose = $(`#${PREFIX}-download-close`);
        const dlConfirm = $(`#${PREFIX}-download-confirm`);
        if (dlBtn && dlModal) {
            dlBtn.addEventListener('click', () => { dlModal.classList.add('show'); dlModal.setAttribute('aria-hidden', 'false'); });
        }
        if (dlClose && dlModal) {
            dlClose.addEventListener('click', () => { dlModal.classList.remove('show'); dlModal.setAttribute('aria-hidden', 'true'); });
        }
        if (dlModal) {
            dlModal.addEventListener('click', (e) => { if (e.target === dlModal) { dlModal.classList.remove('show'); dlModal.setAttribute('aria-hidden', 'true'); } });
        }
        if (dlConfirm) {
            dlConfirm.addEventListener('click', () => {
                const range = document.querySelector('input[name="sla-dl-range"]:checked');
                exportCSV(range && range.value === 'selected');
                dlModal.classList.remove('show');
                dlModal.setAttribute('aria-hidden', 'true');
            });
        }

        load();
    }

    /* ── bootstrap ─────────────────────────────────────────── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    // SPA re-entry
    document.addEventListener('blossom:pageLoaded', () => {
        if (document.body.classList.contains('page-vendor-maintenance-sla')) init();
    });
})();
