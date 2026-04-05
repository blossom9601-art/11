/* GovernanceListPage — 거버넌스 정책관리 허브 + 섹션별 CRUD */
import { esc }  from '../../shared/dom-utils.js';
import { api }  from '../../shared/api-client.js';

const SECTIONS = [
  { key: 'dr',           label: 'DR 훈련',        desc: '재해복구 훈련 이력 관리',
    icon: '🔄', api: '/api/governance/dr-trainings',
    cols: ['train_date','train_name','train_type','train_status','result','participant_count'],
    labels: ['훈련일','훈련명','유형','상태','결과','참여 인원'] },
  { key: 'backup',       label: '백업 정책',      desc: '백업 스토리지/대상/테이프 관리',
    icon: '💾', api: '/api/governance/backup/target-policies',
    cols: ['system_name','backup_policy_name','data_type','backup_grade','storage_pool_name','schedule_period'],
    labels: ['시스템','정책명','데이터유형','등급','스토리지풀','주기'] },
  { key: 'package',      label: '패키지 정책',    desc: '패키지 현황 및 취약점 관리',
    icon: '📦', api: '/api/governance/packages',
    cols: ['package_name','version','asset_name','category','installed_count'],
    labels: ['패키지명','버전','자산명','카테고리','설치수'] },
  { key: 'vulnerability', label: '취약점 분석',   desc: '보안 취약점 가이드 및 대응책',
    icon: '🛡️', api: '/api/governance/vulnerability-guides',
    cols: ['check_code','check_category','check_topic','check_importance','check_type'],
    labels: ['점검코드','카테고리','점검 항목','중요도','유형'] },
  { key: 'ip',           label: 'IP 정책',        desc: 'IP 주소 할당 및 관리', hasDetail: true,
    icon: '🌐', api: '/api/network/ip-policies',
    cols: ['policy_name','network_range','vlan_id','description','status'],
    labels: ['정책명','네트워크 대역','VLAN','설명','상태'] },
  { key: 'dns',          label: 'DNS 정책',       desc: 'DNS 레코드 관리', hasDetail: true,
    icon: '📡', api: '/api/network/dns-policies',
    cols: ['domain_name','policy_name','dns_server','record_count','status'],
    labels: ['도메인','정책명','DNS서버','레코드수','상태'] },
  { key: 'ad',           label: 'AD 정책',        desc: 'Active Directory 관리', hasDetail: true,
    icon: '🏢', api: '/api/network/ad',
    cols: ['domain_name','ad_server','ou_path','account_count','status'],
    labels: ['도메인','AD서버','OU경로','계정수','상태'] },
  { key: 'vpn',          label: 'VPN 정책',       desc: 'VPN 파트너 및 회선 관리', hasDetail: true,
    icon: '🔒', api: '/api/network/vpn-lines',
    cols: ['line_name','partner_name','tunnel_type','status','bandwidth'],
    labels: ['회선명','파트너','터널유형','상태','대역폭'] },
  { key: 'leased-line',  label: '전용회선',       desc: '전용회선 현황 및 관리', hasDetail: true,
    icon: '📶', api: '/api/network/leased-lines',
    cols: ['line_name','carrier','bandwidth','line_type','status','contract_end'],
    labels: ['회선명','통신사','대역폭','유형','상태','계약 종료'] },
];

export default class GovernanceListPage {
  constructor({ params, query, router }) {
    this._router  = router;
    this._section = params.section || null;
    this._el      = null;
    this._items   = [];
    this._search  = '';
  }

  async mount(container) {
    this._el = container;
    if (this._section) {
      await this._renderSection();
    } else {
      this._renderHub();
    }
  }

  unmount() {}

  /* ── Hub ── */
  _renderHub() {
    const cards = SECTIONS.map(s => `
      <a href="/spa/governance/${esc(s.key)}" class="spa-hub-card" data-nav="${esc(s.key)}">
        <div class="spa-hub-card__icon">${s.icon}</div>
        <div class="spa-hub-card__body">
          <h4>${esc(s.label)}</h4>
          <p>${esc(s.desc)}</p>
        </div>
      </a>`).join('');

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header"><h2 class="spa-page__title">거버넌스</h2></div>
        <div class="spa-hub-grid">${cards}</div>
      </div>`;

    this._el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-nav]');
      if (a) { e.preventDefault(); this._router.navigate('/governance/' + a.dataset.nav); }
    });
  }

  /* ── Section ── */
  async _renderSection() {
    const sec = SECTIONS.find(s => s.key === this._section);
    if (!sec) { this._renderHub(); return; }

    this._el.innerHTML = `
      <div class="spa-page">
        <div class="spa-page-header">
          <button class="spa-btn spa-btn--icon spa-back-btn" id="btn-back">← 목록</button>
          <h2 class="spa-page__title">${esc(sec.label)}</h2>
          <div class="spa-page-header__actions">
            <input type="text" class="spa-input" id="gov-search" placeholder="검색..." value="${esc(this._search)}" style="width:200px">
          </div>
        </div>
        <div id="gov-content"><p class="spa-text-muted">로딩 중...</p></div>
      </div>`;

    this._el.querySelector('#btn-back').addEventListener('click', () => this._router.navigate('/governance'));
    this._el.querySelector('#gov-search').addEventListener('input', (e) => {
      this._search = e.target.value;
      this._renderTable(sec);
    });

    try {
      const res = await api.get(sec.api + '?page=1&page_size=200', { showError: false });
      this._items = res.items || res.rows || [];
      this._renderTable(sec);
    } catch (e) {
      this._el.querySelector('#gov-content').innerHTML =
        '<p class="spa-text-muted">데이터를 불러올 수 없습니다.</p>';
    }
  }

  _renderTable(sec) {
    const content = this._el.querySelector('#gov-content');
    let items = this._items;
    if (this._search) {
      const q = this._search.toLowerCase();
      items = items.filter(r => Object.values(r).some(v => String(v || '').toLowerCase().includes(q)));
    }
    if (items.length === 0) {
      content.innerHTML = '<p class="spa-text-muted">데이터가 없습니다.</p>';
      return;
    }
    const cols = sec.cols || Object.keys(items[0]).filter(k => !k.startsWith('_') && k !== 'deleted_at').slice(0, 6);
    const labels = sec.labels || cols;
    const thead = labels.map(l => `<th>${esc(l)}</th>`).join('');
    const tbody = items.map(row => {
      const id = row.id || row.policy_id || '';
      const clickable = sec.hasDetail && id ? ` class="spa-row-clickable" data-id="${id}"` : '';
      const tds = cols.map(k => `<td>${esc(String(row[k] ?? '-'))}</td>`).join('');
      return `<tr${clickable}>${tds}</tr>`;
    }).join('');

    content.innerHTML = `
      <div class="spa-admin-table-wrap">
        <table class="spa-dt-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
      </div>
      <p class="spa-text-muted" style="margin-top:8px">${items.length}건</p>`;

    if (sec.hasDetail) {
      content.querySelectorAll('[data-id]').forEach(tr => {
        tr.addEventListener('click', () => {
          this._router.navigate('/governance/' + sec.key + '/' + tr.dataset.id);
        });
      });
    }
  }
}
