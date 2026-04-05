import os
import sqlite3
import sys
import tempfile
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app import create_app
from app.models import db
from app.services.vendor_manufacturer_service import init_vendor_manufacturer_table, create_vendor
from app.services.cmp_cpu_type_service import (
    init_cmp_cpu_type_table,
    create_cmp_cpu_type,
    soft_delete_cmp_cpu_types,
    list_cmp_cpu_types,
)
from app.services.cmp_disk_type_service import (
    init_cmp_disk_type_table,
    create_cmp_disk_type,
    soft_delete_cmp_disk_types,
    list_cmp_disk_types,
)

SCHEMA_PATH = Path(__file__).resolve().parents[1] / 'scripts' / 'sql' / 'hardware_asset_schema.sql'


def ensure_schema(db_path: str) -> None:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.executescript(SCHEMA_PATH.read_text(encoding='utf-8'))
        ts = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        conn.execute(
            "INSERT OR IGNORE INTO biz_work_status (status_code, status_name, status_level, created_at, created_by, updated_at, updated_by, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
            ('ACTIVE', '운영', 'success', ts, 'test', ts, 'test'),
        )
        conn.execute(
            "INSERT OR IGNORE INTO biz_work_group (group_code, group_name, created_at, created_by, updated_at, updated_by, is_deleted) VALUES (?, ?, ?, ?, ?, ?, 0)",
            ('OPS', '운영그룹', ts, 'test', ts, 'test'),
        )
        conn.commit()


def raw_dump(shared: str, table: str) -> None:
    conn = sqlite3.connect(shared)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(f"select * from {table} order by id").fetchall()
    print(f"RAW {table}: {len(rows)}")
    for r in rows:
        d = dict(r)
        # keep output small
        keep = {k: d.get(k) for k in ('id', 'is_deleted', 'model_name', 'cpu_code', 'disk_code', 'manufacturer_code', 'created_by') if k in d}
        print(' ', keep)


if __name__ == '__main__':
    tmpdir = tempfile.mkdtemp(prefix='blossom_cmp_diag_')
    shared = os.path.join(tmpdir, 'test_shared.sqlite')
    uri = f"sqlite:///{shared.replace(os.sep, '/')}"

    app = create_app('testing')
    os.makedirs(app.instance_path, exist_ok=True)
    app.config.update({
        'SQLALCHEMY_DATABASE_URI': uri,
        'CMP_CPU_TYPE_SQLITE_PATH': shared,
        'CMP_DISK_TYPE_SQLITE_PATH': shared,
        'VENDOR_MANUFACTURER_SQLITE_PATH': shared,
    })

    with app.app_context():
        db.create_all()
        ensure_schema(shared)
        init_vendor_manufacturer_table(app)
        init_cmp_cpu_type_table(app)
        init_cmp_disk_type_table(app)

        vendor = create_vendor({'manufacturer_name': 'CPU Maker'}, 'pytest', app)
        cpu = create_cmp_cpu_type({
            'model': 'Xeon Gold 6348',
            'vendor_code': vendor['manufacturer_code'],
            'spec': '28C 2.6GHz 205W',
            'part_no': 'BX80713-6348',
            'qty': 4,
            'note': 'Ice Lake-SP',
        }, 'pytest', app)
        print('CPU created:', cpu['id'], cpu['cpu_code'])
        deleted = soft_delete_cmp_cpu_types([cpu['id']], 'pytest', app)
        print('CPU deleted rowcount:', deleted)
        items = list_cmp_cpu_types(app, include_deleted=True)
        print('CPU list include_deleted:', len(items), [(i['id'], i['is_deleted']) for i in items])

        vendor2 = create_vendor({'manufacturer_name': 'Disk Maker'}, 'pytest', app)
        disk = create_cmp_disk_type({
            'model': 'PM9A3 3.84TB U.2 NVMe',
            'vendor_code': vendor2['manufacturer_code'],
            'spec': 'U.2 NVMe, PCIe 4.0 x4, 3.84TB',
            'part_no': 'MZQL23T8HCLS-00A07',
            'qty': 8,
            'note': 'Test Disk',
        }, 'pytest', app)
        print('DISK created:', disk['id'], disk['disk_code'])
        deleted2 = soft_delete_cmp_disk_types([disk['id']], 'pytest', app)
        print('DISK deleted rowcount:', deleted2)
        items2 = list_cmp_disk_types(app, include_deleted=True)
        print('DISK list include_deleted:', len(items2), [(i['id'], i['is_deleted']) for i in items2])

        raw_dump(shared, 'cmp_cpu_type')
        raw_dump(shared, 'cmp_disk_type')

    print('shared:', shared)
