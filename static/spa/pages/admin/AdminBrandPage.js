/* AdminBrandPage — 브랜드 설정 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';

export default class AdminBrandPage {
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
    const res = await api.get('/api/brand-settings', { showError: false });
    this._items = res.items || res.rows || [];
    this._render();
  }

  _get(key) {
    const item = this._items.find(i => i.key === key);
    return item ? item.value || '' : '';
  }

  _render() {
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">브랜드 설정</h2>
        </div>
        <form id="adm-brand-form" class="spa-admin-form">
          <div class="spa-form-grid">
            <label>사이트 제목 <input class="spa-input" name="site_title" value="${esc(this._get('site_title'))}"></label>
            <label>사이트 부제 <input class="spa-input" name="site_subtitle" value="${esc(this._get('site_subtitle'))}"></label>
            <label>로고 URL <input class="spa-input" name="logo_url" value="${esc(this._get('logo_url'))}"></label>
            <label>파비콘 URL <input class="spa-input" name="favicon_url" value="${esc(this._get('favicon_url'))}"></label>
            <label>주 색상 <input class="spa-input" name="primary_color" type="color" value="${this._get('primary_color') || '#4f46e5'}"></label>
            <label>보조 색상 <input class="spa-input" name="secondary_color" type="color" value="${this._get('secondary_color') || '#6366f1'}"></label>
            <label>푸터 텍스트 <input class="spa-input" name="footer_text" value="${esc(this._get('footer_text'))}"></label>
            <label>저작권 <input class="spa-input" name="copyright" value="${esc(this._get('copyright'))}"></label>
          </div>
          ${this._get('logo_url') ? `<div class="spa-brand-preview"><img src="${esc(this._get('logo_url'))}" alt="로고 미리보기" style="max-height:60px"></div>` : ''}
          <div class="spa-form-actions">
            <button type="submit" class="spa-btn spa-btn--primary">저장</button>
          </div>
        </form>
      </div>`;

    this._el.querySelector('#adm-brand-form').addEventListener('submit', (e) => this._save(e));
  }

  async _save(e) {
    e.preventDefault();
    const form = e.target;
    const settings = {};
    form.querySelectorAll('.spa-input').forEach(el => {
      settings[el.name] = el.value;
    });
    await api.post('/api/brand-settings', settings);
    await this._load();
  }

}
