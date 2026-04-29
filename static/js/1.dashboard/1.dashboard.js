/**
 * 메인 대시보드 — KPI 카드 + 도넛/막대/라인 차트
 * 원본 차트 스타일 유지 + 실제 API 데이터 연동
 * SVG 기반 순수 바닐라 JS (외부 차트 라이브러리 없음)
 */
(function(){
    // External dependencies
    var LOTTIE_LOCAL = '/static/js/vendor/lottie_light.min.js';
    var LOTTIE_CDN = 'https://unpkg.com/lottie-web@5.12.2/build/player/lottie_light.min.js';
    var NODATA_LOTTIE_PATH = '/static/image/svg/free-animated-no-data.json';
    var _lottieLoading = false;
    var _lottieReady = false;
    var _lottieCallbacks = [];

    function ensureLottie(cb){
        if(window.lottie || window.bodymovin){
            window.lottie = window.lottie || window.bodymovin;
            _lottieReady = true;
            cb();
            return;
        }

        _lottieCallbacks.push(cb);

        if(_lottieLoading){ return; }
        _lottieLoading = true;

        var sources = [LOTTIE_LOCAL, LOTTIE_CDN];
        var idx = 0;

        function done(){
            _lottieLoading = false;
            window.lottie = window.lottie || window.bodymovin;
            _lottieReady = !!window.lottie;
            if(_lottieReady){
                var pending = _lottieCallbacks.slice();
                _lottieCallbacks.length = 0;
                pending.forEach(function(fn){
                    try { fn(); } catch(_e){}
                });
            } else {
                _lottieCallbacks.length = 0;
            }
        }

        function loadNext(){
            window.lottie = window.lottie || window.bodymovin;
            if(window.lottie){ done(); return; }
            if(idx >= sources.length){ done(); return; }
            var s = document.createElement('script');
            s.src = sources[idx++];
            s.async = true;
            s.onload = function(){
                window.lottie = window.lottie || window.bodymovin;
                if(window.lottie){ done(); }
                else { loadNext(); }
            };
            s.onerror = function(){ loadNext(); };
            document.head.appendChild(s);
        }

        loadNext();
    }

    function buildNoDataFallbackSvg(){
        return '' +
            '<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                '<defs>' +
                    '<linearGradient id="dashboardNoDataBg" x1="20" y1="18" x2="95" y2="102" gradientUnits="userSpaceOnUse">' +
                        '<stop stop-color="#F8FBFF"/>' +
                        '<stop offset="1" stop-color="#EEF4FB"/>' +
                    '</linearGradient>' +
                '</defs>' +
                '<rect x="18" y="20" width="84" height="80" rx="20" fill="url(#dashboardNoDataBg)" stroke="#D8E3F0"/>' +
                '<rect x="32" y="36" width="56" height="8" rx="4" fill="#C2D1E2"/>' +
                '<rect x="32" y="50" width="40" height="8" rx="4" fill="#D3DEEA"/>' +
                '<rect x="32" y="68" width="12" height="18" rx="4" fill="#A8BDD3"/>' +
                '<rect x="50" y="60" width="12" height="26" rx="4" fill="#8FA9C6"/>' +
                '<rect x="68" y="72" width="12" height="14" rx="4" fill="#C7D5E5"/>' +
                '<circle cx="85" cy="84" r="12" fill="#FFFFFF" stroke="#D8E3F0"/>' +
                '<path d="M85 78V85L89.5 88.5" stroke="#7B93AE" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg>';
    }

    function toNum(v){
        var n = Number(v);
        return isFinite(n) ? n : 0;
    }

    function hasPositiveValueDeep(obj){
        if(obj == null) return false;
        if(Array.isArray(obj)){
            for(var i = 0; i < obj.length; i++){
                if(hasPositiveValueDeep(obj[i])) return true;
            }
            return false;
        }
        if(typeof obj === 'object'){
            var keys = Object.keys(obj);
            for(var k = 0; k < keys.length; k++){
                if(hasPositiveValueDeep(obj[keys[k]])) return true;
            }
            return false;
        }
        return toNum(obj) > 0;
    }

    /** 데이터가 없을 때 스티커 이미지를 노출 */
    function showNoData(containerId, legendId){
        var el = document.getElementById(containerId);
        if(!el) return;
        el.innerHTML = '<div class="no-data-lottie" style="display:flex;align-items:center;justify-content:center;height:100%;width:100%;flex-direction:column;position:relative;">' +
            '<img src="/static/image/svg/free-icon-data.svg?v=20260422a" alt="데이터 없음" style="width:90px;max-width:100%;height:90px;object-fit:contain;" />' +
            '</div>';
        var legend = document.getElementById(legendId);
        if(legend) legend.innerHTML = '';
    }

    // ──── 유틸 ────
    function fmt(n){
        if(n == null) return '—';
        return Number(n).toLocaleString('ko-KR');
    }
    function fmtWon(n){
        if(n == null || n === 0) return '—';
        var v = Number(n);
        var units = [
            { div: 1e8,  label: '억원' },
            { div: 1e6,  label: '백만원' },
            { div: 1e4,  label: '만원' },
            { div: 1e3,  label: '천원' }
        ];
        for(var i = 0; i < units.length; i++){
            if(Math.abs(v) >= units[i].div){
                var scaled = Math.round(v / units[i].div);
                return scaled.toLocaleString('ko-KR') + ' ' + units[i].label;
            }
        }
        return v.toLocaleString('ko-KR') + ' 원';
    }

    // ──── 툴팁 (원본 스타일) ────
    function _ttEl(){ return document.getElementById('chart-tooltip'); }
    function _ttHide(){ var t=_ttEl(); if(t){ t.style.opacity='0'; } }
    function _ttShow(evt, title, color, value, ratio){
        var t = _ttEl(); if(!t) return;
        var pct = isFinite(ratio) && ratio>0 ? Math.round(ratio*100) : 0;
        t.innerHTML = '<div class="tt-title">' + title + '</div>' +
            '<div class="tt-row"><span class="tt-dot" style="background:' + color + '"></span>' +
            '<span class="tt-val">' + Number(value||0).toLocaleString() + '</span>' +
            '<span class="tt-ratio">' + pct + '%</span></div>';
        t.style.left = (evt.clientX) + 'px';
        t.style.top = (evt.clientY) + 'px';
        t.style.opacity = '1';
    }

    // ──── 스파크라인 (KPI 카드 내) ────
    function renderMiniSpark(targetId, color, series){
        var el = document.getElementById(targetId); if(!el) return;
        var w = el.clientWidth || 96, h = el.clientHeight || 32;
        var data = Array.isArray(series) && series.length ? series : [12,18,10,16,22,14,20,26,18,24,20,28];
        var max = Math.max.apply(null, data.concat([1]));
        var step = w / (data.length - 1);
        var points = data.map(function(v,i){ return (i*step)+','+(h - (v/max)*h); }).join(' ');
        el.innerHTML = '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">' +
            '<polyline fill="none" stroke="'+color+'" stroke-width="2" points="'+points+'"/></svg>';
    }

    // ──── 도넛 차트 (원본 스타일: 중심에서 파이 섹터 + 화이트 홀) ────
    function renderDonut(targetId, legendId, dataset, options){
        var el = document.getElementById(targetId); if(!el) return;
        var legend = document.getElementById(legendId);

        var data = dataset && dataset.length ? dataset : [];
        var total = 0;
        data.forEach(function(d){ total += toNum(d.val); });

        if(!data.length || total === 0){
            showNoData(targetId, legendId);
            return;
        }

        var size = Math.min(el.clientWidth||300, el.clientHeight||260);
        var r = (size/2) - 16; var cx = size/2; var cy = size/2;

        var acc = 0; var parts = [];
        data.forEach(function(d){
            var val = toNum(d.val);
            var ratio = total ? (val/total) : 0;
            var dPath;
            if(val >= total){
                // 100% 단일 아이템: SVG arc는 시작점=끝점이면 렌더링 불가 → 두 반원으로 분할
                dPath = 'M ' + cx + ' ' + cy +
                    ' L ' + cx + ' ' + (cy - r) +
                    ' A ' + r + ' ' + r + ' 0 0 1 ' + cx + ' ' + (cy + r) +
                    ' A ' + r + ' ' + r + ' 0 0 1 ' + cx + ' ' + (cy - r) + ' Z';
            } else {
                var start = (acc/total) * Math.PI*2 - Math.PI/2;
                acc += val;
                var end = (acc/total) * Math.PI*2 - Math.PI/2;
                var x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
                var x2 = cx + r * Math.cos(end),   y2 = cy + r * Math.sin(end);
                var large = (end - start) > Math.PI ? 1 : 0;
                dPath = 'M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2 + ' Z';
            }
            if(val < total) acc = acc; // acc already updated in else branch
            else acc = total;
            parts.push('<path d="' + dPath + '" fill="' + d.color + '" fill-opacity="0.9" stroke="#fff" stroke-width="1" data-label="' + d.label + '" data-val="' + val + '" data-total="' + total + '" data-color="' + d.color + '" aria-label="' + d.label + ' ' + val + ' (' + Math.round(ratio*100) + '%)"/>');
        });

        var hole = options && typeof options.holeRatio === 'number' ? Math.max(0, Math.min(0.9, options.holeRatio)) : null;
        var centerHole = hole ? '<circle cx="'+cx+'" cy="'+cy+'" r="'+(r*hole)+'" fill="#fff"/>' : '';
        var centerLabel = '';
        if(options && (options.showTotal || options.centerText != null)){
            var label = options.centerText != null ? String(options.centerText) : String(total.toLocaleString());
            var fs = Math.max(12, Math.floor(size*0.18));
            centerLabel = '<text x="'+cx+'" y="'+cy+'" text-anchor="middle" dominant-baseline="middle" font-size="'+fs+'" font-weight="800" fill="#334155" style="pointer-events:none">'+label+'</text>';
        }
        el.innerHTML = '<svg width="100%" height="100%" viewBox="0 0 '+size+' '+size+'">'+parts.join('')+centerHole+centerLabel+'</svg>';

        var svg = el.querySelector('svg');
        if(svg){
            svg.querySelectorAll('path').forEach(function(p){
                p.addEventListener('mousemove', function(evt){
                    var lab = p.getAttribute('data-label')||'';
                    var val = Number(p.getAttribute('data-val')||'0');
                    var tot = Number(p.getAttribute('data-total')||'0');
                    var color = p.getAttribute('data-color')||'#666';
                    var ratio = tot ? (val/tot) : 0;
                    _ttShow(evt, lab, color, val, ratio);
                });
            });
            svg.addEventListener('mouseleave', _ttHide);
        }
        if(legend){
            legend.innerHTML = data.map(function(d){ return '<span class="legend-item"><span class="legend-swatch" style="background:'+d.color+'"></span>'+d.label+'</span>'; }).join('');
        }
    }

    // ──── 에어리어 차트 (그래디언트 폴리곤) ────
    function renderArea(targetId, series){
        var el = document.getElementById(targetId); if(!el) return;
        var w = el.clientWidth || 600, h = el.clientHeight || 220;
        var data = Array.isArray(series) && series.length ? series : [30,25,28,22,40,18,38,26,34,20,24,36];
        var max = Math.max.apply(null, data.concat([1]))*1.2;
        var step = (w-20) / (data.length - 1);
        var pts = data.map(function(v,i){ return (10 + i*step)+','+(h - (v/max)*(h-20) - 10); }).join(' ');
        el.innerHTML = '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">' +
            '<defs><linearGradient id="gradA" x1="0" x2="0" y1="0" y2="1">' +
            '<stop offset="0%" stop-color="#6366f1" stop-opacity="0.55"/>' +
            '<stop offset="100%" stop-color="#6366f1" stop-opacity="0.05"/></linearGradient></defs>' +
            '<polyline fill="none" stroke="#8aa5c4" stroke-width="2" points="'+pts+'"/>' +
            '<polyline fill="none" stroke="var(--accent, #6366f1)" stroke-width="2.5" points="'+pts+'" opacity="0.9"/>' +
            '<polygon fill="url(#gradA)" points="'+pts+' '+(w-10)+','+(h-10)+' 10,'+(h-10)+'"/></svg>';
    }

    // ──── Y축 눈금 생성 헬퍼 ────
    function _commas(n){ return Number(n).toLocaleString('ko-KR'); }
    function _fmtAxis(n){
        if(n >= 1e8) return _commas(Math.round(n/1e8)) + '억';
        if(n >= 1e4) return _commas(Math.round(n/1e4)) + '만';
        if(n >= 1e3) return _commas(Math.round(n/1e3)) + 'k';
        return _commas(Math.round(n));
    }
    function _yTicks(left, top, plotH, maxVal, steps){
        var svg = '';
        var prevLabel = null;
        for(var i = 0; i <= steps; i++){
            var v = maxVal * i / steps;
            var y = top + plotH - (plotH * i / steps);
            var label = _fmtAxis(v);
            if(label !== prevLabel){
                svg += '<text x="'+(left-4)+'" y="'+(y+3)+'" text-anchor="end" fill="#94a3b8" font-size="10">'+label+'</text>';
                prevLabel = label;
            }
            if(i > 0) svg += '<line x1="'+left+'" y1="'+y+'" x2="'+left+'" y2="'+y+'" stroke="#e2e8f0" stroke-width="0.5" stroke-dasharray="3,3"/>';
        }
        return svg;
    }

    // ──── 그룹 막대 + 라인 차트 (유지보수용, 원본 스타일) ────
    // lineSeries can be a single array (1 line) or array-of-arrays (multi line)
    // lineName can be a string or array of strings, lineColors optional array of colors
    function renderGroupedBarsWithLine(targetId, labels, seriesList, seriesNames, lineSeries, lineName, lineColors){
        var el = document.getElementById(targetId); if(!el) return;
        var w = el.clientWidth || 600, h = el.clientHeight || 220;
        var barColors = ['var(--accent, #6366f1)','#6b7fa8','#9aa9bf'];
        var defaultLineColors = ['#2d3f73','#e67e22','#27ae60'];
        var left = 44, right = 34, top = 10, bottom = 26;
        var plotW = w - left - right, plotH = h - top - bottom;
        var groups = labels.length, seriesN = seriesList.length;
        var allFlat = []; seriesList.forEach(function(s){ allFlat = allFlat.concat(s); });
        var maxBar = Math.max.apply(null, [1].concat(allFlat));

        // normalise multi-line: ensure lineSeriesArr is array-of-arrays
        var lineSeriesArr = null, lineNameArr = [], lineColorArr = [];
        if(lineSeries){
            if(Array.isArray(lineSeries[0])){
                lineSeriesArr = lineSeries;
                lineNameArr = Array.isArray(lineName) ? lineName : [lineName || '비용'];
            } else {
                lineSeriesArr = [lineSeries];
                lineNameArr = [lineName || '비용'];
            }
            lineColorArr = lineColors || defaultLineColors;
        }
        var maxLine = 1;
        if(lineSeriesArr){
            lineSeriesArr.forEach(function(ls){ ls.forEach(function(v){ if(v > maxLine) maxLine = v; }); });
        }

        var gW = plotW / groups;
        var barGap = 4;
        var barW = Math.max(6, Math.min(20, (gW - (seriesN-1)*barGap) / Math.max(seriesN,1)));
        var rects = '', ticks = '', allLineSvg = '';
        var stepLab = groups > 20 ? 4 : (groups > 12 ? 2 : 1);
        labels.forEach(function(lab, i){
            var gx = left + i * gW;
            var center = gx + gW/2;
            if(i % stepLab === 0){
                ticks += '<text x="'+center+'" y="'+(h-8)+'" text-anchor="middle" fill="#64748b" font-size="11">'+lab+'</text>';
            }
            for(var s=0; s<seriesN; s++){
                var val = (seriesList[s][i] || 0);
                var ph = (val / (maxBar*1.2)) * plotH;
                var x = gx + (gW - (seriesN*barW + (seriesN-1)*barGap))/2 + s*(barW+barGap);
                var y = top + (plotH - ph);
                var color = barColors[s%barColors.length];
                var sName = (seriesNames && seriesNames[s]) ? seriesNames[s] : '시리즈'+(s+1);
                rects += '<rect x="'+x+'" y="'+y+'" width="'+barW+'" height="'+Math.max(1, ph)+'" rx="3" ry="3" fill="'+color+'" data-label="'+lab+'" data-series="'+sName+'" data-val="'+val+'" data-total="'+maxBar+'" data-color="'+color+'"/>';
            }
        });
        // draw lines
        if(lineSeriesArr){
            for(var li=0; li<lineSeriesArr.length; li++){
                var ls = lineSeriesArr[li];
                var lc = lineColorArr[li % lineColorArr.length];
                var ln = lineNameArr[li] || '비용';
                var pts = '', dots = '';
                labels.forEach(function(lab, i){
                    var gx = left + i * gW;
                    var center = gx + gW/2;
                    var lv = ls[i] || 0;
                    var ly = top + (plotH - (lv / (maxLine*1.1)) * plotH);
                    pts += (pts? ' ': '') + center + ',' + ly;
                    dots += '<circle cx="'+center+'" cy="'+ly+'" r="3" fill="#ffffff" stroke="'+lc+'" stroke-width="2" data-label="'+lab+'" data-series="'+ln+'" data-val="'+lv+'" data-color="'+lc+'"/>';
                });
                allLineSvg += '<polyline fill="none" stroke="'+lc+'" stroke-width="2" points="'+pts+'" opacity="0.9"/>'+dots;
            }
        }
        var yTickSvg = _yTicks(left, top, plotH, maxBar * 1.2, 4);
        var axisLine = '<line x1="'+left+'" y1="'+top+'" x2="'+left+'" y2="'+(top+plotH)+'" stroke="#cbd5e1" stroke-width="1"/>'
                     + '<line x1="'+left+'" y1="'+(top+plotH)+'" x2="'+(w-right)+'" y2="'+(top+plotH)+'" stroke="#cbd5e1" stroke-width="1"/>';
        el.innerHTML = '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'+axisLine+yTickSvg+rects+allLineSvg+ticks+'</svg>';
        var svg = el.querySelector('svg');
        if(svg){
            svg.querySelectorAll('rect').forEach(function(r){
                r.addEventListener('mousemove', function(evt){
                    var bucket = r.getAttribute('data-label')||'';
                    var sName = r.getAttribute('data-series')||'';
                    var val = Number(r.getAttribute('data-val')||'0');
                    var tot = Number(r.getAttribute('data-total')||'0');
                    var color = r.getAttribute('data-color')||'#666';
                    var ratio = tot ? (val/tot) : 0;
                    _ttShow(evt, sName + ' · ' + bucket, color, val, ratio);
                });
            });
            svg.querySelectorAll('circle').forEach(function(c){
                c.addEventListener('mousemove', function(evt){
                    var bucket = c.getAttribute('data-label')||'';
                    var sName = c.getAttribute('data-series')||'';
                    var val = Number(c.getAttribute('data-val')||'0');
                    var color = c.getAttribute('data-color')||'#666';
                    var ratio = maxLine ? (val/maxLine) : 0;
                    _ttShow(evt, sName + ' · ' + bucket, color, val, ratio);
                });
            });
            svg.addEventListener('mouseleave', _ttHide);
        }
    }

    // ──── 누적 막대 차트 (작업용, 원본 스타일) ────
    function renderStackedBars(targetId, labels, seriesList, seriesNames){
        var el = document.getElementById(targetId); if(!el) return;
        var w = el.clientWidth || 600, h = el.clientHeight || 220;
        var colors = ['var(--accent, #6366f1)','#6b7fa8','#9aa9bf','#b2bcd4'];
        var left = 44, right = 34, top = 10, bottom = 26;
        var plotW = w - left - right, plotH = h - top - bottom;
        var groups = labels.length, seriesN = seriesList.length;
        var totals = labels.map(function(_,i){ return seriesList.reduce(function(a,s){ return a + (s[i]||0); }, 0); });
        var max = Math.max.apply(null, [1].concat(totals));
        var gW = plotW / groups;
        var barW = Math.max(14, Math.min(26, gW * 0.55));
        var rects = '', ticks = '';
        var stepLab = groups > 20 ? 4 : (groups > 12 ? 2 : 1);
        labels.forEach(function(lab, i){
            var gx = left + i * gW;
            var center = gx + gW/2;
            if(i % stepLab === 0){
                ticks += '<text x="'+center+'" y="'+(h-8)+'" text-anchor="middle" fill="#64748b" font-size="11">'+lab+'</text>';
            }
            var total = totals[i] || 1;
            var scaledH = (total/max) * plotH;
            var acc = 0;
            for(var s=0; s<seriesN; s++){
                var val = (seriesList[s][i] || 0);
                var frac = total ? (val/total) : 0;
                var segH = frac * scaledH;
                var x = center - barW/2;
                var y = top + (plotH - scaledH) + (scaledH - acc - segH);
                var color = colors[s%colors.length];
                var sName = (seriesNames && seriesNames[s]) ? seriesNames[s] : '시리즈'+(s+1);
                rects += '<rect x="'+x+'" y="'+y+'" width="'+barW+'" height="'+Math.max(1, segH)+'" rx="3" ry="3" fill="'+color+'" data-label="'+lab+'" data-series="'+sName+'" data-val="'+val+'" data-total="'+total+'" data-color="'+color+'"/>';
                acc += segH;
            }
        });
        var yTickSvg = _yTicks(left, top, plotH, max, 4);
        var axisLine = '<line x1="'+left+'" y1="'+top+'" x2="'+left+'" y2="'+(top+plotH)+'" stroke="#cbd5e1" stroke-width="1"/>'
                     + '<line x1="'+left+'" y1="'+(top+plotH)+'" x2="'+(w-right)+'" y2="'+(top+plotH)+'" stroke="#cbd5e1" stroke-width="1"/>';
        el.innerHTML = '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'+axisLine+yTickSvg+rects+ticks+'</svg>';
        var svg = el.querySelector('svg');
        if(svg){
            svg.querySelectorAll('rect').forEach(function(r){
                r.addEventListener('mousemove', function(evt){
                    var bucket = r.getAttribute('data-label')||'';
                    var sName = r.getAttribute('data-series')||'';
                    var val = Number(r.getAttribute('data-val')||'0');
                    var tot = Number(r.getAttribute('data-total')||'0');
                    var color = r.getAttribute('data-color')||'#666';
                    var ratio = tot ? (val/tot) : 0;
                    _ttShow(evt, sName + ' · ' + bucket, color, val, ratio);
                });
            });
            svg.addEventListener('mouseleave', _ttHide);
        }
    }

    // ──── 색상 팔레트 (원본 스타일) ────
    var HW_COLORS = {
        'SERVER': 'var(--accent, #6366f1)',
        'STORAGE': '#6b7fa8',
        'SAN': '#7aa0c4',
        'NETWORK': '#8aa5c4',
        'SECURITY': '#9aa9bf'
    };
    var SW_COLORS = {
        'OS': 'var(--accent, #6366f1)',
        'DATABASE': '#61739a',
        'MIDDLEWARE': '#8091a7',
        'VIRTUALIZATION': '#7aa0c4',
        'SECURITY': '#9aa9bf',
        'HIGH_AVAILABILITY': '#b2bcd4'
    };
    var PRJ_COLORS = ['#6b7fa8', 'var(--accent, #6366f1)', '#8091a7', '#9aa9bf', '#b2bcd4'];

    // ──── API ────
    function fetchDashboard(range){
        return fetch('/api/dashboard/stats?range=' + encodeURIComponent(range || '1m'), {
            credentials: 'same-origin'
        }).then(function(r){
            var contentType = (r.headers.get('content-type') || '').toLowerCase();
            if(!r.ok || contentType.indexOf('application/json') === -1){
                throw new Error('dashboard_api_unavailable:' + r.status);
            }
            return r.json();
        });
    }

    function renderDashboardEmpty(){
        ['chart-hw', 'chart-sw', 'chart-prj', 'chart-mtce', 'chart-task'].forEach(function(chartId){
            var legendId = chartId.replace('chart-', 'legend-');
            showNoData(chartId, legendId);
        });
    }

    // ──── KPI 업데이트 ────
    function populateKPIs(data){
        var kpi = data.kpi || {};
        setKPIValue('kpi-hw', kpi.hardware);
        setKPIValue('kpi-sw', kpi.software);
        setKPIValue('kpi-task', kpi.task);
        setMtceKPI(kpi.maintenance || {});
    }

    function setKPIValue(id, obj){
        var card = document.getElementById(id);
        if(!card || !obj) return;
        var v = card.querySelector('.kpi-value');
        var d = card.querySelector('.kpi-delta');
        if(v){
            v.textContent = fmt(obj.total);
        }
        if(d){
            var nowNum = Number(obj.total || 0);
            var prevNum = Number(obj.prev || 0);
            var diff = nowNum - prevNum;
            var ratio = prevNum ? (diff / prevNum) : 0;
            var pctAbs = Math.abs(ratio) * 100;
            var up = ratio > 0;
            var arrow = up ? '▲' : (ratio < 0 ? '▼' : '•');
            d.classList.toggle('up', up);
            d.classList.toggle('down', !up && ratio < 0);
            var sign = ratio > 0 ? '+' : (ratio < 0 ? '-' : '');
            d.innerHTML = '<span class="delta-arrow">' + arrow + '</span>' +
                '<span class="delta-val">' + sign + pctAbs.toFixed(2) + '%</span>' +
                '<span class="delta-prev">vs ' + fmt(prevNum) + '(prev.)</span>';
        }
    }

    function setMtceKPI(m){
        var valEl = document.querySelector('#kpi-mtce .kpi-value');
        if(valEl){
            valEl.textContent = fmtWon(m.period_cost);
        }
        var metaCols = document.querySelectorAll('#kpi-mtce-card .meta-col');
        if(metaCols.length >= 3){
            var periodEl = metaCols[1].querySelector('.meta-value');
            var countEl = metaCols[2].querySelector('.meta-value');
            if(periodEl) periodEl.textContent = m.period_label || '—';
            if(countEl) countEl.textContent = fmt(m.count);
        }
    }

    // ──── 차트 렌더 (API 데이터 → 원본 차트 함수) ────
    function renderCharts(data){
        var charts = data.charts || {};
        var range = data.range || '1m';

        // 1. 하드웨어 도넛
        var hwItems = (charts.hardware || []).map(function(d){
            return { label: d.label, val: d.value, color: HW_COLORS[d.key] || '#9aa9bf' };
        });
        renderDonut('chart-hw', 'legend-hw', hwItems);

        // 2. 소프트웨어 도넛
        var swItems = (charts.software || []).map(function(d){
            return { label: d.label, val: d.value, color: SW_COLORS[d.key] || '#b2bcd4' };
        });
        renderDonut('chart-sw', 'legend-sw', swItems);

        // 3. 프로젝트 도넛 (holeRatio + showTotal)
        var prjItems = (charts.project || []).map(function(d, i){
            return { label: d.label, val: d.value, color: PRJ_COLORS[i % PRJ_COLORS.length] };
        });
        renderDonut('chart-prj', 'legend-prj', prjItems, { holeRatio: 0.75, showTotal: true });

        // 4. 유지보수 차트 (1m → 카테고리별 비용 막대, 3m/1y → 누적막대+추세선)
        renderMtceChartFromAPI(charts.maintenance || {}, charts.maintenance_by_type || [], range);

        // 5. 작업 차트 (1m → 당월 상태별 막대, 3m/1y → 월별 누적 막대)
        renderTaskChartFromAPI(charts.task || {}, range);
    }

    // ──── 유지보수 카테고리 색상 ────
    var MTCE_TYPE_COLORS = { 'HW': 'var(--accent, #6366f1)', 'SW': '#6b7fa8', 'ETC': '#9aa9bf' };
    var MTCE_LINE_COLORS = { 'HW': '#2d3f73', 'SW': '#e67e22', 'ETC': '#27ae60' };
    var MTCE_TYPE_LABELS = { 'HW': '하드웨어', 'SW': '소프트웨어', 'ETC': '기타 사용료' };
    var MTCE_TYPE_KEYS = ['HW', 'SW', 'ETC'];

    /** 유지보수: 1m → 카테고리별 그룹 막대, 3m/1y → 월별 누적막대 + 추세선 */
    function renderMtceChartFromAPI(monthly, byType, range){
        if(range === '1m'){
            renderMtceCategoryChart(byType);
        } else {
            renderMtceMultiChart(monthly);
        }
    }

    /** 1m: 하드웨어/소프트웨어/기타사용료 카테고리별 비용 막대 차트 */
    function renderMtceCategoryChart(byType){
        var el = document.getElementById('chart-mtce');
        var legend = document.getElementById('legend-mtce');
        if(!el) return;
        if(!byType || byType.length === 0){
            showNoData('chart-mtce', 'legend-mtce');
            return;
        }
        // 카테고리 라벨 & 데이터 준비
        var labels = MTCE_TYPE_KEYS.map(function(k){ return MTCE_TYPE_LABELS[k]; });
        var costData = MTCE_TYPE_KEYS.map(function(k){
            for(var i=0; i<byType.length; i++){
                if(byType[i].key === k) return toNum(byType[i].cost);
            }
            return 0;
        });

        if(!hasPositiveValueDeep(costData)){
            showNoData('chart-mtce', 'legend-mtce');
            return;
        }

        renderGroupedBarsWithLine('chart-mtce', labels, [costData], ['비용'], null, null);

        if(legend){
            var html = '';
            MTCE_TYPE_KEYS.forEach(function(key){
                var color = MTCE_TYPE_COLORS[key] || '#9aa9bf';
                html += '<span class="legend-item"><span class="legend-swatch" style="background:'+color+'"></span>'+MTCE_TYPE_LABELS[key]+'</span>';
            });
            legend.innerHTML = html;
        }
    }

    /** 3m/1y: 누적 막대(비용) */
    function renderMtceMultiChart(monthly){
        var months = Object.keys(monthly).sort();
        if(months.length === 0 || !hasPositiveValueDeep(monthly)){
            showNoData('chart-mtce', 'legend-mtce');
            return;
        }
        var labels = months.map(function(m){ return m.length >= 7 ? m.substring(5) + '월' : m; });

        var costSeriesList = [], seriesNames = [];
        MTCE_TYPE_KEYS.forEach(function(key){
            costSeriesList.push(months.map(function(m){
                var entry = monthly[m];
                return (entry && entry[key]) ? (entry[key].cost || 0) : 0;
            }));
            seriesNames.push(MTCE_TYPE_LABELS[key]);
        });

        renderStackedBars('chart-mtce', labels, costSeriesList, seriesNames);

        var legend = document.getElementById('legend-mtce');
        if(legend){
            var html = '';
            MTCE_TYPE_KEYS.forEach(function(key){
                var color = MTCE_TYPE_COLORS[key] || '#9aa9bf';
                html += '<span class="legend-item"><span class="legend-swatch" style="background:'+color+'"></span>'+MTCE_TYPE_LABELS[key]+'</span>';
            });
            legend.innerHTML = html;
        }
    }

    /** 작업: 1m → 당월 상태별 막대, 3m/1y → 월별 누적 막대 */
    function renderTaskChartFromAPI(monthly, range){
        var months = Object.keys(monthly).sort();
        if(months.length === 0 || !hasPositiveValueDeep(monthly)){
            showNoData('chart-task', 'legend-task');
            return;
        }

        var statusLabels = {
            'REVIEW': '검토', 'APPROVED': '승인', 'SCHEDULED': '예정',
            'IN_PROGRESS': '진행중', 'COMPLETED': '완료', 'ARCHIVED': '보관',
            'DRAFT': '초안', 'COUNT': '건수'
        };
        var sColors = ['var(--accent, #6366f1)','#6b7fa8','#9aa9bf','#b2bcd4'];

        if(range === '1m'){
            // 당월(최근 월) 상태별 건수 막대
            var curMonth = months[months.length - 1];
            var entry = monthly[curMonth];
            if(!entry || typeof entry !== 'object'){
                showNoData('chart-task', 'legend-task');
                return;
            }
            var keys = Object.keys(entry);
            var labels = keys.map(function(k){ return statusLabels[k] || k; });
            var vals = keys.map(function(k){ return toNum(entry[k]); });

            if(!hasPositiveValueDeep(vals)){
                showNoData('chart-task', 'legend-task');
                return;
            }

            renderGroupedBarsWithLine('chart-task', labels, [vals], ['건수'], null, null);

            var legend = document.getElementById('legend-task');
            if(legend){
                legend.innerHTML = labels.map(function(t, i){
                    return '<span class="legend-item"><span class="legend-swatch" style="background:'+sColors[i%sColors.length]+'"></span>'+t+'</span>';
                }).join('');
            }
            return;
        }

        // 3m/1y: 월별 누적 막대
        var labels = months.map(function(m){ return m.length >= 7 ? m.substring(5) + '월' : m; });

        var statusKeys = [];
        months.forEach(function(m){
            var entry = monthly[m];
            if(entry && typeof entry === 'object'){
                Object.keys(entry).forEach(function(k){
                    if(statusKeys.indexOf(k) === -1) statusKeys.push(k);
                });
            }
        });
        if(statusKeys.length === 0) statusKeys = ['COUNT'];

        var seriesList = statusKeys.map(function(k){
            return months.map(function(m){
                var entry = monthly[m];
                if(!entry || typeof entry !== 'object') return 0;
                return toNum(entry[k]);
            });
        });

        if(!hasPositiveValueDeep(seriesList)){
            showNoData('chart-task', 'legend-task');
            return;
        }
        var seriesNames = statusKeys.map(function(k){ return statusLabels[k] || k; });

        renderStackedBars('chart-task', labels, seriesList, seriesNames);

        var legend = document.getElementById('legend-task');
        if(legend){
            legend.innerHTML = seriesNames.map(function(t, i){
                return '<span class="legend-item"><span class="legend-swatch" style="background:'+sColors[i%sColors.length]+'"></span>'+t+'</span>';
            }).join('');
        }
    }

    // ──── 메인 렌더 ────
    function applyData(data){
        if(!data || !data.success){
            console.warn('[dashboard] API error', data);
            renderDashboardEmpty();
            return;
        }
        populateKPIs(data);
        renderCharts(data);
    }

    // ──── 날짜 표시 (원본 스타일) ────
    function setToday(){
        var el = document.getElementById('today-date'); if(!el) return;
        try{
            var d = new Date();
            var s = d.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'long' });
            el.textContent = '오늘 · ' + s;
        }catch(_e){ el.textContent = '오늘'; }
    }

    // ──── 초기화 ────
    function init(){
        setToday();

        var select = document.getElementById('range-select');
        var currentRange = select ? select.value : '1m';

        function loadData(range){
            fetchDashboard(range).then(applyData).catch(function(err){
                console.error('[dashboard] fetch error', err);
                renderDashboardEmpty();
            });
        }

        loadData(currentRange);

        if(select){
            select.addEventListener('change', function(){
                loadData(this.value);
            });
        }
    }

    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
