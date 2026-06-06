(function(){
'use strict';

var API = '/api/governance/service-masters';
var CATEGORY_LABELS = { external:'외부 서비스', integration:'연계 서비스', internal:'내부 서비스' };
var CATEGORY_META = [
    {key:'external', label:'외부 서비스', note:'고객/파트너 접점'},
    {key:'integration', label:'연계 서비스', note:'API/배치/기관 연동'},
    {key:'internal', label:'내부 서비스', note:'내부 업무 운영'}
];
var items = [];
var filtered = [];
var activeView = 'dashboard';
var searchQuery = '';
var pageState = {
    external:{page:1, size:10, selected:{}},
    integration:{page:1, size:10, selected:{}},
    internal:{page:1, size:10, selected:{}}
};
var pendingDeleteCategory = null;
var pendingDeleteIds = [];
var selectedSystems = [];
var departmentOptions = [];
var customerOptions = [];
var userOptions = [];
var systemResults = [];
var securityControls = [];
var securityControlPage = 1;
var securityControlPageSize = 6;
var activeServiceId = null;
var previewService = null;
var modalMode = 'edit';

function $(sel, root){ return (root || document).querySelector(sel); }
function $all(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(s){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]); }); }
function clean(v){ var s = String(v == null ? '' : v).trim(); return s && s !== '-' ? s : ''; }
function display(v){ return clean(v) || '-'; }
function toast(msg, type){ try { if(window.showToast) window.showToast(msg, type || 'info'); } catch(_) {} }
function isOn(v){ return String(v || '').toUpperCase() === 'O'; }
function debounce(fn, delay){
    var t = null;
    return function(){
        var args = arguments;
        clearTimeout(t);
        t = setTimeout(function(){ fn.apply(null, args); }, delay || 180);
    };
}

async function api(url, opts){
    var o = Object.assign({method:'GET', credentials:'same-origin'}, opts || {});
    o.headers = Object.assign({'Accept':'application/json', 'X-Requested-With':'XMLHttpRequest'}, o.headers || {});
    if(o.body && !o.headers['Content-Type']) o.headers['Content-Type'] = 'application/json';
    var res = await fetch(url, o);
    var text = await res.text();
    var json = {};
    try { json = text ? JSON.parse(text) : {}; } catch(_) { json = {success:false, message:text}; }
    if(!res.ok || json.success === false) throw new Error(json.message || ('HTTP ' + res.status));
    return json;
}

function serviceCategory(item){
    var cat = clean(item && item.service_category).toLowerCase();
    if(CATEGORY_LABELS[cat]) return cat;
    if(clean(item && item.external_link)) return 'integration';
    if(isOn(item && item.dmz) || isOn(item && item.open_level)) return 'external';
    return 'internal';
}

function countByCategory(source, key){ return source.filter(function(it){ return serviceCategory(it) === key; }).length; }
function percent(count, total){ return total ? Math.round((count / total) * 100) : 0; }
function impactRank(value){
    var v = clean(value).toLowerCase();
    if(v.indexOf('매우') > -1 || v.indexOf('very') > -1) return 4;
    if(v.indexOf('높') > -1 || v.indexOf('high') > -1) return 3;
    if(v.indexOf('중') > -1 || v.indexOf('medium') > -1) return 2;
    if(v.indexOf('낮') > -1 || v.indexOf('low') > -1) return 1;
    return 0;
}

function renderProgressBars(target, rows, total, variant){
    if(!target) return;
    target.className = target.className.replace(/\bservice-bars-\S+/g, '').trim();
    if(variant) target.className += ' service-bars-' + variant;
    target.innerHTML = rows.map(function(row, idx){
        var pct = percent(row.count, total);
        return '<div class="service-progress-row tone-' + ((idx % 5) + 1) + '"><div><span>' + esc(row.label) + '</span><strong>' + esc(row.count) +
            '</strong></div><i><b style="width:' + pct + '%"></b></i></div>';
    }).join('');
}

function renderSignalCards(target, rows){
    if(!target) return;
    target.className = 'service-risk-list service-signal-grid';
    target.innerHTML = rows.map(function(row, idx){
        return '<div class="service-signal-card tone-' + ((idx % 3) + 1) + '"><span>' + esc(row.label) + '</span><strong>' + esc(row.count) + '</strong><small>' + esc(row.note || '') + '</small></div>';
    }).join('');
}

function countByValue(source, key, value){
    return source.filter(function(it){ return clean(it && it[key]) === value; }).length;
}

function buildDepartmentRows(source){
    var counts = {};
    source.forEach(function(it){
        var dept = clean(it && it.service_department) || '미지정';
        counts[dept] = (counts[dept] || 0) + 1;
    });
    var rows = Object.keys(counts).map(function(label){ return {label:label, count:counts[label]}; });
    rows.sort(function(a, b){ return b.count - a.count || a.label.localeCompare(b.label); });
    return rows;
}

function layoutTreemap(rows, x, y, w, h){
    if(!rows.length) return [];
    if(rows.length === 1){
        return [{row:rows[0], x:x, y:y, w:w, h:h}];
    }
    var total = rows.reduce(function(sum, row){ return sum + row.count; }, 0);
    var half = total / 2;
    var acc = 0;
    var split = 0;
    for(var i=0; i<rows.length; i++){
        if(i > 0 && acc + rows[i].count > half) break;
        acc += rows[i].count;
        split = i + 1;
    }
    split = Math.max(1, Math.min(rows.length - 1, split));
    var leftRows = rows.slice(0, split);
    var rightRows = rows.slice(split);
    var leftTotal = leftRows.reduce(function(sum, row){ return sum + row.count; }, 0);
    var ratio = total ? leftTotal / total : 0;
    if(w >= h){
        var leftW = w * ratio;
        return layoutTreemap(leftRows, x, y, leftW, h).concat(layoutTreemap(rightRows, x + leftW, y, w - leftW, h));
    }
    var topH = h * ratio;
    return layoutTreemap(leftRows, x, y, w, topH).concat(layoutTreemap(rightRows, x, y + topH, w, h - topH));
}

