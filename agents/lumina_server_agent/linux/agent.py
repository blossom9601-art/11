#!/usr/bin/env python3
"""Lumina 자산 자동 탐색 에이전트 — Linux 데몬

사용법:
    python3 agent.py              # 데몬 모드 (interval 주기로 반복)
    python3 agent.py --once       # 1회 수집 후 종료
    python3 agent.py --conf /etc/lumina/lumina.conf
"""

import argparse
import json
import logging
import logging.handlers
import os
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error

# 에이전트 루트를 sys.path에 추가
_AGENT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _AGENT_ROOT not in sys.path:
    sys.path.insert(0, _AGENT_ROOT)
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from common.config import AgentConfig
from common.collector import build_payload, save_payload
try:
    from linux.collectors.interface import InterfaceCollector
    from linux.collectors.account import AccountCollector
    from linux.collectors.authority import AuthorityCollector
    from linux.collectors.firewalld import FirewalldCollector
    from linux.collectors.storage import StorageCollector
    from linux.collectors.package import PackageCollector
    from linux.collectors.performance import PerformanceCollector
except ImportError:
    from collectors.interface import InterfaceCollector
    from collectors.account import AccountCollector
    from collectors.authority import AuthorityCollector
    from collectors.firewalld import FirewalldCollector
    from collectors.storage import StorageCollector
    from collectors.package import PackageCollector
    from collectors.performance import PerformanceCollector

try:
    from linux.account_dispatch import dispatch_from_json_file, dispatch_to_worker
except ImportError:
    try:
        from account_dispatch import dispatch_from_json_file, dispatch_to_worker
    except ImportError:
        dispatch_from_json_file = None  # type: ignore
        dispatch_to_worker = None  # type: ignore

logger = logging.getLogger("lumina")

_running = True
_LOG_FORMAT = "%(asctime)s [%(levelname)s] %(message)s"
_LOG_DATEFMT = "%Y-%m-%d %H:%M:%S"

_LEVEL_MAP = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "error": logging.ERROR,
    "critical": logging.CRITICAL,
}


def _setup_logging(config=None):
    # type: (AgentConfig) -> None
    """Configure console + rotating file logging from config."""
    level = logging.INFO
    log_file = "/var/log/lumina/lumina.log"
    max_bytes = 50 * 1024 * 1024
    backup_count = 5

    if config is not None:
        level = _LEVEL_MAP.get(config.log_level, logging.INFO)
        log_file = config.log_file
        max_bytes = config.log_max_size_mb * 1024 * 1024
        backup_count = config.log_backup_count

    logger.setLevel(level)

    # console handler
    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_LOG_DATEFMT))
    logger.addHandler(ch)

    # rotating file handler
    log_dir = os.path.dirname(log_file)
    if log_dir:
        os.makedirs(log_dir, exist_ok=True)
    fh = logging.handlers.RotatingFileHandler(
        log_file, maxBytes=max_bytes, backupCount=backup_count, encoding="utf-8",
    )
    fh.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_LOG_DATEFMT))
    logger.addHandler(fh)


def _signal_handler(signum, frame):
    global _running
    logger.info("Shutdown signal received (signal=%d), stopping agent.", signum)
    _running = False


def _build_ssl_context(config):
    # type: (AgentConfig) -> ssl.SSLContext
    """Build an SSL context from config (verify_ssl, ca_cert, mTLS)."""
    import ssl
    if config.verify_ssl:
        ctx = ssl.create_default_context()
        if config.ca_cert:
            ctx.load_verify_locations(config.ca_cert)
    else:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    if config.client_cert and config.client_key:
        ctx.load_cert_chain(config.client_cert, config.client_key)
    return ctx


def _build_opener(config, ssl_context=None):
    # type: (AgentConfig, ...) -> urllib.request.OpenerDirector
    """Build a urllib opener with optional proxy and SSL support."""
    handlers = []  # type: list
    if config.proxy:
        proxy_handler = urllib.request.ProxyHandler({
            "https": config.proxy,
        })
        handlers.append(proxy_handler)
    else:
        # no_proxy: use direct connection
        handlers.append(urllib.request.ProxyHandler({}))
    if ssl_context is not None:
        handlers.append(urllib.request.HTTPSHandler(context=ssl_context))
    return urllib.request.build_opener(*handlers)


