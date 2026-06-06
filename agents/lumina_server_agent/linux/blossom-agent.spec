%define name    lumina-agent
%define version 1.2.1
%define release 1%{?dist}

Name:           %{name}
Version:        %{version}
Release:        %{release}
Summary:        Lumina Agent (Linux)
License:        Proprietary
URL:            https://blossom.local
BuildArch:      noarch
Requires:       python3 >= 3.6

%description
Lumina Agent for Linux.

%install
rm -rf %{buildroot}

# 에이전트 코드
install -d %{buildroot}/opt/lumina/common
install -d %{buildroot}/opt/lumina/linux/collectors

install -m 644 %{_sourcedir}/common/__init__.py   %{buildroot}/opt/lumina/common/
install -m 644 %{_sourcedir}/common/config.py     %{buildroot}/opt/lumina/common/
install -m 644 %{_sourcedir}/common/collector.py   %{buildroot}/opt/lumina/common/
install -m 644 %{_sourcedir}/common/account_worker_protocol.py %{buildroot}/opt/lumina/common/
install -m 644 %{_sourcedir}/common/account_policy.py %{buildroot}/opt/lumina/common/

install -m 644 %{_sourcedir}/linux/__init__.py     %{buildroot}/opt/lumina/linux/
install -m 755 %{_sourcedir}/linux/agent.py        %{buildroot}/opt/lumina/linux/
install -m 644 %{_sourcedir}/linux/account_worker_client.py %{buildroot}/opt/lumina/linux/
install -m 644 %{_sourcedir}/linux/account_dispatch.py %{buildroot}/opt/lumina/linux/
install -d %{buildroot}/opt/lumina/linux/root_worker
install -m 644 %{_sourcedir}/linux/root_worker/__init__.py %{buildroot}/opt/lumina/linux/root_worker/
install -m 644 %{_sourcedir}/linux/root_worker/executor.py %{buildroot}/opt/lumina/linux/root_worker/
install -m 755 %{_sourcedir}/linux/root_worker/main.py %{buildroot}/opt/lumina/linux/root_worker/
install -m 644 %{_sourcedir}/linux/collectors/__init__.py    %{buildroot}/opt/lumina/linux/collectors/
install -m 644 %{_sourcedir}/linux/collectors/interface.py   %{buildroot}/opt/lumina/linux/collectors/
install -m 644 %{_sourcedir}/linux/collectors/account.py     %{buildroot}/opt/lumina/linux/collectors/
install -m 644 %{_sourcedir}/linux/collectors/authority.py   %{buildroot}/opt/lumina/linux/collectors/
install -m 644 %{_sourcedir}/linux/collectors/firewalld.py   %{buildroot}/opt/lumina/linux/collectors/
install -m 644 %{_sourcedir}/linux/collectors/storage.py     %{buildroot}/opt/lumina/linux/collectors/
install -m 644 %{_sourcedir}/linux/collectors/package.py     %{buildroot}/opt/lumina/linux/collectors/
install -m 644 %{_sourcedir}/linux/collectors/performance.py %{buildroot}/opt/lumina/linux/collectors/

# 설정 디렉터리 (lumina user r/w)
install -d %{buildroot}/etc/lumina
install -m 640 %{_sourcedir}/agent.conf.default    %{buildroot}/etc/lumina/lumina.conf

# systemd 유닛
install -d %{buildroot}/usr/lib/systemd/system
install -m 644 %{_sourcedir}/linux/blossom-agent.service %{buildroot}/usr/lib/systemd/system/lumina-agent.service
install -m 644 %{_sourcedir}/linux/lumina-account-worker.service %{buildroot}/usr/lib/systemd/system/lumina-account-worker.service

# CLI wrapper
install -d %{buildroot}/usr/bin
install -m 755 %{_sourcedir}/linux/lumina-agent %{buildroot}/usr/bin/lumina-agent

# 로그 / 데이터 디렉터리
install -d %{buildroot}/var/log/lumina
install -d %{buildroot}/var/log/lumina-account
install -d %{buildroot}/var/lib/lumina

%files
%defattr(-,root,root,-)
/opt/lumina/
/usr/bin/lumina-agent
%attr(750,lumina,lumina) %dir /etc/lumina
%attr(640,lumina,lumina) %config(noreplace) /etc/lumina/lumina.conf
/usr/lib/systemd/system/lumina-agent.service
/usr/lib/systemd/system/lumina-account-worker.service
%attr(750,lumina,lumina) %dir /var/lib/lumina
%dir /var/log/lumina-account

%pre
# RPM 설치 전 — 없으면 서비스 계정·그룹 생성
getent passwd lumina >/dev/null 2>&1 || \
    useradd -r -s /sbin/nologin -d /opt/lumina lumina
getent group lumina-agent >/dev/null 2>&1 || groupadd -r lumina-agent
id -nG lumina 2>/dev/null | grep -qw lumina-agent || usermod -aG lumina-agent lumina 2>/dev/null || true

%post
# Ensure writable directories are owned by lumina
chown -R lumina:lumina /var/log/lumina /var/lib/lumina /etc/lumina 2>/dev/null || true
chmod 755 /var/log/lumina-account 2>/dev/null || true
systemctl daemon-reload
systemctl enable lumina-agent.service 2>/dev/null || true
systemctl enable lumina-account-worker.service 2>/dev/null || true
if [ $1 -eq 1 ]; then
    echo ""
    echo "  lumina-agent --setup   # 서버 연결 설정"
    echo "  systemctl start lumina-agent"
    echo "  # 계정 작업: conf에서 [account_worker] enabled=true 후"
    echo "  systemctl start lumina-account-worker"
    echo ""
fi

%preun
if [ $1 -eq 0 ]; then
    systemctl stop lumina-account-worker.service 2>/dev/null || true
    systemctl disable lumina-account-worker.service 2>/dev/null || true
    systemctl stop lumina-agent.service 2>/dev/null || true
    systemctl disable lumina-agent.service 2>/dev/null || true
fi

%postun
systemctl daemon-reload

%changelog
* %(date "+%a %b %d %Y") Blossom Admin <admin@blossom.local> - 1.2.1-1
- Performance collector, 1-minute default collection interval

* %(date "+%a %b %d %Y") Blossom Admin <admin@blossom.local> - 1.2.0-1
- Account Root Worker (UDS), account policy module, agent --account-request CLI
- [account_worker] config section, lumina-agent group for socket peer access

* %(date "+%a %b %d %Y") Blossom Admin <admin@blossom.local> - 1.0.3-1
- HTTPS only (HTTP removed), SSL context fix
- English-only CLI messages
- Directory ownership: /etc/lumina, /var/log/lumina, /var/lib/lumina -> lumina:lumina

* %(date "+%a %b %d %Y") Blossom Admin <admin@blossom.local> - 1.0.2-1
- Enterprise conf redesign: [server], [agent], [logging], [security], [network]
- Rotating file log, auth tokens, proxy, retry backoff, configurable timeouts

* %(date "+%a %b %d %Y") Blossom Admin <admin@blossom.local> - 1.0.0-1
- Initial release
