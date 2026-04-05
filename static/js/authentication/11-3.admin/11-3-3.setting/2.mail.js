(function () {
	'use strict';

	/* ── 상태 ─────────────────────────────────────────── */
	const API_BASE = '/admin/auth/mail';

	/* ── DOM refs ─────────────────────────────────────── */
	const form       = () => document.getElementById('smtp-config-form');
	const statusEl   = () => document.getElementById('smtp-config-status');
	const badgeEl    = () => document.getElementById('smtp-status-badge');
	const testBtn    = () => document.getElementById('smtp-test-btn');
	const connectBtn = () => document.getElementById('smtp-connect-btn');

	/* ── 유틸 ─────────────────────────────────────────── */
	function showStatus(text, ok) {
		const el = statusEl();
		if (!el) return;
		el.textContent = text;
		el.style.color = ok ? '#059669' : '#dc2626';
	}

	function setBadge(configured) {
		const el = badgeEl();
		if (!el) return;
		if (configured) {
			el.textContent = '설정 완료';
			el.classList.add('configured');
			el.classList.remove('not-configured');
		} else {
			el.textContent = '미설정';
			el.classList.remove('configured');
			el.classList.add('not-configured');
		}
	}

	/* ── 인증 토글 → 계정/비밀번호 필수 여부 ──────────── */
	function syncAuthToggle() {
		const authCb = document.getElementById('smtp-use-auth');
		if (!authCb) return;
		const userEl = document.getElementById('smtp-username');
		const passEl = document.getElementById('smtp-password');
		const isAuth = authCb.checked;
		if (userEl) userEl.required = isAuth;
		if (passEl) passEl.required = isAuth;
		if (userEl) userEl.style.opacity = isAuth ? '1' : '0.5';
		if (passEl) passEl.style.opacity = isAuth ? '1' : '0.5';
	}

	/* ── 불러오기 ─────────────────────────────────────── */
	async function loadConfig() {
		try {
			const res  = await fetch(API_BASE + '/config');
			const data = await res.json();
			const f = form();
			if (!f) return;
			f.querySelector('#smtp-host').value       = data.host || '';
			f.querySelector('#smtp-port').value        = data.port || 587;
			f.querySelector('#smtp-encryption').value  = data.encryption || 'STARTTLS';
			f.querySelector('#smtp-username').value    = data.username || '';
			f.querySelector('#smtp-password').value    = data.password || '';
			f.querySelector('#smtp-from-name').value   = data.from_name || '';
			f.querySelector('#smtp-from-email').value  = data.from_email || '';
			// 새 필드
			const replyTo = f.querySelector('#smtp-reply-to');
			if (replyTo) replyTo.value = data.reply_to || '';
			const useAuth = f.querySelector('#smtp-use-auth');
			if (useAuth) useAuth.checked = data.use_auth !== false;
			const verifyCert = f.querySelector('#smtp-verify-cert');
			if (verifyCert) verifyCert.checked = data.verify_cert !== false;
			// 고급 설정: 기본값이 아니면 자동 펼침
			if (data.use_auth === false || data.verify_cert === false) {
				const details = document.getElementById('smtp-advanced');
				if (details) details.open = true;
			}
			setBadge(data.configured);
			if (data.configured) {
				showStatus('SMTP 설정이 저장되어 있습니다.', true);
			}
			syncAuthToggle();
		} catch (e) {
			console.error('SMTP config load error', e);
		}
	}

	/* ── 저장 ─────────────────────────────────────────── */
	async function saveConfig(e) {
		e.preventDefault();
		const f = form();
		if (!f || !f.checkValidity()) { f && f.reportValidity(); return; }

		const payload = {
			host:        f.querySelector('#smtp-host').value.trim(),
			port:        parseInt(f.querySelector('#smtp-port').value, 10) || 587,
			encryption:  f.querySelector('#smtp-encryption').value,
			username:    f.querySelector('#smtp-username').value.trim(),
			password:    f.querySelector('#smtp-password').value,
			from_name:   f.querySelector('#smtp-from-name').value.trim(),
			from_email:  f.querySelector('#smtp-from-email').value.trim(),
			reply_to:    (f.querySelector('#smtp-reply-to') || {}).value || '',
			use_auth:    f.querySelector('#smtp-use-auth') ? f.querySelector('#smtp-use-auth').checked : true,
			verify_cert: f.querySelector('#smtp-verify-cert') ? f.querySelector('#smtp-verify-cert').checked : true,
		};

		try {
			const res  = await fetch(API_BASE + '/config', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});
			const data = await res.json();
			if (data.success) {
				showStatus(data.message || '저장되었습니다.', true);
				setBadge(true);
			} else {
				showStatus(data.message || '저장 실패', false);
			}
		} catch (e) {
			showStatus('서버 통신 오류', false);
			console.error(e);
		}
	}

	/* ── 연결 테스트 (EHLO only, 메일 미발송) ─────────── */
	async function connectTest() {
		const btn = connectBtn();
		if (!btn) return;
		const origText = btn.textContent;
		btn.disabled = true;
		btn.textContent = '연결 중…';
		showStatus('SMTP 서버 연결 확인 중…', true);

		try {
			const res  = await fetch(API_BASE + '/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mode: 'connect' }),
			});
			const data = await res.json();
			showStatus(data.message || (data.success ? '연결 성공' : '연결 실패'), data.success);
		} catch (e) {
			showStatus('서버 통신 오류', false);
			console.error(e);
		} finally {
			btn.disabled = false;
			btn.textContent = origText;
		}
	}

	/* ── 테스트 발송 ──────────────────────────────────── */
	async function testSend() {
		const btn = testBtn();
		if (!btn) return;
		const origText = btn.textContent;
		btn.disabled = true;
		btn.textContent = '발송 중…';
		showStatus('테스트 메일 발송 중…', true);

		try {
			const res  = await fetch(API_BASE + '/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mode: 'send' }),
			});
			const data = await res.json();
			showStatus(data.message || (data.success ? '성공' : '실패'), data.success);
		} catch (e) {
			showStatus('서버 통신 오류', false);
			console.error(e);
		} finally {
			btn.disabled = false;
			btn.textContent = origText;
		}
	}

	/* ── 비밀번호 토글 ────────────────────────────────── */
	function initPasswordToggle() {
		document.querySelectorAll('.toggle-password').forEach(function (btn) {
			btn.addEventListener('click', function () {
				const target = document.getElementById(btn.dataset.target);
				if (!target) return;
				const isPassword = target.type === 'password';
				target.type = isPassword ? 'text' : 'password';
				btn.setAttribute('aria-label', isPassword ? '비밀번호 숨기기' : '비밀번호 보기');
			});
		});
	}

	/* ── 암호화 방식 → 포트 자동 입력 ─────────────────── */
	function initEncryptionPortSync() {
		const encSel  = document.getElementById('smtp-encryption');
		const portIn  = document.getElementById('smtp-port');
		if (!encSel || !portIn) return;
		const portMap = { STARTTLS: 587, SSL: 465, NONE: 25 };
		encSel.addEventListener('change', function () {
			const suggested = portMap[encSel.value];
			if (suggested && (!portIn.value || portIn.value in { '587': 1, '465': 1, '25': 1 })) {
				portIn.value = suggested;
			}
		});
	}

	/* ── 초기화 ───────────────────────────────────────── */
	function init() {
		const f = form();
		if (!f) return;
		f.addEventListener('submit', saveConfig);
		const btn = testBtn();
		if (btn) btn.addEventListener('click', testSend);
		const cBtn = connectBtn();
		if (cBtn) cBtn.addEventListener('click', connectTest);
		// 인증 토글 이벤트
		const authCb = document.getElementById('smtp-use-auth');
		if (authCb) authCb.addEventListener('change', syncAuthToggle);
		initPasswordToggle();
		initEncryptionPortSync();
		loadConfig();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
