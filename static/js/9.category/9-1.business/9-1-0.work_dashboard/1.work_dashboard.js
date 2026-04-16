(function(){
// --- Color themes -----------------------------------------------------------
// You can switch theme via: window.setWorkPalette('pastel'|'blossom'|'slate')
// The selection is persisted in localStorage (key: workPalette)
function getQueryParam(name){ try{ return new URLSearchParams(location.search).get(name); }catch(_){ return null; } }
var THEME_PALETTES = {
  // Soft pastel tints
  pastel: ['#A5B4FC','#C7D2FE','#FBCFE8','#FDE68A','#99F6E4','#BFDBFE','#FCA5A5','#FDE68A','#D8B4FE','#86EFAC'],
  // Default blossom accent mix (purple/indigo/pink/sky)
  blossom: ['#6366F1','#7C3AED','#8B5CF6','#A78BFA','#C084FC','#E879F9','#F472B6','#EC4899','#60A5FA','#22D3EE'],
  // Muted slate neutrals with a hint of indigo accents
  slate: ['#94A3B8','#64748B','#A5B4FC','#475569','#CBD5E1','#9CA3AF','#818CF8','#E5E7EB','#6B7280','#A78BFA']
};

function currentTheme(){
  const fromUrl = getQueryParam('palette');
  const fromStore = typeof localStorage !== 'undefined' ? localStorage.getItem('workPalette') : null;
  const t = (fromUrl || fromStore || 'blossom');
  return THEME_PALETTES[t] ? t : 'blossom';
}

function setPaletteTheme(theme){
  try{ if (THEME_PALETTES[theme] && typeof localStorage!== 'undefined'){ localStorage.setItem('workPalette', theme); } }catch(_){ }
}

// Expose a simple switcher that reloads to re-render with new colors
window.setWorkPalette = function(theme){
  if (!THEME_PALETTES[theme]) return;
  setPaletteTheme(theme);
  try{ location.reload(); }catch(_){ }
};

function palette(n) {
  const theme = currentTheme();
  const base = THEME_PALETTES[theme] || THEME_PALETTES.blossom;
  const out = [];
  for (let i = 0; i < n; i++) out.push(base[i % base.length]);
  return out;
}

// Utility to add alpha to hex colors
function addAlpha(hex, a){
  try{
    const h = hex.replace('#','');
    const bigint = parseInt(h.length===3 ? h.split('').map(ch=>ch+ch).join('') : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`;
  }catch(_){ return hex; }
}

// Limit categories: top N by count, rest aggregated as '기타'. Default N=9 (10 total).
function top10WithOthers(items, topN) {
  const n = (topN && topN > 0) ? topN : 9;
  const arr = (items || []).map(it => ({
    name: String(it?.name ?? ''),
    count: Number(it?.count ?? 0)
  }));
  arr.sort((a, b) => (b.count - a.count));
  if (arr.length <= n + 1) return arr;
  const top = arr.slice(0, n);
  const rest = arr.slice(n);
  const restTotal = rest.reduce((s, x) => s + (Number(x.count) || 0), 0);
  if (restTotal > 0) top.push({ name: '기타', count: restTotal, _others: rest });
  return top;
}

// For XY data with {name, hw, sw}. Default N=9.
function top10WithOthersXY(items, topN) {
  const n = (topN && topN > 0) ? topN : 9;
  const arr = (items || []).map(it => ({
    name: String(it?.name ?? ''),
    hw: Number(it?.hw ?? 0),
    sw: Number(it?.sw ?? 0)
  }));
  arr.sort((a, b) => (b.hw + b.sw) - (a.hw + a.sw));
  if (arr.length <= n + 1) return arr;
  const top = arr.slice(0, n);
  const rest = arr.slice(n);
  const restHw = rest.reduce((s, x) => s + (Number(x.hw) || 0), 0);
  const restSw = rest.reduce((s, x) => s + (Number(x.sw) || 0), 0);
  if (restHw + restSw > 0) top.push({ name: '기타', hw: restHw, sw: restSw, _others: rest });
  return top;
}

function disableChartAnimationsGlobally() {
  if (!window.Chart) return;
  try {
    Chart.defaults.animation = false;
  Chart.defaults.responsive = false;
  Chart.defaults.maintainAspectRatio = false;
    if (Chart.defaults.animations) {
      Object.keys(Chart.defaults.animations).forEach(k => {
        if (Chart.defaults.animations[k]) Chart.defaults.animations[k].duration = 0;
      });
    }
    if (Chart.defaults.transitions) {
      if (Chart.defaults.transitions.active && Chart.defaults.transitions.active.animation) {
        Chart.defaults.transitions.active.animation.duration = 0;
      }
      if (Chart.defaults.transitions.resize && Chart.defaults.transitions.resize.animation) {
        Chart.defaults.transitions.resize.animation.duration = 0;
      }
    }
  } catch (_) {}
}

function fixCanvasSize(el) {
  try {
    const parent = el.parentElement;
    const w = (parent && parent.clientWidth) ? parent.clientWidth : 300;
    let h = (parent && parent.clientHeight) ? parent.clientHeight : 0;
    if (!h) {
      const attrH = Number(el.getAttribute('height')) || 0;
      h = attrH || 220;
    }
    el.width = w;
    el.height = h;
  } catch (_) {}
}

function renderDoughnut(canvasId, items, onClick, options) {
  const el = document.getElementById(canvasId);
  if (!el || !window.Chart) return;
  // Destroy previous Chart instance (SPA re-navigation)
  try { const prev = Chart.getChart(el); if (prev) prev.destroy(); } catch (_) {}
  // Remove stale legend from previous render
  try { const stale = (el.closest('.exec-card') || el.closest('.card.chart') || document).querySelector('#' + canvasId + '-legend'); if (stale) stale.remove(); } catch (_) {}
  // Reserve legend space before sizing
  try { const card0 = el.closest('.exec-card') || el.closest('.card.chart'); if (card0) card0.classList.add('has-legend'); } catch (_) {}
  fixCanvasSize(el);
  const opts = Object.assign({ showCenter: true }, options);
  const limited = top10WithOthers(items, opts.topN);
  const labels = limited.map(x => x.name);
  const values = limited.map(x => x.count || 0);
  const colors = palette(labels.length);
  const total = values.reduce((s,v)=> s + (Number(v)||0), 0);
  const centerTextPlugin = {
    id: 'centerText',
    afterDraw(chart) {
      try {
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || !meta.data.length) return;
        const { x, y } = meta.data[0];
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = '600 13px Inter, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans KR, sans-serif';
        ctx.fillStyle = '#334155';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`총 ${total.toLocaleString('ko-KR')} 건`, x, y);
        ctx.restore();
      } catch (_) {}
    }
  };
  const chart = new Chart(el, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderColor: '#ffffff', borderWidth: 2, hoverOffset: 0 }]
    },
    options: {
      // Disable animations and interactions to avoid any moving effects
      animation: false,
      animations: { colors: { duration: 0 }, numbers: { duration: 0 }, radius: { duration: 0 } },
  transitions: { active: { animation: { duration: 0 } }, resize: { animation: { duration: 0 } } },
      // Enable hover + click (like access tooltip) without motion
      events: ['mousemove','mouseout','click','touchstart','touchmove','touchend'],
      interaction: { mode: 'nearest', intersect: true },
      hover: { mode: 'nearest', animationDuration: 0 },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(30, 41, 59, 0.95)',
          titleColor: '#ffffff',
          bodyColor: '#e2e8f0',
          borderColor: 'rgba(139, 92, 246, 0.3)',
          borderWidth: 1,
          cornerRadius: 12,
          displayColors: true,
          padding: 12,
          titleFont: { size: 14, weight: '600' },
          bodyFont: { size: 13 },
          callbacks: {
            label: (ctx) => {
              const val = ctx.raw ?? 0;
              const fmt = (n) => new Intl.NumberFormat('ko-KR').format(n);
              const pct = total ? Math.round((val / total) * 1000) / 10 : 0;
              return `${ctx.label}: ${fmt(val)} 건 (${pct}%)`;
            }
          }
        }
      },
      responsive: false,
      maintainAspectRatio: false,
  cutout: '60%'
    }
  , plugins: opts.showCenter ? [centerTextPlugin] : []
  });
  if (typeof onClick === 'function') {
    el.onclick = (evt) => {
      try {
        const points = chart.getActiveElements();
        // If Chart.js didn't pick up event yet, ask controller
        const els = points && points.length ? points : chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
        if (!els || !els.length) return;
        const idx = els[0].index;
        const name = labels[idx];
        const count = values[idx];
  const meta = limited[idx] || null;
  onClick({ canvasId, name, count, index: idx, items: limited, others: meta && meta._others ? meta._others : undefined });
      } catch (_) {}
    };
  }
  // Ensure no pending animation frames
  try { chart.stop(); chart.update(0); } catch (_) {}

  // Render external legend as strict 5x2 grid (max 10 items) AFTER the chart container
  try {
    const container = el.parentElement;
    const card = el.closest('.exec-card') || el.closest('.card.chart');
    if (container && card) {
      let legend = card.querySelector(`#${canvasId}-legend`);
      if (!legend) {
        legend = document.createElement('div');
        legend.id = `${canvasId}-legend`;
        legend.className = 'chart-legend';
        container.insertAdjacentElement('afterend', legend);
      }
      legend.innerHTML = '';
      const list = (labels || []).map((name, i) => ({ name, count: values[i] || 0, color: colors[i] })).slice(0, 10);
      list.forEach((it, idx) => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        const sw = document.createElement('span');
        sw.className = 'legend-swatch';
        sw.style.background = it.color;
        const lb = document.createElement('span');
        lb.textContent = it.name;
        lb.title = `${it.name} ${(it.count || 0).toLocaleString('ko-KR')} 건`;
        item.appendChild(sw);
        item.appendChild(lb);
        if (typeof onClick === 'function') {
          item.style.cursor = 'pointer';
          item.onclick = () => {
            const meta = limited[idx] || null;
            onClick({ canvasId, name: it.name, count: it.count || 0, index: idx, items: limited, others: meta && meta._others ? meta._others : undefined });
          };
        }
        legend.appendChild(item);
      });
  requestAnimationFrame(() => { try { fixCanvasSize(el); if (chart && chart.resize) chart.resize(); if (chart && chart.update) chart.update(0); } catch (_) {} });
    }
  } catch (_) {}
}

// Pie (with 5x2 external legend, no center text)
function renderPie(canvasId, items, onClick, options) {
  const el = document.getElementById(canvasId);
  if (!el || !window.Chart) return;
  // Destroy previous Chart instance (SPA re-navigation)
  try { const prev = Chart.getChart(el); if (prev) prev.destroy(); } catch (_) {}
  // Remove stale legend from previous render
  try { const stale = (el.closest('.exec-card') || el.closest('.card.chart') || document).querySelector('#' + canvasId + '-legend'); if (stale) stale.remove(); } catch (_) {}
  try { const card0 = el.closest('.exec-card') || el.closest('.card.chart'); if (card0) card0.classList.add('has-legend'); } catch (_) {}
  fixCanvasSize(el);
  const opts = Object.assign({}, options);
  const limited = top10WithOthers(items, opts.topN);
  const labels = limited.map(x => x.name);
  const values = limited.map(x => x.count || 0);
  const colors = palette(labels.length);
  const total = values.reduce((s,v)=> s + (Number(v)||0), 0);
  const chart = new Chart(el, {
    type: 'pie',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: '#ffffff', borderWidth: 2 }] },
    options: {
      animation: false,
      events: ['mousemove','mouseout','click','touchstart','touchmove','touchend'],
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(30, 41, 59, 0.95)',
          titleColor: '#ffffff', bodyColor: '#e2e8f0', borderColor: 'rgba(139, 92, 246, 0.3)', borderWidth: 1,
          callbacks: { label: (ctx) => {
            const val = ctx.raw ?? 0; const fmt = (n) => new Intl.NumberFormat('ko-KR').format(n);
            const pct = total ? Math.round((val / total) * 1000) / 10 : 0; return `${ctx.label}: ${fmt(val)} 건 (${pct}%)`;
          }}
        }
      },
      responsive: false, maintainAspectRatio: false
    }
  });
  if (typeof onClick === 'function') {
    el.onclick = (evt) => {
      try {
        const els = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
        if (!els || !els.length) return; const idx = els[0].index;
        const meta = limited[idx] || null; onClick({ canvasId, name: labels[idx], count: values[idx], index: idx, items: limited, others: meta?._others });
      } catch (_) {}
    };
  }
  try { chart.stop(); chart.update(0); } catch (_) {}
  // External 5x2 legend like doughnut
  try {
    const container = el.parentElement; const card = el.closest('.exec-card') || el.closest('.card.chart');
    if (container && card) {
      let legend = card.querySelector(`#${canvasId}-legend`);
      if (!legend) { legend = document.createElement('div'); legend.id = `${canvasId}-legend`; legend.className = 'chart-legend'; container.insertAdjacentElement('afterend', legend); }
      legend.innerHTML = '';
      const list = (labels || []).map((name, i) => ({ name, count: values[i] || 0, color: colors[i] })).slice(0, 10);
      list.forEach((it, idx) => {
        const item = document.createElement('div'); item.className = 'legend-item';
        const sw = document.createElement('span'); sw.className = 'legend-swatch'; sw.style.background = it.color;
        const lb = document.createElement('span'); lb.textContent = it.name; lb.title = `${it.name} ${(it.count||0).toLocaleString('ko-KR')} 건`;
        item.appendChild(sw); item.appendChild(lb);
        if (typeof onClick === 'function') { item.style.cursor = 'pointer'; item.onclick = () => { const meta = limited[idx] || null; onClick({ canvasId, name: it.name, count: it.count||0, index: idx, items: limited, others: meta?._others }); }; }
        legend.appendChild(item);
      });
  // Refit canvas now that legend is present
  requestAnimationFrame(() => { try { fixCanvasSize(el); if (chart && chart.resize) chart.resize(); if (chart && chart.update) chart.update(0); } catch (_) {} });
    }
  } catch (_) {}
}

