###############################################################################
# blossom-lumina-agent.spec
# Blossom Lumina — Agent 패키지 (Linux)
# 역할: 대상 서버에서 자산 정보 수집 후 AP 서버로 전송
# 대상: Rocky Linux 8.10 / 9.x / 10.x
###############################################################################

%define _name       lumina-agent
%define _version    2.0.0
%define _release    1%{?dist}
%define _prefix     /opt/blossom/lumina
%define _confdir    /etc/blossom/lumina
%define _logdir     /var/log/blossom/lumina/agent
%define _libdir_bl  /var/lib/blossom/lumina/agent

Name:           %{_name}
Version:        %{_version}
Release:        %{_release}
Summary:        Blossom Lumina — 자산 자동 탐색 에이전트 (Linux)
License:        Proprietary
URL:            https://blossom.local
Group:          System Environment/Daemons
BuildArch:      noarch
Requires:       lumina-common >= 2.0.0
Requires:       python3 >= 3.6

# 기존 lumina RPM과의 호환성
Provides:       lumina = %{version}-%{release}
Obsoletes:      lumina < 2.0.0

%description
Blossom Lumina 자산 자동 탐색 에이전트 (Linux).

대상 서버에서 네트워크 인터페이스(NIC/IP/MAC), OS 계정,
설치 패키지를 자동 수집하여 AP 서버로 암호화 전송한다.

주요 기능:
- NIC / IP / MAC / FC HBA 수집 (ip, /sys, nmcli)
- OS 계정 수집 (/etc/passwd, /etc/group, sudoers)
- RPM / DEB / APK / PIP / SNAP 패키지 수집
- mTLS 또는 Bearer 토큰 인증
- 전송 실패 시 로컬 큐 저장 + 지수 백오프 재전송
- systemd 서비스 관리

###############################################################################
# install
###############################################################################
%install
rm -rf %{buildroot}

# ── 에이전트 코드 ────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_prefix}/agent
install -d -m 0755 %{buildroot}%{_prefix}/agent/collectors

install -m 0644 %{_sourcedir}/linux/__init__.py              %{buildroot}%{_prefix}/agent/
install -m 0755 %{_sourcedir}/linux/agent.py                 %{buildroot}%{_prefix}/agent/
install -m 0644 %{_sourcedir}/linux/collectors/__init__.py   %{buildroot}%{_prefix}/agent/collectors/
install -m 0644 %{_sourcedir}/linux/collectors/interface.py  %{buildroot}%{_prefix}/agent/collectors/
install -m 0644 %{_sourcedir}/linux/collectors/account.py    %{buildroot}%{_prefix}/agent/collectors/
install -m 0644 %{_sourcedir}/linux/collectors/package.py    %{buildroot}%{_prefix}/agent/collectors/

# ── 설정 파일 ────────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_confdir}
install -d -m 0755 %{buildroot}%{_confdir}/tls
install -m 0640 %{_sourcedir}/conf/agent.conf    %{buildroot}%{_confdir}/agent.conf

# ── systemd unit ─────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_unitdir}
install -m 0644 %{_sourcedir}/systemd/lumina-agent.service \
    %{buildroot}%{_unitdir}/lumina-agent.service

# ── CLI wrapper ──────────────────────────────────────────
install -d -m 0755 %{buildroot}/usr/bin
cat > %{buildroot}/usr/bin/lumina-agent << 'CLIEOF'
#!/bin/bash
# Lumina Agent CLI wrapper
exec /usr/bin/python3 /opt/blossom/lumina/agent/agent.py \
    --conf /etc/blossom/lumina/agent.conf "$@"
CLIEOF
chmod 0755 %{buildroot}/usr/bin/lumina-agent

# ── 데이터 디렉터리 ──────────────────────────────────────
install -d -m 0750 %{buildroot}%{_libdir_bl}
install -d -m 0750 %{buildroot}%{_libdir_bl}/queue

# ── 로그 디렉터리 ────────────────────────────────────────
install -d -m 0750 %{buildroot}%{_logdir}

# ── tmpfiles.d ───────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_tmpfilesdir}
cat > %{buildroot}%{_tmpfilesdir}/lumina-agent.conf << 'TMPEOF'
d /run/blossom           0755  root    root    -
d /run/blossom/lumina    0755  root    root    -
TMPEOF

# ── 하위 호환 심볼릭 링크 ────────────────────────────────
# 기존 경로 /etc/lumina/ → /etc/blossom/lumina/ 심볼릭 링크
install -d -m 0755 %{buildroot}/etc
# 기존 경로 /opt/lumina/ → /opt/blossom/lumina/ 심볼릭 링크

###############################################################################
# files
###############################################################################
%files
%defattr(-,root,root,-)

# 에이전트 코드
%dir %{_prefix}/agent
%{_prefix}/agent/__init__.py
%{_prefix}/agent/agent.py
%dir %{_prefix}/agent/collectors
%{_prefix}/agent/collectors/__init__.py
%{_prefix}/agent/collectors/interface.py
%{_prefix}/agent/collectors/account.py
%{_prefix}/agent/collectors/package.py

