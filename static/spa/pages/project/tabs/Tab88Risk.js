/* ============================================================
 *  Tab88Risk — 위험관리 (risk)
 *  ============================================================
 *  API: GET/POST/PUT/DELETE /api/prj/projects/<id>/tabs/risk
 *  payload_json 기반 generic tab CRUD
 * ============================================================ */

import { api }              from '../../../shared/api-client.js';
import { esc }              from '../../../shared/dom-utils.js';
import { DataTable }        from '../../../widgets/DataTable.js';
import { Toast }            from '../../../widgets/Toast.js';
import { confirm }          from '../../../widgets/Modal.js';
import { fetchQuery, invalidate } from '../../../shared/bq.js';

const COLUMNS = [
  { key: 'process',  label: '프로세스',     sortable: true },
  { key: 'failure',  label: '고장/위험 모드', sortable: true },
  { key: 'effect',   label: '영향',         sortable: true },
  { key: 's',        label: 'S',            sortable: true, width: '50px' },
  { key: 'o',        label: 'O',            sortable: true, width: '50px' },
  { key: 'd',        label: 'D',            sortable: true, width: '50px' },
  { key: 'rpn',      label: 'RPN',          sortable: true, width: '70px',
    render: (val, row) => {
      const rpn = (Number(row.s) || 0) * (Number(row.o) || 0) * (Number(row.d) || 0);
      const cls = rpn >= 200 ? 'spa-badge--danger' : rpn >= 100 ? 'spa-badge--warning' : '';
      return '<span class="spa-badge ' + cls + '">' + rpn + '</span>';
    }
  },
  { key: 'owner',   label: '담당자', sortable: true, width: '100px' },
  { key: 'status',  label: '상태',   sortable: true, width: '80px' },
  { key: 'etc',     label: '비고',   sortable: false },
];

export default class Tab88Risk {
  constructor({ projectId, project, tabKey, access, router }) {
    this._projectId = projectId;
    this._tabKey    = tabKey || 'risk';
    this._access    = access;
    this._router    = router;
    this._el        = null;
    this._table     = null;
    this._rows      = [];
    this._editingId = null;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-tab-panel">
        <div class="spa-tab-toolbar">
          <button class="spa-btn spa-btn--primary spa-btn--sm" id="btn-add-row"${this._access !== 'write' ? ' hidden' : ''}>행 추가</button>
          <button class="spa-btn spa-btn--danger spa-btn--sm" id="btn-del-rows" hidden>선택 삭제</button>
        </div>
        <div id="tab-table"></div>
      </div>
    `;
    this._bindToolbar();
    this._initTable();
    await this._fetchData();
  }

  unmount() {
    if (this._table) this._table.unmount();
  }

  _initTable() {
    this._table = new DataTable({
      columns:    COLUMNS,
      selectable: this._access === 'write',
      emptyText:  '등록된 항목이 없습니다.',
      editable:   this._access === 'write',
      onSelectionChange: (ids) => {
        const btn = this._el.querySelector('#btn-del-rows');
        if (btn) btn.hidden = ids.length === 0;
      }
    });
    this._table.mount(this._el.querySelector('#tab-table'));
  }

  async _fetchData() {
    const url = `/api/prj/projects/${this._projectId}/tabs/${this._tabKey}`;
    const qKey = ['project', this._projectId, 'tab', this._tabKey];
    const result = await fetchQuery(qKey, () => api.get(url, { showError: false }));

    if (result.success !== false) {
      this._rows = (result.items || []).map(item => {
        const p = typeof item.payload === 'string' ? JSON.parse(item.payload) : (item.payload || {});
        return { id: item.id, ...p };
      });
      this._table.setData(this._rows, this._rows.length, 1);
    }
  }

  _bindToolbar() {
    this._el.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[id]');
      if (!btn) return;

      if (btn.id === 'btn-add-row') {
        const payload = {};
        COLUMNS.forEach(c => { payload[c.key] = ''; });
        const url = `/api/prj/projects/${this._projectId}/tabs/${this._tabKey}`;
        const result = await api.post(url, { payload_json: JSON.stringify(payload) });
        if (result.success) {
          Toast.success('행이 추가되었습니다.');
          invalidate(['project', this._projectId, 'tab', this._tabKey]);
          await this._fetchData();
        }
      } else if (btn.id === 'btn-del-rows') {
        const ids = this._table.getSelectedIds();
        if (!ids.length) return;
        const ok = await confirm(`선택한 ${ids.length}건을 삭제하시겠습니까?`);
        if (!ok) return;
        const url = `/api/prj/projects/${this._projectId}/tabs/${this._tabKey}`;
        let deleted = 0;
        for (const id of ids) {
          const r = await api.delete(`${url}/${id}`);
          if (r.success) deleted++;
        }
        if (deleted) {
          Toast.success(`${deleted}건이 삭제되었습니다.`);
          invalidate(['project', this._projectId, 'tab', this._tabKey]);
          await this._fetchData();
        }
      }
    });
  }

  async save() {
    return true;
  }
}
