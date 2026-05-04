"""Windows 방화벽 수집기 (tab08-firewalld)

활성화된 Windows Defender Firewall 규칙을 요약 수집한다.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from typing import Any, Dict, List

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.collector import BaseCollector


class FirewalldCollector(BaseCollector):
    name = "firewalld"

    def collect(self) -> List[Dict[str, Any]]:
        script = (
            "Get-NetFirewallRule -Enabled True -ErrorAction SilentlyContinue | "
            "Select-Object -First 300 DisplayName, Direction, Action, Profile | "
            "ConvertTo-Json -Compress"
        )
        raw = self._run_ps(script)
        rows: List[Dict[str, Any]] = []
        for item in raw:
            rows.append({
                "engine": "windows-firewall",
                "zone": str(item.get("Profile", "") or ""),
                "interfaces": [],
                "services": [],
                "ports": [],
                "rule_summary": "%s | %s | %s" % (
                    item.get("Direction", ""),
                    item.get("Action", ""),
                    item.get("DisplayName", ""),
                ),
            })
        return rows

    def _run_ps(self, script: str) -> List[Dict[str, Any]]:
        try:
            raw = subprocess.check_output(
                ["powershell", "-NoProfile", "-Command", script],
                text=True,
                timeout=30,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            data = json.loads(raw)
            if isinstance(data, dict):
                return [data]
            return data if isinstance(data, list) else []
        except Exception:
            return []