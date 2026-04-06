/**
 * blossom.js — 코어 클라이언트 라이브러리
 * =========================================
 * 모든 페이지에서 로드되는 전역 유틸리티·UI 모듈.
 *
 * ── 섹션 목차 (Ctrl+F "§" 로 이동) ──────────────────────────
 *  §1  MFA / Security          (L ~10)     인증·보안 설정, 마스킹
 *  §2  Permissions             (L ~180)    BlossomPermissions IIFE
 *  §3  Tab05 Account Hook      (L ~290)    page-account-manager 클래스
 *  §4  Tab15 File Management   (L ~300)    다이어그램·첨부파일 CRUD
 *  §5  License Label Polish    (L ~1245)   라이선스 라벨 줄바꿈
 *  §6  Tab14 Log Persistence   (L ~1285)   변경이력 localStorage 캐시
 *  §7  List Empty-State UX     (L ~1540)   빈 테이블 → 안내 카드
 *  §8  Add Modal Fallback      (L ~1580)   표준 추가 모달 폴백
 *  §9  Sidebar / Header        (L ~2330)   사이드바 3단계 토글
 *  §10 Toast                   (L ~2690)   showToast() 알림
 *  §11 Fullscreen              (L ~2765)   toggleFullscreen()
 *  §12 Sidebar Control (dup)   (L ~2830)   로고 클릭 토글 (§9 중복)
 *  §13 Cost Tab SPA Nav        (L ~4060)   OPEX/CAPEX 부분 로드
 *  §14 Tab / Settings Mgmt     (L ~4800)   activateTab, updateRowCounts
 *  §15 Avatar Picker           (L ~4920)   openHeaderAvatarPicker()
 *  §16 Session Exit            (L ~5035)   exitProcess()
 *  §17 Pagination              (L ~5080)   changePageSize, goToPage
 *  §18 CSV Download            (L ~5185)   downloadCSV()
 *  §19 Selection & Sort        (L ~5240)   sortTable, toggleSelectAll
 *  §20 Column Selection        (L ~5555)   openColumnSelectModal
 *  §21 Count Badge Utils       (L ~5840)   updateCountBadgeUniversal
 *  §22 Terms Page              (L ~5920)   약관 동의 페이지
 *  §23 Searchable Select       (L ~5990)   searchable_select.js 로더
 *  §24 Required Field UX       (L ~6005)   필수 필드 검증
 *  §25 System Tab Nav          (L ~6150)   full-page + in-page 탭 전환
 *  §26 List Empty-State v2     (L ~6305)   MutationObserver 기반
 *  §27 Tab11 Task Loader       (L ~6415)   tab11-task.js 지연 로드
 *  §28 Date Picker             (L ~6475)   Flatpickr 글로벌 초기화
 * ─────────────────────────────────────────────────────────────
 */

/* Reveal page: all DOM content is parsed before this script, so show immediately */
try { document.body.classList.add('bls-ready'); } catch(_e){}

/* §0 ── FK Session Cache ───────────────────────────────────── */
/**
 * 하드웨어 list/detail 페이지들이 공유하는 FK 데이터 sessionStorage 캐시.
 * 각 페이지의 loadFkSource()에서 window.__blsFkCache.get(url) 로 조회,
 * 캐시 히트 시 네트워크 호출 없이 즉시 반환.
 */
(function(){
    var FK_CACHE_PREFIX = 'blsFk:';
    var FK_TTL_MS = 10 * 60 * 1000; // 10분

    function _sGet(key){
        try { return sessionStorage.getItem(key); } catch(_e){ return null; }
    }
    function _sSet(key, val){
        try { sessionStorage.setItem(key, val); } catch(_e){}
    }
    function _sRemove(key){
        try { sessionStorage.removeItem(key); } catch(_e){}
    }

    /** 캐시에서 FK 데이터 조회. 만료 시 null 반환. */
    function get(url){
        var raw = _sGet(FK_CACHE_PREFIX + url);
        if(!raw) return null;
        try {
            var entry = JSON.parse(raw);
            if(Date.now() - entry.ts > FK_TTL_MS){
                _sRemove(FK_CACHE_PREFIX + url);
                return null;
            }
            return entry.data;
        } catch(_e){
            _sRemove(FK_CACHE_PREFIX + url);
            return null;
        }
    }

    /** FK API 응답 데이터를 캐시에 저장. */
    function set(url, data){
        try {
            _sSet(FK_CACHE_PREFIX + url, JSON.stringify({ ts: Date.now(), data: data }));
        } catch(_e){
            // sessionStorage 용량 초과 시 오래된 FK 캐시 정리 후 재시도
            _purgeOldest();
            try { _sSet(FK_CACHE_PREFIX + url, JSON.stringify({ ts: Date.now(), data: data })); } catch(_e2){}
        }
    }

    /** 모든 FK 캐시 제거 (관리자 데이터 변경 시 호출). */
    function clear(){
        try {
            var keys = [];
            for(var i = 0; i < sessionStorage.length; i++){
                var k = sessionStorage.key(i);
                if(k && k.indexOf(FK_CACHE_PREFIX) === 0) keys.push(k);
            }
            keys.forEach(function(k){ sessionStorage.removeItem(k); });
        } catch(_e){}
    }

    function _purgeOldest(){
        try {
            var oldest = null, oldestKey = null;
            for(var i = 0; i < sessionStorage.length; i++){
                var k = sessionStorage.key(i);
                if(!k || k.indexOf(FK_CACHE_PREFIX) !== 0) continue;
                var raw = sessionStorage.getItem(k);
                if(!raw) continue;
                try {
                    var entry = JSON.parse(raw);
                    if(!oldest || entry.ts < oldest){ oldest = entry.ts; oldestKey = k; }
                } catch(_e){}
            }
            if(oldestKey) sessionStorage.removeItem(oldestKey);
        } catch(_e){}
    }

    window.__blsFkCache = { get: get, set: set, clear: clear };
})();

/* §1 ── MFA / Security ─────────────────────────────────────── */

const BLOSSOM_SECURITY_KEY = 'blossom.security.settings';

function loadSecuritySettingsFromStorage() {
    if (window.BlossomSecurity && typeof window.BlossomSecurity.getSettings === 'function') {
        return window.BlossomSecurity.getSettings();
    }
    try {
        const raw = localStorage.getItem(BLOSSOM_SECURITY_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        console.warn('보안 설정을 불러올 수 없습니다.', err);
        return null;
    }
}

function shouldEnforceMfa(settings) {
    return !!(settings && settings.mfa && settings.mfa.enabled);
}

function maskPhone(value) {
    if (!value) return '';
    const digits = value.replace(/\D/g, '');
    if (digits.length < 7) return value;
    const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 8), digits.slice(8, 10)];
    const maskedMiddle = parts[1] ? parts[1].replace(/\d/g, '*') : '';
    return `${parts[0]}-${maskedMiddle}-${parts[2] || ''}${parts[3] || ''}`.replace(/-$/, '');
}

function maskEmail(value) {
    if (!value || !value.includes('@')) return '';
    const [user, domain] = value.split('@');
    if (!user || !domain) return '';
    const maskedUser = user.length <= 2 ? `${user[0]}*` : `${user[0]}${'*'.repeat(user.length - 2)}${user.slice(-1)}`;
    return `${maskedUser}@${domain}`;
}

