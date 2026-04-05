/* TaskDetailPage — 작업 상세 + 탭 (코멘트/파일) */
import { api }              from '../../shared/api-client.js';
import { esc }              from '../../shared/dom-utils.js';
import { Toast }            from '../../widgets/Toast.js';
import { TabBar }           from '../../widgets/TabBar.js';
import { DataTable }        from '../../widgets/DataTable.js';
import { LoadingSpinner, ErrorBoundary } from '../../widgets/LoadingSpinner.js';

const DETAIL_TABS = [
  { id: 'basic',    label: '기본 정보' },
  { id: 'comment',  label: '코멘트' },
  { id: 'file',     label: '첨부파일' },
];

const STATUS_ACTIONS = {
  '작성중':   [{ action: 'submit',       label: '제출',   cls: 'spa-btn--primary' }],
  '제출완료': [{ action: 'approve-init',  label: '초기승인', cls: 'spa-btn--primary' },
               { action: 'reject',        label: '반려',   cls: 'spa-btn--danger' }],
  '초기승인': [{ action: 'submit-result', label: '결과제출', cls: 'spa-btn--primary' }],
  '결과제출': [{ action: 'approve-final', label: '최종승인', cls: 'spa-btn--primary' },
               { action: 'reject',        label: '반려',   cls: 'spa-btn--danger' }],
};

export default class TaskDetailPage {
  constructor({ params, query, router }) {
    this._router = router; this._id = params.id; this._activeTab = query.tab || 'basic';
    this._apiBase = '/api/wrk/reports'; this._el = null; this._item = null;
    this._tabBar = null; this._tabContent = null; this._table = null;
  }

  async mount(container) {
    this._el = container; this._el.innerHTML = LoadingSpinner.renderPage();
    try {
      const res = await api.get(`${this._apiBase}/${this._id}`, { showError: false });
      if (!res || (res.success === false && !res.item)) { ErrorBoundary.mount(this._el, res?.error || '작업을 찾을 수 없습니다.', () => this.mount(container)); return; }
      this._item = res.item || res; this._render();
      if (this._activeTab !== 'basic') this._loadTab(this._activeTab);
    } catch { ErrorBoundary.mount(this._el, '작업을 불러올 수 없습니다.', () => this.mount(container)); }
  }

  unmount() { this._table?.unmount(); this._tabBar?.unmount(); }

