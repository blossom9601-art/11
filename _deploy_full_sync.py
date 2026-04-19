"""로컬과 원격 크기 차이 나는 61개 파일 전부 배포"""
import paramiko, os

LOCAL_BASE = r'C:\Users\ME\Desktop\blossom'
REMOTE_BASE = '/opt/blossom/web'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')
sftp = ssh.open_sftp()

# 크기 차이 나는 모든 파일 (전체 diff 결과)
diff_files = [
    'static/js/9.category/9-3.software/9-3-4.virtualization/1.virtualization_list.js',
    'static/js/2.hardware/2-4.network/2-4-4.ap/1.ap_list.js',
    'static/js/2.hardware/2-5.security/2-5-6.kms/1.kms_list.js',
    'static/js/2.hardware/2-2.storage/2-2-1.san/1.san_list.js',
    'static/js/2.hardware/2-2.storage/2-2-1.storage/1.storage_list.js',
    'static/js/2.hardware/2-2.storage/2-2-2.backup/1.backup_list.js',
    'static/js/2.hardware/2-2.storage/2-2-4.ptl/1.ptl_list.js',
    'static/js/2.hardware/2-1.server/2-1-1.onpremise/1.onpremise_list.js',
    'static/js/2.hardware/2-4.network/2-4-5.dedicateline/1.dedicateline_list.js',
    'static/js/2.hardware/2-3.san/2-3-1.director/1.director_list.js',
    'static/js/2.hardware/2-1.server/2-1-4.workstation/1.workstation_list.js',
    'static/js/2.hardware/2-5.security/2-5-4.ips/1.ips_list.js',
    'static/js/2.hardware/2-3.san/2-3-2.sansw/1.sansw_list.js',
    'static/js/2.hardware/2-5.security/2-5-2.vpn/1.vpn_list.js',
    'static/js/2.hardware/2-4.network/2-4-1.l2/1.l2_list.js',
    'static/js/2.hardware/2-5.security/2-5-1.firewall/1.firewall_list.js',
    'static/js/2.hardware/2-5.security/2-5-8.etc/1.etc_list.js',
    'static/js/2.hardware/2-4.network/2-4-3.l7/1.l7_list.js',
    'static/js/2.hardware/2-5.security/2-5-7.wips/1.wips_list.js',
    'static/js/2.hardware/2-4.network/2-4-2.l4/1.l4_list.js',
    'static/js/2.hardware/2-5.security/2-5-5.hsm/1.hsm_list.js',
    'static/js/2.hardware/2-5.security/2-5-3.ids/1.ids_list.js',
    'static/js/2.hardware/2-1.server/2-1-3.frame/1.frame_list.js',
    'static/js/2.hardware/2-1.server/2-1-2.cloud/1.cloud_list.js',
    'static/js/2.hardware/2-1.server/2-1-1.onpremise/2.onpremise_detail.js',
    'static/js/4.governance/4-2.backup_policy/4-2-2.backup_tape/1.backup_tape_list.js',
    'static/js/2.hardware/2-4.network/2-4-4.ap/2.ap_detail.js',
    'static/js/4.governance/4-3.network_policy/4-3-1.ip/1.ip_list.js',
    'static/js/4.governance/4-2.backup_policy/4-2-1.backup_policy/1.backup_policy_list.js',
    'static/js/4.governance/4-5.dedicatedline_policy/4-5-1.member/1.member_list.js',
    'static/js/4.governance/4-4.vpn_policy/4-4-1.vpn/1.vpn_list.js',
    'static/js/4.governance/4-1.dr_policy/4-1-1.training/1.training_list.js',
    'static/js/4.governance/4-6.unused_assets/1.unused_assets.js',
    'static/js/4.governance/4-6.unused_assets/4-6-1.hardware/1.unused_hardware_list.js',
    'static/js/4.governance/4-6.unused_assets/4-6-1.server/1.unused_server_list.js',
    'static/js/4.governance/4-6.unused_assets/4-6-3.storage/1.unused_storage_list.js',
    'static/js/4.governance/4-6.unused_assets/4-6-4.san/1.unused_san_list.js',
    'static/js/4.governance/4-6.unused_assets/4-6-5.network/1.unused_network_list.js',
    'static/js/4.governance/4-6.unused_assets/4-6-6.security/1.unused_security_list.js',
    'static/js/4.governance/4-3.network_policy/4-3-2.dns/1.dns_list.js',
    'static/js/4.governance/4-3.network_policy/4-3-3.ad/1.ad_list.js',
    'static/js/4.governance/4-3.network_policy/4-3-2.dns/2.dns_detail_v2.js',
    'static/js/4.governance/4-6.unused_assets/4-6-2.software/1.unused_software_list.js',
    'static/js/2.hardware/2-4.network/2-4-4.ap/2.ap_detail_clean.js',
    'static/js/9.category/9-7.vendor/9-7-1.manufacturer/1.manufacturer_list.js',
    'static/js/5.insight/5-1.insight/5-1-1.trend/1.trend_list.js',
    'static/js/5.insight/5-1.insight/5-1-2.security/1.security_list.js',
    'static/js/5.insight/5-1.insight/5-1-3.report/1.report_list.js',
    'static/js/5.insight/5-1.insight/5-1-4.technical/1.technical_list.js',
    'config.py',
    'static/js/9.category/9-2.hardware/0.hw_category_dashboard.js',
    'app/services/server_component_service.py',
    'static/js/2.hardware/2-4.network/2-4-2.l4/2.l4_detail.js',
    'static/js/2.hardware/2-4.network/2-4-3.l7/2.l7_detail.js',
    'static/js/2.hardware/2-4.network/2-4-5.dedicateline/2.dedicateline_detail.js',
    'static/js/2.hardware/2-5.security/2-5-2.vpn/2.vpn_detail.js',
    'static/js/2.hardware/2-5.security/2-5-1.firewall/2.firewall_detail.js',
    'static/js/2.hardware/2-5.security/2-5-4.ips/2.ips_detail.js',
    'static/js/2.hardware/2-5.security/2-5-7.wips/2.wips_detail.js',
    'app/services/dashboard_service.py',
    'static/js/9.category/9-3.software/9-3-3.middleware/1.middleware_list.js',
]

