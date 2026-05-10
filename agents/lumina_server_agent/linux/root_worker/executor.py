"""execve 스타일 계정 작업 — shell 미사용 (argv 리스트만)."""

import os
import shutil
import subprocess
from typing import Any, Dict, List, Optional, Tuple


class ExecResult(object):
    def __init__(self, ok, exit_code, stdout, stderr, argv):
        self.ok = ok
        self.exit_code = exit_code
        self.stdout = stdout
        self.stderr = stderr
        self.argv = argv


def _which(name: str, candidates: Tuple[str, ...]) -> Optional[str]:
    for c in candidates:
        if os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return shutil.which(name)


def _run(argv: List[str], timeout: int, stdin_bytes: Optional[bytes] = None) -> ExecResult:
    try:
        p = subprocess.run(
            argv,
            input=stdin_bytes,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
        ok = p.returncode == 0
        out = (p.stdout or b"").decode("utf-8", errors="replace")[-8000:]
        err = (p.stderr or b"").decode("utf-8", errors="replace")[-8000:]
        return ExecResult(ok, int(p.returncode), out, err, argv)
    except subprocess.TimeoutExpired:
        return ExecResult(False, -9, "", "timeout", argv)
    except OSError as e:
        return ExecResult(False, -1, "", str(e), argv)


def create_user(
    username: str,
    shell: str,
    home: Optional[str],
    primary_group: Optional[str],
    extra_groups: Optional[str],
    timeout: int,
) -> ExecResult:
    useradd = _which("useradd", ("/usr/sbin/useradd", "/sbin/useradd"))
    if not useradd:
        return ExecResult(False, -1, "", "useradd not found", ["useradd"])
    args = [useradd, "-m", "-s", shell]
    if home:
        args.extend(["-d", home])
    if primary_group:
        args.extend(["-g", primary_group])
    if extra_groups:
        args.extend(["-G", extra_groups])
    args.append(username)
    return _run(args, timeout)


def delete_user(username: str, remove_home: bool, timeout: int) -> ExecResult:
    userdel = _which("userdel", ("/usr/sbin/userdel", "/sbin/userdel"))
    if not userdel:
        return ExecResult(False, -1, "", "userdel not found", ["userdel"])
    args = [userdel]
    if remove_home:
        args.append("-r")
    args.append(username)
    return _run(args, timeout)


def lock_user(username: str, timeout: int) -> ExecResult:
    usermod = _which("usermod", ("/usr/sbin/usermod", "/sbin/usermod"))
    if not usermod:
        return ExecResult(False, -1, "", "usermod not found", ["usermod"])
    return _run([usermod, "-L", username], timeout)


def unlock_user(username: str, timeout: int) -> ExecResult:
    usermod = _which("usermod", ("/usr/sbin/usermod", "/sbin/usermod"))
    if not usermod:
        return ExecResult(False, -1, "", "usermod not found", ["usermod"])
    return _run([usermod, "-U", username], timeout)


def change_password(username: str, password: str, timeout: int) -> ExecResult:
    chpasswd = _which("chpasswd", ("/usr/sbin/chpasswd", "/sbin/chpasswd"))
    if not chpasswd:
        return ExecResult(False, -1, "", "chpasswd not found", ["chpasswd"])
    line = ("%s:%s\n" % (username, password)).encode("utf-8")
    return _run([chpasswd], timeout, stdin_bytes=line)


def expire_password(
    username: str,
    payload: Dict[str, Any],
    timeout: int,
) -> ExecResult:
    chage = _which("chage", ("/usr/bin/chage", "/sbin/chage"))
    if not chage:
        return ExecResult(False, -1, "", "chage not found", ["chage"])
    args = [chage]
    if payload.get("lastday") is not None:
        args.extend(["-d", str(payload["lastday"])])
    if payload.get("mindays") is not None:
        args.extend(["-m", str(payload["mindays"])])
    if payload.get("maxdays") is not None:
        args.extend(["-M", str(payload["maxdays"])])
    if payload.get("inactive") is not None:
        args.extend(["-I", str(payload["inactive"])])
    if payload.get("expiredate") is not None:
        args.extend(["-E", str(payload["expiredate"])])
    args.append(username)
    return _run(args, timeout)


def add_group_member(username: str, group: str, timeout: int) -> ExecResult:
    usermod = _which("usermod", ("/usr/sbin/usermod", "/sbin/usermod"))
    if not usermod:
        return ExecResult(False, -1, "", "usermod not found", ["usermod"])
    return _run([usermod, "-a", "-G", group, username], timeout)


def remove_group_member(username: str, group: str, timeout: int) -> ExecResult:
    gpasswd = _which("gpasswd", ("/usr/bin/gpasswd", "/sbin/gpasswd"))
    if not gpasswd:
        return ExecResult(False, -1, "", "gpasswd not found", ["gpasswd"])
    return _run([gpasswd, "-d", username, group], timeout)


def change_shell(username: str, shell: str, timeout: int) -> ExecResult:
    usermod = _which("usermod", ("/usr/sbin/usermod", "/sbin/usermod"))
    if not usermod:
        return ExecResult(False, -1, "", "usermod not found", ["usermod"])
    return _run([usermod, "-s", shell, username], timeout)


def change_home(username: str, home: str, move_home: bool, timeout: int) -> ExecResult:
    usermod = _which("usermod", ("/usr/sbin/usermod", "/sbin/usermod"))
    if not usermod:
        return ExecResult(False, -1, "", "usermod not found", ["usermod"])
    args = [usermod, "-d", home]
    if move_home:
        args.append("-m")
    args.append(username)
    return _run(args, timeout)
