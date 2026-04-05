/*
 * tab42-manager.js
 * Manager tab behavior.
 */

(function(){
	'use strict';

	

	

	

	// Utilities
	var _docListenersRegistered = false;

	function ready(fn){
		if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
		else fn();
		// SPA re-entry: run fn again when blossom swaps the page
		document.addEventListener('blossom:pageLoaded', function(){
			if(document.body.classList.contains('page-vendor-maintenance-manager')
			|| document.body.classList.contains('page-vendor-manufacturer-manager')
			|| document.body.classList.contains('page-customer-member-manager')
			|| document.body.classList.contains('page-customer-client1-manager')
			|| document.body.classList.contains('page-customer-client2-manager')){
				fn();
			}
		});
	}

	function coerceInt(v){
		var n = parseInt(String(v == null ? '' : v).replace(/[^0-9-]/g, ''), 10);
		return (isNaN(n) || !isFinite(n)) ? null : n;
	}

	function getQueryParamInt(keys){
		try{
			var qs = new URLSearchParams((location && location.search) || '');
			for(var i=0;i<keys.length;i++){
				var k = keys[i];
				var n = coerceInt(qs.get(k));
				if(n && n > 0) return n;
			}
		}catch(_){ }
		return null;
	}

	function getVendorIdFromSessionStorage(storageKey){
		try{
			var raw = sessionStorage.getItem(storageKey);
			if(!raw) return null;
			var obj = JSON.parse(raw);
			return coerceInt(obj && obj.id);
		}catch(_){ return null; }
	}

	function escapeHtml(v){
		return String(v == null ? '' : v).replace(/[&<>"']/g, function(s){
			return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]);
		});
	}

	function toast(msg, type){
		try{
			if(window.showToast) window.showToast(msg, type || 'info');
			else showMgModal(msg, type === 'error' ? '오류' : '알림');
		}catch(_){ }
	}

	/* ---------- Message modal (onpremise-hardware style) ---------- */
	function showMgModal(msg, title){
		return new Promise(function(resolve){
			var id = 'mg-message-modal';
			var existing = document.getElementById(id);
			if(existing && existing.parentNode) existing.parentNode.removeChild(existing);

			var overlay = document.createElement('div');
			overlay.id = id;
			overlay.className = 'server-add-modal blossom-message-modal modal-overlay-full';
			overlay.setAttribute('aria-hidden','false');
			overlay.innerHTML = ''
				+ '<div class="server-add-content">'
				+   '<div class="server-add-header">'
				+     '<div class="server-add-title dispose-title">'
				+       '<h3>' + escapeHtml(title || '알림') + '</h3>'
				+     '</div>'
				+     '<button class="close-btn" type="button" title="닫기">'
				+       '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
				+     '</button>'
				+   '</div>'
				+   '<div class="server-add-body">'
				+     '<div class="dispose-content">'
				+       '<div class="dispose-text"><p>' + escapeHtml(msg) + '</p></div>'
				+       '<div class="dispose-illust"><img src="/static/image/svg/list/free-sticker-option.svg" alt="" loading="lazy" /></div>'
				+     '</div>'
				+   '</div>'
				+   '<div class="server-add-actions align-right">'
				+     '<div class="action-buttons right">'
				+       '<button type="button" class="btn-primary mg-modal-ok">확인</button>'
				+     '</div>'
				+   '</div>'
				+ '</div>';

			document.body.appendChild(overlay);
			overlay.classList.add('show');
			document.body.classList.add('modal-open');

			function closeMg(){
				overlay.classList.remove('show');
				overlay.setAttribute('aria-hidden','true');
				document.body.classList.remove('modal-open');
				setTimeout(function(){ if(overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
				document.removeEventListener('keydown', escHandler);
				resolve();
			}

			overlay.querySelector('.close-btn').addEventListener('click', closeMg);
			overlay.querySelector('.mg-modal-ok').addEventListener('click', closeMg);
			overlay.addEventListener('click', function(e){ if(e.target === overlay) closeMg(); });

			var escHandler = function(e){
				if(e.key === 'Escape') closeMg();
			};
			document.addEventListener('keydown', escHandler);

			try{ overlay.querySelector('.mg-modal-ok').focus(); }catch(_){}
		});
	}

	// API

	

	

	

	async function apiRequestJson(url, opts){
		var options = Object.assign({ method:'GET', credentials:'same-origin' }, opts || {});
		options.headers = Object.assign({ 'Accept':'application/json' }, options.headers || {});
		if(options.body && !(options.headers && options.headers['Content-Type'])){
			options.headers['Content-Type'] = 'application/json';
		}
		var res = await fetch(url, options);
		var contentType = '';
		try{ contentType = String(res.headers.get('content-type') || ''); }catch(_){ contentType = ''; }
		var text = await res.text();

		var looksLikeHtml = /text\/html/i.test(contentType) || /^\s*<!doctype\s+html/i.test(text) || /^\s*<html\b/i.test(text);
		var redirectedToLogin = !!(res && res.redirected && res.url && /\/login\b/i.test(String(res.url)));
		if(redirectedToLogin) throw new Error('로그인이 필요합니다. 새로고침 후 다시 로그인하세요.');
		if(looksLikeHtml) throw new Error('API 응답이 JSON이 아닙니다. (status ' + res.status + ')');

		var json;
		try{ json = text ? JSON.parse(text) : {}; }catch(_e){ json = { success:false, message:text || 'Invalid JSON' }; }
		if(!res.ok){
			var msg = (json && (json.message || json.error)) || ('HTTP ' + res.status);
			throw new Error(msg);
		}
		return json;
	}

	async function getSessionUserId(){
		try{
			var me = await apiRequestJson('/api/session/me', { method:'GET' });
			var id = coerceInt(me && me.user && me.user.id);
			return (id && id > 0) ? id : null;
		}catch(_){ return null; }
	}

	function normalizeItems(res){
		if(!res) return [];
		if(Array.isArray(res)) return res;
		if(Array.isArray(res.items)) return res.items;
		if(res.success === true && Array.isArray(res.items)) return res.items;
		return [];
	}

	function normalizeItem(res){
		if(!res) return null;
		if(res.item) return res.item;
		
		if(res.id != null) return res;
		return null;
	}

	function getPageHeaderTitle(){
		try{
			var el = document.getElementById('page-header-title');
			var t = el ? String(el.textContent || '').trim() : '';
			return t || '';
		}catch(_){ return ''; }
	}

	function isVendorPage(){
		var cls = document.body && document.body.classList;
		return !!(cls && (cls.contains('page-vendor-manufacturer-manager') || cls.contains('page-vendor-maintenance-manager') || cls.contains('page-workgroup-manager') || cls.contains('page-customer-member-manager') || cls.contains('page-customer-client1-manager') || cls.contains('page-customer-client2-manager')));
	}

	function inferConfig(){
		var body = document.body;
		var cls = body && body.classList ? body.classList : null;
		var isVpn = !!(cls && cls.contains('page-vpn-manager'));
		var isDedicated = !!(cls && cls.contains('page-dedicatedline-manager'));
		var isVendorManufacturer = !!(cls && cls.contains('page-vendor-manufacturer-manager'));
		var isVendorMaintenance = !!(cls && cls.contains('page-vendor-maintenance-manager'));
		var isWorkGroup = !!(cls && cls.contains('page-workgroup-manager'));
		var isCustomerMember = !!(cls && cls.contains('page-customer-member-manager'));
		var isCustomerClient1 = !!(cls && cls.contains('page-customer-client1-manager'));
		var isCustomerClient2 = !!(cls && cls.contains('page-customer-client2-manager'));

		if(isWorkGroup){
			return {
				kind: 'workgroup',
				label: '업무 그룹',
				apiBase: '/api/work-groups',
				id: getQueryParamInt(['id','group_id','groupId']) || getVendorIdFromSessionStorage('work_group_selected_row') || parseInt(document.body.getAttribute('data-cat-detail-id'),10) || 0,
				includeActorUserId: false,
				filePrefix: 'workgroup_manager_',
				lookups: { orgDepartments: '/api/org-departments', userProfiles: '/api/user-profiles' }
			};
		}

		if(isDedicated){
			return {
				kind: 'leasedline',
				label: '전용회선',
				apiBase: '/api/network/leased-lines',
				id: getQueryParamInt(['id','line_id','lineId']) || parseInt(document.body.getAttribute('data-gov-detail-id'),10) || 0,
				includeActorUserId: true,
				filePrefix: 'leasedline_manager_'
			};
		}

		if(isVpn){
			return {
				kind: 'vpn',
				label: 'VPN',
				apiBase: '/api/network/vpn-lines',
				id: getQueryParamInt(['vpn_line_id','vpnLineId','line_id','lineId','id']) || parseInt(document.body.getAttribute('data-gov-detail-id'),10) || 0,
				includeActorUserId: false,
				filePrefix: 'vpn_manager_'
			};
		}

		if(isVendorManufacturer){
			return {
				kind: 'vendor_manufacturer',
				label: '제조사',
				apiBase: '/api/vendor-manufacturers',
				id: getQueryParamInt(['vendor_id','id']) || getVendorIdFromSessionStorage('manufacturer:context'),
				includeActorUserId: false,
				filePrefix: 'vendor_manufacturer_manager_'
			};
		}

		if(isVendorMaintenance){
			return {
				kind: 'vendor_maintenance',
				label: '유지보수사',
				apiBase: '/api/vendor-maintenance',
				id: getQueryParamInt(['vendor_id','id']) || getVendorIdFromSessionStorage('maintenance:context'),
				includeActorUserId: false,
				filePrefix: 'vendor_maintenance_manager_'
			};
		}

		if(isCustomerMember){
			return {
				kind: 'customer_member',
				label: '회원사',
				apiBase: '/api/customer-members',
				id: getQueryParamInt(['id']) || getVendorIdFromSessionStorage('member:context'),
				includeActorUserId: false,
				filePrefix: 'customer_member_manager_'
			};
		}

		if(isCustomerClient1){
			return {
				kind: 'customer_client1',
				label: '준회원사',
				apiBase: '/api/customer-associates',
				id: getQueryParamInt(['id']) || getVendorIdFromSessionStorage('client1:context'),
				includeActorUserId: false,
				filePrefix: 'customer_client1_manager_'
			};
		}

		if(isCustomerClient2){
			return {
				kind: 'customer_client2',
				label: '고객사',
				apiBase: '/api/customer-clients',
				id: getQueryParamInt(['id']) || getVendorIdFromSessionStorage('client2:context'),
				includeActorUserId: false,
				filePrefix: 'customer_client2_manager_'
			};
		}

		return null;
	}

	function ensureSchema(table){
		try{
			table.setAttribute('data-context', 'manager');
			table.classList.remove('cols-5');
			if(!table.classList.contains('cols-6')) table.classList.add('cols-6');
		}catch(_){ }
	}

	function setRowEditing(tr, isEditing){
		if(!tr) return;
		var cb = tr.querySelector('.hw-row-check');
		var delBtn = tr.querySelector('.js-mg-del');
		if(isEditing){
			tr.setAttribute('data-mg-editing','1');
			if(cb) cb.disabled = true;
			if(delBtn){ delBtn.style.visibility = 'hidden'; delBtn.style.pointerEvents = 'none'; }
			tr.classList.remove('selected');
			return;
		}
		tr.removeAttribute('data-mg-editing');
		if(cb) cb.disabled = false;
		if(delBtn){ delBtn.style.visibility = ''; delBtn.style.pointerEvents = ''; }
		if(cb){
			var hidden = tr.hasAttribute('data-hidden') || tr.style.display === 'none';
			tr.classList.toggle('selected', !!cb.checked && !hidden);
		}
	}

	function escapeCSV(val){
		return '"' + String(val == null ? '' : val).replace(/"/g,'""') + '"';
	}

	function isRowSaved(tr){
		var t = tr.querySelector('.js-mg-toggle');
		var inEdit = t && t.getAttribute('data-action') === 'save';
		if(inEdit) return false;
		return !tr.querySelector('td[data-col] input, td[data-col] select, td[data-col] textarea');
	}

	function getManagerId(tr){
		var a = tr.getAttribute('data-manager-id');
		if(a != null && String(a).trim() !== '') return coerceInt(a);
		var b = tr.getAttribute('data-id');
		if(b != null && String(b).trim() !== '') return coerceInt(b);
		return null;
	}

	function setManagerId(tr, id){
		if(!tr) return;
		if(id == null) return;
		tr.setAttribute('data-manager-id', String(id));
		
		tr.setAttribute('data-id', String(id));
	}

	
	function WorkgroupLookups(cfg){
		this.cfg = cfg;
		this.departments = null;
		this.deptById = {};
		this.usersByDeptId = {};
	}
	WorkgroupLookups.prototype.ensureDepartments = async function(){
		if(this.departments) return this.departments;
		var res = await apiRequestJson(this.cfg.lookups.orgDepartments + '?_=' + Date.now(), { method:'GET' });
		if(!res || res.success === false) throw new Error((res && res.message) || '부서 목록 조회 실패');
		var items = Array.isArray(res.items) ? res.items : [];
		items = items.filter(function(r){ return r && (r.id != null) && String(r.dept_name || '').trim(); });
		items.sort(function(a,b){ return String(a.dept_name||'').localeCompare(String(b.dept_name||''),'ko-KR'); });
		this.departments = items;
		this.deptById = {};
		items.forEach(function(r){ this.deptById[String(r.id)] = r; }.bind(this));
		return items;
	};
	WorkgroupLookups.prototype.ensureUsersForDept = async function(deptId){
		var did = coerceInt(deptId);
		if(!did || did <= 0) return [];
		var key = String(did);
		if(this.usersByDeptId[key]) return this.usersByDeptId[key];
		var url = this.cfg.lookups.userProfiles + '?department_id=' + encodeURIComponent(String(did)) + '&limit=2000&_=' + Date.now();
		var res = await apiRequestJson(url, { method:'GET' });
		if(!res || res.success === false) throw new Error((res && res.message) || '사용자 목록 조회 실패');
		var items = Array.isArray(res.items) ? res.items : [];
		items = items.filter(function(u){ return u && (u.id != null) && String(u.name||'').trim(); });
		items.sort(function(a,b){ return String(a.name||'').localeCompare(String(b.name||''),'ko-KR'); });
		this.usersByDeptId[key] = items;
		return items;
	};
	function buildDeptSelectHtml(depts, selectedId){
		var cur = selectedId != null ? String(selectedId) : '';
		var html = '<select data-mg-select="dept" class="search-select" data-searchable-scope="page" title="소속">';
		html += '<option value="">선택</option>';
		(depts || []).forEach(function(d){
			var id = d && d.id != null ? String(d.id) : '';
			var name = String((d && d.dept_name) || '').trim();
			if(!id || !name) return;
			html += '<option value="' + escapeHtml(id) + '"' + (id === cur ? ' selected' : '') + '>' + escapeHtml(name) + '</option>';
		});
		html += '</select>';
		return html;
	}
	function buildUserSelectHtml(users, selectedId){
		var cur = selectedId != null ? String(selectedId) : '';
		var html = '<select data-mg-select="user" class="search-select" data-searchable-scope="page" title="이름">';
		html += '<option value="">선택</option>';
		(users || []).forEach(function(u){
			var id = u && u.id != null ? String(u.id) : '';
			var name = String((u && u.name) || '').trim();
			if(!id || !name) return;
			html += '<option value="' + escapeHtml(id) + '"' + (id === cur ? ' selected' : '') + '>' + escapeHtml(name) + '</option>';
		});
		html += '</select>';
		return html;
	}
	function trim(v){ return String(v == null ? '' : v).trim(); }
	function pickPhone(u){
		if(!u) return '';
		var phone = trim(u.phone);
		if(phone) return phone;
		phone = trim(u.mobile_phone || u.mobilePhone);
		if(phone) return phone;
		phone = trim(u.ext_phone || u.extPhone);
		return phone;
	}
	function findUser(users, userId){
		var uid = coerceInt(userId);
		if(!uid) return null;
		for(var i=0;i<users.length;i++){
			var u = users[i];
			if(u && String(u.id) === String(uid)) return u;
		}
		return null;
	}
	function clearAutoContacts(tr){
		if(!tr) return;
		try{
			var phoneTd = tr.querySelector('[data-col="phone"]');
			var emailTd = tr.querySelector('[data-col="email"]');
			var prevPhone = trim(tr.dataset.autoPhone);
			var prevEmail = trim(tr.dataset.autoEmail);
			if(phoneTd){
				var phoneInp = phoneTd.querySelector('input');
				var phoneSpan = phoneTd.querySelector('.mg-auto-text');
				if(phoneInp && prevPhone && trim(phoneInp.value) === prevPhone) phoneInp.value = '';
				else if(phoneSpan && prevPhone && trim(phoneSpan.textContent) === prevPhone) phoneSpan.textContent = '-';
			}
			if(emailTd){
				var emailInp = emailTd.querySelector('input');
				var emailSpan = emailTd.querySelector('.mg-auto-text');
				if(emailInp && prevEmail && trim(emailInp.value) === prevEmail) emailInp.value = '';
				else if(emailSpan && prevEmail && trim(emailSpan.textContent) === prevEmail) emailSpan.textContent = '-';
			}
			try{ delete tr.dataset.autoPhone; }catch(_d1){ tr.dataset.autoPhone=''; }
			try{ delete tr.dataset.autoEmail; }catch(_d2){ tr.dataset.autoEmail=''; }
		}catch(_){ }
	}
	function applyAutoContacts(tr, users, userId){
		if(!tr) return;
		var u = findUser(users || [], userId);
		if(!u) return;
		var phone = pickPhone(u);
		var email = trim(u.email);
		var phoneTd = tr.querySelector('[data-col="phone"]');
		var emailTd = tr.querySelector('[data-col="email"]');
		if(phoneTd){
			var phoneInp = phoneTd.querySelector('input');
			var phoneSpan = phoneTd.querySelector('.mg-auto-text');
			if(phoneInp){
				var cur = trim(phoneInp.value);
				var prevAuto = trim(tr.dataset.autoPhone);
				if(!cur || cur === prevAuto) phoneInp.value = phone;
			} else if(phoneSpan){
				phoneSpan.textContent = phone || '-';
			} else {
				phoneTd.textContent = phone || '-';
			}
			tr.dataset.autoPhone = phone;
		}
		if(emailTd){
			var emailInp = emailTd.querySelector('input');
			var emailSpan = emailTd.querySelector('.mg-auto-text');
			if(emailInp){
				var curE = trim(emailInp.value);
				var prevAutoE = trim(tr.dataset.autoEmail);
				if(!curE || curE === prevAutoE) emailInp.value = email;
			} else if(emailSpan){
				emailSpan.textContent = email || '-';
			} else {
				emailTd.textContent = email || '-';
			}
			tr.dataset.autoEmail = email;
		}
	}

	ready(function(){
		var cfg = inferConfig();
		var table = document.getElementById('hw-spec-table');
		if(!cfg || !table) return;

		ensureSchema(table);

		var tbody = table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));
		var emptyEl = document.getElementById('hw-empty');
		var addBtn = document.getElementById('hw-row-add');
		var selectAll = document.getElementById('hw-select-all');

	// Pagination

	
		var pageSizeSel = document.getElementById('hw-page-size');
		var infoEl = document.getElementById('hw-pagination-info');
		var numsWrap = document.getElementById('hw-page-numbers');
		var btnFirst = document.getElementById('hw-first');
		var btnPrev = document.getElementById('hw-prev');
		var btnNext = document.getElementById('hw-next');
		var btnLast = document.getElementById('hw-last');
		var csvBtn = document.getElementById('hw-download-btn');
		var emailSendBtn = document.getElementById('mg-email-send-btn');

		var state = { page: 1, 
	

	
pageSize: 10 };
		(function initPageSize(){
			try{
				var saved = localStorage.getItem('vendor:manager:pageSize');
				if(pageSizeSel){
					if(saved && ['10','20','50','100'].indexOf(saved) > -1){ state.pageSize = parseInt(saved, 10); pageSizeSel.value = saved; }
					pageSizeSel.addEventListener('change', function(){
						var v = parseInt(pageSizeSel.value, 10);
						if(!isNaN(v)){
							state.page = 1;
							state.pageSize = v;
							localStorage.setItem('vendor:manager:pageSize', String(v));
							renderPage();
						}
					});
				}
			}catch(_){ }
		})();

		function rows(){ return Array.from(tbody.querySelectorAll('tr')); }
		function total(){ return rows().length; }
		function pages(){ return Math.max(1, Math.ceil(total() / state.pageSize)); }
		function clampPage(){ var p = pages(); if(state.page > p) state.page = p; if(state.page < 1) state.page = 1; }
		function updatePaginationUI(){
			if(infoEl){
				var t = total();
				var start = t ? (state.page - 1) * state.pageSize + 1 : 0;
				var end = Math.min(t, state.page * state.pageSize);
				infoEl.textContent = start + '-' + end + ' / ' + t + '개 항목';
			}
			if(numsWrap){
				var p = pages();
				numsWrap.innerHTML = '';
				for(var i=1;i<=p && i<=50;i++){
					var b = document.createElement('button');
					b.className = 'page-btn' + (i === state.page ? ' active' : '');
					b.textContent = String(i);
					b.dataset.page = String(i);
					numsWrap.appendChild(b);
				}
			}
			var p2 = pages();
			if(btnFirst) btnFirst.disabled = (state.page === 1);
			if(btnPrev) btnPrev.disabled = (state.page === 1);
			if(btnNext) btnNext.disabled = (state.page === p2);
			if(btnLast) btnLast.disabled = (state.page === p2);

			if(pageSizeSel){
				var none = (total() === 0);
				pageSizeSel.disabled = none;
				if(none){
					try{ pageSizeSel.value = '10'; state.pageSize = 10; }catch(_){ }
				}
			}
		}
		function renderPage(){
			clampPage();
			var list = rows();
			var startIdx = (state.page - 1) * state.pageSize;
			var endIdx = startIdx + state.pageSize - 1;
			list.forEach(function(tr, idx){
				var visible = idx >= startIdx && idx <= endIdx;
				tr.style.display = visible ? '' : 'none';
				if(visible) tr.removeAttribute('data-hidden');
				else tr.setAttribute('data-hidden','1');
				var cb = tr.querySelector('.hw-row-check');
				if(cb) tr.classList.toggle('selected', !!cb.checked && visible);
			});
			updatePaginationUI();
			if(selectAll){
				var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check');
				if(visChecks.length) selectAll.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; });
				else selectAll.checked = false;
			}
		}
		function go(p){ state.page = p; renderPage(); }
		function goDelta(d){ go(state.page + d); }
		function goFirst(){ go(1); }
		function goLast(){ go(pages()); }
		if(numsWrap){
			numsWrap.addEventListener('click', function(e){
				var b = e.target.closest('button.page-btn');
				if(!b) return;
				var p = parseInt(b.dataset.page, 10);
				if(!isNaN(p)) go(p);
			});
		}
		if(btnFirst) btnFirst.addEventListener('click', goFirst);
		if(btnPrev) btnPrev.addEventListener('click', function(){ goDelta(-1); });
		if(btnNext) btnNext.addEventListener('click', function(){ goDelta(1); });
		if(btnLast) btnLast.addEventListener('click', goLast);

		function updateEmpty(){
			try{
				var has = !!tbody.querySelector('tr');
				if(emptyEl){ emptyEl.hidden = has; emptyEl.style.display = has ? 'none' : ''; }
			}catch(_){ if(emptyEl){ emptyEl.hidden = false; emptyEl.style.display = ''; } }
			if(csvBtn){
				try{
					var hasAny = !!tbody.querySelector('tr');
					csvBtn.disabled = !hasAny;
					csvBtn.setAttribute('aria-disabled', (!hasAny).toString());
					csvBtn.title = hasAny ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
				}catch(_e){ }
			}
			renderPage();
		}

		
		if(selectAll){
			selectAll.addEventListener('change', function(){
				var checks = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check:not([disabled])');
				checks.forEach(function(c){
					c.checked = !!selectAll.checked;
					var tr = c.closest('tr');
					if(tr) tr.classList.toggle('selected', !!c.checked);
				});
			});
		}
		table.addEventListener('click', function(ev){
			var isControl = ev.target.closest('button, a, input, select, textarea, label');
			var onCheckbox = ev.target.closest('input[type="checkbox"].hw-row-check');
			if(isControl && !onCheckbox) return;
			if(onCheckbox) return;
			var tr = ev.target.closest('tr');
			if(!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase() !== 'tbody') return;
			var hidden = tr.hasAttribute('data-hidden') || tr.style.display === 'none';
			if(hidden) return;
			var cb = tr.querySelector('.hw-row-check');
			if(!cb || cb.disabled) return;
			cb.checked = !cb.checked;
			tr.classList.toggle('selected', cb.checked);
			if(selectAll){
				var vis = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check');
				if(vis.length) selectAll.checked = Array.prototype.every.call(vis, function(c){ return c.checked; });
			}
		});
		table.addEventListener('change', function(ev){
			var cb = ev.target.closest('.hw-row-check');
			if(!cb) return;
			if(cb.disabled) return;
			var tr = cb.closest('tr');
			if(tr){
				var hidden = tr.hasAttribute('data-hidden') || tr.style.display === 'none';
				tr.classList.toggle('selected', !!cb.checked && !hidden);
			}
			if(selectAll){
				var vis = table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check');
				if(vis.length) selectAll.checked = Array.prototype.every.call(vis, function(c){ return c.checked; });
				else selectAll.checked = false;
			}
		});

		
		function visibleRows(){
			return Array.from(tbody.querySelectorAll('tr')).filter(function(tr){
				return !(tr.hasAttribute('data-hidden') || tr.style.display === 'none');
			});
		}
		function savedVisibleRows(){ return visibleRows().filter(isRowSaved); }

	// Delete confirmation modal
		var _mgrDeleteResolve=null;
		function confirmMgrDelete(msg){
			return new Promise(function(resolve){
				_mgrDeleteResolve=resolve;
				var modal=document.getElementById('mgr-delete-modal');
				var msgEl=document.getElementById('mgr-delete-msg');
				if(msgEl) msgEl.textContent=msg||'이 담당자를 삭제하시겠습니까?';
				if(modal){ document.body.classList.add('modal-open'); modal.classList.add('show'); modal.setAttribute('aria-hidden','false'); }
			});
		}
		function _resolveMgrDelete(val){
			var modal=document.getElementById('mgr-delete-modal');
			if(modal){ modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show'))document.body.classList.remove('modal-open'); }
			if(_mgrDeleteResolve){ _mgrDeleteResolve(val); _mgrDeleteResolve=null; }
		}
		(function _wireMgrDeleteModal(){
			var ok=document.getElementById('mgr-delete-confirm');
			var cancel=document.getElementById('mgr-delete-cancel');
			var close=document.getElementById('mgr-delete-close');
			var modal=document.getElementById('mgr-delete-modal');
			if(ok) ok.addEventListener('click',function(){ _resolveMgrDelete(true); });
			if(cancel) cancel.addEventListener('click',function(){ _resolveMgrDelete(false); });
			if(close) close.addEventListener('click',function(){ _resolveMgrDelete(false); });
			if(modal) modal.addEventListener('click',function(e){ if(e.target===modal) _resolveMgrDelete(false); });
			document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&modal&&modal.classList.contains('show')) _resolveMgrDelete(false); });
		})();

	// CSV

	

	
		function 
	
