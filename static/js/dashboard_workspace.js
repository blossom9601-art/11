(function(){
  "use strict";

  var root = document.getElementById("lumina-dashboard-root");
  if(!root) return;

  var PAGE = window.__LUMINA_DASHBOARD_PAGE__ || "my";
  var STORE = "lumina.dashboard.workspace.v3";
  var SAMPLE_IDS = ["exec-ops","infra-linux","security-risk","network-edge"];
  var templateNames = ["Executive Dashboard","Infrastructure Dashboard","Security Dashboard","Performance Dashboard","Asset Dashboard","Certificate Dashboard","Network Dashboard","Container Dashboard","Project Dashboard"];

  function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function uuid(){
    if(window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c){
      var r = Math.random() * 16 | 0;
      var v = c === "x" ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  function today(offset){ var d = new Date(); d.setDate(d.getDate() + (offset || 0)); return d.toISOString().slice(0, 10); }
  function isSample(d){ return d && SAMPLE_IDS.indexOf(String(d.id || "")) >= 0; }

  function load(){
    try {
      var saved = JSON.parse(localStorage.getItem(STORE) || "{}");
      var dashboards = Array.isArray(saved.dashboards) ? saved.dashboards.filter(function(d){ return !isSample(d); }) : [];
      var next = {
        dashboards: dashboards,
        filters: saved.filters || {},
        view: saved.view || "card",
        name: saved.name || "",
        refresh: saved.refresh || "10s",
        range: saved.range || "Last 1 hour",
        dashboardWidgets: saved.dashboardWidgets || {}
      };
      if(Array.isArray(saved.dashboards) && saved.dashboards.length !== dashboards.length){
        localStorage.setItem(STORE, JSON.stringify(Object.assign({}, saved, {dashboards: dashboards})));
      }
      return next;
    } catch(_) {
      return {dashboards:[], filters:{}, view:"card", name:"", refresh:"10s", range:"Last 1 hour", dashboardWidgets:{}};
    }
  }

  var state = load();
  var currentDashboardId = null;
  var selectedWidgetId = null;

  function persist(){ localStorage.setItem(STORE, JSON.stringify(state)); }
  function builderUrl(id){ return "/b/dashboard_builder/" + encodeURIComponent(id || uuid()); }

  function tabUrl(key){
    return "/b/" + {
      my:"dashboard_my",
      shared:"dashboard_shared",
      favorite:"dashboard_favorite",
      templates:"dashboard_templates"
    }[key];
  }

  function pageFromHref(href){
    try {
      var path = new URL(href, location.origin).pathname.replace(/\/+$/, "");
      if(path === "/b/dashboard_shared") return "shared";
      if(path === "/b/dashboard_favorite") return "favorite";
      if(path === "/b/dashboard_templates") return "templates";
      if(path === "/b/dashboard_builder" || path.indexOf("/b/dashboard_builder/") === 0) return "builder";
      if(path === "/b/dashboard_workspace" || path === "/b/dashboard_my") return "my";
    } catch(_) {}
    return null;
  }

  function setBuilderMode(on){
    document.body.classList.toggle("dashboard-builder-active", !!on);
    var main = document.querySelector("main.main-content");
    if(main) main.classList.toggle("dashboard-builder-main", !!on);
  }

  function tabs(){
    var list = [["my","내 대시보드"],["shared","공유 대시보드"],["favorite","즐겨찾기"],["templates","템플릿"]];
    return '<div class="system-tabs" role="tablist" aria-label="제작 대시보드 탭">' +
      list.map(function(x){
        return '<button class="system-tab-btn ' + (PAGE === x[0] ? 'active' : '') + '" role="tab" type="button" data-dashboard-page="' + x[0] + '" data-dashboard-href="' + tabUrl(x[0]) + '">' + x[1] + '</button>';
      }).join("") +
    '</div>';
  }

  function shell(body){
    setBuilderMode(false);
    root.innerHTML =
      '<div class="content-wrapper">' +
        '<div class="page-header">' +
          '<h1>제작 대시보드</h1>' +
          '<p>대시보드를 관리합니다.</p>' +
        '</div>' +
        tabs() +
        '<div class="tab-content single-pane"><div class="tab-pane active" id="dashboard-workspace-pane">' + body + '</div></div>' +
      '</div>';
  }

  function titleForPage(){
    if(PAGE === "shared") return "공유 대시보드";
    if(PAGE === "favorite") return "즐겨찾기";
    if(PAGE === "templates") return "대시보드 템플릿";
    return "내 대시보드";
  }

  function rowsForPage(){
    var rows = state.dashboards.slice();
    if(PAGE === "shared") rows = rows.filter(function(d){ return d.share !== "Private"; });
    if(PAGE === "favorite") rows = rows.filter(function(d){ return d.favorite; });
    var q = (document.querySelector("#dw-search") || {}).value || "";
    q = q.trim().toLowerCase();
    if(q) rows = rows.filter(function(d){ return (d.name + " " + d.description + " " + (d.tags || []).join(" ")).toLowerCase().indexOf(q) >= 0; });
    return rows;
  }

  function tabHeader(count, includeView){
    return '<div class="tab-header">' +
      '<div class="tab-header-left"><h2>' + titleForPage() + ' <span class="count-badge" id="dw-count">' + count + '</span></h2></div>' +
      '<div class="tab-header-right">' +
        '<div class="search-container" role="search"><div class="search-input-wrapper" id="dw-search-wrapper">' +
          '<img src="/static/image/svg/list/free-icon-search.svg" alt="검색" class="search-icon">' +
          '<input type="text" id="dw-search" placeholder="검색" class="search-input" autocomplete="off">' +
          '<button type="button" class="search-clear-btn" id="dw-search-clear" title="지우기"><img src="/static/image/svg/list/free-icon-trash.svg" alt="" class="search-clear-icon"></button>' +
        '</div></div>' +
        (includeView ? '<div class="page-size-selector compact"><select id="dw-view" class="page-size-select dw-view-select"><option value="card">카드</option><option value="table">표</option></select></div>' : '') +
        '<div class="page-size-selector compact"><select id="dw-page-size" class="page-size-select"><option selected>10 개</option><option>20 개</option><option>50 개</option><option>100 개</option></select></div>' +
        '<button class="header-btn" id="dw-delete-btn" title="삭제"><img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="header-icon"></button>' +
        '<button class="header-btn" id="dw-create-btn" title="추가"><img src="/static/image/svg/list/free-icon-plus.svg" alt="추가" class="header-icon"></button>' +
      '</div>' +
    '</div>';
  }

  function badge(share){
    var cls = share === "Team" ? "team" : share === "Organization" ? "org" : share === "Public" ? "public" : "private";
    return '<span class="dw-badge dw-badge-' + cls + '">' + esc(share || "Private") + '</span>';
  }

  function miniChart(d){
    var label = esc(((d.tags || [])[0] || "ops").toUpperCase());
    return '<svg class="dw-mini-svg" viewBox="0 0 320 160" aria-hidden="true">' +
      '<rect x="10" y="10" width="300" height="140" rx="10" fill="#fff" stroke="#dbe3ef"/>' +
      '<g stroke="#e5e7eb" stroke-width="1"><path d="M34 44H286"/><path d="M34 78H286"/><path d="M34 112H286"/><path d="M76 28V132"/><path d="M132 28V132"/><path d="M188 28V132"/><path d="M244 28V132"/></g>' +
      '<path d="M34 112 L64 82 L92 96 L124 54 L154 84 L184 70 L218 102 L254 58 L286 86" fill="none" stroke="#6366f1" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M34 120 L64 108 L92 116 L124 96 L154 105 L184 94 L218 116 L254 96 L286 106" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>' +
      '<rect x="28" y="24" width="76" height="28" rx="6" fill="#eef2ff" stroke="#c7d2fe"/><text x="38" y="43" font-size="11" font-weight="700" fill="#475569">' + label + '</text>' +
    '</svg>';
  }

  function cardList(rows){
    return '<div class="dw-grid">' + rows.map(function(d){
      return '<article class="dw-card" data-open-dashboard="' + esc(d.id) + '">' +
        '<div class="dw-card-thumb">' + miniChart(d) + '</div>' +
        '<div class="dw-card-name">' + esc(d.name) + '</div>' +
        '<div class="dw-card-desc">' + esc(d.description) + '</div>' +
        '<div class="dw-card-meta">' +
          '<span class="dw-card-meta-left">' + badge(d.share) + '<span>' + esc(d.author) + '</span></span>' +
          '<button class="dw-like-btn ' + (d.favorite ? 'liked' : '') + '" data-fav="' + esc(d.id) + '" type="button">★ <span>' + (d.favorite ? "1" : "0") + '</span></button>' +
        '</div>' +
      '</article>';
    }).join("") + '</div>';
  }

  function tableList(rows){
    return '<div class="system-table-container server-table-container dw-table-container">' +
      '<table class="system-data-table server-data-table"><thead><tr>' +
        '<th>이름</th><th>설명</th><th style="width:120px;">작성자</th><th style="width:120px;">공유여부</th><th style="width:120px;">생성일</th><th style="width:120px;">수정일</th><th style="width:100px;">즐겨찾기</th><th style="width:160px;">태그</th>' +
      '</tr></thead><tbody>' +
      rows.map(function(d){
        return '<tr data-open-dashboard="' + esc(d.id) + '"><td><button class="dw-action-link" type="button">' + esc(d.name) + '</button></td><td>' + esc(d.description) + '</td><td>' + esc(d.author) + '</td><td>' + badge(d.share) + '</td><td>' + esc(d.createdAt) + '</td><td>' + esc(d.updatedAt) + '</td><td><button class="dw-like-btn ' + (d.favorite ? 'liked' : '') + '" data-fav="' + esc(d.id) + '">★</button></td><td>' + esc((d.tags || []).join(", ")) + '</td></tr>';
      }).join("") + '</tbody></table></div>';
  }

  function emptyBlock(title, text){
    return '<div id="system-empty" class="system-empty" role="status">' +
      '<div class="empty-illustration"><img src="/static/image/svg/list/free-icon-not-available.svg" alt="데이터 없음" class="empty-icon-img" loading="lazy"></div>' +
      '<div class="empty-text"><h3>' + title + '</h3><p>' + text + '</p></div>' +
    '</div>';
  }

  function pagination(total){
    var info = total ? "1-" + total + " / " + total + "개 항목" : "0-0 / 0개 항목";
    return '<div class="modern-pagination" id="dw-pagination">' +
      '<div class="pagination-info"><span id="dw-pagination-info">' + info + '</span></div>' +
      '<div class="pagination-controls">' +
        '<button class="pagination-btn" disabled><img src="/static/image/svg/expand_more.svg" class="pagination-icon rotate-90" alt="처음"></button>' +
        '<button class="pagination-btn" disabled><img src="/static/image/svg/expand_more.svg" class="pagination-icon rotate-90" alt="이전"></button>' +
        '<div class="page-numbers"><button class="page-number active" type="button">1</button></div>' +
        '<button class="pagination-btn" disabled><img src="/static/image/svg/expand_more.svg" class="pagination-icon rotate--90" alt="다음"></button>' +
        '<button class="pagination-btn" disabled><img src="/static/image/svg/expand_more.svg" class="pagination-icon rotate--90" alt="마지막"></button>' +
      '</div></div>';
  }

  function renderList(){
    var rows = rowsForPage();
    var emptyTitle = PAGE === "favorite" ? "즐겨찾기한 대시보드가 없습니다." : "대시보드가 없습니다.";
    shell(tabHeader(rows.length, true) + '<div id="dw-list-host">' + (rows.length ? (state.view === "table" ? tableList(rows) : cardList(rows)) : emptyBlock(emptyTitle, "우측 상단 추가 버튼을 눌러 대시보드를 만들어 보세요.")) + '</div>' + pagination(rows.length));
    var view = document.getElementById("dw-view");
    if(view) view.value = state.view;
  }

  function renderTemplates(){
    var rows = templateNames.map(function(name, i){
      return {id:"template-" + i, name:name, description:"Lumina Agent 데이터를 기반으로 KPI, 차트, 필터, Drill Down 구성을 자동 배치합니다.", author:"Lumina", share:"Organization", createdAt:today(0), updatedAt:today(0), favorite:false, tags:["template","dashboard"]};
    });
    shell(tabHeader(rows.length, false) + '<div class="dw-grid">' + rows.map(function(d){
      return '<article class="dw-card" data-template="' + esc(d.name) + '">' +
        '<div class="dw-card-thumb">' + miniChart(d) + '</div>' +
        '<div class="dw-card-name">' + esc(d.name) + '</div>' +
        '<div class="dw-card-desc">' + esc(d.description) + '</div>' +
        '<div class="dw-card-meta"><span class="dw-template-note">Lumina Template</span><button class="dw-like-btn" type="button">생성</button></div>' +
      '</article>';
    }).join("") + '</div>' + pagination(rows.length));
  }

  function routeDashboardId(){
    var parts = location.pathname.split("/").filter(Boolean);
    var id = parts[parts.length - 1] || "";
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
  }

  function activeDashboardId(){
    if(currentDashboardId) return currentDashboardId;
    currentDashboardId = routeDashboardId() || uuid();
    return currentDashboardId;
  }

  function widgetsForActive(){
    var id = activeDashboardId();
    state.dashboardWidgets = state.dashboardWidgets || {};
    if(!Array.isArray(state.dashboardWidgets[id])) state.dashboardWidgets[id] = [];
    return state.dashboardWidgets[id];
  }

  function widgetTitle(type){
    return {
      KPI: "KPI",
      Line: "라인 차트",
      Bar: "바 차트",
      Gauge: "게이지",
      Table: "테이블",
      Log: "로그 스트림",
      AI: "AI 인사이트"
    }[type] || type;
  }

  function widgetSize(type){
    if(type === "KPI" || type === "Gauge") return {w:260, h:150};
    if(type === "Table" || type === "Log" || type === "AI") return {w:420, h:210};
    return {w:380, h:210};
  }

  function widgetBody(w){
    if(w.type === "KPI") return '<div class="dw-editor-kpi"><strong>94</strong><span>avg cpu_usage</span><em>+8.2% 지난 1시간</em></div>';
    if(w.type === "Gauge") return '<div class="dw-editor-gauge"><svg viewBox="0 0 120 70"><path d="M18 62 A42 42 0 0 1 102 62" fill="none" stroke="#e5e7eb" stroke-width="12" stroke-linecap="round"/><path d="M18 62 A42 42 0 0 1 84 28" fill="none" stroke="#6366f1" stroke-width="12" stroke-linecap="round"/><text x="60" y="58" text-anchor="middle" font-size="18" font-weight="800" fill="#0f172a">72%</text></svg></div>';
    if(w.type === "Table") return '<table class="dw-editor-table"><thead><tr><th>Host</th><th>CPU</th><th>Status</th></tr></thead><tbody><tr><td>app-01</td><td>72%</td><td>normal</td></tr><tr><td>db-01</td><td>81%</td><td>watch</td></tr></tbody></table>';
    if(w.type === "Log") return '<pre class="dw-editor-log">[info] agent heartbeat received\n[warn] cpu threshold nearing limit\n[info] dashboard widget refreshed</pre>';
    if(w.type === "AI") return '<div class="dw-editor-ai"><strong>AI Insight</strong><p>최근 CPU 상승 추세가 감지되었습니다. app-01과 db-01의 프로세스 상세 확인을 권장합니다.</p></div>';
    if(w.type === "Bar") return '<svg class="dw-editor-chart" viewBox="0 0 320 140"><g fill="#6366f1"><rect x="28" y="70" width="34" height="78" rx="5"/><rect x="84" y="44" width="34" height="104" rx="5"/><rect x="140" y="84" width="34" height="64" rx="5"/><rect x="196" y="30" width="34" height="118" rx="5"/><rect x="252" y="58" width="34" height="90" rx="5"/></g><path d="M16 148H304" stroke="#cbd5e1"/></svg>';
    return '<svg class="dw-editor-chart" viewBox="0 0 320 140"><path d="M18 104 L54 72 L90 88 L126 42 L162 76 L198 52 L234 96 L270 64 L306 82" fill="none" stroke="#6366f1" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 116 L54 108 L90 112 L126 94 L162 102 L198 90 L234 116 L270 98 L306 106" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/></svg>';
  }

  function widgetMarkup(w){
    return '<article class="dw-editor-widget ' + (w.id === selectedWidgetId ? 'selected' : '') + '" data-editor-widget="' + esc(w.id) + '" style="left:' + w.x + 'px;top:' + w.y + 'px;width:' + w.w + 'px;height:' + w.h + 'px">' +
      '<div class="dw-editor-widget-head"><strong>' + esc(w.title) + '</strong><button type="button" data-editor-widget-delete="' + esc(w.id) + '" aria-label="삭제">×</button></div>' +
      '<div class="dw-editor-widget-body">' + widgetBody(w) + '</div>' +
    '</article>';
  }

  function renderProps(){
    var props = document.querySelector(".dw-editor-props");
    if(!props) return;
    var widgets = widgetsForActive();
    var selected = widgets.find(function(w){ return w.id === selectedWidgetId; }) || widgets[widgets.length - 1];
    if(selected && !selectedWidgetId) selectedWidgetId = selected.id;
    props.innerHTML = '<h3>위젯 설정</h3>' +
      (selected ? '<div class="dw-selected-widget"><strong>' + esc(selected.title) + '</strong><span>' + esc(selected.type) + '</span></div>' : '<p class="dw-prop-empty">캔버스에 배치할 위젯을 선택하세요.</p>') +
      '<label>데이터 소스<select><option>Performance</option><option>Asset</option><option>Process</option><option>Log</option><option>Security</option><option>Network</option></select></label>' +
      '<label>지표<input value="' + (selected && selected.metric ? esc(selected.metric) : 'cpu_usage') + '"></label>' +
      '<label>집계<select><option>avg</option><option>max</option><option>p95</option><option>count</option></select></label>' +
      (selected ? '<button type="button" class="dw-prop-delete" data-editor-widget-delete="' + esc(selected.id) + '">위젯 삭제</button>' : '');
  }

  function renderEditorWidgets(){
    var canvas = document.querySelector(".dw-editor-canvas");
    if(!canvas) return;
    var widgets = widgetsForActive();
    canvas.classList.toggle("has-widgets", widgets.length > 0);
    Array.prototype.slice.call(canvas.querySelectorAll(".dw-editor-widget")).forEach(function(node){ node.remove(); });
    widgets.forEach(function(w){ canvas.insertAdjacentHTML("beforeend", widgetMarkup(w)); });
    renderProps();
  }

  function addEditorWidget(type){
    var widgets = widgetsForActive();
    var size = widgetSize(type);
    var index = widgets.length;
    var widget = {
      id: uuid(),
      type: type,
      title: widgetTitle(type),
      metric: type === "Log" ? "log_message" : "cpu_usage",
      x: 28 + (index % 2) * 420,
      y: 28 + Math.floor(index / 2) * 240,
      w: size.w,
      h: size.h
    };
    widgets.push(widget);
    selectedWidgetId = widget.id;
    persist();
    renderEditorWidgets();
  }

  function deleteEditorWidget(id){
    var widgets = widgetsForActive();
    state.dashboardWidgets[activeDashboardId()] = widgets.filter(function(w){ return w.id !== id; });
    if(selectedWidgetId === id) selectedWidgetId = null;
    persist();
    renderEditorWidgets();
  }

  function createChoiceScreen(){
    var defaultName = state.name || "새 대시보드";
    setBuilderMode(true);
    root.innerHTML = '<section class="dw-full-create" aria-labelledby="dw-create-title">' +
      '<div class="dw-create-window">' +
        '<div class="dw-create-head"><div><h1 id="dw-create-title">대시보드 만들기</h1><p>레이아웃 방식을 선택하고 제작을 시작합니다.</p></div><button class="dw-create-close" type="button" data-builder-close aria-label="닫기">×</button></div>' +
        '<div class="dw-create-form"><label>대시보드 이름<input id="dw-new-name" value="' + esc(defaultName) + '"></label><label>팀<select id="dw-new-team"><option>운영팀</option><option>보안팀</option><option>네트워크팀</option><option>관리자</option></select></label></div>' +
        '<div class="dw-create-layouts">' +
          '<div class="dw-create-primary"><div class="dw-layout-preview dw-layout-grid"><span></span><span></span><span></span><span></span></div><strong>그리드 대시보드</strong><p>위젯을 격자에 맞춰 빠르게 배치합니다.</p><button class="dw-start-dashboard" type="button" data-start-dashboard>대시보드 시작</button></div>' +
          '<div class="dw-create-secondary">' +
            '<div class="dw-layout-card"><div class="dw-layout-icon timeboard"></div><div><strong>반응형 보드</strong><p>화면 크기에 맞춰 위젯 흐름을 자동 정렬합니다.</p><button type="button" data-start-dashboard>반응형으로 시작</button></div></div>' +
            '<div class="dw-layout-card"><div class="dw-layout-icon screenboard"></div><div><strong>자유 배치 보드</strong><p>넓은 캔버스에 원하는 위치로 세밀하게 배치합니다.</p><button type="button" data-start-dashboard>자유 배치로 시작</button></div></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function renderEditorCanvas(){
    setBuilderMode(true);
    currentDashboardId = activeDashboardId();
    root.innerHTML = '<section class="dw-editor-shell">' +
      '<header class="dw-editor-topbar"><div><strong id="dw-editor-title">' + esc(state.name || "새 대시보드") + '</strong><span id="dw-editor-status">작성 중</span></div><div class="dw-editor-actions"><button type="button" data-editor-action="share">공유</button><button type="button" data-editor-action="export">내보내기</button><button type="button" class="primary" data-editor-action="save">저장</button><button type="button" data-builder-close>목록</button></div></header>' +
      '<div class="dw-editor-body"><aside class="dw-editor-tools"><button type="button" data-editor-tool="KPI">KPI</button><button type="button" data-editor-tool="Line">Line</button><button type="button" data-editor-tool="Bar">Bar</button><button type="button" data-editor-tool="Gauge">Gauge</button><button type="button" data-editor-tool="Table">Table</button><button type="button" data-editor-tool="Log">Log</button><button type="button" data-editor-tool="AI">AI</button></aside>' +
      '<main class="dw-editor-canvas"><div class="dw-editor-empty"><h2>위젯을 배치해 대시보드를 시작하세요.</h2><p>왼쪽 위젯을 클릭하면 캔버스에 추가됩니다.</p></div></main>' +
      '<aside class="dw-editor-props"></aside></div>' +
    '</section>';
    renderEditorWidgets();
  }

  function renderBuilder(){
    createChoiceScreen();
  }

  function openDashboard(dashboard){
    state.name = dashboard && dashboard.name ? dashboard.name : state.name;
    persist();
    location.href = builderUrl(dashboard && dashboard.id ? dashboard.id : null);
  }

  document.addEventListener("click", function(e){
    var dashboardTab = e.target.closest("[data-dashboard-page]");
    if(dashboardTab){
      PAGE = dashboardTab.getAttribute("data-dashboard-page") || "my";
      history.pushState({ dashboardWorkspace: true, page: PAGE }, "", dashboardTab.getAttribute("data-dashboard-href") || tabUrl(PAGE));
      renderCurrent();
      return;
    }
    var editorTool = e.target.closest("[data-editor-tool]");
    if(editorTool){
      addEditorWidget(editorTool.getAttribute("data-editor-tool"));
      return;
    }
    var widgetDelete = e.target.closest("[data-editor-widget-delete]");
    if(widgetDelete){
      deleteEditorWidget(widgetDelete.getAttribute("data-editor-widget-delete"));
      return;
    }
    var editorWidget = e.target.closest("[data-editor-widget]");
    if(editorWidget){
      selectedWidgetId = editorWidget.getAttribute("data-editor-widget");
      renderEditorWidgets();
      return;
    }
    var editorAction = e.target.closest("[data-editor-action]");
    if(editorAction){
      var action = editorAction.getAttribute("data-editor-action");
      var status = document.getElementById("dw-editor-status");
      persist();
      if(status){
        status.textContent = action === "save" ? "저장됨" : (action === "share" ? "공유 설정 준비됨" : "내보내기 준비됨");
      }
      return;
    }
    if(e.target.closest("[data-builder-close]")){
      location.href = "/b/dashboard_my";
      return;
    }
    if(e.target.closest("[data-start-dashboard]")){
      var nameInput = document.getElementById("dw-new-name");
      var teamInput = document.getElementById("dw-new-team");
      var name = nameInput && nameInput.value.trim() ? nameInput.value.trim() : "새 대시보드";
      var now = today(0);
      var id = pageFromHref(location.href) === "builder" ? location.pathname.split("/").filter(Boolean).pop() : uuid();
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) id = uuid();
      currentDashboardId = id;
      state.name = name;
      state.dashboards.push({id:id, name:name, description:"", author:(teamInput && teamInput.value) || "운영팀", share:"Private", createdAt:now, updatedAt:now, favorite:false, tags:[]});
      widgetsForActive();
      persist();
      if(location.pathname !== "/b/dashboard_builder/" + id) history.replaceState({dashboardBuilder:true, id:id}, "", builderUrl(id));
      renderEditorCanvas();
      return;
    }
    var create = e.target.closest("#dw-create-btn");
    if(create){ location.href = builderUrl(); return; }
    var clear = e.target.closest("#dw-search-clear");
    if(clear){ var s = document.getElementById("dw-search"); if(s){ s.value = ""; renderCurrent(); } return; }
    var fav = e.target.closest("[data-fav]");
    if(fav){ state.dashboards.forEach(function(d){ if(d.id === fav.getAttribute("data-fav")) d.favorite = !d.favorite; }); persist(); renderCurrent(); return; }
    var open = e.target.closest("[data-open-dashboard]");
    if(open && !e.target.closest("[data-fav]")){
      var dash = state.dashboards.find(function(d){ return d.id === open.getAttribute("data-open-dashboard"); });
      openDashboard(dash);
      return;
    }
    var tmpl = e.target.closest("[data-template]");
    if(tmpl){ state.name = tmpl.getAttribute("data-template") || ""; persist(); location.href = builderUrl(); return; }
  });

  window.addEventListener("popstate", function(){
    var next = pageFromHref(location.href);
    if(!next) return;
    PAGE = next;
    renderCurrent();
  });

  document.addEventListener("input", function(e){
    if(e.target.matches("#dw-search")) renderCurrent();
  });

  document.addEventListener("change", function(e){
    if(e.target.matches("#dw-view")){ state.view = e.target.value; persist(); renderCurrent(); }
  });

  function renderCurrent(){
    if(PAGE === "builder") renderBuilder();
    else if(PAGE === "templates") renderTemplates();
    else renderList();
  }

  renderCurrent();
})();