function commonCartesianOptions() {
  return {
    animation: false,
    responsive: false,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true, backgroundColor: 'rgba(30, 41, 59, 0.95)', titleColor: '#ffffff', bodyColor: '#e2e8f0', borderColor: 'rgba(139, 92, 246, 0.3)', borderWidth: 1 } },
    scales: {
      x: { grid: { color: 'rgba(100,116,139,0.15)' }, ticks: { color: '#64748B', font: { size: 11 } }, border: { color: 'rgba(100,116,139,0.4)' } },
      y: { grid: { color: 'rgba(100,116,139,0.15)' }, ticks: { color: '#64748B', font: { size: 11 } }, border: { color: 'rgba(100,116,139,0.4)' } }
    }
  };
}

function renderScatter(canvasId, points, colorIdx = 0) {
  const el = document.getElementById(canvasId); if (!el || !window.Chart) return; fixCanvasSize(el);
  const colors = palette(10);
  const color = colors[colorIdx % colors.length];
  new Chart(el, {
    type: 'scatter',
    data: { datasets: [{ label: '산점', data: points, backgroundColor: color + 'CC', borderColor: color, borderWidth: 1, pointRadius: 4, pointHoverRadius: 5 }] },
    options: commonCartesianOptions()
  });
}

function renderBubble(canvasId, items, onClick, options) {
  const el = document.getElementById(canvasId);
  if (!el || !window.Chart) return; 
  try { const card0 = el.closest('.exec-card') || el.closest('.card.chart'); if (card0) card0.classList.add('has-legend'); } catch (_) {}
  fixCanvasSize(el);
  const opts = Object.assign({}, options);
  const isXY = Array.isArray(items) && items.length && (items[0].hw !== undefined || items[0].sw !== undefined);
  const limited = isXY ? top10WithOthersXY(items, opts.topN) : top10WithOthers(items, opts.topN);
  const names = limited.map(x => x.name);
  const totals = isXY ? limited.map(x => (x.hw || 0) + (x.sw || 0)) : limited.map(x => x.count || 0);
  const colors = palette(names.length);
  // Scale radius by total
  const minT = Math.min(...totals), maxT = Math.max(...totals);
  const scaleR = (v) => {
    if (!isFinite(minT) || !isFinite(maxT) || maxT === minT) return 10;
    const t = (v - minT) / (maxT - minT);
    return 6 + t * 14;
  };
  const dataPoints = isXY
    ? limited.map((it) => ({ x: (it.hw || 0), y: (it.sw || 0), r: scaleR((it.hw || 0) + (it.sw || 0)) }))
    : totals.map((v, i) => ({ x: i + 1, y: v, r: scaleR(v) }));
  const bgColors = colors.map(c => addAlpha(c, 0.72));
  const bdColors = colors.map(c => c);
  const chart = new Chart(el, {
    type: 'bubble',
    data: { datasets: [{ label: '분포', data: dataPoints, backgroundColor: bgColors, borderColor: bdColors, borderWidth: 2 }] },
    options: Object.assign({}, commonCartesianOptions(), {
      scales: isXY ? {
        x: { type: 'linear', beginAtZero: true, grid: { color: 'rgba(100,116,139,0.08)' }, ticks: { color: '#64748B', font: { size: 11 }, maxTicksLimit: 10 } },
        y: { type: 'linear', beginAtZero: true, grid: { color: 'rgba(100,116,139,0.08)' }, ticks: { color: '#64748B', font: { size: 11 }, maxTicksLimit: 10 } }
      } : {
        x: {
          type: 'linear', min: 0.5, max: names.length + 0.5,
          grid: { color: 'rgba(100,116,139,0.08)' },
          ticks: { stepSize: 1, autoSkip: true, maxTicksLimit: 12, callback: (val) => { const idx = Math.round(val) - 1; const n = names[idx]; return n ? (n.length > 6 ? n.slice(0, 6) + '…' : n) : ''; }, color: '#64748B', font: { size: 11 } },
          border: { color: 'rgba(100,116,139,0.4)' }
        },
        y: { beginAtZero: true, grid: { color: 'rgba(100,116,139,0.08)' }, ticks: { color: '#64748B', font: { size: 11 } }, border: { color: 'rgba(100,116,139,0.4)' } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => {
          const i = ctx.dataIndex; const name = names[i];
          if (isXY) { const it = limited[i] || {}; const fmt = (n) => new Intl.NumberFormat('ko-KR').format(n); return `${name}: HW ${fmt(it.hw || 0)}, SW ${fmt(it.sw || 0)}`; }
          const val = totals[i] || 0; const fmt = (n) => new Intl.NumberFormat('ko-KR').format(n); return `${name}: ${fmt(val)} 건`;
        }}}
      }
    })
  });
  if (typeof onClick === 'function') {
    el.onclick = (evt) => {
      try {
        const els = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
        if (!els || !els.length) return; const idx = els[0].index;
  const meta = limited[idx] || null;
  onClick({ canvasId, name: names[idx], count: totals[idx], index: idx, items: limited, others: meta?._others });
      } catch (_) {}
    };
  }
  try { chart.stop(); chart.update(0); } catch (_) {}
  // External 5x2 legend
  try {
    const container = el.parentElement; const card = el.closest('.exec-card') || el.closest('.card.chart');
    if (container && card) {
      let legend = card.querySelector(`#${canvasId}-legend`);
      if (!legend) { legend = document.createElement('div'); legend.id = `${canvasId}-legend`; legend.className = 'chart-legend'; container.insertAdjacentElement('afterend', legend); }
      legend.innerHTML = '';
      names.slice(0,10).forEach((name, idx) => {
        const item = document.createElement('div'); item.className = 'legend-item';
        const sw = document.createElement('span'); sw.className = 'legend-swatch'; sw.style.background = colors[idx];
        const lb = document.createElement('span'); lb.textContent = name; lb.title = `${name} ${(totals[idx]||0).toLocaleString('ko-KR')} 건`;
        item.appendChild(sw); item.appendChild(lb);
        if (typeof onClick === 'function') { item.style.cursor = 'pointer'; item.onclick = () => { const meta = limited[idx] || null; onClick({ canvasId, name, count: totals[idx]||0, index: idx, items: limited, others: meta?._others }); }; }
        legend.appendChild(item);
      });
  // Refit canvas to adjusted container height
  requestAnimationFrame(() => { try { fixCanvasSize(el); if (chart && chart.resize) chart.resize(); if (chart && chart.update) chart.update(0); } catch (_) {} });
    }
  } catch (_) {}
}

