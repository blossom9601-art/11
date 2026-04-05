/* MyProjectPage — 내 프로젝트 / 참여 / 완료 뷰 */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';

const VIEWS = {
  my:            { label: '내 프로젝트',   api: '/api/projects?scope=my' },
  participating: { label: '참여 프로젝트', api: '/api/projects?scope=participating' },
  cleared:       { label: '완료 프로젝트', api: '/api/projects?scope=cleared' },
};

const COLUMNS = [
  { key: 'project_code',  label: '프로젝트 코드', sortable: true, width: '130px' },
  { key: 'project_name',  label: '프로젝트명',    sortable: true },
  { key: 'project_status', label: '상태',          sortable: true, width: '80px' },
  { key: 'pm_name',       label: 'PM',             sortable: true, width: '100px' },
  { key: 'start_date',    label: '시작일',          sortable: true, width: '100px' },
  { key: 'end_date',      label: '종료일',          sortable: true, width: '100px' },
  { key: 'progress',      label: '진행률',          sortable: true, width: '80px' },
];

export default class MyProjectPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._view   = params.view || query.scope || 'my';
    this._el     = null;
    this._table  = null;
  }

  async mount(container) {
    this._el = container;
    const tabs = Object.entries(VIEWS).map(([k, v]) =>
      `<button class="spa-btn ${k === this._view ? 'spa-btn--primary' : ''}" data-view="${k}">${v.label}</button>`
    ).join('');

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">프로젝트</h2>
          <div class="spa-page-header__actions">${tabs}</div>
        </div>
        <div id="proj-table"></div>
      </div>`;

    this._table = new DataTable({ columns: COLUMNS, selectable: false, emptyText: '프로젝트가 없습니다.' });
    this._table.mount(this._el.querySelector('#proj-table'));

    this._el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (btn) this._router.navigate('/project/my?scope=' + btn.dataset.view);
    });

    this._el.querySelector('#proj-table').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-row-id]');
      if (tr) this._router.navigate('/project/' + tr.dataset.rowId);
    });

    await this._fetch();
  }

  unmount() { if (this._table) this._table.unmount(); }

  async _fetch() {
    const v = VIEWS[this._view] || VIEWS.my;
    this._table.loading(true);
    try {
      const res = await api.get(v.api);
      this._table.setData(res.items || res.rows || [], res.total || 0, 1);
    } catch { this._table.setData([], 0, 1); }
  }
}
