from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
import re
from typing import Any, Dict, Optional

from app import db
from app.models import HwStorageBasic

try:
    from sqlalchemy import inspect
except Exception:  # pragma: no cover
    inspect = None


def _now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds")


def _ensure_hw_storage_basic_table() -> None:
    """Best-effort runtime table creation.

    This project sometimes runs without Alembic migrations for newer tables.
    Creating the table on demand keeps GET/PUT endpoints functional.
    """

    if inspect is None:
        return
    try:
        insp = inspect(db.engine)
        if not insp.has_table(HwStorageBasic.__tablename__):
            HwStorageBasic.__table__.create(bind=db.engine, checkfirst=True)
    except Exception:
        # Best-effort only; caller will surface errors if DB is unusable.
        return


def get_hw_storage_basic(asset_type: str, asset_id: int) -> Optional[HwStorageBasic]:
    _ensure_hw_storage_basic_table()
    return (
        HwStorageBasic.query.filter(
            HwStorageBasic.asset_type == asset_type,
            HwStorageBasic.asset_id == asset_id,
            HwStorageBasic.is_deleted == 0,
        )
        .order_by(HwStorageBasic.id.desc())
        .first()
    )


def upsert_hw_storage_basic(asset_type: str, asset_id: int, payload: Dict[str, Any]) -> HwStorageBasic:
    _ensure_hw_storage_basic_table()
    row = get_hw_storage_basic(asset_type, asset_id)
    now = _now()

    if not row:
        row = HwStorageBasic(asset_type=asset_type, asset_id=asset_id)
        row.created_at = now
        row.is_deleted = 0
        db.session.add(row)

    def _text(key: str) -> Optional[str]:
        if key not in payload:
            return getattr(row, key)
        val = payload.get(key)
        if val is None:
            return None
        s = str(val).strip()
        return s or None

    def _int(key: str) -> Optional[int]:
        if key not in payload:
            return getattr(row, key)
        val = payload.get(key)
        if val is None or str(val).strip() == "":
            return None
        try:
            return int(val)
        except Exception:
            return None

    _CAP_RE = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)\s*([TtGg][Bb])?\s*$")

    def _gb_number_text(key: str) -> Optional[str]:
        """Store capacity-like fields as number-only GB strings.

        Accepts:
        - numeric values (int/float)
        - strings like '123', '123 GB', '1.5TB', '1,024 gb'
        """
        if key not in payload:
            return getattr(row, key)
        val = payload.get(key)
        if val is None:
            return None
        if isinstance(val, (int, float, Decimal)):
            d = Decimal(str(val))
            gb = d
        else:
            s = str(val).strip()
            if not s:
                return None
            s = s.replace(',', '')
            m = _CAP_RE.match(s)
            if not m:
                raise ValueError(f"{key}은(는) 숫자(GB)만 허용합니다.")
            try:
                d = Decimal(m.group(1))
            except InvalidOperation:
                raise ValueError(f"{key}은(는) 숫자(GB)만 허용합니다.")
            unit = (m.group(2) or 'GB').upper()
            gb = (d * Decimal(1024)) if unit == 'TB' else d

        # Normalize to max 2 decimal places, trimming trailing zeros.
        gb = gb.quantize(Decimal('0.01'))
        out = format(gb, 'f')
        if '.' in out:
            out = out.rstrip('0').rstrip('.')
        return out or None

    row.physical_total = _gb_number_text("physical_total")
    row.logical_total = _gb_number_text("logical_total")
    row.raid_level = _text("raid_level")
    row.allocated_total = _gb_number_text("allocated_total")
    row.unallocated_total = _gb_number_text("unallocated_total")
    row.cache_memory = _gb_number_text("cache_memory")
    row.volume_count = _int("volume_count")
    row.host_count = _int("host_count")

    row.updated_at = now
    db.session.flush()
    return row


def hw_storage_basic_to_dict(row: HwStorageBasic) -> Dict[str, Any]:
    return {
        "id": row.id,
        "asset_type": row.asset_type,
        "asset_id": row.asset_id,
        "physical_total": row.physical_total,
        "logical_total": row.logical_total,
        "raid_level": row.raid_level,
        "allocated_total": row.allocated_total,
        "unallocated_total": row.unallocated_total,
        "cache_memory": row.cache_memory,
        "volume_count": row.volume_count,
        "host_count": row.host_count,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }
