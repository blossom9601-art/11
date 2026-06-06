"""Windows performance collector for the server performance tab."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from typing import Any, Dict, List

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.collector import BaseCollector


class PerformanceCollector(BaseCollector):
    name = "performance"

    def collect(self) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        rows.extend(self._cpu())
        rows.extend(self._memory())
        rows.extend(self._filesystems())
        return rows

    def _cpu(self) -> List[Dict[str, Any]]:
        script = (
            "Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | "
            "Measure-Object -Property LoadPercentage -Average | "
            "Select-Object Average | ConvertTo-Json -Compress"
        )
        data = self._run_ps(script)
        if not data:
            return []
        avg = data[0].get("Average")
        try:
            usage = float(avg)
        except Exception:
            return []
        return [{
            "metric_type": "cpu",
            "target": "system",
            "usage_pct": round(max(0.0, min(100.0, usage)), 2),
            "used_bytes": None,
            "total_bytes": None,
        }]

    def _memory(self) -> List[Dict[str, Any]]:
        script = (
            "Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue | "
            "Select-Object TotalVisibleMemorySize,FreePhysicalMemory | ConvertTo-Json -Compress"
        )
        data = self._run_ps(script)
        if not data:
            return []
        item = data[0]
        try:
            total = int(item.get("TotalVisibleMemorySize") or 0) * 1024
            free = int(item.get("FreePhysicalMemory") or 0) * 1024
        except Exception:
            return []
        if total <= 0:
            return []
        used = max(total - free, 0)
        return [{
            "metric_type": "memory",
            "target": "system",
            "usage_pct": round((used * 100.0) / total, 2),
            "used_bytes": used,
            "total_bytes": total,
        }]

    def _filesystems(self) -> List[Dict[str, Any]]:
        script = (
            "Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" -ErrorAction SilentlyContinue | "
            "Select-Object DeviceID,Size,FreeSpace | ConvertTo-Json -Compress"
        )
        rows: List[Dict[str, Any]] = []
        for item in self._run_ps(script):
            try:
                total = int(item.get("Size") or 0)
                free = int(item.get("FreeSpace") or 0)
            except Exception:
                continue
            if total <= 0:
                continue
            used = max(total - free, 0)
            rows.append({
                "metric_type": "filesystem",
                "target": item.get("DeviceID") or "",
                "usage_pct": round((used * 100.0) / total, 2),
                "used_bytes": used,
                "total_bytes": total,
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