function renderDepartmentTreemap(target, source){
    if(!target) return;
    var rows = buildDepartmentRows(source);
    var assigned = rows.filter(function(row){ return row.label !== '\uBBF8\uC9C0\uC815'; });
    var missing = rows.filter(function(row){ return row.label === '\uBBF8\uC9C0\uC815'; }).reduce(function(sum, row){ return sum + row.count; }, 0);
    var visible = assigned.slice(0, 14);
    if(assigned.length > visible.length){
        var restCount = assigned.slice(visible.length).reduce(function(sum, row){ return sum + row.count; }, 0);
        visible.push({label:'\uAE30\uD0C0 ' + (assigned.length - visible.length) + '\uAC1C \uBD80\uC11C', count:restCount, isOther:true});
    }
    var total = visible.reduce(function(sum, row){ return sum + row.count; }, 0);
    if(!total){
        target.innerHTML = '<div class="service-treemap-empty">\uB4F1\uB85D\uB41C \uBD80\uC11C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</div>';
        return;
    }
    var boxes = layoutTreemap(visible, 0, 0, 100, 100);
    target.innerHTML = '<div class="service-treemap-stage">' + boxes.map(function(box, idx){
        var row = box.row;
        var pct = Math.round((row.count / total) * 100);
        var cls = 'service-treemap-tile tone-' + ((idx % 6) + 1) + (row.isOther ? ' is-other' : '');
        var style = 'left:' + box.x.toFixed(3) + '%;top:' + box.y.toFixed(3) + '%;width:' + box.w.toFixed(3) + '%;height:' + box.h.toFixed(3) + '%';
        var compact = box.w < 20 || box.h < 22;
        return '<div class="' + cls + (compact ? ' is-compact' : '') + '" style="' + style + '" title="' + esc(row.label) + ': ' + esc(row.count) + '\uAC74 (' + pct + '%)"><span>' + esc(row.label) + '</span><strong>' + esc(row.count) + '</strong></div>';
    }).join('') + '</div>' +
        '<div class="service-treemap-meta"><span>\uBD80\uC11C ' + esc(assigned.length) + '\uAC1C</span><span>\uBBF8\uC9C0\uC815 ' + esc(missing) + '</span></div>';
}

function piePath(cx, cy, r, startAngle, endAngle){
    var start = polarToCartesian(cx, cy, r, endAngle);
    var end = polarToCartesian(cx, cy, r, startAngle);
    var largeArc = endAngle - startAngle <= 180 ? 0 : 1;
    return ['M', cx, cy, 'L', start.x, start.y, 'A', r, r, 0, largeArc, 0, end.x, end.y, 'Z'].join(' ');
}

function polarToCartesian(cx, cy, r, angle){
    var rad = (angle - 90) * Math.PI / 180;
    return {x:cx + (r * Math.cos(rad)), y:cy + (r * Math.sin(rad))};
}

function renderCsoPie(target, cso){
    if(!target) return;
    var rows = [
        {label:'\uAE30\uBC00(C)', count:cso.confidential, color:'#4f78a8'},
        {label:'\uBBFC\uAC10(S)', count:cso.sensitive, color:'#7f9cbb'},
        {label:'\uACF5\uAC1C(O)', count:cso.open, color:'#b7c7d6'}
    ];
    var sum = rows.reduce(function(total, row){ return total + row.count; }, 0);
    var cursor = 0;
    var paths = rows.map(function(row){
        var start = cursor;
        var span = sum ? (row.count / sum) * 360 : 0;
        cursor += span;
        var pct = sum ? Math.round((row.count / sum) * 100) : 0;
        if(!span) return '';
        var d = span >= 359.999 ? 'M 100 100 m -92 0 a 92 92 0 1 0 184 0 a 92 92 0 1 0 -184 0' : piePath(100, 100, 92, start, cursor);
        return '<path d="' + d + '" fill="' + row.color + '"><title>' + esc(row.label) + ': ' + esc(row.count) + '\uAC74 (' + pct + '%)</title></path>';
    }).join('');
    target.innerHTML = '<svg class="service-pie-svg" viewBox="0 0 200 200" role="img" aria-label="CSO ?? ?? ??">' +
        (sum ? paths : '<circle cx="100" cy="100" r="92" fill="#eef2f6"><title>\uB370\uC774\uD130 \uC5C6\uC74C</title></circle>') +
        '<circle cx="100" cy="100" r="49" fill="#fff"></circle>' +
        '<text x="100" y="96" text-anchor="middle" class="service-pie-total">' + esc(sum) + '</text>' +
        '<text x="100" y="118" text-anchor="middle" class="service-pie-caption">\uC18D\uC131 \uC120\uD0DD</text>' +
        '</svg>';
}

function renderDashboard(){
    var total = items.length;
    var buckets = {
        external: items.filter(function(it){ return serviceCategory(it) === 'external'; }),
        integration: items.filter(function(it){ return serviceCategory(it) === 'integration'; }),
        internal: items.filter(function(it){ return serviceCategory(it) === 'internal'; })
    };
    var installRows = [
        {label:'내부망', count:countByValue(items, 'install_area', '내부망')},
        {label:'업무망', count:countByValue(items, 'install_area', '업무망')},
        {label:'개발망', count:countByValue(items, 'install_area', '개발망')},
        {label:'DMZ', count:countByValue(items, 'install_area', 'DMZ')}
    ];
    var knownInstall = installRows.reduce(function(sum, row){ return sum + row.count; }, 0);
    if(total - knownInstall > 0) installRows.push({label:'미지정', count:total - knownInstall});

    var continuity = {
        bcp: items.filter(function(it){ return isOn(it.bcp_target); }).length,
        dr: items.filter(function(it){ return isOn(it.dr_built); }).length,
        critical: items.filter(function(it){ return impactRank(it.impact_level) >= 3; }).length
    };
    var cso = {
        confidential: items.filter(function(it){ return isOn(it.confidential); }).length,
        sensitive: items.filter(function(it){ return isOn(it.sensitive); }).length,
        open: items.filter(function(it){ return isOn(it.open_level); }).length
    };
    var values = {
        '#service-total-count': total,
        '#service-external-count': buckets.external.length,
        '#service-integration-count': buckets.integration.length,
        '#service-internal-count': buckets.internal.length,
    };
    Object.keys(values).forEach(function(sel){ var el = $(sel); if(el) el.textContent = String(values[sel]); });
    renderProgressBars($('#service-exposure-bars'), installRows, total, 'install');
    renderCsoPie($('#service-cso-chart'), cso);
    renderDepartmentTreemap($('#service-department-treemap'), items);
    renderSignalCards($('#service-priority-list'), [
        {label:'BCP 대상', count:continuity.bcp, note:'BCP 대상 = O'},
        {label:'DR 구축', count:continuity.dr, note:'DR 구축여부 = O'},
        {label:'고영향', count:continuity.critical, note:'영향도 높음 이상'}
    ]);
}

