###############################################################################
# blossom-lumina-common.spec
# Blossom Lumina — 공통 라이브러리/유틸/설정 패키지
# 대상: Rocky Linux 8.10 / 9.x / 10.x
###############################################################################

%define _name       lumina-common
%define _version    2.0.0
%define _release    1%{?dist}
%define _prefix     /opt/blossom/lumina
%define _confdir    /etc/blossom/lumina
%define _logdir     /var/log/blossom/lumina
%define _libdir_bl  /var/lib/blossom/lumina
%define _rundir     /run/blossom/lumina

Name:           %{_name}
Version:        %{_version}
Release:        %{_release}
Summary:        Blossom Lumina — 공통 라이브러리 및 보안 기본설정
License:        Proprietary
URL:            https://blossom.local
Group:          System Environment/Base
BuildArch:      noarch
Requires:       openssl >= 1.1.1
Requires:       python3 >= 3.6
Requires:       python3-requests
Requires:       python3-click
Requires:       ca-certificates
Requires:       bash-completion

%description
Blossom 플랫폼의 Lumina 서비스 공통 패키지.
공용 Python 라이브러리, 암호화/마스킹 유틸리티,
보안 기본 설정 템플릿, 디렉터리 구조를 제공한다.
모든 Lumina 서비스 패키지(agent, ap, web, db-init)의 기반 의존성이다.

###############################################################################
# install
###############################################################################
%install
rm -rf %{buildroot}

# ── 공통 라이브러리 ──────────────────────────────────────
install -d -m 0755 %{buildroot}%{_prefix}/common
install -m 0644 %{_sourcedir}/common/__init__.py   %{buildroot}%{_prefix}/common/
install -m 0644 %{_sourcedir}/common/config.py     %{buildroot}%{_prefix}/common/
install -m 0644 %{_sourcedir}/common/collector.py  %{buildroot}%{_prefix}/common/
install -m 0644 %{_sourcedir}/common/crypto.py     %{buildroot}%{_prefix}/common/
install -m 0644 %{_sourcedir}/common/masking.py    %{buildroot}%{_prefix}/common/
install -m 0644 %{_sourcedir}/common/cli.py        %{buildroot}%{_prefix}/common/

# ── CLI 도구 (lumina) ────────────────────────────────────
install -d -m 0755 %{buildroot}%{_prefix}/cli/lumina_cli
install -d -m 0755 %{buildroot}%{_prefix}/cli/lumina_cli/commands
install -m 0644 %{_sourcedir}/cli/lumina_cli/__init__.py       %{buildroot}%{_prefix}/cli/lumina_cli/
install -m 0644 %{_sourcedir}/cli/lumina_cli/__main__.py       %{buildroot}%{_prefix}/cli/lumina_cli/
install -m 0644 %{_sourcedir}/cli/lumina_cli/main.py           %{buildroot}%{_prefix}/cli/lumina_cli/
install -m 0644 %{_sourcedir}/cli/lumina_cli/config.py         %{buildroot}%{_prefix}/cli/lumina_cli/
install -m 0644 %{_sourcedir}/cli/lumina_cli/api_client.py     %{buildroot}%{_prefix}/cli/lumina_cli/
install -m 0644 %{_sourcedir}/cli/lumina_cli/output.py         %{buildroot}%{_prefix}/cli/lumina_cli/
install -m 0644 %{_sourcedir}/cli/lumina_cli/commands/__init__.py  %{buildroot}%{_prefix}/cli/lumina_cli/commands/
install -m 0644 %{_sourcedir}/cli/lumina_cli/commands/agent.py     %{buildroot}%{_prefix}/cli/lumina_cli/commands/

# ── 관리 스크립트 ────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_prefix}/bin
install -m 0755 %{_sourcedir}/bin/lumina-healthcheck   %{buildroot}%{_prefix}/bin/
install -m 0755 %{_sourcedir}/bin/lumina-rotate-token   %{buildroot}%{_prefix}/bin/
install -m 0755 %{_sourcedir}/bin/lumina-cert-renew     %{buildroot}%{_prefix}/bin/
install -m 0755 %{_sourcedir}/bin/lumina                %{buildroot}%{_prefix}/bin/