function ensureSecurityModalApi() {
    const modalApi = window.BlossomSecurityModal || {};
    let modalEl = null;
    let resolveFn = null;
    let handlersBound = false;

    function ensureModalElement() {
        if (modalEl && document.body.contains(modalEl)) {
            return modalEl;
        }
        modalEl = document.getElementById('mfa-challenge-modal');
        if (modalEl) {
            bindModalHandlers();
            return modalEl;
        }
        if (!document.body) return null;
        modalEl = document.createElement('div');
        modalEl.id = 'mfa-challenge-modal';
        modalEl.className = 'server-add-modal security-modal modal-overlay-full';
        modalEl.setAttribute('aria-hidden', 'true');
        modalEl.setAttribute('role', 'dialog');
        modalEl.setAttribute('aria-modal', 'true');
        modalEl.innerHTML = `
            <div class="server-add-content">
                <div class="server-add-header">
                    <div class="server-add-title">
                        <h3 id="mfa-modal-title">MFA 확인</h3>
                        <p class="server-add-subtitle" id="mfa-modal-subtitle">선택한 두 번째 인증 수단을 입력하세요.</p>
                    </div>
                    <button class="close-btn" type="button" data-mfa-modal="close" aria-label="닫기">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                </div>
                <div class="server-add-body">
                    <form id="mfa-modal-form" autocomplete="off">
                        <input type="hidden" name="mfa_type" id="mfa-modal-type" value="totp">
                        <div class="form-row">
                            <label for="mfa-modal-code">인증 코드</label>
                            <input type="text" id="mfa-modal-code" name="code" class="form-input" inputmode="numeric" placeholder="6자리 코드" maxlength="6" required>
                        </div>
                        <p class="helper-text" id="mfa-modal-hint">인증 앱에 표시된 6자리 숫자를 입력하세요.</p>
                    </form>
                </div>
                <div class="server-add-actions align-right">
                    <div class="action-buttons right">
                        <button type="button" class="btn-secondary" data-mfa-modal="cancel">취소</button>
                        <button type="submit" form="mfa-modal-form" class="btn-primary" id="mfa-modal-confirm">확인</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modalEl);
        bindModalHandlers();
        return modalEl;
    }

    function bindModalHandlers() {
        if (!modalEl || handlersBound) return;
        handlersBound = true;
        modalEl.addEventListener('click', (evt) => {
            if (evt.target === modalEl) closeModal(false);
        });
        const closeBtn = modalEl.querySelector('[data-mfa-modal="close"]');
        const cancelBtn = modalEl.querySelector('[data-mfa-modal="cancel"]');
        const form = modalEl.querySelector('#mfa-modal-form');
        if (closeBtn) closeBtn.addEventListener('click', () => closeModal(false));
        if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal(false));
        if (form) {
            form.addEventListener('submit', (evt) => {
                evt.preventDefault();
                const code = form.code.value.trim();
                if (code.length < 4) {
                    alert('인증 코드를 입력하세요.');
                    return;
                }
                closeModal(true);
            });
        }
        window.addEventListener('keydown', (evt) => {
            if (evt.key === 'Escape' && modalEl && modalEl.classList.contains('show')) {
                closeModal(false);
            }
        });
    }

    function openModal(type = 'totp', options = {}) {
        const modal = ensureModalElement();
        if (!modal) return Promise.resolve(false);
        modal.classList.add('show');
        modal.removeAttribute('aria-hidden');
        const codeInput = modal.querySelector('#mfa-modal-code');
        const subtitle = modal.querySelector('#mfa-modal-subtitle');
        const hint = modal.querySelector('#mfa-modal-hint');
        const typeInput = modal.querySelector('#mfa-modal-type');
        if (typeInput) typeInput.value = type;
        if (codeInput) {
            codeInput.value = '';
            requestAnimationFrame(() => codeInput.focus());
        }
        const mask = options.mask || '';
        if (subtitle) {
            if (type === 'sms') subtitle.textContent = `${mask || '등록된 번호'}로 전달된 코드를 입력하세요.`;
            else if (type === 'email') subtitle.textContent = `${mask || '등록된 메일'}에서 받은 코드를 입력하세요.`;
            else subtitle.textContent = '인증 앱에서 생성된 코드를 입력하세요.';
        }
        if (hint) {
            if (type === 'sms') hint.textContent = 'SMS 코드가 만료되기 전에 입력하세요.';
            else if (type === 'email') hint.textContent = '회사 메일함에서 MFA 알림을 확인하세요.';
            else hint.textContent = '인증 앱(TOTP)에서 현재 표시 중인 6자리 숫자를 입력하세요.';
        }
        return new Promise((resolve) => {
            resolveFn = resolve;
        });
    }

    function closeModal(success) {
        if (!modalEl) return;
        modalEl.classList.remove('show');
        modalEl.setAttribute('aria-hidden', 'true');
        if (resolveFn) {
            resolveFn(!!success);
            resolveFn = null;
        }
    }

    modalApi.ensure = ensureModalElement;
    modalApi.open = openModal;
    modalApi.close = closeModal;
    modalApi.STORAGE_KEY = BLOSSOM_SECURITY_KEY;
    window.BlossomSecurityModal = modalApi;
}

ensureSecurityModalApi();

/* §2 ── Permissions ─────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════
   BlossomPermissions — 엔터프라이즈 프론트엔드 권한 스토어
   NONE / READ / WRITE 3단계 권한.
   ADMIN 은 서버가 모든 메뉴를 WRITE 로 반환.
   ═══════════════════════════════════════════════════════════════ */
(function(){
    var _perms = null;
    var _exports = null;
    var _role = null;
    var _loaded = false;
    var _loading = false;
    var _callbacks = [];

    function load(cb){
        if(_loaded){ if(cb) cb(_perms); return; }
        if(cb) _callbacks.push(cb);
        if(_loading) return;
        _loading = true;
        fetch('/api/session/permissions', { credentials:'same-origin', cache:'no-store' })
            .then(function(r){ return r.json(); })
            .then(function(data){
                if(data && data.success){
                    _perms = data.permissions || {};
                    _exports = data.exports || {};
                    _role = data.role || null;
                }
                _loaded = true;
                _loading = false;
                _callbacks.forEach(function(fn){ try{ fn(_perms); }catch(e){} });
                _callbacks = [];
            })
            .catch(function(){
                _loaded = true;
                _loading = false;
                _perms = {};
                _exports = {};
                _callbacks.forEach(function(fn){ try{ fn(_perms); }catch(e){} });
                _callbacks = [];
            });
    }

    function get(section){
        if(!_perms) return 'READ';
        if(_role === 'ADMIN') return 'WRITE';
        var p = _perms[section];
        if(p) return p;
        // 부모 fallback
        if(section && section.indexOf('.') !== -1){
            var parent = section.split('.')[0];
            return _perms[parent] || 'READ';
        }
        return 'READ';
    }

    function canRead(section){ var p = get(section); return p === 'READ' || p === 'WRITE'; }
    function canWrite(section){ return get(section) === 'WRITE'; }
    function isNone(section){ return get(section) === 'NONE'; }
    function isAdmin(){ return _role === 'ADMIN'; }
    function canExport(section){
        if(isAdmin()) return true;
        if(!_exports) return canWrite(section);
        return !!_exports[section];
    }

    /* ── 쓰기 전용 버튼 키워드 목록 ── */
    var WRITE_KEYWORDS = [
        '불용처리','삭제처리','일괄변경','행 복제','업로드','CSV 다운로드',
        '엑셀 다운로드','추가','수정','저장','승인','반려','초기화',
        '권한변경','일괄등록','설정변경','삭제','등록','생성','편집',
        '복제','가져오기','내보내기','bulk','import','export','upload',
        'create','edit','delete','save','add','remove','update'
    ];
    var EXPORT_KEYWORDS = ['CSV 다운로드','엑셀 다운로드','내보내기','export','download','다운로드'];

    function _isWriteBtn(el){
        var txt = (el.textContent || el.innerText || '').trim().toLowerCase();
        var title = (el.getAttribute('title') || '').toLowerCase();
        var cls = (el.className || '').toLowerCase();
        var dataAction = (el.getAttribute('data-action') || '').toLowerCase();
        var combined = txt + ' ' + title + ' ' + cls + ' ' + dataAction;
        for(var i=0;i<WRITE_KEYWORDS.length;i++){
            if(combined.indexOf(WRITE_KEYWORDS[i].toLowerCase()) !== -1) return true;
        }
        return false;
    }
    function _isExportBtn(el){
        var txt = (el.textContent || el.innerText || '').trim().toLowerCase();
        var title = (el.getAttribute('title') || '').toLowerCase();
        var combined = txt + ' ' + title;
        for(var i=0;i<EXPORT_KEYWORDS.length;i++){
            if(combined.indexOf(EXPORT_KEYWORDS[i].toLowerCase()) !== -1) return true;
        }
        return false;
    }

    /**
     * 엔터프라이즈 권한 적용 (enforce)
     * - NONE → 컨테이너 완전 숨김 + 접근불가 안내
     * - READ → 쓰기 버튼 DOM에서 제거, 입력 readOnly, 안내 배지 표시
     * - WRITE → 전체 기능 허용
     *
     * @param {string} section - 메뉴코드 (예: 'system.server')
     * @param {Object} [opts] - 옵션
     * @param {string|Element} [opts.container] - 숨길 대상 (NONE용)
     * @param {string} [opts.writeSelector] - 쓰기 버튼 CSS 선택자 (직접 지정 시)
     * @param {string} [opts.badgeTarget] - READ 배지를 삽입할 요소 선택자
     * @param {boolean} [opts.autoDetect=true] - 자동 버튼 감지
     */
    function enforce(section, opts){
        opts = opts || {};
        var perm = get(section);
        var autoDetect = opts.autoDetect !== false;

        /* NONE → 접근 불가 */
        if(perm === 'NONE'){
            var container = opts.container;
            if(container){
                var el = typeof container === 'string' ? document.querySelector(container) : container;
                if(el){
                    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:300px;color:#94a3b8;font-size:18px;">권한이 없어 접근할 수 없습니다</div>';
                }
            }
            return { canRead:false, canWrite:false, canExport:false, perm:'NONE' };
        }

        /* WRITE → 모든 기능 허용 */
        if(perm === 'WRITE'){
            return { canRead:true, canWrite:true, canExport:true, perm:'WRITE' };
        }

        /* READ → 조회 전용 모드 */
        var _canExport = canExport(section);

        // 0) body에 read-mode 클래스 + 글로벌 CSS 주입 (동적 행에도 자동 적용)
        _injectReadModeCSS();

        // 1) 명시적으로 지정된 쓰기 버튼 비활성화
        if(opts.writeSelector){
            var nodes = document.querySelectorAll(opts.writeSelector);
            for(var i=0;i<nodes.length;i++) _disableWriteBtn(nodes[i]);
        }

        // 2) 자동 감지: 버튼/a 태그 중 쓰기 키워드 포함 항목 비활성화
        if(autoDetect){
            var allBtns = document.querySelectorAll('button, a.btn, a.header-btn, .action-btn, [data-action]');
            for(var j=0;j<allBtns.length;j++){
                var btn = allBtns[j];
                if(_isExportBtn(btn)){
                    if(!_canExport) _disableWriteBtn(btn);
                } else if(_isWriteBtn(btn)){
                    _disableWriteBtn(btn);
                }
            }
        }

        // 3) 입력 폼 readOnly 처리
        var inputs = document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="search"]), textarea, select');
        for(var m=0;m<inputs.length;m++){
            var inp = inputs[m];
            if(inp.closest('.search-box, .filter-bar, .perm-select-box, [data-search]')) continue;
            if(inp.tagName === 'SELECT') inp.disabled = true;
            else inp.readOnly = true;
        }

        // 4) READ 전용 배지 표시
        _showReadOnlyBadge(opts.badgeTarget);

        return { canRead:true, canWrite:false, canExport:_canExport, perm:'READ' };
    }

    /* body 클래스 기반 글로벌 CSS — 동적 생성 테이블에도 자동 적용 */
    var _cssInjected = false;
    function _injectReadModeCSS(){
        if(_cssInjected) return;
        _cssInjected = true;
        document.body.classList.add('bls-read-mode');
        var style = document.createElement('style');
        style.id = 'bls-read-mode-css';
        style.textContent = [
            /* 체크박스 숨김 (셀은 유지 → 컬럼 정렬 유지) */
            /* 쓰기 버튼 비활성화 스타일 */
            'body.bls-read-mode .bls-btn-disabled{opacity:0.35;pointer-events:none;cursor:not-allowed;user-select:none;filter:grayscale(1)}',
            /* 체크박스 숨김 (셀은 유지 → 컬럼 정렬 유지) */
            'body.bls-read-mode table input[type="checkbox"]{visibility:hidden;pointer-events:none}',
            /* 체크박스 셀 최소 폭으로 축소 */
            'body.bls-read-mode table th:first-child:has(input[type="checkbox"]),',
            'body.bls-read-mode table td:first-child:has(input[type="checkbox"]){',
            '  width:0;min-width:0;max-width:0;padding:0 !important;overflow:hidden;border-right:none !important}',
            /* :has 미지원 브라우저 폴백 — .bls-chk-col 클래스 기반 */
            'body.bls-read-mode table .bls-chk-col{',
            '  width:0;min-width:0;max-width:0;padding:0 !important;overflow:hidden;border-right:none !important}'
        ].join('\n');
        document.head.appendChild(style);

        /* :has 미지원 시 체크박스 셀에 bls-chk-col 클래스 수동 부여 */
        _markCheckboxColumns();
    }

    /* 현재 DOM에 있는 테이블의 체크박스 컬럼에 클래스 표시 */
    function _markCheckboxColumns(){
        var tables = document.querySelectorAll('table');
        for(var t=0;t<tables.length;t++){
            _markCheckboxColumnsInTable(tables[t]);
        }
    }

    /* 쓰기 버튼을 제거 대신 비활성화 (레이아웃 유지) */
    function _disableWriteBtn(el){
        if(el.classList.contains('bls-btn-disabled')) return;
        el.classList.add('bls-btn-disabled');
        el.setAttribute('tabindex', '-1');
        el.setAttribute('aria-disabled', 'true');
        if(el.tagName === 'BUTTON') el.disabled = true;
        if(el.tagName === 'A') el.removeAttribute('href');
        el.onclick = function(e){ e.preventDefault(); e.stopPropagation(); return false; };
    }

    function _markCheckboxColumnsInTable(table){
        /* thead의 th 중 체크박스가 있는 컬럼 인덱스 찾기 */
        var ths = table.querySelectorAll('thead th');
        for(var h=0;h<ths.length;h++){
            if(ths[h].querySelector('input[type="checkbox"]')){
                var idx = ths[h].cellIndex;
                var rows = table.rows;
                for(var r=0;r<rows.length;r++){
                    var cell = rows[r].cells[idx];
                    if(cell) cell.classList.add('bls-chk-col');
                }
            }
        }
    }

    function _showReadOnlyBadge(target){
        if(document.getElementById('bls-readonly-badge')) return;
        var badge = document.createElement('div');
        badge.id = 'bls-readonly-badge';
        badge.style.cssText = 'display:inline-flex;align-items:center;gap:7px;padding:5px 14px;background:linear-gradient(135deg,#f0f4ff 0%,#e8edf5 100%);border:1px solid #c7d2e0;border-radius:20px;font-size:12px;font-weight:500;color:#4a5568;margin-left:14px;letter-spacing:0.02em;box-shadow:0 1px 2px rgba(0,0,0,0.04);';
        badge.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7b8ca8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span style="opacity:0.85;">조회 전용 모드</span>';
        var parent;
        if(target){
            parent = typeof target === 'string' ? document.querySelector(target) : target;
        }
        if(!parent) parent = document.querySelector('.page-title, .content-header, h1, .perm-pane-header');
        if(parent) parent.appendChild(badge);
    }

    /**
     * 동적으로 생성되는 버튼에 대한 가드.
     * READ 권한 시 쓰기 버튼 생성을 차단.
     * @param {string} section
     * @returns {function} guard(el) - el이 쓰기 버튼이면 true(차단)
     */
    function createGuard(section){
        var perm = get(section);
        var _canExport = canExport(section);
        return function guard(el){
            if(perm === 'WRITE' || perm === 'NONE') return false;
            // READ 모드 — 버튼을 제거가 아닌 비활성화
            if(_isExportBtn(el)){
                if(!_canExport){ _disableWriteBtn(el); }
                return false;
            }
            if(_isWriteBtn(el)){
                _disableWriteBtn(el);
                return false;
            }
            return false;
        };
    }

    window.BlossomPermissions = {
        load: load,
        get: get,
        canRead: canRead,
        canWrite: canWrite,
        canExport: canExport,
        isNone: isNone,
        isAdmin: isAdmin,
        enforce: enforce,
        createGuard: createGuard,
        _markCheckboxColumnsInTable: _markCheckboxColumnsInTable,
        getRole: function(){ return _role; },
        getAll: function(){ return _perms || {}; },
        getExports: function(){ return _exports || {}; }
    };
})();

// 페이지 로드 시 자동으로 권한 로드
document.addEventListener('DOMContentLoaded', function(){
    // 로그인 페이지에서는 로드하지 않음
    if(window.location.pathname === '/login') return;
    if(window.BlossomPermissions) window.BlossomPermissions.load();
});

document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('.login-form');
    if (!form) return;
    /* MFA 인증 흐름은 sign-in.html 인라인 스크립트에서 서버 사이드로 처리합니다.
       blossom.js 의 기존 localStorage 기반 MFA 인터셉트는 비활성화합니다. */
    if (window.BlossomSecurityModal && typeof window.BlossomSecurityModal.ensure === 'function') {
        window.BlossomSecurityModal.ensure();
    }
});

/* §3 ── Tab05 Account Hook ──────────────────────────────────── */
// Detail pages: Tab05 (Account Management) minimal layout hook
// Only adds a body class so CSS can align the existing controls (no DOM moves).

document.addEventListener('DOMContentLoaded', () => {
    const accountTable = document.getElementById('am-spec-table');
    if (!accountTable) return;
    document.body.classList.add('page-account-manager');
});

/* §4 ── Tab15 File Management ──────────────────────────────── */
// Generic Tab15 file-tab (diagram + attachments) persistence
// Backend: /api/uploads + /api/tab15-files

(function ensureBlossomTab15File(){
    if (window.BlossomTab15File) return;

    function qs(name) {
        try {
            return new URLSearchParams(window.location.search).get(name);
        } catch (_e) {
            return null;
        }
    }

    function getPageKey() {
        try {
            const m = String(window.location.pathname || '').match(/\/p\/([^\/?#]+)/);
            return m && m[1] ? decodeURIComponent(m[1]) : '';
        } catch (_e) {
            return '';
        }
    }

    function safeJsonParse(raw) {
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (_e) {
            return null;
        }
    }

    function resolveScopeKey(explicitScopeKey) {
        const s = (explicitScopeKey == null ? '' : String(explicitScopeKey)).trim();
        if (s) return s;
        return (getPageKey() || '').trim();
    }

    function resolveOwnerKey(explicitOwnerKey) {
        const s = (explicitOwnerKey == null ? '' : String(explicitOwnerKey)).trim();
        if (s) return s;

        // 0) data-owner-key on <main> (server-rendered, most reliable for session-routed pages)
        try {
            const main = document.querySelector('main.main-content');
            if (main && main.dataset && main.dataset.ownerKey) {
                const v = String(main.dataset.ownerKey).trim();
                if (v) return v;
            }
        } catch (_e) {}

        // 1) Query string candidates
        const qsKeys = [
            'owner_key', 'ownerKey',
            'asset_id', 'assetId',
            'hardware_id', 'hardwareId',
            'policy_id', 'policyId',
            'vpn_line_id', 'vpnLineId',
            'id',
            'code', 'rack_code', 'rackCode',
        ];
        for (const k of qsKeys) {
            const v = qs(k);
            if (v != null && String(v).trim()) return String(v).trim();
        }

        // 2) Storage selected row (best-effort)
        const pageKey = getPageKey();
        const tokens = pageKey ? pageKey.split('_').filter(Boolean) : [];
        const prefixes = [];
        if (pageKey) prefixes.push(pageKey);
        tokens.forEach((t) => prefixes.push(t));

        function rowToOwnerKey(row) {
            if (!row || typeof row !== 'object') return '';
            const candidates = [
                row.owner_key,
                row.ownerKey,
                row.asset_id,
                row.assetId,
                row.policy_id,
                row.policyId,
                row.vpn_line_id,
                row.vpnLineId,
                row.id,
                row.code,
                row.rack_code,
                row.rackCode,
            ];
            for (const c of candidates) {
                if (c == null) continue;
                const v = String(c).trim();
                if (v) return v;
            }
            return '';
        }

        function tryRowFromPrefix(store, prefix) {
            const rowKeys = [
                prefix + ':selected:row',
                prefix + ':selectedRow',
                prefix + '_selected_row',
            ];
            for (const k of rowKeys) {
                const row = safeJsonParse(store.getItem(k));
                const v = rowToOwnerKey(row);
                if (v) return v;
            }

            // Some pages persist only the selected id as a scalar.
            const scalarKeys = [
                prefix + ':selected:owner_key',
                prefix + ':selected:ownerKey',
                prefix + ':selected:asset_id',
                prefix + ':selected:assetId',
                prefix + ':selected:policy_id',
                prefix + ':selected:policyId',
                prefix + ':selected:vpn_line_id',
                prefix + ':selected:vpnLineId',
                prefix + ':selected:id',
                prefix + ':selected:code',
                prefix + ':selected:rack_code',
                prefix + ':selected:rackCode',
            ];
            for (const k of scalarKeys) {
                const raw = store.getItem(k);
                const v = raw == null ? '' : String(raw).trim();
                if (v) return v;
            }
            return '';
        }

        const stores = [window.sessionStorage, window.localStorage].filter(Boolean);
        for (const store of stores) {
            for (const prefix of prefixes) {
                if (!prefix) continue;
                const v = tryRowFromPrefix(store, prefix);
                if (v) return v;
            }
        }

        // 3) Scan any "*:selected:row" / "*:selectedRow" / "*_selected_row" key with a prefix that appears in pageKey
        for (const store of stores) {
            try {
                for (let i = 0; i < store.length; i += 1) {
                    const key = store.key(i);
                    if (!key) continue;
                    const isSelectedRowKey = key.endsWith(':selected:row') || key.endsWith(':selectedRow') || key.endsWith('_selected_row');
                    if (!isSelectedRowKey) continue;
                    if (pageKey) {
                        let prefix = '';
                        if (key.endsWith(':selected:row')) prefix = key.slice(0, key.length - ':selected:row'.length);
                        else if (key.endsWith(':selectedRow')) prefix = key.slice(0, key.length - ':selectedRow'.length);
                        else if (key.endsWith('_selected_row')) prefix = key.slice(0, key.length - '_selected_row'.length);
                        // Require some overlap with pageKey to avoid cross-module collisions
                        const ok = prefix && (pageKey.includes(prefix) || tokens.some((t) => prefix.includes(t) || t.includes(prefix)));
                        if (!ok) continue;
                    }
                    const row = safeJsonParse(store.getItem(key));
                    const v = rowToOwnerKey(row);
                    if (v) return v;
                }
            } catch (_e) {
                // ignore
            }
        }
        return '';
    }

    function normalizeHeaderText(v) {
        const s = String(v == null ? '' : v).trim();
        if (!s || s === '-') return '';
        return s;
    }

    function safeInt(v) {
        const s = String(v == null ? '' : v).trim();
        if (!s) return null;
        const n = parseInt(s, 10);
        return Number.isFinite(n) ? n : null;
    }

    function ensureDetailHeaderPopulated(opts) {
        const o = opts || {};
        const titleEl = document.getElementById('page-title')
            || document.getElementById('detail-title')
            || document.querySelector('.page-header h1');
        const subEl = document.getElementById('page-subtitle')
            || document.getElementById('detail-subtitle')
            || document.querySelector('.page-header p');

        const curTitle = normalizeHeaderText(titleEl ? titleEl.textContent : '');
        const curSub = normalizeHeaderText(subEl ? subEl.textContent : '');
        if (curTitle && curSub) return;

        const ownerKeyCandidate = (o.ownerKey == null ? '' : String(o.ownerKey)).trim();
        const ownerIdCandidate = safeInt(ownerKeyCandidate);

        const pageKey = getPageKey();
        const tokens = pageKey ? pageKey.split('_').filter(Boolean) : [];

        const prefixes = [];
        try {
            if (window.STORAGE_PREFIX) prefixes.push(String(window.STORAGE_PREFIX));
        } catch (_e) {}
        if (pageKey) prefixes.push(pageKey);
        for (const t of tokens) prefixes.push(t);

        function fromRow(row, kind) {
            if (!row || typeof row !== 'object') return '';
            if (kind === 'work') {
                return normalizeHeaderText(row.work_name || row.workName || row.work || row.title || row.name);
            }
            if (kind === 'system') {
                return normalizeHeaderText(row.system_name || row.systemName || row.system || row.subTitle || row.subtitle);
            }
            return '';
        }

        function rowMatchesOwner(row) {
            if (!ownerKeyCandidate) return false;
            if (!row || typeof row !== 'object') return false;

            // Numeric id match (most hardware/security pages)
            if (ownerIdCandidate != null) {
                const rid = safeInt(row.hardware_id != null ? row.hardware_id : (row.asset_id != null ? row.asset_id : row.id));
                if (rid != null && rid === ownerIdCandidate) return true;
            }

            // String id/code match
            const candidates = [
                row.owner_key,
                row.ownerKey,
                row.asset_id,
                row.assetId,
                row.hardware_id,
                row.hardwareId,
                row.id,
                row.code,
            ];
            for (const c of candidates) {
                if (c == null) continue;
                const v = String(c).trim();
                if (v && v === ownerKeyCandidate) return true;
            }
            return false;
        }

        function tryFromPrefix(store, prefix, kind) {
            const keyBase = prefix + ':selected:' + kind;
            const legacyKey = keyBase + '_name';
            const altKey = prefix + ':selected:' + (kind === 'work' ? 'work_name' : 'system_name');
            const v = normalizeHeaderText(store.getItem(keyBase))
                || normalizeHeaderText(store.getItem(legacyKey))
                || normalizeHeaderText(store.getItem(altKey));
            if (v) return v;

            const rowKeys = [
                prefix + ':selected:row',
                prefix + ':selectedRow',
                prefix + '_selected_row',
            ];
            for (const rk of rowKeys) {
                const row = safeJsonParse(store.getItem(rk));
                const rv = fromRow(row, kind);
                if (rv) return rv;
            }
            return '';
        }

        function resolve(kind) {
            const stores = [window.sessionStorage, window.localStorage].filter(Boolean);

            // 0) If we have an owner key, prefer exact row match across all selected rows.
            if (ownerKeyCandidate) {
                for (const store of stores) {
                    try {
                        for (let i = 0; i < store.length; i += 1) {
                            const k = store.key(i);
                            if (!k) continue;
                            const isSelectedRowKey = k.endsWith(':selected:row') || k.endsWith(':selectedRow') || k.endsWith('_selected_row');
                            if (!isSelectedRowKey) continue;
                            const row = safeJsonParse(store.getItem(k));
                            if (!rowMatchesOwner(row)) continue;
                            const v = fromRow(row, kind);
                            if (v) return v;
                        }
                    } catch (_e0) {
                        // ignore
                    }
                }
            }

            for (const store of stores) {
                for (const prefix of prefixes) {
                    if (!prefix) continue;
                    const v = tryFromPrefix(store, prefix, kind);
                    if (v) return v;
                }
            }

            // Scan generic keys with overlap check to avoid cross-module collisions.
            for (const store of stores) {
                try {
                    for (let i = 0; i < store.length; i += 1) {
                        const k = store.key(i);
                        if (!k) continue;
                        const isKindKey = k.endsWith(':selected:' + kind)
                            || k.endsWith(':selected:' + kind + '_name')
                            || (kind === 'work' ? k.endsWith(':selected:work_name') : k.endsWith(':selected:system_name'));
                        if (!isKindKey) continue;

                        if (pageKey) {
                            const prefix = k.split(':selected:')[0] || '';
                            const ok = prefix && (pageKey.includes(prefix) || tokens.some((t) => prefix.includes(t) || t.includes(prefix)));
                            if (!ok) continue;
                        }
                        const v = normalizeHeaderText(store.getItem(k));
                        if (v) return v;
                    }
                } catch (_e) {}
            }

            // Last resort: scan selected rows and pick first overlapping prefix.
            for (const store of stores) {
                try {
                    for (let i = 0; i < store.length; i += 1) {
                        const k = store.key(i);
                        if (!k) continue;
                        const isSelectedRowKey = k.endsWith(':selected:row') || k.endsWith(':selectedRow') || k.endsWith('_selected_row');
                        if (!isSelectedRowKey) continue;
                        if (pageKey) {
                            let prefix = '';
                            if (k.endsWith(':selected:row')) prefix = k.slice(0, k.length - ':selected:row'.length);
                            else if (k.endsWith(':selectedRow')) prefix = k.slice(0, k.length - ':selectedRow'.length);
                            else if (k.endsWith('_selected_row')) prefix = k.slice(0, k.length - '_selected_row'.length);
                            const ok = prefix && (pageKey.includes(prefix) || tokens.some((t) => prefix.includes(t) || t.includes(prefix)));
                            if (!ok) continue;
                        }
                        const row = safeJsonParse(store.getItem(k));
                        const v = fromRow(row, kind);
                        if (v) return v;
                    }
                } catch (_e2) {}
            }

            return '';
        }

        const work = resolve('work');
        const system = resolve('system');
        if (titleEl && work && work !== curTitle) titleEl.textContent = work;
        if (subEl && system && system !== curSub) subEl.textContent = system;

        // Async fallback: direct entry to /p/hw_security_*_file may have no stored selection context.
        // In that case, use the module's assets API to get work_name/system_name.
        try {
            const stillMissingTitle = !normalizeHeaderText(titleEl ? titleEl.textContent : '');
            const stillMissingSub = !normalizeHeaderText(subEl ? subEl.textContent : '');
            if (!(stillMissingTitle || stillMissingSub)) return;
            if (!ownerIdCandidate) return;

            const pageKey = getPageKey();
            const m = String(pageKey || '').match(/^hw_security_([^_]+)_file$/);
            if (!m || !m[1]) return;
            const device = String(m[1] || '').trim();
            if (!device) return;

            const url = `/api/hardware/security/${encodeURIComponent(device)}/assets/${ownerIdCandidate}`;
            fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
                .then((res) => res.json().catch(() => null).then((data) => ({ ok: res.ok, data })))
                .then(({ ok, data }) => {
                    if (!ok || !data || data.success === false) return;
                    const item = data.item || {};
                    const w = normalizeHeaderText(item.work_name || item.workName);
                    const s = normalizeHeaderText(item.system_name || item.systemName);
                    if (titleEl && w) titleEl.textContent = w;
                    if (subEl && s) subEl.textContent = s;
                })
                .catch((_e) => {});
        } catch (_e2) {}
    }

    function humanSize(bytes) {
        try {
            if (bytes == null || bytes === '') return '-';
            const b = Number(bytes);
            if (!Number.isFinite(b)) return String(bytes);
            if (b < 1024) return `${b} B`;
            const units = ['KB', 'MB', 'GB', 'TB'];
            let v = b;
            let i = -1;
            while (v >= 1024 && i < units.length - 1) {
                v /= 1024;
                i += 1;
            }
            return `${v.toFixed(1)} ${units[i]}`;
        } catch (_e) {
            return String(bytes || '-');
        }
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function apiJson(url, options) {
        const res = await fetch(url, {
            credentials: 'same-origin',
            ...(options || {}),
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                ...(options && options.headers ? options.headers : {}),
            },
        });
        let body = null;
        try {
            body = await res.json();
        } catch (_e) {
            body = null;
        }
        if (!res.ok || (body && body.success === false)) {
            const msg = (body && (body.message || body.error)) ? (body.message || body.error) : `요청 실패 (${res.status})`;
            const err = new Error(msg);
            err.status = res.status;
            err.body = body;
            throw err;
        }
        return body;
    }

    function badge(ext) {
        return `<span class="t15-file-badge">${String(ext || '').toUpperCase()}</span>`;
    }

    function canAutoInit() {
        const diagramBox = document.getElementById('fi-diagram-box');
        const attachDrop = document.getElementById('fi-attach-drop');
        const attachList = document.getElementById('fi-attach-list');
        if (!diagramBox && !attachDrop && !attachList) return false;
        return true;
    }

    function init(opts) {
        const diagramBox = document.getElementById('fi-diagram-box');
        const diagramInput = document.getElementById('fi-diagram-input');
        const diagramImg = document.getElementById('fi-diagram-img');
        const diagramEmpty = document.getElementById('fi-diagram-empty');
        const diagramClear = document.getElementById('fi-diagram-clear');

        const attachInput = document.getElementById('fi-attach-input');
        const attachDrop = document.getElementById('fi-attach-drop');
        const attachList = document.getElementById('fi-attach-list');
        const attachCount = document.getElementById('fi-attach-count');

        const initRoot = document.querySelector('main.tab15-file-root')
            || (diagramBox && diagramBox.closest('main.main-content'))
            || (attachDrop && attachDrop.closest('main.main-content'))
            || (attachList && attachList.closest('main.main-content'))
            || document.querySelector('main.main-content')
            || document.body;

        try {
            if (initRoot && initRoot.dataset && initRoot.dataset.blsTab15GenericWired === '1') return true;
        } catch (_e) {}

        if (!diagramBox && !attachDrop && !attachList) return false;

        const scopeKey = resolveScopeKey(opts && opts.scopeKey);
        const ownerKey = resolveOwnerKey(opts && opts.ownerKey);
        if (!scopeKey || !ownerKey) return false;

        const MAX_ATTACH_FILES = 5;
        const MAX_FILE_SIZE = 10 * 1024 * 1024;

        const noticeModal = document.getElementById('file-notice-modal');
        const noticeText = document.getElementById('file-notice-text');
        const noticeOk = document.getElementById('file-notice-ok');
        const noticeClose = document.getElementById('file-notice-close');

        function showNotice(msg) {
            const text = String(msg == null ? '' : msg);
            if (noticeText) noticeText.textContent = text;
            if (noticeModal) {
                noticeModal.classList.add('show');
                noticeModal.setAttribute('aria-hidden', 'false');
                try {
                    document.body.classList.add('modal-open');
                } catch (_e) {}
            } else {
                window.alert(text);
            }
        }
        function hideNotice() {
            if (!noticeModal) return;
            noticeModal.classList.remove('show');
            noticeModal.setAttribute('aria-hidden', 'true');
            try {
                if (!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open');
            } catch (_e) {}
        }
        if (noticeOk) noticeOk.addEventListener('click', (e) => {
            e.preventDefault();
            hideNotice();
        });
        if (noticeClose) noticeClose.addEventListener('click', (e) => {
            e.preventDefault();
            hideNotice();
        });
        if (noticeModal) noticeModal.addEventListener('click', (e) => {
            if (e.target === noticeModal) hideNotice();
        });

        function updateAttachCount() {
            if (!attachCount) return;
            const n = attachList ? attachList.querySelectorAll('li').length : 0;
            attachCount.textContent = String(n);
            attachCount.classList.remove('large-number', 'very-large-number');
            if (n >= 100) attachCount.classList.add('very-large-number');
            else if (n >= 10) attachCount.classList.add('large-number');
            if (attachDrop) attachDrop.style.display = (n >= MAX_ATTACH_FILES) ? 'none' : '';
        }

        function setDiagramPreviewFromUrl(url) {
            if (!diagramImg || !diagramEmpty) return;
            if (!url) {
                try {
                    diagramImg.removeAttribute('src');
                } catch (_e) {}
                diagramImg.hidden = true;
                diagramEmpty.hidden = false;
                if (diagramBox) diagramBox.classList.remove('has-image');
                return;
            }
            diagramImg.src = url;
            diagramImg.hidden = false;
            diagramEmpty.hidden = true;
            if (diagramBox) diagramBox.classList.add('has-image');
        }
        if (diagramImg) diagramImg.addEventListener('error', () => {
            setDiagramPreviewFromUrl('');
        });

        function isAllowedDiagramImage(file) {
            const name = (file && file.name ? String(file.name) : '').toLowerCase();
            return name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg');
        }

        async function uploadFileToServer(file) {
            const fd = new FormData();
            fd.append('file', file);
            const rec = await apiJson('/api/uploads', { method: 'POST', body: fd });
            return {
                uploadToken: rec.id,
                fileName: rec.name,
                fileSize: rec.size,
            };
        }

        async function apiListAll() {
            return apiJson(`/api/tab15-files?scope_key=${encodeURIComponent(scopeKey)}&owner_key=${encodeURIComponent(ownerKey)}`, { method: 'GET' });
        }

        async function apiCreateEntry(payload) {
            return apiJson('/api/tab15-files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload || {}),
            });
        }

        async function apiDeleteEntry(entryId) {
            return apiJson(`/api/tab15-files/${encodeURIComponent(String(entryId))}?delete_upload=1`, { method: 'DELETE' });
        }

        function renderAttachments(items) {
            if (!attachList) return;
            attachList.innerHTML = '';
            (items || []).forEach((it) => {
                const li = document.createElement('li');
                li.className = 't15-attach-item';
                li.dataset.entryId = String(it.id);
                li.dataset.downloadUrl = String(it.download_url || it.raw_url || '');

                const fileName = it.file_name || '파일';
                const ext = (String(fileName).split('.').pop() || '').slice(0, 6);
                const sizeText = humanSize(it.file_size);

                li.innerHTML = `
                    <div class="t15-file-chip">${badge(ext || 'FILE')}<span class="t15-file-name">${escapeHtml(fileName)}</span><span class="t15-file-size">${escapeHtml(sizeText)}</span></div>
                    <div class="t15-chip-actions">
                        <button class="t15-icon-btn js-att-dl" type="button" title="다운로드" aria-label="다운로드" ${li.dataset.downloadUrl ? '' : 'disabled'}>
                            <img src="/static/image/svg/list/free-icon-download.svg" alt="다운" class="t15-action-icon">
                        </button>
                        <button class="t15-icon-btn danger js-att-del" type="button" title="삭제" aria-label="삭제">
                            <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="t15-action-icon">
                        </button>
                    </div>
                `;
                attachList.appendChild(li);
            });
            updateAttachCount();
        }

        let currentDiagram = null;
        let currentAttachments = [];
        let busy = false;

        async function loadState() {
            const data = await apiListAll();
            const items = Array.isArray(data.items) ? data.items : [];
            const diagrams = items.filter((it) => String(it.entry_type || '').toUpperCase() === 'DIAGRAM');
            currentDiagram = diagrams.find((it) => !!it.is_primary) || diagrams[0] || null;
            setDiagramPreviewFromUrl(currentDiagram ? (currentDiagram.download_url || currentDiagram.raw_url || '') : '');

            currentAttachments = items.filter((it) => String(it.entry_type || '').toUpperCase() !== 'DIAGRAM');
            renderAttachments(currentAttachments);
        }

        async function handleDiagramFile(file) {
            if (!file) return;
            if (!isAllowedDiagramImage(file)) {
                showNotice('지원하지 않는 이미지 형식입니다. (png/jpg/jpeg만 허용)');
                return;
            }
            if (file.size != null && file.size > MAX_FILE_SIZE) {
                showNotice('10MB 초과 파일은 업로드할 수 없습니다.');
                return;
            }
            if (busy) return;
            if (currentDiagram && currentDiagram.id) {
                let ok = false;
                try {
                    ok = window.confirm('기존 구성도를 교체하시겠습니까?');
                } catch (_e) {
                    ok = false;
                }
                if (!ok) return;
            }

            busy = true;
            try {
                // optimistic preview
                try {
                    const localUrl = URL.createObjectURL(file);
                    setDiagramPreviewFromUrl(localUrl);
                } catch (_e) {}

                const uploaded = await uploadFileToServer(file);
                const created = await apiCreateEntry({
                    scope_key: scopeKey,
                    owner_key: ownerKey,
                    entry_type: 'DIAGRAM',
                    upload_token: uploaded.uploadToken,
                    file_name: uploaded.fileName,
                    file_size: uploaded.fileSize,
                    mime_type: (file && file.type) ? file.type : 'application/octet-stream',
                    is_primary: true,
                });
                currentDiagram = created && created.item ? created.item : null;
                await loadState();
            } catch (e) {
                console.warn('[tab15-file] diagram upload failed', e);
                showNotice(e && e.message ? e.message : '구성도 업로드 중 오류가 발생했습니다.');
                try {
                    await loadState();
                } catch (_e) {}
            } finally {
                busy = false;
            }
        }

        async function clearDiagram() {
            if (busy) return;
            if (!currentDiagram || !currentDiagram.id) {
                setDiagramPreviewFromUrl('');
                return;
            }
            busy = true;
            try {
                await apiDeleteEntry(currentDiagram.id);
                currentDiagram = null;
                await loadState();
            } catch (e) {
                console.warn('[tab15-file] diagram delete failed', e);
                showNotice(e && e.message ? e.message : '구성도 삭제 중 오류가 발생했습니다.');
                try {
                    await loadState();
                } catch (_e) {}
            } finally {
                busy = false;
            }
        }

        async function handleAttachmentFiles(files) {
            const list = Array.from(files || []).filter(Boolean);
            if (!list.length) return;
            if (busy) return;

            const existingNames = new Set();
            try {
                (currentAttachments || []).forEach((it) => {
                    const n = (it && it.file_name != null) ? String(it.file_name).toLowerCase() : '';
                    if (n) existingNames.add(n);
                });
            } catch (_e0) {}

            const accepted = [];
            const dup = [];
            const oversize = [];
            let overlimit = false;

            for (const file of list) {
                if ((currentAttachments ? currentAttachments.length : 0) + accepted.length >= MAX_ATTACH_FILES) {
                    overlimit = true;
                    continue;
                }
                if (file && file.size != null && file.size > MAX_FILE_SIZE) {
                    oversize.push(file.name || '');
                    continue;
                }
                const key = (file && file.name ? String(file.name) : '').toLowerCase();
                const inBatchDup = accepted.some((a) => (a && a.name ? String(a.name).toLowerCase() : '') === key);
                if ((key && existingNames.has(key)) || (key && inBatchDup)) {
                    dup.push(file.name || '');
                    continue;
                }
                if (key) existingNames.add(key);
                accepted.push(file);
            }

            if (dup.length || oversize.length || overlimit) {
                const messages = [];
                if (dup.length) messages.push('중복 파일 제외: ' + dup.filter(Boolean).join(', '));
                if (oversize.length) messages.push('10MB 초과 파일 제외: ' + oversize.filter(Boolean).join(', '));
                if (overlimit) messages.push('파일은 최대 5개까지 업로드할 수 있습니다.');
                if (messages.length) showNotice(messages.join('\n'));
            }

            if (!accepted.length) return;

            busy = true;
            try {
                for (const file of accepted) {
                    const uploaded = await uploadFileToServer(file);
                    await apiCreateEntry({
                        scope_key: scopeKey,
                        owner_key: ownerKey,
                        entry_type: 'ATTACHMENT',
                        upload_token: uploaded.uploadToken,
                        file_name: uploaded.fileName,
                        file_size: uploaded.fileSize,
                        mime_type: (file && file.type) ? file.type : 'application/octet-stream',
                    });
                }
                await loadState();
            } catch (e) {
                console.warn('[tab15-file] attachment upload failed', e);
                showNotice(e && e.message ? e.message : '첨부파일 업로드 중 오류가 발생했습니다.');
                try {
                    await loadState();
                } catch (_e) {}
            } finally {
                busy = false;
            }
        }

        // Wire UI
        function pickDiagram() {
            if (diagramInput) diagramInput.click();
        }
        if (diagramBox) {
            diagramBox.addEventListener('click', pickDiagram);
            diagramBox.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pickDiagram();
                }
            });
            ['dragenter', 'dragover'].forEach((ev) => {
                diagramBox.addEventListener(ev, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    diagramBox.classList.add('dragover');
                });
            });
            ['dragleave', 'drop'].forEach((ev) => {
                diagramBox.addEventListener(ev, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    diagramBox.classList.remove('dragover');
                    if (ev === 'drop') {
                        const dt = e.dataTransfer;
                        const file = dt && dt.files && dt.files[0];
                        if (file) handleDiagramFile(file);
                    }
                });
            });
        }
        if (diagramInput) {
            diagramInput.addEventListener('change', () => {
                const file = diagramInput.files && diagramInput.files[0];
                if (file) handleDiagramFile(file);
                diagramInput.value = '';
            });
        }
        if (diagramClear) diagramClear.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.flOpenDeleteModal === 'function') {
                // Reuse a fake li-like element so the modal can show a meaningful message
                var fakeLi = document.createElement('li');
                fakeLi.innerHTML = '<div class="t15-file-chip"><span class="t15-file-name">대표 구성도</span></div>';
                window.flOpenDeleteModal(fakeLi, () => { clearDiagram(); });
            } else {
                clearDiagram();
            }
        });

        function pickAttachments() {
            if (attachInput) attachInput.click();
        }
        if (attachDrop) {
            attachDrop.addEventListener('click', pickAttachments);
            attachDrop.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pickAttachments();
                }
            });
            ['dragenter', 'dragover'].forEach((ev) => {
                attachDrop.addEventListener(ev, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    attachDrop.classList.add('dragover');
                });
            });
            ['dragleave', 'drop'].forEach((ev) => {
                attachDrop.addEventListener(ev, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    attachDrop.classList.remove('dragover');
                    if (ev === 'drop') {
                        const dt = e.dataTransfer;
                        if (dt && dt.files && dt.files.length) handleAttachmentFiles(dt.files);
                    }
                });
            });
        }
        if (attachInput) {
            attachInput.addEventListener('change', () => {
                const files = attachInput.files;
                if (files && files.length) handleAttachmentFiles(files);
                attachInput.value = '';
            });
        }

        if (attachList) {
            attachList.addEventListener('click', async (e) => {
                const li = e.target.closest('li.t15-attach-item');
                if (!li) return;
                const dlBtn = e.target.closest('.js-att-dl');
                const delBtn = e.target.closest('.js-att-del');
                if (dlBtn) {
                    e.preventDefault();
                    if (typeof window.flOpenDownloadModal === 'function') {
                        window.flOpenDownloadModal(li);
                    } else {
                        const href = li.dataset.downloadUrl || '';
                        if (href) window.open(href, '_blank');
                    }
                    return;
                }
                if (delBtn) {
                    e.preventDefault();
                    const id = parseInt(li.dataset.entryId || '', 10);
                    if (!Number.isFinite(id)) return;
                    if (busy) return;
                    const doDelete = async () => {
                        busy = true;
                        try {
                            await apiDeleteEntry(id);
                            li.remove();
                            updateAttachCount();
                        } catch (err) {
                            console.warn('[tab15-file] attachment delete failed', err);
                            showNotice(err && err.message ? err.message : '첨부파일 삭제 중 오류가 발생했습니다.');
                            try {
                                await loadState();
                            } catch (_e) {}
                        } finally {
                            busy = false;
                        }
                    };
                    if (typeof window.flOpenDeleteModal === 'function') {
                        window.flOpenDeleteModal(li, doDelete);
                    } else {
                        doDelete();
                    }
                }
            });
        }

        // initial load
        loadState().catch((e) => {
            console.warn('[tab15-file] initial load failed', e);
        });

        try {
            if (initRoot && initRoot.dataset) initRoot.dataset.blsTab15GenericWired = '1';
        } catch (_e) {}
        return true;
    }

    function initFromPage(opts) {
        if (!canAutoInit()) return false;
        const scopeKey = resolveScopeKey(opts && opts.scopeKey);
        const ownerKey = resolveOwnerKey(opts && opts.ownerKey);
        if (!scopeKey || !ownerKey) return false;

        // Many tab15-file templates do not include their module-specific *detail.js,
        // so the page header can stay as "-". Best-effort populate it from stored selection.
        // However, vendor detail pages (maintenance/manufacturer) already have the correct
        // title/subtitle provided by the server — skip header override for those.
        try {
            var pk = getPageKey();
            var isVendorTab = /^cat_vendor_(maintenance|manufacturer)_/.test(pk);
            if (!isVendorTab) {
                ensureDetailHeaderPopulated({ ownerKey });
            }
        } catch (_e) {}

        return init({ scopeKey, ownerKey });
    }

    window.BlossomTab15File = {
        init,
        initFromPage,
    };
})();

// Auto-wire generic file tab when the page includes the common tab15-file DOM.
// This keeps legacy/detail-specific pages working even if their own JS doesn't call initFromPage().
document.addEventListener('DOMContentLoaded', () => {
    try {
        if (window.BlossomTab15File && typeof window.BlossomTab15File.initFromPage === 'function') {
            window.BlossomTab15File.initFromPage();
        }
    } catch (e) {
        try {
            console.warn('[tab15-file] auto init failed', e);
        } catch (_e) {}
    }
});

/* §5 ── License Label Polish ────────────────────────────────── */
// Common UI polish: split long license labels across pages
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Patterns to split: 라이선스 전체수량, 라이선스 할당수량, 라이선스 유휴수량
        const licenseLabels = ['라이선스 전체수량','라이선스 할당수량','라이선스 유휴수량'];
        const splitText = (text) => {
            if (!text) return text;
            for (const label of licenseLabels) {
                if (text.includes(label)) {
                    // Insert a line break between the first and second word
                    const parts = label.split(' ');
                    const replaced = parts[0] + '\u00A0' + '\n' + parts.slice(1).join(' ');
                    return text.replace(label, replaced);
                }
            }
            return text;
        };
        // Table headers
        document.querySelectorAll('th').forEach(th => {
            const orig = th.textContent.trim();
            const next = splitText(orig);
            if (next !== orig) {
                th.innerHTML = next.replace('\n', '<br>');
            }
        });
        // Form labels
        document.querySelectorAll('label').forEach(label => {
            const orig = label.textContent.trim();
            const next = splitText(orig);
            if (next !== orig) {
                label.innerHTML = next.replace('\n', '<br>');
            }
        });
    } catch (_) { /* no-op */ }
});

/* §6 ── Tab14 Log Persistence ──────────────────────────────── */
// tab14-log: persist "변경이력" rows per page (entity_key derived from URL)
document.addEventListener('DOMContentLoaded', () => {
    try {
        if (window.BlossomTab14Log) return;
        const table = document.getElementById('lg-spec-table');
        if (!table) return;

        function normalizeText(v) {
            const s = String(v == null ? '' : v).trim();
            return (s === '-') ? '' : s;
        }

        function canonicalEntityKey() {
            try {
                const url = new URL(window.location.href);
                const keys = [];
                url.searchParams.forEach((_, k) => { keys.push(k); });
                keys.sort();
                const norm = new URLSearchParams();
                keys.forEach((k) => {
                    const vals = url.searchParams.getAll(k);
                    vals.forEach((v) => norm.append(k, v));
                });
                const qs = norm.toString();
                return url.pathname + (qs ? ('?' + qs) : '');
            } catch (_) {
                return String(location.pathname || '') + String(location.search || '');
            }
        }

        function getRowId(tr) {
            if (!tr) return null;
            const v = tr.getAttribute('data-change-log-id') || (tr.dataset ? tr.dataset.changeLogId : null);
            const n = parseInt(v, 10);
            return (!Number.isNaN(n) && n > 0) ? n : null;
        }

        function setRowId(tr, id) {
            try {
                const n = parseInt(id, 10);
                if (Number.isNaN(n) || n <= 0) return;
                if (tr.dataset) tr.dataset.changeLogId = String(n);
                tr.setAttribute('data-change-log-id', String(n));
            } catch (_) { /* no-op */ }
        }

        function readCellValue(tr, col) {
            try {
                const td = tr.querySelector('[data-col="' + col + '"]');
                if (!td) return '';
                const inp = td.querySelector('input, textarea, select');
                const val = inp ? inp.value : (td.textContent || '');
                return normalizeText(val);
            } catch (_) {
                return '';
            }
        }

        function readContent(tr) {
            try {
                const td = tr.querySelector('[data-col="content"]');
                if (!td) return { summary: '', detail: '' };
                const inline = td.querySelector('.lg-inline');
                const summary = normalizeText(inline ? inline.value : '');
                let detail = normalizeText((td.dataset && td.dataset.full) ? td.dataset.full : '');
                if (!detail) {
                    const pv = td.querySelector('.procedure-preview, .change-preview');
                    if (pv) {
                        detail = normalizeText(pv.getAttribute('title') || pv.dataset.full || pv.textContent || '');
                    }
                }
                return { summary, detail };
            } catch (_) {
                return { summary: '', detail: '' };
            }
        }

        async function apiList(entityKey) {
            const url = '/api/change-logs?entity_key=' + encodeURIComponent(entityKey)
                + '&page=1&page_size=5000';
            const r = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
            const j = await r.json().catch(() => null);
            if (!r.ok) throw new Error((j && j.error) ? j.error : ('HTTP ' + r.status));
            return j;
        }

        async function apiCreate(payload) {
            const r = await fetch('/api/change-logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(payload || {})
            });
            const j = await r.json().catch(() => null);
            if (!r.ok) throw new Error((j && j.error) ? j.error : ('HTTP ' + r.status));
            return j;
        }

        async function apiUpdate(id, payload) {
            const r = await fetch('/api/change-logs/' + encodeURIComponent(String(id)), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(payload || {})
            });
            const j = await r.json().catch(() => null);
            if (!r.ok) throw new Error((j && j.error) ? j.error : ('HTTP ' + r.status));
            return j;
        }

        async function apiDelete(id) {
            const r = await fetch('/api/change-logs/' + encodeURIComponent(String(id)), {
                method: 'DELETE',
                headers: { 'Accept': 'application/json' }
            });
            const j = await r.json().catch(() => null);
            if (!r.ok) throw new Error((j && j.error) ? j.error : ('HTTP ' + r.status));
            return j;
        }

        function escapeAttr(s) {
            return String(s || '').replace(/"/g, '&quot;');
        }

        function renderSavedRow(item) {
            const tr = document.createElement('tr');
            if (item && item.id != null) setRowId(tr, item.id);

            const whenVal = (item && item.when) ? item.when : '-';
            const typeVal = (item && item.type) ? item.type : '-';
            const ownerVal = (item && item.owner) ? item.owner : '-';
            const tabVal = (item && item.tab) ? item.tab : '-';
            const summaryVal = (item && item.summary) ? item.summary : '';
            const detailVal = (item && item.detail) ? item.detail : '';
            const full = detailVal || summaryVal;
            const isMultiline = /\r?\n/.test(full);
            const isLong = full.length > 80;
            const preview = (isMultiline || isLong) ? '세부내용 참조' : (full || '-');

            tr.innerHTML = [
                '<td><input type="checkbox" class="lg-row-check" aria-label="행 선택"></td>',
                '<td data-col="when">' + escapeAttr(whenVal) + '</td>',
                '<td data-col="type">' + escapeAttr(typeVal) + '</td>',
                '<td data-col="owner">' + escapeAttr(ownerVal) + '</td>',
                '<td data-col="tab">' + escapeAttr(tabVal) + '</td>',
                '<td data-col="content" data-full="' + escapeAttr(full) + '">' +
                    '<div class="cell-flex">' +
                        '<div class="form-input-static procedure-preview" title="' + escapeAttr(full) + '">' + escapeAttr(preview) + '</div>' +
                        '<button class="action-btn ghost js-lg-detail" type="button" title="세부내용" aria-label="세부내용">' +
                            '<img src="/static/image/svg/free-icon-assessment.svg" alt="세부내용" class="action-icon">' +
                        '</button>' +
                    '</div>' +
                '</td>',
                '<td class="system-actions table-actions">' +
                    '<button class="action-btn js-lg-toggle" data-action="edit" type="button" title="편집" aria-label="편집">' +
                        '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="편집" class="action-icon">' +
                    '</button>' +
                    '<button class="action-btn danger js-lg-del" data-action="delete" type="button" title="삭제" aria-label="삭제">' +
                        '<img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">' +
                    '</button>' +
                '</td>'
            ].join('');
            return tr;
        }

        function syncEmptyState(hasRows) {
            try {
                const empty = document.getElementById('lg-empty');
                if (empty) {
                    empty.hidden = !!hasRows;
                    empty.style.display = hasRows ? 'none' : '';
                }
                const csvBtn = document.getElementById('lg-download-btn');
                if (csvBtn) {
                    csvBtn.disabled = !hasRows;
                    csvBtn.setAttribute('aria-disabled', (!hasRows).toString());
                    csvBtn.title = hasRows ? 'CSV 다운로드' : 'CSV 내보낼 항목이 없습니다.';
                }
            } catch (_) { /* no-op */ }
        }

        async function loadFromApi() {
            const entityKey = canonicalEntityKey();
            if (!entityKey) return;
            try {
                const data = await apiList(entityKey);
                const items = (data && data.items) ? data.items : [];
                const tbody = table.querySelector('tbody');
                if (!tbody) return;
                tbody.innerHTML = '';
                items.forEach((it) => tbody.appendChild(renderSavedRow(it)));
                syncEmptyState(items.length > 0);

                // Kick per-page pagination logic (inside detail.js closure)
                const pageSizeSel = document.getElementById('lg-page-size');
                if (pageSizeSel) {
                    try { pageSizeSel.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) { /* no-op */ }
                }
            } catch (err) {
                try { console.error('[tab14-log] load failed', err); } catch (_) { /* no-op */ }
            }
        }

        async function persistRow(tr) {
            const entityKey = canonicalEntityKey();
            if (!entityKey) return;

            const payload = {
                entity_key: entityKey,
                when: readCellValue(tr, 'when'),
                type: readCellValue(tr, 'type'),
                owner: readCellValue(tr, 'owner'),
                tab: readCellValue(tr, 'tab'),
            };
            const c = readContent(tr);
            payload.summary = c.summary;
            payload.detail = c.detail;

            const id = getRowId(tr);
            try {
                const saved = id ? await apiUpdate(id, payload) : await apiCreate(payload);
                if (saved && saved.id != null) setRowId(tr, saved.id);
            } catch (err) {
                try { console.error('[tab14-log] save failed', err); } catch (_) { /* no-op */ }
            }
        }

        // Intercept clicks for save/delete; let existing UI handlers run.
        document.addEventListener('click', (ev) => {
            const btn = ev.target && ev.target.closest ? ev.target.closest('.js-lg-toggle, .js-lg-del') : null;
            if (!btn) return;
            const tr = btn.closest('tr');
            if (!tr || !table.contains(tr)) return;

            // save (commit)
            if (btn.classList.contains('js-lg-toggle') && btn.getAttribute('data-action') === 'save') {
                setTimeout(() => { persistRow(tr); }, 0);
                return;
            }

            // delete (best-effort)
            if (btn.classList.contains('js-lg-del')) {
                const id = getRowId(tr);
                if (!id) return;
                setTimeout(() => {
                    apiDelete(id).catch((err) => {
                        try { console.error('[tab14-log] delete failed', err); } catch (_) { /* no-op */ }
                    });
                }, 0);
            }
        }, true);

        loadFromApi();
    } catch (_) {
        // no-op
    }
});

/* §7 ── List Empty-State UX ────────────────────────────────── */
// Common list UX: when the standard empty-state card is visible, hide the empty table
document.addEventListener('DOMContentLoaded', () => {
    try {
        const emptyEl = document.getElementById('system-empty');
        if (!emptyEl) return;

        const tableEl = document.getElementById('system-table');
        let tableContainer = null;
        try {
            if (tableEl && typeof tableEl.closest === 'function') {
                tableContainer = tableEl.closest('.system-table-container, .server-table-container');
            }
        } catch (_e) {
            tableContainer = null;
        }

        const isVisible = (el) => {
            if (!el) return false;
            if (el.hasAttribute('hidden')) return false;
            const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
            return !style || style.display !== 'none';
        };

        const sync = () => {
            const showEmpty = isVisible(emptyEl);
            if (tableEl) tableEl.hidden = showEmpty;
            if (tableContainer) tableContainer.hidden = showEmpty;
        };

        sync();

        const obs = new MutationObserver(() => sync());
        obs.observe(emptyEl, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
    } catch (_e) {
        // ignore
    }
});

/* §8 ── Add Modal Fallback ─────────────────────────────────── */
// Fallback: standard hardware list "Add" button should open the standard add modal.
// Some pages rely on per-page JS for this; if that script fails to bind, this keeps UX functional.
document.addEventListener('DOMContentLoaded', () => {
    try {
        const addBtn = document.getElementById('system-add-btn');
        const addModal = document.getElementById('system-add-modal');
        if (!addBtn || !addModal) return;

        const open = () => {
            document.body.classList.add('modal-open');
            addModal.classList.add('show');
            addModal.setAttribute('aria-hidden', 'false');
        };
        const close = () => {
            addModal.classList.remove('show');
            addModal.setAttribute('aria-hidden', 'true');
            // Only remove modal-open if no other standard modal is visible.
            if (!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show')) {
                document.body.classList.remove('modal-open');
            }
        };

        addBtn.addEventListener('click', (e) => {
            // If the page-specific handler already opened it, do nothing.
            if (addModal.classList.contains('show')) return;
            e.preventDefault();
            open();
        });

        const closeBtn = document.getElementById('system-add-close');
        if (closeBtn) closeBtn.addEventListener('click', (e) => { e.preventDefault(); close(); });

        // Backdrop click closes
        addModal.addEventListener('click', (e) => {
            if (e.target === addModal) close();
        });

        // ESC closes
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && addModal.classList.contains('show')) close();
        });
    } catch (_) {
        // no-op
    }
});

// Cost > OPEX/CAPEX detail pages: enable the existing "기본정보 수정" modal.
// (Templates include the modal DOM, but page-level JS is a placeholder.)
document.addEventListener('DOMContentLoaded', () => {
    try {
        const main = document.querySelector('main.main-content');
        const openBtn = document.getElementById('detail-edit-open');
        const modal = document.getElementById('system-edit-modal');
        const closeBtn = document.getElementById('system-edit-close');
        const saveBtn = document.getElementById('system-edit-save');
        const form = document.getElementById('system-edit-form');

        if (!main || !openBtn || !modal || !saveBtn || !form) return;

        const contractId = Number(main.dataset.contractId || '0');
        if (!Number.isFinite(contractId) || contractId <= 0) return;

        let apiBase = '/api/opex-contracts';

        const getText = (id) => {
            const el = document.getElementById(id);
            return el ? String(el.textContent || '').trim() : '';
        };
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = (value === null || value === undefined || String(value).trim() === '') ? '-' : String(value);
        };
        const setHTML = (id, html) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = html;
        };

        const keyFromPath = () => {
            try {
                const m = String(window.location.pathname || '').match(/^\/p\/([^\/]+)/);
                return (m && m[1]) ? String(m[1]) : '';
            } catch (_e) {
                return '';
            }
        };

        try {
            const curKey = keyFromPath();
            const isCapex = String(curKey || '').startsWith('cost_capex_');
            apiBase = isCapex ? '/api/capex-contracts' : '/api/opex-contracts';
        } catch (_e) {
            apiBase = '/api/opex-contracts';
        }

        const open = () => {
            document.body.classList.add('modal-open');
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
        };
        const close = () => {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
            if (!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show, .system-edit-modal.show, .system-add-modal.show, .system-message-modal.show')) {
                document.body.classList.remove('modal-open');
            }
        };

        const ensureMessageModal = () => {
            let msgModal = document.getElementById('system-message-modal');
            if (msgModal) return msgModal;

            try {
                const wrap = document.createElement('div');
                wrap.innerHTML = `
        <div id="system-message-modal" class="server-add-modal system-message-modal modal-overlay-full" aria-hidden="true">
            <div class="server-add-content">
                <div class="server-add-header">
                    <div class="server-add-title">
                        <h3 id="message-title">알림</h3>
                    </div>
                    <button class="close-btn" type="button" id="system-message-close" title="닫기">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                </div>
                <div class="server-add-body">
                    <div class="dispose-content">
                        <div class="dispose-text">
                            <p id="message-content">메시지 내용</p>
                        </div>
                        <div class="message-illust">
                            <img src="/static/image/svg/list/free-sticker-solution.svg" alt="Solution Illustration" loading="lazy" />
                        </div>
                    </div>
                </div>
                <div class="server-add-actions align-right">
                    <div class="action-buttons right">
                        <button type="button" class="btn-primary" id="system-message-ok">확인</button>
                    </div>
                </div>
            </div>
        </div>`;
                const el = wrap.firstElementChild;
                if (el) document.body.appendChild(el);
                msgModal = document.getElementById('system-message-modal');
            } catch (_e) {
                // ignore
            }

            return msgModal;
        };

        const showMessageModal = (message, title) => {
            const msgModal = ensureMessageModal();
            if (!msgModal) {
                try { showToast(String(message || ''), 'success'); return; } catch (_e) {}
                try { alert(String(message || '')); } catch (_e) {}
                return;
            }

            const titleEl = document.getElementById('message-title');
            const contentEl = document.getElementById('message-content');
            if (titleEl) titleEl.textContent = String(title || '알림');
            if (contentEl) contentEl.textContent = String(message || '');

            const openMsg = () => {
                document.body.classList.add('modal-open');
                msgModal.classList.add('show');
                msgModal.setAttribute('aria-hidden', 'false');
            };
            const closeMsg = () => {
                msgModal.classList.remove('show');
                msgModal.setAttribute('aria-hidden', 'true');
                if (!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show, .system-edit-modal.show, .system-add-modal.show, .system-message-modal.show')) {
                    document.body.classList.remove('modal-open');
                }
            };

            // bind once
            try {
                if (msgModal.dataset && msgModal.dataset.bound !== '1') {
                    msgModal.dataset.bound = '1';
                    const closeBtn2 = document.getElementById('system-message-close');
                    const okBtn = document.getElementById('system-message-ok');
                    if (closeBtn2) closeBtn2.addEventListener('click', (e) => { e.preventDefault(); closeMsg(); });
                    if (okBtn) okBtn.addEventListener('click', (e) => { e.preventDefault(); closeMsg(); });
                    msgModal.addEventListener('click', (e) => { if (e.target === msgModal) closeMsg(); });
                    document.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape' && msgModal.classList.contains('show')) closeMsg();
                    });
                }
            } catch (_e) {
                // ignore
            }

            openMsg();
        };

        const buildInspectionBadge = (flagText) => {
            const normalized = (String(flagText || '').trim().toUpperCase() === 'O') ? 'O' : 'X';
            const cls = normalized === 'O' ? 'on' : 'off';
            return `<span class="cell-ox with-badge"><span class="ox-badge ${cls}">${normalized}</span></span>`;
        };

        let __managerUsersCache = null;
        const loadManagerOptions = async (selectEl) => {
            if (!selectEl) return;
            try {
                if (!__managerUsersCache) {
                    const r = await fetch('/api/user-profiles?limit=2000', {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' },
                        credentials: 'same-origin',
                    });
                    const j = await r.json().catch(() => null);
                    __managerUsersCache = (j && j.success && Array.isArray(j.items)) ? j.items : [];
                }
                const cur = selectEl.value;
                while (selectEl.options.length > 1) selectEl.remove(1);
                __managerUsersCache.forEach((u) => {
                    const name = String(u.name || '').trim();
                    if (!name) return;
                    const dept = String(u.department || '').trim();
                    const label = dept ? (name + ' (' + dept + ')') : name;
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = label;
                    selectEl.appendChild(opt);
                });
                if (cur) selectEl.value = cur;
            } catch (_e) {
                // ignore
            }
        };

        const ensureVendorMaintenanceSource = () => {
            try {
                window.BlossomSearchableSelectSources = window.BlossomSearchableSelectSources || {};
                const reg = window.BlossomSearchableSelectSources;
                if (typeof reg.vendorMaintenance === 'function') return;
                reg.vendorMaintenance = async function (ctx) {
                    const q = (ctx && ctx.query != null) ? String(ctx.query).trim() : '';
                    const url = q ? (`/api/vendor-maintenance?q=${encodeURIComponent(q)}`) : '/api/vendor-maintenance';
                    const r = await fetch(url, {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' },
                        credentials: 'same-origin',
                    });
                    const j = await r.json().catch(() => null);
                    const rows = (j && j.success && Array.isArray(j.items)) ? j.items : [];
                    const items = rows.slice(0, 200).map((it) => {
                        const id = (it && it.id != null) ? String(it.id) : '';
                        const name = (it && (it.maintenance_name || it.vendor || it.name)) ? String(it.maintenance_name || it.vendor || it.name) : '';
                        const code = (it && (it.maintenance_code || it.code)) ? String(it.maintenance_code || it.code) : '';
                        const label = name || code || id;
                        const searchText = [name, code].filter(Boolean).join(' ');
                        return { value: id, label, searchText };
                    }).filter((it) => it && it.value);
                    if (!items.length) {
                        return { items: [], emptyMessage: '검색 결과가 없습니다.' };
                    }
                    return items;
                };
            } catch (_e) {
                // ignore
            }
        };

        const syncSearchableSelects = (scopeEl) => {
            try {
                if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') {
                    window.BlossomSearchableSelect.syncAll(scopeEl || document);
                }
            } catch (_e) {
                // ignore
            }
        };

        const ensureSelectOption = (selectEl, value, label) => {
            if (!selectEl || !value) return;
            const v = String(value);
            const text = String(label || value);
            try {
                const exists = Array.from(selectEl.options || []).some((o) => String(o.value || '') === v);
                if (exists) return;
                const opt = document.createElement('option');
                opt.value = v;
                opt.textContent = text;
                selectEl.appendChild(opt);
            } catch (_e) {
                // ignore
            }
        };

        const escapeHtml = (value) => {
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        };

        const buildStatusPill = (statusText) => {
            const status = String(statusText || '-').trim() || '-';
            let cls = 'ws-wait';
            if (status === '진행') cls = 'ws-run';
            else if (status === '해지') cls = 'ws-stop';
            return `<span class="status-pill"><span class="status-dot ${cls}"></span><span class="status-text">${escapeHtml(status)}</span></span>`;
        };

        const prefill = () => {
            const status = getText('cd-contract_status');
            const name = getText('cd-contract_name');
            const manageNo = getText('cd-manage_no');
            const vendorName = getText('cd-maint_vendor');
            const maintStart = getText('cd-maint_start');
            const maintEnd = getText('cd-maint_end');
            const maintAmount = getText('cd-maint_amount');
            const inspection = getText('cd-inspection_target');
            const memo = getText('cd-memo');

            const setField = (nameAttr, value) => {
                const field = form.querySelector(`[name="${nameAttr}"]`);
                if (!field) return;
                if (field.tagName === 'SELECT') {
                    field.value = value || '';
                } else {
                    field.value = value || '';
                }
            };

            setField('contract_status', status === '-' ? '' : status);
            setField('contract_name', name === '-' ? '' : name);
            setField('manage_no', manageNo === '-' ? '' : manageNo);

            const vendorIdFromPage = (main.dataset.vendorId || '').trim();
            const vendorIdFromSelect = (() => {
                const sel = form.querySelector('select[name="vendor_id"]');
                return sel ? String(sel.value || '').trim() : '';
            })();
            const vendorId = vendorIdFromPage || vendorIdFromSelect;
            const vendorLabel = (vendorName === '-' ? '' : vendorName);
            const vendorSelect = form.querySelector('select[name="vendor_id"]');
            if (vendorSelect && vendorId) {
                ensureSelectOption(vendorSelect, vendorId, vendorLabel || vendorId);
                vendorSelect.value = String(vendorId);
            }

            const maintQtyTotal = getText('cd-maint_qty_total');
            const maintQtyActive = getText('cd-maint_qty_active');
            setField('maint_qty_total', maintQtyTotal === '-' ? '' : maintQtyTotal);
            setField('maint_qty_active', maintQtyActive === '-' ? '' : maintQtyActive);
            // qty fields are computed from tab61 (계약정보) – make them read-only.
            const qtyTotalInput = form.querySelector('[name="maint_qty_total"]');
            const qtyActiveInput = form.querySelector('[name="maint_qty_active"]');
            if (qtyTotalInput) qtyTotalInput.disabled = true;
            if (qtyActiveInput) qtyActiveInput.disabled = true;

            setField('maint_start', maintStart === '-' ? '' : maintStart);
            setField('maint_end', maintEnd === '-' ? '' : maintEnd);

            const amtField = form.querySelector('[name="maint_amount"]');
            if (amtField) {
                amtField.value = (maintAmount === '-' ? '' : maintAmount);
                amtField.disabled = true;
            }

            setField('inspection_target', (String(inspection || '').toUpperCase().includes('O') ? 'O' : (String(inspection || '').toUpperCase().includes('X') ? 'X' : '')));
            const memoField = form.querySelector('[name="memo"]');
            if (memoField) memoField.value = (memo === '-' ? '' : memo);

            // 유지보수 담당자 prefill
            const maintManagerVal = getText('cd-maint_manager');
            const managerSelect = form.querySelector('select[name="maint_manager"]');
            if (managerSelect) {
                loadManagerOptions(managerSelect).then(() => {
                    const v = (maintManagerVal === '-' ? '' : (maintManagerVal || ''));
                    if (v) {
                        ensureSelectOption(managerSelect, v, v);
                        managerSelect.value = v;
                    }
                    syncSearchableSelects(modal);
                });
            }

            ensureVendorMaintenanceSource();
            syncSearchableSelects(modal);
        };

        // Flatpickr (calendar) for modal date inputs: match list page experience.
        const FLATPICKR_CSS = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
        const FLATPICKR_THEME_HREF = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/airbnb.css';
        const FLATPICKR_JS = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.js';
        const FLATPICKR_LOCALE = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/ko.js';
        let __opexFpPromise = null;

        function ensureCss(href, id){
            try{
                if(id && document.getElementById(id)) return;
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = href;
                if(id) link.id = id;
                document.head.appendChild(link);
            }catch(_e){ /* ignore */ }
        }
        function loadScript(src){
            return new Promise((resolve, reject) => {
                try{
                    const s = document.createElement('script');
                    s.src = src;
                    s.async = true;
                    s.onload = () => resolve(true);
                    s.onerror = () => reject(new Error('FAILED ' + src));
                    document.head.appendChild(s);
                }catch(e){ reject(e); }
            });
        }
        async function ensureFlatpickrAssets(){
            ensureCss(FLATPICKR_CSS, 'flatpickr-css');
            ensureCss(FLATPICKR_THEME_HREF, 'flatpickr-theme-css');
            if(window.flatpickr) return;
            if(__opexFpPromise) return __opexFpPromise;
            __opexFpPromise = loadScript(FLATPICKR_JS)
              .then(() => loadScript(FLATPICKR_LOCALE).catch(() => null))
              .catch((e) => { __opexFpPromise = null; throw e; });
            return __opexFpPromise;
        }

        function addTodayButton(cal){
            try{
                if(!cal || cal.querySelector('.fp-today-btn')) return;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'fp-today-btn';
                btn.textContent = '오늘';
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    try{
                        const inst = cal._flatpickr || (cal.parentNode && cal.parentNode._flatpickr) || null;
                        if(inst){ inst.setDate(new Date(), true); }
                    }catch(_){ }
                });
                cal.appendChild(btn);
            }catch(_e){ }
        }

        async function initModalFlatpickr(){
            const startInput = form.querySelector('input[name="maint_start"]');
            const endInput = form.querySelector('input[name="maint_end"]');
            if(!startInput || !endInput) return;
            await ensureFlatpickrAssets();
            if(!window.flatpickr) return;
            try{
                if(window.flatpickr.l10ns && window.flatpickr.l10ns.ko){
                    window.flatpickr.localize(window.flatpickr.l10ns.ko);
                }
            }catch(_e){ }

            // Flatpickr prefers text input.
            try{ startInput.type = 'text'; endInput.type = 'text'; }catch(_e){ }

            const afterReady = (_selectedDates, _dateStr, instance) => {
                try{
                    const cal = instance && instance.calendarContainer;
                    if(cal){
                        cal.classList.add('blossom-date-popup');
                        cal._flatpickr = instance;
                        addTodayButton(cal);
                    }
                }catch(_e){ }
            };

            if(!startInput._flatpickr){
                window.flatpickr(startInput, {
                    dateFormat: 'Y-m-d',
                    allowInput: true,
                    onReady: afterReady,
                    onChange: (_d, v) => {
                        try{ if(endInput._flatpickr) endInput._flatpickr.set('minDate', v || null); }catch(_e){ }
                    },
                });
            }
            if(!endInput._flatpickr){
                window.flatpickr(endInput, {
                    dateFormat: 'Y-m-d',
                    allowInput: true,
                    onReady: afterReady,
                    onChange: (_d, v) => {
                        try{ if(startInput._flatpickr) startInput._flatpickr.set('maxDate', v || null); }catch(_e){ }
                    },
                });
            }
        }

        async function setCostDetailContextIfNeeded(newManageNo) {
            const curKey2 = keyFromPath();
            if (!curKey2) return;
            const r = await fetch('/api/cost/detail-context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ key: curKey2, manage_no: String(newManageNo || '').trim() }),
                credentials: 'same-origin',
            });
            const j = await r.json().catch(() => null);
            if (!r.ok || !j || !j.success) {
                throw new Error((j && j.message) ? j.message : ('HTTP ' + r.status));
            }
        }

        async function save() {
            const fd = new FormData(form);
            const contract_status = String(fd.get('contract_status') || '').trim();
            const contract_name = String(fd.get('contract_name') || '').trim();
            const manage_no = String(fd.get('manage_no') || '').trim();
            const maint_start = String(fd.get('maint_start') || '').trim();
            const maint_end = String(fd.get('maint_end') || '').trim();
            const memo = String(fd.get('memo') || '').trim();
            const inspection_raw = String(fd.get('inspection_target') || '').trim().toUpperCase();
            const inspection_target = inspection_raw === 'O';

            const maint_manager = String(fd.get('maint_manager') || '').trim();

            const vendorIdRaw = String(fd.get('vendor_id') || '').trim();
            let vendor_id = null;
            if (vendorIdRaw) {
                const parsed = Number(vendorIdRaw);
                if (Number.isFinite(parsed) && parsed > 0) vendor_id = parsed;
            }

            // qty fields are computed from tab61 – do NOT include in PUT payload.

            const payload = {
                contract_status,
                contract_name,
                manage_no,
                maint_start,
                maint_end,
                memo,
                inspection_target,
                maint_manager,
            };

            if (vendor_id !== null) {
                payload.vendor_id = vendor_id;
            }

            saveBtn.disabled = true;
            try {
                const r = await fetch(`${apiBase}/${contractId}` , {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify(payload),
                    credentials: 'same-origin',
                });
                const j = await r.json().catch(() => null);
                if (!r.ok || !j || !j.success) {
                    throw new Error((j && j.message) ? j.message : ('HTTP ' + r.status));
                }

                const item = j.item || {};
                const newManageNo = String(item.manage_no || manage_no || '').trim();

                const statusEl = document.getElementById('cd-contract_status');
                if (statusEl && statusEl.querySelector && statusEl.querySelector('.status-pill')) {
                    setHTML('cd-contract_status', buildStatusPill(item.contract_status || contract_status));
                } else {
                    setText('cd-contract_status', item.contract_status || contract_status);
                }
                setText('cd-contract_name', item.contract_name || contract_name);
                setText('cd-manage_no', newManageNo);
                const savedQtyTotal = (item.maint_qty_total != null) ? item.maint_qty_total : maint_qty_total;
                const savedQtyActive = (item.maint_qty_active != null) ? item.maint_qty_active : maint_qty_active;
                setText('cd-maint_qty_total', savedQtyTotal != null ? String(savedQtyTotal) : '-');
                setText('cd-maint_qty_active', savedQtyActive != null ? String(savedQtyActive) : '-');
                setText('cd-maint_start', item.maint_start || maint_start);
                setText('cd-maint_end', item.maint_end || maint_end);

                const inspEl = document.getElementById('cd-inspection_target');
                const inspText = (item.inspection_target ? 'O' : 'X');
                if (inspEl && inspEl.querySelector && inspEl.querySelector('.ox-badge')) {
                    setHTML('cd-inspection_target', buildInspectionBadge(inspText));
                } else {
                    setText('cd-inspection_target', inspText);
                }
                setText('cd-memo', item.memo || memo);
                setText('cd-maint_manager', item.maint_manager || maint_manager || '-');

                const vendorText = String(item.maint_vendor || item.vendor_name || '').trim();
                if (vendorText) {
                    setText('cd-maint_vendor', vendorText);
                } else if (vendor_id !== null) {
                    try {
                        const sel = form.querySelector('select[name="vendor_id"]');
                        const opt = sel && sel.selectedOptions && sel.selectedOptions[0];
                        const t = opt ? String(opt.textContent || '').trim() : '';
                        if (t) setText('cd-maint_vendor', t);
                    } catch (_e) {
                        // ignore
                    }
                }

                if (vendor_id !== null) {
                    try { main.dataset.vendorId = String(vendor_id); } catch (_e) {}
                }

                const titleEl = document.getElementById('page-header-title');
                if (titleEl && (item.contract_name || contract_name)) {
                    titleEl.textContent = String(item.contract_name || contract_name);
                }

                // Keep session detail context aligned if manage_no changed.
                const oldManageNo = String(main.dataset.manageNo || '').trim();
                if (newManageNo && newManageNo !== oldManageNo) {
                    try {
                        await setCostDetailContextIfNeeded(newManageNo);
                        main.dataset.manageNo = newManageNo;
                    } catch (e) {
                        // Context update failure shouldn't block saving.
                        console.warn('Failed to update cost detail context', e);
                    }
                }

                close();
                showMessageModal('정상적으로 저장되었습니다.', '완료');
            } catch (err) {
                showMessageModal((err && err.message ? err.message : '저장 중 오류가 발생했습니다.'), '알림');
            } finally {
                saveBtn.disabled = false;
            }
        }

        openBtn.addEventListener('click', (e) => {
            e.preventDefault();
            prefill();
            open();
            initModalFlatpickr().catch(() => null);
        });
        if (closeBtn) closeBtn.addEventListener('click', (e) => { e.preventDefault(); close(); });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('show')) close();
        });
        saveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            save();
        });
    } catch (_e) {
        // no-op
    }
});

// Prevent browser form-history dropdowns (autocomplete) inside standard modals.
// Note: browsers may not honor autocomplete=off in all cases, but this reduces it significantly.
document.addEventListener('DOMContentLoaded', () => {
    try {
        const MODAL_SELECTOR = '.server-add-modal, .server-edit-modal, .system-add-modal, .system-edit-modal';
        const CONTROL_SELECTOR = 'input, textarea, select';

        const shouldSkipInputType = (type) => {
            const t = (type || 'text').toLowerCase();
            return ['hidden', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file'].includes(t);
        };

        const applyToRoot = (root) => {
            const scope = root && root.querySelectorAll ? root : document;

            // Ensure form-level autocomplete is disabled
            scope.querySelectorAll(`${MODAL_SELECTOR} form`).forEach((formEl) => {
                formEl.setAttribute('autocomplete', 'off');
            });

            // Ensure control-level attributes are disabled
            scope.querySelectorAll(`${MODAL_SELECTOR} ${CONTROL_SELECTOR}`).forEach((el) => {
                if (el.tagName === 'INPUT' && shouldSkipInputType(el.getAttribute('type'))) return;
                el.setAttribute('autocomplete', 'off');
                el.setAttribute('autocapitalize', 'off');
                el.setAttribute('autocorrect', 'off');
                el.setAttribute('spellcheck', 'false');
            });
        };

        applyToRoot(document);

        // Handle dynamically injected modal forms/inputs (common for edit modals)
        if (document.body && window.MutationObserver) {
            const obs = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    for (const node of m.addedNodes || []) {
                        if (!node || node.nodeType !== 1) continue;
                        const el = node;
                        const hasMatches = !!(el && typeof el.matches === 'function' && el.matches(MODAL_SELECTOR));
                        const hasModal = !!(el && typeof el.querySelector === 'function' && el.querySelector(MODAL_SELECTOR));
                        if (hasMatches || hasModal) {
                            applyToRoot(el);
                        }
                    }
                }
            });
            obs.observe(document.body, { childList: true, subtree: true });
        }
    } catch (_) {
        // no-op
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.querySelector('.signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            const empNo = signupForm.emp_no.value.trim();
            const password = signupForm.password.value.trim();
            const confirmPassword = signupForm.confirm_password.value.trim();

            if (!empNo || !password) {
                e.preventDefault();
                alert('사번과 비밀번호는 필수입니다.');
                return;
            }
            
            if (password.length < 6) {
                e.preventDefault();
                alert('비밀번호는 6자 이상이어야 합니다.');
                return;
            }
            
            if (password !== confirmPassword) {
                e.preventDefault();
                alert('비밀번호가 일치하지 않습니다.');
                return;
            }
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const resetForm = document.querySelector('form[action="/reset-password"]');
    if (resetForm) {
        resetForm.addEventListener('submit', (e) => {
            const empNo = resetForm.emp_no.value.trim();
            const email = resetForm.email.value.trim();

            if (!empNo || !email) {
                e.preventDefault();
                alert('사번과 이메일을 모두 입력해주세요.');
            }
        });
    }
});

/* §9 ── Sidebar / Header ───────────────────────────────────── */
/* header */
document.addEventListener('DOMContentLoaded', () => {
    // 사이드바 3단계 토글 버튼 (확장 → 미니 → 숨김 → 확장)
    const sidebarBtn = document.getElementById('btn-sidebar');
    const sidebar = document.getElementById('sidebar');
    // NOTE: mainContent를 매번 querySelector로 조회해야 SPA partial navigation 후에도 동작
    function getMain() { return document.querySelector('.main-content'); }
    
    if (sidebarBtn && sidebar) {
        // 저장된 사이드바 상태 복원
        const savedState = localStorage.getItem('sidebarState');
        if (savedState) {
            var mc = getMain();
            var root = document.documentElement;
            // apply silently on initial load
            sidebar.classList.add('silent');
            if (mc) mc.classList.add('silent');
            if (savedState === 'collapsed') {
                sidebar.classList.add('collapsed');
                if (mc) mc.classList.add('sidebar-collapsed');
                root.classList.add('sidebar-collapsed');
                root.classList.remove('sidebar-hidden');
            } else if (savedState === 'hidden') {
                sidebar.classList.add('hidden');
                if (mc) mc.classList.add('sidebar-hidden');
                root.classList.add('sidebar-hidden');
                root.classList.remove('sidebar-collapsed');
            } else {
                sidebar.classList.remove('collapsed', 'hidden');
                if (mc) mc.classList.remove('sidebar-collapsed', 'sidebar-hidden');
                root.classList.remove('sidebar-collapsed', 'sidebar-hidden');
            }
            // force reflow then remove silent to keep future transitions
            requestAnimationFrame(() => {
                sidebar.classList.remove('silent');
                var mc2 = getMain();
                if (mc2) mc2.classList.remove('silent');
            });
        }
        
        // 기존 이벤트 리스너 제거 (중복 방지)
        sidebarBtn.removeEventListener('click', handleSidebarToggle);
        
        // 새로운 이벤트 리스너 추가
        sidebarBtn.addEventListener('click', handleSidebarToggle);
        
        // 사이드바 토글 핸들러 함수
        function handleSidebarToggle(e) {
            e.preventDefault();
            e.stopPropagation();
            
            // 매 클릭마다 현재 DOM의 main-content를 새로 조회 (SPA 교체 대응)
            var mainContent = getMain();
            var root = document.documentElement;
            
            // 현재 상태 확인
            const isHidden = sidebar.classList.contains('hidden');
            const isCollapsed = sidebar.classList.contains('collapsed');
            
            // 3단계 순환: 확장 → 미니 → 숨김 → 확장
            if (isHidden) {
                // 숨김 → 확장 (3번째 클릭) - 기본 상태로 돌아가기
                sidebar.classList.remove('hidden');
                sidebar.classList.remove('collapsed');
                if (mainContent) {
                    mainContent.classList.remove('sidebar-collapsed');
                    mainContent.classList.remove('sidebar-hidden');
                }
                root.classList.remove('sidebar-collapsed', 'sidebar-hidden');
                localStorage.setItem('sidebarState', 'expanded');
            } else if (isCollapsed) {
                // 미니 → 숨김 (2번째 클릭)
                // apply silently for hide
                sidebar.classList.add('silent');
                if (mainContent) mainContent.classList.add('silent');
                sidebar.classList.remove('collapsed');
                sidebar.classList.add('hidden');
                if (mainContent) {
                    mainContent.classList.remove('sidebar-collapsed');
                    mainContent.classList.add('sidebar-hidden');
                }
                root.classList.remove('sidebar-collapsed');
                root.classList.add('sidebar-hidden');
                requestAnimationFrame(() => {
                    sidebar.classList.remove('silent');
                    var mc3 = getMain();
                    if (mc3) mc3.classList.remove('silent');
                });
                localStorage.setItem('sidebarState', 'hidden');
            } else {
                // 확장 → 미니 (1번째 클릭) - 기본 상태에서 미니로
                // apply silently for collapse
                sidebar.classList.add('silent');
                if (mainContent) mainContent.classList.add('silent');
                sidebar.classList.add('collapsed');
                sidebar.classList.remove('hidden');
                if (mainContent) {
                    mainContent.classList.add('sidebar-collapsed');
                    mainContent.classList.remove('sidebar-hidden');
                }
                root.classList.add('sidebar-collapsed');
                root.classList.remove('sidebar-hidden');
                requestAnimationFrame(() => {
                    sidebar.classList.remove('silent');
                    var mc4 = getMain();
                    if (mc4) mc4.classList.remove('silent');
                });
                localStorage.setItem('sidebarState', 'collapsed');
            }
        }
    }

    // 작업 타임라인: 팝업 창으로 열기
    const timelineBtn = document.getElementById('btn-work-timeline');
    if (timelineBtn) {
        timelineBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const url = timelineBtn.getAttribute('data-href') || '/addon/work-timeline';
            const w = Math.min(1400, Math.round(screen.width * 0.85));
            const h = Math.min(900, Math.round(screen.height * 0.8));
            const left = Math.round((screen.width - w) / 2);
            const top = Math.round((screen.height - h) / 2);
            window.open(url, 'workTimeline', `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=no,menubar=no,status=no`);
        });
    }

    // 검색 버튼: 모달 비활성화, 기본 이동만 허용
    const searchBtn = document.getElementById('btn-search');
    if (searchBtn) {
        searchBtn.addEventListener('click', (e) => {
            // 검색 기능은 아직 SPA 전용 라우트가 없으므로 현재 동작 유지
            e.preventDefault();
        });
    }

    // 알림 버튼: 알림 페이지로 SPA 이동
    const notificationsBtn = document.getElementById('btn-notifications');
    if (notificationsBtn) {
        notificationsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.blsSpaNavigate === 'function') {
                window.blsSpaNavigate('/addon/notifications');
            } else {
                window.location.href = '/addon/notifications';
            }
        });
    }

    // 채팅 버튼: 채팅 페이지로 SPA 이동
    const chatBtn = document.getElementById('btn-chat');
    if (chatBtn) {
        chatBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.blsSpaNavigate === 'function') {
                window.blsSpaNavigate('/addon/chat');
            } else {
                window.location.href = '/addon/chat';
            }
        });
    }

    // 설정 버튼: 즉시 이동
    const settingsBtn = document.getElementById('btn-settings');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            const targetHref = '/settings/profile';
            e.preventDefault();
            if (typeof window.blsSpaNavigate === 'function') {
                window.blsSpaNavigate(targetHref);
            } else {
                window.location.href = targetHref;
            }
        });
    }

    // 전체화면 토글 (F11 유사 동작)
    const fullscreenBtn = document.getElementById('btn-fullscreen');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            toggleFullscreen();
        });
    }

    // 계정 버튼
    const accountBtn = document.getElementById('btn-account');
    if (accountBtn) {
        accountBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // 토글: 이미 열려 있으면 닫기
            const existing = accountBtn.querySelector('.account-dropdown');
            if (existing) {
                existing.remove();
                return;
            }

            // 새 드롭다운 생성
            const dropdown = document.createElement('div');
            dropdown.className = 'account-dropdown';
            dropdown.innerHTML = `
                <div class="dropdown-item" data-action="profile">프로필</div>
                <div class="dropdown-item" data-action="logout">로그아웃</div>
            `;

            // 기존 드롭다운 제거 후 추가
            const prev = document.querySelector('.account-dropdown');
            if (prev) prev.remove();
            accountBtn.appendChild(dropdown);

            // 항목 클릭 동작
            dropdown.addEventListener('click', (ev) => {
                ev.stopPropagation();
                let action = null;
                try {
                    const item = ev && ev.target && ev.target.closest ? ev.target.closest('.dropdown-item') : null;
                    action = item && item.dataset ? item.dataset.action : null;
                } catch (_e) {
                    action = null;
                }
                if (!action) return;
                if (action === 'profile') {
                    // 설정(프로필) UI로 SPA 이동
                    if (typeof window.blsSpaNavigate === 'function') {
                        window.blsSpaNavigate('/settings/profile');
                    } else {
                        window.location.href = '/settings/profile';
                    }
                } else if (action === 'logout') {
                    window.location.href = '/logout';
                }
                dropdown.remove();
                document.removeEventListener('click', closeOnOutside);
            });

            // 바깥 클릭 시 닫기 (한 번만 바인딩)
            function closeOnOutside(evt) {
                if (!accountBtn.contains(evt.target)) {
                    dropdown.remove();
                    document.removeEventListener('click', closeOnOutside);
                }
            }
            document.addEventListener('click', closeOnOutside);
        });
    }
    // 아바타 동기화: 단일 키로 저장/복원하고 헤더/프로필 모두 반영
    (function syncAvatarOnLoad(){
        const LS_GLOBAL_IMG = 'blossom.profileImageSrc';
        const LS_EMP = 'blossom.currentEmpNo';

        // 사용자별(사번별)로 아바타를 저장해야 다른 계정/데모 사용자로
        // 접속했을 때 헤더 아이콘이 바뀌는 문제가 발생하지 않는다.
        let empNo = '';
        try {
            const btn = document.querySelector('#btn-account');
            empNo = (btn && typeof btn.getAttribute === 'function' ? (btn.getAttribute('data-emp-no') || '') : '');
            empNo = String(empNo || '').trim();
        } catch (_e) {
            empNo = '';
        }
        if (!empNo) {
            // emp_no가 없으면(비로그인/데모/서버 템플릿 미주입) localStorage로
            // 헤더 아바타를 덮어쓰지 않는다. (절대 변경되면 안 됨)
            return;
        }

        const LS_IMG = `blossom.profileImageSrc.${empNo}`;

        // 현재 헤더의 사용자 emp_no 저장 (서버 템플릿에서 주입된 경우)
        try { localStorage.setItem(LS_EMP, empNo); } catch (_e) {}

        // 이전 키에서 마이그레이션 (존재 시 1회 이전)
        try {
            const legacy = localStorage.getItem('headerAvatarSrc');
            const hasNew = localStorage.getItem(LS_IMG);
            if (legacy && !hasNew) {
                // legacy는 사용자 식별이 없어서, 현재 사용자(empNo)에만 귀속
                localStorage.setItem(LS_IMG, legacy);
                localStorage.removeItem('headerAvatarSrc');
            }
        } catch (_e) {}

        function applyAvatar(src){
            if (!src) return;
            // 헤더 이미지: 기본 우선(.header-avatar-icon), 없으면 #btn-account 내 img로 대체
            let headerImg = document.querySelector('#btn-account .header-avatar-icon');
            if (!headerImg) headerImg = document.querySelector('#btn-account img');
            if (headerImg) {
                headerImg.src = src;
                headerImg.classList.add('header-avatar-icon');
            }
            // 프로필 페이지 아바타 배경
            const profileAvatar = document.querySelector('.admin-page .avatar');
            if (profileAvatar) {
                profileAvatar.style.backgroundImage = `url('${src}')`;
            }
        }

        try {
            const saved = localStorage.getItem(LS_IMG);

            // 과거 코드/다른 스크립트가 전역 키(LS_GLOBAL_IMG)에 저장한 값을
            // 현재 사용자로 귀속(단, 마지막 emp_no가 현재와 같을 때만)
            if (!saved) {
                const lastEmp = localStorage.getItem(LS_EMP);
                const globalSaved = localStorage.getItem(LS_GLOBAL_IMG);
                if (globalSaved && lastEmp && lastEmp === empNo) {
                    try { localStorage.setItem(LS_IMG, globalSaved); } catch (_e) {}
                }
            }

            const resolved = localStorage.getItem(LS_IMG);
            if (resolved) {
                applyAvatar(resolved);
                return;
            }

            // 초기 로드 시 localStorage 값이 없으면 헤더 템플릿 이미지를 사용해 동기화
            let headerImg = document.querySelector('#btn-account .header-avatar-icon');
            if (!headerImg) headerImg = document.querySelector('#btn-account img');
            const templateSrc = headerImg ? headerImg.getAttribute('src') : null;
            const debugAttr = headerImg ? headerImg.getAttribute('data-debug-avatar') : null;
            const fallbackSrc = debugAttr || templateSrc;
            if (fallbackSrc) {
                try { localStorage.setItem(LS_IMG, fallbackSrc); } catch (_e) {}
                applyAvatar(fallbackSrc);
            }
        } catch (_e) {}

        // 다른 탭/페이지에서 변경 시 실시간 반영
        window.addEventListener('storage', (e) => {
            if (e && e.key === LS_IMG) {
                applyAvatar(e.newValue);
            }
        });

        // 외부에서 아바타 변경을 요청하는 커스텀 이벤트
        window.addEventListener('blossom:avatarChanged', (e) => {
            let src = null;
            let emp = null;
            try {
                src = e && e.detail ? e.detail.src : null;
                emp = e && e.detail ? e.detail.empNo : null;
            } catch (_e) {
                src = null;
                emp = null;
            }
            const currentEmp = empNo;
            if (!src) return;
            // empNo 없으면 무조건 갱신, 있으면 현재 사용자일 때만 갱신
            if (!emp || !currentEmp || emp === currentEmp) {
                try {
                    localStorage.setItem(LS_IMG, src);
                    // 호환을 위해 전역 키도 갱신(단, 현재 사용자에 한함)
                    localStorage.setItem(LS_GLOBAL_IMG, src);
                } catch (_e) {}
                applyAvatar(src);
            }
        });
    })();
});

/* §10 ── Toast ─────────────────────────────────────────────── */
// 토스트 메시지 함수
// anchor: 선택적 DOM 요소 – 전달 시 해당 요소를 기준으로 카드 우하단에 표시
function showToast(message, type = 'info', anchor) {
    try {
        document.querySelectorAll('.blossom-toast').forEach(el => el.remove());
    } catch (_e) {}

    const icons = {
        success: '<svg width="16" height="16" viewBox="0 0 20 20" style="flex-shrink:0"><rect x="1" y="1" width="18" height="18" rx="3" fill="#16a34a"/><polyline points="5 10 8.5 13.5 15 7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        error:   '<svg width="16" height="16" viewBox="0 0 20 20" style="flex-shrink:0"><circle cx="10" cy="10" r="9" fill="#dc2626"/><line x1="13" y1="7" x2="7" y2="13" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="7" y1="7" x2="13" y2="13" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
        info:    '<svg width="16" height="16" viewBox="0 0 20 20" style="flex-shrink:0"><circle cx="10" cy="10" r="9" fill="#2563eb"/><line x1="10" y1="14" x2="10" y2="10" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="7" r="1" fill="#fff"/></svg>',
    };
    const textColors = { success: '#16a34a', error: '#dc2626', info: '#2563eb' };

    const toast = document.createElement('div');
    toast.className = 'blossom-toast';
    toast.innerHTML = (icons[type] || icons.info) + ' ' + message;

    /* ── anchor가 있으면 해당 카드 안에 상대 배치 ── */
    const card = anchor instanceof HTMLElement
        ? (anchor.closest('.setting-card') || anchor.closest('section') || anchor.closest('form') || anchor)
        : null;

    if (card) {
        /* 카드 내부 우하단에 배치 */
        const prev = card.style.position;
        if (!prev || prev === 'static') card.style.position = 'relative';
        Object.assign(toast.style, {
            position:   'absolute',
            bottom:     '12px',
            right:      '16px',
            zIndex:     '10',
            display:    'inline-flex',
            alignItems: 'center',
            gap:        '7px',
            padding:    '0',
            background: 'transparent',
            border:     'none',
            fontSize:   '13px',
            fontWeight: '400',
            color:      textColors[type] || textColors.info,
            opacity:    '0',
            transition: 'opacity .3s ease',
            pointerEvents: 'none',
        });
        card.appendChild(toast);
    } else {
        /* 글로벌 fallback: 화면 우하단 */
        Object.assign(toast.style, {
            position:      'fixed',
            bottom:        '28px',
            right:         '32px',
            zIndex:        '99999',
            display:       'inline-flex',
            alignItems:    'center',
            gap:           '7px',
            padding:       '0',
            background:    'transparent',
            border:        'none',
            fontSize:      '13px',
            fontWeight:    '400',
            color:         textColors[type] || textColors.info,
            opacity:       '0',
            transition:    'opacity .3s ease',
            pointerEvents: 'none',
        });
        document.body.appendChild(toast);
    }
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 350);
    }, 3500);
}

/* §11 ── Fullscreen ────────────────────────────────────────── */
// 전체화면 토글 함수 (F11 유사)
function toggleFullscreen() {
    const doc = window.document;
    const docEl = doc.documentElement;

    const requestFullScreen = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
    const cancelFullScreen = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

    if (!doc.fullscreenElement && !doc.mozFullScreenElement && !doc.webkitFullscreenElement && !doc.msFullscreenElement) {
        // Enter fullscreen
        if (requestFullScreen) {
            requestFullScreen.call(docEl).then(() => {
                try { localStorage.setItem('blossom.fullscreen','1'); } catch (_e) {}
            }).catch(() => {});
        }
    } else {
        // Exit fullscreen
        if (cancelFullScreen) {
            cancelFullScreen.call(doc);
            try { localStorage.setItem('blossom.fullscreen','0'); } catch (_e) {}
        }
    }
}

// Persist and auto-restore fullscreen preference across page navigations
(function fullscreenPersistence(){
    document.addEventListener('fullscreenchange', () => {
        const active = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        try { localStorage.setItem('blossom.fullscreen', active ? '1' : '0'); } catch (_e) {}
    });
    document.addEventListener('DOMContentLoaded', () => {
        const want = localStorage.getItem('blossom.fullscreen');
        const already = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        if (want === '1' && !already) {
            // Attempt silent re-entry; browsers may block without user gesture.
            const el = document.documentElement;
            const req = el.requestFullscreen || el.mozRequestFullScreen || el.webkitRequestFullScreen || el.msRequestFullscreen;
            if (req) {
                req.call(el).catch(() => {
                    // Fallback: show unobtrusive restore hint button if blocked
                    try {
                        if (!document.getElementById('fullscreen-restore-hint')) {
                            const hint = document.createElement('button');
                            hint.id = 'fullscreen-restore-hint';
                            hint.textContent = '전체화면 다시 켜기';
                            hint.style.position = 'fixed';
                            hint.style.bottom = '16px';
                            hint.style.right = '16px';
                            hint.style.zIndex = '1200';
                            hint.style.padding = '8px 14px';
                            hint.style.borderRadius = '8px';
                            hint.style.border = '1px solid #e5e7eb';
                            hint.style.background = '#ffffff';
                            hint.style.cursor = 'pointer';
                            hint.onclick = () => { toggleFullscreen(); hint.remove(); };
                            document.body.appendChild(hint);
                        }
                    } catch (_e) {}
                });
            }
        }
    });
})();

/* §12 ── Sidebar Control ───────────────────────────────────── */
/* sidebar */
document.addEventListener('DOMContentLoaded', () => {
    // 사이드바 토글 기능 (로고 클릭) - 3단계 지원
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    // NOTE: SPA partial navigation으로 main이 교체되므로 매번 조회
    function getMain() { return document.querySelector('.main-content'); }
    
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // 매 클릭마다 현재 DOM의 main-content를 새로 조회 (SPA 교체 대응)
            var mainContent = getMain();
            var root = document.documentElement;
            
            // 헤더의 사이드바 토글 버튼과 동일한 로직 사용
            const isHidden = sidebar.classList.contains('hidden');
            const isCollapsed = sidebar.classList.contains('collapsed');
            
            // 3단계 순환: 확장 → 미니 → 숨김 → 확장
            if (isHidden) {
                // 숨김 → 확장
                sidebar.classList.remove('hidden');
                sidebar.classList.remove('collapsed');
                if (mainContent) {
                    mainContent.classList.remove('sidebar-collapsed');
                    mainContent.classList.remove('sidebar-hidden');
                }
                root.classList.remove('sidebar-collapsed', 'sidebar-hidden');
                localStorage.setItem('sidebarState', 'expanded');
            } else if (isCollapsed) {
                // 미니 → 숨김
                // apply silently for hide
                sidebar.classList.add('silent');
                if (mainContent) mainContent.classList.add('silent');
                sidebar.classList.add('hidden');
                if (mainContent) {
                    mainContent.classList.add('sidebar-hidden');
                }
                root.classList.remove('sidebar-collapsed');
                root.classList.add('sidebar-hidden');
                requestAnimationFrame(() => {
                    sidebar.classList.remove('silent');
                    var mc = getMain();
                    if (mc) mc.classList.remove('silent');
                });
                localStorage.setItem('sidebarState', 'hidden');
            } else {
                // 확장 → 미니
                // apply silently for collapse
                sidebar.classList.add('silent');
                if (mainContent) mainContent.classList.add('silent');
                sidebar.classList.add('collapsed');
                if (mainContent) {
                    mainContent.classList.add('sidebar-collapsed');
                }
                root.classList.add('sidebar-collapsed');
                root.classList.remove('sidebar-hidden');
                requestAnimationFrame(() => {
                    sidebar.classList.remove('silent');
                    var mc = getMain();
                    if (mc) mc.classList.remove('silent');
                });
                localStorage.setItem('sidebarState', 'collapsed');
            }
        });
        
        // 페이지 로드 시 저장된 상태 복원
        const sidebarState = localStorage.getItem('sidebarState') || 'expanded';
        var mc = getMain();
        
    // 사이드바가 숨겨진 상태라면 강제로 표시 (안전장치)
        if (sidebar.classList.contains('hidden')) {
            sidebar.classList.remove('hidden');
            if (mc) {
                mc.classList.remove('sidebar-hidden');
            }
            localStorage.setItem('sidebarState', 'expanded');
        } else if (sidebarState === 'hidden') {
            // localStorage에 hidden이 저장되어 있지만 실제로는 표시되어 있다면 expanded로 변경
            localStorage.setItem('sidebarState', 'expanded');
            if (mc) {
                mc.classList.remove('sidebar-hidden');
            }
        } else if (sidebarState === 'collapsed') {
            sidebar.classList.add('collapsed');
            if (mc) {
                mc.classList.add('sidebar-collapsed');
            }
        } else {
            // 기본적으로 확장된 상태로 시작
            sidebar.classList.remove('collapsed');
            sidebar.classList.remove('hidden');
            if (mc) {
                mc.classList.remove('sidebar-collapsed');
                mc.classList.remove('sidebar-hidden');
            }
        }
    }
    
    // 서브메뉴 토글 기능
    const submenuTriggers = document.querySelectorAll('.submenu-trigger');
    
    submenuTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const menuItem = trigger.closest('.menu-item');
            const submenu = menuItem.querySelector('.submenu');
            const arrow = trigger.querySelector('.submenu-arrow');
            
            // 다른 열린 서브메뉴 닫기
            const openSubmenus = document.querySelectorAll('.menu-item.has-submenu.open');
            openSubmenus.forEach(openItem => {
                if (openItem !== menuItem) {
                    openItem.classList.remove('open');
                }
            });
            
            // 현재 서브메뉴 토글
            menuItem.classList.toggle('open');
            
            // 애니메이션 효과
            if (menuItem.classList.contains('open')) {
                submenu.style.maxHeight = submenu.scrollHeight + 'px';
            } else {
                submenu.style.maxHeight = '0';
            }
            
            // 서브메뉴 상태를 로컬 스토리지에 저장
            saveSubmenuState();
        });
    });
    
    // 서브메뉴 상태 저장 함수
    function saveSubmenuState() {
        const openSubmenus = document.querySelectorAll('.menu-item.has-submenu.open');
        const openMenuIds = Array.from(openSubmenus).map(item => {
            const menuText = item.querySelector('.menu-text');
            return menuText ? menuText.textContent.trim() : '';
        }).filter(id => id);
        
        localStorage.setItem('openSubmenus', JSON.stringify(openMenuIds));
    }
    
    // 저장된 서브메뉴 상태 복원
    function restoreSubmenuState() {
        const savedOpenMenus = localStorage.getItem('openSubmenus');
        if (savedOpenMenus) {
            try {
                const openMenuIds = JSON.parse(savedOpenMenus);
                openMenuIds.forEach(menuId => {
                    const menuItems = document.querySelectorAll('.menu-item.has-submenu');
                    menuItems.forEach(item => {
                        const menuText = item.querySelector('.menu-text');
                        if (menuText && menuText.textContent.trim() === menuId) {
                            item.classList.add('open');
                            const submenu = item.querySelector('.submenu');
                            if (submenu) {
                                submenu.style.maxHeight = submenu.scrollHeight + 'px';
                            }
                        }
                    });
                });
            } catch (e) {
                console.error('서브메뉴 상태 복원 중 오류:', e);
            }
        }
    }
    
    // 페이지 로드 시 서브메뉴 상태 복원
    restoreSubmenuState();
    
    // 현재 페이지 활성화 표시 (중복 누적 방지)
    function applyActiveMenuHighlight(){
        const currentPath = window.location.pathname;
        const currentKeyMatch = currentPath.match(/\/p\/([^\/?#]+)/);
        const currentKey = currentKeyMatch ? currentKeyMatch[1] : '';
        const links = document.querySelectorAll('.menu-link, .submenu-link');
        // 모든 활성화 초기화
        links.forEach(l => l.classList.remove('active'));
        links.forEach(link => {
            const rawHref = link.getAttribute('href') || '';
            let linkPath = '';
            if (rawHref) {
                try {
                    linkPath = new URL(rawHref, window.location.origin).pathname;
                } catch (_) {
                    linkPath = rawHref;
                }
            }
            const matchKeysAttr = link.dataset.matchKeys || '';
            const matchKeys = matchKeysAttr
                .split(',')
                .map(k => k.trim())
                .filter(Boolean);
            const directMatch = linkPath && linkPath === currentPath;
            const keyMatch = currentKey && matchKeys.includes(currentKey);
            if (directMatch || keyMatch) {
                link.classList.add('active');
                const parentSubmenu = link.closest('.submenu');
                if (parentSubmenu) {
                    const parentMenuItem = parentSubmenu.closest('.menu-item');
                    if (parentMenuItem) parentMenuItem.classList.add('open');
                    parentSubmenu.style.maxHeight = parentSubmenu.scrollHeight + 'px';
                    setTimeout(() => { saveSubmenuState(); }, 100);
                }
            }
        });
    }
    applyActiveMenuHighlight();
    
    // 모바일에서 사이드바 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            const sidebar = document.getElementById('sidebar');
            const sidebarToggle = document.getElementById('sidebar-toggle');
            
            if (sidebar && !sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
                sidebar.classList.remove('mobile-open');
            }
        }
    });
    
    // 윈도우 리사이즈 시 모바일 상태 초기화
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.classList.remove('mobile-open');
            }
        }
    });
    
    // 키보드 단축키 지원
    const isTypingContext = (target) => {
        try {
            const el = (target && target.nodeType === 1)
                ? target
                : (target && target.parentElement ? target.parentElement : null);
            if (!el) return false;
            const tag = String(el.tagName || '').toUpperCase();
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
            if (el.isContentEditable) return true;
            if (typeof el.closest === 'function' && el.closest('[contenteditable="true"]')) return true;
            return false;
        } catch (_e) {
            return false;
        }
    };

    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + B로 사이드바 토글 (단, 입력/편집 컨텍스트에서는 동작하지 않음)
        if ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 'b' && !isTypingContext(e.target)) {
            e.preventDefault();
            if (sidebarBtn) {
                sidebarBtn.click();
            }
        }
        
        // ESC로 모바일 사이드바 닫기
        if (e.key === 'Escape' && window.innerWidth <= 768) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar && sidebar.classList.contains('mobile-open')) {
                sidebar.classList.remove('mobile-open');
            }
        }
    });

    // ---- SPA Navigation for Sidebar Links ----
    // 사이드바 클릭 시 전체 페이지 리로드 대신 main-content만 교체하여
    // header/sidebar를 유지하고 체감 속도를 대폭 개선한다.
    var __spaNavCache = {};           // href -> {html, ts}  (5분 TTL)
    var __spaNavInflight = null;      // 현재 진행 중인 AbortController
    var __spaNavPrefetch = {};        // href -> Promise  (hover prefetch)
    var SPA_CACHE_TTL = 5 * 60 * 1000; // 5분

    // SPA 인터셉트 가능한 경로 목록
    var __spaRoutePrefixes = ['/p/', '/addon/', '/dashboard', '/settings/', '/account/', '/admin/auth/', '/hardware/', '/project/', '/construction'];

    function __spaCanIntercept(href) {
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;
        if (/^https?:/i.test(href) && !href.startsWith(location.origin)) return false;
        if (/\.(css|js|png|jpg|jpeg|gif|svg|webp|ico|json|pdf|xlsx?|zip)(\?|$)/i.test(href)) return false;
        // 인증 관련 경로는 SPA 대상에서 제외 (풀 리로드 필요)
        if (/^\/(login|logout|signup|register|reset-password|terms)(\?|$)/i.test(href)) return false;
        try {
            var url = new URL(href, location.origin);
            var ok = false;
            for (var pi = 0; pi < __spaRoutePrefixes.length; pi++) {
                if (url.pathname.startsWith(__spaRoutePrefixes[pi]) || url.pathname === __spaRoutePrefixes[pi].replace(/\/$/, '')) {
                    ok = true; break;
                }
            }
            if (!ok) return false;
        } catch (_e) { return false; }
        return true;
    }

    function __spaFetchPage(href) {
        // 캐시 히트 확인
        var cached = __spaNavCache[href];
        if (cached && (Date.now() - cached.ts < SPA_CACHE_TTL)) {
            return Promise.resolve(cached.html);
        }
        // 기존 요청 취소
        if (__spaNavInflight) {
            try { __spaNavInflight.abort(); } catch (_e) {}
        }
        __spaNavInflight = new AbortController();
        return fetch(href, {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            signal: __spaNavInflight.signal,
            headers: { 'X-Requested-With': 'blossom-spa' }
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
        }).then(function (html) {
            __spaNavCache[href] = { html: html, ts: Date.now() };
            return html;
        });
    }

    function __spaShowSkeleton() {
        var main = document.querySelector('main.main-content');
        if (!main) return;
        main.setAttribute('aria-busy', 'true');
        main.innerHTML = '<div class="spa-skeleton">'
            + '<div class="spa-skeleton-bar" style="width:60%"></div>'
            + '<div class="spa-skeleton-bar" style="width:90%"></div>'
            + '<div class="spa-skeleton-bar" style="width:75%"></div>'
            + '<div class="spa-skeleton-bar" style="width:85%"></div>'
            + '<div class="spa-skeleton-bar short" style="width:40%"></div>'
            + '</div>';
    }

    function __spaSwapMain(html, href) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var newMain = doc.querySelector('main.main-content');
        if (!newMain) throw new Error('main-content not found in response');

        // 중복 main 정리
        var existingMains = Array.from(document.querySelectorAll('main.main-content'));
        existingMains.forEach(function (m, i) { if (i > 0) { try { m.remove(); } catch (_e) {} } });
        var currentMain = existingMains[0] || document.querySelector('main.main-content');
        if (!currentMain) throw new Error('current main missing');

        // 스티커/유틸리티 정리 (fetchAndSwap의 패턴 재활용)
        try {
            var trigs = Array.from(newMain.querySelectorAll('.page-utility-right'));
            trigs.slice(1).forEach(function (u) { try { u.remove(); } catch (_e) {} });
            if (trigs[0]) {
                Array.from(trigs[0].querySelectorAll('#book-anim, .lottie-anim')).slice(1).forEach(function (n) { try { n.remove(); } catch (_e) {} });
                Array.from(trigs[0].querySelectorAll('#info-trigger')).slice(1).forEach(function (n) { try { n.remove(); } catch (_e) {} });
                Array.from(trigs[0].querySelectorAll('#info-popover')).slice(1).forEach(function (n) { try { n.remove(); } catch (_e) {} });
            }
        } catch (_e) {}

        currentMain.replaceWith(newMain);

        // 사이드바 상태 복원
        try {
            var sbState = localStorage.getItem('sidebarState');
            var root = document.documentElement;
            if (sbState === 'collapsed') {
                newMain.classList.add('sidebar-collapsed');
                newMain.classList.remove('sidebar-hidden');
                root.classList.add('sidebar-collapsed');
                root.classList.remove('sidebar-hidden');
            } else if (sbState === 'hidden') {
                newMain.classList.add('sidebar-hidden');
                newMain.classList.remove('sidebar-collapsed');
                root.classList.add('sidebar-hidden');
                root.classList.remove('sidebar-collapsed');
            } else {
                newMain.classList.remove('sidebar-collapsed', 'sidebar-hidden');
                root.classList.remove('sidebar-collapsed', 'sidebar-hidden');
            }
        } catch (_e) {}

        // body class 동기화
        try {
            var nextBody = doc.body;
            if (nextBody && typeof nextBody.className === 'string') {
                var keepModal = document.body.classList.contains('modal-open');
                document.body.className = nextBody.className;
                if (keepModal) document.body.classList.add('modal-open');
            }
            // data-* 속성 복사
            var nba = nextBody.attributes;
            for (var ai = 0; ai < nba.length; ai++) {
                if (/^data-/.test(nba[ai].name)) document.body.setAttribute(nba[ai].name, nba[ai].value);
            }
        } catch (_e) {}

        // 모달 교체
        try {
            var modalSel = 'body > .modal-overlay-full, body > .modal-overlay, body > .server-edit-modal, body > .server-add-modal, body > .system-edit-modal';
            Array.from(document.querySelectorAll(modalSel)).forEach(function (el) { try { el.remove(); } catch (_e) {} });
            Array.from(doc.querySelectorAll(modalSel)).forEach(function (el) { try { document.body.appendChild(el); } catch (_e) {} });
            if (!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open');
        } catch (_e) {}

        // CSS 동기화 (detail*.css 등 페이지별 CSS)
        try {
            var wantLinks = Array.from(doc.querySelectorAll('head link[rel="stylesheet"][href]'));
            var haveHrefs = new Set(Array.from(document.querySelectorAll('head link[rel="stylesheet"][href]')).map(function (el) { return el.getAttribute('href') || ''; }));
            var refNode = null;
            try {
                var hlnks = Array.from(document.querySelectorAll('head link[rel="stylesheet"][href]'));
                refNode = hlnks.find(function (el) { return (el.getAttribute('href') || '').indexOf('/static/css/blossom.css') >= 0; }) || null;
            } catch (_e) {}
            wantLinks.forEach(function (wl) {
                var wh = wl.getAttribute('href') || '';
                if (!wh || haveHrefs.has(wh)) return;
                // blossom.css는 이미 있으므로 스킵
                if (wh.indexOf('blossom.css') >= 0) return;
                var nl = document.createElement('link');
                nl.rel = 'stylesheet';
                nl.href = wh;
                if (refNode && refNode.parentNode) {
                    refNode.parentNode.insertBefore(nl, refNode.nextSibling);
                    refNode = nl;
                } else {
                    document.head.appendChild(nl);
                }
                haveHrefs.add(wh);
            });
        } catch (_e) {}

        // 제목 갱신
        try {
            var newTitle = doc.querySelector('title');
            if (newTitle) document.title = newTitle.textContent.trim();
        } catch (_e) {}

        // fade-in 효과
        newMain.classList.add('spa-fade-in');
        newMain.addEventListener('animationend', function () {
            newMain.classList.remove('spa-fade-in');
        }, { once: true });

        return { doc: doc, newMain: newMain };
    }

    function __spaLoadScripts(doc) {
        window.__blossomLoadedScripts = window.__blossomLoadedScripts || new Set();
        var scripts = Array.from(doc.querySelectorAll('script'));
        var loads = [];

        // DOMContentLoaded 인터셉트: SPA에서 스크립트 로딩 중에 등록되는
        // DOMContentLoaded 콜백을 캡처하여 로딩 완료 후 즉시 실행한다.
        // (이미 readyState=complete이므로 브라우저가 자동으로 호출해주지 않음)
        var __pendingDCL = [];
        var __origDocAEL = document.addEventListener;
        var __origWinAEL = window.addEventListener;
        document.addEventListener = function (type, fn, opts) {
            if (type === 'DOMContentLoaded') { __pendingDCL.push(fn); return; }
            return __origDocAEL.call(document, type, fn, opts);
        };
        window.addEventListener = function (type, fn, opts) {
            if (type === 'DOMContentLoaded') { __pendingDCL.push(fn); return; }
            return __origWinAEL.call(window, type, fn, opts);
        };

        for (var si = 0; si < scripts.length; si++) {
            var s = scripts[si];
            var src = s.getAttribute('src');
            if (src) {
                var baseSrc = src.split('?')[0];
                if (window.__blossomLoadedScripts.has(baseSrc)) continue;
                if (/\/static\/js\/blossom\.js/.test(baseSrc)) continue;
                loads.push((function (origSrc, base) {
                    return function () {
                        return new Promise(function (resolve) {
                            var tag = document.createElement('script');
                            tag.src = origSrc + (origSrc.indexOf('?') >= 0 ? '&' : '?') + '_ts=' + Date.now();
                            tag.async = false;
                            tag.onload = function () { window.__blossomLoadedScripts.add(base); resolve(); };
                            tag.onerror = function () { resolve(); };
                            document.head.appendChild(tag);
                        });
                    };
                })(src, baseSrc));
            } else if (s.textContent.trim()) {
                loads.push((function (code) {
                    return function () {
                        return new Promise(function (resolve) {
                            try { (0, eval)(code); } catch (e) { console.warn('[spa] inline script error', e); }
                            resolve();
                        });
                    };
                })(s.textContent));
            }
        }
        // 순차 실행 후 인터셉트 복원 + 캡처된 DCL 콜백 즉시 실행
        var chain = Promise.resolve();
        loads.forEach(function (fn) { chain = chain.then(fn); });
        return chain.then(function () {
            document.addEventListener = __origDocAEL;
            window.addEventListener = __origWinAEL;
            __pendingDCL.forEach(function (fn) {
                try { fn(); } catch (e) { console.warn('[spa] DCL callback error', e); }
            });
            __pendingDCL = [];
        });
    }

    function __spaNavigate(href) {
        // 즉시 active 반영 + skeleton 표시 + progress bar
        try { __spaSetActiveLink(href); } catch (_e) {}
        __spaShowSkeleton();
        document.documentElement.classList.add('spa-loading');

        __spaFetchPage(href).then(function (html) {
            // 이전 페이지의 스크립트 캐시 삭제하여 재방문 시 재실행 보장
            // (blossom.js 자체는 __spaLoadScripts에서 항상 스킵)
            window.__blossomLoadedScripts = new Set();
            var result = __spaSwapMain(html, href);
            history.pushState({ spa: true, href: href }, '', href);

            return __spaLoadScripts(result.doc).then(function () {
                // 이벤트 디스패치
                try {
                    document.dispatchEvent(new CustomEvent('blossom:pageLoaded', {
                        detail: { href: href, title: document.title, timestamp: Date.now() }
                    }));
                } catch (_e) {}
                try { document.dispatchEvent(new CustomEvent('blossom:spa:navigated', { detail: { href: href } })); } catch (_e) {}

                // 사이드바 active 갱신
                try { if (typeof applyActiveMenuHighlight === 'function') applyActiveMenuHighlight(); } catch (_e) {}
                // 유틸리티 재초기화
                try { if (typeof updateAllCountBadges === 'function') updateAllCountBadges(); } catch (_e) {}
                try { if (typeof initializeToggleBadges === 'function') initializeToggleBadges(); } catch (_e) {}
                try { if (typeof normalizeBookSticker === 'function') normalizeBookSticker(); } catch (_e) {}
                try { if (typeof runStickerGuard === 'function') runStickerGuard(); } catch (_e) {}
                try { if (typeof scheduleInfoDedup === 'function') scheduleInfoDedup(); } catch (_e) {}
                // 지연 중복 정리
                setTimeout(function () { try { if (typeof dedupeInfoWidgets === 'function') dedupeInfoWidgets('final'); } catch (_e) {} }, 150);
                setTimeout(function () { try { if (typeof normalizeBookSticker === 'function') normalizeBookSticker(); } catch (_e) {} }, 150);
                document.documentElement.classList.remove('spa-loading');
            });
        }).catch(function (err) {
            document.documentElement.classList.remove('spa-loading');
            // SPA 실패 시 기존 방식 fallback
            if (err && err.name === 'AbortError') return;
            console.warn('[spa-nav] fallback to full reload', err);
            window.location.href = href;
        });
    }

    function __spaSetActiveLink(href) {
        // 즉시 active 클래스 반영 (100ms 내 시각 피드백)
        try {
            var links = document.querySelectorAll('#sidebar .menu-link, #sidebar .submenu-link');
            links.forEach(function (l) { l.classList.remove('active'); });
            var targetUrl;
            try { targetUrl = new URL(href, location.origin); } catch (_e) { return; }
            links.forEach(function (l) {
                var lh = l.getAttribute('href') || '';
                try {
                    var lu = new URL(lh, location.origin);
                    if (lu.pathname === targetUrl.pathname) {
                        l.classList.add('active');
                        var parentSub = l.closest('.submenu');
                        if (parentSub) {
                            var parentItem = parentSub.closest('.menu-item');
                            if (parentItem) parentItem.classList.add('open');
                            parentSub.style.maxHeight = parentSub.scrollHeight + 'px';
                        }
                    }
                } catch (_e) {}
            });
        } catch (_e) {}
    }

    // Prefetch on hover (마우스 올리면 미리 fetch)
    function __spaPrefetch(href) {
        if (!__spaCanIntercept(href)) return;
        if (__spaNavPrefetch[href]) return; // 이미 요청 중
        var cached = __spaNavCache[href];
        if (cached && (Date.now() - cached.ts < SPA_CACHE_TTL)) return; // 캐시 유효
        __spaNavPrefetch[href] = fetch(href, {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'X-Requested-With': 'blossom-spa-prefetch' }
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
        }).then(function (html) {
            __spaNavCache[href] = { html: html, ts: Date.now() };
        }).catch(function () {}).finally(function () {
            delete __spaNavPrefetch[href];
        });
    }

    // 사이드바 링크에 SPA 네비게이션 바인딩
    var sidebarLinks = document.querySelectorAll('#sidebar a.menu-link, #sidebar a.submenu-link');
    sidebarLinks.forEach(function (a) {
        // Hover prefetch
        a.addEventListener('mouseenter', function () {
            var href = a.getAttribute('href');
            if (href) __spaPrefetch(href);
        }, { passive: true });

        // Click -> SPA navigation
        a.addEventListener('click', function (e) {
            var href = a.getAttribute('href');
            if (!__spaCanIntercept(href)) return; // native fallback
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // 새 탭 등 허용
            e.preventDefault();
            e.stopPropagation();
            // 같은 페이지면 무시
            try {
                var tu = new URL(href, location.origin);
                if (tu.pathname === location.pathname && tu.search === location.search) return;
            } catch (_e) {}
            __spaNavigate(href);
        }, { capture: true });
    });

    // ---- Tab-level SPA Navigation (.system-tab-btn) ----
    // 가로 탭(온프레미스/클라우드/프레임 등) 클릭 시 .tab-content 영역만 교체.
    // page-header, system-tabs 탭 바는 유지하여 최소 렌더링으로 체감 속도 개선.
    function __spaTabNavigate(href, clickedTab) {
        // 1. 즉시 active 탭 전환 (100ms 이내 시각 반응)
        var tabBar = clickedTab ? clickedTab.closest('.system-tabs') : null;
        if (tabBar) {
            var allTabs = tabBar.querySelectorAll('.system-tab-btn');
            allTabs.forEach(function (t) {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            if (clickedTab) {
                clickedTab.classList.add('active');
                clickedTab.setAttribute('aria-selected', 'true');
            }
        }
        // 2. 사이드바 active도 갱신
        try { __spaSetActiveLink(href); } catch (_e) {}

        // 3. tab-content 영역에 skeleton 즉시 표시
        var tabContent = document.querySelector('.tab-content');
        if (tabContent) {
            tabContent.setAttribute('aria-busy', 'true');
            tabContent.innerHTML = '<div class="spa-skeleton">'
                + '<div class="spa-skeleton-bar" style="width:60%"></div>'
                + '<div class="spa-skeleton-bar" style="width:90%"></div>'
                + '<div class="spa-skeleton-bar" style="width:75%"></div>'
                + '<div class="spa-skeleton-bar" style="width:85%"></div>'
                + '<div class="spa-skeleton-bar short" style="width:40%"></div>'
                + '</div>';
        }
        // 4. 프로그래스 바
        document.documentElement.classList.add('spa-loading');

        // 5. 페이지 fetch (캐시 활용)
        __spaFetchPage(href).then(function (html) {
            window.__blossomLoadedScripts = new Set();
            var parser = new DOMParser();
            var doc = parser.parseFromString(html, 'text/html');

            // 6. 응답에서 .tab-content만 추출
            var newTabContent = doc.querySelector('.tab-content');
            var currentTabContent = document.querySelector('.tab-content');
            if (!newTabContent || !currentTabContent) {
                // fallback: 전체 main 교체
                __spaSwapMain(html, href);
            } else {
                currentTabContent.replaceWith(newTabContent);
                newTabContent.classList.add('spa-fade-in');
                newTabContent.addEventListener('animationend', function () {
                    newTabContent.classList.remove('spa-fade-in');
                }, { once: true });
            }

            // 6-b. page-header 교체 (동적 탭 간 이동 시 타이틀/설명 갱신)
            try {
                var newHeader = doc.querySelector('.page-header');
                var curHeader = document.querySelector('.page-header');
                if (newHeader && curHeader) curHeader.replaceWith(newHeader);
            } catch (_e) {}

            // 6-c. data-current-key 동기화
            try {
                var newTabDiv = doc.querySelector('#dynamic-system-tabs');
                var curTabDiv = document.querySelector('#dynamic-system-tabs');
                if (newTabDiv && curTabDiv) {
                    curTabDiv.setAttribute('data-current-key', newTabDiv.getAttribute('data-current-key') || '');
                }
            } catch (_e) {}

            // 7. body-level 모달 교체 (각 탭 페이지의 추가/편집 모달)
            try {
                var modalSel = 'body > .modal-overlay-full, body > .modal-overlay, body > .server-edit-modal, body > .server-add-modal, body > .system-edit-modal';
                Array.from(document.querySelectorAll(modalSel)).forEach(function (el) { try { el.remove(); } catch (_e) {} });
                Array.from(doc.querySelectorAll(modalSel)).forEach(function (el) { try { document.body.appendChild(el); } catch (_e) {} });
                if (!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open');
            } catch (_e) {}

            // 8. 제목 갱신
            try {
                var newTitle = doc.querySelector('title');
                if (newTitle) document.title = newTitle.textContent.trim();
            } catch (_e) {}

            // 9. History push
            history.pushState({ spa: true, href: href, tab: true }, '', href);

            // 10. 스크립트 로드 (DCL 인터셉트 포함)
            return __spaLoadScripts(doc).then(function () {
                // 커스텀 이벤트
                try {
                    document.dispatchEvent(new CustomEvent('blossom:pageLoaded', {
                        detail: { href: href, title: document.title, timestamp: Date.now() }
                    }));
                } catch (_e) {}
                // 사이드바 active 최종 갱신
                try { if (typeof applyActiveMenuHighlight === 'function') applyActiveMenuHighlight(); } catch (_e) {}
                try { if (typeof updateAllCountBadges === 'function') updateAllCountBadges(); } catch (_e) {}
                document.documentElement.classList.remove('spa-loading');
            });
        }).catch(function (err) {
            document.documentElement.classList.remove('spa-loading');
            if (err && err.name === 'AbortError') return;
            console.warn('[spa-tab] fallback to full reload', err);
            window.location.href = href;
        });
    }

    // .system-tab-btn 클릭 인터셉트 (delegated, capture)
    document.addEventListener('click', function (e) {
        if (!e.target || !e.target.closest) return;
        var tab = e.target.closest('a.system-tab-btn');
        if (!tab) return;
        var href = tab.getAttribute('href');
        if (!__spaCanIntercept(href)) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        e.stopPropagation();
        // 같은 페이지면 무시
        try {
            var tu = new URL(href, location.origin);
            if (tu.pathname === location.pathname && tu.search === location.search) return;
        } catch (_e) {}
        __spaTabNavigate(href, tab);
    }, { capture: true });

    // .system-tab-btn 호버 프리페치
    document.addEventListener('mouseenter', function (e) {
        if (!e.target || !e.target.closest) return;
        var tab = e.target.closest('a.system-tab-btn');
        if (!tab) return;
        var href = tab.getAttribute('href');
        if (href) __spaPrefetch(href);
    }, { capture: true, passive: true });

    // ---- Detail Tab SPA Navigation (.server-detail-tab-btn) ----
    // 상세 페이지(하드웨어/네트워크/보안/카테고리/거버넌스/비용 등)의 탭 전환 시
    // .server-detail-content 영역만 교체하여 뒤로가기·제목·탭바를 유지 — 부드러운 전환.
    // 프로젝트 탭(tab81-90)은 자체 SPA(setupProjectSPA)가 있으므로 제외.
    function __spaDetailTabNavigate(href, clickedTab) {
        // 1. 즉시 active 탭 전환 (시각 피드백)
        var tabBar = clickedTab ? clickedTab.closest('.server-detail-tabs') : null;
        if (tabBar) {
            var allTabs = tabBar.querySelectorAll('.server-detail-tab-btn');
            allTabs.forEach(function (t) {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            if (clickedTab) {
                clickedTab.classList.add('active');
                clickedTab.setAttribute('aria-selected', 'true');
            }
        }

        // 2. 현재 콘텐츠 영역에 skeleton 즉시 표시 (시각 피드백)
        var curContent = document.querySelector('.server-detail-content');
        if (curContent) {
            curContent.setAttribute('aria-busy', 'true');
            curContent.innerHTML = '<div class="spa-skeleton">'
                + '<div class="spa-skeleton-bar" style="width:60%"></div>'
                + '<div class="spa-skeleton-bar" style="width:90%"></div>'
                + '<div class="spa-skeleton-bar" style="width:75%"></div>'
                + '<div class="spa-skeleton-bar" style="width:85%"></div>'
                + '<div class="spa-skeleton-bar short" style="width:40%"></div>'
                + '</div>';
        }

        // 3. 프로그래스 바
        document.documentElement.classList.add('spa-loading');

        // 4. 페이지 fetch (캐시 활용)
        __spaFetchPage(href).then(function (html) {
            window.__blossomLoadedScripts = new Set();
            var parser = new DOMParser();
            var doc = parser.parseFromString(html, 'text/html');

            // 5. .server-detail-content만 교체 (뒤로가기·제목·탭바 유지)
            var newContent = doc.querySelector('.server-detail-content');
            var currentContent = document.querySelector('.server-detail-content');
            if (newContent && currentContent) {
                currentContent.replaceWith(newContent);
                newContent.classList.add('spa-fade-in');
                newContent.addEventListener('animationend', function () {
                    newContent.classList.remove('spa-fade-in');
                }, { once: true });
            } else {
                // fallback: .server-detail-content가 없으면 전체 main 교체
                __spaSwapMain(html, href);
            }

            // 5-a. <main> 클래스 + data-* 속성 동기화 (tab15-file-root 등 탭별 CSS 스코프 클래스)
            try {
                var newMain = doc.querySelector('main.main-content');
                var curMain = document.querySelector('main.main-content');
                if (newMain && curMain) {
                    var newCls = Array.from(newMain.classList);
                    var curCls = Array.from(curMain.classList);
                    // 현재 main에만 있는 탭 스코프 클래스 제거
                    curCls.forEach(function (c) {
                        if (c !== 'main-content' && c !== 'sidebar-collapsed' && c !== 'sidebar-hidden' && c !== 'spa-fade-in' && newCls.indexOf(c) < 0) {
                            curMain.classList.remove(c);
                        }
                    });
                    // 새 main에 있는 클래스 추가
                    newCls.forEach(function (c) { curMain.classList.add(c); });
                    // data-* 속성 동기화 — 새 main에 없는 속성 제거 + 새 속성 추가
                    var newDataKeys = new Set();
                    var nm = newMain.attributes;
                    for (var di = 0; di < nm.length; di++) {
                        if (/^data-/.test(nm[di].name)) {
                            curMain.setAttribute(nm[di].name, nm[di].value);
                            newDataKeys.add(nm[di].name);
                        }
                    }
                    // 이전 탭의 stale data-* 속성 제거
                    var staleAttrs = [];
                    for (var si = 0; si < curMain.attributes.length; si++) {
                        var an = curMain.attributes[si].name;
                        if (/^data-/.test(an) && an !== 'data-tab15-init' && !newDataKeys.has(an)) {
                            staleAttrs.push(an);
                        }
                    }
                    staleAttrs.forEach(function (a) { curMain.removeAttribute(a); });
                }
            } catch (_e) {}

            // 5-b. 모달 교체 (탭별 추가/편집 모달)
            try {
                var modalSel = 'body > .modal-overlay-full, body > .modal-overlay, body > .server-edit-modal, body > .server-add-modal, body > .system-edit-modal';
                Array.from(document.querySelectorAll(modalSel)).forEach(function (el) { try { el.remove(); } catch (_e) {} });
                Array.from(doc.querySelectorAll(modalSel)).forEach(function (el) { try { document.body.appendChild(el); } catch (_e) {} });
                if (!document.querySelector('.modal-overlay-full.show')) document.body.classList.remove('modal-open');
            } catch (_e) {}

            // 5-c. CSS 동기화 — 새 탭 전용 CSS 추가 + 이전 탭 전용 CSS 제거
            try {
                var _coreCssPat = /blossom\.css|detail\.css|sidebar|header/;
                var wantLinks = Array.from(doc.querySelectorAll('head link[rel="stylesheet"][href]'));
                var wantHrefs = new Set(wantLinks.map(function (el) { return el.getAttribute('href') || ''; }));
                var haveLinks = Array.from(document.querySelectorAll('head link[rel="stylesheet"][href]'));
                var haveHrefs = new Set(haveLinks.map(function (el) { return el.getAttribute('href') || ''; }));
                // 이전 탭 전용 CSS 제거 (공통 CSS는 유지)
                haveLinks.forEach(function (el) {
                    var h = el.getAttribute('href') || '';
                    if (!h || wantHrefs.has(h) || _coreCssPat.test(h)) return;
                    // tab/detail 전용 CSS만 제거 (공통은 보존)
                    if (/tab\d|file\.css|bay\.css|zone\.css|opex|capex|assign|basic-storage|log\.css|task\.css|package\.css/.test(h)) {
                        el.remove();
                    }
                });
                // 새 탭 전용 CSS 추가
                wantLinks.forEach(function (wl) {
                    var wh = wl.getAttribute('href') || '';
                    if (!wh || haveHrefs.has(wh) || wh.indexOf('blossom.css') >= 0) return;
                    // 동일 base path의 다른 버전이 이미 있으면 제거
                    var wBase = wh.split('?')[0];
                    haveLinks = Array.from(document.querySelectorAll('head link[rel="stylesheet"][href]'));
                    haveLinks.forEach(function (el) {
                        var eh = (el.getAttribute('href') || '').split('?')[0];
                        if (eh === wBase) el.remove();
                    });
                    var nl = document.createElement('link');
                    nl.rel = 'stylesheet';
                    nl.href = wh;
                    document.head.appendChild(nl);
                });
            } catch (_e) {}

            // 5-d. 제목 갱신
            try {
                var newTitle = doc.querySelector('title');
                if (newTitle) document.title = newTitle.textContent.trim();
            } catch (_e) {}

            // 6. History push
            history.pushState({ spa: true, href: href, detailTab: true }, '', href);

            // 7. 스크립트 로드 (DCL 인터셉트 포함)
            return __spaLoadScripts(doc).then(function () {
                try {
                    document.dispatchEvent(new CustomEvent('blossom:pageLoaded', {
                        detail: { href: href, title: document.title, timestamp: Date.now() }
                    }));
                } catch (_e) {}
                try { if (typeof applyActiveMenuHighlight === 'function') applyActiveMenuHighlight(); } catch (_e) {}
                try { if (typeof updateAllCountBadges === 'function') updateAllCountBadges(); } catch (_e) {}
                try { if (typeof initializeToggleBadges === 'function') initializeToggleBadges(); } catch (_e) {}
                try { if (typeof normalizeBookSticker === 'function') normalizeBookSticker(); } catch (_e) {}
                document.documentElement.classList.remove('spa-loading');
            });
        }).catch(function (err) {
            document.documentElement.classList.remove('spa-loading');
            if (err && err.name === 'AbortError') return;
            console.warn('[spa-detail-tab] fallback to full reload', err);
            window.location.href = href;
        });
    }

    // .server-detail-tab-btn 클릭 인터셉트 (상세 페이지 탭 SPA)
    document.addEventListener('click', function (e) {
        if (!e.target || !e.target.closest) return;
        var tab = e.target.closest('a.server-detail-tab-btn');
        if (!tab) return;
        var href = tab.getAttribute('href');
        if (!__spaCanIntercept(href)) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        // 이미 활성화된 탭이면 무시
        if (tab.classList.contains('active')) { e.preventDefault(); return; }
        // 프로젝트 탭(setupProjectSPA 사용)은 건너뛰기
        var tabBar = tab.closest('.server-detail-tabs');
        if (tabBar && tabBar.getAttribute('aria-label') === '\uD504\uB85C\uC81D\uD2B8 \uB0B4\uC6A9 \uD0ED') return;
        e.preventDefault();
        e.stopPropagation();
        __spaDetailTabNavigate(href, tab);
    }, { capture: true });

    // .server-detail-tab-btn 호버 프리페치
    document.addEventListener('mouseenter', function (e) {
        if (!e.target || !e.target.closest) return;
        var tab = e.target.closest('a.server-detail-tab-btn');
        if (!tab) return;
        // 프로젝트 탭 제외
        var tabBar = tab.closest('.server-detail-tabs');
        if (tabBar && tabBar.getAttribute('aria-label') === '\uD504\uB85C\uC81D\uD2B8 \uB0B4\uC6A9 \uD0ED') return;
        var href = tab.getAttribute('href');
        if (href) __spaPrefetch(href);
    }, { capture: true, passive: true });

    // popstate 처리 (뒤로/앞으로)
    window.addEventListener('popstate', function (ev) {
        if (ev.state && ev.state.spa) {
            var href = location.pathname + location.search + location.hash;
            // system-tab-btn 탭 네비게이션
            if (ev.state.tab) {
                var tabBar = document.querySelector('.system-tabs');
                if (tabBar) {
                    var matchTab = null;
                    var tabs = tabBar.querySelectorAll('a.system-tab-btn');
                    tabs.forEach(function (t) {
                        try {
                            var tu = new URL(t.getAttribute('href') || '', location.origin);
                            if (tu.pathname === location.pathname) matchTab = t;
                        } catch (_e) {}
                    });
                    if (matchTab) {
                        __spaTabNavigate(href, matchTab);
                        return;
                    }
                }
            }
            // server-detail-tab-btn 상세 탭 네비게이션
            if (ev.state.detailTab) {
                var dtBar = document.querySelector('.server-detail-tabs');
                if (dtBar) {
                    var matchDt = null;
                    var dtTabs = dtBar.querySelectorAll('a.server-detail-tab-btn');
                    dtTabs.forEach(function (t) {
                        try {
                            var tu = new URL(t.getAttribute('href') || '', location.origin);
                            if (tu.pathname === location.pathname) matchDt = t;
                        } catch (_e) {}
                    });
                    if (matchDt) {
                        __spaDetailTabNavigate(href, matchDt);
                        return;
                    }
                }
            }
            __spaNavigate(href);
        }
    });

    // ---- Global SPA Link Interception ----
    // 사이드바/탭 이외의 모든 <a href="/p/..."> 클릭을 SPA로 처리하여
    // 전체 리로드를 제거한다. (목록 돌아가기, 거버넌스 카드, 푸터 등)
    document.addEventListener('click', function (e) {
        if (e.defaultPrevented) return; // 이미 처리된 이벤트
        var link = e.target ? (e.target.closest ? e.target.closest('a[href]') : null) : null;
        if (!link) return;
        var href = link.getAttribute('href');
        if (!__spaCanIntercept(href)) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        // 이미 SPA 처리되는 요소는 제외 (capture:true 핸들러에서 처리)
        if (link.closest('#sidebar')) return;
        if (link.classList.contains('system-tab-btn')) return;
        if (link.classList.contains('server-detail-tab-btn')) return;
        // 같은 페이지면 무시
        try {
            var tu = new URL(href, location.origin);
            if (tu.pathname === location.pathname && tu.search === location.search) return;
        } catch (_e) {}
        e.preventDefault();
        e.stopPropagation();
        __spaNavigate(href);
    }, { capture: false });

    // 글로벌 <a href="/p/..."> 호버 프리페치
    document.addEventListener('mouseenter', function (e) {
        if (!e.target || !e.target.closest) return;
        var link = e.target.closest('a[href]');
        if (!link) return;
        // 사이드바/탭은 이미 자체 프리페치 존재
        if (link.closest('#sidebar')) return;
        if (link.classList.contains('system-tab-btn')) return;
        if (link.classList.contains('server-detail-tab-btn')) return;
        var href = link.getAttribute('href');
        if (href) __spaPrefetch(href);
    }, { capture: true, passive: true });

    // ---- Public SPA Navigation API ----
    // JS 파일에서 window.location.href 대신 사용:
    //   blsSpaNavigate('/p/some_page?id=123')
    // SPA 가능하면 SPA, 아니면 일반 이동.
    window.blsSpaNavigate = function (href) {
        if (__spaCanIntercept(href)) {
            __spaNavigate(href);
        } else {
            window.location.href = href;
        }
    };

    // ---- SPA Boot: 셸 초기 로딩 ----
    // 서버가 SPA 셸(data-spa-boot)을 반환한 경우
    // 현재 URL의 콘텐츠를 비동기 fetch → main 교체로 페이지를 채운다.
    (function __spaBootFromShell() {
        var bootMain = document.querySelector('main.main-content[data-spa-boot]');
        if (!bootMain) return;
        var href = location.pathname + location.search + location.hash;
        document.documentElement.classList.add('spa-loading');
        __spaFetchPage(href).then(function (html) {
            window.__blossomLoadedScripts = new Set();
            var result = __spaSwapMain(html, href);
            // replaceState (pushState가 아님 — URL은 이미 올바름)
            history.replaceState({ spa: true, href: href }, '', href);
            return __spaLoadScripts(result.doc).then(function () {
                try {
                    document.dispatchEvent(new CustomEvent('blossom:pageLoaded', {
                        detail: { href: href, title: document.title, timestamp: Date.now() }
                    }));
                } catch (_e) {}
                try { if (typeof applyActiveMenuHighlight === 'function') applyActiveMenuHighlight(); } catch (_e) {}
                try { if (typeof updateAllCountBadges === 'function') updateAllCountBadges(); } catch (_e) {}
                try { if (typeof initializeToggleBadges === 'function') initializeToggleBadges(); } catch (_e) {}
                try { if (typeof normalizeBookSticker === 'function') normalizeBookSticker(); } catch (_e) {}
                try { if (typeof runStickerGuard === 'function') runStickerGuard(); } catch (_e) {}
                try { if (typeof scheduleInfoDedup === 'function') scheduleInfoDedup(); } catch (_e) {}
                document.documentElement.classList.remove('spa-loading');
            });
        }).catch(function (err) {
            document.documentElement.classList.remove('spa-loading');
            if (err && err.name === 'AbortError') return;
            console.warn('[spa-boot] failed, full reload', err);
            // 부트 실패 시 풀 리로드 방지 (무한 루프 위험)
            // 대신 에러 메시지 표시
            bootMain.innerHTML = '<div style="padding:32px;text-align:center;color:#6b7280;">'
                + '<p>페이지를 불러오는 중 오류가 발생했습니다.</p>'
                + '<button onclick="location.reload()" style="margin-top:12px;padding:8px 16px;cursor:pointer;">새로고침</button>'
                + '</div>';
        });
    })();

        // ---- Fullscreen SPA Navigation (experimental) ----
        // 브라우저는 페이지 전체 이동 시 전체화면을 자동 유지하지 않음.
        // 전체화면 상태(localStorage blossom.fullscreen === '1')에서 사이드바 링크 클릭 시
        // AJAX 로 대상 페이지를 가져와 main-content 부분만 교체하여 문서 자체는 유지 → fullscreen 유지.
        // 실패 시 정상 이동 fallback.
        function isFullscreenActive(){
            return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
        }
        function wantsPersistentFullscreen(){
            try { return localStorage.getItem('blossom.fullscreen') === '1'; } catch (_e) { return false; }
        }
        function canIntercept(href){
            if(!href) return false;
            if(href.startsWith('#')) return false;
            // 동일 출처 상대/절대 경로만 허용
            if(/^https?:/i.test(href) && !href.startsWith(location.origin)) return false;
            // Safety: hardware category pages are sensitive and have shown "UI hangs".
            // Force native navigation (full load) instead of SPA swap.
            try {
                const url = new URL(href, location.origin);
                if(url.pathname === '/p/cat_hw_server' || /^\/p\/cat_hw_/.test(url.pathname)) return false;
            } catch(_e) {}
            // 정적 파일(.css/.js/.png 등) 요청 제외
            if(/\.(css|js|png|jpg|jpeg|gif|svg|webp|ico|json)$/i.test(href)) return false;
            return true;
        }
        // -------- 보안 준수 안내(스티커/팝오버) 중복 제거 유틸 --------
        function dedupeInfoWidgets(context){
            const pathKey = location.pathname;
            // swap 직후는 무조건 실행, 그 외는 최근 2.5초 내 이미 실행했다면 생략
            if(context !== 'swap'){
                try { if(window.__blossomInfoDedupRanForPath && window.__blossomInfoDedupRanForPath[pathKey] && Date.now() - window.__blossomInfoDedupRanForPath[pathKey] < 2500){ return; } } catch(_e){}
            }
            const currentMain = document.querySelector('main.main-content');
            const insideMain = el => currentMain && currentMain.contains(el);
            const triggers = Array.from(document.querySelectorAll('button#info-trigger'));
            const popovers = Array.from(document.querySelectorAll('div#info-popover'));
            const utilities = Array.from(document.querySelectorAll('.page-utility-right'));
            const mainTrigger = triggers.find(insideMain);
            const mainPopover = popovers.find(insideMain);
            const utilitiesWithTrigger = utilities.filter(u=> u.querySelector('#info-trigger'));
            const mainUtility = utilitiesWithTrigger.find(insideMain);
            // 1차: 메인 내부 요소 기준으로 나머지 제거
            triggers.forEach(el => { if(mainTrigger && el !== mainTrigger) el.remove(); });
            popovers.forEach(el => { if(mainPopover && el !== mainPopover) el.remove(); });
            utilitiesWithTrigger.forEach(u => { if(mainUtility && u !== mainUtility) u.remove(); });
            // 2차: 메인 내부가 없고 다수라면 첫 번째만 유지
            if(!mainTrigger && triggers.length > 1){ triggers.forEach((el,i)=>{ if(i>0) el.remove(); }); }
            if(!mainPopover && popovers.length > 1){ popovers.forEach((el,i)=>{ if(i>0) el.remove(); }); }
            if(!mainUtility && utilitiesWithTrigger.length > 1){ utilitiesWithTrigger.forEach((el,i)=>{ if(i>0) el.remove(); }); }
            // 3차: 전역 강제 단일화 (ID 기준) - 전체화면 SPA 유지 상황에서만
            if(isFullscreenActive() && wantsPersistentFullscreen()){
                ['book-anim','info-popover','info-trigger'].forEach(id => {
                    const nodes = Array.from(document.querySelectorAll('#'+id));
                    nodes.forEach((n,i)=>{ if(i>0){ try { n.remove(); } catch(_e){} } });
                });
            }
            // 4차: main 중복 제거 (첫 번째 유지)
            const mains = Array.from(document.querySelectorAll('main.main-content'));
            if(mains.length>1){ mains.forEach((m,i)=>{ if(i>0){ try { m.parentElement.removeChild(m); } catch(_e){} } }); }
            try { window.__blossomInfoDedupRanForPath = window.__blossomInfoDedupRanForPath || {}; window.__blossomInfoDedupRanForPath[pathKey] = Date.now(); } catch(_e){}
        }
        function scheduleTransientObserver(){
            let runs = 0; const maxRuns = 40;
            const obs = new MutationObserver(()=>{ runs++; try { dedupeInfoWidgets('observer'); } catch(_e){} if(runs >= maxRuns){ obs.disconnect(); }});
            try { obs.observe(document.documentElement, {childList:true, subtree:true}); } catch(_e){}
            setTimeout(()=>{ try { obs.disconnect(); } catch(_e){} }, 5000);
        }
        function scheduleInfoDedup(){
            try { dedupeInfoWidgets('post-load'); } catch(_e){}
            setTimeout(()=>{ try { dedupeInfoWidgets('post-load'); } catch(_e){} }, 300);
            setTimeout(()=>{ try { dedupeInfoWidgets('post-load'); } catch(_e){} }, 1200);
            scheduleTransientObserver();
            // 스티커(Lottie) 중복 정규화 수행
            try { normalizeBookSticker(); } catch(_e){}
            setTimeout(()=>{ try { normalizeBookSticker(); } catch(_e){} }, 500);
            setTimeout(()=>{ try { normalizeBookSticker(); } catch(_e){} }, 1500);
            // 추가 다회 재시도 (비전체화면에서도) 늦게 로드된 애니메이션 중복 제거
            [2500,4000,6500,9000].forEach(ms => setTimeout(()=>{ try { normalizeBookSticker(); } catch(_e){} }, ms));
            // 추가 지연 재점검 (지연 삽입 대비) - 전체화면 상태에서만
            if(isFullscreenActive() && wantsPersistentFullscreen()){
                [2500,4000,6500].forEach(ms => setTimeout(()=>{ try { dedupeInfoWidgets('late'); normalizeBookSticker(); } catch(_e){} }, ms));
            }
        }
        // 페이지 헤더 내 보안준수안내 스티커(book-anim) 중복 정리
        function normalizeBookSticker(){
            const main = document.querySelector('main.main-content');
            // 모든 book-anim 컨테이너(id 중복 포함) 수집 + class 기반 유사 요소 포함
            const containers = Array.from(document.querySelectorAll('#book-anim, .page-utility-right #book-anim, .page-utility-right .lottie-anim'))
                .filter(el => el.id === 'book-anim' || el.classList.contains('lottie-anim'));
            if(!containers.length) return;
            // 메인 내부 컨테이너를 기준으로 다른 컨테이너 제거
            const mainContainer = main ? containers.find(c=> main.contains(c)) : null;
            if(mainContainer){
                containers.forEach(c=>{ if(c!==mainContainer) { try { c.remove(); } catch(_e){} } });
            } else if(containers.length > 1){
                // 메인 내부가 없는데 다수면 첫 번째만 유지
                containers.slice(1).forEach(c=>{ try { c.remove(); } catch(_e){} });
            }
            const target = mainContainer || containers[0];
            if(!target) return;
            // 이미 처리했다면 종료
            if(target.dataset.bookAnimNormalized === '1') return;
            // Lottie가 여러 번 삽입되어 SVG 등 다수 자식이 생긴 경우 첫 번째만 유지
            const svgChildren = Array.from(target.children).filter(ch => ch.tagName && ch.tagName.toLowerCase() === 'svg');
            if(svgChildren.length > 1){
                svgChildren.slice(1).forEach(svg => { try { svg.remove(); } catch(_e){} });
            }
            // 아직 애니메이션이 로드되지 않았다면 재시도 예약
            if(svgChildren.length === 0) {
                setTimeout(() => { try { normalizeBookSticker(); } catch(_e){} }, 400);
            }
            target.dataset.bookAnimNormalized = '1';
            // 추가: page-utility-right 내부에 book-anim 외 다른 중복 애니메이션 요소(lottie-anim) 제거
            const utility = target.closest('.page-utility-right');
            if(utility){
                const extras = Array.from(utility.querySelectorAll('.lottie-anim')).filter(el => el !== target);
                extras.forEach(e => { try { e.remove(); } catch(_e){} });
            }
        }
        // 전체화면 SPA 교체 시 기존 페이지의 스티커/팝오버를 교체 전에 전부 제거하여 중첩 자체를 원천 차단
        function purgeAllStickersBeforeSwap(){
            if(!(isFullscreenActive() && wantsPersistentFullscreen())) return;
            try {
                const toRemove = Array.from(document.querySelectorAll('#book-anim, .lottie-anim, #info-popover, #info-trigger'));
                toRemove.forEach(n => { try { n.remove(); } catch(_e){} });
            } catch(_e){}
        }
        // 교체 후 새 main 내부에서 첫 번째 유틸리티만 유지하고 나머지 스티커/팝오버 제거
        function finalizeStickerAfterSwap(newMain){
            try {
                if(!newMain) return;
                // 먼저 모든 유틸리티 영역을 숨겨 flicker 방지
                const utilities = Array.from(newMain.querySelectorAll('.page-utility-right'));
                utilities.forEach(u => { u.style.visibility = 'hidden'; });
                // 중복 제거 로직
                utilities.forEach((u,i)=>{
                    if(i===0) return; // 첫 번째 유지
                    Array.from(u.querySelectorAll('#book-anim, .lottie-anim, #info-popover, #info-trigger')).forEach(el => { try { el.remove(); } catch(_e){} });
                });
                if(utilities[0]){
                    const stickers = Array.from(utilities[0].querySelectorAll('#book-anim, .lottie-anim'));
                    stickers.forEach((s,i)=>{ if(i>0){ try { s.remove(); } catch(_e){} } });
                }
                // 전역 재정규화 및 가드 즉시 실행
                normalizeBookSticker();
                runStickerGuard();
                // 최종 하나만 남았으니 첫 번째 유틸리티 영역만 보이기
                if(utilities[0]) utilities[0].style.visibility = 'visible';
                utilities.slice(1).forEach(u => { u.style.display = 'none'; });
            } catch(_e){}
        }
        // 신규 main 교체 전에 중복 스티커/유틸리티를 HTML 파싱 결과에서 제거하여 최초 렌더 순간부터 하나만 나타나도록 함
        function sanitizeIncomingMain(newMain){
            try {
                if(!newMain) return;
                // 모든 유틸리티 수집
                const utilities = Array.from(newMain.querySelectorAll('.page-utility-right'));
                // 첫 번째 외 모두 제거 (렌더 이전이라 flicker 없음)
                utilities.slice(1).forEach(u => { try { u.remove(); } catch(_e){} });
                // 첫 번째 영역 정리
                if(utilities[0]){
                    const stickerNodes = Array.from(utilities[0].querySelectorAll('#book-anim, .lottie-anim'));
                    stickerNodes.slice(1).forEach(n => { try { n.remove(); } catch(_e){} });
                    // info-popover / trigger 중복 제거 (첫 번째 세트만 유지)
                    const triggers = Array.from(utilities[0].querySelectorAll('#info-trigger'));
                    const popovers = Array.from(utilities[0].querySelectorAll('#info-popover'));
                    triggers.slice(1).forEach(t => { try { t.remove(); } catch(_e){} });
                    popovers.slice(1).forEach(p => { try { p.remove(); } catch(_e){} });
                }
                // main 내부에 중첩된 또 다른 main 제거 (안전)
                const nested = newMain.querySelectorAll('main.main-content main.main-content');
                nested.forEach(nm => { while(nm.firstChild){ newMain.appendChild(nm.firstChild);} try { nm.remove(); } catch(_e){} });
            } catch(_e){}
        }
        // ---- Persistent Sticker Guard (무제한 증가 완전 차단) ----
        function runStickerGuard(){
            try {
                // 하나만 남겨야 하는 대상들 수집
                const main = document.querySelector('main.main-content');
                let candidates = Array.from(document.querySelectorAll('#book-anim, .page-utility-right #book-anim, .page-utility-right .lottie-anim, button#info-trigger #book-anim'))
                    .filter(el => el.id === 'book-anim' || el.classList.contains('lottie-anim'));
                if(!candidates.length) return;
                // 메인 영역에 속한 최초 요소 우선
                const primary = candidates.find(c=> main && main.contains(c)) || candidates[0];
                candidates.forEach(c => { if(c !== primary){ try { c.remove(); } catch(_e){} } });
                // SVG 자식 중복 제거
                const svgs = Array.from(primary.children).filter(ch => ch.tagName && ch.tagName.toLowerCase()==='svg');
                if(svgs.length>1){ svgs.slice(1).forEach(s => { try { s.remove(); } catch(_e){} }); }
                // page-utility-right 내부 중복 lottie-anim 제거
                const util = primary.closest('.page-utility-right');
                if(util){
                    Array.from(util.querySelectorAll('.lottie-anim')).forEach(el => { if(el!==primary){ try { el.remove(); } catch(_e){} }});
                }
            } catch(_e){}
        }
        function startPersistentStickerGuard(){
            if(window.__stickerGuardActive) return;
            window.__stickerGuardActive = true;
            const guardObserver = new MutationObserver((_mutList)=>{
                // We only observe within the page utility area, so every mutation is relevant.
                // Throttle: animationFrame 내에서 1회 실행
                if(!window.__stickerGuardScheduled){
                    window.__stickerGuardScheduled = true;
                    requestAnimationFrame(()=>{ window.__stickerGuardScheduled = false; runStickerGuard(); });
                }
            });

            function attachStickerGuardObserver(){
                const utilRoot = document.querySelector('.page-utility-right');
                if(!utilRoot) return false;
                try { guardObserver.disconnect(); } catch(_e){}
                try { guardObserver.observe(utilRoot, {childList:true, subtree:true}); } catch(_e){ return false; }
                return true;
            }

            // Observe only the utility area to avoid global subtree churn.
            try { attachStickerGuardObserver(); } catch(_e){}
            // 초기 1회 실행
            runStickerGuard();
            // 안전망: 주기적 재확인 (10초 간격)
            window.__stickerGuardInterval = setInterval(runStickerGuard, 10000);

            // SPA 교체 후 새 main/utility가 생길 수 있으므로 재부착
            document.addEventListener('blossom:pageLoaded', ()=>{
                try { attachStickerGuardObserver(); } catch(_e){}
                try { runStickerGuard(); } catch(_e){}
            });
        }
        // DOMContentLoaded 시 항상 시작 (전체화면 여부 무관)
        try { startPersistentStickerGuard(); } catch(_e){}
        // SPA 교체 후 새 main에 사이드바 상태 클래스 복원
        function restoreSidebarStateOnMain(newMain){
            try {
                if(!newMain) return;
                var state = localStorage.getItem('sidebarState');
                var root = document.documentElement;
                if(state === 'collapsed'){
                    newMain.classList.add('sidebar-collapsed');
                    newMain.classList.remove('sidebar-hidden');
                    root.classList.add('sidebar-collapsed');
                    root.classList.remove('sidebar-hidden');
                } else if(state === 'hidden'){
                    newMain.classList.add('sidebar-hidden');
                    newMain.classList.remove('sidebar-collapsed');
                    root.classList.add('sidebar-hidden');
                    root.classList.remove('sidebar-collapsed');
                } else {
                    newMain.classList.remove('sidebar-collapsed', 'sidebar-hidden');
                    root.classList.remove('sidebar-collapsed', 'sidebar-hidden');
                }
            } catch(_e){}
        }
        // SPA 교체 후 사이드바 active 상태 재동기화
        function updateActiveMenuAfterSwap(){
            try { if(typeof applyActiveMenuHighlight === 'function'){ applyActiveMenuHighlight(); } } catch(_e){}
        }
        async function fetchAndSwap(href){
            // 로딩 스피너 표시
            let spinner = document.getElementById('spa-loading-spinner');
            if(!spinner){
                spinner = document.createElement('div');
                spinner.id = 'spa-loading-spinner';
                spinner.style.position='fixed';spinner.style.top='12px';spinner.style.right='12px';
                spinner.style.zIndex='1400';spinner.style.padding='6px 12px';spinner.style.background='#111827';spinner.style.color='#f9fafb';spinner.style.fontSize='12px';spinner.style.borderRadius='6px';spinner.style.boxShadow='0 2px 8px rgba(0,0,0,.2)';
                spinner.textContent='Loading...';
                document.body.appendChild(spinner);
            }
            try {
                const resp = await fetch(href, {credentials:'same-origin', cache:'no-store'});
                if(!resp.ok) throw new Error('HTTP '+resp.status);
                const finalHref = (resp && resp.url) ? resp.url : href;
                const text = await resp.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/html');
                const newMain = doc.querySelector('main.main-content');
                if(!newMain) throw new Error('main content not found');
                // 교체 전 스티커/팝오버 전부 제거 (fullscreen 전용)
                purgeAllStickersBeforeSwap();
                // 신규 main 사전 정리 (중복 제거) - 최초 렌더 직전
                sanitizeIncomingMain(newMain);
                // 교체 전 중복 main 정리
                const existingMains = Array.from(document.querySelectorAll('main.main-content'));
                existingMains.forEach((m,i)=>{ if(i>0){ try { m.parentElement.removeChild(m); } catch(_e){} } });
                const currentMain = existingMains[0] || document.querySelector('main.main-content');
                if(!currentMain) throw new Error('current main missing');
                currentMain.replaceWith(newMain);
                // Ensure ALL page-specific stylesheets are loaded (fullscreen SPA).
                try {
                    var _fsCss = Array.from(doc.querySelectorAll('head link[rel="stylesheet"][href]'));
                    var _fsHaveBase = new Set(
                        Array.from(document.querySelectorAll('head link[rel="stylesheet"][href]'))
                            .map(function(el) { return (el.getAttribute('href') || '').split('?')[0]; })
                    );
                    var _fsRef = null;
                    try {
                        var _fsLinks = Array.from(document.querySelectorAll('head link[rel="stylesheet"][href]'));
                        _fsRef = _fsLinks[_fsLinks.length - 1] || null;
                    } catch (_e2) {}
                    _fsCss.forEach(function(wl) {
                        var wh = wl.getAttribute('href') || '';
                        if (!wh) return;
                        var wbase = wh.split('?')[0];
                        if (_fsHaveBase.has(wbase)) return;
                        var nl = document.createElement('link');
                        nl.rel = 'stylesheet';
                        nl.href = wh;
                        if (_fsRef && _fsRef.parentNode) {
                            _fsRef.parentNode.insertBefore(nl, _fsRef.nextSibling);
                            _fsRef = nl;
                        } else {
                            document.head.appendChild(nl);
                        }
                        _fsHaveBase.add(wbase);
                    });
                } catch (_e) {}
                // 사이드바 상태 복원 (SPA 교체 시 클래스 유실 방지)
                restoreSidebarStateOnMain(newMain);
                // 내부 중첩 main 평탄화
                const nestedMains = newMain.querySelectorAll('main.main-content');
                nestedMains.forEach(nm => { if(nm!==newMain){ while(nm.firstChild){ newMain.appendChild(nm.firstChild); } try { nm.remove(); } catch(_e){} } });
                // 교체 후 스티커 재정리
                finalizeStickerAfterSwap(newMain);
                try { dedupeInfoWidgets('swap'); } catch(_e){}
                // Replace overlay modals that live outside <main> (edit/add modals)
                try {
                    const modalSel = 'body > .modal-overlay-full, body > .server-edit-modal, body > .server-add-modal, body > .system-edit-modal';
                    const curModals = Array.from(document.querySelectorAll(modalSel));
                    curModals.forEach(el => { try { el.remove(); } catch (_e) {} });
                    const nextModals = Array.from(doc.querySelectorAll(modalSel));
                    nextModals.forEach(el => { try { document.body.appendChild(el); } catch (_e) {} });
                    if (!document.querySelector('.modal-overlay-full.show')) {
                        document.body.classList.remove('modal-open');
                    }
                } catch (_e) {}
                updateActiveMenuAfterSwap();
                // 제목 갱신
                const newTitle = doc.querySelector('title');
                if(newTitle) document.title = newTitle.textContent.trim();
                // History push
                history.pushState({spa: true, href: finalHref}, '', finalHref);
                // 스크립트 로드 처리
                window.__blossomLoadedScripts = window.__blossomLoadedScripts || new Set();
                const scripts = Array.from(doc.querySelectorAll('script'));
                const sequentialLoads = [];
                for(const s of scripts){
                    const src = s.getAttribute('src');
                    if(src){
                        const baseSrc = src.split('?')[0];
                        if(window.__blossomLoadedScripts.has(baseSrc)) continue; // 캐시 파라미터 무시 중복 차단
                        if(/\/static\/js\/blossom\.js/.test(baseSrc)) continue; // 핵심 스크립트 제외
                        sequentialLoads.push(() => new Promise((resolve)=>{
                            const tag = document.createElement('script');
                            tag.src = baseSrc + (src.includes('?') ? src.substring(src.indexOf('?')) + '&' : '?') + '_ts=' + Date.now();
                            tag.async = false;
                            tag.onload = () => { window.__blossomLoadedScripts.add(baseSrc); resolve(); };
                            tag.onerror = () => { console.warn('[spa] script load error', src); resolve(); };
                            document.head.appendChild(tag);
                        }));
                    } else if(s.textContent.trim()) {
                        sequentialLoads.push(() => new Promise((resolve)=>{
                            try { (0,eval)(s.textContent); } catch(e){ console.warn('[spa] inline script error', e); }
                            resolve();
                        }));
                    }
                }
                // 순차 실행
                for(const loader of sequentialLoads){ await loader(); }
                // NOTE: Do NOT dispatch synthetic DOMContentLoaded here.
                // It can re-trigger many legacy handlers and cause re-init storms / page freezes.
                // Page scripts loaded during swap should self-init on load, and SPA-aware code
                // can use the custom 'blossom:pageLoaded' event below.
                // 커스텀 페이지 로드 이벤트 (SPA) - 개별 페이지 스크립트가 선택적으로 이 이벤트에 반응하도록 유도
                try {
                    const detail = { href: finalHref, title: document.title, timestamp: Date.now() };
                    document.dispatchEvent(new CustomEvent('blossom:pageLoaded', { detail }));
                } catch(e){ console.warn('[spa] blossom:pageLoaded dispatch failed', e); }
                // 스크립트 초기화 이후 재/지연 중복 제거 스케줄링
                try { scheduleInfoDedup(); } catch(_e){}
                updateActiveMenuAfterSwap();
                // 헬퍼 재호출
                try { updateAllCountBadges && updateAllCountBadges(); } catch (_e) {}
                try { initializeToggleBadges && initializeToggleBadges(); } catch (_e) {}
                // 사용자 목록 페이지 특수 초기화(표시가 사라질 경우)
                try { if(typeof fetchUsers === 'function'){ fetchUsers(); } } catch (_e) {}
                // 최종 전역 재중복 검사 (지연 삽입 대비)
                setTimeout(()=>{ try { dedupeInfoWidgets('final'); } catch(_e){} }, 100);
                setTimeout(()=>{ try { dedupeInfoWidgets('final'); } catch(_e){} }, 800);
                setTimeout(()=>{ try { normalizeBookSticker(); } catch(_e){} }, 100);
                setTimeout(()=>{ try { normalizeBookSticker(); } catch(_e){} }, 800);
            } catch (e){
                console.warn('[fullscreen-spa] swap failed, falling back', e);
                window.location.href = href; // fallback 전체 이동 (fullscreen 종료 허용)
            } finally {
                if(spinner) spinner.remove();
            }
        }
        function interceptHandler(e){
            const a = e.currentTarget;
            const href = a.getAttribute('href');
            if(wantsPersistentFullscreen() && isFullscreenActive() && canIntercept(href)){
                e.preventDefault();
                fetchAndSwap(href);
            }
        }
        sidebarLinks.forEach(a => a.addEventListener('click', interceptHandler));
        window.addEventListener('popstate', (ev) => {
            if(ev.state && ev.state.spa && wantsPersistentFullscreen() && isFullscreenActive()){
                fetchAndSwap(location.pathname + location.search + location.hash);
            }
        });
        // Delegated interception for dynamically inserted links (header tabs, main content etc.)
        document.addEventListener('click', function(e){
            if(!wantsPersistentFullscreen() || !isFullscreenActive()) return;
            // Ignore modified clicks (new tab, download etc.)
            if(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            let el = e.target;
            while(el && el !== document){
                if(el.tagName === 'A') break;
                el = el.parentElement;
            }
            if(!el || el.tagName !== 'A') return;

            // Tab navigations now use SPA swap for smoother transitions.
            // Re-init is handled via blossom:pageLoaded + body class guards.

            const href = el.getAttribute('href');
            if(!canIntercept(href)) return;
            e.preventDefault();
            fetchAndSwap(href);
        }, true); // capture to beat other handlers

        // Intercept form submissions (POST only) to stay in fullscreen if possible
        document.addEventListener('submit', function(e){
            if(!wantsPersistentFullscreen() || !isFullscreenActive()) return;
            const form = e.target;
            const action = form.getAttribute('action') || location.pathname;
            const method = (form.getAttribute('method') || 'GET').toUpperCase();
            if(method !== 'POST') return; // allow GET forms to navigate normally
            if(!canIntercept(action)) return;
            e.preventDefault();
            const fd = new FormData(form);
            fetch(action, {method:'POST', body: fd, credentials:'same-origin', headers:{'X-Requested-With':'XMLHttpRequest'}})
                .then(r => r.text().then(t => ({ok:r.ok, status:r.status, text:t, ct:r.headers.get('content-type')||''})))
                .then(res => {
                    if(!res.ok){
                        showToast('요청 실패('+res.status+')', 'info');
                        return; // keep current view
                    }
                    if(/text\/html/i.test(res.ct)){
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(res.text, 'text/html');
                        const newMain = doc.querySelector('main.main-content');
                        if(newMain){
                            purgeAllStickersBeforeSwap();
                            sanitizeIncomingMain(newMain);
                            const existingMains = Array.from(document.querySelectorAll('main.main-content'));
                            existingMains.forEach((m,i)=>{ if(i>0){ try { m.parentElement.removeChild(m); } catch(_e){} } });
                            const currentMain = existingMains[0] || document.querySelector('main.main-content');
                            if(currentMain){ currentMain.replaceWith(newMain); }
                            restoreSidebarStateOnMain(newMain);
                            const nestedMains = newMain.querySelectorAll('main.main-content');
                            nestedMains.forEach(nm => { if(nm!==newMain){ while(nm.firstChild){ newMain.appendChild(nm.firstChild); } try { nm.remove(); } catch(_e){} } });
                            finalizeStickerAfterSwap(newMain);
                            try { dedupeInfoWidgets('swap'); scheduleInfoDedup(); } catch(_e){}
                            history.pushState({spa:true, href:action}, '', action);
                            try { updateActiveMenuAfterSwap(); } catch(_e){}
                            setTimeout(()=>{ try { dedupeInfoWidgets('final'); } catch(_e){} }, 100);
                            setTimeout(()=>{ try { dedupeInfoWidgets('final'); } catch(_e){} }, 800);
                            setTimeout(()=>{ try { normalizeBookSticker(); } catch(_e){} }, 100);
                            setTimeout(()=>{ try { normalizeBookSticker(); } catch(_e){} }, 800);
                        }
                    } else if(/application\/json/i.test(res.ct)) {
                        // Keep page; perhaps show toast only
                        showToast('변경되었습니다.', 'success');
                    } else {
                        showToast('처리 완료', 'success');
                    }
                }).catch(()=> showToast('요청 오류', 'info'));
        }, true);

        // Optional pseudo-fullscreen class to visually persist if real fullscreen lost mid-navigation
        function ensurePseudoFullscreen(){
            if(!isFullscreenActive() && wantsPersistentFullscreen()){
                document.documentElement.classList.add('pseudo-fullscreen');
                document.body.classList.add('pseudo-fullscreen');
            }
        }
        ensurePseudoFullscreen();
        document.addEventListener('fullscreenchange', () => {
            if(isFullscreenActive()){
                document.documentElement.classList.remove('pseudo-fullscreen');
                document.body.classList.remove('pseudo-fullscreen');
            } else {
                ensurePseudoFullscreen();
            }
        });
});

/* §13 ── Cost Tab SPA Nav ──────────────────────────────────── */
/* setting */

// 탭 전환 기능
document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    // 저장된 탭 상태 복원
    const savedTab = localStorage.getItem('activeTab');
    let initialTab = null;

    if (savedTab) {
        const savedButton = document.querySelector(`[data-tab="${savedTab}"]`);
        const savedPane = document.getElementById(savedTab);
        
        if (savedButton && savedPane) {
            initialTab = savedTab;
        }
    }

    // 초기 탭이 없으면 첫 번째 탭을 기본값으로 설정
    if (!initialTab && tabButtons.length > 0) {
        initialTab = tabButtons[0].getAttribute('data-tab');
    }

    // 초기 탭 활성화
    if (initialTab) {
        activateTab(initialTab);
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            activateTab(targetTab);
        });
    });
    
    // 초기 행 개수 업데이트
    updateRowCounts();
});

// ---- Cost Tab Partial Loading (OPEX/CAPEX) ----
// 목적: 비용관리의 탭/상세탭 이동 시 전체 리로드 대신 main-content만 교체하여 체감 로딩 감소
// 범위: /p/cost_* 페이지의 .system-tabs, .server-detail-tabs
(function () {
    'use strict';

    if (window.__blossom_cost_tab_partial_nav_installed__) return;
    window.__blossom_cost_tab_partial_nav_installed__ = true;

    const SCRIPT_CACHE = new Map();
    let inFlightController = null;

    function isLeftClick(e) { return e && e.button === 0; }
    function isModified(e) { return !!(e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)); }

    function parseUrl(href) {
        try { return new URL(href, window.location.href); } catch (_e) { return null; }
    }

    function isSameOrigin(url) {
        try { return url && url.origin === window.location.origin; } catch (_e) { return false; }
    }

    function isPRoute(url) {
        try { return !!(url && String(url.pathname || '').startsWith('/p/')); } catch (_e) { return false; }
    }

    function currentKey() {
        try {
            const m = String(location.pathname || '').match(/^\/p\/([^/?#]+)/);
            return m ? m[1] : '';
        } catch (_e) {
            return '';
        }
    }

    function keyFromUrl(url) {
        try {
            const m = String(url.pathname || '').match(/^\/p\/([^/?#]+)/);
            return m ? m[1] : '';
        } catch (_e) {
            return '';
        }
    }

    function isCostKey(key) {
        return /^cost_(opex|capex)_/i.test(String(key || ''));
    }

    function isVendorKey(key) {
        return /^cat_vendor_(manufacturer|maintenance)_/i.test(String(key || ''));
    }

    function isCategoryKey(key) {
        var s = String(key || '');
        if (!/^cat_/.test(s)) return false;
        return /_(detail|system|manager|service|task|log|file|hardware|software|component|maintenance)$/.test(s);
    }

    function isProjectListKey(key) {
        return /^proj_(status|participating|completed)$/.test(String(key || ''));
    }

    function isGovernanceDetailKey(key) {
        var s = String(key || '');
        if (!/^gov_/.test(s)) return false;
        // IP policy
        if (/^gov_ip_policy_(detail|ip_range|log|file)$/.test(s)) return true;
        // DNS policy
        if (/^gov_dns_policy_(detail|dns_record|log|file)$/.test(s)) return true;
        // AD policy
        if (/^gov_ad_policy_(detail|domain|account|log|file)$/.test(s)) return true;
        // VPN policy (vpn1-5)
        if (/^gov_vpn_policy\d?_(detail|manager|communication|vpn_policy|task|log|file)$/.test(s)) return true;
        // Dedicated line policy
        if (/^gov_dedicatedline_(member|customer|van|affiliate|intranet)_(detail|manager|task|log|file)$/.test(s)) return true;
        return false;
    }

    function isSpaTabKey(key) {
        return isCostKey(key) || isCategoryKey(key) || isProjectListKey(key) || isGovernanceDetailKey(key);
    }

    function setBusy(busy) {
        try {
            const main = document.querySelector('main.main-content');
            if (main) main.setAttribute('aria-busy', busy ? 'true' : 'false');
        } catch (_e) {}
        try {
            document.documentElement.classList.toggle('spa-loading', !!busy);
        } catch (_e) {}
    }

    function fetchHtml(url) {
        if (inFlightController) {
            try { inFlightController.abort(); } catch (_e) {}
        }
        inFlightController = new AbortController();
        return fetch(url.toString(), {
            method: 'GET',
            headers: { 'X-Requested-With': 'blossom-cost-tabs', 'Accept': 'text/html,application/xhtml+xml' },
            credentials: 'same-origin',
            cache: 'no-store',
            signal: inFlightController.signal,
        }).then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const finalUrl = (r && r.url) ? r.url : url.toString();
            return r.text().then(html => ({ html, finalUrl }));
        });
    }

    function parseDoc(html) {
        try { return new DOMParser().parseFromString(html, 'text/html'); } catch (_e) { return null; }
    }

    function isDetailStylesheetHref(href) {
        const h = String(href || '');
        return /\/static\/css\/detail[\w-]*\.css/i.test(h) || /\/static\/css\/category\d*\.css/i.test(h);
    }

    function desiredDetailStyles(nextDoc) {
        try {
            const links = Array.from(nextDoc.querySelectorAll('head link[rel="stylesheet"][href]'));
            return links
                .map(el => ({
                    href: el.getAttribute('href') || '',
                    media: el.getAttribute('media') || '',
                    integrity: el.getAttribute('integrity') || '',
                    crossorigin: el.getAttribute('crossorigin') || '',
                }))
                .filter(x => isDetailStylesheetHref(x.href));
        } catch (_e) {
            return [];
        }
    }

    function syncDetailStyles(nextDoc) {
        // Cost tab partial navigation swaps only <main>, so <head> styles remain.
        // Basic-info uses detail5.css while contract/log/file use detail.css.
        // If we don't sync them, layout differs until a full refresh.
        const want = desiredDetailStyles(nextDoc);
        if (!want.length) return;

        try {
            const wantHrefs = new Set(want.map(x => x.href));

            // Ensure desired styles are present BEFORE removing old ones.
            // Otherwise, there is a brief unstyled flash where icons render at
            // their intrinsic size ("엄청 크게" 보이는 현상).
            const have = new Set(
                Array.from(document.querySelectorAll('head link[rel="stylesheet"][href]'))
                    .map(el => el.getAttribute('href') || '')
            );

            // Keep predictable precedence: insert after blossom.css when possible.
            let insertAfter = null;
            try {
                const headLinks = Array.from(document.querySelectorAll('head link[rel="stylesheet"][href]'));
                insertAfter = headLinks.find(el => String(el.getAttribute('href') || '').includes('/static/css/blossom.css')) || null;
            } catch (_e) {}

            const pendingLoads = [];

            want.forEach(x => {
                if (!x.href || have.has(x.href)) return;
                const el = document.createElement('link');
                el.rel = 'stylesheet';
                el.href = x.href;
                if (x.media) el.media = x.media;
                if (x.integrity) el.integrity = x.integrity;
                if (x.crossorigin) el.crossOrigin = x.crossorigin;

                // Track load so we can safely remove old detail styles afterwards.
                pendingLoads.push(new Promise((resolve) => {
                    try {
                        el.addEventListener('load', () => resolve(true), { once: true });
                        el.addEventListener('error', () => resolve(false), { once: true });
                    } catch (_e) {
                        resolve(false);
                    }
                }));

                try {
                    if (insertAfter && insertAfter.parentNode) {
                        insertAfter.insertAdjacentElement('afterend', el);
                        insertAfter = el;
                    } else {
                        document.head.appendChild(el);
                    }
                } catch (_e) {
                    try { document.head.appendChild(el); } catch (_e2) {}
                }
            });

            const removeOld = () => {
                try {
                    const existing = Array.from(document.querySelectorAll('head link[rel="stylesheet"][href]'))
                        .filter(el => isDetailStylesheetHref(el.getAttribute('href') || ''));
                    existing.forEach(el => {
                        const href = el.getAttribute('href') || '';
                        if (!wantHrefs.has(href)) {
                            try { el.remove(); } catch (_e) {}
                        }
                    });
                } catch (_e) {}
            };

            if (pendingLoads.length) {
                Promise.allSettled(pendingLoads).then(removeOld);
            } else {
                // Desired styles already present; safe to remove immediately.
                removeOld();
            }
        } catch (_e) {}
    }

    function replaceMainAndModals(nextDoc) {
        const curMain = document.querySelector('main.main-content');
        const nextMain = nextDoc ? nextDoc.querySelector('main.main-content') : null;
        if (!curMain || !nextMain) throw new Error('main-content missing');
        curMain.replaceWith(nextMain);

        // 사이드바 상태 복원 (SPA 교체 시 클래스 유실 방지)
        // main-content 및 html 양쪽에 적용하여 detail.css !important 규칙도 매칭
        try {
            var sbState = localStorage.getItem('sidebarState');
            var root = document.documentElement;
            if(sbState === 'collapsed'){
                nextMain.classList.add('sidebar-collapsed');
                nextMain.classList.remove('sidebar-hidden');
                root.classList.add('sidebar-collapsed');
                root.classList.remove('sidebar-hidden');
            } else if(sbState === 'hidden'){
                nextMain.classList.add('sidebar-hidden');
                nextMain.classList.remove('sidebar-collapsed');
                root.classList.add('sidebar-hidden');
                root.classList.remove('sidebar-collapsed');
            } else {
                nextMain.classList.remove('sidebar-collapsed', 'sidebar-hidden');
                root.classList.remove('sidebar-collapsed', 'sidebar-hidden');
            }
        } catch(_e){}

        // Sync body class for page-specific CSS.
        // Cost tab partial navigation swaps only <main>, so <body class="..."> from the
        // next page would otherwise not apply until a full refresh.
        try {
            const keep = [];
            // Preserve transient UI state flags that may be set outside page templates.
            if (document.body.classList.contains('modal-open')) keep.push('modal-open');

            const nextBody = nextDoc && nextDoc.body;
            if (nextBody && typeof nextBody.className === 'string') {
                document.body.className = nextBody.className;
            }

            // Sync data-* attributes (e.g. data-cat-detail-id) so tab scripts can read them.
            if (nextBody) {
                try {
                    var nextAttrs = nextBody.attributes;
                    for (var ai = 0; ai < nextAttrs.length; ai++) {
                        var attr = nextAttrs[ai];
                        if (/^data-/.test(attr.name)) document.body.setAttribute(attr.name, attr.value);
                    }
                } catch (_e) {}
            }

            keep.forEach(cls => { try { document.body.classList.add(cls); } catch (_e) {} });
        } catch (_e) {}

        // Sync detail stylesheet (detail.css vs detail5.css) for consistent header icon layout.
        try { syncDetailStyles(nextDoc); } catch (_e) {}

        // Ensure ALL page-specific stylesheets (e.g. tab15-file.css) are loaded.
        // syncDetailStyles only handles detail/category CSS; this covers the rest.
        try {
            var _wantCss = Array.from(nextDoc.querySelectorAll('head link[rel="stylesheet"][href]'));
            var _haveCssBase = new Set(
                Array.from(document.querySelectorAll('head link[rel="stylesheet"][href]'))
                    .map(function(el) { return (el.getAttribute('href') || '').split('?')[0]; })
            );
            var _cssRef = null;
            try {
                var _hLinks = Array.from(document.querySelectorAll('head link[rel="stylesheet"][href]'));
                _cssRef = _hLinks[_hLinks.length - 1] || null;
            } catch (_e2) {}
            _wantCss.forEach(function(wl) {
                var wh = wl.getAttribute('href') || '';
                if (!wh) return;
                var wbase = wh.split('?')[0];
                if (_haveCssBase.has(wbase)) return;
                var nl = document.createElement('link');
                nl.rel = 'stylesheet';
                nl.href = wh;
                if (_cssRef && _cssRef.parentNode) {
                    _cssRef.parentNode.insertBefore(nl, _cssRef.nextSibling);
                    _cssRef = nl;
                } else {
                    document.head.appendChild(nl);
                }
                _haveCssBase.add(wbase);
            });
        } catch (_e) {}

        // Sync page flags that live outside <main> (CAPEX list pages depend on this).
        try {
            const curFlag = document.getElementById('capex-flag');
            const nextFlag = nextDoc.getElementById('capex-flag');
            if (curFlag && nextFlag) {
                curFlag.replaceWith(nextFlag);
            } else if (!curFlag && nextFlag) {
                document.body.appendChild(nextFlag);
            } else if (curFlag && !nextFlag) {
                curFlag.remove();
            }
        } catch (_e) {}

        // Replace overlay modals that belong to the swapped page.
        try {
            const curModals = Array.from(document.querySelectorAll('body > .modal-overlay-full, body > .server-edit-modal, body > .server-add-modal, body > .system-edit-modal'));
            curModals.forEach(el => { try { el.remove(); } catch (_e) {} });
            const nextModals = Array.from(nextDoc.querySelectorAll('body > .modal-overlay-full, body > .server-edit-modal, body > .server-add-modal, body > .system-edit-modal'));
            nextModals.forEach(el => { try { document.body.appendChild(el); } catch (_e) {} });
        } catch (_e) {}

        // Reset modal-open state if any overlay was removed.
        try {
            if (!document.querySelector('.modal-overlay-full.show')) {
                document.body.classList.remove('modal-open');
            }
        } catch (_e) {}

        // Title
        try {
            const t = nextDoc.querySelector('title');
            if (t && t.textContent) document.title = t.textContent.trim();
        } catch (_e) {}

        // Sync inline project globals from next page's inline scripts
        try {
            var inlineScripts = Array.from(nextDoc.querySelectorAll('script:not([src])'));
            for (var si = 0; si < inlineScripts.length; si++) {
                var txt = inlineScripts[si].textContent || '';
                var mUrl = txt.match(/window\.__PROJ_COMPLETED_DETAIL_URL\s*=\s*["']([^"']+)["']/);
                if (mUrl) window.__PROJ_COMPLETED_DETAIL_URL = mUrl[1];
                var mKey = txt.match(/window\.__PROJ_CURRENT_KEY\s*=\s*["']([^"']+)["']/);
                if (mKey) window.__PROJ_CURRENT_KEY = mKey[1];
            }
        } catch (_e) {}

        // Sidebar active sync
        try { if (typeof applyActiveMenuHighlight === 'function') applyActiveMenuHighlight(); } catch (_e) {}
    }

    function loadScriptOnce(src) {
        if (!src) return Promise.resolve(false);
        const key = src.split('#')[0];
        if (SCRIPT_CACHE.has(key)) return SCRIPT_CACHE.get(key);
        const p = new Promise((resolve) => {
            try {
                const exists = document.querySelector('script[src="' + src.replace(/"/g, '') + '"]');
                if (exists) { resolve(true); return; }
            } catch (_e) {}
            // Also check by base path (without query params) to detect scripts
            // loaded by the fullscreen-SPA with different cache-bust parameters.
            try {
                const basePath = src.split('?')[0];
                const allScripts = document.querySelectorAll('script[src]');
                for (let i = 0; i < allScripts.length; i++) {
                    const s2 = allScripts[i].getAttribute('src') || '';
                    if (s2.split('?')[0] === basePath) { resolve(true); return; }
                }
            } catch (_e) {}
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = () => resolve(true);
            s.onerror = () => { try { console.warn('[cost-tabs] script load failed', src); } catch (_e) {} resolve(false); };
            document.head.appendChild(s);
        });
        SCRIPT_CACHE.set(key, p);
        return p;
    }

    function scriptsForKey(key) {
        const k = String(key || '');
        // Project list tabs
        if (k === 'proj_status') return ['/static/js/8.project/8-1.project/8-1-1.my_project/1.my_project.js?v=20260306'];
        if (k === 'proj_participating') return ['/static/js/8.project/8-1.project/8-1-2.participating_project/1.participating_project.js?v=20260306'];
        if (k === 'proj_completed') return ['/static/js/8.project/8-1.project/8-1-3.project_list/1.project_list.js?v=20260216_1'];
        // CAPEX list pages
        if (/^cost_capex_(hardware|software|etc)$/.test(k)) return ['/static/js/7.cost/7-2.capex/capex_contract_list.js?v=20260214-5'];
        if (k === 'cost_capex_contract') return ['/static/js/7.cost/7-2.capex/capex_contract_list.js?v=20260214-5'];
        // OPEX detail tabs
        if (/^cost_opex_(hardware|software|etc)_system$/.test(k)) return ['/static/js/_detail/tab41-system.js?v=1.0'];
        if (/^cost_opex_(hardware|software|etc)_contract$/.test(k)) return ['/static/js/7.cost/tab71-opex.js?v=20260209-1'];
        if (/^cost_opex_(hardware|software|etc)_log$/.test(k)) return ['/static/js/_detail/tab14-log.js?v=1.0'];
        if (/^cost_opex_(hardware|software|etc)_file$/.test(k)) return ['/static/js/_detail/tab15-file.js?v=1.2'];

        // CAPEX detail tabs
        if (/^cost_capex_(hardware|software|etc)_detail$/.test(k)) return ['/static/js/7.cost/7-2.capex/capex_detail_basic.js?v=20260214-6'];
        if (/^cost_capex_(hardware|software|etc)_contract$/.test(k)) return ['/static/js/7.cost/7-2.capex/tab62-contract.js?v=20260214-28'];
        if (/^cost_capex_(hardware|software|etc)_log$/.test(k)) return ['/static/js/_detail/tab14-log.js?v=1.0'];
        if (/^cost_capex_(hardware|software|etc)_file$/.test(k)) return ['/static/js/_detail/tab15-file.js?v=1.2'];

        // ------------------------------------------------------------------
        // Category detail tabs (data-driven)
        // ------------------------------------------------------------------
        var CAT_DETAIL_JS = {
            'cat_business_group': '/static/js/9.category/9-1.business/9-1-5.work_group/2.work_group_detail.js?v=3.10',
            'cat_hw_server': '/static/js/9.category/9-2.hardware/9-2-1.server/2.server_detail.js?v=3.5',
            'cat_hw_storage': '/static/js/9.category/9-2.hardware/9-2-2.storage/2.storage_detail.js?v=3.5',
            'cat_hw_san': '/static/js/9.category/9-2.hardware/9-2-3.san/2.san_detail.js?v=3.5',
            'cat_hw_network': '/static/js/9.category/9-2.hardware/9-2-4.network/2.network_detail.js?v=3.5',
            'cat_hw_security': '/static/js/9.category/9-2.hardware/9-2-5.security/2.security_detail.js?v=3.5',
            'cat_sw_os': '/static/js/9.category/9-3.software/9-3-1.os/2.os_detail.js?v=3.3',
            'cat_sw_database': '/static/js/9.category/9-3.software/9-3-2.database/2.database_detail.js?v=3.4',
            'cat_sw_middleware': '/static/js/9.category/9-3.software/9-3-3.middleware/2.middleware_detail.js?v=3.4',
            'cat_sw_virtualization': '/static/js/9.category/9-3.software/9-3-4.virtualization/2.virtualization_detail.js?v=3.4',
            'cat_sw_security': '/static/js/9.category/9-3.software/9-3-5.security/2.security_detail.js?v=3.4',
            'cat_sw_high_availability': '/static/js/9.category/9-3.software/9-3-6.high_availability/2.high_availability_detail.js?v=3.4',
            'cat_component_cpu': '/static/js/9.category/9-4.component/9-4-1.cpu/2.cpu_detail.js?v=2.2',
            'cat_component_gpu': '/static/js/9.category/9-4.component/9-4-2.gpu/2.gpu_detail.js?v=1.0',
            'cat_component_memory': '/static/js/9.category/9-4.component/9-4-3.memory/2.memory_detail.js?v=1.0',
            'cat_component_disk': '/static/js/9.category/9-4.component/9-4-4.disk/2.disk_detail.js?v=1.0',
            'cat_component_nic': '/static/js/9.category/9-4.component/9-4-5.nic/2.nic_detail.js?v=1.0',
            'cat_component_hba': '/static/js/9.category/9-4.component/9-4-6.hba/2.hba_detail.js?v=1.0',
            'cat_component_etc': '/static/js/9.category/9-4.component/9-4-7.etc/2.etc_detail.js?v=1.0',
            'cat_vendor_manufacturer': '/static/js/9.category/9-7.vendor/9-7-1.manufacturer/2.manufacturer_detail.js?v=1.3',
            'cat_vendor_maintenance': '/static/js/9.category/9-7.vendor/9-7-2.maintenance/2.maintenance_detail.js?v=2.1'
        };
        var CAT_TAB_SUFFIXES = ['_detail','_system','_manager','_service','_task','_log','_file',
            '_hardware','_software','_component'];
        var catBase = k;
        for (var si = 0; si < CAT_TAB_SUFFIXES.length; si++) {
            if (k.endsWith(CAT_TAB_SUFFIXES[si])) { catBase = k.slice(0, -CAT_TAB_SUFFIXES[si].length); break; }
        }
        var catDetailJs = CAT_DETAIL_JS[catBase];

        // 공통 변경이력(tab14-log) 스크립트 세트 (SPA 모드에서도 flatpickr 포함)
        var _LOG_SCRIPTS = [
            '/static/vendor/flatpickr/4.6.13/flatpickr.min.js',
            '/static/vendor/flatpickr/4.6.13/l10n/ko.js',
            '/static/js/_detail/tab14-log.js?v=20260310a'
        ];

        // ------------------------------------------------------------------
        // Governance detail tabs
        // ------------------------------------------------------------------
        if (isGovernanceDetailKey(k)) {
            // IP policy
            if (/^gov_ip_policy_/.test(k)) {
                var ipJs = '/static/js/4.governance/4-3.network_policy/4-3-1.ip/2.ip_detail.js?v=4.1';
                if (/_log$/.test(k)) return _LOG_SCRIPTS;
                if (/_file$/.test(k)) return [ipJs, '/static/js/_detail/tab15-file.js?v=1.2'];
                return [ipJs];
            }
            // DNS policy
            if (/^gov_dns_policy_/.test(k)) {
                var dnsJs = '/static/js/4.governance/4-3.network_policy/4-3-2.dns/2.dns_detail.js?v=1.5.0';
                if (/_log$/.test(k)) return _LOG_SCRIPTS;
                if (/_file$/.test(k)) return [dnsJs, '/static/js/_detail/tab15-file.js?v=1.2'];
                return [dnsJs];
            }
            // AD policy
            if (/^gov_ad_policy_/.test(k)) {
                var adJs = '/static/js/4.governance/4-3.network_policy/4-3-3.ad/2.ad_detail.js?v=1.2.9';
                if (/_log$/.test(k)) return [adJs];
                if (/_file$/.test(k)) return ['/static/js/_detail/tab15-file.js?v=1.2'];
                return [adJs];
            }
            // VPN policy (1-5) — 모든 VPN 탭이 vpn1 JS를 공유
            var vpnMatch = k.match(/^gov_vpn_policy(\d?)_/);
            if (vpnMatch) {
                var vpnJs = '/static/js/4.governance/4-4.vpn_policy/4-4-1.vpn/2.vpn_detail.js?v=1.1';
                if (/_manager$/.test(k)) return ['/static/js/_detail/tab42-manager.js?v=1.7'];
                if (/_vpn_policy$/.test(k)) return [vpnJs, '/static/js/ui/searchable_select.js?v=1.1.0', '/static/js/_detail/tab53-vpn-policy.js?v=1.1'];
                if (/_log$/.test(k)) return _LOG_SCRIPTS;
                if (/_file$/.test(k)) return ['/static/js/_detail/tab15-file.js?v=1.2'];
                return [vpnJs];
            }
            // Dedicated line policy — 모든 전용회선 탭이 member JS를 공유
            var dlMatch = k.match(/^gov_dedicatedline_(member|customer|van|affiliate|intranet)_/);
            if (dlMatch) {
                var dlDetailJs = '/static/js/4.governance/4-5.dedicatedline_policy/4-5-1.member/2.member_detail.js?v=1.2';
                var dlHeaderJs = '/static/js/4.governance/4-5.dedicatedline_policy/dedicatedline_header.js?v=1.1';
                if (/_manager$/.test(k)) return ['/static/js/_detail/tab42-manager.js?v=1.7', dlHeaderJs];
                if (/_log$/.test(k)) return [dlHeaderJs, '/static/js/4.governance/4-5.dedicatedline_policy/tab14-leased_line_log.js?v=1.0'];
                if (/_file$/.test(k)) return ['/static/js/_detail/tab15-file.js?v=1.2', dlHeaderJs];
                return [dlDetailJs, dlHeaderJs];
            }
            return [];
        }

        if (catDetailJs) {
            /* vendor-manufacturer hw/sw/comp tabs use shared standalone tab modules */
            if (catBase === 'cat_vendor_manufacturer') {
                if (/_hardware$/.test(k)) return ['/static/js/_detail/tab43-hardware.js?v=3.8'];
                if (/_software$/.test(k)) return ['/static/js/_detail/tab94-software.js?v=1.0'];
                if (/_component$/.test(k)) return ['/static/js/_detail/tab45-component.js?v=3.9'];
            }
            /* vendor-maintenance hw/sw/comp tabs – shared read-only listing */
            if (catBase === 'cat_vendor_maintenance') {
                if (/_hardware$/.test(k)) return ['/static/js/_detail/maint-vendor-assets.js?v=1.1'];
                if (/_software$/.test(k)) return ['/static/js/_detail/tab94-software.js?v=1.0'];
                if (/_component$/.test(k)) return ['/static/js/_detail/maint-vendor-assets.js?v=1.1'];
            }
            /* hw detail – model-based hardware tab */
            if (/^cat_hw_/.test(catBase) && /_hardware$/.test(k)) return ['/static/js/_detail/tab43-hw-model.js?v=1.3', catDetailJs];
            /* sw detail – shared software tab */
            if (/^cat_sw_/.test(catBase) && /_system$/.test(k)) return ['/static/js/_detail/tab94-software.js?v=1.0', catDetailJs];
            /* component detail – model-based component tab */
            if (/^cat_component_/.test(catBase) && /_system$/.test(k)) return ['/static/js/_detail/tab45-comp-model.js?v=1.0', catDetailJs];
            if (/_service$/.test(k)) return ['/static/js/_detail/tab47-service.js?v=2.1', catDetailJs];
            if (/_system$/.test(k)) return ['/static/js/_detail/tab41-system.js?v=1.0', catDetailJs];
            if (/_manager$/.test(k)) return ['/static/js/_detail/tab42-manager.js?v=1.7'];
            if (/_log$/.test(k)) return _LOG_SCRIPTS;
            if (/_file$/.test(k)) return ['/static/js/_detail/tab15-file.js?v=1.2'];
            if (/_component$/.test(k)) return ['/static/js/_detail/tab45-component.js?v=1.0', catDetailJs];
            // detail, task, hardware, software → just the detail JS
            return [catDetailJs];
        }

        return [];
    }

    function dispatchPageLoaded(detail) {
        try { document.dispatchEvent(new CustomEvent('blossom:pageLoaded', { detail })); } catch (_e) {}
        try { document.dispatchEvent(new CustomEvent('blossom:spa:navigated', { detail })); } catch (_e) {}
    }

    // Safety net: strip legacy ?id=... from the visible URL on cost pages.
    // Canonical cost detail URLs contain no identifier; we persist context in session.
    // This helps when the running server didn't redirect yet (dev/hot-reload).
    function stripLegacyIdFromUrl() {
        try {
            const url = new URL(window.location.href);
            const key = currentKey();
            var id = '';
            var paramName = '';

            // Determine the right ID param and context API for this page type
            var contextUrl = '';
            var contextBody = {};
            if (isVendorKey(key)) {
                id = (url.searchParams.get('vendor_id') || url.searchParams.get('id') || '').trim();
                paramName = url.searchParams.has('vendor_id') ? 'vendor_id' : 'id';
                contextUrl = '/api/vendor/detail-context';
                contextBody = { key: key, vendor_id: id };
            } else if (isCategoryKey(key)) {
                // SW typed IDs
                var swParams = ['os_id','db_id','middleware_id','virtual_id','security_id','ha_id','group_id'];
                for (var pi = 0; pi < swParams.length; pi++) {
                    var pv = (url.searchParams.get(swParams[pi]) || '').trim();
                    if (pv) { id = pv; paramName = swParams[pi]; break; }
                }
                if (!id) { id = (url.searchParams.get('id') || '').trim(); paramName = 'id'; }
                contextUrl = '/api/category/detail-context';
                var catTitle = (url.searchParams.get('model') || url.searchParams.get('wc_name') || '').trim();
                var catSubtitle = (url.searchParams.get('vendor') || url.searchParams.get('wc_desc') || '').trim();
                contextBody = { key: key, id: id, title: catTitle, subtitle: catSubtitle };
                // Pass HW extra params if present
                var hwExtras = ['server_code','hw_type','release_date','eosl','qty','note'];
                for (var hi = 0; hi < hwExtras.length; hi++) {
                    var hv = (url.searchParams.get(hwExtras[hi]) || '').trim();
                    if (hv) contextBody[hwExtras[hi]] = hv;
                }
            } else if (isCostKey(key)) {
                id = (url.searchParams.get('id') || '').trim();
                paramName = 'id';
                contextUrl = '/api/cost/detail-context';
                contextBody = { key: key, manage_no: id };
            } else if (isGovernanceDetailKey(key)) {
                // Governance detail pages: IP / VPN / DedicatedLine
                var govIdParams = ['vpn_line_id', 'line_id', 'policy_id', 'id'];
                for (var gi = 0; gi < govIdParams.length; gi++) {
                    var gv = (url.searchParams.get(govIdParams[gi]) || '').trim();
                    if (gv) { id = gv; paramName = govIdParams[gi]; break; }
                }
                if (!id) return;
                contextUrl = '/api/governance/detail-context';
                var govTitle = (url.searchParams.get('org_name') || url.searchParams.get('title') || '').trim();
                var govSubtitle = (url.searchParams.get('protocol') || url.searchParams.get('protocol_code') || url.searchParams.get('subtitle') || '').trim();
                contextBody = { key: key, id: id, title: govTitle, subtitle: govSubtitle };
            }
            if (!id) return;
            if (!isSpaTabKey(key)) return;

            // Try to persist context into server-side session.
            try {
                fetch(contextUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(contextBody),
                    credentials: 'same-origin',
                }).catch(() => {});
            } catch (_e) {}

            // Remove id from URL (keep the same page).
            url.searchParams.delete(paramName);
            try {
                const m = String(url.pathname || '').match(/^\/p\/([^\/]+)/);
                const k = m && m[1] ? m[1] : key;
                url.pathname = `/p/${k}`;
            } catch (_e) {}
            const next = url.pathname + url.search + url.hash;
            history.replaceState(history.state || {}, '', next);
        } catch (_e) {}
    }

    async function navigateTo(href, opts) {
        opts = opts || {};
        const url = parseUrl(href);
        if (!url || !isSameOrigin(url) || !isPRoute(url)) {
            if (typeof window.blsSpaNavigate === 'function') { window.blsSpaNavigate(href); } else { window.location.href = href; }
            return;
        }

        const fromKey = currentKey();
        const toKey = keyFromUrl(url);
        // Only cost / vendor pages (avoid affecting other modules)
        if (!isSpaTabKey(fromKey) && !isSpaTabKey(toKey)) {
            if (typeof window.blsSpaNavigate === 'function') { window.blsSpaNavigate(href); } else { window.location.href = href; }
            return;
        }

        setBusy(true);
        try {
            const fetched = await fetchHtml(url);
            const finalHref = (fetched && fetched.finalUrl) ? fetched.finalUrl : url.toString();
            const doc = parseDoc(fetched && fetched.html ? fetched.html : '');
            if (!doc) throw new Error('parse failed');
            replaceMainAndModals(doc);

            /* lightweight fade-in for swapped content */
            try {
                var newMain = document.querySelector('main.main-content');
                if (newMain) {
                    newMain.classList.add('spa-fade-in');
                    newMain.addEventListener('animationend', function () {
                        newMain.classList.remove('spa-fade-in');
                    }, { once: true });
                }
            } catch (_fe) {}

            var historyState = isCostKey(toKey)
                ? { costTabs: true, href: finalHref }
                : isProjectListKey(toKey)
                ? { projectTabs: true, href: finalHref }
                : isGovernanceDetailKey(toKey)
                ? { governanceTabs: true, href: finalHref }
                : { categoryTabs: true, href: finalHref };
            try {
                if (opts.replace) history.replaceState(historyState, '', finalHref);
                else history.pushState(historyState, '', finalHref);
            } catch (_e) {}

            const scripts = scriptsForKey(toKey);
            if (scripts && scripts.length) {
                /* vendor-manufacturer asset tabs, hw-model hardware tabs, project list tabs,
                   governance detail tabs, and generic detail sub-tabs (system / service / manager)
                   must re-execute every time */
                var reloadEvery = /cat_vendor_(manufacturer|maintenance)_(hardware|software|component)/.test(toKey || '') || /^cat_hw_\w+_hardware$/.test(toKey || '') || isProjectListKey(toKey || '') || isGovernanceDetailKey(toKey || '') || /_(system|service|manager)$/.test(toKey || '') || /^cat_business_group_/.test(toKey || '');
                if (reloadEvery) {
                    for (var ri = 0; ri < scripts.length; ri++) {
                        var rSrc = scripts[ri];
                        var rKey = rSrc.split('#')[0];
                        SCRIPT_CACHE.delete(rKey);
                        try {
                            var rBase = rSrc.split('?')[0];
                            document.querySelectorAll('script[src]').forEach(function (el) {
                                if ((el.getAttribute('src') || '').split('?')[0] === rBase) el.remove();
                            });
                            if (window.__blossomLoadedScripts) window.__blossomLoadedScripts.delete(rBase);
                        } catch (_e) {}
                    }
                }
                await Promise.all(scripts.map(loadScriptOnce));
            }

            dispatchPageLoaded({ href: finalHref, key: toKey, timestamp: Date.now() });
        } catch (e) {
            try { console.warn('[cost-tabs] partial nav failed, fallback', e); } catch (_e) {}
            window.location.href = href;
        } finally {
            setBusy(false);
        }
    }

    function clickHandler(e) {
        // Capture phase: beat other handlers
        try {
            if (!isLeftClick(e) || isModified(e)) return;
            const a = e.target && e.target.closest ? e.target.closest('a.server-detail-tab-btn, .system-tabs a.system-tab-btn') : null;
            if (!a) return;
            const href = a.getAttribute('href');
            if (!href || href.startsWith('#')) return;
            // downloads / new tabs should remain native
            if (a.hasAttribute('download')) return;
            if ((a.getAttribute('target') || '').toLowerCase() === '_blank') return;

            const url = parseUrl(href);
            if (!url || !isSameOrigin(url) || !isPRoute(url)) return;
            const toKey = keyFromUrl(url);
            if (!isSpaTabKey(toKey)) return;

            e.preventDefault();
            navigateTo(href);
        } catch (_e) {}
    }

    function popHandler(ev) {
        try {
            if (ev && ev.state && (ev.state.costTabs || ev.state.vendorTabs || ev.state.categoryTabs || ev.state.projectTabs || ev.state.governanceTabs)) {
                navigateTo(location.pathname + location.search + location.hash, { replace: true });
            }
        } catch (_e) {}
    }

    document.addEventListener('click', clickHandler, true);
    window.addEventListener('popstate', popHandler);

    // Run once on initial load.
    stripLegacyIdFromUrl();
})();

/* §14 ── Tab / Settings Mgmt ───────────────────────────────── */
// 탭 활성화 함수
function activateTab(targetTab) {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    // 모든 탭 버튼에서 active 클래스 제거
    tabButtons.forEach(btn => btn.classList.remove('active'));
    // 모든 탭 패널에서 active 클래스 제거
    tabPanes.forEach(pane => pane.classList.remove('active'));
    
    // 클릭된 버튼에 active 클래스 추가
    const targetButton = document.querySelector(`[data-tab="${targetTab}"]`);
    if (targetButton) {
        targetButton.classList.add('active');
    }
    
    // 해당하는 탭 패널에 active 클래스 추가
    const targetPane = document.getElementById(targetTab);
    if (targetPane) {
        targetPane.classList.add('active');
    }
    
    // 로컬 스토리지에 현재 탭 상태 저장
    localStorage.setItem('activeTab', targetTab);
    
    // 행 개수 업데이트
    updateRowCounts();
}

// 행 개수 업데이트 함수
function updateRowCounts() {
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    tabPanes.forEach(pane => {
        // 보안 페이지용 테이블 구조 확인
        let table = pane.querySelector('.server-data-table tbody');
        let countBadge = pane.querySelector('.count-badge');
        
        // 일반 페이지용 테이블 구조 확인 (기존)
        if (!table) {
            table = pane.querySelector('.data-table tbody');
        }
        
        // Only attempt row counting on panes that actually have a count badge.
        // Many pages (including blog modals) have .tab-pane without any table/count badge.
        if (!countBadge) {
            return;
        }

        if (table && countBadge) {
            const rowCount = table.querySelectorAll('tr').length;
            countBadge.textContent = rowCount;
            console.log('Count badge updated:', countBadge.textContent, 'for', pane.id);
        } else {
            // Keep console quiet: log only when the badge exists but table is missing.
            console.debug('Row count skipped (table missing):', { pane: pane.id, table: !!table });
        }
    });
}



// 아이템 삭제 함수
function deleteItem(type, id) {
    const itemTypes = {
        'os': '운영체제',
        'database': '데이터베이스',
        'middleware': '미들웨어',
        'docker': '도커',
        'kubernetes': '쿠버네티스',
        'access_control': '서버 접근제어',
        'integrity_account': '서버 통합계정',
        'monitoring': '서버 모니터링',
        'security_control': '서버 보안통제',
        'etc': '기타 소프트웨어',
        'cpu': 'CPU',
        'dimm': 'DIMM',
        'disk': 'DISK',
        'gpu': 'GPU',
        'nic': 'NIC',
        'hba': 'HBA',
        'classification': '업무 분류',
        'category': '업무 구분',
        'status': '업무 상태',
        'operation': '업무 운영',
        'group': '업무 그룹',
        'center': '센터',
        'department': '부서',
        'employee': '직원',
        'manufacturer': '제조사',
        'maintenance': '유지보수사',
        'emergency': '비상연락망',
        'customer': '고객사',
        'van': 'VAN사',
        'server': '서버',
        'frame': '프레임'
    };
    
    const itemType = itemTypes[type] || '항목';
    
    if (confirm(`${itemType}을(를) 삭제하시겠습니까?`)) {
        // 실제로는 서버에 삭제 요청을 보내야 함
        console.log(`${type} 항목 ${id} 삭제 요청`);
        
        // 현재 행 제거 (실제 구현에서는 서버 응답 후 처리)
        const trigger = document.querySelector(`[onclick="openEditModal('${type}', ${id})"]`);
        const row = trigger ? trigger.closest('tr') : null;
        if (row) {
            row.remove();
            updateRowCounts(); // 행 개수 업데이트
        }
        
        // 성공 메시지 표시
        showToast(`${itemType}이(가) 삭제되었습니다.`, 'success');
    }
}

/* §15 ── Avatar Picker ─────────────────────────────────────── */
// Simple header avatar picker using known SVG list
function openHeaderAvatarPicker() {
    const svgFiles = [
        '001-boy.svg','002-girl.svg','003-boy.svg','004-girl.svg','005-man.svg','006-girl.svg','007-boy.svg','008-girl.svg','009-boy.svg','010-girl.svg',
        '011-man.svg','012-girl.svg','013-man.svg','014-girl.svg','015-boy.svg','016-girl.svg','017-boy.svg','018-girl.svg','019-boy.svg','020-girl.svg'
    ];
    const base = '/static/image/svg/profil/';

    // Create lightweight modal
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(17,24,39,.5)';
    overlay.style.zIndex = '1100';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const dialog = document.createElement('div');
    dialog.style.background = '#fff';
    dialog.style.borderRadius = '12px';
    dialog.style.padding = '16px';
    dialog.style.width = 'min(560px, 92vw)';
    dialog.style.maxHeight = '80vh';
    dialog.style.overflow = 'auto';
    dialog.style.boxShadow = '0 10px 40px rgba(0,0,0,.2)';

    const title = document.createElement('div');
    title.textContent = '프로필 이미지 선택';
    title.style.fontWeight = '700';
    title.style.marginBottom = '12px';

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(72px, 1fr))';
    grid.style.gap = '12px';

    svgFiles.forEach(name => {
        const item = document.createElement('button');
        item.type = 'button';
        item.style.border = '1px solid #e5e7eb';
        item.style.borderRadius = '10px';
        item.style.padding = '10px';
        item.style.background = '#fff';
        item.style.cursor = 'pointer';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.justifyContent = 'center';
        item.style.transition = 'box-shadow .15s, transform .05s';
        item.onmouseenter = () => item.style.boxShadow = '0 6px 16px rgba(0,0,0,.08)';
        item.onmouseleave = () => item.style.boxShadow = 'none';
        item.onmousedown = () => item.style.transform = 'scale(.98)';
        item.onmouseup = () => item.style.transform = 'none';

        const img = document.createElement('img');
        img.src = base + name;
        img.alt = name;
        img.style.width = '48px';
        img.style.height = '48px';
        grid.appendChild(item);
        item.appendChild(img);

        item.addEventListener('click', () => {
            const src = img.src;
            let empNo = '';
            try {
                const btn = document.querySelector('#btn-account');
                empNo = (btn && typeof btn.getAttribute === 'function' ? (btn.getAttribute('data-emp-no') || '') : '');
                empNo = String(empNo || '').trim();
            } catch (_e) {
                empNo = '';
            }
            // 헤더 이미지 업데이트 (fallback으로 #btn-account img 지원)
            let headerImg = document.querySelector('#btn-account .header-avatar-icon');
            if (!headerImg) headerImg = document.querySelector('#btn-account img');
            if (headerImg) {
                headerImg.src = src;
                headerImg.classList.add('header-avatar-icon');
            }
            // 프로필 페이지 아바타 배경 반영
            const profileAvatar = document.querySelector('.admin-page .avatar');
            if (profileAvatar) {
                profileAvatar.style.backgroundImage = `url('${src}')`;
            }
            // 저장/동기화: 현재 접속 사용자(emp_no)에만 반영
            try {
                window.dispatchEvent(new CustomEvent('blossom:avatarChanged', {
                    detail: { src, empNo: empNo || null }
                }));
            } catch (_e) {}

            document.body.removeChild(overlay);
        });
    });

    const footer = document.createElement('div');
    footer.style.marginTop = '12px';
    footer.style.textAlign = 'right';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '닫기';
    closeBtn.style.height = '32px';
    closeBtn.style.padding = '0 12px';
    closeBtn.style.borderRadius = '8px';
    closeBtn.style.border = '1px solid #e5e7eb';
    closeBtn.style.background = '#fff';
    closeBtn.addEventListener('click', () => document.body.removeChild(overlay));

    dialog.appendChild(title);
    dialog.appendChild(grid);
    footer.appendChild(closeBtn);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) document.body.removeChild(overlay); });
    document.body.appendChild(overlay);
}

/* §16 ── Session Exit ──────────────────────────────────────── */
function exitProcess(id) {
    const currentTime = new Date().toLocaleTimeString('ko-KR', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    if (confirm(`퇴실 시간을 ${currentTime}으로 기록하시겠습니까?`)) {
        // 실제 퇴실 처리 로직 구현
        showToast(`퇴실이 기록되었습니다. (${currentTime})`, 'success');
        
        // 해당 행을 출입처리 테이블에서 제거하고 출입기록으로 이동
        const processRow = document.querySelector(`#process-table-body tr[data-id="${id}"]`);
        if (processRow) {
            processRow.remove();
            updateRowCounts();
        }
    }
}

