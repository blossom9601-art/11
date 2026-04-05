import os
from typing import Any, Dict, Optional

from flask import Blueprint, jsonify, request, send_from_directory

from app.services.rack_detail_sqlite import (
    RACK_CHANGE_HISTORY_TABLE,
    RACK_FILE_TABLE,
    RACK_WORK_HISTORY_TABLE,
    ensure_rack_tables,
    fail,
    make_storage_name,
    normalize_role,
    ok,
    paginate,
    sanitize_int,
    sqlite_tx,
    uploads_base_dir,
)


rack_detail_api_bp = Blueprint('rack_detail_api', __name__)


def _row_to_dict(row) -> Dict[str, Any]:
    return dict(row) if row is not None else {}


def _resolve_actor() -> str:
    # Keep it simple: header overrides, else anonymous.
    actor = (request.headers.get('X-Actor') or request.headers.get('X-User') or '').strip()
    return actor or 'system'


def _get_rack_by_code(conn, rack_code: str) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        """
        SELECT *
        FROM org_rack
        WHERE rack_code = ?
          AND is_deleted = 0
        """,
        (rack_code,),
    ).fetchone()
    return _row_to_dict(row) if row else None


def _candidate_rack_identifiers(raw: str) -> list[str]:
    v = (raw or '').strip()
    if not v:
        return []
    cands = [v]
    if '-' in v:
        cands.append(v.replace('-', '_'))
    if '_' in v:
        cands.append(v.replace('_', '-'))
    # de-dupe preserving order
    seen = set()
    out: list[str] = []
    for c in cands:
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out


def _resolve_rack(conn, identifier: str) -> tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Resolve rack by flexible identifier.

    Accepts:
    - rack_code (canonical)
    - rack_position (display)
    - hyphen/underscore variants

    Returns (rack_dict, resolved_rack_code).
    """
    for cand in _candidate_rack_identifiers(identifier):
        row = conn.execute(
            """
            SELECT *
            FROM org_rack
            WHERE is_deleted = 0
                            AND (rack_code = ? OR rack_position = ?)
            LIMIT 2
            """,
                        (cand, cand),
        ).fetchall()
        if not row:
            continue

        # Prefer exact rack_code match when multiple match.
        chosen = None
        for r in row:
            if (r['rack_code'] or '') == cand:
                chosen = r
                break
        if chosen is None:
            chosen = row[0]
        rack = dict(chosen)
        return rack, rack.get('rack_code')
    return None, None


@rack_detail_api_bp.route('/api/racks/<rack_code>', methods=['GET'])
def get_rack_detail(rack_code: str):
    try:
        with sqlite_tx() as conn:
            ensure_rack_tables(conn)
            rack, resolved_code = _resolve_rack(conn, rack_code)
            if not rack:
                return jsonify(fail('not found')), 404

            files = conn.execute(
                f"""
                SELECT *
                FROM {RACK_FILE_TABLE}
                WHERE rack_code = ? AND is_deleted = 0
                ORDER BY id DESC
                """,
                (resolved_code,),
            ).fetchall()

            data = {
                'rack': rack,
                'files': [dict(r) for r in files],
            }
            return jsonify(ok(data))
    except Exception as exc:
        return jsonify(fail('failed to load rack', {'error': str(exc)})), 500


@rack_detail_api_bp.route('/api/racks/<rack_code>', methods=['PUT'])
def update_rack_detail(rack_code: str):
    payload = request.get_json(silent=True) or {}

    allowed_fields = {
        'business_status_code',
        'business_name',
        'manufacturer_code',
        'system_model_code',
        'serial_number',
        'center_code',
        'rack_position',
        'system_height_u',
        'system_dept_code',
        'system_manager_id',
        'service_dept_code',
        'service_manager_id',
        'remark',
    }

    updates = {k: payload.get(k) for k in allowed_fields if k in payload}

    if 'system_height_u' in updates:
        updates['system_height_u'] = sanitize_int(updates.get('system_height_u'), minimum=0) or 0
    if 'system_manager_id' in updates:
        updates['system_manager_id'] = sanitize_int(updates.get('system_manager_id'), minimum=0) or 0
    if 'service_manager_id' in updates:
        updates['service_manager_id'] = sanitize_int(updates.get('service_manager_id'), minimum=0) or 0

    if not updates:
        return jsonify(fail('no updatable fields provided')), 400

    actor = _resolve_actor()

    try:
        with sqlite_tx() as conn:
            ensure_rack_tables(conn)
            existing, resolved_code = _resolve_rack(conn, rack_code)
            if not existing:
                return jsonify(fail('not found')), 404

            set_parts = []
            params = []
            for key, value in updates.items():
                set_parts.append(f"{key} = ?")
                params.append(value if value is not None else '')

            set_parts.append('updated_at = CURRENT_TIMESTAMP')
            set_parts.append('updated_by = ?')
            params.append(actor)

            params.append(resolved_code)
            conn.execute(
                f"UPDATE org_rack SET {', '.join(set_parts)} WHERE rack_code = ? AND is_deleted = 0",
                tuple(params),
            )

            rack = _get_rack_by_code(conn, resolved_code)
            return jsonify(ok({'rack': rack}))
    except Exception as exc:
        return jsonify(fail('failed to update rack', {'error': str(exc)})), 500


@rack_detail_api_bp.route('/api/racks/<rack_code>/work-history', methods=['GET'])
def list_work_history(rack_code: str):
    page = request.args.get('page')
    page_size = request.args.get('page_size')
    p, ps, offset = paginate(page, page_size)

    try:
        with sqlite_tx() as conn:
            ensure_rack_tables(conn)
            rack, resolved_code = _resolve_rack(conn, rack_code)
            if not rack:
                return jsonify(fail('not found')), 404

            total = conn.execute(
                f"SELECT COUNT(*) AS c FROM {RACK_WORK_HISTORY_TABLE} WHERE rack_code = ? AND is_deleted = 0",
                (resolved_code,),
            ).fetchone()['c']

            rows = conn.execute(
                f"""
                SELECT *
                FROM {RACK_WORK_HISTORY_TABLE}
                WHERE rack_code = ? AND is_deleted = 0
                ORDER BY work_date DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                (resolved_code, ps, offset),
            ).fetchall()

            return jsonify(ok({'items': [dict(r) for r in rows], 'page': p, 'page_size': ps, 'total': total}))
    except Exception as exc:
        return jsonify(fail('failed to load work history', {'error': str(exc)})), 500


