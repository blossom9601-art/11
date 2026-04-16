"""
Check all category service files for indentation issues (tab/space mixing)
in their soft_delete functions after the bulk conversion.
"""
import re
import os

SVC_DIR = 'app/services'
patterns = [
    'hw_server_type_service.py', 'hw_storage_type_service.py', 'hw_san_type_service.py',
    'hw_network_type_service.py', 'hw_security_type_service.py',
    'sw_os_type_service.py', 'sw_db_type_service.py', 'sw_middleware_type_service.py',
    'sw_virtual_type_service.py', 'sw_security_type_service.py', 'sw_high_availability_type_service.py',
    'cmp_cpu_type_service.py', 'cmp_gpu_type_service.py', 'cmp_memory_type_service.py',
    'cmp_disk_type_service.py', 'cmp_nic_type_service.py', 'cmp_hba_type_service.py',
    'cmp_etc_type_service.py',
    'work_category_service.py', 'work_division_service.py', 'work_status_service.py',
    'work_operation_service.py', 'work_group_service.py',
    'org_company_service.py', 'org_department_service.py', 'org_center_service.py',
    'org_rack_service.py', 'org_thermometer_service.py', 'org_cctv_service.py',
    'customer_member_service.py', 'customer_associate_service.py', 'customer_client_service.py',
    'vendor_manufacturer_service.py', 'vendor_maintenance_service.py',
    'vendor_manufacturer_software_service.py', 'vendor_maintenance_software_service.py',
]

issues = []
for fname in patterns:
    fpath = os.path.join(SVC_DIR, fname)
    if not os.path.exists(fpath):
        issues.append((fname, 'FILE_NOT_FOUND', 0))
        continue
    with open(fpath, encoding='utf-8') as f:
        lines = f.readlines()

    in_soft_delete = False
    func_start = 0
    for i, line in enumerate(lines, 1):
        if re.match(r'^def soft_delete_', line):
            in_soft_delete = True
            func_start = i
            continue
        if in_soft_delete:
            if re.match(r'^def ', line) or re.match(r'^class ', line):
                in_soft_delete = False
                continue
            # Check for mixed tabs/spaces
            stripped = line.rstrip('\n\r')
            if stripped and not stripped.startswith('#'):
                leading = ''
                for ch in stripped:
                    if ch in (' ', '\t'):
                        leading += ch
                    else:
                        break
                if '\t' in leading and ' ' in leading:
                    issues.append((fname, f'MIXED_INDENT (func_start={func_start})', i))
                # Check if this file uses tabs outside but spaces inside with block
                if in_soft_delete and leading and '\t' not in leading:
                    # Check if previous lines use tabs
                    prev_tab = False
                    for j in range(max(0, i-5), i-1):
                        if lines[j].startswith('\t'):
                            prev_tab = True
                            break
                    if prev_tab:
                        issues.append((fname, f'TAB_THEN_SPACE (func_start={func_start})', i))

    # Also try to compile
    try:
        compile(open(fpath, encoding='utf-8').read(), fpath, 'exec')
    except SyntaxError as e:
        issues.append((fname, f'SYNTAX_ERROR: {e.msg}', e.lineno))

if issues:
    print(f'Found {len(issues)} issues:')
    for fname, etype, lineno in issues:
        print(f'  {fname}:{lineno} - {etype}')
else:
    print('All files OK - no indentation or syntax issues found')
