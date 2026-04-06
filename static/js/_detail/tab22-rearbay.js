/*
 * tab22-rearbay.js
 * Rear bay tab behavior.
 */

(function(){
	// Utilities

	

	// SPA re-entry: 이전 sentinel 제거 → IIFE 전체 재정의
	if(window.BlossomTab22Rearbay) delete window.BlossomTab22Rearbay;

	
	try {
		document.documentElement.classList.add('sidebar-preload');
		var state = localStorage.getItem('sidebarState');
		var style = document.createElement('style');
		if(state === 'collapsed'){
			style.innerHTML = '.sidebar{width:70px !important} .main-content{margin-left:70px !important}';
		} else if(state === 'hidden'){
			style.innerHTML = '.sidebar{transform:translateX(-100%) !important;width:260px !important} .main-content{margin-left:0 !important}';
		} else {
			style.innerHTML = '';
		}
		try { if(document.head){ document.head.appendChild(style); } } catch(_){ }
	} catch(_){ }

	// Init

	

	

	

	function initHeader(){
		try{
			var params = new URLSearchParams(window.location.search || '');
			var work = params.get('work');
			var system = params.get('system');
			var assetId = params.get('asset_id') || params.get('assetId') || params.get('id');
			if(work || system){
				try{
					if(work != null) sessionStorage.setItem('frame:selected:work_name', work);
					if(system != null) sessionStorage.setItem('frame:selected:system_name', system);
				}catch(_e){}
			}
			if(assetId){
				try{ sessionStorage.setItem('frame:selected:asset_id', String(assetId)); }catch(_e0){ }
				try{ localStorage.setItem('frame:selected:asset_id', String(assetId)); }catch(_e1){ }
			}
			if(!work){ try{ work = sessionStorage.getItem('frame:selected:work_name') || '-'; }catch(_e2){ work='-'; } }
			if(!system){ try{ system = sessionStorage.getItem('frame:selected:system_name') || '-'; }catch(_e3){ system='-'; } }
			var h1 = document.querySelector('.page-header h1');
			var p = document.querySelector('.page-header p');
			if(h1) h1.textContent = String(work||'-');
			if(p) p.textContent = String(system||'-');

			
			try{
				if(params && (params.has('work') || params.has('system') || params.has('asset_id') || params.has('assetId') || params.has('id') || params.has('asset_scope'))){
					['work','system','asset_id','assetId','id','asset_scope'].forEach(function(k){ try{ params.delete(k); }catch(_){ } });
					var qs = params.toString();
					history.replaceState({}, '', location.pathname + (qs ? ('?' + qs) : '') + location.hash);
				}
			}catch(_stripErr){ }
		}catch(_){ }
	}

	function wireChosenSelects(){
		try{
			function wireChosen(id){
				var sel = document.getElementById(id); if(!sel) return;
				function apply(){ if(sel.value){ sel.classList.add('is-chosen'); } }
				sel.addEventListener('change', apply);
				apply();
			}
			['hw-page-size'].forEach(wireChosen);
		}catch(_){ }
	}

	function init(){
		
		try{ document.documentElement.classList.remove('sidebar-preload'); }catch(_){ }
		initHeader();
		wireChosenSelects();

		var table = document.getElementById('hw-spec-table');
		if(!table) return;

		var tableContext = (table.getAttribute('data-context')||'').trim();
		var pathName = ((typeof location!=='undefined' && location && location.pathname) || '').toLowerCase();
		var isRearBay = tableContext === 'rearbay' || /tab22-rearbay\.html$/.test(pathName);
		if(!isRearBay) return;

		var empty = document.getElementById('hw-empty');
		var infoEl = document.getElementById('hw-pagination-info');
		var numWrap = document.getElementById('hw-page-numbers');
		var btnFirst = document.getElementById('hw-first');
		var btnPrev = document.getElementById('hw-prev');
		var btnNext = document.getElementById('hw-next');
		var btnLast = document.getElementById('hw-last');

		var _root22 = document.querySelector('.tab22-bay-root') || document.querySelector('.main-content');
		var _rootData22 = (_root22 && _root22.dataset) ? _root22.dataset : {};

		var typeOptions = (_rootData22.typeOptions && _rootData22.typeOptions.trim())
			? _rootData22.typeOptions.split(',').map(function(s){ return s.trim(); })
			: ['SAN','네트워크'];
		var hasSpecCol = false;
		var bayCount = (_rootData22.bayCount && parseInt(_rootData22.bayCount, 10) > 0)
			? parseInt(_rootData22.bayCount, 10) : 8;

		
		var storagePrefix = (_rootData22.storagePrefix && _rootData22.storagePrefix.trim())
			? _rootData22.storagePrefix.trim()
			: (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'frame';
		function getPageKey(){
			try{
				var m = String(location.pathname||'').match(/\/p\/([^\/\?#]+)/);
				return m && m[1] ? decodeURIComponent(m[1]) : '';
			}catch(_){ return ''; }
		}
		function getScopeKey(){ return getPageKey() || storagePrefix; }
		function getAssetId(){
			try{
				var raw = sessionStorage.getItem(storagePrefix+':selected:row') || localStorage.getItem(storagePrefix+':selected:row');
				if(raw){
					var row = JSON.parse(raw);
					var id = row && (row.id != null ? row.id : row.asset_id);
					var n = parseInt(id, 10);
					if(!isNaN(n) && n > 0) return n;
				}
			}catch(_){ }
			try{
				var rawId = sessionStorage.getItem(storagePrefix+':selected:asset_id') || localStorage.getItem(storagePrefix+':selected:asset_id');
				if(rawId){ var n2 = parseInt(rawId, 10); if(!isNaN(n2) && n2 > 0) return n2; }
			}catch(_){ }
			try{
				var qs = new URLSearchParams(location.search||'');
				var cand = qs.get('asset_id') || qs.get('assetId') || qs.get('id');
				var nn = parseInt(cand, 10);
				if(!isNaN(nn) && nn > 0) return nn;
			}catch(_){ }
			return null;
		}

		var bayLogTag = 'tab22-rearbay';
		var _apiBase22 = (_rootData22.apiBase && _rootData22.apiBase.trim())
			? _rootData22.apiBase.trim() : '/api/hw-frame-rearbay';
		function apiBasePath(){ return _apiBase22; }

		function getRowId(tr){
			if(!tr) return null;
			var v = tr.dataset.rearbayId || tr.getAttribute('data-rearbay-id');
			var n = parseInt(v, 10);
			return (!isNaN(n) && n > 0) ? n : null;
		}
		function setRowId(tr, id){
			try{
				var n = parseInt(id, 10);
				if(isNaN(n) || n <= 0) return;
				tr.dataset.rearbayId = String(n);
				tr.setAttribute('data-rearbay-id', String(n));
			}catch(_){ }
		}

		function normalizeCellText(v){
			var s = String(v == null ? '' : v).trim();
			return s === '-' ? '' : s;
		}
		function readCell(tr, col){
			try{
				var td = tr.querySelector('[data-col="'+col+'"]');
				if(!td) return '';
				var inp = td.querySelector('input, textarea, select');
				var val = inp ? inp.value : (td.textContent || '');
				return normalizeCellText(val);
			}catch(_){ return ''; }
		}
		function escHtml(s){
			return String(s == null ? '' : s)
				.replace(/&/g,'&amp;')
				.replace(/</g,'&lt;')
				.replace(/>/g,'&gt;')
				.replace(/\"/g,'&quot;')
				.replace(/'/g,'&#39;');
		}

	// API

	

	

	

		async function apiList(scopeKey, assetId){
			var url = apiBasePath() + '?scope_key=' + encodeURIComponent(scopeKey) + '&asset_id=' + encodeURIComponent(String(assetId)) + '&page=1&page_size=5000';
			var r = await fetch(url, { method:'GET', headers:{'Accept':'application/json'} });
			var j = await r.json().catch(function(){ return null; });
			if(!r.ok){ throw new Error((j && j.error) ? j.error : ('HTTP '+r.status)); }
			return j;
		}
		async function apiCreate(payload){
			var r = await fetch(apiBasePath(), { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body: JSON.stringify(payload||{}) });
			var j = await r.json().catch(function(){ return null; });
			if(!r.ok){ throw new Error((j && j.error) ? j.error : ('HTTP '+r.status)); }
			return j;
		}
		async function apiUpdate(id, payload){
			var r = await fetch(apiBasePath() + '/' + encodeURIComponent(String(id)), { method:'PUT', headers:{'Content-Type':'application/json','Accept':'application/json'}, body: JSON.stringify(payload||{}) });
			var j = await r.json().catch(function(){ return null; });
			if(!r.ok){ throw new Error((j && j.error) ? j.error : ('HTTP '+r.status)); }
			return j;
		}
		async function apiDelete(id){
			var r = await fetch(apiBasePath() + '/' + encodeURIComponent(String(id)), { method:'DELETE', headers:{'Accept':'application/json'} });
			var j = await r.json().catch(function(){ return null; });
			if(!r.ok){ throw new Error((j && j.error) ? j.error : ('HTTP '+r.status)); }
			return j;
		}

		function renderSavedRow(item){
			var tr = document.createElement('tr');
			if(item && item.id != null) setRowId(tr, item.id);
			tr.innerHTML = [
				'<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>',
				'<td data-col="type">'+escHtml(item && item.type ? item.type : '-')+'</td>',
				'<td data-col="space">'+escHtml(item && item.space ? item.space : '-')+'</td>',
				'<td data-col="work_name">'+escHtml(item && item.work_name ? item.work_name : '-')+'</td>',
				'<td data-col="system_name">'+escHtml(item && item.system_name ? item.system_name : '-')+'</td>',
				'<td data-col="vendor">'+escHtml(item && item.vendor ? item.vendor : '-')+'</td>',
				'<td data-col="model">'+escHtml(item && item.model ? item.model : '-')+'</td>',
				'<td data-col="serial">'+escHtml(item && item.serial ? item.serial : '-')+'</td>',
				'<td data-col="remark">'+escHtml(item && item.remark ? item.remark : '-')+'</td>',
				'<td class="system-actions table-actions">'
					+'<button class="action-btn js-hw-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'
					+'<button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
				+'</td>'
			].join('');
			return tr;
		}

		function hasBayApiContext(){
			var scopeKey = getScopeKey();
			var assetId = getAssetId();
			return !!(scopeKey && assetId);
		}

		


		async function loadFromBayApi(){
			if(!hasBayApiContext()) return;
			var scopeKey = getScopeKey();
			var assetId = getAssetId();
			try{
				var data = await apiList(scopeKey, assetId);
				var items = (data && data.items) ? data.items : [];
				var tbody = table.querySelector('tbody');
				if(!tbody) return;
				tbody.innerHTML = '';
				items.forEach(function(it){ tbody.appendChild(renderSavedRow(it)); });
				updateEmptyState();
			}catch(err){
				try{ console.error('['+bayLogTag+'] load failed', err); }catch(_){ }
				updateEmptyState();
			}
		}
		async function persistBayRow(tr){
			if(!hasBayApiContext()) return;
			if(!tr) return;
			var scopeKey = getScopeKey();
			var assetId = getAssetId();
			if(!scopeKey || !assetId) return;
			var payload = {
				scope_key: scopeKey,
				asset_id: assetId,
				type: readCell(tr, 'type'),
				space: readCell(tr, 'space'),
				work_name: readCell(tr, 'work_name'),
				system_name: readCell(tr, 'system_name'),
				vendor: readCell(tr, 'vendor'),
				model: readCell(tr, 'model'),
				serial: readCell(tr, 'serial'),
				remark: readCell(tr, 'remark')
			};
			try{
				var existingId = getRowId(tr);
				var saved = existingId ? await apiUpdate(existingId, payload) : await apiCreate(payload);
				if(saved && saved.id != null) setRowId(tr, saved.id);
			}catch(err){
				try{ console.error('['+bayLogTag+'] save failed', err); }catch(_){ }
			}
		}
		async function deleteBayRow(tr){
			if(!hasBayApiContext()) return;
			if(!tr) return;
			var id = getRowId(tr);
			if(!id) return;
			try{ await apiDelete(id); }
			catch(err){ try{ console.error('['+bayLogTag+'] delete failed', err); }catch(_){ } }
		}


	// Pagination

	

		
		var hwState = { page:1, 
	

	
pageSize:10 };
		(function initPageSize(){
			try{
				var saved = localStorage.getItem('onpremise:hw:pageSize');
				var sel = document.getElementById('hw-page-size');
				if(sel){
					if(saved && ['10','20','50','100'].indexOf(saved)>-1){ hwState.pageSize = parseInt(saved,10); sel.value = saved; }
					sel.addEventListener('change', function(){
						var v=parseInt(sel.value,10);
						if(!isNaN(v)){
							hwState.page=1; hwState.pageSize=v;
							localStorage.setItem('onpremise:hw:pageSize', String(v));
							hwRenderPage();
						}
					});
				}
			}catch(_){ }
		})();
		function hwRows(){ var tbody=table.querySelector('tbody'); return tbody? Array.from(tbody.querySelectorAll('tr')): []; }
		function hwTotal(){ return hwRows().length; }
		function hwPages(){ var total=hwTotal(); return Math.max(1, Math.ceil(total / hwState.pageSize)); }
		function hwClampPage(){ var pages=hwPages(); if(hwState.page>pages) hwState.page=pages; if(hwState.page<1) hwState.page=1; }
		function hwUpdatePaginationUI(){
			if(infoEl){
				var total=hwTotal();
				var start = total? (hwState.page-1)*hwState.pageSize+1 : 0;
				var end = Math.min(total, hwState.page*hwState.pageSize);
				infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목';
			}
			if(numWrap){
				var pages=hwPages();
				numWrap.innerHTML='';
				for(var p=1;p<=pages && p<=50;p++){
					var b=document.createElement('button');
					b.className='page-btn'+(p===hwState.page?' active':'');
					b.textContent=String(p);
					b.dataset.page=String(p);
					numWrap.appendChild(b);
				}
			}
			var pages2=hwPages();
			if(btnFirst) btnFirst.disabled=(hwState.page===1);
			if(btnPrev) btnPrev.disabled=(hwState.page===1);
			if(btnNext) btnNext.disabled=(hwState.page===pages2);
			if(btnLast) btnLast.disabled=(hwState.page===pages2);

			var sizeSel=document.getElementById('hw-page-size');
			if(sizeSel){
				var none=(hwTotal()===0);
				sizeSel.disabled=none;
				if(none){ try{ sizeSel.value='10'; hwState.pageSize=10; }catch(_){ } }
			}
		}
		function hwRenderPage(){
			hwClampPage();
			var rows = hwRows();
			var startIdx = (hwState.page-1)*hwState.pageSize;
			var endIdx = startIdx + hwState.pageSize - 1;
			rows.forEach(function(tr, idx){
				var visible = idx>=startIdx && idx<=endIdx;
				tr.style.display = visible? '' : 'none';
				if(visible){ tr.removeAttribute('data-hidden'); } else { tr.setAttribute('data-hidden','1'); }
				var cb = tr.querySelector('.hw-row-check');
				if(cb){ tr.classList.toggle('selected', !!cb.checked && visible); }
			});
			hwUpdatePaginationUI();
			var sa = document.getElementById('hw-select-all');
			if(sa){
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check');
				sa.checked = visChecks.length ? Array.prototype.every.call(visChecks, function(c){ return c.checked; }) : false;
			}
		}
		function hwGo(p){ hwState.page=p; hwRenderPage(); }
		function hwGoDelta(d){ hwGo(hwState.page + d); }
		function hwGoFirst(){ hwGo(1); }
		function hwGoLast(){ hwGo(hwPages()); }
		if(numWrap){ numWrap.addEventListener('click', function(e){ var b=e.target.closest('button.page-btn'); if(!b) return; var p=parseInt(b.dataset.page,10); if(!isNaN(p)) hwGo(p); }); }
		if(btnFirst) btnFirst.addEventListener('click', hwGoFirst);
		if(btnPrev) btnPrev.addEventListener('click', function(){ hwGoDelta(-1); });
		if(btnNext) btnNext.addEventListener('click', function(){ hwGoDelta(1); });
		if(btnLast) btnLast.addEventListener('click', hwGoLast);

		function updateEmptyState(){
			try{
				var hasRows = table.querySelector('tbody tr') != null;
				if(empty){ empty.hidden = !!hasRows; empty.style.display = hasRows ? 'none' : ''; }
			}catch(_){ if(empty){ empty.hidden=false; empty.style.display=''; } }

			var csvBtn = document.getElementById('hw-download-btn');
			if(csvBtn){
				var has = !!table.querySelector('tbody tr');
				csvBtn.disabled = !has;
				csvBtn.setAttribute('aria-disabled', (!has).toString());
				csvBtn.title = has? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
			}
			hwRenderPage();
		}
		updateEmptyState();

		
		var addBtn = document.getElementById('hw-row-add');
		if(addBtn){
			addBtn.addEventListener('click', function(){
				var tbody = table.querySelector('tbody');
				var tr = document.createElement('tr');
				var bayOptions = (function(){
					var opts = [];
					for(var i=1;i<=bayCount;i++) opts.push('<option value="BAY'+i+'">BAY'+i+'</option>');
					return opts.join('');
				})();
				tr.innerHTML = [
					'<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>',
					'<td data-col="type">',
						'<select class="search-select" data-searchable-scope="page" title="유형">',
							'<option value="" selected disabled>유형</option>',
							typeOptions.map(function(o){ return '<option value="'+o+'">'+o+'</option>'; }).join(''),
						'</select>',
					'</td>',
					'<td data-col="space">',
						'<select class="search-select" data-searchable-scope="page" title="공간">',
							'<option value="" selected disabled>공간</option>',
							bayOptions,
						'</select>',
					'</td>',
					'<td data-col="work_name">',
						'<select class="search-select bay-work-select" data-searchable-scope="page" title="업무 이름" data-placeholder="업무 이름">',
							'<option value="" selected disabled>업무 이름</option>',
						'</select>',
					'</td>',
					'<td data-col="system_name">-</td>',
					'<td data-col="vendor">-</td>',
					'<td data-col="model">-</td>',
					'<td data-col="serial">-</td>',
					'<td data-col="remark"><input type="text" placeholder="비고"></td>',
					'<td class="system-actions table-actions">'
						+'<button class="action-btn js-hw-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>'
						+'<button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
					+'</td>'
				].join('');
				tbody.appendChild(tr);
				try{ if(window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance) window.BlossomSearchableSelect.enhance(tr); }catch(_){}
				loadWorkGroupOptions(tr);
				try{ hwGoLast(); }catch(_){ }
				updateEmptyState();
			});
		}

		// ── 유형→asset_type 매핑 및 업무 이름/시스템 이름 캐스케이딩 ──
		var _typeToAssetType = { 'SAN': 'SWITCH,DIRECTOR', '네트워크': 'L2,L4,L7' };
		var _workNameCache = {}; // key: asset_type
		function fetchWorkNames(assetType){
			var at = assetType || 'ON_PREMISE';
			if(_workNameCache[at]) return Promise.resolve(_workNameCache[at]);
			return fetch('/api/hardware-assets/bay-server-lookup?asset_type=' + encodeURIComponent(at), { method:'GET', headers:{'Accept':'application/json'} })
				.then(function(r){ return r.json(); })
				.then(function(d){
					_workNameCache[at] = (d && d.items) ? d.items : [];
					return _workNameCache[at];
				})
				.catch(function(){ _workNameCache[at] = []; return []; });
		}
		function fetchServersByWork(workName, assetType){
			var at = assetType || 'ON_PREMISE';
			return fetch('/api/hardware-assets/bay-server-lookup?asset_type=' + encodeURIComponent(at) + '&work_name=' + encodeURIComponent(String(workName)), { method:'GET', headers:{'Accept':'application/json'} })
				.then(function(r){ return r.json(); })
				.then(function(d){ return (d && d.items) ? d.items : []; })
				.catch(function(){ return []; });
		}
		function getAssetTypeFromRow(tr){
			var tTd = tr.querySelector('[data-col="type"]');
			if(!tTd) return 'ON_PREMISE';
			var sel = tTd.querySelector('select');
			var val = sel ? sel.value : (tTd.textContent||'').trim();
			return _typeToAssetType[val] || 'ON_PREMISE';
		}
		function autoFillServerInfo(tr, item){
			var snTd = tr.querySelector('[data-col="system_name"]');
			var vTd = tr.querySelector('[data-col="vendor"]');
			var mTd = tr.querySelector('[data-col="model"]');
			var sTd = tr.querySelector('[data-col="serial"]');
			if(snTd) snTd.textContent = item.system_name || '-';
			if(vTd) vTd.textContent = item.manufacturer_name || '-';
			if(mTd) mTd.textContent = item.model_name || '-';
			if(sTd) sTd.textContent = item.serial_number || '-';
		}
		function loadWorkGroupOptions(tr){
			var wSel = tr.querySelector('[data-col="work_name"] select');
			if(!wSel) return;

			function reloadForType(){
				var at = getAssetTypeFromRow(tr);
				wSel.innerHTML = '<option value="" selected disabled>업무 이름</option>';
				autoFillServerInfo(tr, {});
				fetchWorkNames(at).then(function(items){
					items.forEach(function(g){
						var o = document.createElement('option');
						o.value = g.work_name || '';
						o.textContent = g.work_name || '';
						wSel.appendChild(o);
					});
					try{ if(window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance) window.BlossomSearchableSelect.enhance(tr); }catch(_){}
				});
			}

			var tSel = tr.querySelector('[data-col="type"] select');
			if(tSel){ tSel.addEventListener('change', reloadForType); }

			reloadForType();

			wSel.addEventListener('change', function(){
				var at = getAssetTypeFromRow(tr);
				var workVal = wSel.value || '';
				autoFillServerInfo(tr, {});
				if(!workVal) return;
				fetchServersByWork(workVal, at).then(function(systems){
					if(systems.length > 0){
						var s = systems[0];
						autoFillServerInfo(tr, {
							system_name: s.system_name || '',
							manufacturer_name: s.manufacturer_name || '',
							model_name: s.model_name || '',
							serial_number: s.serial_number || ''
						});
					}
				});
			});
		}

		// ── Delete-confirmation modal ──
		var _hwPendingDeleteTr = null;
		var _hwDeleteCallback = null;
		function hwOpenDeleteModal(tr, onConfirm){
			_hwPendingDeleteTr = tr;
			_hwDeleteCallback = onConfirm || null;
			var msgEl = document.getElementById('hw-delete-msg');
			if(msgEl) msgEl.textContent = '이 하드웨어 구성을 삭제하시겠습니까?';
			var modal = document.getElementById('hw-delete-modal');
			if(modal){ document.body.classList.add('modal-open'); modal.classList.add('show'); modal.setAttribute('aria-hidden','false'); }
		}
		function hwCloseDeleteModal(){
			_hwPendingDeleteTr = null;
			_hwDeleteCallback = null;
			var modal = document.getElementById('hw-delete-modal');
			if(modal){ modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open'); }
		}
		function hwPerformDelete(){
			var tr = _hwPendingDeleteTr;
			var cb = _hwDeleteCallback;
			hwCloseDeleteModal();
			if(cb){ cb(tr); }
		}
		(function wireDeleteModal(){
			var modal = document.getElementById('hw-delete-modal'); if(!modal) return;
			var confirmBtn = document.getElementById('hw-delete-confirm');
			var cancelBtn  = document.getElementById('hw-delete-cancel');
			var closeBtn   = document.getElementById('hw-delete-close');
			if(confirmBtn) confirmBtn.addEventListener('click', hwPerformDelete);
			if(cancelBtn)  cancelBtn.addEventListener('click', hwCloseDeleteModal);
			if(closeBtn)   closeBtn.addEventListener('click', hwCloseDeleteModal);
			modal.addEventListener('click', function(e){ if(e.target === modal) hwCloseDeleteModal(); });
			document.addEventListener('keydown', function(e){
				try{ if(e.key === 'Escape' && modal.classList.contains('show')) hwCloseDeleteModal(); }catch(_){ }
			});
		})();

		
		table.addEventListener('click', function(ev){
			var target = ev.target.closest('.js-hw-del, .js-hw-edit, .js-hw-commit, .js-hw-toggle');
			if(!target) return;
			var tr = ev.target.closest('tr');
			if(!tr) return;

			if(target.classList.contains('js-hw-del')){
				hwOpenDeleteModal(tr, function(delTr){
					if(!delTr) return;
					var tbody = delTr.parentNode;
					function removeRow(){
						try{ if(delTr && tbody) tbody.removeChild(delTr); }catch(_){ }
						try{ hwClampPage(); }catch(_){ }
						updateEmptyState();
					}
					var rid = getRowId(delTr);
					if(rid){ deleteBayRow(delTr).then(removeRow); return; }
					removeRow();
				});
				return;
			}

			
			if(target.classList.contains('js-hw-edit') || (target.classList.contains('js-hw-toggle') && target.getAttribute('data-action') === 'edit')){
				function toInput(name){
					var td = tr.querySelector('[data-col="'+name+'"]');
					if(!td) return;
					var current = (td.textContent||'').trim();
					if(current === '-') current = '';
					if(name==='type'){
						var options = ['<option value=""'+(current?'':' selected')+' disabled>유형</option>']
							.concat(typeOptions.map(function(o){ return '<option value="'+o+'"'+(o===current?' selected':'')+'>'+o+'</option>'; }))
							.join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" title="유형">'+options+'</select>';
						return;
					}
					if(name==='space'){
						var bays = Array.from({length: bayCount}, function(_,i){ return 'BAY'+(i+1); });
						var opt2 = ['<option value=""'+(current?'':' selected')+' disabled>공간</option>']
							.concat(bays.map(function(o){ return '<option value="'+o+'"'+(o===current?' selected':'')+'>'+o+'</option>'; }))
							.join('');
						td.innerHTML = '<select class="search-select" data-searchable-scope="page" title="공간">'+opt2+'</select>';
						return;
					}
					if(name==='work_name'){
						td.innerHTML = '<select class="search-select bay-work-select" data-searchable-scope="page" title="업무 이름" data-placeholder="업무 이름"><option value="" disabled>업무 이름</option></select>';
						var wSel = td.querySelector('select');
						var at = getAssetTypeFromRow(tr);
						fetchWorkNames(at).then(function(items){
							items.forEach(function(g){
								var o = document.createElement('option');
								o.value = g.work_name || '';
								o.textContent = g.work_name || '';
								if(o.value === current) o.selected = true;
								wSel.appendChild(o);
							});
							if(!current){ wSel.querySelector('option[disabled]').selected = true; }
							try{ if(window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance) window.BlossomSearchableSelect.enhance(tr); }catch(_){}
							wSel.addEventListener('change', function(){
								var editAt = getAssetTypeFromRow(tr);
								var workVal = wSel.value || '';
								autoFillServerInfo(tr, {});
								if(!workVal) return;
								fetchServersByWork(workVal, editAt).then(function(systems){
									if(systems.length > 0){
										var s = systems[0];
										autoFillServerInfo(tr, {
											system_name: s.system_name || '',
											manufacturer_name: s.manufacturer_name || '',
											model_name: s.model_name || '',
											serial_number: s.serial_number || ''
										});
									}
								});
							});
							if(current) wSel.dispatchEvent(new Event('change'));
						});
						return;
					}
					if(name==='system_name' || name==='vendor' || name==='model' || name==='serial'){
						return;
					}
					td.innerHTML = '<input type="text" value="'+escHtml(current)+'">';
				}
				var editCols = ['type','space','work_name','system_name','vendor','model','serial','remark'];
				editCols.forEach(toInput);
				try{ if(window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance) window.BlossomSearchableSelect.enhance(tr); }catch(_){}

				var toggleBtn = tr.querySelector('.js-hw-toggle');
				if(toggleBtn){
					toggleBtn.setAttribute('data-action', 'save');
					toggleBtn.title = '저장';
					toggleBtn.setAttribute('aria-label','저장');
					toggleBtn.innerHTML = '<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
				}
				return;
			}

			
			if(target.classList.contains('js-hw-commit') || (target.classList.contains('js-hw-toggle') && target.getAttribute('data-action') === 'save')){
				function getInput(name){
					var td = tr.querySelector('[data-col="'+name+'"]');
					if(!td) return null;
					return td.querySelector('input, textarea');
				}
				function setError(input, on){
					if(!input) return;
					if(on){ input.classList.add('input-error'); input.setAttribute('aria-invalid','true'); }
					else { input.classList.remove('input-error'); input.removeAttribute('aria-invalid'); }
				}

				var firstInvalid = null;
				var modelInput = getInput('model');
				var modelVal = (modelInput? modelInput.value : (tr.querySelector('[data-col="model"]').textContent||'')).trim();
				if(!modelVal){ setError(modelInput, true); if(!firstInvalid) firstInvalid = modelInput; } else { setError(modelInput, false); }

				var typeInput = (function(){ var td = tr.querySelector('[data-col="type"]'); return td? td.querySelector('select'): null; })();
				var typeVal = (typeInput? typeInput.value : (tr.querySelector('[data-col="type"]').textContent||'')).trim();
				if(!typeVal){ setError(typeInput, true); if(!firstInvalid) firstInvalid = typeInput; } else { setError(typeInput, false); }

				var spaceInput = (function(){ var td = tr.querySelector('[data-col="space"]'); return td? td.querySelector('select'): null; })();
				var spaceVal = (spaceInput? spaceInput.value : (tr.querySelector('[data-col="space"]').textContent||'')).trim();
				if(!spaceVal){ setError(spaceInput, true); if(!firstInvalid) firstInvalid = spaceInput; } else { setError(spaceInput, false); }

				if(firstInvalid){ try{ firstInvalid.focus(); }catch(_e){} return; }

				function commit(name, val){
					var td = tr.querySelector('[data-col="'+name+'"]');
					if(!td) return;
					td.textContent = (val === '' || val == null)? '-' : String(val);
				}
				function read(name){
					var inp = getInput(name);
					var v = (inp? inp.value : (tr.querySelector('[data-col="'+name+'"]').textContent||''));
					return String(v).trim();
				}

				commit('type', typeVal);
				commit('space', spaceVal);
				var workSel = (function(){ var td = tr.querySelector('[data-col="work_name"]'); return td? td.querySelector('select'): null; })();
				commit('work_name', workSel ? workSel.value : read('work_name'));
				var sysSel = (function(){ var td = tr.querySelector('[data-col="system_name"]'); return td? td.querySelector('select'): null; })();
				commit('system_name', sysSel ? sysSel.value : read('system_name'));
				commit('vendor', read('vendor'));
				commit('model', modelVal);
				commit('serial', read('serial'));
				commit('remark', read('remark'));

				var toggleBtn2 = tr.querySelector('.js-hw-toggle');
				if(toggleBtn2){
					toggleBtn2.setAttribute('data-action', 'edit');
					toggleBtn2.title = '편집';
					toggleBtn2.setAttribute('aria-label','편집');
					toggleBtn2.innerHTML = '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
				}
				updateEmptyState();
				var cb = tr.querySelector('.hw-row-check');
				if(cb){ var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cb.checked && !hidden); }
				persistBayRow(tr);
				return;
			}
		});

		
		table.addEventListener('click', function(ev){
			var tr = ev.target.closest('tr');
			if(!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase()!=='tbody') return;
			var isControl = ev.target.closest('button, a, input, select, textarea, label');
			var onCheckbox = ev.target.closest('input[type="checkbox"].hw-row-check');
			if(isControl && !onCheckbox) return;
			if(onCheckbox) return;
			var cb = tr.querySelector('.hw-row-check');
			if(!cb || cb.disabled) return;
			if(tr.hasAttribute('data-hidden') || tr.style.display==='none') return;
			cb.checked = !cb.checked;
			tr.classList.toggle('selected', cb.checked);
			var sa = document.getElementById('hw-select-all');
			if(sa){
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check');
				sa.checked = visChecks.length ? Array.prototype.every.call(visChecks, function(c){ return c.checked; }) : false;
			}
		});
		table.addEventListener('change', function(ev){
			var cb=ev.target.closest('.hw-row-check');
			if(!cb || cb.disabled) return;
			var tr=cb.closest('tr');
			if(tr){ var hidden=tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cb.checked && !hidden); }
			var sa=document.getElementById('hw-select-all');
			if(sa){
				var visChecks=table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check');
				sa.checked = visChecks.length ? Array.prototype.every.call(visChecks, function(c){ return c.checked; }) : false;
			}
		});

	// CSV

	

	

	

		
		function hwEscapeCSV(val){ return '"' + String(val == null ? '' : val).replace(/"/g,'""') + '"'; }
		function hwRowSaved(tr){
			var t=tr.querySelector('.js-hw-toggle');
			var inEdit=t && t.getAttribute('data-action')==='save';
			if(inEdit) return false;
			return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
		}
		function hwVisibleRows(){
			var tbody=table.querySelector('tbody');
			if(!tbody) return [];
			return Array.from(tbody.querySelectorAll('tr')).filter(function(tr){ return !(tr.hasAttribute('data-hidden') || tr.style.display==='none'); });
		}
		function hwSavedVisibleRows(){ return hwVisibleRows().filter(hwRowSaved); }
		function hwExportCSV(onlySelected){
			var headers = ['유형','공간','업무 이름','시스템 이름','제조사','모델명','일련번호','비고'];
			var trs = hwSavedVisibleRows();
			if(onlySelected){ trs = trs.filter(function(tr){ var cb = tr.querySelector('.hw-row-check'); return cb && cb.checked; }); }
			if(!trs.length) return;
			function text(tr, col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td? String(td.textContent||'').trim(): ''; }
			var baseCols = ['type','space','work_name','system_name','vendor','model','serial','remark'];
			var rows = trs.map(function(tr){ return baseCols.map(function(c){ return text(tr,c); }); });
			var lines = [headers].concat(rows).map(function(arr){ return arr.map(hwEscapeCSV).join(','); });
			var csv = '\uFEFF' + lines.join('\r\n');
			var d=new Date();
			var yyyy=d.getFullYear();
			var mm=String(d.getMonth()+1).padStart(2,'0');
			var dd=String(d.getDate()).padStart(2,'0');
			var filename = 'hardware_'+yyyy+mm+dd+'.csv';
			try{
				var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
				var url=URL.createObjectURL(blob);
				var a=document.createElement('a');
				a.href=url; a.download=filename;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			}catch(_){
				var a2=document.createElement('a');
				a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
				a2.download=filename;
				document.body.appendChild(a2);
				a2.click();
				document.body.removeChild(a2);
			}
		}
		(function(){
			var btn = document.getElementById('hw-download-btn');
			var modalEl = document.getElementById('hw-download-modal');
			var closeBtn = document.getElementById('hw-download-close');
			var confirmBtn = document.getElementById('hw-download-confirm');

	// Modal

	

	

	
			function openModalLocal(){ if(!modalEl) return; document.body.classList.add('modal-open'); modalEl.classList.add('show'); modalEl.setAttribute('aria-hidden','false'); }
			function closeModalLocal(){ if(!modalEl) return; modalEl.classList.remove('show'); modalEl.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open'); }
			if(btn){
				btn.addEventListener('click', function(){
					if(btn.disabled) return;
					var saved = hwSavedVisibleRows();
					var total = saved.length;
					if(total<=0) return;
					var selectedCount = saved.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; }).length;
					var subtitle=document.getElementById('hw-download-subtitle');
					if(subtitle){ subtitle.textContent = selectedCount>0 ? ('선택된 '+selectedCount+'개 또는 전체 '+total+'개 결과 중 범위를 선택하세요.') : ('현재 결과 '+total+'개 항목을 CSV로 내보냅니다.'); }
					var rowSelectedWrap=document.getElementById('hw-csv-range-row-selected');
					var optSelected=document.getElementById('hw-csv-range-selected');
					var optAll=document.getElementById('hw-csv-range-all');
					if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount>0);
					if(optSelected){ optSelected.disabled = !(selectedCount>0); optSelected.checked = selectedCount>0; }
					if(optAll){ optAll.checked = !(selectedCount>0); }
					openModalLocal();
				});
			}
			if(closeBtn){ closeBtn.addEventListener('click', closeModalLocal); }
			if(modalEl){
				modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(); });
				document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(); });
			}
			if(confirmBtn){ confirmBtn.addEventListener('click', function(){
				var onlySel = !!(document.getElementById('hw-csv-range-selected') && document.getElementById('hw-csv-range-selected').checked);
				hwExportCSV(onlySel);
				closeModalLocal();
			}); }
		})();

		
		loadFromBayApi();
	}

	window.BlossomTab22Rearbay = { init: init };

	if(document && document.readyState && document.readyState !== 'loading') init();
	else document.addEventListener('DOMContentLoaded', init);
})();

