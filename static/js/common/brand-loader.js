/* ═══════════════════════════════════════════════
   브랜드 설정 공통 로더 (brand-loader.js) v1.0.0
   ──────────────────────────────────────────────
   _header.html 에 포함되어 모든 페이지에서 실행.
   브랜드 설정값을 /api/brand-settings 에서 가져와
   헤더 로고·텍스트, 대시보드 카드 로고를 동적 반영한다.
   ═══════════════════════════════════════════════ */
(function () {
	'use strict';

	var CACHE_KEY = 'blossom.brand.cache';
	var CACHE_TTL = 5 * 60 * 1000; // 5분

	var DEFAULTS = {
		'brand.headerIcon': '/static/image/logo/blossom_logo.png',
		'brand.name':       'blossom',
		'brand.subtitle':   '',
		'dashboard.cardLogos.maintenance_cost_card': '/static/image/logo/bccard_logo.jpg'
	};

	/* ── 캐시 ─────────────────────────────── */
	function readCache() {
		try {
			var raw = sessionStorage.getItem(CACHE_KEY);
			if (!raw) return null;
			var obj = JSON.parse(raw);
			if (Date.now() - (obj._ts || 0) > CACHE_TTL) return null;
			return obj;
		} catch (e) { return null; }
	}
	function writeCache(map) {
		try {
			map._ts = Date.now();
			sessionStorage.setItem(CACHE_KEY, JSON.stringify(map));
		} catch (e) { /* quota 등 무시 */ }
	}

	/* ── 값 헬퍼 ──────────────────────────── */
	function val(map, key) {
		var s = map[key];
		if (s && s.value) return s.value;
		return DEFAULTS[key] !== undefined ? DEFAULTS[key] : '';
	}

	/* ── 헤더 적용 ─────────────────────────── */
	function applyHeader(map) {
		var logo = document.querySelector('.header-logo');
		if (logo) {
			logo.src = val(map, 'brand.headerIcon');
			logo.onerror = function () { this.src = DEFAULTS['brand.headerIcon']; };
		}
		var title = document.querySelector('.system-title');
		if (title) title.textContent = val(map, 'brand.name') || 'blossom';
		var subtitle = document.querySelector('.system-subtitle');
		if (subtitle) {
			var st = val(map, 'brand.subtitle');
			subtitle.textContent = st;
			subtitle.style.display = st ? 'block' : 'none';
		}
	}

	/* ── 대시보드 카드 적용 ────────────────── */
	function applyDashboard(map) {
		var maintLogo = document.querySelector('.maint-logo');
		if (maintLogo) {
			maintLogo.src = val(map, 'dashboard.cardLogos.maintenance_cost_card');
			maintLogo.onerror = function () { this.src = DEFAULTS['dashboard.cardLogos.maintenance_cost_card']; };
		}
	}

	/* ── 메인 ──────────────────────────────── */
	function apply(map) {
		applyHeader(map);
		applyDashboard(map);
		// 전역 참조 노출
		window.__blsBrand = map;
	}

	function load() {
		// 1) 캐시 우선 적용
		var cached = readCache();
		if (cached) apply(cached);

		// 2) API 호출
		var xhr = new XMLHttpRequest();
		xhr.open('GET', '/api/brand-settings');
		xhr.setRequestHeader('Accept', 'application/json');
		xhr.onload = function () {
			try {
				var res = JSON.parse(xhr.responseText);
				if (res.success) {
					var map = {};
					(res.rows || []).forEach(function (r) { map[r.key] = r; });
					writeCache(map);
					apply(map);
				}
			} catch (e) { /* silent */ }
		};
		xhr.onerror = function () {
			// 네트워크 실패 시 기본값 적용
			if (!cached) apply({});
		};
		xhr.send();
	}

	// 브랜드 변경 이벤트 수신 (브랜드 관리 페이지에서 저장 시)
	window.addEventListener('blossom:brandChanged', function (e) {
		var map = e.detail || {};
		writeCache(map);
		apply(map);
	});

	// DOMContentLoaded 후 실행
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', load);
	} else {
		load();
	}
})();