@rack_detail_api_bp.route('/api/racks/<rack_code>/work-history', methods=['POST'])
def create_work_history(rack_code: str):
    payload = request.get_json(silent=True) or {}
    work_date = (payload.get('work_date') or '').strip()
    title = (payload.get('title') or '').strip()
    content = payload.get('content')

    if not work_date or not title:
        return jsonify(fail('work_date and title are required')), 400

    actor = _resolve_actor()

    try:
        with sqlite_tx() as conn:
            ensure_rack_tables(conn)
            rack, resolved_code = _resolve_rack(conn, rack_code)
            if not rack:
                return jsonify(fail('not found')), 404

            cur = conn.execute(
                f"""
                INSERT INTO {RACK_WORK_HISTORY_TABLE} (
                    rack_code, work_date, title, content, created_at, created_by, updated_at, updated_by, is_deleted
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, ?, 0)
                """,
                (resolved_code, work_date, title, content, actor, actor),
            )
            item_id = cur.lastrowid
            row = conn.execute(
                f"SELECT * FROM {RACK_WORK_HISTORY_TABLE} WHERE id = ?",
                (item_id,),
            ).fetchone()
            return jsonify(ok({'item': dict(row)})), 201
    except Exception as exc:
        return jsonify(fail('failed to create work history', {'error': str(exc)})), 500


@rack_detail_api_bp.route('/api/racks/<rack_code>/work-history/<int:item_id>', methods=['PUT'])
def update_work_history(rack_code: str, item_id: int):
    payload = request.get_json(silent=True) or {}
    updates = {}
    for key in ('work_date', 'title', 'content'):
        if key in payload:
            updates[key] = payload.get(key)

    if not updates:
        return jsonify(fail('no fields to update')), 400

    actor = _resolve_actor()

    try:
        with sqlite_tx() as conn:
            ensure_rack_tables(conn)
            _rack, resolved_code = _resolve_rack(conn, rack_code)
            if not resolved_code:
                return jsonify(fail('not found')), 404
            existing = conn.execute(
                f"""
                SELECT *
                FROM {RACK_WORK_HISTORY_TABLE}
                WHERE id = ? AND rack_code = ? AND is_deleted = 0
                """,
                (item_id, resolved_code),
            ).fetchone()
            if not existing:
                return jsonify(fail('not found')), 404

            set_parts = []
            params = []
            for key, value in updates.items():
                set_parts.append(f"{key} = ?")
                params.append(value)
            set_parts.append('updated_at = CURRENT_TIMESTAMP')
            set_parts.append('updated_by = ?')
            params.append(actor)
            params.extend([item_id, resolved_code])

            conn.execute(
                f"UPDATE {RACK_WORK_HISTORY_TABLE} SET {', '.join(set_parts)} WHERE id = ? AND rack_code = ?",
                tuple(params),
            )
            row = conn.execute(
                f"SELECT * FROM {RACK_WORK_HISTORY_TABLE} WHERE id = ?",
                (item_id,),
            ).fetchone()
            return jsonify(ok({'item': dict(row)}))
    except Exception as exc:
        return jsonify(fail('failed to update work history', {'error': str(exc)})), 500


