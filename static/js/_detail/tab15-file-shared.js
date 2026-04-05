/*
 * tab15-file-shared.js — 구성/파일 탭 공통 컴포넌트 JS
 * ──────────────────────────────────────────────────────
 * 모든 상세 페이지에서 동일한 동작을 보장하는 단일 진입점.
 *
 * 페이지별 차이는 HTML data-* 속성으로 주입:
 *   data-owner-key     → 파일 소유자 식별 키
 *   data-scope-key     → API scope (URL path기반)
 *   data-max-files     → 첨부파일 최대 개수 (기본 5)
 *   data-max-size-mb   → 파일 최대 크기 MB (기본 10)
 *   data-accept-images → 구성도 허용 확장자 (기본 "png,jpg,jpeg")
 *
 * 버전: 1.0 (2026-03-18)
 */
(function () {
    'use strict';

    /* ── 전역 상태 ────────────────────── */
    var _initialized = false;
    var _flDeleteModalWired = null;
    var _flPendingDeleteLi = null;
    var _flDeleteCallback = null;
    var _docEscRegistered = false;

    /* ── 설정 (data-* 에서 읽음) ──────── */
    var CFG = {
        maxFiles:     5,
        maxSizeMB:    10,
        acceptImages: ['png', 'jpg', 'jpeg']
    };

    /* ══════════════════════════════════════
       삭제 확인 모달
       ══════════════════════════════════════ */
    function flOpenDeleteModal(li, onConfirm) {
        var modal = document.getElementById('fl-delete-modal');
        if (!modal) { if (onConfirm) onConfirm(); return; }
        _flPendingDeleteLi = li;
        _flDeleteCallback = onConfirm || null;
        var nameEl = li ? li.querySelector('.t15-file-name') : null;
        if (!nameEl) nameEl = li ? li.querySelector('.file-chip .name') : null;
        var nameNode = document.getElementById('fl-delete-file-name');
        var msgText = document.getElementById('fl-delete-msg-text');
        var fileName = nameEl ? String(nameEl.textContent || '').trim() : '';
        if (nameNode && msgText) {
            if (fileName) {
                nameNode.textContent = '\u201c' + fileName + '\u201d';
                nameNode.hidden = false;
                msgText.textContent = ' \ud30c\uc77c\uc744 \uc0ad\uc81c\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?';
            } else {
                nameNode.textContent = '';
                nameNode.hidden = true;
                msgText.textContent = '\uc774 \ud30c\uc77c\uc744 \uc0ad\uc81c\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?';
            }
        } else {
            var msg = document.getElementById('fl-delete-msg');
            if (msg) {
                msg.textContent = fileName
                    ? '\u201c' + fileName + '\u201d \ud30c\uc77c\uc744 \uc0ad\uc81c\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?'
                    : '\uc774 \ud30c\uc77c\uc744 \uc0ad\uc81c\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?';
            }
        }
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
    }
    window.flOpenDeleteModal = flOpenDeleteModal;

    function flCloseDeleteModal() {
        var modal = document.getElementById('fl-delete-modal');
        if (modal) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
        }
        document.body.classList.remove('modal-open');
        _flPendingDeleteLi = null;
        _flDeleteCallback = null;
    }

    function flPerformDelete() {
        var cb = _flDeleteCallback;
        flCloseDeleteModal();
        if (cb) cb();
    }

    function wireFlDeleteModal() {
        var modal = document.getElementById('fl-delete-modal');
        if (!modal || _flDeleteModalWired === modal) return;
        _flDeleteModalWired = modal;
        var confirmBtn = document.getElementById('fl-delete-confirm');
        var cancelBtn  = document.getElementById('fl-delete-cancel');
        var closeBtn   = document.getElementById('fl-delete-close');
        if (confirmBtn) confirmBtn.addEventListener('click', flPerformDelete);
        if (cancelBtn)  cancelBtn.addEventListener('click', flCloseDeleteModal);
        if (closeBtn)   closeBtn.addEventListener('click', flCloseDeleteModal);
        modal.addEventListener('click', function (e) { if (e.target === modal) flCloseDeleteModal(); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal.classList.contains('show')) flCloseDeleteModal();
        });
    }

    /* ══════════════════════════════════════
       다운로드 확인 모달
       ══════════════════════════════════════ */
    var _flDownloadPendingLi = null;
    var _flDownloadModalWired = null;

    function flOpenDownloadModal(li) {
        var modal = document.getElementById('fl-download-modal');
        if (!modal) return;
        _flDownloadPendingLi = li;
        var nameEl = li ? li.querySelector('.t15-file-name') : null;
        var msg = document.getElementById('fl-download-msg');
        if (msg) {
            msg.textContent = nameEl
                ? '\u201c' + nameEl.textContent + '\u201d \ud30c\uc77c\uc744 \ub2e4\uc6b4\ub85c\ub4dc\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?'
                : '\ud30c\uc77c\uc744 \ub2e4\uc6b4\ub85c\ub4dc\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?';
        }
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
    }
    window.flOpenDownloadModal = flOpenDownloadModal;

    function flCloseDownloadModal() {
        var modal = document.getElementById('fl-download-modal');
        if (!modal) return;
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        _flDownloadPendingLi = null;
    }

    function flPerformDownload() {
        var li = _flDownloadPendingLi;
        flCloseDownloadModal();
        if (!li) return;
        var href = li.dataset ? (li.dataset.downloadUrl || '') : '';
        if (href) {
            var link = document.createElement('a');
            link.href = href;
            link.download = '';
            link.rel = 'noopener';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            var nameEl = li.querySelector('.t15-file-name');
            if (nameEl) console.log('[tab15] Download requested (no URL):', nameEl.textContent);
        }
    }

    function wireFlDownloadModal() {
        var modal = document.getElementById('fl-download-modal');
        if (!modal || _flDownloadModalWired === modal) return;
        _flDownloadModalWired = modal;
        var confirmBtn = document.getElementById('fl-download-confirm');
        var cancelBtn  = document.getElementById('fl-download-cancel');
        var closeBtn   = document.getElementById('fl-download-close');
        if (confirmBtn) confirmBtn.addEventListener('click', flPerformDownload);
        if (cancelBtn)  cancelBtn.addEventListener('click', flCloseDownloadModal);
        if (closeBtn)   closeBtn.addEventListener('click', flCloseDownloadModal);
        modal.addEventListener('click', function (e) { if (e.target === modal) flCloseDownloadModal(); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal.classList.contains('show')) flCloseDownloadModal();
        });
    }

    /* ══════════════════════════════════════
       안내 모달
       ══════════════════════════════════════ */
    function initNoticeModal() {
        var noticeModal = document.getElementById('file-notice-modal');
        var noticeText  = document.getElementById('file-notice-text');
        var noticeOk    = document.getElementById('file-notice-ok');
        var noticeClose = document.getElementById('file-notice-close');

        function showNotice(msg) {
            if (noticeText) noticeText.textContent = msg;
            if (noticeModal) {
                noticeModal.classList.add('show');
                noticeModal.setAttribute('aria-hidden', 'false');
                document.body.classList.add('modal-open');
            } else {
                try { alert(msg); } catch (_) { console.warn(msg); }
            }
        }
        function hideNotice() {
            if (!noticeModal) return;
            noticeModal.classList.remove('show');
            noticeModal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
        }
        if (noticeOk)    noticeOk.addEventListener('click', function (e) { e.preventDefault(); hideNotice(); });
        if (noticeClose) noticeClose.addEventListener('click', function (e) { e.preventDefault(); hideNotice(); });
        if (noticeModal) {
            noticeModal.addEventListener('click', function (e) { if (e.target === noticeModal) hideNotice(); });
            if (!_docEscRegistered) {
                _docEscRegistered = true;
                document.addEventListener('keydown', function (e) {
                    if (e.key === 'Escape' && noticeModal.classList.contains('show')) hideNotice();
                });
            }
        }
        return showNotice;
    }

    /* ══════════════════════════════════════
       유틸리티
       ══════════════════════════════════════ */
    function badge(ext) {
        return '<span class="t15-file-badge">' + String(ext || '').toUpperCase() + '</span>';
    }
    function humanSize(bytes) {
        try {
            if (typeof bytes === 'string') return bytes;
            if (bytes === 0) return '0 B';
            if (!bytes) return '-';
            var i = Math.floor(Math.log(bytes) / Math.log(1024));
            var units = ['B', 'KB', 'MB', 'GB', 'TB'];
            return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
        } catch (_) { return String(bytes || '-'); }
    }

    /* ══════════════════════════════════════
       구성도 (Diagram)
       ══════════════════════════════════════ */
    function initDiagram(showNotice) {
        var box   = document.getElementById('fi-diagram-box');
        var input = document.getElementById('fi-diagram-input');
        var img   = document.getElementById('fi-diagram-img');
        var empty = document.getElementById('fi-diagram-empty');
        var clear = document.getElementById('fi-diagram-clear');

        function setHasImage(has) { if (box) box.classList.toggle('has-image', !!has); }

        function clearPreview() {
            if (img) { img.removeAttribute('src'); img.hidden = true; }
            if (empty) empty.hidden = false;
            setHasImage(false);
        }

        function setFile(file) {
            if (!file) { clearPreview(); return; }
            var mime = (file.type || '').toLowerCase();
            var name = (file.name || '').toLowerCase();
            var exts = CFG.acceptImages;
            var extOk = exts.some(function (ext) { return name.endsWith('.' + ext); });
            if (!mime.startsWith('image/') || !extOk) {
                clearPreview();
                showNotice('\uc9c0\uc6d0\ud558\uc9c0 \uc54a\ub294 \uc774\ubbf8\uc9c0 \ud615\uc2dd\uc785\ub2c8\ub2e4. (' + exts.join('/') + '\ub9cc \ud5c8\uc6a9)');
                return;
            }
            var url = URL.createObjectURL(file);
            if (img) { img.src = url; img.hidden = false; if (empty) empty.hidden = true; setHasImage(true); }
            else { if (empty) empty.textContent = '\ud30c\uc77c\uc774 \uc120\ud0dd\ub418\uc5c8\uc2b5\ub2c8\ub2e4.'; setHasImage(true); }
        }

        if (box) {
            box.addEventListener('click', function () { if (input) input.click(); });
            box.addEventListener('keypress', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (input) input.click(); } });
            ['dragenter', 'dragover'].forEach(function (ev) {
                box.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); box.classList.add('dragover'); });
            });
            ['dragleave', 'drop'].forEach(function (ev) {
                box.addEventListener(ev, function (e) {
                    e.preventDefault(); e.stopPropagation(); box.classList.remove('dragover');
                    if (ev === 'drop') { var dt = e.dataTransfer; if (dt && dt.files && dt.files[0]) setFile(dt.files[0]); }
                });
            });
        }
        if (input) input.addEventListener('change', function () { setFile(this.files && this.files[0]); });
        if (clear) {
            clear.addEventListener('click', function (e) {
                e.stopPropagation();
                var fakeLi = document.createElement('li');
                fakeLi.innerHTML = '<div class="t15-file-chip"><span class="t15-file-name">\ub300\ud45c \uad6c\uc131\ub3c4</span></div>';
                flOpenDeleteModal(fakeLi, function () {
                    if (input) input.value = '';
                    clearPreview();
                });
            });
        }
    }

    /* ══════════════════════════════════════
       첨부파일 (Attachments)
       ══════════════════════════════════════ */
    function initAttachments(showNotice) {
        var input = document.getElementById('fi-attach-input');
        var drop  = document.getElementById('fi-attach-drop');
        var list  = document.getElementById('fi-attach-list');
        var count = document.getElementById('fi-attach-count');

        function updateCount() {
            if (!count) return;
            var n = list ? list.querySelectorAll('li').length : 0;
            count.textContent = String(n);
            count.classList.remove('large-number', 'very-large-number');
            if (n >= 100) count.classList.add('very-large-number');
            else if (n >= 10) count.classList.add('large-number');
            if (drop) drop.style.display = (n >= CFG.maxFiles) ? 'none' : '';
        }

        function addItem(file) {
            if (!list || !file) return;
            var li = document.createElement('li');
            var ext = (String(file.name || '').split('.').pop() || '').slice(0, 6);
            li.className = 't15-attach-item';
            li.innerHTML =
                '<div class="t15-file-chip">' +
                    badge(ext) +
                    '<span class="t15-file-name">' + String(file.name || '') + '</span>' +
                    '<span class="t15-file-size">' + humanSize(file.size) + '</span>' +
                '</div>' +
                '<div class="t15-chip-actions">' +
                    '<button class="t15-icon-btn js-att-dl" type="button" title="\ub2e4\uc6b4\ub85c\ub4dc" aria-label="\ub2e4\uc6b4\ub85c\ub4dc">' +
                        '<img src="/static/image/svg/list/free-icon-download.svg" alt="\ub2e4\uc6b4" class="t15-action-icon">' +
                    '</button>' +
                    '<button class="t15-icon-btn danger js-att-del" type="button" title="\uc0ad\uc81c" aria-label="\uc0ad\uc81c">' +
                        '<img src="/static/image/svg/list/free-icon-trash.svg" alt="\uc0ad\uc81c" class="t15-action-icon">' +
                    '</button>' +
                '</div>';
            list.appendChild(li);
            updateCount();
        }

        function handleFiles(files) {
            if (!files || !list) return;
            var MAX_FILES = CFG.maxFiles;
            var MAX_SIZE = CFG.maxSizeMB * 1024 * 1024;
            var currentCount = list.querySelectorAll('li').length;
            var existingNames = {};
            try {
                var nameEls = list.querySelectorAll('.t15-file-name');
                for (var i = 0; i < nameEls.length; i++) {
                    existingNames[(nameEls[i].textContent || '').toLowerCase()] = true;
                }
            } catch (_) {}

            var accepted = [];
            var dup = [];
            var oversize = [];
            var overlimit = false;

            var arr = [];
            for (var j = 0; j < files.length; j++) arr.push(files[j]);

            arr.forEach(function (file) {
                if (currentCount + accepted.length >= MAX_FILES) { overlimit = true; return; }
                if (file.size > MAX_SIZE) { oversize.push(file.name); return; }
                var key = (file.name || '').toLowerCase();
                var inBatch = accepted.some(function (a) { return (a.name || '').toLowerCase() === key; });
                if (existingNames[key] || inBatch) { dup.push(file.name); return; }
                accepted.push(file);
                existingNames[key] = true;
            });

            accepted.forEach(addItem);
            if (dup.length || oversize.length || overlimit) {
                var messages = [];
                if (dup.length) messages.push('\uc911\ubcf5 \ud30c\uc77c \uc81c\uc678: ' + dup.join(', '));
                if (oversize.length) messages.push(CFG.maxSizeMB + 'MB \ucd08\uacfc \ud30c\uc77c \uc81c\uc678: ' + oversize.join(', '));
                if (overlimit) messages.push('\ud30c\uc77c\uc740 \ucd5c\ub300 ' + MAX_FILES + '\uac1c\uae4c\uc9c0 \uc5c5\ub85c\ub4dc\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.');
                showNotice(messages.join('\n'));
            }
        }

        if (input) input.addEventListener('change', function () { handleFiles(this.files); this.value = ''; });
        if (drop) {
            drop.addEventListener('click', function () { if (input) input.click(); });
            ['dragenter', 'dragover'].forEach(function (ev) {
                drop.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); drop.classList.add('dragover'); });
            });
            ['dragleave', 'drop'].forEach(function (ev) {
                drop.addEventListener(ev, function (e) {
                    e.preventDefault(); e.stopPropagation(); drop.classList.remove('dragover');
                    if (ev === 'drop') { var dt = e.dataTransfer; if (dt && dt.files) handleFiles(dt.files); }
                });
            });
        }
        if (list) {
            list.addEventListener('click', function (e) {
                var dlBtn = e.target.closest('.js-att-dl');
                if (dlBtn) {
                    var li = e.target.closest('li');
                    if (li) flOpenDownloadModal(li);
                    return;
                }
                var btn = e.target.closest('.js-att-del');
                if (!btn) return;
                var li = e.target.closest('li');
                if (li && li.parentNode) {
                    flOpenDeleteModal(li, function () {
                        li.parentNode.removeChild(li);
                        updateCount();
                    });
                }
            });
        }
        updateCount();
    }

    /* ══════════════════════════════════════
       메인 초기화
       ══════════════════════════════════════ */
    function initTab15FileShared() {
        wireFlDeleteModal();
        wireFlDownloadModal();

        var root = document.querySelector('.tab15-file-root');
        if (!root) root = document.querySelector('main.main-content');
        if (!root) root = document.body;

        if (root.dataset && root.dataset.tab15Init === '1') return;

        // DB-backed implementation 우선 사용 (BlossomTab15File)
        try {
            if (window.BlossomTab15File && typeof window.BlossomTab15File.initFromPage === 'function') {
                var ok = window.BlossomTab15File.initFromPage();
                if (ok) {
                    try { if (root.dataset) root.dataset.tab15Init = '1'; } catch (_) {}
                    return;
                }
            }
        } catch (_) {}

        // 설정값 읽기 (data-* 속성)
        try {
            var main = document.querySelector('main.main-content') || root;
            if (main.dataset.maxFiles)   CFG.maxFiles = parseInt(main.dataset.maxFiles, 10) || 5;
            if (main.dataset.maxSizeMb)  CFG.maxSizeMB = parseInt(main.dataset.maxSizeMb, 10) || 10;
            if (main.dataset.acceptImages) CFG.acceptImages = main.dataset.acceptImages.split(',');
        } catch (_) {}

        try { if (root.dataset) root.dataset.tab15Init = '1'; } catch (_) {}

        var showNotice = initNoticeModal();
        initDiagram(showNotice);
        initAttachments(showNotice);
    }

    /* ── DOM Ready ──────────────────────── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTab15FileShared);
    } else {
        initTab15FileShared();
    }

    /* ── SPA 지원 ───────────────────────── */
    document.addEventListener('blossom:pageLoaded', function () {
        try { _initialized = false; initTab15FileShared(); } catch (_) {}
    });
})();
