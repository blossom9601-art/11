/* Tab15 — 구성/파일: 다이어그램 + 첨부파일 관리 */

import { api }        from '../../../shared/api-client.js';
import { esc }        from '../../../shared/dom-utils.js';
import { LoadingSpinner } from '../../../widgets/LoadingSpinner.js';
import { Toast }      from '../../../widgets/Toast.js';
import { FileUpload } from '../../../widgets/FileUpload.js';
import { fetchQuery, invalidate } from '../../../shared/bq.js';

const SCOPE_MAP = {
  server:      'hw_server_onpremise_file',
  cloud:       'hw_server_cloud_file',
  frame:       'hw_frame_file',
  workstation: 'hw_workstation_file',
};

function ownerKey(scopeKey, assetId) {
  return scopeKey.replace(/_file$/, '') + ':' + assetId;
}

export default class Tab15File {
  constructor({ assetId, assetType }) {
    this._assetId   = assetId;
    this._assetType = assetType || 'server';
    this._scopeKey  = SCOPE_MAP[this._assetType] || SCOPE_MAP.server;
    this._ownerKey  = ownerKey(this._scopeKey, this._assetId);
    this._el        = null;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = LoadingSpinner.renderInline();
    await this._render();
  }

  unmount() {}

  async _render() {
    /* 다이어그램 + 첨부 파일 동시 조회 */
    const [diagRes, attachRes] = await Promise.all([
      this._fetchFiles('DIAGRAM'),
      this._fetchFiles('ATTACHMENT'),
    ]);

    const diagram     = (diagRes.items || [])[0] || null;
    const attachments = attachRes.items || [];

    this._el.innerHTML = `
      <div class="spa-tab-panel">
        <section class="spa-section">
          <div class="spa-section-header" style="display:flex;align-items:center;justify-content:space-between">
            <h4 class="spa-section-title">구성도</h4>
            <div id="diagram-upload"></div>
          </div>
          <div id="diagram-area" class="spa-diagram-area">
            ${diagram
              ? `<img src="${esc(diagram.download_url || diagram.raw_url || '')}" alt="구성도" style="max-width:100%;border-radius:6px" />`
              : '<p class="spa-text-muted">등록된 구성도가 없습니다.</p>'}
          </div>
        </section>

        <section class="spa-section" style="margin-top:24px">
          <div class="spa-section-header" style="display:flex;align-items:center;justify-content:space-between">
            <h4 class="spa-section-title">첨부파일</h4>
            <div id="attach-upload"></div>
          </div>
          ${attachments.length === 0
            ? '<p class="spa-text-muted">등록된 첨부파일이 없습니다.</p>'
            : this._renderFileList(attachments)}
        </section>
      </div>`;

    /* 구성도 업로드 위젯 */
    this._diagramUpload = new FileUpload({
      apiUrl: `/api/tab15-files`,
      ownerKey: this._ownerKey,
      accept: 'image/*',
      multiple: false,
      extraFields: { scope_key: this._scopeKey, entry_type: 'DIAGRAM' },
      onUploaded: () => this._refresh(),
    });
    this._diagramUpload.mount(this._el.querySelector('#diagram-upload'));

    /* 첨부파일 업로드 위젯 */
    this._attachUpload = new FileUpload({
      apiUrl: `/api/tab15-files`,
      ownerKey: this._ownerKey,
      multiple: true,
      extraFields: { scope_key: this._scopeKey, entry_type: 'ATTACHMENT' },
      onUploaded: () => this._refresh(),
    });
    this._attachUpload.mount(this._el.querySelector('#attach-upload'));

    /* 삭제 이벤트 위임 */
    this._el.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-del-file]');
      if (!btn) return;
      if (!confirm('파일을 삭제하시겠습니까?')) return;
      try {
        await api.delete(`/api/tab15-files/${btn.dataset.delFile}`);
        Toast.success('삭제 완료');
        this._refresh();
      } catch (ex) { Toast.error(ex.message || '삭제 실패'); }
    });
  }

  _renderFileList(files) {
    const rows = files.map(f => `
      <tr>
        <td>${esc(f.file_name || '-')}</td>
        <td>${this._formatSize(f.file_size)}</td>
        <td>${esc(f.description || '-')}</td>
        <td>${esc((f.created_at || '').slice(0, 10))}</td>
        <td>
          ${f.download_url ? `<a href="${esc(f.download_url)}" class="spa-link" download>다운로드</a>` : '-'}
          <button class="spa-btn spa-btn--ghost spa-btn--xs spa-text-danger" data-del-file="${f.id}">삭제</button>
        </td>
      </tr>`).join('');

    return `<table class="spa-dt-table" style="width:100%">
      <thead><tr>
        <th>파일명</th><th style="width:90px">크기</th><th>설명</th>
        <th style="width:100px">등록일</th><th style="width:120px"></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  _formatSize(bytes) {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async _fetchFiles(entryType) {
    const url = `/api/tab15-files?scope_key=${encodeURIComponent(this._scopeKey)}&owner_key=${encodeURIComponent(this._ownerKey)}&entry_type=${entryType}`;
    return await fetchQuery(
      ['tab15-files', this._ownerKey, entryType],
      () => api.get(url, { showError: false })
    );
  }

  _refresh() {
    invalidate(['tab15-files', this._ownerKey, 'DIAGRAM']);
    invalidate(['tab15-files', this._ownerKey, 'ATTACHMENT']);
    this._render();
  }
}