exportCSV(onlySelected){
			var isVendor = isVendorPage();
			var headers = isVendor ? ['이름','역할','연락처','이메일','담당여부','비고'] : ['소속','이름','담당','연락처','이메일','비고'];
			var trs = savedVisibleRows();
			if(onlySelected){
				trs = trs.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; });
			}
			if(trs.length === 0) return;
			function text(tr, col){
				var td = tr.querySelector('[data-col="' + col + '"]');
				return td ? String(td.textContent || '').trim() : '';
			}
			var cols = isVendor ? ['name','role','phone','email','is_primary','remark'] : ['org','name','role','phone','email','remark'];
			var dataRows = trs.map(function(tr){ return cols.map(function(c){ return text(tr,c); }); });
			var lines = [headers].concat(dataRows).map(function(arr){ return arr.map(escapeCSV).join(','); });
			var csv = '\uFEFF' + lines.join('\r\n');
			var d = new Date();
			var yyyy = d.getFullYear();
			var mm = String(d.getMonth()+1).padStart(2,'0');
			var dd = String(d.getDate()).padStart(2,'0');
			var filename = (cfg.filePrefix || 'manager_') + yyyy + mm + dd + '.csv';
			try{
				var blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
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
		(function wireCsvModal(){
			var btn = csvBtn;
			var modalId = 'hw-download-modal';
			var closeBtn = document.getElementById('hw-download-close');
			var confirmBtn = document.getElementById('hw-download-confirm');

	// Modal

	

	

	
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
				if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open');
			}
			if(btn){
				btn.addEventListener('click', function(){
					if(btn.disabled) return;
					var saved = savedVisibleRows();
					var totalSaved = saved.length;
					if(totalSaved <= 0) return;
					var selectedCount = saved.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb && cb.checked; }).length;
					var subtitle = document.getElementById('hw-download-subtitle');
					if(subtitle){
						subtitle.textContent = selectedCount > 0
							? ('선택된 ' + selectedCount + '개 또는 전체 ' + totalSaved + '개 결과 중 범위를 선택하세요.')
							: ('현재 결과 ' + totalSaved + '개 항목을 CSV로 내보냅니다.');
					}
					var rowSelectedWrap = document.getElementById('hw-csv-range-row-selected');
					var optSelected = document.getElementById('hw-csv-range-selected');
					var optAll = document.getElementById('hw-csv-range-all');
					if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount > 0);
					if(optSelected){ optSelected.disabled = !(selectedCount > 0); optSelected.checked = (selectedCount > 0); }
					if(optAll){ optAll.checked = !(selectedCount > 0); }
					openModalLocal(modalId);
				});
			}
			if(closeBtn) closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); });
			var modalEl = document.getElementById(modalId);
			if(modalEl){
				modalEl.addEventListener('click', function(e){ if(e.target === modalEl) closeModalLocal(modalId); });
				if(!_docListenersRegistered){
					document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); });
				}
			}
			if(confirmBtn){
				confirmBtn.addEventListener('click', function(){
					var onlySel = !!(document.getElementById('hw-csv-range-selected') && document.getElementById('hw-csv-range-selected').checked);
					exportCSV(onlySel);
					closeModalLocal(modalId);
				});
			}
		})();

		/* ── 이메일 전송 버튼 ─────────────────────────── */
		if(emailSendBtn && cfg.kind === 'workgroup'){
			emailSendBtn.addEventListener('click', function(){
				var allRows = Array.from(tbody.querySelectorAll('tr'));
				var recipients = [];
				allRows.forEach(function(tr){
					var priTd = tr.querySelector('[data-col="is_primary"]');
					if(!priTd) return;
					var priText = String(priTd.textContent || '').trim();
					if(priText !== 'O') return;
					var emailTd = tr.querySelector('[data-col="email"]');
					if(!emailTd) return;
					var email = String(emailTd.textContent || '').trim();
					if(email && email !== '-') recipients.push(email);
				});
				recipients = recipients.filter(function(v,i,a){ return a.indexOf(v) === i; });
				if(!recipients.length){
					showMgModal('수신여부가 "O"인 담당자 중 이메일이 있는 항목이 없습니다.', '알림');
					return;
				}
				var toStr = recipients.join(',');
				var composeUrl = '/p/compose-email?to=' + encodeURIComponent(toStr);
				window.open(composeUrl, '_blank', 'width=900,height=700,scrollbars=yes,resizable=yes');
			});
		}

		function listUrl(){
			return cfg.apiBase + '/' + encodeURIComponent(String(cfg.id)) + '/managers';
		}
		function itemUrl(mid){
			return cfg.apiBase + '/' + encodeURIComponent(String(cfg.id)) + '/managers/' + encodeURIComponent(String(mid));
		}

		function renderSimpleRow(item){
			var tr = document.createElement('tr');
			setManagerId(tr, item && item.id != null ? item.id : null);
			function cell(val){
				var s = String(val == null ? '' : val).trim();
				return s.length ? escapeHtml(s) : '-';
			}
			var vendorPage = isVendorPage();
			if(vendorPage){
				var isPri = !!(item && item.is_primary);
				tr.innerHTML = ''
					+ '<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>'
					+ '<td data-col="name">' + cell(item && item.name) + '</td>'
					+ '<td data-col="role">' + cell(item && item.role) + '</td>'
					+ '<td data-col="phone">' + cell(item && item.phone) + '</td>'
					+ '<td data-col="email">' + cell(item && item.email) + '</td>'
					+ '<td data-col="is_primary"><span class="cell-ox with-badge"><span class="ox-badge ' + (isPri ? 'on' : 'off') + '">' + (isPri ? 'O' : 'X') + '</span></span></td>'
					+ '<td data-col="remark">' + cell(item && item.remark) + '</td>'
					+ '<td class="system-actions table-actions">'
					+   '<button class="action-btn js-mg-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'
					+   '<button class="action-btn danger js-mg-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
					+ '</td>';
			} else {
				tr.innerHTML = ''
					+ '<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>'
					+ '<td data-col="org">' + cell(item && item.org) + '</td>'
					+ '<td data-col="name">' + cell(item && item.name) + '</td>'
					+ '<td data-col="role">' + cell(item && item.role) + '</td>'
					+ '<td data-col="phone">' + cell(item && item.phone) + '</td>'
					+ '<td data-col="email">' + cell(item && item.email) + '</td>'
					+ '<td data-col="remark">' + cell(item && item.remark) + '</td>'
					+ '<td class="system-actions table-actions">'
					+   '<button class="action-btn js-mg-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'
					+   '<button class="action-btn danger js-mg-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
					+ '</td>';
			}
			return tr;
		}

		function renderWorkgroupRow(item){
			var tr = document.createElement('tr');
			setManagerId(tr, item && item.id != null ? item.id : null);
			if(item && item.department_id != null) tr.setAttribute('data-dept-id', String(item.department_id));
			if(item && item.user_id != null) tr.setAttribute('data-user-id', String(item.user_id));
			function v(k){
				var s = String(item && item[k] == null ? '' : item[k]).trim();
				return s.length ? escapeHtml(s) : '-';
			}
			var isPri = !!(item && item.is_primary);
			tr.innerHTML = ''
				+ '<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>'
				+ '<td data-col="org"' + (item && item.department_id != null ? (' data-dept-id="' + escapeHtml(String(item.department_id)) + '"') : '') + '>' + v('org') + '</td>'
				+ '<td data-col="name"' + (item && item.user_id != null ? (' data-user-id="' + escapeHtml(String(item.user_id)) + '"') : '') + '>' + v('name') + '</td>'
				+ '<td data-col="role">' + v('role') + '</td>'
				+ '<td data-col="phone">' + v('phone') + '</td>'
				+ '<td data-col="email">' + v('email') + '</td>'
				+ '<td data-col="is_primary"><span class="cell-ox with-badge"><span class="ox-badge ' + (isPri ? 'on' : 'off') + '">' + (isPri ? 'O' : 'X') + '</span></span></td>'
				+ '<td data-col="remark">' + v('remark') + '</td>'
				+ '<td class="system-actions table-actions">'
				+   '<button class="action-btn js-mg-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'
				+   '<button class="action-btn danger js-mg-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
				+ '</td>';
			return tr;
		}

		async function loadRows(){
			if(!cfg.id){
				tbody.innerHTML = '';
				updateEmpty();
				return;
			}
			try{
				var res = await apiRequestJson(listUrl(), { method:'GET' });
				var items = normalizeItems(res);
				tbody.innerHTML = '';
				items.forEach(function(it){
					tbody.appendChild(cfg.kind === 'workgroup' ? renderWorkgroupRow(it) : renderSimpleRow(it));
				});
				updateEmpty();
			}catch(e){
				try{ console.error('[tab42-manager] loadRows failed', e); }catch(_){ }
				toast(cfg.label + ' 담당자 목록을 불러오지 못했습니다.', 'error');
				tbody.innerHTML = '';
				updateEmpty();
			}
		}

		
		var wgLookups = cfg.kind === 'workgroup' ? new WorkgroupLookups(cfg) : null;
		if(addBtn){
			addBtn.addEventListener('click', function(){
				if(!cfg.id){
					showMgModal('상세 ID가 없습니다. 목록에서 다시 진입하세요.', '알림');
					return;
				}
				var tr = document.createElement('tr');
				if(cfg.kind === 'workgroup'){
					tr.innerHTML = ''
						+ '<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>'
						+ '<td data-col="org"></td>'
						+ '<td data-col="name"></td>'
						+ '<td data-col="role"><input type="text" placeholder="역할"></td>'
						+ '<td data-col="phone"><span class="mg-auto-text">-</span></td>'
						+ '<td data-col="email"><span class="mg-auto-text">-</span></td>'
						+ '<td data-col="is_primary"><select class="form-input"><option value="O">O</option><option value="X" selected>X</option></select></td>'
						+ '<td data-col="remark"><input type="text" placeholder="비고"></td>'
						+ '<td class="system-actions table-actions">'
						+   '<button class="action-btn js-mg-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>'
						+   '<button class="action-btn danger js-mg-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
						+ '</td>';
					tbody.appendChild(tr);
					setRowEditing(tr, true);
					(async function(){
						try{
							var depts = await wgLookups.ensureDepartments();
							var orgTd = tr.querySelector('[data-col="org"]');
							if(orgTd){
								orgTd.innerHTML = buildDeptSelectHtml(depts, null);
							}
							var nameTd = tr.querySelector('[data-col="name"]');
							if(nameTd){
								nameTd.innerHTML = buildUserSelectHtml([], null);
							}

							try{ window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance && window.BlossomSearchableSelect.enhance(table); }catch(_e){ }

							var deptSel = orgTd ? orgTd.querySelector('select[data-mg-select="dept"]') : null;
							if(deptSel){
								deptSel.addEventListener('change', function(){
									clearAutoContacts(tr);
									var did = deptSel.value;
									(async function(){
										try{
											var users = await wgLookups.ensureUsersForDept(did);
											if(nameTd){
												nameTd.innerHTML = buildUserSelectHtml(users, null);
												try{ window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance && window.BlossomSearchableSelect.enhance(table); }catch(_e2){ }
												var userSel = nameTd.querySelector('select[data-mg-select="user"]');
												if(userSel){
													userSel.addEventListener('change', function(){ applyAutoContacts(tr, users, userSel.value); });
												}
											}
										}catch(_){
											if(nameTd) nameTd.innerHTML = buildUserSelectHtml([], null);
										}
									})();
								});
							}
						}catch(_){ }
					})();
				} else {
					var vendorPage = isVendorPage();
					if(vendorPage){
						tr.innerHTML = ''
							+ '<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>'
							+ '<td data-col="name"><input type="text" placeholder="이름"></td>'
							+ '<td data-col="role"><input type="text" placeholder="역할"></td>'
							+ '<td data-col="phone"><input type="text" placeholder="연락처" oninput="this.value=this.value.replace(/[^0-9\\-]/g,\'\')"></td>'
							+ '<td data-col="email"><input type="email" placeholder="이메일"></td>'
							+ '<td data-col="is_primary"><select class="form-input"><option value="O">O</option><option value="X" selected>X</option></select></td>'
							+ '<td data-col="remark"><input type="text" placeholder="비고"></td>'
							+ '<td class="system-actions table-actions">'
							+   '<button class="action-btn js-mg-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>'
							+   '<button class="action-btn danger js-mg-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
							+ '</td>';
					} else {
						tr.innerHTML = ''
							+ '<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>'
							+ '<td data-col="org"><input type="text" placeholder="소속"></td>'
							+ '<td data-col="name"><input type="text" placeholder="이름"></td>'
							+ '<td data-col="role"><input type="text" placeholder="담당"></td>'
							+ '<td data-col="phone"><input type="text" placeholder="연락처" oninput="this.value=this.value.replace(/[^0-9\\-]/g,\'\')"></td>'
							+ '<td data-col="email"><input type="email" placeholder="이메일"></td>'
							+ '<td data-col="remark"><input type="text" placeholder="비고"></td>'
							+ '<td class="system-actions table-actions">'
							+   '<button class="action-btn js-mg-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>'
							+   '<button class="action-btn danger js-mg-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
							+ '</td>';
					}
					tbody.appendChild(tr);
					setRowEditing(tr, true);
				}

				try{ goLast(); }catch(_){ }
				updateEmpty();
			});
		}

		
		table.addEventListener('click', function(ev){
			var target = ev.target.closest('.js-mg-del, .js-mg-toggle');
			if(!target) return;
			var tr = ev.target.closest('tr');
			if(!tr) return;

			
			if(target.classList.contains('js-mg-del')){
				(async function(){
					var mid = getManagerId(tr);
					if(!mid){
						if(tr && tr.parentNode) tr.parentNode.removeChild(tr);
						clampPage();
						updateEmpty();
						return;
					}
					var ok = await confirmMgrDelete('이 담당자를 삭제하시겠습니까?');
					if(!ok) return;
					try{
						if(!cfg.id) throw new Error('상세 ID가 없습니다.');
						var payload = null;
						if(cfg.includeActorUserId){
							var actorId = await getSessionUserId();
							if(actorId) payload = { actor_user_id: actorId };
						}
						var res = await apiRequestJson(itemUrl(mid), { method:'DELETE', body: payload ? JSON.stringify(payload) : undefined });
						if(res && res.success === false) throw new Error((res && res.message) || '삭제 실패');
						if(tr && tr.parentNode) tr.parentNode.removeChild(tr);
						clampPage();
						updateEmpty();
					}catch(e){
						showMgModal(e && e.message ? e.message : '삭제 중 오류가 발생했습니다.', '오류');
					}
				})();
				return;
			}

			
			if(target.classList.contains('js-mg-toggle')){
				var mode = target.getAttribute('data-action') || 'edit';
				if(mode === 'edit'){
					if(cfg.kind === 'workgroup'){
						var orgTd = tr.querySelector('[data-col="org"]');
						var nameTd = tr.querySelector('[data-col="name"]');
						var deptId = (orgTd && (orgTd.getAttribute('data-dept-id') || tr.getAttribute('data-dept-id'))) || null;
						var userId = (nameTd && (nameTd.getAttribute('data-user-id') || tr.getAttribute('data-user-id'))) || null;
						(async function(){
							try{
								var depts = await wgLookups.ensureDepartments();
								if(orgTd){ orgTd.innerHTML = buildDeptSelectHtml(depts, deptId); }
								if(nameTd){
									var users = deptId ? await wgLookups.ensureUsersForDept(deptId) : [];
									nameTd.innerHTML = buildUserSelectHtml(users, userId);
									var userSel = nameTd.querySelector('select[data-mg-select="user"]');
									if(userSel){
										userSel.addEventListener('change', function(){
											applyAutoContacts(tr, users, userSel.value);
										});
										applyAutoContacts(tr, users, userSel.value);
									}
								}
								
								var deptSel = orgTd ? orgTd.querySelector('select[data-mg-select="dept"]') : null;
								if(deptSel){
									deptSel.addEventListener('change', function(){
										clearAutoContacts(tr);
										var did = deptSel.value;
										(async function(){
											try{
												var users2 = await wgLookups.ensureUsersForDept(did);
												if(nameTd){
													nameTd.innerHTML = buildUserSelectHtml(users2, null);
													try{ window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance && window.BlossomSearchableSelect.enhance(table); }catch(_e2){ }
													var userSel2 = nameTd.querySelector('select[data-mg-select="user"]');
													if(userSel2){
														userSel2.addEventListener('change', function(){ applyAutoContacts(tr, users2, userSel2.value); });
													}
												}
											}catch(_){ if(nameTd) nameTd.innerHTML = buildUserSelectHtml([], null); }
										})();
									});
								}
								try{ window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance && window.BlossomSearchableSelect.enhance(table); }catch(_e){ }
							}catch(_){
								if(orgTd) orgTd.innerHTML = buildDeptSelectHtml([], deptId);
								if(nameTd) nameTd.innerHTML = buildUserSelectHtml([], userId);
							}
							/* role, is_primary, remark → editable; phone/email → auto-text */
							['role','remark'].forEach(function(cn){
								var td = tr.querySelector('[data-col="'+cn+'"]');
								if(!td) return;
								var cur = String(td.textContent||'').trim(); if(cur==='-') cur='';
								var ph = cn==='role'?'역할':'비고';
								td.innerHTML = '<input type="text" value="'+escapeHtml(cur)+'" placeholder="'+ph+'">';
							});
							var isPriTd = tr.querySelector('[data-col="is_primary"]');
							if(isPriTd){
								var curPri = String(isPriTd.textContent||'').trim();
								var pv = (curPri==='O')?'O':'X';
								isPriTd.innerHTML = '<select class="form-input"><option value="O"'+(pv==='O'?' selected':'')+'>O</option><option value="X"'+(pv==='X'?' selected':'')+'>X</option></select>';
							}
							['phone','email'].forEach(function(cn){
								var td = tr.querySelector('[data-col="'+cn+'"]');
								if(!td) return;
								var cur = String(td.textContent||'').trim(); if(cur==='-') cur='';
								td.innerHTML = '<span class="mg-auto-text">'+escapeHtml(cur||'-')+'</span>';
							});
							target.setAttribute('data-action','save');
							target.title = '저장';
							target.setAttribute('aria-label','저장');
							target.innerHTML = '<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
							setRowEditing(tr, true);
						})();
					} else {
					var vendorPage = isVendorPage();
					if(vendorPage){
						['name','role','phone','email','is_primary','remark'].forEach(function(name){
							var td = tr.querySelector('[data-col="' + name + '"]');
							if(!td) return;
							var current = String(td.textContent || '').trim();
							if(current === '-') current = '';
							if(name === 'email') td.innerHTML = '<input type="email" value="' + escapeHtml(current) + '" placeholder="이메일">';
							else if(name === 'phone') td.innerHTML = '<input type="text" value="' + escapeHtml(current) + '" placeholder="연락처" oninput="this.value=this.value.replace(/[^0-9\\-]/g,\'\')">'; 
							else if(name === 'is_primary'){
								var curVal = (current === 'O') ? 'O' : 'X';
								td.innerHTML = '<select class="form-input"><option value="O"' + (curVal==='O'?' selected':'') + '>O</option><option value="X"' + (curVal==='X'?' selected':'') + '>X</option></select>';
							}
							else {
								var ph = (name === 'name') ? '이름' : (name === 'role') ? '역할' : (name === 'remark') ? '비고' : '';
								td.innerHTML = '<input type="text" value="' + escapeHtml(current) + '" placeholder="' + escapeHtml(ph) + '">';
							}
						});
					} else {
						['org','name','role','phone','email','remark'].forEach(function(name){
							var td = tr.querySelector('[data-col="' + name + '"]');
							if(!td) return;
							var current = String(td.textContent || '').trim();
							if(current === '-') current = '';
							if(name === 'email') td.innerHTML = '<input type="email" value="' + escapeHtml(current) + '" placeholder="이메일">';
							else if(name === 'phone') td.innerHTML = '<input type="text" value="' + escapeHtml(current) + '" placeholder="연락처" oninput="this.value=this.value.replace(/[^0-9\\-]/g,\'\')">'; 
							else {
								var ph = (name === 'org') ? '소속' : (name === 'name') ? '이름' : (name === 'role') ? '담당' : (name === 'remark') ? '비고' : '';
								td.innerHTML = '<input type="text" value="' + escapeHtml(current) + '" placeholder="' + escapeHtml(ph) + '">';
							}
						});
					}

					target.setAttribute('data-action','save');
					target.title = '저장';
					target.setAttribute('aria-label','저장');
					target.innerHTML = '<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
					setRowEditing(tr, true);
					return;
					}
				}

				if(mode === 'save'){
					(async function(){
						try{
							if(!cfg.id) throw new Error('상세 ID가 없습니다.');

							
							(function(){
								var emailTd = tr.querySelector('[data-col="email"]');
								var emailInput = emailTd ? emailTd.querySelector('input') : null;
								if(!emailInput) return;
								var emailVal = String(emailInput.value || '').trim();
								if(!emailVal) return;
								if(typeof emailInput.checkValidity === 'function' && !emailInput.checkValidity()){
									showMgModal('이메일 형식이 올바르지 않습니다.', '알림');
									try{ emailInput.focus(); }catch(_){ }
									throw new Error('__MG_EMAIL_INVALID__');
								}
							})();

							var mid = getManagerId(tr);
							var method = mid ? 'PUT' : 'POST';
							var url = mid ? itemUrl(mid) : listUrl();

							var payload;
							if(cfg.kind === 'workgroup'){
								var orgTd = tr.querySelector('[data-col="org"]');
								var nameTd = tr.querySelector('[data-col="name"]');
								var deptSel = orgTd ? orgTd.querySelector('select[data-mg-select="dept"]') : null;
								var userSel = nameTd ? nameTd.querySelector('select[data-mg-select="user"]') : null;
								var deptId = deptSel ? coerceInt(deptSel.value) : coerceInt(orgTd && orgTd.getAttribute('data-dept-id'));
								var userId = userSel ? coerceInt(userSel.value) : coerceInt(nameTd && nameTd.getAttribute('data-user-id'));
								if(!userId){
									try{ if(userSel) userSel.focus(); }catch(_f){}
									throw new Error('이름(사용자)을 선택하세요.');
								}
								function readText(col){
									var td = tr.querySelector('[data-col="' + col + '"]');
									if(!td) return '';
									var inp = td.querySelector('input');
									if(inp) return String(inp.value || '').trim();
									var sel = td.querySelector('select');
									if(sel) return String(sel.value || '').trim();
									var text = String(td.textContent || '').trim();
									return text === '-' ? '' : text;
								}
								var priVal = readText('is_primary');
								payload = {
									department_id: deptId,
									user_id: userId,
									role: readText('role'),
									phone: readText('phone'),
									email: readText('email'),
									is_primary: (priVal === 'O'),
									remark: readText('remark')
								};
							} else {
								function readVal(name){
									var td = tr.querySelector('[data-col="' + name + '"]');
									if(!td) return '';
									var input = td.querySelector('input');
									var sel = td.querySelector('select');
									if(input) return String(input.value || '').trim();
									if(sel) return String(sel.value || '').trim();
									return String(td.textContent || '').trim();
								}
								var vendorPage = isVendorPage();
								if(vendorPage){
									var priVal = readVal('is_primary');
									payload = {
										name: readVal('name') || null,
										role: readVal('role') || null,
										phone: readVal('phone') || null,
										email: readVal('email') || null,
										is_primary: (priVal === 'O'),
										remark: readVal('remark') || null
									};
								} else {
									payload = {
										org: readVal('org') || null,
										name: readVal('name') || null,
										role: readVal('role') || null,
										phone: readVal('phone') || null,
										email: readVal('email') || null,
										remark: readVal('remark') || null
									};
								}
								if(cfg.includeActorUserId){
									var actorId = await getSessionUserId();
									if(actorId) payload.actor_user_id = actorId;
								}
							}

							var res = await apiRequestJson(url, { method: method, body: JSON.stringify(payload) });
							if(res && res.success === false) throw new Error((res && res.message) || '저장 실패');
							var item = normalizeItem(res) || (res && res.item) || (res || {});

							if(item && item.id != null) setManagerId(tr, item.id);

							function commitCell(col, value){
								var td = tr.querySelector('[data-col="' + col + '"]');
								if(!td) return;
								var v = String(value == null ? '' : value).trim();
								td.textContent = v.length ? v : '-';
							}

							if(cfg.kind === 'workgroup'){
								commitCell('org', item.org);
								commitCell('name', item.name);
								commitCell('role', item.role);
								commitCell('phone', item.phone);
								commitCell('email', item.email);
								var wgPriTd = tr.querySelector('[data-col="is_primary"]');
								if(wgPriTd){
									var wgIsPri = !!(item && item.is_primary);
									wgPriTd.innerHTML = '<span class="cell-ox with-badge"><span class="ox-badge ' + (wgIsPri ? 'on' : 'off') + '">' + (wgIsPri ? 'O' : 'X') + '</span></span>';
								}
								commitCell('remark', item.remark);
								if(item.department_id != null){
									tr.setAttribute('data-dept-id', String(item.department_id));
									var orgTd2 = tr.querySelector('[data-col="org"]');
									if(orgTd2) orgTd2.setAttribute('data-dept-id', String(item.department_id));
								}
								if(item.user_id != null){
									tr.setAttribute('data-user-id', String(item.user_id));
									var nameTd2 = tr.querySelector('[data-col="name"]');
									if(nameTd2) nameTd2.setAttribute('data-user-id', String(item.user_id));
								}
							} else {
								if(isVendorPage()){
									['name','role','phone','email','remark'].forEach(function(c){
										commitCell(c, (item && item[c] != null) ? item[c] : (payload && payload[c]));
									});
									var priTd = tr.querySelector('[data-col="is_primary"]');
									if(priTd){
										var isPri = !!(item && item.is_primary);
										priTd.innerHTML = '<span class="cell-ox with-badge"><span class="ox-badge ' + (isPri ? 'on' : 'off') + '">' + (isPri ? 'O' : 'X') + '</span></span>';
									}
								} else {
									['org','name','role','phone','email','remark'].forEach(function(c){
										commitCell(c, (item && item[c] != null) ? item[c] : (payload && payload[c]));
									});
								}
							}

							target.setAttribute('data-action','edit');
							target.title = '편집';
							target.setAttribute('aria-label','편집');
							target.innerHTML = '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
							setRowEditing(tr, false);
							updateEmpty();
						}catch(e){
							if(e && e.message === '__MG_EMAIL_INVALID__') return;
							showMgModal(e && e.message ? e.message : '저장 중 오류가 발생했습니다.', '오류');
						}
					})();
					return;
				}
			}
		});

		updateEmpty();
		loadRows();
		_docListenersRegistered = true;
	});
})();

