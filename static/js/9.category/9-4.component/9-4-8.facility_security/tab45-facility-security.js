(function(){
    'use strict';

    var config = window.__FACILITY_SECURITY_SYSTEM_TAB__ || {};
    var item = config.item || {};
    var resource = text(config.resource || '');
    var label = text(config.label || '시설·보안');
    var targetModel = text(item.model_name || item.model || item.source_model_name || '');
    var rows = [];
    var filteredRows = [];
    var selectedIds = {};
    var page = 1;
    var pageSize = 10;
    var sortState = { col: null, dir: 'asc' };

    var columns = [
        { key: 'business_status', label: '업무 상태' },
        { key: 'business_name', label: '업무 이름' },
        { key: 'manufacturer_name', label: '시스템 제조사' },
        { key: 'model_name', label: '시스템 모델명' },
        { key: 'serial_number', label: '시스템 일련번호' },
        { key: 'place_name', label: '시스템 장소' },
        { key: 'system_owner_dept', label: '시스템 담당부서' },
        { key: 'system_owner', label: '시스템 담당자' },
        { key: 'service_owner_dept', label: '서비스 담당부서' },
        { key: 'service_owner', label: '서비스 담당자' }
    ];

    var endpoints = {
        access: '/api/datacenter/access/systems',
        data_delete: '/api/datacenter/data-deletion-systems?page_size=500',
        rack: '/api/org-racks',
        thermometer: '/api/org-thermometers',
        cctv: '/api/org-cctvs'
    };

    function ready(fn){
        if(document.readyState === 'loading'){
            document.addEventListener('DOMContentLoaded', fn);
        }else{
            fn();
        }
    }
    function byId(id){ return document.getElementById(id); }
    function text(value){ return String(value == null ? '' : value).trim(); }
    function norm(value){ return text(value).toLowerCase(); }
    function esc(value){
        return text(value).replace(/[&<>"']/g, function(ch){
            return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
        });
    }
    function dash(value){
        var valueText = text(value);
        return valueText || '-';
    }
    function pick(row, keys){
        var i;
        var value;
        for(i = 0; i < keys.length; i += 1){
            value = row[keys[i]];
            if(value !== undefined && value !== null && text(value) !== ''){
                return text(value);
            }
        }
        return '';
    }
    function toast(message, level){
        try{
            if(window.showToast){ window.showToast(message, level || 'info'); return; }
            if(window.BlsMessage && typeof window.BlsMessage.show === 'function'){
                window.BlsMessage.show(message);
                return;
            }
        }catch(_){ }
        if(level === 'error' || level === 'warning'){
            alert(message);
        }
    }
    function pad2(n){ return n < 10 ? '0' + n : '' + n; }
    function escapeCSV(value){ return '"' + text(value).replace(/"/g, '""') + '"'; }
    function downloadCSV(filename, lines){
        var csv = '\uFEFF' + lines.join('\r\n');
        var blob;
        var url;
        var link;
        try{
            blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            url = URL.createObjectURL(blob);
            link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }catch(_){
            link = document.createElement('a');
            link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
    function openModal(id){
        var modal = byId(id);
        if(!modal){ return; }
        document.body.classList.add('modal-open');
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
    }
    function closeModal(id){
        var modal = byId(id);
        if(!modal){ return; }
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
        if(!document.querySelector('.modal-overlay-full.show')){
            document.body.classList.remove('modal-open');
        }
    }
    function withQuery(url, key, value){
        if(!value){ return url; }
        return url + (url.indexOf('?') >= 0 ? '&' : '?') + encodeURIComponent(key) + '=' + encodeURIComponent(value);
    }
    function apiUrl(){
        var url = endpoints[resource] || ('/api/datacenter-facility-systems/' + encodeURIComponent(resource || ''));
        return withQuery(url, 'q', targetModel);
    }
    function extractRows(payload){
        if(Object.prototype.toString.call(payload) === '[object Array]'){
            return payload;
        }
        if(!payload){ return []; }
        return payload.items || payload.rows || payload.data || [];
    }
    function requestRows(){
        return fetch(apiUrl(), { credentials: 'same-origin' }).then(function(response){
            return response.json().catch(function(){ return {}; }).then(function(payload){
                if(!response.ok || payload.success === false){
                    throw new Error(payload.message || payload.error || ('요청 실패 (HTTP ' + response.status + ')'));
                }
                return extractRows(payload);
            });
        });
    }
    function normalizeRow(raw, index){
        raw = raw || {};
        var rowId = pick(raw, ['id', 'public_id', 'system_code', 'device_code', 'rack_code', 'thermo_code', 'cctv_code', 'system_name']);
        return {
            __id: text(rowId || (resource + '-' + index)),
            business_status: pick(raw, ['business_status', 'business_status_code', 'work_status', 'biz_work_status', 'status']),
            business_name: pick(raw, ['business_name', 'work_name', 'system_name', 'rack_name', 'name']),
            manufacturer_name: pick(raw, ['manufacturer_name', 'vendor', 'vendor_name', 'manufacturer_code', 'manufacturer']),
            model_name: pick(raw, ['model_name', 'system_model_name', 'model', 'rack_model', 'system_model_code']),
            serial_number: pick(raw, ['serial_number', 'serial']),
            place_name: pick(raw, ['place_name', 'place', 'center_name', 'center_code', 'system_location', 'rack_position', 'location', 'location_place', 'location_pos']),
            system_owner_dept: pick(raw, ['system_owner_dept', 'system_dept_code', 'system_owner_dept_code', 'system_dept', 'sys_dept']),
            system_owner: pick(raw, ['system_owner', 'system_owner_name', 'system_manager_id', 'system_owner_id', 'sys_owner']),
            service_owner_dept: pick(raw, ['service_owner_dept', 'service_dept_code', 'service_owner_dept_code', 'service_dept', 'svc_dept']),
            service_owner: pick(raw, ['service_owner', 'service_owner_name', 'service_manager_id', 'service_owner_id', 'svc_owner'])
        };
    }
    function isTargetRow(row){
        var model = norm(targetModel);
        if(!model || model === '-' || model === '모델명'){
            return true;
        }
        return norm(row.model_name) === model;
    }
    function applySort(){
        if(!sortState.col){ return; }
        filteredRows.sort(function(left, right){
            var leftVal = text(left[sortState.col]);
            var rightVal = text(right[sortState.col]);
            var compare = leftVal.localeCompare(rightVal, 'ko');
            return sortState.dir === 'asc' ? compare : -compare;
        });
    }
    function updateSortIndicators(){
        var table = byId('fsi-system-table');
        if(!table){ return; }
        Array.prototype.forEach.call(table.querySelectorAll('thead th.sortable'), function(th){
            th.classList.remove('sort-asc');
            th.classList.remove('sort-desc');
            if(th.getAttribute('data-sort-col') === sortState.col){
                th.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });
    }
    function filterRows(){
        filteredRows = rows.filter(isTargetRow);
        applySort();
        page = 1;
        render();
    }
    function totalPages(){
        return Math.max(1, Math.ceil(filteredRows.length / Math.max(1, pageSize)));
    }
    function pageRows(){
        var start = (page - 1) * pageSize;
        return filteredRows.slice(start, start + pageSize);
    }
    function syncSelectAll(){
        var selectAll = byId('fsi-system-select-all');
        var visible = pageRows();
        if(!selectAll){ return; }
        selectAll.checked = visible.length > 0 && visible.every(function(row){ return !!selectedIds[row.__id]; });
    }
    function statusHTML(value){
        var display = dash(value);
        if(display === '-'){
            return '-';
        }
        return '<span class="status-badge active">' + esc(display) + '</span>';
    }
    function renderRows(){
        var body = byId('fsi-system-table-body');
        if(!body){ return; }
        body.innerHTML = pageRows().map(function(row){
            var checked = selectedIds[row.__id] ? ' checked' : '';
            var selectedClass = selectedIds[row.__id] ? ' class="selected"' : '';
            var html = '<tr data-id="' + esc(row.__id) + '"' + selectedClass + '>';
            html += '<td><input type="checkbox" class="fsi-system-row-check" data-id="' + esc(row.__id) + '" aria-label="행 선택"' + checked + '></td>';
            columns.forEach(function(col){
                var value = row[col.key];
                html += '<td data-col="' + esc(col.key) + '">' + (col.key === 'business_status' ? statusHTML(value) : esc(dash(value))) + '</td>';
            });
            html += '</tr>';
            return html;
        }).join('');
    }
    function renderPagination(){
        var total = filteredRows.length;
        var totalPageCount = totalPages();
        var info = byId('fsi-system-pagination-info');
        var numbers = byId('fsi-system-page-numbers');
        var start;
        var end;
        var from;
        var to;
        var html = '';
        var i;

        if(page > totalPageCount){ page = totalPageCount; }
        if(page < 1){ page = 1; }

        if(info){
            start = total ? ((page - 1) * pageSize + 1) : 0;
            end = Math.min(total, page * pageSize);
            info.textContent = total ? (start + '-' + end + ' / ' + total + '개 항목') : '0개 항목';
        }
        if(numbers){
            from = Math.max(1, page - 2);
            to = Math.min(totalPageCount, from + 4);
            from = Math.max(1, to - 4);
            for(i = from; i <= to; i += 1){
                html += '<button type="button" class="page-btn' + (i === page ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
            }
            numbers.innerHTML = html;
        }
        setDisabled('fsi-system-first', page <= 1);
        setDisabled('fsi-system-prev', page <= 1);
        setDisabled('fsi-system-next', page >= totalPageCount);
        setDisabled('fsi-system-last', page >= totalPageCount);
    }
    function setDisabled(id, disabled){
        var button = byId(id);
        if(button){ button.disabled = !!disabled; }
    }
    function render(){
        var empty = byId('fsi-system-empty');
        var downloadBtn = byId('fsi-system-download-btn');
        renderRows();
        renderPagination();
        syncSelectAll();
        if(empty){ empty.hidden = filteredRows.length > 0; }
        if(downloadBtn){
            downloadBtn.disabled = filteredRows.length === 0;
            downloadBtn.title = filteredRows.length ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
        }
    }
    function loadRows(){
        return requestRows().then(function(items){
            rows = (items || []).map(normalizeRow);
            selectedIds = {};
            filterRows();
        }).catch(function(error){
            rows = [];
            filteredRows = [];
            selectedIds = {};
            render();
            toast(error.message || '데이터센터 등록 시스템을 불러오지 못했습니다.', 'error');
        });
    }
    function go(nextPage){
        page = nextPage;
        if(page < 1){ page = 1; }
        if(page > totalPages()){ page = totalPages(); }
        render();
    }
    function wirePagination(){
        var numbers = byId('fsi-system-page-numbers');
        var pageSizeSelect = byId('fsi-system-page-size');
        var saved;

        try{
            saved = localStorage.getItem('facility-security-system:pageSize');
            if(saved && ['10', '20', '50', '100'].indexOf(saved) >= 0){
                pageSize = parseInt(saved, 10);
                if(pageSizeSelect){ pageSizeSelect.value = saved; }
            }
        }catch(_){ }

        if(pageSizeSelect){
            pageSizeSelect.addEventListener('change', function(){
                var nextSize = parseInt(pageSizeSelect.value, 10);
                if(!isNaN(nextSize)){
                    pageSize = nextSize;
                    page = 1;
                    try{ localStorage.setItem('facility-security-system:pageSize', String(pageSize)); }catch(_){ }
                    render();
                }
            });
        }
        if(numbers){
            numbers.addEventListener('click', function(event){
                var button = event.target.closest('button.page-btn');
                if(button){ go(parseInt(button.getAttribute('data-page'), 10)); }
            });
        }
        if(byId('fsi-system-first')){ byId('fsi-system-first').addEventListener('click', function(){ go(1); }); }
        if(byId('fsi-system-prev')){ byId('fsi-system-prev').addEventListener('click', function(){ go(page - 1); }); }
        if(byId('fsi-system-next')){ byId('fsi-system-next').addEventListener('click', function(){ go(page + 1); }); }
        if(byId('fsi-system-last')){ byId('fsi-system-last').addEventListener('click', function(){ go(totalPages()); }); }
    }
    function wireSelection(){
        var table = byId('fsi-system-table');
        var selectAll = byId('fsi-system-select-all');
        if(selectAll){
            selectAll.addEventListener('change', function(){
                pageRows().forEach(function(row){
                    selectedIds[row.__id] = !!selectAll.checked;
                });
                renderRows();
                syncSelectAll();
            });
        }
        if(table){
            table.addEventListener('click', function(event){
                var checkbox = event.target.closest('input.fsi-system-row-check');
                var tr;
                var id;
                if(checkbox){
                    id = checkbox.getAttribute('data-id');
                    selectedIds[id] = !!checkbox.checked;
                    tr = checkbox.closest('tr');
                    if(tr){ tr.classList.toggle('selected', !!checkbox.checked); }
                    syncSelectAll();
                    return;
                }
                if(event.target.closest('button, a, input, select, textarea, label')){ return; }
                tr = event.target.closest('tr');
                if(!tr || !tr.parentNode || tr.parentNode.tagName.toLowerCase() !== 'tbody'){
                    return;
                }
                checkbox = tr.querySelector('input.fsi-system-row-check');
                if(!checkbox){ return; }
                checkbox.checked = !checkbox.checked;
                id = checkbox.getAttribute('data-id');
                selectedIds[id] = !!checkbox.checked;
                tr.classList.toggle('selected', !!checkbox.checked);
                syncSelectAll();
            });
        }
    }
    function wireSorting(){
        var table = byId('fsi-system-table');
        if(!table){ return; }
        table.addEventListener('click', function(event){
            var th = event.target.closest('th[data-sort-col]');
            var col;
            if(!th){ return; }
            col = th.getAttribute('data-sort-col');
            if(sortState.col === col){
                sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
            }else{
                sortState.col = col;
                sortState.dir = 'asc';
            }
            applySort();
            updateSortIndicators();
            page = 1;
            render();
        });
    }
    function csvFilename(){
        var now = new Date();
        var date = '' + now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate());
        var modelPart = targetModel ? ('_' + targetModel.replace(/[\\/:*?"<>|]+/g, '_')) : '';
        return '시설보안_' + label + '_데이터센터시스템' + modelPart + '_' + date + '.csv';
    }
    function exportRows(){
        var allRange = byId('fsi-system-csv-range-all');
        var useAll = !allRange || allRange.checked;
        var exportList = useAll ? filteredRows.slice() : filteredRows.filter(function(row){ return !!selectedIds[row.__id]; });
        var lines;
        if(!exportList.length){
            toast('내보낼 행이 없습니다.', 'warning');
            return;
        }
        lines = [columns.map(function(col){ return escapeCSV(col.label); }).join(',')];
        exportList.forEach(function(row){
            lines.push(columns.map(function(col){ return escapeCSV(row[col.key]); }).join(','));
        });
        downloadCSV(csvFilename(), lines);
        closeModal('fsi-system-download-modal');
        toast('CSV 다운로드가 완료되었습니다.', 'success');
    }
    function wireDownload(){
        var button = byId('fsi-system-download-btn');
        var closeButton = byId('fsi-system-download-close');
        var modal = byId('fsi-system-download-modal');
        var confirmButton = byId('fsi-system-download-confirm');
        if(button){ button.addEventListener('click', function(){ openModal('fsi-system-download-modal'); }); }
        if(closeButton){ closeButton.addEventListener('click', function(){ closeModal('fsi-system-download-modal'); }); }
        if(modal){
            modal.addEventListener('click', function(event){
                if(event.target === modal){ closeModal('fsi-system-download-modal'); }
            });
        }
        if(confirmButton){ confirmButton.addEventListener('click', exportRows); }
    }
    function init(){
        if(!resource){
            toast('시설·보안 구분을 확인하지 못했습니다.', 'error');
            return;
        }
        wirePagination();
        wireSelection();
        wireSorting();
        wireDownload();
        loadRows();
    }

    ready(init);
})();