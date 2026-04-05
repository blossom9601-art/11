/*
 * tab47-service.js  v2.3 –  업무 그룹 > 서비스 탭 CRUD
 * Columns (15): 서비스이름, 서비스시스템, 서비스부서, 서비스도메인,
 *   기밀(C), 민감(S), 공개(O), 설치영역, DMZ, 망분리,
 *   대외연동, BCP대상, 영향도, 비고
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
        var id='svc-msg-modal', old=document.getElementById(id);
        if(old&&old.parentNode) old.parentNode.removeChild(old);
        var ov=document.createElement('div'); ov.id=id;
        ov.className='server-add-modal blossom-message-modal modal-overlay-full';
        ov.setAttribute('aria-hidden','false');
        ov.innerHTML='<div class="server-add-content"><div class="server-add-header"><div class="server-add-title dispose-title"><h3>'+escapeHtml(title||'알림')+'</h3></div><button class="close-btn" type="button" title="닫기"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div><div class="server-add-body"><div class="dispose-content"><div class="dispose-text"><p>'+escapeHtml(msg)+'</p></div></div></div><div class="server-add-actions align-right"><div class="action-buttons right"><button type="button" class="btn-primary svc-modal-ok">확인</button></div></div></div>';
        document.body.appendChild(ov); ov.classList.add('show'); document.body.classList.add('modal-open');
        function close(){ ov.classList.remove('show'); ov.setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); setTimeout(function(){ if(ov.parentNode)ov.parentNode.removeChild(ov); },200); document.removeEventListener('keydown',esc); resolve(); }
        ov.querySelector('.close-btn').addEventListener('click',close);
        ov.querySelector('.svc-modal-ok').addEventListener('click',close);
        ov.addEventListener('click',function(e){ if(e.target===ov)close(); });
        var esc=function(e){ if(e.key==='Escape')close(); }; document.addEventListener('keydown',esc);
        try{ ov.querySelector('.svc-modal-ok').focus(); }catch(_){}
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
function norm(res){ if(!res)return[]; if(Array.isArray(res))return res; if(Array.isArray(res.items))return res.items; return[]; }
function normOne(res){ if(!res)return null; if(res.item)return res.item; if(res.id!=null)return res; return null; }

/* ── Constants ── */
var OX_OPTIONS=['O','X'];
var INSTALL_AREA_OPTIONS=['내부망','업무망','개발망','DMZ'];
var NET_SEP_OPTIONS=['물리','논리','구간','미적용'];
var IMPACT_OPTIONS=['매우 높음','높음','중간','낮음'];

/* ── Column definitions ── */
var COLS=[
    {key:'service_name',         label:'서비스 이름',  type:'text'},
    {key:'service_system',       label:'서비스 시스템',type:'system_toggle'},
    {key:'service_department',   label:'서비스 부서',  type:'dept_select'},
    {key:'service_domain',       label:'서비스 도메인',type:'domain_select'},
    {key:'confidential',         label:'기밀(C)',      type:'ox'},
    {key:'sensitive',            label:'민감(S)',      type:'ox'},
    {key:'open_level',           label:'공개(O)',      type:'ox'},
    {key:'install_area',         label:'설치영역',     type:'select', options:INSTALL_AREA_OPTIONS},
    {key:'dmz',                  label:'DMZ',          type:'ox_auto'},
    {key:'network_separation',   label:'망분리',       type:'select', options:NET_SEP_OPTIONS},
    {key:'external_link',        label:'대외연동',     type:'vpn_org_select'},
    {key:'bcp_target',           label:'BCP대상',      type:'ox'},
    {key:'impact_level',         label:'영향도',       type:'select', options:IMPACT_OPTIONS},
    {key:'remark',               label:'비고',         type:'text'}
];

function cellVal(item,col){
    var s=String(item&&item[col.key]==null?'':item[col.key]).trim();
    return s||'-';
}

