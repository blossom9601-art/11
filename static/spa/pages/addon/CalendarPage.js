/* CalendarPage — 캘린더/일정 관리 */
import { api } from '../../shared/api-client.js';
import { esc } from '../../shared/dom-utils.js';
import { Modal } from '../../widgets/Modal.js';

export default class CalendarPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el = null;
    this._schedules = [];
    this._year = new Date().getFullYear();
    this._month = new Date().getMonth(); // 0-indexed
    this._selectedDate = null;
    this._view = 'month'; // 'month' | 'list'
  }

  async mount(container) {
    this._el = container;
    await this._load();
  }

  unmount() {}

  async _load() {
    const start = `${this._year}-${String(this._month + 1).padStart(2,'0')}-01`;
    const endMonth = this._month === 11 ? 1 : this._month + 2;
    const endYear  = this._month === 11 ? this._year + 1 : this._year;
    const end = `${endYear}-${String(endMonth).padStart(2,'0')}-01`;
    try {
      const res = await api.get(`/api/calendar/schedules?start=${start}&end=${end}`, { showError: false });
      this._schedules = res.items || res.rows || [];
    } catch {
      this._schedules = [];
    }
    this._render();
  }

  _render() {
    const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">캘린더</h2>
          <div class="spa-page-header__actions">
            <button class="spa-btn spa-btn--sm spa-btn--outline" id="cal-prev">◀</button>
            <span class="spa-cal-title">${this._year}년 ${monthNames[this._month]}</span>
            <button class="spa-btn spa-btn--sm spa-btn--outline" id="cal-next">▶</button>
            <div class="spa-btn-group" style="margin-left:1rem">
              <button class="spa-btn spa-btn--sm ${this._view === 'month' ? 'spa-btn--primary' : 'spa-btn--outline'}" data-view="month">월</button>
              <button class="spa-btn spa-btn--sm ${this._view === 'list' ? 'spa-btn--primary' : 'spa-btn--outline'}" data-view="list">목록</button>
            </div>
            <button class="spa-btn spa-btn--primary spa-btn--sm" id="cal-add">+ 일정</button>
          </div>
        </div>

        <div id="cal-content">
          ${this._view === 'month' ? this._renderCalendar() : this._renderList()}
        </div>

        ${this._selectedDate ? this._renderDayDetail() : ''}
      </div>`;

    this._bind();
  }

  _renderCalendar() {
    const firstDay = new Date(this._year, this._month, 1).getDay();
    const daysInMonth = new Date(this._year, this._month + 1, 0).getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    let html = '<div class="spa-cal-grid"><div class="spa-cal-header">';
    for (const d of ['일','월','화','수','목','금','토']) {
      html += `<div class="spa-cal-weekday">${d}</div>`;
    }
    html += '</div><div class="spa-cal-body">';

    for (let i = 0; i < firstDay; i++) html += '<div class="spa-cal-cell spa-cal-cell--empty"></div>';

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${this._year}-${String(this._month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const events = this._schedules.filter(s =>
        (s.start_date||s.date||'').substring(0, 10) <= dateStr &&
        (s.end_date||s.start_date||s.date||'').substring(0, 10) >= dateStr
      );
      const isToday = dateStr === todayStr;
      html += `<div class="spa-cal-cell ${isToday ? 'spa-cal-cell--today' : ''}" data-date="${dateStr}">
        <span class="spa-cal-day">${d}</span>
        ${events.slice(0, 3).map(e => `<div class="spa-cal-event" title="${esc(e.title||'')}">${esc((e.title||'').substring(0, 8))}</div>`).join('')}
        ${events.length > 3 ? `<div class="spa-cal-more">+${events.length - 3}건</div>` : ''}
      </div>`;
    }
    html += '</div></div>';
    return html;
  }

  _renderList() {
    if (this._schedules.length === 0) return '<div class="spa-empty">이번 달 일정이 없습니다.</div>';
    return `<div class="spa-admin-table-wrap">
      <table class="spa-dt-table">
        <thead><tr><th>제목</th><th>시작</th><th>종료</th><th>장소</th><th>작업</th></tr></thead>
        <tbody>${this._schedules.map(s => `<tr>
          <td>${esc(s.title||'')}</td>
          <td>${esc(s.start_date||s.date||'')}</td>
          <td>${esc(s.end_date||'')}</td>
          <td>${esc(s.location||'')}</td>
          <td><button class="spa-btn spa-btn--sm spa-btn--danger-outline" data-del-sch="${s.id}">삭제</button></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  _renderDayDetail() {
    const events = this._schedules.filter(s =>
      (s.start_date||s.date||'').substring(0, 10) <= this._selectedDate &&
      (s.end_date||s.start_date||s.date||'').substring(0, 10) >= this._selectedDate
    );
    return `<div class="spa-cal-day-detail" style="margin-top:1.5rem">
      <h4>${this._selectedDate} 일정 (${events.length}건)</h4>
      ${events.length === 0 ? '<p class="spa-text-muted">일정이 없습니다.</p>' :
        events.map(e => `<div class="spa-detail-card" style="margin-bottom:.5rem">
          <div class="spa-detail-row"><span class="spa-detail-label">제목</span><span class="spa-detail-value">${esc(e.title||'')}</span></div>
          <div class="spa-detail-row"><span class="spa-detail-label">시간</span><span class="spa-detail-value">${esc(e.start_date||'')} ~ ${esc(e.end_date||'')}</span></div>
          <div class="spa-detail-row"><span class="spa-detail-label">장소</span><span class="spa-detail-value">${esc(e.location||'-')}</span></div>
        </div>`).join('')}
    </div>`;
  }

  _bind() {
    this._el.querySelector('#cal-prev')?.addEventListener('click', () => {
      this._month--;
      if (this._month < 0) { this._month = 11; this._year--; }
      this._selectedDate = null;
      this._load();
    });
    this._el.querySelector('#cal-next')?.addEventListener('click', () => {
      this._month++;
      if (this._month > 11) { this._month = 0; this._year++; }
      this._selectedDate = null;
      this._load();
    });
    this._el.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => { this._view = btn.dataset.view; this._render(); });
    });
    this._el.querySelector('#cal-add')?.addEventListener('click', () => this._addSchedule());
    this._el.querySelectorAll('[data-date]').forEach(cell => {
      cell.addEventListener('click', () => {
        this._selectedDate = cell.dataset.date;
        this._render();
      });
    });
    this._el.querySelectorAll('[data-del-sch]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('일정을 삭제하시겠습니까?')) return;
        try {
          await api.delete(`/api/calendar/schedules/${btn.dataset.delSch}`);
          await this._load();
        } catch { /* handled */ }
      });
    });
  }

  async _addSchedule() {
    const defDate = `${this._year}-${String(this._month+1).padStart(2,'0')}-01`;
    const modal = new Modal({
      title: '일정 추가',
      content: `<div class="spa-form-group"><label class="spa-label">제목</label><input type="text" class="spa-input" id="modal-title" placeholder="일정 제목" autofocus></div>
        <div class="spa-form-group"><label class="spa-label">날짜</label><input type="date" class="spa-input" id="modal-date" value="${defDate}"></div>`,
      size: 'sm',
      confirmText: '등록',
      onConfirm: async () => {
        const title = modal._el.querySelector('#modal-title')?.value?.trim();
        const startDate = modal._el.querySelector('#modal-date')?.value;
        if (!title || !startDate) return;
        modal.close();
        try {
          await api.post('/api/calendar/schedules', { title, start_date: startDate, end_date: startDate });
          await this._load();
        } catch { /* handled */ }
      },
    });
    modal.open();
  }
}