// 모달 외부 클릭 시 닫기
document.addEventListener('DOMContentLoaded', () => {
    const modals = document.querySelectorAll('.modal');
    
    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    });
    
    // ESC 키로 모달 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            modals.forEach(modal => {
                if (modal.classList.contains('show')) {
                    modal.classList.remove('show');
                }
            });
        }
    });
    

});

/* §17 ── Pagination ────────────────────────────────────────── */
// 페이지네이션 상태 관리
const paginationState = {
    hardware: { currentPage: 1, pageSize: 10, totalItems: 0 },
    software: { currentPage: 1, pageSize: 10, totalItems: 0 },
    etc: { currentPage: 1, pageSize: 10, totalItems: 0 }
};

// 페이지 크기 변경 함수
function changePageSize(type) {
    if (!paginationState[type]) return; // guard for pages that don't use generic pagination
    const select = document.getElementById(`${type}-page-size`);
    const newPageSize = parseInt(select.value);
    
    paginationState[type].pageSize = newPageSize;
    paginationState[type].currentPage = 1; // 첫 페이지로 리셋
    
    updatePagination(type);
    showToast(`${newPageSize}개씩 보기로 변경되었습니다.`, 'info');
}

// 페이지 이동 함수
function goToPage(type, action) {
    if (!paginationState[type]) return; // guard for pages that don't use generic pagination
    const state = paginationState[type];
    const totalPages = Math.ceil(state.totalItems / state.pageSize);
    
    switch (action) {
        case 'first':
            state.currentPage = 1;
            break;
        case 'prev':
            if (state.currentPage > 1) {
                state.currentPage--;
            }
            break;
        case 'next':
            if (state.currentPage < totalPages) {
                state.currentPage++;
            }
            break;
        case 'last':
            state.currentPage = totalPages;
            break;
        default:
            state.currentPage = parseInt(action);
    }
    
    updatePagination(type);
}

