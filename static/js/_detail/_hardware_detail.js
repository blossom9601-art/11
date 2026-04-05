/*
	Shared helpers for hardware detail pages.
	Exposes: window.BlossomHardwareDetail
*/

(function(){
	'use strict';

	if(typeof window === 'undefined') return;
	if(window.BlossomHardwareDetail) return;

	function safeJsonParse(raw){
		try{ return JSON.parse(raw); }catch(_e){ return null; }
	}

	function getStored(key, mode){
		var m = mode || 'session';
		try{
			if(m === 'local') return localStorage.getItem(key);
			return sessionStorage.getItem(key);
		}catch(_e){
			return null;
		}
	}

	function setStored(key, value, mode){
		var m = mode || 'session';
		try{
			var v = (value == null) ? '' : String(value);
			if(m === 'local') localStorage.setItem(key, v);
			else sessionStorage.setItem(key, v);
		}catch(_e){ }
	}

	function removeStored(key, mode){
		var m = mode || 'session';
		try{
			if(m === 'local') localStorage.removeItem(key);
			else sessionStorage.removeItem(key);
		}catch(_e){ }
	}

	function stripQueryParams(stripKeys){
		try{
			var u = new URL(window.location.href);
			var changed = false;
			(stripKeys || []).forEach(function(k){
				try{
					if(u.searchParams.has(k)){
						u.searchParams.delete(k);
						changed = true;
					}
				}catch(_e){ }
			});
			if(!changed) return;
			var next = u.pathname + (u.search ? u.search : '') + (u.hash || '');
			window.history.replaceState(null, document.title, next);
		}catch(_e2){ }
	}

	function initHeader(cfg){
		var c = cfg || {};
		var storagePrefix = c.storagePrefix || 'detail';
		var headerKeyPrefix = c.headerKeyPrefix || storagePrefix;

		var titleIds = c.titleIds || ['page-title','detail-title'];
		var subtitleIds = c.subtitleIds || ['page-subtitle','detail-subtitle'];

		function byIdFirst(ids){
			for(var i=0;i<ids.length;i++){
				var el = document.getElementById(ids[i]);
				if(el) return el;
			}
			return null;
		}

		var titleEl = byIdFirst(titleIds) || document.querySelector('.page-header h1');
		var subEl = byIdFirst(subtitleIds) || document.querySelector('.page-header p');

		var params;
		try{ params = new URLSearchParams(window.location.search || ''); }catch(_e){ params = null; }
		var qWork = params ? (params.get('work') || '') : '';
		var qSystem = params ? (params.get('system') || '') : '';

		function _firstNonEmpty(list){
			for(var i=0;i<(list||[]).length;i++){
				var v = list[i];
				if(v != null && String(v).trim() !== '') return String(v).trim();
			}
			return '';
		}

		var prefixes = [headerKeyPrefix].concat(c.compatHeaderKeyPrefixes || []);
		function _readHeader(kind){
			var values = [];
			for(var i=0;i<prefixes.length;i++){
				var p = prefixes[i];
				if(!p) continue;
				var newKey = p + ':selected:' + kind;
				var legacyKey = p + ':selected:' + kind + '_name';
				values.push(getStored(newKey,'session'));
				values.push(getStored(newKey,'local'));
				values.push(getStored(legacyKey,'session'));
				values.push(getStored(legacyKey,'local'));
			}
			return _firstNonEmpty(values);
		}

		var workKey = headerKeyPrefix + ':selected:work';
		var systemKey = headerKeyPrefix + ':selected:system';
		var workLegacyKey = headerKeyPrefix + ':selected:work_name';
		var systemLegacyKey = headerKeyPrefix + ':selected:system_name';

		var work = (qWork && String(qWork).trim()) ? String(qWork).trim() : _readHeader('work');
		var system = (qSystem && String(qSystem).trim()) ? String(qSystem).trim() : _readHeader('system');

		if(work) {
			if(titleEl) titleEl.textContent = work;
			setStored(workKey, work, 'session');
			setStored(workKey, work, 'local');
			setStored(workLegacyKey, work, 'session');
			setStored(workLegacyKey, work, 'local');
		}
		if(system) {
			if(subEl) subEl.textContent = system;
			setStored(systemKey, system, 'session');
			setStored(systemKey, system, 'local');
			setStored(systemLegacyKey, system, 'session');
			setStored(systemLegacyKey, system, 'local');
		}

		if(c.stripQueryParams){
			stripQueryParams(c.stripKeys || ['work','system']);
		}
	}

	function getSelectedRow(storagePrefix){
		var prefix = storagePrefix || 'detail';
		var key = prefix + ':selected:row';
		var raw = getStored(key,'session') || getStored(key,'local');
		if(!raw) return null;
		return safeJsonParse(raw);
	}

	function storeSelectedRow(storagePrefix, row){
		var prefix = storagePrefix || 'detail';
		var rowKey = prefix + ':selected:row';
		var idKey = prefix + ':selected:asset_id';
		try{
			var raw = JSON.stringify(row || {});
			setStored(rowKey, raw, 'session');
			setStored(rowKey, raw, 'local');
		}catch(_e){ }
		try{
			var id = (row && (row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id)));
			if(id != null && String(id).trim() !== ''){
				setStored(idKey, String(id).trim(), 'session');
				setStored(idKey, String(id).trim(), 'local');
			}
		}catch(_e2){ }
	}

	function resolveAssetId(storagePrefix){
		var prefix = storagePrefix || 'detail';

		try{
			var params = new URLSearchParams(window.location.search || '');
			var q = (params.get('asset_id') || params.get('assetId') || params.get('hardware_id') || params.get('hardwareId') || params.get('id') || '').trim();
			if(q) return q;
		}catch(_e0){ }

		var key = prefix + ':selected:asset_id';
		var v = (getStored(key,'session') || getStored(key,'local') || '').trim();
		if(v) return v;

		var row = getSelectedRow(prefix);
		if(row && (row.hardware_id != null || row.asset_id != null || row.id != null)){
			var rid = (row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id));
			if(rid != null && String(rid).trim() !== '') return String(rid).trim();
		}
		return '';
	}

	function fetchJSON(url, opts){
		var options = opts ? Object.assign({}, opts) : {};
		options.headers = Object.assign({ 'Accept':'application/json' }, options.headers || {});
		if(!options.credentials) options.credentials = 'same-origin';

		var method = (options.method || 'GET').toUpperCase();
		if(method !== 'GET' && !options.headers['Content-Type'] && !options.headers['content-type']){
			options.headers['Content-Type'] = 'application/json';
		}

		return fetch(url, options).then(function(res){
			return res.json().catch(function(){ return null; }).then(function(json){
				if(!res.ok){
					var msg = (json && (json.message || json.error)) ? (json.message || json.error) : ('HTTP ' + res.status);
					throw new Error(msg);
				}
				return json;
			});
		});
	}

	function normalizeBusinessKeys(item){
		// Normalize/augment business FK fields so pages can rely on one set of keys.
		// This is intentionally additive (does not delete/overwrite existing keys).
		if(!item || typeof item !== 'object') return item;
		try{
			// Canonical (service layer) keys: work_type_* and work_category_*.
			// Legacy (DB-ish) keys some pages historically referenced: work_category_* (for type), work_division_* (for category).
			//
			// Case A) Service response shape (common now):
			// - work_type_code/name exist (category)
			// - work_category_code/name exist (division)
			// Add work_division_* aliases so older pages that still reference them keep working.
			if(item.work_division_code == null && item.work_category_code != null){
				item.work_division_code = item.work_category_code;
			}
			if(item.work_division_name == null && item.work_category_name != null){
				item.work_division_name = item.work_category_name;
			}

			// Case B) Legacy response shape (some older endpoints/scripts):
			// - work_category_code/name (category)
			// - work_division_code/name (division)
			// Populate missing canonical work_type_* from legacy work_category_*.
			if(item.work_type_code == null && item.work_category_code != null && item.work_division_code != null){
				item.work_type_code = item.work_category_code;
			}
			if(item.work_type_name == null && item.work_category_name != null && item.work_division_name != null){
				item.work_type_name = item.work_category_name;
			}

			// Populate missing canonical work_category_* from legacy work_division_*.
			if(item.work_category_code == null && item.work_division_code != null){
				item.work_category_code = item.work_division_code;
			}
			if(item.work_category_name == null && item.work_division_name != null){
				item.work_category_name = item.work_division_name;
			}
		}catch(_e){ }
		return item;
	}

	window.BlossomHardwareDetail = {
		getStored: getStored,
		setStored: setStored,
		removeStored: removeStored,
		initHeader: initHeader,
		getSelectedRow: getSelectedRow,
		storeSelectedRow: storeSelectedRow,
		resolveAssetId: resolveAssetId,
		fetchJSON: fetchJSON,
		normalizeBusinessKeys: normalizeBusinessKeys
	};
})();
