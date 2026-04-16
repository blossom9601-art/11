/* eslint-disable */
/**
 * 워크플로우 관리 (Manage) 탭 JS
 * - 내 워크플로우 테이블 표시
 * - CRUD, 벌크 삭제
 * - 편집 → 별도 에디터 페이지(/p/wf_designer_editor?id=<id>)로 이동
 */
(function(){
    'use strict';

    var API = '/api/wf-designs';
    var DELETE_MODAL_ID = 'system-delete-modal';
    var MESSAGE_MODAL_ID = 'system-message-modal';
    var page = 1;
    var perPage = 20;
    var selectedIds = [];

    // ── DOM refs ──
    var tbody    = document.getElementById('wfm-tbody');
    var emptyEl  = document.getElementById('wfm-empty');
    var countEl  = document.getElementById('wfm-count');
    var searchEl = document.getElementById('wfm-search');
    var pagEl    = document.getElementById('wfm-pagination');
    var checkAll = document.getElementById('wfm-check-all');
    var bulkBar  = document.getElementById('wfm-bulk-bar');
    var selCount = document.getElementById('wfm-sel-count');
    var bulkDel  = document.getElementById('wfm-bulk-delete');
    var createBtn = document.getElementById('wfm-create-btn');
    var firstBtn  = document.getElementById('wfm-create-first');
    var clearBtn  = document.getElementById('wfm-search-clear');
    var pageSizeEl = document.getElementById('wfm-page-size');
    var pagInfoEl  = document.getElementById('wfm-pagination-info');
    var pagFirst   = document.getElementById('wfm-first');
    var pagPrev    = document.getElementById('wfm-prev');
    var pagNext    = document.getElementById('wfm-next');
    var pagLast    = document.getElementById('wfm-last');
    var pagNumbers = document.getElementById('wfm-page-numbers');
    var deleteHeaderBtn = document.getElementById('wfm-delete-btn');

    // 생성 모달
    var modal      = document.getElementById('wfm-create-modal');
    var nameInput  = document.getElementById('wfm-name-input');
    var descInput  = document.getElementById('wfm-desc-input');
    var confirmBtn = document.getElementById('wfm-create-confirm');
    var cancelBtn  = document.getElementById('wfm-create-cancel');
    var closeBtn   = document.getElementById('wfm-create-close');

    // 삭제 모달 (공통)
    var delModal   = document.getElementById(DELETE_MODAL_ID);
    var delConfirm = document.getElementById('system-delete-confirm');
    var delCancel  = document.getElementById('system-delete-cancel');
    var delClose   = document.getElementById('system-delete-close');

    // 알림 모달 (공통)
    var msgModal   = document.getElementById(MESSAGE_MODAL_ID);
    var msgClose   = document.getElementById('system-message-close');
    var msgOk      = document.getElementById('system-message-ok');

    function esc(s){ var d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
    function statusLabel(s, shared){
        var dot, text;
        if(shared){
            dot = 'ws-run'; text = '공유';
        } else {
            dot = 'ws-idle'; text = '초안';
        }
        return '<span class="status-pill"><span class="status-dot '+dot+'" aria-hidden="true"></span><span class="status-text">'+text+'</span></span>';
    }
    function fmtDate(d){ return d ? d.substring(0,16).replace('T',' ') : '-'; }

    function openModal(modalId){
        var modal = document.getElementById(modalId);
        if(!modal) return;
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
    }

    function closeModal(modalId){
        var modal = document.getElementById(modalId);
        if(!modal) return;
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
    }

    function showMessageModal(title, message){
        var titleEl = document.getElementById('message-title');
        var contentEl = document.getElementById('message-content');
        if(titleEl) titleEl.textContent = title || '안내';
        if(contentEl) contentEl.textContent = message || '';
        openModal(MESSAGE_MODAL_ID);
    }

    // ── 로드 ──
    function load(){
        var search = (searchEl.value||'').trim();
        var qs = '?page='+page+'&per_page='+perPage+'&my_only=1';
        if(search) qs += '&search='+encodeURIComponent(search);

        fetch(API+qs, {credentials:'same-origin'})
        .then(function(r){ return r.json(); })
        .then(function(data){
            if(!data.success){
                console.error(data);
                if(countEl){ countEl.textContent = '0'; countEl.setAttribute('data-count', '0'); }
                var tw = document.getElementById('wfm-table-wrap');
                if(tw) tw.style.display='none';
                if(tbody) tbody.innerHTML='';
                if(emptyEl) emptyEl.style.display='';
                if(pagInfoEl) pagInfoEl.textContent = '0개 항목';
                if(pagNumbers) pagNumbers.innerHTML = '';
                if(bulkBar) bulkBar.style.display = 'none';
                return;
            }
            var rows = data.rows||[];
            var total = data.total||0;
            var prev = parseInt(countEl.getAttribute('data-count') || (countEl.textContent||'0').replace(/,/g,''), 10) || 0;
            countEl.textContent = String(total);
            countEl.setAttribute('data-count', String(total));
            countEl.classList.remove('large-number','very-large-number');
            if(total >= 1000) countEl.classList.add('very-large-number');
            else if(total >= 100) countEl.classList.add('large-number');
            if(prev !== total){
                countEl.classList.remove('is-updating');
                void countEl.offsetWidth;
                countEl.classList.add('is-updating');
            }

            if(!rows.length){
                document.getElementById('wfm-table-wrap').style.display='none';
                tbody.innerHTML='';
                emptyEl.style.display='';
                pagEl.innerHTML='';
                return;
            }
            document.getElementById('wfm-table-wrap').style.display='';
            emptyEl.style.display='none';

            var html = '';
            for(var i=0; i<rows.length; i++){
                var w = rows[i];
                html += '<tr data-id="'+esc(w.id)+'">';
                html += '<td><input type="checkbox" class="wfm-row-check" value="'+esc(w.id)+'"></td>';
                html += '<td class="wfm-name-cell"><a href="/p/wf_designer_editor?id='+esc(w.id)+'" class="wfm-name-link">'+esc(w.name)+'</a></td>';
                html += '<td>'+statusLabel(w.status, w.shared)+'</td>';
                html += '<td>v'+w.latest_version+'</td>';
                html += '<td style="text-align:center">'+(w.view_count||0)+'</td>';
                html += '<td>'+esc(w.owner_name||'')+'</td>';
                html += '<td>'+fmtDate(w.updated_at||w.created_at)+'</td>';
                html += '</tr>';
            }
            tbody.innerHTML = html;
            selectedIds = [];
            updateBulk();

            // 체크박스 + 행 선택 토글
            var checks = tbody.querySelectorAll('.wfm-row-check');
            for(var c=0; c<checks.length; c++){
                checks[c].addEventListener('change', function(){
                    var tr = this.closest('tr');
                    if(tr){ tr.classList.toggle('selected', this.checked); }
                    updateBulk();
                });
            }

            // 행 클릭 → 체크박스 토글 (링크/버튼 영역 제외)
            var trs = tbody.querySelectorAll('tr');
            for(var t=0; t<trs.length; t++){
                trs[t].addEventListener('click', function(ev){
                    if(ev.target.closest('a') || ev.target.closest('button') || ev.target.closest('input')) return;
                    var cb = this.querySelector('.wfm-row-check');
                    if(cb){ cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
                });
            }

            // 전체 선택체크박스
            var checkAll = document.getElementById('wfm-check-all');
            if(checkAll){
                checkAll.checked = false;
                checkAll.addEventListener('change', function(){
                    var all = tbody.querySelectorAll('.wfm-row-check');
                    for(var a=0; a<all.length; a++){
                        all[a].checked = checkAll.checked;
                        var tr = all[a].closest('tr');
                        if(tr) tr.classList.toggle('selected', checkAll.checked);
                    }
                    updateBulk();
                });
            }

            renderPagination(total);
        })
        .catch(function(e){
            console.error(e);
            if(countEl){ countEl.textContent = '0'; countEl.setAttribute('data-count', '0'); }
            var tw = document.getElementById('wfm-table-wrap');
            if(tw) tw.style.display='none';
            if(tbody) tbody.innerHTML='';
            if(emptyEl) emptyEl.style.display='';
            if(pagInfoEl) pagInfoEl.textContent = '0개 항목';
            if(pagNumbers) pagNumbers.innerHTML = '';
            if(bulkBar) bulkBar.style.display = 'none';
        });
    }

    function renderPagination(total){
        var totalPages = Math.ceil(total/perPage) || 1;
        // 페이지네이션 정보
        if(pagInfoEl){
            var from = total > 0 ? (page-1)*perPage+1 : 0;
            var to = Math.min(page*perPage, total);
            pagInfoEl.textContent = total > 0 ? from+'-'+to+' / '+total+'개 항목' : '0개 항목';
        }
        // first/prev/next/last
        if(pagFirst) pagFirst.disabled=(page<=1);
        if(pagPrev) pagPrev.disabled=(page<=1);
        if(pagNext) pagNext.disabled=(page>=totalPages);
        if(pagLast) pagLast.disabled=(page>=totalPages);
        // page numbers (항상 표시 — onpremise 동일)
        if(pagNumbers){
            pagNumbers.innerHTML='';
            for(var p=1; p<=totalPages && p<=50; p++){
                var btn = document.createElement('button');
                btn.className = 'page-btn'+(p===page?' active':'');
                btn.textContent = p;
                btn.setAttribute('data-page', p);
                pagNumbers.appendChild(btn);
            }
            pagNumbers.addEventListener('click', function(ev){
                var t = ev.target;
                if(t.classList.contains('page-btn')){
                    page = parseInt(t.getAttribute('data-page'), 10);
                    load();
                }
            });
        }
    }

    function updateBulk(){
        var checks = tbody.querySelectorAll('.wfm-row-check');
        selectedIds = [];
        for(var i=0;i<checks.length;i++){
            if(checks[i].checked) selectedIds.push(checks[i].value);
        }
        selCount.textContent = selectedIds.length;
        bulkBar.style.display = selectedIds.length ? '' : 'none';
    }

    // ── 즉시 생성 → 에디터 진입 (모달 없이) ──
    function quickCreate(){
        fetch(API,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({name:'제목 없는 워크플로우', description:''})
        }).then(function(r){return r.json();}).then(function(d){
            if(!d.success){alert(d.error||'실패');return;}
            blsSpaNavigate('/p/wf_designer_editor?id='+d.item.id);
        }).catch(function(e){alert('네트워크 오류');});
    }

    // ── 모달 (삭제) ──
    function openDelete(){
        if(!selectedIds.length){
            showMessageModal('안내', '삭제할 워크플로우를 먼저 선택하세요.');
            return;
        }
        if(!delModal) return;
        var sub = document.getElementById('delete-subtitle');
        if(sub) sub.textContent = '선택한 '+selectedIds.length+'개 워크플로우를 삭제하시겠습니까?';
        openModal(DELETE_MODAL_ID);
    }
    function closeDelete(){ closeModal(DELETE_MODAL_ID); }
    function doDelete(){
        if(!selectedIds.length) return;
        fetch(API+'/bulk-delete',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({ids:selectedIds})
        }).then(function(r){return r.json();}).then(function(d){
            closeDelete();
            load();
        }).catch(function(e){
            showMessageModal('오류', '네트워크 오류가 발생했습니다.');
        });
    }

    // ── 이벤트 ──
    searchEl.addEventListener('input', function(){ page=1; load(); });
    if(clearBtn) clearBtn.addEventListener('click', function(){ searchEl.value=''; page=1; load(); searchEl.focus(); });
    checkAll.addEventListener('change', function(){
        var checks=tbody.querySelectorAll('.wfm-row-check');
        for(var i=0;i<checks.length;i++) checks[i].checked=this.checked;
        updateBulk();
    });
    createBtn.addEventListener('click', quickCreate);
    if(firstBtn) firstBtn.addEventListener('click', quickCreate);
    bulkDel.addEventListener('click', openDelete);
    if(deleteHeaderBtn) deleteHeaderBtn.addEventListener('click', openDelete);
    if(delConfirm) delConfirm.addEventListener('click', doDelete);
    if(delCancel) delCancel.addEventListener('click', closeDelete);
    if(delClose) delClose.addEventListener('click', closeDelete);
    if(msgClose) msgClose.addEventListener('click', function(){ closeModal(MESSAGE_MODAL_ID); });
    if(msgOk) msgOk.addEventListener('click', function(){ closeModal(MESSAGE_MODAL_ID); });
    if(msgModal) msgModal.addEventListener('click', function(ev){
        if(ev.target === msgModal) closeModal(MESSAGE_MODAL_ID);
    });
    if(delModal) delModal.addEventListener('click', function(ev){
        if(ev.target === delModal) closeDelete();
    });
    if(pageSizeEl) pageSizeEl.addEventListener('change', function(){ perPage=parseInt(this.value); page=1; load(); });
    if(pagFirst) pagFirst.addEventListener('click', function(){ page=1; load(); });
    if(pagPrev) pagPrev.addEventListener('click', function(){ if(page>1){ page--; load(); } });
    if(pagNext) pagNext.addEventListener('click', function(){ page++; load(); });
    if(pagLast) pagLast.addEventListener('click', function(){ var tp=Math.ceil((parseInt(countEl.textContent)||0)/perPage); page=tp||1; load(); });

    load();

})();
