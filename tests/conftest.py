import os
import sqlite3
from datetime import datetime
from pathlib import Path

import pytest

from app import create_app
from app.models import db
from app.services.sw_os_type_service import init_sw_os_type_table
from app.services.sw_db_type_service import init_sw_db_type_table
from app.services.sw_middleware_type_service import init_sw_middleware_type_table
from app.services.sw_virtual_type_service import init_sw_virtual_type_table
from app.services.sw_security_type_service import init_sw_security_type_table
from app.services.sw_high_availability_type_service import init_sw_ha_type_table
from app.services.cmp_cpu_type_service import init_cmp_cpu_type_table
from app.services.cmp_gpu_type_service import init_cmp_gpu_type_table
from app.services.cmp_memory_type_service import init_cmp_memory_type_table
from app.services.cmp_disk_type_service import init_cmp_disk_type_table
from app.services.cmp_nic_type_service import init_cmp_nic_type_table
from app.services.cmp_hba_type_service import init_cmp_hba_type_table
from app.services.cmp_etc_type_service import init_cmp_etc_type_table
from app.services.vendor_manufacturer_service import init_vendor_manufacturer_table
from app.services.org_center_service import init_org_center_table
from app.services.org_rack_service import init_org_rack_table
from app.services.system_lab1_surface_service import init_system_lab1_surface_table
from app.services.system_lab2_surface_service import init_system_lab2_surface_table
from app.services.system_lab3_surface_service import init_system_lab3_surface_table
from app.services.system_lab4_surface_service import init_system_lab4_surface_table
from app.services.software_asset_service import init_software_asset_table, INITIALIZED_DBS
from app.services.server_software_service import init_server_software_table
from app.services.network_ip_policy_service import init_network_ip_policy_table
from app.services.network_dns_policy_service import init_network_dns_policy_table
from app.services.network_dns_policy_log_service import init_network_dns_policy_log_table
from app.services.network_dns_record_service import init_network_dns_record_table
from app.services.network_dns_diagram_service import init_network_dns_diagram_table
from app.services.network_ip_diagram_service import init_network_ip_diagram_table
from app.services.network_ad_service import init_network_ad_account_tables, init_network_ad_table
from app.services.access_entry_register_service import init_access_entry_register_table
from app.services.data_delete_register_service import init_data_delete_register_table
from app.services.data_delete_system_service import init_data_delete_system_table

SCHEMA_PATH = Path(__file__).resolve().parents[1] / "scripts" / "sql" / "hardware_asset_schema.sql"


