/* WorkflowEditorPage — 워크플로우 디자이너 편집기 */
import { api }           from '../../shared/api-client.js';
import { h, esc }        from '../../shared/dom-utils.js';
import { LoadingSpinner } from '../../widgets/LoadingSpinner.js';
import { Toast }         from '../../widgets/Toast.js';

export default class WorkflowEditorPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._id     = params.id || query.id;
    this._el     = null;
    this._data   = null;
    this._dirty  = false;
  }

  async mount(container) {
    this._el = container;
    if (this._id) {
      this._el.innerHTML = '<div class="spa-page"><div id="loading"></div></div>';
      const sp = new LoadingSpinner(); sp.mount(this._el.querySelector('#loading'));
      try { const r = await api.get(`/api/work/workflows/${this._id}`); this._data = r.item || r; } catch { this._data = { name: '', steps: [] }; }
      sp.unmount();
    } else {
      this._data = { name: '새 워크플로우', steps: [] };
    }
    this._render();
  }

  _render() {
    const d = this._data;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <h2 class="spa-page__title">워크플로우 디자이너</h2>
          <div class="spa-page-header__actions">
            <button class="spa-btn spa-btn--secondary" data-back>← 목록</button>
            <button class="spa-btn spa-btn--primary" data-save>저장</button>
          </div>
        </div>
        <div class="spa-wf-editor">
          <div class="spa-wf-editor__sidebar">
            <h3>속성</h3>
            <label>이름</label>
            <input type="text" id="wf-name" class="spa-input" value="${esc(d.name || '')}">
            <label>설명</label>
            <textarea id="wf-desc" class="spa-input" rows="3">${esc(d.description || '')}</textarea>
            <hr>
            <h3>단계 목록</h3>
            <div id="step-list"></div>
            <button class="spa-btn spa-btn--secondary spa-btn--sm" data-add-step>+ 단계 추가</button>
          </div>
          <div class="spa-wf-editor__canvas" id="wf-canvas">
            <div class="spa-wf-editor__placeholder">워크플로우 캔버스 — 좌측에서 단계를 추가하세요</div>
          </div>
        </div>
      </div>`;
    this._el.querySelector('[data-back]').onclick = () => this._router.navigate('/work/designer');
    this._el.querySelector('[data-save]').onclick = () => this._save();
    this._el.querySelector('[data-add-step]').onclick = () => this._addStep();
    this._renderSteps();
  }

  _renderSteps() {
    const list = this._el.querySelector('#step-list');
    const steps = this._data.steps || [];
    if (!steps.length) { list.innerHTML = '<p style="color:var(--text-muted)">단계 없음</p>'; return; }
    list.innerHTML = steps.map((s, i) =>
      `<div class="spa-wf-step" data-idx="${i}">
        <span class="spa-wf-step__num">${i + 1}</span>
        <input class="spa-input spa-input--sm" value="${esc(s.name || '')}" data-step-name="${i}">
        <button class="spa-btn--icon" data-del-step="${i}" title="삭제">&times;</button>
      </div>`
    ).join('');
    list.querySelectorAll('[data-step-name]').forEach(inp => {
      inp.oninput = () => { this._data.steps[+inp.dataset.stepName].name = inp.value; this._dirty = true; };
    });
    list.querySelectorAll('[data-del-step]').forEach(btn => {
      btn.onclick = () => { this._data.steps.splice(+btn.dataset.delStep, 1); this._renderSteps(); this._dirty = true; };
    });
    this._renderCanvas();
  }

  _renderCanvas() {
    const canvas = this._el.querySelector('#wf-canvas');
    const steps = this._data.steps || [];
    if (!steps.length) { canvas.innerHTML = '<div class="spa-wf-editor__placeholder">워크플로우 캔버스 — 좌측에서 단계를 추가하세요</div>'; return; }
    canvas.innerHTML = steps.map((s, i) =>
      `<div class="spa-wf-node">${esc(s.name || '단계 ' + (i + 1))}</div>${i < steps.length - 1 ? '<div class="spa-wf-arrow">→</div>' : ''}`
    ).join('');
  }

  _addStep() {
    if (!this._data.steps) this._data.steps = [];
    this._data.steps.push({ name: '새 단계', type: 'task', config: {} });
    this._dirty = true;
    this._renderSteps();
  }

  async _save() {
    const name = this._el.querySelector('#wf-name')?.value;
    const desc = this._el.querySelector('#wf-desc')?.value;
    const body = { ...this._data, name, description: desc };
    try {
      if (this._id) { await api.put(`/api/work/workflows/${this._id}`, body); }
      else { const r = await api.post('/api/work/workflows', body); this._id = r.item?.id; }
      Toast.success('저장되었습니다.');
      this._dirty = false;
    } catch (e) { Toast.error('저장 실패: ' + (e.message || '')); }
  }

  unmount() {}
}
