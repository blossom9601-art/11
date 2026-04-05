/* ============================================================
 *  MiniChart — 경량 SVG 차트 위젯 (외부 라이브러리 없음)
 *  ============================================================
 *  bar(수직 막대), donut(도넛), sparkline(라인) 3종 지원.
 *  Usage:
 *    MiniChart.bar(container, data, opts)
 *    MiniChart.donut(container, data, opts)
 *    MiniChart.sparkline(container, data, opts)
 * ============================================================ */

import { esc } from '../shared/dom-utils.js';

const PALETTE = [
  '#4f6ef7','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#ec4899','#84cc16','#f97316','#6366f1'
];

function uid() { return 'mc' + Math.random().toString(36).slice(2, 8); }

export const MiniChart = {
  /**
   * 수직 막대 차트
   * @param {HTMLElement} el
   * @param {Array<{label:string, value:number}>} data
   * @param {{width?:number, height?:number, title?:string}} opts
   */
  bar(el, data, opts = {}) {
    const w = opts.width || el.clientWidth || 400;
    const h = opts.height || 220;
    const pad = { top: 20, right: 12, bottom: 40, left: 48 };
    const maxVal = Math.max(...data.map(d => d.value), 1);
    const barW = Math.max(12, Math.min(40, (w - pad.left - pad.right) / data.length - 4));
    const chartH = h - pad.top - pad.bottom;

    let bars = '';
    let labels = '';
    data.forEach((d, i) => {
      const x = pad.left + i * ((w - pad.left - pad.right) / data.length) + barW / 4;
      const barH = (d.value / maxVal) * chartH;
      const y = pad.top + chartH - barH;
      const color = PALETTE[i % PALETTE.length];
      bars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="3">
        <title>${esc(d.label)}: ${d.value.toLocaleString()}</title></rect>`;
      labels += `<text x="${x + barW / 2}" y="${h - 8}" text-anchor="middle" font-size="11" fill="#6b7280">${esc(d.label.slice(0, 6))}</text>`;
    });

    /* Y축 눈금 (5단계) */
    let yAxis = '';
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      const val = Math.round(maxVal * (1 - i / 4));
      yAxis += `<line x1="${pad.left}" y1="${y}" x2="${w - pad.right}" y2="${y}" stroke="#e5e7eb" stroke-dasharray="3"/>`;
      yAxis += `<text x="${pad.left - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#9ca3af">${val.toLocaleString()}</text>`;
    }

    const title = opts.title ? `<text x="${w / 2}" y="14" text-anchor="middle" font-size="13" font-weight="600" fill="#374151">${esc(opts.title)}</text>` : '';

    el.innerHTML = `<svg width="${w}" height="${h}" class="spa-minichart">${title}${yAxis}${bars}${labels}</svg>`;
  },

  /**
   * 도넛 차트
   * @param {HTMLElement} el
   * @param {Array<{label:string, value:number}>} data
   * @param {{size?:number, title?:string}} opts
   */
  donut(el, data, opts = {}) {
    const size = opts.size || 200;
    const cx = size / 2, cy = size / 2, r = size * 0.35, stroke = size * 0.12;
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    let cumAngle = -90;
    let paths = '';
    let legendHtml = '';

    data.forEach((d, i) => {
      const pct = d.value / total;
      const angle = pct * 360;
      const color = PALETTE[i % PALETTE.length];

      /* SVG arc */
      const startRad = (cumAngle * Math.PI) / 180;
      const endRad   = ((cumAngle + angle) * Math.PI) / 180;
      const x1 = cx + r * Math.cos(startRad);
      const y1 = cy + r * Math.sin(startRad);
      const x2 = cx + r * Math.cos(endRad);
      const y2 = cy + r * Math.sin(endRad);
      const large = angle > 180 ? 1 : 0;

      if (pct > 0.001) {
        paths += `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}"
          fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round">
          <title>${esc(d.label)}: ${d.value.toLocaleString()} (${(pct * 100).toFixed(1)}%)</title></path>`;
      }
      cumAngle += angle;

      legendHtml += `<div class="spa-chart-legend-item">
        <span class="spa-chart-legend-dot" style="background:${color}"></span>
        <span>${esc(d.label)}</span>
        <span class="spa-chart-legend-val">${d.value.toLocaleString()}</span>
      </div>`;
    });

    const center = `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="20" font-weight="700" fill="#374151">${total.toLocaleString()}</text>
      <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="11" fill="#9ca3af">전체</text>`;
    const title = opts.title ? `<h4 class="spa-chart-title">${esc(opts.title)}</h4>` : '';

    el.innerHTML = `${title}
      <div class="spa-donut-wrap">
        <svg width="${size}" height="${size}" class="spa-minichart">${paths}${center}</svg>
        <div class="spa-chart-legend">${legendHtml}</div>
      </div>`;
  },

  /**
   * 스파크라인 (미니 라인 차트)
   * @param {HTMLElement} el
   * @param {Array<number>} values
   * @param {{width?:number, height?:number, color?:string, label?:string}} opts
   */
  sparkline(el, values, opts = {}) {
    const w = opts.width || el.clientWidth || 200;
    const h = opts.height || 48;
    const pad = 4;
    const color = opts.color || PALETTE[0];
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;

    const points = values.map((v, i) => {
      const x = pad + (i / (values.length - 1 || 1)) * (w - pad * 2);
      const y = pad + (1 - (v - min) / range) * (h - pad * 2);
      return `${x},${y}`;
    }).join(' ');

    /* gradient fill */
    const gid = uid();
    const fill = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity=".2"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>`;

    const polyFill = `<polygon points="${pad},${h - pad} ${points} ${w - pad},${h - pad}" fill="url(#${gid})" />`;

    const label = opts.label ? `<span class="spa-sparkline-label">${esc(opts.label)}</span>` : '';

    el.innerHTML = `<div class="spa-sparkline-wrap">${label}
      <svg width="${w}" height="${h}" class="spa-minichart">${fill}${polyFill}
        <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      </svg></div>`;
  }
};
