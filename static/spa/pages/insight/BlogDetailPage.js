/* BlogDetailPage — 블로그 포스트 상세 + 댓글 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';

export default class BlogDetailPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._id = params.id;
    this._el = null;
    this._post = null;
    this._comments = [];
    this._liked = false;
  }

  async mount(container) {
    this._el = container;
    await this._load();
  }

  unmount() {}

  async _load() {
    try {
      const [postRes, commentsRes, likeRes] = await Promise.all([
        api.get(`/api/insight/blog/posts/${this._id}`, { showError: false }),
        api.get(`/api/insight/blog/posts/${this._id}/comments`, { showError: false }).catch(() => ({ items: [] })),
        api.get(`/api/insight/blog/posts/${this._id}/likes`, { showError: false }).catch(() => ({ liked: false })),
      ]);
      this._post = postRes.item || postRes;
      this._comments = commentsRes.items || commentsRes.rows || [];
      this._liked = likeRes.liked || false;
    } catch {
      this._post = null;
    }
    this._render();
  }

  _render() {
    if (!this._post) {
      this._el.innerHTML = '<div class="spa-page"><div class="spa-empty">포스트를 찾을 수 없습니다.</div></div>';
      return;
    }
    const p = this._post;

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon" id="btn-back">← 블로그</button>
          <h2 class="spa-page__title">${esc(p.title||'')}</h2>
          <div class="spa-page-header__actions">
            <button class="spa-btn ${this._liked ? 'spa-btn--primary' : 'spa-btn--outline'}" id="btn-like">
              ${this._liked ? '❤' : '🤍'} ${p.like_count||0}
            </button>
            <button class="spa-btn spa-btn--outline" id="btn-edit">편집</button>
          </div>
        </div>

        <div class="spa-detail-meta">
          <span>작성자: <b>${esc(p.author_name||p.author||'')}</b></span>
          <span>작성일: <b>${esc(p.created_at||'')}</b></span>
          ${p.tags ? `<span>태그: ${(Array.isArray(p.tags) ? p.tags : [p.tags]).map(t => `<span class="spa-badge spa-badge--info">${esc(t)}</span>`).join(' ')}</span>` : ''}
        </div>

        ${p.image_url ? `<div class="spa-blog-hero"><img src="${esc(p.image_url)}" alt=""></div>` : ''}

        <div class="spa-content-body">
          ${p.content || p.body || ''}
        </div>

        ${(p.attachments && p.attachments.length) ? `
        <div class="spa-attachments">
          <h4>첨부파일</h4>
          ${p.attachments.map(a => `
            <a href="/api/insight/blog/posts/${this._id}/attachments/${encodeURIComponent(a.name || a.filename)}/download"
               class="spa-attachment-link" target="_blank">
              📎 ${esc(a.name || a.filename || '')}
            </a>`).join('')}
        </div>` : ''}

        <div class="spa-comments-section">
          <h3>댓글 (${this._comments.length})</h3>
          <div class="spa-comments">
            ${this._comments.length === 0 ? '<p class="spa-text-muted">댓글이 없습니다.</p>' :
              this._comments.map(c => `<div class="spa-comment">
                <div class="spa-comment__header">
                  <b>${esc(c.author_name||c.user_name||'')}</b>
                  <span class="spa-text-muted">${esc(c.created_at||'')}</span>
                </div>
                <p>${esc(c.content||c.text||'')}</p>
              </div>`).join('')}
          </div>
          <div class="spa-comment-form">
            <textarea class="spa-input" id="blog-comment" rows="2" placeholder="댓글 입력..."></textarea>
            <button class="spa-btn spa-btn--primary spa-btn--sm" id="blog-comment-add" style="margin-top:0.5rem">등록</button>
          </div>
        </div>
      </div>`;

    this._bind();
  }

  _bind() {
    this._el.querySelector('#btn-back')?.addEventListener('click', () => {
      this._router.navigate('/insight/blog');
    });
    this._el.querySelector('#btn-like')?.addEventListener('click', async () => {
      try {
        if (this._liked) {
          await api.delete(`/api/insight/blog/posts/${this._id}/likes`);
        } else {
          await api.post(`/api/insight/blog/posts/${this._id}/likes`, {});
        }
        await this._load();
      } catch { /* handled */ }
    });
    this._el.querySelector('#btn-edit')?.addEventListener('click', () => this._edit());
    this._el.querySelector('#blog-comment-add')?.addEventListener('click', async () => {
      const text = this._el.querySelector('#blog-comment')?.value?.trim();
      if (!text) return;
      try {
        await api.post(`/api/insight/blog/posts/${this._id}/comments`, { content: text });
        await this._load();
      } catch { /* handled */ }
    });
  }

  _edit() {
    const p = this._post;
    const box = this._el.querySelector('.spa-content-body');
    if (!box) return;
    box.innerHTML = `<div class="spa-admin-form">
      <label>제목 <input type="text" class="spa-input" id="ed-title" value="${esc(p.title||'')}"></label>
      <label>내용 <textarea class="spa-input" id="ed-content" rows="12">${esc(p.content||p.body||'')}</textarea></label>
      <label>태그 (쉼표 구분) <input type="text" class="spa-input" id="ed-tags" value="${esc(Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags||''))}"></label>
      <div style="margin-top:1rem">
        <button class="spa-btn spa-btn--primary" id="ed-save">저장</button>
        <button class="spa-btn spa-btn--outline" id="ed-cancel">취소</button>
      </div>
    </div>`;
    box.querySelector('#ed-save')?.addEventListener('click', async () => {
      try {
        await api.patch(`/api/insight/blog/posts/${this._id}`, {
          title: box.querySelector('#ed-title').value,
          content: box.querySelector('#ed-content').value,
          tags: box.querySelector('#ed-tags').value.split(',').map(t => t.trim()).filter(Boolean),
        });
        await this._load();
      } catch { /* handled */ }
    });
    box.querySelector('#ed-cancel')?.addEventListener('click', () => this._render());
  }
}
