/**
 * Blossom Permission Guard — 페이지별 권한 적용 공통 모듈
 *
 * 사용법:
 *   <script src="/static/js/blossom-permission-guard.js" defer></script>
 *   <script>
 *     document.addEventListener('DOMContentLoaded', function(){
 *       BlossomPermGuard.init('system.server');
 *     });
 *   </script>
 *
 * 또는 data 속성으로 자동 적용:
 *   <body data-menu-code="system.server">
 *
 * 기능:
 *   - NONE: 페이지 내용 숨기고 접근불가 안내
 *   - READ: 쓰기 버튼 제거, 입력 readOnly, 조회전용 배지
 *   - WRITE: 전체 기능 허용
 *   - MutationObserver로 동적 추가되는 버튼도 자동 가드
 */
(function(){
    'use strict';

    var _section = null;
    var _guard = null;
    var _result = null;
    var _observer = null;

    function init(menuCode, opts){
        opts = opts || {};
        _section = menuCode;
        if(!_section){
            var body = document.body || document.documentElement;
            _section = body.getAttribute('data-menu-code') || '';
        }
        if(!_section) return;

        if(!window.BlossomPermissions){
            console.warn('[PermGuard] BlossomPermissions not loaded');
            return;
        }

        window.BlossomPermissions.load(function(){
            _result = window.BlossomPermissions.enforce(_section, opts);
            if(_result && _result.perm === 'READ'){
                _guard = window.BlossomPermissions.createGuard(_section);
                _startObserver();
            }
        });
    }

    /* MutationObserver로 동적 DOM 변경 감시 */
    function _startObserver(){
        if(_observer || !_guard) return;
        _observer = new MutationObserver(function(mutations){
            for(var i=0;i<mutations.length;i++){
                var added = mutations[i].addedNodes;
                for(var j=0;j<added.length;j++){
                    var node = added[j];
                    if(node.nodeType !== 1) continue;
                    _guardNode(node);
                }
            }
        });
        _observer.observe(document.body, { childList: true, subtree: true });
    }

    function _guardNode(el){
        if(!_guard) return;
        // 자신이 버튼이면 체크 (guard가 내부에서 비활성화 처리)
        if(el.tagName === 'BUTTON' || el.tagName === 'A' || el.hasAttribute('data-action')){
            _guard(el);
            return;
        }
        // 자식 중 버튼 탐색 — 쓰기 버튼 비활성화 (guard가 내부에서 처리)
        var btns = el.querySelectorAll('button, a.btn, a.header-btn, .action-btn, [data-action]');
        for(var k=0;k<btns.length;k++){
            _guard(btns[k]);
        }
        // 동적으로 추가된 테이블/행의 체크박스 셀에 bls-chk-col 클래스 부여
        if(document.body.classList.contains('bls-read-mode')){
            // 새로 추가된 테이블 처리
            var tables = (el.tagName === 'TABLE') ? [el] : el.querySelectorAll ? Array.prototype.slice.call(el.querySelectorAll('table')) : [];
            for(var t=0;t<tables.length;t++){
                if(window.BlossomPermissions && window.BlossomPermissions._markCheckboxColumnsInTable){
                    window.BlossomPermissions._markCheckboxColumnsInTable(tables[t]);
                }
            }
            // 새로 추가된 행(tr)의 체크박스 셀 처리
            var trs = (el.tagName === 'TR') ? [el] : el.querySelectorAll ? Array.prototype.slice.call(el.querySelectorAll('tr')) : [];
            for(var r=0;r<trs.length;r++){
                var cells = trs[r].cells;
                for(var c=0;c<cells.length;c++){
                    if(cells[c].querySelector('input[type="checkbox"]')){
                        cells[c].classList.add('bls-chk-col');
                    }
                }
            }
        }
    }

    function getResult(){
        return _result;
    }

    function getSection(){
        return _section;
    }

    function destroy(){
        if(_observer){ _observer.disconnect(); _observer = null; }
        _guard = null;
        _result = null;
    }

    window.BlossomPermGuard = {
        init: init,
        getResult: getResult,
        getSection: getSection,
        destroy: destroy
    };

    /* data-menu-code 속성이 있으면 자동 초기화 */
    function _autoInit(){
        var body = document.body || document.documentElement;
        /* 권한 설정 페이지 자체는 Guard 적용 제외 (관리 UI이므로) */
        if(body.getAttribute('data-skip-perm-guard') === 'true') return;
        var code = body.getAttribute('data-menu-code');
        /* fallback: URL에서 menu code 추론 */
        if(!code) code = _inferMenuCodeFromUrl();
        if(code) init(code);
    }

    /* URL 경로 → menu code 매핑 */
    var _URL_MAP = [
        ['/p/dashboard', 'dashboard'],
        ['/p/hw_server', 'system.server'], ['/p/hw_storage', 'system.storage'],
        ['/p/hw_san', 'system.san'], ['/p/hw_network', 'system.network'],
        ['/p/hw_security', 'system.security'],
        ['/p/gov_backup', 'governance.backup'], ['/p/gov_package', 'governance.package'],
        ['/p/gov_vulnerability', 'governance.vulnerability'], ['/p/gov_ip', 'governance.ip'],
        ['/p/gov_vpn', 'governance.vpn'], ['/p/gov_leased', 'governance.leased_line'],
        ['/p/gov_unused', 'governance.unused_asset'],
        ['/p/datacenter', 'datacenter'], ['/p/cost', 'cost'],
        ['/p/project', 'project'], ['/p/insight', 'insight'],
        ['/p/category', 'category'],
        ['/admin/auth/', 'settings.permission'],
        ['/p/admin', 'settings'],
    ];
    function _inferMenuCodeFromUrl(){
        var path = location.pathname;
        for(var i=0;i<_URL_MAP.length;i++){
            if(path.indexOf(_URL_MAP[i][0])===0) return _URL_MAP[i][1];
        }
        return null;
    }

    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _autoInit);
    else _autoInit();
})();
