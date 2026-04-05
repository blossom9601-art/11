/* AdminSessionsPage — 활성 세션 관리 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';

export default class AdminSessionsPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
    this._rows = [];
    this._total = 0;
    this._page = 1;
    this._search = '';
  }

  async mount(container) {
    this._el = container;
    await this._load();
  }

  unmount() {}

  async _load() {
    const params = new URLSearchParams({ page: this._page, per_page: 20, search: this._search });
    const res = await api.get('/admin/auth/active-sessions?' + params, { showError: false });
    this._rows = res.rows || [];
    this._total = res.total || 0;
    this._render();
  }

  _render() {
    const totalPages = Math.ceil(this._total / 20) || 1;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">활성 세션 (${this._total})</h2>
          <div class="spa-page-header__actions">
            <input type="text" class="spa-input" id="adm-sess-search" placeholder="사번/이름/IP 검색..." value="${esc(this._search)}" style="width:200px">
            <button class="spa-btn spa-btn--outline" id="adm-sess-export">CSV 내보내기</button>
            <button class="spa-btn spa-btn--danger-outline" id="adm-sess-terminate-all">전체 종료</button>
          </div>
        </div>
        <div class="spa-admin-table-wrap">
          <table class="spa-dt-table">
            <thead>
              <tr><th>사번</th><th>이름</th><th>IP</th><th>브라우저</th><th>OS</th><th>접속 시각</th><th>마지막 활동</th><th>작업</th></tr>
            </thead>
            <tbody>
              ${this._rows.length === 0 ? '<tr><td colspan="8" class="spa-text-muted" style="text-align:center">활성 세션이 없습니다.</td></tr>' :
                this._rows.map(r => `<tr class="${r.is_current ? 'spa-row-highlight' : ''}">
                  <td>${esc(r.emp_no)}</td>
                  <td>${esc(r.user_name)}</td>
                  <td>${esc(r.ip_address)}</td>
                  <td>${esc(r.browser)}</td>
                  <td>${esc(r.os)}</td>
                  <td>${esc(r.created_at)}</td>
                  <td>${esc(r.last_active)}</td>
                  <td>${r.is_current ? '<span class="spa-badge spa-badge--success">현재</span>' :
                    `<button class="spa-btn spa-btn--sm spa-btn--danger-outline" data-term="${r.id}">종료</button>`}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="spa-pagination">
          <button class="spa-btn spa-btn--sm" id="adm-sess-prev" ${this._page <= 1 ? 'disabled' : ''}>이전</button>
          <span>${this._page} / ${totalPages}</span>
          <button class="spa-btn spa-btn--sm" id="adm-sess-next" ${this._page >= totalPages ? 'disabled' : ''}>다음</button>
        </div>
      </div>`;

    this._el.querySelector('#adm-sess-search').addEventListener('input', (e) => {
      this._search = e.target.value; this._page = 1; this._load();
    });
    this._el.querySelector('#adm-sess-export')?.addEventListener('click', () => this._exportCsv());
    this._el.querySelector('#adm-sess-terminate-all').addEventListener('click', () => this._terminateAll());
    this._el.querySelector('#adm-sess-prev').addEventListener('click', () => { this._page--; this._load(); });
    this._el.querySelector('#adm-sess-next').addEventListener('click', () => { this._page++; this._load(); });
    this._el.querySelectorAll('[data-term]').forEach(btn => {
      btn.addEventListener('click', () => this._terminate(parseInt(btn.dataset.term)));
    });
  }

  async _terminate(id) {
    await api.delete('/admin/auth/active-sessions/' + id);
    await this._load();
  }

  async _terminateAll() {
    if (!confirm('본인을 제외한 모든 세션을 종료하시겠습니까?')) return;
    await api.post('/admin/auth/active-sessions/terminate-all');
    await this._load();
  }

  _exportCsv() {
    const header = ['사번','이름','IP','브라우저','OS','접속시각','마지막활동'];
    const lines = this._rows.map(r =>
      [r.emp_no, r.user_name, r.ip_address, r.browser, r.os, r.created_at, r.last_active]
        .map(v => `"${String(v||'').replace(/"/g,'""')}"`)
        .join(',')
    );
    const csv = '\uFEFF' + header.join(',') + '\n' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = '활성세션.csv'; a.click(); URL.revokeObjectURL(a.href);
  }
}
