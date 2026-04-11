"""Linux 계정 수집기 (tab05-account)

/etc/passwd, /etc/group 파싱으로 시스템·사용자 계정을 수집한다.
"""

from __future__ import annotations

import grp
import os
import pwd
import subprocess
import sys
from typing import Any, Dict, List

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from common.collector import BaseCollector

# UID 기준: 1000 이상이면 사용자 계정, 미만이면 시스템 계정
_SYSTEM_UID_THRESHOLD = 1000

# root / wheel / sudo 그룹
_ADMIN_GROUPS = {"root", "wheel", "sudo", "adm"}


class AccountCollector(BaseCollector):
    name = "accounts"

    def collect(self) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        nologin_shells = {"/usr/sbin/nologin", "/bin/false", "/sbin/nologin"}

        # sudo 권한 보유 사용자 목록
        sudoers = self._get_sudoers()

        for pw in pwd.getpwall():
            uid = pw.pw_uid
            name = pw.pw_name
            shell = pw.pw_shell or ""
            gid = pw.pw_gid

            # 그룹명 조회
            try:
                group_name = grp.getgrgid(gid).gr_name
            except KeyError:
                group_name = str(gid)

            # 계정 구분
            account_type = "사용자" if uid >= _SYSTEM_UID_THRESHOLD else "관리자"
            if uid == 0:
                account_type = "관리자"

            # 로그인 가능 여부
            login_allowed = shell not in nologin_shells

            # 관리자 권한 여부
            admin_allowed = (
                uid == 0
                or name in sudoers
                or self._in_admin_group(name)
            )

            # 상태
            status = "활성" if login_allowed else "비활성"

            results.append({
                "status": status,
                "account_type": account_type,
                "account_name": name,
                "uid": uid,
                "group_name": group_name,
                "gid": gid,
                "login_allowed": login_allowed,
                "admin_allowed": admin_allowed,
                "purpose": "",
                "remark": f"shell={shell}",
            })

        return results

    def _in_admin_group(self, username: str) -> bool:
        """사용자가 admin 그룹에 속하는지 확인"""
        try:
            for g in grp.getgrall():
                if g.gr_name in _ADMIN_GROUPS and username in g.gr_mem:
                    return True
        except Exception:
            pass
        return False

    def _get_sudoers(self) -> set:
        """sudo -l 파싱 대신 /etc/sudoers, /etc/sudoers.d 를 읽어 사용자 목록 수집"""
        users = set()
        paths = ["/etc/sudoers"]
        sudoers_d = "/etc/sudoers.d"
        if os.path.isdir(sudoers_d):
            for name in os.listdir(sudoers_d):
                fp = os.path.join(sudoers_d, name)
                if os.path.isfile(fp):
                    paths.append(fp)

        for path in paths:
            try:
                with open(path, encoding="utf-8", errors="replace") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or line.startswith("Defaults"):
                            continue
                        # "username ALL=(ALL) ..." 패턴
                        parts = line.split()
                        if len(parts) >= 2 and "ALL" in line.upper():
                            candidate = parts[0]
                            if not candidate.startswith("%") and candidate.isalnum():
                                users.add(candidate)
            except (OSError, PermissionError):
                continue

        return users
