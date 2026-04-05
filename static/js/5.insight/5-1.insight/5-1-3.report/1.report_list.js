(function(){
	'use strict';

	function $(sel, root){ return (root||document).querySelector(sel); }

	function pad2(n){ return String(n).padStart(2,'0'); }
	function todayYmd(){ const d=new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }

	function csvCell(v){
		if(v==null) return '';
		const s = String(v).replace(/"/g,'""');
		return /[\",\n\r]/.test(s) ? `"${s}"` : s;
	}

	function downloadRowsAsCsv(filename, headers, rows){
		const lines = [];
		lines.push(headers.map(csvCell).join(','));
		rows.forEach(r => {
			lines.push(headers.map(h => csvCell(r[h])).join(','));
		});
		const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		try{
			if(typeof showToast === 'function') showToast('CSV 파일이 다운로드되었습니다.', 'success');
		}catch(_e){}
	}

	function setModalOpen(modalEl, open){
		if(!modalEl) return;
		if(open){
			modalEl.classList.add('show');
			modalEl.setAttribute('aria-hidden','false');
			document.body.classList.add('modal-open');
		}else{
			modalEl.classList.remove('show');
			modalEl.setAttribute('aria-hidden','true');
			const anyOpen = !!document.querySelector('.modal-overlay-full.show, .server-add-modal.show');
			if(!anyOpen) document.body.classList.remove('modal-open');
		}
	}

	function openModal(id){
		const el = document.getElementById(id);
		if(!el) return;
		setModalOpen(el, true);
	}

	function closeModal(id){
		const el = document.getElementById(id);
		if(!el) return;
		setModalOpen(el, false);
	}

	async function apiJson(url, options){
		const res = await fetch(url, options);
		let data = null;
		try{ data = await res.json(); }catch(_e){ data = null; }
		if(!res.ok || (data && data.success === false)){
			const msg = (data && data.message) ? data.message : `요청 실패 (${res.status})`;
			throw new Error(msg);
		}
		return data;
	}

	function formatDate(val){
		const s = String(val||'').trim();
		if(!s) return '';
		if(s.length >= 10) return s.slice(0,10);
		return s;
	}

	function initInsightListPage(){
		const category = 'report';
		const label = '지식';

		const tableBody = document.getElementById('insight-table-body');
		const countEl = document.getElementById('insight-count');
		const emptyEl = document.getElementById('system-empty');
		const paginationEl = document.getElementById('insight-pagination');
		const infoEl = document.getElementById('insight-pagination-info');
		const pageNumbersEl = document.getElementById('insight-page-numbers');

		const searchInput = document.getElementById('insight-search');
		const searchClear = document.getElementById('insight-search-clear');
		const searchWrapper = document.getElementById('insight-search-wrapper');

		const pageSizeSel = document.getElementById('insight-page-size');

		const btnDownload = document.getElementById('insight-download-btn');
		const btnDelete = document.getElementById('insight-delete-btn');
		const btnAdd = document.getElementById('insight-add-btn');

		const selectAll = document.getElementById('insight-select-all');

		const modalEl = document.getElementById('insight-add-modal');
		const modalClose = document.getElementById('insight-add-close');
		const modalForm = document.getElementById('insight-add-form');
		const modalTitleInput = document.getElementById('insight-add-title-input');
		const modalAuthorInput = document.getElementById('insight-add-author-input');
		const modalTitleText = document.getElementById('insight-add-title');

		const deleteModalEl = document.getElementById('insight-delete-modal');
		const deleteSubtitleEl = document.getElementById('insight-delete-subtitle');
		const deleteClose = document.getElementById('insight-delete-close');
		const deleteConfirm = document.getElementById('insight-delete-confirm');

		const downloadModalEl = document.getElementById('insight-download-modal');
		const downloadSubtitleEl = document.getElementById('insight-download-subtitle');
		const downloadClose = document.getElementById('insight-download-close');
		const downloadConfirm = document.getElementById('insight-download-confirm');
		const csvRowSelected = document.getElementById('insight-csv-range-row-selected');
		const csvOptAll = document.getElementById('insight-csv-range-all');
		const csvOptSelected = document.getElementById('insight-csv-range-selected');

		const currentUserName = (document.body && document.body.getAttribute('data-current-user-name')) || '';

		const state = {
			q: '',
			page: 1,
			pageSize: parseInt(pageSizeSel && pageSizeSel.value, 10) || 10,
			total: 0,
			items: [],
			editingId: null,
			pendingDeleteIds: [],
		};

		function escapeHtml(s){
			const str = String(s ?? '');
			return str
				.replace(/&/g,'&amp;')
				.replace(/</g,'&lt;')
				.replace(/>/g,'&gt;')
				.replace(/"/g,'&quot;')
				.replace(/'/g,'&#39;');
		}

		function updateCount(n){
			if(!countEl) return;
			countEl.textContent = String(n||0);
			countEl.classList.toggle('large-number', (n||0) >= 100);
			countEl.classList.toggle('very-large-number', (n||0) >= 1000);
		}

		function setEmptyVisible(visible){ if(emptyEl) emptyEl.hidden = !visible; }
		function setTableVisible(visible){ const c=document.getElementById('insight-table-container'); if(c) c.hidden = !visible; }
		function setPaginationVisible(visible){ if(paginationEl) paginationEl.hidden = !visible; }

		function totalPages(){ return Math.max(1, Math.ceil(state.total / state.pageSize)); }

		function togglePageButtons(){
			const firstBtn = document.getElementById('insight-first');
			const prevBtn = document.getElementById('insight-prev');
			const nextBtn = document.getElementById('insight-next');
			const lastBtn = document.getElementById('insight-last');
			const pages = totalPages();
			if(firstBtn) firstBtn.disabled = state.page === 1;
			if(prevBtn) prevBtn.disabled = state.page === 1;
			if(nextBtn) nextBtn.disabled = state.page === pages;
			if(lastBtn) lastBtn.disabled = state.page === pages;
		}

		function renderPagination(){
			if(infoEl){
				const start = state.total ? (state.page - 1) * state.pageSize + 1 : 0;
				const end = Math.min(state.total, state.page * state.pageSize);
				infoEl.textContent = `${start}-${end} / ${state.total}개 항목`;
			}
			if(pageNumbersEl){
				const pages = totalPages();
				pageNumbersEl.innerHTML = '';
				for(let p=1; p<=pages && p<=50; p++){
					const btn = document.createElement('button');
					btn.type = 'button';
					btn.className = 'page-btn' + (p === state.page ? ' active' : '');
					btn.textContent = String(p);
					btn.dataset.page = String(p);
					pageNumbersEl.appendChild(btn);
				}
			}
			togglePageButtons();
		}

		function renderRows(){
			if(!tableBody) return;
			tableBody.innerHTML = '';

			state.items.forEach(item => {
				const tr = document.createElement('tr');
				tr.innerHTML = `
					<td style="width:46px"><input type="checkbox" class="row-checkbox" data-id="${item.id}" aria-label="선택"></td>
					<td class="insight-title-cell">
						<a href="#" class="insight-title-link work-name-link" data-action="view" data-id="${item.id}">${escapeHtml(item.title||'')}</a>
					</td>
					<td style="width:160px">${escapeHtml(item.author||'')}</td>
					<td style="width:140px">${escapeHtml(formatDate(item.created_at))}</td>
					<td style="width:110px">${escapeHtml(String(item.views ?? 0))}</td>
					<td style="width:110px">${escapeHtml(String(item.likes ?? 0))}</td>
					<td style="width:140px">
						<div class="action-buttons right">
							<button type="button" class="action-btn" data-action="edit" data-id="${item.id}" title="수정" aria-label="수정">
								<img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon">
							</button>
						</div>
					</td>
				`;
				tableBody.appendChild(tr);
			});

			syncSelectAll();
		}

		function getSelectedIds(){
			const checked = document.querySelectorAll('#insight-table-body .row-checkbox:checked');
			return Array.from(checked)
				.map(el => el.getAttribute('data-id'))
				.filter(Boolean);
		}

		function syncSelectAll(){
			if(!selectAll) return;
			const boxes = document.querySelectorAll('#insight-table-body .row-checkbox');
			const checked = document.querySelectorAll('#insight-table-body .row-checkbox:checked');
			if(!boxes.length){
				selectAll.checked = false;
				selectAll.indeterminate = false;
				return;
			}
			selectAll.checked = checked.length === boxes.length;
			selectAll.indeterminate = checked.length > 0 && checked.length < boxes.length;
		}

		function bindPaginationButtons(){
			const firstBtn = document.getElementById('insight-first');
			const prevBtn = document.getElementById('insight-prev');
			const nextBtn = document.getElementById('insight-next');
			const lastBtn = document.getElementById('insight-last');

			if(firstBtn) firstBtn.addEventListener('click', ()=>{ if(state.page !== 1){ state.page = 1; load(); } });
			if(prevBtn) prevBtn.addEventListener('click', ()=>{ if(state.page > 1){ state.page -= 1; load(); } });
			if(nextBtn) nextBtn.addEventListener('click', ()=>{ const pages = totalPages(); if(state.page < pages){ state.page += 1; load(); } });
			if(lastBtn) lastBtn.addEventListener('click', ()=>{ const pages = totalPages(); if(state.page !== pages){ state.page = pages; load(); } });

			if(pageNumbersEl){
				pageNumbersEl.addEventListener('click', (e)=>{
					const t = e.target;
					if(!t || !t.classList || !t.classList.contains('page-btn')) return;
					const p = parseInt(t.dataset.page || '', 10);
					if(!p || p === state.page) return;
					state.page = p;
					load();
				});
			}
		}

		let searchTimer = null;
		function setSearching(on){ if(searchWrapper) searchWrapper.classList.toggle('active-searching', !!on); }
		function setClearVisible(){
			if(!searchClear || !searchInput) return;
			const has = !!searchInput.value.trim();
			searchClear.classList.toggle('visible', has);
		}

		async function load(){
			const offset = (state.page - 1) * state.pageSize;
			const url = `/api/insight/items?category=${encodeURIComponent(category)}&q=${encodeURIComponent(state.q||'')}&limit=${state.pageSize}&offset=${offset}`;
			try{
				setSearching(true);
				const data = await apiJson(url, { method:'GET', headers:{'Accept':'application/json'} });
				state.items = (data && data.items) ? data.items : [];
				state.total = (data && (data.totalCount != null)) ? data.totalCount : state.items.length;

				updateCount(state.total);
				renderRows();
				renderPagination();

				const hasAny = state.total > 0;
				setEmptyVisible(!hasAny);
				setTableVisible(hasAny);
				setPaginationVisible(hasAny);
			}catch(err){
				updateCount(0);
				if(tableBody) tableBody.innerHTML = '';
				setEmptyVisible(true);
				setTableVisible(false);
				setPaginationVisible(false);
				try{
					if(typeof showToast === 'function') showToast(err.message || '오류가 발생했습니다.', 'error');
				}catch(_e){
					alert(err.message || '오류가 발생했습니다.');
				}
			}finally{
				setSearching(false);
			}
		}

		async function performBulkDelete(ids){
			const list = Array.isArray(ids) ? ids : [];
			const count = list.length;
			if(count === 0){
				try{ if(typeof showToast === 'function') showToast('삭제처리할 행을 먼저 선택하세요.', 'info'); }catch(_e){ alert('삭제처리할 행을 먼저 선택하세요.'); }
				return;
			}

			let ok = 0;
			for(const id of list){
				try{
					await apiJson(`/api/insight/items/${id}`, { method:'DELETE', headers:{'Accept':'application/json'} });
					ok += 1;
				}catch(_e){}
			}

			try{ if(typeof showToast === 'function') showToast(`${ok}개 항목이 삭제처리되었습니다.`, 'success'); }catch(_e){}
			if(selectAll){ selectAll.checked = false; selectAll.indeterminate = false; }
			await load();
		}

		async function exportCsv(onlySelected){
			const headers = ['제목','작성자','작성일','조회수','좋아요'];

			const selectedIds = new Set(getSelectedIds().map(String));
			let itemsForCsv = [];

			if(onlySelected === true){
				if(!selectedIds.size){
					try{ if(typeof showToast === 'function') showToast('선택된 행이 없습니다.', 'info'); }catch(_e){}
					return;
				}
				itemsForCsv = state.items.filter(it => selectedIds.has(String(it.id)));
			}else{
				const total = state.total || 0;
				if(total === 0){
					try{ if(typeof showToast === 'function') showToast('다운로드할 데이터가 없습니다.', 'info'); }catch(_e){}
					return;
				}
				const chunk = 1000;
				const all = [];
				for(let offset = 0; offset < total; offset += chunk){
					const url = `/api/insight/items?category=${encodeURIComponent(category)}&q=${encodeURIComponent(state.q||'')}&limit=${chunk}&offset=${offset}`;
					const data = await apiJson(url, { method:'GET', headers:{'Accept':'application/json'} });
					const part = (data && data.items) ? data.items : [];
					part.forEach(x => all.push(x));
					if(part.length < chunk) break;
				}
				itemsForCsv = all;
			}

			const rows = itemsForCsv.map(it => ({
				'제목': it.title || '',
				'작성자': it.author || '',
				'작성일': formatDate(it.created_at),
				'조회수': it.views ?? 0,
				'좋아요': it.likes ?? 0,
			}));
			downloadRowsAsCsv(`insight_${category}_${todayYmd()}.csv`, headers, rows);
		}

		function openDeleteConfirmModal(){
			const ids = getSelectedIds();
			const count = ids.length;
			if(count === 0){
				try{ if(typeof showToast === 'function') showToast('삭제처리할 행을 먼저 선택하세요.', 'info'); }catch(_e){ alert('삭제처리할 행을 먼저 선택하세요.'); }
				return;
			}
			state.pendingDeleteIds = ids;
			if(deleteSubtitleEl){ deleteSubtitleEl.textContent = `선택된 ${count}개의 항목을 정말 삭제처리하시겠습니까?`; }
			if(deleteModalEl) openModal('insight-delete-modal');
		}

		function openDownloadConfirmModal(){
			const total = state.total || 0;
			const selectedCount = getSelectedIds().length;
			if(downloadSubtitleEl){
				downloadSubtitleEl.textContent = selectedCount > 0
					? `선택된 ${selectedCount}개 또는 전체 ${total}개 결과 중 범위를 선택하세요.`
					: `현재 결과 ${total}개 항목을 CSV로 내보냅니다.`;
			}
			if(csvRowSelected){ csvRowSelected.hidden = !(selectedCount > 0); }
			if(csvOptSelected){ csvOptSelected.disabled = !(selectedCount > 0); csvOptSelected.checked = selectedCount > 0; }
			if(csvOptAll){ csvOptAll.checked = !(selectedCount > 0); }
			if(downloadModalEl) openModal('insight-download-modal');
		}

		function openAddModal(){
			state.editingId = null;
			if(modalTitleText) modalTitleText.textContent = `${label} 추가`;
			if(modalForm) modalForm.reset();
			if(modalAuthorInput && !modalAuthorInput.value.trim()){
				if(currentUserName) modalAuthorInput.value = currentUserName;
			}
			if(modalTitleInput) modalTitleInput.focus();
			setModalOpen(modalEl, true);
		}

		function openEditModal(item){
			if(!item) return;
			state.editingId = item.id;
			if(modalTitleText) modalTitleText.textContent = `${label} 수정`;
			if(modalForm) modalForm.reset();
			if(modalTitleInput) modalTitleInput.value = String(item.title || '');
			if(modalAuthorInput) modalAuthorInput.value = String(item.author || '');
			if(modalTitleInput) modalTitleInput.focus();
			setModalOpen(modalEl, true);
		}

		function closeAddModal(){
			setModalOpen(modalEl, false);
			if(modalForm) modalForm.reset();
			state.editingId = null;
			if(modalTitleText) modalTitleText.textContent = `${label} 추가`;
			if(modalAuthorInput && currentUserName) modalAuthorInput.value = currentUserName;
		}

		async function submitAdd(evt){
			evt.preventDefault();
			if(!modalTitleInput) return;
			const title = modalTitleInput.value.trim();
			const author = modalAuthorInput ? modalAuthorInput.value.trim() : '';
			const wasEdit = !!state.editingId;
			if(!title){
				try{ if(typeof showToast === 'function') showToast('제목을 입력하세요.', 'warning'); }catch(_e){ alert('제목을 입력하세요.'); }
				modalTitleInput.focus();
				return;
			}
			try{
				if(state.editingId){
					await apiJson(`/api/insight/items/${state.editingId}`, {
						method:'PATCH',
						headers:{'Content-Type':'application/json','Accept':'application/json'},
						body: JSON.stringify({ title, author }),
					});
				}else{
					await apiJson('/api/insight/items', {
						method:'POST',
						headers:{'Content-Type':'application/json','Accept':'application/json'},
						body: JSON.stringify({ category, title, author }),
					});
				}
				closeAddModal();
				if(!wasEdit) state.page = 1;
				await load();
				try{ if(typeof showToast === 'function') showToast(wasEdit ? '수정되었습니다.' : '등록되었습니다.', 'success'); }catch(_e){}
			}catch(err){
				try{ if(typeof showToast === 'function') showToast(err.message || '등록 실패', 'error'); }catch(_e){ alert(err.message || '등록 실패'); }
			}
		}

		function handleView(id){
			const item = state.items.find(x => String(x.id) === String(id));
			if(!item) return;
			apiJson(`/api/insight/items/${id}/views`, { method:'POST', headers:{'Accept':'application/json'} })
				.then(data => {
					const updated = data && data.item;
					if(updated){
						const idx = state.items.findIndex(x => x.id === updated.id);
						if(idx >= 0){ state.items[idx] = updated; renderRows(); }
					}
				})
				.catch(()=>{});

			alert(`${label}\n\n제목: ${item.title || ''}\n작성자: ${item.author || ''}\n작성일: ${formatDate(item.created_at)}\n조회수: ${item.views ?? 0}\n좋아요: ${item.likes ?? 0}`);
		}

		// Bind events
		if(searchInput){
			searchInput.addEventListener('input', ()=>{
				setClearVisible();
				const v = searchInput.value.trim();
				if(searchTimer) clearTimeout(searchTimer);
				searchTimer = setTimeout(()=>{
					state.q = v;
					state.page = 1;
					load();
				}, 150);
			});
		}

		if(searchClear && searchInput){
			searchClear.addEventListener('click', ()=>{
				searchInput.value = '';
				setClearVisible();
				state.q = '';
				state.page = 1;
				load();
				searchInput.focus();
			});
		}

		if(pageSizeSel){
			pageSizeSel.addEventListener('change', ()=>{
				state.pageSize = parseInt(pageSizeSel.value, 10) || 10;
				state.page = 1;
				load();
			});
		}

		if(btnDownload) btnDownload.addEventListener('click', openDownloadConfirmModal);
		if(btnDelete) btnDelete.addEventListener('click', openDeleteConfirmModal);
		if(btnAdd) btnAdd.addEventListener('click', openAddModal);

		if(modalClose) modalClose.addEventListener('click', closeAddModal);
		if(modalEl){
			modalEl.addEventListener('click', (e)=>{ if(e.target === modalEl) closeAddModal(); });
		}

		if(deleteClose) deleteClose.addEventListener('click', ()=> closeModal('insight-delete-modal'));
		if(deleteModalEl){
			deleteModalEl.addEventListener('click', (e)=>{ if(e.target === deleteModalEl) closeModal('insight-delete-modal'); });
		}
		if(deleteConfirm) deleteConfirm.addEventListener('click', async ()=>{
			const ids = Array.isArray(state.pendingDeleteIds) ? state.pendingDeleteIds : getSelectedIds();
			closeModal('insight-delete-modal');
			await performBulkDelete(ids);
			state.pendingDeleteIds = [];
		});

		if(downloadClose) downloadClose.addEventListener('click', ()=> closeModal('insight-download-modal'));
		if(downloadModalEl){
			downloadModalEl.addEventListener('click', (e)=>{ if(e.target === downloadModalEl) closeModal('insight-download-modal'); });
		}
		if(downloadConfirm) downloadConfirm.addEventListener('click', async ()=>{
			const onlySelected = !!(csvOptSelected && csvOptSelected.checked);
			closeModal('insight-download-modal');
			try{
				await exportCsv(onlySelected);
			}catch(err){
				try{ if(typeof showToast === 'function') showToast(err.message || 'CSV 다운로드 실패', 'error'); }catch(_e){ alert(err.message || 'CSV 다운로드 실패'); }
			}
		});

		window.addEventListener('keydown', (e)=>{
			if(e.key !== 'Escape') return;
			if(modalEl && modalEl.classList.contains('show')) closeAddModal();
			if(deleteModalEl && deleteModalEl.classList.contains('show')) closeModal('insight-delete-modal');
			if(downloadModalEl && downloadModalEl.classList.contains('show')) closeModal('insight-download-modal');
		});

		if(modalForm) modalForm.addEventListener('submit', submitAdd);

		bindPaginationButtons();

		document.addEventListener('click', (e)=>{
			const btn = e.target.closest('[data-action]');
			if(!btn) return;
			const action = btn.getAttribute('data-action');
			const id = btn.getAttribute('data-id');
			if(action === 'edit'){
				e.preventDefault();
				const item = state.items.find(x => String(x.id) === String(id));
				openEditModal(item);
			}else if(action === 'view'){
				e.preventDefault();
				handleView(id);
			}
		});

		if(selectAll){
			selectAll.addEventListener('change', ()=>{
				const boxes = document.querySelectorAll('#insight-table-body .row-checkbox');
				boxes.forEach(b => { b.checked = !!selectAll.checked; });
				syncSelectAll();
			});
		}

		document.addEventListener('change', (e)=>{
			const t = e.target;
			if(!t) return;
			if(t.classList && t.classList.contains('row-checkbox')) syncSelectAll();
		});

		setClearVisible();
		if(modalAuthorInput && currentUserName) modalAuthorInput.value = currentUserName;

		load();
	}

	initInsightListPage();
})();
