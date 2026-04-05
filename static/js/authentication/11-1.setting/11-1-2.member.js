// Members page interactions (11-1-2)
// - Profile image picker (DB-backed via /api/me/profile)
// - Motto (message) inline edit (DB-backed)
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    const $ = (s, r=document) => r.querySelector(s);

    const empNo = (document.querySelector('#btn-account')?.getAttribute('data-emp-no') || '').trim();
    const currentName = (document.querySelector('.admin-page .identity .name')?.textContent || '').trim();
  	const LS_IMG_GLOBAL = 'blossom.profileImageSrc';
  	const LS_IMG = empNo ? `blossom.profileImageSrc.${empNo}` : LS_IMG_GLOBAL;

    const avatar = $('.admin-page .avatar');
    const headerIcon = $('#btn-account .header-icon');

    const picker = $('#profile-picker');
    const pickerGrid = picker?.querySelector('.picker-grid');
    const pickerCloseBtn = picker?.querySelector('[data-picker-close]');

    function applyProfileImage(src){
      if (!src) return;
      if (avatar) avatar.style.backgroundImage = `url('${src}')`;
      if (headerIcon) {
        headerIcon.src = src;
        headerIcon.classList.add('header-avatar-icon');
      }
    }

    async function updateMeProfile(payload) {
      const res = await fetch('/api/me/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload || {}),
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.success !== true) {
        const msg = (data && data.message) ? data.message : '저장에 실패했습니다.';
        throw new Error(msg);
      }
      return data.item || {};
    }

    function getMyMemberCardAvatars(){
      const imgs = Array.from(document.querySelectorAll('.members-grid .member-avatar'));
      if (!imgs.length) return [];

      const byEmp = empNo
        ? imgs.filter(img => (img.getAttribute('data-emp-no') || '').trim() === empNo)
        : [];
      if (byEmp.length) return byEmp;

      // Fallback: match by displayed name (handles environments where emp_no differs or is hidden)
      if (currentName) {
        const byName = imgs.filter(img => {
          const card = img.closest('.member-card');
          const nameEl = card?.querySelector('.member-name');
          return (nameEl?.textContent || '').trim() === currentName;
        });
        if (byName.length) return byName;
      }

      return [];
    }

    function applyMemberCardAvatar(src){
      if (!src) return;
      getMyMemberCardAvatars().forEach(img => { img.src = src; });
    }

    // ---- Avatar picker ----
    const names = [
      '001-boy','002-girl','003-boy','004-girl','005-man','006-girl','007-boy','008-girl','009-boy','010-girl',
      '011-man','012-girl','013-man','014-girl','015-boy','016-girl','017-boy','018-girl','019-boy','020-girl'
    ];
    const profileImages = names.map(n => `/static/image/svg/profil/${n}.svg`);

    function openPicker(){
      if (!picker || !pickerGrid) return;
      if (!pickerGrid.hasChildNodes()){
        profileImages.forEach(src => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'picker-item';
          item.setAttribute('role', 'listitem');
          const img = document.createElement('img');
          img.src = src;
          img.alt = '프로필 이미지';
          item.appendChild(img);

          item.addEventListener('click', async () => {
            applyProfileImage(src);
            try {
              try {
                localStorage.setItem(LS_IMG_GLOBAL, src);
                if (empNo) localStorage.setItem(LS_IMG, src);
              } catch {}
              await updateMeProfile({ profile_image: src });
              window.dispatchEvent(new CustomEvent('blossom:avatarChanged', { detail: { src, empNo } }));
              applyMemberCardAvatar(src);
            } catch (err) {
              alert(err?.message || '이미지 저장에 실패했습니다.');
            }
            closePicker();
          });

          pickerGrid.appendChild(item);
        });
      }

      picker.classList.add('open');
      picker.setAttribute('aria-hidden', 'false');
      picker.querySelector('[data-picker-close]')?.focus();
    }

    function closePicker(){
      picker?.classList.remove('open');
      picker?.setAttribute('aria-hidden', 'true');
    }

    avatar?.addEventListener('click', openPicker);
    avatar?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPicker();
      }
    });
    pickerCloseBtn?.addEventListener('click', closePicker);
    picker?.addEventListener('click', (e) => {
      if (e.target && e.target.hasAttribute('data-picker-close')) closePicker();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && picker?.classList.contains('open')) closePicker();
    });

    // ---- Motto inline edit ----
    const bioOpenBtn = document.getElementById('btn-edit-bio');
    const bioP = document.querySelector('.admin-page .bio');
    const bioRow = document.querySelector('.admin-page .bio-row');
    const MAX_BIO_CHARS = 80;
    let bioEditorState = null;

    function createBioEditor(initialText){
      const wrap = document.createElement('div');
      wrap.className = 'bio-inline-editor';
      const input = document.createElement('input');
      input.type = 'text';
      let init = (initialText || '').replace(/\r?\n+/g, ' ').trim();
      if (init.length > MAX_BIO_CHARS) init = init.slice(0, MAX_BIO_CHARS);
      input.value = init;
      input.setAttribute('aria-label', '메시지 입력');
      input.setAttribute('maxlength', String(MAX_BIO_CHARS));
      input.className = 'bio-input';
      function syncSize(){ input.size = Math.max(10, (input.value || '').length); }
      syncSize();
      input.addEventListener('input', () => {
        if (input.value.length > MAX_BIO_CHARS) input.value = input.value.slice(0, MAX_BIO_CHARS);
        syncSize();
      });
      wrap.appendChild(input);
      return { wrap, input };
    }

    function restoreBioEditBtn(){
      if (!bioOpenBtn) return;
      const icon = bioOpenBtn.querySelector('img');
      if (icon) {
        icon.src = '/static/image/svg/admin/free-icon-pen-square.svg';
        icon.alt = '메시지 수정';
      }
      bioOpenBtn.title = '메시지 수정';
      bioOpenBtn.setAttribute('aria-label', '메시지 수정');
      delete bioOpenBtn.dataset.mode;
      document.getElementById('btn-cancel-bio')?.remove();
    }

    function openInlineBioEditor(){
      if (!bioRow || !bioP || !bioOpenBtn) return;
      if (bioRow.querySelector('.bio-inline-editor')) return;

      const { wrap, input } = createBioEditor(bioP.textContent?.trim() || '');
      bioP.style.display = 'none';
      bioRow.insertBefore(wrap, bioOpenBtn);
      setTimeout(() => input.focus(), 0);

      const icon = bioOpenBtn.querySelector('img');
      if (icon) { icon.src = '/static/image/svg/save.svg'; icon.alt = '저장'; }
      bioOpenBtn.title = '저장';
      bioOpenBtn.setAttribute('aria-label', '저장');
      bioOpenBtn.dataset.mode = 'save';

      let cancelBtn = document.getElementById('btn-cancel-bio');
      if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.id = 'btn-cancel-bio';
        cancelBtn.type = 'button';
        cancelBtn.className = 'cancel-inline-btn';
        cancelBtn.title = '취소';
        cancelBtn.setAttribute('aria-label', '취소');
        const img = document.createElement('img');
        img.src = '/static/image/svg/admin/free-icon-undo.svg';
        img.alt = '취소';
        img.className = 'cancel-icon';
        cancelBtn.appendChild(img);
        bioRow.appendChild(cancelBtn);
      }

      async function applySave(){
        let oneLine = (input.value || '').replace(/\r?\n+/g, ' ').trim();
        if (oneLine.length > MAX_BIO_CHARS) oneLine = oneLine.slice(0, MAX_BIO_CHARS);
        bioOpenBtn.setAttribute('disabled', 'disabled');
        try {
          await updateMeProfile({ motto: oneLine });
          bioP.textContent = oneLine;
          bioP.style.display = '';
          wrap.remove();
          restoreBioEditBtn();
          bioOpenBtn.focus();
          bioEditorState = null;
        } catch (err) {
          alert(err?.message || '저장에 실패했습니다.');
        } finally {
          bioOpenBtn.removeAttribute('disabled');
        }
      }

      function applyCancel(){
        bioP.style.display = '';
        wrap.remove();
        restoreBioEditBtn();
        bioOpenBtn.focus();
        bioEditorState = null;
      }

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') applyCancel();
        else if (e.key === 'Enter') { e.preventDefault(); applySave(); }
      });
      cancelBtn.addEventListener('click', applyCancel);
      bioEditorState = { applySave, applyCancel };
    }

    bioOpenBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (bioOpenBtn.dataset.mode === 'save' && bioEditorState?.applySave) bioEditorState.applySave();
      else openInlineBioEditor();
    });

    // If another page/tab triggers avatarChanged while we're open, keep member card in sync too.
    window.addEventListener('blossom:avatarChanged', (e) => {
      const src = e.detail?.src;
      if (src) applyMemberCardAvatar(src);
    });
  });
})();