# ── /usr/local/bin 심볼릭 링크 (lumina CLI 명령어) ────────
install -d -m 0755 %{buildroot}/usr/local/bin
ln -sf %{_prefix}/bin/lumina %{buildroot}/usr/local/bin/lumina

# ── Bash 자동완성 ────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_sysconfdir}/bash_completion.d
install -m 0644 %{_sourcedir}/cli/lumina-completion.bash %{buildroot}%{_sysconfdir}/bash_completion.d/lumina

# ── 설정 디렉터리 ────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_confdir}
install -d -m 0755 %{buildroot}%{_confdir}/tls
install -m 0640 %{_sourcedir}/conf/common.conf     %{buildroot}%{_confdir}/common.conf
install -m 0600 %{_sourcedir}/conf/secure.env       %{buildroot}%{_confdir}/secure.env

# ── 데이터 디렉터리 ──────────────────────────────────────
install -d -m 0755 %{buildroot}%{_libdir_bl}

# ── 로그 디렉터리 ────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_logdir}
install -d -m 0700 %{buildroot}%{_logdir}/audit

# ── tmpfiles.d (런타임 디렉터리 자동 생성) ────────────────
install -d -m 0755 %{buildroot}%{_tmpfilesdir}
cat > %{buildroot}%{_tmpfilesdir}/blossom-lumina.conf << 'TMPEOF'
# Blossom Lumina — 런타임 디렉터리 자동 생성
d /run/blossom           0755  root  root  -
d /run/blossom/lumina    0755  root  root  -
TMPEOF

