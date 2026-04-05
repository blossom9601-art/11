/* 작업보고서 동작 스크립트 */
(function(){
	const STORAGE_KEY_BASE = 'taskReport-changhyeong-v2';

	function statusCodeToKo(code){
		const v = String(code||'').toUpperCase();
		if(v === 'DRAFT') return '임시저장';
		if(v === 'REVIEW') return '검토';
		if(v === 'APPROVED') return '승인';
		if(v === 'SCHEDULED') return '예정';
		if(v === 'IN_PROGRESS') return '진행';
		if(v === 'COMPLETED' || v === 'ARCHIVED') return '완료';
		// already Korean?
		if(['임시저장','검토','승인','예정','진행','완료'].includes(String(code||'').trim())) return String(code).trim();
		return '임시저장';
	}
	function toDisplayDateTime(v){
		if(!v) return '';
		const s = String(v);
		if(s.includes('T')){
			const t = s.replace('T',' ').replace(/\.(\d+).*/, '');
			return t.slice(0, 16);
		}
		return s;
	}
	function normalizeDateTimeValue(v){
		if(!v) return '';
		const s = String(v).trim();
		if(!s) return '';
		// Accept either "YYYY-MM-DD HH:MM" or "YYYY-MM-DDTHH:MM[:SS]" and normalize to "YYYY-MM-DD HH:MM"
		if(s.includes('T')){
			return s.replace('T',' ').replace(/\.(\d+).*/, '').slice(0, 16);
		}
		return s.replace(/\.(\d+).*/, '').slice(0, 16);
	}
	function toNativeDateTimeLocalValue(v){
		const norm = normalizeDateTimeValue(v);
		return norm ? norm.replace(' ','T') : '';
	}
	function safeJsonParse(raw, fallback){
		try{
			if(raw == null) return fallback;
			return JSON.parse(String(raw));
		}catch(_e){
			return fallback;
		}
	}
	function toJsonString(value){
		try{ return JSON.stringify(value); }catch(_e){ return 'null'; }
	}
	function getReportIdFromUrl(){
		try{
			const params = new URLSearchParams(window.location.search || '');
			const raw = params.get('id') || params.get('report_id') || params.get('reportId');
			const n = raw ? parseInt(String(raw), 10) : NaN;
			return Number.isFinite(n) && n > 0 ? n : null;
		}catch(_e){
			return null;
		}
	}
	let REPORT_ID = getReportIdFromUrl();
	function _storageKey(){
		return `${STORAGE_KEY_BASE}:${REPORT_ID || 'new'}`;
	}
	let REPORT_STATUS_CODE = 'DRAFT';
	/** @type {ReturnType<initAttachments>|null} */
	let attachmentsManager = null;
	/** @type {null|{flushPendingComments:(rid:number)=>Promise<void>}} */
	let commentsManager = null;
	function isReviewStage(){
		const s = String(REPORT_STATUS_CODE || '').toUpperCase();
		return s === 'DRAFT' || s === 'REVIEW';
	}
	function updateClearButtonEnabled(){
		const btn = document.getElementById('btn-clear');
		if(!btn) return;
		const enabled = isReviewStage();
		// UX: 검토 단계가 아니면 버튼 자체를 숨김
		btn.hidden = !enabled;
		btn.disabled = !enabled;
		btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
		btn.setAttribute('title', enabled ? '초기화' : '');
		btn.setAttribute('aria-label', enabled ? '초기화' : '');
	}
	function setReportId(id){
		REPORT_ID = id;
		// NOTE: localStorage key is namespaced by REPORT_ID; after id changes,
		// subsequent saves will go to the new key.
		try{
			const url = new URL(window.location.href);
			if(id == null || String(id).trim() === ''){
				url.searchParams.delete('id');
				url.searchParams.delete('report_id');
				url.searchParams.delete('reportId');
			}else{
				url.searchParams.set('id', String(id));
			}
			window.history.replaceState({}, '', url.toString());
		}catch(_e){}
	}

	// --- Flatpickr loader (offline-safe: local vendored assets) ---
	const FLATPICKR_VENDOR_VER = '4.6.13';
	const FLATPICKR_VENDOR_BASE = `/static/vendor/flatpickr/${FLATPICKR_VENDOR_VER}`;
	const FLATPICKR_CSS = `${FLATPICKR_VENDOR_BASE}/flatpickr.min.css`;
	const FLATPICKR_THEME_HREF = `${FLATPICKR_VENDOR_BASE}/themes/airbnb.css`;
	const FLATPICKR_JS = `${FLATPICKR_VENDOR_BASE}/flatpickr.min.js`;
	const FLATPICKR_KO = `${FLATPICKR_VENDOR_BASE}/l10n/ko.js`;
	function ensureCss(href, id){
		const existing = document.getElementById(id);
		if(existing && existing.tagName.toLowerCase()==='link'){
			if(existing.getAttribute('href')!==href){ existing.setAttribute('href', href); }
			return;
		}
		const l = document.createElement('link'); l.rel='stylesheet'; l.href = href; l.id = id; document.head.appendChild(l);
	}
	function loadScript(src){
		return new Promise((resolve, reject)=>{
			const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ()=> resolve(); s.onerror = ()=> reject(new Error('Script load failed: '+src)); document.head.appendChild(s);
		});
	}
	async function ensureFlatpickr(){
		ensureCss(FLATPICKR_CSS, 'flatpickr-css');
		ensureCss(FLATPICKR_THEME_HREF, 'flatpickr-theme-css');
		if(window.flatpickr){ return; }
		await loadScript(FLATPICKR_JS);
		try { await loadScript(FLATPICKR_KO); } catch(_e){}
	}
	function installNativeDateTimeProxy(textInput){
		if(!textInput || !(textInput instanceof HTMLInputElement)) return null;
		if(textInput._nativeDateTimeProxy) return textInput._nativeDateTimeProxy;
		const proxy = document.createElement('input');
		proxy.type = 'datetime-local';
		proxy.step = '60';
		proxy.setAttribute('aria-hidden', 'true');
		proxy.tabIndex = -1;
		proxy.style.position = 'fixed';
		proxy.style.left = '-9999px';
		proxy.style.top = '-9999px';
		proxy.style.width = '1px';
		proxy.style.height = '1px';
		proxy.style.opacity = '0';
		proxy.style.pointerEvents = 'none';
		proxy.style.zIndex = '2147483647';
		document.body.appendChild(proxy);

		const syncToProxy = ()=>{
			try{ proxy.value = toNativeDateTimeLocalValue(textInput.value || ''); }catch(_e){}
		};
		const syncBack = ()=>{
			const norm = normalizeDateTimeValue(proxy.value || '');
			textInput.value = norm;
			try{ textInput.dispatchEvent(new Event('input', { bubbles:true })); }catch(_e){}
			try{ textInput.dispatchEvent(new Event('change', { bubbles:true })); }catch(_e){}
		};
		proxy.addEventListener('input', syncBack);
		proxy.addEventListener('change', syncBack);

		const openProxy = ()=>{
			syncToProxy();
			try{
				if(typeof proxy.showPicker === 'function'){
					proxy.showPicker();
					return;
				}
			}catch(_e){}
			try{ proxy.focus(); }catch(_e){}
		};
		textInput.addEventListener('click', openProxy);
		textInput.addEventListener('focus', openProxy);

		textInput._nativeDateTimeProxy = proxy;
		return proxy;
	}
	async function initDatePickersDetail(){
		const startEl = document.querySelector('[data-field="start_dt"]');
		const endEl = document.querySelector('[data-field="end_dt"]');
		if(!startEl && !endEl) return;
		try { await ensureFlatpickr(); } catch(_e){
			try { toast('달력 로드에 실패했습니다(네트워크/CDN).'); } catch(_t){}
			try{ if(startEl) installNativeDateTimeProxy(/** @type {HTMLInputElement} */(startEl)); }catch(_f){}
			try{ if(endEl) installNativeDateTimeProxy(/** @type {HTMLInputElement} */(endEl)); }catch(_f){}
			return;
		}
		if(!window.flatpickr){
			try { toast('달력 라이브러리를 불러오지 못했습니다.'); } catch(_t){}
			try{ if(startEl) installNativeDateTimeProxy(/** @type {HTMLInputElement} */(startEl)); }catch(_f){}
			try{ if(endEl) installNativeDateTimeProxy(/** @type {HTMLInputElement} */(endEl)); }catch(_f){}
			return;
		}
		function ensureTodayButton(fp){
			const cal = fp?.calendarContainer; if(!cal) return;
			// Match project task list style: single '오늘' button anchored in calendar
			if(cal.querySelector('.fp-today-btn')) return;
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'fp-today-btn';
			btn.textContent = '오늘';
			btn.addEventListener('click', ()=>{ fp.setDate(new Date(), true); });
			cal.appendChild(btn);
		}
		const opts = {
			locale: (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.ko) ? window.flatpickr.l10ns.ko : 'ko',
			enableTime: true,
			time_24hr: true,
			dateFormat: 'Y-m-d H:i',
			allowInput: true,
			disableMobile: true,
			clickOpens: true,
			appendTo: document.body,
			onReady: function(_, __, instance){ ensureTodayButton(instance); },
			onOpen: function(_, __, instance){ ensureTodayButton(instance); },
			onChange: function(){ computeAndRenderDuration(); }
		};
		function attach(el){
			if(!el || el._flatpickr) return;
			try{
				window.flatpickr(el, opts);
				try{
					el.addEventListener('focus', ()=>{ try{ el._flatpickr && el._flatpickr.open(); }catch(_e){} });
					el.addEventListener('click', ()=>{ try{ el._flatpickr && el._flatpickr.open(); }catch(_e){} });
				}catch(_e){}
				return;
			}catch(_e1){}
			// Final fallback: native proxy
			try{ installNativeDateTimeProxy(el); }catch(_e3){}
		}
		attach(startEl);
		attach(endEl);
		// If still not attached, surface a hint
		try{
			const ok = (startEl && startEl._flatpickr) || (endEl && endEl._flatpickr);
			if(!ok){ toast('달력 초기화에 실패했습니다. 네트워크/CSP를 확인해주세요.'); }
		}catch(_t){}
	}

	const $ = (sel, root=document) => root.querySelector(sel);
	const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

	async function fetchJson(url, options){
		const res = await fetch(url, Object.assign({ credentials: 'same-origin' }, options || {}));
		const json = await res.json().catch(()=> ({}));
		return { res, json };
	}

	/* ---- 세션 사용자 정보 캐시 ---- */
	let _sessionUserCache = null;
	async function getSessionUser(){
		if(_sessionUserCache) return _sessionUserCache;
		try{
			const { res, json } = await fetchJson('/api/session/me');
			if(res.ok && json && json.success && json.user){
				_sessionUserCache = json.user;
				return _sessionUserCache;
			}
		}catch(_e){}
		return null;
	}

	/* ---- Promise-based confirm modal (replaces browser confirm) ---- */
	let _confirmResolve = null;
	function _openModalById(id){
		const el = document.getElementById(id); if(!el) return;
		document.body.classList.add('modal-open');
		el.classList.add('show');
		el.setAttribute('aria-hidden','false');
	}
	function _closeModalById(id){
		const el = document.getElementById(id); if(!el) return;
		el.classList.remove('show');
		el.setAttribute('aria-hidden','true');
		if(!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show, .modal-overlay-full.show')){
			document.body.classList.remove('modal-open');
		}
	}
	function showConfirmModal(message, title){
		return new Promise((resolve)=>{
			_confirmResolve = resolve;
			const titleEl = document.getElementById('task-action-confirm-title');
			const bodyEl  = document.getElementById('task-action-confirm-body');
			if(titleEl) titleEl.textContent = title || '확인';
			if(bodyEl){
				bodyEl.innerHTML = '';
				String(message || '').split('\n').forEach((line, i, arr)=>{
					bodyEl.appendChild(document.createTextNode(line));
					if(i < arr.length - 1) bodyEl.appendChild(document.createElement('br'));
				});
			}
			_openModalById('task-action-confirm-modal');
		});
	}
	function _resolveConfirm(val){
		_closeModalById('task-action-confirm-modal');
		if(_confirmResolve){ _confirmResolve(val); _confirmResolve = null; }
	}
	/* Bind confirm-modal buttons (once DOM ready) */
	(function _bindConfirmModalButtons(){
		document.getElementById('task-action-confirm-ok')?.addEventListener('click', ()=> _resolveConfirm(true));
		document.getElementById('task-action-confirm-cancel')?.addEventListener('click', ()=> _resolveConfirm(false));
		document.getElementById('task-action-confirm-close')?.addEventListener('click', ()=> _resolveConfirm(false));
		const modal = document.getElementById('task-action-confirm-modal');
		if(modal){
			modal.addEventListener('click', (e)=>{ if(e.target === modal) _resolveConfirm(false); });
		}
		document.addEventListener('keydown', (e)=>{
			if(e.key === 'Escape' && modal && modal.classList.contains('show')){
				_resolveConfirm(false);
			}
		});
	})();

	/** 결재 팀원 칸에 세션 사용자 정보 자동 채움 (서명·이름·날짜시간) */
	function fillMemberApprovalDefaults(userName){
		try{
			const now = new Date();
			const yy = String(now.getFullYear()).slice(2);
			const mm = String(now.getMonth()+1).padStart(2,'0');
			const dd = String(now.getDate()).padStart(2,'0');
			const hh = String(now.getHours()).padStart(2,'0');
			const mi = String(now.getMinutes()).padStart(2,'0');
			const dateStr = `'${yy}/${mm}/${dd} ${hh}:${mi}`;

			const nameEl = $('[data-field="name_member"]');
			if(nameEl && !nameEl.value) nameEl.value = userName || '';
			const dateEl = $('[data-field="date_member"]');
			if(dateEl && !dateEl.value) dateEl.value = dateStr;

			// 서명 영역: 이름을 필기체 스타일로 표시
			const signEl = $('[data-field="sign_member"]');
			if(signEl && !signEl.innerHTML.trim() && userName){
				signEl.innerHTML = `<span style="font-size:1.6em;font-style:italic;font-weight:600;color:#1e293b;user-select:none;">${escapeHtml(userName)}</span>`;
			}
		}catch(_e){}
	}

	function applyApiItemToForm(item){
		if(!item) return;
		try{ REPORT_STATUS_CODE = item.status ? String(item.status).toUpperCase() : null; }catch(_e){ REPORT_STATUS_CODE = null; }
		try{ updateClearButtonEnabled(); }catch(_e){}
		try{ updatePersistButton(); }catch(_e){}
		// Merge payload_json fallback so un-mapped fields (signatures, rel_dept, etc.) are available
		let pjFallback = {};
		try{
			const raw = item.payload_json;
			if(typeof raw === 'string' && raw.trim()) pjFallback = JSON.parse(raw);
			else if(raw && typeof raw === 'object') pjFallback = raw;
		}catch(_e){}
		const merged = Object.assign({}, pjFallback, item); // item wins over pjFallback
		const map = {
			project: item.project_name,
			task_title: item.task_title,
			start_dt: toDisplayDateTime(item.start_datetime),
			end_dt: toDisplayDateTime(item.end_datetime),
			report_status: statusCodeToKo(item.status),
			categories: Array.isArray(item.classifications) ? item.classifications.join(', ') : undefined,
			work_types: Array.isArray(item.worktypes) ? item.worktypes.join(', ') : undefined,
			worker: item.worker_name,
		};
		/* hydrate project_id */
		try{
			var _pEl = document.querySelector('input.meta-input[data-field="project"]');
			if(_pEl && _pEl._getProjectId !== undefined && item.project_id){
				_pEl._getProjectId = function(){ return item.project_id; };
			}
		}catch(_e){}
		inputs.forEach(i => {
			const key = i.dataset.field;
			const isFixed = i.dataset.fixed === 'true';
			if(isFixed) return;
			if(map[key] !== undefined){
				if(key === 'start_dt' || key === 'end_dt'){
					const norm = normalizeDateTimeValue(map[key] || '');
					// datetime-local requires 'YYYY-MM-DDTHH:MM'
					if(i instanceof HTMLInputElement && i.type === 'datetime-local'){
						i.value = norm ? norm.replace(' ', 'T') : '';
					}else{
						i.value = norm;
					}
				}else{
					i.value = map[key] || '';
				}
				return;
			}
			if(item[key] !== undefined && item[key] !== null){
				i.value = String(item[key]);
			} else if(merged[key] !== undefined && merged[key] !== null){
				i.value = String(merged[key]);
			}
		});
		editables.forEach(e => {
			const key = e.dataset.field;
			const val = (item[key] !== undefined && item[key] !== null) ? item[key] : merged[key];
			if(val !== undefined && val !== null){
				e.innerHTML = String(val);
				try{ cleanupLegacyListMarkup(e); }catch(_e){}
				try{ applyArrowRewrites(e); }catch(_e){}
				try{ applyRichMarkers(e); }catch(_e){}
			}
		});
		try{ computeAndRenderDuration(); } catch(_e){}
		try{ categoriesSync.fromHiddenToBoxes(); } catch(_e){}
		try{ workTypesSync.fromHiddenToBoxes(); } catch(_e){}
		try{ impactSync.fromHiddenToRadios(); } catch(_e){}
		try{ updateStatusPillFromHidden(); } catch(_e){}
		try{ updateResultBoxVisibility(); } catch(_e){}
		try{ updateClearButtonEnabled(); }catch(_e){}
		try{
			if(attachmentsManager && Array.isArray(item.files)){
				attachmentsManager.setServerFiles(item.files);
			}
		}catch(_e){}
		try{
			const incoming = Array.isArray(item._comments) ? item._comments : (Array.isArray(item.comments) ? item.comments : null);
			if(incoming){
				commentsList.innerHTML='';
				commentsSection.hidden = incoming.length === 0;
				for(const c of incoming){
					const txt = String(c.text||'');
					const who = String(c.user || c.created_by_name || '');
					const stamp = c.date || c.created_at || '';
					addComment(txt, who, stamp, c.id);
				}
			}
		}catch(_e){}
		try{
			const hiddenPairs = document.querySelector('input.meta-input[data-field="target_pairs"]');
			if(hiddenPairs && item.target_pairs_json != null){
				hiddenPairs.value = (typeof item.target_pairs_json === 'string') ? item.target_pairs_json : JSON.stringify(item.target_pairs_json);
			}
		}catch(_e){}
		// Structured hidden fields for chip selects
		try{
			const pu = document.querySelector('input.meta-input[data-field="participant_user_ids"]');
			if(pu && Array.isArray(item.participant_user_ids)){
				pu.value = JSON.stringify(item.participant_user_ids);
			}
			const pd = document.querySelector('input.meta-input[data-field="participant_dept_ids"]');
			if(pd && Array.isArray(item.participant_dept_ids)){
				pd.value = JSON.stringify(item.participant_dept_ids);
			}
			const vendorsEl = document.querySelector('input.meta-input[data-field="vendors"]');
			if(vendorsEl && Array.isArray(item.vendors)){
				vendorsEl.value = JSON.stringify(item.vendors);
			}
			const staffNamesEl = document.querySelector('input.meta-input[data-field="vendor_staff_names"]');
			if(staffNamesEl && Array.isArray(item.vendors) && item.vendors[0] && Array.isArray(item.vendors[0].staffs)){
				staffNamesEl.value = JSON.stringify(item.vendors[0].staffs.map(s=>s && s.staff_name).filter(Boolean));
			}
		}catch(_e){}
		// Re-hydrate chip UI (if initialized)
		try{
			$$('.js-chip-select').forEach(root=>{
				try{ root.__chipSelect && root.__chipSelect.hydrate && root.__chipSelect.hydrate(); }catch(_e){}
			});
		}catch(_e){}

		// 팀원 결재 영역: 작성자 정보로 채우기
		try{
			const authorName = item.created_by_name || item.owner_name || item.worker_name || '';
			const authorSig = item.created_by_signature_image || null;
			const _ca = item.created_at || '';
			const createdAt = _ca ? new Date(_ca.endsWith('Z') ? _ca : _ca + 'Z') : null;

			const signEl = $('[data-field="sign_member"]');
			if(signEl && authorName){
				if(authorSig){
					signEl.innerHTML = `<img src="${escapeHtml(authorSig)}" alt="서명" style="max-width:100%;max-height:80px;display:block;margin:0 auto;">`;
				} else {
					signEl.innerHTML = `<span style="font-size:1.6em;font-style:italic;font-weight:600;color:#1e293b;user-select:none;">${escapeHtml(authorName)}</span>`;
				}
			}
			const nameEl = $('[data-field="name_member"]');
			if(nameEl && authorName) nameEl.value = authorName;
			const dateEl = $('[data-field="date_member"]');
			if(dateEl && createdAt && !isNaN(createdAt.getTime())){
				const yy = String(createdAt.getFullYear()).slice(2);
				const mm = String(createdAt.getMonth()+1).padStart(2,'0');
				const dd = String(createdAt.getDate()).padStart(2,'0');
				const hh = String(createdAt.getHours()).padStart(2,'0');
				const mi = String(createdAt.getMinutes()).padStart(2,'0');
				dateEl.value = `'${yy}/${mm}/${dd} ${hh}:${mi}`;
			}
		}catch(_e){}

		// 팀장 결재 영역: INIT 승인자 정보로 채우기
		try{
			const approvals = Array.isArray(item.approvals) ? item.approvals : [];
			const initApproval = approvals.find(a => a && a.phase === 'INIT');
			if(initApproval){
				const leadName = initApproval.approver_name || '';
				const leadSig = initApproval.approver_signature_image || null;
				const _aa = initApproval.approved_at || '';
				const approvedAt = _aa ? new Date(_aa.endsWith('Z') ? _aa : _aa + 'Z') : null;

				const signLeadEl = $('[data-field="sign_lead"]');
				if(signLeadEl && leadName){
					if(leadSig){
						signLeadEl.innerHTML = `<img src="${escapeHtml(leadSig)}" alt="서명" style="max-width:100%;max-height:80px;display:block;margin:0 auto;">`;
					} else {
						signLeadEl.innerHTML = `<span style="font-size:1.6em;font-style:italic;font-weight:600;color:#1e293b;user-select:none;">${escapeHtml(leadName)}</span>`;
					}
				}
				const nameLeadEl = $('[data-field="name_lead"]');
				if(nameLeadEl && leadName) nameLeadEl.value = leadName;
				const dateLeadEl = $('[data-field="date_lead"]');
				if(dateLeadEl && approvedAt && !isNaN(approvedAt.getTime())){
					const yy = String(approvedAt.getFullYear()).slice(2);
					const mm = String(approvedAt.getMonth()+1).padStart(2,'0');
					const dd = String(approvedAt.getDate()).padStart(2,'0');
					const hh = String(approvedAt.getHours()).padStart(2,'0');
					const mi = String(approvedAt.getMinutes()).padStart(2,'0');
					dateLeadEl.value = `'${yy}/${mm}/${dd} ${hh}:${mi}`;
				}
			}
		}catch(_e){}

		// 서버에서 불러온 후: 빈 필드의 placeholder 숨기기 (보기 모드)
		try{
			inputs.forEach(inp => {
				if(!inp.value && inp.placeholder){
					inp.dataset.origPlaceholder = inp.placeholder;
					inp.placeholder = '';
				}
			});
			editables.forEach(ed => {
				if(!ed.innerHTML.trim() && ed.getAttribute('placeholder')){
					ed.dataset.origPlaceholder = ed.getAttribute('placeholder');
					ed.removeAttribute('placeholder');
				}
			});
		}catch(_e){}
	}

	async function loadFromApi(reportId){
		if(!reportId) return false;
		const { res, json } = await fetchJson(`/api/wrk/reports/${encodeURIComponent(reportId)}`);
		if(!res.ok || !json || json.success !== true || !json.item) return false;
		applyApiItemToForm(json.item);
		return true;
	}

	function collectFormData(){
		const data = {};
		inputs.forEach(i => data[i.dataset.field] = i.value);
		editables.forEach(e => data[e.dataset.field] = e.innerHTML);
		try{
			data.start_dt = normalizeDateTimeValue(data.start_dt);
			data.end_dt = normalizeDateTimeValue(data.end_dt);
		}catch(_e){}
		try{
			const commentObjs = $$('#comments-list .comment-item').map(it=>(
				{
					user: it.querySelector('.comment-user')?.textContent || '',
					date: it.querySelector('.comment-date')?.textContent || '',
					text: it.querySelector('.comment-text')?.textContent || ''
				}
			));
			data._comments = commentObjs;
		}catch(_e){}
		return data;
	}

	function safeJsonParse(val, fallback){
		if(val == null) return fallback;
		if(typeof val !== 'string') return val;
		const s = val.trim();
		if(!s) return fallback;
		try{ return JSON.parse(s); }catch(_e){ return fallback; }
	}

	function uniqueByKey(items, keyFn){
		const out = [];
		const seen = new Set();
		for(const it of (items||[])){
			const k = keyFn(it);
			if(k == null) continue;
			const sk = String(k);
			if(seen.has(sk)) continue;
			seen.add(sk);
			out.push(it);
		}
		return out;
	}

	function joinLabels(labels){
		return (labels||[]).map(s=>String(s||'').trim()).filter(Boolean).join(', ');
	}

	function setupChipSelects(){
		const roots = $$('.js-chip-select');
		if(!roots.length) return;
		const chipInstances = [];

		function getHiddenField(name){
			return document.querySelector(`.meta-input[data-field="${CSS.escape(name)}"]`);
		}

		function positionChipSuggestPortal(root, ul){
			if(!ul || ul.hidden) return;
			const searchEl = root && root.__chipSuggestSearchEl ? root.__chipSuggestSearchEl : null;
			if(!searchEl) return;
			try{
				const rect = searchEl.getBoundingClientRect();
				const vw = window.innerWidth || document.documentElement.clientWidth || 0;
				const margin = 8;
				let left = rect.left;
				let width = rect.width;
				if(vw){
					width = Math.min(Math.max(220, width), Math.max(220, vw - (margin * 2)));
					if(left + width > vw - margin) left = Math.max(margin, (vw - margin) - width);
					if(left < margin) left = margin;
				}
				ul.style.position = 'fixed';
				ul.style.left = `${Math.round(left)}px`;
				ul.style.top = `${Math.round(rect.bottom + 4)}px`;
				ul.style.width = `${Math.round(width)}px`;
				ul.style.zIndex = '100000';
			}catch(_e){}
		}

		function portalizeSuggest(root, ul){
			if(!root || !ul) return;
			// already portaled
			if(ul.parentNode === document.body) return;
			try{
				if(!root.__chipSuggestAnchor){
					root.__chipSuggestAnchor = document.createComment('chip-suggest-anchor');
					ul.parentNode && ul.parentNode.insertBefore(root.__chipSuggestAnchor, ul);
				}
				root.__chipSuggestHome = root.__chipSuggestAnchor && root.__chipSuggestAnchor.parentNode ? root.__chipSuggestAnchor.parentNode : ul.parentNode;
				document.body.appendChild(ul);
				ul.classList.add('chip-suggest-portal');
				positionChipSuggestPortal(root, ul);
				root.__chipSuggestPositioner = ()=>positionChipSuggestPortal(root, ul);
				window.addEventListener('scroll', root.__chipSuggestPositioner, true);
				window.addEventListener('resize', root.__chipSuggestPositioner);
			}catch(_e){}
		}

		function restoreSuggest(root, ul){
			if(!root || !ul) return;
			try{
				if(root.__chipSuggestPositioner){
					window.removeEventListener('scroll', root.__chipSuggestPositioner, true);
					window.removeEventListener('resize', root.__chipSuggestPositioner);
					root.__chipSuggestPositioner = null;
				}
			}catch(_e){}
			try{
				if(ul.parentNode === document.body && root.__chipSuggestAnchor && root.__chipSuggestAnchor.parentNode){
					ul.classList.remove('chip-suggest-portal');
					ul.removeAttribute('style');
					root.__chipSuggestAnchor.parentNode.insertBefore(ul, root.__chipSuggestAnchor);
				}
			}catch(_e){}
		}

		function hideSuggest(root){
			const ul = (root && root.__chipSuggestEl) ? root.__chipSuggestEl : root.querySelector('.js-chip-suggest');
			if(!ul) return;
			ul.hidden = true;
			ul.innerHTML = '';
			restoreSuggest(root, ul);
		}

		function showSuggestMessage(root, message){
			const ul = (root && root.__chipSuggestEl) ? root.__chipSuggestEl : root.querySelector('.js-chip-suggest');
			if(!ul) return;
			ul.hidden = false;
			ul.innerHTML = `<li class="share-suggest-status">${escapeHtml(message)}</li>`;
			portalizeSuggest(root, ul);
		}

		async function fetchJsonItems(url){
			const { res, json } = await fetchJson(url);
			if(!res.ok || !json || json.success !== true) return [];
			return Array.isArray(json.items) ? json.items : [];
		}

		async function suggestOrgDepartments(q){
			const url = `/api/org-departments?q=${encodeURIComponent(q)}&limit=50`;
			const items = await fetchJsonItems(url);
			return items.map(it=>({
				key: `dept:${it.id}`,
				id: it.id,
				label: it.dept_name || String(it.id),
				meta: '',
				type: 'dept'
			}));
		}

		async function suggestOrgUsers(q, parentDeptId, parentDeptNames){
			let url = `/api/user-profiles?q=${encodeURIComponent(q)}&limit=50`;
			const deptIds = Array.isArray(parentDeptId) ? parentDeptId : (parentDeptId ? [parentDeptId] : []);
			for(const raw of deptIds){
				const v = String(raw || '').trim();
				if(!v) continue;
				// Backend supports repeated department_id params (request.args.getlist)
				url += `&department_id=${encodeURIComponent(v)}`;
			}
			// Also pass department names for fallback matching (handles stale dept IDs)
			const deptNames = Array.isArray(parentDeptNames) ? parentDeptNames : (parentDeptNames ? [parentDeptNames] : []);
			for(const name of deptNames){
				const v = String(name || '').trim();
				if(!v) continue;
				url += `&department=${encodeURIComponent(v)}`;
			}
			const items = await fetchJsonItems(url);
			return items.map(it=>({
				key: `user:${it.id}`,
				id: it.id,
				label: it.name || it.emp_no || String(it.id),
				meta: it.department ? `${it.department}` : '',
				type: 'user'
			}));
		}

		function getSelectedByMode(mode){
			try{
				const r = document.querySelector(`.js-chip-select[data-chip-mode="${CSS.escape(mode)}"]`);
				const selected = (r && r.__chipSelect && typeof r.__chipSelect.getSelected === 'function')
					? r.__chipSelect.getSelected()
					: [];
				return Array.isArray(selected) ? selected : [];
			}catch(_e){
				return [];
			}
		}

		function resolveVendorNamesForStaffSuggest(){
			return getSelectedByMode('vendor')
				.map(v=>String(v && v.label || '').trim())
				.filter(Boolean);
		}

		function getSelectedDeptIdsByHiddenTextField(hiddenTextField){
			try{
				const deptRoot = document.querySelector(`.js-chip-select[data-chip-mode="org_dept"][data-chip-hidden-text-field="${CSS.escape(hiddenTextField)}"]`);
				const selected = (deptRoot && deptRoot.__chipSelect && typeof deptRoot.__chipSelect.getSelected === 'function')
					? deptRoot.__chipSelect.getSelected()
					: [];
				return (selected || [])
					.map(s=>s && s.id)
					.map(v=>{
						const n = parseInt(String(v || ''), 10);
						return Number.isFinite(n) && n > 0 ? String(n) : null;
					})
					.filter(Boolean);
			}catch(_e){
				return [];
			}
		}

		function getSelectedDeptNamesByHiddenTextField(hiddenTextField){
			try{
				const deptRoot = document.querySelector(`.js-chip-select[data-chip-mode="org_dept"][data-chip-hidden-text-field="${CSS.escape(hiddenTextField)}"]`);
				const selected = (deptRoot && deptRoot.__chipSelect && typeof deptRoot.__chipSelect.getSelected === 'function')
					? deptRoot.__chipSelect.getSelected()
					: [];
				return (selected || [])
					.map(s => String(s && s.label || '').trim())
					.filter(Boolean);
			}catch(_e){
				return [];
			}
		}

		function resolveDeptInfoForOrgUserSuggest(orgUserRoot){
			const hiddenTextField = orgUserRoot && orgUserRoot.dataset ? orgUserRoot.dataset.chipHiddenTextField : '';
			// Coupling rule:
			// - 담당자(worker) => 담당부서(rel_dept)
			// - 참여자(participants) => 참여부서(partner_dept) ONLY
			let deptField = 'rel_dept';
			if(hiddenTextField === 'participants') deptField = 'partner_dept';

			let ids = getSelectedDeptIdsByHiddenTextField(deptField);
			const names = getSelectedDeptNamesByHiddenTextField(deptField);

			// Fallback to the legacy single id mirror (담당부서 only)
			if(!ids.length && deptField === 'rel_dept'){
				try{
					const parentField = orgUserRoot && orgUserRoot.dataset ? orgUserRoot.dataset.chipParentIdField : '';
					const raw = parentField ? (getHiddenField(parentField)?.value || '').trim() : '';
					if(raw) ids = [raw];
				}catch(_e){}
			}
			return { ids, names };
		}

		async function suggestVendors(q){
			const [m, k] = await Promise.all([
				fetchJsonItems(`/api/vendor-manufacturers?q=${encodeURIComponent(q)}&limit=25`),
				fetchJsonItems(`/api/vendor-maintenance?q=${encodeURIComponent(q)}&limit=25`),
			]);
			const vendors = [];
			for(const it of (m||[])){
				const name = it.manufacturer_name || it.vendor || it.manufacturer_code || '';
				if(!name) continue;
				vendors.push({ key:`vendor:M:${it.id}`, id: it.id, label: name, meta: '제조사', vendorType:'manufacturer', type:'vendor' });
			}
			for(const it of (k||[])){
				const name = it.maintenance_name || it.vendor || it.maintenance_code || it.vendor_name || '';
				if(!name) continue;
				vendors.push({ key:`vendor:K:${it.id}`, id: it.id, label: name, meta: '유지보수', vendorType:'maintenance', type:'vendor' });
			}
			return uniqueByKey(vendors, v=>v.label.toLowerCase());
		}

		async function suggestVendorStaff(q, vendorName){
			let url = `/api/wrk/vendor-staff-suggest?q=${encodeURIComponent(q)}&limit=20`;
			const vendorNames = Array.isArray(vendorName) ? vendorName : (vendorName ? [vendorName] : []);
			for(const raw of vendorNames){
				const v = String(raw || '').trim();
				if(!v) continue;
				url += `&vendor_name=${encodeURIComponent(v)}`;
			}
			const items = await fetchJsonItems(url);
			return items.map(it=>({
				key: `staff:${(it.staff_name||'').toLowerCase()}`,
				id: null,
				label: it.staff_name || '',
				meta: it.vendor_name ? `${it.vendor_name}` : '',
				type: 'staff'
			})).filter(it=>it.label);
		}

		function renderChips(root, selected, opts){
			const wrap = root.querySelector('.js-chip-chips');
			if(!wrap) return;
			wrap.innerHTML = '';
			const textOnly = !!(root && root.dataset && root.dataset.chipDisplay === 'text');
			const isReadonly = !!(root && root.dataset && root.dataset.chipReadonly === '1');
			if(textOnly){
				for(let i=0;i<selected.length;i++){
					const item = selected[i];
					if(i > 0) wrap.appendChild(document.createTextNode(', '));
					const span = document.createElement('span');
					span.className = 'share-chip share-chip-textonly' + (isReadonly ? ' share-chip-readonly' : '');
					span.dataset.index = String(i);
					if(isReadonly){
						span.innerHTML = `<span class="share-chip-label">${escapeHtml(item.label)}</span>`;
					} else {
						span.innerHTML = `<span class="share-chip-label" title="클릭하여 제거">${escapeHtml(item.label)}</span>`;
						span.addEventListener('click', (e)=>{
							e.preventDefault();
							e.stopPropagation();
							opts && opts.onRemove && opts.onRemove(i);
						});
					}
					wrap.appendChild(span);
				}
				return;
			}
			for(let i=0;i<selected.length;i++){
				const item = selected[i];
				const typeClass = (item.type === 'dept') ? 'dept' : (item.type === 'user' ? 'user' : (item.type === 'vendor' ? 'dept' : 'user'));
				const badge = (item.type === 'dept') ? '부서' : (item.type === 'user' ? '구성원' : (item.type === 'vendor' ? (item.meta||'업체') : '직원'));
				const span = document.createElement('span');
				span.className = `share-chip share-chip-${typeClass}`;
				span.dataset.index = String(i);
				span.innerHTML = `
					<span class="share-chip-badge">${escapeHtml(badge)}</span>
					<span class="share-chip-label">${escapeHtml(item.label)}</span>
					<button type="button" class="share-chip-remove" aria-label="제거">×</button>
				`;
				span.querySelector('.share-chip-remove')?.addEventListener('click', (e)=>{
					e.preventDefault();
					e.stopPropagation();
					opts && opts.onRemove && opts.onRemove(i);
				});
				wrap.appendChild(span);
			}
		}

		function syncHiddenFields(root, selected){
			const hiddenTextField = root.dataset.chipHiddenTextField;
			const hiddenIdsField = root.dataset.chipHiddenIdsField;
			if(hiddenTextField){
				const el = getHiddenField(hiddenTextField);
				if(el){
					el.value = joinLabels(selected.map(s=>s.label));
					el.dispatchEvent(new Event('change', { bubbles:true }));
				}
			}
			if(hiddenIdsField){
				const el = getHiddenField(hiddenIdsField);
				if(el){
					if(root.dataset.chipMode === 'vendor'){
						// store vendors payload (list)
						const vendorsPayload = (selected || []).map(v=>({ vendor_name: v.label, staffs: [] }));
						el.value = JSON.stringify(vendorsPayload);
					} else if(root.dataset.chipMode === 'vendor_staff'){
						el.value = JSON.stringify(selected.map(s=>s.label));
					} else {
						el.value = JSON.stringify(selected.map(s=>s.id).filter(Boolean));
					}
					el.dispatchEvent(new Event('change', { bubbles:true }));
				}
			}
			// Keep some useful single-id mirrors
			if(root.dataset.chipMode === 'org_dept'){
				const el = getHiddenField('rel_dept_id');
				// For the 담당부서 selector (rel_dept), keep rel_dept_id as "primary" even in multi-select
				const isRelDeptSelector = (hiddenTextField === 'rel_dept');
				if(el && (root.dataset.chipSingle === '1' || isRelDeptSelector)){
					el.value = selected[0]?.id ? String(selected[0].id) : '';
					el.dispatchEvent(new Event('change', { bubbles:true }));
				}
			}
			if(root.dataset.chipMode === 'org_user'){
				const isWorkerField = (root.dataset.chipHiddenTextField === 'worker');
				const el = getHiddenField(isWorkerField ? 'worker_user_id' : '');
				// Even in multi-select, keep a "primary" worker_user_id for backward compatibility.
				if(el && isWorkerField){
					el.value = selected[0]?.id ? String(selected[0].id) : '';
					el.dispatchEvent(new Event('change', { bubbles:true }));
				}
			}
		}

		function attachInstance(root){
			const mode = root.dataset.chipMode;
			const single = root.dataset.chipSingle === '1';
			const isReadonly = root.dataset.chipReadonly === '1';
			const searchEl = root.querySelector('.js-chip-search');
			const suggestEl = root.querySelector('.js-chip-suggest');
			try{ root.__chipSuggestEl = suggestEl; root.__chipSuggestSearchEl = searchEl; }catch(_e){}
			let selected = [];
			let debounceTimer = null;
			let abort = null;
			const allowFreeText = (mode === 'vendor_staff');

			function setCollapsed(collapsed){
				root.classList.toggle('chip-collapsed', !!collapsed);
			}

			function setSelected(next, _opts){
				const opts = _opts || {};
				selected = Array.isArray(next) ? next.slice() : [];
				renderChips(root, selected, { onRemove: (idx)=>{
					const copy = selected.slice();
					copy.splice(idx,1);
					setSelected(copy);
					// vendor change may affect staff suggest
				} });
				syncHiddenFields(root, selected);
				try{ root.__chipDropdown && root.__chipDropdown.syncTrigger && root.__chipDropdown.syncTrigger(); }catch(_e){}
				// If there is a selection, hide search until user clicks to search again
				if(selected.length){
					setCollapsed(true);
				} else {
					setCollapsed(false);
				}
				// 칩이 있으면 placeholder 숨기기 (vendor_staff 등 freeText 모드 포함)
				if(searchEl){
					if(!searchEl._origPlaceholder) searchEl._origPlaceholder = searchEl.placeholder || '';
					searchEl.placeholder = selected.length ? '' : searchEl._origPlaceholder;
				}
				if(mode === 'vendor' && !opts._hydrating){
					// If vendor changes (user-driven), clear vendor staff chips
					const staffRoot = document.querySelector('.js-chip-select[data-chip-mode="vendor_staff"]');
					if(staffRoot && staffRoot !== root){
						try{ staffRoot.__chipSelect?.setSelected([]); }catch(_e){}
					}
				}
			}

			function hydrate(){
				// Hydrate from existing hidden values
				const H = { _hydrating: true };
				try{
					const hidIds = root.dataset.chipHiddenIdsField;
					const hidText = root.dataset.chipHiddenTextField;
					const idsEl = hidIds ? getHiddenField(hidIds) : null;
					const textEl = hidText ? getHiddenField(hidText) : null;
					if(mode === 'vendor'){
						const existing = safeJsonParse(idsEl?.value, null);
						if(Array.isArray(existing) && existing.length){
							const mapped = existing
								.map(v=>v && v.vendor_name ? String(v.vendor_name).trim() : '')
								.filter(Boolean)
								.map(name=>({ key:`vendor:${name}`, id:null, label: name, meta:'', vendorType:'', type:'vendor' }));
							setSelected(single ? mapped.slice(0,1) : mapped, H);
							return;
						}
						if(textEl && String(textEl.value||'').trim()){
							const parts = String(textEl.value||'').split(',').map(s=>s.trim()).filter(Boolean);
							const mapped = parts.map(name=>({ key:`vendor:${name}`, id:null, label: name, meta:'', vendorType:'', type:'vendor' }));
							setSelected(single ? mapped.slice(0,1) : mapped, H);
							return;
						}
						setSelected([], H);
						return;
					}
					if(mode === 'vendor_staff'){
						const existingNames = safeJsonParse(idsEl?.value, null);
						if(Array.isArray(existingNames) && existingNames.length){
							setSelected(existingNames.map(n=>({ key:`staff:${String(n).toLowerCase()}`, id:null, label:String(n), meta:'', type:'staff' })), H);
							return;
						}
						if(textEl && String(textEl.value||'').trim()){
							const parts = String(textEl.value||'').split(',').map(s=>s.trim()).filter(Boolean);
							setSelected(parts.map(n=>({ key:`staff:${String(n).toLowerCase()}`, id:null, label:String(n), meta:'', type:'staff' })), H);
							return;
						}
						setSelected([], H);
						return;
					}
					const existingIds = safeJsonParse(idsEl?.value, null);
					if(Array.isArray(existingIds) && existingIds.length && (mode === 'org_user' || mode === 'org_dept')){
						const ids = existingIds.map(n=>parseInt(n,10)).filter(n=>n>0);
						if(ids.length){
							const url = (mode === 'org_user')
								? `/api/user-profiles?ids=${encodeURIComponent(ids.join(','))}&limit=500`
								: `/api/org-departments?ids=${encodeURIComponent(ids.join(','))}&include_deleted=1`;
							fetchJsonItems(url).then(items=>{
								if(mode === 'org_user'){
									const mapped = ids.map(id=>{
										const it = items.find(x=>Number(x.id)===Number(id));
										return it ? ({ key:`user:${it.id}`, id: it.id, label: it.name || it.emp_no || String(it.id), meta: it.department||'', type:'user' }) : null;
									}).filter(Boolean);
									setSelected(single ? (mapped.slice(0,1)) : mapped, H);
								} else {
									const mapped = ids.map(id=>{
										const it = items.find(x=>Number(x.id)===Number(id));
										return it ? ({ key:`dept:${it.id}`, id: it.id, label: it.dept_name || String(it.id), meta: '', type:'dept' }) : null;
									}).filter(Boolean);
									setSelected(single ? (mapped.slice(0,1)) : mapped, H);
								}
							}).catch(_e=>{ setSelected([], H); });
							return;
						}
					}
					if(textEl && String(textEl.value||'').trim()){
						const parts = String(textEl.value||'').split(',').map(s=>s.trim()).filter(Boolean);
						if(parts.length){
							const mapped = parts.map(name=>({ key:`txt:${name.toLowerCase()}`, id:null, label:name, meta:'', type:(mode==='org_user'?'user':'dept') }));
							setSelected(single ? mapped.slice(0,1) : mapped, H);
							return;
						}
					}
					setSelected([], H);
				}catch(_e){}
			}

			async function loadSuggestions(q){
				const keyword = (q||'').trim();
				if(!keyword){
					hideSuggest(root);
					return;
				}
				if(keyword.length < 1){
					showSuggestMessage(root, '검색어를 입력하세요.');
					return;
				}
				if(abort){ try{ abort.abort(); }catch(_e){} }
				abort = new AbortController();
				showSuggestMessage(root, '검색 중...');
				try{
					let items = [];
					if(mode === 'org_dept'){
						items = await suggestOrgDepartments(keyword);
					} else if(mode === 'org_user'){
						const deptInfo = resolveDeptInfoForOrgUserSuggest(root);
						const hiddenTextField = root && root.dataset ? root.dataset.chipHiddenTextField : '';
						if((!deptInfo.ids || !deptInfo.ids.length) && (!deptInfo.names || !deptInfo.names.length)){
							showSuggestMessage(root, hiddenTextField === 'participants' ? '참여부서를 먼저 선택하세요.' : '담당부서를 먼저 선택하세요.');
							return;
						}
						items = await suggestOrgUsers(keyword, deptInfo.ids, deptInfo.names);
					} else if(mode === 'vendor'){
						items = await suggestVendors(keyword);
					} else if(mode === 'vendor_staff'){
						const vendorNames = resolveVendorNamesForStaffSuggest();
						if(!vendorNames.length){
							showSuggestMessage(root, '협력업체를 먼저 선택하세요.');
							return;
						}
						items = await suggestVendorStaff(keyword, vendorNames);
					}
					if(!suggestEl) return;
					if(!items.length){
						showSuggestMessage(root, '검색 결과가 없습니다.');
						return;
					}
					function getSuggestBadge(type, meta){
						if(type === 'dept') return '팀';
						if(type === 'user') return '구성원';
						if(type === 'vendor') return '업체';
						if(type === 'staff') return '직원';
						return (meta || '').trim() || '항목';
					}
					function shouldHideMeta(meta){
						const t = String(meta || '').trim();
						if(!t) return true;
						// Hide code-like strings such as IT_1_2
						if(/^[A-Za-z]{1,16}(?:_\d+){1,10}$/.test(t)) return true;
						return false;
					}
					suggestEl.hidden = false;
					suggestEl.innerHTML = items.map(it=>{
						const badge = getSuggestBadge(it.type, it.meta);
						const metaText = shouldHideMeta(it.meta) ? '' : String(it.meta || '').trim();
						const metaHtml = metaText ? `<span class="share-suggest-meta">${escapeHtml(metaText)}</span>` : '';
						return `<li class="share-suggest-option" data-key="${escapeHtml(it.key)}"><span class="share-chip-badge">${escapeHtml(badge)}</span><span class="share-suggest-text"><span class="share-suggest-label">${escapeHtml(it.label)}</span>${metaHtml}</span></li>`;
					}).join('');
					portalizeSuggest(root, suggestEl);
					suggestEl.querySelectorAll('li.share-suggest-option').forEach(li=>{
						li.addEventListener('click', ()=>{
							const key = li.getAttribute('data-key');
							const chosen = items.find(x=>x.key === key);
							if(!chosen) return;
							// Prevent duplicates
							if(selected.some(s=>s.key === chosen.key || (s.id && chosen.id && s.id === chosen.id))){
								showSuggestMessage(root, '이미 선택된 항목입니다.');
								return;
							}
							const next = single ? [chosen] : selected.concat([chosen]);
							setSelected(next);
							if(searchEl) searchEl.value = '';
							hideSuggest(root);
						});
					});
				}catch(err){
					if(err && err.name === 'AbortError') return;
					showSuggestMessage(root, '검색 중 오류가 발생했습니다.');
				}
			}

			if(searchEl){
				searchEl.addEventListener('input', ()=>{
					if(debounceTimer) clearTimeout(debounceTimer);
					debounceTimer = setTimeout(()=>loadSuggestions(searchEl.value), 200);
				});
				searchEl.addEventListener('focus', ()=>{
					setCollapsed(false);
				});
				searchEl.addEventListener('blur', ()=>{
					if((searchEl.value || '').trim()) return;
					if(selected.length) setCollapsed(true);
				});
				searchEl.addEventListener('keydown', (e)=>{
					const isTextOnly = !!(root && root.dataset && root.dataset.chipDisplay === 'text');
					if(isTextOnly && e.key === 'Backspace'){
						const cur = String(searchEl.value || '').trim();
						if(!cur && selected.length){
							e.preventDefault();
							const copy = selected.slice(0, Math.max(0, selected.length - 1));
							setSelected(copy);
							hideSuggest(root);
						}
						return;
					}
					if(e.key === 'Escape'){
						hideSuggest(root);
						if(selected.length) setCollapsed(true);
						return;
					}
					if(!allowFreeText) return;
					if(e.key === 'Enter'){
						e.preventDefault();
						const raw = (searchEl.value||'').trim();
						if(!raw) return;
						if(selected.some(s=>String(s.label).toLowerCase() === raw.toLowerCase())){
							showSuggestMessage(root, '이미 선택된 항목입니다.');
							return;
						}
						setSelected(selected.concat([{ key:`staff:${raw.toLowerCase()}`, id:null, label: raw, type:'staff', meta:'' }]));
						searchEl.value = '';
						hideSuggest(root);
					}
				});
			}
			// Click anywhere in the share area to start searching again
			if(!isReadonly){
				root.addEventListener('click', (e)=>{
					if(!searchEl) return;
					// If user clicked remove button, let that handler work
					if(e.target && (e.target.closest && e.target.closest('.share-chip-remove'))) return;
					setCollapsed(false);
					try{ searchEl.focus(); }catch(_e){}
				});
			}
			document.addEventListener('click', (event)=>{
				if(root.contains(event.target)) return;
				if(suggestEl && suggestEl.contains(event.target)) return;
				if(suggestEl && !suggestEl.hidden) hideSuggest(root);
			});

			hydrate();

			root.__chipSelect = { getSelected: ()=>selected.slice(), setSelected, hydrate };
			chipInstances.push(root.__chipSelect);
		}

		roots.forEach(attachInstance);
		return chipInstances;
	}

	async function upsertToApi(data){
		const title = String(data.task_title || '').trim();
		if(!title) return { ok:false, message:'작업명을 입력해 주세요.' };
		const startNorm = normalizeDateTimeValue(data.start_dt);
		const endNorm = normalizeDateTimeValue(data.end_dt);
		const participant_user_ids = safeJsonParse(data.participant_user_ids, null);
		const participant_dept_ids = safeJsonParse(data.participant_dept_ids, null);
		let vendors = safeJsonParse(data.vendors, null);
		// If vendor selected but vendors payload not present, build a minimal one
		if(!vendors && (data.vendor||'').trim()){
			vendors = [{ vendor_name: String(data.vendor||'').trim(), staffs: [] }];
		}
		// Attach vendor staffs if provided as list of names
		try{
			const staffNames = safeJsonParse(data.vendor_staff_names, null);
			if(Array.isArray(vendors) && vendors[0] && Array.isArray(staffNames)){
				vendors[0].staffs = staffNames.map(n=>({ staff_name: String(n||'').trim() })).filter(x=>x.staff_name);
			}
		}catch(_e){}
		const payload = {
			task_title: title,
			project: data.project || '',
			project_id: (function(){ try{ var el=document.querySelector('input.meta-input[data-field="project"]'); return el && el._getProjectId ? el._getProjectId() : null; }catch(_e){ return null; } })(),
			start_dt: startNorm || null,
			end_dt: endNorm || null,
			targets: data.targets || null,
			target_pairs: data.target_pairs || null,
			business: data.business || null,
			doc_no: data.doc_no || null,
			draft_dept: data.draft_dept || null,
			recv_dept: data.recv_dept || null,
			worker: data.worker || data.worker_name || null,
			partner_dept: data.partner_dept || data.partner_dept_text || null,
			participants: data.participants || data.participants_text || null,
			vendor: data.vendor || data.vendor_text || null,
			vendor_staff: data.vendor_staff || data.vendor_staff_text || null,
			overview: data.overview || null,
			service: data.service || null,
			precheck: data.precheck || null,
			procedure: data.procedure || null,
			postcheck: data.postcheck || null,
			resources: data.resources || null,
			etc: data.etc || null,
			report_result: data.report_result || null,
			impact: data.impact || null,
			draft_date: data.draft_date || null,
			payload_json: data,
			classifications: data.categories || null,
			worktypes: data.work_types || null,
			participant_user_ids: Array.isArray(participant_user_ids) ? participant_user_ids : undefined,
			participant_dept_ids: Array.isArray(participant_dept_ids) ? participant_dept_ids : undefined,
			vendors: Array.isArray(vendors) ? vendors : undefined,
		};

		if(REPORT_ID){
			const { res, json } = await fetchJson(`/api/wrk/reports/${encodeURIComponent(REPORT_ID)}` , { method:'PUT', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
			if(!res.ok || !json || json.success !== true){
				console.error('[upsertToApi] PUT 실패:', res.status, json);
				return { ok:false, message: (json && json.message) ? json.message : '서버 저장에 실패했습니다.' };
			}
			try{ applyApiItemToForm(json.item); } catch(_e){}
			try{ if(attachmentsManager){ await attachmentsManager.flushPendingUploads(REPORT_ID); } }catch(_e){}
			try{ if(commentsManager){ await commentsManager.flushPendingComments(REPORT_ID); } }catch(_e){}
			return { ok:true, id: REPORT_ID };
		}
		// Create
		const { res, json } = await fetchJson('/api/wrk/reports', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
		if(!res.ok || !json || json.success !== true || !json.item){
			console.error('[upsertToApi] POST 실패:', res.status, json);
			return { ok:false, message: (json && json.message) ? json.message : '서버 생성에 실패했습니다.' };
		}
		if(json.item.id){
			setReportId(json.item.id);
		}
		try{ applyApiItemToForm(json.item); } catch(_e){}
		try{ if(attachmentsManager && json.item.id){ await attachmentsManager.flushPendingUploads(json.item.id); } }catch(_e){}
		try{ if(commentsManager && json.item.id){ await commentsManager.flushPendingComments(json.item.id); } }catch(_e){}
		return { ok:true, id: json.item.id };
	}

	async function runWorkflowAction(){
		// 1) 현재 상태 기반 확인 메시지 결정 (저장 전에 모달 표시)
		const status = String(REPORT_STATUS_CODE || '').toUpperCase();
		let confirmMsg = '';
		let okMessage = '';
		let actionPath = '';   // submit endpoint suffix

		if(status === 'DRAFT'){
			confirmMsg = '작업보고서를 상신하시겠습니까?\n상신 후에는 팀장의 승인이 필요합니다.';
			okMessage = '상신되었습니다. (임시저장→검토)';
			actionPath = 'submit';
		}else if(status === 'REVIEW'){
			confirmMsg = '이 작업보고서를 승인하시겠습니까?';
			okMessage = '승인되었습니다. (검토→승인)';
			actionPath = 'approve-init';
		}else if(['APPROVED','SCHEDULED','IN_PROGRESS'].includes(status)){
			confirmMsg = '결과를 등록하시겠습니까?';
			okMessage = '결과가 등록되었습니다. (수행→완료대기)';
			actionPath = 'submit-result';
		}else if(status === 'COMPLETED'){
			confirmMsg = '최종 승인하시겠습니까?';
			okMessage = '최종 승인되었습니다. (완료대기→완료)';
			actionPath = 'approve-final';
		}else if(status === 'ARCHIVED'){
			toast('이미 최종 승인된 문서입니다.');
			return;
		}else{
			toast('현재 상태에서는 처리할 수 없습니다.');
			return;
		}

		// 2) 확인 모달을 먼저 표시 — 취소 시 저장하지 않음
		if(confirmMsg){
			const ok = await new Promise(resolve=>{
				if(typeof showConfirmModal === 'function'){
					showConfirmModal(confirmMsg, '작업보고서').then(resolve);
				} else if(confirm(confirmMsg)){
					resolve(true);
				} else {
					resolve(false);
				}
			});
			if(!ok) return;
		}

		// 3) 확인 후 저장
		const data = saveToStorage();
		let upsert;
		try{
			upsert = await upsertToApi(data);
			if(!upsert || !upsert.ok){
				toast(upsert && upsert.message ? upsert.message : '서버 저장에 실패했습니다.');
				return;
			}
		}catch(_e){
			toast('서버 저장 중 오류가 발생했습니다.');
			return;
		}

		if(!REPORT_ID){
			toast('먼저 저장이 필요합니다.');
			return;
		}

		// 4) 워크플로우 액션 실행
		const endpoint = `/api/wrk/reports/${encodeURIComponent(REPORT_ID)}/${actionPath}`;
		let actionPayload = {};
		if(actionPath === 'submit-result'){
			actionPayload = {
				report_result: data.report_result || null,
				result_type: data.result_type || null,
				actual_start_time: data.actual_start_time || null,
				actual_end_time: data.actual_end_time || null,
				actual_duration: data.actual_duration || null,
			};
		}

		try{
			const { res, json } = await fetchJson(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(actionPayload)
			});
			if(!res.ok || !json || json.success !== true){
				toast(json && json.message ? json.message : '처리에 실패했습니다.');
				return;
			}
			if(json.item){
				try{ applyApiItemToForm(json.item); }catch(_e){}
			}
			try{ updatePersistButton(); }catch(_e){}
			toast(okMessage || '처리되었습니다.');
			// 처리 후 팝업 닫기 (부모 창이 자동 새로고침)
			setTimeout(()=>{ try{ window.close(); }catch(_e){} }, 600);
		}catch(_e){
			toast('처리 중 오류가 발생했습니다.');
		}
	}
	// ---- 작업취소 모달 로직 ----
	function openCancelWorkModal(){
		const modal = document.getElementById('cancel-work-modal');
		if(!modal) return;
		modal.classList.add('show');
		modal.setAttribute('aria-hidden','false');
		document.body.classList.add('modal-open');
		const ta = document.getElementById('cancel-work-reason');
		if(ta){ ta.value = ''; ta.focus(); }
		setupCancelWorkModalOnce();
	}
	function closeCancelWorkModal(){
		const modal = document.getElementById('cancel-work-modal');
		if(!modal) return;
		modal.classList.remove('show');
		modal.setAttribute('aria-hidden','true');
		document.body.classList.remove('modal-open');
	}
	function setupCancelWorkModalOnce(){
		if(setupCancelWorkModalOnce._init) return;
		setupCancelWorkModalOnce._init = true;
		const modal = document.getElementById('cancel-work-modal');
		if(!modal) return;
		modal.addEventListener('click', (e)=>{ if(e.target === modal) closeCancelWorkModal(); });
		const btnClose = document.getElementById('cancel-work-close');
		const btnCancel = document.getElementById('cancel-work-cancel');
		btnClose && btnClose.addEventListener('click', closeCancelWorkModal);
		btnCancel && btnCancel.addEventListener('click', closeCancelWorkModal);
		const btnConfirm = document.getElementById('cancel-work-confirm');
		btnConfirm && btnConfirm.addEventListener('click', async ()=>{
			const ta = document.getElementById('cancel-work-reason');
			const reason = ta ? ta.value.trim() : '';
			if(!reason){ toast('취소 사유를 입력하세요.'); return; }
			if(!REPORT_ID){ toast('먼저 저장이 필요합니다.'); return; }
			try{
				const endpoint = `/api/wrk/reports/${encodeURIComponent(REPORT_ID)}/cancel`;
				const { res, json } = await fetchJson(endpoint, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ cancel_reason: reason })
				});
				if(!res.ok || !json || json.success !== true){
					toast(json && json.message ? json.message : '작업취소 처리에 실패했습니다.');
					return;
				}
				if(json.item){
					try{ applyApiItemToForm(json.item); }catch(_e){}
				}
				closeCancelWorkModal();
				try{ updatePersistButton(); }catch(_e){}
				try{ lockFormForCompleted(); }catch(_e){}
				toast('작업이 취소되었습니다.');
				setTimeout(()=>{ try{ window.close(); }catch(_e){} }, 600);
			}catch(_e){
				toast('작업취소 처리 중 오류가 발생했습니다.');
			}
		});
		document.addEventListener('keydown', (e)=>{
			if(e.key === 'Escape' && modal.classList.contains('show')) closeCancelWorkModal();
		});
	}
	// 작업취소 버튼 이벤트 등록
	{
		const cancelBtn = document.getElementById('btn-cancel-work');
		if(cancelBtn){
			cancelBtn.addEventListener('click', openCancelWorkModal);
		}
	}

	// --- Editor rewrites: arrows + note callout ('※') ---
	function cleanupLegacyListMarkup(el){
		// Legacy reports may have been saved with <ul><li> from older auto-bullet logic.
		// Convert them to plain paragraphs so nothing renders as a bullet list.
		if(!el || !el.querySelectorAll) return;
		const lists = Array.from(el.querySelectorAll('ul, ol'));
		if(!lists.length) return;
		for(const list of lists){
			const children = Array.from(list.children || []);
			const items = children.filter(ch => ch && ch.tagName && ch.tagName.toLowerCase() === 'li');
			const frag = document.createDocumentFragment();
			for(const li of items){
				const text = String(li.textContent || '').trim();
				if(!text) continue;
				const p = document.createElement('p');
				p.textContent = text;
				frag.appendChild(p);
			}
			try{ list.replaceWith(frag); }catch(_e){ try{ list.remove(); }catch(_e2){} }
		}
	}
	function _replaceArrowsInText(text){
		return String(text||'')
			.replace(/<\-/g, '←')
			.replace(/\-\>/g, '→');
	}
	function applyArrowRewrites(root){
		if(!root) return;
		try{
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			let node;
			while((node = walker.nextNode())){
				const cur = node.nodeValue || '';
				const next = _replaceArrowsInText(cur);
				if(next !== cur) node.nodeValue = next;
			}
		}catch(_e){}
	}
	function needsRichFormat(text){
		// Only handle note callout lines now. (Bullet list auto-formatting removed.)
		return /^\s*※/m.test(String(text||''));
	}
	function formatWithMarkers(text){
		const lines = String(text||'').replace(/\r\n?/g,'\n').split('\n');
		const out = [];
		let i=0;
		while(i < lines.length){
			const line = lines[i];
			if(!line){ out.push(''); i++; continue; }
			// Note callout: lines starting with '※'
			if(/^\s*※/.test(line)){
				const body = _replaceArrowsInText(line.replace(/^\s*※\s*/, ''));
				out.push(`<div class="note-callout"><span class="note-icon">※</span><div class="note-body">${escapeHtml(body)}</div></div>`);
				i++; continue;
			}
			// Plain paragraph
			out.push(`<p>${escapeHtml(_replaceArrowsInText(line))}</p>`);
			i++;
		}
		// Collapse multiple blank paragraphs
		return out.join('\n').replace(/(?:<p><\/p>\n?)+/g,'');
	}
	function applyRichMarkers(el){
		if(!el) return;
		const rawText = el.innerText || '';
		if(!needsRichFormat(rawText)) return; // don't alter if markers absent
		const html = formatWithMarkers(rawText);
		if(html && html !== el.innerHTML){
			el.innerHTML = html;
		}
	}

	// Map Korean status to list-page dot class
	function statusToDotClass(txt){
		const t = String(txt||'').trim();
		if(t === '임시저장') return 'ws-idle';
		if(t === '검토') return 'ws-wait';
		if(t === '승인') return 'ws-idle';
		if(t === '진행') return 'ws-run';
		if(t === '대기' || t === '보류') return 'ws-wait';
		if(t === '유휴' || t === '대기중') return 'ws-idle';
		// fallback
		return 'ws-run';
	}

	function updateStatusPillFromHidden(){
		const hidden = document.querySelector('input.meta-input[data-field="report_status"]');
		const pill = document.getElementById('report-status-pill');
		const dot = pill ? pill.querySelector('.status-dot') : null;
		const textEl = document.getElementById('report-status-text');
		if(!hidden || !pill || !dot || !textEl) return;
		const val = hidden.value || '임시저장';
		textEl.textContent = val;
		// reset dot classes
		dot.classList.remove('ws-run','ws-idle','ws-wait');
		dot.classList.add(statusToDotClass(val));
		pill.setAttribute('aria-label', `상태: ${val}`);
		try{ updateResultBoxVisibility(); }catch(_e){}
	}

	/** 결과 보고 박스(box-3) 표시: 수행(IN_PROGRESS) / 완료대기(COMPLETED) / 완료(ARCHIVED) 상태에서만 보임 */
	function updateResultBoxVisibility(){
		const box3 = document.getElementById('box-3');
		if(!box3) return;
		const st = String(REPORT_STATUS_CODE || '').toUpperCase();
		const show = (st === 'IN_PROGRESS' || st === 'COMPLETED' || st === 'ARCHIVED');
		box3.style.display = show ? '' : 'none';
	}

	function ensureDefaultStatus(){
		try{
			const hidden = document.querySelector('input.meta-input[data-field="report_status"]');
			if(hidden && !String(hidden.value||'').trim()){
				hidden.value = '임시저장';
			}
			updateStatusPillFromHidden();
			updateClearButtonEnabled();
		}catch(_e){}
	}

	async function ensureDraftDeptFromSession(){
		const el = document.querySelector('input.meta-input[data-field="draft_dept"]');
		if(!el) return;
		if(String(el.value||'').trim()) return;
		try{
			const { res, json } = await fetchJson('/api/session/me');
			if(!res.ok || !json || json.success !== true) return;
			const dept = (json.user && (json.user.dept_name || json.user.department)) ? String(json.user.dept_name || json.user.department).trim() : '';
			if(dept){
				el.value = dept;
				try{ el.dispatchEvent(new Event('input', { bubbles:true })); }catch(_e){}
			}
		}catch(_e){}
	}

	function attachTypeahead(inputEl, fetchItems){
		if(!inputEl || !(inputEl instanceof HTMLInputElement)) return;
		if(inputEl._reportTypeaheadAttached) return;
		const list = document.createElement('ul');
		list.className = 'report-typeahead';
		document.body.appendChild(list);
		let activeIndex = -1;
		let lastItems = [];
		let hideTimer = null;
		let tm = null;

		function hide(){
			list.style.display = 'none';
			activeIndex = -1;
			lastItems = [];
			list.innerHTML = '';
		}
		function position(){
			const r = inputEl.getBoundingClientRect();
			list.style.left = `${Math.round(r.left)}px`;
			list.style.top = `${Math.round(r.bottom + 4)}px`;
			list.style.width = `${Math.round(r.width)}px`;
		}
		function setActive(idx){
			activeIndex = idx;
			Array.from(list.querySelectorAll('li')).forEach((li, i)=>{
				li.classList.toggle('active', i === idx);
			});
		}
		function commit(value){
			inputEl.value = value;
			hide();
			try{ inputEl.dispatchEvent(new Event('input', { bubbles:true })); }catch(_e){}
			try{ inputEl.dispatchEvent(new Event('change', { bubbles:true })); }catch(_e){}
		}
		async function refresh(){
			const q = String(inputEl.value||'').trim();
			if(q.length < 1){ hide(); return; }
			const items = await fetchItems(q).catch(()=>[]);
			lastItems = Array.isArray(items) ? items : [];
			list.innerHTML = '';
			position();
			if(!lastItems.length){
				const li = document.createElement('li');
				li.className = 'empty';
				li.textContent = '검색 결과 없음';
				list.appendChild(li);
				list.style.display = 'block';
				return;
			}
			lastItems.slice(0, 20).forEach((v, idx)=>{
				const li = document.createElement('li');
				li.textContent = v;
				li.addEventListener('mousedown', (e)=>{
					e.preventDefault();
					commit(v);
				});
				list.appendChild(li);
				if(idx === 0) setActive(0);
			});
			list.style.display = 'block';
		}

		inputEl.addEventListener('input', ()=>{
			clearTimeout(tm);
			tm = setTimeout(refresh, 150);
		});
		inputEl.addEventListener('focus', ()=>{
			clearTimeout(tm);
			tm = setTimeout(refresh, 0);
		});
		inputEl.addEventListener('blur', ()=>{
			clearTimeout(hideTimer);
			hideTimer = setTimeout(hide, 120);
		});
		window.addEventListener('scroll', ()=>{ if(list.style.display === 'block') position(); }, true);
		window.addEventListener('resize', ()=>{ if(list.style.display === 'block') position(); });

		inputEl.addEventListener('keydown', (e)=>{
			if(list.style.display !== 'block') return;
			if(e.key === 'Escape'){ hide(); return; }
			if(e.key === 'ArrowDown'){
				e.preventDefault();
				if(!lastItems.length) return;
				const next = Math.min(lastItems.length - 1, (activeIndex < 0 ? 0 : activeIndex + 1));
				setActive(next);
				return;
			}
			if(e.key === 'ArrowUp'){
				e.preventDefault();
				if(!lastItems.length) return;
				const prev = Math.max(0, (activeIndex < 0 ? 0 : activeIndex - 1));
				setActive(prev);
				return;
			}
			if(e.key === 'Enter'){
				if(activeIndex >= 0 && activeIndex < lastItems.length){
					e.preventDefault();
					commit(lastItems[activeIndex]);
				}
			}
		});

		inputEl._reportTypeaheadAttached = true;
	}

	function initSuggestInputs(){
		const recvEl = document.querySelector('input.meta-input[data-field="recv_dept"]');
		attachTypeahead(recvEl, async (q)=>{
			const { res, json } = await fetchJson(`/api/org-departments?q=${encodeURIComponent(q)}`);
			if(!res.ok || !json || json.success !== true) return [];
			return (json.items || []).map(it=> (it && it.dept_name ? String(it.dept_name) : '')).filter(Boolean);
		});

		const projectEl = document.querySelector('input.meta-input[data-field="project"]');
		/* project_id tracking — 프로젝트 필드는 읽기전용(프로젝트 탭 매핑)이므로 typeahead 불필요 */
		var _selectedProjectId = null;
		if(projectEl){
			/* expose getter for upsertToApi (hydrate sets this via _pEl._getProjectId) */
			projectEl._getProjectId = function(){ return _selectedProjectId; };
		}
	}

		const inputs = $$('.meta-input');
		const editables = $$('[contenteditable="true"][data-field]');

	// ---- 작업대상/시스템 업로드 모달 ----
	const targetsState = {
		pairs: /** @type {{target:string, system:string}[]} */([])
	};

	function _normalizePair(pair){
		const rawId = (pair && (pair.id ?? pair.asset_id ?? pair.assetId ?? pair.assetID)) ?? '';
		const id = rawId == null ? '' : String(rawId).trim();
		const target = String(pair?.target || '').trim();
		const system = String(pair?.system || '').trim();
		return { id, target, system };
	}
	function _pairKey(pair){
		const p = _normalizePair(pair);
		if(p.id) return `id:${p.id}`;
		return `${p.target}||${p.system}`;
	}
	function _dedupePairs(pairs){
		const out = [];
		const seen = new Set();
		for(const p of (Array.isArray(pairs) ? pairs : [])){
			const norm = _normalizePair(p);
			if(!norm.target && !norm.system) continue;
			const k = _pairKey(norm);
			if(seen.has(k)) continue;
			seen.add(k);
			out.push(norm);
		}
		return out;
	}
	function _pairsSummary(pairs, field){
		const n = Array.isArray(pairs) ? pairs.length : 0;
		if(n <= 0) return '';
		const first = _normalizePair(pairs[0]);
		const firstVal = field === 'system' ? first.system : first.target;
		if(n === 1) return firstVal || '1대';
		return `${firstVal || '1대'} 외 ${n-1}대`;
	}
	function applyPairsToInputs(pairs){
		const normalized = _dedupePairs(pairs);
		targetsState.pairs = normalized;
		const hidden = document.querySelector('input.meta-input[data-field="target_pairs"]');
		const displayTargets = document.querySelector('input.meta-input[data-field="targets"]');
		const displayBiz = document.querySelector('input.meta-input[data-field="business"]');
		const targetsMoreBtn = document.getElementById('targets-more');
		const countEl = document.getElementById('targets-count');
		const n = normalized.length;
		if(hidden){ hidden.value = JSON.stringify(normalized); hidden.dispatchEvent(new Event('input', {bubbles:true})); }
		if(displayTargets){ displayTargets.value = n>0 ? _pairsSummary(normalized, 'target') : ''; displayTargets.dispatchEvent(new Event('input', {bubbles:true})); }
		if(displayBiz){ displayBiz.value = n>0 ? _pairsSummary(normalized, 'system') : ''; displayBiz.dispatchEvent(new Event('input', {bubbles:true})); }
		// 요청: 입력 옆의 작은 count는 숨김
		if(countEl){ countEl.textContent = ''; countEl.hidden = true; }
		if(targetsMoreBtn) targetsMoreBtn.hidden = !(n>0);
	}

	function parseDelimited(text){
		if(!text) return [];
		const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
		if(lines.length===0) return [];
		// Detect delimiter: prefer comma, else tab, else semicolon
		const detectDelim = (s)=> s.includes(',')? ',': (s.includes('\t')? '\t' : (s.includes(';')? ';':','));
		const first = lines[0];
		const delim = detectDelim(first);
		const splitCsv = (line)=>{
			if(delim!==',') return line.split(delim);
			// CSV: split by commas not within double quotes
			const re = /,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/g;
			// handle quoted values: remove wrapping quotes
			return line.split(re).map(v=>{
				v = v.trim();
				if(v.startsWith('"') && v.endsWith('"')) v = v.slice(1,-1).replace(/\"\"/g,'"');
				return v;
			});
		};
		let rows = lines.map(splitCsv);
		// Optional header detection
		const header = rows[0].map(s=>s.replace(/\s+/g,'').toLowerCase());
		if(header[0].includes('작업대상') || header[0].includes('대상') || header[1]?.includes('시스템')){
			rows = rows.slice(1);
		}
		return rows.map(cols=>({target:String(cols[0]||'').trim(), system:String(cols[1]||'').trim()}))
			.filter(r=>r.target||r.system);
	}

	function renderTargetsPreview(){
		const tbody = $('#targets-preview-tbody');
		const countEl = $('#targets-preview-count');
		if(!tbody || !countEl) return;
		tbody.innerHTML = '';
		targetsState.pairs.forEach(p=>{
			const tr = document.createElement('tr');
			tr.innerHTML = `<td>${escapeHtml(p.target)}</td><td>${escapeHtml(p.system)}</td>`;
			tbody.appendChild(tr);
		});
		countEl.textContent = `${targetsState.pairs.length}건`;
		const confirmBtn = $('#targets-upload-confirm');
		if(confirmBtn) confirmBtn.disabled = targetsState.pairs.length===0;
	}

	function escapeHtml(s){
		return String(s || '').replace(/[&<>"']/g, (c)=>({
			'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
		}[c]||c));
	}

	function openTargetsModal(){
		const modal = $('#targets-upload-modal');
		if(!modal) return;
		modal.classList.add('show');
		modal.setAttribute('aria-hidden','false');
		document.body.classList.add('modal-open');
	}
	function closeTargetsModal(){
		const modal = $('#targets-upload-modal');
		if(!modal) return;
		modal.classList.remove('show');
		modal.setAttribute('aria-hidden','true');
		document.body.classList.remove('modal-open');
	}

	function setupTargetsModal(){
		const btn = $('#targets-upload-btn');
		const btnToolbar = $('#btn-targets-upload');
		const drop = $('#targets-upload-dropzone');
		const fileInput = $('#targets-upload-input');
		const closeBtn = $('#targets-upload-close');
		const confirmBtn = $('#targets-upload-confirm');
		const tmplBtn = $('#targets-template-download');
		if(btn){ btn.addEventListener('click', openTargetsModal); }
		if(btnToolbar){ btnToolbar.addEventListener('click', openTargetsModal); }
		if(closeBtn){ closeBtn.addEventListener('click', closeTargetsModal); }
		// Click outside content to close
		const modalRoot = $('#targets-upload-modal');
		if(modalRoot){
			modalRoot.addEventListener('click', (e)=>{
				if(e.target === modalRoot){ closeTargetsModal(); }
			});
		}
		// Escape to close when open
		document.addEventListener('keydown', (e)=>{
			if(e.key === 'Escape'){
				const isOpen = modalRoot && modalRoot.classList.contains('show');
				if(isOpen) closeTargetsModal();
			}
		});
		async function ensureSheetJS(){
			if(window.XLSX) return;
			await new Promise((resolve, reject)=>{
				const s = document.createElement('script');
				s.src = 'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js';
				s.async = true; s.onload = resolve; s.onerror = ()=>reject(new Error('SheetJS load failed'));
				document.head.appendChild(s);
			});
		}
		function ext(name){ return (name||'').toLowerCase().split('.').pop(); }
		async function onFiles(files){
			const f = files && files[0]; if(!f) return;
			const e = ext(f.name);
			try{
				if(e === 'xlsx' || e === 'xls'){
					await ensureSheetJS();
					const reader = new FileReader();
					reader.onload = ()=>{
						try{
							const data = new Uint8Array(reader.result);
							const wb = window.XLSX.read(data, {type:'array'});
							const ws = wb.Sheets[wb.SheetNames[0]];
							let rows = window.XLSX.utils.sheet_to_json(ws, {header:1, raw:false});
							// Header detection: drop first row if it looks like a header
							if(Array.isArray(rows) && rows.length){
								const h0 = String(rows[0][0]||'').replace(/\s+/g,'').toLowerCase();
								const h1 = String(rows[0][1]||'').replace(/\s+/g,'').toLowerCase();
								if(h0.includes('작업대상') || h1.includes('시스템')){
									rows = rows.slice(1);
								}
							}
							targetsState.pairs = (rows||[])
								.map(r=>({target:String(r[0]||'').trim(), system:String(r[1]||'').trim()}))
								.filter(r=>r.target||r.system);
							afterParse(f);
						}catch(err){ toast('엑셀 파일을 읽는 중 오류가 발생했습니다.'); }
					};
					reader.readAsArrayBuffer(f);
				}else{
					toast('지원 가능한 확장자: XLS, XLSX');
				}
			}catch(_err){ toast('파일을 읽을 수 없습니다.'); }
		}
		function afterParse(f){
			if(confirmBtn){ confirmBtn.disabled = targetsState.pairs.length===0; }
			const meta = $('#targets-upload-meta'); const chip = $('#targets-upload-file-chip');
			if(meta && chip){
				// Build a chip like tab72 scope: [EXT] filename ........ size
				const sizeKB = Math.round((f.size/1024) * 10) / 10; // one decimal
				const ext = String((f.name.split('.').pop()||'')).toUpperCase();
				const safeName = escapeHtml(f.name);
				chip.innerHTML = `<div class="left"><span class="file-ext">${ext}</span><span class="file-name" title="${safeName}">${safeName}</span></div><span class="file-size">${sizeKB} KB</span>`;
				meta.hidden = false;
			}
		}
		if(drop){
			drop.addEventListener('click', ()=> fileInput && fileInput.click());
			drop.addEventListener('dragover', (e)=>{ e.preventDefault(); drop.classList.add('dragover'); });
			drop.addEventListener('dragleave', ()=> drop.classList.remove('dragover'));
			drop.addEventListener('drop', (e)=>{ e.preventDefault(); drop.classList.remove('dragover'); onFiles(e.dataTransfer?.files); });
		}
		if(fileInput){ fileInput.addEventListener('change', ()=> onFiles(fileInput.files)); }
		if(tmplBtn){
			tmplBtn.addEventListener('click', async ()=>{
				try{
					await ensureSheetJS();
					const wb = window.XLSX.utils.book_new();
					const data = [
						['작업대상','시스템명'],
						['서버A','시스템1'],
						['서버B','시스템2']
					];
					const ws = window.XLSX.utils.aoa_to_sheet(data);
					window.XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
					window.XLSX.writeFile(wb, 'targets_template.xlsx');
				}catch(_e){
					toast('양식을 생성할 수 없습니다.');
				}
			});
		}
		if(confirmBtn){
			confirmBtn.addEventListener('click', ()=>{
				applyPairsToInputs(targetsState.pairs);
				toast('대상/시스템이 등록되었습니다.');
				closeTargetsModal();
			});
		}
	}

	// ---- 더보기(입력값 전체 보기) ----
	function setupFieldMore(){
		const targetsInput = document.querySelector('input.meta-input[data-field="targets"]');
		const businessInput = document.querySelector('input.meta-input[data-field="business"]');
		const targetsMore = document.getElementById('targets-more');
		const businessMore = document.getElementById('business-more');

		function isOverflowingInput(input){
			if(!input) return false;
			try{
				return input.scrollWidth > input.clientWidth;
			}catch(_e){ return false; }
		}
		function refreshMore(){
			// Show when overflow OR when we have uploaded pairs
			let pairsLen = 0;
			try{
				const hidden = document.querySelector('input.meta-input[data-field="target_pairs"]');
				if(hidden && hidden.value){ const arr = safeJsonParse(hidden.value||'[]', []); if(Array.isArray(arr)) pairsLen = arr.length; }
			}catch(_e){}
			if(targetsInput && targetsMore){
				targetsMore.hidden = !((targetsInput.value||'').trim() && (isOverflowingInput(targetsInput) || pairsLen>0));
			}
			// 시스템명 더보기는 비활성화(항상 숨김)
			if(businessInput && businessMore){ businessMore.hidden = true; }
		}
		function openMoreModal(label, value){
			const modal = document.getElementById('field-more-modal');
			if(!modal) return;
			const title = document.getElementById('field-more-title');
			const sub = document.getElementById('field-more-sub');
			const body = document.getElementById('field-more-text');
			if(title) title.textContent = label + ' 전체 내용';
			if(sub) sub.textContent = '입력값 전체를 확인합니다.';
			if(body){
				// If we have uploaded pairs, show the list per requested label
				try{
					const hidden = document.querySelector('input.meta-input[data-field="target_pairs"]');
					let arr = hidden?.value ? safeJsonParse(hidden.value, []) : [];
					if(Array.isArray(arr) && arr.length){
						if(label === '작업대상'){
							// Helper: persist pairs and update summaries/UI
							const persistPairs = ()=>{
								try{
									applyPairsToInputs(arr);
								}catch(_e){}
							};

							// Render function with delete icon per row (no inline edit)
							const renderTable = ()=>{
								const rows = arr.map((x, idx)=> {
									const tgt = escapeHtml(String(x.target||'').trim());
									const sys = escapeHtml(String(x.system||'').trim());
									return `<tr data-idx=\"${idx}\"><td>${tgt}</td><td class=\"sys-text\">${sys}</td><td><button type=\"button\" class=\"icon-btn row-del\" title=\"삭제\" aria-label=\"삭제\" data-idx=\"${idx}\"><img src=\"/static/image/svg/list/free-icon-trash.svg\" alt=\"\" aria-hidden=\"true\"></button></td></tr>`;
								}).join('');
								body.innerHTML = `<div class=\"table-wrap mini\"><table class=\"mini-table\"><thead><tr><th>업무명</th><th>시스템명</th><th>삭제</th></tr></thead><tbody>${rows}</tbody></table></div>`;
								// Wire delete event
								const onDelete = (e)=>{
									const btn = e.target.closest('.row-del');
									if(!btn) return;
									const i = Number(btn.getAttribute('data-idx'));
									if(Number.isNaN(i)) return;
									arr.splice(i,1);
									persistPairs();
									// re-render to update indices
									renderTable();
								};
								body.querySelector('tbody').addEventListener('click', onDelete);
							};

							// initial render
							renderTable();
						}else if(label === '시스템명'){
							// Not used anymore, but keep graceful fallback
							body.textContent = arr.map(x=> String(x.system||'').trim()).filter(Boolean).join('\n');
						}else{
							body.textContent = value || '';
						}
					}else{
						body.textContent = value || '';
					}
				}catch(_e){ body.textContent = value || ''; }
			}
			modal.classList.add('show');
			modal.setAttribute('aria-hidden','false');
			document.body.classList.add('modal-open');
			const btnClose = document.getElementById('field-more-close');
			const btnOk = document.getElementById('field-more-ok');
			const onClose = ()=>{
				modal.classList.remove('show');
				modal.setAttribute('aria-hidden','true');
				document.body.classList.remove('modal-open');
				modal.removeEventListener('click', onOverlay);
				btnClose && btnClose.removeEventListener('click', onClose);
				btnOk && btnOk.removeEventListener('click', onClose);
				document.removeEventListener('keydown', onEsc);
			};
			function onOverlay(e){ if(e.target === modal) onClose(); }
			function onEsc(e){ if(e.key === 'Escape'){ onClose(); } }
			modal.addEventListener('click', onOverlay);
			btnClose && btnClose.addEventListener('click', onClose);
			btnOk && btnOk.addEventListener('click', onClose);
			document.addEventListener('keydown', onEsc);
		}
		if(targetsMore){ targetsMore.addEventListener('click', ()=> openMoreModal('작업대상', targetsInput ? targetsInput.value : '')); }
		if(businessMore){ businessMore.addEventListener('click', ()=> openMoreModal('시스템명', businessInput ? businessInput.value : '')); }
		if(targetsInput){ targetsInput.addEventListener('input', refreshMore); }
		if(businessInput){ businessInput.addEventListener('input', refreshMore); }
		window.addEventListener('resize', refreshMore);
		// initial state
		refreshMore();
	}

	// ---- 시스템 선택 모달 (작업대상/시스템명 클릭) ----
	const systemSelectState = {
		activeCategory: 'SERVER',
		page: 1,
		pageSize: 50,
		total: 0,
		appliedPairs: /** @type {{target:string, system:string}[]} */([]),
		appliedKeys: /** @type {Set<string>} */(new Set()),
		selectedPairs: /** @type {{target:string, system:string}[]} */([]),
		selectedKeys: /** @type {Set<string>} */(new Set()),
		codesLoaded: false,
		codesLoading: false,
		reloadTimer: /** @type {any} */(null)
	};

	function _systemSelectTotalPages(){
		const ps = Number(systemSelectState.pageSize || 50);
		const total = Number(systemSelectState.total || 0);
		return Math.max(1, Math.ceil(total / Math.max(1, ps)));
	}
	function _systemSelectSyncPager(){
		const labelEl = document.getElementById('system-select-page-label');
		const prevBtn = document.getElementById('system-select-page-prev');
		const nextBtn = document.getElementById('system-select-page-next');
		if(!labelEl && !prevBtn && !nextBtn) return;
		const totalPages = _systemSelectTotalPages();
		const page = Math.min(Math.max(1, Number(systemSelectState.page || 1)), totalPages);
		if(labelEl) labelEl.textContent = `${page} / ${totalPages}`;
		if(prevBtn) prevBtn.disabled = page <= 1;
		if(nextBtn) nextBtn.disabled = page >= totalPages;
	}

	// ---- Searchable dropdown (system-select filters) ----
	const _syselDropdownRegistry = {};
	let _syselActiveDropdownKey = null;
	function _syselCloseActiveDropdown(){
		if(_syselActiveDropdownKey && _syselDropdownRegistry[_syselActiveDropdownKey]){
			try{ _syselDropdownRegistry[_syselActiveDropdownKey].close(); }catch(_e){}
		}
	}
	function _syselFilterOptionButtons(optionButtons, keyword){
		const term = String(keyword||'').trim().toLowerCase();
		optionButtons.forEach((btn)=>{
			const holder = btn.closest('li') || btn;
			const label = String(btn.getAttribute('data-label') || btn.textContent || '').toLowerCase();
			holder.style.display = (!term || label.includes(term)) ? '' : 'none';
		});
	}
	function _syselMarkSelection(optionButtons, value){
		const v = String(value||'');
		optionButtons.forEach((btn)=>{
			btn.classList.toggle('is-selected', String(btn.getAttribute('data-value')||'') === v);
		});
	}
	function _syselInitSearchableSelect(selectEl, key, placeholder){
		if(!selectEl || selectEl.dataset && selectEl.dataset.syselDropdownBound === '1') return;
		const td = selectEl.closest('td');
		if(!td) return;

		// wrapper
		const field = document.createElement('div');
		field.className = 'dropdown-field sysel-dropdown';
		field.setAttribute('data-sysel-dd', key);

		// trigger
		const trigger = document.createElement('button');
		trigger.type = 'button';
		trigger.className = 'dropdown-trigger';
		trigger.setAttribute('aria-expanded', 'false');
		trigger.setAttribute('aria-haspopup', 'listbox');
		trigger.innerHTML = `<span class="dropdown-value placeholder">${escapeHtml(placeholder || '선택')}</span>`;

		// panel
		const panel = document.createElement('div');
		panel.className = 'dropdown-panel sysel-dropdown-portal';
		panel.hidden = true;
		panel.innerHTML = `
			<div class="dropdown-search">
				<input type="text" class="dropdown-search-input" placeholder="검색어 입력" autocomplete="off" />
				<button type="button" class="dropdown-close" data-action="dropdown-close">닫기</button>
			</div>
			<ul class="dropdown-options" role="listbox"></ul>
		`;
		const searchInput = panel.querySelector('.dropdown-search-input');
		const closeBtn = panel.querySelector('[data-action="dropdown-close"]');
		const optionsList = panel.querySelector('.dropdown-options');

		// move select inside wrapper + hide it
		selectEl.classList.add('sysel-native-select');
		selectEl.tabIndex = -1;
		selectEl.setAttribute('aria-hidden', 'true');
		selectEl.style.display = 'none';
		field.appendChild(selectEl);
		field.appendChild(trigger);
		field.appendChild(panel);
		td.appendChild(field);

		function rebuildOptions(){
			optionsList.innerHTML = '';
			const optionButtons = [];
			Array.from(selectEl.options || []).forEach((opt)=>{
				const li = document.createElement('li');
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'dropdown-option';
				btn.setAttribute('data-value', String(opt.value||''));
				btn.setAttribute('data-label', String(opt.text||''));
				btn.textContent = String(opt.text||'').trim() || String(opt.value||'').trim();
				li.appendChild(btn);
				optionsList.appendChild(li);
				optionButtons.push(btn);
			});
			return optionButtons;
		}

		let optionButtons = rebuildOptions();

		// Portalize the dropdown panel to <body> while open so it can't be clipped
		// or covered by sticky headers / overflow containers.
		const _syselPanelPlaceholder = document.createComment(`sysel-panel:${key}`);
		let _syselPanelPortalized = false;
		let _syselPanelFloating = false;
		function _syselEnsurePanelPortal(){
			if(_syselPanelPortalized) return;
			try{
				if(panel.parentNode){
					panel.parentNode.insertBefore(_syselPanelPlaceholder, panel);
					panel.parentNode.removeChild(panel);
				}
				document.body.appendChild(panel);
				_syselPanelPortalized = true;
			}catch(_e){}
		}
		function _syselRestorePanelFromPortal(){
			if(!_syselPanelPortalized) return;
			try{
				if(_syselPanelPlaceholder.parentNode){
					_syselPanelPlaceholder.parentNode.insertBefore(panel, _syselPanelPlaceholder);
					_syselPanelPlaceholder.parentNode.removeChild(_syselPanelPlaceholder);
				}else{
					// Fallback: if placeholder got detached, put panel back under its field.
					field.appendChild(panel);
				}
			}catch(_e){}
			_syselPanelPortalized = false;
		}
		function _syselRepositionPanel(){
			if(panel.hidden) return;
			// Position as a top-layer overlay tied to the trigger's viewport rect.
			const rect = trigger.getBoundingClientRect();
			const minWidth = 320;
			const gap = 6;
			const viewportPadding = 8;
			const desiredWidth = Math.max(Math.round(rect.width), minWidth);
			let left = Math.round(rect.left);
			// Clamp inside viewport to avoid falling off-screen when using a min width.
			left = Math.min(left, Math.max(viewportPadding, window.innerWidth - desiredWidth - viewportPadding));
			left = Math.max(viewportPadding, left);
			panel.style.position = 'fixed';
			panel.style.left = `${left}px`;
			panel.style.top = `${Math.round(rect.bottom + gap)}px`;
			panel.style.width = `${desiredWidth}px`;
			panel.style.maxWidth = `${Math.max(desiredWidth, minWidth)}px`;
			panel.style.zIndex = '2147483647';
			_syselPanelFloating = true;
		}
		function _syselResetPanelPosition(){
			if(!_syselPanelFloating) return;
			panel.style.position = '';
			panel.style.left = '';
			panel.style.top = '';
			panel.style.width = '';
			panel.style.maxWidth = '';
			panel.style.zIndex = '';
			_syselPanelFloating = false;
		}
		function _syselBindReposition(){
			window.addEventListener('scroll', _syselRepositionPanel, true);
			window.addEventListener('resize', _syselRepositionPanel);
		}
		function _syselUnbindReposition(){
			window.removeEventListener('scroll', _syselRepositionPanel, true);
			window.removeEventListener('resize', _syselRepositionPanel);
		}

		function setValue(value, label){
			const normalized = String(value||'');
			selectEl.value = normalized;
			try{ selectEl.dispatchEvent(new Event('change', { bubbles:true })); }catch(_e){}
			const valueEl = trigger.querySelector('.dropdown-value');
			if(valueEl){
				const hasValue = !!normalized;
				valueEl.textContent = hasValue ? (label || normalized) : (placeholder || '선택');
				valueEl.classList.toggle('placeholder', !hasValue);
			}
			_syselMarkSelection(optionButtons, normalized);
		}

		function openPanel(){
			if(!panel.hidden) return;
			_syselCloseActiveDropdown();
			panel.hidden = false;
			trigger.setAttribute('aria-expanded', 'true');
			field.classList.add('open');
			_syselActiveDropdownKey = key;
			_syselEnsurePanelPortal();
			_syselRepositionPanel();
			_syselBindReposition();
			try{ setTimeout(()=>{ searchInput && searchInput.focus(); }, 10); }catch(_e){}
		}
		function closePanel(){
			if(panel.hidden) return;
			panel.hidden = true;
			trigger.setAttribute('aria-expanded', 'false');
			field.classList.remove('open');
			_syselUnbindReposition();
			_syselResetPanelPosition();
			_syselRestorePanelFromPortal();
			if(_syselActiveDropdownKey === key) _syselActiveDropdownKey = null;
			if(searchInput){
				searchInput.value = '';
				_syselFilterOptionButtons(optionButtons, '');
			}
		}

		trigger.addEventListener('click', (e)=>{
			e.preventDefault();
			panel.hidden ? openPanel() : closePanel();
		});
		closeBtn && closeBtn.addEventListener('click', (e)=>{ e.preventDefault(); closePanel(); });
		optionsList.addEventListener('click', (e)=>{
			const btn = e.target.closest('button.dropdown-option');
			if(!btn) return;
			e.preventDefault();
			const v = String(btn.getAttribute('data-value')||'');
			const lbl = String(btn.textContent||'').trim();
			setValue(v, lbl);
			closePanel();
		});
		searchInput && searchInput.addEventListener('input', ()=>{
			_syselFilterOptionButtons(optionButtons, searchInput.value);
		});
		document.addEventListener('click', (e)=>{
			if(panel.hidden) return;
			if(panel.contains(e.target) || trigger.contains(e.target)) return;
			closePanel();
		});

		// initialize current value
		try{
			const selectedOpt = selectEl.selectedOptions && selectEl.selectedOptions[0];
			setValue(selectEl.value || '', selectedOpt ? selectedOpt.textContent.trim() : '');
		}catch(_e){}

		// allow rebuild when select options change programmatically
		_syselDropdownRegistry[key] = {
			close: closePanel,
			rebuild: ()=>{
				optionButtons = rebuildOptions();
				try{
					const selectedOpt = selectEl.selectedOptions && selectEl.selectedOptions[0];
					setValue(selectEl.value || '', selectedOpt ? selectedOpt.textContent.trim() : '');
				}catch(_e){}
			}
		};
		try{ selectEl.dataset.syselDropdownBound = '1'; }catch(_e){}
	}
	function initSystemSelectSearchableFilters(){
		const modal = document.getElementById('system-select-modal');
		if(!modal) return;
		const configs = [
			{ id:'sysel-work-category', key:'sysel-work-category', placeholder:'선택' },
			{ id:'sysel-work-division', key:'sysel-work-division', placeholder:'선택' },
			{ id:'sysel-work-status', key:'sysel-work-status', placeholder:'선택' },
			{ id:'sysel-work-operation', key:'sysel-work-operation', placeholder:'선택' },
			{ id:'sysel-work-group', key:'sysel-work-group', placeholder:'선택' },
		];
		configs.forEach(({id,key,placeholder})=>{
			const sel = document.getElementById(id);
			if(sel) _syselInitSearchableSelect(sel, key, placeholder);
		});
	}

	function _assetTypeToKoLabel(assetType){
		const v = String(assetType||'').trim().toUpperCase();
		if(!v) return '';
		if(v === 'ON_PREMISE') return '온프레미스';
		if(v === 'CLOUD') return '클라우드';
		if(v === 'FRAME') return '프레임';
		if(v === 'WORKSTATION') return '워크스테이션';
		return String(assetType||'').trim();
	}

	function _rebuildSystemAppliedKeys(){
		systemSelectState.appliedKeys = new Set(systemSelectState.appliedPairs.map(_pairKey));
	}
	function _rebuildSystemSelectedKeys(){
		systemSelectState.selectedKeys = new Set(systemSelectState.selectedPairs.map(_pairKey));
	}
	function _systemSelectReadAppliedFromHidden(){
		const hidden = document.querySelector('input.meta-input[data-field="target_pairs"]');
		let arr = hidden?.value ? safeJsonParse(hidden.value, []) : [];
		arr = Array.isArray(arr) ? arr : [];
		// If the visible summary fields are empty, treat hidden target_pairs as stale (likely autosaved from another report)
		try{
			const displayTargets = document.querySelector('input.meta-input[data-field="targets"]');
			const displayBiz = document.querySelector('input.meta-input[data-field="business"]');
			const hasDisplay = !!((displayTargets?.value || '').trim() || (displayBiz?.value || '').trim());
			if(!hasDisplay && arr.length > 0){
				arr = [];
				if(hidden){
					hidden.value = '';
					try{ hidden.dispatchEvent(new Event('input', { bubbles:true })); }catch(_e){}
				}
			}
		}catch(_e){}
		systemSelectState.appliedPairs = _dedupePairs(arr);
		_rebuildSystemAppliedKeys();
	}
	function _systemSelectResetSelectedToApplied(){
		systemSelectState.selectedPairs = _dedupePairs(systemSelectState.appliedPairs).map(p=> ({ id: p.id, target: p.target, system: p.system }));
		_rebuildSystemSelectedKeys();
		_syncSystemSelectedHint();
	}
	function _syncSystemSelectedHint(){
		const el = document.getElementById('system-select-selected');
		if(!el) return;
		const unique = new Set((systemSelectState.selectedPairs || []).map(_pairKey));
		const n = unique.size;
		el.textContent = n > 0 ? `선택: ${n}대` : '';
		el.hidden = n <= 0;
	}
	function openSystemSelectModal(){
		// 폼이 잠금 상태(form-locked)이면 모달 열기 차단
		const wrap = document.querySelector('.report-sheet');
		if(wrap && wrap.classList.contains('form-locked')) return;
		const modal = document.getElementById('system-select-modal');
		if(!modal) return;
		// 탭 UI를 현재 activeCategory 기준으로 동기화
		try{
			const tabs = modal.querySelector('.system-tabs');
			if(tabs){
				Array.from(tabs.querySelectorAll('button[data-asset-category]')).forEach(b=>{
					const cat = String(b.getAttribute('data-asset-category')||'').trim().toUpperCase();
					const isActive = cat === String(systemSelectState.activeCategory||'SERVER').toUpperCase();
					b.classList.toggle('active', isActive);
					b.setAttribute('aria-selected', isActive ? 'true' : 'false');
				});
			}
		}catch(_e){}
		try{
			_systemSelectReadAppliedFromHidden();
			_systemSelectResetSelectedToApplied();
		}catch(_e){
			systemSelectState.appliedPairs = [];
			systemSelectState.appliedKeys = new Set();
			systemSelectState.selectedPairs = [];
			systemSelectState.selectedKeys = new Set();
			_syncSystemSelectedHint();
		}
		modal.classList.add('show');
		modal.setAttribute('aria-hidden','false');
		document.body.classList.add('modal-open');
		// reset paging on open so users see the first page for the current filters
		systemSelectState.page = 1;
		systemSelectState.pageSize = systemSelectState.pageSize || 50;
		systemSelectState.total = 0;
		try{ _systemSelectSyncPager(); }catch(_e){}
		ensureSystemSelectCodes().then(()=>{
			try{ initSystemSelectSearchableFilters(); }catch(_e){}
			loadSystemSelectAssets();
		});
	}
	function closeSystemSelectModal(){
		const modal = document.getElementById('system-select-modal');
		if(!modal) return;
		// 닫을 때 미적용 변경은 폐기(적용된 값 기준으로 다음 오픈에서 유지)
		try{
			_systemSelectReadAppliedFromHidden();
			_systemSelectResetSelectedToApplied();
		}catch(_e){}
		// 닫을 때 예약된 재조회가 있으면 정리
		try{
			if(systemSelectState.reloadTimer){
				clearTimeout(systemSelectState.reloadTimer);
				systemSelectState.reloadTimer = null;
			}
		}catch(_e){}
		modal.classList.remove('show');
		modal.setAttribute('aria-hidden','true');
		document.body.classList.remove('modal-open');
	}

	async function ensureSystemSelectCodes(){
		if(systemSelectState.codesLoaded || systemSelectState.codesLoading) return;
		systemSelectState.codesLoading = true;
		try{
			async function fillSelect(selectId, url, codeKey){
				const sel = document.getElementById(selectId);
				if(!sel) return;
				sel.innerHTML = '';
				const optAll = document.createElement('option');
				optAll.value='';
				optAll.textContent='전체';
				sel.appendChild(optAll);
				const { res, json } = await fetchJson(url);
				if(!res.ok || !json || json.success !== true) return;
				const items = Array.isArray(json.items) ? json.items : [];
				for(const it of items){
					if(!it) continue;
					const code = String(it[codeKey] || '').trim();
					const name = String(it.wc_name || it.name || it[codeKey] || '').trim();
					if(!code) continue;
					const opt = document.createElement('option');
					opt.value = code;
					opt.textContent = name || code;
					sel.appendChild(opt);
				}
			}
			await Promise.all([
				fillSelect('sysel-work-category', '/api/work-categories', 'category_code'),
				fillSelect('sysel-work-division', '/api/work-divisions', 'division_code'),
				fillSelect('sysel-work-status', '/api/work-statuses', 'status_code'),
				fillSelect('sysel-work-operation', '/api/work-operations', 'operation_code'),
				fillSelect('sysel-work-group', '/api/work-groups', 'group_code'),
			]);
			try{ initSystemSelectSearchableFilters(); }catch(_e){}
			try{
				['sysel-work-category','sysel-work-division','sysel-work-status','sysel-work-operation','sysel-work-group']
					.forEach((id)=>{ const api = _syselDropdownRegistry[id]; if(api && typeof api.rebuild==='function') api.rebuild(); });
			}catch(_e){}
			systemSelectState.codesLoaded = true;
		}catch(_e){
			// ignore
		}finally{
			systemSelectState.codesLoading = false;
		}
	}

	function _systemSelectFilters(){
		const readSel = (id)=>{
			const el = document.getElementById(id);
			return el && el.value ? String(el.value).trim() : '';
		};
		const readInput = (id)=>{
			const el = document.getElementById(id);
			return el && el.value ? String(el.value).trim() : '';
		};
		return {
			work_category_code: readSel('sysel-work-category'),
			work_division_code: readSel('sysel-work-division'),
			work_status_code: readSel('sysel-work-status'),
			work_operation_code: readSel('sysel-work-operation'),
			work_group_code: readSel('sysel-work-group'),
			work_name: readInput('sysel-work-name'),
			system_name: readInput('sysel-system-name'),
		};
	}

	function scheduleSystemSelectReload(opts){
		if(opts && opts.resetPage){
			systemSelectState.page = 1;
			try{ _systemSelectSyncPager(); }catch(_e){}
		}
		if(systemSelectState.reloadTimer) clearTimeout(systemSelectState.reloadTimer);
		systemSelectState.reloadTimer = setTimeout(()=>{ loadSystemSelectAssets(); }, 250);
	}

	async function loadSystemSelectAssets(){
		const modal = document.getElementById('system-select-modal');
		if(!modal || !modal.classList.contains('show')) return;
		const tbody = document.getElementById('system-select-tbody');
		const emptyEl = document.getElementById('system-select-empty');
		if(!tbody) return;
		tbody.innerHTML = '';
		if(emptyEl){ emptyEl.hidden = true; emptyEl.textContent = '조회 결과가 없습니다.'; }
		const filters = _systemSelectFilters();
		const params = new URLSearchParams();
		params.set('asset_category', systemSelectState.activeCategory);
		for(const [k,v] of Object.entries(filters)){
			if(v) params.set(k, v);
		}
		params.set('page', String(systemSelectState.page || 1));
		params.set('page_size', String(systemSelectState.pageSize || 50));
		try{
			const { res, json } = await fetchJson(`/api/hardware/assets?${params.toString()}`);
			if(!res.ok || !json || json.success !== true){
				if(emptyEl){ emptyEl.hidden = false; emptyEl.textContent = '조회 중 오류가 발생했습니다.'; }
				systemSelectState.total = 0;
				try{ _systemSelectSyncPager(); }catch(_e){}
				return;
			}
			const total = Number(json.total || 0);
			const pageSize = Number(json.page_size || systemSelectState.pageSize || 50);
			const page = Number(json.page || systemSelectState.page || 1);
			systemSelectState.total = total;
			systemSelectState.pageSize = pageSize;
			systemSelectState.page = page;
			const totalPages = _systemSelectTotalPages();
			if(systemSelectState.page > totalPages){
				systemSelectState.page = totalPages;
				try{ _systemSelectSyncPager(); }catch(_e){}
				return loadSystemSelectAssets();
			}
			try{ _systemSelectSyncPager(); }catch(_e){}
			const items = Array.isArray(json.items) ? json.items : [];
			if(items.length === 0){
				if(emptyEl){ emptyEl.hidden = false; emptyEl.textContent = '조회 결과가 없습니다.'; }
				return;
			}
			let didHydrateIds = false;
			tbody.innerHTML = items.map((it)=>{
				const idRaw = (it && (it.id ?? it.asset_id ?? it.assetId ?? it.assetID)) ?? '';
				const id = idRaw == null ? '' : String(idRaw).trim();
				const systemType = String(it?.asset_type || '').trim();
				const systemStatus = String(it?.work_status_name || it?.work_status || it?.work_status_code || '').trim();
				const systemStatusDisplay = systemStatus || '-';
				const target = String(it?.work_name || it?.asset_name || '').trim();
				const system = String(it?.system_name || '').trim();
				const systemTypeDisplay = (_assetTypeToKoLabel(systemType) || '-');
				const keyById = _pairKey({ id, target, system });
				const keyByPair = _pairKey({ target, system });
				// Backward compatibility: if we only have pair-based keys saved, treat matching rows as selected
				let isSelected = systemSelectState.selectedKeys.has(keyById) || systemSelectState.selectedKeys.has(keyByPair);
				// If pair-key matched but id-key isn't tracked yet, convert legacy pair selection -> id selection
				if(id && systemSelectState.selectedKeys.has(keyByPair) && !systemSelectState.selectedKeys.has(keyById)){
					// remove legacy pair-key to avoid double counting
					systemSelectState.selectedKeys.delete(keyByPair);
					systemSelectState.selectedPairs = systemSelectState.selectedPairs.filter(p=>{
						const np = _normalizePair(p);
						// remove only legacy entries (no id) that match this target/system
						if(np.id) return true;
						return _pairKey({ target: np.target, system: np.system }) !== keyByPair;
					});
					systemSelectState.selectedKeys.add(keyById);
					if(!systemSelectState.selectedPairs.some(p=> _pairKey(p) === keyById)){
						systemSelectState.selectedPairs.push({ id, target, system });
					}
					didHydrateIds = true;
					isSelected = true;
				}
				const checked = isSelected ? 'checked' : '';
				const selectedClass = checked ? 'is-selected' : '';
				return `<tr class="${selectedClass}">
					<td><input type="checkbox" class="sysel-check" data-id="${escapeHtml(id)}" data-target="${escapeHtml(target)}" data-system="${escapeHtml(system)}" ${checked}></td>
					<td title="${escapeHtml(systemTypeDisplay)}">${escapeHtml(systemTypeDisplay)}</td>
					<td title="${escapeHtml(systemStatusDisplay)}">${escapeHtml(systemStatusDisplay)}</td>
					<td title="${escapeHtml(target)}">${escapeHtml(target)}</td>
					<td title="${escapeHtml(system)}">${escapeHtml(system)}</td>
				</tr>`;
			}).join('');
			if(didHydrateIds){
				// final cleanup: keep selectedPairs unique
				try{ systemSelectState.selectedPairs = _dedupePairs(systemSelectState.selectedPairs); _rebuildSystemSelectedKeys(); _syncSystemSelectedHint(); }catch(_e){}
			}
		}catch(_e){
			if(emptyEl){ emptyEl.hidden = false; emptyEl.textContent = '조회 중 오류가 발생했습니다.'; }
			systemSelectState.total = 0;
			try{ _systemSelectSyncPager(); }catch(_e){}
		}
	}

	function setupSystemSelectModal(){
		const modalRoot = document.getElementById('system-select-modal');
		if(!modalRoot) return;
		const closeBtn = document.getElementById('system-select-close');
		const applyBtn = document.getElementById('system-select-apply');
		const clearBtn = document.getElementById('system-select-clear');
		const pagePrevBtn = document.getElementById('system-select-page-prev');
		const pageNextBtn = document.getElementById('system-select-page-next');
		const targetsInput = document.querySelector('input.meta-input[data-field="targets"]');
		const businessInput = document.querySelector('input.meta-input[data-field="business"]');

		const openFromField = (e)=>{ try{ e.preventDefault(); }catch(_e){} openSystemSelectModal(); };
		if(targetsInput){ targetsInput.addEventListener('click', openFromField); }
		if(businessInput){ businessInput.addEventListener('click', openFromField); }
		if(closeBtn){ closeBtn.addEventListener('click', closeSystemSelectModal); }
		modalRoot.addEventListener('click', (e)=>{ if(e.target === modalRoot) closeSystemSelectModal(); });
		document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && modalRoot.classList.contains('show')) closeSystemSelectModal(); });

		// tabs
		const tabs = modalRoot.querySelector('.system-tabs');
		if(tabs){
			tabs.addEventListener('click', (e)=>{
				const btn = e.target.closest('button[data-asset-category]');
				if(!btn) return;
				const cat = String(btn.getAttribute('data-asset-category')||'').trim().toUpperCase();
				if(!cat || cat === systemSelectState.activeCategory) return;
				systemSelectState.activeCategory = cat;
				systemSelectState.page = 1;
				Array.from(tabs.querySelectorAll('button[data-asset-category]')).forEach(b=>{
					const isActive = (b === btn);
					b.classList.toggle('active', isActive);
					b.setAttribute('aria-selected', isActive ? 'true' : 'false');
				});
				try{ _systemSelectSyncPager(); }catch(_e){}
				loadSystemSelectAssets();
			});
		}

		// pagination
		if(pagePrevBtn){
			pagePrevBtn.addEventListener('click', ()=>{
				if(systemSelectState.page > 1){
					systemSelectState.page -= 1;
					try{ _systemSelectSyncPager(); }catch(_e){}
					loadSystemSelectAssets();
				}
			});
		}
		if(pageNextBtn){
			pageNextBtn.addEventListener('click', ()=>{
				const totalPages = _systemSelectTotalPages();
				if(systemSelectState.page < totalPages){
					systemSelectState.page += 1;
					try{ _systemSelectSyncPager(); }catch(_e){}
					loadSystemSelectAssets();
				}
			});
		}

		// filters
		['sysel-work-category','sysel-work-division','sysel-work-status','sysel-work-operation','sysel-work-group'].forEach(id=>{
			const el = document.getElementById(id);
			if(el) el.addEventListener('change', ()=> scheduleSystemSelectReload({ resetPage:true }));
		});
		['sysel-work-name','sysel-system-name'].forEach(id=>{
			const el = document.getElementById(id);
			if(el){
				el.addEventListener('input', ()=> scheduleSystemSelectReload({ resetPage:true }));
				el.addEventListener('change', ()=> scheduleSystemSelectReload({ resetPage:true }));
			}
		});

		// selection
		const tbody = document.getElementById('system-select-tbody');
		if(tbody){
			// Clicking anywhere in a row toggles its checkbox (except when directly clicking the checkbox)
			tbody.addEventListener('click', (e)=>{
				const directCb = e.target.closest('input.sysel-check');
				if(directCb) return;
				const tr = e.target.closest('tr');
				if(!tr) return;
				const cb = tr.querySelector('input.sysel-check');
				if(!cb) return;
				cb.checked = !cb.checked;
				try{ cb.dispatchEvent(new Event('change', { bubbles:true })); }catch(_e){}
			});

			tbody.addEventListener('change', (e)=>{
				const cb = e.target.closest('input.sysel-check');
				if(!cb) return;
				const id = String(cb.getAttribute('data-id')||'').trim();
				const target = String(cb.getAttribute('data-target')||'').trim();
				const system = String(cb.getAttribute('data-system')||'').trim();
				const key = _pairKey({ id, target, system });
				try{
					const tr = cb.closest('tr');
					if(tr) tr.classList.toggle('is-selected', !!cb.checked);
				}catch(_e){}
				if(cb.checked){
					if(!systemSelectState.selectedKeys.has(key)){
						systemSelectState.selectedKeys.add(key);
						systemSelectState.selectedPairs.push({ id, target, system });
					}
				}else{
					systemSelectState.selectedKeys.delete(key);
					systemSelectState.selectedPairs = systemSelectState.selectedPairs.filter(p=> _pairKey(p) !== key);
				}
				// keep list unique even if legacy/pair keys existed previously
				try{ systemSelectState.selectedPairs = _dedupePairs(systemSelectState.selectedPairs); _rebuildSystemSelectedKeys(); }catch(_e){}
				_syncSystemSelectedHint();
			});
		}

		if(applyBtn){
			applyBtn.addEventListener('click', ()=>{
				applyPairsToInputs(systemSelectState.selectedPairs);
				// 적용 후 체크 유지 + 모달 닫기
				try{
					systemSelectState.appliedPairs = systemSelectState.selectedPairs
						.map(p=> ({ id: String(p.id||'').trim(), target: String(p.target||'').trim(), system: String(p.system||'').trim() }))
						.filter(p=> p.target || p.system);
					_rebuildSystemAppliedKeys();
				}catch(_e){}
				toast('대상/시스템이 적용되었습니다.');
				closeSystemSelectModal();
			});
		}

		if(clearBtn){
			clearBtn.addEventListener('click', ()=>{
				systemSelectState.selectedPairs = [];
				systemSelectState.selectedKeys = new Set();
				_syncSystemSelectedHint();
				// 모달 내부 선택만 초기화 (폼 반영은 '선택 적용'에서만)
				try{
					Array.from(document.querySelectorAll('#system-select-tbody input.sysel-check'))
						.forEach(cb=>{ cb.checked = false; });
				}catch(_e){}
				toast('선택이 해제되었습니다.');
			});
		}
	}

	// ---- 작업분류(체크박스) <-> hidden input 동기화 ----
	let categoriesSync = {
		fromHiddenToBoxes: () => {},
		fromBoxesToHidden: () => {}
	};
	function setupCategoriesSync(){
		const group = document.querySelector('.categories-group');
		const hidden = document.querySelector('input.meta-input[data-field="categories"]');
		if(!group || !hidden) return;
		const boxes = Array.from(group.querySelectorAll('input[type="checkbox"]'));
		function syncLabelClass(b){
			try{
				const label = b && b.closest ? b.closest('label.check') : null;
				if(label) label.classList.toggle('is-checked', !!b.checked);
			}catch(_e){}
		}
		categoriesSync.fromHiddenToBoxes = function(){
			const raw = (hidden.value || '')
				.split(',')
				.map(s=>s.trim())
				.filter(Boolean);
			const set = new Set(raw);
			boxes.forEach(b => { b.checked = set.has(b.value); syncLabelClass(b); });
		};
		categoriesSync.fromBoxesToHidden = function(){
			const selected = boxes.filter(b=>b.checked).map(b=>b.value);
			hidden.value = selected.join(', ');
			boxes.forEach(syncLabelClass);
			// trigger input event so autosave picks it up
			hidden.dispatchEvent(new Event('input', { bubbles: true }));
		};
		boxes.forEach(b => b.addEventListener('change', categoriesSync.fromBoxesToHidden));
		// initial sync in case of prefilled value
		categoriesSync.fromHiddenToBoxes();
	}

	// ---- 작업구분(체크박스, 1개만 선택) <-> hidden input 동기화 ----
	let workTypesSync = {
		fromHiddenToBoxes: () => {},
		fromBoxesToHidden: () => {}
	};
	function setupWorkTypesSync(){
		const group = document.querySelector('.worktypes-group');
		const hidden = document.querySelector('input.meta-input[data-field="work_types"]');
		if(!group || !hidden) return;
		const boxes = Array.from(group.querySelectorAll('input[type="checkbox"]'));
		function syncLabelClass(b){
			try{
				const label = b && b.closest ? b.closest('label.check') : null;
				if(label) label.classList.toggle('is-checked', !!b.checked);
			}catch(_e){}
		}
		workTypesSync.fromHiddenToBoxes = function(){
			const val = (hidden.value || '').split(',').map(s=>s.trim()).filter(Boolean)[0] || '';
			boxes.forEach(b => { b.checked = (b.value === val); syncLabelClass(b); });
		};
		workTypesSync.fromBoxesToHidden = function(){
			const selected = boxes.filter(b=>b.checked).map(b=>b.value);
			hidden.value = selected.length ? selected[selected.length - 1] : '';
			boxes.forEach(syncLabelClass);
			hidden.dispatchEvent(new Event('input', { bubbles: true }));
		};
		// 1개만 선택 강제: 새로 체크하면 나머지 해제
		boxes.forEach(b => b.addEventListener('change', function(){
			if(b.checked){
				boxes.forEach(o => { if(o !== b){ o.checked = false; syncLabelClass(o); } });
			}
			workTypesSync.fromBoxesToHidden();
		}));
		workTypesSync.fromHiddenToBoxes();
	}

	// ---- 작업 영향도(라디오) <-> hidden input 동기화 ----
	let impactSync = {
		fromHiddenToRadios: () => {},
		fromRadiosToHidden: () => {}
	};
	function setupImpactSync(){
		const group = document.querySelector('.impact-group');
		const hidden = document.querySelector('input.meta-input[data-field="impact"]');
		if(!group || !hidden) return;
		const radios = Array.from(group.querySelectorAll('input[type="radio"]'));
		function syncLabelClass(r){
			try{
				const label = r && r.closest ? r.closest('label.check') : null;
				if(label) label.classList.toggle('is-checked', !!r.checked);
			}catch(_e){}
		}
		impactSync.fromHiddenToRadios = function(){
			const val = (hidden.value || '').trim();
			radios.forEach(r => { r.checked = (r.value === val); syncLabelClass(r); });
		};
		impactSync.fromRadiosToHidden = function(){
			const selected = radios.find(r => r.checked);
			hidden.value = selected ? selected.value : '';
			radios.forEach(syncLabelClass);
			hidden.dispatchEvent(new Event('input', { bubbles: true }));
		};
		radios.forEach(r => r.addEventListener('change', impactSync.fromRadiosToHidden));
		impactSync.fromHiddenToRadios();
	}

	function saveToStorage(){
		const data = collectFormData();
		localStorage.setItem(_storageKey(), toJsonString(data));
		toast('임시 저장되었습니다.');
		return data;
	}

	function loadFromStorage(){
		const raw = localStorage.getItem(_storageKey());
		if(!raw) return false;
		const data = safeJsonParse(raw, null);
		if(!data || typeof data !== 'object') return false;

		// restore inputs/editables
		try{
			inputs.forEach(i => {
				const key = i.dataset.field;
				if(!key) return;
				if(i.dataset.fixed === 'true') return;
				if(data[key] === undefined || data[key] === null) return;
				if(key === 'start_dt' || key === 'end_dt'){
					i.value = normalizeDateTimeValue(data[key]);
				}else{
					i.value = String(data[key]);
				}
			});
		}catch(_e){}
		try{
			editables.forEach(e => {
				const key = e.dataset.field;
				if(!key) return;
				if(data[key] === undefined || data[key] === null) return;
				e.innerHTML = String(data[key]);
				try{ cleanupLegacyListMarkup(e); }catch(_e){}
				try{ applyArrowRewrites(e); }catch(_e){}
				try{ applyRichMarkers(e); }catch(_e){}
			});
		}catch(_e){}

		// reflect target pairs summary
		try{
			const hidden = document.querySelector('input.meta-input[data-field="target_pairs"]');
			const countEl = document.getElementById('targets-count');
			if(hidden && hidden.value){
				let arr = safeJsonParse(hidden.value||'[]', []);
				arr = Array.isArray(arr) ? arr : [];
				// Filter out possible header-looking rows from older saved data
				const filtered = arr.filter(x=>{
					const t = String(x?.target||'').replace(/\s+/g,'');
					const s = String(x?.system||'').replace(/\s+/g,'');
					const isHeader = (t && t.includes('작업대상')) || (s && s.includes('시스템'));
					return !isHeader;
				});
				applyPairsToInputs(filtered);
				// Hide the mini count near the field
				if(countEl){ countEl.textContent = ''; countEl.hidden = true; }
			}
		}catch(_e){}
		// reflect report status into pill
		try{ updateStatusPillFromHidden(); }catch(_e){}
		// restore comments
		try{
			if(Array.isArray(data._comments)){
				commentsList.innerHTML='';
				commentsSection.hidden = data._comments.length===0;
				for(const c of data._comments){ addComment(String(c.text||''), String(c.user||''), String(c.date||'')); }
			}
		}catch(_e){}
		try{ computeAndRenderDuration(); }catch(_e){}
		try { categoriesSync.fromHiddenToBoxes(); } catch(_e) {}
		try { workTypesSync.fromHiddenToBoxes(); } catch(_e) {}
		try { impactSync.fromHiddenToRadios(); } catch(_e) {}
		toast('불러오기 완료.');
		return true;
	}

	async function saveToServer(){
			const data = saveToStorage();
			try{
				const r = await upsertToApi(data);
				if(r && r.ok){
					toast('서버 저장되었습니다.');
				} else {
					console.error('[saveToServer] 실패:', r && r.message);
					toast(r && r.message ? r.message : '서버 저장에 실패했습니다.');
				}
			}catch(err){
				console.error('[saveToServer] 예외:', err);
				toast('서버 저장 중 오류가 발생했습니다.');
			}
		}

	function clearAll(){
		// Capture old storage key before changing REPORT_ID.
		const oldStorageKey = _storageKey();
		inputs.forEach(i => {
			if(i.dataset.fixed === 'true') return; // keep fixed defaults
			i.value='';
			// placeholder 복원
			if(i.dataset.origPlaceholder){ i.placeholder = i.dataset.origPlaceholder; delete i.dataset.origPlaceholder; }
		});
		editables.forEach(e => {
			e.innerHTML='';
			// placeholder 복원
			if(e.dataset.origPlaceholder){ e.setAttribute('placeholder', e.dataset.origPlaceholder); delete e.dataset.origPlaceholder; }
		});
		const dur = document.querySelector('[data-field="duration"]');
		if(dur) dur.value = '';
		try{
			// 완전 신규: 서버 문서 ID/URL/로컬저장까지 리셋
			try{ localStorage.removeItem(oldStorageKey); }catch(_e){}
			setReportId(null);
			try{ localStorage.removeItem(_storageKey()); }catch(_e){}
			REPORT_STATUS_CODE = 'DRAFT';
			const rs = document.querySelector('input.meta-input[data-field="report_status"]');
			if(rs) rs.value = '임시저장';
			updateStatusPillFromHidden();
			updateClearButtonEnabled();
			try{ updatePersistButton(); }catch(_e){}
			ensureDraftDeptFromSession();
			// 새 문서처럼: 기안일자도 오늘로
			try{
				const today = new Date();
				const y = today.getFullYear();
				const m = String(today.getMonth()+1).padStart(2,'0');
				const d = String(today.getDate()).padStart(2,'0');
				const draft = document.querySelector('input.meta-input[data-field="draft_date"]');
				if(draft){ draft.value = `${y}-${m}-${d}`; }
			}catch(_e){}
		}catch(_e){}
		// clear targets summary
		try{
			targetsState.pairs = [];
			const countEl = document.getElementById('targets-count');
			if(countEl) countEl.textContent = '';
		}catch(_e){}
		// clear applied pairs (targets/system)
		try{ applyPairsToInputs([]); }catch(_e){}
		try{
			systemSelectState.appliedPairs = [];
			systemSelectState.appliedKeys = new Set();
			systemSelectState.selectedPairs = [];
			systemSelectState.selectedKeys = new Set();
			_syncSystemSelectedHint();
		}catch(_e){}
		// clear chip selects
		try{
			Array.from(document.querySelectorAll('.js-chip-select')).forEach(root=>{
				try{ root.__chipSelect?.setSelected([]); }catch(_e){}
			});
		}catch(_e){}
		// clear checkboxes sync
		try { categoriesSync.fromHiddenToBoxes(); } catch(_e) {}
		try { workTypesSync.fromHiddenToBoxes(); } catch(_e) {}
		// clear comments
		try{
			const list = document.getElementById('comments-list');
			if(list) list.innerHTML = '';
			const section = document.getElementById('comments-section');
			if(section) section.hidden = true;
		}catch(_e){}
		// clear attachments
		try{ attachmentsManager?.clearAllFiles?.(); }catch(_e){}
	}

	function toast(msg){
		// 간단한 토스트 (헤더 버튼 옆)
		let el = document.getElementById('mini-toast');
		if(!el){
			el = document.createElement('div');
			el.id = 'mini-toast';
			el.style.cssText = 'position:fixed;top:14px;right:14px;background:#111;color:#fff;padding:8px 12px;border-radius:8px;opacity:.95;z-index:9999;font-size:12px;';
			document.body.appendChild(el);
		}
		el.textContent = msg;
		el.hidden = false;
		clearTimeout(el._t);
		el._t = setTimeout(()=> el.hidden = true, 1800);
	}

		function fillTemplate(){
		const today = new Date();
		const y = today.getFullYear();
		const m = String(today.getMonth()+1).padStart(2,'0');
		const d = String(today.getDate()).padStart(2,'0');
		$('[data-field="draft_date"]').value = `${y}-${m}-${d}`;
		$('[data-field="draft_dept"]').value = 'IT인프라운영팀';
		$('[data-field="doc_level"]').value = '일반';
		$('[data-field="retention"]').value = '3년';
		$('[data-field="read_perm"]').value = '팀원이상';
		// removed: wish_date and writer fields no longer exist in the top meta

		const taskTitleEl = $('[data-field="task_title"]');
		if(taskTitleEl) taskTitleEl.value = 'MSS 업무 운영 확장 작업';
		$('[data-field="start_dt"]').value = `${y}-11-05 10:00`;
		$('[data-field="end_dt"]').value = `${y}-11-05 10:30`;
		$('[data-field="targets"]').value = 'MSS 업무운영 DB#1~2';
		$('[data-field="categories"]').value = '스토리지, 데이터베이스';
		$('[data-field="work_types"]').value = '';
		$('[data-field="rel_dept"]').value = 'IT인프라운영팀';
		$('[data-field="worker"]').value = '창형';
		$('[data-field="vendor"]').value = '';
		$('[data-field="vendor_staff"]').value = '';

		$('[data-field="overview"]').innerHTML = 'MSS 업무 운영 DB#1~2 스토리지 볼륨 확장 작업';
		$('[data-field="service"]').innerHTML = 'MSS 업무 운영 DB 서비스';
		$('[data-field="precheck"]').innerHTML = [
			'• 저장공간: MSS 운용 DB 공간 부족에 따른 조치',
			'• 사전점검: IT인프라운영팀 운영점검 완료',
			'• 백업확인: 볼륨 스냅샷 확인 (300GB × AEA = 800GB)',
		].join('<br>');
		$('[data-field="procedure"]').innerHTML = [
			'10:00 ~ 10:05 : 작업 시작 / 스토리지 볼륨 확장 준비 (점검)',
			'10:05 ~ 10:20 : MSS 업무 운영 DB#1~2 볼륨 확장',
			'10:20 ~ 10:30 : 확장 용량 반영 확인 및 디스크 검사',
		].join('<br>');
		$('[data-field="postcheck"]').innerHTML = '디스크 용량 반영 여부 점검';
		$('[data-field="resources"]').innerHTML = '가상 디스크 WWN 확인 및 점검, 회수작업 포함 (30분)';
		$('[data-field="etc"]').innerHTML = '';
		$('[data-field="report_result"]').innerHTML = '';
		const rs = $('[data-field="report_status"]'); if(rs) rs.value = '임시저장';
		updateStatusPillFromHidden();

		// 카테고리/작업구분 체크박스와 동기화
		try { categoriesSync.fromHiddenToBoxes(); } catch(_e) {}
		try { workTypesSync.fromHiddenToBoxes(); } catch(_e) {}

			// 결재 기본값 — 세션 사용자 정보 사용
			(async ()=>{
				const me = await getSessionUser();
				const un = (me && me.name) || '';
				$('[data-field="name_member"]').value = un;
				$('[data-field="date_member"]').value = `${y}-${m}-${d}`;
				$('[data-field="name_lead"]').value = '';
				$('[data-field="date_lead"]').value = `${y}-${m}-${d}`;
				// 서명 영역
				const signEl = $('[data-field="sign_member"]');
				if(signEl && un){
					signEl.innerHTML = `<span style="font-size:1.6em;font-style:italic;font-weight:600;color:#1e293b;user-select:none;">${escapeHtml(un)}</span>`;
				}
			})();

		computeAndRenderDuration();
		toast('템플릿이 채워졌습니다.');
	}

	// ---- Duration auto-calculation ----
	function parseDateTime(val){
		if(!val) return null;
		// Accept native datetime-local value too
		try{
			val = normalizeDateTimeValue(val);
		}catch(_e){}
		// Prefer flatpickr parser if available to match format
		try{
			if(window.flatpickr && typeof window.flatpickr.parseDate === 'function'){
				return window.flatpickr.parseDate(val, 'Y-m-d H:i');
			}
		}catch(_e){}
		// Fallback: replace space with T for ISO-like parsing
		const isoLike = val.trim().replace(' ', 'T');
		const d = new Date(isoLike);
		return isNaN(d.getTime()) ? null : d;
	}
	function formatDuration(minutes){
		if(minutes == null || !isFinite(minutes)) return '';
		const m = Math.max(0, Math.round(minutes));
		const h = Math.floor(m/60);
		const mm = m % 60;
		if(h > 0){
			return mm > 0 ? `${h}시간 ${mm}분` : `${h}시간`;
		}
		return `${mm}분`;
	}
	function computeAndRenderDuration(){
		const sVal = $('[data-field="start_dt"]').value;
		const eVal = $('[data-field="end_dt"]').value;
		const s = parseDateTime(sVal);
		const e = parseDateTime(eVal);
		const out = $('[data-field="duration"]');
		if(!out) return;
		if(!s || !e){ out.value = ''; return; }
		const diffMs = e.getTime() - s.getTime();
		if(!isFinite(diffMs) || diffMs < 0){ out.value = ''; return; }
		const mins = diffMs / 60000;
		out.value = formatDuration(mins);
	}

	// 입력 자동 저장(지나친 잦은 저장 방지: 400ms 디바운스)
	let tm;
	[...inputs, ...editables].forEach(el => {
		const h = () => {
			clearTimeout(tm);
			tm = setTimeout(() => {
				try{ if(el && el.isContentEditable) applyArrowRewrites(el); }catch(_e){}
				try{ if(el && el.isContentEditable) applyRichMarkers(el); }catch(_e){}
				saveToStorage();
			}, 400);
		};
		if(el instanceof HTMLInputElement){ el.addEventListener('input', h); }
		else { el.addEventListener('input', h); }
	});

	// 이미지 첨부 차단: '첨부파일' 섹션 외의 모든 에디터에서 이미지 붙여넣기/드래그 금지
	function hasImageInDataTransfer(dt){
		if(!dt) return false;
		// Files
		if(dt.files && dt.files.length){
			for(const f of dt.files){ if(/^image\//i.test(f.type)) return true; }
		}
		// Items (Chrome paste)
		if(dt.items && dt.items.length){
			for(const it of dt.items){ if(it.type && /^image\//i.test(it.type)) return true; }
		}
		// HTML markup containing <img>
		try{
			const html = dt.getData && dt.getData('text/html');
			if(html && /<img\b[^>]*>/i.test(html)) return true;
		}catch(_e){}
		return false;
	}
	function stripImagesFromHtml(html){
		return String(html||'').replace(/<img\b[^>]*>/gi, '');
	}
	function insertHtmlAtCursor(html){
		// Use execCommand if available for simplicity; fallback to range insert
		const ok = document.execCommand && document.execCommand('insertHTML', false, html);
		if(ok) return;
		try{
			const sel = window.getSelection(); if(!sel || !sel.rangeCount) return;
			const range = sel.getRangeAt(0);
			const frag = range.createContextualFragment(html);
			range.deleteContents();
			range.insertNode(frag);
			sel.collapseToEnd();
		}catch(_e){}
	}
	function blockImageOnEditor(el){
		if(!el) return;
		// Safety: skip if this editor is inside the attachments section (현재 구조상 에디터는 없음)
		if(el.closest('#attachments-section')) return;
		// Paste handler
		el.addEventListener('paste', (e)=>{
			const dt = e.clipboardData;
			// If image present as file or markup, block or sanitize
			if(hasImageInDataTransfer(dt)){
				e.preventDefault();
				toast('이미지는 "첨부파일" 섹션에서만 추가할 수 있습니다.');
				return;
			}
			// If pasting HTML that may contain <img>, sanitize
			if(dt && dt.types && dt.types.includes && dt.types.includes('text/html')){
				const html = dt.getData('text/html');
				if(/<img\b[^>]*>/i.test(html||'')){
					e.preventDefault();
					insertHtmlAtCursor(stripImagesFromHtml(html||''));
					toast('이미지는 "첨부파일" 섹션에서만 추가할 수 있습니다.');
				}
			}
		});
		// Drop handler
		el.addEventListener('drop', (e)=>{
			const dt = e.dataTransfer;
			if(hasImageInDataTransfer(dt)){
				e.preventDefault();
				el.classList.remove('dragover');
				toast('이미지는 "첨부파일" 섹션에서만 추가할 수 있습니다.');
			}
		});
		// Optional visual dragover cleanup
		el.addEventListener('dragover', (e)=>{
			const dt = e.dataTransfer;
			if(hasImageInDataTransfer(dt)){
				// allow showing not-allowed cursor by preventing default only for images
				e.preventDefault();
			}
		});
	}
	// Apply to all contenteditable editors and sign areas
	[...editables, ...$$('[contenteditable="true"]:not([data-field])')].forEach(blockImageOnEditor);

	// Recompute duration when start/end change (typing as well)
	const startEl2 = $('[data-field="start_dt"]');
	const endEl2 = $('[data-field="end_dt"]');
	[startEl2, endEl2].forEach(el => {
		if(!el) return;
		el.addEventListener('input', computeAndRenderDuration);
		el.addEventListener('change', computeAndRenderDuration);
	});

		// 버튼 바인딩
		const goPrint = () => { window.print(); };
		$('#btn-print') && $('#btn-print').addEventListener('click', goPrint);

		// 인쇄 시 첨부파일 없으면 영역 숨김
		window.addEventListener('beforeprint', ()=>{
			const sec = document.getElementById('attachments-section');
			const list = document.getElementById('attachments-list');
			if(sec && (!list || list.children.length === 0)){
				sec.dataset.hiddenForPrint = '1';
				sec.style.display = 'none';
			}
		});
		window.addEventListener('afterprint', ()=>{
			const sec = document.getElementById('attachments-section');
			if(sec && sec.dataset.hiddenForPrint === '1'){
				sec.style.display = '';
				delete sec.dataset.hiddenForPrint;
			}
		});
		$('#btn-template') && $('#btn-template').addEventListener('click', fillTemplate);
		$('#btn-save') && $('#btn-save').addEventListener('click', saveToServer);
		$('#btn-persist') && $('#btn-persist').addEventListener('click', runWorkflowAction);
		$('#btn-preview') && $('#btn-preview').addEventListener('click', openPreview);
		// PDF 만들기: 확인 모달을 띄운 뒤 진행
		$('#btn-pdf') && $('#btn-pdf').addEventListener('click', openPdfConfirmModal);
		$('#btn-clear') && $('#btn-clear').addEventListener('click', () => {
			if(!isReviewStage()){
				toast('임시저장/검토 단계에서만 초기화할 수 있습니다.');
				return;
			}
			clearAll();
			toast('초기화되었습니다.');
			try{ updateResultBoxVisibility(); }catch(_e){}
		});

		// 기본 상태/기안부서 기본값 + 검색 드롭다운
		ensureDefaultStatus();
		try{ updateResultBoxVisibility(); }catch(_e){}
		ensureDraftDeptFromSession();
		initSuggestInputs();
		updateClearButtonEnabled();

		// 날짜/시간 입력에 달력 연결
		initDatePickersDetail();

		// 대상/시스템 업로드 모달 초기화
		setupTargetsModal();

		// 더보기 버튼/모달 초기화
		setupFieldMore();

		// 시스템 선택 모달 초기화
		setupSystemSelectModal();

		// 담당/참여/협력 선택(검색+드롭다운+칩)
		try{ setupChipSelects(); }catch(_e){}

		// 메일 보내기: mailto로 현재 보고서 요약
		function htmlToPlainWithMarkers(root){
			if(!root) return '';
			function textOf(node){ return (node && (node.textContent||'')).trim(); }
			let out = [];
			root.childNodes.forEach(node => {
				if(node.nodeType === Node.ELEMENT_NODE){
					const el = /** @type {HTMLElement} */(node);
					if(el.matches('ul, ol')){
						el.querySelectorAll('li').forEach(li=>{ out.push(`- ${textOf(li)}`); });
						out.push('');
						return;
					}
					if(el.classList.contains('note-callout')){
						const body = el.querySelector('.note-body') || el;
						out.push(`※ ${textOf(body)}`);
						return;
					}
					if(el.matches('p, div, span')){
						const t = textOf(el);
						if(t) out.push(t);
						return;
					}
				}
				if(node.nodeType === Node.TEXT_NODE){
					const t = String(node.nodeValue||'').trim();
					if(t) out.push(t);
				}
			});
			// collapse excessive blank lines
			return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
		}

		function buildEmailBody(){
			const crlf = '\r\n';
			const lines = [];
			const val = sel => {
				const el = $(sel);
				if(!el) return '';
				const raw = el.value || '';
				const field = el.getAttribute && el.getAttribute('data-field');
				return (field === 'start_dt' || field === 'end_dt') ? normalizeDateTimeValue(raw) : raw;
			};
			const txt = sel => { const el = $(sel); return el ? (el.textContent||'') : ''; };
			const status = txt('#report-status-text') || '임시저장';
			const title = val('[data-field="task_title"]') || '무제';
			lines.push(`작업보고서 (${status}) - ${title}`);
			lines.push('');
			lines.push('[문서 메타]');
			lines.push(`문서번호: ${val('[data-field="doc_no"]')}`);
			lines.push(`기안일자: ${val('[data-field="draft_date"]')}`);
			lines.push(`기안부서: ${val('[data-field="draft_dept"]')}`);
			lines.push(`문서등급: ${val('[data-field="doc_level"]')}`);
			lines.push(`보존연한: ${val('[data-field="retention"]')}`);
			lines.push(`열람권한: ${val('[data-field="read_perm"]')}`);
			lines.push(`수신부서: ${val('[data-field="recv_dept"]')}`);
			lines.push('');
			lines.push('[작업 상세]');
			lines.push(`프로젝트: ${val('[data-field="project"]')}`);
			lines.push(`작업명: ${title}`);
			lines.push(`시작일시: ${val('[data-field="start_dt"]')}`);
			lines.push(`종료일시: ${val('[data-field="end_dt"]')}`);
			lines.push(`소요시간: ${val('[data-field="duration"]')}`);
			lines.push(`작업대상: ${val('[data-field="targets"]')}`);
			lines.push(`시스템명: ${val('[data-field="business"]')}`);
			lines.push(`작업분류: ${val('[data-field="categories"]')}`);
			lines.push(`작업구분: ${val('[data-field="work_types"]')}`);
			lines.push(`담당부서: ${val('[data-field="rel_dept"]')}`);
			lines.push(`담당자: ${val('[data-field="worker"]')}`);
			lines.push(`참여부서: ${val('[data-field="partner_dept"]')}`);
			lines.push(`참여자: ${val('[data-field="participants"]')}`);
			lines.push(`협력업체: ${val('[data-field="vendor"]')}`);
			lines.push(`협력직원: ${val('[data-field="vendor_staff"]')}`);
			lines.push('');
			function section(field, label){
				const el = $(`.editor[data-field="${field}"]`);
				const content = htmlToPlainWithMarkers(el||document.createElement('div'));
				if(content){
					lines.push(`[${label}]`);
					lines.push(content);
					lines.push('');
				}
			}
			section('overview','작업 개요');
			section('service','대상 서비스');
			section('precheck','사전 점검사항');
			section('procedure','상세절차');
			section('postcheck','사후 점검사항');
			section('resources','원복 절차/시간');
			section('etc','기타 사항');
			// 결과 보고
			const resultEl = $('.section.boxed#box-3 .editor[data-field="report_result"]');
			const result = htmlToPlainWithMarkers(resultEl||document.createElement('div'));
			if(result){
				lines.push('[결과 보고]');
				lines.push(result);
				lines.push('');
			}
			// 결재
			const nameMember = val('[data-field="name_member"]');
			const dateMember = val('[data-field="date_member"]');
			const nameLead = val('[data-field="name_lead"]');
			const dateLead = val('[data-field="date_lead"]');
			lines.push('[결재]');
			lines.push(`팀원: ${nameMember || ''}  (${dateMember || ''})`);
			lines.push(`팀장: ${nameLead || ''}  (${dateLead || ''})`);
			lines.push('');
			// 첨부파일 목록
			const names = $$('#attachments-list .attach-name').map(n=> (n.getAttribute('title')||n.textContent||'').trim()).filter(Boolean);
			lines.push('[첨부파일]');
			if(names.length){ names.forEach(n => lines.push(`- ${n}`)); } else { lines.push('없음'); }
			lines.push('');
			return lines.join(crlf);
		}

		async function buildStandaloneReportHtmlInline(){
			// Clone report like preview (read-only final state)
			const src = document.getElementById('report');
			if(!src) return '';
			const clone = (function makeReadOnlyClone(root){
				const c = root.cloneNode(true);
				// ── cloneNode 값 동기화 ──
				const srcEls = root.querySelectorAll('input, textarea, select');
				const clnEls = c.querySelectorAll('input, textarea, select');
				srcEls.forEach((s,i)=>{
					const d=clnEls[i]; if(!d) return;
					const t=s.tagName, tp=(s.getAttribute('type')||'').toLowerCase();
					if(t==='SELECT'){ d.value=s.value; if(s.selectedIndex>=0&&d.options[s.selectedIndex]) d.selectedIndex=s.selectedIndex; }
					else if(t==='TEXTAREA'){ d.value=s.value; d.textContent=s.value; }
					else if(tp==='checkbox'||tp==='radio'){ d.checked=s.checked; }
					else { d.value=s.value; if(s.value) d.setAttribute('value',s.value); }
				});
				const tb = c.querySelector('.report-toolbar'); if(tb) tb.remove();
				c.querySelectorAll('[contenteditable]').forEach(el=> el.removeAttribute('contenteditable'));
				c.querySelectorAll('.input-with-action').forEach(div=>{
					const input = div.querySelector('input.meta-input');
					const val = input ? (input.value || '') : '';
					const span = document.createElement('span'); span.className='preview-value'; span.textContent = val;
					div.replaceWith(span);
				});
				c.querySelectorAll('input, textarea, select').forEach(el=>{
					const type = (el.getAttribute('type')||'').toLowerCase();
					if(type==='hidden'){ el.remove(); return; }
					if(el.tagName==='SELECT' || type==='checkbox' || type==='radio'){
						el.setAttribute('disabled','true');
						return;
					}
					if(type==='file'){ el.remove(); return; }
					el.setAttribute('readonly','true');
					el.setAttribute('aria-readonly','true');
					el.setAttribute('tabindex','-1');
				});
				const dz = c.querySelector('#attachments-dropzone'); if(dz) dz.remove();
				const ai = c.querySelector('#attachments-input'); if(ai) ai.remove();
				c.querySelectorAll('.attach-actions').forEach(a=> a.remove());
				// 첨부파일이 없으면 섹션 전체 숨김
				const attSec = c.querySelector('#attachments-section');
				const attList = c.querySelector('#attachments-list');
				if(attSec && (!attList || attList.children.length === 0)) attSec.remove();
				return c;
			})(src);

			// Inline CSS (blossom.css + task.css)
			async function fetchText(url){
				const res = await fetch(url, { cache: 'no-store' });
				return res.ok ? (await res.text()) : '';
			}
			const css1 = await fetchText('/static/css/blossom.css?v=1.0.2');
			const css2 = await fetchText('/static/css/task.css?v=1.3.7');
			const styles = `/* inlined for email */\n${css1}\n\n${css2}`;

			const html = `<!DOCTYPE html>
			<html lang="ko">
			<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<title>작업보고서 미리보기</title>
			<style>${styles}</style>
			</head>
			<body class="report-only"><main class="report-main">${clone.outerHTML}</main></body></html>`;
			return html;
		}

		function downloadFile(filename, content, type='text/html;charset=utf-8'){
			const blob = new Blob([content], { type });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url; a.download = filename;
			document.body.appendChild(a); a.click(); a.remove();
			URL.revokeObjectURL(url);
		}

		function toBase64Utf8(str){
			// Encode UTF-8 safely for base64
			return btoa(unescape(encodeURIComponent(str)));
		}

		function makeEml({ subject, html, text }){
			const boundary = '----=_Part_' + Math.random().toString(36).slice(2);
			const subjEnc = '=?UTF-8?B?' + toBase64Utf8(subject) + '?=';
			const htmlB64 = toBase64Utf8(html);
			// text can be left 8bit; ensure CRLF
			const plain = (text||'').replace(/\n/g,'\r\n');
			return [
				'MIME-Version: 1.0',
				`Subject: ${subjEnc}`,
				'Content-Type: multipart/alternative; boundary="' + boundary + '"',
				'',
				'This is a multi-part message in MIME format.',
				'',
				'--' + boundary,
				'Content-Type: text/plain; charset="UTF-8"',
				'Content-Transfer-Encoding: 8bit',
				'',
				plain,
				'',
				'--' + boundary,
				'Content-Type: text/html; charset="UTF-8"',
				'Content-Transfer-Encoding: base64',
				'',
				htmlB64,
				'',
				'--' + boundary + '--',
				''
			].join('\r\n');
		}

		$('#btn-mail') && $('#btn-mail').addEventListener('click', async () => {
			const title = ($('[data-field="task_title"]').value||'무제').trim();
			const subject = `[작업보고서] ${title}`;
			try{
				toast('보고서를 준비하는 중…');
				const bodyHtml = await buildStandaloneReportHtmlInline();
				// 부모창 변수에 HTML 저장 → compose 페이지에서 읽어감
				window.__composeEmailHTML = bodyHtml;
				const composeUrl = `/p/compose-email?subject=${encodeURIComponent(subject)}`;
				window.open(composeUrl, '_blank', 'width=900,height=700,scrollbars=yes,resizable=yes');
			}catch(_e){ toast('메일 작성 화면을 열 수 없습니다.'); }
		});

		// 의견 추가/보기
		const commentsSection = $('#comments-section');
		const commentsList = $('#comments-list');
		function currentUserName(){
			const w = $('[data-field="worker"]');
			const m = $('[data-field="name_member"]');
			return (w && w.value?.trim()) || (m && m.value?.trim()) || '사용자';
		}
		function formatDateTime(d){
			try{
				return new Intl.DateTimeFormat('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }).format(d);
			}catch(_e){ return d.toLocaleString(); }
		}
		function addComment(text, user, dateStr, commentId){
			const item = document.createElement('div');
			item.className = 'comment-item';
			let stamp = dateStr ? String(dateStr) : '';
			if(stamp && /\d{4}-\d{2}-\d{2}T/.test(stamp)){
				try{ stamp = formatDateTime(new Date(stamp)); }catch(_e){}
			}
			if(!stamp){ stamp = formatDateTime(new Date()); }
			const who = (user || currentUserName());
			if(commentId != null && String(commentId).trim() !== ''){
				item.dataset.commentId = String(commentId);
			}
			item.innerHTML = `
				<div class="comment-header">
					<div class="comment-head-left">
						<span class="comment-user">${escapeHtml(who)}</span>
						<span class="comment-sep">·</span>
						<span class="comment-date">${escapeHtml(stamp)}</span>
					</div>
					<div class="comment-actions">
						<button type="button" class="icon-btn comment-action" data-action="edit" title="수정" aria-label="수정">
							<img src="/static/image/svg/list/free-icon-pencil.svg" alt="" aria-hidden="true">
						</button>
						<button type="button" class="icon-btn comment-action" data-action="delete" title="삭제" aria-label="삭제">
							<img src="/static/image/svg/list/free-icon-trash.svg" alt="" aria-hidden="true">
						</button>
					</div>
				</div>
				<div class="comment-text">${escapeHtml(text)}</div>
			`;
			commentsList.appendChild(item);
		}

		commentsManager = {
			flushPendingComments: async (rid)=>{
				const reportId = Number(rid);
				if(!reportId) return;
				// Create any local-only comments that lack a server id.
				const items = Array.from(document.querySelectorAll('#comments-list .comment-item'));
				for(const el of items){
					const hasId = (el.dataset && el.dataset.commentId && String(el.dataset.commentId).trim() !== '');
					if(hasId) continue;
					const text = (el.querySelector('.comment-text')?.textContent || '').trim();
					if(!text) continue;
					try{
						const { res, json } = await fetchJson(`/api/wrk/reports/${encodeURIComponent(reportId)}/comments`, {
							method: 'POST',
							headers: { 'Content-Type':'application/json' },
							body: JSON.stringify({ text }),
						});
						if(res.ok && json && json.success === true && json.item && json.item.id){
							el.dataset.commentId = String(json.item.id);
							const who = el.querySelector('.comment-user');
							if(who && json.item.created_by_name){ who.textContent = String(json.item.created_by_name); }
							const dt = el.querySelector('.comment-date');
							if(dt && json.item.created_at){
								try{ dt.textContent = formatDateTime(new Date(json.item.created_at)); }catch(_e){}
							}
						}
					}catch(_e){}
				}
			},
		};
		// 의견 추가 모달 열기 (이벤트 객체가 초기 텍스트로 들어가 "[object PointerEvent]"가 뜨지 않도록 방지)
		$('#btn-comment-add') && $('#btn-comment-add').addEventListener('click', () => openCommentAddModal(''));
		$('#btn-comment-toggle') && $('#btn-comment-toggle').addEventListener('click', () => {
			// Always show the comments section and scroll to it
			if(commentsSection){
				commentsSection.hidden = false;
				// ensure focusability for assistive tech and keyboard users
				if(!commentsSection.hasAttribute('tabindex')) commentsSection.setAttribute('tabindex','-1');
				const top = commentsSection.getBoundingClientRect().top + window.scrollY - 16; // small offset
				window.scrollTo({ top, behavior: 'smooth' });
				// focus after a short delay so it's in view
				setTimeout(()=>{ try{ commentsSection.focus({ preventScroll: true }); }catch(_e){} }, 350);
			}
		});

		// 댓글 편집/삭제 위임 처리
		commentsList.addEventListener('click', (e)=>{
			const btn = e.target.closest('button');
			if(!btn) return;
			const action = btn.getAttribute('data-action');
			const item = btn.closest('.comment-item');
			if(!item) return;
			if(action === 'delete'){
				openCommentDeleteModal(item);
				return;
			}
			if(action === 'edit'){
				commentEditTarget = item;
				const txt = item.querySelector('.comment-text')?.textContent || '';
				openCommentAddModal(txt);
			}
		});

			// 별도 스크롤 버튼 제거: 마우스/터치 기본 스크롤 사용

	// ---- 첨부파일 업로드 (서버 연동: wrk_report_file) ----
	function initAttachments(){
		const input = document.getElementById('attachments-input');
		const drop = document.getElementById('attachments-dropzone');
		const list = document.getElementById('attachments-list');
		const countEl = document.getElementById('attachments-count');
		if(!input || !drop || !list || !countEl) return;

		/** @type {File[]} */
		let pendingFiles = [];
		/** @type {Array<{id:number, original_name?:string, originalName?:string, size_bytes?:number|null, sizeBytes?:number|null, content_type?:string|null, contentType?:string|null}>} */
		let serverFiles = [];

		function fmtSize(bytes){
			const units = ['B','KB','MB','GB'];
			let i=0, n=bytes;
			while(n>=1024 && i<units.length-1){ n/=1024; i++; }
			return `${n.toFixed(n<10 && i>0 ? 1:0)}${units[i]}`;
		}

		function render(){
			list.innerHTML = '';
			// server files first
			serverFiles.forEach((f)=>{
				const fileId = Number(f.id);
				const name = String(f.original_name || f.originalName || '').trim() || `file_${fileId}`;
				const size = (f.size_bytes != null ? f.size_bytes : f.sizeBytes);
				const dl = (REPORT_ID && fileId) ? `/api/wrk/reports/${encodeURIComponent(REPORT_ID)}/files/${encodeURIComponent(fileId)}/download` : '#';

				const item = document.createElement('div');
				item.className = 'attach-item';
				item.innerHTML = `
					<div class="attach-left">
						<a class="attach-name" href="${dl}" title="${escapeHtml(name)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>
						<span class="attach-size">${(typeof size === 'number') ? fmtSize(size) : ''}</span>
					</div>
					<div class="attach-actions">
						<button type="button" class="icon-btn" title="삭제" aria-label="삭제" data-action="delete-server" data-id="${fileId}">
							<img src="/static/image/svg/project/free-icon-delete-document.svg" alt="" aria-hidden="true">
						</button>
					</div>
				`;
				list.appendChild(item);
			});
			// pending local files
			pendingFiles.forEach((f, idx)=>{
				const item = document.createElement('div');
				item.className = 'attach-item';
				item.innerHTML = `
					<div class="attach-left">
						<span class="attach-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
						<span class="attach-size">${fmtSize(f.size)}</span>
					</div>
					<div class="attach-actions">
						<button type="button" class="icon-btn" title="삭제" aria-label="삭제" data-action="remove-pending" data-idx="${idx}">
							<img src="/static/image/svg/project/free-icon-delete-document.svg" alt="" aria-hidden="true">
						</button>
					</div>
				`;
				list.appendChild(item);
			});
			countEl.textContent = `${serverFiles.length + pendingFiles.length}개`;
		}

		function addFiles(fileList){
			const MAX_FILES = 10;
			const MAX_SIZE = 50 * 1024 * 1024; // 50MB
			const arr = Array.from(fileList || []);
			for(const f of arr){
				if(serverFiles.length + pendingFiles.length >= MAX_FILES){ toast('최대 10개까지 첨부 가능합니다.'); break; }
				if(f.size > MAX_SIZE){ toast(`${f.name}: 50MB를 초과했습니다.`); continue; }
				pendingFiles.push(f);
			}
			render();
			// If we already have a report id, upload immediately
			if(REPORT_ID){
				flushPendingUploads(REPORT_ID).catch(()=>{});
			}
		}

		async function flushPendingUploads(reportId){
			const rid = reportId ? Number(reportId) : NaN;
			if(!Number.isFinite(rid) || rid <= 0) return;
			if(pendingFiles.length === 0) return;

			// Respect max(10) on server-side: upload in chunks
			const MAX_FILES = 10;
			const slots = Math.max(0, MAX_FILES - serverFiles.length);
			if(slots <= 0){
				toast('최대 10개까지 첨부 가능합니다.');
				pendingFiles = [];
				render();
				return;
			}

			const chunk = pendingFiles.slice(0, slots);
			const remain = pendingFiles.slice(slots);

			const fd = new FormData();
			chunk.forEach(f=> fd.append('files', f, f.name));
			let res, json;
			try{
				const r = await fetch(`/api/wrk/reports/${encodeURIComponent(rid)}/files`, { method:'POST', credentials:'same-origin', body: fd });
				res = r;
				json = await r.json().catch(()=> ({}));
			}catch(_e){
				toast('첨부파일 업로드 중 오류가 발생했습니다.');
				return;
			}
			if(!res || !res.ok || !json || json.success !== true){
				toast((json && json.message) ? json.message : '첨부파일 업로드에 실패했습니다.');
				return;
			}
			const created = Array.isArray(json.items) ? json.items : [];
			serverFiles = serverFiles.concat(created.map(it=>({
				id: it.id,
				original_name: it.original_name || it.originalName,
				size_bytes: it.size_bytes != null ? it.size_bytes : it.sizeBytes,
				content_type: it.content_type || it.contentType
			})));
			pendingFiles = remain;
			render();
			if(pendingFiles.length){
				// Upload remaining if any
				await flushPendingUploads(rid);
			}
		}

		async function deleteServerFile(fileId){
			const rid = REPORT_ID;
			if(!rid) return;
			const fid = Number(fileId);
			if(!Number.isFinite(fid) || fid <= 0) return;
			const { res, json } = await fetchJson(`/api/wrk/reports/${encodeURIComponent(rid)}/files/${encodeURIComponent(fid)}`, { method:'DELETE' });
			if(!res.ok || !json || json.success !== true){
				toast((json && json.message) ? json.message : '첨부파일 삭제에 실패했습니다.');
				return;
			}
			serverFiles = serverFiles.filter(f=> Number(f.id) !== fid);
			render();
		}

		list.addEventListener('click', (e)=>{
			const btn = e.target.closest('button[data-action]');
			if(!btn) return;
			const action = btn.getAttribute('data-action');
			if(action === 'remove-pending'){
				const idx = Number(btn.getAttribute('data-idx'));
				if(!Number.isNaN(idx)){
					pendingFiles.splice(idx,1);
					render();
				}
				return;
			}
			if(action === 'delete-server'){
				const fid = Number(btn.getAttribute('data-id'));
				deleteServerFile(fid).catch(()=>{});
				return;
			}
		});

		input.addEventListener('change', ()=>{
			addFiles(input.files);
			input.value = '';
		});

		drop.addEventListener('dragover', (e)=>{ e.preventDefault(); drop.classList.add('dragover'); });
		drop.addEventListener('dragleave', ()=>{ drop.classList.remove('dragover'); });
		drop.addEventListener('drop', (e)=>{
			e.preventDefault(); drop.classList.remove('dragover');
			addFiles(e.dataTransfer?.files);
		});

		render();

		function setServerFiles(files){
			if(!Array.isArray(files)) return;
			serverFiles = files.map(it=>({
				id: it.id,
				original_name: it.original_name || it.originalName,
				size_bytes: it.size_bytes != null ? it.size_bytes : it.sizeBytes,
				content_type: it.content_type || it.contentType
			}));
			render();
		}

		function clearAllFiles(){
			pendingFiles = [];
			serverFiles = [];
			render();
			try{ input.value = ''; }catch(_e){}
		}

		return {
			setServerFiles,
			flushPendingUploads,
			clearAllFiles,
		};
	}

/** 폼 잠금 공통 구현 (lockFormForUser / lockFormForCompleted 에서 호출) */
	function _applyFormLock(){
		const wrap = document.querySelector('.report-sheet');
		if(wrap) wrap.classList.add('form-locked');

		function lockAllElements(){
			// input/textarea: readonly + tabindex
			document.querySelectorAll('.report-sheet input, .report-sheet textarea').forEach(el => {
				if(el.type === 'checkbox' || el.type === 'radio'){
					el.disabled = true;
				} else {
					el.setAttribute('readonly', 'true');
					el.setAttribute('tabindex', '-1');
					el.disabled = false; // keep readonly style, not grey disabled
				}
			});
			// select: disabled (읽기전용이 select엔 안 먹힘)
			document.querySelectorAll('.report-sheet select').forEach(el => {
				el.disabled = true;
				el.setAttribute('tabindex', '-1');
			});
			// contenteditable
			document.querySelectorAll('.report-sheet [contenteditable="true"]').forEach(ed => {
				ed.setAttribute('contenteditable', 'false');
			});
			// chip-select
			document.querySelectorAll('.js-chip-select').forEach(root => {
				root.dataset.chipReadonly = '1';
				const search = root.querySelector('.js-chip-search');
				if(search){ search.setAttribute('readonly','true'); search.disabled = true; }
				root.querySelectorAll('.share-chip-remove').forEach(btn => btn.style.display = 'none');
			});
			// 버튼 숨김
			['btn-persist','btn-save','btn-clear','btn-targets-upload','btn-cancel-work'].forEach(id => {
				const el = document.getElementById(id);
				if(el) el.style.display = 'none';
			});
			document.querySelectorAll('.file-upload-btn, .file-drop-zone, .attach-add-btn, .file-remove-btn, .attach-remove-btn').forEach(el => el.style.display = 'none');
			// 의견 추가는 모든 단계에서 허용 — 잠금 대상에서 제외
		}

		lockAllElements();

		// DOM 변경 감지: 비동기 초기화 후 추가되는 요소도 잠금
		if(wrap && typeof MutationObserver !== 'undefined'){
			const obs = new MutationObserver(()=>{ lockAllElements(); });
			obs.observe(wrap, { childList: true, subtree: true });
			// 3초 후 감시 중단 (초기화 윙)
			setTimeout(()=> obs.disconnect(), 3000);
		}
	}

	// 상신/승인 버튼: 세션 역할 저장용
	let _sessionRole = null;

	/**
	 * 완료(COMPLETED) / 완료보관(ARCHIVED) 상태의 문서는
	 * 모든 역할(팀장/관리자 포함)에서 읽기 전용으로 잠금
	 */
	function lockFormForCompleted(){
		const status = String(REPORT_STATUS_CODE || '').toUpperCase();
		if(status !== 'COMPLETED' && status !== 'ARCHIVED') return;
		console.log('[lockFormForCompleted] status=', status, '=> 전체 읽기 전용 잠금');
		_applyFormLock();
	}

	/**
	 * 승인 이후(APPROVED/SCHEDULED/IN_PROGRESS) 상태이면
	 * 모든 역할(팀장·관리자 포함)에서 폼 전체를 읽기 전용으로 잠금
	 * (COMPLETED/ARCHIVED는 lockFormForCompleted에서 처리)
	 */
	function lockFormForUser(){
		const role = (_sessionRole || '').toUpperCase();
		const status = String(REPORT_STATUS_CODE || '').toUpperCase();
		const lockedStatuses = ['APPROVED','SCHEDULED','IN_PROGRESS'];
		const shouldLock = lockedStatuses.includes(status);
		console.log('[lockForm] role=', role, 'status=', status, 'lock?', shouldLock);
		if(!shouldLock) return;

		// 공통 잠금 로직 호출
		_applyFormLock();
	}

	// ── 보고서 초기화 완료 후 부드럽게 표시 ──
	function revealReport(){
		document.body.removeAttribute('data-loading');
	}
	// 안전망: JS 오류로 reveal이 호출되지 않을 경우 2초 후 강제 표시
	setTimeout(revealReport, 2000);

	// 최종: 체크박스/라디오 동기화 초기화 (카테고리/작업구분/영향도)
	setupCategoriesSync();
	setupWorkTypesSync();
	setupImpactSync();

	// Attachments must be ready before initial API load so loaded files render.
	attachmentsManager = initAttachments() || null;

	// 초기 로딩: URL id가 있으면 서버에서 로드, 없으면 localStorage 사용
	(async ()=>{
		// ── 항상 세션 사용자 정보를 먼저 가져옴 ──
		const me = await getSessionUser();
		console.log('[init] session/me =', me);
		_sessionRole = ((me && me.role) || '').toUpperCase();
		const userName = (me && me.name) || '';
		const userDept = (me && (me.dept_name || me.department)) || '';
		const userId = (me && me.id) || null;
		const userDeptId = (me && me.dept_id) || null;
		console.log('[init] userDept=', userDept, 'role=', _sessionRole);

		// 기안부서는 항상 세션 사용자 소속팀으로 강제 매핑
		if(userDept){
			const draftDept = $('[data-field="draft_dept"]');
			console.log('[init] draftDept el=', draftDept, 'setting to', userDept);
			if(draftDept) draftDept.value = userDept;
		}

		// 기존 보고서 열기
		if(REPORT_ID){
			const ok = await loadFromApi(REPORT_ID);
			if(ok){
				// 기안부서는 항상 세션 사용자 소속팀으로 강제 매핑
				if(userDept){
					const draftDept = $('[data-field="draft_dept"]');
					if(draftDept) draftDept.value = userDept;
				}
				try{ updatePersistButton(); }catch(_e){}
				try{ lockFormForCompleted(); }catch(_e){}
				try{ lockFormForUser(); }catch(_e){}
				revealReport();
				return;
			}
		}

		// localStorage 임시저장 복원 (있으면)
		let loadedFromStorage = false;
		if(localStorage.getItem(_storageKey())){
			loadFromStorage();
			loadedFromStorage = true;
		}

		if(!loadedFromStorage){
			const today = new Date();
			const y = today.getFullYear();
			const m = String(today.getMonth()+1).padStart(2,'0');
			const d = String(today.getDate()).padStart(2,'0');
			const draft = $('[data-field="draft_date"]');
			if(draft) draft.value = `${y}-${m}-${d}`;
		}
		// 기안부서는 항상 세션 사용자 소속팀으로 강제 매핑
		if(userDept){
			const draftDept = $('[data-field="draft_dept"]');
			if(draftDept) draftDept.value = userDept;
		}

		// 담당부서 자동 설정 (chip-select) — 항상 세션 사용자 기준으로 설정
		if(userDept){
			const relDeptEl = $('[data-field="rel_dept"]');
			if(relDeptEl) relDeptEl.value = userDept;
			const relDeptIdEl = $('[data-field="rel_dept_id"]');
			if(relDeptIdEl && userDeptId) relDeptIdEl.value = String(userDeptId);
			const deptChipRoot = document.querySelector('.js-chip-select[data-chip-hidden-text-field="rel_dept"]');
			if(deptChipRoot && deptChipRoot.__chipSelect){
				deptChipRoot.__chipSelect.setSelected([{ key:`dept:${userDeptId||userDept}`, id: userDeptId, label: userDept, meta:'', type:'dept' }]);
			}
		}
		// 담당자 자동 설정 (chip-select) — 항상 세션 사용자 기준으로 설정
		if(userName){
			const workerEl = $('[data-field="worker"]');
			if(workerEl) workerEl.value = userName;
			const workerIdEl = $('[data-field="worker_user_id"]');
			if(workerIdEl && userId) workerIdEl.value = String(userId);
			const userChipRoot = document.querySelector('.js-chip-select[data-chip-hidden-text-field="worker"]');
			if(userChipRoot && userChipRoot.__chipSelect){
				userChipRoot.__chipSelect.setSelected([{ key:`user:${userId||userName}`, id: userId, label: userName, meta: userDept||'', type:'user' }]);
			}
		}

		// 결재 팀원 칸 자동 채움 (서명·이름·날짜시간)
		if(!loadedFromStorage){
			fillMemberApprovalDefaults(userName);
		}
		try{ updatePersistButton(); }catch(_e){}
		try{ lockFormForCompleted(); }catch(_e){}
		try{ lockFormForUser(); }catch(_e){}
		revealReport();
	})();

	// 상신/승인 버튼(btn-persist) 동적 레이블/표시 제어
	function updatePersistButton(){
		const btn = $('#btn-persist');
		const cancelBtn = document.getElementById('btn-cancel-work');
		if(!btn) return;
		const status = String(REPORT_STATUS_CODE || '').toUpperCase();
		const imgEl = btn.querySelector('.icon-img');
		// 작업취소 버튼: IN_PROGRESS 에서만 표시
		if(cancelBtn){
			cancelBtn.style.display = (status === 'IN_PROGRESS') ? '' : 'none';
		}
		if(status === 'DRAFT'){
			// 모든 사용자: 상신 버튼
			btn.style.display = '';
			btn.title = '상신';
			btn.setAttribute('aria-label', '상신');
			if(imgEl) imgEl.src = '/static/image/svg/project/free-icon-paper-plane.svg';
		}else if(status === 'REVIEW'){
			// 팀장만: 승인 버튼
			const canApprove = (_sessionRole === 'TEAM_LEADER');
			btn.style.display = canApprove ? '' : 'none';
			btn.title = '승인';
			btn.setAttribute('aria-label', '승인');
			if(imgEl) imgEl.src = '/static/image/svg/project/free-icon-audit.svg';
		}else{
			// 기타 상태: 숨김
			btn.style.display = 'none';
		}
	}

	// Apply rich markers initially on loaded editors (if any markers exist)
	editables.forEach(applyRichMarkers);

	// Initialize attachments UI at the end (idempotent)
	if(!attachmentsManager){ attachmentsManager = initAttachments() || null; }

	// ---- 의견 추가 모달 로직 ----
	let commentEditTarget = null;
    let commentDeleteTarget = null;
	function openCommentAddModal(initialText){
		// Guard against being called as an event handler accidentally
		const initText = (typeof initialText === 'string') ? initialText : '';
		const modal = document.getElementById('comment-add-modal');
		if(!modal){
			const text = window.prompt('의견을 입력하세요', initText);
			if(text && text.trim()){
				commentsSection.hidden = false;
				if(commentEditTarget){
					const t = commentEditTarget.querySelector('.comment-text'); if(t) t.textContent = text.trim();
					const d = commentEditTarget.querySelector('.comment-date'); if(d) d.textContent = formatDateTime(new Date());
					commentEditTarget = null;
				} else {
					addComment(text.trim());
				}
				saveToStorage();
				toast('의견이 추가되었습니다.');
			}
			return;
		}
		modal.classList.add('show');
		modal.setAttribute('aria-hidden','false');
		document.body.classList.add('modal-open');
		setupCommentAddModalOnce();
		const textarea = document.getElementById('comment-add-text');
		if(textarea){ textarea.value = initText; textarea.focus(); }
	}

	function closeCommentAddModal(){
		const modal = document.getElementById('comment-add-modal');
		if(!modal) return;
		modal.classList.remove('show');
		modal.setAttribute('aria-hidden','true');
		document.body.classList.remove('modal-open');
	}

	function setupCommentAddModalOnce(){
		if(setupCommentAddModalOnce._init) return;
		setupCommentAddModalOnce._init = true;
		const modal = document.getElementById('comment-add-modal');
		if(!modal) return;
		modal.addEventListener('click', (e)=>{ if(e.target === modal) closeCommentAddModal(); });
		const btnClose = document.getElementById('comment-add-close');
		btnClose && btnClose.addEventListener('click', closeCommentAddModal);
		const btnOk = document.getElementById('comment-add-confirm');
			btnOk && btnOk.addEventListener('click', async ()=>{
			const ta = document.getElementById('comment-add-text');
			const text = ta ? ta.value.trim() : '';
			if(!text){ toast('의견을 입력하세요.'); return; }
			commentsSection.hidden = false;
				// Server-backed when REPORT_ID exists; fallback to local when missing.
				if(commentEditTarget){
					const cid = commentEditTarget?.dataset?.commentId;
					if(REPORT_ID && cid){
						try{
							const { res, json } = await fetchJson(`/api/wrk/reports/${encodeURIComponent(REPORT_ID)}/comments/${encodeURIComponent(cid)}` , {
								method:'PUT',
								headers:{ 'Content-Type':'application/json' },
								body: JSON.stringify({ text }),
							});
							if(!res.ok || !json || json.success !== true){
								toast((json && json.message) ? json.message : '의견 수정에 실패했습니다.');
								return;
							}
							const t = commentEditTarget.querySelector('.comment-text'); if(t) t.textContent = text;
							const d = commentEditTarget.querySelector('.comment-date'); if(d) d.textContent = formatDateTime(new Date());
							commentEditTarget = null;
							toast('의견이 수정되었습니다.');
						}catch(_e){
							toast('의견 수정 중 오류가 발생했습니다.');
							return;
						}
					}else{
						const t = commentEditTarget.querySelector('.comment-text'); if(t) t.textContent = text;
						const d = commentEditTarget.querySelector('.comment-date'); if(d) d.textContent = formatDateTime(new Date());
						commentEditTarget = null;
						toast('의견이 수정되었습니다.');
					}
				}else{
					if(REPORT_ID){
						try{
							const { res, json } = await fetchJson(`/api/wrk/reports/${encodeURIComponent(REPORT_ID)}/comments`, {
								method:'POST',
								headers:{ 'Content-Type':'application/json' },
								body: JSON.stringify({ text }),
							});
							if(!res.ok || !json || json.success !== true || !json.item){
								toast((json && json.message) ? json.message : '의견 등록에 실패했습니다.');
								return;
							}
							addComment(text, json.item.created_by_name || currentUserName(), json.item.created_at || '', json.item.id);
							toast('의견이 추가되었습니다.');
						}catch(_e){
							toast('의견 등록 중 오류가 발생했습니다.');
							return;
						}
					}else{
						addComment(text);
						toast('의견이 추가되었습니다.');
					}
				}
				saveToStorage();
				closeCommentAddModal();
		});
		document.addEventListener('keydown', (e)=>{
			if(e.key === 'Escape'){
				const isOpen = modal.classList.contains('show');
				if(isOpen) closeCommentAddModal();
			}
		});
	}

	// ---- 의견 삭제 모달 로직 ----
	function openCommentDeleteModal(targetItem){
		const modal = document.getElementById('comment-delete-modal');
		if(!modal){
			// Fallback to custom confirm modal
			showConfirmModal('삭제하시겠습니까?', '삭제처리').then(ok=>{
				if(ok){
					targetItem && targetItem.remove();
					saveToStorage();
					toast('의견이 삭제되었습니다.');
				}
			});
			return;
		}
		commentDeleteTarget = targetItem || null;
		modal.classList.add('show');
		modal.setAttribute('aria-hidden','false');
		document.body.classList.add('modal-open');
		setupCommentDeleteModalOnce();
	}
	function closeCommentDeleteModal(){
		const modal = document.getElementById('comment-delete-modal');
		if(!modal) return;
		modal.classList.remove('show');
		modal.setAttribute('aria-hidden','true');
		document.body.classList.remove('modal-open');
		commentDeleteTarget = null;
	}
	function setupCommentDeleteModalOnce(){
		if(setupCommentDeleteModalOnce._init) return;
		setupCommentDeleteModalOnce._init = true;
		const modal = document.getElementById('comment-delete-modal');
		if(!modal) return;
		const onOverlay = (e)=>{ if(e.target === modal) closeCommentDeleteModal(); };
		modal.addEventListener('click', onOverlay);
		const btnClose = document.getElementById('comment-delete-close');
		btnClose && btnClose.addEventListener('click', closeCommentDeleteModal);
		const btnOk = document.getElementById('comment-delete-confirm');
			btnOk && btnOk.addEventListener('click', async ()=>{
				if(commentDeleteTarget){
					const cid = commentDeleteTarget?.dataset?.commentId;
					if(REPORT_ID && cid){
						try{
							const { res, json } = await fetchJson(`/api/wrk/reports/${encodeURIComponent(REPORT_ID)}/comments/${encodeURIComponent(cid)}` , { method:'DELETE' });
							if(!res.ok || !json || json.success !== true){
								toast((json && json.message) ? json.message : '의견 삭제에 실패했습니다.');
								return;
							}
							commentDeleteTarget.remove();
							commentDeleteTarget = null;
							saveToStorage();
							toast('의견이 삭제되었습니다.');
						}catch(_e){
							toast('의견 삭제 중 오류가 발생했습니다.');
							return;
						}
					}else{
						commentDeleteTarget.remove();
						commentDeleteTarget = null;
						saveToStorage();
						toast('의견이 삭제되었습니다.');
					}
				}
				closeCommentDeleteModal();
			});
		document.addEventListener('keydown', (e)=>{
			if(e.key === 'Escape'){
				const isOpen = modal.classList.contains('show');
				if(isOpen) closeCommentDeleteModal();
			}
		});
	}

	// ---- Preview window (read-only final view) ----
	function openPreview(){
		const src = document.getElementById('report');
		if(!src){ toast('미리보기를 생성할 수 없습니다.'); return; }
		const clone = (function makeReadOnlyClone(root){
			const c = root.cloneNode(true);

			// ── cloneNode은 JS로 설정된 .value/.checked 를 복사하지 못함 → 수동 동기화 ──
			const srcInputs = root.querySelectorAll('input, textarea, select');
			const cloneInputs = c.querySelectorAll('input, textarea, select');
			srcInputs.forEach((srcEl, i) => {
				const cloneEl = cloneInputs[i];
				if(!cloneEl) return;
				const tag = srcEl.tagName;
				const type = (srcEl.getAttribute('type')||'').toLowerCase();
				if(tag === 'SELECT'){
					cloneEl.value = srcEl.value;
					// selectedIndex도 동기화
					if(srcEl.selectedIndex >= 0 && cloneEl.options[srcEl.selectedIndex]){
						cloneEl.selectedIndex = srcEl.selectedIndex;
					}
				} else if(tag === 'TEXTAREA'){
					cloneEl.value = srcEl.value;
					cloneEl.textContent = srcEl.value; // textarea는 textContent도 설정
				} else if(type === 'checkbox' || type === 'radio'){
					cloneEl.checked = srcEl.checked;
				} else {
					cloneEl.value = srcEl.value;
					// HTML attribute도 동기화하여 readonly 렌더 시 보임
					if(srcEl.value) cloneEl.setAttribute('value', srcEl.value);
				}
			});

			// Remove internal toolbar
			const tb = c.querySelector('.report-toolbar'); if(tb) tb.remove();
			// Disable any editable areas
			c.querySelectorAll('[contenteditable]').forEach(el=> el.removeAttribute('contenteditable'));
			// Simplify input-with-action (작업대상) to plain text
			c.querySelectorAll('.input-with-action').forEach(div=>{
				const input = div.querySelector('input.meta-input');
				const val = input ? (input.value || '') : '';
				const span = document.createElement('span'); span.className='preview-value'; span.textContent = val;
				div.replaceWith(span);
			});
			// Make remaining inputs non-interactive while keeping visuals
			c.querySelectorAll('input, textarea, select').forEach(el=>{
				const type = (el.getAttribute('type')||'').toLowerCase();
				if(type==='hidden'){ el.remove(); return; }
				if(el.tagName==='SELECT'){
					el.setAttribute('disabled','true');
					return;
				}
				if(type==='checkbox' || type==='radio'){
					el.setAttribute('disabled','true');
					return;
				}
				if(type==='file'){
					el.remove();
					return;
				}
				// Text-like inputs and textareas
				el.setAttribute('readonly','true');
				el.setAttribute('aria-readonly','true');
				// Prevent focus outline on click in preview window
				el.setAttribute('tabindex','-1');
			});
			// Attachments: remove interactive controls but keep list/count
			const dz = c.querySelector('#attachments-dropzone'); if(dz) dz.remove();
			const ai = c.querySelector('#attachments-input'); if(ai) ai.remove();
			c.querySelectorAll('.attach-actions').forEach(a=> a.remove());
			// 첨부파일이 없으면 섹션 전체 숨김
			const attSec = c.querySelector('#attachments-section');
			const attList = c.querySelector('#attachments-list');
			if(attSec && (!attList || attList.children.length === 0)) attSec.remove();
			return c;
		})(src);

		// Build standalone HTML for the new window
		const html = `<!DOCTYPE html>
		<html lang="ko">
		<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>미리보기 - 작업보고서</title>
		<link rel="stylesheet" href="/static/css/blossom.css?v=1.0.2">
		<link rel="stylesheet" href="/static/css/task.css?v=1.3.7">
		<style>
		  body{ background:#f3f4f6; margin:0; padding:18px; display:flex; justify-content:center; }
		  /* 미리보기: 선택 불가 요소 포인터 커서 방지 */
		  input[type="checkbox"], input[type="radio"], select,
		  label, .chip-toggle span, .switch, .switch-slider,
		  .impact-radio-group label, .impact-radio-group input,
		  .category-section label, .category-section input,
		  .worktype-section label, .worktype-section input,
		  .js-chip-select, .js-chip-search,
		  .input-with-action, .input-with-action button,
		  .file-upload-btn, .attach-add-btn {
		    cursor: default !important;
		    pointer-events: none;
		  }
		</style>
		</head>
		<body class="report-only">${clone.outerHTML}</body></html>`;
		const w = window.open('', '_blank');
		if(!w){ toast('팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.'); return; }
		w.document.open();
		w.document.write(html);
		w.document.close();
	}

	// PDF 확인 모달 열기/닫기
	function openPdfConfirmModal(){
		const modal = document.getElementById('pdf-confirm-modal');
		if(!modal){ openPdf(); return; } // 폴백: 모달 없으면 바로 실행
		modal.classList.add('show');
		modal.setAttribute('aria-hidden','false');
		document.body.classList.add('modal-open');
		setupPdfConfirmModalOnce();
	}
	function closePdfConfirmModal(){
		const modal = document.getElementById('pdf-confirm-modal');
		if(!modal) return;
		modal.classList.remove('show');
		modal.setAttribute('aria-hidden','true');
		document.body.classList.remove('modal-open');
	}
	function setupPdfConfirmModalOnce(){
		if(setupPdfConfirmModalOnce._init) return; // 한 번만 바인딩
		setupPdfConfirmModalOnce._init = true;
		const modal = document.getElementById('pdf-confirm-modal');
		if(!modal) return;
		const onOverlayClick = (e)=>{ if(e.target === modal) closePdfConfirmModal(); };
		modal.addEventListener('click', onOverlayClick);
		const btnYes = document.getElementById('pdf-confirm-yes');
		const btnClose = document.getElementById('pdf-confirm-close');
		btnClose && btnClose.addEventListener('click', closePdfConfirmModal);
		btnYes && btnYes.addEventListener('click', async ()=>{ closePdfConfirmModal(); await savePdfDirect(); });
		document.addEventListener('keydown', (e)=>{
			if(e.key === 'Escape'){
				const isOpen = modal.classList.contains('show');
				if(isOpen) closePdfConfirmModal();
			}
		});
	}

	// --- Direct PDF download using html2pdf (no print dialog) ---
	async function ensureHtml2Pdf(){
		if(window.html2pdf) return;
		await new Promise((resolve, reject)=>{
			const s = document.createElement('script');
			s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
			s.async = true;
			s.onload = resolve;
			s.onerror = ()=> reject(new Error('html2pdf load failed'));
			document.head.appendChild(s);
		});
	}

	async function savePdfDirect(){
		try{
			await ensureHtml2Pdf();
		}catch(_e){
			toast('PDF 모듈을 불러오지 못했습니다.');
			// 폴백: 인쇄 대화상자
			openPdf();
			return;
		}
		const src = document.getElementById('report');
		if(!src){ toast('PDF를 생성할 수 없습니다.'); return; }
		// Create a read-only clone (same as preview)
		const clone = (function makeReadOnlyClone(root){
			const c = root.cloneNode(true);
			// ── cloneNode 값 동기화 ──
			const srcEls = root.querySelectorAll('input, textarea, select');
			const clnEls = c.querySelectorAll('input, textarea, select');
			srcEls.forEach((s,i)=>{
				const d=clnEls[i]; if(!d) return;
				const t=s.tagName, tp=(s.getAttribute('type')||'').toLowerCase();
				if(t==='SELECT'){ d.value=s.value; if(s.selectedIndex>=0&&d.options[s.selectedIndex]) d.selectedIndex=s.selectedIndex; }
				else if(t==='TEXTAREA'){ d.value=s.value; d.textContent=s.value; }
				else if(tp==='checkbox'||tp==='radio'){ d.checked=s.checked; }
				else { d.value=s.value; if(s.value) d.setAttribute('value',s.value); }
			});
			const tb = c.querySelector('.report-toolbar'); if(tb) tb.remove();
			c.querySelectorAll('[contenteditable]').forEach(el=> el.removeAttribute('contenteditable'));
			c.querySelectorAll('.input-with-action').forEach(div=>{
				const input = div.querySelector('input.meta-input');
				const val = input ? (input.value || '') : '';
				const span = document.createElement('span'); span.className='preview-value'; span.textContent = val;
				div.replaceWith(span);
			});
			c.querySelectorAll('input, textarea, select').forEach(el=>{
				const type = (el.getAttribute('type')||'').toLowerCase();
				if(type==='hidden'){ el.remove(); return; }
				if(el.tagName==='SELECT' || type==='checkbox' || type==='radio'){
					el.setAttribute('disabled','true');
					return;
				}
				if(type==='file'){ el.remove(); return; }
				el.setAttribute('readonly','true');
				el.setAttribute('aria-readonly','true');
				el.setAttribute('tabindex','-1');
			});
			const dz = c.querySelector('#attachments-dropzone'); if(dz) dz.remove();
			const ai = c.querySelector('#attachments-input'); if(ai) ai.remove();
			c.querySelectorAll('.attach-actions').forEach(a=> a.remove());
			// 첨부파일이 없으면 섹션 전체 숨김
			const attSec = c.querySelector('#attachments-section');
			const attList = c.querySelector('#attachments-list');
			if(attSec && (!attList || attList.children.length === 0)) attSec.remove();
			return c;
		})(src);

		// Place clone into an offscreen container so html2pdf can render it with existing CSS
		const holder = document.createElement('div');
		holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:794px;z-index:-1;opacity:0;';
		// Ensure outer structure for width fidelity
		const wrapper = document.createElement('main');
		wrapper.className = 'report-main';
		wrapper.appendChild(clone);
		holder.appendChild(wrapper);
		document.body.appendChild(holder);

		try{
			const title = (document.querySelector('[data-field="task_title"]').value||'무제').trim();
			const safeTitle = title.replace(/[\/:*?"<>|]/g, ' ');
			const opt = {
				margin:       [0, 0, 0, 0],
				filename:     `작업보고서_${safeTitle}.pdf`,
				image:        { type: 'jpeg', quality: 0.96 },
				html2canvas:  { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
				jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
			};
			await window.html2pdf().set(opt).from(wrapper).save();
			toast('PDF가 다운로드되었습니다.');
		}catch(_err){
			toast('PDF 저장 중 오류가 발생했습니다.');
		}finally{
			requestAnimationFrame(()=> holder.remove());
		}
	}

	// PDF 만들기: 프린트 친화 창을 띄우고 자동 인쇄(사용자는 "PDF로 저장")
	function openPdf(){
		const src = document.getElementById('report');
		if(!src){ toast('PDF를 생성할 수 없습니다.'); return; }
		const clone = (function makeReadOnlyClone(root){
			const c = root.cloneNode(true);
			// ── cloneNode 값 동기화 ──
			const srcEls = root.querySelectorAll('input, textarea, select');
			const clnEls = c.querySelectorAll('input, textarea, select');
			srcEls.forEach((s,i)=>{
				const d=clnEls[i]; if(!d) return;
				const t=s.tagName, tp=(s.getAttribute('type')||'').toLowerCase();
				if(t==='SELECT'){ d.value=s.value; if(s.selectedIndex>=0&&d.options[s.selectedIndex]) d.selectedIndex=s.selectedIndex; }
				else if(t==='TEXTAREA'){ d.value=s.value; d.textContent=s.value; }
				else if(tp==='checkbox'||tp==='radio'){ d.checked=s.checked; }
				else { d.value=s.value; if(s.value) d.setAttribute('value',s.value); }
			});
			const tb = c.querySelector('.report-toolbar'); if(tb) tb.remove();
			c.querySelectorAll('[contenteditable]').forEach(el=> el.removeAttribute('contenteditable'));
			c.querySelectorAll('.input-with-action').forEach(div=>{
				const input = div.querySelector('input.meta-input');
				const val = input ? (input.value || '') : '';
				const span = document.createElement('span'); span.className='preview-value'; span.textContent = val;
				div.replaceWith(span);
			});
			c.querySelectorAll('input, textarea, select').forEach(el=>{
				const type = (el.getAttribute('type')||'').toLowerCase();
				if(type==='hidden'){ el.remove(); return; }
				if(el.tagName==='SELECT' || type==='checkbox' || type==='radio'){
					el.setAttribute('disabled','true');
					return;
				}
				if(type==='file'){ el.remove(); return; }
				el.setAttribute('readonly','true');
				el.setAttribute('aria-readonly','true');
				el.setAttribute('tabindex','-1');
			});
			const dz = c.querySelector('#attachments-dropzone'); if(dz) dz.remove();
			const ai = c.querySelector('#attachments-input'); if(ai) ai.remove();
			c.querySelectorAll('.attach-actions').forEach(a=> a.remove());
			// 첨부파일이 없으면 섹션 전체 숨김
			const attSec = c.querySelector('#attachments-section');
			const attList = c.querySelector('#attachments-list');
			if(attSec && (!attList || attList.children.length === 0)) attSec.remove();
			return c;
		})(src);

		const html = `<!DOCTYPE html>
		<html lang="ko">
		<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>PDF - 작업보고서</title>
		<link rel="stylesheet" href="/static/css/blossom.css?v=1.0.2">
		<link rel="stylesheet" href="/static/css/task.css?v=1.3.7">
		<style>body{ background:#fff; margin:0; padding:18px; display:flex; justify-content:center; }</style>
		</head>
		<body class="report-only">${clone.outerHTML}
		<script>
			window.addEventListener('load', function(){
				setTimeout(function(){
					try{ window.focus(); }catch(e){}
					try{ window.print(); }catch(e){}
				}, 300);
			});
			window.addEventListener('afterprint', function(){
				try{ window.close(); }catch(e){}
			});
		<\/script>
		</body></html>`;
		const w = window.open('', '_blank');
		if(!w){ toast('팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.'); return; }
		w.document.open();
		w.document.write(html);
		w.document.close();
	}
})();

