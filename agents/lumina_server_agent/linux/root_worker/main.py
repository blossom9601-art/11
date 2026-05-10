#!/usr/bin/env python3
"""Lumina Root Worker — UDS 수신, 허용 action만 exec 스타일로 수행."""

import argparse
import configparser
import errno
import grp
import logging
import os
import pwd
import socket
import struct
import sys
from typing import Any, Dict, FrozenSet, Optional, Set, Tuple

_ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _ROOT_DIR not in sys.path:
    sys.path.insert(0, _ROOT_DIR)

from common.account_policy import (
    DEFAULT_MIN_OPERABLE_UID,
    account_state_dict,
    group_exists,
    normalize_home_prefixes,
    policy_check_home,
    policy_check_shell,
    policy_check_target_user,
    read_etc_shells,
)
from common.account_worker_protocol import (
    PROTO_VERSION,
    frame_decode_stream,
    frame_encode,
    validate_request_envelope,
)
from linux.root_worker.executor import (
    add_group_member,
    change_home,
    change_password,
    change_shell,
    create_user,
    delete_user,
    expire_password,
    lock_user,
    remove_group_member,
    unlock_user,
)

WORKER_VERSION = "0.1.0"
LOG = logging.getLogger("lumina-account-worker")

try:
    SO_PEERCRED = socket.SO_PEERCRED
except AttributeError:
    SO_PEERCRED = 17


def _parse_worker_conf(path: str) -> Dict[str, Any]:
    cp = configparser.ConfigParser()
    cp.read(path, encoding="utf-8")
    s = cp["account_worker"] if cp.has_section("account_worker") else {}
    raw_home = s.get("allowed_home_prefixes", "") if cp.has_section("account_worker") else ""
    allow = ""
    if cp.has_section("account_worker"):
        allow = s.get("service_account_allowlist", "")
    allowlist = frozenset(x.strip() for x in allow.replace(",", " ").split() if x.strip())
    min_uid = DEFAULT_MIN_OPERABLE_UID
    if cp.has_section("account_worker") and s.get("min_operable_uid"):
        try:
            min_uid = int(s.get("min_operable_uid", str(DEFAULT_MIN_OPERABLE_UID)))
        except ValueError:
            min_uid = DEFAULT_MIN_OPERABLE_UID
    socket_path = "/run/lumina/account-worker.sock"
    if cp.has_section("account_worker") and s.get("socket_path"):
        socket_path = s.get("socket_path", socket_path).strip() or socket_path
    agent_run_as = "lumina"
    if cp.has_section("security"):
        agent_run_as = cp.get("security", "run_as", fallback="lumina").strip() or "lumina"
    socket_group = "lumina"
    if cp.has_section("account_worker") and s.get("socket_group"):
        socket_group = s.get("socket_group", socket_group).strip() or socket_group
    job_timeout = 120
    if cp.has_section("account_worker") and s.get("job_timeout_sec"):
        try:
            job_timeout = int(s.get("job_timeout_sec", "120"))
        except ValueError:
            job_timeout = 120
    return {
        "socket_path": socket_path,
        "socket_group": socket_group,
        "home_prefixes": normalize_home_prefixes(raw_home),
        "service_allowlist": allowlist,
        "min_operable_uid": min_uid,
        "agent_run_as": agent_run_as,
        "job_timeout_sec": job_timeout,
    }


def _expected_agent_uid(run_as_name: str) -> int:
    try:
        return pwd.getpwnam(run_as_name).pw_uid
    except KeyError:
        LOG.warning("run_as user %r not found; peer check disabled", run_as_name)
        return -1


def _peer_uid(conn: socket.socket) -> Optional[Tuple[int, int, int]]:
    """Linux SO_PEERCRED → (pid, uid, gid). 실패 시 None."""
    try:
        data = conn.getsockopt(socket.SOL_SOCKET, SO_PEERCRED, struct.calcsize("3i"))
        pid, uid, gid = struct.unpack("3i", data)
        return pid, uid, gid
    except (OSError, struct.error) as e:
        LOG.debug("SO_PEERCRED unavailable: %s", e)
        return None


def _apply_socket_perms(path: str, group_name: str) -> None:
    try:
        gid = grp.getgrnam(group_name).gr_gid
        os.chown(path, 0, gid)
    except (KeyError, OSError) as e:
        LOG.warning("Could not chown socket to group %s: %s", group_name, e)
    try:
        os.chmod(path, 0o660)
    except OSError as e:
        LOG.warning("chmod socket: %s", e)


