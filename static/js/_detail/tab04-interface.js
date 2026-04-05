/*
 * tab04-interface.js
 * Interface tab behavior.
 */

(function(){
	// Utilities

	

	if(window.BlossomTab04Interface) return;

	function ifTrim(v){ return String(v == null ? '' : v).trim(); }

	function getPageKey(){
		try{
			var m = String(location.pathname||'').match(/\/p\/([^\/\?#]+)/);
			return m && m[1] ? decodeURIComponent(m[1]) : '';
		}catch(_){ return ''; }
	}

	function getStoragePrefix(fallback){
		try{
			if(typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) return STORAGE_PREFIX;
		}catch(_){ }
		return fallback || 'detail';
	}

	function ensureUrlHasAssetId(assetId){
		// 보안: asset_id를 URL에 노출하지 않음 — sessionStorage로만 전달
		try{ if(!(assetId > 0)) return; }catch(_){ return; }
		try{
			var qs = new URLSearchParams(location.search || '');
			if(qs.has('asset_id')){
				qs.delete('asset_id');
				var clean = qs.toString();
				history.replaceState({}, '', location.pathname + (clean ? '?' + clean : '') + (location.hash || ''));
			}
		}catch(_){ }
	}

	function ensureTabLinksCarryAssetId(assetId){
		// 보안: asset_id를 탭 링크 URL에 노출하지 않고 기존 파라미터가 있으면 제거
		try{ if(!(assetId > 0)) return; }catch(_){ return; }
		try{
			var tabs = document.querySelectorAll('.server-detail-tabs a.server-detail-tab-btn');
			Array.from(tabs).forEach(function(a){
				try{
					if(!a) return;
					var href = a.getAttribute('href') || a.href;
					if(!href) return;
					var u = new URL(href, window.location.origin);
					if(!u.pathname || u.pathname.indexOf('/p/') !== 0) return;
					if(u.searchParams.has('asset_id')){
						u.searchParams.delete('asset_id');
						a.setAttribute('href', u.pathname + (u.searchParams.toString() ? ('?' + u.searchParams.toString()) : '') + (u.hash || ''));
					}
				}catch(_e){ }
			});
		}catch(_){ }
	}

	function ifSyncSearchable(root){
		try{
			if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
				window.BlossomSearchableSelect.syncAll(root || document);
				return true;
			}
		}catch(_){ }
		return false;
	}

	function ifEnsureSearchableSoon(root){
		if(ifSyncSearchable(root)) return;
		var tries = 0;
		var timer = setInterval(function(){
			tries += 1;
			if(ifSyncSearchable(root) || tries >= 15){
				try{ clearInterval(timer); }catch(_){ }
			}
		}, 100);
	}

	function getAssetId(storagePrefix){
		function persistSelectedAssetId(n){
			try{ if(!(n > 0)) return; }catch(_){ return; }
			try{ sessionStorage.setItem(storagePrefix+':selected:asset_id', String(n)); }catch(_){ }
			try{ localStorage.setItem(storagePrefix+':selected:asset_id', String(n)); }catch(_){ }
			try{ localStorage.setItem(storagePrefix+':last_selected_asset_id', String(n)); }catch(_){ }
		}

		
		try{
			var sid = sessionStorage.getItem(storagePrefix+':selected:asset_id') || localStorage.getItem(storagePrefix+':selected:asset_id');
			if(sid != null){
				var sn = parseInt(String(sid).trim(), 10);
				if(!isNaN(sn) && sn > 0){ persistSelectedAssetId(sn); return sn; }
			}
		}catch(_){ }

		
		try{
			var raw = sessionStorage.getItem(storagePrefix+':selected:row') || localStorage.getItem(storagePrefix+':selected:row');
			if(raw){
				var row = JSON.parse(raw);
				var id = row && (
					row.id != null ? row.id
					: (row.asset_id != null ? row.asset_id
					: (row.assetId != null ? row.assetId
					: (row.assetID != null ? row.assetID
					: (row.hardware_id != null ? row.hardware_id
					: (row.hardwareId != null ? row.hardwareId
					: (row.server_id != null ? row.server_id : null))))))
				);
				var n = parseInt(id, 10);
				if(!isNaN(n) && n > 0){ persistSelectedAssetId(n); return n; }
			}
		}catch(_){ }

		
		try{
			var qs = new URLSearchParams(location.search||'');
			var keys = ['asset_id','assetId','id','hardware_id','hardwareId','server_id'];
			for(var i=0;i<keys.length;i++){
				var cand = qs.get(keys[i]);
				var nn = parseInt(cand, 10);
				if(!isNaN(nn) && nn > 0){ persistSelectedAssetId(nn); return nn; }
			}
		}catch(_){ }

		
		try{
			var last = localStorage.getItem(storagePrefix+':last_selected_asset_id');
			var ln = parseInt(String(last == null ? '' : last).trim(), 10);
			if(!isNaN(ln) && ln > 0){ persistSelectedAssetId(ln); return ln; }
		}catch(_){ }

		return null;
	}

	function escHtml(s){
		return String(s == null ? '' : s)
			.replace(/&/g,'&amp;')
			.replace(/</g,'&lt;')
			.replace(/>/g,'&gt;')
			.replace(/"/g,'&quot;')
			.replace(/'/g,'&#39;');
	}

	function escAttr(s){
		return String(s == null ? '' : s)
			.replace(/&/g,'&amp;')
			.replace(/</g,'&lt;')
			.replace(/>/g,'&gt;')
			.replace(/"/g,'&quot;')
			.replace(/'/g,'&#39;');
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

	function getRowId(tr){
		if(!tr) return null;
		var v = tr.dataset.interfaceId || tr.dataset.ifId || tr.getAttribute('data-interface-id') || tr.getAttribute('data-if-id');
		var n = parseInt(v, 10);
		return (!isNaN(n) && n > 0) ? n : null;
	}

	function setRowId(tr, id){
		try{
			var n = parseInt(id, 10);
			if(isNaN(n) || n <= 0) return;
			tr.dataset.interfaceId = String(n);
			tr.setAttribute('data-interface-id', String(n));
		}catch(_){ }
	}

	function ifFormatPeerLabel(workName, systemName){
		var w = ifTrim(workName);
		var s = ifTrim(systemName);
		if(w && s) return w + ' (' + s + ')';
		return w || s || '';
	}

	function ifStatusDotHtml(color){
		var bg = ifTrim(color) || '#6b7280';
		return '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;vertical-align:middle;margin-right:6px;background:'+escAttr(bg)+'" aria-hidden="true"></span>';
	}

	function ifParsePeerWorkName(label){
		var s = ifTrim(label);
		if(!s) return '';
		var m = s.match(/^(.+?)\s*\([^\)]*\)\s*$/);
		if(m && m[1]) return ifTrim(m[1]);
		return s;
	}

	async function ifFetchAssetsByCategory(assetCategory){
		var cat = ifTrim(assetCategory).toUpperCase();
		if(!cat) return [];
		var url = '/api/hardware/assets?asset_category=' + encodeURIComponent(cat) + '&page=1&page_size=5000';
		var r = await fetch(url, { method:'GET', headers:{'Accept':'application/json'} });
		var j = await r.json().catch(function(){ return null; });
		if(!r.ok || !j || j.success !== true){ throw new Error((j && j.message) ? j.message : ('HTTP '+r.status)); }
		var items = Array.isArray(j.items) ? j.items : [];
		items.forEach(function(it){ if(it && !it.asset_category) it.asset_category = cat; });
		return items;
	}

	async function ifFetchAllHardwareAssets(){
		var cats = ['SERVER','STORAGE','SAN','NETWORK','SECURITY'];
		var all = [];
		for(var i=0;i<cats.length;i++){
			try{ all = all.concat(await ifFetchAssetsByCategory(cats[i])); }
			catch(_e){ }
		}
		return all;
	}

	// API

	

	

	

	function ifIsPeerLinkedScope(scopeKey){
		var sk = String(scopeKey || '').toLowerCase();
		return sk.indexOf('hw_san_') === 0 || sk.indexOf('hw_network_') === 0
			|| sk.indexOf('cat_hw_san_') === 0 || sk.indexOf('cat_hw_network_') === 0;
	}

	async function apiListAny(assetId, workName){
		var params = 'page=1&page_size=5000';
		if(assetId) params += '&asset_id=' + encodeURIComponent(String(assetId));
		if(workName) params += '&work_name=' + encodeURIComponent(String(workName));
		var url = '/api/hw-interfaces?' + params;
		var r = await fetch(url, { method:'GET', headers:{'Accept':'application/json'} });
		var j = await r.json().catch(function(){ return null; });
		if(!r.ok){ throw new Error((j && j.error) ? j.error : ('HTTP '+r.status)); }
		return j;
	}

	async function ifFetchPeerInterfaceForPort(peerAssetId, portName, peerWorkName){
		if(!ifTrim(portName)) return null;
		try{
			var data = await apiListAny(peerAssetId, peerWorkName);
			var items = (data && data.items) ? data.items : [];
			var pn = ifTrim(portName);
			for(var i=0; i<items.length; i++){
				if(ifTrim(items[i].port) === pn) return items[i];
			}
		}catch(_){}
		return null;
	}

	async function ifFetchPeerPortsByAssetId(peerAssetId, peerWorkName){
		try{
			var data = await apiListAny(peerAssetId, peerWorkName);
			var items = (data && data.items) ? data.items : [];
			var set = new Set();
			items.forEach(function(it){
				var p = ifTrim(it && it.port);
				if(p) set.add(p);
			});
			return Array.from(set).sort();
		}catch(_e){
			return [];
		}
	}

	function ifBuildPeerPortOptionsHtml(ports, selectedPort){
		var selected = ifTrim(selectedPort);
		var set = new Set();
		(ports || []).forEach(function(p){ var v=ifTrim(p); if(v) set.add(v); });
		var validSelection = selected && set.has(selected);
		var list = Array.from(set).sort();
		var opts = [];
		opts.push('<option value=""'+(validSelection?'':' selected')+'>선택</option>');
		list.forEach(function(p){
			var isSel = validSelection && p === selected;
			opts.push('<option value="'+escAttr(p)+'"'+(isSel?' selected':'')+'>'+escHtml(p)+'</option>');
		});
		return opts.join('');
	}

	function ifPopulatePeerPortSelect(sel, ports, selectedPort){
		if(!sel) return;
		sel.innerHTML = ifBuildPeerPortOptionsHtml(ports, selectedPort);
		var sp = ifTrim(selectedPort);
		var portsSet = new Set(); (ports||[]).forEach(function(p){ var v=ifTrim(p); if(v) portsSet.add(v); });
		try{ if(sp && portsSet.has(sp)) sel.value = String(sp); else sel.value = ''; }catch(_){ }
		try{ if(window.BlossomSearchableSelect){ window.BlossomSearchableSelect.enhance(sel); window.BlossomSearchableSelect.syncAll(sel); } }catch(_){ }
		ifEnsureSearchableSoon(sel);
	}

	function ifBuildPeerOptionsHtml(peerItems, selectedWorkName){
		var selected = ifTrim(selectedWorkName);
		var opts = [];
		opts.push('<option value=""'+(selected?'':' selected')+'>선택</option>');

		var items = (peerItems || []).slice();
		items.sort(function(a,b){
			var la = ifFormatPeerLabel(a && a.work_name, a && a.system_name).toLowerCase();
			var lb = ifFormatPeerLabel(b && b.work_name, b && b.system_name).toLowerCase();
			if(la < lb) return -1; if(la > lb) return 1; return 0;
		});

		var selectedApplied = false;
		items.forEach(function(it){
			if(!it) return;
			var workName = ifTrim(it.work_name);
			if(!workName) return;
			var searchText = ifFormatPeerLabel(workName, it.system_name) || workName;
			var isSel = (!selectedApplied && selected && workName === selected);
			if(isSel) selectedApplied = true;
			opts.push(
				'<option value="'+escAttr(workName)+'"'
					+' data-asset-id="'+escAttr(it.id)+'"'
					+' data-asset-category="'+escAttr(it.asset_category || '')+'"'
					+' data-asset-type="'+escAttr(it.asset_type || '')+'"'
					+' data-status-color="'+escAttr(it.work_status_color || '')+'"'
					+' data-search-text="'+escAttr(searchText)+'"'
					+' data-display-label="'+escAttr(workName)+'"'
					+' title="'+escAttr(searchText)+'"'
					+(isSel ? ' selected' : '')
				+'>'
					+escHtml(searchText)
				+'</option>'
			);
		});
		return opts.join('');
	}

	function ifPopulatePeerSelect(sel, peerItems, selectedWorkName){
		if(!sel) return;
		sel.innerHTML = ifBuildPeerOptionsHtml(peerItems, selectedWorkName);
		try{ if(selectedWorkName) sel.value = String(selectedWorkName); }catch(_){ }
		try{ if(window.BlossomSearchableSelect){ window.BlossomSearchableSelect.enhance(sel); window.BlossomSearchableSelect.syncAll(sel); } }catch(_){ }
		ifEnsureSearchableSoon(sel);
	}

	async function apiList(scopeKey, assetId){
		var url = '/api/hw-interfaces?scope_key=' + encodeURIComponent(scopeKey) + '&asset_id=' + encodeURIComponent(String(assetId)) + '&page=1&page_size=5000';
		var r = await fetch(url, { method:'GET', headers:{'Accept':'application/json'} });
		var j = await r.json().catch(function(){ return null; });
		if(!r.ok){ throw new Error((j && j.error) ? j.error : ('HTTP '+r.status)); }
		return j;
	}

	async function apiCreate(payload){
		var r = await fetch('/api/hw-interfaces', { method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body: JSON.stringify(payload||{}) });
		var j = await r.json().catch(function(){ return null; });
		if(!r.ok){ throw new Error((j && j.error) ? j.error : ('HTTP '+r.status)); }
		return j;
	}

	async function apiUpdate(id, payload){
		var r = await fetch('/api/hw-interfaces/' + encodeURIComponent(String(id)), { method:'PUT', headers:{'Content-Type':'application/json','Accept':'application/json'}, body: JSON.stringify(payload||{}) });
		var j = await r.json().catch(function(){ return null; });
		if(!r.ok){ throw new Error((j && j.error) ? j.error : ('HTTP '+r.status)); }
		return j;
	}

	async function apiDelete(id){
		var r = await fetch('/api/hw-interfaces/' + encodeURIComponent(String(id)), { method:'DELETE', headers:{'Accept':'application/json'} });
		var j = await r.json().catch(function(){ return null; });
		if(!r.ok){ throw new Error((j && j.error) ? j.error : ('HTTP '+r.status)); }
		return j;
	}

	// ── Delete-confirmation modal (tab14 style) ──
	var _ifPendingDeleteTr = null;
	var _ifDeleteCallback = null;

	function ifOpenDeleteModal(tr, onConfirm){
		_ifPendingDeleteTr = tr;
		_ifDeleteCallback = onConfirm || null;
		var msgEl = document.getElementById('if-delete-msg');
		if(msgEl) msgEl.textContent = '이 인터페이스를 삭제하시겠습니까?';
		var modal = document.getElementById('if-delete-modal');
		if(modal){ document.body.classList.add('modal-open'); modal.classList.add('show'); modal.setAttribute('aria-hidden','false'); }
	}

	function ifCloseDeleteModal(){
		_ifPendingDeleteTr = null;
		_ifDeleteCallback = null;
		var modal = document.getElementById('if-delete-modal');
		if(modal){ modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
	}

	function ifPerformDelete(){
		var tr = _ifPendingDeleteTr;
		var cb = _ifDeleteCallback;
		ifCloseDeleteModal();
		if(cb){ cb(tr); }
	}

	var _ifDeleteModalWired = false;
	function wireIfDeleteModal(){
		if(_ifDeleteModalWired) return;
		var modal = document.getElementById('if-delete-modal');
		if(!modal) return;
		_ifDeleteModalWired = true;
		var confirmBtn = document.getElementById('if-delete-confirm');
		var cancelBtn  = document.getElementById('if-delete-cancel');
		var closeBtn   = document.getElementById('if-delete-close');
		if(confirmBtn) confirmBtn.addEventListener('click', ifPerformDelete);
		if(cancelBtn)  cancelBtn.addEventListener('click', ifCloseDeleteModal);
		if(closeBtn)   closeBtn.addEventListener('click', ifCloseDeleteModal);
		modal.addEventListener('click', function(e){ if(e.target === modal) ifCloseDeleteModal(); });
		document.addEventListener('keydown', function(e){
			try{ if(e.key === 'Escape' && modal.classList.contains('show')) ifCloseDeleteModal(); }catch(_){ }
		});
	}

	// Init

	function init(options){
		options = options || {};

		var tableId = options.tableId || 'if-spec-table';
		var table = document.getElementById(tableId);
		if(!table){
			if(document && document.readyState === 'loading'){
				document.addEventListener('DOMContentLoaded', function(){ init(options); }, { once:true });
			}
			return;
		}
		if(table.dataset && table.dataset.tab04InterfaceInit === '1') return;
		try{ table.dataset.tab04InterfaceInit = '1'; }catch(_){ }

		wireIfDeleteModal();

		var empty = document.getElementById(options.emptyId || 'if-empty');
		var storagePrefix = getStoragePrefix(options.storagePrefix);
		var scopeKey = getPageKey() || storagePrefix;
		var peerCellDisplay = 'workOnly';
		var ifPeerCache = { loaded:false, items:[] };

		function ifPeerCellTextFromWorkName(workName){
			var w = ifTrim(workName);
			if(!w) return '';
			if(peerCellDisplay === 'workOnly') return w;
			for(var i=0;i<(ifPeerCache.items||[]).length;i++){
				var it = ifPeerCache.items[i];
				if(it && ifTrim(it.work_name) === w){
					return ifFormatPeerLabel(it.work_name, it.system_name) || w;
				}
			}
			return w;
		}

		function ifPeerCellHtmlFromWorkName(workName){
			var w = ifTrim(workName);
			if(!w) return '-';
			var color = '';
			var label = w;
			for(var i=0;i<(ifPeerCache.items||[]).length;i++){
				var it = ifPeerCache.items[i];
				if(it && ifTrim(it.work_name) === w){
					color = it.work_status_color || '';
					label = ifFormatPeerLabel(it.work_name, it.system_name) || w;
					break;
				}
			}
			return ifStatusDotHtml(color) + escHtml(label);
		}

		async function ifEnsurePeerCache(){
			if(ifPeerCache.loaded) return;
			try{
				ifPeerCache.items = await ifFetchAllHardwareAssets();
				ifPeerCache.loaded = true;
			}catch(_e){
				ifPeerCache.items = [];
				ifPeerCache.loaded = true;
			}
		}

		function ifPopulateAllPeerSelects(){
			try{
				Array.from(table.querySelectorAll('td[data-col="peer"] select.search-select')).forEach(function(sel){
					var cur = ifTrim(sel.value);
					ifPopulatePeerSelect(sel, ifPeerCache.items, cur);
				});
			}catch(_){ }
		}

		function ifGetPeerInfoFromRow(tr){
			try{
				var peerSel = tr.querySelector('td[data-col="peer"] select');
				var opt = peerSel && peerSel.selectedOptions ? peerSel.selectedOptions[0] : null;
				var assetId = opt ? (opt.getAttribute('data-asset-id') || (opt.dataset ? opt.dataset.assetId : '') || '') : '';
				var workName = opt ? ifTrim(opt.value) : '';
				return { assetId: assetId, workName: workName };
			}catch(_){ return { assetId: '', workName: '' }; }
		}

		async function ifUpdatePeerPortSelectForRow(tr){
			if(!tr) return;
			var portSel = tr.querySelector('td[data-col="peer_port"] select');
			if(!portSel) return;
			var selectedPort = ifTrim(portSel.value) || ifTrim(portSel.dataset.savedPort || '');
			try{ delete portSel.dataset.savedPort; }catch(_){ }
			var info = ifGetPeerInfoFromRow(tr);
			var ports = (info.assetId || info.workName) ? await ifFetchPeerPortsByAssetId(info.assetId, info.workName) : [];
			ifPopulatePeerPortSelect(portSel, ports, selectedPort);
		}

		async function ifSyncPeerFieldsForRow(tr){
			if(!tr || !ifIsPeerLinkedScope(scopeKey)) return;
			var info = ifGetPeerInfoFromRow(tr);
			var portSel = tr.querySelector('td[data-col="peer_port"] select');
			var peerPort = portSel ? ifTrim(portSel.value) : '';
			if((!info.assetId && !info.workName) || !peerPort){
				ifSetLinkedFields(tr, '', '');
				return;
			}
			var peerIf = await ifFetchPeerInterfaceForPort(info.assetId, peerPort, info.workName);
			if(peerIf){
				ifSetLinkedFields(tr, peerIf.serial || '', peerIf.assign || '');
			} else {
				ifSetLinkedFields(tr, '', '');
			}
		}

		function ifSetLinkedFields(tr, serial, assign){
			['serial','assign'].forEach(function(col){
				var val = col==='serial'?serial : assign;
				var td = tr.querySelector('[data-col="'+col+'"]');
				if(!td) return;
				var inp = td.querySelector('input');
				if(inp){
					inp.value = val || '';
				} else {
					td.textContent = val || '-';
				}
			});
		}

		/* ── 양방향 연결 동기화 (저장/삭제 시 상대 시스템 자동 매핑) ── */

		async function ifSyncBidirectionalLink(opts){
			// opts: { peerWorkName, peerPort, ourPort, oldPeerWorkName, oldPeerPort, isDelete }
			var ourWorkName = getOurWorkName();
			if(!ourWorkName) return;

			// 1) 이전 연결 해제 (peer가 변경되었거나 삭제된 경우)
			var oldPeer = ifTrim(opts.oldPeerWorkName);
			var oldPort = ifTrim(opts.oldPeerPort);
			if(oldPeer && oldPort){
				var needClear = opts.isDelete
					|| (oldPeer !== ifTrim(opts.peerWorkName))
					|| (oldPort !== ifTrim(opts.peerPort));
				if(needClear){
					try{ await ifClearRemoteLink(oldPeer, oldPort, ourWorkName); }catch(_){}
				}
			}

			// 2) 새 연결 설정
			if(opts.isDelete) return;
			var newPeer = ifTrim(opts.peerWorkName);
			var newPeerPort = ifTrim(opts.peerPort);
			var myPort = ifTrim(opts.ourPort);
			if(!newPeer || !newPeerPort || !myPort) return;
			try{ await ifSetRemoteLink(newPeer, newPeerPort, ourWorkName, myPort); }catch(_){}
		}

		async function ifClearRemoteLink(peerWorkName, peerPort, ourWorkName){
			var peerAssetId = '';
			for(var k=0;k<(ifPeerCache.items||[]).length;k++){
				var it = ifPeerCache.items[k];
				if(it && ifTrim(it.work_name)===peerWorkName){ peerAssetId = it.id; break; }
			}
			var data = await apiListAny(peerAssetId, peerWorkName);
			var items = (data && data.items) ? data.items : [];
			for(var i=0; i<items.length; i++){
				var pi = items[i];
				if(ifTrim(pi.port) === peerPort && ifTrim(pi.peer) === ourWorkName){
					await apiUpdate(pi.id, { peer: '', peer_port: '' });
					break;
				}
			}
		}

		async function ifSetRemoteLink(peerWorkName, peerPort, ourWorkName, ourPort){
			var peerAssetId = '';
			for(var k=0;k<(ifPeerCache.items||[]).length;k++){
				var it = ifPeerCache.items[k];
				if(it && ifTrim(it.work_name)===peerWorkName){ peerAssetId = it.id; break; }
			}
			var data = await apiListAny(peerAssetId, peerWorkName);
			var items = (data && data.items) ? data.items : [];
			for(var i=0; i<items.length; i++){
				var pi = items[i];
				if(ifTrim(pi.port) === peerPort){
					// 이미 같은 값이면 스킵
					if(ifTrim(pi.peer) === ourWorkName && ifTrim(pi.peer_port) === ourPort) return;
					await apiUpdate(pi.id, { peer: ourWorkName, peer_port: ourPort });
					return;
				}
			}
		}

		/* ── 역방향 연결 포트 자동 해결 ───────────────────────────── */

		function getOurWorkName(){
			try{
				var raw = sessionStorage.getItem(storagePrefix+':selected:row') || localStorage.getItem(storagePrefix+':selected:row');
				if(raw){
					var row = JSON.parse(raw);
					var w = ifTrim(row && (row.work_name || row.workName || row.work || row.title || row.name));
					if(w) return w;
				}
			}catch(_){}
			try{
				var el = document.getElementById('page-title');
				return el ? ifTrim(el.textContent) : '';
			}catch(_){ return ''; }
		}

		async function ifAutoResolvePeerPorts(){
			var ourWorkName = getOurWorkName();
			if(!ourWorkName) return;
			var tbody = table.querySelector('tbody');
			if(!tbody) return;
			var rows = Array.from(tbody.querySelectorAll('tr'));
			for(var i=0; i<rows.length; i++){
				var tr = rows[i];
				var peerTd = tr.querySelector('[data-col="peer"]');
				var portTd = tr.querySelector('[data-col="peer_port"]');
				var ourPortTd = tr.querySelector('[data-col="port"]');
				var peerName = peerTd ? ifTrim(peerTd.textContent) : '';
				var currentPeerPort = portTd ? ifTrim(portTd.textContent) : '';
				var ourPort = ourPortTd ? ifTrim(ourPortTd.textContent) : '';
				if(!peerName || peerName==='-') continue;
				if(currentPeerPort && currentPeerPort!=='-') continue;
				if(!ourPort || ourPort==='-') continue;
				var peerAssetId = '';
				for(var k=0;k<(ifPeerCache.items||[]).length;k++){
					var it = ifPeerCache.items[k];
					if(it && ifTrim(it.work_name)===peerName){ peerAssetId = it.id; break; }
				}
				try{
					var data = await apiListAny(peerAssetId, peerName);
					var items = (data && data.items) ? data.items : [];
					for(var j=0; j<items.length; j++){
						var pi = items[j];
						if(ifTrim(pi.peer)===ourWorkName && ifTrim(pi.peer_port)===ourPort){
							var resolved = ifTrim(pi.port);
							if(resolved){
								if(portTd) portTd.textContent = resolved;
								var rowId = getRowId(tr);
								if(rowId) try{ await apiUpdate(rowId, { peer_port: resolved }); }catch(_){}
								break;
							}
						}
					}
				}catch(_){}
			}
		}

		async function ifAutoResolvePeerPortForRow(tr, peerName){
			var ourWorkName = getOurWorkName();
			if(!ourWorkName) return '';
			var ourPort = readCell(tr, 'port');
			if(!ourPort) return '';
			var peerAssetId = '';
			for(var k=0;k<(ifPeerCache.items||[]).length;k++){
				var it = ifPeerCache.items[k];
				if(it && ifTrim(it.work_name)===peerName){ peerAssetId = it.id; break; }
			}
			try{
				var data = await apiListAny(peerAssetId, peerName);
				var items = (data && data.items) ? data.items : [];
				for(var j=0; j<items.length; j++){
					var pi = items[j];
					if(ifTrim(pi.peer)===ourWorkName && ifTrim(pi.peer_port)===ourPort){
						return ifTrim(pi.port) || '';
					}
				}
			}catch(_){}
			return '';
		}

		function renderSavedRow(item){
			var tr = document.createElement('tr');
			if(item && item.id != null) setRowId(tr, item.id);
			var peerHtml = (item && item.peer) ? ifPeerCellHtmlFromWorkName(item.peer) : '-';
			tr.innerHTML = [
				'<td><input type="checkbox" class="if-row-check" aria-label="행 선택"></td>',
				'<td data-col="slot">'+escHtml(item && item.slot ? item.slot : '-')+'</td>',
				'<td data-col="port">'+escHtml(item && item.port ? item.port : '-')+'</td>',
				'<td data-col="iface">'+escHtml(item && item.iface ? item.iface : '-')+'</td>',
				'<td data-col="serial">'+escHtml(item && item.serial ? item.serial : '-')+'</td>',
				'<td data-col="assign">'+escHtml(item && item.assign ? item.assign : '-')+'</td>',
				'<td data-col="peer">'+peerHtml+'</td>',
				'<td data-col="peer_port">'+escHtml(item && item.peer_port ? item.peer_port : '-')+'</td>',
				'<td data-col="remark">'+escHtml(item && item.remark ? item.remark : '-')+'</td>',
				'<td class="system-actions table-actions">'
					+'<button class="action-btn js-if-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'
					+'<button class="action-btn danger js-if-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
				+'</td>'
			].join('');
			return tr;
		}

		async function ifSyncAllPeerFields(){
			if(!ifIsPeerLinkedScope(scopeKey)) return;
			var tbody = table.querySelector('tbody');
			if(!tbody) return;
			var rows = Array.from(tbody.querySelectorAll('tr'));
			for(var i=0; i<rows.length; i++){
				var tr = rows[i];
				var peerTd = tr.querySelector('[data-col="peer"]');
				var portTd = tr.querySelector('[data-col="peer_port"]');
				var peerName = peerTd ? ifTrim(peerTd.textContent) : '';
				var portName = portTd ? ifTrim(portTd.textContent) : '';
				if(!peerName || peerName==='-' || !portName || portName==='-') continue;
				var peerAssetId = '';
				for(var k=0;k<(ifPeerCache.items||[]).length;k++){
					var it = ifPeerCache.items[k];
					if(it && ifTrim(it.work_name) === peerName){ peerAssetId = it.id; break; }
				}
				try{
					var peerIf = await ifFetchPeerInterfaceForPort(peerAssetId, portName, peerName);
					if(peerIf) ifSetLinkedFields(tr, peerIf.serial||'', peerIf.assign||'');
				}catch(_){}
			}
		}

		async function loadFromApi(){
			var assetId = getAssetId(storagePrefix);
			if(!assetId || !scopeKey) return;
			try{ ensureUrlHasAssetId(assetId); }catch(_){ }
			try{ ensureTabLinksCarryAssetId(assetId); }catch(_){ }
			try{
				await ifEnsurePeerCache();
				var data = await apiList(scopeKey, assetId);
				var items = (data && data.items) ? data.items : [];
				var tbody = table.querySelector('tbody');
				if(!tbody) return;
				tbody.innerHTML = '';
				items.forEach(function(it){ tbody.appendChild(renderSavedRow(it)); });
				updateEmptyState();
				// SAN/네트워크: 연결된 상대 시스템에서 serial/assign 자동 동기화
				await ifSyncAllPeerFields();
				// 모든 스코프: 역방향 연결 포트 자동 해결
				await ifAutoResolvePeerPorts();
			}catch(err){
				try{ console.error('[tab04-interface] load failed', err); }catch(_){ }
			}
		}

		function markSaveFailed(tr, reason){
			try{
				if(tr) tr.classList.add('if-save-failed');
				var btn = tr ? tr.querySelector('.js-if-toggle[data-action="save"], .js-if-toggle') : null;
				if(btn){
					btn.title = reason ? String(reason) : '저장 실패 (콘솔 확인)';
					btn.setAttribute('aria-label','저장 실패');
				}
			}catch(_){ }
		}

		async function persistRow(tr){
			var assetId = getAssetId(storagePrefix);
			if(!assetId || !scopeKey){
				try{ console.warn('[tab04-interface] save skipped (missing assetId/scopeKey)', { assetId:assetId, scopeKey:scopeKey }); }catch(_){ }
				return null;
			}
			var peerInputVal = readCell(tr, 'peer');
			var peerWorkName = ifParsePeerWorkName(peerInputVal);
			var payload = {
				scope_key: scopeKey,
				asset_id: assetId,
				slot: readCell(tr, 'slot'),
				port: readCell(tr, 'port'),
				iface: readCell(tr, 'iface'),
				serial: readCell(tr, 'serial'),
				assign: readCell(tr, 'assign'),
				peer: peerWorkName,
				peer_port: readCell(tr, 'peer_port'),
				remark: readCell(tr, 'remark')
			};
			var id = getRowId(tr);
			try{
				var saved = id ? await apiUpdate(id, payload) : await apiCreate(payload);
				if(saved && saved.id != null) setRowId(tr, saved.id);
				return saved || null;
			}catch(err){
				try{ console.error('[tab04-interface] save failed', err); }catch(_){ }
				return null;
			}
		}

	// CSV

	

	

	

		
		function ifEscapeCSV(val){ return '"' + String(val).replace(/"/g,'""') + '"'; }
		function ifRowSaved(tr){
			var t=tr.querySelector('.js-if-toggle');
			var inEdit=t && t.getAttribute('data-action')==='save';
			if(inEdit) return false;
			return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
		}
		function ifVisibleRows(){
			var tbody=table.querySelector('tbody');
			if(!tbody) return [];
			return Array.from(tbody.querySelectorAll('tr')).filter(function(tr){
				return !(tr.hasAttribute('data-hidden') || tr.style.display==='none');
			});
		}
		function ifSavedVisibleRows(){ return ifVisibleRows().filter(ifRowSaved); }
		function ifExportCSV(onlySelected){
			var tbody = table.querySelector('tbody'); if(!tbody) return;
			var headers = ['슬롯','포트','인터페이스','UUID','할당값','연결 시스템','연결 포트','비고'];
			var trs = ifSavedVisibleRows();
			if(onlySelected){
				trs = trs.filter(function(tr){ var cb = tr.querySelector('.if-row-check'); return cb && cb.checked; });
			}
			if(trs.length===0) return;
			function readText(td){
				if(!td) return '';
				try{
					var inp = td.querySelector('input, textarea, select');
					if(inp){ return (inp.value||'').trim(); }
					return (td.textContent||'').trim();
				}catch(_){
					return (td.textContent||'').trim();
				}
			}
			var rows = trs.map(function(tr){
				function t(col){ var td = tr.querySelector('[data-col="'+col+'"]'); if(!td) return ''; return readText(td.cloneNode(true)); }
				return ['slot','port','iface','serial','assign','peer','peer_port','remark'].map(t);
			});
			var lines = [headers].concat(rows).map(function(arr){ return arr.map(ifEscapeCSV).join(','); });
			var csv = '\uFEFF' + lines.join('\r\n');
			var d=new Date(); var yyyy=d.getFullYear(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0');
			var filename = 'interface_'+yyyy+mm+dd+'.csv';
			try{
				var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
				var url=URL.createObjectURL(blob);
				var a=document.createElement('a');
				a.href=url; a.download=filename;
				document.body.appendChild(a); a.click(); document.body.removeChild(a);
				URL.revokeObjectURL(url);
			}catch(_){
				var a2=document.createElement('a');
				a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
				a2.download=filename;
				document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
			}
		}

	// Pagination

	

		
		var ifState = { page:1, 
	

	
pageSize:10 };
		(function initPageSize(){
			try{
				var saved = localStorage.getItem(storagePrefix+':if:pageSize');
				var sel = document.getElementById('if-page-size');
				if(sel){
					if(saved && ['10','20','50','100'].indexOf(saved)>-1){ ifState.pageSize=parseInt(saved,10); sel.value=saved; }
					sel.addEventListener('change', function(){
						var v=parseInt(sel.value,10);
						if(!isNaN(v)){
							ifState.page=1; ifState.pageSize=v;
							localStorage.setItem(storagePrefix+':if:pageSize', String(v));
							ifRenderPage();
						}
					});
				}
			}catch(_){ }
		})();

		var infoEl = document.getElementById('if-pagination-info');
		var numWrap = document.getElementById('if-page-numbers');
		var btnFirst = document.getElementById('if-first');
		var btnPrev = document.getElementById('if-prev');
		var btnNext = document.getElementById('if-next');
		var btnLast = document.getElementById('if-last');

		function ifRows(){ var tbody = table.querySelector('tbody'); return tbody? Array.from(tbody.querySelectorAll('tr')) : []; }
		function ifTotal(){ return ifRows().length; }
		function ifPages(){ var total=ifTotal(); return Math.max(1, Math.ceil(total / ifState.pageSize)); }
		function ifClampPage(){ var pages=ifPages(); if(ifState.page>pages) ifState.page=pages; if(ifState.page<1) ifState.page=1; }
		function ifUpdatePaginationUI(){
			if(infoEl){
				var total=ifTotal();
				var start = total? (ifState.page-1)*ifState.pageSize+1 : 0;
				var end=Math.min(total, ifState.page*ifState.pageSize);
				infoEl.textContent = start + '-' + end + ' / ' + total + '개 항목';
			}
			if(numWrap){
				var pages=ifPages();
				numWrap.innerHTML='';
				for(var p=1;p<=pages && p<=50;p++){
					var b=document.createElement('button');
					b.className='page-btn'+(p===ifState.page?' active':'');
					b.textContent=String(p);
					b.dataset.page=String(p);
					numWrap.appendChild(b);
				}
			}
			var pages2=ifPages();
			if(btnFirst) btnFirst.disabled=(ifState.page===1);
			if(btnPrev) btnPrev.disabled=(ifState.page===1);
			if(btnNext) btnNext.disabled=(ifState.page===pages2);
			if(btnLast) btnLast.disabled=(ifState.page===pages2);
			var sizeSel=document.getElementById('if-page-size');
			if(sizeSel){
				var none=(ifTotal()===0);
				sizeSel.disabled=none;
				if(none){ try{ sizeSel.value='10'; ifState.pageSize=10; }catch(_){ } }
			}
		}
		function ifRenderPage(){
			ifClampPage();
			var rows=ifRows();
			var startIdx=(ifState.page-1)*ifState.pageSize;
			var endIdx=startIdx + ifState.pageSize - 1;
			rows.forEach(function(tr,idx){
				var visible=idx>=startIdx && idx<=endIdx;
				tr.style.display = visible? '' : 'none';
				if(visible){ tr.removeAttribute('data-hidden'); } else { tr.setAttribute('data-hidden','1'); }
				var cb = tr.querySelector('.if-row-check');
				if(cb){ tr.classList.toggle('selected', !!cb.checked && visible); }
			});
			ifUpdatePaginationUI();
			var sa=document.getElementById('if-select-all');
			if(sa){
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .if-row-check');
				if(visChecks.length){ sa.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); }
				else { sa.checked=false; }
			}
		}
		function ifGo(p){ ifState.page=p; ifRenderPage(); }
		function ifGoDelta(d){ ifGo(ifState.page + d); }
		function ifGoFirst(){ ifGo(1); }
		function ifGoLast(){ ifGo(ifPages()); }
		if(numWrap){ numWrap.addEventListener('click', function(e){ var b=e.target.closest('button.page-btn'); if(!b) return; var p=parseInt(b.dataset.page,10); if(!isNaN(p)) ifGo(p); }); }
		if(btnFirst) btnFirst.addEventListener('click', ifGoFirst);
		if(btnPrev) btnPrev.addEventListener('click', function(){ ifGoDelta(-1); });
		if(btnNext) btnNext.addEventListener('click', function(){ ifGoDelta(1); });
		if(btnLast) btnLast.addEventListener('click', ifGoLast);

		function updateEmptyState(){
			try{
				var hasRows = table.querySelector('tbody tr') != null;
				if(empty){ empty.hidden = !!hasRows; empty.style.display = hasRows ? 'none' : ''; }
			}catch(_){
				if(empty){ empty.hidden = false; empty.style.display = ''; }
			}
			var csvBtn = document.getElementById('if-download-btn');
			if(csvBtn){
				var has = !!table.querySelector('tbody tr');
				csvBtn.disabled = !has;
				csvBtn.setAttribute('aria-disabled', (!has).toString());
				csvBtn.title = has? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
			}
			ifRenderPage();
		}

		
		var selectAll = document.getElementById('if-select-all');
		if(selectAll){
			selectAll.addEventListener('change', function(){
				var checks = table.querySelectorAll('.if-row-check:not([disabled])');
				checks.forEach(function(c){
					var tr=c.closest('tr');
					var hidden=tr && (tr.hasAttribute('data-hidden') || tr.style.display==='none');
					if(!hidden){ c.checked = !!selectAll.checked; }
					if(tr){ tr.classList.toggle('selected', !!c.checked && !hidden); }
				});
			});
		}
		table.addEventListener('click', function(ev){
			(function(){
				var tr = ev.target.closest('tr');
				if(!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase()!=='tbody') return;
				var isControl = ev.target.closest('button, a, input, select, textarea, label');
				var onCheckbox = ev.target.closest('input[type="checkbox"].if-row-check');
				if(isControl && !onCheckbox) return;
				if(onCheckbox) return;
				var cb = tr.querySelector('.if-row-check'); if(!cb) return;
				var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none'; if(hidden) return;
				cb.checked = !cb.checked; tr.classList.toggle('selected', cb.checked);
				var sa = document.getElementById('if-select-all');
				if(sa){
					var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .if-row-check');
					if(visChecks.length){ sa.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); }
					else { sa.checked=false; }
				}
			})();
		});
		table.addEventListener('change', function(ev){
			var cb=ev.target.closest('.if-row-check'); if(!cb) return;
			var tr=cb.closest('tr');
			if(tr){
				var hidden=tr.hasAttribute('data-hidden') || tr.style.display==='none';
				tr.classList.toggle('selected', !!cb.checked && !hidden);
			}
			var sa=document.getElementById('if-select-all');
			if(sa){
				var visChecks=table.querySelectorAll('tbody tr:not([data-hidden]) .if-row-check');
				if(visChecks.length){ sa.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); }
				else { sa.checked=false; }
			}
		});

		
		(function(){
			var btn = document.getElementById('if-download-btn');
			var modalId = 'if-download-modal';
			var closeBtn = document.getElementById('if-download-close');
			var confirmBtn = document.getElementById('if-download-confirm');

	// Modal

	

	

	
			function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
			function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
			if(btn){
				btn.addEventListener('click', function(){
					if(btn.disabled) return;
					var saved=ifSavedVisibleRows();
					var total=saved.length;
					if(total<=0) return;
					var selectedCount = saved.filter(function(tr){ var cb=tr.querySelector('.if-row-check'); return cb && cb.checked; }).length;
					var subtitle=document.getElementById('if-download-subtitle');
					if(subtitle){
						subtitle.textContent = selectedCount>0
							? ('선택된 '+selectedCount+'개 또는 전체 '+total+'개 결과 중 범위를 선택하세요.')
							: ('현재 결과 '+total+'개 항목을 CSV로 내보냅니다.');
					}
					var rowSelectedWrap=document.getElementById('if-csv-range-row-selected');
					var optSelected=document.getElementById('if-csv-range-selected');
					var optAll=document.getElementById('if-csv-range-all');
					if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount>0);
					if(optSelected){ optSelected.disabled = !(selectedCount>0); optSelected.checked = selectedCount>0; }
					if(optAll){ optAll.checked = !(selectedCount>0); }
					openModalLocal(modalId);
				});
			}
			if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); }
			var modalEl = document.getElementById(modalId);
			if(modalEl){
				modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); });
				document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); });
			}
			if(confirmBtn){
				confirmBtn.addEventListener('click', function(){
					var onlySel = !!(document.getElementById('if-csv-range-selected') && document.getElementById('if-csv-range-selected').checked);
					ifExportCSV(onlySel);
					closeModalLocal(modalId);
				});
			}
		})();

		
		var addBtn = document.getElementById('if-row-add');
		if(addBtn){
			addBtn.addEventListener('click', function(){
				var tbody = table.querySelector('tbody'); if(!tbody) return;
				var tr = document.createElement('tr');
				tr.innerHTML = [
					'<td><input type="checkbox" class="if-row-check" aria-label="행 선택"></td>',
					'<td data-col="slot"><input type="text" placeholder="슬롯"></td>',
					'<td data-col="port"><input type="text" placeholder="포트"></td>',
					'<td data-col="iface"><input type="text" placeholder="인터페이스"></td>',
					'<td data-col="serial"><input type="text" placeholder="UUID"></td>',
					'<td data-col="assign"><input type="text" placeholder="할당값"></td>',
					'<td data-col="peer">'
						+'<select class="search-select" data-searchable-scope="page" data-placeholder="연결 시스템 선택" data-allow-clear="true">'
							+'<option value="" selected>선택</option>'
						+'</select>'
					+'</td>',
					'<td data-col="peer_port">'
						+'<select class="search-select" data-searchable-scope="page" data-placeholder="연결 포트 선택" data-allow-clear="true">'
							+'<option value="" selected>선택</option>'
						+'</select>'
					+'</td>',
					'<td data-col="remark"><input type="text" placeholder="비고"></td>',
					'<td class="system-actions table-actions">'
						+'<button class="action-btn js-if-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>'
						+'<button class="action-btn danger js-if-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
					+'</td>'
				].join('');
				// SAN/네트워크: serial, assign 비활성화 (iface는 직접 입력)
				if(ifIsPeerLinkedScope(scopeKey)){
					['serial','assign'].forEach(function(col){
						var inp = tr.querySelector('td[data-col="'+col+'"] input');
						if(inp){ inp.disabled = true; inp.placeholder = '자동 연동'; inp.title = '연결 시스템에서 자동으로 가져옵니다'; }
					});
				}
				tbody.appendChild(tr);

				ifEnsureSearchableSoon(tr);
				ifEnsurePeerCache().then(function(){
					var peerSel = tr.querySelector('td[data-col="peer"] select');
					ifPopulatePeerSelect(peerSel, ifPeerCache.items, '');
					ifUpdatePeerPortSelectForRow(tr);
					ifEnsureSearchableSoon(tr);
				}).catch(function(){});

				try{ ifGoLast(); }catch(_){ }
				updateEmptyState();
			});
		}

		
		table.addEventListener('change', function(ev){
			// 연결 시스템 변경
			var peerSel = ev.target && ev.target.closest ? ev.target.closest('td[data-col="peer"] select.search-select') : null;
			if(peerSel){
				var tr = peerSel.closest('tr');
				if(tr){
					var portSel = tr.querySelector('td[data-col="peer_port"] select');
					if(portSel){ portSel.value = ''; try{ delete portSel.dataset.savedPort; }catch(_){ } }
					ifUpdatePeerPortSelectForRow(tr).then(function(){
						// 역방향 자동 해결: 상대가 이미 연결한 포트가 있으면 자동 선택
						var peerWorkName = ifTrim(peerSel.value);
						if(!peerWorkName || !portSel) return;
						ifAutoResolvePeerPortForRow(tr, peerWorkName).then(function(resolved){
							if(resolved && portSel){
								portSel.value = resolved;
								try{ if(window.BlossomSearchableSelect){ window.BlossomSearchableSelect.syncAll(portSel); } }catch(_){}
								ifEnsureSearchableSoon(portSel);
								// SAN/네트워크: 자동 선택된 포트로 serial/assign도 동기화
								if(ifIsPeerLinkedScope(scopeKey)) ifSyncPeerFieldsForRow(tr);
							}
						}).catch(function(){});
					});
					// SAN/네트워크: 연결 시스템 변경 시 serial/assign 초기화
					if(ifIsPeerLinkedScope(scopeKey)) ifSetLinkedFields(tr, '', '');
				}
				return;
			}
			// 연결 포트 변경 → SAN/네트워크: 상대 시스템 인터페이스 데이터 자동 연동
			var portChg = ev.target && ev.target.closest ? ev.target.closest('td[data-col="peer_port"] select.search-select') : null;
			if(portChg){
				var tr2 = portChg.closest('tr');
				if(tr2) ifSyncPeerFieldsForRow(tr2);
			}
		});

		
		table.addEventListener('click', function(ev){
			var target = ev.target.closest('.js-if-del, .js-if-edit, .js-if-commit, .js-if-toggle');
			if(!target) return;
			var tr = ev.target.closest('tr');
			if(!tr) return;

				if(target.classList.contains('js-if-del')){
				// 삭제 전 peer 정보 캡처 (양방향 해제용)
				var delPeerTd = tr.querySelector('[data-col="peer"]');
				var delPortTd = tr.querySelector('[data-col="peer_port"]');
				var delOurPortTd = tr.querySelector('[data-col="port"]');
				var delPeerName = delPeerTd ? ifParsePeerWorkName(ifTrim(delPeerTd.textContent || (delPeerTd.querySelector('select') ? delPeerTd.querySelector('select').value : ''))) : '';
				var delPeerPort = delPortTd ? normalizeCellText(delPortTd.textContent || (delPortTd.querySelector('select') ? delPortTd.querySelector('select').value : '')) : '';
				var delOurPort = delOurPortTd ? normalizeCellText(delOurPortTd.textContent || (delOurPortTd.querySelector('input') ? delOurPortTd.querySelector('input').value : '')) : '';
				ifOpenDeleteModal(tr, function(delTr){
					if(!delTr) return;
					var id = getRowId(delTr);
					if(id){
						apiDelete(id).then(function(){
							if(delTr && delTr.parentNode){ delTr.parentNode.removeChild(delTr); }
							updateEmptyState();
							// 양방향 연결 해제
							if(delPeerName && delPeerPort){
								ifSyncBidirectionalLink({
									peerWorkName: '', peerPort: '', ourPort: delOurPort,
									oldPeerWorkName: delPeerName, oldPeerPort: delPeerPort,
									isDelete: true
								}).catch(function(){});
							}
						}).catch(function(err){
							try{ console.error('[tab04-interface] delete failed', err); }catch(_){ }
						});
						return;
					}
					if(delTr && delTr.parentNode){ delTr.parentNode.removeChild(delTr); }
					updateEmptyState();
				});
				return;
			}

			
			if(
				target.classList.contains('js-if-edit') ||
				(target.classList.contains('js-if-toggle') && target.getAttribute('data-action') === 'edit')
			){
				// 양방향 동기화용: 편집 진입 전 현재 peer 정보 저장
				(function(){
					var peerTd = tr.querySelector('[data-col="peer"]');
					var portTd = tr.querySelector('[data-col="peer_port"]');
					tr.dataset.prevPeer = peerTd ? ifParsePeerWorkName(ifTrim(peerTd.textContent)) : '';
					tr.dataset.prevPeerPort = portTd ? normalizeCellText(portTd.textContent) : '';
				})();
				function toInput(name, placeholder){
					var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return;
					var current = (td.textContent||'').trim();
					td.innerHTML = '<input type="text" value="'+escAttr(current)+'" placeholder="'+escAttr(placeholder||'')+'">';
				}
				toInput('slot', '슬롯');
				toInput('port', '포트');
				toInput('iface', '인터페이스');
				toInput('serial', 'UUID');
				toInput('assign', '할당값');
				// SAN/네트워크: serial, assign 비활성화 (iface는 직접 입력)
				if(ifIsPeerLinkedScope(scopeKey)){
					['serial','assign'].forEach(function(col){
						var inp = tr.querySelector('td[data-col="'+col+'"] input');
						if(inp){ inp.disabled = true; inp.placeholder = '자동 연동'; inp.title = '연결 시스템에서 자동으로 가져옵니다'; }
					});
				}
				(function(){
					var td = tr.querySelector('[data-col="peer"]'); if(!td) return;
					var currentLabel = (td.textContent||'').trim();
					var currentWorkName = ifParsePeerWorkName(currentLabel);
					td.innerHTML = '<select class="search-select" data-searchable-scope="page" data-placeholder="연결 시스템 선택" data-allow-clear="true"><option value="">선택</option></select>';
					var sel = td.querySelector('select');
					ifEnsurePeerCache().then(function(){
						ifPopulatePeerSelect(sel, ifPeerCache.items, currentWorkName);
						ifEnsureSearchableSoon(sel);
						// peer 로드 완료 후 연결 포트 갱신 (올바른 asset_id로)
						ifUpdatePeerPortSelectForRow(tr);
					}).catch(function(){});
					ifEnsureSearchableSoon(sel);
				})();
				(function(){
					var td = tr.querySelector('[data-col="peer_port"]'); if(!td) return;
					var cur = (td.textContent||'').trim();
					td.innerHTML = '<select class="search-select" data-searchable-scope="page" data-placeholder="연결 포트 선택" data-allow-clear="true"><option value="">선택</option></select>';
					var sel = td.querySelector('select');
					// 저장된 포트값을 data-saved-port에 보관 → ifUpdatePeerPortSelectForRow에서 복원
					var savedPort = (cur==='-'?'':cur);
					if(savedPort) sel.dataset.savedPort = savedPort;
					// peer IIFE의 .then() 에서 ifUpdatePeerPortSelectForRow 호출 시 실제 포트 목록으로 채움
					ifEnsureSearchableSoon(sel);
				})();
				toInput('remark', '비고');
				var toggleBtn = tr.querySelector('.js-if-toggle');
				if(toggleBtn){
					toggleBtn.setAttribute('data-action','save');
					toggleBtn.title='저장'; toggleBtn.setAttribute('aria-label','저장');
					toggleBtn.innerHTML='<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
				}else{
					var actions = tr.querySelector('.table-actions');
					if(actions){
						actions.classList.add('system-actions');
						actions.innerHTML = '<button class="action-btn js-if-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button> <button class="action-btn danger js-if-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>';
					}
				}
				return;
			}

			
			if(
				target.classList.contains('js-if-commit') ||
				(target.classList.contains('js-if-toggle') && target.getAttribute('data-action') === 'save')
			){
				function getInput(name){ var td = tr.querySelector('[data-col="'+name+'"]'); return td? td.querySelector('input, textarea, select'): null; }
				function commit(name, val){
					var td = tr.querySelector('[data-col="'+name+'"]'); if(!td) return;
					var text = (val === '' || val == null)? '-' : String(val);
					td.textContent = text;
				}
				function read(name){
					var inp = getInput(name);
					if(inp && inp.tagName && String(inp.tagName).toLowerCase() === 'select'){
						if(name === 'peer') return String(inp.value||'').trim();
						return String(inp.value||'').trim();
					}
					var v = (inp? inp.value : (tr.querySelector('[data-col="'+name+'"]') ? (tr.querySelector('[data-col="'+name+'"]').textContent||'') : ''));
					return String(v).trim();
				}
				(function(){
					var toggleBtn2 = tr.querySelector('.js-if-toggle');
					try{ if(toggleBtn2) toggleBtn2.disabled = true; }catch(_){ }
					(async function(){
						// 양방향 동기화용: 저장 전 이전 peer 정보 캡처
						var oldPeerWorkName = ifTrim(tr.dataset.prevPeer || '');
						var oldPeerPort = ifTrim(tr.dataset.prevPeerPort || '');
						var saved = null;
						try{ saved = await persistRow(tr); }catch(_e){ saved = null; }
						if(!saved){
							try{
								var a0 = getAssetId(storagePrefix);
								var why = (!a0 || !scopeKey)
									? ('저장 불가: asset_id 또는 scope_key 없음 (asset_id=' + String(a0||'') + ', scope_key=' + String(scopeKey||'') + ')')
									: '저장 실패 (콘솔 확인)';
								markSaveFailed(tr, why);
							}catch(_eMark){ markSaveFailed(tr, '저장 실패 (콘솔 확인)'); }
							return;
						}
						['slot','port','iface','serial','assign','peer','peer_port','remark'].forEach(function(n){
							var val = read(n);
							if(n === 'peer') val = ifParsePeerWorkName(val);
							commit(n, val);
						});
						if(toggleBtn2){
							toggleBtn2.setAttribute('data-action','edit');
							toggleBtn2.title='편집'; toggleBtn2.setAttribute('aria-label','편집');
							toggleBtn2.innerHTML='<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
						}else{
							var actions2 = tr.querySelector('.table-actions');
							if(actions2){
								actions2.classList.add('system-actions');
								actions2.innerHTML = '<button class="action-btn js-if-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button> <button class="action-btn danger js-if-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>';
							}
						}
						updateEmptyState();
						// 양방향 연결 동기화: 상대방 시스템 인터페이스 자동 매핑
						try{
							var newPeer = ifParsePeerWorkName(read('peer'));
							var newPeerPort = read('peer_port');
							var myPort = read('port');
							await ifSyncBidirectionalLink({
								peerWorkName: newPeer,
								peerPort: newPeerPort,
								ourPort: myPort,
								oldPeerWorkName: oldPeerWorkName,
								oldPeerPort: oldPeerPort,
								isDelete: false
							});
							// 이전 값 갱신
							try{ tr.dataset.prevPeer = newPeer; tr.dataset.prevPeerPort = newPeerPort; }catch(_){}
						}catch(_syncErr){
							try{ console.warn('[tab04-interface] bidirectional sync failed', _syncErr); }catch(_){}
						}
					})().finally(function(){
						try{ if(toggleBtn2) toggleBtn2.disabled = false; }catch(_){ }
					});
				})();
				return;
			}
		});

		updateEmptyState();
		ifEnsurePeerCache().then(function(){ ifPopulateAllPeerSelects(); }).catch(function(){});
		loadFromApi();
		ifEnsureSearchableSoon(document);
	}

	window.BlossomTab04Interface = {
		init: init,
		version: '2026-03-26'
	};

	
	
	(function(){
		var scheduled = false;
		function schedule(){
			if(scheduled) return;
			scheduled = true;
			try{ init(); }catch(_){ }
		}
		try{
			if(document && document.readyState === 'loading'){
				document.addEventListener('DOMContentLoaded', schedule, { once:true });
			}else{
				schedule();
			}
		}catch(_){ }
	})();
})();

