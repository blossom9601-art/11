"""Linux 네트워크 인터페이스 수집기 (tab04-interface)

`ip` 명령어로 NIC, IP, MAC 정보를 수집하고,
/sys/class/fc_host 에서 FC HBA WWN 정보를 수집한다.
"""

from __future__ import annotations

import os
import re
import subprocess
from typing import Any, Dict, List

import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.collector import BaseCollector


class InterfaceCollector(BaseCollector):
    name = "interfaces"

    def collect(self) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []

        # ── 1) 이더넷 네트워크 인터페이스 수집 ──
        try:
            raw = subprocess.check_output(
                ["ip", "-o", "addr", "show"], text=True, timeout=30
            )
        except (FileNotFoundError, subprocess.SubprocessError):
            raw = ""

        # 슬롯 정보 (PCI bus) 수집
        slot_map = self._collect_slots()

        # 연결 UUID 수집 (NetworkManager)
        uuid_map = self._collect_uuids()

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
                    "serial": uuid_map.get(iface_name, ""),
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

        # ── 2) FC HBA (Fibre Channel) 포트 수집 ──
        fc_hosts = self._collect_fc_hosts()
        results.extend(fc_hosts)

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

    def _collect_uuids(self) -> Dict[str, str]:
        """nmcli 기반 네트워크 연결 UUID 매핑 (DEVICE → UUID)"""
        uuid_map: Dict[str, str] = {}
        try:
            raw = subprocess.check_output(
                ["nmcli", "-t", "-f", "UUID,DEVICE", "connection", "show"],
                text=True, timeout=10, stderr=subprocess.DEVNULL,
            )
            for line in raw.strip().splitlines():
                parts = line.split(":", 1)
                if len(parts) == 2 and parts[1]:
                    uuid_map[parts[1]] = parts[0]
        except (FileNotFoundError, subprocess.SubprocessError):
            pass
        return uuid_map

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

    def _collect_fc_hosts(self) -> List[Dict[str, Any]]:
        """Fibre Channel HBA 포트 수집 (/sys/class/fc_host)"""
        results: List[Dict[str, Any]] = []
        fc_dir = "/sys/class/fc_host"
        try:
            if not os.path.isdir(fc_dir):
                return results
            for host in os.listdir(fc_dir):
                host_dir = os.path.join(fc_dir, host)
                port_name = self._read_sysfs(os.path.join(host_dir, "port_name"))
                node_name = self._read_sysfs(os.path.join(host_dir, "node_name"))
                port_state = self._read_sysfs(os.path.join(host_dir, "port_state"))
                # port_name 형식: 0x500143802426baf4 → 50:01:43:80:24:26:ba:f4
                wwpn = self._format_wwn(port_name)
                if wwpn:
                    results.append({
                        "slot": "",
                        "port": host,
                        "iface": host,
                        "serial": wwpn,
                        "ip_addresses": [],
                        "remark": f"HBA FC Port, state={port_state}" if port_state else "HBA FC Port",
                    })
        except OSError:
            pass
        return results

    @staticmethod
    def _read_sysfs(path: str) -> str:
        try:
            with open(path) as f:
                return f.read().strip()
        except (OSError, IOError):
            return ""

    @staticmethod
    def _format_wwn(raw: str) -> str:
        """0x500143802426baf4 → 50:01:43:80:24:26:BA:F4"""
        raw = raw.strip()
        if raw.startswith("0x") or raw.startswith("0X"):
            raw = raw[2:]
        raw = raw.upper()
        if len(raw) == 16:
            return ":".join(raw[i:i+2] for i in range(0, 16, 2))
        return raw
