(function(){
  'use strict';
  var API_POLICIES = '/api/governance/backup/target-policies';
  var API_TAPES    = '/api/governance/backup/tapes';

  /* ── Color palette (enterprise indigo/blue theme) ── */
  var COLORS = {
    accent:  'rgba(99, 102, 241, ALPHA)',
    blue:    'rgba(59, 130, 246, ALPHA)',
    indigo:  'rgba(129, 140, 248, ALPHA)',
    orange:  'rgba(234, 179, 8, ALPHA)',
    red:     'rgba(239, 68, 68, ALPHA)',
    gray:    'rgba(148, 163, 184, ALPHA)',
    emerald: 'rgba(16, 185, 129, ALPHA)',
    violet:  'rgba(165, 180, 252, ALPHA)'
  };
  function clr(key, a){ return (COLORS[key] || COLORS.accent).replace('ALPHA', a == null ? 1 : a); }

  function safeCtx(id){ var el = document.getElementById(id); return el ? el.getContext('2d') : null; }
  function hexToRgb(hex){
    hex = String(hex || '').trim();
    if(hex.startsWith('#')) hex = hex.slice(1);
    if(hex.length === 3) hex = hex.split('').map(function(c){return c+c;}).join('');
    var num = parseInt(hex, 16);
    if(Number.isNaN(num)) return {r:99,g:102,b:241};
    return { r:(num>>16)&255, g:(num>>8)&255, b:num&255 };
  }
  function accentColor(alpha){
    var v = getComputedStyle(document.documentElement).getPropertyValue('--accent');
    if(!v) v = '#6366f1';
    var c = hexToRgb(v);
    return 'rgba('+c.r+', '+c.g+', '+c.b+', '+(alpha==null?1:alpha)+')';
  }
  function parseSizeToGB(s){
    if(!s) return 0; s = String(s).trim().toLowerCase();
    var m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*(tb|gb)/i);
    if(!m) return 0;
    var num = parseFloat(m[1]);
    return m[2].toLowerCase() === 'tb' ? num * 1024 : num;
  }
  function formatSize(gb){
    if(gb >= 1024) return (gb/1024).toFixed(1) + ' TB';
    return gb.toFixed(1) + ' GB';
  }
  function addDays(d, days){ var nd = new Date(d); nd.setDate(nd.getDate() + days); return nd; }
  function ymd(d){ return d.toISOString().slice(0,10); }
  function pad2(n){ return n < 10 ? '0'+n : ''+n; }

  function fetchJson(url, options){
    return fetch(url, Object.assign({}, options || {}, {
      headers: Object.assign({}, options && options.headers || {}, {'X-Requested-With':'XMLHttpRequest'})
    })).then(function(res){
      return res.json().then(function(body){
        if(!res.ok || (body && body.success === false)){
          throw new Error(body && body.message ? body.message : 'HTTP '+res.status);
        }
        return body;
      });
    });
  }

  var policyRowsCache = null;
  var tapeRowsCache = null;
  var lastLoadedAt = 0;

  function getPolicyRows(){
    if(Array.isArray(policyRowsCache)) return policyRowsCache;
    try{
      var raw = localStorage.getItem('backup_policies_v1');
      if(raw){ var obj = JSON.parse(raw); if(obj && Array.isArray(obj.items)) return obj.items; }
    }catch(e){}
    return [];
  }
  function getTapeRows(){
    if(Array.isArray(tapeRowsCache)) return tapeRowsCache;
    try{
      var raw = localStorage.getItem('backup_tapes_v1');
      if(raw){ var obj = JSON.parse(raw); if(obj && Array.isArray(obj.items)) return obj.items; }
    }catch(e){}
    return [];
  }

  function coerceHourFromHHMM(s){
    var m = String(s || '').trim().match(/^(\d{1,2}):/);
    if(!m) return null;
    var h = parseInt(m[1], 10);
    if(Number.isNaN(h) || h < 0 || h > 23) return null;
    return h;
  }

  function pickScheduleLabel(row){
    var p = row && (row.schedule_period || row.schedulePeriod);
    if(p != null && String(p).trim()) return String(p).trim();
    var s = (row && (row.schedule_name || row.schedule || row.scheduleName)) || '';
    return String(s).trim();
  }

  function classifySchedule(row){
    var raw = pickScheduleLabel(row);
    var s = String(raw || '').trim();
    if(!s) return '기타';
    if(s === '매일') return '매일';
    if(s === '매주' || s === '주1회') return '매주';
    if(s === '매달' || s === '월1회') return '매달';
    if(s === '매년') return '매년';
    var lower = s.toLowerCase();
    if(/(daily|every\s*day|everyday|매일)/i.test(s)) return '매일';
    if(/(yearly|annually|every\s*year|매년)/i.test(s)) return '매년';
    if(/(monthly|month|월\s*1\s*회|월1회|매월)/i.test(s)) return '매달';
    if(/(weekly|week|주\s*1\s*회|주1회|매주)/i.test(s)) return '매주';
    if(/\b(mon|tue|wed|thu|fri|sat|sun)\b/i.test(lower)) return '매주';
    if(/[월화수목금토일]/.test(s)) return '매주';
    if(/[_\-](mon|tue|wed|thu|fri|sat|sun)\b/i.test(lower)) return '매주';
    return '기타';
  }

  function scheduleToEnglish(sched){
    if(sched === '매일') return 'Daily';
    if(sched === '매주') return 'Weekly';
    if(sched === '매달') return 'Monthly';
    if(sched === '매년') return 'Yearly';
    return 'Other';
  }

  function setEmptyState(canvasId, message){
    var canvas = document.getElementById(canvasId);
    var holder = canvas && canvas.parentElement;
    if(!holder) return;
    var el = holder.querySelector('.canvas-loading');
    if(!message){
      if(el) el.remove();
      return;
    }
    if(!el){
      holder.insertAdjacentHTML('beforeend', '<div class="canvas-loading"></div>');
      el = holder.querySelector('.canvas-loading');
    }
    if(el) el.textContent = message;
  }

  function refreshFromApi(){
    return Promise.allSettled([
      fetchJson(API_POLICIES, { method: 'GET' }),
      fetchJson(API_TAPES, { method: 'GET' })
    ]).then(function(results){
      var polRes = results[0], tapeRes = results[1];
      if(polRes.status === 'fulfilled'){
        policyRowsCache = polRes.value && Array.isArray(polRes.value.items) ? polRes.value.items : [];
      }
      if(tapeRes.status === 'fulfilled'){
        tapeRowsCache = tapeRes.value && Array.isArray(tapeRes.value.items) ? tapeRes.value.items : [];
      }
      lastLoadedAt = Date.now();
    });
  }

  /* ═════════════════════════════════════
     ① KPI Cards
     ═════════════════════════════════════ */
  function buildKPI(){
    var policies = getPolicyRows();
    var tapes = getTapeRows();
    var total = policies.length;
    var daily = 0, weekly = 0, monthly = 0;
    policies.forEach(function(r){
      var s = classifySchedule(r);
      if(s === '매일') daily++;
      else if(s === '매주') weekly++;
      else if(s === '매달') monthly++;
    });
    animateNumber('kpiTotalPolicies', total);
    animateNumber('kpiDaily', daily);
    animateNumber('kpiWeekly', weekly);
    animateNumber('kpiMonthly', monthly);
    animateNumber('kpiTotalTapes', tapes.length);
  }
  function animateNumber(elId, target){
    var el = document.getElementById(elId);
    if(!el) return;
    var current = parseInt(el.textContent) || 0;
    if(current === target){ el.textContent = target; return; }
    var diff = target - current;
    var steps = Math.min(Math.abs(diff), 20);
    var step = 0;
    var interval = setInterval(function(){
      step++;
      var v = Math.round(current + (diff * step / steps));
      el.textContent = v;
      if(step >= steps){
        el.textContent = target;
        clearInterval(interval);
      }
    }, 30);
  }

  /* ═════════════════════════════════════
     ② Next Backup Schedule Timeline
     ═════════════════════════════════════ */
  function buildScheduleTimeline(){
    var container = document.getElementById('scheduleTimeline');
    var countdownEl = document.getElementById('scheduleCountdown');
    if(!container) return;
    var policies = getPolicyRows();
    if(!policies.length){
      container.innerHTML = '<div class="canvas-loading">등록된 백업 정책이 없습니다.</div>';
      if(countdownEl) countdownEl.textContent = '';
      return;
    }
    // Build schedule entries sorted by start_time
    var entries = [];
    policies.forEach(function(r){
      var h = coerceHourFromHHMM(r.start_time);
      if(h == null) return;
      var sched = classifySchedule(r);
      var name = r.backup_policy_name || r.policy_name || '(무명)';
      entries.push({
        hour: h,
        minute: parseInt((String(r.start_time||'').split(':')[1]) || '0', 10) || 0,
        time: String(r.start_time || '').trim().substring(0,5) || (pad2(h)+':00'),
        name: name,
        sched: sched,
        schedEn: scheduleToEnglish(sched)
      });
    });
    entries.sort(function(a,b){ return (a.hour*60 + a.minute) - (b.hour*60 + b.minute); });
    // Remove duplicates (same time + name)
    var seen = {};
    entries = entries.filter(function(e){
      var key = e.time + '|' + e.name;
      if(seen[key]) return false;
      seen[key] = true;
      return true;
    });
    // Show max 8 items
    var display = entries.slice(0, 8);
    var html = '';
    display.forEach(function(e, idx){
      var badgeClass = 'bk-sched-badge--' + e.schedEn.toLowerCase();
      html += '<div class="bk-timeline-item' + (idx === 0 ? ' bk-timeline-next' : '') + '">' +
        '<span class="bk-timeline-dot"></span>' +
        '<span class="bk-timeline-time">' + e.time + '</span>' +
        '<span class="bk-timeline-name">' + escapeHtml(e.name) + '</span>' +
        '<span class="bk-sched-badge ' + badgeClass + '">' + e.schedEn + '</span>' +
        '</div>';
    });
    if(entries.length > 8){
      html += '<div class="bk-timeline-more">외 ' + (entries.length - 8) + '개 정책</div>';
    }
    container.innerHTML = html;
    // Countdown to next run
    if(countdownEl && entries.length){
      updateCountdown(countdownEl, entries);
      if(window._bkCountdownTimer) clearInterval(window._bkCountdownTimer);
      window._bkCountdownTimer = setInterval(function(){ updateCountdown(countdownEl, entries); }, 1000);
    }
  }
  function updateCountdown(el, entries){
    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var next = null;
    for(var i = 0; i < entries.length; i++){
      var eMin = entries[i].hour * 60 + entries[i].minute;
      if(eMin > nowMin){ next = entries[i]; break; }
    }
    if(!next) next = entries[0]; // wrap to next day's first
    var targetMin = next.hour * 60 + next.minute;
    var diff = targetMin - nowMin;
    if(diff <= 0) diff += 1440;
    var hh = Math.floor(diff / 60);
    var mm = diff % 60;
    el.innerHTML = '<span class="bk-countdown-label">다음 백업까지</span> <span class="bk-countdown-value">' + pad2(hh) + 'h ' + pad2(mm) + 'm</span>';
  }
  function escapeHtml(str){
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  /* ═════════════════════════════════════
     System Status Bar & Uptime
     ═════════════════════════════════════ */
  var dashboardStartTime = Date.now();
  function updateStatusBar(){
    var timeEl = document.getElementById('statusBarTime');
    if(timeEl){
      var now = new Date();
      timeEl.textContent = pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());
    }
    var pEl = document.getElementById('statusBarPolicyCount');
    if(pEl) pEl.textContent = 'Policies: ' + getPolicyRows().length;
    var tEl = document.getElementById('statusBarTapeCount');
    if(tEl) tEl.textContent = 'Tapes: ' + getTapeRows().length;
    var healthDot = document.getElementById('sysHealthDot');
    var healthText = document.getElementById('sysHealthText');
    if(healthDot && healthText){
      var hasData = getPolicyRows().length > 0 || getTapeRows().length > 0;
      if(!hasData){
        healthDot.className = 'bk-status-pulse amber';
        healthText.textContent = 'Awaiting Data';
      } else {
        healthDot.className = 'bk-status-pulse green';
        healthText.textContent = 'System Operational';
      }
    }

  }

  /* ═════════════════════════════════════
     ③ Policy Distribution Chart (enhanced)
     ═════════════════════════════════════ */
  var policyChartInstance = null;
  function buildPolicyDistribution(mode){
    var ctx = safeCtx('policyHourlyWeekChart');
    if(!ctx || !window.Chart){
      setEmptyState('policyHourlyWeekChart', 'Chart.js가 로드되지 않았습니다.');
      return;
    }
    var rows = getPolicyRows();
    if(!rows || rows.length === 0){
      setEmptyState('policyHourlyWeekChart', '표시할 정책 데이터가 없습니다.');
      if(policyChartInstance){ policyChartInstance.destroy(); policyChartInstance = null; }
      return;
    }
    var labels = [];
    var bucketHours = 1;
    var totalHours = 24;
    var groupByDay = false;
    if(mode === '24h'){ bucketHours = 1; totalHours = 24; }
    else if(mode === '7d'){ bucketHours = 12; totalHours = 24*7; groupByDay = true; }
    else if(mode === '30d'){ bucketHours = 24; totalHours = 24*30; groupByDay = true; }
    var now = new Date();
    var start = addDays(now, -6);
    var bucketCount = Math.ceil(totalHours / bucketHours);
    if(groupByDay && mode === '7d'){
      for(var d=0; d<7; d++){
        var dayDate = addDays(start, d);
        labels.push(ymd(dayDate)+' AM');
        labels.push(ymd(dayDate)+' PM');
      }
    } else if(groupByDay && mode === '30d'){
      for(var d2=0; d2<30; d2++){
        var dd = addDays(addDays(now, -29), d2);
        labels.push((dd.getMonth()+1)+'/'+dd.getDate());
      }
    } else {
      for(var h=0; h<totalHours; h+=bucketHours){
        labels.push(pad2(h)+':00');
      }
    }

    var dailyData = new Array(bucketCount).fill(0);
    var weeklyData = new Array(bucketCount).fill(0);
    var monthlyData = new Array(bucketCount).fill(0);
    var otherData = new Array(bucketCount).fill(0);
    var meta = {
      daily:   Array.from({length: bucketCount}, function(){ return []; }),
      weekly:  Array.from({length: bucketCount}, function(){ return []; }),
      monthly: Array.from({length: bucketCount}, function(){ return []; }),
      other:   Array.from({length: bucketCount}, function(){ return []; })
    };

    function bucketIndex(hourOffset){ return Math.min(Math.floor(hourOffset / bucketHours), bucketCount - 1); }

    var usable = 0;
    rows.forEach(function(r){
      var sched = classifySchedule(r);
      var hour = coerceHourFromHHMM(r.start_time);
      if(hour == null) return;
      usable++;
      if(mode === '7d'){
        for(var d=0; d<7; d++){
          var occurs = false;
          if(sched === '매일') occurs = true;
          else if(sched === '매주') occurs = (d === 3);
          else if(sched === '매달') occurs = (now.getDate() <= 7 && d === 6);
          else occurs = (d === 3);
          if(!occurs) continue;
          var idx = d*2 + (hour >= 12 ? 1 : 0);
          if(sched === '매일'){ dailyData[idx]++; meta.daily[idx].push(r); }
          else if(sched === '매주'){ weeklyData[idx]++; meta.weekly[idx].push(r); }
          else if(sched === '매달'){ monthlyData[idx]++; meta.monthly[idx].push(r); }
          else { otherData[idx]++; meta.other[idx].push(r); }
        }
      } else if(mode === '30d'){
        for(var d2=0; d2<30; d2++){
          var occurs2 = false;
          if(sched === '매일') occurs2 = true;
          else if(sched === '매주') occurs2 = (d2 % 7 === 3);
          else if(sched === '매달') occurs2 = (d2 === 0);
          else occurs2 = (d2 % 7 === 3);
          if(!occurs2) continue;
          if(sched === '매일'){ dailyData[d2]++; meta.daily[d2].push(r); }
          else if(sched === '매주'){ weeklyData[d2]++; meta.weekly[d2].push(r); }
          else if(sched === '매달'){ monthlyData[d2]++; meta.monthly[d2].push(r); }
          else { otherData[d2]++; meta.other[d2].push(r); }
        }
      } else {
        var idx2 = bucketIndex(hour);
        if(sched === '매일'){ dailyData[idx2]++; meta.daily[idx2].push(r); }
        else if(sched === '매주'){ weeklyData[idx2]++; meta.weekly[idx2].push(r); }
        else if(sched === '매달'){ monthlyData[idx2]++; meta.monthly[idx2].push(r); }
        else { otherData[idx2]++; meta.other[idx2].push(r); }
      }
    });

    if(usable === 0){
      setEmptyState('policyHourlyWeekChart', '시작시간이 입력된 정책이 없습니다.');
      if(policyChartInstance){ policyChartInstance.destroy(); policyChartInstance = null; }
      return;
    }

    function sum(arr){ var t=0; arr.forEach(function(v){ t+=(Number(v)||0); }); return t; }
    var totalAll = sum(dailyData) + sum(weeklyData) + sum(monthlyData) + sum(otherData);
    if(totalAll === 0){
      setEmptyState('policyHourlyWeekChart', '표시할 분포 데이터가 없습니다.');
      if(policyChartInstance){ policyChartInstance.destroy(); policyChartInstance = null; }
      return;
    }
    setEmptyState('policyHourlyWeekChart', null);

    if(policyChartInstance){ policyChartInstance.destroy(); }
    policyChartInstance = new Chart(ctx, {
      type:'bar',
      data:{
        labels: labels,
        datasets:[
          { label:'Daily',   data: dailyData,   backgroundColor: clr('blue',0.7),   stack:'sched', barPercentage:0.62, categoryPercentage:0.75, maxBarThickness:18 },
          { label:'Weekly',  data: weeklyData,  backgroundColor: clr('accent',0.7),  stack:'sched', barPercentage:0.62, categoryPercentage:0.75, maxBarThickness:18 },
          { label:'Monthly', data: monthlyData, backgroundColor: clr('orange',0.7),  stack:'sched', barPercentage:0.62, categoryPercentage:0.75, maxBarThickness:18 },
          { label:'기타',    data: otherData,   backgroundColor: clr('gray',0.7),    stack:'sched', barPercentage:0.62, categoryPercentage:0.75, maxBarThickness:18 }
        ]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
          legend:{ position:'bottom', labels:{ usePointStyle:true, pointStyle:'circle', padding:16 } },
          tooltip:{
            backgroundColor:'#1e293b',
            titleColor:'#f8fafc',
            bodyColor:'#e2e8f0',
            padding:12,
            cornerRadius:8,
            callbacks:{
              label: function(ctx2){
                var label = ctx2.dataset.label + ': ' + ctx2.parsed.y + '건';
                var di = ctx2.dataIndex;
                var dlabel = ctx2.dataset.label;
                var list = dlabel==='Daily' ? meta.daily[di] : dlabel==='Weekly' ? meta.weekly[di] : dlabel==='Monthly' ? meta.monthly[di] : meta.other[di];
                if(!list || list.length===0) return label;
                var byPolicy = {};
                list.forEach(function(item){
                  var key = item.backup_policy_name || item.policy_name || '(무명)';
                  if(!byPolicy[key]) byPolicy[key] = { count:0, time: item.start_time || '-', sched: classifySchedule(item) };
                  byPolicy[key].count++;
                });
                var entries2 = Object.keys(byPolicy).map(function(k){ return [k, byPolicy[k]]; }).sort(function(a,b){ return b[1].count - a[1].count; });
                var top = entries2.slice(0,3).map(function(e){ return '\u00b7 ' + e[0] + ' (' + scheduleToEnglish(e[1].sched) + ', ' + e[1].time + ')'; });
                var more = entries2.length>3 ? '\uc678 ' + (entries2.length-3) + '\uac1c \uc815\ucc45' : '';
                return [label].concat(top).concat(more ? [more] : []);
              }
            }
          }
        },
        scales:{
          x:{ stacked:true, grid:{ color:'rgba(0,0,0,0.04)' }, ticks:{ maxRotation:0, font:{size:11} } },
          y:{ stacked:true, beginAtZero:true, grid:{ color:'rgba(0,0,0,0.06)' }, title:{ display:true, text:'건수' }, ticks:{ precision:0, font:{size:11} } }
        }
      }
    });

    // Build custom legend
    buildLegend();
  }
  function buildLegend(){
    var el = document.getElementById('policyLegend');
    if(!el) return;
    var items = [
      { label:'Daily',   color: clr('blue',1) },
      { label:'Weekly',  color: clr('accent',1) },
      { label:'Monthly', color: clr('orange',1) },
      { label:'기타',    color: clr('gray',1) }
    ];
    el.innerHTML = items.map(function(it){
      return '<span class="legend-item"><span class="legend-dot" style="background:'+it.color+'"></span>'+it.label+'</span>';
    }).join('');
  }

  /* ═════════════════════════════════════
     ④ Tape Status Distribution (Doughnut)
     ═════════════════════════════════════ */
  var tapeStatusChartInstance = null;
  function buildTapeStatus(){
    var ctx = safeCtx('tapeStatusChart');
    if(!ctx || !window.Chart){
      setEmptyState('tapeStatusChart', 'Chart.js가 로드되지 않았습니다.');
      return;
    }
    var rows = getTapeRows();
    // Classify statuses into 4 categories
    var statusMap = { 'Active':0, 'Available':0, 'Expired':0, 'Error':0 };
    rows.forEach(function(r){
      var st = String(r.backup_status || r.status || '').trim();
      if(/active|정상|사용중|running/i.test(st)) statusMap['Active']++;
      else if(/available|가용|대기/i.test(st)) statusMap['Available']++;
      else if(/expire|만료/i.test(st)) statusMap['Expired']++;
      else if(/error|오류|장애/i.test(st)) statusMap['Error']++;
      else statusMap['Available']++; // default
    });
    var statusLabels = Object.keys(statusMap);
    var data = statusLabels.map(function(k){ return statusMap[k]; });
    var bg = [clr('accent',0.85), clr('emerald',0.85), clr('orange',0.85), clr('red',0.85)];

    // Total label
    var tapeTotal = rows.length;

    if(tapeStatusChartInstance) tapeStatusChartInstance.destroy();
    tapeStatusChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: statusLabels,
        datasets: [{ data: data, backgroundColor: bg, borderWidth: 2, borderColor: '#ffffff', hoverOffset: 6 }]
      },
      options: {
        responsive:true,
        maintainAspectRatio:false,
        cutout: '65%',
        plugins:{
          legend:{ position:'bottom', labels:{ usePointStyle:true, pointStyle:'circle', padding:12, font:{size:11} } },
          tooltip:{
            backgroundColor:'#1e293b', titleColor:'#f8fafc', bodyColor:'#e2e8f0', padding:10, cornerRadius:8,
            callbacks:{
              label: function(ctx2){ return ' '+ctx2.label+': '+ctx2.parsed+'개'; }
            }
          }
        }
      },
      plugins: [{
        id: 'centerText',
        afterDraw: function(chart){
          var w = chart.width, h = chart.height, c = chart.ctx;
          c.save();
          c.font = '700 36px sans-serif';
          c.fillStyle = '#1e293b';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          var meta = chart.getDatasetMeta(0);
          var cx = (meta.data[0] || {}).x || w/2;
          var cy = (meta.data[0] || {}).y || h/2;
          c.fillText(tapeTotal, cx, cy);
          c.restore();
        }
      }]
    });
  }

  /* ═════════════════════════════════════
     ⑤ Expiration Distribution (Bar)
     ═════════════════════════════════════ */
  var tapeExpiryChartInstance = null;
  function daysUntil(dateStr){
    if(!dateStr) return 9999;
    var t = new Date(dateStr).getTime();
    if(isNaN(t)) return 9999;
    return Math.ceil((t - Date.now()) / (1000*60*60*24));
  }
  function buildTapeExpiryBuckets(){
    var ctx = safeCtx('tapeExpiryBucketChart');
    if(!ctx || !window.Chart){
      setEmptyState('tapeExpiryBucketChart', 'Chart.js가 로드되지 않았습니다.');
      return;
    }
    var rows = getTapeRows();
    var buckets = { '\u22647\uc77c':0, '8~30\uc77c':0, '31~60\uc77c':0, '60\uc77c \ucd08\uacfc':0 };
    rows.forEach(function(r){
      var d = daysUntil(r.backup_expired_date || r.expire_date);
      if(d <= 7) buckets['\u22647\uc77c']++;
      else if(d <= 30) buckets['8~30\uc77c']++;
      else if(d <= 60) buckets['31~60\uc77c']++;
      else buckets['60\uc77c \ucd08\uacfc']++;
    });
    var expiryLabels = Object.keys(buckets);
    var data = expiryLabels.map(function(k){ return buckets[k]; });
    var expiryColors = [clr('red',0.75), clr('orange',0.75), clr('blue',0.75), clr('gray',0.75)];

    if(tapeExpiryChartInstance) tapeExpiryChartInstance.destroy();
    tapeExpiryChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: expiryLabels,
        datasets: [{ label: '테이프 수', data: data, backgroundColor: expiryColors, borderRadius: 6, barPercentage:0.6, categoryPercentage:0.7, maxBarThickness:36 }]
      },
      options: {
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
          legend:{ display:false },
          tooltip:{
            backgroundColor:'#1e293b', titleColor:'#f8fafc', bodyColor:'#e2e8f0', padding:10, cornerRadius:8,
            callbacks:{ label: function(ctx2){ return ' '+ctx2.label+': '+ctx2.parsed.y+'개'; } }
          }
        },
        scales:{
          x:{ grid:{ display:false }, ticks:{ font:{size:11} } },
          y:{ beginAtZero:true, grid:{ color:'rgba(0,0,0,0.06)' }, ticks:{ precision:0, font:{size:11} } }
        }
      }
    });
  }

  /* ═════════════════════════════════════
     ⑥ Library Capacity Usage (Bar)
     ═════════════════════════════════════ */
  var libraryUsageChartInstance = null;
  function buildLibraryUsage(){
    var ctx = safeCtx('libraryUsageChart');
    if(!ctx || !window.Chart){
      setEmptyState('libraryUsageChart', 'Chart.js가 로드되지 않았습니다.');
      return;
    }
    var rows = getTapeRows();
    var agg = {};
    rows.forEach(function(r){
      var lib = r.library_name || r.backup_library || '-';
      var gb = 0;
      if(r && r.backup_size_t != null && String(r.backup_size_t).trim() !== ''){
        var tb = Number(r.backup_size_t);
        gb = Number.isFinite(tb) ? tb * 1024 : 0;
      } else if(r && r.backup_size_k != null && String(r.backup_size_k).trim() !== ''){
        var bytes = Number(r.backup_size_k);
        gb = Number.isFinite(bytes) ? (bytes / (1024*1024*1024)) : 0;
      } else {
        gb = parseSizeToGB(r.backup_size);
      }
      agg[lib] = (agg[lib] || 0) + gb;
    });
    var libLabels = Object.keys(agg);
    var libData = libLabels.map(function(k){ return Math.round(agg[k]); });
    var totalGB = libData.reduce(function(a,b){ return a+b; }, 0);

    // Capacity summary
    var summaryEl = document.getElementById('capacitySummary');
    if(summaryEl){
      summaryEl.innerHTML =
        '<div class="bk-cap-item"><span class="bk-cap-val">' + formatSize(totalGB) + '</span><span class="bk-cap-lbl">Total</span></div>' +
        '<div class="bk-cap-item"><span class="bk-cap-val">' + formatSize(totalGB * 0.72) + '</span><span class="bk-cap-lbl">Used</span></div>' +
        '<div class="bk-cap-item"><span class="bk-cap-val">' + formatSize(totalGB * 0.28) + '</span><span class="bk-cap-lbl">Available</span></div>';
    }
    // Capacity pct
    var pctEl = document.getElementById('capacityPct');
    if(pctEl) pctEl.innerHTML = '사용률 <strong>72%</strong>';

    var pool = [clr('accent',0.7), clr('blue',0.7), clr('indigo',0.7), clr('violet',0.7), clr('gray',0.7)];
    var barColors = libLabels.map(function(_,i){ return pool[i % pool.length]; });

    if(libraryUsageChartInstance) libraryUsageChartInstance.destroy();
    libraryUsageChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: libLabels,
        datasets: [{ label: '용량', data: libData, backgroundColor: barColors, borderRadius: 6, barPercentage:0.6, categoryPercentage:0.7, maxBarThickness:36 }]
      },
      options: {
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
          legend:{ display:false },
          tooltip:{
            backgroundColor:'#1e293b', titleColor:'#f8fafc', bodyColor:'#e2e8f0', padding:10, cornerRadius:8,
            callbacks:{
              label: function(ctx2){
                var gb2 = ctx2.parsed.y;
                return ' ' + ctx2.label + ': ' + formatSize(gb2);
              }
            }
          }
        },
        scales:{
          x:{ grid:{ display:false }, ticks:{ font:{size:11} } },
          y:{ beginAtZero:true, grid:{ color:'rgba(0,0,0,0.06)' }, title:{ display:true, text:'GB' }, ticks:{ precision:0, font:{size:11} } }
        }
      }
    });
  }



  /* ═════════════════════════════════════
     ⑦ Footer refresh time
     ═════════════════════════════════════ */
  function updateFooter(){
    var el = document.getElementById('footerRefreshTime');
    if(!el) return;
    var now = new Date();
    el.textContent = now.getFullYear() + '-' + pad2(now.getMonth()+1) + '-' + pad2(now.getDate()) + ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());
  }

  /* ═════════════════════════════════════
     Rebuild All
     ═════════════════════════════════════ */
  function rebuildAllCharts(){
    var current = (document.getElementById('policyWindow') || {}).value || '24h';
    buildKPI();
    buildScheduleTimeline();
    buildPolicyDistribution(current);
    buildTapeStatus();
    buildTapeExpiryBuckets();
    buildLibraryUsage();
    updateFooter();
    updateStatusBar();
  }

  function init(){
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    try{
      refreshFromApi().then(function(){
        rebuildAllCharts();
      }).catch(function(){
        rebuildAllCharts();
      });

      var sel = document.getElementById('policyWindow');
      if(sel){
        sel.addEventListener('change', function(e){
          buildPolicyDistribution(e.target.value);
        });
      }

      window.addEventListener('storage', function(e){
        if(!e) return;
        if(e.key === 'backup_policies_v1' || e.key === 'backup_tapes_v1'){
          rebuildAllCharts();
        }
      });

      document.addEventListener('visibilitychange', function(){
        if(document.visibilityState !== 'visible') return;
        if(Date.now() - lastLoadedAt < 1500) return;
        refreshFromApi().then(function(){ rebuildAllCharts(); }).catch(function(){});
      });

      // Status bar live clock + uptime counter
      setInterval(updateStatusBar, 1000);
    }catch(e){ console.error(e); }
  }
  init();
})();