def _auth_headers(config):
    # type: (AgentConfig) -> dict
    """Return auth headers if tokens are configured."""
    headers = {"Content-Type": "application/json"}
    if config.auth_token:
        headers["Authorization"] = "Bearer %s" % config.auth_token
    elif config.enrollment_token:
        headers["X-Enrollment-Token"] = config.enrollment_token
    return headers


def _push_to_server(config, payload):
    # type: (AgentConfig, dict) -> bool
    """수집 결과를 서버로 전송. 성공 시 True, 실패 시 False (로컬 저장 fallback)."""
    if not config.server_url:
        return False
    try:
        import ssl
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            config.server_url,
            data=data,
            headers=_auth_headers(config),
            method="POST",
        )
        ctx = _build_ssl_context(config)
        opener = _build_opener(config, ssl_context=ctx)
        resp = opener.open(req, timeout=config.read_timeout)
        try:
            logger.info("Data sent to server (status=%d)", resp.status)
        finally:
            resp.close()
        return True
    except (urllib.error.URLError, OSError) as e:
        logger.warning("Server unreachable, saving locally (error=%s)", e)
        return False


def run_once(config):
    # type: (AgentConfig) -> None
    """수집 1회 실행 (with retry backoff on failure)"""
    collectors = []
    if "interface" in config.collectors:
        collectors.append(InterfaceCollector())
    if "account" in config.collectors:
        collectors.append(AccountCollector())
    if "authority" in config.collectors:
        collectors.append(AuthorityCollector())
    if "firewalld" in config.collectors:
        collectors.append(FirewalldCollector())
    if "storage" in config.collectors:
        collectors.append(StorageCollector())
    if "package" in config.collectors:
        collectors.append(PackageCollector())
    if "performance" in config.collectors:
        collectors.append(PerformanceCollector())

    logger.info("Collection started (hostname=%s, collectors=%s)", config.hostname, [c.name for c in collectors])
    payload = build_payload(collectors)

    # 서버 전송 시도 with exponential backoff
    sent = False
    wait = config.retry_interval
    max_wait = config.max_retry_interval
    attempts = 0
    while not sent and _running:
        sent = _push_to_server(config, payload)
        if sent:
            logger.info("Collection complete -> sent to server")
            break
        attempts += 1
        if attempts >= 3:
            # give up after 3 retries in a single cycle
            break
        logger.info("Retrying in %ds (attempt=%d)", wait, attempts)
        # interruptible sleep
        slept = 0
        while _running and slept < wait:
            time.sleep(min(5, wait - slept))
            slept += 5
        wait = min(wait * 2, max_wait)

    if not sent:
        out_path = config.output_path()
        save_payload(payload, out_path)
        logger.info("Collection complete -> %s", out_path)


def _report_account_job_result(config, hostname, result):
    # type: (AgentConfig, str, dict) -> None
    """서버에 계정 작업 실행 결과 보고 (비밀번호는 result에 포함하지 않음)."""
    if not config.server_host:
        return
    try:
        import ssl
        url = "%s://%s:%s/api/agent/account-jobs/result" % (
            config.server_protocol, config.server_host, config.server_port,
        )
        body = {"hostname": hostname}
        for k, v in list(result.items()):
            if k == "hostname":
                continue
            body[k] = v
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            url, data=data, headers=_auth_headers(config), method="POST",
        )
        ctx = _build_ssl_context(config)
        opener = _build_opener(config, ssl_context=ctx)
        resp = opener.open(req, timeout=config.read_timeout)
        try:
            if resp.status >= 400:
                logger.warning("account-jobs/result HTTP %s", resp.status)
        finally:
            resp.close()
    except Exception as e:
        logger.warning("account job result report failed: %s", e)


def _run_server_account_jobs(config, jobs):
    # type: (AgentConfig, list) -> None
    """Heartbeat에서 받은 account_jobs 봉투를 Root Worker로 실행 후 서버에 보고."""
    if not jobs:
        return
    if dispatch_to_worker is None:
        logger.warning("account_dispatch unavailable, skipping server account jobs")
        return
    import socket as _sock
    hn = (config.hostname or _sock.gethostname()).strip()
    for envelope in jobs:
        if not isinstance(envelope, dict):
            continue
        rid = envelope.get("requestId") or envelope.get("request_id")
        logger.info("account job from server: requestId=%s action=%s", rid, envelope.get("action"))
        try:
            result = dispatch_to_worker(config, envelope)
        except Exception:
            logger.exception("account job execution failed requestId=%s", rid)
            result = {
                "protoVersion": envelope.get("protoVersion", 1),
                "requestId": rid or "",
                "ok": False,
                "errorCode": "agent_exception",
                "exitCode": -1,
            }
        if rid and not result.get("requestId"):
            result = dict(result)
            result["requestId"] = rid
        _report_account_job_result(config, hn, result)