// 페이지네이션 업데이트 함수
function updatePagination(type) {
    const state = paginationState[type];
    if (!state) return; // safely ignore unknown types like 'physical', 'frame' on software pages
    const tableBody = document.getElementById(`${type}-table-body`);
    const paginationInfo = document.getElementById(`${type}-pagination-info`);
    const paginationControls = document.querySelector(`#${type} .pagination-controls`);
    
    if (!tableBody || !paginationInfo || !paginationControls) return;
    
    // 전체 행 수 계산 (실제로는 서버에서 가져와야 함)
    const allRows = Array.from(tableBody.querySelectorAll('tr'));
    state.totalItems = allRows.length;
    
    const totalPages = Math.ceil(state.totalItems / state.pageSize);
    const startIndex = (state.currentPage - 1) * state.pageSize;
    const endIndex = Math.min(startIndex + state.pageSize, state.totalItems);
    
    // 행 표시/숨김 처리
    allRows.forEach((row, index) => {
        if (index >= startIndex && index < endIndex) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
    
    // 페이지네이션 정보 업데이트
    paginationInfo.textContent = `${startIndex + 1}-${endIndex} / ${state.totalItems}개 항목`;
    
    // 페이지네이션 버튼 업데이트
    updatePaginationButtons(type, state.currentPage, totalPages);
}

// 페이지네이션 버튼 업데이트 함수
function updatePaginationButtons(type, currentPage, totalPages) {
    const paginationControls = document.querySelector(`#${type} .pagination-controls`);
    if (!paginationControls) return;
    
    const buttons = paginationControls.querySelectorAll('.pagination-btn');
    const [firstBtn, prevBtn, pageBtn, nextBtn, lastBtn] = buttons;
    
    // 첫 페이지, 이전 버튼 활성화/비활성화
    firstBtn.disabled = currentPage === 1;
    prevBtn.disabled = currentPage === 1;
    
    // 다음, 마지막 버튼 활성화/비활성화
    nextBtn.disabled = currentPage === totalPages;
    lastBtn.disabled = currentPage === totalPages;
    
    // 페이지 번호 버튼 업데이트
    pageBtn.textContent = currentPage;
    pageBtn.classList.toggle('active', true);
}

/* §18 ── CSV Download ──────────────────────────────────────── */
// CSV 다운로드 함수
function downloadCSV(type) {
    const tableBody = document.getElementById(`${type}-table-body`);
    if (!tableBody) return;
    
    const rows = Array.from(tableBody.querySelectorAll('tr'));
    const headers = getTableHeaders(type);
    
    let csvContent = '\uFEFF'; // BOM for Korean characters
    csvContent += headers.join(',') + '\n';
    
    rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        const rowData = cells.map(cell => {
            // 액션 버튼 컬럼 제외
            if (cell.querySelector('.action-buttons')) {
                return '';
            }
            // 텍스트 내용 추출
            const text = cell.textContent.trim();
            // 쉼표가 포함된 경우 따옴표로 감싸기
            return text.includes(',') ? `"${text}"` : text;
        }).filter(text => text !== ''); // 빈 셀 제거
        
        csvContent += rowData.join(',') + '\n';
    });
    
    // 파일 다운로드
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${type}_contracts_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('CSV 파일이 다운로드되었습니다.', 'success');
}

