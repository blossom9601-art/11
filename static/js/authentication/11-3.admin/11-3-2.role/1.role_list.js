(function(){
    'use strict';
    /*
     * SPA 재진입 대응:
     * - 전역 가드(window.__roleListInitialized) 대신 DOM 마커(`#perm-role-matrix[data-role-init]`)로 초기화 여부를 판단한다.
     * - main.main-content 가 SPA 네비게이션으로 교체되면 마커가 사라지므로 init()이 다시 실행된다.
     * - 문서 레벨 리스너(드롭다운 outside-click, beforeunload)는 한 번만 바인딩하기 위해 별도 플래그를 둔다.
     * - 이전 선택(role/dept/section/source)은 sessionStorage 에 보존하여 재진입 시 복원한다.
     * - SPA 가 매 navigation 마다 이 스크립트를 새로 평가하므로(IIFE 가 누적 실행)
     *   각 인스턴스는 window.__roleListGen 카운터로 자기 세대를 기억한다.
     *   비동기 콜백/이벤트 핸들러는 자기 세대가 최신인지 확인 후 동작 → race 방지.
     */
    window.__roleListGen = (window.__roleListGen || 0) + 1;
    var MY_GEN = window.__roleListGen;
    function isLatest(){ return window.__roleListGen === MY_GEN; }

    /* == API URLs == */
    var API = {
        menus:      '/api/menus',
        roles:      '/api/roles',
        rolePerms:  function(id){ return '/api/roles/' + id + '/permissions'; },
        createRole: '/api/permission/roles',
        depts:      '/api/departments',
        deptPerms:  function(id){ return '/api/departments/' + id + '/permissions'; },
        detailPages:     '/api/detail-pages',
        roleDetailPerms: function(id){ return '/api/roles/' + id + '/detail-permissions'; },
        deptDetailPerms: function(id){ return '/api/departments/' + id + '/detail-permissions'; }
    };

    /* == State == */
    var menuTree = [], flatMenus = [];
    var detailTree = [], flatDetails = [];
    var allRoles = [], allDepts = [];
    var currentSource = 'role';
    var currentSection = 'menu';   /* 'menu' | 'detail' */
    var currentRoleId = null, currentDeptId = null;
    var currentRoleName = '';
    var dirtyPerms = {}, originalPerms = {};
    var dirtyDetailPerms = {}, originalDetailPerms = {};
    var saving = false, statusTimer = null;
    var searchTimerRole = null, searchTimerDept = null;
    var pendingConfirmCb = null;

    /* == 권한 등급 헬퍼 == */
    var PERM_RANK = { 'NONE': 0, 'READ': 1, 'WRITE': 2 };
    function permRank(p){ return PERM_RANK[p] || 0; }
    function getParentCode(code){
        var idx = code.lastIndexOf('.');
        return idx > 0 ? code.substring(0, idx) : null;
    }
    function isAdminRole(){
        var n = (currentRoleName || '').toLowerCase();
        return n === '관리자' || n === 'admin' || n === 'administrator';
    }

    /* == Init == */
    var STORAGE_KEY = 'roleList.lastSelection.v1';

    function readSavedSelection(){
        try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch(_e){ return {}; }
    }
    function saveSelection(){
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
                source: currentSource,
                section: currentSection,
                roleId: currentRoleId,
                roleName: currentRoleName,
                deptId: currentDeptId
            }));
        } catch(_e){}
    }

    function isRoleListPage(){
        return !!document.querySelector('#perm-role-matrix');
    }

    function init(){
        if(!isLatest()){ return; }
        var matrix = document.getElementById('perm-role-matrix');
        if(!matrix) return;                       // 화면권한 페이지가 아니면 종료
        if(matrix.getAttribute('data-role-init') === String(MY_GEN)) return; // 같은 세대의 중복 init 방지
        matrix.setAttribute('data-role-init', String(MY_GEN));

        // 이전 SPA 인스턴스 상태 초기화 (새 DOM 이므로 모듈 변수도 리셋)
        menuTree = []; flatMenus = [];
        detailTree = []; flatDetails = [];
        allRoles = []; allDepts = [];
        currentRoleId = null; currentDeptId = null; currentRoleName = '';
        dirtyPerms = {}; originalPerms = {};
        dirtyDetailPerms = {}; originalDetailPerms = {};

        // 이전 선택 복원 (탭/소스/섹션은 즉시 반영, role/dept 는 목록 로드 후 적용)
        var saved = readSavedSelection();
        if(saved.source === 'dept' || saved.source === 'role') currentSource = saved.source;
        if(saved.section === 'detail' || saved.section === 'menu') currentSection = saved.section;

        bindSectionToggle();
        bindSourceToggle();
        bindRoleSearch();
        bindRoleChipClear();
        bindDeptSearch();
        bindDeptChipClear();
        bindSave();
        bindAddRole();
        bindBeforeUnload();
        bindSystemTabGuard();
        initMessageModal();
        initConfirmModal();

        // 토글/패널 UI 를 저장된 source/section 기준으로 동기화
        try {
            var secBtns = document.querySelectorAll('.perm-section-btn');
            for(var i=0;i<secBtns.length;i++) secBtns[i].classList.toggle('active', secBtns[i].getAttribute('data-section')===currentSection);
            var srcBtns = document.querySelectorAll('.perm-source-btn');
            for(var j=0;j<srcBtns.length;j++) srcBtns[j].classList.toggle('active', srcBtns[j].getAttribute('data-source')===currentSource);
            var rolePanel = document.getElementById('perm-panel-role');
            var deptPanel = document.getElementById('perm-panel-dept');
            if(rolePanel) rolePanel.style.display = (currentSource==='role') ? '' : 'none';
            if(deptPanel) deptPanel.style.display = (currentSource==='dept') ? '' : 'none';
        } catch(_e){}

        loadMenus();
        loadDetailPages();
        if(currentSource === 'dept') loadDepts(true);
    }

    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    /*
     * SPA 재진입 대응 - 멀티 IIFE 인스턴스 race 방지:
     * SPA 는 매 navigation 마다 이 스크립트를 새로 평가한다 → IIFE 가 누적 실행되어
     * 여러 인스턴스가 각자의 closure 상태(flatMenus 등) 로 동시에 init() 을 돌리는 race
     * 가 발생할 수 있다.  해결: 항상 "최신" 인스턴스의 init 만 window.__roleListPage 에 등록하고
     * 모든 트리거(blossom:pageLoaded / popstate / mutation observer)는 그 최신 init 만 호출한다.
     */
    window.__roleListPage = { init: init, isPage: isRoleListPage };

    if(!window.__roleListPageLoadedBound){
        window.__roleListPageLoadedBound = true;
        var triggerInit = function(reason){
            var page = window.__roleListPage;
            if(!page || !page.isPage()) return;
            try { page.init(); } catch(_e){}
        };
        document.addEventListener('blossom:pageLoaded', function(){ triggerInit('blossom:pageLoaded'); });
        document.addEventListener('blossom:spa:navigated', function(){ triggerInit('blossom:spa:navigated'); });
        window.addEventListener('popstate', function(){ setTimeout(function(){ triggerInit('popstate'); }, 50); });

        // 마지막 보루: main 이 교체되어도 위 이벤트가 누락될 가능성에 대비하여
        // body 의 자식 변화(=main 교체)를 관찰해 매트릭스가 새로 들어오면 init 호출.
        try {
            var mo = new MutationObserver(function(mutations){
                for(var i=0;i<mutations.length;i++){
                    var m = mutations[i];
                    for(var j=0;j<m.addedNodes.length;j++){
                        var n = m.addedNodes[j];
                        if(n && n.nodeType === 1){
                            if(n.id === 'perm-role-matrix' || (n.querySelector && n.querySelector('#perm-role-matrix'))){
                                triggerInit('mutation-observer');
                                return;
                            }
                        }
                    }
                }
            });
            mo.observe(document.body, { childList: true, subtree: true });
        } catch(_e){}
    }

    /* ====== Section Toggle (메뉴화면권한 / 상세화면권한) ====== */
    function bindSectionToggle(){
        var wrap = document.getElementById('perm-section-toggle');
        if(!wrap) return;
        wrap.addEventListener('click', function(e){
            var btn = closestByClass(e.target, 'perm-section-btn');
            if(!btn) return;
            var sec = btn.getAttribute('data-section');
            if(sec === currentSection) return;
            if(hasDirtyChanges()){
                showConfirm('저장하지 않은 변경사항이 있습니다.\n계속 진행하시겠습니까?', function(){ switchSection(sec); });
                return;
            }
            switchSection(sec);
        });
    }

    function switchSection(sec){
        currentSection = sec;
        saveSelection();
        var btns = document.querySelectorAll('.perm-section-btn');
        for(var i=0;i<btns.length;i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-section')===sec);
        /* 매트릭스 초기화 */
        var matrix = document.getElementById('perm-role-matrix');
        if(matrix) matrix.innerHTML = '';
        /* 현재 선택된 대상이 있으면 해당 섹션 권한 로드 */
        if(sec === 'menu'){
            dirtyDetailPerms = {}; originalDetailPerms = {};
            var targetId = (currentSource==='dept') ? currentDeptId : currentRoleId;
            if(targetId) loadPermissions(targetId, currentSource);
        } else {
            dirtyPerms = {}; originalPerms = {};
            var targetId2 = (currentSource==='dept') ? currentDeptId : currentRoleId;
            if(targetId2) loadDetailPermissions(targetId2, currentSource);
        }
        updateSaveState();
    }

    /* ====== Source Toggle ====== */
    function bindSourceToggle(){
        var wrap = document.getElementById('perm-source-toggle');
        if(!wrap) return;
        wrap.addEventListener('click', function(e){
            var btn = closestByClass(e.target, 'perm-source-btn');
            if(!btn) return;
            var src = btn.getAttribute('data-source');
            if(src === currentSource) return;
            if(hasDirtyChanges()){
                showConfirm('저장하지 않은 변경사항이 있습니다.\n계속 진행하시겠습니까?', function(){ switchSource(src); });
                return;
            }
            switchSource(src);
        });
    }

    function switchSource(src){
        currentSource = src;
        saveSelection();
        dirtyPerms = {}; originalPerms = {};
        dirtyDetailPerms = {}; originalDetailPerms = {};
        var btns = document.querySelectorAll('.perm-source-btn');
        for(var i=0;i<btns.length;i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-source')===src);
        var rolePanel = document.getElementById('perm-panel-role');
        var deptPanel = document.getElementById('perm-panel-dept');
        if(rolePanel) rolePanel.style.display = (src==='role') ? '' : 'none';
        if(deptPanel) deptPanel.style.display = (src==='dept') ? '' : 'none';
        var matrix = document.getElementById('perm-role-matrix');
        if(matrix) matrix.innerHTML = '';
        if(src === 'role'){
            if(currentRoleId){
                if(currentSection === 'detail') loadDetailPermissions(currentRoleId, 'role');
                else loadPermissions(currentRoleId, 'role');
            }
        } else {
            if(!allDepts.length) loadDepts(true);
            else if(currentDeptId){
                if(currentSection === 'detail') loadDetailPermissions(currentDeptId, 'dept');
                else loadPermissions(currentDeptId, 'dept');
            }
        }
        updateSaveState();
    }

    /* ====== Menu Load ====== */
    function loadMenus(){
        apiFetch(API.menus)
            .then(function(data){
                if(!isLatest()) return;
                menuTree = (data && data.menus) || [];
                flatMenus = flattenTree(menuTree, 0);
                loadRoles(true);
            })
            .catch(function(err){
                console.error('[role_list] loadMenus failed:', err);
                if(err && err.message === 'session_expired') return;
                showMessage('오류', '메뉴 목록을 불러오지 못했습니다.');
            });
    }

    function flattenTree(nodes, depth){
        var result = [];
        for(var i=0;i<nodes.length;i++){
            var n = nodes[i];
            result.push({ id:n.id, menu_code:n.menu_code, menu_name:n.menu_name, depth:depth, parent_menu_id:n.parent_menu_id });
            if(n.children && n.children.length){
                var kids = flattenTree(n.children, depth+1);
                for(var j=0;j<kids.length;j++) result.push(kids[j]);
            }
        }
        return result;
    }

    /* ====== Detail Page Load ====== */
    function loadDetailPages(){
        apiFetch(API.detailPages)
            .then(function(data){
                if(!isLatest()) return;
                detailTree = (data && data.pages) || [];
                flatDetails = flattenDetailTree(detailTree, 0);
            })
            .catch(function(err){
                console.error('[role_list] loadDetailPages failed:', err);
            });
    }

    function flattenDetailTree(nodes, depth){
        var result = [];
        for(var i=0;i<nodes.length;i++){
            var n = nodes[i];
            result.push({ id:n.id, page_code:n.page_code, page_name:n.page_name, depth:depth, parent_page_id:n.parent_page_id });
            if(n.children && n.children.length){
                var kids = flattenDetailTree(n.children, depth+1);
                for(var j=0;j<kids.length;j++) result.push(kids[j]);
            }
        }
        return result;
    }

    /* ====== Role List ====== */
    function loadRoles(autoSelect){
        apiFetch(API.roles).then(function(data){
            if(!isLatest()) { return; }
            allRoles = (data && data.roles) || [];
            if(!autoSelect || !allRoles.length) return;

            // 1) 이전 선택 role 우선 복원 (sessionStorage)
            var saved = readSavedSelection();
            var restored = null;
            if(saved && saved.roleId){
                restored = findInList(allRoles, saved.roleId);
            }
            if(!restored && saved && saved.roleName){
                for(var k=0;k<allRoles.length;k++){
                    if((allRoles[k].name||'') === saved.roleName){ restored = allRoles[k]; break; }
                }
            }
            if(restored){ selectRole(restored); return; }

            // 2) 기본값: '사용자' → 첫 번째 비-admin → 첫 번째
            var defaultRole = null;
            for(var i=0;i<allRoles.length;i++){
                var n = (allRoles[i].name||'').toLowerCase();
                if(n === '사용자'){
                    defaultRole = allRoles[i]; break;
                }
            }
            if(!defaultRole){
                for(var j=0;j<allRoles.length;j++){
                    var nm = (allRoles[j].name||'').toLowerCase();
                    if(nm !== 'admin' && nm !== 'administrator'){
                        defaultRole = allRoles[j]; break;
                    }
                }
            }
            if(!defaultRole) defaultRole = allRoles[0];
            if(defaultRole) selectRole(defaultRole);
        }).catch(function(err){
            if(err && err.message === 'session_expired') return;
            showMessage('오류', '역할 목록을 불러오지 못했습니다.');
        });
    }

    /* ====== Dept List ====== */
    function loadDepts(autoSelect){
        apiFetch(API.depts).then(function(data){
            if(!isLatest()) return;
            allDepts = (data && data.departments) || [];
            if(!autoSelect || !allDepts.length) return;
            var saved = readSavedSelection();
            var restored = saved && saved.deptId ? findInList(allDepts, saved.deptId) : null;
            selectDept(restored || allDepts[0]);
        }).catch(function(err){
            // dept 목록 로드 실패 - 조용히 무시
        });
    }

    /* ====== Role Search + Dropdown ====== */
    function bindRoleSearch(){
        var input = document.getElementById('perm-role-search');
        var dropdown = document.getElementById('perm-role-dropdown');
        if(!input || !dropdown) return;
        input.addEventListener('input', function(){
            var q = input.value.trim().toLowerCase();
            if(searchTimerRole) clearTimeout(searchTimerRole);
            searchTimerRole = setTimeout(function(){ showDropdown(q, allRoles, dropdown, currentRoleId, 'role'); }, 150);
        });
        input.addEventListener('focus', function(){
            input.select();
            showDropdown('', allRoles, dropdown, currentRoleId, 'role');
        });
        input.addEventListener('blur', function(){
            setTimeout(function(){
                if(currentRoleId){
                    var cur = findInList(allRoles, currentRoleId);
                    if(cur) input.value = cur.name;
                }
            }, 200);
        });
        dropdown.addEventListener('click', function(e){
            var item = closestByClass(e.target, 'perm-role-dd-item');
            if(!item) return;
            var id = parseInt(item.getAttribute('data-id'),10);
            if(!id) return;
            var role = findInList(allRoles, id);
            if(role){
                if(hasDirtyChanges()){
                    showConfirm('저장하지 않은 변경사항이 있습니다.\n역할을 전환하시겠습니까?', function(){ selectRole(role); });
                } else {
                    selectRole(role);
                }
            }
            dropdown.style.display = 'none';
        });
        document.addEventListener('click', function(e){
            if(!dropdown.contains(e.target) && e.target !== input) dropdown.style.display = 'none';
        });
    }

    /* ====== Dept Search + Dropdown ====== */
    function bindDeptSearch(){
        var input = document.getElementById('perm-dept-search');
        var dropdown = document.getElementById('perm-dept-dropdown');
        if(!input || !dropdown) return;
        input.addEventListener('input', function(){
            var q = input.value.trim().toLowerCase();
            if(searchTimerDept) clearTimeout(searchTimerDept);
            searchTimerDept = setTimeout(function(){ showDropdown(q, allDepts, dropdown, currentDeptId, 'dept'); }, 150);
        });
        input.addEventListener('focus', function(){
            if(!allDepts.length){ loadDepts(false); }
            input.select();
            showDropdown('', allDepts, dropdown, currentDeptId, 'dept');
        });
        input.addEventListener('blur', function(){
            setTimeout(function(){
                if(currentDeptId){
                    var cur = findInList(allDepts, currentDeptId);
                    if(cur) input.value = cur.dept_name;
                }
            }, 200);
        });
        dropdown.addEventListener('click', function(e){
            var item = closestByClass(e.target, 'perm-role-dd-item');
            if(!item) return;
            var id = parseInt(item.getAttribute('data-id'),10);
            if(!id) return;
            var dept = findInList(allDepts, id);
            if(dept){
                if(hasDirtyChanges()){
                    showConfirm('저장하지 않은 변경사항이 있습니다.\n부서를 전환하시겠습니까?', function(){ selectDept(dept); });
                } else {
                    selectDept(dept);
                }
            }
            dropdown.style.display = 'none';
        });
        document.addEventListener('click', function(e){
            if(!dropdown.contains(e.target) && e.target !== input) dropdown.style.display = 'none';
        });
    }

    /* ====== Shared Dropdown Renderer ====== */
    function showDropdown(q, list, dropdown, activeId, type){
        if(!dropdown) return;
        var nameKey = (type==='dept') ? 'dept_name' : 'name';
        var descKey = (type==='dept') ? 'dept_code' : 'description';
        var countKey = (type==='dept') ? 'member_count' : 'user_count';
        var filtered = [];
        for(var i=0;i<list.length;i++){
            var r = list[i];
            if(type === 'role'){
                var rn = (r[nameKey]||'').toLowerCase();
                if(rn === 'admin' || rn === 'administrator') continue;
            }
            if(!q || (r[nameKey]||'').toLowerCase().indexOf(q)!==-1 || (r[descKey]||'').toLowerCase().indexOf(q)!==-1){
                filtered.push(r);
            }
        }
        if(!filtered.length){
            dropdown.innerHTML = '<div class="perm-role-dd-hint">결과 없음</div>';
            dropdown.style.display = '';
            return;
        }
        var html = '';
        for(var j=0;j<filtered.length;j++){
            var item = filtered[j];
            var activeCls = (activeId === item.id) ? ' perm-role-dd-active' : '';
            html += '<button type="button" class="perm-role-dd-item' + activeCls + '" data-id="' + item.id + '">' +
                '<span class="perm-role-dd-name">' + esc(item[nameKey]) + '</span>' +
                (item[countKey] ? '<span class="perm-role-dd-count">' + item[countKey] + '명</span>' : '') +
                '</button>';
        }
        dropdown.innerHTML = html;
        dropdown.style.display = '';
    }

    function findInList(list, id){
        for(var i=0;i<list.length;i++){ if(list[i].id===id) return list[i]; }
        return null;
    }

    /* ====== Select Role ====== */
    function selectRole(role){
        if(!isLatest()) { return; }
        currentRoleId = role.id;
        currentRoleName = role.name || '';
        dirtyPerms = {}; originalPerms = {};
        dirtyDetailPerms = {}; originalDetailPerms = {};
        var searchInput = document.getElementById('perm-role-search');
        if(searchInput){ searchInput.value = role.name; searchInput.placeholder = '역할 선택'; }
        var dropdown = document.getElementById('perm-role-dropdown');
        if(dropdown) dropdown.style.display = 'none';
        saveSelection();
        if(currentSection === 'detail') loadDetailPermissions(role.id, 'role');
        else loadPermissions(role.id, 'role');
    }

    function bindRoleChipClear(){
        /* chip 제거됨 — 입력란 focus 시 초기화 로직으로 대체 */
    }

    /* ====== Select Dept ====== */
    function selectDept(dept){
        currentDeptId = dept.id;
        dirtyPerms = {}; originalPerms = {};
        dirtyDetailPerms = {}; originalDetailPerms = {};
        var searchInput = document.getElementById('perm-dept-search');
        if(searchInput){ searchInput.value = dept.dept_name; searchInput.placeholder = '부서 선택'; }
        var dropdown = document.getElementById('perm-dept-dropdown');
        if(dropdown) dropdown.style.display = 'none';
        saveSelection();
        if(currentSection === 'detail') loadDetailPermissions(dept.id, 'dept');
        else loadPermissions(dept.id, 'dept');
    }

    function bindDeptChipClear(){
        /* chip 제거됨 — 입력란 focus 시 초기화 로직으로 대체 */
    }

    /* ====== Load & Render Permissions ====== */
    function loadPermissions(targetId, type){
        var url = (type==='dept') ? API.deptPerms(targetId) : API.rolePerms(targetId);
        apiFetch(url)
            .then(function(data){
                if(!isLatest()) { return; }
                var perms = (data && data.permissions) || {};
                // 미설정 메뉴는 READ 기본값 적용
                for(var i=0;i<flatMenus.length;i++){
                    var mc = flatMenus[i].menu_code;
                    if(!perms[mc]) perms[mc] = 'READ';
                }
                originalPerms = JSON.parse(JSON.stringify(perms));
                dirtyPerms   = JSON.parse(JSON.stringify(perms));
                renderMatrix(perms);
                updateSaveState();
            })
            .catch(function(err){
                console.error('[role_list] loadPermissions failed:', err);
                if(err && err.message === 'session_expired') return;
                showMessage('오류', '권한 정보를 불러오지 못했습니다.\n(' + (err && err.message || err) + ')');
            });
    }

    function renderMatrix(perms){
        var container = document.getElementById('perm-role-matrix');
        if(!container) return;
        var html = '<table class="perm-matrix-table"><thead><tr>' +
            '<th class="perm-matrix-menu-hd">메뉴</th>' +
            '<th class="perm-matrix-toggle-hd">권한</th>' +
            '</tr></thead><tbody>';
        for(var i=0;i<flatMenus.length;i++){
            var menu = flatMenus[i];
            var perm = perms[menu.menu_code] || 'READ';
            var indent = menu.depth * 24;
            var isChild = menu.depth > 0;
            var rowCls = isChild ? 'perm-matrix-child' : 'perm-matrix-parent';
            html += '<tr class="perm-matrix-row ' + rowCls + '" data-menu="' + esc(menu.menu_code) + '">';
            html += '<td class="perm-matrix-menu">';
            if(indent>0) html += '<span class="perm-indent" style="display:inline-block;width:' + indent + 'px;"></span>';
            if(isChild) html += '<span class="perm-child-marker">\u2514 </span>';
            html += '<span class="perm-menu-label">' + esc(menu.menu_name) + '</span></td>';
            html += '<td class="perm-matrix-toggle">' + buildToggle(menu.menu_code, perm) + '</td></tr>';
        }
        html += '</tbody></table>';
        container.innerHTML = html;

        /* ADMIN 역할: 전체 WRITE, 편집 불가 */
        if(currentSource === 'role' && isAdminRole()){
            var notice = document.createElement('div');
            notice.className = 'perm-admin-notice';
            notice.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> 관리자 역할은 모든 메뉴에 대해 전체 권한(WRITE)이 자동 부여됩니다.';
            container.insertBefore(notice, container.firstChild);
            var allBtns = container.querySelectorAll('.perm-toggle-btn');
            for(var d=0;d<allBtns.length;d++) allBtns[d].disabled = true;
            return;
        }

        container.onclick = function(e){
            var btn = closestByClass(e.target, 'perm-toggle-btn');
            if(!btn || btn.disabled) return;
            var group = closestByClass(btn, 'perm-toggle-group');
            if(!group) return;
            var code = group.getAttribute('data-menu');
            var perm = btn.getAttribute('data-perm');
            if(!code || !perm) return;

            /* 상속 검증: 하위 메뉴는 상위보다 높은 권한 불가 */
            var parentCode = getParentCode(code);
            if(parentCode){
                var parentPerm = dirtyPerms[parentCode] || 'READ';
                if(permRank(perm) > permRank(parentPerm)){
                    showMessage('권한 제약', '하위 메뉴(' + perm + ')는 상위 메뉴(' + parentPerm + ')보다\n높은 권한을 가질 수 없습니다.\n상위 메뉴의 권한을 먼저 변경해주세요.');
                    return;
                }
            }

            var btns = group.querySelectorAll('.perm-toggle-btn');
            for(var k=0;k<btns.length;k++) btns[k].classList.toggle('active', btns[k].getAttribute('data-perm')===perm);
            dirtyPerms[code] = perm;
            propagateToChildren(code, perm, container);
            updateSaveState();
        };
    }

    function buildToggle(menuCode, perm){
        return '<div class="perm-toggle-group" data-menu="' + esc(menuCode) + '">' +
            '<button type="button" class="perm-toggle-btn' + (perm==='NONE'?' active':'') + '" data-perm="NONE" title="접근 불가">-</button>' +
            '<button type="button" class="perm-toggle-btn' + (perm==='READ'?' active':'') + '" data-perm="READ" title="읽기">R</button>' +
            '<button type="button" class="perm-toggle-btn' + (perm==='WRITE'?' active':'') + '" data-perm="WRITE" title="읽기/쓰기">RW</button></div>';
    }

    function propagateToChildren(parentCode, perm, container){
        var prefix = parentCode + '.';
        var lowered = false;
        for(var i=0;i<flatMenus.length;i++){
            var m = flatMenus[i];
            if(m.menu_code.indexOf(prefix)!==0) continue;
            var childPerm = dirtyPerms[m.menu_code] || 'READ';
            /* 상위 권한보다 높은 하위 메뉴는 강제 하향 */
            if(permRank(childPerm) > permRank(perm)){
                dirtyPerms[m.menu_code] = perm;
                lowered = true;
            } else if(!originalPerms[m.menu_code] || originalPerms[m.menu_code]===(dirtyPerms[m.menu_code]||'NONE')){
                /* 미수정 하위 메뉴는 상위 따라 변경 */
                dirtyPerms[m.menu_code] = perm;
            }
            var g = container.querySelector('.perm-toggle-group[data-menu="' + m.menu_code + '"]');
            if(g){
                var cur = dirtyPerms[m.menu_code];
                var btns = g.querySelectorAll('.perm-toggle-btn');
                for(var k=0;k<btns.length;k++) btns[k].classList.toggle('active', btns[k].getAttribute('data-perm')===cur);
            }
        }
        if(lowered) showStatus('하위 메뉴 권한이 상위 메뉴에 맞게 조정되었습니다.');
    }

    /* ====== Detail Permissions Load & Render ====== */
    function loadDetailPermissions(targetId, type){
        var url = (type==='dept') ? API.deptDetailPerms(targetId) : API.roleDetailPerms(targetId);
        apiFetch(url)
            .then(function(data){
                var perms = (data && data.permissions) || {};
                for(var i=0;i<flatDetails.length;i++){
                    var pc = flatDetails[i].page_code;
                    if(!perms[pc]) perms[pc] = 'READ';
                }
                originalDetailPerms = JSON.parse(JSON.stringify(perms));
                dirtyDetailPerms   = JSON.parse(JSON.stringify(perms));
                renderDetailMatrix(perms);
                updateSaveState();
            })
            .catch(function(err){
                console.error('[role_list] loadDetailPermissions failed:', err);
                if(err && err.message === 'session_expired') return;
                showMessage('오류', '상세화면 권한 정보를 불러오지 못했습니다.\n(' + (err && err.message || err) + ')');
            });
    }

    function renderDetailMatrix(perms){
        var container = document.getElementById('perm-role-matrix');
        if(!container) return;
        var html = '<table class="perm-matrix-table"><thead><tr>' +
            '<th class="perm-matrix-menu-hd">상세화면</th>' +
            '<th class="perm-matrix-toggle-hd">권한</th>' +
            '</tr></thead><tbody>';
        for(var i=0;i<flatDetails.length;i++){
            var page = flatDetails[i];
            var perm = perms[page.page_code] || 'READ';
            var indent = page.depth * 24;
            var isChild = page.depth > 0;
            var rowCls = isChild ? 'perm-matrix-child' : 'perm-matrix-parent';
            html += '<tr class="perm-matrix-row ' + rowCls + '" data-page="' + esc(page.page_code) + '">';
            html += '<td class="perm-matrix-menu">';
            if(indent>0) html += '<span class="perm-indent" style="display:inline-block;width:' + indent + 'px;"></span>';
            if(isChild) html += '<span class="perm-child-marker">\u2514 </span>';
            html += '<span class="perm-menu-label">' + esc(page.page_name) + '</span></td>';
            html += '<td class="perm-matrix-toggle">' + buildDetailToggle(page.page_code, perm) + '</td></tr>';
        }
        html += '</tbody></table>';
        container.innerHTML = html;

        /* ADMIN: 전체 WRITE, 편집 불가 */
        if(currentSource === 'role' && isAdminRole()){
            var notice = document.createElement('div');
            notice.className = 'perm-admin-notice';
            notice.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> 관리자 역할은 모든 상세화면에 대해 전체 권한(WRITE)이 자동 부여됩니다.';
            container.insertBefore(notice, container.firstChild);
            var allBtns = container.querySelectorAll('.perm-toggle-btn');
            for(var d=0;d<allBtns.length;d++) allBtns[d].disabled = true;
            return;
        }

        container.onclick = function(e){
            var btn = closestByClass(e.target, 'perm-toggle-btn');
            if(!btn || btn.disabled) return;
            var group = closestByClass(btn, 'perm-toggle-group');
            if(!group) return;
            var code = group.getAttribute('data-page');
            var perm = btn.getAttribute('data-perm');
            if(!code || !perm) return;

            var parentCode = getParentCode(code);
            if(parentCode){
                var parentPerm = dirtyDetailPerms[parentCode] || 'READ';
                if(permRank(perm) > permRank(parentPerm)){
                    showMessage('권한 제약', '하위 항목(' + perm + ')은 상위 항목(' + parentPerm + ')보다\n높은 권한을 가질 수 없습니다.');
                    return;
                }
            }

            var btns = group.querySelectorAll('.perm-toggle-btn');
            for(var k=0;k<btns.length;k++) btns[k].classList.toggle('active', btns[k].getAttribute('data-perm')===perm);
            dirtyDetailPerms[code] = perm;
            propagateDetailChildren(code, perm, container);
            updateSaveState();
        };
    }

    function buildDetailToggle(pageCode, perm){
        return '<div class="perm-toggle-group" data-page="' + esc(pageCode) + '">' +
            '<button type="button" class="perm-toggle-btn' + (perm==='NONE'?' active':'') + '" data-perm="NONE" title="접근 불가">-</button>' +
            '<button type="button" class="perm-toggle-btn' + (perm==='READ'?' active':'') + '" data-perm="READ" title="읽기">R</button>' +
            '<button type="button" class="perm-toggle-btn' + (perm==='WRITE'?' active':'') + '" data-perm="WRITE" title="읽기/쓰기">RW</button></div>';
    }

    function propagateDetailChildren(parentCode, perm, container){
        var prefix = parentCode + '.';
        var lowered = false;
        for(var i=0;i<flatDetails.length;i++){
            var p = flatDetails[i];
            if(p.page_code.indexOf(prefix)!==0) continue;
            var childPerm = dirtyDetailPerms[p.page_code] || 'READ';
            if(permRank(childPerm) > permRank(perm)){
                dirtyDetailPerms[p.page_code] = perm;
                lowered = true;
            } else if(!originalDetailPerms[p.page_code] || originalDetailPerms[p.page_code]===(dirtyDetailPerms[p.page_code]||'NONE')){
                dirtyDetailPerms[p.page_code] = perm;
            }
            var g = container.querySelector('.perm-toggle-group[data-page="' + p.page_code + '"]');
            if(g){
                var cur = dirtyDetailPerms[p.page_code];
                var btns = g.querySelectorAll('.perm-toggle-btn');
                for(var k=0;k<btns.length;k++) btns[k].classList.toggle('active', btns[k].getAttribute('data-perm')===cur);
            }
        }
        if(lowered) showStatus('하위 항목 권한이 상위 항목에 맞게 조정되었습니다.');
    }

    /* ====== Save ====== */
    function bindSave(){
        var btn = document.getElementById('perm-role-save');
        if(btn) btn.addEventListener('click', handleSave);
    }

    function handleSave(){
        if(saving) return;
        var targetId = (currentSource==='dept') ? currentDeptId : currentRoleId;
        if(!targetId) return;
        if(!hasDirtyChanges()){ showStatus('변경사항이 없습니다.'); return; }

        if(currentSection === 'detail'){
            /* 상세화면 권한 저장 */
            var detailPayload = {};
            var dKeys = Object.keys(dirtyDetailPerms);
            for(var d=0;d<dKeys.length;d++) detailPayload[dKeys[d]] = dirtyDetailPerms[dKeys[d]];
            saving = true;
            updateSaveState();
            var detailUrl = (currentSource==='dept') ? API.deptDetailPerms(targetId) : API.roleDetailPerms(targetId);
            fetch(detailUrl, {
                method:'PUT',
                headers:{'Content-Type':'application/json', 'X-Requested-With':'XMLHttpRequest'},
                credentials:'same-origin',
                body: JSON.stringify({ permissions: detailPayload })
            })
                .then(function(res){ return res.json(); })
                .then(function(data){
                    if(data && data.success){
                        showStatus('상세화면 권한이 저장되었습니다.');
                        originalDetailPerms = JSON.parse(JSON.stringify(dirtyDetailPerms));
                    } else {
                        showMessage('저장 실패', (data && data.message) || '상세화면 권한 저장에 실패하였습니다.');
                    }
                })
                .catch(function(){ showMessage('오류', '서버 통신 중 오류가 발생하였습니다.'); })
                .then(function(){ saving = false; updateSaveState(); });
            return;
        }

        /* 메뉴 권한 저장 */
        var payload = {};
        var keys = Object.keys(dirtyPerms);
        for(var i=0;i<keys.length;i++) payload[keys[i]] = dirtyPerms[keys[i]];
        saving = true;
        updateSaveState();
        var url = (currentSource==='dept') ? API.deptPerms(targetId) : API.rolePerms(targetId);
        fetch(url, {
            method:'PUT',
            headers:{'Content-Type':'application/json', 'X-Requested-With':'XMLHttpRequest'},
            credentials:'same-origin',
            body: JSON.stringify({ permissions: payload })
        })
            .then(function(res){ return res.json(); })
            .then(function(data){
                if(data && data.success){
                    showStatus('권한이 저장되었습니다.');
                    originalPerms = JSON.parse(JSON.stringify(dirtyPerms));
                } else {
                    showMessage('저장 실패', (data && data.message) || '권한 저장에 실패하였습니다.');
                }
            })
            .catch(function(){ showMessage('오류', '서버 통신 중 오류가 발생하였습니다.'); })
            .then(function(){ saving = false; updateSaveState(); });
    }

    function updateSaveState(){
        var btn = document.getElementById('perm-role-save');
        if(!btn) return;
        var targetId = (currentSource==='dept') ? currentDeptId : currentRoleId;
        btn.disabled = saving || !targetId || !hasDirtyChanges();
    }

    function hasDirtyChanges(){
        if(currentSection === 'detail'){
            return _isDirty(dirtyDetailPerms, originalDetailPerms);
        }
        return _isDirty(dirtyPerms, originalPerms);
    }

    function _isDirty(dirty, original){
        var keys = Object.keys(dirty);
        for(var i=0;i<keys.length;i++){
            if(dirty[keys[i]] !== (original[keys[i]] || 'NONE')) return true;
        }
        var origKeys = Object.keys(original);
        for(var j=0;j<origKeys.length;j++){
            if((dirty[origKeys[j]] || 'NONE') !== original[origKeys[j]]) return true;
        }
        return false;
    }

    /* ====== Role Add Modal ====== */
    function bindAddRole(){
        var addBtn = document.getElementById('perm-role-add-btn');
        var modal  = document.getElementById('role-add-modal');
        var closeBtn = document.getElementById('role-add-close');
        var cancelBtn = document.getElementById('role-add-cancel');
        var submitBtn = document.getElementById('role-add-submit');
        if(!addBtn || !modal) return;
        function openModal(){
            document.getElementById('role-add-name').value = '';
            document.getElementById('role-add-desc').value = '';
            modal.classList.add('show');
            modal.setAttribute('aria-hidden','false');
            setTimeout(function(){ document.getElementById('role-add-name').focus(); }, 100);
        }
        function closeModal(){
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden','true');
        }
        addBtn.addEventListener('click', openModal);
        if(closeBtn) closeBtn.addEventListener('click', closeModal);
        if(cancelBtn) cancelBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', function(e){ if(e.target===modal) closeModal(); });
        if(submitBtn) submitBtn.addEventListener('click', function(){
            var name = (document.getElementById('role-add-name').value||'').trim();
            var desc = (document.getElementById('role-add-desc').value||'').trim();
            if(!name){ showMessage('알림','역할명을 입력해주세요.'); return; }
            fetch(API.createRole, {
                method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin',
                body: JSON.stringify({name:name,description:desc})
            })
            .then(function(res){ return res.json(); })
            .then(function(data){
                if(data && data.success){
                    closeModal();
                    showStatus('역할 "' + esc(name) + '"이(가) 추가되었습니다.');
                    loadRoles(false);
                    if(data.role && data.role.id){
                        setTimeout(function(){
                            var created = findInList(allRoles, data.role.id);
                            if(created) selectRole(created);
                        }, 500);
                    }
                } else {
                    showMessage('오류', (data&&data.message)||'역할 생성에 실패하였습니다.');
                }
            })
            .catch(function(){ showMessage('오류','서버 통신 오류'); });
        });
    }

    /* ====== Page Leave Guard ====== */
    function bindBeforeUnload(){
        // window 리스너는 SPA 재진입마다 누적되지 않도록 모듈 전역에서 한 번만 등록
        if(window.__roleListBeforeUnloadBound) return;
        window.__roleListBeforeUnloadBound = true;
        window.addEventListener('beforeunload', function(e){
            if(isRoleListPage() && hasDirtyChanges()){ e.preventDefault(); e.returnValue = ''; }
        });
    }

    function bindSystemTabGuard(){
        var tabs = document.querySelectorAll('.system-tab-btn');
        for(var i=0;i<tabs.length;i++){
            (function(tab){
                tab.addEventListener('click', function(e){
                    if(hasDirtyChanges()){
                        e.preventDefault();
                        var href = tab.getAttribute('href');
                        showConfirm('저장하지 않은 변경사항이 있습니다.\n페이지를 이동하시겠습니까?', function(){ blsSpaNavigate(href); });
                    }
                });
            })(tabs[i]);
        }
    }

    /* ====== Confirm Modal ====== */
    function initConfirmModal(){
        var modal = document.getElementById('dirty-confirm-modal');
        if(!modal) return;
        var closeBtn = document.getElementById('dirty-confirm-close');
        var cancelBtn = document.getElementById('dirty-confirm-cancel');
        var okBtn = document.getElementById('dirty-confirm-ok');
        function dismiss(){ closeConfirmModal(); pendingConfirmCb = null; }
        function accept(){ closeConfirmModal(); if(typeof pendingConfirmCb === 'function'){ var cb = pendingConfirmCb; pendingConfirmCb = null; cb(); } }
        if(closeBtn) closeBtn.addEventListener('click', dismiss);
        if(cancelBtn) cancelBtn.addEventListener('click', dismiss);
        if(okBtn) okBtn.addEventListener('click', accept);
        modal.addEventListener('click', function(e){ if(e.target===modal) dismiss(); });
    }

    function showConfirm(msg, cb){
        pendingConfirmCb = cb;
        var modal = document.getElementById('dirty-confirm-modal');
        var msgEl = document.getElementById('dirty-confirm-message');
        if(msgEl) msgEl.innerHTML = esc(msg).replace(/\n/g, '<br>');
        if(modal){ modal.classList.add('show'); modal.setAttribute('aria-hidden','false'); }
    }

    function closeConfirmModal(){
        var modal = document.getElementById('dirty-confirm-modal');
        if(modal){ modal.classList.remove('show'); modal.setAttribute('aria-hidden','true'); }
    }

    /* ====== Utilities ====== */
    function apiFetch(url){
        return fetch(url, {
            credentials:'same-origin',
            cache:'no-store',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
            .then(function(res){
                if(res.redirected && res.url && res.url.indexOf('/login')!==-1){
                    window.location.href = '/login';
                    throw new Error('session_expired');
                }
                if(!res.ok){
                    return res.text().then(function(body){
                        throw new Error('HTTP ' + res.status);
                    });
                }
                var ct = res.headers.get('content-type') || '';
                if(ct.indexOf('application/json')===-1) throw new Error('NOT_JSON: ' + ct);
                return res.json();
            });
    }

    function closestByClass(el, cls){
        while(el && el!==document){
            if(el.classList && el.classList.contains(cls)) return el;
            el = el.parentElement;
        }
        return null;
    }

    var messageModal = null;
    function initMessageModal(){
        messageModal = document.getElementById('system-message-modal');
        if(!messageModal) return;
        var closeBtn = document.getElementById('system-message-close');
        var okBtn    = document.getElementById('system-message-ok');
        var close = function(){ closeMessageModal(); };
        if(closeBtn) closeBtn.addEventListener('click', close);
        if(okBtn)    okBtn.addEventListener('click', close);
        messageModal.addEventListener('click', function(e){ if(e.target===messageModal) close(); });
    }

    function showMessage(title, content){
        if(!messageModal){ alert(title + '\n' + content); return; }
        var t = document.getElementById('system-message-title');
        var c = document.getElementById('system-message-content');
        if(t) t.textContent = title;
        if(c) c.textContent = content;
        messageModal.classList.add('show');
        messageModal.setAttribute('aria-hidden','false');
    }

    function closeMessageModal(){
        if(!messageModal) return;
        messageModal.classList.remove('show');
        messageModal.setAttribute('aria-hidden','true');
    }

    function showStatus(msg){
        var bar = document.getElementById('system-status');
        if(!bar) return;
        bar.textContent = msg;
        bar.classList.add('is-visible');
        if(statusTimer) clearTimeout(statusTimer);
        statusTimer = setTimeout(function(){ bar.classList.remove('is-visible'); }, 4000);
    }

    function esc(v){
        if(v==null) return '';
        return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }
})();