function serviceRows(category){
    return filtered.filter(function(it){ return serviceCategory(it) === category; });
}

function detailUrl(item){
    var publicId = item && item.public_id ? item.public_id : '';
    if(publicId) return '/service-management/' + encodeURIComponent(publicId);
    return '/b/gov_service_management_detail?id=' + encodeURIComponent(item && item.id ? item.id : '');
}

function oxBadgeHtml(value){
    var v = clean(value).toUpperCase();
    if(v === 'O') return '<span class="cell-ox with-badge"><span class="ox-badge on">O</span></span>';
    if(v === 'X') return '<span class="cell-ox with-badge"><span class="ox-badge off">X</span></span>';
    return '<span class="cell-ox with-badge"><span class="ox-badge is-empty">-</span></span>';
}

function rowHtml(item){
    var sec = [
        ['C', 'confidential', 'tone-3'],
        ['S', 'sensitive', 'tone-2'],
        ['O', 'open_level', 'tone-1']
    ].filter(function(row){ return isOn(item[row[1]]); }).map(function(row){
        return '<span class="num-badge ' + row[2] + '">' + esc(row[0]) + '</span>';
    }).join('');
    sec = sec ? '<span class="service-mini-badges">' + sec + '</span>' : '-';
    return '<tr data-service-id="' + esc(item.id) + '">' +
        '<td><input type="checkbox" class="service-row-check" value="' + esc(item.id) + '"></td>' +
        '<td><button type="button" class="service-name-link js-detail">' + esc(display(item.service_name)) + '</button></td>' +
        '<td>' + esc(display(item.service_department)) + '</td>' +
        '<td>' + esc(display(item.install_area)) + '</td>' +
        '<td>' + esc(display(item.network_separation)) + '</td>' +
        '<td>' + sec + '</td>' +
        '<td>' + oxBadgeHtml(item.dmz) + '</td>' +
        '<td>' + oxBadgeHtml(item.dr_built) + '</td>' +
        '<td>' + esc(display(item.impact_level)) + '</td>' +
        '<td class="system-actions table-actions"><button type="button" class="action-btn js-edit" title="수정" aria-label="수정"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정"></button></td>' +
    '</tr>';
}

function renderPageNumbers(category, current, totalPages){
    var wrap = $('[data-service-page-numbers="' + category + '"]');
    if(!wrap) return;
    var start = Math.max(1, current - 2);
    var end = Math.min(totalPages, start + 4);
    start = Math.max(1, end - 4);
    var html = '';
    for(var i=start; i<=end; i++) {
        html += '<button class="page-number' + (i === current ? ' active' : '') + '" data-page-number="' + i + '" data-page-category="' + category + '">' + i + '</button>';
    }
    wrap.innerHTML = html;
}

function renderTable(category){
    var rows = serviceRows(category);
    var state = pageState[category];
    var table = $('[data-service-table="' + category + '"]');
    if(!table) return;
    var tbody = $('tbody', table);
    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / state.size));
    if(state.page > totalPages) state.page = totalPages;
    var start = (state.page - 1) * state.size;
    var pageRows = rows.slice(start, start + state.size);
    tbody.innerHTML = pageRows.map(rowHtml).join('');
    tbody.__items = pageRows;

    var count = $('[data-service-count="' + category + '"]');
    if(count) count.textContent = String(total);
    var empty = $('[data-service-empty="' + category + '"]');
    if(empty) empty.hidden = total > 0;
    var info = $('[data-service-page-info="' + category + '"]');
    if(info) info.textContent = total ? (start + 1) + '-' + Math.min(start + state.size, total) + ' / ' + total + '개 항목' : '0개 항목';
    renderPageNumbers(category, state.page, totalPages);
    $all('[data-page-category="' + category + '"][data-page-action]').forEach(function(btn){
        var action = btn.dataset.pageAction;
        btn.disabled = total === 0 || (action === 'first' || action === 'prev' ? state.page <= 1 : state.page >= totalPages);
    });
    var allCheck = $('[data-service-select-all="' + category + '"]');
    if(allCheck) {
        allCheck.checked = pageRows.length > 0 && pageRows.every(function(it){ return !!state.selected[it.id]; });
        allCheck.indeterminate = pageRows.some(function(it){ return !!state.selected[it.id]; }) && !allCheck.checked;
    }
    $all('tr[data-service-id]', tbody).forEach(function(tr, idx){
        var item = pageRows[idx];
        var check = $('.service-row-check', tr);
        if(check) {
            check.checked = !!state.selected[item.id];
            check.addEventListener('change', function(){ state.selected[item.id] = check.checked; renderTable(category); });
        }
        var detailBtn = $('.js-detail', tr);
        if(detailBtn) detailBtn.addEventListener('click', function(e){ e.stopPropagation(); openViewModal(item, category); });
        var editBtn = $('.js-edit', tr);
        if(editBtn) editBtn.addEventListener('click', function(e){ e.stopPropagation(); openModal(item, category); });
    });
}

function previewRows(item){
    return [
        ['서비스 이름', item.service_name],
        ['서비스 부서', item.service_department],
        ['서비스 담당자', item.service_manager],
        ['서비스 도메인', item.service_domain],
        ['L4 IP', item.l4_ip],
        ['설치 영역', item.install_area],
        ['망분리', item.network_separation],
        ['기밀(C)', item.confidential],
        ['민감(S)', item.sensitive],
        ['공개(O)', item.open_level],
        ['DMZ', item.dmz],
        ['DR 구축여부', item.dr_built],
        ['BCP 대상', item.bcp_target],
        ['영향도', item.impact_level],
        ['대외기관', item.external_link],
        ['비고', item.remark]
    ];
}

function openPreviewModal(item){
    var modal = $('#service-preview-modal');
    if(!modal || !item) return;
    previewService = item;
    if(modal.parentNode !== document.body) document.body.appendChild(modal);
    var title = $('#service-preview-title');
    var subtitle = $('#service-preview-subtitle');
    var dl = $('#service-preview-dl');
    if(title) title.textContent = display(item.service_name);
    if(subtitle) subtitle.textContent = [serviceCategory(item), item.service_domain, item.l4_ip].map(display).filter(function(v){ return v !== '-'; }).join(' · ') || '서비스 마스터 주요 정보를 확인합니다.';
    if(dl) {
        dl.innerHTML = previewRows(item).map(function(row){
            return '<div><dt>' + esc(row[0]) + '</dt><dd>' + esc(display(row[1])) + '</dd></div>';
        }).join('');
    }
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
}

