/* InsightPage — 인사이트 (트렌드/보안/보고서/기술) + IT 블로그 */

import { api }  from '../../shared/api-client.js';
import { esc }  from '../../shared/dom-utils.js';
import { fetchQuery } from '../../shared/bq.js';

const CATEGORIES = [
  { key: 'trend',     label: '트렌드',   icon: '📈' },
  { key: 'security',  label: '보안',     icon: '🔐' },
  { key: 'report',    label: '보고서',   icon: '📄' },
  { key: 'technical', label: '기술',     icon: '⚙️' },
  { key: 'blog',      label: 'IT 블로그', icon: '✍️' },
];

export default class InsightPage {
  constructor({ params, query, router }) {
    this._router  = router;
    this._section = params.section || 'trend';
    this._el      = null;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">인사이트</h2>
        </div>
        <div class="spa-scope-tabs" id="insight-tabs" style="margin-bottom:16px">
          ${CATEGORIES.map(c =>
            `<button class="spa-scope-tab${c.key === this._section ? ' active' : ''}" data-cat="${c.key}">${c.icon} ${esc(c.label)}</button>`
          ).join('')}
        </div>
        <div id="insight-content"><p class="spa-text-muted">로딩 중...</p></div>
      </div>`;

    this._el.querySelector('#insight-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat]');
      if (btn && btn.dataset.cat !== this._section) {
        this._section = btn.dataset.cat;
        this._el.querySelectorAll('.spa-scope-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._loadContent();
      }
    });

    await this._loadContent();
  }

  unmount() {}

  async _loadContent() {
    const content = this._el.querySelector('#insight-content');
    content.innerHTML = '<p class="spa-text-muted">로딩 중...</p>';

    try {
      let items;
      if (this._section === 'blog') {
        const res = await api.get('/api/insight/blog/posts?limit=30', { showError: false });
        items = res.items || res.posts || [];
      } else {
        const res = await api.get(`/api/insight/items?category=${this._section}&limit=30`, { showError: false });
        items = res.items || [];
      }

      if (items.length === 0) {
        content.innerHTML = '<p class="spa-text-muted">등록된 게시글이 없습니다.</p>';
        return;
      }

      content.innerHTML = `<div class="spa-insight-list">
        ${items.map(item => `
          <div class="spa-insight-card">
            <h4 class="spa-insight-card__title">${esc(item.title || '-')}</h4>
            <div class="spa-insight-card__meta">
              <span>${esc(item.author || item.author_name || '-')}</span>
              <span>${esc((item.created_at || '').slice(0, 10))}</span>
              ${item.view_count != null ? `<span>조회 ${item.view_count}</span>` : ''}
              ${item.like_count != null ? `<span>좋아요 ${item.like_count}</span>` : ''}
            </div>
            ${item.tags ? `<div class="spa-insight-card__tags">${(Array.isArray(item.tags) ? item.tags : [item.tags]).map(t => `<span class="spa-badge spa-badge--secondary">${esc(t)}</span>`).join(' ')}</div>` : ''}
          </div>`).join('')}
      </div>`;
    } catch (e) {
      content.innerHTML = '<p class="spa-text-muted">데이터를 불러올 수 없습니다.</p>';
    }
  }
}