// 정렬 상태 관리
let sortState = {
    hardware: { column: null, direction: null },
    software: { column: null, direction: null },
    etc: { column: null, direction: null },
    range: { column: null, direction: null },
    role: { column: null, direction: null },
    server: { column: null, direction: null },
    frame: { column: null, direction: null }
};

/* §19 ── Selection & Sort ──────────────────────────────────── */
// 체크박스 토글 함수
function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAll');
    const rowCheckboxes = document.querySelectorAll('#server-table-body .row-checkbox');
    
    rowCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });
}

function updateSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAll');
    const rowCheckboxes = document.querySelectorAll('#server-table-body .row-checkbox');
    const checkedBoxes = document.querySelectorAll('#server-table-body .row-checkbox:checked');
    
    if (checkedBoxes.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else if (checkedBoxes.length === rowCheckboxes.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    }
}

// 토글 선택 함수
function toggleSelection(element, category) {
    // 토글 상태 변경
    if (element.classList.contains('selected')) {
        element.classList.remove('selected');
        showToast(`${category}: ${element.textContent} 해제됨`, 'info');
    } else {
        element.classList.add('selected');
        showToast(`${category}: ${element.textContent} 선택됨`, 'info');
    }
}

// 테이블 정렬 함수
function sortTable(type, column) {
    const tbody = document.getElementById(`${type}-table-body`);
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    // 정렬 방향 결정
    if (sortState[type].column === column) {
        // 같은 컬럼을 다시 클릭한 경우 방향 전환
        sortState[type].direction = sortState[type].direction === 'asc' ? 'desc' : 'asc';
    } else {
        // 새로운 컬럼을 클릭한 경우 내림차순으로 시작
        sortState[type].column = column;
        sortState[type].direction = 'desc';
    }
    
    // 정렬 실행
    rows.sort((a, b) => {
        const aValue = getCellValue(a, column);
        const bValue = getCellValue(b, column);
        
        let comparison = 0;
        
        // 숫자 정렬 (계약금액, 계약수량)
        if (column === 'contractAmount') {
            const aNum = parseFloat(aValue.replace(/[^\d]/g, ''));
            const bNum = parseFloat(bValue.replace(/[^\d]/g, ''));
            comparison = aNum - bNum;
        } else if (column === 'contractQuantity') {
            const aNum = parseFloat(aValue.replace(/[^\d]/g, ''));
            const bNum = parseFloat(bValue.replace(/[^\d]/g, ''));
            comparison = aNum - bNum;
        } else if (column === 'date') {
            // 날짜 정렬
            const aDate = new Date(aValue);
            const bDate = new Date(bValue);
            comparison = aDate - bDate;
        } else if (column === 'entryTime' || column === 'exitTime') {
            // 시간 정렬
            const aTime = aValue.replace(':', '');
            const bTime = bValue.replace(':', '');
            comparison = parseInt(aTime) - parseInt(bTime);
        } else if (column === 'ipRange') {
            // IP 범위 숫자 정렬
            const aNum = parseInt(aValue);
            const bNum = parseInt(bValue);
            comparison = aNum - bNum;
        } else if (column === 'status') {
            // 상태 정렬 (활성 > 비활성)
            const aStatus = aValue === '활성' ? 1 : 0;
            const bStatus = bValue === '활성' ? 1 : 0;
            comparison = aStatus - bStatus;
        } else {
            // 문자열 정렬
            comparison = aValue.localeCompare(bValue, 'ko');
        }
        
        return sortState[type].direction === 'asc' ? comparison : -comparison;
    });
    
    // 테이블 재구성
    rows.forEach(row => tbody.appendChild(row));
    
    // 정렬 아이콘 업데이트
    updateSortIcons(type, column);
    
    // 페이지네이션 업데이트
    updatePagination(type);
}

