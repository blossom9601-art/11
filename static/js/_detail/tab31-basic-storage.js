/*
 * tab31-basic-storage.js  v12
 * 스토리지 구성정보 탭 — 공통 JS
 * ──────────────────────────────────────────────────────────
 * 공통 템플릿 layouts/tab31-basic-storage-shared.html 과 함께 사용.
 * 페이지별 설정은 <main data-scope-key data-api-base data-asset-prefix
 * data-list-path> 로 주입. URL 기반 분기를 제거하고 data 속성만 참조.
 */

(function(){
	// Utilities
	function toast(msg, level){
		var m = String(msg || '');
		try{
			if(typeof window.showToast === 'function'){
				// showToast is globally no-op in this project now; don't rely on it for error visibility.
				window.showToast(m, level || 'info');
			}
		}catch(_e0){ }
		// Keep errors visible even when toast is disabled.
		if(String(level || '').toLowerCase() === 'error'){
			try{ window.alert(m); }catch(_e1){ }
		}
	}
	function fetchJSON(url, options){
		options = options || {};
		if(!options.credentials) options.credentials = 'same-origin';
		options.headers = options.headers || {};
		if(!options.headers['Accept']) options.headers['Accept'] = 'application/json';
		if(options.body && !options.headers['Content-Type']) options.headers['Content-Type'] = 'application/json';
		return fetch(url, options).then(function(res){
			return res.text().then(function(txt){
				var data = null;
				try{ data = txt ? JSON.parse(txt) : null; }catch(_e){ data = null; }
				if(!res.ok){
					var msg = (data && (data.message || data.error)) ? (data.message || data.error) : ('HTTP ' + res.status);
					var err = new Error(msg);
					err.status = res.status;
					err.body = data;
					throw err;
				}
				return data;
			});
		});
	}

	function ensureLottie(cb){
		try{
			if(window.lottie){ cb && cb(); return; }
			var s = document.createElement('script');
			s.src = '/static/vendor/lottie/lottie.min.5.12.2.js';
			s.async = true;
			s.onload = function(){ try{ cb && cb(); }catch(_e0){} };
			document.head.appendChild(s);
		}catch(_e1){
			// ignore
		}
	}
	var _allocNoDataAnim = null;
	var _allocTooltipEl = null;
	function _ensureAllocTooltipEl(){
		try{
			if(_allocTooltipEl && _allocTooltipEl.parentNode) return _allocTooltipEl;
			var el = document.createElement('div');
			el.className = 'alloc-tooltip';
			el.setAttribute('aria-hidden','true');
			try{ el.style.display = 'none'; }catch(_e0){}
			document.body.appendChild(el);
			_allocTooltipEl = el;
			return el;
		}catch(_e1){ return null; }
	}
	function _hideAllocTooltip(){
		try{
			var el = _allocTooltipEl;
			if(!el) return;
			el.classList.remove('show');
			el.style.display = 'none';
		}catch(_e0){}
	}
	function _wireAllocTooltip(donut){
		try{
			if(!donut || donut.__allocTooltipWired) return;
			donut.__allocTooltipWired = true;
			donut.addEventListener('mouseleave', function(){
				_hideAllocTooltip();
			});
			donut.addEventListener('mousemove', function(ev){
				try{
					var segs = donut.__allocSegments;
					if(!Array.isArray(segs) || !segs.length) { _hideAllocTooltip(); return; }
					var rect = donut.getBoundingClientRect();
					var cx = rect.left + rect.width/2;
					var cy = rect.top + rect.height/2;
					var dx = (ev.clientX - cx);
					var dy = (ev.clientY - cy);
					if(!isFinite(dx) || !isFinite(dy)) { _hideAllocTooltip(); return; }
					// Map to conic-gradient degrees: 0deg at top, clockwise.
					var deg = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
					var pctAt = deg / 3.6; // 0..100
					var picked = null;
					for(var i=0;i<segs.length;i++){
						var s = segs[i];
						if(pctAt >= s.start && pctAt < s.end){ picked = s; break; }
					}
					if(!picked) picked = segs[segs.length - 1];
					if(!picked || picked.pct <= 0) { _hideAllocTooltip(); return; }

					var tip = _ensureAllocTooltipEl();
					if(!tip) return;
					tip.textContent = String(picked.name || '-') + ', ' + String(picked.pct) + '%';
					tip.style.left = (ev.clientX + 12) + 'px';
					tip.style.top = (ev.clientY + 12) + 'px';
					tip.style.display = 'block';
					tip.classList.add('show');
				}catch(_e1){
					_hideAllocTooltip();
				}
			});
		}catch(_e2){}
	}
	function showAllocationNoData(card){
		try{
			if(!card) return;
			var donut = card.querySelector('.donut-multi');
			var legend = card.querySelector('.alloc-legend');
			var nodata = card.querySelector('.alloc-nodata');
			var animEl = nodata ? nodata.querySelector('.alloc-nodata-anim') : null;

			if(donut) donut.hidden = true;
			if(legend) legend.hidden = true;
			if(nodata) nodata.hidden = false;
			_hideAllocTooltip();

			if(!animEl) return;
			ensureLottie(function(){
				try{
					if(!window.lottie || !window.lottie.loadAnimation) return;
					if(_allocNoDataAnim && typeof _allocNoDataAnim.destroy === 'function') _allocNoDataAnim.destroy();
					animEl.innerHTML = '';
					_allocNoDataAnim = window.lottie.loadAnimation({
						container: animEl,
						renderer: 'svg',
						loop: true,
						autoplay: true,
						path: '/static/image/svg/free-animated-no-data.json',
						rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true }
					});
				}catch(_e2){
					// ignore
				}
			});
		}catch(_e3){
			// ignore
		}
	}
	function hideAllocationNoData(card){
		try{
			if(!card) return;
			var donut = card.querySelector('.donut-multi');
			var legend = card.querySelector('.alloc-legend');
			var nodata = card.querySelector('.alloc-nodata');
			if(donut) donut.hidden = false;
			if(legend) legend.hidden = false;
			if(nodata) nodata.hidden = true;
			_hideAllocTooltip();
			if(_allocNoDataAnim && typeof _allocNoDataAnim.destroy === 'function'){
				_allocNoDataAnim.destroy();
				_allocNoDataAnim = null;
			}
		}catch(_e0){
			// ignore
		}
	}

	

	
	/* 사이드바 프리로드는 blossom.js 에서 처리 */

	function parseCapacityToGB(str){
		if(!str) return NaN;
		var s = String(str).trim();
		s = s.replace(/,/g, '');
		var m = s.match(/^\s*([0-9]*\.?[0-9]+)\s*(TB|GB|tb|gb)?\s*$/);
		if(!m) return NaN;
		var val = parseFloat(m[1]);
		var unit = (m[2] || 'GB').toUpperCase();
		if(!isFinite(val)) return NaN;
		return unit === 'TB' ? (val * 1024) : val;
	}
	function _addThousandsComma(numText){
		var s = String(numText == null ? '' : numText).trim();
		if(!s) return '';
		s = s.replace(/,/g, '');
		var neg = false;
		if(s[0] === '-') { neg = true; s = s.slice(1); }
		var parts = s.split('.');
		var intPart = (parts[0] || '0').replace(/\D/g, '') || '0';
		var decPart = parts.length > 1 ? parts[1].replace(/\D/g, '') : '';
		intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
		return (neg ? '-' : '') + intPart + (decPart ? ('.' + decPart) : '');
	}
	function _formatDigitsOnlyWithCommas(text){
		var digits = String(text == null ? '' : text).replace(/[^0-9]/g, '');
		if(!digits) return '';
		digits = digits.replace(/^0+(?=\d)/, '');
		return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	}
	function _countDigitsLeftOfCursor(text, cursorIndex){
		try{
			return String(text || '').slice(0, Math.max(0, cursorIndex || 0)).replace(/[^0-9]/g, '').length;
		}catch(_e){ return 0; }
	}
	function _cursorIndexForDigitCount(formattedText, digitCount){
		if(digitCount <= 0) return 0;
		var cnt = 0;
		for(var i=0;i<String(formattedText || '').length;i++){
			var ch = formattedText[i];
			if(ch >= '0' && ch <= '9') cnt++;
			if(cnt >= digitCount) return i + 1;
		}
		return String(formattedText || '').length;
	}
	function _wireLiveNumericCommaInput(el){
		if(!el || el.__wiredNumericComma) return;
		el.__wiredNumericComma = true;
		el.addEventListener('input', function(){
			var old = String(el.value || '');
			var selStart = null;
			try{ selStart = el.selectionStart; }catch(_e0){ selStart = null; }
			var digitsLeft = (selStart == null) ? null : _countDigitsLeftOfCursor(old, selStart);
			var formatted = _formatDigitsOnlyWithCommas(old);
			if(formatted === old) return;
			el.value = formatted;
			if(digitsLeft != null){
				var newPos = _cursorIndexForDigitCount(formatted, digitsLeft);
				try{ el.setSelectionRange(newPos, newPos); }catch(_e1){ }
			}
		});
		// Normalize on blur as well.
		el.addEventListener('blur', function(){
			el.value = _formatDigitsOnlyWithCommas(el.value);
		});
	}
	function formatGBForInput(gb){
		if(!isFinite(gb)) return '';
		var n = Math.round(gb * 100) / 100;
		var s = (Math.abs(n - Math.round(n)) < 1e-9) ? String(Math.round(n)) : String(n);
		// Trim trailing zeros
		if(s.indexOf('.') > -1) s = s.replace(/0+$/,'').replace(/\.$/,'');
		return _addThousandsComma(s);
	}
	function formatGBForPayload(gb){
		if(!isFinite(gb)) return '';
		var n = Math.round(gb * 100) / 100;
		var s = (Math.abs(n - Math.round(n)) < 1e-9) ? String(Math.round(n)) : String(n);
		if(s.indexOf('.') > -1) s = s.replace(/0+$/,'').replace(/\.$/,'');
		return s;
	}
	function formatGBForDisplay(gb){
		var s = formatGBForInput(gb);
		return s ? (s + ' GB') : '';
	}
	function normalizeText(val){
		var s = (val == null ? '' : String(val)).trim();
		return (s === '-' ? '' : s);
	}

	/* 할당/미할당 비율(%) 배지 업데이트 */
	function updatePercentBadges(){
		var logEl = document.getElementById('bs-logical-total');
		var allocEl = document.getElementById('bs-allocated-total');
		var unallocEl = document.getElementById('bs-unallocated-total');
		var allocPct = document.getElementById('bs-allocated-pct');
		var unallocPct = document.getElementById('bs-unallocated-pct');
		if(!allocPct || !unallocPct) return;
		var lGB = parseCapacityToGB(normalizeText(logEl ? logEl.textContent : ''));
		var aGB = parseCapacityToGB(normalizeText(allocEl ? allocEl.textContent : ''));
		var uGB = parseCapacityToGB(normalizeText(unallocEl ? unallocEl.textContent : ''));
		if(isFinite(lGB) && lGB > 0 && isFinite(aGB)){
			var ap = (aGB / lGB * 100);
			allocPct.textContent = (ap % 1 === 0 ? ap.toFixed(0) : ap.toFixed(1)) + '%';
			allocPct.className = 'info-pct pct-alloc';
		}else{
			allocPct.textContent = '';
			allocPct.className = 'info-pct';
		}
		if(isFinite(lGB) && lGB > 0 && isFinite(uGB)){
			var up = (uGB / lGB * 100);
			unallocPct.textContent = (up % 1 === 0 ? up.toFixed(0) : up.toFixed(1)) + '%';
			unallocPct.className = 'info-pct pct-unalloc';
		}else{
			unallocPct.textContent = '';
			unallocPct.className = 'info-pct';
		}
	}

	function detectStorageContext(){
		/* 공통 템플릿의 data-* 속성에서 설정값 읽기 */
		var root = document.querySelector('.tab31-basic-root');
		if(root){
			var scopeKey  = (root.getAttribute('data-scope-key') || '').trim();
			var apiBase   = (root.getAttribute('data-api-base') || '').trim();
			var prefix    = (root.getAttribute('data-asset-prefix') || '').trim();
			var listPath  = (root.getAttribute('data-list-path') || '').trim();
			if(scopeKey && apiBase && prefix){
				/* selectedRowKeys 자동 생성 */
				var rowKeys = [prefix + ':selected:row'];
				if(prefix.indexOf('_') > -1){
					var alt = prefix.split('_').reverse().join('_');
					rowKeys.push(alt + ':selected:row');
				}
				rowKeys.push(scopeKey + ':selected:row');
				return {
					listPath: listPath || '/p/hw_storage_san',
					assetKeyPrefix: prefix,
					selectedRowKeys: rowKeys,
					apiBase: apiBase,
					scopeKey: scopeKey
				};
			}
		}
		/* 레거시 폴백: URL 기반 검출 (기존 개별 HTML 호환) */
		var path = String(window.location.pathname || '');
		if(path.indexOf('hw_storage_san') > -1) {
			return {
				listPath: '/p/hw_storage_san',
				assetKeyPrefix: 'storage_san',
				selectedRowKeys: ['storage_san:selected:row','san_storage:selected:row','san:selected:row'],
				apiBase: '/api/hardware/storage/assets',
				scopeKey: 'san'
			};
		}
		
		return {
			listPath: '/p/hw_storage_backup',
			assetKeyPrefix: 'storage_backup',
			selectedRowKeys: ['storage_backup:selected:row','ptl:selected:row'],
			apiBase: '/api/hardware/storage/backup/assets',
			scopeKey: 'ptl'
		};
	}
	function parseRowAssetId(raw){
		try{
			if(!raw) return null;
			var row = JSON.parse(raw);
			var id = row && (row.id != null ? row.id : row.asset_id);
			var n = parseInt(id, 10);
			return (!isNaN(n) && n > 0) ? n : null;
		}catch(_e){ return null; }
	}
	function getStoredAssetId(ctx){
		try{
			var v = sessionStorage.getItem(ctx.assetKeyPrefix + ':selected:asset_id') || localStorage.getItem(ctx.assetKeyPrefix + ':selected:asset_id');
			var n = parseInt(v, 10);
			return (!isNaN(n) && n > 0) ? n : null;
		}catch(_e){ return null; }
	}
	function saveStoredAssetId(ctx, n){
		try{ sessionStorage.setItem(ctx.assetKeyPrefix + ':selected:asset_id', String(n)); }catch(_e){}
		try{ localStorage.setItem(ctx.assetKeyPrefix + ':selected:asset_id', String(n)); }catch(_e2){}
	}
	function ensureDetailContextOrRedirect(ctx){
		
		try{
			var params = new URLSearchParams(window.location.search || '');
			var legacy = params.get('asset_id') || params.get('assetId') || params.get('id');
			var ln = parseInt(legacy, 10);
			if(!isNaN(ln) && ln > 0) saveStoredAssetId(ctx, ln);
		}catch(_e){ }

		var assetId = getStoredAssetId(ctx);
		if(!assetId){
			for(var i=0;i<ctx.selectedRowKeys.length;i++){
				try{
					var raw = sessionStorage.getItem(ctx.selectedRowKeys[i]) || localStorage.getItem(ctx.selectedRowKeys[i]);
					assetId = parseRowAssetId(raw);
					if(assetId) break;
				}catch(_e2){ }
			}
		}
		if(assetId){
			saveStoredAssetId(ctx, assetId);
			return;
		}
		try{ blsSpaNavigate(ctx.listPath); }catch(_e3){}
	}
	function applyHeaderFromSelection(ctx){
		try{
			var params = new URLSearchParams(window.location.search || '');
			var work = null;
			var system = null;
			try{ work = sessionStorage.getItem(ctx.assetKeyPrefix + ':selected:work_name'); }catch(_e){ work = null; }
			try{ system = sessionStorage.getItem(ctx.assetKeyPrefix + ':selected:system_name'); }catch(_e2){ system = null; }
			if(!work || !system){
				for(var i=0;i<ctx.selectedRowKeys.length;i++){
					try{
						var raw = sessionStorage.getItem(ctx.selectedRowKeys[i]) || localStorage.getItem(ctx.selectedRowKeys[i]);
						if(!raw) continue;
						var row = JSON.parse(raw);
						if(!work && row && row.work_name != null) work = String(row.work_name);
						if(!system && row && row.system_name != null) system = String(row.system_name);
					}catch(_e3){ }
				}
			}
			if(!work) work = params.get('work');
			if(!system) system = params.get('system');
			try{
				if(work != null) sessionStorage.setItem(ctx.assetKeyPrefix + ':selected:work_name', String(work));
				if(system != null) sessionStorage.setItem(ctx.assetKeyPrefix + ':selected:system_name', String(system));
			}catch(_e4){ }
			var title = document.getElementById('detail-title') || document.querySelector('.page-header h1');
			var sub = document.getElementById('detail-subtitle') || document.querySelector('.page-header p');
			if(title) title.textContent = String(work || '-');
			if(sub) sub.textContent = String(system || '-');
			
			try{
				var changed = false;
				['work','system','asset_id','assetId','id'].forEach(function(k){
					if(params.has(k)){ params.delete(k); changed = true; }
				});
				if(changed){
					var base = window.location.pathname;
					var qs = params.toString();
					window.history.replaceState(null, document.title, base + (qs ? ('?' + qs) : '') + (window.location.hash || ''));
				}
			}catch(_e5){ }
		}catch(_){ }
	}

	// Modal

	

	

	

	function openModal(id){
		var el = document.getElementById(id); if(!el) return;
		document.body.classList.add('modal-open');
		el.classList.add('show');
		el.setAttribute('aria-hidden','false');
	}
	function closeModal(id){
		var el = document.getElementById(id); if(!el) return;
		el.classList.remove('show');
		el.setAttribute('aria-hidden','true');
		if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open');
	}

	function wireBasicStorageModal(){
		var modalId = 'bs-edit-modal';
		var formId = 'bs-edit-form';
		var openBtn = document.getElementById('detail-edit-open');
		var closeBtn = document.getElementById('bs-edit-close');
		var saveBtn = document.getElementById('bs-edit-save');
		var ctx = detectStorageContext();

		if(!openBtn) return;

		function getCurrentAssetId(){
			var n = getStoredAssetId(ctx);
			if(n) return n;
			try{
				var params = new URLSearchParams(window.location.search || '');
				var legacy = params.get('asset_id') || params.get('assetId') || params.get('id');
				var ln = parseInt(legacy, 10);
				return (!isNaN(ln) && ln > 0) ? ln : null;
			}catch(_e){ return null; }
		}
		function apiUrl(){
			var assetId = getCurrentAssetId();
			if(!assetId) return null;
			return ctx.apiBase + '/' + assetId + '/basic';
		}

		function textOf(id){
			var el = document.getElementById(id);
			var s = el ? String(el.textContent || '').trim() : '';
			return normalizeText(s);
		}
		function setText(id, val){
			var el = document.getElementById(id);
			if(el) el.textContent = String(val || '');
		}

		function populateForm(){
			var form = document.getElementById(formId);
			if(!form) return;
			var mappings = [
				['bs-physical-total','bs-physical-total-input'],
				['bs-logical-total','bs-logical-total-input'],
				['bs-raid-level','bs-raid-level-input'],
				['bs-allocated-total','bs-allocated-total-input'],
				['bs-unallocated-total','bs-unallocated-total-input'],
				['bs-cache-memory','bs-cache-memory-input'],
				['bs-volume-count','bs-volume-count-input'],
				['bs-host-count','bs-host-count-input']
			];
			mappings.forEach(function(mp){
				var v = textOf(mp[0]);
				var input = document.getElementById(mp[1]);
				if(!input) return;
				if(input.tagName === 'SELECT'){
					var opts = Array.prototype.slice.call(input.options || []);
					var found = opts.find(function(o){ return (o.value || o.text) === v; });
					if(found) input.value = found.value;
				}else{
					input.value = v;
				}
			});

			// Capacity fields: show number-only (GB) in inputs.
			['bs-physical-total-input','bs-logical-total-input','bs-allocated-total-input','bs-unallocated-total-input','bs-cache-memory-input'].forEach(function(id){
				var el = document.getElementById(id);
				if(!el) return;
				var gb = parseCapacityToGB(String(el.value || '').trim());
				if(isFinite(gb)) el.value = formatGBForInput(gb);
			});

			var physEl = document.getElementById('bs-physical-total-input');
			var logiEl = document.getElementById('bs-logical-total-input');
			var allocEl = document.getElementById('bs-allocated-total-input');
			var unallocEl = document.getElementById('bs-unallocated-total-input');
			function recompute(){
				if(!physEl || !logiEl || !allocEl || !unallocEl) return;
				var p = parseCapacityToGB(physEl.value);
				var l = parseCapacityToGB(logiEl.value);
				var a = parseCapacityToGB(allocEl.value);
				if(isFinite(p) && isFinite(l) && l > p){
					logiEl.value = formatGBForInput(p);
					l = p;
				}
				if(isFinite(l) && isFinite(a)){
					var u = l - a;
					if(u < 0) u = 0;
					unallocEl.value = formatGBForInput(u);
				}else{
					unallocEl.value = '';
				}
			}
			['input','change'].forEach(function(ev){
				if(physEl) physEl.addEventListener(ev, recompute);
				if(logiEl) logiEl.addEventListener(ev, recompute);
				if(allocEl) allocEl.addEventListener(ev, recompute);
			});
			// Live comma-format while typing + numeric-only input.
			['bs-physical-total-input','bs-logical-total-input','bs-allocated-total-input','bs-cache-memory-input'].forEach(function(id){
				var el = document.getElementById(id);
				if(!el) return;
				_wireLiveNumericCommaInput(el);
			});
			recompute();
		}

		function applyFromForm(){
			var form = document.getElementById(formId);
			if(!form) return;
			function val(id){ var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
			var pGB = parseCapacityToGB(val('bs-physical-total-input'));
			var lGB = parseCapacityToGB(val('bs-logical-total-input'));
			if(isFinite(pGB) && isFinite(lGB) && lGB > pGB) lGB = pGB;
			var aGB = parseCapacityToGB(val('bs-allocated-total-input'));
			var uGB = (isFinite(lGB) && isFinite(aGB)) ? Math.max(0, lGB - aGB) : NaN;

			setText('bs-physical-total', isFinite(pGB) ? formatGBForDisplay(pGB) : val('bs-physical-total-input'));
			setText('bs-logical-total', isFinite(lGB) ? formatGBForDisplay(lGB) : val('bs-logical-total-input'));
			setText('bs-raid-level', val('bs-raid-level-input'));
			setText('bs-allocated-total', isFinite(aGB) ? formatGBForDisplay(aGB) : val('bs-allocated-total-input'));
			setText('bs-unallocated-total', isFinite(uGB) ? formatGBForDisplay(uGB) : val('bs-unallocated-total-input'));
			var cGB = parseCapacityToGB(val('bs-cache-memory-input'));
			setText('bs-cache-memory', isFinite(cGB) ? formatGBForDisplay(cGB) : val('bs-cache-memory-input'));
			setText('bs-volume-count', val('bs-volume-count-input'));
			setText('bs-host-count', val('bs-host-count-input'));
			updatePercentBadges();
		}

		openBtn.addEventListener('click', function(){
			try{ loadAssignSummaryFromApi(ctx); }catch(_e0){ }
			populateForm();
			openModal(modalId);
			/* RAID 레벨 검색 드롭다운 활성화 */
			try{
				var raidSel = document.getElementById('bs-raid-level-input');
				if(raidSel && window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
					window.BlossomSearchableSelect.enhance(raidSel);
				}
			}catch(_eRaid){}
			try{ applyDerivedFromAssignSummary(ctx); }catch(_e1){ }
		});
		if(closeBtn) closeBtn.addEventListener('click', function(){ closeModal(modalId); });
		var modalEl = document.getElementById(modalId);
		if(modalEl){
			modalEl.addEventListener('click', function(e){ if(e.target === modalEl) closeModal(modalId); });
			document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && modalEl.classList.contains('show')) closeModal(modalId); });
		}
		function buildPayloadFromForm(){
			function val(id){ var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
			var pGB = parseCapacityToGB(val('bs-physical-total-input'));
			var lGB = parseCapacityToGB(val('bs-logical-total-input'));
			if(isFinite(pGB) && isFinite(lGB) && lGB > pGB) lGB = pGB;
			var aGB = parseCapacityToGB(val('bs-allocated-total-input'));
			var uGB = (isFinite(lGB) && isFinite(aGB)) ? Math.max(0, lGB - aGB) : NaN;
			var cGB = parseCapacityToGB(val('bs-cache-memory-input'));

			function mustParseNumber(name, raw, parsed){
				if(!raw) return; // allow empty
				if(!isFinite(parsed)) throw new Error(name + '은(는) 숫자(GB)로 입력해주세요.');
			}
			mustParseNumber('전체 물리적 용량', val('bs-physical-total-input'), pGB);
			mustParseNumber('전체 논리적 용량', val('bs-logical-total-input'), lGB);
			mustParseNumber('할당 용량', val('bs-allocated-total-input'), aGB);
			if(val('bs-cache-memory-input')) mustParseNumber('캐시 메모리 용량', val('bs-cache-memory-input'), cGB);

			return {
				physical_total: isFinite(pGB) ? formatGBForPayload(pGB) : (val('bs-physical-total-input').replace(/,/g,'') || null),
				logical_total: isFinite(lGB) ? formatGBForPayload(lGB) : (val('bs-logical-total-input').replace(/,/g,'') || null),
				raid_level: val('bs-raid-level-input') || null,
				allocated_total: isFinite(aGB) ? formatGBForPayload(aGB) : (val('bs-allocated-total-input').replace(/,/g,'') || null),
				unallocated_total: isFinite(uGB) ? formatGBForPayload(uGB) : (val('bs-unallocated-total-input').replace(/,/g,'') || null),
				cache_memory: isFinite(cGB) ? formatGBForPayload(cGB) : (val('bs-cache-memory-input').replace(/,/g,'') || null),
				volume_count: (val('bs-volume-count-input') === '' ? null : parseInt(val('bs-volume-count-input'), 10)),
				host_count: (val('bs-host-count-input') === '' ? null : parseInt(val('bs-host-count-input'), 10))
			};
		}

		if(saveBtn){
			saveBtn.addEventListener('click', function(){
				var url = apiUrl();
				if(!url){
					toast('선택된 스토리지 자산을 찾을 수 없습니다.', 'error');
					return;
				}
				var payload;
				try{
					payload = buildPayloadFromForm();
				}catch(e){
					toast((e && e.message) ? e.message : '입력값을 확인해주세요.', 'error');
					return;
				}
				saveBtn.disabled = true;
				fetchJSON(url, { method: 'PUT', body: JSON.stringify(payload) })
					.then(function(res){
						if(!res || res.success === false) throw new Error((res && res.message) ? res.message : '저장 중 오류가 발생했습니다.');
						applyFromForm();
						closeModal(modalId);
						// No toast on success (toasts are globally disabled).
					})
					.catch(function(err){
						toast((err && err.message) ? err.message : '저장 중 오류가 발생했습니다.', 'error');
					})
					.finally(function(){
						saveBtn.disabled = false;
					});
			});
		}
	}

	function applyItemToCards(item){
		if(!item) return;
		function cap(val){
			var gb = parseCapacityToGB(normalizeText(val));
			return isFinite(gb) ? formatGBForDisplay(gb) : normalizeText(val);
		}
		function setText(id, val){
			var el = document.getElementById(id);
			if(!el) return;
			var s = (val == null || String(val).trim() === '') ? '-' : String(val);
			el.textContent = s;
		}
		setText('bs-physical-total', cap(item.physical_total));
		setText('bs-logical-total', cap(item.logical_total));
		setText('bs-raid-level', item.raid_level);
		setText('bs-allocated-total', cap(item.allocated_total));
		setText('bs-unallocated-total', cap(item.unallocated_total));
		setText('bs-cache-memory', cap(item.cache_memory));
		setText('bs-volume-count', item.volume_count);
		setText('bs-host-count', item.host_count);
		updatePercentBadges();
	}

	function loadBasicStorageData(ctx){
		try{
			var assetId = getStoredAssetId(ctx);
			if(!assetId) return;
			var url = ctx.apiBase + '/' + assetId + '/basic';
			fetchJSON(url, { method: 'GET' })
				.then(function(res){
					if(!res || res.success === false) return;
					applyItemToCards(res.item);
					try{ applyDerivedFromAssignSummary(ctx); }catch(_e0){ }
					try{ loadAllocationDonutFromAssignGroupsApi(ctx); }catch(_e1){ }
				})
				.catch(function(err){
					toast((err && err.message) ? err.message : '구성정보 조회 중 오류가 발생했습니다.', 'error');
				});
		}catch(_e){ }
	}

	function _assignSummaryKey(ctx){
		var assetId = getStoredAssetId(ctx);
		return String(ctx.assetKeyPrefix || '') + ':' + String(assetId || '');
	}
	var _assignSummaryCache = {};

	function _setTextOrDash(id, val){
		var el = document.getElementById(id);
		if(!el) return;
		var s = (val == null || String(val).trim() === '') ? '-' : String(val);
		el.textContent = s;
	}
	function _setInputValue(id, val){
		var el = document.getElementById(id);
		if(!el) return;
		try{ el.value = String(val == null ? '' : val); }catch(_e){ }
	}
	function _logicalGbFromCards(){
		try{
			var t = normalizeText((document.getElementById('bs-logical-total') || {}).textContent);
			var gb = parseCapacityToGB(t);
			return isFinite(gb) ? gb : NaN;
		}catch(_e){ return NaN; }
	}
	function _allocatedGbFromCards(){
		try{
			var t = normalizeText((document.getElementById('bs-allocated-total') || {}).textContent);
			var gb = parseCapacityToGB(t);
			return isFinite(gb) ? gb : NaN;
		}catch(_e){ return NaN; }
	}
	function applyDerivedFromAssignSummary(ctx){
		var key = _assignSummaryKey(ctx);
		var sum = _assignSummaryCache[key];
		if(!sum) return;

		if(isFinite(sum.allocated_gb) && sum.allocated_gb > 0){
			_setTextOrDash('bs-allocated-total', formatGBForDisplay(sum.allocated_gb));
			_setInputValue('bs-allocated-total-input', formatGBForInput(sum.allocated_gb));
		}else{
			_setTextOrDash('bs-allocated-total', '-');
			_setInputValue('bs-allocated-total-input', '');
		}
		if(sum.host_count != null){
			_setTextOrDash('bs-host-count', String(sum.host_count));
			_setInputValue('bs-host-count-input', String(sum.host_count));
		}
		if(sum.volume_count != null){
			_setTextOrDash('bs-volume-count', String(sum.volume_count));
			_setInputValue('bs-volume-count-input', String(sum.volume_count));
		}

		// Unallocated = logical - allocated (both GB)
		var l = _logicalGbFromCards();
		var a = isFinite(sum.allocated_gb) ? sum.allocated_gb : _allocatedGbFromCards();
		if(isFinite(l) && isFinite(a)){
			var u = l - a;
			if(u < 0) u = 0;
			_setTextOrDash('bs-unallocated-total', formatGBForDisplay(u));
			_setInputValue('bs-unallocated-total-input', formatGBForInput(u));
		}
		updatePercentBadges();
	}

	function loadAssignSummaryFromApi(ctx){
		try{
			var assetId = getStoredAssetId(ctx);
			if(!assetId) return;
			var scopeKey = String(ctx.scopeKey || '').trim();
			if(!scopeKey) return;

			var pageSize = 2000;
			var page = 1;
			var totalAlloc = 0;
			var totalHosts = 0;
			var totalVolumes = 0;
			var gotAny = false;

			function fetchPage(){
				var url = '/api/tab32-assign-groups'
					+ '?scope_key=' + encodeURIComponent(scopeKey)
					+ '&asset_id=' + encodeURIComponent(String(assetId))
					+ '&page=' + encodeURIComponent(String(page))
					+ '&page_size=' + encodeURIComponent(String(pageSize));
				return fetchJSON(url, { method:'GET' }).then(function(data){
					var items = (data && Array.isArray(data.items)) ? data.items : [];
					items.forEach(function(it){
						var gb = (it && it.volume_total_gb != null) ? parseFloat(it.volume_total_gb) : NaN;
						if(isFinite(gb)) { totalAlloc += gb; gotAny = true; }
						var hc = (it && it.host_count != null) ? parseInt(it.host_count, 10) : 0;
						if(!isNaN(hc)) totalHosts += hc;
						var vc = (it && it.volume_count != null) ? parseInt(it.volume_count, 10) : 0;
						if(!isNaN(vc)) totalVolumes += vc;
					});

					var total = (data && data.total != null) ? parseInt(data.total, 10) : null;
					var pageSz = (data && data.page_size != null) ? parseInt(data.page_size, 10) : pageSize;
					var fetched = items.length;
					var done = false;
					if(total != null && !isNaN(total)){
						done = (page * pageSz) >= total;
					}else{
						done = fetched < pageSz;
					}

					if(done) return;
					page += 1;
					return fetchPage();
				});
			}

			fetchPage().then(function(){
				var key = _assignSummaryKey(ctx);
				_assignSummaryCache[key] = {
					allocated_gb: gotAny ? (Math.round(totalAlloc * 100) / 100) : 0,
					host_count: totalHosts,
					volume_count: totalVolumes
				};
				applyDerivedFromAssignSummary(ctx);
			}).catch(function(_err){
				// silent: this is derived data; keep UI usable even if Tab32 API isn't available.
			});
		}catch(_e){ }
	}

	function loadAllocationDonutFromAssignGroupsApi(ctx){
		try{
			var card = document.getElementById('bs-allocation-card');
			if(!card) return;
			var donut = card.querySelector('.donut-multi');
			var totalEl = card.querySelector('.donut-total');
			var legend = card.querySelector('.alloc-legend');
			if(!donut || !totalEl || !legend) return;

			var assetId = getStoredAssetId(ctx);
			if(!assetId) return;
			var scopeKey = String(ctx.scopeKey || '').trim();
			if(!scopeKey) return;

			var pageSize = 2000;
			var page = 1;
			var totals = {};
			var totalAllocGB = 0;

			function gbFromItem(it){
				var gb = (it && it.volume_total_gb != null) ? parseFloat(it.volume_total_gb) : NaN;
				if(isFinite(gb)) return gb;
				var capRaw = (it && (it.volume_total_capacity != null ? it.volume_total_capacity : (it.assigned_capacity != null ? it.assigned_capacity : '')));
				gb = parseCapacityToGB(normalizeText(capRaw));
				return isFinite(gb) ? gb : NaN;
			}
			function fetchPage(){
				var url = '/api/tab32-assign-groups'
					+ '?scope_key=' + encodeURIComponent(scopeKey)
					+ '&asset_id=' + encodeURIComponent(String(assetId))
					+ '&page=' + encodeURIComponent(String(page))
					+ '&page_size=' + encodeURIComponent(String(pageSize));
				return fetchJSON(url, { method:'GET' }).then(function(data){
					var items = (data && Array.isArray(data.items)) ? data.items : [];
					items.forEach(function(it){
						var gb = gbFromItem(it);
						if(!isFinite(gb) || gb <= 0) return;
						var name = normalizeText(it && it.group_name);
						if(!name) name = '미지정';
						totals[name] = (totals[name] || 0) + gb;
						totalAllocGB += gb;
					});

					var total = (data && data.total != null) ? parseInt(data.total, 10) : null;
					var pageSz = (data && data.page_size != null) ? parseInt(data.page_size, 10) : pageSize;
					var fetched = items.length;
					var done = false;
					if(total != null && !isNaN(total)){
						done = (page * pageSz) >= total;
					}else{
						done = fetched < pageSz;
					}
					if(done) return;
					page += 1;
					return fetchPage();
				});
			}

			fetchPage().then(function(){
				if(!isFinite(totalAllocGB) || totalAllocGB <= 0){
					donut.style.background = 'conic-gradient(#e5e7eb 0 360deg)';
					totalEl.textContent = '-';
					donut.setAttribute('aria-label', '할당 비율: 데이터 없음');
					legend.innerHTML = '<li class="legend-item"><span class="legend-host">데이터 없음</span><span class="legend-size">-</span><span class="legend-pct">-</span></li>';
					showAllocationNoData(card);
					return;
				}
				hideAllocationNoData(card);

				var logicalGB = _logicalGbFromCards();
				var denomGB = (isFinite(logicalGB) && logicalGB > 0) ? logicalGB : totalAllocGB;
				if(!isFinite(denomGB) || denomGB <= 0) denomGB = totalAllocGB;

				var entries = Object.keys(totals).map(function(name){
					return { name: name, gb: totals[name] };
				}).sort(function(a,b){ return b.gb - a.gb; });

				var MAX_SEG = 5;
				if(entries.length > MAX_SEG){
					var head = entries.slice(0, MAX_SEG-1);
					var rest = entries.slice(MAX_SEG-1);
					var restGB = rest.reduce(function(acc, it){ return acc + it.gb; }, 0);
					head.push({ name: '기타', gb: restGB });
					entries = head;
				}

				// Percent is based on logical total (100%). Remainder becomes unallocated.
				var rawPcts = entries.map(function(it){ return (it.gb / denomGB) * 100; });
				var sumRaw = rawPcts.reduce(function(a,b){ return a+b; }, 0);
				var targetSum = Math.round(sumRaw);
				if(targetSum < 0) targetSum = 0;
				if(targetSum > 100) targetSum = 100;
				var floors = rawPcts.map(function(p){
					if(!isFinite(p) || p < 0) return 0;
					return Math.floor(p);
				});
				var rem = rawPcts.map(function(p, i){ return { i: i, r: (isFinite(p) ? (p - floors[i]) : 0) }; })
					.sort(function(a,b){ return b.r - a.r; });
				var sumFloors = floors.reduce(function(a,b){ return a+b; }, 0);
				var need = targetSum - sumFloors;
				for(var k=0;k<need;k++){
					var idx = rem[k % rem.length].i;
					floors[idx] += 1;
				}
				var sumPcts = floors.reduce(function(a,b){ return a+b; }, 0);
				var remainderPct = 100 - sumPcts;
				if(remainderPct < 0) remainderPct = 0;

				var allocatedPct = Math.round((totalAllocGB / denomGB) * 100);
				if(!isFinite(allocatedPct)) allocatedPct = 0;
				if(allocatedPct < 0) allocatedPct = 0;
				if(allocatedPct > 100) allocatedPct = 100;
				// Don't show % sign in the UI (hover tooltip will show it).
				totalEl.textContent = String(allocatedPct);

			var colors = [
				'var(--seg1, #6366f1)',
				'var(--seg2, #10b981)',
				'var(--seg3, #f59e0b)',
				'var(--seg4, #94a3b8)',
				'var(--seg5, #a855f7)'
			];
			var start = 0;
			var parts = [];
			entries.forEach(function(it, i){
				var pct = floors[i];
				var degStart = start * 3.6;
				var degEnd = (start + pct) * 3.6;
				parts.push(colors[i % colors.length] + ' ' + degStart + 'deg ' + degEnd + 'deg');
				start += pct;
			});
			if(start < 100){
				parts.push('#e5e7eb ' + (start*3.6) + 'deg 360deg');
			}
			donut.style.background = 'conic-gradient(' + parts.join(', ') + ')';
			// Build segment ranges for hover tooltip (including unallocated remainder).
			var segs = [];
			var pctStart = 0;
			entries.forEach(function(it, i){
				var pct = floors[i];
				if(pct <= 0) return;
				segs.push({ name: it.name, pct: pct, start: pctStart, end: pctStart + pct });
				pctStart += pct;
			});
			if(remainderPct > 0){
				segs.push({ name: '미할당', pct: remainderPct, start: pctStart, end: 100 });
			}
			donut.__allocSegments = segs;
			_wireAllocTooltip(donut);

			legend.innerHTML = '';
			entries.forEach(function(it, i){
				var li = document.createElement('li');
				li.className = 'legend-item';
				li.innerHTML = [
					'<span class="legend-dot seg' + (i+1) + '"></span>',
					'<span class="legend-host"></span>',
					'<span class="legend-size"></span>',
					'<span class="legend-pct"></span>'
				].join('');
				li.querySelector('.legend-host').textContent = it.name;
				li.querySelector('.legend-size').textContent = formatGBForDisplay(it.gb);
				li.querySelector('.legend-pct').textContent = floors[i] + '%';
				legend.appendChild(li);
			});
			if(remainderPct > 0){
				var unallocGB = (isFinite(logicalGB) && logicalGB > 0) ? (logicalGB - totalAllocGB) : NaN;
				if(isFinite(unallocGB) && unallocGB < 0) unallocGB = 0;
				var liU = document.createElement('li');
				liU.className = 'legend-item';
				liU.innerHTML = [
					'<span class="legend-dot" style="background:#e5e7eb"></span>',
					'<span class="legend-host">미할당</span>',
					'<span class="legend-size"></span>',
					'<span class="legend-pct"></span>'
				].join('');
				liU.querySelector('.legend-size').textContent = isFinite(unallocGB) ? formatGBForDisplay(unallocGB) : '-';
				liU.querySelector('.legend-pct').textContent = remainderPct + '%';
				legend.appendChild(liU);
			}

			var ariaParts = entries.map(function(it, i){ return it.name + ' ' + floors[i] + '%'; });
			if(remainderPct > 0) ariaParts.push('미할당 ' + remainderPct + '%');
			donut.setAttribute('aria-label', '할당 비율(논리 용량=100%): ' + ariaParts.join(', '));
			}).catch(function(_err){
				// Keep existing UI; derived donut is optional.
			});
		}catch(_){ }
	}

	document.addEventListener('DOMContentLoaded', function(){
		var ctx = detectStorageContext();
		ensureDetailContextOrRedirect(ctx);
		applyHeaderFromSelection(ctx);
		loadBasicStorageData(ctx);
		loadAssignSummaryFromApi(ctx);
		// Allocation donut is loaded after basic data so logical_total is available.
		
		if(document.getElementById('bs-physical-total')){
			wireBasicStorageModal();
		}
	});
})();

