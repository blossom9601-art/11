/**
 * sign-in.js — 로그인 폼 + MFA 인증 플로우
 *
 * HTML에서 data 속성으로 서버 변수를 전달:
 *   <div id="mfa-data" data-required="true|false" data-emp-no="..."></div>
 */
(function () {
    'use strict';

    /* ── 서버에서 전달된 MFA 플래그 (data 속성으로 수신) ── */
    const dataEl = document.getElementById('mfa-data');
    const mfaRequired = dataEl && dataEl.dataset.required === 'true';
    const mfaEmpNo = (dataEl && dataEl.dataset.empNo) || '';

    /* ── DOM 참조 ── */
    const selectModal = document.getElementById('mfa-select-modal');
    const codeModal = document.getElementById('mfa-code-modal');
    const loginForm = document.getElementById('login-form');
    let timerInterval = null;
    let currentMethod = '';
    let currentTtl = 300;

    /* ── 모달 열기 / 닫기 ── */
    function openModal(el) {
        el.classList.add('show');
        el.removeAttribute('aria-hidden');
    }
    function closeModal(el) {
        el.classList.remove('show');
        el.setAttribute('aria-hidden', 'true');
    }

    /* ── MFA 인증 방식 선택 모달 ── */
    function showMfaSelect() {
        fetch('/api/mfa/status')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var list = document.getElementById('mfa-method-list');
                if (!data.enabled) { loginForm.submit(); return; }
                var methods = data.methods || ['totp'];
                list.querySelectorAll('.mfa-method-btn').forEach(function (btn) {
                    btn.style.display = methods.includes(btn.dataset.method) ? '' : 'none';
                });
                openModal(selectModal);
            })
            .catch(function () { loginForm.submit(); });
    }

    /* ── 인증 방식 버튼 클릭 → 코드 전송 ── */
    document.querySelectorAll('.mfa-method-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            currentMethod = btn.dataset.method;
            closeModal(selectModal);
            sendCode(currentMethod);
        });
    });

    /* ── 코드 전송 API ── */
    function sendCode(method) {
        var emp = mfaEmpNo || document.getElementById('employee_id').value;
        document.getElementById('mfa-code-type').value = method;
        document.getElementById('mfa-code-emp').value = emp;

        fetch('/api/mfa/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emp_no: emp, mfa_type: method })
        })
            .then(function (r) {
                if (!r.ok) return r.json().then(function (e) { throw e; });
                return r.json();
            })
            .then(function (data) {
                currentTtl = data.ttl || 300;
                var maxLen = data.code_length || 6;
                var codeInput = document.getElementById('mfa-code-input');
                codeInput.maxLength = maxLen;
                codeInput.placeholder = '0'.repeat(maxLen);
                codeInput.value = '';

                var title = document.getElementById('mfa-code-title');
                var hint = document.getElementById('mfa-code-hint');
                var subtitle = document.getElementById('mfa-code-subtitle');

                if (method === 'email') {
                    title.textContent = '이메일 인증';
                    subtitle.textContent = data.mask ? data.mask + '(으)로 코드를 전송했습니다.' : '등록된 메일로 코드를 전송했습니다.';
                    hint.textContent = '이메일 받은편지함에서 인증 코드를 확인하세요.';
                } else if (method === 'sms') {
                    title.textContent = '휴대폰 인증';
                    subtitle.textContent = data.mask ? data.mask + '(으)로 코드를 전송했습니다.' : '등록된 번호로 SMS을 전송했습니다.';
                    hint.textContent = 'SMS로 전달된 인증 코드를 입력하세요.';
                } else if (method === 'company_otp') {
                    title.textContent = '사내 OTP 인증';
                    subtitle.textContent = '사내 OTP 토큰/앱을 확인하세요.';
                    hint.textContent = 'OTP 토큰에 표시된 6자리 숫자를 입력하세요.';
                } else {
                    title.textContent = 'OTP 인증';
                    subtitle.textContent = '인증 앱(Google Authenticator 등)을 확인하세요.';
                    hint.textContent = '인증 앱에 표시된 6자리 숫자를 입력하세요.';
                }

                startTimer(currentTtl);
                openModal(codeModal);
                requestAnimationFrame(function () { codeInput.focus(); });
            })
            .catch(function (err) {
                var msg = err.message || err.error || '인증 코드 전송에 실패했습니다.';
                alert(msg);
            });
    }

    /* ── 타이머 ── */
    function startTimer(seconds) {
        clearInterval(timerInterval);
        var remaining = seconds;
        var el = document.getElementById('mfa-timer-text');
        function tick() {
            var m = Math.floor(remaining / 60);
            var s = remaining % 60;
            el.textContent = m + ':' + String(s).padStart(2, '0');
            if (remaining <= 0) { clearInterval(timerInterval); el.textContent = '만료됨'; }
            remaining--;
        }
        tick();
        timerInterval = setInterval(tick, 1000);
    }

    /* ── 코드 재전송 ── */
    document.getElementById('mfa-resend-btn').addEventListener('click', function () {
        sendCode(currentMethod);
    });

    /* ── 코드 검증 ── */
    document.getElementById('mfa-code-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var code = document.getElementById('mfa-code-input').value.trim();
        var emp = document.getElementById('mfa-code-emp').value;
        var type = document.getElementById('mfa-code-type').value;
        if (!code) { alert('인증 코드를 입력하세요.'); return; }

        var confirmBtn = document.getElementById('mfa-code-confirm');
        confirmBtn.disabled = true;
        confirmBtn.textContent = '확인 중…';

        fetch('/api/mfa/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emp_no: emp, code: code, mfa_type: type })
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.verified) {
                    closeModal(codeModal);
                    window.location.href = data.redirect || '/dashboard';
                } else {
                    alert(data.error || '인증에 실패했습니다.');
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = '확인';
                }
            })
            .catch(function () {
                alert('인증 확인 중 오류가 발생했습니다.');
                confirmBtn.disabled = false;
                confirmBtn.textContent = '확인';
            });
    });

    /* ── 뒤로 / 취소 버튼 ── */
    document.getElementById('mfa-select-cancel').addEventListener('click', function () {
        closeModal(selectModal);
    });
    document.getElementById('mfa-code-cancel').addEventListener('click', function () {
        closeModal(codeModal);
        clearInterval(timerInterval);
    });
    document.getElementById('mfa-code-back').addEventListener('click', function () {
        closeModal(codeModal);
        clearInterval(timerInterval);
        openModal(selectModal);
    });

    /* ── 오버레이 클릭 닫기 ── */
    [selectModal, codeModal].forEach(function (m) {
        m.addEventListener('click', function (e) {
            if (e.target === m) { closeModal(m); clearInterval(timerInterval); }
        });
    });

    /* ── ESC 키 ── */
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (codeModal.classList.contains('show')) { closeModal(codeModal); clearInterval(timerInterval); }
            else if (selectModal.classList.contains('show')) { closeModal(selectModal); }
        }
    });

    /* ── 로그인 폼 submit → AJAX 인증 → MFA 체크 ── */
    loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        var empId = loginForm.employee_id.value.trim();
        var pw = loginForm.password.value.trim();

        if (!empId || !pw) { loginForm.reportValidity(); return; }

        /* MFA 인증 완료 후 재제출 */
        if (loginForm.dataset.mfaCompleted === 'true') {
            loginForm.dataset.mfaCompleted = '';
            loginForm.submit();
            return;
        }

        try {
            var res = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: new URLSearchParams({ employee_id: empId, password: pw })
            });
            var ct = res.headers.get('content-type') || '';

            if (ct.includes('application/json')) {
                var data = await res.json();
                if (data.mfa_required) {
                    document.getElementById('mfa-code-emp').value = data.emp_no || empId;
                    showMfaSelect();
                } else if (data.redirect) {
                    window.location.href = data.redirect;
                } else {
                    loginForm.dataset.mfaCompleted = 'true';
                    loginForm.submit();
                }
            } else {
                document.open();
                document.write(await res.text());
                document.close();
            }
        } catch (err) {
            loginForm.submit();
        }
    });
})();