function renderBarVertical(canvasId, items, onClick) {
  const el = document.getElementById(canvasId); if (!el || !window.Chart) return;
  try { const prev = Chart.getChart(el); if (prev) prev.destroy(); } catch (_) {}
  fixCanvasSize(el);
  const limited = top10WithOthers(items);
  const labels = limited.map(x=>x.name);
  const values = limited.map(x=>x.count||0);
  const colors = palette(labels.length);
  const chart = new Chart(el, {
    type: 'bar',
    data: { labels, datasets: [{ label: '건수', data: values, backgroundColor: colors.map(c=>addAlpha(c,0.82)), borderColor: colors, borderWidth: 1, borderRadius: 6, maxBarThickness: 28 }] },
    options: Object.assign({}, commonCartesianOptions(), {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${new Intl.NumberFormat('ko-KR').format(ctx.raw)} 건` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#1e293b', font: { size: 12.5, weight: '600' }, maxRotation: 0, minRotation: 0, callback: (v,i) => { const t = labels[i]||''; return t.length>6? t.slice(0,6)+'…': t; } } },
        y: { beginAtZero: true, grid: { color: 'rgba(100,116,139,0.12)' }, ticks: { color: '#334155', font: { size: 12 } } }
      }
    })
  });
  if (typeof onClick === 'function') {
    el.onclick = (evt) => {
      const els = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
      if (!els || !els.length) return; const idx = els[0].index; const meta = limited[idx] || null;
      onClick({ canvasId, name: labels[idx], count: values[idx], index: idx, items: limited, others: meta?._others });
    };
  }
}

function renderBarHorizontal(canvasId, items, onClick) {
  const el = document.getElementById(canvasId); if (!el || !window.Chart) return;
  try { const prev = Chart.getChart(el); if (prev) prev.destroy(); } catch (_) {}
  fixCanvasSize(el);
  const limited = top10WithOthers(items);
  const labels = limited.map(x=>x.name);
  const values = limited.map(x=>x.count||0);
  const colors = palette(labels.length);
  const chart = new Chart(el, {
    type: 'bar',
    data: { labels, datasets: [{ label: '건수', data: values, backgroundColor: colors.map(c=>addAlpha(c,0.82)), borderColor: colors, borderWidth: 1, borderRadius: 6, barThickness: 18 }] },
    options: Object.assign({}, commonCartesianOptions(), {
      indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${new Intl.NumberFormat('ko-KR').format(ctx.raw)} 건` } } },
      scales: {
        x: { beginAtZero: true, grid: { color: 'rgba(100,116,139,0.12)' }, ticks: { color: '#334155', font: { size: 12 } } },
        y: { grid: { display: false }, ticks: { color: '#1e293b', font: { size: 12.5, weight: '600' }, callback: (v,i) => { const t = labels[i]||''; return t.length>8? t.slice(0,8)+'…': t; } } }
      }
    })
  });
  if (typeof onClick === 'function') {
    el.onclick = (evt) => {
      const els = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
      if (!els || !els.length) return; const idx = els[0].index; const meta = limited[idx] || null;
      onClick({ canvasId, name: labels[idx], count: values[idx], index: idx, items: limited, others: meta?._others });
    };
  }
}

