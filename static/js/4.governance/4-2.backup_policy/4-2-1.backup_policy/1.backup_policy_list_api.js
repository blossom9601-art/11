// 백업 정책(백업 대상 정책) 페이지
// - bk_backup_target_policy CRUD 연동
// - 스토리지 풀 기준설정(bk_storage_pool) CRUD 연동

(function () {
  // External dependencies (loaded on-demand)
  const LOTTIE_CDN = 'https://unpkg.com/lottie-web@5.12.2/build/player/lottie.min.js';
  const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  function ensureLottie(cb) {
    if (window.lottie) {
      cb();
      return;
    }
    const s = document.createElement('script');
    s.src = LOTTIE_CDN;
    s.async = true;
    s.onload = () => cb();
    document.head.appendChild(s);
  }
  function ensureXLSX() {
    return new Promise((resolve, reject) => {
      if (window.XLSX) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = XLSX_CDN;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('XLSX load failed'));
      document.head.appendChild(s);
    });
  }

  const TBODY_ID = 'system-table-body';
  const COUNT_ID = 'system-count';
  const SEARCH_ID = 'system-search';
  const SEARCH_CLEAR_ID = 'system-search-clear';
  const PAGE_SIZE_ID = 'system-page-size';
  const PAGINATION_INFO_ID = 'system-pagination-info';
  const PAGE_NUMBERS_ID = 'system-page-numbers';
  const SELECT_ALL_ID = 'system-select-all';

  const ADD_MODAL_ID = 'system-add-modal';
  const ADD_BTN_ID = 'system-add-btn';
  const ADD_CLOSE_ID = 'system-add-close';
  const ADD_SAVE_ID = 'system-add-save';
  const ADD_FORM_ID = 'system-add-form';

  const EDIT_MODAL_ID = 'system-edit-modal';
  const EDIT_FORM_ID = 'system-edit-form';
  const EDIT_CLOSE_ID = 'system-edit-close';
  const EDIT_SAVE_ID = 'system-edit-save';

  const DELETE_BTN_ID = 'system-delete-btn';
  const DELETE_MODAL_ID = 'system-delete-modal';
  const DELETE_CLOSE_ID = 'system-delete-close';
  const DELETE_CONFIRM_ID = 'system-delete-confirm';

  const DISPOSE_BTN_ID = 'system-dispose-btn';
  const BULK_BTN_ID = 'system-bulk-btn';
  const STATS_BTN_ID = 'system-stats-btn';
  const DUPLICATE_BTN_ID = 'system-duplicate-btn';
  const UPLOAD_BTN_ID = 'system-upload-btn';
  const DOWNLOAD_BTN_ID = 'system-download-btn';
  const COLUMN_BTN_ID = 'system-column-btn';

  // Duplicate modal
  const DUPLICATE_MODAL_ID = 'system-duplicate-modal';
  const DUPLICATE_CLOSE_ID = 'system-duplicate-close';
  const DUPLICATE_CONFIRM_ID = 'system-duplicate-confirm';

  // CSV download modal
  const DOWNLOAD_MODAL_ID = 'system-download-modal';
  const DOWNLOAD_CLOSE_ID = 'system-download-close';
  const DOWNLOAD_CONFIRM_ID = 'system-download-confirm';
  const CSV_RANGE_ALL_ID = 'csv-range-all';
  const CSV_RANGE_SELECTED_ID = 'csv-range-selected';
  const CSV_RANGE_ROW_SELECTED_ID = 'csv-range-row-selected';

  // Stats modal
  const STATS_MODAL_ID = 'system-stats-modal';
  const STATS_CLOSE_ID = 'system-stats-close';
  const STATS_OK_ID = 'system-stats-ok';

  // Upload modal
  const UPLOAD_MODAL_ID = 'system-upload-modal';
  const UPLOAD_CLOSE_ID = 'system-upload-close';
  const UPLOAD_INPUT_ID = 'upload-input';
  const UPLOAD_DROPZONE_ID = 'upload-dropzone';
  const UPLOAD_META_ID = 'upload-meta';
  const UPLOAD_FILE_CHIP_ID = 'upload-file-chip';
  const UPLOAD_TEMPLATE_BTN_ID = 'upload-template-download';
  const UPLOAD_CONFIRM_ID = 'system-upload-confirm';

  // Column selection modal
  const COLUMN_MODAL_ID = 'system-column-modal';
  const COLUMN_FORM_ID = 'system-column-form';
  const COLUMN_CLOSE_ID = 'system-column-close';
  const COLUMN_APPLY_ID = 'system-column-apply';
  const COLUMN_RESET_ID = 'system-column-reset';
  const COLUMN_SELECTALL_BTN_ID = 'system-column-selectall-btn';
  const COLUMN_STORAGE_KEY = 'gov_backup_policy:visibleCols:v2';

  const EMPTY_ID = 'system-empty';

  // Storage pool modal
  const STORAGE_POOL_OPEN_BTN = 'storage-pool-open-btn';
  const STORAGE_POOL_OPEN_INLINE_BTN = 'storage-pool-open-inline';
  const STORAGE_POOL_MODAL_ID = 'storage-pool-modal';
  const STORAGE_POOL_CLOSE_ID = 'storage-pool-close';
  const STORAGE_POOL_OK_ID = 'storage-pool-ok';
  const STORAGE_POOL_ADD_ROW_ID = 'storage-pool-add-row';
  const STORAGE_POOL_TBODY_ID = 'storage-pool-tbody';
  const STORAGE_POOL_SELECT_ALL_ID = 'storage-pool-select-all';

  const API_POLICIES = '/api/governance/backup/target-policies';
  const API_POOLS = '/api/governance/backup/storage-pools';
  const API_STORAGE_ASSETS = '/api/hardware/storage/backup/assets';
  const API_WORK_ASSETS = '/api/hardware/assets';
  const JSON_HEADERS = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };

  const ALLOWED = {
    backup_scope: ['내부망', '외부망'],
    data_type: ['ARC', 'DB', 'FILE', 'LOG', 'OS', 'SRC', 'VM'],
    backup_grade: ['1등급', '2등급', '3등급'],
    retention_unit: ['주', '월', '년', 'Infinity'],
    offsite_yn: ['O', 'X'],
    media_type: ['Client(Network)', 'Client(SAN)', 'Media Server'],
    schedule_period: ['매일', '매주', '매달', '매년'],
    schedule_weekday: ['월', '화', '수', '목', '금', '토', '일'],
  };

  let state = {
    data: [],
    filtered: [],
    pageSize: 10,
    page: 1,
    search: '',
    selected: new Set(),
    visibleCols: null,
  };

  const COLUMN_META = {
    backup_scope: { label: '백업 구분', group: '백업 대상' },
    backup_policy_name: { label: '백업 정책', group: '백업정책' },
    backup_directory: { label: '백업 디렉터리', group: '백업정책' },
    data_type: { label: '데이터 유형', group: '백업정책' },
    backup_grade: { label: '백업 등급', group: '보관/매체' },
    retention: { label: '보관 기간', group: '보관/매체' },
    storage_pool_name: { label: '스토리지 풀', group: '보관/매체' },
    offsite_yn: { label: '소산여부', group: '보관/매체' },
    media_type: { label: '미디어 구분', group: '보관/매체' },
    schedule_period: { label: '주기', group: '백업 시간' },
    schedule_weekday: { label: '요일', group: '백업 시간' },
    schedule_day: { label: '일자', group: '백업 시간' },
    start_time: { label: '시작시간', group: '백업 시간' },
    business_name: { label: '업무명', group: '백업 대상' },
    system_name: { label: '시스템 이름', group: '백업 대상' },
    ip_address: { label: 'IP 주소', group: '백업 대상' },
    remark: { label: '비고', group: '보관/매체' },
  };
  const COLUMN_MODAL_GROUPS = [
    {
      group: '백업 대상',
      columns: ['backup_scope', 'business_name', 'system_name', 'ip_address'],
    },
    { group: '백업정책', columns: ['backup_policy_name', 'backup_directory', 'data_type'] },
    { group: '백업 시간', columns: ['schedule_period', 'schedule_weekday', 'schedule_day', 'start_time'] },
    { group: '보관/매체', columns: ['backup_grade', 'retention', 'storage_pool_name', 'offsite_yn', 'media_type', 'remark'] },
  ];
  const BASE_VISIBLE_COLUMNS = Object.keys(COLUMN_META);

  let storagePools = []; // {id,pool_name,storage_asset_id,storage_asset_name,remark}
  let storageAssets = []; // from hardware assets API

  // Upload template (Backup policy schema)
  const UPLOAD_HEADERS_KO = [
    '백업 구분',
    '업무명',
    '시스템 이름',
    'IP 주소',
    '백업 정책명',
    '백업 디렉터리',
    '데이터 유형',
    '백업 등급',
    '보관 기간 값',
    '보관 기간 단위',
    '스토리지 풀',
    '소산여부',
    '미디어 구분',
    '주기',
    '요일',
    '일자',
    '시작시간',
    '비고',
  ];
  const UPLOAD_HEADER_TO_FIELD = {
    '백업 구분': 'backup_scope',
    '업무명': 'business_name',
    '시스템 이름': 'system_name',
    'IP 주소': 'ip_address',
    '백업 정책명': 'backup_policy_name',
    '백업 디렉터리': 'backup_directory',
    '데이터 유형': 'data_type',
    '백업 등급': 'backup_grade',
    '보관 기간 값': 'retention_value',
    '보관 기간 단위': 'retention_unit',
    '스토리지 풀': 'storage_pool',
    '소산여부': 'offsite_yn',
    '미디어 구분': 'media_type',
    '주기': 'schedule_period',
    '요일': 'schedule_weekday',
    '일자': 'schedule_day',
    '시작시간': 'start_time',
    '비고': 'remark',
  };
  function isEmptyRow(arr) {
    return !arr || arr.every((v) => String(v ?? '').trim() === '');
  }
  function stripNumberSeparators(val) {
    return String(val ?? '').replace(/[\s,]/g, '').trim();
  }
  function parseRetentionUnit(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    if (s === '무기한') return 'Infinity';
    return s;
  }
  function isHHMM(s) {
    const m = String(s ?? '').trim().match(/^(\d{2}):(\d{2})$/);
    if (!m) return false;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    return Number.isInteger(hh) && Number.isInteger(mm) && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
  }
  function storagePoolIdFromCell(val) {
    const s = String(val ?? '').trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) return Number(s);
    const found = (storagePools || []).find((p) => String(p.pool_name || '').trim() === s && Number(p?.is_deleted || 0) === 0);
    return found ? Number(found.id) : null;
  }
  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function toCsvCell(val) {
    return `"${String(val ?? '').replace(/"/g, '""')}"`;
  }

  const CSV_COLUMN_ORDER = [
    'backup_scope',
    'business_name',
    'system_name',
    'ip_address',
    'backup_policy_name',
    'backup_directory',
    'data_type',
    'backup_grade',
    'retention',
    'storage_pool_name',
    'offsite_yn',
    'media_type',
    'schedule_period',
    'schedule_weekday',
    'schedule_day',
    'start_time',
    'remark',
  ];

  function exportCSV(onlySelected) {
    const visible = state.visibleCols || new Set(BASE_VISIBLE_COLUMNS);
    const cols = CSV_COLUMN_ORDER.filter((c) => visible.has(c));
    const headers = ['No', ...cols.map((c) => COLUMN_META[c]?.label || c)];

    let rows = state.filtered || [];
    if (onlySelected === true) {
      const sel = new Set(Array.from(state.selected || []).map(String));
      rows = rows.filter((r) => sel.has(String(r.id)));
    }

    const data = rows.map((r, idx) => {
      const rowVals = cols.map((c) => {
        if (c === 'retention') return retentionLabel(r);
        return r?.[c] ?? '';
      });
      return [idx + 1, ...rowVals];
    });
    const lines = [headers, ...data].map((arr) => arr.map(toCsvCell).join(','));
    const bom = '\uFEFF';
    const csv = bom + lines.join('\r\n');
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const filename = `backup_policy_list_${yyyy}${mm}${dd}.csv`;
    downloadBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  }

  // ----- Stats helpers (align with Backup Tape page UX) -----
  function renderStatBlock(containerId, title, dist, fixedOptions, opts) {
    return window.blsStats.renderCard(containerId, title, dist, fixedOptions, opts);
  }
  function equalizeStatsHeights() {
    return window.blsStats.equalizeHeights(STATS_MODAL_ID);
  }
  function countBy(rows, key, fixedOptions) {
    return window.blsStats.countBy(rows, key, fixedOptions);
  }

  function buildStats() {
    const swEl = document.getElementById('stats-software');
    const verEl = document.getElementById('stats-versions');
    const checkEl = document.getElementById('stats-check');
    if (swEl) swEl.innerHTML = '';
    if (verEl) verEl.innerHTML = '';
    if (checkEl) checkEl.innerHTML = '';

    const rows = (state.filtered && state.filtered.length) ? state.filtered : (state.data || []);

    // 백업 대상/정책/보관-매체를 카드 단위로 분리해서 표시
    renderStatBlock('stats-software', '백업 구분', countBy(rows, 'backup_scope', ALLOWED.backup_scope), ALLOWED.backup_scope);
    renderStatBlock('stats-software', '소산여부', countBy(rows, 'offsite_yn', ALLOWED.offsite_yn), ALLOWED.offsite_yn, { toggleOX: true, hideZero: true });

    renderStatBlock('stats-versions', '데이터 유형', countBy(rows, 'data_type', ALLOWED.data_type), ALLOWED.data_type);
    renderStatBlock('stats-versions', '주기', countBy(rows, 'schedule_period', ALLOWED.schedule_period), ALLOWED.schedule_period, { hideZero: true });
    renderStatBlock('stats-versions', '요일', countBy(rows, 'schedule_weekday'));

    renderStatBlock('stats-check', '백업 등급', countBy(rows, 'backup_grade', ALLOWED.backup_grade), ALLOWED.backup_grade);
    renderStatBlock('stats-check', '미디어', countBy(rows, 'media_type', ALLOWED.media_type), ALLOWED.media_type);
    renderStatBlock('stats-check', '스토리지 풀', countBy(rows, 'storage_pool_name'));
  }

  function uniqueCopyName(baseName) {
    const base = String(baseName || '').trim() || 'COPY';
    const existing = new Set((state.data || []).map((x) => String(x.backup_policy_name || '').trim()));
    if (!existing.has(`${base}_COPY`)) return `${base}_COPY`;
    for (let i = 2; i <= 999; i++) {
      const cand = `${base}_COPY${i}`;
      if (!existing.has(cand)) return cand;
    }
    return `${base}_COPY_${Date.now()}`;
  }

  let uploadAnim = null;
  function initUploadAnim() {
    const el = document.getElementById('upload-anim');
    if (!el) return;
    ensureLottie(() => {
      try {
        if (uploadAnim && typeof uploadAnim.destroy === 'function') uploadAnim.destroy();
        el.innerHTML = '';
        uploadAnim = window.lottie.loadAnimation({
          container: el,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: '/static/image/svg/list/free-animated-upload.json',
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true },
        });
      } catch (_e) {}
    });
  }

  function resetUploadUI() {
    const input = document.getElementById(UPLOAD_INPUT_ID);
    const meta = document.getElementById(UPLOAD_META_ID);
    const chip = document.getElementById(UPLOAD_FILE_CHIP_ID);
    const confirm = document.getElementById(UPLOAD_CONFIRM_ID);
    if (input) input.value = '';
    if (meta) meta.hidden = true;
    if (chip) chip.textContent = '';
    if (confirm) confirm.disabled = true;
  }

  function setUploadFileUI(file) {
    const meta = document.getElementById(UPLOAD_META_ID);
    const chip = document.getElementById(UPLOAD_FILE_CHIP_ID);
    const confirm = document.getElementById(UPLOAD_CONFIRM_ID);
    if (meta) meta.hidden = false;
    if (chip) chip.textContent = `${file.name} (${Math.ceil(file.size / 1024)} KB)`;
    if (confirm) confirm.disabled = false;
  }

  function acceptUploadFile(file) {
    if (!file) return false;
    const name = String(file.name || '').toLowerCase();
    const okExt = name.endsWith('.xls') || name.endsWith('.xlsx');
    const okSize = (file.size || 0) <= 10 * 1024 * 1024;
    return okExt && okSize;
  }

  async function downloadUploadTemplate() {
    try {
      await ensureXLSX();
    } catch (_e) {
      showMessage('템플릿 생성을 위한 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.', '오류');
      return;
    }
    const XLSX = window.XLSX;
    const wsTemplate = XLSX.utils.aoa_to_sheet([UPLOAD_HEADERS_KO]);
    const rules = [
      ['가이드'],
      ['- 스토리지 풀은 "풀명" 또는 숫자 ID를 입력할 수 있습니다.'],
      ['- 보관 기간 단위: 주/월/년/Infinity (무기한은 Infinity 또는 "무기한")'],
      ['- 소산여부: O 또는 X'],
      ['- 미디어 구분: Client(Network) / Client(SAN) / Media Server'],
      ['- 시작시간: HH:MM (예: 23:00)'],
    ];
    const wsGuide = XLSX.utils.aoa_to_sheet(rules);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template');
    XLSX.utils.book_append_sheet(wb, wsGuide, '가이드');
    XLSX.writeFile(wb, 'backup_policy_upload_template.xlsx');
  }

  async function confirmUpload() {
    const input = document.getElementById(UPLOAD_INPUT_ID);
    const file = input?.files?.[0];
    if (!file) return;
    if (!acceptUploadFile(file)) {
      showMessage('지원하지 않는 파일이거나 10MB를 초과합니다. .xls/.xlsx만 가능합니다.', '업로드 오류');
      return;
    }

    try {
      await ensureXLSX();
    } catch (_e) {
      showMessage('업로드 처리를 위한 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.', '오류');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = reader.result;
        const wb = window.XLSX.read(data, { type: 'array' });
        const sheetName = wb.SheetNames?.[0];
        if (!sheetName) throw new Error('엑셀 시트를 찾을 수 없습니다.');
        const ws = wb.Sheets[sheetName];
        const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!rows || rows.length < 2) throw new Error('업로드할 데이터가 없습니다.');

        const headerRow = rows[0].map((h) => String(h ?? '').trim());
        const idxByHeader = new Map();
        headerRow.forEach((h, idx) => { if (h) idxByHeader.set(h, idx); });
        const missing = UPLOAD_HEADERS_KO.filter((h) => !idxByHeader.has(h));
        if (missing.length) throw new Error(`필수 헤더가 없습니다: ${missing.join(', ')}`);

        // Ensure pools are loaded so we can resolve pool names.
        await loadStoragePools();

        const errors = [];
        let created = 0;
        for (let rIdx = 1; rIdx < rows.length; rIdx++) {
          const row = rows[rIdx];
          if (isEmptyRow(row)) continue;
          const obj = {};
          UPLOAD_HEADERS_KO.forEach((h) => {
            const colIdx = idxByHeader.get(h);
            obj[h] = (colIdx == null) ? '' : row[colIdx];
          });

          const payload = {
            backup_scope: String(obj['백업 구분'] ?? '').trim(),
            business_name: String(obj['업무명'] ?? '').trim(),
            system_name: String(obj['시스템 이름'] ?? '').trim(),
            ip_address: String(obj['IP 주소'] ?? '').trim(),
            backup_policy_name: String(obj['백업 정책명'] ?? '').trim(),
            backup_directory: String(obj['백업 디렉터리'] ?? '').trim(),
            data_type: String(obj['데이터 유형'] ?? '').trim(),
            backup_grade: String(obj['백업 등급'] ?? '').trim(),
            retention_value: stripNumberSeparators(obj['보관 기간 값']),
            retention_unit: parseRetentionUnit(obj['보관 기간 단위']),
            storage_pool_id: null,
            offsite_yn: String(obj['소산여부'] ?? '').trim(),
            media_type: String(obj['미디어 구분'] ?? '').trim(),
            schedule_period: String(obj['주기'] ?? '').trim(),
            schedule_weekday: String(obj['요일'] ?? '').trim(),
            schedule_day: stripNumberSeparators(obj['일자']),
            start_time: String(obj['시작시간'] ?? '').trim(),
            remark: String(obj['비고'] ?? '').trim(),
          };

          const poolId = storagePoolIdFromCell(obj['스토리지 풀']);
          if (poolId != null) payload.storage_pool_id = poolId;

          if (payload.retention_unit === 'Infinity') payload.retention_value = '';
          if (payload.start_time && !isHHMM(payload.start_time)) {
            errors.push(`행 ${rIdx + 1}: 시작시간 형식이 올바르지 않습니다 (HH:MM).`);
            continue;
          }

          const err = validatePolicyPayload(payload);
          if (err) {
            errors.push(`행 ${rIdx + 1}: ${err}`);
            continue;
          }

          try {
            await fetchJson(API_POLICIES, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(payload) });
            created++;
          } catch (e) {
            errors.push(`행 ${rIdx + 1}: ${e?.message || '등록 실패'}`);
          }
        }

        closeModal(UPLOAD_MODAL_ID);
        resetUploadUI();
        await loadPolicies();
        if (errors.length) {
          const head = errors.slice(0, 5).join('\n');
          showMessage(`등록 ${created}건 성공, ${errors.length}건 실패\n\n${head}${errors.length > 5 ? `\n...외 ${errors.length - 5}건` : ''}`);
        } else {
          showMessage(`등록 ${created}건 성공`);
        }
      } catch (e) {
        showMessage(e?.message || '업로드 처리 중 오류가 발생했습니다.', '업로드 오류');
      }
    };
    reader.onerror = () => showMessage('파일을 읽을 수 없습니다.', '업로드 오류');
    reader.readAsArrayBuffer(file);
  }

  // Work-name searchable dropdown backing store
  const WORK_ASSET_CATEGORY = 'SERVER';
  const WORK_ASSET_TYPES = 'ON_PREMISE,CLOUD,WORKSTATION';
  const workAssetsById = new Map(); // id -> hardware_asset record

  // Storage pool modal inline editor state
  let poolEditId = null; // string | null, '__new__' for new row

  function setStoragePoolInlineMessage(message, kind) {
    const modal = document.getElementById(STORAGE_POOL_MODAL_ID);
    if (!modal) return;
    const box = modal.querySelector('#storage-pool-inline-message');
    if (!box) return;

    const msg = (message == null ? '' : String(message)).trim();
    if (!msg) {
      box.hidden = true;
      box.textContent = '';
      box.classList.remove('is-error', 'is-info');
      return;
    }

    const k = (kind || 'error').toLowerCase();
    box.textContent = msg;
    box.hidden = false;
    box.classList.toggle('is-error', k === 'error');
    box.classList.toggle('is-info', k === 'info');
  }

  function clearStoragePoolInlineMessage() {
    setStoragePoolInlineMessage('', 'info');
  }

  function escapeHTML(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderOXBadge(raw) {
    const v = String(raw ?? '').trim().toUpperCase();
    if (!v) {
      return '<span class="cell-ox with-badge">'
        + '<span class="ox-badge" aria-label="미입력">-</span>'
        + '</span>';
    }

    if (v !== 'O' && v !== 'X') return escapeHTML(raw);
    const on = v === 'O';
    return '<span class="cell-ox with-badge">'
      + '<span class="ox-badge ' + (on ? 'on' : 'off') + '" aria-label="' + (on ? '예' : '아니오') + '">' + v + '</span>'
      + '</span>';
  }

  function loadColumnSelection() {
    state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
    try {
      const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      const valid = new Set(Object.keys(COLUMN_META));
      const next = arr.filter((k) => valid.has(k));
      if (next.length) state.visibleCols = new Set(next);
    } catch (_e) {}
  }

  function saveColumnSelection() {
    try {
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(Array.from(state.visibleCols || [])));
    } catch (_e) {}
  }

  function applyColumnVisibility() {
    const table = document.getElementById('system-table');
    if (!table) return;
    const visible = state.visibleCols || new Set(BASE_VISIBLE_COLUMNS);
    table.querySelectorAll('thead th[data-col], tbody td[data-col]').forEach((cell) => {
      const col = cell.getAttribute('data-col');
      if (!col) return;
      if (col === 'actions') return; // always show actions
      if (visible.has(col)) cell.classList.remove('col-hidden');
      else cell.classList.add('col-hidden');
    });
  }

  function buildColumnModal() {
    const form = document.getElementById(COLUMN_FORM_ID);
    if (!form) return;
    const visible = state.visibleCols || new Set(BASE_VISIBLE_COLUMNS);
    form.innerHTML = '';

    COLUMN_MODAL_GROUPS.forEach((groupDef) => {
      const section = document.createElement('div');
      section.className = 'form-section';
      section.innerHTML = `<div class="section-header"><h4>${escapeHTML(groupDef.group)}</h4></div>`;
      const grid = document.createElement('div');
      grid.className = 'column-select-grid';
      groupDef.columns.forEach((col) => {
        const meta = COLUMN_META[col];
        if (!meta) return;
        const active = visible.has(col) ? ' is-active' : '';
        const label = document.createElement('label');
        label.className = 'column-checkbox' + active;
        label.innerHTML = `<input type="checkbox" value="${escapeHTML(col)}" ${visible.has(col) ? 'checked' : ''}>`
          + `<span class="col-check" aria-hidden="true"></span>`
          + `<span class="col-text">${escapeHTML(meta.label)}</span>`;
        grid.appendChild(label);
      });
      section.appendChild(grid);
      form.appendChild(section);
    });

    syncColumnSelectAll();
  }

  function syncColumnSelectAll() {
    const btn = document.getElementById(COLUMN_SELECTALL_BTN_ID);
    const form = document.getElementById(COLUMN_FORM_ID);
    if (!btn || !form) return;
    const boxes = Array.from(form.querySelectorAll('input[type=checkbox]'));
    if (!boxes.length) {
      btn.textContent = '전체 선택';
      return;
    }
    const allChecked = boxes.every((b) => b.checked);
    btn.textContent = allChecked ? '전체 해제' : '전체 선택';
  }

  function handleColumnApply() {
    const form = document.getElementById(COLUMN_FORM_ID);
    if (!form) return;
    const checked = Array.from(form.querySelectorAll('input[type=checkbox]:checked')).map((el) => el.value);
    if (!checked.length) {
      showMessage('최소 1개 이상 컬럼을 선택하세요.', '안내');
      return;
    }
    state.visibleCols = new Set(checked);
    saveColumnSelection();
    applyColumnVisibility();
    closeModal(COLUMN_MODAL_ID);
  }

  function handleColumnReset() {
    state.visibleCols = new Set(BASE_VISIBLE_COLUMNS);
    saveColumnSelection();
    buildColumnModal();
    applyColumnVisibility();
  }

  function handleColumnSelectAllToggle() {
    const form = document.getElementById(COLUMN_FORM_ID);
    if (!form) return;
    const boxes = Array.from(form.querySelectorAll('input[type=checkbox]'));
    const allChecked = boxes.length > 0 && boxes.every((b) => b.checked);
    boxes.forEach((b) => {
      b.checked = !allChecked;
      const label = b.closest('label.column-checkbox');
      if (label) label.classList.toggle('is-active', b.checked);
    });
    if (allChecked && boxes.length) {
      boxes[0].checked = true;
      const label = boxes[0].closest('label.column-checkbox');
      if (label) label.classList.add('is-active');
    }

    syncColumnSelectAll();
  }

  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('show');
    el.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.server-add-modal.show, .server-edit-modal.show, .system-add-modal.show, .system-edit-modal.show, .system-delete-modal.show, .system-message-modal.show')) {
      document.body.classList.remove('modal-open');
    }
  }

  function showMessage(message, title) {
    const titleEl = document.getElementById('message-title');
    const contentEl = document.getElementById('message-content');
    if (titleEl) titleEl.textContent = title || '알림';
    if (contentEl) contentEl.textContent = String(message || '');
    openModal('system-message-modal');
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, options);
    let body = null;
    try {
      body = await res.json();
    } catch (_e) {
      // ignore
    }
    if (!res.ok || (body && body.success === false)) {
      throw new Error(body?.message || `HTTP ${res.status}`);
    }
    return body;
  }

  function enhanceSearchSelects(scopeEl) {
    try {
      if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.enhance === 'function') {
        window.BlossomSearchableSelect.enhance(scopeEl || document);
      }
    } catch (_e) {}
  }

  function syncSearchSelects(scopeEl) {
    try {
      if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') {
        window.BlossomSearchableSelect.syncAll(scopeEl || document);
      }
    } catch (_e) {}
  }

  function ensureWorkAssetSearchSource() {
    try {
      window.BlossomSearchableSelectSources = window.BlossomSearchableSelectSources || {};
      if (typeof window.BlossomSearchableSelectSources.gov_backup_work_assets === 'function') return;

      window.BlossomSearchableSelectSources.gov_backup_work_assets = async function (ctx) {
        const q = (ctx && ctx.query) ? String(ctx.query).trim() : '';
        if (!q) {
          return { items: [], emptyMessage: '업무명을 입력해 검색하세요.' };
        }

        // Use the consolidated hardware assets endpoint.
        // NOTE: To stay compatible with older servers, do NOT rely on comma-separated asset_type.
        // Fetch each asset_type independently and merge.
        const types = ['ON_PREMISE', 'CLOUD', 'WORKSTATION'];
        const pageSize = 25;

        async function fetchType(t) {
          const url = `${API_WORK_ASSETS}?asset_category=${encodeURIComponent(WORK_ASSET_CATEGORY)}`
            + `&asset_type=${encodeURIComponent(t)}`
            + `&q=${encodeURIComponent(q)}`
            + `&page=1&page_size=${pageSize}`;
          const data = await fetchJson(url);
          return Array.isArray(data?.items) ? data.items : [];
        }

        try {
          const settled = await Promise.allSettled(types.map(fetchType));
          const merged = [];
          const seen = new Set();
          settled.forEach((r) => {
            if (r.status !== 'fulfilled') return;
            (r.value || []).forEach((row) => {
              const id = (row && row.id != null) ? String(row.id) : '';
              if (!id || seen.has(id)) return;
              seen.add(id);
              merged.push(row);
            });
          });

          merged.forEach((r) => {
            const id = (r && r.id != null) ? String(r.id) : '';
            if (!id) return;
            workAssetsById.set(id, r);
          });

          const items = merged
            .filter((r) => Number(r?.is_deleted || 0) === 0)
            .map((r) => {
              const id = (r && r.id != null) ? String(r.id) : '';
              const workName = (r && r.work_name != null) ? String(r.work_name).trim() : '';
              const systemName = (r && r.system_name != null) ? String(r.system_name).trim() : '';
              const systemIp = (r && r.system_ip != null) ? String(r.system_ip).trim() : '';
              const assetCode = (r && r.asset_code != null) ? String(r.asset_code).trim() : '';

              // 요구사항:
              // - 드롭박스 목록: work_name \n system_name / system_ip (문단 나눔)
              // - 선택된 값 표시: work_name만
              const line1 = workName || '(업무명 없음)';
              const line2 = [systemName, systemIp].filter(Boolean).join(' / ');
              const listLabel = line2 ? `${line1}\n${line2}` : line1;

              const searchText = [workName, systemName, systemIp, assetCode].filter(Boolean).join(' ');

              return {
                value: id,
                label: listLabel,
                displayLabel: workName || systemName || systemIp || listLabel,
                searchText,
              };
            });

          if (!items.length) return { items: [], emptyMessage: '검색 결과가 없습니다.' };
          return items;
        } catch (_e) {
          return { items: [], emptyMessage: '업무명 목록을 불러오지 못했습니다.' };
        }
      };
    } catch (_e) {
      // ignore
    }
  }

  function setupWorkAssetAutofill(form, opts) {
    const options = opts || {};
    const disableOnEmpty = options.disableOnEmpty !== false;
    const clearOnEmpty = options.clearOnEmpty !== false;
    if (!form) return;

    const sel = form.querySelector('select[name="business_asset_id"]');
    const businessNameEl = form.querySelector('input[name="business_name"]');
    const systemNameEl = form.querySelector('input[name="system_name"]');
    const ipEl = form.querySelector('input[name="ip_address"]');
    if (!sel || !businessNameEl || !systemNameEl || !ipEl) return;
    if (sel.__blsGovBackupWorkBind) return;
    sel.__blsGovBackupWorkBind = true;

    function setDisabled(disabled) {
      systemNameEl.disabled = !!disabled;
      ipEl.disabled = !!disabled;
      try {
        form.classList.toggle('work-autofill-disabled', !!disabled);
      } catch (_e) {}
      syncSearchSelects(form);
    }

    if (options.initialDisable) {
      // For add modal: start disabled and clear values.
      businessNameEl.value = '';
      systemNameEl.value = '';
      ipEl.value = '';
      setDisabled(true);
    }

    sel.addEventListener('change', () => {
      const id = String(sel.value || '').trim();
      if (!id) {
        businessNameEl.value = '';
        if (clearOnEmpty) {
          systemNameEl.value = '';
          ipEl.value = '';
        }
        setDisabled(disableOnEmpty);
        return;
      }

      const rec = workAssetsById.get(id);
      if (!rec) {
        // Keep editable if the selection is a preserved value (e.g., edit modal existing).
        setDisabled(false);
        return;
      }

      const workName = (rec.work_name != null) ? String(rec.work_name).trim() : '';
      const systemName = (rec.system_name != null) ? String(rec.system_name).trim() : '';
      const ip = (rec.system_ip != null) ? String(rec.system_ip).trim() : ((rec.mgmt_ip != null) ? String(rec.mgmt_ip).trim() : '');

      businessNameEl.value = workName;
      systemNameEl.value = systemName;
      ipEl.value = ip;
      setDisabled(false);
    });
  }

  function retentionLabel(item) {
    const unit = String(item?.retention_unit || '').trim();
    if (unit === 'Infinity') return '무기한';
    const v = item?.retention_value;
    if (v == null || String(v).trim() === '') return '';
    return `${v}${unit}`;
  }

  function setEmptyState(visible) {
    const empty = document.getElementById(EMPTY_ID);
    if (!empty) return;
    empty.hidden = !visible;
  }

  function applySearch() {
    const q = (state.search || '').trim().toLowerCase();
    if (!q) {
      state.filtered = [...state.data];
    } else {
      state.filtered = state.data.filter((item) => {
        const hay = [
          item.backup_scope,
          item.backup_policy_name,
          item.backup_directory,
          item.data_type,
          item.backup_grade,
          retentionLabel(item),
          item.storage_pool_name,
          item.offsite_yn,
          item.media_type,
          item.schedule_period,
          item.schedule_weekday,
          item.schedule_day,
          item.start_time,
          item.business_name,
          item.system_name,
          item.ip_address,
          item.remark,
        ]
          .map((v) => String(v ?? '').toLowerCase())
          .join(' ');
        return hay.includes(q);
      });
    }
    state.page = 1;
  }

  function pageCount() {
    const total = Number(state.filtered.length || 0);
    if (!total) return 0;
    return Math.max(1, Math.ceil(total / state.pageSize));
  }

  function currentPageItems() {
    const start = (state.page - 1) * state.pageSize;
    return state.filtered.slice(start, start + state.pageSize);
  }

  function renderCount() {
    const countEl = document.getElementById(COUNT_ID);
    if (countEl) countEl.textContent = String(state.filtered.length || 0);
    const infoEl = document.getElementById(PAGINATION_INFO_ID);
    if (infoEl) {
      const total = state.filtered.length || 0;
      const start = total ? ((state.page - 1) * state.pageSize + 1) : 0;
      const end = total ? Math.min(total, state.page * state.pageSize) : 0;
      infoEl.textContent = `${start}-${end} / ${total}개 항목`;
    }
  }

  function ensureValidPage() {
    const totalPages = pageCount();
    if (!totalPages) state.page = 1;
    else if (state.page > totalPages) state.page = totalPages;
    else if (state.page < 1) state.page = 1;
  }

  function renderPagination() {
    const totalPages = pageCount();
    ensureValidPage();

    const container = document.getElementById(PAGE_NUMBERS_ID);
    if (!container) return;
    container.innerHTML = '';

    const firstBtn = document.getElementById('system-first');
    const prevBtn = document.getElementById('system-prev');
    const nextBtn = document.getElementById('system-next');
    const lastBtn = document.getElementById('system-last');

    // Empty result set: hide numbers and disable navigation.
    if (!totalPages) {
      if (firstBtn) firstBtn.disabled = true;
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      if (lastBtn) lastBtn.disabled = true;
      return;
    }

    const maxButtons = 7;
    let start = Math.max(1, state.page - Math.floor(maxButtons / 2));
    let end = start + maxButtons - 1;
    if (end > totalPages) {
      end = totalPages;
      start = Math.max(1, end - maxButtons + 1);
    }

    function addEllipsis() {
      const el = document.createElement('span');
      el.className = 'page-ellipsis';
      el.textContent = '…';
      container.appendChild(el);
    }
    function addPage(p) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `page-btn${p === state.page ? ' active' : ''}`;
      btn.textContent = String(p);
      btn.addEventListener('click', () => {
        state.page = p;
        render();
      });
      container.appendChild(btn);
    }

    if (start > 1) {
      addPage(1);
      if (start > 2) addEllipsis();
    }
    for (let p = start; p <= end; p++) addPage(p);
    if (end < totalPages) {
      if (end < totalPages - 1) addEllipsis();
      addPage(totalPages);
    }

    if (firstBtn) firstBtn.disabled = state.page <= 1;
    if (prevBtn) prevBtn.disabled = state.page <= 1;
    if (nextBtn) nextBtn.disabled = state.page >= totalPages;
    if (lastBtn) lastBtn.disabled = state.page >= totalPages;
  }

  function renderTable() {
    const tbody = document.getElementById(TBODY_ID);
    if (!tbody) return;

    const rows = currentPageItems();
    tbody.innerHTML = '';
    setEmptyState(rows.length === 0);

    rows.forEach((item) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="checkbox" class="system-row-select" data-id="${escapeHTML(item.id)}" ${state.selected.has(String(item.id)) ? 'checked' : ''}></td>
        <td data-col="backup_scope">${escapeHTML(item.backup_scope)}</td>
        <td data-col="backup_policy_name">${escapeHTML(item.backup_policy_name)}</td>
        <td data-col="backup_directory">${escapeHTML(item.backup_directory)}</td>
        <td data-col="data_type">${escapeHTML(item.data_type)}</td>
        <td data-col="backup_grade">${escapeHTML(item.backup_grade)}</td>
        <td data-col="retention">${escapeHTML(retentionLabel(item))}</td>
        <td data-col="storage_pool_name">${escapeHTML(item.storage_pool_name || '')}</td>
        <td data-col="offsite_yn">${renderOXBadge(item.offsite_yn)}</td>
        <td data-col="media_type">${escapeHTML(item.media_type)}</td>
        <td data-col="schedule_period">${escapeHTML(item.schedule_period ? item.schedule_period : '-')}</td>
        <td data-col="schedule_weekday">${escapeHTML(item.schedule_weekday ? item.schedule_weekday : '-')}</td>
        <td data-col="schedule_day">${escapeHTML((item.schedule_day == null || String(item.schedule_day).trim() === '') ? '-' : String(item.schedule_day))}</td>
        <td data-col="start_time">${escapeHTML(item.start_time || '')}</td>
        <td data-col="business_name">${escapeHTML(item.business_name || '')}</td>
        <td data-col="system_name">${escapeHTML(item.system_name)}</td>
        <td data-col="ip_address">${escapeHTML(item.ip_address || '')}</td>
        <td data-col="remark">${escapeHTML(item.remark || '')}</td>
        <td data-col="actions" class="system-actions">
          <button type="button" class="action-btn" data-action="edit" data-id="${escapeHTML(item.id)}" title="수정" aria-label="수정">
            <img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon">
          </button>
          <button type="button" class="action-btn" data-action="delete" data-id="${escapeHTML(item.id)}" title="삭제" aria-label="삭제">
            <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">
          </button>
        </td>
      `.trim();
      if (item?.id != null && state.selected.has(String(item.id))) tr.classList.add('selected');
      tbody.appendChild(tr);
    });
  }

  function render() {
    ensureValidPage();
    renderCount();
    renderTable();
    renderPagination();
    applyColumnVisibility();
  }

  async function loadPolicies() {
    const data = await fetchJson(API_POLICIES);
    state.data = Array.isArray(data?.items) ? data.items : [];
    state.selected.clear();
    applySearch();
    render();
  }

  async function loadStoragePools() {
    const data = await fetchJson(API_POOLS);
    storagePools = Array.isArray(data?.items) ? data.items : [];
    refreshStoragePoolSelects();
    renderStoragePoolTable();
  }

  async function loadStorageAssets() {
    try {
      const data = await fetchJson(API_STORAGE_ASSETS);
      storageAssets = Array.isArray(data?.items) ? data.items : [];
    } catch (_e) {
      storageAssets = [];
    }
    // Inline editor renders selects from `storageAssets`.
  }

  function refreshStoragePoolSelects() {
    const opts = (storagePools || [])
      .filter((p) => Number(p?.is_deleted || 0) === 0)
      .map((p) => ({
        value: String(p.id),
        // 요구사항: 스토리지 풀은 풀명만 표시/선택되어야 함
        label: String(p.pool_name || ''),
        // But allow searching by the storage device name without displaying it.
        searchText: String(p.storage_asset_name || ''),
      }));

    function apply(select) {
      if (!select) return;
      const current = String(select.value || '');
      select.innerHTML = '<option value="">선택</option>' + opts.map((o) => {
        const searchAttr = o.searchText ? ` data-search-text="${escapeHTML(o.searchText)}"` : '';
        return `<option value="${escapeHTML(o.value)}"${searchAttr}>${escapeHTML(o.label)}</option>`;
      }).join('');
      if (current) select.value = current;
    }

    const addSel = document.getElementById(ADD_FORM_ID)?.querySelector('select[name="storage_pool_id"]');
    apply(addSel);

    try {
      window.BlossomSearchableSelect?.syncAll?.(document.getElementById(ADD_FORM_ID) || document);
    } catch (_e) {}

    const editSel = document.getElementById(EDIT_FORM_ID)?.querySelector('select[name="storage_pool_id"]');
    apply(editSel);

    try {
      window.BlossomSearchableSelect?.syncAll?.(document.getElementById(EDIT_FORM_ID) || document);
    } catch (_e) {}
  }

  function storageAssetLabel(asset) {
    const workName = (asset && asset.work_name != null) ? String(asset.work_name).trim() : '';
    const systemName = (asset && asset.system_name != null) ? String(asset.system_name).trim() : '';
    const assetName = (asset && asset.asset_name != null) ? String(asset.asset_name).trim() : '';

    if (workName && systemName) return `${workName} (${systemName})`;
    if (workName) return systemName ? `${workName} (${systemName})` : workName;
    if (systemName) return systemName;
    if (assetName) return assetName;
    const id = (asset && asset.id != null) ? String(asset.id) : '';
    return id ? `자산 #${id}` : '자산';
  }

  function storageAssetDisplayLabel(asset) {
    const workName = (asset && asset.work_name != null) ? String(asset.work_name).trim() : '';
    const systemName = (asset && asset.system_name != null) ? String(asset.system_name).trim() : '';
    const assetName = (asset && asset.asset_name != null) ? String(asset.asset_name).trim() : '';

    if (workName) return workName;
    if (systemName) return systemName;
    if (assetName) return assetName;
    const id = (asset && asset.id != null) ? String(asset.id) : '';
    return id ? `자산 #${id}` : '자산';
  }

  function storageAssetDisplayNameById(assetId, fallback) {
    const id = String(assetId || '');
    if (!id) return String(fallback || '');
    const found = (storageAssets || []).find((a) => String(a?.id || '') === id);
    if (!found) return String(fallback || '');
    return storageAssetDisplayLabel(found) || String(fallback || '');
  }

  function storageAssetOptionsHtml(selectedValue) {
    const current = String(selectedValue || '');
    const opts = (storageAssets || [])
      .filter((a) => Number(a?.is_deleted || 0) === 0)
      .map((a) => ({
        value: String(a.id),
        // Search & display should be based on work_name/system_name (not asset_code)
        label: storageAssetLabel(a),
        // Selected display should be compact (work_name only)
        displayLabel: storageAssetDisplayLabel(a),
      }));
    return (
      '<option value="">선택</option>' +
      opts
        .map((o) => {
          const selected = String(o.value) === current ? 'selected' : '';
          const displayAttr = o.displayLabel ? `data-display-label="${escapeHTML(o.displayLabel)}"` : '';
          return `<option value="${escapeHTML(o.value)}" ${selected} ${displayAttr}>${escapeHTML(o.label)}</option>`;
        })
        .join('')
    );
  }

  function readForm(form) {
    const out = {};
    form.querySelectorAll('input,select,textarea').forEach((el) => {
      if (!el.name) return;
      out[el.name] = String(el.value ?? '').trim();
    });
    return out;
  }

  function readAndNormalizeSchedule(form, payload) {
    if (!form || !payload) return;

    function readSearchableDisplayFallback(selectEl, allowedValues) {
      try {
        if (!selectEl || typeof selectEl.closest !== 'function') return '';
        const wrapper = selectEl.closest('.fk-searchable-control');
        const display = wrapper ? wrapper.querySelector('.fk-searchable-display') : null;
        const txt = (display && display.textContent) ? String(display.textContent).trim() : '';
        if (!txt) return '';
        if (Array.isArray(allowedValues) && allowedValues.includes(txt)) return txt;
      } catch (_e) {}
      return '';
    }

    const periodEl = form.querySelector('select[name="schedule_period"]');
    const weekdayEl = form.querySelector('select[name="schedule_weekday"]');
    const dayEl = form.querySelector('input[name="schedule_day"]');

    let period = String(periodEl?.value ?? payload.schedule_period ?? '').trim();
    let weekday = String(weekdayEl?.value ?? payload.schedule_weekday ?? '').trim();
    let day = String(dayEl?.value ?? payload.schedule_day ?? '').trim();

    // Defensive: sometimes searchable-select UI can show a label while the native <select> value is stale.
    // For schedule selects, label === value, so we can safely fall back to the rendered display text.
    if (!period) period = readSearchableDisplayFallback(periodEl, ALLOWED.schedule_period);
    if (!weekday) weekday = readSearchableDisplayFallback(weekdayEl, ALLOWED.schedule_weekday);

    // Enforce conditional schedule semantics consistently.
    if (period !== '매주') weekday = '';
    if (period !== '매달') day = '';

    payload.schedule_period = period;
    payload.schedule_weekday = weekday;
    payload.schedule_day = day;
  }

  function syncScheduleInputs(form) {
    const periodEl = form?.querySelector('select[name="schedule_period"]');
    const weekdayEl = form?.querySelector('select[name="schedule_weekday"]');
    const dayEl = form?.querySelector('input[name="schedule_day"]');
    if (!periodEl || !weekdayEl || !dayEl) return;

    const p = String(periodEl.value || '').trim();

    const enableWeekday = p === '매주';
    const enableDay = p === '매달';

    weekdayEl.disabled = !enableWeekday;
    dayEl.disabled = !enableDay;

    if (!enableWeekday) weekdayEl.value = '';
    if (!enableDay) dayEl.value = '';

    // UX: only require conditional fields when a period is chosen.
    weekdayEl.required = enableWeekday;
    dayEl.required = enableDay;

    // If the select is enhanced (searchable-select), disabled state is rendered on a wrapper.
    // Sync the enhancer so enabling/disabling is reflected immediately.
    try {
      if (window.BlossomSearchableSelect && typeof window.BlossomSearchableSelect.syncAll === 'function') {
        window.BlossomSearchableSelect.syncAll(form);
      }
    } catch (_e) {
      // ignore
    }
  }

  function validatePolicyPayload(payload) {
    if (!payload.backup_scope) return '백업 구분을 선택하세요.';
    if (!payload.system_name) return '시스템 이름은 필수입니다.';
    if (!payload.backup_policy_name) return '백업 정책명은 필수입니다.';
    if (!payload.backup_directory) return '백업 디렉터리는 필수입니다.';
    if (!payload.data_type) return '데이터 유형을 선택하세요.';
    if (!payload.backup_grade) return '백업 등급을 선택하세요.';
    if (!payload.retention_unit) return '보관 기간 단위를 선택하세요.';
    if (!payload.storage_pool_id) return '스토리지 풀을 선택하세요.';
    if (!payload.offsite_yn) return '소산여부를 선택하세요.';
    if (!payload.media_type) return '미디어 구분을 선택하세요.';

    if (!ALLOWED.backup_scope.includes(payload.backup_scope)) return '백업 구분 값이 올바르지 않습니다.';
    if (!ALLOWED.data_type.includes(payload.data_type)) return '데이터 유형 값이 올바르지 않습니다.';
    if (!ALLOWED.backup_grade.includes(payload.backup_grade)) return '백업 등급 값이 올바르지 않습니다.';
    if (!ALLOWED.retention_unit.includes(payload.retention_unit)) return '보관 기간 단위 값이 올바르지 않습니다.';
    if (!ALLOWED.offsite_yn.includes(payload.offsite_yn)) return '소산여부 값이 올바르지 않습니다.';
    if (!ALLOWED.media_type.includes(payload.media_type)) return '미디어 구분 값이 올바르지 않습니다.';

    if (payload.retention_unit !== 'Infinity') {
      const v = Number(payload.retention_value);
      if (!payload.retention_value) return '보관 기간 숫자를 입력하세요.';
      if (!Number.isInteger(v) || v <= 0) return '보관 기간 숫자는 1 이상의 정수여야 합니다.';
    }

    if (payload.start_time && !isHHMM(payload.start_time)) return '시작시간은 HH:MM 형식이어야 합니다. (예: 23:30)';

    // Schedule validation (period/weekday/day)
    const period = String(payload.schedule_period || '').trim();
    const weekday = String(payload.schedule_weekday || '').trim();
    const dayRaw = String(payload.schedule_day || '').trim();
    const hasAnySchedule = Boolean(period || weekday || dayRaw);

    if (hasAnySchedule) {
      if (!period) return '주기를 선택하세요.';
      if (!ALLOWED.schedule_period.includes(period)) return '주기 값이 올바르지 않습니다.';
      if (period === '매주') {
        if (!weekday) return '요일을 선택하세요. (매주 선택 시)';
        if (!ALLOWED.schedule_weekday.includes(weekday)) return '요일 값이 올바르지 않습니다.';
        if (dayRaw) return '일자는 매달 선택 시에만 입력합니다.';
      } else if (period === '매달') {
        if (weekday) return '요일은 매주 선택 시에만 입력합니다.';
        if (!dayRaw) return '일자를 입력하세요. (1~31, 매달 선택 시)';
        const day = Number(dayRaw);
        if (!Number.isInteger(day) || day < 1 || day > 31) return '일자는 1~31 범위의 정수여야 합니다.';
      } else {
        if (weekday) return '요일은 매주 선택 시에만 입력합니다.';
        if (dayRaw) return '일자는 매달 선택 시에만 입력합니다.';
      }
    }

    return null;
  }

  function buildEditFormHtml(item) {
    const poolOptions = (storagePools || [])
      .filter((p) => Number(p?.is_deleted || 0) === 0)
      .map((p) => {
        const label = String(p.pool_name || '');
        const searchAttr = p.storage_asset_name ? ` data-search-text="${escapeHTML(String(p.storage_asset_name))}"` : '';
        return `<option value="${escapeHTML(p.id)}"${searchAttr} ${String(p.id) === String(item.storage_pool_id) ? 'selected' : ''}>${escapeHTML(label)}</option>`;
      })
      .join('');

    function select(name, options, selected) {
      return `<select name="${name}" class="form-input search-select" data-searchable="true" data-placeholder="선택" required>
        <option value="">선택</option>
        ${options.map((o) => `<option value="${escapeHTML(o)}" ${String(o) === String(selected) ? 'selected' : ''}>${escapeHTML(o)}</option>`).join('')}
      </select>`;
    }

    const schedulePeriod = String(item.schedule_period || '').trim();
    const scheduleWeekday = String(item.schedule_weekday || '').trim();
    const scheduleDay = (item.schedule_day == null ? '' : String(item.schedule_day));
    const scheduleWeekdayDisabled = schedulePeriod !== '매주';
    const scheduleDayDisabled = schedulePeriod !== '매달';

    return `
      <input type="hidden" name="id" value="${escapeHTML(item.id)}">
      <div class="form-section">
        <div class="section-header"><h4>백업 대상</h4></div>
        <div class="form-grid">
          <div class="form-row"><label>백업 구분<span class="required">*</span></label>${select('backup_scope', ALLOWED.backup_scope, item.backup_scope)}</div>
          <div class="form-row"><label>업무명<span class="required">*</span></label>
            <select name="business_asset_id" class="form-input search-select" data-searchable="true" data-search-source="gov_backup_work_assets" data-placeholder="업무명 검색" data-allow-clear="true" data-option-multiline="true" required>
              <option value="">업무명 검색</option>
              ${(item.business_name ? `<option value="${escapeHTML(item.business_name)}" selected>${escapeHTML(item.business_name)}</option>` : '')}
            </select>
            <input type="hidden" name="business_name" value="${escapeHTML(item.business_name || '')}">
          </div>
          <div class="form-row"><label>시스템 이름<span class="required">*</span></label><input name="system_name" class="form-input" value="${escapeHTML(item.system_name || '')}" placeholder="업무명을 선택하면 자동 입력" required></div>
          <div class="form-row"><label>IP 주소<span class="required">*</span></label><input name="ip_address" class="form-input" value="${escapeHTML(item.ip_address || '')}" placeholder="업무명을 선택하면 자동 입력" required></div>
        </div>
      </div>
      <div class="form-section">
        <div class="section-header"><h4>백업정책</h4></div>
        <div class="form-grid">
          <div class="form-row"><label>백업 정책명<span class="required">*</span></label><input name="backup_policy_name" class="form-input" value="${escapeHTML(item.backup_policy_name || '')}" required></div>
          <div class="form-row"><label>백업 디렉터리<span class="required">*</span></label><input name="backup_directory" class="form-input" value="${escapeHTML(item.backup_directory || '')}" required></div>
          <div class="form-row"><label>데이터 유형<span class="required">*</span></label>${select('data_type', ALLOWED.data_type, item.data_type)}</div>
        </div>
      </div>

      <div class="form-section">
        <div class="section-header"><h4>백업 시간</h4></div>
        <div class="form-grid">
          <div class="form-row"><label>주기</label>
            <select name="schedule_period" class="form-input search-select" data-searchable="true" data-placeholder="선택">
              <option value="">선택</option>
              ${ALLOWED.schedule_period.map((o) => `<option value="${escapeHTML(o)}" ${String(o) === String(schedulePeriod) ? 'selected' : ''}>${escapeHTML(o)}</option>`).join('')}
            </select>
          </div>
          <div class="form-row"><label>요일</label>
            <select name="schedule_weekday" class="form-input search-select" data-searchable="true" data-placeholder="선택" ${scheduleWeekdayDisabled ? 'disabled' : ''} ${!scheduleWeekdayDisabled ? 'required' : ''}>
              <option value="">선택</option>
              ${ALLOWED.schedule_weekday.map((o) => `<option value="${escapeHTML(o)}" ${String(o) === String(scheduleWeekday) ? 'selected' : ''}>${escapeHTML(o)}</option>`).join('')}
            </select>
          </div>
          <div class="form-row"><label>일자</label><input name="schedule_day" type="number" min="1" max="31" class="form-input" value="${escapeHTML(scheduleDay)}" placeholder="1~31" ${scheduleDayDisabled ? 'disabled' : ''} ${!scheduleDayDisabled ? 'required' : ''}></div>
          <div class="form-row"><label>시작시간<span class="required">*</span></label><input name="start_time" type="text" class="form-input time-text" value="${escapeHTML(item.start_time || '')}" placeholder="HH:MM" inputmode="numeric" maxlength="5" pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$" title="HH:MM (예: 23:30)" required></div>
        </div>
      </div>

      <div class="form-section">
        <div class="section-header"><h4>보관/매체</h4></div>
        <div class="form-grid">
          <div class="form-row"><label>백업 등급<span class="required">*</span></label>${select('backup_grade', ALLOWED.backup_grade, item.backup_grade)}</div>
          <div class="form-row"><label>보관 기간<span class="required">*</span></label>
            <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 10px;">
              <input name="retention_value" type="number" min="1" class="form-input" value="${escapeHTML(item.retention_value ?? '')}" placeholder="숫자">
              <select name="retention_unit" class="form-input search-select" data-searchable="true" data-placeholder="단위 선택" required>
                <option value="">단위 선택</option>
                <option value="주" ${item.retention_unit === '주' ? 'selected' : ''}>주</option>
                <option value="월" ${item.retention_unit === '월' ? 'selected' : ''}>월</option>
                <option value="년" ${item.retention_unit === '년' ? 'selected' : ''}>년</option>
                <option value="Infinity" ${item.retention_unit === 'Infinity' ? 'selected' : ''}>무기한</option>
              </select>
            </div>
          </div>
          <div class="form-row"><label>스토리지 풀<span class="required">*</span></label>
            <select name="storage_pool_id" class="form-input search-select" data-searchable="true" data-placeholder="선택" required>
              <option value="">선택</option>
              ${poolOptions}
            </select>
          </div>
          <div class="form-row"><label>소산여부<span class="required">*</span></label>${select('offsite_yn', ALLOWED.offsite_yn, item.offsite_yn)}</div>
          <div class="form-row"><label>미디어 구분<span class="required">*</span></label>${select('media_type', ALLOWED.media_type, item.media_type)}</div>
          <div class="form-row"><label>비고</label><input name="remark" class="form-input" value="${escapeHTML(item.remark || '')}" placeholder="입력"></div>
        </div>
      </div>
    `.trim();
  }

  function selectedIds() {
    return Array.from(state.selected).map(String).filter(Boolean);
  }

  function syncRetentionInputs(form) {
    const unitEl = form?.querySelector('select[name="retention_unit"]');
    const valueEl = form?.querySelector('input[name="retention_value"]');
    if (!unitEl || !valueEl) return;
    const isInf = String(unitEl.value || '') === 'Infinity';
    valueEl.disabled = isInf;
    if (isInf) valueEl.value = '';
  }

  async function createPolicyFromAddForm() {
    const form = document.getElementById(ADD_FORM_ID);
    if (!form) return;
    const payload = readForm(form);
    readAndNormalizeSchedule(form, payload);
    const err = validatePolicyPayload(payload);
    if (err) {
      showMessage(err, '유효성 오류');
      return;
    }
    if (payload.retention_unit === 'Infinity') payload.retention_value = '';

    await fetchJson(API_POLICIES, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(payload) });
    closeModal(ADD_MODAL_ID);
    await loadPolicies();
    showMessage('등록되었습니다.');
  }

  async function saveEdit() {
    const form = document.getElementById(EDIT_FORM_ID);
    if (!form) return;
    const payload = readForm(form);
    readAndNormalizeSchedule(form, payload);
    const id = payload.id;
    const err = validatePolicyPayload(payload);
    if (err) {
      showMessage(err, '유효성 오류');
      return;
    }
    if (payload.retention_unit === 'Infinity') payload.retention_value = '';

    await fetchJson(`${API_POLICIES}/${encodeURIComponent(id)}`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(payload) });
    closeModal(EDIT_MODAL_ID);
    await loadPolicies();
    showMessage('저장되었습니다.');
  }

  async function bulkDeleteSelected() {
    const ids = selectedIds();
    if (ids.length === 0) {
      showMessage('선택된 항목이 없습니다.');
      return;
    }
    await fetchJson(`${API_POLICIES}/bulk-delete`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ ids }) });
    closeModal(DELETE_MODAL_ID);
    await loadPolicies();
    showMessage('삭제처리 되었습니다.');
  }

  function renderStoragePoolTable() {
    const tbody = document.getElementById(STORAGE_POOL_TBODY_ID);
    if (!tbody) return;
    const items = (storagePools || []).filter((p) => Number(p?.is_deleted || 0) === 0);

    function renderRowView(p) {
      return `
        <tr data-row-id="${escapeHTML(p.id)}">
          <td><input type="checkbox" class="storage-pool-row" data-id="${escapeHTML(p.id)}"></td>
          <td>${escapeHTML(p.pool_name)}</td>
          <td>${escapeHTML(storageAssetDisplayNameById(p.storage_asset_id, p.storage_asset_name || ''))}</td>
          <td>${escapeHTML(p.remark || '')}</td>
          <td class="system-actions">
            <button type="button" class="action-btn" data-action="pool-edit" data-id="${escapeHTML(p.id)}" title="수정" aria-label="수정">
              <img src="/static/image/svg/list/free-icon-pencil.svg" alt="수정" class="action-icon">
            </button>
            <button type="button" class="action-btn" data-action="pool-delete" data-id="${escapeHTML(p.id)}" title="삭제" aria-label="삭제">
              <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">
            </button>
          </td>
        </tr>
      `.trim();
    }

    function renderRowEdit(p) {
      const rowId = String(p?.id ?? '__new__');
      const poolName = p?.pool_name || '';
      const storageAssetId = p?.storage_asset_id || '';
      const remark = p?.remark || '';
      return `
        <tr data-row-id="${escapeHTML(rowId)}" class="editing">
          <td><input type="checkbox" class="storage-pool-row" disabled aria-label="선택"></td>
          <td><input class="form-input" data-field="pool_name" value="${escapeHTML(poolName)}" placeholder="예: PTL, VTL_A" required></td>
          <td>
            <select class="form-input search-select" data-searchable="true" data-placeholder="선택" data-field="storage_asset_id" required>
              ${storageAssetOptionsHtml(storageAssetId)}
            </select>
          </td>
          <td><input class="form-input" data-field="remark" value="${escapeHTML(remark)}" placeholder="입력"></td>
          <td class="system-actions">
            <button type="button" class="action-btn" data-action="pool-save" data-id="${escapeHTML(rowId)}" title="저장" aria-label="저장">
              <img src="/static/image/svg/save.svg" alt="저장" class="action-icon">
            </button>
            <button type="button" class="action-btn" data-action="pool-delete" data-id="${escapeHTML(rowId)}" title="삭제" aria-label="삭제">
              <img src="/static/image/svg/list/free-icon-trash.svg" alt="삭제" class="action-icon">
            </button>
          </td>
        </tr>
      `.trim();
    }

    const rows = [];
    if (poolEditId === '__new__') {
      rows.push(renderRowEdit({ id: '__new__', pool_name: '', storage_asset_id: '', remark: '' }));
    }

    items.forEach((p) => {
      if (poolEditId && String(poolEditId) === String(p.id)) rows.push(renderRowEdit(p));
      else rows.push(renderRowView(p));
    });

    tbody.innerHTML = rows.join('');

    try {
      window.BlossomSearchableSelect?.syncAll?.(document.getElementById(STORAGE_POOL_MODAL_ID) || document);
    } catch (_e) {}
  }

  function poolSelectedIds() {
    return Array.from(document.querySelectorAll(`#${STORAGE_POOL_TBODY_ID} .storage-pool-row:checked`))
      .map((el) => String(el.dataset.id || ''))
      .filter(Boolean);
  }

  function readStoragePoolRowPayload(rowId) {
    const escape = (value) => {
      const v = String(value ?? '');
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(v);
      return v.replaceAll('"', '\\"');
    };

    const tr = document.querySelector(`#${STORAGE_POOL_TBODY_ID} tr[data-row-id="${escape(rowId)}"]`);
    if (!tr) return null;
    const pool_name = tr.querySelector('[data-field="pool_name"]')?.value?.trim() || '';
    const storage_asset_id = tr.querySelector('[data-field="storage_asset_id"]')?.value?.trim() || '';
    const remark = tr.querySelector('[data-field="remark"]')?.value?.trim() || '';
    return { pool_name, storage_asset_id, remark };
  }

  async function saveStoragePoolRow(rowId) {
    const payload = readStoragePoolRowPayload(rowId);
    if (!payload) return;

    clearStoragePoolInlineMessage();

    if (!payload.pool_name) {
      setStoragePoolInlineMessage('스토리지 풀명은 필수입니다.', 'error');
      return;
    }
    if (!payload.storage_asset_id) {
      setStoragePoolInlineMessage('스토리지 장치를 선택하세요.', 'error');
      return;
    }

    if (String(rowId) === '__new__') {
      await fetchJson(API_POOLS, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(payload) });
    } else {
      await fetchJson(`${API_POOLS}/${encodeURIComponent(String(rowId))}`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(payload) });
    }

    poolEditId = null;
    await loadStoragePools();
    await loadPolicies();
    // Intentionally no success alert for 기준설정(스토리지 풀) 모달 saves.
  }

  async function deleteStoragePoolsSelected() {
    const ids = poolSelectedIds();
    if (ids.length === 0) {
      setStoragePoolInlineMessage('선택된 스토리지 풀이 없습니다.', 'error');
      return;
    }
    await fetchJson(`${API_POOLS}/bulk-delete`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ ids }) });
    await loadStoragePools();
    await loadPolicies();
    // No modal alert for 기준설정(스토리지 풀) 모달 actions.
  }

  async function deleteStoragePoolRow(rowId) {
    const id = String(rowId ?? '').trim();
    if (!id) return;

    clearStoragePoolInlineMessage();

    // New row: treat as discard
    if (id === '__new__') {
      poolEditId = null;
      renderStoragePoolTable();
      return;
    }

    await fetchJson(`${API_POOLS}/bulk-delete`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ ids: [id] }) });
    poolEditId = null;
    await loadStoragePools();
    await loadPolicies();
    // No modal alert for 기준설정(스토리지 풀) 모달 actions.
  }

  async function openStoragePoolModal() {
    openModal(STORAGE_POOL_MODAL_ID);
    clearStoragePoolInlineMessage();
    await loadStorageAssets();
    await loadStoragePools();
  }

  function bind() {
    // Add
    document.getElementById(ADD_BTN_ID)?.addEventListener('click', async () => {
      document.getElementById(ADD_FORM_ID)?.reset();
      await loadStoragePools();
      const form = document.getElementById(ADD_FORM_ID);
      if (form) {
        ensureWorkAssetSearchSource();
        syncRetentionInputs(form);
        syncScheduleInputs(form);
        enhanceSearchSelects(form);
        setupWorkAssetAutofill(form, { initialDisable: true, disableOnEmpty: true, clearOnEmpty: true });
        syncSearchSelects(form);
      }
      openModal(ADD_MODAL_ID);
    });
    document.getElementById(ADD_CLOSE_ID)?.addEventListener('click', () => closeModal(ADD_MODAL_ID));
    document.getElementById(ADD_SAVE_ID)?.addEventListener('click', async () => {
      try {
        await createPolicyFromAddForm();
      } catch (e) {
        showMessage(e.message || '등록 중 오류가 발생했습니다.');
      }
    });

    // Add form retention
    document.getElementById(ADD_FORM_ID)?.addEventListener('change', (e) => {
      if (e.target?.name === 'retention_unit') syncRetentionInputs(document.getElementById(ADD_FORM_ID));
      if (e.target?.name === 'schedule_period') syncScheduleInputs(document.getElementById(ADD_FORM_ID));
    });

    // Edit
    document.getElementById(EDIT_CLOSE_ID)?.addEventListener('click', () => closeModal(EDIT_MODAL_ID));
    document.getElementById(EDIT_SAVE_ID)?.addEventListener('click', async () => {
      try {
        await saveEdit();
      } catch (e) {
        showMessage(e.message || '저장 중 오류가 발생했습니다.');
      }
    });
    document.getElementById(EDIT_FORM_ID)?.addEventListener('change', (e) => {
      if (e.target?.name === 'retention_unit') syncRetentionInputs(document.getElementById(EDIT_FORM_ID));
      if (e.target?.name === 'schedule_period') syncScheduleInputs(document.getElementById(EDIT_FORM_ID));
    });

    // Delete
    document.getElementById(DELETE_BTN_ID)?.addEventListener('click', () => {
      const ids = selectedIds();
      if (ids.length === 0) {
        showMessage('선택된 항목이 없습니다.');
        return;
      }
      const subtitle = document.getElementById('delete-subtitle');
      if (subtitle) subtitle.textContent = `선택된 ${ids.length}개의 백업 정책을 정말 삭제처리하시겠습니까?`;
      openModal(DELETE_MODAL_ID);
    });
    document.getElementById(DELETE_CLOSE_ID)?.addEventListener('click', () => closeModal(DELETE_MODAL_ID));
    document.getElementById(DELETE_CONFIRM_ID)?.addEventListener('click', async () => {
      try {
        await bulkDeleteSelected();
      } catch (e) {
        showMessage(e.message || '삭제 중 오류가 발생했습니다.');
      }
    });

    // Search
    const searchEl = document.getElementById(SEARCH_ID);
    searchEl?.addEventListener('input', () => {
      state.search = searchEl.value;
      applySearch();
      render();
    });
    document.getElementById(SEARCH_CLEAR_ID)?.addEventListener('click', () => {
      if (searchEl) searchEl.value = '';
      state.search = '';
      applySearch();
      render();
    });

    // Page size
    document.getElementById(PAGE_SIZE_ID)?.addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10);
      state.pageSize = Number.isFinite(v) && v > 0 ? v : 10;
      state.page = 1;
      render();
    });

    // Pagination
    document.getElementById('system-first')?.addEventListener('click', () => {
      state.page = 1;
      render();
    });
    document.getElementById('system-prev')?.addEventListener('click', () => {
      state.page = Math.max(1, state.page - 1);
      render();
    });
    document.getElementById('system-next')?.addEventListener('click', () => {
      state.page = Math.min(pageCount(), state.page + 1);
      render();
    });
    document.getElementById('system-last')?.addEventListener('click', () => {
      state.page = pageCount();
      render();
    });

    // Table selection + actions
    document.getElementById(TBODY_ID)?.addEventListener('change', (e) => {
      const cb = e.target.closest('input.system-row-select');
      if (!cb) return;
      const id = String(cb.dataset.id || '');
      if (!id) return;
      if (cb.checked) state.selected.add(id);
      else state.selected.delete(id);

      // Match Backup Tape behavior: toggle row highlight immediately
      const tr = cb.closest('tr');
      if (tr) tr.classList.toggle('selected', !!cb.checked);
    });
    document.getElementById(SELECT_ALL_ID)?.addEventListener('change', (e) => {
      const checked = !!e.target.checked;
      currentPageItems().forEach((item) => {
        const id = String(item.id);
        if (checked) state.selected.add(id);
        else state.selected.delete(id);
      });
      render();
    });
    document.getElementById(TBODY_ID)?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!id) return;

      if (action === 'delete') {
        state.selected.clear();
        state.selected.add(String(id));
        render();

        const subtitle = document.getElementById('delete-subtitle');
        if (subtitle) subtitle.textContent = '선택된 1개의 백업 정책을 정말 삭제처리하시겠습니까?';
        openModal(DELETE_MODAL_ID);
        return;
      }

      if (action !== 'edit') return;

      const item = state.data.find((x) => String(x.id) === String(id));
      if (!item) {
        showMessage('대상을 찾을 수 없습니다.');
        return;
      }

      const form = document.getElementById(EDIT_FORM_ID);
      if (!form) return;

      await loadStoragePools();
      form.innerHTML = buildEditFormHtml(item);
      syncRetentionInputs(form);
      syncScheduleInputs(form);
      ensureWorkAssetSearchSource();
      enhanceSearchSelects(form);
      setupWorkAssetAutofill(form, { initialDisable: false, disableOnEmpty: false, clearOnEmpty: false });
      syncSearchSelects(form);
      openModal(EDIT_MODAL_ID);
    });

    // Match Backup Tape behavior: click anywhere on row toggles selection (except checkbox/actions)
    document.getElementById(TBODY_ID)?.addEventListener('click', (e) => {
      if (e.target.closest('.system-actions')) return; // 관리 버튼 영역 제외
      const tr = e.target.closest('tr');
      if (!tr) return;
      const cb = tr.querySelector('input.system-row-select');
      if (!cb) return;
      if (e.target.classList.contains('system-row-select')) return; // 체크박스 자체 클릭은 change 이벤트 처리

      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Unsupported buttons
    document.getElementById(DISPOSE_BTN_ID)?.addEventListener('click', () => showMessage('현재 페이지에서는 삭제처리를 사용하세요.'));
    document.getElementById(BULK_BTN_ID)?.addEventListener('click', () => showMessage('일괄변경은 준비중입니다.'));
    document.getElementById(STATS_BTN_ID)?.addEventListener('click', () => {
      buildStats();
      openModal(STATS_MODAL_ID);
      requestAnimationFrame(() => equalizeStatsHeights());
      window.addEventListener('resize', equalizeStatsHeights);
    });
    const closeStats = () => {
      closeModal(STATS_MODAL_ID);
      window.removeEventListener('resize', equalizeStatsHeights);
    };
    document.getElementById(STATS_CLOSE_ID)?.addEventListener('click', closeStats);
    document.getElementById(STATS_OK_ID)?.addEventListener('click', closeStats);

    document.getElementById(DUPLICATE_BTN_ID)?.addEventListener('click', () => {
      const ids = selectedIds();
      if (!ids.length) {
        showMessage('복제할 행을 선택하세요.', '안내');
        return;
      }
      const subtitle = document.getElementById('duplicate-subtitle');
      if (subtitle) subtitle.textContent = `선택된 ${ids.length}개의 행을 복제합니다.`;
      openModal(DUPLICATE_MODAL_ID);
    });
    document.getElementById(DUPLICATE_CLOSE_ID)?.addEventListener('click', () => closeModal(DUPLICATE_MODAL_ID));
    document.getElementById(DUPLICATE_CONFIRM_ID)?.addEventListener('click', async () => {
      const ids = selectedIds();
      if (!ids.length) {
        showMessage('복제할 행을 선택하세요.', '안내');
        return;
      }
      let ok = 0;
      const errs = [];
      for (const id of ids) {
        const src = state.data.find((x) => String(x.id) === String(id));
        if (!src) {
          errs.push(`ID ${id}: 대상을 찾을 수 없습니다.`);
          continue;
        }
        const payload = {
          backup_scope: src.backup_scope,
          business_name: src.business_name || '',
          system_name: src.system_name,
          ip_address: src.ip_address || '',
          backup_policy_name: uniqueCopyName(src.backup_policy_name),
          backup_directory: src.backup_directory,
          data_type: src.data_type,
          backup_grade: src.backup_grade,
          retention_value: src.retention_value ?? '',
          retention_unit: src.retention_unit || '',
          storage_pool_id: src.storage_pool_id,
          offsite_yn: src.offsite_yn,
          media_type: src.media_type,
          schedule_period: src.schedule_period || '',
          schedule_weekday: src.schedule_weekday || '',
          schedule_day: src.schedule_day ?? '',
          start_time: src.start_time || '',
          remark: src.remark || '',
        };
        if (payload.retention_unit === 'Infinity') payload.retention_value = '';
        const err = validatePolicyPayload(payload);
        if (err) {
          errs.push(`${src.backup_policy_name || id}: ${err}`);
          continue;
        }
        try {
          await fetchJson(API_POLICIES, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(payload) });
          ok++;
        } catch (e) {
          errs.push(`${src.backup_policy_name || id}: ${e?.message || '복제 실패'}`);
        }
      }
      closeModal(DUPLICATE_MODAL_ID);
      await loadPolicies();
      if (errs.length) {
        showMessage(`복제 ${ok}건 성공, ${errs.length}건 실패\n\n${errs.slice(0, 5).join('\n')}${errs.length > 5 ? `\n...외 ${errs.length - 5}건` : ''}`);
      } else {
        showMessage(`복제 ${ok}건 성공`);
      }
    });

    document.getElementById(DOWNLOAD_BTN_ID)?.addEventListener('click', () => {
      const total = (state.filtered || []).length;
      const selected = selectedIds().length;
      const subtitle = document.getElementById('download-subtitle');
      if (subtitle) subtitle.textContent = `현재 결과 ${total}건을 CSV로 내보냅니다.`;
      const rowSel = document.getElementById(CSV_RANGE_ROW_SELECTED_ID);
      if (rowSel) rowSel.style.opacity = selected ? '1' : '0.5';
      const selRadio = document.getElementById(CSV_RANGE_SELECTED_ID);
      if (selRadio) selRadio.disabled = !selected;
      document.getElementById(CSV_RANGE_ALL_ID)?.click();
      openModal(DOWNLOAD_MODAL_ID);
    });
    document.getElementById(DOWNLOAD_CLOSE_ID)?.addEventListener('click', () => closeModal(DOWNLOAD_MODAL_ID));
    document.getElementById(DOWNLOAD_CONFIRM_ID)?.addEventListener('click', () => {
      const onlySelected = document.getElementById(CSV_RANGE_SELECTED_ID)?.checked;
      if (onlySelected && selectedIds().length === 0) {
        showMessage('선택된 행이 없습니다.', '안내');
        return;
      }
      exportCSV(!!onlySelected);
      closeModal(DOWNLOAD_MODAL_ID);
    });

    document.getElementById(UPLOAD_BTN_ID)?.addEventListener('click', async () => {
      try {
        await loadStoragePools();
      } catch (_e) {}
      initUploadAnim();
      resetUploadUI();
      openModal(UPLOAD_MODAL_ID);
    });
    document.getElementById(UPLOAD_CLOSE_ID)?.addEventListener('click', () => {
      closeModal(UPLOAD_MODAL_ID);
      resetUploadUI();
    });
    document.getElementById(UPLOAD_TEMPLATE_BTN_ID)?.addEventListener('click', downloadUploadTemplate);
    document.getElementById(UPLOAD_CONFIRM_ID)?.addEventListener('click', confirmUpload);

    const uploadInput = document.getElementById(UPLOAD_INPUT_ID);
    const uploadZone = document.getElementById(UPLOAD_DROPZONE_ID);
    function onFilePicked(file) {
      if (!acceptUploadFile(file)) {
        showMessage('지원하지 않는 파일이거나 10MB를 초과합니다. .xls/.xlsx만 가능합니다.', '업로드 오류');
        resetUploadUI();
        return;
      }
      setUploadFileUI(file);
    }
    uploadZone?.addEventListener('click', () => uploadInput?.click());
    uploadZone?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') uploadInput?.click();
    });
    uploadZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.classList.add('is-dragover');
    });
    uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('is-dragover'));
    uploadZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('is-dragover');
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      if (uploadInput) uploadInput.files = e.dataTransfer.files;
      onFilePicked(f);
    });
    uploadInput?.addEventListener('change', () => {
      const f = uploadInput.files?.[0];
      if (!f) return;
      onFilePicked(f);
    });
    document.getElementById(COLUMN_BTN_ID)?.addEventListener('click', () => {
      buildColumnModal();
      openModal(COLUMN_MODAL_ID);
    });
    document.getElementById(COLUMN_CLOSE_ID)?.addEventListener('click', () => closeModal(COLUMN_MODAL_ID));
    document.getElementById(COLUMN_APPLY_ID)?.addEventListener('click', handleColumnApply);
    document.getElementById(COLUMN_RESET_ID)?.addEventListener('click', handleColumnReset);
    document.getElementById(COLUMN_SELECTALL_BTN_ID)?.addEventListener('click', handleColumnSelectAllToggle);
    document.getElementById(COLUMN_FORM_ID)?.addEventListener('change', (e) => {
      const box = e.target?.closest?.('input[type=checkbox]');
      if (!box) return;
      const label = box.closest('label.column-checkbox');
      if (label) label.classList.toggle('is-active', box.checked);

      const form = document.getElementById(COLUMN_FORM_ID);
      if (!form) return;
      const boxes = Array.from(form.querySelectorAll('input[type=checkbox]'));
      const checkedCount = boxes.filter((b) => b.checked).length;
      if (checkedCount === 0 && boxes.length) {
        boxes[0].checked = true;
        const l0 = boxes[0].closest('label.column-checkbox');
        if (l0) l0.classList.add('is-active');
      }
      syncColumnSelectAll();
    });

    // Message modal
    document.getElementById('system-message-close')?.addEventListener('click', () => closeModal('system-message-modal'));
    document.getElementById('system-message-ok')?.addEventListener('click', () => closeModal('system-message-modal'));

    // Storage pool modal
    document.getElementById(STORAGE_POOL_OPEN_BTN)?.addEventListener('click', () => openStoragePoolModal());
    document.getElementById(STORAGE_POOL_OPEN_INLINE_BTN)?.addEventListener('click', () => openStoragePoolModal());
    document.getElementById(STORAGE_POOL_CLOSE_ID)?.addEventListener('click', () => closeModal(STORAGE_POOL_MODAL_ID));
    document.getElementById(STORAGE_POOL_OK_ID)?.addEventListener('click', () => closeModal(STORAGE_POOL_MODAL_ID));
    document.getElementById(STORAGE_POOL_ADD_ROW_ID)?.addEventListener('click', () => {
      poolEditId = '__new__';
      renderStoragePoolTable();
    });
    document.getElementById(STORAGE_POOL_SELECT_ALL_ID)?.addEventListener('change', (e) => {
      const checked = !!e.target.checked;
      document.querySelectorAll(`#${STORAGE_POOL_TBODY_ID} .storage-pool-row`).forEach((cb) => {
        cb.checked = checked;
      });
    });
    document.getElementById(STORAGE_POOL_TBODY_ID)?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      // Storage pool modal should never open the global message modal.
      clearStoragePoolInlineMessage();

      if (action === 'pool-edit') {
        poolEditId = String(id);
        renderStoragePoolTable();
        return;
      }

      if (action === 'pool-delete') {
        try {
          await deleteStoragePoolRow(id);
        } catch (err) {
          setStoragePoolInlineMessage(err?.message || '스토리지 풀 삭제 중 오류가 발생했습니다.', 'error');
        }
        return;
      }

      if (action === 'pool-save') {
        try {
          await saveStoragePoolRow(id);
        } catch (err) {
          setStoragePoolInlineMessage(err?.message || '스토리지 풀 저장 중 오류가 발생했습니다.', 'error');
        }
      }
    });

    // ESC
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      [
        ADD_MODAL_ID,
        EDIT_MODAL_ID,
        DELETE_MODAL_ID,
        STORAGE_POOL_MODAL_ID,
        DUPLICATE_MODAL_ID,
        DOWNLOAD_MODAL_ID,
        STATS_MODAL_ID,
        UPLOAD_MODAL_ID,
        'system-message-modal',
      ].forEach(closeModal);
    });
  }

  async function init() {
bind();

    loadColumnSelection();

    try {
      await loadStoragePools();
      await loadPolicies();
    } catch (e) {
      showMessage(e.message || '초기 로딩 중 오류가 발생했습니다.');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
