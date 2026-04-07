"""Windows 패키지 수집기 (tab13-package)

레지스트리 (Uninstall 키) 기반으로 설치된 프로그램을 수집한다.
"""

from __future__ import annotations

import json
import os
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

        # 1) 레지스트리 기반 프로그램 목록
        results.extend(self._collect_registry())

        # 2) pip (Python)
        results.extend(self._collect_pip())

        return results

    def _collect_registry(self) -> List[Dict[str, Any]]:
        """레지스트리 Uninstall 키에서 설치 프로그램 수집"""
        ps_script = r"""
$paths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$items = foreach ($p in $paths) {
    Get-ItemProperty $p -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName } |
    Select-Object @{N='Name';E={$_.DisplayName}},
                  @{N='Version';E={$_.DisplayVersion}},
                  @{N='Publisher';E={$_.Publisher}},
                  @{N='InstallDate';E={$_.InstallDate}},
                  @{N='InstallType';E={
                      if ($_.WindowsInstaller -eq 1) {'MSI'} else {'EXE'}
                  }}
}
$items | Sort-Object Name -Unique | ConvertTo-Json -Compress
"""
        items: List[Dict[str, Any]] = []
        raw_list = self._run_ps(ps_script)

        seen = set()
        for entry in raw_list:
            name = entry.get("Name", "")
            if not name or name in seen:
                continue
            seen.add(name)

            # InstallDate: "20240315" → "2024-03-15"
            raw_date = str(entry.get("InstallDate", "") or "")
            installed = ""
            if len(raw_date) == 8 and raw_date.isdigit():
                installed = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}"

            items.append({
                "package_name": name,
                "version": entry.get("Version", "") or "",
                "package_type": entry.get("InstallType", "EXE"),
                "vendor": entry.get("Publisher", "") or "",
                "installed": installed,
                "license": "",
            })

        return items

    def _collect_pip(self) -> List[Dict[str, Any]]:
        """pip list 로 Python 패키지 수집"""
        # importlib.metadata 로 라이선스 정보 수집
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
        for pip_cmd in ["pip3", "pip"]:
            try:
                raw = subprocess.check_output(
                    [pip_cmd, "list", "--format=json"],
                    text=True, timeout=60, stderr=subprocess.DEVNULL,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
                data = json.loads(raw)
                for pkg in data:
                    pkg_name = pkg.get("name", "")
                    items.append({
                        "package_name": pkg_name,
                        "version": pkg.get("version", ""),
                        "package_type": "PIP",
                        "vendor": "",
                        "installed": "",
                        "license": license_map.get(pkg_name.lower(), ""),
                    })
                break  # pip3 성공하면 pip 건너뛰기
            except (FileNotFoundError, subprocess.SubprocessError, json.JSONDecodeError):
                continue
        return items

    def _run_ps(self, script: str) -> List[Dict[str, Any]]:
        try:
            raw = subprocess.check_output(
                ["powershell", "-NoProfile", "-Command", script],
                text=True, timeout=60, stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            data = json.loads(raw)
            if isinstance(data, dict):
                return [data]
            return data if isinstance(data, list) else []
        except (FileNotFoundError, subprocess.SubprocessError, json.JSONDecodeError):
            return []