// 셀 값 추출 함수
function getCellValue(row, column) {
    const cellIndex = {
        'contractNumber': 0,
        'maintenanceCompany': 1,
        'contractName': 2,
        'contractAmount': 3,
        'contractQuantity': 4,
        'contractStatus': 5,
        // 출입관리 테이블 컬럼 인덱스
        'date': 0,
        'department': 1,
        'name': 2,
        'purpose': 3,
        'location': 4,
        'manager': 5,
        'entryTime': 6,
        'exitTime': 7,
        // IP 범위 테이블 컬럼 인덱스
        'startAddress': 0,
        'endAddress': 1,
        'ipRange': 2,
        'status': 3,
        'role': 4,
        'note': 5
    };
    
    const cell = row.cells[cellIndex[column]];
    if (!cell) return '';
    
    // span 태그가 있으면 그 내용을, 없으면 직접 텍스트를 반환
    const span = cell.querySelector('span');
    return span ? span.textContent.trim() : cell.textContent.trim();
}

// 정렬 아이콘 업데이트 함수
function updateSortIcons(type, column) {
    const table = document.querySelector(`#${type} .data-table`);
    const headers = table.querySelectorAll('th.sortable');
    
    headers.forEach(header => {
        header.classList.remove('asc', 'desc');
    });
    
    if (sortState[type].column === column) {
        const activeHeader = table.querySelector(`th[onclick*="${column}"]`);
        if (activeHeader) {
            activeHeader.classList.add(sortState[type].direction);
        }
    }
}

