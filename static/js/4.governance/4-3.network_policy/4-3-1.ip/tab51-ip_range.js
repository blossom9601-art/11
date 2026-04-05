(function () {
  'use strict';

  const EDIT_ICON_SRC = '/static/image/svg/list/free-icon-pencil.svg';
  const SAVE_ICON_SRC = '/static/image/svg/save.svg';

  const STATUS_OPTIONS = ['활성', '예약', '미사용', 'DHCP', 'SLAAC'];
  const ROLE_OPTIONS = ['Loopback', 'Primary', 'Secondary', 'Anycast', 'VIP', 'VRRP', 'HSRP', 'GLBP', 'CARP'];

  const API_ADDR = (policyId) => `/api/network/ip-policies/${policyId}/addresses`;
  const API_DNS_DOMAIN_SUGGEST = '/api/network/dns-policies/suggest-domains';
  const API_HW_SYSTEM_SUGGEST = '/api/hardware-assets/suggest-work-systems';

  const DEFAULT_PAGE_SIZE = 50;

  let dnsDomainCache = [];
  let systemNameCache = [];

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function getPolicyId() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('id');
    const num = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(num) ? num : null;
  }

  async function fetchJson(url, options) {
    const resp = await fetch(url, options);
    let data = null;
    try {
      data = await resp.json();
    } catch (_e) {
      data = null;
    }
    const success = data == null || data.success !== false;
    if (!resp.ok || !success) {
      const message = data && data.message ? data.message : `요청 실패: ${resp.status}`;
      throw new Error(message);
    }
    return data || {};
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text == null || String(text).trim() === '' ? '-' : String(text);
  }

  function setActionButtonMode(btn, mode) {
    if (!btn) return;
    const img = btn.querySelector('img');
    if (mode === 'save') {
      btn.dataset.action = 'save';
      btn.title = '저장';
      btn.setAttribute('aria-label', '저장');
      if (img) {
        img.src = SAVE_ICON_SRC;
        img.alt = '저장';
      }
      return;
    }

    btn.dataset.action = 'edit';
    btn.title = '수정';
    btn.setAttribute('aria-label', '수정');
    if (img) {
      img.src = EDIT_ICON_SRC;
      img.alt = '수정';
    }
  }

  function setRowEditable(tr, editable) {
    if (!tr) return;
    tr.dataset.editing = editable ? '1' : '0';
    qsa('[data-field]', tr).forEach((el) => {
      if (el.dataset.locked === '1') return;
      el.disabled = !editable;
    });
  }

  function displayText(value) {
    const t = value == null ? '' : String(value).trim();
    return t === '' ? '-' : t;
  }

  function createDisplaySpan(field, value) {
    const span = document.createElement('span');
    span.className = 'ip-range-display';
    span.dataset.displayFor = field;
    span.textContent = displayText(value);
    return span;
  }

  // ---------------------------
  // Message modal (on-premise parity)
  // ---------------------------

  function ensureMessageModal(){
    let modal = document.getElementById('blossom-message-modal');
    if(modal && document.body.contains(modal)) return modal;

    modal = document.createElement('div');
    modal.id = 'blossom-message-modal';
    modal.className = 'server-add-modal modal-overlay-full blossom-message-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="server-add-content" role="document">
        <div class="server-add-header">
          <div class="server-add-title dispose-title">
            <h3 id="blossom-message-modal-title">알림</h3>
            <p class="server-add-subtitle" id="blossom-message-modal-subtitle"></p>
          </div>
          <button class="close-btn" type="button" data-message-modal="close" aria-label="닫기">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div class="server-add-body">
          <div class="dispose-content">
            <div class="dispose-text">
              <p id="blossom-message-modal-body"></p>
            </div>
            <div class="dispose-illust" aria-hidden="true">
              <img id="blossom-message-modal-illust" src="/static/image/svg/free-sticker-message.svg" alt="안내" loading="lazy" />
            </div>
          </div>
        </div>
        <div class="server-add-actions align-right">
          <div class="action-buttons right">
            <button type="button" class="btn-primary" data-message-modal="ok">확인</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);

    const close = () => closeMessageModal();
    modal.addEventListener('click', (e) => { if(e.target === modal) close(); });
    const btnClose = modal.querySelector('[data-message-modal="close"]');
    const btnOk = modal.querySelector('[data-message-modal="ok"]');
    if(btnClose) btnClose.addEventListener('click', close);
    if(btnOk) btnOk.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if(e.key === 'Escape' && modal.classList.contains('show')) close();
    });

    return modal;
  }

  function closeMessageModal(){
    const modal = document.getElementById('blossom-message-modal');
    if(!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function openMessageModal(message, title, options){
    const modal = ensureMessageModal();
    if(!modal) return;
    try{ window.BlossomSearchableSelect?.closeAll?.(); }catch(_e){}

    const titleEl = modal.querySelector('#blossom-message-modal-title');
    const subtitleEl = modal.querySelector('#blossom-message-modal-subtitle');
    const bodyEl = modal.querySelector('#blossom-message-modal-body');
    const illustEl = modal.querySelector('#blossom-message-modal-illust');

    const t = (title != null && String(title).trim()) ? String(title).trim() : '알림';
    const m = (message != null) ? String(message) : '';

    const opts = options && typeof options === 'object' ? options : {};
    const kind = (opts.kind ? String(opts.kind).toLowerCase() : 'info');
    const subtitleText = (opts.subtitle != null) ? String(opts.subtitle) : '';
    const illustSrc = opts.illustrationSrc
      ? String(opts.illustrationSrc)
      : (kind === 'success')
        ? '/static/image/svg/free-sticker-approved.svg'
        : (kind === 'error')
          ? '/static/image/svg/error/free-sticker-report.svg'
          : '/static/image/svg/free-sticker-message.svg';

    if(titleEl) titleEl.textContent = t;
    if(subtitleEl) subtitleEl.textContent = subtitleText;
    if(bodyEl) bodyEl.textContent = m;
    if(illustEl){
      illustEl.src = illustSrc;
      illustEl.alt = kind === 'success' ? '완료' : (kind === 'error' ? '오류' : '안내');
    }

    modal.classList.add('show');
    modal.removeAttribute('aria-hidden');
    document.body.classList.add('modal-open');

    const okBtn = modal.querySelector('[data-message-modal="ok"]');
    requestAnimationFrame(() => { try{ okBtn && okBtn.focus(); }catch(_e){} });
  }

  function notifyMessage(message, title, options){
    const m = (message != null) ? String(message) : '';
    const t = (title != null && String(title).trim()) ? String(title).trim() : '알림';
    const opts = options && typeof options === 'object' ? options : {};
    try{ openMessageModal(m, t, opts); }
    catch(_e){ try{ alert(m); }catch(_e2){} }
  }

  function syncRowDisplay(tr) {
    if (!tr) return;
    qsa('.ip-range-display[data-display-for]', tr).forEach((span) => {
      const field = span.dataset.displayFor;
      const input = tr.querySelector(`[data-field="${field}"]`);
      if (!input) { span.textContent = '-'; return; }
      var raw = String(input.value || '').trim();
      // For system_name, display work_name from cache when available.
      if (field === 'system_name' && raw && systemNameCache.length && typeof systemNameCache[0] === 'object') {
        var found = systemNameCache.find(function (p) { return String(p.system_name || '').trim() === raw; });
        if (found && found.work_name) { span.textContent = found.work_name; return; }
      }
      span.textContent = displayText(raw);
    });
  }

  function lockOtherRows(tbody, exceptTr) {
    if (!tbody) return;
    qsa('tr[data-ip][data-editing="1"]', tbody).forEach((tr) => {
      if (exceptTr && tr === exceptTr) return;
      setRowEditable(tr, false);
      const b = tr.querySelector('.action-btn[data-action]');
      if (b) setActionButtonMode(b, 'edit');
    });
  }

  function renderActionsCell() {
    const td = document.createElement('td');
    td.className = 'system-actions';
    td.dataset.col = 'actions';
    td.dataset.label = '관리';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'action-btn';
    btn.dataset.action = 'edit';
    btn.title = '수정';
    btn.setAttribute('aria-label', '수정');

    const img = document.createElement('img');
    img.src = EDIT_ICON_SRC;
    img.alt = '수정';
    img.className = 'action-icon';

    btn.appendChild(img);
    td.appendChild(btn);
    return td;
  }

  function renderRow(item) {
    const tr = document.createElement('tr');
    tr.dataset.ip = item.ip_address;
    tr.dataset.editing = '0';

    const tdAddr = document.createElement('td');
    tdAddr.textContent = item.ip_address || '-';

    const tdStatus = document.createElement('td');
    tdStatus.appendChild(createDisplaySpan('status', item.status));
    const statusSel = document.createElement('select');
    statusSel.className = 'form-input';
    statusSel.dataset.field = 'status';
    statusSel.dataset.locked = '1';
    statusSel.disabled = true;
    statusSel.appendChild(new Option('-', '', !item.status, !item.status));
    STATUS_OPTIONS.forEach((opt) => {
      statusSel.appendChild(new Option(opt, opt, item.status === opt, item.status === opt));
    });
    tdStatus.appendChild(statusSel);

    const tdRole = document.createElement('td');
    tdRole.appendChild(createDisplaySpan('role', item.role));
    const roleSel = document.createElement('select');
    roleSel.className = 'form-input';
    roleSel.dataset.field = 'role';
    roleSel.disabled = true;
    roleSel.appendChild(new Option('-', '', !item.role, !item.role));
    ROLE_OPTIONS.forEach((opt) => {
      roleSel.appendChild(new Option(opt, opt, item.role === opt, item.role === opt));
    });
    tdRole.appendChild(roleSel);

    const tdDns = document.createElement('td');
    tdDns.appendChild(createDisplaySpan('dns_domain', item.dns_domain));

    const dnsSel = document.createElement('select');
    dnsSel.className = 'form-input search-select';
    dnsSel.dataset.field = 'dns_domain';
    dnsSel.dataset.searchableScope = 'page';
    dnsSel.dataset.placeholder = '-';
    dnsSel.disabled = true;
    tdDns.appendChild(dnsSel);

    const tdSystem = document.createElement('td');
    tdSystem.appendChild(createDisplaySpan('system_name', item.system_name));

    const sysSel = document.createElement('select');
    sysSel.className = 'form-input search-select';
    sysSel.dataset.field = 'system_name';
    sysSel.dataset.locked = '1';
    sysSel.dataset.searchableScope = 'page';
    sysSel.dataset.placeholder = '-';
    sysSel.disabled = true;
    tdSystem.appendChild(sysSel);

    const tdPort = document.createElement('td');
    tdPort.appendChild(createDisplaySpan('port', item.port));
    const portInput = document.createElement('input');
    portInput.type = 'text';
    portInput.className = 'form-input';
    portInput.placeholder = '-';
    portInput.value = item.port || '';
    portInput.dataset.field = 'port';
    portInput.dataset.locked = '1';
    portInput.disabled = true;
    tdPort.appendChild(portInput);

    const tdNote = document.createElement('td');
    tdNote.appendChild(createDisplaySpan('note', item.note));
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'form-input';
    noteInput.placeholder = '-';
    noteInput.value = item.note || '';
    noteInput.dataset.field = 'note';
    noteInput.disabled = true;
    tdNote.appendChild(noteInput);

    tr.appendChild(tdAddr);
    tr.appendChild(tdStatus);
    tr.appendChild(tdRole);
    tr.appendChild(tdDns);
    tr.appendChild(tdSystem);
    tr.appendChild(tdPort);
    tr.appendChild(tdNote);
    tr.appendChild(renderActionsCell());

    // Populate dropdown options (cached) and set current values.
    setSelectOptions(dnsSel, dnsDomainCache, item.dns_domain || '');
    setSelectOptions(sysSel, systemNameCache, item.system_name || '');

    return tr;
  }

  function setSelectOptions(select, items, currentValue) {
    if (!select) return;
    // system_name uses work-system pairs (objects)
    if (select.dataset.field === 'system_name' && items.length && typeof items[0] === 'object') {
      setSystemSelectOptions(select, items, currentValue);
      return;
    }
    const current = (currentValue == null ? (select.value || '') : currentValue) || '';

    const uniq = [];
    const seen = new Set();
    const add = (raw) => {
      const v = raw == null ? '' : String(raw).trim();
      if (!v) return;
      const key = v.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      uniq.push(v);
    };

    add(current);
    (items || []).forEach(add);

    select.innerHTML = '';
    select.appendChild(new Option('-', '', !current, !current));
    uniq.forEach((v) => {
      select.appendChild(new Option(v, v, v === current, v === current));
    });

    // Keep selection stable if value exists in list.
    if (current) select.value = current;
  }

  function setSystemSelectOptions(select, pairs, currentValue) {
    if (!select) return;
    var current = (currentValue == null ? (select.value || '') : currentValue) || '';
    current = String(current).trim();
    select.innerHTML = '';
    select.appendChild(new Option('-', '', !current, !current));
    var seen = new Set();
    var addPair = function (p) {
      var sn = String(p.system_name || '').trim();
      var wn = String(p.work_name || '').trim();
      if (!sn) return;
      var key = sn.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      var label = (wn && wn !== sn) ? wn + ' (' + sn + ')' : sn;
      var opt = new Option(label, sn, sn === current, sn === current);
      if (wn && wn !== sn) {
        opt.setAttribute('data-display-label', wn);
        opt.setAttribute('data-search-text', wn + ' ' + sn);
      }
      select.appendChild(opt);
    };
    // Ensure current value appears first.
    if (current) {
      var match = (pairs || []).find(function (p) { return String(p.system_name || '').trim() === current; });
      if (match) {
        addPair(match);
      } else {
        seen.add(current.toLowerCase());
        select.appendChild(new Option(current, current, true, true));
      }
    }
    (pairs || []).forEach(addPair);
    if (current) select.value = current;
  }

  function syncSearchableSelects(root) {
    try {
      window.BlossomSearchableSelect?.syncAll?.(root || document);
      return true;
    } catch (_e) {
      // ignore
    }
    return false;
  }

  function syncSearchableSelectsSoon(root) {
    // If the helper script loads slightly after DOMContentLoaded,
    // this retry ensures the visible searchable control is created/enabled.
    const ok = syncSearchableSelects(root);
    if (ok) return;
    setTimeout(() => syncSearchableSelects(root), 0);
    setTimeout(() => syncSearchableSelects(root), 120);
    setTimeout(() => syncSearchableSelects(root), 300);
  }

  function syncFieldSelects(field, items) {
    const tbody = qs('#ip-range-table-body');
    if (!tbody) return;
    qsa(`select.search-select[data-field="${field}"]`, tbody).forEach((sel) => {
      setSelectOptions(sel, items, sel.value || '');
      syncSearchableSelects(sel);
    });
    // Update read-only display spans for system_name with work_name.
    if (field === 'system_name' && items.length && typeof items[0] === 'object') {
      qsa('span.ip-range-display[data-display-for="system_name"]', tbody).forEach(function (span) {
        var raw = span.textContent.trim();
        if (!raw || raw === '-') return;
        var p = items.find(function (it) { return String(it.system_name || '').trim() === raw; });
        if (p && p.work_name) span.textContent = p.work_name;
      });
    }
  }

  async function refreshDnsDomains(queryText) {
    const url = `${API_DNS_DOMAIN_SUGGEST}?q=${encodeURIComponent(queryText || '')}&limit=200`;
    const data = await fetchJson(url);
    dnsDomainCache = (data.items || []).slice();
    syncFieldSelects('dns_domain', dnsDomainCache);
  }

  async function refreshSystemNames(queryText) {
    const url = `${API_HW_SYSTEM_SUGGEST}?q=${encodeURIComponent(queryText || '')}&limit=200`;
    const data = await fetchJson(url);
    systemNameCache = (data.items || []).slice();
    syncFieldSelects('system_name', systemNameCache);
  }


  function clampPageSize(value) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
    return Math.min(Math.max(n, 10), 200);
  }

  function setElText(sel, text) {
    const el = qs(sel);
    if (!el) return;
    el.textContent = text;
  }

  function renderPageButtons(currentPage, lastPage, onPick) {
    const wrap = qs('#ip-range-page-numbers');
    if (!wrap) return;
    wrap.innerHTML = '';

    const totalPages = Math.max(1, lastPage || 1);
    const max = 7;
    let start = Math.max(1, currentPage - Math.floor(max / 2));
    let end = start + max - 1;
    if (end > totalPages) {
      end = totalPages;
      start = Math.max(1, end - max + 1);
    }

    for (let p = start; p <= end; p++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `page-btn${p === currentPage ? ' active' : ''}`;
      b.textContent = String(p);
      b.addEventListener('click', () => onPick(p));
      wrap.appendChild(b);
    }
  }

  async function autoFillFromInterfaces(items, tbody) {
    if (!tbody) tbody = qs('#ip-range-table-body');
    if (!tbody) return;
    var ips = [];
    (items || []).forEach(function (item) {
      var ip = String(item.ip_address || '').trim();
      if (!ip) return;
      var hasSys = String(item.system_name || '').trim();
      var hasPort = String(item.port || '').trim();
      if (!hasSys && !hasPort) ips.push(ip);
    });
    if (!ips.length) return;

    var res = await fetchJson('/api/hw-interfaces/lookup-by-ips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ips: ips }),
    });
    var mapping = (res && res.mapping) || {};
    if (!Object.keys(mapping).length) return;

    qsa('tr[data-ip]', tbody).forEach(function (tr) {
      var ip = tr.dataset.ip || '';
      var info = mapping[ip];
      if (!info) return;
      var sysInput = tr.querySelector('[data-field="system_name"]');
      var portInput = tr.querySelector('[data-field="port"]');
      var sysDisplay = tr.querySelector('.ip-range-display[data-display-for="system_name"]');
      var portDisplay = tr.querySelector('.ip-range-display[data-display-for="port"]');

      var curSys = sysInput ? String(sysInput.value || '').trim() : '';
      var curPort = portInput ? String(portInput.value || '').trim() : '';

      if (!curSys && info.system_name) {
        if (sysInput) sysInput.value = info.system_name;
        if (sysDisplay) {
          var displayName = (info.work_name && info.work_name !== info.system_name) ? info.work_name : info.system_name;
          sysDisplay.textContent = displayName;
        }
        try { window.BlossomSearchableSelect && window.BlossomSearchableSelect.sync && window.BlossomSearchableSelect.sync(sysInput); } catch (_e) {}
      }
      if (!curPort && info.port) {
        if (portInput) portInput.value = info.port;
        if (portDisplay) portDisplay.textContent = info.port;
      }
      // 시스템/포트가 채워졌으면 상태를 활성으로 자동 설정
      if (info.system_name || info.port) {
        var statusSel = tr.querySelector('[data-field="status"]');
        var statusDisplay = tr.querySelector('.ip-range-display[data-display-for="status"]');
        var curStatus = statusSel ? String(statusSel.value || '').trim() : '';
        if (!curStatus || curStatus === '-') {
          if (statusSel) statusSel.value = '활성';
          if (statusDisplay) statusDisplay.textContent = '활성';
        }
      }
    });
  }

  async function loadTable(policyId, page, pageSize) {
    const tbody = qs('#ip-range-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const data = await fetchJson(`${API_ADDR(policyId)}?page=${page}&page_size=${pageSize}`);

    const total = data.total || 0;
    const currentPage = data.page || 1;
    const currentSize = data.page_size || pageSize;
    const lastPage = Math.max(1, Math.ceil(total / currentSize));

    const items = data.items || [];
    items.forEach((item) => {
      tbody.appendChild(renderRow(item));
    });

    // Enhance dropdowns (DNS/시스템) inside this table.
    syncSearchableSelectsSoon(tbody);

    // Auto-fill system_name & port from interface data.
    autoFillFromInterfaces(items, tbody).catch(() => {});

    const startIdx = total === 0 ? 0 : (currentPage - 1) * currentSize + 1;
    const endIdx = total === 0 ? 0 : Math.min(startIdx + items.length - 1, total);
    setElText('#ip-range-pagination-info', `${startIdx}-${endIdx} / ${total}개 항목`);

    const firstBtn = qs('#ip-range-first');
    const prevBtn = qs('#ip-range-prev');
    const nextBtn = qs('#ip-range-next');
    const lastBtn = qs('#ip-range-last');
    if (firstBtn) firstBtn.disabled = currentPage <= 1;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= lastPage;
    if (lastBtn) lastBtn.disabled = currentPage >= lastPage;

    return { total, page: currentPage, pageSize: currentSize, lastPage };
  }

  function readRowItem(tr) {
    const ip = tr.dataset.ip;
    const pick = (field) => {
      const el = tr.querySelector(`[data-field="${field}"]`);
      if (!el) return '';
      return String(el.value || '').trim();
    };
    return {
      ip_address: ip,
      status: pick('status'),
      role: pick('role'),
      dns_domain: pick('dns_domain'),
      system_name: pick('system_name'),
      port: pick('port'),
      note: pick('note'),
    };
  }

  async function saveRow(policyId, tr) {
    const item = readRowItem(tr);
    await fetchJson(API_ADDR(policyId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [item] }),
    });
  }

  async function saveTable(policyId) {
    const tbody = qs('#ip-range-table-body');
    if (!tbody) return;

    const rows = qsa('tr[data-ip]', tbody);
    const items = rows.map((tr) => readRowItem(tr));

    await fetchJson(API_ADDR(policyId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });

    notifyMessage('저장되었습니다.', '완료', {kind: 'success'});
  }

  function wireTypeahead() {
    const tbody = qs('#ip-range-table-body');
    if (!tbody) return;

    let dnsTimer = null;
    let sysTimer = null;

    const schedule = (field, value) => {
      if (field === 'dns_domain') {
        clearTimeout(dnsTimer);
        dnsTimer = setTimeout(() => {
          refreshDnsDomains(String(value || '')).catch(() => {});
        }, 180);
      }
      if (field === 'system_name') {
        clearTimeout(sysTimer);
        sysTimer = setTimeout(() => {
          refreshSystemNames(String(value || '')).catch(() => {});
        }, 180);
      }
    };

    // input: while typing
    tbody.addEventListener('input', (e) => {
      const t = e.target;
      if (!t || !t.dataset || !t.dataset.field) return;
      schedule(t.dataset.field, t.value);
    });

    // focus: also refresh on focus (makes "검색" feel immediate)
    tbody.addEventListener('focusin', (e) => {
      const t = e.target;
      if (!t) return;

      // Native inputs/selects with data-field
      if (t.dataset && t.dataset.field) {
        schedule(t.dataset.field, t.value);
        return;
      }

      // Searchable select display button (enhanced select)
      const displayBtn = t.closest && t.closest('.fk-searchable-display');
      if (!displayBtn) return;
      const control = displayBtn.closest('.fk-searchable-control');
      const sel = control ? control.querySelector('select.search-select[data-field]') : null;
      if (!sel || !sel.dataset || !sel.dataset.field) return;
      schedule(sel.dataset.field, '');
    });
  }

  async function main() {
    const policyId = getPolicyId();
    if (!policyId) {
      notifyMessage('대상 ID가 없습니다.', '오류', {kind: 'error'});
      return;
    }

    // initial suggestions
    refreshDnsDomains('').catch(() => {});
    refreshSystemNames('').catch(() => {});

    let state = {
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      lastPage: 1,
    };

    const pageSizeSel = qs('#ip-range-page-size');
    if (pageSizeSel) {
      pageSizeSel.value = String(DEFAULT_PAGE_SIZE);
      pageSizeSel.addEventListener('change', async () => {
        state.pageSize = clampPageSize(pageSizeSel.value);
        state.page = 1;
        const meta = await loadTable(policyId, state.page, state.pageSize);
        if (meta) state.lastPage = meta.lastPage;
        renderPageButtons(state.page, state.lastPage, (picked) => goTo(picked));
      });
    }

    const prevBtn = qs('#ip-range-prev');
    const nextBtn = qs('#ip-range-next');

    const firstBtn = qs('#ip-range-first');
    const lastBtn = qs('#ip-range-last');

    const goTo = async (p) => {
      state.page = Math.min(Math.max(1, p), state.lastPage);
      const meta = await loadTable(policyId, state.page, state.pageSize);
      if (meta) state.lastPage = meta.lastPage;
      renderPageButtons(state.page, state.lastPage, (picked) => goTo(picked));
    };

    if (prevBtn) {
      prevBtn.addEventListener('click', async () => {
        await goTo(state.page - 1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', async () => {
        await goTo(state.page + 1);
      });
    }

    if (firstBtn) {
      firstBtn.addEventListener('click', async () => {
        await goTo(1);
      });
    }

    if (lastBtn) {
      lastBtn.addEventListener('click', async () => {
        await goTo(state.lastPage);
      });
    }

    wireTypeahead();

    const tbody = qs('#ip-range-table-body');
    if (tbody) {
      tbody.addEventListener('click', async (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('.action-btn[data-action]') : null;
        if (!btn) return;
        const action = btn.dataset.action;
        const tr = btn.closest('tr[data-ip]');
        if (!tr) return;

        if (action === 'edit') {
          lockOtherRows(tbody, tr);
          setRowEditable(tr, true);
          setActionButtonMode(btn, 'save');
          syncSearchableSelectsSoon(tr);
          const firstField = tr.querySelector('[data-field]');
          if (firstField) firstField.focus();
          return;
        }

        if (action !== 'save') return;

        try {
          btn.disabled = true;
          await saveRow(policyId, tr);
          syncRowDisplay(tr);
          setRowEditable(tr, false);
          setActionButtonMode(btn, 'edit');
          try { window.BlossomSearchableSelect?.close?.(); } catch (_e) {}
          syncSearchableSelectsSoon(tr);
          notifyMessage('저장되었습니다.', '완료', {kind: 'success'});
        } catch (err) {
          notifyMessage(err && err.message ? err.message : '저장 중 오류가 발생했습니다.', '오류', {kind: 'error'});
        } finally {
          btn.disabled = false;
        }
      });
    }

    const meta = await loadTable(policyId, state.page, state.pageSize);
    if (meta) state.lastPage = meta.lastPage;
    renderPageButtons(state.page, state.lastPage, (picked) => goTo(picked));
  }

  document.addEventListener('DOMContentLoaded', () => {
    main().catch((e) => {
      notifyMessage(e && e.message ? e.message : 'IP 범위 로딩 중 오류가 발생했습니다.', '오류', {kind: 'error'});
    });
  });
})();
