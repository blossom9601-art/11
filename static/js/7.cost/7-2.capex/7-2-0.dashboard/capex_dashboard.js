/**
 * CAPEX Executive Dashboard  v3.0  2025-07-15
 * KPI cards · Trend stacked bar · Donut · HBar · Bar · Table · Insights
 * FY / Quarter dropdown filter
 */
(function () {
  'use strict';

  /* ── palette (soft premium) ── */
  var COLORS = [
    '#6366f1', '#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e',
    '#eab308', '#f97316', '#ef4444', '#ec4899', '#8b5cf6'
  ];
  var MUTED_ALPHA = 0.28;
  function color(i) { return COLORS[i % COLORS.length]; }

  /* ── gradient helper ── */
  function makeGradient(ctx, c, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h || 320);
    g.addColorStop(0, c);
    g.addColorStop(1, c + '18');
    return g;
  }

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
  var chartDivision = null, chartContractType = null, chartSupplier = null, chartMfr = null;

  /* ════════════════════════ KPI ════════════════════════ */
  function renderKPI(kpi, currentYear, filterYear, filterQuarter) {
    var isFiltered = !!filterYear;
    var isQuarter = !!filterQuarter;
    var dispYear = isFiltered ? filterYear : currentYear;
    var fy = toFY(dispYear);
    var dispPrevYear = String(Number(dispYear) - 1);
    var fyPrev = toFY(dispPrevYear);
    var periodLabel = isQuarter ? fy + ' ' + filterQuarter : fy;

    /* 총 CAPEX — 항상 5개년 합계 표시 */
    var labelTotal = document.getElementById('kpi-label-total');
    if (labelTotal) labelTotal.textContent = '총 CAPEX (5개년)';
    document.getElementById('kpi-total').textContent = fmtAmt(kpi.total_capex);
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

  var DIVISION_ORDER = ['하드웨어', '소프트웨어', '부품', '기타'];
  var MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  function divColor(name, i) { return name === '기타' ? '#9ca3af' : color(i); }

  function renderDivision(divisionData, years, currentYear, filterYear, filterQuarter) {
    /* fixed order */
    var nameSet = {};
    divisionData.forEach(function (r) { nameSet[r.name] = true; });
    var names = DIVISION_ORDER.filter(function (n) { return nameSet[n]; });
    /* append any names not in the fixed list */
    Object.keys(nameSet).forEach(function (n) { if (names.indexOf(n) === -1) names.push(n); });

    var isMonthly = !!filterYear;
    var isQuarter = !!filterQuarter;
    var xLabels, datasets;

    if (isQuarter) {
      /* ── quarter view (3 months) ── */
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
          label: name, data: data, backgroundColor: divColor(name, i),
          borderRadius: 0, borderSkipped: false, barPercentage: 0.52, categoryPercentage: 0.65
        };
      });
    } else if (isMonthly) {
      /* ── monthly view (12 months) ── */
      xLabels = MONTH_LABELS;
      var monthKeys12 = ['01','02','03','04','05','06','07','08','09','10','11','12'];
      datasets = names.map(function (name, i) {
        var data = monthKeys12.map(function (m) {
          var found = divisionData.find(function (r) { return r.month === m && r.name === name; });
          return found ? found.amount : 0;
        });
        return {
          label: name, data: data, backgroundColor: divColor(name, i),
          borderRadius: 0, borderSkipped: false, barPercentage: 0.52, categoryPercentage: 0.65
        };
      });
    } else {
      /* ── yearly view (default) ── */
      xLabels = years;
      datasets = names.map(function (name, i) {
        var data = years.map(function (yr) {
          var found = divisionData.find(function (r) { return r.year === yr && r.name === name; });
          return found ? found.amount : 0;
        });
        var baseColor = divColor(name, i);
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

    /* custom HTML legend */
    var legendEl = document.getElementById('legend-division');
    if (legendEl) {
      legendEl.innerHTML = names.map(function (name, i) {
        return '<span class="legend-item">' +
          '<span class="legend-swatch" style="background:' + divColor(name, i) + '"></span>' +
          name + '</span>';
      }).join('');
    }
  }

  /* ════════════════════════ DONUT — 계약 유형 (analysis card) ════════════════════════ */
  var CTYPE_ORDER = ['구매/매입', '구축/제작', '영구사용권'];

  function renderContractType(ctypeData) {
    /* fixed order */
    var nameSet = {};
    ctypeData.forEach(function (r) { nameSet[r.name] = true; });
    var orderedNames = CTYPE_ORDER.filter(function (n) { return nameSet[n]; });
    Object.keys(nameSet).forEach(function (n) { if (orderedNames.indexOf(n) === -1) orderedNames.push(n); });
    var labels = orderedNames;
    var data = labels.map(function (name) {
      return ctypeData.filter(function (r) { return r.name === name; }).reduce(function (s, r) { return s + r.amount; }, 0);
    });

    var ctx = document.getElementById('donutContractType');
    if (chartContractType) chartContractType.destroy();
    chartContractType = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: labels.map(function (_, i) { return color(i); }),
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

    /* custom HTML legend */
    var legendEl = document.getElementById('legend-contract-type');
    if (legendEl) {
      legendEl.innerHTML = labels.map(function (name, i) {
        return '<span class="legend-item">' +
          '<span class="legend-swatch" style="background:' + color(i) + '"></span>' +
          name + '</span>';
      }).join('');
    }
  }

  /* ════════════════════════ PIE — 공급업체 ════════════════════════ */
  function renderSupplier(supplierData) {
    var top5 = supplierData.slice(0, 5);
    var rest = supplierData.slice(5);
    var labels = top5.map(function (r) { return r.name; });
    var data = top5.map(function (r) { return r.amount; });
    if (rest.length) {
      labels.push('기타');
      data.push(rest.reduce(function (s, r) { return s + r.amount; }, 0));
    }

    var ctx = document.getElementById('donutSupplier');
    if (chartSupplier) chartSupplier.destroy();
    chartSupplier = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: labels.map(function (_, i) { return color(i); }),
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

    var legendEl = document.getElementById('legend-supplier');
    if (legendEl) {
      legendEl.innerHTML = labels.map(function (name, i) {
        return '<span class="legend-item">' +
          '<span class="legend-swatch" style="background:' + color(i) + '"></span>' +
          name + '</span>';
      }).join('');
    }
  }

  /* ════════════════════════ PIE — 제조업체 ════════════════════════ */
  function renderMfr(mfrData) {
    var top5 = mfrData.slice(0, 5);
    var rest = mfrData.slice(5);
    var labels = top5.map(function (r) { return r.name; });
    var data = top5.map(function (r) { return r.amount; });
    if (rest.length) {
      labels.push('기타');
      data.push(rest.reduce(function (s, r) { return s + r.amount; }, 0));
    }

    var ctx = document.getElementById('donutMfr');
    if (chartMfr) chartMfr.destroy();
    chartMfr = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: labels.map(function (_, i) { return color(i); }),
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

    var legendEl = document.getElementById('legend-mfr');
    if (legendEl) {
      legendEl.innerHTML = labels.map(function (name, i) {
        return '<span class="legend-item">' +
          '<span class="legend-swatch" style="background:' + color(i) + '"></span>' +
          name + '</span>';
      }).join('');
    }
  }

  /* ════════════════════════ FY / QUARTER FILTER ════════════════════════ */
  var selectedYear = '';     /* '' = 전체 */
  var selectedQuarter = '';  /* '' = full year, 'Q1'…'Q4' */

  function buildPeriodDropdown(years) {
    var sel = document.getElementById('yearFilter');
    if (!sel) return;
    /* keep the first <option value="">전체</option> */
    while (sel.options.length > 1) sel.remove(1);
    /* add years descending (newest first) with quarter sub-options */
    var sorted = years.slice().sort(function (a, b) { return Number(b) - Number(a); });
    sorted.forEach(function (yr) {
      var fy = toFY(yr);
      /* full-year option */
      var opt = document.createElement('option');
      opt.value = yr;
      opt.textContent = fy;
      sel.appendChild(opt);
      /* quarter options (indented) */
      ['Q1', 'Q2', 'Q3', 'Q4'].forEach(function (q) {
        var qopt = document.createElement('option');
        qopt.value = yr + '-' + q;
        qopt.textContent = '\u00A0\u00A0' + fy + ' ' + q;
        sel.appendChild(qopt);
      });
    });
    /* restore current selection */
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

  /* ════════════════════════ MAIN ════════════════════════ */
  async function refresh() {
    try {
      var url = '/api/capex-dashboard?_ts=' + Date.now();
      if (selectedYear) url += '&year=' + selectedYear;
      if (selectedQuarter) url += '&quarter=' + selectedQuarter;
      var d = await fetchJson(url);
      if (!d || !d.success) return;

      renderKPI(d.kpi, d.current_year, d.filter_year || '', d.filter_quarter || '');
      renderDivision(d.division_data || [], d.years || [], d.current_year, d.filter_year || '', d.filter_quarter || '');
      renderContractType(d.contract_type_data || []);
      renderSupplier(d.supplier_data || []);
      renderMfr(d.manufacturer_data || []);

      /* build dropdown with available years */
      buildPeriodDropdown(d.years || []);
    } catch (e) {
      console.error('[capex-dashboard]', e);
    }
  }

  function init() { refresh(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
