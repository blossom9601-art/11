/* GovVpnPartnerDetailPage — VPN 파트너 상세 + 회선 목록 */
import { api }            from '../../shared/api-client.js';
import { esc }            from '../../shared/dom-utils.js';
import { LoadingSpinner } from '../../widgets/LoadingSpinner.js';
import { DataTable }      from '../../widgets/DataTable.js';

const LINE_COLUMNS = [
  { key: 'line_name',  label: '회선명',   sortable: true },
  { key: 'scope',      label: '범위',     sortable: true, width: '90px' },
  { key: 'status',     label: '상태',     sortable: true, width: '80px' },
  { key: 'line_speed', label: '속도',     sortable: true, width: '90px' },
  { key: 'protocol',   label: '프로토콜', sortable: true, width: '100px' },
  { key: 'manager',    label: '담당자',   sortable: true, width: '100px' },
];

export default class GovVpnPartnerDetailPage {
  constructor({ params, query, router }) {
    this._router = router;
    this._id     = params.id;
    this._el     = null;
    this._item   = null;
    this._table  = null;
  }

  async mount(container) {
    this._el = container;
    this._el.innerHTML = LoadingSpinner.renderPage();
    try {
      const res = await api.get('/api/network/vpn-partners/' + this._id);
      this._item = res.item || res;
    } catch { this._item = null; }
    this._render();
  }

  unmount() { if (this._table) this._table.unmount(); }

  _render() {
    if (!this._item) {
      this._el.innerHTML = '<p class="spa-text-muted">파트너를 찾을 수 없습니다.</p>';
      return;
    }
    const p = this._item;
    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon" id="btn-back">← VPN 파트너</button>
          <h2 class="spa-page__title">${esc(p.org_name || '')} 상세</h2>
        </div>
        <div class="spa-detail-grid" style="margin-bottom:1.5rem">
          <div class="spa-detail-field"><label>기관명</label><span>${esc(p.org_name || '')}</span></div>
          <div class="spa-detail-field"><label>파트너 유형</label><span>${esc(p.partner_type || '')}</span></div>
          <div class="spa-detail-field"><label>비고</label><span>${esc(p.note || '-')}</span></div>
        </div>
        <h3 style="margin-bottom:.75rem">VPN 회선</h3>
        <div id="line-table"></div>
      </div>`;
    this._el.querySelector('#btn-back')?.addEventListener('click', () => this._router.navigate('/governance/vpn/partners'));
    this._table = new DataTable({ columns: LINE_COLUMNS, selectable: false, emptyText: 'VPN 회선이 없습니다.' });
    this._table.mount(this._el.querySelector('#line-table'));
    this._fetchLines();
  }

  async _fetchLines() {
    this._table.loading(true);
    try {
      const res = await api.get('/api/network/vpn-lines?vpn_partner_id=' + this._id);
      const rows = res.rows || res.items || [];
      this._table.setData(rows, rows.length, 1);
    } catch { this._table.setData([], 0, 1); }
  }
}
