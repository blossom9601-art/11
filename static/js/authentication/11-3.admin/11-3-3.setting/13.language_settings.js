(function () {
	'use strict';

	function qs(id) { return document.getElementById(id); }
	function pad(n) { return String(n).padStart(2, '0'); }

	function formatKst(date) {
		var d = date instanceof Date ? date : new Date();
		return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' '
			+ pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ' KST';
	}

	function formatPickerValue(date) {
		var d = date instanceof Date ? date : new Date();
		return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' '
			+ pad(d.getHours()) + ':' + pad(d.getMinutes());
	}

	function ensureTodayButton(fp) {
		var cal = fp && fp.calendarContainer;
		if (!cal || cal.querySelector('.fp-today-btn')) return;
		var btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'fp-today-btn';
		btn.textContent = '오늘';
		btn.addEventListener('click', function () {
			var now = new Date();
			fp.setDate(now, true);
			fp.close();
		});
		cal.appendChild(btn);
	}

	function refreshServerTime() {
		var out = qs('lt-current-time');
		if (out) out.textContent = '불러오는 중...';
		return fetch('/api/server-time', { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
			.then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('server time failed')); })
			.then(function (data) {
				var date = data && data.epoch_ms ? new Date(Number(data.epoch_ms)) : new Date();
				if (out) out.textContent = formatKst(date);
				var input = qs('lt-system-time');
				if (input && !input.value) input.value = formatPickerValue(date);
			})
			.catch(function () {
				var now = new Date();
				if (out) out.textContent = formatKst(now);
				var input = qs('lt-system-time');
				if (input && !input.value) input.value = formatPickerValue(now);
			});
	}

	function initDateTimePicker() {
		var input = qs('lt-system-time');
		if (!input || !window.flatpickr) return;
		var locale = (window.flatpickr.l10ns && window.flatpickr.l10ns.ko) || 'ko';
		var picker = window.flatpickr(input, {
			enableTime: true,
			time_24hr: true,
			dateFormat: 'Y-m-d H:i',
			allowInput: true,
			disableMobile: true,
			appendTo: document.body,
			locale: locale,
			onReady: function (_selected, _dateStr, inst) {
				if (inst && inst.calendarContainer) inst.calendarContainer.classList.add('language-time-picker');
				ensureTodayButton(inst);
			},
			onOpen: function (_selected, _dateStr, inst) {
				if (inst && inst.calendarContainer) inst.calendarContainer.classList.add('language-time-picker');
				ensureTodayButton(inst);
			}
		});
		if (picker && picker.calendarContainer) {
			picker.calendarContainer.classList.add('language-time-picker');
		}
	}

	function flashButton(button, text) {
		if (!button) return;
		var label = button.querySelector('.lt-save-label');
		if (!label) return;
		var before = label.textContent;
		label.textContent = text;
		window.setTimeout(function () { label.textContent = before; }, 1200);
	}

	function setButtonBusy(button, busy, language) {
		if (!button) return;
		var label = button.querySelector('.lt-save-label');
		button.disabled = !!busy;
		button.setAttribute('aria-busy', busy ? 'true' : 'false');
		if (label && busy) label.textContent = language === 'en-US' ? 'Saving...' : '저장 중...';
	}

	function loadLanguageSettings() {
		return fetch('/api/admin/language-settings', {
			method: 'GET',
			credentials: 'same-origin',
			cache: 'no-store',
			headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
		})
			.then(function (res) { return res.ok ? res.json() : null; })
			.then(function (data) {
				if (!data) return;
				var language = qs('lt-default-language');
				var fallback = qs('lt-fallback-mode');
				if (language && data.default_language) language.value = data.default_language;
				if (fallback && data.fallback_mode) fallback.value = data.fallback_mode;
				if (window.BlossomI18n && data.default_language) {
					window.BlossomI18n.setStoredLanguage(data.default_language);
					window.BlossomI18n.apply(data.default_language);
				}
			})
			.catch(function () {});
	}

	function saveLanguageSettings(button) {
		var language = qs('lt-default-language');
		var fallback = qs('lt-fallback-mode');
		var selectedLanguage = language ? language.value : 'ko-KR';
		setButtonBusy(button, true, selectedLanguage);
		return fetch('/api/admin/language-settings', {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json',
				'X-Requested-With': 'XMLHttpRequest'
			},
			body: JSON.stringify({
				default_language: selectedLanguage,
				fallback_mode: fallback ? fallback.value : 'default'
			})
		})
			.then(function (res) {
				return res.json().catch(function () { return {}; }).then(function (data) {
					if (!res.ok || !data.success) throw new Error(data.message || 'save failed');
					return data;
				});
			})
			.then(function (data) {
				if (window.BlossomI18n) {
					window.BlossomI18n.setStoredLanguage(data.default_language || selectedLanguage);
					window.BlossomI18n.showLoading(
						(data.default_language || selectedLanguage) === 'en-US'
							? 'Applying language settings...'
							: '저장 후 언어 설정을 적용하는 중...'
					);
				}
				window.setTimeout(function () { window.location.reload(); }, 260);
			})
			.catch(function () {
				setButtonBusy(button, false);
				flashButton(button, '저장 실패');
			});
	}

	document.addEventListener('DOMContentLoaded', function () {
		initDateTimePicker();
		refreshServerTime();
		loadLanguageSettings();

		var refresh = qs('lt-refresh-time');
		if (refresh) {
			refresh.addEventListener('click', function () {
				refreshServerTime();
			});
		}

		var langSave = qs('lt-language-save');
		if (langSave) {
			langSave.addEventListener('click', function () {
				saveLanguageSettings(langSave);
			});
		}

		var timeSave = qs('lt-time-save');
		if (timeSave) {
			timeSave.addEventListener('click', function () {
				flashButton(timeSave, '저장됨');
			});
		}
	});
})();
