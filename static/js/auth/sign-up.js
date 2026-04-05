(function(){
  // Guard: only run on sign-up page
  if(!document.body.classList.contains('page-auth-signup')) return;
  const form = document.getElementById('signup-form');
  if(!form) return;
  const pw = document.getElementById('password');
  const pwc = document.getElementById('password_confirm');
  const emp = document.getElementById('emp_no');
  const email = document.getElementById('email');
  const agree = document.getElementById('terms_agree');
  const submitBtn = form.querySelector('button[type="submit"]');
  // Constraints
  emp.setAttribute('inputmode','numeric');
  emp.setAttribute('pattern','\\d{8}');
  emp.setAttribute('minlength','8');
  emp.setAttribute('maxlength','8');
  pw.setAttribute('minlength','8');
  pwc.setAttribute('minlength','8');
  function validateEmp(){
    const ok = /^\d{8}$/.test(emp.value.trim());
    if(!emp.value.trim()){
      emp.setCustomValidity('사번을 입력하세요.');
    } else if(!ok){
      emp.setCustomValidity('사번은 숫자 8자리여야 합니다.');
    } else {
      emp.setCustomValidity('');
    }
  }
  function validateMatch(){
    if(pwc.value && pw.value !== pwc.value){
      pwc.setCustomValidity('비밀번호가 일치하지 않습니다.');
    } else {
      pwc.setCustomValidity('');
    }
  }
  function validatePassword(){
    if(!pw.value){
      pw.setCustomValidity('비밀번호를 입력하세요.');
    } else if(pw.value.length < 8){
      pw.setCustomValidity('비밀번호는 8자 이상이어야 합니다.');
    } else {
      pw.setCustomValidity('');
    }
  }
  function updateSubmitState(){
    validateEmp();
    validatePassword();
    validateMatch();
    const allFilled = emp.value.trim() && email.value.trim() && pw.value && pwc.value;
    const ok = allFilled && form.checkValidity() && agree.checked;
    submitBtn.disabled = !ok;
  }
  pw.addEventListener('input', () => { validatePassword(); validateMatch(); });
  pwc.addEventListener('input', validateMatch);
  emp.addEventListener('input', validateEmp);
  ;[emp, email, pw, pwc, agree].forEach(el => el && el.addEventListener('input', updateSubmitState));
  form.addEventListener('submit', function(e){
    validateEmp();
    validatePassword();
    validateMatch();
    if(!form.checkValidity() || !agree.checked){
      e.preventDefault();
    }
  });
  // initialize state on load
  updateSubmitState();
})();