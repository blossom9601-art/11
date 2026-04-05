/* WorkReportDetailPage — 작업 보고서 상세 + 결재 워크플로우 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';

const STATUS_LABELS = {
  DRAFT:'초안', REVIEW:'검토중', APPROVED:'승인', SCHEDULED:'예정',
  IN_PROGRESS:'진행중', COMPLETED:'완료', ARCHIVED:'보관',
  CANCELLED:'취소', REJECTED:'반려',
};
const STATUS_BADGE = {
  DRAFT:'muted', REVIEW:'info', APPROVED:'success', SCHEDULED:'warning',
  IN_PROGRESS:'primary', COMPLETED:'success', ARCHIVED:'muted',
  CANCELLED:'danger', REJECTED:'danger',
};

const TABS = [
  { key: 'basic',    label: '기본 정보' },
  { key: 'detail',   label: '상세 내용' },
  { key: 'result',   label: '수행 결과' },
  { key: 'approval', label: '결재 이력' },
  { key: 'comments', label: '댓글' },
  { key: 'files',    label: '첨부파일' },
];

export default class WorkReportDetailPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._id = params.id;
    this._el = null;
    this._report = null;
    this._tab = 'basic';
    this._comments = [];
    this._files = [];
  }

  async mount(container) {
    this._el = container;
    await this._load();
  }

  unmount() {}

  async _load() {
    try {
      const res = await api.get(`/api/wrk/reports/${this._id}`, { showError: false });
      this._report = res.item || res;
    } catch {
      this._report = null;
    }
    this._render();
  }

  _render() {
    if (!this._report) {
      this._el.innerHTML = '<div class="spa-page"><div class="spa-empty">보고서를 찾을 수 없습니다.</div></div>';
      return;
    }
    const r = this._report;
    const st = r.status || 'DRAFT';

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon" id="btn-back">← 목록</button>
          <h2 class="spa-page__title">${esc(r.task_title||'작업 보고서')}</h2>
          <div class="spa-page-header__actions">
            <span class="spa-badge spa-badge--${STATUS_BADGE[st]||'muted'}" style="font-size:0.95rem">${STATUS_LABELS[st]||esc(st)}</span>
            ${this._renderActions(st)}
          </div>
        </div>

        <div class="spa-detail-meta">
          <span>문서번호: <b>${esc(r.doc_no||'-')}</b></span>
          <span>서비스: <b>${esc(r.service||'-')}</b></span>
          <span>작성일: <b>${esc(r.draft_date||r.created_at||'-')}</b></span>
        </div>

        <div class="spa-tab-bar">
          ${TABS.map(t => `<button class="spa-tab-btn ${this._tab === t.key ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
        </div>

        <div class="spa-tab-content" id="wrk-tab-content"></div>
      </div>`;

    this._el.querySelector('#btn-back')?.addEventListener('click', () => {
      this._router.navigate('/work/reports');
    });
    this._el.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._tab = btn.dataset.tab;
        this._render();
      });
    });
    this._el.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => this._doAction(btn.dataset.action));
    });

    this._renderTab();
  }

  _renderActions(st) {
    const btns = [];
    if (st === 'DRAFT')       btns.push(['submit', '제출', 'primary']);
    if (st === 'REVIEW')      btns.push(['approve-init', '결재요청', 'primary'], ['reject', '반려', 'danger-outline'], ['recall', '회수', 'outline']);
    if (st === 'APPROVED')    btns.push(['submit-result', '결과등록', 'primary']);
    if (st === 'SCHEDULED')   btns.push(['cancel', '취소', 'danger-outline']);
    if (st === 'IN_PROGRESS') btns.push(['submit-result', '완료처리', 'primary']);
    if (st === 'COMPLETED')   btns.push(['approve-final', '최종승인', 'primary']);
    return btns.map(([a, l, c]) => `<button class="spa-btn spa-btn--${c}" data-action="${a}">${l}</button>`).join('');
  }

  async _doAction(action) {
    if (!confirm('이 작업을 진행하시겠습니까?')) return;
    try {
      await api.post(`/api/wrk/reports/${this._id}/${action}`, {});
      await this._load();
    } catch { /* handled */ }
  }

  async _renderTab() {
    const box = this._el.querySelector('#wrk-tab-content');
    if (!box) return;
    const r = this._report;

    switch (this._tab) {
      case 'basic':
        box.innerHTML = `<div class="spa-detail-card">
          ${this._field('제목', r.task_title)}
          ${this._field('문서번호', r.doc_no)}
          ${this._field('서비스', r.service)}
          ${this._field('개요', r.overview)}
          ${this._field('시작 일시', r.start_datetime)}
          ${this._field('종료 일시', r.end_datetime)}
          ${this._field('프로젝트', r.project_name || r.project_id)}
        </div>
        <div style="margin-top:1rem;text-align:right">
          <button class="spa-btn spa-btn--primary" id="wrk-edit-basic">편집</button>
        </div>`;
        box.querySelector('#wrk-edit-basic')?.addEventListener('click', () => this._editBasic());
        break;

      case 'detail':
        box.innerHTML = `<div class="spa-detail-card">
          ${this._field('사전점검 (Pre-check)', r.precheck)}
          ${this._field('작업절차 (Procedure)', r.procedure)}
          ${this._field('사후점검 (Post-check)', r.postcheck)}
          ${this._field('소요자원', r.resources)}
          ${this._field('기타', r.etc)}
        </div>`;
        break;

      case 'result':
        box.innerHTML = `<div class="spa-detail-card">
          ${this._field('결과유형', r.result_type)}
          ${this._field('실제 시작', r.actual_start_time)}
          ${this._field('실제 종료', r.actual_end_time)}
          ${this._field('소요시간', r.actual_duration)}
          ${this._field('영향도', r.impact)}
          ${this._field('결과 내용', r.report_result)}
          ${r.cancel_reason ? this._field('취소사유', r.cancel_reason) : ''}
        </div>`;
        break;

      case 'approval':
        await this._loadApproval(box);
        break;

      case 'comments':
        await this._loadComments(box);
        break;

      case 'files':
        await this._loadFiles(box);
        break;
    }
  }

  _field(label, value) {
    return `<div class="spa-detail-row">
      <span class="spa-detail-label">${esc(label)}</span>
      <span class="spa-detail-value">${esc(value||'-')}</span>
    </div>`;
  }

  async _editBasic() {
    const r = this._report;
    const box = this._el.querySelector('#wrk-tab-content');
    box.innerHTML = `<div class="spa-admin-form" style="max-width:600px">
      <label>제목 <input type="text" class="spa-input" id="ed-title" value="${esc(r.task_title||'')}"></label>
      <label>서비스 <input type="text" class="spa-input" id="ed-service" value="${esc(r.service||'')}"></label>
      <label>개요 <textarea class="spa-input" id="ed-overview" rows="3">${esc(r.overview||'')}</textarea></label>
      <label>시작 일시 <input type="datetime-local" class="spa-input" id="ed-start" value="${esc(r.start_datetime||'')}"></label>
      <label>종료 일시 <input type="datetime-local" class="spa-input" id="ed-end" value="${esc(r.end_datetime||'')}"></label>
      <div style="margin-top:1rem">
        <button class="spa-btn spa-btn--primary" id="ed-save">저장</button>
        <button class="spa-btn spa-btn--outline" id="ed-cancel">취소</button>
      </div>
    </div>`;
    box.querySelector('#ed-save')?.addEventListener('click', async () => {
      try {
        await api.put(`/api/wrk/reports/${this._id}`, {
          task_title: box.querySelector('#ed-title').value,
          service: box.querySelector('#ed-service').value,
          overview: box.querySelector('#ed-overview').value,
          start_datetime: box.querySelector('#ed-start').value,
          end_datetime: box.querySelector('#ed-end').value,
        });
        await this._load();
      } catch { /* handled */ }
    });
    box.querySelector('#ed-cancel')?.addEventListener('click', () => { this._tab = 'basic'; this._render(); });
  }

  async _loadApproval(box) {
    // Approval info is typically embedded in the report or fetched separately
    const approvals = this._report.approvals || [];
    box.innerHTML = `<div class="spa-admin-table-wrap">
      <table class="spa-dt-table">
        <thead><tr><th>단계</th><th>승인자</th><th>상태</th><th>일시</th><th>의견</th></tr></thead>
        <tbody>${approvals.length === 0 ? '<tr><td colspan="5" class="spa-text-muted" style="text-align:center">결재 이력이 없습니다.</td></tr>' :
          approvals.map(a => `<tr>
            <td>${esc(a.phase||a.step||'')}</td>
            <td>${esc(a.approver_name||a.approver||'')}</td>
            <td><span class="spa-badge spa-badge--${a.approved ? 'success' : a.rejected ? 'danger' : 'muted'}">${a.approved ? '승인' : a.rejected ? '반려' : '대기'}</span></td>
            <td>${esc(a.approved_at||a.created_at||'')}</td>
            <td>${esc(a.comment||'')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  async _loadComments(box) {
    try {
      const res = await api.get(`/api/wrk/reports/${this._id}/comments`, { showError: false });
      this._comments = res.items || res.rows || [];
    } catch {
      this._comments = [];
    }
    box.innerHTML = `
      <div class="spa-comments">
        ${this._comments.length === 0 ? '<p class="spa-text-muted">댓글이 없습니다.</p>' :
          this._comments.map(c => `<div class="spa-comment">
            <div class="spa-comment__header">
              <b>${esc(c.author_name||c.user_name||'')}</b>
              <span class="spa-text-muted">${esc(c.created_at||'')}</span>
            </div>
            <p>${esc(c.content||c.text||'')}</p>
          </div>`).join('')}
      </div>
      <div class="spa-comment-form">
        <textarea class="spa-input" id="wrk-comment" rows="2" placeholder="댓글 입력..."></textarea>
        <button class="spa-btn spa-btn--primary spa-btn--sm" id="wrk-comment-add" style="margin-top:0.5rem">등록</button>
      </div>`;
    box.querySelector('#wrk-comment-add')?.addEventListener('click', async () => {
      const text = box.querySelector('#wrk-comment')?.value?.trim();
      if (!text) return;
      try {
        await api.post(`/api/wrk/reports/${this._id}/comments`, { content: text });
        await this._loadComments(box);
      } catch { /* handled */ }
    });
  }

  async _loadFiles(box) {
    try {
      const res = await api.get(`/api/wrk/reports/${this._id}/files`, { showError: false });
      this._files = res.items || res.rows || [];
    } catch {
      this._files = [];
    }
    box.innerHTML = `
      <div class="spa-admin-table-wrap">
        <table class="spa-dt-table">
          <thead><tr><th>파일명</th><th>크기</th><th>등록일</th><th>작업</th></tr></thead>
          <tbody>${this._files.length === 0 ? '<tr><td colspan="4" class="spa-text-muted" style="text-align:center">첨부파일이 없습니다.</td></tr>' :
            this._files.map(f => `<tr>
              <td>${esc(f.filename||f.name||'')}</td>
              <td>${f.size ? Math.round(f.size/1024)+'KB' : '-'}</td>
              <td>${esc(f.created_at||'')}</td>
              <td><button class="spa-btn spa-btn--sm spa-btn--outline" data-del-file="${f.id}">삭제</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="margin-top:0.75rem">
        <input type="file" id="wrk-file-input" style="display:none">
        <button class="spa-btn spa-btn--outline" id="wrk-file-add">+ 파일 첨부</button>
      </div>`;
    box.querySelector('#wrk-file-add')?.addEventListener('click', () => {
      box.querySelector('#wrk-file-input')?.click();
    });
    box.querySelector('#wrk-file-input')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('file', file);
      try {
        await api.upload(`/api/wrk/reports/${this._id}/files`, fd);
        await this._loadFiles(box);
      } catch { /* handled */ }
    });
    box.querySelectorAll('[data-del-file]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('파일을 삭제하시겠습니까?')) return;
        try {
          await api.delete(`/api/wrk/reports/${this._id}/files/${btn.dataset.delFile}`);
          await this._loadFiles(box);
        } catch { /* handled */ }
      });
    });
  }
}