function closePreviewModal(){
    var modal = $('#service-preview-modal');
    if(!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
}

function renderLists(){ CATEGORY_META.forEach(function(meta){ renderTable(meta.key); }); }

function render(){
    $all('[data-service-view]').forEach(function(btn){ btn.classList.toggle('active', btn.dataset.serviceView === activeView); });
    $all('[data-service-view-panel]').forEach(function(panel){ panel.classList.toggle('active', panel.dataset.serviceViewPanel === activeView); });
    renderDashboard();
    renderLists();
}

function applyFilter(){
    var q = clean(searchQuery).toLowerCase();
    filtered = !q ? items.slice() : items.filter(function(it){
        return ['service_name','service_system','service_department','service_domain','service_description'].some(function(k){
            return String(it[k] || '').toLowerCase().indexOf(q) > -1;
        });
    });
    Object.keys(pageState).forEach(function(k){ pageState[k].page = 1; });
    render();
}

async function load(){
    try {
        var res = await api(API);
        items = Array.isArray(res.items) ? res.items : [];
        filtered = items.slice();
        applyFilter();
    } catch(e) {
        toast(e.message || '서비스 목록을 불러오지 못했습니다.', 'error');
    }
}

function showPanel(name){
    $all('[data-service-tab]').forEach(function(btn){ btn.classList.toggle('active', btn.dataset.serviceTab === name); });
    $all('[data-service-panel]').forEach(function(panel){ panel.classList.toggle('active', panel.dataset.servicePanel === name); });
}

function optionText(opt){ return opt ? (opt.textContent || opt.value || '').trim() : ''; }

function buildSearchSelect(select){
    if(!select || select.dataset.searchReady === '1') return;
    select.dataset.searchReady = '1';
    select.classList.add('service-native-select');
    var wrap = document.createElement('div');
    wrap.className = 'service-search-select';
    wrap.innerHTML = '<button type="button" class="service-search-select-trigger"><span></span><i></i></button>' +
        '<div class="service-search-select-menu"><input type="text" class="service-search-select-input" placeholder="검색"><div class="service-search-select-options"></div></div>';
    select.insertAdjacentElement('afterend', wrap);
    var trigger = $('.service-search-select-trigger', wrap);
    var label = $('.service-search-select-trigger span', wrap);
    var input = $('.service-search-select-input', wrap);
    var options = $('.service-search-select-options', wrap);

    function close(){ wrap.classList.remove('open'); }
    function render(filter){
        var q = clean(filter).toLowerCase();
        var html = '';
        $all('option', select).forEach(function(opt){
            var text = optionText(opt);
            if(q && text.toLowerCase().indexOf(q) === -1 && String(opt.value || '').toLowerCase().indexOf(q) === -1) return;
            html += '<button type="button" class="' + (opt.selected ? 'active' : '') + '" data-value="' + esc(opt.value) + '">' + esc(text || '선택') + '</button>';
        });
        options.innerHTML = html || '<p>검색 결과가 없습니다.</p>';
    }
    function sync(){
        var opt = select.options[select.selectedIndex];
        label.textContent = optionText(opt) || '선택';
        label.classList.toggle('placeholder', !select.value);
        render(input.value);
    }
    trigger.addEventListener('click', function(e){
        e.stopPropagation();
        if(select.disabled) return;
        $all('.service-search-select.open').forEach(function(peer){ if(peer !== wrap) peer.classList.remove('open'); });
        wrap.classList.toggle('open');
        if(wrap.classList.contains('open')) {
            input.value = '';
            render('');
            setTimeout(function(){ input.focus(); }, 20);
        }
    });
    input.addEventListener('input', function(){ render(input.value); });
    options.addEventListener('click', function(e){
        var btn = e.target.closest('button[data-value]');
        if(!btn) return;
        select.value = btn.dataset.value;
        select.dispatchEvent(new Event('change', {bubbles:true}));
        sync();
        close();
    });
    select.addEventListener('change', sync);
    sync();
}

function refreshSearchSelect(select){
    if(!select) return;
    var wrap = select.nextElementSibling && select.nextElementSibling.classList.contains('service-search-select') ? select.nextElementSibling : null;
    if(!wrap) { buildSearchSelect(select); return; }
    var label = $('.service-search-select-trigger span', wrap);
    var opt = select.options[select.selectedIndex];
    if(label) {
        label.textContent = optionText(opt) || '선택';
        label.classList.toggle('placeholder', !select.value);
    }
}

function initSearchSelects(){
    $all('#service-form select[data-search-select]').forEach(buildSearchSelect);
}

async function loadDepartments(){
    var sel = $('[name="service_department"]');
    if(!sel) return;
    try {
        var res = await api('/api/org-departments');
        departmentOptions = Array.isArray(res.items) ? res.items : [];
        var current = sel.value;
        sel.innerHTML = '<option value="">선택</option>' + departmentOptions.map(function(row){
            var name = clean(row.dept_name || row.name || row.department_name || row.title);
            return name ? '<option value="' + esc(name) + '">' + esc(name) + '</option>' : '';
        }).join('');
        if(current) {
            if(!$all('option', sel).some(function(opt){ return opt.value === current; })) {
                var opt = document.createElement('option');
                opt.value = current;
                opt.textContent = current;
                sel.appendChild(opt);
            }
            sel.value = current;
        }
        refreshSearchSelect(sel);
    } catch(e) {
        toast('부서 목록을 불러오지 못했습니다.', 'error');
    }
}

async function loadCustomers(){
    var sel = $('[name="external_link"]');
    if(!sel) return;
    try {
        var res = await api('/api/customer-clients');
        customerOptions = Array.isArray(res.items) ? res.items : [];
        var current = sel.value;
        sel.innerHTML = '<option value="">선택</option>' + customerOptions.map(function(row){
            var name = clean(row.customer_name || row.client_name || row.name || row.company_name || row.cust_name || row.title);
            return name ? '<option value="' + esc(name) + '">' + esc(name) + '</option>' : '';
        }).join('');
        if(current) {
            if(!$all('option', sel).some(function(opt){ return opt.value === current; })) {
                var opt = document.createElement('option');
                opt.value = current;
                opt.textContent = current;
                sel.appendChild(opt);
            }
            sel.value = current;
        }
        refreshSearchSelect(sel);
    } catch(e) {
        toast('고객 목록을 불러오지 못했습니다.', 'error');
    }
}

async function loadUsers(){
    var sel = $('[name="service_manager"]');
    if(!sel) return;
    try {
        var res = await api('/api/user-profiles?limit=2000');
        userOptions = Array.isArray(res.items) ? res.items : [];
        var current = sel.value;
        sel.innerHTML = '<option value="">선택</option>' + userOptions.map(function(row){
            var name = clean(row.name || row.user_name || row.nickname || row.emp_no);
            var dept = clean(row.department || row.dept_name || row.department_name);
            var label = name && dept ? name + ' (' + dept + ')' : name;
            return label ? '<option value="' + esc(label) + '">' + esc(label) + '</option>' : '';
        }).join('');
        if(current) {
            if(!$all('option', sel).some(function(opt){ return opt.value === current; })) {
                var opt = document.createElement('option');
                opt.value = current;
                opt.textContent = current;
                sel.appendChild(opt);
            }
            sel.value = current;
        }
        refreshSearchSelect(sel);
    } catch(e) {
        toast('사용자 목록을 불러오지 못했습니다.', 'error');
    }
}

async function loadSecurityControls(){
    try {
        var res = await api('/api/settings/security-controls?active=1');
        securityControls = Array.isArray(res.items) ? res.items : [];
        renderSecurityControlTable();
    } catch(e) {
        securityControls = [];
        renderSecurityControlTable();
        toast('보안통제 항목을 불러오지 못했습니다.', 'error');
    }
}

function currentCsoScopes(){
    var form = $('#service-form');
    if(!form) return [];
    var scopes = [];
    var c = $('[name="confidential"]', form);
    var s = $('[name="sensitive"]', form);
    var o = $('[name="open_level"]', form);
    if(c && isOn(c.value)) scopes.push('C');
    if(s && isOn(s.value)) scopes.push('S');
    if(o && isOn(o.value)) scopes.push('O');
    return scopes;
}

function rerenderSecurityControlsFromFirstPage(){
    securityControlPage = 1;
    renderSecurityControlTable();
}

function controlMatchesScope(control, scopes){
    if(!scopes.length) return false;
    var raw = clean(control && control.cso_scope).toUpperCase();
    if(!raw) return false;
    var parts = raw.split(/[,\s/]+/).filter(Boolean).sort();
    var selected = scopes.slice().sort();
    if(parts.length !== selected.length) return false;
    return selected.every(function(scope, idx){ return parts[idx] === scope; });
}

function controlScopeHtml(scope){
    var parts = clean(scope).toUpperCase().split(/[,\s/]+/).filter(Boolean);
    if(!parts.length) return '-';
    var tones = {C:'tone-3', S:'tone-2', O:'tone-1'};
    return '<span class="service-control-scope">' + parts.map(function(part){
        return '<span class="num-badge ' + esc(tones[part] || 'tone-1') + '">' + esc(part) + '</span>';
    }).join('') + '</span>';
}

function renderSecurityControlPagination(total){
    var info = $('#service-control-page-info');
    var numbers = $('#service-control-page-numbers');
    var prev = $('#service-control-prev');
    var next = $('#service-control-next');
    var totalPages = Math.max(1, Math.ceil(total / securityControlPageSize));
    if(securityControlPage > totalPages) securityControlPage = totalPages;
    var start = total ? (securityControlPage - 1) * securityControlPageSize + 1 : 0;
    var end = Math.min(securityControlPage * securityControlPageSize, total);
    if(info) info.textContent = total ? (start + '-' + end + ' / ' + total + '개') : '0개 항목';
    if(prev) prev.disabled = total === 0 || securityControlPage <= 1;
    if(next) next.disabled = total === 0 || securityControlPage >= totalPages;
    if(numbers) {
        var html = '';
        var from = Math.max(1, securityControlPage - 2);
        var to = Math.min(totalPages, from + 4);
        from = Math.max(1, to - 4);
        for(var i = from; i <= to; i++) {
            html += '<button type="button" class="page-btn' + (i === securityControlPage ? ' active' : '') + '" data-control-page="' + i + '">' + i + '</button>';
        }
        numbers.innerHTML = html;
    }
}

function renderSecurityControlTable(){
    var tbody = $('#service-control-body');
    if(!tbody) return;
    var scopes = currentCsoScopes();
    var rows = securityControls.filter(function(control){ return controlMatchesScope(control, scopes); });
    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / securityControlPageSize));
    if(securityControlPage > totalPages) securityControlPage = totalPages;
    var pageRows = rows.slice((securityControlPage - 1) * securityControlPageSize, securityControlPage * securityControlPageSize);
    renderSecurityControlPagination(total);
    if(!rows.length) {
        tbody.innerHTML = '<tr class="empty"><td colspan="5">적용할 보안통제 항목이 없습니다.</td></tr>';
        return;
    }
    tbody.innerHTML = pageRows.map(function(control){
        return '<tr data-control-id="' + esc(control.id) + '">' +
            '<td>' + esc(display(control.major_item)) + '</td>' +
            '<td>' + esc(display(control.middle_item)) + '</td>' +
            '<td>' + esc(display(control.control_id)) + '</td>' +
            '<td><strong>' + esc(display(control.sub_item || control.title)) + '</strong></td>' +
            '<td>' + controlScopeHtml(control.cso_scope) + '</td>' +
        '</tr>';
    }).join('');
}

