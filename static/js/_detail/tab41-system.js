/*
 * tab41-system.js  –  업무 그룹 > 시스템 탭 (read-only)
 * Columns: 업무운영, 업무이름, 시스템이름, 시스템IP, 시스템가상화,
 *          하드웨어(제조사+모델), 운영체제, CPU용량, 메모리용량
 */
(function(){
'use strict';

/* ── Utilities ── */
function ready(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fn); else fn(); }
function coerceInt(v){ var n=parseInt(String(v==null?'':v).replace(/[^0-9-]/g,''),10); return isNaN(n)||!isFinite(n)?null:n; }
function getQueryParamInt(keys){
    try{ var qs=new URLSearchParams(location.search||'');
        for(var i=0;i<keys.length;i++){ var n=coerceInt(qs.get(keys[i])); if(n&&n>0)return n; }
    }catch(_){} return null;
}
function getFromSession(key){
    try{ var raw=sessionStorage.getItem(key); if(!raw)return null; var o=JSON.parse(raw); return coerceInt(o&&o.id); }catch(_){ return null; }
}
function escapeHtml(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(s){ return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]); }); }
function toast(msg,type){ try{ if(window.showToast) window.showToast(msg,type||'info'); }catch(_){} }
function escapeCSV(val){ return '"'+String(val==null?'':val).replace(/"/g,'""')+'"'; }

/* ── Modal ── */
function showModal(msg,title){
    return new Promise(function(resolve){
        var id='sys-msg-modal', old=document.getElementById(id);
        if(old&&old.parentNode) old.parentNode.removeChild(old);
        var ov=document.createElement('div'); ov.id=id;
        ov.className='server-add-modal blossom-message-modal modal-overlay-full';
        ov.setAttribute('aria-hidden','false');
        ov.innerHTML='<div class="server-add-content"><div class="server-add-header"><div class="server-add-title dispose-title"><h3>'+escapeHtml(title||'알림')+'</h3></div><button class="close-btn" type="button" title="닫기"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div><div class="server-add-body"><div class="dispose-content"><div class="dispose-text"><p>'+escapeHtml(msg)+'</p></div></div></div><div class="server-add-actions align-right"><div class="action-buttons right"><button type="button" class="btn-primary sys-modal-ok">확인</button></div></div></div>';
        document.body.appendChild(ov); ov.classList.add('show'); document.body.classList.add('modal-open');
        function close(){ ov.classList.remove('show'); ov.setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); setTimeout(function(){ if(ov.parentNode)ov.parentNode.removeChild(ov); },200); document.removeEventListener('keydown',esc); resolve(); }
        ov.querySelector('.close-btn').addEventListener('click',close);
        ov.querySelector('.sys-modal-ok').addEventListener('click',close);
        ov.addEventListener('click',function(e){ if(e.target===ov)close(); });
        var esc=function(e){ if(e.key==='Escape')close(); }; document.addEventListener('keydown',esc);
        try{ ov.querySelector('.sys-modal-ok').focus(); }catch(_){}
    });
}

/* ── API helper ── */
async function api(url,opts){
    var o=Object.assign({method:'GET',credentials:'same-origin'},opts||{});
    o.headers=Object.assign({'Accept':'application/json'},o.headers||{});
    if(o.body&&!(o.headers&&o.headers['Content-Type'])) o.headers['Content-Type']='application/json';
    var res=await fetch(url,o); var text=await res.text();
    var ct=String(res.headers.get('content-type')||'');
    if(res.redirected&&/\/login\b/i.test(String(res.url))) throw new Error('로그인이 필요합니다.');
    if(/text\/html/i.test(ct)||/^\s*<!doctype/i.test(text)) throw new Error('API 응답이 JSON이 아닙니다 ('+res.status+')');
    var json; try{ json=text?JSON.parse(text):{}; }catch(_){ json={success:false,message:text}; }
    if(!res.ok) throw new Error((json&&(json.message||json.error))||('HTTP '+res.status));
    return json;
}
async function getSessionUserId(){ try{ var me=await api('/api/session/me'); var id=coerceInt(me&&me.user&&me.user.id); return(id&&id>0)?id:null; }catch(_){ return null; } }
function norm(res){ if(!res)return[]; if(Array.isArray(res))return res; if(Array.isArray(res.items))return res.items; return[]; }

/* ── Config ── */
function inferConfig(){
    var body=document.body, cls=body&&body.classList;
    if(!cls||!cls.contains('page-workgroup-system')) return null;
    return {
        label:'시스템',
        apiBase:'/api/work-groups',
        id: getQueryParamInt(['id','group_id','groupId']) || getFromSession('work_group_selected_row') || parseInt(body.getAttribute('data-cat-detail-id'),10) || 0,
        filePrefix:'workgroup_system_'
    };
}

/* ── Column definitions ── */
var COLS=[
    {key:'asset_category_name',  label:'구분',        type:'text'},
    {key:'asset_type_name',      label:'유형',        type:'text'},
    {key:'work_status_name',     label:'업무 상태',  type:'text'},
    {key:'work_operation_name',  label:'업무 운영',  type:'text'},
    {key:'work_name',            label:'업무 이름',  type:'text'},
    {key:'system_name',          label:'시스템 이름',type:'text'},
    {key:'system_ip',            label:'시스템 IP',type:'text'},
    {key:'virtualization_type',  label:'시스템 가상화',type:'text'},
    {key:'hardware',             label:'하드웨어',   type:'text',  composite:true, parts:['manufacturer_name','server_model_name']},
    {key:'cpu_size',             label:'CPU 용량',   type:'text'},
    {key:'memory_size',          label:'메모리 용량',type:'text'},
    {key:'os_type',              label:'운영체제',   type:'text'}
];

/* unit suffix map */
var UNIT_MAP = { cpu_size: 'Core', memory_size: 'GB' };

/* status dot class: reuse work_status_level token directly (ws-run, ws-c1 … ws-c10) */
function statusDotCls(item){
    var lvl = String(item&&item.work_status_level||'').trim();
    if(lvl) return lvl;
    /* fallback: derive from status name */
    var nm = String(item&&item.work_status_name||'').trim();
    if(nm==='가동'||nm==='운영'||nm==='정상') return 'ws-run';
    if(nm==='유휴') return 'ws-idle';
    return 'ws-wait';
}

function cellVal(item,col){
    if(col.composite){
        var parts=col.parts.map(function(k){ var v=String(item&&item[k]==null?'':item[k]).trim(); return v==='-'?'':v; }).filter(Boolean);
        return parts.join(' ') || '-';
    }
    var s=String(item&&item[col.key]==null?'':item[col.key]).trim();
    if(!s) return '-';
    var unit=UNIT_MAP[col.key];
    if(unit && s!=='-'){ s=s+' '+unit; }
    return s;
}

/* ── Main ── */
ready(function(){
    var cfg=inferConfig();
    var table=document.getElementById('hw-spec-table');
    if(!cfg||!table) return;

    var tbody=table.querySelector('tbody')||table.appendChild(document.createElement('tbody'));
    var emptyEl=document.getElementById('hw-empty');

    var selectAll=document.getElementById('hw-select-all');
    var pageSizeSel=document.getElementById('hw-page-size');
    var csvBtn=document.getElementById('hw-download-btn');

    var state={page:1,pageSize:10};
    (function(){
        try{
            var saved=localStorage.getItem('wg:system:pageSize');
            if(pageSizeSel&&saved&&['10','20','50','100'].indexOf(saved)>-1){ state.pageSize=parseInt(saved,10); pageSizeSel.value=saved; }
            if(pageSizeSel) pageSizeSel.addEventListener('change',function(){ var v=parseInt(pageSizeSel.value,10); if(!isNaN(v)){ state.page=1; state.pageSize=v; localStorage.setItem('wg:system:pageSize',String(v)); renderPage(); } });
        }catch(_){}
    })();

    function rows(){ return Array.from(tbody.querySelectorAll('tr')); }
    function total(){ return rows().length; }
    function pages(){ return Math.max(1,Math.ceil(total()/state.pageSize)); }
    function clampPage(){ var p=pages(); if(state.page>p)state.page=p; if(state.page<1)state.page=1; }
    var pgnInfo=document.getElementById('hw-pagination-info');
    var pgnFirst=document.getElementById('hw-first');
    var pgnPrev=document.getElementById('hw-prev');
    var pgnNext=document.getElementById('hw-next');
    var pgnLast=document.getElementById('hw-last');
    var pgnNumbers=document.getElementById('hw-page-numbers');

    function renderPage(){
        clampPage();
        var list=rows(), s=(state.page-1)*state.pageSize, e=s+state.pageSize-1;
        list.forEach(function(tr,i){
            var vis=i>=s&&i<=e;
            tr.style.display=vis?'':'none';
            if(vis) tr.removeAttribute('data-hidden'); else tr.setAttribute('data-hidden','1');
            var cb=tr.querySelector('.hw-row-check');
            if(cb) tr.classList.toggle('selected',!!cb.checked&&vis);
        });
        if(selectAll){
            var vis2=table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check');
            selectAll.checked=vis2.length?Array.prototype.every.call(vis2,function(c){return c.checked;}):false;
        }
        if(pageSizeSel){ var none=total()===0; pageSizeSel.disabled=none; }
        renderPagination();
    }

    function renderPagination(){
        var t=total(), tp=pages();
        if(pgnInfo){
            if(t===0){ pgnInfo.textContent='0개 항목'; }
            else { var s=(state.page-1)*state.pageSize+1, e=Math.min(state.page*state.pageSize,t); pgnInfo.textContent=s+'-'+e+' / '+t+'개'; }
        }
        var dp=state.page<=1, dn=state.page>=tp;
        if(pgnFirst){ pgnFirst.disabled=dp; pgnFirst.onclick=function(){ state.page=1; renderPage(); }; }
        if(pgnPrev){ pgnPrev.disabled=dp; pgnPrev.onclick=function(){ state.page=Math.max(1,state.page-1); renderPage(); }; }
        if(pgnNext){ pgnNext.disabled=dn; pgnNext.onclick=function(){ state.page=Math.min(tp,state.page+1); renderPage(); }; }
        if(pgnLast){ pgnLast.disabled=dn; pgnLast.onclick=function(){ state.page=tp; renderPage(); }; }
        if(!pgnNumbers) return;
        var ws=7, start=Math.max(1,state.page-Math.floor(ws/2)), end=Math.min(tp,start+ws-1);
        start=Math.max(1,end-ws+1);
        var html='';
        for(var p=start;p<=end;p++){ html+='<button class="page-btn'+(p===state.page?' active':'')+'" data-page="'+p+'" type="button">'+p+'</button>'; }
        pgnNumbers.innerHTML=html;
        pgnNumbers.onclick=function(ev){ var btn=ev.target.closest('[data-page]'); if(!btn)return; var pg=parseInt(btn.getAttribute('data-page'),10); if(!isNaN(pg)){ state.page=pg; renderPage(); } };
    }

    function updateEmpty(){
        var has=!!tbody.querySelector('tr');
        if(emptyEl){ emptyEl.hidden=has; emptyEl.style.display=has?'none':''; }
        if(csvBtn){ csvBtn.disabled=!has; csvBtn.title=has?'CSV 다운로드':'CSV 내보낼 항목이 없습니다.'; }
        renderPage();
    }

    /* Select-all */
    if(selectAll){
        selectAll.addEventListener('change',function(){
            var checks=table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check:not([disabled])');
            checks.forEach(function(c){ c.checked=!!selectAll.checked; var tr=c.closest('tr'); if(tr)tr.classList.toggle('selected',!!c.checked); });
        });
    }
    table.addEventListener('click',function(ev){
        var isCtrl=ev.target.closest('button, a, input, select, textarea, label');
        var onCb=ev.target.closest('input[type="checkbox"].hw-row-check');
        if(isCtrl&&!onCb)return; if(onCb)return;
        var tr=ev.target.closest('tr'); if(!tr||!tr.parentNode||tr.parentNode.tagName.toLowerCase()!=='tbody')return;
        if(tr.hasAttribute('data-hidden'))return;
        var cb=tr.querySelector('.hw-row-check'); if(!cb||cb.disabled)return;
        cb.checked=!cb.checked; tr.classList.toggle('selected',cb.checked);
        if(selectAll){ var vis=table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); if(vis.length) selectAll.checked=Array.prototype.every.call(vis,function(c){return c.checked;}); }
    });

    /* Helpers */
    function visibleRows(){ return rows().filter(function(tr){ return !(tr.hasAttribute('data-hidden')||tr.style.display==='none'); }); }
    function savedVisible(){ return visibleRows(); }

    /* URLs */
    function listUrl(){ return cfg.apiBase+'/'+encodeURIComponent(String(cfg.id))+'/systems'; }

    /* Load all rows */
    function renderRow(item){
        var tr=document.createElement('tr');
        tr.setAttribute('data-id',String(item.id));
        var html='<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>';
        COLS.forEach(function(col){
            if(col.key==='work_status_name'){
                var dotCls=statusDotCls(item);
                var val=cellVal(item,col);
                html+='<td data-col="'+col.key+'"><span class="status-pill"><span class="status-dot '+dotCls+'" aria-hidden="true"></span><span class="status-text">'+escapeHtml(val)+'</span></span></td>';
            } else {
                html+='<td data-col="'+col.key+'">'+escapeHtml(cellVal(item,col))+'</td>';
            }
        });
        tr.innerHTML=html;
        return tr;
    }

    var lastLoadedItems = [];

    /* Load all rows */
    async function loadRows(){
        if(!cfg.id){ tbody.innerHTML=''; lastLoadedItems=[]; updateEmpty(); return; }
        try{
            var res=await api(listUrl()); var items=norm(res);
            lastLoadedItems = items;
            tbody.innerHTML='';
            items.forEach(function(it){ tbody.appendChild(renderRow(it)); });
            updateEmpty();
        }catch(e){
            console.error('[tab41-system] loadRows failed',e);
            toast(cfg.label+' 목록을 불러오지 못했습니다.','error');
            lastLoadedItems=[]; tbody.innerHTML=''; updateEmpty();
        }
    }

    /* ===== 통계 분석 모달 (구분 탭 + 유형별 도넛 차트) ===== */
    var analyticsBtn = document.getElementById('sys-analytics-btn');
    var analyticsModal = document.getElementById('sys-analytics-modal');
    var analyticsClose = document.getElementById('sys-analytics-close');
    var analyticsEmpty = document.getElementById('sys-analytics-empty');
    var tabStrip = document.getElementById('sys-tab-strip');
    var tabContent = document.getElementById('sys-tab-content');

    function buildCatMap(items){
        var map = {};
        (items || []).forEach(function(it){
            var cat = (it.asset_category_name || '').trim() || '-';
            var type = (it.asset_type_name || '').trim() || '-';
            if(!map[cat]) map[cat] = { count:0, models:{} };
            map[cat].count++;
            map[cat].models[type] = (map[cat].models[type] || 0) + 1;
        });
        return map;
    }

    var TAB_ORDER = ['서버','스토리지','SAN','네트워크','보안장비'];
    var DONUT_COLORS = ['#6366F1','#3b82f6','#0ea5e9','#14b8a6','#22c55e','#eab308','#f97316','#ef4444','#a855f7','#94a3b8'];

    function renderTabStrip2(catMap){
        if(!tabStrip) return [];
        var all = Object.keys(catMap);
        var cats = [];
        TAB_ORDER.forEach(function(t){ if(all.indexOf(t) >= 0) cats.push(t); });
        all.forEach(function(t){ if(cats.indexOf(t) < 0) cats.push(t); });
        var html = '';
        cats.forEach(function(c,i){
            html += '<button class="va-tab'+(i===0?' active':'')+'" data-cat="'+c+'">'+escapeHtml(c)+' <span class="va-tab-count">'+catMap[c].count+'</span></button>';
        });
        tabStrip.innerHTML = html;
        return cats;
    }

    var donutTip = document.createElement('div');
    donutTip.className = 'va-sb-tooltip';
    donutTip.style.display = 'none';
    document.body.appendChild(donutTip);

    function renderCatContent2(catData){
        if(!tabContent) return;
        var models = Object.keys(catData.models).sort(function(a,b){ return catData.models[b] - catData.models[a]; });
        var segs = [], etcCount = 0;
        models.forEach(function(m,i){
            if(i < 9){ segs.push({name:m, count:catData.models[m]}); }
            else { etcCount += catData.models[m]; }
        });
        if(etcCount > 0) segs.push({name:'기타 ('+(models.length-9)+'종)', count:etcCount});

        var total = catData.count, R = 120, r = 76, cx = 140, cy = 140, svgSize = 280;
        var paths = '', angle = -90;
        segs.forEach(function(seg,si){
            var pct = total > 0 ? (seg.count / total) : 0;
            var sweep = pct * 360;
            if(sweep <= 0) return;
            var col = DONUT_COLORS[si % DONUT_COLORS.length];
            var pctStr = (pct * 100).toFixed(1);
            if(sweep >= 359.99){
                paths += '<path d="M'+cx+','+(cy-R)+' A'+R+','+R+' 0 1,1 '+cx+','+(cy+R)+' A'+R+','+R+' 0 1,1 '+cx+','+(cy-R)+' M'+cx+','+(cy-r)+' A'+r+','+r+' 0 1,0 '+cx+','+(cy+r)+' A'+r+','+r+' 0 1,0 '+cx+','+(cy-r)+'Z" fill="'+col+'" class="va-donut-seg" data-name="'+seg.name.replace(/"/g,'&quot;')+'" data-count="'+seg.count+'" data-pct="'+pctStr+'" data-color="'+col+'"/>';
            } else {
                var a1 = angle * Math.PI / 180, a2 = (angle + sweep) * Math.PI / 180;
                var large = sweep > 180 ? 1 : 0;
                var ox1 = cx + R*Math.cos(a1), oy1 = cy + R*Math.sin(a1);
                var ox2 = cx + R*Math.cos(a2), oy2 = cy + R*Math.sin(a2);
                var ix2 = cx + r*Math.cos(a2), iy2 = cy + r*Math.sin(a2);
                var ix1 = cx + r*Math.cos(a1), iy1 = cy + r*Math.sin(a1);
                paths += '<path d="M'+ox1.toFixed(2)+','+oy1.toFixed(2)+' A'+R+','+R+' 0 '+large+',1 '+ox2.toFixed(2)+','+oy2.toFixed(2)+' L'+ix2.toFixed(2)+','+iy2.toFixed(2)+' A'+r+','+r+' 0 '+large+',0 '+ix1.toFixed(2)+','+iy1.toFixed(2)+'Z" fill="'+col+'" class="va-donut-seg" data-name="'+seg.name.replace(/"/g,'&quot;')+'" data-count="'+seg.count+'" data-pct="'+pctStr+'" data-color="'+col+'"/>';
            }
            angle += sweep;
        });

        var html = '<div class="va-donut-wrap">';
        html += '<div class="va-donut-chart">';
        html += '<svg viewBox="0 0 '+svgSize+' '+svgSize+'">'+paths+'</svg>';
        html += '<div class="va-donut-center"><span class="va-donut-total">'+total+'</span><span class="va-donut-label">건</span></div>';
        html += '</div>';
        html += '<div class="va-donut-legend">';
        segs.forEach(function(seg,si){
            var col = DONUT_COLORS[si % DONUT_COLORS.length];
            var pct = total > 0 ? (seg.count / total * 100).toFixed(1) : '0.0';
            html += '<div class="va-donut-legend-item" data-name="'+seg.name.replace(/"/g,'&quot;')+'" data-count="'+seg.count+'" data-pct="'+pct+'" data-color="'+col+'">';
            html += '<span class="va-donut-ldot" style="background:'+col+'"></span>';
            html += '<span class="va-donut-lname">'+escapeHtml(seg.name)+'</span>';
            html += '<span class="va-donut-lval">'+seg.count+'</span>';
            html += '<span class="va-donut-lpct">'+pct+'%</span>';
            html += '</div>';
        });
        html += '</div></div>';
        tabContent.innerHTML = html;

        tabContent.addEventListener('mouseover', function(e){
            var seg = e.target.closest('.va-donut-seg');
            if(!seg) return;
            donutTip.innerHTML = '<span class="va-sb-tip-dot" style="background:'+seg.dataset.color+'"></span>'
                +'<span class="va-sb-tip-name">'+seg.dataset.name+'</span>'
                +'<span class="va-sb-tip-val">'+seg.dataset.count+'건 ('+seg.dataset.pct+'%)</span>';
            donutTip.style.display = '';
        });
        tabContent.addEventListener('mousemove', function(e){
            if(donutTip.style.display === 'none') return;
            donutTip.style.left = (e.clientX + 12) + 'px';
            donutTip.style.top = (e.clientY - 36) + 'px';
        });
        tabContent.addEventListener('mouseout', function(e){
            var seg = e.target.closest('.va-donut-seg');
            if(seg) donutTip.style.display = 'none';
        });
    }

    function renderAnalytics(){
        var items = lastLoadedItems;
        var total = items.length;
        if(!total){
            if(analyticsEmpty) analyticsEmpty.style.display = '';
            if(tabStrip) tabStrip.innerHTML = '';
            if(tabContent) tabContent.innerHTML = '';
            return;
        }
        if(analyticsEmpty) analyticsEmpty.style.display = 'none';
        var catMap = buildCatMap(items);
        var cats = renderTabStrip2(catMap);
        if(cats.length > 0) renderCatContent2(catMap[cats[0]]);
        if(tabStrip) tabStrip.onclick = function(e){
            var btn = e.target.closest('.va-tab');
            if(!btn) return;
            tabStrip.querySelectorAll('.va-tab').forEach(function(t){ t.classList.remove('active'); });
            btn.classList.add('active');
            var cat = btn.getAttribute('data-cat');
            if(catMap[cat]) renderCatContent2(catMap[cat]);
        };
    }

    function openModal(id){ var m=document.getElementById(id); if(!m)return; document.body.classList.add('modal-open'); m.classList.add('show'); m.setAttribute('aria-hidden','false'); }
    function closeModal(id){ var m=document.getElementById(id); if(!m)return; m.classList.remove('show'); m.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show'))document.body.classList.remove('modal-open'); }

    if(analyticsBtn) analyticsBtn.addEventListener('click', function(){ renderAnalytics(); openModal('sys-analytics-modal'); });
    if(analyticsClose) analyticsClose.addEventListener('click', function(){ closeModal('sys-analytics-modal'); });
    if(analyticsModal) analyticsModal.addEventListener('click', function(e){ if(e.target===analyticsModal) closeModal('sys-analytics-modal'); });



    /* CSV */
    function exportCSV(onlySel){
        var headers=COLS.map(function(c){return c.label;});
        var trs=savedVisible();
        if(onlySel) trs=trs.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb&&cb.checked; });
        if(!trs.length)return;
        function text(tr,col){ var td=tr.querySelector('[data-col="'+col+'"]'); return td?String(td.textContent||'').trim():''; }
        var dataRows=trs.map(function(tr){ return COLS.map(function(c){ return text(tr,c.key); }); });
        var lines=[headers].concat(dataRows).map(function(arr){ return arr.map(escapeCSV).join(','); });
        var csv='\uFEFF'+lines.join('\r\n');
        var d=new Date(), fn=cfg.filePrefix+d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'.csv';
        try{ var b=new Blob([csv],{type:'text/csv;charset=utf-8;'}); var u=URL.createObjectURL(b); var a=document.createElement('a'); a.href=u; a.download=fn; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u); }catch(_){}
    }
    (function wireCsv(){
        var modal=document.getElementById('hw-download-modal');
        var closeBtn=document.getElementById('hw-download-close');
        var confirmBtn=document.getElementById('hw-download-confirm');
        function openM(){ if(!modal)return; document.body.classList.add('modal-open'); modal.classList.add('show'); modal.setAttribute('aria-hidden','false'); }
        function closeM(){ if(!modal)return; modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show'))document.body.classList.remove('modal-open'); }
        if(csvBtn) csvBtn.addEventListener('click',function(){
            if(csvBtn.disabled)return;
            var saved=savedVisible(), sel=saved.filter(function(tr){ var cb=tr.querySelector('.hw-row-check'); return cb&&cb.checked; });
            if(!saved.length)return;
            var sub=document.getElementById('hw-download-subtitle');
            if(sub) sub.textContent=sel.length>0?('선택된 '+sel.length+'개 또는 전체 '+saved.length+'개 중 범위를 선택하세요.'):('현재 결과 '+saved.length+'개 항목을 CSV로 내보냅니다.');
            var rowSel=document.getElementById('hw-csv-range-row-selected'), optSel=document.getElementById('hw-csv-range-selected'), optAll=document.getElementById('hw-csv-range-all');
            if(rowSel)rowSel.hidden=!(sel.length>0); if(optSel){optSel.disabled=!(sel.length>0);optSel.checked=(sel.length>0);} if(optAll)optAll.checked=!(sel.length>0);
            openM();
        });
        if(closeBtn) closeBtn.addEventListener('click',closeM);
        if(modal){ modal.addEventListener('click',function(e){if(e.target===modal)closeM();}); document.addEventListener('keydown',function(e){if(e.key==='Escape'&&modal.classList.contains('show'))closeM();}); }
        if(confirmBtn) confirmBtn.addEventListener('click',function(){ var onlySel=!!(document.getElementById('hw-csv-range-selected')&&document.getElementById('hw-csv-range-selected').checked); exportCSV(onlySel); closeM(); });
    })();

    updateEmpty();
    loadRows();
});
})();
