/* InsightItemDetailPage — 인사이트 항목 상세 (트렌드/보안/보고서/기술) */
import { api }            from '../../shared/api-client.js';
import { esc }            from '../../shared/dom-utils.js';
import { LoadingSpinner } from '../../widgets/LoadingSpinner.js';

const CATEGORY_LABEL = { trend: '트렌드', security: '보안', report: '보고서', technical: '기술' };

export default class InsightItemDetailPage {
  constructor({ params, query, router }) {
    this._router   = router;
    this._section  = params.section || 'trend';
    this._id       = params.id;
    this._el       = null;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = LoadingSpinner.renderPage();
    try {
      const res = await api.get('/api/insight/items/' + this._id);
      this._render(res.item || res);
    } catch {
      this._el.innerHTML = '<div class="spa-page"><p class="spa-text-muted">게시글을 불러올 수 없습니다.</p></div>';
    }
  }

  unmount() {}

  _render(item) {
    const cat = CATEGORY_LABEL[item.category] || item.category || '';
    this._el.innerHTML = `
      <div class="spa-page spa-detail-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← ${esc(cat || '인사이트')}</button>
          <h2 class="spa-page__title">${esc(item.title || '')}</h2>
        </div>
        <div class="spa-detail-grid" style="max-width:720px;margin-bottom:2rem">
          <div class="spa-detail-field">
            <span class="spa-detail-field__label">작성자</span>
            <span class="spa-detail-field__value">${esc(item.author || '-')}</span>
          </div>
          <div class="spa-detail-field">
            <span class="spa-detail-field__label">분류</span>
            <span class="spa-detail-field__value">${esc(cat || '-')}</span>
          </div>
          <div class="spa-detail-field">
            <span class="spa-detail-field__label">작성일</span>
            <span class="spa-detail-field__value">${esc((item.created_at || '').slice(0, 10) || '-')}</span>
          </div>
          <div class="spa-detail-field">
            <span class="spa-detail-field__label">조회</span>
            <span class="spa-detail-field__value">${item.views ?? 0}</span>
          </div>
          <div class="spa-detail-field">
            <span class="spa-detail-field__label">좋아요</span>
            <span class="spa-detail-field__value">${item.likes ?? 0}</span>
          </div>
          <div class="spa-detail-field">
            <span class="spa-detail-field__label">태그</span>
            <span class="spa-detail-field__value">${esc(item.tags || '-')}</span>
          </div>
        </div>
        <div class="spa-content-html" style="max-width:720px;line-height:1.7">
          ${item.content_html || '<p class="spa-text-muted">내용이 없습니다.</p>'}
        </div>
      </div>`;

    this._el.querySelector('#btn-back').addEventListener('click',
      () => this._router.navigate('/insight/' + (item.category || this._section)));
  }
}
