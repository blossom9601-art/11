// groups.js - 역할 추가 모달 및 권한 토글 (extracted from HTML inline script)
(function(){
    console.log('[groups.js] version 1.0.14 loaded');
    function setup(){
        const addBtn = document.getElementById('system-add-btn');
        const modal = document.getElementById('system-add-modal');
        const closeBtn = document.getElementById('system-add-close');
        const form = document.getElementById('system-add-form');
        const roleInput = form ? form.querySelector('input[name="role_name"]') : null;
        const saveBtn = document.getElementById('system-add-save');
        const permGrid = document.getElementById('permissions-grid');
        // 사용자 선택/검색 기능 제거됨 (사용자 필드는 단순 메모 필드 유지)
        const usersInput = document.getElementById('role-users-input');
        const suggestBox = document.getElementById('role-user-suggestions');
        const selectedBox = document.getElementById('role-user-selected');
        const userIdsHidden = document.getElementById('role-user-ids');
        let debounceTimer = null;
        let suggestions = [];
        const selectedIds = new Set();

        // --- Suggestion Overlay Style (inject once) ---
        (function ensureOverlayStyle(){
            if(document.getElementById('role-user-suggest-style')) return;
            const st = document.createElement('style');
            st.id = 'role-user-suggest-style';
            st.textContent = `
            .suggest-overlay{background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.12);padding:4px;margin:0;max-height:240px;overflow-y:auto;font-size:13px;}
            .suggest-overlay.hidden{display:none !important;}
            .user-suggest-item{display:block;width:100%;text-align:left;background:#fff;border:1px solid transparent;border-radius:4px;padding:6px 10px;margin:2px 0;cursor:pointer;line-height:1.3;}
            .user-suggest-item .sub{display:block;font-size:11px;color:#64748b;margin-top:2px;}
            .user-suggest-item:hover{background:#f1f5f9;}
            .user-suggest-item.highlight{background:#eef2ff;border-color:#6366f1;}
            .user-suggest-item.selected{opacity:.45;cursor:not-allowed;}
            `; // user-chip styles now in system.css
            document.head.appendChild(st);
        })();

        function positionSuggestBox(){
            if(!suggestBox || !usersInput) return;
            // move to body for absolute overlay positioning
            if(suggestBox.parentElement !== document.body){
                suggestBox.classList.add('suggest-overlay');
                document.body.appendChild(suggestBox);
            }
            const rect = usersInput.getBoundingClientRect();
            suggestBox.style.position = 'absolute';
            suggestBox.style.left = (rect.left + window.scrollX) + 'px';
            suggestBox.style.top = (rect.bottom + window.scrollY) + 'px';
            suggestBox.style.width = rect.width + 'px';
            suggestBox.style.zIndex = '9999';
        }

        function openModal(){
            if(!modal) return;
            modal.classList.add('show');
            modal.style.display = 'flex'; // fallback ensure visible
            modal.removeAttribute('aria-hidden');
            if(roleInput) roleInput.focus();
            toggleSave();
        }
        function closeModal(){
            if(!modal) return;
            modal.classList.remove('show');
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden','true');
            if(form) form.reset();
            // reset permission buttons visual state
            if(permGrid){
                permGrid.querySelectorAll('.perm-btn.active').forEach(btn => btn.classList.remove('active'));
                permGrid.querySelectorAll('.perm-actions input[type="hidden"]').forEach(h => h.value = '0');
            }
            toggleSave();
            clearSuggestions();
            clearSelected();
        }
        function toggleSave(){
            if(!saveBtn) return;
            const ok = roleInput && roleInput.value.trim().length > 0;
            saveBtn.disabled = !ok;
        }
            function togglePerm(btn){
            const row = btn.closest('.perm-row');
            if(!row) return;
            const type = btn.dataset.type; // read | write
            const key = row.dataset.key; // dashboard...
            const hiddenName = `perm_${key}_${type}`;
            const hiddenInput = form ? form.querySelector(`input[name="${hiddenName}"]`) : null;
            const active = btn.classList.toggle('active');
            // 접근성: 상태 반영
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            if(hiddenInput) hiddenInput.value = active ? '1' : '0';
                // Row highlight removed (style reverted)
        }
        function bindPermEvents(){
            if(!permGrid) return;
            permGrid.querySelectorAll('.perm-btn').forEach(btn => {
                // 초기 aria-pressed 선언
                btn.setAttribute('aria-pressed','false');
                btn.addEventListener('click', () => togglePerm(btn));
            });
        }
        // 제거됨: 초기 interceptSubmit (중복 제출 방지)
        function interceptSubmit(){ /* deprecated */ }
        // --- 사용자 자동완성 로직 ---
        function searchUsers(q){
            if(!q){ clearSuggestions(); return; }
            const baseUrl = '/admin/auth/users/search?query=' + encodeURIComponent(q);
            const url = baseUrl + '&_ts=' + Date.now(); // cache busting
            // 1차 요청
            fetch(url, {credentials:'same-origin'})
              .then(r => {
                  const ct = r.headers.get('content-type') || '';
                  if(!r.ok){
                      throw new Error('HTTP ' + r.status);
                  }
                  if(!/json/i.test(ct)){
                      // HTML(<!DOCTYPE) 등 받으면 2차 재시도 유도
                      throw new Error('Non-JSON response ' + ct);
                  }
                  return r.json();
              })
              .then(data => handleSearchResult(q, data))
              .catch(err => {
                  console.warn('[role] user search primary failed:', err.message);
                  // 2차 재시도 (no-store + trailing slash 호환)
                  const retryUrl = baseUrl.replace(/\?/, '/?') + '&_retry=' + Date.now();
                  fetch(retryUrl, {credentials:'same-origin', cache:'no-store'})
                    .then(r => {
                        const ct = r.headers.get('content-type') || '';
                        if(!r.ok) throw new Error('HTTP ' + r.status);
                        if(!/json/i.test(ct)) throw new Error('Non-JSON response ' + ct);
                        return r.json();
                    })
                    .then(data => handleSearchResult(q, data))
                    .catch(err2 => {
                        console.error('[role] user search retry failed:', err2.message);
                        suggestions = [];
                        renderSearchError(err2);
                    });
              });
        }
        function handleSearchResult(q, data){
            if(data && data.error === 'unauthorized'){
                suggestions = []; renderUnauthorized(); return;
            }
            const list = (data && Array.isArray(data.users)) ? data.users : [];
            console.debug('[role] search users OK query=', q, 'tokens=', data?.tokens, 'count=', list.length);
            suggestions = list.slice(0,50);
            renderSuggestions();
        }
        function renderSearchError(err){
            if(!suggestBox) return;
            suggestBox.innerHTML = '';
            const box = document.createElement('div');
            box.className = 'user-suggest-item';
            box.style.background = '#fee2e2';
            box.style.borderColor = '#fca5a5';
            box.innerHTML = '검색 실패 (' + escapeHtml(err.message) + ')<br/>가능한 원인: 서버 재시작 필요 / 라우트 미배포 / 캐시된 오래된 JS';
            suggestBox.appendChild(box);
            suggestBox.hidden = false;
        }
        function renderUnauthorized(){
            if(!suggestBox) return;
            suggestBox.innerHTML = '<div class="user-suggest-item" style="background:#fee2e2;border-color:#fca5a5;">관리자 권한 필요 (role=admin/ADMIN/관리자)</div>';
            suggestBox.hidden = false;
        }
        function renderSuggestions(){
            if(!suggestBox) return;
            suggestBox.innerHTML = '';
            if(!suggestions.length){
                if(usersInput && usersInput.value.trim().length){
                    if(window.enableSuggestEmpty){
                        const wrap = document.createElement('div');
                        wrap.className = 'suggest-empty';
                                                wrap.innerHTML = `
                                                    <strong style="font-size:13px;">검색 결과 없음</strong>
                                                    <span style="font-size:12px;color:#475569;">일치하는 사용자가 없습니다.</span>
                                                `;
                        suggestBox.appendChild(wrap);
                        suggestBox.hidden = false;
                    } else {
                        const empty = document.createElement('div');
                        empty.className = 'user-suggest-item';
                        empty.style.background = '#f1f5f9';
                        empty.textContent = '검색 결과 없음';
                        suggestBox.appendChild(empty);
                        suggestBox.hidden = false;
                    }
                } else {
                    suggestBox.hidden = true;
                }
                return;
            }
            // 디버그 카운트 배지 업데이트 (존재 시)
            try {
                const dbg = document.getElementById('debug-users-count');
                if(dbg){ dbg.textContent = String(suggestions.length); }
            } catch(e){}
            // 이미 선택된 것은 제외 (중복 선택 방지)
            const filtered = suggestions.filter(u => !selectedIds.has(u.id));
            filtered.forEach(u => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'user-suggest-item';
                btn.dataset.id = u.id;
                const display = u.display || `${u.department || '-'} · ${u.name || '-'}`;
                btn.innerHTML = `<span class="main">${escapeHtml(display)} (${escapeHtml(u.emp_no)})</span><span class="sub">${escapeHtml(u.email || '')}</span>`;
                btn.addEventListener('click', () => toggleUser(u));
                suggestBox.appendChild(btn);
            });
            suggestBox.hidden = false;
            positionSuggestBox();
        }
        function selectUser(u){
            selectedIds.add(u.id);
            updateHidden();
            addChip(u);
            renderSuggestions();
        }
        function toggleUser(u){
            // 이미 선택된 경우: 중복 선택 비허용 (무시)
            if(selectedIds.has(u.id)) return;
            selectUser(u);
        }
        function addChip(u){
            // Table row version: columns 부서, 이름, 사번 + 삭제 아이콘
            if(!selectedBox) return;
            const thead = document.getElementById('role-user-thead');
            // 헤더 표시 조건: 첫 선택 직후 (선택 집합 크기 1)
            if(thead && selectedIds.size === 1){
                thead.classList.remove('hidden');
            }
            const tr = document.createElement('tr');
            tr.className = 'user-row';
            tr.dataset.id = u.id;
            const dept = u.department || '-';
            const name = u.name || '-';
            const emp = u.emp_no || '-';
            const mk = (txt) => { const td = document.createElement('td'); td.textContent = txt; return td; };
            tr.appendChild(mk(dept));
            tr.appendChild(mk(name));
            tr.appendChild(mk(emp));
            const tdRemove = document.createElement('td'); tdRemove.className='remove-cell';
            const btn = document.createElement('button'); btn.type='button'; btn.setAttribute('aria-label', dept + ' ' + name + ' 제거');
            const icon = document.createElement('img'); icon.src='/static/image/svg/list/free-icon-trash.svg'; icon.alt='삭제';
            btn.appendChild(icon);
            btn.addEventListener('click', () => removeChip(u.id, tr, true));
            tdRemove.appendChild(btn);
            tr.appendChild(tdRemove);
            selectedBox.appendChild(tr);
        }
        function removeChip(id, el, fromKeyboard){
            selectedIds.delete(id);
            updateHidden();
            if(el) {
                // focus previous row's remove button for accessibility
                const prevRow = el.previousElementSibling;
                const prevBtn = prevRow && prevRow.querySelector('.remove-cell button') ? prevRow.querySelector('.remove-cell button') : null;
                el.remove();
                if(fromKeyboard){
                    if(prevBtn){ prevBtn.focus(); }
                    else if(usersInput){ usersInput.focus(); }
                }
            }
            // 모든 행 제거 시 헤더 다시 숨김 (명확한 상태 표현)
            if(selectedIds.size === 0){
                const thead = document.getElementById('role-user-thead');
                if(thead && !thead.classList.contains('hidden')) thead.classList.add('hidden');
            }
            renderSuggestions();
        }
        function updateHidden(){
            if(userIdsHidden) userIdsHidden.value = Array.from(selectedIds).join(',');
        }
        function clearSuggestions(){ if(suggestBox){ suggestBox.innerHTML=''; suggestBox.hidden = true; } }
        function clearSelected(){ if(selectedBox){ selectedBox.innerHTML=''; selectedIds.clear(); updateHidden(); } }
        function escapeHtml(str){ return (str||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
        function bindUserInput(){
            if(!usersInput) return;
            usersInput.addEventListener('input', () => {
                const q = usersInput.value.trim();
                if(debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(()=> searchUsers(q), 250);
            });
            usersInput.addEventListener('blur', () => {
                // 약간 지연 후 닫기 (버튼 클릭 허용); overlay는 클릭 외 영역 클릭 시 닫힘
                setTimeout(()=>{ if(suggestBox) suggestBox.hidden = true; }, 180);
            });
            usersInput.addEventListener('focus', () => {
                if(suggestBox && suggestBox.childElementCount>0){
                    suggestBox.hidden = false;
                    positionSuggestBox();
                }
            });
            usersInput.addEventListener('keydown', (e) => {
                // 화살표 탐색
                if((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !suggestBox.hidden && suggestions.length){
                    e.preventDefault();
                    cycleHighlight(e.key === 'ArrowDown');
                    return;
                }
                if(e.key === 'Enter'){
                    if(suggestions.length){
                        e.preventDefault();
                        // 하이라이트된 항목이 있으면 그것, 없으면 첫번째
                        const items = suggestBox.querySelectorAll('.user-suggest-item');
                        let target = null;
                        if(highlightIndex >=0 && highlightIndex < items.length){
                            const id = parseInt(items[highlightIndex].dataset.id,10);
                            target = suggestions.find(s => s.id === id) || suggestions.find(s => !selectedIds.has(s.id));
                        } else {
                            target = suggestions.find(s => !selectedIds.has(s.id));
                        }
                        if(target) toggleUser(target);
                        // 입력 내용은 유지 (연속 검색 위해) - 필요 시 아래 줄 주석 해제
                        // usersInput.value = '';
                    }
                }
                if(e.key === 'Escape'){
                    clearSuggestions();
                }
            });
        }
        let highlightIndex = -1;
        function cycleHighlight(down){
            if(!suggestions.length) return;
            const items = suggestBox.querySelectorAll('.user-suggest-item');
            if(!items.length) return;
            highlightIndex = down ? (highlightIndex + 1) : (highlightIndex - 1);
            if(highlightIndex < 0) highlightIndex = items.length - 1;
            if(highlightIndex >= items.length) highlightIndex = 0;
            items.forEach((el,i)=>{
                el.classList.toggle('highlight', i === highlightIndex);
            });
        }
        // Event bindings
        if(addBtn) addBtn.addEventListener('click', openModal);
        if(closeBtn) closeBtn.addEventListener('click', closeModal);
        document.addEventListener('keydown', function(e){
            if(e.key === 'Escape' && modal && modal.classList.contains('show')) closeModal();
        });
        if(modal) modal.addEventListener('click', function(e){ if(e.target === modal) closeModal(); });
        if(roleInput) roleInput.addEventListener('input', toggleSave);
        bindPermEvents();
        // interceptSubmit 제거됨 (중복 전송 방지)
        bindUserInput();

        // --- 역할 목록 로드 및 테이블 렌더링 ---
        const tableBody = document.getElementById('group-table-body');
        const emptyBox = document.getElementById('group-empty');
        const countBadge = document.getElementById('group-count');
        const paginationInfo = document.getElementById('group-pagination-info');

        function permCell(read, write){
            if(read && write) return 'RW';
            if(read) return 'R';
            if(write) return 'W';
            return '-';
        }
        function buildRow(role){
            const tr = document.createElement('tr');
            tr.dataset.id = role.id;
            tr.dataset.roleName = role.name;
            const mk = (html) => { const td = document.createElement('td'); td.innerHTML = html; return td; };
            // select checkbox
            const cb = document.createElement('input'); cb.type='checkbox'; cb.className='row-select'; cb.setAttribute('aria-label', role.name + ' 선택');
            const tdSel = document.createElement('td'); tdSel.appendChild(cb); tr.appendChild(tdSel);
            tr.appendChild(mk(role.name));
            tr.appendChild(mk(role.description || '-'));
            tr.appendChild(mk(String(role.user_count||0)));
            const p = role.permissions;
            tr.appendChild(mk(permCell(p.dashboard.read, p.dashboard.write)));
            tr.appendChild(mk(permCell(p.hardware.read, p.hardware.write)));
            tr.appendChild(mk(permCell(p.software.read, p.software.write)));
            tr.appendChild(mk(permCell(p.governance.read, p.governance.write)));
            tr.appendChild(mk(permCell(p.datacenter.read, p.datacenter.write)));
            tr.appendChild(mk(permCell(p.cost.read, p.cost.write)));
            tr.appendChild(mk(permCell(p.project.read, p.project.write)));
            tr.appendChild(mk(permCell(p.category.read, p.category.write)));
            // actions placeholder
            tr.appendChild(mk('<span class="actions-placeholder">-</span>'));
            return tr;
        }
        function renderRoles(list){
            if(!tableBody) return;
            tableBody.innerHTML='';
            if(!list.length){
                if(emptyBox) emptyBox.style.display='flex';
            } else {
                if(emptyBox) emptyBox.style.display='none';
                list.forEach(r => tableBody.appendChild(buildRow(r)));
            }
            if(countBadge){ countBadge.dataset.count = String(list.length); countBadge.textContent = String(list.length); }
            if(paginationInfo){ paginationInfo.textContent = list.length + '개 역할'; }
        }
        function loadRoles(){
            const primary = '/admin/auth/groups/list?_ts=' + Date.now();
            const fallback = '/admin/auth/groups/list2?_ts=' + Date.now();
            fetch(primary, {credentials:'same-origin'})
              .then(r => {
                  if(r.status === 404){ throw new Error('PRIMARY_404'); }
                  const ct = r.headers.get('content-type')||'';
                  if(!r.ok) throw new Error('HTTP ' + r.status);
                  if(!/json/i.test(ct)) throw new Error('Unexpected content');
                  return r.json();
              })
              .then(data => {
                  if(data.error){ console.warn('roles list error', data.error); renderRoles([]); return; }
                  renderRoles(Array.isArray(data.roles)? data.roles : []);
              })
              .catch(err => {
                  if(err && /PRIMARY_404/.test(err.message)){
                      console.warn('[groups.js] primary list 404, trying fallback list2');
                      return fetch(fallback, {credentials:'same-origin'})
                        .then(r2 => {
                            const ct2 = r2.headers.get('content-type')||'';
                            if(!r2.ok) throw new Error('Fallback HTTP ' + r2.status);
                            if(!/json/i.test(ct2)) throw new Error('Fallback unexpected content');
                            return r2.json();
                        })
                        .then(data2 => {
                            if(data2.error){ console.warn('roles list2 error', data2.error); renderRoles([]); return; }
                            renderRoles(Array.isArray(data2.roles)? data2.roles : []);
                        })
                        .catch(err2 => {
                            console.error('역할 목록 로드 실패(폴백 포함)', err2.message);
                            renderRoles([]);
                        });
                  } else {
                      console.error('역할 목록 로드 실패', err.message);
                      renderRoles([]);
                  }
              });
        }
        // 새 역할 생성 후 즉시 추가
        function appendRoleRow(role){
            if(!tableBody || !role){ return; }
            const existing = tableBody.querySelector('tr[data-id="' + role.id + '"]');
            if(existing) return; // 중복 방지
            tableBody.appendChild(buildRow(role));
            // 빈 상태 제거 & 카운트 반영
            const rows = tableBody.querySelectorAll('tr').length;
            if(emptyBox) emptyBox.style.display = rows ? 'none' : 'flex';
            if(countBadge){ countBadge.dataset.count = String(rows); countBadge.textContent = String(rows); }
            if(paginationInfo){ paginationInfo.textContent = rows + '개 역할'; }
        }
        // 초기 로딩
        loadRoles();
        // 기존 interceptSubmit 내 성공 시 appendRoleRow 사용하도록 래핑 위해 override
        const origIntercept = interceptSubmit;
        // 재정의: 이미 위에서 호출했으므로 이벤트 제거 후 다시 바인딩
        form && form.removeEventListener && form.removeEventListener('submit', ()=>{});
        // 간단히 submit 핸들러 다시 붙임
        if(form){
            form.addEventListener('submit', function(e){
                const fd = new FormData(form);
                // --- 클라이언트 검증: role_name 필수 (브라우저 기본 required 는 fetch 사용시 우회되므로 수동 검사) ---
                const roleNameVal = roleInput ? roleInput.value.trim() : '';
                if(!roleNameVal){
                    e.preventDefault();
                    // 접근성 라이브 영역 + 시각적 강조
                    try {
                        const live = document.getElementById('group-status');
                        if(live){
                            live.textContent = '역할명은 필수입니다.';
                        }
                        if(roleInput){
                            roleInput.classList.add('input-error');
                            roleInput.setAttribute('aria-invalid','true');
                        }
                    } catch(_e){}
                    // 이미 오류이므로 서버 전송 중지
                    return;
                } else {
                    if(roleInput){
                        roleInput.classList.remove('input-error');
                        roleInput.removeAttribute('aria-invalid');
                    }
                }
                fetch(form.action, {method:'POST', body: fd, credentials:'same-origin'})
                  .then(r => r.json().then(data => ({ok:r.ok,data})) )
                  .then(res => {
                      if(res.ok && res.data && res.data.status==='ok'){
                          // 서버가 성공적으로 역할을 생성. 단순 append 대신 전체 목록 재로드하여 user_count 등 최신화
                          loadRoles();
                          // 접근성 라이브 영역 업데이트
                          try {
                              const live = document.getElementById('group-status');
                              if(live){
                                  live.textContent = '역할 '+ (res.data.role?.name || '') +' 생성됨';
                              }
                          } catch(_e){}
                          closeModal();
                      } else {
                          // validation 오류 등: 라이브 영역에 메시지 표출
                          try {
                              const live = document.getElementById('group-status');
                              if(live){
                                  const msg = (res.data && (res.data.message||res.data.error)) ? (res.data.message||res.data.error) : '역할 생성 실패';
                                  live.textContent = msg;
                              }
                              if(roleInput && (!res.data || res.data.error==='validation')){
                                  roleInput.classList.add('input-error');
                                  roleInput.setAttribute('aria-invalid','true');
                              }
                          } catch(_e){}
                          // 더 이상 폴백 전체 submit 하지 않음 (JSON 오류 페이지 노출 방지)
                      }
                  })
                  .catch(err=>{
                      try {
                          const live = document.getElementById('group-status');
                          if(live){ live.textContent = '네트워크 오류: ' + err.message; }
                      } catch(_e){}
                  });
                e.preventDefault();
            });
        }

        // ---- 선택/행 기능 추가 ----
        const selectAll = document.getElementById('group-select-all');
        const deleteBtn = document.getElementById('system-delete-btn');
        const bulkBtn = document.getElementById('system-bulk-btn');
        const statsBtn = document.getElementById('system-stats-btn');
        const columnBtn = document.getElementById('system-column-btn');
        const statsModal = document.getElementById('system-stats-modal');
        const statsUserGrid = document.getElementById('stats-user');
        const bulkModal = document.getElementById('system-bulk-modal');
        const bulkApply = document.getElementById('system-bulk-apply');
        const liveStatus = document.getElementById('group-status');

        // Removed custom style injection for selected rows to rely on shared system.css styles (.selected)
        // Column panel styles retained in system.css; ensure no legacy inline style element remains
        (function removeLegacyGroupExtraStyle(){
            const legacy = document.getElementById('group-extra-style');
            if(legacy) legacy.remove();
        })();

        function getAllRows(){ return Array.from((tableBody||document.createElement('tbody')).querySelectorAll('tr')); }
        function getSelectedRows(){ return getAllRows().filter(r => r.querySelector('.row-select')?.checked); }
        function updateSelectAllState(){
            const rows = getAllRows();
            const selected = getSelectedRows();
            if(selectAll){ selectAll.checked = (rows.length>0 && selected.length === rows.length); }
            // highlight rows
            rows.forEach(r => {
                const cb = r.querySelector('.row-select');
                if(cb && cb.checked){ r.classList.add('selected'); }
                else { r.classList.remove('selected'); }
            });
            if(liveStatus){ liveStatus.textContent = selected.length + '개 역할 선택됨'; }
        }
        function bindRowSelection(){
            if(!tableBody) return;
            tableBody.addEventListener('click', e => {
                const tr = e.target.closest('tr');
                if(!tr) return;
                // 클릭이 버튼/링크/체크박스 등 interactive 내부이면 무시
                if(e.target.tagName === 'INPUT' || e.target.closest('button') || e.target.closest('a')) return;
                const cb = tr.querySelector('.row-select');
                if(cb){ cb.checked = !cb.checked; updateSelectAllState(); }
            });
        }
        function bindSelectAll(){
            if(!selectAll) return;
            selectAll.addEventListener('change', () => {
                getAllRows().forEach(r => { const cb = r.querySelector('.row-select'); if(cb){ cb.checked = selectAll.checked; }});
                updateSelectAllState();
            });
        }

        // 삭제 처리 (역할명 기준)
        function deleteSelected(){
            const rows = getSelectedRows();
            if(!rows.length){ if(liveStatus) liveStatus.textContent='선택된 역할 없음'; return; }
            const names = rows.map(r => r.dataset.roleName).filter(Boolean);
            const fd = new FormData();
            fd.append('roles', names.join(','));
            fetch('/admin/auth/groups/delete', {method:'POST', body:fd, credentials:'same-origin'})
              .then(r => r.json().then(data => ({ok:r.ok,data})) )
              .then(res => {
                  if(res.ok && res.data && res.data.status==='ok'){
                      // 제거된 이름 기준으로 DOM 삭제
                      const delSet = new Set(res.data.deleted||[]);
                      getAllRows().forEach(r => { if(delSet.has(r.dataset.roleName)){ r.remove(); }});
                      updateSelectAllState();
                      loadRoles(); // 재조회로 user_count 등 동기화
                      if(liveStatus) liveStatus.textContent = '삭제 완료: '+ Array.from(delSet).join(', ');
                  } else {
                      if(liveStatus) liveStatus.textContent = '삭제 실패';
                  }
              })
              .catch(err => { if(liveStatus) liveStatus.textContent='삭제 오류:'+err.message; });
        }

        // Bulk 변경: 권한 일괄 적용 (RW 토글)
        function openBulk(){ if(bulkModal){ bulkModal.style.display='flex'; bulkModal.removeAttribute('aria-hidden'); renderBulkForm(); } }
        function closeBulk(){ if(bulkModal){ bulkModal.style.display='none'; bulkModal.setAttribute('aria-hidden','true'); } }
        function renderBulkForm(){
            const form = document.getElementById('system-bulk-form');
            if(!form) return;
            const selected = getSelectedRows();
            const count = selected.length;
            form.innerHTML = '';
            const info = document.createElement('p'); info.textContent = count + '개 역할에 권한 적용'; form.appendChild(info);
            const grid = document.createElement('div'); grid.className='bulk-perm-grid';
            const sections = ['dashboard','hardware','software','governance','datacenter','cost','project','category'];
            sections.forEach(sec => {
                const row = document.createElement('div'); row.className='bulk-perm-row';
                row.innerHTML = `<label>${sec}<select name="bulk_${sec}"><option value="noop">변경없음</option><option value="none">없음(-)</option><option value="r">읽기(R)</option><option value="rw">읽기/쓰기(RW)</option></select></label>`;
                grid.appendChild(row);
            });
            form.appendChild(grid);
            const apply = document.createElement('button'); apply.type='button'; apply.className='btn-primary'; apply.textContent='적용';
            apply.addEventListener('click', () => applyBulkPermissions(form));
            form.appendChild(apply);
        }
        function applyBulkPermissions(form){
            const selected = getSelectedRows();
            if(!selected.length){ if(liveStatus) liveStatus.textContent='선택 없음'; return; }
            const names = selected.map(r=>r.dataset.roleName);
            const sections = ['dashboard','hardware','software','governance','datacenter','cost','project','category'];
            // 각 역할에 대해 개별 /permissions 호출
            const tasks = [];
            sections.forEach(sec => {
                const val = form.querySelector(`select[name='bulk_${sec}']`)?.value;
                if(!val || val==='noop') return;
            });
            names.forEach(name => {
                const perms = {};
                sections.forEach(sec => {
                    const val = form.querySelector(`select[name='bulk_${sec}']`)?.value;
                    if(!val || val==='noop') return;
                    perms[sec] = {read:false, write:false};
                    if(val==='r'){ perms[sec].read=true; }
                    else if(val==='rw'){ perms[sec].read=true; perms[sec].write=true; }
                    else if(val==='none'){ /* keep false */ }
                });
                if(Object.keys(perms).length){
                    const fd = new FormData();
                    fd.append('role', name);
                    fd.append('permissions', JSON.stringify(perms));
                    tasks.push(fetch('/admin/auth/groups/permissions', {method:'POST', body:fd, credentials:'same-origin'})
                        .then(r=>r.json().then(data=>({ok:r.ok,data,name}))) );
                }
            });
            Promise.all(tasks).then(results => {
                const okNames = results.filter(r=>r.ok && r.data.status==='ok').map(r=>r.name);
                if(liveStatus) liveStatus.textContent = '권한 적용 완료: '+ okNames.join(', ');
                closeBulk();
                loadRoles();
            }).catch(err => { if(liveStatus) liveStatus.textContent='권한 적용 오류:'+err.message; });
        }

        // 통계: 선택된 역할 + 전체 역할 권한 요약
        function openStats(){ if(statsModal){ statsModal.style.display='flex'; statsModal.removeAttribute('aria-hidden'); renderStats(); } }
        function closeStats(){ if(statsModal){ statsModal.style.display='none'; statsModal.setAttribute('aria-hidden','true'); } }
        function renderStats(){
            if(!statsUserGrid) return;
            const rows = getAllRows();
            const sel = getSelectedRows();
            const sections = ['dashboard','hardware','software','governance','datacenter','cost','project','category'];
            const agg = {}; sections.forEach(s=> agg[s]={r:0,rw:0,none:0});
            rows.forEach(r => {
                const cells = r.querySelectorAll('td');
                // permission cells start at index 4 through 11
                sections.forEach((sec, i) => {
                    const text = cells[4+i]?.textContent.trim();
                    if(text==='RW') agg[sec].rw++; else if(text==='R') agg[sec].r++; else agg[sec].none++;
                });
            });
            statsUserGrid.innerHTML='';
            const make = (label,val) => { const div=document.createElement('div'); div.className='stat-item'; div.innerHTML=`<strong>${label}</strong><span>${val}</span>`; return div; };
            statsUserGrid.appendChild(make('총 역할 수', rows.length));
            statsUserGrid.appendChild(make('선택된 역할 수', sel.length));
            sections.forEach(sec => {
                const d = agg[sec];
                statsUserGrid.appendChild(make(sec, `RW:${d.rw} R:${d.r} -:${d.none}`));
            });
        }

        // 컬럼 선택 패널
        let columnPanel = null;
        function toggleColumnPanel(){
            if(columnPanel){ columnPanel.remove(); columnPanel=null; return; }
            columnPanel = document.createElement('div');
            columnPanel.id='group-column-panel';
            columnPanel.innerHTML = '<h4>컬럼 표시</h4>';
            const headers = Array.from(document.querySelectorAll('#group-table thead th'));
            headers.forEach((th, idx) => {
                if(idx===0) return; // select column always
                const label = th.textContent.trim();
                const id = 'col-toggle-'+idx;
                const wrap = document.createElement('label');
                const cb = document.createElement('input'); cb.type='checkbox'; cb.checked = th.style.display!=='none'; cb.dataset.colIndex=idx;
                cb.addEventListener('change', () => setColumnVisibility(idx, cb.checked));
                wrap.appendChild(cb); wrap.appendChild(document.createTextNode(label||('열 '+idx)));
                columnPanel.appendChild(wrap);
            });
            document.body.appendChild(columnPanel);
        }
        function setColumnVisibility(idx, show){
            const display = show ? '' : 'none';
            document.querySelectorAll('#group-table tr').forEach(tr => {
                const cells = tr.children; if(cells[idx]) cells[idx].style.display=display;
            });
        }

        // 버튼 바인딩
        if(deleteBtn) deleteBtn.addEventListener('click', deleteSelected);
        if(bulkBtn) bulkBtn.addEventListener('click', openBulk);
        if(statsBtn) statsBtn.addEventListener('click', openStats);
        if(columnBtn) columnBtn.addEventListener('click', toggleColumnPanel);
        document.addEventListener('click', e => { if(columnPanel && !columnPanel.contains(e.target) && e.target!==columnBtn){ toggleColumnPanel(); }});
        // ESC closes modals
        document.addEventListener('keydown', e => { if(e.key==='Escape'){ closeBulk(); closeStats(); }});
        bindRowSelection();
        bindSelectAll();
        // 초기 선택 상태 동기화 (목록 로드 후)
        const origLoad = loadRoles;
        loadRoles = function(){ origLoad(); setTimeout(updateSelectAllState, 300); };

        // 초기 한 번 호출 후 스타일 적용
        updateSelectAllState();
    }
    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();
