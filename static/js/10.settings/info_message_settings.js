/**
 * 인포메이션 문구 관리 설정 페이지 JS
 * static/js/10.settings/info_message_settings.js  v1.0.0
 *
 * 관리자 전용. 대분류/중분류별 안내 문구 CRUD + 활성/비활성 토글.
 */
(function(){
    'use strict';

    var API   = '/api/info-messages';
    var HDRS  = { 'Content-Type': 'application/json' };
    var items = [];

    /* ── DOM 캐시 ── */
    var tbody       = document.getElementById('info-msg-tbody');
    var filterCat   = document.getElementById('filter-main-cat');
    var filterEn    = document.getElementById('filter-enabled');
    var filterQ     = document.getElementById('filter-search');
    var btnFilter   = document.getElementById('btn-filter');
    var btnNew      = document.getElementById('btn-new');
    var modal       = document.getElementById('info-msg-modal');
    var modalTitle  = document.getElementById('modal-title');
    var btnSave     = document.getElementById('btn-save');
    var btnCancel   = document.getElementById('btn-cancel');
    var btnClose    = document.getElementById('modal-close');
    // 편집 필드
    var elId        = document.getElementById('edit-id');
    var elMainCode  = document.getElementById('edit-main-cat-code');
    var elMainName  = document.getElementById('edit-main-cat-name');
    var elSubCode   = document.getElementById('edit-sub-cat-code');
    var elSubName   = document.getElementById('edit-sub-cat-name');
    var elMenuKey   = document.getElementById('edit-menu-key');
    var elTitle     = document.getElementById('edit-title');
    var elContent   = document.getElementById('edit-content');
    var elEnabled   = document.getElementById('edit-enabled');
    var elSortOrder = document.getElementById('edit-sort-order');
    var elPreview   = document.getElementById('edit-preview');

    /* ── 유틸 ── */
    /** XSS 방지용 텍스트 이스케이프 */
    function esc(str) {
        if (!str) return '';
        var d = document.createElement('div');
        d.appendChild(document.createTextNode(str));
        return d.innerHTML;
    }

    /** content 텍스트를 안전한 HTML 미리보기로 변환 (줄바꿈 → <li>) */
    function renderPreview(title, content) {
        var html = '';
        if (title) {
            html += '<div class="preview-title">' + esc(title) + '</div>';
        }
        if (content) {
            var lines = content.split('\n').filter(function(l){ return l.trim(); });
            html += '<ul class="preview-list">';
            for (var i = 0; i < lines.length; i++) {
                html += '<li>' + esc(lines[i]) + '</li>';
            }
            html += '</ul>';
        }
        return html || '<span style="color:#9ca3af">미리보기 없음</span>';
    }

    /* ── 목록 로드 ── */
    function loadList() {
        var params = [];
        var cat = filterCat.value;
        var en  = filterEn.value;
        var q   = (filterQ.value || '').trim();
        if (cat) params.push('main_category=' + encodeURIComponent(cat));
        if (en !== '') params.push('is_enabled=' + en);
        if (q)  params.push('q=' + encodeURIComponent(q));
        var url = API + (params.length ? '?' + params.join('&') : '');
        tbody.innerHTML = '<tr><td colspan="8" class="info-msg-empty">조회 중...</td></tr>';

        fetch(url, { credentials: 'same-origin' })
            .then(function(r){ return r.json(); })
            .then(function(data){
                if (!data.success) throw new Error(data.message || '조회 실패');
                items = data.items || [];
                renderTable();
            })
            .catch(function(err){
                tbody.innerHTML = '<tr><td colspan="8" class="info-msg-empty">오류: ' + esc(err.message) + '</td></tr>';
            });
    }

    function renderTable() {
        if (!items.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="info-msg-empty">등록된 문구가 없습니다.</td></tr>';
            return;
        }
        var html = '';
        for (var i = 0; i < items.length; i++) {
            var r = items[i];
            var badgeCls = r.is_enabled ? 'info-msg-badge-on' : 'info-msg-badge-off';
            var badgeTxt = r.is_enabled ? '사용' : '미사용';
            html += '<tr data-id="' + r.id + '">'
                  + '<td>' + esc(r.main_category_name) + '</td>'
                  + '<td>' + esc(r.sub_category_name) + '</td>'
                  + '<td><code>' + esc(r.menu_key) + '</code></td>'
                  + '<td>' + esc(r.info_title) + '</td>'
                  + '<td><span class="info-msg-badge ' + badgeCls + '">' + badgeTxt + '</span></td>'
                  + '<td>' + esc(r.updated_at || r.created_at || '') + '</td>'
                  + '<td>' + esc(r.updated_by || r.created_by || '') + '</td>'
                  + '<td>'
                  +   '<button class="info-msg-btn info-msg-btn-sm info-msg-btn-primary btn-edit" data-idx="' + i + '">편집</button>'
                  + '</td>'
                  + '</tr>';
        }
        tbody.innerHTML = html;
        // 편집 버튼 바인딩
        var edits = tbody.querySelectorAll('.btn-edit');
        for (var j = 0; j < edits.length; j++) {
            edits[j].addEventListener('click', function(){
                var idx = parseInt(this.getAttribute('data-idx'), 10);
                openEdit(items[idx]);
            });
        }
    }

    /* ── 모달 열기/닫기 ── */
    function openModal() { modal.hidden = false; }
    function closeModal() { modal.hidden = true; }

    function openNew() {
        modalTitle.textContent = '인포메이션 문구 신규 등록';
        elId.value = '';
        elMainCode.value = ''; elMainName.value = '';
        elSubCode.value = '';  elSubName.value = '';
        elMenuKey.value = '';  elMenuKey.readOnly = false;
        elTitle.value = '';    elContent.value = '';
        elEnabled.checked = true;
        elSortOrder.value = '0';
        updatePreview();
        openModal();
    }

    function openEdit(item) {
        modalTitle.textContent = '인포메이션 문구 편집';
        elId.value = item.id;
        elMainCode.value = item.main_category_code || '';
        elMainName.value = item.main_category_name || '';
        elSubCode.value  = item.sub_category_code || '';
        elSubName.value  = item.sub_category_name || '';
        elMenuKey.value  = item.menu_key || '';
        elMenuKey.readOnly = true; // 수정 시 menu_key 변경 불가
        elTitle.value    = item.info_title || '';
        elContent.value  = item.info_content || '';
        elEnabled.checked = !!item.is_enabled;
        elSortOrder.value = item.sort_order || 0;
        updatePreview();
        openModal();
    }

    function updatePreview() {
        elPreview.innerHTML = renderPreview(elTitle.value, elContent.value);
    }

    /* ── 저장 ── */
    function save() {
        var id = elId.value;
        var payload = {
            menu_key: elMenuKey.value.trim(),
            main_category_code: elMainCode.value.trim(),
            main_category_name: elMainName.value.trim(),
            sub_category_code:  elSubCode.value.trim(),
            sub_category_name:  elSubName.value.trim(),
            info_title:   elTitle.value.trim(),
            info_content: elContent.value,  // 줄바꿈 보존
            is_enabled:   elEnabled.checked ? 1 : 0,
            sort_order:   parseInt(elSortOrder.value, 10) || 0,
        };
        if (!payload.menu_key) { alert('menu_key를 입력하세요.'); return; }

        var url    = id ? (API + '/' + id) : API;
        var method = id ? 'PUT' : 'POST';

        btnSave.disabled = true;
        btnSave.textContent = '저장 중...';

        fetch(url, {
            method: method,
            headers: HDRS,
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        })
        .then(function(r){ return r.json(); })
        .then(function(data){
            if (!data.success) throw new Error(data.message || '저장 실패');
            closeModal();
            loadList();
        })
        .catch(function(err){
            alert('오류: ' + err.message);
        })
        .finally(function(){
            btnSave.disabled = false;
            btnSave.textContent = '저장';
        });
    }

    /* ── 이벤트 바인딩 ── */
    function init() {
        btnFilter.addEventListener('click', loadList);
        btnNew.addEventListener('click', openNew);
        btnSave.addEventListener('click', save);
        btnCancel.addEventListener('click', closeModal);
        btnClose.addEventListener('click', closeModal);
        // Enter 키로 검색
        filterQ.addEventListener('keydown', function(e){
            if (e.key === 'Enter') loadList();
        });
        // 실시간 미리보기
        elTitle.addEventListener('input', updatePreview);
        elContent.addEventListener('input', updatePreview);
        // ESC로 모달 닫기
        document.addEventListener('keydown', function(e){
            if (e.key === 'Escape' && !modal.hidden) closeModal();
        });
        // 초기 로드
        loadList();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
