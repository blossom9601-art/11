###############################################################################
# blossom-lumina-web.spec
# Blossom Lumina — 단일 통합 WEB 서비스 패키지
# 역할: 하나의 systemd 유닛(lumina-web.service)에서 두 gunicorn(Asset Mgmt + Chat
#       8001, Dashboard 8000)을 wrapper 로 동반 기동.
# 대상: Rocky Linux 8.10 / 9.x / 10.x
# 주의: 애플리케이션 코드(/opt/blossom/web, /opt/blossom/lumina/web), nginx 설정,
#       TLS, secure.env 는 별도 배포되며 이 패키지는 건드리지 않는다.
###############################################################################

%define _name       lumina-web
%define _version    2.1.2
%define _release    1%{?dist}
%define _logdir     /var/log/blossom/lumina/web

Name:           %{_name}
Version:        %{_version}
Release:        %{_release}
Summary:        Blossom Lumina — 통합 WEB 서비스 (Asset Mgmt + Chat + Dashboard, 단일 systemd 유닛)
License:        Proprietary
URL:            https://blossom.local
Group:          System Environment/Daemons
BuildArch:      noarch
Requires:       bash

%description
Blossom Lumina — 단일 통합 WEB 서비스 유닛.

하나의 systemd 서비스(lumina-web.service) 안에서 두 개의 gunicorn 프로세스를
동반 기동/정지한다. 두 프로세스 모두 /opt/blossom/web/venv (python3.11) 공유.
  - 127.0.0.1:8001 : Asset Mgmt + Chat (python3.11 venv)
  - 127.0.0.1:8000 : Lumina Dashboard (python3.11 venv)

제공 파일:
  - /usr/lib/systemd/system/lumina-web.service  (단일 통합 유닛)
  - /usr/local/bin/lumina-web-start.sh           (두 gunicorn wrapper)

애플리케이션 코드 / nginx 설정 / TLS / DB 자격 등은 별도 배포되며
이 패키지는 건드리지 않는다.

###############################################################################
# install
###############################################################################
%install
rm -rf %{buildroot}

# ── systemd unit (단일 통합 유닛) ────────────────────────
install -d -m 0755 %{buildroot}%{_unitdir}
install -m 0644 %{_sourcedir}/systemd/lumina-web.service \
    %{buildroot}%{_unitdir}/lumina-web.service

# ── 통합 wrapper 스크립트 (두 gunicorn 동반 기동) ────────
install -d -m 0755 %{buildroot}/usr/local/bin
install -m 0755 %{_sourcedir}/bin/lumina-web-start.sh \
    %{buildroot}/usr/local/bin/lumina-web-start.sh

# ── 로그 디렉터리 ────────────────────────────────────────
install -d -m 0755 %{buildroot}%{_logdir}

###############################################################################
# files
###############################################################################
%files
%defattr(-,root,root,-)

# systemd 유닛
%{_unitdir}/lumina-web.service

# 통합 wrapper
%attr(0755,root,root) /usr/local/bin/lumina-web-start.sh

# 로그 디렉터리
%dir %{_logdir}

###############################################################################
# post — 설치 후
###############################################################################
%post
systemctl daemon-reload
systemctl enable lumina-web.service 2>/dev/null || true

# 구(舊) 분리 유닛이 남아 있다면 정지/마스킹 — 단일 lumina-web 만 운용
for old_unit in blossom-web.service lumina-dashboard.service; do
    if systemctl list-unit-files | grep -q "^${old_unit}"; then
        systemctl stop "$old_unit" 2>/dev/null || true
        systemctl disable "$old_unit" 2>/dev/null || true
        systemctl mask "$old_unit" 2>/dev/null || true
    fi
done
rm -f /etc/systemd/system/blossom-web.service
rm -f /etc/systemd/system/lumina-dashboard.service
rm -rf /etc/systemd/system/lumina-web.service.d
# /etc/systemd/system 에 같은 이름 override 가 남아 있으면 RPM 유닛이 가려진다.
# (관리자가 수동 배치한 경우엔 그대로 두지만, 자동 머지 wrapper 가 동일 내용이면 제거 권장)
systemctl daemon-reload

echo ""
echo "================================================================"
echo " Blossom Lumina WEB — 단일 유닛 설치 완료 (lumina-web.service)"
echo "================================================================"
echo ""
echo " 필수 선제 조건 (이 패키지는 건드리지 않음):"
echo "   - /opt/blossom/web/                       (Asset Mgmt + Chat, python3.11 venv)"
echo "   - /opt/blossom/lumina/web/                (Dashboard, python3.11 venv 공유)"
echo "   - /etc/blossom/lumina/secure.env          (SECRET_KEY, DB 자격)"
echo "   - /etc/nginx/conf.d/lumina-web.conf       (nginx 설정)"
echo ""
echo " 서비스 재시작:"
echo "   systemctl restart lumina-web"
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
    echo "Lumina WEB 단일 유닛 패키지가 제거되었습니다."
fi

###############################################################################
# changelog
###############################################################################
%changelog
* Sun Apr 26 2026 Blossom Admin <admin@blossom.local> - 2.1.2-1
- wrapper: dashboard 도 /opt/blossom/web/venv (python3.11) 사용 — python3.6 의존성 제거
- nginx conf 파일명을 lumina-web.conf 로 통일 (post 메시지 갱신)
- 포트 80 사용 안 함 (정책): 443/9601 만 노출

* Sun Apr 26 2026 Blossom Admin <admin@blossom.local> - 2.1.1-1
- 패키지 범위 축소: 단일 systemd 유닛(lumina-web.service) + wrapper 만 제공
- 애플리케이션 코드(/opt/blossom/web, /opt/blossom/lumina/web) 미포함
- nginx 설정, web.conf, lumina-web 사용자 계정 생성 제거
- 기존 운영 환경의 dashboard / nginx 설정을 덮어쓰는 부작용 차단

* Sun Apr 26 2026 Blossom Admin <admin@blossom.local> - 2.1.0-1
- 단일 systemd 유닛 통합: Asset Mgmt + Chat + Dashboard 한 데몬에서 동반 기동
- /usr/local/bin/lumina-web-start.sh wrapper 추가 (두 gunicorn 동반 실행)
- blossom-web.service / lumina-dashboard.service 자동 정지·마스킹 (post)
- KillMode=mixed 로 cgroup 전체 종료 보장

* Sun Apr 06 2026 Blossom Admin <admin@blossom.local> - 2.0.0-1
- 보안 중심 3티어 아키텍처 재설계 (구버전)
