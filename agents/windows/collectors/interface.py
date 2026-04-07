"""Windows 네트워크 인터페이스 수집기 (tab04-interface)

PowerShell / WMI 기반으로 NIC, IP, MAC 정보를 수집한다.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from typing import Any, Dict, List

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.collector import BaseCollector


class InterfaceCollector(BaseCollector):
    name = "interfaces"

    def collect(self) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []

        adapters = self._get_adapters()
        ip_config = self._get_ip_addresses()

        for adapter in adapters:
            iface_name = adapter.get("Name", "")
            if_index = adapter.get("InterfaceIndex")

            mac = adapter.get("MacAddress", "")
            status = adapter.get("Status", "")
            slot = adapter.get("PciSlot", "")

            # 해당 어댑터의 IP 주소 수집
            ip_addresses = []
            for ip in ip_config:
                if ip.get("InterfaceIndex") == if_index:
                    family = "IPv4" if ip.get("AddressFamily") == 2 else "IPv6"
                    ip_addresses.append({
                        "category": "Primary",
                        "ip_address": ip.get("IPAddress", ""),
                        "protocol": family,
                        "status": "활성" if status == "Up" else "비활성",
                    })

            results.append({
                "slot": slot,
                "port": str(if_index) if if_index else "",
                "iface": iface_name,
                "serial": mac,
                "ip_addresses": ip_addresses,
                "remark": f"Status={status}",
            })

        return results

    def _get_adapters(self) -> List[Dict[str, Any]]:
        """Get-NetAdapter 로 NIC 목록 수집"""
        ps_script = (
            "Get-NetAdapter | Select-Object Name, InterfaceIndex, MacAddress, Status, "
            "InterfaceDescription | ConvertTo-Json -Compress"
        )
        return self._run_ps(ps_script)

    def _get_ip_addresses(self) -> List[Dict[str, Any]]:
        """Get-NetIPAddress 로 IP 목록 수집"""
        ps_script = (
            "Get-NetIPAddress -ErrorAction SilentlyContinue | "
            "Select-Object InterfaceIndex, IPAddress, AddressFamily, PrefixLength | "
            "ConvertTo-Json -Compress"
        )
        return self._run_ps(ps_script)

    def _run_ps(self, script: str) -> List[Dict[str, Any]]:
        try:
            # Force UTF-8 output to avoid CP949 encoding issues with Korean names
            utf8_prefix = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; "
            raw = subprocess.check_output(
                ["powershell", "-NoProfile", "-Command", utf8_prefix + script],
                timeout=30, stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW,
            ).decode("utf-8")
            data = json.loads(raw)
            if isinstance(data, dict):
                return [data]
            return data if isinstance(data, list) else []
        except (FileNotFoundError, subprocess.SubprocessError, json.JSONDecodeError):
            return []
