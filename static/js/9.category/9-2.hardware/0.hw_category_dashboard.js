/**
 * 카테고리 > 하드웨어 대시보드 v2.0
 * 픽셀 단위 정제 엔터프라이즈 UI
 */
(function () {
  'use strict';

  /* ── 컬러 시스템 ── */
  var COLORS = {
    healthy:  '#6366F1',
    imminent: '#F59E0B',
    expired:  '#E5484D',
    unknown:  '#3B82F6',
    primary:  '#5B6CFF'
  };
  var LABELS = {
    healthy:  '정상',
    imminent: '임박 (30일)',
    expired:  'EOSL 초과',
    unknown:  '미정'
  };
  var SECTION_LABELS = {
    server: '서버', storage: '스토리지', san: 'SAN',
    network: '네트워크', security: '보안장비'
  };
  var SECTION_KEYS = ['server', 'storage', 'san', 'network', 'security'];

  /* ── 유틸리티 ── */
  function fmt(n) { return new Intl.NumberFormat('ko-KR').format(n); }
  function pct(p, t) { return t ? (Math.round(p / t * 1000) / 10).toString() : '0'; }

  function animateCount(el, target) {
    if (!el) return;
    var duration = 500;
    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var progress = Math.min((ts - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = fmt(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ── 1. 상단 핵심 메시지 배너 ── */
  function renderAlertBanner(summary) {
    var el = document.getElementById('hw-alert-banner');
    if (!el) return;
    var eosl = summary.eosl || {};
    var barClass, text, btnLabel, btnHref;

    if (eosl.expired > 0) {
      barClass = 'critical';
      text = 'EOSL을 초과한 하드웨어 자산이 <strong>' + fmt(eosl.expired) + '건</strong> 있습니다. 즉시 점검이 필요합니다.';
      btnLabel = '확인하기';
      btnHref = '/p/cat_hw_server';
    } else if (eosl.imminent > 0) {
      barClass = 'warning';
      text = '30일 내 EOSL 도래 예정 자산이 <strong>' + fmt(eosl.imminent) + '건</strong> 있습니다.';
      btnLabel = '확인하기';
      btnHref = '/p/cat_hw_server';
    } else if (eosl.unknown > 0) {
      barClass = 'info';
      text = 'EOSL 정보 미등록 자산이 <strong>' + fmt(eosl.unknown) + '건</strong>입니다. 정보를 보완하세요.';
      btnLabel = '보완하기';
      btnHref = '/p/cat_hw_server';
    } else {
      barClass = 'success';
      text = '모든 하드웨어 자산의 EOSL 상태가 양호합니다.';
      btnLabel = '';
      btnHref = '';
    }

    el.innerHTML =
      '<div class="cat-alert-banner-left">' +
        '<div class="cat-alert-bar ' + barClass + '"></div>' +
        '<span class="cat-alert-text">' + text + '</span>' +
      '</div>' +
      (btnLabel ? '<a class="cat-alert-btn" href="' + btnHref + '">' + btnLabel + '</a>' : '');
    el.style.display = '';
  }

  /* ── 2. KPI 카드 ── */
  function renderKPI(summary) {
    var grid = document.getElementById('hw-kpi-grid');
    if (!grid) return;
    var eosl = summary.eosl || {};
    var total = summary.total || 0;
    var cards = [
      { status: 'total',    label: '전체 자산',     value: total,              sub: '등록된 하드웨어 유형', dot: COLORS.primary },
      { status: 'imminent', label: 'EOSL 임박',     value: eosl.imminent || 0, sub: '30일 이내 도래',      dot: COLORS.imminent },
      { status: 'expired',  label: 'EOSL 초과',     value: eosl.expired || 0,  sub: '즉시 조치 필요',      dot: COLORS.expired },
      { status: 'healthy',  label: '정상 운영',      value: eosl.healthy || 0,  sub: 'EOSL 여유',          dot: COLORS.healthy },
      { status: 'unknown',  label: '미정/정보없음',  value: eosl.unknown || 0,  sub: '정보 보완 필요',      dot: COLORS.unknown }
    ];
    grid.innerHTML = '';
    cards.forEach(function (c) {
      var div = document.createElement('div');
      div.className = 'cat-kpi-card';
      div.setAttribute('data-status', c.status);
      div.innerHTML =
        '<div class="cat-kpi-label">' + c.label + '</div>' +
        '<div class="cat-kpi-value">0</div>' +
        '<div class="cat-kpi-sub"><span class="dot" style="background:' + c.dot + '"></span>' + c.sub + '</div>';
      grid.appendChild(div);
      animateCount(div.querySelector('.cat-kpi-value'), c.value);
    });
  }

  /* ── 3. EOSL 도넛 차트 (220px, 두께 16px) ── */
  var chartInstances = {};
  function destroyChart(id) {
    if (chartInstances[id]) { try { chartInstances[id].destroy(); } catch (_) {} delete chartInstances[id]; }
  }

  function renderDonut(eosl) {
    var canvas = document.getElementById('hw-eosl-donut');
    if (!canvas || !window.Chart) return;
    destroyChart('hw-eosl-donut');

    var keys = ['healthy', 'imminent', 'expired', 'unknown'];
    var values = keys.map(function (k) { return eosl[k] || 0; });
    var colors = keys.map(function (k) { return COLORS[k]; });
    var total = values.reduce(function (s, v) { return s + v; }, 0);

    var totalEl = document.getElementById('hw-eosl-total');
    if (totalEl) animateCount(totalEl, total);

    // cutout for 16px thickness on 220px: radius=110, inner=94 → cutout ≈ 85.5%
    chartInstances['hw-eosl-donut'] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: keys.map(function (k) { return LABELS[k]; }),
        datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverBorderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '85%',
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var v = ctx.raw || 0;
                return ctx.label + ': ' + fmt(v) + '건 (' + pct(v, total) + '%)';
              }
            }
          }
        }
      }
    });
  }

  function renderLegend(eosl) {
    var el = document.getElementById('hw-eosl-legend');
    if (!el) return;
    var keys = ['healthy', 'imminent', 'expired', 'unknown'];
    el.innerHTML = '';
    keys.forEach(function (k) {
      var div = document.createElement('div');
      div.className = 'cat-legend-item';
      div.innerHTML =
        '<span class="cat-legend-swatch" style="background:' + COLORS[k] + '"></span>' +
        '<span>' + LABELS[k] + '</span>' +
        '<span class="cat-legend-count">' + fmt(eosl[k] || 0) + '</span>';
      el.appendChild(div);
    });
  }

  /* ── 4. 위험 자산 리스트 ── */
  function renderRiskList(riskTop) {
    var ul = document.getElementById('hw-risk-list');
    if (!ul) return;
    ul.innerHTML = '';
    if (!riskTop || !riskTop.length) {
      ul.innerHTML = '<li class="cat-risk-empty">위험 자산이 없습니다.</li>';
      return;
    }
    riskTop.forEach(function (r) {
      var li = document.createElement('li');
      li.className = 'cat-risk-item';
      var badge = r.status === 'expired' ? 'EOSL 초과' : 'EOSL 임박';
      li.innerHTML =
        '<span class="cat-risk-model" title="' + (r.model || '') + '">' + (r.model || '-') + '</span>' +
        '<span class="cat-risk-type">' + (r.hw_type || r.vendor || '-') + '</span>' +
        '<span class="cat-risk-date">' + (r.eosl_date || '-') + '</span>' +
        '<span class="cat-risk-badge ' + r.status + '">' + badge + '</span>';
      ul.appendChild(li);
    });
  }

  /* ── 5. 인사이트 ── */
  function renderInsights(summary) {
    var el = document.getElementById('hw-insight-list');
    if (!el) return;
    var eosl = summary.eosl || {};
    var total = summary.total || 0;
    var items = [];

    if (eosl.expired > 0) {
      items.push({ type: 'danger', text: '전체 자산의 <strong>' + pct(eosl.expired, total) + '%</strong>가 EOSL 초과 상태입니다. 교체를 검토하세요.' });
    }
    if (eosl.imminent > 0) {
      items.push({ type: 'warn', text: '30일 내 EOSL 도래 자산 <strong>' + fmt(eosl.imminent) + '개</strong>가 있습니다.' });
    }
    if (eosl.unknown > 0) {
      items.push({ type: 'info', text: 'EOSL 미등록 자산 <strong>' + fmt(eosl.unknown) + '개</strong>의 정보를 보완하세요.' });
    }
    if ((summary.vendors || []).length > 0) {
      items.push({ type: 'info', text: '최다 제조사: <strong>' + summary.vendors[0].name + '</strong> (' + fmt(summary.vendors[0].count) + '건)' });
    }
    if (!items.length) {
      items.push({ type: 'info', text: '현재 특이사항이 없습니다.' });
    }

    el.innerHTML = '';
    items.forEach(function (it) {
      var div = document.createElement('div');
      div.className = 'cat-insight-item ' + it.type;
      div.innerHTML = it.text;
      el.appendChild(div);
    });
  }

  /* ── 7. 유형별 EOSL 요약 카드 (엔터프라이즈) ── */
  function renderSectionCards(sections) {
    var el = document.getElementById('hw-section-charts');
    if (!el) return;
    el.innerHTML = '';

    SECTION_KEYS.forEach(function (key) {
      var sec = sections[key];
      if (!sec) return;
      var eosl = sec.eosl || {};
      var total = sec.total || 0;
      var expired = eosl.expired || 0;
      var imminent = eosl.imminent || 0;
      var healthy = eosl.healthy || 0;
      var unknown = eosl.unknown || 0;

      var card = document.createElement('div');
      card.className = 'cat-section-chart-card';

      /* 상태 판정 */
      var statusClass = 'good';
      var statusLabel = '양호';
      if (expired > 0) { statusClass = 'danger'; statusLabel = '주의 필요'; card.classList.add('status-danger'); }
      else if (imminent > 0) { statusClass = 'warn'; statusLabel = '점검 필요'; card.classList.add('status-warn'); }

      /* 스택 바 비율 */
      var bars = '';
      if (total > 0) {
        var pE = (expired / total * 100).toFixed(1);
        var pI = (imminent / total * 100).toFixed(1);
        var pH = (healthy / total * 100).toFixed(1);
        var pU = (unknown / total * 100).toFixed(1);
        bars =
          '<div class="sec-bar">' +
            (expired  ? '<div class="seg seg-expired" style="width:' + pE + '%"></div>' : '') +
            (imminent ? '<div class="seg seg-imminent" style="width:' + pI + '%"></div>' : '') +
            (healthy  ? '<div class="seg seg-healthy" style="width:' + pH + '%"></div>' : '') +
            (unknown  ? '<div class="seg seg-unknown" style="width:' + pU + '%"></div>' : '') +
          '</div>';
      } else {
        bars = '<div class="sec-bar"><div class="seg seg-empty" style="width:100%"></div></div>';
      }

      var canvasId = 'hw-sec-donut-' + key;

      card.innerHTML =
        '<div class="sec-body">' +
          '<div class="sec-header">' +
            '<div class="cat-section-chart-title">' + (SECTION_LABELS[key] || key) + '</div>' +
            '<span class="sec-status-badge ' + statusClass + '">' + statusLabel + '</span>' +
          '</div>' +
          '<div class="sec-center">' +
            '<div class="sec-mini-donut">' +
              '<canvas id="' + canvasId + '"></canvas>' +
              '<div class="sec-mini-donut-label">' +
                '<span class="sec-mini-donut-value">' + fmt(total) + '</span>' +
                '<span class="sec-mini-donut-sub">전체</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="sec-progress-wrap">' + bars + '</div>';

      el.appendChild(card);

      /* 미니 도넛 생성 */
      var cvs = document.getElementById(canvasId);
      if (cvs && typeof Chart !== 'undefined') {
        var dataArr = [expired, imminent, healthy, unknown];
        var labelArr = ['초과', '임박', '정상', '미정'];
        if (total === 0) { dataArr = [1]; labelArr = ['없음']; }
        new Chart(cvs.getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: labelArr,
            datasets: [{
              data: dataArr,
              backgroundColor: total === 0
                ? ['#E2E8F0']
                : ['#E5484D', '#F59E0B', COLORS.healthy, '#3B82F6'],
              borderWidth: 0,
              spacing: 1
            }]
          },
          options: {
            cutout: '68%',
            responsive: false,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                enabled: true,
                backgroundColor: '#1E293B',
                titleFont: { size: 11, weight: '600' },
                bodyFont: { size: 11 },
                padding: 8,
                cornerRadius: 8,
                displayColors: true,
                boxWidth: 8,
                boxHeight: 8,
                boxPadding: 4,
                callbacks: {
                  label: function (ctx) {
                    return ' ' + ctx.label + ': ' + ctx.raw + '건';
                  }
                }
              }
            },
            animation: { animateRotate: true, duration: 600 }
          }
        });
      }
    });
  }

  /* ── 데이터 로드 ── */
  function load() {
    fetch('/api/category/hw-dashboard')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success) return;
        var summary = data.summary || {};
        var sections = data.sections || {};
        var eosl = summary.eosl || {};

        renderKPI(summary);
        renderDonut(eosl);
        renderLegend(eosl);
        renderRiskList(summary.risk_top || []);
        renderInsights(summary);
        renderSectionCards(sections);
      })
      .catch(function (err) {
        console.error('[HW Dashboard] load error:', err);
      });
  }

  /* ── 액션 버튼 ── */
  function bindActions() {
    ['hw-action-eosl', 'hw-action-replace', 'hw-action-unknown'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', function (e) {
        e.preventDefault();
        window.location.href = '/p/cat_hw_server';
      });
    });
  }

  /* ── init ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { load(); bindActions(); });
  } else {
    load(); bindActions();
  }
})();
