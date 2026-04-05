/* GovernanceDetailPage — 거버넌스 정책 상세 + 탭 CRUD */
import { esc } from '../../shared/dom-utils.js';
import { api } from '../../shared/api-client.js';

/* ── 섹션별 탭 정의 ── */
const SECTION_TABS = {
  ip: [
    { key: 'basic',    label: '기본 정보' },
    { key: 'ranges',   label: 'IP 대역',    api: id => `/api/network/ip-policies/${id}/addresses` },
    { key: 'logs',     label: '변경 이력',   api: id => `/api/network/ip-policies/${id}/logs` },
    { key: 'files',    label: '첨부파일',   api: id => `/api/network/ip-policies/${id}/files`, isFile: true },
  ],
  dns: [
    { key: 'basic',    label: '기본 정보' },
    { key: 'records',  label: 'DNS 레코드',  api: id => `/api/network/dns-policies/${id}/records` },
    { key: 'logs',     label: '변경 이력',   api: id => `/api/network/dns-policies/${id}/logs` },
    { key: 'files',    label: '첨부파일',   api: id => `/api/network/dns-policies/${id}/files`, isFile: true },
  ],
  ad: [
    { key: 'basic',    label: '기본 정보' },
    { key: 'accounts', label: 'AD 계정',     api: id => `/api/network/ad/${id}/accounts` },
    { key: 'domains',  label: 'AD 도메인',   api: id => `/api/network/ad/${id}/fqdns` },
    { key: 'logs',     label: '변경 이력',   api: id => `/api/network/ad/${id}/logs` },
    { key: 'files',    label: '첨부파일',   api: id => `/api/network/ad/${id}/files`, isFile: true },
  ],
  vpn: [
    { key: 'basic',    label: '기본 정보' },
    { key: 'managers', label: '담당자',       api: id => `/api/network/vpn-lines/${id}/managers` },
    { key: 'comms',    label: '통신 현황',    api: id => `/api/network/vpn-lines/${id}/communications` },
    { key: 'policy',   label: 'VPN 정책',     api: id => `/api/network/vpn-lines/${id}/policy` },
    { key: 'logs',     label: '변경 이력',   api: id => `/api/network/vpn-lines/${id}/logs` },
    { key: 'files',    label: '첨부파일',   api: id => `/api/network/vpn-lines/${id}/files`, isFile: true },
  ],
  'leased-line': [
    { key: 'basic',    label: '기본 정보' },
    { key: 'managers', label: '담당자',       api: id => `/api/network/leased-lines/${id}/managers` },
    { key: 'logs',     label: '변경 이력',   api: id => `/api/network/leased-lines/${id}/logs` },
    { key: 'tasks',    label: '작업 이력',   api: id => `/api/network/leased-lines/${id}/tasks` },
    { key: 'files',    label: '첨부파일',   api: id => `/api/network/leased-lines/${id}/files`, isFile: true },
  ],
};

const SECTION_API = {
  ip: id => `/api/network/ip-policies/${id}`,
  dns: id => `/api/network/dns-policies/${id}`,
  ad: id => `/api/network/ad/${id}`,
  vpn: id => `/api/network/vpn-lines/${id}`,
  'leased-line': id => `/api/network/leased-lines/${id}`,
};

const SECTION_LABELS = {
  ip: 'IP 정책', dns: 'DNS 정책', ad: 'AD 정책',
  vpn: 'VPN 정책', 'leased-line': '전용회선',
};

export default class GovernanceDetailPage {
  constructor({ params, query, router }) {
    this._router  = router;
    this._section = params.section || 'ip';
    this._id      = params.id;
    this._el      = null;
    this._item    = null;
    this._activeTab = 'basic';
  }

  async mount(container) {
    this._el = container;
    await this._load();
  }

  unmount() {}

  async _load() {
    const apiFn = SECTION_API[this._section];
    if (!apiFn) {
      this._el.innerHTML = '<p class="spa-text-muted">지원하지 않는 섹션입니다.</p>';
      return;
    }
    const res = await api.get(apiFn(this._id), { showError: false });
    this._item = res.item || res;
    this._render();
  }

