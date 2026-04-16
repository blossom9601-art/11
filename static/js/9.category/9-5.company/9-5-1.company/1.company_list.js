(function(){
    'use strict';

    const API_ENDPOINT = '/api/org-companies';
    const PAGE_SIZE_KEY = 'org_company_page_size';

    const state = {
        data: [],
        filtered: [],
        page: 1,
        pageSize: 10,
        search: '',
        selected: new Set(),
        isLoading: false,
    };

    function qs(id){ return document.getElementById(id); }
    function escapeHtml(value){ return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]; }); }
    function showMessage(message, title){
        const modal = qs('system-message-modal');
        if(!modal) return alert(message);
        qs('message-title').textContent = title || '알림';
        qs('message-content').textContent = message || '';
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
        const close = function(){ modal.classList.remove('show'); modal.setAttribute('aria-hidden', 'true'); };
        qs('system-message-ok')?.addEventListener('click', close, { once:true });
        qs('system-message-close')?.addEventListener('click', close, { once:true });
    }
    async function apiRequest(url, options){
        const response = await fetch(url, Object.assign({ credentials:'same-origin', headers:{ 'Content-Type':'application/json', 'Accept':'application/json' } }, options || {}));
        const json = await response.json().catch(function(){ return {}; });
        if(!response.ok || json.success === false){ throw new Error(json.message || ('요청 실패 (HTTP ' + response.status + ')')); }
        return json;
    }
    function normalizeRow(row){
        return {
            id: row && row.id,
            company_code: row && row.company_code || '',
            company_name: row && row.company_name || '',
            description: row && row.description || '',
            user_count: Number(row && row.user_count || 0) || 0,
            note: row && row.note || '',
        };
    }
    async function refreshData(){
        state.isLoading = true;
        render();
        try {
            const payload = await apiRequest(API_ENDPOINT + '?_=' + Date.now(), { method:'GET' });
            state.data = Array.isArray(payload.items) ? payload.items.map(normalizeRow) : [];
            state.selected.clear();
        } catch(err){
            console.error(err);
            showMessage(err.message || '회사 목록을 불러오지 못했습니다.', '오류');
        } finally {
            state.isLoading = false;
            applyFilter();
        }
    }
    function applyFilter(){
        const q = (state.search || '').trim().toLowerCase();
        state.filtered = state.data.filter(function(item){
            if(!q) return true;
            return [item.company_name, item.description, item.note].join(' ').toLowerCase().indexOf(q) >= 0;
        });
        const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
        if(state.page > totalPages) state.page = totalPages;
        if(state.page < 1) state.page = 1;
        render();
    }
    function pagedRows(){
        const start = (state.page - 1) * state.pageSize;
        return state.filtered.slice(start, start + state.pageSize);
    }
    function render(){
        const tbody = qs('system-table-body');
        if(!tbody) return;
        const rows = pagedRows();
        tbody.innerHTML = rows.map(function(item){
            const checked = state.selected.has(item.id) ? ' checked' : '';
            const rowClass = state.selected.has(item.id) ? ' class="selected"' : '';
            return '<tr data-id="' + item.id + '"' + rowClass + '>' +
                '<td><input type="checkbox" class="system-row-select" value="' + item.id + '"' + checked + '></td>' +
                '<td data-col="company_name">' + escapeHtml(item.company_name) + '</td>' +
                '<td data-col="description">' + escapeHtml(item.description || '-') + '</td>' +
                '<td data-col="user_count">' + item.user_count + '</td>' +
                '<td data-col="note" class="col-hidden">' + escapeHtml(item.note || '-') + '</td>' +
                '<td data-col="actions" class="system-actions"><button type="button" class="action-btn company-edit-btn" title="수정"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon"></button></td>' +
            '</tr>';
        }).join('');
        const selectAll = qs('system-select-all');
        if(selectAll){
            selectAll.checked = rows.length > 0 && rows.every(function(item){ return state.selected.has(item.id); });
        }
        qs('system-count').textContent = String(state.filtered.length);
        const empty = qs('system-empty');
        if(empty) empty.hidden = !!state.filtered.length;
        renderPagination();
    }
    function renderPagination(){
        const total = state.filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
        const start = total ? ((state.page - 1) * state.pageSize + 1) : 0;
        const end = total ? Math.min(total, state.page * state.pageSize) : 0;
        qs('system-pagination-info').textContent = total ? (start + '-' + end + ' / ' + total + '개 항목') : '0개 항목';
        const nums = qs('system-page-numbers');
        nums.innerHTML = '';
        for(let i = 1; i <= totalPages; i++){
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'page-btn' + (i === state.page ? ' active' : '');
            b.textContent = String(i);
            b.dataset.page = String(i);
            nums.appendChild(b);
        }
        qs('system-first').disabled = state.page <= 1;
        qs('system-prev').disabled = state.page <= 1;
        qs('system-next').disabled = state.page >= totalPages;
        qs('system-last').disabled = state.page >= totalPages;
    }
    function buildPayload(form){
        return {
            company_name: (form.querySelector('[name="company_name"]')?.value || '').trim(),
            description: (form.querySelector('[name="description"]')?.value || '').trim(),
            note: (form.querySelector('[name="note"]')?.value || '').trim(),
        };
    }
    function openModal(modal){ modal.classList.add('show'); modal.setAttribute('aria-hidden', 'false'); }
    function closeModal(modal){ modal.classList.remove('show'); modal.setAttribute('aria-hidden', 'true'); }
    function initAddModal(){
        const modal = qs('system-add-modal');
        const form = qs('system-add-form');
        qs('system-add-btn')?.addEventListener('click', function(){ form.reset(); openModal(modal); });
        qs('system-add-close')?.addEventListener('click', function(){ closeModal(modal); });
        qs('system-add-save')?.addEventListener('click', async function(){
            const payload = buildPayload(form);
            if(!payload.company_name){ showMessage('회사명을 입력하세요.', '알림'); return; }
            try {
                await apiRequest(API_ENDPOINT, { method:'POST', body: JSON.stringify(payload) });
                closeModal(modal);
                await refreshData();
                showMessage('회사가 등록되었습니다.', '완료');
            } catch(err){ showMessage(err.message || '회사 등록에 실패했습니다.', '오류'); }
        });
        modal.addEventListener('click', function(e){ if(e.target === modal) closeModal(modal); });
    }
    function initEditModal(){
        const modal = qs('system-edit-modal');
        const form = qs('system-edit-form');
        const renderForm = function(item){
            form.innerHTML = '<input type="hidden" name="id" value="' + item.id + '">' +
                '<div class="form-section"><div class="section-header"><h4>회사</h4></div><div class="form-grid">' +
                '<div class="form-row"><label>회사명<span class="required">*</span></label><input name="company_name" class="form-input" value="' + escapeHtml(item.company_name) + '" required></div>' +
                '<div class="form-row"><label>설명</label><input name="description" class="form-input" value="' + escapeHtml(item.description) + '"></div>' +
                '</div><div class="form-row"><label>비고</label><textarea name="note" class="form-input textarea-large" rows="6">' + escapeHtml(item.note) + '</textarea></div></div>';
        };
        qs('system-edit-close')?.addEventListener('click', function(){ closeModal(modal); });
        qs('system-edit-save')?.addEventListener('click', async function(){
            const id = Number(form.querySelector('[name="id"]')?.value || 0);
            const payload = buildPayload(form);
            if(!id || !payload.company_name){ showMessage('회사명을 입력하세요.', '알림'); return; }
            try {
                await apiRequest(API_ENDPOINT + '/' + id, { method:'PUT', body: JSON.stringify(payload) });
                closeModal(modal);
                await refreshData();
                showMessage('회사 정보가 저장되었습니다.', '완료');
            } catch(err){ showMessage(err.message || '회사 수정에 실패했습니다.', '오류'); }
        });
        qs('system-table-body')?.addEventListener('click', function(e){
            const btn = e.target.closest('.company-edit-btn');
            if(!btn) return;
            const tr = btn.closest('tr');
            const id = Number(tr && tr.dataset.id || 0);
            const item = state.data.find(function(row){ return row.id === id; });
            if(!item) return;
            renderForm(item);
            openModal(modal);
        });
        modal.addEventListener('click', function(e){ if(e.target === modal) closeModal(modal); });
    }
    function initDelete(){
        const modal = qs('system-delete-modal');
        const subtitle = qs('delete-subtitle');
        const closeDelete = function(){ if(modal) closeModal(modal); };

        qs('system-delete-btn')?.addEventListener('click', function(){
            const ids = Array.from(state.selected);
            if(!ids.length){ showMessage('선택된 회사가 없습니다.', '알림'); return; }
            if(subtitle){ subtitle.textContent = '선택된 ' + ids.length + '개의 회사를 정말 삭제처리하시겠습니까?'; }
            if(modal) openModal(modal);
        });

        qs('system-delete-close')?.addEventListener('click', closeDelete);
        modal?.addEventListener('click', function(e){ if(e.target === modal) closeDelete(); });

        qs('system-delete-confirm')?.addEventListener('click', async function(){
            const ids = Array.from(state.selected);
            if(!ids.length){ closeDelete(); return; }
            try {
                await apiRequest(API_ENDPOINT + '/bulk-delete', { method:'POST', body: JSON.stringify({ ids: ids }) });
                closeDelete();
                await refreshData();
                showMessage(ids.length + '개 회사가 삭제되었습니다.', '완료');
            } catch(err){ showMessage(err.message || '회사 삭제에 실패했습니다.', '오류'); }
        });
    }
    function bindCommon(){
        const search = qs('system-search');
        search?.addEventListener('input', function(){ state.search = search.value || ''; applyFilter(); });
        qs('system-search-clear')?.addEventListener('click', function(){ if(search){ search.value = ''; state.search = ''; applyFilter(); search.focus(); } });
        const ps = qs('system-page-size');
        try {
            const saved = parseInt(localStorage.getItem(PAGE_SIZE_KEY) || '', 10);
            if([10,20,50,100].indexOf(saved) >= 0){ state.pageSize = saved; ps.value = String(saved); }
        } catch(_e){}
        ps?.addEventListener('change', function(){ const v = parseInt(ps.value, 10); if([10,20,50,100].indexOf(v) >= 0){ state.pageSize = v; state.page = 1; localStorage.setItem(PAGE_SIZE_KEY, String(v)); render(); } });
        qs('system-page-numbers')?.addEventListener('click', function(e){ const btn = e.target.closest('.page-btn'); if(!btn) return; state.page = parseInt(btn.dataset.page, 10) || 1; render(); });
        qs('system-first')?.addEventListener('click', function(){ state.page = 1; render(); });
        qs('system-prev')?.addEventListener('click', function(){ state.page = Math.max(1, state.page - 1); render(); });
        qs('system-next')?.addEventListener('click', function(){ const max = Math.max(1, Math.ceil(state.filtered.length / state.pageSize)); state.page = Math.min(max, state.page + 1); render(); });
        qs('system-last')?.addEventListener('click', function(){ state.page = Math.max(1, Math.ceil(state.filtered.length / state.pageSize)); render(); });
        qs('system-select-all')?.addEventListener('change', function(){
            state.selected.clear();
            if(this.checked){ pagedRows().forEach(function(item){ state.selected.add(item.id); }); }
            render();
        });
        qs('system-table-body')?.addEventListener('change', function(e){
            const cb = e.target.closest('.system-row-select');
            if(!cb) return;
            const id = Number(cb.value || 0);
            if(cb.checked) state.selected.add(id); else state.selected.delete(id);
            const tr = cb.closest('tr');
            if(tr) tr.classList.toggle('selected', cb.checked);
            const selectAll = qs('system-select-all');
            if(selectAll){
                const pageRows = pagedRows();
                selectAll.checked = pageRows.length > 0 && pageRows.every(function(item){ return state.selected.has(item.id); });
            }
        });
        qs('system-table-body')?.addEventListener('click', function(e){
            if(e.target.closest('.system-actions')) return;
            const cb = e.target.closest('.system-row-select');
            if(cb) return;
            const tr = e.target.closest('tr[data-id]');
            if(!tr) return;
            const rowCb = tr.querySelector('.system-row-select');
            if(!rowCb) return;
            rowCb.checked = !rowCb.checked;
            rowCb.dispatchEvent(new Event('change', { bubbles: true }));
        });
        ['system-bulk-btn','system-stats-btn','system-duplicate-btn','system-download-btn'].forEach(function(id){
            qs(id)?.addEventListener('click', function(){ showMessage('이 기능은 회사 화면에 아직 연결되지 않았습니다.', '알림'); });
        });
    }
    function init(){
        bindCommon();
        initAddModal();
        initEditModal();
        initDelete();
        refreshData();
    }
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();