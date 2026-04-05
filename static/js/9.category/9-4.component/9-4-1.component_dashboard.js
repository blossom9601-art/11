// Component dashboard (6 charts): 제조사 for CPU · MEMORY · DISK · GPU · NIC · HBA
// Clean implementation focused only on this page

(function () {
  'use strict';

  // Manufacturer palette: purple/blue gradient
  function makerPalette(n) {
    const base = ['#6366F1','#7C3AED','#8B5CF6','#A78BFA','#C084FC','#E879F9','#F472B6','#EC4899','#60A5FA','#22D3EE'];
    const out = [];
    for (let i = 0; i < n; i++) out.push(base[i % base.length]);
    return out;
  }

  // EOSL palette: green (정상), amber (임박), red (만료), gray (기타), then fallback
  function eoslPaletteForLabels(labels) {
    const map = { '정상': '#10B981', '임박': '#F59E0B', '만료': '#EF4444', '기타': '#94A3B8' };
    const fallback = ['#10B981','#F59E0B','#EF4444','#22C55E','#FB923C','#F43F5E'];
    const colors = [];
    (labels || []).forEach((name, i) => {
      const c = map[name];
      colors.push(c ? c : fallback[i % fallback.length]);
    });
    return colors;
  }

  function top10WithOthers(items) {
    const arr = (items || []).map(it => ({ name: String(it?.name ?? ''), count: Number(it?.count ?? 0) }));
    arr.sort((a, b) => b.count - a.count);
    if (arr.length <= 10) return arr;
    const top9 = arr.slice(0, 9);
    const rest = arr.slice(9);
    const restTotal = rest.reduce((s, x) => s + (Number(x.count) || 0), 0);
    if (restTotal > 0) top9.push({ name: '기타', count: restTotal, _others: rest });
    return top9;
  }

  function fixCanvasSize(canvas) {
    try {
      const container = canvas.closest('.chart-container') || canvas.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      canvas.width = Math.max(0, Math.floor(rect.width));
      canvas.height = Math.max(0, Math.floor(rect.height));
    } catch (_) {}
  }

  function buildLegend(card, canvasId, labels, values, colors) {
    if (!card) return;
    let legend = card.querySelector(`#${canvasId}-legend`);
    const container = card.querySelector('.chart-container');
    if (!legend && container) {
      legend = document.createElement('div');
      legend.id = `${canvasId}-legend`;
      legend.className = 'external-legend';
      container.insertAdjacentElement('afterend', legend);
      card.classList.add('has-legend');
    }
    if (!legend) return;
    legend.innerHTML = '';
    const list = (labels || []).map((name, i) => ({ name, count: values[i] || 0, color: colors[i] })).slice(0, 10);
    list.forEach((it) => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '8px';
      item.style.minWidth = '0';
      const sw = document.createElement('span');
      sw.style.display = 'inline-block';
      sw.style.width = '28px';
      sw.style.height = '10px';
      sw.style.borderRadius = '4px';
      sw.style.background = it.color;
      const lb = document.createElement('span');
      lb.textContent = it.name;
      lb.style.color = '#6b7280';
      lb.style.fontSize = '12px';
      lb.style.whiteSpace = 'nowrap';
      lb.style.overflow = 'hidden';
      lb.style.textOverflow = 'ellipsis';
      lb.title = `${it.name} ${(it.count || 0).toLocaleString('ko-KR')} 건`;
      item.appendChild(sw);
      item.appendChild(lb);
      legend.appendChild(item);
    });
  }

  function renderDoughnut(canvasId, items) {
    const el = document.getElementById(canvasId);
    if (!el || !window.Chart) return;
    const card = el.closest('.card.chart');
    if (card) card.classList.add('has-legend');
    fixCanvasSize(el);
    const limited = top10WithOthers(items);
    const labels = limited.map(x => x.name);
    const values = limited.map(x => x.count || 0);
  const colors = makerPalette(labels.length);
    const total = values.reduce((s, v) => s + (Number(v) || 0), 0);
    const chart = new Chart(el, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            callbacks: {
              label: (ctx) => {
                const val = ctx.raw ?? 0;
                const fmt = (n) => new Intl.NumberFormat('ko-KR').format(n);
                const pct = total ? Math.round((val / total) * 1000) / 10 : 0;
                return `${ctx.label}: ${fmt(val)} 건 (${pct}%)`;
              }
            }
          }
        }
      }
    });
    try { chart.stop(); chart.update(0); } catch (_) {}
    buildLegend(card, canvasId, labels, values, colors);
    // Refit after legend added
    requestAnimationFrame(() => { try { fixCanvasSize(el); chart.resize(); chart.update(0); } catch (_) {} });
  }

  function initComponentDashboard() {
    // Disable all animations globally
    try {
      if (window.Chart) {
        Chart.defaults.animation = false;
        Chart.defaults.transitions.active = { animation: { duration: 0 } };
      }
    } catch (_) {}

  // Sample datasets (제조사 분포)
    const data = {
      cpu: {
    makers: [ { name: 'Intel', count: 28 }, { name: 'AMD', count: 22 } ]
      },
      memory: {
    makers: [ { name: 'Samsung', count: 18 }, { name: 'SK hynix', count: 14 }, { name: 'Micron', count: 9 }, { name: 'Crucial', count: 5 }, { name: 'Kingston', count: 4 } ]
      },
      disk: {
    makers: [ { name: 'Seagate', count: 15 }, { name: 'Western Digital', count: 13 }, { name: 'Toshiba', count: 11 }, { name: 'Samsung', count: 11 } ]
      },
      gpu: {
    makers: [ { name: 'NVIDIA', count: 32 }, { name: 'AMD', count: 8 } ]
      },
      nic: {
    makers: [ { name: 'Intel', count: 18 }, { name: 'Broadcom', count: 16 }, { name: 'Mellanox', count: 16 } ]
      },
      hba: {
    makers: [ { name: 'QLogic', count: 18 }, { name: 'Emulex', count: 16 }, { name: 'Broadcom', count: 16 } ]
      }
    };

  renderDoughnut('chart-cpu-makers', data.cpu.makers);
  renderDoughnut('chart-memory-makers', data.memory.makers);
  renderDoughnut('chart-disk-makers', data.disk.makers);
  renderDoughnut('chart-gpu-makers', data.gpu.makers);
  renderDoughnut('chart-nic-makers', data.nic.makers);
  renderDoughnut('chart-hba-makers', data.hba.makers);
  }

  document.addEventListener('DOMContentLoaded', initComponentDashboard);
})();