// Treemap: squarified layout rendered as styled divs
function renderTreemap(containerId, items, onClick, options) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const opts = Object.assign({}, options);
  const isXY = Array.isArray(items) && items.length && (items[0].hw !== undefined || items[0].sw !== undefined);
  const limited = isXY ? top10WithOthersXY(items, opts.topN) : top10WithOthers(items, opts.topN);
  const data = limited.map(it => ({
    name: it.name,
    value: isXY ? ((it.hw || 0) + (it.sw || 0)) : (it.count || 0),
    hw: it.hw || 0,
    sw: it.sw || 0,
    _others: it._others
  })).filter(d => d.value > 0);
  data.sort((a, b) => b.value - a.value);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return;
  const colors = palette(data.length);

  // Squarify algorithm
  function squarify(items, rect) {
    if (!items.length) return [];
    const rects = [];
    let remaining = items.slice();
    let { x, y, w, h } = rect;
    while (remaining.length) {
      const isWide = w >= h;
      const side = isWide ? h : w;
      const totalArea = remaining.reduce((s, d) => s + d.value, 0);
      const scale = (w * h) / totalArea;
      let row = [remaining[0]];
      remaining = remaining.slice(1);
      let rowArea = row[0].value * scale;
      function worstRatio(rowItems, rowTotalArea) {
        const s = side;
        let worst = 0;
        for (const it of rowItems) {
          const area = it.value * scale;
          const rr = rowTotalArea / s;
          const dim = area / rr;
          const ratio = Math.max(rr / dim, dim / rr);
          if (ratio > worst) worst = ratio;
        }
        return worst;
      }
      while (remaining.length) {
        const candidate = remaining[0];
        const newRowArea = rowArea + candidate.value * scale;
        const oldWorst = worstRatio(row, rowArea);
        const newWorst = worstRatio([...row, candidate], newRowArea);
        if (newWorst <= oldWorst) {
          row.push(candidate);
          remaining = remaining.slice(1);
          rowArea = newRowArea;
        } else break;
      }
      const rowSpan = rowArea / side;
      let offset = 0;
      for (const it of row) {
        const area = it.value * scale;
        const dim = area / rowSpan;
        if (isWide) {
          rects.push({ ...it, x: x, y: y + offset, w: rowSpan, h: dim });
        } else {
          rects.push({ ...it, x: x + offset, y: y, w: dim, h: rowSpan });
        }
        offset += dim;
      }
      if (isWide) { x += rowSpan; w -= rowSpan; } else { y += rowSpan; h -= rowSpan; }
    }
    return rects;
  }

  // Render
  const cw = container.clientWidth || 300;
  const ch = container.clientHeight || 400;
  container.innerHTML = '';
  container.style.position = 'relative';
  const cells = squarify(data, { x: 0, y: 0, w: cw, h: ch });
  const gap = 2;
  cells.forEach((cell, idx) => {
    const div = document.createElement('div');
    div.className = 'treemap-cell';
    div.style.position = 'absolute';
    div.style.left = (cell.x + gap / 2) + 'px';
    div.style.top = (cell.y + gap / 2) + 'px';
    div.style.width = Math.max(0, cell.w - gap) + 'px';
    div.style.height = Math.max(0, cell.h - gap) + 'px';
    div.style.background = colors[idx % colors.length];
    const pct = total ? Math.round((cell.value / total) * 1000) / 10 : 0;
    div.title = `${cell.name}: ${cell.value.toLocaleString('ko-KR')} 건 (${pct}%)`;
    // Show name + count if cell is large enough
    if (cell.w > 50 && cell.h > 30) {
      div.innerHTML = `<span class="tm-name">${cell.name}</span><span class="tm-count">${cell.value.toLocaleString('ko-KR')}</span>`;
    } else if (cell.w > 35 && cell.h > 20) {
      div.innerHTML = `<span class="tm-name">${cell.name}</span>`;
    }
    if (typeof onClick === 'function') {
      div.onclick = () => {
        onClick({ canvasId: containerId, name: cell.name, count: cell.value, index: idx, items: limited, others: cell._others });
      };
    }
    container.appendChild(div);
  });
}

