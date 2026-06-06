(function () {
	'use strict';

	var API_URL = '/admin/auth/ai-policy';
	var currentPolicies = {};
	var sectionLabels = {
		policy: '\u0041\u0049 \uc0ac\uc6a9 \uc815\ucc45',
		internal: '\uc0ac\ub0b4 \uc0dd\uc131\ud615 \u0041\u0049',
		external: '\uc678\ubd80 \u0041\u0050\u0049',
		safety: '\ubcf4\uc548\u00b7\ud488\uc9c8 \uc815\ucc45'
	};

	function byId(id) {
		return document.getElementById(id);
	}


	function closePolicyAlert(){
		var modal = byId('account-policy-alert');
		if(!modal) return;
		modal.classList.remove('is-open');
		modal.setAttribute('aria-hidden', 'true');
		document.body.classList.remove('modal-open');
	}

	function ensurePolicyAlert(){
		var modal = byId('account-policy-alert');
		if(modal) return modal;
		modal = document.createElement('div');
		modal.id = 'account-policy-alert';
		modal.className = 'account-policy-alert';
		modal.setAttribute('aria-hidden', 'true');
		modal.innerHTML = '<div class="account-policy-alert-dialog" role="dialog" aria-modal="true" aria-labelledby="account-policy-alert-title"><div class="account-policy-alert-head"><h3 class="account-policy-alert-title" id="account-policy-alert-title">\uc54c\ub9bc</h3><button type="button" class="account-policy-alert-close" aria-label="\ub2eb\uae30"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div><div class="account-policy-alert-body"><div class="account-policy-alert-content"><div class="account-policy-alert-message" id="account-policy-alert-message"></div><div class="account-policy-alert-illust" aria-hidden="true"><img src="/static/image/svg/error/free-sticker-business2.svg" alt="" loading="lazy" decoding="async"></div></div></div><div class="account-policy-alert-actions"><button type="button" class="account-policy-alert-cancel">\ucde8\uc18c</button><button type="button" class="account-policy-alert-ok">\ud655\uc778</button></div></div>';
		document.body.appendChild(modal);
		modal.addEventListener('click', function(e){ if(e.target === modal) closePolicyAlert(); });
		modal.querySelector('.account-policy-alert-close').addEventListener('click', closePolicyAlert);
		modal.querySelector('.account-policy-alert-cancel').addEventListener('click', closePolicyAlert);
		modal.querySelector('.account-policy-alert-ok').addEventListener('click', closePolicyAlert);
		return modal;
	}

	function showPolicyAlert(message, type){
		var modal = ensurePolicyAlert();
		byId('account-policy-alert-title').textContent = type === 'error' ? '\uc54c\ub9bc' : '\uc548\ub0b4';
		byId('account-policy-alert-message').textContent = message || '';
		modal.classList.add('is-open');
		modal.setAttribute('aria-hidden', 'false');
		document.body.classList.add('modal-open');
	}

	function setStatus(text, kind) {
		return;
	}

	function getPolicyBool(key, fallback) {
		var item = currentPolicies[key];
		if (!item || typeof item.enabled === 'undefined') return !!fallback;
		return !!item.enabled;
	}

	function getPolicyValue(key, fallback) {
		var item = currentPolicies[key];
		if (!item || typeof item.value === 'undefined') return fallback;
		return item.value;
	}

	function mergePolicies(defaults, items) {
		var merged = {};
		Object.keys(defaults || {}).forEach(function (key) {
			merged[key] = defaults[key];
		});
		(items || []).forEach(function (item) {
			if (item && item.policyKey) merged[item.policyKey] = item.value || {};
		});
		return merged;
	}

	function setValue(id, value) {
		var el = byId(id);
		if (el) el.value = value == null ? '' : value;
	}

	function setChecked(id, value) {
		var el = byId(id);
		if (el) el.checked = !!value;
	}

	var providerPresets = {
		openai_compatible: {
			baseUrl: 'https://api.openai.com/v1',
			model: 'gpt-4.1-mini'
		},
		google_gemini: {
			baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
			model: 'gemini-2.5-flash'
		},
		xai_grok: {
			baseUrl: 'https://api.x.ai/v1',
			model: 'grok-4'
		}
	};

	function applyProviderPreset(force) {
		var provider = byId('ai-external-provider');
		var baseUrl = byId('ai-external-base-url');
		var model = byId('ai-external-model');
		if (!provider || !baseUrl || !model) return;
		var preset = providerPresets[provider.value];
		if (!preset) return;
		baseUrl.placeholder = preset.baseUrl;
		model.placeholder = preset.model;
		if (force || !baseUrl.value || baseUrl.value.indexOf('aistudio.google.com') >= 0) baseUrl.value = preset.baseUrl;
		if (force || !model.value || model.value.toLowerCase() === 'google') model.value = preset.model;
	}

	function applyPolicies() {
		setChecked('ai-enabled', getPolicyBool('ai.enabled', false));
		setValue('ai-provider-mode', getPolicyValue('ai.provider_mode', 'internal_first'));
		setChecked('ai-internal-enabled', getPolicyBool('ai.internal_enabled', true));
		setValue('ai-internal-base-url', getPolicyValue('ai.internal_base_url', ''));
		setValue('ai-internal-model', getPolicyValue('ai.internal_model', 'blossom-genai'));
		setChecked('ai-external-enabled', getPolicyBool('ai.external_enabled', false));
		setValue('ai-external-provider', getPolicyValue('ai.external_provider', 'openai_compatible'));
		setValue('ai-external-base-url', getPolicyValue('ai.external_base_url', ''));
		setValue('ai-external-model', getPolicyValue('ai.external_model', 'gpt-5.2'));
		setValue('ai-external-api-key', getPolicyValue('ai.external_api_key', '') ? '********' : '');
		setChecked('ai-allow-user-select-provider', getPolicyBool('ai.allow_user_select_provider', false));
		setChecked('ai-allow-file-context', getPolicyBool('ai.allow_file_context', true));
		setChecked('ai-allow-chat-context', getPolicyBool('ai.allow_chat_context', true));
		setChecked('ai-log-prompt', getPolicyBool('ai.log_prompt', false));
		setChecked('ai-log-response', getPolicyBool('ai.log_response', false));
		setValue('ai-retention-days', getPolicyValue('ai.retention_days', 30));
		setValue('ai-max-tokens', getPolicyValue('ai.max_tokens', 2048));
		setValue('ai-temperature', getPolicyValue('ai.temperature', 0.3));
		setValue('ai-system-prompt', getPolicyValue('ai.system_prompt', ''));
		applyProviderPreset(false);
	}

	function collectPolicies() {
		var apiKeyInput = (byId('ai-external-api-key').value || '').trim();
		var previousApiKey = getPolicyValue('ai.external_api_key', '');
		var nextApiKey = (apiKeyInput === '********' || apiKeyInput === '') ? previousApiKey : apiKeyInput;
		return {
			'ai.enabled': { enabled: byId('ai-enabled').checked },
			'ai.provider_mode': { value: byId('ai-provider-mode').value },
			'ai.internal_enabled': { enabled: byId('ai-internal-enabled').checked },
			'ai.internal_base_url': { value: (byId('ai-internal-base-url').value || '').trim() },
			'ai.internal_model': { value: (byId('ai-internal-model').value || '').trim() },
			'ai.external_enabled': { enabled: byId('ai-external-enabled').checked },
			'ai.external_provider': { value: byId('ai-external-provider').value },
			'ai.external_base_url': { value: (byId('ai-external-base-url').value || '').trim() },
			'ai.external_model': { value: (byId('ai-external-model').value || '').trim() },
			'ai.external_api_key': { value: nextApiKey },
			'ai.allow_user_select_provider': { enabled: byId('ai-allow-user-select-provider').checked },
			'ai.allow_file_context': { enabled: byId('ai-allow-file-context').checked },
			'ai.allow_chat_context': { enabled: byId('ai-allow-chat-context').checked },
			'ai.log_prompt': { enabled: byId('ai-log-prompt').checked },
			'ai.log_response': { enabled: byId('ai-log-response').checked },
			'ai.retention_days': { value: parseInt(byId('ai-retention-days').value, 10) || 0 },
			'ai.max_tokens': { value: parseInt(byId('ai-max-tokens').value, 10) || 2048 },
			'ai.temperature': { value: parseFloat(byId('ai-temperature').value) || 0 },
			'ai.system_prompt': { value: (byId('ai-system-prompt').value || '').trim() }
		};
	}

	function requestJson(url, options) {
		return fetch(url, Object.assign({
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
		}, options || {}))
			.then(function (resp) {
				return resp.json().catch(function () { return {}; }).then(function (data) {
					if (!resp.ok) throw new Error(data.message || data.error || ('HTTP ' + resp.status));
					return data;
				});
			});
	}

	function loadPolicies() {
		return requestJson(API_URL).then(function (data) {
			currentPolicies = mergePolicies(data.defaults, data.items);
			applyPolicies();
		}).catch(function (error) {
		});
	}

	function setButtonsDisabled(disabled) {
		var buttons = document.querySelectorAll('[data-ai-save], #ai-restore-defaults');
		for (var i = 0; i < buttons.length; i += 1) buttons[i].disabled = !!disabled;
	}

	function savePolicies(section) {
		var label = sectionLabels[section] || '\u0041\u0049 \uc815\ucc45';
		var policies = collectPolicies();
		setButtonsDisabled(true);
		return requestJson(API_URL, {
			method: 'PUT',
			body: JSON.stringify({ policies: policies })
		}).then(function (data) {
			currentPolicies = policies;
			var message = (data.changedKeys || []).length ? label + '\uc774 \uc800\uc7a5\ub418\uc5c8\uc2b5\ub2c8\ub2e4.' : '\ubcc0\uacbd \uc0ac\ud56d\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.';
			applyPolicies();
			showPolicyAlert(message, 'success');
		}).catch(function (error) {
			showPolicyAlert('\uc800\uc7a5 \uc2e4\ud328: ' + error.message, 'error');
		}).finally(function () {
			setButtonsDisabled(false);
		});
	}

	function restoreDefaults() {
		if (!confirm('AI 정책을 기본값으로 복원할까요?')) return;
		setButtonsDisabled(true);
		requestJson(API_URL, { method: 'PUT', body: JSON.stringify({ restoreDefaults: true }) })
			.then(loadPolicies)
			.then(function () {
			})
			.catch(function (error) {
			})
			.finally(function () { setButtonsDisabled(false); });
	}

	function init() {
		var form = byId('ai-policy-form');
		if (form) {
			form.addEventListener('submit', function (event) {
				event.preventDefault();
				savePolicies('policy');
			});
		}
		var buttons = document.querySelectorAll('[data-ai-save]');
		for (var i = 0; i < buttons.length; i += 1) {
			buttons[i].addEventListener('click', function (event) {
				savePolicies(event.currentTarget.getAttribute('data-ai-save'));
			});
		}
		var restore = byId('ai-restore-defaults');
		if (restore) restore.addEventListener('click', restoreDefaults);
		var provider = byId('ai-external-provider');
		if (provider) {
			provider.addEventListener('change', function () {
				applyProviderPreset(true);
			});
		}
		loadPolicies();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
