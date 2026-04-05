/*
 * tab10-storage.js  v2.10
 * Storage tab — 단일 테이블 + 내장/외장 토글 전환.
 * 외장 모드: tab32 할당정보에서 직접 조회 (external-sources API).
 * 내장 모드: 디스크 유형(드롭다운)/디스크 용량/디스크 수량/RAID/할당 용량/디스크명/볼륨그룹.
 * 확장 버튼: 논리용량·마운트포인트·볼륨유형·비고를 확장 서브행에 표시.
 */

(function(){

	/* ──────────────────────────────────────────────
	   공통 유틸리티
	   ────────────────────────────────────────────── */
	function stApiFetch(url, opts2){
		return fetch(url, Object.assign({ headers:{'Accept':'application/json'} }, opts2||{}))
			.then(function(r){
				return r.json().then(function(j){ return { status:r.status, ok:r.ok, json:j }; });
			});
	}
	function stAlert(msg){ try{ window.alert(msg); }catch(_){} }
	function stEscapeCSV(val){ return '"' + String(val).replace(/"/g,'""') + '"'; }

	/* 숫자 3자리 콤마 포맷 + GB 접미사 (용량 필드 전용) */
	function fmtCapacity(val){
		if(val==null) return '-';
		var s = String(val).trim();
		if(!s || s==='-') return '-';
		/* 기존 단위(GB, TB 등) 분리 */
		var m = s.match(/^([\d,]+(?:\.\d+)?)\s*(.*)$/);
		if(!m) return s;
		var num = m[1].replace(/,/g,'');
		var n = parseFloat(num);
		if(isNaN(n)) return s;
		var formatted = n.toLocaleString('en-US', {maximumFractionDigits:2});
		return formatted + ' GB';
	}

	/* 숫자 3자리 콤마 포맷 (일반용) */
	function fmtNumber(val){
		if(val==null) return '-';
		var s = String(val).trim();
		if(!s || s==='-') return '-';
		var m = s.match(/^([\d,]+(?:\.\d+)?)\s*(.*)$/);
		if(!m) return s;
		var num = m[1].replace(/,/g,'');
		var unit = m[2] || '';
		var n = parseFloat(num);
		if(isNaN(n)) return s;
		var formatted = n.toLocaleString('en-US', {maximumFractionDigits:2});
		return unit ? (formatted + ' ' + unit) : formatted;
	}

	/* 용량 편집 시 숫자만 허용하는 이벤트 핸들러 */
	function enforceNumeric(inp){
		inp.addEventListener('input', function(){
			this.value = this.value.replace(/[^0-9.]/g, '');
		});
	}

	/* 용량 입력 시 3자리 콤마 자동 포맷 */
	function enforceCommaFormat(inp){
		inp.addEventListener('input', function(){
			var pos = this.selectionStart;
			var oldLen = this.value.length;
			var raw = this.value.replace(/[^0-9.]/g, '');
			var parts = raw.split('.');
			var intPart = parts[0].replace(/^0+(?=\d)/, '');
			var formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
			if(parts.length > 1) formatted += '.' + parts[1];
			this.value = formatted;
			var diff = this.value.length - oldLen;
			this.setSelectionRange(pos + diff, pos + diff);
		});
	}

	/* 수정 시 search-select 향상 헬퍼 */
	function enhanceSearchSelect(scope){
		try{
			if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
				window.BlossomSearchableSelect.enhance(scope || document);
			}
		}catch(_){}
	}

	/* RAID 드롭다운 옵션 */
	var RAID_OPTIONS = ['RAID 0','RAID 1','RAID 5','RAID 6','RAID 10','RAID 50','RAID 60','JBOD','None'];
	function buildRaidSelectHtml(currentValue){
		var cur = String(currentValue==null?'':currentValue).trim();
		var opts = '<option value=""' + (cur?'':' selected') + '>선택</option>';
		var seen = {};
		RAID_OPTIONS.forEach(function(v){
			seen[v] = true;
			opts += '<option value="'+v+'"'+(cur===v?' selected':'')+'>'+v+'</option>';
		});
		if(cur && !seen[cur]){
			opts += '<option value="'+cur+'" selected>'+cur+'</option>';
		}
		return '<select class="search-select" data-searchable-scope="page" data-placeholder="RAID" data-allow-clear="true">'+opts+'</select>';
	}

	/* 디스크 유형 드롭다운 옵션 */
	var DISK_TYPE_OPTIONS = ['SAS HDD','SATA HDD','SAS SSD','SATA SSD','NVMe SSD'];
	function buildDiskTypeSelectHtml(currentValue){
		var cur = String(currentValue==null?'':currentValue).trim();
		var opts = '<option value=""' + (cur?'':' selected') + '>선택</option>';
		var seen = {};
		DISK_TYPE_OPTIONS.forEach(function(v){
			seen[v] = true;
			opts += '<option value="'+v+'"'+(cur===v?' selected':'')+'>'+v+'</option>';
		});
		if(cur && !seen[cur]){
			opts += '<option value="'+cur+'" selected>'+cur+'</option>';
		}
		return '<select class="search-select" data-searchable-scope="page" data-placeholder="디스크 유형" data-allow-clear="true">'+opts+'</select>';
	}

	/* 암호화 드롭다운 옵션 */
	var ENCRYPTED_OPTIONS = ['O','X'];
	function buildEncryptedSelectHtml(currentValue){
		var cur = String(currentValue==null?'':currentValue).trim();
		var opts = '<option value=""' + (cur?'':' selected') + '>선택</option>';
		var seen = {};
		ENCRYPTED_OPTIONS.forEach(function(v){
			seen[v] = true;
			opts += '<option value="'+v+'"'+(cur===v?' selected':'')+'>'+v+'</option>';
		});
		if(cur && !seen[cur]){
			opts += '<option value="'+cur+'" selected>'+cur+'</option>';
		}
		return '<select class="search-select" data-searchable-scope="page" data-placeholder="암호화" data-allow-clear="true">'+opts+'</select>';
	}

	/* ──────────────────────────────────────────────
	   재사용 페이지네이션 생성기
	   ────────────────────────────────────────────── */
	function createPaginator(cfg){
		var tbl       = cfg.table;
		var checkCls  = cfg.checkClass || 'st-row-check';
		var emptyEl   = cfg.empty      ? document.getElementById(cfg.empty) : null;
		var infoEl    = cfg.info       ? document.getElementById(cfg.info) : null;
		var numWrap   = cfg.numbers    ? document.getElementById(cfg.numbers) : null;
		var btnFirst  = cfg.first      ? document.getElementById(cfg.first) : null;
		var btnPrev   = cfg.prev       ? document.getElementById(cfg.prev) : null;
		var btnNext   = cfg.next       ? document.getElementById(cfg.next) : null;
		var btnLast   = cfg.last       ? document.getElementById(cfg.last) : null;
		var sizeSel   = cfg.sizeSelect ? document.getElementById(cfg.sizeSelect) : null;
		var sizeKey   = cfg.sizeKey    || '';
		var state     = { page:1, pageSize:10 };

		if(sizeSel){
			try{
				var saved = localStorage.getItem(sizeKey);
				if(saved && ['10','20','50','100'].indexOf(saved)>-1){
					state.pageSize = parseInt(saved,10);
					sizeSel.value = saved;
				}
			}catch(_){}
			sizeSel.addEventListener('change', function(){
				var v = parseInt(sizeSel.value,10);
				if(!isNaN(v)){ state.page=1; state.pageSize=v; try{ localStorage.setItem(sizeKey,String(v)); }catch(_){} render(); }
			});
		}

		function rows(){ var tb=tbl.querySelector('tbody'); return tb? Array.from(tb.querySelectorAll('tr:not(.st-expand-row)')):[]; }
		function total(){ return rows().length; }
		function pages(){ return Math.max(1, Math.ceil(total()/state.pageSize)); }
		function clamp(){ if(state.page>pages()) state.page=pages(); if(state.page<1) state.page=1; }

		function render(){
			clamp();
			var rs = rows(), s=(state.page-1)*state.pageSize, e=s+state.pageSize-1;
			rs.forEach(function(tr,i){
				var vis = i>=s && i<=e;
				tr.style.display = vis?'':'none';
				if(vis) tr.removeAttribute('data-hidden'); else tr.setAttribute('data-hidden','1');
			});
			/* 확장 행 동기화 */
			tbl.querySelectorAll('tbody tr.st-expand-row').forEach(function(er){
				var prev=er.previousElementSibling;
				if(!prev||prev.style.display==='none'||prev.hasAttribute('data-hidden')) er.style.display='none';
			});
			if(infoEl){
				var t=total(), st=t?(s+1):0, en=Math.min(t,e+1);
				infoEl.textContent = st+'-'+en+' / '+t+'개 항목';
			}
			if(numWrap){
				numWrap.innerHTML='';
				var pp=pages();
				for(var p=1;p<=pp && p<=50;p++){
					var b=document.createElement('button');
					b.className='page-btn'+(p===state.page?' active':'');
					b.textContent=String(p); b.dataset.page=String(p);
					numWrap.appendChild(b);
				}
			}
			var pp2=pages();
			if(btnFirst) btnFirst.disabled=(state.page===1);
			if(btnPrev)  btnPrev.disabled=(state.page===1);
			if(btnNext)  btnNext.disabled=(state.page>=pp2);
			if(btnLast)  btnLast.disabled=(state.page>=pp2);
			if(sizeSel){ sizeSel.disabled=(total()===0); }
			syncSelectAll();
			updateEmpty();
		}

		function syncSelectAll(){
			var sa = document.getElementById('st-select-all');
			if(!sa) return;
			var vc=tbl.querySelectorAll('tbody tr:not([data-hidden]) .'+checkCls);
			sa.checked = vc.length>0 && Array.prototype.every.call(vc, function(c){ return c.checked; });
		}

		function updateEmpty(){
			var has = !!tbl.querySelector('tbody tr:not(.st-expand-row)');
			if(emptyEl){ emptyEl.hidden=has; emptyEl.style.display=has?'none':''; }
		}

		function go(p){ state.page=p; render(); }
		if(numWrap) numWrap.addEventListener('click', function(e){ var b=e.target.closest('button.page-btn'); if(b){ go(parseInt(b.dataset.page,10)); } });
		if(btnFirst) btnFirst.addEventListener('click', function(){ go(1); });
		if(btnPrev)  btnPrev.addEventListener('click', function(){ go(state.page-1); });
		if(btnNext)  btnNext.addEventListener('click', function(){ go(state.page+1); });
		if(btnLast)  btnLast.addEventListener('click', function(){ go(pages()); });

		// row click → toggle checkbox
		tbl.addEventListener('click', function(ev){
			var tr=ev.target.closest('tr');
			if(!tr||!tr.parentNode||tr.parentNode.tagName.toLowerCase()!=='tbody') return;
			if(tr.classList.contains('st-expand-row')) return;
			if(ev.target.closest('button,a,input,select,textarea,label')) return;
			var cb=tr.querySelector('.'+checkCls); if(!cb) return;
			if(tr.hasAttribute('data-hidden')||tr.style.display==='none') return;
			cb.checked=!cb.checked;
			tr.classList.toggle('selected',cb.checked);
			syncSelectAll();
		});
		tbl.addEventListener('change', function(ev){
			var cb=ev.target.closest('.'+checkCls); if(!cb) return;
			var tr=cb.closest('tr');
			if(tr) tr.classList.toggle('selected',!!cb.checked&&!(tr.hasAttribute('data-hidden')||tr.style.display==='none'));
			syncSelectAll();
		});

		return { render:render, updateEmpty:updateEmpty, go:go, state:state, syncSelectAll:syncSelectAll };
	}


	/* ══════════════════════════════════════════════
	   메인 초기화
	   ══════════════════════════════════════════════ */
	function __blsInitTab10Storage(options){
		var opts = options || {};
		var table = document.getElementById(opts.tableId || 'st-spec-table');
		if(!table) return;
		if(table.__blsTab10StorageInit) return;
		table.__blsTab10StorageInit = true;

		/* ── 현재 모드: '로컬' | '외장' ── */
		var currentMode = '로컬';

		/* ── DOM refs ── */
		var colgroupEl  = document.getElementById('st-colgroup');
		var theadEl     = document.getElementById('st-thead');
		var addBtn      = document.getElementById('st-row-add');
		var csvBtn      = document.getElementById('st-download-btn');
		var chartBtn    = document.getElementById('st-ext-chart');
		var emptyTitle  = document.getElementById('st-empty-title');
		var emptyDesc   = document.getElementById('st-empty-desc');
		var toggleBtns  = document.querySelectorAll('.st-toggle-btn');

		/* ── hardware ID 확인 ── */
		function getSelectedHardwareId(){
			var key = opts.sessionSelectedRowKey;
			if(key){
				try{
					var raw = sessionStorage.getItem(key);
					if(raw){
						var row = JSON.parse(raw);
						var n = parseInt(row && row.id, 10);
						if(!isNaN(n) && n > 0) return n;
					}
				}catch(_){}
			}
			try{
				var params = new URLSearchParams(window.location.search || '');
				var id = parseInt(params.get(opts.queryParamId||'id')||'', 10);
				if(!isNaN(id) && id > 0) return id;
			}catch(_){}
			return null;
		}
		var hardwareId = (opts.hardwareId != null) ? opts.hardwareId : getSelectedHardwareId();

		function apiBase(){
			if(opts.disableApi) return null;
			if(typeof opts.apiBase === 'function'){ try{ return opts.apiBase(hardwareId); }catch(_){ return null; } }
			if(typeof opts.apiBase === 'string') return opts.apiBase;
			return hardwareId ? ('/api/hardware/assets/' + hardwareId + '/storages') : null;
		}

		function stSetBusy(isBusy){
			if(addBtn) addBtn.disabled = !!isBusy;
			if(chartBtn) chartBtn.disabled = !!isBusy;
		}

		/* ── 페이지네이터 (단일 테이블) ── */
		var pageSizeKey = opts.pageSizeKey || 'detail:st:pageSize';
		var pager = createPaginator({
			table:table, checkClass:'st-row-check',
			empty:'st-empty', info:'st-pagination-info', numbers:'st-page-numbers',
			first:'st-first', prev:'st-prev', next:'st-next', last:'st-last',
			sizeSelect:'st-page-size', sizeKey:pageSizeKey
		});

		/* ══════════════════════════════════════
		   테이블 헤더 / colgroup 전환
		   ══════════════════════════════════════ */
		/* 내장: 8 data cols + checkbox + actions = 10 */
		var LOCAL_COLGROUP =
			'<col class="check-col"><col class="equal-col"><col class="equal-col"><col class="equal-col"><col class="equal-col">' +
			'<col class="equal-col"><col class="equal-col"><col class="equal-col"><col class="equal-col"><col class="actions-col">';
		/* 외장: 5 data cols + checkbox + actions = 7 */
		var EXT_COLGROUP =
			'<col class="check-col"><col class="equal-col"><col class="equal-col"><col class="equal-col"><col class="equal-col">' +
			'<col class="equal-col"><col class="actions-col">';
		var LOCAL_THEAD =
			'<tr><th><input type="checkbox" id="st-select-all" aria-label="전체 선택"></th>' +
			'<th>디스크 유형</th><th>디스크 용량</th><th>디스크 수량</th><th>RAID</th>' +
			'<th>할당 용량</th><th>디스크명<span class="req-star" aria-hidden="true">*</span></th>' +
			'<th>볼륨그룹</th><th>암호화</th><th>관리</th></tr>';
		var EXT_THEAD =
			'<tr><th><input type="checkbox" id="st-select-all" aria-label="전체 선택"></th>' +
			'<th>스토리지명</th><th>UUID</th>' +
			'<th>할당용량</th><th>디스크명</th>' +
			'<th>볼륨그룹</th><th>관리</th></tr>';

		function applyTableStructure(mode){
			if(colgroupEl) colgroupEl.innerHTML = (mode==='외장') ? EXT_COLGROUP : LOCAL_COLGROUP;
			if(theadEl)    theadEl.innerHTML    = (mode==='외장') ? EXT_THEAD : LOCAL_THEAD;
			/* cols class 전환 */
			table.classList.remove('cols-5','cols-7','cols-8');
			table.classList.add(mode==='외장' ? 'cols-5' : 'cols-8');
			/* select-all 재바인딩 */
			var sa = document.getElementById('st-select-all');
			if(sa){
				sa.addEventListener('change', function(){
					table.querySelectorAll('.st-row-check:not([disabled])').forEach(function(c){
						var tr=c.closest('tr');
						var hid=tr&&(tr.hasAttribute('data-hidden')||tr.style.display==='none');
						if(!hid) c.checked=!!sa.checked;
						if(tr) tr.classList.toggle('selected',!!c.checked&&!hid);
					});
				});
			}
		}

		function updateUIForMode(mode){
			toggleBtns.forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-mode')===mode); });
			if(addBtn)    addBtn.style.display    = (mode==='로컬') ? '' : 'none';
			if(chartBtn)  chartBtn.style.display  = (mode==='외장') ? '' : 'none';
			/* CSV 다운로드는 두 모드 모두 표시 */
			if(emptyTitle) emptyTitle.textContent = (mode==='외장') ? '외장 스토리지 내역이 없습니다.' : '내장 스토리지 내역이 없습니다.';
			if(emptyDesc)  emptyDesc.textContent  = (mode==='외장')
				? "'불러오기' 버튼을 눌러 할당된 스토리지를 가져오세요."
				: "우측 상단 '+' 버튼을 눌러 내장 스토리지를 등록하세요.";
		}

		function switchMode(mode){
			if(mode===currentMode) return;
			currentMode = mode;
			applyTableStructure(mode);
			var tbody = table.querySelector('tbody');
			if(tbody) tbody.innerHTML = '';
			updateUIForMode(mode);
			pager.state.page = 1;
			loadData();
		}

		toggleBtns.forEach(function(btn){
			btn.addEventListener('click', function(){
				switchMode(btn.getAttribute('data-mode'));
			});
		});

		/* ══════════════════════════════════════
		   행 생성
		   ══════════════════════════════════════ */
		function mkTd(col, text){
			var el = document.createElement('td'); el.setAttribute('data-col', col);
			if(col==='encrypted'){
				var v=(text==null)?'':String(text).trim();
				if(v==='O'||v==='X') el.innerHTML='<span class="st-enc-badge st-enc-'+(v==='O'?'on':'off')+'">'+v+'</span>';
				else el.textContent='-';
				return el;
			}
			el.textContent = (text==null||String(text).trim()==='')?'-':String(text); return el;
		}

		/* 확장 서브행 생성 (볼륨 그룹 목록: 논리용량·마운트포인트·볼륨유형·비고) */
		function makeExpandRow(item, colSpan){
			var expTr = document.createElement('tr');
			expTr.className = 'st-expand-row';
			expTr.style.display = 'none';
			var td = document.createElement('td');
			td.setAttribute('colspan', String(colSpan));
			td.className = 'st-expand-cell';

			var vols = (item && item.volumes && item.volumes.length) ? item.volumes : [];
			/* 레거시 폴백: volumes 없으면 단일 필드에서 구성 */
			if(!vols.length && item){
				var hasLegacy = (item.l_capacity && String(item.l_capacity).trim()) || (item.mount && String(item.mount).trim()) || (item.vol_type && String(item.vol_type).trim()) || (item.remark && String(item.remark).trim());
				if(hasLegacy) vols = [{l_capacity:item.l_capacity||'', mount:item.mount||'', vol_type:item.vol_type||'', remark:item.remark||''}];
			}

			var wrap = document.createElement('div');
			wrap.className = 'st-expand-wrap';

			vols.forEach(function(vol){
				wrap.appendChild(makeVolGroup(vol));
			});

			td.appendChild(wrap);
			expTr.appendChild(td);
			return expTr;
		}

		/* 단일 볼륨 그룹 (논리장치명·논리용량·마운트·볼륨유형·비고) 생성 */
		function makeVolGroup(vol){
			vol = vol || {};
			var ln = (vol.lv_name!=null&&String(vol.lv_name).trim()!=='')?String(vol.lv_name):'-';
			var lc = (vol.l_capacity!=null&&String(vol.l_capacity).trim()!=='')?fmtCapacity(vol.l_capacity):'-';
			var mt = (vol.mount!=null&&String(vol.mount).trim()!=='')?String(vol.mount):'-';
			var vt = (vol.vol_type!=null&&String(vol.vol_type).trim()!=='')?String(vol.vol_type):'-';
			var rm = (vol.remark!=null&&String(vol.remark).trim()!=='')?String(vol.remark):'-';
			var grp = document.createElement('div');
			grp.className = 'st-expand-detail st-vol-group';
			grp.innerHTML =
				'<div class="st-expand-field"><span class="st-expand-label">논리장치명</span><span class="st-expand-value" data-col="lv_name">'+ln+'</span></div>'+
				'<div class="st-expand-field"><span class="st-expand-label">논리용량</span><span class="st-expand-value" data-col="l_capacity">'+lc+'</span></div>'+
				'<div class="st-expand-field"><span class="st-expand-label">마운트</span><span class="st-expand-value" data-col="mount">'+mt+'</span></div>'+
				'<div class="st-expand-field"><span class="st-expand-label">볼륨유형</span><span class="st-expand-value" data-col="vol_type">'+vt+'</span></div>'+
				'<div class="st-expand-field"><span class="st-expand-label">비고</span><span class="st-expand-value" data-col="remark">'+rm+'</span></div>'+
				'<div class="st-vol-btn-cell"></div>';
			return grp;
		}

		/* 볼륨 그룹을 편집 모드로 전환 */
		function makeVolGroupEditable(grp){
			['lv_name','l_capacity','mount','vol_type','remark'].forEach(function(n){
				var el = grp.querySelector('[data-col="'+n+'"]'); if(!el) return;
				var cur = (el.textContent||'').trim(); if(cur==='-') cur='';
				var isCap = (n==='l_capacity');
				if(isCap) cur = cur.replace(/,/g,'').replace(/\s*[A-Za-z]+$/,'');
				var ph = isCap?'숫자만 입력':({'lv_name':'논리장치명','mount':'마운트','vol_type':'xfs','remark':'비고'}[n]||n);
				el.innerHTML = '<input type="text"'+(isCap?' inputmode="decimal"':'')+' value="'+cur+'" placeholder="'+ph+'">';
				if(isCap) enforceCommaFormat(el.querySelector('input'));
			});
		}

		/* 새 편집 볼륨 그룹 생성 (추가 버튼용) */
		function makeNewVolGroupEditable(){
			var grp = makeVolGroup({});
			makeVolGroupEditable(grp);
			return grp;
		}

		/* + 버튼 생성 */
		function makeAddVolBtn(){
			var btn = document.createElement('button');
			btn.className = 'action-btn st-vol-add-btn';
			btn.type = 'button';
			btn.title = '볼륨 추가';
			btn.setAttribute('aria-label', '볼륨 추가');
			btn.innerHTML = '<img src="/static/image/svg/add/free-icon-add-button.svg" alt="추가" class="action-icon">';
			return btn;
		}

		/* − 삭제 버튼 생성 */
		function makeDelVolBtn(){
			var btn = document.createElement('button');
			btn.className = 'action-btn danger st-vol-del-btn';
			btn.type = 'button';
			btn.title = '볼륨 삭제';
			btn.setAttribute('aria-label', '볼륨 삭제');
			btn.innerHTML = '<img src="/static/image/svg/add/free-icon-delete.svg" alt="삭제" class="action-icon">';
			return btn;
		}

		/* 확장 영역에 + 버튼 / − 버튼 추가 (편집 모드) */
		function setupEditableExpandArea(expTr){
			var cell = expTr.querySelector('.st-expand-cell');
			if(!cell) return;
			var wrap = cell.querySelector('.st-expand-wrap');
			if(!wrap){ wrap = document.createElement('div'); wrap.className = 'st-expand-wrap'; cell.appendChild(wrap); }

			/* 기존 볼륨 그룹 편집 모드 전환 */
			var grps = wrap.querySelectorAll('.st-vol-group');
			grps.forEach(function(g){
				makeVolGroupEditable(g);
			});
			/* 볼륨 그룹이 없으면 빈 편집 그룹 1개 추가 */
			if(!grps.length){
				var newG = makeNewVolGroupEditable();
				wrap.appendChild(newG);
			}
			/* 각 그룹 버튼 셀에 +/− 버튼 배치 */
			refreshVolBtns(wrap);
		}

		/* 볼륨 그룹 버튼 갱신: 마지막 그룹 비고 오른쪽에 + 버튼, 2개 이상이면 − 버튼 */
		function refreshVolBtns(wrap){
			var grps = wrap.querySelectorAll('.st-vol-group');
			grps.forEach(function(g){
				var bc = g.querySelector('.st-vol-btn-cell');
				if(bc) bc.innerHTML = '';
			});
			if(!grps.length) return;
			/* 마지막 그룹 비고 오른쪽에 + 버튼 */
			var lastGrp = grps[grps.length-1];
			var lastBc = lastGrp.querySelector('.st-vol-btn-cell');
			if(lastBc){
				lastBc.appendChild(makeAddVolBtn());
			}
			/* 2개 이상이면 각 그룹에 − 버튼 */
			if(grps.length > 1){
				grps.forEach(function(g){
					var bc2 = g.querySelector('.st-vol-btn-cell');
					if(bc2) bc2.appendChild(makeDelVolBtn());
				});
			}
		}

		/* 확장 영역에서 볼륨 데이터 수집 (저장 시) */
		function collectVolumes(expTr){
			if(!expTr) return [];
			var grps = expTr.querySelectorAll('.st-vol-group');
			var vols = [];
			grps.forEach(function(g){
				var obj = {};
				['lv_name','l_capacity','mount','vol_type','remark'].forEach(function(n){
					var el = g.querySelector('[data-col="'+n+'"]');
					if(!el) { obj[n]=''; return; }
					var inp = el.querySelector('input,textarea');
					if(inp) obj[n] = String(inp.value).trim();
					else { var t=(el.textContent||'').trim(); obj[n]=(t==='-')?'':t; }
				});
				/* 콤마 제거 (용량) */
				if(obj.l_capacity) obj.l_capacity = obj.l_capacity.replace(/,/g,'');
				/* 빈 행은 제외 */
				if(obj.lv_name || obj.l_capacity || obj.mount || obj.vol_type || obj.remark) vols.push(obj);
			});
			return vols;
		}

		/* 확장 영역 읽기 모드로 복원 (저장 후) */
		function applyVolumesDisplay(expTr, volumes){
			if(!expTr) return;
			var cell = expTr.querySelector('.st-expand-cell');
			if(!cell) return;
			var wrap = cell.querySelector('.st-expand-wrap');
			if(!wrap){ wrap = document.createElement('div'); wrap.className = 'st-expand-wrap'; cell.appendChild(wrap); }
			wrap.innerHTML = '';
			(volumes||[]).forEach(function(vol){
				wrap.appendChild(makeVolGroup(vol));
			});
		}

		function makeLocalRow(item){
			var tr = document.createElement('tr');
			if(item && item.id != null) tr.setAttribute('data-id', String(item.id));
			var tdC = document.createElement('td');
			tdC.innerHTML = '<input type="checkbox" class="st-row-check" aria-label="행 선택">';
			tr.appendChild(tdC);
			tr.appendChild(mkTd('phys_disk', item.phys_disk));
			tr.appendChild(mkTd('disk_capacity', fmtCapacity(item.disk_capacity)));
			tr.appendChild(mkTd('phys_qty', item.phys_qty));
			tr.appendChild(mkTd('raid', item.raid));
			tr.appendChild(mkTd('p_capacity', fmtCapacity(item.p_capacity)));
			tr.appendChild(mkTd('disk', item.disk));
			tr.appendChild(mkTd('vol_group', item.vol_group));
			tr.appendChild(mkTd('encrypted', item.encrypted));
			var act = document.createElement('td');
			act.className = 'system-actions table-actions';
			act.innerHTML = '<button class="action-btn js-st-expand" type="button" title="확장" aria-label="확장"><img src="/static/image/svg/free-icon-font-apps-add.svg" alt="확장" class="action-icon"></button> <button class="action-btn js-st-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button> <button class="action-btn danger js-st-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>';
			tr.appendChild(act);
			/* 확장 서브행 연결 */
			var exp = makeExpandRow(item, 10);
			tr._expandRow = exp;
			exp._mainRow = tr;
			return tr;
		}

		/* makeExtRow — 외장 행 (tab32 데이터 + 부분 편집 가능) */
		function makeExtRow(item){
			var tr = document.createElement('tr');
			tr.setAttribute('data-ext', '1');
			if(item.saved_id) tr.setAttribute('data-id', String(item.saved_id));
			if(item.source_group_id) tr.setAttribute('data-src-group', String(item.source_group_id));
			if(item.source_volume_id) tr.setAttribute('data-src-vol', String(item.source_volume_id));
			var tdC = document.createElement('td');
			tdC.innerHTML = '<input type="checkbox" class="st-row-check" aria-label="행 선택">';
			tr.appendChild(tdC);
			tr.appendChild(mkTd('storage', item.storage_name || item.storage));
			tr.appendChild(mkTd('uuid', item.uuid));
			tr.appendChild(mkTd('p_capacity', fmtCapacity(item.p_capacity)));
			tr.appendChild(mkTd('disk', item.volume_name || item.disk));
			tr.appendChild(mkTd('vol_group', item.vol_group));
			var act = document.createElement('td');
			act.className = 'system-actions table-actions';
			act.innerHTML = '<button class="action-btn js-st-expand" type="button" title="확장" aria-label="확장"><img src="/static/image/svg/free-icon-font-apps-add.svg" alt="확장" class="action-icon"></button> <button class="action-btn js-st-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>';
			tr.appendChild(act);
			/* 확장 서브행 연결 */
			var exp = makeExpandRow(item, 7);
			tr._expandRow = exp;
			exp._mainRow = tr;
			return tr;
		}

		/* ══════════════════════════════════════
		   CSV 내보내기
		   ══════════════════════════════════════ */
		function stRowSaved(tr){
			var t = tr.querySelector('.js-st-toggle');
			if(t && t.getAttribute('data-action')==='save') return false;
			return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
		}
		function stVisibleRows(){
			var tb=table.querySelector('tbody'); if(!tb) return [];
			return Array.from(tb.querySelectorAll('tr:not(.st-expand-row)')).filter(function(tr){ return !(tr.hasAttribute('data-hidden')||tr.style.display==='none'); });
		}
		function stSavedVisibleRows(){ return stVisibleRows().filter(stRowSaved); }
		function stExportCSV(onlySelected){
			var tb=table.querySelector('tbody'); if(!tb) return;
			var mainHeaders, mainCols;
			if(currentMode==='외장'){
				mainHeaders=['스토리지명','UUID','할당용량','디스크명','볼륨그룹'];
				mainCols=['storage','uuid','p_capacity','disk','vol_group'];
			} else {
				mainHeaders=['디스크 유형','디스크 용량','디스크 수량','RAID','할당 용량','디스크명','볼륨그룹','암호화'];
				mainCols=['phys_disk','disk_capacity','phys_qty','raid','p_capacity','disk','vol_group','encrypted'];
			}
			var volHeaders=['논리장치명','논리용량','마운트','볼륨유형','비고'];
			var headers = mainHeaders.concat(volHeaders);
			var trs=stSavedVisibleRows();
			if(onlySelected) trs=trs.filter(function(tr){ var cb=tr.querySelector('.st-row-check'); return cb&&cb.checked; });
			if(!trs.length) return;
			var dataRows=[];
			trs.forEach(function(tr){
				var mainVals = mainCols.map(function(c){ var td2=tr.querySelector('[data-col="'+c+'"]'); return td2?(td2.textContent||'').trim():''; });
				/* 확장 영역 볼륨 그룹 수집 */
				var grps = tr._expandRow ? tr._expandRow.querySelectorAll('.st-vol-group') : [];
				if(grps.length===0){
					dataRows.push(mainVals.concat(['','','','','']));
				} else {
					grps.forEach(function(g){
						var vVals=['lv_name','l_capacity','mount','vol_type','remark'].map(function(n){
							var el=g.querySelector('[data-col="'+n+'"]');
							return el?(el.textContent||'').trim():'';
						});
						dataRows.push(mainVals.concat(vVals));
					});
				}
			});
			var lines=[headers].concat(dataRows).map(function(a){ return a.map(stEscapeCSV).join(','); });
			var csv='\uFEFF'+lines.join('\r\n');
			var prefix = (currentMode==='외장') ? 'storage_external_' : 'storage_local_';
			var d=new Date(), fn=prefix+d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'.csv';
			try{
				var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}), url=URL.createObjectURL(blob);
				var a=document.createElement('a'); a.href=url; a.download=fn; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
			}catch(_){
				var a2=document.createElement('a'); a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a2.download=fn; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
			}
		}

		function updateCsvBtn(){
			if(!csvBtn) return;
			var has = !!table.querySelector('tbody tr');
			csvBtn.disabled = !has;
			csvBtn.setAttribute('aria-disabled', (!has).toString());
			csvBtn.title = has ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
		}

		/* ══════════════════════════════════════
		   CSV 모달
		   ══════════════════════════════════════ */
		(function(){
			var btn=document.getElementById('st-download-btn'), modalId='st-download-modal';
			var closeBtn=document.getElementById('st-download-close'), confirmBtn=document.getElementById('st-download-confirm');
			function openM(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
			function closeM(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open'); }
			if(btn) btn.addEventListener('click', function(){
				if(btn.disabled) return;
				var saved=stSavedVisibleRows(), total2=saved.length; if(total2<=0) return;
				var selCnt=saved.filter(function(tr){ var cb=tr.querySelector('.st-row-check'); return cb&&cb.checked; }).length;
				var sub=document.getElementById('st-download-subtitle');
				if(sub) sub.textContent=selCnt>0?('선택된 '+selCnt+'개 또는 전체 '+total2+'개 결과 중 범위를 선택하세요.'):('현재 결과 '+total2+'개 항목을 CSV로 내보냅니다.');
				var rw=document.getElementById('st-csv-range-row-selected'), os=document.getElementById('st-csv-range-selected'), oa=document.getElementById('st-csv-range-all');
				if(rw) rw.hidden=!(selCnt>0); if(os){ os.disabled=!(selCnt>0); os.checked=selCnt>0; } if(oa) oa.checked=!(selCnt>0);
				openM(modalId);
			});
			if(closeBtn) closeBtn.addEventListener('click', function(){ closeM(modalId); });
			var mEl=document.getElementById(modalId);
			if(mEl){ mEl.addEventListener('click', function(e){ if(e.target===mEl) closeM(modalId); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape'&&mEl.classList.contains('show')) closeM(modalId); }); }
			if(confirmBtn) confirmBtn.addEventListener('click', function(){ var only=!!(document.getElementById('st-csv-range-selected')&&document.getElementById('st-csv-range-selected').checked); stExportCSV(only); closeM(modalId); });
		})();

		/* ══════════════════════════════════════
		   행 추가 (내장 모드)
		   ══════════════════════════════════════ */
		if(addBtn){
			addBtn.addEventListener('click', function(){
				if(currentMode!=='로컬') return;
				var tbody=table.querySelector('tbody'); if(!tbody) return;
				var tr=document.createElement('tr');
				tr.innerHTML =
					'<td><input type="checkbox" class="st-row-check" aria-label="행 선택"></td>'+
					'<td data-col="phys_disk">'+buildDiskTypeSelectHtml('')+'</td>'+
					'<td data-col="disk_capacity"><input type="text" inputmode="decimal" placeholder="숫자만 입력"></td>'+
					'<td data-col="phys_qty"><input type="text" inputmode="numeric" placeholder="수량"></td>'+
					'<td data-col="raid">'+buildRaidSelectHtml('')+'</td>'+
					'<td data-col="p_capacity"><input type="text" inputmode="decimal" placeholder="숫자만 입력"></td>'+
					'<td data-col="disk"><input type="text" placeholder="디스크명 (필수)"></td>'+
					'<td data-col="vol_group"><input type="text" placeholder="볼륨그룹"></td>'+
					'<td data-col="encrypted">'+buildEncryptedSelectHtml('')+'</td>'+
					'<td class="system-actions table-actions">'+
						'<button class="action-btn js-st-expand st-expanded" type="button" title="확장" aria-label="확장"><img src="/static/image/svg/free-icon-font-apps-add.svg" alt="확장" class="action-icon"></button> '+
						'<button class="action-btn js-st-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button> '+
						'<button class="action-btn danger js-st-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'+
					'</td>';
				tbody.appendChild(tr);
				/* 확장 서브행 (편집 모드) */
				var expRow = makeExpandRow({}, 10);
				expRow.style.display = '';
				setupEditableExpandArea(expRow);
				tbody.appendChild(expRow);
				tr._expandRow = expRow;
				expRow._mainRow = tr;
				/* 용량 입력 필드 3자리 콤마 포맷 */
				tr.querySelectorAll('[data-col="p_capacity"] input, [data-col="disk_capacity"] input, [data-col="phys_qty"] input').forEach(function(inp){ enforceCommaFormat(inp); });
				/* 검색 드롭박스 향상 */
				enhanceSearchSelect(tr);
				pager.render(); updateCsvBtn();
			});
		}

		/* ══════════════════════════════════════
		   테이블 이벤트 위임 (편집/저장/삭제)
		   ══════════════════════════════════════ */

		/* ── 볼륨 +/− 버튼 이벤트 위임 ── */
		table.addEventListener('click', function(ev){
			var addB = ev.target.closest('.st-vol-add-btn');
			if(addB){
				var wrap = addB.closest('.st-expand-wrap');
				if(!wrap) return;
				var newG = makeNewVolGroupEditable();
				wrap.appendChild(newG);
				refreshVolBtns(wrap);
				return;
			}
			var delB = ev.target.closest('.st-vol-del-btn');
			if(delB){
				var wrap2 = delB.closest('.st-expand-wrap');
				var grp = delB.closest('.st-vol-group');
				if(grp && grp.parentNode) grp.parentNode.removeChild(grp);
				if(wrap2) refreshVolBtns(wrap2);
				return;
			}
		});

		table.addEventListener('click', function(ev){
			var target = ev.target.closest('.js-st-del, .js-st-toggle, .js-st-expand');
			if(!target) return;
			var tr = ev.target.closest('tr'); if(!tr) return;
			/* 확장 행 클릭 시 부모 행으로 전환 */
			if(tr.classList.contains('st-expand-row')){
				tr = tr._mainRow || tr.previousElementSibling;
				if(!tr) return;
			}
			var isExt = tr.hasAttribute('data-ext');

			/* ─── 확장 토글 ─── */
			if(target.classList.contains('js-st-expand')){
				var expRow = tr._expandRow;
				if(!expRow) return;
				var isOpen = expRow.style.display !== 'none';
				expRow.style.display = isOpen ? 'none' : '';
				target.classList.toggle('st-expanded', !isOpen);
				return;
			}

			/* ─── 삭제 (내장 전용) ─── */
			if(target.classList.contains('js-st-del')){
				if(isExt) return;
				var stId = tr.getAttribute('data-id');
				if(stId && apiBase()){
					if(!window.confirm('삭제하시겠습니까?')) return;
					stSetBusy(true);
					stApiFetch(apiBase()+'/'+encodeURIComponent(stId), {method:'DELETE'})
						.then(function(r){ if(!r.ok||!r.json||r.json.success===false) throw new Error((r.json&&r.json.message)||'삭제 실패'); if(tr._expandRow&&tr._expandRow.parentNode) tr._expandRow.parentNode.removeChild(tr._expandRow); if(tr.parentNode) tr.parentNode.removeChild(tr); pager.render(); updateCsvBtn(); })
						.catch(function(e){ stAlert(e.message||'삭제 중 오류'); })
						.finally(function(){ stSetBusy(false); });
					return;
				}
				if(tr._expandRow&&tr._expandRow.parentNode) tr._expandRow.parentNode.removeChild(tr._expandRow);
				if(tr.parentNode) tr.parentNode.removeChild(tr);
				pager.render(); updateCsvBtn();
				return;
			}

			/* ─── 편집 ─── */
			if(target.classList.contains('js-st-toggle') && target.getAttribute('data-action')==='edit'){
				/* 자동 확장 */
				if(tr._expandRow && tr._expandRow.style.display==='none'){
					tr._expandRow.style.display='';
					var expB=tr.querySelector('.js-st-expand');
					if(expB) expB.classList.add('st-expanded');
				}
				/* 메인 행 편집 컨럼 */
				var mainCols = isExt ? ['vol_group'] : ['phys_disk','disk_capacity','phys_qty','raid','p_capacity','disk','vol_group','encrypted'];
				mainCols.forEach(function(n){
					var td2=tr.querySelector('[data-col="'+n+'"]'); if(!td2) return;
					var cur=(td2.textContent||'').trim(); if(cur==='-') cur='';
					if(n==='raid'){
						td2.innerHTML = buildRaidSelectHtml(cur);
						return;
					}
					if(n==='phys_disk'){
						td2.innerHTML = buildDiskTypeSelectHtml(cur);
						return;
					}
					if(n==='encrypted'){
						td2.innerHTML = buildEncryptedSelectHtml(cur);
						return;
					}
					cur = cur.replace(/,/g,'');
					var isCapCol = (n==='p_capacity'||n==='disk_capacity');
					var isNumCol = isCapCol || (n==='phys_qty');
					if(isCapCol) cur = cur.replace(/\s*[A-Za-z]+$/,'');
					td2.innerHTML = '<input type="text"' + (isNumCol?' inputmode="decimal"':'') + ' value="'+cur+'">';
					if(isNumCol){ enforceCommaFormat(td2.querySelector('input')); }
				});
				/* 확장 행 편집 컨럼 (멀티 볼륨) */
				if(tr._expandRow){
					setupEditableExpandArea(tr._expandRow);
				}
				enhanceSearchSelect(tr);
				target.setAttribute('data-action','save'); target.title='저장'; target.setAttribute('aria-label','저장');
				target.innerHTML='<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
				return;
			}

			/* ─── 저장 ─── */
			if(target.classList.contains('js-st-toggle') && target.getAttribute('data-action')==='save'){
				var gi = function(n){
					var td2=tr.querySelector('[data-col="'+n+'"]');
					if(!td2&&tr._expandRow) td2=tr._expandRow.querySelector('[data-col="'+n+'"]');
					return td2?td2.querySelector('input,textarea'):null;
				};
				var se = function(inp,on){ if(!inp) return; if(on){inp.classList.add('input-error');inp.setAttribute('aria-invalid','true');}else{inp.classList.remove('input-error');inp.removeAttribute('aria-invalid');} };
				var fi=null;

				/* 내장 모드만 disk 필수 */
				if(!isExt && currentMode==='로컬'){
					var dInp=gi('disk'), dV=(dInp?dInp.value:(tr.querySelector('[data-col="disk"]').textContent||'')).trim();
					if(!dV){se(dInp,true);if(!fi)fi=dInp;}else se(dInp,false);
					if(fi){ try{fi.focus();}catch(_){} return; }
				}

				var rd = function(n){
					var td2=tr.querySelector('[data-col="'+n+'"]');
					if(!td2&&tr._expandRow) td2=tr._expandRow.querySelector('[data-col="'+n+'"]');
					var inp2=td2?td2.querySelector('input,textarea'):null;
					if(inp2) return String(inp2.value).trim();
					var sel2=td2?td2.querySelector('select'):null;
					if(sel2) return String(sel2.value).trim();
					var txt=(td2?td2.textContent:'').trim();
					return txt==='-'?'':txt.replace(/,/g,'');
				};

				var payload;
				var vols = collectVolumes(tr._expandRow);
				if(isExt){
					/* 외장 행: 편집 가능 필드만 + 읽기전용 필드(텍스트에서 수집) */
					payload = {
						type:'외장',
						storage: rd('storage'),
						uuid: rd('uuid'),
						p_capacity: rd('p_capacity').replace(/,/g,''),
						disk: rd('disk'),
						vol_group: rd('vol_group'),
						volumes: vols,
						source_group_id: tr.getAttribute('data-src-group')||null,
						source_volume_id: tr.getAttribute('data-src-vol')||null
					};
				} else {
					payload = {
						type:currentMode,
						phys_disk:rd('phys_disk'),
						disk_capacity:rd('disk_capacity').replace(/,/g,''),
						phys_qty:rd('phys_qty').replace(/,/g,''),
						raid:rd('raid'),
						p_capacity:rd('p_capacity').replace(/,/g,''),
						disk:rd('disk'),
						vol_group:rd('vol_group'),
						encrypted:rd('encrypted'),
						volumes: vols
					};
				}

				var applySavedMainCols = isExt
					? ['storage','uuid','p_capacity','disk','vol_group']
					: ['phys_disk','disk_capacity','phys_qty','raid','p_capacity','disk','vol_group','encrypted'];
				var applySaved = function(item){
					applySavedMainCols.forEach(function(c){
						var td2=tr.querySelector('[data-col="'+c+'"]');
						if(!td2) return;
						var v=item[c];
						/* 용량 필드 콤마 포맷 + GB */
						if((c==='p_capacity'||c==='disk_capacity') && v!=null && String(v).trim()!==''){
							td2.textContent = fmtCapacity(v);
						} else if(c==='phys_qty' && v!=null && String(v).trim()!==''){
							td2.textContent = fmtNumber(v);
						} else if(c==='encrypted'){
							var ev=(v==null)?'':String(v).trim();
							if(ev==='O'||ev==='X') td2.innerHTML='<span class="st-enc-badge st-enc-'+(ev==='O'?'on':'off')+'">'+ev+'</span>';
							else td2.textContent='-';
						} else {
							td2.textContent=(v==null||String(v).trim()==='')?'-':String(v);
						}
					});
					/* 확장 영역: 볼륨 그룹 읽기 모드 복원 */
					var savedVols = item.volumes || vols || [];
					applyVolumesDisplay(tr._expandRow, savedVols);
					if(item&&item.id) tr.setAttribute('data-id',String(item.id));
					target.setAttribute('data-action','edit'); target.title='편집'; target.setAttribute('aria-label','편집');
					target.innerHTML='<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
				};

				if(!apiBase()){ applySaved(payload); pager.render(); updateCsvBtn(); return; }

				var sid=tr.getAttribute('data-id');
				stSetBusy(true);
				stApiFetch(apiBase()+(sid?('/'+encodeURIComponent(sid)):''), { method:sid?'PUT':'POST', headers:{'Accept':'application/json','Content-Type':'application/json'}, body:JSON.stringify(payload) })
					.then(function(r){ if(!r.ok||!r.json||r.json.success===false) throw new Error((r.json&&r.json.message)||'저장 실패'); var merged={}; for(var k in payload) merged[k]=payload[k]; var si=r.json.item||{}; for(var k2 in si) merged[k2]=si[k2]; applySaved(merged); pager.render(); updateCsvBtn(); })
					.catch(function(e){ stAlert(e.message||'저장 중 오류'); })
					.finally(function(){ stSetBusy(false); });
				return;
			}
		});

		/* ══════════════════════════════════════
		   외장 데이터 캐시 (차트 모달용)
		   ══════════════════════════════════════ */
		var _extCacheItems = [];

		/* ══════════════════════════════════════
		   차트 모달 (외장 모드)
		   ══════════════════════════════════════ */
		/* ── 차트 모달 (지연 DOM 바인딩) ── */
		(function(){
			var _chartBound = false;

			function fmtCap(v){
				if(!v) return '-';
				var s=String(v).replace(/,/g,'').trim();
				var n=parseFloat(s);
				if(isNaN(n)) return v;
				if(n>=1000) return (n/1000).toFixed(1).replace(/\.0$/,'')+' TB';
				return n.toFixed(0)+' GB';
			}

			function openChartModal(){
				var modal = document.getElementById('st-chart-modal');
				if(!modal) return;
				document.body.classList.add('modal-open');
				modal.classList.add('show');
				modal.setAttribute('aria-hidden','false');

				/* 최초 1회만 이벤트 바인딩 */
				if(!_chartBound){
					_chartBound = true;
					var closeBtn2 = document.getElementById('st-chart-close');
					if(closeBtn2) closeBtn2.addEventListener('click', closeChartModal);
					modal.addEventListener('click', function(e){ if(e.target===modal) closeChartModal(); });
					document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modal.classList.contains('show')) closeChartModal(); });
				}
			}
			function closeChartModal(){
				var modal = document.getElementById('st-chart-modal');
				if(!modal) return;
				modal.classList.remove('show');
				modal.setAttribute('aria-hidden','true');
				if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open');
			}

			function renderChart(items){
				var body = document.getElementById('st-chart-body');
				if(!body) return;
				if(!items||!items.length){
					body.innerHTML='<div class="st-chart-empty">할당된 외장 스토리지가 없습니다.</div>';
					return;
				}

				/* ── 스토리지별 집계 ── */
				var storages={}, storOrder=[];
				items.forEach(function(it){
					var sn=it.storage_name||'(스토리지 없음)';
					if(!storages[sn]){ storages[sn]={name:sn, total:0, volCount:0, groupSet:{}}; storOrder.push(sn); }
					var cap=parseFloat(String(it.p_capacity||'0').replace(/,/g,''))||0;
					storages[sn].total+=cap;
					storages[sn].volCount++;
					var gn=it.group_name||'';
					if(gn) storages[sn].groupSet[gn]=true;
				});
				var grandTotal=0, grandVols=0, grandGroups={};
				storOrder.forEach(function(sn){
					grandTotal+=storages[sn].total;
					grandVols+=storages[sn].volCount;
					var gs=storages[sn].groupSet;
					for(var k in gs) grandGroups[k]=true;
				});
				var grandGroupCount=Object.keys(grandGroups).length;

				var html='';
				/* 요약 카드 */
				html+='<div class="st-chart-summary">';
				html+='<div class="st-chart-card"><div class="st-chart-card-label">총 할당 용량</div><div class="st-chart-card-value">'+fmtCap(grandTotal)+'</div></div>';
				html+='<div class="st-chart-card"><div class="st-chart-card-label">스토리지</div><div class="st-chart-card-value">'+storOrder.length+'대</div></div>';
				html+='<div class="st-chart-card"><div class="st-chart-card-label">볼륨 그룹</div><div class="st-chart-card-value">'+grandGroupCount+'개</div></div>';
				html+='<div class="st-chart-card"><div class="st-chart-card-label">총 볼륨</div><div class="st-chart-card-value">'+grandVols+'개</div></div>';
				html+='</div>';

				/* 스토리지별 요약 테이블 */
				html+='<table class="st-chart-vol-table st-chart-summary-tbl">';
				html+='<thead><tr><th>스토리지</th><th>볼륨 그룹</th><th>볼륨 수</th><th>할당 용량</th><th>비율</th></tr></thead><tbody>';
				storOrder.forEach(function(sn){
					var s=storages[sn];
					var groupCount=Object.keys(s.groupSet).length;
					var pct=grandTotal>0?Math.round(s.total/grandTotal*100):0;
					html+='<tr>';
					html+='<td class="st-chart-tbl-name">'+sn+'</td>';
					html+='<td class="st-chart-tbl-num">'+groupCount+'개</td>';
					html+='<td class="st-chart-tbl-num">'+s.volCount+'개</td>';
					html+='<td class="st-chart-tbl-num st-chart-tbl-cap">'+fmtCap(s.total)+'</td>';
					html+='<td class="st-chart-tbl-num"><div class="st-chart-pct-wrap"><div class="st-chart-pct-bar" style="width:'+pct+'%"></div><span class="st-chart-pct-label">'+pct+'%</span></div></td>';
					html+='</tr>';
				});
				html+='</tbody></table>';

				body.innerHTML=html;
			}

			if(chartBtn){
				chartBtn.addEventListener('click', function(){
					renderChart(_extCacheItems);
					openChartModal();
				});
			}
		})();

		/* ══════════════════════════════════════
		   데이터 로드 (현재 모드 기준)
		   ══════════════════════════════════════ */
		function loadData(){
			var base=apiBase();
			var tbody=table.querySelector('tbody'); if(!tbody) return;
			if(!base){ pager.render(); updateCsvBtn(); return; }
			stSetBusy(true);

			if(currentMode==='외장'){
				/* 외장: tab32 할당정보 + 저장된 server_storage(외장) 병합 */
				Promise.all([
					stApiFetch(base+'/external-sources', {method:'GET'}),
					stApiFetch(base+'?type='+encodeURIComponent('외장'), {method:'GET'})
				]).then(function(results){
					var extR=results[0], savedR=results[1];
					if(!extR.ok||!extR.json||extR.json.success===false) throw new Error((extR.json&&extR.json.message)||'조회 실패');
					tbody.innerHTML='';
					var extItems = extR.json.items||[];
					_extCacheItems = extItems;

					/* 저장된 외장 레코드를 source_volume_id로 인덱싱 */
					var savedMap = {};
					if(savedR.ok && savedR.json && savedR.json.items){
						savedR.json.items.forEach(function(s){
							if(s.source_volume_id) savedMap[s.source_volume_id] = s;
						});
					}

					extItems.forEach(function(item){
						/* 저장된 편집 데이터가 있으면 병합 */
						var saved = savedMap[item.source_volume_id];
						var merged = {
							storage_name: item.storage_name,
							storage: item.storage_name,
							uuid: item.uuid,
							p_capacity: item.p_capacity,
							volume_name: item.volume_name,
							disk: item.volume_name,
							group_name: item.group_name,
							thin_thick: item.thin_thick,
							source_group_id: item.source_group_id,
							source_volume_id: item.source_volume_id,
							/* 편집 가능 필드: 저장된 값 우선, 없으면 기본 '-' */
							vol_group: (saved && saved.vol_group) || '',
							l_capacity: (saved && saved.l_capacity) || '',
							mount: (saved && saved.mount) || '',

							vol_type: (saved && saved.vol_type) || '',
							remark: (saved && saved.remark) || '',
							saved_id: saved ? saved.id : null
						};
						var tr = makeExtRow(merged);
						tbody.appendChild(tr);
						if(tr._expandRow) tbody.appendChild(tr._expandRow);
					});
					pager.render(); updateCsvBtn();
				}).catch(function(e){ stAlert(e.message||'외장 스토리지 조회 실패'); pager.render(); updateCsvBtn(); })
				.finally(function(){ stSetBusy(false); });
			} else {
				/* 내장: server_storage 테이블에서 조회 */
				stApiFetch(base+'?type='+encodeURIComponent(currentMode), {method:'GET'})
					.then(function(r){
						if(!r.ok||!r.json||r.json.success===false) throw new Error((r.json&&r.json.message)||'조회 실패');
						tbody.innerHTML='';
						var items = r.json.items||[];
					items.forEach(function(item){ var tr=makeLocalRow(item); tbody.appendChild(tr); if(tr._expandRow) tbody.appendChild(tr._expandRow); });
						pager.render(); updateCsvBtn();
					})
					.catch(function(e){ stAlert(e.message||'스토리지 조회 실패'); pager.render(); updateCsvBtn(); })
					.finally(function(){ stSetBusy(false); });
			}
		}

		/* ── 초기 세팅 ── */
		applyTableStructure(currentMode);
		updateUIForMode(currentMode);
		pager.render();
		updateCsvBtn();
		loadData();
	}

	try{ window.__blsInitTab10Storage = __blsInitTab10Storage; }catch(_){}
})();

