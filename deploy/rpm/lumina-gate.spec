Name:           lumina-gate
Version:        1.0.0
Release:        1
Summary:        Lumina PC Agent Gateway API Server
License:        Proprietary
URL:            https://blossom.local
Group:          System Environment/Daemons
ExclusiveArch:  x86_64
Requires(post): systemd
Requires(preun): systemd
Requires(postun): systemd

%description
Lumina-gate is the PC Agent Gateway API Server for LuminaGateAgent.
It handles PC agent registration, policy delivery, heartbeat, web-access logs,
block logs, and exception requests.

%prep

%build

%install
rm -rf %{buildroot}
install -d -m 0755 %{buildroot}/opt/lumina-gate
install -m 0755 %{_sourcedir}/lumina-gate %{buildroot}/opt/lumina-gate/lumina-gate

install -d -m 0755 %{buildroot}/etc/lumina-gate
install -m 0640 %{_sourcedir}/config.yaml %{buildroot}/etc/lumina-gate/config.yaml

install -d -m 0755 %{buildroot}/etc/systemd/system
install -m 0644 %{_sourcedir}/lumina-gate.service %{buildroot}/etc/systemd/system/lumina-gate.service

install -d -m 0750 %{buildroot}/var/log/lumina-gate
install -d -m 0750 %{buildroot}/var/lib/lumina-gate

%files
%defattr(-,root,root,-)
%dir /opt/lumina-gate
%attr(0755,root,root) /opt/lumina-gate/lumina-gate
%dir /etc/lumina-gate
%config %attr(0640,root,root) /etc/lumina-gate/config.yaml
/etc/systemd/system/lumina-gate.service
%dir %attr(0750,root,root) /var/log/lumina-gate
%dir %attr(0750,root,root) /var/lib/lumina-gate

%post
systemctl daemon-reexec 2>/dev/null || true
systemctl daemon-reload 2>/dev/null || true
systemctl enable lumina-gate 2>/dev/null || true
systemctl start lumina-gate 2>/dev/null || true

%preun
if [ "$1" -eq 0 ]; then
    systemctl stop lumina-gate 2>/dev/null || true
    systemctl disable lumina-gate 2>/dev/null || true
fi

%postun
systemctl daemon-reload 2>/dev/null || true

%changelog
* Sat May 02 2026 Lumina Admin <admin@blossom.local> - 1.0.0-1
- Initial lumina-gate package.