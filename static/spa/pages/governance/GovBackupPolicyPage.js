/* GovBackupPolicyPage — 백업 대상 정책 관리 */
import { api }           from '../../shared/api-client.js';
import { esc }           from '../../shared/dom-utils.js';
import { DataTable }     from '../../widgets/DataTable.js';
import { SearchBar }     from '../../widgets/SearchBar.js';
import { TabCrudMixin }  from '../../shared/tab-crud-mixin.js';

const COLUMNS = [
  { key: 'backup_policy_name', label: '정책명',   sortable: true },
  { key: 'system_name',        label: '시스템',   sortable: true },
  { key: 'ip_address',         label: 'IP',       sortable: true, width: '120px' },
  { key: 'backup_scope',       label: '범위',     sortable: true, width: '90px' },
  { key: 'data_type',          label: '데이터유형', sortable: true, width: '90px' },
  { key: 'backup_grade',       label: '등급',     sortable: true, width: '70px' },
  { key: 'schedule_period',    label: '주기',     sortable: true, width: '70px' },
  { key: 'retention_value',    label: '보존기간',  sortable: true, width: '80px' },
];

const FORM_FIELDS = [
  { key: 'backup_policy_name', label: '정책명', type: 'text', required: true },
  { key: 'system_name', label: '시스템명', type: 'text', required: true },
  { key: 'ip_address', label: 'IP 주소', type: 'text' },
  { key: 'backup_scope', label: '범위', type: 'select', options: [
    { value: '전체', label: '전체' }, { value: '부분', label: '부분' },
  ]},
  { key: 'data_type', label: '데이터유형', type: 'select', options: [
    { value: 'DB', label: 'DB' }, { value: 'File', label: 'File' }, { value: 'Image', label: 'Image' },
  ]},
  { key: 'backup_grade', label: '등급', type: 'select', options: [
    { value: 'A', label: 'A' }, { value: 'B', label: 'B' }, { value: 'C', label: 'C' },
  ]},
  { key: 'schedule_period', label: '주기', type: 'select', options: [
    { value: 'daily', label: '일일' }, { value: 'weekly', label: '주간' }, { value: 'monthly', label: '월간' },
  ]},
  { key: 'retention_value', label: '보존기간(일)', type: 'text' },
  { key: 'storage_pool_name', label: '스토리지 풀', type: 'text' },
  { key: 'remark', label: '비고', type: 'textarea' },
];

export default class GovBackupPolicyPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
    this._table  = null;
    this._crud   = new TabCrudMixin({
      apiBase: '/api/governance/backup/target-policies',
      formFields: FORM_FIELDS,
      entityName: '백업 정책',
      onRefresh: () => this._fetch(),
    });
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 백업</button>
          <h2 class="spa-page__title">백업 대상 정책</h2>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
          </div>
        </div>
        <div class="spa-tab-panel__header">${this._crud.renderToolbar()}</div>
        <div id="search-area"></div>
        <div id="list-table"></div>
      </div>`;
    this._searchBar = new SearchBar({
      fields: [{ key: 'q', label: '검색어', type: 'text', placeholder: '정책명, 시스템, IP...' }],
      onSearch: (f) => { this._searchQ = f.q || ''; this._fetch(); },
      onReset:  ()  => { this._searchQ = ''; this._fetch(); },
    });
    this._searchBar.mount(this._el.querySelector('#search-area'));

    const cols = [...COLUMNS, TabCrudMixin.actionColumn(this._crud)];
    this._table = new DataTable({ columns: cols, selectable: true, emptyText: '등록된 백업 정책이 없습니다.' });
    this._table.mount(this._el.querySelector('#list-table'));
    this._crud.bindToolbar(this._el, this._table);
    this._crud.bindRowActions(this._el);
    this._el.querySelector('#btn-export')?.addEventListener('click', () => this._table.exportCsv('백업정책.csv'));
    this._el.querySelector('#btn-back')?.addEventListener('click', () => this._router.navigate('/governance/backup'));
    await this._fetch();
  }

  unmount() { if (this._table) this._table.unmount(); }

  async _fetch() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/governance/backup/target-policies');
      const rows = res.items || res.rows || [];
      this._table.setData(rows, rows.length, 1);
      this._crud.setRows(rows);
    } catch { this._table.setData([], 0, 1); }
  }
}
