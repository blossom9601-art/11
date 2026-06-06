(function () {
	'use strict';

	var STORAGE_KEY = 'blossom.ui.language';
	var DEFAULT_LANGUAGE = 'ko-KR';
	var dictionary = {
		'en-US': {
			'검색어를 입력하세요': 'Enter a search term',
			'통합 검색': 'Search',
			'메뉴': 'Menu',
			'작업 타임라인': 'Work Timeline',
			'알림': 'Notifications',
			'채팅': 'Chat',
			'달력': 'Calendar',
			'계정': 'Account',
			'대시보드': 'Dashboard',
			'시스템': 'System',
			'서버': 'Server',
			'스토리지': 'Storage',
			'네트워크': 'Network',
			'보안장비': 'Security Devices',
			'접근제어': 'Access Control',
			'현황': 'Status',
			'접속': 'Access',
			'신청': 'Request',
			'감사': 'Audit',
			'거버넌스': 'Governance',
			'백업 정책': 'Backup Policy',
			'패키지 관리': 'Package Management',
			'취약점 분석': 'Vulnerability Analysis',
			'서비스 관리': 'Service Management',
			'IP 정책': 'IP Policy',
			'VPN 정책': 'VPN Policy',
			'전용회선 정책': 'Leased Line Policy',
			'불용자산 관리': 'Unused Assets',
			'데이터센터': 'Data Center',
			'비용관리': 'Cost Management',
			'프로젝트': 'Project',
			'인사이트': 'Insight',
			'카테고리': 'Category',
			'설정': 'Settings',
			'언어/시간': 'Language/Time',
			'시스템 기본 언어, 사용자 언어 정책, 서버 시간 및 시간대를 관리합니다.': 'Manage the system default language, user language policy, server time, and time zone.',
			'언어 정책': 'Language Policy',
			'기본 언어': 'Default Language',
			'번역 누락 처리 방식': 'Missing Translation Handling',
			'기본 언어 표시': 'Show Default Language',
			'번역 키 표시': 'Show Translation Key',
			'빈 값 표시': 'Show Blank Value',
			'지원 언어': 'Supported Languages',
			'사용자 언어 변경 허용': 'Allow User Language Changes',
			'브라우저 언어 자동 감지': 'Auto-detect Browser Language',
			'시스템 시간': 'System Time',
			'현재 서버 시간': 'Current Server Time',
			'새로고침': 'Refresh',
			'시스템 시간대': 'System Time Zone',
			'NTP 자동 동기화': 'NTP Auto Sync',
			'시간 변경은 서버 OS 시간에 반영됩니다. NTP가 켜져 있으면 수동 시간은 즉시 다시 보정될 수 있습니다.': 'Time changes are applied to the server OS time. If NTP is enabled, manual time may be corrected again immediately.',
			'저장': 'Save',
			'저장 중...': 'Saving...',
			'저장됨': 'Saved',
			'불러오는 중...': 'Loading...',
			'오늘': 'Today',
			'인증/접근': 'Authentication/Access',
			'보안': 'Security',
			'운영': 'Operations',
			'서비스/UI': 'Service/UI',
			'개발/품질': 'Development/Quality',
			'인증관리': 'Authentication Management',
			'보안관리': 'Security Management',
			'저장 후 언어 설정을 적용하는 중...': 'Applying language settings...'
		}
	};

	function getStoredLanguage() {
		try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANGUAGE; } catch (_e) { return DEFAULT_LANGUAGE; }
	}

	function setStoredLanguage(language) {
		try { localStorage.setItem(STORAGE_KEY, language || DEFAULT_LANGUAGE); } catch (_e) {}
	}

	function translateValue(text, map) {
		var raw = String(text || '');
		var trimmed = raw.trim();
		if (!trimmed || !map[trimmed]) return text;
		return raw.replace(trimmed, map[trimmed]);
	}

	function shouldSkip(node) {
		if (!node) return true;
		var el = node.nodeType === 1 ? node : node.parentElement;
		while (el) {
			var tag = (el.tagName || '').toLowerCase();
			if (tag === 'script' || tag === 'style' || tag === 'textarea' || tag === 'code' || tag === 'pre') return true;
			if (el.classList && (el.classList.contains('notranslate') || el.classList.contains('lt-language-name') || el.classList.contains('lt-language-code'))) return true;
			if (el.getAttribute && el.getAttribute('translate') === 'no' && tag !== 'html' && tag !== 'body') return true;
			el = el.parentElement;
		}
		return false;
	}

	function applyAttributes(root, map) {
		var nodes = [];
		try {
			nodes = Array.prototype.slice.call((root || document).querySelectorAll('[placeholder], [title], [alt], option'));
		} catch (_e) {
			nodes = [];
		}
		nodes.forEach(function (el) {
			if (shouldSkip(el)) return;
			['placeholder', 'title', 'alt'].forEach(function (attr) {
				if (!el.hasAttribute || !el.hasAttribute(attr)) return;
				var next = translateValue(el.getAttribute(attr), map);
				if (next !== el.getAttribute(attr)) el.setAttribute(attr, next);
			});
			if ((el.tagName || '').toLowerCase() === 'option') {
				var nextText = translateValue(el.textContent, map);
				if (nextText !== el.textContent) el.textContent = nextText;
			}
		});
	}

	function applyText(root, map) {
		var walker;
		try {
			walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, {
				acceptNode: function (node) {
					if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
					return shouldSkip(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
				}
			});
		} catch (_e) {
			return;
		}
		var textNodes = [];
		while (walker.nextNode()) textNodes.push(walker.currentNode);
		textNodes.forEach(function (node) {
			var next = translateValue(node.nodeValue, map);
			if (next !== node.nodeValue) node.nodeValue = next;
		});
	}

	function applyLanguage(language, root) {
		var lang = language || getStoredLanguage();
		setStoredLanguage(lang);
		try {
			document.documentElement.lang = lang.split('-')[0] || 'ko';
			document.documentElement.setAttribute('data-ui-language', lang);
		} catch (_e) {}
		if (lang === DEFAULT_LANGUAGE) return;
		var map = dictionary[lang];
		if (!map) return;
		var scope = root || document.body || document;
		applyAttributes(scope, map);
		applyText(scope, map);
	}

	function loadSettings() {
		return fetch('/api/admin/language-settings', {
			method: 'GET',
			credentials: 'same-origin',
			cache: 'no-store',
			headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
		})
			.then(function (res) { return res.ok ? res.json() : null; })
			.then(function (data) {
				var lang = data && data.default_language ? data.default_language : getStoredLanguage();
				applyLanguage(lang);
				return lang;
			})
			.catch(function () {
				applyLanguage(getStoredLanguage());
			});
	}

	function showLanguageLoading(text) {
		var id = 'bls-language-loading';
		var existing = document.getElementById(id);
		if (existing) return existing;
		var box = document.createElement('div');
		box.id = id;
		box.setAttribute('role', 'status');
		box.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(248,250,252,.72);backdrop-filter:blur(2px);';
		box.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;box-shadow:0 18px 45px rgba(15,23,42,.16);color:#0f172a;font-size:13px;font-weight:600;">'
			+ '<span style="width:18px;height:18px;border:2px solid #e0e7ff;border-top-color:#6366F1;border-radius:50%;animation:blsLangSpin .75s linear infinite;"></span>'
			+ '<span>' + (text || 'Loading...') + '</span>'
			+ '</div>';
		if (!document.getElementById('bls-language-loading-style')) {
			var style = document.createElement('style');
			style.id = 'bls-language-loading-style';
			style.textContent = '@keyframes blsLangSpin{to{transform:rotate(360deg)}}';
			document.head.appendChild(style);
		}
		document.body.appendChild(box);
		return box;
	}

	window.BlossomI18n = {
		apply: applyLanguage,
		load: loadSettings,
		setStoredLanguage: setStoredLanguage,
		showLoading: showLanguageLoading
	};

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', loadSettings);
	} else {
		loadSettings();
	}
	document.addEventListener('blossom:pageLoaded', function (event) {
		var root = event && event.detail && event.detail.root ? event.detail.root : document.body;
		applyLanguage(getStoredLanguage(), root);
		setTimeout(function () { applyLanguage(getStoredLanguage(), root); }, 120);
	});
})();
