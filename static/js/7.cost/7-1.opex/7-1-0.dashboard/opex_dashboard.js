/**
 * OPEX Executive Dashboard  v1.0  2025-07-15
 * KPI cards · Trend stacked bar · Donut (status) · Pie (vendor)
 * FY / Quarter dropdown filter
 */
(function () {
  'use strict';

  /* ── palette (dashboard aligned) ── */
  var COLORS = [
    '#6366f1', '#818cf8', '#a78bfa', '#3b82f6', '#64748b',
    '#6b7fa8', '#9aa9bf', '#8b5cf6', '#94a3b8', '#475569'
  ];
  var MUTED_ALPHA = 0.28;
  function color(i) { return COLORS[i % COLORS.length]; }

  /* ── 하드웨어 / 소프트웨어 고정 범주 순서 & 색상 ── */
  var HW_CATEGORIES = [
    { name: '서버',     color: '#6366f1' },
    { name: '스토리지', color: '#818cf8' },
    { name: 'SAN',      color: '#a78bfa' },
    { name: '네트워크', color: '#3b82f6' },
    { name: '보안장비', color: '#6b7fa8' },
    { name: '부품',     color: '#94a3b8' }
  ];
  var SW_CATEGORIES = [
    { name: '운영체제',   color: '#6366f1' },
    { name: '데이터베이스', color: '#818cf8' },
    { name: '미들웨어',   color: '#a78bfa' },
    { name: '가상화',     color: '#3b82f6' },
    { name: '보안S/W',    color: '#6b7fa8' },
    { name: '고가용성',   color: '#94a3b8' }
  ];

  /* ── shared tooltip style ── */
  var TOOLTIP_STYLE = {
    backgroundColor: 'rgba(17,24,39,.88)',
    titleFont: { size: 13, weight: '600' },
    bodyFont: { size: 12 },
    padding: { top: 10, bottom: 10, left: 14, right: 14 },
    cornerRadius: 8,
    displayColors: true,
    boxPadding: 4
  };

  /* ── helpers ── */
  function fmtAmt(v) {
    if (v == null) return '-';
    if (v >= 1e8) { var a = Math.round(v / 1e8); return a.toLocaleString() + '억'; }
    if (v >= 1e4) return Math.round(v / 1e4).toLocaleString() + '만';
    return v.toLocaleString();
  }
  function fmtFull(v) { return v == null ? '-' : v.toLocaleString() + '원'; }
  function toFY(yr) { return 'FY' + String(yr).slice(-2); }

  function fetchJson(url) {
    return fetch(url, { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.json(); });
  }

  /* ── chart instances ── */
  var chartDivision = null, chartStatus = null, chartVendor = null;
  var chartHwDetail = null, chartSwDetail = null, chartEtcDetail = null;

  /* ════════════════════════ KPI ════════════════════════ */
  function renderKPI(kpi, currentYear, filterYear, filterQuarter) {
    var isFiltered = !!filterYear;
    var isQuarter = !!filterQuarter;
    var dispYear = isFiltered ? filterYear : currentYear;
    var fy = toFY(dispYear);
    var dispPrevYear = String(Number(dispYear) - 1);
    var fyPrev = toFY(dispPrevYear);
    var periodLabel = isQuarter ? fy + ' ' + filterQuarter : fy;

    /* 총 OPEX — 항상 5개년 합계 표시 */
    var labelTotal = document.getElementById('kpi-label-total');
    if (labelTotal) labelTotal.textContent = '총 OPEX (5개년)';
    document.getElementById('kpi-total').textContent = fmtAmt(kpi.total_opex);
    document.getElementById('kpi-total-count').textContent = '총 ' + kpi.contract_count + '건 계약';

    /* 올해 집행 */
    var labelThisYear = document.getElementById('kpi-label-this-year');
    if (labelThisYear) {
      if (isQuarter) labelThisYear.textContent = periodLabel + ' 집행';
      else if (isFiltered) labelThisYear.textContent = fy + ' 집행';
      else labelThisYear.textContent = '올해 집행';
    }
    document.getElementById('kpi-this-year').textContent = fmtAmt(kpi.this_year);
    document.getElementById('kpi-this-year-count').textContent =
      periodLabel + ' ' + kpi.this_year_count + '건';

    /* 전년 대비 / YoY */
    var labelYoy = document.getElementById('kpi-label-yoy');
    if (labelYoy) {
      if (isQuarter) labelYoy.textContent = fyPrev + ' ' + filterQuarter + ' 대비';
      else if (isFiltered) labelYoy.textContent = fyPrev + ' 대비';
      else labelYoy.textContent = '전년 대비';
    }
    document.getElementById('kpi-yoy-amount').textContent = fmtAmt(kpi.this_year);
    var yoyEl = document.getElementById('kpi-yoy');
    if (kpi.yoy_pct == null) {
      yoyEl.textContent = 'N/A';
      yoyEl.className = 'kpi-badge flat';
    } else {
      var up = kpi.yoy_pct >= 0;
      yoyEl.textContent = (up ? '▲ +' : '▼ ') + kpi.yoy_pct.toFixed(1) + '%';
      yoyEl.className = 'kpi-badge ' + (up ? 'up' : 'down');
    }

    /* QoQ */
    var labelQoq = document.getElementById('kpi-label-qoq');
    if (labelQoq) {
      if (isQuarter) {
        var qNum = parseInt(filterQuarter.substring(1), 10);
        var pqLabel, pqFy;
        if (qNum === 1) { pqLabel = 'Q4'; pqFy = fyPrev; }
        else { pqLabel = 'Q' + (qNum - 1); pqFy = fy; }
        labelQoq.textContent = pqFy + ' ' + pqLabel + ' 대비';
      } else if (isFiltered) {
        labelQoq.textContent = fy + ' 분기 대비';
      } else {
        labelQoq.textContent = '분기 대비';
      }
    }
    document.getElementById('kpi-qoq-amount').textContent = fmtAmt(kpi.cur_q_amount);
    var qoqEl = document.getElementById('kpi-qoq');
    if (kpi.qoq_pct == null) {
      qoqEl.textContent = 'N/A';
      qoqEl.className = 'kpi-badge flat';
    } else {
      var qUp = kpi.qoq_pct >= 0;
      qoqEl.textContent = (qUp ? '▲ +' : '▼ ') + kpi.qoq_pct.toFixed(1) + '%';
      qoqEl.className = 'kpi-badge ' + (qUp ? 'up' : 'down');
    }
    var qLabel = document.getElementById('kpi-qoq-label');
    qLabel.firstChild.textContent = (kpi.qoq_quarter || 'Q?') + ' QoQ 증감률 ';
  }

  /* ════════════════════════ STACKED BAR — 계약 구분 (full-width) ════════════════════════ */

  var DIVISION_ORDER = ['하드웨어', '소프트웨어', '기타'];
  var DIVISION_COLORS = { '하드웨어': '#6366f1', '소프트웨어': '#818cf8', '기타': '#94a3b8' };
  var MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  function divColor(name) { return DIVISION_COLORS[name] || '#94a3b8'; }

  function renderDivision(divisionData, years, currentYear, filterYear, filterQuarter) {
    var nameSet = {};
    divisionData.forEach(function (r) { nameSet[r.name] = true; });
    var names = DIVISION_ORDER.filter(function (n) { return nameSet[n]; });
    Object.keys(nameSet).forEach(function (n) { if (names.indexOf(n) === -1) names.push(n); });

    var isMonthly = !!filterYear;
    var isQuarter = !!filterQuarter;
    var xLabels, datasets;

    if (isQuarter) {
      var qNum = parseInt(filterQuarter.substring(1), 10);
      var startMonth = (qNum - 1) * 3;
      xLabels = MONTH_LABELS.slice(startMonth, startMonth + 3);
      var monthKeys = [
        String(startMonth + 1).padStart(2, '0'),
        String(startMonth + 2).padStart(2, '0'),
        String(startMonth + 3).padStart(2, '0')
      ];
      datasets = names.map(function (name, i) {
        var data = monthKeys.map(function (m) {
          var found = divisionData.find(function (r) { return r.month === m && r.name === name; });
          return found ? found.amount : 0;
        });
        return {
          label: name, data: data, backgroundColor: divColor(name),
          borderRadius: 0, borderSkipped: false, barPercentage: 0.52, categoryPercentage: 0.65
        };
      });
    } else if (isMonthly) {
      xLabels = MONTH_LABELS;
      var monthKeys12 = ['01','02','03','04','05','06','07','08','09','10','11','12'];
      datasets = names.map(function (name, i) {
        var data = monthKeys12.map(function (m) {
          var found = divisionData.find(function (r) { return r.month === m && r.name === name; });
          return found ? found.amount : 0;
        });
        return {
          label: name, data: data, backgroundColor: divColor(name),
          borderRadius: 0, borderSkipped: false, barPercentage: 0.52, categoryPercentage: 0.65
        };
      });
    } else {
      xLabels = years;
      datasets = names.map(function (name, i) {
        var data = years.map(function (yr) {
          var found = divisionData.find(function (r) { return r.year === yr && r.name === name; });
          return found ? found.amount : 0;
        });
        var baseColor = divColor(name);
        var bgColors = years.map(function (yr) {
          return yr === currentYear
            ? baseColor
            : baseColor + Math.round(MUTED_ALPHA * 255).toString(16).padStart(2, '0');
        });
        return {
          label: name, data: data, backgroundColor: bgColors,
          borderRadius: 0, borderSkipped: false, barPercentage: 0.52, categoryPercentage: 0.65
        };
      });
    }

    var ctx = document.getElementById('barDivision');
    if (chartDivision) chartDivision.destroy();
    chartDivision = new Chart(ctx, {
      type: 'bar',
      data: { labels: xLabels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, TOOLTIP_STYLE, {
            callbacks: {
              label: function (c) { return ' ' + c.dataset.label + '  ' + fmtFull(c.raw); }
            }
          })
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 12, weight: '500' }, color: '#9ca3af' }, border: { display: true, color: '#d7dde7' } },
          y: {
            stacked: true,
            ticks: { maxTicksLimit: 5, callback: function (v) { return fmtAmt(v); }, font: { size: 11 }, color: '#9ca3af', padding: 8 },
            grid: { color: 'rgba(0,0,0,0)', drawTicks: false },
            border: { display: true, color: '#d7dde7' }
          }
        }
      }
    });

    var legendEl = document.getElementById('legend-division');
    if (legendEl) {
      legendEl.innerHTML = names.map(function (name, i) {
        return '<span class="legend-item">' +
          '<span class="legend-swatch" style="background:' + divColor(name) + '"></span>' +
          name + '</span>';
      }).join('');
    }
  }

  /* ════════════════════════ DONUT — 계약 상태 ════════════════════════ */
  var STATUS_ORDER = ['예정', '계약', '만료', '해지'];
  var STATUS_COLORS = { '예정': '#f59e0b', '계약': '#6366f1', '만료': '#94a3b8', '해지': '#ef4444' };

  function renderContractStatus(statusData) {
    var nameSet = {};
    statusData.forEach(function (r) { nameSet[r.name] = true; });
    var orderedNames = STATUS_ORDER.filter(function (n) { return nameSet[n]; });
    Object.keys(nameSet).forEach(function (n) { if (orderedNames.indexOf(n) === -1) orderedNames.push(n); });
    var labels = orderedNames;
    var data = labels.map(function (name) {
      return statusData.filter(function (r) { return r.name === name; }).reduce(function (s, r) { return s + r.amount; }, 0);
    });

    var ctx = document.getElementById('donutContractStatus');
    if (chartStatus) chartStatus.destroy();
    chartStatus = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: labels.map(function (n) { return STATUS_COLORS[n] || color(labels.indexOf(n)); }),
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 8,
          hoverBorderWidth: 0,
          spacing: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        animation: { animateRotate: true, duration: 800 },
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, TOOLTIP_STYLE, {
            callbacks: {
              label: function (c) {
                var total = c.dataset.data.reduce(function (s, v) { return s + v; }, 0);
                var pct = total ? ((c.raw / total) * 100).toFixed(1) : 0;
                return ' ' + c.label + '  ' + fmtAmt(c.raw) + ' (' + pct + '%)';
              }
            }
          })
        }
      }
    });

    var legendEl = document.getElementById('legend-contract-status');
    if (legendEl) {
      legendEl.innerHTML = labels.map(function (name) {
        return '<span class="legend-item">' +
          '<span class="legend-swatch" style="background:' + (STATUS_COLORS[name] || '#9ca3af') + '"></span>' +
          name + '</span>';
      }).join('');
    }
  }

  /* ════════════════════════ HORIZONTAL BAR — 유지보수 업체 ════════════════════════ */
  function renderVendorBar(vendorData) {
    // Top 5 + 기타 (others combined)
    var sorted = vendorData.slice().sort(function (a, b) { return (b.amount || 0) - (a.amount || 0); });
    var top5 = sorted.slice(0, 5);
    var rest = sorted.slice(5);
    var displayData = top5.slice();
    if (rest.length > 0) {
      var etcAmount = rest.reduce(function (s, r) { return s + (r.amount || 0); }, 0);
      displayData.push({ name: '기타', amount: etcAmount });
    }
    var labels = displayData.map(function (r) { return r.name; });
    var data = displayData.map(function (r) { return r.amount; });

    var ctx = document.getElementById('barVendor');
    if (chartVendor) chartVendor.destroy();
    chartVendor = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: labels.map(function (lbl, i) {
            return lbl === '기타' ? '#94a3b8' : color(i);
          }),
          borderRadius: 4,
          barPercentage: 0.6,
          categoryPercentage: 0.7
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, TOOLTIP_STYLE, {
            callbacks: {
              label: function (c) { return '  ' + fmtFull(c.raw); }
            }
          })
        },
        scales: {
          x: {
            ticks: { callback: function (v) { return fmtAmt(v); }, font: { size: 11 }, color: '#9ca3af' },
            grid: { color: 'rgba(0,0,0,0.04)' },
            border: { display: false }
          },
          y: {
            ticks: { font: { size: 12, weight: '500' }, color: '#374151' },
            grid: { display: false },
            border: { display: false }
          }
        }
      }
    });
  }

  /* ════════════════════════ TABLE — 계약 목록 (신규/변경/만료) ════════════════════════ */
  var STATUS_PILL = {
    '계약': 'completed',
    '만료': 'planned',
    '해지': 'default'
  };
  function renderContractTable(rows, tableId) {
    var tbl = document.getElementById(tableId);
    if (!tbl) return;
    var tbody = tbl.querySelector('tbody');
    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:24px">데이터 없음</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      return '<tr>' +
        '<td>' + (r.name || '-') + '</td>' +
        '<td>' + (r.code || '-') + '</td>' +
        '<td>' + (r.vendor || '-') + '</td>' +
        '<td style="text-align:right">' + (r.qty !== '-' ? Number(r.qty).toLocaleString() : '-') + '</td>' +
        '<td style="text-align:right">' + Number(r.amount).toLocaleString() + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ════════════════════════ PIE — 하드웨어 / 소프트웨어 / 기타 상세 ════════════════════════ */
  function renderDetailPie(data, canvasId, legendId, chartRef, fixedCategories) {
    var labels, vals, bgColors;

    if (fixedCategories) {
      /* 고정 범주 순서 사용 — 데이터를 name→amount 맵으로 변환 */
      var dataMap = {};
      data.forEach(function (r) { dataMap[r.name] = (dataMap[r.name] || 0) + r.amount; });
      labels = [];
      vals = [];
      bgColors = [];
      fixedCategories.forEach(function (cat) {
        labels.push(cat.name);
        vals.push(dataMap[cat.name] || 0);
        bgColors.push(cat.color);
      });
    } else {
      labels = data.map(function (r) { return r.name; });
      vals = data.map(function (r) { return r.amount; });
      bgColors = labels.map(function (_, i) { return color(i); });
    }

    var ctx = document.getElementById(canvasId);
    if (chartRef) chartRef.destroy();
    var chart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: vals,
          backgroundColor: bgColors,
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 8,
          hoverBorderWidth: 0,
          spacing: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { animateRotate: true, duration: 800 },
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, TOOLTIP_STYLE, {
            callbacks: {
              label: function (c) {
                var total = c.dataset.data.reduce(function (s, v) { return s + v; }, 0);
                var pct = total ? ((c.raw / total) * 100).toFixed(1) : 0;
                return ' ' + c.label + '  ' + fmtAmt(c.raw) + ' (' + pct + '%)';
              }
            }
          })
        }
      }
    });

    var legendEl = document.getElementById(legendId);
    if (legendEl) {
      if (labels.length === 0) {
        legendEl.innerHTML = '<span class="legend-item" style="color:#9ca3af">데이터 없음</span>';
      } else {
        legendEl.innerHTML = labels.map(function (name, i) {
          return '<span class="legend-item">' +
            '<span class="legend-swatch" style="background:' + bgColors[i] + '"></span>' +
            name + '</span>';
        }).join('');
      }
    }
    return chart;
  }

  /* ════════════════════════ FY / QUARTER FILTER ════════════════════════ */
  var selectedYear = '';
  var selectedQuarter = '';

  function buildPeriodDropdown(years) {
    var sel = document.getElementById('yearFilter');
    if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);
    var sorted = years.slice().sort(function (a, b) { return Number(b) - Number(a); });
    sorted.forEach(function (yr) {
      var fy = toFY(yr);
      var opt = document.createElement('option');
      opt.value = yr;
      opt.textContent = fy;
      sel.appendChild(opt);
      ['Q1', 'Q2', 'Q3', 'Q4'].forEach(function (q) {
        var qopt = document.createElement('option');
        qopt.value = yr + '-' + q;
        qopt.textContent = '\u00A0\u00A0' + fy + ' ' + q;
        sel.appendChild(qopt);
      });
    });
    var curVal = selectedYear ? (selectedQuarter ? selectedYear + '-' + selectedQuarter : selectedYear) : '';
    sel.value = curVal;
    sel.onchange = function () {
      var v = sel.value;
      if (!v) {
        selectedYear = '';
        selectedQuarter = '';
      } else if (v.indexOf('-') !== -1) {
        var parts = v.split('-');
        selectedYear = parts[0];
        selectedQuarter = parts[1];
      } else {
        selectedYear = v;
        selectedQuarter = '';
      }
      refresh();
    };
  }

  /* ════════════════════════ 계약 전체/활성 수량 Stacked Bar ════════════════════════ */
  var chartQtyStacked = null;
  var QTY_STATUSES = ['예정', '계약', '만료', '해지'];
  var QTY_STATUS_COLORS = { '예정': '#f59e0b', '계약': '#6366f1', '만료': '#94a3b8', '해지': '#ef4444' };
  var QTY_TYPE_MAP = { 'HW': '하드웨어', 'SW': '소프트웨어', 'ETC': '기타 사용료' };

  async function renderContractQtyBars() {
    try {
      var types = ['HW', 'SW', 'ETC'];
      var labels = types.map(function (t) { return QTY_TYPE_MAP[t]; });

      /* fetch all OPEX contracts */
      var res = await fetchJson('/api/opex-contracts');
      var allContracts = (res && Array.isArray(res.items)) ? res.items : [];
      var grandTotal = allContracts.length;

      /* For each contract, fetch its tab61 line items and collect statuses */
      var currentYear = new Date().getFullYear();
      var linesByType = { HW: [], SW: [], ETC: [] };

      for (var ci = 0; ci < allContracts.length; ci++) {
        var c = allContracts[ci];
        var t = c.opex_type || '';
        if (!linesByType[t]) continue;
        try {
          var lRes = await fetchJson('/api/cost-contract-lines?scope=OPEX&cost_type=' + t +
            '&contract_id=' + c.id + '&year=' + currentYear);
          var lines = (lRes && Array.isArray(lRes.items)) ? lRes.items : [];
          linesByType[t] = linesByType[t].concat(lines);
        } catch (e) { /* skip */ }
      }

      /* Build stacked datasets: each status = one dataset */
      var datasets = QTY_STATUSES.map(function (status) {
        var data = types.map(function (type) {
          return linesByType[type].filter(function (ln) {
            return ln.contract_status === status;
          }).length;
        });
        return {
          label: status,
          data: data,
          backgroundColor: QTY_STATUS_COLORS[status],
          borderRadius: 4,
          barPercentage: 0.6,
          categoryPercentage: 0.7
        };
      });

      var ctx = document.getElementById('barQtyStacked');
      if (!ctx) return;
      if (chartQtyStacked) chartQtyStacked.destroy();
      chartQtyStacked = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: datasets },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: { boxWidth: 12, padding: 10, font: { size: 11 } }
            },
            tooltip: {
              callbacks: {
                label: function (tip) {
                  return tip.dataset.label + ': ' + (tip.raw || 0).toLocaleString();
                }
              }
            }
          },
          scales: {
            x: {
              stacked: true,
              grid: { display: false },
              ticks: { stepSize: 1, font: { size: 11 } }
            },
            y: {
              stacked: true,
              grid: { display: false },
              ticks: { font: { size: 12 } }
            }
          }
        }
      });

      var countEl = document.getElementById('qty-contract-count');
      if (countEl) countEl.textContent = grandTotal.toLocaleString();
    } catch (e) {
      console.error('[opex-dashboard] contract qty bars', e);
    }
  }

  /* ════════════════════════ MAIN ════════════════════════ */
  async function refresh() {
    try {
      var url = '/api/opex-dashboard?_ts=' + Date.now();
      if (selectedYear) url += '&year=' + selectedYear;
      if (selectedQuarter) url += '&quarter=' + selectedQuarter;
      var d = await fetchJson(url);
      if (!d || !d.success) return;

      renderKPI(d.kpi, d.current_year, d.filter_year || '', d.filter_quarter || '');
      renderDivision(d.division_data || [], d.years || [], d.current_year, d.filter_year || '', d.filter_quarter || '');
      renderContractStatus(d.status_data || []);
      chartHwDetail = renderDetailPie(d.hw_detail || [], 'pieHwDetail', 'legend-hw-detail', chartHwDetail, HW_CATEGORIES);
      chartSwDetail = renderDetailPie(d.sw_detail || [], 'pieSwDetail', 'legend-sw-detail', chartSwDetail, SW_CATEGORIES);
      chartEtcDetail = renderDetailPie(d.etc_detail || [], 'pieEtcDetail', 'legend-etc-detail', chartEtcDetail);
      renderVendorBar(d.vendor_data || []);
      renderContractQtyBars();

      buildPeriodDropdown(d.years || []);
    } catch (e) {
      console.error('[opex-dashboard]', e);
    }
  }

  function init() { refresh(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
