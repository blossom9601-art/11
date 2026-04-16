"""Windows 스토리지 수집기 (tab10-storage)

논리 디스크와 물리 디스크 정보를 수집한다.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from typing import Any, Dict, List

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.collector import BaseCollector


class StorageCollector(BaseCollector):
    name = "storage"

    def collect(self) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        rows.extend(self._collect_logical_disks())
        rows.extend(self._collect_physical_disks())
        return rows

    def _collect_logical_disks(self) -> List[Dict[str, Any]]:
        script = (
            "Get-CimInstance Win32_LogicalDisk -ErrorAction SilentlyContinue | "
            "Select-Object DeviceID, DriveType, FileSystem, Size, FreeSpace, VolumeName | "
            "ConvertTo-Json -Compress"
        )
        raw = self._run_ps(script)
        rows: List[Dict[str, Any]] = []
        for item in raw:
            size = int(item.get("Size") or 0)
            free = int(item.get("FreeSpace") or 0)
            used = max(size - free, 0)
            used_pct = (int((used * 100) / size) if size > 0 else 0)
            rows.append({
                "category": "filesystem",
                "name": item.get("DeviceID", ""),
                "fs_type": item.get("FileSystem", ""),
                "mount_point": item.get("DeviceID", ""),
                "size_kb": str(size // 1024),
                "used_kb": str(used // 1024),
                "avail_kb": str(free // 1024),
                "used_pct": "%d%%" % used_pct,
                "remark": item.get("VolumeName", ""),
            })
        return rows

    def _collect_physical_disks(self) -> List[Dict[str, Any]]:
        script = (
            "Get-PhysicalDisk -ErrorAction SilentlyContinue | "
            "Select-Object FriendlyName, MediaType, Size, BusType, HealthStatus | "
            "ConvertTo-Json -Compress"
        )
        raw = self._run_ps(script)
        rows: List[Dict[str, Any]] = []
        for item in raw:
            rows.append({
                "category": "block",
                "name": item.get("FriendlyName", ""),
                "device_type": item.get("MediaType", ""),
                "size_bytes": str(item.get("Size") or ""),
                "fs_type": "",
                "mount_point": "",
                "model": item.get("BusType", ""),
                "remark": item.get("HealthStatus", ""),
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