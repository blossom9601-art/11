document.addEventListener('DOMContentLoaded', () => {
	const STORAGE_POSTS_KEY = 'blossom:insight_blog_it:posts:v1';
	const MAX_POSTS = 50;
	const API_BASE = '/api/insight/blog/posts';
	const API_TOP_TAGS = '/api/insight/blog/tags/top';
	const PAGE_SIZE = 8;
	const INSIGHT_RANDOM_IMAGES = [
		'/static/image/insight/image1.jpg',
		'/static/image/insight/image2.png',
		'/static/image/insight/image3.jpg',
		'/static/image/insight/image4.jpg',
		'/static/image/insight/image5.png',
		'/static/image/insight/image6.png',
		'/static/image/insight/image7.png',
		'/static/image/insight/image8.jpg',
	];

	const gridEl = document.getElementById('blog-grid');
	const emptyEl = document.getElementById('blog-empty');
	const searchEl = document.getElementById('blog-search');
	const tagsEl = document.getElementById('blog-top-tags');
	const sentinelEl = document.getElementById('blog-scroll-sentinel');

	const addOpenBtn = document.getElementById('blog-add-open');
	const addModal = document.getElementById('blog-add-modal');
	const addCloseBtn = document.getElementById('blog-add-close');
	const addCancelBtn = document.getElementById('blog-add-cancel');
	const addSubmitBtn = document.getElementById('blog-add-submit');

	const addMainImageEl = document.getElementById('blog-add-main-image');
	const addTitleEl = document.getElementById('blog-add-title-input');
	const addEditorEl = document.getElementById('blog-add-editor');
	const addTagsEl = document.getElementById('blog-add-tags');
	const addAttachmentsEl = document.getElementById('blog-add-attachments');
	const mainDropEl = document.getElementById('blog-main-drop');
	const mainPreviewEl = document.getElementById('blog-main-preview');
	const mainEmptyEl = document.getElementById('blog-main-empty');
	const mainRemoveEl = document.getElementById('blog-main-remove');
	const attachDropEl = document.getElementById('blog-attach-drop');
	const attachListEl = document.getElementById('blog-attach-list');
	const editAttachmentsWrapEl = document.getElementById('blog-edit-attachments');
	const editAttachmentsListEl = document.getElementById('blog-edit-attachments-list');

	const toolbarEl = document.getElementById('blog-editor-toolbar');
	const editorImageInputEl = document.getElementById('blog-editor-image-input');
	const fontSelectEl = document.getElementById('blog-editor-font');
	const sizeSelectEl = document.getElementById('blog-editor-size');
	const colorEl = document.getElementById('blog-editor-color');
	const highlightEl = document.getElementById('blog-editor-highlight');
	const trackingEl = document.getElementById('blog-editor-tracking');

	// UI text tweaks (no HTML edits)
	if (addTagsEl) addTagsEl.placeholder = '예시: #AI, #보안';

	// Swap upload icon to Lottie JSON (no HTML edits)
	let attachUploadLottieInitDone = false;
	let attachUploadLottieLoading = false;
	const ensureLottieScript = () => new Promise((resolve) => {
		if (typeof window.lottie !== 'undefined') return resolve(true);
		if (attachUploadLottieLoading) return resolve(false);
		attachUploadLottieLoading = true;
		const s = document.createElement('script');
		s.src = '/static/vendor/lottie/lottie.min.5.12.2.js';
		s.async = true;
		s.onload = () => {
			attachUploadLottieLoading = false;
			resolve(typeof window.lottie !== 'undefined');
		};
		s.onerror = () => {
			attachUploadLottieLoading = false;
			resolve(false);
		};
		document.head.appendChild(s);
		return null;
	});

	const ensureAttachUploadLottie = () => {
		if (!attachDropEl) return;
		const iconEl = attachDropEl.querySelector('.blog-dropzone-icon');
		if (!iconEl) return;
		// Avoid double-initializing
		if (iconEl.dataset && iconEl.dataset.lottieBound === '1') return;
		if (attachUploadLottieInitDone) return;

		// Ensure lottie exists (load local vendor script if needed)
		if (typeof window.lottie === 'undefined') {
			ensureLottieScript().then((ok) => {
				if (!ok) return;
				setTimeout(ensureAttachUploadLottie, 0);
			});
			return;
		}

		let container = iconEl;
		if (iconEl.tagName && iconEl.tagName.toLowerCase() === 'img') {
			const cs = window.getComputedStyle(iconEl);
			const w = (cs && cs.width) ? cs.width : '34px';
			const h = (cs && cs.height) ? cs.height : '34px';
			const span = document.createElement('span');
			span.className = iconEl.className;
			span.setAttribute('aria-hidden', 'true');
			span.dataset.lottieBound = '1';
			// preserve layout
			span.style.display = 'inline-block';
			span.style.width = w;
			span.style.height = h;
			iconEl.replaceWith(span);
			container = span;
		} else {
			container.dataset.lottieBound = '1';
		}

		try {
			window.lottie.loadAnimation({
				container,
				renderer: 'svg',
				loop: true,
				autoplay: true,
				path: '/static/image/svg/free-animated-icon-upload.json',
			});
			attachUploadLottieInitDone = true;
		} catch (e) {
			console.warn(e);
		}
	};

	const safeJsonParse = (text, fallback) => {
		try {
			return JSON.parse(text);
		} catch {
			return fallback;
		}
	};

	const loadPosts = () => {
		const raw = window.localStorage.getItem(STORAGE_POSTS_KEY);
		const parsed = raw ? safeJsonParse(raw, []) : [];
		return Array.isArray(parsed) ? parsed : [];
	};

	const savePosts = (posts) => {
		const trimmed = Array.isArray(posts) ? posts.slice(0, MAX_POSTS) : [];
		window.localStorage.setItem(STORAGE_POSTS_KEY, JSON.stringify(trimmed));
	};

	const fetchJson = async (url, options) => {
		const resp = await fetch(url, {
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
			...options,
		});
		let data = null;
		try {
			data = await resp.json();
		} catch {
			data = null;
		}
		return { ok: resp.ok, status: resp.status, data };
	};

	const fetchMultipart = async (url, formData, opts) => {
		const resp = await fetch(url, {
			credentials: 'same-origin',
			method: opts?.method || 'POST',
			body: formData,
		});
		let data = null;
		try {
			data = await resp.json();
		} catch {
			data = null;
		}
		return { ok: resp.ok, status: resp.status, data };
	};

	const uploadBlogAttachments = async (postId, files, opts) => {
		const pid = String(postId || '').trim();
		const list = Array.from(files || []).filter(Boolean).slice(0, 10);
		if (!pid || list.length === 0) return { ok: true, status: 200, data: { success: true } };
		const fd = new FormData();
		for (const f of list) fd.append('attachments', f, f.name);
		const replace = opts?.replace ? '1' : '0';
		return await fetchMultipart(`${API_BASE}/${encodeURIComponent(pid)}/attachments?replace=${replace}`, fd, { method: 'POST' });
	};

	const readImageAsDataUrl = (file) => new Promise((resolve, reject) => {
		if (!file) return resolve('');
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ''));
		reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
		reader.readAsDataURL(file);
	});

	const pickRandomInsightImage = () => {
		if (!Array.isArray(INSIGHT_RANDOM_IMAGES) || INSIGHT_RANDOM_IMAGES.length === 0) return '';
		const idx = Math.floor(Math.random() * INSIGHT_RANDOM_IMAGES.length);
		return INSIGHT_RANDOM_IMAGES[idx] || '';
	};

	const pickFallbackInsightImage = (seed) => {
		const s = String(seed || '').trim();
		if (!s) return INSIGHT_RANDOM_IMAGES[0] || '';
		let h = 0;
		for (let i = 0; i < s.length; i += 1) {
			h = ((h * 31) + s.charCodeAt(i)) >>> 0;
		}
		const idx = INSIGHT_RANDOM_IMAGES.length ? (h % INSIGHT_RANDOM_IMAGES.length) : 0;
		return INSIGHT_RANDOM_IMAGES[idx] || INSIGHT_RANDOM_IMAGES[0] || '';
	};

	let mainImageFile = null;
	let attachmentFiles = [];
	let attachmentsTouched = false;

	const setDragState = (el, on) => {
		if (!el) return;
		el.classList.toggle('dragover', !!on);
	};

	const renderMainPreview = async () => {
		if (!mainPreviewEl || !mainEmptyEl) return;
		if (!mainImageFile) {
			mainPreviewEl.hidden = true;
			mainEmptyEl.hidden = false;
			if (mainRemoveEl) mainRemoveEl.hidden = true;
			return;
		}
		try {
			mainPreviewEl.src = await readImageAsDataUrl(mainImageFile);
			mainPreviewEl.hidden = false;
			mainEmptyEl.hidden = true;
			if (mainRemoveEl) mainRemoveEl.hidden = false;
		} catch (e) {
			console.warn(e);
		}
	};

	const renderAttachList = () => {
		if (!attachListEl) return;
		attachListEl.innerHTML = '';
		for (let idx = 0; idx < attachmentFiles.length; idx += 1) {
			const f = attachmentFiles[idx];
			const li = document.createElement('li');
			li.innerHTML = `
				<span class="blog-attach-name"></span>
				<button type="button" class="blog-attach-remove" aria-label="첨부 삭제" data-index="${idx}">
					<span aria-hidden="true">×</span>
				</button>
			`;
			const nameEl = li.querySelector('.blog-attach-name');
			if (nameEl) nameEl.textContent = f?.name || '';
			attachListEl.appendChild(li);
		}
		// Existing attachments are shown only when not replacing with new files.
		syncEditExistingAttachmentsVisibility();
	};

	const formatBytes = (n) => {
		const num = Number(n);
		if (!Number.isFinite(num) || num <= 0) return '';
		// Keep UI consistent with insight: show at least 1 KB for non-zero sizes.
		const coerced = num > 0 && num < 1024 ? 1024 : num;
		const units = ['B', 'KB', 'MB', 'GB'];
		let v = coerced;
		let i = 0;
		while (v >= 1024 && i < units.length - 1) {
			v /= 1024;
			i += 1;
		}
		const fixed = i === 0 ? String(Math.floor(v)) : v.toFixed(v >= 10 ? 1 : 2);
		return `${fixed} ${units[i]}`;
	};

	const syncEditExistingAttachmentsVisibility = () => {
		if (!editAttachmentsWrapEl || !editAttachmentsListEl) return;
		const hasExisting = !!(editingIsDb && editingPostId && Array.isArray(editingExistingAttachments) && editingExistingAttachments.length > 0);
		const replacingWithNew = Array.isArray(attachmentFiles) && attachmentFiles.length > 0;
		editAttachmentsWrapEl.hidden = !(hasExisting && !replacingWithNew);
		if (!hasExisting) editAttachmentsListEl.innerHTML = '';
	};

	const renderEditExistingAttachments = () => {
		if (!editAttachmentsWrapEl || !editAttachmentsListEl) return;
		editAttachmentsListEl.innerHTML = '';
		if (!editingIsDb || !editingPostId) {
			syncEditExistingAttachmentsVisibility();
			return;
		}
		const items = Array.isArray(editingExistingAttachments) ? editingExistingAttachments : [];
		for (const a of items) {
			const li = document.createElement('li');
			const name = a?.original_name || a?.name || '첨부파일';
			const url = String(a?.download_url || '').trim();
			const stored = String(a?.stored_name || '').trim();
			const sizeText = formatBytes(a?.size);

			if (url) {
				const link = document.createElement('a');
				link.className = 'blog-post-attachment-link';
				link.href = url;
				link.setAttribute('download', '');
				link.setAttribute('rel', 'noopener');
				link.setAttribute('aria-label', `첨부파일 다운로드: ${String(name)}`);

				const nameEl = document.createElement('span');
				nameEl.className = 'blog-post-attachment-name';
				nameEl.textContent = String(name);

				const metaEl = document.createElement('span');
				metaEl.className = 'blog-post-attachment-meta';
				metaEl.textContent = sizeText ? `${sizeText} · 다운로드` : '다운로드';

				link.appendChild(nameEl);
				link.appendChild(metaEl);
				li.appendChild(link);
			} else {
				const row = document.createElement('div');
				row.className = 'blog-post-attachment-link';
				const nameEl = document.createElement('span');
				nameEl.className = 'blog-post-attachment-name';
				nameEl.textContent = String(name);
				const metaEl = document.createElement('span');
				metaEl.className = 'blog-post-attachment-meta';
				metaEl.textContent = sizeText ? `${sizeText} · 다운로드 불가` : '다운로드 불가';
				row.appendChild(nameEl);
				row.appendChild(metaEl);
				li.appendChild(row);
			}

			if (stored) {
				const delBtn = document.createElement('button');
				delBtn.type = 'button';
				delBtn.className = 'blog-post-attachment-delete';
				delBtn.setAttribute('aria-label', `첨부파일 삭제: ${String(name)}`);
				delBtn.dataset.storedName = stored;
				delBtn.textContent = '삭제';
				li.appendChild(delBtn);
			}

			editAttachmentsListEl.appendChild(li);
		}
		syncEditExistingAttachmentsVisibility();
	};

	const deleteBlogExistingAttachment = async (postId, storedName) => {
		const pid = String(postId || '').trim();
		const stored = String(storedName || '').trim();
		if (!pid || !stored) return { ok: false, status: 400, data: null };
		return await fetchJson(`${API_BASE}/${encodeURIComponent(pid)}/attachments/${encodeURIComponent(stored)}`, { method: 'DELETE' });
	};

	const setAttachments = (files) => {
		const list = Array.from(files || []).slice(0, 10);
		attachmentFiles = list;
		attachmentsTouched = true;
		renderAttachList();
	};

	const formatDate = (isoText) => {
		const d = isoText ? new Date(isoText) : new Date();
		if (Number.isNaN(d.getTime())) return '';
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		return `${yyyy}-${mm}-${dd}`;
	};

	const buildDetailUrl = (postId) => {
		const base = gridEl?.dataset?.detailUrl || '';
		if (!base) return '#';
		const sep = base.includes('?') ? '&' : '?';
		return `${base}${sep}post=${encodeURIComponent(postId)}`;
	};

	const escapeText = (value) => {
		const div = document.createElement('div');
		div.textContent = String(value ?? '');
		return div.innerHTML;
	};

	const stripHtmlToText = (html) => {
		const div = document.createElement('div');
		div.innerHTML = String(html || '');
		return (div.textContent || '').replace(/\s+/g, ' ').trim();
	};

	const parseTagsInput = (rawText) => {
		const raw = String(rawText || '').trim();
		if (!raw) return '';
		// Treat both '#' and ',' as delimiters. Examples:
		//  - "#보안#AI" -> ["보안","AI"]
		//  - "#보안, #AI" -> ["보안","AI"]
		//  - "보안, AI" -> ["보안","AI"]
		const normalized = raw.replace(/#/g, ',');
		const parts = normalized.split(',');
		const tags = [];
		for (const p of parts) {
			const t = normalizeTagToken(p);
			if (!t) continue;
			if (!tags.includes(t)) tags.push(t);
			if (tags.length >= 10) break;
		}
		return tags.join(',');
	};

	const truncate = (text, maxLen) => {
		const t = String(text || '');
		if (t.length <= maxLen) return t;
		return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
	};

	const normalizeTagToken = (raw) => {
		let t = String(raw || '').trim();
		if (!t) return '';
		if (t.startsWith('#')) t = t.slice(1).trim();
		return t;
	};

	const formatTagsText = (raw) => {
		let tokens = [];
		if (Array.isArray(raw)) {
			tokens = raw;
		} else {
			const s = String(raw || '').trim();
			tokens = s ? s.split(',') : [];
		}
		const cleaned = tokens
			.map((x) => normalizeTagToken(x))
			.filter(Boolean);
		if (cleaned.length === 0) return '';
		return cleaned.map((x) => `#${x}`).join(' ');
	};

	const renderPostCard = (post, opts) => {
		if (!gridEl || !post) return;
		const primaryImageSrc = String(post.imageDataUrl || '').trim();
		const fallbackImageSrc = pickFallbackInsightImage(post.id);
		const imageSrc = primaryImageSrc || fallbackImageSrc || INSIGHT_RANDOM_IMAGES[0] || '';
		const title = post.title || '제목 없음';
		const contentText = truncate(stripHtmlToText(post.contentHtml || post.contentPreview || ''), 90);
		const author = post.author || '나';
		const date = formatDate(post.createdAt);
		const tagsText = formatTagsText(post.tagsList || post.tags || '');
		const likeTotal = Number.isFinite(Number(post.likeTotal))
			? Number(post.likeTotal)
			: (Number.isFinite(Number(post.likeCount)) ? Number(post.likeCount) : 0);
		const commentTotal = Number.isFinite(Number(post.commentTotal))
			? Number(post.commentTotal)
			: (Number.isFinite(Number(post.commentCount)) ? Number(post.commentCount) : 0);
		const likedByMe = !!post.likedByMe;
		const likeClass = likedByMe ? 'is-liked' : '';
		const likeHtml = `
			<span class="blog-action blog-action-static blog-card-like ${likeClass}" aria-label="좋아요" aria-pressed="${likedByMe ? 'true' : 'false'}">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="blog-action-icon" aria-hidden="true" focusable="false">
					<path fill="currentColor" d="M22.773,7.721A4.994,4.994,0,0,0,19,6H15.011l.336-2.041A3.037,3.037,0,0,0,9.626,2.122L8,5.417V21H18.3a5.024,5.024,0,0,0,4.951-4.3l.705-5A4.994,4.994,0,0,0,22.773,7.721Z"/>
					<path fill="currentColor" d="M0,11v5a5.006,5.006,0,0,0,5,5H6V6H5A5.006,5.006,0,0,0,0,11Z"/>
				</svg>
				<span class="blog-action-count">${escapeText(String(Math.max(0, Math.floor(likeTotal))))}</span>
			</span>
		`;
		const commentHtml = `
			<span class="blog-action blog-action-static blog-card-comment" aria-label="멘트">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="blog-action-icon" aria-hidden="true" focusable="false">
					<path fill="currentColor" d="m20,0H4C1.794,0,0,1.794,0,4v12c0,2.206,1.794,4,4,4h2.923l3.748,3.157c.382.339.862.507,1.337.507.468,0,.931-.162,1.293-.484l3.847-3.18h2.852c2.206,0,4-1.794,4-4V4c0-2.206-1.794-4-4-4Zm-2.298,7.712l-5.793,5.707c-.386.387-.896.58-1.407.58s-1.025-.195-1.416-.585l-2.782-2.696c-.397-.385-.407-1.018-.022-1.414.385-.397,1.018-.406,1.414-.022l2.793,2.707,5.809-5.701c.396-.387,1.027-.383,1.414.011.388.393.384,1.026-.01,1.414Z"/>
				</svg>
				<span class="blog-action-count">${escapeText(String(Math.max(0, Math.floor(commentTotal))))}</span>
			</span>
		`;

		const card = document.createElement('a');
		card.className = 'blog-card';
		card.href = buildDetailUrl(post.id);
		card.dataset.postId = String(post.id);
		card.dataset.author = String(author || '');
		card.setAttribute('aria-label', title);
		card.innerHTML = `
			<div class="blog-card-media"><img class="blog-card-img" src="${escapeText(imageSrc)}" data-fallback-src="${escapeText(fallbackImageSrc)}" alt="" loading="lazy"></div>
			<div class="blog-card-body">
				<div class="blog-card-title">${escapeText(title)}</div>
				<div class="blog-card-desc">${escapeText(contentText)}</div>
				${tagsText ? `<div class="blog-card-tags">${escapeText(tagsText)}</div>` : ''}
				<div class="blog-card-meta"><span>${escapeText(date)}</span><span class="blog-card-meta-right">${likeHtml}${commentHtml}</span></div>
			</div>
		`;
		if (opts?.prepend && typeof gridEl.prepend === 'function') {
			gridEl.prepend(card);
		} else {
			gridEl.appendChild(card);
		}
	};

	// Card image fallback for stale/broken stored URLs.
	if (gridEl) {
		gridEl.addEventListener('error', (e) => {
			const img = e.target;
			if (!(img instanceof HTMLImageElement)) return;
			if (!img.classList.contains('blog-card-img')) return;
			if (img.dataset.fallbackApplied === '1') return;
			const fallback = String(img.dataset.fallbackSrc || '').trim();
			if (!fallback) return;
			img.dataset.fallbackApplied = '1';
			img.src = fallback;
		}, true);
	}

	// --- Right-click context menu (보기/삭제) ---
	const ctxMenuEl = document.getElementById('blog-context-menu');
	const ctxViewEl = document.getElementById('blog-context-view');
	const ctxEditEl = document.getElementById('blog-context-edit');
	const ctxDeleteEl = document.getElementById('blog-context-delete');
	let ctxTargetPostId = null;
	let ctxTargetCardEl = null;
	let ctxTargetAuthor = '';

	let editingPostId = null;
	let editingIsDb = false;
	let editingExistingAttachments = null;

	const normalizeRole = (val) => String(val || '').trim().toUpperCase();
	const normalizeTextKey = (val) => String(val || '').trim();

	const currentUserRole = normalizeRole(gridEl?.dataset?.currentUserRole);
	const currentUserName = normalizeTextKey(gridEl?.dataset?.currentUserName);
	const currentEmpNo = normalizeTextKey(gridEl?.dataset?.currentEmpNo);
	const isAdminUser = () => {
		return currentUserRole === 'ADMIN' || currentUserRole === 'ADMINISTRATOR' || currentUserRole === '관리자' || currentUserRole === 'ADMIN';
	};

	const isNumericPostId = (postId) => {
		const s = String(postId || '').trim();
		// Treat only digits as DB-backed IDs (prevents accidental localStorage fallback).
		return /^[0-9]+$/.test(s);
	};

	const apiLikesUrl = (postId) => {
		return `${API_BASE}/${encodeURIComponent(String(postId))}/likes`;
	};

	const setCardLikeUi = (likeEl, likedByMe, total) => {
		if (!likeEl) return;
		const liked = !!likedByMe;
		const t = Number.isFinite(Number(total)) ? Math.max(0, Math.floor(Number(total))) : 0;
		likeEl.classList.toggle('is-liked', liked);
		likeEl.setAttribute('aria-pressed', liked ? 'true' : 'false');
		const countEl = likeEl.querySelector('.blog-action-count');
		if (countEl) countEl.textContent = String(t);
	};

	// Requirement: likes must NOT be toggleable from the list page.
	// The list should only display the current totals/state.

	const canDeletePost = (postId, author) => {
		if (isAdminUser()) return true;
		const a = normalizeTextKey(author);
		if (!a) return false;
		if (a === '나') return true;
		if (currentUserName && a === currentUserName) return true;
		if (currentEmpNo && a === currentEmpNo) return true;
		return false;
	};

	const canEditPost = (postId, author) => {
		// Requirement: edit visible only to the author.
		const a = normalizeTextKey(author);
		if (!a) return false;
		if (a === '나') return true;
		if (currentUserName && a === currentUserName) return true;
		if (currentEmpNo && a === currentEmpNo) return true;
		return false;
	};

	const setEditModeUi = (isEdit) => {
		const titleEl = document.getElementById('blog-add-title');
		if (titleEl) titleEl.textContent = isEdit ? '블로그 글 수정' : '블로그 글 추가';
		const sub = addModal?.querySelector?.('.server-add-subtitle');
		if (sub) sub.textContent = isEdit ? '수정한 내용은 목록과 상세 페이지에 반영됩니다.' : '작성한 글은 목록과 상세 페이지에 표시됩니다.';
		if (addSubmitBtn) addSubmitBtn.textContent = isEdit ? '수정' : '등록';
	};

	const openEditModalForPost = async (postId, author) => {
		if (!postId) return;
		if (!canEditPost(postId, author)) {
			alert('수정 권한이 없습니다.');
			return;
		}
		// Re-query elements at runtime (defensive against any DOM replacement).
		const titleInputEl = document.getElementById('blog-add-title-input');
		const editorBoxEl = document.getElementById('blog-add-editor');
		const tagsInputEl = document.getElementById('blog-add-tags');
		const submitBtnEl = document.getElementById('blog-add-submit');
		const originalTitlePlaceholder = titleInputEl?.getAttribute('placeholder') || '';
		const originalEditorPlaceholder = editorBoxEl?.getAttribute('data-placeholder') || '';
		if (titleInputEl) titleInputEl.setAttribute('placeholder', '불러오는 중...');
		if (editorBoxEl) editorBoxEl.setAttribute('data-placeholder', '불러오는 중...');
		if (submitBtnEl) submitBtnEl.disabled = true;

		editingPostId = String(postId);
		editingIsDb = isNumericPostId(editingPostId);
		editingExistingAttachments = null;

		clearForm({ preserveEditState: true });
		if (editAttachmentsListEl) editAttachmentsListEl.innerHTML = '';
		if (editAttachmentsWrapEl) editAttachmentsWrapEl.hidden = true;
		setEditModeUi(true);
		openModal();

		try {
			if (editingIsDb) {
				const res = await fetchJson(`${API_BASE}/${encodeURIComponent(editingPostId)}`, { method: 'GET' });
				if (!res.ok || !res.data?.success || !res.data?.item) {
					if (res.status === 401) alert('로그인이 필요합니다.');
					else alert(res.data?.message || '게시글 정보를 불러오지 못했습니다.');
					return;
				}
				const item = res.data.item;
				const titleVal = String(item.title || '');
				const htmlVal = String(item.contentHtml || item.content_html || '');
				if (titleInputEl) titleInputEl.value = titleVal;
				if (editorBoxEl) editorBoxEl.innerHTML = htmlVal;
				if (tagsInputEl) {
					const tagsList = Array.isArray(item.tagsList) ? item.tagsList : [];
					tagsInputEl.value = tagsList.map((t) => `#${normalizeTagToken(t)}`).filter(Boolean).join(', ');
				}
				editingExistingAttachments = item.attachments || [];
				attachmentsTouched = false;
				renderAttachList();
				renderEditExistingAttachments();

				// If API gave content but UI is still empty, surface a clear error.
				if ((titleVal || htmlVal) && (!titleInputEl || !editorBoxEl)) {
					alert('편집 UI 초기화에 실패했습니다. (필드 요소를 찾을 수 없음)');
				}
			} else {
				const posts = loadPosts();
				const p = posts.find((x) => String(x?.id) === String(editingPostId));
				if (!p) {
					alert('편집할 게시글을 찾을 수 없습니다.');
					return;
				}
				if (titleInputEl) titleInputEl.value = String(p.title || '');
				if (editorBoxEl) editorBoxEl.innerHTML = String(p.contentHtml || p.content_html || '');
				if (tagsInputEl) {
					tagsInputEl.value = String(p.tags || p.tagsText || '');
				}
				editingExistingAttachments = p.attachments || [];
				attachmentsTouched = false;
				renderAttachList();
				renderEditExistingAttachments();
			}
		} catch (e) {
			console.warn(e);
			alert('게시글 정보를 불러오지 못했습니다.');
		} finally {
			if (titleInputEl) titleInputEl.setAttribute('placeholder', originalTitlePlaceholder || '게시글 제목');
			if (editorBoxEl) editorBoxEl.setAttribute('data-placeholder', originalEditorPlaceholder || '게시글 내용을 입력하세요');
			if (submitBtnEl) submitBtnEl.disabled = false;
		}
	};

	const hideContextMenu = () => {
		if (!ctxMenuEl) return;
		ctxMenuEl.hidden = true;
		ctxMenuEl.style.left = '';
		ctxMenuEl.style.top = '';
		ctxTargetPostId = null;
		ctxTargetCardEl = null;
		ctxTargetAuthor = '';
	};

	const showContextMenu = (x, y) => {
		if (!ctxMenuEl) return;
		ctxMenuEl.hidden = false;
		ctxMenuEl.style.left = `${x}px`;
		ctxMenuEl.style.top = `${y}px`;
		// keep inside viewport
		const rect = ctxMenuEl.getBoundingClientRect();
		let nx = x;
		let ny = y;
		if (rect.right > window.innerWidth) nx = Math.max(8, x - rect.width);
		if (rect.bottom > window.innerHeight) ny = Math.max(8, y - rect.height);
		ctxMenuEl.style.left = `${nx}px`;
		ctxMenuEl.style.top = `${ny}px`;
	};

	const removeLocalPost = (postId) => {
		const posts = loadPosts();
		const next = posts.filter((p) => String(p?.id) !== String(postId));
		savePosts(next);
	};

	const deletePost = async (postId) => {
		if (!postId) return;
		// DB-backed
		if (isNumericPostId(postId)) {
			const res = await fetchJson(`${API_BASE}/${encodeURIComponent(postId)}`, { method: 'DELETE' });
			if (!res.ok || !res.data?.success) return;
			if (ctxTargetCardEl) ctxTargetCardEl.remove();
			syncEmptyState();
			return;
		}
		// localStorage-backed
		removeLocalPost(postId);
		if (ctxTargetCardEl) ctxTargetCardEl.remove();
		syncEmptyState();
	};

	if (gridEl) {
		gridEl.addEventListener('contextmenu', (e) => {
			const card = e.target?.closest?.('.blog-card');
			if (!card) return;
			e.preventDefault();
			ctxTargetCardEl = card;
			ctxTargetPostId = String(card.getAttribute('data-post-id') || card.dataset.postId || '').trim() || null;
			ctxTargetAuthor = card.getAttribute('data-author') || card.dataset.author || '';

			if (ctxEditEl) {
				const allowed = canEditPost(ctxTargetPostId, ctxTargetAuthor);
				ctxEditEl.hidden = !allowed;
			}

			if (ctxDeleteEl) {
				const allowed = canDeletePost(ctxTargetPostId, ctxTargetAuthor);
				ctxDeleteEl.hidden = !allowed;
			}
			showContextMenu(e.clientX, e.clientY);
		});
	}

	if (ctxViewEl) {
		ctxViewEl.addEventListener('click', () => {
			if (!ctxTargetPostId) return;
			blsSpaNavigate(buildDetailUrl(ctxTargetPostId));
		});
	}

	if (ctxEditEl) {
		ctxEditEl.addEventListener('click', async () => {
			if (!ctxTargetPostId) return;
			try {
				await openEditModalForPost(ctxTargetPostId, ctxTargetAuthor);
			} finally {
				hideContextMenu();
			}
		});
	}

	if (ctxDeleteEl) {
		ctxDeleteEl.addEventListener('click', async () => {
			if (!ctxTargetPostId) return;
			try {
				await deletePost(ctxTargetPostId);
			} catch (err) {
				console.warn(err);
			} finally {
				hideContextMenu();
			}
		});
	}

	document.addEventListener('click', (e) => {
		if (!ctxMenuEl || ctxMenuEl.hidden) return;
		if (e.target && ctxMenuEl.contains(e.target)) return;
		hideContextMenu();
	});

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') hideContextMenu();
	});

	window.addEventListener('scroll', () => {
		if (ctxMenuEl && !ctxMenuEl.hidden) hideContextMenu();
	}, true);
	window.addEventListener('resize', () => {
		if (ctxMenuEl && !ctxMenuEl.hidden) hideContextMenu();
	});

	const syncEmptyState = () => {
		if (!gridEl || !emptyEl) return;
		const anyCards = gridEl.querySelectorAll('.blog-card').length > 0;
		emptyEl.hidden = anyCards;
	};

	const clearGrid = () => {
		if (!gridEl) return;
		gridEl.innerHTML = '';
		syncEmptyState();
	};

	const openModal = () => {
		if (!addModal) return;
		addModal.classList.add('show');
		addModal.setAttribute('aria-hidden', 'false');
		document.body.classList.add('modal-open');
		setTimeout(() => addTitleEl?.focus(), 0);
	};

	const closeModal = () => {
		if (!addModal) return;
		addModal.classList.remove('show');
		addModal.setAttribute('aria-hidden', 'true');
		document.body.classList.remove('modal-open');
		setEditModeUi(false);
		editingPostId = null;
		editingIsDb = false;
		editingExistingAttachments = null;
		if (editAttachmentsListEl) editAttachmentsListEl.innerHTML = '';
		if (editAttachmentsWrapEl) editAttachmentsWrapEl.hidden = true;
	};

	const clearForm = (opts) => {
		const preserveEditState = !!opts?.preserveEditState;
		if (addTitleEl) addTitleEl.value = '';
		if (addEditorEl) addEditorEl.innerHTML = '';
		if (addTagsEl) addTagsEl.value = '';
		if (addMainImageEl) addMainImageEl.value = '';
		if (addAttachmentsEl) addAttachmentsEl.value = '';
		mainImageFile = null;
		attachmentFiles = [];
		attachmentsTouched = false;
		renderAttachList();
		if (editAttachmentsListEl) editAttachmentsListEl.innerHTML = '';
		if (editAttachmentsWrapEl) editAttachmentsWrapEl.hidden = true;
		renderMainPreview();
		if (fontSelectEl) fontSelectEl.value = '';
		if (sizeSelectEl) sizeSelectEl.value = '4';
		if (trackingEl) trackingEl.value = '0';
		if (!preserveEditState) {
			setEditModeUi(false);
			editingPostId = null;
			editingIsDb = false;
			editingExistingAttachments = null;
		}
	};

	const onSubmit = async () => {
		const title = (addTitleEl?.value || '').trim();
		const contentHtml = String(addEditorEl?.innerHTML || '').trim();
		const tags = parseTagsInput(addTagsEl?.value || '');
		const author = '나';
		if (!title) {
			alert('제목을 입력하세요.');
			return;
		}
		// Match server validation: require non-empty HTML.
		if (!contentHtml) {
			alert('내용을 입력하세요.');
			return;
		}

		try {
			// Edit existing post
			if (editingPostId) {
				if (editingIsDb) {
					// If user explicitly cleared attachments (touched + empty), request clear.
					const patchBody = { title, contentHtml, tags };
					if (attachmentsTouched && attachmentFiles.length === 0) patchBody.attachments = [];

					const res = await fetchJson(`${API_BASE}/${encodeURIComponent(editingPostId)}`, {
						method: 'PATCH',
						body: JSON.stringify(patchBody),
					});
					if (!res.ok || !res.data?.success || !res.data?.item) {
						if (res.status === 401) alert('로그인이 필요합니다.');
						else if (res.status === 403) alert('수정 권한이 없습니다.');
						else alert(res.data?.message || '수정에 실패했습니다.');
						return;
					}

					// Upload replacement attachments only when user changed them.
					if (attachmentsTouched && attachmentFiles.length > 0) {
						const up = await uploadBlogAttachments(editingPostId, attachmentFiles, { replace: true });
						if (!up.ok || !up.data?.success) {
							if (up.status === 401) alert('로그인이 필요합니다.');
							else if (up.status === 403) alert('첨부파일 업로드 권한이 없습니다.');
							else alert(up.data?.message || '첨부파일 업로드에 실패했습니다.');
							return;
						}
					}

					// Update card in-place
					const item = res.data.item;
					const old = gridEl?.querySelector?.(`.blog-card[data-post-id="${CSS.escape(String(editingPostId))}"]`);
					if (old) old.remove();
					renderPostCard(item, { prepend: true });
					closeModal();
					loadTopTags();
					return;
				}
				// localStorage-backed edit
				const posts = loadPosts();
				const idx = posts.findIndex((p) => String(p?.id) === String(editingPostId));
				if (idx >= 0) {
					const sourceFiles = attachmentsTouched ? attachmentFiles : null;
					const attachments = (sourceFiles ? (sourceFiles || []).slice(0, 10) : (editingExistingAttachments || [])).map((f) => ({
						name: f.name,
						size: f.size,
						type: f.type,
					}));
					posts[idx] = {
						...posts[idx],
						title,
						contentHtml,
						tags: tags.join(', '),
						attachments,
						updatedAt: new Date().toISOString(),
					};
					savePosts(posts);
					const old = gridEl?.querySelector?.(`.blog-card[data-post-id="${CSS.escape(String(editingPostId))}"]`);
					if (old) old.remove();
					renderPostCard(posts[idx], { prepend: true });
					closeModal();
					loadTopTags();
					return;
				}
				return;
			}

			// DB-backed: let the server choose + persist a valid insight image.
			const imageDataUrl = '';
			const sourceFiles = attachmentsTouched ? attachmentFiles : Array.from(addAttachmentsEl?.files || []);
			const attachments = [];

			// Primary: DB-backed API
			const res = await fetchJson(API_BASE, {
				method: 'POST',
				body: JSON.stringify({
					title,
					contentHtml,
					tags,
					imageDataUrl,
					attachments,
				}),
			});
			if (res.ok && res.data?.success && res.data?.item) {
				// Upload attachments after creation (multipart)
				if ((sourceFiles || []).length > 0) {
					const up = await uploadBlogAttachments(res.data.item.id, sourceFiles, { replace: true });
					if (!up.ok || !up.data?.success) {
						if (up.status === 401) alert('로그인이 필요합니다.');
						else if (up.status === 403) alert('첨부파일 업로드 권한이 없습니다.');
						else alert(up.data?.message || '첨부파일 업로드에 실패했습니다.');
						return;
					}
				}
				renderPostCard(res.data.item, { prepend: true });
				syncEmptyState();
				closeModal();
				clearForm();
				return;
			}
			if (res.status === 401) {
				alert('로그인이 필요합니다.');
				return;
			}
			if (res.data?.message) {
				alert(res.data.message);
				return;
			}

			// Fallback: keep localStorage behavior if API fails
			const fallbackAttachments = (sourceFiles || []).slice(0, 10).map((f) => ({
				name: f.name,
				size: f.size,
				type: f.type,
			}));
			const post = {
				id: `post_${Date.now()}`,
				title,
				contentHtml,
				tags,
				author,
				createdAt: new Date().toISOString(),
				imageDataUrl: pickRandomInsightImage(),
				attachments: fallbackAttachments,
			};
			const posts = loadPosts();
			posts.unshift(post);
			savePosts(posts);
			renderPostCard(post, { prepend: true });
			syncEmptyState();
			closeModal();
			clearForm();
		} catch (err) {
			console.warn(err);
			alert('요청 처리 중 오류가 발생했습니다.');
		}
	};

	// Attachment remove (X)
	if (attachListEl) {
		attachListEl.addEventListener('click', (e) => {
			const btn = e.target?.closest?.('.blog-attach-remove');
			if (!btn) return;
			const idx = parseInt(btn.getAttribute('data-index') || '-1', 10);
			if (!Number.isFinite(idx) || idx < 0 || idx >= attachmentFiles.length) return;
			attachmentFiles.splice(idx, 1);
			attachmentsTouched = true;
			renderAttachList();
		});
	}

	// Existing attachment delete (server-backed)
	if (editAttachmentsListEl) {
		editAttachmentsListEl.addEventListener('click', async (e) => {
			const btn = e.target?.closest?.('.blog-post-attachment-delete');
			if (!btn) return;
			if (!editingIsDb || !editingPostId) return;
			const stored = btn.dataset.storedName || '';
			btn.disabled = true;
			try {
				const res = await deleteBlogExistingAttachment(editingPostId, stored);
				if (!res.ok || !res.data?.success) {
					if (res.status === 401) alert('로그인이 필요합니다.');
					else if (res.status === 403) alert('수정 권한이 없습니다.');
					else alert(res.data?.message || '첨부파일 삭제에 실패했습니다.');
					return;
				}
				editingExistingAttachments = Array.isArray(res.data?.attachments) ? res.data.attachments : [];
				renderEditExistingAttachments();
			} catch (err) {
				console.warn(err);
				alert('첨부파일 삭제 중 오류가 발생했습니다.');
			} finally {
				btn.disabled = false;
			}
		});
	}

	// Dropzone click + drag/drop wiring
	const wireDropzone = (dropEl, inputEl, opts) => {
		if (!dropEl || !inputEl) return;
		dropEl.addEventListener('click', () => inputEl.click());
		dropEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				inputEl.click();
			}
		});
		dropEl.addEventListener('dragenter', (e) => {
			e.preventDefault();
			setDragState(dropEl, true);
		});
		dropEl.addEventListener('dragover', (e) => {
			e.preventDefault();
			setDragState(dropEl, true);
		});
		dropEl.addEventListener('dragleave', (e) => {
			e.preventDefault();
			setDragState(dropEl, false);
		});
		dropEl.addEventListener('drop', (e) => {
			e.preventDefault();
			setDragState(dropEl, false);
			const dtFiles = Array.from(e.dataTransfer?.files || []);
			if (opts?.type === 'image') {
				mainImageFile = dtFiles[0] || null;
				renderMainPreview();
				return;
			}
			if (opts?.type === 'attachments') {
				setAttachments(dtFiles);
			}
		});

		inputEl.addEventListener('change', () => {
			if (opts?.type === 'image') {
				mainImageFile = inputEl.files?.[0] || null;
				renderMainPreview();
				return;
			}
			if (opts?.type === 'attachments') {
				setAttachments(Array.from(inputEl.files || []));
				// keep the input file list as-is; we only enforce max in our stored list
			}
		});
	};

	wireDropzone(mainDropEl, addMainImageEl, { type: 'image' });
	wireDropzone(attachDropEl, addAttachmentsEl, { type: 'attachments' });

	// Main image remove (X)
	if (mainRemoveEl) {
		mainRemoveEl.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			mainImageFile = null;
			if (addMainImageEl) addMainImageEl.value = '';
			renderMainPreview();
		});
	}

	// --- Rich text editor behavior (lightweight) ---
	let lastRange = null;

	const FONT_SIZE_PX_OPTIONS = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
	const TOOLBAR_ICON_MAP = {
		bold: { icon: '/static/image/svg/insight/free-icon-bold.svg', label: '굵은 글씨' },
		underline: { icon: '/static/image/svg/insight/free-icon-underline.svg', label: '밑줄' },
		strikeThrough: { icon: '/static/image/svg/insight/free-icon-strikethrough.svg', label: '취소선' },
		indent: { icon: '/static/image/svg/insight/free-icon-indent.svg', label: '들여쓰기' },
		outdent: { icon: '/static/image/svg/insight/free-icon-outdent.svg', label: '내어쓰기' },
		insertUnorderedList: { icon: '/static/image/svg/insight/free-icon-chart-bullet.svg', label: '글머리 기호' },
		insertOrderedList: { icon: '/static/image/svg/insight/free-icon-sort-numeric.svg', label: '번호 매기기' },
		justifyLeft: { icon: '/static/image/svg/insight/free-icon-align-left.svg', label: '왼쪽 정렬' },
		justifyCenter: { icon: '/static/image/svg/insight/free-icon-align-center.svg', label: '가운데 정렬' },
		justifyRight: { icon: '/static/image/svg/insight/free-icon-align-right.svg', label: '오른쪽 정렬' },
		justifyFull: { icon: '/static/image/svg/insight/free-icon-align-justify.svg', label: '양쪽 맞춤' },
	};

	const COLOR_PALETTE = [
		// grayscale
		'#000000', '#1F2937', '#374151', '#6B7280', '#9CA3AF', '#D1D5DB', '#E5E7EB', '#F3F4F6', '#FFFFFF',
		// theme-ish
		'#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E', '#14B8A6', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899',
	];

	const saveSelection = () => {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		lastRange = sel.getRangeAt(0);
	};

	const restoreSelection = () => {
		if (!lastRange) return;
		const sel = window.getSelection();
		if (!sel) return;
		sel.removeAllRanges();
		sel.addRange(lastRange);
	};

	const insertStyledZeroWidthSpan = (styleText) => {
		if (!addEditorEl) return;
		addEditorEl.focus();
		restoreSelection();
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		const range = sel.getRangeAt(0);
		const span = document.createElement('span');
		span.setAttribute('style', styleText);
		const zw = document.createTextNode('\u200b');
		span.appendChild(zw);
		range.insertNode(span);
		// Move caret after the zero-width character
		const nextRange = document.createRange();
		nextRange.setStart(zw, 1);
		nextRange.collapse(true);
		sel.removeAllRanges();
		sel.addRange(nextRange);
		saveSelection();
	};

	const applyFontSizePx = (px) => {
		const sizePx = Number(px);
		if (!Number.isFinite(sizePx) || sizePx <= 0) return;
		if (!addEditorEl) return;
		addEditorEl.focus();
		restoreSelection();
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		const range = sel.getRangeAt(0);
		if (range.collapsed) {
			insertStyledZeroWidthSpan(`font-size:${sizePx}px;`);
			return;
		}
		// Use execCommand fontSize then normalize to px.
		try {
			document.execCommand('fontSize', false, '7');
			const fonts = addEditorEl.querySelectorAll('font[size="7"]');
			for (const f of fonts) {
				const span = document.createElement('span');
				span.style.fontSize = `${sizePx}px`;
				while (f.firstChild) span.appendChild(f.firstChild);
				f.parentNode?.replaceChild(span, f);
			}
		} catch (e) {
			console.warn(e);
		}
		saveSelection();
	};

	const exec = (cmd, value) => {
		if (!addEditorEl) return;
		addEditorEl.focus();
		restoreSelection();
		try {
			document.execCommand(cmd, false, value);
		} catch (e) {
			console.warn(e);
		}
		saveSelection();
	};

	const wrapSelectionWithSpanStyle = (styleText) => {
		if (!addEditorEl) return;
		addEditorEl.focus();
		restoreSelection();
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		const range = sel.getRangeAt(0);
		if (range.collapsed) return;

		const span = document.createElement('span');
		span.setAttribute('style', styleText);
		try {
			range.surroundContents(span);
		} catch {
			// Fallback for complex selections
			document.execCommand('insertHTML', false, `<span style="${styleText}">${document.execCommand ? sel.toString() : ''}</span>`);
		}
		saveSelection();
	};

	const insertTable = () => {
		const rows = 3;
		const cols = 3;

		let html = '<div class="blog-table-shell" data-blog-table="1">';
		html += '<button type="button" class="blog-table-add blog-table-add-col" contenteditable="false" aria-label="열 추가" data-table-action="add-col">+</button>';
		html += '<button type="button" class="blog-table-add blog-table-add-row" contenteditable="false" aria-label="행 추가" data-table-action="add-row">+</button>';
		html += '<button type="button" class="blog-table-remove" contenteditable="false" aria-label="표 삭제">';
		html += '<img src="/static/image/svg/insight/free-icon-trash.svg" alt="" aria-hidden="true">';
		html += '</button>';
		html += '<table><tbody>';
		for (let r = 0; r < rows; r += 1) {
			html += '<tr>';
			for (let c = 0; c < cols; c += 1) {
				html += '<td>&nbsp;</td>';
			}
			html += '</tr>';
		}
		html += '</tbody></table></div><p><br></p>';
		exec('insertHTML', html);
	};

	const buildTableGrid = (table) => {
		const rows = Array.from(table?.querySelectorAll('tr') || []);
		const grid = [];
		let maxCols = 0;
		for (let r = 0; r < rows.length; r += 1) {
			const tr = rows[r];
			if (!grid[r]) grid[r] = [];
			let c = 0;
			for (const cell of Array.from(tr.children)) {
				if (!cell.matches('td,th')) continue;
				while (grid[r][c]) c += 1;
				const rs = getCellRowspan(cell);
				const cs = getCellColspan(cell);
				for (let rr = r; rr < r + rs; rr += 1) {
					if (!grid[rr]) grid[rr] = [];
					for (let cc = c; cc < c + cs; cc += 1) {
						grid[rr][cc] = cell;
					}
				}
				c += cs;
				maxCols = Math.max(maxCols, c);
			}
			maxCols = Math.max(maxCols, grid[r].length || 0);
		}
		return { grid, rowCount: grid.length, colCount: maxCols };
	};

	const getCellStartPosInGrid = (cell, grid, rowCount, colCount) => {
		if (!cell) return null;
		for (let r = 0; r < rowCount; r += 1) {
			for (let c = 0; c < colCount; c += 1) {
				if (grid?.[r]?.[c] === cell) return { row: r, col: c };
			}
		}
		return null;
	};

	const getShellSelectionRect = (shell, fallbackCell = null) => {
		const table = shell?.querySelector?.('table');
		if (!table) return null;
		const { grid, rowCount, colCount } = buildTableGrid(table);
		const selectedCells = Array.from(shell.querySelectorAll('td.is-selected-cell, th.is-selected-cell'));
		const selectedSet = new Set(selectedCells);
		if (selectedSet.size === 0 && fallbackCell && shell.contains(fallbackCell)) selectedSet.add(fallbackCell);
		if (selectedSet.size === 0) return { table, grid, rowCount, colCount, selectedSet, minRow: null, maxRow: null, minCol: null, maxCol: null };
		let minRow = Infinity;
		let maxRow = -Infinity;
		let minCol = Infinity;
		let maxCol = -Infinity;
		for (let r = 0; r < rowCount; r += 1) {
			for (let c = 0; c < colCount; c += 1) {
				const cell = grid?.[r]?.[c];
				if (cell && selectedSet.has(cell)) {
					minRow = Math.min(minRow, r);
					maxRow = Math.max(maxRow, r);
					minCol = Math.min(minCol, c);
					maxCol = Math.max(maxCol, c);
				}
			}
		}
		if (!Number.isFinite(minRow) || !Number.isFinite(minCol)) {
			return { table, grid, rowCount, colCount, selectedSet, minRow: null, maxRow: null, minCol: null, maxCol: null };
		}
		return { table, grid, rowCount, colCount, selectedSet, minRow, maxRow, minCol, maxCol };
	};

	const selectionIsFullRowOrCol = (sel) => {
		if (!sel) return { canDelete: false, kind: null };
		const { grid, rowCount, colCount, selectedSet, minRow, maxRow, minCol, maxCol } = sel;
		if (!selectedSet || selectedSet.size === 0) return { canDelete: false, kind: null };
		if (minRow == null || minCol == null) return { canDelete: false, kind: null };

		// Full rows: selected rect spans all columns.
		const maybeRows = (minCol === 0 && maxCol === colCount - 1);
		if (maybeRows) {
			for (let r = minRow; r <= maxRow; r += 1) {
				for (let c = 0; c < colCount; c += 1) {
					const cell = grid?.[r]?.[c];
					if (!cell || !selectedSet.has(cell)) return { canDelete: false, kind: null };
				}
			}
			return { canDelete: true, kind: 'row' };
		}

		// Full cols: selected rect spans all rows.
		const maybeCols = (minRow === 0 && maxRow === rowCount - 1);
		if (maybeCols) {
			for (let c = minCol; c <= maxCol; c += 1) {
				for (let r = 0; r < rowCount; r += 1) {
					const cell = grid?.[r]?.[c];
					if (!cell || !selectedSet.has(cell)) return { canDelete: false, kind: null };
				}
			}
			return { canDelete: true, kind: 'col' };
		}

		return { canDelete: false, kind: null };
	};

	const deleteSelectedRows = (shell, sel) => {
		const { table, grid, rowCount, colCount, minRow, maxRow } = sel;
		if (!table || minRow == null || maxRow == null) return false;
		const rows = Array.from(table.querySelectorAll('tr'));
		if (!rows.length) return false;
		if (minRow <= 0 && maxRow >= rowCount - 1) {
			shell.remove();
			return true;
		}

		const uniqueCells = new Set();
		for (let r = 0; r < rowCount; r += 1) {
			for (let c = 0; c < colCount; c += 1) {
				const cell = grid?.[r]?.[c];
				if (cell) uniqueCells.add(cell);
			}
		}

		// Adjust/move rowspan cells that intersect deleted rows.
		for (const cell of uniqueCells) {
			const start = getCellStartPosInGrid(cell, grid, rowCount, colCount);
			if (!start) continue;
			const rs = getCellRowspan(cell);
			const startRow = start.row;
			const endRow = startRow + rs - 1;
			if (endRow < minRow || startRow > maxRow) continue;
			const overlap = Math.max(0, Math.min(endRow, maxRow) - Math.max(startRow, minRow) + 1);
			if (overlap <= 0) continue;

			if (startRow < minRow) {
				// Cell begins above the deletion range; just shrink rowspan.
				const nextRs = Math.max(1, rs - overlap);
				if (nextRs > 1) cell.setAttribute('rowspan', String(nextRs));
				else cell.removeAttribute('rowspan');
				continue;
			}

			// Cell begins inside deleted rows.
			if (endRow > maxRow) {
				// It extends beyond; move it to the first remaining row after the deleted block.
				const targetRowIdx = maxRow + 1;
				const targetTr = rows[targetRowIdx];
				if (targetTr) {
					const nextRs = Math.max(1, rs - overlap);
					if (nextRs > 1) cell.setAttribute('rowspan', String(nextRs));
					else cell.removeAttribute('rowspan');
					const newCell = cell;
					const visualIdx = start.col;
					// Remove from old row before insert.
					newCell.parentElement?.removeChild(newCell);
					insertCellAtVisualIndex(targetTr, visualIdx, newCell);
					continue;
				}
			}

			// Fully deleted.
			cell.remove();
		}

		// Remove rows in descending order.
		for (let r = maxRow; r >= minRow; r -= 1) {
			rows[r]?.remove();
		}
		const remainingRows = table.querySelectorAll('tr').length;
		if (!remainingRows) {
			shell.remove();
			return true;
		}
		return true;
	};

	const deleteSelectedCols = (shell, sel) => {
		const { table, grid, rowCount, colCount, minCol, maxCol } = sel;
		if (!table || minCol == null || maxCol == null) return false;
		if (minCol <= 0 && maxCol >= colCount - 1) {
			shell.remove();
			return true;
		}

		const uniqueCells = new Set();
		for (let r = 0; r < rowCount; r += 1) {
			for (let c = 0; c < colCount; c += 1) {
				const cell = grid?.[r]?.[c];
				if (cell) uniqueCells.add(cell);
			}
		}

		for (const cell of uniqueCells) {
			const start = getCellStartPosInGrid(cell, grid, rowCount, colCount);
			if (!start) continue;
			const cs = getCellColspan(cell);
			const startCol = start.col;
			const endCol = startCol + cs - 1;
			if (endCol < minCol || startCol > maxCol) continue;
			const overlap = Math.max(0, Math.min(endCol, maxCol) - Math.max(startCol, minCol) + 1);
			if (overlap <= 0) continue;
			if (overlap >= cs) {
				cell.remove();
				continue;
			}
			const nextCs = Math.max(1, cs - overlap);
			if (nextCs > 1) cell.setAttribute('colspan', String(nextCs));
			else cell.removeAttribute('colspan');
		}
		return true;
	};

	const isBlankCellHtml = (html) => {
		const s = String(html || '')
			.replace(/&nbsp;/gi, ' ')
			.replace(/<br\s*\/?>/gi, ' ')
			.replace(/<\/?p[^>]*>/gi, ' ')
			.replace(/\s+/g, ' ')
			.trim();
		return !s;
	};

	const mergeSelectedCellsInShell = (shell) => {
		const table = shell?.querySelector('table');
		if (!table) return false;
		const selectedCells = Array.from(shell.querySelectorAll('td.is-selected-cell, th.is-selected-cell'));
		if (selectedCells.length < 2) return false;
		const selectedSet = new Set(selectedCells);
		const { grid, rowCount, colCount } = buildTableGrid(table);
		let minRow = Infinity;
		let maxRow = -Infinity;
		let minCol = Infinity;
		let maxCol = -Infinity;
		let any = false;

		for (let r = 0; r < rowCount; r += 1) {
			for (let c = 0; c < colCount; c += 1) {
				const cell = grid?.[r]?.[c];
				if (cell && selectedSet.has(cell)) {
					any = true;
					minRow = Math.min(minRow, r);
					maxRow = Math.max(maxRow, r);
					minCol = Math.min(minCol, c);
					maxCol = Math.max(maxCol, c);
				}
			}
		}
		if (!any || !Number.isFinite(minRow) || !Number.isFinite(minCol)) return false;

		// Verify the selection fully covers a solid rectangle (no gaps / no unselected cells inside).
		for (let r = minRow; r <= maxRow; r += 1) {
			for (let c = minCol; c <= maxCol; c += 1) {
				const cell = grid?.[r]?.[c];
				if (!cell || !selectedSet.has(cell)) return false;
			}
		}

		const anchorCell = grid?.[minRow]?.[minCol];
		if (!anchorCell) return false;

		const cellsToRemove = new Set();
		for (let r = minRow; r <= maxRow; r += 1) {
			for (let c = minCol; c <= maxCol; c += 1) {
				const cell = grid?.[r]?.[c];
				if (cell && cell !== anchorCell) cellsToRemove.add(cell);
			}
		}

		// Merge contents (best-effort, keep anchor then append others).
		let mergedHtml = String(anchorCell.innerHTML || '');
		for (const cell of Array.from(cellsToRemove)) {
			const html = String(cell.innerHTML || '');
			if (isBlankCellHtml(html)) continue;
			if (!isBlankCellHtml(mergedHtml)) mergedHtml += '<br>';
			mergedHtml += html;
		}
		anchorCell.innerHTML = isBlankCellHtml(mergedHtml) ? '&nbsp;' : mergedHtml;

		for (const cell of Array.from(cellsToRemove)) {
			cell.remove();
		}

		const rowspan = (maxRow - minRow + 1);
		const colspan = (maxCol - minCol + 1);
		if (rowspan > 1) anchorCell.setAttribute('rowspan', String(rowspan));
		else anchorCell.removeAttribute('rowspan');
		if (colspan > 1) anchorCell.setAttribute('colspan', String(colspan));
		else anchorCell.removeAttribute('colspan');

		clearTableCellSelection();
		anchorCell.classList.add('is-selected-cell');
		tableSelectionAnchorCell = anchorCell;
		tableSelectionFocusCell = anchorCell;
		return true;
	};

	const tableMaxCols = (table) => {
		const rows = table?.querySelectorAll('tr') || [];
		let max = 0;
		for (const r of rows) {
			let count = 0;
			for (const c of Array.from(r.children)) {
				const cs = parseInt(c.getAttribute('colspan') || '1', 10);
				count += Number.isFinite(cs) ? cs : 1;
			}
			max = Math.max(max, count);
		}
		return max || 0;
	};

	const getColIndexInRow = (cell) => {
		const row = cell?.parentElement;
		if (!row) return 0;
		let idx = 0;
		for (const c of Array.from(row.children)) {
			if (c === cell) return idx;
			const cs = parseInt(c.getAttribute('colspan') || '1', 10);
			idx += Number.isFinite(cs) ? cs : 1;
		}
		return idx;
	};

	const insertCellAtVisualIndex = (row, visualIdx, newCell) => {
		if (!row || !newCell) return;
		let idx = 0;
		for (const c of Array.from(row.children)) {
			const cs = parseInt(c.getAttribute('colspan') || '1', 10);
			const span = Number.isFinite(cs) ? cs : 1;
			if (idx >= visualIdx) {
				row.insertBefore(newCell, c);
				return;
			}
			idx += span;
		}
		row.appendChild(newCell);
	};

	const getCellColspan = (cell) => {
		const cs = parseInt(cell?.getAttribute?.('colspan') || '1', 10);
		return Number.isFinite(cs) && cs > 0 ? cs : 1;
	};

	const getCellRowspan = (cell) => {
		const rs = parseInt(cell?.getAttribute?.('rowspan') || '1', 10);
		return Number.isFinite(rs) && rs > 0 ? rs : 1;
	};

	const getRowIndexInTable = (cell) => {
		const tr = cell?.closest?.('tr');
		const table = cell?.closest?.('table');
		if (!tr || !table) return 0;
		const rows = Array.from(table.querySelectorAll('tr'));
		return Math.max(0, rows.indexOf(tr));
	};

	const getCellCoords = (cell) => {
		return {
			row: getRowIndexInTable(cell),
			col: getColIndexInRow(cell),
		};
	};

	const selectTableCellRange = (anchorCell, focusCell) => {
		if (!anchorCell || !focusCell) return;
		const anchorShell = anchorCell.closest('.blog-table-shell');
		const focusShell = focusCell.closest('.blog-table-shell');
		if (!anchorShell || !focusShell || anchorShell !== focusShell) {
			clearTableCellSelection();
			focusCell.classList.add('is-selected-cell');
			return;
		}
		const table = anchorShell.querySelector('table');
		if (!table) return;
		const { grid, rowCount, colCount } = buildTableGrid(table);
		let aPos = null;
		let bPos = null;
		for (let r = 0; r < rowCount; r += 1) {
			for (let c = 0; c < colCount; c += 1) {
				const cell = grid?.[r]?.[c];
				if (!aPos && cell === anchorCell) aPos = { row: r, col: c };
				if (!bPos && cell === focusCell) bPos = { row: r, col: c };
				if (aPos && bPos) break;
			}
			if (aPos && bPos) break;
		}
		if (!aPos || !bPos) return;
		const minRow = Math.min(aPos.row, bPos.row);
		const maxRow = Math.max(aPos.row, bPos.row);
		const minCol = Math.min(aPos.col, bPos.col);
		const maxCol = Math.max(aPos.col, bPos.col);

		clearTableCellSelection();
		const marked = new Set();
		for (let r = minRow; r <= maxRow; r += 1) {
			for (let c = minCol; c <= maxCol; c += 1) {
				const cell = grid?.[r]?.[c];
				if (!cell) continue;
				if (marked.has(cell)) continue;
				cell.classList.add('is-selected-cell');
				marked.add(cell);
			}
		}
	};

	const addTableRow = (shell, afterCell = null) => {
		const table = shell?.querySelector('table');
		const tbody = table?.querySelector('tbody');
		if (!tbody || !table) return;
		const colCount = tableMaxCols(table) || 1;
		const tr = document.createElement('tr');
		for (let i = 0; i < colCount; i += 1) {
			const td = document.createElement('td');
			td.innerHTML = '&nbsp;';
			tr.appendChild(td);
		}

		// Default: append at end. If a selected cell exists, insert right below its row.
		const afterRow = afterCell?.closest?.('tr');
		if (afterRow && afterRow.parentElement === tbody) {
			const rows = Array.from(tbody.children);
			const idx = rows.indexOf(afterRow);
			tbody.insertBefore(tr, rows[idx + 1] || null);
			return;
		}
		tbody.appendChild(tr);
	};

	const addTableCol = (shell, afterCell = null) => {
		const table = shell?.querySelector('table');
		if (!table) return;

		// Default: append at end. If a selected cell exists, insert right of it (respecting colspan).
		let insertAt = null;
		if (afterCell && afterCell.closest('.blog-table-shell') === shell) {
			const start = getColIndexInRow(afterCell);
			insertAt = start + getCellColspan(afterCell);
		}

		for (const tr of Array.from(table.querySelectorAll('tr'))) {
			if (!Number.isFinite(insertAt)) {
				const td = document.createElement('td');
				td.innerHTML = '&nbsp;';
				tr.appendChild(td);
				continue;
			}

			// If a cell spans across the insertion point, grow its colspan instead of inserting a new cell.
			let idx = 0;
			let handled = false;
			for (const c of Array.from(tr.children)) {
				if (!c.matches('td,th')) continue;
				const span = getCellColspan(c);
				const start = idx;
				const endExcl = idx + span;
				if (start < insertAt && endExcl > insertAt) {
					c.setAttribute('colspan', String(span + 1));
					handled = true;
					break;
				}
				idx += span;
			}
			if (handled) continue;

			const td = document.createElement('td');
			td.innerHTML = '&nbsp;';
			insertCellAtVisualIndex(tr, insertAt, td);
		}
	};

	const fitTableWidth = (shell) => {
		const table = shell?.querySelector('table');
		if (!table) return;
		table.style.width = '100%';
		table.style.tableLayout = 'fixed';
	};

	const mergeCellRight = (cell) => {
		if (!cell) return false;
		const right = cell.nextElementSibling;
		if (!right || !right.matches('td,th')) return false;
		const cs = parseInt(cell.getAttribute('colspan') || '1', 10);
		const span = Number.isFinite(cs) ? cs : 1;
		cell.setAttribute('colspan', String(span + 1));
		const rightHtml = String(right.innerHTML || '').trim();
		if (rightHtml && rightHtml !== '&nbsp;') {
			cell.innerHTML = `${cell.innerHTML}${cell.innerHTML ? ' ' : ''}${rightHtml}`;
		}
		right.remove();
		return true;
	};

	const splitCellColspan = (cell) => {
		if (!cell) return false;
		const cs = parseInt(cell.getAttribute('colspan') || '1', 10);
		const span = Number.isFinite(cs) ? cs : 1;
		if (span <= 1) return false;
		cell.setAttribute('colspan', String(span - 1));
		const newCell = document.createElement(cell.tagName.toLowerCase());
		newCell.innerHTML = '&nbsp;';
		cell.parentElement?.insertBefore(newCell, cell.nextElementSibling);
		return true;
	};

	const splitCellRowspan = (cell) => {
		if (!cell) return false;
		const rs = parseInt(cell.getAttribute('rowspan') || '1', 10);
		const span = Number.isFinite(rs) ? rs : 1;
		if (span <= 1) return false;
		cell.setAttribute('rowspan', String(span - 1));
		const row = cell.parentElement;
		const table = row?.closest('table');
		if (!row || !table) return true;
		const rows = Array.from(table.querySelectorAll('tr'));
		const rowIdx = rows.indexOf(row);
		// Freed cell space is on the last row of the previous span.
		const targetRow = rows[rowIdx + span - 1];
		if (!targetRow) return true;
		const visualIdx = getColIndexInRow(cell);
		const newCell = document.createElement(cell.tagName.toLowerCase());
		newCell.innerHTML = '&nbsp;';
		insertCellAtVisualIndex(targetRow, visualIdx, newCell);
		return true;
	};

	let tableMenuEl = null;
	let tableMenuCell = null;
	let tableMenuShell = null;
	const closeTableMenu = () => {
		if (!tableMenuEl) return;
		tableMenuEl.remove();
		tableMenuEl = null;
		tableMenuCell = null;
		tableMenuShell = null;
	};
	const openTableMenu = (x, y, shell, cell) => {
		closeTableMenu();
		tableMenuShell = shell;
		tableMenuCell = cell;
		const sel = getShellSelectionRect(shell, cell);
		const delMeta = selectionIsFullRowOrCol(sel);
		const menu = document.createElement('div');
		menu.className = 'blog-table-menu';
		menu.innerHTML = `
			<button type="button" data-act="merge">셀 병합</button>
			<button type="button" data-act="split-row">행 분할</button>
			<button type="button" data-act="split-col">열 분할</button>
			<button type="button" data-act="fit">너비 맞춤</button>
			<button type="button" data-act="delete">삭제</button>
		`;
		menu.style.left = `${Math.max(8, x)}px`;
		menu.style.top = `${Math.max(8, y)}px`;
		document.body.appendChild(menu);
		// Enable delete only when full row/col is selected.
		const delBtn = menu.querySelector('button[data-act="delete"]');
		if (delBtn && !delMeta.canDelete) {
			delBtn.classList.add('is-muted');
			delBtn.disabled = true;
		} else if (delBtn && delMeta.kind) {
			delBtn.dataset.deleteKind = delMeta.kind;
		}
		tableMenuEl = menu;
	};

	const computeColumnWidthsPx = (table) => {
		const { grid, rowCount, colCount } = buildTableGrid(table);
		const widths = Array(colCount).fill(0);
		const seen = new Set();
		for (let r = 0; r < rowCount; r += 1) {
			for (let c = 0; c < colCount; c += 1) {
				const cell = grid?.[r]?.[c];
				if (!cell || seen.has(cell)) continue;
				seen.add(cell);
				const rect = cell.getBoundingClientRect();
				const start = getCellStartPosInGrid(cell, grid, rowCount, colCount);
				if (!start) continue;
				const cs = getCellColspan(cell);
				const per = rect.width / Math.max(1, cs);
				for (let cc = start.col; cc < start.col + cs; cc += 1) {
					widths[cc] = Math.max(widths[cc], per);
				}
			}
		}
		return widths.map((w) => Math.max(40, Math.round(w || 0)));
	};

	const ensureColGroup = (table) => {
		if (!table) return null;
		let colgroup = table.querySelector('colgroup');
		const { colCount } = buildTableGrid(table);
		if (!colgroup) {
			colgroup = document.createElement('colgroup');
			table.insertBefore(colgroup, table.firstChild);
		}
		while (colgroup.children.length < colCount) {
			colgroup.appendChild(document.createElement('col'));
		}
		while (colgroup.children.length > colCount) {
			colgroup.lastElementChild?.remove();
		}
		const cols = Array.from(colgroup.children);
		const hasAnyWidth = cols.some((c) => String(c.style.width || '').trim());
		if (!hasAnyWidth) {
			const widths = computeColumnWidthsPx(table);
			for (let i = 0; i < cols.length; i += 1) {
				cols[i].style.width = `${widths[i] || 120}px`;
			}
		}
		return colgroup;
	};

	const setColumnWidthPx = (table, colIndex, px) => {
		if (!table) return;
		const colgroup = ensureColGroup(table);
		if (!colgroup) return;
		const cols = Array.from(colgroup.children);
		const col = cols[colIndex];
		if (!col) return;
		table.style.tableLayout = 'fixed';
		col.style.width = `${Math.max(40, Math.round(px))}px`;
	};

	let tableColColorLast = '#e5e7eb';
	let tableColColorPending = null;
	const setTableColColorPending = (shell, cell) => {
		const table = shell?.querySelector?.('table');
		if (!table) return;
		const focus = cell || getSelectionFocusCellInShell(shell);
		if (!focus) return;
		const sel = getShellSelectionRect(shell, focus);
		if (!sel) return;
		const { grid, rowCount, colCount, selectedSet } = sel;
		if (!selectedSet || selectedSet.size === 0) return;

		// Store a stable fallback position so re-applying color still works even if
		// DOM nodes get replaced by editing operations.
		const focusPos = getCellStartPosInGrid(focus, grid, rowCount, colCount);

		// Requirement: apply only to the selected cell(s), not the whole column/table.
		// Store focusPos for fallback if selection classes get cleared.
		// (Note: colCount is unused now; kept via destructuring for compatibility.)
		void colCount;
		tableColColorPending = { shell, mode: 'cells', focusPos };
	};

	const applyTableColColorFromPending = (color) => {
		const pending = tableColColorPending;
		if (!pending) return;
		const c = String(color || '').trim();
		if (!c) return;
		const { shell } = pending;
		const table = shell?.querySelector?.('table');
		if (!table) return;
		if (pending.mode === 'cells') {
			// Re-collect selection at apply time so repeated color changes always work.
			let cells = Array.from(shell.querySelectorAll('td.is-selected-cell, th.is-selected-cell'));
			if (cells.length === 0 && pending.focusPos) {
				const { grid, rowCount, colCount } = buildTableGrid(table);
				const r = pending.focusPos.row;
				const cc = pending.focusPos.col;
				if (r >= 0 && r < rowCount && cc >= 0 && cc < colCount) {
					const fallback = grid?.[r]?.[cc];
					if (fallback) cells = [fallback];
				}
			}
			for (const cell of cells) {
				if (!cell || !table.contains(cell)) continue;
				cell.style.backgroundColor = c;
			}
		} else {
			const { grid, rowCount, colCount } = buildTableGrid(table);
			const cols = Array.isArray(pending.cols) ? pending.cols : [];
			const targetCols = cols.filter((x) => Number.isFinite(x) && x >= 0 && x < colCount);
			if (targetCols.length === 0) return;
			const seen = new Set();
			for (let r = 0; r < rowCount; r += 1) {
				for (const cc of targetCols) {
					const cell = grid?.[r]?.[cc];
					if (!cell || seen.has(cell)) continue;
					seen.add(cell);
					cell.style.backgroundColor = c;
				}
			}
		}
		tableColColorLast = c;
		// Avoid stale pending selection on the next interaction.
		tableColColorPending = null;
	};

	const clearTableSelection = () => {
		if (!addEditorEl) return;
		for (const el of addEditorEl.querySelectorAll('.blog-table-shell.is-selected')) {
			el.classList.remove('is-selected');
		}
	};

	const clearTableCellSelection = () => {
		if (!addEditorEl) return;
		for (const el of addEditorEl.querySelectorAll('td.is-selected-cell, th.is-selected-cell')) {
			el.classList.remove('is-selected-cell');
		}
	};

	let tableSelectionAnchorCell = null;
	let tableSelectionFocusCell = null;
	let isSelectingTableCells = false;
	let selectingTableShell = null;

	const selectTableCell = (cell, opts = {}) => {
		if (!cell) return;
		const additive = Boolean(opts.additive);
		const rangeFromAnchor = Boolean(opts.rangeFromAnchor);
		if (!additive) clearTableCellSelection();
		cell.classList.add('is-selected-cell');
		if (!tableSelectionAnchorCell || !rangeFromAnchor) {
			tableSelectionAnchorCell = cell;
		}
		tableSelectionFocusCell = cell;
	};

	const selectTableColumnsInShell = (shell, fromCol, toCol, focusCell = null) => {
		const table = shell?.querySelector?.('table');
		if (!table) return;
		const { grid, rowCount, colCount } = buildTableGrid(table);
		if (!rowCount || !colCount) return;
		const minC = Math.max(0, Math.min(colCount - 1, Math.min(fromCol, toCol)));
		const maxC = Math.max(0, Math.min(colCount - 1, Math.max(fromCol, toCol)));
		clearTableCellSelection();
		const marked = new Set();
		for (let r = 0; r < rowCount; r += 1) {
			for (let c = minC; c <= maxC; c += 1) {
				const cell = grid?.[r]?.[c];
				if (!cell || marked.has(cell)) continue;
				cell.classList.add('is-selected-cell');
				marked.add(cell);
			}
		}
		// Keep anchor/focus for follow-up operations.
		const anchor = focusCell || grid?.[0]?.[minC] || null;
		tableSelectionAnchorCell = anchor;
		tableSelectionFocusCell = focusCell || anchor;
	};

	const selectTableRowsInShell = (shell, fromRow, toRow, focusCell = null) => {
		const table = shell?.querySelector?.('table');
		if (!table) return;
		const { grid, rowCount, colCount } = buildTableGrid(table);
		if (!rowCount || !colCount) return;
		const minR = Math.max(0, Math.min(rowCount - 1, Math.min(fromRow, toRow)));
		const maxR = Math.max(0, Math.min(rowCount - 1, Math.max(fromRow, toRow)));
		clearTableCellSelection();
		const marked = new Set();
		for (let r = minR; r <= maxR; r += 1) {
			for (let c = 0; c < colCount; c += 1) {
				const cell = grid?.[r]?.[c];
				if (!cell || marked.has(cell)) continue;
				cell.classList.add('is-selected-cell');
				marked.add(cell);
			}
		}
		const anchor = focusCell || grid?.[minR]?.[0] || null;
		tableSelectionAnchorCell = anchor;
		tableSelectionFocusCell = focusCell || anchor;
	};

	const getSelectionFocusCellInShell = (shell) => {
		if (!shell) return null;
		if (tableSelectionFocusCell && shell.contains(tableSelectionFocusCell)) return tableSelectionFocusCell;
		const any = shell.querySelector('td.is-selected-cell, th.is-selected-cell');
		return any || null;
	};

	const clearImageSelection = () => {
		if (!addEditorEl) return;
		for (const el of addEditorEl.querySelectorAll('.blog-img-shell.is-selected')) {
			el.classList.remove('is-selected');
		}
	};

	const selectImageShell = (shell) => {
		if (!shell) return;
		clearImageSelection();
		shell.classList.add('is-selected');
	};

	const setImageAlign = (shell, align) => {
		if (!shell) return;
		const a = String(align || '').trim();
		// Use margins to align block images
		shell.style.display = 'block';
		shell.style.maxWidth = '100%';
		if (a === 'left') {
			shell.style.margin = '10px auto 10px 0';
		} else if (a === 'right') {
			shell.style.margin = '10px 0 10px auto';
		} else {
			// center
			shell.style.margin = '10px auto';
		}
	};

	const selectTableShell = (shell) => {
		if (!shell) return;
		clearTableSelection();
		shell.classList.add('is-selected');
	};

	const insertInlineImageFile = async (file) => {
		if (!file) return;
		try {
			const dataUrl = await readImageAsDataUrl(file);
			if (!dataUrl) return;
			const html = `
				<div class="blog-img-shell" data-blog-img="1" contenteditable="false" style="width:100%;max-width:100%;">
					<div class="blog-img-controls" contenteditable="false" aria-label="이미지 도구">
						<button type="button" data-img-action="align-left" aria-label="왼쪽 정렬"><img src="/static/image/svg/insight/free-icon-align-left.svg" alt="" aria-hidden="true"></button>
						<button type="button" data-img-action="align-center" aria-label="가운데 정렬"><img src="/static/image/svg/insight/free-icon-align-center.svg" alt="" aria-hidden="true"></button>
						<button type="button" data-img-action="align-right" aria-label="오른쪽 정렬"><img src="/static/image/svg/insight/free-icon-align-right.svg" alt="" aria-hidden="true"></button>
					</div>
					<img src="${dataUrl}" alt="">
					<span class="blog-img-handle" data-img-handle="1" aria-hidden="true"></span>
				</div>
				<p><br></p>
			`;
			exec('insertHTML', html);
		} catch (e) {
			console.warn(e);
		}
	};

	if (addEditorEl) {
		addEditorEl.addEventListener('mouseup', saveSelection);
		addEditorEl.addEventListener('keyup', saveSelection);
		addEditorEl.addEventListener('blur', saveSelection);

		let resizingShell = null;
		let resizingStartX = 0;
		let resizingStartW = 0;
		const onResizeMove = (ev) => {
			if (!resizingShell) return;
			const clientX = ev?.clientX ?? 0;
			const dx = clientX - resizingStartX;
			const editorRect = addEditorEl.getBoundingClientRect();
			const maxW = Math.max(160, editorRect.width - 20);
			const next = Math.max(160, Math.min(maxW, resizingStartW + dx));
			resizingShell.style.width = `${Math.round(next)}px`;
		};
		const onResizeUp = () => {
			if (!resizingShell) return;
			document.removeEventListener('mousemove', onResizeMove);
			document.removeEventListener('mouseup', onResizeUp);
			resizingShell = null;
		};

		let tableResizeMode = null; // 'col' | 'row' | 'table-w' | 'table-h'
		let tableResizeShell = null;
		let tableResizeTable = null;
		let tableResizeIndex = -1;
		let tableResizeStart = 0;
		let tableResizeStartSize = 0;
		let tableResizeTargetRow = null;
		const TABLE_RESIZE_EDGE = 6;
		const TABLE_SELECT_DRAG_THRESHOLD = 4;
		let tablePointerDown = null;
		let suppressNextTableClick = false;
		let tableEditingLocked = null;

		const lockTableEditing = (table) => {
			if (!table) return;
			if (tableEditingLocked === table) return;
			try {
				if (tableEditingLocked) unlockTableEditing(tableEditingLocked);
			} catch {
				// ignore
			}
			try {
				if (table.dataset.prevContenteditable == null) {
					table.dataset.prevContenteditable = table.getAttribute('contenteditable') || '';
				}
				table.setAttribute('contenteditable', 'false');
				tableEditingLocked = table;
			} catch {
				// ignore
			}
		};

		const unlockTableEditing = (table) => {
			if (!table) return;
			try {
				const prev = table.dataset.prevContenteditable;
				if (prev == null) {
					// nothing
				} else if (String(prev).trim() === '') {
					table.removeAttribute('contenteditable');
				} else {
					table.setAttribute('contenteditable', prev);
				}
				delete table.dataset.prevContenteditable;
			} catch {
				// ignore
			}
			if (tableEditingLocked === table) tableEditingLocked = null;
		};

		const placeCaretInCell = (cell, clientX, clientY) => {
			if (!cell || !addEditorEl) return;
			try {
				addEditorEl.focus({ preventScroll: true });
			} catch {
				// ignore
			}
			try {
				const sel = window.getSelection();
				if (!sel) return;
				let range = null;
				// Prefer point-based caret placement if available and inside this cell.
				const anyDoc = document;
				if (typeof anyDoc.caretPositionFromPoint === 'function') {
					const pos = anyDoc.caretPositionFromPoint(clientX, clientY);
					if (pos && cell.contains(pos.offsetNode)) {
						range = document.createRange();
						range.setStart(pos.offsetNode, pos.offset);
						range.collapse(true);
					}
				} else if (typeof anyDoc.caretRangeFromPoint === 'function') {
					const r = anyDoc.caretRangeFromPoint(clientX, clientY);
					if (r && cell.contains(r.startContainer)) {
						range = r;
						range.collapse(true);
					}
				}
				if (!range) {
					range = document.createRange();
					range.selectNodeContents(cell);
					range.collapse(false);
				}
				sel.removeAllRanges();
				sel.addRange(range);
			} catch {
				// ignore
			}
		};

		const onTablePointerMove = (ev) => {
			if (!tablePointerDown) return;
			const dx = Math.abs((ev.clientX || 0) - tablePointerDown.startX);
			const dy = Math.abs((ev.clientY || 0) - tablePointerDown.startY);
			if (dx > TABLE_SELECT_DRAG_THRESHOLD || dy > TABLE_SELECT_DRAG_THRESHOLD) {
				tablePointerDown.didDrag = true;
			}
		};

		const onTableResizeMove = (ev) => {
			if (!tableResizeMode || !tableResizeTable) return;
			if (tableResizeMode === 'table-w' && tableResizeShell) {
				const dx = (ev.clientX || 0) - tableResizeStart;
				const next = Math.max(160, Math.round(tableResizeStartSize + dx));
				tableResizeShell.style.display = 'block';
				tableResizeShell.style.width = `${next}px`;
				tableResizeTable.style.width = '100%';
				tableResizeTable.style.tableLayout = 'fixed';
				return;
			}
			if (tableResizeMode === 'table-h' && tableResizeShell) {
				const dy = (ev.clientY || 0) - tableResizeStart;
				const next = Math.max(90, Math.round(tableResizeStartSize + dy));
				tableResizeShell.style.display = 'block';
				tableResizeShell.style.height = `${next}px`;
				tableResizeTable.style.height = '100%';
				tableResizeTable.style.width = '100%';
				tableResizeTable.style.tableLayout = 'fixed';
				return;
			}
			if (tableResizeMode === 'col') {
				const dx = (ev.clientX || 0) - tableResizeStart;
				setColumnWidthPx(tableResizeTable, tableResizeIndex, tableResizeStartSize + dx);
				return;
			}
			if (tableResizeMode === 'row' && tableResizeTargetRow) {
				const dy = (ev.clientY || 0) - tableResizeStart;
				const next = Math.max(26, Math.round(tableResizeStartSize + dy));
				tableResizeTargetRow.style.height = `${next}px`;
			}
		};

		const endTableResize = () => {
			if (!tableResizeMode) return;
			document.removeEventListener('mousemove', onTableResizeMove);
			document.removeEventListener('mouseup', endTableResize);
			if (tableResizeTable) unlockTableEditing(tableResizeTable);
			tableResizeMode = null;
			tableResizeShell = null;
			tableResizeTable = null;
			tableResizeIndex = -1;
			tableResizeStart = 0;
			tableResizeStartSize = 0;
			tableResizeTargetRow = null;
			addEditorEl.style.cursor = '';
		};

		addEditorEl.addEventListener('mousedown', (e) => {
			const handle = e.target?.closest?.('[data-img-handle="1"]');
			if (!handle) return;
			e.preventDefault();
			e.stopPropagation();
			const shell = handle.closest('.blog-img-shell');
			if (!shell) return;
			selectImageShell(shell);
			resizingShell = shell;
			resizingStartX = e.clientX;
			resizingStartW = shell.getBoundingClientRect().width;
			document.addEventListener('mousemove', onResizeMove);
			document.addEventListener('mouseup', onResizeUp);
		});

		addEditorEl.addEventListener('mousedown', (e) => {
			// Start table multi-cell selection (drag) OR resize columns/rows
			if (e.button !== 0) return; // left button only
			const cell = e.target?.closest?.('td,th');
			const shell = e.target?.closest?.('.blog-table-shell');
			if (!cell || !shell) return;
			// Ignore clicks on table UI buttons
			if (e.target?.closest?.('[data-table-action], .blog-table-remove')) return;

			// Gesture-based selection
			// - Alt+Click: select whole column of clicked cell
			// - Alt+Shift+Click: select column range (anchor -> clicked)
			// - Alt+Ctrl+Click: select whole row of clicked cell
			// - Alt+Ctrl+Shift+Click: select row range (anchor -> clicked)
			if (e.altKey) {
				e.preventDefault();
				e.stopPropagation();
				clearImageSelection();
				selectTableShell(shell);
				const table = shell.querySelector('table');
				if (!table) return;
				const { grid, rowCount, colCount } = buildTableGrid(table);
				const pos = getCellStartPosInGrid(cell, grid, rowCount, colCount);
				if (!pos) {
					selectTableCell(cell);
					return;
				}
				if (e.ctrlKey || e.metaKey) {
					let fromRow = pos.row;
					if (e.shiftKey && tableSelectionAnchorCell && tableSelectionAnchorCell.closest('.blog-table-shell') === shell) {
						const aPos = getCellStartPosInGrid(tableSelectionAnchorCell, grid, rowCount, colCount);
						if (aPos) fromRow = aPos.row;
					}
					selectTableRowsInShell(shell, fromRow, pos.row, cell);
				} else {
					let fromCol = pos.col;
					if (e.shiftKey && tableSelectionAnchorCell && tableSelectionAnchorCell.closest('.blog-table-shell') === shell) {
						const aPos = getCellStartPosInGrid(tableSelectionAnchorCell, grid, rowCount, colCount);
						if (aPos) fromCol = aPos.col;
					}
					selectTableColumnsInShell(shell, fromCol, pos.col, cell);
				}
				return;
			}

			// Prevent native caret/selection artifacts while we control table selection.
			suppressNextTableClick = true;
			tablePointerDown = {
				shell,
				cell,
				startX: e.clientX || 0,
				startY: e.clientY || 0,
				didDrag: false,
			};
			document.addEventListener('mousemove', onTablePointerMove);
			e.preventDefault();
			e.stopPropagation();
			try {
				window.getSelection()?.removeAllRanges();
			} catch {
				// ignore
			}

			// Avoid showing image selection/handles while doing table interactions.
			clearImageSelection();
			selectTableShell(shell);

			const table = shell.querySelector('table');
			if (table) lockTableEditing(table);
			if (table) {
				const rect = cell.getBoundingClientRect();
				const nearRight = (rect.right - e.clientX) >= 0 && (rect.right - e.clientX) <= TABLE_RESIZE_EDGE;
				const nearBottom = (rect.bottom - e.clientY) >= 0 && (rect.bottom - e.clientY) <= TABLE_RESIZE_EDGE;
				if (nearRight || nearBottom) {
					const { grid, rowCount, colCount } = buildTableGrid(table);
					const pos = getCellStartPosInGrid(cell, grid, rowCount, colCount);
					if (pos) {
						if (nearRight) {
							const cs = getCellColspan(cell);
							const borderCol = pos.col + cs - 1;
							if (borderCol < colCount - 1) {
								e.preventDefault();
								e.stopPropagation();
								const colgroup = ensureColGroup(table);
								const cols = colgroup ? Array.from(colgroup.children) : [];
								const currentW = parseInt(cols[borderCol]?.style?.width || '0', 10) || computeColumnWidthsPx(table)[borderCol] || 120;
								tableResizeMode = 'col';
								tableResizeShell = shell;
								tableResizeTable = table;
								tableResizeIndex = borderCol;
								tableResizeStart = e.clientX;
								tableResizeStartSize = currentW;
								document.addEventListener('mousemove', onTableResizeMove);
								document.addEventListener('mouseup', endTableResize);
								return;
							}
							if (borderCol === colCount - 1) {
								e.preventDefault();
								e.stopPropagation();
								const shellRect = shell.getBoundingClientRect();
								tableResizeMode = 'table-w';
								tableResizeShell = shell;
								tableResizeTable = table;
								tableResizeIndex = borderCol;
								tableResizeStart = e.clientX;
								tableResizeStartSize = shellRect.width || table.getBoundingClientRect().width || 320;
								document.addEventListener('mousemove', onTableResizeMove);
								document.addEventListener('mouseup', endTableResize);
								return;
							}
						}
						if (nearBottom) {
							const rs = getCellRowspan(cell);
							const borderRow = pos.row + rs - 1;
							if (borderRow < rowCount - 1) {
								const rows = Array.from(table.querySelectorAll('tr'));
								const targetTr = rows[borderRow];
								if (targetTr) {
									e.preventDefault();
									e.stopPropagation();
									tableResizeMode = 'row';
									tableResizeShell = shell;
									tableResizeTable = table;
									tableResizeIndex = borderRow;
									tableResizeTargetRow = targetTr;
									tableResizeStart = e.clientY;
									tableResizeStartSize = targetTr.getBoundingClientRect().height || 36;
									document.addEventListener('mousemove', onTableResizeMove);
									document.addEventListener('mouseup', endTableResize);
									return;
								}
							}
							if (borderRow === rowCount - 1) {
								e.preventDefault();
								e.stopPropagation();
								const shellRect = shell.getBoundingClientRect();
								tableResizeMode = 'table-h';
								tableResizeShell = shell;
								tableResizeTable = table;
								tableResizeIndex = borderRow;
								tableResizeStart = e.clientY;
								tableResizeStartSize = shellRect.height || table.getBoundingClientRect().height || 180;
								document.addEventListener('mousemove', onTableResizeMove);
								document.addEventListener('mouseup', endTableResize);
								return;
							}
						}
					}
				}
			}

			selectingTableShell = shell;
			isSelectingTableCells = true;
			if (e.shiftKey && tableSelectionAnchorCell && tableSelectionAnchorCell.closest('.blog-table-shell') === shell) {
				selectTableCellRange(tableSelectionAnchorCell, cell);
				tableSelectionFocusCell = cell;
			} else {
				selectTableCell(cell);
			}
		});

		addEditorEl.addEventListener('mousemove', (e) => {
			if (tableResizeMode) return;
			const cell = e.target?.closest?.('td,th');
			const shell = e.target?.closest?.('.blog-table-shell');
			if (!cell || !shell) {
				if (!resizingShell) addEditorEl.style.cursor = '';
				return;
			}
			if (e.target?.closest?.('[data-table-action], .blog-table-remove')) return;
			const rect = cell.getBoundingClientRect();
			const nearRight = (rect.right - e.clientX) >= 0 && (rect.right - e.clientX) <= TABLE_RESIZE_EDGE;
			const nearBottom = (rect.bottom - e.clientY) >= 0 && (rect.bottom - e.clientY) <= TABLE_RESIZE_EDGE;
			if (nearRight) {
				addEditorEl.style.cursor = 'col-resize';
				return;
			}
			if (nearBottom) {
				addEditorEl.style.cursor = 'row-resize';
				return;
			}
			if (!resizingShell) addEditorEl.style.cursor = '';
		});

		document.addEventListener('mouseup', (ev) => {
			isSelectingTableCells = false;
			selectingTableShell = null;
			if (tablePointerDown) {
				document.removeEventListener('mousemove', onTablePointerMove);
				const { cell } = tablePointerDown;
				const didDrag = Boolean(tablePointerDown.didDrag);
				const t = tablePointerDown.shell?.querySelector?.('table');
				if (t) unlockTableEditing(t);
				// If it was just a click (no drag), place a single caret inside the clicked cell.
				if (!didDrag) {
					placeCaretInCell(cell, ev?.clientX ?? 0, ev?.clientY ?? 0);
				} else {
					suppressNextTableClick = false;
				}
				tablePointerDown = null;
			}
		});

		addEditorEl.addEventListener('mouseover', (e) => {
			if (!isSelectingTableCells) return;
			if (!selectingTableShell) return;
			if ((e.buttons || 0) !== 1) return;
			const cell = e.target?.closest?.('td,th');
			if (!cell) return;
			const shell = cell.closest('.blog-table-shell');
			if (!shell || shell !== selectingTableShell) return;
			if (!tableSelectionAnchorCell || tableSelectionAnchorCell.closest('.blog-table-shell') !== shell) {
				tableSelectionAnchorCell = cell;
			}
			selectTableCellRange(tableSelectionAnchorCell, cell);
			tableSelectionFocusCell = cell;
		});

		addEditorEl.addEventListener('click', (e) => {
			const maybeCell = e.target?.closest?.('td,th');
			if (maybeCell && maybeCell.closest('.blog-table-shell')) {
				if (suppressNextTableClick) {
					e.preventDefault();
					e.stopPropagation();
					suppressNextTableClick = false;
					return;
				}
				const shell = maybeCell.closest('.blog-table-shell');
				selectTableShell(shell);
				if (e.altKey) {
					const table = shell.querySelector('table');
					if (!table) return;
					const { grid, rowCount, colCount } = buildTableGrid(table);
					const pos = getCellStartPosInGrid(maybeCell, grid, rowCount, colCount);
					if (!pos) {
						selectTableCell(maybeCell);
						return;
					}
					if (e.ctrlKey || e.metaKey) {
						let fromRow = pos.row;
						if (e.shiftKey && tableSelectionAnchorCell && tableSelectionAnchorCell.closest('.blog-table-shell') === shell) {
							const aPos = getCellStartPosInGrid(tableSelectionAnchorCell, grid, rowCount, colCount);
							if (aPos) fromRow = aPos.row;
						}
						selectTableRowsInShell(shell, fromRow, pos.row, maybeCell);
						return;
					}
					let fromCol = pos.col;
					if (e.shiftKey && tableSelectionAnchorCell && tableSelectionAnchorCell.closest('.blog-table-shell') === shell) {
						const aPos = getCellStartPosInGrid(tableSelectionAnchorCell, grid, rowCount, colCount);
						if (aPos) fromCol = aPos.col;
					}
					selectTableColumnsInShell(shell, fromCol, pos.col, maybeCell);
					return;
				}
				if (e.shiftKey && tableSelectionAnchorCell && tableSelectionAnchorCell.closest('.blog-table-shell') === shell) {
					selectTableCellRange(tableSelectionAnchorCell, maybeCell);
					tableSelectionFocusCell = maybeCell;
				} else {
					selectTableCell(maybeCell);
				}
			}

			const tableAddBtn = e.target?.closest?.('[data-table-action]');
			if (tableAddBtn) {
				e.preventDefault();
				e.stopPropagation();
				const shell = tableAddBtn.closest('.blog-table-shell');
				if (!shell) return;
				selectTableShell(shell);
				const act = String(tableAddBtn.dataset.tableAction || '');
				const focusCell = getSelectionFocusCellInShell(shell);
				if (act === 'add-row') addTableRow(shell, focusCell);
				if (act === 'add-col') addTableCol(shell, focusCell);
				return;
			}

			const imgActionBtn = e.target?.closest?.('[data-img-action]');
			if (imgActionBtn) {
				e.preventDefault();
				e.stopPropagation();
				const shell = imgActionBtn.closest('.blog-img-shell');
				if (!shell) return;
				const act = String(imgActionBtn.dataset.imgAction || '');
				if (act === 'align-left') setImageAlign(shell, 'left');
				if (act === 'align-center') setImageAlign(shell, 'center');
				if (act === 'align-right') setImageAlign(shell, 'right');
				return;
			}
			const imgShell = e.target?.closest?.('.blog-img-shell');
			if (imgShell) {
				e.preventDefault();
				e.stopPropagation();
				selectImageShell(imgShell);
				return;
			}

			const btn = e.target?.closest?.('.blog-table-remove');
			if (btn) {
				e.preventDefault();
				e.stopPropagation();
				const shell = btn.closest('.blog-table-shell');
				if (shell) shell.remove();
				return;
			}
			const shell = e.target?.closest?.('.blog-table-shell');
			if (shell) {
				selectTableShell(shell);
				return;
			}
			clearTableSelection();
			clearTableCellSelection();
			tableSelectionAnchorCell = null;
			tableSelectionFocusCell = null;
			clearImageSelection();
		});

		addEditorEl.addEventListener('contextmenu', (e) => {
			const cell = e.target?.closest?.('td,th');
			const shell = e.target?.closest?.('.blog-table-shell');
			if (!cell || !shell) return;
			e.preventDefault();
			e.stopPropagation();
			selectTableShell(shell);
			openTableMenu(e.clientX, e.clientY, shell, cell);
		});
	}

	// Clicking outside editor clears table selection
	// (use capture so it runs even if other handlers stop propagation)
	document.addEventListener('click', (e) => {
		if (!addEditorEl) return;
		if (toolbarEl && toolbarEl.contains(e.target)) return;
		if (tableMenuEl && tableMenuEl.contains(e.target)) return;
		if (addEditorEl.contains(e.target)) return;
		clearTableSelection();
		clearTableCellSelection();
		tableSelectionAnchorCell = null;
		tableSelectionFocusCell = null;
		clearImageSelection();
	}, true);

	document.addEventListener('click', (e) => {
		if (!tableMenuEl) return;
		const item = e.target?.closest?.('.blog-table-menu button');
		if (item) {
			e.preventDefault();
			if (item.disabled || item.classList.contains('is-muted')) return;
			const act = String(item.dataset.act || '');
			const shell = tableMenuShell;
			const cell = (shell ? getSelectionFocusCellInShell(shell) : null) || tableMenuCell;
			if (!shell) {
				closeTableMenu();
				return;
			}
			if (act === 'delete') {
				const sel = getShellSelectionRect(shell, cell);
				const meta = selectionIsFullRowOrCol(sel);
				if (meta.canDelete && meta.kind === 'row') deleteSelectedRows(shell, sel);
				if (meta.canDelete && meta.kind === 'col') deleteSelectedCols(shell, sel);
			}
			if (act === 'fit') fitTableWidth(shell);
			if (act === 'merge') {
				if (!mergeSelectedCellsInShell(shell)) mergeCellRight(cell);
			}
			if (act === 'split-col') splitCellColspan(cell);
			if (act === 'split-row') splitCellRowspan(cell);
			closeTableMenu();
			return;
		}
		if (tableMenuEl && !tableMenuEl.contains(e.target)) closeTableMenu();
	});

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') closeTableMenu();
	});

	if (toolbarEl) {
		const formatBarEl = toolbarEl.querySelector('.blog-editor-formatbar');
		let colorPopoverEl = null;
		let colorMode = 'fore';
		let colorTriggerEl = null;
		let highlightTriggerEl = null;
		let tableColTriggerEl = null;
		const DEFAULT_HILITE = '#fff59d';

		const buildColorPopover = () => {
			if (colorPopoverEl) return colorPopoverEl;
			const pop = document.createElement('div');
			pop.className = 'blog-color-popover';
			pop.hidden = true;
			pop.setAttribute('role', 'dialog');
			pop.setAttribute('aria-label', '색상 선택');
			const title = document.createElement('div');
			title.className = 'blog-color-popover-title';
			title.textContent = '색상';
			const grid = document.createElement('div');
			grid.className = 'blog-color-grid';
			for (const c of COLOR_PALETTE) {
				const b = document.createElement('button');
				b.type = 'button';
				b.className = 'blog-color-swatch';
				b.style.backgroundColor = c;
				b.dataset.color = c;
				b.setAttribute('aria-label', c);
				grid.appendChild(b);
			}
			pop.appendChild(title);
			pop.appendChild(grid);
			toolbarEl.appendChild(pop);
			colorPopoverEl = pop;
			return pop;
		};

		const closeColorPopover = () => {
			if (!colorPopoverEl) return;
			colorPopoverEl.hidden = true;
		};

		const openColorPopover = (mode, anchorBtn) => {
			colorMode = mode;
			const pop = buildColorPopover();
			pop.dataset.mode = mode;
			const titleEl = pop.querySelector('.blog-color-popover-title');
			if (titleEl) {
				if (mode === 'hilite') titleEl.textContent = '형광펜 색상';
				else if (mode === 'table-col') titleEl.textContent = '표 컬럼색';
				else titleEl.textContent = '글자색';
			}
			pop.hidden = false;
			// Position below the anchor
			try {
				const r = anchorBtn.getBoundingClientRect();
				const tr = toolbarEl.getBoundingClientRect();
				pop.style.left = `${Math.max(0, r.left - tr.left)}px`;
				pop.style.top = `${Math.max(0, r.bottom - tr.top + 8)}px`;
			} catch {
				// ignore
			}
		};

		const setIconButton = (btn, iconUrl, ariaLabel) => {
			btn.classList.add('blog-editor-btn-icon');
			btn.innerHTML = `<img src="${iconUrl}" alt="" aria-hidden="true">`;
			btn.setAttribute('aria-label', ariaLabel);
			btn.title = ariaLabel;
		};

		const ensureButton = (cmd, iconUrl, label) => {
			if (!formatBarEl) return null;
			let btn = formatBarEl.querySelector(`button[data-cmd="${cmd}"]`);
			if (!btn) {
				btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'blog-editor-btn';
				btn.dataset.cmd = cmd;
				formatBarEl.appendChild(btn);
			}
			setIconButton(btn, iconUrl, label);
			return btn;
		};

		const ensureActionButton = (action, iconUrl, label) => {
			if (!formatBarEl) return null;
			let btn = formatBarEl.querySelector(`button[data-action="${action}"]`);
			if (!btn) {
				btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'blog-editor-btn';
				btn.dataset.action = action;
				formatBarEl.appendChild(btn);
			}
			setIconButton(btn, iconUrl, label);
			return btn;
		};

		const upgradeToolbarUi = () => {
			if (!formatBarEl) return;
			toolbarEl.classList.add('blog-editor-toolbar-v2');

			// Swap sticker icon (insert bar)
			const stickerImg = toolbarEl.querySelector('button[data-action="insert-sticker"] img');
			if (stickerImg) stickerImg.src = '/static/image/svg/insight/free-icon-smile.svg';

			// Hide non-requested controls (font family, tracking, italic)
			if (fontSelectEl) fontSelectEl.hidden = true;
			if (trackingEl) trackingEl.hidden = true;
			const italicBtn = formatBarEl.querySelector('button[data-cmd="italic"]');
			if (italicBtn) italicBtn.hidden = true;

			// Replace existing command buttons with icons where specified
			for (const btn of Array.from(formatBarEl.querySelectorAll('button.blog-editor-btn'))) {
				const cmd = btn.getAttribute('data-cmd');
				if (!cmd) continue;
				const meta = TOOLBAR_ICON_MAP[cmd];
				if (!meta) continue;
				setIconButton(btn, meta.icon, meta.label);
			}

			// Add/ensure icon buttons we need
			const btnBold = ensureButton('bold', TOOLBAR_ICON_MAP.bold.icon, TOOLBAR_ICON_MAP.bold.label);
			const btnUnderline = ensureButton('underline', TOOLBAR_ICON_MAP.underline.icon, TOOLBAR_ICON_MAP.underline.label);
			const btnStrike = ensureButton('strikeThrough', TOOLBAR_ICON_MAP.strikeThrough.icon, TOOLBAR_ICON_MAP.strikeThrough.label);
			const btnJustifyLeft = ensureButton('justifyLeft', TOOLBAR_ICON_MAP.justifyLeft.icon, TOOLBAR_ICON_MAP.justifyLeft.label);
			const btnJustifyCenter = ensureButton('justifyCenter', TOOLBAR_ICON_MAP.justifyCenter.icon, TOOLBAR_ICON_MAP.justifyCenter.label);
			const btnJustifyRight = ensureButton('justifyRight', TOOLBAR_ICON_MAP.justifyRight.icon, TOOLBAR_ICON_MAP.justifyRight.label);
			const btnJustifyFull = ensureButton('justifyFull', TOOLBAR_ICON_MAP.justifyFull.icon, TOOLBAR_ICON_MAP.justifyFull.label);
			const btnOutdent = ensureButton('outdent', TOOLBAR_ICON_MAP.outdent.icon, TOOLBAR_ICON_MAP.outdent.label);
			const btnIndent = ensureButton('indent', TOOLBAR_ICON_MAP.indent.icon, TOOLBAR_ICON_MAP.indent.label);
			const btnBullet = ensureButton('insertUnorderedList', TOOLBAR_ICON_MAP.insertUnorderedList.icon, TOOLBAR_ICON_MAP.insertUnorderedList.label);
			const btnNumber = ensureButton('insertOrderedList', TOOLBAR_ICON_MAP.insertOrderedList.icon, TOOLBAR_ICON_MAP.insertOrderedList.label);
			const btnCheckbox = ensureActionButton('insert-checkbox', '/static/image/svg/insight/free-icon-checkbox.svg', '체크박스');

			// Normalize size options to px list
			if (sizeSelectEl) {
				sizeSelectEl.innerHTML = '';
				const opt0 = document.createElement('option');
				opt0.value = '';
				opt0.textContent = '글자크기';
				sizeSelectEl.appendChild(opt0);
				for (const v of FONT_SIZE_PX_OPTIONS) {
					const opt = document.createElement('option');
					opt.value = String(v);
					opt.textContent = `${v}px`;
					sizeSelectEl.appendChild(opt);
				}
				if (!sizeSelectEl.value) sizeSelectEl.value = '16';
			}

			// Hide native color labels, replace with swatch UI + palette
			for (const lbl of Array.from(formatBarEl.querySelectorAll('.blog-editor-color'))) {
				lbl.hidden = true;
			}

			const colorUi = document.createElement('div');
			colorUi.className = 'blog-color-ui';
			colorTriggerEl = document.createElement('button');
			colorTriggerEl.type = 'button';
			colorTriggerEl.className = 'blog-color-trigger';
			colorTriggerEl.dataset.action = 'toggle-fore-palette';
			colorTriggerEl.innerHTML = `<img class="blog-color-icon" src="/static/image/svg/insight/free-icon-palette.svg" alt="" aria-hidden="true"><span class="blog-color-sample" data-kind="fore"></span>`;
			colorTriggerEl.setAttribute('aria-label', '글자색');
			colorTriggerEl.title = '글자색';

			tableColTriggerEl = document.createElement('button');
			tableColTriggerEl.type = 'button';
			tableColTriggerEl.className = 'blog-color-trigger';
			tableColTriggerEl.dataset.action = 'table-col-color';
			tableColTriggerEl.innerHTML = `<img class="blog-color-icon" src="/static/image/svg/insight/free-icon-palette2.svg" alt="" aria-hidden="true"><span class="blog-color-sample" data-kind="table-col"></span>`;
			tableColTriggerEl.setAttribute('aria-label', '표 컬럼색');
			tableColTriggerEl.title = '표 컬럼색';

			highlightTriggerEl = document.createElement('button');
			highlightTriggerEl.type = 'button';
			highlightTriggerEl.className = 'blog-color-trigger';
			highlightTriggerEl.dataset.action = 'toggle-hilite-palette';
			highlightTriggerEl.innerHTML = `<img class="blog-color-icon" src="/static/image/svg/insight/free-icon-highlighter.svg" alt="" aria-hidden="true"><span class="blog-color-sample" data-kind="hilite"></span>`;

			// Put table column color immediately to the right of text color.
			colorUi.appendChild(colorTriggerEl);
			colorUi.appendChild(tableColTriggerEl);
			colorUi.appendChild(highlightTriggerEl);

			// Insert after size select if possible
			if (sizeSelectEl && sizeSelectEl.parentNode === formatBarEl) {
				formatBarEl.insertBefore(colorUi, sizeSelectEl.nextSibling);
			} else {
				formatBarEl.prepend(colorUi);
			}

			const foreSample = colorUi.querySelector('.blog-color-sample[data-kind="fore"]');
			const hiliteSample = colorUi.querySelector('.blog-color-sample[data-kind="hilite"]');
			const tableColSample = colorUi.querySelector('.blog-color-sample[data-kind="table-col"]');
			if (foreSample) foreSample.style.backgroundColor = String(colorEl?.value || '#111827');
			if (highlightEl && !String(highlightEl.value || '').trim()) highlightEl.value = DEFAULT_HILITE;
			if (hiliteSample) hiliteSample.style.backgroundColor = String(highlightEl?.value || DEFAULT_HILITE);
			if (tableColSample) tableColSample.style.backgroundColor = String(tableColColorLast || '#e5e7eb');

			// Reorder visible controls to match the requested icon layout
			const ordered = [
				sizeSelectEl,
				colorUi,
				btnBold,
				btnUnderline,
				btnStrike,
				btnCheckbox,
				btnJustifyLeft,
				btnJustifyCenter,
				btnJustifyRight,
				btnJustifyFull,
				btnOutdent,
				btnIndent,
				btnBullet,
				btnNumber,
			];
			for (const el of ordered) {
				if (!el) continue;
				if (el.hidden) continue;
				formatBarEl.appendChild(el);
			}
		};

		upgradeToolbarUi();

		toolbarEl.addEventListener('mousedown', (e) => {
			// Keep selection from collapsing when clicking toolbar.
			// BUT allow native controls (select/input) to work.
			const interactive = e.target?.closest?.('select, option, input, textarea, label');
			if (interactive) return;
			const isButton = e.target?.closest?.('button');
			if (!isButton) return;
			e.preventDefault();
		});
		toolbarEl.addEventListener('click', (e) => {
			const btn = e.target?.closest?.('button');
			if (!btn) return;
			const cmd = btn.getAttribute('data-cmd');
			const action = btn.getAttribute('data-action');
			if (cmd) exec(cmd);
			if (action === 'insert-table') insertTable();
			if (action === 'insert-image') {
				if (editorImageInputEl) editorImageInputEl.click();
			}
			if (action === 'insert-sticker') {
				exec('insertText', '🙂');
			}
			if (action === 'insert-checkbox') {
				exec('insertText', '☐ ');
			}
			if (action === 'toggle-fore-palette') {
				const pop = buildColorPopover();
				if (!pop.hidden && colorMode === 'fore') {
					closeColorPopover();
					return;
				}
				openColorPopover('fore', btn);
			}
			if (action === 'table-col-color') {
				const activeShell = (
					(tableSelectionFocusCell ? tableSelectionFocusCell.closest?.('.blog-table-shell') : null)
					|| addEditorEl?.querySelector?.('.blog-table-shell.is-selected')
					|| addEditorEl?.querySelector?.('.blog-table-shell')
				);
				if (!activeShell) return;
				const focusCell = getSelectionFocusCellInShell(activeShell) || tableSelectionFocusCell || activeShell.querySelector('td,th');
				if (!focusCell) return;
				setTableColColorPending(activeShell, focusCell);
				const pop = buildColorPopover();
				if (!pop.hidden && colorMode === 'table-col') {
					closeColorPopover();
					return;
				}
				openColorPopover('table-col', btn);
			}
			if (action === 'toggle-hilite-palette') {
				// Apply current highlight color first (default: yellow), then allow palette selection.
				const c = String(highlightEl?.value || DEFAULT_HILITE).trim() || DEFAULT_HILITE;
				try {
					const sel = window.getSelection();
					if (sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed) {
						exec('hiliteColor', c);
						const sample = toolbarEl.querySelector('.blog-color-sample[data-kind="hilite"]');
						if (sample) sample.style.backgroundColor = c;
						if (highlightEl) highlightEl.value = c;
					}
				} catch {
					// ignore
				}
				const pop = buildColorPopover();
				if (!pop.hidden && colorMode === 'hilite') {
					closeColorPopover();
					return;
				}
				openColorPopover('hilite', btn);
			}
		});

		document.addEventListener('click', (e) => {
			if (!colorPopoverEl || colorPopoverEl.hidden) return;
			if (toolbarEl.contains(e.target)) return;
			closeColorPopover();
		});

		toolbarEl.addEventListener('click', (e) => {
			const sw = e.target?.closest?.('.blog-color-swatch');
			if (!sw) return;
			const c = String(sw.dataset.color || '').trim();
			if (!c) return;
			if (colorMode === 'fore') {
				if (colorEl) colorEl.value = c;
				exec('foreColor', c);
				const sample = toolbarEl.querySelector('.blog-color-sample[data-kind="fore"]');
				if (sample) sample.style.backgroundColor = c;
			} else if (colorMode === 'table-col') {
				applyTableColColorFromPending(c);
				const sample = toolbarEl.querySelector('.blog-color-sample[data-kind="table-col"]');
				if (sample) sample.style.backgroundColor = c;
			} else {
				if (highlightEl) highlightEl.value = c;
				exec('hiliteColor', c);
				const sample = toolbarEl.querySelector('.blog-color-sample[data-kind="hilite"]');
				if (sample) sample.style.backgroundColor = c;
			}
			closeColorPopover();
		});
	}

	// Initialize attachment dropzone icon animation
	ensureAttachUploadLottie();

	if (editorImageInputEl) {
		editorImageInputEl.addEventListener('change', async () => {
			const f = editorImageInputEl.files?.[0] || null;
			await insertInlineImageFile(f);
			editorImageInputEl.value = '';
		});
	}

	if (fontSelectEl) {
		fontSelectEl.addEventListener('change', () => {
			const font = String(fontSelectEl.value || '').trim();
			if (!font) return;
			exec('fontName', font);
		});
	}

	if (sizeSelectEl) {
		sizeSelectEl.addEventListener('change', () => {
			const v = String(sizeSelectEl.value || '').trim();
			if (!v) return;
			const px = parseInt(v, 10);
			if (!Number.isFinite(px)) return;
			applyFontSizePx(px);
		});
	}

	if (colorEl) {
		colorEl.addEventListener('input', () => {
			const c = String(colorEl.value || '').trim();
			if (!c) return;
			exec('foreColor', c);
		});
	}

	if (highlightEl) {
		highlightEl.addEventListener('input', () => {
			const c = String(highlightEl.value || '').trim();
			if (!c) return;
			// 'hiliteColor' works in most modern browsers.
			exec('hiliteColor', c);
		});
	}

	if (trackingEl) {
		trackingEl.addEventListener('change', () => {
			const v = String(trackingEl.value || '').trim();
			if (v === '') return;
			const px = parseFloat(v);
			if (!Number.isFinite(px)) return;
			wrapSelectionWithSpanStyle(`letter-spacing:${px}px;`);
		});
	}

	// --- Pagination / infinite scroll (8 at a time) ---
	let pagingOffset = 0;
	let pagingHasMore = true;
	let pagingLoading = false;
	let pagingQuery = '';
	let pagingEpoch = 0;

	const renderTopTags = (items) => {
		if (!tagsEl) return;
		tagsEl.innerHTML = '';
		const list = Array.isArray(items) ? items : [];
		if (list.length === 0) return;
		const top = list.slice(0, 8);
		for (let idx = 0; idx < top.length; idx += 1) {
			const it = top[idx];
			const pill = document.createElement('button');
			pill.type = 'button';
			pill.className = 'blog-tag-pill';
			const tag = normalizeTagToken(it?.tag);
			if (!tag) continue;
			pill.textContent = tag;
			pill.dataset.tag = tag;
			tagsEl.appendChild(pill);
		}
	};

	const computeTopTagsFromLocal = () => {
		const posts = loadPosts();
		const counts = {};
		for (const p of posts) {
			const raw = String(p?.tags || '').trim();
			if (!raw) continue;
			for (const part of raw.split(',')) {
				const t = normalizeTagToken(part);
				if (!t) continue;
				counts[t] = (counts[t] || 0) + 1;
			}
		}
		return Object.entries(counts)
			.sort((a, b) => (b[1] - a[1]) || String(a[0]).localeCompare(String(b[0])))
			.slice(0, 8)
			.map(([tag, count]) => ({ tag, count }));
	};

	const loadTopTags = async () => {
		try {
			const res = await fetchJson(`${API_TOP_TAGS}?limit=8`, { method: 'GET' });
			if (res.ok && res.data?.success) {
				renderTopTags(res.data.items);
				if (Array.isArray(res.data.items) && res.data.items.length === 0) {
					renderTopTags(computeTopTagsFromLocal());
				}
				return;
			}
		} catch (e) {
			console.warn(e);
		}
		// Fallback if API is missing/unavailable
		renderTopTags(computeTopTagsFromLocal());
	};

	// Tag click -> filter posts
	if (tagsEl) {
		tagsEl.addEventListener('click', (e) => {
			const pill = e.target?.closest?.('.blog-tag-pill');
			if (!pill) return;
			const tag = String(pill.dataset.tag || '').trim();
			if (!tag) return;
			if (searchEl) searchEl.value = tag;
			resetAndLoad(tag);
		});
	}

	const loadNextPage = async () => {
		if (!gridEl || pagingLoading || !pagingHasMore) return;
		pagingLoading = true;
		const epoch = pagingEpoch;
		let loadedFromApi = false;
		try {
			const qs = new URLSearchParams();
			qs.set('offset', String(pagingOffset));
			qs.set('limit', String(PAGE_SIZE));
			if (pagingQuery) qs.set('q', pagingQuery);
			const res = await fetchJson(`${API_BASE}?${qs.toString()}`, { method: 'GET' });
			if (epoch !== pagingEpoch) return;
			if (res.ok && res.data?.success && Array.isArray(res.data.items)) {
				loadedFromApi = true;
				const items = res.data.items;
				for (const it of items) renderPostCard(it);
				pagingOffset += items.length;
				pagingHasMore = items.length === PAGE_SIZE;
				syncEmptyState();
			}

			if (epoch !== pagingEpoch) return;

			if (!loadedFromApi) {
				// Fallback: localStorage pagination (with basic search support)
				const posts = loadPosts();
				let filtered = posts;
				if (pagingQuery) {
					const q = pagingQuery.toLowerCase();
					filtered = posts.filter((p) => {
						const hay = `${p?.title || ''} ${p?.contentHtml || ''} ${p?.tags || ''}`.toLowerCase();
						return hay.includes(q);
					});
				}
				const slice = filtered.slice(pagingOffset, pagingOffset + PAGE_SIZE);
				for (const it of slice) renderPostCard(it);
				pagingOffset += slice.length;
				pagingHasMore = slice.length === PAGE_SIZE;
				syncEmptyState();
			}
		} catch (e) {
			console.warn(e);
		} finally {
			if (epoch === pagingEpoch) pagingLoading = false;
		}
	};

	const resetAndLoad = async (q) => {
		pagingEpoch += 1;
		pagingQuery = String(q || '').trim();
		pagingOffset = 0;
		pagingHasMore = true;
		pagingLoading = false;
		clearGrid();
		await loadNextPage();
	};

	if (gridEl) {
		loadTopTags();
		resetAndLoad('');
	}

	// When coming back from detail page, browsers may restore the list from bfcache
	// (so DOM stays stale). Re-fetch the list so like/comment counts reflect latest state.
	const isBackForwardNav = () => {
		try {
			const nav = performance.getEntriesByType?.('navigation')?.[0];
			return nav && nav.type === 'back_forward';
		} catch {
			return false;
		}
	};
	window.addEventListener('pageshow', (e) => {
		if (!gridEl) return;
		if (e.persisted || isBackForwardNav()) {
			lastListRefreshAt = Date.now();
			resetAndLoad(pagingQuery);
		}
	});

	// Some environments may not trigger pageshow as expected; also refresh when the
	// page becomes visible again (e.g., after navigating back from detail).
	let lastListRefreshAt = 0;
	const refreshListIfStale = () => {
		if (!gridEl) return;
		const now = Date.now();
		if (now - lastListRefreshAt < 800) return;
		lastListRefreshAt = now;
		resetAndLoad(pagingQuery);
	};
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') refreshListIfStale();
	});
	window.addEventListener('focus', () => {
		refreshListIfStale();
	});

	if (addOpenBtn) addOpenBtn.addEventListener('click', openModal);
	if (addCloseBtn) addCloseBtn.addEventListener('click', closeModal);
	if (addCancelBtn) addCancelBtn.addEventListener('click', closeModal);
	if (addSubmitBtn) addSubmitBtn.addEventListener('click', onSubmit);

	if (addModal) {
		addModal.addEventListener('click', (e) => {
			if (e.target === addModal) closeModal();
		});
	}

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && addModal?.classList.contains('show')) {
			closeModal();
		}
	});

	if (searchEl && gridEl) {
		let searchTimer = null;
		searchEl.addEventListener('input', () => {
			const q = String(searchEl.value || '').trim();
			if (searchTimer) window.clearTimeout(searchTimer);
			searchTimer = window.setTimeout(() => {
				resetAndLoad(q);
			}, 200);
		});
	}

	// Infinite scroll trigger
	if (sentinelEl && typeof IntersectionObserver !== 'undefined') {
		const io = new IntersectionObserver((entries) => {
			for (const ent of entries) {
				if (ent.isIntersecting) loadNextPage();
			}
		}, { root: null, rootMargin: '200px 0px', threshold: 0 });
		io.observe(sentinelEl);
	}

	// Ensure context-menu delete supports DB pagination state updates
	// (no extra action needed; removing the card updates empty-state)
});