def _post_json(config, path, body, timeout=None):
    if not config.server_host:
        return None
    url = "%s://%s:%s%s" % (config.server_protocol, config.server_host, config.server_port, path)
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=_auth_headers(config), method="POST")
    ctx = _build_ssl_context(config)
    opener = _build_opener(config, ssl_context=ctx)
    resp = opener.open(req, timeout=timeout or config.read_timeout)
    try:
        raw = resp.read().decode("utf-8", errors="replace")
    finally:
        resp.close()
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def _extract_lumina_result(stdout):
    for line in str(stdout or "").splitlines():
        line = line.strip()
        if line.startswith("LUMINA_RESULT="):
            return line.split("=", 1)[1].strip()
    return ""


def _run_vulnerability_script(script, guide_id, check_code):
    fd, path = tempfile.mkstemp(prefix="lumina-vuln-", suffix=".sh")
    os.close(fd)
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write("#!/bin/sh\n")
            f.write(str(script or ""))
            if not str(script or "").endswith("\n"):
                f.write("\n")
        os.chmod(path, 0o700)
        env = dict(os.environ)
        env["LUMINA_GUIDE_ID"] = str(guide_id)
        env["LUMINA_CHECK_CODE"] = str(check_code or "")
        proc = subprocess.run(
            ["/bin/sh", path],
            capture_output=True,
            text=True,
            timeout=90,
            env=env,
        )
        return {
            "ok": proc.returncode == 0,
            "exit_code": int(proc.returncode),
            "stdout": (proc.stdout or "")[-8000:],
            "stderr": (proc.stderr or "")[-4000:],
            "result": _extract_lumina_result(proc.stdout),
            "message": "completed" if proc.returncode == 0 else "exit_code=%s" % proc.returncode,
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "ok": False,
            "exit_code": 124,
            "stdout": (exc.stdout or "")[-8000:] if isinstance(exc.stdout, str) else "",
            "stderr": (exc.stderr or "")[-4000:] if isinstance(exc.stderr, str) else "",
            "result": "need",
            "message": "timeout",
        }
    except Exception as exc:
        return {"ok": False, "exit_code": -1, "stdout": "", "stderr": str(exc), "result": "need", "message": str(exc)}
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def _run_vulnerability_commands(config, commands):
    if not commands:
        return
    import socket as _sock
    hostname = (config.hostname or _sock.gethostname()).strip()
    for command in commands:
        raw = str(command or "").strip()
        if not raw.startswith("vulnerability_check:"):
            continue
        try:
            guide_id = int(raw.split(":", 1)[1].strip())
        except Exception:
            continue
        try:
            data = _post_json(
                config,
                "/api/agent/vulnerability-guides/%s/script" % guide_id,
                {"hostname": hostname},
                timeout=config.read_timeout,
            ) or {}
            if not data.get("success"):
                logger.warning("vulnerability script fetch failed guide_id=%s error=%s", guide_id, data.get("error"))
                continue
            item = data.get("item") or {}
            result = _run_vulnerability_script(
                item.get("script_content") or "",
                guide_id,
                item.get("check_code") or "",
            )
            result["hostname"] = hostname
            _post_json(
                config,
                "/api/agent/vulnerability-guides/%s/result" % guide_id,
                result,
                timeout=config.read_timeout,
            )
            logger.info("vulnerability check reported guide_id=%s result=%s", guide_id, result.get("result") or result.get("ok"))
        except Exception:
            logger.exception("vulnerability command failed guide_id=%s", guide_id)


