###############################################################################
# blossom-lumina-web.spec
# Blossom Lumina — WEB 서버 패키지 (NGINX + Gunicorn + Flask)
# 역할: 대시보드 UI, 조회 API, 관리자 기능
# 대상: Rocky Linux 8.10 / 9.x / 10.x
###############################################################################

%define _name       lumina-web
%define _version    2.0.0
%define _release    1%{?dist}
%define _prefix     /opt/blossom/lumina
%define _confdir    /etc/blossom/lumina
%define _logdir     /var/log/blossom/lumina/web
%define _libdir_bl  /var/lib/blossom/lumina/web
%define _rundir     /run/blossom/lumina

Name:           %{_name}
Version:        %{_version}
Release:        %{_release}
Summary:        Blossom Lumina — WEB 대시보드 서버 (NGINX + Gunicorn + Flask)
License:        Proprietary
URL:            https://blossom.local
Group:          System Environment/Daemons
BuildArch:      noarch
Requires:       lumina-common >= 2.0.0
Requires:       python3 >= 3.6
Requires:       python3-flask >= 2.0
Requires:       python3-gunicorn >= 20.0
Requires:       python3-PyMySQL >= 0.9
Requires:       nginx >= 1.14
Requires:       openssl >= 1.1.1

%description
Blossom Lumina WEB 대시보드 서버.
NGINX를 리버스 프록시로 사용하여 Gunicorn + Flask 앱을 서빙한다.
DB는 READ-ONLY 접근만 허용 (lumina_web_reader 계정).

보안 기본값:
- HTTPS 강제 (HTTP → HTTPS 리다이렉트)
- HSTS 활성화
- 보안 헤더 기본 주입
- Gunicorn 내부 바인딩 전용 (127.0.0.1:8000)
- secure cookie / session
- Flask DEBUG = False

###############################################################################
# install
###############################################################################
%install
rm -rf %{buildroot}

# ── WEB 앱 코드 ──────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_prefix}/web
install -d -m 0755 %{buildroot}%{_prefix}/web/app
install -d -m 0755 %{buildroot}%{_prefix}/web/app/routes
install -d -m 0755 %{buildroot}%{_prefix}/web/app/templates
install -d -m 0755 %{buildroot}%{_prefix}/web/app/static

install -m 0644 %{_sourcedir}/web/wsgi.py               %{buildroot}%{_prefix}/web/
install -m 0644 %{_sourcedir}/web/gunicorn.conf.py       %{buildroot}%{_prefix}/web/
install -m 0644 %{_sourcedir}/web/app/__init__.py        %{buildroot}%{_prefix}/web/app/

# ── 설정 파일 ────────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_confdir}
install -m 0640 %{_sourcedir}/conf/web.conf              %{buildroot}%{_confdir}/web.conf

# ── NGINX 설정 ───────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_sysconfdir}/nginx/conf.d
install -m 0644 %{_sourcedir}/nginx/lumina.conf \
    %{buildroot}%{_sysconfdir}/nginx/conf.d/lumina.conf

# ── systemd unit ─────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_unitdir}
install -m 0644 %{_sourcedir}/systemd/lumina-web.service \
    %{buildroot}%{_unitdir}/lumina-web.service

# ── 데이터 디렉터리 ──────────────────────────────────────
install -d -m 0750 %{buildroot}%{_libdir_bl}

# ── 로그 디렉터리 ────────────────────────────────────────
install -d -m 0750 %{buildroot}%{_logdir}

# ── tmpfiles.d ───────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_tmpfilesdir}
cat > %{buildroot}%{_tmpfilesdir}/lumina-web.conf << 'TMPEOF'
d /run/blossom/lumina          0755  root        root        -
f /run/blossom/lumina/gunicorn.pid   0644  lumina-web  lumina-web  -
TMPEOF

###############################################################################
# files
###############################################################################
%files
%defattr(-,root,root,-)

