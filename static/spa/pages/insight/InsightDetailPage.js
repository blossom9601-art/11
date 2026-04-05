/* InsightDetailPage — 인사이트 아이템 상세 + CRUD */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';

export default class InsightDetailPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._id = params.id;
    this._el = null;
    this._item = null;
    this._liked = false;
  }

  async mount(container) {
    this._el = container;
    await this._load();
  }

  unmount() {}

  async _load() {
    try {
      const [itemRes, likeRes] = await Promise.all([
        api.get(`/api/insight/items/${this._id}`, { showError: false }),
        api.get(`/api/insight/items/${this._id}/likes/me`, { showError: false }).catch(() => ({ liked: false })),
      ]);
      this._item = itemRes.item || itemRes;
      this._liked = likeRes.liked || false;
      // Record view
      api.post(`/api/insight/items/${this._id}/views`, {}).catch(() => {});
    } catch {
      this._item = null;
    }
    this._render();
  }

  _render() {
    if (!this._item) {
      this._el.innerHTML = '<div class="spa-page"><div class="spa-empty">아이템을 찾을 수 없습니다.</div></div>';
      return;
    }
    const item = this._item;

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon" id="btn-back">← 목록</button>
          <h2 class="spa-page__title">${esc(item.title||'')}</h2>
          <div class="spa-page-header__actions">
            <button class="spa-btn ${this._liked ? 'spa-btn--primary' : 'spa-btn--outline'}" id="btn-like">
              ${this._liked ? '❤ 좋아요 취소' : '🤍 좋아요'}
            </button>
            <button class="spa-btn spa-btn--outline" id="btn-edit">편집</button>
            <button class="spa-btn spa-btn--danger-outline" id="btn-del">삭제</button>
          </div>
        </div>

        <div class="spa-detail-meta">
          <span>카테고리: <b>${esc(item.category||'')}</b></span>
          <span>조회수: <b>${item.view_count||0}</b></span>
          <span>좋아요: <b>${item.like_count||0}</b></span>
          <span>작성자: <b>${esc(item.author_name||item.created_by||'')}</b></span>
          <span>작성일: <b>${esc(item.created_at||'')}</b></span>
        </div>

        <div class="spa-content-body">
          ${item.content || item.body || '<p class="spa-text-muted">내용이 없습니다.</p>'}
        </div>

        ${(item.attachments && item.attachments.length > 0) ? `
        <div class="spa-attachments">
          <h4>첨부파일</h4>
          ${item.attachments.map(a => `
            <a href="/api/insight/items/${this._id}/attachments/${a.id}/download" class="spa-attachment-link" target="_blank">
              📎 ${esc(a.filename || a.name || '')}
            </a>`).join('')}
        </div>` : ''}
      </div>`;

    this._el.querySelector('#btn-back')?.addEventListener('click', () => {
      this._router.navigate('/insight');
    });
    this._el.querySelector('#btn-like')?.addEventListener('click', () => this._toggleLike());
    this._el.querySelector('#btn-edit')?.addEventListener('click', () => this._edit());
    this._el.querySelector('#btn-del')?.addEventListener('click', () => this._delete());
  }

  async _toggleLike() {
    try {
      if (this._liked) {
        await api.delete(`/api/insight/items/${this._id}/likes`);
      } else {
        await api.post(`/api/insight/items/${this._id}/likes`, {});
      }
      this._liked = !this._liked;
      this._render();
    } catch { /* handled */ }
  }

  _edit() {
    const item = this._item;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header"><h2 class="spa-page__title">인사이트 편집</h2></div>
        <div class="spa-admin-form" style="max-width:700px">
          <label>제목 <input type="text" class="spa-input" id="ed-title" value="${esc(item.title||'')}"></label>
          <label>카테고리
            <select class="spa-input" id="ed-cat">
              ${['trend','security','report','technical'].map(c =>
                `<option value="${c}" ${item.category === c ? 'selected' : ''}>${c}</option>`
              ).join('')}
            </select>
          </label>
          <label>내용 <textarea class="spa-input" id="ed-content" rows="12">${esc(item.content||item.body||'')}</textarea></label>
          <div style="margin-top:1rem">
            <button class="spa-btn spa-btn--primary" id="ed-save">저장</button>
            <button class="spa-btn spa-btn--outline" id="ed-cancel">취소</button>
          </div>
        </div>
      </div>`;
    this._el.querySelector('#ed-save')?.addEventListener('click', async () => {
      try {
        await api.patch(`/api/insight/items/${this._id}`, {
          title: this._el.querySelector('#ed-title').value,
          category: this._el.querySelector('#ed-cat').value,
          content: this._el.querySelector('#ed-content').value,
        });
        await this._load();
      } catch { /* handled */ }
    });
    this._el.querySelector('#ed-cancel')?.addEventListener('click', () => this._render());
  }

  async _delete() {
    if (!confirm('이 아이템을 삭제하시겠습니까?')) return;
    try {
      await api.delete(`/api/insight/items/${this._id}`);
      this._router.navigate('/insight');
    } catch { /* handled */ }
  }
}
