"""Lumina-gate Agent for Windows.

The executable built from this file is self-installing: run it as administrator
without arguments to copy itself to Program Files, create ProgramData paths,
register the LuminaGateAgent Windows service, configure automatic restart, and
start the service. The same executable runs the service with --service.
"""

from __future__ import annotations

import base64
import ctypes
import getpass
import hashlib
import hmac
import json
import logging
import os
import platform
import shutil
import socket
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib import request


VERSION = "1.0.0"
SERVICE_NAME = "LuminaGateAgent"
SERVICE_DISPLAY = "Lumina-gate Agent"
SERVICE_DESCRIPTION = "Lumina-gate web access control and policy agent."
PROGRAM_FILES_DIR = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "LuminaGateAgent"
PROGRAM_DATA_DIR = Path(os.environ.get("ProgramData", r"C:\ProgramData")) / "LuminaGateAgent"
CONFIG_PATH = PROGRAM_DATA_DIR / "config.yaml"
LOG_DIR = PROGRAM_DATA_DIR / "logs"
QUEUE_DIR = PROGRAM_DATA_DIR / "queue"
STATE_PATH = PROGRAM_DATA_DIR / "state.json"
POLICY_CACHE_PATH = PROGRAM_DATA_DIR / "policy-cache.json"
SERVICE_EXE = PROGRAM_FILES_DIR / "LuminaGateAgent.exe"

