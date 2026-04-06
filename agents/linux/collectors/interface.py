"""Linux 네트워크 인터페이스 수집기 (tab04-interface)

`ip` 명령어로 NIC, IP, MAC 정보를 수집한다.
"""

from __future__ import annotations

import re
import subprocess
from typing import Any, Dict, List

import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.collector import BaseCollector


class InterfaceCollector(BaseCollector):
    name = "interfaces"

    def collect(self) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []

        # ip -o addr show 로 인터페이스 정보 수집
        try:
            raw = subprocess.check_output(
                ["ip", "-o", "addr", "show"], text=True, timeout=30
            )
        except (FileNotFoundError, subprocess.SubprocessError):
            return results

        # 슬롯 정보 (PCI bus) 수집
        slot_map = self._collect_slots()

        seen: dict[str, Dict[str, Any]] = {}

        for line in raw.strip().splitlines():
            parsed = self._parse_ip_line(line)
            if not parsed:
                continue

            iface_name = parsed["iface"]
            if iface_name == "lo":
                continue

            if iface_name not in seen:
                mac = self._get_mac(iface_name)
                seen[iface_name] = {
                    "slot": slot_map.get(iface_name, ""),
                    "port": "",
                    "iface": iface_name,
                    "serial": mac,
                    "ip_addresses": [],
                    "remark": "",
                }

            ip_entry = {
                "category": "Primary",
                "ip_address": parsed["ip"],
                "protocol": "IPv4" if parsed["family"] == "inet" else "IPv6",
                "status": "활성",
            }
            seen[iface_name]["ip_addresses"].append(ip_entry)

        results = list(seen.values())
        return results

    def _parse_ip_line(self, line: str) -> Dict[str, str] | None:
        # 형식: "2: eth0    inet 10.0.0.5/24 brd 10.0.0.255 scope global eth0"
        m = re.match(
            r"\d+:\s+(\S+)\s+(inet6?)\s+([^\s/]+)/(\d+)", line
        )
        if not m:
            return None
        return {
            "iface": m.group(1),
            "family": m.group(2),
            "ip": m.group(3),
            "prefix": m.group(4),
        }

    def _get_mac(self, iface: str) -> str:
        path = f"/sys/class/net/{iface}/address"
        try:
            with open(path) as f:
                return f.read().strip().upper()
        except (OSError, IOError):
            return ""

    def _collect_slots(self) -> Dict[str, str]:
        """lspci + /sys/class/net 기반 PCI 슬롯 매핑"""
        slot_map: Dict[str, str] = {}
        net_dir = "/sys/class/net"
        try:
            for iface in os.listdir(net_dir):
                device_link = os.path.join(net_dir, iface, "device")
                if os.path.islink(device_link):
                    real = os.path.realpath(device_link)
                    # PCI 주소: 마지막 경로 요소 (예: 0000:03:00.0)
                    pci_addr = os.path.basename(real)
                    slot_map[iface] = pci_addr
        except OSError:
            pass
        return slot_map
