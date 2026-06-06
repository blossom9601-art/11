"""비-root Agent에서 Root Worker로 계정 작업 위임 (선검증 + UDS)."""

import json
import logging
import pwd
from typing import Any, Dict, FrozenSet, Optional

from common.account_policy import (
    group_exists,
    normalize_home_prefixes,
    policy_check_home,
    policy_check_shell,
    policy_check_target_user,
    read_etc_shells,
)
from common.account_worker_protocol import PROTO_VERSION, validate_request_envelope

logger = logging.getLogger("lumina")


def _allowlist(config) -> FrozenSet[str]:
    raw = (config.account_worker_service_account_allowlist or "").replace(",", " ")
    return frozenset(x.strip() for x in raw.split() if x.strip())


def validate_agent_side(config, msg: Dict[str, Any]) -> Optional[str]:
    """Worker와 동일한 정책을 Agent에서 선검증 (실패 시 Worker 호출 생략 가능)."""
    err = validate_request_envelope(msg)
    if err:
        return err
    action = str(msg["action"])
    username = str(msg.get("targetUsername") or "").strip()
    if not username:
        return "missing_target_username"
    payload = msg.get("payload") or {}
    if not isinstance(payload, dict):
        return "bad_payload"
    prefixes = normalize_home_prefixes(config.account_worker_allowed_home_prefixes)
    allow = _allowlist(config)
    min_uid = int(config.account_worker_min_operable_uid)
    shells = read_etc_shells()

    if action == "CREATE_USER":
        e = policy_check_target_user(username, min_uid=min_uid, service_allowlist=allow)
        if e:
            return e
        try:
            pwd.getpwnam(username)
            return "user_already_exists"
        except KeyError:
            pass
        sh_raw = (payload.get("shell") or "/bin/bash").strip()
        e = policy_check_shell(sh_raw, shells)
        if e:
            return e
        home = (payload.get("home") or "").strip() or None
        if home:
            e = policy_check_home(home, prefixes)
            if e:
                return e
        pg = (payload.get("primary_group") or "").strip()
        if pg and not group_exists(pg):
            return "primary_group_missing"
        eg = (payload.get("extra_groups") or "").strip()
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
        e = policy_check_target_user(username, min_uid=min_uid, service_allowlist=allow)
        if e:
            return e
        try:
            pwd.getpwnam(username)
        except KeyError:
            return "user_not_found"

    if action == "CHANGE_PASSWORD":
        if not payload.get("password") or not isinstance(payload.get("password"), str):
            return "password_required"

    if action == "CHANGE_LOGIN_SHELL":
        sh_raw = (payload.get("shell") or "").strip()
        e = policy_check_shell(sh_raw, shells)
        if e:
            return e

    if action == "CHANGE_HOME_DIR":
        home = (payload.get("home") or "").strip()
        e = policy_check_home(home, prefixes)
        if e:
            return e

    if action in ("ADD_GROUP_MEMBER", "REMOVE_GROUP_MEMBER"):
        g = (payload.get("group") or "").strip()
        if not g:
            return "group_required"
        if not group_exists(g):
            return "group_missing"

    return None


def dispatch_to_worker(config, envelope: Dict[str, Any]) -> Dict[str, Any]:
    from linux.account_worker_client import call_account_worker

    if not config.account_worker_enabled:
        return {
            "protoVersion": PROTO_VERSION,
            "requestId": envelope.get("requestId", ""),
            "ok": False,
            "errorCode": "account_worker_disabled",
            "exitCode": -1,
        }
    env = dict(envelope)
    env.setdefault("protoVersion", PROTO_VERSION)
    pre = validate_agent_side(config, env)
    if pre:
        logger.warning(
            "account request rejected by agent policy: requestId=%s code=%s",
            env.get("requestId"),
            pre,
        )
        return {
            "protoVersion": PROTO_VERSION,
            "requestId": env.get("requestId", ""),
            "ok": False,
            "errorCode": pre,
            "exitCode": -1,
        }
    to = float(config.account_worker_job_timeout_sec)
    return call_account_worker(config.account_worker_socket_path, env, timeout_sec=to)


def dispatch_from_json_file(config, path: str) -> Dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        env = json.load(f)
    if not isinstance(env, dict):
        return {
            "protoVersion": PROTO_VERSION,
            "requestId": "",
            "ok": False,
            "errorCode": "invalid_json_object",
            "exitCode": -1,
        }
    return dispatch_to_worker(config, env)
