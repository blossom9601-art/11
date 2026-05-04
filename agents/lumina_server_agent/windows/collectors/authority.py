"""Windows 권한 수집기 (tab06-authority)

로컬 Administrators 그룹과 UAC 상태를 수집한다.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from typing import Any, Dict, List

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.collector import BaseCollector


class AuthorityCollector(BaseCollector):
    name = "authorities"

    def collect(self) -> List[Dict[str, Any]]:
        members = self._get_admin_members()
        uac = self._get_uac_status()
        return [
            {
                "category": "group",
                "authority_name": "Administrators",
                "enabled": True,
                "members": members,
                "count": len(members),
                "remark": "로컬 관리자 그룹",
            },
            {
                "category": "policy",
                "authority_name": "uac",
                "enabled": uac != "disabled",
                "members": [],
                "count": 0,
                "remark": uac,
            },
        ]

    def _get_admin_members(self) -> List[str]:
        script = (
            "try { "
            "Get-LocalGroupMember -Group 'Administrators' -ErrorAction Stop | "
            "ForEach-Object { $_.Name } | ConvertTo-Json -Compress "
            "} catch { '[]' }"
        )
        data = self._run_ps(script)
        if isinstance(data, list):
            return [str(x) for x in data]
        return []

    def _get_uac_status(self) -> str:
        script = (
            "$v = Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' "
            "-Name EnableLUA -ErrorAction SilentlyContinue; "
            "if ($null -eq $v) { 'unknown' } elseif ($v.EnableLUA -eq 1) { 'enabled' } else { 'disabled' }"
        )
        out = self._run_ps_raw(script).strip().lower()
        return out or "unknown"

    def _run_ps(self, script: str):
        try:
            raw = subprocess.check_output(
                ["powershell", "-NoProfile", "-Command", script],
                text=True,
                timeout=20,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            return json.loads(raw)
        except Exception:
            return []

    def _run_ps_raw(self, script: str) -> str:
        try:
            return subprocess.check_output(
                ["powershell", "-NoProfile", "-Command", script],
                text=True,
                timeout=20,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
        except Exception:
            return ""