/* WorkflowListPage — 워크플로우 설계 목록 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';
import { Modal } from '../../widgets/Modal.js';

const ST = { draft: '초안', published: '게시됨' };

export default class WorkflowListPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
    this._items = [];
    this._search = '';
    this._page = 1;
    this._total = 0;
  }

  async mount(container) {
    this._el = container;
    await this._load();
  }

  unmount() {}

  async _load() {
    try {
      const res = await api.get(`/api/wf-designs?page=${this._page}&per_page=20&search=${encodeURIComponent(this._search)}`, { showError: false });
      this._items = res.items || res.rows || [];
      this._total = res.total || this._items.length;
    } catch {
      this._items = [];
      this._total = 0;
    }
    this._render();
  }

  _render() {
    const rows = this._items;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">워크플로우 설계</h2>
          <div class="spa-page-header__actions">
            <input type="text" class="spa-input" id="wf-search" placeholder="워크플로우 검색..." value="${esc(this._search)}" style="width:220px">
            <button class="spa-btn spa-btn--outline" id="wf-export">CSV 내보내기</button>
            <button class="spa-btn spa-btn--primary" id="wf-new">+ 새 워크플로우</button>
          </div>
        </div>

        <div class="spa-stats-bar"><span class="spa-text-muted">총 ${this._total}건</span></div>

        ${rows.length === 0 ? '<div class="spa-empty">워크플로우가 없습니다.</div>' : `
        <div class="spa-admin-cards spa-workflow-grid">
          ${rows.map(w => `<div class="spa-workflow-card" data-id="${esc(w.id||'')}">
            <div class="spa-workflow-card__thumb">
              ${w.thumbnail_url ? `<img src="${esc(w.thumbnail_url)}" alt="">` : '<div class="spa-workflow-card__thumb-placeholder">📊</div>'}
            </div>
            <div class="spa-workflow-card__body">
              <h4>${esc(w.name||'')}</h4>
              <p class="spa-text-muted">${esc(w.description||'')}</p>
              <div class="spa-workflow-card__meta">
                <span class="spa-badge spa-badge--${w.status === 'published' ? 'success' : 'muted'}">${ST[w.status]||esc(w.status||'초안')}</span>
                <span class="spa-text-muted">v${w.latest_version||1}</span>
                ${w.like_count ? `<span>❤ ${w.like_count}</span>` : ''}
                ${w.view_count ? `<span>👁 ${w.view_count}</span>` : ''}
              </div>
            </div>
          </div>`).join('')}
        </div>`}
      </div>`;

    this._bind();
  }

  _bind() {
    this._el.querySelector('#wf-search')?.addEventListener('input', e => {
      this._search = e.target.value;
      this._page = 1;
      this._load();
    });
    this._el.querySelector('#wf-new')?.addEventListener('click', () => this._create());
    this._el.querySelector('#wf-export')?.addEventListener('click', () => this._exportCsv());
    this._el.querySelectorAll('[data-id]').forEach(card => {
      card.addEventListener('click', () => {
        this._router.navigate('/work/workflows/' + card.dataset.id);
      });
    });
  }

  _create() {
    const modal = new Modal({
      title: '새 워크플로우',
      content: '<div class="spa-form-group"><label class="spa-label">워크플로우 이름</label><input type="text" class="spa-input" id="modal-name" placeholder="워크플로우 이름을 입력하세요" autofocus></div>',
      size: 'sm',
      confirmText: '생성',
      onConfirm: async () => {
        const name = modal._el.querySelector('#modal-name')?.value?.trim();
        if (!name) return;
        modal.close();
        try {
          const res = await api.post('/api/wf-designs', { name, description: '' });
          if (res.item?.id || res.id) {
            this._router.navigate('/work/workflows/' + (res.item?.id || res.id));
          } else {
            await this._load();
          }
        } catch { /* handled */ }
      },
    });
    modal.open();
  }

  _exportCsv() {
    const rows = this._items;
    const header = ['이름','설명','상태','버전','조회수','좋아요'];
    const lines = rows.map(r =>
      [r.name, r.description, ST[r.status]||r.status, r.latest_version||1, r.view_count||0, r.like_count||0]
        .map(v => `"${String(v||'').replace(/"/g,'""')}"`)
        .join(',')
    );
    const csv = '\uFEFF' + header.join(',') + '\n' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = '워크플로우_목록.csv';
    a.click(); URL.revokeObjectURL(a.href);
  }
}
