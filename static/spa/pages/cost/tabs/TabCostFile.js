/* TabCostFile — 비용 관련 첨부파일 */
import { api }           from '../../../shared/api-client.js';
import { DataTable }     from '../../../widgets/DataTable.js';
import { FileUpload }    from '../../../widgets/FileUpload.js';
import { Toast }         from '../../../widgets/Toast.js';
import { confirm }       from '../../../widgets/Modal.js';

const COLUMNS = [
  { key: 'file_name',   label: '파일명',   sortable: true },
  { key: 'file_size',   label: '크기',     sortable: true, width: '100px', render: v => v ? (v / 1024).toFixed(1) + ' KB' : '-' },
  { key: 'uploaded_by',  label: '업로더',   sortable: true },
  { key: 'uploaded_at',  label: '업로드일', sortable: true, width: '150px' },
];

export default class TabCostFile {
  constructor({ itemId, apiBase }) { this._apiBase = `${apiBase}/${itemId}/files`; this._el = null; this._table = null; }

  async mount(c) {
    this._el = c;
    this._el.innerHTML = `<div class="spa-tab-panel">
      <div style="margin-bottom:12px"><button class="spa-btn spa-btn--primary spa-btn--sm" id="btn-upload">파일 업로드</button></div>
      <div id="tab-table"></div></div>`;
    this._table = new DataTable({ columns: COLUMNS, emptyText: '첨부파일이 없습니다.' });
    this._table.mount(this._el.querySelector('#tab-table'));
    this._el.querySelector('#btn-upload').addEventListener('click', () => this._upload());
    await this._fetch();
  }

  unmount() { this._table?.unmount(); }

  async _fetch() {
    try { const res = await api.get(this._apiBase); const items = res.rows || res.items || [];
      this._table.setData(items, items.length, 1); } catch { this._table.setData([], 0, 1); }
  }

  async _upload() {
    const input = document.createElement('input'); input.type = 'file'; input.multiple = true;
    input.addEventListener('change', async () => {
      const formData = new FormData();
      for (const f of input.files) formData.append('files', f);
      try { await api.upload(this._apiBase, formData); Toast.success('업로드 완료'); this._fetch();
      } catch (e) { Toast.error(e.message || '업로드 실패'); }
    });
    input.click();
  }
}