# CLI wrapper
/usr/bin/lumina-agent

# 설정
%dir %{_confdir}
%dir %{_confdir}/tls
%config(noreplace) %attr(0640,root,lumina) %{_confdir}/agent.conf

# systemd
%{_unitdir}/lumina-agent.service

# 데이터 디렉터리
%dir %attr(0750,lumina,lumina) %{_libdir_bl}
%dir %attr(0750,lumina,lumina) %{_libdir_bl}/queue

# 로그 디렉터리
%dir %attr(0750,lumina,lumina) %{_logdir}

# tmpfiles
%{_tmpfilesdir}/lumina-agent.conf

###############################################################################
# pre — 서비스 계정 생성
###############################################################################
%pre
getent group lumina >/dev/null 2>&1 || \
    groupadd -r lumina
getent passwd lumina >/dev/null 2>&1 || \
    useradd -r -g lumina \
        -d %{_prefix}/agent \
        -s /sbin/nologin \
        -c "Lumina Agent Service" lumina

###############################################################################
# post — 설치 후
###############################################################################
%post
# systemd 등록
systemctl daemon-reload
systemctl enable lumina-agent.service 2>/dev/null || true

# tmpfiles 적용
systemd-tmpfiles --create lumina-agent.conf 2>/dev/null || true

# ── 기존 lumina RPM에서 업그레이드 시 설정 마이그레이션 ──
OLD_CONF="/etc/lumina/lumina.conf"
NEW_CONF="%{_confdir}/agent.conf"
if [ -f "$OLD_CONF" ] && [ ! -L "$OLD_CONF" ]; then
    # 기존 설정에서 server_host 추출하여 새 설정에 반영
    OLD_HOST=$(grep -E '^\s*host\s*=' "$OLD_CONF" 2>/dev/null | head -1 | sed 's/.*=\s*//')
    OLD_URL=$(grep -E '^\s*server_url\s*=' "$OLD_CONF" 2>/dev/null | head -1 | sed 's/.*=\s*//')
    if [ -n "$OLD_HOST" ] || [ -n "$OLD_URL" ]; then
        echo ""
        echo "  ★ 기존 Lumina 설정 감지: $OLD_CONF"
        echo "    새 설정 파일: $NEW_CONF"
        echo "    기존 설정을 참고하여 서버 주소를 입력하세요."
        echo ""
    fi
fi

# ── 하위 호환 심볼릭 링크 ────────────────────────────────
if [ ! -e /etc/lumina ]; then
    ln -sf %{_confdir} /etc/lumina 2>/dev/null || true
fi

# ── 기존 서비스명 호환 ───────────────────────────────────
if [ ! -e %{_unitdir}/lumina.service ]; then
    ln -sf lumina-agent.service %{_unitdir}/lumina.service 2>/dev/null || true
fi

# 디렉터리 소유자 보정
chown -R lumina:lumina %{_libdir_bl} %{_logdir} 2>/dev/null || true

echo ""
echo "================================================================"
echo " Blossom Lumina Agent 설치 완료"
echo "================================================================"
echo ""
echo " 1. 설정 파일 편집 (AP 서버 주소 입력):"
echo "    vi %{_confdir}/agent.conf"
echo ""
echo "    [server]"
echo "    host = <AP 서버 IP>"
echo "    port = 5100"
echo ""
echo " 2. TLS 인증서 배치 (mTLS 사용 시):"
echo "    %{_confdir}/tls/ca.crt"
echo "    %{_confdir}/tls/client.crt"
echo "    %{_confdir}/tls/client.key"
echo ""
echo " 3. 서비스 시작:"
echo "    systemctl start lumina-agent"
echo ""
echo " 4. 대화형 설정 (선택):"
echo "    lumina-agent --setup"
echo ""
echo "================================================================"

###############################################################################
# preun — 제거 전
###############################################################################
%preun
if [ $1 -eq 0 ]; then
    systemctl stop lumina-agent.service 2>/dev/null || true
    systemctl disable lumina-agent.service 2>/dev/null || true
fi

###############################################################################
# postun — 제거 후
###############################################################################
%postun
systemctl daemon-reload

if [ $1 -eq 0 ]; then
    # 심볼릭 링크 정리
    rm -f %{_unitdir}/lumina.service 2>/dev/null || true
    rm -f /etc/lumina 2>/dev/null || true

    echo ""
    echo "Lumina Agent가 제거되었습니다."
    echo "※ 데이터 보존: %{_libdir_bl}/"
    echo "※ 로그 보존: %{_logdir}/"
fi

###############################################################################
# changelog
###############################################################################
%changelog
* Sat Apr 11 2026 Blossom Admin <admin@blossom.local> - 2.0.0-1
- v2.0.0 전환: /opt/blossom/lumina/agent/ 신규 경로
- lumina-common >= 2.0.0 의존
- 기존 lumina RPM Obsoletes/Provides 처리
- 하위 호환 심볼릭 링크 생성
- mTLS + 토큰 인증 지원
- 전송 실패 시 로컬 큐 + 지수 백오프 재전송
- systemd 샌드박스 보안 강화