def _validate_payload_for_action(
    action: str,
    username: str,
    payload: Dict[str, Any],
    *,
    shells: Set[str],
    home_prefixes: Tuple[str, ...],
    min_uid: int,
    service_allowlist: FrozenSet[str],
) -> Optional[str]:
    pl = payload or {}
    if action == "CREATE_USER":
        err = policy_check_target_user(username, min_uid=min_uid, service_allowlist=service_allowlist)
        if err:
            return err
        try:
            pwd.getpwnam(username)
            return "user_already_exists"
        except KeyError:
            pass
        sh_raw = (pl.get("shell") or "/bin/bash").strip()
        e = policy_check_shell(sh_raw, shells)
        if e:
            return e
        home = (pl.get("home") or "").strip() or None
        if home:
            e = policy_check_home(home, home_prefixes)
            if e:
                return e
        pg = (pl.get("primary_group") or "").strip()
        if pg and not group_exists(pg):
            return "primary_group_missing"
        eg = (pl.get("extra_groups") or "").strip()
        if eg:
            for g in eg.split(","):
                g = g.strip()
                if g and not group_exists(g):
                    return "extra_group_missing"
        return None

    if action in (
        "DELETE_USER",
        "LOCK_USER",
        "UNLOCK_USER",
        "CHANGE_PASSWORD",
        "EXPIRE_PASSWORD",
        "ADD_GROUP_MEMBER",
        "REMOVE_GROUP_MEMBER",
        "CHANGE_LOGIN_SHELL",
        "CHANGE_HOME_DIR",
    ):
        err = policy_check_target_user(username, min_uid=min_uid, service_allowlist=service_allowlist)
        if err:
            return err
        try:
            pwd.getpwnam(username)
        except KeyError:
            return "user_not_found"

    if action == "CHANGE_PASSWORD":
        if not pl.get("password") or not isinstance(pl.get("password"), str):
            return "password_required"

    if action == "CHANGE_LOGIN_SHELL":
        sh_raw = (pl.get("shell") or "").strip()
        e = policy_check_shell(sh_raw, shells)
        if e:
            return e

    if action == "CHANGE_HOME_DIR":
        home = (pl.get("home") or "").strip()
        e = policy_check_home(home, home_prefixes)
        if e:
            return e

    if action in ("ADD_GROUP_MEMBER", "REMOVE_GROUP_MEMBER"):
        g = (pl.get("group") or "").strip()
        if not g:
            return "group_required"
        if not group_exists(g):
            return "group_missing"

    return None


def _dispatch(
    action: str,
    username: str,
    payload: Dict[str, Any],
    timeout: int,
) -> Tuple[bool, int, str, str]:
    pl = payload or {}
    if action == "CREATE_USER":
        r = create_user(
            username,
            shell=(pl.get("shell") or "/bin/bash").strip(),
            home=(pl.get("home") or "").strip() or None,
            primary_group=(pl.get("primary_group") or "").strip() or None,
            extra_groups=(pl.get("extra_groups") or "").strip() or None,
            timeout=timeout,
        )
    elif action == "DELETE_USER":
        r = delete_user(username, bool(pl.get("remove_home")), timeout)
    elif action == "LOCK_USER":
        r = lock_user(username, timeout)
    elif action == "UNLOCK_USER":
        r = unlock_user(username, timeout)
    elif action == "CHANGE_PASSWORD":
        r = change_password(username, str(pl.get("password")), timeout)
    elif action == "EXPIRE_PASSWORD":
        r = expire_password(username, pl, timeout)
    elif action == "ADD_GROUP_MEMBER":
        r = add_group_member(username, (pl.get("group") or "").strip(), timeout)
    elif action == "REMOVE_GROUP_MEMBER":
        r = remove_group_member(username, (pl.get("group") or "").strip(), timeout)
    elif action == "CHANGE_LOGIN_SHELL":
        r = change_shell(username, (pl.get("shell") or "").strip(), timeout)
    elif action == "CHANGE_HOME_DIR":
        r = change_home(username, (pl.get("home") or "").strip(), bool(pl.get("move_home")), timeout)
    else:
        return False, -1, "", "unsupported_action"
    return r.ok, r.exit_code, r.stdout, r.stderr


