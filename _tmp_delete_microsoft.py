from app import create_app
from app.services.vendor_manufacturer_service import list_vendors, soft_delete_vendors

app = create_app()
with app.app_context():
    rows = list_vendors(include_deleted=False)
    targets = [r for r in rows if (r.get('manufacturer_name') or '').strip().lower() == 'microsoft']
    print('before_active_count', len(rows))
    print('target_count', len(targets))
    print('target_ids', [r.get('id') for r in targets])
    if targets:
        deleted = soft_delete_vendors([r.get('id') for r in targets], actor='admin')
        print('deleted', deleted)
    else:
        print('deleted', 0)
    rows_after = list_vendors(include_deleted=False)
    still = [r for r in rows_after if (r.get('manufacturer_name') or '').strip().lower() == 'microsoft']
    print('after_active_count', len(rows_after))
    print('still_exists', len(still))
    print('SUCCESS' if len(still) == 0 and len(targets) > 0 else 'FAILED')
