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

    /** 사번: 영문 대소문자·숫자만 허용 */
    function alphanumericOnly(str) {
        return String(str).replace(/[^A-Za-z0-9]/g, '');
    }
    function bindEmpNoAlphanumeric(el) {
        if (!el) return;
        el.addEventListener('input', function (e) {
            if (e.isComposing) return;
            var v = el.value;
            var f = alphanumericOnly(v);
            if (v !== f) {
                var sel = el.selectionStart;
                var before = v.slice(0, sel);
                var caret = alphanumericOnly(before).length;
                el.value = f;
                el.setSelectionRange(caret, caret);
            }
        });
        el.addEventListener('compositionend', function () {
            var v = el.value;
            var f = alphanumericOnly(v);
            if (v !== f) el.value = f;
        });
        el.addEventListener('paste', function (e) {
            e.preventDefault();
            var paste = (e.clipboardData || window.clipboardData).getData('text') || '';
            var filtered = alphanumericOnly(paste);
            var start = el.selectionStart;
            var end = el.selectionEnd;
            var cur = el.value;
            el.value = cur.slice(0, start) + filtered + cur.slice(end);
            var pos = start + filtered.length;
            el.setSelectionRange(pos, pos);
        });
    }
    bindEmpNoAlphanumeric(document.getElementById('employee_id'));
    bindEmpNoAlphanumeric(document.getElementById('chpw-emp'));
    bindEmpNoAlphanumeric(document.getElementById('forgot-emp'));

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

    /* ── 페이지 로드 시 MFA 필요 플래그가 설정되어 있으면 자동으로 MFA 선택 모달 열기 ── */
    if (mfaRequired && mfaEmpNo) {
        showMfaSelect();
    }

    /* ── MFA 인증 방식 선택 모달 ── */
    function showMfaSelect() {
        fetch('/api/mfa/status', { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (r) {
                var ct = (r.headers.get('content-type') || '');
                if (!ct.includes('application/json')) throw new Error('not_json');
                return r.json();
            })
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
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify({ emp_no: emp, mfa_type: method })
        })
            .then(function (r) {
                var ct = (r.headers.get('content-type') || '');
                if (!ct.includes('application/json')) throw new Error('인증 코드 전송에 실패했습니다.');
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
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify({ emp_no: emp, code: code, mfa_type: type })
        })
            .then(function (r) {
                var ct = (r.headers.get('content-type') || '');
                if (!ct.includes('application/json')) throw new Error('server_error');
                return r.json();
            })
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
            if (forgotModal.classList.contains('show')) { closeModal(forgotModal); }
            else if (chpwModal.classList.contains('show')) { closeModal(chpwModal); }
            else if (codeModal.classList.contains('show')) { closeModal(codeModal); clearInterval(timerInterval); }
            else if (selectModal.classList.contains('show')) { closeModal(selectModal); }
        }
    });

    /* ── 비밀번호 변경 모달 ── */
    var chpwModal = document.getElementById('chpw-modal');
    var chpwForm  = document.getElementById('chpw-form');
    var chpwMsg   = document.getElementById('chpw-msg');

    document.getElementById('open-change-pw').addEventListener('click', function (e) {
        e.preventDefault();
        chpwForm.reset();
        chpwMsg.textContent = '';
        chpwMsg.className = 'chpw-msg';
        var empField = document.getElementById('chpw-emp');
        var loginEmp = document.getElementById('employee_id').value.trim();
        if (loginEmp) empField.value = loginEmp;
        openModal(chpwModal);
        requestAnimationFrame(function () { (loginEmp ? document.getElementById('chpw-cur') : empField).focus(); });
    });

    document.getElementById('chpw-cancel').addEventListener('click', function () { closeModal(chpwModal); });
    chpwModal.addEventListener('click', function (e) { if (e.target === chpwModal) closeModal(chpwModal); });

    chpwForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = document.getElementById('chpw-submit');
        btn.disabled = true;
        btn.textContent = '처리 중…';
        chpwMsg.textContent = '';
        chpwMsg.className = 'chpw-msg';

        var body = {
            emp_no: document.getElementById('chpw-emp').value.trim(),
            current_password: document.getElementById('chpw-cur').value,
            new_password: document.getElementById('chpw-new').value,
            confirm_password: document.getElementById('chpw-confirm').value
        };

        fetch('/api/change-password-public', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
            if (res.ok && res.data.success) {
                chpwMsg.textContent = res.data.message || '비밀번호가 변경되었습니다.';
                chpwMsg.className = 'chpw-msg chpw-success';
                chpwForm.reset();
                setTimeout(function () { closeModal(chpwModal); }, 2000);
            } else {
                chpwMsg.textContent = res.data.error || '변경에 실패했습니다.';
                chpwMsg.className = 'chpw-msg chpw-error';
            }
        })
        .catch(function () {
            chpwMsg.textContent = '서버 통신 중 오류가 발생했습니다.';
            chpwMsg.className = 'chpw-msg chpw-error';
        })
        .finally(function () {
            btn.disabled = false;
            btn.textContent = '변경';
        });
    });

    /* ── 비밀번호 찾기 모달 (스텝) ── */
    var forgotModal = document.getElementById('forgot-modal');
    var forgotForm  = document.getElementById('forgot-form');
    var forgotMsg   = document.getElementById('forgot-msg');
    var forgotStep  = 1;
    var forgotBtn   = document.getElementById('forgot-next');
    var stepEls     = document.querySelectorAll('.forgot-step');

    function showForgotStep(n) {
        forgotStep = n;
        forgotMsg.textContent = ''; forgotMsg.className = 'chpw-msg';
        for (var i = 1; i <= 3; i++) {
            document.getElementById('forgot-step' + i).style.display = i === n ? '' : 'none';
        }
        stepEls.forEach(function (el) {
            el.classList.toggle('active', parseInt(el.dataset.step) === n);
            el.classList.toggle('done', parseInt(el.dataset.step) < n);
        });
        forgotBtn.textContent = n < 3 ? '다음' : '임시 비밀번호 발송';
        var focusId = n === 1 ? 'forgot-emp' : n === 2 ? 'forgot-email' : 'forgot-name';
        requestAnimationFrame(function () { document.getElementById(focusId).focus(); });
    }

    document.getElementById('open-forgot-pw').addEventListener('click', function (e) {
        e.preventDefault();
        forgotForm.reset();
        showForgotStep(1);
        var loginEmp = document.getElementById('employee_id').value.trim();
        if (loginEmp) document.getElementById('forgot-emp').value = loginEmp;
        openModal(forgotModal);
        requestAnimationFrame(function () { document.getElementById('forgot-emp').focus(); });
    });

    document.getElementById('forgot-cancel').addEventListener('click', function () { closeModal(forgotModal); });
    forgotModal.addEventListener('click', function (e) { if (e.target === forgotModal) closeModal(forgotModal); });

    forgotBtn.addEventListener('click', function () {
        forgotMsg.textContent = ''; forgotMsg.className = 'chpw-msg';
        if (forgotStep === 1) {
            var empVal = document.getElementById('forgot-emp').value.trim();
            if (!empVal) { forgotMsg.textContent = '사번을 입력해주세요.'; forgotMsg.className = 'chpw-msg chpw-error'; return; }
            forgotBtn.disabled = true;
            fetch('/api/forgot-password/verify', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ step: 1, emp_no: empVal })
            })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
            .then(function (res) {
                if (res.data.success) { showForgotStep(2); }
                else { forgotMsg.textContent = res.data.error; forgotMsg.className = 'chpw-msg chpw-error'; }
            })
            .catch(function () { forgotMsg.textContent = '서버 통신 오류'; forgotMsg.className = 'chpw-msg chpw-error'; })
            .finally(function () { forgotBtn.disabled = false; });
        } else if (forgotStep === 2) {
            var emailVal = document.getElementById('forgot-email').value.trim();
            if (!emailVal) { forgotMsg.textContent = '이메일을 입력해주세요.'; forgotMsg.className = 'chpw-msg chpw-error'; return; }
            forgotBtn.disabled = true;
            fetch('/api/forgot-password/verify', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ step: 2, emp_no: document.getElementById('forgot-emp').value.trim(), email: emailVal })
            })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
            .then(function (res) {
                if (res.data.success) { showForgotStep(3); }
                else { forgotMsg.textContent = res.data.error; forgotMsg.className = 'chpw-msg chpw-error'; }
            })
            .catch(function () { forgotMsg.textContent = '서버 통신 오류'; forgotMsg.className = 'chpw-msg chpw-error'; })
            .finally(function () { forgotBtn.disabled = false; });
        } else {
            if (!document.getElementById('forgot-name').value.trim()) {
                forgotMsg.textContent = '이름을 입력해주세요.'; forgotMsg.className = 'chpw-msg chpw-error'; return;
            }
            forgotBtn.disabled = true; forgotBtn.textContent = '발송 중…';
            fetch('/api/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    emp_no: document.getElementById('forgot-emp').value.trim(),
                    email: document.getElementById('forgot-email').value.trim(),
                    name: document.getElementById('forgot-name').value.trim()
                })
            })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
            .then(function (res) {
                if (res.ok && res.data.success) {
                    forgotMsg.textContent = res.data.message;
                    forgotMsg.className = 'chpw-msg chpw-success';
                    forgotForm.reset();
                    setTimeout(function () { closeModal(forgotModal); }, 3000);
                } else {
                    forgotMsg.textContent = res.data.error || '요청 처리에 실패했습니다.';
                    forgotMsg.className = 'chpw-msg chpw-error';
                }
            })
            .catch(function () {
                forgotMsg.textContent = '서버 통신 중 오류가 발생했습니다.';
                forgotMsg.className = 'chpw-msg chpw-error';
            })
            .finally(function () {
                forgotBtn.disabled = false;
                forgotBtn.textContent = '임시 비밀번호 발송';
            });
        }
    });

    /* Enter 키로 다음 스텝 이동 */
    ['forgot-emp', 'forgot-email', 'forgot-name'].forEach(function (id) {
        document.getElementById(id).addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); forgotBtn.click(); }
        });
    });

    /* ── 로그인 폼 submit → AJAX 인증 → MFA 체크 ── */
    loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        var empId = loginForm.employee_id.value.trim();
        var pw = loginForm.password.value.trim();

        if (!empId || !pw) { loginForm.reportValidity(); return; }
        if (!loginForm.checkValidity()) { loginForm.reportValidity(); return; }

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
