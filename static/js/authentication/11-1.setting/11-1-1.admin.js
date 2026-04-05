// Admin page interactivity: tabs + edit profile modal
document.addEventListener('DOMContentLoaded', function () {
	const $ = (sel, root = document) => root.querySelector(sel);
	const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

	// Tabs
	const tabButtons = $$('.tabs .tab');
	const panels = $$('.tab-panel');
	tabButtons.forEach((btn) => {
		btn.addEventListener('click', () => {
			const target = btn.dataset.tabTarget;
			tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
			panels.forEach((p) => p.classList.toggle('active', p.id === `tab-${target}`));
			// a11y
			tabButtons.forEach((b) => b.setAttribute('aria-selected', b === btn ? 'true' : 'false'));
		});
	});

	// Inline profile edit (toggle via icon)
	const editCard = document.querySelector('#tab-overview .card');
	const editBtn = document.getElementById('btn-edit-profile');
	const editBtnIcon = editBtn?.querySelector('.action-icon') || null;
	const viewIconSrc = editBtnIcon?.getAttribute('src') || '/static/image/svg/list/free-icon-pencil.svg';
	const viewIconAlt = editBtnIcon?.getAttribute('alt') || '수정';

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

	function setEditing(on) {
		if (!editCard || !editBtn) return;
		editCard.classList.toggle('editing', !!on);
		const icon = editBtn.querySelector('.action-icon');
		if (on) {
			icon && (icon.src = '/static/image/svg/save.svg', icon.alt = '저장');
			editBtn.title = '저장'; editBtn.setAttribute('aria-label', '저장');
			editBtn.classList.add('editing');
			// Seed inputs with current values
			document.querySelectorAll('#tab-overview .detail-row').forEach((row) => {
				const valEl = row.querySelector('.value');
				const input = row.querySelector('.inline-input');
				if (!valEl || !input) return;
				const textVal = (valEl.textContent || '').trim();
				const normalizedVal = (textVal === '-' ? '' : textVal);
				if (input.tagName === 'SELECT') {
					Array.from(input.options).forEach((opt) => {
						opt.selected = (opt.value === normalizedVal);
					});
				} else {
					input.value = normalizedVal;
				}
			});
			// Sync custom searchable-select UI labels (page-scoped selects).
			try {
				if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') {
					window.BlossomSearchableSelect.syncAll(editCard);
				}
			} catch (_) {}
			// Do not auto-focus inputs.
			// On some Windows/Chromium setups, focus ring/box-shadow can flip text rasterization
			// and make the title look like its spacing changes. Let the user click a field instead.
		} else {
			try {
				if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.close === 'function') {
					window.BlossomSearchableSelect.close();
				}
			} catch (_) {}
			icon && (icon.src = viewIconSrc, icon.alt = viewIconAlt);
			editBtn.title = '수정'; editBtn.setAttribute('aria-label', '수정');
			editBtn.classList.remove('editing');
		}
	}

	async function saveInlineProfile() {
		const payload = {};
		document.querySelectorAll('#tab-overview .detail-row').forEach((row) => {
			const input = row.querySelector('.inline-input');
			if (!input) return;
			const key = row.getAttribute('data-key');
			const v = (input.tagName === 'SELECT') ? input.value : input.value;
			if (!key) return;
			if (key === 'nickname') payload.nickname = v;
			else if (key === 'department') payload.department = v;
			else if (key === 'location') payload.location = v;
			else if (key === 'phone_ext') payload.ext_phone = v;
			else if (key === 'phone_mobile') payload.mobile_phone = v;
			else if (key === 'email') payload.email = v;
			else if (key === 'duty') payload.job = v;
		});

		function pickValue(saved, apiKey, fallback) {
			if (saved && Object.prototype.hasOwnProperty.call(saved, apiKey)) {
				return saved[apiKey];
			}
			return fallback;
		}

		editBtn?.setAttribute('disabled', 'disabled');
		try {
			const saved = await updateMeProfile(payload);
			// Reflect saved values back into the read-only .value elements
			document.querySelectorAll('#tab-overview .detail-row').forEach((row) => {
				const valEl = row.querySelector('.value');
				if (!valEl) return;
				const key = row.getAttribute('data-key');
				const currentText = (valEl.textContent || '').trim();
				let next = currentText;
				if (key === 'full_name') return;
				else if (key === 'nickname') next = pickValue(saved, 'nickname', payload.nickname ?? currentText);
				else if (key === 'department') next = pickValue(saved, 'department', payload.department ?? currentText);
				else if (key === 'location') next = pickValue(saved, 'location', payload.location ?? currentText);
				else if (key === 'phone_ext') next = pickValue(saved, 'ext_phone', payload.ext_phone ?? currentText);
				else if (key === 'phone_mobile') next = pickValue(saved, 'mobile_phone', payload.mobile_phone ?? currentText);
				else if (key === 'email') next = pickValue(saved, 'email', payload.email ?? currentText);
				else if (key === 'duty') next = pickValue(saved, 'job', payload.job ?? currentText);
				else return;

				if (valEl.tagName === 'A') {
					const a = valEl;
					if (a.dataset.field === 'email') a.href = `mailto:${(next || '').trim()}`;
					a.textContent = next;
				} else {
					valEl.textContent = next;
				}
			});
			// Update visible header location block if present
			const metaEl = document.querySelector('.admin-page .identity .meta');
			if (metaEl) {
				const nextLoc = pickValue(saved, 'location', payload.location);
				if (typeof nextLoc === 'string' && nextLoc.trim()) metaEl.textContent = nextLoc;
			}
			setEditing(false);
		} catch (err) {
			alert(err?.message || '저장에 실패했습니다.');
		} finally {
			editBtn?.removeAttribute('disabled');
		}
	}

	editBtn?.addEventListener('click', () => {
		if (!editCard) return;
		if (!editCard.classList.contains('editing')) {
			setEditing(true);
		} else {
			saveInlineProfile();
		}
	});

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && editCard?.classList.contains('editing')) {
			setEditing(false);
		}
	});

		// Profile image picker
			const avatar = document.querySelector('.admin-page .avatar');
			const accountIcon = document.querySelector('#btn-account .header-avatar-icon, #btn-account img');
		const picker = document.getElementById('profile-picker');
			const pickerClose = picker?.querySelector('[data-picker-close]');
		const pickerGrid = picker?.querySelector('.picker-grid');

		const profileImages = Array.from({ length: 20 }, (_, i) => {
			const n = String(i + 1).padStart(3, '0');
			// Alternate sample names we saw in directory: odd -> boy/man, even -> girl
			const names = [
				'001-boy','002-girl','003-boy','004-girl','005-man','006-girl','007-boy','008-girl','009-boy','010-girl',
				'011-man','012-girl','013-man','014-girl','015-boy','016-girl','017-boy','018-girl','019-boy','020-girl'
			];
			return `/static/image/svg/profil/${names[i]}.svg`;
		});

			const empNo = (document.querySelector('#btn-account')?.getAttribute('data-emp-no') || '').trim();
			const LS_KEY_GLOBAL = 'blossom.profileImageSrc';
			const LS_KEY = empNo ? `blossom.profileImageSrc.${empNo}` : LS_KEY_GLOBAL;

			function applyProfileImage(src) {
				if (avatar) {
					avatar.style.backgroundImage = `url('${src}')`;
				}
				if (accountIcon) {
					accountIcon.src = src;
					accountIcon.classList.add('header-avatar-icon');
				}
			}

			function openPicker() {
			if (!picker || !pickerGrid) return;
			if (!pickerGrid.hasChildNodes()) {
				profileImages.forEach((src) => {
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
								localStorage.setItem(LS_KEY_GLOBAL, src);
								if (empNo) localStorage.setItem(LS_KEY, src);
							} catch {}
						try {
							await updateMeProfile({ profile_image: src });
							// Let blossom.js sync per-emp_no storage + header in other pages
							window.dispatchEvent(new CustomEvent('blossom:avatarChanged', { detail: { src } }));
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
			// basic focus management
			const closeBtn = picker.querySelector('[data-picker-close]');
			closeBtn && closeBtn.focus();
		}

		function closePicker() {
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
			// Close on any close button or backdrop
			pickerClose?.addEventListener('click', closePicker);
			picker?.addEventListener('click', (e) => {
				if (e.target && e.target.hasAttribute('data-picker-close')) {
					closePicker();
				}
			});

			// On load: restore saved profile image (per-emp-no first, then global)
			try {
				const saved = localStorage.getItem(LS_KEY) || localStorage.getItem(LS_KEY_GLOBAL);
				if (saved) applyProfileImage(saved);
			} catch {}

				// Bio (message) inline editor
				const bioOpenBtn = document.getElementById('btn-edit-bio');
				const bioP = document.querySelector('.admin-page .bio');
				const bioRow = document.querySelector('.admin-page .bio-row');
				const MAX_BIO_CHARS = 80;
				let bioEditorState = null; // holds current inline editor state when active

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
					// Approximate width to content length
					function syncSize() { input.size = Math.max(10, (input.value || '').length); }
					syncSize();
					input.addEventListener('input', () => {
						if (input.value.length > MAX_BIO_CHARS) input.value = input.value.slice(0, MAX_BIO_CHARS);
						syncSize();
					});
					wrap.append(input);

					return { wrap, input };
				}

				function openInlineEditor() {
					if (!bioRow || !bioP) return;
					const existing = bioRow.querySelector('.bio-inline-editor');
					if (existing) {
						const t = existing.querySelector('input, textarea');
						t && t.focus();
						return;
					}
					const { wrap, input } = createBioEditor(bioP.textContent?.trim() || '');
					bioP.style.display = 'none';
					bioRow.insertBefore(wrap, bioOpenBtn || null);
					setTimeout(() => input.focus(), 0);

					// Switch edit button to save state
					const editIcon = bioOpenBtn?.querySelector('img');
					if (editIcon) {
						editIcon.src = '/static/image/svg/save.svg';
						editIcon.alt = '저장';
						bioOpenBtn.title = '저장';
						bioOpenBtn.setAttribute('aria-label', '저장');
					}
					bioOpenBtn.dataset.mode = 'save';

					// Create cancel icon button next to it if missing
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

					function restoreEditBtn() {
						const icon = bioOpenBtn?.querySelector('img');
						if (icon) {
							icon.src = '/static/image/svg/admin/free-icon-pen-square.svg';
							icon.alt = '메시지 수정';
							bioOpenBtn.title = '메시지 수정';
							bioOpenBtn.setAttribute('aria-label', '메시지 수정');
						}
						delete bioOpenBtn.dataset.mode;
						cancelBtn?.remove();
					}

					async function applySave() {
						if (!bioP) return;
						let oneLine = (input.value || '').replace(/\r?\n+/g, ' ').trim();
						if (oneLine.length > MAX_BIO_CHARS) oneLine = oneLine.slice(0, MAX_BIO_CHARS);
						bioOpenBtn?.setAttribute('disabled', 'disabled');
						try {
							await updateMeProfile({ motto: oneLine });
							bioP.textContent = oneLine;
							bioP.style.display = '';
							wrap.remove();
							restoreEditBtn();
							bioOpenBtn?.focus();
							bioEditorState = null;
						} catch (err) {
							alert(err?.message || '저장에 실패했습니다.');
						} finally {
							bioOpenBtn?.removeAttribute('disabled');
						}
					}
					function applyCancel() {
						bioP && (bioP.style.display = '');
						wrap.remove();
						restoreEditBtn();
						bioOpenBtn?.focus();
						bioEditorState = null;
					}

					input.addEventListener('keydown', (e) => {
						if (e.key === 'Escape') {
							applyCancel();
						} else if (e.key === 'Enter') {
							e.preventDefault();
							applySave();
						}
					});
					cancelBtn.addEventListener('click', applyCancel);

					bioEditorState = { applySave, applyCancel };
				}

				bioOpenBtn?.addEventListener('click', (e) => {
					e.preventDefault();
					if (bioOpenBtn.dataset.mode === 'save' && bioEditorState?.applySave) {
						bioEditorState.applySave();
					} else {
						openInlineEditor();
					}
				});

				// NOTE: motto is server-backed; do not override from localStorage
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && picker?.classList.contains('open')) closePicker();
		});
});