@rack_detail_api_bp.route('/api/racks/<rack_code>/work-history/<int:item_id>', methods=['DELETE'])
def delete_work_history(rack_code: str, item_id: int):
    actor = _resolve_actor()
    try:
        with sqlite_tx() as conn:
            ensure_rack_tables(conn)
            _rack, resolved_code = _resolve_rack(conn, rack_code)
            if not resolved_code:
                return jsonify(fail('not found')), 404
            existing = conn.execute(
                f"SELECT 1 FROM {RACK_WORK_HISTORY_TABLE} WHERE id = ? AND rack_code = ? AND is_deleted = 0",
                (item_id, resolved_code),
            ).fetchone()
            if not existing:
                return jsonify(fail('not found')), 404

            conn.execute(
                f"""
                UPDATE {RACK_WORK_HISTORY_TABLE}
                SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP, updated_by = ?
                WHERE id = ? AND rack_code = ?
                """,
                (actor, item_id, resolved_code),
            )
            return jsonify(ok({'deleted': True}))
    except Exception as exc:
        return jsonify(fail('failed to delete work history', {'error': str(exc)})), 500


@rack_detail_api_bp.route('/api/racks/<rack_code>/change-history', methods=['GET'])
def list_change_history(rack_code: str):
    page = request.args.get('page')
    page_size = request.args.get('page_size')
    p, ps, offset = paginate(page, page_size)

    try:
        with sqlite_tx() as conn:
            ensure_rack_tables(conn)
            rack, resolved_code = _resolve_rack(conn, rack_code)
            if not rack:
                return jsonify(fail('not found')), 404

            total = conn.execute(
                f"SELECT COUNT(*) AS c FROM {RACK_CHANGE_HISTORY_TABLE} WHERE rack_code = ? AND is_deleted = 0",
                (resolved_code,),
            ).fetchone()['c']

            rows = conn.execute(
                f"""
                SELECT *
                FROM {RACK_CHANGE_HISTORY_TABLE}
                WHERE rack_code = ? AND is_deleted = 0
                ORDER BY changed_at DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                (resolved_code, ps, offset),
            ).fetchall()

            return jsonify(ok({'items': [dict(r) for r in rows], 'page': p, 'page_size': ps, 'total': total}))
    except Exception as exc:
        return jsonify(fail('failed to load change history', {'error': str(exc)})), 500


@rack_detail_api_bp.route('/api/racks/<rack_code>/change-history', methods=['POST'])
def create_change_history(rack_code: str):
    payload = request.get_json(silent=True) or {}
    changed_at = (payload.get('changed_at') or '').strip()
    field_name = (payload.get('field_name') or '').strip()
    before_value = payload.get('before_value')
    after_value = payload.get('after_value')
    note = payload.get('note')

    if not changed_at or not field_name:
        return jsonify(fail('changed_at and field_name are required')), 400

    actor = _resolve_actor()

    try:
        with sqlite_tx() as conn:
            ensure_rack_tables(conn)
            rack, resolved_code = _resolve_rack(conn, rack_code)
            if not rack:
                return jsonify(fail('not found')), 404

            cur = conn.execute(
                f"""
                INSERT INTO {RACK_CHANGE_HISTORY_TABLE} (
                    rack_code, changed_at, field_name, before_value, after_value, note,
                    created_at, created_by, updated_at, updated_by, is_deleted
                ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, ?, 0)
                """,
                (resolved_code, changed_at, field_name, before_value, after_value, note, actor, actor),
            )
            item_id = cur.lastrowid
            row = conn.execute(
                f"SELECT * FROM {RACK_CHANGE_HISTORY_TABLE} WHERE id = ?",
                (item_id,),
            ).fetchone()
            return jsonify(ok({'item': dict(row)})), 201
    except Exception as exc:
        return jsonify(fail('failed to create change history', {'error': str(exc)})), 500


@rack_detail_api_bp.route('/api/racks/<rack_code>/change-history/<int:item_id>', methods=['PUT'])
def update_change_history(rack_code: str, item_id: int):
    payload = request.get_json(silent=True) or {}
    updates = {}
    for key in ('changed_at', 'field_name', 'before_value', 'after_value', 'note'):
        if key in payload:
            updates[key] = payload.get(key)

    if not updates:
        return jsonify(fail('no fields to update')), 400

    actor = _resolve_actor()

    try:
        with sqlite_tx() as conn:
            ensure_rack_tables(conn)
            _rack, resolved_code = _resolve_rack(conn, rack_code)
            if not resolved_code:
                return jsonify(fail('not found')), 404
            existing = conn.execute(
                f"""
                SELECT 1
                FROM {RACK_CHANGE_HISTORY_TABLE}
                WHERE id = ? AND rack_code = ? AND is_deleted = 0
                """,
                (item_id, resolved_code),
            ).fetchone()
            if not existing:
                return jsonify(fail('not found')), 404

            set_parts = []
            params = []
            for key, value in updates.items():
                set_parts.append(f"{key} = ?")
                params.append(value)
            set_parts.append('updated_at = CURRENT_TIMESTAMP')
            set_parts.append('updated_by = ?')
            params.append(actor)
            params.extend([item_id, resolved_code])

            conn.execute(
                f"UPDATE {RACK_CHANGE_HISTORY_TABLE} SET {', '.join(set_parts)} WHERE id = ? AND rack_code = ?",
                tuple(params),
            )
            row = conn.execute(
                f"SELECT * FROM {RACK_CHANGE_HISTORY_TABLE} WHERE id = ?",
                (item_id,),
            ).fetchone()
            return jsonify(ok({'item': dict(row)}))
    except Exception as exc:
        return jsonify(fail('failed to update change history', {'error': str(exc)})), 500


@rack_detail_api_bp.route('/api/racks/<rack_code>/change-history/<int:item_id>', methods=['DELETE'])
def delete_change_history(rack_code: str, item_id: int):
    actor = _resolve_actor()
    try:
        with sqlite_tx() as conn:
            ensure_rack_tables(conn)
            _rack, resolved_code = _resolve_rack(conn, rack_code)
            if not resolved_code:
                return jsonify(fail('not found')), 404
            existing = conn.execute(
                f"SELECT 1 FROM {RACK_CHANGE_HISTORY_TABLE} WHERE id = ? AND rack_code = ? AND is_deleted = 0",
                (item_id, resolved_code),
            ).fetchone()
            if not existing:
                return jsonify(fail('not found')), 404

            conn.execute(
                f"""
                UPDATE {RACK_CHANGE_HISTORY_TABLE}
                SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP, updated_by = ?
                WHERE id = ? AND rack_code = ?
                """,
                (actor, item_id, resolved_code),
            )
            return jsonify(ok({'deleted': True}))
    except Exception as exc:
        return jsonify(fail('failed to delete change history', {'error': str(exc)})), 500


@rack_detail_api_bp.route('/api/racks/<rack_code>/files', methods=['GET'])
def list_rack_files(rack_code: str):
    try:
        with sqlite_tx() as conn:
            ensure_rack_tables(conn)
            rack, resolved_code = _resolve_rack(conn, rack_code)
            if not rack:
                return jsonify(fail('not found')), 404

            rows = conn.execute(
                f"""
                SELECT *
                FROM {RACK_FILE_TABLE}
                WHERE rack_code = ? AND is_deleted = 0
                ORDER BY id DESC
                """,
                (resolved_code,),
            ).fetchall()

            items = []
            for r in rows:
                item = dict(r)
                item['download_url'] = f"/api/racks/{resolved_code}/files/{item['id']}/download"
                items.append(item)

            return jsonify(ok({'items': items}))
    except Exception as exc:
        return jsonify(fail('failed to load rack files', {'error': str(exc)})), 500


@rack_detail_api_bp.route('/api/racks/<rack_code>/files/upload', methods=['POST'])
def upload_rack_file(rack_code: str):
    if 'file' not in request.files:
        return jsonify(fail('no file field')), 400

    uploaded = request.files['file']
    if not uploaded or not uploaded.filename:
        return jsonify(fail('empty filename')), 400

    role = normalize_role(request.form.get('file_role') or request.form.get('role'))
    if not role:
        return jsonify(fail('file_role must be one of FRONT/REAR/DIAGRAM/ATTACHMENT')), 400

    actor = _resolve_actor()

    try:
        with sqlite_tx() as conn:
            ensure_rack_tables(conn)
            rack, resolved_code = _resolve_rack(conn, rack_code)
            if not rack:
                return jsonify(fail('not found')), 404

            base_dir = uploads_base_dir()
            rack_dir = os.path.join(base_dir, resolved_code)
            os.makedirs(rack_dir, exist_ok=True)

            stored_filename = make_storage_name(uploaded.filename)
            abs_path = os.path.join(rack_dir, stored_filename)
            rel_path = os.path.relpath(abs_path, os.path.join(base_dir, os.pardir))
            rel_path = rel_path.replace('\\', '/')

            # For FRONT/REAR/DIAGRAM: transactional replacement (soft delete old entries)
            if role in {'FRONT', 'REAR', 'DIAGRAM'}:
                conn.execute(
                    f"""
                    UPDATE {RACK_FILE_TABLE}
                    SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP, updated_by = ?
                    WHERE rack_code = ? AND file_role = ? AND is_deleted = 0
                    """,
                    (actor, resolved_code, role),
                )

            uploaded.save(abs_path)
            size_bytes = 0
            try:
                size_bytes = os.path.getsize(abs_path)
            except OSError:
                size_bytes = 0

            cur = conn.execute(
                f"""
                INSERT INTO {RACK_FILE_TABLE} (
                    rack_code, file_role, original_filename, stored_filename, stored_relpath,
                    content_type, size_bytes, created_at, created_by, updated_at, updated_by, is_deleted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, ?, 0)
                """,
                (
                    resolved_code,
                    role,
                    uploaded.filename,
                    stored_filename,
                    rel_path,
                    getattr(uploaded, 'mimetype', None),
                    size_bytes,
                    actor,
                    actor,
                ),
            )

            file_id = cur.lastrowid
            row = conn.execute(f"SELECT * FROM {RACK_FILE_TABLE} WHERE id = ?", (file_id,)).fetchone()
            item = dict(row)
            item['download_url'] = f"/api/racks/{resolved_code}/files/{file_id}/download"
            return jsonify(ok({'item': item})), 201
    except Exception as exc:
        return jsonify(fail('failed to upload file', {'error': str(exc)})), 500


@rack_detail_api_bp.route('/api/racks/<rack_code>/files/<int:file_id>', methods=['DELETE'])
def delete_rack_file(rack_code: str, file_id: int):
    actor = _resolve_actor()
    try:
        with sqlite_tx() as conn:
            ensure_rack_tables(conn)
            _rack, resolved_code = _resolve_rack(conn, rack_code)
            if not resolved_code:
                return jsonify(fail('not found')), 404
            row = conn.execute(
                f"""
                SELECT *
                FROM {RACK_FILE_TABLE}
                WHERE id = ? AND rack_code = ? AND is_deleted = 0
                """,
                (file_id, resolved_code),
            ).fetchone()
            if not row:
                return jsonify(fail('not found')), 404

            conn.execute(
                f"""
                UPDATE {RACK_FILE_TABLE}
                SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP, updated_by = ?
                WHERE id = ? AND rack_code = ?
                """,
                (actor, file_id, resolved_code),
            )

            # Best-effort physical delete.
            try:
                base_dir = uploads_base_dir()
                abs_path = os.path.join(os.path.dirname(base_dir), row['stored_relpath'].replace('/', os.sep))
                if os.path.exists(abs_path):
                    os.remove(abs_path)
            except Exception:
                pass

            return jsonify(ok({'deleted': True}))
    except Exception as exc:
        return jsonify(fail('failed to delete file', {'error': str(exc)})), 500


@rack_detail_api_bp.route('/api/racks/<rack_code>/files/<int:file_id>/download', methods=['GET'])
def download_rack_file(rack_code: str, file_id: int):
    try:
        with sqlite_tx() as conn:
            ensure_rack_tables(conn)
            _rack, resolved_code = _resolve_rack(conn, rack_code)
            if not resolved_code:
                return jsonify(fail('not found')), 404
            row = conn.execute(
                f"""
                SELECT *
                FROM {RACK_FILE_TABLE}
                WHERE id = ? AND rack_code = ? AND is_deleted = 0
                """,
                (file_id, resolved_code),
            ).fetchone()
            if not row:
                return jsonify(fail('not found')), 404

            base_dir = uploads_base_dir()
            abs_path = os.path.join(os.path.dirname(base_dir), row['stored_relpath'].replace('/', os.sep))
            directory = os.path.dirname(abs_path)
            filename = os.path.basename(abs_path)

            if not os.path.exists(abs_path):
                return jsonify(fail('file missing')), 404

            return send_from_directory(directory, filename, as_attachment=True, download_name=row['original_filename'])
    except Exception as exc:
        return jsonify(fail('failed to download file', {'error': str(exc)})), 500
