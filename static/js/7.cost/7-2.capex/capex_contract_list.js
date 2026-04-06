/**
 * CAPEX 내역 관리 페이지 스크립트
 * - 유지보수(OPEX) 페이지 스크립트에서 CAPEX용으로 분리한 버전
 * - CAPEX API: /api/capex-contracts
 */

(function(){
  // External deps (for Lottie illustrations)
  const LOTTIE_CDN = 'https://unpkg.com/lottie-web@5.12.2/build/player/lottie.min.js';
  function ensureLottie(cb){
    if(window.lottie){ cb(); return; }
    const s = document.createElement('script');
    s.src = LOTTIE_CDN; s.async = true; s.onload = ()=> cb();
    document.head.appendChild(s);
  }
  let uploadAnim = null;
  function initBookAnim(){
    const el = document.getElementById('book-anim'); if(!el) return;
    ensureLottie(()=>{
      try{ window.lottie.loadAnimation({ container: el, renderer:'svg', loop:true, autoplay:true, path:'/static/image/svg/list/free-animated-book.json', rendererSettings:{ preserveAspectRatio:'xMidYMid meet', progressiveLoad:true } }); }catch(_e){}
    });
  }
  function initUploadAnim(){
    const el = document.getElementById('upload-anim'); if(!el) return;
    ensureLottie(()=>{
      try{
        if(uploadAnim && typeof uploadAnim.destroy==='function'){ uploadAnim.destroy(); }
        el.innerHTML = '';
        uploadAnim = window.lottie.loadAnimation({ container: el, renderer:'svg', loop:true, autoplay:true, path:'/static/image/svg/list/free-animated-upload.json', rendererSettings:{ preserveAspectRatio:'xMidYMid meet', progressiveLoad:true } });
      }catch(_e){}
    });
  }
  // Flatpickr datepicker init (reuse from authority control)
  const FLATPICKR_CSS = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
  const FLATPICKR_THEME_NAME = 'airbnb';
  const FLATPICKR_THEME_HREF = `https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/${FLATPICKR_THEME_NAME}.css`;
  const FLATPICKR_JS = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.js';
  const FLATPICKR_KO = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/ko.js';
  function ensureCss(href, id){ const el=document.getElementById(id); if(el && el.tagName.toLowerCase()==='link'){ if(el.getAttribute('href')!==href) el.setAttribute('href', href); return; } const l=document.createElement('link'); l.rel='stylesheet'; l.href=href; l.id=id; document.head.appendChild(l); }
  function loadScript(src){ return new Promise((resolve,reject)=>{ const s=document.createElement('script'); s.src=src; s.async=true; s.onload=()=>resolve(); s.onerror=()=>reject(new Error('Script load failed: '+src)); document.head.appendChild(s); }); }
  async function ensureFlatpickr(){ ensureCss(FLATPICKR_CSS,'flatpickr-css'); ensureCss(FLATPICKR_THEME_HREF,'flatpickr-theme-css'); if(window.flatpickr) return; await loadScript(FLATPICKR_JS); try{ await loadScript(FLATPICKR_KO);}catch(_e){} }
  function ensureTodayButton(fp){ const cal=fp?.calendarContainer; if(!cal) return; if(cal.querySelector('.fp-today-btn')) return; const btn=document.createElement('button'); btn.type='button'; btn.className='fp-today-btn'; btn.textContent='오늘'; btn.addEventListener('click',()=>{ const now=new Date(); fp.setDate(now,true); }); cal.appendChild(btn); }
  async function initDatePickersForForm(formId){ const form=document.getElementById(formId); if(!form) return; let flatReady=false; try{ await ensureFlatpickr(); flatReady=!!window.flatpickr; }catch(_e){ flatReady=false; } const dateEl=form.querySelector('[name="contract_date"]'); const opts={ locale:(window.flatpickr&&window.flatpickr.l10ns&&window.flatpickr.l10ns.ko)?window.flatpickr.l10ns.ko:'ko', dateFormat:'Y-m-d', allowInput:true, disableMobile:true, onReady:(d,s,inst)=>ensureTodayButton(inst), onOpen:(d,s,inst)=>ensureTodayButton(inst) }; if(flatReady){ if(dateEl && !dateEl.disabled){ if(dateEl.type==='date'){ try{ dateEl.type='text'; }catch(_){} } if(!dateEl._flatpickr){ window.flatpickr(dateEl, opts); } } } else { if(dateEl && !dateEl.disabled){ try{ dateEl.type='date'; }catch(_){} } } }
  // DOM ids used on the page
  const TABLE_ID = 'system-table';
  const TBODY_ID = 'system-table-body';
  const COUNT_ID = 'system-count';
  const EMPTY_ID = 'system-empty';
  const PAGE_SIZE_ID = 'system-page-size';
  const PAGINATION_INFO_ID = 'system-pagination-info';
  const PAGE_NUMBERS_ID = 'system-page-numbers';
  const SELECT_ALL_ID = 'system-select-all';
  // New controls
  const SEARCH_ID = 'system-search';
  const SEARCH_CLEAR_ID = 'system-search-clear';
  const COLUMN_MODAL_ID = 'system-column-modal';
  const COLUMN_BTN_ID = 'system-column-btn';
  const COLUMN_CLOSE_ID = 'system-column-close';
  const COLUMN_APPLY_ID = 'system-column-apply';
  const COLUMN_RESET_ID = 'system-column-reset';
  const COLUMN_SELECTALL_ID = 'system-column-selectall-btn';
  const COLUMN_FORM_ID = 'system-column-form';
  const ADD_MODAL_ID = 'system-add-modal';
  const ADD_BTN_ID = 'system-add-btn';
  const ADD_CLOSE_ID = 'system-add-close';
  const ADD_SAVE_ID = 'system-add-save';
  const ADD_FORM_ID = 'system-add-form';
  // Edit modal controls
  const EDIT_MODAL_ID = 'system-edit-modal';
  const EDIT_CLOSE_ID = 'system-edit-close';
  const EDIT_SAVE_ID = 'system-edit-save';
  const EDIT_FORM_ID = 'system-edit-form';
  const DELETE_MODAL_ID = 'system-delete-modal';
  const DELETE_BTN_ID = 'system-delete-btn';
  const DELETE_CLOSE_ID = 'system-delete-close';
  const DELETE_CONFIRM_ID = 'system-delete-confirm';
  const DUP_MODAL_ID = 'system-duplicate-modal';
  const DUP_BTN_ID = 'system-duplicate-btn';
  const DUP_CLOSE_ID = 'system-duplicate-close';
  const DUP_CONFIRM_ID = 'system-duplicate-confirm';
  const DL_MODAL_ID = 'system-download-modal';
  const DL_BTN_ID = 'system-download-btn';
  const DL_CLOSE_ID = 'system-download-close';
  const DL_CONFIRM_ID = 'system-download-confirm';
  const BULK_MODAL_ID = 'system-bulk-modal';
  const BULK_BTN_ID = 'system-bulk-btn';
  const BULK_CLOSE_ID = 'system-bulk-close';
  // Stats controls (missing before, caused ReferenceError on any click)
  const STATS_MODAL_ID = 'system-stats-modal';
  const STATS_BTN_ID = 'system-stats-btn';
  // Upload controls
  const UPLOAD_MODAL_ID = 'system-upload-modal';
  const UPLOAD_BTN_ID = 'system-upload-btn';
  const UPLOAD_CLOSE_ID = 'system-upload-close';
  const UPLOAD_CONFIRM_ID = 'system-upload-confirm';
  const UPLOAD_DROPZONE_ID = 'upload-dropzone';
  const UPLOAD_INPUT_ID = 'upload-input';
  const UPLOAD_META_ID = 'upload-meta';
  const UPLOAD_FILE_CHIP_ID = 'upload-file-chip';
  const UPLOAD_TEMPLATE_BTN_ID = 'upload-template-download';
  // Persistence (CAPEX 전용으로 분리)
  const COLS_STORAGE_KEY = 'capex_contract_visible_columns_v1';
  // Page context flag (CAPEX type must be derived dynamically under SPA swaps)
  const CAPEX_TYPE_LABELS = { HW: '하드웨어', SW: '소프트웨어', ETC: '기타', ALL: '도입계약' };

  function getPageKey(){
    try {
      const m = String(window.location.pathname || '').match(/^\/p\/([^\/?#]+)/);
      return m && m[1] ? decodeURIComponent(m[1]) : '';
    } catch (_e) {
      return '';
    }
  }

  function resolveCapexTypeFromKey(key){
    const k = String(key || '').toLowerCase();
    if (k.startsWith('cost_capex_hardware')) return 'HW';
    if (k.startsWith('cost_capex_software')) return 'SW';
    if (k.startsWith('cost_capex_etc')) return 'ETC';
    return '';
  }

  function isCapexPage(){
    const key = getPageKey();
    if (/^cost_capex_/i.test(key)) return true;
    try { return !!document.getElementById('capex-flag'); } catch (_e) { return false; }
  }

  function getCapexType(){
    // Prefer URL-derived type because SPA swaps may not replace external flags reliably.
    const fromKey = resolveCapexTypeFromKey(getPageKey());
    if (fromKey) return fromKey;
    try {
      const el = document.getElementById('capex-flag');
      const t = (el && el.dataset ? String(el.dataset.capexType || '') : '').trim().toUpperCase();
      if (t) return t;
    } catch (_e) {}
    return 'HW';
  }

  function getCapexTypeLabel(){
    const t = getCapexType();
    return CAPEX_TYPE_LABELS[t] || 'CAPEX';
  }
  const API_BASE = '/api/capex-contracts';
  const VENDOR_API = '/api/vendor-capex';
  const EMPTY_TITLE_ID = 'system-empty-title';
  const EMPTY_DESC_ID = 'system-empty-desc';
  const MESSAGE_MODAL_ID = 'system-message-modal';
  const MESSAGE_TITLE_ID = 'message-title';
  const MESSAGE_CONTENT_ID = 'message-content';

  // Column metadata/order
  const COLUMN_META = {
    contract_status:{label:'계약상태'},
    contract_name:{label:'계약명'},
    manage_no:{label:'관리번호'},
    contract_date:{label:'계약일자'},
    maint_qty_total:{label:'구매 전체수량'},
    maint_amount:{label:'구매 금액'},
    memo:{label:'비고'}
  };
  const CAPEX_LABELS = {
    manage_no:'구매번호',
    maint_qty_total:'구매 전체수량',
    maint_amount:'구매 금액',
    contract_date:'계약일자'
  };
  function getLabel(col){
    if(isCapexPage() && CAPEX_LABELS[col]) return CAPEX_LABELS[col];
    return (COLUMN_META[col] && COLUMN_META[col].label) ? COLUMN_META[col].label : col;
  }
  const COLUMN_ORDER = Object.keys(COLUMN_META);
  const BASE_VISIBLE_COLUMNS = [
    'contract_status','contract_name','manage_no','contract_date',
    'maint_qty_total','maint_amount'
  ];
  // Reset preset aligns to base visible columns
  const RESET_VISIBLE_COLUMNS = BASE_VISIBLE_COLUMNS.slice();

  // Local state
  const state = {
    data: [],
    filtered: [],
    pageSize: 10,
    page: 1,
    visibleCols: new Set(BASE_VISIBLE_COLUMNS),
    search: '',
    uploadFile: null,
    status: 'idle',
    statusMessage: '',
    vendors: [],
    vendorMap: new Map()
  };

  async function requestJson(url, options = {}){
    const opts = { credentials: 'same-origin', ...options };
    opts.headers = opts.headers ? { ...opts.headers } : {};
    if (opts.body && !opts.headers['Content-Type']) {
      opts.headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, opts);
    let data = {};
    try {
      data = await res.json();
    } catch (_err) {
      data = {};
    }
    if (!res.ok || data.success === false) {
      const message = data.message || '요청을 처리하지 못했습니다.';
      throw new Error(message);
    }
    return data;
  }

  function setStatus(status, message){
    state.status = status;
    state.statusMessage = message || '';
  }

  function updateEmptyState(){
    const emptyEl = document.getElementById(EMPTY_ID);
    const titleEl = document.getElementById(EMPTY_TITLE_ID);
    const descEl = document.getElementById(EMPTY_DESC_ID);
    if (!emptyEl) return;
    if (state.filtered.length === 0) {
      emptyEl.hidden = false;
      let title = 'CAPEX 내역이 없습니다.';
      let desc = '우측 상단 "추가" 버튼으로 첫 내역을 등록하세요.';
      if (state.status === 'loading') {
        title = `${getCapexTypeLabel()} 데이터를 불러오는 중입니다.`;
        desc = '잠시만 기다려 주세요.';
      } else if (state.status === 'error') {
        title = '목록을 불러오지 못했습니다.';
        desc = state.statusMessage || '잠시 후 다시 시도해 주세요.';
      }
      if (titleEl) titleEl.textContent = title;
      if (descEl) descEl.textContent = desc;
    } else {
      emptyEl.hidden = true;
    }
  }

  async function loadVendors(){
    try {
      const payload = await requestJson(VENDOR_API);
      state.vendors = Array.isArray(payload.items) ? payload.items : [];
      state.vendorMap = new Map(state.vendors.map((item)=> [Number(item.id), item]));
      populateVendorSelects();
    } catch (error) {
      console.error(error);
      showMessageModal('오류', error.message || '구매 사업자 목록을 불러오지 못했습니다.');
    }
  }

  function populateVendorSelects(){
    const selects = document.querySelectorAll('[data-vendor-select]');
    if (!selects.length) return;
    const options = ['<option value="">구매 사업자를 선택하세요.</option>'];
    state.vendors.forEach((vendor)=>{
      const label = escapeHTML(vendor.maintenance_name || vendor.name || `ID ${vendor.id}`);
      options.push(`<option value="${vendor.id}">${label}</option>`);
    });
    selects.forEach((select)=>{
      const current = select.value;
      select.innerHTML = options.join('');
      if (current) select.value = current;
    });
  }

  function ensureVendorOption(record){
    if (!record || !record.vendor_id) return;
    const vendorId = Number(record.vendor_id);
    if (state.vendorMap.has(vendorId)) return;
    const placeholder = { id: vendorId, maintenance_name: record.maint_vendor || `ID ${vendorId}` };
    state.vendors.push(placeholder);
    state.vendorMap.set(vendorId, placeholder);
    populateVendorSelects();
  }

  function normalizeRecord(row){
    return {
      id: Number(row.id),
      vendor_id: row.vendor_id != null ? Number(row.vendor_id) : null,
      capex_type: (row.capex_type || getCapexType()).toUpperCase(),
      contract_status: row.contract_status || '',
      contract_name: row.contract_name || '',
      manage_no: row.contract_code || row.manage_no || '',
      contract_date: row.contract_date || '',
      maint_qty_total: parseNumericField(row.items_qty_sum != null ? row.items_qty_sum : row.total_license_count),
      maint_amount: parseNumericField(row.items_amount_sum != null ? row.items_amount_sum : row.maintenance_amount),
      inspection_target: normalizeInspectionFlag(row.inspection_target),
      memo: row.description || row.memo || '',
      description: row.description || ''
    };
  }

  function parseNumericField(value){
    if (value === null || value === undefined || value === '') return '';
    const num = Number(value);
    return Number.isNaN(num) ? '' : num;
  }

  function normalizeInspectionFlag(value){
    if (value === null || value === undefined) return 'X';
    if (typeof value === 'number') return value ? 'O' : 'X';
    const token = String(value).trim().toUpperCase();
    return token === 'O' ? 'O' : 'X';
  }

  function parseCurrencyInput(value){
    if (value === null || value === undefined) return null;
    const cleaned = String(value).replace(/[^0-9.-]/g, '');
    if (!cleaned.trim()) return null;
    const num = Number(cleaned);
    if (Number.isNaN(num)) return null;
    return Math.max(0, Math.round(num));
  }

  function formatThousandsFromDigits(digits){
    const raw = String(digits || '').replace(/\D/g, '');
    if (!raw) return '';
    const normalized = raw.replace(/^0+(?=\d)/, '');
    return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function formatCurrencyDisplay(value){
    if (value === null || value === undefined) return '';
    return formatThousandsFromDigits(String(value));
  }

  function setCaretByDigitsCount(input, digitCount){
    if(!input || typeof input.setSelectionRange !== 'function') return;
    const v = String(input.value || '');
    if(digitCount <= 0){
      try{ input.setSelectionRange(0,0); }catch(_e){}
      return;
    }
    let seen = 0;
    let pos = v.length;
    for(let i=0;i<v.length;i++){
      if(v.charCodeAt(i) >= 48 && v.charCodeAt(i) <= 57){
        seen++;
        if(seen >= digitCount){
          pos = i + 1;
          break;
        }
      }
    }
    try{ input.setSelectionRange(pos, pos); }catch(_e){}
  }

  function bindCurrencyInput(input){
    if(!input || input.dataset && input.dataset.currencyBound === '1') return;
    if(input.dataset) input.dataset.currencyBound = '1';

    input.addEventListener('input', ()=>{
      const raw = String(input.value || '');
      const caret = (typeof input.selectionStart === 'number') ? input.selectionStart : raw.length;
      const digitsBefore = raw.slice(0, caret).replace(/\D/g, '').length;
      const digits = raw.replace(/\D/g, '');
      const formatted = formatThousandsFromDigits(digits);
      input.value = formatted;
      setCaretByDigitsCount(input, digitsBefore);
    });

    input.addEventListener('blur', ()=>{
      input.value = formatCurrencyDisplay(input.value);
    });
  }

  function bindMaintAmountCurrencyInputs(root){
    const scope = root || document;
    const inputs = (scope.querySelectorAll)
      ? scope.querySelectorAll('input[name="maint_amount"]')
      : [];
    inputs.forEach((el)=> bindCurrencyInput(el));
  }

  function parseIntegerInput(value){
    if (value === null || value === undefined || value === '') return null;
    const cleaned = String(value).replace(/[^0-9-]/g, '');
    if (!cleaned.trim()) return null;
    const num = Number.parseInt(cleaned, 10);
    if (Number.isNaN(num)) return null;
    return Math.max(0, num);
  }

  function buildPayloadFromForm(form){
    if (!form) return null;
    const data = new FormData(form);
    const storedType = (form.dataset.capexType || '').trim().toUpperCase();
    const pageType = String(getCapexType() || '').trim().toUpperCase();
    const resolvedType = storedType || ((pageType === 'ALL' ? 'HW' : pageType) || 'HW');
    const payload = {
      capex_type: resolvedType,
      contract_status: (data.get('contract_status') || '').toString().trim(),
      contract_name: (data.get('contract_name') || '').toString().trim(),
      contract_code: (data.get('manage_no') || '').toString().trim(),
      contract_date: (data.get('contract_date') || '').toString().trim(),
      description: (data.get('memo') || '').toString().trim()
    };

    const missing = [];
    if (!payload.contract_status) missing.push('계약상태');
    if (!payload.contract_name) missing.push('계약명');
    if (!payload.contract_code) missing.push('구매번호');
    if (!payload.contract_date) missing.push('계약일자');
    if (missing.length) {
      showMessageModal('안내', `${missing.join(', ')} 항목을 입력하세요.`);
      return null;
    }
    return payload;
  }

  async function handleAddSubmit(button){
    const form = document.getElementById(ADD_FORM_ID);
    if (!form) return;
    const payload = buildPayloadFromForm(form);
    if (!payload) return;
    toggleButtonBusy(button, true);
    try {
      await requestJson(API_BASE, { method: 'POST', body: JSON.stringify(payload) });
      closeModal(ADD_MODAL_ID);
      form.reset();
      showMessageModal('완료', '새 CAPEX 내역을 등록했습니다.');
      await loadContracts();
    } catch (error) {
      console.error(error);
      showMessageModal('오류', error.message || '등록 중 오류가 발생했습니다.');
    } finally {
      toggleButtonBusy(button, false);
    }
  }

  async function handleEditSubmit(button){
    const form = document.getElementById(EDIT_FORM_ID);
    if (!form) return;
    const recordId = Number(button?.getAttribute('data-record-id'));
    if (!recordId) {
      showMessageModal('안내', '수정할 대상을 찾을 수 없습니다.');
      return;
    }
    const payload = buildPayloadFromForm(form);
    if (!payload) return;
    toggleButtonBusy(button, true);
    try {
      await requestJson(`${API_BASE}/${recordId}`, { method: 'PUT', body: JSON.stringify(payload) });
      closeModal(EDIT_MODAL_ID);
      showMessageModal('완료', '선택한 CAPEX 내역을 수정했습니다.');
      await loadContracts();
    } catch (error) {
      console.error(error);
      showMessageModal('오류', error.message || '수정 중 오류가 발생했습니다.');
    } finally {
      toggleButtonBusy(button, false);
    }
  }

  async function handleDeleteConfirm(button){
    const ids = getSelectedIds();
    if (!ids.length) {
      showMessageModal('안내', '삭제할 행을 먼저 선택하세요.');
      closeModal(DELETE_MODAL_ID);
      return;
    }
    toggleButtonBusy(button, true);
    try {
      await requestJson(`${API_BASE}/bulk-delete`, { method: 'POST', body: JSON.stringify({ ids }) });
      closeModal(DELETE_MODAL_ID);
      showMessageModal('완료', '선택한 내역을 삭제했습니다.');
      await loadContracts();
    } catch (error) {
      console.error(error);
      showMessageModal('오류', error.message || '삭제 중 오류가 발생했습니다.');
    } finally {
      toggleButtonBusy(button, false);
    }
  }

  function toggleButtonBusy(button, busy){
    if (!button) return;
    button.disabled = !!busy;
    button.classList.toggle('is-loading', !!busy);
  }

  function showMessageModal(title, message){
    const titleEl = document.getElementById(MESSAGE_TITLE_ID);
    const contentEl = document.getElementById(MESSAGE_CONTENT_ID);
    if (titleEl) titleEl.textContent = title || '알림';
    if (contentEl) contentEl.textContent = message || '';
    openModal(MESSAGE_MODAL_ID);
  }

  async function loadContracts(options = {}){
    const { showIndicator = false } = options;
    if (showIndicator || !state.data.length) {
      setStatus('loading', `${getCapexTypeLabel()} 데이터를 불러오는 중입니다.`);
      if (!state.data.length) {
        state.filtered = [];
        render();
      }
    }
    try {
      const capexType = String(getCapexType() || '').trim().toUpperCase();
      const url = (capexType === 'ALL')
        ? API_BASE
        : `${API_BASE}?capex_type=${encodeURIComponent(capexType)}`;
      const payload = await requestJson(url);
      const items = Array.isArray(payload.items) ? payload.items : [];
      state.data = items.map(normalizeRecord);
      setStatus(state.data.length ? 'ready' : 'empty', '');
      applyFilter();
    } catch (error) {
      console.error(error);
      setStatus('error', error.message || '목록을 불러오지 못했습니다.');
      state.data = [];
      state.filtered = [];
      render();
      showMessageModal('오류', state.statusMessage);
    }
  }

  // Helpers
  function parseDateYMD(s){ if(!s) return null; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/); if(!m) return null; const d=new Date(+m[1],+m[2]-1,+m[3]); return isNaN(d)?null:d; }
  function escapeHTML(str){ return String(str).replace(/[&<>'"]/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[s]||s)); }

  // Modal helpers
  function openModal(id){ const el=document.getElementById(id); if(!el) return; el.classList.add('show'); el.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); }
  function closeModal(id){ const el=document.getElementById(id); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show')){ document.body.classList.remove('modal-open'); } }
  // Fill edit form values into the static edit form
  function fillEditForm(row){
    const form = document.getElementById(EDIT_FORM_ID); if(!form) return;
    // Preserve original capex_type so the edit payload uses it instead of page-level type
    form.dataset.capexType = String(row.capex_type || '').trim().toUpperCase();
    const setVal = (name, value)=>{
      const el = form.querySelector(`[name="${name}"]`);
      if(!el) return;
      if(el.tagName==='SELECT'){
        el.value = String(value ?? '');
      }else if(el.tagName==='TEXTAREA'){
        el.value = String(value ?? '');
      }else{
        el.value = String(value ?? '');
      }
    };
    setVal('contract_status', row.contract_status);
    setVal('contract_name', row.contract_name);
    setVal('manage_no', row.manage_no);
    setVal('contract_date', row.contract_date);
    setVal('memo', row.memo);
  }

  // Selection helpers
  function getSelectedIds(){ const tbody=document.getElementById(TBODY_ID); if(!tbody) return []; return [...tbody.querySelectorAll('.system-row-select:checked')].map(cb=> Number(cb.getAttribute('data-id'))).filter(Boolean); }
  function updateSelectionSubtitles(){ const n=getSelectedIds().length; const text=`선택된 ${n}개의 계약`; const map={ 'delete-subtitle': `${text}을 정말 삭제처리하시겠습니까?`, 'duplicate-subtitle': `${text} 행을 복제합니다.`, 'bulk-subtitle': `${text}에서 지정한 필드를 일괄 변경합니다.`}; Object.entries(map).forEach(([id,content])=>{ const el=document.getElementById(id); if(el) el.textContent=content; }); }

  // Column modal builder
  function buildColumnModal(){
    const form=document.getElementById(COLUMN_FORM_ID); if(!form) return;
    form.innerHTML='';
    // Define groups: 계약 / 유지보수
    const CONTRACT_COLS = ['contract_status','contract_name','manage_no','contract_date'];
    let MAINT_COLS = ['maint_qty_total','maint_amount'];
    if(isCapexPage()){
      // no filtering needed
    }

    function renderGroup(title, cols){
      const section=document.createElement('div');
      section.className='form-section';
      section.innerHTML = `<div class="section-header"><h4>${title}</h4></div>`;
      const grid=document.createElement('div');
      grid.className='column-select-grid';
      cols.forEach(col=>{
        if(!(col in COLUMN_META)) return;
        const label=getLabel(col);
        const wrap=document.createElement('label');
        wrap.className='column-checkbox'+(state.visibleCols.has(col)?' is-active':'');
        wrap.innerHTML=`<input type="checkbox" value="${col}" ${state.visibleCols.has(col)?'checked':''}><span class="col-check" aria-hidden="true"></span><span class="col-text">${label}</span>`;
        grid.appendChild(wrap);
      });
      section.appendChild(grid);
      form.appendChild(section);
    }

    renderGroup('계약', CONTRACT_COLS);
    renderGroup('유지보수', MAINT_COLS);
  }

  // Lifecycle normalization + auto-expire
  function normalizeAndAutoExpire(){
    state.data = state.data.map(r=>{
      const c = {...r};
      if(String(c.contract_status||'')==='종료') c.contract_status='완료';
      return c;
    });
  }

  // Filtering (basic for now)
  function applyFilter(){
    normalizeAndAutoExpire();
    const q = String(state.search||'').trim().toLowerCase();
    if(!q){ state.filtered = [...state.data]; state.page=1; render(); return; }
    const keys = Object.keys(COLUMN_META);
    state.filtered = state.data.filter(row=> keys.some(k=>{ const v=row[k]; if(v==null) return false; return String(v).toLowerCase().includes(q); }));
    state.page = 1;
    render();
  }

  function totalPages(){ return Math.max(1, Math.ceil(state.filtered.length/state.pageSize)); }

  function applyColumnVisibility(){
    const table = document.getElementById(TABLE_ID); if(!table) return;
    table.querySelectorAll('thead th[data-col], tbody td[data-col]').forEach(cell=>{
      const col = cell.getAttribute('data-col');
      if(col==='actions') return;
      if(state.visibleCols.has(col)) cell.classList.remove('col-hidden');
      else cell.classList.add('col-hidden');
    });
  }

  function updatePagination(){
    const infoEl = document.getElementById(PAGINATION_INFO_ID);
    if(infoEl){
      const start = state.filtered.length? (state.page-1)*state.pageSize+1 : 0;
      const end = Math.min(state.filtered.length, state.page*state.pageSize);
      infoEl.textContent = `${start}-${end} / ${state.filtered.length}개 항목`;
    }
    const container = document.getElementById(PAGE_NUMBERS_ID);
    if(container){
      container.innerHTML = '';
      const pages = totalPages();
      for(let p=1;p<=pages && p<=50;p++){
        const btn=document.createElement('button');
        btn.className = 'page-btn'+(p===state.page?' active':'');
        btn.textContent = String(p);
        btn.dataset.page = String(p);
        container.appendChild(btn);
      }
    }
    const first=document.getElementById('system-first');
    const prev=document.getElementById('system-prev');
    const next=document.getElementById('system-next');
    const last=document.getElementById('system-last');
    const pages=totalPages();
    if(first) first.disabled = state.page===1;
    if(prev) prev.disabled = state.page===1;
    if(next) next.disabled = state.page===pages;
    if(last) last.disabled = state.page===pages;
  }

  function render(){
    const tbody = document.getElementById(TBODY_ID); if(!tbody) return;
    tbody.innerHTML='';
    if(state.filtered.length === 0){
      updateEmptyState();
      const countEl = document.getElementById(COUNT_ID);
      if(countEl) countEl.textContent = '0';
      updatePagination();
      applyColumnVisibility();
      const selectAllEmpty = document.getElementById(SELECT_ALL_ID);
      if(selectAllEmpty){ selectAllEmpty.checked = false; selectAllEmpty.indeterminate = false; }
      return;
    }

    updateEmptyState();

    const start = (state.page-1)*state.pageSize;
    const slice = state.filtered.slice(start, start+state.pageSize);

    slice.forEach(row=>{
      const tr=document.createElement('tr');
      tr.setAttribute('data-id', row.id);
      const cells = COLUMN_ORDER.map(col=>{
        const label=getLabel(col);
        let val=row[col];
        if(col==='memo' && typeof val==='string') val = val.replace(/\r?\n|\r/g,' ');
        const display = (val==null || String(val).trim()==='')?'-':val;
        let cell = escapeHTML(String(display));
        if(col==='maint_amount' && display!=='-' && !isNaN(Number(display))){
          cell = `${Number(display).toLocaleString('ko-KR')}원`;
        }
        if(col==='inspection_target'){
          const ox=String(display).toUpperCase();
          if(ox==='O' || ox==='X'){
            cell = `<span class="cell-ox with-badge"><span class="ox-badge ${ox==='O'?'on':'off'}">${ox}</span></span>`;
          }
        }
        if(col==='contract_status'){
          const v=String(display);
          const cls = (v==='진행') ? 'ws-run' : (v==='완료') ? 'ws-done' : 'ws-wait';
          cell = `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${escapeHTML(v)}</span></span>`;
        }
        // 관리번호 컬럼에 상세 페이지 링크 적용
        if(col==='manage_no' && display!=='-'){
          let href='/app/templates/7.maintenance/7-1.contract/7-1-1.contract_list/2.contract_detail.html';
          let detailKey = '';
          if(isCapexPage()){
            const map = { HW:'cost_capex_hardware_detail', SW:'cost_capex_software_detail', ETC:'cost_capex_etc_detail' };
            const pageType = String(getCapexType() || '').trim().toUpperCase();
            const effectiveType = (pageType === 'ALL') ? String(row.capex_type || '').trim().toUpperCase() : pageType;
            detailKey = map[effectiveType] || '';
            if(detailKey){
              const rawNo = String(display);
              href = `/p/${detailKey}?id=${encodeURIComponent(rawNo)}`;
            }
          }
          const safeText = escapeHTML(String(display));
          const safeKey = escapeHTML(String(detailKey||''));
          cell = `<a href="${href}" class="work-name-link manage-no-link" data-id="${row.id}" data-manage-no="${safeText}" data-detail-key="${safeKey}" aria-label="관리번호 ${safeText} 상세보기">${safeText}</a>`;
        }
        return `<td data-col="${col}" data-label="${label}">${cell}</td>`;
      }).join('');

      tr.innerHTML = `<td><input type="checkbox" class="system-row-select" data-id="${row.id}"></td>` + cells +
                     `<td data-col="actions" data-label="관리" class="system-actions">`+
                     `<button type="button" class="action-btn" data-action="edit" data-id="${row.id}" title="수정" aria-label="수정">`+
                     `<img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon">`+
                     `</button></td>`;
      tbody.appendChild(tr);
    });

    const countEl = document.getElementById(COUNT_ID);
    if(countEl) countEl.textContent = String(state.filtered.length);

    updatePagination();
    applyColumnVisibility();

    // sync select-all
    const selectAll = document.getElementById(SELECT_ALL_ID);
    if(selectAll){
      const cbs = tbody.querySelectorAll('.system-row-select');
      selectAll.checked = cbs.length ? [...cbs].every(cb=>cb.checked) : false;
    }

    syncRowSelectionClasses();
  }

  function syncRowSelectionClasses(){
    const tbody = document.getElementById(TBODY_ID); if(!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr=>{
      const cb = tr.querySelector('.system-row-select');
      if(cb && cb.checked) tr.classList.add('selected');
      else tr.classList.remove('selected');
    });
  }

  // Stats: simple dist blocks with fixed ordering
  function renderStatBlock(containerId, title, dist, order, opts){
    const el=document.getElementById(containerId); if(!el) return;
    const total = Object.values(dist).reduce((a,b)=>a+b,0) || 0;
    function row(label, count){
      const pct = total? Math.round((count/total)*100):0;
      const isOX = !!opts?.toggleOX && (label==='O' || label==='X');
      const badge = isOX ? `<span class="ox-badge ${label==='O'?'on':'off'}">${label}</span>` : '';
      let statusDot = '';
      if(!!opts?.status){
        if(label==='진행') statusDot = `<span class="status-dot ws-run" aria-hidden="true"></span>`;
        else if(label==='완료') statusDot = `<span class="status-dot ws-done" aria-hidden="true"></span>`;
        else statusDot = `<span class="status-dot ws-wait" aria-hidden="true"></span>`;
      }
      const labelHtml = isOX ? `<span class="label with-badge">${badge}</span>` : `<span class="label">${statusDot}<span>${label}</span></span>`;
      return `<div class="stat-item">${labelHtml}<div class="bar"><span style="width:${pct}%"></span></div><span class="value">${count}</span></div>`;
    }
    const items = (order||Object.keys(dist)).map(k=> row(k, dist[k]||0)).join('');
    el.insertAdjacentHTML('beforeend', `<div class="stat-card"><div class="stat-title">${title}</div><div class="stat-items">${items}</div></div>`);
  }
  function equalizeStatsHeights(){
    const modal=document.getElementById(STATS_MODAL_ID); if(!modal) return;
    const cards=modal.querySelectorAll('.stat-card:not(.stat-illustration-card)');
    if(!cards.length) return;
    let h=0; cards.forEach(c=>{ c.style.height='auto'; h=Math.max(h, c.getBoundingClientRect().height); });
    cards.forEach(c=> c.style.height = Math.ceil(h)+'px');
  }
  function buildStats(){
    const c1='stats-software', c2='stats-amount-by-name';
    [c1,c2].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=''; });

    const rows = state.filtered.length? state.filtered : state.data;
    const by = (key, order)=>{
      const dist={}; (order||[]).forEach(k=> dist[k]=0);
      rows.forEach(r=>{ const v=String(r[key]??'').trim(); if(!v) return; dist[v]=(dist[v]||0)+1; });
      return dist;
    };
    renderStatBlock(c1,'계약상태 분포', by('contract_status',['준비','진행','완료']), ['준비','진행','완료'], {status:true});

    // 계약금액별 계약명 (금액 내림차순)
    (function(){
      const el=document.getElementById(c2); if(!el) return;
      const list = rows.map(r=>({ name: r.contract_name||'(계약명 없음)', amount: Number(r.maint_amount)||0 }))
        .sort((a,b)=> b.amount - a.amount);
      if(!list.length){ el.innerHTML='<p style="text-align:center;color:#9ca3af;padding:16px 0;">데이터 없음</p>'; return; }
      const maxAmt = list[0].amount || 1;
      const items = list.map(r=>{
        const pct = Math.round((r.amount / maxAmt) * 100);
        const amtStr = r.amount.toLocaleString('ko-KR') + '원';
        return `<div class="stat-item"><span class="label"><span>${escapeHTML(r.name)}</span></span><div class="bar"><span style="width:${pct}%"></span></div><span class="value">${amtStr}</span></div>`;
      }).join('');
      el.insertAdjacentHTML('beforeend', `<div class="stat-card"><div class="stat-items">${items}</div></div>`);
    })();
    requestAnimationFrame(equalizeStatsHeights);
    window.addEventListener('resize', equalizeStatsHeights, {once:true});
  }

  // Stats modal open/close (delegated)
  document.addEventListener('click', (e)=>{
    const manageNoLink = e.target.closest ? e.target.closest('a.manage-no-link') : null;
    if(manageNoLink && isCapexPage()){
      const detailKey = (manageNoLink.dataset && manageNoLink.dataset.detailKey) ? String(manageNoLink.dataset.detailKey) : '';
      const manageNo = (manageNoLink.dataset && (manageNoLink.dataset.manageNo || manageNoLink.dataset.manage_no)) ? String(manageNoLink.dataset.manageNo || manageNoLink.dataset.manage_no) : '';
      const fallbackHref = manageNoLink.getAttribute('href') || (detailKey ? (`/p/${detailKey}?id=${encodeURIComponent(manageNo)}`) : manageNoLink.href);
      if(detailKey && manageNo){
        e.preventDefault();
        requestJson('/api/cost/detail-context', {
          method: 'POST',
          body: JSON.stringify({ key: detailKey, manage_no: manageNo })
        }).then(()=>{
          blsSpaNavigate(`/p/${detailKey}`);
        }).catch((err)=>{
          console.error(err);
          blsSpaNavigate(fallbackHref);
        });
        return;
      }
    }
    const openBtn = e.target.closest ? e.target.closest('#'+STATS_BTN_ID) : null;
    if(openBtn){ buildStats(); openModal('system-stats-modal'); return; }
    const statsClose = e.target.closest ? e.target.closest('#system-stats-close, #system-stats-ok') : null;
    if(statsClose){ closeModal('system-stats-modal'); }

    // Column modal
    const colOpen = e.target.closest ? e.target.closest('#'+COLUMN_BTN_ID) : null;
    if(colOpen){ buildColumnModal(); openModal(COLUMN_MODAL_ID); return; }
    const colClose = e.target.closest ? e.target.closest('#'+COLUMN_CLOSE_ID) : null;
    if(colClose){ closeModal(COLUMN_MODAL_ID); return; }
    const colApply = e.target.closest ? e.target.closest('#'+COLUMN_APPLY_ID) : null;
    if(colApply){
      const form=document.getElementById(COLUMN_FORM_ID);
      if(form){
        const checked=[...form.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.value);
        state.visibleCols = new Set(checked);
        try{ localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(checked)); }catch(_e){}
        applyColumnVisibility();
      }
      closeModal(COLUMN_MODAL_ID); return;
    }
    const colReset = e.target.closest ? e.target.closest('#'+COLUMN_RESET_ID) : null;
    if(colReset){
      state.visibleCols = new Set(RESET_VISIBLE_COLUMNS);
      try{ localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify([...state.visibleCols])); }catch(_e){}
      buildColumnModal();
      applyColumnVisibility();
      return;
    }
    const colSelectAll = e.target.closest ? e.target.closest('#'+COLUMN_SELECTALL_ID) : null;
    if(colSelectAll){
      const form=document.getElementById(COLUMN_FORM_ID);
      if(form){
        form.querySelectorAll('input[type=checkbox]').forEach(i=> i.checked=true);
        form.querySelectorAll('label.column-checkbox').forEach(l=> l.classList.add('is-active'));
      }
      return;
    }

    // Add modal
    const addOpen = e.target.closest ? e.target.closest('#'+ADD_BTN_ID) : null;
  if(addOpen){ openModal(ADD_MODAL_ID); initDatePickersForForm('system-add-form'); return; }
    const addClose = e.target.closest ? e.target.closest('#'+ADD_CLOSE_ID) : null;
    if(addClose){ closeModal(ADD_MODAL_ID); return; }
    const addSave = e.target.closest ? e.target.closest('#'+ADD_SAVE_ID) : null;
    if(addSave){ handleAddSubmit(addSave); return; }

    const delOpen = e.target.closest ? e.target.closest('#'+DELETE_BTN_ID) : null;
    if(delOpen){
      const count = getSelectedIds().length;
      if(count===0){
        const title = document.getElementById('message-title');
        const content = document.getElementById('message-content');
        if(title) title.textContent='안내';
        if(content) content.textContent='삭제처리할 행을 먼저 선택하세요.';
        openModal('system-message-modal');
        return;
      }
      const subtitle = document.getElementById('delete-subtitle');
      if(subtitle){ subtitle.textContent = `선택된 ${count}개의 계약을 정말 삭제처리하시겠습니까?`; }
      openModal(DELETE_MODAL_ID);
      return;
    }
    const delClose = e.target.closest ? e.target.closest('#'+DELETE_CLOSE_ID) : null;
    if(delClose){ closeModal(DELETE_MODAL_ID); return; }
    const delConfirm = e.target.closest ? e.target.closest('#'+DELETE_CONFIRM_ID) : null;
    if(delConfirm){ handleDeleteConfirm(delConfirm); return; }

    const dupOpen = e.target.closest ? e.target.closest('#'+DUP_BTN_ID) : null;
    if(dupOpen){
      const count = getSelectedIds().length;
      if(count===0){
        const title = document.getElementById('message-title');
        const content = document.getElementById('message-content');
        if(title) title.textContent='안내';
        if(content) content.textContent='복제할 행을 먼저 선택하세요.';
        openModal('system-message-modal');
        return;
      }
      const subtitle = document.getElementById('duplicate-subtitle');
      if(subtitle){ subtitle.textContent = `선택된 ${count}개의 계약 행을 복제합니다.`; }
      openModal(DUP_MODAL_ID);
      return;
    }
    const dupClose = e.target.closest ? e.target.closest('#'+DUP_CLOSE_ID) : null;
    if(dupClose){ closeModal(DUP_MODAL_ID); return; }
    const dupConfirm = e.target.closest ? e.target.closest('#'+DUP_CONFIRM_ID) : null;
    if(dupConfirm){
      const ids = new Set(getSelectedIds());
      const originals = state.data.filter(r=> ids.has(r.id));
      if(!originals.length){
        const title = document.getElementById('message-title');
        const content = document.getElementById('message-content');
        if(title) title.textContent='오류';
        if(content) content.textContent='선택된 행을 찾을 수 없습니다.';
        openModal('system-message-modal');
        closeModal(DUP_MODAL_ID);
        return;
      }
      const maxId = state.data.reduce((m,r)=> Math.max(m, Number(r.id)||0), 0);
      let nextId = maxId + 1;
      const clones = originals.map(o=>{
        const copy = {...o};
        copy.id = nextId++;
        const baseNo = String(o.manage_no||'');
        copy.manage_no = baseNo.endsWith('_COPY') ? baseNo : (baseNo ? baseNo + '_COPY' : baseNo);
        return copy;
      });
      state.data = [...state.data, ...clones];
      applyFilter();
      closeModal(DUP_MODAL_ID);
      const title = document.getElementById('message-title');
      const content = document.getElementById('message-content');
      if(title) title.textContent='완료';
      if(content) content.textContent = `${clones.length}개 행이 복제되었습니다.`;
      openModal('system-message-modal');
      return;
    }

    const dlOpen = e.target.closest ? e.target.closest('#'+DL_BTN_ID) : null;
    if(dlOpen){
      const total = state.filtered.length || state.data.length;
      const selectedCount = getSelectedIds().length;
      const subtitle = document.getElementById('download-subtitle');
      if(subtitle){
        subtitle.textContent = selectedCount > 0
          ? `선택된 ${selectedCount}개 또는 전체 ${total}개 결과 중 범위를 선택하세요.`
          : `현재 결과 ${total}개 항목을 CSV로 내보냅니다.`;
      }
      const rowSelected = document.getElementById('csv-range-row-selected');
      const optSelected = document.getElementById('csv-range-selected');
      const optAll = document.getElementById('csv-range-all');
      if(rowSelected){ rowSelected.hidden = !(selectedCount > 0); }
      if(optSelected){ optSelected.disabled = !(selectedCount > 0); optSelected.checked = selectedCount > 0; }
      if(optAll){ optAll.checked = !(selectedCount > 0); }
      openModal(DL_MODAL_ID);
      return;
    }
    const dlClose = e.target.closest ? e.target.closest('#'+DL_CLOSE_ID) : null;
    if(dlClose){ closeModal(DL_MODAL_ID); return; }
    const dlConfirm = e.target.closest ? e.target.closest('#'+DL_CONFIRM_ID) : null;
    if(dlConfirm){
      const selectedOpt = document.getElementById('csv-range-selected');
      const onlySelected = !!(selectedOpt && selectedOpt.checked);
      exportCSV(onlySelected);
      closeModal(DL_MODAL_ID);
      return;
    }

    const bulkOpen = e.target.closest ? e.target.closest('#'+BULK_BTN_ID) : null;
    if(bulkOpen){
      const selectedCount = getSelectedIds().length;
      if(selectedCount === 0){
        const title = document.getElementById('message-title');
        const content = document.getElementById('message-content');
        if(title) title.textContent = '안내';
        if(content) content.textContent = '일괄변경할 행을 먼저 선택하세요.';
        openModal('system-message-modal');
        return;
      }
      updateSelectionSubtitles();
      openModal(BULK_MODAL_ID);
      return;
    }
    const bulkClose = e.target.closest ? e.target.closest('#'+BULK_CLOSE_ID) : null;
    if(bulkClose){ closeModal(BULK_MODAL_ID); return; }

    // Row actions: Edit
    const editBtn = e.target.closest ? e.target.closest('button.action-btn[data-action="edit"]') : null;
    if(editBtn){
      const id = Number(editBtn.getAttribute('data-id'));
      const idx = state.data.findIndex(r=> r.id===id);
      if(idx===-1){
        const title = document.getElementById('message-title');
        const content = document.getElementById('message-content');
        if(title) title.textContent='오류';
        if(content) content.textContent='선택된 행을 찾을 수 없습니다.';
        openModal('system-message-modal');
        return;
      }
      const row = state.data[idx];
      fillEditForm(row);
      const saveBtn = document.getElementById(EDIT_SAVE_ID);
      if(saveBtn){ saveBtn.setAttribute('data-record-id', String(row.id)); }
      openModal(EDIT_MODAL_ID);
      initDatePickersForForm('system-edit-form');
      return;
    }

    // Upload modal open/close/confirm
  const upOpen = e.target.closest ? e.target.closest('#'+UPLOAD_BTN_ID) : null;
  if(upOpen){ initUploadAnim(); openModal(UPLOAD_MODAL_ID); return; }
    const upClose = e.target.closest ? e.target.closest('#'+UPLOAD_CLOSE_ID) : null;
    if(upClose){
      const metaBox=document.getElementById(UPLOAD_META_ID);
      const chip=document.getElementById(UPLOAD_FILE_CHIP_ID);
      const confirmBtn=document.getElementById(UPLOAD_CONFIRM_ID);
      if(metaBox) metaBox.hidden=true;
      if(chip) chip.textContent='';
      if(confirmBtn) confirmBtn.disabled=true;
      state.uploadFile=null;
      closeModal(UPLOAD_MODAL_ID);
      return;
    }
    const upConfirm = e.target.closest ? e.target.closest('#'+UPLOAD_CONFIRM_ID) : null;
    if(upConfirm){
      const metaBox=document.getElementById(UPLOAD_META_ID);
      const chip=document.getElementById(UPLOAD_FILE_CHIP_ID);
      const confirmBtn=document.getElementById(UPLOAD_CONFIRM_ID);
      if(metaBox) metaBox.hidden=true;
      if(chip) chip.textContent='';
      if(confirmBtn) confirmBtn.disabled=true;
      state.uploadFile=null;
      closeModal(UPLOAD_MODAL_ID);
      return;
    }

    // Message modal close
    const msgClose = e.target.closest ? e.target.closest('#system-message-close, #system-message-ok') : null;
    if(msgClose){ closeModal('system-message-modal'); return; }
  });

  // Export CSV using visible columns; scope = all filtered rows or selected rows only
  function exportCSV(onlySelected){
    const visibleCols = COLUMN_ORDER.filter(c=> state.visibleCols.has(c));
    const headers = ['No', ...visibleCols.map(c=> getLabel(c))];
    let dataForCsv = state.filtered && state.filtered.length ? state.filtered : state.data;
    if(onlySelected){ const sel = new Set(getSelectedIds()); dataForCsv = dataForCsv.filter(r=> sel.has(r.id)); }
    const rows = dataForCsv.map((r,i)=>{
      return [i+1, ...visibleCols.map(c=>{
        let val = r[c];
        if(c==='maint_amount'){
          const n = Number(val)||0; return n;
        }
        return (val==null)?'':val;
      })];
    });
    const lines = [headers, ...rows].map(arr=> arr.map(v=> `"${String(v).replace(/"/g,'""')}"`).join(','));
    const csvCore = lines.join('\r\n');
    const bom='\uFEFF';
    const csv=bom+csvCore;
    const d=new Date(); const yyyy=d.getFullYear(); const mm=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0');
    const filename = `contract_list_${yyyy}${mm}${dd}.csv`;
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  // Column modal checkbox visual feedback
  document.addEventListener('change', (e)=>{
    const inColumnModal = e.target && e.target.closest && e.target.closest('#'+COLUMN_MODAL_ID);
    if(inColumnModal && e.target.matches && e.target.matches('input[type=checkbox]')){
      const label = e.target.closest('label.column-checkbox');
      if(label){ label.classList.toggle('is-active', e.target.checked); }
    }
  });

  // Row selection + select-all
  document.addEventListener('change', (e)=>{
    const selectAllChanged = e.target && e.target.id === SELECT_ALL_ID;
    if(selectAllChanged){ const tbody=document.getElementById(TBODY_ID); if(tbody){ const on=e.target.checked; tbody.querySelectorAll('.system-row-select').forEach(cb=>{ cb.checked = on; }); } updateSelectionSubtitles(); syncRowSelectionClasses(); return; }
    const rowCb = e.target && e.target.classList && e.target.classList.contains('system-row-select');
    if(rowCb){ const tbody=document.getElementById(TBODY_ID); const selectAll=document.getElementById(SELECT_ALL_ID); if(tbody && selectAll){ const all=[...tbody.querySelectorAll('.system-row-select')]; selectAll.checked = all.length? all.every(cb=>cb.checked):false; } updateSelectionSubtitles(); syncRowSelectionClasses(); }
  });

  // Click anywhere on a row to toggle selection (except interactive targets)
  document.addEventListener('click', (e)=>{
    const tbody = document.getElementById(TBODY_ID); if(!tbody) return;
    const tr = e.target && e.target.closest ? e.target.closest('#'+TBODY_ID+' tr') : null;
    if(!tr || !tbody.contains(tr)) return;
    // Ignore clicks on interactive elements
    if(e.target.closest('input, button, a, select, label, textarea, .action-btn, .action-icon')) return;
    const cb = tr.querySelector('.system-row-select'); if(!cb) return;
    cb.checked = !cb.checked;
    const selectAll = document.getElementById(SELECT_ALL_ID);
    if(selectAll){ const all=[...tbody.querySelectorAll('.system-row-select')]; selectAll.checked = all.length? all.every(x=>x.checked):false; }
    updateSelectionSubtitles();
    syncRowSelectionClasses();
  });

  // Search input
  function bindSearch(){ const input=document.getElementById(SEARCH_ID); const clear=document.getElementById(SEARCH_CLEAR_ID); if(input){ input.addEventListener('input', ()=>{ state.search = input.value||''; applyFilter(); }); } if(clear){ clear.addEventListener('click', ()=>{ const input=document.getElementById(SEARCH_ID); if(input){ input.value=''; } state.search=''; applyFilter(); }); } }

  function initFromPage(){
    const tbody = document.getElementById(TBODY_ID);
    const table = document.getElementById(TABLE_ID);
    if(!tbody || !table) return;
    try{
      const main = document.querySelector('main.main-content') || document.body;
      if(main && main.dataset && main.dataset.contractListInit === '1') return;
      if(main && main.dataset) main.dataset.contractListInit = '1';
    }catch(_e){}

    const sel = document.getElementById(PAGE_SIZE_ID);
    if(sel){ const n=parseInt(sel.value,10); if(!isNaN(n)&&n>0) state.pageSize=n; sel.addEventListener('change', ()=>{ const v=parseInt(sel.value,10); if(!isNaN(v)&&v>0){ state.pageSize=v; state.page=1; render(); } }); }

  // Load saved visible column preferences (if any)
  try{
    const saved = JSON.parse(localStorage.getItem(COLS_STORAGE_KEY)||'null');
    if(Array.isArray(saved) && saved.length){ state.visibleCols = new Set(saved.filter(c=> COLUMN_ORDER.includes(c))); }
  }catch(_e){}
  if(isCapexPage()){
    // CAPEX 페이지에서는 활성수량/점검대상 컬럼을 숨김
    state.visibleCols.delete('maint_qty_active');
    state.visibleCols.delete('inspection_target');
    try{ localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify([...state.visibleCols])); }catch(_e){}
  }

  initBookAnim();
  initUploadAnim();
  try{ ensureFlatpickr(); }catch(_e){}
    bindSearch();
  if(isCapexPage()){
    loadContracts({ showIndicator: true });
  } else {
    applyFilter();
  }
  applyColumnVisibility();

    const pages = document.getElementById(PAGE_NUMBERS_ID);
    if(pages){ pages.addEventListener('click', (e)=>{ const btn=e.target.closest && e.target.closest('.page-btn'); if(!btn) return; const p=parseInt(btn.dataset.page,10); if(!isNaN(p)){ state.page=p; render(); } }); }

    document.getElementById('system-first')?.addEventListener('click', ()=>{ state.page=1; render(); });
    document.getElementById('system-prev')?.addEventListener('click', ()=>{ state.page=Math.max(1, state.page-1); render(); });
    document.getElementById('system-next')?.addEventListener('click', ()=>{ state.page=Math.min(totalPages(), state.page+1); render(); });
    document.getElementById('system-last')?.addEventListener('click', ()=>{ state.page=totalPages(); render(); });

    // Edit modal save/close wiring
    const editClose = document.getElementById(EDIT_CLOSE_ID);
    if(editClose){ editClose.addEventListener('click', ()=> closeModal(EDIT_MODAL_ID)); }
    const editSave = document.getElementById(EDIT_SAVE_ID);
    if(editSave){
      editSave.addEventListener('click', ()=>{ handleEditSubmit(editSave); });
    }

    // Upload interactions wiring
    const dropzone = document.getElementById(UPLOAD_DROPZONE_ID);
    const input = document.getElementById(UPLOAD_INPUT_ID);
    const metaBox = document.getElementById(UPLOAD_META_ID);
    const chip = document.getElementById(UPLOAD_FILE_CHIP_ID);
    const confirmBtn = document.getElementById(UPLOAD_CONFIRM_ID);
    const tplBtn = document.getElementById(UPLOAD_TEMPLATE_BTN_ID);

    function setFileUI(file){
      state.uploadFile = file || null;
      if(!chip || !metaBox || !confirmBtn){ return; }
      if(!file){
        chip.textContent='';
        metaBox.hidden=true;
        confirmBtn.disabled=true;
        return;
      }
      const sizeKB = Math.ceil(file.size/1024);
      chip.textContent = `${file.name} (${sizeKB} KB)`;
      metaBox.hidden = false;
      confirmBtn.disabled = false;
    }
    function validFile(file){
      if(!file) return false;
      const okExt = /\.(xls|xlsx)$/i.test(file.name);
      const underLimit = file.size <= 10*1024*1024; // 10MB
      return okExt && underLimit;
    }
    function showInvalidMsg(){
      const title = document.getElementById('message-title');
      const content = document.getElementById('message-content');
      if(title) title.textContent = '업로드 실패';
      if(content) content.textContent = '지원 형식은 XLS 또는 XLSX이며, 최대 10MB까지만 업로드할 수 있습니다.';
      openModal('system-message-modal');
    }
    if(dropzone && input){
      dropzone.addEventListener('click', ()=> input.click());
      dropzone.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); input.click(); }});
      ['dragenter','dragover'].forEach(evt=> dropzone.addEventListener(evt, (e)=>{ e.preventDefault(); e.stopPropagation(); dropzone.classList.add('drag-over'); }));
      ['dragleave','drop'].forEach(evt=> dropzone.addEventListener(evt, (e)=>{ e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('drag-over'); }));
      dropzone.addEventListener('drop', (e)=>{
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if(f){ if(validFile(f)) setFileUI(f); else { setFileUI(null); showInvalidMsg(); } }
      });
      input.addEventListener('change', ()=>{
        const f = input.files && input.files[0];
        if(f){ if(validFile(f)) setFileUI(f); else { setFileUI(null); showInvalidMsg(); } }
      });
    }
    if(tplBtn){
      tplBtn.addEventListener('click', ()=>{
        let fields;
        if(isCapexPage()){
          fields = ['contract_status','contract_name','manage_no','maint_vendor','maint_qty_total','maint_start','maint_end','maint_amount','memo'];
        }else{
          fields = ['contract_status','contract_name','manage_no','maint_vendor','maint_qty_total','maint_qty_active','maint_start','maint_end','maint_amount','inspection_target','memo'];
        }
        const headerLabels = fields.map(col=> getLabel(col));
        const bom='\uFEFF';
        const csv = bom + headerLabels.join(',') + '\n';
        const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'contract_upload_template.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    }
  }

  // Bootstrap on load (supports SPA swaps via blossom:pageLoaded)
  document.addEventListener('DOMContentLoaded', ()=>{ try{ initFromPage(); }catch(_e){} });
  document.addEventListener('blossom:pageLoaded', ()=>{ try{ initFromPage(); }catch(_e){} });
  if(document.readyState !== 'loading') { try{ initFromPage(); }catch(_e){} }
})();
