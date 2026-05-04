Name:           lumina-gate
Version:        1.3.13
Release:        1
Summary:        Lumina gate server (Linux) — API for PC LuminaGateAgent
License:        Proprietary
URL:            https://blossom.local
Group:          System Environment/Daemons
ExclusiveArch:  x86_64
Requires(post): systemd
Requires(preun): systemd
Requires(postun): systemd
Requires: openssl

%description
Lumina-gate is the Linux gateway server that exposes the API for Windows PC agents
(LuminaGateAgent): registration, policy, heartbeat, web-access logs, blocks, and exceptions.

The package installs CLI entry /usr/bin/lumina-gate (symlink) so operators can run:
lumina-gate list, lumina-gate push-sync, lumina-gate serve, lumina-gate check.

%prep

%build

%install
rm -rf %{buildroot}
install -d -m 0755 %{buildroot}/opt/lumina-gate
install -m 0755 %{_sourcedir}/lumina-gate %{buildroot}/opt/lumina-gate/lumina-gate

install -d -m 0755 %{buildroot}/usr/bin
ln -sf /opt/lumina-gate/lumina-gate %{buildroot}/usr/bin/lumina-gate

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
/usr/bin/lumina-gate
%dir /etc/lumina-gate
%config(noreplace) %attr(0640,root,root) /etc/lumina-gate/config.yaml
/etc/systemd/system/lumina-gate.service
%dir %attr(0750,root,root) /var/log/lumina-gate
%dir %attr(0750,root,root) /var/lib/lumina-gate

%post
systemctl daemon-reexec 2>/dev/null || true
systemctl daemon-reload 2>/dev/null || true
systemctl enable lumina-gate 2>/dev/null || true
systemctl restart lumina-gate 2>/dev/null || systemctl start lumina-gate 2>/dev/null || true

%preun
if [ "$1" -eq 0 ]; then
    systemctl stop lumina-gate 2>/dev/null || true
    systemctl disable lumina-gate 2>/dev/null || true
fi

%postun
systemctl daemon-reload 2>/dev/null || true

%changelog
* Sun May 03 2026 Lumina Admin <admin@blossom.local> - 1.3.10-1
- CLI list: fix framed table separators (avoid ++ column joints; closing rule).

* Sun May 03 2026 Lumina Admin <admin@blossom.local> - 1.3.9-1
- CLI/list: merge agent install+policy labels; timestamps use gate host local TZ; slim columns.

* Sun May 03 2026 Lumina Admin <admin@blossom.local> - 1.3.8-1
- CLI: English-only lumina-gate list/check/help; aligned table widths (east-asian); drop footer/meta noise.

* Sun May 03 2026 Lumina Admin <admin@blossom.local> - 1.3.7-1
- CLI: `lumina-gate list` default output is ASCII framed table; add --agents-format tsv.

* Sun May 03 2026 Lumina Admin <admin@blossom.local> - 1.3.6-1
- CLI: list column headers localized; doc sync.

* Sun May 03 2026 Lumina Admin <admin@blossom.local> - 1.3.5-1
- Packaging: preserve configured /etc/lumina-gate/config.yaml during upgrades.

* Sun May 03 2026 Lumina Admin <admin@blossom.local> - 1.3.4-1
- Diagnostics: show web_sync URL/token state in `lumina-gate check`.
- Package config: prefill WEB sync URL/TLS mode while keeping the shared token blank.

* Sun May 03 2026 Lumina Admin <admin@blossom.local> - 1.3.3-1
- CLI: lumina-gate check (local TCP + HTTPS ping + agents.json registration count).

* Sun May 03 2026 Lumina Admin <admin@blossom.local> - 1.3.2-1
- HTTPS only: tls listen; auto self-signed certs under /etc/lumina-gate/tls if missing.

* Sun May 03 2026 Lumina Admin <admin@blossom.local> - 1.3.1-1
- Clear message when listen port is already held (e.g. systemd service running).

* Sun May 03 2026 Lumina Admin <admin@blossom.local> - 1.3.0-1
- CLI: /usr/bin/lumina-gate symlink; systemd runs "lumina-gate serve".

* Sat May 02 2026 Lumina Admin <admin@blossom.local> - 1.0.0-1
- Initial lumina-gate package.