/* ── Config ── */
function inferConfig(){
    var body=document.body, cls=body&&body.classList;
    if(!cls||!cls.contains('page-workgroup-service')) return null;
    return {
        label:'서비스',
        apiBase:'/api/work-groups',
        id: getQueryParamInt(['id','group_id','groupId']) || getFromSession('work_group_selected_row') || parseInt(body.getAttribute('data-cat-detail-id'),10) || 0,
        filePrefix:'workgroup_service_'
    };
}

/* ── Main ── */
ready(function(){
    var cfg=inferConfig();
    var table=document.getElementById('hw-spec-table');
    if(!cfg||!table) return;

    var tbody=table.querySelector('tbody')||table.appendChild(document.createElement('tbody'));
    var emptyEl=document.getElementById('hw-empty');
    var addBtn=document.getElementById('hw-row-add');
    var selectAll=document.getElementById('hw-select-all');
    var pageSizeSel=document.getElementById('hw-page-size');
    var csvBtn=document.getElementById('hw-download-btn');

    var pgnInfo=document.getElementById('hw-pagination-info');
    var pgnFirst=document.getElementById('hw-first');
    var pgnPrev=document.getElementById('hw-prev');
    var pgnNext=document.getElementById('hw-next');
    var pgnLast=document.getElementById('hw-last');
    var pgnNumbers=document.getElementById('hw-page-numbers');

    /* ── Reference data caches ── */
    var systemEntries=[];   /* [{work_name, system_name}] from hardware_asset */
    var departmentNames=[];
    var domainFqdnList=[];  /* FQDN list from DNS records + AD FQDNs */
    var vpnOrgNames=[];     /* 기관명 list from VPN partners */

    async function loadSystemNames(){
        var categories=['SERVER','STORAGE','SAN','NETWORK','SECURITY'];
        var seen={};
        systemEntries=[];
        for(var ci=0;ci<categories.length;ci++){
            try{
                var page=1, hasMore=true;
                while(hasMore){
                    var res=await api('/api/hardware/assets?asset_category='+encodeURIComponent(categories[ci])+'&page='+page+'&page_size=200');
                    var items=norm(res);
                    items.forEach(function(it){
                        var wn=String(it.work_name||'').trim();
                        var sn=String(it.system_name||'').trim();
                        if(!wn||wn==='-') return;
                        var key=wn+'|||'+sn;
                        if(seen[key]) return;
                        seen[key]=true;
                        systemEntries.push({work_name:wn, system_name:sn});
                    });
                    var total=res&&res.total?res.total:0;
                    hasMore=page*200<total;
                    page++;
                }
            }catch(_){}
        }
        systemEntries.sort(function(a,b){ return a.work_name.localeCompare(b.work_name)||a.system_name.localeCompare(b.system_name); });
    }

    async function loadDepartments(){
        try{
            var res=await api('/api/org-departments');
            var items=norm(res);
            departmentNames=items.map(function(it){ return String(it.dept_name||'').trim(); }).filter(Boolean);
            departmentNames=departmentNames.filter(function(v,i,a){ return a.indexOf(v)===i; });
        }catch(_){ departmentNames=[]; }
    }

    /* Load FQDN list from DNS records + AD FQDNs */
    async function loadDomainFqdns(){
        var fqdns=[];
        try{
            /* DNS records: iterate all policies and collect fqdn */
            var polRes=await api('/api/network/dns-policies');
            var policies=norm(polRes);
            for(var i=0;i<policies.length;i++){
                try{
                    var recs=await api('/api/network/dns-policies/'+encodeURIComponent(String(policies[i].id))+'/records?page_size=9999');
                    norm(recs).forEach(function(r){ if(r.fqdn) fqdns.push(String(r.fqdn).trim()); });
                }catch(_){}
            }
        }catch(_){}
        try{
            /* AD FQDNs: iterate all ADs and collect fqdn */
            var adRes=await api('/api/network/ad');
            var ads=norm(adRes);
            for(var j=0;j<ads.length;j++){
                try{
                    var fqdnRes=await api('/api/network/ad/'+encodeURIComponent(String(ads[j].id))+'/fqdns');
                    norm(fqdnRes).forEach(function(f){ if(f.fqdn) fqdns.push(String(f.fqdn).trim()); });
                }catch(_){}
            }
        }catch(_){}
        /* Deduplicate and sort */
        var seen={};
        domainFqdnList=fqdns.filter(function(v){ if(!v||seen[v])return false; seen[v]=true; return true; }).sort();
    }

    /* Load VPN partner org names */
    async function loadVpnOrgNames(){
        try{
            var res=await api('/api/network/vpn-partners?page_size=9999');
            var items=norm(res);
            var seen={};
            vpnOrgNames=items.map(function(it){ return String(it.org_name||'').trim(); })
                .filter(function(v){ if(!v||seen[v])return false; seen[v]=true; return true; })
                .sort();
        }catch(_){ vpnOrgNames=[]; }
    }

    /* ── Pagination ── */
    var state={page:1,pageSize:10};
    (function(){
        try{
            var saved=localStorage.getItem('wg:service:pageSize');
            if(pageSizeSel&&saved&&['10','20','50','100'].indexOf(saved)>-1){ state.pageSize=parseInt(saved,10); pageSizeSel.value=saved; }
            if(pageSizeSel) pageSizeSel.addEventListener('change',function(){ var v=parseInt(pageSizeSel.value,10); if(!isNaN(v)){ state.page=1; state.pageSize=v; localStorage.setItem('wg:service:pageSize',String(v)); renderPage(); } });
        }catch(_){}
    })();

    function rows(){ return Array.from(tbody.querySelectorAll('tr')); }
    function total(){ return rows().length; }
    function pages(){ return Math.max(1,Math.ceil(total()/state.pageSize)); }
    function clampPage(){ var p=pages(); if(state.page>p)state.page=p; if(state.page<1)state.page=1; }
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
        if(pageSizeSel){ pageSizeSel.disabled=total()===0; }
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
        var isCtrl=ev.target.closest('button, a, input, select, textarea, label, .svc-st-chip');
        var onCb=ev.target.closest('input[type="checkbox"].hw-row-check');
        if(isCtrl&&!onCb)return; if(onCb)return;
        var tr=ev.target.closest('tr'); if(!tr||!tr.parentNode||tr.parentNode.tagName.toLowerCase()!=='tbody')return;
        if(tr.hasAttribute('data-hidden'))return;
        var cb=tr.querySelector('.hw-row-check'); if(!cb||cb.disabled)return;
        cb.checked=!cb.checked; tr.classList.toggle('selected',cb.checked);
        if(selectAll){ var vis=table.querySelectorAll('tbody tr:not([data-hidden]) .hw-row-check'); if(vis.length) selectAll.checked=Array.prototype.every.call(vis,function(c){return c.checked;}); }
    });

    /* Helpers */
    function setEditing(tr,on){
        var cb=tr.querySelector('.hw-row-check'), del=tr.querySelector('.js-svc-del');
        if(on){ tr.setAttribute('data-editing','1'); if(cb)cb.disabled=true; if(del){del.style.visibility='hidden';del.style.pointerEvents='none';} tr.classList.remove('selected'); }
        else{ tr.removeAttribute('data-editing'); if(cb)cb.disabled=false; if(del){del.style.visibility='';del.style.pointerEvents='';} }
    }
    function isSaved(tr){ var t=tr.querySelector('.js-svc-toggle'); return !(t&&t.getAttribute('data-action')==='save'); }
    function visibleRows(){ return rows().filter(function(tr){ return !(tr.hasAttribute('data-hidden')||tr.style.display==='none'); }); }
    function savedVisible(){ return visibleRows().filter(isSaved); }

    /* URLs */
    function listUrl(){ return cfg.apiBase+'/'+encodeURIComponent(String(cfg.id))+'/services'; }
    function itemUrl(sid){ return cfg.apiBase+'/'+encodeURIComponent(String(cfg.id))+'/services/'+encodeURIComponent(String(sid)); }

    /* ── Build searchable O/X select ── */
    function buildOXSelect(val){
        var s=document.createElement('select');
        s.className='form-input search-select';
        s.setAttribute('data-searchable-scope','page');
        s.setAttribute('data-placeholder','선택');
        s.title='O/X';
        ['','O','X'].forEach(function(v){ var o=document.createElement('option'); o.value=v; o.textContent=v||'선택'; if(v&&v===val) o.selected=true; s.appendChild(o); });
        return s;
    }

    /* ── Build searchable generic select ── */
    function buildSelect(options,val,title){
        var s=document.createElement('select');
        s.className='form-input search-select';
        s.setAttribute('data-searchable-scope','page');
        s.setAttribute('data-placeholder','선택');
        s.title=title||'';
        var opt0=document.createElement('option'); opt0.value=''; opt0.textContent='선택'; s.appendChild(opt0);
        options.forEach(function(v){ var o=document.createElement('option'); o.value=v; o.textContent=v; if(v===val) o.selected=true; s.appendChild(o); });
        return s;
    }

    /* ── Build domain FQDN searchable select ── */
    function buildDomainSelect(val){
        var s=document.createElement('select');
        s.className='form-input search-select';
        s.setAttribute('data-searchable-scope','page');
        s.setAttribute('data-placeholder','도메인 검색');
        s.title='서비스 도메인';
        var opt0=document.createElement('option'); opt0.value=''; opt0.textContent='선택'; s.appendChild(opt0);
        domainFqdnList.forEach(function(name){
            var o=document.createElement('option'); o.value=name; o.textContent=name;
            if(name===val) o.selected=true;
            s.appendChild(o);
        });
        if(val && domainFqdnList.indexOf(val)===-1){
            var extra=document.createElement('option'); extra.value=val; extra.textContent=val; extra.selected=true;
            s.insertBefore(extra,s.children[1]);
        }
        return s;
    }

    /* ── Build VPN org name searchable select ── */
    function buildVpnOrgSelect(val){
        var s=document.createElement('select');
        s.className='form-input search-select';
        s.setAttribute('data-searchable-scope','page');
        s.setAttribute('data-placeholder','기관 검색');
        s.title='대외연동';
        var opt0=document.createElement('option'); opt0.value=''; opt0.textContent='선택'; s.appendChild(opt0);
        vpnOrgNames.forEach(function(name){
            var o=document.createElement('option'); o.value=name; o.textContent=name;
            if(name===val) o.selected=true;
            s.appendChild(o);
        });
        if(val && vpnOrgNames.indexOf(val)===-1){
            var extra=document.createElement('option'); extra.value=val; extra.textContent=val; extra.selected=true;
            s.insertBefore(extra,s.children[1]);
        }
        return s;
    }

    /* ── Build department searchable select ── */
    function buildDeptSelect(val){
        var s=document.createElement('select');
        s.className='form-input search-select';
        s.setAttribute('data-searchable-scope','page');
        s.setAttribute('data-placeholder','부서 검색');
        s.title='서비스 부서';
        var opt0=document.createElement('option'); opt0.value=''; opt0.textContent='선택'; s.appendChild(opt0);
        departmentNames.forEach(function(name){
            var o=document.createElement('option'); o.value=name; o.textContent=name;
            if(name===val) o.selected=true;
            s.appendChild(o);
        });
        /* If current value exists but not in dept list, add it as option */
        if(val && departmentNames.indexOf(val)===-1){
            var extra=document.createElement('option'); extra.value=val; extra.textContent=val; extra.selected=true;
            s.insertBefore(extra,s.children[1]);
        }
        return s;
    }

    /* ── Build system multi-select (searchable dropdown + selected chips) ── */
    function buildSystemToggle(selected){
        var sel=[];
        if(Array.isArray(selected)) sel=selected.slice();
        else if(typeof selected==='string'&&selected&&selected!=='-') sel=selected.split(',').map(function(s){return s.trim();}).filter(Boolean);

        var wrap=document.createElement('div');
        wrap.className='svc-system-toggle';

        /* Searchable dropdown select – 표시: "업무명 (시스템명)", 값: 업무명 */
        var selEl=document.createElement('select');
        selEl.className='form-input search-select';
        selEl.setAttribute('data-searchable-scope','page');
        selEl.setAttribute('data-placeholder','시스템 검색');
        selEl.title='서비스 시스템';
        var opt0=document.createElement('option'); opt0.value=''; opt0.textContent='시스템 선택'; selEl.appendChild(opt0);
        systemEntries.forEach(function(entry){
            var label=entry.work_name;
            if(entry.system_name && entry.system_name!=='-') label=entry.work_name+' ('+entry.system_name+')';
            var o=document.createElement('option'); o.value=entry.work_name; o.textContent=label; selEl.appendChild(o);
        });
        wrap.appendChild(selEl);

        /* Selected chips area */
        var chipArea=document.createElement('div');
        chipArea.className='svc-st-chips';
        wrap.appendChild(chipArea);

        function renderSelectedChips(){
            chipArea.innerHTML='';
            if(!sel.length){
                var p=document.createElement('span');
                p.className='svc-st-empty';
                p.textContent='선택된 시스템 없음';
                chipArea.appendChild(p);
                return;
            }
            sel.forEach(function(name){
                var chip=document.createElement('span');
                chip.className='svc-st-chip active';
                chip.textContent=name;
                var removeBtn=document.createElement('button');
                removeBtn.type='button';
                removeBtn.className='svc-st-chip-remove';
                removeBtn.innerHTML='&times;';
                removeBtn.title='제거';
                removeBtn.addEventListener('click',function(e){
                    e.preventDefault(); e.stopPropagation();
                    var idx=sel.indexOf(name);
                    if(idx>-1) sel.splice(idx,1);
                    renderSelectedChips();
                });
                chip.appendChild(removeBtn);
                chipArea.appendChild(chip);
            });
        }

        renderSelectedChips();

        /* On select change, add to selection */
        selEl.addEventListener('change',function(){
            var v=selEl.value;
            if(v && sel.indexOf(v)===-1){
                sel.push(v);
                renderSelectedChips();
            }
            selEl.value=''; /* reset dropdown */
            /* re-sync searchable UI */
            try{ if(window.BlossomSearchableSelect) window.BlossomSearchableSelect.enhance(selEl); }catch(_){}
        });

        wrap._getValues=function(){ return sel.join(', '); };

        return wrap;
    }

    /* ── Enhance searchable selects after DOM insert ── */
    function enhanceRow(tr){
        try{
            if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
                window.BlossomSearchableSelect.enhance(tr);
            }
        }catch(_){}
    }

    /* ── Helper: render O/X badge HTML ── */
    function oxBadgeHtml(v){
        var s=String(v||'').trim().toUpperCase();
        if(s==='O') return '<span class="cell-ox with-badge"><span class="ox-badge on">O</span></span>';
        if(s==='X') return '<span class="cell-ox with-badge"><span class="ox-badge off">X</span></span>';
        return '<span class="cell-ox with-badge"><span class="ox-badge is-empty">-</span></span>';
    }
    var OX_TYPES={'ox':1,'ox_auto':1};

    /* ── Render saved row ── */
    function renderRow(item){
        var tr=document.createElement('tr');
        tr.setAttribute('data-id',String(item.id));
        var html='<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>';
        COLS.forEach(function(col){
            var v=cellVal(item,col);
            if(col.key==='service_system'){
                var parts=String(v).split(',').map(function(s){return s.trim();}).filter(Boolean);
                if(!parts.length || (parts.length===1 && parts[0]==='-')) parts=['-'];
                html+='<td data-col="'+col.key+'"><span class="svc-sys-display">'+parts.map(function(p){return escapeHtml(p);}).join('<br>')+'</span></td>';
            } else if(OX_TYPES[col.type]){
                html+='<td data-col="'+col.key+'">'+oxBadgeHtml(v)+'</td>';
            } else {
                html+='<td data-col="'+col.key+'">'+escapeHtml(v)+'</td>';
            }
        });
        html+='<td class="service-actions table-actions">'
            +'<button class="action-btn js-svc-toggle" data-action="edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'
            +'<button class="action-btn danger js-svc-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
            +'</td>';
        tr.innerHTML=html;
        return tr;
    }

    /* ── Load all rows ── */
    async function loadRows(){
        if(!cfg.id){ tbody.innerHTML=''; updateEmpty(); return; }
        try{
            var res=await api(listUrl()); var items=norm(res);
            tbody.innerHTML='';
            items.forEach(function(it){ tbody.appendChild(renderRow(it)); });
            updateEmpty();
        }catch(e){
            console.error('[tab47-service] loadRows failed',e);
            toast(cfg.label+' 목록을 불러오지 못했습니다.','error');
            tbody.innerHTML=''; updateEmpty();
        }
    }

    /* ── Enter edit mode ── */
    function enterEdit(tr){
        COLS.forEach(function(col){
            var td=tr.querySelector('[data-col="'+col.key+'"]'); if(!td)return;
            var cur=String(td.textContent||'').trim(); if(cur==='-')cur='';

            if(col.type==='system_toggle'){
                /* <br> separated display → comma-separated for buildSystemToggle */
                var sysParts=Array.from(td.querySelectorAll('.svc-sys-display')).length
                    ? (td.innerText||'').split(/[\n\r]+/).map(function(s){return s.trim();}).filter(function(s){return s&&s!=='-';})
                    : (cur?cur.split(',').map(function(s){return s.trim();}).filter(Boolean):[]);
                td.innerHTML='';
                td.appendChild(buildSystemToggle(sysParts));
                return;
            }
            if(col.type==='dept_select'){
                td.innerHTML='';
                td.appendChild(buildDeptSelect(cur));
                return;
            }
            if(col.type==='domain_select'){
                td.innerHTML='';
                td.appendChild(buildDomainSelect(cur));
                return;
            }
            if(col.type==='vpn_org_select'){
                td.innerHTML='';
                td.appendChild(buildVpnOrgSelect(cur));
                return;
            }
            if(col.type==='ox'){
                td.innerHTML='';
                td.appendChild(buildOXSelect(cur));
                return;
            }
            if(col.type==='ox_auto'){
                td.innerHTML='';
                var sel=buildOXSelect(cur);
                sel.setAttribute('data-auto-dmz','1');
                td.appendChild(sel);
                return;
            }
            if(col.type==='select'){
                td.innerHTML='';
                td.appendChild(buildSelect(col.options,cur,col.label));
                return;
            }
            /* text */
            td.innerHTML='<input type="text" class="form-input" value="'+escapeHtml(cur)+'" placeholder="'+escapeHtml(col.label)+'">';
        });

        /* Wire DMZ auto-logic */
        var iaSelect=tr.querySelector('[data-col="install_area"] select');
        var dmzSelect=tr.querySelector('[data-col="dmz"] select');
        if(iaSelect&&dmzSelect){
            iaSelect.addEventListener('change',function(){
                dmzSelect.value=iaSelect.value==='DMZ'?'O':'X';
                /* sync searchable UI */
                try{ if(window.BlossomSearchableSelect) window.BlossomSearchableSelect.enhance(dmzSelect); }catch(_){}
            });
        }

        /* Enhance searchable selects */
        enhanceRow(tr);
    }

    /* ── Commit row (save text) ── */
    function commitRow(tr,item){
        COLS.forEach(function(col){
            var td=tr.querySelector('[data-col="'+col.key+'"]'); if(!td)return;
            var v=cellVal(item,col);
            if(col.key==='service_system'){
                var parts=String(v).split(',').map(function(s){return s.trim();}).filter(Boolean);
                if(!parts.length || (parts.length===1 && parts[0]==='-')) parts=['-'];
                td.innerHTML='<span class="svc-sys-display">'+parts.map(function(p){return escapeHtml(p);}).join('<br>')+'</span>';
            } else if(OX_TYPES[col.type]){
                td.innerHTML=oxBadgeHtml(v);
            } else {
                td.innerHTML=''; td.textContent=v;
            }
        });
    }

    /* ── Build payload from inputs ── */
    function buildPayload(tr){
        var p={};
        COLS.forEach(function(col){
            var td=tr.querySelector('[data-col="'+col.key+'"]'); if(!td)return;
            if(col.type==='system_toggle'){
                var wrap=td.querySelector('.svc-system-toggle');
                p[col.key]=wrap&&wrap._getValues?wrap._getValues():'';
                return;
            }
            var sel=td.querySelector('select');
            if(sel){ p[col.key]=sel.value||null; return; }
            var inp=td.querySelector('input[type="text"]');
            p[col.key]=inp?String(inp.value||'').trim()||null:null;
        });
        return p;
    }

    /* ── Add new row ── */
    if(addBtn){
        addBtn.addEventListener('click',function(){
            if(!cfg.id){ showModal('상세 ID가 없습니다.','알림'); return; }
            var tr=document.createElement('tr');
            var html='<td><input type="checkbox" class="hw-row-check" aria-label="행 선택"></td>';
            COLS.forEach(function(col){
                html+='<td data-col="'+col.key+'"></td>';
            });
            html+='<td class="service-actions table-actions">'
                +'<button class="action-btn js-svc-toggle" data-action="save" type="button" title="저장" aria-label="저장"><img src="/static/image/svg/save.svg" alt="저장" class="action-icon"></button>'
                +'<button class="action-btn danger js-svc-del" data-action="delete" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
                +'</td>';
            tr.innerHTML=html;

            /* Populate cells with inputs */
            COLS.forEach(function(col){
                var td=tr.querySelector('[data-col="'+col.key+'"]'); if(!td)return;
                if(col.type==='system_toggle'){ td.appendChild(buildSystemToggle([])); return; }
                if(col.type==='dept_select'){ td.appendChild(buildDeptSelect('')); return; }
                if(col.type==='domain_select'){ td.appendChild(buildDomainSelect('')); return; }
                if(col.type==='vpn_org_select'){ td.appendChild(buildVpnOrgSelect('')); return; }
                if(col.type==='ox'){ td.appendChild(buildOXSelect('')); return; }
                if(col.type==='ox_auto'){
                    var s2=buildOXSelect('');
                    s2.setAttribute('data-auto-dmz','1');
                    td.appendChild(s2); return;
                }
                if(col.type==='select'){ td.appendChild(buildSelect(col.options,'',col.label)); return; }
                td.innerHTML='<input type="text" class="form-input" value="" placeholder="'+escapeHtml(col.label)+'">';
            });
            tbody.appendChild(tr);
            setEditing(tr,true);

            /* Wire DMZ auto */
            var iaSelect=tr.querySelector('[data-col="install_area"] select');
            var dmzSelect=tr.querySelector('[data-col="dmz"] select');
            if(iaSelect&&dmzSelect){ iaSelect.addEventListener('change',function(){
                dmzSelect.value=iaSelect.value==='DMZ'?'O':'X';
                try{ if(window.BlossomSearchableSelect) window.BlossomSearchableSelect.enhance(dmzSelect); }catch(_){}
            }); }

            enhanceRow(tr);
            try{ state.page=pages(); }catch(_){} updateEmpty();
        });
    }

    /* ── Edit / Save / Delete ── */
    table.addEventListener('click',function(ev){
        var target=ev.target.closest('.js-svc-del, .js-svc-toggle'); if(!target)return;
        var tr=ev.target.closest('tr'); if(!tr)return;

        /* DELETE */
        if(target.classList.contains('js-svc-del')){
            (async function(){
                var sid=coerceInt(tr.getAttribute('data-id'));
                if(!sid){ if(tr.parentNode) tr.parentNode.removeChild(tr); clampPage(); updateEmpty(); return; }
                var ok=await confirmDelete('이 서비스를 삭제하시겠습니까?');
                if(!ok) return;
                try{
                    var res=await api(itemUrl(sid),{method:'DELETE'});
                    if(res&&res.success===false) throw new Error(res.message||'삭제 실패');
                    if(tr.parentNode) tr.parentNode.removeChild(tr); clampPage(); updateEmpty();
                }catch(e){ showModal(e.message||'삭제 중 오류가 발생했습니다.','오류'); }
            })();
            return;
        }

        /* EDIT / SAVE toggle */
        if(target.classList.contains('js-svc-toggle')){
            var mode=target.getAttribute('data-action')||'edit';
            if(mode==='edit'){
                enterEdit(tr);
                target.setAttribute('data-action','save'); target.title='저장'; target.setAttribute('aria-label','저장');
                target.innerHTML='<img src="/static/image/svg/save.svg" alt="저장" class="action-icon">';
                setEditing(tr,true);
                return;
            }
            if(mode==='save'){
                (async function(){
                    try{
                        if(!cfg.id) throw new Error('상세 ID가 없습니다.');
                        var sid=coerceInt(tr.getAttribute('data-id'));
                        var method=sid?'PUT':'POST';
                        var url=sid?itemUrl(sid):listUrl();
                        var payload=buildPayload(tr);
                        var res=await api(url,{method:method,body:JSON.stringify(payload)});
                        if(res&&res.success===false) throw new Error(res.message||'저장 실패');
                        var item=normOne(res)||res||{};
                        if(item.id!=null) tr.setAttribute('data-id',String(item.id));
                        commitRow(tr,item);
                        target.setAttribute('data-action','edit'); target.title='편집'; target.setAttribute('aria-label','편집');
                        target.innerHTML='<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">';
                        setEditing(tr,false); updateEmpty();
                    }catch(e){ showModal(e.message||'저장 중 오류가 발생했습니다.','오류'); }
                })();
                return;
            }
        }
    });

    /* ── Delete confirmation modal ── */
    var _deleteResolve=null;
    function confirmDelete(msg){
        return new Promise(function(resolve){
            _deleteResolve=resolve;
            var modal=document.getElementById('svc-delete-modal');
            var msgEl=document.getElementById('svc-delete-msg');
            if(msgEl) msgEl.textContent=msg||'이 서비스를 삭제하시겠습니까?';
            if(modal){ document.body.classList.add('modal-open'); modal.classList.add('show'); modal.setAttribute('aria-hidden','false'); }
        });
    }
    function _resolveDelete(val){
        var modal=document.getElementById('svc-delete-modal');
        if(modal){ modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-full.show'))document.body.classList.remove('modal-open'); }
        if(_deleteResolve){ _deleteResolve(val); _deleteResolve=null; }
    }
    (function _wireDeleteModal(){
        var ok=document.getElementById('svc-delete-confirm');
        var cancel=document.getElementById('svc-delete-cancel');
        var close=document.getElementById('svc-delete-close');
        var modal=document.getElementById('svc-delete-modal');
        if(ok) ok.addEventListener('click',function(){ _resolveDelete(true); });
        if(cancel) cancel.addEventListener('click',function(){ _resolveDelete(false); });
        if(close) close.addEventListener('click',function(){ _resolveDelete(false); });
        if(modal) modal.addEventListener('click',function(e){ if(e.target===modal) _resolveDelete(false); });
        document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&modal&&modal.classList.contains('show')) _resolveDelete(false); });
    })();

    /* ── CSV ── */
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

    /* ── Init ── */
    updateEmpty();
    Promise.all([loadSystemNames(), loadDepartments(), loadDomainFqdns(), loadVpnOrgNames()]).then(function(){ loadRows(); });
});
})();
