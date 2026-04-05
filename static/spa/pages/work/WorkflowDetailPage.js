/* WorkflowDetailPage — 워크플로우 상세 + 버전 관리 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';

export default class WorkflowDetailPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._id = params.id;
    this._el = null;
    this._wf = null;
    this._versions = [];
    this._comments = [];
    this._tab = 'info';
  }

  async mount(container) {
    this._el = container;
    await this._load();
  }

  unmount() {}

  async _load() {
    try {
      const res = await api.get(`/api/wf-designs/${this._id}`, { showError: false });
      this._wf = res.item || res;
    } catch {
      this._wf = null;
    }
    this._render();
  }

  _render() {
    if (!this._wf) {
      this._el.innerHTML = '<div class="spa-page"><div class="spa-empty">워크플로우를 찾을 수 없습니다.</div></div>';
      return;
    }
    const wf = this._wf;

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon" id="btn-back">← 목록</button>
          <h2 class="spa-page__title">${esc(wf.name||'워크플로우')}</h2>
          <div class="spa-page-header__actions">
            <span class="spa-badge spa-badge--${wf.status === 'published' ? 'success' : 'muted'}">${wf.status === 'published' ? '게시됨' : '초안'}</span>
            ${wf.status !== 'published' ? '<button class="spa-btn spa-btn--primary" data-action="publish">게시</button>' : ''}
            <button class="spa-btn spa-btn--outline" data-action="edit">편집</button>
          </div>
        </div>

        <div class="spa-tab-bar">
          ${['info','versions','comments'].map(t => `<button class="spa-tab-btn ${this._tab === t ? 'active' : ''}" data-tab="${t}">${{info:'기본 정보',versions:'버전 이력',comments:'댓글'}[t]}</button>`).join('')}
        </div>

        <div id="wf-tab-content"></div>
      </div>`;

    this._el.querySelector('#btn-back')?.addEventListener('click', () => {
      this._router.navigate('/work/workflows');
    });
    this._el.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => { this._tab = btn.dataset.tab; this._render(); });
    });
    this._el.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => this._handleAction(btn.dataset.action));
    });

    this._renderTab();
  }

  async _renderTab() {
    const box = this._el.querySelector('#wf-tab-content');
    if (!box) return;
    const wf = this._wf;

    switch (this._tab) {
      case 'info':
        box.innerHTML = `<div class="spa-detail-card">
          <div class="spa-detail-row"><span class="spa-detail-label">이름</span><span class="spa-detail-value">${esc(wf.name||'')}</span></div>
          <div class="spa-detail-row"><span class="spa-detail-label">설명</span><span class="spa-detail-value">${esc(wf.description||'-')}</span></div>
          <div class="spa-detail-row"><span class="spa-detail-label">상태</span><span class="spa-detail-value">${wf.status === 'published' ? '게시됨' : '초안'}</span></div>
          <div class="spa-detail-row"><span class="spa-detail-label">최신 버전</span><span class="spa-detail-value">v${wf.latest_version||1}</span></div>
          <div class="spa-detail-row"><span class="spa-detail-label">공유</span><span class="spa-detail-value">${wf.shared ? '공개' : '비공개'}</span></div>
          <div class="spa-detail-row"><span class="spa-detail-label">생성일</span><span class="spa-detail-value">${esc(wf.created_at||'-')}</span></div>
        </div>
        ${wf.thumbnail_url ? `<div style="margin-top:1rem"><img src="${esc(wf.thumbnail_url)}" style="max-width:100%;border-radius:8px"></div>` : ''}`;
        break;

      case 'versions':
        await this._loadVersions(box);
        break;

      case 'comments':
        await this._loadComments(box);
        break;
    }
  }

  async _loadVersions(box) {
    try {
      const res = await api.get(`/api/wf-designs/${this._id}/versions`, { showError: false });
      this._versions = res.items || res.rows || [];
    } catch {
      this._versions = [];
    }
    box.innerHTML = `<div class="spa-admin-table-wrap">
      <table class="spa-dt-table">
        <thead><tr><th>버전</th><th>생성자</th><th>생성일</th></tr></thead>
        <tbody>${this._versions.length === 0 ? '<tr><td colspan="3" class="spa-text-muted" style="text-align:center">버전 이력이 없습니다.</td></tr>' :
          this._versions.map(v => `<tr>
            <td>v${v.version_number||v.version||''}</td>
            <td>${esc(v.created_by_name||v.created_by||'')}</td>
            <td>${esc(v.created_at||'')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:0.75rem">
      <button class="spa-btn spa-btn--outline" id="wf-new-version">+ 새 버전</button>
    </div>`;
    box.querySelector('#wf-new-version')?.addEventListener('click', async () => {
      try {
        await api.post(`/api/wf-designs/${this._id}/versions`, { definition_json: {} });
        await this._loadVersions(box);
      } catch { /* handled */ }
    });
  }

  async _loadComments(box) {
    try {
      const res = await api.get(`/api/wf-designs/${this._id}/comments`, { showError: false });
      this._comments = res.items || res.rows || [];
    } catch {
      this._comments = [];
    }
    box.innerHTML = `
      <div class="spa-comments">
        ${this._comments.length === 0 ? '<p class="spa-text-muted">댓글이 없습니다.</p>' :
          this._comments.map(c => `<div class="spa-comment">
            <div class="spa-comment__header"><b>${esc(c.author_name||c.user_name||'')}</b> <span class="spa-text-muted">${esc(c.created_at||'')}</span></div>
            <p>${esc(c.content||c.text||'')}</p>
          </div>`).join('')}
      </div>
      <div class="spa-comment-form">
        <textarea class="spa-input" id="wf-comment" rows="2" placeholder="댓글 입력..."></textarea>
        <button class="spa-btn spa-btn--primary spa-btn--sm" id="wf-comment-add" style="margin-top:0.5rem">등록</button>
      </div>`;
    box.querySelector('#wf-comment-add')?.addEventListener('click', async () => {
      const text = box.querySelector('#wf-comment')?.value?.trim();
      if (!text) return;
      try {
        await api.post(`/api/wf-designs/${this._id}/comments`, { content: text });
        await this._loadComments(box);
      } catch { /* handled */ }
    });
  }

  async _handleAction(action) {
    if (action === 'publish') {
      if (!confirm('워크플로우를 게시하시겠습니까?')) return;
      try {
        await api.put(`/api/wf-designs/${this._id}/live`, {});
        await this._load();
      } catch { /* handled */ }
    } else if (action === 'edit') {
      this._editInfo();
    }
  }

  _editInfo() {
    const wf = this._wf;
    const box = this._el.querySelector('#wf-tab-content');
    box.innerHTML = `<div class="spa-admin-form" style="max-width:500px">
      <label>이름 <input type="text" class="spa-input" id="ed-name" value="${esc(wf.name||'')}"></label>
      <label>설명 <textarea class="spa-input" id="ed-desc" rows="3">${esc(wf.description||'')}</textarea></label>
      <label><input type="checkbox" id="ed-shared" ${wf.shared ? 'checked' : ''}> 공개</label>
      <div style="margin-top:1rem">
        <button class="spa-btn spa-btn--primary" id="ed-save">저장</button>
        <button class="spa-btn spa-btn--outline" id="ed-cancel">취소</button>
      </div>
    </div>`;
    box.querySelector('#ed-save')?.addEventListener('click', async () => {
      try {
        await api.put(`/api/wf-designs/${this._id}`, {
          name: box.querySelector('#ed-name').value,
          description: box.querySelector('#ed-desc').value,
          shared: box.querySelector('#ed-shared').checked,
        });
        await this._load();
      } catch { /* handled */ }
    });
    box.querySelector('#ed-cancel')?.addEventListener('click', () => this._render());
  }
}
