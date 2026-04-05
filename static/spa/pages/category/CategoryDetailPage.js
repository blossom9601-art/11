/* CategoryDetailPage — 카테고리 항목 상세/편집 */

import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { LoadingSpinner, ErrorBoundary } from '../../widgets/LoadingSpinner.js';
import { Toast }      from '../../widgets/Toast.js';
import { fetchQuery, invalidate } from '../../shared/bq.js';

const DOMAIN_API = {
  'work':       '/api/work-categories',
  'hw-catalog': '/api/hw-server-types',
  'sw-catalog': '/api/sw-os-types',
  'component':  '/api/cmp-cpu-types',
  'company':    '/api/org-centers',
  'customer':   '/api/customer-members',
  'vendor':     '/api/vendor-manufacturers',
};

const HIDDEN_KEYS = new Set(['id', 'created_at', 'updated_at', 'deleted_at', 'is_deleted']);

export default class CategoryDetailPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._domain = params.domain || 'work';
    this._id     = params.id;
    this._apiBase = DOMAIN_API[this._domain] || DOMAIN_API.work;
    this._el     = null;
    this._item   = null;
    this._editing = false;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = LoadingSpinner.renderPage();
    await this._load();
  }

  unmount() {}

  async _load() {
    const res = await fetchQuery(
      ['category', this._domain, 'detail', this._id],
      () => api.get(`${this._apiBase}/${this._id}`, { showError: false })
    );

    if (!res || (res.success === false && !res.item)) {
      ErrorBoundary.mount(this._el, res?.error || '데이터를 찾을 수 없습니다.', () => this._load());
      return;
    }

    this._item = res.item || res;
    this._render();
  }

  _render() {
    const item = this._item;
    const keys = Object.keys(item).filter(k => !k.startsWith('_') && !HIDDEN_KEYS.has(k));

    const fields = this._editing
      ? keys.map(k => `
          <div class="spa-form-group">
            <label class="spa-form-label">${esc(k)}</label>
            <input name="${esc(k)}" class="spa-input" value="${esc(String(item[k] ?? ''))}" />
          </div>`).join('')
      : keys.map(k => `
          <div class="spa-summary-item">
            <span class="spa-summary-label">${esc(k)}</span>
            <span class="spa-summary-value">${esc(String(item[k] ?? '-'))}</span>
          </div>`).join('');

    this._el.innerHTML = `
      <div class="spa-page spa-detail-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 돌아가기</button>
          <h2 class="spa-page__title">카테고리 상세</h2>
          <div class="spa-page-actions">
            ${this._editing
              ? `<button class="spa-btn spa-btn--outline" id="btn-cancel">취소</button>
                 <button class="spa-btn spa-btn--primary" id="btn-save">저장</button>`
              : `<button class="spa-btn spa-btn--outline" id="btn-edit">수정</button>`}
          </div>
        </div>
        ${this._editing
          ? `<form id="edit-form" class="spa-form spa-form-col-2" style="margin-top:1rem">${fields}</form>`
          : `<div class="spa-detail-summary">${fields}</div>`}
      </div>`;

    this._el.querySelector('#btn-back').addEventListener('click', () => {
      this._router.navigate('/category/' + this._domain);
    });

    if (this._editing) {
      this._el.querySelector('#btn-cancel').addEventListener('click', () => {
        this._editing = false;
        this._render();
      });
      this._el.querySelector('#btn-save').addEventListener('click', () => this._save());
    } else {
      this._el.querySelector('#btn-edit')?.addEventListener('click', () => {
        this._editing = true;
        this._render();
      });
    }
  }

  async _save() {
    const form = this._el.querySelector('#edit-form');
    if (!form) return;
    const data = Object.fromEntries(new FormData(form));
    try {
      await api.put(`${this._apiBase}/${this._id}`, data);
      Toast.success('저장 완료');
      this._editing = false;
      invalidate(['category', this._domain, 'detail', this._id]);
      await this._load();
    } catch (e) {
      Toast.error(e.message || '저장 실패');
    }
  }
}
