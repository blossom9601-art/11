#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lumina CLI — Blossom 에이전트 관리 도구

Python 3.6+ stdlib only (Rocky Linux 8 호환).

사용법:
    lumina login                    — 로그인 (토큰 발급)
    lumina agents                   — 에이전트 목록
    lumina agents search -H <host>  — 에이전트 검색
    lumina agent <id>               — 에이전트 상세
    lumina agent <id> status        — 에이전트 상태
    lumina agent <id> health        — 에이전트 헬스
    lumina agent <id> inventory     — 자산 인벤토리
    lumina agent <id> enable        — 에이전트 활성화
    lumina agent <id> disable       — 에이전트 비활성화
    lumina agent <id> resend        — 재전송 명령
    lumina agent <id> collect       — 수집 명령
    lumina services                 — 로컬 lumina 서비스 상태
    lumina version                  — 버전 정보
"""

from __future__ import print_function

import argparse
import getpass
import json
import os
import platform
import ssl
import subprocess
import sys
import textwrap

__version__ = "2.0.0"

# Python 3
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


# ═══════════════════════════════════════════════════════════
# 설정
# ═══════════════════════════════════════════════════════════

def _config_dir():
    if platform.system() == "Windows":
        return os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "lumina")
    return os.path.expanduser("~/.config/lumina")


def _token_path():
    return os.path.join(_config_dir(), "token")


def _server_path():
    return os.path.join(_config_dir(), "server")


def _save_token(token, emp_no, role, server):
    d = _config_dir()
    os.makedirs(d, mode=0o700, exist_ok=True)
    with open(_token_path(), "w") as f:
        json.dump({"token": token, "emp_no": emp_no, "role": role}, f)
    os.chmod(_token_path(), 0o600)
    with open(_server_path(), "w") as f:
        f.write(server.strip())
    os.chmod(_server_path(), 0o600)


def _load_token():
    tp = _token_path()
    if not os.path.isfile(tp):
        return None
    with open(tp) as f:
        return json.load(f)


def _load_server():
    sp = _server_path()
    if not os.path.isfile(sp):
        return None
    with open(sp) as f:
        return f.read().strip()


# ═══════════════════════════════════════════════════════════
# HTTP 클라이언트
# ═══════════════════════════════════════════════════════════

def _api(method, path, data=None, token=None, server=None):
    """WEB 서버 API 호출. dict 반환."""
    if not server:
        server = _load_server()
    if not server:
        _err("서버 주소가 설정되지 않았습니다. 먼저 'lumina login'을 실행하세요.")

    url = server.rstrip("/") + path

    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")

    req = Request(url, data=body, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)

    # TLS 검증 완화 (내부망 자체서명 인증서)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        resp = urlopen(req, context=ctx, timeout=15)
        return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8"))
            msg = body.get("error", str(e))
        except Exception:
            msg = str(e)
        _err("API 오류 (%d): %s" % (e.code, msg))
    except URLError as e:
        _err("연결 실패: %s" % e.reason)


def _authed_api(method, path, data=None):
    """토큰 인증 포함 API 호출."""
    info = _load_token()
    if not info:
        _err("인증 토큰이 없습니다. 먼저 'lumina login'을 실행하세요.")
    return _api(method, path, data=data, token=info["token"])


# ═══════════════════════════════════════════════════════════
# 출력 헬퍼
# ═══════════════════════════════════════════════════════════

def _err(msg):
    print("\033[91m오류:\033[0m %s" % msg, file=sys.stderr)
    sys.exit(1)


def _ok(msg):
    print("\033[92m%s\033[0m" % msg)


def _table(rows, headers):
    """간단한 텍스트 테이블 출력."""
    if not rows:
        print("  (결과 없음)")
        return

    # 컬럼 너비 계산
    widths = [len(h) for h in headers]
    str_rows = []
    for row in rows:
        sr = []
        for i, h in enumerate(headers):
            v = str(row.get(h, ""))
            sr.append(v)
            widths[i] = max(widths[i], len(v))
        str_rows.append(sr)

    # 헤더
    hdr = "  ".join(h.upper().ljust(widths[i]) for i, h in enumerate(headers))
    print("\033[1m%s\033[0m" % hdr)
    print("  ".join("-" * widths[i] for i in range(len(headers))))

    # 행
    for sr in str_rows:
        print("  ".join(sr[i].ljust(widths[i]) for i in range(len(headers))))


def _detail(item, keys=None):
    """키-값 상세 출력."""
    if not item:
        print("  (결과 없음)")
        return
    if keys is None:
        keys = list(item.keys())
    max_k = max(len(k) for k in keys) if keys else 0
    for k in keys:
        v = item.get(k, "")
        if isinstance(v, (dict, list)):
            v = json.dumps(v, ensure_ascii=False, indent=2)
        print("  \033[36m%-*s\033[0m : %s" % (max_k, k, v))


# ═══════════════════════════════════════════════════════════
# 명령어 구현
# ═══════════════════════════════════════════════════════════

def cmd_login(args):
    """로그인 후 토큰 저장."""
    server = args.server
    if not server:
        saved = _load_server()
        if saved:
            server = saved
            print("서버: %s" % server)
        else:
            server = input("WEB 서버 주소 (예: http://192.168.56.108): ").strip()
    if not server:
        _err("서버 주소가 필요합니다.")
    if not server.startswith("http"):
        server = "https://" + server

    emp_no = args.user or input("사번: ").strip()
    if not emp_no:
        _err("사번이 필요합니다.")

    password = args.password if hasattr(args, 'password') and args.password else getpass.getpass("비밀번호: ")
    if not password:
        _err("비밀번호가 필요합니다.")

    result = _api("POST", "/api/cli/login",
                  data={"emp_no": emp_no, "password": password},
                  server=server)

    if not result.get("success"):
        _err(result.get("error", "로그인 실패"))

    _save_token(result["token"], result["emp_no"], result["role"], server)
    _ok("로그인 성공: %s (역할: %s)" % (result["emp_no"], result["role"]))


def cmd_agents(args):
    """에이전트 목록."""
    result = _authed_api("GET", "/api/cli/agents")
    if not result.get("success"):
        _err(result.get("error", "API 오류"))

    rows = result.get("rows", [])
    print("\n에이전트 %d건:\n" % len(rows))
    _table(rows, ["id", "hostname", "ip_address", "os_type", "status", "last_seen"])
    print()


def cmd_agents_search(args):
    """에이전트 검색."""
    params = []
    if args.hostname:
        params.append("hostname=%s" % args.hostname)
    if args.ip:
        params.append("ip=%s" % args.ip)
    qs = "&".join(params)
    path = "/api/cli/agents/search" + ("?" + qs if qs else "")

    result = _authed_api("GET", path)
    if not result.get("success"):
        _err(result.get("error", "API 오류"))

    rows = result.get("rows", [])
    print("\n검색 결과 %d건:\n" % len(rows))
    _table(rows, ["id", "hostname", "ip_address", "os_type", "status", "last_seen"])
    print()


def cmd_agent_show(args):
    """에이전트 상세."""
    result = _authed_api("GET", "/api/cli/agents/%d" % args.id)
    if not result.get("success"):
        _err(result.get("error", "API 오류"))
    print("\n에이전트 상세 (ID=%d):\n" % args.id)
    _detail(result.get("item", {}))
    print()


def cmd_agent_status(args):
    """에이전트 상태."""
    result = _authed_api("GET", "/api/cli/agents/%d/status" % args.id)
    if not result.get("success"):
        _err(result.get("error", "API 오류"))
    print("\n에이전트 상태 (ID=%d):\n" % args.id)
    _detail(result.get("item", {}))
    print()


def cmd_agent_health(args):
    """에이전트 헬스."""
    result = _authed_api("GET", "/api/cli/agents/%d/health" % args.id)
    if not result.get("success"):
        _err(result.get("error", "API 오류"))
    print("\n에이전트 헬스 (ID=%d):\n" % args.id)
    _detail(result.get("item", {}))
    print()


def cmd_agent_inventory(args):
    """자산 인벤토리."""
    result = _authed_api("GET", "/api/cli/agents/%d/inventory" % args.id)
    if not result.get("success"):
        _err(result.get("error", "API 오류"))
    print("\n에이전트 인벤토리 (ID=%d):\n" % args.id)
    item = result.get("item", {})
    # 인벤토리는 보통 interfaces/accounts/packages 포함
    for section in ["interfaces", "accounts", "packages"]:
        data = item.get(section)
        if data and isinstance(data, list):
            print("  === %s (%d건) ===" % (section, len(data)))
            if data:
                _table(data, list(data[0].keys()))
            print()
    # 나머지 키
    other = {k: v for k, v in item.items()
             if k not in ("interfaces", "accounts", "packages")}
    if other:
        _detail(other)
    print()


def cmd_agent_enable(args):
    """에이전트 활성화."""
    result = _authed_api("POST", "/api/cli/agents/%d/enable" % args.id)
    if not result.get("success"):
        _err(result.get("error", "API 오류"))
    _ok(result.get("message", "에이전트 %d 활성화 완료" % args.id))


def cmd_agent_disable(args):
    """에이전트 비활성화."""
    result = _authed_api("POST", "/api/cli/agents/%d/disable" % args.id)
    if not result.get("success"):
        _err(result.get("error", "API 오류"))
    _ok(result.get("message", "에이전트 %d 비활성화 완료" % args.id))


def cmd_agent_resend(args):
    """재전송 명령."""
    result = _authed_api("POST", "/api/cli/agents/%d/resend" % args.id)
    if not result.get("success"):
        _err(result.get("error", "API 오류"))
    _ok(result.get("message", "재전송 명령 전송 완료"))


def cmd_agent_collect(args):
    """수집 명령."""
    result = _authed_api("POST", "/api/cli/agents/%d/collect" % args.id)
    if not result.get("success"):
        _err(result.get("error", "API 오류"))
    _ok(result.get("message", "수집 명령 전송 완료"))


def cmd_services(args):
    """로컬 lumina 서비스 상태 확인."""
    services = ["lumina-db", "lumina-ap", "lumina-web", "lumina-agent"]
    print("\n로컬 Lumina 서비스 상태:\n")
    for svc in services:
        try:
            r = subprocess.run(
                ["systemctl", "is-active", svc],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                universal_newlines=True, timeout=5
            )
            status = r.stdout.strip() or "not-found"
        except (FileNotFoundError, subprocess.TimeoutExpired):
            status = "unknown"
        except Exception:
            status = "error"

        if status == "active":
            color = "\033[92m"  # green
        elif status in ("inactive", "not-found"):
            color = "\033[90m"  # gray
        else:
            color = "\033[93m"  # yellow

        print("  %-16s %s%s\033[0m" % (svc, color, status))
    print()


def cmd_version(args):
    """버전 정보."""
    print("lumina CLI v%s" % __version__)
    info = _load_token()
    if info:
        print("인증: %s (역할: %s)" % (info.get("emp_no", "?"), info.get("role", "?")))
    server = _load_server()
    if server:
        print("서버: %s" % server)


# ═══════════════════════════════════════════════════════════
# Argparse 구성
# ═══════════════════════════════════════════════════════════

def build_parser():
    p = argparse.ArgumentParser(
        prog="lumina",
        description="Lumina CLI — Blossom 에이전트 관리 도구 v%s" % __version__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            사용 예:
              lumina login -s http://192.168.56.108
              lumina agents
              lumina agent 1 status
              lumina agent 1 inventory
              lumina services
        """),
    )
    sub = p.add_subparsers(dest="command")

    # login
    sp = sub.add_parser("login", help="로그인 (토큰 발급)")
    sp.add_argument("-s", "--server", help="WEB 서버 주소")
    sp.add_argument("-u", "--user", help="사번")
    sp.add_argument("-p", "--password", help="비밀번호 (생략 시 프롬프트)")
    sp.set_defaults(func=cmd_login)

    # agents (목록)
    sp = sub.add_parser("agents", help="에이전트 목록")
    sp.set_defaults(func=cmd_agents)

    # search
    sp = sub.add_parser("search", help="에이전트 검색")
    sp.add_argument("-H", "--hostname", help="호스트명")
    sp.add_argument("-I", "--ip", help="IP 주소")
    sp.set_defaults(func=cmd_agents_search)

    # agent <id> [sub-command]
    sp = sub.add_parser("agent", help="에이전트 조회/관리")
    sp.add_argument("id", type=int, help="에이전트 ID")
    sp.add_argument("action", nargs="?", default="show",
                     choices=["show", "status", "health", "inventory",
                              "enable", "disable", "resend", "collect"],
                     help="동작 (기본: show)")
    sp.set_defaults(func=_dispatch_agent)

    # services
    sp = sub.add_parser("services", help="로컬 lumina 서비스 상태")
    sp.set_defaults(func=cmd_services)

    # version
    sp = sub.add_parser("version", help="버전 정보")
    sp.set_defaults(func=cmd_version)

    return p


def _dispatch_agent(args):
    """agent <id> <action> 라우팅."""
    dispatch = {
        "show": cmd_agent_show,
        "status": cmd_agent_status,
        "health": cmd_agent_health,
        "inventory": cmd_agent_inventory,
        "enable": cmd_agent_enable,
        "disable": cmd_agent_disable,
        "resend": cmd_agent_resend,
        "collect": cmd_agent_collect,
    }
    fn = dispatch.get(args.action, cmd_agent_show)
    fn(args)


def main():
    parser = build_parser()
    args = parser.parse_args()

    if not hasattr(args, "func") or args.func is None:
        parser.print_help()
        sys.exit(0)

    args.func(args)


if __name__ == "__main__":
    main()