function initWorkDashboard() {
  disableChartAnimationsGlobally();

  function _waitLinkLoaded(linkEl, timeoutMs) {
    return new Promise(function(resolve) {
      if (!linkEl) return resolve();
      try {
        if (linkEl.sheet && linkEl.sheet.cssRules != null) return resolve();
      } catch (_) {
        // Cross-origin/access timing can throw; still treat as not-ready and wait events.
      }
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        resolve();
      }
      linkEl.addEventListener('load', finish, { once: true });
      linkEl.addEventListener('error', finish, { once: true });
      setTimeout(finish, Number(timeoutMs) || 2000);
    });
  }

  function _ensureRequiredStyles() {
    var required = [
      { base: '/static/css/capex_executive.css', full: '/static/css/capex_executive.css?v=20260316a' },
      { base: '/static/css/dashboard_add.css', full: '/static/css/dashboard_add.css?v=20251109-1' }
    ];
    var waits = [];

    required.forEach(function(item) {
      var links = Array.prototype.slice.call(document.querySelectorAll('link[rel="stylesheet"][href]'));
      var found = links.find(function(l) {
        var h = l.getAttribute('href') || '';
        return h.indexOf(item.base) >= 0;
      });

      if (!found) {
        found = document.createElement('link');
        found.rel = 'stylesheet';
        found.href = item.full;
        document.head.appendChild(found);
      }
      waits.push(_waitLinkLoaded(found, 2600));
    });

    return Promise.all(waits);
  }

  function _pinGridLayout() {
    try {
      var grid = document.getElementById('work-dash-grid') || document.querySelector('#work-dashboard-root .work-dash-grid');
      if (!grid) return;

      var w = window.innerWidth || document.documentElement.clientWidth || 1920;
      var isMobile = w <= 1200;

      if (isMobile) {
        grid.style.setProperty('display', 'grid', 'important');
        grid.style.setProperty('grid-template-columns', '1fr', 'important');
        grid.style.setProperty('grid-template-rows', 'none', 'important');
        grid.style.setProperty('gap', '20px', 'important');

        ['wd-card-classification','wd-card-division','wd-card-group','wd-card-operation','wd-card-status'].forEach(function(id) {
          var el = document.getElementById(id);
          if (!el) return;
          el.style.setProperty('grid-column', 'auto', 'important');
          el.style.setProperty('grid-row', 'auto', 'important');
          el.style.setProperty('min-width', '0', 'important');
        });
        return;
      }

      // Desktop: lock to fixed 3-column composition.
      grid.style.setProperty('display', 'grid', 'important');
      grid.style.setProperty('grid-template-columns', 'repeat(3, minmax(0, 1fr))', 'important');
      grid.style.setProperty('grid-template-rows', 'auto auto', 'important');
      grid.style.setProperty('gap', '20px', 'important');
      grid.style.setProperty('align-items', 'stretch', 'important');

      var c1 = document.getElementById('wd-card-classification');
      var c2 = document.getElementById('wd-card-division');
      var c3 = document.getElementById('wd-card-group');
      var c4 = document.getElementById('wd-card-operation');
      var c5 = document.getElementById('wd-card-status');

      if (c1) {
        c1.style.setProperty('grid-column', '1', 'important');
        c1.style.setProperty('grid-row', '1', 'important');
        c1.style.setProperty('min-width', '0', 'important');
      }
      if (c2) {
        c2.style.setProperty('grid-column', '2', 'important');
        c2.style.setProperty('grid-row', '1', 'important');
        c2.style.setProperty('min-width', '0', 'important');
      }
      if (c3) {
        c3.style.setProperty('grid-column', '3', 'important');
        c3.style.setProperty('grid-row', '1 / 3', 'important');
        c3.style.setProperty('min-width', '0', 'important');
      }
      if (c4) {
        c4.style.setProperty('grid-column', '1', 'important');
        c4.style.setProperty('grid-row', '2', 'important');
        c4.style.setProperty('min-width', '0', 'important');
      }
      if (c5) {
        c5.style.setProperty('grid-column', '2', 'important');
        c5.style.setProperty('grid-row', '2', 'important');
        c5.style.setProperty('min-width', '0', 'important');
      }
    } catch (_) {}
  }

  _pinGridLayout();
  window.addEventListener('resize', _pinGridLayout);
  const API = {
    classification: '/api/work-categories',
    division: '/api/work-divisions',
    status: '/api/work-statuses',
    operation: '/api/work-operations',
    group: '/api/work-groups'
  };

  async function fetchJson(url) {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data && data.message ? data.message : 'Failed to load');
    }
    return data;
  }

  function toNonNegInt(val) {
    const n = parseInt(val, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function toText(val) {
    return (val == null ? '' : String(val).trim());
  }

  function mapToCountItems(items, nameKeyCandidates) {
    const out = [];
    (items || []).forEach((row) => {
      const nameKey = (nameKeyCandidates || []).find((k) => row && row[k] != null);
      const name = toText(nameKey ? row[nameKey] : row?.wc_name);
      if (!name) return;
      const hw = toNonNegInt(row?.hw_count);
      const sw = toNonNegInt(row?.sw_count);
      // Dashboard's "건" is treated as the sum of HW+SW counts.
      const count = hw + sw;
      out.push({ name, count });
    });
    return out;
  }

  function mapToGroupXY(items) {
    const out = [];
    (items || []).forEach((row) => {
      const name = toText(row?.wc_name ?? row?.group_name);
      if (!name) return;
      out.push({
        name,
        hw: toNonNegInt(row?.hw_count),
        sw: toNonNegInt(row?.sw_count)
      });
    });
    return out;
  }

  // Simple data panel to show clicked chart segment
  function ensureDataPanel() {
    let panel = document.getElementById('work-data-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'work-data-panel';
      panel.style.position = 'fixed';
      panel.style.right = '24px';
      panel.style.bottom = '24px';
      panel.style.width = '320px';
      panel.style.maxHeight = '50vh';
      panel.style.overflow = 'auto';
      panel.style.background = '#ffffff';
      panel.style.border = '1px solid #e5e7eb';
      panel.style.borderRadius = '12px';
      panel.style.boxShadow = '0 10px 25px rgba(0,0,0,0.12)';
      panel.style.padding = '16px';
      panel.style.zIndex = '1000';
      panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;"><strong>선택 데이터</strong><button id="work-data-close" style="border:none;background:#f3f4f6;border-radius:8px;padding:6px 8px;cursor:pointer;">닫기</button></div><div id="work-data-content" style="font-size:13px;color:#334155;"></div>';
      document.body.appendChild(panel);
      const closeBtn = panel.querySelector('#work-data-close');
      if (closeBtn) closeBtn.addEventListener('click', ()=>{ panel.remove(); });
    }
    return panel;
  }
  function showData(payload) {
    const panel = ensureDataPanel();
    const box = panel.querySelector('#work-data-content');
    if (!box) return;
    const { canvasId, name, count, others } = payload || {};
    const titleMap = {
      'chart-classification': '업무 분류',
      'chart-division': '업무 구분',
      'chart-status': '업무 상태',
      'chart-operation': '업무 운영',
      'chart-group': '업무 그룹'
    };
    const sec = titleMap[canvasId] || canvasId;
    let html = `<div style="margin:4px 0 8px; color:#0f172a; font-weight:700;">${sec}</div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#6366f1;"></span><span>${name}</span><span style="margin-left:auto; font-weight:600;">${count.toLocaleString('ko-KR')} 건</span></div>`;
    if (name === '기타' && Array.isArray(others) && others.length) {
      html += '<div style="margin-top:8px;border-top:1px solid #e5e7eb;padding-top:8px;">';
      html += '<div style="font-weight:600;color:#334155;margin-bottom:6px;">기타 상세</div>';
    // 5x2 grid: show up to 10 items (5 per row)
    const __list = others.slice(0, 10);
    html += '<div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;">';
    html += __list.map(o => `
          <div style="display:flex;align-items:center;gap:6px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:4px 6px;min-width:0;font-size:12px;">
            <span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${o.name}</span>
              <span style="color:#475569;font-variant-numeric:tabular-nums;">${(((o.count != null ? o.count : ((o.hw || 0) + (o.sw || 0)))) || 0).toLocaleString('ko-KR')} 건</span>
          </div>
        `).join('');
        html += '</div>';
      html += '</div>';
    }
    box.innerHTML = html;
  }
  async function loadDashboardData() {
    var empty = { classification: [], division: [], status: [], operation: [], group: [] };
    try {
      const [cat, div, st, op, grp] = await Promise.all([
        fetchJson(API.classification),
        fetchJson(API.division),
        fetchJson(API.status),
        fetchJson(API.operation),
        fetchJson(API.group)
      ]);
      return {
        classification: mapToCountItems(cat.items, ['wc_name', 'category_name']),
        division: mapToCountItems(div.items, ['wc_name', 'division_name']),
        status: mapToCountItems(st.items, ['wc_name', 'status_name']),
        operation: mapToCountItems(op.items, ['wc_name', 'operation_name']),
        group: mapToGroupXY(grp.items)
      };
    } catch (e) {
      console.warn('[work_dashboard] API error:', e);
      return empty;
    }
  }

  const onSegClick = (p)=> showData(p);

  // Wait until dashboard chart containers have measurable size.
  // This is more reliable than checking stylesheet load events during SPA swaps.
  function _waitForLayoutReady(timeoutMs) {
    var timeout = Number(timeoutMs) || 2600;
    return new Promise(function(resolve) {
      var t0 = Date.now();
      function ready() {
        var box = document.querySelector('.work-dash-grid .chart-wrap-inner');
        if (!box) return false;
        return (box.clientWidth || 0) >= 180 && (box.clientHeight || 0) >= 180;
      }
      function tick() {
        if (ready() || (Date.now() - t0) >= timeout) return resolve();
        requestAnimationFrame(tick);
      }
      tick();
    });
  }

  Promise.all([loadDashboardData(), _ensureRequiredStyles()])
  .then(function(results) {
    var data = results[0];
    return _waitForLayoutReady(3200).then(function() { return data; });
  })
  .then(function(data) {
    _pinGridLayout();

    function _resizeCharts() {
      ['chart-classification', 'chart-division', 'chart-operation', 'chart-status'].forEach(function(id) {
        try {
          var cv = document.getElementById(id);
          if (!cv) return;
          fixCanvasSize(cv);
          var inst = Chart.getChart(cv);
          if (inst) { inst.resize(); inst.update('none'); }
        } catch (_) {}
      });
    }

    function doRender() {
      _pinGridLayout();
      // 분류 → 파이 (Top5+기타)
      if ((data.classification || []).length) renderPie('chart-classification', data.classification, onSegClick, { topN: 5 });
      // 구분 → 도넛 (Top5+기타)
      if ((data.division || []).length) renderDoughnut('chart-division', data.division, onSegClick, { showCenter: false, topN: 5 });
      // 운영 → 세로 막대
      var opItems = (data.operation || []).filter(x => (x.count || 0) > 0);
      if (opItems.length) renderBarVertical('chart-operation', opItems, onSegClick);
      // 그룹 → 트리맵 (HW/SW, Top10)
      if ((data.group || []).length) renderTreemap('chart-group', data.group, onSegClick, { topN: 10 });
      // 상태 → 가로 막대
      var stItems = (data.status || []).filter(x => (x.count || 0) > 0);
      if (stItems.length) renderBarHorizontal('chart-status', stItems, onSegClick);

      // Staged reflow fix for late CSS/layout settlement during SPA navigation.
      [60, 180, 420, 900, 1500, 2600, 3600].forEach(function(ms) {
        setTimeout(function() {
          _pinGridLayout();
          _resizeCharts();
        }, ms);
      });
    }

    doRender();

    // SPA 전환 직후 사이드바/메인 폭 전환 애니메이션으로 레이아웃이 늦게 확정되는 경우를 보정한다.
    document.addEventListener('blossom:pageLoaded', function(ev) {
      try {
        var href = (ev && ev.detail && ev.detail.href) ? String(ev.detail.href) : '';
        if (href.indexOf('/p/cat_business_dashboard') < 0) return;
      } catch (_) {
        return;
      }
      [40, 160, 360, 760, 1300, 2200].forEach(function(ms) {
        setTimeout(function() {
          _pinGridLayout();
          _resizeCharts();
        }, ms);
      });
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWorkDashboard);
} else {
  initWorkDashboard();
}
})();