DEFAULT_CONFIG = {
    "gate_server_url": "https://ttt5:8443",
    "agent_id": "",
    "token": "",
    "policy_poll_interval_seconds": 60,
    "heartbeat_interval_seconds": 30,
    "log_flush_interval_seconds": 10,
    "log_level": "info",
    "verify_tls": True,
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def ensure_dirs() -> None:
    for path in (PROGRAM_FILES_DIR, PROGRAM_DATA_DIR, LOG_DIR, QUEUE_DIR):
        path.mkdir(parents=True, exist_ok=True)


def parse_scalar(raw: str) -> Any:
    value = raw.strip()
    if not value:
        return ""
    if value[0:1] in ('"', "'") and value[-1:] == value[0]:
        return value[1:-1]
    low = value.lower()
    if low in ("true", "yes", "on"):
        return True
    if low in ("false", "no", "off"):
        return False
    try:
        return int(value)
    except ValueError:
        return value


def quote_yaml(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    return json.dumps(str(value), ensure_ascii=False)


def load_config() -> Dict[str, Any]:
    ensure_dirs()
    if not CONFIG_PATH.exists():
        save_config(dict(DEFAULT_CONFIG))
    config = dict(DEFAULT_CONFIG)
    for line in CONFIG_PATH.read_text(encoding="utf-8", errors="replace").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or ":" not in stripped:
            continue
        key, raw = stripped.split(":", 1)
        key = key.strip()
        if key:
            config[key] = parse_scalar(raw)
    return config


def save_config(config: Dict[str, Any]) -> None:
    ensure_dirs()
    lines = ["# LuminaGateAgent configuration"]
    for key in DEFAULT_CONFIG:
        lines.append(f"{key}: {quote_yaml(config.get(key, DEFAULT_CONFIG[key]))}")
    CONFIG_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def setup_logging(config: Dict[str, Any]) -> None:
    ensure_dirs()
    level = getattr(logging, str(config.get("log_level", "info")).upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[logging.FileHandler(LOG_DIR / "agent.log", encoding="utf-8"), logging.StreamHandler(sys.stdout)],
    )


def is_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def show_message(title: str, message: str, error: bool = False) -> None:
    print(message)
    if os.name != "nt":
        return
    try:
        icon = 0x10 if error else 0x40
        ctypes.windll.user32.MessageBoxW(None, message, title, icon)
    except Exception:
        pass


def relaunch_as_admin(argv: List[str]) -> bool:
    if os.name != "nt":
        return False
    if getattr(sys, "frozen", False):
        executable = str(Path(sys.executable).resolve())
        parameters = subprocess.list2cmdline(argv)
    else:
        executable = str(Path(sys.executable).resolve())
        parameters = subprocess.list2cmdline([str(Path(__file__).resolve())] + argv)
    try:
        result = ctypes.windll.shell32.ShellExecuteW(None, "runas", executable, parameters, None, 1)
        return result > 32
    except Exception:
        return False


def ensure_admin_or_relaunch(argv: List[str], action: str) -> bool:
    if is_admin():
        return True
    if relaunch_as_admin(argv):
        return False
    show_message(
        "Lumina-gate Agent",
        f"{action}에는 관리자 권한이 필요합니다.\n\n"
        "파일을 마우스 오른쪽 버튼으로 클릭한 뒤 '관리자 권한으로 실행'을 선택하세요.",
        error=True,
    )
    return False


def run_cmd(args: List[str], check: bool = False) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(args, capture_output=True, text=True, creationflags=0x08000000)
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        command = subprocess.list2cmdline(args)
        raise RuntimeError(f"Command failed ({result.returncode}): {command}\n{detail}")
    return result


def service_exists() -> bool:
    result = run_cmd(["sc.exe", "query", SERVICE_NAME])
    return result.returncode == 0


def service_is_running() -> bool:
    result = run_cmd(["sc.exe", "query", SERVICE_NAME])
    return result.returncode == 0 and "RUNNING" in (result.stdout or "")


def wait_service_absent() -> None:
    for _ in range(30):
        if not service_exists():
            return
        time.sleep(1)
    raise RuntimeError(f"{SERVICE_NAME} 기존 서비스가 삭제 대기 상태에서 해제되지 않았습니다.")


def delete_existing_service() -> None:
    run_cmd(["sc.exe", "stop", SERVICE_NAME])
    if not service_exists():
        return
    result = run_cmd(["sc.exe", "delete", SERVICE_NAME])
    if result.returncode not in (0, 1060, 1072):
        detail = (result.stderr or result.stdout or "").strip()
        raise RuntimeError(f"기존 {SERVICE_NAME} 서비스 삭제에 실패했습니다.\n{detail}")
    wait_service_absent()


def register_service_with_api(bin_path: str) -> bool:
    if not HAS_SERVICE:
        return False
    manager = None
    service = None
    try:
        manager = win32service.OpenSCManager(None, None, win32service.SC_MANAGER_CREATE_SERVICE)
        service = win32service.CreateService(
            manager,
            SERVICE_NAME,
            SERVICE_DISPLAY,
            win32service.SERVICE_ALL_ACCESS,
            win32service.SERVICE_WIN32_OWN_PROCESS,
            win32service.SERVICE_AUTO_START,
            win32service.SERVICE_ERROR_NORMAL,
            bin_path,
            None,
            0,
            None,
            None,
            None,
        )
        try:
            win32service.ChangeServiceConfig2(service, win32service.SERVICE_CONFIG_DESCRIPTION, SERVICE_DESCRIPTION)
        except Exception:
            pass
        return True
    except Exception:
        return False
    finally:
        if service is not None:
            win32service.CloseServiceHandle(service)
        if manager is not None:
            win32service.CloseServiceHandle(manager)


def register_service(bin_path: str) -> None:
    if register_service_with_api(bin_path):
        return
    run_cmd(
        [
            "sc.exe",
            "create",
            SERVICE_NAME,
            "binPath=",
            bin_path,
            "start=",
            "auto",
            "DisplayName=",
            SERVICE_DISPLAY,
        ],
        check=True,
    )
    run_cmd(["sc.exe", "description", SERVICE_NAME, SERVICE_DESCRIPTION])


def verify_installation() -> None:
    missing = []
    if not SERVICE_EXE.exists():
        missing.append(str(SERVICE_EXE))
    if not CONFIG_PATH.exists():
        missing.append(str(CONFIG_PATH))
    if not LOG_DIR.exists():
        missing.append(str(LOG_DIR))
    if missing:
        raise RuntimeError("설치 파일 또는 디렉터리가 생성되지 않았습니다: " + ", ".join(missing))
    for _ in range(20):
        if service_is_running():
            return
        time.sleep(1)
    raise RuntimeError(f"{SERVICE_NAME} 서비스가 RUNNING 상태가 아닙니다.")


def machine_info() -> Dict[str, Any]:
    hostname = socket.gethostname()
    ip_address = ""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            ip_address = sock.getsockname()[0]
    except Exception:
        try:
            ip_address = socket.gethostbyname(hostname)
        except Exception:
            ip_address = ""
    mac_int = uuid.getnode()
    mac = ":".join(f"{(mac_int >> bits) & 0xff:02x}" for bits in range(40, -1, -8))
    return {
        "hostname": hostname,
        "os_version": platform.platform(),
        "username": getpass.getuser(),
        "ip_address": ip_address,
        "mac_address": mac,
        "install_version": VERSION,
        "install_time": load_state().get("install_time") or utc_now(),
    }


def load_state() -> Dict[str, Any]:
    if not STATE_PATH.exists():
        return {}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(state: Dict[str, Any]) -> None:
    ensure_dirs()
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def protect_secret(text: str) -> str:
    if not text:
        return ""
    try:
        import win32crypt

        blob = win32crypt.CryptProtectData(text.encode("utf-8"), None, None, None, None, 0)
        return "dpapi:" + base64.b64encode(blob).decode("ascii")
    except Exception:
        return "plain:" + base64.b64encode(text.encode("utf-8")).decode("ascii")


def unprotect_secret(text: str) -> str:
    if not text:
        return ""
    try:
        if text.startswith("dpapi:"):
            import win32crypt

            blob = base64.b64decode(text[6:].encode("ascii"))
            return win32crypt.CryptUnprotectData(blob, None, None, None, 0)[1].decode("utf-8")
        if text.startswith("plain:"):
            return base64.b64decode(text[6:].encode("ascii")).decode("utf-8")
    except Exception:
        return ""
    return text


class GateClient:
    def __init__(self, config: Dict[str, Any]) -> None:
        self.config = config
        self.base = str(config.get("gate_server_url") or "").rstrip("/")
        self.agent_id = str(config.get("agent_id") or "")
        self.token = unprotect_secret(str(config.get("token") or ""))

    def endpoint(self, path: str) -> str:
        return self.base + path

    def request_json(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        payload = payload or {}
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        method = method.upper()
        signed_body = b"" if method == "GET" else body
        headers = {"Content-Type": "application/json", "Accept": "application/json", "User-Agent": f"LuminaGateAgent/{VERSION}"}
        if self.agent_id and self.token:
            timestamp = utc_now()
            signature = hmac.new(self.token.encode("utf-8"), timestamp.encode("utf-8") + b"." + signed_body, hashlib.sha256).hexdigest()
            headers.update({"X-Agent-Id": self.agent_id, "X-Agent-Token": self.token, "X-Timestamp": timestamp, "X-Signature": signature})
        req = request.Request(self.endpoint(path), data=body if method != "GET" else None, method=method, headers=headers)
        context = None
        if str(self.base).lower().startswith("https") and not bool(self.config.get("verify_tls", True)):
            import ssl

            context = ssl._create_unverified_context()
        with request.urlopen(req, timeout=20, context=context) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def register(self) -> Tuple[str, str]:
        response = self.request_json("POST", "/api/pc-agent/register", machine_info())
        if not response.get("success"):
            raise RuntimeError(response.get("error") or "registration failed")
        item = response.get("item") or {}
        return str(item.get("agent_id") or ""), str(item.get("token") or "")

    def policy(self) -> Dict[str, Any]:
        return self.request_json("GET", "/api/pc-agent/policy", {})

    def heartbeat(self, policy_version: str, last_error: str = "") -> None:
        info = machine_info()
        payload = {
            "agent_id": self.agent_id,
            "hostname": info["hostname"],
            "current_user": info["username"],
            "agent_version": VERSION,
            "policy_version": policy_version,
            "service_status": "RUNNING",
            "last_error": last_error,
            "timestamp": utc_now(),
        }
        self.request_json("POST", "/api/pc-agent/heartbeat", payload)

    def send_event(self, kind: str, payload: Dict[str, Any]) -> None:
        path = "/api/pc-agent/log/block" if kind == "block" else "/api/pc-agent/log/web-access"
        self.request_json("POST", path, payload)


class LocalQueue:
    def __init__(self) -> None:
        ensure_dirs()
        self.path = QUEUE_DIR / "events.ndjson"
        self.lock = threading.RLock()

    def append(self, kind: str, payload: Dict[str, Any]) -> None:
        row = {"kind": kind, "payload": payload}
        with self.lock:
            with self.path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")

    def flush(self, client: GateClient, limit: int = 200) -> int:
        with self.lock:
            if not self.path.exists():
                return 0
            rows = self.path.read_text(encoding="utf-8", errors="replace").splitlines()
            sent = 0
            remaining = []
            for line in rows:
                if sent >= limit:
                    remaining.append(line)
                    continue
                try:
                    row = json.loads(line)
                    client.send_event(row.get("kind") or "web_access", row.get("payload") or {})
                    sent += 1
                except Exception:
                    remaining.append(line)
            self.path.write_text("\n".join(remaining) + ("\n" if remaining else ""), encoding="utf-8")
            return sent


def load_policy_cache() -> Dict[str, Any]:
    if not POLICY_CACHE_PATH.exists():
        return {"policy_version": "0", "default_action": "ALLOW", "rules": []}
    try:
        return json.loads(POLICY_CACHE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"policy_version": "0", "default_action": "ALLOW", "rules": []}


def save_policy_cache(policy: Dict[str, Any]) -> None:
    POLICY_CACHE_PATH.write_text(json.dumps(policy, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


class AgentRuntime:
    def __init__(self) -> None:
        self.stop_event = threading.Event()
        self.queue = LocalQueue()
        self.last_error = ""

    def ensure_registered(self, config: Dict[str, Any]) -> Dict[str, Any]:
        if config.get("agent_id") and config.get("token"):
            return config
        client = GateClient(config)
        agent_id, token = client.register()
        config["agent_id"] = agent_id
        config["token"] = protect_secret(token)
        save_config(config)
        state = load_state()
        state.setdefault("install_time", utc_now())
        state["agent_id"] = agent_id
        save_state(state)
        logging.info("registered agent_id=%s", agent_id)
        return config

    def poll_policy(self, client: GateClient) -> Dict[str, Any]:
        try:
            response = client.policy()
            if response.get("success"):
                policy = response.get("item") or {}
                save_policy_cache(policy)
                logging.info("policy updated version=%s", policy.get("policy_version"))
                return policy
        except Exception as exc:
            self.last_error = str(exc)
            logging.warning("policy poll failed: %s", exc)
        return load_policy_cache()

    def run(self) -> None:
        config = load_config()
        setup_logging(config)
        logging.info("LuminaGateAgent starting version=%s", VERSION)
        policy = load_policy_cache()
        last_policy = 0.0
        last_heartbeat = 0.0
        last_flush = 0.0
        while not self.stop_event.is_set():
            try:
                config = self.ensure_registered(load_config())
                client = GateClient(config)
                now = time.time()
                if now - last_policy >= int(config.get("policy_poll_interval_seconds") or 60):
                    policy = self.poll_policy(client)
                    last_policy = now
                if now - last_heartbeat >= int(config.get("heartbeat_interval_seconds") or 30):
                    try:
                        client.heartbeat(str(policy.get("policy_version") or "0"), self.last_error)
                        self.last_error = ""
                    except Exception as exc:
                        self.last_error = str(exc)
                        logging.warning("heartbeat failed: %s", exc)
                    last_heartbeat = now
                if now - last_flush >= int(config.get("log_flush_interval_seconds") or 10):
                    try:
                        sent = self.queue.flush(client)
                        if sent:
                            logging.info("flushed queued events count=%s", sent)
                    except Exception as exc:
                        self.last_error = str(exc)
                    last_flush = now
            except Exception as exc:
                self.last_error = str(exc)
                logging.exception("agent loop error")
            self.stop_event.wait(1.0)
        logging.info("LuminaGateAgent stopped")

    def stop(self) -> None:
        self.stop_event.set()


try:
    import pywintypes
    import servicemanager
    import win32event
    import win32service
    import win32serviceutil

    class LuminaGateService(win32serviceutil.ServiceFramework):
        _svc_name_ = SERVICE_NAME
        _svc_display_name_ = SERVICE_DISPLAY
        _svc_description_ = SERVICE_DESCRIPTION

        def __init__(self, args: List[str]) -> None:
            super().__init__(args)
            self.stop_handle = win32event.CreateEvent(None, 0, 0, None)
            self.runtime = AgentRuntime()

        def SvcStop(self) -> None:
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            self.runtime.stop()
            win32event.SetEvent(self.stop_handle)

        def SvcDoRun(self) -> None:
            servicemanager.LogMsg(servicemanager.EVENTLOG_INFORMATION_TYPE, servicemanager.PYS_SERVICE_STARTED, (SERVICE_NAME, ""))
            worker = threading.Thread(target=self.runtime.run, daemon=True)
            worker.start()
            win32event.WaitForSingleObject(self.stop_handle, win32event.INFINITE)
            worker.join(timeout=20)

    HAS_SERVICE = True
except Exception:
    HAS_SERVICE = False


def install_service() -> None:
    if not is_admin():
        raise SystemExit("Run as administrator to install LuminaGateAgent.")
    ensure_dirs()
    source = Path(sys.executable if getattr(sys, "frozen", False) else __file__).resolve()
    if source != SERVICE_EXE:
        shutil.copy2(source, SERVICE_EXE)
    config = load_config()
    save_config(config)
    state = load_state()
    state.setdefault("install_time", utc_now())
    save_state(state)
    delete_existing_service()
    bin_path = f'"{SERVICE_EXE}" --service'
    register_service(bin_path)
    run_cmd(["sc.exe", "failure", SERVICE_NAME, "reset=", "86400", "actions=", "restart/5000/restart/5000/restart/30000"], check=True)
    run_cmd(["sc.exe", "start", SERVICE_NAME])
    verify_installation()
    print(f"Installed {SERVICE_NAME} at {SERVICE_EXE}")


def uninstall_service(purge: bool = False) -> None:
    if not is_admin():
        raise SystemExit("Run as administrator to uninstall LuminaGateAgent.")
    run_cmd(["sc.exe", "stop", SERVICE_NAME])
    run_cmd(["sc.exe", "delete", SERVICE_NAME])
    if SERVICE_EXE.exists():
        try:
            SERVICE_EXE.unlink()
        except OSError:
            pass
    if purge and PROGRAM_DATA_DIR.exists():
        shutil.rmtree(PROGRAM_DATA_DIR, ignore_errors=True)
    print(f"Removed {SERVICE_NAME}")


def run_console() -> None:
    runtime = AgentRuntime()
    try:
        runtime.run()
    except KeyboardInterrupt:
        runtime.stop()


def run_service_dispatcher() -> None:
    if not HAS_SERVICE:
        raise SystemExit("pywin32 service support is unavailable")
    servicemanager.Initialize()
    servicemanager.PrepareToHostSingle(LuminaGateService)
    servicemanager.StartServiceCtrlDispatcher()


def main(argv: Optional[List[str]] = None) -> int:
    argv = list(argv if argv is not None else sys.argv[1:])
    if "--version" in argv:
        print(VERSION)
        return 0
    if "--uninstall" in argv:
        if not ensure_admin_or_relaunch(argv, "제거"):
            return 0
        try:
            uninstall_service("--purge" in argv)
            show_message("Lumina-gate Agent", f"제거가 완료되었습니다.\n\n서비스: {SERVICE_NAME}")
        except Exception as exc:
            show_message("Lumina-gate Agent", f"제거에 실패했습니다.\n\n{exc}", error=True)
            return 1
        return 0
    if "--console" in argv:
        run_console()
        return 0
    if "--service" in argv:
        run_service_dispatcher()
        return 0
    if not ensure_admin_or_relaunch(argv, "설치"):
        return 0
    try:
        install_service()
        show_message(
            "Lumina-gate Agent",
            "설치가 완료되었습니다.\n\n"
            f"서비스: {SERVICE_NAME}\n"
            f"실행 파일: {SERVICE_EXE}\n"
            f"설정/로그: {PROGRAM_DATA_DIR}",
        )
    except Exception as exc:
        show_message("Lumina-gate Agent", f"설치에 실패했습니다.\n\n{exc}", error=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())