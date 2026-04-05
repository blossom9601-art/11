"""Test TPMC calculation after fix — cmp_cpu_type in separate DB."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('FLASK_APP', 'run.py')

from app import create_app
app = create_app('testing')

# 1) Seed a test CPU type in the catalog DB (direct sqlite3)
import sqlite3
cpu_db_path = os.path.join(app.instance_path, 'cmp_cpu_type.db')
cdb = sqlite3.connect(cpu_db_path)
cdb.row_factory = sqlite3.Row
existing = cdb.execute(
    "SELECT id FROM cmp_cpu_type WHERE LOWER(model_name) = 'test-cpu'"
).fetchone()
if not existing:
    cdb.execute(
        "INSERT INTO cmp_cpu_type (cpu_code, model_name, spec_summary, reference_core_count, "
        "reference_tpmc, manufacturer_code, is_deleted, created_at, created_by, updated_at, updated_by) "
        "VALUES ('CPU-TEST-001', 'TEST-CPU', '11 Core', 11, 85000, 'TEST', 0, "
        "datetime('now'), 'system', datetime('now'), 'system')"
    )
    cdb.commit()
    print("[SEED] Inserted TEST-CPU -> reference_core_count=11, reference_tpmc=85000")
else:
    print("[SEED] TEST-CPU already exists")
cdb.close()
# 2) Now test the TPMC calculation
with app.app_context():
    from app.services.tpmc_service import calculate_tpmc
    result = calculate_tpmc(27)  # HARDWARE-SERVER
    print(f"\nhardware_id=27")
    print(f"  calculable: {result['calculable']}")
    print(f"  error: {result['error']}")
    print(f"  role_factor: {result['role_factor']}")
    print(f"  virt_factor: {result['virtualization_factor']}")
    print(f"  safety_factor: {result['safety_factor']}")
    print(f"  tpmc_total: {result['tpmc_total']}")
    print(f"  tpmc_managed: {result['tpmc_managed']}")
    if result['cpu_components']:
        for c in result['cpu_components']:
            print(f"  CPU: model={c['model']} qty={c['qty']} "
                  f"ref_tpmc={c['reference_tpmc']} per_core={c['per_core_tpmc']} "
                  f"comp_tpmc={c['component_tpmc']} err={c.get('error')}")
