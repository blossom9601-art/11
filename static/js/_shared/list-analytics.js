/**
 * list-analytics.js — 리스트 페이지 통계 분석 모달 (공유 모듈)
 *
 * 필수 전역 변수:
 *   window.__analyticsConfig  — 차트 설정 (chartType, catField, typeField, modelField, tabOrder)
 *   window.__analyticsGetData — 현재 필터/전체 데이터 반환 함수
 */
(function(){
    'use strict';

    /* ── helpers (local openModal / closeModal) ── */
    function _openModal(id){
        var el = document.getElementById(id); if(!el) return;
        document.body.classList.add('modal-open');
        el.classList.add('show');
        el.setAttribute('aria-hidden','false');
    }
    function _closeModal(id){
        var el = document.getElementById(id); if(!el) return;
        el.classList.remove('show');
        el.setAttribute('aria-hidden','true');
        if(!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show')){
            document.body.classList.remove('modal-open');
        }
    }

    /* ── colour palette (10 colours, shared) ── */
    var COLORS = ['#6366F1','#3b82f6','#0ea5e9','#14b8a6','#22c55e','#eab308','#f97316','#ef4444','#a855f7','#94a3b8'];

    /* ── IDs ── */
    var MODAL_ID = 'system-analytics-modal';
    var BTN_ID   = 'system-analytics-btn';
    var CLOSE_ID = 'system-analytics-close';
    var EMPTY_ID = 'analytics-empty';
    var STRIP_ID = 'analytics-tab-strip';
    var CONT_ID  = 'analytics-tab-content';

    function initAnalytics(){
        var cfg = window.__analyticsConfig;
        if(!cfg) return;

        var analyticsBtn   = document.getElementById(BTN_ID);
        var analyticsModal = document.getElementById(MODAL_ID);
        var analyticsClose = document.getElementById(CLOSE_ID);
        var analyticsEmpty = document.getElementById(EMPTY_ID);
        var tabStrip       = document.getElementById(STRIP_ID);
        var tabContent     = document.getElementById(CONT_ID);

        if(!analyticsBtn || !analyticsModal) return;

        /* floating tooltip (created once) */
        var tip = document.createElement('div');
        tip.className = 'va-sb-tooltip';
        tip.style.display = 'none';
        document.body.appendChild(tip);

        /* ── tooltip delegation (bound once on tabContent) ── */
        if(tabContent){
            tabContent.addEventListener('mouseover', function(e){
                var seg = e.target.closest('.va-sb-seg, .va-donut-seg');
                if(!seg) return;
                tip.innerHTML = '<span class="va-sb-tip-dot" style="background:'+seg.dataset.color+'"></span>'
                    +'<span class="va-sb-tip-name">'+seg.dataset.name+'</span>'
                    +'<span class="va-sb-tip-val">'+seg.dataset.count+'건 ('+seg.dataset.pct+'%)</span>';
                tip.style.display = '';
            });
            tabContent.addEventListener('mousemove', function(e){
                if(tip.style.display==='none') return;
                tip.style.left = (e.clientX+12)+'px';
                tip.style.top  = (e.clientY-36)+'px';
            });
            tabContent.addEventListener('mouseout', function(e){
                if(e.target.closest('.va-sb-seg, .va-donut-seg')) tip.style.display='none';
            });
        }

        /* ── data access ── */
        function getItems(){
            return (typeof window.__analyticsGetData==='function') ? window.__analyticsGetData() : [];
        }

        /* ── build category map ── */
        function buildCatMap(items){
            var map = {};
            var catF   = cfg.catField   || 'vendor';
            var typeF  = cfg.typeField;
            var modelF = cfg.modelField || 'model';

            (items||[]).forEach(function(it){
                var cat   = (String(it[catF]||'').trim()) || '-';
                var model = (String(it[modelF]||'').trim()) || '-';

                if(cfg.chartType==='stacked' && typeF){
                    var type = (String(it[typeF]||'').trim()) || '-';
                    if(!map[cat]) map[cat] = {count:0, types:{}};
                    map[cat].count++;
                    if(!map[cat].types[type]) map[cat].types[type] = {count:0, models:{}};
                    map[cat].types[type].count++;
                    map[cat].types[type].models[model] = (map[cat].types[type].models[model]||0)+1;
                } else {
                    if(!map[cat]) map[cat] = {count:0, models:{}};
                    map[cat].count++;
                    map[cat].models[model] = (map[cat].models[model]||0)+1;
                }
            });
            return map;
        }

        /* ── tab strip ── */
        function renderTabStrip(catMap){
            if(!tabStrip) return [];
            var all  = Object.keys(catMap);
            var cats = [];
            var order = cfg.tabOrder || [];
            order.forEach(function(t){ if(all.indexOf(t)>=0) cats.push(t); });
            all.forEach(function(t){ if(cats.indexOf(t)<0) cats.push(t); });
            var html = '';
            cats.forEach(function(c,i){
                html += '<button class="va-tab'+(i===0?' active':'')+'" data-cat="'+c+'">'+c
                    +' <span class="va-tab-count">'+catMap[c].count+'</span></button>';
            });
            tabStrip.innerHTML = html;
            return cats;
        }

        /* ── stacked-bar content ── */
        function renderStackedContent(catData){
            if(!tabContent) return;
            var allTypes = Object.keys(catData.types||{});
            allTypes.sort(function(a,b){ return ((catData.types[b]||{}).count||0) - ((catData.types[a]||{}).count||0); });
            var html = '';
            allTypes.forEach(function(type){
                var td = catData.types[type];
                html += '<div class="va-type-section">';
                html += '<div class="va-type-header"><span class="va-type-name">'+type+'</span><span class="va-type-count">'+td.count+'건</span></div>';
                var models = Object.keys(td.models).sort(function(a,b){ return td.models[b]-td.models[a]; });
                var segs=[], etcCount=0;
                models.forEach(function(m,i){ if(i<9) segs.push({name:m,count:td.models[m]}); else etcCount+=td.models[m]; });
                if(etcCount>0) segs.push({name:'기타 ('+(models.length-9)+'종)',count:etcCount});
                html += '<div class="va-sb-bar">';
                segs.forEach(function(seg,si){
                    var pct = td.count>0 ? (seg.count/td.count*100) : 0;
                    var pctStr = pct.toFixed(1);
                    var col = COLORS[si%COLORS.length];
                    html += '<span class="va-sb-seg" style="width:'+pctStr+'%;background:'+col+'"'
                        +' data-name="'+seg.name.replace(/"/g,'&quot;')+'"'
                        +' data-count="'+seg.count+'"'
                        +' data-pct="'+pctStr+'"'
                        +' data-color="'+col+'"'
                        +'></span>';
                });
                html += '</div>';
                html += '<div class="va-sb-legend">';
                segs.forEach(function(seg,si){
                    var col = COLORS[si%COLORS.length];
                    html += '<span class="va-sb-chip"><span class="va-sb-dot" style="background:'+col+'"></span>'+seg.name+' <b>'+seg.count+'</b></span>';
                });
                html += '</div></div>';
            });
            tabContent.innerHTML = html;
        }

        /* ── donut content ── */
        function renderDonutContent(catData){
            if(!tabContent) return;
            var models = Object.keys(catData.models).sort(function(a,b){ return catData.models[b]-catData.models[a]; });
            var segs=[], etcCount=0;
            models.forEach(function(m,i){ if(i<9) segs.push({name:m,count:catData.models[m]}); else etcCount+=catData.models[m]; });
            if(etcCount>0) segs.push({name:'기타 ('+(models.length-9)+'종)',count:etcCount});

            var total=catData.count, R=120, r=76, cx=140, cy=140, svgSize=280;
            var paths='', angle=-90;

            segs.forEach(function(seg,si){
                var pct = total>0 ? (seg.count/total) : 0;
                var sweep = pct*360;
                if(sweep<=0) return;
                var col = COLORS[si%COLORS.length];
                var pctStr = (pct*100).toFixed(1);

                if(sweep>=359.99){
                    paths += '<path d="M'+cx+','+(cy-R)
                        +' A'+R+','+R+' 0 1,1 '+cx+','+(cy+R)
                        +' A'+R+','+R+' 0 1,1 '+cx+','+(cy-R)
                        +' M'+cx+','+(cy-r)
                        +' A'+r+','+r+' 0 1,0 '+cx+','+(cy+r)
                        +' A'+r+','+r+' 0 1,0 '+cx+','+(cy-r)
                        +'Z" fill="'+col+'" class="va-donut-seg"'
                        +' data-name="'+seg.name.replace(/"/g,'&quot;')+'"'
                        +' data-count="'+seg.count+'" data-pct="'+pctStr+'" data-color="'+col+'"/>';
                } else {
                    var a1=angle*Math.PI/180, a2=(angle+sweep)*Math.PI/180;
                    var large=sweep>180?1:0;
                    var ox1=cx+R*Math.cos(a1), oy1=cy+R*Math.sin(a1);
                    var ox2=cx+R*Math.cos(a2), oy2=cy+R*Math.sin(a2);
                    var ix2=cx+r*Math.cos(a2), iy2=cy+r*Math.sin(a2);
                    var ix1=cx+r*Math.cos(a1), iy1=cy+r*Math.sin(a1);
                    paths += '<path d="M'+ox1.toFixed(2)+','+oy1.toFixed(2)
                        +' A'+R+','+R+' 0 '+large+',1 '+ox2.toFixed(2)+','+oy2.toFixed(2)
                        +' L'+ix2.toFixed(2)+','+iy2.toFixed(2)
                        +' A'+r+','+r+' 0 '+large+',0 '+ix1.toFixed(2)+','+iy1.toFixed(2)
                        +'Z" fill="'+col+'" class="va-donut-seg"'
                        +' data-name="'+seg.name.replace(/"/g,'&quot;')+'"'
                        +' data-count="'+seg.count+'" data-pct="'+pctStr+'" data-color="'+col+'"/>';
                }
                angle += sweep;
            });

            var html = '<div class="va-donut-wrap">';
            html += '<div class="va-donut-chart">';
            html += '<svg viewBox="0 0 '+svgSize+' '+svgSize+'">'+paths+'</svg>';
            html += '<div class="va-donut-center"><span class="va-donut-total">'+total+'</span><span class="va-donut-label">건</span></div>';
            html += '</div>';
            html += '<div class="va-donut-legend">';
            segs.forEach(function(seg,si){
                var col = COLORS[si%COLORS.length];
                var pct = total>0 ? (seg.count/total*100).toFixed(1) : '0.0';
                html += '<div class="va-donut-legend-item">';
                html += '<span class="va-donut-ldot" style="background:'+col+'"></span>';
                html += '<span class="va-donut-lname">'+seg.name+'</span>';
                html += '<span class="va-donut-lval">'+seg.count+'</span>';
                html += '<span class="va-donut-lpct">'+pct+'%</span>';
                html += '</div>';
            });
            html += '</div></div>';
            tabContent.innerHTML = html;
        }

        /* ── dispatch render by chart type ── */
        function renderContent(catData){
            if(cfg.chartType==='stacked') renderStackedContent(catData);
            else renderDonutContent(catData);
        }

        /* ── main render ── */
        function renderAnalytics(){
            var items = getItems();
            if(!items.length){
                if(analyticsEmpty) analyticsEmpty.style.display='';
                if(tabStrip) tabStrip.innerHTML='';
                if(tabContent) tabContent.innerHTML='';
                return;
            }
            if(analyticsEmpty) analyticsEmpty.style.display='none';
            var catMap = buildCatMap(items);
            var cats   = renderTabStrip(catMap);
            if(cats.length>0) renderContent(catMap[cats[0]]);
            if(tabStrip) tabStrip.onclick = function(e){
                var btn = e.target.closest('.va-tab');
                if(!btn) return;
                tabStrip.querySelectorAll('.va-tab').forEach(function(t){ t.classList.remove('active'); });
                btn.classList.add('active');
                var cat = btn.getAttribute('data-cat');
                if(catMap[cat]) renderContent(catMap[cat]);
            };
        }

        /* ── event bindings ── */
        analyticsBtn.addEventListener('click', function(){
            renderAnalytics();
            _openModal(MODAL_ID);
        });
        analyticsClose.addEventListener('click', function(){ _closeModal(MODAL_ID); });
        analyticsModal.addEventListener('click', function(e){
            if(e.target===analyticsModal) _closeModal(MODAL_ID);
        });
    }

    /* ── bootstrap ── */
    if(document.readyState==='loading'){
        document.addEventListener('DOMContentLoaded', initAnalytics);
    } else {
        initAnalytics();
    }
})();
