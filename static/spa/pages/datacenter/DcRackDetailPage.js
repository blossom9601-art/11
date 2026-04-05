/* DcRackDetailPage — 랙 상세 (장비 배치 현황) + 탭 */
import { api }              from '../../shared/api-client.js';
import { esc }              from '../../shared/dom-utils.js';
import { TabBar }           from '../../widgets/TabBar.js';
import { DataTable }        from '../../widgets/DataTable.js';
import { LoadingSpinner, ErrorBoundary } from '../../widgets/LoadingSpinner.js';
import { Toast }            from '../../widgets/Toast.js';

const DETAIL_TABS = [
  { id: 'basic', label: '기본 정보' },
  { id: 'task',  label: '작업 이력' },
  { id: 'log',   label: '변경 이력' },
  { id: 'file',  label: '첨부파일' },
];

const TAB_COLUMNS = {
  task: [
    { key: 'task_name',  label: '작업명',   sortable: true },
    { key: 'task_type',  label: '유형',     sortable: true, width: '100px' },
    { key: 'status',     label: '상태',     sortable: true, width: '80px' },
    { key: 'assignee',   label: '담당자',   sortable: true, width: '100px' },
    { key: 'start_date', label: '시작일',   sortable: true, width: '120px' },
    { key: 'end_date',   label: '종료일',   sortable: true, width: '120px' },
    { key: 'remark',     label: '비고',     sortable: true },
  ],
  log: [
    { key: 'changed_field', label: '변경항목', sortable: true },
    { key: 'old_value',     label: '이전값',  sortable: true },
    { key: 'new_value',     label: '변경값',  sortable: true },
    { key: 'changed_by',    label: '변경자',  sortable: true, width: '100px' },
    { key: 'changed_at',    label: '변경일시', sortable: true, width: '150px' },
  ],
  file: [
    { key: 'file_name',   label: '파일명',   sortable: true },
    { key: 'file_size',   label: '크기',     sortable: true, width: '100px', render: v => v ? (v / 1024).toFixed(1) + ' KB' : '-' },
    { key: 'uploaded_by',  label: '업로더',   sortable: true, width: '100px' },
    { key: 'uploaded_at',  label: '업로드일', sortable: true, width: '150px' },
  ],
};

export default class DcRackDetailPage {
  constructor({ params, query, router }) {
    this._router = router; this._id = params.id; this._activeTab = query.tab || 'basic';
    this._apiBase = '/api/org-racks'; this._el = null; this._tabBar = null;
    this._item = null; this._tabContent = null; this._table = null;
  }

  async mount(container) {
    this._el = container; this._el.innerHTML = LoadingSpinner.renderPage();
    try {
      const res = await api.get(`${this._apiBase}/${this._id}`, { showError: false });
      if (!res || (res.success === false && !res.item)) { ErrorBoundary.mount(this._el, res?.error || '랙 정보를 찾을 수 없습니다.', () => this.mount(container)); return; }
      this._item = res.item || res; this._render();
      if (this._activeTab !== 'basic') this._loadTab(this._activeTab);
    } catch { ErrorBoundary.mount(this._el, '랙 정보를 불러올 수 없습니다.', () => this.mount(container)); }
  }

  unmount() { this._table?.unmount(); this._tabBar?.unmount(); }

  _render() {
    const r = this._item;
    this._el.innerHTML = `
      <div class="spa-page spa-detail-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 랙 레이아웃</button>
          <h2 class="spa-page__title">${esc(r.rack_name || r.rack_code || '랙 상세')}</h2>
        </div>
        <div id="detail-tabbar"></div>
        <div class="spa-tab-content" id="detail-tab-content"></div>
      </div>`;
    this._tabBar = new TabBar({ tabs: DETAIL_TABS.map(t => ({ id: t.id, label: t.label })), activeTab: this._activeTab,
      onTabChange: id => this._switchTab(id) });
    this._tabBar.mount(this._el.querySelector('#detail-tabbar'));
    this._tabContent = this._el.querySelector('#detail-tab-content');
    this._el.querySelector('#btn-back').addEventListener('click', () => this._router.navigate('/datacenter/rack/layout'));
    if (this._activeTab === 'basic') this._renderBasic();
  }

  _renderBasic() {
    const r = this._item;
    const fields = [
      ['랙 코드', r.rack_code], ['랙 이름', r.rack_name],
      ['사업구분', r.business_status_code], ['사업명', r.business_name],
      ['제조사', r.manufacturer_code], ['모델', r.rack_model],
      ['시리얼', r.serial_number], ['센터', r.center_code],
      ['위치', r.rack_position], ['높이(U)', r.system_height_u || r.system_height],
      ['담당부서', r.system_dept_code], ['비고', r.remark],
    ];
    this._tabContent.innerHTML = `<div class="spa-detail-summary">${fields.map(([l, v]) =>
      `<div class="spa-summary-item"><span class="spa-summary-label">${esc(l)}</span><span class="spa-summary-value">${esc(String(v ?? '-'))}</span></div>`
    ).join('')}</div>`;
  }

  _switchTab(id) {
    this._table?.unmount(); this._table = null;
    this._activeTab = id; this._router.updateQuery({ tab: id });
    if (id === 'basic') { this._renderBasic(); return; }
    this._loadTab(id);
  }

  async _loadTab(tabId) {
    const cols = TAB_COLUMNS[tabId]; if (!cols) return;
    const emptyTexts = { task: '등록된 작업이 없습니다.', log: '변경 이력이 없습니다.', file: '첨부파일이 없습니다.' };
    this._tabContent.innerHTML = '<div class="spa-tab-panel"><div id="tab-table"></div></div>';
    this._table = new DataTable({ columns: cols, emptyText: emptyTexts[tabId] || '' });
    this._table.mount(this._tabContent.querySelector('#tab-table'));
    try {
      const res = await api.get(`${this._apiBase}/${this._id}/${tabId === 'task' ? 'tasks' : tabId + 's'}`, { showError: false });
      const items = res.rows || res.items || [];
      this._table.setData(items, items.length, 1);
    } catch { this._table.setData([], 0, 1); }
  }
}
