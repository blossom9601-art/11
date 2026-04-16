###############################################################################
# blossom-lumina-ap.spec
# Blossom Lumina — AP (Application/Processing) 서버 패키지
# 역할: Agent 데이터 수신 → 파싱 → 큐 → DB 적재
# 대상: Rocky Linux 8.10 / 9.x / 10.x
###############################################################################

%define _name       lumina-ap
%define _version    2.0.0
%define _release    1%{?dist}
%define _prefix     /opt/blossom/lumina
%define _confdir    /etc/blossom/lumina
%define _logdir     /var/log/blossom/lumina/ap
%define _libdir_bl  /var/lib/blossom/lumina/ap
%define _rundir     /run/blossom/lumina

Name:           %{_name}
Version:        %{_version}
Release:        %{_release}
Summary:        Blossom Lumina — AP 서버 (Agent 데이터 수신/처리/DB 적재)
License:        Proprietary
URL:            https://blossom.local
Group:          System Environment/Daemons
BuildArch:      noarch
Requires:       lumina-common >= 2.0.0
Requires:       python3 >= 3.6
Requires:       python3-PyMySQL >= 0.9
Requires:       openssl >= 1.1.1

%description
Blossom Lumina AP 서버.
Lumina-agent 로부터 TLS/mTLS 암호화된 자산 수집 데이터를 수신하고,
파싱/검증 후 MariaDB에 안전하게 적재한다.

구성 요소:
- Receiver: TLS :5100 수신, mTLS/토큰 인증
- Queue: 파일 기반 내부 대기열 (장애 시 데이터 유실 방지)
- Parser: JSON 스키마 검증 + 정규화
- Worker: 데이터 변환/마스킹
- DB Forwarder: MariaDB TLS 적재

###############################################################################
# install
###############################################################################
%install
rm -rf %{buildroot}

# ── AP 서버 코드 ─────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_prefix}/ap
install -m 0644 %{_sourcedir}/ap/__init__.py    %{buildroot}%{_prefix}/ap/
install -m 0755 %{_sourcedir}/ap/server.py      %{buildroot}%{_prefix}/ap/
install -m 0644 %{_sourcedir}/ap/receiver.py    %{buildroot}%{_prefix}/ap/
install -m 0644 %{_sourcedir}/ap/queue.py       %{buildroot}%{_prefix}/ap/
install -m 0644 %{_sourcedir}/ap/parser.py      %{buildroot}%{_prefix}/ap/
install -m 0644 %{_sourcedir}/ap/worker.py      %{buildroot}%{_prefix}/ap/
install -m 0644 %{_sourcedir}/ap/forwarder.py   %{buildroot}%{_prefix}/ap/
install -m 0644 %{_sourcedir}/ap/wsgi.py        %{buildroot}%{_prefix}/ap/
install -m 0644 %{_sourcedir}/ap/auth.py        %{buildroot}%{_prefix}/ap/
install -m 0644 %{_sourcedir}/ap/schema.py      %{buildroot}%{_prefix}/ap/

# ── 설정 파일 ────────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_confdir}
install -m 0640 %{_sourcedir}/conf/ap.conf      %{buildroot}%{_confdir}/ap.conf
install -m 0640 %{_sourcedir}/conf/db.conf      %{buildroot}%{_confdir}/db.conf

# ── systemd unit ─────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_unitdir}
install -m 0644 %{_sourcedir}/systemd/lumina-ap.service \
    %{buildroot}%{_unitdir}/lumina-ap.service

# ── 데이터 디렉터리 ──────────────────────────────────────
install -d -m 0750 %{buildroot}%{_libdir_bl}
install -d -m 0750 %{buildroot}%{_libdir_bl}/queue
install -d -m 0700 %{buildroot}%{_libdir_bl}/failed
install -d -m 0700 %{buildroot}%{_libdir_bl}/raw

# ── 로그 디렉터리 ────────────────────────────────────────
install -d -m 0750 %{buildroot}%{_logdir}

# ── tmpfiles.d ───────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_tmpfilesdir}
cat > %{buildroot}%{_tmpfilesdir}/lumina-ap.conf << 'TMPEOF'
d /run/blossom/lumina   0755  root       root       -
f /run/blossom/lumina/ap.pid  0644  lumina-ap  lumina-ap  -
TMPEOF

###############################################################################
# files
###############################################################################
%files
%defattr(-,root,root,-)

