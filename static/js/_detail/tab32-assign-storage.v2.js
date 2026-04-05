/*
 * tab32-assign-storage.v2.js
 * Tab32 (할당정보) revamped: 업무 그룹 목록 + 4탭 모달 + API 연동
 */

(function(){
  function toast(msg, level){
    try{
      if(typeof window.showToast === 'function') return window.showToast(msg, level || 'info');
    }catch(_e){}
    try{ window.alert(String(msg || '')); }catch(_e2){}
  }
  function escapeCsvCell(v){
    var s = String(v == null ? '' : v);
    // Normalize whitespace but keep meaningful spaces.
    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if(/[\n",]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function downloadCsv(filename, rows){
    try{
      var lines = (rows || []).map(function(r){
        return (r || []).map(escapeCsvCell).join(',');
      }).join('\r\n');
      // Excel-friendly UTF-8 BOM
      var blob = new Blob(["\ufeff" + lines], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename || 'export.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(function(){
        try{ document.body.removeChild(a); }catch(_e0){}
        try{ URL.revokeObjectURL(url); }catch(_e1){}
      }, 0);
    }catch(_e2){}
  }

  function escapeHtml(val){
    return String(val == null ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeKey(val){
    return String(val == null ? '' : val).trim().toLowerCase();
  }

  function formatNumberStringWithCommas(numStr){
    var s = String(numStr == null ? '' : numStr).trim();
    if(!s) return '';
    if(s.indexOf(',') > -1) s = s.replace(/,/g, '');
    var neg = false;
    if(s[0] === '-') { neg = true; s = s.slice(1); }
    var parts = s.split('.');
    var intPart = parts[0] || '0';
    var decPart = parts.length > 1 ? parts[1] : '';
    // Strip any non-digits in integer part (defensive)
    intPart = intPart.replace(/\D/g, '') || '0';
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var out = (neg ? '-' : '') + intPart + (decPart ? ('.' + decPart.replace(/\D/g, '')) : '');
    return out;
  }

  function formatCapacityInputPretty(raw){
    var s = String(raw == null ? '' : raw).trim();
    if(!s) return '';
    // Allow commas; format only the numeric portion.
    var m = s.match(/^\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*([a-zA-Z]{0,3})\s*$/);
    if(!m) return s;
    var num = formatNumberStringWithCommas(m[1]);
    var unit = String(m[2] || '');
    return num + unit;
  }

  function qs(obj){
    var parts = [];
    Object.keys(obj || {}).forEach(function(k){
      var v = obj[k];
      if(v == null) return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    });
    return parts.length ? ('?' + parts.join('&')) : '';
  }

  function fetchJSON(url, options){
    options = options || {};
    if(!options.credentials) options.credentials = 'same-origin';
    options.headers = options.headers || {};
    if(!options.headers['Accept']) options.headers['Accept'] = 'application/json';
    if(options.body && !options.headers['Content-Type']) options.headers['Content-Type'] = 'application/json';

    return fetch(url, options).then(function(res){
      return res.text().then(function(txt){
        var data = null;
        try{ data = txt ? JSON.parse(txt) : null; }catch(_e){ data = null; }
        if(!res.ok){
          var msg = (data && (data.message || data.error)) ? (data.message || data.error) : ('HTTP ' + res.status);
          var err = new Error(msg);
          err.status = res.status;
          err.body = data;
          throw err;
        }
        return data;
      });
    });
  }

  function detectStorageContext(){
    // 1) data-storage-prefix 속성 우선 (공통 템플릿에서 Jinja로 주입)
    var root = document.querySelector('.tab32-asg-root[data-storage-prefix]');
    var prefix = root ? (root.getAttribute('data-storage-prefix') || '') : '';
    if(prefix === 'storage_san'){
      return {
        listPath: '/p/hw_storage_san',
        assetKeyPrefix: 'storage_san',
        selectedRowKeys: ['storage_san:selected:row','san_storage:selected:row','san:selected:row'],
        scopeKey: 'san'
      };
    }
    if(prefix === 'storage_backup'){
      return {
        listPath: '/p/hw_storage_backup',
        assetKeyPrefix: 'storage_backup',
        selectedRowKeys: ['storage_backup:selected:row','ptl:selected:row'],
        scopeKey: 'ptl'
      };
    }
    // 2) URL 기반 폴백
    var path = String(window.location.pathname || '');
    if(path.indexOf('hw_storage_san') > -1){
      return {
        listPath: '/p/hw_storage_san',
        assetKeyPrefix: 'storage_san',
        selectedRowKeys: ['storage_san:selected:row','san_storage:selected:row','san:selected:row'],
        scopeKey: 'san'
      };
    }
    return {
      listPath: '/p/hw_storage_backup',
      assetKeyPrefix: 'storage_backup',
      selectedRowKeys: ['storage_backup:selected:row','ptl:selected:row'],
      scopeKey: 'ptl'
    };
  }

  function parseRowAssetId(raw){
    try{
      if(!raw) return null;
      var row = JSON.parse(raw);
      var id = row && (row.id != null ? row.id : row.asset_id);
      var n = parseInt(id, 10);
      return (!isNaN(n) && n > 0) ? n : null;
    }catch(_e){
      return null;
    }
  }

  function getStoredAssetId(ctx){
    try{
      var v = sessionStorage.getItem(ctx.assetKeyPrefix + ':selected:asset_id') || localStorage.getItem(ctx.assetKeyPrefix + ':selected:asset_id');
      var n = parseInt(v, 10);
      return (!isNaN(n) && n > 0) ? n : null;
    }catch(_e){
      return null;
    }
  }

  function saveStoredAssetId(ctx, n){
    try{ sessionStorage.setItem(ctx.assetKeyPrefix + ':selected:asset_id', String(n)); }catch(_e){}
    try{ localStorage.setItem(ctx.assetKeyPrefix + ':selected:asset_id', String(n)); }catch(_e2){}
  }

  function ensureAssetId(ctx){
    // 1) querystring
    try{
      var params = new URLSearchParams(window.location.search || '');
      var legacy = params.get('asset_id') || params.get('assetId') || params.get('id');
      var ln = parseInt(legacy, 10);
      if(!isNaN(ln) && ln > 0) saveStoredAssetId(ctx, ln);
    }catch(_e){}

    // 2) direct stored
    var assetId = getStoredAssetId(ctx);
    if(assetId) return assetId;

    // 3) selected row fallbacks
    for(var i=0;i<ctx.selectedRowKeys.length;i++){
      try{
        var raw = sessionStorage.getItem(ctx.selectedRowKeys[i]) || localStorage.getItem(ctx.selectedRowKeys[i]);
        assetId = parseRowAssetId(raw);
        if(assetId) break;
      }catch(_e2){}
    }

    if(assetId) saveStoredAssetId(ctx, assetId);
    return assetId || null;
  }

  function setModalVisible(modal, visible){
    if(!modal) return;
    if(visible){
      modal.classList.add('show');
      modal.setAttribute('aria-hidden','false');
    }else{
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden','true');
    }
  }

  function setActiveTab(modal, tab){
    try{
      try{ modal.setAttribute('data-asg-active-tab', tab); }catch(_e0){}
      var btns = modal.querySelectorAll('[data-asg-tab]');
      for(var i=0;i<btns.length;i++){
        var b = btns[i];
        var active = b.getAttribute('data-asg-tab') === tab;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      }
      var panes = modal.querySelectorAll('[data-asg-pane]');
      for(var j=0;j<panes.length;j++){
        var p = panes[j];
        p.classList.toggle('active', p.getAttribute('data-asg-pane') === tab);
      }
    }catch(_e){}
  }

  function init(){
    var table = document.getElementById('asg-table');
    if(!table) return;
    if(table.__tab32AsgV2Init) return;
    table.__tab32AsgV2Init = true;

    var ctx = detectStorageContext();
    var assetId = ensureAssetId(ctx);

    // 타이틀/서브타이틀 복원
    try{
      var params = new URLSearchParams(window.location.search || '');
      var work = null;
      var system = null;
      try{ work = sessionStorage.getItem(ctx.assetKeyPrefix + ':selected:work_name'); }catch(_e){}
      try{ system = sessionStorage.getItem(ctx.assetKeyPrefix + ':selected:system_name'); }catch(_e2){}
      if(!work || !system){
        for(var i=0;i<ctx.selectedRowKeys.length;i++){
          try{
            var raw = sessionStorage.getItem(ctx.selectedRowKeys[i]) || localStorage.getItem(ctx.selectedRowKeys[i]);
            if(!raw) continue;
            var row = JSON.parse(raw);
            if(!work && row && row.work_name != null) work = String(row.work_name);
            if(!system && row && row.system_name != null) system = String(row.system_name);
          }catch(_e3){}
        }
      }
      if(!work) work = params.get('work');
      if(!system) system = params.get('system');
      var titleEl = document.getElementById('detail-title') || document.querySelector('.page-header h1');
      var subEl = document.getElementById('detail-subtitle') || document.querySelector('.page-header p');
      if(titleEl) titleEl.textContent = String(work || '-');
      if(subEl) subEl.textContent = String(system || '-');
    }catch(_eh){}

    var API_BASE = '/api/tab32-assign-groups';

    var paginationRoot = document.getElementById('asg-pagination');
    var pageSizeSel = document.getElementById('asg-page-size');
    var selectAll = document.getElementById('asg-select-all');
    var empty = document.getElementById('asg-empty');
    var paginationInfo = document.getElementById('asg-pagination-info');
    var pageNumbers = document.getElementById('asg-page-numbers');
    var btnFirst = document.getElementById('asg-first');
    var btnPrev = document.getElementById('asg-prev');
    var btnNext = document.getElementById('asg-next');
    var btnLast = document.getElementById('asg-last');
    var btnAdd = document.getElementById('asg-add-btn');
  var btnCsv = document.getElementById('asg-download-btn');
  var csvModal = document.getElementById('asg-download-modal');
  var csvClose = document.getElementById('asg-download-close');
  var csvConfirm = document.getElementById('asg-download-confirm');
  var csvRadioAll = document.getElementById('asg-csv-range-all');
  var csvRadioSelected = document.getElementById('asg-csv-range-selected');
    function openCsvModal(){
      if(!csvModal) return;
      try{ document.body.classList.add('modal-open'); }catch(_e0){}
      try{ csvModal.classList.add('show'); }catch(_e1){}
      try{ csvModal.setAttribute('aria-hidden','false'); }catch(_e2){}
    }
    function closeCsvModal(){
      if(!csvModal) return;
      try{ csvModal.classList.remove('show'); }catch(_e0){}
      try{ csvModal.setAttribute('aria-hidden','true'); }catch(_e1){}
      try{
        if(!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show')){
          document.body.classList.remove('modal-open');
        }
      }catch(_e2){}
    }

    function buildAsgCsvRows(range){
      var rows = [];
        rows.push(['업무 그룹', '호스트 수', '볼륨 수', '할당용량', '복제여부']);
      var table = document.getElementById('asg-table');
      var tbody = table && table.querySelector ? table.querySelector('tbody') : null;
      var trs = tbody ? tbody.querySelectorAll('tr') : [];
      for(var i=0;i<trs.length;i++){
        var tr = trs[i];
        if(!tr || !tr.children || tr.children.length < 7) continue;
        if(range === 'selected'){
          var cb = tr.querySelector ? tr.querySelector('input[type="checkbox"]') : null;
          if(!cb || !cb.checked) continue;
        }
        var groupName = (tr.children[1].textContent || '').trim();
        var hostCount = (tr.children[2].textContent || '').trim();
        var volumeCount = (tr.children[3].textContent || '').trim();
        var cap = (tr.children[4].textContent || '').trim();
        var repl = (tr.children[5].textContent || '').trim();
          rows.push([groupName, hostCount, volumeCount, cap, repl]);
      }
      return rows;
    }

    if(btnCsv) btnCsv.addEventListener('click', function(){
      openCsvModal();
    });
    if(csvClose) csvClose.addEventListener('click', closeCsvModal);
    if(csvModal) csvModal.addEventListener('click', function(e){
      try{ if(e && e.target === csvModal) closeCsvModal(); }catch(_e0){}
    });
    document.addEventListener('keydown', function(e){
      try{ if(e && e.key === 'Escape' && csvModal && csvModal.classList && csvModal.classList.contains('show')) closeCsvModal(); }catch(_e0){}
    });
    if(csvConfirm) csvConfirm.addEventListener('click', function(){
      var range = (csvRadioSelected && csvRadioSelected.checked) ? 'selected' : 'all';
      var rows = buildAsgCsvRows(range);
      if(rows.length <= 1){
        // no rows
        closeCsvModal();
        return;
      }
      var title = '';
      try{ title = (document.getElementById('detail-title') ? document.getElementById('detail-title').textContent : ''); }catch(_e0){ title = ''; }
      title = String(title || '').trim();
      if(!title) title = '업무그룹';
      var safe = title.replace(/[\\/:*?"<>|]+/g, '_');
      downloadCsv(safe + '_업무그룹_할당정보.csv', rows);
      closeCsvModal();
    });

    var modal = document.getElementById('asg-modal');
    var modalClose = document.getElementById('asg-modal-close');
    var modalSave = document.getElementById('asg-modal-save');
    var modalTitle = document.getElementById('asg-modal-title');
    var inputName = document.getElementById('asg-name');
    var inputAssignedCapacity = document.getElementById('asg-assigned-capacity');
    var inputDesc = document.getElementById('asg-desc');
    var inputRemark = document.getElementById('asg-remark');

    var hostAdd = document.getElementById('asg-host-add');
    var volAdd = document.getElementById('asg-volume-add');
    var replAdd = document.getElementById('asg-repl-add');
    var hostTbody = document.getElementById('asg-host-table') ? document.getElementById('asg-host-table').querySelector('tbody') : null;
    var volTbody = document.getElementById('asg-volume-table') ? document.getElementById('asg-volume-table').querySelector('tbody') : null;
    var replTbody = document.getElementById('asg-repl-table') ? document.getElementById('asg-repl-table').querySelector('tbody') : null;

    var usePaginationUi = !!(paginationRoot || pageSizeSel || paginationInfo || pageNumbers || btnFirst || btnPrev || btnNext || btnLast);
    // Scroll mode: if the template doesn't render pagination controls, fetch a large page once.
    var defaultPageSize = usePaginationUi
      ? (parseInt((pageSizeSel && pageSizeSel.value) || '10', 10) || 10)
      : 1000;
    var state = { page: 1, pageSize: defaultPageSize, total: 0 };
        // Pagination page-size persistence (match 인터페이스 탭 behavior)
        if(usePaginationUi && pageSizeSel){
          try{
            var sizeKey = ctx.assetKeyPrefix + ':asg:pageSize';
            var savedSize = localStorage.getItem(sizeKey);
            if(savedSize && ['10','20','50','100'].indexOf(savedSize) > -1){
              state.pageSize = parseInt(savedSize, 10) || state.pageSize;
              pageSizeSel.value = savedSize;
            }
          }catch(_e0){}
        }

    var currentGroupId = null;
    var currentGroupAssignedCapacity = '';


    function renderEmpty(show){
      if(empty) empty.style.display = show ? '' : 'none';
    }

    function setPagination(total){
      if(!usePaginationUi){
        state.total = total || 0;
        return;
      }
      state.total = total || 0;
      var totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
      state.page = Math.min(state.page, totalPages);

      if(paginationInfo){
        var start = state.total ? ((state.page - 1) * state.pageSize + 1) : 0;
        var end = Math.min(state.total, state.page * state.pageSize);
        paginationInfo.textContent = String(start) + '-' + String(end) + ' / ' + String(state.total || 0) + '개 항목';
      }
      if(btnFirst) btnFirst.disabled = state.page <= 1;
      if(btnPrev) btnPrev.disabled = state.page <= 1;
      if(btnNext) btnNext.disabled = state.page >= totalPages;
      if(btnLast) btnLast.disabled = state.page >= totalPages;

      if(pageSizeSel){
        var none = (state.total === 0);
        pageSizeSel.disabled = none;
        if(none){
          try{ pageSizeSel.value = '10'; }catch(_e1){}
          state.pageSize = 10;
        }
      }

      if(pageNumbers){
        pageNumbers.innerHTML = '';
        var endP = Math.min(totalPages, 50);
        for(var p=1;p<=endP;p++){
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'page-btn' + (p===state.page ? ' active' : '');
          b.textContent = String(p);
          b.dataset.page = String(p);
          (function(pp){ b.addEventListener('click', function(){ loadPage(pp); }); })(p);
          pageNumbers.appendChild(b);
        }
      }
    }

    function renderGroups(items){
      var tbody = table.querySelector('tbody');
      if(!tbody) return;
      tbody.innerHTML = '';
      (items || []).forEach(function(it){
        var tr = document.createElement('tr');
        tr.setAttribute('data-id', String(it.id));

        var capText = '';
        try{
          var capRaw = (it && (it.volume_total_capacity != null ? it.volume_total_capacity : it.assigned_capacity != null ? it.assigned_capacity : ''));
          capText = String(capRaw == null ? '' : capRaw).trim();
        }catch(_e0){ capText = ''; }

        if(!capText){
          capText = '0 GB';
        }else{
          // If API returns a pure number, normalize to "N GB".
          var capNumOnly = capText.replace(/,/g, '').trim();
          if(/^[0-9]+(?:\.[0-9]+)?$/.test(capNumOnly)){
            capText = formatNumberStringWithCommas(capNumOnly) + ' GB';
          }
        }

        var hostCount = 0;
        try{
          var hcRaw = (it && it.host_count != null) ? String(it.host_count).trim() : '';
          var hc = parseInt(hcRaw, 10);
          hostCount = (!isNaN(hc) && hc >= 0) ? hc : 0;
        }catch(_e1){ hostCount = 0; }

        var volumeCount = 0;
        try{
          var vcRaw = (it && it.volume_count != null) ? String(it.volume_count).trim() : '';
          var vc = parseInt(vcRaw, 10);
          volumeCount = (!isNaN(vc) && vc >= 0) ? vc : 0;
        }catch(_e2){ volumeCount = 0; }

        tr.innerHTML = ''
          + '<td><input type="checkbox" class="asg-row-check" aria-label="행 선택"></td>'
          + '<td data-col="group_name"><button type="button" class="asg-link js-asg-open">' + escapeHtml(it.group_name || '') + '</button></td>'
          + '<td data-col="host_count">' + escapeHtml(hostCount) + '</td>'
          + '<td data-col="volume_count">' + escapeHtml(volumeCount) + '</td>'
          + '<td data-col="assigned_capacity">' + escapeHtml(capText) + '</td>'
          + '<td data-col="replicated">' + escapeHtml(it.replicated || 'N') + '</td>'
          + '<td class="system-actions table-actions">'
          + '  <button class="action-btn js-asg-edit" type="button" title="편집" aria-label="편집"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon"></button>'
          + '  <button class="action-btn danger js-asg-del" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
          + '</td>';
        tbody.appendChild(tr);
      });
    }

    function loadPage(page){
      state.page = usePaginationUi ? (page || 1) : 1;

      if(!assetId){
        renderGroups([]);
        setPagination(0);
        renderEmpty(true);
        return Promise.resolve();
      }

      var url = API_BASE + qs({ scope_key: ctx.scopeKey, asset_id: assetId, page: state.page, page_size: state.pageSize });
      return fetchJSON(url, { method:'GET' }).then(function(data){
        var items = (data && Array.isArray(data.items)) ? data.items : [];
        renderGroups(items);
        setPagination((data && data.total != null) ? data.total : items.length);
        renderEmpty(items.length === 0);
      }).catch(function(err){
        toast(err && err.message ? err.message : '목록 조회 실패', 'error');
      });
    }

    function openGroup(groupId){
      currentGroupId = groupId;
      currentGroupAssignedCapacity = '';
      setModalVisible(modal, true);
      setActiveTab(modal, 'overview');

      // Ensure work-name datalist is populated (so the dropdown appears immediately).
      prefetchWorkDatalistOnce();

      if(modalTitle) modalTitle.textContent = groupId ? ('업무 그룹 #' + String(groupId)) : '업무 그룹 (신규)';
      if(inputName) inputName.value = '';
      if(inputAssignedCapacity) inputAssignedCapacity.value = '';
      if(inputDesc) inputDesc.value = '';
      if(inputRemark) inputRemark.value = '';
      if(hostTbody) hostTbody.innerHTML = '';
      if(volTbody) volTbody.innerHTML = '';
      if(replTbody) replTbody.innerHTML = '';

      if(!groupId) return;

      fetchJSON(API_BASE + '/' + String(groupId), { method:'GET' }).then(function(g){
        if(inputName) inputName.value = g.group_name || '';
        currentGroupAssignedCapacity = g.assigned_capacity || '';
        if(inputAssignedCapacity) inputAssignedCapacity.value = currentGroupAssignedCapacity;
        if(inputDesc) inputDesc.value = g.group_desc || '';
        if(inputRemark) inputRemark.value = g.remark || '';
        if(modalTitle) modalTitle.textContent = '업무 그룹: ' + (g.group_name || ('#' + String(groupId)));
      }).catch(function(err){
        toast(err && err.message ? err.message : '업무 그룹 조회 실패', 'error');
      });

      loadHosts();
      loadVolumes();
      loadReplications();
    }

    function saveGroup(){
      if(!assetId){
        toast('선택된 스토리지가 없습니다. 목록에서 스토리지를 선택하세요.', 'warning');
        try{ window.location.href = ctx.listPath; }catch(_e){}
        return Promise.reject(new Error('no assetId'));
      }

      var name = (inputName && inputName.value ? inputName.value : '').trim();
      if(!name){
        toast('업무 그룹 이름이 필요합니다.', 'warning');
        return Promise.reject(new Error('missing group_name'));
      }

      var payload = {
        group_name: name,
        group_desc: inputDesc ? inputDesc.value : '',
        remark: inputRemark ? inputRemark.value : ''
      };

      var method, url;
      if(currentGroupId){
        method = 'PUT';
        url = API_BASE + '/' + String(currentGroupId);
        // If assigned capacity UI is removed, preserve the stored value instead of wiping it.
        if(inputAssignedCapacity) payload.assigned_capacity = inputAssignedCapacity.value;
        else payload.assigned_capacity = currentGroupAssignedCapacity || '';
      }else{
        method = 'POST';
        url = API_BASE;
        payload.scope_key = ctx.scopeKey;
        payload.asset_id = assetId;
        if(inputAssignedCapacity) payload.assigned_capacity = inputAssignedCapacity.value;
      }

      return fetchJSON(url, { method: method, body: JSON.stringify(payload) }).then(function(g){
        currentGroupId = g.id;
        if(g && g.assigned_capacity != null) currentGroupAssignedCapacity = g.assigned_capacity;
        if(modalTitle) modalTitle.textContent = '업무 그룹: ' + (g.group_name || ('#' + String(g.id)));
        loadPage(state.page);
        toast('저장되었습니다.', 'success');
        return g;
      }).catch(function(err){
        toast(err && err.message ? err.message : '저장 실패', 'error');
        throw err;
      });
    }

    function hasUnsavedEditorRows(){
      try{
        if(hostTbody && hostTbody.querySelector && hostTbody.querySelector('.asg-editor-row')) return true;
        if(volTbody && volTbody.querySelector && volTbody.querySelector('.asg-editor-row')) return true;
        if(replTbody && replTbody.querySelector && replTbody.querySelector('.asg-editor-row')) return true;
        if(replTbody && replTbody.querySelector && replTbody.querySelector('tr[data-editing="1"]')) return true;
      }catch(_e){}
      return false;
    }

    function saveAllEditingReplRows(){
      if(!replTbody) return Promise.resolve();
      var rows = replTbody.querySelectorAll('tr[data-editing="1"]');
      if(!rows.length) return Promise.resolve();
      var promises = [];
      for(var i=0; i<rows.length; i++){
        var tr = rows[i];
        var btn = tr.querySelector('.js-repl-edit');
        if(btn) promises.push(saveReplRow(tr, btn));
      }
      return Promise.all(promises);
    }

    function ensureGroupSavedAsync(){
      if(currentGroupId) return Promise.resolve(true);

      // If name already typed in overview, use it.
      var name = (inputName && inputName.value ? inputName.value : '').trim();
      if(!name){
        // Ask for minimal required field so child tabs can save independently.
        var asked = '';
        try{ asked = window.prompt('업무 그룹 이름을 입력하세요. (호스트/볼륨/복제 저장을 위해 필요합니다.)', ''); }catch(_e){ asked = ''; }
        asked = (asked || '').trim();
        if(!asked){
          toast('업무 그룹 이름이 필요합니다.', 'warning');
          setActiveTab(modal, 'overview');
          return Promise.resolve(false);
        }
        try{ if(inputName) inputName.value = asked; }catch(_e2){}
      }

      return saveGroup().then(function(){ return true; }).catch(function(){ return false; });
    }

    function confirmDeleteGroup(groupId){
      if(!groupId) return;
      var ok = false;
      try{ ok = window.confirm('삭제하시겠습니까? (하위 데이터도 함께 삭제됩니다)'); }catch(_e){ ok = false; }
      if(!ok) return;

      fetchJSON(API_BASE + '/' + String(groupId), { method:'DELETE' }).then(function(){
        toast('삭제되었습니다.', 'success');
        if(currentGroupId === groupId) setModalVisible(modal, false);
        loadPage(1);
      }).catch(function(err){
        toast(err && err.message ? err.message : '삭제 실패', 'error');
      });
    }

    function ensureGroupSaved(){
      // legacy sync helper kept for compatibility
      if(currentGroupId) return true;
      toast('업무 그룹이 아직 저장되지 않았습니다. 먼저 저장이 필요합니다.', 'warning');
      setActiveTab(modal, 'overview');
      return false;
    }

    function renderEditorRow(tbody, cols, onSave){
      if(!tbody) return null;
      var tr = document.createElement('tr');
      tr.className = 'asg-editor-row';

      cols.forEach(function(c){
        var td = document.createElement('td');
        var el;
        if(c && c.type === 'select'){
          var sel = document.createElement('select');
          sel.className = 'form-input';
          var options = Array.isArray(c.options) ? c.options : [];
          if(c.includeEmpty){
            var optEmpty = document.createElement('option');
            optEmpty.value = '';
            optEmpty.textContent = c.placeholder || '-';
            sel.appendChild(optEmpty);
          }
          options.forEach(function(o){
            var opt = document.createElement('option');
            if(o && typeof o === 'object'){
              opt.value = String(o.value != null ? o.value : '');
              opt.textContent = String(o.label != null ? o.label : opt.value);
            }else{
              opt.value = String(o);
              opt.textContent = String(o);
            }
            sel.appendChild(opt);
          });
          td.appendChild(sel);
          el = sel;
        }else{
          var inp = document.createElement('input');
          inp.className = 'form-input';
          inp.type = 'text';
          inp.placeholder = (c && c.placeholder) ? c.placeholder : '';
          td.appendChild(inp);
          el = inp;
        }
        td.__input = el;
        tr.appendChild(td);
      });

      var tdAct = document.createElement('td');
      tdAct.className = 'system-actions table-actions';
      tdAct.innerHTML = ''
        + '<button class="action-btn js-row-save" type="button" title="저장" aria-label="저장">'
        + '  <img src="/static/image/svg/save.svg" alt="저장" class="action-icon">'
        + '</button>'
        + '<button class="action-btn danger js-row-del" type="button" title="삭제" aria-label="삭제">'
        + '  <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">'
        + '</button>';
      tr.appendChild(tdAct);
      tbody.insertBefore(tr, tbody.firstChild);

      tr.querySelector('.js-row-del').addEventListener('click', function(){
        try{ tr.parentNode.removeChild(tr); }catch(_e){}
      });

      tr.querySelector('.js-row-save').addEventListener('click', function(){
        var payload = {};
        var tds = Array.prototype.slice.call(tr.children);
        for(var i=0;i<cols.length;i++) payload[cols[i].key] = tds[i].__input ? tds[i].__input.value : '';
        onSave(payload, tr);
      });

      return tr;
    }

    function ynToOx(v){
      var s = String(v == null ? '' : v).trim().toUpperCase();
      if(s === 'Y') return 'O';
      if(s === 'N') return 'X';
      if(s === 'O' || s === 'X') return s;
      return String(v == null ? '' : v);
    }

    function parseCapacityToGbNumber(raw){
      var s = String(raw == null ? '' : raw).trim();
      if(!s) return null;
      s = s.replace(/,/g, '');
      // Accept: "10", "10GB", "10 GB", "1TB", "512MB" (case-insensitive)
      var m = s.match(/^\s*([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z]{0,2})\s*$/);
      if(!m) return null;
      var n = parseFloat(m[1]);
      if(!isFinite(n)) return null;
      var unit = String(m[2] || '').toUpperCase();
      if(unit === '' || unit === 'G' || unit === 'GB') return n;
      if(unit === 'T' || unit === 'TB') return n * 1024;
      if(unit === 'M' || unit === 'MB') return n / 1024;
      return null;
    }

    function normalizeCapacityForSave(raw){
      var s = String(raw == null ? '' : raw).trim();
      if(!s) return '';
      s = s.replace(/,/g, '');

      // DB에는 "숫자만" 저장한다 (단위/공백 제거).
      // - 입력은 10, 10GB, 10 GB, 1TB, 512MB 등을 허용
      // - 저장은 항상 GB 기준 숫자만 (예: 1TB -> 1024)
      function numToSaveString(n){
        if(n == null || !isFinite(n)) return '';
        // keep up to 6 decimals; trim trailing zeros
        var x = Math.round(n * 1000000) / 1000000;
        if(Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
        var out = String(x);
        if(out.indexOf('.') > -1) out = out.replace(/0+$/,'').replace(/\.$/,'');
        return out;
      }

      var gb = parseCapacityToGbNumber(s);
      if(gb != null) return numToSaveString(gb);

      // Fallback: extract leading number only.
      var m = s.match(/^\s*([0-9]+(?:\.[0-9]+)?)/);
      if(m) return String(m[1]);
      return '';
    }

    function formatGbDisplayFromRaw(raw){
      var s = String(raw == null ? '' : raw).trim();
      if(!s) return '';
      s = s.replace(/,/g, '');
      // If it's a plain number, show as GB.
      if(/^[0-9]+(?:\.[0-9]+)?$/.test(s)) return formatNumberStringWithCommas(s) + ' GB';
      // If it already has a unit (e.g. 10GB), keep, but add a space before unit for readability.
      var m = s.match(/^\s*([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z]{1,3})\s*$/);
      if(m) return formatNumberStringWithCommas(m[1]) + ' ' + String(m[2]).toUpperCase();
      return s;
    }

    function attachCapacityInputBehavior(inp){
      if(!inp || inp.__tab32CapacityBound) return;
      inp.__tab32CapacityBound = true;
      // Keep capacity input left-aligned (matches volume column policy).
      try{ inp.style.textAlign = 'left'; }catch(_e){}

      function mapCaretPos(oldStr, oldPos, newStr){
        try{
          if(oldPos == null || oldPos < 0) return null;
          var oldLeft = String(oldStr || '').slice(0, oldPos);
          var target = oldLeft.replace(/,/g, '');
          if(!target) return 0;
          var built = '';
          for(var i=0;i<newStr.length;i++){
            var ch = newStr.charAt(i);
            if(ch !== ',') built += ch;
            if(built.length >= target.length) return i + 1;
          }
          return newStr.length;
        }catch(_e){
          return null;
        }
      }

      function applyPretty(tryPreserveCaret){
        var before = '';
        try{ before = String(inp.value == null ? '' : inp.value); }catch(_e0){ before = ''; }
        var pretty = '';
        try{ pretty = formatCapacityInputPretty(before); }catch(_e1){ pretty = before; }
        if(pretty === before) return;
        var newPos = null;
        if(tryPreserveCaret){
          try{
            newPos = mapCaretPos(before, inp.selectionStart, pretty);
          }catch(_e2){ newPos = null; }
        }
        try{ inp.value = pretty; }catch(_e3){}
        if(newPos != null){
          try{ inp.setSelectionRange(newPos, newPos); }catch(_e4){}
        }
      }

      // Format as user types (display only).
      inp.addEventListener('input', function(){ applyPretty(true); });

      inp.addEventListener('blur', function(){
        applyPretty(false);
      });

      // Initial pretty formatting when the input is mounted.
      setTimeout(function(){ applyPretty(false); }, 0);
    }

    function findDuplicateVolume(volumeName, uuid, ignoreId, ignoreRowEl){
      if(!volTbody) return null;
      var nameKey = normalizeKey(volumeName);
      var uuidKey = normalizeKey(uuid);
      var rows = volTbody.querySelectorAll('tr');
      for(var i=0;i<rows.length;i++){
        var tr = rows[i];
        if(!tr || tr === ignoreRowEl) continue;
        if(tr.classList && (tr.classList.contains('asg-total-row'))) continue;
        var rowId = parseInt(tr.getAttribute('data-id'), 10);
        if(ignoreId && rowId === ignoreId) continue;

        var c0 = tr.children && tr.children[0];
        var c1 = tr.children && tr.children[1];
        if(!c0 || !c1) continue;
        var rowName = '';
        var rowUuid = '';
        var in0 = c0.querySelector ? c0.querySelector('input.form-input') : null;
        var in1 = c1.querySelector ? c1.querySelector('input.form-input') : null;
        rowName = in0 ? in0.value : (c0.textContent || '');
        rowUuid = in1 ? in1.value : (c1.textContent || '');
        rowName = normalizeKey(rowName);
        rowUuid = normalizeKey(rowUuid);

        if(nameKey && rowName && nameKey === rowName){
          return { field: 'volume_name', message: '볼륨 이름은 중복될 수 없습니다.' };
        }
        if(uuidKey && rowUuid && uuidKey === rowUuid){
          return { field: 'uuid', message: 'UUID는 중복될 수 없습니다.' };
        }
      }
      return null;
    }

    function oxBadgeHtml(v){
      var s = String(v == null ? '' : v).trim().toUpperCase();
      if(s === 'O') return '<span class="ox-badge on">O</span>';
      if(s === 'X') return '<span class="ox-badge off">X</span>';
      return '<span class="ox-badge is-empty">-</span>';
    }

    function oxToYn(v){
      var s = String(v == null ? '' : v).trim().toUpperCase();
      if(s === 'O') return 'Y';
      if(s === 'X') return 'N';
      if(s === 'Y' || s === 'N') return s;
      return String(v == null ? '' : v);
    }

    function loadHosts(){
      if(!currentGroupId) return Promise.resolve();
      return fetchJSON(API_BASE + '/' + String(currentGroupId) + '/hosts', { method:'GET' }).then(function(data){
        var items = (data && Array.isArray(data.items)) ? data.items : [];
        if(!hostTbody) return;
        hostTbody.innerHTML = '';
        items.forEach(function(it){
          var tr = document.createElement('tr');
          tr.setAttribute('data-id', String(it.id));
          tr.dataset.workName = String(it.work_name || '');
          tr.dataset.systemName = String(it.system_name || '');
          tr.dataset.hostType = String(it.host_type || '');
          tr.dataset.connType = String(it.conn_type || '');
          tr.__hostIdentifiers = Array.isArray(it.identifiers) ? it.identifiers.slice() : [];

          var identHtml = renderHostIdentifiersHtml(it.conn_type || '', tr.__hostIdentifiers, 50);
          tr.innerHTML = ''
            + '<td>' + escapeHtml(it.work_name || '') + '</td>'
            + '<td>' + escapeHtml(it.system_name || '') + '</td>'
            + '<td>' + escapeHtml(it.host_type || '') + '</td>'
            + '<td>' + escapeHtml(displayHostType(it.conn_type || '')) + '</td>'
            + '<td>' + identHtml + '</td>'
            + '<td class="system-actions table-actions">'
            + '  <button class="action-btn js-host-edit" type="button" title="수정" aria-label="수정"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon"></button>'
            + '  <button class="action-btn danger js-host-del" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
            + '</td>';
          hostTbody.appendChild(tr);
        });
      }).catch(function(err){
        toast(err && err.message ? err.message : '호스트 조회 실패', 'error');
      });
    }

    // ---- Host tab (Work/System/HostType/ConnType/ConnIdentifiers) helpers ----
    var HOST_ASSET_SUGGEST_URL = API_BASE + '/host-assets';
    var hostWorkDatalistId = 'asg-workname-datalist';
    var hostHostTypeDatalistId = 'asg-hosttype-datalist';
    var hostConnTypeDatalistId = 'asg-conntype-datalist';
    var hostWorkMap = Object.create(null); // work_name -> system_name
    var hostWorkSuggestTimer = null;
    var hostWorkPrefetched = false;
    var hostWorkSuggestEndpointDisabled = false;

    // ---- Replications tab (Replication Storage Work/System/Method/Remark) helpers ----
    var replStorageMap = Object.create(null); // work_name -> system_name
    var replStorageVolumeNamesCache = Object.create(null); // repl_storage(work_name) -> [volume_name]

    // Local volumes cache (used by replication tab)
    var tab32VolumeNameToCapacityRaw = Object.create(null); // volume_name -> capacity(raw)
    var tab32ReplicatedLocalVolumeNames = []; // [volume_name]

    function updateTab32VolumeCaches(volumeItems){
      tab32VolumeNameToCapacityRaw = Object.create(null);
      tab32ReplicatedLocalVolumeNames = [];
      (volumeItems || []).forEach(function(it){
        var name = String(it && it.volume_name != null ? it.volume_name : '').trim();
        if(!name) return;
        tab32VolumeNameToCapacityRaw[name] = String(it && it.capacity != null ? it.capacity : '').trim();
        if(ynToOx(it && it.replicated != null ? it.replicated : '') === 'O'){
          tab32ReplicatedLocalVolumeNames.push(name);
        }
      });
    }

    function getLocalVolumeCapacityDisplay(volumeName){
      var raw = tab32VolumeNameToCapacityRaw && volumeName ? tab32VolumeNameToCapacityRaw[volumeName] : '';
      return formatGbDisplayFromRaw(raw || '');
    }

    function getLocalVolumeCapacityRaw(volumeName){
      var raw = tab32VolumeNameToCapacityRaw && volumeName ? tab32VolumeNameToCapacityRaw[volumeName] : '';
      return String(raw || '');
    }

    function ensureLocalReplicatedVolumeListLoaded(){
      // openGroup() calls loadVolumes() already, but replAdd/edit can be triggered early.
      if(tab32ReplicatedLocalVolumeNames && tab32ReplicatedLocalVolumeNames.length) return Promise.resolve();
      if(!currentGroupId) return Promise.resolve();
      return fetchJSON(API_BASE + '/' + String(currentGroupId) + '/volumes', { method:'GET' }).then(function(data){
        var items = (data && Array.isArray(data.items)) ? data.items : [];
        updateTab32VolumeCaches(items);
      }).catch(function(){
        // ignore
      });
    }

    function fetchReplicationStorageVolumeNames(replStorageWorkName){
      var w = String(replStorageWorkName || '').trim();
      if(!w) return Promise.resolve([]);
      if(replStorageVolumeNamesCache && Array.isArray(replStorageVolumeNamesCache[w])){
        return Promise.resolve(replStorageVolumeNamesCache[w]);
      }
      if(!currentGroupId) return Promise.resolve([]);
      var url = API_BASE + '/' + String(currentGroupId) + '/replication-storage-volumes' + qs({ work_name: w });
      return fetchJSON(url, { method:'GET' }).then(function(data){
        var items = (data && Array.isArray(data.items)) ? data.items : [];
        var out = (items || []).map(function(x){ return String(x || '').trim(); }).filter(function(x){ return !!x; });
        replStorageVolumeNamesCache[w] = out;
        return out;
      }).catch(function(){
        replStorageVolumeNamesCache[w] = [];
        return [];
      });
    }

    function makeLocalVolumeSelect(currentValue){
      var opts = (tab32ReplicatedLocalVolumeNames || []).map(function(n){ return { value: n, label: n }; });
      return makeStaticSearchSelect(currentValue, opts, '로컬 볼륨 이름', true);
    }

    function setSelectOptionsStatic(sel, options, placeholder, allowClear){
      if(!sel) return;
      var current = String(sel.value || '');
      sel.innerHTML = '';
      if(allowClear){
        var opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = placeholder || '선택';
        sel.appendChild(opt0);
      }
      (options || []).forEach(function(o){
        var opt = document.createElement('option');
        opt.value = String(o.value);
        opt.textContent = String(o.label != null ? o.label : o.value);
        sel.appendChild(opt);
      });
      // Preserve unknown current values.
      if(current){
        var exists = false;
        try{ exists = Array.from(sel.options || []).some(function(o){ return String(o.value || '') === current; }); }catch(_e){ exists = false; }
        if(!exists){
          var optKeep = document.createElement('option');
          optKeep.value = current;
          optKeep.textContent = current;
          optKeep.selected = true;
          sel.appendChild(optKeep);
        }
      }
      sel.value = current;
    }

    // Shared searchable-select (matches “검색어 입력 + 옵션 목록 + 닫기” UX)
    // - Uses the global enhancer from static/js/ui/searchable_select.js
    // - Work name uses an async source (host-assets suggest API)
    function ensureTab32SearchableSources(){
      try{
        if(!window.BlossomSearchableSelectSources || typeof window.BlossomSearchableSelectSources !== 'object'){
          window.BlossomSearchableSelectSources = {};
        }
        if(typeof window.BlossomSearchableSelectSources.tab32WorkAssets !== 'function'){
          window.BlossomSearchableSelectSources.tab32WorkAssets = function(ctx2){
            var q = (ctx2 && ctx2.query != null) ? String(ctx2.query) : '';
            return fetchWorkSuggestions(q).then(function(items){
              // Keep a growing map so selection->system mapping works reliably.
              (items || []).forEach(function(it){
                var w = String(it && it.work_name != null ? it.work_name : '').trim();
                var s = String(it && it.system_name != null ? it.system_name : '').trim();
                if(w) hostWorkMap[w] = s;
              });

              var out = [];
              (items || []).forEach(function(it){
                var w2 = String(it && it.work_name != null ? it.work_name : '').trim();
                var s2 = String(it && it.system_name != null ? it.system_name : '').trim();
                if(!w2) return;
                out.push({
                  value: w2,
                  label: s2 ? (w2 + ' (' + s2 + ')') : w2,
                  displayLabel: w2,
                  searchText: s2 ? (w2 + ' ' + s2) : w2
                });
              });
              if(!out.length){
                return { items: [], emptyMessage: '검색 결과가 없습니다.' };
              }
              return out;
            }).catch(function(err){
              try{
                // Surface errors instead of silently showing an empty list.
                var status = (err && err.status) ? String(err.status) : '';
                var msg = (err && err.message) ? String(err.message) : '업무 목록 조회 실패';
                if(status && msg && msg.indexOf('HTTP ') !== 0) msg = 'HTTP ' + status + ' - ' + msg;
                // Avoid excessively long panel text.
                var shortMsg = msg.length > 80 ? (msg.slice(0, 77) + '...') : msg;
                toast(msg, 'error');
                try{ console.error('[tab32] work assets fetch failed:', err); }catch(_e2){}
              }catch(_e){ }
              return { items: [], emptyMessage: shortMsg || '조회 실패' };
            });
          };
        }

        if(typeof window.BlossomSearchableSelectSources.tab32StorageAssets !== 'function'){
          window.BlossomSearchableSelectSources.tab32StorageAssets = function(ctx2){
            var q = (ctx2 && ctx2.query != null) ? String(ctx2.query) : '';
            return fetchStorageSuggestions(q).then(function(items){
              (items || []).forEach(function(it){
                var w = String(it && it.work_name != null ? it.work_name : '').trim();
                var s = String(it && it.system_name != null ? it.system_name : '').trim();
                if(w) replStorageMap[w] = s;
              });

              var out = [];
              (items || []).forEach(function(it){
                var w2 = String(it && it.work_name != null ? it.work_name : '').trim();
                var s2 = String(it && it.system_name != null ? it.system_name : '').trim();
                if(!w2) return;
                out.push({
                  value: w2,
                  label: s2 ? (w2 + ' (' + s2 + ')') : w2,
                  displayLabel: w2,
                  searchText: s2 ? (w2 + ' ' + s2) : w2
                });
              });
              if(!out.length){
                return { items: [], emptyMessage: '검색 결과가 없습니다.' };
              }
              return out;
            }).catch(function(err){
              try{
                var status = (err && err.status) ? String(err.status) : '';
                var msg = (err && err.message) ? String(err.message) : '스토리지 목록 조회 실패';
                if(status && msg && msg.indexOf('HTTP ') !== 0) msg = 'HTTP ' + status + ' - ' + msg;
                var shortMsg = msg.length > 80 ? (msg.slice(0, 77) + '...') : msg;
                toast(msg, 'error');
                try{ console.error('[tab32] storage assets fetch failed:', err); }catch(_e2){}
              }catch(_e){ }
              return { items: [], emptyMessage: shortMsg || '조회 실패' };
            });
          };
        }
      }catch(_e){
        // ignore
      }
    }

    function fetchStorageSuggestions(q){
      var q0 = String(q || '').trim();
      var limit = 50;
      var base = '/api/hardware/assets?asset_category=STORAGE&page=1&page_size=' + encodeURIComponent(String(Math.min(200, limit)));
      var qPart = q0 ? ('&q=' + encodeURIComponent(q0)) : '';
      var url = base + qPart;
      return fetchJSON(url, { method:'GET' }).then(function(r){
        return (r && Array.isArray(r.items)) ? r.items : [];
      }).then(function(items){
        // Deduplicate by work_name, keep system_name when available.
        var byWork = Object.create(null);
        (items || []).forEach(function(it){
          var w = String(it && it.work_name != null ? it.work_name : '').trim();
          var s = String(it && it.system_name != null ? it.system_name : '').trim();
          if(!w) return;
          if(!byWork[w]) byWork[w] = { work_name: w, system_name: s };
          if(!byWork[w].system_name && s) byWork[w].system_name = s;
        });
        return Object.keys(byWork).map(function(k){ return byWork[k]; });
      });
    }

    function enhanceSearchSelect(el){
      try{
        if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function'){
          window.BlossomSearchableSelect.enhance(el);
        }
      }catch(_e){}
    }

    function displayHostType(t){
      var s = String(t == null ? '' : t).trim();
      if(!s) return '';
      var u = s.toUpperCase();
      if(u === 'ISCSI' || u === 'I-SCSI' || u === 'I_SCSI') return 'iSCSI';
      if(u === 'OBJECT' || u === 'OBJ') return 'Object';
      if(u === 'NAS') return 'NAS';
      if(u === 'FC' || u === 'FIBRECHANNEL' || u === 'FIBERCHANNEL') return 'FC';
      return s;
    }

    function normalizeHostType(t){
      var s = String(t == null ? '' : t).trim();
      if(!s) return '';
      var u = s.toUpperCase();
      if(u === 'ISCSI' || u === 'I-SCSI' || u === 'I_SCSI') return 'iSCSI';
      if(u === 'OBJECT' || u === 'OBJ') return 'Object';
      if(u === 'NAS') return 'NAS';
      if(u === 'FC') return 'FC';
      // keep original if unknown
      return s;
    }

    function identifierLabelByConnType(t){
      var s = normalizeHostType(t);
      if(s === 'FC') return 'WWPN';
      if(s === 'iSCSI') return 'IQN';
      if(s === 'NAS') return 'IP';
      if(s === 'Object') return 'App ID / Service Name';
      return '식별자';
    }

    function hostIdentifierSummary(connType, identifiers){
      var label = identifierLabelByConnType(connType);
      var list = Array.isArray(identifiers) ? identifiers.filter(function(x){ return String(x||'').trim(); }) : [];
      if(!list.length) return { short: '-', full: '' };
      if(list.length === 1) return { short: label + ': ' + String(list[0]), full: label + ': ' + String(list[0]) };
      return { short: label + ' ' + String(list.length) + '개', full: label + ': ' + list.join(', ') };
    }

    function renderHostIdentifiersHtml(connType, identifiers, maxLines){
      var label = identifierLabelByConnType(connType);
      var list = Array.isArray(identifiers) ? identifiers.map(function(x){ return String(x||'').trim(); }).filter(function(x){ return !!x; }) : [];
      var limit = (maxLines == null ? 50 : parseInt(maxLines, 10));
      if(isNaN(limit) || limit <= 0) limit = 50;

      if(list.length === 0){
        return '<span class="asg-ident-empty">-</span>';
      }

      var shown = list.slice(0, limit);
      var html = '<div class="asg-ident-full" data-label="' + escapeHtml(label) + '">'
        + shown.map(function(x){ return '<div class="asg-ident-line">' + escapeHtml(x) + '</div>'; }).join('')
        + '</div>';

      if(list.length > limit){
        html += '<div class="asg-ident-more">… +' + escapeHtml(String(list.length - limit)) + '개</div>';
      }
      return html;
    }

    function ensureWorkDatalist(){
      var dl = document.getElementById(hostWorkDatalistId);
      if(dl) return dl;
      dl = document.createElement('datalist');
      dl.id = hostWorkDatalistId;
      document.body.appendChild(dl);
      return dl;
    }

    function ensureHostTypeDatalist(){
      var dl = document.getElementById(hostHostTypeDatalistId);
      if(dl) return dl;
      dl = document.createElement('datalist');
      dl.id = hostHostTypeDatalistId;
      dl.innerHTML = ''
        + '<option value="Windows"></option>'
        + '<option value="Linux"></option>'
        + '<option value="AIX"></option>'
        + '<option value="HP-UX"></option>'
        + '<option value="ESXi"></option>'
        + '<option value="Kubernetes"></option>';
      document.body.appendChild(dl);
      return dl;
    }

    function ensureConnTypeDatalist(){
      var dl = document.getElementById(hostConnTypeDatalistId);
      if(dl) return dl;
      dl = document.createElement('datalist');
      dl.id = hostConnTypeDatalistId;
      dl.innerHTML = ''
        + '<option value="FC"></option>'
        + '<option value="NAS"></option>'
        + '<option value="iSCSI"></option>'
        + '<option value="Object"></option>';
      document.body.appendChild(dl);
      return dl;
    }

    function updateWorkDatalist(items){
      var dl = ensureWorkDatalist();
      dl.innerHTML = '';
      hostWorkMap = Object.create(null);
      (items || []).forEach(function(it){
        var w = String(it && it.work_name != null ? it.work_name : '').trim();
        var s = String(it && it.system_name != null ? it.system_name : '').trim();
        if(!w) return;
        hostWorkMap[w] = s;
        var opt = document.createElement('option');
        opt.value = w;
        try{ opt.label = s; }catch(_e){}
        dl.appendChild(opt);
      });
    }

    function fetchWorkSuggestions(q){
      var q0 = q || '';

      function fallback(){
        // Fallback to the generic hardware assets endpoint, which exists broadly across pages.
        // Keep the same default filter: ON_PREMISE/CLOUD/WORKSTATION.
        var limit = 50;
        var base = '/api/hardware/assets?asset_category=SERVER&page=1&page_size=' + encodeURIComponent(String(Math.min(200, limit)));
        var qPart = String(q0 || '').trim() ? ('&q=' + encodeURIComponent(String(q0 || '').trim())) : '';
        var urls = [
          base + '&asset_type=ON_PREMISE' + qPart,
          base + '&asset_type=CLOUD' + qPart,
          base + '&asset_type=WORKSTATION' + qPart
        ];

        return Promise.all(urls.map(function(u){
          return fetchJSON(u, { method:'GET' })
            .then(function(r){ return { ok: true, items: (r && Array.isArray(r.items)) ? r.items : [] }; })
            .catch(function(err){ return { ok: false, err: err, items: [] }; });
        })).then(function(resps){
          var byWork = Object.create(null);
          var anyOk = false;
          var firstErr = null;
          (resps || []).forEach(function(r){
            if(r && r.ok) anyOk = true;
            if(!firstErr && r && r.err) firstErr = r.err;
            var items = (r && Array.isArray(r.items)) ? r.items : [];
            items.forEach(function(it){
              var w = String(it && it.work_name != null ? it.work_name : '').trim();
              var s = String(it && it.system_name != null ? it.system_name : '').trim();
              if(!w) return;
              if(!byWork[w]) byWork[w] = { work_name: w, system_name: s, asset_type: (it && it.asset_type) ? String(it.asset_type) : '' };
              // Prefer keeping a system_name when available.
              if(!byWork[w].system_name && s) byWork[w].system_name = s;
            });
          });

          var out = Object.keys(byWork).map(function(k){ return byWork[k]; });
          if(!anyOk && !out.length){
            var e = new Error('업무 목록 조회 실패: 사용할 수 있는 API가 없습니다.');
            try{ if(firstErr && firstErr.status) e.status = firstErr.status; }catch(_e2){}
            throw e;
          }
          return out;
        });
      }

      // Some deployments don't have the Tab32-specific endpoint. Avoid spamming 404s:
      // once we detect a 404, permanently switch to the generic hardware assets fallback.
      if(hostWorkSuggestEndpointDisabled){
        return fallback();
      }

      return fetchJSON(HOST_ASSET_SUGGEST_URL + qs({ q: q0, limit: 30 }), { method:'GET' })
        .then(function(data){
          return (data && Array.isArray(data.items)) ? data.items : [];
        })
        .catch(function(err){
          var msg = (err && err.message) ? String(err.message) : '';
          var status = (err && err.status) ? parseInt(err.status, 10) : 0;
          var looksNotFound = status === 404 || /not\s*found/i.test(msg);
          if(looksNotFound) hostWorkSuggestEndpointDisabled = true;
          return fallback();
        });
    }

    function makeStaticSearchSelect(value, options, placeholder, allowClear){
      var sel = document.createElement('select');
      sel.className = 'form-input search-select';
      if(placeholder) sel.setAttribute('data-placeholder', String(placeholder));
      if(allowClear) sel.setAttribute('data-allow-clear', 'true');

      // Empty option enables the clear button in the enhancer.
      if(allowClear){
        var opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = placeholder || '선택';
        sel.appendChild(opt0);
      }

      var current = String(value == null ? '' : value);
      (options || []).forEach(function(o){
        var opt = document.createElement('option');
        opt.value = String(o.value);
        opt.textContent = String(o.label != null ? o.label : o.value);
        sel.appendChild(opt);
      });

      // Preserve unknown values (legacy/free-text) as a selectable option.
      if(current){
        var exists = false;
        try{
          exists = Array.from(sel.options || []).some(function(o){ return String(o.value || '') === current; });
        }catch(_e){ exists = false; }
        if(!exists){
          var optKeep = document.createElement('option');
          optKeep.value = current;
          optKeep.textContent = current;
          optKeep.selected = true;
          sel.appendChild(optKeep);
        }
      }

      sel.value = current;
      return sel;
    }

    function makeWorkSearchSelect(value, systemName){
      ensureTab32SearchableSources();
      var sel = document.createElement('select');
      sel.className = 'form-input search-select';
      sel.setAttribute('data-placeholder', '업무 이름');
      sel.setAttribute('data-search-source', 'tab32WorkAssets');
      sel.setAttribute('data-allow-clear', 'true');

      // Seed options with current value to preserve selection in edit mode.
      var opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = '업무 선택';
      sel.appendChild(opt0);

      var cur = String(value == null ? '' : value).trim();
      if(cur){
        var label = cur;
        var sys = String(systemName == null ? '' : systemName).trim();
        if(sys) label = cur + ' (' + sys + ')';
        var optKeep = document.createElement('option');
        optKeep.value = cur;
        optKeep.textContent = label;
        try{ optKeep.setAttribute('data-display-label', cur); }catch(_e1){}
        optKeep.selected = true;
        sel.appendChild(optKeep);
        if(sys) hostWorkMap[cur] = sys;
      }

      sel.value = cur;
      return sel;
    }

    function makeReplStorageWorkSearchSelect(value, systemName){
      ensureTab32SearchableSources();
      var sel = document.createElement('select');
      sel.className = 'form-input search-select';
      sel.setAttribute('data-placeholder', '복제 스토리지 업무명');
      sel.setAttribute('data-search-source', 'tab32StorageAssets');
      sel.setAttribute('data-allow-clear', 'true');

      var opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = '업무 선택';
      sel.appendChild(opt0);

      var cur = String(value == null ? '' : value).trim();
      if(cur){
        var label = cur;
        var sys = String(systemName == null ? '' : systemName).trim();
        if(sys) label = cur + ' (' + sys + ')';
        var optKeep = document.createElement('option');
        optKeep.value = cur;
        optKeep.textContent = label;
        // Show only work_name in the selected display, but keep system_name in the dropdown label.
        try{ optKeep.setAttribute('data-display-label', cur); }catch(_e1){}
        optKeep.selected = true;
        sel.appendChild(optKeep);
        if(sys) replStorageMap[cur] = sys;
      }

      sel.value = cur;
      return sel;
    }

    function bindReplStorageSelect(workSel, systemInp){
      if(!workSel || workSel.__asgReplWorkBound) return;
      workSel.__asgReplWorkBound = true;

      function applyMapping(){
        var w = String(workSel.value || '').trim();
        var sys = w ? replStorageMap[w] : '';
        if(systemInp){
          if(sys != null && String(sys).trim() !== '') systemInp.value = String(sys);
          else if(!w) systemInp.value = '';
          systemInp.disabled = true;
        }
      }

      workSel.addEventListener('change', function(){
        applyMapping();
      });

      try{ if(systemInp) systemInp.disabled = true; }catch(_e2){}
      applyMapping();
    }

    function prefetchWorkDatalistOnce(){
      if(hostWorkPrefetched) return;
      hostWorkPrefetched = true;
      ensureWorkDatalist();
      fetchWorkSuggestions('').then(function(items){
        updateWorkDatalist(items);
      }).catch(function(){
        // ignore
      });
    }

    function bindWorkNameSelect(workSel, systemInp){
      if(!workSel || workSel.__asgWorkBound) return;
      workSel.__asgWorkBound = true;

      function applyMapping(){
        var w = String(workSel.value || '').trim();
        var sys = w ? hostWorkMap[w] : '';
        if(systemInp){
          if(sys != null && String(sys).trim() !== '') systemInp.value = String(sys);
          else if(!w) systemInp.value = '';
          systemInp.disabled = true;
        }
      }

      workSel.addEventListener('change', function(){
        applyMapping();
      });

      // initial
      try{ if(systemInp) systemInp.disabled = true; }catch(_e2){}
      applyMapping();
    }

    function ensureHostIdentifiersModal(){
      var modalId = 'asg-host-ident-modal';
      var existing = document.getElementById(modalId);
      if(existing) return existing;

      var overlay = document.createElement('div');
      overlay.id = modalId;
      overlay.className = 'asg-submodal';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML = ''
        + '<div class="asg-submodal-content" role="dialog" aria-modal="true" aria-label="식별자 상세">'
        + '  <div class="asg-submodal-header">'
        + '    <div class="asg-submodal-title">'
        + '      <h3 id="asg-host-ident-title">식별자 상세</h3>'
        + '      <p class="asg-submodal-subtitle" id="asg-host-ident-sub">여러 개 입력은 줄바꿈으로 구분합니다.</p>'
        + '    </div>'
        + '    <button class="close-btn" type="button" id="asg-host-ident-close" title="닫기">'
        + '      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        + '    </button>'
        + '  </div>'
        + '  <div class="asg-submodal-body">'
        + '    <label class="form-label" id="asg-host-ident-label" style="margin-bottom:8px;display:block;">식별자</label>'
        + '    <textarea class="form-input" id="asg-host-ident-text" rows="10" placeholder="예) WWPN 또는 IQN 또는 IP 등을 한 줄에 하나씩 입력"></textarea>'
        + '  </div>'
        + '  <div class="asg-submodal-actions">'
        + '    <button type="button" class="btn-primary" id="asg-host-ident-save">저장</button>'
        + '  </div>'
        + '</div>';
      document.body.appendChild(overlay);

      function setVisible(v){
        overlay.classList.toggle('show', !!v);
        overlay.setAttribute('aria-hidden', v ? 'false' : 'true');
      }
      overlay.__setVisible = setVisible;
      overlay.addEventListener('click', function(e){ if(e.target === overlay) setVisible(false); });
      overlay.querySelector('#asg-host-ident-close').addEventListener('click', function(){ setVisible(false); });
      return overlay;
    }

    function parseIdentifiersText(text){
      var raw = String(text || '').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
      var parts = [];
      raw.split('\n').forEach(function(line){
        line.split(',').forEach(function(p){
          var s = String(p || '').trim();
          if(s) parts.push(s);
        });
      });
      // unique (case-insensitive)
      var out = [];
      var seen = {};
      parts.forEach(function(s){
        var k = normalizeKey(s);
        if(!k || seen[k]) return;
        seen[k] = true;
        out.push(s);
      });
      return out;
    }

    function autoGrowTextarea(ta){
      if(!ta || ta.__asgAutoGrow) return;
      ta.__asgAutoGrow = true;
      try{ ta.style.overflowY = 'hidden'; }catch(_e0){}
      function resize(){
        try{
          ta.style.height = 'auto';
          ta.style.height = ta.scrollHeight + 'px';
        }catch(_e){}
      }
      ta.addEventListener('input', resize);
      setTimeout(resize, 0);
    }

    function openIdentifiersModal(connType, identifiers, onSave){
      var overlay = ensureHostIdentifiersModal();
      var title = overlay.querySelector('#asg-host-ident-title');
      var label = overlay.querySelector('#asg-host-ident-label');
      var textarea = overlay.querySelector('#asg-host-ident-text');
      var btnSave = overlay.querySelector('#asg-host-ident-save');

      var idLabel = identifierLabelByConnType(connType);
      if(title) title.textContent = idLabel + ' 상세';
      if(label) label.textContent = idLabel + ' 목록';
      if(textarea) textarea.value = (Array.isArray(identifiers) ? identifiers : []).join('\n');

      btnSave.onclick = function(){
        var list = parseIdentifiersText(textarea ? textarea.value : '');
        try{ if(typeof onSave === 'function') onSave(list); }catch(_e){}
        overlay.__setVisible(false);
      };

      overlay.__setVisible(true);
    }

    function setEditSaveButton(btn, mode){
      if(!btn) return;
      var img = btn.querySelector('img');
      if(mode === 'save'){
        btn.title = '저장';
        btn.setAttribute('aria-label', '저장');
        if(img){ img.src = '/static/image/svg/save.svg'; img.alt = '저장'; }
      }else{
        btn.title = '수정';
        btn.setAttribute('aria-label', '수정');
        if(img){ img.src = '/static/image/svg/list/free-icon-pencil.svg'; img.alt = '수정'; }
      }
    }

    function makeInput(value, placeholder){
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'form-input';
      inp.value = String(value == null ? '' : value);
      inp.placeholder = placeholder || '';
      return inp;
    }

    function makeSelect(value, options, includeEmpty, emptyLabel){
      var sel = document.createElement('select');
      sel.className = 'form-input';
      if(includeEmpty){
        var optEmpty = document.createElement('option');
        optEmpty.value = '';
        optEmpty.textContent = emptyLabel || '-';
        sel.appendChild(optEmpty);
      }
      (options || []).forEach(function(o){
        var opt = document.createElement('option');
        opt.value = String(o.value);
        opt.textContent = String(o.label != null ? o.label : o.value);
        sel.appendChild(opt);
      });
      sel.value = String(value == null ? '' : value);
      return sel;
    }

    function beginInlineEdit(tr, type){
      if(!tr || !type) return false;
      if(tr.classList && tr.classList.contains('asg-total-row')) return false;
      if(tr.getAttribute('data-editing') === '1') return true;

      var tds = tr.children;
      if(!tds || !tds.length) return false;
      tr.setAttribute('data-editing', '1');

      if(type === 'host'){
        // work_name, system_name(auto), host_type, conn_type, identifiers
        var w0 = (tr.dataset && tr.dataset.workName) ? tr.dataset.workName : (tds[0].textContent || '').trim();
        var s1 = (tr.dataset && tr.dataset.systemName) ? tr.dataset.systemName : (tds[1].textContent || '').trim();
        var hostType = (tr.dataset && tr.dataset.hostType) ? tr.dataset.hostType : (tds[2].textContent || '').trim();
        var connType = (tr.dataset && tr.dataset.connType) ? tr.dataset.connType : (tds[3].textContent || '').trim();
        tr.__hostIdentifiers = Array.isArray(tr.__hostIdentifiers) ? tr.__hostIdentifiers : [];

        // 업무 이름: shared searchable dropdown + async source
        var workSel = makeWorkSearchSelect(w0, s1);
        var systemInp = makeInput(s1, '자동 매핑');
        systemInp.disabled = true;
        bindWorkNameSelect(workSel, systemInp);

        // 유형: shared searchable dropdown (static options)
        var hostTypeSel = makeStaticSearchSelect(hostType, [
          {value:'Host',label:'Host'},
          {value:'Cluster',label:'Cluster'},
          {value:'VM',label:'VM'},
          {value:'App',label:'App'},
          {value:'K8S_Namespace',label:'K8S_Namespace'},
          {value:'Backup',label:'Backup'}
        ], '호스트 유형', true);

        var connTypeSel = makeStaticSearchSelect(normalizeHostType(connType), [
          {value:'FC',label:'FC'},
          {value:'NAS',label:'NAS'},
          {value:'iSCSI',label:'iSCSI'},
          {value:'Object',label:'Object'}
        ], '연결 유형', true);

        function renderIdentifierCell(){
          var wrap = document.createElement('div');
          wrap.className = 'asg-identifier-cell';
          var ta = document.createElement('textarea');
          ta.className = 'form-input asg-ident-text';
          ta.rows = 1;
          ta.value = Array.isArray(tr.__hostIdentifiers) ? tr.__hostIdentifiers.join('\n') : '';
          ta.placeholder = identifierLabelByConnType(connTypeSel.value) + ':';
          autoGrowTextarea(ta);

          connTypeSel.addEventListener('change', function(){
            ta.placeholder = identifierLabelByConnType(connTypeSel.value) + ':';
          });

          wrap.appendChild(ta);
          return wrap;
        }

        tds[0].innerHTML = ''; tds[0].appendChild(workSel);
        tds[1].innerHTML = ''; tds[1].appendChild(systemInp);
        tds[2].innerHTML = ''; tds[2].appendChild(hostTypeSel);
        tds[3].innerHTML = ''; tds[3].appendChild(connTypeSel);
        tds[4].innerHTML = ''; tds[4].appendChild(renderIdentifierCell());

        enhanceSearchSelect(workSel);
        enhanceSearchSelect(hostTypeSel);
        enhanceSearchSelect(connTypeSel);
      }else if(type === 'volume'){
        // volume_name, uuid, capacity, thin_thick, replicated, assigned_date
        var vv0 = tds[0].textContent.trim();
        var vv1 = tds[1].textContent.trim();
        var vv2 = normalizeCapacityForSave(tds[2].textContent.trim().replace(/\s+/g,''));
        var vv3 = tds[3].textContent.trim();
        var vv4 = tds[4].textContent.trim();
        var vv5 = tds[5].textContent.trim();

        tds[0].innerHTML = ''; tds[0].appendChild(makeInput(vv0, '볼륨 이름'));
        tds[1].innerHTML = ''; tds[1].appendChild(makeInput(vv1, 'UUID'));
        tds[2].innerHTML = '';
        var capInp = makeInput(vv2, '용량(GB)');
        attachCapacityInputBehavior(capInp);
        tds[2].appendChild(capInp);
        var thinSel = makeStaticSearchSelect(vv3, [{value:'Thin',label:'Thin'},{value:'Thick',label:'Thick'},{value:'Quata',label:'Quata'}], '방식', true);
        tds[3].innerHTML = ''; tds[3].appendChild(thinSel);
        var replSel = makeStaticSearchSelect(vv4, [{value:'O',label:'O'},{value:'X',label:'X'}], '복제볼륨', true);
        tds[4].innerHTML = ''; tds[4].appendChild(replSel);
        tds[5].innerHTML = ''; tds[5].appendChild(makeInput(vv5, '비고'));

        enhanceSearchSelect(thinSel);
        enhanceSearchSelect(replSel);
      }else{
        // replication: local_volume_name, capacity(auto), repl_storage(work_name), repl_volume_name, repl_method, remark
        var lv = (tr.dataset && tr.dataset.localVolumeName) ? tr.dataset.localVolumeName : (tds[0].textContent || '').trim();
        var cap = (tr.dataset && tr.dataset.replCapacity) ? tr.dataset.replCapacity : (tds[1].textContent || '').trim();
        var rw = (tr.dataset && tr.dataset.replStorage) ? tr.dataset.replStorage : (tds[2].textContent || '').trim();
        var rv = (tr.dataset && tr.dataset.replVolumeName) ? tr.dataset.replVolumeName : (tds[3].textContent || '').trim();
        var rm = (tr.dataset && tr.dataset.replMethod) ? tr.dataset.replMethod : (tds[4].textContent || '').trim();
        var rr = (tr.dataset && tr.dataset.replRemark) ? tr.dataset.replRemark : (tds[5].textContent || '').trim();

        // local volume select (replicated=O)
        ensureLocalReplicatedVolumeListLoaded().then(function(){
          var localSel = makeLocalVolumeSelect(lv);
          var capInp = makeInput('', '자동 입력');
          capInp.disabled = true;
          function applyCap(){
            var name = String(localSel.value || '').trim();
            capInp.value = name ? getLocalVolumeCapacityDisplay(name) : '';
          }
          localSel.addEventListener('change', applyCap);
          applyCap();

          var replWorkSel = makeReplStorageWorkSearchSelect(rw, (replStorageMap && rw) ? replStorageMap[rw] : '');

          var replVolSel = makeStaticSearchSelect(rv, [], '복제 볼륨 이름', true);
          // Populate repl volume list based on selected storage
          function refreshReplVolumeOptions(){
            var w = String(replWorkSel.value || '').trim();
            if(!w){
              setSelectOptionsStatic(replVolSel, [], '복제 볼륨 이름', true);
              try{ replVolSel.value = ''; }catch(_e0){}
              return;
            }
            fetchReplicationStorageVolumeNames(w).then(function(names){
              var opts = (names || []).map(function(n){ return { value: n, label: n }; });
              setSelectOptionsStatic(replVolSel, opts, '복제 볼륨 이름', true);
              // keep existing value if still valid
              if(rv) replVolSel.value = rv;
            });
          }
          replWorkSel.addEventListener('change', function(){
            rv = '';
            refreshReplVolumeOptions();
          });
          refreshReplVolumeOptions();

          var replMethodSel = makeStaticSearchSelect(rm, [
            {value:'Sync',label:'Sync'},
            {value:'Async',label:'Async'},
            {value:'Snapshot',label:'Snapshot'},
            {value:'BCV',label:'BCV'}
          ], '복제 방식', true);

          tds[0].innerHTML = ''; tds[0].appendChild(localSel);
          tds[1].innerHTML = ''; tds[1].appendChild(capInp);
          tds[2].innerHTML = ''; tds[2].appendChild(replWorkSel);
          tds[3].innerHTML = ''; tds[3].appendChild(replVolSel);
          tds[4].innerHTML = ''; tds[4].appendChild(replMethodSel);
          tds[5].innerHTML = ''; tds[5].appendChild(makeInput(rr, '비고'));

          enhanceSearchSelect(localSel);
          enhanceSearchSelect(replWorkSel);
          enhanceSearchSelect(replVolSel);
          enhanceSearchSelect(replMethodSel);
        });
      }

      return true;
    }

    function readCellValue(td, preferredTag){
      try{
        if(!td || !td.querySelector) return '';
        var el = null;
        if(preferredTag){
          el = td.querySelector(preferredTag);
        }
        if(!el) el = td.querySelector('select');
        if(!el) el = td.querySelector('input');
        if(!el) el = td.querySelector('textarea');
        if(!el) el = td.querySelector('.form-input');
        return el && el.value != null ? String(el.value) : '';
      }catch(_e){
        return '';
      }
    }

    function saveInlineEdit(tr, type){
      if(!tr || !type) return;
      var id = parseInt(tr.getAttribute('data-id'), 10);
      if(!id) return;
      var tds = tr.children;
      if(!tds || !tds.length) return;

      var payload = {};
      if(type === 'host'){
        payload.work_name = readCellValue(tds[0], 'select').trim();
        payload.system_name = readCellValue(tds[1], 'input').trim();
        payload.host_type = readCellValue(tds[2], 'select').trim();
        payload.conn_type = readCellValue(tds[3], 'select').trim();

        if(!payload.work_name){
          toast('업무 이름이 필요합니다.', 'warning');
          return;
        }
        if(!payload.system_name && payload.work_name){
          try{
            var mapped = hostWorkMap && hostWorkMap[payload.work_name] ? String(hostWorkMap[payload.work_name]) : '';
            if(mapped && mapped.trim()) payload.system_name = mapped.trim();
          }catch(_e2){}
        }
        if(!payload.system_name){
          toast('시스템 이름이 필요합니다.', 'warning');
          return;
        }
        if(!payload.host_type){
          toast('호스트 유형이 필요합니다.', 'warning');
          return;
        }
        if(!payload.conn_type){
          toast('연결 유형이 필요합니다.', 'warning');
          return;
        }

        var identTa = tds[4].querySelector('textarea.asg-ident-text');
        payload.identifiers = parseIdentifiersText(identTa ? identTa.value : '');
      }else if(type === 'volume'){
        payload.volume_name = tds[0].querySelector('.form-input') ? tds[0].querySelector('.form-input').value : '';
        payload.uuid = tds[1].querySelector('.form-input') ? tds[1].querySelector('.form-input').value : '';
        payload.capacity = normalizeCapacityForSave(tds[2].querySelector('.form-input') ? tds[2].querySelector('.form-input').value : '');
        payload.thin_thick = tds[3].querySelector('select.form-input') ? tds[3].querySelector('select.form-input').value : '';
        // Shared is intentionally hidden from UI; preserve existing value if present.
        payload.shared = String(tr.getAttribute('data-shared') || 'N');
        payload.replicated = oxToYn(tds[4].querySelector('select.form-input') ? tds[4].querySelector('select.form-input').value : '');
        payload.assigned_date = tds[5].querySelector('.form-input') ? tds[5].querySelector('.form-input').value : '';

        var dup = findDuplicateVolume(payload.volume_name, payload.uuid, id, null);
        if(dup){
          toast(dup.message, 'warning');
          return;
        }
      }else{
        payload.local_volume_name = readCellValue(tds[0], 'select').trim();
        payload.capacity = normalizeCapacityForSave(readCellValue(tds[1], 'input').trim());
        payload.repl_storage = readCellValue(tds[2], 'select').trim();
        payload.repl_volume_name = readCellValue(tds[3], 'select').trim();
        payload.repl_method = readCellValue(tds[4], 'select').trim();
        payload.remark = readCellValue(tds[5], 'input').trim();

        if(!payload.local_volume_name){
          toast('로컬 볼륨 이름이 필요합니다.', 'warning');
          return;
        }
        if(!payload.capacity){
          // best-effort from cache
          try{ payload.capacity = normalizeCapacityForSave(getLocalVolumeCapacityRaw(payload.local_volume_name)); }catch(_e0){}
        }
        if(!payload.repl_storage){
          toast('복제 스토리지를 선택하세요.', 'warning');
          return;
        }
        if(!payload.repl_volume_name){
          toast('복제 볼륨 이름을 선택하세요.', 'warning');
          return;
        }
        // Keep system_name best-effort for backend storage (not displayed in UI)
        payload.repl_storage_system_name = '';
        try{
          var mapped2 = replStorageMap && replStorageMap[payload.repl_storage] ? String(replStorageMap[payload.repl_storage]) : '';
          if(mapped2 && mapped2.trim()) payload.repl_storage_system_name = mapped2.trim();
        }catch(_e3){}
      }

      var url = (type === 'host') ? (API_BASE + '/hosts/' + String(id))
        : (type === 'volume') ? (API_BASE + '/volumes/' + String(id))
        : (API_BASE + '/replications/' + String(id));

      fetchJSON(url, { method:'PUT', body: JSON.stringify(payload) }).then(function(){
        toast('저장되었습니다.', 'success');
        tr.removeAttribute('data-editing');
        loadPage(state.page);
        if(type === 'host') loadHosts();
        else if(type === 'volume'){ loadVolumes(); loadReplications(); }
        else loadReplications();
      }).catch(function(err){
        toast(err && err.message ? err.message : '저장 실패', 'error');
      });
    }

    function loadVolumes(){
      if(!currentGroupId) return Promise.resolve();
      return fetchJSON(API_BASE + '/' + String(currentGroupId) + '/volumes', { method:'GET' }).then(function(data){
        var items = (data && Array.isArray(data.items)) ? data.items : [];
        try{ updateTab32VolumeCaches(items); }catch(_e0){}
        if(!volTbody) return;
        volTbody.innerHTML = '';

        var totalGb = 0;
        var hasAnyCapacity = false;
        items.forEach(function(it){
          var tr = document.createElement('tr');
          tr.setAttribute('data-id', String(it.id));
          tr.setAttribute('data-shared', String(it.shared || ''));

          var capGb = parseCapacityToGbNumber(it.capacity || '');
          if(capGb != null){
            totalGb += capGb;
            hasAnyCapacity = true;
          }
          var capDisp = formatGbDisplayFromRaw(it.capacity || '');

          tr.innerHTML = ''
            + '<td>' + escapeHtml(it.volume_name || '') + '</td>'
            + '<td>' + escapeHtml(it.uuid || '') + '</td>'
            + '<td>' + escapeHtml(capDisp) + '</td>'
            + '<td>' + escapeHtml(it.thin_thick || '') + '</td>'
            + '<td>' + oxBadgeHtml(ynToOx(it.replicated || '')) + '</td>'
            + '<td>' + escapeHtml(it.assigned_date || '') + '</td>'
            + '<td class="system-actions table-actions">'
            + '  <button class="action-btn js-vol-edit" type="button" title="수정" aria-label="수정"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon"></button>'
            + '  <button class="action-btn danger js-vol-del" type="button" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button>'
            + '</td>';
          volTbody.appendChild(tr);
        });

        // Append total row at the bottom
        var totalTr = document.createElement('tr');
        totalTr.className = 'asg-total-row';
        var totalText = hasAnyCapacity ? (Math.round(totalGb * 100) / 100) : 0;
        var totalDisplay = formatNumberStringWithCommas(String(totalText));
        totalTr.innerHTML = ''
          + '<td><strong>합계</strong></td>'
          + '<td></td>'
          + '<td><strong>' + escapeHtml(String(totalDisplay)) + ' GB</strong></td>'
          + '<td></td>'
          + '<td></td>'
          + '<td></td>'
          + '<td></td>';
        volTbody.appendChild(totalTr);
      }).catch(function(err){
        toast(err && err.message ? err.message : '볼륨 조회 실패', 'error');
      });
    }

    function loadReplications(){
      if(!currentGroupId) return Promise.resolve();

      function formatReplStorageLabel(workName, systemName){
        var w = String(workName || '').trim();
        if(!w) return '';
        // View-mode: show only work_name. system_name is used for selection hints and DB storage.
        return w;
      }

      function buildPayloadFromEditors(tr){
        if(!tr) return null;
        var localVol = String(tr.getAttribute('data-local-volume') || '').trim();
        var ed = tr.__replEditors;
        if(!ed) return null;

        var replStorage = String((ed.storageSel && ed.storageSel.value) || '').trim();
        var replVol = String((ed.replVolSel && ed.replVolSel.value) || '').trim();
        var replMethod = String((ed.methodSel && ed.methodSel.value) || '').trim();
        var remark = String((ed.remarkInp && ed.remarkInp.value) || '').trim();

        var capRaw = '';
        try{ capRaw = getLocalVolumeCapacityRaw(localVol); }catch(_e0){ capRaw = ''; }
        var capSave = normalizeCapacityForSave(capRaw || '');

        var replSystemName = '';
        try{
          var mapped = replStorageMap && replStorageMap[replStorage] ? String(replStorageMap[replStorage]) : '';
          if(mapped && mapped.trim()) replSystemName = mapped.trim();
        }catch(_e1){}

        return {
          local_volume_name: localVol,
          capacity: capSave,
          repl_storage: replStorage,
          repl_storage_system_name: replSystemName,
          repl_volume_name: replVol,
          repl_method: replMethod,
          remark: remark
        };
      }

      function renderReplViewRow(tr){
        if(!tr) return;
        var tds = tr.children;
        if(!tds || tds.length < 7) return;
        var d = tr.__replData || {};
        tds[2].textContent = formatReplStorageLabel(d.repl_storage, d.repl_storage_system_name);
        tds[3].textContent = String(d.repl_volume_name || '').trim();
        tds[4].textContent = String(d.repl_method || '').trim();
        tds[5].textContent = String(d.remark || '').trim();
        try{ tr.setAttribute('data-editing', '0'); }catch(_e0){}
      }

      function enterReplEditMode(tr, btn){
        if(!tr) return;
        var tds = tr.children;
        if(!tds || tds.length < 7) return;
        var d = tr.__replData || {};

        // Create fresh editors each time to avoid searchable-select wrappers leaking into view-mode.
        var w = String(d.repl_storage || '').trim();
        var s = String(d.repl_storage_system_name || '').trim();
        var rv = String(d.repl_volume_name || '').trim();
        var m = String(d.repl_method || '').trim();
        var r = String(d.remark || '').trim();
        if(w && s) replStorageMap[w] = s;

        var storageSel = makeReplStorageWorkSearchSelect(w, s);
        storageSel.classList.add('asg-repl-storage');

        var replVolSel = makeStaticSearchSelect(rv, [], '복제 볼륨 이름', true);
        replVolSel.classList.add('asg-repl-volume');

        var methodSel = makeStaticSearchSelect(m, [
          {value:'Sync',label:'Sync'},
          {value:'Async',label:'Async'},
          {value:'Snapshot',label:'Snapshot'},
          {value:'BCV',label:'BCV'}
        ], '복제 방식', true);
        methodSel.classList.add('asg-repl-method');

        var remarkInp = makeInput(r, '비고');
        remarkInp.classList.add('asg-repl-remark');

        function refreshReplVolumeOptions(){
          var w0 = String(storageSel.value || '').trim();
          if(!w0){
            setSelectOptionsStatic(replVolSel, [], '복제 볼륨 이름', true);
            try{ replVolSel.value = ''; }catch(_e1){}
            return;
          }
          fetchReplicationStorageVolumeNames(w0).then(function(names){
            var opts = (names || []).map(function(n){ return { value: n, label: n }; });
            setSelectOptionsStatic(replVolSel, opts, '복제 볼륨 이름', true);
            try{
              var cur = String(replVolSel.value || '').trim();
              if(cur && !Array.from(replVolSel.options || []).some(function(o){ return String(o.value || '') === cur; })){
                replVolSel.value = '';
              }
            }catch(_e2){}
          });
        }

        storageSel.addEventListener('change', function(){ refreshReplVolumeOptions(); });

        // Put controls into cells
        tds[2].innerHTML = '';
        tds[3].innerHTML = '';
        tds[4].innerHTML = '';
        tds[5].innerHTML = '';
        tds[2].appendChild(storageSel);
        tds[3].appendChild(replVolSel);
        tds[4].appendChild(methodSel);
        tds[5].appendChild(remarkInp);

        tr.__replEditors = {
          storageSel: storageSel,
          replVolSel: replVolSel,
          methodSel: methodSel,
          remarkInp: remarkInp,
          refreshReplVolumeOptions: refreshReplVolumeOptions
        };

        enhanceSearchSelect(storageSel);
        enhanceSearchSelect(replVolSel);
        enhanceSearchSelect(methodSel);
        refreshReplVolumeOptions();

        try{ tr.setAttribute('data-editing', '1'); }catch(_e3){}
        setEditSaveButton(btn, 'save');
      }

      function saveReplRow(tr, btn){
        if(!tr) return Promise.reject(new Error('no tr'));
        var payload = buildPayloadFromEditors(tr);
        if(!payload) return Promise.reject(new Error('no payload'));
        if(!payload.local_volume_name){
          toast('로컬 볼륨 이름이 필요합니다.', 'warning');
          return Promise.reject(new Error('missing local_volume_name'));
        }
        if(!payload.repl_storage){
          toast('복제 스토리지를 선택하세요.', 'warning');
          return Promise.reject(new Error('missing repl_storage'));
        }
        if(!payload.repl_volume_name){
          toast('복제 볼륨 이름을 선택하세요.', 'warning');
          return Promise.reject(new Error('missing repl_volume_name'));
        }

        if(tr.__asgSaving) return Promise.resolve();
        tr.__asgSaving = true;

        var id0 = parseInt(tr.getAttribute('data-id') || '0', 10);
        var url = id0
          ? (API_BASE + '/replications/' + String(id0))
          : (API_BASE + '/' + String(currentGroupId) + '/replications');
        var method = id0 ? 'PUT' : 'POST';
        return fetchJSON(url, { method: method, body: JSON.stringify(payload) }).then(function(row){
          try{
            if(row && row.id) tr.setAttribute('data-id', String(row.id));
          }catch(_e1){}
          toast('저장되었습니다.', 'success');

          // Persist view values from editors
          var ed = tr.__replEditors;
          var d = tr.__replData || {};
          d.repl_storage = payload.repl_storage;
          d.repl_storage_system_name = payload.repl_storage_system_name;
          d.repl_volume_name = payload.repl_volume_name;
          d.repl_method = payload.repl_method;
          d.remark = payload.remark;
          tr.__replData = d;

          // Tear down editors and render plain text
          tr.__replEditors = null;
          renderReplViewRow(tr);
          if(btn) setEditSaveButton(btn, 'edit');
        }).catch(function(err){
          toast(err && err.message ? err.message : '복제 저장 실패', 'error');
          throw err;
        }).finally(function(){
          tr.__asgSaving = false;
        });
      }

      function renderAutoRow(localVolumeName, existing){
        var lv = String(localVolumeName || '').trim();
        if(!lv) return;

        var capDisp = '';
        try{ capDisp = getLocalVolumeCapacityDisplay(lv); }catch(_e0){ capDisp = ''; }

        var idVal = existing && existing.id ? String(existing.id) : '';
        var w = String(existing && existing.repl_storage != null ? existing.repl_storage : '').trim();
        var s = String(existing && existing.repl_storage_system_name != null ? existing.repl_storage_system_name : '').trim();
        var rv = String(existing && existing.repl_volume_name != null ? existing.repl_volume_name : '').trim();
        var m = String(existing && existing.repl_method != null ? existing.repl_method : '').trim();
        var r = String(existing && existing.remark != null ? existing.remark : '').trim();
        if(w && s) replStorageMap[w] = s;

        var tr = document.createElement('tr');
        if(idVal) tr.setAttribute('data-id', idVal);
        tr.setAttribute('data-local-volume', lv);

        var td0 = document.createElement('td');
        var td1 = document.createElement('td');
        var td2 = document.createElement('td');
        var td3 = document.createElement('td');
        var td4 = document.createElement('td');
        var td5 = document.createElement('td');
        var td6 = document.createElement('td');
        td6.className = 'system-actions table-actions';

        td0.textContent = lv;
        td1.textContent = capDisp;

        // View data snapshot (used for plain-text rendering)
        tr.__replData = {
          repl_storage: w,
          repl_storage_system_name: s,
          repl_volume_name: rv,
          repl_method: m,
          remark: r
        };

        // 관리: 수정/저장 버튼만 제공
        var btnEdit = document.createElement('button');
        btnEdit.type = 'button';
        btnEdit.className = 'action-btn js-repl-edit';
        btnEdit.title = '수정';
        btnEdit.setAttribute('aria-label', '수정');
        btnEdit.innerHTML = '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon">';
        td6.appendChild(btnEdit);

        btnEdit.addEventListener('click', function(){
          var editing = tr.getAttribute('data-editing') === '1';
          if(!editing){
            enterReplEditMode(tr, btnEdit);
            return;
          }
          saveReplRow(tr, btnEdit);
        });

        // Append cells before entering view/edit mode (render/edit functions rely on tr.children).
        tr.appendChild(td0);
        tr.appendChild(td1);
        tr.appendChild(td2);
        tr.appendChild(td3);
        tr.appendChild(td4);
        tr.appendChild(td5);
        tr.appendChild(td6);

        // Default rendering: existing rows in view-mode, new rows in edit-mode.
        var hasExisting = !!(existing && (existing.id || existing.repl_storage || existing.repl_volume_name || existing.repl_method || existing.remark));
        if(hasExisting){
          renderReplViewRow(tr);
        }else{
          enterReplEditMode(tr, btnEdit);
        }
        replTbody.appendChild(tr);

        // Note: Editors are created on-demand in enterReplEditMode().
      }

      return ensureLocalReplicatedVolumeListLoaded().then(function(){
        return fetchJSON(API_BASE + '/' + String(currentGroupId) + '/replications', { method:'GET' });
      }).then(function(data){
        var items = (data && Array.isArray(data.items)) ? data.items : [];
        if(!replTbody) return;
        replTbody.innerHTML = '';

        // Map existing rows by local volume name.
        var byLocal = Object.create(null);
        (items || []).forEach(function(it){
          var lv = String(it && it.local_volume_name != null ? it.local_volume_name : '').trim();
          if(!lv) return;
          byLocal[lv.toLowerCase()] = it;
        });

        var renderedLocalKeys = Object.create(null);

        // Auto-generate rows based on local volumes where 복제=O.
        (tab32ReplicatedLocalVolumeNames || []).forEach(function(lvName){
          var key = String(lvName || '').trim().toLowerCase();
          renderAutoRow(lvName, byLocal[key] || null);
          if(key) renderedLocalKeys[key] = true;
        });

        // Render any saved replications not covered by the replicated volume list.
        (items || []).forEach(function(it){
          var lv2 = String(it && it.local_volume_name != null ? it.local_volume_name : '').trim();
          if(!lv2) return;
          var k2 = lv2.toLowerCase();
          if(renderedLocalKeys[k2]) return;
          renderAutoRow(lv2, it);
          renderedLocalKeys[k2] = true;
        });
      }).catch(function(err){
        toast(err && err.message ? err.message : '복제 조회 실패', 'error');
      });
    }

    function deleteChild(type, id){
      if(!id) return;
      var ok = false;
      try{ ok = window.confirm('삭제하시겠습니까?'); }catch(_e){ ok = false; }
      if(!ok) return;

      var url = (type === 'host') ? (API_BASE + '/hosts/' + String(id))
        : (type === 'volume') ? (API_BASE + '/volumes/' + String(id))
        : (API_BASE + '/replications/' + String(id));

      fetchJSON(url, { method:'DELETE' }).then(function(){
        toast('삭제되었습니다.', 'success');
        loadPage(state.page);
        if(type === 'host') loadHosts();
        else if(type === 'volume'){ loadVolumes(); loadReplications(); }
        else loadReplications();
      }).catch(function(err){
        toast(err && err.message ? err.message : '삭제 실패', 'error');
      });
    }

    // --- event bindings ---
    if(btnAdd){
      btnAdd.addEventListener('click', function(){
        if(!assetId){
          toast('선택된 스토리지가 없습니다. 목록에서 스토리지를 선택하세요.', 'warning');
          try{ window.location.href = ctx.listPath; }catch(_e){}
          return;
        }
        openGroup(null);
      });
    }

    if(modalClose) modalClose.addEventListener('click', function(){ setModalVisible(modal, false); });
    if(modal) modal.addEventListener('click', function(e){ if(e.target === modal) setModalVisible(modal, false); });
    if(modalSave) modalSave.addEventListener('click', function(){
      saveGroup().then(function(){
        return saveAllEditingReplRows().catch(function(){ /* 개별 행 실패는 toast로 표시됨 */ });
      }).then(function(){
        if(hasUnsavedEditorRows()){
          toast('호스트/볼륨/복제 탭에 미저장 행이 있습니다. 닫으면 입력이 사라질 수 있습니다.', 'warning');
          var okClose = false;
          try{ okClose = window.confirm('미저장 행이 있습니다. 저장 후 모달을 닫을까요?'); }catch(_e){ okClose = false; }
          if(!okClose) return;
        }
        setModalVisible(modal, false);
      });
    });

    if(modal){
      var tabBtns = modal.querySelectorAll('[data-asg-tab]');
      for(var iTab=0;iTab<tabBtns.length;iTab++){
        tabBtns[iTab].addEventListener('click', function(){
          setActiveTab(modal, this.getAttribute('data-asg-tab'));
        });
      }
    }

    if(selectAll){
      selectAll.addEventListener('change', function(){
        var tbody = table.querySelector('tbody');
        if(!tbody) return;
        var checks = tbody.querySelectorAll('.asg-row-check');
        for(var i=0;i<checks.length;i++) checks[i].checked = !!selectAll.checked;
      });
    }

    if(pageSizeSel){
      pageSizeSel.addEventListener('change', function(){
        state.pageSize = parseInt(pageSizeSel.value, 10) || 10;
        try{
          var sizeKey2 = ctx.assetKeyPrefix + ':asg:pageSize';
          localStorage.setItem(sizeKey2, String(state.pageSize));
        }catch(_e0){}
        loadPage(1);
      });
    }

    if(btnFirst) btnFirst.addEventListener('click', function(){ loadPage(1); });
    if(btnPrev) btnPrev.addEventListener('click', function(){ loadPage(Math.max(1, state.page - 1)); });
    if(btnNext) btnNext.addEventListener('click', function(){
      var totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
      loadPage(Math.min(totalPages, state.page + 1));
    });
    if(btnLast) btnLast.addEventListener('click', function(){
      var totalPages = Math.max(1, Math.ceil(state.total / state.pageSize));
      loadPage(totalPages);
    });

    table.addEventListener('click', function(e){
      var t = e.target;
      var tr = t && t.closest ? t.closest('tr') : null;
      if(!tr) return;
      var id = parseInt(tr.getAttribute('data-id'), 10);
      if(!id) return;

      if(t.closest && t.closest('.js-asg-open')) return openGroup(id);
      if(t.closest && t.closest('.js-asg-edit')) return openGroup(id);
      if(t.closest && t.closest('.js-asg-del')) return confirmDeleteGroup(id);
    });

    if(hostAdd) hostAdd.addEventListener('click', function(){
      ensureGroupSavedAsync().then(function(ok){
        if(!ok) return;
        if(!hostTbody) return;

        var tr = document.createElement('tr');
        tr.className = 'asg-editor-row';
        tr.__hostIdentifiers = [];

        var tdWork = document.createElement('td');
        var tdSystem = document.createElement('td');
        var tdHostType = document.createElement('td');
        var tdConnType = document.createElement('td');
        var tdIdent = document.createElement('td');
        var tdAct = document.createElement('td');
        tdAct.className = 'system-actions table-actions';

        var workSel = makeWorkSearchSelect('', '');
        var systemInp = makeInput('', '자동 매핑');
        systemInp.disabled = true;
        bindWorkNameSelect(workSel, systemInp);

        var hostTypeSel = makeStaticSearchSelect('', [
          {value:'Host',label:'Host'},
          {value:'Cluster',label:'Cluster'},
          {value:'VM',label:'VM'},
          {value:'App',label:'App'},
          {value:'K8S_Namespace',label:'K8S_Namespace'},
          {value:'Backup',label:'Backup'}
        ], '호스트 유형', true);

        var connTypeSel = makeStaticSearchSelect('', [
          {value:'FC',label:'FC'},
          {value:'NAS',label:'NAS'},
          {value:'iSCSI',label:'iSCSI'},
          {value:'Object',label:'Object'}
        ], '연결 유형', true);

        function renderIdentCell(){
          var wrap = document.createElement('div');
          wrap.className = 'asg-identifier-cell';
          var ta = document.createElement('textarea');
          ta.className = 'form-input asg-ident-text';
          ta.rows = 1;
          ta.placeholder = identifierLabelByConnType(connTypeSel.value) + ':';
          autoGrowTextarea(ta);

          connTypeSel.addEventListener('change', function(){
            ta.placeholder = identifierLabelByConnType(connTypeSel.value) + ':';
          });

          wrap.appendChild(ta);
          return wrap;
        }

        tdWork.appendChild(workSel);
        tdSystem.appendChild(systemInp);
        tdHostType.appendChild(hostTypeSel);
        tdConnType.appendChild(connTypeSel);
        tdIdent.appendChild(renderIdentCell());
        tdAct.innerHTML = ''
          + '<button class="action-btn js-row-save" type="button" title="저장" aria-label="저장">'
          + '  <img src="/static/image/svg/save.svg" alt="저장" class="action-icon">'
          + '</button>'
          + '<button class="action-btn danger js-row-del" type="button" title="삭제" aria-label="삭제">'
          + '  <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">'
          + '</button>';

        tr.appendChild(tdWork);
        tr.appendChild(tdSystem);
        tr.appendChild(tdHostType);
        tr.appendChild(tdConnType);
        tr.appendChild(tdIdent);
        tr.appendChild(tdAct);
        hostTbody.insertBefore(tr, hostTbody.firstChild);

        tdAct.querySelector('.js-row-del').addEventListener('click', function(){
          try{ tr.parentNode.removeChild(tr); }catch(_e){}
        });

        tdAct.querySelector('.js-row-save').addEventListener('click', function(){
          var identTa = tdIdent.querySelector('textarea.asg-ident-text');
          var identifiers = parseIdentifiersText(identTa ? identTa.value : '');
          var workName = String(workSel.value || '').trim();
          var systemName = String(systemInp.value || '').trim();
          var hostType = String(hostTypeSel.value || '').trim();
          var connType = String(connTypeSel.value || '').trim();

          if(!workName){
            toast('업무 이름이 필요합니다.', 'warning');
            return;
          }
          if(!systemName && workName){
            try{
              var mapped = hostWorkMap && hostWorkMap[workName] ? String(hostWorkMap[workName]) : '';
              if(mapped && mapped.trim()) systemName = mapped.trim();
            }catch(_e2){}
          }
          if(!systemName){
            toast('시스템 이름이 필요합니다.', 'warning');
            return;
          }
          if(!hostType){
            toast('호스트 유형이 필요합니다.', 'warning');
            return;
          }
          if(!connType){
            toast('연결 유형이 필요합니다.', 'warning');
            return;
          }
          var payload = {
            work_name: workName,
            system_name: systemName,
            host_type: hostType,
            conn_type: connType,
            identifiers: identifiers
          };
          fetchJSON(API_BASE + '/' + String(currentGroupId) + '/hosts', { method:'POST', body: JSON.stringify(payload) }).then(function(){
            toast('추가되었습니다.', 'success');
            try{ tr.parentNode.removeChild(tr); }catch(_e){}
            loadPage(state.page);
            loadHosts();
          }).catch(function(err){
            toast(err && err.message ? err.message : '추가 실패', 'error');
          });
        });

        enhanceSearchSelect(workSel);
        enhanceSearchSelect(hostTypeSel);
        enhanceSearchSelect(connTypeSel);
      });
    });

    if(volAdd) volAdd.addEventListener('click', function(){
      ensureGroupSavedAsync().then(function(ok){
        if(!ok) return;
        var rowEl = renderEditorRow(volTbody, [
          { key:'volume_name', placeholder:'볼륨 이름' },
          { key:'uuid', placeholder:'UUID' },
          { key:'capacity', placeholder:'용량(GB)' },
          { key:'thin_thick', type:'select', options:[{value:'Thin',label:'Thin'},{value:'Thick',label:'Thick'},{value:'Quata',label:'Quata'}], includeEmpty:false, placeholder:'' },
          { key:'replicated', type:'select', options:[{value:'O',label:'O'},{value:'X',label:'X'}], includeEmpty:false, placeholder:'' },
          { key:'assigned_date', placeholder:'비고' }
        ], function(payload, rowEl){
          var dup = findDuplicateVolume(payload.volume_name, payload.uuid, null, rowEl);
          if(dup){
            toast(dup.message, 'warning');
            return;
          }

          payload.capacity = normalizeCapacityForSave(payload.capacity);
          // Normalize to legacy Y/N values for API/storage (UI uses O/X)
          payload.replicated = oxToYn(payload.replicated);
          // Shared is intentionally removed from UI; store as default 'N' for new rows.
          payload.shared = 'N';
          fetchJSON(API_BASE + '/' + String(currentGroupId) + '/volumes', { method:'POST', body: JSON.stringify(payload) }).then(function(){
            toast('추가되었습니다.', 'success');
            try{ rowEl.parentNode.removeChild(rowEl); }catch(_e){}
            loadPage(state.page);
            loadVolumes();
            loadReplications();
          }).catch(function(err){
            toast(err && err.message ? err.message : '추가 실패', 'error');
          });
        });

        // Capacity input: comma formatting + left-align
        try{
          if(rowEl && rowEl.children && rowEl.children[2] && rowEl.children[2].__input){
            attachCapacityInputBehavior(rowEl.children[2].__input);
          }
        }catch(_e2){}
      });
    });

    if(replAdd) replAdd.addEventListener('click', function(){
      ensureGroupSavedAsync().then(function(ok){
        if(!ok) return;
        if(!replTbody) return;

        ensureLocalReplicatedVolumeListLoaded().then(function(){
          var tr = document.createElement('tr');
          tr.className = 'asg-editor-row';

          var tdLocalVol = document.createElement('td');
          var tdCap = document.createElement('td');
          var tdReplStorage = document.createElement('td');
          var tdReplVol = document.createElement('td');
          var tdMethod = document.createElement('td');
          var tdRemark = document.createElement('td');
          var tdAct = document.createElement('td');
          tdAct.className = 'system-actions table-actions';

          var localSel = makeLocalVolumeSelect('');
          var capInp = makeInput('', '자동 입력');
          capInp.disabled = true;
          function applyCap(){
            var name = String(localSel.value || '').trim();
            capInp.value = name ? getLocalVolumeCapacityDisplay(name) : '';
          }
          localSel.addEventListener('change', applyCap);
          applyCap();

          var workSel = makeReplStorageWorkSearchSelect('', '');
          var replVolSel = makeStaticSearchSelect('', [], '복제 볼륨 이름', true);

          function refreshReplVolumeOptions(){
            var w = String(workSel.value || '').trim();
            if(!w){
              setSelectOptionsStatic(replVolSel, [], '복제 볼륨 이름', true);
              try{ replVolSel.value = ''; }catch(_e0){}
              return;
            }
            fetchReplicationStorageVolumeNames(w).then(function(names){
              var opts = (names || []).map(function(n){ return { value: n, label: n }; });
              setSelectOptionsStatic(replVolSel, opts, '복제 볼륨 이름', true);
            });
          }
          workSel.addEventListener('change', refreshReplVolumeOptions);
          refreshReplVolumeOptions();

          var methodSel = makeStaticSearchSelect('', [
            {value:'Sync',label:'Sync'},
            {value:'Async',label:'Async'},
            {value:'Snapshot',label:'Snapshot'},
            {value:'BCV',label:'BCV'}
          ], '복제 방식', true);

          var remarkInp = makeInput('', '비고');

          tdLocalVol.appendChild(localSel);
          tdCap.appendChild(capInp);
          tdReplStorage.appendChild(workSel);
          tdReplVol.appendChild(replVolSel);
          tdMethod.appendChild(methodSel);
          tdRemark.appendChild(remarkInp);
          tdAct.innerHTML = ''
            + '<button class="action-btn js-row-save" type="button" title="저장" aria-label="저장">'
            + '  <img src="/static/image/svg/save.svg" alt="저장" class="action-icon">'
            + '</button>'
            + '<button class="action-btn danger js-row-del" type="button" title="삭제" aria-label="삭제">'
            + '  <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">'
            + '</button>';

          tr.appendChild(tdLocalVol);
          tr.appendChild(tdCap);
          tr.appendChild(tdReplStorage);
          tr.appendChild(tdReplVol);
          tr.appendChild(tdMethod);
          tr.appendChild(tdRemark);
          tr.appendChild(tdAct);
          replTbody.insertBefore(tr, replTbody.firstChild);

          tdAct.querySelector('.js-row-del').addEventListener('click', function(){
            try{ tr.parentNode.removeChild(tr); }catch(_e){}
          });

          tdAct.querySelector('.js-row-save').addEventListener('click', function(){
            var localVolName = String(localSel.value || '').trim();
            var capValue = normalizeCapacityForSave(String(capInp.value || '').trim());
            if(!capValue && localVolName){
              try{ capValue = normalizeCapacityForSave(getLocalVolumeCapacityRaw(localVolName)); }catch(_e0){}
            }

            var replStorageWork = String(workSel.value || '').trim();
            var replVolName = String(replVolSel.value || '').trim();
            var method = String(methodSel.value || '').trim();
            var remark = String(remarkInp.value || '').trim();

            if(!localVolName){
              toast('로컬 볼륨 이름이 필요합니다.', 'warning');
              return;
            }
            if(!replStorageWork){
              toast('복제 스토리지를 선택하세요.', 'warning');
              return;
            }
            if(!replVolName){
              toast('복제 볼륨 이름을 선택하세요.', 'warning');
              return;
            }

            var replSystemName = '';
            try{
              var mapped = replStorageMap && replStorageMap[replStorageWork] ? String(replStorageMap[replStorageWork]) : '';
              if(mapped && mapped.trim()) replSystemName = mapped.trim();
            }catch(_e2){}

            var payload = {
              local_volume_name: localVolName,
              capacity: capValue,
              repl_storage: replStorageWork,
              repl_storage_system_name: replSystemName,
              repl_volume_name: replVolName,
              repl_method: method,
              remark: remark
            };

            fetchJSON(API_BASE + '/' + String(currentGroupId) + '/replications', { method:'POST', body: JSON.stringify(payload) }).then(function(){
              toast('추가되었습니다.', 'success');
              try{ tr.parentNode.removeChild(tr); }catch(_e3){}
              loadPage(state.page);
              loadReplications();
            }).catch(function(err){
              toast(err && err.message ? err.message : '추가 실패', 'error');
            });
          });

          enhanceSearchSelect(localSel);
          enhanceSearchSelect(workSel);
          enhanceSearchSelect(replVolSel);
          enhanceSearchSelect(methodSel);
        });
      });
    });

    if(hostTbody) hostTbody.addEventListener('click', function(e){
      var t = e.target;
      var tr = t && t.closest ? t.closest('tr') : null;
      if(!tr) return;
      if(t.closest && t.closest('.js-host-edit')){
        var btn = t.closest('.js-host-edit');
        if(tr.getAttribute('data-editing') === '1') return saveInlineEdit(tr, 'host');
        beginInlineEdit(tr, 'host');
        setEditSaveButton(btn, 'save');
        return;
      }
      if(t.closest && t.closest('.js-host-del')) return deleteChild('host', parseInt(tr.getAttribute('data-id'), 10));
    });

    if(volTbody) volTbody.addEventListener('click', function(e){
      var t = e.target;
      var tr = t && t.closest ? t.closest('tr') : null;
      if(!tr) return;
      if(t.closest && t.closest('.js-vol-edit')){
        var btnV = t.closest('.js-vol-edit');
        if(tr.getAttribute('data-editing') === '1') return saveInlineEdit(tr, 'volume');
        beginInlineEdit(tr, 'volume');
        setEditSaveButton(btnV, 'save');
        return;
      }
      if(t.closest && t.closest('.js-vol-del')) return deleteChild('volume', parseInt(tr.getAttribute('data-id'), 10));
    });

    // Replications tab is auto-generated and auto-saved (no 관리 column).

    // initial load
    loadPage(1);
  }

  try{
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }catch(_e){}
})();