// 테이블 헤더 가져오기 함수
function getTableHeaders(type) {
    const headers = {
        hardware: ['계약번호', '유지보수사', '계약명', '계약금액', '계약수량', '계약상태'],
        software: ['계약번호', '유지보수사', '계약명', '계약금액', '계약수량', '계약상태'],
        etc: ['계약번호', '유지보수사', '계약명', '계약금액', '계약수량', '계약상태'],
        process: ['일자', '소속', '이름', '방문목적', '방문장소', '담당자', '입실시간', '퇴실시간'],
        record: ['일자', '소속', '이름', '방문목적', '방문장소', '담당자', '입실시간', '퇴실시간'],
        server: ['업무 분류', '업무 구분', '업무 상태', '업무 운영', '업무 그룹', '업무 이름', '시스템 이름', '시스템 IP', '관리 IP', '시스템 제조사', '시스템 모델명', '시스템 일련번호', '시스템 가상화', '시스템 장소', '시스템 위치', '시스템 슬롯', '시스템 크기', '시스템 담당부서', '시스템 담당자', '서비스 담당부서', '서비스 담당자', '핵심/일반', '시스템 등급', 'DR 구축여부', '전원 이중화', '서비스 이중화'],
        frame: ['프레임 정보']
    };
    
    return headers[type] || [];
}

// 출입기록 필터링 함수
function filterRecords() {
    const dateFrom = document.getElementById('record-date-from').value;
    const dateTo = document.getElementById('record-date-to').value;
    const location = document.getElementById('record-location').value;
    
    const tbody = document.getElementById('record-table-body');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    rows.forEach(row => {
        const dateCell = row.cells[0].textContent.trim();
        const locationCell = row.cells[4].textContent.trim();
        
        let showRow = true;
        
        // 날짜 필터링
        if (dateFrom && dateCell < dateFrom) {
            showRow = false;
        }
        if (dateTo && dateCell > dateTo) {
            showRow = false;
        }
        
        // 장소 필터링
        if (location && locationCell !== location) {
            showRow = false;
        }
        
        // 행 표시/숨김 처리
        row.style.display = showRow ? '' : 'none';
    });
    
    // 필터링된 행 수 업데이트
    const visibleRows = rows.filter(row => row.style.display !== 'none');
    const countBadge = document.querySelector('#record .count-badge');
    if (countBadge) {
        countBadge.textContent = visibleRows.length;
    }
    
    // 페이지네이션 업데이트
    updatePagination('record');
}

// 상태 토글 기능
        function toggleStatus(id, currentStatus) {
            const statusOptions = ['예약', '활성', '계획'];
            const currentIndex = statusOptions.indexOf(currentStatus);
            const nextIndex = (currentIndex + 1) % statusOptions.length;
            const newStatus = statusOptions[nextIndex];
            
            // 상태 클래스 매핑
            const statusClasses = {
                '예약': 'reserved',
                '활성': 'active',
                '계획': 'planned'
            };
    
    // 모든 테이블에서 해당 ID의 행을 찾아 상태 업데이트
    const tables = ['rack-table-body', 'floor-table-body'];
    tables.forEach(tableId => {
        const tableBody = document.getElementById(tableId);
        if (tableBody) {
            const row = tableBody.querySelector(`tr[data-id="${id}"]`);
            if (row) {
                const statusBadge = row.querySelector('.status-badge');
                if (statusBadge) {
                    statusBadge.className = `status-badge ${statusClasses[newStatus]}`;
                    statusBadge.textContent = newStatus;
                    statusBadge.setAttribute('onclick', `toggleStatus(${id}, '${newStatus}')`);
                }
            }
        }
    });
    
    // 성공 메시지 표시
    showToast(`상태가 "${newStatus}"로 변경되었습니다.`, 'success');
}

// 페이지 로드 시 페이지네이션 초기화 추가
document.addEventListener('DOMContentLoaded', () => {
    // 기존 초기화 코드는 그대로 유지하고 페이지네이션만 추가
    setTimeout(() => {
        // 서버 페이지인지 확인
        const isServerPage = document.querySelector('.server-tabs');
        
        if (isServerPage) {
            // 서버 페이지에서는 physical과 frame 탭만 초기화
            ['physical', 'frame'].forEach(type => {
                updatePagination(type);
            });
        } else {
            // 다른 페이지에서는 기존 타입들 초기화
            ['hardware', 'software', 'etc', 'process', 'record', 'rack', 'floor'].forEach(type => {
                updatePagination(type);
            });
        }
    }, 100);
});

// 컬럼 선택 관련 전역 변수
let currentColumnSelection = {
    server: {
        '업무 그룹': true,
        '업무 이름': true,
        '시스템 이름': true,
        '시스템 제조사': true,
        '시스템 모델명': true,
        '시스템 일련번호': true,
        '시스템 장소': true,
        '시스템 위치': true,
        '관리': true,
        '업무 분류': false,
        '업무 구분': false,
        '업무 상태': false,
        '업무 운영': false,
        '시스템 IP': false,
        '관리 IP': false,
        '시스템 가상화': false,
        '시스템 슬롯': false,
        '시스템 크기': false,
        '시스템 담당부서': false,
        '시스템 담당자': false,
        '서비스 담당부서': false,
        '서비스 담당자': false,
        '핵심/일반': false,
        '시스템 등급': false,
        'DR 구축여부': false,
        '전원 이중화': false,
        '서비스 이중화': false
    }
};

/* §20 ── Column Selection ──────────────────────────────────── */
// 서버 테이블의 컬럼 순서 정의
const serverColumnOrder = [
    '선택', '업무 분류', '업무 구분', '업무 상태', '업무 운영', '업무 그룹', 
    '업무 이름', '시스템 이름', '시스템 IP', '관리 IP', '시스템 제조사', '시스템 모델명', 
    '시스템 일련번호', '시스템 가상화', '시스템 장소', '시스템 위치', '시스템 슬롯', 
    '시스템 크기', '시스템 담당부서', '시스템 담당자', '서비스 담당부서', '서비스 담당자', 
    '핵심/일반', '시스템 등급', 'DR 구축여부', '전원 이중화', '서비스 이중화', '관리'
];

// 컬럼 선택 모달 열기
function openColumnSelectModal(type) {
    const modal = document.getElementById('columnSelectModal');
    if (!modal) return;
    
    // 현재 선택 상태를 체크박스에 반영
    const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        const columnName = checkbox.id.replace('col-', '');
        if (currentColumnSelection[type] && currentColumnSelection[type].hasOwnProperty(columnName)) {
            checkbox.checked = currentColumnSelection[type][columnName];
        }
    });
    
    // 체크박스 상태에 따라 컨테이너 클래스 업데이트
    updateColumnCheckboxStates();
    
    modal.classList.add('show');
}