# WEB 앱 코드
%dir %{_prefix}/web
%{_prefix}/web/wsgi.py
%{_prefix}/web/gunicorn.conf.py
%dir %{_prefix}/web/app
%{_prefix}/web/app/__init__.py
%dir %{_prefix}/web/app/routes
%dir %{_prefix}/web/app/templates
%dir %{_prefix}/web/app/static

# 설정
%config(noreplace) %attr(0640,root,lumina-web) %{_confdir}/web.conf

# NGINX 설정
%config(noreplace) %{_sysconfdir}/nginx/conf.d/lumina.conf

# systemd
%{_unitdir}/lumina-web.service

# 데이터 디렉터리
%dir %attr(0750,lumina-web,lumina-web) %{_libdir_bl}

# 로그 디렉터리
%dir %attr(0750,lumina-web,lumina-web) %{_logdir}

# tmpfiles
%{_tmpfilesdir}/lumina-web.conf

###############################################################################
# pre — 서비스 계정 생성
###############################################################################
%pre
getent group lumina-web >/dev/null 2>&1 || \
    groupadd -r lumina-web
getent passwd lumina-web >/dev/null 2>&1 || \
    useradd -r -g lumina-web -G lumina \
        -d %{_prefix}/web \
        -s /sbin/nologin \
        -c "Lumina WEB Service" lumina-web

###############################################################################
# post — 설치 후
###############################################################################
%post
systemctl daemon-reload
systemctl enable lumina-web.service 2>/dev/null || true

# tmpfiles 적용
systemd-tmpfiles --create lumina-web.conf 2>/dev/null || true

# SELinux: Gunicorn → DB 연결 허용
if command -v setsebool &>/dev/null; then
    setsebool -P httpd_can_network_connect_db 1 2>/dev/null || true
    setsebool -P httpd_can_network_connect 1 2>/dev/null || true
fi

echo ""
echo "================================================================"
echo " Blossom Lumina WEB 서버 설치 완료"
echo "================================================================"
echo ""
echo " 1. 설정 파일 편집:"
echo "    vi %{_confdir}/web.conf         (WEB 앱 설정)"
echo "    vi %{_confdir}/secure.env       (SECRET_KEY, DB 비밀번호)"
echo ""
echo " 2. TLS 인증서 배치 (HTTPS):"
echo "    %{_confdir}/tls/server.crt"
echo "    %{_confdir}/tls/server.key"
echo ""
echo " 3. NGINX 설정 확인:"
echo "    vi /etc/nginx/conf.d/lumina.conf"
echo "    nginx -t"
echo ""
echo " 4. 서비스 시작:"
echo "    systemctl start lumina-web"
echo "    systemctl restart nginx"
echo ""
echo " 5. 방화벽:"
echo "    firewall-cmd --permanent --add-service=https"
echo "    firewall-cmd --reload"
echo ""
echo "================================================================"

###############################################################################
# preun — 제거 전
###############################################################################
%preun
if [ $1 -eq 0 ]; then
    systemctl stop lumina-web.service 2>/dev/null || true
    systemctl disable lumina-web.service 2>/dev/null || true
fi

###############################################################################
# postun — 제거 후
###############################################################################
%postun
systemctl daemon-reload

if [ $1 -eq 0 ]; then
    echo "Lumina WEB 서버가 제거되었습니다."
    echo "※ NGINX 재시작 필요: systemctl restart nginx"
fi

###############################################################################
# changelog
###############################################################################
%changelog
* Sun Apr 06 2026 Blossom Admin <admin@blossom.local> - 2.0.0-1
- 보안 중심 3티어 아키텍처 재설계
- NGINX reverse proxy + Gunicorn + Flask 구조
- HTTPS 강제, HSTS, 보안 헤더 기본 적용
- DB READ-ONLY 접근 (lumina_web_reader)
- 전용 서비스 계정 (lumina-web)
- secure cookie / session 기본 설정
- request size 제한, timeout 정책
- SELinux boolean 자동 설정
