/*
 * tab15-file.js
 * File/diagram tab behavior.
 */

(function () {
	'use strict';

	var _docKeydownRegistered = false;
	var _flDeleteModalWired = null;   // Track the actual DOM element wired
	var _flPendingDeleteLi = null;
	var _flDeleteCallback = null;

	function flOpenDeleteModal(li, onConfirm) {
		var modal = document.getElementById('fl-delete-modal');
		if (!modal) { if (onConfirm) onConfirm(); return; }
		_flPendingDeleteLi = li;
		_flDeleteCallback = onConfirm || null;
		var nameEl = li ? li.querySelector('.file-chip .name') : null;
		var nameNode = document.getElementById('fl-delete-file-name');
		var msgText = document.getElementById('fl-delete-msg-text');
		var fileName = nameEl ? String(nameEl.textContent || '').trim() : '';
		if (nameNode && msgText) {
			if (fileName) {
				nameNode.textContent = '“' + fileName + '”';
				nameNode.hidden = false;
				msgText.textContent = ' 파일을 삭제하시겠습니까?';
			} else {
				nameNode.textContent = '';
				nameNode.hidden = true;
				msgText.textContent = '이 파일을 삭제하시겠습니까?';
			}
		} else {
			var msg = document.getElementById('fl-delete-msg');
			if (msg) {
				msg.textContent = fileName
					? '“' + fileName + '” 파일을 삭제하시겠습니까?'
					: '이 파일을 삭제하시겠습니까?';
			}
		}
		modal.classList.add('show');
		modal.setAttribute('aria-hidden', 'false');
		document.body.classList.add('modal-open');
	}

	// Expose globally so blossom.js BlossomTab15File can use it
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
		if (!modal) return;
		if (_flDeleteModalWired === modal) return;
		_flDeleteModalWired = modal;
		var confirmBtn = document.getElementById('fl-delete-confirm');
		var cancelBtn = document.getElementById('fl-delete-cancel');
		var closeBtn = document.getElementById('fl-delete-close');
		if (confirmBtn) confirmBtn.addEventListener('click', flPerformDelete);
		if (cancelBtn) cancelBtn.addEventListener('click', flCloseDeleteModal);
		if (closeBtn) closeBtn.addEventListener('click', flCloseDeleteModal);
		if (modal) {
			modal.addEventListener('click', function (e) { if (e.target === modal) flCloseDeleteModal(); });
		}
		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape' && modal && modal.classList.contains('show')) flCloseDeleteModal();
		});
	}

	// Utilities

	function getInitRoot() {
		try {
			return document.querySelector('main.main-content') || document.body;
		} catch (_) {
			return document.body;
		}
	}

	// Init

	

	

	

	function initTab15File() {
		wireFlDeleteModal();

		var root = getInitRoot();
		try {
			if (root && root.dataset && root.dataset.tab15FileInit === '1') return;
		} catch (_) {}

		// Prefer the DB-backed generic implementation if available.
		// This file remains as a legacy fallback only.
		try {
			if (window.BlossomTab15File && typeof window.BlossomTab15File.initFromPage === 'function') {
				var ok = window.BlossomTab15File.initFromPage();
					try { if (root && root.dataset) root.dataset.tab15FileInit = '1'; } catch (_) {}
				if (ok) return;
				// If it cannot init (missing selection context), avoid wiring a UI-only fallback
				// that would mislead users into thinking files are saved.
				return;
			}
		} catch (_) {
			// ignore and fall back
		}

		try { if (root && root.dataset) root.dataset.tab15FileInit = '1'; } catch (_) {}

		var noticeModal = document.getElementById('file-notice-modal');
		var noticeText = document.getElementById('file-notice-text');
		var noticeOk = document.getElementById('file-notice-ok');
		var noticeClose = document.getElementById('file-notice-close');

		function showNotice(msg) {
			if (noticeText) noticeText.textContent = msg;
			if (noticeModal) {
				noticeModal.classList.add('show');
				noticeModal.setAttribute('aria-hidden', 'false');
				document.body.classList.add('modal-open');
			} else {
				try {
					
					alert(msg);
				} catch (_) {
					console.warn(msg);
				}
			}
		}

		function hideNotice() {
			if (!noticeModal) return;
			noticeModal.classList.remove('show');
			noticeModal.setAttribute('aria-hidden', 'true');
			document.body.classList.remove('modal-open');
		}

		if (noticeOk) {
			noticeOk.addEventListener('click', function (e) {
				e.preventDefault();
				hideNotice();
			});
		}
		if (noticeClose) {
			noticeClose.addEventListener('click', function (e) {
				e.preventDefault();
				hideNotice();
			});
		}
		if (noticeModal) {
			noticeModal.addEventListener('click', function (e) {
				if (e.target === noticeModal) hideNotice();
			});
			if (!_docKeydownRegistered) {
				_docKeydownRegistered = true;
				document.addEventListener('keydown', function (e) {
					if (e.key === 'Escape' && noticeModal.classList.contains('show')) hideNotice();
				});
			}
		}

		
		var diagramBox = document.getElementById('fi-diagram-box');
		var diagramInput = document.getElementById('fi-diagram-input');
		var diagramImg = document.getElementById('fi-diagram-img');
		var diagramEmpty = document.getElementById('fi-diagram-empty');
		var diagramClear = document.getElementById('fi-diagram-clear');

		function setDiagramHasImage(has) {
			if (!diagramBox) return;
			diagramBox.classList.toggle('has-image', !!has);
		}

		function clearDiagramPreview() {
			if (diagramImg) {
				diagramImg.removeAttribute('src');
				diagramImg.hidden = true;
			}
			if (diagramEmpty) {
				diagramEmpty.hidden = false;
			}
			setDiagramHasImage(false);
		}

		function setDiagramFile(file) {
			if (!file) {
				clearDiagramPreview();
				return;
			}

			var mime = (file.type || '').toLowerCase();
			var name = (file.name || '').toLowerCase();
			var ok = mime.startsWith('image/') && (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg'));
			if (!ok) {
				clearDiagramPreview();
				showNotice('지원하지 않는 이미지 형식입니다. (png/jpg/jpeg만 허용)');
				return;
			}

			var url = URL.createObjectURL(file);
			if (diagramImg) {
				diagramImg.src = url;
				diagramImg.hidden = false;
				if (diagramEmpty) diagramEmpty.hidden = true;
				setDiagramHasImage(true);
			} else {
				if (diagramEmpty) diagramEmpty.textContent = '파일이 선택되었습니다. 다시 선택하려면 클릭하세요';
				setDiagramHasImage(true);
			}
		}

		function pickDiagram() {
			if (diagramInput) diagramInput.click();
		}

		if (diagramBox) {
			diagramBox.addEventListener('click', pickDiagram);
			diagramBox.addEventListener('keypress', function (e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					pickDiagram();
				}
			});

			['dragenter', 'dragover'].forEach(function (evName) {
				diagramBox.addEventListener(evName, function (e) {
					e.preventDefault();
					e.stopPropagation();
					diagramBox.classList.add('dragover');
				});
			});
			['dragleave', 'drop'].forEach(function (evName) {
				diagramBox.addEventListener(evName, function (e) {
					e.preventDefault();
					e.stopPropagation();
					diagramBox.classList.remove('dragover');
					if (evName === 'drop') {
						var dt = e.dataTransfer;
						if (dt && dt.files && dt.files[0]) setDiagramFile(dt.files[0]);
					}
				});
			});
		}
		if (diagramInput) {
			diagramInput.addEventListener('change', function () {
				var file = this.files && this.files[0];
				setDiagramFile(file || null);
			});
		}
		if (diagramClear) {
			diagramClear.addEventListener('click', function () {
				var fakeLi = document.createElement('li');
				fakeLi.innerHTML = '<div class="file-chip"><span class="name">대표 구성도</span></div>';
				flOpenDeleteModal(fakeLi, function () {
					if (diagramInput) diagramInput.value = '';
					clearDiagramPreview();
				});
			});
		}

		
		var attachInput = document.getElementById('fi-attach-input');
		var attachDrop = document.getElementById('fi-attach-drop');
		var attachList = document.getElementById('fi-attach-list');
		var attachCount = document.getElementById('fi-attach-count');

		function badge(ext) {
			return '<span class="file-badge">' + String(ext || '').toUpperCase() + '</span>';
		}
		function humanSize(bytes) {
			try {
				if (typeof bytes === 'string') return bytes;
				if (bytes === 0) return '0 B';
				if (!bytes) return '-';
				var i = Math.floor(Math.log(bytes) / Math.log(1024));
				var units = ['B', 'KB', 'MB', 'GB', 'TB'];
				return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
			} catch (_) {
				return String(bytes || '-');
			}
		}
		function updateCount() {
			if (!attachCount) return;
			var n = attachList ? attachList.querySelectorAll('li').length : 0;
			attachCount.textContent = String(n);
			attachCount.classList.remove('large-number', 'very-large-number');
			if (n >= 100) attachCount.classList.add('very-large-number');
			else if (n >= 10) attachCount.classList.add('large-number');
		}

		function addAttachmentItem(file) {
			if (!attachList || !file) return;
			var li = document.createElement('li');
			var ext = (String(file.name || '').split('.').pop() || '').slice(0, 6);
			li.className = 'attach-item';
			li.innerHTML =
				'<div class="file-chip">' +
				badge(ext) +
				'<span class="name">' +
				String(file.name || '') +
				'</span>' +
				'<span class="size">' +
				humanSize(file.size) +
				'</span>' +
				'</div>' +
				'<div class="chip-actions">' +
				'<button class="icon-btn" type="button" title="다운로드" aria-label="다운로드" disabled aria-disabled="true">' +
				'<img src="/static/image/svg/list/free-icon-download.svg" alt="다운" class="action-icon">' +
				'</button>' +
				'<button class="icon-btn danger js-att-del" type="button" title="삭제" aria-label="삭제">' +
				'<img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">' +
				'</button>' +
				'</div>';
			attachList.appendChild(li);
			updateCount();
		}

		function handleFiles(files) {
			if (!files || !attachList) return;

			var MAX_FILES = 5;
			var MAX_SIZE = 10 * 1024 * 1024; 

			var currentCount = attachList.querySelectorAll('li').length;
			var existingNames = new Set();
			try {
				attachList.querySelectorAll('.file-chip .name').forEach(function (n) {
					existingNames.add((n.textContent || '').toLowerCase());
				});
			} catch (_) {}

			var accepted = [];
			var dup = [];
			var oversize = [];
			var overlimit = false;

			Array.from(files).forEach(function (file) {
				if (currentCount + accepted.length >= MAX_FILES) {
					overlimit = true;
					return;
				}
				if (file.size > MAX_SIZE) {
					oversize.push(file.name);
					return;
				}
				var key = (file.name || '').toLowerCase();
				var inBatchDup = accepted.some(function (a) {
					return (a.name || '').toLowerCase() === key;
				});
				if (existingNames.has(key) || inBatchDup) {
					dup.push(file.name);
					return;
				}
				accepted.push(file);
				existingNames.add(key);
			});

			accepted.forEach(addAttachmentItem);

			if (dup.length || oversize.length || overlimit) {
				var messages = [];
				if (dup.length) messages.push('중복 파일 제외: ' + dup.join(', '));
				if (oversize.length) messages.push('10MB 초과 파일 제외: ' + oversize.join(', '));
				if (overlimit) messages.push('파일은 최대 5개까지 업로드할 수 있습니다.');
				showNotice(messages.join('\n'));
			}
		}

		if (attachInput) {
			attachInput.addEventListener('change', function () {
				handleFiles(this.files);
				this.value = '';
			});
		}
		if (attachDrop) {
			attachDrop.addEventListener('click', function () {
				if (attachInput) attachInput.click();
			});
			['dragenter', 'dragover'].forEach(function (evName) {
				attachDrop.addEventListener(evName, function (e) {
					e.preventDefault();
					e.stopPropagation();
					attachDrop.classList.add('dragover');
				});
			});
			['dragleave', 'drop'].forEach(function (evName) {
				attachDrop.addEventListener(evName, function (e) {
					e.preventDefault();
					e.stopPropagation();
					attachDrop.classList.remove('dragover');
					if (evName === 'drop') {
						var dt = e.dataTransfer;
						if (dt && dt.files) handleFiles(dt.files);
					}
				});
			});
		}
		if (attachList) {
			attachList.addEventListener('click', function (e) {
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

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', initTab15File);
	} else {
		initTab15File();
	}

	// SPA partial-navigation support
	document.addEventListener('blossom:pageLoaded', function () {
		try { initTab15File(); } catch (_) {}
	});
})();

