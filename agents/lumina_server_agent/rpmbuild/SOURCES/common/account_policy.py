"""계정 작업 정책 — Agent / Root Worker 공통 검증."""

import grp
import os
import pwd
import re
from typing import FrozenSet, Optional, Set, Tuple

USERNAME_PATTERN = re.compile(r"^[a-z_][a-z0-9_-]{0,31}$")

PROTECTED_USERNAMES = frozenset({
    "root", "bin", "daemon", "adm", "sys", "sync", "shutdown", "halt",
    "nobody", "sshd", "nginx", "apache", "mysql", "postgres", "oracle",
})

DEFAULT_MIN_OPERABLE_UID = 1000
DEFAULT_HOME_PREFIXES = ("/home", "/app")


def read_etc_shells(path: str = "/etc/shells") -> Set[str]:
    shells: Set[str] = set()
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                shells.add(line)
    except OSError:
        pass
    return shells


def normalize_home_prefixes(raw: str) -> Tuple[str, ...]:
    parts = [p.strip() for p in (raw or "").split(",") if p.strip()]
    return tuple(parts) if parts else DEFAULT_HOME_PREFIXES


def account_state_dict(username: str) -> Optional[dict]:
    """passwd 기준 스냅샷 (비밀번호 필드 없음). 없으면 None."""
    try:
        pw = pwd.getpwnam(username)
    except KeyError:
        return None
    try:
        gr = grp.getgrgid(pw.pw_gid)
        gname = gr.gr_name
    except KeyError:
        gname = str(pw.pw_gid)
    groups = []
    try:
        for g in grp.getgrall():
            if username in g.gr_mem or (g.gr_gid == pw.pw_gid and g.gr_name):
                groups.append(g.gr_name)
    except Exception:
        pass
    groups = sorted(set(groups))
    locked = None
    try:
        sp = "/etc/shadow"
        if os.path.isfile(sp) and os.access(sp, os.R_OK):
            with open(sp, encoding="utf-8", errors="replace") as sf:
                for line in sf:
                    parts = line.strip().split(":")
                    if len(parts) > 1 and parts[0] == username:
                        hashf = parts[1]
                        locked = hashf.startswith("!") or hashf.startswith("*")
                        break
    except OSError:
        locked = None
    return {
        "username": username,
        "uid": int(pw.pw_uid),
        "gid": int(pw.pw_gid),
        "primary_group": gname,
        "shell": pw.pw_shell or "",
        "home": pw.pw_dir or "",
        "groups": groups,
        "locked": locked,
    }


def is_service_exception(username: str, allowlist: FrozenSet[str]) -> bool:
    return username in allowlist


def policy_check_target_user(
    username: str,
    *,
    min_uid: int = DEFAULT_MIN_OPERABLE_UID,
    service_allowlist: Optional[FrozenSet[str]] = None,
) -> Optional[str]:
    """대상 사용자명/UID 정책. 거절 시 코드 문자열."""
    if not USERNAME_PATTERN.match(username):
        return "invalid_username_format"
    if username in PROTECTED_USERNAMES:
        return "protected_username"
    allow = frozenset(service_allowlist or ())
    try:
        pw = pwd.getpwnam(username)
        uid = int(pw.pw_uid)
        if uid == 0:
            return "uid_zero_forbidden"
        if uid < min_uid and not is_service_exception(username, allow):
            return "system_uid_forbidden"
    except KeyError:
        pass
    return None


def policy_check_shell(shell: str, shells: Set[str]) -> Optional[str]:
    if not shell:
        return "shell_required"
    if shell not in shells:
        return "shell_not_in_etc_shells"
    return None


def policy_check_home(home: str, prefixes: Tuple[str, ...]) -> Optional[str]:
    if not home or not home.startswith("/"):
        return "home_invalid"
    ok = any(home == p or home.startswith(p + "/") for p in prefixes)
    if not ok:
        return "home_prefix_forbidden"
    return None


def group_exists(name: str) -> bool:
    try:
        grp.getgrnam(name)
        return True
    except KeyError:
        return False