// 컬럼 선택 모달 닫기
function closeColumnSelectModal() {
    const modal = document.getElementById('columnSelectModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// 체크박스 상태에 따라 컨테이너 클래스 업데이트
function updateColumnCheckboxStates() {
    const checkboxes = document.querySelectorAll('#columnSelectModal input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        const container = checkbox.closest('.column-checkbox');
        if (checkbox.checked) {
            container.classList.add('selected');
        } else {
            container.classList.remove('selected');
        }
    });
}

/* =====================
   Software: Column select (license key)
   Provides a lightweight modal and persistence for showing the optional
   "라이선스 키" column across software list pages.
===================== */
(function() {
    function stateKey() {
        // Persist per path to isolate pages
        return 'software:licenseKey:show:' + window.location.pathname;
    }

    function getContainer() {
        return document.querySelector('.server-table-container');
    }

    function setLicenseKeyVisible(visible) {
        const container = getContainer();
        if (!container) return;
        if (visible) container.classList.add('show-license-key');
        else container.classList.remove('show-license-key');
        try { localStorage.setItem(stateKey(), visible ? '1' : '0'); } catch(_) {}
    }

    function getPersisted() {
        try { return localStorage.getItem(stateKey()) === '1'; } catch(_) { return false; }
    }

    // Expose handlers so templates can invoke them
    window.openServerColumnSelectModal = function(/*tabName*/) {
        const modal = document.getElementById('server-column-select-modal');
        if (!modal) return;
        // Reflect current state into checkbox
        const cb = document.getElementById('sw-col-license-key');
        if (cb) {
            const container = getContainer();
            const isVisible = container ? container.classList.contains('show-license-key') : getPersisted();
            cb.checked = !!isVisible;
        }
        document.body.classList.add('modal-open');
        modal.style.display = 'flex';
        modal.classList.add('show');
    };

    window.applyServerColumnSelection = function() {
        const cb = document.getElementById('sw-col-license-key');
        const wantVisible = cb ? !!cb.checked : false;
        setLicenseKeyVisible(wantVisible);
        window.closeServerColumnSelectModal();
    };

    window.closeServerColumnSelectModal = function() {
        const modal = document.getElementById('server-column-select-modal');
        if (!modal) return;
        modal.classList.remove('show');
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
    };

    // On load, apply persisted visibility
    document.addEventListener('DOMContentLoaded', function() {
        const show = getPersisted();
        if (show) setLicenseKeyVisible(true);
    });
})();

/* ══════════════════════════════════════════════════════════════
   세션 하트비트 — 30초마다 세션 유효성 확인, 만료 시 로그인 페이지 이동
   ══════════════════════════════════════════════════════════════ */
(function(){
    'use strict';
    var INTERVAL = 30000;  // 30초
    var _timer = null;
    var _isLoginPage = /\/login\b/.test(window.location.pathname);
    if (_isLoginPage) return;  // 로그인 페이지에서는 동작하지 않음

    function checkSession() {
        fetch('/api/session/heartbeat', {
            method: 'GET',
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        }).then(function(res) {
            if (res.status === 401 || (res.redirected && /\/login\b/.test(res.url))) {
                clearInterval(_timer);
                alert('세션이 종료되었습니다. 다시 로그인 해주세요.');
                window.location.href = '/login';
            }
        }).catch(function() {
            // 네트워크 오류는 무시 (일시적 장애 가능)
        });
    }

    _timer = setInterval(checkSession, INTERVAL);
    // 첫 번째 체크는 5초 후 (페이지 로딩 직후 부하 방지)
    setTimeout(checkSession, 5000);
})();

// Standardize software column-select chips: remove legacy inline onclick handlers
// Some templates still render chips with onclick="toggleColumnCheckbox(this)".
// This conflicts with the delegated handlers defined in per-page JS (double toggle).
// Strip the inline handler once on load so only delegated logic runs.
document.addEventListener('DOMContentLoaded', function() {
    // Limit to software pages so we don't affect hardware pages still using inline handlers
    if (!/\/3\.software\//.test(window.location.pathname)) return;
    try {
        const modal = document.getElementById('server-column-select-modal');
        if (!modal) return;
        const chipsWithInline = modal.querySelectorAll('.column-checkbox[onclick]');
        chipsWithInline.forEach(chip => chip.removeAttribute('onclick'));
    } catch (_) {
        // no-op
    }
});

// 컬럼 선택 적용
function applyColumnSelection() {
    const modal = document.getElementById('columnSelectModal');
    const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
    
    // 현재 활성화된 탭 확인
    const activeTab = document.querySelector('.tab-pane.active');
    const type = activeTab.id;
    
    // 선택 상태 저장
    checkboxes.forEach(checkbox => {
        const columnName = checkbox.id.replace('col-', '');
        if (!currentColumnSelection[type]) {
            currentColumnSelection[type] = {};
        }
        currentColumnSelection[type][columnName] = checkbox.checked;
    });
    
    // 테이블 컬럼 표시/숨김 처리
    updateTableColumns(type);
    
    // 테이블 너비 재조정
    adjustTableWidth(type);
    
    // 모달 닫기
    closeColumnSelectModal();
    
    // 성공 메시지 표시
    showToast('컬럼 선택이 적용되었습니다.', 'success');
}

// 테이블 컬럼 표시/숨김 처리
function updateTableColumns(type) {
    const table = document.querySelector(`#${type} .data-table`);
    if (!table) return;
    
    const headers = table.querySelectorAll('th');
    const rows = table.querySelectorAll('tbody tr');
    
    // 컬럼 순서에 따라 각 컬럼의 표시 여부 결정
    serverColumnOrder.forEach((columnName, index) => {
        let shouldShow = false;
        
        // 체크박스 컬럼은 항상 표시
        if (columnName === '선택') {
            shouldShow = true;
        } else if (currentColumnSelection[type] && currentColumnSelection[type].hasOwnProperty(columnName)) {
            shouldShow = currentColumnSelection[type][columnName];
        }
        
        // 해당 인덱스의 헤더와 셀들 표시/숨김
        if (headers[index]) {
            headers[index].style.display = shouldShow ? '' : 'none';
            rows.forEach(row => {
                const cell = row.cells[index];
                if (cell) {
                    cell.style.display = shouldShow ? '' : 'none';
                }
            });
        }
    });
}

// 테이블 너비 동적 조정
function adjustTableWidth(type) {
    const table = document.querySelector(`#${type} .data-table`);
    if (!table) return;
    
    // 표시된 컬럼 수 계산
    const visibleColumns = serverColumnOrder.filter((columnName, index) => {
        if (columnName === '선택') return true;
        return currentColumnSelection[type] && currentColumnSelection[type][columnName];
    }).length;
    
    // 컬럼 수에 따라 테이블 너비 조정
    if (visibleColumns <= 9) {
        table.style.minWidth = '1150px';
        table.style.maxWidth = '1350px';
    } else if (visibleColumns <= 15) {
        table.style.minWidth = '1550px';
        table.style.maxWidth = '1750px';
    } else {
        table.style.minWidth = '1950px';
        table.style.maxWidth = 'none';
    }
}

// 컬럼 선택 초기화
function resetColumnSelection() {
    const modal = document.getElementById('columnSelectModal');
    const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
    
    // 기본 컬럼만 체크
    const defaultColumns = [
        '업무 그룹', '업무 이름', '시스템 이름', '시스템 제조사', '시스템 모델명', 
        '시스템 일련번호', '시스템 장소', '시스템 위치', '관리'
    ];
    
    checkboxes.forEach(checkbox => {
        const columnName = checkbox.id.replace('col-', '');
        checkbox.checked = defaultColumns.includes(columnName);
    });
    
    // 체크박스 상태 업데이트
    updateColumnCheckboxStates();
}

// 체크박스 클릭 이벤트 리스너 추가
document.addEventListener('DOMContentLoaded', () => {
    // 기존 초기화 코드는 그대로 유지
    setTimeout(() => {
        // 서버 페이지인지 확인
        const isServerPage = document.querySelector('.server-tabs');
        
        if (isServerPage) {
            // 서버 페이지에서는 physical과 frame 탭만 업데이트
            ['physical', 'frame'].forEach(type => {
                if (paginationState[type]) {
                    updatePagination(type);
                }
            });
        } else {
            // 다른 페이지에서는 기존 타입들 업데이트
            ['hardware', 'software', 'etc'].forEach(type => {
                if (paginationState[type]) {
                    updatePagination(type);
                }
            });
        }
    }, 100);
    
    // 서버 테이블 초기 컬럼 상태 적용 (서버 페이지에서만 실행)
    if (document.querySelector('.server-tabs')) {
        setTimeout(() => {
            // 기본 컬럼 상태 강제 적용
            if (currentColumnSelection.server) {
                // 모든 컬럼을 false로 초기화
                Object.keys(currentColumnSelection.server).forEach(key => {
                    currentColumnSelection.server[key] = false;
                });
                
                // 기본 컬럼만 true로 설정
                const defaultColumns = [
                    '업무 그룹', '업무 이름', '시스템 이름', '시스템 제조사', '시스템 모델명', 
                    '시스템 일련번호', '시스템 장소', '시스템 위치', '관리'
                ];
                
                defaultColumns.forEach(column => {
                    if (currentColumnSelection.server.hasOwnProperty(column)) {
                        currentColumnSelection.server[column] = true;
                    }
                });
            }
            
            updateTableColumns('server');
            adjustTableWidth('server');
        }, 500);
    }
    
    // 컬럼 선택 체크박스 이벤트 리스너는 각 페이지에서 개별 처리
});

/* §21 ── Count Badge Utils ─────────────────────────────────── */
// 공통 카운터 업데이트 함수
function updateCountBadgeUniversal(badgeElement, count) {
    if (!badgeElement) return;
    
    // 숫자 크기에 따라 CSS 클래스 적용
    badgeElement.classList.remove('large-number', 'very-large-number');
    
    if (count >= 10000) {
        badgeElement.classList.add('very-large-number');
    } else if (count >= 1000) {
        badgeElement.classList.add('large-number');
    }
    
    // 1000 이상일 때 K 단위로 표시
    if (count >= 1000) {
        const kCount = (count / 1000).toFixed(1);
        // 소수점이 .0인 경우 정수로 표시
        const displayCount = kCount.endsWith('.0') ? kCount.slice(0, -2) : kCount;
        badgeElement.textContent = `${displayCount}K`;
        badgeElement.title = `${count.toLocaleString()}개`;
    } else {
        badgeElement.textContent = count;
        badgeElement.title = `${count}개`;
    }
}

// 카운터 배지 요소를 찾아서 업데이트하는 헬퍼 함수
function updateCountBadgeById(badgeId, count) {
    const badgeElement = document.getElementById(badgeId);
    if (badgeElement) {
        updateCountBadgeUniversal(badgeElement, count);
    }
}

// 모든 count-badge 클래스를 가진 요소를 찾아서 업데이트하는 함수
function updateAllCountBadges() {
    const countBadges = document.querySelectorAll('.count-badge');
    countBadges.forEach(badge => {
        const currentText = badge.textContent;
        const count = parseInt(currentText) || 0;
        updateCountBadgeUniversal(badge, count);
    });
}

// toggle-badge 클릭 이벤트 처리 함수
function initializeToggleBadges() {
    // 모든 toggle-badge에 동일한 동작 적용 (선택 상태만 토글)
    const allToggleBadges = document.querySelectorAll('.toggle-badge');
    allToggleBadges.forEach(badge => {
        badge.style.cursor = 'pointer';
        badge.addEventListener('click', function() {
            // 기본 토글 동작 (선택/해제)
            this.classList.toggle('selected');

            // 특정 카테고리에 따른 추가 로그 (있을 경우)
            const category = this.getAttribute('data-business-classification') || 
                           this.getAttribute('data-business-type') || 
                           this.getAttribute('data-business-status') || 
                           this.getAttribute('data-business-operation') || 
                           this.getAttribute('data-business-group') || 
                           this.getAttribute('data-manufacturer') || 
                           this.getAttribute('data-location') || 
                           this.getAttribute('data-system-department') || 
                           this.getAttribute('data-service-department') || 
                           this.getAttribute('data-importance') || 
                           this.getAttribute('data-grade') || 
                           this.getAttribute('data-dr-built') || 
                           this.getAttribute('data-power-redundancy') || 
                           this.getAttribute('data-service-redundancy');

            if (category) {
                console.log(`${category} 카테고리가 토글되었습니다.`);
            }
        });
    });
}

// 페이지 로드 시 toggle-badge 초기화
document.addEventListener('DOMContentLoaded', () => {
    initializeToggleBadges();
});

/* §22 ── Terms Page ────────────────────────────────────────── */
/* =====================
   Terms page behaviors (no inline scripts in HTML)
   - Enable/disable "확인" button based on consent
   - Navigate to sign-in on confirm
   - Support keyboard up/down scrolling inside terms box
===================== */
document.addEventListener('DOMContentLoaded', function(){
    const isTermsPage = document.body && document.body.classList.contains('page-auth-terms');
    if (!isTermsPage) return;

    const agree = document.getElementById('terms_agree');
    const ok = document.getElementById('terms-ok');
    const scroller = document.querySelector('.terms-scroll');

    // Keep the confirm button state in sync with the consent checkbox
    function syncConsent(){
        if (ok && agree) ok.disabled = !agree.checked;
    }
    if (agree) agree.addEventListener('change', syncConsent);
    syncConsent();

    // Confirm: go to sign-in page
    if (ok) {
        ok.addEventListener('click', function(){
            window.location.href = '/app/templates/authentication/11-2.basic/sign-in.html';
        });
    }

    // 약관 박스 자체 스크롤 비활성: 기본 브라우저 동작(오른쪽 패널 스크롤)만 허용
    // 의도적으로 별도 wheel/touch 인터셉트 로직을 두지 않습니다.

    // Inject a footer dynamically (HTML 파일 직접 수정 금지 조건 충족)
    // Footer is fixed within the terms area width (30%) and revealed near the bottom of the window scroll
    (function injectDynamicFooter(){
        // Avoid duplicate
        if (document.querySelector('.terms-footer')) return;
        const footer = document.createElement('div');
        footer.className = 'terms-footer';
        footer.innerHTML = '<div class="terms-footer-inner" style="padding:10px 14px; font-size:11px; color:#94a3b8; text-align:center; border-top:1px solid #eef2f7; background:#ffffff;">2025-2026 © BLOSSOM PROJECT</div>';
        document.body.appendChild(footer);

        const revealThreshold = 120; // px from bottom of window scroll to start reveal
        function updateFooterVisibility(){
            const doc = document.documentElement;
            const maxScroll = doc.scrollHeight - window.innerHeight;
            const current = window.scrollY || doc.scrollTop || 0;
            if (maxScroll - current <= revealThreshold) {
                footer.classList.add('show');
            } else {
                footer.classList.remove('show');
            }
        }
        window.addEventListener('scroll', updateFooterVisibility, { passive:true });
        window.addEventListener('resize', updateFooterVisibility, { passive:true });
        // Initial state
        updateFooterVisibility();
    })();

    // 강제 좌우 스크롤 방지 (안전장치)
    (function preventHorizontalScroll(){
        try {
            document.documentElement.style.overflowX = 'hidden';
            document.body.style.overflowX = 'hidden';
            // Allow normal page vertical scrolling so the scrollbar stays at the far right edge of the screen
            document.documentElement.style.overflowY = '';
            document.body.style.overflowY = '';
        } catch(_) {}
    })();
});

// Load shared searchable-select enhancer (hardware-style dropdown with search).
// Safe to load globally: it only enhances modal <select> controls.
/* §23 ── Searchable Select ─────────────────────────────────── */
(function ensureSearchableSelectHelper(){
    try {
        // If another page bundle already provided the helper (e.g. DNS detail JS), don't inject again.
        if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') return;
        if (document.querySelector('script[src*="/static/js/ui/searchable_select.js?v=1.1.0"]')) return;
        const script = document.createElement('script');
        script.src = '/static/js/ui/searchable_select.js?v=1.1.0';
        script.defer = true;
        document.head.appendChild(script);
    } catch (_) {
        // ignore
    }
})();

/* §24 ── Required Field UX ─────────────────────────────────── */
// Global required-field UX for category modals:
// - On save click, if invalid: add show-required-errors so CSS highlights missing fields.
// - On modal open: clear previous show-required-errors state for a clean start.
(function setupGlobalRequiredFieldHighlighting(){
    const SAVE_BUTTON_IDS = new Set(['system-add-save', 'system-edit-save']);

    function isModalOpen(modal){
        if (!modal) return false;
        try {
            if (modal.classList && modal.classList.contains('show')) return true;
            const ariaHidden = modal.getAttribute('aria-hidden');
            if (ariaHidden === null) return true; // removed when open on many pages
            return ariaHidden === 'false';
        } catch (_e) {
            return false;
        }
    }

    function syncSearchableSelects(scopeEl){
        try {
            if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') {
                window.BlossomSearchableSelect.syncAll(scopeEl || document);
            }
        } catch (_e) {
            // ignore
        }
    }

    function clearRequiredErrors(scopeEl){
        if (!scopeEl || !scopeEl.querySelectorAll) return;
        scopeEl.querySelectorAll('form.show-required-errors').forEach((form) => {
            form.classList.remove('show-required-errors');
        });
        // Reset searchable-select invalid wrappers so the modal opens clean.
        scopeEl.querySelectorAll('.fk-searchable-control.is-invalid').forEach((wrapper) => {
            wrapper.classList.remove('is-invalid');
            const display = wrapper.querySelector && wrapper.querySelector('.fk-searchable-display');
            if (display) {
                try { display.setAttribute('aria-invalid', 'false'); } catch (_e) {}
            }
        });
        syncSearchableSelects(scopeEl);
    }

    function focusFirstInvalid(form){
        if (!form || !form.querySelector) return;
        const firstInvalid = form.querySelector(':invalid');
        if (!firstInvalid) return;

        try {
            if (firstInvalid.matches && firstInvalid.matches('select.search-select')) {
                const wrapper = firstInvalid.closest && firstInvalid.closest('.fk-searchable-control');
                const display = wrapper && wrapper.querySelector ? wrapper.querySelector('.fk-searchable-display') : null;
                if (display && typeof display.focus === 'function') {
                    display.focus();
                    return;
                }
            }
        } catch (_e) {
            // ignore
        }

        try {
            if (typeof firstInvalid.focus === 'function') firstInvalid.focus();
        } catch (_e) {
            // ignore
        }
    }

    function markRequiredErrors(form){
        if (!form || !form.classList) return;
        form.classList.add('show-required-errors');
        syncSearchableSelects(form);
    }

    function handleSaveClick(event){
        try {
        const btn = event && event.target && event.target.closest ? event.target.closest('button') : null;
        if (!btn) return;
        if (!btn.id || !SAVE_BUTTON_IDS.has(btn.id)) return;

        // Skip HW category edit modals — they handle their own save logic
        try {
            const modal = btn.closest ? btn.closest('.modal-overlay-full') : null;
            if (modal && modal.id === 'system-edit-modal' && modal.classList.contains('server-edit-modal')) return;
        } catch (_) {}

        const modal = btn.closest ? btn.closest('.modal-overlay-full') : null;
        const form = modal ? (modal.querySelector && modal.querySelector('form')) : (btn.closest ? btn.closest('form') : null);
        if (!form) return;

        const canValidate = typeof form.checkValidity === 'function';
        if (!canValidate) return;

        if (!form.checkValidity()) {
            // Block downstream save handlers when invalid.
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

            markRequiredErrors(form);
            try { form.reportValidity(); } catch (_e) {}
            focusFirstInvalid(form);
            return;
        }

        // If valid, ensure prior error state is cleared.
        form.classList.remove('show-required-errors');
        syncSearchableSelects(form);
        } catch (_e) { /* never block event propagation due to errors */ }
    }

    function observeModalOpenToClearErrors(){
        if (!document.body || typeof MutationObserver === 'undefined') return;
        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                const el = m && m.target;
                if (!(el instanceof HTMLElement)) continue;
                if (!el.classList || !el.classList.contains('modal-overlay-full')) continue;
                if (m.attributeName !== 'class' && m.attributeName !== 'aria-hidden') continue;
                if (isModalOpen(el)) {
                    clearRequiredErrors(el);
                }
            }
        });
        observer.observe(document.body, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'aria-hidden'],
        });
    }

    function init(){
        // Capture phase so we can stop invalid saves before page handlers run.
        document.addEventListener('click', handleSaveClick, true);
        observeModalOpenToClearErrors();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/* §25 ── System Tab Nav ────────────────────────────────────── */
// Unified system tab navigation: ensure /p/<key> anchors perform full navigation
// and preserve legacy in-page tab switching (data-tab) when present.
document.addEventListener('DOMContentLoaded', function(){
    function coerceInt(val){
        if(val === null || val === undefined || val === '') return null;
        const n = parseInt(String(val), 10);
        return Number.isNaN(n) ? null : n;
    }

    function safeJsonParse(raw){
        if(!raw) return null;
        try { return JSON.parse(raw); } catch(_e){ return null; }
    }

    function extractIdFromRow(row, scope){
        if(!row || typeof row !== 'object') return null;
        let id = null;
        if(row.id !== undefined) id = coerceInt(row.id);
        if(id == null && row.asset_id !== undefined) id = coerceInt(row.asset_id);
        if(id == null && row.assetId !== undefined) id = coerceInt(row.assetId);
        if(id == null && scope){
            const k1 = scope + '_id';
            if(row[k1] !== undefined) id = coerceInt(row[k1]);
            const k2 = scope + 'Id';
            if(id == null && row[k2] !== undefined) id = coerceInt(row[k2]);
        }
        return id;
    }

    function buildCandidateScopesFromHref(href){
        const out = [];
        try{
            const u = new URL(href, window.location.origin);
            const m = String(u.pathname || '').match(/^\/p\/([^/?#]+)/);
            const key = m && m[1] ? decodeURIComponent(m[1]) : '';
            const tokens = key.split(/[^A-Za-z0-9_-]+/g).filter(Boolean);
            tokens.forEach(t => {
                if(!t) return;
                // common keys: sw_os_unix_detail -> unix is useful
                if(out.indexOf(t) < 0) out.push(t);
            });
            // Also add the last token as a strong hint.
            if(tokens.length){
                const last = tokens[tokens.length - 1];
                if(last && out.indexOf(last) < 0) out.unshift(last);
            }
        }catch(_e){ }
        return out;
    }

    function inferContextForHref(href){
        // 1) If current URL already carries asset_scope/asset_id, use it.
        try{
            const cur = new URL(window.location.href);
            const s = (cur.searchParams.get('asset_scope') || cur.searchParams.get('scope') || '').trim();
            const id = coerceInt(cur.searchParams.get('asset_id') || cur.searchParams.get('assetId') || cur.searchParams.get('id'));
            if(s && id != null) return { asset_scope: s, asset_id: id };
        }catch(_e){ }

        // 2) Use sessionStorage selectedRow based on the target /p/<key>.
        const candidates = buildCandidateScopesFromHref(href);
        try{
            for(let i=0;i<candidates.length;i++){
                const s = candidates[i];
                const keys = [s + ':selectedRow', s + ':selected:row', s + '_selected_row'];
                for(let k=0;k<keys.length;k++){
                    const raw = sessionStorage.getItem(keys[k]);
                    if(!raw) continue;
                    const row = safeJsonParse(raw);
                    const id = extractIdFromRow(row, s);
                    if(id != null) return { asset_scope: s, asset_id: id };
                }
            }
        }catch(_e){ }

        return null;
    }

    function withAssetContext(href){
        // Security: keep detail URLs path-only (no querystring context).
        // Context should flow via sessionStorage/localStorage like server/storage detail pages.
        return href;
        try{
            const u = new URL(href, window.location.origin);
            if(!String(u.pathname || '').startsWith('/p/')) return href;
            if(u.searchParams.get('asset_id') || u.searchParams.get('assetId')) return href;
            const ctx = inferContextForHref(href);
            if(!ctx) return href;
            u.searchParams.set('asset_scope', ctx.asset_scope);
            u.searchParams.set('asset_id', String(ctx.asset_id));
            return u.pathname + (u.searchParams.toString() ? ('?' + u.searchParams.toString()) : '') + (u.hash || '');
        }catch(_e){
            return href;
        }
    }

    // Proactively decorate *detail* tab links so right-click copy / refresh works.
    (function decorateDetailTabLinks(){
        // Security: do not decorate tab links with asset_id params.
        return;
        try{
            const cur = new URL(window.location.href);
            const s = (cur.searchParams.get('asset_scope') || '').trim();
            const id = coerceInt(cur.searchParams.get('asset_id'));
            if(!s || id == null) return;
            const links = document.querySelectorAll('a.server-detail-tab-btn[href^="/p/"]');
            links.forEach(a => {
                const raw = a.getAttribute('href') || '';
                if(!raw) return;
                try{
                    const u = new URL(raw, window.location.origin);
                    if(u.searchParams.get('asset_id') || u.searchParams.get('assetId')) return;
                    u.searchParams.set('asset_scope', s);
                    u.searchParams.set('asset_id', String(id));
                    a.setAttribute('href', u.pathname + '?' + u.searchParams.toString());
                }catch(_e){ }
            });
        }catch(_e){ }
    })();

    const tabButtons = document.querySelectorAll('.system-tabs .system-tab-btn');
    if (!tabButtons.length) return;
    tabButtons.forEach(btn => {
        btn.addEventListener('click', function(e){
            const href = btn.getAttribute('href');
            // External page route: SPA navigation
            if (href && href.startsWith('/p/')) {
                e.preventDefault();
                // List tabs should navigate without carrying selected-row context.
                if (typeof window.blsSpaNavigate === 'function') {
                    window.blsSpaNavigate(href);
                } else {
                    window.location.href = href;
                }
                return;
            }
            // Internal pane toggle (future use if data-tab exists)
            const targetId = btn.getAttribute('data-tab');
            if (targetId) {
                e.preventDefault();
                document.querySelectorAll('.system-tabs .system-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
                document.querySelectorAll('.tab-content .tab-pane').forEach(p => p.classList.toggle('active', p.id === targetId));
            }
        }, { capture: true }); // capture to override legacy handlers that might preventDefault
    });

    // Also intercept server-detail tab clicks so we can append params on first navigation.
    document.addEventListener('click', function(e){
        const a = e.target && e.target.closest ? e.target.closest('a.server-detail-tab-btn[href^="/p/"]') : null;
        if(!a) return;
        const href = a.getAttribute('href') || '';
        if(!href) return;
        const next = withAssetContext(href);
        if(next === href) return;
        e.preventDefault();
        if (typeof window.blsSpaNavigate === 'function') {
            window.blsSpaNavigate(next);
        } else {
            window.location.href = next;
        }
    }, true);
});

/* §26 ── List Empty-State v2 ──────────────────────────────── */
// Global list empty-state UX: when #system-empty is visible, hide the table so
// the empty-state card is the primary UI (prevents an "empty table" look).
(function setupGlobalListEmptyStateToggle(){
    function isElementVisible(el){
        if(!el) return false;
        if(el.hidden) return false;
        try {
            const style = window.getComputedStyle(el);
            if(style.display === 'none') return false;
            if(style.visibility === 'hidden') return false;
            return true;
        } catch(_e){
            return !el.hidden;
        }
    }

    function sync(){
        const emptyEl = document.getElementById('system-empty');
        const tableEl = document.getElementById('system-table');
        if(!emptyEl || !tableEl) return;
        if(!emptyEl.classList || !emptyEl.classList.contains('system-empty')) return;
        const shouldHideTable = isElementVisible(emptyEl);
        if(tableEl.hidden !== shouldHideTable) tableEl.hidden = shouldHideTable;
    }

    // If the page JS doesn't run (or is slow), keep the UX consistent:
    // show the empty-state card when the table body stays empty.
    function ensureEmptyShownIfNoRows(){
        const emptyEl = document.getElementById('system-empty');
        const tableEl = document.getElementById('system-table');
        const tbodyEl = document.getElementById('system-table-body');
        if(!emptyEl || !tableEl || !tbodyEl) return;
        if(!emptyEl.classList || !emptyEl.classList.contains('system-empty')) return;

        // Some list pages manage empty-state explicitly (and may hide it while loading).
        // When flagged, never force-show empty state here.
        try{
            if(document.body && document.body.dataset && document.body.dataset.blossomListEmptyManaged === '1') return;
            if(emptyEl.dataset && emptyEl.dataset.blossomListEmptyManaged === '1') return;
        }catch(_e){}

        // During SPA navigation, a new page's list can be present before its JS finishes
        // fetching data. Avoid forcing empty-state while the global SPA spinner is visible.
        if(document.getElementById('spa-loading-spinner')) return;

        // Avoid forcing empty-state while page-level list loading indicators are active.
        // Many list pages toggle these classes/spinners while fetching.
        if(document.querySelector('.system-table-container.is-loading, #system-table.is-loading, .active-searching, #system-search-loader.is-active')) return;

        // If rows already exist, do nothing.
        if(tbodyEl.children && tbodyEl.children.length > 0){
            try{ delete emptyEl.dataset.blossomNoRowsSince; }catch(_e){}
            return;
        }

        // If empty-state is already visible, keep table hidden.
        if(isElementVisible(emptyEl)){
            sync();
            return;
        }

        // Throttle: only force-show empty state if the table has stayed empty long enough.
        // This prevents a brief flash while page scripts are still fetching.
        const now = Date.now();
        let since = 0;
        try{ since = parseInt(emptyEl.dataset.blossomNoRowsSince || '0', 10) || 0; }catch(_e){}
        if(!since){
            try{ emptyEl.dataset.blossomNoRowsSince = String(now); }catch(_e){}
            return;
        }
        if(now - since < 450) return;

        emptyEl.hidden = false;
        sync();
    }

    document.addEventListener('DOMContentLoaded', function(){
        sync();

        // Fallback: after short delays, if the body is still empty, show empty-state.
        // This avoids the "empty table header" look when scripts fail to render.
        setTimeout(() => { try { ensureEmptyShownIfNoRows(); } catch(_e){} }, 120);
        setTimeout(() => { try { ensureEmptyShownIfNoRows(); } catch(_e){} }, 600);

        let emptyObserver = null;
        function attachEmptyObserver(){
            const emptyEl = document.getElementById('system-empty');
            if(!emptyEl) return false;
            if(emptyObserver) return true;
            emptyObserver = new MutationObserver(() => sync());
            emptyObserver.observe(emptyEl, { attributes:true, attributeFilter:['hidden','style','class'] });
            return true;
        }

        if(attachEmptyObserver()) return;

        // Some pages may inject the list markup later; watch until it appears.
        const docObs = new MutationObserver(() => {
            sync();
            try { ensureEmptyShownIfNoRows(); } catch(_e){}
            if(attachEmptyObserver()) docObs.disconnect();
        });
        if(document.body){
            docObs.observe(document.body, { childList:true, subtree:true });
        }
    });
})();

/* §27 ── Tab11 Task Loader ─────────────────────────────────── */
// tab11-task: unified behaviors live in /static/js/_detail/tab11-task.js
// Lazy-load and initialize when tk-spec-table exists.
// ★ 공유 템플릿(tab11-task-shared.html)은 자체 JS를 로드하므로 여기서 건너뛴다.
try { window.__blsTab11TaskPreferred = true; } catch (_e) { }
document.addEventListener('DOMContentLoaded', () => {
    try {
        // 공유 템플릿에서 이미 tab11-task-shared.js를 로드한 경우 중복 초기화 방지
        if (document.querySelector('main.tab11-task-root') || window.__BLS_TAB11_SHARED_INIT) return;

        const tkTable = document.getElementById('tk-spec-table');
        if (!tkTable) return;

        // Many *_detail.js files have legacy tab11-task blocks that start with:
        //   var table = document.getElementById('tk-spec-table'); if(!table) return;
        // Hide the id during DOMContentLoaded so those blocks no-op, then restore
        // the id right before we run the unified initializer.
        const originalId = tkTable.id;
        const hiddenId = 'tk-spec-table__bls_hidden';
        try { tkTable.id = hiddenId; } catch (_e) { }

        function restoreId() {
            try {
                if (tkTable && tkTable.id !== originalId) tkTable.id = originalId;
            } catch (_e) { }
        }

        let runScheduled = false;
        function run() {
            if (runScheduled) return;
            runScheduled = true;
            setTimeout(() => {
                try {
                    restoreId();
                    if (typeof window.__blsInitTab11Task === 'function') window.__blsInitTab11Task();
                } catch (_e) { }
            }, 0);
        }

        if (typeof window.__blsInitTab11Task === 'function') {
            run();
            return;
        }

        if (window.__blsTab11TaskLoading) {
            document.addEventListener('bls:tab11TaskReady', run, { once: true });
            return;
        }

        window.__blsTab11TaskLoading = true;
        const s = document.createElement('script');
        s.src = '/static/js/_detail/tab11-task.js';
        s.async = true;
        s.onload = function () {
            window.__blsTab11TaskLoading = false;
            try { document.dispatchEvent(new CustomEvent('bls:tab11TaskReady')); } catch (_e) { }
            run();
        };
        s.onerror = function () { window.__blsTab11TaskLoading = false; restoreId(); };
        document.head.appendChild(s);

        // Safety: never leave the id hidden if script load is delayed.
        setTimeout(restoreId, 0);
    } catch (_eTop) { }
});

/* §28 ── Date Picker ───────────────────────────────────────── */
// ── Global date-picker initializer ──────────────────────────────────
// Many tab init functions call  window.__blsInitDatePickers(container)
// to activate flatpickr on every .date-input inside the given root.
(function(){
    var FP_CSS  = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
    var FP_THM  = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/airbnb.css';
    var FP_JS   = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.js';
    var FP_KO   = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/ko.js';
    var _fpProm = null;

    function css(href,id){
        try{ if(id && document.getElementById(id)) return;
            var l=document.createElement('link'); l.rel='stylesheet'; l.href=href; if(id) l.id=id; document.head.appendChild(l);
        }catch(_){}
    }
    function js(src){
        return new Promise(function(ok,fail){
            try{ var s=document.createElement('script'); s.src=src; s.async=true; s.onload=function(){ok(true);}; s.onerror=function(){fail(new Error(src));}; document.head.appendChild(s); }catch(e){fail(e);}
        });
    }
    function ensureAssets(){
        css(FP_CSS,'flatpickr-css'); css(FP_THM,'flatpickr-theme-css');
        if(window.flatpickr) return Promise.resolve();
        if(_fpProm) return _fpProm;
        _fpProm = js(FP_JS).then(function(){ return js(FP_KO).catch(function(){}); }).catch(function(e){ _fpProm=null; throw e; });
        return _fpProm;
    }
    function todayBtn(cal){
        try{ if(!cal || cal.querySelector('.fp-today-btn')) return;
            var b=document.createElement('button'); b.type='button'; b.className='fp-today-btn'; b.textContent='오늘';
            b.addEventListener('click',function(e){ e.preventDefault();
                try{ var inst=cal._flatpickr||(cal.parentNode&&cal.parentNode._flatpickr)||null; if(inst) inst.setDate(new Date(),true); }catch(_){}
            }); cal.appendChild(b);
        }catch(_){}
    }
    function afterReady(_sd,_ds,inst){
        try{ var c=inst&&inst.calendarContainer; if(c){ c.classList.add('blossom-date-popup'); c._flatpickr=inst; todayBtn(c); } }catch(_){}
    }

    window.__blsInitDatePickers = function(root){
        if(!root) return;
        var inputs = root.querySelectorAll('.date-input');
        if(!inputs.length) return;
        ensureAssets().then(function(){
            if(!window.flatpickr) return;
            try{ if(window.flatpickr.l10ns && window.flatpickr.l10ns.ko) window.flatpickr.localize(window.flatpickr.l10ns.ko); }catch(_){}
            for(var i=0;i<inputs.length;i++){
                var inp=inputs[i];
                if(inp._flatpickr) continue;
                try{ inp.type='text'; }catch(_){}
                // Detect if the placeholder requests time (contains HH:MM)
                var ph = (inp.placeholder||'').toUpperCase();
                var wantTime = ph.indexOf('HH:MM')>-1;
                var opts = wantTime
                    ? { dateFormat:'Y-m-d H:i', enableTime:true, time_24hr:true, allowInput:true, onReady:afterReady }
                    : { dateFormat:'Y-m-d', allowInput:true, onReady:afterReady };
                window.flatpickr(inp, opts);
            }
        }).catch(function(){});
    };
})();