  _render() {
    const tabs = SECTION_TABS[this._section] || [{ key: 'basic', label: '기본 정보' }];
    const label = SECTION_LABELS[this._section] || '상세';
    const title = this._item
      ? (this._item.policy_name || this._item.domain_name || this._item.line_name || this._item.name || `#${this._id}`)
      : `#${this._id}`;

    const tabHtml = tabs.map(t => `
      <button class="spa-tab-btn ${t.key === this._activeTab ? 'active' : ''}" data-tab="${t.key}">
        ${esc(t.label)}
      </button>`).join('');

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← ${esc(label)}</button>
          <h2 class="spa-page__title">${esc(title)}</h2>
        </div>
        <div class="spa-tabs">${tabHtml}</div>
        <div id="gov-detail-content"></div>
      </div>`;

    this._el.querySelector('#btn-back').addEventListener('click', () => {
      this._router.navigate('/governance/' + this._section);
    });
    this._el.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeTab = btn.dataset.tab;
        this._render();
        this._loadTab();
      });
    });
    this._loadTab();
  }

  async _loadTab() {
    const container = this._el.querySelector('#gov-detail-content');
    if (this._activeTab === 'basic') {
      this._renderBasicInfo(container);
      return;
    }
    const tabs = SECTION_TABS[this._section] || [];
    const tab = tabs.find(t => t.key === this._activeTab);
    if (!tab || !tab.api) {
      container.innerHTML = '<p class="spa-text-muted">탭 데이터가 없습니다.</p>';
      return;
    }
    container.innerHTML = '<p class="spa-text-muted">로딩 중...</p>';
    try {
      const res = await api.get(tab.api(this._id), { showError: false });
      if (tab.isFile) {
        this._renderFileTab(container, res, tab);
        return;
      }
      const items = res.items || res.rows || res.records || res.addresses || res.accounts || res.fqdns || res.managers || res.communications || res.tasks || res.logs || res.files || [];
      if (Array.isArray(items) && items.length > 0) {
        this._renderTabTable(container, items, tab);
      } else if (typeof res === 'object' && !Array.isArray(res) && (res.item || res.policy)) {
        // Single object (e.g., VPN policy)
        const obj = res.item || res.policy || res;
        this._renderSingleObject(container, obj, tab);
      } else {
        container.innerHTML = '<p class="spa-text-muted">데이터가 없습니다.</p>';
      }
    } catch (e) {
      container.innerHTML = '<p class="spa-text-muted">데이터를 불러올 수 없습니다.</p>';
    }
  }

  _renderBasicInfo(container) {
    if (!this._item) {
      container.innerHTML = '<p class="spa-text-muted">데이터가 없습니다.</p>';
      return;
    }
    const excludeKeys = new Set(['id', 'deleted_at', 'is_deleted', 'created_by', 'updated_by']);
    const entries = Object.entries(this._item).filter(([k]) => !k.startsWith('_') && !excludeKeys.has(k));
    const rows = entries.map(([k, v]) => `
      <div class="spa-detail-row">
        <span class="spa-detail-label">${esc(k)}</span>
        <span class="spa-detail-value">${esc(String(v ?? '-'))}</span>
      </div>`).join('');
    container.innerHTML = `<div class="spa-detail-card">${rows}</div>`;
  }

  _renderTabTable(container, items, tab) {
    const keys = Object.keys(items[0]).filter(k => !k.startsWith('_') && k !== 'deleted_at' && k !== 'is_deleted');
    const visibleKeys = keys.slice(0, 8);
    const thead = visibleKeys.map(k => `<th>${esc(k)}</th>`).join('');
    const tbody = items.map(row => {
      const tds = visibleKeys.map(k => `<td>${esc(String(row[k] ?? '-'))}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    container.innerHTML = `
      <div class="spa-admin-table-wrap">
        <table class="spa-dt-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
      </div>
      <p class="spa-text-muted" style="margin-top:8px">${items.length}건</p>`;
  }

  _renderSingleObject(container, obj, tab) {
    const entries = Object.entries(obj).filter(([k]) => !k.startsWith('_') && k !== 'id');
    const rows = entries.map(([k, v]) => `
      <div class="spa-detail-row">
        <span class="spa-detail-label">${esc(k)}</span>
        <span class="spa-detail-value">${esc(String(v ?? '-'))}</span>
      </div>`).join('');
    container.innerHTML = `<div class="spa-detail-card">${rows}</div>`;
  }

  _renderFileTab(container, res, tab) {
    const files = res.files || res.items || res.rows || [];
    const fileRows = files.map(f => `<tr>
      <td>${esc(f.file_name || f.name || '-')}</td>
      <td>${f.file_size ? (f.file_size / 1024).toFixed(1) + ' KB' : '-'}</td>
      <td>${esc(f.uploaded_by || f.created_by || '-')}</td>
      <td>${esc(f.uploaded_at || f.created_at || '-')}</td>
    </tr>`).join('');

    container.innerHTML = `
      <div style="margin-bottom:12px">
        <button class="spa-btn spa-btn--primary spa-btn--sm" id="btn-gov-upload">파일 업로드</button>
      </div>
      ${files.length > 0 ? `
        <div class="spa-admin-table-wrap">
          <table class="spa-dt-table">
            <thead><tr><th>파일명</th><th>크기</th><th>업로더</th><th>업로드일</th></tr></thead>
            <tbody>${fileRows}</tbody>
          </table>
        </div>
        <p class="spa-text-muted" style="margin-top:8px">${files.length}건</p>
      ` : '<p class="spa-text-muted">첨부파일이 없습니다.</p>'}`;

    container.querySelector('#btn-gov-upload')?.addEventListener('click', () => {
      const input = document.createElement('input'); input.type = 'file'; input.multiple = true;
      input.addEventListener('change', async () => {
        const fd = new FormData();
        for (const f of input.files) fd.append('files', f);
        try { await api.upload(tab.api(this._id), fd); this._loadTab(); } catch { /* handled by api */ }
      });
      input.click();
    });
  }
}
