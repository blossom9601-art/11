document.addEventListener('DOMContentLoaded', () => {
	const STORAGE_POSTS_KEY = 'blossom:insight_blog_it:posts:v1';
	const STORAGE_STATE_PREFIX = 'blossom:insight_blog_it:state:v1:';
	const API_BASE = '/api/insight/blog/posts';
	const API_IMAGE = '/api/insight/blog/posts';
	const API_COMMENTS = '/api/insight/blog/posts';
	const API_LIKES = '/api/insight/blog/posts';
	const API_COMMENT_LIKES = '/api/insight/blog/posts';
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

	const likeBtn = document.getElementById('blog-like-btn');
	const likeCountEl = document.getElementById('blog-like-count');
	const commentCountEl = document.getElementById('blog-comment-count');
	const commentListEl = document.getElementById('blog-comments-list');
	const commentForm = document.getElementById('blog-comment-form');
	const commentInput = document.getElementById('blog-comment-input');

	const postImageEl = document.getElementById('blog-post-image');
	const postAvatarEl = document.getElementById('blog-post-avatar');
	const postAuthorEl = document.getElementById('blog-post-author');
	const postDeptEl = document.getElementById('blog-post-department');
	const postTitleEl = document.getElementById('blog-post-title');
	const postContentEl = document.getElementById('blog-post-content');
	const postTimeEl = document.getElementById('blog-post-time');
	const postMediaWrapEl = document.getElementById('blog-post-media-wrap');
	const postBodyWrapEl = document.getElementById('blog-post-body-wrap');
	const postActionsWrapEl = document.getElementById('blog-post-actions-wrap');
	const postCommentsWrapEl = document.getElementById('blog-comments-wrap');
	const postAttachmentsWrapEl = document.getElementById('blog-post-attachments');
	const postAttachmentsListEl = document.getElementById('blog-post-attachments-list');
	const bodyEl = document.body;
	const currentUserName = String(bodyEl?.dataset?.currentUserName || '').trim();
	const currentEmpNo = String(bodyEl?.dataset?.currentEmpNo || '').trim();
	const currentUserRole = String(bodyEl?.dataset?.currentUserRole || '').trim().toUpperCase();

	const postId = new URLSearchParams(window.location.search).get('post') || '';
	const postIdNum = /^[0-9]+$/.test(String(postId)) ? parseInt(String(postId), 10) : null;
	// IMPORTANT: Avoid a shared "default" state key.
	// If the URL doesn't include ?post=..., we still scope state per-page (path+search)
	// to prevent unrelated comments from appearing.
	const buildStateKey = () => {
		if (postIdNum) return `${STORAGE_STATE_PREFIX}id:${postIdNum}`;
		if (postId) return `${STORAGE_STATE_PREFIX}key:${postId}`;
		return `${STORAGE_STATE_PREFIX}url:${window.location.pathname}${window.location.search}`;
	};
	const stateKey = buildStateKey();

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
		window.localStorage.setItem(STORAGE_POSTS_KEY, JSON.stringify(Array.isArray(posts) ? posts : []));
	};

	const loadState = () => {
		const raw = window.localStorage.getItem(stateKey);
		const parsed = raw ? safeJsonParse(raw, null) : null;
		return parsed && typeof parsed === 'object' ? parsed : null;
	};

	const saveState = (state) => {
		window.localStorage.setItem(stateKey, JSON.stringify(state || {}));
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

	const setLikeUi = ({ liked, total }) => {
		if (likeBtn) {
			likeBtn.setAttribute('aria-pressed', liked ? 'true' : 'false');
			likeBtn.classList.toggle('is-liked', !!liked);
		}
		setCount(likeCountEl, toInt(total));
	};

	const loadServerLikes = async () => {
		if (!postIdNum) return { ok: false, data: null };
		return await fetchJson(`${API_LIKES}/${postIdNum}/likes`, { method: 'GET' });
	};

	const likeServer = async () => {
		if (!postIdNum) return { ok: false, data: null };
		return await fetchJson(`${API_LIKES}/${postIdNum}/likes`, { method: 'POST' });
	};

	const unlikeServer = async () => {
		if (!postIdNum) return { ok: false, data: null };
		return await fetchJson(`${API_LIKES}/${postIdNum}/likes`, { method: 'DELETE' });
	};

	const sanitizeHtml = (html) => {
		const input = String(html || '');
		const tpl = document.createElement('template');
		tpl.innerHTML = input;
		// remove script tags
		for (const s of tpl.content.querySelectorAll('script')) s.remove();
		// remove inline event handlers
		for (const el of tpl.content.querySelectorAll('*')) {
			for (const attr of Array.from(el.attributes || [])) {
				if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
			}
		}
		return tpl.innerHTML;
	};

	const formatBytes = (n) => {
		const num = Number(n);
		if (!Number.isFinite(num) || num <= 0) return '';
		const units = ['B', 'KB', 'MB', 'GB'];
		let v = num;
		let i = 0;
		while (v >= 1024 && i < units.length - 1) {
			v /= 1024;
			i += 1;
		}
		const fixed = i === 0 ? String(Math.floor(v)) : v.toFixed(v >= 10 ? 1 : 2);
		return `${fixed} ${units[i]}`;
	};

	const renderAttachments = (attachments) => {
		if (!postAttachmentsWrapEl || !postAttachmentsListEl) return;
		postAttachmentsListEl.innerHTML = '';
		const items = Array.isArray(attachments) ? attachments : [];
		if (items.length === 0) {
			postAttachmentsWrapEl.hidden = true;
			return;
		}
		for (const a of items) {
			const li = document.createElement('li');
			const name = a?.original_name || a?.name || '첨부파일';
			const url = String(a?.download_url || '').trim();
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
			postAttachmentsListEl.appendChild(li);
		}
		postAttachmentsWrapEl.hidden = false;
	};

	const toInt = (text) => {
		const parsed = parseInt(String(text || '').replace(/[^0-9]/g, ''), 10);
		return Number.isFinite(parsed) ? parsed : 0;
	};

	const setCount = (el, value) => {
		if (!el) return;
		el.textContent = String(Math.max(0, value));
	};

	const readImageAsDataUrl = (file) => new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ''));
		reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
		reader.readAsDataURL(file);
	});

	const getHeaderAvatarSrc = () => {
		const headerAvatarEl = document.querySelector('.header-avatar-icon');
		const src = headerAvatarEl?.getAttribute?.('src') || '';
		return String(src || '').trim();
	};

	const getHeaderUserName = () => {
		const headerAvatarEl = document.querySelector('.header-avatar-icon');
		const alt = headerAvatarEl?.getAttribute?.('alt') || '';
		return String(alt || '').trim();
	};

	const parseIsoToDate = (isoText) => {
		const raw = String(isoText || '').trim();
		if (!raw) return null;
		// If server returns an ISO string without timezone (common with naive UTC datetimes),
		// treat it as UTC to avoid client-local timezone skew.
		const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
		const normalized = hasTz ? raw : `${raw}Z`;
		const d = new Date(normalized);
		return Number.isNaN(d.getTime()) ? null : d;
	};

	const formatKstYmd = (d) => {
		// Format date in Korea time (Asia/Seoul) without relying on browser locale.
		const ms = d.getTime() + (9 * 60 * 60 * 1000);
		const k = new Date(ms);
		const yyyy = k.getUTCFullYear();
		const mm = String(k.getUTCMonth() + 1).padStart(2, '0');
		const dd = String(k.getUTCDate()).padStart(2, '0');
		return `${yyyy}-${mm}-${dd}`;
	};

	const formatTimeLabelFromIso = (isoText) => {
		// Rules:
		// - < 24h: show minutes/hours ("방금 전" / "X분 전" / "X시간 전")
		// - < 30d: "X일 전"
		// - < 1y: "X개월 전"
		// - < 100y: "X년 전"
		const d = parseIsoToDate(isoText);
		if (!d) return '방금 전';
		let diffMs = Date.now() - d.getTime();
		if (!Number.isFinite(diffMs)) return '방금 전';
		// If timestamp is in the future, clamp to "방금 전"
		if (diffMs < 0) diffMs = 0;

		const minuteMs = 60 * 1000;
		const hourMs = 60 * minuteMs;
		const dayMs = 24 * hourMs;

		if (diffMs < minuteMs) return '방금 전';
		if (diffMs < hourMs) return `${Math.max(1, Math.floor(diffMs / minuteMs))}분 전`;
		if (diffMs < dayMs) return `${Math.max(1, Math.floor(diffMs / hourMs))}시간 전`;

		const days = Math.max(1, Math.floor(diffMs / dayMs));
		if (days < 30) return `${days}일 전`;

		const months = Math.max(1, Math.floor(days / 30));
		if (days < 365) return `${months}개월 전`;

		const years = Math.max(1, Math.floor(days / 365));
		if (years < 100) return `${years}년 전`;

		// Fallback for very old timestamps
		return formatKstYmd(d);
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

	const cycleLocalInsightImage = (currentUrl, seed) => {
		const urls = Array.isArray(INSIGHT_RANDOM_IMAGES) ? INSIGHT_RANDOM_IMAGES : [];
		if (urls.length === 0) return '';
		const cur = String(currentUrl || '').trim();
		if (!cur) return pickFallbackInsightImage(seed);
		const base = cur.split('?', 1)[0];
		const idx = urls.indexOf(base);
		if (idx >= 0) return urls[(idx + 1) % urls.length];
		return pickFallbackInsightImage(seed);
	};

	const setPostImage = (primarySrc, fallbackSrc) => {
		if (!postImageEl || !postMediaWrapEl) return;
		const primaryUrl = String(primarySrc || '').trim();
		const fallbackUrl = String(fallbackSrc || '').trim() || (INSIGHT_RANDOM_IMAGES[0] || '');
		const chosenUrl = primaryUrl || fallbackUrl;
		if (!chosenUrl) {
			postImageEl.hidden = true;
			postMediaWrapEl.hidden = true;
			return;
		}

		// Match list page behavior: always show an image; if broken, swap to fallback.
		postMediaWrapEl.hidden = false;
		postImageEl.hidden = false;
		postImageEl.dataset.fallbackSrc = fallbackUrl;
		postImageEl.dataset.fallbackApplied = '0';
		postImageEl.onerror = () => {
			const fb = String(postImageEl.dataset.fallbackSrc || '').trim();
			if (postImageEl.dataset.fallbackApplied !== '1' && fb && postImageEl.src !== fb) {
				postImageEl.dataset.fallbackApplied = '1';
				postImageEl.src = fb;
				return;
			}
			// Last resort: try the first insight image (keeps header image visible)
			const first = INSIGHT_RANDOM_IMAGES[0] || '';
			if (first && postImageEl.src !== first) {
				postImageEl.src = first;
				return;
			}
			// If everything fails, hide to avoid broken-image icon.
			postImageEl.hidden = true;
			postMediaWrapEl.hidden = true;
		};
		postImageEl.onload = () => {
			postMediaWrapEl.hidden = false;
			postImageEl.hidden = false;
		};
		postImageEl.src = chosenUrl;
	};

	const revealContent = () => {
		if (postBodyWrapEl) postBodyWrapEl.hidden = false;
		if (postActionsWrapEl) postActionsWrapEl.hidden = false;
		if (postCommentsWrapEl) postCommentsWrapEl.hidden = false;
		// Media is revealed via setPostImage() only when a valid image is set/loaded.
	};

	const ensureImageEditButton = () => {
		if (!postMediaWrapEl) return;
		let btn = postMediaWrapEl.querySelector('.blog-post-image-edit');
		if (btn) return;
		btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'blog-post-image-edit';
		btn.setAttribute('aria-label', '이미지 변경');
		btn.title = '이미지 변경';
		btn.innerHTML = '<img src="/static/image/svg/insight/free-icon-picture.svg" alt="" aria-hidden="true">';
		postMediaWrapEl.appendChild(btn);

		btn.addEventListener('click', async () => {
			if (!postId) return;
			// DB-backed: cycle image on server so it persists.
			if (postIdNum) {
				try {
					const res = await fetchJson(`${API_IMAGE}/${postIdNum}/image`, {
						method: 'PATCH',
						body: JSON.stringify({ mode: 'cycle' }),
					});
					if (res.ok && res.data?.success && res.data?.imageDataUrl) {
						setPostImage(res.data.imageDataUrl, pickFallbackInsightImage(postIdNum));
					}
				} catch (e) {
					console.warn(e);
				}
				return;
			}

			// localStorage-backed: cycle locally.
			try {
				const posts = loadPosts();
				const idx = posts.findIndex((p) => String(p?.id) === String(postId));
				if (idx < 0) return;
				const cur = posts[idx]?.imageDataUrl || '';
				const next = cycleLocalInsightImage(cur, postId);
				posts[idx].imageDataUrl = next;
				savePosts(posts);
				setPostImage(next, pickFallbackInsightImage(postId));
			} catch (e) {
				console.warn(e);
			}
		});
	};

	const newLocalId = () => {
		try {
			return `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;
		} catch {
			return `c_${Date.now()}`;
		}
	};

	const normalizeComments = (comments) => {
		const items = Array.isArray(comments) ? comments : [];
		return items
			.filter((c) => c && typeof c === 'object')
			.map((c, idx) => {
				const rawMs = c.createdAtMs;
				const createdAtMs = (typeof rawMs === 'number' && Number.isFinite(rawMs))
					? rawMs
					: (typeof rawMs === 'string' && rawMs.trim() && Number.isFinite(parseInt(rawMs, 10)) ? parseInt(rawMs, 10) : null);
				return {
					id: String(c.id || newLocalId()),
					parentId: c.parentId != null && String(c.parentId).trim() ? String(c.parentId) : null,
					author: c.author || '나',
					text: c.text || '',
					timeLabel: c.timeLabel || '방금 전',
					avatarSrc: c.avatarSrc || '/static/image/svg/free-sticker-profile.svg',
					likeTotal: (typeof c.likeTotal === 'number' ? c.likeTotal : toInt(c.likeTotal)),
					likedByMe: !!c.likedByMe,
					replyTotal: (typeof c.replyTotal === 'number' ? c.replyTotal : toInt(c.replyTotal)),
					createdAtMs,
					orderIndex: idx,
				};
			});
	};

	const buildCommentTree = (comments) => {
		const byId = new Map();
		const children = new Map();
		const list = normalizeComments(comments);
		for (const c of list) {
			byId.set(c.id, c);
			const pid = c.parentId || '__root__';
			if (!children.has(pid)) children.set(pid, []);
			children.get(pid).push(c);
		}

		const cmp = (a, b) => {
			const aMs = (typeof a?.createdAtMs === 'number' && Number.isFinite(a.createdAtMs)) ? a.createdAtMs : null;
			const bMs = (typeof b?.createdAtMs === 'number' && Number.isFinite(b.createdAtMs)) ? b.createdAtMs : null;
			if (aMs != null && bMs != null && aMs !== bMs) return aMs - bMs;
			if (aMs != null && bMs == null) return -1;
			if (aMs == null && bMs != null) return 1;
			const aIdx = typeof a?.orderIndex === 'number' ? a.orderIndex : 0;
			const bIdx = typeof b?.orderIndex === 'number' ? b.orderIndex : 0;
			return aIdx - bIdx;
		};
		for (const arr of children.values()) {
			arr.sort(cmp);
		}
		return { byId, children };
	};

	const renderComments = (comments) => {
		if (!commentListEl) return;
		commentListEl.innerHTML = '';

		const { children } = buildCommentTree(comments);
		const roots = children.get('__root__') || [];
		for (const root of roots) {
			const replies = children.get(root.id) || [];
			const replyTotal = replies.length;
			const likeTotal = toInt(root.likeTotal);
			const likedByMe = !!root.likedByMe;

			const rootEl = document.createElement('li');
			rootEl.className = 'blog-comment';
			rootEl.dataset.commentId = root.id;
			rootEl.innerHTML = `
				<img class="blog-comment-avatar" src="${root.avatarSrc || '/static/image/svg/free-sticker-profile.svg'}" alt="댓글 작성자">
				<div class="blog-comment-main">
					<div class="blog-comment-bubble">
						<div class="blog-comment-head">
							<span class="blog-comment-name"></span>
							<span class="blog-comment-time"></span>
						</div>
						<div class="blog-comment-text"></div>
					</div>
					<div class="blog-comment-actions" aria-label="댓글 액션">
						<button type="button" class="blog-comment-like-btn blog-comment-action" aria-label="좋아요" aria-pressed="false">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="blog-comment-action-icon" aria-hidden="true" focusable="false">
								<path fill="currentColor" d="M22.773,7.721A4.994,4.994,0,0,0,19,6H15.011l.336-2.041A3.037,3.037,0,0,0,9.626,2.122L8,5.417V21H18.3a5.024,5.024,0,0,0,4.951-4.3l.705-5A4.994,4.994,0,0,0,22.773,7.721Z"/>
								<path fill="currentColor" d="M0,11v5a5.006,5.006,0,0,0,5,5H6V6H5A5.006,5.006,0,0,0,0,11Z"/>
							</svg>
							<span class="blog-comment-action-count">0</span>
						</button>
						<button type="button" class="blog-comment-reply-btn blog-comment-action" aria-label="답글">
							<img src="/static/image/svg/insight/free-icon-comment-check.svg" alt="" class="blog-comment-action-icon" aria-hidden="true">
							<span class="blog-comment-action-count">0</span>
						</button>
					</div>
					<div class="blog-reply-form-wrap" hidden>
						<form class="blog-reply-form">
							<input type="text" class="blog-reply-input" placeholder="답글을 입력하세요" aria-label="답글 입력" autocomplete="off">
							<button type="submit" class="blog-reply-submit" aria-label="답글 등록">
								<img src="/static/image/svg/insight/free-icon-registration.svg" alt="" class="blog-submit-icon" aria-hidden="true">
							</button>
						</form>
					</div>
					<ul class="blog-replies" aria-label="대댓글" hidden></ul>
				</div>
			`;
			rootEl.querySelector('.blog-comment-name').textContent = root.author || '나';
			rootEl.querySelector('.blog-comment-time').textContent = root.timeLabel || '방금 전';
			rootEl.querySelector('.blog-comment-text').textContent = root.text || '';
			const likeBtn = rootEl.querySelector('.blog-comment-like-btn');
			if (likeBtn) {
				likeBtn.setAttribute('aria-pressed', likedByMe ? 'true' : 'false');
				likeBtn.classList.toggle('is-liked', likedByMe);
				const countEl = likeBtn.querySelector('.blog-comment-action-count');
				if (countEl) countEl.textContent = String(Math.max(0, likeTotal));
			}
			const replyBtn = rootEl.querySelector('.blog-comment-reply-btn');
			if (replyBtn) {
				const countEl = replyBtn.querySelector('.blog-comment-action-count');
				if (countEl) countEl.textContent = String(Math.max(0, replyTotal));
			}

			const repliesEl = rootEl.querySelector('.blog-replies');
			if (repliesEl && replies.length) {
				repliesEl.hidden = false;
				repliesEl.dataset.collapsed = String(replies.length > 5 ? 1 : 0);
				for (let i = 0; i < replies.length; i += 1) {
					const rep = replies[i];
					const repLi = document.createElement('li');
					repLi.className = 'blog-comment blog-comment-reply';
					repLi.dataset.commentId = rep.id;
					if (replies.length > 5 && i >= 5) {
						repLi.hidden = true;
						try { repLi.dataset.hiddenByLimit = '1'; } catch {}
					}
					repLi.innerHTML = `
						<img class="blog-comment-avatar" src="${rep.avatarSrc || '/static/image/svg/free-sticker-profile.svg'}" alt="대댓글 작성자">
						<div class="blog-comment-main">
							<div class="blog-comment-bubble">
								<div class="blog-comment-head">
									<span class="blog-comment-name"></span>
									<span class="blog-comment-time"></span>
								</div>
								<div class="blog-comment-text"></div>
							</div>
						</div>
					`;
					repLi.querySelector('.blog-comment-name').textContent = rep.author || '나';
					repLi.querySelector('.blog-comment-time').textContent = rep.timeLabel || '방금 전';
					repLi.querySelector('.blog-comment-text').textContent = rep.text || '';
					repliesEl.appendChild(repLi);
				}

				if (replies.length > 5) {
					const moreBtn = document.createElement('button');
					moreBtn.type = 'button';
					moreBtn.className = 'blog-replies-more';
					moreBtn.textContent = `더보기 (${replies.length - 5})`;
					repliesEl.insertAdjacentElement('afterend', moreBtn);
				}
			}

			commentListEl.appendChild(rootEl);
		}
	};

	const mapServerCommentsToUi = (items) => {
		const list = Array.isArray(items) ? items : [];
		return list.map((c) => ({
			id: String(c?.id ?? newLocalId()),
			parentId: c?.parentId != null ? String(c.parentId) : null,
			author: String(c?.authorName || '').trim() || '나',
			text: String(c?.content || '').trim(),
			timeLabel: formatTimeLabelFromIso(c?.createdAt),
			avatarSrc: String(c?.authorAvatarUrl || '').trim() || '/static/image/svg/free-sticker-profile.svg',
			createdAtMs: (typeof c?.createdAtMs === 'number' ? c.createdAtMs : null),
			likeTotal: (typeof c?.likeTotal === 'number' ? c.likeTotal : toInt(c?.likeTotal)),
			likedByMe: !!c?.likedByMe,
		}));
	};

	const loadServerCommentLikes = async (commentId) => {
		if (!postIdNum) return { ok: false, data: null };
		const cid = String(commentId || '').trim();
		if (!/^[0-9]+$/.test(cid)) return { ok: false, data: null };
		return await fetchJson(`${API_COMMENT_LIKES}/${postIdNum}/comments/${cid}/likes`, { method: 'GET' });
	};

	const likeServerComment = async (commentId) => {
		if (!postIdNum) return { ok: false, data: null };
		const cid = String(commentId || '').trim();
		if (!/^[0-9]+$/.test(cid)) return { ok: false, data: null };
		return await fetchJson(`${API_COMMENT_LIKES}/${postIdNum}/comments/${cid}/likes`, { method: 'POST' });
	};

	const unlikeServerComment = async (commentId) => {
		if (!postIdNum) return { ok: false, data: null };
		const cid = String(commentId || '').trim();
		if (!/^[0-9]+$/.test(cid)) return { ok: false, data: null };
		return await fetchJson(`${API_COMMENT_LIKES}/${postIdNum}/comments/${cid}/likes`, { method: 'DELETE' });
	};

	const loadServerComments = async () => {
		if (!postIdNum) return [];
		try {
			const res = await fetchJson(`${API_COMMENTS}/${postIdNum}/comments`, { method: 'GET' });
			if (!res.ok || !res.data?.success) return [];
			return mapServerCommentsToUi(res.data.items || []);
		} catch (e) {
			console.warn(e);
			return [];
		}
	};

	const createServerComment = async ({ text, parentId }) => {
		if (!postIdNum) return { ok: false };
		try {
			const res = await fetchJson(`${API_COMMENTS}/${postIdNum}/comments`, {
				method: 'POST',
				body: JSON.stringify({ content: text, parentId: parentId ?? null }),
			});
			return res;
		} catch (e) {
			console.warn(e);
			return { ok: false, status: 0, data: null };
		}
	};

	// Show a deterministic top image immediately (list-page behavior)
	// so the layout matches the design even before the API/localStorage loads.
	setPostImage('', pickFallbackInsightImage(postIdNum || postId || 'detail'));
	ensureImageEditButton();

	// Load post content when coming from list (via ?post=...)
	if (postId) {
		(async () => {
			// Primary: DB-backed API (numeric ids)
			if (postIdNum) {
				try {
					const res = await fetchJson(`${API_BASE}/${postIdNum}`, { method: 'GET' });
					if (res.ok && res.data?.success && res.data?.item) {
						const item = res.data.item;
						if (postAuthorEl) postAuthorEl.textContent = item.author || '나';
						if (postDeptEl) postDeptEl.textContent = item.authorDepartment || '부서 미지정';
						if (postTitleEl) postTitleEl.textContent = item.title || '';
						if (postContentEl) postContentEl.innerHTML = sanitizeHtml(item.contentHtml || '');
						if (postAvatarEl) {
							const avatarSrc = String(item.authorAvatarUrl || '').trim() || getHeaderAvatarSrc() || '/static/image/svg/profil/free-icon-bussiness-man.svg';
							postAvatarEl.src = avatarSrc;
						}
						setPostImage(item.imageDataUrl, pickFallbackInsightImage(postIdNum));
						ensureImageEditButton();
						if (postTimeEl) postTimeEl.textContent = formatTimeLabelFromIso(item.createdAt);
						renderAttachments(item.attachments || []);
						revealContentWithActions();
						return;
					}
				} catch (e) {
					console.warn(e);
				}
			}

			// Fallback: legacy localStorage posts
			const posts = loadPosts();
			const post = posts.find((p) => String(p.id) === String(postId));
			if (post) {
				if (postAuthorEl) postAuthorEl.textContent = post.author || '나';
				if (postDeptEl) postDeptEl.textContent = post.authorDepartment || '부서 미지정';
				if (postTitleEl) postTitleEl.textContent = post.title || '';
				if (postContentEl) postContentEl.innerHTML = sanitizeHtml(post.contentHtml || '');
				if (postAvatarEl) {
					const avatarSrc = String(post.avatarDataUrl || '').trim() || getHeaderAvatarSrc() || '/static/image/svg/profil/free-icon-bussiness-man.svg';
					postAvatarEl.src = avatarSrc;
				}
				setPostImage(post.imageDataUrl, pickFallbackInsightImage(postId));
				ensureImageEditButton();
				if (postTimeEl) postTimeEl.textContent = '방금 전';
				renderAttachments(post.attachments || []);
				revealContentWithActions();
			}
		})();
	}

	// Load persisted like/comment state (per post)
	let state = loadState();
	if (!state) {
		const initialComments = Array.from(commentListEl?.querySelectorAll('.blog-comment') || []).map((li) => ({
			id: li.dataset?.commentId || newLocalId(),
			parentId: null,
			author: li.querySelector('.blog-comment-name')?.textContent || '나',
			text: li.querySelector('.blog-comment-text')?.textContent || '',
			timeLabel: li.querySelector('.blog-comment-time')?.textContent || '',
			avatarSrc: li.querySelector('.blog-comment-avatar')?.getAttribute('src') || '/static/image/svg/free-sticker-profile.svg',
		}));
		state = {
			liked: likeBtn?.getAttribute('aria-pressed') === 'true',
			likeCount: toInt(likeCountEl?.textContent),
			comments: postIdNum ? [] : normalizeComments(initialComments),
			commentsOrder: 'asc',
		};
		saveState(state);
	} else {
		// For DB-backed posts, likes are server-side (shared across users).
		if (!postIdNum) {
			if (likeBtn) {
				likeBtn.setAttribute('aria-pressed', state.liked ? 'true' : 'false');
				likeBtn.classList.toggle('is-liked', !!state.liked);
			}
			setCount(likeCountEl, toInt(state.likeCount));
		}
		// For DB-backed posts, comments are server-side (shared across users).
		if (!postIdNum) {
			// Migrate legacy newest-first ordering (we previously used unshift())
			if ((state.commentsOrder || '') !== 'asc') {
				const raw = Array.isArray(state.comments) ? state.comments.slice().reverse() : [];
				state.commentsOrder = 'asc';
				state.comments = normalizeComments(raw);
				saveState(state);
			} else {
				state.comments = normalizeComments(state.comments || []);
			}
			setCount(commentCountEl, state.comments.length);
			renderComments(state.comments);
		}
	}

	if (likeBtn && likeCountEl) {
		likeBtn.addEventListener('click', () => {
			// DB-backed like: 1 vote per user, shared count
			if (postIdNum) {
				(async () => {
					const liked = likeBtn.getAttribute('aria-pressed') === 'true';
					const resp = liked ? await unlikeServer() : await likeServer();
					if (resp.ok && resp.data?.success) {
						setLikeUi({ liked: !!resp.data.likedByMe, total: resp.data.total });
						return;
					}
					if (resp.status === 401) {
						alert('로그인이 필요합니다.');
					}
				})();
				return;
			}

			const liked = likeBtn.getAttribute('aria-pressed') === 'true';
			const current = toInt(likeCountEl.textContent);
			const nextLiked = !liked;
			const nextCount = liked ? current - 1 : current + 1;

			likeBtn.setAttribute('aria-pressed', nextLiked ? 'true' : 'false');
			likeBtn.classList.toggle('is-liked', nextLiked);
			setCount(likeCountEl, nextCount);

			state = state || { liked: false, likeCount: 0, comments: [] };
			state.liked = nextLiked;
			state.likeCount = Math.max(0, nextCount);
			saveState(state);
		});
	}

	if (commentForm && commentInput && commentListEl && commentCountEl) {
		commentForm.addEventListener('submit', (e) => {
			e.preventDefault();
			const text = (commentInput.value || '').trim();
			if (!text) return;

			// DB-backed post: save on server so other users can see.
			if (postIdNum) {
				(async () => {
					const created = await createServerComment({ text, parentId: null });
					if (created.ok && created.data?.success) {
						const items = await loadServerComments();
						renderComments(items);
						setCount(commentCountEl, items.length);
						commentInput.value = '';
						return;
					}
					if (created.status === 401) {
						window.alert('로그인이 필요합니다.');
						return;
					}
					if (created.data?.message) {
						window.alert(String(created.data.message));
					}
				})();
				return;
			}

			const author = getHeaderUserName() || '나';
			const avatarSrc = getHeaderAvatarSrc() || '/static/image/svg/free-sticker-profile.svg';

			state = state || { liked: false, likeCount: 0, comments: [] };
			state.comments = Array.isArray(state.comments) ? state.comments : [];
			state.comments.push({
				id: newLocalId(),
				parentId: null,
				author,
				text,
				timeLabel: '방금 전',
				avatarSrc,
				createdAtMs: Date.now(),
			});
			saveState(state);

			renderComments(state.comments);
			setCount(commentCountEl, state.comments.length);
			commentInput.value = '';
		});
	}

	// Inline reply (대댓글)
	if (commentListEl && commentCountEl) {
		commentListEl.addEventListener('click', (e) => {
			const moreBtn = e.target?.closest?.('.blog-replies-more');
			if (moreBtn) {
				e.preventDefault();
				e.stopPropagation();
				const commentEl = moreBtn.closest('.blog-comment');
				const repliesEl = commentEl?.querySelector?.('.blog-replies');
				if (!repliesEl) return;
				const collapsed = repliesEl.dataset.collapsed === '1';
				repliesEl.dataset.collapsed = collapsed ? '0' : '1';
				const hiddenReplies = repliesEl.querySelectorAll('li[data-hidden-by-limit="1"]');
				hiddenReplies.forEach((li) => { li.hidden = !collapsed ? true : false; });
				moreBtn.textContent = collapsed ? '접기' : `더보기 (${hiddenReplies.length})`;
				return;
			}

			const likeBtn = e.target?.closest?.('.blog-comment-like-btn');
			if (likeBtn) {
				e.preventDefault();
				e.stopPropagation();
				const commentEl = likeBtn.closest('.blog-comment');
				const commentId = commentEl?.dataset?.commentId;
				const pressed = likeBtn.getAttribute('aria-pressed') === 'true';

				// DB-backed per-comment likes
				if (postIdNum && commentId) {
					(async () => {
						const res = pressed ? await unlikeServerComment(commentId) : await likeServerComment(commentId);
						if (!res.ok || !res.data?.success) {
							if (res.status === 401) {
								window.alert('로그인이 필요합니다.');
								return;
							}
							if (res.data?.message) {
								window.alert(String(res.data.message));
								return;
							}
							window.alert('댓글 좋아요 처리 중 오류가 발생했습니다.');
							return;
						}
						const total = toInt(res.data?.total);
						const liked = !!res.data?.likedByMe;
						likeBtn.setAttribute('aria-pressed', liked ? 'true' : 'false');
						likeBtn.classList.toggle('is-liked', liked);
						const countEl = likeBtn.querySelector('.blog-comment-action-count');
						if (countEl) countEl.textContent = String(Math.max(0, total));
					})();
					return;
				}

				// Legacy fallback: toggle UI only
				likeBtn.setAttribute('aria-pressed', pressed ? 'false' : 'true');
				likeBtn.classList.toggle('is-liked', !pressed);
				return;
			}

			const btn = e.target?.closest?.('.blog-comment-reply-btn');
			if (!btn) return;
			e.preventDefault();
			e.stopPropagation();
			const commentEl = btn.closest('.blog-comment');
			if (!commentEl) return;
			const wrap = commentEl.querySelector('.blog-reply-form-wrap');
			if (!wrap) return;
			wrap.hidden = !wrap.hidden;
			if (!wrap.hidden) {
				const input = wrap.querySelector('.blog-reply-input');
				if (input) input.focus();
			}
		});

		// NOTE: Use capture phase for submit so it works reliably even if submit
		// doesn't bubble in some environments.
		commentListEl.addEventListener('submit', (e) => {
			const form = e.target?.closest?.('.blog-reply-form');
			if (!form) return;
			e.preventDefault();
			const commentEl = form.closest('.blog-comment');
			const parentId = commentEl?.dataset?.commentId;
			const input = form.querySelector('.blog-reply-input');
			const text = (input?.value || '').trim();
			if (!parentId || !text) return;

			// DB-backed replies
			if (postIdNum) {
				(async () => {
					const created = await createServerComment({ text, parentId });
					if (created.ok && created.data?.success) {
						const items = await loadServerComments();
						renderComments(items);
						setCount(commentCountEl, items.length);
						input.value = '';
						return;
					}
					if (created.status === 401) {
						window.alert('로그인이 필요합니다.');
						return;
					}
					if (created.data?.message) {
						window.alert(String(created.data.message));
					}
				})();
				return;
			}

			const author = getHeaderUserName() || '나';
			const avatarSrc = getHeaderAvatarSrc() || '/static/image/svg/free-sticker-profile.svg';

			state = state || { liked: false, likeCount: 0, comments: [] };
			state.comments = normalizeComments(state.comments || []);
			state.comments.push({
				id: newLocalId(),
				parentId,
				author,
				text,
				timeLabel: '방금 전',
				avatarSrc,
				createdAtMs: Date.now(),
			});
			saveState(state);
			renderComments(state.comments);
			setCount(commentCountEl, state.comments.length);
			input.value = '';
		}, true);
	}

	// Initial load: DB-backed comments
	if (postIdNum && commentCountEl) {
		(async () => {
			const items = await loadServerComments();
			renderComments(items);
			setCount(commentCountEl, items.length);
		})();
	}

	// Initial load: DB-backed likes
	if (postIdNum && likeBtn && likeCountEl) {
		(async () => {
			const resp = await loadServerLikes();
			if (resp.ok && resp.data?.success) {
				setLikeUi({ liked: !!resp.data.likedByMe, total: resp.data.total });
			}
		})();
	}

	// --- Delete / Edit buttons ---
	const editBtnEl = document.getElementById('blog-post-edit-btn');
	const deleteBtnEl = document.getElementById('blog-post-delete-btn');
	const actionWrapEl = document.getElementById('blog-post-actions');
	const editModalEl = document.getElementById('blog-edit-modal');
	const editModalCloseEl = document.getElementById('blog-edit-close');
	const editModalConfirmEl = document.getElementById('blog-edit-confirm');
	const deleteModalEl = document.getElementById('insight-delete-modal');
	const deleteModalCloseEl = document.getElementById('insight-delete-close');
	const deleteModalConfirmEl = document.getElementById('insight-delete-confirm');
	const deleteSubtitleEl = document.getElementById('insight-delete-subtitle');
	let pendingDeletePostId = null;

	const isAdminUser = () => {
		return currentUserRole === 'ADMIN' || currentUserRole === 'ADMINISTRATOR' || currentUserRole === '관리자';
	};

	const setModalOpen = (modalId, open) => {
		if (!modalId) return;
		const el = document.getElementById(modalId);
		if (!el) return;
		if (open) {
			el.classList.add('show');
			el.setAttribute('aria-hidden', 'false');
			document.body.classList.add('modal-open');
		} else {
			el.classList.remove('show');
			el.setAttribute('aria-hidden', 'true');
			if (!document.querySelector('.modal-overlay-full.show'))
				document.body.classList.remove('modal-open');
		}
	};

	const canModifyPost = (author) => {
		const currentName = currentUserName || getHeaderUserName() || '나';
		const a = String(author || '').trim();
		if (!a) return false;
		if (a === '나' || a === currentName) return true;
		if (currentEmpNo && a === currentEmpNo) return true;
		return isAdminUser();
	};

	const deletePost = async (pId) => {
		if (!pId) return;
		try {
			// DB-backed
			if (postIdNum) {
				const res = await fetchJson(`${API_BASE}/${postIdNum}`, { method: 'DELETE' });
				if (res.ok && res.data?.success) {
					alert('삭제되었습니다.');
					// Redirect to list
					if (typeof blsSpaNavigate === 'function') {
						blsSpaNavigate('/p/insight_blog_it');
					} else {
						window.location.href = '/p/insight_blog_it';
					}
				} else {
					alert(res.data?.message || '삭제에 실패했습니다.');
				}
				return;
			}

			// localStorage-backed
			const posts = loadPosts();
			const idx = posts.findIndex((p) => String(p?.id) === String(pId));
			if (idx >= 0) {
				posts.splice(idx, 1);
				savePosts(posts);
				alert('삭제되었습니다.');
				if (typeof blsSpaNavigate === 'function') {
					blsSpaNavigate('/p/insight_blog_it');
				} else {
					window.location.href = '/p/insight_blog_it';
				}
			} else {
				alert('게시글을 찾을 수 없습니다.');
			}
		} catch (e) {
			console.warn(e);
			alert('삭제 중 오류가 발생했습니다.');
		}
	};

	// Initialize action buttons after post is loaded
	function revealContentWithActions() {
		const originalRevealContent = revealContent;
		originalRevealContent();
		// Show action buttons if user can modify
		const author = postAuthorEl?.textContent || '';
		if (canModifyPost(author) && actionWrapEl) {
			actionWrapEl.hidden = false;
			if (editBtnEl) editBtnEl.hidden = false;
			if (deleteBtnEl) deleteBtnEl.hidden = false;
		}
	}

	const openEditModal = () => setModalOpen('blog-edit-modal', true);
	const closeEditModal = () => setModalOpen('blog-edit-modal', false);
	const openDeleteModal = (pId) => {
		pendingDeletePostId = pId;
		if (deleteSubtitleEl) deleteSubtitleEl.textContent = '선택한 게시글을 정말 삭제하시겠습니까?';
		setModalOpen('insight-delete-modal', true);
	};
	const closeDeleteModal = () => {
		pendingDeletePostId = null;
		setModalOpen('insight-delete-modal', false);
	};

	if (deleteBtnEl) {
		deleteBtnEl.addEventListener('click', () => {
			openDeleteModal(postId);
		});
	}

	if (editBtnEl) {
		editBtnEl.addEventListener('click', () => {
			const author = postAuthorEl?.textContent || '';
			try {
				sessionStorage.setItem('blossom:blog:pending_edit_v1', JSON.stringify({ postId, author }));
			} catch (_e) { /* ignore */ }
			if (typeof blsSpaNavigate === 'function') {
				blsSpaNavigate('/p/insight_blog_it');
			} else {
				window.location.href = '/p/insight_blog_it';
			}
		});
	}

	deleteModalCloseEl?.addEventListener('click', closeDeleteModal);
	deleteModalEl?.addEventListener('click', (e) => {
		if (e.target === deleteModalEl) closeDeleteModal();
	});
	deleteModalConfirmEl?.addEventListener('click', async () => {
		if (!pendingDeletePostId) {
			closeDeleteModal();
			return;
		}
		const targetId = pendingDeletePostId;
		closeDeleteModal();
		await deletePost(targetId);
	});
});
