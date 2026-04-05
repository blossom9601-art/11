/**
 * tab48-issue.js  —  이슈관리 탭 (유지보수사 상세)
 * v1.0  2026-02-19
 *
 * Columns: 상태, 이슈내용, 업무명, 유형, 영향도, 긴급도
 * - "이슈내용" click → 3-tab modal (이슈정보, 원인분석, 조치관리)
 * - 업무명 = multi-select chips (from work-groups)
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
    let _workGroups = [];   // [{id, wc_name}, ...]
    const PFX = 'iss';

    /* ── DOM refs ──────────────────────────────────────────── */
    const $  = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);

    const tbody       = () => $(`#${PFX}-table-body`);
    const emptyEl     = () => $(`#${PFX}-empty`);
    const pageSizeSel = () => $(`#${PFX}-page-size`);
    const selectAll   = () => $(`#${PFX}-select-all`);

    /* ── status badge helper ───────────────────────────────── */
    function statusBadge(s) {
        const cls = { '조치중': 'is-warning', '분석중': 'is-info', '종료': 'is-success' };
        return `<span class="status-pill ${cls[s] || ''}">${esc(s)}</span>`;
    }
    function impactBadge(v) {
        const cls = { '높음': 'is-high', '중간': 'is-medium', '낮음': 'is-low' };
        return `<span class="status-pill ${cls[v] || ''}">${esc(v)}</span>`;
    }
    function urgencyBadge(v) {
        const cls = { '긴급': 'is-high', '일반': 'is-medium', '낮음': 'is-low' };
        return `<span class="status-pill ${cls[v] || ''}">${esc(v)}</span>`;
    }

    /* ── fetch ─────────────────────────────────────────────── */
    async function load() {
        const vid = _getVid();
        if (!vid) return;
        try {
            const res = await fetch(`/api/vendor-maintenance/${vid}/issues`);
            const j = await res.json();
            _allItems = j.success ? (j.items || []) : [];
        } catch (_) { _allItems = []; }
        renderPage();
    }

    async function loadWorkGroups() {
        try {
            const r = await fetch('/api/work-groups');
            const j = await r.json();
            _workGroups = j.success ? (j.items || []) : [];
        } catch (_) { _workGroups = []; }
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

        const emp = emptyEl();
        if (emp) { emp.hidden = total > 0; emp.style.display = total > 0 ? 'none' : ''; }

        slice.forEach(item => {
            const workNames = (item.work_names || []).join(', ');
            const tr = document.createElement('tr');
            tr.dataset.id = item.id;
            tr.innerHTML = `
                <td><input type="checkbox" class="iss-row-check"></td>
                <td data-col="status">${statusBadge(item.status)}</td>
                <td data-col="content"><button type="button" class="iss-content-link" data-issue-id="${item.id}">${esc(truncate(item.content, 60))}</button></td>
                <td data-col="work_names">${esc(workNames)}</td>
                <td data-col="issue_type">${esc(item.issue_type)}</td>
                <td data-col="impact">${item.impact ? impactBadge(item.impact) : ''}</td>
                <td data-col="urgency">${item.urgency ? urgencyBadge(item.urgency) : ''}</td>
                <td data-col="actions">
                    <button class="action-btn" data-action="delete" title="삭제">
                        <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">
                    </button>
                </td>`;
            tb.appendChild(tr);
        });

        updatePagination(total, pages);
    }

    function esc(s) { return (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function truncate(s, n) { return (s || '').length > n ? (s || '').slice(0, n) + '…' : (s || ''); }

    /* ── pagination ────────────────────────────────────────── */
    function updatePagination(total, pages) {
        const s = total ? (_page - 1) * _pageSize + 1 : 0;
        const e = Math.min(total, _page * _pageSize);
        const info = $(`#${PFX}-pagination-info`);
        if (info) info.textContent = `${s}-${e} / ${total}개 항목`;
        const nums = $(`#${PFX}-page-numbers`);
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
        const first = $(`#${PFX}-first`), prev = $(`#${PFX}-prev`);
        const next = $(`#${PFX}-next`), last = $(`#${PFX}-last`);
        if (first) { first.disabled = _page <= 1; first.onclick = () => { _page = 1; renderPage(); }; }
        if (prev) { prev.disabled = _page <= 1; prev.onclick = () => { _page = Math.max(1, _page - 1); renderPage(); }; }
        if (next) { next.disabled = _page >= pages; next.onclick = () => { _page = Math.min(pages, _page + 1); renderPage(); }; }
        if (last) { last.disabled = _page >= pages; last.onclick = () => { _page = pages; renderPage(); }; }
    }

    /* ── inline add row ──────────────────────────────────────── */
    function addNewRow() {
        const vid = _getVid();
        if (!vid) return;
        const tb = tbody();
        if (!tb) return;
        const emp = emptyEl();
        if (emp) { emp.hidden = true; emp.style.display = 'none'; }

        const tr = document.createElement('tr');
        tr.classList.add('is-new');
        tr.innerHTML = `
            <td><input type="checkbox" class="iss-row-check"></td>
            <td data-col="status">
                <select class="form-input" style="width:100%;">
                    <option value="분석중">분석중</option>
                    <option value="조치중">조치중</option>
                    <option value="종료">종료</option>
                </select>
            </td>
            <td data-col="content"><input type="text" class="form-input" placeholder="이슈내용" style="width:100%;"></td>
            <td data-col="work_names"><input type="text" class="form-input" placeholder="업무명" style="width:100%;"></td>
            <td data-col="issue_type">
                <select class="form-input" style="width:100%;">
                    <option value="">선택</option>
                    <option value="장애">장애</option>
                    <option value="성능">성능</option>
                    <option value="보안">보안</option>
                    <option value="개선">개선</option>
                </select>
            </td>
            <td data-col="impact">
                <select class="form-input" style="width:100%;">
                    <option value="">선택</option>
                    <option value="높음">높음</option>
                    <option value="중간">중간</option>
                    <option value="낮음">낮음</option>
                </select>
            </td>
            <td data-col="urgency">
                <select class="form-input" style="width:100%;">
                    <option value="">선택</option>
                    <option value="긴급">긴급</option>
                    <option value="일반">일반</option>
                    <option value="낮음">낮음</option>
                </select>
            </td>
            <td data-col="actions">
                <button class="action-btn" data-action="save-new" title="저장">
                    <img src="/static/image/svg/save.svg" alt="저장" class="action-icon">
                </button>
                <button class="action-btn" data-action="cancel-new" title="취소">
                    <img src="/static/image/svg/list/free-icon-trash.svg" alt="취소" class="action-icon">
                </button>
            </td>`;
        tb.prepend(tr);
    }

    /* ── save inline new row ───────────────────────────────── */
    async function saveNewRow(tr) {
        const vid = _getVid();
        if (!vid) return;
        const status = tr.querySelector('[data-col="status"] select')?.value || '분석중';
        const content = tr.querySelector('[data-col="content"] input')?.value || '';
        const workInput = tr.querySelector('[data-col="work_names"] input')?.value || '';
        const issueType = tr.querySelector('[data-col="issue_type"] select')?.value || '';
        const impact = tr.querySelector('[data-col="impact"] select')?.value || '';
        const urgency = tr.querySelector('[data-col="urgency"] select')?.value || '';

        const workNames = workInput ? workInput.split(/[,;，；]/).map(s => s.trim()).filter(Boolean) : [];

        const data = { status, content, issue_type: issueType, impact, urgency, work_names: workNames };
        try {
            const res = await fetch(`/api/vendor-maintenance/${vid}/issues`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const j = await res.json();
            if (j.success) { await load(); } else { alert(j.message || '저장 실패'); }
        } catch (e) { alert('저장 중 오류: ' + e.message); }
    }

    /* ── add new row → open modal in create mode ───────────── */
    let _editingIssueId = null;

    function openDetailModal(issueId) {
        _editingIssueId = issueId;
        const item = issueId ? _allItems.find(i => i.id === issueId) : null;

        // Info tab fields
        const form = $('#iss-detail-form');
        if (!form) return;

        // Reset form
        form.reset();
        _selectedWorks = [];
        renderWorkChips();

        // Switch to info tab
        activateModalTab('info');

        if (item) {
            // Populate info tab
            setVal(form, 'status', item.status);
            setVal(form, 'content', item.content);
            setVal(form, 'issue_type', item.issue_type);
            setVal(form, 'impact', item.impact);
            setVal(form, 'urgency', item.urgency);
            // Populate work names
            _selectedWorks = (item.work_names || []).slice();
            renderWorkChips();

            // Update subtitle
            const sub = $('#iss-detail-subtitle');
            if (sub) sub.textContent = truncate(item.content, 40) || '이슈 내용';

            // Load cause + action tabs async
            loadCause(issueId);
            loadAction(issueId);
        } else {
            const sub = $('#iss-detail-subtitle');
            if (sub) sub.textContent = '새 이슈 등록';
        }

        const modal = $('#iss-detail-modal');
        if (modal) { modal.classList.add('show'); modal.setAttribute('aria-hidden', 'false'); }
    }

    function closeDetailModal() {
        const modal = $('#iss-detail-modal');
        if (modal) { modal.classList.remove('show'); modal.setAttribute('aria-hidden', 'true'); }
        _editingIssueId = null;
    }

    function setVal(form, name, val) {
        const el = form.querySelector(`[name="${name}"]`);
        if (el) el.value = val || '';
    }
    function getVal(form, name) {
        const el = form.querySelector(`[name="${name}"]`);
        return el ? el.value : '';
    }

    /* ── modal tab switching (pv-detail pattern) ───────────── */
    function activateModalTab(tabName) {
        $$('[data-iss-tab]').forEach(b => b.classList.toggle('active', b.dataset.issTab === tabName));
        $$('[data-iss-pane]').forEach(p => p.classList.toggle('active', p.dataset.issPane === tabName));
    }

    /* ── work name multi-select (chip pattern like tab47-service) ── */
    let _selectedWorks = [];

    function populateWorkSelect() {
        const sel = $('#iss-work-select');
        if (!sel) return;
        sel.innerHTML = '<option value="">업무 선택</option>';
        _workGroups.forEach(wg => {
            const name = wg.wc_name || wg.name || '';
            if (name) {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                sel.appendChild(opt);
            }
        });
    }

    function renderWorkChips() {
        const area = $('#iss-work-chips');
        if (!area) return;
        area.innerHTML = '';
        _selectedWorks.forEach(wn => {
            const chip = document.createElement('span');
            chip.className = 'iss-work-chip';
            chip.innerHTML = `${esc(wn)} <button type="button" class="iss-chip-remove" data-work="${esc(wn)}">&times;</button>`;
            area.appendChild(chip);
        });
    }

    /* ── cause / action tab data ───────────────────────────── */
    async function loadCause(issueId) {
        try {
            const r = await fetch(`/api/vendor-maintenance/issues/${issueId}/cause`);
            const j = await r.json();
            const d = (j.success && j.item) ? j.item : {};
            const form = $('#iss-detail-form');
            if (!form) return;
            setVal(form, 'occurred_at', d.occurred_at || '');
            setVal(form, 'cause', d.cause || '');
            setVal(form, 'analysis', d.analysis || '');
            setVal(form, 'recurrence', d.recurrence || 'X');
        } catch (_) { /* */ }
    }

    async function loadAction(issueId) {
        try {
            const r = await fetch(`/api/vendor-maintenance/issues/${issueId}/action`);
            const j = await r.json();
            const d = (j.success && j.item) ? j.item : {};
            const form = $('#iss-detail-form');
            if (!form) return;
            setVal(form, 'action_at', d.action_at || '');
            setVal(form, 'completed_at', d.completed_at || '');
            setVal(form, 'person', d.person || '');
            setVal(form, 'action_content', d.action_content || '');
            setVal(form, 'is_temporary', d.is_temporary || 'X');
        } catch (_) { /* */ }
    }

    /* ── save all tabs ─────────────────────────────────────── */
    async function saveAll() {
        const vid = _getVid();
        if (!vid) return;
        const form = $('#iss-detail-form');
        if (!form) return;

        const isNew = !_editingIssueId;
        const issueData = {
            status: getVal(form, 'status'),
            content: getVal(form, 'content'),
            issue_type: getVal(form, 'issue_type'),
            impact: getVal(form, 'impact'),
            urgency: getVal(form, 'urgency'),
            work_names: _selectedWorks,
        };

        try {
            let issueId = _editingIssueId;
            if (isNew) {
                const r = await fetch(`/api/vendor-maintenance/${vid}/issues`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(issueData),
                });
                const j = await r.json();
                if (!j.success) { alert(j.message || '저장 실패'); return; }
                issueId = j.item.id;
            } else {
                const r = await fetch(`/api/vendor-maintenance/${vid}/issues/${issueId}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(issueData),
                });
                const j = await r.json();
                if (!j.success) { alert(j.message || '수정 실패'); return; }
            }

            // Save cause tab
            const causeData = {
                occurred_at: getVal(form, 'occurred_at'),
                cause: getVal(form, 'cause'),
                analysis: getVal(form, 'analysis'),
                recurrence: getVal(form, 'recurrence'),
            };
            await fetch(`/api/vendor-maintenance/issues/${issueId}/cause`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(causeData),
            });

            // Save action tab
            const actionData = {
                action_at: getVal(form, 'action_at'),
                completed_at: getVal(form, 'completed_at'),
                person: getVal(form, 'person'),
                action_content: getVal(form, 'action_content'),
                is_temporary: getVal(form, 'is_temporary'),
            };
            await fetch(`/api/vendor-maintenance/issues/${issueId}/action`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(actionData),
            });

            closeDetailModal();
            await load();
        } catch (e) {
            alert('저장 중 오류: ' + e.message);
        }
    }

    /* ── delete row ────────────────────────────────────────── */
    async function deleteRow(tr) {
        const vid = _getVid();
        if (!vid || !tr.dataset.id) return;
        if (!confirm('삭제하시겠습니까?')) return;
        try {
            const r = await fetch(`/api/vendor-maintenance/${vid}/issues/${tr.dataset.id}`, { method: 'DELETE' });
            const j = await r.json();
            if (j.success) await load(); else alert(j.message || '삭제 실패');
        } catch (e) { alert('삭제 중 오류: ' + e.message); }
    }

    /* ── CSV export ────────────────────────────────────────── */
    function exportCSV(onlySelected) {
        const headers = ['상태', '이슈내용', '업무명', '유형', '영향도', '긴급도'];
        let rows = _allItems;
        if (onlySelected) {
            const checked = new Set();
            $$(`#${PFX}-table-body tr`).forEach(tr => {
                const cb = tr.querySelector('.iss-row-check');
                if (cb && cb.checked && tr.dataset.id) checked.add(tr.dataset.id);
            });
            rows = rows.filter(r => checked.has(String(r.id)));
        }
        const lines = [headers.join(',')];
        rows.forEach(r => {
            lines.push([r.status, r.content, (r.work_names || []).join('; '), r.issue_type, r.impact, r.urgency]
                .map(v => `"${String(v || '').replace(/"/g, '""')}"`)
                .join(','));
        });
        const bom = '\uFEFF';
        const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `이슈관리_${_getVid()}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    /* ── events ────────────────────────────────────────────── */
    let _initialized = false;
    function init() {
        const vid = _getVid();
        if (!vid) return;

        // Reset state on re-init (SPA swap)
        _allItems = []; _page = 1; _workGroups = [];

        if (!_initialized) {
        _initialized = true;

        // Table delegation (registered once)
        document.addEventListener('click', e => {
            // Save new inline row
            const saveNew = e.target.closest('[data-action="save-new"]');
            if (saveNew) {
                const tr = saveNew.closest('tr');
                if (tr && tr.classList.contains('is-new')) { saveNewRow(tr); return; }
            }
            // Cancel new inline row
            const cancelNew = e.target.closest('[data-action="cancel-new"]');
            if (cancelNew) {
                const tr = cancelNew.closest('tr');
                if (tr && tr.classList.contains('is-new')) { tr.remove(); renderPage(); return; }
            }
            // Delete button
            const btn = e.target.closest('[data-action="delete"]');
            if (btn) {
                const tr = btn.closest('tr');
                if (tr && tr.closest(`#${PFX}-table-body`)) { deleteRow(tr); return; }
            }
            // Content link → open modal
            const link = e.target.closest('.iss-content-link');
            if (link) {
                e.preventDefault();
                const id = parseInt(link.dataset.issueId, 10);
                if (id) openDetailModal(id);
                return;
            }
            // Work chip remove
            const rm = e.target.closest('.iss-chip-remove');
            if (rm) {
                _selectedWorks = _selectedWorks.filter(w => w !== rm.dataset.work);
                renderWorkChips();
                return;
            }
        });

        // Modal tabs (registered once, document-level)
        document.addEventListener('click', e => {
            const tab = e.target.closest('[data-iss-tab]');
            if (tab) activateModalTab(tab.dataset.issTab);
        });

        } // end if(!_initialized)

        // Add new issue (inline row)
        const addBtn = $(`#${PFX}-row-add`);
        if (addBtn) addBtn.addEventListener('click', addNewRow);

        // Page size
        const ps = pageSizeSel();
        if (ps) ps.addEventListener('change', () => { _pageSize = parseInt(ps.value, 10); _page = 1; renderPage(); });

        // Select all
        const sa = selectAll();
        if (sa) sa.addEventListener('change', () => {
            $$(`#${PFX}-table-body .iss-row-check`).forEach(cb => { cb.checked = sa.checked; });
        });

        // Modal close/save
        const closeBtn = $('#iss-detail-close');
        if (closeBtn) closeBtn.addEventListener('click', closeDetailModal);
        const modal = $('#iss-detail-modal');
        if (modal) modal.addEventListener('click', e => { if (e.target === modal) closeDetailModal(); });
        const saveBtn = $('#iss-detail-save');
        if (saveBtn) saveBtn.addEventListener('click', saveAll);

        // Work select → add chip
        const ws = $('#iss-work-select');
        if (ws) ws.addEventListener('change', () => {
            const v = ws.value;
            if (v && !_selectedWorks.includes(v)) {
                _selectedWorks.push(v);
                renderWorkChips();
            }
            ws.value = '';
        });

        // CSV download modal
        const dlBtn = $(`#${PFX}-download-btn`);
        const dlModal = $(`#${PFX}-download-modal`);
        const dlClose = $(`#${PFX}-download-close`);
        const dlConfirm = $(`#${PFX}-download-confirm`);
        if (dlBtn && dlModal) dlBtn.addEventListener('click', () => { dlModal.classList.add('show'); dlModal.setAttribute('aria-hidden', 'false'); });
        if (dlClose && dlModal) dlClose.addEventListener('click', () => { dlModal.classList.remove('show'); dlModal.setAttribute('aria-hidden', 'true'); });
        if (dlModal) dlModal.addEventListener('click', e => { if (e.target === dlModal) { dlModal.classList.remove('show'); dlModal.setAttribute('aria-hidden', 'true'); } });
        if (dlConfirm) dlConfirm.addEventListener('click', () => {
            const range = document.querySelector(`input[name="${PFX}-dl-range"]:checked`);
            exportCSV(range && range.value === 'selected');
            if (dlModal) { dlModal.classList.remove('show'); dlModal.setAttribute('aria-hidden', 'true'); }
        });

        // Load data
        loadWorkGroups().then(populateWorkSelect);
        load();
    }

    /* ── bootstrap ─────────────────────────────────────────── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    document.addEventListener('blossom:pageLoaded', () => {
        if (document.body.classList.contains('page-vendor-maintenance-issue')) init();
    });
})();
