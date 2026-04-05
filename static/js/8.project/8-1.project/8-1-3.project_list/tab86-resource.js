// tab86-resource.js — tab86: 자원 관리 (Resource Management)
// 프로젝트에 등록된 시스템 자원을 관리. 시스템 선택 모달로 hardware_asset 검색 후 등록.
(function(){
  'use strict';

  /* ──── state ──── */
  var registeredItems = [];   // PrjTabResource rows loaded from server
  var currentCategory = 'SERVER';
  var currentPage = 1;
  var pageSize = 10;
  var totalItems = 0;

  /* modal state */
  var modalState = {
    activeCategory: 'SERVER',
    page: 1,
    pageSize: 50,
    total: 0,
    codesLoaded: false,
    codesLoading: false,
    selectedAssets: [],
    selectedKeys: new Set(),
    reloadTimer: null
  };

  /* ──── DOM refs ──── */
  var tbody, emptyEl, pageSizeSelect, selectAllCb, categorySelect;
  var paginationInfo, pageNumbers;
  var btnFirst, btnPrev, btnNext, btnLast;

  /* ──── helpers ──── */
  function _esc(v){ if(v==null) return ''; var d=document.createElement('span'); d.textContent=String(v); return d.innerHTML; }

  function _getProjectId(){
    if(typeof window.blsGetProjectId === 'function') return window.blsGetProjectId();
    var m = window.location.search.match(/[?&]id=(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function _assetKey(item){
    return String(item.asset_id || item.id || '') + '|' + String(item.work_name || '') + '|' + String(item.system_name || '');
  }

  function _assetTypeToKo(t){
    var v = String(t||'').trim().toUpperCase();
    if(v === 'ON_PREMISE') return '온프레미스';
    if(v === 'CLOUD') return '클라우드';
    if(v === 'FRAME') return '프레임';
    if(v === 'WORKSTATION') return '워크스테이션';
    return String(t||'').trim() || '-';
  }

  /* ──── color / status helpers ──── */
  function _normalizeHex(v){
    var raw = (v==null)?'':String(v).trim();
    if(!raw) return '';
    var hex = raw.charAt(0)==='#' ? raw.slice(1) : raw;
    if(!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(hex)) return '';
    if(hex.length===3) hex = hex.split('').map(function(c){return c+c;}).join('');
    return '#'+hex.toUpperCase();
  }
  function _hexToRgb(h){
    if(!h) return null;
    var n = h.charAt(0)==='#' ? h.slice(1) : h;
    if(n.length!==6) return null;
    var r=parseInt(n.slice(0,2),16), g=parseInt(n.slice(2,4),16), b=parseInt(n.slice(4,6),16);
    if(isNaN(r)||isNaN(g)||isNaN(b)) return null;
    return [r,g,b];
  }
  function _extractToken(v){
    if(!v) return '';
    var m = String(v).toLowerCase().match(/ws-[a-z0-9-]+/i);
    return m ? m[0].toLowerCase() : '';
  }
  function _deriveStatus(colorVal){
    var raw = (colorVal==null)?'':String(colorVal).trim();
    if(!raw) return {hex:'',token:''};
    var hex = _normalizeHex(raw);
    if(hex) return {hex:hex, token:''};
    var token = _extractToken(raw);
    return {hex:'', token:token};
  }
  function _renderStatus(item){
    var name = item.work_status_name || '';
    if(!name) return '';
    var sc = _deriveStatus(item.work_status_color);
    if(sc.hex){
      var rgb = _hexToRgb(sc.hex);
      var parts = ['--status-dot-color:'+sc.hex];
      if(rgb){
        var rs = rgb.join(',');
        parts.push('--status-bg-color:rgba('+rs+',0.16)');
        parts.push('--status-border-color:rgba('+rs+',0.45)');
      }
      return '<span class="status-pill colored" style="'+parts.join(';')+'">' +
             '<span class="status-dot" aria-hidden="true"></span>' +
             '<span class="status-text">' + _esc(name) + '</span></span>';
    }
    var cls = sc.token || '';
    if(!cls){
      if(name==='가동') cls='ws-run';
      else if(name==='유휴') cls='ws-idle';
      else cls='ws-wait';
    }
    return '<span class="status-pill">' +
           '<span class="status-dot '+cls+'" aria-hidden="true"></span>' +
           '<span class="status-text">' + _esc(name) + '</span></span>';
  }

  /* ════════════════════════════════════════════════════════════
     MAIN TABLE: registered resources (from PrjTabResource)
     ════════════════════════════════════════════════════════════ */
  function _filteredItems(){
    return registeredItems.filter(function(item){
      return item.asset_category === currentCategory;
    });
  }

  function totalPages(){
    return Math.max(1, Math.ceil(totalItems / pageSize));
  }

  function loadRegisteredResources(){
    var projectId = _getProjectId();
    if(!projectId){ registeredItems = []; _afterLoad(); return; }

    fetch('/api/prj/projects/' + projectId + '/tabs/resource', {credentials:'same-origin'})
      .then(function(r){ return r.json(); })
      .then(function(data){
        if(!data.success){ registeredItems = []; _afterLoad(); return; }
        var rows = data.items || [];
        registeredItems = rows.map(function(row){
          var p = row.payload || {};
          return {
            tab_id: row.id,
            asset_id: p.asset_id || '',
            asset_category: p.asset_category || '',
            asset_type: p.asset_type || '',
            work_type_name: p.work_type_name || '',
            work_category_name: p.work_category_name || '',
            work_status_name: p.work_status_name || '',
            work_status_color: p.work_status_color || '',
            work_operation_name: p.work_operation_name || '',
            work_group_name: p.work_group_name || '',
            work_name: p.work_name || '',
            system_name: p.system_name || ''
          };
        });
        _afterLoad();
      })
      .catch(function(){
        registeredItems = [];
        _afterLoad();
      });
  }

  function _afterLoad(){
    var filtered = _filteredItems();
    totalItems = filtered.length;
    renderTable(filtered);
    renderPagination();
  }

  function renderTable(filtered){
    if(!tbody) return;
    if(!filtered) filtered = _filteredItems();
    totalItems = filtered.length;
    tbody.innerHTML = '';
    if(selectAllCb) selectAllCb.checked = false;

    var tp = totalPages();
    if(currentPage > tp) currentPage = tp;
    var start = (currentPage - 1) * pageSize;
    var pageItems = filtered.slice(start, start + pageSize);

    if(pageItems.length === 0){
      if(emptyEl) emptyEl.hidden = false;
      return;
    }
    if(emptyEl) emptyEl.hidden = true;

    pageItems.forEach(function(item){
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="center"><input type="checkbox" class="resource-row-select" data-tab-id="' + item.tab_id + '"></td>' +
        '<td>' + _esc(item.work_type_name) + '</td>' +
        '<td>' + _esc(item.work_category_name) + '</td>' +
        '<td>' + _renderStatus(item) + '</td>' +
        '<td>' + _esc(item.work_operation_name) + '</td>' +
        '<td>' + _esc(item.work_group_name) + '</td>' +
        '<td>' + _esc(item.work_name) + '</td>' +
        '<td>' + _esc(item.system_name) + '</td>' +
        '<td class="center system-actions"><button type="button" class="action-btn danger resource-delete-btn" data-action="delete" data-tab-id="' + item.tab_id + '" title="삭제" aria-label="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon"></button></td>';
      tbody.appendChild(tr);
    });
  }

  /* ──── select-all checkbox ──── */
  function handleSelectAll(){
    var checked = selectAllCb ? selectAllCb.checked : false;
    var boxes = tbody ? tbody.querySelectorAll('.resource-row-select') : [];
    for(var i=0;i<boxes.length;i++) boxes[i].checked = checked;
  }
  function syncSelectAll(){
    if(!selectAllCb || !tbody) return;
    var boxes = tbody.querySelectorAll('.resource-row-select');
    if(boxes.length === 0){ selectAllCb.checked = false; return; }
    var allChecked = true;
    for(var i=0;i<boxes.length;i++){ if(!boxes[i].checked){ allChecked = false; break; } }
    selectAllCb.checked = allChecked;
  }

  /* ──── delete registered resource ──── */
  function deleteResource(tabId){
    if(!confirm('해당 시스템을 자원 목록에서 제거하시겠습니까?')) return;
    var projectId = _getProjectId();
    if(!projectId){ alert('프로젝트 ID를 확인할 수 없습니다.'); return; }

    fetch('/api/prj/projects/' + projectId + '/tabs/resource/' + tabId, {
      method:'DELETE', credentials:'same-origin',
      headers:{'Content-Type':'application/json'}
    })
    .then(function(r){ return r.json(); })
    .then(function(data){
      if(data.success) loadRegisteredResources();
      else alert(data.message || '삭제에 실패했습니다.');
    })
    .catch(function(){ alert('삭제 중 오류가 발생했습니다.'); });
  }

  /* ──── pagination ──── */
  function renderPagination(){
    var tp = totalPages();
    if(currentPage > tp) currentPage = tp;
    if(paginationInfo){
      var start = totalItems ? (currentPage - 1) * pageSize + 1 : 0;
      var end = Math.min(totalItems, currentPage * pageSize);
      paginationInfo.textContent = start + '-' + end + ' / ' + totalItems + '개 항목';
    }
    if(pageNumbers){
      pageNumbers.innerHTML = '';
      for(var p = 1; p <= tp && p <= 50; p++){
        var btn = document.createElement('button');
        btn.className = 'page-btn' + (p === currentPage ? ' active' : '');
        btn.textContent = p;
        btn.dataset.page = p;
        pageNumbers.appendChild(btn);
      }
    }
    togglePageButtons();
  }
  function togglePageButtons(){
    var tp = totalPages();
    if(btnFirst) btnFirst.disabled = (currentPage <= 1);
    if(btnPrev) btnPrev.disabled = (currentPage <= 1);
    if(btnNext) btnNext.disabled = (currentPage >= tp);
    if(btnLast) btnLast.disabled = (currentPage >= tp);
  }
  function goToPage(p){
    var tp = totalPages();
    if(p < 1) p = 1;
    if(p > tp) p = tp;
    currentPage = p;
    var filtered = _filteredItems();
    totalItems = filtered.length;
    renderTable(filtered);
    renderPagination();
  }

  /* ════════════════════════════════════════════════════════════
     SEARCHABLE DROPDOWN (ported from task_detail.js)
     ════════════════════════════════════════════════════════════ */
  var _rsDropdownRegistry = {};
  var _rsActiveDropdownKey = null;

  function _rsCloseActiveDropdown(){
    if(_rsActiveDropdownKey && _rsDropdownRegistry[_rsActiveDropdownKey]){
      try{ _rsDropdownRegistry[_rsActiveDropdownKey].close(); }catch(e){}
    }
  }
  function _rsFilterOptionButtons(optionButtons, keyword){
    var term = String(keyword||'').trim().toLowerCase();
    optionButtons.forEach(function(btn){
      var holder = btn.closest('li') || btn;
      var label = String(btn.getAttribute('data-label') || btn.textContent || '').toLowerCase();
      holder.style.display = (!term || label.indexOf(term) !== -1) ? '' : 'none';
    });
  }
  function _rsMarkSelection(optionButtons, value){
    var v = String(value||'');
    optionButtons.forEach(function(btn){
      btn.classList.toggle('is-selected', String(btn.getAttribute('data-value')||'') === v);
    });
  }

  function _rsInitSearchableSelect(selectEl, key, placeholder){
    if(!selectEl || (selectEl.dataset && selectEl.dataset.rsDropdownBound === '1')) return;
    var td = selectEl.closest('td');
    if(!td) return;

    // wrapper
    var field = document.createElement('div');
    field.className = 'dropdown-field rs-dropdown';
    field.setAttribute('data-rs-dd', key);

    // trigger
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'dropdown-trigger';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.innerHTML = '<span class="dropdown-value placeholder">' + _esc(placeholder || '선택') + '</span>';

    // panel
    var panel = document.createElement('div');
    panel.className = 'dropdown-panel rs-dropdown-portal';
    panel.hidden = true;
    panel.innerHTML =
      '<div class="dropdown-search">' +
        '<input type="text" class="dropdown-search-input" placeholder="검색어 입력" autocomplete="off" />' +
        '<button type="button" class="dropdown-close" data-action="dropdown-close">닫기</button>' +
      '</div>' +
      '<ul class="dropdown-options" role="listbox"></ul>';

    var searchInput = panel.querySelector('.dropdown-search-input');
    var closeDDBtn = panel.querySelector('[data-action="dropdown-close"]');
    var optionsList = panel.querySelector('.dropdown-options');

    // hide native select
    selectEl.classList.add('rs-native-select');
    selectEl.tabIndex = -1;
    selectEl.setAttribute('aria-hidden', 'true');
    selectEl.style.display = 'none';
    field.appendChild(selectEl);
    field.appendChild(trigger);
    field.appendChild(panel);
    td.appendChild(field);

    function rebuildOptions(){
      optionsList.innerHTML = '';
      var btns = [];
      Array.from(selectEl.options || []).forEach(function(opt){
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dropdown-option';
        btn.setAttribute('data-value', String(opt.value||''));
        btn.setAttribute('data-label', String(opt.text||''));
        btn.textContent = String(opt.text||'').trim() || String(opt.value||'').trim();
        li.appendChild(btn);
        optionsList.appendChild(li);
        btns.push(btn);
      });
      return btns;
    }

    var optionButtons = rebuildOptions();

    // Portalize panel to <body> while open
    var _panelPlaceholder = document.createComment('rs-panel:' + key);
    var _panelPortalized = false;
    var _panelFloating = false;

    function _ensurePanelPortal(){
      if(_panelPortalized) return;
      try{
        if(panel.parentNode){
          panel.parentNode.insertBefore(_panelPlaceholder, panel);
          panel.parentNode.removeChild(panel);
        }
        document.body.appendChild(panel);
        _panelPortalized = true;
      }catch(e){}
    }
    function _restorePanelFromPortal(){
      if(!_panelPortalized) return;
      try{
        if(_panelPlaceholder.parentNode){
          _panelPlaceholder.parentNode.insertBefore(panel, _panelPlaceholder);
          _panelPlaceholder.parentNode.removeChild(_panelPlaceholder);
        } else {
          field.appendChild(panel);
        }
      }catch(e){}
      _panelPortalized = false;
    }
    function _repositionPanel(){
      if(panel.hidden) return;
      var rect = trigger.getBoundingClientRect();
      var minWidth = 320;
      var gap = 6;
      var viewportPad = 8;
      var desiredWidth = Math.max(Math.round(rect.width), minWidth);
      var left = Math.round(rect.left);
      left = Math.min(left, Math.max(viewportPad, window.innerWidth - desiredWidth - viewportPad));
      left = Math.max(viewportPad, left);
      panel.style.position = 'fixed';
      panel.style.left = left + 'px';
      panel.style.top = Math.round(rect.bottom + gap) + 'px';
      panel.style.width = desiredWidth + 'px';
      panel.style.maxWidth = Math.max(desiredWidth, minWidth) + 'px';
      panel.style.zIndex = '2147483647';
      _panelFloating = true;
    }
    function _resetPanelPosition(){
      if(!_panelFloating) return;
      panel.style.position = '';
      panel.style.left = '';
      panel.style.top = '';
      panel.style.width = '';
      panel.style.maxWidth = '';
      panel.style.zIndex = '';
      _panelFloating = false;
    }
    function _bindReposition(){
      window.addEventListener('scroll', _repositionPanel, true);
      window.addEventListener('resize', _repositionPanel);
    }
    function _unbindReposition(){
      window.removeEventListener('scroll', _repositionPanel, true);
      window.removeEventListener('resize', _repositionPanel);
    }

    function setValue(value, label){
      var normalized = String(value||'');
      selectEl.value = normalized;
      try{ selectEl.dispatchEvent(new Event('change', { bubbles:true })); }catch(e){}
      var valueEl = trigger.querySelector('.dropdown-value');
      if(valueEl){
        var hasValue = !!normalized;
        valueEl.textContent = hasValue ? (label || normalized) : (placeholder || '선택');
        valueEl.classList.toggle('placeholder', !hasValue);
      }
      _rsMarkSelection(optionButtons, normalized);
    }

    function openPanel(){
      if(!panel.hidden) return;
      _rsCloseActiveDropdown();
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      field.classList.add('open');
      _rsActiveDropdownKey = key;
      _ensurePanelPortal();
      _repositionPanel();
      _bindReposition();
      try{ setTimeout(function(){ if(searchInput) searchInput.focus(); }, 10); }catch(e){}
    }
    function closePanel(){
      if(panel.hidden) return;
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      field.classList.remove('open');
      _unbindReposition();
      _resetPanelPosition();
      _restorePanelFromPortal();
      if(_rsActiveDropdownKey === key) _rsActiveDropdownKey = null;
      if(searchInput){
        searchInput.value = '';
        _rsFilterOptionButtons(optionButtons, '');
      }
    }

    trigger.addEventListener('click', function(e){
      e.preventDefault();
      panel.hidden ? openPanel() : closePanel();
    });

    if(closeDDBtn) closeDDBtn.addEventListener('click', function(e){ e.preventDefault(); closePanel(); });

    optionsList.addEventListener('click', function(e){
      var btn = e.target.closest('button.dropdown-option');
      if(!btn) return;
      e.preventDefault();
      var v = String(btn.getAttribute('data-value')||'');
      var lbl = String(btn.textContent||'').trim();
      setValue(v, lbl);
      closePanel();
    });

    if(searchInput) searchInput.addEventListener('input', function(){
      _rsFilterOptionButtons(optionButtons, searchInput.value);
    });

    document.addEventListener('click', function(e){
      if(panel.hidden) return;
      if(panel.contains(e.target) || trigger.contains(e.target)) return;
      closePanel();
    });

    // initialize current value
    try{
      var selectedOpt = selectEl.selectedOptions && selectEl.selectedOptions[0];
      setValue(selectEl.value || '', selectedOpt ? selectedOpt.textContent.trim() : '');
    }catch(e){}

    _rsDropdownRegistry[key] = {
      close: closePanel,
      rebuild: function(){
        optionButtons = rebuildOptions();
        try{
          var selectedOpt = selectEl.selectedOptions && selectEl.selectedOptions[0];
          setValue(selectEl.value || '', selectedOpt ? selectedOpt.textContent.trim() : '');
        }catch(e){}
      }
    };
    try{ selectEl.dataset.rsDropdownBound = '1'; }catch(e){}
  }

  function _initRsSearchableFilters(){
    var modal = document.getElementById('rs-system-select-modal');
    if(!modal) return;
    var configs = [
      { id:'rs-work-category', key:'rs-work-category', placeholder:'선택' },
      { id:'rs-work-division', key:'rs-work-division', placeholder:'선택' },
      { id:'rs-work-status', key:'rs-work-status', placeholder:'선택' },
      { id:'rs-work-operation', key:'rs-work-operation', placeholder:'선택' },
      { id:'rs-work-group', key:'rs-work-group', placeholder:'선택' }
    ];
    configs.forEach(function(cfg){
      var sel = document.getElementById(cfg.id);
      if(sel) _rsInitSearchableSelect(sel, cfg.key, cfg.placeholder);
    });
  }

  /* ════════════════════════════════════════════════════════════
     SYSTEM SELECT MODAL
     ════════════════════════════════════════════════════════════ */
  function _modalTotalPages(){
    return Math.max(1, Math.ceil(modalState.total / modalState.pageSize));
  }

  function _syncModalPager(){
    var tp = _modalTotalPages();
    var label = document.getElementById('rs-page-label');
    var prevBtn = document.getElementById('rs-page-prev');
    var nextBtn = document.getElementById('rs-page-next');
    if(label) label.textContent = modalState.page + ' / ' + tp;
    if(prevBtn) prevBtn.disabled = (modalState.page <= 1);
    if(nextBtn) nextBtn.disabled = (modalState.page >= tp);
  }

  function _syncSelectedHint(){
    var el = document.getElementById('rs-selected-hint');
    if(!el) return;
    var n = modalState.selectedAssets.length;
    el.textContent = n > 0 ? '선택: ' + n + '대' : '';
    el.hidden = (n <= 0);
  }

  function _buildRegisteredKeySet(){
    var keys = new Set();
    registeredItems.forEach(function(item){ keys.add(_assetKey(item)); });
    return keys;
  }

  function openModal(){
    var modal = document.getElementById('rs-system-select-modal');
    if(!modal) return;
    modalState.selectedAssets = [];
    modalState.selectedKeys = new Set();
    modalState.page = 1;
    _syncSelectedHint();
    _syncModalPager();
    modal.classList.add('show');
    modal.setAttribute('aria-hidden','false');
    document.body.classList.add('modal-open');
    var tabs = modal.querySelector('.system-tabs');
    if(tabs){
      Array.from(tabs.querySelectorAll('button[data-asset-category]')).forEach(function(b){
        var cat = String(b.getAttribute('data-asset-category')||'').trim().toUpperCase();
        var isActive = cat === modalState.activeCategory;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    }
    _ensureCodes().then(function(){
      try{ _initRsSearchableFilters(); }catch(e){}
      _loadModalAssets();
    });
  }

  function closeModal(){
    var modal = document.getElementById('rs-system-select-modal');
    if(!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden','true');
    document.body.classList.remove('modal-open');
    if(modalState.reloadTimer){ clearTimeout(modalState.reloadTimer); modalState.reloadTimer = null; }
  }

  function _ensureCodes(){
    if(modalState.codesLoaded || modalState.codesLoading) return Promise.resolve();
    modalState.codesLoading = true;

    function fillSelect(selId, url, codeKey){
      var sel = document.getElementById(selId);
      if(!sel) return Promise.resolve();
      sel.innerHTML = '';
      var optAll = document.createElement('option');
      optAll.value = '';
      optAll.textContent = '전체';
      sel.appendChild(optAll);
      return fetch(url, {credentials:'same-origin'})
        .then(function(r){ return r.json(); })
        .then(function(json){
          if(!json || json.success !== true) return;
          var items = Array.isArray(json.items) ? json.items : [];
          items.forEach(function(it){
            if(!it) return;
            var code = String(it[codeKey] || '').trim();
            var name = String(it.wc_name || it.name || it[codeKey] || '').trim();
            if(!code) return;
            var opt = document.createElement('option');
            opt.value = code;
            opt.textContent = name || code;
            sel.appendChild(opt);
          });
        }).catch(function(){});
    }

    return Promise.all([
      fillSelect('rs-work-category', '/api/work-categories', 'category_code'),
      fillSelect('rs-work-division', '/api/work-divisions', 'division_code'),
      fillSelect('rs-work-status', '/api/work-statuses', 'status_code'),
      fillSelect('rs-work-operation', '/api/work-operations', 'operation_code'),
      fillSelect('rs-work-group', '/api/work-groups', 'group_code')
    ]).then(function(){
      modalState.codesLoaded = true;
      try{ _initRsSearchableFilters(); }catch(e){}
      try{
        ['rs-work-category','rs-work-division','rs-work-status','rs-work-operation','rs-work-group']
          .forEach(function(id){
            var api = _rsDropdownRegistry[id];
            if(api && typeof api.rebuild === 'function') api.rebuild();
          });
      }catch(e){}
    }).catch(function(){}).then(function(){ modalState.codesLoading = false; });
  }

  function _getModalFilters(){
    function readSel(id){ var el = document.getElementById(id); return el && el.value ? String(el.value).trim() : ''; }
    function readInput(id){ var el = document.getElementById(id); return el && el.value ? String(el.value).trim() : ''; }
    return {
      work_category_code: readSel('rs-work-category'),
      work_division_code: readSel('rs-work-division'),
      work_status_code: readSel('rs-work-status'),
      work_operation_code: readSel('rs-work-operation'),
      work_group_code: readSel('rs-work-group'),
      work_name: readInput('rs-work-name'),
      system_name: readInput('rs-system-name')
    };
  }

  function _scheduleModalReload(opts){
    if(opts && opts.resetPage){ modalState.page = 1; _syncModalPager(); }
    if(modalState.reloadTimer) clearTimeout(modalState.reloadTimer);
    modalState.reloadTimer = setTimeout(function(){ _loadModalAssets(); }, 250);
  }

  function _loadModalAssets(){
    var modal = document.getElementById('rs-system-select-modal');
    if(!modal || !modal.classList.contains('show')) return;
    var mtbody = document.getElementById('rs-system-select-tbody');
    var emptyMsg = document.getElementById('rs-system-select-empty');
    if(!mtbody) return;
    mtbody.innerHTML = '';
    if(emptyMsg){ emptyMsg.hidden = true; emptyMsg.textContent = '조회 결과가 없습니다.'; }

    var filters = _getModalFilters();
    var params = new URLSearchParams();
    params.set('asset_category', modalState.activeCategory);
    for(var k in filters){ if(filters[k]) params.set(k, filters[k]); }
    params.set('page', String(modalState.page || 1));
    params.set('page_size', String(modalState.pageSize || 50));

    var registeredKeys = _buildRegisteredKeySet();

    fetch('/api/hardware/assets?' + params.toString(), {credentials:'same-origin'})
      .then(function(r){ return r.json(); })
      .then(function(json){
        if(!json || json.success !== true){
          if(emptyMsg){ emptyMsg.hidden = false; emptyMsg.textContent = '조회 중 오류가 발생했습니다.'; }
          modalState.total = 0; _syncModalPager();
          return;
        }
        modalState.total = Number(json.total || 0);
        modalState.page = Number(json.page || modalState.page || 1);
        modalState.pageSize = Number(json.page_size || modalState.pageSize || 50);
        var tp = _modalTotalPages();
        if(modalState.page > tp){ modalState.page = tp; _syncModalPager(); return _loadModalAssets(); }
        _syncModalPager();

        var items = Array.isArray(json.items) ? json.items : [];
        if(items.length === 0){
          if(emptyMsg){ emptyMsg.hidden = false; }
          return;
        }
        mtbody.innerHTML = items.map(function(it){
          var assetData = {
            asset_id: it.id || it.asset_id || '',
            asset_category: modalState.activeCategory,
            asset_type: it.asset_type || '',
            work_type_name: it.work_type_name || '',
            work_category_name: it.work_category_name || '',
            work_status_name: it.work_status_name || it.work_status || '',
            work_status_color: it.work_status_color || '',
            work_operation_name: it.work_operation_name || '',
            work_group_name: it.work_group_name || '',
            work_name: it.work_name || it.asset_name || '',
            system_name: it.system_name || ''
          };
          var key = _assetKey(assetData);
          var isRegistered = registeredKeys.has(key);
          var isSelected = modalState.selectedKeys.has(key);
          var checked = isSelected ? 'checked' : '';
          var selectedClass = isSelected ? 'is-selected' : '';
          var disabledAttr = isRegistered ? 'disabled' : '';
          var registeredLabel = isRegistered ? ' (등록됨)' : '';
          var typeDisplay = _assetTypeToKo(it.asset_type);
          var statusDisplay = it.work_status_name || it.work_status || '-';
          var target = it.work_name || it.asset_name || '';
          var system = it.system_name || '';

          return '<tr class="' + selectedClass + (isRegistered ? ' is-registered' : '') + '" ' +
                 'data-asset=\'' + _esc(JSON.stringify(assetData)) + '\'>' +
                 '<td><input type="checkbox" class="rs-check" ' + checked + ' ' + disabledAttr + '></td>' +
                 '<td title="' + _esc(typeDisplay) + '">' + _esc(typeDisplay) + registeredLabel + '</td>' +
                 '<td title="' + _esc(statusDisplay) + '">' + _esc(statusDisplay) + '</td>' +
                 '<td title="' + _esc(target) + '">' + _esc(target) + '</td>' +
                 '<td title="' + _esc(system) + '">' + _esc(system) + '</td>' +
                 '</tr>';
        }).join('');
      })
      .catch(function(){
        if(emptyMsg){ emptyMsg.hidden = false; emptyMsg.textContent = '조회 중 오류가 발생했습니다.'; }
        modalState.total = 0; _syncModalPager();
      });
  }

  function _toggleModalAsset(tr, cb){
    var dataStr = tr.getAttribute('data-asset');
    if(!dataStr) return;
    var assetData;
    try{ assetData = JSON.parse(dataStr); }catch(e){ return; }
    var key = _assetKey(assetData);

    if(cb.checked){
      if(!modalState.selectedKeys.has(key)){
        modalState.selectedAssets.push(assetData);
        modalState.selectedKeys.add(key);
      }
      tr.classList.add('is-selected');
    } else {
      modalState.selectedAssets = modalState.selectedAssets.filter(function(a){ return _assetKey(a) !== key; });
      modalState.selectedKeys.delete(key);
      tr.classList.remove('is-selected');
    }
    _syncSelectedHint();
  }

  function _clearModalSelection(){
    modalState.selectedAssets = [];
    modalState.selectedKeys = new Set();
    _syncSelectedHint();
    var mtbody = document.getElementById('rs-system-select-tbody');
    if(mtbody){
      var cbs = mtbody.querySelectorAll('.rs-check:not(:disabled)');
      for(var i=0; i<cbs.length; i++){
        cbs[i].checked = false;
        var tr = cbs[i].closest('tr');
        if(tr) tr.classList.remove('is-selected');
      }
    }
  }

  function _applySelection(){
    var projectId = _getProjectId();
    if(!projectId){ alert('프로젝트 ID를 확인할 수 없습니다.'); return; }
    var assets = modalState.selectedAssets;
    if(assets.length === 0){ alert('선택된 시스템이 없습니다.'); return; }

    var promises = assets.map(function(asset){
      return fetch('/api/prj/projects/' + projectId + '/tabs/resource', {
        method:'POST', credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ payload: asset })
      }).then(function(r){ return r.json(); });
    });

    Promise.all(promises).then(function(results){
      var successCount = results.filter(function(r){ return r && r.success; }).length;
      var failCount = results.length - successCount;
      closeModal();
      loadRegisteredResources();
      if(failCount > 0) alert(successCount + '건 등록 완료, ' + failCount + '건 실패');
    }).catch(function(){
      alert('등록 중 오류가 발생했습니다.');
      closeModal();
      loadRegisteredResources();
    });
  }

  /* ════════════════════════════════════════════════════════════
     BOOT
     ════════════════════════════════════════════════════════════ */
  function _boot(){
    tbody = document.getElementById('resource-tbody');
    emptyEl = document.getElementById('resource-empty');
    pageSizeSelect = document.getElementById('resource-page-size');
    selectAllCb = document.getElementById('resource-select-all');
    categorySelect = document.getElementById('resource-category');
    paginationInfo = document.getElementById('resource-pagination-info');
    pageNumbers = document.getElementById('resource-page-numbers');
    btnFirst = document.getElementById('resource-first');
    btnPrev = document.getElementById('resource-prev');
    btnNext = document.getElementById('resource-next');
    btnLast = document.getElementById('resource-last');

    if(!tbody) return;

    if(selectAllCb) selectAllCb.addEventListener('change', handleSelectAll);

    tbody.addEventListener('change', function(e){
      if(e.target.classList.contains('resource-row-select')) syncSelectAll();
    });

    tbody.addEventListener('click', function(e){
      var btn = e.target.closest('.resource-delete-btn');
      if(!btn) return;
      var tabId = parseInt(btn.dataset.tabId, 10);
      if(tabId) deleteResource(tabId);
    });

    var addBtn = document.getElementById('resource-row-add');
    if(addBtn) addBtn.addEventListener('click', function(){ openModal(); });

    /* Category dropdown */
    if(categorySelect){
      categorySelect.addEventListener('change', function(){
        currentCategory = this.value;
        currentPage = 1;
        var filtered = _filteredItems();
        totalItems = filtered.length;
        renderTable(filtered);
        renderPagination();
      });
    }

    if(pageSizeSelect){
      pageSizeSelect.addEventListener('change', function(){
        pageSize = parseInt(this.value) || 10;
        currentPage = 1;
        this.classList.add('is-chosen');
        var filtered = _filteredItems();
        totalItems = filtered.length;
        renderTable(filtered);
        renderPagination();
      });
    }

    if(pageNumbers){
      pageNumbers.addEventListener('click', function(e){
        if(e.target.classList.contains('page-btn')) goToPage(parseInt(e.target.dataset.page, 10));
      });
    }

    ['resource-first','resource-prev','resource-next','resource-last'].forEach(function(id){
      var el = document.getElementById(id);
      if(!el) return;
      el.addEventListener('click', function(){
        var pages = totalPages();
        if(id === 'resource-first') currentPage = 1;
        else if(id === 'resource-prev' && currentPage > 1) currentPage--;
        else if(id === 'resource-next' && currentPage < pages) currentPage++;
        else if(id === 'resource-last') currentPage = pages;
        var filtered = _filteredItems();
        totalItems = filtered.length;
        renderTable(filtered);
        renderPagination();
      });
    });

    /* ──── modal event wiring ──── */
    var modalRoot = document.getElementById('rs-system-select-modal');
    if(modalRoot){
      var closeBtn = document.getElementById('rs-system-select-close');
      var applyBtn = document.getElementById('rs-select-apply');
      var clearBtn = document.getElementById('rs-select-clear');
      var pagePrevBtn = document.getElementById('rs-page-prev');
      var pageNextBtn = document.getElementById('rs-page-next');

      if(closeBtn) closeBtn.addEventListener('click', closeModal);
      modalRoot.addEventListener('click', function(e){ if(e.target === modalRoot) closeModal(); });
      document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && modalRoot.classList.contains('show')) closeModal(); });

      var tabs = modalRoot.querySelector('.system-tabs');
      if(tabs){
        tabs.addEventListener('click', function(e){
          var btn = e.target.closest('button[data-asset-category]');
          if(!btn) return;
          var cat = String(btn.getAttribute('data-asset-category')||'').trim().toUpperCase();
          if(!cat || cat === modalState.activeCategory) return;
          modalState.activeCategory = cat;
          modalState.page = 1;
          Array.from(tabs.querySelectorAll('button[data-asset-category]')).forEach(function(b){
            var isActive = (b === btn);
            b.classList.toggle('active', isActive);
            b.setAttribute('aria-selected', isActive ? 'true' : 'false');
          });
          _syncModalPager();
          _loadModalAssets();
        });
      }

      if(pagePrevBtn) pagePrevBtn.addEventListener('click', function(){
        if(modalState.page > 1){ modalState.page--; _syncModalPager(); _loadModalAssets(); }
      });
      if(pageNextBtn) pageNextBtn.addEventListener('click', function(){
        if(modalState.page < _modalTotalPages()){ modalState.page++; _syncModalPager(); _loadModalAssets(); }
      });

      ['rs-work-category','rs-work-division','rs-work-status','rs-work-operation','rs-work-group'].forEach(function(id){
        var el = document.getElementById(id);
        if(el) el.addEventListener('change', function(){ _scheduleModalReload({resetPage:true}); });
      });
      ['rs-work-name','rs-system-name'].forEach(function(id){
        var el = document.getElementById(id);
        if(el){
          el.addEventListener('input', function(){ _scheduleModalReload({resetPage:true}); });
          el.addEventListener('change', function(){ _scheduleModalReload({resetPage:true}); });
        }
      });

      var mtbody = document.getElementById('rs-system-select-tbody');
      if(mtbody){
        mtbody.addEventListener('click', function(e){
          var directCb = e.target.closest('input.rs-check');
          if(directCb){
            if(directCb.disabled) return;
            var tr = directCb.closest('tr');
            if(tr) _toggleModalAsset(tr, directCb);
            return;
          }
          var tr2 = e.target.closest('tr');
          if(!tr2) return;
          var cb = tr2.querySelector('input.rs-check');
          if(!cb || cb.disabled) return;
          cb.checked = !cb.checked;
          _toggleModalAsset(tr2, cb);
        });
      }

      if(clearBtn) clearBtn.addEventListener('click', _clearModalSelection);
      if(applyBtn) applyBtn.addEventListener('click', _applySelection);
    }

    loadRegisteredResources();
  }

  if(document.readyState !== 'loading') _boot();
  else document.addEventListener('DOMContentLoaded', _boot);
})();
