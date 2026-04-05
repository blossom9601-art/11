/* ==========================================================================
   품질유형 관리 (Quality Type) — 4.quality_type.js
   온프레미스 스타일: 인라인 행추가/편집, 체크박스 선택, CSV, 업로드
   ========================================================================== */
(function () {
    'use strict';

    var API_BASE = '/api/quality-types';

    // ── Lottie CDN 로더 (온프레미스 동일) ──────────
    var LOTTIE_CDN = 'https://unpkg.com/lottie-web@5.12.2/build/player/lottie.min.js';
    var _uploadAnim = null;
    function ensureLottie(cb) {
        if (window.lottie) { cb(); return; }
        var s = document.createElement('script');
        s.src = LOTTIE_CDN; s.async = true;
        s.onload = function () { cb(); };
        document.head.appendChild(s);
    }
    function initUploadAnim() {
        var el = document.getElementById('qt-upload-anim');
        if (!el) return;
        ensureLottie(function () {
            try {
                if (_uploadAnim && typeof _uploadAnim.destroy === 'function') { _uploadAnim.destroy(); }
                el.innerHTML = '';
                _uploadAnim = window.lottie.loadAnimation({
                    container: el,
                    renderer: 'svg',
                    loop: true,
                    autoplay: true,
                    path: '/static/image/svg/list/free-animated-upload.json',
                    rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true }
                });
            } catch (_e) {}
        });
    }

    // ── 컬럼 정의 ────────────────────────────────────────
    var COLUMNS = [
        { key: 'group_name',    label: '그룹',       placeholder: '예: 가용성' },
        { key: 'quality_type',  label: '품질유형',    placeholder: '예: 서비스 가용성', required: true },
        { key: 'item_name',     label: '항목',       placeholder: '예: 시스템 가동률' },
        { key: 'metric',        label: '측정지표',    placeholder: '예: 월간 가동시간/계획×100' },
        { key: 'unit',          label: '단위',       placeholder: '예: %' },
        { key: 'target_value',  label: '기본목표값',  placeholder: '예: 99.9' },
        { key: 'description',   label: '설명',       placeholder: '비고' }
    ];

    // 업로드 템플릿 헤더 (한국어)
    var UPLOAD_HEADERS_KO = COLUMNS.map(function (c) { return c.label; });
    var HEADER_KO_TO_KEY = {};
    COLUMNS.forEach(function (c) { HEADER_KO_TO_KEY[c.label] = c.key; });

    // ── 상태 ─────────────────────────────────────────────
    var _rows = [];
    var _selected = new Set();
    var _searchTimer = null;
    var _editingId = null;   // 인라인 수정 중인 ID (null=없음)
    var _page = 1;
    var _pageSize = 10;
    // ── DOM 참조 ─────────────────────────────────────────
    var tbody, emptyBox, searchInput, checkAll, countBadge;

    function $(id) { return document.getElementById(id); }

    // ── 유틸 ─────────────────────────────────────────────
    function escHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str || ''));
        return div.innerHTML;
    }

    function ajax(method, url, data, cb) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, url);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            var res;
            try { res = JSON.parse(xhr.responseText); } catch (e) { res = {}; }
            cb(xhr.status, res);
        };
        xhr.send(data ? JSON.stringify(data) : null);
    }

    // ── 메시지 모달 (온프레미스 동일 — alert/toast 대체) ────
    function openMessageModal(id) {
        var el = document.getElementById(id);
        if (!el) return;
        document.body.classList.add('modal-open');
        el.classList.add('show');
        el.setAttribute('aria-hidden', 'false');
    }
    function closeMessageModal(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('show');
        el.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
    }
    function showMessage(message, title) {
        var titleEl = document.getElementById('qt-message-title');
        var contentEl = document.getElementById('qt-message-content');
        if (titleEl) titleEl.textContent = title || '알림';
        if (contentEl) contentEl.textContent = String(message || '');
        openMessageModal('qt-message-modal');
    }

    // ── 모달 열기/닫기 (삭제/업로드 등 기존 모달) ────────────
    // openModal / closeModal — 더 이상 사용하지 않음 (openMessageModal 통일)

    // ── 데이터 조회 ──────────────────────────────────────
    function load(q) {
        var url = API_BASE;
        if (q) url += '?q=' + encodeURIComponent(q);
        ajax('GET', url, null, function (status, res) {
            if (status === 200 && res.success) {
                _rows = res.items || [];
            } else {
                _rows = [];
            }
            _selected.clear();
            _editingId = null;
            _page = 1;
            render();
        });
    }

    // ── 카운트 배지 업데이트 ─────────────────────────────
    function updateCount() {
        if (countBadge) countBadge.textContent = _rows.length;
    }

    // ── 체크박스/선택 ────────────────────────────────────
    function updateCheckAll() {
        if (!checkAll) return;
        if (_rows.length === 0) { checkAll.checked = false; return; }
        checkAll.checked = _selected.size === _rows.length;
        checkAll.indeterminate = _selected.size > 0 && _selected.size < _rows.length;
    }

    function syncRowClasses() {
        if (!tbody) return;
        var trs = tbody.querySelectorAll('tr[data-id]');
        for (var i = 0; i < trs.length; i++) {
            var id = Number(trs[i].getAttribute('data-id'));
            var cb = trs[i].querySelector('input[type=checkbox]');
            if (_selected.has(id)) {
                trs[i].classList.add('selected');
                if (cb) cb.checked = true;
            } else {
                trs[i].classList.remove('selected');
                if (cb) cb.checked = false;
            }
        }
    }

    // ── 렌더링 ───────────────────────────────────────────
    function totalPages() {
        return Math.max(1, Math.ceil(_rows.length / _pageSize));
    }

    function getPageSlice() {
        var start = (_page - 1) * _pageSize;
        return _rows.slice(start, start + _pageSize);
    }

    function render() {
        if (!tbody) return;
        tbody.innerHTML = '';
        updateCount();

        // 페이지 범위 보정
        var maxPage = totalPages();
        if (_page > maxPage) _page = maxPage;

        if (!_rows.length) {
            if (emptyBox) emptyBox.removeAttribute('hidden');
            updateCheckAll();
            updatePagination();
            return;
        }
        if (emptyBox) emptyBox.setAttribute('hidden', '');

        var pageRows = getPageSlice();
        var startIdx = (_page - 1) * _pageSize;
        for (var i = 0; i < pageRows.length; i++) {
            var r = pageRows[i];
            var isEditing = (_editingId === r.id);
            tbody.appendChild(buildRow(r, startIdx + i, isEditing));
        }

        syncRowClasses();
        updateCheckAll();
        updatePagination();
    }

    // ── 페이지네이션 ─────────────────────────────────────
    function updatePagination() {
        var infoEl = $('qt-pagination-info');
        if (infoEl) {
            var start = _rows.length ? (_page - 1) * _pageSize + 1 : 0;
            var end = Math.min(_rows.length, _page * _pageSize);
            infoEl.textContent = start + '-' + end + ' / ' + _rows.length + '개 항목';
        }
        var pages = totalPages();
        var container = $('qt-page-numbers');
        if (container) {
            container.innerHTML = '';
            var maxVisible = 7;
            var pageList = [];
            if (pages <= maxVisible) {
                for (var i = 1; i <= pages; i++) pageList.push(i);
            } else {
                pageList.push(1);
                var left = Math.max(2, _page - 1);
                var right = Math.min(pages - 1, _page + 1);
                if (_page <= 3) { left = 2; right = 4; }
                if (_page >= pages - 2) { left = pages - 3; right = pages - 1; }
                if (left > 2) pageList.push('...');
                for (var i = left; i <= right; i++) pageList.push(i);
                if (right < pages - 1) pageList.push('...');
                pageList.push(pages);
            }
            for (var i = 0; i < pageList.length; i++) {
                if (pageList[i] === '...') {
                    var span = document.createElement('span');
                    span.className = 'page-ellipsis';
                    span.textContent = '...';
                    container.appendChild(span);
                } else {
                    var btn = document.createElement('button');
                    btn.className = 'page-btn' + (pageList[i] === _page ? ' active' : '');
                    btn.textContent = pageList[i];
                    btn.setAttribute('data-page', pageList[i]);
                    container.appendChild(btn);
                }
            }
        }
        // 버튼 활성/비활성
        var firstBtn = $('qt-first'), prevBtn = $('qt-prev');
        var nextBtn = $('qt-next'), lastBtn = $('qt-last');
        if (firstBtn) firstBtn.disabled = (_page === 1);
        if (prevBtn) prevBtn.disabled = (_page === 1);
        if (nextBtn) nextBtn.disabled = (_page === pages);
        if (lastBtn) lastBtn.disabled = (_page === pages);
    }

    function goToPage(p) {
        var pages = totalPages();
        p = Math.max(1, Math.min(p, pages));
        if (p !== _page) {
            _page = p;
            render();
        }
    }

    // 읽기 전용 행
    function buildRow(r, idx, isEditing) {
        if (isEditing) return buildEditRow(r);

        var tr = document.createElement('tr');
        tr.setAttribute('data-id', r.id);

        // 체크박스
        var tdCheck = document.createElement('td');
        tdCheck.style.textAlign = 'center';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = _selected.has(r.id);
        cb.addEventListener('change', function () {
            if (cb.checked) { _selected.add(r.id); } else { _selected.delete(r.id); }
            tr.classList.toggle('selected', cb.checked);
            updateCheckAll();
        });
        tdCheck.appendChild(cb);
        tr.appendChild(tdCheck);

        // 데이터 셀
        for (var c = 0; c < COLUMNS.length; c++) {
            var td = document.createElement('td');
            td.textContent = r[COLUMNS[c].key] || '';
            if (COLUMNS[c].key === 'description') {
                td.style.maxWidth = '260px';
                td.style.overflow = 'hidden';
                td.style.textOverflow = 'ellipsis';
                td.style.whiteSpace = 'nowrap';
                td.title = r[COLUMNS[c].key] || '';
            }
            tr.appendChild(td);
        }

        // 관리 셀 (온프레미스 action-btn 패턴)
        var tdActions = document.createElement('td');
        tdActions.setAttribute('data-col', 'actions');
        tdActions.className = 'system-actions';
        tdActions.innerHTML =
            '<button type="button" class="action-btn" data-action="edit" data-idx="' + idx + '" title="수정" aria-label="수정">' +
                '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon">' +
            '</button>';
        tr.appendChild(tdActions);

        return tr;
    }

    // 편집 행 (신규 또는 기존)
    function buildEditRow(r) {
        var tr = document.createElement('tr');
        tr.classList.add('qt-editing');
        if (r) tr.setAttribute('data-id', r.id);

        // 체크박스 (비활성)
        var tdCheck = document.createElement('td');
        tdCheck.style.textAlign = 'center';
        tdCheck.innerHTML = '<input type="checkbox" disabled>';
        tr.appendChild(tdCheck);

        // 입력 필드
        for (var c = 0; c < COLUMNS.length; c++) {
            var td = document.createElement('td');
            var input = document.createElement('input');
            input.type = 'text';
            input.name = COLUMNS[c].key;
            input.placeholder = COLUMNS[c].placeholder || '';
            input.value = r ? (r[COLUMNS[c].key] || '') : '';
            // Enter → 저장, Escape → 취소
            input.addEventListener('keydown', (function () {
                return function (e) {
                    if (e.key === 'Enter') { e.preventDefault(); saveEditingRow(); }
                    if (e.key === 'Escape') { cancelEditing(); }
                };
            })());
            td.appendChild(input);
            tr.appendChild(td);
        }

        // 관리 셀 (저장 — 온프레미스 action-btn 패턴, pencil 동일 스타일)
        var tdActions = document.createElement('td');
        tdActions.setAttribute('data-col', 'actions');
        tdActions.className = 'system-actions';
        tdActions.innerHTML =
            '<button type="button" class="action-btn" data-action="save" title="저장" aria-label="저장">' +
                '<img src="/static/image/svg/list/free-icon-pencil.svg" alt="저장" class="action-icon">' +
            '</button>';
        tr.appendChild(tdActions);

        return tr;
    }

    // ── 인라인 저장 ──────────────────────────────────────
    function saveEditingRow() {
        var editTr = tbody.querySelector('tr.qt-editing');
        if (!editTr) return;

        var data = {};
        for (var c = 0; c < COLUMNS.length; c++) {
            var input = editTr.querySelector('input[name="' + COLUMNS[c].key + '"]');
            data[COLUMNS[c].key] = input ? input.value.trim() : '';
        }

        if (!data.quality_type) {
            showMessage('품질유형은 필수 입력 항목입니다.', '입력 오류');
            var typeInput = editTr.querySelector('input[name="quality_type"]');
            if (typeInput) typeInput.focus();
            return;
        }

        var isNew = (_editingId === 'new');
        var method = isNew ? 'POST' : 'PUT';
        var url = isNew ? API_BASE : (API_BASE + '/' + _editingId);

        ajax(method, url, data, function (status, res) {
            if (res.success) {
                _editingId = null;
                showMessage(isNew ? '품질유형이 등록되었습니다.' : '품질유형이 수정되었습니다.');
                load(searchInput ? searchInput.value.trim() : '');
            } else {
                showMessage(res.message || '저장 중 오류가 발생했습니다.', '오류');
            }
        });
    }

    function cancelEditing() {
        _editingId = null;
        render();
    }

    // ── 추가 모달 저장 ───────────────────────────────────
    function saveFromAddModal() {
        var form = $('qt-add-form');
        if (!form) return;
        var data = {};
        for (var c = 0; c < COLUMNS.length; c++) {
            var input = form.querySelector('input[name="' + COLUMNS[c].key + '"]');
            data[COLUMNS[c].key] = input ? input.value.trim() : '';
        }
        if (!data.quality_type) {
            showMessage('품질유형은 필수 입력 항목입니다.', '입력 오류');
            var typeInput = form.querySelector('input[name="quality_type"]');
            if (typeInput) typeInput.focus();
            return;
        }
        ajax('POST', API_BASE, data, function (status, res) {
            if (res.success) {
                closeMessageModal('qt-add-modal');
                showMessage('품질유형이 등록되었습니다.');
                load(searchInput ? searchInput.value.trim() : '');
            } else {
                showMessage(res.message || '저장 중 오류가 발생했습니다.', '오류');
            }
        });
    }

    // ── 삭제 ─────────────────────────────────────────────
    var _pendingDeleteIds = [];

    function doDelete(ids) {
        if (!ids.length) return;
        ajax('POST', API_BASE + '/bulk-delete', { ids: ids }, function (status, res) {
            if (res.success) {
                showMessage(ids.length + '건이 삭제되었습니다.');
                _selected.clear();
                load(searchInput ? searchInput.value.trim() : '');
            } else {
                showMessage(res.message || '삭제 실패', '오류');
            }
        });
    }

    // ── CSV 다운로드 ─────────────────────────────────────
    function exportCSV() {
        var rows = _selected.size > 0 ? _rows.filter(function (r) { return _selected.has(r.id); }) : _rows;
        if (!rows.length) { showMessage('다운로드할 데이터가 없습니다.', '알림'); return; }

        var header = UPLOAD_HEADERS_KO.join(',');
        var csvRows = [header];
        for (var i = 0; i < rows.length; i++) {
            var vals = [];
            for (var c = 0; c < COLUMNS.length; c++) {
                var v = (rows[i][COLUMNS[c].key] || '').replace(/"/g, '""');
                vals.push('"' + v + '"');
            }
            csvRows.push(vals.join(','));
        }
        var bom = '\uFEFF';
        var blob = new Blob([bom + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = '품질유형_' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage((_selected.size > 0 ? '선택 ' + rows.length + '건' : '전체 ' + rows.length + '건') + ' CSV 다운로드 완료');
    }

    // ── 업로드 템플릿 다운로드 ────────────────────────────
    function downloadTemplate() {
        var bom = '\uFEFF';
        var header = UPLOAD_HEADERS_KO.join(',');
        var blob = new Blob([bom + header + '\n'], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = '품질유형_업로드_템플릿.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ── 엑셀 업로드 처리 ─────────────────────────────────
    var _uploadFile = null;

    function handleUploadFile(file) {
        if (!file) return;
        var name = (file.name || '').toLowerCase();
        var okExt = name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv');
        var okSize = (file.size || 0) <= 10 * 1024 * 1024;
        if (!okExt || !okSize) {
            showMessage('.xls/.xlsx/.csv 파일만 지원합니다 (최대 10MB).', '파일 오류');
            return;
        }
        _uploadFile = file;
        var chip = $('qt-upload-file-chip');
        var meta = $('qt-upload-meta');
        var confirmBtn = $('qt-upload-confirm');
        if (chip) chip.textContent = file.name + ' (' + Math.max(1, Math.round(file.size / 1024)) + ' KB)';
        if (meta) meta.hidden = false;
        if (confirmBtn) confirmBtn.disabled = false;
    }

    function doUpload() {
        if (!_uploadFile) return;
        var progressEl = $('qt-upload-progress');
        var fillEl = $('qt-upload-fill');
        var pctEl = $('qt-upload-pct');
        var labelEl = progressEl ? progressEl.querySelector('.upload-progress-label') : null;
        var confirmBtn = $('qt-upload-confirm');

        // 프로그레스 표시 & 버튼 비활성화
        if (progressEl) progressEl.hidden = false;
        if (fillEl) { fillEl.style.width = '0%'; fillEl.classList.remove('complete'); }
        if (pctEl) pctEl.textContent = '0%';
        if (labelEl) labelEl.textContent = '업로드 진행중...';
        if (confirmBtn) confirmBtn.disabled = true;

        var formData = new FormData();
        formData.append('file', _uploadFile);
        var xhr = new XMLHttpRequest();
        xhr.open('POST', API_BASE + '/upload');

        // 업로드 진행률
        xhr.upload.addEventListener('progress', function (e) {
            if (e.lengthComputable) {
                var pct = Math.round((e.loaded / e.total) * 100);
                if (fillEl) fillEl.style.width = pct + '%';
                if (pctEl) pctEl.textContent = pct + '%';
                if (pct >= 100) {
                    if (labelEl) labelEl.textContent = '서버 처리중...';
                    if (fillEl) fillEl.classList.add('processing');
                }
            }
        });

        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            var res;
            try { res = JSON.parse(xhr.responseText); } catch (e) { res = {}; }
            if (res.success) {
                // 완료 애니메이션
                if (fillEl) { fillEl.style.width = '100%'; fillEl.classList.remove('processing'); fillEl.classList.add('complete'); }
                if (pctEl) pctEl.textContent = '100%';
                if (labelEl) labelEl.textContent = '완료!';
                setTimeout(function () {
                    closeMessageModal('qt-upload-modal');
                    if (progressEl) progressEl.hidden = true;
                    showMessage((res.imported || 0) + '건이 업로드되었습니다.');
                    _uploadFile = null;
                    load(searchInput ? searchInput.value.trim() : '');
                }, 600);
            } else {
                if (progressEl) progressEl.hidden = true;
                if (confirmBtn) confirmBtn.disabled = false;
                showMessage(res.message || '업로드 실패', '오류');
            }
        };
        xhr.send(formData);
    }

    // ── 초기화 ───────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        tbody = $('qt-tbody');
        emptyBox = $('qt-empty');
        searchInput = $('qt-search');
        checkAll = $('qt-check-all');
        countBadge = $('qt-count');

        // ── 검색 ────────────────────────────────────────
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                clearTimeout(_searchTimer);
                _searchTimer = setTimeout(function () {
                    load(searchInput.value.trim());
                }, 300);
            });
        }
        var clearBtn = $('qt-search-clear');
        if (clearBtn && searchInput) {
            clearBtn.addEventListener('click', function () {
                searchInput.value = '';
                load('');
            });
        }

        // ── 전체 선택 ───────────────────────────────────
        if (checkAll) {
            checkAll.addEventListener('change', function () {
                _selected.clear();
                if (checkAll.checked) {
                    for (var i = 0; i < _rows.length; i++) _selected.add(_rows[i].id);
                }
                syncRowClasses();
                updateCheckAll();
            });
        }

        // ── 추가 모달 ────────────────────────────────────
        var addBtn = $('qt-add-btn');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                // 폼 초기화
                var form = $('qt-add-form');
                if (form) form.reset();
                openMessageModal('qt-add-modal');
                // 첫 입력 필드 포커스
                var firstInput = document.querySelector('#qt-add-form .form-input');
                if (firstInput) setTimeout(function(){ firstInput.focus(); }, 120);
            });
        }
        // 추가 모달 닫기
        $('qt-add-close')?.addEventListener('click', function () { closeMessageModal('qt-add-modal'); });
        // 추가 모달 등록 버튼
        $('qt-add-save')?.addEventListener('click', function () { saveFromAddModal(); });
        // 추가 모달 Enter → 등록
        var addForm = $('qt-add-form');
        if (addForm) {
            addForm.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); saveFromAddModal(); }
            });
        }

        // ── 삭제 (아이콘 버튼) ──────────────────────────
        var deleteBtn = $('qt-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function () {
                var ids = [];
                _selected.forEach(function (id) { ids.push(id); });
                if (!ids.length) { showMessage('삭제할 항목을 선택하세요.', '알림'); return; }
                _pendingDeleteIds = ids;
                var sub = $('qt-delete-subtitle');
                if (sub) sub.textContent = '선택된 ' + ids.length + '건의 항목을 정말 삭제처리하시겠습니까?';
                openMessageModal('qt-delete-modal');
            });
        }
        $('qt-delete-close')?.addEventListener('click', function () { closeMessageModal('qt-delete-modal'); });
        $('qt-delete-confirm')?.addEventListener('click', function () {
            closeMessageModal('qt-delete-modal');
            doDelete(_pendingDeleteIds);
        });

        // ── 알림 모달 (온프레미스 동일) ─────────────────────
        $('qt-message-close')?.addEventListener('click', function () { closeMessageModal('qt-message-modal'); });
        $('qt-message-ok')?.addEventListener('click', function () { closeMessageModal('qt-message-modal'); });

        // Escape 키로 모든 모달 닫기
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closeMessageModal('qt-message-modal');
                closeMessageModal('qt-upload-modal');
                closeMessageModal('qt-add-modal');
                closeMessageModal('qt-delete-modal');
            }
        });

        // ── CSV 다운로드 ────────────────────────────────
        var dlBtn = $('qt-download-btn');
        if (dlBtn) {
            dlBtn.addEventListener('click', function () {
                exportCSV();
            });
        }

        // ── 업로드 ──────────────────────────────────────
        var uploadBtn = $('qt-upload-btn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', function () {
                _uploadFile = null;
                var meta = $('qt-upload-meta'); if (meta) meta.hidden = true;
                var chip = $('qt-upload-file-chip'); if (chip) chip.textContent = '';
                var input = $('qt-upload-input'); if (input) input.value = '';
                var confirmBtn = $('qt-upload-confirm'); if (confirmBtn) confirmBtn.disabled = true;
                var prog = $('qt-upload-progress'); if (prog) prog.hidden = true;
                openMessageModal('qt-upload-modal');
                initUploadAnim();
            });
        }
        $('qt-upload-close')?.addEventListener('click', function () { closeMessageModal('qt-upload-modal'); });
        $('qt-upload-confirm')?.addEventListener('click', function () { doUpload(); });

        // 드롭존
        var dz = $('qt-upload-dropzone');
        var fileInput = $('qt-upload-input');
        if (dz && fileInput) {
            dz.addEventListener('click', function () { fileInput.click(); });
            fileInput.addEventListener('change', function () {
                if (fileInput.files && fileInput.files[0]) handleUploadFile(fileInput.files[0]);
            });
            dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('dragover'); });
            dz.addEventListener('dragleave', function () { dz.classList.remove('dragover'); });
            dz.addEventListener('drop', function (e) {
                e.preventDefault();
                dz.classList.remove('dragover');
                if (e.dataTransfer.files && e.dataTransfer.files[0]) handleUploadFile(e.dataTransfer.files[0]);
            });
        }

        // 업로드 템플릿 다운로드
        var tplBtn = $('qt-upload-template');
        if (tplBtn) {
            tplBtn.addEventListener('click', function (e) {
                e.preventDefault();
                downloadTemplate();
            });
        }

        // ── 테이블 이벤트 위임 ──────────────────────────
        if (tbody) {
            tbody.addEventListener('click', function (e) {
                var btn = e.target.closest('.action-btn');
                if (btn) {
                    var action = btn.getAttribute('data-action');

                    // 수정 버튼
                    if (action === 'edit') {
                        var idx = Number(btn.getAttribute('data-idx'));
                        if (_editingId !== null) {
                            showMessage('현재 편집 중인 행을 먼저 저장하거나 취소하세요.', '알림');
                            return;
                        }
                        if (_rows[idx]) {
                            _editingId = _rows[idx].id;
                            render();
                            var editTr = tbody.querySelector('tr.qt-editing');
                            if (editTr) {
                                var firstInput = editTr.querySelector('input[type=text]');
                                if (firstInput) firstInput.focus();
                            }
                        }
                        return;
                    }

                    // 저장 버튼
                    if (action === 'save') { saveEditingRow(); return; }

                    // 취소 버튼
                    if (action === 'cancel') { cancelEditing(); return; }
                    return;
                }

                // 체크박스 직접 클릭은 change 이벤트로 처리
                if (e.target.type === 'checkbox') return;
                // 관리 버튼 영역 제외
                if (e.target.closest('.system-actions')) return;

                // 행 클릭 시 체크박스 토글 (온프레미스 동일)
                var tr = e.target.closest('tr');
                if (!tr || tr.classList.contains('qt-editing')) return;
                var cb = tr.querySelector('input[type=checkbox]');
                if (!cb || cb.disabled) return;
                cb.checked = !cb.checked;
                cb.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }

        // ── 페이지 크기 셀렉터 ──────────────────────────
        var pageSizeSel = $('qt-page-size');
        if (pageSizeSel) {
            pageSizeSel.addEventListener('change', function (e) {
                _pageSize = parseInt(e.target.value, 10) || 10;
                _page = 1;
                render();
            });
        }

        // ── 페이지네이션 버튼 ───────────────────────────
        var firstBtn = $('qt-first');
        if (firstBtn) firstBtn.addEventListener('click', function () { goToPage(1); });
        var prevBtn = $('qt-prev');
        if (prevBtn) prevBtn.addEventListener('click', function () { goToPage(_page - 1); });
        var nextBtn = $('qt-next');
        if (nextBtn) nextBtn.addEventListener('click', function () { goToPage(_page + 1); });
        var lastBtn = $('qt-last');
        if (lastBtn) lastBtn.addEventListener('click', function () { goToPage(totalPages()); });

        // 페이지 번호 클릭
        var pageNums = $('qt-page-numbers');
        if (pageNums) {
            pageNums.addEventListener('click', function (e) {
                var btn = e.target.closest('.page-btn');
                if (btn) goToPage(Number(btn.getAttribute('data-page')));
            });
        }

        // ── 초기 로드 ───────────────────────────────────
        load();
    });
})();