ok = 0
fail = 0
for f in diff_files:
    local = os.path.join(LOCAL_BASE, f.replace('/', os.sep))
    remote = f'{REMOTE_BASE}/{f}'
    
    if not os.path.exists(local):
        print(f'[MISS] {f}')
        fail += 1
        continue
    
    sftp.put(local, remote)
    
    local_size = os.path.getsize(local)
    remote_stat = sftp.stat(remote)
    match = local_size == remote_stat.st_size
    status = 'OK' if match else 'FAIL'
    if match:
        ok += 1
    else:
        fail += 1
    print(f'[{status}] {f}')

sftp.close()

print(f'\n배포 결과: {ok}개 성공, {fail}개 실패')

# blossom-web 재시작
print('\n서비스 재시작...')
_, o, e = ssh.exec_command('systemctl restart blossom-web.service')
e.read()

import time
time.sleep(3)

_, o, _ = ssh.exec_command('systemctl is-active blossom-web.service')
status = o.read().decode().strip()
print(f'blossom-web: {status}')

# 재확인 - 차이 나는 파일 있는지
print('\n재검증 중...')
still_diff = 0
for f in diff_files:
    local = os.path.join(LOCAL_BASE, f.replace('/', os.sep))
    remote = f'{REMOTE_BASE}/{f}'
    if not os.path.exists(local):
        continue
    local_size = os.path.getsize(local)
    try:
        remote_stat = sftp.stat(remote)
    except:
        # sftp closed, reopen
        break
    remote_size = remote_stat.st_size
    if local_size != remote_size:
        print(f'  [STILL DIFF] {f}: {local_size} vs {remote_size}')
        still_diff += 1

if still_diff == 0:
    print('  모든 파일 일치 확인!')

ssh.close()
print('\n전체 배포 완료.')
