"""Windows 계정 수집기 (tab05-account)

WMI / net user 기반으로 로컬 사용자·그룹 정보를 수집한다.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from typing import Any, Dict, List

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.collector import BaseCollector


class AccountCollector(BaseCollector):
    name = "accounts"

    def collect(self) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []

        users = self._get_local_users()
        admin_members = self._get_admin_group_members()

        for user in users:
            name = user.get("Name", "")
            enabled = user.get("Enabled", False)
            description = user.get("Description", "")

            is_admin = name.lower() in {m.lower() for m in admin_members}

            # SID 기반 계정 구분
            sid_raw = user.get("SID", "")
            sid = sid_raw.get("Value", "") if isinstance(sid_raw, dict) else str(sid_raw)
            if sid.endswith("-500"):
                account_type = "관리자"
            elif is_admin:
                account_type = "관리자"
            else:
                account_type = "사용자"

            groups = self._get_user_groups(name)

            results.append({
                "status": "활성" if enabled else "비활성",
                "account_type": account_type,
                "account_name": name,
                "uid": 0,
                "group_name": ", ".join(groups) if groups else "",
                "gid": 0,
                "login_allowed": enabled,
                "admin_allowed": is_admin,
                "purpose": description,
                "remark": f"SID={sid}" if sid else "",
            })

        return results

    def _get_local_users(self) -> List[Dict[str, Any]]:
        ps_script = (
            "Get-LocalUser | Select-Object Name, Enabled, Description, SID | "
            "ConvertTo-Json -Compress"
        )
        return self._run_ps(ps_script)

    def _get_admin_group_members(self) -> List[str]:
        """Administrators 그룹 멤버 조회"""
        ps_script = (
            "try { "
            "  $members = Get-LocalGroupMember -Group 'Administrators' -ErrorAction Stop; "
            "  $members | ForEach-Object { $_.Name.Split('\\')[-1] } | ConvertTo-Json -Compress "
            "} catch { '[]' }"
        )
        data = self._run_ps(ps_script)
        if isinstance(data, list):
            return [str(x) for x in data]
        return []

    def _get_user_groups(self, username: str) -> List[str]:
        """특정 사용자가 속한 그룹 목록"""
        # net user 명령으로 그룹 목록 파싱
        try:
            raw = subprocess.check_output(
                ["net", "user", username],
                text=True, timeout=10, stderr=subprocess.DEVNULL,
            )
            groups = []
            in_group = False
            for line in raw.splitlines():
                if "그룹 구성원" in line or "Local Group Memberships" in line:
                    in_group = True
                    parts = line.split("*")[1:]
                    groups.extend(p.strip() for p in parts if p.strip())
                elif "Global Group" in line or "글로벌 그룹" in line:
                    in_group = True
                    parts = line.split("*")[1:]
                    groups.extend(p.strip() for p in parts if p.strip())
                elif in_group and line.startswith(" "):
                    parts = line.split("*")[1:]
                    groups.extend(p.strip() for p in parts if p.strip())
                elif in_group and not line.startswith(" "):
                    in_group = False
            return groups
        except (FileNotFoundError, subprocess.SubprocessError):
            return []

    def _run_ps(self, script: str) -> List[Dict[str, Any]]:
        try:
            raw = subprocess.check_output(
                ["powershell", "-NoProfile", "-Command", script],
                text=True, timeout=30, stderr=subprocess.DEVNULL,
            )
            data = json.loads(raw)
            if isinstance(data, dict):
                return [data]
            return data if isinstance(data, list) else []
        except (FileNotFoundError, subprocess.SubprocessError, json.JSONDecodeError):
            return []
