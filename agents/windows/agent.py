"""Lumina 자산 자동 탐색 에이전트 — Windows 서비스

사용법:
    python agent.py                     # GUI 모드
    python agent.py --once              # 1회 수집 후 종료 (콘솔)
    python agent.py --service           # Windows 서비스 디스패처 (SCM 전용)
    python agent.py --install-service   # 서비스 자동 등록 (인스톨러용)
    python agent.py install             # Windows 서비스 설치 (레거시)
    python agent.py start               # 서비스 시작 (레거시)
    python agent.py stop                # 서비스 중지 (레거시)
    python agent.py remove              # 서비스 제거 (레거시)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import subprocess
import threading
import urllib.request
import urllib.error

# 에이전트 루트를 sys.path에 추가
_AGENT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _AGENT_ROOT not in sys.path:
    sys.path.insert(0, _AGENT_ROOT)

from common.config import AgentConfig
from common.collector import build_payload, save_payload
from windows.collectors.interface import InterfaceCollector
from windows.collectors.account import AccountCollector
from windows.collectors.package import PackageCollector

# PKI 등록용 경로
_PKI_DIR = os.path.join(
    os.environ.get("ProgramData", "C:\\ProgramData"), "Lumina", "pki"
)

logger = logging.getLogger("lumina")


def _setup_logging(config: AgentConfig, gui_handler=None):
    fmt = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    )
    logger.setLevel(logging.INFO)

    # 콘솔 핸들러
    if not any(isinstance(h, logging.StreamHandler) and h.stream is sys.stdout
               for h in logger.handlers):
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(fmt)
        logger.addHandler(handler)

    # 파일 로그 (백그라운드에서 생성)
    def _init_file_handler():
        try:
            log_dir = os.path.join(config.output_dir, "logs")
            os.makedirs(log_dir, exist_ok=True)
            if not any(isinstance(h, logging.FileHandler) for h in logger.handlers):
                fh = logging.FileHandler(
                    os.path.join(log_dir, "lumina.log"), encoding="utf-8"
                )
                fh.setFormatter(fmt)
                logger.addHandler(fh)
        except Exception:
            pass

    threading.Thread(target=_init_file_handler, daemon=True).start()

    # GUI 핸들러
    if gui_handler and gui_handler not in logger.handlers:
        gui_handler.setFormatter(fmt)
        logger.addHandler(gui_handler)


def _register_agent(host: str, port: int, protocol: str,
                    token: str = "", verify_ssl: bool = False) -> tuple:
    """서버에 에이전트 등록 (CSR + 토큰 → 인증서 발급).

    Returns: (success: bool, message: str)
    성공 시 인증서를 로컬에 저장하고 경로 반환.
    """
    import ssl as _ssl
    import socket as _sock

    os.makedirs(_PKI_DIR, exist_ok=True)

    # 1) RSA 키 생성 (순수 ssl 모듈의 PEM 지원 없으므로 cryptography 사용)
    try:
        from cryptography.hazmat.primitives.asymmetric import rsa as _rsa
        from cryptography.hazmat.primitives import serialization as _ser
        from cryptography.hazmat.primitives import hashes as _hashes
        from cryptography import x509 as _x509
        from cryptography.x509.oid import NameOID as _OID
    except ImportError:
        return False, "cryptography 패키지가 필요합니다. pip install cryptography"

    key_path = os.path.join(_PKI_DIR, "agent.key")
    cert_path = os.path.join(_PKI_DIR, "agent.crt")
    ca_path = os.path.join(_PKI_DIR, "ca.crt")

    # 키 생성
    private_key = _rsa.generate_private_key(public_exponent=65537, key_size=2048)
    key_pem = private_key.private_bytes(
        _ser.Encoding.PEM, _ser.PrivateFormat.TraditionalOpenSSL, _ser.NoEncryption()
    )
    with open(key_path, "wb") as f:
        f.write(key_pem)

    # 2) CSR 생성
    hostname = _sock.gethostname()
    csr = (
        _x509.CertificateSigningRequestBuilder()
        .subject_name(_x509.Name([
            _x509.NameAttribute(_OID.COMMON_NAME, hostname),
            _x509.NameAttribute(_OID.ORGANIZATION_NAME, "Blossom Agent"),
        ]))
        .sign(private_key, _hashes.SHA256())
    )
    csr_pem = csr.public_bytes(_ser.Encoding.PEM).decode("utf-8")

    # 3) 서버에 등록 요청
    url = f"{protocol}://{host}:{port}/api/agent/register"
    payload = {"csr": csr_pem, "hostname": hostname}
    if token:
        payload["token"] = token
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    ctx = _ssl.create_default_context()
    if not verify_ssl:
        ctx.check_hostname = False
        ctx.verify_mode = _ssl.CERT_NONE

    req = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode("utf-8"))
            return False, err_body.get("error", f"HTTP {e.code}")
        except Exception:
            return False, f"서버 응답 오류 (HTTP {e.code})"
    except Exception as e:
        return False, f"서버 연결 실패: {e}"

    if not result.get("success"):
        return False, result.get("error", "등록 실패")

    # 4) 인증서 저장
    with open(cert_path, "w", encoding="utf-8") as f:
        f.write(result["client_cert"])
    with open(ca_path, "w", encoding="utf-8") as f:
        f.write(result["ca_cert"])

    logger.info("에이전트 등록 완료 — 인증서 저장 성공")
    return True, "등록 완료"


def _is_registered() -> bool:
    """로컬에 유효한 인증서 파일이 있는지 확인"""
    return (
        os.path.isfile(os.path.join(_PKI_DIR, "agent.crt"))
        and os.path.isfile(os.path.join(_PKI_DIR, "agent.key"))
        and os.path.isfile(os.path.join(_PKI_DIR, "ca.crt"))
    )


def _get_pki_paths() -> dict:
    """PKI 인증서 경로 반환"""
    return {
        "ca_cert": os.path.join(_PKI_DIR, "ca.crt"),
        "client_cert": os.path.join(_PKI_DIR, "agent.crt"),
        "client_key": os.path.join(_PKI_DIR, "agent.key"),
    }


def _build_ssl_context(config: AgentConfig):
    """설정에 따라 SSL context 생성 (HTTPS / mTLS 지원)"""
    import ssl
    if config.ca_cert and os.path.isfile(config.ca_cert):
        ctx = ssl.create_default_context(cafile=config.ca_cert)
    else:
        ctx = ssl.create_default_context()

    if not config.verify_ssl:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    # mTLS: 클라이언트 인증서 + 개인키
    if config.client_cert and os.path.isfile(config.client_cert):
        key_file = config.client_key if (config.client_key and os.path.isfile(config.client_key)) else None
        ctx.load_cert_chain(certfile=config.client_cert, keyfile=key_file)

    return ctx


def _push_to_server(config: AgentConfig, payload: dict) -> bool:
    """수집 결과를 서버로 전송. 성공 시 True, 실패 시 False (로컬 저장 fallback)."""
    if not config.server_url:
        return False
    try:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            config.server_url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        ctx = _build_ssl_context(config)
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            logger.info("서버 전송 완료 (status=%d, url=%s)", resp.status, config.server_url)
            return True
    except (urllib.error.URLError, OSError) as e:
        logger.warning("서버 전송 실패 → 로컬 저장 (error=%s)", e)
        return False


def _test_server_connection(config: AgentConfig) -> tuple:
    """서버 연결 테스트. (success: bool, message: str)"""
    if not config.server_host:
        return False, "서버 주소가 설정되지 않았습니다."
    try:
        url = f"{config.server_protocol}://{config.server_host}:{config.server_port}/api/agent/ping"
        ctx = _build_ssl_context(config)
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=5, context=ctx) as resp:
            return True, f"연결 성공 (HTTP {resp.status})"
    except Exception as e:
        return False, str(e)


def _send_heartbeat(config: AgentConfig):
    """서버에 heartbeat 전송 (에이전트 상태 알림)"""
    if not config.server_host:
        return
    import socket
    try:
        url = f"{config.server_protocol}://{config.server_host}:{config.server_port}/api/agent/heartbeat"
        body = json.dumps({"hostname": config.hostname or socket.gethostname()}).encode("utf-8")
        ctx = _build_ssl_context(config)
        req = urllib.request.Request(
            url, data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5, context=ctx):
            pass
    except Exception:
        pass  # heartbeat 실패는 무시


def run_once(config: AgentConfig):
    """수집 1회 실행"""
    collectors = []
    if "interface" in config.collectors:
        collectors.append(InterfaceCollector())
    if "account" in config.collectors:
        collectors.append(AccountCollector())
    if "package" in config.collectors:
        collectors.append(PackageCollector())

    logger.info("수집 시작 (hostname=%s, collectors=%s)",
                config.hostname, [c.name for c in collectors])
    payload = build_payload(collectors)

    # 서버 전송 시도 → 실패 시 로컬 JSON 저장
    if not _push_to_server(config, payload):
        out_path = config.output_path()
        save_payload(payload, out_path)
        logger.info("수집 완료 → %s", out_path)
    else:
        logger.info("수집 완료 → 서버 전송 성공")


# ── Windows 서비스 구현 ────────────────────────────────
try:
    import servicemanager
    import win32event
    import win32service
    import win32serviceutil

    class LuminaService(win32serviceutil.ServiceFramework):
        _svc_name_ = "Lumina"
        _svc_display_name_ = "Lumina 자산 자동 탐색 에이전트"
        _svc_description_ = "호스트의 인터페이스, 계정, 패키지 정보를 자동 수집하여 서버로 전송합니다."

        def __init__(self, args):
            win32serviceutil.ServiceFramework.__init__(self, args)
            self._stop_event = win32event.CreateEvent(None, 0, 0, None)
            self._running = True

        def SvcStop(self):
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            self._running = False
            win32event.SetEvent(self._stop_event)

        def SvcDoRun(self):
            servicemanager.LogMsg(
                servicemanager.EVENTLOG_INFORMATION_TYPE,
                servicemanager.PYS_SERVICE_STARTED,
                (self._svc_name_, ""),
            )
            config = AgentConfig()
            _setup_logging(config)
            logger.info("Windows 서비스 시작")

            while self._running:
                try:
                    # 매 사이클마다 설정 파일 재로드 (GUI에서 변경된 주기 등 반영)
                    config._load()
                    run_once(config)
                    _send_heartbeat(config)
                except Exception:
                    logger.exception("수집 사이클 중 오류")

                # heartbeat를 수집 주기보다 자주 보냄 (60초 간격)
                elapsed = 0
                hb_interval = min(60, config.interval)
                while self._running and elapsed < config.interval:
                    wait_ms = min(hb_interval, config.interval - elapsed) * 1000
                    rc = win32event.WaitForSingleObject(
                        self._stop_event, wait_ms
                    )
                    if rc == win32event.WAIT_OBJECT_0:
                        self._running = False
                        break
                    elapsed += hb_interval
                    if elapsed < config.interval:
                        try:
                            _send_heartbeat(config)
                        except Exception:
                            pass

            logger.info("Windows 서비스 종료")

    _HAS_WIN32 = True
except ImportError:
    _HAS_WIN32 = False


# ── 서비스 제어 유틸리티 ──────────────────────────────
_CREATE_NO_WINDOW = 0x08000000


def _is_service_installed():
    """Lumina 서비스 등록 여부 확인"""
    try:
        r = subprocess.run(
            ['sc', 'query', 'Lumina'],
            capture_output=True, text=True,
            creationflags=_CREATE_NO_WINDOW,
        )
        return 'SERVICE_NAME: Lumina' in r.stdout
    except Exception:
        return False


def _is_service_running():
    """Lumina 서비스 실행 중 여부"""
    try:
        r = subprocess.run(
            ['sc', 'query', 'Lumina'],
            capture_output=True, text=True,
            creationflags=_CREATE_NO_WINDOW,
        )
        return r.returncode == 0 and 'RUNNING' in r.stdout
    except Exception:
        return False


def _is_admin():
    """현재 프로세스가 관리자 권한인지 확인"""
    try:
        import ctypes
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False


def _service_install():
    """Lumina Windows 서비스를 등록한다 (관리자 권한 필요 → UAC 자동 요청)."""
    if _is_service_installed():
        return True, "이미 등록됨"

    if not _HAS_WIN32:
        return False, "pywin32 패키지가 필요합니다 (pip install pywin32)"

    # 관리자 권한이 없으면 UAC 권한 상승으로 --install-service 실행
    if not _is_admin():
        try:
            import ctypes
            if getattr(sys, 'frozen', False):
                exe = sys.executable
                params = "--install-service"
            else:
                exe = sys.executable
                params = '"{}" --install-service'.format(os.path.abspath(__file__))
            ret = ctypes.windll.shell32.ShellExecuteW(
                None, "runas", exe, params, None, 0)
            if ret > 32:
                # UAC 승인됨 — 서비스 등록 프로세스가 별도 실행됨, 완료 대기
                import time
                for _ in range(30):
                    time.sleep(0.5)
                    if _is_service_installed():
                        return True, "서비스 등록 완료 (UAC)"
                return False, "서비스 등록 시간 초과"
            else:
                return False, "UAC 권한 상승 거부됨"
        except Exception as e:
            return False, str(e)

    # 관리자 권한으로 직접 등록
    if getattr(sys, 'frozen', False):
        binpath = '"{}" --service'.format(sys.executable)
    else:
        binpath = '"{}" "{}" --service'.format(sys.executable, os.path.abspath(__file__))

    try:
        hscm = win32service.OpenSCManager(
            None, None, win32service.SC_MANAGER_ALL_ACCESS)
        try:
            hs = win32service.CreateService(
                hscm, "Lumina",
                "Lumina Agent",
                win32service.SERVICE_ALL_ACCESS,
                win32service.SERVICE_WIN32_OWN_PROCESS,
                win32service.SERVICE_AUTO_START,
                win32service.SERVICE_ERROR_NORMAL,
                binpath, None, 0, None, None, None,
            )
            try:
                win32service.ChangeServiceConfig2(
                    hs, win32service.SERVICE_CONFIG_DESCRIPTION,
                    "호스트의 인터페이스, 계정, 패키지 정보를 자동 수집하여 서버로 전송합니다.",
                )
            finally:
                win32service.CloseServiceHandle(hs)
        finally:
            win32service.CloseServiceHandle(hscm)
        return True, "서비스 등록 완료"
    except Exception as e:
        return False, str(e)


def _service_start():
    """서비스 시작. 관리자 권한 필요 시 UAC 요청."""
    if _is_service_running():
        return True
    # 관리자 권한 없으면 UAC로 sc start 실행
    if not _is_admin():
        try:
            import ctypes
            ret = ctypes.windll.shell32.ShellExecuteW(
                None, "runas", "sc", "start Lumina", None, 0)
            if ret > 32:
                import time
                for _ in range(20):
                    time.sleep(0.5)
                    if _is_service_running():
                        return True
            return False
        except Exception:
            return False
    try:
        r = subprocess.run(
            ['sc', 'start', 'Lumina'],
            capture_output=True, text=True,
            creationflags=_CREATE_NO_WINDOW,
        )
        return r.returncode == 0
    except Exception:
        return False


def _service_stop():
    """서비스 중지. 성공 시 True."""
    try:
        subprocess.run(
            ['sc', 'stop', 'Lumina'],
            capture_output=True, text=True,
            creationflags=_CREATE_NO_WINDOW,
        )
        return True
    except Exception:
        return False


# ── 자동 시작 (레지스트리) ─────────────────────────────
_REG_RUN_KEY = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
_REG_VALUE_NAME = "Lumina"


def _apply_auto_start(enable: bool):
    """Windows 로그온 시 자동 시작 레지스트리 설정/해제"""
    import winreg
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, _REG_RUN_KEY,
                             0, winreg.KEY_SET_VALUE)
        if enable:
            if getattr(sys, 'frozen', False):
                exe_path = sys.executable
            else:
                exe_path = '"{}" "{}"'.format(sys.executable, os.path.abspath(__file__))
            winreg.SetValueEx(key, _REG_VALUE_NAME, 0, winreg.REG_SZ, exe_path)
            logger.info("자동 시작 등록")
        else:
            try:
                winreg.DeleteValue(key, _REG_VALUE_NAME)
                logger.info("자동 시작 해제")
            except FileNotFoundError:
                pass
        winreg.CloseKey(key)
    except Exception:
        logger.warning("자동 시작 레지스트리 설정 실패")


# ── GUI 로그 핸들러 ────────────────────────────────────
class _GuiLogHandler(logging.Handler):
    """로그를 메모리 버퍼에 쌓아 두고 GUI에서 폴링"""

    def __init__(self, maxlen=2000):
        super().__init__()
        self._buffer = []
        self._maxlen = maxlen
        self._cursor = 0
        self._lock = threading.Lock()

    def emit(self, record):
        msg = self.format(record)
        with self._lock:
            self._buffer.append(msg)
            if len(self._buffer) > self._maxlen:
                self._buffer = self._buffer[-self._maxlen:]

    def get_new(self):
        with self._lock:
            new = self._buffer[self._cursor:]
            self._cursor = len(self._buffer)
            return new

    def clear(self):
        with self._lock:
            self._buffer.clear()
            self._cursor = 0


# ── CustomTkinter GUI ─────────────────────────────────
def _run_gui(config: AgentConfig):
    import customtkinter as ctk

    # ── 시스템 트레이 지원 ──
    _HAS_TRAY = False
    try:
        import pystray
        from PIL import Image
        _HAS_TRAY = True
    except ImportError:
        pass

    _tray_icon = [None]

    # ── 백그라운드 수집 ──
    _stop_evt = threading.Event()
    _worker = [None]
    _using_service = [False]

    log_handler = _GuiLogHandler()
    _setup_logging(config, gui_handler=log_handler)

    def _collection_loop():
        while not _stop_evt.is_set():
            try:
                config._load()
                run_once(config)
                _send_heartbeat(config)
            except Exception:
                logger.exception("수집 사이클 중 오류")
            hb_interval = min(60, config.interval)
            elapsed = 0
            while not _stop_evt.is_set() and elapsed < config.interval:
                _stop_evt.wait(hb_interval)
                elapsed += hb_interval
                if not _stop_evt.is_set() and elapsed < config.interval:
                    try:
                        _send_heartbeat(config)
                    except Exception:
                        pass

    def _start_worker():
        if _worker[0] and _worker[0].is_alive():
            return
        _stop_evt.clear()
        t = threading.Thread(target=_collection_loop, daemon=True)
        t.start()
        _worker[0] = t
        logger.info("에이전트 시작 — 스레드 모드 (interval=%ds)", config.interval)

    def _stop_worker():
        _stop_evt.set()
        logger.info("에이전트 중지 요청")

    def _do_agent_start():
        """에이전트 시작 로직"""
        if not config.server_host:
            return {"success": False, "message": "서버 IP를 입력하세요."}
        try:
            if not _is_registered():
                logger.info("미등록 상태 — 자동 등록 시도")
                ok, msg = _register_agent(
                    config.server_host, config.server_port,
                    config.server_protocol,
                    verify_ssl=config.verify_ssl)
                if ok:
                    pki = _get_pki_paths()
                    config.ca_cert = pki["ca_cert"]
                    config.client_cert = pki["client_cert"]
                    config.client_key = pki["client_key"]
                    config.save()
                    logger.info("자동 등록 성공")
                else:
                    logger.warning("자동 등록 실패: %s — 등록 없이 계속 실행", msg)

            ok_inst, inst_msg = _service_install()
            if ok_inst:
                if _is_service_running():
                    logger.info("설정 변경 반영을 위해 서비스 재시작")
                    _service_stop()
                    import time as _t
                    for _ in range(20):
                        if not _is_service_running():
                            break
                        _t.sleep(0.5)
                if _service_start() or _is_service_running():
                    _using_service[0] = True
                    logger.info("에이전트 시작 — 서비스 모드 (백그라운드)")
                    return {"success": True,
                            "message": "서비스 실행 중 (창을 닫아도 백그라운드 동작)"}

            _using_service[0] = False
            _start_worker()
            return {"success": True,
                    "message": "에이전트 실행 중 (창을 닫으면 트레이로 최소화)"}
        except Exception as e:
            logger.exception("에이전트 시작 실패")
            return {"success": False, "message": str(e)}

    def _do_agent_stop():
        try:
            if _using_service[0]:
                _service_stop()
                _using_service[0] = False
                logger.info("서비스 중지 완료")
            else:
                _stop_worker()
            return {"success": True, "message": "에이전트 중지됨"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def _do_agent_restart():
        try:
            if _using_service[0]:
                _service_stop()
                _using_service[0] = False
                import time as _t
                for _ in range(20):
                    if not _is_service_running():
                        break
                    _t.sleep(0.5)
            else:
                _stop_worker()
            logger.info("에이전트 재시작 — 중지 완료, 시작 중...")
            return _do_agent_start()
        except Exception as e:
            return {"success": False, "message": str(e)}

    # ── 테마 & 색상 ──
    ctk.set_appearance_mode("light")
    ctk.set_default_color_theme("blue")

    ACCENT = "#4f46e5"
    ACCENT_H = "#4338ca"
    ACCENT_LIGHT = "#eef2ff"
    OK_GREEN = "#059669"
    OK_BG = "#ecfdf5"
    STOP_GRAY = "#6b7280"
    WARN_ORANGE = "#d97706"
    ERR_RED = "#dc2626"
    ERR_BG = "#fef2f2"
    BG = "#f1f5f9"
    CARD = "#ffffff"
    FG = "#0f172a"
    SUB = "#64748b"
    BORDER = "#e2e8f0"
    INPUT_BG = "#f8fafc"

    # ── 윈도우 ──
    app = ctk.CTk()
    app.title("Lumina Agent")
    app.geometry("580x700")
    app.resizable(False, False)
    app.configure(fg_color=BG)

    # 아이콘 설정
    ico_path = None
    if getattr(sys, 'frozen', False):
        ico_path = os.path.join(os.path.dirname(sys.executable), "lumina.ico")
    else:
        ico_path = os.path.join(os.path.dirname(__file__), "lumina.ico")
    if os.path.isfile(ico_path):
        app.iconbitmap(ico_path)

    # ── 헤더 바 (인디고 그라데이션 느낌) ──
    header = ctk.CTkFrame(app, fg_color=ACCENT, height=52, corner_radius=0)
    header.pack(fill="x")
    header.pack_propagate(False)

    hdr_inner = ctk.CTkFrame(header, fg_color="transparent")
    hdr_inner.pack(side="left", padx=24, pady=0, fill="y")

    ctk.CTkLabel(hdr_inner, text="Lumina Agent", font=("Segoe UI Semibold", 17),
                 text_color="white").pack(side="left", pady=14)
    ctk.CTkLabel(hdr_inner, text="1.0.1", font=("Segoe UI", 10),
                 text_color=ACCENT, fg_color="white", corner_radius=6,
                 width=42, height=20).pack(side="left", padx=(10, 0))

    hdr_right = ctk.CTkFrame(header, fg_color="transparent")
    hdr_right.pack(side="right", padx=24, fill="y")

    status_dot = ctk.CTkLabel(hdr_right, text="●", font=("Segoe UI", 12),
                              text_color="#a5b4fc")
    status_dot.pack(side="right", pady=16)
    status_label = ctk.CTkLabel(hdr_right, text="중지됨", font=("Segoe UI", 11),
                                text_color="#c7d2fe")
    status_label.pack(side="right", padx=(0, 6))

    # ── 스크롤 가능한 메인 영역 ──
    main_frame = ctk.CTkFrame(app, fg_color=BG, corner_radius=0)
    main_frame.pack(fill="both", expand=True, padx=0, pady=0)

    # ── 탭뷰 ──
    tabview = ctk.CTkTabview(main_frame, fg_color=CARD,
                             segmented_button_fg_color=BORDER,
                             segmented_button_selected_color=ACCENT,
                             segmented_button_selected_hover_color=ACCENT_H,
                             segmented_button_unselected_color=CARD,
                             segmented_button_unselected_hover_color=ACCENT_LIGHT,
                             border_width=1, border_color=BORDER,
                             corner_radius=12)
    tabview.pack(padx=18, pady=(14, 14), fill="both", expand=True)
    tabview._segmented_button.configure(font=("Segoe UI Semibold", 12))

    tab_config = tabview.add("서버 설정")
    tab_reg = tabview.add("에이전트 등록")
    tab_log = tabview.add("로그")

    # ═══════════════════════════════════════════════
    # 탭1: 서버 설정
    # ═══════════════════════════════════════════════
    # 서버 연결 카드
    conn_card = ctk.CTkFrame(tab_config, fg_color=CARD, corner_radius=0,
                              border_width=0)
    conn_card.pack(fill="x", padx=8, pady=(8, 0))

    ctk.CTkLabel(conn_card, text="서버 연결", font=("Segoe UI Semibold", 14),
                 text_color=FG).pack(anchor="w", padx=4, pady=(4, 10))

    # 폼 그리드
    form = ctk.CTkFrame(conn_card, fg_color="transparent")
    form.pack(fill="x", padx=4)
    form.columnconfigure(1, weight=1)

    ROW_PAD = (0, 10)

    # Protocol (HTTPS only)
    ctk.CTkLabel(form, text="Protocol", font=("Segoe UI", 12),
                 text_color=SUB).grid(row=0, column=0, sticky="w", pady=ROW_PAD)
    proto_var = ctk.StringVar(value="https")
    proto_label = ctk.CTkLabel(form, text="HTTPS", font=("Segoe UI", 12, "bold"),
                               text_color=ACCENT)
    proto_label.grid(row=0, column=1, sticky="w", padx=(16, 0), pady=ROW_PAD)

    # Server IP
    ctk.CTkLabel(form, text="Server IP", font=("Segoe UI", 12),
                 text_color=SUB).grid(row=1, column=0, sticky="w", pady=ROW_PAD)
    host_entry = ctk.CTkEntry(form, placeholder_text="e.g. 192.168.1.100",
                              font=("Segoe UI", 12), height=36,
                              corner_radius=8, border_width=1,
                              border_color=BORDER, fg_color=INPUT_BG)
    host_entry.grid(row=1, column=1, sticky="ew", padx=(16, 0), pady=ROW_PAD)
    if config.server_host:
        host_entry.insert(0, config.server_host)

    # 포트
    ctk.CTkLabel(form, text="포트", font=("Segoe UI", 12),
                 text_color=SUB).grid(row=2, column=0, sticky="w", pady=ROW_PAD)
    port_entry = ctk.CTkEntry(form, font=("Segoe UI", 12), height=36,
                              corner_radius=8, border_width=1,
                              border_color=BORDER, fg_color=INPUT_BG)
    port_entry.grid(row=2, column=1, sticky="ew", padx=(16, 0), pady=ROW_PAD)
    port_entry.insert(0, str(config.server_port))

    # 수집 주기
    ctk.CTkLabel(form, text="수집 주기(초)", font=("Segoe UI", 12),
                 text_color=SUB).grid(row=3, column=0, sticky="w", pady=ROW_PAD)
    interval_entry = ctk.CTkEntry(form, font=("Segoe UI", 12), height=36,
                                  corner_radius=8, border_width=1,
                                  border_color=BORDER, fg_color=INPUT_BG)
    interval_entry.grid(row=3, column=1, sticky="ew", padx=(16, 0), pady=ROW_PAD)
    interval_entry.insert(0, f"{config.interval:,}")

    def _fmt_interval(event=None):
        raw = interval_entry.get()
        cursor = interval_entry.index("insert")
        digits_before = sum(1 for c in raw[:cursor] if c.isdigit())
        digits_only = "".join(c for c in raw if c.isdigit())
        if not digits_only:
            return
        formatted = f"{int(digits_only):,}"
        interval_entry.delete(0, "end")
        interval_entry.insert(0, formatted)
        new_cursor = 0
        count = 0
        for i, ch in enumerate(formatted):
            if ch.isdigit():
                count += 1
            if count == digits_before:
                new_cursor = i + 1
                break
        else:
            new_cursor = len(formatted)
        interval_entry.icursor(new_cursor)

    interval_entry.bind("<KeyRelease>", _fmt_interval)

    # 옵션 행
    opt_frame = ctk.CTkFrame(conn_card, fg_color="transparent")
    opt_frame.pack(fill="x", padx=4, pady=(4, 0))

    ssl_var = ctk.BooleanVar(value=config.verify_ssl)
    ctk.CTkSwitch(opt_frame, text="SSL 인증서 검증", variable=ssl_var,
                  font=("Segoe UI", 12), text_color=SUB,
                  button_color=ACCENT, button_hover_color=ACCENT_H,
                  progress_color=ACCENT_LIGHT,
                  height=24).pack(anchor="w", pady=(0, 6))

    auto_var = ctk.BooleanVar(value=config.auto_start)
    ctk.CTkSwitch(opt_frame, text="시스템 시작 시 자동 실행",
                  variable=auto_var, font=("Segoe UI", 12), text_color=SUB,
                  button_color=ACCENT, button_hover_color=ACCENT_H,
                  progress_color=ACCENT_LIGHT,
                  height=24).pack(anchor="w", pady=(0, 4))

    # 버튼 + 메시지
    btn_frame = ctk.CTkFrame(conn_card, fg_color="transparent")
    btn_frame.pack(fill="x", padx=4, pady=(14, 4))

    BTN_W = 130
    ctk.CTkButton(btn_frame, text="저장", font=("Segoe UI Semibold", 12),
                  fg_color=ACCENT, hover_color=ACCENT_H, height=36,
                  width=BTN_W, corner_radius=8,
                  command=lambda: _save_config()).pack(side="left", padx=(0, 8))
    ctk.CTkButton(btn_frame, text="연결 테스트", font=("Segoe UI", 12),
                  fg_color="transparent", hover_color=ACCENT_LIGHT,
                  text_color=ACCENT, border_width=1, border_color=ACCENT,
                  height=36, width=BTN_W, corner_radius=8,
                  command=lambda: _test_conn()).pack(side="left")

    msg_label = ctk.CTkLabel(conn_card, text="", font=("Segoe UI", 11),
                             text_color=OK_GREEN)
    msg_label.pack(anchor="w", padx=4, pady=(4, 8))

    def _save_config():
        config.server_protocol = proto_var.get()
        config.server_host = host_entry.get().strip()
        config.server_port = int(port_entry.get().strip() or "8080")
        config.interval = int(interval_entry.get().replace(",", "").strip() or "3600")
        config.verify_ssl = ssl_var.get()
        config.auto_start = auto_var.get()
        config.save()
        _apply_auto_start(config.auto_start)
        logger.info("설정 저장 완료 (server=%s, interval=%ds)",
                    config.server_url, config.interval)
        msg_label.configure(text="✓ 설정이 저장되었습니다.", text_color=OK_GREEN)

    def _test_conn():
        host = host_entry.get().strip()
        if not host:
            msg_label.configure(text="✗ 서버 IP를 입력하세요.", text_color=ERR_RED)
            return
        port = int(port_entry.get().strip() or "8080")
        proto = proto_var.get()
        verify = ssl_var.get()
        config.server_host = host
        config.server_port = port
        config.server_protocol = proto
        config.verify_ssl = verify
        url = f"{proto}://{host}:{port}/api/agent/ping"
        msg_label.configure(text="⟳ 연결 테스트 중...", text_color=SUB)
        app.update()
        try:
            ctx = _build_ssl_context(config)
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=5, context=ctx) as resp:
                msg_label.configure(text=f"✓ 연결 성공 (HTTP {resp.status})",
                                    text_color=OK_GREEN)
        except Exception as e:
            msg_label.configure(text=f"✗ 연결 실패: {e}", text_color=ERR_RED)

    # ═══════════════════════════════════════════════
    # 에이전트 제어 (서버 설정 탭 내부)
    # ═══════════════════════════════════════════════
    ctrl_sep = ctk.CTkFrame(tab_config, fg_color=BORDER, height=1)
    ctrl_sep.pack(fill="x", padx=12, pady=(10, 0))

    ctrl_inner = ctk.CTkFrame(tab_config, fg_color="transparent")
    ctrl_inner.pack(fill="x", padx=12, pady=(12, 8))

    ctk.CTkLabel(ctrl_inner, text="에이전트 제어",
                 font=("Segoe UI Semibold", 14),
                 text_color=FG).pack(anchor="w", pady=(0, 12))

    # ── 제어 버튼 아이콘 (PIL) ──
    from PIL import ImageDraw
    import math as _m
    _IC = 64
    CTRL_BTN = "#4f46e5"
    CTRL_BTN_H = "#6366f1"

    def _ctrl_ico(fn):
        im = Image.new("RGBA", (_IC, _IC), (0, 0, 0, 0))
        fn(ImageDraw.Draw(im))
        return ctk.CTkImage(light_image=im, dark_image=im, size=(16, 16))

    ico_play = _ctrl_ico(
        lambda d: d.polygon([(16, 8), (52, 32), (16, 56)], fill="white"))
    ico_stop = _ctrl_ico(
        lambda d: d.rounded_rectangle([(14, 14), (50, 50)], radius=5, fill="white"))
    def _draw_refresh(d):
        bb = (8, 8, 56, 56)
        d.arc(bb, 200, 340, fill="white", width=6)
        d.arc(bb, 20, 160, fill="white", width=6)
        cx, cy, r = 32, 32, 24
        for ang, sign in ((340, 1), (160, -1)):
            a = _m.radians(ang)
            ex, ey = cx + r * _m.cos(a), cy + r * _m.sin(a)
            ta = a + _m.pi / 2
            pa = ta + _m.pi / 2
            tip = (ex + 10 * _m.cos(ta), ey + 10 * _m.sin(ta))
            b1 = (ex + 5 * _m.cos(pa), ey + 5 * _m.sin(pa))
            b2 = (ex - 5 * _m.cos(pa), ey - 5 * _m.sin(pa))
            d.polygon([tip, b1, b2], fill="white")
    ico_refresh = _ctrl_ico(_draw_refresh)

    ctrl_btn_frame = ctk.CTkFrame(ctrl_inner, fg_color="transparent")
    ctrl_btn_frame.pack(fill="x")

    ctrl_msg = ctk.CTkLabel(ctrl_inner, text="", font=("Segoe UI", 11),
                            text_color=SUB)
    ctrl_msg.pack(anchor="w", pady=(10, 0))

    def _on_start():
        ctrl_msg.configure(text="⟳ 시작 중...", text_color=SUB)
        app.update()
        def do():
            r = _do_agent_start()
            app.after(0, lambda: ctrl_msg.configure(
                text=("✓ " if r["success"] else "✗ ") + r["message"],
                text_color=OK_GREEN if r["success"] else ERR_RED))
        threading.Thread(target=do, daemon=True).start()

    def _on_stop():
        r = _do_agent_stop()
        ctrl_msg.configure(
            text=("✓ " if r["success"] else "✗ ") + r["message"],
            text_color=OK_GREEN if r["success"] else ERR_RED)

    def _on_restart():
        ctrl_msg.configure(text="⟳ 재시작 중...", text_color=SUB)
        app.update()
        def do():
            r = _do_agent_restart()
            app.after(0, lambda: ctrl_msg.configure(
                text=("✓ " if r["success"] else "✗ ") + r["message"],
                text_color=OK_GREEN if r["success"] else ERR_RED))
        threading.Thread(target=do, daemon=True).start()

    ctk.CTkButton(ctrl_btn_frame, text="", image=ico_play,
                  fg_color=CTRL_BTN, hover_color=CTRL_BTN_H, height=38,
                  width=48, corner_radius=8,
                  command=_on_start).pack(side="left", padx=(0, 10))
    ctk.CTkButton(ctrl_btn_frame, text="", image=ico_stop,
                  fg_color=CTRL_BTN, hover_color=CTRL_BTN_H, height=38,
                  width=48, corner_radius=8,
                  command=_on_stop).pack(side="left", padx=(0, 10))
    ctk.CTkButton(ctrl_btn_frame, text="", image=ico_refresh,
                  fg_color=CTRL_BTN, hover_color=CTRL_BTN_H, height=38,
                  width=48, corner_radius=8,
                  command=_on_restart).pack(side="left")

    # ═══════════════════════════════════════════════
    # 탭2: 에이전트 등록
    # ═══════════════════════════════════════════════
    reg_frame = ctk.CTkFrame(tab_reg, fg_color="transparent")
    reg_frame.pack(fill="both", expand=True, padx=16, pady=16)

    # 등록 상태 배지
    reg_status_label = ctk.CTkLabel(reg_frame, text="",
                                    font=("Segoe UI Semibold", 13),
                                    text_color=FG, height=30,
                                    corner_radius=6)
    reg_status_label.pack(anchor="w", pady=(0, 16))

    # 인증서 상태 카드
    cert_card = ctk.CTkFrame(reg_frame, fg_color=INPUT_BG, corner_radius=10,
                              border_width=1, border_color=BORDER)
    cert_card.pack(fill="x")

    cert_grid = ctk.CTkFrame(cert_card, fg_color="transparent")
    cert_grid.pack(fill="x", padx=20, pady=16)
    cert_grid.columnconfigure(1, weight=1)

    def _make_cert_row(parent, row, label_text):
        ctk.CTkLabel(parent, text=label_text, font=("Segoe UI", 12),
                     text_color=SUB).grid(row=row, column=0, sticky="w",
                                          pady=(0, 8))
        val = ctk.CTkLabel(parent, text="", font=("Segoe UI Semibold", 12),
                           text_color=FG)
        val.grid(row=row, column=1, sticky="e", pady=(0, 8))
        return val

    ca_val = _make_cert_row(cert_grid, 0, "CA 인증서")
    cert_val = _make_cert_row(cert_grid, 1, "클라이언트 인증서")
    key_val = _make_cert_row(cert_grid, 2, "개인키")

    def _update_reg_status():
        registered = _is_registered()
        pki = _get_pki_paths()
        if registered:
            reg_status_label.configure(text="  ● 등록됨  ", fg_color=OK_BG,
                                       text_color=OK_GREEN)
        else:
            reg_status_label.configure(text="  ● 미등록  ", fg_color=ERR_BG,
                                       text_color=ERR_RED)
        def _fstat(path):
            if os.path.isfile(path):
                return ("있음", OK_GREEN)
            return ("없음", ERR_RED)
        t, c = _fstat(pki["ca_cert"])
        ca_val.configure(text=t, text_color=c)
        t, c = _fstat(pki["client_cert"])
        cert_val.configure(text=t, text_color=c)
        t, c = _fstat(pki["client_key"])
        key_val.configure(text=t, text_color=c)

    _update_reg_status()

    # ═══════════════════════════════════════════════
    # 탭3: 로그
    # ═══════════════════════════════════════════════
    log_frame = ctk.CTkFrame(tab_log, fg_color="transparent")
    log_frame.pack(fill="both", expand=True, padx=4, pady=(4, 4))

    log_text = ctk.CTkTextbox(log_frame, font=("Cascadia Code", 11),
                              fg_color="#1e1e2e", text_color="#cdd6f4",
                              scrollbar_button_color="#585b70",
                              scrollbar_button_hover_color="#7f849c",
                              corner_radius=10, wrap="word",
                              state="disabled", height=400)
    log_text.pack(fill="both", expand=True)

    log_btn_frame = ctk.CTkFrame(log_frame, fg_color="transparent")
    log_btn_frame.pack(fill="x", pady=(6, 0))

    def _clear_log():
        log_handler.clear()
        log_text.configure(state="normal")
        log_text.delete("1.0", "end")
        log_text.configure(state="disabled")

    ctk.CTkButton(log_btn_frame, text="로그 지우기", font=("Segoe UI", 11),
                  fg_color="transparent", hover_color=ACCENT_LIGHT,
                  text_color=SUB, border_width=1, border_color=BORDER,
                  height=30, width=100, corner_radius=8,
                  command=_clear_log).pack(side="right")

    # ── 폴링: 상태 + 로그 ──
    def _poll():
        # 상태 업데이트
        running_svc = _is_service_running()
        running_thr = _worker[0] is not None and _worker[0].is_alive()
        running = _using_service[0] or running_svc or running_thr
        if running:
            status_dot.configure(text_color="#4ade80")
            status_label.configure(text="실행 중", text_color="#bbf7d0")
        else:
            status_dot.configure(text_color="#a5b4fc")
            status_label.configure(text="중지됨", text_color="#c7d2fe")

        # 로그 업데이트
        new_logs = log_handler.get_new()
        if new_logs:
            log_text.configure(state="normal")
            for line in new_logs:
                log_text.insert("end", line + "\n")
            log_text.see("end")
            log_text.configure(state="disabled")

        # 등록 상태
        _update_reg_status()

        app.after(2000, _poll)

    app.after(1000, _poll)

    # ── 트레이 아이콘 ──
    def _show_window_from_tray():
        if _tray_icon[0]:
            _tray_icon[0].stop()
            _tray_icon[0] = None
        app.after(0, app.deiconify)

    def _quit_from_tray():
        if _tray_icon[0]:
            _tray_icon[0].stop()
            _tray_icon[0] = None
        if not _using_service[0]:
            _stop_worker()
        app.after(0, app.destroy)

    def _minimize_to_tray():
        app.withdraw()
        _ico_path = ico_path
        try:
            image = Image.open(_ico_path)
        except Exception:
            image = Image.new('RGB', (64, 64), color=(99, 102, 241))
        menu = pystray.Menu(
            pystray.MenuItem("열기", lambda: _show_window_from_tray(),
                             default=True),
            pystray.MenuItem("종료", lambda: _quit_from_tray()),
        )
        icon = pystray.Icon("Lumina", image, "Lumina Agent", menu)
        _tray_icon[0] = icon
        threading.Thread(target=icon.run, daemon=True).start()

    def _on_closing():
        agent_active = (
            _using_service[0]
            or (_worker[0] is not None and _worker[0].is_alive())
        )
        if agent_active and _HAS_TRAY:
            _minimize_to_tray()
        else:
            if not _using_service[0]:
                _stop_worker()
            app.destroy()

    app.protocol("WM_DELETE_WINDOW", _on_closing)

    # ── 서비스 초기 상태 확인 ──
    def _check_initial():
        if _is_service_running():
            _using_service[0] = True

    threading.Thread(target=_check_initial, daemon=True).start()

    app.mainloop()


def main():
    # Windows 서비스 디스패처 모드 (SCM에서 호출)
    if '--service' in sys.argv:
        if not _HAS_WIN32:
            print("오류: pywin32 패키지가 필요합니다.")
            sys.exit(1)
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(LuminaService)
        servicemanager.StartServiceCtrlDispatcher()
        return

    # 서비스 자동 등록 (인스톨러에서 호출)
    if '--install-service' in sys.argv:
        ok, msg = _service_install()
        print(msg)
        sys.exit(0 if ok else 1)

    # 레거시 서비스 CLI 명령 (install, start, stop, remove)
    if len(sys.argv) > 1 and sys.argv[1] in ("install", "start", "stop", "remove", "update", "restart"):
        if not _HAS_WIN32:
            print("오류: pywin32 패키지가 필요합니다.  pip install pywin32")
            sys.exit(1)
        win32serviceutil.HandleCommandLine(LuminaService)
        return

    parser = argparse.ArgumentParser(description="Lumina 자산 자동 탐색 에이전트 (Windows)")
    parser.add_argument("--once", action="store_true", help="1회 수집 후 종료 (콘솔)")
    parser.add_argument("--conf", default=None, help="설정 파일 경로")
    args = parser.parse_args()

    config = AgentConfig(conf_path=args.conf)

    if args.once:
        # 콘솔 모드: 1회 수집
        _setup_logging(config)
        run_once(config)
        return

    # GUI 모드
    _run_gui(config)


if __name__ == "__main__":
    main()
