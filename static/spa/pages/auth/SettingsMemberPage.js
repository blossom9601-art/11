/* ============================================================
 *  SettingsMemberPage — 부서 동료
 * ============================================================ */

import { esc }        from '../../shared/dom-utils.js';
import { api }        from '../../shared/api-client.js';
import { fetchQuery } from '../../shared/bq.js';
import { DataTable }  from '../../widgets/DataTable.js';

export default class SettingsMemberPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">부서 동료</h2>
        </div>
        <div id="member-table"></div>
      </div>`;

    try {
      const res = await fetchQuery(['settings', 'members'], () => api.get('/api/auth/members'));
      if (res.success) {
        new DataTable({
          container: this._el.querySelector('#member-table'),
          columns: [
            { key: 'emp_no', label: '사번', width: 100 },
            { key: 'name', label: '이름', width: 120 },
            { key: 'department', label: '부서', width: 140 },
            { key: 'job', label: '직무', width: 120 },
            { key: 'ext_phone', label: '내선', width: 100 },
            { key: 'email', label: '이메일' },
          ],
          rows: res.rows || res.members || [],
          pageSize: 20,
        });
      }
    } catch {
      this._el.querySelector('#member-table').innerHTML = '<p class="spa-text-muted">동료 목록을 불러올 수 없습니다.</p>';
    }
  }

  unmount() {}
}
