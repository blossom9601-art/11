(function(){
  'use strict';

  const API = '/api/governance/package-dashboard';
  const _pkgStartTime = Date.now();

  /* ── Utility: live clock / uptime ── */
  function _pkgPad(n){ return String(n).padStart(2, '0'); }
  function _pkgNow(){
    const d = new Date();
    return d.getFullYear() + '-' + _pkgPad(d.getMonth()+1) + '-' + _pkgPad(d.getDate()) +
           ' ' + _pkgPad(d.getHours()) + ':' + _pkgPad(d.getMinutes()) + ':' + _pkgPad(d.getSeconds());
  }
  function _pkgUptime(){
    var s = Math.floor((Date.now() - _pkgStartTime) / 1000);
    var h = Math.floor(s / 3600); s %= 3600;
    var m = Math.floor(s / 60); s %= 60;
    return _pkgPad(h) + ':' + _pkgPad(m) + ':' + _pkgPad(s);
  }
  function _pkgTick(){
    var now = _pkgNow();
    var up  = _pkgUptime();
    var el;
    el = document.getElementById('pkgStatusTime'); if(el) el.textContent = now;
    el = document.getElementById('pkgFooterTime');  if(el) el.textContent = now;
    el = document.getElementById('pkgFooterUptime');if(el) el.textContent = up;
  }
  function _pkgSetKpi(id, v){ var el = document.getElementById(id); if(el) el.textContent = String(v); }
  function _pkgSetHealth(ok){
    var dot  = document.getElementById('pkgHealthDot');
    var text = document.getElementById('pkgHealthText');
    if(dot){ dot.className = 'bk-status-pulse ' + (ok ? 'green' : 'red'); }
    if(text){ text.textContent = ok ? 'System Operational' : 'Data Unavailable'; }
  }

  function safeCtx(id){ const el = document.getElementById(id); if(!el) return null; return el.getContext('2d'); }

  function hexToRgb(hex){
    hex = String(hex || '').trim();
    if(hex.startsWith('#')) hex = hex.slice(1);
    if(hex.length === 3){ hex = hex.split('').map(c=>c+c).join(''); }
    const num = parseInt(hex, 16);
    if(Number.isNaN(num)) return {r:99,g:102,b:241};
    return { r:(num>>16)&255, g:(num>>8)&255, b:num&255 };
  }

  function accentColor(alpha){
    let v = getComputedStyle(document.documentElement).getPropertyValue('--accent');
    if(!v) v = '#6366f1';
    const {r,g,b} = hexToRgb(v);
    return `rgba(${r}, ${g}, ${b}, ${alpha==null?1:alpha})`;
  }

  function palette(i, a){
    const base = [
      'rgba(99, 102, 241, ALPHA)',
      'rgba(59, 130, 246, ALPHA)',
      'rgba(165, 180, 252, ALPHA)',
      'rgba(234, 179, 8, ALPHA)',
      'rgba(239, 68, 68, ALPHA)',
      'rgba(129, 140, 248, ALPHA)',
      'rgba(148, 163, 184, ALPHA)'
    ];
    return base[i % base.length].replace('ALPHA', a==null?1:a);
  }

  function setEmptyState(canvasId, message){
    const canvas = document.getElementById(canvasId);
    const holder = canvas?.parentElement;
    if(!holder) return;
    let el = holder.querySelector('.canvas-loading');
    if(!message){
      if(el) el.remove();
      return;
    }
    if(!el){
      holder.insertAdjacentHTML('beforeend', `<div class="canvas-loading"></div>`);
      el = holder.querySelector('.canvas-loading');
    }
    if(el) el.textContent = message;
  }

  async function fetchJson(url){
    const res = await fetch(url, { credentials:'same-origin', cache:'no-store' });
    let body = null;
    try{ body = await res.json(); }catch(_e){ /* ignore */ }
    if(!res.ok || (body && body.success === false)){
      const msg = body && body.message ? body.message : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return body;
  }

  let chartType = null;
  let chartVendor = null;
  let chartLicense = null;
  let chartVuln = null;

  function destroyAll(){
    [chartType, chartVendor, chartLicense, chartVuln].forEach(ch => {
      try{ ch?.destroy?.(); }catch(_e){}
    });
    chartType = chartVendor = chartLicense = chartVuln = null;
  }

  function toLabelsAndCounts(arr){
    const items = Array.isArray(arr) ? arr : [];
    return {
      labels: items.map(x=> String(x.label ?? '')),
      counts: items.map(x=> Number(x.count ?? 0))
    };
  }

  function topNWithOther(arr, n, otherLabel){
    const items = Array.isArray(arr) ? arr : [];
    const N = Math.max(0, Number(n || 0));
    const top = items.slice(0, N);
    const rest = items.slice(N);
    const restSum = rest.reduce((acc, x) => acc + (Number(x?.count ?? 0) || 0), 0);
    if(restSum > 0){
      top.push({ label: otherLabel || '기타', count: restSum });
    }
    return top;
  }

  function makeValuePercentTooltip(){
    return {
      callbacks: {
        label: (ctx)=>{
          const label = String(ctx?.label ?? '').trim();
          let parsed = ctx?.parsed;
          if(parsed && typeof parsed === 'object'){
            // Bar charts provide {x, y}
            parsed = (typeof parsed.y === 'number') ? parsed.y : parsed.x;
          }
          const value = Number(parsed ?? ctx?.raw ?? 0) || 0;
          const data = ctx?.dataset?.data;
          const total = Array.isArray(data) ? data.reduce((acc, v)=> acc + (Number(v)||0), 0) : 0;
          const pct = total > 0 ? (value / total * 100) : 0;
          const pctText = total > 0 ? `${pct.toFixed(1)}%` : '-';
          return label ? `${label}: ${value} (${pctText})` : `${value} (${pctText})`;
        }
      }
    };
  }

  function makeCenterTextPlugin(getText){
    return {
      id: 'centerText',
      beforeDraw(chart){
        try{
          const fn = (typeof getText === 'function') ? getText : null;
          if(!fn) return;
          const out = fn(chart);
          if(!out) return;
          const text = String(out.text ?? '').trim();
          if(!text) return;
          const sub = String(out.subtext ?? '').trim();

          const ctx = chart.ctx;
          const area = chart.chartArea;
          if(!ctx || !area) return;

          const cx = (area.left + area.right) / 2;
          const cy = (area.top + area.bottom) / 2;

          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          ctx.fillStyle = '#111827';
          ctx.font = '700 30px system-ui, -apple-system, Segoe UI, Roboto, Noto Sans KR, sans-serif';
          ctx.fillText(text, cx, cy - (sub ? 6 : 0));

          if(sub){
            ctx.fillStyle = '#6b7280';
            ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, Noto Sans KR, sans-serif';
            ctx.fillText(sub, cx, cy + 18);
          }

          ctx.restore();
        }catch(_e){ /* ignore */ }
      }
    };
  }

  function renderBar(canvasId, title, arr, maxItems, opts){
    const ctx = safeCtx(canvasId);
    if(!ctx || !window.Chart) return null;

    const {labels, counts} = toLabelsAndCounts(arr);
    const L = (maxItems && labels.length > maxItems) ? labels.slice(0, maxItems) : labels;
    const C = (maxItems && counts.length > maxItems) ? counts.slice(0, maxItems) : counts;

    if(L.length === 0){
      setEmptyState(canvasId, '표시할 데이터가 없습니다.');
      return null;
    }
    setEmptyState(canvasId, null);

    const thin = !!opts?.thin;
    return new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: L,
        datasets: [{
          label: title,
          data: C,
          backgroundColor: L.map((_,i)=> palette(i, 0.75)),
          borderColor: L.map((_,i)=> palette(i, 1)),
          borderWidth: 1,
          barThickness: thin ? 14 : undefined,
          maxBarThickness: thin ? 18 : undefined,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({ enabled: true }, makeValuePercentTooltip())
        },
        scales: {
          x: {
            ticks: { autoSkip: true, maxRotation: 30, minRotation: 0 },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: 'rgba(148, 163, 184, 0.25)' }
          }
        },
        layout: thin ? { padding: { top: 8, bottom: 2, left: 6, right: 6 } } : undefined,
      }
    });
  }

  function renderDonutOrPie(canvasId, arr, chartType, opts){
    const ctx = safeCtx(canvasId);
    if(!ctx || !window.Chart) return null;

    const {labels, counts} = toLabelsAndCounts(arr);
    if(labels.length === 0){
      setEmptyState(canvasId, '표시할 데이터가 없습니다.');
      return null;
    }
    setEmptyState(canvasId, null);

    const type = (chartType === 'pie') ? 'pie' : 'doughnut';
    const plugins = [];
    if(opts?.centerText){
      plugins.push(makeCenterTextPlugin(opts.centerText));
    }

    const colorForLabel = (typeof opts?.colorForLabel === 'function') ? opts.colorForLabel : null;
    const bgColors = colorForLabel
      ? labels.map((lab, i) => String(colorForLabel(lab, i, 0.75) || palette(i, 0.75)))
      : labels.map((_, i) => palette(i, 0.75));
    const borderColors = colorForLabel
      ? labels.map((lab, i) => String(colorForLabel(lab, i, 1) || palette(i, 1)))
      : labels.map((_, i) => palette(i, 1));

    return new window.Chart(ctx, {
      type,
      data: {
        labels,
        datasets: [{
          data: counts,
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: 1,
          radius: opts?.radius,
        }]
      },
      plugins,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: Object.assign({ enabled: true }, makeValuePercentTooltip())
        },
        cutout: (type === 'doughnut') ? (opts?.cutout ?? '70%') : undefined,
        layout: opts?.layoutPadding ? { padding: opts.layoutPadding } : undefined,
      }
    });
  }

  async function refresh(){
    if(!window.Chart){
      ['pkgTypeChart','pkgManufacturerChart','pkgLicenseChart','pkgVulnPresenceChart']
        .forEach(id => setEmptyState(id, 'Chart.js가 로드되지 않았습니다.'));
      return;
    }

    try{
      const data = await fetchJson(`${API}?_ts=${Date.now()}`);
      const dashboard = data && data.dashboard ? data.dashboard : null;

      if(!dashboard || Number(dashboard.total||0) === 0){
        destroyAll();
        _pkgSetHealth(false);
        _pkgSetKpi('kpiPkgTotal', '0');
        _pkgSetKpi('kpiPkgTypes', '0');
        _pkgSetKpi('kpiPkgVendors', '0');
        _pkgSetKpi('kpiPkgVuln', '0');
        var totalEl = document.getElementById('pkgStatusTotal');
        if(totalEl) totalEl.textContent = 'Packages: 0';
        ['pkgTypeChart','pkgManufacturerChart','pkgLicenseChart','pkgVulnPresenceChart']
          .forEach(id => setEmptyState(id, '표시할 패키지 데이터가 없습니다.'));
        return;
      }

      destroyAll();
      _pkgSetHealth(true);

      /* KPI */
      _pkgSetKpi('kpiPkgTotal', Number(dashboard.total || 0).toLocaleString());
      _pkgSetKpi('kpiPkgTypes', Array.isArray(dashboard.by_type) ? dashboard.by_type.length : 0);
      _pkgSetKpi('kpiPkgVendors', Array.isArray(dashboard.by_vendor) ? dashboard.by_vendor.length : 0);
      var vulnCount = 0;
      if(Array.isArray(dashboard.vuln_presence)){
        dashboard.vuln_presence.forEach(function(x){
          if(String(x && x.label || '').indexOf('있') !== -1) vulnCount += Number(x.count || 0);
        });
      }
      _pkgSetKpi('kpiPkgVuln', vulnCount.toLocaleString());
      var totalEl = document.getElementById('pkgStatusTotal');
      if(totalEl) totalEl.textContent = 'Packages: ' + Number(dashboard.total || 0).toLocaleString();

      chartType = renderDonutOrPie('pkgTypeChart', topNWithOther(dashboard.by_type, 5, '기타'), 'pie', {
        radius: '78%',
        layoutPadding: { top: 10, bottom: 10, left: 18, right: 18 },
      });
      chartVendor = renderBar('pkgManufacturerChart', '제조사', topNWithOther(dashboard.by_vendor, 5, '기타'), null, {thin:true});
      chartLicense = renderBar('pkgLicenseChart', '라이선스', topNWithOther(dashboard.by_license, 5, '기타'), null, {thin:true});

      chartVuln = renderDonutOrPie('pkgVulnPresenceChart', dashboard.vuln_presence, 'doughnut', {
        cutout: '72%',
        colorForLabel: (label, i, alpha)=>{
          const s = String(label || '').trim();
          if(s.includes('없')) return `rgba(209, 213, 219, ${alpha==null?1:alpha})`;
          return palette(i, alpha);
        },
        centerText: ()=>{
          const items = Array.isArray(dashboard.vuln_presence) ? dashboard.vuln_presence : [];
          const hit = items.find(x => String(x?.label ?? '').includes('취약점') && String(x?.label ?? '').includes('있'))
            || items.find(x => /있/.test(String(x?.label ?? '')))
            || null;
          const n = hit ? (Number(hit.count ?? 0) || 0) : 0;
          return { text: String(n) };
        }
      });

    }catch(e){
      console.warn('[Package Dashboard] load failed:', e?.message || e);
      destroyAll();
      _pkgSetHealth(false);
      ['pkgTypeChart','pkgManufacturerChart','pkgLicenseChart','pkgVulnPresenceChart']
        .forEach(id => setEmptyState(id, '대시보드 데이터를 불러오지 못했습니다.'));
    }
  }

  function init(){
    _pkgTick();
    setInterval(_pkgTick, 1000);
    refresh();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