function normalizeSystem(row){
    var status = clean(row && (row.system_status || row.status));
    return {
        id: String(row && row.id != null ? row.id : (row.system_name || row.work_name || Math.random())),
        system_type: clean(row && (row.system_type || row.type || row.os_type)),
        system_status: status,
        work_name: clean(row && (row.work_name || row.workName || row.hostname)),
        system_name: clean(row && (row.system_name || row.systemName || row.name)),
        op: status,
        serial: clean(row && row.serial)
    };
}

function parseSelectedSystems(item){
    var raw = clean(item && item.service_systems_json);
    if(raw) {
        try {
            var arr = JSON.parse(raw);
            if(Array.isArray(arr)) return arr.map(normalizeSystem).filter(function(it){ return it.work_name || it.system_name; });
        } catch(_) {}
    }
    var system = clean(item && item.service_system);
    return system ? system.split(',').map(function(name, idx){ return normalizeSystem({id:'legacy-' + idx, system_name:name.trim()}); }) : [];
}

function syncSelectedSystemFields(){
    var form = $('#service-form');
    if(!form) return;
    var names = selectedSystems.map(function(it){ return it.system_name || it.work_name; }).filter(Boolean);
    var sys = $('[name="service_system"]', form);
    var json = $('[name="service_systems_json"]', form);
    if(sys) sys.value = names.join(', ');
    if(json) json.value = JSON.stringify(selectedSystems);
}

