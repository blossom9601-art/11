// ETC(기타 부품) 유형 관리 페이지 스크립트
// 모델명, 용량, 제조사, 부품번호, 수량, 비고의 6-컬럼 스키마를 백엔드와 연동합니다.
(function(){
  const TABLE_ID = 'system-table';
  const TBODY_ID = 'system-table-body';
  const COUNT_ID = 'system-count';
  const SEARCH_ID = 'system-search';
  const SEARCH_CLEAR_ID = 'system-search-clear';
  const PAGE_SIZE_ID = 'system-page-size';
  const PAGINATION_INFO_ID = 'system-pagination-info';
  const PAGE_NUMBERS_ID = 'system-page-numbers';
  const SELECT_ALL_ID = 'system-select-all';

  const COLUMN_MODAL_ID = 'system-column-modal';
  const COLUMN_FORM_ID = 'system-column-form';
  const COLUMN_BTN_ID = 'system-column-btn';
  const COLUMN_CLOSE_ID = 'system-column-close';
  const COLUMN_APPLY_ID = 'system-column-apply';
  const COLUMN_RESET_ID = 'system-column-reset';
  const COLUMN_SELECTALL_BTN_ID = 'system-column-selectall-btn';

  const ADD_MODAL_ID = 'system-add-modal';
  const ADD_BTN_ID = 'system-add-btn';
  const ADD_CLOSE_ID = 'system-add-close';
  const ADD_SAVE_ID = 'system-add-save';
  const ADD_FORM_ID = 'system-add-form';
  const EDIT_MODAL_ID = 'system-edit-modal';
  const EDIT_FORM_ID = 'system-edit-form';
  const EDIT_CLOSE_ID = 'system-edit-close';
  const EDIT_SAVE_ID = 'system-edit-save';

  const DISPOSE_BTN_ID = 'system-dispose-btn';
  const DISPOSE_MODAL_ID = 'system-dispose-modal';
  const DISPOSE_CLOSE_ID = 'system-dispose-close';
  const DISPOSE_CONFIRM_ID = 'system-dispose-confirm';

  const DELETE_BTN_ID = 'system-delete-btn';
  const DELETE_MODAL_ID = 'system-delete-modal';
  const DELETE_CLOSE_ID = 'system-delete-close';
  const DELETE_CONFIRM_ID = 'system-delete-confirm';

  const BULK_BTN_ID = 'system-bulk-btn';
  const BULK_MODAL_ID = 'system-bulk-modal';
  const BULK_CLOSE_ID = 'system-bulk-close';
  const BULK_FORM_ID = 'system-bulk-form';
  const BULK_APPLY_ID = 'system-bulk-apply';

  const STATS_BTN_ID = 'system-stats-btn';
  const STATS_MODAL_ID = 'system-stats-modal';
  const STATS_CLOSE_ID = 'system-stats-close';
  const STATS_OK_ID = 'system-stats-ok';

  const UPLOAD_BTN_ID = 'system-upload-btn';
  const UPLOAD_MODAL_ID = 'system-upload-modal';
  const UPLOAD_CLOSE_ID = 'system-upload-close';
  const UPLOAD_INPUT_ID = 'upload-input';
  const UPLOAD_DROPZONE_ID = 'upload-dropzone';
  const UPLOAD_META_ID = 'upload-meta';
  const UPLOAD_FILE_CHIP_ID = 'upload-file-chip';
  const UPLOAD_TEMPLATE_BTN_ID = 'upload-template-download';
  const UPLOAD_CONFIRM_ID = 'system-upload-confirm';

  const UPLOAD_HEADERS_KO = ['모델명','용량','제조사','부품번호','수량','비고'];
  const HEADER_KO_TO_KEY = { '모델명':'model','용량':'spec','제조사':'vendor','부품번호':'part_no','수량':'qty','비고':'note' };

  const BASE_VISIBLE_COLUMNS = ['model','spec','vendor','part_no','qty'];
  const COLUMN_ORDER = ['model','spec','vendor','part_no','qty'];
  const COLUMN_MODAL_GROUPS = [ { group:'컴포넌트', columns:['model','spec','vendor','part_no','note'] } ];
  const COLUMN_META = {
    model:{label:'모델명',group:'컴포넌트'},
    spec:{label:'용량',group:'컴포넌트'},
    vendor:{label:'제조사',group:'컴포넌트'},
    part_no:{label:'부품번호',group:'컴포넌트'},
    qty:{label:'수량',group:'컴포넌트'},
    note:{label:'비고',group:'컴포넌트'}
  };

  let state = {
    data: [],
    filtered: [],
    pageSize: 10,
    page: 1,
    visibleCols: new Set(BASE_VISIBLE_COLUMNS),
    search: '',
    selected: new Set(),
    sortKey: null,
    sortDir: 'asc',
    columnFilters: {},
    isLoading: false
  };

  const API_BASE_URL = '/api/cmp-etc-types';
  const VENDOR_MANUFACTURER_API = '/api/vendor-manufacturers';
  const JSON_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

  let vendorNameOptions = [];

  function buildVendorNameOptions(items){
    const names = new Set();
    (items || []).forEach(item => {
      const name = String(item?.manufacturer_name || '').trim();
      if(name) names.add(name);
    });
    return [...names].sort((a,b)=> a.localeCompare(b, 'ko-KR'));
  }

  function buildVendorOptionsHtml(selectedValue){
    const selected = String(selectedValue ?? '').trim();
    const list = Array.isArray(vendorNameOptions) ? vendorNameOptions : [];
    let html = '<option value="">선택</option>';
    html += list
      .map(name => `<option value="${escapeHTML(name)}" ${name===selected?'selected':''}>${escapeHTML(name)}</option>`)
      .join('');
    return html;
  }

  function syncVendorSelectInAddForm(){
    const form = document.getElementById(ADD_FORM_ID);
    const select = form?.querySelector('select[name="vendor"]');
    if(!select) return;
    const current = String(select.value || '').trim();
    select.innerHTML = buildVendorOptionsHtml(current);
    try {
      if(window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function'){
        window.BlossomSearchableSelect.syncAll(select.closest('.modal-overlay-full') || select);
      }
    } catch(_e){}
  }

  async function loadVendorManufacturers(){
    try {
      const payload = await requestJson(VENDOR_MANUFACTURER_API);
      vendorNameOptions = buildVendorNameOptions(payload.items);
      syncVendorSelectInAddForm();
    } catch(_e){
      vendorNameOptions = vendorNameOptions || [];
    }
  }

  function sanitizeQty(value){
    if(value === '' || value == null) return 0;
    if(typeof value === 'number' && Number.isFinite(value)){
      return value >= 0 ? value : 0;
    }
    const cleaned = String(value).replace(/,/g,'').trim();
    if(cleaned === '') return 0;
    const parsed = parseInt(cleaned, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  function normalizeEtcItem(item){
    if(!item) return null;
    const normalizedId = Number(item.id);
    const qty = item.usage_count ?? item.qty ?? 0;
    const modelName = item.model ?? item.model_name ?? item.name ?? '';
    const spec = item.spec ?? item.spec_summary ?? '';
    const vendorName = item.vendor ?? item.manufacturer_name ?? item.manufacturer ?? '';
    const vendorCode = item.vendor_code ?? item.manufacturer_code ?? '';
    const partNo = item.part_no ?? item.part_number ?? '';
    const note = item.note ?? item.remark ?? '';
    return {
      id: Number.isFinite(normalizedId) ? normalizedId : item.id,
      etc_code: item.etc_code ?? item.code ?? '',
      model: modelName,
      model_name: modelName,
      spec,
      spec_summary: spec,
      vendor: vendorName,
      manufacturer_name: vendorName,
      vendor_code: vendorCode,
      manufacturer_code: vendorCode,
      part_no: partNo,
      part_number: partNo,
      qty,
      etc_count: qty,
      note,
      remark: note,
      created_at: item.created_at ?? item.createdAt ?? '',
      created_by: item.created_by ?? item.createdBy ?? '',
      updated_at: item.updated_at ?? item.updatedAt ?? '',
      updated_by: item.updated_by ?? item.updatedBy ?? '',
      is_deleted: item.is_deleted ?? item.isDeleted ?? 0
    };
  }

  function normalizeEtcList(items){
    if(!Array.isArray(items)) return [];
    return items.map(normalizeEtcItem).filter(Boolean);
  }

  function upsertRow(record, options={}){
    const normalized = normalizeEtcItem(record);
    if(!normalized) return;
    const { prepend = true, silent = false } = options;
    const index = state.data.findIndex(row => row.id === normalized.id);
    if(index >= 0){
      state.data[index] = { ...state.data[index], ...normalized };
    } else if(prepend){
      state.data.unshift(normalized);
    } else {
      state.data.push(normalized);
    }
    if(!silent){
      applyFilter();
    }
  }

  function removeRowsByIds(ids, options={}){
    if(!Array.isArray(ids) || !ids.length) return;
    const { silent = false } = options;
    const idSet = new Set(ids.map(id => parseInt(id, 10)).filter(Number.isFinite));
    if(!idSet.size) return;
    state.data = state.data.filter(row => !idSet.has(row.id));
    state.selected.forEach(id => { if(idSet.has(id)) state.selected.delete(id); });
    if(!silent){
      applyFilter();
    }
  }

  async function requestJson(url, options={}){
    const { headers: customHeaders, ...rest } = options;
    const method = (rest.method || 'GET').toUpperCase();
    const fetchOptions = {
      method,
      credentials: 'same-origin',
      headers: {
        ...JSON_HEADERS,
        Accept: 'application/json, text/plain, */*',
        ...(customHeaders || {})
      },
      ...rest
    };
    if(method === 'GET'){
      delete fetchOptions.body;
    }
    let response;
    try {
      response = await fetch(url, fetchOptions);
    } catch(err){
      console.error('Network error', err);
      throw new Error('서버와 통신할 수 없습니다.');
    }
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    let text = '';
    try {
      text = await response.text();
    } catch(err){
      console.error('Failed to read response body', err);
    }
    const isJson = contentType.includes('application/json');
    if(isJson){
      let payload = {};
      if(text){
        try { payload = JSON.parse(text); }
        catch(err){
          console.error('Failed to parse JSON response', err, text);
          const snippet = (text || '').trim().slice(0, 200);
          const reason = snippet ? `원문: ${snippet}` : '응답 본문 없음';
          throw new Error(`API 응답(JSON) 파싱 실패 (status ${response.status}). ${reason}`);
        }
      }
      if(!response.ok || payload?.success === false){
        throw new Error(payload?.message || `요청 처리 중 오류가 발생했습니다. (status ${response.status})`);
      }
      return payload;
    }
    const compact = (text || '').replace(/\s+/g, ' ').trim();
    const snippet = compact.slice(0, 200) || '응답 본문 없음';
    const detail = `(${response.status}) ${snippet}`;
    const guidance = response.status === 404
      ? '기타 부품 API 경로가 서버에 등록되어 있는지 확인하세요. 최신 백엔드 코드로 서버를 재시작해야 할 수 있습니다.'
      : '서버 로그 또는 네트워크 응답 본문을 확인하세요.';
    console.error('Received non-JSON response from', url, detail);
    throw new Error(`JSON 형식이 아닌 응답을 받았습니다. ${detail}. ${guidance}`);
  }

  function buildApiPayload(data={}){
    const payload = {};
    const hasOwn = (obj, key)=> Object.prototype.hasOwnProperty.call(obj, key);
    const getValue = (keys)=>{
      for(const key of keys){
        if(hasOwn(data, key)){
          return data[key];
        }
      }
      return undefined;
    };
    const trim = value => typeof value === 'string' ? value.trim() : value;

    const modelVal = getValue(['model','model_name','name']);
    if(typeof modelVal !== 'undefined'){
      const value = trim(modelVal);
      if(value) payload.model = value;
    }

    const specVal = getValue(['spec','spec_summary','specs','specification']);
    if(typeof specVal !== 'undefined'){
      payload.spec = trim(specVal) || '';
    }

    const vendorNameVal = getValue(['vendor','manufacturer_name','manufacturer']);
    if(typeof vendorNameVal !== 'undefined'){
      const value = trim(vendorNameVal);
      if(value) payload.vendor = value;
    }

    const vendorCodeVal = getValue(['vendor_code','manufacturer_code']);
    if(typeof vendorCodeVal !== 'undefined'){
      const value = trim(vendorCodeVal);
      if(value) payload.vendor_code = value;
    }

    const partVal = getValue(['part_no','part_number']);
    if(typeof partVal !== 'undefined'){
      payload.part_no = trim(partVal) || '';
    }

    const noteVal = getValue(['note','remark','description']);
    if(typeof noteVal !== 'undefined'){
      payload.note = trim(noteVal) || '';
    }

    const qtyVal = getValue(['qty','etc_count','count']);
    if(typeof qtyVal !== 'undefined'){
      payload.qty = sanitizeQty(qtyVal);
    }

    const codeVal = getValue(['etc_code','code']);
    if(typeof codeVal !== 'undefined'){
      const value = trim(codeVal);
      if(value) payload.etc_code = value;
    }

    return payload;
  }

  async function initData(){
    state.isLoading = true;
    state.data = [];
    state.filtered = [];
    state.selected.clear();
    render();
    try {
      const payload = await requestJson(API_BASE_URL);
      state.data = normalizeEtcList(payload.items);
    } catch(err){
      console.error(err);
      showMessage(err.message || '기타 부품 목록을 불러오지 못했습니다.', '오류');
    } finally {
      state.isLoading = false;
      applyFilter();
    }
  }

  async function createEtcItem(data, options={}){
    const payload = buildApiPayload(data);
    if(!payload.model){
      throw new Error('모델명을 입력하세요.');
    }
    if(!payload.vendor && !payload.vendor_code){
      throw new Error('제조사 정보를 입력하세요.');
    }
    if(typeof payload.qty === 'undefined'){
      payload.qty = 0;
    }
    const response = await requestJson(API_BASE_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    upsertRow(response.item, options);
    return response.item;
  }

  async function updateEtcItem(recordId, data, options={}){
    const payload = buildApiPayload(data);
    if(!Object.keys(payload).length){
      return null;
    }
    const response = await requestJson(`${API_BASE_URL}/${recordId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    upsertRow(response.item, { ...options, prepend: false });
    return response.item;
  }

  async function deleteEtcItems(ids, options={}){
    if(!Array.isArray(ids) || !ids.length) return 0;
    await requestJson(`${API_BASE_URL}/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
    removeRowsByIds(ids, options);
    return ids.length;
  }

  function escapeHTML(str){ return String(str).replace(/[&<>\'\"]/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[s])); }
  function isEmptyRow(arr){ return !arr || arr.every(v=> String(v??'').trim()===''); }
  function isIntegerLike(val){ if(val==null) return false; const s=String(val).trim(); if(s==='') return false; return /^-?\d+$/.test(s); }
  function toIntOrBlank(val){ const s=String(val??'').trim(); if(s==='') return ''; return parseInt(s,10); }

  function applyFilter(){
    const trimmed = state.search.trim();
    const groups = trimmed ? trimmed.split('%').map(g=> g.split(',').map(s=>s.trim()).filter(Boolean).map(s=>s.toLowerCase())).filter(arr=>arr.length>0) : [];
    const searchCols = Object.keys(COLUMN_META);
    let base = [];
    if(!groups.length){ base = [...state.data]; }
    else {
      base = state.data.filter(row => groups.every(alts => searchCols.some(col => { const v=row[col]; if(v==null) return false; const cell=String(v).toLowerCase(); return alts.some(tok=> cell.includes(tok)); }))); }
    const filterEntries = Object.entries(state.columnFilters).filter(([k,v])=> Array.isArray(v)? v.length>0 : (v!=null && v!==''));
    if(filterEntries.length){ base = base.filter(row => filterEntries.every(([col,val])=>{ const cell = String(row[col]??''); if(Array.isArray(val)) return val.includes(cell); return cell === String(val); })); }
    state.filtered = base; state.page = 1; render();
  }

  function totalPages(){ return Math.max(1, Math.ceil(state.filtered.length / state.pageSize)); }

  function render(){
    const tbody = document.getElementById(TBODY_ID); if(!tbody) return; tbody.innerHTML='';
    const emptyEl = document.getElementById('system-empty');
    if(state.isLoading){
      if(emptyEl) emptyEl.hidden = true;
      const selectAll = document.getElementById(SELECT_ALL_ID);
      if(selectAll) selectAll.checked = false;
      updatePagination();
      applyColumnVisibility();
      updateSortIndicators();
      return;
    }
    let working = state.filtered;
    if(state.sortKey){
      const k=state.sortKey, dir=state.sortDir==='asc'?1:-1;
      working = [...state.filtered].sort((a,b)=>{ let va=a[k], vb=b[k]; const na=va!=='' && va!=null && !isNaN(va); const nb=vb!=='' && vb!=null && !isNaN(vb); if(na && nb){ va=parseFloat(va); vb=parseFloat(vb);} else { va=(va==null?'':String(va)).toLowerCase(); vb=(vb==null?'':String(vb)).toLowerCase(); } if(va===vb) return 0; if(va==='' && vb!=='') return 1; if(vb==='' && va!=='') return -1; return va>vb?dir:-dir; });
    }
    const start=(state.page-1)*state.pageSize; const slice = working.slice(start, start+state.pageSize);
    if(state.filtered.length===0){ if(emptyEl){ emptyEl.hidden=false; const titleEl=document.getElementById('system-empty-title'); const descEl=document.getElementById('system-empty-desc'); if(state.search.trim()){ if(titleEl) titleEl.textContent='검색 결과가 없습니다.'; if(descEl) descEl.textContent='검색어를 변경하거나 필터를 초기화하세요.'; } else { if(titleEl) titleEl.textContent='기타 부품 내역이 없습니다.'; if(descEl) descEl.textContent="우측 상단 '추가' 버튼을 눌러 첫 기타 부품을 등록하세요."; } } }
    else if(emptyEl){ emptyEl.hidden=true; }
    slice.forEach(row=>{
      const tr=document.createElement('tr'); const checked = row.id && state.selected.has(row.id) ? 'checked' : ''; tr.setAttribute('data-id', row.id ?? '');
      const cellsHtml = COLUMN_ORDER.map(col=>{
        if(!COLUMN_META[col]) return ''; const tdClass = state.visibleCols.has(col)?'':'col-hidden'; const label=COLUMN_META[col].label; let rawVal=row[col]; if(col==='note' && typeof rawVal==='string'){ rawVal = rawVal.replace(/\r?\n|\r/g,' ');} const displayVal=(rawVal==null || String(rawVal).trim()==='')?'-':rawVal; let html = escapeHTML(displayVal);
        if(col==='model'){
          const base = window.__ETC_DETAIL_URL || '/etc/detail';
          const params = [];
          ['id','model','spec','vendor','part_no','note'].forEach(k=>{ const v=row[k]; if(v!=null && String(v).trim()!==''){ params.push(encodeURIComponent(k)+'='+encodeURIComponent(String(v))); }});
          const href = params.length ? (base + '?' + params.join('&')) : base;
          let payload = JSON.stringify(row||{});
          payload = payload.replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
          html = `<a href="${href}" class="work-name-link" data-id="${row.id??''}" data-payload="${payload}">${html}</a>`;
        }
        return `<td data-col="${col}" data-label="${label}" class="${tdClass}">${html}</td>`; }).join('');
      tr.innerHTML = `<td><input type="checkbox" class="system-row-select" data-id="${row.id??''}" ${checked}></td>`+cellsHtml+`<td data-col="actions" data-label="관리" class="system-actions"><button type="button" class="action-btn" data-action="edit" data-id="${row.id}" title="수정" aria-label="수정"><img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon"></button></td>`;
      if(row.id && state.selected.has(row.id)) tr.classList.add('selected'); tbody.appendChild(tr);
    });
    const countEl = document.getElementById(COUNT_ID); if(countEl){ const prev = parseInt(countEl.getAttribute('data-count') || (countEl.textContent||'0').replace(/,/g,''), 10) || 0; let next = state.filtered.length; const display = String(next); countEl.textContent=display; countEl.setAttribute('data-count', String(next)); countEl.classList.remove('large-number','very-large-number'); if(next>=1000) countEl.classList.add('very-large-number'); else if(next>=100) countEl.classList.add('large-number'); if(prev!==next){ countEl.classList.remove('is-updating'); void countEl.offsetWidth; countEl.classList.add('is-updating'); } }
    updatePagination(); applyColumnVisibility();
    const selectAll = document.getElementById(SELECT_ALL_ID); if(selectAll){ const checkboxes = tbody.querySelectorAll('.system-row-select'); if(checkboxes.length){ selectAll.checked = [...checkboxes].every(cb=>cb.checked);} else { selectAll.checked=false; } }
    updateSortIndicators();
  }

  function updatePagination(){
    const infoEl = document.getElementById(PAGINATION_INFO_ID); if(infoEl){ const start = state.filtered.length? (state.page-1)*state.pageSize+1 : 0; const end = Math.min(state.filtered.length, state.page*state.pageSize); infoEl.textContent = `${start}-${end} / ${state.filtered.length}개 항목`; }
    const pages = totalPages(); const container = document.getElementById(PAGE_NUMBERS_ID); if(container){ container.innerHTML=''; for(let p=1;p<=pages && p<=50;p++){ const btn=document.createElement('button'); btn.className='page-btn'+(p===state.page?' active':''); btn.textContent=p; btn.dataset.page=p; container.appendChild(btn);} }
    togglePageButtons();
  }
  function togglePageButtons(){ const first=document.getElementById('system-first'); const prev=document.getElementById('system-prev'); const next=document.getElementById('system-next'); const last=document.getElementById('system-last'); const pages=totalPages(); if(first){ first.disabled = state.page===1; } if(prev){ prev.disabled = state.page===1; } if(next){ next.disabled = state.page===pages; } if(last){ last.disabled = state.page===pages; } }

  function buildColumnModal(){ const form = document.getElementById(COLUMN_FORM_ID); if(!form) return; form.innerHTML=''; COLUMN_MODAL_GROUPS.forEach(groupDef=>{ const section=document.createElement('div'); section.className='form-section'; section.innerHTML = `<div class="section-header"><h4>${groupDef.group}</h4></div>`; const grid=document.createElement('div'); grid.className='column-select-grid'; groupDef.columns.forEach(col=>{ if(!COLUMN_META[col]) return; const active = state.visibleCols.has(col)?' is-active':''; const label=document.createElement('label'); label.className='column-checkbox'+active; label.innerHTML=`<input type="checkbox" value="${col}" ${state.visibleCols.has(col)?'checked':''}><span class="col-check" aria-hidden="true"></span><span class="col-text">${COLUMN_META[col].label}</span>`; grid.appendChild(label); }); section.appendChild(grid); form.appendChild(section); }); syncColumnSelectAll(); }
  function syncColumnSelectAll(){ const btn=document.getElementById(COLUMN_SELECTALL_BTN_ID); const form=document.getElementById(COLUMN_FORM_ID); if(!btn||!form) return; btn.textContent='전체 선택'; }

  function openModal(id){ const el=document.getElementById(id); if(!el) return; document.body.classList.add('modal-open'); el.classList.add('show'); el.setAttribute('aria-hidden','false'); }
  function closeModal(id){ const el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show')){ document.body.classList.remove('modal-open'); } }
  function showMessage(message, title){ const modalId='system-message-modal'; const titleEl=document.getElementById('message-title'); const contentEl=document.getElementById('message-content'); if(titleEl) titleEl.textContent = title || '알림'; if(contentEl) contentEl.textContent = String(message || ''); openModal(modalId); }

  function applyColumnVisibility(){ const table=document.getElementById(TABLE_ID); if(!table) return; const validKeys=new Set(Object.keys(COLUMN_META)); const hasAnyValid=[...state.visibleCols].some(k=> validKeys.has(k)); if(!hasAnyValid){ state.visibleCols=new Set(BASE_VISIBLE_COLUMNS); saveColumnSelection(); } table.querySelectorAll('thead th[data-col], tbody td[data-col]').forEach(cell=>{ const col=cell.getAttribute('data-col'); if(col==='actions') return; if(state.visibleCols.has(col)) cell.classList.remove('col-hidden'); else cell.classList.add('col-hidden'); }); }
  function saveColumnSelection(){
    // Column selection UI removed: keep default columns visible.
    try { localStorage.removeItem('etc_visible_cols'); } catch(_e){}
  }
  function loadColumnSelection(){
    state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
    try { localStorage.removeItem('etc_visible_cols'); } catch(_e){}
  }

  function saveSortPreference(){ try{ if(state.sortKey){ localStorage.setItem('etc_sort_key', state.sortKey); localStorage.setItem('etc_sort_dir', state.sortDir==='desc'?'desc':'asc'); } else { localStorage.removeItem('etc_sort_key'); localStorage.removeItem('etc_sort_dir'); } }catch(e){} }
  function loadSortPreference(){ try{ const key=localStorage.getItem('etc_sort_key'); const dir=localStorage.getItem('etc_sort_dir'); if(key && COLUMN_META[key]){ state.sortKey=key; state.sortDir=(dir==='desc')?'desc':'asc'; } }catch(e){} }

  function collectForm(form){ const data={}; form.querySelectorAll('input,select,textarea').forEach(el=>{ data[el.name]=el.value.trim(); }); return data; }
  function generateFieldInput(col,value=''){ if(col==='model'){ return `<input name="model" type="text" class="form-input" value="${value??''}" placeholder="모델명" autocomplete="off" data-fk-ignore="1">`; } if(col==='spec'){ return `<input name="spec" type="number" min="0" step="1" class="form-input" value="${value??''}" placeholder="용량">`; } if(col==='part_no'){ return `<input name="part_no" type="text" class="form-input" value="${value??''}" placeholder="부품번호">`; } if(col==='qty'){ return `<input name="qty" type="number" min="0" step="1" class="form-input qty-dashed-lock" value="${value??''}" placeholder="0">`; } if(col==='note'){ return `<textarea name="note" class="form-input textarea-large" rows="6">${value??''}</textarea>`; } return `<input name="${col}" type="text" class="form-input" value="${value??''}">`; }

  function fillEditForm(row){ const form=document.getElementById(EDIT_FORM_ID); if(!form) return; form.innerHTML=''; const group={ title:'컴포넌트', cols:['model','spec','vendor','part_no','note'] }; const section=document.createElement('div'); section.className='form-section'; section.innerHTML=`<div class="section-header"><h4>${group.title}</h4></div>`; const grid=document.createElement('div'); grid.className='form-grid'; group.cols.forEach(c=>{ if(!COLUMN_META[c]) return; const wrap=document.createElement('div'); const wide=(c==='note'); wrap.className=wide?'form-row form-row-wide':'form-row'; const labelText=COLUMN_META[c]?.label||c; wrap.innerHTML=`<label>${labelText}</label>${generateFieldInput(c,row[c])}`; grid.appendChild(wrap); }); section.appendChild(grid); form.appendChild(section); }

  function updateSortIndicators(){ const thead=document.querySelector(`#${TABLE_ID} thead`); if(!thead) return; thead.querySelectorAll('th[data-col]').forEach(th=>{ const col=th.getAttribute('data-col'); if(col && col===state.sortKey){ th.setAttribute('aria-sort', state.sortDir==='asc'?'ascending':'descending'); } else { th.setAttribute('aria-sort','none'); } const cf=state.columnFilters[col]; const filtActive = Array.isArray(cf)? cf.length>0 : (cf != null && cf !== ''); th.classList.toggle('is-filtered', !!filtActive); }); }

  function exportCSV(onlySelected){ const headers=['No', ...COLUMN_ORDER.filter(c=>state.visibleCols.has(c)).map(c=>COLUMN_META[c].label)]; let dataForCsv=state.filtered; if(state.sortKey){ const k=state.sortKey; const dir=state.sortDir==='asc'?1:-1; dataForCsv=[...state.filtered].sort((a,b)=>{ let va=a[k], vb=b[k]; const na=va!=='' && va!=null && !isNaN(va); const nb=vb!=='' && vb!=null && !isNaN(vb); if(na && nb){ va=parseFloat(va); vb=parseFloat(vb);} else { va=(va==null?'':String(va)).toLowerCase(); vb=(vb==null?'':String(vb)).toLowerCase(); } if(va===vb) return 0; if(va==='' && vb!=='') return 1; if(vb==='' && va!=='') return -1; return va>vb?dir:-dir; }); }
    if(onlySelected===true){ const selIds=new Set(state.selected); dataForCsv = dataForCsv.filter(r=> selIds.has(r.id)); }
    const visibleCols=COLUMN_ORDER.filter(c=>state.visibleCols.has(c)); const rows=dataForCsv.map((r,i)=> [i+1, ...visibleCols.map(c=> r[c]??'')]);
    const lines=[headers, ...rows].map(arr=> arr.map(val=>`"${String(val).replace(/"/g,'""')}"`).join(','));
    const csvCore=lines.join('\r\n'); const bom='\uFEFF'; const csv=bom+csvCore; const d=new Date(); const yyyy=d.getFullYear(); const mm=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); const filename=`etc_list_${yyyy}${mm}${dd}.csv`; const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }

  let searchDebounceTimer=null;
  function bindEvents(){
    const search=document.getElementById(SEARCH_ID); const clearBtn=document.getElementById(SEARCH_CLEAR_ID); const searchWrapper=document.getElementById('system-search-wrapper'); const searchLoader=document.getElementById('system-search-loader');
    function updateClearVisibility(){ if(clearBtn){ clearBtn.classList.toggle('visible', !!search.value); } }
    if(search){
      search.addEventListener('input', e=>{ state.search=e.target.value; updateClearVisibility(); if(searchWrapper) searchWrapper.classList.add('active-searching'); if(searchLoader) searchLoader.setAttribute('aria-hidden','false'); if(searchDebounceTimer) clearTimeout(searchDebounceTimer); searchDebounceTimer=setTimeout(()=>{ applyFilter(); if(searchWrapper) searchWrapper.classList.remove('active-searching'); if(searchLoader) searchLoader.setAttribute('aria-hidden','true'); }, 220); });
      search.addEventListener('keydown', e=>{ if(e.key==='Escape'){ if(search.value){ search.value=''; state.search=''; updateClearVisibility(); applyFilter(); } search.blur(); }});
    }
    if(clearBtn){ clearBtn.addEventListener('click', ()=>{ if(search){ search.value=''; state.search=''; updateClearVisibility(); applyFilter(); search.focus(); } }); }
    const pageSizeSel=document.getElementById(PAGE_SIZE_ID); if(pageSizeSel){ pageSizeSel.addEventListener('change', e=>{ state.pageSize=parseInt(e.target.value,10)||10; try{ localStorage.setItem('etc_page_size', String(state.pageSize)); }catch(_){} state.page=1; render(); }); const psRaw=localStorage.getItem('etc_page_size'); const val=parseInt(psRaw||'10',10); if([10,20,50,100].includes(val)){ state.pageSize=val; try{ pageSizeSel.value=String(val); }catch(_){} } }
    document.getElementById(PAGE_NUMBERS_ID)?.addEventListener('click', e=>{ if(e.target.classList.contains('page-btn')){ state.page=parseInt(e.target.dataset.page,10); render(); }});
    ['system-first','system-prev','system-next','system-last'].forEach(id=>{ const el=document.getElementById(id); if(!el) return; el.addEventListener('click', ()=>{ const pages=totalPages(); if(id==='system-first') state.page=1; else if(id==='system-prev' && state.page>1) state.page--; else if(id==='system-next' && state.page<pages) state.page++; else if(id==='system-last') state.page=pages; render(); }); });
    const selectAll=document.getElementById(SELECT_ALL_ID); if(selectAll){ selectAll.addEventListener('change', e=>{ const checked=e.target.checked; document.querySelectorAll(`#${TBODY_ID} tr`).forEach(tr=>{ const cb=tr.querySelector('.system-row-select'); if(!cb) return; cb.checked=checked; const id=parseInt(tr.getAttribute('data-id'),10); if(checked){ tr.classList.add('selected'); if(!isNaN(id)) state.selected.add(id);} else { tr.classList.remove('selected'); if(!isNaN(id)) state.selected.delete(id);} }); }); }
    const tbodyEl=document.getElementById(TBODY_ID);
    tbodyEl?.addEventListener('click', e=>{ const btn=e.target.closest('.action-btn'); if(btn){ const rid=parseInt(btn.getAttribute('data-id'),10); const realIndex=state.data.findIndex(r=>r.id===rid); if(realIndex===-1) return; const row=state.data[realIndex]; const action=btn.getAttribute('data-action'); if(action==='edit'){ fillEditForm(row); openModal(EDIT_MODAL_ID); const editSaveEl=document.getElementById(EDIT_SAVE_ID); if(editSaveEl){ editSaveEl.setAttribute('data-index', realIndex); } } return; } if(e.target.closest('.system-actions')) return; const tr=e.target.closest('tr'); if(!tr) return; const cb=tr.querySelector('.system-row-select'); if(!cb) return; if(e.target.classList.contains('system-row-select')) return; cb.checked=!cb.checked; cb.dispatchEvent(new Event('change', {bubbles:true})); });
    tbodyEl?.addEventListener('click', e=>{ const link=e.target.closest('a.work-name-link'); if(!link) return; const payload=link.getAttribute('data-payload'); if(payload){ try{ sessionStorage.setItem('etc_selected_row', payload); }catch(_e){} } });
    const thead=document.querySelector(`#${TABLE_ID} thead`); if(thead){ thead.querySelectorAll('th[data-col]').forEach(th=>{ const col=th.getAttribute('data-col'); if(col && col!=='actions'){ th.classList.add('sortable'); th.setAttribute('aria-sort','none'); }}); thead.addEventListener('click', e=>{ const th=e.target.closest('th[data-col]'); if(!th) return; const col=th.getAttribute('data-col'); if(!col || col==='actions') return; if(state.sortKey===col){ state.sortDir = state.sortDir==='asc' ? 'desc' : 'asc'; } else { state.sortKey=col; state.sortDir='asc'; } state.page=1; saveSortPreference(); render(); }); }
    tbodyEl?.addEventListener('change', e=>{ const cb=e.target.closest('.system-row-select'); if(!cb) return; const tr=cb.closest('tr'); const id=parseInt(cb.getAttribute('data-id')||tr.getAttribute('data-id'),10); if(cb.checked){ tr.classList.add('selected'); if(!isNaN(id)) state.selected.add(id);} else { tr.classList.remove('selected'); if(!isNaN(id)) state.selected.delete(id);} const selectAll=document.getElementById(SELECT_ALL_ID); if(selectAll){ const all=document.querySelectorAll(`#${TBODY_ID} .system-row-select`); selectAll.checked = all.length>0 && [...all].every(x=>x.checked); } });
    document.getElementById(COLUMN_BTN_ID)?.addEventListener('click', ()=>{ buildColumnModal(); openModal(COLUMN_MODAL_ID); });
    document.getElementById(COLUMN_CLOSE_ID)?.addEventListener('click', ()=> closeModal(COLUMN_MODAL_ID));
    document.getElementById(COLUMN_APPLY_ID)?.addEventListener('click', handleColumnFormApply);
    document.getElementById(COLUMN_RESET_ID)?.addEventListener('click', resetColumnSelection);
    document.getElementById(COLUMN_SELECTALL_BTN_ID)?.addEventListener('click', ()=>{ const form=document.getElementById(COLUMN_FORM_ID); if(!form) return; const boxes=[...form.querySelectorAll('input[type=checkbox]')]; if(!boxes.length) return; boxes.forEach(box=>{ box.checked=true; const label=box.closest('label.column-checkbox'); if(label){ label.classList.add('is-active'); } }); state.visibleCols=new Set(boxes.map(b=> b.value)); saveColumnSelection(); syncColumnSelectAll(); });
    document.getElementById(COLUMN_FORM_ID)?.addEventListener('change', e=>{ const label=e.target.closest('label.column-checkbox'); if(label){ label.classList.toggle('is-active', e.target.checked); } if(e.target.matches('input[type=checkbox]') && e.target.form?.id===COLUMN_FORM_ID){ const form=document.getElementById(COLUMN_FORM_ID); const checkedCols=[...form.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.value); if(checkedCols.length){ state.visibleCols=new Set(checkedCols); saveColumnSelection(); } syncColumnSelectAll(); } });
    document.getElementById(ADD_BTN_ID)?.addEventListener('click', ()=> { syncVendorSelectInAddForm(); openModal(ADD_MODAL_ID); });
    document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(ADD_MODAL_ID));
    document.getElementById(ADD_SAVE_ID)?.addEventListener('click', async ()=>{
      const form=document.getElementById(ADD_FORM_ID);
      if(!form?.checkValidity()){ form?.reportValidity(); return; }
      const data=collectForm(form);
      const btn=document.getElementById(ADD_SAVE_ID);
      if(btn) btn.disabled=true;
      try {
        await createEtcItem(data);
        form.reset();
        closeModal(ADD_MODAL_ID);
        showMessage('기타 부품이 등록되었습니다.', '완료');
      } catch(err){
        console.error(err);
        showMessage(err.message || '기타 부품 등록 중 오류가 발생했습니다.', '오류');
      } finally {
        if(btn) btn.disabled=false;
      }
    });
    document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID));
    document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', async ()=>{
      const form=document.getElementById(EDIT_FORM_ID);
      const indexEl=document.getElementById(EDIT_SAVE_ID);
      const index=parseInt(indexEl?.getAttribute('data-index')||'-1',10);
      const target = state.data[index];
      if(!target){
        showMessage('수정 대상 행을 찾을 수 없습니다.', '오류');
        return;
      }
      const data=collectForm(form);
      const trimmedVendor = (data.vendor || '').trim();
      const existingVendor = (target.vendor || '').trim();
      const vendorChanged = trimmedVendor && existingVendor && trimmedVendor !== existingVendor;
      if(!trimmedVendor && existingVendor){
        data.vendor = existingVendor;
      }
      if(!vendorChanged && (target.manufacturer_code || target.vendor_code)){
        data.vendor_code = target.manufacturer_code || target.vendor_code;
      }
      const btn=document.getElementById(EDIT_SAVE_ID);
      if(btn) btn.disabled=true;
      try {
        await updateEtcItem(target.id, data);
        closeModal(EDIT_MODAL_ID);
        showMessage('기타 부품이 수정되었습니다.', '완료');
      } catch(err){
        console.error(err);
        showMessage(err.message || '기타 부품 수정 중 오류가 발생했습니다.', '오류');
      } finally {
        if(btn) btn.disabled=false;
      }
    });
    const dlBtn=document.getElementById('system-download-btn'); if(dlBtn){ dlBtn.addEventListener('click', ()=>{ const total=state.filtered.length||state.data.length; const selectedCount=state.selected.size; const subtitle=document.getElementById('download-subtitle'); if(subtitle){ subtitle.textContent = selectedCount>0? `선택된 ${selectedCount}개 또는 전체 ${total}개 결과 중 범위를 선택하세요.` : `현재 결과 ${total}개 항목을 CSV로 내보냅니다.`; } const rowSelected=document.getElementById('csv-range-row-selected'); const optSelected=document.getElementById('csv-range-selected'); const optAll=document.getElementById('csv-range-all'); if(rowSelected){ rowSelected.hidden = !(selectedCount>0); } if(optSelected){ optSelected.disabled = !(selectedCount>0); optSelected.checked = selectedCount>0; } if(optAll){ optAll.checked = !(selectedCount>0); } openModal('system-download-modal'); }); }
    document.getElementById('system-download-close')?.addEventListener('click', ()=> closeModal('system-download-modal'));
    document.getElementById('system-download-confirm')?.addEventListener('click', ()=>{ const selectedOpt=document.getElementById('csv-range-selected'); const onlySelected = !!(selectedOpt && selectedOpt.checked); exportCSV(onlySelected); closeModal('system-download-modal'); });
    document.getElementById(UPLOAD_BTN_ID)?.addEventListener('click', ()=>{ const meta=document.getElementById(UPLOAD_META_ID); if(meta) meta.hidden=true; const chip=document.getElementById(UPLOAD_FILE_CHIP_ID); if(chip) chip.textContent=''; const input=document.getElementById(UPLOAD_INPUT_ID); if(input) input.value=''; const confirmBtn=document.getElementById(UPLOAD_CONFIRM_ID); if(confirmBtn) confirmBtn.disabled=true; openModal(UPLOAD_MODAL_ID); });
    document.getElementById(UPLOAD_CLOSE_ID)?.addEventListener('click', ()=> closeModal(UPLOAD_MODAL_ID));
    (function(){ const dz=document.getElementById(UPLOAD_DROPZONE_ID); const input=document.getElementById(UPLOAD_INPUT_ID); const meta=document.getElementById(UPLOAD_META_ID); const chip=document.getElementById(UPLOAD_FILE_CHIP_ID); const confirmBtn=document.getElementById(UPLOAD_CONFIRM_ID); if(!dz || !input) return; function accept(file){ const name=(file?.name||'').toLowerCase(); const okExt = name.endsWith('.xls') || name.endsWith('.xlsx'); const okSize=(file?.size||0) <= 10*1024*1024; return okExt && okSize; } function setFile(f){ if(!f){ if(meta) meta.hidden=true; if(chip) chip.textContent=''; if(confirmBtn) confirmBtn.disabled=true; return; } if(!accept(f)){ showMessage('지원하지 않는 파일이거나 10MB를 초과합니다. .xls/.xlsx만 가능합니다.', '업로드 오류'); return; } const sizeKb=Math.max(1, Math.round(f.size/1024)); if(chip) chip.textContent = `${f.name} (${sizeKb} KB)`; if(meta) meta.hidden=false; if(confirmBtn) confirmBtn.disabled=false; } dz.addEventListener('click', ()=> input.click()); dz.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); input.click(); }}); dz.addEventListener('dragover', (e)=>{ e.preventDefault(); dz.classList.add('dragover'); }); dz.addEventListener('dragleave', ()=> dz.classList.remove('dragover')); dz.addEventListener('drop', (e)=>{ e.preventDefault(); dz.classList.remove('dragover'); const f=e.dataTransfer?.files?.[0]; if(f) { input.files=e.dataTransfer.files; setFile(f); } }); input.addEventListener('change', ()=>{ const f=input.files?.[0]; setFile(f); }); })();
    document.getElementById(UPLOAD_TEMPLATE_BTN_ID)?.addEventListener('click', async ()=>{ try { if(!window.XLSX){ const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.async=true; await new Promise((res, rej)=>{ s.onload=res; s.onerror=()=>rej(new Error('XLSX load failed')); document.head.appendChild(s); }); } } catch(_e){ showMessage('템플릿 생성을 위한 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.', '오류'); return; } try{ const XLSX=window.XLSX; const wsTemplate=XLSX.utils.aoa_to_sheet([UPLOAD_HEADERS_KO]); wsTemplate['!cols']=UPLOAD_HEADERS_KO.map(h=>{ const wide=['모델명','용량','비고']; const mid=['제조사','부품번호']; if(wide.includes(h)) return { wch: 22 }; if(mid.includes(h)) return { wch: 16 }; return { wch: 12 }; }); const rules=[ ['엑셀 업로드 가이드'], [''], ['작성 규칙'], ['- 첫 행의 컬럼 제목은 아래 순서와 완전히 일치해야 합니다. (순서/이름 변경 불가)'], ['- "수량"은 숫자만 입력하세요.'], ['- 그 외 항목은 자유롭게 입력하되, 필요 시 공란으로 둘 수 있습니다.'], [''], ['컬럼 순서 (복사/참고용)'], [UPLOAD_HEADERS_KO.join(', ')] ]; const wsGuide=XLSX.utils.aoa_to_sheet(rules); wsGuide['!cols']=[{ wch: 120 }]; const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template'); XLSX.utils.book_append_sheet(wb, wsGuide, '가이드'); XLSX.writeFile(wb, 'etc_upload_template.xlsx'); }catch(e){ console.error(e); showMessage('템플릿 생성 중 오류가 발생했습니다.', '오류'); } });
    document.getElementById(UPLOAD_CONFIRM_ID)?.addEventListener('click', async ()=>{ const input=document.getElementById(UPLOAD_INPUT_ID); const f=input?.files?.[0]; if(!f){ showMessage('파일을 선택하세요.', '업로드 안내'); return; } try{ if(!window.XLSX){ const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.async=true; await new Promise((res, rej)=>{ s.onload=res; s.onerror=()=>rej(new Error('XLSX load failed')); document.head.appendChild(s); }); } } catch(_e){ showMessage('엑셀 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.', '오류'); return; } const reader=new FileReader(); const confirmBtn=document.getElementById(UPLOAD_CONFIRM_ID); reader.onload=async ()=>{ try{ const data=new Uint8Array(reader.result); const wb=window.XLSX.read(data, {type:'array'}); const sheetName=wb.SheetNames[0]; if(!sheetName){ showMessage('엑셀 시트를 찾을 수 없습니다.', '업로드 오류'); return; } const ws=wb.Sheets[sheetName]; const rows=window.XLSX.utils.sheet_to_json(ws, {header:1, defval:''}); if(!rows || rows.length===0){ showMessage('엑셀 데이터가 비어있습니다.', '업로드 오류'); return; } const header=rows[0].map(h=> String(h).trim()); if(header.length !== UPLOAD_HEADERS_KO.length || !header.every((h,i)=> h===UPLOAD_HEADERS_KO[i])){ showMessage('업로드 실패: 컬럼 제목이 현재 테이블과 일치하지 않습니다.\n반드시 아래 순서로 작성하세요:\n- ' + UPLOAD_HEADERS_KO.join(', '), '업로드 실패'); return; } const errors=[]; const imported=[]; for(let r=1; r<rows.length; r++){ const row=rows[r]; if(isEmptyRow(row)) continue; const rec={}; for(let c=0; c<header.length; c++){ const label=header[c]; const key=HEADER_KO_TO_KEY[label]; rec[key]=String(row[c]??'').trim(); } if(rec.qty !== '' && !isIntegerLike(rec.qty)) errors.push(`Row ${r+1}: 수량은 숫자만 입력하세요.`); rec.qty = toIntOrBlank(rec.qty); imported.push(rec); } if(errors.length){ const preview=errors.slice(0,20).join('\n'); const more=errors.length>20 ? `\n...외 ${errors.length-20}건` : ''; showMessage(`업로드 실패: 유효성 검사 오류가 있습니다.\n\n${preview}${more}`, '업로드 실패'); return; } if(!imported.length){ showMessage('업로드할 행이 없습니다.', '업로드 안내'); return; } if(confirmBtn) confirmBtn.disabled=true; let successCount=0; const failures=[]; try {
        for(const item of imported){
          try {
            await createEtcItem(item, { silent: true, prepend: false });
            successCount++;
          } catch(err){
            console.error('Upload row failed', err);
            failures.push(err.message || '서버 오류가 발생했습니다.');
          }
        }
        applyFilter();
        closeModal(UPLOAD_MODAL_ID);
        if(failures.length){
          const summary = `${successCount}건 성공, ${failures.length}건 실패. 첫 오류: ${failures[0]}`;
          showMessage(summary, successCount ? '업로드 일부 실패' : '업로드 실패');
        } else {
          showMessage(`${successCount}개 행이 업로드되었습니다.`, '업로드 완료');
        }
      } finally {
        if(confirmBtn) confirmBtn.disabled=false;
      }
    }catch(e){ console.error(e); showMessage('엑셀 파싱 중 오류가 발생했습니다. 파일을 확인해주세요.', '업로드 오류'); } };
    reader.onerror=()=> showMessage('파일을 읽는 중 오류가 발생했습니다.', '업로드 오류'); reader.readAsArrayBuffer(f); });
    document.getElementById(STATS_BTN_ID)?.addEventListener('click', ()=>{ buildStats(); openModal(STATS_MODAL_ID); requestAnimationFrame(()=> equalizeStatsHeights()); window.addEventListener('resize', equalizeStatsHeights); });
    const closeStats=()=>{ closeModal(STATS_MODAL_ID); window.removeEventListener('resize', equalizeStatsHeights); };
    document.getElementById(STATS_CLOSE_ID)?.addEventListener('click', closeStats);
    document.getElementById(STATS_OK_ID)?.addEventListener('click', closeStats);
    document.getElementById('system-duplicate-btn')?.addEventListener('click', ()=>{ const count=state.selected.size; if(count===0){ showMessage('복제할 행을 먼저 선택하세요.', '안내'); return; } const subtitle=document.getElementById('duplicate-subtitle'); if(subtitle){ subtitle.textContent = `선택된 ${count}개의 행을 복제합니다.`; } openModal('system-duplicate-modal'); });
    document.getElementById('system-duplicate-close')?.addEventListener('click', ()=> closeModal('system-duplicate-modal'));
    document.getElementById('system-duplicate-confirm')?.addEventListener('click', async ()=>{
      const originals=state.data.filter(r=> state.selected.has(r.id));
      if(!originals.length){ showMessage('선택된 행을 찾을 수 없습니다.', '오류'); closeModal('system-duplicate-modal'); return; }
      const btn=document.getElementById('system-duplicate-confirm');
      if(btn) btn.disabled=true;
      let success=0;
      const failures=[];
      try {
        for(const source of originals){
          const payload = {
            model: source.model ? `${source.model}_COPY` : source.model,
            spec: source.spec,
            vendor: source.vendor,
            vendor_code: source.manufacturer_code || source.vendor_code || '',
            part_no: source.part_no,
            qty: source.qty,
            note: source.note
          };
          try {
            await createEtcItem(payload, { silent: true, prepend: false });
            success++;
          } catch(err){
            console.error('Duplicate failed', err);
            failures.push(err.message || '서버 오류가 발생했습니다.');
          }
        }
        applyFilter();
        closeModal('system-duplicate-modal');
        if(failures.length){
          const summary = `${success}건 성공, ${failures.length}건 실패. 첫 오류: ${failures[0]}`;
          showMessage(summary, success ? '복제 일부 실패' : '복제 실패');
        } else {
          showMessage(success + '개 행이 복제되었습니다.', '완료');
        }
      } finally {
        if(btn) btn.disabled=false;
      }
    });
    document.getElementById(DISPOSE_BTN_ID)?.addEventListener('click', ()=>{ const count=state.selected.size; if(count===0){ showMessage('불용처리할 행을 먼저 선택하세요.', '안내'); return; } const subtitle=document.getElementById('dispose-subtitle'); if(subtitle){ subtitle.textContent = `선택된 ${count}개의 기타 부품을 정말 불용처리하시겠습니까?`; } openModal(DISPOSE_MODAL_ID); });
    document.getElementById(DISPOSE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DISPOSE_MODAL_ID));
    document.getElementById(DISPOSE_CONFIRM_ID)?.addEventListener('click', ()=>{ const ids=new Set(state.selected); if(ids.size===0){ closeModal(DISPOSE_MODAL_ID); return; } closeModal(DISPOSE_MODAL_ID); });
    document.getElementById(DELETE_BTN_ID)?.addEventListener('click', ()=>{ const count=state.selected.size; if(count===0){ showMessage('삭제처리할 행을 먼저 선택하세요.', '안내'); return; } const subtitle=document.getElementById('delete-subtitle'); if(subtitle){ subtitle.textContent = `선택된 ${count}개의 기타 부품을 정말 삭제처리하시겠습니까?`; } openModal(DELETE_MODAL_ID); });
    document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', ()=> closeModal(DELETE_MODAL_ID));
    document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', async ()=>{
      const ids=[...state.selected];
      if(!ids.length){ closeModal(DELETE_MODAL_ID); return; }
      const btn=document.getElementById(DELETE_CONFIRM_ID);
      if(btn) btn.disabled=true;
      try {
        await deleteEtcItems(ids);
        state.selected.clear();
        closeModal(DELETE_MODAL_ID);
        showMessage(`${ids.length}개 항목이 삭제되었습니다.`, '완료');
      } catch(err){
        console.error(err);
        showMessage(err.message || '삭제 처리 중 오류가 발생했습니다.', '오류');
      } finally {
        if(btn) btn.disabled=false;
      }
    });
    document.getElementById(BULK_BTN_ID)?.addEventListener('click', ()=>{ const count=state.selected.size; if(count===0){ showMessage('일괄변경할 행을 먼저 선택하세요.', '안내'); return; } if(count===1){ const [onlyId]=[...state.selected]; const realIndex=state.data.findIndex(r=> r.id===onlyId); if(realIndex===-1){ showMessage('선택된 행을 찾을 수 없습니다.', '오류'); return; } const row=state.data[realIndex]; fillEditForm(row); openModal(EDIT_MODAL_ID); const editSaveEl=document.getElementById(EDIT_SAVE_ID); if(editSaveEl){ editSaveEl.setAttribute('data-index', realIndex); } return; } const subtitle=document.getElementById('bulk-subtitle'); if(subtitle){ subtitle.textContent = `선택된 ${count}개의 기타 부품에서 지정한 필드를 일괄 변경합니다.`; } buildBulkForm(); openModal(BULK_MODAL_ID); });
    document.getElementById(BULK_CLOSE_ID)?.addEventListener('click', ()=> closeModal(BULK_MODAL_ID));
    document.getElementById(BULK_APPLY_ID)?.addEventListener('click', async ()=>{ const form=document.getElementById(BULK_FORM_ID); if(!form) return; const entries=[...form.querySelectorAll('[data-bulk-field]')].map(el=>({ field:el.getAttribute('data-bulk-field'), value: el.value })).filter(p=> p.value !== ''); if(!entries.length){ showMessage('변경할 값을 1개 이상 입력하세요.', '안내'); return; } const payload={}; entries.forEach(({field,value})=>{ if(field==='qty'){ payload.qty = sanitizeQty(value); } else { payload[field]=value; } }); const ids=[...state.selected]; if(!ids.length){ closeModal(BULK_MODAL_ID); return; } const btn=document.getElementById(BULK_APPLY_ID); if(btn) btn.disabled=true; let success=0; const failures=[]; try {
        for(const id of ids){
          try {
            await updateEtcItem(id, payload, { silent: true });
            success++;
          } catch(err){
            console.error('Bulk update failed', err);
            failures.push(err.message || '서버 오류가 발생했습니다.');
          }
        }
        applyFilter();
        closeModal(BULK_MODAL_ID);
        if(failures.length){
          const summary = `${success}건 성공, ${failures.length}건 실패. 첫 오류: ${failures[0]}`;
          showMessage(summary, success ? '일괄변경 일부 실패' : '일괄변경 실패');
        } else {
          showMessage(`${success}개 항목에 일괄 변경이 적용되었습니다.`, '완료');
        }
      } finally {
        if(btn) btn.disabled=false;
      }
    });
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'){ [ADD_MODAL_ID,EDIT_MODAL_ID,COLUMN_MODAL_ID,DISPOSE_MODAL_ID,DELETE_MODAL_ID,BULK_MODAL_ID,UPLOAD_MODAL_ID,'system-download-modal','system-message-modal','system-duplicate-modal'].forEach(closeModal); closeModal(STATS_MODAL_ID); }});
    document.getElementById('system-message-close')?.addEventListener('click', ()=> closeModal('system-message-modal'));
    document.getElementById('system-message-ok')?.addEventListener('click', ()=> closeModal('system-message-modal'));
  }

  function handleColumnFormApply(){ const form=document.getElementById(COLUMN_FORM_ID); if(!form) return; const checked=[...form.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.value); const MIN_COLS=3; if(checked.length < MIN_COLS){ showMessage(`최소 ${MIN_COLS}개 이상 선택해야 합니다.`, '안내'); return; } state.visibleCols=new Set(checked); saveColumnSelection(); applyColumnVisibility(); closeModal(COLUMN_MODAL_ID); }
  function resetColumnSelection(){ state.visibleCols=new Set(BASE_VISIBLE_COLUMNS); saveColumnSelection(); buildColumnModal(); applyColumnVisibility(); }

  function buildBulkForm(){ const form=document.getElementById(BULK_FORM_ID); if(!form) return; function inputFor(col){ if(col==='qty') return `<input type="number" min="0" step="1" class="form-input qty-dashed-lock" data-bulk-field="qty" placeholder="0">`; if(col==='note') return `<textarea class="form-input textarea-large" rows="6" data-bulk-field="note" placeholder="설명"></textarea>`; return `<input type="text" class="form-input" data-bulk-field="${col}" placeholder="값 입력">`; } const GROUP={ title:'컴포넌트', cols:['model','spec','vendor','part_no','note'] }; const grid=GROUP.cols.map(col=>{ const meta=COLUMN_META[col]; if(!meta) return ''; const wide=(col==='note'); return `<div class="${wide ? 'form-row form-row-wide' : 'form-row'}"><label>${meta.label}</label>${inputFor(col)}</div>`; }).join(''); form.innerHTML = `<div class="form-section"><div class="section-header"><h4>${GROUP.title}</h4></div><div class="form-grid">${grid}</div></div>`; }

  function renderStatBlock(containerId, title, dist, fixedOptions, opts){ return window.blsStats.renderCard(containerId, title, dist, fixedOptions, opts); }
  function equalizeStatsHeights(){ return window.blsStats.equalizeHeights(STATS_MODAL_ID); }
  function countBy(rows, key, fixedOptions){ return window.blsStats.countBy(rows, key, fixedOptions); }
  function buildStats(){ const swEl=document.getElementById('stats-software'); const verEl=document.getElementById('stats-versions'); const checkEl=document.getElementById('stats-check'); if(swEl) swEl.innerHTML=''; if(verEl) verEl.innerHTML=''; if(checkEl) checkEl.innerHTML=''; const rows = state.filtered.length ? state.filtered : state.data; renderStatBlock('stats-software', '제조사', countBy(rows, 'vendor')); renderStatBlock('stats-versions', '부품번호', countBy(rows, 'part_no')); const qtyByVendor = rows.reduce((acc, r)=>{ const key=(r.vendor==null || String(r.vendor).trim()==='')?'-':String(r.vendor); if(key==='-') return acc; const q=parseInt(r.qty,10)||0; acc[key]=(acc[key]||0)+q; return acc; }, {}); renderStatBlock('stats-check', '수량 합계(제조사)', qtyByVendor); }

  function init(){ loadColumnSelection(); loadSortPreference(); bindEvents(); state.isLoading = true; render(); loadVendorManufacturers(); initData(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
