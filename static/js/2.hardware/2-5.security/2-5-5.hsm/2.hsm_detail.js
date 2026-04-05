(function(){
	// HSM detail page behaviors:
	// - Keep selected asset id across tabs
	// - Hydrate 기본정보 from /api/hardware/security/hsm/assets/<id>
	// - Hardware tab (tab01-hardware): persist component rows via /api/hardware/assets/<hardware_id>/components

	// Early: apply saved sidebar state to prevent flash
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

	function safeInt(v){
		var n = parseInt(String(v == null ? '' : v), 10);
		return (!isNaN(n) && n > 0) ? n : null;
	}

	function storagePrefix(){
		try{ return (typeof STORAGE_PREFIX !== 'undefined' && STORAGE_PREFIX) ? STORAGE_PREFIX : 'hsm'; }
		catch(_e){ return 'hsm'; }
	}

	function safeJsonParse(s){
		try{ return JSON.parse(s); }catch(_){ return null; }
	}

	function readSelectedRow(prefix){
		try{
			var raw = sessionStorage.getItem(prefix + ':selected:row') || localStorage.getItem(prefix + ':selected:row');
			if(!raw){
				raw = sessionStorage.getItem('hsm:selected:row') || localStorage.getItem('hsm:selected:row');
			}
			if(!raw) return null;
			return safeJsonParse(raw);
		}catch(_e2){
			return null;
		}
	}

	function readStoredAssetId(prefix){
		try{
			var raw = sessionStorage.getItem(prefix + ':selected:asset_id') || localStorage.getItem(prefix + ':selected:asset_id');
			if(!raw){
				raw = sessionStorage.getItem('hsm:selected:asset_id') || localStorage.getItem('hsm:selected:asset_id');
			}
			return safeInt(raw);
		}catch(_e2){
			return null;
		}
	}

	function getSelectedAssetId(prefix){
		// 1) query string
		try{
			var qs = new URLSearchParams(location.search || '');
			var cand = qs.get('asset_id') || qs.get('assetId') || qs.get('id');
			var n1 = safeInt(cand);
			if(n1) return n1;
		}catch(_e){ }
		// 2) stored selected row
		try{
			var row = readSelectedRow(prefix);
			var id = row && (row.id != null ? row.id : row.asset_id);
			var n2 = safeInt(id);
			if(n2) return n2;
		}catch(_e2){ }
		// 3) explicit stored id
		return readStoredAssetId(prefix);
	}

	function persistSelectedAssetId(prefix, assetId){
		if(!assetId) return;
		try{ sessionStorage.setItem(prefix + ':selected:asset_id', String(assetId)); }catch(_e0){}
		try{ localStorage.setItem(prefix + ':selected:asset_id', String(assetId)); }catch(_e1){}
	}

	function stripAssetIdFromUrl(){
		try{
			var u = new URL(window.location.href);
			var changed = false;
			['asset_id','assetId','id'].forEach(function(k){
				try{ if(u.searchParams.has(k)){ u.searchParams.delete(k); changed = true; } }catch(_e0){}
			});
			if(!changed) return;
			history.replaceState(null, document.title, u.pathname + (u.search || '') + (u.hash || ''));
		}catch(_e1){ }
	}

	function decorateTabLinksWithAssetId(assetId){
		if(!assetId) return;
		try{
			var tabs = document.querySelectorAll('.server-detail-tabs a');
			if(!tabs || !tabs.length) return;
			Array.from(tabs).forEach(function(a){
				try{
					var href = a.getAttribute('href') || '';
					if(!href) return;
					if(/^https?:\/\//i.test(href)) return;
					var u = new URL(href, window.location.origin);
					u.searchParams.set('asset_id', String(assetId));
					a.setAttribute('href', u.pathname + (u.search || ''));
				}catch(_e1){}
			});
		}catch(_e2){ }
	}

	function pick(obj, keys){
		if(!obj) return '';
		for(var i=0;i<keys.length;i++){
			var k = keys[i];
			if(Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && String(obj[k]).trim() !== '') return obj[k];
		}
		return '';
	}

	function setText(sel, value, fallback){
		var el = (sel && sel.charAt && sel.charAt(0) === '#') ? document.querySelector(sel) : document.getElementById(sel);
		if(!el) return;
		var s = String(value == null ? '' : value).trim();
		el.textContent = s ? s : (fallback == null ? '-' : String(fallback));
	}

	function persistCurrentSystemFields(prefix, asset){
		try{
			var pfx = String(prefix || 'hsm');
			var vendorVal = pick(asset, ['manufacturer_name','vendor_name','vendor','manufacturer','maker']);
			var modelVal = pick(asset, ['server_model_name','model_name','model','server_model']);
			var serialVal = pick(asset, ['serial_number','serial','serial_no','sn']);
			try{ sessionStorage.setItem(pfx+':current:vendor', String(vendorVal||'')); }catch(_e0){ }
			try{ localStorage.setItem(pfx+':current:vendor', String(vendorVal||'')); }catch(_e1){ }
			try{ sessionStorage.setItem(pfx+':current:model', String(modelVal||'')); }catch(_e2){ }
			try{ localStorage.setItem(pfx+':current:model', String(modelVal||'')); }catch(_e3){ }
			try{ sessionStorage.setItem(pfx+':current:serial', String(serialVal||'')); }catch(_e4){ }
			try{ localStorage.setItem(pfx+':current:serial', String(serialVal||'')); }catch(_e5){ }
			// Back-compat: keep canonical keys updated as well.
			if(pfx !== 'hsm'){
				try{ sessionStorage.setItem('hsm:current:vendor', String(vendorVal||'')); }catch(_e6){ }
				try{ localStorage.setItem('hsm:current:vendor', String(vendorVal||'')); }catch(_e7){ }
				try{ sessionStorage.setItem('hsm:current:model', String(modelVal||'')); }catch(_e8){ }
				try{ localStorage.setItem('hsm:current:model', String(modelVal||'')); }catch(_e9){ }
				try{ sessionStorage.setItem('hsm:current:serial', String(serialVal||'')); }catch(_e10){ }
				try{ localStorage.setItem('hsm:current:serial', String(serialVal||'')); }catch(_e11){ }
			}
		}catch(_e){ }
	}

	function renderHeaderOnly(asset, assetId){
		try{
			if(!(document.getElementById('page-title') || document.getElementById('page-subtitle'))) return;
			// Match IPS detail header behavior for consistency across security devices:
			// title = 업무 이름, subtitle = 시스템 이름
			var workName = pick(asset, ['work_name']);
			var systemName = pick(asset, ['system_name']);
			setText('#page-title', String(workName || 'HSM'));
			setText('#page-subtitle', String(systemName || '-'));
		}catch(_eHeader){ }
	}

	function renderBasicInfo(asset, assetId){
		function setInfo(cardIdx, rowIdx, value){
			var sel = '.basic-info-card:nth-child(' + cardIdx + ') .info-row:nth-child(' + rowIdx + ') .info-value';
			var el = document.querySelector(sel);
			if(!el) return;
			var s = String(value == null ? '' : value).trim();
			el.textContent = s ? s : '-';
		}
		function setWorkStatus(name, code, color){
			var label = String((name || code || '')).trim();
			var pill = document.querySelector('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill');
			if(!pill) return;
			var textEl = pill.querySelector('.status-text');
			if(textEl) textEl.textContent = label || '-';
			try{
				var dot = pill.querySelector('.status-dot');
				if(dot){
					var cls = (label === '가동' ? 'ws-run' : (label === '유휴' ? 'ws-idle' : 'ws-wait'));
					dot.classList.remove('ws-run','ws-idle','ws-wait');
					dot.classList.add(cls);
				}
			}catch(_e){}
			try{
				if(color){ pill.style.setProperty('--status-color', String(color)); }
			}catch(_e2){}
		}

		// 비즈니스
		setWorkStatus(asset.work_status_name, asset.work_status_code, asset.work_status_color);
		setInfo(1, 2, pick(asset, ['work_type_name','work_type']));
		setInfo(1, 3, pick(asset, ['work_category_name','work_category']));
		setInfo(1, 4, pick(asset, ['work_operation_name','work_operation']));
		setInfo(1, 5, pick(asset, ['work_group_name','work_group']));
		setInfo(1, 6, pick(asset, ['work_name']));
		setInfo(1, 7, pick(asset, ['system_name']));
		setInfo(1, 8, pick(asset, ['system_ip']));
		setInfo(1, 9, pick(asset, ['mgmt_ip','manage_ip']));

		// 시스템
		setInfo(2, 1, pick(asset, ['manufacturer_name','vendor','vendor_name']));
		setInfo(2, 2, pick(asset, ['server_model_name','model','model_name']));
		setInfo(2, 3, pick(asset, ['serial_number','serial']));
		setInfo(2, 4, pick(asset, ['virtualization_type','virtualization']));
		setInfo(2, 5, pick(asset, ['center_name']));
		setInfo(2, 6, pick(asset, ['rack_name']));
		setInfo(2, 7, pick(asset, ['slot','system_slot']));
		setInfo(2, 8, pick(asset, ['u_size','system_size']));
		setInfo(2, 9, (pick(asset, ['rack_face']) === 'REAR') ? '후면' : '전면');

		// 담당자
		setInfo(3, 1, pick(asset, ['system_dept_name']));
		setInfo(3, 2, pick(asset, ['system_owner_name']));
		setInfo(3, 3, pick(asset, ['service_dept_name']));
		setInfo(3, 4, pick(asset, ['service_owner_name']));

		// 점검: 숫자 배지 + OX 배지
		(function(){
			function setNumBadgeRow(rowSel, raw, mode){
				var row = document.querySelector(rowSel); if(!row) return;
				var badge = row.querySelector('.num-badge'); if(!badge) return;
				var valStr = String(raw == null ? '' : raw).trim();
				if(!valStr) valStr = '-';
				badge.textContent = valStr;
				try{ badge.classList.remove('tone-1','tone-2','tone-3','is-empty'); }catch(_e0){}
				if(valStr === '-') return;
				var n = parseInt(valStr, 10);
				if(isNaN(n)) return;
				var tone = 'tone-1';
				if(mode === 'security_score') tone = (n >= 8) ? 'tone-3' : (n >= 6 ? 'tone-2' : 'tone-1');
				else tone = (n >= 3) ? 'tone-3' : (n === 2 ? 'tone-2' : 'tone-1');
				try{ badge.classList.add(tone); }catch(_e1){}
			}
			setNumBadgeRow('.basic-info-card:nth-child(4) .info-row:nth-child(1)', pick(asset, ['cia_confidentiality','confidentiality']), 'cia');
			setNumBadgeRow('.basic-info-card:nth-child(4) .info-row:nth-child(2)', pick(asset, ['cia_integrity','integrity']), 'cia');
			setNumBadgeRow('.basic-info-card:nth-child(4) .info-row:nth-child(3)', pick(asset, ['cia_availability','availability']), 'cia');
			setNumBadgeRow('.basic-info-card:nth-child(4) .info-row:nth-child(4)', pick(asset, ['security_score','security_total']), 'security_score');
		})();

		setInfo(4, 5, pick(asset, ['system_grade','grade']));
		var coreRaw = pick(asset, ['core_flag','core','is_core_system']);
		if(coreRaw === 0 || coreRaw === '0') coreRaw = '일반';
		if(coreRaw === 1 || coreRaw === '1') coreRaw = '핵심';
		setInfo(4, 6, coreRaw);
		(function(){
			function setOxRow(rowSel, raw){
				var row = document.querySelector(rowSel); if(!row) return;
				var badge = row.querySelector('.ox-badge'); if(!badge) return;
				var v = String(raw == null ? '' : raw).trim().toUpperCase();
				if(v === '0' || v === 'FALSE') v = 'X';
				if(v === '1' || v === 'TRUE') v = 'O';
				if(!(v === 'O' || v === 'X')) v = '-';
				badge.textContent = v;
				try{ badge.classList.remove('on','off','is-empty'); }catch(_e0){}
				if(v === 'O') badge.classList.add('on');
				else if(v === 'X') badge.classList.add('off');
			}
			setOxRow('.basic-info-card:nth-child(4) .info-row:nth-child(7)', pick(asset, ['dr_built','dr','has_dr_site']));
			setOxRow('.basic-info-card:nth-child(4) .info-row:nth-child(8)', pick(asset, ['svc_redundancy','redundancy','has_service_ha']));
		})();

		renderHeaderOnly(asset, assetId);
	}

	async function fetchHsmAsset(assetId){
		var r = await fetch('/api/hardware/security/hsm/assets/' + encodeURIComponent(String(assetId)), { method:'GET', headers:{'Accept':'application/json'} });
		var j = await r.json().catch(function(){ return null; });
		if(!r.ok){
			throw new Error((j && (j.message || j.error)) ? (j.message || j.error) : ('HTTP ' + r.status));
		}
		if(!(j && j.success && j.item)) throw new Error('Invalid response');
		return j.item;
	}

	async function putHsmAsset(assetId, payload){
		var r = await fetch('/api/hardware/security/hsm/assets/' + encodeURIComponent(String(assetId)), {
			method: 'PUT',
			headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
			body: JSON.stringify(payload || {})
		});
		var j = await r.json().catch(function(){ return null; });
		if(!r.ok || !(j && j.success)){
			var msg = (j && (j.message || j.error)) ? (j.message || j.error) : ('HTTP ' + r.status);
			throw new Error(msg);
		}
		return j.item;
	}

	// Basic Info edit modal (HSM)
	var EDIT_MODAL_ID = 'system-edit-modal';
	var EDIT_FORM_ID = 'system-edit-form';
	var EDIT_OPEN_ID = 'detail-edit-open';
	var EDIT_CLOSE_ID = 'system-edit-close';
	var EDIT_SAVE_ID = 'system-edit-save';
	var currentAssetId = null;
	typeof window !== 'undefined' && (window.__hsmDetailCurrentAssetId = window.__hsmDetailCurrentAssetId || null);
	var currentAssetItem = null;

	function getCurrentAssetId(){
		try{
			if(window.BlossomAssetContext && typeof window.BlossomAssetContext.getAssetId === 'function'){
				var id0 = window.BlossomAssetContext.getAssetId();
				if(id0) return id0;
			}
		}catch(_e0){ }
		try{
			var prefix = storagePrefix();
			return getSelectedAssetId(prefix);
		}catch(_e1){ }
		return null;
	}

	function openModalLocal(id){
		var el = document.getElementById(id);
		if(!el) return;
		document.body.classList.add('modal-open');
		el.classList.add('show');
		el.setAttribute('aria-hidden','false');
	}
	function closeModalLocal(id){
		var el = document.getElementById(id);
		if(!el) return;
		el.classList.remove('show');
		el.setAttribute('aria-hidden','true');
		if(!document.querySelector('.modal-overlay-full.show')){
			document.body.classList.remove('modal-open');
		}
	}

	function normStr(v){ return (v == null ? '' : String(v)).trim(); }
	function isEmptyRequiredValue(v){
		var s = normStr(v);
		if(!s) return true;
		return (s === '-' || s === '—' || s === '선택');
	}
	function coerceIntOrNull(v){
		var s = normStr(v);
		if(!s) return null;
		var n = parseInt(s, 10);
		return isNaN(n) ? null : n;
	}
	function toOX(v){
		if(v == null) return '';
		if(v === true) return 'O';
		if(v === false) return 'X';
		var s = normStr(v).toUpperCase();
		if(!s) return '';
		if(s === '1' || s === 'Y' || s === 'O' || s === 'TRUE') return 'O';
		if(s === '0' || s === 'N' || s === 'X' || s === 'FALSE') return 'X';
		return s;
	}
	function toCoreFlag(v){
		if(v == null) return '';
		if(v === true) return '핵심';
		if(v === false) return '일반';
		var s = normStr(v);
		if(!s) return '';
		if(s === '1' || s.toUpperCase() === 'Y') return '핵심';
		if(s === '0' || s.toUpperCase() === 'N') return '일반';
		return s;
	}

	function attachSecurityScoreRecalc(formId){
		var form = document.getElementById(formId);
		if(!form) return;
		var scoreInput = form.querySelector('input[name="security_score"]');
		if(!scoreInput) return;
		function recompute(){
			var c = parseInt((form.querySelector('[name="confidentiality"]')||{}).value || '0', 10) || 0;
			var i = parseInt((form.querySelector('[name="integrity"]')||{}).value || '0', 10) || 0;
			var a = parseInt((form.querySelector('[name="availability"]')||{}).value || '0', 10) || 0;
			var total = c + i + a;
			scoreInput.value = total ? String(total) : '';
			var gradeField = form.querySelector('[name="system_grade"]');
			if(gradeField){
				if(total >= 8) gradeField.value = '1등급';
				else if(total >= 6) gradeField.value = '2등급';
				else if(total > 0) gradeField.value = '3등급';
			}
		}
		['confidentiality','integrity','availability'].forEach(function(n){
			var el = form.querySelector('[name="'+n+'"]');
			if(el) el.addEventListener('change', recompute);
		});
		recompute();
	}

	function enforceVirtualizationDash(form){
		if(!form) return;
		var virt = form.querySelector('[name="virtualization"]');
		if(!virt) return;
		var v = normStr(virt.value);
		var dashText = ['vendor','model','serial','location_pos'];
		var dashNum = ['slot','u_size','rack_face'];
		function setDash(el){ if(!el) return; el.value = '-'; }
		function clearIfDash(el, t){ if(!el) return; if(el.value === '-') el.value = ''; if(t){ try{ el.type=t; }catch(_){ } } }
		if(v === '가상'){
			dashText.forEach(function(n){ setDash(form.querySelector('[name="'+n+'"]')); });
			dashNum.forEach(function(n){
				var el = form.querySelector('[name="'+n+'"]');
				if(!el) return;
				if(!el.dataset.origType){ el.dataset.origType = el.type || 'number'; }
				try{ el.type = 'text'; }catch(_){ }
				setDash(el);
			});
		} else {
			dashText.forEach(function(n){ clearIfDash(form.querySelector('[name="'+n+'"]')); });
			dashNum.forEach(function(n){
				var el = form.querySelector('[name="'+n+'"]');
				if(!el) return;
				var orig = el.dataset.origType || 'number';
				clearIfDash(el, orig);
				if(el.type === 'number'){ el.min = '0'; el.step = '1'; }
			});
		}
	}
	function attachVirtualizationHandler(formId){
		var form = document.getElementById(formId);
		if(!form) return;
		var sel = form.querySelector('[name="virtualization"]');
		if(!sel) return;
		sel.addEventListener('change', function(){ enforceVirtualizationDash(form); });
		enforceVirtualizationDash(form);
	}

	function buildEditForm(data){
		var form = document.getElementById(EDIT_FORM_ID);
		if(!form) return;
		var COLUMN_META = {
			work_status: { label: '업무 상태' },
			work_type: { label: '업무 분류' },
			work_category: { label: '업무 구분' },
			work_operation: { label: '업무 운영' },
			work_group: { label: '업무 그룹' },
			work_name: { label: '업무 이름' },
			system_name: { label: '시스템 이름' },
			system_ip: { label: '시스템 IP' },
			manage_ip: { label: '관리 IP' },
			vendor: { label: '시스템 제조사' },
			model: { label: '시스템 모델명' },
			serial: { label: '시스템 일련번호' },
			virtualization: { label: '시스템 가상화' },
			location_place: { label: '시스템 장소' },
			location_pos: { label: '시스템 위치' },
			slot: { label: '시스템 슬롯' },
			u_size: { label: '시스템 크기' },
      rack_face: { label: 'RACK 전면/후면' },
			sys_dept: { label: '시스템 담당부서' },
			sys_owner: { label: '시스템 담당자' },
			svc_dept: { label: '서비스 담당부서' },
			svc_owner: { label: '서비스 담당자' },
			confidentiality: { label: '기밀성' },
			integrity: { label: '무결성' },
			availability: { label: '가용성' },
			security_score: { label: '보안 점수' },
			system_grade: { label: '시스템 등급' },
			core_flag: { label: '핵심/일반' },
			dr_built: { label: 'DR 구축여부' },
			svc_redundancy: { label: '서비스 이중화' }
		};

		var GROUPS = [
			{ title:'비즈니스', cols:['work_type','work_category','work_status','work_operation','work_group','work_name','system_name','system_ip','manage_ip'] },
			{ title:'시스템', cols:['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','rack_face'] },
			{ title:'담당자', cols:['sys_dept','sys_owner','svc_dept','svc_owner'] },
			{ title:'점검', cols:['confidentiality','integrity','availability','security_score','system_grade','core_flag','dr_built','svc_redundancy'] }
		];

		function fieldInput(col, value){
			var opts = {
				virtualization: ['','물리','가상'],
				confidentiality: ['','1','2','3'],
				integrity: ['','1','2','3'],
				availability: ['','1','2','3'],
				system_grade: ['','1등급','2등급','3등급'],
				core_flag: ['','핵심','일반'],
				dr_built: ['','O','X'],
				svc_redundancy: ['','O','X']
			};
			var required = (col === 'work_status' || col === 'work_name' || col === 'system_name');
			if(col === 'security_score'){
				return '<input name="security_score" class="form-input" type="number" readonly placeholder="자동 합계" value="'+(normStr(value))+'">';
			}
			// Allow FK select converter to turn model into a dependent searchable select
			if(col === 'model'){
				return '<input name="'+col+'" class="form-input" data-fk-allow="1" placeholder="모델 선택" '+(required?'required':'')+' value="'+(normStr(value))+'">';
			}
			if(opts[col]){
				var isCIA = (['confidentiality','integrity','availability'].indexOf(col) > -1);
				return '<select name="'+col+'" class="form-input search-select '+(isCIA?'score-trigger':'')+'" data-searchable="true" data-placeholder="선택" '+(required?'required':'')+'>'+
					opts[col].map(function(o){ return '<option value="'+o+'" '+(String(o)===String(value)?'selected':'')+'>'+(o||'-')+'</option>'; }).join('')+
				'</select>';
			}
			if(col==='rack_face'){
				var selF=(value||'').toUpperCase()==='REAR'||value==='후면'?'':' selected';
				var selR=(value||'').toUpperCase()==='REAR'||value==='후면'?' selected':'';
				return '<select name="rack_face" class="form-input search-select" data-searchable="true" data-placeholder="선택"><option value="">선택</option><option value="FRONT"'+selF+'>전면</option><option value="REAR"'+selR+'>후면</option></select>';
			}
			if(['slot','u_size'].indexOf(col) > -1){
				return '<input name="'+col+'" type="number" min="0" step="1" class="form-input" value="'+(normStr(value))+'">';
			}
			return '<input name="'+col+'" class="form-input" '+(required?'required':'')+' value="'+(normStr(value))+'">';
		}

		var html = GROUPS.map(function(g){
			var grid = g.cols.map(function(c){
				var meta = COLUMN_META[c] || { label: c };
				var isReq = (c === 'work_status' || c === 'work_name' || c === 'system_name');
				var label = (c === 'security_score' ? '보안 점수' : meta.label) + (isReq ? '<span class="required">*</span>' : '');
				return '<div class="form-row"><label>'+label+'</label>' + fieldInput(c, (data||{})[c]) + '</div>';
			}).join('');
			return '<div class="form-section"><div class="section-header"><h4>'+g.title+'</h4></div><div class="form-grid">'+grid+'</div></div>';
		}).join('');

		form.innerHTML = html;
		attachSecurityScoreRecalc(EDIT_FORM_ID);
		attachVirtualizationHandler(EDIT_FORM_ID);

		// Enhance modal fields into searchable FK selects (vendor/model, dept/owner, etc.)
		try{
			var modalRoot = document.getElementById(EDIT_MODAL_ID);
			if(window.BlossomFkSelect && typeof window.BlossomFkSelect.enhance === 'function' && modalRoot){
				window.BlossomFkSelect.enhance(modalRoot);
			} else if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
				window.BlossomSearchableSelect.enhance(modalRoot || form);
				if(typeof window.BlossomSearchableSelect.syncAll === 'function') window.BlossomSearchableSelect.syncAll(modalRoot || form);
			}
		}catch(_eEnhance){ }
	}

	function buildEditFormFromPage(){
		function text(sel){ var el = document.querySelector(sel); return el ? normStr(el.textContent) : ''; }
		var data = {
			work_status: text('.basic-info-card:nth-child(1) .info-row:nth-child(1) .status-pill .status-text'),
			work_type: text('.basic-info-card:nth-child(1) .info-row:nth-child(2) .info-value'),
			work_category: text('.basic-info-card:nth-child(1) .info-row:nth-child(3) .info-value'),
			work_operation: text('.basic-info-card:nth-child(1) .info-row:nth-child(4) .info-value'),
			work_group: text('.basic-info-card:nth-child(1) .info-row:nth-child(5) .info-value'),
			work_name: text('.basic-info-card:nth-child(1) .info-row:nth-child(6) .info-value'),
			system_name: text('.basic-info-card:nth-child(1) .info-row:nth-child(7) .info-value'),
			system_ip: text('.basic-info-card:nth-child(1) .info-row:nth-child(8) .info-value'),
			manage_ip: text('.basic-info-card:nth-child(1) .info-row:nth-child(9) .info-value'),
			vendor: text('.basic-info-card:nth-child(2) .info-row:nth-child(1) .info-value'),
			model: text('.basic-info-card:nth-child(2) .info-row:nth-child(2) .info-value'),
			serial: text('.basic-info-card:nth-child(2) .info-row:nth-child(3) .info-value'),
			virtualization: text('.basic-info-card:nth-child(2) .info-row:nth-child(4) .info-value'),
			location_place: text('.basic-info-card:nth-child(2) .info-row:nth-child(5) .info-value'),
			location_pos: text('.basic-info-card:nth-child(2) .info-row:nth-child(6) .info-value'),
			slot: text('.basic-info-card:nth-child(2) .info-row:nth-child(7) .info-value'),
			u_size: text('.basic-info-card:nth-child(2) .info-row:nth-child(8) .info-value'),
			sys_dept: text('.basic-info-card:nth-child(3) .info-row:nth-child(1) .info-value'),
			sys_owner: text('.basic-info-card:nth-child(3) .info-row:nth-child(2) .info-value'),
			svc_dept: text('.basic-info-card:nth-child(3) .info-row:nth-child(3) .info-value'),
			svc_owner: text('.basic-info-card:nth-child(3) .info-row:nth-child(4) .info-value'),
			confidentiality: text('.basic-info-card:nth-child(4) .info-row:nth-child(1) .num-badge'),
			integrity: text('.basic-info-card:nth-child(4) .info-row:nth-child(2) .num-badge'),
			availability: text('.basic-info-card:nth-child(4) .info-row:nth-child(3) .num-badge'),
			security_score: text('.basic-info-card:nth-child(4) .info-row:nth-child(4) .num-badge'),
			system_grade: text('.basic-info-card:nth-child(4) .info-row:nth-child(5) .info-value'),
			core_flag: text('.basic-info-card:nth-child(4) .info-row:nth-child(6) .info-value'),
			dr_built: text('.basic-info-card:nth-child(4) .info-row:nth-child(7) .ox-badge'),
			svc_redundancy: text('.basic-info-card:nth-child(4) .info-row:nth-child(8) .ox-badge'),
		};
		buildEditForm(data);
	}

	function buildEditFormFromAssetItem(asset){
		var data = {
			work_status: pick(asset, ['work_status_code','work_status_name','work_status']),
			work_type: pick(asset, ['work_type_code','work_type_name','work_type']),
			work_category: pick(asset, ['work_category_code','work_category_name','work_category']),
			work_operation: pick(asset, ['work_operation_code','work_operation_name','work_operation']),
			work_group: pick(asset, ['work_group_code','work_group_name','work_group']),
			work_name: pick(asset, ['work_name']),
			system_name: pick(asset, ['system_name']),
			system_ip: pick(asset, ['system_ip']),
			manage_ip: pick(asset, ['mgmt_ip','manage_ip']),
			vendor: pick(asset, ['manufacturer_code','manufacturer_name','vendor','vendor_name']),
			model: pick(asset, ['server_code','server_model_name','model','model_name']),
			serial: pick(asset, ['serial_number','serial']),
			virtualization: pick(asset, ['virtualization_type','virtualization']),
			location_place: pick(asset, ['center_code','center_name']),
			location_pos: pick(asset, ['rack_code','rack_name']),
			slot: pick(asset, ['system_slot','slot']),
			u_size: pick(asset, ['system_size','u_size']),
			rack_face: pick(asset, ['rack_face']),
			sys_dept: pick(asset, ['system_dept_code','system_dept_name']),
			sys_owner: pick(asset, ['system_owner_emp_no','system_owner_name']),
			svc_dept: pick(asset, ['service_dept_code','service_dept_name']),
			svc_owner: pick(asset, ['service_owner_emp_no','service_owner_name']),
			confidentiality: pick(asset, ['cia_confidentiality','confidentiality']),
			integrity: pick(asset, ['cia_integrity','integrity']),
			availability: pick(asset, ['cia_availability','availability']),
			security_score: pick(asset, ['security_score','security_total']),
			system_grade: pick(asset, ['system_grade','grade']),
			core_flag: toCoreFlag(pick(asset, ['core_flag','is_core_system','core'])),
			dr_built: toOX(pick(asset, ['dr_built','has_dr_site','dr'])),
			svc_redundancy: toOX(pick(asset, ['svc_redundancy','has_service_ha','redundancy'])),
		};
		buildEditForm(data);
	}

	function getFieldValue(form, name){
		var el = form ? form.querySelector('[name="'+name+'"]') : null;
		return el ? normStr(el.value) : '';
	}
	var FIELD_TO_PAYLOAD_KEY = {
		work_type: 'work_type',
		work_category: 'work_category',
		work_status: 'work_status',
		work_operation: 'work_operation',
		work_group: 'work_group',
		work_name: 'work_name',
		system_name: 'system_name',
		system_ip: 'system_ip',
		manage_ip: 'mgmt_ip',
		vendor: 'vendor',
		model: 'model',
		serial: 'serial',
		virtualization: 'virtualization_type',
		location_place: 'center_code',
		location_pos: 'rack_code',
		slot: 'system_slot',
		u_size: 'system_size',
		rack_face: 'rack_face',
		sys_dept: 'system_department',
		sys_owner: 'system_owner',
		svc_dept: 'service_department',
		svc_owner: 'service_owner',
		confidentiality: 'cia_confidentiality',
		integrity: 'cia_integrity',
		availability: 'cia_availability',
		security_score: 'security_score',
		system_grade: 'system_grade',
		core_flag: 'core_flag',
		dr_built: 'dr_built',
		svc_redundancy: 'svc_redundancy'
	};
	var NUMERIC_PAYLOAD_KEYS = new Set(['cia_confidentiality','cia_integrity','cia_availability','security_score','system_slot','system_size']);
	var FK_CLEAR_ON_EMPTY_KEYS = new Set([
		'work_type','work_category','work_operation','work_group',
		'virtualization_type',
		'center_code','rack_code',
		'vendor','model',
		'system_slot','system_size',
		'system_department','system_owner','service_department','service_owner'
	]);

	function collectFormSanitized(form){
		var out = {};
		if(!form) return out;
		var els = Array.from(form.querySelectorAll('input,select,textarea'));
		els.forEach(function(el){
			if(!el.name) return;
			if(el.disabled) return;
			var v = (el.value == null) ? '' : String(el.value);
			if(v.trim() === '-') v = '';
			if(el.tagName === 'SELECT' && v === ''){
				out[el.name] = null; // explicit clear
				return;
			}
			out[el.name] = v;
		});
		return out;
	}

	function buildUpdatePayload(form){
		var formData = collectFormSanitized(form);
		var payload = {};
		Object.keys(FIELD_TO_PAYLOAD_KEY).forEach(function(field){
			var payloadKey = FIELD_TO_PAYLOAD_KEY[field];
			if(!(field in formData)) return;
			var raw = formData[field];
			if(raw === undefined) return;
			if(raw === null){
				payload[payloadKey] = null;
				return;
			}
			var s = String(raw).trim();
			if(s === ''){
				// When FK enhancer is not applied, FK-like fields may remain as plain inputs.
				// If the user clears them, send explicit null so backend clears previous values.
				if(payloadKey === 'security_score' || FK_CLEAR_ON_EMPTY_KEYS.has(payloadKey)){
					payload[payloadKey] = null;
				}
				return;
			}
			if(NUMERIC_PAYLOAD_KEYS.has(payloadKey)){
				var n = parseInt(s, 10);
				if(isNaN(n)) return;
				payload[payloadKey] = n;
				return;
			}
			payload[payloadKey] = s;
		});

		// Cascade clear rules (match SAN Director baseline)
		if(Object.prototype.hasOwnProperty.call(payload, 'center_code') && payload.center_code === null){
			payload.rack_code = null;
		}
		if(Object.prototype.hasOwnProperty.call(payload, 'vendor') && payload.vendor === null){
			payload.model = null;
		}
		if(Object.prototype.hasOwnProperty.call(payload, 'system_department') && payload.system_department === null){
			payload.system_owner = null;
		}
		if(Object.prototype.hasOwnProperty.call(payload, 'service_department') && payload.service_department === null){
			payload.service_owner = null;
		}

		// Keep existing code/name to avoid accidental blanks
		if(currentAssetItem){
			if(currentAssetItem.asset_code) payload.asset_code = currentAssetItem.asset_code;
			if(currentAssetItem.asset_name) payload.asset_name = currentAssetItem.asset_name;
		}
		return payload;
	}

	document.addEventListener('DOMContentLoaded', function(){
		// Mark page-size selects as chosen after interaction (CSS styling)
		(function(){
			function wireChosen(id){
				var sel = document.getElementById(id); if(!sel) return;
				function apply(){ if(sel.value){ sel.classList.add('is-chosen'); } }
				sel.addEventListener('change', apply);
				apply();
			}
			['hw-page-size','if-page-size','ac-page-size','mt-page-size','tk-page-size','lg-page-size']
				.forEach(wireChosen);
		})();

		var prefix = storagePrefix();
		var assetId = getSelectedAssetId(prefix);
		if(assetId){
			persistSelectedAssetId(prefix, assetId);
			stripAssetIdFromUrl();
		}
		decorateTabLinksWithAssetId(assetId);

		// Expose minimal context for other scripts (if any)
		try{
			window.BlossomAssetContext = window.BlossomAssetContext || {};
			window.BlossomAssetContext.getAssetId = function(){ return getSelectedAssetId(prefix); };
		}catch(_eExpose){ }

		var hasBasicMarkup = !!(document.getElementById('basic') && document.querySelector('.basic-info-grid'));
		if(!hasBasicMarkup){
			if(!(document.getElementById('page-title') || document.getElementById('page-subtitle'))) return;
			if(!assetId){
				var cachedNoId = readSelectedRow(prefix);
				if(cachedNoId){
					renderHeaderOnly(cachedNoId, null);
				} else {
					setText('#page-title', 'HSM');
					setText('#page-subtitle', '-');
				}
				return;
			}

			// Fast paint from cache, but still refresh from API so tabs see canonical fields
			// (prevents stale list-row values like HARDWARE-HSM from sticking around).
			var cached = readSelectedRow(prefix);
			if(cached){
				try{ persistCurrentSystemFields(prefix, cached); }catch(_ePersist0){ }
				try{
					if(window.BlossomTab01Hardware && typeof window.BlossomTab01Hardware.refreshSystemRow === 'function'){
						window.BlossomTab01Hardware.refreshSystemRow();
					}
				}catch(_eRefresh0){ }
				renderHeaderOnly(cached, assetId);
			}

			fetchHsmAsset(assetId)
				.then(function(asset){
					try{ sessionStorage.setItem(prefix+':selected:row', JSON.stringify(asset)); }catch(_e0){ }
					try{ localStorage.setItem(prefix+':selected:row', JSON.stringify(asset)); }catch(_e1){ }
					try{ persistCurrentSystemFields(prefix, asset); }catch(_ePersist1){ }
					try{
						if(window.BlossomTab01Hardware && typeof window.BlossomTab01Hardware.refreshSystemRow === 'function'){
							window.BlossomTab01Hardware.refreshSystemRow();
						}
					}catch(_eRefresh1){ }
					renderHeaderOnly(asset, assetId);
				})
				.catch(function(){
					// Keep whatever we rendered from cache; only fall back if nothing was shown.
					if(!cached){
						setText('#page-title', 'HSM');
						setText('#page-subtitle', '-');
					}
				});
			return;
		}

		// 기본정보 탭: hydrate from API
		if(!assetId){
			setText('#page-title', 'HSM');
			setText('#page-subtitle', '대상이 선택되지 않았습니다. 목록에서 다시 선택해 주세요.');
			return;
		}

		// Fast paint: use stored row first, then refresh from API.
		try{
			var cachedBasic = readSelectedRow(prefix);
			if(cachedBasic){
				currentAssetId = assetId;
				currentAssetItem = cachedBasic;
				renderBasicInfo(cachedBasic, assetId);
			}
		}catch(_eFast){ }

		fetchHsmAsset(assetId)
			.then(function(asset){
				try{ sessionStorage.setItem(prefix+':selected:row', JSON.stringify(asset)); }catch(_e0){ }
				try{ localStorage.setItem(prefix+':selected:row', JSON.stringify(asset)); }catch(_e1){ }
				currentAssetId = assetId;
				currentAssetItem = asset;
				try{ persistCurrentSystemFields(prefix, asset); }catch(_ePersist2){ }
				try{
					if(window.BlossomTab01Hardware && typeof window.BlossomTab01Hardware.refreshSystemRow === 'function'){
						window.BlossomTab01Hardware.refreshSystemRow();
					}
				}catch(_eRefresh2){ }
				renderBasicInfo(asset, assetId);
			})
			.catch(function(err){
				try{ console.error('[hsm detail] fetch failed', err); }catch(_){ }
				var fallback = readSelectedRow(prefix);
				if(fallback) renderBasicInfo(fallback, assetId);
				else {
					setText('#page-title', 'HSM');
					setText('#page-subtitle', '상세 정보를 불러올 수 없습니다.');
				}
			});
	});

	// Wire the Basic Info edit modal open/close/save (HSM)
	document.addEventListener('DOMContentLoaded', function(){
		var openBtn = document.getElementById(EDIT_OPEN_ID);
		var modalEl = document.getElementById(EDIT_MODAL_ID);
		if(!openBtn || !modalEl) return;
		var closeBtn = document.getElementById(EDIT_CLOSE_ID);
		var saveBtn = document.getElementById(EDIT_SAVE_ID);

		openBtn.addEventListener('click', async function(){
			try{
				if(!currentAssetId){ currentAssetId = getCurrentAssetId(); }
				if(currentAssetId && !currentAssetItem){
					currentAssetItem = await fetchHsmAsset(currentAssetId);
					try{
						var prefix = storagePrefix();
						sessionStorage.setItem(prefix+':selected:row', JSON.stringify(currentAssetItem));
						localStorage.setItem(prefix+':selected:row', JSON.stringify(currentAssetItem));
					}catch(_e0){ }
				}
				if(currentAssetItem){
					buildEditFormFromAssetItem(currentAssetItem);
				} else {
					buildEditFormFromPage();
				}
			}catch(err){
				try{ console.warn('[hsm-detail] build modal failed:', err); }catch(_){ }
				buildEditFormFromPage();
			}
			openModalLocal(EDIT_MODAL_ID);
		});

		if(closeBtn){
			closeBtn.addEventListener('click', function(){ closeModalLocal(EDIT_MODAL_ID); });
		}
		modalEl.addEventListener('click', function(e){ if(e.target === modalEl) closeModalLocal(EDIT_MODAL_ID); });
		document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && modalEl.classList.contains('show')) closeModalLocal(EDIT_MODAL_ID); });

		if(saveBtn){
			saveBtn.addEventListener('click', async function(){
				var form = document.getElementById(EDIT_FORM_ID);
				if(!form) return;
				var ws = getFieldValue(form,'work_status');
				var wn = getFieldValue(form,'work_name');
				var sn = getFieldValue(form,'system_name');
				if(isEmptyRequiredValue(ws) || isEmptyRequiredValue(wn) || isEmptyRequiredValue(sn)){
					try{ alert('필수 항목(업무 상태/업무 이름/시스템 이름)을 입력해 주세요.'); }catch(_){ }
					return;
				}
				try{
					if(!currentAssetId){ currentAssetId = getCurrentAssetId(); }
					if(!currentAssetId){
						try{ alert('자산 ID를 찾을 수 없습니다. 목록에서 다시 선택해 주세요.'); }catch(_){ }
						return;
					}
					saveBtn.disabled = true;
					var payload = buildUpdatePayload(form);
					var updated = await putHsmAsset(currentAssetId, payload);
					currentAssetItem = updated;
					try{
						var prefix = storagePrefix();
						sessionStorage.setItem(prefix+':selected:row', JSON.stringify(updated));
						localStorage.setItem(prefix+':selected:row', JSON.stringify(updated));
					}catch(_e1){ }
					try{ renderBasicInfo(updated, currentAssetId); }catch(_e2){ }
					closeModalLocal(EDIT_MODAL_ID);
				}catch(err){
					try{ console.warn('[hsm-detail] save failed:', err); }catch(_){ }
					try{ alert(err && err.message ? err.message : '저장 중 오류가 발생했습니다.'); }catch(_e3){ }
				}finally{
					try{ saveBtn.disabled = false; }catch(_e4){ }
				}
			});
		}
	});

	// ---------- Hardware table interactions (tab01-hardware) ----------
	document.addEventListener('DOMContentLoaded', function(){
		(function(){
			var table = document.getElementById('hw-spec-table');
			if(!table) return;
			// Shared handler (tab01-hardware.js) takes precedence.
			if(window.BlossomTab01Hardware && window.BlossomTab01Hardware.handlesTable) return;
			var empty = document.getElementById('hw-empty');
			var infoEl = document.getElementById('hw-pagination-info');
			var numWrap = document.getElementById('hw-page-numbers');
			var btnFirst = document.getElementById('hw-first');
			var btnPrev = document.getElementById('hw-prev');
			var btnNext = document.getElementById('hw-next');
			var btnLast = document.getElementById('hw-last');

			var hwKeyPrefix = 'hsm';
			function getSelectedHardwareId(){
				try{
					var params = new URLSearchParams(window.location.search || '');
					var cand = params.get('asset_id') || params.get('assetId') || params.get('id');
					var id = parseInt(cand || '', 10);
					if(!isNaN(id) && id > 0) return id;
				}catch(_){ }
				try{
					var raw0 = sessionStorage.getItem(hwKeyPrefix + ':selected:row') || localStorage.getItem(hwKeyPrefix + ':selected:row') || '';
					if(!raw0){
						raw0 = sessionStorage.getItem('hsm:selected:row') || localStorage.getItem('hsm:selected:row') || '';
					}
					if(raw0){
						var row0 = JSON.parse(raw0);
						var rid0 = row0 && row0.id;
						var n0 = parseInt(rid0, 10);
						if(!isNaN(n0) && n0 > 0) return n0;
					}
				}catch(_e0){ }
				try{
					for(var i=0;i<sessionStorage.length;i++){
						var k = sessionStorage.key(i);
						if(!k || !/:selected:row$/.test(k)) continue;
						var raw = sessionStorage.getItem(k);
						if(!raw) continue;
						var row = JSON.parse(raw);
						var rid = row && row.id;
						var n = parseInt(rid, 10);
						if(!isNaN(n) && n > 0) return n;
					}
				}catch(_e){ }
				return null;
			}

			var hardwareId = getSelectedHardwareId();
			function apiBase(){ return hardwareId ? ('/api/hardware/assets/' + hardwareId + '/components') : null; }
			function hwApiFetch(url, opts){
				return fetch(url, Object.assign({ headers: { 'Accept':'application/json' } }, opts||{}))
					.then(function(r){ return r.json().then(function(j){ return { status:r.status, ok:r.ok, json:j }; }); });
			}
			function hwAlert(msg){ try{ window.alert(msg); }catch(_){ } }
			function hwSetBusy(isBusy){
				try{
					var btnAdd = document.getElementById('hw-row-add');
					if(btnAdd) btnAdd.disabled = !!isBusy;
					var btnCsv = document.getElementById('hw-download-btn');
					if(btnCsv) btnCsv.disabled = !!isBusy;
				}catch(_){ }
			}
			function hwGetDataCols(){
				try{
					var tbody = table.querySelector('tbody');
					var tmpl = tbody ? tbody.querySelector('tr') : null;
					if(tmpl){
						var cols = Array.from(tmpl.querySelectorAll('td[data-col]')).map(function(td){ return td.getAttribute('data-col'); }).filter(Boolean);
						if(cols.length) return cols;
					}
				}catch(_){ }
				return ['type','model','spec','vendor','qty','fw','remark'];
			}
			function hwMakeSavedRow(item){
				var cols = hwGetDataCols();
				var tr = document.createElement('tr');
				if(item && item.id != null) tr.setAttribute('data-id', String(item.id));
				var tdCheck = document.createElement('td');
				tdCheck.innerHTML = '<input type="checkbox" class="hw-row-check" aria-label="행 선택">';
				tr.appendChild(tdCheck);
				cols.forEach(function(col){
					var td = document.createElement('td');
					td.setAttribute('data-col', col);
					var v = (item && item[col] != null) ? String(item[col]).trim() : '';
					td.textContent = v ? v : '-';
					tr.appendChild(td);
				});
				var actions = document.createElement('td');
				actions.className = 'system-actions table-actions';
				actions.innerHTML = '<button class="action-btn js-hw-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button> <button class="action-btn danger js-hw-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>';
				tr.appendChild(actions);
				return tr;
			}
			function hwPayloadFromRow(tr){
				var payload = {};
				try{
					var cols = hwGetDataCols();
					cols.forEach(function(col){
						var td = tr.querySelector('[data-col="'+col+'"]');
						if(!td) return;
						var text = (td.textContent||'').trim();
						if(text === '-') text = '';
						if(!text) return;
						if(col === 'qty'){
							var q = parseInt(text, 10);
							if(!isNaN(q) && q > 0) payload.qty = q;
							return;
						}
						payload[col] = text;
					});
				}catch(_){ }
				return payload;
			}
			function updateEmptyState(){
				try{
					var tbody = table.querySelector('tbody');
					var rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
					var count = rows.length;
					if(infoEl) infoEl.textContent = String(count) + '개 항목';
					if(empty) empty.style.display = count ? 'none' : '';
				}catch(_e){ }
			}

			function loadFromApi(){
				var base = apiBase();
				if(!base) return Promise.resolve([]);
				hwSetBusy(true);
				return hwApiFetch(base, { method:'GET' })
					.then(function(res){
						hwSetBusy(false);
						if(!(res && res.ok && res.json && res.json.success)){
							throw new Error((res && res.json && res.json.message) ? res.json.message : '불러오기 실패');
						}
						return res.json.items || [];
					})
					.catch(function(err){
						hwSetBusy(false);
						try{ console.error('[hsm hw] load failed', err); }catch(_){ }
						return [];
					});
			}

			function renderRows(items){
				var tbody = table.querySelector('tbody');
				if(!tbody) return;
				tbody.innerHTML = '';
				(items || []).forEach(function(item){
					tbody.appendChild(hwMakeSavedRow(item));
				});
				updateEmptyState();
			}

			function ensureDownloadModal(){
				var modal = document.getElementById('hw-download-modal');
				var openBtn = document.getElementById('hw-download-btn');
				var closeBtn = document.getElementById('hw-download-close');
				var confirmBtn = document.getElementById('hw-download-confirm');
				if(!modal || !openBtn || !closeBtn || !confirmBtn) return;
				function open(){ modal.setAttribute('aria-hidden','false'); modal.classList.add('open'); }
				function close(){ modal.setAttribute('aria-hidden','true'); modal.classList.remove('open'); }
				openBtn.addEventListener('click', open);
				closeBtn.addEventListener('click', close);
				modal.addEventListener('click', function(e){ if(e.target === modal) close(); });
				document.addEventListener('keydown', function(e){ if(e.key === 'Escape') close(); });
				confirmBtn.addEventListener('click', function(){
					try{
						var rangeAll = document.getElementById('hw-csv-range-all');
						var onlySelected = !(rangeAll && rangeAll.checked);
						var tbody = table.querySelector('tbody');
						var rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
						var cols = hwGetDataCols();
						var out = [];
						out.push(['유형','모델명','용량','제조사','수량','펌웨어','비고']);
						rows.forEach(function(tr){
							if(onlySelected){
								var cb = tr.querySelector('.hw-row-check');
								if(!cb || !cb.checked) return;
							}
							var row = [];
							cols.forEach(function(col){
								var td = tr.querySelector('[data-col="'+col+'"]');
								row.push(td ? (td.textContent || '').trim() : '');
							});
							// cols includes more than visible header order; normalize to known order
							var map = {}; cols.forEach(function(col, idx){ map[col]=row[idx]; });
							out.push([map.type||'', map.model||'', map.spec||'', map.vendor||'', map.qty||'', map.fw||'', map.remark||'']);
						});
						var csv = out.map(function(r){
							return r.map(function(v){
								var s = String(v == null ? '' : v);
								if(/[\",\n]/.test(s)) s = '"' + s.replace(/"/g,'""') + '"';
								return s;
							}).join(',');
						}).join('\n');
						var blob = new Blob(["\uFEFF" + csv], { type:'text/csv;charset=utf-8;' });
						var a = document.createElement('a');
						a.href = URL.createObjectURL(blob);
						a.download = 'hsm_hardware.csv';
						document.body.appendChild(a);
						a.click();
						a.remove();
						setTimeout(function(){ try{ URL.revokeObjectURL(a.href); }catch(_){} }, 1000);
						close();
					}catch(_e){
						hwAlert('CSV 생성 중 오류가 발생했습니다.');
					}
				});
			}

			function openInlineEditor(tr){
				if(!tr) return;
				if(tr.classList.contains('is-editing')) return;
				tr.classList.add('is-editing');
				var cols = hwGetDataCols();
				cols.forEach(function(col){
					var td = tr.querySelector('[data-col="'+col+'"]');
					if(!td) return;
					var old = (td.textContent||'').trim();
					if(old === '-') old = '';
					var inputType = (col === 'qty') ? 'number' : 'text';
					td.innerHTML = '<input class="form-input" type="'+inputType+'" value="'+old.replace(/"/g,'&quot;')+'" '+(col==='qty'?'min="1"':'')+' />';
				});
				var toggleBtn = tr.querySelector('.js-hw-toggle');
				if(toggleBtn){
					toggleBtn.setAttribute('data-action','save');
					toggleBtn.title='저장';
					toggleBtn.setAttribute('aria-label','저장');
					toggleBtn.innerHTML='<img src="/static/image/svg/list/free-icon-check.svg" alt="저장" class="action-icon">';
				}
			}

			function closeInlineEditor(tr, savedItem){
				if(!tr) return;
				var cols = hwGetDataCols();
				cols.forEach(function(col){
					var td = tr.querySelector('[data-col="'+col+'"]');
					if(!td) return;
					var input = td.querySelector('input');
					var val = input ? String(input.value||'').trim() : (td.textContent||'').trim();
					if(savedItem && savedItem[col] != null) val = String(savedItem[col]).trim();
					if(!val) val = '-';
					td.textContent = val;
				});
				tr.classList.remove('is-editing');
				var toggleBtn = tr.querySelector('.js-hw-toggle');
				if(toggleBtn){
					toggleBtn.setAttribute('data-action','edit');
					toggleBtn.title='편집';
					toggleBtn.setAttribute('aria-label','편집');
					toggleBtn.innerHTML='<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
				}
				updateEmptyState();
			}

			function persistRow(tr, triggerEl){
				var base = apiBase();
				if(!base) return Promise.resolve(null);
				var payload = {};
				try{
					var cols = hwGetDataCols();
					cols.forEach(function(col){
						var td = tr.querySelector('[data-col="'+col+'"]');
						if(!td) return;
						var input = td.querySelector('input');
						var text = String(input ? input.value : td.textContent).trim();
						if(text === '-') text = '';
						if(!text) return;
						if(col === 'qty'){
							var q = parseInt(text, 10);
							if(!isNaN(q) && q > 0) payload.qty = q;
							return;
						}
						payload[col] = text;
					});
				}catch(_){ }
				var idAttr = tr.getAttribute('data-id');
				var rowId = idAttr ? parseInt(idAttr, 10) : NaN;
				var url = (!isNaN(rowId) && rowId > 0) ? (base + '/' + rowId) : base;
				var method = (!isNaN(rowId) && rowId > 0) ? 'PUT' : 'POST';
				try{ if(triggerEl) triggerEl.disabled = true; }catch(_e0){ }
				hwSetBusy(true);
				return hwApiFetch(url, { method: method, headers: { 'Accept':'application/json', 'Content-Type':'application/json' }, body: JSON.stringify(payload) })
					.then(function(res){
						hwSetBusy(false);
						try{ if(triggerEl) triggerEl.disabled = false; }catch(_e1){ }
						if(!(res && res.ok && res.json && res.json.success)){
							throw new Error((res && res.json && res.json.message) ? res.json.message : '저장 실패');
						}
						var item = res.json.item || null;
						if(item && item.id != null) tr.setAttribute('data-id', String(item.id));
						return item;
					})
					.catch(function(err){
						hwSetBusy(false);
						try{ if(triggerEl) triggerEl.disabled = false; }catch(_e2){ }
						hwAlert(String(err && err.message ? err.message : '저장 중 오류가 발생했습니다.'));
						return null;
					});
			}

			function deleteRow(tr){
				var base = apiBase();
				if(!base) return;
				var idAttr = tr.getAttribute('data-id');
				var rowId = idAttr ? parseInt(idAttr, 10) : NaN;
				if(!(rowId > 0)){
					tr.remove();
					updateEmptyState();
					return;
				}
				if(!confirm('삭제하시겠습니까?')) return;
				hwSetBusy(true);
				hwApiFetch(base + '/' + rowId, { method:'DELETE' })
					.then(function(res){
						hwSetBusy(false);
						if(!(res && res.ok && res.json && res.json.success)){
							throw new Error((res && res.json && res.json.message) ? res.json.message : '삭제 실패');
						}
						tr.remove();
						updateEmptyState();
					})
					.catch(function(err){
						hwSetBusy(false);
						hwAlert(String(err && err.message ? err.message : '삭제 중 오류가 발생했습니다.'));
					});
			}

			// Wire events
			ensureDownloadModal();
			var btnAdd = document.getElementById('hw-row-add');
			if(btnAdd){
				btnAdd.addEventListener('click', function(){
					var tbody = table.querySelector('tbody');
					if(!tbody) return;
					var tr = hwMakeSavedRow({});
					tbody.prepend(tr);
					openInlineEditor(tr);
					updateEmptyState();
				});
			}
			table.addEventListener('click', function(e){
				var toggle = e.target.closest('.js-hw-toggle');
				if(toggle){
					var tr = toggle.closest('tr');
					var action = toggle.getAttribute('data-action');
					if(action === 'edit'){
						openInlineEditor(tr);
						return;
					}
					if(action === 'save'){
						persistRow(tr, toggle).then(function(item){
							closeInlineEditor(tr, item);
						});
						return;
					}
				}
				var del = e.target.closest('.js-hw-del');
				if(del){
					var tr2 = del.closest('tr');
					deleteRow(tr2);
					return;
				}
			});

			// Initial load
			loadFromApi().then(renderRows);
		})();
	});
})();

