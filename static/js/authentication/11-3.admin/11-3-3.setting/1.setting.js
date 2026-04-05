(function(){
	var STORAGE_KEY = 'blossom.security.settings';
	var state = { settings: null, serverPolicy: null, bannedWords: [] };

	/* ── 공통 유틸 ── */
	function generateSecret(length) {
		length = length || 24;
		var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
		var result = '';
		for (var i = 0; i < length; i += 1) {
			result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
			if ((i + 1) % 4 === 0 && i + 1 !== length) result += '-';
		}
		return result;
	}

	function createDefaults() {
		return {
			password: {
				minLength: 12, maxLength: 64, expiryDays: 90, history: 5,
				failLockThreshold: 5, lockDurationMinutes: 30,
				requireUppercase: true, requireNumber: true, requireSymbol: true,
				blockCommonPasswords: true, blockUserId: true, blockPersonalInfo: true,
				blockSequentialChars: true, blockRepeatedChars: true, blockKeyboardPatterns: true,
				bannedWords: '', forceChangeFirstLogin: true, forceChangeAdminReset: true,
				minChangeIntervalHours: 24, showStrengthMeter: true
			},
			mfa: {
				enabled: false, type: 'totp', gracePeriod: 0, rememberDeviceDays: 7,
				secret: generateSecret(), smsNumber: '', email: ''
			},
			session: {
				idleMinutes: 30, absoluteHours: 12, maxSessions: 1,
				notifyNewLogin: true, autoLogoutAdmin: false,
				logoutOnBrowserClose: true, sessionReissueMinutes: 30,
				concurrentPolicy: 'kill_oldest'
			},
			meta: { lastSaved: null }
		};
	}

	function loadSettings() {
		var defaults = createDefaults();
		try {
			var raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return defaults;
			var parsed = JSON.parse(raw);
			return {
				password: Object.assign({}, defaults.password, parsed.password || {}),
				mfa: Object.assign({}, defaults.mfa, parsed.mfa || {}),
				session: Object.assign({}, defaults.session, parsed.session || {}),
				meta: Object.assign({}, defaults.meta, parsed.meta || {})
			};
		} catch (err) { return defaults; }
	}

	function persistSettings() {
		try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings)); } catch (e) {}
		window.dispatchEvent(new CustomEvent('blossom:securitySettingsChanged', { detail: state.settings }));
	}

	function showStatusText(el, text) { if (el) el.textContent = text; }

	function formatPolicySummary(p) {
		var combos = [];
		if (p.requireUppercase) combos.push('대문자');
		if (p.requireNumber) combos.push('숫자');
		if (p.requireSymbol) combos.push('특수문자');
		var comboText = combos.length ? combos.join('/') : '조합 제한 없음';
		var expiryText = p.expiryDays > 0 ? p.expiryDays + '일 마다 변경' : '만료 없음';
		var lockText = p.failLockThreshold ? '실패 ' + p.failLockThreshold + '회 · ' + (p.lockDurationMinutes || 0) + '분 잠금' : '잠금 제한 없음';
		return '최소 ' + p.minLength + '자, ' + comboText + ' · ' + expiryText + ' · ' + lockText;
	}

	function formatMfaSummary(mfa) {
		if (!mfa.enabled) return 'MFA 비활성화';
		var typeLabel = { totp: '인증 앱', sms: 'SMS', email: '이메일' }[mfa.type] || 'MFA';
		return typeLabel + ' · 기기 ' + mfa.rememberDeviceDays + '일 기억';
	}

	function formatSessionSummary(s) {
		return '유휴 ' + s.idleMinutes + '분 · 동시 ' + s.maxSessions + '대';
	}

	function updateOverviewChips() {
		var p = state.settings.password, mfa = state.settings.mfa, s = state.settings.session, meta = state.settings.meta;
		var policyStatus = document.getElementById('password-policy-status');
		if (policyStatus) showStatusText(policyStatus, formatPolicySummary(p));
		var mfaStatus = document.getElementById('mfa-settings-status');
		if (mfaStatus) showStatusText(mfaStatus, formatMfaSummary(mfa));
		var sessionStatus = document.getElementById('session-settings-status');
		if (sessionStatus) showStatusText(sessionStatus, formatSessionSummary(s));
	}

	/* ══════════════════════════════════════════════════
	   보안 경고 시스템
	   ══════════════════════════════════════════════════ */
	function updateSecurityWarnings() {
		var el = document.getElementById('security-warnings');
		if (!el) return;
		var warnings = [];
		var p = state.settings.password, s = state.settings.session;
		if (p.minLength < 8) warnings.push('최소 비밀번호 길이가 8자 미만입니다. 보안 수준이 낮을 수 있습니다.');
		if (s.maxSessions > 1) warnings.push('동시 접속 허용이 ' + s.maxSessions + '대로 설정되어 있습니다. 계정 공유 위험이 있습니다.');
		if (!s.logoutOnBrowserClose) warnings.push('브라우저 종료 시 자동 로그아웃이 비활성화되어 있습니다.');
		if (p.expiryDays === 0) warnings.push('비밀번호 만료가 설정되지 않았습니다. 주기적 비밀번호 변경을 권장합니다.');
		if (!p.requireUppercase && !p.requireNumber && !p.requireSymbol) warnings.push('필수 문자 조합이 설정되지 않았습니다.');
		if (!p.blockCommonPasswords) warnings.push('공통 취약 비밀번호 차단이 비활성화되어 있습니다.');

		if (warnings.length === 0) {
			el.style.display = 'none';
			return;
		}
		el.style.display = '';
		el.innerHTML = warnings.map(function(w) {
			return '<div class="sec-warn-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span>' + w + '</span></div>';
		}).join('');
	}



	/* ══════════════════════════════════════════════════
	   서버 보안정책 로드/저장
	   ══════════════════════════════════════════════════ */
	function loadSecurityPolicy() {
		return fetch('/admin/auth/security-policy').then(function(r) { return r.json(); }).then(function(data) {
			state.serverPolicy = data;
			if (data && data.loaded) {
				var p = state.settings.password;
				p.minLength = data.min_length; p.maxLength = data.max_length;
				p.expiryDays = data.expiry_days; p.history = data.history;
				p.failLockThreshold = data.fail_lock_threshold; p.lockDurationMinutes = data.lock_duration_minutes;
				p.requireUppercase = !!data.require_uppercase; p.requireNumber = !!data.require_number; p.requireSymbol = !!data.require_symbol;
				p.blockCommonPasswords = !!data.block_common_passwords; p.blockUserId = !!data.block_user_id;
				p.blockPersonalInfo = !!data.block_personal_info; p.blockSequentialChars = !!data.block_sequential_chars;
				p.blockRepeatedChars = !!data.block_repeated_chars; p.blockKeyboardPatterns = !!data.block_keyboard_patterns;
				p.bannedWords = data.banned_words || '';
				p.forceChangeFirstLogin = !!data.force_change_first_login; p.forceChangeAdminReset = !!data.force_change_admin_reset;
				p.minChangeIntervalHours = data.min_change_interval_hours; p.showStrengthMeter = !!data.show_strength_meter;

				var s = state.settings.session;
				s.idleMinutes = data.idle_minutes; s.absoluteHours = data.absolute_hours;
				s.maxSessions = data.max_sessions; s.notifyNewLogin = !!data.notify_new_login;
				s.autoLogoutAdmin = !!data.auto_logout_admin; s.logoutOnBrowserClose = !!data.logout_on_browser_close;
				s.sessionReissueMinutes = data.session_reissue_minutes; s.concurrentPolicy = data.concurrent_policy || 'kill_oldest';

				// 금칙어 목록
				state.bannedWords = data.banned_password_list || [];

				persistSettings();
			}
			return data;
		}).catch(function() { return null; });
	}

	function saveSecurityPolicy(payload) {
		return fetch('/admin/auth/security-policy', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		}).then(function(r) { return r.json(); });
	}

	/* ══════════════════════════════════════════════════
	   태그 입력 (금칙어)
	   ══════════════════════════════════════════════════ */
	function initBannedWordsTagInput() {
		var wrap = document.getElementById('banned-words-wrap');
		var tagsEl = document.getElementById('banned-words-tags');
		var input = document.getElementById('banned-words-input');
		if (!wrap || !tagsEl || !input) return;

		function render() {
			tagsEl.innerHTML = state.bannedWords.map(function(w, i) {
				return '<span class="sec-tag">' + escapeHtml(w) + '<button type="button" class="sec-tag-remove" data-idx="' + i + '">×</button></span>';
			}).join('');
		}

		function addWord(raw) {
			var w = raw.trim().toLowerCase();
			if (!w) return;
			if (state.bannedWords.indexOf(w) === -1) {
				state.bannedWords.push(w);
				render();
			}
		}

		tagsEl.addEventListener('click', function(e) {
			var btn = e.target.closest('.sec-tag-remove');
			if (!btn) return;
			var idx = parseInt(btn.dataset.idx, 10);
			state.bannedWords.splice(idx, 1);
			render();
		});

		input.addEventListener('keydown', function(e) {
			if (e.key === 'Enter' || e.key === ',') {
				e.preventDefault();
				var val = input.value.replace(/,/g, '');
				addWord(val);
				input.value = '';
			}
			if (e.key === 'Backspace' && !input.value && state.bannedWords.length > 0) {
				state.bannedWords.pop();
				render();
			}
		});

		input.addEventListener('blur', function() {
			var val = input.value.replace(/,/g, '').trim();
			if (val) { addWord(val); input.value = ''; }
		});

		wrap.addEventListener('click', function() { input.focus(); });

		// 초기 렌더
		render();
	}

	function escapeHtml(s) {
		var d = document.createElement('div');
		d.textContent = s;
		return d.innerHTML;
	}

	/* ══════════════════════════════════════════════════
	   비밀번호 강도 측정 + 실시간 검증
	   ══════════════════════════════════════════════════ */
	var KEYBOARD_PATTERNS = ['qwerty','qwer','werty','asdf','asdfg','zxcv','zxcvb','1234','2345','3456','4567','5678','6789','7890','0987','9876','8765','7654','6543','5432','4321'];

	function checkPasswordStrength(pw) {
		var p = state.settings.password;
		var checks = [];
		var score = 0;

		// 길이
		var lenOk = pw.length >= (p.minLength || 8);
		checks.push({ pass: lenOk, label: '길이 ' + (p.minLength || 8) + '자 이상' });
		if (lenOk) score += 1;
		if (pw.length >= 16) score += 1;

		// 숫자
		var numOk = /[0-9]/.test(pw);
		checks.push({ pass: numOk, label: '숫자 포함' });
		if (numOk) score += 1;

		// 대문자
		if (p.requireUppercase) {
			var upOk = /[A-Z]/.test(pw);
			checks.push({ pass: upOk, label: '대문자 포함' });
			if (upOk) score += 1;
		}

		// 특수문자
		var symOk = /[^A-Za-z0-9]/.test(pw);
		checks.push({ pass: symOk, label: '특수문자 포함' });
		if (symOk) score += 1;

		// 금칙어
		var lower = pw.toLowerCase();
		var bannedHit = false;
		for (var i = 0; i < state.bannedWords.length; i++) {
			if (lower.indexOf(state.bannedWords[i]) !== -1) { bannedHit = true; break; }
		}
		checks.push({ pass: !bannedHit, label: '금칙어 미포함' });
		if (bannedHit) score = Math.max(0, score - 2);

		// 연속 문자
		if (p.blockSequentialChars) {
			var seqFound = false;
			for (var j = 0; j < lower.length - 2; j++) {
				var c0 = lower.charCodeAt(j), c1 = lower.charCodeAt(j+1), c2 = lower.charCodeAt(j+2);
				if (c1 === c0+1 && c2 === c1+1) { seqFound = true; break; }
			}
			checks.push({ pass: !seqFound, label: '연속 문자 3자 이상 없음' });
			if (seqFound) score = Math.max(0, score - 1);
		}

		// 반복 문자
		if (p.blockRepeatedChars) {
			var repFound = /(.)\1{2,}/.test(pw);
			checks.push({ pass: !repFound, label: '동일 문자 3회 반복 없음' });
			if (repFound) score = Math.max(0, score - 1);
		}

		// 키보드 패턴
		if (p.blockKeyboardPatterns) {
			var kbHit = false;
			for (var k = 0; k < KEYBOARD_PATTERNS.length; k++) {
				if (lower.indexOf(KEYBOARD_PATTERNS[k]) !== -1) { kbHit = true; break; }
			}
			checks.push({ pass: !kbHit, label: '키보드 패턴 없음 (qwer, asdf 등)' });
			if (kbHit) score = Math.max(0, score - 1);
		}

		// 사용자 정보 포함 금지 (데모: 'admin' 포함 여부)
		if (p.blockUserId) {
			var userHit = lower.indexOf('admin') !== -1;
			checks.push({ pass: !userHit, label: '사용자 정보 미포함' });
			if (userHit) score = Math.max(0, score - 1);
		}

		var level, label, color;
		if (score <= 1) { level = 0; label = '약함'; color = '#ef4444'; }
		else if (score <= 3) { level = 1; label = '보통'; color = '#f59e0b'; }
		else if (score <= 4) { level = 2; label = '강함'; color = '#10b981'; }
		else { level = 3; label = '매우 강함'; color = '#059669'; }

		return { checks: checks, level: level, label: label, color: color, score: score };
	}

	function initStrengthMeter() {
		var input = document.getElementById('password-strength-test');
		var bar = document.getElementById('strength-bar');
		var labelEl = document.getElementById('strength-label');
		var list = document.getElementById('strength-checklist');
		if (!input || !bar || !labelEl || !list) return;

		input.addEventListener('input', function() {
			var pw = input.value;
			if (!pw) {
				bar.style.width = '0';
				labelEl.textContent = '';
				list.innerHTML = '';
				return;
			}
			var result = checkPasswordStrength(pw);
			var pct = [15, 40, 70, 100][result.level];
			bar.style.width = pct + '%';
			bar.style.background = result.color;
			labelEl.textContent = result.label;
			labelEl.style.color = result.color;
			list.innerHTML = result.checks.map(function(c) {
				return '<li class="' + (c.pass ? 'pass' : 'fail') + '">' + escapeHtml(c.label) + '</li>';
			}).join('');
		});
	}

	/* ══════════════════════════════════════════════════
	   적용 범위 안내 모달
	   ══════════════════════════════════════════════════ */
	function showApplyModal(items) {
		return new Promise(function(resolve) {
			var modal = document.getElementById('sec-apply-modal');
			var itemsEl = document.getElementById('sec-apply-items');
			var confirmBtn = document.getElementById('sec-apply-confirm');
			var cancelBtn = document.getElementById('sec-apply-cancel');
			if (!modal || !itemsEl) { resolve(true); return; }

			itemsEl.innerHTML = items.map(function(it) {
				return '<div class="sec-apply-item"><span class="sec-apply-icon ' + it.type + '">' +
					(it.type === 'immediate' ? '!' : it.type === 'next-login' ? '⟳' : 'i') +
					'</span><span>' + escapeHtml(it.text) + '</span></div>';
			}).join('');

			modal.setAttribute('aria-hidden', 'false');

			function onConfirm() { cleanup(); resolve(true); }
			function onCancel() { cleanup(); resolve(false); }
			function cleanup() {
				confirmBtn.removeEventListener('click', onConfirm);
				cancelBtn.removeEventListener('click', onCancel);
				modal.setAttribute('aria-hidden', 'true');
			}
			confirmBtn.addEventListener('click', onConfirm);
			cancelBtn.addEventListener('click', onCancel);
		});
	}

	/* ══════════════════════════════════════════════════
	   비밀번호 정책 폼
	   ══════════════════════════════════════════════════ */
	function handlePasswordForm() {
		var form = document.getElementById('password-policy-form');
		if (!form) return;

		var fill = function() {
			var pwd = state.settings.password;
			form.min_length.value = pwd.minLength != null ? pwd.minLength : '';
			form.max_length.value = pwd.maxLength != null ? pwd.maxLength : '';
			form.expiry_days.value = pwd.expiryDays != null ? pwd.expiryDays : '';
			form.history.value = pwd.history != null ? pwd.history : '';
			form.fail_lock_threshold.value = pwd.failLockThreshold != null ? pwd.failLockThreshold : '';
			form.lock_duration_minutes.value = pwd.lockDurationMinutes != null ? pwd.lockDurationMinutes : '';
			form.require_uppercase.checked = !!pwd.requireUppercase;
			form.require_number.checked = !!pwd.requireNumber;
			form.require_symbol.checked = !!pwd.requireSymbol;
			// 문구 제한
			form.block_common_passwords.checked = pwd.blockCommonPasswords !== false;
			form.block_user_id.checked = pwd.blockUserId !== false;
			form.block_personal_info.checked = pwd.blockPersonalInfo !== false;
			form.block_sequential_chars.checked = pwd.blockSequentialChars !== false;
			form.block_repeated_chars.checked = pwd.blockRepeatedChars !== false;
			form.block_keyboard_patterns.checked = pwd.blockKeyboardPatterns !== false;
			// 변경 정책
			form.force_change_first_login.checked = pwd.forceChangeFirstLogin !== false;
			form.force_change_admin_reset.checked = pwd.forceChangeAdminReset !== false;
			form.show_strength_meter.checked = pwd.showStrengthMeter !== false;
			form.min_change_interval_hours.value = pwd.minChangeIntervalHours != null ? pwd.minChangeIntervalHours : 24;
		};

		fill();

		form.addEventListener('submit', function(event) {
			event.preventDefault();
			var payload = {
				min_length: Number(form.min_length.value) || 8,
				max_length: Number(form.max_length.value) || 64,
				expiry_days: Number(form.expiry_days.value) || 0,
				history: Number(form.history.value) || 0,
				fail_lock_threshold: Number(form.fail_lock_threshold.value) || 5,
				lock_duration_minutes: Number(form.lock_duration_minutes.value) || 30,
				require_uppercase: form.require_uppercase.checked ? 1 : 0,
				require_number: form.require_number.checked ? 1 : 0,
				require_symbol: form.require_symbol.checked ? 1 : 0,
				block_common_passwords: form.block_common_passwords.checked ? 1 : 0,
				block_user_id: form.block_user_id.checked ? 1 : 0,
				block_personal_info: form.block_personal_info.checked ? 1 : 0,
				block_sequential_chars: form.block_sequential_chars.checked ? 1 : 0,
				block_repeated_chars: form.block_repeated_chars.checked ? 1 : 0,
				block_keyboard_patterns: form.block_keyboard_patterns.checked ? 1 : 0,
				force_change_first_login: form.force_change_first_login.checked ? 1 : 0,
				force_change_admin_reset: form.force_change_admin_reset.checked ? 1 : 0,
				show_strength_meter: form.show_strength_meter.checked ? 1 : 0,
				min_change_interval_hours: Number(form.min_change_interval_hours.value) || 0,
				banned_password_list: state.bannedWords
			};

			var applyItems = [
				{ type: 'next-login', text: '비밀번호 길이/조합 정책: 다음 비밀번호 변경 시 적용됩니다.' },
				{ type: 'immediate', text: '문구 제한/금칙어: 저장 즉시 적용됩니다.' },
				{ type: 'info', text: '기존 비밀번호는 영향받지 않으며, 다음 변경 시 새 정책이 적용됩니다.' }
			];

			showApplyModal(applyItems).then(function(confirmed) {
				if (!confirmed) return;
				saveSecurityPolicy(payload).then(function(result) {
					if (result && result.success) {
						state.settings.password = {
							minLength: payload.min_length, maxLength: payload.max_length,
							expiryDays: payload.expiry_days, history: payload.history,
							failLockThreshold: payload.fail_lock_threshold, lockDurationMinutes: payload.lock_duration_minutes,
							requireUppercase: !!payload.require_uppercase, requireNumber: !!payload.require_number,
							requireSymbol: !!payload.require_symbol,
							blockCommonPasswords: !!payload.block_common_passwords, blockUserId: !!payload.block_user_id,
							blockPersonalInfo: !!payload.block_personal_info, blockSequentialChars: !!payload.block_sequential_chars,
							blockRepeatedChars: !!payload.block_repeated_chars, blockKeyboardPatterns: !!payload.block_keyboard_patterns,
							bannedWords: '', forceChangeFirstLogin: !!payload.force_change_first_login,
							forceChangeAdminReset: !!payload.force_change_admin_reset,
							minChangeIntervalHours: payload.min_change_interval_hours, showStrengthMeter: !!payload.show_strength_meter
						};
						state.settings.meta.lastSaved = new Date().toISOString();
						persistSettings();
						updateOverviewChips();
						updateSecurityWarnings();
						loadSecurityPolicy(); // 변경 이력 새로고침
						if (window.showToast) window.showToast('비밀번호 정책을 저장했습니다.', 'success', form);
					} else {
						if (window.showToast) window.showToast((result && result.message) || '저장에 실패했습니다.', 'error', form);
					}
				});
			});
		});

		var restoreBtn = document.querySelector('[data-action="restore-password-defaults"]');
		if (restoreBtn) {
			restoreBtn.addEventListener('click', function() {
				fetch('/admin/auth/security-policy/defaults', { method: 'POST' }).then(function(r) { return r.json(); }).then(function(result) {
					if (result && result.success) {
						state.settings.password = createDefaults().password;
						state.bannedWords = ['password','admin','welcome','qwerty','letmein','123456','abc123','master','root','login'];
						fill();
						initBannedWordsTagInput();
						persistSettings();
						updateOverviewChips();
						updateSecurityWarnings();
						loadSecurityPolicy();
						if (window.showToast) window.showToast('기본 비밀번호 정책으로 되돌렸습니다.', 'info', form);
					}
				});
			});
		}
	}

	/* ══════════════════════════════════════════════════
	   브라우저 종료 안내 토글
	   ══════════════════════════════════════════════════ */
	function initBrowserCloseInfo() {
		var cb = document.querySelector('[name="logout_on_browser_close"]');
		var info = document.getElementById('browser-close-info');
		if (!cb || !info) return;
		function toggle() { info.style.display = cb.checked ? '' : 'none'; }
		cb.addEventListener('change', toggle);
		toggle();
	}

	/* ══════════════════════════════════════════════════
	   MFA 관련 기존 함수 (유지)
	   ══════════════════════════════════════════════════ */
	function toggleMfaPanels() {
		['totp', 'sms', 'email'].forEach(function(m) {
			var chk = document.getElementById('mfa-' + m + '-enabled');
			var body = document.getElementById('mfa-' + m + '-body');
			if (chk && body) body.style.display = chk.checked ? '' : 'none';
		});
	}

	function setMfaFormDisabled(disabled) {
		var form = document.getElementById('mfa-settings-form');
		if (!form) return;
		form.querySelectorAll('input, select, button').forEach(function(el) {
			if (el.id === 'mfa-enabled' || el.id === 'mfa-test-login') return;
			el.disabled = disabled;
		});
		form.classList.toggle('is-disabled', disabled);
	}

	function maskValue(value, type) {
		if (!value) return '';
		if (type === 'sms') return value.replace(/(\d{3})-?(\d{2,3})\d{2}(\d{2})/, '$1-$2**-$3');
		if (type === 'email') {
			var parts = value.split('@');
			if (!parts[1]) return value;
			var u = parts[0], d = parts[1];
			var masked = u.length <= 2 ? u[0] + '*' : u[0] + '*'.repeat(u.length - 2) + u.slice(-1);
			return masked + '@' + d;
		}
		return '';
	}

	function handleMfaForm() {
		var form = document.getElementById('mfa-settings-form');
		var enableToggle = document.getElementById('mfa-enabled');
		if (!form || !enableToggle) return;

		function loadFromServer() {
			return fetch('/admin/auth/mfa/config').then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; });
		}
		function saveToServer(payload) {
			return fetch('/admin/auth/mfa/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) }).then(function(r) { return r.json(); }).catch(function() { return null; });
		}

		var fill = function(mfa) {
			if (!mfa) mfa = state.settings.mfa;
			enableToggle.checked = !!mfa.enabled;
			var totpChk = document.getElementById('mfa-totp-enabled');
			var smsChk = document.getElementById('mfa-sms-enabled');
			var emailChk = document.getElementById('mfa-email-enabled');
			var cotpChk = document.getElementById('mfa-company-otp-enabled');
			if (totpChk) totpChk.checked = mfa.totp_enabled !== false;
			if (smsChk) smsChk.checked = mfa.sms_enabled !== false;
			if (emailChk) emailChk.checked = mfa.email_enabled !== false;
			if (cotpChk) cotpChk.checked = !!mfa.company_otp_enabled;
			form.grace_period.value = mfa.grace_period_days != null ? mfa.grace_period_days : (mfa.gracePeriod || 0);
			form.remember_device_days.value = mfa.remember_device_days != null ? mfa.remember_device_days : (mfa.rememberDeviceDays || 7);
			form.secret.value = mfa.totp_secret || mfa.secret || generateSecret();
			toggleMfaPanels();
			setMfaFormDisabled(!enableToggle.checked);
		};

		loadFromServer().then(function(serverCfg) {
			if (serverCfg && !serverCfg.error) {
				fill(serverCfg);
				state.settings.mfa = Object.assign({}, state.settings.mfa, {
					enabled: serverCfg.enabled, totp_enabled: serverCfg.totp_enabled,
					sms_enabled: serverCfg.sms_enabled, email_enabled: serverCfg.email_enabled,
					company_otp_enabled: serverCfg.company_otp_enabled, type: serverCfg.default_type,
					gracePeriod: serverCfg.grace_period_days, rememberDeviceDays: serverCfg.remember_device_days,
					secret: serverCfg.totp_secret,
				});
				persistSettings();
				updateOverviewChips();
			} else { fill(); }
		});

		['totp', 'sms', 'email', 'company-otp'].forEach(function(m) {
			var chk = document.getElementById('mfa-' + m + '-enabled');
			if (chk) chk.addEventListener('change', function() { toggleMfaPanels(); });
		});

		form.addEventListener('submit', function(event) {
			event.preventDefault();
			var totpOn = !!document.getElementById('mfa-totp-enabled')?.checked;
			var smsOn = !!document.getElementById('mfa-sms-enabled')?.checked;
			var emailOn = !!document.getElementById('mfa-email-enabled')?.checked;
			var cotpOn = !!document.getElementById('mfa-company-otp-enabled')?.checked;
			var defaultType = totpOn ? 'totp' : smsOn ? 'sms' : emailOn ? 'email' : cotpOn ? 'company_otp' : 'totp';
			var payload = {
				enabled: enableToggle.checked, default_type: defaultType,
				totp_enabled: totpOn, sms_enabled: smsOn, email_enabled: emailOn, company_otp_enabled: cotpOn,
				grace_period_days: Number(form.grace_period.value) || 0,
				remember_device_days: Number(form.remember_device_days.value) || 0,
				totp_secret: form.secret.value || generateSecret()
			};
			saveToServer(payload).then(function(result) {
				if (result && result.status === 'ok') {
					state.settings.mfa = Object.assign({}, state.settings.mfa, {
						enabled: payload.enabled, totp_enabled: payload.totp_enabled,
						sms_enabled: payload.sms_enabled, email_enabled: payload.email_enabled,
						company_otp_enabled: payload.company_otp_enabled, type: payload.default_type,
						gracePeriod: payload.grace_period_days, rememberDeviceDays: payload.remember_device_days,
						secret: payload.totp_secret,
					});
					state.settings.meta.lastSaved = new Date().toISOString();
					persistSettings(); updateOverviewChips();
					if (window.showToast) window.showToast('MFA 설정을 저장했습니다.', 'success', form);
				} else {
					if (window.showToast) window.showToast('MFA 설정 저장에 실패했습니다.', 'error', form);
				}
			});
		});

		enableToggle.addEventListener('change', function() {
			setMfaFormDisabled(!enableToggle.checked);
			if (!enableToggle.checked) { state.settings.mfa.enabled = false; updateOverviewChips(); }
		});

		var regenBtn = form.querySelector('[data-action="regen-secret"]');
		if (regenBtn) {
			regenBtn.addEventListener('click', function() {
				form.secret.value = generateSecret();
				updateTotpQr(form.secret.value);
			});
		}

		function updateTotpQr(secret) {
			var qrBox = document.getElementById('totp-qr-box');
			if (!qrBox || !secret) return;
			qrBox.innerHTML = '<p class="helper-text" style="text-align:center;color:#94a3b8">QR 생성 중…</p>';
			fetch('/admin/auth/mfa/totp-qr', {
				method: 'POST', headers: {'Content-Type':'application/json'},
				body: JSON.stringify({ secret: secret, label: 'Blossom', issuer: 'Blossom' })
			}).then(function(res) {
				if (!res.ok) throw new Error('HTTP ' + res.status);
				return res.json();
			}).then(function(data) {
				if (data.qr) qrBox.innerHTML = '<img src="' + data.qr + '" alt="TOTP QR코드">';
				else qrBox.innerHTML = '<p class="helper-text" style="text-align:center;color:#ef4444">' + (data.error || 'QR 생성 실패') + '</p>';
			}).catch(function(e) {
				qrBox.innerHTML = '<p class="helper-text" style="text-align:center;color:#ef4444">QR 오류: ' + (e.message || '') + '</p>';
			});
		}

		loadFromServer().then(function(cfg2) {
			if (cfg2 && cfg2.totp_secret) updateTotpQr(cfg2.totp_secret);
		}).catch(function() {});

		var testBtn = document.getElementById('mfa-test-login');
		if (testBtn) {
			testBtn.addEventListener('click', function() {
				if (!enableToggle.checked) { alert('MFA가 비활성화되어 있습니다.'); return; }
				var totpOn2 = !!document.getElementById('mfa-totp-enabled')?.checked;
				var smsOn2 = !!document.getElementById('mfa-sms-enabled')?.checked;
				var emailOn2 = !!document.getElementById('mfa-email-enabled')?.checked;
				var selected = totpOn2 ? 'totp' : smsOn2 ? 'sms' : emailOn2 ? 'email' : 'totp';
				var modalApi = window.BlossomSecurityModal;
				if (!modalApi || !modalApi.open) return;
				modalApi.open(selected, { mask: '(사용자 프로필에서 조회)' }).then(function(ok) {
					if (ok && window.showToast) window.showToast('테스트 코드가 확인되었습니다.', 'success');
				});
			});
		}
	}

	/* ── SMS 설정 ── */
	function handleSmsForm() {
		var form = document.getElementById('sms-config-form');
		if (!form) return;
		var badge = document.getElementById('sms-status-badge');
		var statusEl = document.getElementById('sms-settings-status');

		function setBadge(configured) {
			if (!badge) return;
			badge.textContent = configured ? '설정 완료' : '미설정';
			badge.className = 'smtp-status-badge ' + (configured ? 'badge-ok' : '');
		}

		fetch('/admin/auth/sms/config').then(function(r) { return r.ok ? r.json() : null; }).then(function(cfg) {
			if (!cfg) return;
			form.api_key.value = cfg.api_key || '';
			form.api_secret.value = cfg.api_secret || '';
			form.sender_number.value = cfg.sender_number || '';
			setBadge(cfg.configured);
			if (statusEl) statusEl.textContent = cfg.configured ? '발신번호: ' + (cfg.sender_number || '-') : 'SMS 발송이 설정되지 않았습니다.';
		}).catch(function() {});

		form.addEventListener('submit', function(e) {
			e.preventDefault();
			var payload = { api_key: form.api_key.value.trim(), api_secret: form.api_secret.value.trim(), sender_number: form.sender_number.value.trim(), enabled: true };
			fetch('/admin/auth/sms/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) })
				.then(function(r) { return r.json(); }).then(function(result) {
					if (result.success) {
						setBadge(true);
						if (statusEl) statusEl.textContent = '발신번호: ' + (payload.sender_number || '-');
						if (window.showToast) window.showToast('SMS 설정을 저장했습니다.', 'success', form);
					} else { if (window.showToast) window.showToast(result.message || 'SMS 설정 저장 실패', 'error', form); }
				}).catch(function() { if (window.showToast) window.showToast('SMS 설정 저장 중 오류가 발생했습니다.', 'error', form); });
		});

		var testBtn = document.getElementById('sms-test-btn');
		if (testBtn) {
			var modal = document.getElementById('sms-test-modal');
			var phoneInput = document.getElementById('sms-test-phone');
			var closeBtn = document.getElementById('sms-test-modal-close');
			var cancelBtn = document.getElementById('sms-test-modal-cancel');
			var sendBtn = document.getElementById('sms-test-modal-send');
			var testForm = document.getElementById('sms-test-form');
			function openModal() { if (modal) { modal.setAttribute('aria-hidden', 'false'); phoneInput.value = ''; phoneInput.focus(); } }
			function closeModal() { if (modal) modal.setAttribute('aria-hidden', 'true'); }
			testBtn.addEventListener('click', openModal);
			if (closeBtn) closeBtn.addEventListener('click', closeModal);
			if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
			if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });
			if (testForm) testForm.addEventListener('submit', function(e) {
				e.preventDefault();
				var phone = (phoneInput.value || '').trim();
				if (!phone) return;
				sendBtn.disabled = true; sendBtn.textContent = '발송 중…';
				fetch('/admin/auth/sms/test', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ phone: phone }) })
					.then(function(r) { return r.json(); }).then(function(result) {
						closeModal();
						if (result.success) { if (window.showToast) window.showToast(result.message, 'success', form); }
						else { if (window.showToast) window.showToast(result.message || '테스트 발송 실패', 'error', form); }
					}).catch(function() { closeModal(); if (window.showToast) window.showToast('테스트 발송 중 오류가 발생했습니다.', 'error', form); })
					.finally(function() { sendBtn.disabled = false; sendBtn.textContent = '발송'; });
			});
		}
	}

	/* ── 사내 OTP 설정 ── */
	function handleCompanyOtpForm() {
		var form = document.getElementById('company-otp-config-form');
		if (!form) return;
		var badge = document.getElementById('company-otp-status-badge');
		var statusEl = document.getElementById('company-otp-settings-status');
		var PROVIDER_LABELS = { initech: '이니텍 (INISAFE OTP)', dreamsecurity: '드림시큐리티 (MagicOTP)', miraetech: '미래테크 (SafeOTP)' };

		function setBadge(configured, provider) {
			if (!badge) return;
			badge.textContent = configured ? (PROVIDER_LABELS[provider] || provider || '설정 완료') : '미설정';
			badge.className = 'smtp-status-badge ' + (configured ? 'badge-ok' : '');
		}

		fetch('/admin/auth/company-otp/config').then(function(r) { return r.ok ? r.json() : null; }).then(function(cfg) {
			if (!cfg) return;
			form.provider.value = cfg.provider || 'initech';
			form.api_endpoint.value = cfg.api_endpoint || '';
			form.api_key.value = cfg.api_key || '';
			form.api_secret.value = cfg.api_secret || '';
			form.server_code.value = cfg.server_code || '';
			form.timeout.value = cfg.timeout || 5;
			setBadge(cfg.configured, cfg.provider);
			if (statusEl) statusEl.textContent = cfg.configured ? '연동 서버: ' + (cfg.api_endpoint || '-') : '사내 OTP 서버가 설정되지 않았습니다.';
		}).catch(function() {});

		form.addEventListener('submit', function(e) {
			e.preventDefault();
			var payload = {
				provider: form.provider.value, api_endpoint: form.api_endpoint.value.trim(),
				api_key: form.api_key.value.trim(), api_secret: form.api_secret.value.trim(),
				server_code: form.server_code.value.trim(), timeout: Number(form.timeout.value) || 5, enabled: true
			};
			fetch('/admin/auth/company-otp/config', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) })
				.then(function(r) { return r.json(); }).then(function(result) {
					if (result.success) {
						setBadge(true, payload.provider);
						if (statusEl) statusEl.textContent = '연동 서버: ' + (payload.api_endpoint || '-');
						if (window.showToast) window.showToast('사내 OTP 설정을 저장했습니다.', 'success', form);
					} else { if (window.showToast) window.showToast(result.message || '사내 OTP 설정 저장 실패', 'error', form); }
				}).catch(function() { if (window.showToast) window.showToast('사내 OTP 설정 저장 중 오류가 발생했습니다.', 'error', form); });
		});

		var testBtn = document.getElementById('cotp-test-btn');
		if (testBtn) {
			var modal2 = document.getElementById('cotp-test-modal');
			var empInput = document.getElementById('cotp-test-empno');
			var codeInput = document.getElementById('cotp-test-code');
			var closeBtn2 = document.getElementById('cotp-test-modal-close');
			var cancelBtn2 = document.getElementById('cotp-test-modal-cancel');
			var sendBtn2 = document.getElementById('cotp-test-modal-send');
			var testForm2 = document.getElementById('cotp-test-form');
			function openM() { if (modal2) { modal2.setAttribute('aria-hidden', 'false'); empInput.value = ''; codeInput.value = ''; empInput.focus(); } }
			function closeM() { if (modal2) modal2.setAttribute('aria-hidden', 'true'); }
			testBtn.addEventListener('click', openM);
			if (closeBtn2) closeBtn2.addEventListener('click', closeM);
			if (cancelBtn2) cancelBtn2.addEventListener('click', closeM);
			if (modal2) modal2.addEventListener('click', function(e) { if (e.target === modal2) closeM(); });
			if (testForm2) testForm2.addEventListener('submit', function(e) {
				e.preventDefault();
				var emp = (empInput.value || '').trim();
				var code = (codeInput.value || '').trim();
				if (!emp || !code) return;
				sendBtn2.disabled = true; sendBtn2.textContent = '인증 중…';
				fetch('/admin/auth/company-otp/test', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ emp_no: emp, code: code }) })
					.then(function(r) { return r.json(); }).then(function(result) {
						closeM();
						if (result.success) { if (window.showToast) window.showToast(result.message, 'success', form); }
						else { if (window.showToast) window.showToast(result.message || '인증 실패', 'error', form); }
					}).catch(function() { closeM(); if (window.showToast) window.showToast('사내 OTP 테스트 중 오류가 발생했습니다.', 'error', form); })
					.finally(function() { sendBtn2.disabled = false; sendBtn2.textContent = '인증 테스트'; });
			});
		}
	}

	/* ══════════════════════════════════════════════════
	   세션 및 접속 관리 폼
	   ══════════════════════════════════════════════════ */
	function handleSessionForm() {
		var form = document.getElementById('session-settings-form');
		var forceBtn = document.querySelector('[data-action="force-logout"]');
		if (!form) return;

		var fill = function() {
			var s = state.settings.session;
			form.idle_minutes.value = s.idleMinutes;
			form.absolute_hours.value = s.absoluteHours;
			form.max_sessions.value = String(s.maxSessions);
			form.notify_new_login.checked = !!s.notifyNewLogin;
			form.auto_logout_admin.checked = !!s.autoLogoutAdmin;
			if (form.logout_on_browser_close) form.logout_on_browser_close.checked = s.logoutOnBrowserClose !== false;
			if (form.session_reissue_minutes) form.session_reissue_minutes.value = s.sessionReissueMinutes || 30;
			if (form.concurrent_policy) form.concurrent_policy.value = s.concurrentPolicy || 'kill_oldest';
		};

		fill();

		form.addEventListener('submit', function(event) {
			event.preventDefault();
			var payload = {
				idle_minutes: Number(form.idle_minutes.value) || 30,
				absolute_hours: Number(form.absolute_hours.value) || 12,
				max_sessions: Number(form.max_sessions.value) || 1,
				notify_new_login: form.notify_new_login.checked ? 1 : 0,
				auto_logout_admin: form.auto_logout_admin.checked ? 1 : 0,
				logout_on_browser_close: form.logout_on_browser_close ? (form.logout_on_browser_close.checked ? 1 : 0) : 1,
				session_reissue_minutes: Number(form.session_reissue_minutes.value) || 30,
				concurrent_policy: form.concurrent_policy ? form.concurrent_policy.value : 'kill_oldest'
			};

			var applyItems = [
				{ type: 'immediate', text: '유휴 시간/세션 만료 설정: 즉시 적용됩니다.' },
				{ type: 'next-login', text: '브라우저 종료 로그아웃: 다음 로그인부터 적용됩니다.' },
				{ type: 'info', text: '현재 활성 세션은 기존 설정이 유지되며, 새로 생성되는 세션부터 적용됩니다.' }
			];

			showApplyModal(applyItems).then(function(confirmed) {
				if (!confirmed) return;
				saveSecurityPolicy(payload).then(function(result) {
					if (result && result.success) {
						state.settings.session = {
							idleMinutes: payload.idle_minutes, absoluteHours: payload.absolute_hours,
							maxSessions: payload.max_sessions, notifyNewLogin: !!payload.notify_new_login,
							autoLogoutAdmin: !!payload.auto_logout_admin, logoutOnBrowserClose: !!payload.logout_on_browser_close,
							sessionReissueMinutes: payload.session_reissue_minutes,
							concurrentPolicy: payload.concurrent_policy
						};
						state.settings.meta.lastSaved = new Date().toISOString();
						persistSettings();
						updateOverviewChips();
						updateSecurityWarnings();
						loadSecurityPolicy();
						if (window.showToast) window.showToast('세션 정책을 저장했습니다.', 'success', form);
					} else {
						if (window.showToast) window.showToast((result && result.message) || '저장에 실패했습니다.', 'error', form);
					}
				});
			});
		});

		if (forceBtn) {
			forceBtn.addEventListener('click', function() {
				if (window.showToast) window.showToast('전체 사용자를 로그아웃하도록 예약했습니다.', 'info', forceBtn);
			});
		}
	}

	/* ══════════════════════════════════════════════════
	   초기화
	   ══════════════════════════════════════════════════ */
	function init() {
		var wrapper = document.querySelector('.admin-settings-wrapper');
		if (!wrapper) return;
		state.settings = loadSettings();
		window.BlossomSecurity = Object.assign({}, window.BlossomSecurity || {}, {
			STORAGE_KEY: STORAGE_KEY,
			getSettings: function() { return Object.assign({}, state.settings); },
			refreshSettings: function() { state.settings = loadSettings(); return state.settings; }
		});
		if (window.BlossomSecurityModal && window.BlossomSecurityModal.ensure) window.BlossomSecurityModal.ensure();

		// 서버에서 보안정책 로드
		loadSecurityPolicy().then(function() {
			handlePasswordForm();
			handleMfaForm();
			handleSmsForm();
			handleCompanyOtpForm();
			handleSessionForm();
			initBannedWordsTagInput();
			initStrengthMeter();
			initBrowserCloseInfo();
			updateOverviewChips();
			updateSecurityWarnings();
		});
	}

	document.addEventListener('DOMContentLoaded', init);
})();