def _ensure_shared_sqlite_schema(db_path: str) -> None:
    """Apply the hardware asset schema to the shared SQLite file for FK targets."""
    if not db_path:
        return
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    with sqlite3.connect(db_path) as conn, SCHEMA_PATH.open("r", encoding="utf-8") as schema_file:
        conn.executescript(schema_file.read())
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            """
            INSERT OR IGNORE INTO biz_work_status (
                status_code, status_name, status_level, created_at, created_by, updated_at, updated_by, is_deleted
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
            """,
            ("ACTIVE", "운영", "success", timestamp, "test", timestamp, "test"),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO biz_work_group (
                group_code, group_name, created_at, created_by, updated_at, updated_by, is_deleted
            ) VALUES (?, ?, ?, ?, ?, ?, 0)
            """,
            ("OPS", "운영그룹", timestamp, "test", timestamp, "test"),
        )
        conn.commit()


@pytest.fixture
def app(tmp_path):
    """Create a new Flask application instance for each test.

    Uses a per-test SQLite file under pytest's tmp_path to avoid cross-test
    contamination on Windows when SQLite files can be locked briefly.
    """
    app = create_app('testing')
    # Ensure instance folder exists for auxiliary sqlite files
    os.makedirs(app.instance_path, exist_ok=True)

    shared_sqlite = str(tmp_path / 'test_shared.sqlite')
    INITIALIZED_DBS.discard(os.path.abspath(shared_sqlite))
    sqlite_uri = f"sqlite:///{shared_sqlite.replace(os.sep, '/')}"
    app.config.update({
        'SQLALCHEMY_DATABASE_URI': sqlite_uri,
        'SW_OS_TYPE_SQLITE_PATH': shared_sqlite,
        'SW_DB_TYPE_SQLITE_PATH': shared_sqlite,
        'SW_MIDDLEWARE_TYPE_SQLITE_PATH': shared_sqlite,
        'SW_VIRTUAL_TYPE_SQLITE_PATH': shared_sqlite,
        'SW_SECURITY_TYPE_SQLITE_PATH': shared_sqlite,
        'SW_HA_TYPE_SQLITE_PATH': shared_sqlite,
        'CMP_CPU_TYPE_SQLITE_PATH': shared_sqlite,
        'CMP_GPU_TYPE_SQLITE_PATH': shared_sqlite,
        'CMP_MEMORY_TYPE_SQLITE_PATH': shared_sqlite,
        'CMP_DISK_TYPE_SQLITE_PATH': shared_sqlite,
        'CMP_NIC_TYPE_SQLITE_PATH': shared_sqlite,
        'CMP_HBA_TYPE_SQLITE_PATH': shared_sqlite,
        'CMP_ETC_TYPE_SQLITE_PATH': shared_sqlite,
        'VENDOR_MANUFACTURER_SQLITE_PATH': shared_sqlite,
        'ORG_CENTER_SQLITE_PATH': shared_sqlite,
        'ORG_RACK_SQLITE_PATH': shared_sqlite,
        'SYSTEM_LAB1_SURFACE_SQLITE_PATH': shared_sqlite,
        'SYSTEM_LAB2_SURFACE_SQLITE_PATH': shared_sqlite,
        'SYSTEM_LAB3_SURFACE_SQLITE_PATH': shared_sqlite,
        'SYSTEM_LAB4_SURFACE_SQLITE_PATH': shared_sqlite,
        'SOFTWARE_ASSET_SQLITE_PATH': shared_sqlite,
        'SERVER_SOFTWARE_SQLITE_PATH': shared_sqlite,
        'NETWORK_IP_POLICY_SQLITE_PATH': shared_sqlite,
        'NETWORK_DNS_POLICY_SQLITE_PATH': shared_sqlite,
        'NETWORK_AD_SQLITE_PATH': shared_sqlite,
        'ACCESS_ENTRY_REGISTER_SQLITE_PATH': shared_sqlite,
        'DATA_DELETE_REGISTER_SQLITE_PATH': shared_sqlite,
        'DATA_DELETE_SYSTEM_SQLITE_PATH': shared_sqlite,
    })
    db_cleanup_targets = {
        shared_sqlite,
        os.path.join(app.instance_path, 'sw_os_type.db'),
        os.path.join(app.instance_path, 'sw_db_type.db'),
        os.path.join(app.instance_path, 'sw_middleware_type.db'),
        os.path.join(app.instance_path, 'sw_virtual_type.db'),
        os.path.join(app.instance_path, 'sw_security_type.db'),
        os.path.join(app.instance_path, 'sw_ha_type.db'),
        os.path.join(app.instance_path, 'cmp_cpu_type.db'),
        os.path.join(app.instance_path, 'cmp_gpu_type.db'),
        os.path.join(app.instance_path, 'cmp_memory_type.db'),
        os.path.join(app.instance_path, 'cmp_disk_type.db'),
        os.path.join(app.instance_path, 'cmp_nic_type.db'),
        os.path.join(app.instance_path, 'cmp_hba_type.db'),
        os.path.join(app.instance_path, 'cmp_etc_type.db'),
        os.path.join(app.instance_path, 'vendor_manufacturer.db'),
        os.path.join(app.instance_path, 'org_center.db'),
        os.path.join(app.instance_path, 'org_rack.db'),
        os.path.join(app.instance_path, 'system_lab1_surface.db'),
        os.path.join(app.instance_path, 'system_lab2_surface.db'),
        os.path.join(app.instance_path, 'system_lab3_surface.db'),
        os.path.join(app.instance_path, 'system_lab4_surface.db'),
        os.path.join(app.instance_path, 'network_dns_policy.db'),
    }
    with app.app_context():
        db.create_all()
        _ensure_shared_sqlite_schema(shared_sqlite)
        # Initialize auxiliary SQLite tables used by service layers
        init_vendor_manufacturer_table(app)
        init_sw_os_type_table(app)
        init_sw_db_type_table(app)
        init_sw_middleware_type_table(app)
        init_sw_virtual_type_table(app)
        init_sw_security_type_table(app)
        init_sw_ha_type_table(app)
        init_cmp_cpu_type_table(app)
        init_cmp_gpu_type_table(app)
        init_cmp_memory_type_table(app)
        init_cmp_disk_type_table(app)
        init_cmp_nic_type_table(app)
        init_cmp_hba_type_table(app)
        init_cmp_etc_type_table(app)
        init_org_center_table(app)
        init_org_rack_table(app)
        init_system_lab1_surface_table(app)
        init_system_lab2_surface_table(app)
        init_system_lab3_surface_table(app)
        init_system_lab4_surface_table(app)
        init_software_asset_table(app)
        init_server_software_table(app)
        init_network_dns_policy_table(app)
        init_network_dns_policy_log_table(app)
        init_network_dns_record_table(app)
        init_network_dns_diagram_table(app)
        init_network_ip_policy_table(app)
        init_network_ip_diagram_table(app)
        init_network_ad_table(app)
        init_network_ad_account_tables(app)
        init_access_entry_register_table(app)
        init_data_delete_register_table(app)
        init_data_delete_system_table(app)
        yield app
        db.session.remove()
        db.drop_all()
        try:
            db.engine.dispose()
        except Exception:
            pass
    # Clean up auxiliary sqlite files created during tests
    for path in db_cleanup_targets:
        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError:
            pass


@pytest.fixture
def client(app):
    """Return a Flask test client bound to the application fixture."""
    return app.test_client()


@pytest.fixture
def authed_client(app, actor_user_id):
    """Return a Flask test client with a logged-in session.

    Write endpoints require a session identity (emp_no/user_id). Tests that
    exercise create/update/delete flows should use this fixture.
    """
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['emp_no'] = 'ACTOR001'
        sess['user_profile_id'] = actor_user_id
    return client


@pytest.fixture
def authed_client2(app, actor_user_id2):
    """Second logged-in client for multi-user API tests."""
    client = app.test_client()
    with client.session_transaction() as sess:
        sess['emp_no'] = 'ACTOR002'
        sess['user_profile_id'] = actor_user_id2
    return client


@pytest.fixture
def actor_user_id(app):
    """Return an org_user.id for API tests that require an actor.

    Many API endpoints validate that the provided actor user exists.
    """
    from app.models import UserProfile

    with app.app_context():
        user = UserProfile.query.filter_by(emp_no='ACTOR001').first()
        if not user:
            user = UserProfile(
                emp_no='ACTOR001',
                name='Actor Tester',
                department='IT',
                email='actor001@example.com',
            )
            db.session.add(user)
            db.session.commit()
        return user.id


@pytest.fixture
def actor_user_id2(app):
    """Second org_user.id for multi-user API tests."""
    from app.models import UserProfile

    with app.app_context():
        user = UserProfile.query.filter_by(emp_no='ACTOR002').first()
        if not user:
            user = UserProfile(
                emp_no='ACTOR002',
                name='Actor Tester 2',
                department='IT',
                email='actor002@example.com',
            )
            db.session.add(user)
            db.session.commit()
        return user.id
