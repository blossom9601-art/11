"""Linux performance collector for the server performance tab."""

from __future__ import annotations

import os
import shutil
import sys
import time
from typing import Any, Dict, List, Tuple

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.collector import BaseCollector


class PerformanceCollector(BaseCollector):
    name = "performance"

    def collect(self) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        cpu = self._cpu_usage()
        if cpu is not None:
            rows.append({
                "metric_type": "cpu",
                "target": "system",
                "usage_pct": round(cpu, 2),
                "used_bytes": None,
                "total_bytes": None,
            })
        mem = self._memory_usage()
        if mem:
            rows.append(mem)
        rows.extend(self._filesystems())
        return rows

    def _read_cpu(self) -> Tuple[int, int] | None:
        try:
            with open("/proc/stat", "r", encoding="utf-8") as f:
                parts = f.readline().split()[1:]
            vals = [int(v) for v in parts]
            idle = vals[3] + (vals[4] if len(vals) > 4 else 0)
            total = sum(vals)
            return idle, total
        except Exception:
            return None

    def _cpu_usage(self) -> float | None:
        first = self._read_cpu()
        if not first:
            return None
        time.sleep(0.2)
        second = self._read_cpu()
        if not second:
            return None
        idle_delta = second[0] - first[0]
        total_delta = second[1] - first[1]
        if total_delta <= 0:
            return None
        return max(0.0, min(100.0, 100.0 * (1.0 - (idle_delta / float(total_delta)))))

    def _memory_usage(self) -> Dict[str, Any] | None:
        try:
            data = {}
            with open("/proc/meminfo", "r", encoding="utf-8") as f:
                for line in f:
                    key, raw = line.split(":", 1)
                    data[key] = int(raw.strip().split()[0]) * 1024
            total = int(data.get("MemTotal") or 0)
            available = int(data.get("MemAvailable") or 0)
            used = max(total - available, 0)
            usage = (used * 100.0 / total) if total else 0.0
            return {
                "metric_type": "memory",
                "target": "system",
                "usage_pct": round(usage, 2),
                "used_bytes": used,
                "total_bytes": total,
            }
        except Exception:
            return None

    def _filesystems(self) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        excluded = {
            "proc", "sysfs", "devtmpfs", "devpts", "tmpfs", "securityfs", "cgroup",
            "cgroup2", "pstore", "autofs", "debugfs", "mqueue", "hugetlbfs", "tracefs",
            "overlay", "squashfs",
        }
        seen = set()
        try:
            with open("/proc/mounts", "r", encoding="utf-8") as f:
                mounts = [line.split()[:3] for line in f if line.strip()]
        except Exception:
            mounts = []
        for _device, mount, fstype in mounts:
            if fstype in excluded or mount in seen:
                continue
            seen.add(mount)
            try:
                usage = shutil.disk_usage(mount)
            except Exception:
                continue
            if usage.total <= 0:
                continue
            used = usage.total - usage.free
            rows.append({
                "metric_type": "filesystem",
                "target": mount,
                "usage_pct": round((used * 100.0) / usage.total, 2),
                "used_bytes": used,
                "total_bytes": usage.total,
            })
        return rows
