# -*- coding: utf-8 -*-
"""배포: Unified 첨부파일 관리 API + 로그인 배경 이미지 + 파일관리 설정 페이지"""
import os
import posixpath
import paramiko
import time

HOST = '192.168.56.108'
USER = 'root'
PASS = '123456'
REMOTE = '/opt/blossom/web'
LOCAL = os.path.dirname(os.path.abspath(__file__))

# 배포할 파일 목록 (로컬 상대경로, 리모트 상대경로)
FILES = [
    # 1. Python 백엔드
    ('app/routes/api.py', 'app/routes/api.py'),
    ('app/routes/auth.py', 'app/routes/auth.py'),
    ('app/services/file_storage_service.py', 'app/services/file_storage_service.py'),
    ('config.py', 'config.py'),
    
    # 2. 템플릿 - 브랜드관리 (로그인 배경 이미지)
    ('app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html', 
     'app/templates/authentication/11-3.admin/11-3-3.setting/10.brand.html'),
    ('app/templates/authentication/11-2.basic/sign-in.html', 'app/templates/authentication/11-2.basic/sign-in.html'),
    ('app/templates/authentication/11-2.basic/terms.html', 'app/templates/authentication/11-2.basic/terms.html'),
    
    # 3. 템플릿 - 파일관리 설정 페이지
    ('app/templates/authentication/11-3.admin/11-3-3.setting/11.file_management.html',
     'app/templates/authentication/11-3.admin/11-3-3.setting/11.file_management.html'),
    
    # 4. 어드민 메뉴 탭 업데이트 (파일관리 링크 추가)
    ('app/templates/authentication/11-3.admin/11-3-3.setting/1.setting.html',
     'app/templates/authentication/11-3.admin/11-3-3.setting/1.setting.html'),
    ('app/templates/authentication/11-3.admin/11-3-3.setting/2.mail.html',
     'app/templates/authentication/11-3.admin/11-3-3.setting/2.mail.html'),
    ('app/templates/authentication/11-3.admin/11-3-3.setting/3.security.html',
     'app/templates/authentication/11-3.admin/11-3-3.setting/3.security.html'),
    ('app/templates/authentication/11-3.admin/11-3-3.setting/4.quality_type.html',
     'app/templates/authentication/11-3.admin/11-3-3.setting/4.quality_type.html'),
    ('app/templates/authentication/11-3.admin/11-3-3.setting/5.change_log.html',
     'app/templates/authentication/11-3.admin/11-3-3.setting/5.change_log.html'),
    ('app/templates/authentication/11-3.admin/11-3-3.setting/6.info_message.html',
     'app/templates/authentication/11-3.admin/11-3-3.setting/6.info_message.html'),
    ('app/templates/authentication/11-3.admin/11-3-3.setting/7.version.html',
     'app/templates/authentication/11-3.admin/11-3-3.setting/7.version.html'),
    ('app/templates/authentication/11-3.admin/11-3-3.setting/8.sessions.html',
     'app/templates/authentication/11-3.admin/11-3-3.setting/8.sessions.html'),
    ('app/templates/authentication/11-3.admin/11-3-3.setting/9.page_tab.html',
     'app/templates/authentication/11-3.admin/11-3-3.setting/9.page_tab.html'),
    
    # 5. 정적 파일 - JavaScript
    ('static/js/blossom.js', 'static/js/blossom.js'),
    ('static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js',
     'static/js/authentication/11-3.admin/11-3-3.setting/10.brand.js'),
    ('static/js/authentication/11-3.admin/11-3-3.setting/11.file_management.js',
     'static/js/authentication/11-3.admin/11-3-3.setting/11.file_management.js'),
    
    # 6. 정적 파일 - CSS
    ('static/css/brand_admin.css', 'static/css/brand_admin.css'),
    ('static/css/file_management_settings.css', 'static/css/file_management_settings.css'),
    
    # 7. Tab15 파일 관리 템플릿
    ('app/templates/layouts/tab15-file-shared.html', 'app/templates/layouts/tab15-file-shared.html'),
    
    # 8. 하드웨어/거버넌스 상세 페이지 (Tab15 API 버전 업데이트)
    ('app/templates/4.governance/4-3.network_policy/4-3-1.ip/2.ip_detail.html',
     'app/templates/4.governance/4-3.network_policy/4-3-1.ip/2.ip_detail.html'),
    ('app/templates/4.governance/4-3.network_policy/4-3-2.dns/2.dns_detail.html',
     'app/templates/4.governance/4-3.network_policy/4-3-2.dns/2.dns_detail.html'),
    ('app/templates/4.governance/4-3.network_policy/4-3-3.ad/2.ad_detail.html',
     'app/templates/4.governance/4-3.network_policy/4-3-3.ad/2.ad_detail.html'),
    ('app/templates/4.governance/4-4.vpn_policy/4-4-1.vpn/2.vpn_detail.html',
     'app/templates/4.governance/4-4.vpn_policy/4-4-1.vpn/2.vpn_detail.html'),
    
    # 9. JS 파일들 (Tab15 API 버전 업데이트)
    ('static/js/4.governance/4-3.network_policy/4-3-1.ip/2.ip_detail.js',
     'static/js/4.governance/4-3.network_policy/4-3-1.ip/2.ip_detail.js'),
    ('static/js/4.governance/4-3.network_policy/4-3-2.dns/2.dns_detail.js',
     'static/js/4.governance/4-3.network_policy/4-3-2.dns/2.dns_detail.js'),
    ('static/js/4.governance/4-3.network_policy/4-3-3.ad/2.ad_detail.js',
     'static/js/4.governance/4-3.network_policy/4-3-3.ad/2.ad_detail.js'),
    ('static/js/4.governance/4-4.vpn_policy/4-4-1.vpn/2.vpn_detail.js',
     'static/js/4.governance/4-4.vpn_policy/4-4-1.vpn/2.vpn_detail.js'),
    
    # 10. Insight 목록 페이지
    ('app/templates/5.insight/5-1.insight/5-1-1.trend/1.trend_list.html',
     'app/templates/5.insight/5-1.insight/5-1-1.trend/1.trend_list.html'),
    ('app/templates/5.insight/5-1.insight/5-1-2.security/1.security_list.html',
     'app/templates/5.insight/5-1.insight/5-1-2.security/1.security_list.html'),
    ('app/templates/5.insight/5-1.insight/5-1-3.report/1.report_list.html',
     'app/templates/5.insight/5-1.insight/5-1-3.report/1.report_list.html'),
    ('app/templates/5.insight/5-1.insight/5-1-4.technical/1.technical_list.html',
     'app/templates/5.insight/5-1.insight/5-1-4.technical/1.technical_list.html'),
    
    # 11. Insight JS (showToast 제거)
    ('static/js/5.insight/5-1.insight/insight_list_common.js',
     'static/js/5.insight/5-1.insight/insight_list_common.js'),
]

