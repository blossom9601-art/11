/* SettingsVersionPage — 시스템 버전 정보 */
import { api }            from '../../shared/api-client.js';
import { esc }            from '../../shared/dom-utils.js';
import { LoadingSpinner } from '../../widgets/LoadingSpinner.js';

export default class SettingsVersionPage {
  constructor({ params, query, router }) { this._router = router; this._el = null; }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = LoadingSpinner.renderPage();
    try {
      const [ver, notes] = await Promise.all([
        api.get('/api/version', { showError: false }).catch(() => ({})),
        api.get('/api/release-notes', { showError: false }).catch(() => ({ notes: [] })),
      ]);
      this._render(ver, notes);
    } catch {
      this._el.innerHTML = '<div class="spa-page"><p class="spa-text-muted">버전 정보를 불러올 수 없습니다.</p></div>';
    }
  }

  unmount() {}

  _render(ver, notes) {
    const v = ver.item || ver;
    const releaseNotes = notes.notes || notes.items || [];

    const infoRows = [
      ['버전', v.version || '-'],
      ['빌드', v.build || '-'],
      ['릴리스 날짜', v.release_date || '-'],
      ['환경', v.environment || '-'],
    ];

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header"><h2 class="spa-page__title">시스템 버전 정보</h2></div>
        <div class="spa-detail-grid" style="max-width:480px;margin-bottom:2rem">
          ${infoRows.map(([l, val]) => `
            <div class="spa-detail-field">
              <span class="spa-detail-field__label">${l}</span>
              <span class="spa-detail-field__value">${esc(String(val))}</span>
            </div>`).join('')}
        </div>
        ${releaseNotes.length > 0 ? `
          <h3 style="margin-bottom:1rem">릴리스 노트</h3>
          <div class="spa-admin-table-wrap">
            ${releaseNotes.map(rn => `
              <div style="margin-bottom:1.5rem;padding:1rem;border:1px solid var(--spa-border);border-radius:8px">
                <h4 style="margin-bottom:0.5rem">v${esc(rn.version || '')}</h4>
                <ul style="padding-left:1.2rem;margin:0">
                  ${(rn.items || []).map(it => `<li>${esc(it)}</li>`).join('')}
                </ul>
              </div>`).join('')}
          </div>` : ''}
      </div>`;
  }
}
