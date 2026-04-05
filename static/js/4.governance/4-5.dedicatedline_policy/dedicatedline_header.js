(function(){
  'use strict';

  // Avoid flashing placeholder header text during tab navigation.
  // IMPORTANT: do NOT hide when the header can be rendered immediately via query params or body data.
  (function(){
    try{
      var qsLocal = new URLSearchParams(window.location.search || '');
      var idRaw = qsLocal.get('id') || (document.body && document.body.dataset && document.body.dataset.govDetailId || '').trim() || null;
      var lineId = idRaw ? parseInt(idRaw, 10) : NaN;
      var org = (qsLocal.get('org_name') || '').trim();
      var proto = (qsLocal.get('protocol_code') || qsLocal.get('protocol') || '').trim();
      var needFetchForHeader = (Number.isFinite(lineId) && lineId > 0) && !org && !proto;
      if(needFetchForHeader){
        document.documentElement.classList.add('dl-header-pending');
      }
    }catch(_e){}
  })();

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function qs(name){
    try{ return new URLSearchParams(window.location.search).get(name); }catch(_e){ return null; }
  }

  /** Resolve the line ID from body data attribute (SPA session-based routing). */
  function govDetailId(){
    try{ return (document.body.dataset.govDetailId || '').trim() || null; }catch(_e){ return null; }
  }

  async function apiGetJson(path){
    const res = await fetch(path, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    let body = null;
    try{ body = await res.json(); }catch(_e){ body = null; }
    if(!res.ok || (body && body.success === false)){
      return null;
    }
    return body;
  }

  function setText(id, value){
    const el = document.getElementById(id);
    if(!el) return;
    el.textContent = String(value == null ? '' : value);
  }

  function setHtml(id, html){
    const el = document.getElementById(id);
    if(!el) return;
    el.innerHTML = String(html == null ? '' : html);
  }

  function escapeHTML(str){
    return String(str == null ? '' : str).replace(/[&<>"']/g, function(s){
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[s]);
    });
  }

  function normalize(value){
    const s = String(value == null ? '' : value).trim();
    return s || '-';
  }

  function leasedLineApiToUiRow(item){
    const slot = (item && item.slot_no === 0) ? 0 : (item && (item.slot_no ?? ''));
    return {
      id: item && item.id,
      org_name: item && item.org_name,
      status: item && item.status_code,
      telco: item && item.carrier_code,
      protocol: item && item.protocol_code,
      manager: item && item.management_owner,
      line_no: item && item.line_no,
      line_name: item && item.line_name,
      business: item && item.business_purpose,
      speed: item && item.speed_label,
      open_date: item && item.opened_date,
      close_date: item && item.closed_date,
      dr_line: item && item.dr_line_no,
      device_name: item && item.device_name,
      network_device: item && item.comm_device,
      slot: slot,
      port: item && item.port_no,
      child_device: item && item.child_device_name,
      child_port: item && item.child_port_no,
      our_agency: item && item.our_jurisdiction,
      org_agency: item && item.org_jurisdiction,
    };
  }

  function renderStatus(id, val){
    const v = String(val == null ? '' : val).trim();
    if(!v){ setText(id, '-'); return; }
    let cls = 'ws-wait';
    if(v === '운용') cls = 'ws-run';
    else if(v === '해지') cls = 'ws-wait';
    const html = `<span class="status-pill"><span class="status-dot ${cls}" aria-hidden="true"></span><span class="status-text">${escapeHTML(v)}</span></span>`;
    setHtml(id, html);
  }

  function normalizeTelcoKey(v){
    const s = String(v == null ? '' : v).toUpperCase().trim();
    if(s === 'LGU+') return 'LG';
    if(s === 'SKT') return 'SKB';
    return s;
  }

  function renderTelco(id, val){
    const key = normalizeTelcoKey(val);
    const TELCO_LOGOS = {
      KT: '/static/image/svg/telecom/KT_Logo.svg',
      SKB: '/static/image/svg/telecom/SKT_Logo.svg',
      LG: '/static/image/svg/telecom/LGU_Logo.svg',
    };
    const logo = TELCO_LOGOS[key];
    if(!logo){ setText(id, '-'); return; }
    setHtml(id, `<img src="${logo}" alt="${escapeHTML(val || key)}" title="${escapeHTML(val || key)}" class="telco-logo" width="16" height="16">`);
  }

  function setValue(id, value){
    const el = document.getElementById(id);
    if(!el) return;
    const v = (value === 0) ? '0' : normalize(value);
    el.textContent = v;
  }

  function populateBasicInfoCards(item){
    // Only runs on 기본정보 탭 where md-* elements exist.
    if(!document.getElementById('md-org_name')) return;

    const row = leasedLineApiToUiRow(item);

    setValue('md-org_name', row.org_name);
    renderStatus('md-status', row.status);
    renderTelco('md-telco', row.telco);
    setValue('md-protocol', row.protocol);
    setValue('md-manager', row.manager);

    setValue('md-line_no', row.line_no);
    setValue('md-line_name', row.line_name);
    setValue('md-business', row.business);
    setValue('md-speed', row.speed);
    setValue('md-open_date', row.open_date);
    setValue('md-close_date', row.close_date);
    setValue('md-dr_line', row.dr_line);

    setValue('md-device_name', row.device_name);
    setValue('md-network_device', row.network_device);
    setValue('md-slot', row.slot);
    setValue('md-port', row.port);
    setValue('md-child_device', row.child_device);
    setValue('md-child_port', row.child_port);

    setValue('md-our_agency', row.our_agency);
    setValue('md-org_agency', row.org_agency);
  }

  ready(async function(){
    const idRaw = qs('id') || govDetailId();
    const lineId = idRaw ? parseInt(idRaw, 10) : NaN;

    // Prefer stable, server-rendered header via query params (OS-detail pattern)
    const orgFromQsRaw = String(qs('org_name') || '').trim();
    const protoFromQsRaw = String(qs('protocol_code') || qs('protocol') || '').trim();

    const titleEl = document.getElementById('page-header-title');
    const subtitleEl = document.getElementById('page-header-subtitle');
    const maybePlaceholder = function(el){
      if(!el) return false;
      const t = String(el.textContent || '').trim();
      return /dedicated\s*line/i.test(t);
    };

    // If the server rendered placeholders, clear them immediately.
    try{
      if(maybePlaceholder(titleEl)) titleEl.textContent = '';
      if(maybePlaceholder(subtitleEl)) subtitleEl.textContent = '';
    }catch(_e){}

    // If query params provide header values, set them immediately (no hide/show).
    // Still fetch in background to keep the header accurate even if query params are stale.
    if(orgFromQsRaw || protoFromQsRaw){
      try{
        if(orgFromQsRaw) setText('page-header-title', orgFromQsRaw);
        if(protoFromQsRaw) setText('page-header-subtitle', protoFromQsRaw);
      }catch(_e){}
      try{ document.documentElement.classList.remove('dl-header-pending'); }catch(_e){}

      // Fetch actual values to avoid stale header, and fill basic-info cards if present.
      if(Number.isFinite(lineId) && lineId > 0){
        try{
          const data0 = await apiGetJson(`/api/network/leased-lines/${encodeURIComponent(String(lineId))}`);
          const item0 = data0 && data0.item ? data0.item : null;
          if(item0){
            try{
              setText('page-header-title', normalize(item0.org_name));
              setText('page-header-subtitle', normalize(item0.protocol_code));
            }catch(_e){}
            try{ populateBasicInfoCards(item0); }catch(_e){}
          }
        }catch(_e){}
      }
      return;
    }

    if(!Number.isFinite(lineId) || lineId <= 0){
      try{ document.documentElement.classList.remove('dl-header-pending'); }catch(_e){}
      return;
    }

    const data = await apiGetJson(`/api/network/leased-lines/${encodeURIComponent(String(lineId))}`);
    const item = data && data.item ? data.item : null;
    if(!item){
      // Keep UI clean even when API fails.
      try{
        setText('page-header-title', '');
        setText('page-header-subtitle', '');
      }catch(_e){}
      try{ document.documentElement.classList.remove('dl-header-pending'); }catch(_e){}
      return;
    }

    setText('page-header-title', normalize(item.org_name));
    setText('page-header-subtitle', normalize(item.protocol_code));

    try{ document.documentElement.classList.remove('dl-header-pending'); }catch(_e){}

    // 기본정보 빨간 영역(카드) 채우기
    try{ populateBasicInfoCards(item); }catch(_e){ /* no-op */ }
  });
})();