function renderPickedSystems(){
    var tbody = $('#service-picked-systems');
    if(!tbody) return;
    if(!selectedSystems.length) {
        tbody.innerHTML = '<tr class="empty"><td colspan="5">선택된 시스템이 없습니다.</td></tr>';
        syncSelectedSystemFields();
        return;
    }
    tbody.innerHTML = selectedSystems.map(function(it, idx){
        return '<tr><td>' + esc(display(it.system_type)) + '</td><td>' + esc(display(it.system_status)) + '</td><td>' +
            esc(display(it.work_name)) + '</td><td>' + esc(display(it.system_name)) +
            '</td><td><button type="button" class="service-system-remove" data-idx="' + idx + '">삭제</button></td></tr>';
    }).join('');
    syncSelectedSystemFields();
}

async function searchSystems(q){
    try {
        var res = await api('/api/servers');
        var query = clean(q).toLowerCase();
        systemResults = (Array.isArray(res) ? res : (Array.isArray(res.items) ? res.items : [])).map(normalizeSystem).filter(function(it){
            if(!query) return true;
            return [it.system_type, it.system_status, it.work_name, it.system_name].some(function(v){
                return String(v || '').toLowerCase().indexOf(query) > -1;
            });
        });
        renderSystemResults();
    } catch(e) {
        systemResults = [];
        renderSystemResults();
    }
}

function renderSystemResults(){
    var tbody = $('#service-system-results');
    if(!tbody) return;
    if(!systemResults.length) {
        tbody.innerHTML = '<tr class="empty"><td colspan="6">검색 결과가 없습니다.</td></tr>';
        return;
    }
    var selectedKeys = {};
    selectedSystems.forEach(function(it){ selectedKeys[(it.system_name || '') + '|' + (it.work_name || '')] = true; });
    tbody.innerHTML = systemResults.map(function(it, idx){
        var key = (it.system_name || '') + '|' + (it.work_name || '');
        var isSelected = !!selectedKeys[key];
        return '<tr class="' + (isSelected ? 'is-selected' : '') + '"><td><input type="checkbox" data-system-result="' + idx + '"' + (isSelected ? ' checked' : '') + '></td><td>' +
            esc(display(it.system_type)) + '</td><td>' + esc(display(it.system_status)) + '</td><td>' +
            esc(display(it.work_name)) + '</td><td>' + esc(display(it.system_name)) + '</td><td>' +
            '<button type="button" class="service-system-inline-action" data-system-action="' + (isSelected ? 'remove' : 'add') + '" data-system-result="' + idx + '">' +
            (isSelected ? '삭제' : '추가') + '</button></td></tr>';
    }).join('');
}

function systemKey(item){
    return (item && item.system_name || '') + '|' + (item && item.work_name || '');
}

function addSelectedSystem(item){
    if(!item) return;
    var key = systemKey(item);
    var exists = selectedSystems.some(function(it){ return systemKey(it) === key; });
    if(!exists) selectedSystems.push(item);
    renderPickedSystems();
    renderSystemResults();
}

function removeSelectedSystem(item){
    if(!item) return;
    var key = systemKey(item);
    selectedSystems = selectedSystems.filter(function(it){ return systemKey(it) !== key; });
    renderPickedSystems();
    renderSystemResults();
}

function openSystemModal(){
    var modal = $('#service-system-modal');
    if(!modal) return;
    if(modal.parentNode !== document.body) document.body.appendChild(modal);
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    var search = $('#service-system-search-input');
    if(search) {
        search.value = '';
        setTimeout(function(){ search.focus(); }, 20);
    }
    searchSystems('');
}

