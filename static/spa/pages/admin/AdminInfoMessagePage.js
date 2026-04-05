/* AdminInfoMessagePage — 문구 관리 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';
import { Modal } from '../../widgets/Modal.js';

export default class AdminInfoMessagePage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
    this._items = [];
  }

  async mount(container) {
    this._el = container;
    await this._load();
  }

  unmount() {}

  async _load() {
    const res = await api.get('/api/info-messages', { showError: false });
    this._items = res.items || res.rows || [];
    this._render();
  }

  _render() {
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">문구 관리 (${this._items.length})</h2>
          <button class="spa-btn spa-btn--primary" id="adm-msg-add">+ 문구 추가</button>
        </div>
        <div class="spa-admin-table-wrap">
          <table class="spa-dt-table">
            <thead><tr><th>메뉴</th><th>카테고리</th><th>제목</th><th>활성</th><th>작업</th></tr></thead>
            <tbody>
              ${this._items.length === 0 ? '<tr><td colspan="5" class="spa-text-muted" style="text-align:center">등록된 문구가 없습니다.</td></tr>' :
                this._items.map(m => `<tr>
                  <td>${esc(m.menu_key || '')}</td>
                  <td>${esc(m.main_category_name || '')}</td>
                  <td>${esc(m.info_title || '')}</td>
                  <td>${m.is_enabled ? '<span class="spa-badge spa-badge--success">활성</span>' : '<span class="spa-badge spa-badge--muted">비활성</span>'}</td>
                  <td class="spa-admin-actions">
                    <button class="spa-btn spa-btn--sm spa-btn--outline" data-toggle="${m.id}">토글</button>
                    <button class="spa-btn spa-btn--sm spa-btn--danger-outline" data-del-msg="${m.id}">삭제</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    this._el.querySelector('#adm-msg-add')?.addEventListener('click', () => this._addMessage());
    this._el.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', () => this._toggle(parseInt(btn.dataset.toggle)));
    });
    this._el.querySelectorAll('[data-del-msg]').forEach(btn => {
      btn.addEventListener('click', () => this._delete(parseInt(btn.dataset.delMsg)));
    });
  }

  async _toggle(id) {
    await api.put(`/api/info-messages/${id}/toggle`);
    await this._load();
  }

  async _delete(id) {
    if (!confirm('이 문구를 삭제하시겠습니까?')) return;
    await api.post('/api/info-messages/bulk-delete', { ids: [id] });
    await this._load();
  }

  async _addMessage() {
    const modal = new Modal({
      title: '문구 추가',
      content: `<div class="spa-form-group"><label class="spa-label">제목</label><input type="text" class="spa-input" id="modal-title" placeholder="문구 제목" autofocus></div>
        <div class="spa-form-group"><label class="spa-label">내용</label><textarea class="spa-input" id="modal-content" rows="3" placeholder="문구 내용"></textarea></div>`,
      size: 'sm',
      confirmText: '등록',
      onConfirm: async () => {
        const title = modal._el.querySelector('#modal-title')?.value?.trim();
        if (!title) return;
        const content = modal._el.querySelector('#modal-content')?.value || '';
        modal.close();
        await api.post('/api/info-messages', { info_title: title, info_content: content, menu_key: 'general', is_enabled: true });
        await this._load();
      },
    });
    modal.open();
  }
}
