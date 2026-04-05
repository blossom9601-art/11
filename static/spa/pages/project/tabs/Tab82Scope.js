/* ============================================================
 *  Tab82Scope — 범위관리/WBS (scope)
 *  ============================================================
 *  API: GET/POST/PUT/DELETE /api/prj/projects/<id>/tabs/scope
 *  payload_json 기반 generic tab CRUD
 * ============================================================ */

import { api }              from '../../../shared/api-client.js';
import { esc }              from '../../../shared/dom-utils.js';
import { DataTable }        from '../../../widgets/DataTable.js';
import { Toast }            from '../../../widgets/Toast.js';
import { confirm }          from '../../../widgets/Modal.js';
import { fetchQuery, invalidate } from '../../../shared/bq.js';

const COLUMNS = [
  { key: 'division',  label: '구분',     sortable: true, width: '100px' },
  { key: 'activity',  label: '활동명',   sortable: true },
  { key: 'task',      label: '작업명',   sortable: true },
  { key: 'taskDoc',   label: '문서번호', sortable: true, width: '120px' },
  { key: 'owner',     label: '담당자',   sortable: true, width: '100px' },
  { key: 'startDate', label: '시작일',   sortable: true, width: '100px' },
  { key: 'endDate',   label: '종료일',   sortable: true, width: '100px' },
  { key: 'duration',  label: '작업기간', sortable: true, width: '80px',
    render: (val, row) => {
      if (!row.startDate || !row.endDate) return '-';
      const d = (new Date(row.endDate) - new Date(row.startDate)) / 86400000 + 1;
      return d > 0 ? d + '일' : '-';
    }
  },
  { key: 'result', label: '결과', sortable: true, width: '80px' },
];

export default class Tab82Scope {
  constructor({ projectId, project, tabKey, access, router }) {
    this._projectId = projectId;
    this._tabKey    = tabKey || 'scope';
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
