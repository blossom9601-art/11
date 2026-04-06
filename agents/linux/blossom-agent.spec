%define name    lumina
%define version 1.0.0
%define release 1%{?dist}

Name:           %{name}
Version:        %{version}
Release:        %{release}
Summary:        Lumina 자산 자동 탐색 에이전트 (Linux)
License:        Proprietary
URL:            https://blossom.local
BuildArch:      noarch
Requires:       python3 >= 3.6

%description
호스트의 네트워크 인터페이스, 계정, 패키지 정보를 자동 수집하여
Blossom 서버로 전송하는 에이전트입니다.

%install
rm -rf %{buildroot}

# 에이전트 코드
install -d %{buildroot}/opt/lumina/common
install -d %{buildroot}/opt/lumina/linux/collectors

install -m 644 %{_sourcedir}/common/__init__.py   %{buildroot}/opt/lumina/common/
install -m 644 %{_sourcedir}/common/config.py     %{buildroot}/opt/lumina/common/
install -m 644 %{_sourcedir}/common/collector.py   %{buildroot}/opt/lumina/common/

install -m 644 %{_sourcedir}/linux/__init__.py     %{buildroot}/opt/lumina/linux/
install -m 755 %{_sourcedir}/linux/agent.py        %{buildroot}/opt/lumina/linux/
install -m 644 %{_sourcedir}/linux/collectors/__init__.py    %{buildroot}/opt/lumina/linux/collectors/
install -m 644 %{_sourcedir}/linux/collectors/interface.py   %{buildroot}/opt/lumina/linux/collectors/
install -m 644 %{_sourcedir}/linux/collectors/account.py     %{buildroot}/opt/lumina/linux/collectors/
install -m 644 %{_sourcedir}/linux/collectors/package.py     %{buildroot}/opt/lumina/linux/collectors/

# 설정 디렉터리
install -d %{buildroot}/etc/lumina
install -m 644 %{_sourcedir}/agent.conf.default    %{buildroot}/etc/lumina/lumina.conf

# systemd 유닛
install -d %{buildroot}/usr/lib/systemd/system
install -m 644 %{_sourcedir}/linux/blossom-agent.service %{buildroot}/usr/lib/systemd/system/lumina.service

# 로그 / 데이터 디렉터리
install -d %{buildroot}/var/log/lumina
install -d %{buildroot}/var/lib/lumina

%files
%defattr(-,root,root,-)
/opt/lumina/
%config(noreplace) /etc/lumina/lumina.conf
/usr/lib/systemd/system/lumina.service
%dir /var/log/lumina
%dir /var/lib/lumina

%pre
# RPM 설치 전 — 없으면 서비스 계정 생성
getent passwd lumina >/dev/null 2>&1 || \
    useradd -r -s /sbin/nologin -d /opt/lumina lumina

%post
systemctl daemon-reload
systemctl enable lumina.service
echo ""
echo "★ 설정 파일에서 서버 IP를 입력하세요:"
echo "  vi /etc/lumina/lumina.conf"
echo "  server_url = http://<서버IP>:8080/api/agent/upload"
echo ""
echo "'systemctl start lumina' 로 시작하세요."

%preun
if [ $1 -eq 0 ]; then
    systemctl stop lumina.service 2>/dev/null || true
    systemctl disable lumina.service 2>/dev/null || true
fi

%postun
systemctl daemon-reload

%changelog
* %(date "+%a %b %d %Y") Blossom Admin <admin@blossom.local> - 1.0.0-1
- 최초 릴리스
