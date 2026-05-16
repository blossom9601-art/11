(function(){
    'use strict';

    var config = window.__DC_FACILITY_CONFIG__ || {};
    var resource = String(config.resource || '').trim() || 'ups';
    var label = String(config.label || '').trim() || '시설';
    var apiBase = '/api/datacenter-facility-systems/' + encodeURIComponent(resource);
    var rows = [];
    var filteredRows = [];
    var selectedIds = {};
    var page = 1;
    var pageSize = 10;
    var editingId = null;
    var referenceSourceCache = {};

    var referenceFkConfig = {
        place_name: { endpoint: '/api/org-centers', valueKey: 'center_code', labelKey: 'center_name', payloadKey: 'center_name', placeholder: '센터 선택' },
        system_owner_dept: { endpoint: '/api/org-departments', valueKey: 'dept_code', labelKey: 'dept_name', payloadKey: 'dept_name', placeholder: '부서 선택' },
        service_owner_dept: { endpoint: '/api/org-departments', valueKey: 'dept_code', labelKey: 'dept_name', payloadKey: 'dept_name', placeholder: '부서 선택' },
        system_owner: { endpoint: '/api/user-profiles?limit=2000', valueKey: 'emp_no', labelKey: 'name', payloadKey: 'name', placeholder: '담당자 선택', dependsOn: 'system_owner_dept' },
        service_owner: { endpoint: '/api/user-profiles?limit=2000', valueKey: 'emp_no', labelKey: 'name', payloadKey: 'name', placeholder: '담당자 선택', dependsOn: 'service_owner_dept' }
    };

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

    function byId(id){ return document.getElementById(id); }
    function text(value){ return String(value == null ? '' : value).trim(); }
    function esc(value){
        return text(value).replace(/[&<>"']/g, function(ch){
            return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
        });
    }
    function showMessage(message){
        if(window.BlsMessage && typeof window.BlsMessage.show === 'function'){
            window.BlsMessage.show(message);
            return;
        }
        alert(message);
    }
    function normalize(row){
        row = row || {};
        return {
            id: row.id,
            public_id: text(row.public_id),
            system_code: text(row.system_code || row.device_code),
            business_status: text(row.business_status),
            business_name: text(row.business_name),
            manufacturer_name: text(row.manufacturer_name || row.vendor),
            model_name: text(row.model_name || row.model),
            serial_number: text(row.serial_number || row.serial),
            place_name: text(row.place_name || row.place),
            system_owner_dept: text(row.system_owner_dept),
            system_owner: text(row.system_owner || row.system_owner_name),
            service_owner_dept: text(row.service_owner_dept),
            service_owner: text(row.service_owner || row.service_owner_name),
            remark: text(row.remark || row.note)
        };
    }
    function requestJSON(url, options){
        var opts = options || {};
        opts.credentials = opts.credentials || 'same-origin';
        opts.method = opts.method || 'GET';
        opts.headers = opts.headers || {};
        if(opts.body && typeof opts.body !== 'string'){
            opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
            opts.body = JSON.stringify(opts.body);
        }
        return fetch(url, opts).then(function(response){
            return response.json().catch(function(){ return {}; }).then(function(payload){
                if(!response.ok || payload.success === false){
                    throw new Error(payload.message || payload.error || ('요청 실패 (HTTP ' + response.status + ')'));
                }
                return payload;
            });
        });
    }
    function formValue(form, name){
        var el = form ? form.elements[name] : null;
        return text(el ? el.value : '');
    }
    function getReferenceConfig(name){
        return referenceFkConfig[name] || null;
    }
    function selectedOption(select){
        return select && select.selectedOptions && select.selectedOptions.length ? select.selectedOptions[0] : null;
    }
    function referencePayloadValue(form, name){
        var el = form ? form.elements[name] : null;
        if(!el){ return ''; }
        if(el.getAttribute && el.getAttribute('data-dc-reference-fk') === '1'){
            if(!text(el.value)){ return ''; }
            var opt = selectedOption(el);
            if(opt){ return text(opt.getAttribute('data-payload') || opt.textContent || el.value); }
        }
        return text(el.value);
    }
    function syncSearchable(scope){
        function run(){
            try {
                if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
                    window.BlossomSearchableSelect.syncAll(scope || document);
                    return true;
                }
            } catch(_e){}
            try {
                if(window.DcFacilityFk && typeof window.DcFacilityFk.sync === 'function'){
                    window.DcFacilityFk.sync(scope || document);
                    return true;
                }
            } catch(_e2){}
            return false;
        }
        if(!run()){
            setTimeout(run, 0);
            setTimeout(run, 120);
        }
    }
    function extractItems(payload){
        if(Array.isArray(payload)){ return payload; }
        if(payload && Array.isArray(payload.items)){ return payload.items; }
        if(payload && Array.isArray(payload.rows)){ return payload.rows; }
        return [];
    }
    function makeReferenceOption(fieldName, item){
        var cfg = getReferenceConfig(fieldName);
        if(!cfg){ return null; }
        var value = text(item && item[cfg.valueKey]);
        var payload = text(item && item[cfg.payloadKey]) || text(item && item[cfg.labelKey]) || value;
        var label = text(item && item[cfg.labelKey]) || payload || value;
        if(fieldName === 'system_owner' || fieldName === 'service_owner'){
            var empNo = value;
            var userName = payload || label;
            var deptName = text(item && item.department);
            label = userName;
            if(empNo){ label += ' (' + empNo + ')'; }
            if(deptName){ label += ' - ' + deptName; }
        }
        if(!value && payload){ value = payload; }
        if(!value){ return null; }
        return {
            value: value,
            label: label || value,
            payload: payload || label || value,
            department: text(item && item.department),
            departmentId: text(item && item.department_id)
        };
    }
    function loadReferenceSource(fieldName){
        var cfg = getReferenceConfig(fieldName);
        if(!cfg){ return Promise.resolve([]); }
        if(referenceSourceCache[fieldName]){ return referenceSourceCache[fieldName]; }
        referenceSourceCache[fieldName] = requestJSON(cfg.endpoint).then(function(payload){
            var seen = {};
            var options = [];
            extractItems(payload).forEach(function(item){
                var option = makeReferenceOption(fieldName, item);
                if(!option || seen[option.value]){ return; }
                seen[option.value] = true;
                options.push(option);
            });
            options.sort(function(a, b){
                return a.label.localeCompare(b.label, 'ko-KR') || a.value.localeCompare(b.value, 'ko-KR');
            });
            return options;
        }).catch(function(err){
            try { console.warn('[datacenter_facility_system] FK load failed: ' + fieldName, err); } catch(_e){}
            return [];
        });
        return referenceSourceCache[fieldName];
    }
    function referenceSelection(form, name){
        var el = form ? form.elements[name] : null;
        var opt = selectedOption(el);
        return {
            value: text(el && el.value),
            payload: text(opt && opt.getAttribute('data-payload')),
            label: text(opt && opt.textContent)
        };
    }
    function currentReferenceValue(select){
        return text((select && select.dataset && select.dataset.currentValue) || (select && select.value));
    }
    function optionMatches(option, current){
        var wanted = text(current);
        if(!wanted || !option){ return false; }
        if(option.value === wanted || option.payload === wanted || option.label === wanted){ return true; }
        if(option.label.indexOf(wanted + ' (') === 0){ return true; }
        return false;
    }
    function renderReferenceOptions(select, options, current, placeholder){
        if(!select){ return; }
        var selectedValue = '';
        var currentText = text(current);
        var html = '<option value="">' + esc(placeholder || '선택') + '</option>';
        (options || []).forEach(function(option){
            var selected = optionMatches(option, currentText);
            if(selected){ selectedValue = option.value; }
            html += '<option value="' + esc(option.value) + '" data-payload="' + esc(option.payload) + '"' + (selected ? ' selected' : '') + '>' + esc(option.label) + '</option>';
        });
        if(currentText && !selectedValue){
            selectedValue = currentText;
            html += '<option value="' + esc(currentText) + '" data-payload="' + esc(currentText) + '" selected>' + esc(currentText) + '</option>';
        }
        select.innerHTML = html;
        select.value = selectedValue;
        select.dataset.currentValue = selectedValue || currentText;
    }
    function filteredReferenceOptions(form, fieldName, options, current){
        var cfg = getReferenceConfig(fieldName);
        if(!cfg || !cfg.dependsOn){ return options || []; }
        var parent = referenceSelection(form, cfg.dependsOn);
        var deptName = parent.payload || parent.label;
        if(!deptName){ return []; }
        return (options || []).filter(function(option){
            if(!option.department){ return true; }
            return option.department === deptName || option.department === parent.value;
        });
    }
    function populateReferenceSelect(form, fieldName, reset){
        var select = form ? form.elements[fieldName] : null;
        var cfg = getReferenceConfig(fieldName);
        if(!select || !cfg){ return Promise.resolve(); }
        if(reset){ select.dataset.currentValue = ''; }
        var current = reset ? '' : currentReferenceValue(select);
        return loadReferenceSource(fieldName).then(function(options){
            var placeholder = cfg.placeholder || '선택';
            var filtered = filteredReferenceOptions(form, fieldName, options, current);
            if(cfg.dependsOn){
                var parent = referenceSelection(form, cfg.dependsOn);
                if(!parent.value && !parent.payload && !current){
                    placeholder = '부서를 먼저 선택';
                    select.disabled = true;
                } else {
                    select.disabled = false;
                }
            }
            renderReferenceOptions(select, filtered, current, placeholder);
            if(cfg.dependsOn && !text(select.value) && placeholder === '부서를 먼저 선택'){
                select.disabled = true;
            }
            syncSearchable(form);
        });
    }
    function wireReferenceDependencies(form){
        function wire(deptName, ownerName){
            var dept = form ? form.elements[deptName] : null;
            if(!dept || (dept.dataset && dept.dataset.dcReferenceBound === '1')){ return; }
            dept.dataset.dcReferenceBound = '1';
            dept.addEventListener('change', function(){ populateReferenceSelect(form, ownerName, true); });
        }
        wire('system_owner_dept', 'system_owner');
        wire('service_owner_dept', 'service_owner');
    }
    function wireReferenceFk(form){
        if(!form){ return Promise.resolve(); }
        syncSearchable(form);
        wireReferenceDependencies(form);
        return Promise.all([
            populateReferenceSelect(form, 'place_name', false),
            populateReferenceSelect(form, 'system_owner_dept', false),
            populateReferenceSelect(form, 'service_owner_dept', false)
        ]).then(function(){
            return Promise.all([
                populateReferenceSelect(form, 'system_owner', false),
                populateReferenceSelect(form, 'service_owner', false)
            ]);
        }).then(function(){ syncSearchable(form); });
    }
    function wireFacilityCategoryFk(form){
        if(!form || !window.DcFacilityFk || typeof window.DcFacilityFk.wireForm !== 'function'){
            return;
        }
        window.DcFacilityFk.wireForm(form, {
            resource: resource,
            manufacturerName: 'manufacturer_name',
            modelName: 'model_name'
        });
    }
    function formMarkup(row){
        row = normalize(row || {});
        return '' +
            '<div class="form-section">' +
                '<div class="section-header"><h4>업무</h4></div>' +
                '<div class="form-grid">' +
                    formRow('업무 상태', 'business_status', row.business_status, true) +
                    formRow('업무 이름', 'business_name', row.business_name, true) +
                '</div>' +
            '</div>' +
            '<div class="form-section">' +
                '<div class="section-header"><h4>시스템</h4></div>' +
                '<div class="form-grid">' +
                    formRow('시스템 제조사', 'manufacturer_name', row.manufacturer_name, true) +
                    formRow('시스템 모델명', 'model_name', row.model_name, true) +
                    formRow('시스템 일련번호', 'serial_number', row.serial_number, false) +
                    formRow('시스템 장소', 'place_name', row.place_name, true) +
                '</div>' +
            '</div>' +
            '<div class="form-section">' +
                '<div class="section-header"><h4>담당자</h4></div>' +
                '<div class="form-grid">' +
                    formRow('시스템 담당부서', 'system_owner_dept', row.system_owner_dept, false) +
                    formRow('시스템 담당자', 'system_owner', row.system_owner, false) +
                    formRow('서비스 담당부서', 'service_owner_dept', row.service_owner_dept, false) +
                    formRow('서비스 담당자', 'service_owner', row.service_owner, false) +
                '</div>' +
            '</div>' +
            '<div class="form-section">' +
                '<div class="section-header"><h4>비고</h4></div>' +
                '<div class="form-grid"><div class="form-row form-row-wide"><label>비고</label><textarea name="remark" class="form-input textarea-large" rows="4">' + esc(row.remark) + '</textarea></div></div>' +
            '</div>';
    }
    function formRow(labelText, name, value, required){
        if(name === 'manufacturer_name' || name === 'model_name'){
            return '<div class="form-row"><label>' + esc(labelText) + (required ? ' <span class="required">*</span>' : '') + '</label>' +
                '<select name="' + esc(name) + '" class="form-input search-select" data-searchable="true" data-placeholder="검색 선택" data-allow-clear="true"' + (required ? ' required' : '') + '>' +
                '<option value="">검색 선택</option>' +
                (value ? '<option value="' + esc(value) + '" selected>' + esc(value) + '</option>' : '') +
                '</select></div>';
        }
            if(getReferenceConfig(name)){
                var cfg = getReferenceConfig(name);
                var placeholder = cfg.placeholder || '선택';
                return '<div class="form-row"><label>' + esc(labelText) + (required ? ' <span class="required">*</span>' : '') + '</label>' +
                '<select name="' + esc(name) + '" class="form-input search-select dc-reference-select" data-dc-reference-fk="1" data-searchable="true" data-placeholder="' + esc(placeholder) + '" data-allow-clear="true" data-current-value="' + esc(value) + '"' + (required ? ' required' : '') + '>' +
                '<option value="">' + esc(placeholder) + '</option>' +
                (value ? '<option value="' + esc(value) + '" data-payload="' + esc(value) + '" selected>' + esc(value) + '</option>' : '') +
                '</select></div>';
            }
        return '<div class="form-row"><label>' + esc(labelText) + (required ? ' <span class="required">*</span>' : '') + '</label>' +
            '<input name="' + esc(name) + '" class="form-input" value="' + esc(value) + '" autocomplete="off"' + (required ? ' required' : '') + '></div>';
    }
    function collectPayload(form){
        var payload = {
            business_status: formValue(form, 'business_status'),
            business_name: formValue(form, 'business_name'),
            manufacturer_name: formValue(form, 'manufacturer_name'),
            model_name: formValue(form, 'model_name'),
            serial_number: formValue(form, 'serial_number'),
            place_name: referencePayloadValue(form, 'place_name'),
            system_owner_dept: referencePayloadValue(form, 'system_owner_dept'),
            system_owner: referencePayloadValue(form, 'system_owner'),
            service_owner_dept: referencePayloadValue(form, 'service_owner_dept'),
            service_owner: referencePayloadValue(form, 'service_owner'),
            remark: formValue(form, 'remark')
        };
        var missing = [];
        if(!payload.business_status){ missing.push('업무 상태'); }
        if(!payload.business_name){ missing.push('업무 이름'); }
        if(!payload.manufacturer_name){ missing.push('시스템 제조사'); }
        if(!payload.model_name){ missing.push('시스템 모델명'); }
        if(!payload.place_name){ missing.push('시스템 장소'); }
        if(missing.length){ throw new Error(missing.join(', ') + ' 값은 필수입니다.'); }
        return payload;
    }
    function setLoading(isLoading){
        var loader = byId('system-search-loader');
        if(loader){ loader.setAttribute('aria-hidden', isLoading ? 'false' : 'true'); }
    }
    function loadRows(){
        setLoading(true);
        return requestJSON(apiBase).then(function(payload){
            var list = payload.items || payload.rows || [];
            rows = list.map(normalize);
            applyFilter();
        }).catch(function(err){
            showMessage(err.message || '목록을 불러오지 못했습니다.');
        }).then(function(){ setLoading(false); });
    }
    function applyFilter(){
        var query = text(byId('system-search') && byId('system-search').value).toLowerCase();
        var tokens = query ? query.split('%').map(text).filter(Boolean) : [];
        filteredRows = rows.filter(function(row){
            if(!tokens.length){ return true; }
            var haystack = columns.map(function(col){ return row[col.key] || ''; }).concat([row.system_code, row.remark]).join(' ').toLowerCase();
            return tokens.every(function(token){ return haystack.indexOf(token) !== -1; });
        });
        page = Math.min(Math.max(page, 1), Math.max(1, Math.ceil(filteredRows.length / pageSize)));
        render();
    }
    function render(){
        renderRows();
        renderPagination();
        var count = byId('system-count');
        if(count){ count.textContent = String(filteredRows.length); }
        var empty = byId('system-empty');
        if(empty){ empty.hidden = filteredRows.length > 0; }
        var selectAll = byId('system-select-all');
        if(selectAll){
            var visible = pageRows();
            selectAll.checked = visible.length > 0 && visible.every(function(row){ return !!selectedIds[row.id]; });
        }
    }
    function pageRows(){
        var start = (page - 1) * pageSize;
        return filteredRows.slice(start, start + pageSize);
    }
    function renderRows(){
        var body = byId('system-table-body');
        if(!body){ return; }
        var html = pageRows().map(function(row){
            return '<tr data-id="' + esc(row.id) + '">' +
                '<td><input type="checkbox" class="system-row-select" data-id="' + esc(row.id) + '"' + (selectedIds[row.id] ? ' checked' : '') + '></td>' +
                '<td><span class="status-badge active">' + esc(row.business_status) + '</span></td>' +
                '<td>' + esc(row.business_name) + '</td>' +
                '<td>' + esc(row.manufacturer_name) + '</td>' +
                '<td>' + esc(row.model_name) + '</td>' +
                '<td>' + esc(row.serial_number) + '</td>' +
                '<td>' + esc(row.place_name) + '</td>' +
                '<td>' + esc(row.system_owner_dept) + '</td>' +
                '<td>' + esc(row.system_owner) + '</td>' +
                '<td>' + esc(row.service_owner_dept) + '</td>' +
                '<td>' + esc(row.service_owner) + '</td>' +
                '<td class="actions-cell">' +
                    '<button type="button" class="row-action-btn system-edit-row" data-id="' + esc(row.id) + '" title="수정" aria-label="수정"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정"></button>' +
                '</td>' +
            '</tr>';
        }).join('');
        body.innerHTML = html;
    }
    function renderPagination(){
        var total = filteredRows.length;
        var totalPages = Math.max(1, Math.ceil(total / pageSize));
        var info = byId('system-pagination-info');
        if(info){
            var start = total ? ((page - 1) * pageSize + 1) : 0;
            var end = Math.min(total, page * pageSize);
            info.textContent = start + '-' + end + ' / ' + total + '개 항목';
        }
        setDisabled('system-first', page <= 1);
        setDisabled('system-prev', page <= 1);
        setDisabled('system-next', page >= totalPages);
        setDisabled('system-last', page >= totalPages);
        var numbers = byId('system-page-numbers');
        if(numbers){
            var html = '';
            var from = Math.max(1, page - 2);
            var to = Math.min(totalPages, from + 4);
            from = Math.max(1, to - 4);
            for(var i = from; i <= to; i += 1){
                html += '<button type="button" class="page-btn' + (i === page ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
            }
            numbers.innerHTML = html;
        }
    }
    function setDisabled(id, disabled){
        var el = byId(id);
        if(el){ el.disabled = !!disabled; }
    }
    function openModal(modal){
        if(!modal){ return; }
        modal.setAttribute('aria-hidden', 'false');
        modal.classList.add('show');
    }
    function closeModal(modal){
        if(!modal){ return; }
        modal.setAttribute('aria-hidden', 'true');
        modal.classList.remove('show');
    }
    function openAdd(){
        var form = byId('system-add-form');
        if(form){ form.innerHTML = formMarkup({}); wireFacilityCategoryFk(form); wireReferenceFk(form); }
        openModal(byId('system-add-modal'));
    }
    function openEdit(id){
        var row = rows.filter(function(item){ return String(item.id) === String(id); })[0];
        if(!row){ return; }
        editingId = row.id;
        var form = byId('system-edit-form');
        if(form){ form.innerHTML = formMarkup(row); wireFacilityCategoryFk(form); wireReferenceFk(form); }
        openModal(byId('system-edit-modal'));
    }
    function saveAdd(){
        var form = byId('system-add-form');
        var payload;
        try { payload = collectPayload(form); } catch(err){ showMessage(err.message); return; }
        requestJSON(apiBase, { method: 'POST', body: payload }).then(function(){
            closeModal(byId('system-add-modal'));
            showMessage(label + ' 시스템을 등록했습니다.');
            return loadRows();
        }).catch(function(err){ showMessage(err.message || '등록 중 오류가 발생했습니다.'); });
    }
    function saveEdit(){
        if(!editingId){ return; }
        var form = byId('system-edit-form');
        var payload;
        try { payload = collectPayload(form); } catch(err){ showMessage(err.message); return; }
        requestJSON(apiBase + '/' + encodeURIComponent(editingId), { method: 'PUT', body: payload }).then(function(){
            closeModal(byId('system-edit-modal'));
            showMessage(label + ' 시스템을 수정했습니다.');
            editingId = null;
            return loadRows();
        }).catch(function(err){ showMessage(err.message || '수정 중 오류가 발생했습니다.'); });
    }
    function deleteSelected(){
        var ids = Object.keys(selectedIds).filter(function(id){ return selectedIds[id]; });
        if(!ids.length){ showMessage('삭제할 항목을 선택하세요.'); return; }
        if(!window.confirm('선택한 항목을 삭제처리할까요?')){ return; }
        requestJSON(apiBase + '/bulk-delete', { method: 'POST', body: { ids: ids } }).then(function(){
            selectedIds = {};
            showMessage('선택한 항목을 삭제처리했습니다.');
            return loadRows();
        }).catch(function(err){ showMessage(err.message || '삭제 중 오류가 발생했습니다.'); });
    }
    function downloadCsv(){
        var header = columns.map(function(col){ return col.label; });
        var lines = [header].concat(filteredRows.map(function(row){
            return columns.map(function(col){ return row[col.key] || ''; });
        }));
        var csv = lines.map(function(line){
            return line.map(function(value){ return '"' + String(value).replace(/"/g, '""') + '"'; }).join(',');
        }).join('\n');
        var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'datacenter-' + resource + '-systems.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
    function openStats(){
        var body = byId('system-stats-body');
        if(body){
            var byStatus = countBy(filteredRows, 'business_status');
            var byPlace = countBy(filteredRows, 'place_name');
            body.innerHTML = '<div class="stats-grid">' +
                statsCard('총 항목', String(filteredRows.length)) +
                statsCard('업무 상태', topSummary(byStatus)) +
                statsCard('시스템 장소', topSummary(byPlace)) +
                '</div>';
        }
        openModal(byId('system-stats-modal'));
    }
    function countBy(list, key){
        return list.reduce(function(acc, row){
            var value = row[key] || '미지정';
            acc[value] = (acc[value] || 0) + 1;
            return acc;
        }, {});
    }
    function topSummary(map){
        var entries = Object.keys(map).map(function(key){ return { key: key, count: map[key] }; });
        entries.sort(function(a, b){ return b.count - a.count; });
        return entries.slice(0, 3).map(function(item){ return item.key + ' ' + item.count; }).join(' / ') || '없음';
    }
    function statsCard(title, value){
        return '<div class="stats-card"><div class="stats-card-label">' + esc(title) + '</div><div class="stats-card-value">' + esc(value) + '</div></div>';
    }
    function bind(){
        var search = byId('system-search');
        if(search){ search.addEventListener('input', function(){ page = 1; applyFilter(); }); }
        var clear = byId('system-search-clear');
        if(clear){ clear.addEventListener('click', function(){ if(search){ search.value = ''; search.focus(); } page = 1; applyFilter(); }); }
        var size = byId('system-page-size');
        if(size){ size.addEventListener('change', function(){ pageSize = parseInt(size.value, 10) || 10; page = 1; render(); }); }
        var addBtn = byId('system-add-btn');
        if(addBtn){ addBtn.addEventListener('click', openAdd); }
        var addSave = byId('system-add-save');
        if(addSave){ addSave.addEventListener('click', saveAdd); }
        var editSave = byId('system-edit-save');
        if(editSave){ editSave.addEventListener('click', saveEdit); }
        var deleteBtn = byId('system-delete-btn');
        if(deleteBtn){ deleteBtn.addEventListener('click', deleteSelected); }
        var downBtn = byId('system-download-btn');
        if(downBtn){ downBtn.addEventListener('click', downloadCsv); }
        var statsBtn = byId('system-stats-btn');
        if(statsBtn){ statsBtn.addEventListener('click', openStats); }
        var statsClose = byId('system-stats-close');
        if(statsClose){ statsClose.addEventListener('click', function(){ closeModal(byId('system-stats-modal')); }); }
        var statsOk = byId('system-stats-ok');
        if(statsOk){ statsOk.addEventListener('click', function(){ closeModal(byId('system-stats-modal')); }); }
        var addClose = byId('system-add-close');
        if(addClose){ addClose.addEventListener('click', function(){ closeModal(byId('system-add-modal')); }); }
        var editClose = byId('system-edit-close');
        if(editClose){ editClose.addEventListener('click', function(){ closeModal(byId('system-edit-modal')); }); }
        ['system-first', 'system-prev', 'system-next', 'system-last'].forEach(function(id){
            var el = byId(id);
            if(!el){ return; }
            el.addEventListener('click', function(){
                var totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
                if(id === 'system-first'){ page = 1; }
                if(id === 'system-prev'){ page = Math.max(1, page - 1); }
                if(id === 'system-next'){ page = Math.min(totalPages, page + 1); }
                if(id === 'system-last'){ page = totalPages; }
                render();
            });
        });
        document.addEventListener('click', function(event){
            var pageBtn = event.target.closest && event.target.closest('.page-btn[data-page]');
            if(pageBtn){ page = parseInt(pageBtn.getAttribute('data-page'), 10) || 1; render(); return; }
            var editBtn = event.target.closest && event.target.closest('.system-edit-row[data-id]');
            if(editBtn){ openEdit(editBtn.getAttribute('data-id')); }
        });
        var tableBody = byId('system-table-body');
        if(tableBody){
            tableBody.addEventListener('change', function(event){
                var target = event.target;
                if(target && target.classList.contains('system-row-select')){
                    selectedIds[target.getAttribute('data-id')] = target.checked;
                    render();
                }
            });
        }
        var selectAll = byId('system-select-all');
        if(selectAll){
            selectAll.addEventListener('change', function(){
                pageRows().forEach(function(row){ selectedIds[row.id] = selectAll.checked; });
                render();
            });
        }
        [byId('system-add-modal'), byId('system-edit-modal'), byId('system-stats-modal')].forEach(function(modal){
            if(!modal){ return; }
            modal.addEventListener('click', function(event){ if(event.target === modal){ closeModal(modal); } });
        });
    }
    document.addEventListener('DOMContentLoaded', function(){
        var addForm = byId('system-add-form');
        if(addForm){ addForm.innerHTML = formMarkup({}); }
        bind();
        loadRows();
    });
})();