/*
 * tab01-hardware.js
 * Hardware detail tab behavior.
 */

(function(){
	'use strict';

	// Utilities
	if(typeof window === 'undefined') return;
	// SPA re-entry: 이전 sentinel 제거 → IIFE 전체 재정의
	if(window.BlossomTab01Hardware) delete window.BlossomTab01Hardware;

	function hwTrim(v){ return String(v == null ? '' : v).trim(); }
	function hwEscapeHtml(s){
		return String(s == null ? '' : s)
			.replace(/&/g,'&amp;')
			.replace(/</g,'&lt;')
			.replace(/>/g,'&gt;')
			.replace(/"/g,'&quot;')
			.replace(/'/g,'&#39;');
	}
	function byId(id){ try{ return document.getElementById(id); }catch(_){ return null; } }
	function safeJsonParse(raw){ try{ return JSON.parse(raw); }catch(_e){ return null; } }
	function firstNonEmpty(list){
		for(var i=0;i<(list||[]).length;i++){
			var v = list[i];
			if(v != null && String(v).trim() !== '') return String(v).trim();
		}
		return '';
	}
	function hwNotify(title, msg){
		try{
			if(window.notify) return window.notify(msg, title);
		}catch(_){ }
		try{ window.alert((title? (title + ': ') : '') + String(msg||'')); }catch(_e){ }
	}

	function hwGetStorage(storage, key){
		try{ return storage && storage.getItem ? storage.getItem(key) : null; }catch(_){ return null; }
	}

	// --- Server hardware tab: system-row maintenance is derived from tab61 ---
	var __hwTab01SystemMaintenanceCache = Object.create(null);
	var __hwTab01SystemMaintenanceInFlight = Object.create(null);
	var __hwRoleSelection = {}; // hardwareId -> array of selected role values

	function hwNormType(v){
		return hwTrim(v || '').toUpperCase();
	}

	function hwNormMatchText(v){
		var s = hwTrim(v == null ? '' : v);
		if(s === '-' || s === '—') s = '';
		// collapse whitespace and compare case-insensitively
		s = s.replace(/\s+/g, ' ').toLowerCase();
		return s;
	}

	function hwGetRowColValue(tr, col){
		try{
			var td = tr && tr.querySelector ? tr.querySelector('[data-col="'+col+'"]') : null;
			if(!td) return '';
			var el = td.querySelector ? td.querySelector('input, select, textarea') : null;
			if(el) return hwTrim(el.value);
			return hwTrim(td.textContent || '');
		}catch(_e){
			return '';
		}
	}

	function hwContractStatusRank(statusText){
		var cls = hwContractStatusClass(statusText);
		if(cls === 'is-active') return 40;
		if(cls === 'is-planned') return 30;
		if(cls === 'is-expired') return 20;
		if(cls === 'is-canceled') return 10;
		return 0;
	}

	function hwGetRowTypeValue(tr){
		try{
			var td = tr && tr.querySelector ? tr.querySelector('[data-col="type"]') : null;
			if(!td) return '';
			var sel = td.querySelector ? td.querySelector('select') : null;
			if(sel) return hwTrim(sel.value || '');
			return hwTrim(td.textContent || '');
		}catch(_e){
			return '';
		}
	}

	function hwContractStatusClass(statusText){
		var s = hwTrim(statusText || '');
		if(!s) return 'is-unknown';
		// normalize common Korean labels
		if(/예정/.test(s)) return 'is-planned';
		if(/만료|종료/.test(s)) return 'is-expired';
		if(/해지|취소/.test(s)) return 'is-canceled';
		if(/계약|유지/.test(s)) return 'is-active';
		return 'is-unknown';
	}

	function hwSetMaintenanceCellText(tr, text, contractStatus){
		try{
			if(!tr) return;
			var td = tr.querySelector('[data-col="maintenance"]');
			if(!td) return;
			var t = hwTrim(text || '');
			var finalText = t ? t : '-';
			var ro = td.querySelector('.hw-readonly[data-readonly="1"]');
			if(finalText === '-'){
				if(ro) ro.textContent = finalText;
				else td.textContent = finalText;
				try{ td.setAttribute('data-readonly','1'); }catch(_e0){ }
				return;
			}
			var statusText = hwTrim(contractStatus || '');
			var cls = hwContractStatusClass(statusText);
			var dot = '<span class="hw-maint-status-dot ' + cls + '" aria-hidden="true"'
				+ (statusText ? (' title="' + hwEscapeHtml(statusText) + '"') : '')
				+ '></span>';
			var html = '<span class="hw-maint-status">' + dot + '<span class="hw-maint-code">' + hwEscapeHtml(finalText) + '</span></span>';
			if(ro) ro.innerHTML = html;
			else td.innerHTML = html;
			try{ td.setAttribute('data-readonly','1'); }catch(_e0){ }
		}catch(_e){ }
	}

	function hwApplyTab61MaintenanceToRows(tab61LinesOrManageNo, contractStatus){
		try{
			var table = document.getElementById('hw-spec-table');
			if(!table) return;
			var tbody = table.querySelector('tbody');
			if(!tbody) return;
			var rows = tbody.querySelectorAll('tr');

			// Strict policy: only apply manage_no based on per-row matching lines.
			// If backend doesn't provide lines, do not fill any row (prevents wrong system-row-only mapping).
			if(!Array.isArray(tab61LinesOrManageNo)){
				Array.prototype.forEach.call(rows, function(tr){
					try{ hwSetMaintenanceCellText(tr, '-'); }catch(_eRow0){ }
				});
				try{ console.warn('[tab01-hardware] tab61 maintenance: missing lines[]; strict mapping skipped'); }catch(_eW){ }
				return;
			}

			var lines = tab61LinesOrManageNo || [];
			Array.prototype.forEach.call(rows, function(tr){
				try{
					var rowType = hwNormMatchText(hwGetRowColValue(tr, 'type'));
					var rowVendor = hwNormMatchText(hwGetRowColValue(tr, 'vendor'));
					var rowModel = hwNormMatchText(hwGetRowColValue(tr, 'model'));
					var rowSerial = hwNormMatchText(hwGetRowColValue(tr, 'serial'));

					var best = null;
					var bestRank = -1;
					for(var i=0;i<lines.length;i++){
						var ln = lines[i] || {};
						// Strict match: contract_type/vendor/model/serial must all equal.
						if(hwNormMatchText(ln.contract_type) !== rowType) continue;
						if(hwNormMatchText(ln.contract_vendor) !== rowVendor) continue;
						if(hwNormMatchText(ln.contract_model) !== rowModel) continue;
						if(hwNormMatchText(ln.contract_serial) !== rowSerial) continue;
						var r = hwContractStatusRank(ln.contract_status);
						if(r > bestRank){ bestRank = r; best = ln; }
					}

					if(best && hwTrim(best.manage_no)){
						hwSetMaintenanceCellText(tr, best.manage_no, best.contract_status || '');
					}else{
						hwSetMaintenanceCellText(tr, '-');
					}
				}catch(_eRow){ }
			});
		}catch(_e){ }
	}

	function hwGetPageKey(){
		try{
			var path = String(location.pathname || '');
			var m = path.match(/\/p\/([^\/?#]+)/);
			return (m && m[1]) ? decodeURIComponent(m[1]) : '';
		}catch(_e){
			return '';
		}
	}

	function hwIsServerHardwareTabPage(){
		try{
			if(document && document.body && document.body.classList && document.body.classList.contains('page-server-hardware-tab')) return true;
			var pageKey = hwGetPageKey();
			if(pageKey && /^hw_server_/i.test(pageKey)) return true;
			var path = String(location && location.pathname ? location.pathname : '');
			if(/^\/hardware\/server(\/|$)/i.test(path)) return true;
			try{
				var h1 = document && document.querySelector ? document.querySelector('h1') : null;
				if(h1 && /HARDWARE\s*-\s*SERVER/i.test(String(h1.textContent||''))) return true;
			}catch(_e2){ }
			return false;
		}catch(_e){
			return false;
		}
	}

	function hwDeriveMaintenanceScopeKey(pageKey){
		var k = String(pageKey || '').trim();
		if(!k) return '';
		return null;
	}

	function hwFetchJson(url){
		return fetch(url, { method:'GET', credentials:'same-origin', headers:{ 'Accept':'application/json' } })
			.then(function(r){
				return r.json().catch(function(){ return null; }).then(function(j){
					return { ok: r.ok, status: r.status, json: j };
				});
			});
	}

	// NOTE: option (2) uses per-row matching; we no longer blanket-fill all rows.

	function hwPickFirstMaintenanceContractCode(items){
		for(var i=0;i<(items||[]).length;i++){
			var code = hwTrim(items[i] && items[i].code);
			if(code) return code;
		}
		return '';
	}

	function hwPickTab61Status(items, selectedRow){
		if(!Array.isArray(items) || !items.length) return '';
		var w = hwTrim(selectedRow && (selectedRow.work_name || selectedRow.work || selectedRow.workName));
		var s = hwTrim(selectedRow && (selectedRow.system_name || selectedRow.system || selectedRow.systemName));
		function norm(v){ return hwTrim(v).toLowerCase(); }
		var wN = norm(w);
		var sN = norm(s);
		var picked = null;
		if(wN && sN){
			for(var i=0;i<items.length;i++){
				var it = items[i] || {};
				if(norm(it.work_name) === wN && norm(it.system_name) === sN){ picked = it; break; }
			}
		}
		if(!picked) picked = items[0] || {};
		return hwTrim(picked.contract_status || picked.status || '');
	}

	function hwRefreshSystemMaintenanceFromTab61(storagePrefix, selectedRow){
		// Applies to all pages that render the shared hw-spec-table.
		var table = null;
		try{ table = document.getElementById('hw-spec-table'); }catch(_e0){ table = null; }
		if(!table) return;
		var schema = hwDetectSchema(table);
		if(!schema || !schema.hasMaintenanceCol) return;

		var hardwareId = resolveHardwareId(storagePrefix);
		if(!hardwareId) return;

		var maintScopeKey = hwDeriveMaintenanceScopeKey(hwGetPageKey());
		var cacheKey = String(maintScopeKey || 'server-hw') + '|' + String(hardwareId);
		var now = Date.now ? Date.now() : (new Date()).getTime();
		var cached = __hwTab01SystemMaintenanceCache[cacheKey];
		if(cached && cached.ts && (now - cached.ts) < 5*60*1000){
			try{
				if(Array.isArray(cached.lines) && cached.lines.length){
					hwApplyTab61MaintenanceToRows(cached.lines);
					return;
				}
			}catch(_eC){ }
			// Do not short-circuit on empty cache; refetch.
		}
		if(__hwTab01SystemMaintenanceInFlight[cacheKey]) return;

		__hwTab01SystemMaintenanceInFlight[cacheKey] = true;

		var baseUrl = '/api/hardware/assets/' + encodeURIComponent(String(hardwareId)) + '/tab61-maintenance'
			+ '?scope=OPEX&cost_type=HW';
		var urls = [baseUrl, baseUrl + '/'];
		var tried = 0;
		function tryNext(){
			var url = urls[tried++];
			if(!url) return Promise.resolve(null);
			return hwFetchJson(url).then(function(res){
				var j = res && res.json;
				if(res && res.ok && j && j.success){
					var lines = (j && Array.isArray(j.lines)) ? j.lines : null;
					if(lines){
						__hwTab01SystemMaintenanceCache[cacheKey] = { ts: now, lines: lines };
						hwApplyTab61MaintenanceToRows(lines);
					}else{
						// Strict policy: do not apply manage_no without lines.
						// Also: do not cache legacy responses (prevents 5-min stale state).
						hwApplyTab61MaintenanceToRows([]);
					}
					return true;
				}
				// If route is missing (404), try the alternate trailing-slash URL once.
				if(res && res.status === 404 && tried < urls.length) return tryNext();
				return null;
			});
		}
		tryNext()
			.catch(function(_e){
				// Best-effort; do not block page.
			})
			.finally(function(){
				try{ delete __hwTab01SystemMaintenanceInFlight[cacheKey]; }catch(_e2){ __hwTab01SystemMaintenanceInFlight[cacheKey] = false; }
			});
	}

	function refreshSystemRow(){
		var table = null;
		try{ table = document.getElementById('hw-spec-table'); }catch(_e0){ table = null; }
		if(!table) return false;
		var tbody = null;
		try{ tbody = table.querySelector('tbody'); }catch(_e1){ tbody = null; }
		if(!tbody) return false;

		var schema = hwDetectSchema(table);
		var hasSpecCol = schema.hasSpecCol;
		var isInventorySchema = schema.isInventorySchema;
		var hasMaintenanceCol = schema.hasMaintenanceCol;
		var hasRemarkCol = schema.hasRemarkCol;
		var storagePrefix = resolveStoragePrefix() || 'detail';

		function getSelectedRow(){
			var key = storagePrefix + ':selected:row';
			var raw = hwGetStorage(sessionStorage, key) || hwGetStorage(localStorage, key);
			return safeJsonParse(raw || '');
		}
		var row = getSelectedRow() || {};
		var cachedModel = firstNonEmpty([hwGetStorage(sessionStorage, storagePrefix+':current:model'), hwGetStorage(localStorage, storagePrefix+':current:model')]);
		var cachedVendor = firstNonEmpty([hwGetStorage(sessionStorage, storagePrefix+':current:vendor'), hwGetStorage(localStorage, storagePrefix+':current:vendor')]);
		var cachedSerial = firstNonEmpty([hwGetStorage(sessionStorage, storagePrefix+':current:serial'), hwGetStorage(localStorage, storagePrefix+':current:serial')]);
		var cachedFw = firstNonEmpty([hwGetStorage(sessionStorage, storagePrefix+':current:fw'), hwGetStorage(localStorage, storagePrefix+':current:fw')]);

		// Security assets (HSM/KMS/ETC) often use joined backend fields like
		// server_model_name / manufacturer_name rather than model_name / vendor_name.
		var model = firstNonEmpty([
			cachedModel,
			row.server_model_name,
			row.model_name,
			row.model,
			row.server_model,
			row.asset_name,
			row.name,
			row.system_name,
			row.system
		]);
		var vendor = firstNonEmpty([
			cachedVendor,
			row.manufacturer_name,
			row.vendor_name,
			row.vendor,
			row.manufacturer,
			row.maker
		]);
		var serial = firstNonEmpty([cachedSerial, row.serial, row.serial_no, row.sn]);
		var fw = firstNonEmpty([cachedFw, row.fw, row.firmware]);

		function setCellText(tr, col, text){
			try{
				var td = tr.querySelector('[data-col="'+col+'"]');
				if(td) td.textContent = (text && String(text).trim()) ? String(text).trim() : '-';
			}catch(_){ }
		}

		var first = null;
		try{ first = tbody.querySelector('tr'); }catch(_e2){ first = null; }
		var isSystem = !!(first && first.getAttribute && first.getAttribute('data-system') === '1');
		if(!isSystem){
			// System row isn't there yet; best-effort insert compatible row.
			try{
				var trNew = document.createElement('tr');
				trNew.setAttribute('data-system','1');
				var td0 = document.createElement('td');
				td0.innerHTML = '<input type="checkbox" class="hw-row-check" aria-label="행 선택" disabled>';
				trNew.appendChild(td0);
				function add(col, text){
					var td = document.createElement('td');
					td.setAttribute('data-col', col);
					td.textContent = (text && String(text).trim()) ? String(text).trim() : '-';
					trNew.appendChild(td);
				}
				add('type', '시스템');
				add('model', model || '-');
				if(hasSpecCol) add('spec', '-');
				if(hasActiveCapCol) add('active_capacity', '-');
				add('vendor', vendor || '-');
				try{ trNew.querySelector('[data-col="vendor"]').style.display = 'none'; }catch(_vh){}
				if(isInventorySchema) add('qty', '1');
				add('fw', fw || '-');
				if(hasSerialCol) add('serial', serial || '-');
				if(hasMaintenanceCol) add('maintenance', '-');
				else if(hasRemarkCol) add('remark', '-');
				var tdAct = document.createElement('td');
				tdAct.className = 'system-actions table-actions';
				tdAct.innerHTML = '<button class="action-btn hw-system-edit" type="button" data-action="edit" data-role="system-edit" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>';
				trNew.appendChild(tdAct);
				tbody.insertBefore(trNew, tbody.firstChild);
				first = trNew;
			}catch(_e3){
				return false;
			}
		}

		// If system row is currently in edit mode, do not clobber user inputs.
		try{
			if(first && first.getAttribute && first.getAttribute('data-editing') === '1') return true;
		}catch(_){ }

		setCellText(first, 'model', model);
		setCellText(first, 'vendor', vendor);
		setCellText(first, 'fw', fw);
		// serial column may not exist in inventory schema; update only if present.
		setCellText(first, 'serial', serial);
		// Server pages: maintenance is read-only and derived from tab61 using the contract number.
		try{ hwRefreshSystemMaintenanceFromTab61(storagePrefix, row); }catch(_eMt){ }
		return true;
	}

	// CSV

	function hwEscapeCSV(val){
		return '"' + String(val == null ? '' : val).replace(/"/g,'""') + '"';
	}

	function hwIsRowHidden(tr){
		return !!(tr && (tr.hasAttribute('data-hidden') || tr.style.display === 'none'));
	}

	function hwRowSaved(tr){
		try{
			var t = tr && tr.querySelector ? tr.querySelector('.js-hw-toggle') : null;
			var inEdit = t && t.getAttribute && t.getAttribute('data-action') === 'save';
			if(inEdit) return false;
			return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
		}catch(_){
			return true;
		}
	}

	function hwVisibleRows(table){
		try{
			var tbody = table && table.querySelector ? table.querySelector('tbody') : null;
			if(!tbody) return [];
			return Array.from(tbody.querySelectorAll('tr')).filter(function(tr){ return !hwIsRowHidden(tr); });
		}catch(_){
			return [];
		}
	}

	function hwSavedVisibleRows(table){
		return hwVisibleRows(table).filter(hwRowSaved);
	}

	function hwDetectSchema(table){
		var hasSpecCol = false;
		var hasActiveCapCol = false;
		var hasQtyCol = false;
		var hasSpaceCol = false;
		var hasMaintenanceCol = false;
		var hasRemarkCol = false;
		try{
			hasSpecCol = !!table.querySelector('[data-col="spec"]');
			hasActiveCapCol = !!table.querySelector('[data-col="active_capacity"]');
			hasQtyCol = !!table.querySelector('[data-col="qty"]');
			hasSpaceCol = !!table.querySelector('[data-col="space"]');
			hasMaintenanceCol = !!table.querySelector('[data-col="maintenance"]');
			hasRemarkCol = !!table.querySelector('[data-col="remark"]');
		}catch(_){ }
		// Fallback: when the table is empty, detect intent from header labels.
		try{
			var headerText = String((table.querySelector('thead') ? table.querySelector('thead').textContent : '') || '');
			if(!hasSpecCol && /\uC6A9\uB7C9/.test(headerText)) hasSpecCol = true;
			if(!hasActiveCapCol && /\uD65C\uC131\uC6A9\uB7C9/.test(headerText)) hasActiveCapCol = true;
			if(!hasQtyCol && /\uC218\uB7C9/.test(headerText)) hasQtyCol = true;
			if(!hasSpaceCol && /\uACF5\uAC04/.test(headerText)) hasSpaceCol = true;
			if(!hasMaintenanceCol && /\uC720\uC9C0\uBCF4\uC218/.test(headerText)) hasMaintenanceCol = true;
			if(!hasRemarkCol && /\uBE44\uACE0/.test(headerText)) hasRemarkCol = true;
		}catch(_h){ }
		var isInventorySchema = !!(hasQtyCol && !hasSpaceCol);
		return { hasSpecCol: hasSpecCol, hasActiveCapCol: hasActiveCapCol, isInventorySchema: isInventorySchema, hasMaintenanceCol: hasMaintenanceCol, hasRemarkCol: hasRemarkCol };
	}

	function hwGetText(tr, col){
		try{
			var td = tr.querySelector('[data-col="'+col+'"]');
			return td ? hwTrim(td.textContent || '') : '';
		}catch(_){
			return '';
		}
	}

	function hwExportCSV(table, onlySelected){
		if(!table) return;
		var schema = hwDetectSchema(table);
		var hasSpecCol = schema.hasSpecCol;
		var hasActiveCapCol = schema.hasActiveCapCol;
		var isInventorySchema = schema.isInventorySchema;
		var hasMaintenanceCol = schema.hasMaintenanceCol;
		var hasRemarkCol = schema.hasRemarkCol;

		var headers;
		if(isInventorySchema){
			headers = ['유형','모델명'];
			if(hasSpecCol) headers.push('용량');
			if(hasActiveCapCol) headers.push('활성용량');
			headers = headers.concat(['수량','펌웨어','일련번호']);
			if(hasMaintenanceCol) headers.push('유지보수');
			else if(hasRemarkCol) headers.push('비고');
		}else{
			headers = ['유형','공간','모델명'];
			if(hasSpecCol) headers.push('용량');
			if(hasActiveCapCol) headers.push('활성용량');
			headers = headers.concat(['일련번호','펌웨어']);
			if(hasMaintenanceCol) headers.push('유지보수');
			else if(hasRemarkCol) headers.push('비고');
		}

		var trs = hwSavedVisibleRows(table);
		if(onlySelected){
			trs = trs.filter(function(tr){
				var cb = tr.querySelector('.hw-row-check');
				return cb && cb.checked;
			});
		}
		if(!trs.length) return;

		var baseCols;
		if(isInventorySchema){
			baseCols = ['type','model'];
			if(hasSpecCol) baseCols.push('spec');
			if(hasActiveCapCol) baseCols.push('active_capacity');
			baseCols = baseCols.concat(['qty','fw','serial']);
			if(hasMaintenanceCol) baseCols.push('maintenance');
			else if(hasRemarkCol) baseCols.push('remark');
		}else{
			baseCols = ['type','space','model'];
			if(hasSpecCol) baseCols.push('spec');
			if(hasActiveCapCol) baseCols.push('active_capacity');
			baseCols = baseCols.concat(['serial','fw']);
			if(hasMaintenanceCol) baseCols.push('maintenance');
			else if(hasRemarkCol) baseCols.push('remark');
		}

		var rows = trs.map(function(tr){
			return baseCols.map(function(c){ return hwGetText(tr, c); });
		});

		var lines = [headers].concat(rows).map(function(arr){
			return arr.map(hwEscapeCSV).join(',');
		});
		var csv = '\uFEFF' + lines.join('\r\n');
		var d = new Date();
		var yyyy = d.getFullYear();
		var mm = String(d.getMonth()+1).padStart(2,'0');
		var dd = String(d.getDate()).padStart(2,'0');
		var filename = 'hardware_' + yyyy + mm + dd + '.csv';
		try{
			var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
			var url = URL.createObjectURL(blob);
			var a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		}catch(_){
			var a2 = document.createElement('a');
			a2.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
			a2.download = filename;
			document.body.appendChild(a2);
			a2.click();
			document.body.removeChild(a2);
		}
	}

	function hwOpenModal(el){
		if(!el) return;
		try{ document.body.classList.add('modal-open'); }catch(_){ }
		try{ el.classList.add('show'); }catch(_){ }
		try{ el.classList.add('open'); }catch(_){ }
		try{ el.setAttribute('aria-hidden','false'); }catch(_){ }
	}

	function hwCloseModal(el){
		if(!el) return;
		try{ el.classList.remove('show'); }catch(_){ }
		try{ el.classList.remove('open'); }catch(_){ }
		try{ el.setAttribute('aria-hidden','true'); }catch(_){ }
		try{
			if(!document.querySelector('.modal-overlay-full.show, .modal-overlay-full.open')){
				document.body.classList.remove('modal-open');
			}
		}catch(_){ }
	}

	function wireHwDownloadModal(){
		var table = document.getElementById('hw-spec-table');
		if(!table) return false;

		var btn = document.getElementById('hw-download-btn');
		var modalEl = document.getElementById('hw-download-modal');
		var closeBtn = document.getElementById('hw-download-close');
		var confirmBtn = document.getElementById('hw-download-confirm');
		if(!btn || !modalEl || !confirmBtn) return false;

		if(btn.getAttribute('data-bhwm') === '1') return true;
		btn.setAttribute('data-bhwm','1');

		btn.addEventListener('click', function(){
			if(btn.disabled) return;
			var saved = hwSavedVisibleRows(table);
			var total = saved.length;
			if(total <= 0) return;
			var selectedCount = saved.filter(function(tr){
				var cb = tr.querySelector('.hw-row-check');
				return cb && cb.checked;
			}).length;
			var subtitle = document.getElementById('hw-download-subtitle');
			if(subtitle){
				subtitle.textContent = selectedCount > 0
					? ('선택된 ' + selectedCount + '개 또는 전체 ' + total + '개 결과 중 범위를 선택하세요.')
					: ('현재 결과 ' + total + '개 항목을 CSV로 내보냅니다.');
			}
			var rowSelectedWrap = document.getElementById('hw-csv-range-row-selected');
			var optSelected = document.getElementById('hw-csv-range-selected');
			var optAll = document.getElementById('hw-csv-range-all');
			if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount > 0);
			if(optSelected){ optSelected.disabled = !(selectedCount > 0); optSelected.checked = (selectedCount > 0); }
			if(optAll){ optAll.checked = !(selectedCount > 0); }
			hwOpenModal(modalEl);
		});

		if(closeBtn){
			closeBtn.addEventListener('click', function(){ hwCloseModal(modalEl); });
		}
		modalEl.addEventListener('click', function(e){ if(e.target === modalEl) hwCloseModal(modalEl); });
		document.addEventListener('keydown', function(e){
			try{
				if(e.key === 'Escape' && (modalEl.classList.contains('show') || modalEl.classList.contains('open'))){
					hwCloseModal(modalEl);
				}
			}catch(_){ }
		});
		confirmBtn.addEventListener('click', function(){
			var onlySel = !!(document.getElementById('hw-csv-range-selected') && document.getElementById('hw-csv-range-selected').checked);
			hwExportCSV(table, onlySel);
			hwCloseModal(modalEl);
		});
		return true;
	}

	// ---- Hardware components CRUD + pagination (SAN director parity) ----

	function resolveStoragePrefix(){
		try{
			var explicit = (window.__HW_STORAGE_PREFIX__ == null ? '' : String(window.__HW_STORAGE_PREFIX__)).trim();
			if(explicit) return explicit;
		}catch(_e0){ }

		var hint = '';
		try{ hint = String(location.pathname||'') + ' ' + String(location.search||''); }catch(_e1){ hint = ''; }
		var tokens = [];
		try{ tokens = hint.toLowerCase().split(/[^a-z0-9\-\_]+/).filter(Boolean); }catch(_e2){ tokens = []; }

		function candidateScore(prefix){
			var p = String(prefix||'');
			if(!p) return 0;
			var pl = p.toLowerCase();
			var score = 0;
			if(hint.toLowerCase().indexOf(pl) !== -1) score += 5;
			try{
				var parts = pl.split(/[^a-z0-9]+/).filter(Boolean);
				for(var i=0;i<parts.length;i++){
					if(tokens.indexOf(parts[i]) !== -1) score += 2;
				}
			}catch(_){ }
			return score;
		}

		function tryPick(store){
			if(!store) return '';
			var best = { prefix:'', score:0 };
			try{
				for(var i=0;i<store.length;i++){
					var k = store.key(i);
					if(!k || k.indexOf(':selected:row') === -1) continue;
					if(k.slice(-(':selected:row'.length)) !== ':selected:row') continue;
					var prefix = k.slice(0, k.length - ':selected:row'.length);
					var row = safeJsonParse(store.getItem(k));
					if(!row || typeof row !== 'object') continue;
					var idCand = row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id);
					var n = parseInt(idCand, 10);
					if(isNaN(n) || n <= 0) continue;
					var score = candidateScore(prefix);
					if(score > best.score){ best = { prefix: prefix, score: score }; }
				}
			}catch(_e3){ }
			return best.prefix;
		}
		return tryPick(window.sessionStorage) || tryPick(window.localStorage) || '';
	}

	function resolveHardwareId(prefix){
		// 1) querystring
		try{
			var qs = new URLSearchParams(location.search || '');
			var cand = qs.get('hardware_id') || qs.get('hardwareId') || qs.get('asset_id') || qs.get('assetId') || qs.get('id');
			var n0 = parseInt(cand, 10);
			if(!isNaN(n0) && n0 > 0) return n0;
		}catch(_e0){ }

		function fromStore(store, key){
			try{ return store && store.getItem ? store.getItem(key) : null; }catch(_){ return null; }
		}
		function parseRow(raw){ return safeJsonParse(raw || ''); }
		function pickId(row){
			if(!row || typeof row !== 'object') return null;
			var id = (row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id));
			var n = parseInt(id, 10);
			return (!isNaN(n) && n > 0) ? n : null;
		}

		// 2) exact prefix key — :selected:row
		try{
			if(prefix){
				var k = prefix + ':selected:row';
				var row1 = parseRow(fromStore(window.sessionStorage,k) || fromStore(window.localStorage,k));
				var n1 = pickId(row1);
				if(n1) return n1;
			}
		}catch(_e1){ }

		// 2b) exact prefix key — :selected:asset_id
		try{
			if(prefix){
				var ak = prefix + ':selected:asset_id';
				var raw = fromStore(window.sessionStorage,ak) || fromStore(window.localStorage,ak);
				var n2 = parseInt(raw, 10);
				if(!isNaN(n2) && n2 > 0) return n2;
			}
		}catch(_e1b){ }

		// NOTE: removed step-3 (scan any :selected:row across all storage keys)
		// to prevent cross-asset contamination.
		return null;
	}

	function apiFetchJson(url, opts){
		var options = opts ? Object.assign({}, opts) : {};
		options.credentials = options.credentials || 'same-origin';
		options.headers = Object.assign({ 'Accept':'application/json' }, options.headers || {});
		var method = String(options.method || 'GET').toUpperCase();
		if(method !== 'GET'){
			if(!options.headers['Content-Type'] && !options.headers['content-type']){
				options.headers['Content-Type'] = 'application/json';
			}
		}
		return fetch(url, options).then(function(r){
			return r.json().catch(function(){ return null; }).then(function(j){
				return { ok: r.ok, status: r.status, json: j };
			});
		});
	}

	// ── Delete-confirmation modal (tab14 style) ──
	var _hwPendingDeleteTr = null;
	var _hwDeleteCallback = null;

	function hwOpenDeleteModal(tr, onConfirm){
		_hwPendingDeleteTr = tr;
		_hwDeleteCallback = onConfirm || null;
		var msgEl = byId('hw-delete-msg');
		if(msgEl) msgEl.textContent = '이 하드웨어 구성을 삭제하시겠습니까?';
		var modal = byId('hw-delete-modal');
		if(modal) hwOpenModal(modal);
	}

	function hwCloseDeleteModal(){
		_hwPendingDeleteTr = null;
		_hwDeleteCallback = null;
		var modal = byId('hw-delete-modal');
		if(modal) hwCloseModal(modal);
	}

	function hwPerformDelete(){
		var tr = _hwPendingDeleteTr;
		var cb = _hwDeleteCallback;
		hwCloseDeleteModal();
		if(cb){ cb(tr); }
	}

	var _hwDeleteModalWired = false;
	function wireHwDeleteModal2(){
		if(_hwDeleteModalWired) return;
		var modal = byId('hw-delete-modal');
		if(!modal) return;
		_hwDeleteModalWired = true;
		var confirmBtn = byId('hw-delete-confirm');
		var cancelBtn  = byId('hw-delete-cancel');
		var closeBtn   = byId('hw-delete-close');
		if(confirmBtn) confirmBtn.addEventListener('click', hwPerformDelete);
		if(cancelBtn)  cancelBtn.addEventListener('click', hwCloseDeleteModal);
		if(closeBtn)   closeBtn.addEventListener('click', hwCloseDeleteModal);
		modal.addEventListener('click', function(e){ if(e.target === modal) hwCloseDeleteModal(); });
		document.addEventListener('keydown', function(e){
			try{
				if(e.key === 'Escape' && (modal.classList.contains('show') || modal.classList.contains('open'))){
					hwCloseDeleteModal();
				}
			}catch(_){ }
		});
	}

	function initHardwareTable(){
		var table = byId('hw-spec-table');
		if(!table) return false;
		if(table.getAttribute('data-bhw-managed') === '1') return true;
		table.setAttribute('data-bhw-managed','1');

		// Elements
		var empty = byId('hw-empty');
		var infoEl = byId('hw-pagination-info');
		var numWrap = byId('hw-page-numbers');
		var btnFirst = byId('hw-first');
		var btnPrev = byId('hw-prev');
		var btnNext = byId('hw-next');
		var btnLast = byId('hw-last');
		var selectAll = byId('hw-select-all');
		var btnAdd = byId('hw-row-add');

		// Schema detection
		var hwHeaderText = '';
		try{ hwHeaderText = String((table.querySelector('thead') ? table.querySelector('thead').textContent : '') || ''); }catch(_){ hwHeaderText = ''; }
		var hasSpecCol = !!table.querySelector('[data-col="spec"]') || /\uC6A9\uB7C9/.test(hwHeaderText);
		var hasActiveCapCol = !!table.querySelector('[data-col="active_capacity"]') || /\uD65C\uC131\uC6A9\uB7C9/.test(hwHeaderText);
		var hasSerialCol = !!table.querySelector('[data-col="serial"]') || /\uC77C\uB828\uBC88\uD638/.test(hwHeaderText);
		var hasMaintenanceCol = /\uC720\uC9C0\uBCF4\uC218/.test(hwHeaderText);
		var hasRemarkCol = /\uBE44\uACE0/.test(hwHeaderText);
		var isInventorySchema = (function(){
			try{ if(/\uC218\uB7C9/.test(hwHeaderText) && !/\uACF5\uAC04/.test(hwHeaderText)) return true; }catch(_e0){ }
			try{ return !!table.querySelector('[data-col="qty"]') && !table.querySelector('[data-col="space"]'); }catch(_e1){ return true; }
		})();
		var invTypeOptions = ['CPU','GPU','MEMORY','DISK','NIC','HBA','ETC'];
		var typeOptions = invTypeOptions;

		// Inventory catalog helper
		try{
			if(isInventorySchema && window.BlossomHwInventoryCatalog && typeof window.BlossomHwInventoryCatalog.bindTable === 'function'){
				window.BlossomHwInventoryCatalog.bindTable(table);
			}
		}catch(_eCat){ }

		// Resolve context
		var storagePrefix = resolveStoragePrefix() || 'detail';
		var hardwareId = resolveHardwareId(storagePrefix);
		function apiBase(){ return hardwareId ? ('/api/hardware/assets/' + encodeURIComponent(String(hardwareId)) + '/components') : null; }

		// Pagination state
		var hwState = { page:1, pageSize:10 };
		(function initPageSize(){
			try{
				var saved = localStorage.getItem('onpremise:hw:pageSize');
				var sel = byId('hw-page-size');
				if(sel){
					if(saved && ['10','20','50','100'].indexOf(saved) > -1){ hwState.pageSize = parseInt(saved,10); sel.value = saved; }
					sel.addEventListener('change', function(){
						var v = parseInt(sel.value,10);
						if(!isNaN(v)){
							hwState.page = 1;
							hwState.pageSize = v;
							try{ localStorage.setItem('onpremise:hw:pageSize', String(v)); }catch(_){ }
							hwRenderPage();
						}
					});
				}
			}catch(_e){ }
		})();

		function tbodyEl(){ try{ return table.querySelector('tbody'); }catch(_){ return null; } }
		function isSystemRow(tr){ return !!(tr && tr.getAttribute && tr.getAttribute('data-system') === '1'); }
		function nonSystemRows(){
			var tbody = tbodyEl();
			if(!tbody) return [];
			return Array.from(tbody.querySelectorAll('tr')).filter(function(tr){ return !isSystemRow(tr) && !tr.classList.contains('hw-expand-row'); });
		}
		function allRows(){
			var tbody = tbodyEl();
			if(!tbody) return [];
			return Array.from(tbody.querySelectorAll('tr'));
		}
		function hwTotal(){ return nonSystemRows().length; }
		function hwPages(){ var total = hwTotal(); return Math.max(1, Math.ceil(total / hwState.pageSize)); }
		function hwClampPage(){ var pages = hwPages(); if(hwState.page > pages) hwState.page = pages; if(hwState.page < 1) hwState.page = 1; }

		function getSelectedRow(){
			var key = storagePrefix + ':selected:row';
			var raw = null;
			try{ raw = sessionStorage.getItem(key) || localStorage.getItem(key); }catch(_e){ raw = null; }
			return safeJsonParse(raw || '');
		}
		function getSystemInfo(){
			var row = getSelectedRow() || {};
			var model = firstNonEmpty([row.model, row.model_name, row.asset_name, row.name, row.system_name, row.system]);
			var vendor = firstNonEmpty([row.vendor, row.manufacturer, row.maker, row.vendor_name]);
			var serial = firstNonEmpty([row.serial, row.serial_no, row.sn]);
			var fw = firstNonEmpty([row.fw, row.firmware]);
			// allow page-specific caching to override
			try{ model = firstNonEmpty([localStorage.getItem(storagePrefix+':current:model'), model]); }catch(_){ }
			try{ vendor = firstNonEmpty([localStorage.getItem(storagePrefix+':current:vendor'), vendor]); }catch(_){ }
			try{ serial = firstNonEmpty([localStorage.getItem(storagePrefix+':current:serial'), serial]); }catch(_){ }
			try{ fw = firstNonEmpty([localStorage.getItem(storagePrefix+':current:fw'), fw]); }catch(_){ }
			return { model:model, vendor:vendor, serial:serial, fw:fw };
		}
		function ensureSystemRow(){
			var tbody = tbodyEl();
			if(!tbody) return;
			var first = tbody.querySelector('tr');
			if(first && isSystemRow(first)) return;
			var d = getSystemInfo();
			var tr = document.createElement('tr');
			tr.setAttribute('data-system','1');
			tr.innerHTML = '';
			// Checkbox
			var td0 = document.createElement('td');
			td0.innerHTML = '<input type="checkbox" class="hw-row-check" aria-label="행 선택" disabled>';
			tr.appendChild(td0);
			// Cells
			function add(col, text){
				var td = document.createElement('td');
				td.setAttribute('data-col', col);
				td.textContent = (text && String(text).trim()) ? String(text).trim() : '-';
				tr.appendChild(td);
			}
			add('type', '시스템');
			add('model', d.model || '-');
			if(hasSpecCol) add('spec', '-');
			add('vendor', d.vendor || '-');
			try{ tr.querySelector('[data-col="vendor"]').style.display = 'none'; }catch(_vh){}
			if(isInventorySchema) add('qty', '1');
			if(hasActiveCapCol) add('active_capacity', '-');
			add('fw', d.fw || '-');
			if(hasSerialCol) add('serial', d.serial || '-');
			if(hasMaintenanceCol) add('maintenance', '-');
			else if(hasRemarkCol) add('remark', '-');
			var tdAct = document.createElement('td');
			tdAct.className = 'system-actions table-actions';
			// Use data-action="edit" so CSS aligns the single button to the left slot.
			tdAct.innerHTML = '<button class="action-btn hw-system-edit" type="button" data-action="edit" data-role="system-edit" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>';
			tr.appendChild(tdAct);
			tbody.insertBefore(tr, tbody.firstChild);
		}

		function setStoredSelectedRowPatch(patch){
			if(!patch) return;
			var key = storagePrefix + ':selected:row';
			try{
				var raw = (sessionStorage.getItem(key) || localStorage.getItem(key) || '');
				var obj = safeJsonParse(raw) || {};
				for(var k in patch){ if(Object.prototype.hasOwnProperty.call(patch, k)) obj[k] = patch[k]; }
				var s = JSON.stringify(obj);
				try{ sessionStorage.setItem(key, s); }catch(_e0){ }
				try{ localStorage.setItem(key, s); }catch(_e1){ }
			}catch(_e2){ }
		}

		function enterSystemEdit(tr){
			if(!tr || !isSystemRow(tr)) return;
			try{ tr.setAttribute('data-editing','1'); }catch(_){ }

			function replaceWithInput(col){
				try{
					var td = tr.querySelector('[data-col="'+col+'"]');
					if(!td) return;
					var v = hwTrim(td.textContent || '');
					if(v === '-' ) v = '';
					td.innerHTML = '';
					var input = document.createElement('input');
					input.type = 'text';
					input.className = 'hw-inline-input';
					input.value = v;
					input.setAttribute('data-col-input', col);
					td.appendChild(input);
				}catch(_e){ }
			}

			replaceWithInput('model');
			replaceWithInput('vendor');
			try{ tr.querySelector('[data-col="vendor"]').style.display = 'none'; }catch(_vh){}
			replaceWithInput('fw');
			// Serial number for the SYSTEM row is sourced from the "기본정보" tab (selected row cache)
			// and must not be editable here.
			// Maintenance for all hardware pages is derived from tab61 and must not be editable here.
			if(hasRemarkCol) replaceWithInput('remark');

			try{
				var btn = tr.querySelector('button[data-role="system-edit"]');
				if(btn){
					btn.setAttribute('data-action','save');
					btn.title = '저장';
					btn.setAttribute('aria-label','저장');
					btn.innerHTML = '<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
				}
			}catch(_e2){ }
		}

		function saveSystemEdit(tr){
			if(!tr || !isSystemRow(tr)) return;
			function read(col){
				try{
					var input = tr.querySelector('[data-col="'+col+'"] [data-col-input="'+col+'"]');
					return hwTrim(input ? input.value : '');
				}catch(_e){ return ''; }
			}
			var model = read('model');
			var vendor = read('vendor');
			var fw = read('fw');
			var allowMaintenanceEdit = false;
			var maintenance = '';
			var remark = hasRemarkCol ? read('remark') : '';
			var note = allowMaintenanceEdit ? maintenance : remark;

			try{ tr.removeAttribute('data-editing'); }catch(_){ }
			try{ var tdM = tr.querySelector('[data-col="model"]'); if(tdM) tdM.textContent = model || '-'; }catch(_e0){ }
			try{ var tdV = tr.querySelector('[data-col="vendor"]'); if(tdV) tdV.textContent = vendor || '-'; }catch(_e1){ }
			try{ var tdF = tr.querySelector('[data-col="fw"]'); if(tdF) tdF.textContent = fw || '-'; }catch(_e2){ }
			try{ var tdMt = tr.querySelector('[data-col="maintenance"]'); if(tdMt && allowMaintenanceEdit) tdMt.textContent = note || '-'; }catch(_e3a){ }
			try{ var tdR = tr.querySelector('[data-col="remark"]'); if(tdR) tdR.textContent = note || '-'; }catch(_e3){ }

			// Persist to current cache so future renders pick it up.
			try{ localStorage.setItem(storagePrefix+':current:model', model); }catch(_e4){ }
			try{ localStorage.setItem(storagePrefix+':current:vendor', vendor); }catch(_e5){ }
			try{ localStorage.setItem(storagePrefix+':current:fw', fw); }catch(_e6){ }
			// Keep backward-compat keys as well (some pages may still reference remark).
			// NOTE: Do not patch serial here; SYSTEM serial comes from "기본정보" and is read-only.
			setStoredSelectedRowPatch({ model: model, vendor: vendor, fw: fw, firmware: fw });

			// Persist firmware to the hardware asset DB record.
			try{
				var hid = hardwareId || resolveHardwareId(storagePrefix);
				if(hid && fw){
					apiFetchJson('/api/hardware/assets/' + encodeURIComponent(String(hid)) + '/system-info', {
						method: 'PATCH',
						body: JSON.stringify({ firmware: fw })
					});
				}
			}catch(_ePersistFw){ }

			try{
				var btn = tr.querySelector('button[data-role="system-edit"]');
				if(btn){
					btn.setAttribute('data-action','edit');
					btn.title = '편집';
					btn.setAttribute('aria-label','편집');
					btn.innerHTML = '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
				}
			}catch(_e7){ }
		}

		var SPEC_UNIT_MAP = { CPU:' Core', MEMORY:' GB', DISK:' GB', NIC:' Gbps', HBA:' Gbps' };
		function specWithUnit(type, val){
			var t = (val == null ? '' : String(val)).trim();
			if(!t || t === '-') return '';
			var u = SPEC_UNIT_MAP[(type || '').toUpperCase()] || '';
			return t + u;
		}
		function makeViewCell(col, val){
			var td = document.createElement('td');
			td.setAttribute('data-col', col);
			var t = (val == null ? '' : String(val)).trim();
			td.textContent = t ? t : '-';
			return td;
		}
		function makeActionsCell(mode, itemType){
			var td = document.createElement('td');
			td.className = 'system-actions table-actions';
			var isCpu = String(itemType || '').toUpperCase() === 'CPU';
			var expandBtn = isCpu ? '<button class="action-btn js-hw-expand" type="button" title="확장" aria-label="확장"><img src="/static/image/svg/free-icon-font-apps-add.svg" alt="확장" class="action-icon"></button> ' : '';
			if(mode === 'edit'){
				td.innerHTML = expandBtn + '<button class="action-btn js-hw-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button> <button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>';
			}else{
				td.innerHTML = expandBtn + '<button class="action-btn js-hw-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button> <button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>';
			}
			return td;
		}
		function renderItems(items){
			var tbody = tbodyEl();
			if(!tbody) return;
			tbody.innerHTML = '';
			ensureSystemRow();
			(items || []).forEach(function(item){
				var tr = document.createElement('tr');
				if(item && item.id != null) tr.setAttribute('data-id', String(item.id));
				var tdC = document.createElement('td'); tdC.innerHTML = '<input type="checkbox" class="hw-row-check" aria-label="행 선택">';
				tr.appendChild(tdC);
				tr.appendChild(makeViewCell('type', item.type));
				tr.appendChild(makeViewCell('model', item.model));
				if(hasSpecCol) tr.appendChild(makeViewCell('spec', specWithUnit(item.type, item.spec)));
				var _vTd = makeViewCell('vendor', item.vendor); _vTd.style.display = 'none'; tr.appendChild(_vTd);
				if(isInventorySchema) tr.appendChild(makeViewCell('qty', item.qty));
				if(hasActiveCapCol) tr.appendChild(makeViewCell('active_capacity', specWithUnit(item.type, item.active_capacity)));
				tr.appendChild(makeViewCell('fw', item.fw));
				if(hasSerialCol) tr.appendChild(makeViewCell('serial', item.serial));
				if(hasMaintenanceCol){
					tr.appendChild(makeViewCell('maintenance', firstNonEmpty([item.maintenance, item.remark])));
				}else if(hasRemarkCol){
					tr.appendChild(makeViewCell('remark', firstNonEmpty([item.remark, item.maintenance])));
				}
				tr.appendChild(makeActionsCell('view', item.type));
				tbody.appendChild(tr);

				// 확장 행 생성 (TPMC 상세) — CPU 유형만
				if(String(item.type || '').toUpperCase() === 'CPU'){
					var colCount = 0;
					for(var ci=0; ci<tr.children.length; ci++){ if(tr.children[ci].style.display !== 'none') colCount++; }
					var expTr = document.createElement('tr');
					expTr.className = 'hw-expand-row';
					expTr.style.display = 'none';
					var expTd = document.createElement('td');
					expTd.setAttribute('colspan', String(colCount));
					expTd.className = 'hw-expand-cell';
					expTd.innerHTML = '<div class="hw-expand-loading">로딩 중...</div>';
					expTr.appendChild(expTd);
					tbody.appendChild(expTr);
					tr._expandRow = expTr;
				}
				tr._item = item;
			});
			updateEmptyState();
			try{ hwRefreshSystemMaintenanceFromTab61(storagePrefix, getSelectedRow()); }catch(_eMt2){ }
			// TPMC 요약 갱신
			try{ hwRefreshTpmcSummary(); }catch(_eTpmc){ }
		}

		// ── TPMC 요약 표시 ───────────────────────────────
		// 확장 행 TPMC 상세 로드
		function hwLoadExpandDetail(tr){
			var expRow = tr._expandRow;
			if(!expRow) return;
			var cell = expRow.querySelector('.hw-expand-cell');
			if(!cell) return;
			// 이미 로드된 경우 재로드 하지 않음
			if(expRow._loaded){ return; }
			var item = tr._item || {};
			var rowType = hwTrim(hwGetRowColValue(tr, 'type')).toUpperCase();

			if(rowType === 'CPU'){
				// CPU 행: TPMC 정보 표시
				var hid = hardwareId || resolveHardwareId(storagePrefix);
				if(!hid){ cell.innerHTML = '<div class="hw-expand-empty">자산 ID를 찾을 수 없습니다.</div>'; expRow._loaded = true; return; }
				cell.innerHTML = '<div class="hw-expand-loading">TPMC 계산 중...</div>';
				apiFetchJson('/api/hardware/assets/' + encodeURIComponent(String(hid)) + '/tpmc', { method: 'GET' })
					.then(function(res){
						var j = (res && res.json) || {};
						if(!j.success){ cell.innerHTML = '<div class="hw-expand-empty">' + hwEscapeHtml(j.error || j.message || 'TPMC 조회 실패') + '</div>'; expRow._loaded = true; return; }
						var html = hwBuildTpmcExpandHtml(j, item);
						cell.innerHTML = html;
						hwBindFactorInputs(cell);
						expRow._loaded = true;
					})
					.catch(function(){ cell.innerHTML = '<div class="hw-expand-empty">TPMC 조회 중 오류</div>'; expRow._loaded = true; });
			}else{
				// CPU 외 행: 기본 상세 정보
				var model = hwTrim(hwGetRowColValue(tr, 'model'));
				var vendor = hwTrim(hwGetRowColValue(tr, 'vendor'));
				var fw = hwTrim(hwGetRowColValue(tr, 'fw'));
				var serial = hasSerialCol ? hwTrim(hwGetRowColValue(tr, 'serial')) : '';
				var html = '<div class="hw-expand-detail">';
				html += '<div class="hw-expand-field"><span class="hw-expand-label">유형</span><span class="hw-expand-value">' + hwEscapeHtml(rowType || '-') + '</span></div>';
				html += '<div class="hw-expand-field"><span class="hw-expand-label">모델</span><span class="hw-expand-value">' + hwEscapeHtml(model || '-') + '</span></div>';
				html += '<div class="hw-expand-field"><span class="hw-expand-label">제조사</span><span class="hw-expand-value">' + hwEscapeHtml(vendor || '-') + '</span></div>';
				html += '<div class="hw-expand-field"><span class="hw-expand-label">펌웨어</span><span class="hw-expand-value">' + hwEscapeHtml(fw || '-') + '</span></div>';
				if(serial) html += '<div class="hw-expand-field"><span class="hw-expand-label">일련번호</span><span class="hw-expand-value">' + hwEscapeHtml(serial) + '</span></div>';
				html += '</div>';
				cell.innerHTML = html;
				expRow._loaded = true;
			}
		}
		function hwFmtNum(v, digits){
			if(v == null) return '-';
			var n = Number(v);
			if(isNaN(n)) return '-';
			if(digits != null) return n.toLocaleString('ko-KR', {minimumFractionDigits:0, maximumFractionDigits:digits});
			return n.toLocaleString('ko-KR');
		}
		function hwBuildTpmcExpandHtml(data, item){
			var comps = data.cpu_components || [];
			var total = data.tpmc_total;
			var managed = data.tpmc_managed;
			var calculable = data.calculable;
			var error = data.error;
			var roleFactor = data.role_factor || 1.0;
			var virtFactor = data.virtualization_factor || 1.0;
			var safetyFactor = data.safety_factor || 0.8;

			// Restore persisted role selection
			var _storedRoles = __hwRoleSelection[String(hardwareId)];
			if(!_storedRoles){
				try{ var _sr = sessionStorage.getItem('hw:role:' + hardwareId); if(_sr) _storedRoles = JSON.parse(_sr); }catch(_){}
			}
			_storedRoles = Array.isArray(_storedRoles) ? _storedRoles : [];
			if(_storedRoles.length > 0){
				var _rfMap = { DB: 0.95, WAS: 1.00, WEB: 1.05 };
				if(_storedRoles.length === 1){
					roleFactor = _rfMap[_storedRoles[0]] || 1.0;
				} else {
					var _wS = 0, _fS = 0;
					for(var _ri = 0; _ri < _storedRoles.length; _ri++){
						var _w = (HW_ROLE_WEIGHTS||{})[_storedRoles[_ri]] || 0;
						var _f = _rfMap[_storedRoles[_ri]] || 1.0;
						_wS += _w; _fS += _f * _w;
					}
					roleFactor = _wS > 0 ? _fS / _wS : 1.0;
				}
			}

			var html = '<div class="hw-expand-tpmc">';

			// TPMC 테이블
			html += '<table class="hw-tpmc-table">';
			html += '<thead><tr>';
			html += '<th>기준 TPMC</th><th>Core당 TPMC</th>';
			html += '<th>역할 보정계수</th><th>가상화 보정계수</th><th>안정화 보정계수</th>';
			html += '<th>산출 TPMC</th><th>운영 TPMC</th>';
			html += '</tr></thead><tbody>';
			for(var i = 0; i < comps.length; i++){
				var c = comps[i];
				var ac = c.active_capacity || c.qty || 0;
				var compTpmc = c.component_tpmc || 0;
				var lineTotal = compTpmc * roleFactor * virtFactor;
				var lineManaged = lineTotal * safetyFactor;
				html += '<tr class="js-tpmc-row" data-ac="' + ac + '" data-pc="' + (c.per_core_tpmc||0) + '" data-virt="' + virtFactor + '">';
				html += '<td class="num">' + hwFmtNum(c.reference_tpmc) + '</td>';
				html += '<td class="num">' + hwFmtNum(c.per_core_tpmc, 1) + '</td>';
				html += '<td class="num js-role-val">' + Number(roleFactor).toFixed(2) + '</td>';
				html += '<td class="num">' + Number(virtFactor).toFixed(2) + '</td>';
				html += '<td class="num"><input type="number" class="hw-factor-input" data-factor="safety" step="0.01" min="0" value="' + Number(safetyFactor).toFixed(2) + '"></td>';
				html += '<td class="num accent js-row-total">' + hwFmtNum(lineTotal, 2) + '</td>';
				html += '<td class="num accent js-row-managed">' + hwFmtNum(lineManaged, 2) + '</td>';
				html += '</tr>';
				if(c.error){
					html += '<tr><td colspan="7" class="hw-tpmc-comp-error">' + hwEscapeHtml(c.error) + '</td></tr>';
				}
			}
			html += '</tbody></table>';

			// 역할 보정계수 선택기
			html += '<div class="hw-role-selector">';
			html += '<span class="hw-role-title">역할 보정계수</span>';
			var _chkDB = _storedRoles.indexOf('DB') >= 0 ? ' checked' : '';
			var _chkWAS = _storedRoles.indexOf('WAS') >= 0 ? ' checked' : '';
			var _chkWEB = _storedRoles.indexOf('WEB') >= 0 ? ' checked' : '';
			html += '<label class="hw-role-opt"><input type="checkbox" class="hw-role-chk" value="DB" data-factor="0.95"' + _chkDB + '><span class="hw-role-badge hw-role-db">DB</span><span class="hw-role-coeff">0.95</span></label>';
			html += '<label class="hw-role-opt"><input type="checkbox" class="hw-role-chk" value="WAS" data-factor="1.00"' + _chkWAS + '><span class="hw-role-badge hw-role-was">WAS</span><span class="hw-role-coeff">1.00</span></label>';
			html += '<label class="hw-role-opt"><input type="checkbox" class="hw-role-chk" value="WEB" data-factor="1.05"' + _chkWEB + '><span class="hw-role-badge hw-role-web">WEB</span><span class="hw-role-coeff">1.05</span></label>';
			html += '<span class="hw-role-result">\u2192 <span class="js-role-display">' + Number(roleFactor).toFixed(2) + '</span></span>';
			html += '<span class="hw-role-hint">복수 선택: DB 50% / WAS 30% / WEB 20% 가중 평균</span>';
			html += '</div>';



			html += '</div>';
			return html;
		}
		/* 보정계수 변경 시 재계산 바인딩 */
		function hwBindFactorInputs(expandCell){
			if(!expandCell) return;
			var wrap = expandCell.querySelector('.hw-expand-tpmc');
			if(!wrap) return;
			// 안정화 보정계수 input
			var inputs = wrap.querySelectorAll('.hw-factor-input');
			for(var k = 0; k < inputs.length; k++){
				inputs[k].addEventListener('input', function(){ hwRecalcTpmc(wrap); });
			}
			// 역할 보정계수 체크박스
			var chks = wrap.querySelectorAll('.hw-role-chk');
			for(var c = 0; c < chks.length; c++){
				chks[c].addEventListener('change', function(){ hwRecalcRole(wrap); });
			}
		}
		var HW_ROLE_WEIGHTS = { DB: 0.5, WAS: 0.3, WEB: 0.2 };
		function hwRecalcRole(wrap){
			var chks = wrap.querySelectorAll('.hw-role-chk:checked');
			var role = 1.0;
			if(chks.length === 1){
				role = parseFloat(chks[0].getAttribute('data-factor')) || 1.0;
			}else if(chks.length > 1){
				var wSum = 0, fSum = 0;
				for(var i = 0; i < chks.length; i++){
					var w = HW_ROLE_WEIGHTS[chks[i].value] || 0;
					var f = parseFloat(chks[i].getAttribute('data-factor')) || 1.0;
					wSum += w; fSum += f * w;
				}
				role = wSum > 0 ? fSum / wSum : 1.0;
			}
			// 역할 보정계수 표시 업데이트
			var displays = wrap.querySelectorAll('.js-role-val');
			for(var d = 0; d < displays.length; d++) displays[d].textContent = Number(role).toFixed(2);
			var resultEl = wrap.querySelector('.js-role-display');
			if(resultEl) resultEl.textContent = Number(role).toFixed(2);
			// Persist role selection
			var _sel = [];
			for(var _si = 0; _si < chks.length; _si++) _sel.push(chks[_si].value);
			__hwRoleSelection[String(hardwareId)] = _sel;
			try{ sessionStorage.setItem('hw:role:' + hardwareId, JSON.stringify(_sel)); }catch(_){}
			hwRecalcTpmc(wrap);
		}
		function hwRecalcTpmc(wrap){
			var rows = wrap.querySelectorAll('.js-tpmc-row');
			// 역할 보정계수 값 가져오기
			var roleEl = wrap.querySelector('.js-role-display');
			var role = roleEl ? parseFloat(roleEl.textContent.replace(/,/g,'')) : 1.0;
			if(isNaN(role)) role = 1.0;
			// 안정화 보정계수
			var safetyInput = wrap.querySelector('.hw-factor-input[data-factor="safety"]');
			var safety = safetyInput ? parseFloat(safetyInput.value) : 0.8;
			if(isNaN(safety)) safety = 0.8;
			// 모든 safety input 동기화
			var allSafety = wrap.querySelectorAll('.hw-factor-input[data-factor="safety"]');
			for(var si = 0; si < allSafety.length; si++) allSafety[si].value = safety;
			var sumTotal = 0, sumManaged = 0;
			for(var i = 0; i < rows.length; i++){
				var row = rows[i];
				var ac = parseFloat(row.getAttribute('data-ac')) || 0;
				var pc = parseFloat(row.getAttribute('data-pc')) || 0;
				var virt = parseFloat(row.getAttribute('data-virt')) || 1;
				var comp = ac * pc;
				var lineTotal = comp * role * virt;
				var lineManaged = lineTotal * safety;
				sumTotal += lineTotal;
				sumManaged += lineManaged;
				var elT = row.querySelector('.js-row-total');
				var elM = row.querySelector('.js-row-managed');
				if(elT) elT.textContent = hwFmtNum(lineTotal, 2);
				if(elM) elM.textContent = hwFmtNum(lineManaged, 2);
			}
			var elTotal = wrap.querySelector('.js-tpmc-total');
			var elManaged = wrap.querySelector('.js-tpmc-managed');
			if(elTotal) elTotal.textContent = hwFmtNum(sumTotal, 2);
			if(elManaged) elManaged.textContent = hwFmtNum(sumManaged, 2);
		}
		function hwRefreshTpmcSummary(){
			// TPMC 정보는 확장 행에서 이미 표시되므로 별도 요약 박스는 숨김
			hwHideTpmcBox();
		}
		function hwHideTpmcBox(){
			var box = document.getElementById('hw-tpmc-summary');
			if(box) box.style.display = 'none';
		}
		function hwRenderTpmcBox(data){
			var container = table.parentElement || table.parentNode;
			if(!container) return;
			var box = document.getElementById('hw-tpmc-summary');
			if(!box){
				box = document.createElement('div');
				box.id = 'hw-tpmc-summary';
				box.className = 'hw-tpmc-summary';
				// Insert after the table
				if(table.nextSibling) container.insertBefore(box, table.nextSibling);
				else container.appendChild(box);
			}
			box.style.display = '';

			var total = data.tpmc_total;
			var managed = data.tpmc_managed;
			var calculable = data.calculable;
			var error = data.error;
			var roleFactor = data.role_factor || 1.0;
			var virtFactor = data.virtualization_factor || 1.0;

			var html = '<div class="hw-tpmc-header">'
				+ '<span class="hw-tpmc-title">TPMC</span>';

			if(calculable && total != null){
				html += '<span class="hw-tpmc-value">'
					+ '<span class="hw-tpmc-label">산출 TPMC</span>'
					+ '<span class="hw-tpmc-number">' + hwEscapeHtml(Number(total).toLocaleString('ko-KR')) + '</span>'
					+ '</span>'
					+ '<span class="hw-tpmc-value">'
					+ '<span class="hw-tpmc-label">운영 TPMC</span>'
					+ '<span class="hw-tpmc-number managed">' + hwEscapeHtml(Number(managed).toLocaleString('ko-KR')) + '</span>'
					+ '</span>';
			} else {
				html += '<span class="hw-tpmc-badge error" title="' + hwEscapeHtml(error || '계산 불가') + '">계산 불가</span>';
			}
			html += '</div>';

			// Factor details
			if(calculable){
				var factors = [];
				if(virtFactor !== 1.0) factors.push('가상화 ×' + virtFactor);
				if(roleFactor !== 1.0) factors.push('역할 ×' + roleFactor);
				factors.push('안전율 ×0.8');
				html += '<div class="hw-tpmc-factors">' + hwEscapeHtml(factors.join(' · ')) + '</div>';
			}

			box.innerHTML = html;
		}

		function updateEmptyState(){
			try{
				var hasRows = hwTotal() > 0;
				var hasSystem = false;
				try{
					var tbody = tbodyEl();
					hasSystem = !!(tbody && tbody.querySelector && tbody.querySelector('tr[data-system="1"]'));
				}catch(_eSys){ hasSystem = false; }
				// If the system row exists, don't show the "no hardware items" empty state.
				var showEmpty = !(hasRows || hasSystem);
				if(empty){ empty.hidden = !showEmpty; empty.style.display = showEmpty ? '' : 'none'; }
			}catch(_e0){ if(empty){ empty.hidden = false; empty.style.display = ''; } }
			try{
				var csvBtn = byId('hw-download-btn');
				if(csvBtn){ var hasAny = hwSavedVisibleRows(table).length > 0; csvBtn.disabled = !hasAny; csvBtn.setAttribute('aria-disabled', (!hasAny).toString()); csvBtn.title = hasAny ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.'; }
			}catch(_e1){ }
			hwRenderPage();
		}

		function hwUpdatePaginationUI(){
			if(infoEl){
				var total = hwTotal();
				var hasSystem = !!(tbodyEl() && tbodyEl().querySelector('tr[data-system="1"]'));
				var displayTotal = total + (hasSystem ? 1 : 0);
				var start = displayTotal ? (hwState.page-1)*hwState.pageSize + 1 : 0;
				var end = Math.min(displayTotal, hwState.page*hwState.pageSize);
				infoEl.textContent = start + '-' + end + ' / ' + displayTotal + '개 항목';
			}
			if(numWrap){
				var pages = hwPages();
				numWrap.innerHTML = '';
				for(var p=1; p<=pages && p<=50; p++){
					var b = document.createElement('button');
					b.className = 'page-btn' + (p===hwState.page ? ' active' : '');
					b.textContent = String(p);
					b.dataset.page = String(p);
					numWrap.appendChild(b);
				}
			}
			var pages2 = hwPages();
			if(btnFirst) btnFirst.disabled = (hwState.page === 1);
			if(btnPrev) btnPrev.disabled = (hwState.page === 1);
			if(btnNext) btnNext.disabled = (hwState.page === pages2);
			if(btnLast) btnLast.disabled = (hwState.page === pages2);
			var sizeSel = byId('hw-page-size');
			if(sizeSel){
				var hasSystemRow = !!(tbodyEl() && tbodyEl().querySelector('tr[data-system="1"]'));
				var none = (hwTotal() === 0 && !hasSystemRow);
				sizeSel.disabled = none;
				if(none){ try{ sizeSel.value = '10'; hwState.pageSize = 10; }catch(_){ } }
			}
		}
		function hwRenderPage(){
			hwClampPage();
			var rows = nonSystemRows();
			var startIdx = (hwState.page-1)*hwState.pageSize;
			var endIdx = startIdx + hwState.pageSize - 1;
			rows.forEach(function(tr, idx){
				var visible = idx>=startIdx && idx<=endIdx;
				tr.style.display = visible ? '' : 'none';
				if(visible) tr.removeAttribute('data-hidden'); else tr.setAttribute('data-hidden','1');
				// 확장 행도 부모와 함께 숨김 처리
				if(tr._expandRow && !visible){ tr._expandRow.style.display = 'none'; }
				var cb = tr.querySelector('.hw-row-check');
				if(cb) tr.classList.toggle('selected', !!cb.checked && visible);
			});
			hwUpdatePaginationUI();
			if(selectAll){
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]):not([data-system="1"]) .hw-row-check');
				if(visChecks.length){
					selectAll.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; });
				}else{
					selectAll.checked = false;
				}
			}
		}
		function hwGo(p){ hwState.page = p; hwRenderPage(); }
		function hwGoDelta(d){ hwGo(hwState.page + d); }
		function hwGoFirst(){ hwGo(1); }
		function hwGoLast(){ hwGo(hwPages()); }
		if(numWrap){ numWrap.addEventListener('click', function(e){ var b = e.target.closest('button.page-btn'); if(!b) return; var p = parseInt(b.dataset.page,10); if(!isNaN(p)) hwGo(p); }); }
		if(btnFirst) btnFirst.addEventListener('click', hwGoFirst);
		if(btnPrev) btnPrev.addEventListener('click', function(){ hwGoDelta(-1); });
		if(btnNext) btnNext.addEventListener('click', function(){ hwGoDelta(1); });
		if(btnLast) btnLast.addEventListener('click', hwGoLast);

		if(selectAll){
			selectAll.addEventListener('change', function(){
				var checked = !!selectAll.checked;
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]):not([data-system="1"]) .hw-row-check');
				Array.prototype.forEach.call(visChecks, function(cb){ cb.checked = checked; try{ cb.dispatchEvent(new Event('change')); }catch(_){ } });
				hwRenderPage();
			});
		}
		table.addEventListener('change', function(e){
			var cb = e.target && e.target.classList && e.target.classList.contains('hw-row-check') ? e.target : null;
			if(!cb) return;
			try{ var tr = cb.closest('tr'); if(tr){ tr.classList.toggle('selected', !!cb.checked); } }catch(_){ }
			hwRenderPage();
		});

		function setCellInput(tr, col, html){
			var td = tr.querySelector('[data-col="'+col+'"]');
			if(!td) return;
			td.innerHTML = html;
		}
		function cellText(tr, col){
			var td = tr.querySelector('[data-col="'+col+'"]');
			return td ? hwTrim(td.textContent || '') : '';
		}
		function inputValue(tr, col){
			var td = tr.querySelector('[data-col="'+col+'"]');
			if(!td) return '';
			var el = td.querySelector('input, select, textarea');
			return hwTrim(el ? el.value : (td.textContent || ''));
		}
		function commitCell(tr, col, val){
			var td = tr.querySelector('[data-col="'+col+'"]');
			if(!td) return;
			var s = hwTrim(val);
			td.textContent = s ? s : '-';
		}
		function setError(el, on){
			if(!el) return;
			try{
				if(on){ el.classList.add('input-error'); el.setAttribute('aria-invalid','true'); }
				else { el.classList.remove('input-error'); el.removeAttribute('aria-invalid'); }
			}catch(_){ }
		}
		function editVal(tr, col){
			var v = cellText(tr, col);
			return (v === '-' || v === '—') ? '' : v;
		}
		function enterEdit(tr){
			if(isSystemRow(tr)) return;
			// type
			var currentType = cellText(tr,'type');
			var normType = String(currentType || '').toUpperCase();
			var options = ['<option value=""'+(normType?'':' selected')+'>선택</option>']
				.concat(typeOptions.map(function(o){ return '<option value="'+o+'"'+(o===normType?' selected':'')+'>'+o+'</option>'; })).join('');
			setCellInput(tr,'type','<select class="search-select" data-searchable-scope="page" data-placeholder="선택">'+options+'</select>');
			// model
			setCellInput(tr,'model','<input type="text" value="'+editVal(tr,'model').replace(/"/g,'&quot;')+'" placeholder="모델명 (필수)">');
			if(hasSpecCol){
				var specVal = editVal(tr,'spec').replace(/\s*(Core|GB|Gbps)\s*$/i, '');
				var specDisabled = !!(window.BlossomHwInventoryCatalog && isInventorySchema);
				setCellInput(tr,'spec','<input type="number" min="0" step="1" value="'+specVal.replace(/"/g,'&quot;')+'" placeholder="'+(specDisabled?'(자동)':'용량')+'"'+(specDisabled?' disabled':'')+'>');
			}
			// vendor (hidden column – keep data for DB persistence)
			var vendorVal = editVal(tr,'vendor');
			var vendorDisabled = !!(window.BlossomHwInventoryCatalog && isInventorySchema);
			setCellInput(tr,'vendor','<input type="text" value="'+vendorVal.replace(/"/g,'&quot;')+'" placeholder="'+(vendorDisabled?'(자동)':'제조사')+'"'+(vendorDisabled?' disabled':'')+'>');
			try{ tr.querySelector('[data-col="vendor"]').style.display = 'none'; }catch(_vh){}
			// qty
			if(isInventorySchema){
				var q = parseInt(cellText(tr,'qty'),10);
				if(isNaN(q) || q < 1) q = 1;
				setCellInput(tr,'qty','<input type="number" min="1" step="1" value="'+q+'" placeholder="수량 (필수)">');
			}
			if(hasActiveCapCol){
				var acVal = editVal(tr,'active_capacity').replace(/\s*(Core|GB|Gbps)\s*$/i, '');
				var specRaw = hasSpecCol ? editVal(tr,'spec').replace(/\s*(Core|GB|Gbps)\s*$/i, '') : '';
				var qtyRaw = isInventorySchema ? q : 1;
				var specNum = parseInt(specRaw,10), qtyNum = parseInt(qtyRaw,10);
				var maxVal = (!isNaN(specNum) && !isNaN(qtyNum) && specNum > 0) ? specNum * qtyNum : '';
				var maxAttr = maxVal !== '' ? ' max="'+maxVal+'"' : '';
				setCellInput(tr,'active_capacity','<input type="number" min="0" step="1"'+maxAttr+' value="'+acVal.replace(/"/g,'&quot;')+'" placeholder="활성용량">');
			}
			// fw/maintenance-or-remark
			setCellInput(tr,'fw','<input type="text" value="'+editVal(tr,'fw').replace(/"/g,'&quot;')+'" placeholder="펌웨어">');
			if(hasSerialCol){
				setCellInput(tr,'serial','<input type="text" value="'+editVal(tr,'serial').replace(/"/g,'&quot;')+'" placeholder="일련번호">');
			}
			if(hasMaintenanceCol){
				var mt = editVal(tr,'maintenance').replace(/"/g,'&quot;');
				setCellInput(tr,'maintenance','<span class="hw-readonly" data-readonly="1">'+(mt?mt:'-')+'</span>');
			}else if(hasRemarkCol){
				setCellInput(tr,'remark','<input type="text" value="'+editVal(tr,'remark').replace(/"/g,'&quot;')+'" placeholder="비고">');
			}

			try{ if(window.BlossomHwInventoryCatalog && !isSystemRow(tr) && typeof window.BlossomHwInventoryCatalog.enhanceRow === 'function') window.BlossomHwInventoryCatalog.enhanceRow(tr); }catch(_e){ }

			var toggle = tr.querySelector('.js-hw-toggle');
			if(toggle){
				toggle.setAttribute('data-action','save');
				toggle.title='저장'; toggle.setAttribute('aria-label','저장');
				toggle.innerHTML = '<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
			}
		}
		function exitEdit(tr){
			// commit from inputs
			var typeEl = tr.querySelector('[data-col="type"] select');
			var typeVal = hwTrim(typeEl ? typeEl.value : inputValue(tr,'type'));
			commitCell(tr,'type', typeVal);
			commitCell(tr,'model', inputValue(tr,'model'));
			if(hasSpecCol){
				var rawSpec = inputValue(tr,'spec');
				var specDisplay = specWithUnit(typeVal, rawSpec);
				commitCell(tr,'spec', specDisplay || rawSpec);
			}
			commitCell(tr,'vendor', inputValue(tr,'vendor'));
			var rawQty = '1';
			if(isInventorySchema){ rawQty = inputValue(tr,'qty'); commitCell(tr,'qty', rawQty); }
			if(hasActiveCapCol){
				var rawAc = inputValue(tr,'active_capacity');
				if(hasSpecCol && rawSpec !== '' && rawAc !== ''){
					var nAc = parseInt(rawAc,10), nSpec = parseInt(rawSpec,10), nQty = parseInt(rawQty,10) || 1;
					var maxCap = nSpec * nQty;
					if(!isNaN(nAc) && !isNaN(maxCap) && nAc > maxCap){ rawAc = String(maxCap); }
				}
				commitCell(tr,'active_capacity', specWithUnit(typeVal, rawAc));
			}
			commitCell(tr,'fw', inputValue(tr,'fw'));
			if(hasSerialCol) commitCell(tr,'serial', inputValue(tr,'serial'));
			if(hasMaintenanceCol) commitCell(tr,'maintenance', inputValue(tr,'maintenance'));
			else if(hasRemarkCol) commitCell(tr,'remark', inputValue(tr,'remark'));
			var toggle = tr.querySelector('.js-hw-toggle');
			if(toggle){
				toggle.setAttribute('data-action','edit');
				toggle.title='편집'; toggle.setAttribute('aria-label','편집');
				toggle.innerHTML = '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
			}
			// 확장 버튼: CPU일 때만 표시
			var isCpuNow = typeVal.toUpperCase() === 'CPU';
			var existingExpand = tr.querySelector('.js-hw-expand');
			if(isCpuNow && !existingExpand){
				var actTd = tr.querySelector('.system-actions');
				if(actTd) actTd.insertAdjacentHTML('afterbegin', '<button class="action-btn js-hw-expand" type="button" title="확장" aria-label="확장"><img src="/static/image/svg/free-icon-font-apps-add.svg" alt="확장" class="action-icon"></button> ');
				if(!tr._expandRow){
					var _cc=0; for(var _ci=0;_ci<tr.children.length;_ci++){if(tr.children[_ci].style.display!=='none')_cc++;}
					var _er=document.createElement('tr'); _er.className='hw-expand-row'; _er.style.display='none';
					var _et=document.createElement('td'); _et.setAttribute('colspan',String(_cc)); _et.className='hw-expand-cell';
					_et.innerHTML='<div class="hw-expand-loading">로딩 중...</div>'; _er.appendChild(_et);
					tr.parentNode.insertBefore(_er, tr.nextSibling);
					tr._expandRow = _er;
				}
			} else if(!isCpuNow && existingExpand){
				existingExpand.remove();
				if(tr._expandRow){ try{ tr._expandRow.remove(); }catch(_re){} tr._expandRow = null; }
			}
			updateEmptyState();
		}
		function validateRow(tr){
			var firstInvalid = null;
			var modelEl = tr.querySelector('[data-col="model"] input');
			var modelVal = inputValue(tr,'model');
			if(!modelVal){ setError(modelEl,true); firstInvalid = firstInvalid || modelEl; } else setError(modelEl,false);
			var typeEl = tr.querySelector('[data-col="type"] select');
			var typeVal = hwTrim(typeEl ? typeEl.value : inputValue(tr,'type'));
			if(!typeVal){ setError(typeEl,true); firstInvalid = firstInvalid || typeEl; } else setError(typeEl,false);
			var qtyEl = tr.querySelector('[data-col="qty"] input');
			var qtyVal = 1;
			if(isInventorySchema){
				var qRaw = inputValue(tr,'qty');
				var q = parseInt(qRaw,10);
				if(!qRaw || isNaN(q) || q < 1){ setError(qtyEl,true); firstInvalid = firstInvalid || qtyEl; }
				else { setError(qtyEl,false); qtyVal = q; }
			}
			if(firstInvalid){ try{ firstInvalid.focus(); }catch(_){ } return null; }
			return { type: typeVal, model: modelVal, qty: qtyVal };
		}

		function buildPayload(tr){
			var payload = {};
			payload.type = inputValue(tr,'type');
			payload.model = inputValue(tr,'model');
			if(hasSpecCol) payload.spec = inputValue(tr,'spec');
			if(hasActiveCapCol) payload.active_capacity = inputValue(tr,'active_capacity');
			payload.vendor = inputValue(tr,'vendor');
			if(isInventorySchema) payload.qty = parseInt(inputValue(tr,'qty'),10) || 1;
			payload.fw = inputValue(tr,'fw');
			if(hasSerialCol) payload.serial = inputValue(tr,'serial');
			// maintenance is derived (tab61) and must not be saved from this UI
			if(hasRemarkCol) payload.remark = inputValue(tr,'remark');
			return payload;
		}

		function setBusy(on){
			try{ if(btnAdd) btnAdd.disabled = !!on; }catch(_){ }
			try{ var csvBtn = byId('hw-download-btn'); if(csvBtn) csvBtn.disabled = !!on; }catch(_){ }
		}

		function reloadFromApi(){
			var base = apiBase();
			if(!base){
				ensureSystemRow();
				updateEmptyState();
				return;
			}
			setBusy(true);
			apiFetchJson(base, { method:'GET' })
				.then(function(res){
					setBusy(false);
					if(!(res && res.ok && res.json && res.json.success)){
						var msg = (res && res.json && res.json.message) ? res.json.message : '하드웨어 구성 목록 조회 중 오류가 발생했습니다.';
						hwNotify('조회 실패', msg);
						renderItems([]);
						return;
					}
					renderItems(res.json.items || []);
				})
				.catch(function(err){
					setBusy(false);
					try{ console.error('[tab01-hardware] load failed', err); }catch(_){ }
					renderItems([]);
				});
		}

		function addNewRow(){
			var tbody = tbodyEl();
			if(!tbody) return;
			ensureSystemRow();
			var tr = document.createElement('tr');
			var tdC = document.createElement('td'); tdC.innerHTML = '<input type="checkbox" class="hw-row-check" aria-label="행 선택">'; tr.appendChild(tdC);
			tr.appendChild(makeViewCell('type',''));
			tr.appendChild(makeViewCell('model',''));
			if(hasSpecCol) tr.appendChild(makeViewCell('spec',''));
			var _vTd2 = makeViewCell('vendor',''); _vTd2.style.display = 'none'; tr.appendChild(_vTd2);
			if(isInventorySchema) tr.appendChild(makeViewCell('qty','1'));
			if(hasActiveCapCol) tr.appendChild(makeViewCell('active_capacity',''));
			tr.appendChild(makeViewCell('fw',''));
			if(hasSerialCol) tr.appendChild(makeViewCell('serial',''));
			if(hasMaintenanceCol) tr.appendChild(makeViewCell('maintenance',''));
			else if(hasRemarkCol) tr.appendChild(makeViewCell('remark',''));
			tr.appendChild(makeActionsCell('edit', ''));
			tbody.appendChild(tr);
			enterEdit(tr);
			try{ hwRefreshSystemMaintenanceFromTab61(storagePrefix, getSelectedRow()); }catch(_eMt3){ }
			try{ hwGoLast(); }catch(_){ }
			updateEmptyState();
		}
		if(btnAdd){ btnAdd.addEventListener('click', function(){ addNewRow(); }); }

		// Delegated actions: edit/save/delete (+ system row edit)
		table.addEventListener('click', function(ev){
			var btn = ev.target && ev.target.closest ? ev.target.closest('.js-hw-expand, .js-hw-toggle, .js-hw-del, .hw-system-edit') : null;
			if(!btn) return;
			var tr = ev.target.closest('tr');
			if(!tr) return;

			// 확장 버튼
			if(btn.classList.contains('js-hw-expand')){
				var expRow = tr._expandRow;
				if(!expRow) return;
				var isOpen = expRow.style.display !== 'none';
				expRow.style.display = isOpen ? 'none' : '';
				btn.classList.toggle('hw-expanded', !isOpen);
				if(!isOpen) hwLoadExpandDetail(tr);
				return;
			}

			// System row edit/save (inline; no redirect)
			if(btn.classList.contains('hw-system-edit')){
				if(!isSystemRow(tr)) return;
				var act = btn.getAttribute('data-action') || 'edit';
				if(act === 'save'){
					saveSystemEdit(tr);
					try{ hwRefreshSystemMaintenanceFromTab61(storagePrefix, getSelectedRow()); }catch(_eMtSys){ }
				}
				else enterSystemEdit(tr);
				updateEmptyState();
				return;
			}
			if(btn.classList.contains('js-hw-del')){
				if(isSystemRow(tr)) return;
				hwOpenDeleteModal(tr, function(delTr){
					if(!delTr) return;
					var base = apiBase();
					var idAttr = delTr.getAttribute('data-id');
					var rowId = idAttr ? parseInt(idAttr, 10) : NaN;
					if(base && !isNaN(rowId) && rowId > 0){
						apiFetchJson(base + '/' + rowId, { method:'DELETE' })
							.then(function(res){
								if(!(res && res.ok && res.json && res.json.success)){
									var msg = (res && res.json && res.json.message) ? res.json.message : '하드웨어 구성 삭제 중 오류가 발생했습니다.';
									hwNotify('삭제 실패', msg);
									return;
								}
								try{ delTr.parentNode.removeChild(delTr); }catch(_){ }
								updateEmptyState();
							})
							.catch(function(_e){ hwNotify('삭제 실패','하드웨어 구성 삭제 중 오류가 발생했습니다.'); });
						return;
					}
					try{ delTr.parentNode.removeChild(delTr); }catch(_e2){ }
					updateEmptyState();
				});
				return;
			}

			if(btn.classList.contains('js-hw-toggle')){
				var action = btn.getAttribute('data-action') || 'edit';
				if(action === 'edit'){
					enterEdit(tr);
					return;
				}
				if(action === 'save'){
					if(isSystemRow(tr)) return;
					var ok = validateRow(tr);
					if(!ok) return;
					var base2 = apiBase();
					if(!base2){ hwNotify('저장 실패','자산 ID(hardware_id)를 찾을 수 없습니다. 목록에서 다시 선택해 주세요.'); return; }
					var payload = buildPayload(tr);
					var existingIdAttr = tr.getAttribute('data-id');
					var existingId = existingIdAttr ? parseInt(existingIdAttr,10) : NaN;
					btn.disabled = true;
					var method = (!isNaN(existingId) && existingId > 0) ? 'PUT' : 'POST';
					var url = (!isNaN(existingId) && existingId > 0) ? (base2 + '/' + existingId) : base2;
					apiFetchJson(url, { method: method, body: JSON.stringify(payload) })
						.then(function(res){
							if(!(res && res.ok && res.json && res.json.success)){
								var msg = (res && res.json && res.json.message) ? res.json.message : '하드웨어 구성 저장 중 오류가 발생했습니다.';
								hwNotify('저장 실패', msg);
								return;
							}
							var item = res.json.item || {};
							try{ if(item.id != null) tr.setAttribute('data-id', String(item.id)); }catch(_){ }
							exitEdit(tr);
							try{ hwRefreshSystemMaintenanceFromTab61(storagePrefix, getSelectedRow()); }catch(_eMtSave){ }
						})
						.catch(function(_e){ hwNotify('저장 실패','하드웨어 구성 저장 중 오류가 발생했습니다.'); })
						.finally(function(){ try{ btn.disabled = false; }catch(_){ } });
					return;
				}
			}
		});

		wireHwDownloadModal();
		ensureSystemRow();
		try{ refreshSystemRow(); }catch(_eSys){ }
		reloadFromApi();
		return true;
	}

	// Init
	function init(){
		_hwDeleteModalWired = false;
		wireHwDeleteModal2();
		wireHwDownloadModal();
		initHardwareTable();
	}

	window.BlossomTab01Hardware = {
		hasHwCsv: true,
		handlesTable: true,
		init: init,
		wireHwDownloadModal: wireHwDownloadModal,
		hwExportCSV: hwExportCSV,
		refreshSystemRow: refreshSystemRow
	};

	if(document && document.readyState && document.readyState !== 'loading') init();
	else document.addEventListener('DOMContentLoaded', init);
})();

