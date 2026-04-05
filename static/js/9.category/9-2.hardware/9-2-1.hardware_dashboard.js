// Hardware dashboard (10 charts): 제조사/뒤 EOSL for 서버·스토리지·SAN·네트워크·보안장비
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
    const isEosl = /-eosl$/.test(canvasId);
    const colors = isEosl ? eoslPaletteForLabels(labels) : makerPalette(labels.length);
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

  function initHardwareDashboard() {
    // Disable all animations globally
    try {
      if (window.Chart) {
        Chart.defaults.animation = false;
        Chart.defaults.transitions.active = { animation: { duration: 0 } };
      }
    } catch (_) {}

    // Sample datasets (제조사 / EOSL)
    const data = {
      server: {
        makers: [
          { name: 'Dell', count: 14 }, { name: 'HPE', count: 11 }, { name: 'Lenovo', count: 7 }, { name: 'IBM', count: 3 }
        ],
        eosl: [
          { name: '정상', count: 24 }, { name: '임박', count: 6 }, { name: '만료', count: 5 }
        ]
      },
      storage: {
        makers: [
          { name: 'NetApp', count: 9 }, { name: 'Dell EMC', count: 8 }, { name: 'HPE', count: 6 }, { name: 'Hitachi', count: 4 }
        ],
        eosl: [
          { name: '정상', count: 13 }, { name: '임박', count: 4 }, { name: '만료', count: 2 }
        ]
      },
      san: {
        makers: [
          { name: 'Brocade', count: 8 }, { name: 'Cisco', count: 6 }, { name: 'QLogic', count: 3 }
        ],
        eosl: [
          { name: '정상', count: 10 }, { name: '임박', count: 3 }, { name: '만료', count: 1 }
        ]
      },
      network: {
        makers: [
          { name: 'Cisco', count: 11 }, { name: 'HPE/Aruba', count: 7 }, { name: 'Juniper', count: 5 }, { name: 'F5', count: 3 }, { name: 'H3C', count: 2 }
        ],
        eosl: [
          { name: '정상', count: 18 }, { name: '임박', count: 5 }, { name: '만료', count: 4 }
        ]
      },
      security: {
        makers: [
          { name: 'Palo Alto', count: 5 }, { name: 'Fortinet', count: 6 }, { name: 'Cisco', count: 4 }, { name: 'Juniper', count: 3 }, { name: 'AhnLab', count: 3 }
        ],
        eosl: [
          { name: '정상', count: 12 }, { name: '임박', count: 4 }, { name: '만료', count: 5 }
        ]
      }
    };

    renderDoughnut('chart-server-makers', data.server.makers);
    renderDoughnut('chart-server-eosl', data.server.eosl);
    renderDoughnut('chart-storage-makers', data.storage.makers);
    renderDoughnut('chart-storage-eosl', data.storage.eosl);
    renderDoughnut('chart-san-makers', data.san.makers);
    renderDoughnut('chart-san-eosl', data.san.eosl);
    renderDoughnut('chart-network-makers', data.network.makers);
    renderDoughnut('chart-network-eosl', data.network.eosl);
    renderDoughnut('chart-security-makers', data.security.makers);
    renderDoughnut('chart-security-eosl', data.security.eosl);
  }

  document.addEventListener('DOMContentLoaded', initHardwareDashboard);
})();

