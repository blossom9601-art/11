# Blossom Runbook

## 2026-04-12 - Common Delete Modal Standardization (Non-System Pages)

### Request
- Apply the common delete modal style used in:
  - Data Center > Data Deletion Management > Data Deletion Registration/History
- Exclude system pages from this standardization.
- Remove the line `(실제 삭제 방식은 추후 설정에 따라 결정됩니다)`.
- Slightly reduce font size for:
  - `삭제처리는 선택한 서버를 데이터에서 제거하기 위한 사전 확인 단계입니다.`
  - `확인 후에는 선택된 항목에 대해 삭제 프로세스를 진행합니다.`

### Implementation
- Added a global delete modal normalizer in `static/js/blossom.js`.
- Normalizer targets:
  - `#system-delete-modal`
  - `#insight-delete-modal`
- Applied style/behavior to match the common delete modal pattern:
  - content width (`max-width: 640px`)
  - warning text block (`삭제된 데이터는 복구할 수 없습니다.`)
  - delete illustration (`free-sticker-process.svg`)
  - action buttons normalized to:
    - `취소` (`btn-secondary`)
    - `삭제` (`btn-danger`)
- Added cancel close handling for normalized modals.
- Added text tuning in normalizer:
  - remove legacy guidance line containing `실제 삭제 방식은 추후 설정에 따라 결정됩니다`
  - set target two lines to smaller text (`font-size: 13px`, `line-height: 1.45`)
- Exclusion rule in normalizer:
  - skip on system page paths (`dc_data_deletion_system`, paths matching `system` segment pattern)

### Deployment
- Deployed with `_deploy_sidebar_fix.py`.
- Service restart status: `active`.

### Verification
- Remote `static/js/blossom.js` contains:
  - `Common Delete Modal Normalizer`
  - `insight-delete-cancel`
  - `system-delete-cancel`
  - phrase-removal and small-font rules
- Deployment content check result: all `OK`.
