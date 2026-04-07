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

    logger.info("에이전트 등록 완료 — 인증서 저장: %s", cert_path)
    return True, f"등록 완료 (cert={cert_path})"


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
        logger.info("mTLS 클라이언트 인증서 로드: %s", config.client_cert)

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


def _service_install():
    """Lumina Windows 서비스를 등록한다 (관리자 권한 필요)."""
    if _is_service_installed():
        return True, "이미 등록됨"

    if getattr(sys, 'frozen', False):
        binpath = '"{}" --service'.format(sys.executable)
    else:
        binpath = '"{}" "{}" --service'.format(sys.executable, os.path.abspath(__file__))

    if not _HAS_WIN32:
        return False, "pywin32 패키지가 필요합니다 (pip install pywin32)"

    try:
        hscm = win32service.OpenSCManager(
            None, None, win32service.SC_MANAGER_ALL_ACCESS)
        try:
            hs = win32service.CreateService(
                hscm, "Lumina",
                "Lumina 자산 자동 탐색 에이전트",
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
    """서비스 시작. 성공 시 True."""
    if _is_service_running():
        return True
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


# ── GUI 로그 핸들러 ────────────────────────────────────
class _TkLogHandler(logging.Handler):
    """로그를 tkinter Text 위젯에 보내는 핸들러"""

    def __init__(self):
        super().__init__()
        self._queue = []
        self._text_widget = None

    def attach(self, text_widget):
        self._text_widget = text_widget
        for msg in self._queue:
            self._append(msg)
        self._queue.clear()

    def emit(self, record):
        msg = self.format(record)
        if self._text_widget:
            self._text_widget.after(0, self._append, msg)
        else:
            self._queue.append(msg)

    def _append(self, msg):
        tw = self._text_widget
        if tw:
            tw.configure(state="normal")
            tw.insert("end", msg + "\n")
            tw.see("end")
            tw.configure(state="disabled")


# ── 탭 GUI 메인 윈도우 ────────────────────────────────
def _run_gui(config: AgentConfig):
    import tkinter as tk
    from tkinter import ttk

    # ── 색상 / 폰트 ──
    BG = "#f8f9fb"
    FG = "#1e293b"
    SUB = "#64748b"
    ACCENT = "#475569"
    OK_COLOR = "#16a34a"
    ERR_COLOR = "#dc2626"
    FONT = ("맑은 고딕", 10)
    FONT_B = ("맑은 고딕", 12, "bold")
    FONT_S = ("맑은 고딕", 9)
    FONT_LOG = ("맑은 고딕", 9)

    # ── 백그라운드 수집 (서비스 / 스레드 폴백) ──
    _stop_evt = threading.Event()
    _worker = [None]
    _using_service = [False]  # True이면 Windows 서비스 모드

    def _collection_loop():
        """스레드 폴백: GUI 프로세스 내 수집 루프"""
        while not _stop_evt.is_set():
            try:
                run_once(config)
                _send_heartbeat(config)
            except Exception:
                logger.exception("수집 사이클 중 오류")
            ok, _ = _test_server_connection(config)
            if ok:
                root.after(0, lambda: (
                    lbl_status_dot.configure(fg=OK_COLOR),
                    lbl_status_text.configure(text="서버 연결됨", fg=OK_COLOR)))
            else:
                root.after(0, lambda: (
                    lbl_status_dot.configure(fg=ERR_COLOR),
                    lbl_status_text.configure(text="연결 안 됨", fg=ERR_COLOR)))
            # 수집 주기 대기 중 60초마다 heartbeat 전송
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

    def _poll_service_status():
        """서비스 실행 상태를 주기적으로 확인하여 UI 갱신"""
        def _check():
            running = _is_service_running()
            ok, _ = _test_server_connection(config)
            def _update():
                if _using_service[0]:
                    if running:
                        btn_start.configure(state="disabled")
                        btn_stop.configure(state="normal")
                    else:
                        _using_service[0] = False
                        btn_start.configure(state="normal")
                        btn_stop.configure(state="disabled")
                        lbl_conn.configure(text="서비스 중지됨", fg=SUB)
                if ok:
                    lbl_status_dot.configure(fg=OK_COLOR)
                    lbl_status_text.configure(text="서버 연결됨", fg=OK_COLOR)
                else:
                    lbl_status_dot.configure(fg=ERR_COLOR)
                    lbl_status_text.configure(text="연결 안 됨", fg=ERR_COLOR)
            root.after(0, _update)
        threading.Thread(target=_check, daemon=True).start()
        root.after(5000, _poll_service_status)

    # ── 윈도우 ──
    root = tk.Tk()
    root.title("Lumina — 자산 자동 탐색 에이전트")
    root.resizable(False, False)

    try:
        ico_path = os.path.join(os.path.dirname(sys.executable), "lumina.ico")
        if not os.path.isfile(ico_path):
            ico_path = os.path.join(os.path.dirname(__file__), "lumina.ico")
        if os.path.isfile(ico_path):
            root.iconbitmap(ico_path)
    except Exception:
        pass

    w, h = 580, 660
    x = (root.winfo_screenwidth() - w) // 2
    y = (root.winfo_screenheight() - h) // 2
    root.geometry(f"{w}x{h}+{x}+{y}")
    root.configure(bg=BG)

    # ── 상단 헤더 ──
    hdr = tk.Frame(root, bg=BG)
    hdr.pack(fill="x", padx=20, pady=(14, 4))
    tk.Label(hdr, text="Lumina Agent", font=FONT_B, bg=BG, fg=FG
             ).pack(side="left")
    lbl_status_dot = tk.Label(hdr, text="\u25cf", font=("맑은 고딕", 14),
                              bg=BG, fg=SUB)
    lbl_status_dot.pack(side="right", padx=(4, 0))
    lbl_status_text = tk.Label(hdr, text="대기 중", font=FONT_S, bg=BG, fg=SUB)
    lbl_status_text.pack(side="right")

    def _update_status():
        def _check():
            ok, msg = _test_server_connection(config)
            if ok:
                root.after(0, lambda: (
                    lbl_status_dot.configure(fg=OK_COLOR),
                    lbl_status_text.configure(text="서버 연결됨", fg=OK_COLOR)))
            else:
                root.after(0, lambda: (
                    lbl_status_dot.configure(fg=ERR_COLOR),
                    lbl_status_text.configure(text="연결 안 됨", fg=ERR_COLOR)))
        threading.Thread(target=_check, daemon=True).start()

    # ── 탭 ──
    nb = ttk.Notebook(root)
    nb.pack(fill="both", expand=True, padx=12, pady=(4, 12))

    # ━━━ 탭 1: 서버 설정 ━━━
    tab_cfg = tk.Frame(nb, bg=BG)
    nb.add(tab_cfg, text="  서버 설정  ")

    form = tk.Frame(tab_cfg, bg=BG)
    form.pack(padx=30, pady=20, fill="x")

    # 프로토콜
    row0 = tk.Frame(form, bg=BG)
    row0.pack(fill="x", pady=(0, 10))
    tk.Label(row0, text="프로토콜", font=FONT, bg=BG, fg=FG, width=10,
             anchor="w").pack(side="left")
    proto_var = tk.StringVar(value=config.server_protocol or "https")
    ttk.Combobox(row0, textvariable=proto_var, values=["https", "http"],
                 state="readonly", width=10, font=FONT).pack(side="left", padx=(4, 0))
    ssl_var = tk.BooleanVar(value=config.verify_ssl)
    tk.Checkbutton(row0, text="SSL 인증서 검증", variable=ssl_var,
                   font=FONT_S, bg=BG, fg=SUB, activebackground=BG
                   ).pack(side="right")

    # 서버 IP
    row1 = tk.Frame(form, bg=BG)
    row1.pack(fill="x", pady=(0, 10))
    tk.Label(row1, text="서버 IP", font=FONT, bg=BG, fg=FG, width=10,
             anchor="w").pack(side="left")
    ent_host = tk.Entry(row1, font=FONT, width=28)
    if config.server_host:
        ent_host.insert(0, config.server_host)
    else:
        ent_host.insert(0, "0.0.0.0")
    ent_host.pack(side="left", padx=(4, 0), fill="x", expand=True)

    # 포트
    row2 = tk.Frame(form, bg=BG)
    row2.pack(fill="x", pady=(0, 10))
    tk.Label(row2, text="포트", font=FONT, bg=BG, fg=FG, width=10,
             anchor="w").pack(side="left")
    ent_port = tk.Entry(row2, font=FONT, width=8)
    ent_port.insert(0, str(config.server_port))
    ent_port.pack(side="left", padx=(4, 0))
    tk.Label(row2, text="기본: 8080", font=FONT_S, bg=BG, fg=SUB
             ).pack(side="left", padx=(8, 0))

    # 수집 주기
    row3 = tk.Frame(form, bg=BG)
    row3.pack(fill="x", pady=(0, 10))
    tk.Label(row3, text="수집 주기", font=FONT, bg=BG, fg=FG, width=10,
             anchor="w").pack(side="left")
    ent_interval = tk.Entry(row3, font=FONT, width=8)
    ent_interval.insert(0, str(config.interval))
    ent_interval.pack(side="left", padx=(4, 0))
    tk.Label(row3, text="초 (기본: 3600)", font=FONT_S, bg=BG, fg=SUB
             ).pack(side="left", padx=(8, 0))

    # ── mTLS 인증서 설정 ──
    sep = ttk.Separator(form, orient="horizontal")
    sep.pack(fill="x", pady=(10, 6))
    tk.Label(form, text="TLS / mTLS 인증서 (선택)", font=FONT_S, bg=BG, fg=SUB
             ).pack(anchor="w", pady=(0, 6))

    def _make_cert_row(parent, label_text, initial_value):
        row = tk.Frame(parent, bg=BG)
        row.pack(fill="x", pady=(0, 6))
        tk.Label(row, text=label_text, font=FONT_S, bg=BG, fg=FG, width=14,
                 anchor="w").pack(side="left")
        ent = tk.Entry(row, font=FONT_S, width=30)
        if initial_value:
            ent.insert(0, initial_value)
        ent.pack(side="left", padx=(4, 4), fill="x", expand=True)

        def _browse():
            from tkinter import filedialog
            path = filedialog.askopenfilename(
                parent=root, title=label_text,
                filetypes=[("인증서 파일", "*.pem *.crt *.key *.cer"), ("모든 파일", "*.*")])
            if path:
                ent.delete(0, "end")
                ent.insert(0, path)

        tk.Button(row, text="...", command=_browse, font=FONT_S, width=3,
                  relief="groove", cursor="hand2").pack(side="left")
        return ent

    ent_ca = _make_cert_row(form, "CA 인증서", config.ca_cert)
    ent_cert = _make_cert_row(form, "클라이언트 인증서", config.client_cert)
    ent_key = _make_cert_row(form, "클라이언트 키", config.client_key)

    # 연결 상태 표시 영역
    status_frame = tk.Frame(form, bg=BG)
    status_frame.pack(fill="x", pady=(6, 0))
    lbl_conn = tk.Label(status_frame, text="", font=FONT_S, bg=BG, fg=SUB,
                        anchor="w")
    lbl_conn.pack(side="left", fill="x")

    # 버튼
    btn_frame = tk.Frame(tab_cfg, bg=BG)
    btn_frame.pack(pady=(0, 10))

    def _on_save():
        host = ent_host.get().strip()
        if not host:
            lbl_conn.configure(text="서버 IP를 입력하세요.", fg=ERR_COLOR)
            return
        try:
            port = int(ent_port.get().strip())
            if not (1 <= port <= 65535):
                raise ValueError
        except ValueError:
            lbl_conn.configure(text="포트 번호가 올바르지 않습니다. (1–65535)", fg=ERR_COLOR)
            return
        try:
            interval = int(ent_interval.get().strip())
            if interval < 10:
                raise ValueError
        except ValueError:
            lbl_conn.configure(text="수집 주기는 10초 이상이어야 합니다.", fg=ERR_COLOR)
            return

        config.server_host = host
        config.server_port = port
        config.server_protocol = proto_var.get()
        config.verify_ssl = ssl_var.get()
        config.interval = interval
        config.ca_cert = ent_ca.get().strip()
        config.client_cert = ent_cert.get().strip()
        config.client_key = ent_key.get().strip()
        config.save()
        lbl_conn.configure(text="설정이 저장되었습니다.", fg=OK_COLOR)
        logger.info("설정 저장 완료 (server=%s, interval=%ds)", config.server_url, config.interval)

    def _on_test():
        host = ent_host.get().strip()
        if not host:
            lbl_conn.configure(text="서버 IP를 먼저 입력하세요.", fg=ERR_COLOR)
            return
        try:
            port = int(ent_port.get().strip())
        except ValueError:
            lbl_conn.configure(text="포트 번호가 올바르지 않습니다.", fg=ERR_COLOR)
            return
        proto = proto_var.get()
        url = f"{proto}://{host}:{port}/api/agent/ping"
        lbl_conn.configure(text="연결 테스트 중...", fg=SUB)
        root.update_idletasks()

        def _do_test():
            try:
                # 먼저 현재 GUI 값을 config에 임시 반영
                config.server_host = host
                config.server_port = port
                config.server_protocol = proto
                config.verify_ssl = ssl_var.get()
                config.ca_cert = ent_ca.get().strip()
                config.client_cert = ent_cert.get().strip()
                config.client_key = ent_key.get().strip()
                ctx = _build_ssl_context(config)
                req = urllib.request.Request(url, method="GET")
                with urllib.request.urlopen(req, timeout=5, context=ctx) as resp:
                    root.after(0, lambda: lbl_conn.configure(
                        text=f"연결 성공 (HTTP {resp.status})", fg=OK_COLOR))
            except Exception as e:
                root.after(0, lambda: lbl_conn.configure(
                    text=f"연결 실패: {e}", fg=ERR_COLOR))
            root.after(0, _update_status)

        threading.Thread(target=_do_test, daemon=True).start()

    tk.Button(btn_frame, text="연결 테스트", command=_on_test,
              font=FONT, width=12, relief="groove", cursor="hand2"
              ).pack(side="left", padx=4)
    tk.Button(btn_frame, text="저장", command=_on_save,
              font=FONT, width=10, bg=ACCENT, fg="white",
              relief="flat", cursor="hand2"
              ).pack(side="left", padx=4)

    # 에이전트 시작/중지 버튼
    agent_frame = tk.Frame(tab_cfg, bg=BG)
    agent_frame.pack(pady=(0, 10))

    def _on_start():
        _on_save()
        if not config.server_host:
            return
        btn_start.configure(state="disabled")
        lbl_conn.configure(text="시작 중...", fg=SUB)
        root.update_idletasks()

        def _boot():
            # PKI 미등록이면 자동 등록
            if not _is_registered():
                logger.info("미등록 상태 — 자동 등록 시도")
                root.after(0, lambda: lbl_conn.configure(
                    text="서버에 자동 등록 중...", fg=SUB))
                ok, msg = _register_agent(
                    config.server_host, config.server_port,
                    config.server_protocol, verify_ssl=config.verify_ssl)
                if ok:
                    pki = _get_pki_paths()
                    config.ca_cert = pki["ca_cert"]
                    config.client_cert = pki["client_cert"]
                    config.client_key = pki["client_key"]
                    config.save()
                    root.after(0, lambda: ent_ca.delete(0, "end"))
                    root.after(0, lambda: ent_ca.insert(0, pki["ca_cert"]))
                    root.after(0, lambda: ent_cert.delete(0, "end"))
                    root.after(0, lambda: ent_cert.insert(0, pki["client_cert"]))
                    root.after(0, lambda: ent_key.delete(0, "end"))
                    root.after(0, lambda: ent_key.insert(0, pki["client_key"]))
                    logger.info("자동 등록 성공")
                    # 등록 탭 UI 갱신
                    root.after(0, lambda: (
                        lbl_reg_dot.configure(fg=OK_COLOR),
                        lbl_reg_status.configure(text="등록됨 (인증서 있음)", fg=OK_COLOR)))
                else:
                    logger.warning("자동 등록 실패: %s — 등록 없이 계속 실행", msg)

            # 서비스 모드 시도
            ok_inst, inst_msg = _service_install()
            if ok_inst:
                if _service_start() or _is_service_running():
                    _using_service[0] = True
                    logger.info("에이전트 시작 — 서비스 모드 (백그라운드)")
                    root.after(0, lambda: (
                        btn_stop.configure(state="normal"),
                        lbl_conn.configure(
                            text="서비스 실행 중 (창을 닫아도 백그라운드 동작)",
                            fg=OK_COLOR)))
                    return
                else:
                    logger.warning("서비스 시작 실패 — 스레드 모드로 전환")
            else:
                logger.warning("서비스 등록 실패 (%s) — 스레드 모드로 전환", inst_msg)

            # 폴백: 프로세스 내 스레드
            _using_service[0] = False
            _start_worker()
            root.after(0, lambda: (
                btn_stop.configure(state="normal"),
                lbl_conn.configure(
                    text="에이전트 실행 중 (창 닫으면 중지됨)", fg=OK_COLOR)))

        threading.Thread(target=_boot, daemon=True).start()

    def _on_stop():
        if _using_service[0]:
            btn_stop.configure(state="disabled")
            lbl_conn.configure(text="서비스 중지 중...", fg=SUB)
            def _do_stop():
                _service_stop()
                _using_service[0] = False
                logger.info("서비스 중지 완료")
                root.after(0, lambda: (
                    btn_start.configure(state="normal"),
                    lbl_conn.configure(text="서비스 중지됨", fg=SUB)))
            threading.Thread(target=_do_stop, daemon=True).start()
        else:
            _stop_worker()
            btn_start.configure(state="normal")
            btn_stop.configure(state="disabled")
            lbl_conn.configure(text="에이전트 중지됨", fg=SUB)

    btn_start = tk.Button(agent_frame, text="\u25b6  에이전트 시작", command=_on_start,
                          font=FONT, width=16, bg="#6366F1", fg="white",
                          relief="flat", cursor="hand2")
    btn_start.pack(side="left", padx=4)

    btn_stop = tk.Button(agent_frame, text="\u25a0  에이전트 중지", command=_on_stop,
                         font=FONT, width=16, bg="#475569", fg="white",
                         relief="flat", cursor="hand2", state="disabled")
    btn_stop.pack(side="left", padx=4)

    # ━━━ 탭 2: 에이전트 등록 ━━━
    tab_reg = tk.Frame(nb, bg=BG)
    nb.add(tab_reg, text="  에이전트 등록  ")

    reg_form = tk.Frame(tab_reg, bg=BG)
    reg_form.pack(padx=30, pady=20, fill="x")

    # 등록 상태 표시
    reg_status_frame = tk.Frame(reg_form, bg=BG)
    reg_status_frame.pack(fill="x", pady=(0, 12))
    _registered = _is_registered()
    reg_dot_color = OK_COLOR if _registered else ERR_COLOR
    reg_status_msg = "등록됨 (인증서 있음)" if _registered else "미등록"
    lbl_reg_dot = tk.Label(reg_status_frame, text="\u25cf", font=("맑은 고딕", 14),
                           bg=BG, fg=reg_dot_color)
    lbl_reg_dot.pack(side="left")
    lbl_reg_status = tk.Label(reg_status_frame, text=reg_status_msg,
                              font=FONT, bg=BG, fg=reg_dot_color)
    lbl_reg_status.pack(side="left", padx=(6, 0))

    if _registered:
        tk.Label(reg_form, text="이 에이전트는 서버에 등록되어 있습니다.",
                 font=FONT_S, bg=BG, fg=SUB, anchor="w").pack(fill="x", pady=(0, 8))
        pki = _get_pki_paths()
        sep_reg = ttk.Separator(reg_form, orient="horizontal")
        sep_reg.pack(fill="x", pady=(8, 8))
        tk.Label(reg_form, text="인증서 파일", font=FONT_S, bg=BG, fg=SUB
                 ).pack(anchor="w", pady=(0, 4))
        for lbl, path in [("CA 인증서", pki["ca_cert"]),
                          ("클라이언트 인증서", pki["client_cert"]),
                          ("개인키", pki["client_key"])]:
            r = tk.Frame(reg_form, bg=BG)
            r.pack(fill="x", pady=1)
            tk.Label(r, text=f"{lbl}:", font=FONT_S, bg=BG, fg=FG,
                     width=14, anchor="w").pack(side="left")
            tk.Label(r, text=path, font=FONT_S, bg=BG, fg=SUB,
                     anchor="w").pack(side="left", fill="x")
    else:
        tk.Label(reg_form, text="에이전트 시작 버튼을 누르면 서버에 자동으로 등록됩니다.",
                 font=FONT_S, bg=BG, fg=SUB, anchor="w").pack(fill="x", pady=(0, 8))
        tk.Label(reg_form, text="(서버 IP를 먼저 설정한 후 시작하세요)",
                 font=FONT_S, bg=BG, fg=SUB, anchor="w").pack(fill="x")

    # ━━━ 탭 3: 로그 ━━━
    tab_log = tk.Frame(nb, bg=BG)
    nb.add(tab_log, text="  로그  ")

    log_frame = tk.Frame(tab_log, bg="#1e1e2e", bd=0, highlightthickness=0)
    log_frame.pack(fill="both", expand=True, padx=8, pady=8)

    log_text = tk.Text(log_frame, wrap="word", font=FONT_LOG, bg="#1e1e2e",
                       fg="#cdd6f4", insertbackground="#cdd6f4",
                       selectbackground="#45475a", borderwidth=0,
                       relief="flat", padx=8, pady=8, state="disabled")

    scrollbar = tk.Scrollbar(log_frame, command=log_text.yview,
                             bg="#313244", activebackground="#585b70",
                             troughcolor="#1e1e2e", highlightthickness=0,
                             borderwidth=0, width=10)
    scrollbar.pack(side="right", fill="y")

    log_text.configure(yscrollcommand=scrollbar.set)
    log_text.pack(side="left", fill="both", expand=True)

    def _clear_log():
        log_text.configure(state="normal")
        log_text.delete("1.0", "end")
        log_text.configure(state="disabled")

    log_btn = tk.Frame(tab_log, bg=BG)
    log_btn.pack(fill="x", padx=8, pady=(0, 8))
    tk.Button(log_btn, text="로그 지우기", command=_clear_log,
              font=FONT_S, relief="groove", cursor="hand2"
              ).pack(side="right")

    # GUI 로그 핸들러 연결
    gui_log_handler = _TkLogHandler()
    gui_log_handler.attach(log_text)
    _setup_logging(config, gui_handler=gui_log_handler)

    # 서비스 상태 초기 확인 및 주기적 폴링 시작
    def _init_service_check():
        running = _is_service_running()
        installed = _is_service_installed() if not running else True
        def _apply():
            if running:
                _using_service[0] = True
                btn_start.configure(state="disabled")
                btn_stop.configure(state="normal")
                lbl_conn.configure(
                    text="서비스 실행 중 (창을 닫아도 백그라운드 동작)", fg=OK_COLOR)
            elif installed:
                lbl_conn.configure(text="서비스 등록됨 (중지 상태)", fg=SUB)
        root.after(0, _apply)
    threading.Thread(target=_init_service_check, daemon=True).start()
    root.after(5000, _poll_service_status)

    def _on_close():
        if not _using_service[0]:
            _stop_worker()
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", _on_close)
    root.mainloop()


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
