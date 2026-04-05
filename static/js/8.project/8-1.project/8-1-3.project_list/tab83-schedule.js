// tab83-schedule.js — tab83: 일정관리 (Schedule)
(function(){
  'use strict';
  window.__blsTabInits = window.__blsTabInits || {};
  window.__blsInitFlags = window.__blsInitFlags || {};
  function _boot(){
    var blsGetProjectId = window.blsGetProjectId;
    var blsFetchJson = window.blsFetchJson;

      // ---------- Schedule (tab83): Gantt renderer from WBS snapshot ----------
      window.__blsTabInits.tab83 = function(){
        try{
          var wrap = document.getElementById('gantt-wrap');
          if(!wrap) return; // only on tab83
          if(window.__blsInitFlags.tab83_done) return; window.__blsInitFlags.tab83_done = true;
          var emptyEl = document.getElementById('gantt-empty');
          var monthsEl = document.getElementById('gantt-months');
          var weeksEl = document.getElementById('gantt-weeks');
          var daysEl = document.getElementById('gantt-days');
          var bodyEl = document.getElementById('gantt-body');
          var viewSel = document.getElementById('gantt-view-mode');
          var monthInp = document.getElementById('gantt-month');
          var weekInp = document.getElementById('gantt-week');
          var prevBtn = document.getElementById('gantt-prev');
          var nextBtn = document.getElementById('gantt-next');
          var todayBtn = document.getElementById('gantt-today');

          // WBS level filter: 'all', '1'(대분류), '2'(중분류), '3'(소분류)
          var currentWbsLevel = 'all';
          var wbsFilterEl = document.getElementById('gantt-wbs-filter');
          if(wbsFilterEl){
            var btns = wbsFilterEl.querySelectorAll('.gantt-wbs-btn');
            btns.forEach(function(btn){
              btn.addEventListener('click', function(){
                btns.forEach(function(b){ b.classList.remove('active'); });
                btn.classList.add('active');
                currentWbsLevel = btn.getAttribute('data-level') || 'all';
                render();
              });
            });
          }

          // Force monthly view mode (viewSel is now a hidden input with value='month')
          if(viewSel && viewSel.tagName==='INPUT') viewSel.value = 'month';

          // DB hydrate + persist: use prj_tab_scope for WBS rows and prj_tab_schedule for view settings
          var tabClient = null;
          try{ tabClient = (typeof window.__blsGetPrjTabClient === 'function') ? (window.__blsGetPrjTabClient ? window.__blsGetPrjTabClient() : null) : null; }catch(_e){ tabClient = null; }
          var scheduleTabKey = 'schedule';
          var suppressSchedulePersist = false;

          function scheduleReadSettings(){
            try{
              return {
                view_mode: (viewSel && viewSel.value) ? String(viewSel.value) : 'all',
                month: (monthInp && monthInp.value) ? String(monthInp.value) : '',
                week: (weekInp && weekInp.value) ? String(weekInp.value) : '',
              };
            }catch(_){ return { view_mode:'all', month:'', week:'' }; }
          }

          function scheduleApplySettings(payload){
            try{
              var p = payload && payload.gantt ? payload.gantt : null;
              if(!p) return;
              suppressSchedulePersist = true;
              if(viewSel && p.view_mode){
                var v = String(p.view_mode||'').trim();
                if(v==='all' || v==='month' || v==='week'){ viewSel.value = v; }
              }
              if(monthInp && typeof p.month === 'string'){ monthInp.value = String(p.month||''); }
              if(weekInp && typeof p.week === 'string'){ weekInp.value = String(p.week||''); }
            }catch(_){
              // ignore
            } finally {
              suppressSchedulePersist = false;
            }
          }

          function schedulePersistSettings(){
            if(suppressSchedulePersist) return;
            if(!tabClient || typeof tabClient.saveMergedLatest !== 'function') return;
            try{
              var s = scheduleReadSettings();
              var pid = tabClient.projectId;
              var debounceKey = 'prjtab:' + String(pid||'') + ':' + scheduleTabKey + ':gantt';
              blsDebounce(debounceKey, function(){
                try{ tabClient.saveMergedLatest(scheduleTabKey, { gantt: s }); }catch(_e){ }
              }, 700);
            }catch(_){ }
          }

          function hydrateWbsFromDb(){
            if(!tabClient || typeof tabClient.loadLatest !== 'function') return Promise.resolve(false);
            return tabClient.loadLatest('scope').then(function(item){
              var payload = (item && item.payload && typeof item.payload === 'object') ? item.payload : null;
              var rows = (payload && Array.isArray(payload.rows)) ? payload.rows : [];
              try{
                localStorage.setItem('project:wbs:data', JSON.stringify(rows || []));
                localStorage.setItem('project:wbs:updatedAt', String(Date.now()));
                localStorage.setItem('project:wbs:projectId', String(tabClient.projectId||''));
              }catch(_){ }
              return true;
            }).catch(function(_err){
              return false;
            });
          }

          function parseDateSafe(v){
            try{
              if(!v) return null;
              var s = String(v).trim(); if(!s) return null;
              // Accept YYYY-MM-DD | YYYY/MM/DD | YYYY.MM.DD | YYYYMMDD (avoid Date(string) to prevent TZ shifts)
              var m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
              if(m1){ var y=+m1[1], mo=+m1[2]-1, d=+m1[3]; var dt=new Date(y,mo,d); return isNaN(dt.getTime())? null: dt; }
              var m2 = s.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/);
              if(m2){ var y2=+m2[1], mo2=+m2[2]-1, d2=+m2[3]; var dt2=new Date(y2,mo2,d2); return isNaN(dt2.getTime())? null: dt2; }
              var m3 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
              if(m3){ var y3=+m3[1], mo3=+m3[2]-1, d3=+m3[3]; var dt3=new Date(y3,mo3,d3); return isNaN(dt3.getTime())? null: dt3; }
              return null;
            }catch(_){ return null; }
          }
          function ymd(dt){ if(!(dt instanceof Date)) return ''; var y=dt.getFullYear(); var m=String(dt.getMonth()+1).padStart(2,'0'); var d=String(dt.getDate()).padStart(2,'0'); return y+'-'+m+'-'+d; }
          function startOfWeek(dt){ var d=new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()); var offset = (d.getDay()+6)%7; return addDays(d, -offset); } // Monday-based
          function addDays(dt, n){ var d=new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()+n); return d; }
          function daysDiffInclusive(a,b){ var ms = (b - a); var d = Math.floor(ms/(24*3600*1000)) + 1; return d<0? 0 : d; }
          function getISOWeek(d){ d=new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); var dayNum=d.getUTCDay()||7; d.setUTCDate(d.getUTCDate()+4-dayNum); var yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1)); return Math.ceil((((d - yearStart)/86400000)+1)/7); }
          function readTasks(){
            var arr=[]; try{ var raw=localStorage.getItem('project:wbs:data'); arr=raw? JSON.parse(raw||'[]')||[] : []; }catch(_){ arr=[]; }
            var out = [];
            arr.forEach(function(t, idx){
              var s=parseDateSafe(t.startDate||t.start), e=parseDateSafe(t.endDate||t.end);
              if(!s || !e) return;
              var res=String(t.result||'').trim();
              var cls = res==='완료'? 'done' : res==='진행'? 'doing' : res==='지연'? 'overdue' : res==='대기'? 'pending' : 'doing';
              out.push({ wbs:String(t.division||t.wbs||'').trim(), activity:String(t.activity||'').trim(), task:String(t.task||'').trim(), owner:String(t.owner||'').trim(), start:s, end:e, status:cls, _idx:idx });
            });
            // sort by WBS code then start date
            out.sort(function(a,b){
              function parse(code){ var s=String(code||'').trim(); if(!s) return [Number.POSITIVE_INFINITY]; return s.split('.').map(function(p){ var m=p.match(/\d+/); return m? parseInt(m[0],10):0; }); }
              var A=parse(a.wbs), B=parse(b.wbs), n=Math.max(A.length,B.length);
              for(var i=0;i<n;i++){ var ai=(i<A.length)?A[i]:-1, bi=(i<B.length)?B[i]:-1; if(ai<bi) return -1; if(ai>bi) return 1; }
              if(a.start<b.start) return -1; if(a.start>b.start) return 1; return 0;
            });
            return out;
          }

          function build(rangeStart, rangeEnd){
            // Clear
            monthsEl.innerHTML=''; weeksEl.innerHTML=''; daysEl.innerHTML=''; bodyEl.innerHTML='';
            var allTasks = readTasks();
            // Apply WBS level filter
            var tasks = allTasks;
            if(currentWbsLevel !== 'all'){
              var targetLevel = parseInt(currentWbsLevel, 10);
              tasks = allTasks.filter(function(t){
                var wbs = String(t.wbs||'').trim();
                if(!wbs) return false;
                var dots = wbs.split('.').length;
                return dots === targetLevel;
              });
            }
            var has = tasks && tasks.length>0;
            if(!has){ if(emptyEl){ emptyEl.hidden=false; emptyEl.style.display=''; } if(wrap){ wrap.style.display='none'; } return; }
            if(emptyEl){ emptyEl.hidden=true; emptyEl.style.display='none'; }
            if(wrap){ wrap.style.display=''; }

            // Determine range when not provided
            if(!rangeStart || !rangeEnd){ var minS=null, maxE=null; tasks.forEach(function(t){ if(!minS || t.start<minS) minS=t.start; if(!maxE || t.end>maxE) maxE=t.end; }); rangeStart=minS; rangeEnd=maxE; }

            // Always month mode
            var ms = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
            var me = new Date(rangeStart.getFullYear(), rangeStart.getMonth()+1, 0);
            rangeStart = ms; rangeEnd = me;
            var days = daysDiffInclusive(rangeStart, rangeEnd);
            if(days<=0){ if(emptyEl){ emptyEl.hidden=false; emptyEl.style.display=''; } return; }

            // Compute day width: expand to fill the visible width
            var dayW = (function(){
              try{
                var labelV = getComputedStyle(wrap).getPropertyValue('--label-w');
                var label = parseFloat(labelV); if(!(isFinite(label)&&label>0)) label = 280;
                var avail = Math.max(0, wrap.clientWidth - label - 2);
                var dyn = Math.floor(avail / days);
                if(isFinite(dyn) && dyn > 20){
                  wrap.style.setProperty('--day-w', String(dyn)+'px');
                  return dyn;
                }
                var baseV = getComputedStyle(wrap).getPropertyValue('--day-w');
                var base = parseFloat(baseV); if(!(isFinite(base)&&base>0)) base = 26;
                return base;
              }catch(_){ return 26; }
            })();
            var gridCols = 'var(--label-w) repeat('+days+', var(--day-w))';

            function addCellRow(container, className){ var row=document.createElement('div'); row.className='row '+className; row.style.gridTemplateColumns = gridCols; container.appendChild(row); return row; }
            var monthsRow = addCellRow(monthsEl, 'months');
            var weeksRow = addCellRow(weeksEl, 'weeks');
            var daysRow = addCellRow(daysEl, 'days');
            function leftHead(label){ var c=document.createElement('div'); c.className='cell is-left'; c.textContent=label; return c; }
            monthsRow.appendChild(leftHead('작업'));
            weeksRow.appendChild(leftHead('주'));
            daysRow.appendChild(leftHead('일'));

            // Months
            (function(){ var cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1); while(cur <= rangeEnd){ var segStart = (cur < rangeStart)? rangeStart : new Date(cur); var segEnd = new Date(cur.getFullYear(), cur.getMonth()+1, 0); if(segEnd > rangeEnd) segEnd = rangeEnd; var span = daysDiffInclusive(segStart, segEnd); var cell=document.createElement('div'); cell.className='cell'; cell.style.gridColumn = 'span '+span; cell.textContent = cur.getFullYear()+'-'+String(cur.getMonth()+1).padStart(2,'0'); monthsRow.appendChild(cell); cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1); } })();
            // Weeks — number relative to project start date (W1 = first week from start)
            (function(){
              var projStart = null;
              try{ var sTxt = (document.getElementById('ov-start')||{}).textContent||''; projStart = parseDateSafe(String(sTxt).trim()); }catch(_){ }
              if(!projStart) projStart = rangeStart;
              var projWeekOrigin = startOfWeek(projStart); // Monday of project start week
              var cur = new Date(rangeStart);
              while(cur <= rangeEnd){
                var weekEnd = addDays(cur, 6 - ((cur.getDay()+6)%7));
                if(weekEnd > rangeEnd) weekEnd = rangeEnd;
                var span = daysDiffInclusive(cur, weekEnd);
                var cell = document.createElement('div'); cell.className='cell'; cell.style.gridColumn='span '+span;
                var weekMon = startOfWeek(cur);
                var wNum = Math.floor((weekMon - projWeekOrigin) / (7*24*3600*1000)) + 1;
                cell.textContent = 'W' + wNum;
                weeksRow.appendChild(cell);
                cur = addDays(weekEnd, 1);
              }
            })();
            // Days — weekend numbers in red
            (function(){ var cur = new Date(rangeStart); var todayStr = ymd(new Date()); while(cur <= rangeEnd){ var c=document.createElement('div'); c.className='cell'; c.textContent = String(cur.getDate()); if(ymd(cur)===todayStr) c.classList.add('today'); var dow=cur.getDay(); if(dow===0||dow===6) c.classList.add('weekend'); daysRow.appendChild(c); cur = addDays(cur,1); } })();

            // ── Build hierarchical rows (phase → activity → task) with tree connectors ──
            // Determine if a task has children (is a parent in WBS hierarchy)
            function hasChildren(wbs){
              if(!wbs) return false;
              return tasks.some(function(x){ return x.wbs && x.wbs!==wbs && x.wbs.indexOf(wbs+'.')===0; });
            }

            // ── Helper: persist date change back to WBS (scope) ──
            function persistDateChange(taskIdx, field, newDate){
              try{
                var raw=localStorage.getItem('project:wbs:data');
                var arr=raw? JSON.parse(raw||'[]')||[] : [];
                if(taskIdx>=0 && taskIdx<arr.length){
                  arr[taskIdx][field]=ymd(newDate);
                  localStorage.setItem('project:wbs:data', JSON.stringify(arr));
                  localStorage.setItem('project:wbs:updatedAt', String(Date.now()));
                  // Sync to DB via tabClient
                  if(tabClient && typeof tabClient.saveMergedLatest==='function'){
                    tabClient.saveMergedLatest('scope', {rows:arr});
                  }
                  // Notify other tabs/components
                  try{ window.dispatchEvent(new Event('project:wbs:updated')); }catch(_){}
                }
              }catch(_){}
            }

            // Body rows — one row per WBS entry (범위 관리 기준, 항상 모든 행 표시)
            tasks.forEach(function(t){
              var isParent = hasChildren(t.wbs);
              var inRange = !(t.end < rangeStart || t.start > rangeEnd);
              var row = document.createElement('div'); row.className='gantt-row'; row.style.gridTemplateColumns = gridCols;

              var left = document.createElement('div'); left.className='gantt-left';
              var w = document.createElement('span'); w.className='wbs';
              w.textContent = t.wbs||'';
              var name = document.createElement('span'); name.className='label';
              var nm = [];
              if(t.activity) nm.push(t.activity);
              if(t.task) nm.push(t.task);
              name.textContent = nm.join(' ') || '-';
              left.appendChild(w); left.appendChild(name);

              var cells = document.createElement('div'); cells.className='gantt-cells';
              var grid = document.createElement('div'); grid.className='gantt-grid';
              grid.style.gridTemplateColumns = 'repeat('+days+', var(--day-w))';
              for(var i=0;i<days;i++){
                var d=document.createElement('div'); d.className='day';
                var dt = addDays(rangeStart, i); if(ymd(dt)===ymd(new Date())) d.classList.add('today');
                grid.appendChild(d);
              }
              var bars = document.createElement('div'); bars.className='gantt-bars';

              // Only show bar if task overlaps the visible date range
              if(inRange){
              var startClamped = (t.start < rangeStart)? rangeStart : t.start;
              var endClamped = (t.end > rangeEnd)? rangeEnd : t.end;
              var offset = daysDiffInclusive(rangeStart, startClamped) - 1; if(offset<0) offset=0;
              var span = daysDiffInclusive(startClamped, endClamped);
              var barLeft = offset*dayW; var barWidth = Math.max(1, span*dayW);
              var bar = document.createElement('div');
              bar.className='gantt-bar' + (t.status? ' '+t.status : '');
              bar.style.left = barLeft+'px'; bar.style.width = barWidth+'px';

              var barLabel=document.createElement('span'); barLabel.className='name';
              var bParts=[];
              if(t.wbs) bParts.push(t.wbs);
              if(t.activity) bParts.push(t.activity);
              if(t.task) bParts.push(t.task);
              bar.title = bParts.join(' ') +'\n'+ymd(t.start)+' ~ '+ymd(t.end) + (t.owner? ' · '+t.owner : '');

              // Drag handles — direct date edit; parent WBS items also move/resize children
              (function(item, barEl, dayWidth, parentFlag){
                var hl=document.createElement('div'); hl.className='gantt-drag gantt-drag-l'; hl.title='시작일 조정';
                var hr=document.createElement('div'); hr.className='gantt-drag gantt-drag-r'; hr.title='종료일 조정';
                barEl.appendChild(hl); barEl.appendChild(hr);

                // ── Whole-bar move (click bar body, not handles) ──
                barEl.addEventListener('mousedown', function(ev){
                  if(ev.target===hl || ev.target===hr) return;
                  ev.preventDefault(); ev.stopPropagation();
                  var startX=ev.clientX, origLeft=parseFloat(barEl.style.left)||0;
                  var origStartDate=new Date(item.start), origEndDate=new Date(item.end);
                  barEl.style.cursor='grabbing';
                  function onMove(e){
                    var dx=e.clientX-startX; var dayShift=Math.round(dx/dayWidth);
                    barEl.style.left=(origLeft+dayShift*dayWidth)+'px';
                  }
                  function onUp(e){
                    document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp);
                    barEl.style.cursor='';
                    var dx=e.clientX-startX; var dayShift=Math.round(dx/dayWidth); if(dayShift===0) return;
                    // Always move this item
                    if(typeof item._idx==='number'){
                      persistDateChange(item._idx,'startDate',addDays(origStartDate,dayShift));
                      persistDateChange(item._idx,'endDate',addDays(origEndDate,dayShift));
                    }
                    // If parent, also move all children
                    if(parentFlag){
                      var prefix=item.wbs+'.';
                      tasks.forEach(function(c){
                        if(c.wbs && c.wbs.indexOf(prefix)===0 && typeof c._idx==='number'){
                          persistDateChange(c._idx,'startDate',addDays(c.start,dayShift));
                          persistDateChange(c._idx,'endDate',addDays(c.end,dayShift));
                        }
                      });
                    }
                    render();
                  }
                  document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
                });

                // ── Edge resize handles ──
                function attachDrag(handle, edge){
                  var startX=0, origLeft=0, origWidth=0, origStartDate=null, origEndDate=null;
                  handle.addEventListener('mousedown', function(ev){
                    ev.preventDefault(); ev.stopPropagation();
                    startX=ev.clientX; origLeft=parseFloat(barEl.style.left)||0; origWidth=parseFloat(barEl.style.width)||0;
                    origStartDate=new Date(item.start); origEndDate=new Date(item.end);
                    function onMove(e){
                      var dx=e.clientX-startX; var dayShift=Math.round(dx/dayWidth);
                      if(edge==='left'){ var nL=origLeft+dayShift*dayWidth; var nW=origWidth-dayShift*dayWidth; if(nW<dayWidth) return; barEl.style.left=nL+'px'; barEl.style.width=nW+'px'; }
                      else { var nW2=origWidth+dayShift*dayWidth; if(nW2<dayWidth) return; barEl.style.width=nW2+'px'; }
                    }
                    function onUp(e){
                      document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp);
                      var dx=e.clientX-startX; var dayShift=Math.round(dx/dayWidth); if(dayShift===0) return;
                      if(typeof item._idx==='number'){
                        if(edge==='left'){ var ns=addDays(origStartDate, dayShift); if(ns>=origEndDate) return; persistDateChange(item._idx,'startDate',ns); }
                        else { var ne=addDays(origEndDate, dayShift); if(ne<=origStartDate) return; persistDateChange(item._idx,'endDate',ne); }
                      }
                      render();
                    }
                    document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
                  });
                }
                attachDrag(hl,'left'); attachDrag(hr,'right');
              })(t, bar, dayW, isParent);

              bars.appendChild(bar);
              } // end if(inRange)
              cells.appendChild(grid); cells.appendChild(bars);
              row.appendChild(left); row.appendChild(cells);
              bodyEl.appendChild(row);
            });

          }

          function monthKey(dt){ if(!(dt instanceof Date)) return null; return dt.getFullYear()*12 + dt.getMonth(); }
          function getBoundsMonth(){
            // Bounds based purely on WBS task dates
            var minMonth = null, maxMonth = null;
            try{
              var tasks = readTasks();
              if(tasks && tasks.length){
                for(var i=0;i<tasks.length;i++){
                  var t = tasks[i];
                  if(!minMonth || t.start < minMonth) minMonth = new Date(t.start.getFullYear(), t.start.getMonth(), 1);
                  if(!maxMonth || t.end   > maxMonth) maxMonth = new Date(t.end.getFullYear(), t.end.getMonth(), 1);
                }
              }
            }catch(_){ }
            // ensure min exists if only max present
            if(!minMonth && maxMonth){ minMonth = new Date(maxMonth.getFullYear(), maxMonth.getMonth(), 1); }
            // ensure max exists if only min present
            if(!maxMonth && minMonth){ maxMonth = new Date(minMonth.getFullYear(), minMonth.getMonth(), 1); }
            return { min:minMonth, max:maxMonth };
          }

          function updateMonthNavDisabled(curMonth){
            if(!prevBtn || !nextBtn) return;
            var b = getBoundsMonth();
            var curKey = monthKey(curMonth);
            var minKey = monthKey(b.min), maxKey = monthKey(b.max);
            var atMin = (minKey!=null && curKey!=null)? (curKey<=minKey) : false;
            var atMax = (maxKey!=null && curKey!=null)? (curKey>=maxKey) : false;
            try{ prevBtn.disabled = !!atMin; prevBtn.setAttribute('aria-disabled', atMin?'true':'false'); }catch(_){ }
            try{ nextBtn.disabled = !!atMax; nextBtn.setAttribute('aria-disabled', atMax?'true':'false'); }catch(_){ }
          }

          function computeRangeFromMode(){
            // Always month mode
            var initVal = (function(){
              var base = new Date();
              return base.getFullYear()+'-'+String(base.getMonth()+1).padStart(2,'0');
            })();
            var val = monthInp && monthInp.value ? monthInp.value : initVal;
            if(monthInp && !monthInp.value) monthInp.value = val;
            var y = parseInt(val.slice(0,4),10); var m = parseInt(val.slice(5,7),10)-1; var ms = new Date(y,m,1); var me = new Date(y,m+1,0);
            var bounds = getBoundsMonth();
            if(bounds.min && monthKey(ms) < monthKey(bounds.min)){ ms = new Date(bounds.min.getFullYear(), bounds.min.getMonth(), 1); me = new Date(ms.getFullYear(), ms.getMonth()+1, 0); if(monthInp) monthInp.value = ms.getFullYear()+"-"+String(ms.getMonth()+1).padStart(2,'0'); }
            if(bounds.max && monthKey(ms) > monthKey(bounds.max)){ ms = new Date(bounds.max.getFullYear(), bounds.max.getMonth(), 1); me = new Date(ms.getFullYear(), ms.getMonth()+1, 0); if(monthInp) monthInp.value = ms.getFullYear()+"-"+String(ms.getMonth()+1).padStart(2,'0'); }
            updateMonthNavDisabled(ms);
            return { start:ms, end:me };
          }

          function render(){ var r = computeRangeFromMode(); if(!r.start || !r.end){ monthsEl.innerHTML=''; weeksEl.innerHTML=''; daysEl.innerHTML=''; bodyEl.innerHTML=''; if(emptyEl){ emptyEl.hidden=false; emptyEl.style.display=''; } return; } build(r.start, r.end); }

          if(monthInp){ monthInp.addEventListener('change', function(){ render(); schedulePersistSettings(); }); }
          if(prevBtn){ prevBtn.addEventListener('click', function(){
            var v=monthInp.value||''; var y=parseInt(v.slice(0,4)||'0',10); var m=parseInt(v.slice(5,7)||'1',10)-1;
            var bounds=getBoundsMonth(); var target=new Date(y, m-1, 1);
            if(bounds.min && monthKey(target) < monthKey(bounds.min)){ target = new Date(bounds.min.getFullYear(), bounds.min.getMonth(), 1); }
            monthInp.value = target.getFullYear()+'-'+String(target.getMonth()+1).padStart(2,'0');
            render(); schedulePersistSettings();
          }); }
          if(nextBtn){ nextBtn.addEventListener('click', function(){
            var v=monthInp.value||''; var y=parseInt(v.slice(0,4)||'0',10); var m=parseInt(v.slice(5,7)||'1',10)-1;
            var bounds=getBoundsMonth(); var target=new Date(y, m+1, 1);
            if(bounds.max && monthKey(target) > monthKey(bounds.max)){ target = new Date(bounds.max.getFullYear(), bounds.max.getMonth(), 1); }
            monthInp.value = target.getFullYear()+'-'+String(target.getMonth()+1).padStart(2,'0');
            render(); schedulePersistSettings();
          }); }
          if(todayBtn){ todayBtn.addEventListener('click', function(){
            var today = new Date();
            var target = new Date(today.getFullYear(), today.getMonth(), 1);
            if(monthInp) monthInp.value = target.getFullYear()+'-'+String(target.getMonth()+1).padStart(2,'0');
            render();
          }); }

          window.addEventListener('storage', function(e){ if(e && e.key==='project:wbs:data'){ render(); } });
          window.addEventListener('resize', function(){ try{ render(); }catch(_){ } });
          window.addEventListener('project:wbs:updated', function(){ render(); });

          // Clip bars so they never paint under the sticky label column on scroll
          (function(){
            if(!wrap) return;
            function clipBars(){
              var sl = wrap.scrollLeft;
              var cells = wrap.querySelectorAll('.gantt-cells');
              for(var i=0; i<cells.length; i++){
                if(sl > 0){
                  cells[i].style.clipPath = 'inset(0 0 0 ' + sl + 'px)';
                } else {
                  cells[i].style.clipPath = '';
                }
              }
            }
            wrap.addEventListener('scroll', clipBars, {passive: true});
          })();

          // ── Calendar modal ──
          (function(){
            var calBtn = document.getElementById('gantt-calendar-btn');
            var calModal = document.getElementById('gantt-calendar-modal');
            var calClose = document.getElementById('gantt-calendar-close');
            var calGrid = document.getElementById('gantt-cal-grid');
            var calTitle = document.getElementById('gantt-cal-title');
            var calPrev = document.getElementById('gantt-cal-prev');
            var calNext = document.getElementById('gantt-cal-next');
            var calToday = document.getElementById('gantt-cal-today');
            var calDetail = document.getElementById('gantt-cal-detail');
            var calDetailTitle = document.getElementById('gantt-cal-detail-title');
            var calDetailList = document.getElementById('gantt-cal-detail-list');
            if(!calBtn || !calModal || !calGrid) return;

            // Calendar WBS level filter
            var calWbsLevel = 'all';
            var calWbsFilterEl = document.getElementById('gantt-cal-wbs-filter');
            if(calWbsFilterEl){
              var calWbsBtns = calWbsFilterEl.querySelectorAll('.gantt-cal-wbs-btn');
              calWbsBtns.forEach(function(btn){
                btn.addEventListener('click', function(){
                  calWbsBtns.forEach(function(b){ b.classList.remove('active'); });
                  btn.classList.add('active');
                  calWbsLevel = btn.getAttribute('data-level') || 'all';
                  renderCal();
                });
              });
            }

            var calYear, calMonth; // 0-indexed month

            function openCalModal(){
              document.body.classList.add('modal-open');
              calModal.classList.add('show');
              calModal.setAttribute('aria-hidden','false');
              var now = new Date();
              calYear = now.getFullYear(); calMonth = now.getMonth();
              renderCal();
            }
            function closeCalModal(){
              calModal.classList.remove('show');
              calModal.setAttribute('aria-hidden','true');
              if(!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open');
            }
            calBtn.addEventListener('click', openCalModal);
            calClose.addEventListener('click', closeCalModal);
            calModal.addEventListener('click', function(e){ if(e.target===calModal) closeCalModal(); });

            calPrev.addEventListener('click', function(){ calMonth--; if(calMonth<0){ calMonth=11; calYear--; } renderCal(); });
            calNext.addEventListener('click', function(){ calMonth++; if(calMonth>11){ calMonth=0; calYear++; } renderCal(); });
            calToday.addEventListener('click', function(){ var n=new Date(); calYear=n.getFullYear(); calMonth=n.getMonth(); renderCal(); });

            function renderCal(){
              calTitle.textContent = calYear + '년 ' + (calMonth+1) + '월';
              calGrid.innerHTML = '';
              if(calDetail) calDetail.hidden = true;

              var allCalTasks = readTasks();
              // Apply WBS level filter
              var tasks = allCalTasks;
              if(calWbsLevel !== 'all'){
                var calTargetLevel = parseInt(calWbsLevel, 10);
                tasks = allCalTasks.filter(function(t){
                  var wbs = String(t.wbs||'').trim();
                  if(!wbs) return false;
                  return wbs.split('.').length === calTargetLevel;
                });
              }
              var firstDay = new Date(calYear, calMonth, 1);
              var startDow = (firstDay.getDay()+6) % 7; // Mon=0
              var daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
              var todayStr = ymd(new Date());

              // Build weeks: each week = array[7] of day number or null
              // Always produce exactly 6 rows so modal height stays constant
              var weeks = [], cursor = 1;
              var w = [];
              for(var b=0; b<startDow; b++) w.push(null);
              while(w.length < 7 && cursor <= daysInMonth) w.push(cursor++);
              weeks.push(w);
              while(cursor <= daysInMonth){
                w = [];
                while(w.length < 7 && cursor <= daysInMonth) w.push(cursor++);
                while(w.length < 7) w.push(null);
                weeks.push(w);
              }
              while(weeks.length < 6){
                weeks.push([null,null,null,null,null,null,null]);
              }

              // DOW header row
              var dowRow = document.createElement('div');
              dowRow.className = 'gc-dow-row';
              ['월','화','수','목','금','토','일'].forEach(function(d, i){
                var el = document.createElement('div');
                el.className = 'gc-dow';
                if(i >= 5) el.classList.add('gc-weekend');
                el.textContent = d;
                dowRow.appendChild(el);
              });
              calGrid.appendChild(dowRow);

              // Helper: show detail for a specific day
              function showDetail(day){
                if(!calDetail) return;
                var dt = new Date(calYear, calMonth, day);
                var hits = [];
                tasks.forEach(function(t){ if(t.start <= dt && t.end >= dt) hits.push(t); });
                if(hits.length === 0){ calDetail.hidden = true; return; }
                calDetailTitle.textContent = calYear + '-' + String(calMonth+1).padStart(2,'0') + '-' + String(day).padStart(2,'0') + ' (' + hits.length + '건)';
                calDetailList.innerHTML = '';
                hits.forEach(function(t){
                  var li = document.createElement('li');
                  li.className = 'gantt-cal-detail-item status-' + t.status;
                  var badge = document.createElement('span');
                  badge.className = 'gantt-cal-detail-badge';
                  badge.textContent = t.status==='done'?'완료' : t.status==='doing'?'진행' : t.status==='overdue'?'지연' : t.status==='pending'?'대기' : '진행';
                  var info = document.createElement('span');
                  info.className = 'gantt-cal-detail-info';
                  var dParts=[]; if(t.wbs) dParts.push(t.wbs); if(t.activity) dParts.push(t.activity); if(t.task) dParts.push(t.task);
                  info.innerHTML = '<strong>' + (dParts.join(' ') || '-') + '</strong>' +
                    '<small>' + ymd(t.start) + ' ~ ' + ymd(t.end) + (t.owner ? ' · ' + t.owner : '') + '</small>';
                  li.appendChild(badge);
                  li.appendChild(info);
                  calDetailList.appendChild(li);
                });
                calDetail.hidden = false;
              }

              // Render each week row
              weeks.forEach(function(week){
                var weekEl = document.createElement('div');
                weekEl.className = 'gc-week';

                // Day numbers row
                var numsRow = document.createElement('div');
                numsRow.className = 'gc-nums';
                week.forEach(function(d){
                  var cell = document.createElement('div');
                  cell.className = 'gc-num-cell';
                  if(d === null){
                    cell.classList.add('gc-blank');
                  } else {
                    var dt = new Date(calYear, calMonth, d);
                    var dow = dt.getDay();
                    if(dow === 0 || dow === 6) cell.classList.add('gc-weekend');
                    if(ymd(dt) === todayStr) cell.classList.add('gc-today');
                    cell.textContent = d;
                    cell.style.cursor = 'pointer';
                    (function(day){ cell.addEventListener('click', function(){ showDetail(day); }); })(d);
                  }
                  numsRow.appendChild(cell);
                });
                weekEl.appendChild(numsRow);

                // Determine week date range
                var weekStart = null, weekEnd = null;
                for(var c=0; c<7; c++){
                  if(week[c] !== null){
                    var cd = new Date(calYear, calMonth, week[c]);
                    if(!weekStart || cd < weekStart) weekStart = cd;
                    if(!weekEnd || cd > weekEnd) weekEnd = cd;
                  }
                }

                // Bars area
                var barsEl = document.createElement('div');
                barsEl.className = 'gc-bars';

                if(weekStart && weekEnd){
                  var weekTasks = [];
                  tasks.forEach(function(t){
                    if(t.start <= weekEnd && t.end >= weekStart) weekTasks.push(t);
                  });
                  // Sort: by WBS code ascending, then by start date
                  weekTasks.sort(function(a, b){
                    function parseW(code){ var s=String(code||'').trim(); if(!s) return []; return s.split('.').map(function(p){ var m=p.match(/\d+/); return m? parseInt(m[0],10):0; }); }
                    var A=parseW(a.wbs), B=parseW(b.wbs), n=Math.max(A.length, B.length);
                    for(var i=0;i<n;i++){ var ai=(i<A.length)?A[i]:-1, bi=(i<B.length)?B[i]:-1; if(ai<bi) return -1; if(ai>bi) return 1; }
                    return a.start - b.start;
                  });

                  // Lane allocation so bars don't overlap
                  var lanes = []; // lanes[lane] = [{s,e}, ...]
                  weekTasks.forEach(function(t){
                    var firstCol = -1, lastCol = -1;
                    for(var c=0; c<7; c++){
                      if(week[c] !== null){
                        var cellDate = new Date(calYear, calMonth, week[c]);
                        if(t.start <= cellDate && t.end >= cellDate){
                          if(firstCol === -1) firstCol = c;
                          lastCol = c;
                        }
                      }
                    }
                    if(firstCol === -1) return;

                    // Find available lane
                    var laneIdx = -1;
                    for(var l=0; l<lanes.length; l++){
                      var conflict = false;
                      for(var r=0; r<lanes[l].length; r++){
                        if(firstCol <= lanes[l][r].e && lastCol >= lanes[l][r].s){ conflict = true; break; }
                      }
                      if(!conflict){ laneIdx = l; break; }
                    }
                    if(laneIdx === -1){ laneIdx = lanes.length; lanes.push([]); }
                    lanes[laneIdx].push({s: firstCol, e: lastCol});

                    // Create bar
                    var bar = document.createElement('div');
                    bar.className = 'gc-bar status-' + t.status;
                    bar.style.gridColumn = (firstCol+1) + ' / ' + (lastCol+2);
                    bar.style.gridRow = String(laneIdx + 1);

                    // Bar shape: start / mid / end / full
                    var isStart = (t.start >= weekStart);
                    var isEnd   = (t.end <= weekEnd);
                    if(isStart && isEnd) bar.classList.add('gc-bar-full');
                    else if(isStart)     bar.classList.add('gc-bar-start');
                    else if(isEnd)       bar.classList.add('gc-bar-end');
                    else                 bar.classList.add('gc-bar-mid');

                    var bLabel=[]; if(t.wbs) bLabel.push(t.wbs); if(t.activity) bLabel.push(t.activity); if(t.task) bLabel.push(t.task);
                    bar.textContent = bLabel.join(' ') || '-';
                    bar.title = bLabel.join(' ') + ' (' + ymd(t.start) + ' ~ ' + ymd(t.end) + (t.owner ? ' · '+t.owner : '') + ')';

                    // Click bar → show detail
                    (function(task){
                      bar.addEventListener('click', function(e){
                        e.stopPropagation();
                        for(var c2=0; c2<7; c2++){
                          if(week[c2] !== null){
                            var cd2 = new Date(calYear, calMonth, week[c2]);
                            if(task.start <= cd2 && task.end >= cd2){ showDetail(week[c2]); return; }
                          }
                        }
                      });
                    })(t);

                    barsEl.appendChild(bar);
                  });
                }

                weekEl.appendChild(barsEl);
                calGrid.appendChild(weekEl);
              });
            }
          })();

          // Init: load settings + hydrate WBS from DB so tab83 works even when opened directly.
          if(tabClient && typeof tabClient.loadLatest === 'function'){
            Promise.all([
              tabClient.loadLatest(scheduleTabKey).then(function(item){ scheduleApplySettings(item && item.payload); }).catch(function(_){ /* ignore */ }),
              hydrateWbsFromDb(),
            ]).then(function(){
              render();
              // Persist settings once after applying defaults
              schedulePersistSettings();
            }).catch(function(){
              render();
            });
          } else {
            render();
          }
        }catch(_){ }
      }; window.__blsTabInits.tab83();
  }
  if(document.readyState!=='loading') _boot();
  else document.addEventListener('DOMContentLoaded', _boot);
})();
