/*
 * tab92-employee-shared.js
 * Work group employee tab behavior.
 */

(function(){
	'use strict';

	

	

	

	// Utilities
	var _docListenersRegistered = false;
	var _workgroupRoleOptions = null;
	var _workgroupRoleOptionsPromise = null;
	var _workgroupRoleAdmin = false;
	var _workgroupRoleAdminLoaded = false;
	var _workgroupRoleAdminPromise = null;

	function ready(fn){
		if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
		else fn();
		// SPA re-entry: run fn again when blossom swaps the page
		document.addEventListener('blossom:pageLoaded', function(){
			if(document.body.classList.contains('page-workgroup-manager')){
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
		options.headers = Object.assign({ 'Accept':'application/json', 'X-Requested-With':'XMLHttpRequest' }, options.headers || {});
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

	async function ensureWorkgroupRoleAdmin(){
		if(_workgroupRoleAdminLoaded) return _workgroupRoleAdmin;
		if(_workgroupRoleAdminPromise) return _workgroupRoleAdminPromise;
		_workgroupRoleAdminPromise = (async function(){
			try{
				var res = await apiRequestJson('/api/me/profile', { method:'GET' });
				var user = (res && (res.user || res.item || res.profile)) || {};
				_workgroupRoleAdmin = !!(res && (res.is_admin || res.admin || res.is_super_admin || user.is_admin || user.admin || user.is_super_admin));
			}catch(_){
				_workgroupRoleAdmin = false;
			}
			_workgroupRoleAdminLoaded = true;
			_workgroupRoleAdminPromise = null;
			return _workgroupRoleAdmin;
		})();
		return _workgroupRoleAdminPromise;
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
		return false;
	}

	function inferConfig(){
		var body = document.body;
		var cls = body && body.classList ? body.classList : null;
		var isWorkGroup = !!(cls && cls.contains('page-workgroup-manager'));

		if(isWorkGroup){
			return {
				kind: 'workgroup',
				label: '업무 그룹',
				apiBase: '/api/work-groups',
				id: getQueryParamInt(['id','group_id','groupId']) || getVendorIdFromSessionStorage('work_group_selected_row') || parseInt(document.body.getAttribute('data-cat-detail-id'),10) || 0,
				includeActorUserId: false,
				filePrefix: 'workgroup_manager_',
				lookups: { orgDepartments: '/api/org-departments', userProfiles: '/api/user-profiles', managerRoles: '/api/work-groups/manager-roles' }
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
		this.roles = null;
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
	WorkgroupLookups.prototype.ensureRoles = async function(force){
		if(this.roles && !force) return this.roles;
		var url = (this.cfg.lookups && this.cfg.lookups.managerRoles) || '/api/work-groups/manager-roles';
		var res = await apiRequestJson(url + '?_=' + Date.now(), { method:'GET' });
		if(!res || res.success === false) throw new Error((res && res.message) || '역할 목록 조회 실패');
		var items = Array.isArray(res.items) ? res.items : (Array.isArray(res.rows) ? res.rows : []);
		items = items.filter(function(r){ return r && (r.id != null) && String(r.name || r.role_name || '').trim(); });
		items.sort(function(a,b){
			var as = coerceInt(a.sort_order) || 0;
			var bs = coerceInt(b.sort_order) || 0;
			if(as !== bs) return as - bs;
			return String(a.name || a.role_name || '').localeCompare(String(b.name || b.role_name || ''),'ko-KR');
		});
		this.roles = items;
		_workgroupRoleOptions = items;
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
	function roleNameOf(role){
		return String((role && (role.name || role.role_name || role.label || role.value)) || '').trim();
	}
	function normalizeRoleList(value){
		var source = [];
		if(Array.isArray(value)) source = value;
		else if(value && Array.isArray(value.roles)) source = value.roles;
		else if(value && Array.isArray(value.role_ids)){
			var byId = {};
			(_workgroupRoleOptions || []).forEach(function(role){ byId[String(role.id)] = role; });
			source = value.role_ids.map(function(id){ return byId[String(id)] || { id:id, name:'' }; });
		} else if(value && value.role){
			source = String(value.role).split(/[,/|;\n]+/).map(function(name){ return { id:null, name:name }; });
		}
		var roles = [];
		var seen = {};
		(source || []).forEach(function(role){
			var id = role && role.id != null ? String(role.id) : '';
			var name = roleNameOf(role);
			if(!name && id){
				(_workgroupRoleOptions || []).some(function(opt){
					if(String(opt.id) === id){ name = roleNameOf(opt); return true; }
					return false;
				});
			}
			if(!name) return;
			var key = id || name;
			if(seen[key]) return;
			seen[key] = true;
			roles.push({ id: id ? coerceInt(id) : null, name: name });
		});
		return roles;
	}
	function setRoleData(tr, item){
		if(!tr) return;
		var roles = normalizeRoleList(item || {});
		tr.setAttribute('data-role-ids', roles.filter(function(role){ return role.id != null; }).map(function(role){ return String(role.id); }).join(','));
		tr.setAttribute('data-role-names', roles.map(function(role){ return role.name; }).join('|'));
	}
	function rolesFromRow(tr){
		if(!tr) return [];
		var ids = String(tr.getAttribute('data-role-ids') || '').split(',').filter(Boolean);
		var names = String(tr.getAttribute('data-role-names') || '').split('|').filter(Boolean);
		var byId = {};
		(_workgroupRoleOptions || []).forEach(function(role){ byId[String(role.id)] = role; });
		var roles = ids.map(function(id){ return { id: coerceInt(id), name: roleNameOf(byId[String(id)]) }; }).filter(function(role){ return role.name; });
		if(!roles.length){
			roles = names.map(function(name){ return { id:null, name:name }; });
		}
		return normalizeRoleList(roles);
	}
	function renderRoleTagsHtml(value){
		var roles = normalizeRoleList(value);
		if(!roles.length) return '<span class="muted-cell">-</span>';
		var names = roles.map(function(role){ return role.name; });
		return '<span class="tab92-role-tags">' + escapeHtml(names.join(', ')) + '</span>';
	}
	function buildRolePickerSummaryHtml(selectedRoles){
		var roles = normalizeRoleList(selectedRoles);
		if(!roles.length) return '<span class="tab92-role-placeholder">역할 선택</span>';
		return renderRoleTagsHtml(roles);
	}
	function selectedRoleIdsFromPicker(root){
		if(!root) return [];
		var ids = [];
		Array.from(root.querySelectorAll('[data-role-check]:checked')).forEach(function(chk){
			var id = coerceInt(chk.value);
			if(id && ids.indexOf(id) < 0) ids.push(id);
		});
		return ids;
	}
	function selectedRolesFromIds(ids){
		var byId = {};
		(_workgroupRoleOptions || []).forEach(function(role){ byId[String(role.id)] = role; });
		return (ids || []).map(function(id){
			var role = byId[String(id)];
			return role ? { id:coerceInt(role.id), name:roleNameOf(role) } : null;
		}).filter(Boolean);
	}
	function buildRolePickerHtml(selectedRoles){
		var selected = normalizeRoleList(selectedRoles);
		var selectedIds = selected.filter(function(role){ return role.id != null; }).map(function(role){ return String(role.id); });
		var selectedNames = selected.map(function(role){ return role.name; });
		var options = _workgroupRoleOptions || [];
		var html = '<div class="tab92-role-picker" data-role-picker="1">';
		html += '<button type="button" class="tab92-role-toggle" data-role-toggle="1" aria-expanded="false">' + buildRolePickerSummaryHtml(selected) + '</button>';
		html += '<div class="tab92-role-menu" data-role-menu="1">';
		html += '<input type="search" class="tab92-role-search" data-role-search="1" placeholder="역할 검색" autocomplete="off">';
		html += '<div class="tab92-role-option-list">';
		if(!options.length){
			html += '<div class="tab92-role-empty">등록된 역할이 없습니다.</div>';
		}
		options.forEach(function(role){
			var id = String(role.id);
			var name = roleNameOf(role);
			var checked = selectedIds.indexOf(id) >= 0 || selectedNames.indexOf(name) >= 0;
			html += '<div class="tab92-role-option" data-role-option="1" data-role-label="' + escapeHtml(name.toLowerCase()) + '">';
			html += '<input type="checkbox" data-role-check="1" value="' + escapeHtml(id) + '"' + (checked ? ' checked' : '') + '>';
			html += '<span>' + escapeHtml(name) + '</span>';
			html += '</div>';
		});
		html += '</div>';
		html += '</div></div>';
		return html;
	}
	function updateRolePickerSummary(root){
		if(!root) return;
		var btn = root.querySelector('[data-role-toggle]');
		if(!btn) return;
		btn.innerHTML = buildRolePickerSummaryHtml(selectedRolesFromIds(selectedRoleIdsFromPicker(root)));
	}
	function wireRolePicker(td, wgLookups){
		var root = td && td.querySelector ? td.querySelector('[data-role-picker]') : null;
		if(!root || root.getAttribute('data-role-wired') === '1') return;
		root.setAttribute('data-role-wired','1');
		var toggle = root.querySelector('[data-role-toggle]');
		var search = root.querySelector('[data-role-search]');
		if(toggle){
			toggle.addEventListener('click', function(e){
				e.preventDefault();
				root.classList.toggle('is-open');
				toggle.setAttribute('aria-expanded', root.classList.contains('is-open') ? 'true' : 'false');
				if(root.classList.contains('is-open') && search) setTimeout(function(){ try{ search.focus(); }catch(_e){} }, 0);
			});
		}
		if(search){
			search.addEventListener('input', function(){
				var q = String(search.value || '').trim().toLowerCase();
				Array.from(root.querySelectorAll('[data-role-option]')).forEach(function(opt){
					var label = String(opt.getAttribute('data-role-label') || '');
					opt.style.display = (!q || label.indexOf(q) >= 0) ? '' : 'none';
				});
			});
		}
		Array.from(root.querySelectorAll('[data-role-check]')).forEach(function(chk){
			chk.addEventListener('change', function(){ updateRolePickerSummary(root); });
		});
		Array.from(root.querySelectorAll('[data-role-option]')).forEach(function(opt){
			opt.addEventListener('click', function(e){
				if(e.target && e.target.closest && e.target.closest('button, input')) return;
				var chk = opt.querySelector('[data-role-check]');
				if(chk){ chk.checked = !chk.checked; updateRolePickerSummary(root); }
			});
		});
	}
	function readRoleIds(tr){
		var picker = tr && tr.querySelector ? tr.querySelector('[data-role-picker]') : null;
		if(picker) return selectedRoleIdsFromPicker(picker);
		return String((tr && tr.getAttribute('data-role-ids')) || '').split(',').map(coerceInt).filter(function(id){ return id && id > 0; });
	}
	function trim(v){ return String(v == null ? '' : v).trim(); }
	function pickPhone(u){
		if(!u) return '';
		var phone = trim(u.phone);
		if(phone) return phone;
		phone = trim(u.ext_phone || u.extPhone);
		if(phone) return phone;
		phone = trim(u.mobile_phone || u.mobilePhone);
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
		var roleManageBtn = document.getElementById('mgr-role-manage-btn');
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
			var isControl = ev.target.closest('button, a, input, select, textarea, label, [data-role-picker]');
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
			if(modal && modal.getAttribute('data-tab92-wired') === '1') return;
			if(modal) modal.setAttribute('data-tab92-wired','1');
			if(ok) ok.addEventListener('click',function(){ _resolveMgrDelete(true); });
			if(cancel) cancel.addEventListener('click',function(){ _resolveMgrDelete(false); });
			if(close) close.addEventListener('click',function(){ _resolveMgrDelete(false); });
			if(modal) modal.addEventListener('click',function(e){ if(e.target===modal) _resolveMgrDelete(false); });
			document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&modal&&modal.classList.contains('show')) _resolveMgrDelete(false); });
		})();

		function collectEmailRecipients(){
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
			return recipients.filter(function(v,i,a){ return a.indexOf(v) === i; });
		}

		function setEmailStatus(msg, type){
			var status = document.getElementById('mgr-email-status');
			if(!status) return;
			status.textContent = msg || '';
			status.classList.remove('is-error');
			status.classList.remove('is-success');
			if(type === 'error') status.classList.add('is-error');
			if(type === 'success') status.classList.add('is-success');
		}

		function closeManagerEmailModal(){
			var modal = document.getElementById('mgr-email-modal');
			if(!modal) return;
			modal.classList.remove('show');
			modal.setAttribute('aria-hidden','true');
			if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open');
		}

		function defaultEmailSubject(){
			var title = getPageHeaderTitle() || '담당자';
			return '[blossom] ' + title + ' 담당자 안내';
		}

		function buildEmailHtml(message){
			var lines = String(message || '').replace(/\r\n/g, '\n').split('\n');
			return '<div>' + lines.map(function(line){ return escapeHtml(line); }).join('<br>') + '</div>';
		}

		function openManagerEmailModal(recipients){
			var modal = document.getElementById('mgr-email-modal');
			if(!modal){ showMgModal('메일 작성 화면을 열 수 없습니다.', '오류'); return; }
			var toInput = document.getElementById('mgr-email-to');
			var subjectInput = document.getElementById('mgr-email-subject');
			var bodyInput = document.getElementById('mgr-email-body');
			var sendBtn = document.getElementById('mgr-email-send-confirm');
			if(toInput) toInput.value = recipients.join(',');
			if(subjectInput) subjectInput.value = defaultEmailSubject();
			if(bodyInput) bodyInput.value = '';
			if(sendBtn) sendBtn.disabled = false;
			setEmailStatus('', '');
			document.body.classList.add('modal-open');
			modal.classList.add('show');
			modal.setAttribute('aria-hidden','false');
			setTimeout(function(){ try{ if(subjectInput) subjectInput.focus(); }catch(_e){} }, 0);
		}

		async function submitManagerEmail(){
			var toInput = document.getElementById('mgr-email-to');
			var subjectInput = document.getElementById('mgr-email-subject');
			var bodyInput = document.getElementById('mgr-email-body');
			var sendBtn = document.getElementById('mgr-email-send-confirm');
			var to = toInput ? String(toInput.value || '').trim() : '';
			var subject = subjectInput ? String(subjectInput.value || '').trim() : '';
			var message = bodyInput ? String(bodyInput.value || '').trim() : '';
			if(!to){ setEmailStatus('받는 사람을 입력하세요.', 'error'); if(toInput) toInput.focus(); return; }
			if(!message){ setEmailStatus('본문을 입력하세요.', 'error'); if(bodyInput) bodyInput.focus(); return; }
			if(sendBtn) sendBtn.disabled = true;
			setEmailStatus('메일을 보내는 중입니다.', '');
			try{
				var data = await apiRequestJson('/api/task/send-email', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ to: to, cc: '', subject: subject || defaultEmailSubject(), html: buildEmailHtml(message) })
				});
				if(data && data.success === false) throw new Error(data.message || '메일 발송에 실패했습니다.');
				setEmailStatus('메일이 발송되었습니다.', 'success');
				toast('메일이 발송되었습니다.', 'success');
				setTimeout(closeManagerEmailModal, 900);
			}catch(e){
				setEmailStatus(e && e.message ? e.message : '메일 발송 중 오류가 발생했습니다.', 'error');
				if(sendBtn) sendBtn.disabled = false;
			}
		}

		(function _wireManagerEmailModal(){
			var modal = document.getElementById('mgr-email-modal');
			if(!modal || modal.getAttribute('data-tab92-wired') === '1') return;
			modal.setAttribute('data-tab92-wired','1');
			var close = document.getElementById('mgr-email-close');
			var cancel = document.getElementById('mgr-email-cancel');
			var send = document.getElementById('mgr-email-send-confirm');
			if(close) close.addEventListener('click', closeManagerEmailModal);
			if(cancel) cancel.addEventListener('click', closeManagerEmailModal);
			if(send) send.addEventListener('click', submitManagerEmail);
			modal.addEventListener('click', function(e){ if(e.target === modal) closeManagerEmailModal(); });
			document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && modal.classList.contains('show')) closeManagerEmailModal(); });
		})();

		/* ── 사내메일 전송 버튼 ───────────────────────── */
		function renderRoleManageList(){
			var list = document.getElementById('mgr-role-list');
			if(!list) return;
			var roles = _workgroupRoleOptions || [];
			if(!roles.length){
				list.innerHTML = '<div class="tab92-role-modal-empty">등록된 역할이 없습니다.</div>';
				return;
			}
			list.innerHTML = roles.map(function(role){
				return '<div class="tab92-role-modal-item">' + escapeHtml(roleNameOf(role)) + '</div>';
			}).join('');
		}
		function setRoleStatus(msg, isError){
			var status = document.getElementById('mgr-role-status');
			if(!status) return;
			status.textContent = msg || '';
			status.classList.toggle('is-error', !!isError);
			status.classList.toggle('is-success', !!msg && !isError);
		}
		function refreshOpenRolePickers(){
			Array.from(document.querySelectorAll('#hw-spec-table [data-role-picker]')).forEach(function(root){
				var td = root.closest('[data-col="role"]');
				if(!td) return;
				var selectedIds = selectedRoleIdsFromPicker(root);
				td.innerHTML = buildRolePickerHtml(selectedRolesFromIds(selectedIds));
				wireRolePicker(td, wgLookups);
			});
		}
		async function openRoleManageModal(){
			var modal = document.getElementById('mgr-role-modal');
			if(!modal) return;
			setRoleStatus('', false);
			try{
				if(wgLookups) await wgLookups.ensureRoles(true);
			}catch(_){ }
			renderRoleManageList();
			var input = document.getElementById('mgr-role-name');
			if(input) input.value = '';
			document.body.classList.add('modal-open');
			modal.classList.add('show');
			modal.setAttribute('aria-hidden','false');
			setTimeout(function(){ try{ if(input) input.focus(); }catch(_e){} }, 0);
		}
		function closeRoleManageModal(){
			var modal = document.getElementById('mgr-role-modal');
			if(!modal) return;
			modal.classList.remove('show');
			modal.setAttribute('aria-hidden','true');
			if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open');
		}
		(function _wireRoleManageModal(){
			var modal = document.getElementById('mgr-role-modal');
			if(!modal || modal.getAttribute('data-tab92-wired') === '1') return;
			modal.setAttribute('data-tab92-wired','1');
			var close = document.getElementById('mgr-role-close');
			var cancel = document.getElementById('mgr-role-cancel');
			var add = document.getElementById('mgr-role-add-confirm');
			var input = document.getElementById('mgr-role-name');
			function submit(){
				(async function(){
					var name = input ? String(input.value || '').trim() : '';
					if(!name){
						setRoleStatus('역할명을 입력하세요.', true);
						if(input) input.focus();
						return;
					}
					if(add) add.disabled = true;
					setRoleStatus('', false);
					await apiRequestJson('/api/work-groups/manager-roles', {
						method:'POST',
						headers:{ 'Content-Type':'application/json' },
						body: JSON.stringify({ name: name })
					});
					if(wgLookups) await wgLookups.ensureRoles(true);
					renderRoleManageList();
					refreshOpenRolePickers();
					if(input) input.value = '';
					setRoleStatus('역할이 추가되었습니다.', false);
					if(input) input.focus();
				})().catch(function(err){
					setRoleStatus(err && err.message ? err.message : '역할 추가 중 오류가 발생했습니다.', true);
				}).finally(function(){
					if(add) add.disabled = false;
				});
			}
			if(close) close.addEventListener('click', closeRoleManageModal);
			if(cancel) cancel.addEventListener('click', closeRoleManageModal);
			if(add) add.addEventListener('click', submit);
			if(input){
				input.addEventListener('keydown', function(e){
					if(e.key === 'Enter'){
						e.preventDefault();
						submit();
					}
				});
			}
			modal.addEventListener('click', function(e){ if(e.target === modal) closeRoleManageModal(); });
			document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && modal.classList.contains('show')) closeRoleManageModal(); });
		})();

		if(roleManageBtn && cfg.kind === 'workgroup' && roleManageBtn.getAttribute('data-tab92-wired') !== '1'){
			roleManageBtn.setAttribute('data-tab92-wired','1');
			roleManageBtn.addEventListener('click', function(){
				openRoleManageModal().catch(function(err){
					showMgModal(err && err.message ? err.message : '역할 관리 화면을 열 수 없습니다.', '오류');
				});
			});
		}

		if(emailSendBtn && cfg.kind === 'workgroup' && emailSendBtn.getAttribute('data-tab92-wired') !== '1'){
			emailSendBtn.setAttribute('data-tab92-wired','1');
			emailSendBtn.addEventListener('click', function(){
				var recipients = collectEmailRecipients();
				if(!recipients.length){
					showMgModal('수신여부가 "O"인 담당자 중 사내메일이 있는 항목이 없습니다.', '알림');
					return;
				}
				openManagerEmailModal(recipients);
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
			setRoleData(tr, item || {});
			function v(k){
				var s = String(item && item[k] == null ? '' : item[k]).trim();
				return s.length ? escapeHtml(s) : '-';
			}
			var isPri = !!(item && item.is_primary);
			tr.innerHTML = ''
				+ '<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>'
				+ '<td data-col="org"' + (item && item.department_id != null ? (' data-dept-id="' + escapeHtml(String(item.department_id)) + '"') : '') + '>' + v('org') + '</td>'
				+ '<td data-col="name"' + (item && item.user_id != null ? (' data-user-id="' + escapeHtml(String(item.user_id)) + '"') : '') + '>' + v('name') + '</td>'
				+ '<td data-col="role">' + renderRoleTagsHtml(item || {}) + '</td>'
				+ '<td data-col="phone">' + v('phone') + '</td>'
				+ '<td data-col="email">' + v('email') + '</td>'
				+ '<td data-col="is_primary"><span class="cell-ox with-badge"><span class="ox-badge ' + (isPri ? 'on' : 'off') + '">' + (isPri ? 'O' : 'X') + '</span></span></td>'
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
				tr.innerHTML = ''
					+ '<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>'
					+ '<td data-col="org"></td>'
					+ '<td data-col="name"></td>'
					+ '<td data-col="role"><span class="muted-cell">역할 로딩 중</span></td>'
					+ '<td data-col="phone"><span class="mg-auto-text">-</span></td>'
					+ '<td data-col="email"><span class="mg-auto-text">-</span></td>'
					+ '<td data-col="is_primary"><select class="form-input"><option value="O">O</option><option value="X" selected>X</option></select></td>'
					+ '<td class="system-actions table-actions">'
					+   '<button class="action-btn js-mg-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>'
					+   '<button class="action-btn danger js-mg-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
					+ '</td>';
				tbody.appendChild(tr);
				setRowEditing(tr, true);

				(async function(){
					try{
						await ensureWorkgroupRoleAdmin();
						var depts = await wgLookups.ensureDepartments();
						try{ await wgLookups.ensureRoles(); }catch(_roleErr){ _workgroupRoleOptions = _workgroupRoleOptions || []; }
						var orgTd = tr.querySelector('[data-col="org"]');
						var nameTd = tr.querySelector('[data-col="name"]');
						var roleTd = tr.querySelector('[data-col="role"]');
						if(orgTd) orgTd.innerHTML = buildDeptSelectHtml(depts, null);
						if(nameTd) nameTd.innerHTML = buildUserSelectHtml([], null);
						if(roleTd){
							roleTd.innerHTML = buildRolePickerHtml([]);
							wireRolePicker(roleTd, wgLookups);
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
					}catch(_){
						var roleTdFallback = tr.querySelector('[data-col="role"]');
						if(roleTdFallback){
							roleTdFallback.innerHTML = buildRolePickerHtml([]);
							wireRolePicker(roleTdFallback, wgLookups);
						}
					}
				})();

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
						var roleTd = tr.querySelector('[data-col="role"]');
						var deptId = (orgTd && (orgTd.getAttribute('data-dept-id') || tr.getAttribute('data-dept-id'))) || null;
						var userId = (nameTd && (nameTd.getAttribute('data-user-id') || tr.getAttribute('data-user-id'))) || null;
						var selectedRoles = rolesFromRow(tr);
						(async function(){
							try{
								await ensureWorkgroupRoleAdmin();
								var depts = await wgLookups.ensureDepartments();
								try{ await wgLookups.ensureRoles(); }catch(_roleErr){ _workgroupRoleOptions = _workgroupRoleOptions || []; }
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
								if(roleTd){
									roleTd.innerHTML = buildRolePickerHtml(selectedRoles);
									wireRolePicker(roleTd, wgLookups);
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
								if(roleTd){ roleTd.innerHTML = buildRolePickerHtml(selectedRoles); wireRolePicker(roleTd, wgLookups); }
							}
							/* 역할, 수신여부 → editable; phone/email → auto-text */
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
							if(name === 'email') td.innerHTML = '<input type="email" value="' + escapeHtml(current) + '" placeholder="사내메일">';
							else if(name === 'phone') td.innerHTML = '<input type="text" value="' + escapeHtml(current) + '" placeholder="사내번호" oninput="this.value=this.value.replace(/[^0-9\\-]/g,\'\')">';
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
							if(name === 'email') td.innerHTML = '<input type="email" value="' + escapeHtml(current) + '" placeholder="사내메일">';
							else if(name === 'phone') td.innerHTML = '<input type="text" value="' + escapeHtml(current) + '" placeholder="사내번호" oninput="this.value=this.value.replace(/[^0-9\\-]/g,\'\')">';
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
										showMgModal('사내메일 형식이 올바르지 않습니다.', '알림');
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
								var roleIds = readRoleIds(tr);
								if(!roleIds.length){
									var rolePicker = tr.querySelector('[data-role-picker]');
									if(rolePicker) rolePicker.classList.add('is-open');
									throw new Error('역할을 선택하세요.');
								}
								payload = {
									department_id: deptId,
									user_id: userId,
									role_ids: roleIds,
									phone: readText('phone'),
									email: readText('email'),
									is_primary: (priVal === 'O')
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
								setRoleData(tr, item && (item.roles || item.role_ids || item.role) ? item : { role_ids: payload.role_ids });
								var roleTd2 = tr.querySelector('[data-col="role"]');
								if(roleTd2) roleTd2.innerHTML = renderRoleTagsHtml(item && (item.roles || item.role_ids || item.role) ? item : { role_ids: payload.role_ids });
								commitCell('phone', item.phone);
								commitCell('email', item.email);
								var wgPriTd = tr.querySelector('[data-col="is_primary"]');
								if(wgPriTd){
									var wgIsPri = !!(item && item.is_primary);
									wgPriTd.innerHTML = '<span class="cell-ox with-badge"><span class="ox-badge ' + (wgIsPri ? 'on' : 'off') + '">' + (wgIsPri ? 'O' : 'X') + '</span></span>';
								}
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

