// Password page (11-1-4): inline validation + save button wiring
(function(){
	document.addEventListener('DOMContentLoaded', function(){
		const $ = (s, r=document) => r.querySelector(s);
		const current = $('input[name="current_password"]');
		const next = $('input[name="new_password"]');
		const confirm = $('input[name="confirm_password"]');
		const saveBtn = $('#btn-save-password');
		const toggleCurrent = $('#toggle-current');
		const toggleNew = $('#toggle-new');
		const toggleConfirm = $('#toggle-confirm');

			// Sync avatar and bio from profile page
			const empNo = (document.querySelector('#btn-account')?.getAttribute('data-emp-no') || '').trim();
			const LS_IMG = empNo ? `blossom.profileImageSrc.${empNo}` : 'blossom.profileImageSrc';
		const avatar = $('.admin-page .avatar');
		const headerIcon = $('#btn-account .header-icon');
		const picker = $('#profile-picker');
		const pickerGrid = picker?.querySelector('.picker-grid');
		const pickerCloseBtn = picker?.querySelector('[data-picker-close]');

		function applyProfileImage(src){
			if (!src) return;
			if (avatar) avatar.style.backgroundImage = `url('${src}')`;
			if (headerIcon){
				headerIcon.src = src;
				headerIcon.classList.add('header-avatar-icon');
			}
		}

			try {
				const savedImg = localStorage.getItem(LS_IMG) || localStorage.getItem('blossom.profileImageSrc');
				if (savedImg) applyProfileImage(savedImg);
			} catch {}
			// NOTE: motto(message) is server-backed; do not override from localStorage.

			// Avatar picker wiring (same as member page)
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
						item.setAttribute('role','listitem');
						const img = document.createElement('img');
						img.src = src; img.alt = '프로필 이미지';
						item.appendChild(img);
						item.addEventListener('click', async () => {
							applyProfileImage(src);
							try { if (empNo) localStorage.setItem(LS_IMG, src); } catch {}
							try { localStorage.setItem('blossom.profileImageSrc', src); } catch {}
							try {
								await updateMeProfile({ profile_image: src });
								window.dispatchEvent(new CustomEvent('blossom:avatarChanged', { detail: { src, empNo } }));
							} catch (err) {
								openResultModal(err?.message || '이미지 저장에 실패했습니다.', 'error');
							}
							closePicker();
						});
						pickerGrid.appendChild(item);
					});
				}
				picker.classList.add('open');
				picker.setAttribute('aria-hidden','false');
				picker.querySelector('[data-picker-close]')?.focus();
			}
			function closePicker(){ picker?.classList.remove('open'); picker?.setAttribute('aria-hidden','true'); }
			avatar?.addEventListener('click', openPicker);
			avatar?.addEventListener('keydown', (e)=>{ if (e.key==='Enter'||e.key===' '){ e.preventDefault(); openPicker(); } });
			pickerCloseBtn?.addEventListener('click', closePicker);
			picker?.addEventListener('click', (e)=>{ if (e.target && e.target.hasAttribute('data-picker-close')) closePicker(); });
			document.addEventListener('keydown', (e)=>{ if (e.key==='Escape' && picker?.classList.contains('open')) closePicker(); });

			// Bio editing is handled on /settings/profile only.
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

			const bioOpenBtn = document.getElementById('btn-edit-bio');
			const bioP = document.querySelector('.admin-page .bio');
			const bioRow = document.querySelector('.admin-page .bio-row');
			const MAX_BIO_CHARS = 80;
			let bioEditorState = null;

			function createBioEditor(initialText) {
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
				wrap.append(input);
				return { wrap, input };
			}

			function restoreBioEditBtn() {
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

			function openInlineBioEditor() {
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

				async function applySave() {
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
						openResultModal(err?.message || '저장에 실패했습니다.', 'error');
					} finally {
						bioOpenBtn.removeAttribute('disabled');
					}
				}
				function applyCancel() {
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

		function classifySets(pw){
			let sets = 0;
			if (/[a-z]/.test(pw)) sets++;
			if (/[A-Z]/.test(pw)) sets++;
			if (/[0-9]/.test(pw)) sets++;
			if (/[^\w\s]/.test(pw)) sets++; // special
			return sets;
		}

		function validate(){
			const pw = next?.value || '';
			const cf = confirm?.value || '';
			const sets = classifySets(pw);
			const okLen = (sets >= 2 && pw.length >= 10) || (sets >= 3 && pw.length >= 8);
			const match = pw.length > 0 && pw === cf;
			return { okLen, match };
		}

		function showToast(msg, type){
			// Disabled: suppress all toast popups.
			return;
		}

			const resultModal = document.getElementById('password-result-modal');
		const resultTitle = document.getElementById('password-result-title');
		const resultMessage = document.getElementById('password-result-message');
		const resultIllustration = document.getElementById('password-result-illustration');
		const modalCloseEls = resultModal ? resultModal.querySelectorAll('[data-modal-close]') : [];
		let lastFocusedEl = null;

		function openResultModal(msg, variant){
			if (!resultModal || !resultMessage) {
				showToast(msg, variant === 'success' ? 'success' : 'error');
				return;
			}
			lastFocusedEl = document.activeElement;
			const isSuccess = variant === 'success';
				if (resultTitle) resultTitle.textContent = isSuccess ? '완료' : '알림';
			resultMessage.textContent = msg;
			if (resultIllustration) {
					resultIllustration.src = isSuccess
						? '/static/image/svg/free-sticker-approved.svg'
						: '/static/image/svg/free-sticker-message.svg';
				resultIllustration.alt = isSuccess ? '완료' : '알림';
			}
				document.body.classList.add('modal-open');
				resultModal.classList.add('show');
			resultModal.setAttribute('aria-hidden','false');
			resultModal.querySelector('[data-modal-close]')?.focus();
		}
		function closeResultModal(){
			if (!resultModal) return;
				resultModal.classList.remove('show');
			resultModal.setAttribute('aria-hidden','true');
				if (!document.querySelector('.modal-overlay-base.show, .server-add-modal.show, .server-edit-modal.show, .server-column-modal.show')){
					document.body.classList.remove('modal-open');
				}
			try { lastFocusedEl?.focus?.(); } catch {}
		}

		if (resultModal){
			modalCloseEls.forEach(el => el.addEventListener('click', closeResultModal));
			document.addEventListener('keydown', (e)=>{
					if (e.key === 'Escape' && resultModal.classList.contains('show')) closeResultModal();
			});
		}

		saveBtn?.addEventListener('click', function(){
			if (!current || !next || !confirm) return;
			const { okLen, match } = validate();
			if (!okLen){
				openResultModal('비밀번호 조건을 확인하세요.', 'error');
				next.focus();
				return;
			}
			if (!match){
				openResultModal('새 비밀번호가 일치하지 않습니다.', 'error');
				confirm.focus();
				return;
			}
			if (saveBtn.disabled) return;
			saveBtn.disabled = true;
			fetch('/settings/password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					current_password: current.value,
					new_password: next.value,
					confirm_password: confirm.value
				})
			})
			.then(async (res) => {
				let data = null;
				let text = '';
				try {
					data = await res.json();
				} catch {
					try { text = await res.text(); } catch {}
				}
				if (!res.ok){
					const msgFromJson = data && (data.message || data.error);
					const msgFromText = (text || '').replace(/\s+/g,' ').trim().slice(0, 160);
					const msg = msgFromJson || msgFromText || `비밀번호 변경에 실패했습니다. (HTTP ${res.status})`;
					throw new Error(msg);
				}
				current.value = '';
				next.value = '';
				confirm.value = '';
				openResultModal('비밀번호가 변경되었습니다.', 'success');
			})
			.catch((err) => {
				openResultModal(err?.message || '비밀번호 변경에 실패했습니다.', 'error');
			})
			.finally(() => {
				saveBtn.disabled = false;
			});
		});

		// Enter to submit from confirm field
		confirm?.addEventListener('keydown', (e)=>{
			if (e.key === 'Enter') saveBtn?.click();
		});

			function bindToggle(btn, input){
				if (!btn || !input) return;
				btn.addEventListener('click', () => {
					const showing = input.type === 'text';
					input.type = showing ? 'password' : 'text';
					btn.title = showing ? '비밀번호 보기' : '비밀번호 숨기기';
					btn.setAttribute('aria-label', btn.title);
					input.focus();
				});
			}
			bindToggle(toggleCurrent, current);
			bindToggle(toggleNew, next);
			bindToggle(toggleConfirm, confirm);
	});
})();
