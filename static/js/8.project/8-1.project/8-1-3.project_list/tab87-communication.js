// tab87-communication.js — tab87: 의사소통관리 (Communication)
(function(){
  'use strict';
  window.__blsTabInits = window.__blsTabInits || {};
  window.__blsInitFlags = window.__blsInitFlags || {};
  function _boot(){
    var blsGetProjectId = window.blsGetProjectId;
    var blsFetchJson = window.blsFetchJson;

      window.__blsTabInits.tab87 = function(){
        var table = document.getElementById('cm-spec-table'); if(!table) return; // only on tab87
        if(window.__blsInitFlags.tab87_done) return; window.__blsInitFlags.tab87_done = true;
        var tbody = table.querySelector('tbody') || table.appendChild(document.createElement('tbody'));
        var emptyEl = document.getElementById('cm-empty');
        var tableWrap = table.closest('.table-wrap');
        var paginationEl = document.getElementById('cm-pagination');
        var pageSizeSel = document.getElementById('cm-page-size');
        var infoEl = document.getElementById('cm-pagination-info');
        var numsWrap = document.getElementById('cm-page-numbers');
        var btnFirst = document.getElementById('cm-first');
        var btnPrev = document.getElementById('cm-prev');
        var btnNext = document.getElementById('cm-next');
        var btnLast = document.getElementById('cm-last');
        var csvBtn = document.getElementById('cm-download-btn');
  var uploadBtn = document.getElementById('cm-upload-btn');
  var statsBtn = document.getElementById('cm-stats-btn');
  var commBtn = document.getElementById('cm-comm-btn');
        var selectAll = document.getElementById('cm-select-all');

        // DB hydrate/save (merge-safe)
        var cmTabClient = (window.__blsGetPrjTabClient ? window.__blsGetPrjTabClient() : null);
        var cmTabKey = 'communication';
        function cmCellRawOrText(td){
          try{ if(td && td.dataset && typeof td.dataset.raw === 'string') return String(td.dataset.raw||''); }catch(_){ }
          return String((td && td.textContent) || '');
        }
        function cmRowToData(tr){
          function t(col){ var td=tr.querySelector('[data-col="'+col+'"]'); return String((td && td.textContent) || '').trim(); }
          return { title:t('title'), date:t('date'), place:t('place'), type:t('type'), category:t('category'), author:(tr.getAttribute('data-author')||'').trim(), participants: (tr.getAttribute('data-participants')||'').trim(), main:(tr.getAttribute('data-main')||'').trim(), issue:(tr.getAttribute('data-issue')||'').trim(), comments: (function(){ try{ return JSON.parse(tr.getAttribute('data-comments')||'[]'); }catch(_){ return []; } })() };
        }
        function cmBuildSavedRow(data){
          var tr=document.createElement('tr');
          tr.innerHTML = ''+
            '<td><input type="checkbox" class="cm-row-check" aria-label="행 선택"></td>'+
            '<td data-col="title" class="cm-title-cell"></td>'+
            '<td data-col="date"></td>'+
            '<td data-col="place"></td>'+
            '<td data-col="type"></td>'+
            '<td data-col="category"></td>'+
            '<td data-col="participants" class="cm-participants-cell"></td>'+
            '<td class="system-actions table-actions">'+
              '<button class="action-btn js-cm-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'+
              '<button class="action-btn danger js-cm-del" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'+
            '</td>';
          function setText(col, val){ var td=tr.querySelector('[data-col="'+col+'"]'); if(!td) return; var v=String(val||'').trim(); td.textContent = v? v : '-'; }
          setText('title', data && data.title);
          setText('date', data && data.date);
          setText('place', data && data.place);
          setText('type', data && data.type);
          setText('category', data && data.category);
          var pStr = (data && data.participants) || ''; var pCount = pStr ? pStr.split(',').filter(function(s){ return s.trim(); }).length : 0;
          setText('participants', pCount > 0 ? pCount + '명' : '-');
          tr.setAttribute('data-author', (data && data.author) || '');
          tr.setAttribute('data-comments', JSON.stringify((data && data.comments) || []));
          tr.setAttribute('data-participants', pStr);
          tr.setAttribute('data-main', (data && data.main) || '');
          tr.setAttribute('data-issue', (data && data.issue) || '');
          return tr;
        }
        function cmSerializeAllRows(){
          try{ return savedAllRows().map(cmRowToData); }catch(_){ return []; }
        }
        function cmScheduleSave(){
          if(!cmTabClient) return;
          (window.__blsDebounce||function(){})('prj:tab:'+String(cmTabClient.projectId)+':'+cmTabKey, function(){
            try{ cmTabClient.saveMergedLatest(cmTabKey, { communication: { rows: cmSerializeAllRows() } }); }catch(_e){ }
          }, 800);
        }
        function cmHydrateFromPayload(payload){
          try{
            var rows = payload && payload.communication && payload.communication.rows;
            if(!Array.isArray(rows)) return;
            tbody.innerHTML='';
            rows.forEach(function(r){ tbody.appendChild(cmBuildSavedRow(r||{})); });
            state.page = 1;
            updateEmpty();
          }catch(_){ }
        }
        if(cmTabClient){
          cmTabClient.loadLatest(cmTabKey).then(function(item){
            try{ cmHydrateFromPayload(item && item.payload); }catch(_){ }
          });
        }

        // Type/Category definitions and helpers (cascading select)
        var CM_TYPES = ['보고','정기회의','특별회의','검토/승인','워크숍/세미나','비공식 커뮤니케이션'];
        var CM_CATEGORY_MAP = {
          '보고': ['착수 보고','진행 보고','완료 보고','이슈 보고','품질/리스크 보고'],
          '정기회의': ['주간 회의','월간 회의','분기 리뷰','운영 회의','프로젝트 운영위원회 회의'],
          '특별회의': ['착수 회의','종료 회의','긴급 회의','기술 검토 회의'],
          '검토/승인': ['설계 검토','산출물 검토','변경 승인 회의','품질 검토'],
          '워크숍/세미나': ['요구사항 워크숍','기술 세미나','벤더 미팅'],
          '비공식 커뮤니케이션': ['이메일 공지','1:1 미팅','브리핑/데일리 스탠드업']
        };
        function cmNormalizeTypeKey(v){ var s=String(v||'').trim(); if(s==='정기 회의') return '정기회의'; if(s==='특별 회의') return '특별회의'; return s; }
        function cmBuildTypeOptions(current){
          var cur = String(current||'').trim();
          var curN = cmNormalizeTypeKey(cur);
          var html = ['<option value=""'+(cur?'':' selected')+' disabled>선택</option>'];
          CM_TYPES.forEach(function(t){ var sel = (cur===t || cmNormalizeTypeKey(t)===curN) ? ' selected' : ''; html.push('<option value="'+t+'"'+sel+'>'+t+'</option>'); });
          return html.join('');
        }
        function cmBuildCategoryOptions(typeVal, current){
          var cur = String(current||'').trim();
          var key = cmNormalizeTypeKey(typeVal);
          var list = CM_CATEGORY_MAP[key] || [];
          var html = ['<option value=""'+(cur?'':' selected')+' disabled>선택</option>'];
          list.forEach(function(c){ html.push('<option value="'+c+'"'+(cur===c?' selected':'')+'>'+c+'</option>'); });
          return html.join('');
        }
        function cmWireTypeCategoryDependency(root){
          try{
            var typeSel = root.querySelector('td[data-col="type"] select');
            var catSel = root.querySelector('td[data-col="category"] select');
            if(!typeSel || !catSel) return;
            function markPlaceholder(sel){ try{ var v = (sel && sel.value) ? String(sel.value).trim() : ''; sel.classList.toggle('is-empty', v.length===0); }catch(_){ } }
            function apply(){
              var tv = typeSel.value || '';
              var prev = catSel.value || '';
              catSel.innerHTML = cmBuildCategoryOptions(tv, prev);
              var hasType = String(tv).trim().length>0;
              catSel.disabled = !hasType;
              markPlaceholder(typeSel);
              markPlaceholder(catSel);
            }
            typeSel.addEventListener('change', apply);
            catSel.addEventListener('change', function(){ markPlaceholder(catSel); });
            // initial populate
            apply();
          }catch(_){ }
        }

        function setEmpty(has){
          (window.__blsApplyEmptyState||function(){})({ has: has, emptyEl: emptyEl, tableWrap: tableWrap, paginationEl: paginationEl, useHidden: false });
          if(csvBtn){ try{ csvBtn.disabled = !has; csvBtn.setAttribute('aria-disabled', (!has).toString()); csvBtn.title = has? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.'; }catch(_){ } }
          if(pageSizeSel){ try{ pageSizeSel.disabled = !has; }catch(_){ } }
        }

        var state = { page:1, pageSize:10 };
        (function initPageSize(){
          try{
            var saved = localStorage.getItem('project:cm:pageSize');
            if(pageSizeSel){
              if(saved && ['10','20','50','100'].indexOf(saved)>-1){ state.pageSize=parseInt(saved,10); pageSizeSel.value=saved; }
              pageSizeSel.addEventListener('change', function(){ var v=parseInt(pageSizeSel.value,10); if(!isNaN(v)){ state.page=1; state.pageSize=v; localStorage.setItem('project:cm:pageSize', String(v)); renderPage(); } });
            }
          }catch(_){ }
        })();

        function rows(){ return Array.from(tbody.querySelectorAll('tr:not(.cm-edit-panel)')); }
        function total(){ return rows().length; }
        function pages(){ var t=total(); return Math.max(1, Math.ceil(t / state.pageSize)); }
        function clampPage(){ var p=pages(); if(state.page>p) state.page=p; if(state.page<1) state.page=1; }
        function updateUI(){
          if(infoEl){ var t=total(); var st = t? (state.page-1)*state.pageSize+1 : 0; var en=Math.min(t, state.page*state.pageSize); infoEl.textContent = st + '-' + en + ' / ' + t + '개 항목'; }
          if(numsWrap){ var p=pages(); numsWrap.innerHTML=''; for(var i=1;i<=p && i<=50;i++){ var b=document.createElement('button'); b.className='page-btn'+(i===state.page?' active':''); b.textContent=String(i); b.dataset.page=String(i); numsWrap.appendChild(b);} }
          var p2=pages(); if(btnFirst) btnFirst.disabled=(state.page===1); if(btnPrev) btnPrev.disabled=(state.page===1); if(btnNext) btnNext.disabled=(state.page===p2); if(btnLast) btnLast.disabled=(state.page===p2);
        }
        function renderPage(){
          clampPage();
          var rs = rows();
          var start=(state.page-1)*state.pageSize; var end=start + state.pageSize - 1;
          rs.forEach(function(tr, idx){ var vis = idx>=start && idx<=end; tr.style.display = vis? '' : 'none'; if(vis){ tr.removeAttribute('data-hidden'); } else { tr.setAttribute('data-hidden','1'); } var cb=tr.querySelector('.cm-row-check'); if(cb){ tr.classList.toggle('selected', !!cb.checked && vis); } var panel=tr.nextElementSibling; if(panel && panel.classList.contains('cm-edit-panel')){ panel.style.display = vis? '' : 'none'; } });
          updateUI();
          if(selectAll){ var visChecks = table.querySelectorAll('tbody tr:not([data-hidden]) .cm-row-check'); if(visChecks.length){ selectAll.checked = Array.prototype.every.call(visChecks, function(c){ return c.checked; }); } else { selectAll.checked=false; } }
        }
        function go(p){ state.page=p; renderPage(); }
        function goDelta(d){ go(state.page + d); }
        function goFirst(){ go(1); }
        function goLast(){ go(pages()); }
        if(numsWrap){ numsWrap.addEventListener('click', function(e){ var b=e.target.closest('button.page-btn'); if(!b) return; var p=parseInt(b.dataset.page,10); if(!isNaN(p)) go(p); }); }
        if(btnFirst) btnFirst.addEventListener('click', goFirst);
        if(btnPrev) btnPrev.addEventListener('click', function(){ goDelta(-1); });
        if(btnNext) btnNext.addEventListener('click', function(){ goDelta(1); });
        if(btnLast) btnLast.addEventListener('click', goLast);

        function updateEmpty(){ var has = !!tbody.querySelector('tr'); setEmpty(has); renderPage(); }

        // Select all (visible)
        if(selectAll){ selectAll.addEventListener('change', function(){ var checks = table.querySelectorAll('tbody tr:not([data-hidden]) .cm-row-check:not([disabled])'); checks.forEach(function(c){ c.checked = !!selectAll.checked; var tr=c.closest('tr'); if(tr){ tr.classList.toggle('selected', !!c.checked); } }); }); }
        // Row click toggles selection
        table.addEventListener('click', function(ev){ var isControl = ev.target.closest('button, a, input, select, textarea, label'); var onCheckbox = ev.target.closest('input[type="checkbox"].cm-row-check'); if(isControl && !onCheckbox) return; if(onCheckbox) return; var titleCell = ev.target.closest('.cm-title-cell'); if(titleCell && !titleCell.querySelector('input, textarea, select')) return; var tr = ev.target.closest('tr'); if(!tr || tr.parentNode.tagName.toLowerCase()!=='tbody') return; var hidden = tr.hasAttribute('data-hidden') || tr.style.display==='none'; if(hidden) return; var cb = tr.querySelector('.cm-row-check'); if(!cb || cb.disabled) return; cb.checked = !cb.checked; tr.classList.toggle('selected', cb.checked); if(selectAll){ var vis = table.querySelectorAll('tbody tr:not([data-hidden]) .cm-row-check'); if(vis.length){ selectAll.checked = Array.prototype.every.call(vis, function(c){ return c.checked; }); } }
        });
        table.addEventListener('change', function(ev){ var cb=ev.target.closest('.cm-row-check'); if(!cb) return; var tr=cb.closest('tr'); if(tr){ var hidden=tr.hasAttribute('data-hidden') || tr.style.display==='none'; tr.classList.toggle('selected', !!cb.checked && !hidden); } if(selectAll){ var vis=table.querySelectorAll('tbody tr:not([data-hidden]) .cm-row-check'); if(vis.length){ selectAll.checked = Array.prototype.every.call(vis, function(c){ return c.checked; }); } else { selectAll.checked=false; } } });

        function toRichHtml(text){
          try{
            var src = String(text||'');
            if(!src.trim()) return '<span>-</span>';
            // Normalize newlines
            src = src.replace(/\r\n?/g,'\n');
            var lines = src.split('\n');
            var out = [];
            var i = 0;
            function htmlEscape(s){
              return String(s||'')
                .replace(/&/g,'&amp;')
                .replace(/</g,'&lt;')
                .replace(/>/g,'&gt;')
                .replace(/"/g,'&quot;')
                .replace(/'/g,'&#39;');
            }
            function emitParagraph(buf){
              var t = buf.join(' ').trim();
              if(!t) return;
              out.push('<p>'+htmlEscape(t)+'</p>');
            }
            while(i < lines.length){
              var line = lines[i];
              // Skip pure blank lines (act as paragraph separators)
              if(/^\s*$/.test(line)){ i++; continue; }
              // Callout: lines starting with ※
              var mCall = /^\s*※\s*(.+)$/.exec(line);
              if(mCall){
                out.push('<div class="rq-note"><span class="rq-note-icon" aria-hidden="true">※</span><span class="rq-note-body">'+htmlEscape(mCall[1])+'</span></div>');
                i++; continue;
              }
              // Bulleted list: consecutive * or - lines
              var mBul = /^\s*([*-])\s+(.+)$/.exec(line);
              if(mBul){
                var items = [];
                while(i < lines.length){
                  var ln = lines[i];
                  var mm = /^\s*([*-])\s+(.+)$/.exec(ln);
                  if(!mm) break;
                  items.push('<li>'+htmlEscape(mm[2])+'</li>');
                  i++;
                }
                out.push('<ul>'+items.join('')+'</ul>');
                continue;
              }
              // Otherwise, collect paragraph until blank/bullet/callout
              var buf = [line]; i++;
              while(i < lines.length && !/^\s*$/.test(lines[i]) && !/^\s*([*-])\s+/.test(lines[i]) && !/^\s*※\s*/.test(lines[i])){
                buf.push(lines[i]); i++;
              }
              emitParagraph(buf);
            }
            return '<div class="rq-details-view">'+out.join('')+'</div>';
          }catch(_){ return '<span>-</span>'; }
        }
        function escapeHtml(str){ return String(str||'').replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt','"':'&quot;','\'':'&#39;'}[c]); }); }
        function escapeHtml(str){
          return String(str || '').replace(/[&<>"']/g, function(c){
            var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
            return map[c] || c;
          });
        }
        // ── Stakeholder name helpers (used by modal + inline edit) ──
        async function cmLoadStakeholderNames(){
          try{
            if(!cmTabClient) return [];
            var result = await cmTabClient.loadLatest('stakeholder');
            if(!result || !result.payload) return [];
            var rows = result.payload.rows;
            if(!Array.isArray(rows)) return [];
            var names = [], seen = {};
            rows.forEach(function(r){ var nm = String(r.name||'').trim(); if(nm && nm!=='-' && !seen[nm]){ seen[nm]=true; names.push(nm); } });
            return names;
          }catch(_){ return []; }
        }
        function cmBuildStakeholderOptions(names, current, placeholder){
          var cur = String(current||'').trim(); if(cur==='-') cur='';
          var html = '<option value="">'+(placeholder||'선택')+'</option>';
          (names||[]).forEach(function(nm){ html += '<option value="'+nm+'"'+(nm===cur?' selected':'')+'>'+nm+'</option>'; });
          return html;
        }

        // Communication create/edit modal wiring
        (function(){
          var modalId = 'cm-comm-modal';
          var openBtn = commBtn;
          var closeBtn = document.getElementById('cm-comm-close');
          var confirmBtn = document.getElementById('cm-comm-confirm');
          var formEl = document.getElementById('cm-comm-form');
          var titleInp = document.getElementById('cm-comm-title');
          var dateInp = document.getElementById('cm-comm-date');
          var placeInp = document.getElementById('cm-comm-place');
          var typeSel = document.getElementById('cm-comm-type');
          var catSel = document.getElementById('cm-comm-category');
          var participantsInp = document.getElementById('cm-comm-participants');
          var ptagsEl = document.getElementById('cm-comm-ptags');
          var ppickerEl = document.getElementById('cm-comm-ppicker');
          var mainTa = document.getElementById('cm-comm-main');
          var issueTa = document.getElementById('cm-comm-issue');
          var modalTitleEl = document.getElementById('cm-comm-modal-title');
          var modalSubtitleEl = document.getElementById('cm-comm-modal-subtitle');
          // Track edit mode: null = create, <tr> = editing row
          var editingTr = null;
          // ── Participants tag-input widget ──
          var cmPSelected = [];
          function cmPRender(){
            if(!ptagsEl) return;
            ptagsEl.innerHTML = cmPSelected.map(function(nm, i){
              return '<span class="cm-ptag">' + escapeHtml(nm) + '<button type="button" data-idx="'+i+'" class="cm-ptag-x" aria-label="제거">&times;</button></span>';
            }).join('');
            if(participantsInp) participantsInp.value = cmPSelected.join(', ');
          }
          if(ptagsEl){ ptagsEl.addEventListener('click', function(e){
            var btn = e.target.closest('.cm-ptag-x'); if(!btn) return;
            var idx = parseInt(btn.getAttribute('data-idx'), 10);
            if(!isNaN(idx) && idx >= 0 && idx < cmPSelected.length){ cmPSelected.splice(idx, 1); cmPRender(); }
          }); }
          if(ppickerEl){ ppickerEl.addEventListener('change', function(){
            var v = (ppickerEl.value || '').trim();
            if(v && cmPSelected.indexOf(v) === -1){ cmPSelected.push(v); cmPRender(); }
            ppickerEl.value = '';
            try{ if(window.BlossomSearchableSelect) window.BlossomSearchableSelect.syncAll(); }catch(_){}
          }); }
          function cmPSetNames(arr){ cmPSelected = (arr||[]).slice(); cmPRender(); }
          function cmPGetValue(){ return cmPSelected.join(', '); }
          function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
          function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
          function markPlaceholder(sel){ try{ var v=(sel&&sel.value)? String(sel.value).trim():''; sel.classList.toggle('is-empty', v.length===0); }catch(_){ } }
          function setupAutosize(el){ try{ if(!el) return; el.style.overflow='hidden';
              var lh = parseFloat(getComputedStyle(el).lineHeight) || 20; var minH = Math.max(lh*6, 120);
              el.style.minHeight = minH + 'px';
              function resize(){ el.style.height='auto'; el.style.height = Math.max(el.scrollHeight, minH) + 'px'; }
              el.addEventListener('input', resize);
              // initialize once
              setTimeout(resize, 0);
            }catch(_){ }
          }
          function resetForm(){ if(formEl){ formEl.reset(); }
            if(typeSel){ typeSel.innerHTML = cmBuildTypeOptions(''); markPlaceholder(typeSel); }
            if(catSel){ catSel.innerHTML = cmBuildCategoryOptions('', ''); catSel.disabled = true; markPlaceholder(catSel); }
            cmPSetNames([]);
            // Load stakeholder names for participants picker
            cmLoadStakeholderNames().then(function(names){
              if(ppickerEl) ppickerEl.innerHTML = cmBuildStakeholderOptions(names, '', '참여자 추가');
              try{ if(window.BlossomSearchableSelect){ window.BlossomSearchableSelect.enhance(formEl||document.getElementById(modalId)); } }catch(_){}
            }).catch(function(){});
            try{ if(window.__blsInitDatePickers){ window.__blsInitDatePickers(formEl||document.getElementById(modalId)); } }catch(_){ }
            try{ if(window.BlossomSearchableSelect){ window.BlossomSearchableSelect.enhance(formEl||document.getElementById(modalId)); } }catch(_){ }
            setupAutosize(mainTa); setupAutosize(issueTa);
          }
          function populateFormFromData(data){
            if(titleInp) titleInp.value = (data.title && data.title!=='-')? data.title : '';
            if(dateInp) dateInp.value = (data.date && data.date!=='-')? data.date : '';
            if(placeInp) placeInp.value = (data.place && data.place!=='-')? data.place : '';
            if(typeSel){ typeSel.innerHTML = cmBuildTypeOptions(data.type||''); markPlaceholder(typeSel); }
            if(catSel){ catSel.innerHTML = cmBuildCategoryOptions(data.type||'', data.category||''); catSel.disabled = !(data.type && data.type.length>0); markPlaceholder(catSel); }
            var parts = (data.participants||'').split(',').map(function(s){ return s.trim(); }).filter(function(s){ return s; });
            cmPSetNames(parts);
            cmLoadStakeholderNames().then(function(names){
              if(ppickerEl) ppickerEl.innerHTML = cmBuildStakeholderOptions(names, '', '참여자 추가');
              try{ if(window.BlossomSearchableSelect){ window.BlossomSearchableSelect.enhance(formEl||document.getElementById(modalId)); } }catch(_){}
            }).catch(function(){});
            if(mainTa) mainTa.value = data.main||'';
            if(issueTa) issueTa.value = data.issue||'';
            try{ if(window.__blsInitDatePickers){ window.__blsInitDatePickers(formEl||document.getElementById(modalId)); } }catch(_){ }
            try{ if(window.BlossomSearchableSelect){ window.BlossomSearchableSelect.enhance(formEl||document.getElementById(modalId)); } }catch(_){ }
            setupAutosize(mainTa); setupAutosize(issueTa);
          }
          function setModalMode(isEdit){
            if(modalTitleEl) modalTitleEl.textContent = isEdit ? '의사소통 수정' : '의사소통 등록';
            if(modalSubtitleEl) modalSubtitleEl.textContent = isEdit ? '선택된 의사소통 기록을 수정합니다.' : '새로운 의사소통 기록을 등록합니다.';
            if(confirmBtn) confirmBtn.textContent = isEdit ? '저장' : '등록';
          }
          function wireTypeCategory(){ if(!typeSel || !catSel) return; function apply(){ var tv=typeSel.value||''; var prev=catSel.value||''; catSel.innerHTML = cmBuildCategoryOptions(tv, prev); catSel.disabled = !(String(tv).trim().length>0); markPlaceholder(typeSel); markPlaceholder(catSel); try{ if(window.BlossomSearchableSelect){ window.BlossomSearchableSelect.enhance(formEl||document.getElementById(modalId)); } }catch(_){ } }
            typeSel.onchange = apply;
            catSel.onchange = function(){ markPlaceholder(catSel); };
            apply();
          }
          if(openBtn){ openBtn.addEventListener('click', function(){ editingTr = null; resetForm(); setModalMode(false); wireTypeCategory(); openModalLocal(modalId); try{ if(titleInp){ titleInp.focus(); } }catch(_){ } }); }
          if(closeBtn){ closeBtn.addEventListener('click', function(){ editingTr = null; closeModalLocal(modalId); }); }
          var modalEl = document.getElementById(modalId);
          if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl){ editingTr = null; closeModalLocal(modalId); } }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')){ editingTr = null; closeModalLocal(modalId); } }); }
          if(confirmBtn){ confirmBtn.addEventListener('click', function(){
            // Read values from modal form
            var data = {
              title: (titleInp && titleInp.value||'').trim(),
              date: (dateInp && dateInp.value||'').trim(),
              place: (placeInp && placeInp.value||'').trim(),
              type: (typeSel && typeSel.value||'').trim(),
              category: (catSel && catSel.value||'').trim(),
              author: (function(){ try{ var el=document.getElementById('cm-author-source'); var n=el?(el.getAttribute('data-name')||'').trim():''; if(!n){ var img=document.querySelector('#btn-account .header-avatar-icon'); n=img?(img.alt||'').trim():''; if(n==='계정') n=''; } return n; }catch(_){ return ''; } })(),
              participants: cmPGetValue(),
              main: (mainTa && mainTa.value||'').trim(),
              issue: (issueTa && issueTa.value||'').trim()
            };
            function applyDataToRow(tr){
              function setText(col, val){ var td=tr.querySelector('[data-col="'+col+'"]'); if(!td) return; td.textContent = (val && val.length)? val : '-'; }
              setText('title', data.title);
              setText('date', data.date);
              setText('place', data.place);
              setText('type', data.type);
              setText('category', data.category);
              var pStr = data.participants || ''; var pCount = pStr ? pStr.split(',').filter(function(s){ return s.trim(); }).length : 0;
              setText('participants', pCount > 0 ? pCount + '명' : '-');
              tr.setAttribute('data-author', data.author || '');
              tr.setAttribute('data-participants', pStr);
              tr.setAttribute('data-main', data.main || '');
              tr.setAttribute('data-issue', data.issue || '');
            }
            if(editingTr){
              // ── Edit mode: update existing row ──
              applyDataToRow(editingTr);
              editingTr = null;
            } else {
              // ── Create mode: append new row ──
              var tr=document.createElement('tr');
              tr.innerHTML = ''+
                '<td><input type="checkbox" class="cm-row-check" aria-label="행 선택"></td>'+
                '<td data-col="title" class="cm-title-cell"></td>'+
                '<td data-col="date"></td>'+
                '<td data-col="place"></td>'+
                '<td data-col="type"></td>'+
                '<td data-col="category"></td>'+
                '<td data-col="participants" class="cm-participants-cell"></td>'+
                '<td class="system-actions table-actions">'+
                  '<button class="action-btn js-cm-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'+
                  '<button class="action-btn danger js-cm-del" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'+
                '</td>';
              applyDataToRow(tr);
              tbody.appendChild(tr);
              updateEmpty();
              try{ goLast(); }catch(_){ }
            }
            closeModalLocal(modalId);
            cmScheduleSave();
          }); }
          // ── Expose openEditModal for table action delegate ──
          window.__cmOpenEditModal = function(tr){
            editingTr = tr;
            var data = cmRowToData(tr);
            resetForm();
            setModalMode(true);
            populateFormFromData(data);
            wireTypeCategory();
            openModalLocal(modalId);
            try{ if(titleInp){ titleInp.focus(); } }catch(_){ }
          };
        })();

        // Delegate actions
        table.addEventListener('click', function(ev){
          var target = ev.target.closest('.js-cm-del, .js-cm-toggle'); if(!target) return; var tr = ev.target.closest('tr'); if(!tr) return;
          if(target.classList.contains('js-cm-del')){
            if(tr.parentNode) tr.parentNode.removeChild(tr); clampPage(); updateEmpty(); cmScheduleSave(); return; }
          if(target.classList.contains('js-cm-toggle')){
            if(window.__cmOpenEditModal) window.__cmOpenEditModal(tr);
          }
        });

        // CSV helpers
        function rowSaved(tr){ return !!tr && !!tr.parentNode; }
        function visibleRows(){ return Array.from(tbody.querySelectorAll('tr:not(.cm-edit-panel)')).filter(function(tr){ return !(tr.hasAttribute('data-hidden') || tr.style.display==='none'); }); }
        function savedVisibleRows(){ return visibleRows().filter(rowSaved); }
  function savedAllRows(){ return Array.from(tbody.querySelectorAll('tr:not(.cm-edit-panel)')).filter(rowSaved); }
        function escCSV(v){ return '"' + String(v).replace(/"/g,'""') + '"'; }
        function textOf(tr, col){
          if(col==='main') return (tr.getAttribute('data-main')||'').trim();
          if(col==='issue') return (tr.getAttribute('data-issue')||'').trim();
          if(col==='participants_raw') return (tr.getAttribute('data-participants')||'').trim();
          var td=tr.querySelector('[data-col="'+col+'"]'); return td? (td.textContent||'').trim() : '';
        }
        function exportCSV(onlySelected){
          var headers=['제목','일자','장소','유형','구분','참여자','주요내용','이슈사항'];
          var trs = savedVisibleRows();
          if(onlySelected){ trs = trs.filter(function(tr){ var cb=tr.querySelector('.cm-row-check'); return cb && cb.checked; }); }
          if(trs.length===0) return;
          var cols=['title','date','place','type','category','participants_raw','main','issue'];
          var rows = trs.map(function(tr){ return cols.map(function(c){ return textOf(tr,c); }); });
          var lines = [headers].concat(rows).map(function(arr){ return arr.map(escCSV).join(','); });
          var csv='\uFEFF'+lines.join('\r\n');
          var d=new Date(); var yyyy=d.getFullYear(); var mm=String(d.getMonth()+1).padStart(2,'0'); var dd=String(d.getDate()).padStart(2,'0');
          var filename='communication_'+yyyy+mm+dd+'.csv';
          try{ var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }
          catch(_){ var a2=document.createElement('a'); a2.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a2.download=filename; document.body.appendChild(a2); a2.click(); document.body.removeChild(a2); }
        }
        // CSV modal wiring
        (function(){
          var modalId='cm-download-modal';
          var openBtn=csvBtn; var closeBtn=document.getElementById('cm-download-close'); var confirmBtn=document.getElementById('cm-download-confirm');
          function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
          function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
          if(openBtn){ openBtn.addEventListener('click', function(){ if(openBtn.disabled) return; var saved=savedVisibleRows(); var total=saved.length; if(total<=0) return; var selectedCount = saved.filter(function(tr){ var cb=tr.querySelector('.cm-row-check'); return cb && cb.checked; }).length; var subtitle=document.getElementById('cm-download-subtitle'); if(subtitle){ subtitle.textContent = selectedCount>0 ? ('선택된 '+selectedCount+'개 또는 전체 '+total+'개 결과 중 범위를 선택하세요.') : ('현재 결과 '+total+'개 항목을 CSV로 내보냅니다.'); } var rowSelectedWrap=document.getElementById('cm-csv-range-row-selected'); var optSelected=document.getElementById('cm-csv-range-selected'); var optAll=document.getElementById('cm-csv-range-all'); if(rowSelectedWrap) rowSelectedWrap.hidden = !(selectedCount>0); if(optSelected){ optSelected.disabled = !(selectedCount>0); optSelected.checked = selectedCount>0; } if(optAll){ optAll.checked = !(selectedCount>0); } openModalLocal(modalId); }); }
          if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); }
          var modalEl=document.getElementById(modalId);
          if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); }); }
          if(confirmBtn){ confirmBtn.addEventListener('click', function(){ var onlySel = !!(document.getElementById('cm-csv-range-selected') && document.getElementById('cm-csv-range-selected').checked); exportCSV(onlySel); closeModalLocal(modalId); }); }
        })();

        // Stats modal: 12-month stacked bars by type with smooth trendline and month labels
        (function(){
          var modalId = 'cm-stats-modal';
          var openBtn = statsBtn;
          var closeBtn = document.getElementById('cm-stats-close');
          var okBtn = document.getElementById('cm-stats-ok');
          var chartHost = document.getElementById('cm-stats-chart');
          var legendHost = document.getElementById('cm-stats-legend');
          var TYPE_LIST = CM_TYPES.slice();
          var TYPE_COLORS = {
            '보고': '#6366f1',
            '정기회의': '#22c55e',
            '특별회의': '#f59e0b',
            '검토/승인': '#06b6d4',
            '워크숍/세미나': '#ef4444',
            '비공식 커뮤니케이션': '#a855f7'
          };
          function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
          function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
          function parseDate(s){ var m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||'')); if(!m) return null; var d=new Date(+m[1], +m[2]-1, +m[3]); if(isNaN(d.getTime())) return null; return d; }
          // Month helpers
          function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
          function addMonths(d, n){ return new Date(d.getFullYear(), d.getMonth()+n, 1); }
          function monthKey(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,'0'); }
          function computeBins(){
            var now=new Date(); var start = addMonths(startOfMonth(now), -11); // 12 months window
            var months=[]; var map={};
            for(var i=0;i<12;i++){ var md=addMonths(start, i); var key=monthKey(md); months.push({date:md, key:key}); map[key] = { total:0 }; TYPE_LIST.forEach(function(t){ map[key][t]=0; }); }
            var rows = savedAllRows();
            rows.forEach(function(tr){ var ds = (tr.querySelector('[data-col=\"date\"]')||{}).textContent||''; ds=ds.trim(); var d=parseDate(ds); if(!d) return; var key=monthKey(d); if(!(key in map)) return; var type=(tr.querySelector('[data-col=\"type\"]')||{}).textContent||''; type=type.trim(); if(TYPE_LIST.indexOf(type)<0) type='기타'; if(!(type in map[key])) map[key][type]=0; map[key][type]++; map[key].total++; });
            return {months:months, dataMap:map};
          }
          function catmullRom2bezier(points){
            if(points.length<2) return '';
            var p = points.map(function(pt){ return [pt[0], pt[1]]; });
            var d = 'M'+p[0][0]+','+p[0][1];
            for(var i=0;i<p.length-1;i++){
              var p0 = i>0 ? p[i-1] : p[i];
              var p1 = p[i];
              var p2 = p[i+1];
              var p3 = i!=p.length-2 ? p[i+2] : p[i+1];
              var cp1x = p1[0] + (p2[0]-p0[0])/6, cp1y = p1[1] + (p2[1]-p0[1])/6;
              var cp2x = p2[0] - (p3[0]-p1[0])/6, cp2y = p2[1] - (p3[1]-p1[1])/6;
              d += ' C'+cp1x+','+cp1y+' '+cp2x+','+cp2y+' '+p2[0]+','+p2[1];
            }
            return d;
          }
          function movingAvg(arr, win){ var out=[]; for(var i=0;i<arr.length;i++){ var s=0,c=0; for(var k=i-win+1;k<=i;k++){ if(k>=0){ s+=arr[k]; c++; } } out.push(c? s/c : 0); } return out; }
          function render(){
            if(!chartHost) return;
            var rect = chartHost.getBoundingClientRect(); var W = Math.max(760, Math.floor(rect.width || 900)); var H = Math.max(300, Math.floor(rect.height || 380));
            chartHost.innerHTML='';
            var svg = document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox','0 0 '+W+' '+H);
            var pad = {l:48,r:16,t:16,b:40};
            var plotW = W - pad.l - pad.r; var plotH = H - pad.t - pad.b; var stackGap = 1;
            var bins = computeBins(); var months=bins.months; var map=bins.dataMap;
            var totals = months.map(function(m){ return (map[m.key]||{}).total||0; });
            // y-scale: ensure space for 10+ band
            var THRESH = 10;
            var maxTotal = Math.max.apply(null, totals.concat([0]));
            var maxY = Math.max(THRESH + 2, maxTotal); // at least leave room above 10
            var xStep = plotW / months.length; var barW = Math.max(8, (xStep-6)/2);
            // axes
            var gAxis = document.createElementNS(svg.namespaceURI,'g'); gAxis.setAttribute('fill','none'); gAxis.setAttribute('stroke','#e5e7eb'); gAxis.setAttribute('stroke-width','1');
            for(var y=0;y<=maxY;y+=Math.max(1, Math.ceil(maxY/5))){ var yy = pad.t + plotH - (y/maxY)*plotH; var line=document.createElementNS(svg.namespaceURI,'line'); line.setAttribute('x1', pad.l); line.setAttribute('y1', yy); line.setAttribute('x2', pad.l+plotW); line.setAttribute('y2', yy); gAxis.appendChild(line); }
            // dashed guide for 10 threshold
            (function(){
              var yy = pad.t + plotH - (THRESH/maxY)*plotH;
              var line = document.createElementNS(svg.namespaceURI,'line');
              line.setAttribute('x1', pad.l);
              line.setAttribute('y1', yy);
              line.setAttribute('x2', pad.l+plotW);
              line.setAttribute('y2', yy);
              line.setAttribute('stroke', '#d1d5db');
              line.setAttribute('stroke-dasharray', '4 3');
              gAxis.appendChild(line);
            })();
            svg.appendChild(gAxis);
            // y-axis categorical labels: "1~9" and "10+"
            (function(){
              var gY = document.createElementNS(svg.namespaceURI,'g');
              gY.setAttribute('fill', '#6b7280');
              gY.setAttribute('font-size', '11');
              function addLabel(text, yVal){
                var t = document.createElementNS(svg.namespaceURI,'text');
                t.textContent = text;
                t.setAttribute('x', pad.l - 6);
                t.setAttribute('y', pad.t + plotH - (yVal/maxY)*plotH);
                t.setAttribute('text-anchor', 'end');
                t.setAttribute('dominant-baseline', 'middle');
                gY.appendChild(t);
              }
              // center of 1~9 band and center of 10+ band
              var lowCenter = (1 + Math.min(THRESH-1, Math.max(1, THRESH-1))) / 2; // approx 1~9 -> ~5
              addLabel('1~9', lowCenter || 5);
              var highCenter = (THRESH + maxY) / 2;
              addLabel('10+', highCenter);
              svg.appendChild(gY);
            })();
            // stacked bars
            var gBars = document.createElementNS(svg.namespaceURI,'g');
            months.forEach(function(m,i){ var x = pad.l + i*xStep + (xStep - barW)/2; var accY = 0; TYPE_LIST.forEach(function(t){ var v = (map[m.key] && map[m.key][t]) || 0; if(!v) return; var h = (v/maxY)*plotH; var rectEl = document.createElementNS(svg.namespaceURI,'rect'); rectEl.setAttribute('x', x); rectEl.setAttribute('y', pad.t + plotH - (accY + v)/maxY*plotH ); rectEl.setAttribute('width', barW); rectEl.setAttribute('height', Math.max(0, h - stackGap)); rectEl.setAttribute('fill', TYPE_COLORS[t]||'#9ca3af'); rectEl.setAttribute('rx','2'); gBars.appendChild(rectEl); accY += v; }); });
            svg.appendChild(gBars);
            // trendline (3-month moving average of totals)
            var ma = movingAvg(totals, 3);
            var pts = ma.map(function(v,i){ var x = pad.l + i*xStep + xStep/2; var y = pad.t + plotH - (v/maxY)*plotH; return [x,y]; });
            var d = catmullRom2bezier(pts);
            var path=document.createElementNS(svg.namespaceURI,'path'); path.setAttribute('d', d); path.setAttribute('fill','none'); path.setAttribute('stroke','#111827'); path.setAttribute('stroke-width','1.25'); path.setAttribute('stroke-linecap','round'); path.setAttribute('opacity','0.65');
            svg.appendChild(path);
            // month labels
            var gLabels = document.createElementNS(svg.namespaceURI,'g'); gLabels.setAttribute('fill','#6b7280');
            months.forEach(function(m,i){ var x = pad.l + i*xStep + xStep/2; var txt=document.createElementNS(svg.namespaceURI,'text'); txt.setAttribute('x', x); txt.setAttribute('y', pad.t + plotH + 16); txt.setAttribute('text-anchor','middle'); txt.setAttribute('font-size','11'); var mm = (m.date.getMonth()+1); var yy = String(m.date.getFullYear()).slice(2); txt.textContent = (mm<10? '0'+mm:mm)+'월'; gLabels.appendChild(txt); });
            svg.appendChild(gLabels);
            // legend
            if(legendHost){ legendHost.innerHTML=''; TYPE_LIST.forEach(function(t){ var item=document.createElement('div'); item.className='lg-item'; var sw=document.createElement('span'); sw.className='lg-swatch'; sw.style.background=TYPE_COLORS[t]||'#9ca3af'; var tx=document.createElement('span'); tx.textContent=t; item.appendChild(sw); item.appendChild(tx); legendHost.appendChild(item); }); }
            chartHost.appendChild(svg);
          }
          if(openBtn){ openBtn.addEventListener('click', function(){ openModalLocal(modalId); setTimeout(render, 0); }); }
          if(okBtn){ okBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); }
          if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); }); }
          var modalEl=document.getElementById(modalId);
          if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); }); }
        })();

        // Upload modal wiring (CSV primary; XLSX optional if library present)
        (function(){
          var modalId='cm-upload-modal';
          var openBtn=uploadBtn; var closeBtn=document.getElementById('cm-upload-close'); var confirmBtn=document.getElementById('cm-upload-confirm');
          var drop=document.getElementById('cm-upload-dropzone'); var input=document.getElementById('cm-upload-input'); var meta=document.getElementById('cm-upload-meta'); var chip=document.getElementById('cm-upload-file-chip'); var tmplBtn=document.getElementById('cm-upload-template-download');
          var pickedFile=null;
          function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
          function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
          function setFile(file){ pickedFile=file||null; if(pickedFile){ if(meta) meta.hidden=false; if(chip){ chip.textContent = pickedFile.name; } if(confirmBtn){ confirmBtn.disabled=false; } } else { if(meta) meta.hidden=true; if(chip) chip.textContent=''; if(confirmBtn){ confirmBtn.disabled=true; } }
          }
          function parseCSV(text){ var lines = text.split(/\r?\n/).filter(function(l){ return l.trim().length>0; }); if(!lines.length) return []; var rows=lines.map(function(l){ var m=[]; var cur=''; var inQ=false; for(var i=0;i<l.length;i++){ var ch=l[i]; if(ch==='"'){ if(inQ && l[i+1]==='"'){ cur+='"'; i++; } else { inQ=!inQ; } } else if(ch===',' && !inQ){ m.push(cur); cur=''; } else { cur+=ch; } } m.push(cur); return m; }); return rows; }
          function addImportedRow(arr){
            var cols=['title','date','place','type','category','main','issue'];
            var data={}; cols.forEach(function(c,idx){ data[c]=String(arr[idx]||'').trim(); });
            var tr=document.createElement('tr');
            tr.innerHTML = '<td><input type="checkbox" class="cm-row-check" aria-label="행 선택"></td>'+
              '<td data-col="title" class="cm-title-cell"></td>'+
              '<td data-col="date"></td>'+
              '<td data-col="place"></td>'+
              '<td data-col="type"></td>'+
              '<td data-col="category"></td>'+
              '<td data-col="participants" class="cm-participants-cell"></td>'+
              '<td class="system-actions table-actions">'+
                '<button class="action-btn js-cm-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'+
                '<button class="action-btn danger js-cm-del" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'+
              '</td>';
            tr.querySelector('[data-col="title"]').textContent = data.title || '-';
            tr.querySelector('[data-col="date"]').textContent = data.date || '-';
            tr.querySelector('[data-col="place"]').textContent = data.place || '-';
            tr.querySelector('[data-col="type"]').textContent = data.type || '-';
            tr.querySelector('[data-col="category"]').textContent = data.category || '-';
            tr.querySelector('[data-col="participants"]').textContent = '-';
            tr.setAttribute('data-author', '');
            tr.setAttribute('data-participants', '');
            tr.setAttribute('data-main', data.main || '');
            tr.setAttribute('data-issue', data.issue || '');
            tbody.appendChild(tr);
          }
          function importFile(file){
            var name=(file&&file.name||'').toLowerCase();
            if(name.endsWith('.csv')){
              var fr=new FileReader(); fr.onload=function(){ try{ var rows=parseCSV(String(fr.result||'')); if(!rows.length) return; // assume first row is header when matches expected length
                var body = rows; var header = rows[0]||[]; var expected=['제목','일자','장소','유형','구분','주요내용','이슈사항'];
                if(header.length>=7 && expected.every(function(h,idx){ return (header[idx]||'').indexOf(h)>-1; })){ body = rows.slice(1); }
                body.forEach(function(r){ if(!r || r.length<1) return; // pad to 7
                  var arr=Array.from({length:7}, function(_,i){ return r[i]||''; }); addImportedRow(arr); }); updateEmpty(); goLast(); }catch(_){ }
              }; fr.readAsText(file, 'utf-8'); return;
            }
            if((name.endsWith('.xlsx') || name.endsWith('.xls')) && window.XLSX){
              var fr2=new FileReader(); fr2.onload=function(e){ try{ var data=new Uint8Array(e.target.result); var wb=window.XLSX.read(data,{type:'array'}); var ws=wb.Sheets[wb.SheetNames[0]]; var json=window.XLSX.utils.sheet_to_json(ws,{header:1}); if(!json || !json.length) return; var rows=json; var expected=['제목','일자','장소','유형','구분','주요내용','이슈사항']; var body=rows; var header=rows[0]||[]; if(header.length>=7 && expected.every(function(h,idx){ return (header[idx]||'').toString().indexOf(h)>-1; })){ body=rows.slice(1); } body.forEach(function(r){ var arr=Array.from({length:7}, function(_,i){ return (r[i]==null?'':r[i]); }); addImportedRow(arr); }); updateEmpty(); goLast(); }catch(_){ }
              }; fr2.readAsArrayBuffer(file); return;
            }
            try{ alert('지원하지 않는 파일 형식입니다. CSV를 사용하거나 XLSX 라이브러리를 로드해주세요.'); }catch(_a){ console.warn('Unsupported file.'); }
          }
          if(openBtn){ openBtn.addEventListener('click', function(){ openModalLocal(modalId); }); }
          if(closeBtn){ closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); setFile(null); if(input) input.value=''; }); }
          var modalEl=document.getElementById(modalId);
          if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl){ closeModalLocal(modalId); setFile(null); if(input) input.value=''; } }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')){ closeModalLocal(modalId); setFile(null); if(input) input.value=''; } }); }
          if(drop){ drop.addEventListener('click', function(){ if(input) input.click(); }); ['dragenter','dragover'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); drop.classList.add('dragover'); }); }); ['dragleave','drop'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); drop.classList.remove('dragover'); if(ev==='drop'){ var dt=e.dataTransfer; if(dt && dt.files && dt.files[0]){ setFile(dt.files[0]); } } }); }); }
          if(input){ input.addEventListener('change', function(){ var f=this.files && this.files[0]; setFile(f||null); }); }
          if(confirmBtn){ confirmBtn.addEventListener('click', function(){ if(!pickedFile) return; importFile(pickedFile); closeModalLocal(modalId); setFile(null); if(input) input.value=''; }); }
          if(tmplBtn){ tmplBtn.addEventListener('click', function(){ var headers=['제목','일자','장소','유형','구분','주요내용','이슈사항']; var csv='\uFEFF'+headers.join(',')+'\r\n'; var a=document.createElement('a'); try{ var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); var url=URL.createObjectURL(blob); a.href=url; a.download='communication_template.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }catch(_){ a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download='communication_template.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a); } }); }
        })();

        // ── Detail modal: click title to view meeting details ──
        (function(){
          var modalId = 'cm-detail-modal';
          var titleEl = document.getElementById('cm-detail-title');
          var subtitleEl = document.getElementById('cm-detail-subtitle');
          var metaEl = document.getElementById('cm-detail-meta');
          var mainEl = document.getElementById('cm-detail-main');
          var issueEl = document.getElementById('cm-detail-issue');
          var participantsEl = document.getElementById('cm-detail-participants');
          var mainSection = document.getElementById('cm-detail-main-section');
          var issueSection = document.getElementById('cm-detail-issue-section');
          var participantsSection = document.getElementById('cm-detail-participants-section');
          var closeBtn = document.getElementById('cm-detail-close');
          var commentListEl = document.getElementById('cm-detail-comments-list');
          var commentForm = document.getElementById('cm-comment-form');
          var commentInput = document.getElementById('cm-comment-input');
          var activeTr = null;
          function openModalLocal(id){ var el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
          function closeModalLocal(id){ var el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show')){ document.body.classList.remove('modal-open'); } }
          function getAuthorName(){ try{ var el=document.getElementById('cm-author-source'); var n=el?(el.getAttribute('data-name')||'').trim():''; if(!n){ var img=document.querySelector('#btn-account .header-avatar-icon'); n=img?(img.alt||'').trim():''; if(n==='계정') n=''; } return n||'ADMIN'; }catch(_){ return 'ADMIN'; } }
          function getAvatarSrc(){ try{ var img=document.querySelector('#btn-account .header-avatar-icon'); return img?img.src:'/static/image/svg/free-sticker-profile.svg'; }catch(_){ return '/static/image/svg/free-sticker-profile.svg'; } }
          function timeAgo(ts){ if(!ts) return ''; var now=Date.now(); var d=now-ts; if(d<60000) return '방금 전'; if(d<3600000) return Math.floor(d/60000)+'분 전'; if(d<86400000) return Math.floor(d/3600000)+'시간 전'; if(d<2592000000) return Math.floor(d/86400000)+'일 전'; return Math.floor(d/2592000000)+'개월 전'; }
          function getComments(tr){ try{ return JSON.parse(tr.getAttribute('data-comments')||'[]'); }catch(_){ return []; } }
          function setComments(tr, arr){ tr.setAttribute('data-comments', JSON.stringify(arr)); cmScheduleSave(); }
          function buildCommentEl(c, idx, isReply, replyIdx){
            var el=document.createElement('li');
            el.className=isReply?'cm-cmt cm-cmt-reply':'cm-cmt';
            var delAttr=isReply?'data-idx="'+idx+'" data-ridx="'+replyIdx+'"':'data-idx="'+idx+'"';
            var replyBtn=isReply?'':'<button type="button" class="cm-cmt-action cm-cmt-reply-btn" data-idx="'+idx+'">답글</button>';
            var me=getAuthorName(); var isOwner=(c.author||'')=== me;
            var delBtn=isOwner?'<button type="button" class="cm-cmt-action cm-cmt-del" '+delAttr+'>삭제</button>':'';
            el.innerHTML='<img class="cm-cmt-avatar" src="'+(c.avatar||'/static/image/svg/free-sticker-profile.svg')+'" alt="">'+'<div class="cm-cmt-main"><div class="cm-cmt-bubble"><div class="cm-cmt-head"><span class="cm-cmt-name"></span><span class="cm-cmt-time"></span></div><div class="cm-cmt-text"></div></div><div class="cm-cmt-actions">'+replyBtn+delBtn+'</div></div>';
            el.querySelector('.cm-cmt-name').textContent=c.author||'';
            el.querySelector('.cm-cmt-time').textContent=timeAgo(c.ts);
            el.querySelector('.cm-cmt-text').textContent=c.text||'';
            return el;
          }
          function renderComments(tr){
            if(!commentListEl) return;
            var comments = getComments(tr);
            if(!comments.length){ commentListEl.innerHTML='<li class="cm-comments-empty">댓글이 없습니다.</li>'; return; }
            commentListEl.innerHTML='';
            comments.forEach(function(c, idx){
              commentListEl.appendChild(buildCommentEl(c, idx, false, -1));
              var replies=c.replies||[];
              replies.forEach(function(r, ri){
                commentListEl.appendChild(buildCommentEl(r, idx, true, ri));
              });
            });
            commentListEl.scrollTop = commentListEl.scrollHeight;
          }
          function showDetail(tr){
            if(!tr) return;
            activeTr = tr;
            var data = cmRowToData(tr);
            if(titleEl) titleEl.textContent = data.title || '의사소통 상세';
            if(subtitleEl) subtitleEl.textContent = data.category || '';
            if(metaEl){
              var items = [];
              if(data.date) items.push('<span class="cm-detail-meta-item"><span class="meta-label">날짜</span><span class="meta-value">'+escapeHtml(data.date)+'</span></span>');
              if(data.place) items.push('<span class="cm-detail-meta-item"><span class="meta-label">장소</span><span class="meta-value">'+escapeHtml(data.place)+'</span></span>');
              if(data.author) items.push('<span class="cm-detail-meta-item"><span class="meta-label">작성자</span><span class="meta-value">'+escapeHtml(data.author)+'</span></span>');
              metaEl.innerHTML = items.join('<span class="cm-detail-meta-dot">&middot;</span>');
            }
            if(mainEl){ mainEl.innerHTML = data.main ? toRichHtml(data.main) : '<span class="cm-detail-empty">내용 없음</span>'; }
            if(mainSection) mainSection.style.display = '';
            if(issueEl){ issueEl.innerHTML = data.issue ? toRichHtml(data.issue) : '<span class="cm-detail-empty">내용 없음</span>'; }
            if(issueSection) issueSection.style.display = '';
            if(participantsEl){
              if(data.participants && data.participants.trim()){
                var names = data.participants.split(',').map(function(n){ return n.trim(); }).filter(function(n){ return n; });
                participantsEl.textContent = names.join(', ');
              } else {
                participantsEl.innerHTML = '<span class="cm-detail-empty">참여자 정보 없음</span>';
              }
            }
            if(participantsSection) participantsSection.style.display = '';
            renderComments(tr);
            openModalLocal(modalId);
            if(commentInput) commentInput.value='';
          }
          // Comment form submit
          if(commentForm) commentForm.addEventListener('submit', function(e){
            e.preventDefault();
            if(!activeTr || !commentInput) return;
            var text = commentInput.value.trim();
            if(!text) return;
            var comments = getComments(activeTr);
            comments.push({ author: getAuthorName(), avatar: getAvatarSrc(), text: text, ts: Date.now() });
            setComments(activeTr, comments);
            renderComments(activeTr);
            commentInput.value='';
          });
          // Delete comment or reply
          if(commentListEl) commentListEl.addEventListener('click', function(ev){
            var delBtn = ev.target.closest('.cm-cmt-del');
            if(delBtn && activeTr){
              var idx = parseInt(delBtn.getAttribute('data-idx'), 10);
              var ridx = delBtn.hasAttribute('data-ridx') ? parseInt(delBtn.getAttribute('data-ridx'), 10) : -1;
              if(isNaN(idx)) return;
              var comments = getComments(activeTr);
              if(ridx >= 0){
                if(comments[idx] && comments[idx].replies){ comments[idx].replies.splice(ridx, 1); }
              } else {
                comments.splice(idx, 1);
              }
              setComments(activeTr, comments);
              renderComments(activeTr);
              return;
            }
            // Reply button — show inline reply form
            var replyBtn = ev.target.closest('.cm-cmt-reply-btn');
            if(replyBtn && activeTr){
              var pidx = parseInt(replyBtn.getAttribute('data-idx'), 10);
              if(isNaN(pidx)) return;
              // Remove any existing inline reply form
              var old = commentListEl.querySelector('.cm-reply-form-inline');
              if(old) old.remove();
              // Insert reply form after parent comment (and its existing replies)
              var insertAfter = replyBtn.closest('.cm-cmt');
              var next = insertAfter.nextElementSibling;
              while(next && next.classList.contains('cm-cmt-reply')){ insertAfter = next; next = next.nextElementSibling; }
              var formLi = document.createElement('li');
              formLi.className='cm-reply-form-inline';
              formLi.innerHTML='<form class="cm-reply-form"><input type="text" class="cm-reply-input" placeholder="답글을 입력하세요" autocomplete="off"><button type="submit" class="cm-comment-submit" aria-label="등록"><img src="/static/image/svg/insight/free-icon-registration.svg" alt="" class="cm-comment-submit-icon" aria-hidden="true"></button></form>';
              insertAfter.parentNode.insertBefore(formLi, insertAfter.nextSibling);
              var rInput = formLi.querySelector('.cm-reply-input');
              rInput.focus();
              formLi.querySelector('.cm-reply-form').addEventListener('submit', function(se){
                se.preventDefault();
                var txt = rInput.value.trim();
                if(!txt) return;
                var comments = getComments(activeTr);
                if(!comments[pidx]) return;
                if(!comments[pidx].replies) comments[pidx].replies=[];
                comments[pidx].replies.push({ author: getAuthorName(), avatar: getAvatarSrc(), text: txt, ts: Date.now() });
                setComments(activeTr, comments);
                renderComments(activeTr);
              });
              // Close on Escape
              rInput.addEventListener('keydown', function(ke){ if(ke.key==='Escape'){ formLi.remove(); } });
            }
          });
          // Delegate click on title cells
          table.addEventListener('click', function(ev){
            var cell = ev.target.closest('.cm-title-cell');
            if(!cell) return;
            var tr = cell.closest('tr');
            if(!tr || tr.parentNode.tagName.toLowerCase()!=='tbody') return;
            if(cell.querySelector('input, textarea, select')) return;
            ev.preventDefault(); ev.stopPropagation();
            showDetail(tr);
          });
          if(closeBtn) closeBtn.addEventListener('click', function(){ closeModalLocal(modalId); });
          var modalEl = document.getElementById(modalId);
          if(modalEl){ modalEl.addEventListener('click', function(e){ if(e.target===modalEl) closeModalLocal(modalId); }); document.addEventListener('keydown', function(e){ if(e.key==='Escape' && modalEl.classList.contains('show')) closeModalLocal(modalId); }); }
        })();

        // Initial state
        updateEmpty();
      }; window.__blsTabInits.tab87();
  }
  if(document.readyState!=='loading') _boot();
  else document.addEventListener('DOMContentLoaded', _boot);
})();
