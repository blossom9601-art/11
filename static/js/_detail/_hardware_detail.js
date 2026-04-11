/*
	Shared helpers for hardware detail pages.
	Exposes: window.BlossomHardwareDetail
*/

(function(){
	'use strict';

	if(typeof window === 'undefined') return;
	// SPA re-entry: 이전 sentinel 제거 → 유틸리티 재정의
	if(window.BlossomHardwareDetail) delete window.BlossomHardwareDetail;

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

		// Lumina 에이전트 아이콘: 저장된 row에서 agent_synced 읽기
		try{
			var _rawRow = getStored((storagePrefix || 'detail') + ':selected:row', 'session')
						|| getStored((storagePrefix || 'detail') + ':selected:row', 'local');
			if(_rawRow){
				var _row = JSON.parse(_rawRow);
				// agent_synced가 없으면 미연동(false)으로 표시
				updateAgentIcon(!!(_row && _row.agent_synced));
			} else {
				updateAgentIcon(false);
			}
		}catch(_eAI){}
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

	/**
	 * Lumina 에이전트 연동 상태 아이콘을 page-header h1 옆에 표시한다.
	 * @param {boolean} synced - true: 연동됨(b), false: 미연동(w)
	 */
	function updateAgentIcon(synced){
		try{
			var h1 = document.querySelector('.page-header h1');
			if(!h1) return;
			var span = document.getElementById('lumina-agent-icon');
			if(!span){
				span = document.createElement('span');
				span.id = 'lumina-agent-icon';
				span.style.cssText = 'display:inline-flex;align-items:center;margin-left:8px;vertical-align:middle;';
				h1.appendChild(span);
			}
			span.title = synced ? 'Lumina 에이전트 연동됨' : 'Lumina 에이전트 미연동';
			if(synced){
				span.innerHTML =
					'<svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
						'<path fill="#6366F1" d="m2.953 18.591c-1.481-1.869-2.12-3.722-1.915-5.628.246-2.296 1.664-4.667 4.46-7.464s5.169-4.215 7.464-4.461c2.198-.239 4.331.647 6.497 2.664-.218 1.153-1.435 5.367-7.758 7.344-5.814 1.817-7.961 5.371-8.748 7.545zm18.094-13.182c-.787 2.174-2.934 5.728-8.748 7.545-6.329 1.978-7.542 6.199-7.758 7.346 1.935 1.803 3.842 2.699 5.795 2.699 2.846-.088 5.051-1.464 8.167-4.499 2.797-2.797 4.214-5.168 4.46-7.464.205-1.906-.434-3.759-1.915-5.628z"/>' +
					'</svg>';
			} else {
				span.innerHTML =
					'<img src="/static/image/svg/agent/free-icon-font-coffee-bean-w.svg" ' +
						'width="22" height="22" alt="미연동" ' +
						'style="opacity:.35;filter:grayscale(1);">';
			}
		}catch(_e){}
	}

	/* ── Lumina 에이전트 연동 모달 ─────────────────────────── */

	var LINK_MODAL_ID = 'lumina-link-modal';
	var PAGE_SIZE = 10;
	var _allPending = [];
	var _currentPage = 1;
	var _pendingPollTimer = null;

	function _showConfirmModal(opts){
		var id = 'lumina-confirm-modal';
		var existing = document.getElementById(id);
		if(existing) existing.remove();
		var overlay = document.createElement('div');
		overlay.id = id;
		overlay.style.cssText = 'position:fixed;inset:0;z-index:10100;display:flex;align-items:center;justify-content:center;' +
			'background:rgba(15,23,42,.45);backdrop-filter:blur(4px);animation:fadeIn .15s ease;';
		overlay.innerHTML =
			'<div style="background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.18);' +
				'width:420px;max-width:90vw;overflow:hidden;">' +
				'<div style="padding:28px 32px 0;">' +
					'<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">' +
						'<div style="width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;' +
							'background:' + (opts.iconBg || '#EEF2FF') + ';">' +
							(opts.icon || '') +
						'</div>' +
						'<h3 style="margin:0;font-size:16px;font-weight:700;color:#1e293b;">' + (opts.title || '확인') + '</h3>' +
					'</div>' +
					'<p style="margin:0 0 4px;font-size:14px;color:#475569;line-height:1.6;">' + (opts.message || '') + '</p>' +
				'</div>' +
				'<div style="padding:20px 32px 24px;display:flex;justify-content:flex-end;gap:10px;">' +
					'<button id="lumina-confirm-cancel" type="button" style="padding:9px 22px;border:1px solid #e2e8f0;' +
						'background:#fff;color:#64748b;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;' +
						'transition:all .15s;">취소</button>' +
					'<button id="lumina-confirm-ok" type="button" style="padding:9px 22px;border:none;' +
						'background:' + (opts.okColor || '#6366F1') + ';color:#fff;border-radius:8px;font-size:13px;' +
						'font-weight:600;cursor:pointer;transition:all .15s;">' + (opts.okText || '확인') + '</button>' +
				'</div>' +
			'</div>';
		document.body.appendChild(overlay);
		overlay.querySelector('#lumina-confirm-cancel').addEventListener('click', function(){
			overlay.remove();
			if(opts.onCancel) opts.onCancel();
		});
		overlay.querySelector('#lumina-confirm-ok').addEventListener('click', function(){
			overlay.remove();
			if(opts.onOk) opts.onOk();
		});
		overlay.addEventListener('click', function(e){
			if(e.target === overlay){ overlay.remove(); if(opts.onCancel) opts.onCancel(); }
		});
	}

	function _createLinkModal(){
		if(document.getElementById(LINK_MODAL_ID)) return;
		var overlay = document.createElement('div');
		overlay.id = LINK_MODAL_ID;
		overlay.className = 'server-edit-modal modal-overlay-full';
		overlay.setAttribute('aria-hidden', 'true');
		overlay.innerHTML =
			'<div class="server-edit-content" style="width:860px;max-width:92vw;height:620px;max-height:88vh;">' +
				'<div class="server-edit-header">' +
					'<div class="server-edit-title">' +
						'<h3 id="lumina-modal-title">에이전트 연동</h3>' +
						'<p class="server-edit-subtitle" id="lumina-modal-subtitle">대기중인 에이전트를 현재 자산에 연동합니다.</p>' +
					'</div>' +
					'<button class="close-btn" type="button" id="lumina-link-close" title="닫기">' +
						'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
							'<path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
						'</svg>' +
					'</button>' +
				'</div>' +
				'<div class="server-edit-body" id="lumina-link-body" style="padding:0;"></div>' +
				'<div class="server-edit-actions" id="lumina-link-footer" style="justify-content:center;">' +
					'<div id="lumina-link-pager" style="display:flex;align-items:center;gap:4px;"></div>' +
				'</div>' +
			'</div>';
		document.body.appendChild(overlay);

		overlay.querySelector('#lumina-link-close').addEventListener('click', closeLinkModal);
		overlay.addEventListener('click', function(e){
			if(e.target === overlay) closeLinkModal();
		});
	}

	function openLinkModal(assetId){
		_createLinkModal();
		var modal = document.getElementById(LINK_MODAL_ID);
		if(!modal) return;
		modal.setAttribute('data-asset-id', assetId || '');
		modal.classList.add('show');
		modal.setAttribute('aria-hidden', 'false');

		var body = document.getElementById('lumina-link-body');
		var footer = document.getElementById('lumina-link-footer');
		if(body) body.innerHTML = '<div style="text-align:center;padding:40px 24px;color:#94a3b8;">불러오는 중...</div>';
		if(footer) footer.style.display = 'none';

		// 먼저 연동된 에이전트 확인
		fetchJSON('/api/agent/linked/' + assetId).then(function(data){
			if(data && data.success && data.linked){
				_renderLinkedInfo(data.linked);
			} else {
				_currentPage = 1;
				_showPendingView();
				_loadPendingList();
				_startPendingPoll();
			}
		}).catch(function(){
			_currentPage = 1;
			_showPendingView();
			_loadPendingList();
			_startPendingPoll();
		});
	}

	function closeLinkModal(){
		_stopPendingPoll();
		var modal = document.getElementById(LINK_MODAL_ID);
		if(!modal) return;
		modal.classList.remove('show');
		modal.setAttribute('aria-hidden', 'true');
	}

	function _renderLinkedInfo(agent){
		var titleEl = document.getElementById('lumina-modal-title');
		var subtitleEl = document.getElementById('lumina-modal-subtitle');
		var body = document.getElementById('lumina-link-body');
		var footer = document.getElementById('lumina-link-footer');
		if(titleEl) titleEl.textContent = '에이전트 연동 정보';
		if(subtitleEl) subtitleEl.textContent = '현재 자산에 연동된 에이전트 정보입니다.';
		if(footer) footer.style.display = 'flex';

		var isActive = !!agent.active;
		var osLabel = agent.os_version || agent.os_type || '-';
		var recvTs = (agent.received_at || '').replace('T',' ').substring(0, 16);
		var linkTs = (agent.linked_at || '').replace('T',' ').substring(0, 16);
		var statusColor = isActive ? '#6366F1' : '#94a3b8';
		var statusText = isActive ? '연동됨' : '수신 없음 (1시간 초과)';
		var iconBg = isActive ? '#6366F1' : '#94a3b8';

		// 아이콘도 active 상태에 맞게 갱신
		updateAgentIcon(isActive);

		var html =
			'<div style="padding:32px 40px;">' +
				'<div style="display:flex;align-items:center;gap:12px;margin-bottom:28px;">' +
					'<div style="width:48px;height:48px;background:' + iconBg + ';border-radius:12px;display:flex;align-items:center;justify-content:center;">' +
						'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
							'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
							'<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
						'</svg>' +
					'</div>' +
					'<div>' +
						'<div style="font-size:18px;font-weight:700;color:#1e293b;">' + _esc(agent.hostname) + '</div>' +
						'<div style="font-size:13px;color:' + statusColor + ';font-weight:500;">' + statusText + '</div>' +
					'</div>' +
				'</div>' +
				'<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
					'<tr style="border-bottom:1px solid #f1f5f9;">' +
						'<td style="padding:14px 0;color:#64748b;width:140px;">Hostname</td>' +
						'<td style="padding:14px 0;color:#1e293b;font-weight:500;">' + _esc(agent.hostname) + '</td>' +
					'</tr>' +
					'<tr style="border-bottom:1px solid #f1f5f9;">' +
						'<td style="padding:14px 0;color:#64748b;">IP 주소</td>' +
						'<td style="padding:14px 0;color:#1e293b;font-weight:500;">' + _esc(agent.ip_address || '-') + '</td>' +
					'</tr>' +
					'<tr style="border-bottom:1px solid #f1f5f9;">' +
						'<td style="padding:14px 0;color:#64748b;">운영체제</td>' +
						'<td style="padding:14px 0;color:#1e293b;font-weight:500;">' + _esc(osLabel) + '</td>' +
					'</tr>' +
					'<tr style="border-bottom:1px solid #f1f5f9;">' +
						'<td style="padding:14px 0;color:#64748b;">마지막 수신</td>' +
						'<td style="padding:14px 0;color:#1e293b;font-weight:500;">' + _esc(recvTs || '-') + '</td>' +
					'</tr>' +
					'<tr>' +
						'<td style="padding:14px 0;color:#64748b;">연동 일시</td>' +
						'<td style="padding:14px 0;color:#1e293b;font-weight:500;">' + _esc(linkTs || '-') + '</td>' +
					'</tr>' +
				'</table>' +
			'</div>';
		if(body) body.innerHTML = html;

		var pager = document.getElementById('lumina-link-pager');
		if(pager){
			pager.innerHTML =
				'<button id="lumina-unlink-btn" type="button" style="' +
					'background:#fff;color:#ef4444;border:1px solid #fca5a5;border-radius:8px;' +
					'padding:8px 20px;font-size:13px;font-weight:600;cursor:pointer;' +
					'display:inline-flex;align-items:center;gap:6px;transition:all .15s;">' +
					'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
						'<path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
						'<path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
						'<line x1="2" y1="2" x2="22" y2="22" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>' +
					'</svg>' +
					'연동 해제' +
				'</button>';
			document.getElementById('lumina-unlink-btn').addEventListener('click', function(){
				var aid = parseInt(document.getElementById(LINK_MODAL_ID).getAttribute('data-asset-id'), 10);
				if(!aid) return;
				var unlinkBtn = this;
				_showConfirmModal({
					title: '연동 해제',
					message: '에이전트 연동을 해제하시겠습니까?<br>수집된 데이터는 유지됩니다.',
					icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="2" y1="2" x2="22" y2="22" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/></svg>',
					iconBg: '#FEF2F2',
					okText: '해제',
					okColor: '#ef4444',
					onOk: function(){
						unlinkBtn.disabled = true;
						unlinkBtn.style.opacity = '0.5';
						fetchJSON('/api/agent/unlink', {
							method: 'POST',
							body: JSON.stringify({ asset_id: aid })
						}).then(function(res){
							if(res && res.success){
								updateAgentIcon(false);
								_currentPage = 1;
								_showPendingView();
								_loadPendingList();
							} else {
								alert((res && res.error) || '연동 해제 실패');
								unlinkBtn.disabled = false;
								unlinkBtn.style.opacity = '1';
							}
						}).catch(function(err){
							alert('연동 해제 오류: ' + String(err));
							unlinkBtn.disabled = false;
							unlinkBtn.style.opacity = '1';
						});
					}
				});
			});
		}
	}

	function _showPendingView(){
		var titleEl = document.getElementById('lumina-modal-title');
		var subtitleEl = document.getElementById('lumina-modal-subtitle');
		var body = document.getElementById('lumina-link-body');
		var footer = document.getElementById('lumina-link-footer');
		if(titleEl) titleEl.textContent = '에이전트 연동';
		if(subtitleEl) subtitleEl.textContent = '대기중인 에이전트를 현재 자산에 연동합니다.';
		if(footer) footer.style.display = 'flex';
		if(body){
			body.innerHTML =
				'<table id="lumina-link-table" style="width:100%;border-collapse:collapse;font-size:13px;">' +
					'<thead><tr style="border-bottom:2px solid #e3e6eb;background:#f8f9fb;">' +
						'<th style="text-align:center;padding:11px 12px;color:#475569;font-weight:600;font-size:13px;width:52px;">상태</th>' +
						'<th style="text-align:left;padding:11px 24px;color:#475569;font-weight:600;font-size:13px;">Hostname</th>' +
						'<th style="text-align:left;padding:11px 24px;color:#475569;font-weight:600;font-size:13px;">IP</th>' +
						'<th style="text-align:left;padding:11px 24px;color:#475569;font-weight:600;font-size:13px;">OS</th>' +
						'<th style="text-align:left;padding:11px 24px;color:#475569;font-weight:600;font-size:13px;">수신시각</th>' +
						'<th style="text-align:center;padding:11px 24px;color:#475569;font-weight:600;font-size:13px;width:80px;">연동</th>' +
					'</tr></thead>' +
					'<tbody id="lumina-link-tbody"></tbody>' +
				'</table>';
		}
	}

	function _loadPendingList(){
		var tbody = document.getElementById('lumina-link-tbody');
		if(tbody && !_allPending.length) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:28px 24px;color:#94a3b8;">불러오는 중...</td></tr>';

		fetchJSON('/api/agent/pending').then(function(data){
			_allPending = (data && data.rows) || [];
			_renderPage();
		}).catch(function(){
			_allPending = [];
			_renderPage();
		});
	}

	function _startPendingPoll(){
		_stopPendingPoll();
		_pendingPollTimer = setInterval(function(){
			var modal = document.getElementById(LINK_MODAL_ID);
			if(!modal || !modal.classList.contains('show')){
				_stopPendingPoll();
				return;
			}
			fetchJSON('/api/agent/pending').then(function(data){
				_allPending = (data && data.rows) || [];
				_renderPage();
			}).catch(function(){});
		}, 5000);
	}

	function _stopPendingPoll(){
		if(_pendingPollTimer){
			clearInterval(_pendingPollTimer);
			_pendingPollTimer = null;
		}
	}

	function _renderPage(){
		var tbody = document.getElementById('lumina-link-tbody');
		var pager = document.getElementById('lumina-link-pager');
		if(!tbody) return;

		var total = _allPending.length;
		var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
		if(_currentPage > totalPages) _currentPage = totalPages;

		var start = (_currentPage - 1) * PAGE_SIZE;
		var pageRows = _allPending.slice(start, start + PAGE_SIZE);

		var html = '';
		if(!pageRows.length){
			html = '<tr><td colspan="6" style="text-align:center;padding:28px 24px;color:#94a3b8;">연동 대기중인 에이전트가 없습니다.</td></tr>';
			// 빈 행으로 높이 유지
			for(var e = 0; e < PAGE_SIZE - 1; e++){
				html += '<tr><td colspan="6" style="padding:11px 24px;">&nbsp;</td></tr>';
			}
		} else {
			for(var i = 0; i < pageRows.length; i++){
				var r = pageRows[i];
				var ts = (r.received_at || '').replace('T',' ').substring(0, 16);
				var osLabel = r.os_version || r.os_type || '-';
				var isOnline = r.status === 'online';
				var dotColor = isOnline ? '#6366F1' : '#94a3b8';
				var dotTitle = isOnline ? '온라인' : '오프라인';
				html += '<tr data-pending-id="' + r.id + '" style="border-bottom:1px solid #f1f5f9;">' +
					'<td style="padding:11px 12px;text-align:center;" title="' + dotTitle + '">' +
						'<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + dotColor + ';"></span>' +
					'</td>' +
					'<td style="padding:11px 24px;color:#1e293b;">' + _esc(r.hostname) + '</td>' +
					'<td style="padding:11px 24px;color:#475569;">' + _esc(r.ip_address || '-') + '</td>' +
					'<td style="padding:11px 24px;color:#475569;font-size:12px;">' + _esc(osLabel) + '</td>' +
					'<td style="padding:11px 24px;color:#94a3b8;font-size:12px;">' + _esc(ts || '-') + '</td>' +
					'<td style="padding:11px 24px;text-align:center;">' +
						'<button class="lumina-link-btn" data-pid="' + r.id + '" type="button" title="연동" ' +
						'style="background:#6366F1;color:#fff;border:none;border-radius:6px;width:32px;height:32px;' +
						'display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s;">' +
						'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
							'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
							'<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
						'</svg>' +
					'</button>' +
					'</td></tr>';
			}
			// 빈 행으로 높이 유지
			for(var j = pageRows.length; j < PAGE_SIZE; j++){
				html += '<tr><td colspan="6" style="padding:11px 24px;">&nbsp;</td></tr>';
			}
		}
		tbody.innerHTML = html;

		// 연동 버튼 이벤트
		tbody.querySelectorAll('.lumina-link-btn').forEach(function(btn){
			btn.addEventListener('click', function(){
				var pid = parseInt(btn.getAttribute('data-pid'), 10);
				var aid = parseInt(document.getElementById(LINK_MODAL_ID).getAttribute('data-asset-id'), 10);
				if(!pid || !aid) return;
				_showConfirmModal({
					title: '에이전트 연동',
					message: '에이전트를 연동하면 기존 <b>인터페이스, 계정, 패키지</b> 데이터가<br>에이전트 수집 데이터로 대체됩니다.',
					icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="#6366F1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="#6366F1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
					iconBg: '#EEF2FF',
					okText: '연동',
					okColor: '#6366F1',
					onOk: function(){
						btn.disabled = true;
						btn.style.opacity = '0.5';
						_doLink(pid, aid, btn);
					}
				});
			});
		});

		// 페이지네이션
		if(pager){
			if(totalPages <= 1){
				var singleActive = 'border:1px solid #6366F1;background:#6366F1;color:#fff;border-radius:6px;' +
					'padding:4px 10px;font-size:12px;cursor:default;min-width:32px;font-weight:600;';
				pager.innerHTML = '<span style="color:#94a3b8;font-size:13px;margin-right:8px;">' + total + '건</span>' +
					'<button style="' + singleActive + '" disabled>1</button>';
			} else {
				var ph = '';
				var btnStyle = 'border:1px solid #d1d5db;background:#fff;color:#475569;border-radius:6px;' +
					'padding:4px 10px;font-size:12px;cursor:pointer;min-width:32px;transition:all .15s;';
				var activeStyle = 'border:1px solid #6366F1;background:#6366F1;color:#fff;border-radius:6px;' +
					'padding:4px 10px;font-size:12px;cursor:default;min-width:32px;font-weight:600;';

				if(_currentPage > 1){
					ph += '<button class="lp-nav" data-page="' + (_currentPage - 1) + '" style="' + btnStyle + '">&lsaquo;</button>';
				}
				for(var p = 1; p <= totalPages; p++){
					ph += '<button class="lp-nav" data-page="' + p + '" style="' + (p === _currentPage ? activeStyle : btnStyle) + '">' + p + '</button>';
				}
				if(_currentPage < totalPages){
					ph += '<button class="lp-nav" data-page="' + (_currentPage + 1) + '" style="' + btnStyle + '">&rsaquo;</button>';
				}
				pager.innerHTML = ph;
				pager.querySelectorAll('.lp-nav').forEach(function(b){
					b.addEventListener('click', function(){
						_currentPage = parseInt(b.getAttribute('data-page'), 10);
						_renderPage();
					});
				});
			}
		}
	}

	function _doLink(pendingId, assetId, btn){
		fetchJSON('/api/agent/link', {
			method: 'POST',
			body: JSON.stringify({ pending_id: pendingId, asset_id: assetId })
		}).then(function(res){
			if(res && res.success){
				updateAgentIcon(true);
				// 연동 후 연동 정보 뷰로 전환
				fetchJSON('/api/agent/linked/' + assetId).then(function(data){
					if(data && data.success && data.linked){
						_renderLinkedInfo(data.linked);
					} else {
						_allPending = _allPending.filter(function(r){ return r.id !== pendingId; });
						_renderPage();
					}
				}).catch(function(){
					_allPending = _allPending.filter(function(r){ return r.id !== pendingId; });
					_renderPage();
				});
			} else {
				alert((res && res.error) || '연동 실패');
				btn.disabled = false;
				btn.style.opacity = '1';
			}
		}).catch(function(err){
			alert('연동 오류: ' + String(err));
			btn.disabled = false;
			btn.style.opacity = '1';
		});
	}

	function _esc(s){
		var d = document.createElement('div');
		d.textContent = s || '';
		return d.innerHTML;
	}

	/**
	 * 기본정보 탭에 연동 아이콘 버튼을 #detail-edit-open 왼쪽에 삽입
	 */
	function initLinkButton(assetId){
		if(document.getElementById('lumina-link-open')) return;
		var editBtn = document.getElementById('detail-edit-open');
		if(!editBtn) return;

		var btn = document.createElement('button');
		btn.className = 'add-btn-icon';
		btn.id = 'lumina-link-open';
		btn.type = 'button';
		btn.title = '에이전트 연동';
		btn.style.cssText = 'right:74px !important;';
		btn.innerHTML = '<img src="/static/image/svg/agent/free-icon-font-link-alt.svg" alt="연동">';
		editBtn.parentNode.insertBefore(btn, editBtn);

		btn.addEventListener('click', function(){
			var aid = assetId || resolveAssetId();
			if(aid) openLinkModal(aid);
		});
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
		normalizeBusinessKeys: normalizeBusinessKeys,
		updateAgentIcon: updateAgentIcon,
		initLinkButton: initLinkButton,
		openLinkModal: openLinkModal,
		closeLinkModal: closeLinkModal
	};

	// 자동 초기화: #detail-edit-open이 있는 모든 상세 페이지에 연동 버튼 삽입
	function _autoInit(){
		if(!document.getElementById('detail-edit-open')) return;
		if(document.getElementById('lumina-link-open')) return;
		var aid = resolveAssetId();
		initLinkButton(aid);
	}
	if(document.readyState === 'loading'){
		document.addEventListener('DOMContentLoaded', _autoInit);
	} else {
		setTimeout(_autoInit, 0);
	}
})();
