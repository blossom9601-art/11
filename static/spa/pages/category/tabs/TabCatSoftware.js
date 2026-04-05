/* TabCatSoftware — 소프트웨어 자산 연계 탭 (벤더 → 공급 SW, SW카탈로그 → 설치 시스템) */
import { api }        from '../../../shared/api-client.js';
import { DataTable }  from '../../../widgets/DataTable.js';

const COLUMNS = [
  { key: 'software_name', label: 'SW 이름',    sortable: true },
  { key: 'version',       label: '버전',       sortable: true, width: '100px' },
  { key: 'system_name',   label: '설치 시스템', sortable: true },
  { key: 'license_type',  label: '라이선스',    sortable: true, width: '100px' },
  { key: 'status',        label: '상태',        sortable: true, width: '80px' },
];

export default class TabCatSoftware {
  constructor({ itemId, apiBase, softwareApiSuffix }) {
    this._apiBase = `${apiBase}/${itemId}/${softwareApiSuffix || 'sw-assets'}`;
    this._el = null; this._table = null;
  }

  async mount(c) {
    this._el = c;
    this._el.innerHTML = '<div class="spa-tab-panel"><div id="tab-table"></div></div>';
    this._table = new DataTable({ columns: COLUMNS, emptyText: '연계된 SW 자산이 없습니다.' });
    this._table.mount(this._el.querySelector('#tab-table'));
    await this._fetch();
  }

  unmount() { this._table?.unmount(); }

  async _fetch() {
    try { const res = await api.get(this._apiBase); const items = res.rows || res.items || [];
      this._table.setData(items, items.length, 1); } catch { this._table.setData([], 0, 1); }
  }
}
