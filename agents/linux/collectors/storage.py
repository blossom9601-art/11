"""Linux 스토리지 수집기 (tab10-storage)

df/lsblk를 기반으로 파일시스템 용량과 블록 디바이스 정보를 수집한다.
"""

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
        rows.extend(self._collect_df())
        rows.extend(self._collect_lsblk())
        return rows

    def _collect_df(self) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        try:
            raw = subprocess.check_output(["df", "-PT"], text=True, timeout=20, stderr=subprocess.DEVNULL)
        except Exception:
            return rows

        lines = raw.splitlines()
        for line in lines[1:]:
            parts = line.split()
            if len(parts) < 7:
                continue
            filesystem, fstype, blocks, used, avail, usep, mount = parts[:7]
            rows.append({
                "category": "filesystem",
                "name": filesystem,
                "fs_type": fstype,
                "mount_point": mount,
                "size_kb": blocks,
                "used_kb": used,
                "avail_kb": avail,
                "used_pct": usep,
                "remark": "df -PT",
            })
        return rows

    def _collect_lsblk(self) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        try:
            raw = subprocess.check_output(
                ["lsblk", "-b", "-o", "NAME,TYPE,SIZE,FSTYPE,MOUNTPOINT,MODEL", "-P"],
                text=True,
                timeout=20,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            return rows

        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            fields = {}
            for token in line.split('" '):
                token = token.strip()
                if not token:
                    continue
                if token.endswith('"'):
                    token = token[:-1]
                if '="' in token:
                    k, v = token.split('="', 1)
                    fields[k] = v

            rows.append({
                "category": "block",
                "name": fields.get("NAME", ""),
                "device_type": fields.get("TYPE", ""),
                "size_bytes": fields.get("SIZE", ""),
                "fs_type": fields.get("FSTYPE", ""),
                "mount_point": fields.get("MOUNTPOINT", ""),
                "model": fields.get("MODEL", ""),
                "remark": "lsblk",
            })
        return rows