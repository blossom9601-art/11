import json
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from flask import current_app


_STORE_FILENAME = 'thermometer_logs.json'
_ALLOWED_PLACES = ['퓨처센터(5층)', '퓨처센터(6층)', '을지트윈타워(15층)', '재해복구센터(4층)']


def _now_iso() -> str:
    return datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')


def normalize_place(raw: Any) -> str:
    if raw is None:
        return ''
    s = str(raw).strip()
    if not s:
        return ''
    if s in _ALLOWED_PLACES:
        return s
    for base in _ALLOWED_PLACES:
        if s.startswith(base):
            return base
    # fallback token before first whitespace
    base = s.split()[0] if s.split() else ''
    return base if base in _ALLOWED_PLACES else ''


def _store_path(app=None) -> str:
    app = app or current_app
    instance_dir = app.instance_path
    os.makedirs(instance_dir, exist_ok=True)
    return os.path.join(instance_dir, _STORE_FILENAME)


def _read_all(app=None) -> List[Dict[str, Any]]:
    path = _store_path(app)
    if not os.path.exists(path):
        return []
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
        return []
    except Exception:
        # If the file is corrupted, fail closed (empty) rather than crashing the whole page.
        return []


def _atomic_write(path: str, payload: Any) -> None:
    tmp_path = f"{path}.tmp"
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, path)


def _write_all(items: List[Dict[str, Any]], app=None) -> None:
    path = _store_path(app)
    _atomic_write(path, items)


def list_logs(app=None) -> List[Dict[str, Any]]:
    # Keep insertion order (newest typically unshifted on create). If you want sorting,
    # do it in the caller.
    return _read_all(app)


def create_log(payload: Dict[str, Any], actor: str, app=None) -> Dict[str, Any]:
    items = _read_all(app)
    max_id = 0
    for row in items:
        try:
            max_id = max(max_id, int(row.get('id') or 0))
        except Exception:
            continue

    date = str((payload.get('date') or '')).strip()
    place = normalize_place(payload.get('place') or '')
    result = str((payload.get('result') or '')).strip()

    if not date:
        raise ValueError('날짜 값은 필수입니다.')
    if not place:
        raise ValueError('장소 값은 필수입니다.')
    if not result:
        raise ValueError('결과 값은 필수입니다.')

    # Duplicate guard: (date, normalized place)
    for row in items:
        if str(row.get('date') or '').strip() == date and normalize_place(row.get('place') or '') == place:
            raise ValueError('해당 날짜와 장소의 기록이 이미 존재합니다.')

    new_id = max_id + 1
    now = _now_iso()

    record: Dict[str, Any] = {
        'id': new_id,
        'date': date,
        'place': place,
        'temp_max': payload.get('temp_max') or '',
        'temp_avg': payload.get('temp_avg') or '',
        'humid_max': payload.get('humid_max') or '',
        'humid_avg': payload.get('humid_avg') or '',
        'result': result,
        'note': payload.get('note') or '',
        # Optional analysis payload
        'analysis_rows': payload.get('analysis_rows') if isinstance(payload.get('analysis_rows'), list) else [],
        'analysis_overall': payload.get('analysis_overall') if isinstance(payload.get('analysis_overall'), dict) else None,
        'created_at': now,
        'created_by': actor,
        'updated_at': None,
        'updated_by': None,
    }

    items.insert(0, record)
    _write_all(items, app)
    return record


def update_log(log_id: int, payload: Dict[str, Any], actor: str, app=None) -> Optional[Dict[str, Any]]:
    items = _read_all(app)
    idx = next((i for i, r in enumerate(items) if int(r.get('id') or 0) == log_id), None)
    if idx is None:
        return None

    existing = items[idx]

    date = str((payload.get('date') if 'date' in payload else existing.get('date') or '')).strip()
    place_raw = payload.get('place') if 'place' in payload else existing.get('place') or ''
    place = normalize_place(place_raw)
    result = str((payload.get('result') if 'result' in payload else existing.get('result') or '')).strip()

    if not date:
        raise ValueError('날짜 값은 필수입니다.')
    if not place:
        raise ValueError('장소 값은 필수입니다.')
    if not result:
        raise ValueError('결과 값은 필수입니다.')

    # Duplicate guard excluding self
    for row in items:
        rid = int(row.get('id') or 0)
        if rid == log_id:
            continue
        if str(row.get('date') or '').strip() == date and normalize_place(row.get('place') or '') == place:
            raise ValueError('해당 날짜와 장소의 기록이 이미 존재합니다.')

    updated: Dict[str, Any] = dict(existing)
    updated['date'] = date
    updated['place'] = place
    if 'temp_max' in payload:
        updated['temp_max'] = payload.get('temp_max') or ''
    if 'temp_avg' in payload:
        updated['temp_avg'] = payload.get('temp_avg') or ''
    if 'humid_max' in payload:
        updated['humid_max'] = payload.get('humid_max') or ''
    if 'humid_avg' in payload:
        updated['humid_avg'] = payload.get('humid_avg') or ''
    updated['result'] = result
    if 'note' in payload:
        updated['note'] = payload.get('note') or ''

    if 'analysis_rows' in payload:
        updated['analysis_rows'] = payload.get('analysis_rows') if isinstance(payload.get('analysis_rows'), list) else []
    if 'analysis_overall' in payload:
        updated['analysis_overall'] = payload.get('analysis_overall') if isinstance(payload.get('analysis_overall'), dict) else None

    updated['updated_at'] = _now_iso()
    updated['updated_by'] = actor

    items[idx] = updated
    _write_all(items, app)
    return updated


def delete_logs(ids: List[int], app=None) -> int:
    if not ids:
        return 0
    id_set = {int(x) for x in ids if isinstance(x, int) or str(x).isdigit()}
    if not id_set:
        return 0
    items = _read_all(app)
    before = len(items)
    items = [r for r in items if int(r.get('id') or 0) not in id_set]
    deleted = before - len(items)
    if deleted:
        _write_all(items, app)
    return deleted
