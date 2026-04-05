/* WorkReportListPage — 작업 보고서 목록 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';

const STATUS_LABELS = {
  REVIEW:'검토중', APPROVED:'승인', SCHEDULED:'예정',
  IN_PROGRESS:'진행중', COMPLETED:'완료', ARCHIVED:'보관',
  CANCELLED:'취소', REJECTED:'반려', DRAFT:'초안',
};
const STATUS_BADGE = {
  REVIEW:'info', APPROVED:'success', SCHEDULED:'warning',
  IN_PROGRESS:'primary', COMPLETED:'success', ARCHIVED:'muted',
  CANCELLED:'danger', REJECTED:'danger', DRAFT:'muted',
};

export default class WorkReportListPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
    this._items = [];
    this._search = query.q || '';
    this._page = 1;
    this._total = 0;
    this._pageSize = 20;
    this._viewMode = 'list';  // 'list' | 'system'
  }

  async mount(container) {
    this._el = container;
    await this._load();
  }

  unmount() {}

  async _load() {
    try {
      if (this._viewMode === 'system') {
        const res = await api.get('/api/wrk/reports/by-system', { showError: false });
        this._items = res.items || res.rows || [];
        this._total = this._items.length;
      } else {
        const res = await api.get(`/api/wrk/reports?page=${this._page}&per_page=${this._pageSize}&search=${encodeURIComponent(this._search)}`, { showError: false });
        this._items = res.items || res.rows || [];
        this._total = res.total || this._items.length;
      }
    } catch {
      this._items = [];
      this._total = 0;
    }
    this._render();
  }

  _filtered() {
    if (this._viewMode === 'system') return this._items;
    const q = this._search.toLowerCase();
    if (!q) return this._items;
    return this._items.filter(r =>
      (r.task_title||'').toLowerCase().includes(q) ||
      (r.doc_no||'').toLowerCase().includes(q) ||
      (r.status||'').toLowerCase().includes(q) ||
      (r.overview||'').toLowerCase().includes(q)
    );
  }

  _render() {
    const rows = this._filtered();
    const totalPages = Math.max(1, Math.ceil(this._total / this._pageSize));

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">작업 보고서</h2>
          <div class="spa-page-header__actions">
            <div class="spa-btn-group">
              <button class="spa-btn spa-btn--sm ${this._viewMode === 'list' ? 'spa-btn--primary' : 'spa-btn--outline'}" data-view="list">목록</button>
              <button class="spa-btn spa-btn--sm ${this._viewMode === 'system' ? 'spa-btn--primary' : 'spa-btn--outline'}" data-view="system">시스템별</button>
            </div>
            <input type="text" class="spa-input" id="wrk-search" placeholder="제목/문서번호 검색..." value="${esc(this._search)}" style="width:220px">
            <button class="spa-btn spa-btn--outline" id="wrk-export">CSV 내보내기</button>
            <button class="spa-btn spa-btn--primary" id="wrk-new">+ 작성</button>
          </div>
        </div>

        <div class="spa-stats-bar">
          <span class="spa-text-muted">총 ${this._total}건</span>
        </div>

        ${this._viewMode === 'system' ? this._renderSystemView(rows) : this._renderListView(rows)}

        ${this._viewMode === 'list' && totalPages > 1 ? `
          <div class="spa-pagination">
            <button class="spa-btn spa-btn--sm spa-btn--outline" data-pg="${this._page - 1}" ${this._page <= 1 ? 'disabled' : ''}>← 이전</button>
            <span class="spa-text-muted">${this._page} / ${totalPages}</span>
            <button class="spa-btn spa-btn--sm spa-btn--outline" data-pg="${this._page + 1}" ${this._page >= totalPages ? 'disabled' : ''}>다음 →</button>
          </div>` : ''}
      </div>`;

    this._bind();
  }

  _renderListView(rows) {
    if (!rows.length) return '<div class="spa-empty">작업 보고서가 없습니다.</div>';
    return `<div class="spa-admin-table-wrap">
      <table class="spa-dt-table">
        <thead><tr>
          <th>문서번호</th><th>제목</th><th>상태</th><th>서비스</th>
          <th>시작</th><th>종료</th><th>작성일</th>
        </tr></thead>
        <tbody>${rows.map(r => `<tr class="spa-row-clickable" data-id="${r.id}">
          <td>${esc(r.doc_no||'')}</td>
          <td>${esc(r.task_title||'')}</td>
          <td><span class="spa-badge spa-badge--${STATUS_BADGE[r.status]||'muted'}">${STATUS_LABELS[r.status]||esc(r.status||'')}</span></td>
          <td>${esc(r.service||'')}</td>
          <td>${esc(r.start_datetime||'')}</td>
          <td>${esc(r.end_datetime||'')}</td>
          <td>${esc(r.draft_date||r.created_at||'')}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  _renderSystemView(rows) {
    if (!rows.length) return '<div class="spa-empty">시스템별 데이터가 없습니다.</div>';
    return `<div class="spa-admin-cards" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
      ${rows.map(s => `<div class="spa-work-system-card">
        <h4>${esc(s.system_name || s.name || '미분류')}</h4>
        <div class="spa-work-system-stats">
          <span>총 ${s.total || s.count || 0}건</span>
          ${s.completed ? `<span class="spa-badge spa-badge--success">완료 ${s.completed}</span>` : ''}
          ${s.in_progress ? `<span class="spa-badge spa-badge--primary">진행 ${s.in_progress}</span>` : ''}
          ${s.review ? `<span class="spa-badge spa-badge--info">검토 ${s.review}</span>` : ''}
        </div>
      </div>`).join('')}
    </div>`;
  }

  _bind() {
    this._el.querySelector('#wrk-search')?.addEventListener('input', e => {
      this._search = e.target.value;
      this._page = 1;
      this._load();
    });
    this._el.querySelector('#wrk-new')?.addEventListener('click', () => {
      this._createReport();
    });
    this._el.querySelector('#wrk-export')?.addEventListener('click', () => this._exportCsv());
    this._el.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._viewMode = btn.dataset.view;
        this._load();
      });
    });
    this._el.querySelectorAll('[data-id]').forEach(row => {
      row.addEventListener('click', () => {
        this._router.navigate('/work/reports/' + row.dataset.id);
      });
    });
    this._el.querySelectorAll('[data-pg]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.dataset.pg, 10);
        if (p >= 1) { this._page = p; this._load(); }
      });
    });
  }

  async _createReport() {
    try {
      const res = await api.post('/api/wrk/reports', { task_title: '새 작업 보고서', status: 'DRAFT' });
      if (res.success && res.item) {
        this._router.navigate('/work/reports/' + res.item.id);
      } else {
        await this._load();
      }
    } catch { /* api-client handles toast */ }
  }

  _exportCsv() {
    const rows = this._filtered();
    const header = ['문서번호','제목','상태','서비스','시작','종료','작성일'];
    const lines = rows.map(r =>
      [r.doc_no, r.task_title, STATUS_LABELS[r.status]||r.status, r.service, r.start_datetime, r.end_datetime, r.draft_date||r.created_at]
        .map(v => `"${String(v||'').replace(/"/g,'""')}"`)
        .join(',')
    );
    const csv = '\uFEFF' + header.join(',') + '\n' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = '작업보고서_목록.csv';
    a.click(); URL.revokeObjectURL(a.href);
  }
}
