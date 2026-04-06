/**
 * 프로젝트 관리 페이지 스크립트
 * - 컬럼 토글 (기본 10개 노출)
 * - 로컬(in-memory) 데이터 렌더링 + 페이징 + 검색
 * - 모달 (등록/수정/컬럼 선택)
 * - CSV 다운로드 (현재 페이지 or 전체)
 * NOTE: 서버 연동 전 단계로 mock 데이터 사용
 */

(function(){
    // Flatpickr (calendar) loader – shared by both code paths
    const FLATPICKR_CSS = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
    const FLATPICKR_THEME_NAME = 'airbnb';
    const FLATPICKR_THEME_HREF = `https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/${FLATPICKR_THEME_NAME}.css`;
    const FLATPICKR_JS = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.js';
    const FLATPICKR_KO = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/ko.js';
    function ensureCss(href, id){
        const existing = document.getElementById(id);
        if(existing && existing.tagName.toLowerCase() === 'link'){
            if(existing.getAttribute('href') !== href){ existing.setAttribute('href', href); }
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

    // Status-grouped view override: if the container exists on this page,
    // render minimal grouped tables and exit (no dependency on common script).
    if (document.getElementById('status-groups')) {
        (function(){
            const CURRENT_USER = window.CURRENT_USER || '홍길동';
            const MODE = (window.TASK_PAGE_MODE || 'my').toLowerCase();
            const CONTAINER_ID = 'status-groups';
            const STATUS_ORDER = ['검토','승인','수행','완료대기','완료'];
            // Persist selection within this page across re-renders
            const SELECTED = new Set();
            let _pendingClearIds = [];
            let _canApprove = false; // 팀장만 true
            async function _fetchCanApprove(){
                _canApprove = false; // 매번 리셋 – 실패 시에도 false 유지
                try{
                    const r = await fetch('/api/session/me',{credentials:'same-origin'});
                    const j = await r.json().catch(()=>({}));
                    if(j && j.success && j.user){
                        const role = String(j.user.role||'').toUpperCase();
                        _canApprove = (role === 'TEAM_LEADER');
                    }
                }catch(_e){ _canApprove = false; }
            }

            function ensureLottie(cb){
                if(window.lottie){ cb && cb(); return; }
                const s = document.createElement('script');
                s.src = 'https://unpkg.com/lottie-web@5.12.2/build/player/lottie.min.js';
                s.async = true;
                s.onload = () => cb && cb();
                document.head.appendChild(s);
            }

            function statusCodeToKo(code){
                const v = String(code||'').toUpperCase();
                if(v === 'REVIEW') return '검토';
                if(v === 'APPROVED') return '승인';
                if(v === 'SCHEDULED' || v === 'IN_PROGRESS') return '수행';
                if(v === 'COMPLETED') return '완료대기';
                if(v === 'ARCHIVED') return '완료';
                return '검토';
            }
            function toDisplayDateTime(v){
                if(!v) return '-';
                const s = String(v);
                if(s.includes('T')){
                    const t = s.replace('T',' ').replace(/\.(\d+).*/, '');
                    return t.slice(0, 16);
                }
                return s;
            }
            async function fetchTasksFromApi(){
                const view = MODE; // 'my', 'participating', or 'other'
                const url = `/api/wrk/reports?view=${encodeURIComponent(view)}&limit=500&status=REVIEW,APPROVED,SCHEDULED,IN_PROGRESS,COMPLETED,ARCHIVED`;
                try{
                    const res = await fetch(url, { credentials: 'same-origin' });
                    const json = await res.json().catch(()=> ({}));
                    if(!res.ok || !json || json.success !== true) return [];
                    const items = Array.isArray(json.items) ? json.items : [];
                    return items.map(it => ({
                        id: it.id,
                        status: statusCodeToKo(it.status || it.status_label || it.status_ko),
                        task_name: it.task_name || it.task_title || '',
                        start_datetime: toDisplayDateTime(it.start_datetime),
                        end_datetime: toDisplayDateTime(it.end_datetime),
                        owner: it.owner || it.owner_name || it.worker_name || CURRENT_USER,
                        owner_profile_image: it.owner_profile_image || null,
                        participants: it.participants || it.participants_text || '',
                        impact: it.impact || null,
                    }));
                }catch(_e){
                    return [];
                }
            }
            // Only show '완료' items within the last N days (default 30)
            function parseDateTime(s){ if(!s) return null; const t = String(s).replace(' ', 'T'); const d = new Date(t); return isNaN(d.getTime()) ? null : d; }
            function filterCompletedWindow(rows, days=30){
                const now = new Date();
                const cutoffMs = now.getTime() - (days * 24 * 60 * 60 * 1000);
                return rows.filter(r => {
                    if(String(r.status) !== '완료') return true;
                    const d = parseDateTime(r.end_datetime) || parseDateTime(r.start_datetime);
                    if(!d) return false; // no date -> hide from 완료
                    return d.getTime() >= cutoffMs;
                });
            }
            function groupByStatus(rows){
                const map = new Map(); STATUS_ORDER.forEach(s => map.set(s, []));
                rows.forEach(r => { const s = STATUS_ORDER.includes(r.status) ? r.status : '검토'; map.get(s).push(r); });
                return map;
            }
            function escapeHTML(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

            const PROFILE_ICONS = [
                '001-boy.svg','002-girl.svg','003-boy.svg','004-girl.svg','005-man.svg',
                '006-girl.svg','007-boy.svg','008-girl.svg','009-boy.svg','010-girl.svg',
                '011-man.svg','012-girl.svg','013-man.svg','014-girl.svg','015-boy.svg',
                '016-girl.svg','017-boy.svg','018-girl.svg','019-boy.svg','020-girl.svg'
            ];
            function hashCode(s){ let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0; } return Math.abs(h); }
            function iconFor(name){ if(!name) return '/static/image/svg/profil/001-boy.svg'; const idx = hashCode(name) % PROFILE_ICONS.length; return '/static/image/svg/profil/' + PROFILE_ICONS[idx]; }

            function injectStyles(){
                if(document.getElementById('status-list-css')) return;
                const css = `
                .status-group-container{ display:block; }
                .status-card{ background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:12px 12px 8px 12px; margin:14px 0; box-shadow:0 1px 1px rgba(0,0,0,0.02); }
                .card-header{ display:flex; align-items:center; justify-content:space-between; padding:2px 4px 10px 4px; }
                .card-header .header-left{ display:flex; align-items:center; gap:8px; }
                .card-header h3{ font-size:16px; margin:0; font-weight:800; letter-spacing:-0.2px; color:#6b7280 !important; }
                .card-header .count{ background:#eef2ff; color:#3730a3; border-radius:999px; padding:3px 9px; font-size:13px; font-weight:700; }
                .table-wrapper{ overflow:auto; border-radius:6px; }
                .status-table{ width:100%; border-collapse:collapse; }
                .status-table thead th{ text-align:left; font-size:13px; color:#374151; font-weight:600; padding:12px 14px; background:linear-gradient(180deg,#f9fafb 0%, #f3f4f6 100%); border-top:1px solid #e5e7eb; border-bottom:1px solid #e5e7eb; }
                .status-table tbody td{ padding:12px 14px; border-bottom:1px solid #eef2f7; vertical-align:middle; text-align:left; font-size:13px; line-height:1.5; }
                .status-table tbody tr:nth-child(odd){ background:#fcfdff; }
                .status-table tbody tr:hover{ background:#f3f4f6; }
                .status-table tbody tr.selected{ background:#eef2ff; }
                .status-table tbody tr.selected:hover{ background:#e0e7ff; }
                .status-table tbody tr:last-child td{ border-bottom:none; }
                .status-table .col-check{ width:36px; text-align:center; }
                .status-table tbody .col-name{ font-weight:400; color:#374151; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; max-width:0; }
                .col-name .task-name-link{ color:#6366F1; text-decoration:none; cursor:pointer; }
                .col-name .task-name-link:hover{ text-decoration:underline; color:#4f46e5; }
                .status-table .col-start{ width:170px; white-space:nowrap; color:#374151; font-size:13px; }
                .status-table .col-end{ width:180px; white-space:nowrap; color:#374151; font-size:13px; }
                .status-table .col-impact{ width:110px; min-width:90px; text-align:left; }
                .status-table .col-assigned{ width:220px; }
                .status-table .col-assigned .assignee-cell{ display:inline-flex; align-items:center; gap:6px; }
                .assignee-cell{ display:inline-flex; align-items:center; gap:6px; }
                .status-table .col-actions{ width:1%; white-space:nowrap; text-align:left; padding:4px 0 4px 0 !important; }
                .btn-action{ width:36px; height:36px; border-radius:8px; cursor:pointer; border:none; margin:0 3px; display:inline-flex; align-items:center; justify-content:center; transition:all .2s ease; position:relative; overflow:hidden; vertical-align:middle; }
                .btn-action-approve{ background:#10b981; box-shadow:0 2px 8px rgba(16,185,129,.15); }
                .btn-action-approve:hover{ background:#059669; transform:translateY(-1px); box-shadow:0 4px 12px rgba(16,185,129,.28); }
                .btn-action-submit{ background:#3b82f6; box-shadow:0 2px 8px rgba(59,130,246,.15); }
                .btn-action-submit:hover{ background:#2563eb; transform:translateY(-1px); box-shadow:0 4px 12px rgba(59,130,246,.28); }
                .btn-action-recall{ background:#f59e0b; box-shadow:0 2px 8px rgba(245,158,11,.15); }
                .btn-action-recall:hover{ background:#d97706; transform:translateY(-1px); box-shadow:0 4px 12px rgba(245,158,11,.28); }
                .btn-action-reject{ background:#ef4444; box-shadow:0 2px 8px rgba(239,68,68,.15); }
                .btn-action-reject:hover{ background:#dc2626; transform:translateY(-1px); box-shadow:0 4px 12px rgba(239,68,68,.28); }
                .btn-action-edit{ background:#f59e0b; box-shadow:0 2px 8px rgba(245,158,11,.15); text-decoration:none; }
                .btn-action-edit:hover{ background:#d97706; transform:translateY(-1px); box-shadow:0 4px 12px rgba(245,158,11,.28); }
                .task-action-btn{ width:36px; height:36px; border:1px solid #e8eaed; background:#ffffff; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; border-radius:8px; transition:all .2s ease; margin:0 3px; position:relative; overflow:hidden; box-sizing:border-box; padding:0; line-height:1; vertical-align:middle; text-decoration:none; }
                .task-action-btn::before{ content:""; position:absolute; top:0; left:-100%; width:100%; height:100%; background:linear-gradient(90deg, transparent, rgba(139,92,246,0.1), transparent); transition:left .5s ease; }
                .task-action-btn:hover{ background-color:#f8f9fa; border-color:#6366F1; box-shadow:0 2px 8px rgba(99,102,241,0.15); transform:translateY(-1px); }
                .task-action-btn:hover::before{ left:100%; }
                .task-action-btn .action-icon{ width:18px; height:18px; opacity:.46; display:block; filter:grayscale(.55) brightness(1.35) contrast(.8); transition:filter .22s ease, opacity .22s ease, transform .22s ease; }
                .task-action-btn:hover .action-icon{ filter:grayscale(.05) brightness(1.15) contrast(.9); opacity:.85; transform:scale(1.1); }
                .btn-action:disabled{ opacity:.5; cursor:not-allowed; transform:none !important; }
                .icon-action{ width:18px; height:18px; display:block; filter:brightness(0) invert(1); transition:transform .22s ease; }
                .btn-action:hover .icon-action{ transform:scale(1.08); }
                /* Filled accent button like the counter color */
                .btn-view{ width:36px; height:36px; border:1px solid var(--accent, #6366f1); background:var(--accent, #6366f1); border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; transition:all .2s ease; position:relative; overflow:hidden; box-shadow:0 2px 8px rgba(99,102,241,.15); vertical-align:middle; }
                .btn-view::before{ content:""; position:absolute; top:0; left:-100%; width:100%; height:100%; background:linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent); transition:left .5s ease; }
                .btn-view:hover{ filter:brightness(0.98); transform:translateY(-1px); box-shadow:0 4px 12px rgba(99,102,241,.28); }
                .btn-view:hover::before{ left:100%; }
                .btn-view:active{ transform:translateY(0); filter:brightness(0.96); }
                .btn-view:focus-visible{ outline:none; box-shadow:0 0 0 3px rgba(99,102,241,.22), 0 4px 12px rgba(99,102,241,.28); }
                .icon-view{ width:18px; height:18px; display:block; filter:brightness(0) invert(1) saturate(1) contrast(1); opacity:1; transition:transform .22s ease; }
                .btn-view:hover .icon-view, .btn-view:focus-visible .icon-view{ transform:scale(1.08); }
                .avatar-img{ width:24px !important; height:24px !important; max-width:24px; max-height:24px; border-radius:999px; object-fit:cover; vertical-align:middle; flex:0 0 24px; }
                .assignee{ color:#374151; font-size:13px; }
                .priority-dot{ width:10px; height:10px; border-radius:50%; display:inline-block; box-shadow:0 0 0 1px rgba(0,0,0,.06) inset; margin-right:8px; vertical-align:middle; }
                .priority-dot.pri-긴급{ background:#ef4444; }
                .priority-dot.pri-일반{ background:#6366f1; }
                .priority-dot.pri-낮음{ background:#10b981; }
                .priority-text{ font-size:13px; color:#374151; vertical-align:middle; }
                .empty-hint{ color:#9ca3af; font-size:12px; padding:14px; border:1px dashed #e5e7eb; background:#fafafa; border-radius:6px; margin:0 4px 8px 4px; }
                .btn-clear-section{ display:inline-flex; align-items:center; gap:4px; padding:4px 12px; font-size:12px; font-weight:600; color:#6b7280; background:#f3f4f6; border:1px solid #e5e7eb; border-radius:6px; cursor:pointer; transition:all .18s ease; }
                .btn-clear-section:hover{ color:#ef4444; background:#fef2f2; border-color:#fca5a5; }
                .btn-clear-section:active{ transform:scale(.96); }
                `;
                const style = document.createElement('style'); style.id='status-list-css'; style.textContent = css; document.head.appendChild(style);
            }

            function openDetailPopup(reportId, href){
                const rid = parseInt(String(reportId||''), 10);
                if(!Number.isFinite(rid) || rid <= 0) return;
                try{
                    const url = href || `/p/2.task_detail.html?id=${encodeURIComponent(rid)}`;
                    const w = 1100;
                    const h = 900;
                    const left = Math.max(0, Math.floor((window.screen.width - w) / 2));
                    const top = Math.max(0, Math.floor((window.screen.height - h) / 2));
                    const features = `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`;
                    const popup = window.open(url, 'wrk_report_detail', features);
                    if(popup && popup.focus){ popup.focus(); }
                    if(popup){
                        const startAt = Date.now();
                        const timer = window.setInterval(()=>{
                            try{
                                if(popup.closed){
                                    window.clearInterval(timer);
                                    if(Date.now() - startAt > 300){
                                        render();
                                    }
                                }
                            }catch(_e){
                                window.clearInterval(timer);
                            }
                        }, 700);
                    }
                }catch(_e){
                    blsSpaNavigate(`/p/2.task_detail.html?id=${encodeURIComponent(rid)}`);
                }
            }

            function bindInteractions(root){
                root.querySelectorAll('.status-card').forEach(section =>{
                    const chkAll = section.querySelector('thead .chk-all');
                    if(chkAll){
                        chkAll.addEventListener('change', () =>{
                            const rowChecks = section.querySelectorAll('tbody .chk-row, tbody .system-row-select');
                            rowChecks.forEach(ch => {
                                ch.checked = chkAll.checked;
                                const tr = ch.closest('tr');
                                const id = parseInt(ch.getAttribute('data-id')||tr?.getAttribute('data-id')||'NaN',10);
                                if(ch.checked){
                                    tr?.classList.add('selected');
                                    if(!isNaN(id)) SELECTED.add(id);
                                } else {
                                    tr?.classList.remove('selected');
                                    if(!isNaN(id)) SELECTED.delete(id);
                                }
                            });
                            chkAll.indeterminate = false;
                        });
                    }
                    section.querySelectorAll('tbody .chk-row, tbody .system-row-select').forEach(ch =>{
                        ch.addEventListener('change', () =>{
                            const tr = ch.closest('tr');
                            const id = parseInt(ch.getAttribute('data-id')||tr?.getAttribute('data-id')||'NaN',10);
                            if(ch.checked){
                                tr?.classList.add('selected');
                                if(!isNaN(id)) SELECTED.add(id);
                            } else {
                                tr?.classList.remove('selected');
                                if(!isNaN(id)) SELECTED.delete(id);
                            }
                            const rows = Array.from(section.querySelectorAll('tbody .chk-row, tbody .system-row-select'));
                            const checkedCount = rows.filter(c=>c.checked).length;
                            const allChecked = rows.length>0 && checkedCount===rows.length;
                            if(chkAll){
                                chkAll.checked = allChecked;
                                chkAll.indeterminate = checkedCount>0 && !allChecked;
                            }
                        });
                    });
                    // Row click toggles selection (except actions/checkbox)
                    const tbody = section.querySelector('tbody');
                    tbody?.addEventListener('click', (e)=>{
                        if(e.target.closest('.task-name-link') || e.target.closest('.btn-action') || e.target.closest('.action-btn')) return;
                        const tr = e.target.closest('tr'); if(!tr) return;
                        const cb = tr.querySelector('.chk-row, .system-row-select'); if(!cb) return;
                        if(e.target.classList.contains('chk-row') || e.target.classList.contains('system-row-select')) return;
                        cb.checked = !cb.checked;
                        cb.dispatchEvent(new Event('change', { bubbles:true }));
                    });
                    section.querySelectorAll('.task-name-link').forEach(link =>{
						link.addEventListener('click', (e) =>{
							e && e.preventDefault && e.preventDefault();
							const id = link.getAttribute('data-id');
							const href = link.getAttribute('href');
							openDetailPopup(id, href);
						});
                    });
                    // 수정 버튼 → 팝업으로 열기
                    section.querySelectorAll('.action-btn[data-action="edit"]').forEach(btn =>{
                        btn.addEventListener('click', (e) =>{
                            e.preventDefault(); e.stopPropagation();
                            const id = btn.getAttribute('data-id');
                            const href = btn.getAttribute('data-href');
                            openDetailPopup(id, href);
                        });
                    });
                    // Inline action buttons (승인, 결과등록)
                    section.querySelectorAll('.btn-action').forEach(btn =>{
                        btn.addEventListener('click', async (e) =>{
                            e.preventDefault(); e.stopPropagation();
                            const id = btn.getAttribute('data-id');
                            const action = btn.getAttribute('data-action');
                            await handleInlineAction(id, action, btn);
                        });
                    });
                    // Initialize header checkbox state
                    const rowChecks = section.querySelectorAll('tbody .chk-row, tbody .system-row-select');
                    if(chkAll && rowChecks.length){
                        const checkedCount = Array.from(rowChecks).filter(c=> c.checked).length;
                        chkAll.checked = checkedCount>0 && checkedCount===rowChecks.length;
                        chkAll.indeterminate = checkedCount>0 && checkedCount<rowChecks.length;
                    } else if(chkAll){
                        chkAll.checked = false; chkAll.indeterminate = false;
                    }
                });
                // 비우기 button for 완료 section
                root.querySelectorAll('.btn-clear-section[data-action="clear-completed"]').forEach(btn =>{
                    btn.addEventListener('click', (e) =>{
                        e.preventDefault(); e.stopPropagation();
                        const card = btn.closest('.status-card');
                        const ids = Array.from(card ? card.querySelectorAll('tbody tr[data-id]') : []).map(tr => parseInt(tr.getAttribute('data-id'),10)).filter(n => n > 0);
                        if(!ids.length) return;
                        _pendingClearIds = ids;
                        const subtitle = document.getElementById('task-clear-subtitle');
                        if(subtitle) subtitle.textContent = `완료된 ${ids.length}개 항목을 목록에서 비우시겠습니까?`;
                        openModal('task-clear-modal');
                    });
                });
            }

            async function handleInlineAction(reportId, action, btnEl){
                const id = parseInt(String(reportId||''), 10);
                if(!Number.isFinite(id) || id <= 0) return;
                let endpoint, confirmMsg, successMsg;
                if(action === 'approve-init'){
                    if(!_canApprove){ showMessage('승인 권한이 없습니다.', '알림'); return; }
                    endpoint = `/api/wrk/reports/${id}/approve-init`;
                    confirmMsg = '이 작업보고서를 승인하시겠습니까?';
                    successMsg = '승인되었습니다.';
                } else if(action === 'submit-result'){
                    // Open result modal instead of simple confirm
                    const resultModal = document.getElementById('task-result-modal');
                    if(!resultModal) return;
                    const rForm = document.getElementById('task-result-form');
                    if(rForm) rForm.reset();
                    // Destroy previous flatpickr instances to avoid duplicates
                    const startEl = document.getElementById('result-actual-start');
                    const endEl = document.getElementById('result-actual-end');
                    if(startEl?._flatpickr) startEl._flatpickr.destroy();
                    if(endEl?._flatpickr) endEl._flatpickr.destroy();
                    resultModal.dataset.reportId = id;
                    openModal('task-result-modal');
                    // Init flatpickr on datetime fields (same style as 작업보고서 추가)
                    _initResultDatePickers();
                    return;
                } else if(action === 'approve-final'){
                    if(!_canApprove){ showMessage('승인 권한이 없습니다.', '알림'); return; }
                    endpoint = `/api/wrk/reports/${id}/approve-final`;
                    confirmMsg = '최종 승인하시겠습니까?';
                    successMsg = '최종 승인되었습니다.';
                } else if(action === 'recall'){
                    endpoint = `/api/wrk/reports/${id}/recall`;
                    confirmMsg = '이 작업보고서를 회수하시겠습니까?\n회수하면 임시저장 상태로 돌아갑니다.';
                    successMsg = '회수되었습니다.';
                } else if(action === 'reject'){
                    if(!_canApprove){ showMessage('반려 권한이 없습니다.', '알림'); return; }
                    endpoint = `/api/wrk/reports/${id}/reject`;
                    confirmMsg = '이 작업보고서를 반려하시겠습니까?\n반려하면 임시저장 상태로 돌아갑니다.';
                    successMsg = '반려되었습니다.';
                } else { return; }
                const confirmed = await showConfirmModal(confirmMsg, '작업보고서');
                if(!confirmed) return;
                const origText = btnEl ? btnEl.textContent : '';
                if(btnEl){ btnEl.disabled = true; btnEl.textContent = '처리중…'; }
                try{
                    const res = await fetch(endpoint, {
                        method:'POST',
                        headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({}),
                        credentials:'same-origin'
                    });
                    const json = await res.json().catch(()=>({}));
                    if(!res.ok || !json || json.success !== true){
                        showMessage(json && json.message ? json.message : '처리에 실패했습니다.', '오류');
                        if(btnEl){ btnEl.disabled = false; btnEl.textContent = origText; }
                        return;
                    }
                    render(); // refresh tables
                }catch(_e){
                    showMessage('처리 중 오류가 발생했습니다.', '오류');
                    if(btnEl){ btnEl.disabled = false; btnEl.textContent = origText; }
                }
            }

            async function render(){
                const el = document.getElementById(CONTAINER_ID); if(!el) return;
                await _fetchCanApprove();
                const data = filterCompletedWindow(await fetchTasksFromApi(), 30);
                const HIDDEN_STATUSES = (MODE !== 'my') ? new Set(['검토','완료대기','완료']) : new Set();
                const visibleData = HIDDEN_STATUSES.size ? data.filter(r => !HIDDEN_STATUSES.has(r.status)) : data;
                const cntEl = document.getElementById('system-count'); if (cntEl) cntEl.textContent = String(visibleData.length);
                const grouped = groupByStatus(data);
                const blocks = [];
                grouped.forEach((items, status) =>{
                    // 참여작업·작업현황에서는 검토/완료대기/완료 숨김
                    if(MODE !== 'my' && (status==='검토' || status==='완료대기' || status==='완료')) return;
                    const count = items.length;
                    let tableHtml = '';
                    if(count){
                                                                                                const rows = items.map(it => {
                            const name = escapeHTML(it.task_name);
                            const sdt = escapeHTML(it.start_datetime || '-');
                            const edt = escapeHTML(it.end_datetime || '-');
                            const owner = escapeHTML(it.owner || '-');
                            const avatar = it.owner_profile_image || iconFor(owner);
                                                        // 영향도 표시
                                                        let impact = '-';
                                                        if(it.impact){
                                                                let dotCls = 'pri-일반';
                                                                if(it.impact === '서비스 전체 영향') dotCls = 'pri-긴급';
                                                                else if(it.impact === '서비스 일부 영향') dotCls = 'pri-일반';
                                                                else if(it.impact === '이중화 영향 없음') dotCls = 'pri-낮음';
                                                                impact = `<span class="priority-dot ${dotCls}" aria-hidden="true"></span><span class="priority-text">${escapeHTML(it.impact)}</span>`;
                                                        }
                                                        const isSelected = SELECTED.has(it.id);
                                                        // 상태별 액션 버튼 (승인 버튼은 팀장/승인권자만)
                                                        let extraActions = '';
                                                        const editBtn = (status==='검토' && !_canApprove) ? `<button class="action-btn" data-action="edit" data-id="${it.id}" data-href="/p/2.task_detail.html?id=${it.id}&mode=edit" title="수정" aria-label="수정"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon"/></button>` : '';
                                                        const recallBtn = (status==='검토' && !_canApprove) ? `<button class="btn-action btn-action-recall" data-id="${it.id}" data-action="recall" title="회수" aria-label="회수"><img src="/static/image/svg/admin/free-icon-undo.svg" alt="회수" class="icon-action"/></button>` : '';
                                                        if(_canApprove && status==='검토') extraActions = `<button class="btn-action btn-action-reject" data-id="${it.id}" data-action="reject" title="반려" aria-label="반려"><img src="/static/image/svg/free-icon-circle-xmark.svg" alt="반려" class="icon-action"/></button><button class="btn-action btn-action-approve" data-id="${it.id}" data-action="approve-init" title="승인" aria-label="승인"><img src="/static/image/svg/free-icon-font-octagon-check.svg" alt="승인" class="icon-action"/></button>`;
                                                        else if(status==='수행') extraActions = `<button class="btn-action btn-action-submit" data-id="${it.id}" data-action="submit-result" title="결과등록" aria-label="결과등록"><img src="/static/image/svg/free-icon-font-registration-paper.svg" alt="결과등록" class="icon-action"/></button>`;
                                                        else if(_canApprove && status==='완료대기') extraActions = `<button class="btn-action btn-action-approve" data-id="${it.id}" data-action="approve-final" title="승인" aria-label="승인"><img src="/static/image/svg/free-icon-font-octagon-check.svg" alt="승인" class="icon-action"/></button>`;
                                                                                                                return `<tr data-id="${it.id}" class="${isSelected?'selected':''}">
                                                                                        <td class="col-check"><input type="checkbox" class="chk-row system-row-select" aria-label="선택" data-id="${it.id}" ${isSelected?'checked':''}></td>
                                                                                        <td class="col-name" data-col="task_name" title="${name}"><a href="/p/2.task_detail.html?id=${it.id}" class="task-name-link task-detail-link" data-id="${it.id}">${name}</a></td>
                                                                                        <td class="col-start" data-col="start_datetime" title="${sdt}">${sdt}</td>
                                                                                        <td class="col-end" data-col="end_datetime" title="${edt}">${edt}</td>
                                                                                                                        <td class="col-impact" data-col="impact">${impact}</td>
                                                                                                                        <td class="col-assigned" data-col="owner" title="${owner}"><div class="assignee-cell"><img class="avatar-img" src="${avatar}" alt="${owner}" width="24" height="24"/><span class="assignee">${owner}</span></div></td>
                                                                                                <td class="col-actions" data-col="actions">${editBtn}${recallBtn}${extraActions}</td>
                                                                                    </tr>`;
                        }).join('');
                                                tableHtml = `
                                                <div class="table-wrapper system-table-container server-table-container">
                                                    <table class="system-data-table server-data-table" aria-label="${status} 작업 목록">
                            <thead>
                              <tr>
                                                                <th class="col-check" scope="col"><input type="checkbox" class="chk-all" aria-label="전체 선택"></th>
                                                                <th scope="col" data-col="task_name" class="col-name">작업 이름</th>
                                                                <th scope="col" data-col="start_datetime" class="col-start">시작일시</th>
                                                                <th scope="col" data-col="end_datetime" class="col-end">(예상)종료일시</th>
                                                                <th scope="col" data-col="impact" class="col-impact">영향도</th>
                                                                <th scope="col" data-col="owner" class="col-assigned">담당자</th>
                                                                <th scope="col" data-col="actions" class="col-actions">관리</th>
                              </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                          </table>
                        </div>`;
                    }
                    blocks.push(`
                        <section class="status-card" data-status="${status}">
                          <div class="card-header">
                            <div class="header-left">
                              <h3>${status}</h3>
                              <span class="count">${count}</span>
                            </div>
                            ${status === '완료' && count > 0 ? `<button class="btn-clear-section" data-action="clear-completed" title="완료 목록 비우기">비우기</button>` : ''}
                          </div>
                          ${count ? tableHtml : `<div class="empty-hint">해당 상태의 작업이 없습니다.</div>`}
                        </section>
                    `);
                });
                el.innerHTML = blocks.join('');
                bindInteractions(el);
            }

            function openNewReportPopup(){
                try{
                    const url = '/p/2.task_detail.html';
                    const w = 1100;
                    const h = 900;
                    const left = Math.max(0, Math.floor((window.screen.width - w) / 2));
                    const top = Math.max(0, Math.floor((window.screen.height - h) / 2));
                    const features = `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`;
                    const popup = window.open(url, 'wrk_report_detail', features);
                    if(popup && popup.focus){ popup.focus(); }
                    if(popup){
                        const startAt = Date.now();
                        const timer = window.setInterval(()=>{
                            try{
                                if(popup.closed){
                                    window.clearInterval(timer);
                                    if(Date.now() - startAt > 300){ render(); }
                                }
                            }catch(_e){ window.clearInterval(timer); }
                        }, 700);
                    }
                }catch(_e){
                    blsSpaNavigate('/p/2.task_detail.html');
                }
            }
            function initAddReportBtn(){
                const btn = document.getElementById('task-add-report-btn');
                if(btn) btn.addEventListener('click', (e)=>{ e.preventDefault(); openNewReportPopup(); });
            }

            // ── Modal helpers (self-contained for status-grouped IIFE) ──
            function openModal(id){
                const el = document.getElementById(id); if(!el) return;
                document.body.classList.add('modal-open');
                el.classList.add('show');
                el.setAttribute('aria-hidden','false');
            }
            function closeModal(id){
                const el = document.getElementById(id); if(!el) return;
                el.classList.remove('show');
                el.setAttribute('aria-hidden','true');
                if(!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show, .modal-overlay-full.show')){
                    document.body.classList.remove('modal-open');
                }
            }
            // Promise-based confirm modal (replaces browser confirm)
            let _confirmResolve = null;
            function showConfirmModal(message, title){
                return new Promise((resolve)=>{
                    _confirmResolve = resolve;
                    const titleEl = document.getElementById('task-action-confirm-title');
                    const subtitleEl = document.getElementById('task-action-confirm-subtitle');
                    const bodyEl = document.getElementById('task-action-confirm-body');
                    if(titleEl) titleEl.textContent = title || '확인';
                    if(subtitleEl) subtitleEl.textContent = '';
                    if(bodyEl) bodyEl.textContent = String(message || '');
                    openModal('task-action-confirm-modal');
                });
            }
            function _resolveConfirm(val){
                closeModal('task-action-confirm-modal');
                if(_confirmResolve){ _confirmResolve(val); _confirmResolve = null; }
            }

            // ── Result-modal helpers (IIFE scope so handleInlineAction can access) ──
            function _parseResultDT(v){
                if(!v) return null;
                const m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
                if(!m) return null;
                return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5]);
            }
            function _calcResultDuration(){
                const startEl = document.getElementById('result-actual-start');
                const endEl = document.getElementById('result-actual-end');
                const durEl = document.getElementById('result-actual-duration');
                if(!startEl || !endEl || !durEl) return;
                const s = _parseResultDT(startEl.value), e = _parseResultDT(endEl.value);
                if(!s || !e){ durEl.value = ''; return; }
                const diff = e - s;
                if(diff <= 0){ durEl.value = ''; return; }
                const totalMin = Math.round(diff / 60000);
                const h = Math.floor(totalMin / 60), m = totalMin % 60;
                durEl.value = h > 0 ? (m > 0 ? `${h}시간 ${m}분` : `${h}시간`) : `${m}분`;
            }
            async function _initResultDatePickers(){
                try { await ensureFlatpickr(); } catch(_e){ return; }
                if(!window.flatpickr) return;
                function ensureTodayBtn(fp){
                    const cal = fp?.calendarContainer; if(!cal) return;
                    if(cal.querySelector('.fp-today-btn')) return;
                    const btn = document.createElement('button');
                    btn.type = 'button'; btn.className = 'fp-today-btn'; btn.textContent = '오늘';
                    btn.addEventListener('click', ()=>{ fp.setDate(new Date(), true); });
                    cal.appendChild(btn);
                }
                const fpOpts = {
                    locale: (window.flatpickr?.l10ns?.ko) || 'ko',
                    enableTime: true,
                    time_24hr: true,
                    dateFormat: 'Y-m-d H:i',
                    allowInput: true,
                    disableMobile: true,
                    clickOpens: true,
                    appendTo: document.body,
                    onReady: function(_, __, inst){ ensureTodayBtn(inst); },
                    onOpen: function(_, __, inst){ ensureTodayBtn(inst); },
                    onChange: function(){ _calcResultDuration(); }
                };
                const startEl = document.getElementById('result-actual-start');
                const endEl = document.getElementById('result-actual-end');
                if(startEl && !startEl._flatpickr) window.flatpickr(startEl, fpOpts);
                if(endEl && !endEl._flatpickr) window.flatpickr(endEl, fpOpts);
            }

            function initClearModal(){
                document.getElementById('task-clear-close')?.addEventListener('click', ()=> closeModal('task-clear-modal'));
                document.getElementById('task-clear-confirm')?.addEventListener('click', async ()=>{
                    closeModal('task-clear-modal');
                    const ids = _pendingClearIds || [];
                    _pendingClearIds = [];
                    if(!ids.length) return;
                    try{
                        await fetch('/api/wrk/reports/batch-clear', {
                            method:'POST',
                            headers:{'Content-Type':'application/json'},
                            body: JSON.stringify({ ids }),
                            credentials:'same-origin'
                        });
                    }catch(_e){}
                    render();
                });
                // Action confirm modal bindings
                document.getElementById('task-action-confirm-ok')?.addEventListener('click', ()=> _resolveConfirm(true));
                document.getElementById('task-action-confirm-cancel')?.addEventListener('click', ()=> _resolveConfirm(false));
                document.getElementById('task-action-confirm-close')?.addEventListener('click', ()=> _resolveConfirm(false));
                // Message modal bindings
                document.getElementById('system-message-close')?.addEventListener('click', ()=> closeModal('system-message-modal'));
                document.getElementById('system-message-ok')?.addEventListener('click', ()=> closeModal('system-message-modal'));
                // Result modal bindings
                document.getElementById('task-result-close')?.addEventListener('click', ()=> closeModal('task-result-modal'));
                document.getElementById('task-result-cancel')?.addEventListener('click', ()=> closeModal('task-result-modal'));
                document.getElementById('result-actual-start')?.addEventListener('change', _calcResultDuration);
                document.getElementById('result-actual-end')?.addEventListener('change', _calcResultDuration);
                document.getElementById('task-result-submit')?.addEventListener('click', async ()=>{
                    const modal = document.getElementById('task-result-modal');
                    const reportId = modal?.dataset.reportId;
                    if(!reportId) return;
                    const form = document.getElementById('task-result-form');
                    const actual_start_time = form?.querySelector('[name="actual_start_time"]')?.value || '';
                    const actual_end_time = form?.querySelector('[name="actual_end_time"]')?.value || '';
                    const actual_duration = form?.querySelector('[name="actual_duration"]')?.value?.trim() || '';
                    const result_type = form?.querySelector('[name="result_type"]')?.value || '';
                    const report_result = form?.querySelector('[name="report_result"]')?.value?.trim() || '';
                    closeModal('task-result-modal');
                    try{
                        const res = await fetch(`/api/wrk/reports/${reportId}/submit-result`, {
                            method:'POST',
                            headers:{'Content-Type':'application/json'},
                            body:JSON.stringify({ actual_start_time, actual_end_time, actual_duration, result_type, report_result }),
                            credentials:'same-origin'
                        });
                        const json = await res.json().catch(()=>({}));
                        if(!res.ok || !json || json.success !== true){
                            showMessage(json?.message || '처리에 실패했습니다.', '오류');
                            return;
                        }
                        showMessage('결과가 등록되었습니다.', '완료');
                        render();
                    }catch(_e){
                        showMessage('처리 중 오류가 발생했습니다.', '오류');
                    }
                });
                document.addEventListener('keydown', e=>{
                    if(e.key==='Escape'){
                        closeModal('task-clear-modal');
                        _resolveConfirm(false);
                        closeModal('system-message-modal');
                        closeModal('task-result-modal');
                    }
                });
            }

            function init(){ injectStyles();initAddReportBtn(); initClearModal(); render(); }
            if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
        })();
        return;
    }
    // External dependencies
    const LOTTIE_CDN = 'https://unpkg.com/lottie-web@5.12.2/build/player/lottie.min.js';
    const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    function ensureLottie(cb){
        if(window.lottie){ cb(); return; }
        const s = document.createElement('script'); s.src = LOTTIE_CDN; s.async = true; s.onload = ()=> cb(); document.head.appendChild(s);
    }
    function ensureXLSX(){
        return new Promise((resolve, reject)=>{
            if(window.XLSX){ resolve(); return; }
            const s = document.createElement('script'); s.src = XLSX_CDN; s.async = true; s.onload = ()=> resolve(); s.onerror=()=> reject(new Error('XLSX load failed')); document.head.appendChild(s);
        });
    }
    async function initDatePickers(formId){
        const form = document.getElementById(formId); if(!form) return;
        try { await ensureFlatpickr(); } catch(_e){ return; }
        const startEl = form.querySelector('[name="lic_period_start"]');
        const endEl = form.querySelector('[name="lic_period_end"]');
        function ensureTodayButton(fp){
            const cal = fp?.calendarContainer; if(!cal) return;
            if(cal.querySelector('.fp-today-btn')) return; // already added
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'fp-today-btn';
            btn.textContent = '오늘';
            btn.addEventListener('click', ()=>{
                const now = new Date();
                fp.setDate(now, true); // set and trigger change
                // optionally keep open; if you want to close: fp.close();
            });
            cal.appendChild(btn);
        }
        const opts = {
            locale: (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.ko) ? window.flatpickr.l10ns.ko : 'ko',
            dateFormat: 'Y-m-d',
            allowInput: true,
            disableMobile: true,
            onReady: function(selectedDates, dateStr, instance){ ensureTodayButton(instance); },
            onOpen: function(selectedDates, dateStr, instance){ ensureTodayButton(instance); }
        };
        if(startEl && !startEl._flatpickr){ window.flatpickr(startEl, opts); }
        if(endEl && !endEl._flatpickr){ window.flatpickr(endEl, opts); }
    }
    let uploadAnim = null; // keep a single instance for upload modal
    function initUploadAnim(){
        const el = document.getElementById('upload-anim'); if(!el) return;
        ensureLottie(()=>{
            try {
                // Destroy any previous instance and clear container to prevent duplicates
                if(uploadAnim && typeof uploadAnim.destroy === 'function'){
                    uploadAnim.destroy();
                }
                el.innerHTML = '';
                uploadAnim = window.lottie.loadAnimation({
                    container: el,
                    renderer:'svg',
                    loop:true,
                    autoplay:true,
                    path:'/static/image/svg/list/free-animated-upload.json',
                    rendererSettings:{ preserveAspectRatio:'xMidYMid meet', progressiveLoad:true }
                });
            } catch(_e){}
        });
    }
    const TABLE_ID = 'system-table';
    const TBODY_ID = 'system-table-body';
    const COUNT_ID = 'system-count';
    const SEARCH_ID = 'system-search';
    const SEARCH_CLEAR_ID = 'system-search-clear';
    const PAGE_SIZE_ID = 'system-page-size';
    const PAGINATION_INFO_ID = 'system-pagination-info';
    const PAGE_NUMBERS_ID = 'system-page-numbers';
    const SELECT_ALL_ID = 'system-select-all';

    // Column modal
    const COLUMN_MODAL_ID = 'system-column-modal';
    const COLUMN_FORM_ID = 'system-column-form';
    const COLUMN_BTN_ID = 'system-column-btn';
    const COLUMN_CLOSE_ID = 'system-column-close';
    const COLUMN_APPLY_ID = 'system-column-apply';
    const COLUMN_RESET_ID = 'system-column-reset';
    const COLUMN_SELECTALL_BTN_ID = 'system-column-selectall-btn';

    // Add/Edit modal
    const ADD_MODAL_ID = 'system-add-modal';
    const ADD_BTN_ID = 'system-add-btn';
    const ADD_CLOSE_ID = 'system-add-close';
    const ADD_SAVE_ID = 'system-add-save';
    const ADD_FORM_ID = 'system-add-form';
    const EDIT_MODAL_ID = 'system-edit-modal';
    const EDIT_FORM_ID = 'system-edit-form';
    const EDIT_CLOSE_ID = 'system-edit-close';
    const EDIT_SAVE_ID = 'system-edit-save';

    // Dispose (불용처리)
    const DISPOSE_BTN_ID = 'system-dispose-btn';
    const DISPOSE_MODAL_ID = 'system-dispose-modal';
    const DISPOSE_CLOSE_ID = 'system-dispose-close';
    const DISPOSE_CONFIRM_ID = 'system-dispose-confirm';

    // Delete (삭제처리)
    const DELETE_BTN_ID = 'system-delete-btn';
    const DELETE_MODAL_ID = 'system-delete-modal';
    const DELETE_CLOSE_ID = 'system-delete-close';
    const DELETE_CONFIRM_ID = 'system-delete-confirm';

    // Bulk Edit (일괄변경)
    const BULK_BTN_ID = 'system-bulk-btn';
    const BULK_MODAL_ID = 'system-bulk-modal';
    const BULK_CLOSE_ID = 'system-bulk-close';
    const BULK_FORM_ID = 'system-bulk-form';
    const BULK_APPLY_ID = 'system-bulk-apply';

    // Stats (통계)
    const STATS_BTN_ID = 'system-stats-btn';
    const STATS_MODAL_ID = 'system-stats-modal';
    const STATS_CLOSE_ID = 'system-stats-close';
    const STATS_OK_ID = 'system-stats-ok';

    // Upload (엑셀 업로드)
    const UPLOAD_BTN_ID = 'system-upload-btn';
    const UPLOAD_MODAL_ID = 'system-upload-modal';
    const UPLOAD_CLOSE_ID = 'system-upload-close';
    const UPLOAD_INPUT_ID = 'upload-input';
    const UPLOAD_DROPZONE_ID = 'upload-dropzone';
    const UPLOAD_META_ID = 'upload-meta';
    const UPLOAD_FILE_CHIP_ID = 'upload-file-chip';
    const UPLOAD_TEMPLATE_BTN_ID = 'upload-template-download';
    const UPLOAD_CONFIRM_ID = 'system-upload-confirm';
    // Upload template (Software schema)
    const UPLOAD_HEADERS_KO = [
        '소프트웨어 구분','소프트웨어 상태','소프트웨어 제조사','소프트웨어 이름','소프트웨어 버전',
        '소프트웨어 담당부서','소프트웨어 담당자','라이선스 방식',
        '라이선스 전체수량','라이선스 할당수량','라이선스 유휴수량','라이선스 설명'
    ];
    const HEADER_KO_TO_KEY = {
        '소프트웨어 구분':'sw_type','소프트웨어 상태':'sw_status','소프트웨어 제조사':'sw_vendor','소프트웨어 이름':'sw_name','소프트웨어 버전':'sw_version',
        '소프트웨어 담당부서':'sw_dept','소프트웨어 담당자':'sw_owner','라이선스 방식':'lic_type',
        '라이선스 전체수량':'lic_total','라이선스 할당수량':'lic_assigned','라이선스 유휴수량':'lic_idle','라이선스 설명':'lic_desc'
    };
    const ENUM_SETS = { };
    function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
    function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
    function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }

    // Data + State
    const BASE_VISIBLE_COLUMNS = [
        'sw_status','sw_vendor','sw_name','sw_version','sw_owner','lic_type','lic_total','lic_assigned','lic_idle'
    ];
    const COLUMN_ORDER = [
        'sw_type','sw_status','sw_vendor','sw_name','sw_version','sw_dept','sw_owner','lic_type','lic_total','lic_assigned','lic_idle','lic_desc'
    ];

    // 컬럼 선택 모달 전용 사용자 정의 그룹/순서 (테이블 렌더 순서에는 영향 주지 않음)
    const COLUMN_MODAL_GROUPS = [
        { group: '소프트웨어', columns: ['sw_type','sw_status','sw_vendor','sw_name','sw_version'] },
        { group: '담당자', columns: ['sw_dept','sw_owner'] },
        { group: '점검', columns: ['lic_type','lic_total','lic_assigned','lic_idle','lic_desc'] }
    ];

    /** 컬럼 메타 (라벨 + 그룹) */
    const COLUMN_META = {
        sw_type:{label:'소프트웨어 구분',group:'소프트웨어'},
        sw_status:{label:'소프트웨어 상태',group:'소프트웨어'},
        sw_vendor:{label:'소프트웨어 제조사',group:'소프트웨어'},
        sw_name:{label:'소프트웨어 이름',group:'소프트웨어'},
        sw_version:{label:'소프트웨어 버전',group:'소프트웨어'},
        sw_dept:{label:'소프트웨어 담당부서',group:'담당자'},
        sw_owner:{label:'소프트웨어 담당자',group:'담당자'},
        lic_type:{label:'라이선스 방식',group:'점검'},
        lic_total:{label:'라이선스 전체수량',group:'점검'},
        lic_assigned:{label:'라이선스 할당수량',group:'점검'},
        lic_idle:{label:'라이선스 유휴수량',group:'점검'},
        lic_desc:{label:'라이선스 설명',group:'점검'}
    };

    let state = {
        data: [],
        filtered: [],
        pageSize: 10,
        page: 1,
        visibleCols: new Set(BASE_VISIBLE_COLUMNS),
        search: '',
        // 선택된 행 (row id 기반) 저장하여 리렌더 후에도 유지
        selected: new Set(),
        nextId: 1, // mockData 초기화 후 재설정
        sortKey: null,
        sortDir: 'asc',
    columnFilters: {} // { col: value | [values...] } (조건 필터 기능 제거 예정 - 빈 유지)
    };

    // Optional demo: override the visible counter via URL param without changing data/pagination
    // Usage: append ?demoCounter=1500 (commas allowed, e.g., 1,500)
    let DEMO_COUNTER = null;

    // 소프트웨어 페이지: 요청에 따라 샘플 데이터 5개 제공
    function mockData(count=5){
        const rows = [
            {
                id: 1,
                sw_type: '상용', sw_status: '사용', sw_vendor: 'Microsoft', sw_name: 'Windows Server', sw_version: '2022',
                sw_dept: '인프라팀', sw_owner: '홍길동',
                lic_type: '서브스크립션(3년)', lic_total: 50, lic_assigned: 32, lic_idle: 18,
                lic_desc: '데이터센터 표준 OS'
            },
            {
                id: 2,
                sw_type: '상용', sw_status: '사용', sw_vendor: 'Oracle', sw_name: 'Oracle Database', sw_version: '19c',
                sw_dept: 'DB운영팀', sw_owner: '김철수',
                lic_type: '영구구매(1회)', lic_total: 20, lic_assigned: 15, lic_idle: 5,
                lic_desc: '주요 업무 DB'
            },
            {
                id: 3,
                sw_type: '상용', sw_status: '사용', sw_vendor: 'Red Hat', sw_name: 'RHEL', sw_version: '9.2',
                sw_dept: '플랫폼팀', sw_owner: '이영희',
                lic_type: '서브스크립션(1년)', lic_total: 80, lic_assigned: 72, lic_idle: 8,
                lic_desc: '리눅스 표준 배포판'
            },
            {
                id: 4,
                sw_type: '상용', sw_status: '미사용', sw_vendor: 'JetBrains', sw_name: 'IntelliJ IDEA', sw_version: '2024.2',
                sw_dept: '개발1팀', sw_owner: '박보라',
                lic_type: '서브스크립션(1년)', lic_total: 30, lic_assigned: 0, lic_idle: 30,
                lic_desc: '개발도구 (예비 라이선스)'
            },
            {
                id: 5,
                sw_type: '상용', sw_status: '사용', sw_vendor: 'Nginx Inc.', sw_name: 'Nginx Plus', sw_version: 'R31',
                sw_dept: '플랫폼팀', sw_owner: '최가을',
                lic_type: '서브스크립션(2년)', lic_total: 10, lic_assigned: 6, lic_idle: 4,
                lic_desc: 'API 게이트웨이/리버스 프록시'
            }
        ];
        // 만약 다른 개수를 명시했다면 상위 count개만 반환
        return rows.slice(0, Math.max(0, count|0));
    }

    function initData(){
        state.data = mockData(5);
        state.nextId = state.data.length + 1;
        applyFilter();
    }

    function applyFilter(){
        const qRaw = state.search; // original input
        const trimmed = qRaw.trim();
        // 그룹 분리: % 기준 AND, 그룹 내 , 기준 OR (같은 열 기준 다중검색)
        // 예) "HPE,IBM%홍길동" => [ ['hpe','ibm'], ['홍길동'] ]
        const groups = trimmed
            ? trimmed.split('%').map(g=> g.split(',').map(s=>s.trim()).filter(Boolean).map(s=>s.toLowerCase())).filter(arr=>arr.length>0)
            : [];
        // Always search across all defined columns
        const searchCols = Object.keys(COLUMN_META);
        // 1단계: 기본 검색
        let base = [];
        if(!groups.length){
            base = [...state.data];
        } else {
            base = state.data.filter(row =>
                // 모든 그룹(%)이 만족해야 함
                groups.every(alts => {
                    // 하나의 그룹 내에서는 같은 열에서 OR 매칭(하나라도 포함되면 통과)
                    return searchCols.some(col => {
                        const v = row[col]; if(v==null) return false;
                        const cell = String(v).toLowerCase();
                        return alts.some(tok => cell.includes(tok));
                    });
                })
            );
        }
        // 2단계: 컬럼 개별 필터 적용 (오른쪽 클릭 필터)
        const filterEntries = Object.entries(state.columnFilters).filter(([k,v])=> {
            if(Array.isArray(v)) return v.length>0; return v!=null && v!=='';
        });
        if(filterEntries.length){
            base = base.filter(row => filterEntries.every(([col,val])=>{
                const cell = String(row[col]??'');
                if(Array.isArray(val)) return val.includes(cell);
                return cell === String(val);
            }));
        }
    state.filtered = base;
        state.page = 1;
    // 하이라이트는 모든 대안 토큰을 납작하게(flat) 전달
    const flatTokens = groups.flat();
    render({ raw:qRaw, tokens: flatTokens });
    }

    function getPageSlice(){
        const start = (state.page-1)*state.pageSize;
        return state.filtered.slice(start, start+state.pageSize);
    }

    function totalPages(){
        return Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    }

    function render(highlightContext){
        const tbody = document.getElementById(TBODY_ID);
        if(!tbody) return;
        tbody.innerHTML='';
        // 정렬 적용 (필터 결과에 대해)
        let working = state.filtered;
        if(state.sortKey){
            const k = state.sortKey;
            const dir = state.sortDir==='asc'?1:-1;
            working = [...state.filtered].sort((a,b)=>{
                let va=a[k], vb=b[k];
                const na = va!=='' && va!=null && !isNaN(va);
                const nb = vb!=='' && vb!=null && !isNaN(vb);
                if(na && nb){ va=parseFloat(va); vb=parseFloat(vb);} else { va=(va==null?'':String(va)).toLowerCase(); vb=(vb==null?'':String(vb)).toLowerCase(); }
                if(va===vb) return 0;
                if(va==='' && vb!=='') return 1;
                if(vb==='' && va!=='') return -1;
                return va>vb?dir:-dir;
            });
        }
        const start = (state.page-1)*state.pageSize;
        const slice = working.slice(start, start+state.pageSize);
        const emptyEl = document.getElementById('system-empty');
        if(state.filtered.length === 0){
            if(emptyEl){
                emptyEl.hidden = false;
                // 검색어가 있을 때와 데이터 자체가 없을 때 메시지 구분
                const titleEl = document.getElementById('system-empty-title');
                const descEl = document.getElementById('system-empty-desc');
                if(state.search.trim()){
                    if(titleEl) titleEl.textContent = '검색 결과가 없습니다.';
                    if(descEl) descEl.textContent = '검색어를 변경하거나 필터를 초기화하세요.';
                } else {
                    if(titleEl) titleEl.textContent = '소프트웨어 내역이 없습니다.';
                    if(descEl) descEl.textContent = "우측 상단 '추가' 버튼을 눌러 첫 소프트웨어를 등록하세요.";
                }
            }
        } else if(emptyEl){
            // 데이터가 존재하면 항상 숨김
            emptyEl.hidden = true;
        }
        const highlightInfo = highlightContext || { raw:'', tokens:[] };
        const tokens = Array.isArray(highlightInfo.tokens) ? highlightInfo.tokens.filter(Boolean) : [];
        const highlightCols = Object.keys(COLUMN_META);
        function highlight(val, col){
            if(!val || !tokens.length || !highlightCols.includes(col)) return escapeHTML(val);
            let output = escapeHTML(String(val));
            tokens.forEach(tok=>{
                const esc = tok.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
                const regex = new RegExp(esc, 'ig');
                output = output.replace(regex, m=>`<mark class=\"search-hit\">${m}</mark>`);
            });
            return output;
        }
        slice.forEach((row)=>{
            const tr = document.createElement('tr');
            const checked = row.id && state.selected.has(row.id) ? 'checked' : '';
            tr.setAttribute('data-id', row.id ?? '');
            tr.innerHTML = `<td><input type="checkbox" class="system-row-select" data-id="${row.id??''}" ${checked}></td>`
                + COLUMN_ORDER.map(col=>{
                    if(!COLUMN_META[col]) return '';
                    const tdClass = state.visibleCols.has(col)?'':'col-hidden';
                    const label = COLUMN_META[col].label;
                    let rawVal = row[col];
                    if(col==='lic_desc' && typeof rawVal==='string'){
                        // single-line for table display
                        rawVal = rawVal.replace(/\r?\n|\r/g,' ');
                    }
                    const displayVal = (rawVal==null || String(rawVal).trim()==='') ? '-' : rawVal;
                    let cellValue = highlight(displayVal, col);
                    // 소프트웨어 상태: on-premise의 업무 상태 배지 스타일과 동일하게 표시
                    if(col === 'sw_status'){
                        const v = String(displayVal);
                        // 매핑: 사용 -> ws-run, 미사용 -> ws-wait (회색)
                        let cls = 'ws-wait';
                        if(v === '사용') cls = 'ws-run';
                        else if(v === '미사용') cls = 'ws-wait';
                        cellValue = `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${highlight(displayVal, col)}</span></span>`;
                    }
                    return `<td data-col="${col}" data-label="${label}" class="${tdClass}">${cellValue}</td>`;
                }).join('')
                + `<td data-col="actions" data-label="관리" class="system-actions">`
                + `<button type="button" class="action-btn" data-action="edit" data-id="${row.id}" title="수정" aria-label="수정">
                    <img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon">
                   </button>`
                + `</td>`;
            if(row.id && state.selected.has(row.id)) tr.classList.add('selected');
            tbody.appendChild(tr);
        });
        const countEl = document.getElementById(COUNT_ID);
        if(countEl){
            const prev = parseInt(countEl.getAttribute('data-count') || (countEl.textContent||'0').replace(/,/g,''), 10) || 0;
            let next = state.filtered.length;
            if(DEMO_COUNTER != null){ next = DEMO_COUNTER; }
            const display = (DEMO_COUNTER != null) ? next.toLocaleString('ko-KR') : String(next);
            countEl.textContent = display;
            countEl.setAttribute('data-count', String(next));
            // size class management
            countEl.classList.remove('large-number','very-large-number');
            if(next >= 1000) countEl.classList.add('very-large-number');
            else if(next >= 100) countEl.classList.add('large-number');
            // pulse animation on change
            if(prev !== next){
                countEl.classList.remove('is-updating');
                void countEl.offsetWidth; // reflow to restart animation
                countEl.classList.add('is-updating');
            }
        }
        updatePagination();
        applyColumnVisibility();
        // select-all 상태 동기화
        const selectAll = document.getElementById(SELECT_ALL_ID);
        if(selectAll){
            const checkboxes = tbody.querySelectorAll('.system-row-select');
            if(checkboxes.length){
                selectAll.checked = [...checkboxes].every(cb=>cb.checked);
            } else {
                selectAll.checked = false;
            }
        }
        updateSortIndicators();
    }

    function escapeHTML(str){
        return String(str).replace(/[&<>'"]/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[s]));
    }

    // Pagination UI
    function updatePagination(){
        const infoEl = document.getElementById(PAGINATION_INFO_ID);
        if(infoEl){
            const start = state.filtered.length? (state.page-1)*state.pageSize+1 : 0;
            const end = Math.min(state.filtered.length, state.page*state.pageSize);
            infoEl.textContent = `${start}-${end} / ${state.filtered.length}개 항목`;
        }
        const pages = totalPages();
        const container = document.getElementById(PAGE_NUMBERS_ID);
        if(container){
            container.innerHTML='';
            for(let p=1;p<=pages && p<=50;p++){ // hard cap to 50 buttons
                const btn = document.createElement('button');
                btn.className = 'page-btn'+(p===state.page?' active':'');
                btn.textContent = p;
                btn.dataset.page = p;
                container.appendChild(btn);
            }
        }
        togglePageButtons();
    }

    function togglePageButtons(){
        const first = document.getElementById('system-first');
        const prev = document.getElementById('system-prev');
        const next = document.getElementById('system-next');
        const last = document.getElementById('system-last');
        const pages = totalPages();
        if(first){ first.disabled = state.page===1; }
        if(prev){ prev.disabled = state.page===1; }
        if(next){ next.disabled = state.page===pages; }
        if(last){ last.disabled = state.page===pages; }
    }

    // Column handling
    function buildColumnModal(){
        const form = document.getElementById(COLUMN_FORM_ID);
        if(!form) return;
        form.innerHTML='';
        // 지정된 COLUMN_MODAL_GROUPS 순서대로 렌더
        COLUMN_MODAL_GROUPS.forEach(groupDef=>{
            const section = document.createElement('div');
            section.className='form-section';
            section.innerHTML = `<div class="section-header"><h4>${groupDef.group}</h4></div>`;
            const grid = document.createElement('div');
            grid.className='column-select-grid';
            groupDef.columns.forEach(col=>{
                if(!COLUMN_META[col]) return; // 안전 검사
                const active = state.visibleCols.has(col)?' is-active':'';
                const label = document.createElement('label');
                label.className='column-checkbox'+active;
                label.innerHTML=`<input type="checkbox" value="${col}" ${state.visibleCols.has(col)?'checked':''}>`+
                    `<span class="col-check" aria-hidden="true"></span>`+
                    `<span class="col-text">${COLUMN_META[col].label}</span>`;
                grid.appendChild(label);
            });
            section.appendChild(grid);
            form.appendChild(section);
        });
        // select-all 버튼 레이블 동기화
        syncColumnSelectAll();
    }

    function syncColumnSelectAll(){
        const btn = document.getElementById(COLUMN_SELECTALL_BTN_ID);
        const form = document.getElementById(COLUMN_FORM_ID); if(!btn || !form) return;
        const boxes = [...form.querySelectorAll('input[type=checkbox]')];
        // 항상 '전체 선택'만 보여준다 (전체 해제는 제공하지 않음)
        btn.textContent = '전체 선택';
    }

    function openModal(id){
        const el = document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
    function closeModal(id){
        const el = document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show')){ document.body.classList.remove('modal-open'); }}

    // Unified message modal (replaces browser alert)
    function showMessage(message, title){
        const modalId = 'system-message-modal';
        const titleEl = document.getElementById('message-title');
        const contentEl = document.getElementById('message-content');
        if(titleEl) titleEl.textContent = title || '알림';
        if(contentEl) contentEl.textContent = String(message || '');
        openModal(modalId);
    }

    function applyColumnVisibility(){
        const table = document.getElementById(TABLE_ID); if(!table) return;
        // Safety net: if current visible set does not contain any valid keys, restore defaults
        const validKeys = new Set(Object.keys(COLUMN_META));
        const hasAnyValid = [...state.visibleCols].some(k => validKeys.has(k));
        if(!hasAnyValid){
            state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
            saveColumnSelection();
        }
        table.querySelectorAll('thead th[data-col], tbody td[data-col]').forEach(cell=>{
            const col = cell.getAttribute('data-col');
            if(col==='actions') return;
            if(state.visibleCols.has(col)) cell.classList.remove('col-hidden'); else cell.classList.add('col-hidden');
        });
    }

    function saveColumnSelection(){
        try { localStorage.setItem('system_visible_cols', JSON.stringify([...state.visibleCols])); } catch(e){}
    }
    function loadColumnSelection(){
        try {
            const raw = localStorage.getItem('system_visible_cols');
            if(!raw) return; // nothing stored, keep defaults
            let parsed = [];
            try { parsed = JSON.parse(raw); } catch(_e) { parsed = []; }
            if(!Array.isArray(parsed)) parsed = [];
            // Sanitize: keep only known columns; de-dup
            const allowed = new Set(Object.keys(COLUMN_META));
            const filtered = [...new Set(parsed.filter(k => allowed.has(String(k))))];
            if(filtered.length > 0){
                state.visibleCols = new Set(filtered);
                // Migration: previously saved default (without sw_owner) -> add sw_owner now
                if(!state.visibleCols.has('sw_owner')){
                    const prevDefault = ['sw_status','sw_vendor','sw_name','sw_version','lic_total','lic_assigned','lic_idle'];
                    const isPrevDefault = state.visibleCols.size === prevDefault.length && prevDefault.every(k=> state.visibleCols.has(k));
                    if(isPrevDefault){
                        state.visibleCols.add('sw_owner');
                    }
                }
                // No longer auto-add sw_type to defaults
                // Ensure lic_type is visible as part of defaults
                if(!state.visibleCols.has('lic_type')){
                    const possibleOlds = [
                        ['sw_type','sw_status','sw_vendor','sw_name','sw_version','sw_owner','lic_total','lic_assigned','lic_idle'],
                        ['sw_status','sw_vendor','sw_name','sw_version','sw_owner','lic_total','lic_assigned','lic_idle']
                    ];
                    const matchesAny = possibleOlds.some(arr => state.visibleCols.size === arr.length && arr.every(k=> state.visibleCols.has(k)));
                    if(matchesAny){
                        state.visibleCols.add('lic_type');
                    }
                }
                // Remove deprecated columns if present
                ['lic_key','lic_period'].forEach(k=> state.visibleCols.delete(k));
                // persist sanitized (and possibly migrated) version
                try { localStorage.setItem('system_visible_cols', JSON.stringify([...state.visibleCols])); } catch(_e){}
            } else {
                // Stored value was empty or invalid — fall back to defaults and persist
                state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
                try { localStorage.setItem('system_visible_cols', JSON.stringify([...state.visibleCols])); } catch(_e){}
            }
        } catch(e){}
    }

    // ---- Sort persistence ----
    function saveSortPreference(){
        try{
            if(state.sortKey){
                localStorage.setItem('system_sort_key', state.sortKey);
                localStorage.setItem('system_sort_dir', state.sortDir==='desc' ? 'desc' : 'asc');
            } else {
                localStorage.removeItem('system_sort_key');
                localStorage.removeItem('system_sort_dir');
            }
        }catch(e){}
    }
    function loadSortPreference(){
        try{
            const key = localStorage.getItem('system_sort_key');
            const dir = localStorage.getItem('system_sort_dir');
            if(key && COLUMN_META[key]){
                state.sortKey = key;
                state.sortDir = (dir === 'desc') ? 'desc' : 'asc';
            }
        }catch(e){}
    }

    function handleColumnFormApply(){
        const form = document.getElementById(COLUMN_FORM_ID); if(!form) return;
        const checked = [...form.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.value);
        // 최소 표시 컬럼 수 제한
        const MIN_COLS = 7;
        if(checked.length < MIN_COLS){
            showMessage(`최소 ${MIN_COLS}개 이상 선택해야 합니다.`, '안내');
            return;
        }
        state.visibleCols = new Set(checked);
        saveColumnSelection();
        applyColumnVisibility();
        closeModal(COLUMN_MODAL_ID);
    }

    function resetColumnSelection(){
        state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
        saveColumnSelection();
        buildColumnModal();
        applyColumnVisibility();
    }

    // Add / Edit
    function collectForm(form){
        const data={};
        form.querySelectorAll('input,select,textarea').forEach(el=>{ data[el.name]=el.value.trim(); });
        return data;
    }

    function fillEditForm(row){
        const form = document.getElementById(EDIT_FORM_ID); if(!form) return;
        form.innerHTML='';
        const groups = [
            { title:'소프트웨어', cols:['sw_type','sw_status','sw_vendor','sw_name','sw_version'] },
            { title:'담당자', cols:['sw_dept','sw_owner'] },
            { title:'점검', cols:['lic_type','lic_total','lic_assigned','lic_idle','lic_desc'] }
        ];
        groups.forEach(g=>{
            const section = document.createElement('div'); section.className='form-section';
            section.innerHTML = `<div class="section-header"><h4>${g.title}</h4></div>`;
            const grid = document.createElement('div'); grid.className='form-grid';
            g.cols.forEach(c=>{ if(!COLUMN_META[c]) return; const wrap=document.createElement('div');
                // Make only description field span full width; period stays in single column next to key
                wrap.className = (c === 'lic_desc') ? 'form-row form-row-wide' : 'form-row';
                const labelText = COLUMN_META[c]?.label||c;
                wrap.innerHTML=`<label>${labelText}</label>${generateFieldInput(c,row[c])}`; grid.appendChild(wrap); });
            section.appendChild(grid); form.appendChild(section);
        });
    }

    function generateFieldInput(col,value=''){
        // software selects/search-selects
        if(col==='sw_status'){
            const v = String(value??'');
            return `<select name="sw_status" class="form-input">
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="사용" ${v==='사용'?'selected':''}>사용</option>
                <option value="미사용" ${v==='미사용'?'selected':''}>미사용</option>
            </select>`;
        }
        if(col==='sw_type'){
            const v = String(value??'');
            return `<select name="sw_type" class="form-input">
                <option value="" ${v===''?'selected':''}>선택</option>
                <option value="상용" ${v==='상용'?'selected':''}>상용</option>
                <option value="오픈소스" ${v==='오픈소스'?'selected':''}>오픈소스</option>
            </select>`;
        }
        if(['sw_vendor','sw_name','sw_version','sw_dept','sw_owner'].includes(col)){
            // Align placeholder text with Add modal
            const ph = '검색 선택';
            return `<input name="${col}" class="form-input search-select" placeholder="${ph}" value="${value??''}">`;
        }
        // license selects
        if(col==='lic_type'){
            const v = String(value??'');
            const opts = ['', '임시', '영구구매(1회)', '서브스크립션(1년)', '서브스크립션(2년)', '서브스크립션(3년)', '서브스크립션(4년)', '서브스크립션(5년)'];
            // Render '선택' label for the blank option for clarity
            return `<select name="lic_type" class="form-input">${opts.map(o=>`<option value="${o}" ${o===v?'selected':''}>${o===''?'선택':o}</option>`).join('')}</select>`;
        }
        if(col==='lic_total') return `<input name="${col}" type="number" min="0" step="1" class="form-input" value="${value??''}" placeholder="숫자만">`;
        if(col==='lic_assigned') return `<input name="${col}" type="number" min="0" step="1" class="form-input" value="${value??''}" placeholder="자동 할당(상세 연동 예정)" readonly disabled>`;
        if(col==='lic_idle') return `<input name="${col}" type="number" min="0" step="1" class="form-input" value="${value??''}" placeholder="자동 계산" readonly disabled>`;
        // lic_key / lic_period removed
    if(col==='lic_desc') return `<textarea name="${col}" class="form-input textarea-large" rows="6">${value??''}</textarea>`;
        return `<input name="${col}" class="form-input" value="${value??''}">`;
    }

    // Live-sync helpers for license fields in Add/Edit forms
    function attachLicenseLiveSync(formId){
        const form = document.getElementById(formId);
        if(!form) return;
        if(form.dataset.licLiveSyncAttached === '1'){
            // already wired
            return;
        }
        const totalEl = form.querySelector('[name="lic_total"]');
        const assignedEl = form.querySelector('[name="lic_assigned"]');
        const idleEl = form.querySelector('[name="lic_idle"]');
    const startEl = form.querySelector('[name="lic_period_start"]');
    const endEl = form.querySelector('[name="lic_period_end"]');
    const hiddenPeriodEl = form.querySelector('[name="lic_period"]');

        function toInt(v){ const n = parseInt((v??'').toString(), 10); return isNaN(n) ? 0 : n; }
        function recomputeIdle(){
            if(!idleEl) return;
            const t = toInt(totalEl?.value);
            const a = toInt(assignedEl?.value);
            const idle = Math.max(0, t - a);
            idleEl.value = idle.toString();
        }
        function recomputePeriod(){ /* removed field */ }
        // Bind events (use 'input' for numbers for immediate feedback, 'change' for dates)
        totalEl?.addEventListener('input', recomputeIdle);
        assignedEl?.addEventListener('input', recomputeIdle);
        // lic_period removed
        // Initial compute on attach
        recomputeIdle();
        // recomputePeriod removed
        form.dataset.licLiveSyncAttached = '1';
    }

    function attachSecurityScoreRecalc(formId){
        const form=document.getElementById(formId); if(!form) return; const scoreInput=form.querySelector('input[name="security_score"]'); if(!scoreInput) return;
        function recompute(){
            const c=parseInt(form.querySelector('[name="confidentiality"]').value||'0',10)||0;
            const i=parseInt(form.querySelector('[name="integrity"]').value||'0',10)||0;
            const a=parseInt(form.querySelector('[name="availability"]').value||'0',10)||0;
            const total=c+i+a; scoreInput.value= total? total: '';
            // Optionally auto-pick system_grade
            const gradeField=form.querySelector('[name="system_grade"]'); if(gradeField){ if(total>=8) gradeField.value='1등급'; else if(total>=6) gradeField.value='2등급'; else if(total>0) gradeField.value='3등급'; }
        }
        ['confidentiality','integrity','availability'].forEach(n=> form.querySelector(`[name="${n}"]`)?.addEventListener('change',recompute));
        recompute();
    }
    // When virtualization is '가상', coerce specific fields to '-'
    function enforceVirtualizationDash(form){
        if(!form) return;
        const virt = form.querySelector('[name="virtualization"]');
        if(!virt) return;
        const v = String(virt.value || '').trim();
        const dashTargetsText = ['vendor','model','serial','location_pos'];
        const dashTargetsNumber = ['slot','u_size'];
        const makeDash = (el)=>{ if(!el) return; el.value='-'; };
        const clearIfDash = (el, fallbackType)=>{
            if(!el) return;
            if(el.value === '-') el.value = '';
            if(fallbackType){ try{ el.type = fallbackType; }catch(_){} }
        };
        if(v === '가상'){
            // text-like fields
            dashTargetsText.forEach(name=>{ const el=form.querySelector(`[name="${name}"]`); if(el) makeDash(el); });
            // number fields: switch to text to visibly show '-'
            dashTargetsNumber.forEach(name=>{
                const el=form.querySelector(`[name="${name}"]`);
                if(!el) return;
                // remember original type in dataset
                if(!el.dataset.origType){ el.dataset.origType = el.type || 'number'; }
                try{ el.type = 'text'; }catch(_e){}
                makeDash(el);
            });
        } else {
            // restore only if currently '-' so we don't wipe user inputs
            dashTargetsText.forEach(name=>{ const el=form.querySelector(`[name="${name}"]`); if(el) clearIfDash(el); });
            dashTargetsNumber.forEach(name=>{
                const el=form.querySelector(`[name="${name}"]`);
                if(!el) return;
                const orig = el.dataset.origType || 'number';
                clearIfDash(el, orig);
                // ensure numeric attributes exist when back to number
                if(el.type === 'number'){
                    el.min = '0'; el.step = '1';
                }
            });
        }
    }

    function attachVirtualizationHandler(formId){
        const form = document.getElementById(formId); if(!form) return;
        const virtSel = form.querySelector('[name="virtualization"]'); if(!virtSel) return;
        virtSel.addEventListener('change', ()=> enforceVirtualizationDash(form));
        // initial enforcement
        enforceVirtualizationDash(form);
    }

    function addRow(data){
        // 고유 id 부여
        data.id = state.nextId++;
        state.data.unshift(data); // 맨 앞 삽입
        applyFilter();
    }

    function updateRow(index,data){
        if(state.data[index]){ state.data[index] = {...state.data[index], ...data}; applyFilter(); }
    }

    function updateSortIndicators(){
        const thead = document.querySelector(`#${TABLE_ID} thead`); if(!thead) return;
        thead.querySelectorAll('th[data-col]').forEach(th=>{
            const col = th.getAttribute('data-col');
            if(col && col === state.sortKey){
                th.setAttribute('aria-sort', state.sortDir==='asc'?'ascending':'descending');
            } else {
                th.setAttribute('aria-sort','none');
            }
            // 필터 표시
            const cf = state.columnFilters[col];
            const filtActive = Array.isArray(cf)? cf.length>0 : (cf != null && cf !== '');
            th.classList.toggle('is-filtered', !!filtActive);
        });
    }

    function exportCSV(onlySelected){
        // Build header labels using only currently visible columns (plus sequence No)
        const headers = ['No', ...COLUMN_ORDER.filter(c=>state.visibleCols.has(c)).map(c=>COLUMN_META[c].label)];
        // Respect current sort order in export (same logic as render)
        let dataForCsv = state.filtered;
        if(state.sortKey){
            const k = state.sortKey; const dir = state.sortDir==='asc'?1:-1;
            dataForCsv = [...state.filtered].sort((a,b)=>{
                let va=a[k], vb=b[k];
                const na = va!=='' && va!=null && !isNaN(va);
                const nb = vb!=='' && vb!=null && !isNaN(vb);
                if(na && nb){ va=parseFloat(va); vb=parseFloat(vb);} else { va=(va==null?'':String(va)).toLowerCase(); vb=(vb==null?'':String(vb)).toLowerCase(); }
                if(va===vb) return 0;
                if(va==='' && vb!=='') return 1; if(vb==='' && va!=='') return -1; return va>vb?dir:-dir;
            });
        }
        // Apply selection scope if specified (modal drives this)
        if(onlySelected === true){
            const selIds = new Set(state.selected);
            dataForCsv = dataForCsv.filter(r=> selIds.has(r.id));
        } // else: all filtered rows
        const visibleCols = COLUMN_ORDER.filter(c=>state.visibleCols.has(c));
        const rows = dataForCsv.map((r,i)=> [i+1, ...visibleCols.map(c=> r[c]??'')]);
        // Escape and join with CRLF for better Windows Excel compatibility
        const lines = [headers, ...rows].map(arr=> arr.map(val=>`"${String(val).replace(/"/g,'""')}"`).join(','));
        const csvCore = lines.join('\r\n');
        // Prepend UTF-8 BOM so that Excel (especially on Windows) correctly detects encoding for Korean text
        const bom = '\uFEFF';
        const csv = bom + csvCore;
        // Dynamic filename: system_list_YYYYMMDD.csv (local date)
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth()+1).padStart(2,'0');
        const dd = String(d.getDate()).padStart(2,'0');
    const filename = `software_list_${yyyy}${mm}${dd}.csv`;
        const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a); // Safari support
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Event wiring
    let searchDebounceTimer = null;
    function bindEvents(){
        // 탭 (현재 1개지만 향후 확장 대비)
        document.querySelector('.system-tabs')?.addEventListener('click', e=>{
            const btn = e.target.closest('.system-tab-btn');
            if(!btn) return;
            const targetId = btn.getAttribute('data-tab');
            document.querySelectorAll('.system-tabs .system-tab-btn').forEach(b=> b.classList.toggle('active', b===btn));
            document.querySelectorAll('.tab-content .tab-pane').forEach(p=> p.classList.toggle('active', p.id===targetId));
        });
        const search = document.getElementById(SEARCH_ID);
        const searchWrapper = document.getElementById('system-search-wrapper');
        const searchLoader = document.getElementById('system-search-loader');
        const clearBtn = document.getElementById(SEARCH_CLEAR_ID);
        function updateClearVisibility(){ if(clearBtn){ clearBtn.classList.toggle('visible', !!search.value); } }
        if(search){
            search.addEventListener('input', e=>{
                state.search = e.target.value;
                updateClearVisibility();
                if(searchWrapper){ searchWrapper.classList.add('active-searching'); }
                if(searchLoader){ searchLoader.setAttribute('aria-hidden','false'); }
                if(searchDebounceTimer) clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(()=>{
                    applyFilter();
                    if(searchWrapper){ searchWrapper.classList.remove('active-searching'); }
                    if(searchLoader){ searchLoader.setAttribute('aria-hidden','true'); }
                }, 220); // debounce 220ms
            });
            search.addEventListener('keydown', e=>{
                if(e.key==='Escape'){
                    if(search.value){ search.value=''; state.search=''; updateClearVisibility(); applyFilter(); }
                    search.blur();
                }
            });
        }
        if(clearBtn){
            clearBtn.addEventListener('click', ()=>{
                if(search){ search.value=''; state.search=''; updateClearVisibility(); applyFilter(); search.focus(); }
            });
        }
        // global '/' focus shortcut (ignore when typing in inputs or modals open)
        document.addEventListener('keydown', e=>{
            if(e.key==='/' && !e.altKey && !e.ctrlKey && !e.metaKey){
                const activeTag = document.activeElement?.tagName.toLowerCase();
                if(['input','textarea','select'].includes(activeTag)) return; // already in a field
                const anyModalOpen = document.querySelector('.modal-open');
                if(anyModalOpen) return; // skip if modal open
                e.preventDefault();
                search?.focus();
            }
        });
        updateClearVisibility();
        const pageSizeSel = document.getElementById(PAGE_SIZE_ID);
        if(pageSizeSel){
            pageSizeSel.addEventListener('change', e=>{
                state.pageSize = parseInt(e.target.value,10)||10;
                try { localStorage.setItem('system_page_size', String(state.pageSize)); } catch(err){}
                state.page=1; render();
            });
        }
        document.getElementById(PAGE_NUMBERS_ID)?.addEventListener('click', e=>{ if(e.target.classList.contains('page-btn')){ state.page = parseInt(e.target.dataset.page,10); render(); }});
        ['system-first','system-prev','system-next','system-last'].forEach(id=>{
            const el = document.getElementById(id); if(!el) return; el.addEventListener('click', ()=>{
                const pages = totalPages();
                if(id==='system-first') state.page=1;
                else if(id==='system-prev' && state.page>1) state.page--;
                else if(id==='system-next' && state.page<pages) state.page++;
                else if(id==='system-last') state.page=pages;
                render();
            });
        });
        // select all
        const selectAll = document.getElementById(SELECT_ALL_ID);
        if(selectAll){ selectAll.addEventListener('change', e=>{
            const checked = e.target.checked;
            document.querySelectorAll(`#${TBODY_ID} tr`).forEach(tr=>{
                const cb = tr.querySelector('.system-row-select');
                if(!cb) return;
                cb.checked = checked;
                const id = parseInt(tr.getAttribute('data-id'),10);
                if(checked){
                    tr.classList.add('selected');
                    if(!isNaN(id)) state.selected.add(id);
                } else {
                    tr.classList.remove('selected');
                    if(!isNaN(id)) state.selected.delete(id);
                }
            });
        }); }
        // row edit delegation
        const tbodyEl = document.getElementById(TBODY_ID);
        tbodyEl?.addEventListener('click', e=>{
            const btn = e.target.closest('.action-btn');
            if(btn){
                const rid = parseInt(btn.getAttribute('data-id'),10);
                const realIndex = state.data.findIndex(r=>r.id===rid);
                if(realIndex===-1) return;
                const row = state.data[realIndex];
                const action = btn.getAttribute('data-action');
                if(action==='edit'){
                    fillEditForm(row);
                    openModal(EDIT_MODAL_ID);
                    // live-sync for license fields within edit form
                    attachLicenseLiveSync(EDIT_FORM_ID);
                    // enhance date inputs with Flatpickr
                    initDatePickers(EDIT_FORM_ID);
                    const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                    if(editSaveEl){ editSaveEl.setAttribute('data-index', realIndex); }
                }
                return; // 액션 버튼 클릭 처리 후 종료
            }
            // 행 내부 다른 영역 클릭 시 선택 토글 (체크박스/액션 영역 제외)
            if(e.target.closest('.system-actions')) return; // 관리 버튼 영역 제외
            const tr = e.target.closest('tr');
            if(!tr) return;
            const cb = tr.querySelector('.system-row-select');
            if(!cb) return;
            if(e.target.classList.contains('system-row-select')) return; // 체크박스 자체 클릭은 change 이벤트 처리
            cb.checked = !cb.checked;
            // change 이벤트 로직 재사용 위해 디스패치
            cb.dispatchEvent(new Event('change', {bubbles:true}));
        });
        // 컬럼 헤더 정렬 클릭
        const thead = document.querySelector(`#${TABLE_ID} thead`);
        if(thead){
            thead.querySelectorAll('th[data-col]').forEach(th=>{
                const col = th.getAttribute('data-col');
                if(col && col !== 'actions'){
                    th.classList.add('sortable');
                    th.setAttribute('aria-sort', 'none');
                }
            });
            thead.addEventListener('click', e=>{
                const th = e.target.closest('th[data-col]');
                if(!th) return;
                const col = th.getAttribute('data-col');
                if(!col || col==='actions') return;
                if(state.sortKey === col){
                    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    state.sortKey = col; state.sortDir = 'asc';
                }
                state.page = 1;
                saveSortPreference();
                render();
            });
            // (조건 필터 모달 제거됨) 우클릭: 기본 브라우저 메뉴 (정렬 방지 없음)
        }
        // 개별 행 선택 (체크박스) 변경 -> 강조 토글
        tbodyEl?.addEventListener('change', e=>{
            const cb = e.target.closest('.system-row-select');
            if(!cb) return;
            const tr = cb.closest('tr');
            const id = parseInt(cb.getAttribute('data-id')||tr.getAttribute('data-id'),10);
            if(cb.checked){
                tr.classList.add('selected');
                if(!isNaN(id)) state.selected.add(id);
            } else {
                tr.classList.remove('selected');
                if(!isNaN(id)) state.selected.delete(id);
            }
            // select-all 동기화
            if(selectAll){
                const all = document.querySelectorAll(`#${TBODY_ID} .system-row-select`);
                selectAll.checked = all.length>0 && [...all].every(x=>x.checked);
            }
        });
        // column modal
        document.getElementById(COLUMN_BTN_ID)?.addEventListener('click', ()=>{ buildColumnModal(); openModal(COLUMN_MODAL_ID); });
        document.getElementById(COLUMN_CLOSE_ID)?.addEventListener('click', ()=> closeModal(COLUMN_MODAL_ID));
    document.getElementById(COLUMN_APPLY_ID)?.addEventListener('click', handleColumnFormApply);
        document.getElementById(COLUMN_RESET_ID)?.addEventListener('click', resetColumnSelection);
        // 컬럼 전체 선택 (버튼)
        document.getElementById(COLUMN_SELECTALL_BTN_ID)?.addEventListener('click', ()=>{
            const form = document.getElementById(COLUMN_FORM_ID); if(!form) return;
            const boxes = [...form.querySelectorAll('input[type=checkbox]')];
            if(!boxes.length) return;
            // 항상 전체 선택만 수행 (전체 해제 제공하지 않음)
            boxes.forEach(box=>{
                box.checked = true;
                const label = box.closest('label.column-checkbox');
                if(label){ label.classList.add('is-active'); }
            });
            state.visibleCols = new Set(boxes.map(b=> b.value));
            saveColumnSelection();
            syncColumnSelectAll();
        });
        // toggle active style on click
        document.getElementById(COLUMN_FORM_ID)?.addEventListener('change', e=>{
            const label = e.target.closest('label.column-checkbox'); if(label){ label.classList.toggle('is-active', e.target.checked); }
            // 개별 체크 변경 시 select-all 상태 반영 및 state.visibleCols 동기화 지연 적용
            if(e.target.matches('input[type=checkbox]') && e.target.form?.id===COLUMN_FORM_ID){
                const form = document.getElementById(COLUMN_FORM_ID);
                const checkedCols = [...form.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.value);
                if(checkedCols.length){ state.visibleCols = new Set(checkedCols); saveColumnSelection(); }
                syncColumnSelectAll();
            }
        });
        // add modal
    document.getElementById(ADD_BTN_ID)?.addEventListener('click', ()=> { openModal(ADD_MODAL_ID); attachLicenseLiveSync(ADD_FORM_ID); initDatePickers(ADD_FORM_ID); });
        document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
        document.getElementById(ADD_SAVE_ID)?.addEventListener('click', ()=>{
            const form = document.getElementById(ADD_FORM_ID); if(!form.checkValidity()){ form.reportValidity(); return; }
            const data = collectForm(form);
            // compute lic_idle = total - assigned (non-negative)
            const total = parseInt(data.lic_total||'0',10)||0;
            const assigned = parseInt(data.lic_assigned||'0',10)||0;
            data.lic_idle = Math.max(0, total - assigned);
            addRow(data); form.reset(); closeModal(ADD_MODAL_ID); });
        // edit modal
    document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
        document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', ()=>{
            const form = document.getElementById(EDIT_FORM_ID);
            const indexEl = document.getElementById(EDIT_SAVE_ID);
            const index = parseInt(indexEl?.getAttribute('data-index')||'-1',10);
            const data = collectForm(form);
            const total = parseInt(data.lic_total||'0',10)||0;
            const assigned = parseInt(data.lic_assigned||'0',10)||0;
            data.lic_idle = Math.max(0, total - assigned);
            updateRow(index, data);
            closeModal(EDIT_MODAL_ID);
        });
        // csv
        // CSV download: open confirmation modal similar to delete/dispose
        const dlBtn = document.getElementById('system-download-btn');
        if(dlBtn){ dlBtn.addEventListener('click', ()=>{
            // prepare modal state
            const total = state.filtered.length || state.data.length;
            const selectedCount = state.selected.size;
            const subtitle = document.getElementById('download-subtitle');
            if(subtitle){
                subtitle.textContent = selectedCount > 0
                    ? `선택된 ${selectedCount}개 또는 전체 ${total}개 결과 중 범위를 선택하세요.`
                    : `현재 결과 ${total}개 항목을 CSV로 내보냅니다.`;
            }
            const rowSelected = document.getElementById('csv-range-row-selected');
            const optSelected = document.getElementById('csv-range-selected');
            const optAll = document.getElementById('csv-range-all');
            if(rowSelected){ rowSelected.hidden = !(selectedCount > 0); }
            if(optSelected){ optSelected.disabled = !(selectedCount > 0); optSelected.checked = selectedCount > 0; }
            if(optAll){ optAll.checked = !(selectedCount > 0); }
            openModal('system-download-modal');
        }); }
        document.getElementById('system-download-close')?.addEventListener('click', ()=> closeModal('system-download-modal'));
        document.getElementById('system-download-confirm')?.addEventListener('click', ()=>{
            const selectedOpt = document.getElementById('csv-range-selected');
            const onlySelected = !!(selectedOpt && selectedOpt.checked);
            exportCSV(onlySelected);
            closeModal('system-download-modal');
        });
        // upload modal
        document.getElementById(UPLOAD_BTN_ID)?.addEventListener('click', ()=>{
            // reset previous state
            const meta = document.getElementById(UPLOAD_META_ID); if(meta) meta.hidden = true;
            const chip = document.getElementById(UPLOAD_FILE_CHIP_ID); if(chip) chip.textContent = '';
            const input = document.getElementById(UPLOAD_INPUT_ID); if(input) input.value = '';
            const confirmBtn = document.getElementById(UPLOAD_CONFIRM_ID); if(confirmBtn) confirmBtn.disabled = true;
            openModal(UPLOAD_MODAL_ID);
            // Ensure animation is booted when modal opens
            initUploadAnim();
        });
    document.getElementById(UPLOAD_CLOSE_ID)?.addEventListener('click', ()=>{ try{ uploadAnim?.stop?.(); }catch(_){} closeModal(UPLOAD_MODAL_ID); });
        // dropzone interactions
        (function(){
            const dz = document.getElementById(UPLOAD_DROPZONE_ID);
            const input = document.getElementById(UPLOAD_INPUT_ID);
            const meta = document.getElementById(UPLOAD_META_ID);
            const chip = document.getElementById(UPLOAD_FILE_CHIP_ID);
            const confirmBtn = document.getElementById(UPLOAD_CONFIRM_ID);
            // inline select button and label removed in revised design
            if(!dz || !input) return;
            function accept(file){
                const name = (file?.name||'').toLowerCase();
                const okExt = name.endsWith('.xls') || name.endsWith('.xlsx');
                const okSize = (file?.size||0) <= 10*1024*1024; // 10MB
                return okExt && okSize;
            }
            function setFile(f){
                if(!f){ if(meta) meta.hidden=true; if(chip) chip.textContent=''; if(confirmBtn) confirmBtn.disabled=true; return; }
                if(!accept(f)){ showMessage('지원하지 않는 파일이거나 10MB를 초과합니다. .xls/.xlsx만 가능합니다.', '업로드 오류'); return; }
                const sizeKb = Math.max(1, Math.round(f.size/1024));
                if(chip) chip.textContent = `${f.name} (${sizeKb} KB)`;
                if(meta) meta.hidden = false;
                if(confirmBtn) confirmBtn.disabled = false;
            }
            dz.addEventListener('click', ()=> input.click());
            dz.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); input.click(); }});
            dz.addEventListener('dragover', (e)=>{ e.preventDefault(); dz.classList.add('dragover'); });
            dz.addEventListener('dragleave', ()=> dz.classList.remove('dragover'));
            dz.addEventListener('drop', (e)=>{
                e.preventDefault(); dz.classList.remove('dragover');
                const f = e.dataTransfer?.files?.[0]; if(f) { input.files = e.dataTransfer.files; setFile(f); }
            });
            input.addEventListener('change', ()=>{ const f = input.files?.[0]; setFile(f); });
            // Removed explicit remove button; user can reselect or cancel selection via file dialog
        })();
        // template download — provide an XLSX with Korean headers (no '보안 점수') matching expected upload
        document.getElementById(UPLOAD_TEMPLATE_BTN_ID)?.addEventListener('click', async ()=>{
            try{ await ensureXLSX(); }catch(_e){ showMessage('템플릿 생성을 위한 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.', '오류'); return; }
            try{
                const XLSX = window.XLSX;
                // Main template sheet: headers only (order enforced by validator)
                const wsTemplate = XLSX.utils.aoa_to_sheet([UPLOAD_HEADERS_KO]);
                // Set reasonable column widths
                wsTemplate['!cols'] = UPLOAD_HEADERS_KO.map((h)=>{
                        const wide = ['소프트웨어 이름','라이선스 설명'];
                        const mid = ['소프트웨어 구분','소프트웨어 제조사','소프트웨어 담당부서','소프트웨어 담당자'];
                        if(wide.includes(h)) return { wch: 20 };
                        if(mid.includes(h)) return { wch: 16 };
                        return { wch: 14 };
                    });

                // Guide sheet: rules and allowed values (Korean)
                const rules = [
                    ['엑셀 업로드 가이드'],
                    [''],
                    ['작성 규칙'],
                    ['- 첫 행의 컬럼 제목은 아래 순서와 완전히 일치해야 합니다. (순서/이름 변경 불가)'],
                    ['- "라이선스 전체수량", "라이선스 할당수량", "라이선스 유휴수량"은 숫자만 입력하세요.'],
                    ['- 그 외 항목은 자유롭게 입력하되, 필요 시 공란으로 둘 수 있습니다.'],
                    [''],
                    ['컬럼 순서 (복사/참고용)'],
                    [UPLOAD_HEADERS_KO.join(', ')],
                ];
                const wsGuide = XLSX.utils.aoa_to_sheet(rules);
                wsGuide['!cols'] = [{ wch: 120 }];

                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template');
                XLSX.utils.book_append_sheet(wb, wsGuide, '가이드');
                XLSX.writeFile(wb, 'software_upload_template.xlsx');
            }catch(e){ console.error(e); showMessage('템플릿 생성 중 오류가 발생했습니다.', '오류'); }
        });
        // confirm upload with parse + validation
        document.getElementById(UPLOAD_CONFIRM_ID)?.addEventListener('click', async ()=>{
            const input = document.getElementById(UPLOAD_INPUT_ID);
            const f = input?.files?.[0];
            if(!f){ showMessage('파일을 선택하세요.', '업로드 안내'); return; }
            try{
                await ensureXLSX();
            }catch(_e){ showMessage('엑셀 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.', '오류'); return; }
            const reader = new FileReader();
            reader.onload = ()=>{
                try{
                    const data = new Uint8Array(reader.result);
                    const wb = window.XLSX.read(data, {type:'array'});
                    const sheetName = wb.SheetNames[0]; if(!sheetName){ showMessage('엑셀 시트를 찾을 수 없습니다.', '업로드 오류'); return; }
                    const ws = wb.Sheets[sheetName];
                    const rows = window.XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
                    if(!rows || rows.length===0){ showMessage('엑셀 데이터가 비어있습니다.', '업로드 오류'); return; }
                    const header = rows[0].map(h=> String(h).trim());
                    // Header validation: exact match and order
                    if(header.length !== UPLOAD_HEADERS_KO.length || !header.every((h,i)=> h===UPLOAD_HEADERS_KO[i])){
                        // Special handling: if '보안 점수' 포함, 안내 메시지 추가
                        showMessage('업로드 실패: 컬럼 제목이 현재 테이블과 일치하지 않습니다.\n반드시 아래 순서로 작성하세요:\n- ' + UPLOAD_HEADERS_KO.join(', '), '업로드 실패');
                        return;
                    }
                    const errors = [];
                    const imported = [];
                    for(let r=1; r<rows.length; r++){
                        const row = rows[r]; if(isEmptyRow(row)) continue;
                        const rec = {};
                        for(let c=0; c<header.length; c++){
                            const label = header[c]; const key = HEADER_KO_TO_KEY[label];
                            rec[key] = String(row[c]??'').trim();
                        }
                        // Validation rules (software)
                        ['lic_total','lic_assigned','lic_idle'].forEach(k=>{
                            if(rec[k] !== '' && !isIntegerLike(rec[k])) errors.push(`Row ${r+1}: ${COLUMN_META[k]?.label||k}는 숫자만 입력하세요.`);
                        });
                        // Normalize numbers
                        rec.lic_total = toIntOrBlank(rec.lic_total);
                        rec.lic_assigned = toIntOrBlank(rec.lic_assigned);
                        rec.lic_idle = toIntOrBlank(rec.lic_idle);
                        imported.push(rec);
                    }
                    if(errors.length){
                        const preview = errors.slice(0, 20).join('\n');
                        const more = errors.length>20 ? `\n...외 ${errors.length-20}건` : '';
                        showMessage(`업로드 실패: 유효성 검사 오류가 있습니다.\n\n${preview}${more}`, '업로드 실패');
                        return;
                    }
                    // Import rows
                    imported.forEach(item=> addRow(item));
                    showMessage(`${imported.length}개 행이 업로드되었습니다.`, '업로드 완료');
                    closeModal(UPLOAD_MODAL_ID);
                }catch(e){ console.error(e); showMessage('엑셀 파싱 중 오류가 발생했습니다. 파일을 확인해주세요.', '업로드 오류'); }
            };
            reader.onerror = ()=> showMessage('파일을 읽는 중 오류가 발생했습니다.', '업로드 오류');
            reader.readAsArrayBuffer(f);
        });
        // stats open
        document.getElementById(STATS_BTN_ID)?.addEventListener('click', ()=>{
            buildStats();
            openModal(STATS_MODAL_ID);
            // align card heights after layout
            requestAnimationFrame(()=> equalizeStatsHeights());
            // keep aligned on resize while open
            window.addEventListener('resize', equalizeStatsHeights);
        });
        const closeStats = ()=>{
            closeModal(STATS_MODAL_ID);
            window.removeEventListener('resize', equalizeStatsHeights);
        };
        document.getElementById(STATS_CLOSE_ID)?.addEventListener('click', closeStats);
        document.getElementById(STATS_OK_ID)?.addEventListener('click', closeStats);
        // duplicate selected rows — open confirm modal first
        document.getElementById('system-duplicate-btn')?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('복제할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('duplicate-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 행을 복제합니다.`; }
            openModal('system-duplicate-modal');
        });
        document.getElementById('system-duplicate-close')?.addEventListener('click', ()=> closeModal('system-duplicate-modal'));
        document.getElementById('system-duplicate-confirm')?.addEventListener('click', ()=>{
            const originals = state.data.filter(r=> state.selected.has(r.id));
            if(!originals.length){ showMessage('선택된 행을 찾을 수 없습니다.', '오류'); closeModal('system-duplicate-modal'); return; }
            const clones = originals.map(o=>{
                const copy = {...o};
                delete copy.id; // new id assigned
                copy.sw_name = copy.sw_name ? copy.sw_name + '_COPY' : copy.sw_name;
                return copy;
            });
            clones.forEach(c=> addRow(c));
            closeModal('system-duplicate-modal');
            showMessage(clones.length + '개 행이 복제되었습니다.', '완료');
        });
        // dispose (불용처리)
        document.getElementById(DISPOSE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('불용처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('dispose-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 소프트웨어를 정말 불용처리하시겠습니까?`; }
            openModal(DISPOSE_MODAL_ID);
        });
    document.getElementById(DISPOSE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DISPOSE_MODAL_ID));
        document.getElementById(DISPOSE_CONFIRM_ID)?.addEventListener('click', ()=>{
            // 수집 대상 열: 시스템 제조사, 시스템 모델명, 시스템 일련번호, 시스템 가상화, 시스템 장소, 시스템 위치, 시스템 슬롯, 시스템 크기, 시스템 담당부서, 시스템 담당자
            const fields = ['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','sys_dept','sys_owner'];
            const selected = state.data.filter(r=> state.selected.has(r.id)).map(r=>{
                const obj = { id: r.id };
                fields.forEach(f=> obj[f] = r[f] ?? '');
                return obj;
            });
            try {
                sessionStorage.setItem('dispose_selected_rows', JSON.stringify(selected));
            } catch(_e){}
            closeModal(DISPOSE_MODAL_ID);
            // TODO: 불용자산 페이지로 이동 예정. 라우팅 결정 후 아래 location.href 수정.
            // window.location.href = '/app/templates/2.hardware/2-1.server/2-1-1.onpremise/disposal.html';
        });
        // delete (삭제처리)
        document.getElementById(DELETE_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('삭제처리할 행을 먼저 선택하세요.', '안내'); return; }
            const subtitle = document.getElementById('delete-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 소프트웨어를 정말 삭제처리하시겠습니까?`; }
            openModal(DELETE_MODAL_ID);
        });
        document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
        document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', ()=>{
            // 실제 삭제 수행: 선택된 id들을 데이터셋에서 제거
            const ids = new Set(state.selected);
            const before = state.data.length;
            if(ids.size === 0){ closeModal(DELETE_MODAL_ID); return; }
            state.data = state.data.filter(r => !ids.has(r.id));
            const removed = before - state.data.length;
            state.selected.clear();
            applyFilter();
            closeModal(DELETE_MODAL_ID);
            // 선택사항: 삭제 로그/사전 데이터 저장 (원하시면 유지)
            try {
                const fields = ['vendor','model','serial','virtualization','location_place','location_pos','slot','u_size','sys_dept','sys_owner'];
                const snapshot = (window.__lastDeletedRows = (window.__lastDeletedRows||[]));
                snapshot.push({
                    at: new Date().toISOString(),
                    rows: [...ids].map(id=>{
                        const r = { id };
                        fields.forEach(f=> r[f] = '');
                        return r;
                    })
                });
            } catch(_e){}
            // 사용자 피드백
            if(removed > 0){ setTimeout(()=> showMessage(`${removed}개 항목이 삭제되었습니다.`, '완료'), 0); }
        });
        // bulk (일괄변경): 1개 선택 시에는 수정 모달로 전환
        document.getElementById(BULK_BTN_ID)?.addEventListener('click', ()=>{
            const count = state.selected.size;
            if(count===0){ showMessage('일괄변경할 행을 먼저 선택하세요.', '안내'); return; }
            if(count===1){
                // 단일 선택 → 수정 모달 열기
                const [onlyId] = [...state.selected];
                const realIndex = state.data.findIndex(r=> r.id === onlyId);
                if(realIndex === -1){ showMessage('선택된 행을 찾을 수 없습니다.', '오류'); return; }
                const row = state.data[realIndex];
                fillEditForm(row);
                openModal(EDIT_MODAL_ID);
                attachLicenseLiveSync(EDIT_FORM_ID);
                initDatePickers(EDIT_FORM_ID);
                const editSaveEl = document.getElementById(EDIT_SAVE_ID);
                if(editSaveEl){ editSaveEl.setAttribute('data-index', realIndex); }
                return;
            }
            // 2개 이상 → 일괄변경 모달
            const subtitle = document.getElementById('bulk-subtitle');
            if(subtitle){ subtitle.textContent = `선택된 ${count}개의 소프트웨어에서 지정한 필드를 일괄 변경합니다.`; }
            buildBulkForm();
            openModal(BULK_MODAL_ID);
        });
        document.getElementById(BULK_CLOSE_ID)?.addEventListener('click', ()=> closeModal(BULK_MODAL_ID));
        document.getElementById(BULK_APPLY_ID)?.addEventListener('click', ()=>{
            const form = document.getElementById(BULK_FORM_ID); if(!form) return;
            const entries = [...form.querySelectorAll('[data-bulk-field]')]
                .map(el=>({ field: el.getAttribute('data-bulk-field'), value: el.value }))
                .filter(p=> p.value !== '');
            if(!entries.length){ showMessage('변경할 값을 1개 이상 입력하세요.', '안내'); return; }
            const ids = new Set(state.selected);
            // 적용: 현재 데이터에서 선택된 행들에만 입력된 필드를 덮어쓰기
            state.data = state.data.map(row=>{
                if(!ids.has(row.id)) return row;
                const updated = { ...row };
                entries.forEach(({field, value})=>{ updated[field] = value; });
                return updated;
            });
            applyFilter();
            closeModal(BULK_MODAL_ID);
            setTimeout(()=> showMessage(`${ids.size}개 항목에 일괄 변경이 적용되었습니다.`, '완료'), 0);
        });
        // esc close
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ [ADD_MODAL_ID,EDIT_MODAL_ID,COLUMN_MODAL_ID,DISPOSE_MODAL_ID,DELETE_MODAL_ID,BULK_MODAL_ID,UPLOAD_MODAL_ID,'system-download-modal','system-message-modal','system-duplicate-modal','task-clear-modal'].forEach(closeModal); }});
    // include stats modal in esc close
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ closeModal(STATS_MODAL_ID); }});

        // message modal bindings
        document.getElementById('system-message-close')?.addEventListener('click', ()=> closeModal('system-message-modal'));
        document.getElementById('system-message-ok')?.addEventListener('click', ()=> closeModal('system-message-modal'));

        // 비우기 modal bindings
        document.getElementById('task-clear-close')?.addEventListener('click', ()=> closeModal('task-clear-modal'));
        document.getElementById('task-clear-confirm')?.addEventListener('click', async ()=>{
            closeModal('task-clear-modal');
            const ids = _pendingClearIds || [];
            _pendingClearIds = [];
            if(!ids.length) return;
            try{
                await fetch('/api/wrk/reports/batch-clear', {
                    method:'POST',
                    headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ ids }),
                    credentials:'same-origin'
                });
            }catch(_e){}
            render();
            showMessage(`${ids.length}개 항목이 목록에서 비워졌습니다.`, '완료');
        });

    function buildBulkForm(){
        const form = document.getElementById(BULK_FORM_ID); if(!form) return;
        const EXCLUDE = new Set([]);
        function inputFor(col){
            if(col === 'sw_status'){
                return `<select class="form-input" data-bulk-field="sw_status">
                    <option value="">선택</option>
                    <option value="사용">사용</option>
                    <option value="미사용">미사용</option>
                </select>`;
            }
            if(col === 'lic_type'){
                const opts = ['', '임시', '영구구매(1회)', '서브스크립션(1년)', '서브스크립션(2년)', '서브스크립션(3년)', '서브스크립션(4년)', '서브스크립션(5년)'];
                return `<select class="form-input" data-bulk-field="lic_type">${opts.map(o=>`<option value="${o}">${o===''?'선택':o}</option>`).join('')}</select>`;
            }
            if(col === 'lic_total') return `<input type="number" min="0" step="1" class="form-input" data-bulk-field="lic_total" placeholder="숫자">`;
            // lic_assigned / lic_idle: 일괄변경에서는 표시/변경하지 않음
            // lic_key, lic_period removed
            if(col === 'lic_desc') return `<textarea class="form-input textarea-large" rows="6" data-bulk-field="lic_desc" placeholder="설명"></textarea>`;
            return `<input class="form-input" data-bulk-field="${col}" placeholder="값 입력">`;
        }
        const GROUPS = [
            { title:'소프트웨어', cols:['sw_type','sw_status','sw_vendor','sw_name','sw_version'] },
            { title:'담당자', cols:['sw_dept','sw_owner'] },
            // 점검: 수정 모달과 동일한 배치에서 할당/유휴 제외, 키/기간 제거
            { title:'점검', cols:['lic_type','lic_total','lic_desc'] }
        ];
        form.innerHTML = GROUPS.map(g=>{
            const fields = g.cols.filter(c=> !EXCLUDE.has(c));
            if(!fields.length) return '';
            const grid = fields.map(col=>{
                const meta = COLUMN_META[col]; if(!meta) return '';
                const wide = (col === 'lic_desc');
                return `<div class="${wide ? 'form-row form-row-wide' : 'form-row'}"><label>${meta.label}</label>${inputFor(col)}</div>`;
            }).join('');
            return `
                <div class="form-section">
                    <div class="section-header"><h4>${g.title}</h4></div>
                    <div class="form-grid">${grid}</div>
                </div>`;
        }).join('');
        // 수정 모달과 동일하게 날짜/계산 동기화 적용
        attachLicenseLiveSync(BULK_FORM_ID);
        initDatePickers(BULK_FORM_ID);
    }

    // ----- Stats helpers -----
    function renderStatBlock(containerId, title, dist, fixedOptions, opts){
        return window.blsStats.renderCard(containerId, title, dist, fixedOptions, opts);
    }
    function equalizeStatsHeights(){
        return window.blsStats.equalizeHeights(STATS_MODAL_ID);
    }
    function countBy(rows, key, fixedOptions){
        return window.blsStats.countBy(rows, key, fixedOptions);
    }

    function buildStats(){
        const swEl = document.getElementById('stats-software');
        const verEl = document.getElementById('stats-versions');
        const checkEl = document.getElementById('stats-check');
        if(swEl) swEl.innerHTML = '';
        if(verEl) verEl.innerHTML = '';
        if(checkEl) checkEl.innerHTML = '';
        // 대상 데이터: 현재 필터/정렬 적용 전부를 기준으로 통계 (state.filtered)
        const rows = state.filtered.length ? state.filtered : state.data;
        // 소프트웨어 섹션
    // 1) 소프트웨어 구분 분포
    renderStatBlock('stats-software', '소프트웨어 구분', countBy(rows, 'sw_type'));
    // 2) 소프트웨어 상태 분포
    renderStatBlock('stats-software', '소프트웨어 상태', countBy(rows, 'sw_status'));
    // 3) 소프트웨어 제조사 분포
        renderStatBlock('stats-software', '소프트웨어 제조사', countBy(rows, 'sw_vendor'));
    // 버전분포 섹션 — 소프트웨어 이름별 버전 분포 (동적)
        //    각 소프트웨어 이름(sw_name)에 대해 버전(sw_version) 분포 카드를 생성합니다.
        const nameGroups = rows.reduce((acc, r)=>{
            const name = (r.sw_name==null || String(r.sw_name).trim()==='') ? '-' : String(r.sw_name);
            if(name === '-') return acc; // 빈 이름 제외
            (acc[name] ||= []).push(r);
            return acc;
        }, {});
        // 안정적 정렬: 이름별 그룹을 항목 수 내림차순 → 이름 오름차순으로 정렬
        const orderedNames = Object.keys(nameGroups).sort((a,b)=>{
            const da = nameGroups[a].length; const db = nameGroups[b].length;
            if(db !== da) return db - da;
            return a.localeCompare(b, 'ko');
        });
        orderedNames.forEach(name=>{
            const groupRows = nameGroups[name];
            const dist = {};
            groupRows.forEach(r=>{
                const v = (r.sw_version==null || String(r.sw_version).trim()==='') ? '-' : String(r.sw_version);
                if(v === '-') return; // 빈 버전 제외
                dist[v] = (dist[v]||0)+1;
            });
            // 카드 제목 예: "Windows Server — 버전 분포"
            renderStatBlock('stats-versions', `${name} — 버전 분포`, dist);
        });
        // 점검 섹션
    // 5) 라이선스 방식 분포
        renderStatBlock('stats-check', '라이선스 방식', countBy(rows, 'lic_type'));
    }
    }

    // (조건 필터 관련 함수 제거됨)

    function init(){
        // Demo counter param parsing (e.g., ?demoCounter=1500 or ?demoCounter=1,500)
        try {
            const params = new URLSearchParams(window.location.search || '');
            const raw = params.get('demoCounter') || params.get('demo-counter');
            if(raw){
                const n = parseInt(String(raw).replace(/,/g,'').trim(), 10);
                if(Number.isFinite(n) && n >= 0){ DEMO_COUNTER = n; }
            } else if(window.location.hash){
                const m = window.location.hash.match(/demoCounter=([^&]+)/i) || window.location.hash.match(/demo-counter=([^&]+)/i);
                if(m && m[1]){
                    const n = parseInt(String(m[1]).replace(/,/g,'').trim(), 10);
                    if(Number.isFinite(n) && n >= 0){ DEMO_COUNTER = n; }
                }
            }
        } catch(_e){}
        loadColumnSelection();
        // Load persisted page size (allowed values only)
        try {
            const psRaw = localStorage.getItem('system_page_size');
            if(psRaw){
                const val = parseInt(psRaw,10);
                if([10,20,50,100].includes(val)){
                    state.pageSize = val;
                    const sel = document.getElementById(PAGE_SIZE_ID);
                    if(sel) sel.value = String(val);
                }
            }
        } catch(err){}
        // Load persisted sort (if any)
        loadSortPreference();
        initData();
        bindEvents();
        render();
        // Page adornments (animation + popover)
}
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


