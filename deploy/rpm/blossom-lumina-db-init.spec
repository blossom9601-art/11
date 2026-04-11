###############################################################################
# blossom-lumina-db-init.spec
# Blossom Lumina — DB 초기화 패키지 (MariaDB)
# 역할: 스키마/계정/권한/보안설정 생성
# 대상: Rocky Linux 8.10 / 9.x / 10.x
###############################################################################

%define _name       lumina-db
%define _version    2.0.0
%define _release    1%{?dist}
%define _prefix     /opt/blossom/lumina
%define _confdir    /etc/blossom/lumina

Name:           %{_name}
Version:        %{_version}
Release:        %{_release}
Summary:        Blossom Lumina — MariaDB 초기화 및 보안 설정 패키지
License:        Proprietary
URL:            https://blossom.local
Group:          Applications/Databases
BuildArch:      noarch
Requires:       mariadb-server >= 10.3
Requires:       openssl >= 1.1.1

%description
Blossom Lumina DB 초기화 패키지.

MariaDB에 Lumina 서비스를 위한 데이터베이스, 계정, 권한, 스키마,
보안 기본 설정을 자동으로 생성한다.

포함 항목:
- lumina 데이터베이스 생성
- lumina_ap_writer 계정 (INSERT/UPDATE/SELECT)
- lumina_web_reader 계정 (SELECT only)
- lumina_admin 계정 (관리/마이그레이션)
- TLS 접속 강제 설정
- 보안 강화 MariaDB 설정 파일
- 테이블 스키마 및 인덱스
- Retention (보존주기) 이벤트 스케줄러
- 개인정보 보호 컬럼 설계

###############################################################################
# install
###############################################################################
%install
rm -rf %{buildroot}

# ── SQL 파일 ─────────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_prefix}/sql
install -m 0640 %{_sourcedir}/sql/init.sql      %{buildroot}%{_prefix}/sql/init.sql

# ── MariaDB 보안 설정 ────────────────────────────────────
install -d -m 0755 %{buildroot}%{_sysconfdir}/my.cnf.d
cat > %{buildroot}%{_sysconfdir}/my.cnf.d/lumina-security.cnf << 'DBCNF'
#
# Blossom Lumina — MariaDB 보안 및 성능 기본 설정
# 이 파일은 blossom-lumina-db-init RPM이 자동 생성합니다.
# 운영 환경에 맞게 조정하세요.
#

[mysqld]
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TLS 강제 — 모든 클라이언트 연결에 TLS를 요구
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ssl_ca     = /etc/blossom/lumina/tls/ca.crt
ssl_cert   = /etc/blossom/lumina/tls/server.crt
ssl_key    = /etc/blossom/lumina/tls/server.key
require_secure_transport = ON
tls_version = TLSv1.2,TLSv1.3

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 네트워크 최소 노출
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 방화벽으로 AP/WEB 서버 IP만 허용 (rich rule)
# 모든 인터페이스 바인딩이 필요한 경우에만 0.0.0.0 사용
bind_address = 0.0.0.0
skip_name_resolve = ON

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 문자셋 (안전한 기본값)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
character_set_server = utf8mb4
collation_server = utf8mb4_unicode_ci
init_connect = 'SET NAMES utf8mb4'

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 연결 제한
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
max_connections = 200
wait_timeout = 300
interactive_timeout = 300
connect_timeout = 10
max_connect_errors = 100

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# InnoDB 성능 (로그 적재 특성에 맞춘 설정)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
innodb_buffer_pool_size = 1G
innodb_log_file_size = 256M
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT
innodb_file_per_table = ON
innodb_io_capacity = 2000
innodb_read_io_threads = 4
innodb_write_io_threads = 4

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 배치 INSERT 최적화
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bulk_insert_buffer_size = 64M

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 슬로우 쿼리 감시
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
slow_query_log = ON
slow_query_log_file = /var/log/mariadb/lumina-slow.log
long_query_time = 2

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 보안 강화
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
local_infile = OFF
symbolic_links = OFF
log_warnings = 2
# 이벤트 스케줄러 (retention 정책용)
event_scheduler = ON

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 감사 플러그인 (선택 — 활성화 시 주석 해제)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# plugin_load_add = server_audit
# server_audit_logging = ON
# server_audit_events = CONNECT,QUERY_DDL,QUERY_DML
# server_audit_file_path = /var/log/mariadb/lumina-audit.log
# server_audit_file_rotate_size = 100M
# server_audit_file_rotations = 30

[client]
default_character_set = utf8mb4

[mysql]
default_character_set = utf8mb4
DBCNF

# ── DB 접속 설정 예시 ────────────────────────────────────
install -d -m 0755 %{buildroot}%{_confdir}

###############################################################################
# files
###############################################################################
%files
%defattr(-,root,root,-)

# SQL
%dir %{_prefix}/sql
%attr(0640,root,root) %{_prefix}/sql/init.sql

# MariaDB 설정
%config(noreplace) %{_sysconfdir}/my.cnf.d/lumina-security.cnf

###############################################################################
# post — 설치 후 안내
###############################################################################
%post
echo ""
echo "================================================================"
echo " Blossom Lumina DB 초기화 패키지 설치 완료"
echo "================================================================"
echo ""
echo " 1. TLS 인증서를 배치하세요:"
echo "    %{_confdir}/tls/ca.crt"
echo "    %{_confdir}/tls/server.crt"
echo "    %{_confdir}/tls/server.key"
echo ""
echo " 2. MariaDB를 재시작하세요:"
echo "    systemctl restart mariadb"
echo ""
echo " 3. 초기화 SQL을 실행하세요:"
echo "    mysql -u root -p < %{_prefix}/sql/init.sql"
echo ""
echo " ★ init.sql 실행 전 반드시 비밀번호를 변경하세요!"
echo "   파일 내 IDENTIFIED BY 'CHANGE_ME_...' 부분을"
echo "   실제 강력한 비밀번호로 교체한 후 실행하세요."
echo ""
echo " 4. 방화벽 설정 (AP/WEB 서버 IP만 허용):"
echo "    firewall-cmd --permanent --add-rich-rule=\\"
echo "      'rule family=ipv4 source address=AP_IP \\"
echo "       port port=3306 protocol=tcp accept'"
echo "    firewall-cmd --reload"
echo ""
echo "================================================================"

###############################################################################
# changelog
###############################################################################
%changelog
* Sun Apr 06 2026 Blossom Admin <admin@blossom.local> - 2.0.0-1
- 보안 중심 DB 초기화 스크립트
- TLS 접속 강제
- 최소 권한 계정 분리 (writer/reader/admin)
- 개인정보 보호 컬럼 설계
- Retention 이벤트 스케줄러
- InnoDB 성능 최적화
- 감사 플러그인 설정 포함