# AP 코드
%dir %{_prefix}/ap
%{_prefix}/ap/__init__.py
%{_prefix}/ap/server.py
%{_prefix}/ap/receiver.py
%{_prefix}/ap/queue.py
%{_prefix}/ap/parser.py
%{_prefix}/ap/worker.py
%{_prefix}/ap/forwarder.py
%{_prefix}/ap/wsgi.py
%{_prefix}/ap/auth.py
%{_prefix}/ap/schema.py

# 설정
%config(noreplace) %attr(0640,root,lumina-ap) %{_confdir}/ap.conf
%config(noreplace) %attr(0640,root,lumina-ap) %{_confdir}/db.conf

# systemd
%{_unitdir}/lumina-ap.service

# 데이터 디렉터리
%dir %attr(0750,lumina-ap,lumina-ap) %{_libdir_bl}
%dir %attr(0750,lumina-ap,lumina-ap) %{_libdir_bl}/queue
%dir %attr(0700,lumina-ap,lumina-ap) %{_libdir_bl}/failed
%dir %attr(0700,lumina-ap,lumina-ap) %{_libdir_bl}/raw

# 로그 디렉터리
%dir %attr(0750,lumina-ap,lumina-ap) %{_logdir}

# tmpfiles
%{_tmpfilesdir}/lumina-ap.conf

###############################################################################
# pre — 설치 전: 서비스 계정 생성
###############################################################################
%pre
getent group lumina-ap >/dev/null 2>&1 || \
    groupadd -r lumina-ap
getent passwd lumina-ap >/dev/null 2>&1 || \
    useradd -r -g lumina-ap -G lumina \
        -d %{_prefix}/ap \
        -s /sbin/nologin \
        -c "Lumina AP Service" lumina-ap

###############################################################################
# post — 설치 후 설정
###############################################################################
%post
# systemd 등록
systemctl daemon-reload
systemctl enable lumina-ap.service 2>/dev/null || true

# tmpfiles 적용
systemd-tmpfiles --create lumina-ap.conf 2>/dev/null || true

# SELinux 포트 등록 (가능한 경우)
if command -v semanage &>/dev/null; then
    semanage port -a -t lumina_ap_port_t -p tcp 5100 2>/dev/null || \
    semanage port -m -t lumina_ap_port_t -p tcp 5100 2>/dev/null || true
fi

# 방화벽 안내
echo ""
echo "================================================================"
echo " Blossom Lumina AP 서버 설치 완료"
echo "================================================================"
echo ""
echo " 1. 설정 파일 편집:"
echo "    vi %{_confdir}/ap.conf         (AP 수신 설정)"
echo "    vi %{_confdir}/db.conf         (DB 접속 설정)"
echo "    vi %{_confdir}/secure.env      (비밀값)"
echo ""
echo " 2. TLS 인증서 배치:"
echo "    %{_confdir}/tls/ca.crt         (CA 인증서)"
echo "    %{_confdir}/tls/server.crt     (AP 서버 인증서)"
echo "    %{_confdir}/tls/server.key     (AP 서버 개인키)"
echo ""
echo " 3. 방화벽 설정:"
echo "    firewall-cmd --permanent --add-port=5100/tcp"
echo "    firewall-cmd --reload"
echo ""
echo " 4. 서비스 시작:"
echo "    systemctl start lumina-ap"
echo ""
echo "================================================================"

###############################################################################
# preun — 제거 전: 서비스 정지
###############################################################################
%preun
if [ $1 -eq 0 ]; then
    systemctl stop lumina-ap.service 2>/dev/null || true
    systemctl disable lumina-ap.service 2>/dev/null || true
fi

###############################################################################
# postun — 제거 후 정리
###############################################################################
%postun
systemctl daemon-reload

if [ $1 -eq 0 ]; then
    # SELinux 포트 제거
    if command -v semanage &>/dev/null; then
        semanage port -d -t lumina_ap_port_t -p tcp 5100 2>/dev/null || true
    fi

    echo ""
    echo "Lumina AP 서버가 제거되었습니다."
    echo "※ 데이터 보존: %{_libdir_bl}/"
    echo "※ 로그 보존: %{_logdir}/"
    echo "※ 수동 삭제 필요 시 위 디렉터리를 직접 제거하세요."
fi

###############################################################################
# changelog
###############################################################################
%changelog
* Sun Apr 06 2026 Blossom Admin <admin@blossom.local> - 2.0.0-1
- 보안 중심 3티어 아키텍처 재설계
- TLS/mTLS 수신 기본 적용
- 파일 기반 내부 큐 (장애 시 데이터 유실 방지)
- JSON 스키마 검증
- DB TLS 접속 강제
- Rate limit / flood 대응
- 민감정보 마스킹 파서 통합
- 전용 서비스 계정 (lumina-ap)
- SELinux 포트 자동 등록