  _render() {
    const t = this._item;
    const status = t.status || t.report_status || '';
    const actions = STATUS_ACTIONS[status] || [];
    const actionBtns = actions.map(a =>
      `<button class="spa-btn ${a.cls}" data-action="${a.action}">${a.label}</button>`).join('');

    this._el.innerHTML = `
      <div class="spa-page spa-detail-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 목록</button>
          <div class="spa-detail-title">
            <h2>${esc(t.name || t.report_name || '작업 상세')}</h2>
            <span class="spa-badge">${esc(status)}</span>
          </div>
          <div class="spa-page-actions">
            ${actionBtns}
            <button class="spa-btn spa-btn--default" id="btn-save">저장</button>
          </div>
        </div>
        <div id="detail-tabbar"></div>
        <div class="spa-tab-content" id="detail-tab-content"></div>
      </div>`;

    this._tabBar = new TabBar({ tabs: DETAIL_TABS.map(t => ({ id: t.id, label: t.label })), activeTab: this._activeTab,
      onTabChange: id => this._switchTab(id) });
    this._tabBar.mount(this._el.querySelector('#detail-tabbar'));
    this._tabContent = this._el.querySelector('#detail-tab-content');
    this._el.querySelector('#btn-back').addEventListener('click', () => this._router.navigate('/work/tasks'));
    this._el.querySelector('#btn-save').addEventListener('click', () => this._save());
    this._el.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => this._doAction(btn.dataset.action));
    });
    if (this._activeTab === 'basic') this._renderBasic();
  }

  _renderBasic() {
    const t = this._item;
    const fields = [
      ['작업번호', 'task_no',       t.task_no || t.report_no || ''],
      ['작업명',   'name',          t.name || t.report_name || ''],
      ['유형',     'type',          t.type || t.report_type || ''],
      ['분류',     'category',      t.category || ''],
      ['상태',     'status',        t.status || t.report_status || ''],
      ['담당자',   'assignee',      t.assignee || t.created_by || ''],
      ['시작일',   'start_date',    t.start_date || t.report_date || ''],
      ['종료일',   'end_date',      t.end_date || ''],
      ['내용',     'description',   t.description || t.report_content || ''],
    ];

    this._tabContent.innerHTML = `<div class="spa-detail-form">
      ${fields.map(([label, key, val]) => {
        const isTextarea = key === 'description';
        const isReadonly = key === 'task_no' || key === 'status';
        return `<div class="spa-form-row">
          <label class="spa-form-label">${esc(label)}</label>
          ${isTextarea
            ? `<textarea class="spa-form-input" data-field="${key}" rows="4" ${isReadonly ? 'readonly' : ''}>${esc(String(val))}</textarea>`
            : `<input class="spa-form-input" data-field="${key}" value="${esc(String(val))}" ${isReadonly ? 'readonly' : ''} />`}
        </div>`;
      }).join('')}
    </div>`;
  }

  _switchTab(id) {
    this._table?.unmount(); this._table = null;
    this._activeTab = id; this._router.updateQuery({ tab: id });
    if (id === 'basic') { this._renderBasic(); return; }
    this._loadTab(id);
  }

  async _loadTab(tabId) {
    if (tabId === 'comment') { await this._loadComments(); return; }
    if (tabId === 'file')    { await this._loadFiles(); return; }
  }

  async _loadComments() {
    this._tabContent.innerHTML = `<div class="spa-tab-panel">
      <div style="margin-bottom:12px;display:flex;gap:8px">
        <input class="spa-form-input" id="comment-input" placeholder="코멘트 입력..." style="flex:1" />
        <button class="spa-btn spa-btn--primary spa-btn--sm" id="btn-add-comment">등록</button>
      </div>
      <div id="tab-table"></div></div>`;

    const cols = [
      { key: 'content',    label: '내용',    sortable: true },
      { key: 'created_by', label: '작성자',  sortable: true, width: '100px' },
      { key: 'created_at', label: '작성일',  sortable: true, width: '150px' },
    ];
    this._table = new DataTable({ columns: cols, emptyText: '코멘트가 없습니다.' });
    this._table.mount(this._tabContent.querySelector('#tab-table'));

    this._tabContent.querySelector('#btn-add-comment').addEventListener('click', async () => {
      const input = this._tabContent.querySelector('#comment-input');
      const content = input.value.trim(); if (!content) return;
      try { await api.post(`${this._apiBase}/${this._id}/comments`, { content }); input.value = ''; Toast.success('등록 완료'); this._fetchComments(); } catch { /* api handles */ }
    });
    await this._fetchComments();
  }

  async _fetchComments() {
    try { const res = await api.get(`${this._apiBase}/${this._id}/comments`, { showError: false });
      const items = res.rows || res.items || res.comments || [];
      this._table.setData(items, items.length, 1); } catch { this._table.setData([], 0, 1); }
  }

  async _loadFiles() {
    this._tabContent.innerHTML = `<div class="spa-tab-panel">
      <div style="margin-bottom:12px"><button class="spa-btn spa-btn--primary spa-btn--sm" id="btn-upload">파일 업로드</button></div>
      <div id="tab-table"></div></div>`;

    const cols = [
      { key: 'file_name',   label: '파일명',   sortable: true },
      { key: 'file_size',   label: '크기',     sortable: true, width: '100px', render: v => v ? (v / 1024).toFixed(1) + ' KB' : '-' },
      { key: 'uploaded_by',  label: '업로더',   sortable: true, width: '100px' },
      { key: 'uploaded_at',  label: '업로드일', sortable: true, width: '150px' },
    ];
    this._table = new DataTable({ columns: cols, emptyText: '첨부파일이 없습니다.' });
    this._table.mount(this._tabContent.querySelector('#tab-table'));

    this._tabContent.querySelector('#btn-upload').addEventListener('click', () => {
      const input = document.createElement('input'); input.type = 'file'; input.multiple = true;
      input.addEventListener('change', async () => {
        const fd = new FormData(); for (const f of input.files) fd.append('files', f);
        try { await api.upload(`${this._apiBase}/${this._id}/files`, fd); Toast.success('업로드 완료'); this._fetchFiles(); } catch { /* api handles */ }
      });
      input.click();
    });
    await this._fetchFiles();
  }

  async _fetchFiles() {
    try { const res = await api.get(`${this._apiBase}/${this._id}/files`, { showError: false });
      const items = res.rows || res.items || res.files || [];
      this._table.setData(items, items.length, 1); } catch { this._table.setData([], 0, 1); }
  }

  async _save() {
    const data = {};
    this._tabContent.querySelectorAll('[data-field]').forEach(el => {
      if (!el.readOnly) data[el.dataset.field] = el.value;
    });
    if (Object.keys(data).length === 0) return;
    try { await api.put(`${this._apiBase}/${this._id}`, data); Toast.success('저장 완료'); } catch { /* api handles */ }
  }

  async _doAction(action) {
    try { await api.post(`${this._apiBase}/${this._id}/${action}`, {}); Toast.success('처리 완료'); this.mount(this._el); } catch { /* api handles */ }
  }
}
