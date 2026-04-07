"""Linux 패키지 수집기 (tab13-package)

rpm, dpkg, snap, flatpak 등 패키지 매니저별로 설치 패키지를 수집한다.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from typing import Any, Dict, List

try:
    from importlib.metadata import distributions as _distributions
except ImportError:
    _distributions = None

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.collector import BaseCollector


class PackageCollector(BaseCollector):
    name = "packages"

    def collect(self) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []

        # 1) RPM 기반 (RHEL, CentOS, Rocky, Fedora)
        if shutil.which("rpm"):
            results.extend(self._collect_rpm())

        # 2) DEB 기반 (Ubuntu, Debian)
        elif shutil.which("dpkg-query"):
            results.extend(self._collect_dpkg())

        # 3) APK (Alpine)
        elif shutil.which("apk"):
            results.extend(self._collect_apk())

        # 4) pip (Python)
        results.extend(self._collect_pip())

        # 5) snap
        if shutil.which("snap"):
            results.extend(self._collect_snap())

        return results

    # ── RPM ──────────────────────────────────────────────
    def _collect_rpm(self) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        try:
            raw = subprocess.check_output(
                ["rpm", "-qa", "--queryformat",
                 "%{NAME}\\t%{VERSION}-%{RELEASE}\\t%{VENDOR}\\t%{INSTALLTIME:date}\\t%{LICENSE}\\n"],
                text=True, timeout=60,
            )
        except (FileNotFoundError, subprocess.SubprocessError):
            return items

        for line in raw.strip().splitlines():
            parts = line.split("\t")
            if len(parts) < 5:
                continue
            name, version, vendor, installed, lic = parts[:5]
            items.append({
                "package_name": name,
                "version": version,
                "package_type": "RPM",
                "vendor": vendor if vendor != "(none)" else "",
                "installed": installed,
                "license": lic if lic != "(none)" else "",
            })
        return items

    # ── DPKG ─────────────────────────────────────────────
    def _collect_dpkg(self) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        try:
            raw = subprocess.check_output(
                ["dpkg-query", "-W", "-f",
                 "${Package}\\t${Version}\\t${Maintainer}\\t${Status}\\n"],
                text=True, timeout=60,
            )
        except (FileNotFoundError, subprocess.SubprocessError):
            return items

        for line in raw.strip().splitlines():
            parts = line.split("\t")
            if len(parts) < 4:
                continue
            name, version, maintainer, status = parts[:4]
            if "installed" not in status.lower():
                continue
            items.append({
                "package_name": name,
                "version": version,
                "package_type": "DEB",
                "vendor": maintainer,
                "installed": "",
                "license": "",
            })
        return items

    # ── APK (Alpine) ─────────────────────────────────────
    def _collect_apk(self) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        try:
            raw = subprocess.check_output(
                ["apk", "info", "-v"], text=True, timeout=60
            )
        except (FileNotFoundError, subprocess.SubprocessError):
            return items

        for line in raw.strip().splitlines():
            # "busybox-1.36.1-r2" → name=busybox, version=1.36.1-r2
            m = re.match(r"^(.+?)-(\d+\..*)$", line.strip())
            if m:
                items.append({
                    "package_name": m.group(1),
                    "version": m.group(2),
                    "package_type": "APK",
                    "vendor": "",
                    "installed": "",
                    "license": "",
                })
        return items

    # ── pip ───────────────────────────────────────────────
    def _collect_pip(self) -> List[Dict[str, Any]]:        # importlib.metadata 로 라이선스 정보 수집
        license_map: Dict[str, str] = {}
        if _distributions is not None:
            try:
                for dist in _distributions():
                    name = dist.metadata.get("Name", "")
                    lic = dist.metadata.get("License", "") or ""
                    if name and lic and lic.upper() != "UNKNOWN":
                        license_map[name.lower()] = lic.strip()
            except Exception:
                pass
        items: List[Dict[str, Any]] = []
        pip_cmd = shutil.which("pip3") or shutil.which("pip")
        if not pip_cmd:
            return items
        try:
            raw = subprocess.check_output(
                [pip_cmd, "list", "--format=columns"],
                text=True, timeout=60, stderr=subprocess.DEVNULL,
            )
        except (FileNotFoundError, subprocess.SubprocessError):
            return items

        for line in raw.strip().splitlines()[2:]:  # 헤더 2줄 건너뛰기
            parts = line.split()
            if len(parts) >= 2:
                pkg_name = parts[0]
                items.append({
                    "package_name": pkg_name,
                    "version": parts[1],
                    "package_type": "PIP",
                    "vendor": "",
                    "installed": "",
                    "license": license_map.get(pkg_name.lower(), ""),
                })
        return items

    # ── snap ──────────────────────────────────────────────
    def _collect_snap(self) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        try:
            raw = subprocess.check_output(
                ["snap", "list"], text=True, timeout=30
            )
        except (FileNotFoundError, subprocess.SubprocessError):
            return items

        for line in raw.strip().splitlines()[1:]:  # 헤더 건너뛰기
            parts = line.split()
            if len(parts) >= 4:
                items.append({
                    "package_name": parts[0],
                    "version": parts[1],
                    "package_type": "SNAP",
                    "vendor": parts[3],  # Publisher
                    "installed": "",
                    "license": "",
                })
        return items
