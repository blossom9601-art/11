/* ============================================================
 *  Tab83Schedule — 일정관리 (Gantt)
 *  ============================================================
 *  WBS(scope) 데이터를 읽어 Gantt 차트로 시각화
 *  API: GET /api/prj/projects/<id>/tabs/scope (읽기 전용)
 * ============================================================ */

import { api }              from '../../../shared/api-client.js';
import { esc }              from '../../../shared/dom-utils.js';
import { fetchQuery }       from '../../../shared/bq.js';

export default class Tab83Schedule {
  constructor({ projectId, project, tabKey, access, router }) {
    this._projectId = projectId;
    this._project   = project;
    this._el        = null;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = '<div class="spa-tab-panel"><div class="spa-loading">일정 데이터 로딩 중...</div></div>';
    await this._fetchAndRender();
  }

  unmount() {}

  async _fetchAndRender() {
    const url = `/api/prj/projects/${this._projectId}/tabs/scope`;
    const result = await fetchQuery(['project', this._projectId, 'tab', 'scope'], () =>
      api.get(url, { showError: false })
    );

    const wbs = (result.items || []).map(item => {
      const p = typeof item.payload === 'string' ? JSON.parse(item.payload) : (item.payload || {});
      return p;
    }).filter(p => p.startDate && p.endDate);

    if (!wbs.length) {
      this._el.innerHTML = '<div class="spa-tab-panel"><div class="spa-empty-state"><p>WBS 데이터가 없습니다. 범위관리/WBS 탭에서 작업을 등록하세요.</p></div></div>';
      return;
    }

    /* 간단한 Gantt 테이블 렌더 */
    const minDate = new Date(Math.min(...wbs.map(w => new Date(w.startDate))));
    const maxDate = new Date(Math.max(...wbs.map(w => new Date(w.endDate))));
    const totalDays = Math.max(1, (maxDate - minDate) / 86400000 + 1);

    let html = '<div class="spa-tab-panel"><table class="spa-table spa-gantt-table">';
    html += '<thead><tr><th style="width:200px">작업</th><th style="width:80px">담당자</th><th style="width:80px">시작일</th><th style="width:80px">종료일</th><th>Gantt</th></tr></thead><tbody>';

    for (const w of wbs) {
      const s = new Date(w.startDate), e = new Date(w.endDate);
      const left = ((s - minDate) / 86400000) / totalDays * 100;
      const width = Math.max(1, ((e - s) / 86400000 + 1) / totalDays * 100);
      const resultClass = w.result === '완료' ? 'spa-gantt--done' : w.result === '지연' ? 'spa-gantt--late' : '';

      html += `<tr>
        <td>${esc(w.task || w.activity || '-')}</td>
        <td>${esc(w.owner || '-')}</td>
        <td>${esc(w.startDate)}</td>
        <td>${esc(w.endDate)}</td>
        <td><div class="spa-gantt-bar-wrap"><div class="spa-gantt-bar ${resultClass}" style="left:${left}%;width:${width}%"></div></div></td>
      </tr>`;
    }

    html += '</tbody></table></div>';
    this._el.innerHTML = html;
  }

  async save() { return true; }
}
