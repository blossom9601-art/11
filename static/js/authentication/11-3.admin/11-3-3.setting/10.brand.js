/* ═══════════════════════════════════════════════
   브랜드 관리 JS (10.brand.js) v1.0.0
   ═══════════════════════════════════════════════ */
(function () {
	'use strict';

	/* ── 상수 ───────────────────────────────── */
	var API_BASE  = '/api/brand-settings';
	var FALLBACKS = {
		'brand.headerIcon': '/static/image/logo/blossom_logo.png',
		'brand.name':       'blossom',
		'brand.subtitle':   '',
		'dashboard.cardLogos.maintenance_cost_card': '/static/image/logo/bccard_logo.jpg'
	};
	var CARD_LABELS = {
		'maintenance_cost_card': '유지보수 비용 카드'
	};

	/* ── 상태 ───────────────────────────────── */
	var state = { settings: {}, loaded: false };

	/* ── 유틸 ───────────────────────────────── */
	function showStatus(statusId, msg, ok) {
		var el = document.getElementById(statusId);
		if (!el) return;
		el.textContent = msg;
		el.style.color = ok ? '#059669' : '#dc2626';
	}

	function showConfirm(msg, onOk) {
		var overlay = document.createElement('div');
		overlay.className = 'brand-modal-overlay';
		var box = document.createElement('div');
		box.className = 'brand-modal-box';
		var msgEl = document.createElement('p');
		msgEl.className = 'brand-modal-msg';
		msgEl.textContent = msg;
		var actions = document.createElement('div');
		actions.className = 'brand-modal-actions';
		var btnOk = document.createElement('button');
		btnOk.className = 'brand-modal-btn confirm';
		btnOk.textContent = '확인';
		var btnCancel = document.createElement('button');
		btnCancel.className = 'brand-modal-btn cancel';
		btnCancel.textContent = '취소';
		actions.appendChild(btnOk);
		actions.appendChild(btnCancel);
		box.appendChild(msgEl);
		box.appendChild(actions);
		overlay.appendChild(box);
		document.body.appendChild(overlay);
		function close() { document.body.removeChild(overlay); }
		btnOk.addEventListener('click', function () { close(); if (onOk) onOk(); });
		btnCancel.addEventListener('click', close);
		overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
	}

	function fallback(key) {
		return FALLBACKS[key] !== undefined ? FALLBACKS[key] : '';
	}

	/* ── API 호출 ──────────────────────────── */
	function fetchSettings(cb) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', API_BASE);
		xhr.setRequestHeader('Accept', 'application/json');
		xhr.onload = function () {
			try {
				var res = JSON.parse(xhr.responseText);
				if (res.success) {
					state.settings = {};
					(res.rows || []).forEach(function (r) {
						state.settings[r.key] = r;
					});
					state.loaded = true;
				}
			} catch (e) { /* ignore */ }
			if (cb) cb();
		};
		xhr.send();
	}

	function saveSetting(key, value, category, valueType, cb) {
		var statusId = (category === 'dashboard') ? 'cards-status' : 'header-status';
		var xhr = new XMLHttpRequest();
		xhr.open('POST', API_BASE);
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.onload = function () {
			try {
				var res = JSON.parse(xhr.responseText);
				if (res.success) {
					state.settings[key] = res.item;
					showStatus(statusId, '저장되었습니다.', true);
				} else {
					showStatus(statusId, res.error || '저장 실패', false);
				}
			} catch (e) { showStatus(statusId, '저장 실패', false); }
			if (cb) cb();
		};
		xhr.send(JSON.stringify({
			key: key, value: value, category: category || 'header', value_type: valueType || 'text'
		}));
	}

	function uploadImage(file, key, category, cb) {
		var statusId = (category === 'dashboard') ? 'cards-status' : 'header-status';
		var fd = new FormData();
		fd.append('file', file);
		fd.append('key', key);
		fd.append('category', category || 'header');
		var xhr = new XMLHttpRequest();
		xhr.open('POST', API_BASE + '/upload');
		xhr.onload = function () {
			try {
				var res = JSON.parse(xhr.responseText);
				if (res.success) {
					state.settings[key] = res.item;
					showStatus(statusId, '이미지가 업로드되었습니다.', true);
				} else {
					showStatus(statusId, res.error || '업로드 실패', false);
				}
			} catch (e) { showStatus(statusId, '업로드 실패', false); }
			if (cb) cb();
		};
		xhr.send(fd);
	}

	function resetSetting(key, cb) {
		var xhr = new XMLHttpRequest();
		xhr.open('POST', API_BASE + '/reset');
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.onload = function () {
			try {
				var res = JSON.parse(xhr.responseText);
				if (res.success) {
					state.settings = {};
					(res.rows || []).forEach(function (r) { state.settings[r.key] = r; });
					showStatus('reset-status', '초기화되었습니다.', true);
				} else {
					showStatus('reset-status', res.error || '초기화 실패', false);
				}
			} catch (e) { showStatus('reset-status', '초기화 실패', false); }
			if (cb) cb();
		};
		xhr.send(key ? JSON.stringify({ key: key }) : '{}');
	}

	function deleteSetting(key, cb) {
		var xhr = new XMLHttpRequest();
		xhr.open('DELETE', API_BASE + '/' + encodeURIComponent(key));
		xhr.setRequestHeader('Accept', 'application/json');
		xhr.onload = function () {
			try {
				var res = JSON.parse(xhr.responseText);
				if (res.success) {
					delete state.settings[key];
					showStatus('cards-status', '삭제되었습니다.', true);
				} else {
					showStatus('cards-status', res.error || '삭제 실패', false);
				}
			} catch (e) { showStatus('cards-status', '삭제 실패', false); }
			if (cb) cb();
		};
		xhr.send();
	}

	/* ── 값 헬퍼 ───────────────────────────── */
	function val(key) {
		var s = state.settings[key];
		return (s && s.value) || fallback(key);
	}

	/* ── UI 렌더링 ─────────────────────────── */
	function renderHeader() {
		var iconImg = document.getElementById('header-icon-img');
		var nameInput = document.getElementById('brand-name-input');
		var subInput = document.getElementById('brand-subtitle-input');
		var previewIcon = document.getElementById('preview-header-icon');
		var previewName = document.getElementById('preview-brand-name');
		var previewSub = document.getElementById('preview-brand-subtitle');

		var iconUrl = val('brand.headerIcon');
		var name = val('brand.name');
		var sub = val('brand.subtitle');

		if (iconImg) { iconImg.src = iconUrl; iconImg.onerror = function () { this.src = fallback('brand.headerIcon'); }; }
		if (previewIcon) { previewIcon.src = iconUrl; previewIcon.onerror = function () { this.src = fallback('brand.headerIcon'); }; }
		if (nameInput) nameInput.value = name;
		if (subInput) subInput.value = sub;
		if (previewName) previewName.textContent = name || 'blossom';
		if (previewSub) previewSub.textContent = sub;
	}

	function renderCards() {
		var container = document.getElementById('card-logos-container');
		if (!container) return;
		container.innerHTML = '';
		var keys = Object.keys(state.settings).filter(function (k) {
			return k.indexOf('dashboard.cardLogos.') === 0;
		});
		// 메인 유지보수 카드가 없으면 폴백으로 추가
		if (keys.indexOf('dashboard.cardLogos.maintenance_cost_card') < 0) {
			keys.unshift('dashboard.cardLogos.maintenance_cost_card');
		}
		keys.forEach(function (fullKey) {
			var cardKey = fullKey.replace('dashboard.cardLogos.', '');
			var imgUrl = val(fullKey);
			var label = CARD_LABELS[cardKey] || cardKey;

			var row = document.createElement('div');
			row.className = 'brand-card-row';
			row.setAttribute('data-key', fullKey);
			row.innerHTML =
				'<div class="brand-card-info">' +
					'<span class="brand-card-key-label">' + escHtml(cardKey) + '</span>' +
					'<span class="brand-card-desc">' + escHtml(label) + '</span>' +
				'</div>' +
				'<div class="brand-upload-box small" data-key="' + escAttr(fullKey) + '" data-category="dashboard">' +
					'<div class="brand-upload-preview small">' +
						'<img src="' + escAttr(imgUrl) + '" alt="카드 로고" class="brand-card-logo-img"' +
						' onerror="this.src=\'/static/image/logo/blossom_logo.png\'">' +
					'</div>' +
					'<div class="brand-upload-actions">' +
						'<label class="brand-upload-btn small" title="변경">' +
							'<input type="file" accept=".png,.jpg,.jpeg,.svg" hidden><img src="/static/image/svg/free-icon-font-wallet-change.svg" alt="변경" class="btn-icon">' +
						'</label>' +
						'<button type="button" class="brand-reset-btn small" data-key="' + escAttr(fullKey) + '" title="초기화"><img src="/static/image/svg/free-icon-font-hourglass-start.svg" alt="초기화" class="btn-icon"></button>' +
						(FALLBACKS[fullKey] ? '' : '<button type="button" class="brand-card-delete-btn" data-key="' + escAttr(fullKey) + '" title="삭제"><img src="/static/image/svg/alarm/free-icon-font-trash-empty.svg" alt="삭제" class="btn-icon"></button>') +
					'</div>' +
				'</div>';
			container.appendChild(row);
		});
		// 바인딩
		bindCardEvents();
	}

	function escHtml(s) {
		var d = document.createElement('div');
		d.appendChild(document.createTextNode(s || ''));
		return d.innerHTML;
	}
	function escAttr(s) {
		return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
	}

	/* ── 이벤트 바인딩 ─────────────────────── */
	function bindHeaderEvents() {
		// 헤더 아이콘 파일 선택
		var uploadBox = document.getElementById('header-icon-upload');
		if (uploadBox) {
			var fileInput = uploadBox.querySelector('input[type="file"]');
			if (fileInput) {
				fileInput.addEventListener('change', function () {
					if (!this.files || !this.files[0]) return;
					var file = this.files[0];
					// 즉시 미리보기
					var url = URL.createObjectURL(file);
					var iconImg = document.getElementById('header-icon-img');
					var previewIcon = document.getElementById('preview-header-icon');
					if (iconImg) iconImg.src = url;
					if (previewIcon) previewIcon.src = url;
					// 업로드
					uploadImage(file, 'brand.headerIcon', 'header', function () {
						renderHeader();
						applyToPage();
					});
				});
			}
		}
		// 브랜드명 실시간 미리보기
		var nameInput = document.getElementById('brand-name-input');
		if (nameInput) {
			nameInput.addEventListener('input', function () {
				var pn = document.getElementById('preview-brand-name');
				if (pn) pn.textContent = this.value || 'blossom';
			});
		}
		// 보조 문구 실시간 미리보기
		var subInput = document.getElementById('brand-subtitle-input');
		if (subInput) {
			subInput.addEventListener('input', function () {
				var ps = document.getElementById('preview-brand-subtitle');
				if (ps) ps.textContent = this.value;
			});
		}
		// 헤더 아이콘 초기화 버튼
		var headerResetBtn = uploadBox && uploadBox.querySelector('.brand-reset-btn');
		if (headerResetBtn) {
			headerResetBtn.addEventListener('click', function () {
				resetSetting('brand.headerIcon', function () {
					renderHeader();
					applyToPage();
				});
			});
		}
		// 헤더 설정 저장
		var saveHeaderBtn = document.getElementById('btn-save-header');
		if (saveHeaderBtn) {
			saveHeaderBtn.addEventListener('click', function () {
				var name = (document.getElementById('brand-name-input') || {}).value || '';
				var sub = (document.getElementById('brand-subtitle-input') || {}).value || '';
				if (!name.trim()) { showStatus('header-status', '브랜드명은 비워둘 수 없습니다.', false); return; }
				saveSetting('brand.name', name.trim(), 'header', 'text', function () {
					saveSetting('brand.subtitle', sub.trim(), 'header', 'text', function () {
						renderHeader();
						applyToPage();
					});
				});
			});
		}
	}

	function bindCardEvents() {
		// 카드 파일 업로드
		var container = document.getElementById('card-logos-container');
		if (!container) return;
		var fileInputs = container.querySelectorAll('input[type="file"]');
		for (var i = 0; i < fileInputs.length; i++) {
			(function (input) {
				input.addEventListener('change', function () {
					if (!this.files || !this.files[0]) return;
					var box = this.closest('.brand-upload-box');
					var key = box ? box.getAttribute('data-key') : '';
					if (!key) return;
					var file = this.files[0];
					// 즉시 미리보기
					var preview = box.querySelector('img');
					if (preview) preview.src = URL.createObjectURL(file);
					uploadImage(file, key, 'dashboard', function () {
						renderCards();
						applyToPage();
					});
				});
			})(fileInputs[i]);
		}
		// 개별 초기화
		var resetBtns = container.querySelectorAll('.brand-reset-btn');
		for (var j = 0; j < resetBtns.length; j++) {
			(function (btn) {
				btn.addEventListener('click', function () {
					var key = this.getAttribute('data-key');
					if (!key) return;
					resetSetting(key, function () {
						renderCards();
						applyToPage();
					});
				});
			})(resetBtns[j]);
		}
		// 개별 삭제
		var delBtns = container.querySelectorAll('.brand-card-delete-btn');
		for (var k = 0; k < delBtns.length; k++) {
			(function (btn) {
				btn.addEventListener('click', function () {
					var key = this.getAttribute('data-key');
					if (!key) return;
					showConfirm('이 카드 로고 설정을 삭제하시겠습니까?', function () {
						deleteSetting(key, function () {
							renderCards();
							applyToPage();
						});
					});
				});
			})(delBtns[k]);
		}
	}

	function bindGlobalEvents() {
		// 카드 추가
		var addBtn = document.getElementById('btn-add-card');
		if (addBtn) {
			addBtn.addEventListener('click', function () {
				var input = document.getElementById('new-card-key');
				var raw = (input ? input.value : '').trim().replace(/[^a-zA-Z0-9_]/g, '_');
				if (!raw) { showStatus('cards-status', '카드 식별자를 입력하세요.', false); return; }
				var fullKey = 'dashboard.cardLogos.' + raw;
				if (state.settings[fullKey]) { showStatus('cards-status', '이미 존재하는 식별자입니다.', false); return; }
				saveSetting(fullKey, '/static/image/logo/blossom_logo.png', 'dashboard', 'image', function () {
					if (input) input.value = '';
					renderCards();
				});
			});
		}
		// 카드 로고 저장 (모든 카드 저장은 각 업로드 시 바로 반영됨 — 이 버튼은 확인용)
		var saveCardsBtn = document.getElementById('btn-save-cards');
		if (saveCardsBtn) {
			saveCardsBtn.addEventListener('click', function () {
				showStatus('cards-status', '카드 로고는 업로드/변경 시 자동 저장됩니다.', true);
			});
		}
		// 전체 초기화
		var resetAllBtn = document.getElementById('btn-reset-all');
		if (resetAllBtn) {
			resetAllBtn.addEventListener('click', function () {
				showConfirm('모든 브랜드 설정을 기본값으로 초기화하시겠습니까?', function () {
					resetSetting(null, function () {
						renderHeader();
						renderCards();
						applyToPage();
					});
				});
			});
		}
	}

	/* ── 실제 페이지에 브랜드 반영 ─────────── */
	function applyToPage() {
		// 헤더 아이콘
		var headerLogo = document.querySelector('.header-logo');
		if (headerLogo) {
			headerLogo.src = val('brand.headerIcon');
			headerLogo.onerror = function () { this.src = fallback('brand.headerIcon'); };
		}
		// 브랜드명
		var titleEl = document.querySelector('.system-title');
		if (titleEl) titleEl.textContent = val('brand.name') || 'blossom';
		// 보조 문구
		var subtitleEl = document.querySelector('.system-subtitle');
		if (subtitleEl) {
			var st = val('brand.subtitle');
			subtitleEl.textContent = st;
			subtitleEl.style.display = st ? 'block' : 'none';
		}
		// 글로벌 이벤트 발행 — 다른 페이지에서도 수신 가능
		try {
			window.dispatchEvent(new CustomEvent('blossom:brandChanged', {
				detail: state.settings
			}));
		} catch (e) { /* IE fallback */ }
	}

	/* ── 초기화 ────────────────────────────── */
	function init() {
		fetchSettings(function () {
			renderHeader();
			renderCards();
			bindHeaderEvents();
			bindGlobalEvents();
			applyToPage();
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