def _ensure_remote_dir(sftp, remote_file_path):
    """원격 디렉터리 생성"""
    remote_dir = posixpath.dirname(remote_file_path)
    parts = [p for p in remote_dir.split("/") if p]
    current = "/"
    for part in parts:
        current = posixpath.join(current, part)
        try:
            sftp.stat(current)
        except:
            sftp.mkdir(current)

def deploy_files(ssh):
    """파일 업로드"""
    sftp = ssh.open_sftp()
    try:
        for i, (local_rel, remote_rel) in enumerate(FILES, 1):
            local_abs = os.path.join(LOCAL, local_rel)
            remote_abs = posixpath.join(REMOTE, remote_rel)
            if not os.path.isfile(local_abs):
                print(f"[{i}/{len(FILES)}] ✗ 누락: {local_rel}")
                continue
            _ensure_remote_dir(sftp, remote_abs)
            sftp.put(local_abs, remote_abs)
            print(f"[{i}/{len(FILES)}] ✓ {local_rel}")
    finally:
        sftp.close()

def run_cmd(ssh, cmd):
    """원격 명령 실행"""
    _, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    rc = stdout.channel.recv_exit_status()
    return out, err, rc

def main():
    print("=" * 60)
    print("원격 배포: Unified 파일 관리 API + 파일관리 설정 페이지")
    print("=" * 60)
    print(f"서버: {HOST}")
    print(f"배포할 파일: {len(FILES)}개")
    print()
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        print("[1/4] SSH 연결 중...")
        ssh.connect(HOST, username=USER, password=PASS, timeout=10)
        print("✓ SSH 연결 성공\n")
        
        print("[2/4] 파일 업로드 중...")
        deploy_files(ssh)
        print("✓ 파일 업로드 완료\n")
        
        print("[3/4] 데이터베이스 마이그레이션 중...")
        # Flask DB 마이그레이션
        _, out, _ = run_cmd(ssh, f"cd {REMOTE} && flask db upgrade 2>&1")
        if 'ERROR' not in out and 'error' not in out.lower():
            print("✓ DB 마이그레이션 완료")
        else:
            print(f"⚠ DB 마이그레이션 출력:\n{out}")
        print()
        
        print("[4/4] blossom-web 서비스 재시작 중...")
        run_cmd(ssh, "systemctl restart blossom-web")
        time.sleep(2)
        out, err, rc = run_cmd(ssh, "systemctl is-active blossom-web")
        status = out.strip()
        
        if rc == 0 and status == "active":
            print(f"✓ blossom-web 상태: {status}")
        else:
            print(f"⚠ 서비스 상태: {status}")
            if err:
                print(f"오류: {err}")
        print()
        
        print("=" * 60)
        print("✓ 배포 완료!")
        print("=" * 60)
        print("\n확인 사항:")
        print("  1. /admin/auth/file-management 페이지 접근")
        print("  2. 브랜드관리 > 로그인 배경 이미지 저장")
        print("  3. /api/files 엔드포인트 테스트")
        
    except Exception as e:
        print(f"✗ 배포 실패: {e}")
        return 1
    finally:
        ssh.close()
    
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
