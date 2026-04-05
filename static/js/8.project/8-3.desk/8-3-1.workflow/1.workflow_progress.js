/**
 * 1.workflow_progress.js (simplified for 2x2 status boxes)
 * - 4 statuses: PENDING(접수대기), ACCEPTED(접수), INPROGRESS(처리중), DONE(완료)
 * - LocalStorage persistence
 * - Simple add modal, counts, and listing per box
 */
(function(){
    console.log('[workflow v4.7] loaded, profile-id attr=', document.querySelector('main[data-profile-id]')?.getAttribute('data-profile-id'));
    const API_BASE = '/api/tickets';
    const columns = ['PENDING','ACCEPTED','INPROGRESS','DONE'];
    const labels = { PENDING:'접수대기', ACCEPTED:'접수', INPROGRESS:'처리중', DONE:'완료' };
    let tickets = [];
    let _ticketsLoaded = false;
    let _myProfileIdCached = 0;   // API 응답에서 받은 fallback

    /* ── 현재 로그인 사용자 profile id ── */
    function _myProfileId(){
        if(_myProfileIdCached) return _myProfileIdCached;
        var el = document.querySelector('main[data-profile-id]');
        var v = el ? el.getAttribute('data-profile-id') : '';
        if(v){ _myProfileIdCached = parseInt(v, 10) || 0; }
        return _myProfileIdCached;
    }
    /** 해당 티켓의 담당자(assignee)인지 판별.
     *  사용자 ID를 알 수 없으면 true 반환(fail-open, 기존 동작 유지) */
    function isAssigneeOf(ticket){
        var myId = _myProfileId();
        if(!myId) return true;   // 사용자 식별 불가 → 모두 허용 (fail-open)
        // 1) assignee_json에서 추출한 user_id 배열 확인
        if(Array.isArray(ticket._assignee_user_ids) && ticket._assignee_user_ids.indexOf(myId) !== -1) return true;
        // 2) 단일 assignee_user_id 필드 확인 (assignee_json이 없는 과거 티켓 대응)
        if(ticket.assignee_user_id && ticket.assignee_user_id === myId) return true;
        return false;
    }
    /** 해당 티켓의 작성자(요청자)인지 판별 */
    function isRequesterOf(ticket){
        var myId = _myProfileId();
        if(!myId) return false;
        return ticket.requester_user_id && ticket.requester_user_id === myId;
    }
    // Guard to prevent double submission when both direct and delegated listeners fire
    let isSubmittingAdd = false;

    /* ── Alert modal helper (IIFE scope so submitAdd can access) ── */
    function wfAlert(msg, title){
        var modal = document.getElementById('system-message-modal'); if(!modal){ alert(msg); return; }
        var msgEl = document.getElementById('message-content'); if(msgEl) msgEl.textContent = msg;
        var titleEl = document.getElementById('message-title'); if(titleEl) titleEl.textContent = title || '알림';
        document.body.classList.add('modal-open');
        modal.classList.add('show'); modal.setAttribute('aria-hidden','false');
    }

    /* ── org_user 검색 소스 등록 (요청자/담당자 드롭다운) ── */
    window.BlossomSearchableSelectSources = window.BlossomSearchableSelectSources || {};
    if (typeof window.BlossomSearchableSelectSources.wf_org_user !== 'function') {
        window.BlossomSearchableSelectSources.wf_org_user = function(ctx){
            var q = String((ctx && ctx.query) || '').trim();
            var url = '/api/user-profiles?limit=50' + (q ? '&q=' + encodeURIComponent(q) : '');
            return fetch(url, { headers:{ Accept:'application/json' } })
                .then(function(r){ return r.json(); })
                .then(function(json){
                    if (!json || json.success === false) return [];
                    var items = Array.isArray(json.items) ? json.items : [];
                    return items.map(function(it){
                        var name = (it.name || '').trim();
                        if (!name) return null;
                        var dept = (it.department || '').trim();
                        var display = dept ? name + ' (' + dept + ')' : name;
                        return {
                            value: name,
                            label: display,
                            displayLabel: display,
                            searchText: dept ? (name + ' ' + dept) : name
                        };
                    }).filter(Boolean);
                })
                .catch(function(){ return []; });
        };
    }

    /* ── 유형 → 분류 종속 매핑 ── */
    const KIND_TASK_MAP = {
        '장애': ['기능 오류','성능 문제','연동 오류','데이터 오류','인프라 장애'],
        '요청': ['계정','권한','데이터','설정','접근','기타 요청'],
        '변경': ['배포','설정 변경','정책 변경','인프라 변경','패치 적용'],
        '유지보수': ['계약 신청','계약 변경','계약 해지','기술지원 요청'],
        '감사': ['외부 감사','내부 감사','규제 점검'],
        '문제': ['원인 분석','재발 방지','구조 개선'],
        '작업': ['데이터 작업','시스템 작업','테스트 지원','문서 작업'],
        '점검': ['정기 점검','수시 점검','보안 점검','백업 점검','규제 점검','내부 점검']
    };

    /* ── 대상 다중 선택 (업무명 + 시스템명) ── */
    const wfTargetState = { selected: [], debounce: null };
    function initTargetPicker(){
        const input  = document.getElementById('wf-target-input');
        const dd     = document.getElementById('wf-target-dropdown');
        const chipBox = document.getElementById('wf-target-tags');
        const hidden = document.getElementById('wf-target-hidden');
        if(!input || !dd || !chipBox || !hidden) return;

        function syncHidden(){ hidden.value = JSON.stringify(wfTargetState.selected); }
        function fmtLabel(item){
            if(typeof item === 'string') return item;
            return item.system_name ? item.work_name + ' (' + item.system_name + ')' : item.work_name;
        }
        function itemKey(item){
            if(typeof item === 'string') return item;
            return item.work_name + '||' + (item.system_name || '');
        }
        function renderChips(){
            chipBox.innerHTML = '';
            if(!wfTargetState.selected.length){
                var empty = document.createElement('span'); empty.className='wf-sc-empty'; empty.textContent='선택된 대상 없음';
                chipBox.appendChild(empty); syncHidden(); return;
            }
            wfTargetState.selected.forEach(function(v){
                var chip = document.createElement('span'); chip.className = 'wf-sc-chip target-chip';
                chip.textContent = fmtLabel(v);
                var rm = document.createElement('button'); rm.type='button'; rm.className='wf-sc-chip-rm'; rm.innerHTML='&times;'; rm.title='제거';
                rm.onclick = function(e){ e.preventDefault(); e.stopPropagation(); var k=itemKey(v); wfTargetState.selected = wfTargetState.selected.filter(function(x){ return itemKey(x)!==k; }); renderChips(); };
                chip.appendChild(rm);
                chipBox.appendChild(chip);
            });
            syncHidden();
        }
        function showDropdown(items){
            dd.innerHTML = '';
            if(!items.length){ dd.hidden=true; return; }
            var selectedKeys = wfTargetState.selected.map(itemKey);
            items.forEach(function(pair){
                var key = itemKey(pair);
                if(selectedKeys.indexOf(key) !== -1) return;
                var label = fmtLabel(pair);
                var opt = document.createElement('div'); opt.className='wf-dd-option'; opt.textContent=label;
                opt.onmousedown = function(e){ e.preventDefault(); wfTargetState.selected.push(pair); renderChips(); input.value=''; dd.hidden=true; input.focus(); };
                dd.appendChild(opt);
            });
            dd.hidden = dd.children.length === 0;
        }
        function fetchWorkSystems(q){
            var url = '/api/hardware-assets/suggest-work-systems?limit=30' + (q ? '&q='+encodeURIComponent(q) : '');
            fetch(url, { headers:{ Accept:'application/json' }}).then(function(r){ return r.json(); }).then(function(json){
                if(json && json.success && Array.isArray(json.items)) showDropdown(json.items);
                else dd.hidden = true;
            }).catch(function(){ dd.hidden=true; });
        }
        input.addEventListener('input', function(){
            clearTimeout(wfTargetState.debounce);
            wfTargetState.debounce = setTimeout(function(){ fetchWorkSystems(input.value.trim()); }, 200);
        });
        input.addEventListener('focus', function(){ fetchWorkSystems(input.value.trim()); });
        input.addEventListener('blur', function(){ setTimeout(function(){ dd.hidden=true; }, 180); });
        renderChips();
    }
    function resetTargetPicker(){
        wfTargetState.selected = [];
        var chipBox = document.getElementById('wf-target-tags'); if(chipBox) chipBox.innerHTML='';
        var hidden = document.getElementById('wf-target-hidden'); if(hidden) hidden.value='';
        var input  = document.getElementById('wf-target-input'); if(input) input.value='';
    }

    /* ── 담당자 다중 선택 (org_user 검색) ── */
    const wfAssigneeState = { selected: [], debounce: null };
    function initAssigneePicker(){
        const input  = document.getElementById('wf-assignee-input');
        const dd     = document.getElementById('wf-assignee-dropdown');
        const chipBox = document.getElementById('wf-assignee-tags');
        const hidden = document.getElementById('wf-assignee-hidden');
        if(!input || !dd || !chipBox || !hidden) return;

        function syncHidden(){ hidden.value = wfAssigneeState.selected.map(function(o){ return o.value; }).join(','); }
        function renderChips(){
            chipBox.innerHTML = '';
            if(!wfAssigneeState.selected.length){
                var empty = document.createElement('span'); empty.className='wf-sc-empty'; empty.textContent='선택된 담당자 없음';
                chipBox.appendChild(empty); syncHidden(); return;
            }
            wfAssigneeState.selected.forEach(function(o){
                var chip = document.createElement('span'); chip.className = 'wf-sc-chip';
                chip.textContent = o.display;
                var rm = document.createElement('button'); rm.type='button'; rm.className='wf-sc-chip-rm'; rm.innerHTML='&times;'; rm.title='제거';
                rm.onclick = function(e){ e.preventDefault(); e.stopPropagation(); wfAssigneeState.selected = wfAssigneeState.selected.filter(function(x){ return x.value!==o.value; }); renderChips(); };
                chip.appendChild(rm);
                chipBox.appendChild(chip);
            });
            syncHidden();
        }
        function getRequesterName(){
            var avatarEl = document.querySelector('#btn-account .header-avatar-icon');
            return (avatarEl && avatarEl.alt && avatarEl.alt !== '계정') ? avatarEl.alt.trim() : '';
        }
        function showDropdown(items){
            dd.innerHTML = '';
            var requester = getRequesterName();
            var filtered = items.filter(function(it){ return !wfAssigneeState.selected.some(function(s){ return s.value===it.value; }) && it.value !== requester; });
            if(!filtered.length){ dd.hidden=true; return; }
            filtered.forEach(function(it){
                var opt = document.createElement('div'); opt.className='wf-dd-option'; opt.textContent=it.display;
                opt.onmousedown = function(e){ e.preventDefault(); wfAssigneeState.selected.push(it); renderChips(); input.value=''; dd.hidden=true; input.focus(); };
                dd.appendChild(opt);
            });
            dd.hidden = false;
        }
        function fetchUsers(q){
            var url = '/api/user-profiles?limit=50' + (q ? '&q='+encodeURIComponent(q) : '');
            fetch(url, { headers:{ Accept:'application/json' }}).then(function(r){ return r.json(); }).then(function(json){
                if(!json || json.success===false){ dd.hidden=true; return; }
                var items = Array.isArray(json.items) ? json.items : [];
                var mapped = items.map(function(it){
                    var name = (it.name||'').trim(); if(!name) return null;
                    var dept = (it.department||'').trim();
                    return { value: name, display: dept ? name+' ('+dept+')' : name };
                }).filter(Boolean);
                showDropdown(mapped);
            }).catch(function(){ dd.hidden=true; });
        }
        input.addEventListener('input', function(){
            clearTimeout(wfAssigneeState.debounce);
            wfAssigneeState.debounce = setTimeout(function(){ fetchUsers(input.value.trim()); }, 200);
        });
        input.addEventListener('focus', function(){ fetchUsers(input.value.trim()); });
        input.addEventListener('blur', function(){ setTimeout(function(){ dd.hidden=true; }, 180); });
        renderChips();
    }
    function resetAssigneePicker(){
        wfAssigneeState.selected = [];
        var chipBox = document.getElementById('wf-assignee-tags'); if(chipBox) chipBox.innerHTML='';
        var hidden = document.getElementById('wf-assignee-hidden'); if(hidden) hidden.value='';
        var input  = document.getElementById('wf-assignee-input'); if(input) input.value='';
    }

    function syncTaskOptions(kindValue){
        const taskSel = document.getElementById('wf-task');
        if(!taskSel) return;
        // Clear existing options
        taskSel.innerHTML = '';
        const blank = document.createElement('option');
        blank.value = ''; blank.textContent = '선택';
        taskSel.appendChild(blank);
        const subs = KIND_TASK_MAP[kindValue] || [];
        subs.forEach(function(s){
            const o = document.createElement('option');
            o.value = s; o.textContent = s;
            taskSel.appendChild(o);
        });
        // Re-sync the searchable UI
        if(window.BlossomSearchableSelect && window.BlossomSearchableSelect.enhance){
            window.BlossomSearchableSelect.enhance(taskSel);
        }
    }

    // Remove legacy sample data (one-time cleanup)
    if (Array.isArray(tickets) && tickets.length){
        const before = tickets.length;
        tickets = tickets.filter(t => t.title !== '샘플 티켓');
        if (tickets.length !== before) persist();
    }

    // DOM helpers (query fresh to avoid order-of-script issues)
    function getAddModal(){ return document.getElementById('wf-add-modal'); }
    function getAddForm(){ return document.getElementById('wf-add-form'); }

    function openAdd(){
        const modal = getAddModal();
        if (!modal) return;
        document.body.classList.add('modal-open');
        modal.classList.add('show');
        modal.setAttribute('aria-hidden','false');
    }
    function closeAdd(){
        const modal = getAddModal();
        if (!modal) return;
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden','true');
        document.body.classList.remove('modal-open');
    }

    /* ── Flatpickr lazy-loader (local vendor, 작업현황 동일) ── */
    const FP_VER   = '4.6.13';
    const FP_BASE  = `/static/vendor/flatpickr/${FP_VER}`;
    const FP_CSS   = `${FP_BASE}/flatpickr.min.css`;
    const FP_THEME = `${FP_BASE}/themes/airbnb.css`;
    const FP_JS    = `${FP_BASE}/flatpickr.min.js`;
    const FP_KO    = `${FP_BASE}/l10n/ko.js`;
    let __fpPromise = null;

    function ensureCss(href, id){
        try{
            const existing = document.getElementById(id);
            if(existing && existing.tagName.toLowerCase()==='link'){
                if(existing.getAttribute('href')!==href) existing.setAttribute('href',href);
                return;
            }
            const l = document.createElement('link'); l.rel='stylesheet'; l.href=href;
            if(id) l.id = id; document.head.appendChild(l);
        }catch(_){}
    }
    function loadScript(src){
        return new Promise((res,rej)=>{
            try{ const s=document.createElement('script'); s.src=src; s.async=true;
                s.onload=()=>res(true); s.onerror=()=>rej(new Error('FAILED '+src));
                document.head.appendChild(s); }catch(e){ rej(e); }
        });
    }
    async function ensureFlatpickrAssets(){
        ensureCss(FP_CSS, 'flatpickr-css');
        ensureCss(FP_THEME, 'flatpickr-theme-css');
        if(window.flatpickr) return;
        if(__fpPromise) return __fpPromise;
        __fpPromise = loadScript(FP_JS)
            .then(()=> loadScript(FP_KO).catch(()=>null))
            .catch(e=>{ __fpPromise=null; throw e; });
        return __fpPromise;
    }
    function ensureTodayButton(fp){
        try{
            const cal = fp && fp.calendarContainer; if(!cal) return;
            if(cal.querySelector('.fp-today-btn')) return;
            const btn = document.createElement('button'); btn.type='button';
            btn.className='fp-today-btn'; btn.textContent='오늘';
            btn.addEventListener('click',()=>{ fp.setDate(new Date(),true); });
            cal.appendChild(btn);
        }catch(_){}
    }

    async function initDueFlatpickr(){
        const el = document.querySelector('#wf-add-form input[name="due"].date-input');
        if(!el) return;
        try{ await ensureFlatpickrAssets(); }catch(_){ return; }
        if(!window.flatpickr) return;
        if(el._flatpickr) return;
        const koLocale = (window.flatpickr.l10ns && window.flatpickr.l10ns.ko)
                           ? window.flatpickr.l10ns.ko : 'ko';
        window.flatpickr(el, {
            enableTime: true,
            time_24hr: true,
            dateFormat: 'Y-m-d H:i',
            allowInput: true,
            disableMobile: true,
            clickOpens: true,
            appendTo: document.body,
            locale: koLocale,
            onReady:  (_s, _d, inst)=> ensureTodayButton(inst),
            onOpen:   (_s, _d, inst)=> ensureTodayButton(inst)
        });
    }

    function parseDueInput(raw){
        const txt = (raw||'').trim();
        if(!txt) return '';
        // Accept both date only and datetime; try to normalize to 'YYYY-MM-DD HH:MM'
        // Native datetime-local typically outputs 'YYYY-MM-DDTHH:MM'; keep fallback parsing.
        // If there's time part missing, default to 00:00
        const m = txt.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?/);
        if(!m) return txt; // leave as-is
        const [_,y,mo,d,h='00',mi='00'] = m;
        const pad = v=> v.toString().padStart(2,'0');
        return `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}`;
    }
    async function submitAdd(){
        if (isSubmittingAdd) return;
        isSubmittingAdd = true;
        try {
            const form = getAddForm();
            if (!form) return;
            const titleInput = form.querySelector('input[name="title"]');
            let titleVal = titleInput ? titleInput.value : '';
            if (!titleVal){
                const fdPre = new FormData(form);
                titleVal = (fdPre.get('title')||'').toString();
            }
            const fd = new FormData(form);
            const title = (titleVal||'').toString().trim();
            if (!title){ wfAlert('제목을 입력하세요.'); return; }
            const assigneeNames = wfAssigneeState.selected.map(function(o){ return o.value; });
            const dueRaw = (fd.get('due')||'').toString().trim();
            if (!assigneeNames.length){ wfAlert('담당자를 선택하세요.'); return; }
            var _reqUser = (function(){ var av=document.querySelector('#btn-account .header-avatar-icon'); return (av&&av.alt&&av.alt!=='계정')?av.alt.trim():''; })();
            if(_reqUser && assigneeNames.some(function(n){ return n===_reqUser; })){ wfAlert('요청자는 담당자에 포함될 수 없습니다.'); return; }
            if (!dueRaw){ wfAlert('기한을 입력하세요.'); return; }
            // Build FormData for API
            const apiForm = new FormData();
            apiForm.set('title', title);
            apiForm.set('kind', (fd.get('kind')||'').toString());
            apiForm.set('task', (fd.get('task')||'').toString());
            apiForm.set('priority', (fd.get('priority')||'').toString());
            apiForm.set('due', parseDueInput(dueRaw));
            apiForm.set('detail', (fd.get('detail')||'').toString().trim());
            apiForm.set('status', 'PENDING');
            apiForm.set('assignee_json', JSON.stringify(wfAssigneeState.selected));
            apiForm.set('target', JSON.stringify(wfTargetState.selected));
            var fileInput = form.querySelector('#wf-attachments');
            if(fileInput && fileInput.files){
                for(var fi=0; fi<fileInput.files.length; fi++) apiForm.append('attachments', fileInput.files[fi]);
            }
            var resp = await fetch(API_BASE, {method:'POST', body:apiForm});
            var json = await resp.json();
            if(json.success && json.item){
                tickets.push(mapFromAPI(json.item));
                form.reset(); resetTargetPicker(); resetAssigneePicker(); closeAdd(); renderAll();
            } else {
                wfAlert(json.message || '티켓 생성에 실패했습니다.');
            }
        } catch(e){
            console.error('submitAdd error:', e);
            wfAlert('서버 오류가 발생했습니다.');
        } finally {
            setTimeout(()=> { isSubmittingAdd = false; }, 0);
        }
    }

    // Helpers
    function mkTicket({ title, desc='', assignee=[], requester='', priority='', kind='하드웨어', task='설치', due='' }){
        const now = new Date().toISOString();
        return { id:'T'+Math.random().toString(36).slice(2,9).toUpperCase(), title, assignee: Array.isArray(assignee)?assignee:[], kind, task, requester, priority, status:'PENDING', target:[], due, detail:desc, attachments:[], created_at:now, updated_at:now };
    }
    /* ── API-backed data layer ── */
    function mapFromAPI(item){
        var al = [];
        try { al = item.assignee_list || (item.assignee_json_raw ? JSON.parse(item.assignee_json_raw) : []); } catch(_){}
        var tl = [];
        try {
            if(Array.isArray(item.target_list)) tl = item.target_list;
            else if(item.target_object && String(item.target_object).charAt(0)==='[') tl = JSON.parse(item.target_object);
            else if(item.target_object) tl = [item.target_object];
        } catch(_){}
        return {
            id: item.id,
            title: item.title || '',
            kind: item.ticket_type || '',
            task: item.category || '',
            priority: item.priority || '',
            requester: item.requester_name || '',
            requester_user_id: item.requester_user_id || null,
            assignee_user_id: item.assignee_user_id || null,
            assignee: al.map(function(a){ return { value: a.name||'', display: a.display || (a.dept ? a.name+' ('+a.dept+')' : a.name) || '' }; }),
            _assignee_user_ids: (function(){
                var ids = al.map(function(a){ return a.user_id; }).filter(function(v){ return typeof v === 'number' && v > 0; });
                // fallback: 단일 assignee_user_id가 있으면 포함
                var singleId = item.assignee_user_id;
                if(typeof singleId === 'number' && singleId > 0 && ids.indexOf(singleId) === -1) ids.push(singleId);
                return ids;
            })(),
            status: item.status || 'PENDING',
            target: tl,
            due: item.due_at || '',
            detail: item.detail || '',
            attachments: (item.files||[]).map(function(f){ return { id:f.id, name:f.original_name||'', size:f.file_size||0, type:f.content_type||'', ticket_id:f.ticket_id }; }),
            created_at: item.created_at || '',
            updated_at: item.updated_at || '',
            done_at: item.closed_at || null,
            cleared: item.cleared ? true : false
        };
    }
    async function fetchTickets(){
        try {
            var resp = await fetch(API_BASE + '?scope=my&cleared=false', {headers:{Accept:'application/json'}});
            var json = await resp.json();
            if(json.success && Array.isArray(json.items)) tickets = json.items.map(mapFromAPI);
            // API가 돌려준 my_profile_id로 fallback 확보
            if(json.my_profile_id && !_myProfileIdCached) _myProfileIdCached = json.my_profile_id;
        } catch(e){ console.error('fetchTickets error:', e); }
        _ticketsLoaded = true;
    }
    function apiUpdate(id, data){
        return fetch(API_BASE + '/' + id, {method:'PUT', headers:{'Content-Type':'application/json',Accept:'application/json'}, body:JSON.stringify(data)}).then(function(r){return r.json();}).catch(function(){return {success:false};});
    }
    function apiDelete(id){
        return fetch(API_BASE + '/' + id, {method:'DELETE', headers:{Accept:'application/json'}}).catch(function(){return {success:false};});
    }
    function updateTicket(id, patch){
        var t = tickets.find(function(x){return String(x.id)===String(id);}); if(!t) return;
        if(patch.status === 'DONE' && t.status !== 'DONE') patch.done_at = new Date().toISOString();
        if(patch.status && patch.status !== 'DONE') patch.done_at = null;
        Object.assign(t, patch, { updated_at:new Date().toISOString() });
        // Async sync to server
        var apiData = {};
        if(patch.status !== undefined) apiData.status = patch.status;
        if(patch.title !== undefined) apiData.title = patch.title;
        if(patch.kind !== undefined) apiData.ticket_type = patch.kind;
        if(patch.task !== undefined) apiData.category = patch.task;
        if(patch.priority !== undefined) apiData.priority = patch.priority;
        if(patch.due !== undefined) apiData.due_at = patch.due;
        if(patch.detail !== undefined) apiData.detail = patch.detail;
        if(patch.assignee !== undefined) apiData.assignee_json = JSON.stringify(patch.assignee);
        if(patch.target !== undefined) apiData.target_object = JSON.stringify(patch.target);
        apiUpdate(id, apiData);
    }
    function removeTicket(id){ tickets=tickets.filter(function(t){return String(t.id)!==String(id);}); apiDelete(id); }

    function formatBytes(size){
        const n = Number(size);
        if (!Number.isFinite(n) || n < 0) return '';
        const units = ['B','KB','MB','GB','TB'];
        let v = n; let i = 0;
        while (v >= 1024 && i < units.length - 1){ v /= 1024; i++; }
        const digits = (v < 10 && i > 0) ? 1 : 0;
        return `${v.toFixed(digits)} ${units[i]}`;
    }

    function initAddAttachmentsUI(){
        const form = getAddForm();
        if (!form) return;
        const input = form.querySelector('#wf-attachments');
        const drop = document.getElementById('wf-attachment-drop');
        const list = document.getElementById('wf-attachment-list');
        const clearBtn = document.getElementById('wf-attachment-clear');
        if (!input || !drop || !list || !clearBtn) return;

        const MAX_FILES = 10;

        function setFiles(nextFiles){
            const dt = new DataTransfer();
            (nextFiles || []).slice(0, MAX_FILES).forEach(f => dt.items.add(f));
            input.files = dt.files;
        }

        function render(){
            const files = [...(input.files || [])];
            list.innerHTML = '';
            if (!files.length){
                list.hidden = true;
                clearBtn.hidden = true;
                return;
            }
            list.hidden = false;
            clearBtn.hidden = false;
            files.forEach((f, idx) => {
                const li = document.createElement('li');
                li.className = 'attachment-item';
                const name = document.createElement('span');
                name.className = 'attachment-name';
                name.textContent = f.name || '파일';
                const size = document.createElement('span');
                size.className = 'attachment-size';
                size.textContent = formatBytes(f.size);
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'attachment-remove';
                remove.setAttribute('data-idx', String(idx));
                remove.setAttribute('aria-label', '첨부파일 제거');
                remove.title = '제거';
                remove.textContent = '×';
                li.appendChild(name);
                li.appendChild(size);
                li.appendChild(remove);
                list.appendChild(li);
            });
        }

        input.addEventListener('change', render);

        clearBtn.addEventListener('click', () => {
            input.value = '';
            render();
        });

        list.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('.attachment-remove') : null;
            if (!btn) return;
            const idx = parseInt(btn.getAttribute('data-idx') || '', 10);
            const files = [...(input.files || [])];
            if (!Number.isFinite(idx) || idx < 0 || idx >= files.length) return;
            files.splice(idx, 1);
            setFiles(files);
            render();
        });

        function stop(e){ e.preventDefault(); e.stopPropagation(); }
        ['dragenter','dragover'].forEach(ev => {
            drop.addEventListener(ev, (e) => { stop(e); drop.classList.add('is-dragover'); });
        });
        ['dragleave','dragend','drop'].forEach(ev => {
            drop.addEventListener(ev, (e) => { stop(e); drop.classList.remove('is-dragover'); });
        });
        drop.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            if (!dt || !dt.files || !dt.files.length) return;
            const existing = [...(input.files || [])];
            const incoming = [...dt.files];
            const merged = [...existing, ...incoming].slice(0, MAX_FILES);
            setFiles(merged);
            render();
        });

        render();
    }

    // Render
    function renderAll(){
        // Clear
        columns.forEach(st=> { const el=document.getElementById('wf-col-'+st); if (el) el.innerHTML=''; });
        // Count (skip cleared DONE tickets)
        const count = Object.fromEntries(columns.map(c=>[c,0]));
        tickets.forEach(t=> { if(t.cleared) return; if (count[t.status] !== undefined) count[t.status]++; });
        columns.forEach(st=> { const cEl = document.querySelector(`[data-wf-count-for="${st}"]`); if (cEl) cEl.textContent = count[st]||0; });
        // Update the summary bar
        columns.forEach(st=> {
            const sEl = document.querySelector(`[data-wf-summary="${st}"]`);
            if (sEl){
                const prev = parseInt(sEl.textContent||'0',10);
                sEl.textContent = count[st]||0;
                if (prev !== (count[st]||0)){
                    sEl.classList.add('is-updating');
                    setTimeout(()=> sEl.classList.remove('is-updating'), 600);
                }
            }
        });
        // Total counter (exclude cleared)
        const total = tickets.filter(t => !t.cleared).length;
        const totalEl = document.getElementById('wf-count');
        if (totalEl){
            totalEl.textContent = total;
            totalEl.classList.remove('large-number','very-large-number');
            if (total >= 100) totalEl.classList.add('large-number');
            if (total >= 1000) totalEl.classList.add('very-large-number');
            totalEl.classList.add('is-updating');
            setTimeout(()=> totalEl.classList.remove('is-updating'), 900);
        }
        // Hide empty-state for this page
        const emptyEl = document.getElementById('system-empty');
        if (emptyEl) emptyEl.hidden = true;
        // Cards (skip cleared DONE tickets)
        tickets.forEach(t=> {
            if(t.cleared) return;
            const host = document.getElementById('wf-col-'+t.status); if (!host) return;
            host.appendChild(renderTicket(t));
        });
        bindWfDnD();
    }

    function renderTicket(t){
        const el = document.createElement('div');
        // 역할 클래스: 받은 티켓 vs 요청한 티켓 시각 구분
        var amAssignee = isAssigneeOf(t);
        var amRequester = isRequesterOf(t);
        var roleClass = amAssignee ? ' wf-role-assignee' : (amRequester ? ' wf-role-requester' : '');
    el.className = 'wf-item status-' + (t.status||'').toLowerCase() + roleClass;
        // 작성자(요청자)이면서 담당자가 아닌 경우에만 드래그 불가
        var canMove = amAssignee;
        el.setAttribute('draggable', canMove ? 'true' : 'false');
        if(!canMove) el.style.cursor = 'default';
        el.setAttribute('data-id', t.id);
        el.setAttribute('tabindex','0');
        el.setAttribute('role','listitem');
        // Head: title + task badge (이미지의 "인프라" 위치에 업무/변경 보여주기)
        const head = document.createElement('div'); head.className='wf-item-head';
        const title = document.createElement('div'); title.className='wf-item-title'; title.textContent = t.title;
        const headRight = document.createElement('div'); headRight.className='wf-item-head-right';
    if (t.task) headRight.appendChild(badge(null, t.task, 'task'));
        head.appendChild(title);
        head.appendChild(headRight);

        // Chips: 요청, 우선, (기한을 우선 오른쪽에 배치)
        const chips = document.createElement('div'); chips.className='wf-chips';
        if (t.requester) chips.appendChild(chip('요청', t.requester, 'requester'));
        if (t.priority) chips.appendChild(chip('우선', t.priority, 'pri-'+t.priority));
        const dueText = (t.due || '').trim();
        if (dueText){
            // Plain due text (no bold label, no toggle look)
            const dueChip = document.createElement('span');
            dueChip.className = 'wf-chip due';
            dueChip.textContent = `기한 ${dueText}`;
            // Overdue / soon classification
            try{
                // Parse 'YYYY-MM-DD HH:MM'
                const m = dueText.match(/(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/);
                if(m){
                    const [,y,mo,d,h='00',mi='00'] = m;
                    const dueDate = new Date(parseInt(y), parseInt(mo)-1, parseInt(d), parseInt(h), parseInt(mi));
                    const now = new Date();
                    const diffMs = dueDate - now;
                    const diffDays = diffMs / (1000*60*60*24);
                    if (diffDays < 0) dueChip.classList.add('overdue');
                    else if (diffDays <= 3) dueChip.classList.add('due-soon');
                }
            }catch(_e){}
            chips.appendChild(dueChip);
        }

        el.appendChild(head);
        if (chips.childElementCount) el.appendChild(chips);

        // Static ticket icon (bottom-right)
        const anim = document.createElement('div');
        anim.className = 'wf-ticket-anim';
        const img = document.createElement('img');
        img.className = 'wf-ticket-icon';
        img.alt = '';
        img.src = '/static/image/svg/project/free-icon-ticket.svg';
        anim.appendChild(img);
        el.appendChild(anim);
        return el;
    }
    function badge(label, value, extraClass=''){ const b=document.createElement('span'); b.className='wf-badge'+(extraClass? ' '+extraClass:''); b.textContent = label? `${label}:${value}` : String(value); return b; }
    function chip(label, value, extraClass=''){ const c=document.createElement('span'); c.className='wf-chip'+(extraClass? ' '+extraClass:''); c.innerHTML = `<strong>${label}</strong>&nbsp;${String(value)}`; return c; }
    // Drag & Drop binding
    function bindWfDnD(){
        // Cards
        document.querySelectorAll('.wf-item[draggable="true"]').forEach(card=>{
            card.addEventListener('dragstart', e=>{
                const id = card.getAttribute('data-id');
                try { e.dataTransfer.setData('text/plain', id); } catch(_e){}
                e.dataTransfer.effectAllowed = 'move';
                card.classList.add('dragging');
            });
            card.addEventListener('dragend', ()=>{ card.classList.remove('dragging'); });
        });
        // Columns
        document.querySelectorAll('.wf-box-body').forEach(col=>{
            col.addEventListener('dragover', e=>{ e.preventDefault(); col.classList.add('is-dragover'); if(e.dataTransfer) e.dataTransfer.dropEffect='move'; });
            col.addEventListener('dragleave', ()=> col.classList.remove('is-dragover'));
            col.addEventListener('drop', e=>{
                e.preventDefault(); col.classList.remove('is-dragover');
                const id = e.dataTransfer ? e.dataTransfer.getData('text/plain') : null; if(!id) return;
                const accept = col.getAttribute('data-accept'); if(!accept || !columns.includes(accept)) return;
                // 담당자만 칸 이동 가능
                var ticket = tickets.find(function(x){ return String(x.id)===String(id); });
                if(ticket && !isAssigneeOf(ticket)){ wfAlert('담당자만 티켓 상태를 변경할 수 있습니다.','권한 없음'); return; }
                // Update status; keep array order (append by re-render)
                updateTicket(id, { status: accept });
                renderAll();
            });
        });
    }

    // Utils
    // none needed beyond above for now

    renderAll();
    // Initial load from API
    (async function(){ await fetchTickets(); renderAll(); })();
    // Defensive: re-bind in case initial binding failed (e.g., script loaded before element)
    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('wf-add-open');
        if (btn && !btn.dataset.wfBound){ btn.addEventListener('click', openAdd); btn.dataset.wfBound = '1'; }
        const closeBtn = document.getElementById('wf-add-close');
        if (closeBtn && !closeBtn.dataset.wfBound){ closeBtn.addEventListener('click', closeAdd); closeBtn.dataset.wfBound = '1'; }
        const saveBtn = document.getElementById('wf-add-save');
        if (saveBtn && !saveBtn.dataset.wfBound){ saveBtn.addEventListener('click', submitAdd); saveBtn.dataset.wfBound = '1'; }

        initAddAttachmentsUI();

        // ── 유형 → 분류 종속 ──
        const kindSel = document.getElementById('wf-kind');
        if(kindSel){
            kindSel.addEventListener('change', function(){ syncTaskOptions(this.value); });
        }

        // ── flatpickr date-time picker for 기한 field ──
        initDueFlatpickr();

        // ── 대상 multi-tag picker ──
        initTargetPicker();
        initAssigneePicker();

        // ── 삭제 모달 helpers ──
        function openDeleteModal(id){ const el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
        function closeDeleteModal(id){ const el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.server-add-modal.show, .server-edit-modal.show')) document.body.classList.remove('modal-open'); }

        // ── 알림 모달 (close helper) ──
        function closeAlertModal(){
            var modal = document.getElementById('system-message-modal'); if(!modal) return;
            modal.classList.remove('show'); modal.setAttribute('aria-hidden','true');
            if(!document.querySelector('.server-add-modal.show, .server-edit-modal.show')) document.body.classList.remove('modal-open');
        }
        (function(){
            var c1 = document.getElementById('system-message-close');
            var c2 = document.getElementById('system-message-ok');
            var m  = document.getElementById('system-message-modal');
            if(c1) c1.addEventListener('click', closeAlertModal);
            if(c2) c2.addEventListener('click', closeAlertModal);
            if(m) m.addEventListener('click', function(e){ if(e.target===m) closeAlertModal(); });
        })();

        // ── 완료 삭제 / 통계 버튼 ──
        const clearDoneBtn = document.getElementById('wf-done-clear');
        if(clearDoneBtn){
            clearDoneBtn.addEventListener('click', function(){
                const doneCount = tickets.filter(t => t.status === 'DONE' && !t.cleared).length;
                if(!doneCount){ wfAlert('비울 완료 티켓이 없습니다.'); return; }
                const subtitle = document.getElementById('wf-delete-subtitle');
                if(subtitle){ subtitle.textContent = '완료 티켓 ' + doneCount + '건을 모두 비우시겠습니까?'; }
                openDeleteModal('wf-delete-modal');
            });
        }
        document.getElementById('wf-delete-close')?.addEventListener('click', ()=> closeDeleteModal('wf-delete-modal'));
        document.getElementById('wf-delete-confirm')?.addEventListener('click', async ()=>{
            tickets.forEach(function(t){ if(t.status === 'DONE') t.cleared = true; });
            closeDeleteModal('wf-delete-modal');
            renderAll();
            try { await fetch(API_BASE + '/batch-clear', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status:'DONE'})}); } catch(_){}
        });


        // Context menu bindings
        const ctxMenu = document.getElementById('wf-context-menu');
        let ctxTargetId = null;
        function hideCtx(){ if(ctxMenu){ ctxMenu.style.display='none'; ctxMenu.setAttribute('aria-hidden','true'); ctxTargetId=null; } }
        function buildCtxActions(ticket){
            if(!ctxMenu) return;
            ctxMenu.innerHTML = '';
            var canMove = isAssigneeOf(ticket);
            // Determine primary action based on status
            const primaryMap = {
                PENDING: { label:'접수', action:'to-ACCEPTED' },
                ACCEPTED: { label:'처리', action:'to-INPROGRESS' },
                INPROGRESS: { label:'완료', action:'to-DONE' },
                DONE: { label:'목록삭제', action:'delete' }
            };
            const items = [];
            // 1) Always show detail
            items.push({ label:'상세보기', action:'detail' });
            // 2) 담당자(또는 사용자 식별 불가 시)만 상태 변경 가능
            if(canMove){
                const primary = primaryMap[ticket.status];
                if (primary) items.push(primary);
                // 3) PENDING일 때 반려 추가
                if (ticket.status === 'PENDING') items.push({ label:'반려', action:'reject' });
            }

            // Render buttons
            items.forEach(({label, action}) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'wf-context-item';
                btn.setAttribute('data-action', action);
                btn.textContent = label;
                ctxMenu.appendChild(btn);
            });
        }
        function showCtx(x,y,id){ if(!ctxMenu) return; ctxTargetId=id; const t = tickets.find(tt=>String(tt.id)===String(id)); if(!t) return; buildCtxActions(t); ctxMenu.style.display='flex'; ctxMenu.setAttribute('aria-hidden','false');
            // Position adjustments to avoid overflow
            const vw = window.innerWidth; const vh = window.innerHeight;
            const rect = ctxMenu.getBoundingClientRect();
            let left = x; let top = y;
            const w = rect.width || 140; const h = rect.height || 48;
            if (left + w > vw) left = vw - w - 8;
            if (top + h > vh) top = vh - h - 8;
            ctxMenu.style.left = left + 'px'; ctxMenu.style.top = top + 'px';
        }
        document.addEventListener('contextmenu', (e)=>{
            const card = e.target.closest && e.target.closest('.wf-item');
            if(card){
                e.preventDefault();
                const id = card.getAttribute('data-id');
                showCtx(e.clientX, e.clientY, id);
            } else {
                hideCtx();
            }
        });
        document.addEventListener('click', (e)=>{
            if(e.target.closest && e.target.closest('#wf-context-menu')) return; // allow button clicks
            hideCtx();
        });
        document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') hideCtx(); });
        window.addEventListener('scroll', hideCtx, { passive:true });

        if(ctxMenu){
            ctxMenu.addEventListener('click', (e)=>{
                const btn = e.target.closest('.wf-context-item'); if(!btn) return;
                const action = btn.getAttribute('data-action'); if(!action || !ctxTargetId) return;
                // 상태 변경 계열 액션은 담당자만 가능
                if(action.startsWith('to-') || action==='delete' || action==='reject'){
                    var ticket = tickets.find(function(x){ return String(x.id)===String(ctxTargetId); });
                    if(ticket && !isAssigneeOf(ticket)){ wfAlert('담당자만 티켓 상태를 변경할 수 있습니다.','권한 없음'); hideCtx(); return; }
                }
                if(action.startsWith('to-')){
                    const next = action.replace('to-','');
                    updateTicket(ctxTargetId, { status: next });
                    renderAll(); hideCtx();
                } else if(action==='delete'){
                    removeTicket(ctxTargetId); renderAll(); hideCtx();
                } else if(action==='reject'){
                    removeTicket(ctxTargetId); renderAll(); hideCtx();
                } else if(action==='detail'){
                    openDetail(ctxTargetId); hideCtx();
                }
            });
        }

        // ── Detail modal (read-only) ──
        const detailModal = document.getElementById('wf-detail-modal');
        const dClose1 = document.getElementById('wf-detail-close');
        const dClose2 = document.getElementById('wf-detail-close2');
        const editBtn = document.getElementById('wf-detail-edit-btn');
        let currentDetailId = null;

        function getCurrentUser(){
            const avatarEl = document.querySelector('#btn-account .header-avatar-icon');
            return (avatarEl && avatarEl.alt && avatarEl.alt !== '계정') ? avatarEl.alt.trim() : '';
        }

        function closeDetail(){
            if(!detailModal) return;
            detailModal.classList.remove('show');
            detailModal.setAttribute('aria-hidden','true');
            document.body.classList.remove('modal-open');
            currentDetailId = null;
        }

        function openDetail(id){
            const t = tickets.find(x=>String(x.id)===String(id)); if(!t || !detailModal) return;
            currentDetailId = id;

            // Check if current user is the requester (author)
            const currentUser = getCurrentUser();
            const isAuthor = currentUser && t.requester && currentUser === t.requester.trim();
            if(editBtn) editBtn.style.display = isAuthor ? '' : 'none';

            // Fill values
            function set(sel,val){ const el=document.getElementById(sel); if(el) el.textContent = val || '-'; }
            set('wf-d-title', t.title);
            set('wf-d-task', t.task);
            set('wf-d-requester', t.requester);
            // Priority with class for colored dot
            const priEl = document.getElementById('wf-d-priority');
            if (priEl){
                priEl.textContent = t.priority || '-';
                priEl.classList.remove('pri-긴급','pri-일반','pri-낮음');
                if (t.priority){ priEl.classList.add('pri-'+t.priority); }
            }
            // Assignee (multi-tag display)
            (function(){
                var el = document.getElementById('wf-d-assignee'); if(!el) return;
                el.innerHTML = '';
                var arr = Array.isArray(t.assignee) ? t.assignee : (typeof t.assignee === 'string' && t.assignee ? [{value:t.assignee, display:t.assignee}] : []);
                if(!arr.length){ el.textContent='-'; return; }
                arr.forEach(function(o){
                    var chip = document.createElement('span'); chip.className='wf-d-tag';
                    chip.textContent = typeof o === 'object' ? (o.display||o.value) : o;
                    el.appendChild(chip);
                });
            })();
            // 대상 (multi-tag display)
            (function(){
                var el = document.getElementById('wf-d-target'); if(!el) return;
                el.innerHTML = '';
                var arr = Array.isArray(t.target) ? t.target : (typeof t.target === 'string' && t.target ? t.target.split(',') : []);
                if(!arr.length){ el.textContent='-'; return; }
                arr.forEach(function(v){
                    var chip = document.createElement('span'); chip.className='wf-d-tag';
                    if(typeof v === 'object' && v.work_name){
                        chip.textContent = v.system_name ? v.work_name + ' (' + v.system_name + ')' : v.work_name;
                    } else {
                        chip.textContent = (typeof v === 'string' ? v : JSON.stringify(v)).trim();
                    }
                    el.appendChild(chip);
                });
            })();
            set('wf-d-status', labels[t.status] || t.status);
            set('wf-d-due', t.due);
            // Render detail with simple bullet styling
            (function(){
                const host = document.getElementById('wf-d-detail');
                if (!host){ set('wf-d-detail', t.detail); return; }
                const raw = (t.detail||'').toString();
                host.textContent = '';
                const lines = raw.split(/\r?\n/);
                if (!lines.length){ host.textContent = '-'; return; }
                lines.forEach(line => {
                    const div = document.createElement('div');
                    div.className = 'wf-line';
                    const trimmed = line.replace(/^\s+/, '');
                    let cls = '';
                    let content = trimmed;
                    if (/^\*/.test(trimmed)) { cls = 'marker-star'; content = trimmed.replace(/^\*\s?/, ''); }
                    else if (/^\-/.test(trimmed)) { cls = 'marker-dash'; content = trimmed.replace(/^\-\s?/, ''); }
                    else if (/^※/.test(trimmed)) { cls = 'marker-note'; content = trimmed.replace(/^※\s?/, ''); }
                    if (cls) div.classList.add(cls);
                    div.appendChild(document.createTextNode(content || '\u00A0'));
                    host.appendChild(div);
                });
            })();
            // Attachments
            const filesHost = document.getElementById('wf-d-files');
            const filesRow = document.getElementById('wf-d-files-row');
            if (filesHost && filesRow){
                filesHost.innerHTML = '';
                const files = Array.isArray(t.attachments) ? t.attachments : [];
                if (files.length){
                    filesRow.style.display = '';
                    const list = document.createElement('div');
                    list.className = 'wf-file-list';
                    const human = (size)=>{
                        if (typeof size !== 'number') return '';
                        const units = ['B','KB','MB','GB','TB'];
                        let s = size; let i = 0;
                        while (s >= 1024 && i < units.length-1){ s /= 1024; i++; }
                        return `${s.toFixed(s < 10 && i>0 ? 1 : 0)} ${units[i]}`;
                    };
                    files.forEach(f=>{
                        const chip = document.createElement('span');
                        chip.className = 'wf-file-chip';
                        const sizeTxt = f && typeof f.size === 'number' ? ` (${human(f.size)})` : '';
                        chip.textContent = `${(f && f.name) ? f.name : '파일'}${sizeTxt}`;
                        list.appendChild(chip);
                    });
                    filesHost.appendChild(list);
                } else {
                    filesRow.style.display = 'none';
                }
            }
            document.body.classList.add('modal-open');
            detailModal.classList.add('show');
            detailModal.setAttribute('aria-hidden','false');
        }

        if(dClose1) dClose1.addEventListener('click', closeDetail);
        if(dClose2) dClose2.addEventListener('click', closeDetail);
        document.addEventListener('click', (e)=>{ if(e.target===detailModal) closeDetail(); });

        // ── Edit modal (same style as add modal) ──
        const editModal = document.getElementById('wf-edit-modal');
        const editClose = document.getElementById('wf-edit-close');
        const editSaveBtn = document.getElementById('wf-edit-save');
        let editingTicketId = null;

        /* edit-modal assignee multi-picker state */
        const wfEditAssigneeState = { selected: [], debounce: null };
        function renderEditAssigneeChips(){
            var chipBox = document.getElementById('wf-edit-assignee-tags');
            var hidden = document.getElementById('wf-edit-assignee-hidden');
            if(!chipBox) return;
            chipBox.innerHTML = '';
            if(!wfEditAssigneeState.selected.length){
                var empty = document.createElement('span'); empty.className='wf-sc-empty'; empty.textContent='선택된 담당자 없음';
                chipBox.appendChild(empty);
                if(hidden) hidden.value = '';
                return;
            }
            wfEditAssigneeState.selected.forEach(function(o){
                var chip = document.createElement('span'); chip.className = 'wf-sc-chip';
                chip.textContent = o.display;
                var rm = document.createElement('button'); rm.type='button'; rm.className='wf-sc-chip-rm'; rm.innerHTML='&times;'; rm.title='제거';
                rm.onclick = function(e){ e.preventDefault(); e.stopPropagation(); wfEditAssigneeState.selected = wfEditAssigneeState.selected.filter(function(x){ return x.value!==o.value; }); renderEditAssigneeChips(); };
                chip.appendChild(rm);
                chipBox.appendChild(chip);
            });
            if(hidden) hidden.value = wfEditAssigneeState.selected.map(function(x){ return x.value; }).join(',');
        }
        function initEditAssigneePicker(){
            const input  = document.getElementById('wf-edit-assignee-input');
            const dd     = document.getElementById('wf-edit-assignee-dropdown');
            const chipBox = document.getElementById('wf-edit-assignee-tags');
            const hidden = document.getElementById('wf-edit-assignee-hidden');
            if(!input || !dd || !chipBox || !hidden) return;

            function syncHidden(){ hidden.value = wfEditAssigneeState.selected.map(function(o){ return o.value; }).join(','); }
            function renderChips(){
                chipBox.innerHTML = '';
                if(!wfEditAssigneeState.selected.length){
                    var empty = document.createElement('span'); empty.className='wf-sc-empty'; empty.textContent='선택된 담당자 없음';
                    chipBox.appendChild(empty); syncHidden(); return;
                }
                wfEditAssigneeState.selected.forEach(function(o){
                    var chip = document.createElement('span'); chip.className = 'wf-sc-chip';
                    chip.textContent = o.display;
                    var rm = document.createElement('button'); rm.type='button'; rm.className='wf-sc-chip-rm'; rm.innerHTML='&times;'; rm.title='제거';
                    rm.onclick = function(e){ e.preventDefault(); e.stopPropagation(); wfEditAssigneeState.selected = wfEditAssigneeState.selected.filter(function(x){ return x.value!==o.value; }); renderChips(); };
                    chip.appendChild(rm);
                    chipBox.appendChild(chip);
                });
                syncHidden();
            }
            function showDropdown(items){
                dd.innerHTML = '';
                // 요청자 제외: 편집 중인 티켓의 requester
                var reqName = '';
                if(editingTicketId){ var _t=tickets.find(function(x){return String(x.id)===String(editingTicketId);}); if(_t) reqName=(_t.requester||'').trim(); }
                var filtered = items.filter(function(it){ return !wfEditAssigneeState.selected.some(function(s){ return s.value===it.value; }) && it.value !== reqName; });
                if(!filtered.length){ dd.hidden=true; return; }
                filtered.forEach(function(it){
                    var opt = document.createElement('div'); opt.className='wf-dd-option'; opt.textContent=it.display;
                    opt.onmousedown = function(e){ e.preventDefault(); wfEditAssigneeState.selected.push(it); renderChips(); input.value=''; dd.hidden=true; input.focus(); };
                    dd.appendChild(opt);
                });
                dd.hidden = false;
            }
            function fetchUsers(q){
                var url = '/api/user-profiles?limit=50' + (q ? '&q='+encodeURIComponent(q) : '');
                fetch(url, { headers:{ Accept:'application/json' }}).then(function(r){ return r.json(); }).then(function(json){
                    if(!json || json.success===false){ dd.hidden=true; return; }
                    var items = Array.isArray(json.items) ? json.items : [];
                    var mapped = items.map(function(it){
                        var name = (it.name||'').trim(); if(!name) return null;
                        var dept = (it.department||'').trim();
                        return { value: name, display: dept ? name+' ('+dept+')' : name };
                    }).filter(Boolean);
                    showDropdown(mapped);
                }).catch(function(){ dd.hidden=true; });
            }
            input.addEventListener('input', function(){
                clearTimeout(wfEditAssigneeState.debounce);
                wfEditAssigneeState.debounce = setTimeout(function(){ fetchUsers(input.value.trim()); }, 200);
            });
            input.addEventListener('focus', function(){ fetchUsers(input.value.trim()); });
            input.addEventListener('blur', function(){ setTimeout(function(){ dd.hidden=true; }, 180); });
            renderChips();
        }

        /* edit-modal target multi-picker state */
        const wfEditTargetState = { selected: [], debounce: null };
        function renderEditTargetChips(){
            var chipBox = document.getElementById('wf-edit-target-tags');
            var hidden = document.getElementById('wf-edit-target-hidden');
            if(!chipBox) return;
            chipBox.innerHTML = '';
            if(!wfEditTargetState.selected.length){
                var empty = document.createElement('span'); empty.className='wf-sc-empty'; empty.textContent='선택된 대상 없음';
                chipBox.appendChild(empty);
                if(hidden) hidden.value = '';
                return;
            }
            wfEditTargetState.selected.forEach(function(v){
                var chip = document.createElement('span'); chip.className = 'wf-sc-chip target-chip';
                chip.textContent = v;
                var rm = document.createElement('button'); rm.type='button'; rm.className='wf-sc-chip-rm'; rm.innerHTML='&times;'; rm.title='제거';
                rm.onclick = function(e){ e.preventDefault(); e.stopPropagation(); wfEditTargetState.selected = wfEditTargetState.selected.filter(function(x){ return x!==v; }); renderEditTargetChips(); };
                chip.appendChild(rm);
                chipBox.appendChild(chip);
            });
            if(hidden) hidden.value = wfEditTargetState.selected.join(',');
        }
        function initEditTargetPicker(){
            const input  = document.getElementById('wf-edit-target-input');
            const dd     = document.getElementById('wf-edit-target-dropdown');
            const chipBox = document.getElementById('wf-edit-target-tags');
            const hidden = document.getElementById('wf-edit-target-hidden');
            if(!input || !dd || !chipBox || !hidden) return;

            function syncHidden(){ hidden.value = JSON.stringify(wfEditTargetState.selected); }
            function fmtLabel(item){
                if(typeof item === 'string') return item;
                return item.system_name ? item.work_name + ' (' + item.system_name + ')' : item.work_name;
            }
            function itemKey(item){
                if(typeof item === 'string') return item;
                return item.work_name + '||' + (item.system_name || '');
            }
            function renderChips(){
                chipBox.innerHTML = '';
                if(!wfEditTargetState.selected.length){
                    var empty = document.createElement('span'); empty.className='wf-sc-empty'; empty.textContent='선택된 대상 없음';
                    chipBox.appendChild(empty); syncHidden(); return;
                }
                wfEditTargetState.selected.forEach(function(v){
                    var chip = document.createElement('span'); chip.className = 'wf-sc-chip target-chip';
                    chip.textContent = fmtLabel(v);
                    var rm = document.createElement('button'); rm.type='button'; rm.className='wf-sc-chip-rm'; rm.innerHTML='&times;'; rm.title='제거';
                    rm.onclick = function(e){ e.preventDefault(); e.stopPropagation(); var k=itemKey(v); wfEditTargetState.selected = wfEditTargetState.selected.filter(function(x){ return itemKey(x)!==k; }); renderChips(); };
                    chip.appendChild(rm);
                    chipBox.appendChild(chip);
                });
                syncHidden();
            }
            function showDropdown(items){
                dd.innerHTML = '';
                if(!items.length){ dd.hidden=true; return; }
                var selectedKeys = wfEditTargetState.selected.map(itemKey);
                items.forEach(function(pair){
                    var key = itemKey(pair);
                    if(selectedKeys.indexOf(key) !== -1) return;
                    var label = fmtLabel(pair);
                    var opt = document.createElement('div'); opt.className='wf-dd-option'; opt.textContent=label;
                    opt.onmousedown = function(e){ e.preventDefault(); wfEditTargetState.selected.push(pair); renderChips(); input.value=''; dd.hidden=true; input.focus(); };
                    dd.appendChild(opt);
                });
                dd.hidden = dd.children.length === 0;
            }
            function fetchWorkSystems(q){
                var url = '/api/hardware-assets/suggest-work-systems?limit=30' + (q ? '&q='+encodeURIComponent(q) : '');
                fetch(url, { headers:{ Accept:'application/json' }}).then(function(r){ return r.json(); }).then(function(json){
                    if(json && json.success && Array.isArray(json.items)) showDropdown(json.items);
                    else dd.hidden = true;
                }).catch(function(){ dd.hidden=true; });
            }
            input.addEventListener('input', function(){
                clearTimeout(wfEditTargetState.debounce);
                wfEditTargetState.debounce = setTimeout(function(){ fetchWorkSystems(input.value.trim()); }, 200);
            });
            input.addEventListener('focus', function(){ fetchWorkSystems(input.value.trim()); });
            input.addEventListener('blur', function(){ setTimeout(function(){ dd.hidden=true; }, 180); });
            renderChips();
        }

        initEditAssigneePicker();
        initEditTargetPicker();

        function syncEditTaskOptions(kindValue, selectedTask){
            const taskSel = document.getElementById('wf-e-task');
            if(!taskSel) return;
            taskSel.innerHTML = '';
            const blank = document.createElement('option');
            blank.value = ''; blank.textContent = '선택';
            taskSel.appendChild(blank);
            const subs = KIND_TASK_MAP[kindValue] || [];
            subs.forEach(function(s){
                const o = document.createElement('option');
                o.value = s; o.textContent = s;
                if(s === selectedTask) o.selected = true;
                taskSel.appendChild(o);
            });
        }

        // Wire edit kind -> task
        const eKindSel = document.getElementById('wf-e-kind');
        if(eKindSel){
            eKindSel.addEventListener('change', function(){ syncEditTaskOptions(this.value); });
        }

        // Init flatpickr for edit due
        (async function(){
            const el = document.getElementById('wf-e-due');
            if(!el) return;
            try{ await ensureFlatpickrAssets(); }catch(_){ return; }
            if(!window.flatpickr || el._flatpickr) return;
            const koLocale = (window.flatpickr.l10ns && window.flatpickr.l10ns.ko) ? window.flatpickr.l10ns.ko : 'ko';
            window.flatpickr(el, {
                enableTime: true, time_24hr: true, dateFormat: 'Y-m-d H:i',
                allowInput: true, disableMobile: true, clickOpens: true,
                appendTo: document.body, locale: koLocale,
                onReady: (_s,_d,inst)=> ensureTodayButton(inst),
                onOpen:  (_s,_d,inst)=> ensureTodayButton(inst)
            });
        })();

        function openEditModal(id){
            const t = tickets.find(x=>String(x.id)===String(id));
            if(!t || !editModal) return;
            editingTicketId = id;
            // Populate fields
            const eTitle = document.getElementById('wf-e-title');
            const eKind = document.getElementById('wf-e-kind');
            const ePriority = document.getElementById('wf-e-priority');
            const eDue = document.getElementById('wf-e-due');
            const eDetail = document.getElementById('wf-e-detail');
            if(eTitle) eTitle.value = t.title || '';
            if(eKind){ eKind.value = t.kind || ''; syncEditTaskOptions(t.kind, t.task); }
            if(ePriority) ePriority.value = t.priority || '';
            if(eDue) eDue.value = t.due || '';
            if(eDetail) eDetail.value = t.detail || '';
            // Populate assignee chips
            wfEditAssigneeState.selected = Array.isArray(t.assignee) ? t.assignee.map(function(o){
                if(typeof o === 'object') return { value: o.value||'', display: o.display||o.value||'' };
                return { value: String(o), display: String(o) };
            }) : [];
            renderEditAssigneeChips();
            // Populate target chips
            wfEditTargetState.selected = Array.isArray(t.target) ? t.target.map(function(v){
                if(typeof v === 'object' && v.work_name) return v;
                if(typeof v === 'string') return v;
                return v;
            }) : (typeof t.target === 'string' && t.target ? t.target.split(',').map(function(s){ return s.trim(); }).filter(Boolean) : []);
            renderEditTargetChips();
            // Close detail, open edit
            closeDetail();
            document.body.classList.add('modal-open');
            editModal.classList.add('show');
            editModal.setAttribute('aria-hidden','false');
        }
        function closeEditModal(){
            if(!editModal) return;
            editModal.classList.remove('show');
            editModal.setAttribute('aria-hidden','true');
            document.body.classList.remove('modal-open');
            editingTicketId = null;
        }

        // Edit button in detail → opens edit modal
        if(editBtn){
            editBtn.addEventListener('click', function(){
                if(currentDetailId) openEditModal(currentDetailId);
            });
        }
        // Edit modal close
        if(editClose) editClose.addEventListener('click', closeEditModal);
        document.addEventListener('click', (e)=>{ if(e.target===editModal) closeEditModal(); });

        // Edit modal save
        if(editSaveBtn){
            editSaveBtn.addEventListener('click', function(){
                const t = tickets.find(x=>String(x.id)===String(editingTicketId));
                if(!t) return;
                const eTitle = document.getElementById('wf-e-title');
                const eKind = document.getElementById('wf-e-kind');
                const eTask = document.getElementById('wf-e-task');
                const ePriority = document.getElementById('wf-e-priority');
                const eDue = document.getElementById('wf-e-due');
                const eDetail = document.getElementById('wf-e-detail');
                const newTitle = (eTitle ? eTitle.value : '').trim();
                if(!newTitle){ wfAlert('제목을 입력하세요.'); return; }
                const newAssignee = wfEditAssigneeState.selected.slice();
                if(!newAssignee.length){ wfAlert('담당자를 선택하세요.'); return; }
                // 요청자는 담당자에 포함될 수 없음
                var _editReq = (t.requester||'').trim();
                if(_editReq && newAssignee.some(function(o){ return (o.value||'')=== _editReq; })){ wfAlert('요청자는 담당자에 포함될 수 없습니다.'); return; }
                const patch = {
                    title: newTitle,
                    kind: eKind ? eKind.value : t.kind,
                    task: eTask ? eTask.value : t.task,
                    priority: ePriority ? ePriority.value : t.priority,
                    due: eDue ? parseDueInput(eDue.value) : t.due,
                    detail: eDetail ? eDetail.value : t.detail,
                    assignee: newAssignee,
                    target: wfEditTargetState.selected.slice()
                };
                updateTicket(editingTicketId, patch);
                renderAll();
                closeEditModal();
            });
        }

        // Escape key handling
        document.addEventListener('keydown', (e)=>{
            if(e.key==='Escape'){
                if(statsModal && statsModal.classList.contains('show')){ closeStatsModal(); return; }
                const delModal = document.getElementById('wf-delete-modal');
                if(delModal && delModal.classList.contains('show')){ closeDeleteModal('wf-delete-modal'); return; }
                if(editModal && editModal.classList.contains('show')){ closeEditModal(); return; }
                if(detailModal && detailModal.classList.contains('show')) closeDetail();
            }
        });
    });
    // Delegated fallback: open/close/save
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (target.closest && target.closest('#wf-add-open')) { openAdd(); }
        if (target.closest && target.closest('#wf-add-close')) { closeAdd(); }
        // Removed delegated save trigger to prevent duplicate submissions (direct binding handles it)
    });
    // Simple debug helper: expose to window for manual triggering
    window.wfDebugOpen = openAdd;
})();

