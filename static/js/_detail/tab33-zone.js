/*
 * tab33-zone.js — 존 구성 탭 동작 (v4.0 — cfgshow 파서 + DnD)
 * SAN 디렉터 / SAN 스위치 상세 페이지의 "존 구성" 탭에서 사용한다.
 * 순수 바닐라 JS (ES5), 외부 라이브러리 의존 없음.
 */
(function(){
    'use strict';
    if(window.BlossomTab33Zone) return;

    /* ── 유틸리티 ─────────────────────────────── */
    function trim(v){ return v == null ? '' : String(v).replace(/^\s+|\s+$/g, ''); }

    function getPageKey(){
        var m = window.location.pathname.match(/\/p\/([^\/]+)/);
        return m ? m[1] : '';
    }
    function getAssetId(prefix){
        var stores = [];
        try{ if(window.sessionStorage) stores.push(window.sessionStorage); }catch(_){}
        try{ if(window.localStorage)  stores.push(window.localStorage); }catch(_){}
        for(var si=0;si<stores.length;si++){
            var raw = stores[si].getItem(prefix + ':selected:row');
            if(!raw) continue;
            try{
                var row = JSON.parse(raw);
                if(row && row.id) return String(row.id);
            }catch(_){}
        }
        var qs = window.location.search;
        var m2 = qs.match(/[?&]id=(\d+)/);
        return m2 ? m2[1] : '';
    }
    function resolveStoragePrefix(){
        var pk = getPageKey().replace(/_zone$/, '');
        var parts = pk.split('_').filter(function(p){ return !!p; });
        return parts.length ? parts[parts.length - 1] : 'detail';
    }

    function escapeHtml(s){
        if(!s) return '';
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function escapeCSV(v){
        var s = String(v == null ? '' : v);
        if(s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1){
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    }
    function pad2(n){ return n < 10 ? '0'+n : ''+n; }
    function downloadCSV(fname, lines){
        var bom = '\uFEFF';
        var blob = new Blob([bom + lines.join('\r\n')], {type:'text/csv;charset=utf-8'});
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    /* ── 상태 ─────────────────────────────────── */
    var state = {
        assetId: '',
        zones: [],
        filtered: [],
        page: 1,
        pageSize: 10,
        checkedIds: {},
        selectedZone: null,
        editingZoneId: 0,
        parsedEntries: [],
        interfaces: []
    };

    /* ── DOM 캐시 ──────────────────────────────── */
    var dom = {};

    function cacheDom(){
        dom.listBody       = document.getElementById('zone-list-body');
        dom.listEmpty      = document.getElementById('zone-list-empty');
        dom.listTable      = document.getElementById('zone-list-table');
        dom.selectAll      = document.getElementById('zone-select-all');
        dom.search         = document.getElementById('zone-search');
        dom.typeFilter     = document.getElementById('zone-type-filter');
        dom.statusFilter   = document.getElementById('zone-status-filter');
        dom.btnSearch      = document.getElementById('zone-btn-search');
        dom.btnAdd         = document.getElementById('zone-btn-add');
        dom.btnDownload    = document.getElementById('zone-btn-download');
        dom.downloadModal  = document.getElementById('zone-download-modal');
        dom.pageSize       = document.getElementById('zone-page-size');
        dom.paginationInfo = document.getElementById('zone-pagination-info');
        dom.pageNumbers    = document.getElementById('zone-page-numbers');
        dom.btnFirst       = document.getElementById('zone-first');
        dom.btnPrev        = document.getElementById('zone-prev');
        dom.btnNext        = document.getElementById('zone-next');
        dom.btnLast        = document.getElementById('zone-last');
        /* 상세 모달 */
        dom.detailModal    = document.getElementById('zone-detail-modal');
        dom.detailType     = document.getElementById('zone-detail-type');
        dom.detailName     = document.getElementById('zone-detail-name');
        dom.detailStatus   = document.getElementById('zone-detail-status');
        dom.initiatorBody  = document.getElementById('zone-initiator-body');
        dom.initiatorEmpty = document.getElementById('zone-initiator-empty');
        dom.targetBody     = document.getElementById('zone-target-body');
        dom.targetEmpty    = document.getElementById('zone-target-empty');
        /* 추가(cfgshow) 모달 */
        dom.addModal       = document.getElementById('zone-add-modal');
        dom.cfgshowInput   = document.getElementById('zone-cfgshow-input');
        dom.parseBtn       = document.getElementById('zone-parse-btn');
        dom.previewArea    = document.getElementById('zone-cfgshow-preview');
        dom.previewBody    = document.getElementById('zone-preview-body');
        dom.addConfirm     = document.getElementById('zone-add-confirm');
        /* 수정 모달 */
        dom.editModal      = document.getElementById('zone-edit-modal');
        dom.editType       = document.getElementById('zone-edit-type');
        dom.editName       = document.getElementById('zone-edit-name');
        dom.editStatus     = document.getElementById('zone-edit-status');
        dom.editRemark     = document.getElementById('zone-edit-remark');
        dom.dndArea        = document.getElementById('zone-dnd-area');
        dom.dndInitiator   = document.getElementById('zone-dnd-initiator');
        dom.dndTarget      = document.getElementById('zone-dnd-target');
        /* 삭제 모달 */
        dom.deleteModal    = document.getElementById('zone-delete-modal');
        dom.deleteCount    = document.getElementById('zone-delete-count');
    }

    /* ── API ───────────────────────────────────── */
    function apiGet(url, cb){
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.onreadystatechange = function(){
            if(xhr.readyState !== 4) return;
            try{ cb(null, JSON.parse(xhr.responseText)); }catch(e){ cb(e, null); }
        };
        xhr.send();
    }

    function apiPost(url, body, cb){
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.onreadystatechange = function(){
            if(xhr.readyState !== 4) return;
            try{ cb(null, JSON.parse(xhr.responseText)); }catch(e){ cb(e, null); }
        };
        xhr.send(JSON.stringify(body));
    }

    function apiPut(url, body, cb){
        var xhr = new XMLHttpRequest();
        xhr.open('PUT', url, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.onreadystatechange = function(){
            if(xhr.readyState !== 4) return;
            try{ cb(null, JSON.parse(xhr.responseText)); }catch(e){ cb(e, null); }
        };
        xhr.send(JSON.stringify(body));
    }

    /* ── 데이터 로드 ──────────────────────────── */
    function loadZones(){
        if(!state.assetId) return;
        var url = '/api/hardware/assets/' + state.assetId + '/zones';
        apiGet(url, function(err, res){
            if(err || !res || !res.success){
                state.zones = [];
            } else {
                state.zones = res.rows || [];
            }
            applyFilter();
        });
    }

    /* ── 인터페이스 데이터 로드 (검토 판정용) ── */
    function loadInterfaces(){
        if(!state.assetId) return;
        var scopeKey = getPageKey().replace(/_zone$/, '');
        var url = '/api/hw-interfaces?scope_key=' + encodeURIComponent(scopeKey)
                + '&asset_id=' + encodeURIComponent(state.assetId)
                + '&page=1&page_size=5000';
        apiGet(url, function(err, res){
            if(err || !res){
                state.interfaces = [];
            } else {
                state.interfaces = res.items || [];
            }
            /* 인터페이스 로드 후 이미 렌더된 목록에 검토 반영 */
            renderList();
        });
    }

    /* ── WWN 정규화 (콜론/0x 제거, 소문자 hex) ── */
    function normalizeWwn(v){
        if(!v) return '';
        var s = String(v).toLowerCase().replace(/^0x/, '').replace(/[:\-\s]/g, '');
        return s;
    }

    /* ── 포트 번호 추출 (PORT 패턴에서 두 번째 숫자) ── */
    function extractPort(wwn){
        var m = String(wwn).match(/^(\d+)\s*,\s*(\d+)$/);
        return m ? m[2] : null;
    }

    /* ── 검토 상태 계산 ─────────────────────────── */
    function computeReviewStatus(zone){
        var members = (zone.initiators || []).concat(zone.targets || []);
        if(!members.length) return '';
        if(!state.interfaces.length) return '검토필요';

        /* 인터페이스 serial / iface 값 미리 인덱싱 */
        var serialSet = {};
        var ifaceList = [];
        for(var i = 0; i < state.interfaces.length; i++){
            var ifc = state.interfaces[i];
            var ns = normalizeWwn(ifc.serial);
            if(ns) serialSet[ns] = true;
            if(ifc.iface) ifaceList.push(String(ifc.iface));
        }

        for(var j = 0; j < members.length; j++){
            var wwn = trim(members[j].wwn);
            if(!wwn) continue;

            /* PORT 패턴 (예: 7,11) */
            var portNum = extractPort(wwn);
            if(portNum !== null){
                var found = false;
                for(var k = 0; k < ifaceList.length; k++){
                    if(ifaceList[k].indexOf(portNum) !== -1){ found = true; break; }
                }
                if(!found) return '검토필요';
                continue;
            }

            /* WWN 패턴 — 정규화 후 비교 */
            var nw = normalizeWwn(wwn);
            if(nw && !serialSet[nw]) return '검토필요';
        }
        return '적정';
    }

    /* ── 필터링 ───────────────────────────────── */
    function applyFilter(){
        var keyword  = trim(dom.search ? dom.search.value : '').toLowerCase();
        var typeVal  = trim(dom.typeFilter ? dom.typeFilter.value : '');
        var status   = trim(dom.statusFilter ? dom.statusFilter.value : '');

        state.filtered = [];
        for(var i = 0; i < state.zones.length; i++){
            var z = state.zones[i];
            if(keyword && (trim(z.zone_name) + ' ' + trim(z.remark)).toLowerCase().indexOf(keyword) === -1) continue;
            if(typeVal && trim(z.entry_type) !== typeVal) continue;
            if(status && trim(z.status) !== status) continue;
            state.filtered.push(z);
        }
        state.page = 1;
        state.checkedIds = {};
        if(dom.selectAll) dom.selectAll.checked = false;
        renderList();
    }

    /* ── 구분 뱃지 ────────────────────────────── */
    function typeBadge(entryType){
        var t = trim(entryType).toLowerCase();
        var label = t.toUpperCase() || 'ZONE';
        var cls = 'zone-type-badge zone-type-' + (t || 'zone');
        return '<span class="' + cls + '">' + escapeHtml(label) + '</span>';
    }

    /* ── Zone 목록 렌더링 ─────────────────────── */
    function renderList(){
        if(!dom.listBody) return;
        var total    = state.filtered.length;
        var pageSize = state.pageSize;
        var maxPage  = Math.max(1, Math.ceil(total / pageSize));
        if(state.page > maxPage) state.page = maxPage;
        var start = (state.page - 1) * pageSize;
        var end   = Math.min(start + pageSize, total);
        var page  = state.filtered.slice(start, end);

        if(total === 0){
            dom.listBody.innerHTML = '';
            if(dom.listTable) dom.listTable.style.display = 'none';
            if(dom.listEmpty) dom.listEmpty.style.display = '';
        } else {
            if(dom.listTable) dom.listTable.style.display = '';
            if(dom.listEmpty) dom.listEmpty.style.display = 'none';
            var html = '';
            for(var i = 0; i < page.length; i++){
                var z = page[i];
                var selected = (state.selectedZone && state.selectedZone.id === z.id) ? ' class="selected"' : '';
                var statusLabel = trim(z.status);
                var isActive = (statusLabel === 'Active' || statusLabel === '활성');
                var dotCls = isActive ? 'zone-dot-active' : 'zone-dot-inactive';
                var displayStatus = isActive ? '활성' : '비활성';
                var checked = state.checkedIds[z.id] ? ' checked' : '';
                var review = computeReviewStatus(z);
                var reviewCls = review === '적정' ? 'zone-review-ok' : (review === '검토필요' ? 'zone-review-warn' : '');
                var reviewHtml = review ? '<span class="zone-review-badge ' + reviewCls + '">' + escapeHtml(review) + '</span>' : '-';
                html += '<tr data-zone-id="' + z.id + '"' + selected + '>'
                    + '<td><input type="checkbox" class="zone-row-check" data-id="' + z.id + '"' + checked + ' aria-label="선택"></td>'
                    + '<td>' + typeBadge(z.entry_type) + '</td>'
                    + '<td><a href="#" class="zone-name-link" data-id="' + z.id + '">' + escapeHtml(trim(z.zone_name)) + '</a></td>'
                    + '<td>' + (z.member_count != null ? z.member_count : 0) + '</td>'
                    + '<td>' + (z.initiator_count != null ? z.initiator_count : 0) + '</td>'
                    + '<td>' + (z.target_count != null ? z.target_count : 0) + '</td>'
                    + '<td><span class="zone-status-dot ' + dotCls + '"></span>' + escapeHtml(displayStatus) + '</td>'
                    + '<td>' + reviewHtml + '</td>'
                    + '<td>' + escapeHtml(trim(z.remark || '')) + '</td>'
                    + '<td class="zone-manage-cell">'
                    + '<button class="action-btn zone-row-edit" data-id="' + z.id + '" data-action="edit" title="수정" type="button">'
                    + '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon">'
                    + '</button>'
                    + '<button class="action-btn zone-row-delete" data-id="' + z.id + '" data-action="delete" title="삭제" type="button">'
                    + '<img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">'
                    + '</button>'
                    + '</td>'
                    + '</tr>';
            }
            dom.listBody.innerHTML = html;
        }
        renderPagination(total, maxPage);
    }

    /* ── 페이지네이션 ─────────────────────────── */
    function renderPagination(total, maxPage){
        if(dom.paginationInfo) dom.paginationInfo.textContent = total + '개 항목';
        if(dom.btnFirst) dom.btnFirst.disabled = (state.page <= 1);
        if(dom.btnPrev)  dom.btnPrev.disabled  = (state.page <= 1);
        if(dom.btnNext)  dom.btnNext.disabled  = (state.page >= maxPage);
        if(dom.btnLast)  dom.btnLast.disabled  = (state.page >= maxPage);

        if(dom.pageNumbers){
            var html = '';
            var range = 2;
            var s = Math.max(1, state.page - range);
            var e = Math.min(maxPage, state.page + range);
            for(var p = s; p <= e; p++){
                html += '<button class="page-btn' + (p === state.page ? ' active' : '') + '" data-page="' + p + '">' + p + '</button>';
            }
            dom.pageNumbers.innerHTML = html;
        }
    }

    /* ── Zone 상세 모달 렌더링 ────────────────── */
    function renderDetail(zone){
        state.selectedZone = zone;
        if(!zone) return;

        if(dom.detailType) dom.detailType.textContent = (trim(zone.entry_type) || 'zone').toUpperCase();
        if(dom.detailName) dom.detailName.textContent = trim(zone.zone_name);
        if(dom.detailStatus){
            var isAct = (trim(zone.status) === 'Active' || trim(zone.status) === '활성');
            dom.detailStatus.textContent = isAct ? '활성' : '비활성';
        }

        /* Initiator 테이블 */
        var inits = zone.initiators || [];
        if(dom.initiatorBody){
            if(inits.length === 0){
                dom.initiatorBody.innerHTML = '';
                if(dom.initiatorEmpty) dom.initiatorEmpty.style.display = '';
            } else {
                if(dom.initiatorEmpty) dom.initiatorEmpty.style.display = 'none';
                var html = '';
                for(var i = 0; i < inits.length; i++){
                    var w = trim(inits[i].wwn);
                    var isPort = /^\d+\s*,\s*\d+$/.test(w);
                    html += '<tr><td>' + escapeHtml(trim(inits[i].alias)) + '</td>'
                        + '<td class="zone-wwn">' + (isPort ? '' : escapeHtml(w)) + '</td>'
                        + '<td>' + (isPort ? escapeHtml(w) : '') + '</td></tr>';
                }
                dom.initiatorBody.innerHTML = html;
            }
        }

        /* Target 테이블 */
        var targets = zone.targets || [];
        if(dom.targetBody){
            if(targets.length === 0){
                dom.targetBody.innerHTML = '';
                if(dom.targetEmpty) dom.targetEmpty.style.display = '';
            } else {
                if(dom.targetEmpty) dom.targetEmpty.style.display = 'none';
                var html2 = '';
                for(var j = 0; j < targets.length; j++){
                    var w2 = trim(targets[j].wwn);
                    var isPort2 = /^\d+\s*,\s*\d+$/.test(w2);
                    html2 += '<tr><td>' + escapeHtml(trim(targets[j].alias)) + '</td>'
                        + '<td class="zone-wwn">' + (isPort2 ? '' : escapeHtml(w2)) + '</td>'
                        + '<td>' + (isPort2 ? escapeHtml(w2) : '') + '</td></tr>';
                }
                dom.targetBody.innerHTML = html2;
            }
        }

        highlightSelectedRow(zone.id);
        openModal(dom.detailModal);
    }

    function highlightSelectedRow(zoneId){
        if(!dom.listBody) return;
        var rows = dom.listBody.querySelectorAll('tr');
        for(var i = 0; i < rows.length; i++){
            var rid = rows[i].getAttribute('data-zone-id');
            if(String(rid) === String(zoneId)){
                rows[i].classList.add('selected');
            } else {
                rows[i].classList.remove('selected');
            }
        }
    }

    /* ══════════════════════════════════════════════
       cfgshow 파서
       ══════════════════════════════════════════════ */
    var WWN_RE = /^[\da-fA-F]{2}(?::[\da-fA-F]{2}){7}$/;
    var PORT_RE = /^\d+,\d+$/;

    function parseCfgshow(text){
        var entries = [];
        var current = null;
        var lines = text.split(/\r?\n/);
        for(var i = 0; i < lines.length; i++){
            var stripped = lines[i].replace(/^\s+|\s+$/g, '');
            if(!stripped) continue;

            var m = stripped.match(/^(cfg|zone|alias)\s*:\s*(\S+)\s*(.*)/i);
            if(m){
                var entryType = m[1].toLowerCase();
                var name = m[2];
                var rest = m[3].replace(/^\s+|\s+$/g, '');
                current = {type: entryType, name: name, members: []};
                entries.push(current);
                if(rest){
                    var parts = rest.split(/[;\s]+/);
                    for(var p = 0; p < parts.length; p++){
                        var pt = parts[p].replace(/^\s+|\s+$/g, '').replace(/;$/,'');
                        if(pt) current.members.push(pt);
                    }
                }
                continue;
            }

            if(current){
                var tokens = stripped.split(/\s+/);
                for(var t = 0; t < tokens.length; t++){
                    var tok = tokens[t].replace(/;$/,'').replace(/^\s+|\s+$/g, '');
                    if(tok) current.members.push(tok);
                }
            }
        }
        /* cfg 엔트리의 members가 비어있으면, 뒤따르는 zone 이름을 자동 수집 */
        for(var ci = 0; ci < entries.length; ci++){
            if(entries[ci].type === 'cfg' && entries[ci].members.length === 0){
                for(var zi = ci + 1; zi < entries.length; zi++){
                    if(entries[zi].type === 'cfg') break;
                    if(entries[zi].type === 'zone' || entries[zi].type === 'alias'){
                        entries[ci].members.push(entries[zi].name);
                    }
                }
            }
        }
        return entries;
    }

    /* ── cfgshow 파싱 미리보기 ────────────────── */
    function renderPreview(entries){
        if(!dom.previewBody || !dom.previewArea) return;
        if(!entries.length){
            dom.previewArea.style.display = 'none';
            return;
        }
        var html = '';
        for(var i = 0; i < entries.length; i++){
            var e = entries[i];
            html += '<tr>'
                + '<td>' + typeBadge(e.type) + '</td>'
                + '<td>' + escapeHtml(e.name) + '</td>'
                + '<td class="zone-preview-members">' + escapeHtml(e.members.join(', ')) + '</td>'
                + '</tr>';
        }
        dom.previewBody.innerHTML = html;
        dom.previewArea.style.display = '';
    }

    /* ══════════════════════════════════════════════
       멤버 이동 UI (클릭 선택 + 화살표 이동)
       ══════════════════════════════════════════════ */

    function makeDndItem(member){
        var div = document.createElement('div');
        div.className = 'zone-dnd-item';
        div.setAttribute('data-member-id', member.id);
        var label = trim(member.wwn) || trim(member.alias) || '-';
        if(trim(member.alias) && trim(member.wwn)){
            label = trim(member.alias) + ' (' + trim(member.wwn) + ')';
        }
        div.textContent = label;
        div.addEventListener('click', function(){
            /* 토글 선택 */
            if(div.classList.contains('zone-dnd-selected')){
                div.classList.remove('zone-dnd-selected');
            } else {
                div.classList.add('zone-dnd-selected');
            }
        });
        return div;
    }

    function moveSelected(fromPanel, toPanel){
        if(!fromPanel || !toPanel) return;
        var selected = fromPanel.querySelectorAll('.zone-dnd-item.zone-dnd-selected');
        for(var i = 0; i < selected.length; i++){
            selected[i].classList.remove('zone-dnd-selected');
            toPanel.appendChild(selected[i]);
        }
    }

    function initMoveButtons(){
        var btnToTarget = document.getElementById('zone-move-to-target');
        var btnToInit = document.getElementById('zone-move-to-initiator');
        if(btnToTarget){
            btnToTarget.addEventListener('click', function(){
                moveSelected(dom.dndInitiator, dom.dndTarget);
            });
        }
        if(btnToInit){
            btnToInit.addEventListener('click', function(){
                moveSelected(dom.dndTarget, dom.dndInitiator);
            });
        }
    }

    function populateDnd(zone){
        if(!dom.dndInitiator || !dom.dndTarget) return;
        dom.dndInitiator.innerHTML = '';
        dom.dndTarget.innerHTML = '';

        var inits = zone.initiators || [];
        var targets = zone.targets || [];
        for(var a = 0; a < inits.length; a++){
            dom.dndInitiator.appendChild(makeDndItem(inits[a]));
        }
        for(var b = 0; b < targets.length; b++){
            dom.dndTarget.appendChild(makeDndItem(targets[b]));
        }
    }

    function collectDndRoles(){
        var members = [];
        if(dom.dndInitiator){
            var items = dom.dndInitiator.querySelectorAll('.zone-dnd-item');
            for(var i = 0; i < items.length; i++){
                members.push({id: parseInt(items[i].getAttribute('data-member-id'), 10), role: 'initiator'});
            }
        }
        if(dom.dndTarget){
            var items2 = dom.dndTarget.querySelectorAll('.zone-dnd-item');
            for(var j = 0; j < items2.length; j++){
                members.push({id: parseInt(items2[j].getAttribute('data-member-id'), 10), role: 'target'});
            }
        }
        return members;
    }

    /* ── 이벤트 바인딩 ────────────────────────── */
    function bindEvents(){
        /* 조회 */
        if(dom.btnSearch) dom.btnSearch.addEventListener('click', function(){ applyFilter(); });
        if(dom.search) dom.search.addEventListener('keydown', function(e){ if(e.key === 'Enter') applyFilter(); });

        /* 필터 변경 */
        if(dom.typeFilter) dom.typeFilter.addEventListener('change', function(){ applyFilter(); });
        if(dom.statusFilter) dom.statusFilter.addEventListener('change', function(){ applyFilter(); });

        /* 페이지 사이즈 */
        if(dom.pageSize) dom.pageSize.addEventListener('change', function(){
            state.pageSize = parseInt(dom.pageSize.value, 10) || 10;
            state.page = 1;
            renderList();
        });

        /* 페이지네이션 */
        if(dom.btnFirst) dom.btnFirst.addEventListener('click', function(){ state.page = 1; renderList(); });
        if(dom.btnPrev)  dom.btnPrev.addEventListener('click', function(){ if(state.page > 1){ state.page--; renderList(); }});
        if(dom.btnNext)  dom.btnNext.addEventListener('click', function(){
            var maxPage = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
            if(state.page < maxPage){ state.page++; renderList(); }
        });
        if(dom.btnLast) dom.btnLast.addEventListener('click', function(){
            state.page = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
            renderList();
        });
        if(dom.pageNumbers) dom.pageNumbers.addEventListener('click', function(e){
            var btn = e.target.closest('[data-page]');
            if(!btn) return;
            state.page = parseInt(btn.getAttribute('data-page'), 10) || 1;
            renderList();
        });

        /* 전체 선택 */
        if(dom.selectAll) dom.selectAll.addEventListener('change', function(){
            var checked = dom.selectAll.checked;
            var cbs = dom.listBody ? dom.listBody.querySelectorAll('.zone-row-check') : [];
            for(var i = 0; i < cbs.length; i++){
                cbs[i].checked = checked;
                var id = cbs[i].getAttribute('data-id');
                if(checked){ state.checkedIds[id] = true; } else { delete state.checkedIds[id]; }
            }
        });

        /* 행별 체크박스 */
        if(dom.listBody) dom.listBody.addEventListener('change', function(e){
            if(!e.target.classList.contains('zone-row-check')) return;
            var id = e.target.getAttribute('data-id');
            if(e.target.checked){ state.checkedIds[id] = true; } else { delete state.checkedIds[id]; }
        });

        /* 행 클릭 → 이름링크=상세 / 수정·삭제 버튼 / 나머지=체크박스 토글 */
        if(dom.listBody) dom.listBody.addEventListener('click', function(e){
            /* 이름 링크 클릭 → 상세 모달 */
            var nameLink = e.target.closest('.zone-name-link');
            if(nameLink){
                e.preventDefault();
                var nlId = nameLink.getAttribute('data-id');
                var nlZone = findZoneById(nlId);
                if(nlZone) renderDetail(nlZone);
                return;
            }
            var editBtn = e.target.closest('.zone-row-edit');
            var deleteBtn = e.target.closest('.zone-row-delete');
            if(editBtn){
                var editId = editBtn.getAttribute('data-id');
                var editZone = findZoneById(editId);
                if(editZone) openEditModal(editZone);
                return;
            }
            if(deleteBtn){
                var delId = deleteBtn.getAttribute('data-id');
                var delZone = findZoneById(delId);
                if(delZone){
                    state._pendingDeleteId = parseInt(delId, 10);
                    if(dom.deleteCount) dom.deleteCount.textContent = '\'' + trim(delZone.zone_name) + '\' 을(를) 삭제합니다.';
                    openModal(dom.deleteModal);
                }
                return;
            }
            /* 체크박스 자체 클릭은 change 이벤트에서 처리 */
            if(e.target.classList.contains('zone-row-check')) return;
            /* 나머지 영역 클릭 → 체크박스 토글 */
            var tr = e.target.closest('tr[data-zone-id]');
            if(!tr) return;
            var cb = tr.querySelector('.zone-row-check');
            if(cb){
                cb.checked = !cb.checked;
                var cbId = cb.getAttribute('data-id');
                if(cb.checked){ state.checkedIds[cbId] = true; } else { delete state.checkedIds[cbId]; }
            }
        });

        /* 추가(cfgshow) 버튼 */
        if(dom.btnAdd) dom.btnAdd.addEventListener('click', function(){
            openAddModal();
        });

        /* 파싱 버튼 */
        if(dom.parseBtn) dom.parseBtn.addEventListener('click', function(){
            var text = trim(dom.cfgshowInput ? dom.cfgshowInput.value : '');
            if(!text){ alert('cfgshow 내용을 입력하세요.'); return; }
            state.parsedEntries = parseCfgshow(text);
            if(!state.parsedEntries.length){
                alert('파싱된 항목이 없습니다. cfgshow 형식을 확인하세요.');
                return;
            }
            renderPreview(state.parsedEntries);
            if(dom.addConfirm) dom.addConfirm.disabled = false;
        });

        /* 다운로드 버튼 */
        if(dom.btnDownload) dom.btnDownload.addEventListener('click', function(){
            openModal(dom.downloadModal);
        });

        /* 다운로드 모달 이벤트 */
        bindModalClose('zone-download-modal', 'zone-download-close', null, function(){
            var rangeAll = document.getElementById('zone-csv-range-all');
            var all = !rangeAll || rangeAll.checked;
            var list = all ? state.filtered : state.filtered.filter(function(z){ return !!state.checkedIds[z.id]; });
            if(!list.length){ alert('내보낼 데이터가 없습니다.'); return; }
            var cols = [
                {key:'entry_type', label:'구분'},
                {key:'zone_name', label:'이름'},
                {key:'member_count', label:'Member 수'},
                {key:'initiator_count', label:'Initiator 수'},
                {key:'target_count', label:'Target 수'},
                {key:'status', label:'상태'},
                {key:'_review', label:'검토'},
                {key:'remark', label:'비고'}
            ];
            var header = cols.map(function(c){ return escapeCSV(c.label); }).join(',');
            var lines = [header];
            for(var i = 0; i < list.length; i++){
                var z = list[i];
                var row = cols.map(function(c){
                    var v = z[c.key];
                    if(c.key === 'status'){
                        v = (trim(v)==='Active'||trim(v)==='활성') ? '활성' : '비활성';
                    }
                    if(c.key === 'entry_type'){
                        v = (trim(v) || 'zone').toUpperCase();
                    }
                    if(c.key === '_review'){
                        v = computeReviewStatus(z);
                    }
                    return escapeCSV(v != null ? String(v) : '');
                });
                lines.push(row.join(','));
            }
            var d = new Date();
            var fname = 'zone_list_' + d.getFullYear() + pad2(d.getMonth()+1) + pad2(d.getDate()) + '.csv';
            downloadCSV(fname, lines);
            closeModal(dom.downloadModal);
        });

        /* cfgshow 추가 모달 이벤트 */
        bindModalClose('zone-add-modal', 'zone-add-close', null, function(){
            if(!state.parsedEntries.length){
                alert('먼저 파싱 버튼을 눌러 미리보기를 확인하세요.');
                return;
            }
            var text = trim(dom.cfgshowInput ? dom.cfgshowInput.value : '');
            apiPost('/api/hardware/assets/' + state.assetId + '/zones/import', {text: text}, function(err, res){
                if(err || !res || !res.success){
                    alert((res && res.error) || 'cfgshow 가져오기에 실패했습니다.');
                    return;
                }
                closeModal(dom.addModal);
                loadZones();
            });
        });

        /* 수정 모달 이벤트 */
        bindModalClose('zone-edit-modal', 'zone-edit-close', null, function(){
            var name = trim(dom.editName ? dom.editName.value : '');
            if(!name){ alert('이름은 필수 입력 항목입니다.'); return; }
            var body = {
                zone_name: name,
                status: dom.editStatus ? dom.editStatus.value : '활성',
                remark: trim(dom.editRemark ? dom.editRemark.value : '')
            };
            // DnD 결과 수집
            if(dom.dndArea && dom.dndArea.style.display !== 'none'){
                body.members = collectDndRoles();
            }
            apiPut('/api/hardware/assets/' + state.assetId + '/zones/' + state.editingZoneId, body, function(err, res){
                if(err || !res || !res.success){
                    alert((res && res.error) || 'Zone 수정에 실패했습니다.');
                    return;
                }
                closeModal(dom.editModal);
                state.editingZoneId = 0;
                loadZones();
            });
        });

        /* 삭제 모달 이벤트 */
        bindModalClose('zone-delete-modal', 'zone-delete-close', 'zone-delete-cancel', function(){
            var ids = [state._pendingDeleteId];
            if(!ids[0]) return;
            apiPost('/api/hardware/assets/' + state.assetId + '/zones/bulk-delete', {ids: ids}, function(err, res){
                if(err || !res || !res.success){
                    alert((res && res.error) || 'Zone 삭제에 실패했습니다.');
                    return;
                }
                closeModal(dom.deleteModal);
                if(state.selectedZone && ids.indexOf(state.selectedZone.id) !== -1) state.selectedZone = null;
                loadZones();
            });
        });

        /* 상세 모달 닫기 */
        bindModalClose('zone-detail-modal', 'zone-detail-close', 'zone-detail-cancel', function(){
            closeModal(dom.detailModal);
        });

        /* 멤버 이동 버튼 초기화 */
        initMoveButtons();
    }

    /* ── 모달 헬퍼 ────────────────────────────── */
    function openModal(el){
        if(!el) return;
        el.setAttribute('aria-hidden', 'false');
        el.style.display = '';
        el.classList.add('show');
    }
    function closeModal(el){
        if(!el) return;
        el.setAttribute('aria-hidden', 'true');
        el.classList.remove('show');
    }

    function openAddModal(){
        if(!dom.addModal) return;
        state.parsedEntries = [];
        if(dom.cfgshowInput) dom.cfgshowInput.value = '';
        if(dom.previewArea) dom.previewArea.style.display = 'none';
        if(dom.previewBody) dom.previewBody.innerHTML = '';
        if(dom.addConfirm) dom.addConfirm.disabled = true;
        openModal(dom.addModal);
    }

    function openEditModal(zone){
        if(!dom.editModal) return;
        state.editingZoneId = zone.id;
        var et = (trim(zone.entry_type) || 'zone').toUpperCase();
        if(dom.editType) dom.editType.value = et;
        if(dom.editName) dom.editName.value = trim(zone.zone_name);
        var isActive = (trim(zone.status) === 'Active' || trim(zone.status) === '활성');
        if(dom.editStatus) dom.editStatus.value = isActive ? '활성' : '비활성';
        if(dom.editRemark) dom.editRemark.value = trim(zone.remark || '');

        /* DnD 영역: 멤버가 있으면 표시 (zone/alias/cfg 모두) */
        var hasMembers = (zone.initiators && zone.initiators.length) || (zone.targets && zone.targets.length);
        if(dom.dndArea){
            if(hasMembers){
                dom.dndArea.style.display = '';
                populateDnd(zone);
            } else {
                dom.dndArea.style.display = 'none';
            }
        }
        openModal(dom.editModal);
        if(window.BlossomSearchableSelect) BlossomSearchableSelect.enhance(dom.editModal);
    }

    function deleteZone(zoneId){
        apiPost('/api/hardware/assets/' + state.assetId + '/zones/bulk-delete', {ids: [zoneId]}, function(err, res){
            if(err || !res || !res.success){
                alert((res && res.error) || 'Zone 삭제에 실패했습니다.');
                return;
            }
            if(state.selectedZone && state.selectedZone.id === zoneId) state.selectedZone = null;
            loadZones();
        });
    }

    function findZoneById(id){
        for(var i = 0; i < state.filtered.length; i++){
            if(String(state.filtered[i].id) === String(id)) return state.filtered[i];
        }
        return null;
    }

    function bindModalClose(modalId, closeId, cancelId, onConfirm){
        var modal   = document.getElementById(modalId);
        var closeEl = document.getElementById(closeId);
        var cancelEl = cancelId ? document.getElementById(cancelId) : null;
        var confirmEl = modal ? (modal.querySelector('.modal-confirm-btn') || modal.querySelector('.btn-primary') || modal.querySelector('.btn-danger')) : null;
        if(closeEl) closeEl.addEventListener('click', function(){ closeModal(modal); });
        if(cancelEl) cancelEl.addEventListener('click', function(){ closeModal(modal); });
        if(confirmEl) confirmEl.addEventListener('click', onConfirm);
        if(modal) modal.addEventListener('click', function(e){
            if(e.target === modal) closeModal(modal);
        });
    }

    /* ── 초기화 ───────────────────────────────── */
    function init(){
        cacheDom();
        var prefix = resolveStoragePrefix();
        state.assetId = getAssetId(prefix);
        if(dom.pageSize) state.pageSize = parseInt(dom.pageSize.value, 10) || 10;
        bindEvents();
        loadInterfaces();
        loadZones();
    }

    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.BlossomTab33Zone = { refresh: loadZones };
})();
