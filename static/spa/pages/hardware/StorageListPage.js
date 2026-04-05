/* StorageListPage — 스토리지 목록 (SAN 스토리지, 백업/PTL) */
import { api }        from '../../shared/api-client.js';
import { esc }        from '../../shared/dom-utils.js';
import { DataTable }  from '../../widgets/DataTable.js';
import { SearchBar }  from '../../widgets/SearchBar.js';
import { LoadingSpinner, ErrorBoundary } from '../../widgets/LoadingSpinner.js';
import { Toast }      from '../../widgets/Toast.js';
import { confirm }    from '../../widgets/Modal.js';
import { loadMultipleOptions } from '../../shared/fk-options.js';
import { fetchQuery, invalidate } from '../../shared/bq.js';

const TYPE_CONFIG = {
  'san-storage':    { apiBase: '/api/hardware/storage/assets',        label: 'SAN 스토리지' },
  'backup-storage': { apiBase: '/api/hardware/storage/backup/assets', label: '백업/PTL 스토리지' },
};

const COLUMNS = [
  { key: 'work_status',  label: '업무 상태', sortable: true, width: '90px',
    render: (v, r) => { const c = r.work_status_color; return `<span class="spa-badge"${c ? ` style="background:${esc(c)};color:#fff"` : ''}>${esc(v)}</span>`; } },
  { key: 'work_group',   label: '업무 그룹',  sortable: true },
  { key: 'work_name',    label: '업무 이름',  sortable: true },
  { key: 'system_name',  label: '시스템 이름', sortable: true },
  { key: 'system_ip',    label: '시스템 IP',  sortable: true, width: '130px' },
  { key: 'vendor',       label: '제조사',     sortable: true },
  { key: 'model',        label: '모델명',     sortable: true },
  { key: 'serial',       label: '일련번호',   sortable: true },
  { key: 'sys_owner',    label: '시스템 담당', sortable: true },
];

function mapRow(item) {
  return {
    id:             item.id,
    work_status:    item.work_status_name  || '-',
    work_status_color: item.work_status_color || '',
    work_group:     item.work_group_name   || '-',
    work_name:      item.work_name         || '-',
    system_name:    item.system_name       || '-',
    system_ip:      item.system_ip         || '-',
    vendor:         item.manufacturer_name || '-',
    model:          item.server_model_name || item.model_name || '-',
    serial:         item.serial_number     || '-',
    sys_owner:      item.system_owner_display || item.system_owner_name || '-',
  };
}

export default class StorageListPage {
  constructor({ params, query, router }) {
    this._router   = router;
    this._type     = params.type || 'san-storage';
    this._query    = query || {};
    this._cfg      = TYPE_CONFIG[this._type] || TYPE_CONFIG['san-storage'];
    this._el       = null;
    this._table    = null;
    this._search   = null;
    this._page     = parseInt(this._query.page) || 1;
    this._pageSize = 50;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page-title">${esc(this._cfg.label)} 목록</h2>
          <div class="spa-page-actions">
            <button class="spa-btn spa-btn--outline" id="btn-export">CSV 내보내기</button>
            <button class="spa-btn spa-btn--danger" id="btn-bulk-delete" hidden>선택 삭제</button>
            <button class="spa-btn spa-btn--primary" id="btn-register">등록</button>
          </div>
        </div>
        <div class="spa-scope-tabs" style="margin-bottom:12px">
          ${Object.entries(TYPE_CONFIG).map(([k, v]) =>
            `<button class="spa-scope-tab${k === this._type ? ' active' : ''}" data-type="${k}">${esc(v.label)}</button>`
          ).join('')}
        </div>
        <div id="search-area"></div>
        <div id="table-area">${LoadingSpinner.renderInline()}</div>
      </div>`;

    this._el.querySelector('.spa-scope-tabs').addEventListener('click', e => {
      const btn = e.target.closest('[data-type]');
      if (btn && btn.dataset.type !== this._type) this._router.navigate('/hardware/storage/' + btn.dataset.type);
    });
    this._el.querySelector('#btn-export').addEventListener('click', () => this._table.exportCsv(`스토리지_${this._type}_목록.csv`));
    this._el.querySelector('#btn-bulk-delete').addEventListener('click', () => this._bulkDelete());
    this._el.querySelector('#btn-register').addEventListener('click', () =>
      this._router.navigate(`/hardware/storage/${this._type}/new`));

    const fkOpts = await loadMultipleOptions(['workStatus', 'workGroup']);
    this._search = new SearchBar({
      fields: [
        { key: 'q', label: '검색어', type: 'text', placeholder: '업무명, 시스템명, IP...' },
        { key: 'work_status_code', label: '업무 상태', type: 'select', options: fkOpts.workStatus || [] },
      ],
      onSearch: f => { this._filters = f; this._page = 1; this._fetch(); },
      onReset:  () => { this._filters = {}; this._page = 1; this._fetch(); },
    });
    this._search.mount(this._el.querySelector('#search-area'));

    this._table = new DataTable({
      columns: COLUMNS, selectable: true, pageSize: this._pageSize,
      emptyText: '등록된 스토리지가 없습니다.',
      onRowClick: r => this._router.navigate(`/hardware/storage/${this._type}/${r.id}`),
      onPageChange: p => { this._page = p; this._fetch(); },
      onSelectionChange: ids => {
        const btn = this._el.querySelector('#btn-bulk-delete');
        if (btn) btn.hidden = ids.length === 0;
      },
    });
    this._table.mount(this._el.querySelector('#table-area'));
    this._filters = {};
    await this._fetch();
  }

  unmount() { this._table?.unmount(); this._search?.unmount(); }

  async _fetch() {
    const params = { page: this._page, page_size: this._pageSize, ...this._filters };
    const qs = new URLSearchParams(params).toString();
    const res = await fetchQuery(['storage', this._type, 'list', params],
      () => api.get(`${this._cfg.apiBase}?${qs}`, { showError: false }));
    const items = (res.items || res.rows || []).map(mapRow);
    this._table.setData(items, res.total || items.length, this._page);
  }

  async _bulkDelete() {
    const ids = this._table.getSelectedIds();
    if (!ids.length) return;
    if (!(await confirm(`선택한 ${ids.length}건을 삭제하시겠습니까?`))) return;
    const r = await api.bulkDelete(this._cfg.apiBase, ids);
    if (r.success) { Toast.success(`${ids.length}건 삭제`); invalidate(['storage']); this._fetch(); }
  }
}
