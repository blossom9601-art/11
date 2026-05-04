"""Linux 방화벽 수집기 (tab08-firewalld)

firewalld가 있으면 zone/services/ports를, 없으면 iptables 룰 개요를 수집한다.
"""

import os
import shutil
import subprocess
import sys
from typing import Any, Dict, List

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.collector import BaseCollector


class FirewalldCollector(BaseCollector):
    name = "firewalld"

    def collect(self) -> List[Dict[str, Any]]:
        if shutil.which("firewall-cmd"):
            rows = self._collect_firewalld()
            if rows:
                return rows
        return self._collect_iptables()

    def _collect_firewalld(self) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        zones = self._run(["firewall-cmd", "--get-active-zones"])
        if not zones:
            return rows

        zone_names = []
        for line in zones.splitlines():
            name = line.strip().split()[0] if line.strip() else ""
            if name:
                zone_names.append(name)

        for zone in zone_names:
            services = self._run(["firewall-cmd", "--zone", zone, "--list-services"]).strip()
            ports = self._run(["firewall-cmd", "--zone", zone, "--list-ports"]).strip()
            interfaces = self._run(["firewall-cmd", "--zone", zone, "--list-interfaces"]).strip()
            rows.append({
                "engine": "firewalld",
                "zone": zone,
                "interfaces": interfaces.split() if interfaces else [],
                "services": services.split() if services else [],
                "ports": ports.split() if ports else [],
                "rule_summary": "zone policy",
            })
        return rows

    def _collect_iptables(self) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        if not shutil.which("iptables"):
            return rows
        raw = self._run(["iptables", "-S"])
        if not raw:
            return rows

        for line in raw.splitlines():
            s = line.strip()
            if not s:
                continue
            rows.append({
                "engine": "iptables",
                "zone": "",
                "interfaces": [],
                "services": [],
                "ports": [],
                "rule_summary": s,
            })
        return rows

    def _run(self, cmd: List[str]) -> str:
        try:
            return subprocess.check_output(cmd, text=True, timeout=20, stderr=subprocess.DEVNULL)
        except Exception:
            return ""