# ── logrotate ────────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_sysconfdir}/logrotate.d
cat > %{buildroot}%{_sysconfdir}/logrotate.d/blossom-lumina << 'LREOF'
/var/log/blossom/lumina/*/*.log {
    daily
    rotate 90
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
    dateext
    dateformat -%Y%m%d
    sharedscripts
    postrotate
        systemctl reload lumina-ap  2>/dev/null || true
        systemctl reload lumina-web 2>/dev/null || true
    endscript
}

/var/log/blossom/lumina/audit/*.log {
    daily
    rotate 730
    compress
    delaycompress
    missingok
    notifempty
    create 0600 root root
    dateext
    dateformat -%Y%m%d
}
LREOF

###############################################################################
# files
###############################################################################
%files
%defattr(-,root,root,-)

# 공통 라이브러리
%dir %{_prefix}
%dir %{_prefix}/common
%{_prefix}/common/__init__.py
%{_prefix}/common/config.py
%{_prefix}/common/collector.py
%{_prefix}/common/crypto.py
%{_prefix}/common/masking.py
%{_prefix}/common/cli.py

# 관리 스크립트
%dir %{_prefix}/bin
%{_prefix}/bin/lumina-healthcheck
%{_prefix}/bin/lumina-rotate-token
%{_prefix}/bin/lumina-cert-renew
%{_prefix}/bin/lumina
/usr/local/bin/lumina

# CLI 도구
%dir %{_prefix}/cli
%dir %{_prefix}/cli/lumina_cli
%dir %{_prefix}/cli/lumina_cli/commands
%{_prefix}/cli/lumina_cli/__init__.py
%{_prefix}/cli/lumina_cli/__main__.py
%{_prefix}/cli/lumina_cli/main.py
%{_prefix}/cli/lumina_cli/config.py
%{_prefix}/cli/lumina_cli/api_client.py
%{_prefix}/cli/lumina_cli/output.py
%{_prefix}/cli/lumina_cli/commands/__init__.py
%{_prefix}/cli/lumina_cli/commands/agent.py

# Bash 자동완성
%{_sysconfdir}/bash_completion.d/lumina

# 설정 파일
%dir %{_confdir}
%dir %{_confdir}/tls
%config(noreplace) %{_confdir}/common.conf
%config(noreplace) %attr(0600,root,root) %{_confdir}/secure.env

# 데이터/로그 디렉터리
%dir %{_libdir_bl}
%dir %{_logdir}
%dir %attr(0700,root,root) %{_logdir}/audit

# tmpfiles / logrotate
%{_tmpfilesdir}/blossom-lumina.conf
%config(noreplace) %{_sysconfdir}/logrotate.d/blossom-lumina

###############################################################################
# pre — 설치 전 스크립트
###############################################################################
%pre
# 공통 그룹 생성 (서비스 계정이 공유 가능)
getent group lumina >/dev/null 2>&1 || \
    groupadd -r lumina

###############################################################################
# post — 설치 후 스크립트
###############################################################################
%post
# tmpfiles.d 적용 — /run/blossom/lumina 생성
systemd-tmpfiles --create blossom-lumina.conf 2>/dev/null || true

# ── NTP / Timezone 초기 설정 ─────────────────────────────
# 최초 설치 시에만 적용 ($1 == 1), 업그레이드 시 건너뜀
if [ $1 -eq 1 ]; then
    # Timezone → Asia/Seoul
    timedatectl set-timezone Asia/Seoul 2>/dev/null || true

    # chrony.conf에 pool이 없으면 추가
    CHRONY_CONF="/etc/chrony.conf"
    if [ -f "$CHRONY_CONF" ]; then
        if ! grep -qE '^(pool|server) .*pool\.ntp\.org' "$CHRONY_CONF"; then
            sed -i '/^server /d;/^pool /d' "$CHRONY_CONF"
            sed -i '1i\pool 2.rocky.pool.ntp.org iburst' "$CHRONY_CONF"
        fi
    fi

    # NTP 활성화 + chronyd 재시작
    timedatectl set-ntp true 2>/dev/null || true
    systemctl restart chronyd 2>/dev/null || true
fi

# TLS 디렉터리 안내
if [ ! -f %{_confdir}/tls/ca.crt ]; then
    echo ""
    echo "================================================================"
    echo " Blossom Lumina — 공통 패키지 설치 완료"
    echo "================================================================"
    echo ""
    echo " ★ TLS 인증서를 배치하세요:"
    echo "   %{_confdir}/tls/ca.crt       (CA 인증서)"
    echo "   %{_confdir}/tls/server.crt   (서버 인증서)"
    echo "   %{_confdir}/tls/server.key   (서버 개인키, chmod 0600)"
    echo ""
    echo " ★ 비밀값 설정:"
    echo "   vi %{_confdir}/secure.env"
    echo ""
    echo "================================================================"
fi

###############################################################################
# preun — 제거 전 스크립트
###############################################################################
%preun
# $1 == 0 일 때만 (완전 삭제, 업그레이드 아님)
# 공통 패키지는 별도 서비스 없으므로 특별한 정지 동작 불필요

###############################################################################
# postun — 제거 후 스크립트
###############################################################################
%postun
if [ $1 -eq 0 ]; then
    echo "Blossom Lumina 공통 패키지가 제거되었습니다."
    echo "※ 데이터/로그 디렉터리는 보존됩니다. 수동 삭제 필요 시:"
    echo "  rm -rf /var/lib/blossom/lumina/"
    echo "  rm -rf /var/log/blossom/lumina/"
fi

###############################################################################
# changelog
###############################################################################
%changelog
* Tue Apr 08 2026 Blossom Admin <admin@blossom.local> - 2.0.0-1
- lumina CLI 도구 추가 (에이전트 관리)
- Bash 자동완성 지원
- RBAC 기반 접근제어 적용
- 감사 로그 기록 추가
- 보안 중심 3티어 아키텍처 재설계
- 공통 암호화/마스킹 유틸리티 추가
- 디렉터리 구조 표준화 (/opt/blossom/lumina/, /etc/blossom/lumina/)
- tmpfiles.d 런타임 디렉터리 지원
- logrotate 통합 설정
- secure.env 비밀값 분리 구조
