"""Linux 권한 수집기 (tab06-authority)

sudoers 설정, 관리자 그룹 멤버, SELinux/AppArmor 상태를 수집한다.
"""

import os
import grp
import pwd
import subprocess
import sys
from typing import Any, Dict, List

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.collector import BaseCollector


class AuthorityCollector(BaseCollector):
    name = "authorities"

    def collect(self) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []

        admin_groups = ["sudo", "wheel", "adm", "root"]
        for gname in admin_groups:
            members = self._group_members(gname)
            rows.append({
                "category": "group",
                "authority_name": gname,
                "enabled": True,
                "members": members,
                "count": len(members),
                "remark": "관리자 그룹",
            })

        sudo_rules = self._parse_sudoers_users()
        for user in sudo_rules:
            rows.append({
                "category": "sudoers",
                "authority_name": user,
                "enabled": True,
                "members": [user],
                "count": 1,
                "remark": "sudoers 직접 규칙",
            })

        selinux = self._selinux_status()
        rows.append({
            "category": "policy",
            "authority_name": "selinux",
            "enabled": selinux != "disabled",
            "members": [],
            "count": 0,
            "remark": selinux,
        })

        apparmor = self._apparmor_status()
        rows.append({
            "category": "policy",
            "authority_name": "apparmor",
            "enabled": apparmor != "disabled",
            "members": [],
            "count": 0,
            "remark": apparmor,
        })

        return rows

    def _group_members(self, group_name: str) -> List[str]:
        try:
            g = grp.getgrnam(group_name)
        except KeyError:
            return []

        members = set(g.gr_mem or [])
        try:
            for p in pwd.getpwall():
                if p.pw_gid == g.gr_gid:
                    members.add(p.pw_name)
        except Exception:
            pass
        return sorted(members)

    def _parse_sudoers_users(self) -> List[str]:
        users = set()
        paths = ["/etc/sudoers"]
        sudoers_d = "/etc/sudoers.d"
        if os.path.isdir(sudoers_d):
            try:
                for fname in os.listdir(sudoers_d):
                    fpath = os.path.join(sudoers_d, fname)
                    if os.path.isfile(fpath):
                        paths.append(fpath)
            except OSError:
                pass

        for path in paths:
            try:
                with open(path, encoding="utf-8", errors="replace") as f:
                    for raw in f:
                        line = raw.strip()
                        if not line or line.startswith("#") or line.startswith("Defaults"):
                            continue
                        token = line.split()[0]
                        if token.startswith("%"):
                            continue
                        if token.replace("_", "").replace("-", "").isalnum() and "ALL" in line.upper():
                            users.add(token)
            except (OSError, PermissionError):
                continue
        return sorted(users)

    def _selinux_status(self) -> str:
        try:
            out = subprocess.check_output(["getenforce"], text=True, timeout=5, stderr=subprocess.DEVNULL).strip()
            return out.lower() or "unknown"
        except Exception:
            return "disabled"

    def _apparmor_status(self) -> str:
        try:
            out = subprocess.check_output(["aa-status"], text=True, timeout=10, stderr=subprocess.DEVNULL)
            low = out.lower()
            if "profiles are in enforce mode" in low:
                return "enforce"
            if "profiles are in complain mode" in low:
                return "complain"
            return "enabled"
        except Exception:
            return "disabled"