function closeSystemModal(){
    var modal = $('#service-system-modal');
    if(!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    var serviceOpen = $('#service-modal') && $('#service-modal').classList.contains('show');
    if(!serviceOpen) document.body.classList.remove('modal-open');
}

function applySystemSelection(){
    var seen = {};
    selectedSystems.forEach(function(it){ seen[systemKey(it)] = true; });
    $all('[data-system-result]').forEach(function(check){
        if(!check.checked) return;
        var item = systemResults[parseInt(check.dataset.systemResult, 10)];
        if(!item) return;
        var key = systemKey(item);
        if(!seen[key]) {
            selectedSystems.push(item);
            seen[key] = true;
        }
    });
    renderPickedSystems();
    closeSystemModal();
}

function setReadonlyFieldHeaders(readonly){
    var form = $('#service-form');
    if(!form) return;
    $all('.service-readonly-value', form).forEach(function(el){ el.remove(); });
    $all('.service-tab-panel label', form).forEach(function(label){
        if(readonly) {
            if(!label.dataset.viewLabel) {
                var textNode = Array.prototype.slice.call(label.childNodes).find(function(node){
                    return node.nodeType === 3 && clean(node.nodeValue);
                });
                if(textNode) {
                    label.dataset.viewLabel = clean(textNode.nodeValue);
                    textNode.nodeValue = '';
                }
            }
            label.classList.add('service-readonly-field');
            var control = $('input, textarea, select', label);
            var value = control ? clean(control.value) : '';
            if(control && control.tagName === 'SELECT') {
                var option = control.options[control.selectedIndex];
                value = option ? clean(option.textContent) : value;
            }
            label.classList.toggle('service-readonly-empty', !value);
            var span = document.createElement('span');
            span.className = 'service-readonly-value';
            if(control && control.tagName === 'SELECT' && (value === 'O' || value === 'X')) {
                span.innerHTML = oxBadgeHtml(value);
            } else {
                span.textContent = value || '-';
            }
            label.appendChild(span);
            return;
        }
        if(label.dataset.viewLabel) {
            var restoreNode = Array.prototype.slice.call(label.childNodes).find(function(node){ return node.nodeType === 3; });
            if(restoreNode) restoreNode.nodeValue = label.dataset.viewLabel;
            else label.insertBefore(document.createTextNode(label.dataset.viewLabel), label.firstChild);
            delete label.dataset.viewLabel;
        }
        label.classList.remove('service-readonly-field');
        label.classList.remove('service-readonly-empty');
    });
}

function setModalReadonly(readonly){
    var modal = $('#service-modal');
    var form = $('#service-form');
    if(!modal || !form) return;
    modal.classList.toggle('service-modal-readonly', !!readonly);
    $all('input, textarea, select', form).forEach(function(el){
        if(el.id === 'service-id') return;
        el.disabled = !!readonly;
    });
    $all('.service-search-select-trigger', form).forEach(function(btn){ btn.disabled = !!readonly; });
    $all('.service-system-remove, #service-system-open', form).forEach(function(btn){ btn.disabled = !!readonly; });
    var save = $('.service-modal-actions .service-primary-btn[type="submit"]');
    var detail = $('#service-detail-btn');
    var cancel = $('#service-cancel-btn');
    if(save) save.hidden = !!readonly;
    if(detail) detail.hidden = !readonly;
    if(cancel) cancel.textContent = readonly ? '닫기' : '취소';
    setReadonlyFieldHeaders(readonly);
}

function fillServiceModal(item, category){
    var modal = $('#service-modal');
    var form = $('#service-form');
    if(!modal || !form) return false;
    activeServiceId = item && item.id ? item.id : null;
    if(modal.parentNode !== document.body) document.body.appendChild(modal);
    initSearchSelects();
    form.reset();
    $('#service-id').value = item && item.id ? String(item.id) : '';
    $all('[name]', form).forEach(function(el){
        if(item && Object.prototype.hasOwnProperty.call(item, el.name)) el.value = clean(item[el.name]);
    });
    var cat = $('[name="service_category"]', form);
    if(cat && (!item || !item.id)) cat.value = CATEGORY_LABELS[category || activeView] ? (category || activeView) : 'internal';
    if(cat && item && item.id) cat.value = serviceCategory(item);
    selectedSystems = parseSelectedSystems(item);
    renderPickedSystems();
    $all('select[data-search-select]', form).forEach(refreshSearchSelect);
    securityControlPage = 1;
    renderSecurityControlTable();
    showPanel('basic');
    return true;
}

function openModal(item, category){
    if(!fillServiceModal(item, category)) return;
    modalMode = 'edit';
    previewService = null;
    setModalReadonly(false);
    var modal = $('#service-modal');
    var form = $('#service-form');
    $('#service-modal-title').textContent = item && item.id ? '서비스 수정' : '서비스 등록';
    var subtitle = $('#service-modal-subtitle');
    if(subtitle) subtitle.textContent = '서비스 정보를 구획별로 입력합니다.';
    showPanel('basic');
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    var first = $('[name="service_name"]', form);
    if(first) setTimeout(function(){ first.focus(); }, 30);
}

function openViewModal(item, category){
    if(!fillServiceModal(item, category)) return;
    modalMode = 'view';
    previewService = item || null;
    setModalReadonly(true);
    var modal = $('#service-modal');
    $('#service-modal-title').textContent = '서비스 보기';
    var subtitle = $('#service-modal-subtitle');
    if(subtitle) subtitle.textContent = '등록된 서비스 정보를 확인합니다.';
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
}

function closeModal(){
    var modal = $('#service-modal');
    if(!modal) return;
    setModalReadonly(false);
    modalMode = 'edit';
    previewService = null;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
}

function formPayload(){
    var form = $('#service-form');
    var data = {};
    syncSelectedSystemFields();
    $all('[name]', form).forEach(function(el){ data[el.name] = clean(el.value) || null; });
    data.service_category = CATEGORY_LABELS[data.service_category] ? data.service_category : 'internal';
    return data;
}

async function saveForm(ev){
    ev.preventDefault();
    if(modalMode === 'view') return;
    var id = clean($('#service-id').value);
    try {
        var res = await api(id ? API + '/' + encodeURIComponent(id) : API, { method: id ? 'PUT' : 'POST', body: JSON.stringify(formPayload()) });
        closeModal();
        await load();
        toast('서비스가 저장되었습니다.', 'success');
    } catch(e) {
        toast(e.message || '서비스 저장에 실패했습니다.', 'error');
    }
}

async function removeItem(item){
    if(!item || !item.id) return;
    if(!window.confirm('서비스를 삭제하시겠습니까?')) return;
    try {
        await api(API + '/' + encodeURIComponent(item.id), {method:'DELETE'});
        await load();
        toast('서비스가 삭제되었습니다.', 'success');
    } catch(e) {
        toast(e.message || '서비스 삭제에 실패했습니다.', 'error');
    }
}

function openDeleteModal(category){
    var ids = Object.keys(pageState[category].selected).filter(function(id){ return pageState[category].selected[id]; });
    if(!ids.length) { toast('삭제할 서비스를 선택하세요.', 'info'); return; }
    pendingDeleteCategory = category;
    pendingDeleteIds = ids;
    var subtitle = $('#service-delete-subtitle');
    var modal = $('#service-delete-modal');
    if(subtitle) subtitle.textContent = '선택된 ' + ids.length + '개의 서비스를 정말 삭제하시겠습니까?';
    if(modal) {
        if(modal.parentNode !== document.body) document.body.appendChild(modal);
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
    }
}

function closeDeleteModal(){
    var modal = $('#service-delete-modal');
    if(modal) {
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('modal-open');
    pendingDeleteCategory = null;
    pendingDeleteIds = [];
}

async function confirmDeleteSelected(){
    var category = pendingDeleteCategory;
    var ids = pendingDeleteIds.slice();
    if(!category || !ids.length) return;
    try {
        for(var i=0; i<ids.length; i++) await api(API + '/' + encodeURIComponent(ids[i]), {method:'DELETE'});
        pageState[category].selected = {};
        closeDeleteModal();
        await load();
        toast('선택한 서비스가 삭제되었습니다.', 'success');
    } catch(e) {
        toast(e.message || '서비스 삭제에 실패했습니다.', 'error');
    }
}

function wire(){
    var close = $('#service-modal-close');
    var cancel = $('#service-cancel-btn');
    var form = $('#service-form');
    var deleteClose = $('#service-delete-close');
    var deleteConfirm = $('#service-delete-confirm');
    var systemOpen = $('#service-system-open');
    var systemClose = $('#service-system-close');
    var systemCancel = $('#service-system-cancel');
    var systemApply = $('#service-system-apply');
    var systemSearch = $('#service-system-search-input');
    var previewClose = $('#service-preview-close');
    var previewEdit = $('#service-preview-edit');
    var previewDetail = $('#service-preview-detail');
    var modalDetail = $('#service-detail-btn');
    if(close) close.addEventListener('click', closeModal);
    if(cancel) cancel.addEventListener('click', closeModal);
    if(form) form.addEventListener('submit', saveForm);
    initSearchSelects();
    loadDepartments();
    loadCustomers();
    loadUsers();
    loadSecurityControls();
    $all('#service-form select[name="confidential"], #service-form select[name="sensitive"], #service-form select[name="open_level"]').forEach(function(sel){
        sel.addEventListener('change', rerenderSecurityControlsFromFirstPage);
    });
    var controlPrev = $('#service-control-prev');
    var controlNext = $('#service-control-next');
    var controlPages = $('#service-control-page-numbers');
    if(controlPrev) controlPrev.addEventListener('click', function(){
        securityControlPage = Math.max(1, securityControlPage - 1);
        renderSecurityControlTable();
    });
    if(controlNext) controlNext.addEventListener('click', function(){
        securityControlPage += 1;
        renderSecurityControlTable();
    });
    if(controlPages) controlPages.addEventListener('click', function(e){
        var btn = e.target.closest('[data-control-page]');
        if(!btn) return;
        securityControlPage = parseInt(btn.dataset.controlPage, 10) || 1;
        renderSecurityControlTable();
    });
    if(systemOpen) systemOpen.addEventListener('click', openSystemModal);
    if(systemClose) systemClose.addEventListener('click', closeSystemModal);
    if(systemCancel) systemCancel.addEventListener('click', closeSystemModal);
    if(systemApply) systemApply.addEventListener('click', applySystemSelection);
    if(systemSearch) systemSearch.addEventListener('input', debounce(function(){ searchSystems(systemSearch.value); }, 180));
    if(previewClose) previewClose.addEventListener('click', closePreviewModal);
    if(previewEdit) previewEdit.addEventListener('click', function(){
        var item = previewService;
        closePreviewModal();
        if(item) openModal(item, serviceCategory(item));
    });
    if(previewDetail) previewDetail.addEventListener('click', function(){
        if(previewService) window.location.href = detailUrl(previewService);
    });
    if(modalDetail) modalDetail.addEventListener('click', function(){
        if(previewService) window.location.href = detailUrl(previewService);
    });
    document.addEventListener('click', function(e){
        var remove = e.target.closest('.service-system-remove');
        if(remove) {
            selectedSystems.splice(parseInt(remove.dataset.idx, 10), 1);
            renderPickedSystems();
            return;
        }
        var inlineAction = e.target.closest('.service-system-inline-action');
        if(inlineAction) {
            var item = systemResults[parseInt(inlineAction.dataset.systemResult, 10)];
            if(inlineAction.dataset.systemAction === 'remove') removeSelectedSystem(item);
            else addSelectedSystem(item);
            return;
        }
        var resultCheck = e.target.closest('input[data-system-result]');
        if(resultCheck) {
            var tr = resultCheck.closest('tr');
            if(tr) tr.classList.toggle('is-selected', resultCheck.checked);
            return;
        }
        if(!e.target.closest('.service-search-select')) $all('.service-search-select.open').forEach(function(el){ el.classList.remove('open'); });
    });
    $all('[data-service-search]').forEach(function(input){
        input.addEventListener('input', function(){
            searchQuery = input.value;
            $all('[data-service-search]').forEach(function(peer){ if(peer !== input) peer.value = input.value; });
            applyFilter();
        });
    });
    $all('[data-service-view]').forEach(function(btn){ btn.addEventListener('click', function(){ activeView = btn.dataset.serviceView || 'dashboard'; render(); }); });
    $all('[data-service-tab]').forEach(function(btn){ btn.addEventListener('click', function(){ showPanel(btn.dataset.serviceTab); }); });
    $all('[data-service-add]').forEach(function(btn){ btn.addEventListener('click', function(){ openModal(null, btn.dataset.serviceAdd); }); });
    if(deleteClose) deleteClose.addEventListener('click', closeDeleteModal);
    if(deleteConfirm) deleteConfirm.addEventListener('click', confirmDeleteSelected);
    $all('[data-service-bulk-delete]').forEach(function(btn){ btn.addEventListener('click', function(){ openDeleteModal(btn.dataset.serviceBulkDelete); }); });
    $all('[data-service-page-size]').forEach(function(sel){
        sel.addEventListener('change', function(){
            var category = sel.dataset.servicePageSize;
            pageState[category].size = parseInt(sel.value, 10) || 10;
            pageState[category].page = 1;
            renderTable(category);
        });
    });
    $all('[data-service-select-all]').forEach(function(check){
        check.addEventListener('change', function(){
            var category = check.dataset.serviceSelectAll;
            var rows = serviceRows(category);
            var state = pageState[category];
            rows.slice((state.page - 1) * state.size, state.page * state.size).forEach(function(it){ state.selected[it.id] = check.checked; });
            renderTable(category);
        });
    });
    document.addEventListener('click', function(e){
        var pageBtn = e.target.closest('[data-page-category]');
        if(!pageBtn) return;
        var category = pageBtn.dataset.pageCategory;
        var state = pageState[category];
        var totalPages = Math.max(1, Math.ceil(serviceRows(category).length / state.size));
        if(pageBtn.dataset.pageNumber) state.page = parseInt(pageBtn.dataset.pageNumber, 10) || 1;
        if(pageBtn.dataset.pageAction === 'first') state.page = 1;
        if(pageBtn.dataset.pageAction === 'prev') state.page = Math.max(1, state.page - 1);
        if(pageBtn.dataset.pageAction === 'next') state.page = Math.min(totalPages, state.page + 1);
        if(pageBtn.dataset.pageAction === 'last') state.page = totalPages;
        renderTable(category);
    });
    var modal = $('#service-modal');
    if(modal) modal.addEventListener('click', function(e){ if(e.target === modal) closeModal(); });
    var deleteModal = $('#service-delete-modal');
    if(deleteModal) deleteModal.addEventListener('click', function(e){ if(e.target === deleteModal) closeDeleteModal(); });
    var systemModal = $('#service-system-modal');
    if(systemModal) systemModal.addEventListener('click', function(e){ if(e.target === systemModal) closeSystemModal(); });
    var previewModal = $('#service-preview-modal');
    if(previewModal) previewModal.addEventListener('click', function(e){ if(e.target === previewModal) closePreviewModal(); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') { closeSystemModal(); closeModal(); closeDeleteModal(); closePreviewModal(); } });
}

function init(){
    var root = $('.gov-service-root');
    if(!root || root.dataset.serviceManagementReady === '1') return;
    root.dataset.serviceManagementReady = '1';
    wire();
    load();
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
document.addEventListener('blossom:pageLoaded', init);
})();
