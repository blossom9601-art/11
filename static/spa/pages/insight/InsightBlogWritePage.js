/* InsightBlogWritePage — 블로그 게시글 작성 */
import { api }   from '../../shared/api-client.js';
import { esc }   from '../../shared/dom-utils.js';
import { Toast } from '../../widgets/Toast.js';

export default class InsightBlogWritePage {
  constructor({ params, query, router }) {
    this._router = router;
    this._el     = null;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 블로그</button>
          <h2 class="spa-page__title">새 게시글 작성</h2>
        </div>
        <div class="spa-form" style="max-width:720px">
          <div class="spa-form-group">
            <label class="spa-form-label">제목</label>
            <input type="text" class="spa-form-input" id="field-title" placeholder="제목을 입력하세요">
          </div>
          <div class="spa-form-group">
            <label class="spa-form-label">태그 (쉼표 구분)</label>
            <input type="text" class="spa-form-input" id="field-tags" placeholder="예: 클라우드, 보안, DevOps">
          </div>
          <div class="spa-form-group">
            <label class="spa-form-label">내용</label>
            <textarea class="spa-form-textarea" id="field-content" rows="16" placeholder="게시글 내용을 입력하세요..."></textarea>
          </div>
          <div class="spa-form-actions">
            <button class="spa-btn" id="btn-cancel">취소</button>
            <button class="spa-btn spa-btn--primary" id="btn-save">저장</button>
          </div>
        </div>
      </div>`;

    this._el.querySelector('#btn-back').addEventListener('click', () => this._router.navigate('/insight/blog'));
    this._el.querySelector('#btn-cancel').addEventListener('click', () => this._router.navigate('/insight/blog'));
    this._el.querySelector('#btn-save').addEventListener('click', () => this._save());
  }

  unmount() {}

  async _save() {
    const title = this._el.querySelector('#field-title').value.trim();
    const tags  = this._el.querySelector('#field-tags').value.trim();
    const content = this._el.querySelector('#field-content').value.trim();

    if (!title) { Toast.error('제목을 입력하세요.'); return; }
    if (!content) { Toast.error('내용을 입력하세요.'); return; }

    try {
      await api.post('/api/insight/blog/posts', {
        title,
        tags: tags || '',
        contentHtml: '<p>' + esc(content).replace(/\n/g, '</p><p>') + '</p>',
      });
      Toast.success('저장되었습니다.');
      this._router.navigate('/insight/blog');
    } catch {
      Toast.error('저장에 실패했습니다.');
    }
  }
}