def _handle_one(
    msg: Dict[str, Any],
    opts: Dict[str, Any],
    idem: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    err = validate_request_envelope(msg)
    rid = str(msg.get("requestId", ""))
    base = {
        "protoVersion": PROTO_VERSION,
        "requestId": rid,
        "workerVersion": WORKER_VERSION,
    }
    if err:
        base.update({"ok": False, "errorCode": err, "exitCode": -1, "stdoutTail": "", "stderrTail": ""})
        return base

    if rid in idem:
        prev = idem[rid]
        prev = dict(prev)
        prev["duplicateRequest"] = True
        return prev

    action = str(msg["action"])
    username = str(msg.get("targetUsername") or "").strip()
    if not username:
        base.update({"ok": False, "errorCode": "missing_target_username", "exitCode": -1})
        return base

    payload = msg.get("payload") or {}
    if not isinstance(payload, dict):
        base.update({"ok": False, "errorCode": "bad_payload", "exitCode": -1})
        return base

    shells = read_etc_shells()
    pre = account_state_dict(username) if action != "CREATE_USER" else None
    perr = _validate_payload_for_action(
        action,
        username,
        payload,
        shells=shells,
        home_prefixes=opts["home_prefixes"],
        min_uid=opts["min_operable_uid"],
        service_allowlist=opts["service_allowlist"],
    )
    if perr:
        base.update({"ok": False, "errorCode": perr, "exitCode": -1, "beforeState": pre, "afterState": pre})
        idem[rid] = dict(base)
        return base

    ok, code, out, err = _dispatch(action, username, payload, int(opts["job_timeout_sec"]))
    post = account_state_dict(username) if action != "DELETE_USER" else None
    if action == "DELETE_USER" and ok:
        post = None

    resp = dict(base)
    resp.update({
        "ok": bool(ok),
        "errorCode": None if ok else "worker_command_failed",
        "exitCode": int(code),
        "stdoutTail": out,
        "stderrTail": err,
        "beforeState": pre,
        "afterState": post,
    })
    idem[rid] = dict(resp)
    if len(idem) > 2000:
        for k in list(idem.keys())[:500]:
            del idem[k]
    return resp


def serve_loop(conf_path: str) -> None:
    opts = _parse_worker_conf(conf_path)
    path = opts["socket_path"]
    expected_uid = _expected_agent_uid(opts["agent_run_as"])

    if os.path.exists(path):
        try:
            os.unlink(path)
        except OSError as e:
            LOG.error("unlink socket %s: %s", path, e)
            sys.exit(1)

    srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        srv.bind(path)
    except OSError as e:
        LOG.error("bind %s: %s", path, e)
        sys.exit(1)

    _apply_socket_perms(path, opts["socket_group"])
    srv.listen(8)

    idem: Dict[str, Dict[str, Any]] = {}
    LOG.info("lumina-account-worker listening on %s (peer uid expect %s)", path, expected_uid)

    while True:
        conn, _ = srv.accept()
        try:
            cred = _peer_uid(conn)
            if expected_uid >= 0 and cred is not None:
                _, uid, _ = cred
                if int(uid) != int(expected_uid):
                    LOG.warning("reject peer uid=%s (expected %s)", uid, expected_uid)
                    conn.sendall(frame_encode({
                        "protoVersion": PROTO_VERSION,
                        "requestId": "",
                        "ok": False,
                        "errorCode": "peer_uid_mismatch",
                        "exitCode": -1,
                        "workerVersion": WORKER_VERSION,
                    }))
                    conn.close()
                    continue
            buf = bytearray()
            while True:
                chunk = conn.recv(65536)
                if not chunk:
                    break
                buf.extend(chunk)
                while True:
                    try:
                        msg, _consumed = frame_decode_stream(buf)
                    except ValueError as ve:
                        LOG.warning("frame error: %s", ve)
                        conn.sendall(frame_encode({
                            "protoVersion": PROTO_VERSION,
                            "requestId": "",
                            "ok": False,
                            "errorCode": "bad_frame",
                            "exitCode": -1,
                            "workerVersion": WORKER_VERSION,
                        }))
                        conn.close()
                        raise RuntimeError("bad_frame")
                    if msg is None:
                        break
                    resp = _handle_one(msg, opts, idem)
                    conn.sendall(frame_encode(resp))
        except RuntimeError:
            pass
        except OSError as e:
            if e.errno != errno.EBADF:
                LOG.exception("connection error: %s", e)
        finally:
            try:
                conn.close()
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description="Lumina Root Worker (account operations)")
    parser.add_argument("--conf", default="/etc/lumina/lumina.conf", help="Config path")
    parser.add_argument("--foreground", action="store_true", help="Log to stderr")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stderr if args.foreground else sys.stdout,
    )

    if os.geteuid() != 0:
        LOG.error("Root worker must run as root (euid=%s)", os.geteuid())
        sys.exit(1)

    serve_loop(os.path.abspath(args.conf))


if __name__ == "__main__":
    main()