def _send_heartbeat(config):
    # type: (AgentConfig) -> list
    """서버에 heartbeat 전송; 응답에 account_jobs 가 있으면 실행·보고."""
    if not config.server_host:
        return []
    import ssl as _ssl
    import socket as _sock
    try:
        url = "%s://%s:%s/api/agent/heartbeat" % (config.server_protocol, config.server_host, config.server_port)
        body = json.dumps({"hostname": config.hostname or _sock.gethostname()}).encode("utf-8")
        req = urllib.request.Request(
            url, data=body,
            headers=_auth_headers(config),
            method="POST",
        )
        ctx = _build_ssl_context(config)
        opener = _build_opener(config, ssl_context=ctx)
        resp = opener.open(req, timeout=config.connect_timeout)
        try:
            raw = resp.read().decode("utf-8", errors="replace")
        finally:
            resp.close()
        try:
            data = json.loads(raw)
        except (TypeError, ValueError):
            return []
        if isinstance(data, dict) and data.get("success"):
            commands = data.get("commands") or []
            _run_vulnerability_commands(config, commands)
            jobs = data.get("account_jobs") or []
            _run_server_account_jobs(config, jobs)
            return commands
    except Exception:
        pass
    return []


def _interactive_setup(config):
    """Interactive server connection setup"""
    print("\n===== Lumina Server Connection Setup =====")
    print("Enter the server information to send agent data.\n")
    if config.server_host:
        print("  Current setting: %s\n" % config.server_url)
    host = input("  Server IP [%s]: " % (config.server_host or "")).strip() or config.server_host
    port = input("  Port [%s]: " % config.server_port).strip() or str(config.server_port)
    verify = input("  Verify SSL certificate (y/N) [%s]: " % ("y" if config.verify_ssl else "N")).strip().lower()
    if not host:
        print("No server IP provided. Exiting.")
        sys.exit(0)
    config.server_protocol = "https"
    config.server_host = host
    try:
        config.server_port = int(port)
    except ValueError:
        config.server_port = 443
    config.verify_ssl = verify in ("y", "yes")
    config.save()
    print("\nConfiguration saved: %s" % config.server_url)
    print("Start service: systemctl start lumina-agent\n")


def main():
    parser = argparse.ArgumentParser(description="Lumina Asset Discovery Agent (Linux)")
    parser.add_argument("--once", action="store_true", help="Collect once and exit")
    parser.add_argument("--setup", action="store_true", help="Configure server connection and exit")
    parser.add_argument("--conf", default=None, help="Config file path")
    parser.add_argument(
        "--account-request",
        metavar="FILE",
        default=None,
        help="Send one account-control JSON envelope to Root Worker (UDS) and print result",
    )
    args = parser.parse_args()

    _setup_logging()  # basic logging before config load

    config = AgentConfig(conf_path=args.conf)

    # reconfigure logging with actual config values
    for h in logger.handlers[:]:
        logger.removeHandler(h)
    _setup_logging(config)

    if args.account_request:
        if dispatch_from_json_file is None:
            logger.error("account dispatch module not available")
            sys.exit(2)
        result = dispatch_from_json_file(config, args.account_request)
        out = json.dumps(result, ensure_ascii=False, indent=2)
        print(out)
        sys.exit(0 if result.get("ok") else 1)

    # --setup 모드: 대화형 설정 후 종료
    if args.setup:
        _interactive_setup(config)
        return

    # server_host가 미설정이면 CLI로 입력받기
    if not config.server_url:
        if not sys.stdin.isatty():
            logger.error("Server connection not configured. "
                         "Run 'lumina-agent --setup' in a terminal "
                         "to complete initial setup.")
            sys.exit(1)
        _interactive_setup(config)

    logger.info("Agent started (interval=%ds, output=%s, server=%s)",
                config.interval, config.output_dir,
                "configured" if config.server_url else "(none)")

    signal.signal(signal.SIGTERM, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)

    if args.once:
        run_once(config)
        return

    # 데몬 루프
    while _running:
        try:
            run_once(config)
            commands = _send_heartbeat(config)
            if "collect" in commands:
                logger.info("Immediate collect command received")
                run_once(config)
        except Exception:
            logger.exception("Unexpected error during collection cycle")

        # interval 동안 짧은 간격으로 heartbeat 전송해 수집 명령을 빠르게 반영
        elapsed = 0
        hb_interval = min(5, config.interval)
        while _running and elapsed < config.interval:
            time.sleep(hb_interval)
            elapsed += hb_interval
            if _running and elapsed < config.interval:
                try:
                    commands = _send_heartbeat(config)
                    if "collect" in commands:
                        logger.info("Immediate collect command received")
                        run_once(config)
                        break
                except Exception:
                    pass

    logger.info("Agent stopped")


if __name__ == "__main__":
    main()
