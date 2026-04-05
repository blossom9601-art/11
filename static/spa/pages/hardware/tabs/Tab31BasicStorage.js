/* Tab31 — 스토리지 기본 정보 (용량, 풀, RAID 등) */
import { api }         from '../../../shared/api-client.js';
import { esc }         from '../../../shared/dom-utils.js';
import { FormField }   from '../../../widgets/FormField.js';
import { LoadingSpinner } from '../../../widgets/LoadingSpinner.js';

const FIELDS = [
  { key: 'raw_capacity_tb',   label: 'RAW 용량 (TB)', type: 'number' },
  { key: 'usable_capacity_tb', label: '사용가능 용량 (TB)', type: 'number' },
  { key: 'used_capacity_tb',   label: '사용중 용량 (TB)', type: 'number' },
  { key: 'free_capacity_tb',   label: '잔여 용량 (TB)', type: 'number' },
  { key: 'pool_count',         label: '풀 수', type: 'number' },
  { key: 'lun_count',          label: 'LUN 수', type: 'number' },
  { key: 'raid_type',          label: 'RAID 구성', type: 'text' },
  { key: 'disk_type',          label: '디스크 타입', type: 'select', staticOptions: ['SSD','HDD','NVMe','하이브리드'] },
  { key: 'disk_count',         label: '디스크 수', type: 'number' },
  { key: 'controller_count',   label: '컨트롤러 수', type: 'number' },
  { key: 'firmware_version',   label: '펌웨어 버전', type: 'text' },
  { key: 'remark',             label: '비고', type: 'textarea' },
];

export default class Tab31BasicStorage {
  constructor({ assetId, assetType, asset, apiBase }) {
    this._assetId = assetId; this._data = asset || {}; this._apiBase = apiBase; this._el = null;
  }

  async mount(c) {
    this._el = c;
    /* 스토리지 기본 정보 GET – 자산에 포함되지 않는 필드는 /basic 서브API 조회 */
    try {
      const res = await api.get(`${this._apiBase}/${this._assetId}/basic`, { showError: false });
      if (res?.item) Object.assign(this._data, res.item);
    } catch { /* 자산 레코드의 기본 data 사용 */ }
    this._render();
  }

  unmount() {}

  _render() {
    const rows = FIELDS.map(f => {
      const val = this._data[f.key] ?? '';
      if (f.type === 'select') {
        const opts = (f.staticOptions || []).map(o => `<option value="${esc(o)}"${String(o) === String(val) ? ' selected' : ''}>${esc(o)}</option>`).join('');
        return `<div class="spa-form-field"><label>${esc(f.label)}</label><select name="${esc(f.key)}"><option value="">선택</option>${opts}</select></div>`;
      }
      if (f.type === 'textarea') return `<div class="spa-form-field spa-form-field--full"><label>${esc(f.label)}</label><textarea name="${esc(f.key)}" rows="3">${esc(String(val))}</textarea></div>`;
      if (f.type === 'number') return `<div class="spa-form-field"><label>${esc(f.label)}</label><input type="number" name="${esc(f.key)}" value="${esc(String(val))}" min="0" step="0.01"></div>`;
      return `<div class="spa-form-field"><label>${esc(f.label)}</label><input type="text" name="${esc(f.key)}" value="${esc(String(val))}"></div>`;
    }).join('');
    this._el.innerHTML = `<div class="spa-tab-panel"><fieldset class="spa-fieldset"><legend>스토리지 기본 정보</legend><div class="spa-form-grid">${rows}</div></fieldset></div>`;
  }

  async save() {
    const data = {};
    FIELDS.forEach(f => { const el = this._el.querySelector(`[name="${f.key}"]`); if (el) data[f.key] = el.value; });
    const r = await api.put(`${this._apiBase}/${this._assetId}/basic`, data);
    return r.success;
  }
}
