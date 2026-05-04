"""Lumina-gate Agent for Windows.

Frozen builds use the Windows GUI subsystem (no console window). Running the
installer as administrator opens a setup wizard (license, language); the
service starts in the background and a tray helper is launched detached.

Installed copy with no arguments: silently starts `--tray` if the service exists.
Reuse the setup wizard from the installed path with `--repair` (same as `--reinstall`).

Runs with `--service` as the SCM host, or `--tray` for the notification-area UI.
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
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple
from urllib import request
from urllib.parse import urlparse

try:
    from lumina_windivert_guard import LuminaWebGuard
except ImportError:
    LuminaWebGuard = None  # type: ignore[misc, assignment]


def _cfg_truthy(val: Any, default: bool = True) -> bool:
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    s = str(val).strip().lower()
    if s in ("", "0", "false", "no", "off"):
        return False
    if s in ("1", "true", "yes", "on"):
        return True
    return default


VERSION = "1.3.20"
SERVICE_NAME = "LuminaGateAgent"
SERVICE_DISPLAY = "Lumina-gate Agent"
SERVICE_DESCRIPTION = "Lumina-gate web access control and policy agent."
PROGRAM_FILES_DIR = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "LuminaGateAgent"
PROGRAM_DATA_DIR = Path(os.environ.get("ProgramData", r"C:\ProgramData")) / "LuminaGateAgent"
CONFIG_PATH = PROGRAM_DATA_DIR / "config.yaml"
# 한 줄만: IP 또는 호스트명(포트 없음). 있으면 config.yaml 의 gate_server_url 보다 우선(HTTPS 고정).
GATE_SERVER_HOST_FILE = PROGRAM_DATA_DIR / "gate-server-host.txt"
LOG_DIR = PROGRAM_DATA_DIR / "logs"
QUEUE_DIR = PROGRAM_DATA_DIR / "queue"
STATE_PATH = PROGRAM_DATA_DIR / "state.json"
POLICY_CACHE_PATH = PROGRAM_DATA_DIR / "policy-cache.json"
SERVICE_EXE = PROGRAM_FILES_DIR / "LuminaGateAgent.exe"
PUTTY_PROGFILES_DIR = PROGRAM_FILES_DIR / "putty"
TRAY_MUTEX_NAME = "Global\\LuminaGateAgentTrayMutex"
TRAY_REG_VALUE = "LuminaGateAgentTray"
ASSET_ICO = "lumina-gate-reference.ico"
TRAY_MID_OPEN_LOGS = 9001
TRAY_MID_ABOUT = 9002
TRAY_MID_SYSTEM_LINK = 9003
TRAY_MID_LINK_CHECK = 9005
TRAY_MID_EXIT_TRAY = 9004

DEFAULT_CONFIG = {
    "gate_server_ip": "",
    "gate_server_port": 8443,
    "gate_server_url": "https://192.168.56.110:8443",
    "agent_id": "",
    "token": "",
    "policy_poll_interval_seconds": 60,
    "heartbeat_interval_seconds": 30,
    "log_flush_interval_seconds": 10,
    "log_level": "warning",
    "verify_tls": False,
    "language": "ko",
    # WinDivert (WFP divert) 필터링 — Program Files\\LuminaGateAgent\\ 에 WinDivert.dll 배치 필요
    "web_guard_enabled": True,
    "web_guard_exempt_gate": True,
    "windivert_dll_path": "",
}

I18N: Dict[str, Dict[str, str]] = {
    "ko": {
        "brand": "Lumina 게이트 에이전트",
        "lang_title": "표시 언어",
        "lang_prompt": "설치 후 메시지와 트레이 메뉴에 사용할 언어입니다.",
        "btn_ko": "한국어",
        "btn_en": "English",
        "need_admin_install": "설치에는 관리자 권한이 필요합니다.\n\n실행 파일을 마우스 오른쪽 버튼으로 클릭한 뒤 '관리자 권한으로 실행'을 선택하세요.",
        "need_admin_uninstall": "제거에는 관리자 권한이 필요합니다.\n\n실행 파일을 마우스 오른쪽 버튼으로 클릭한 뒤 '관리자 권한으로 실행'을 선택하세요.",
        "install_ok": "설치가 완료되었습니다.\n\n서비스가 부팅 시 자동으로 시작하고, 재시작 규칙이 적용됩니다.\n알림 영역 아이콘은 다른 아이콘 가리기 또는 작업 표시줄 설정에서 확인할 수 있습니다.",
        "uninstall_ok": "제거가 완료되었습니다.",
        "uninstall_fail": "제거에 실패했습니다.",
        "install_fail": "설치에 실패했습니다.",
        "tray_tooltip_ok": "Lumina 게이트 에이전트 · 서비스 정상",
        "tray_tooltip_bad": "Lumina 게이트 에이전트 · 서비스 확인 필요",
        "menu_open_logs": "로그 폴더 열기",
        "menu_about": "소프트웨어 정보…",
        "menu_system_link": "시스템 연동…",
        "menu_link_check": "연동 확인…",
        "menu_exit_tray": "트레이 아이콘만 종료",
        "link_check_title": "연동 확인",
        "link_check_no_url": "게이트 서버 주소가 비어 있습니다.\n트레이 [시스템 연동]에서 주소와 포트를 저장하거나 config.yaml 의 gate_server_url 을 확인하세요.",
        "link_check_target": "게이트: {url}",
        "link_check_ping_ok": "[1/2] HTTPS 게이트 API(ping): 성공 · 서버까지 도달 가능",
        "link_check_ping_fail": "[1/2] HTTPS 게이트 API(ping): 실패\n{err}",
        "link_check_ssl_hint": "자체 서명·사설 CA 인증서인 경우 트레이 [시스템 연동]에서 「HTTPS 인증서 검증」을 끄거나, `%ProgramData%\\LuminaGateAgent\\config.yaml` 에 `verify_tls: false`(따옴표·주석 없이) 로 저장하고 메모장은 UTF-8로 저장하세요.",
        "link_check_diag_ssl": "[현재 적용값] 설정 파일:\n{path}\nverify_tls 원본 저장값={raw} → 인증서 검증 {verdict}\n(True = 검증 사용 중이라 자체 서명 게이트와 맞지 않습니다. false 로 바꾸거나 「예」에서 자동 저장할 수 있습니다.)",
        "tls_disable_question_title": "TLS 인증서 검증",
        "tls_disable_question_body": "지금 설정은 verify_tls 가 켜져 있어 자체 서명 인증서가 거부됩니다.\n\n설정 파일에 verify_tls: false 를 저장하고 연동 확인을 바로 한 번 더 시도할까요?\n\n게이트가 공인 CA 인증서만 쓰는 환경이면 「아니오」를 누르세요.",
        "link_check_tls_verdict_on": "켜짐(공인 CA)",
        "link_check_tls_verdict_off": "꺼짐(자체 서명·사내)",
        "link_check_svc": "백그라운드 서비스(LuminaGateAgent): {on}",
        "link_check_yes": "실행 중",
        "link_check_no": "중지됨 또는 미설치 — 등록 후에도 게이트에 안 보일 수 있습니다",
        "link_check_need_register": "[2/2] 이 PC 에는 아직 agent_id/token 이 없습니다.\n서비스가 게이트에 등록하면 자동 저장됩니다(몇 초~분). 로그 폴더의 agent.log 를 확인하세요.",
        "link_check_policy_ok": "[2/2] 정책 API(인증): 성공 · policy_version={version}\n연동 상태: 정상 (게이트 agents.json 해당 항목 갱신·하트비트 유지 확인)",
        "link_check_policy_bad": "[2/2] 정책 조회 오류 · 응답: {raw}",
        "link_check_auth_fail": "[2/2] 정책 API(등록 증명) 실패: {err}",
        "about_version_line": "버전: {version}",
        "about_svc_line": "{name} ({display})\n   {status}",
        "about_svc_running": "상태: 실행 중",
        "about_svc_unknown": "상태: 확인할 수 없음",
        "about_exe_line": "실행 파일:",
        "about_data_line": "설정·데이터:",
        "about_logs_line": "로그:",
        "about_install_line": "기록된 설치 시각 (이 PC 시간): {when}",
        "about_ok": "확인",
        "syslink_title": "시스템 연동",
        "syslink_hint": "Lumina 게이트(PC 에이전트 게이트웨이) 접속 정보입니다. 연결은 항상 HTTPS(암호화)로 이루어집니다.",
        "syslink_host_label": "서버 주소 (IP 또는 호스트명)",
        "syslink_port_label": "포트",
        "syslink_btn_save": "저장",
        "syslink_btn_close": "닫기",
        "syslink_err_port": "포트는 1~65535 사이 숫자여야 합니다.",
        "syslink_saved": "설정을 저장했습니다.\n몇 초 이내에 백그라운드 서비스가 새 주소를 사용합니다.",
        "syslink_verify_tls": "HTTPS 인증서 검증(CA 신뢰)",
        "syslink_verify_tls_note": "(자체 서명·사내 게이트: 끄면 연동 확인이 됩니다)",
        "syslink_dialog_fail": "설정 창을 열 수 없습니다.",
        "wiz_win_title": "Lumina 게이트 에이전트 설치",
        "wiz_welcome": "Lumina 게이트 에이전트 설치",
        "wiz_welcome_body": "Lumina Gate Agent 데스크톱 에이전트 설치를 시작합니다.\n\n웹 접근 제어 및 정책 연동을 위해 백그라운드 서비스와 알림 영역 아이콘이 구성됩니다.\n설치에는 관리자 권한이 필요할 수 있습니다.\n계속하려면 [다음]을 누르십시오.",
        "wiz_license": "소프트웨어 라이선스 계약",
        "wiz_license_hint": "아래 사용 약관을 확인해 주십시오.",
        "wiz_license_footer": "내용을 읽으신 후 동의하시면 다음을 눌러 진행하십시오.",
        "wiz_accept": "동의함(&A)",
        "wiz_branding_footer": "© Lumina · 엔터프라이즈 네트워크 에이전트",
        "wiz_lang_pick": "표시 언어",
        "wiz_lang_hint": "설치 후 안내 및 트레이 메뉴에 적용되는 언어입니다.",
        "wiz_busy": "설치하는 중입니다. 잠시만 기다리세요.",
        "wiz_install_running": "설치 진행 중…",
        "wiz_done": "설치 완료",
        "wiz_done_hint": "[마침]을 눌러 마법사를 종료합니다.\n\n서비스는 부팅 시 자동으로 시작합니다. 알림 영역(작업 표시줄 오른쪽)에서 트레이 아이콘을 확인하세요.",
        "wiz_done_syslink_tip": "[마침] 전에 Lumina 게이트 서버 주소(IP 또는 호스트)를 설정할 수 있습니다:",
        "wiz_next": "다음(N) >",
        "wiz_back": "< 뒤로(B)",
        "wiz_install": "설치(I)",
        "wiz_cancel": "취소",
        "wiz_close": "마침",
        "wiz_must_accept": "계속하려면 약관 동의란을 선택해야 합니다.",
    },
    "en": {
        "brand": "Lumina Gate Agent",
        "lang_title": "Display language",
        "lang_prompt": "Language for messages and tray menu after installation.",
        "btn_ko": "Korean",
        "btn_en": "English",
        "need_admin_install": "Administrator rights are required to install.\n\nRight-click the executable and choose 'Run as administrator'.",
        "need_admin_uninstall": "Administrator rights are required to uninstall.\n\nRight-click the executable and choose 'Run as administrator'.",
        "install_ok": "Installation finished.\n\nThe service starts automatically at boot with recovery rules.\nLook for the tray icon under notification overflow / taskbar settings.",
        "uninstall_ok": "Uninstallation finished.",
        "uninstall_fail": "Uninstallation failed.",
        "install_fail": "Installation failed.",
        "tray_tooltip_ok": "Lumina Gate Agent · Service running",
        "tray_tooltip_bad": "Lumina Gate Agent · Check service status",
        "menu_open_logs": "Open logs folder",
        "menu_about": "Software information…",
        "menu_system_link": "System integration…",
        "menu_link_check": "Check gateway link…",
        "menu_exit_tray": "Exit tray only",
        "link_check_title": "Gateway link status",
        "link_check_no_url": "Gateway URL is empty.\nSave host/port from the tray \"System integration\" item or edit gate_server_url in config.yaml.",
        "link_check_target": "Gateway: {url}",
        "link_check_ping_ok": "[1/2] HTTPS ping API: OK · reachable",
        "link_check_ping_fail": "[1/2] HTTPS ping API failed\n{err}",
        "link_check_ssl_hint": "For self-signed certs, turn off “Verify HTTPS certificates” in tray “System integration”, or set `verify_tls: false` (unquoted, no trailing comments) in `%ProgramData%\\LuminaGateAgent\\config.yaml` saved as UTF-8.",
        "link_check_diag_ssl": "[Effective config]\nFile: {path}\nverify_tls raw={raw}\nVerification: {verdict}\n(True means verification ON — rejects self-signed certs. Turn off or tap Yes.)",
        "tls_disable_question_title": "HTTPS certificate verification",
        "tls_disable_question_body": "verify_tls is enabled, so Python rejects the gateway self-signed certificate.\n\nSave verify_tls: false to config.yaml and retry this check?\n\nChoose No only if your gateway uses a publicly trusted certificate.",
        "link_check_tls_verdict_on": "On (trusted CA)",
        "link_check_tls_verdict_off": "Off (allows self-signed / private)",
        "link_check_svc": "Service (LuminaGateAgent): {on}",
        "link_check_yes": "running",
        "link_check_no": "stopped or missing · registration won't reach the gate until it runs",
        "link_check_need_register": "[2/2] No agent_id/token on this PC yet.\nThe Windows service saves them after /api/pc-agent/register succeeds. Check agent.log in the logs folder.",
        "link_check_policy_ok": "[2/2] Policy API (auth): OK · policy_version={version}\nLink status: complete (heartbeat then updates agents.json / list)",
        "link_check_policy_bad": "[2/2] Policy response error · {raw}",
        "link_check_auth_fail": "[2/2] Policy API failed: {err}",
        "about_version_line": "Version: {version}",
        "about_svc_line": "{name} ({display})\n   {status}",
        "about_svc_running": "Status: running",
        "about_svc_unknown": "Status: not running or unknown",
        "about_exe_line": "Executable:",
        "about_data_line": "Configuration & data:",
        "about_logs_line": "Logs:",
        "about_install_line": "Installed at (this PC's clock): {when}",
        "about_ok": "OK",
        "syslink_title": "System integration",
        "syslink_hint": "Gateway address for Lumina Gate. Connections always use HTTPS.",
        "syslink_host_label": "Server address (IP or hostname)",
        "syslink_port_label": "Port",
        "syslink_btn_save": "Save",
        "syslink_btn_close": "Close",
        "syslink_err_port": "Port must be between 1 and 65535.",
        "syslink_saved": "Settings saved.\nThe background service will use the new address within a few seconds.",
        "syslink_verify_tls": "Verify HTTPS certificates (trusted CA)",
        "syslink_verify_tls_note": "(Disable for self-signed / private lab gates)",
        "syslink_dialog_fail": "Could not open the settings window.",
        "wiz_win_title": "Lumina Gate Agent Setup",
        "wiz_welcome": "Lumina Gate Agent Setup",
        "wiz_welcome_body": "This wizard will install the Lumina Gate Agent on this PC.\n\nIt registers a Windows service for policy connectivity and installs a tray icon for status.\nAdministrator rights may be required.\nClick Next to continue.",
        "wiz_license": "Software License Agreement",
        "wiz_license_hint": "Please review the license terms.",
        "wiz_license_footer": "If you agree, click Next to proceed.",
        "wiz_accept": "I &accept the agreement",
        "wiz_branding_footer": "© Lumina · Enterprise network agent",
        "wiz_lang_pick": "Display language",
        "wiz_lang_hint": "Language for messages and the tray menu after installation.",
        "wiz_busy": "Installing, please wait…",
        "wiz_install_running": "Installing…",
        "wiz_done": "Installation complete",
        "wiz_done_hint": "The service will start automatically at boot.\nCheck the notification area near the clock for the tray icon.",
        "wiz_done_syslink_tip": "Before you finish, you can set the Lumina Gate server address (IP or hostname):",
        "wiz_next": "Next >",
        "wiz_back": "< Back",
        "wiz_install": "Install",
        "wiz_cancel": "Cancel",
        "wiz_close": "Finish",
        "wiz_must_accept": "You must accept the agreement to continue.",
    },
}

EULA_TEXT = {
    "ko": """Lumina 게이트 에이전트 소프트웨어 사용권 계약

본 소프트웨어 및 관련 배포 패키지(이하 \"소프트웨어\")를 설치·사용하기 전에 아래 내용을 읽으십시오.

1. 허용 사용
발급하는 조직 또는 계약관계에 따라 본 장치에 에이전트를 배포하여 서버와 정책 연동 목적으로만 사용합니다.

2. 데이터 수집
에이전트는 운영·보안 목적의 정책 및 로그 처리에 필요한 최소 정보(장비 식별, 네트워크 상태, 이벤트 등)를 수집할 수 있습니다. 상세 처리는 회사 또는 운영자의 개인정보·보안 방침을 따릅니다.

3. 제한
무단 복제·역컴파일·회피 기능 개조는 금지됩니다.

4. 면책
소프트웨어는 \"있는 그대로\" 제공되며, 관련하여 발생하는 간접 손해에 대해 책임을 지지 않을 수 있습니다(관할 법률에서 허용되는 범위).

5. 동의
설치를 완료하면 본 계약 조건에 동의한 것으로 봅니다.
""",
    "en": """Lumina Gate Agent — End User License Agreement

Please read this agreement before installing or using this software ("Software").

1. Permitted use
Install and operate the agent on this machine only under your organization\'s licensing and solely for gateway/policy integration as intended.

2. Data
The agent may collect identifiers, network status, and operational events necessary for enforcement and auditing. Detailed handling follows your administrator\'s policies.

3. Restrictions
You may not misuse, circumvent, reverse engineer, or unlawfully distribute the Software.

4. Disclaimer
The Software is provided "AS IS"; to the extent permitted by law, licensors disclaim liability for indirect damages.

5. Acceptance
Continuing with installation signifies your acceptance.
""",
}


def tr(key: str, lang: str) -> str:
    lang = "ko" if lang not in I18N else lang
    return I18N[lang].get(key) or I18N["en"].get(key) or key


def guess_bootstrap_lang() -> str:
    try:
        loc = locale.getdefaultlocale()[0]
        if loc and "ko" in loc.lower():
            return "ko"
    except Exception:
        pass
    return "en"


def resource_base() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent


def bundled_gate_assets_dir() -> Path:
    return resource_base() / "gate_assets"


def bundled_putty_dir() -> Path:
    """PuTTY+BlossomSshLaunch beside the agent bundle (frozen: _MEIPASS/putty; dev: putty_bundle/)."""

    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent)) / "putty"
    return Path(__file__).resolve().parent / "putty_bundle"


def deploy_bundled_putty_to_program_files() -> bool:
    """Stage PuTTY helpers under Program Files\\LuminaGateAgent\\putty (installer / repair; requires admin).

    Returning False means blossom-ssh URLs may remain registered to another handler until files exist.
    """

    src = bundled_putty_dir()
    dst = PUTTY_PROGFILES_DIR
    if not src.is_dir() or not (src / "putty.exe").is_file() or not (src / "BlossomSshLaunch.exe").is_file():
        logging.warning("PuTTY bundle missing or incomplete (%s); skip Program Files staging", src)
        return False
    try:
        dst.mkdir(parents=True, exist_ok=True)
        for child in sorted(src.iterdir()):
            if child.is_file():
                shutil.copy2(child, dst / child.name)
        try:
            (dst / ".lumina_putty_bundle_rev").write_text(VERSION + "\n", encoding="utf-8")
        except OSError:
            pass
        return True
    except OSError as exc:
        logging.warning("Failed to deploy PuTTY sidecar to %s: %s", dst, exc)
        return False


def register_blossom_ssh_protocol_hkcu_for_putty_bundle() -> None:
    """Map blossom-ssh:// to Program Files Lumina BlossomSshLaunch (+ local putty.exe). Mirrors Blossom Chat installer."""

    if os.name != "nt":
        return
    launcher = PUTTY_PROGFILES_DIR / "BlossomSshLaunch.exe"
    if not launcher.is_file():
        return
    try:
        import winreg
    except ImportError:
        return

    launcher_s = str(launcher.resolve())
    open_cmd_value = "\"" + launcher_s + "\"" + " \"%1\""
    hk = winreg.HKEY_CURRENT_USER

    try:
        with winreg.CreateKey(hk, r"Software\Classes\blossom-ssh") as k_cls:
            winreg.SetValueEx(k_cls, "", 0, winreg.REG_SZ, "URL:blossom-ssh protocol")
            winreg.SetValueEx(k_cls, "URL Protocol", 0, winreg.REG_SZ, "")
        with winreg.CreateKey(hk, r"Software\Classes\blossom-ssh\shell\open\command") as k_cmd:
            winreg.SetValueEx(k_cmd, "", 0, winreg.REG_SZ, open_cmd_value)
    except OSError:
        logging.exception("Failed to register HKCU blossom-ssh protocol")


def unregister_blossom_ssh_protocol_if_lumina_managed() -> None:
    """Remove HKCU blossom-ssh only when it points into our Program Files PuTTY launcher."""

    if os.name != "nt":
        return
    tail_cmd = r"Software\Classes\blossom-ssh\shell\open\command"

    try:
        import winreg

        hk = winreg.HKEY_CURRENT_USER

        try:
            with winreg.OpenKey(hk, tail_cmd) as k_cmd:
                cmd, _typ = winreg.QueryValueEx(k_cmd, "")
        except FileNotFoundError:
            return
        lowered = cmd.replace("/", "\\").casefold()
        try:
            ours = str((PUTTY_PROGFILES_DIR / "BlossomSshLaunch.exe").resolve()).replace("/", "\\").casefold()
        except OSError:
            return
        if ours not in lowered and rf"luminagateagent\putty\blossomsshlaunch.exe" not in lowered:
            return
        paths = (
            r"Software\Classes\blossom-ssh\shell\open\command",
            r"Software\Classes\blossom-ssh\shell\open",
            r"Software\Classes\blossom-ssh\shell",
            r"Software\Classes\blossom-ssh",
        )
        for p in paths:
            try:
                winreg.DeleteKey(hk, p)
            except FileNotFoundError:
                continue
            except OSError:
                continue
    except OSError:
        pass


def tray_icon_target() -> Path:
    return PROGRAM_DATA_DIR / "assets" / ASSET_ICO


def install_assets_to_programdata() -> None:
    dst_dir = PROGRAM_DATA_DIR / "assets"
    dst_dir.mkdir(parents=True, exist_ok=True)
    candidates = [
        bundled_gate_assets_dir() / ASSET_ICO,
        Path(__file__).resolve().parents[4] / "static" / "image" / "logo" / "gate" / "windows" / ASSET_ICO,
    ]
    for src in candidates:
        try:
            if src.exists():
                shutil.copy2(src, tray_icon_target())
                return
        except OSError:
            continue


def _wizard_apply_icon(root: Any) -> None:
    try:
        ico_path = bundled_gate_assets_dir() / ASSET_ICO
        if ico_path.exists():
            root.iconbitmap(default=str(ico_path))
    except Exception:
        pass


def run_install_wizard(bl: str) -> str:
    """Tkinter setup wizard (layout inspired by Blossom Chat NSIS / MUI). Returns 'installed' | 'cancelled' | 'failed'."""

    import tkinter as tk
    from tkinter import scrolledtext
    from tkinter import ttk

    SIDE_W = 164
    RAIL_BG = "#4F46E5"
    CONTENT_BG = "#FFFFFF"
    OUTER_BORDER = "#C8CCD4"
    RULE = "#E5E7EB"
    NAV_BG = "#F9FAFB"
    FOOTER_BG = "#EFF0F4"

    ui = bl if bl in I18N else "ko"
    outcome: Dict[str, str] = {"v": "cancelled"}
    install_failed_before = False

    root = tk.Tk()
    root.title(tr("wiz_win_title", ui))
    root.minsize(620, 480)
    root.configure(bg=OUTER_BORDER)
    _wizard_apply_icon(root)

    outer = tk.Frame(root, bg=OUTER_BORDER)
    outer.grid(row=0, column=0, sticky="nsew", padx=1, pady=(1, 0))
    root.columnconfigure(0, weight=1)
    root.rowconfigure(0, weight=1)

    wrap_w = 420

    sty = ttk.Style()
    try:
        sty.theme_use("vista")
    except Exception:
        pass
    sty.configure("Wiz.TFrame", background=CONTENT_BG)
    sty.configure("WizRail.TLabel", background=RAIL_BG, foreground="#FFFFFF", font=("Segoe UI", 9))
    sty.configure("WizHdr.TLabel", background=CONTENT_BG, foreground="#111827", font=("Segoe UI", 15, "bold"))
    sty.configure("WizBody.TLabel", background=CONTENT_BG, foreground="#374151", font=("Segoe UI", 9))

    shell = tk.Frame(outer, bg=RULE)
    shell.pack(fill="both", expand=True)

    inner = tk.Frame(shell, bg=RULE)
    inner.pack(fill="both", expand=True, padx=1, pady=1)

    main_row = tk.Frame(inner, bg=CONTENT_BG)
    main_row.pack(fill="both", expand=True)
    main_row.columnconfigure(1, weight=1)
    main_row.rowconfigure(0, weight=1)

    sidebar = tk.Frame(main_row, width=SIDE_W, bg=RAIL_BG, highlightthickness=0)
    sidebar.grid(row=0, column=0, sticky="ns")
    sidebar.grid_propagate(False)
    sb_inner = tk.Frame(sidebar, bg=RAIL_BG)
    sb_inner.pack(fill="both", expand=True, padx=12, pady=20)

    logo_path = bundled_gate_assets_dir() / "installer_logo.png"
    if logo_path.exists():
        try:
            photo = tk.PhotoImage(master=root, file=str(logo_path))
            setattr(root, "_wiz_logo_photo", photo)
            tk.Label(sb_inner, image=photo, bg=RAIL_BG).pack(anchor="n", pady=(0, 12))
        except Exception:
            pass
    ttk.Label(
        sb_inner,
        text=("Lumina\nGate Agent" if ui == "en" else "Lumina\n게이트 에이전트"),
        style="WizRail.TLabel",
        justify="center",
        wraplength=SIDE_W - 16,
    ).pack(anchor="n")

    right = tk.Frame(main_row, bg=CONTENT_BG)
    right.grid(row=0, column=1, sticky="nsew")
    right.columnconfigure(0, weight=1)
    right.rowconfigure(2, weight=1)

    hdr = tk.StringVar(value=tr("wiz_welcome", ui))
    ttk.Label(right, textvariable=hdr, style="WizHdr.TLabel").grid(row=0, column=0, sticky="w", padx=18, pady=(20, 4))
    tk.Frame(right, height=1, bg=RULE).grid(row=1, column=0, sticky="ew", padx=16, pady=(4, 0))

    steps: Dict[str, ttk.Frame] = {}
    holder = ttk.Frame(right, padding=(18, 12, 18, 8), style="Wiz.TFrame")
    holder.grid(row=2, column=0, sticky="nsew")
    holder.columnconfigure(0, weight=1)
    holder.rowconfigure(0, weight=1)

    tk.Frame(right, height=1, bg=RULE).grid(row=3, column=0, sticky="ew", padx=0)
    nav = tk.Frame(right, bg=NAV_BG, highlightthickness=0)
    nav.grid(row=4, column=0, sticky="ew", ipady=8, ipadx=10)
    nav.columnconfigure(0, weight=1)

    btn_cancel = ttk.Button(nav, text=tr("wiz_cancel", ui))
    btn_back = ttk.Button(nav, text=tr("wiz_back", ui), state="disabled")
    btn_next = ttk.Button(nav, text=tr("wiz_next", ui))
    btn_cancel.grid(row=0, column=1, padx=(6, 4))
    btn_back.grid_remove()
    btn_next.grid(row=0, column=3, padx=(12, 8))

    def show_step(name: str) -> None:
        for child in holder.winfo_children():
            child.grid_forget()
        steps[name].grid(row=0, column=0, sticky="nsew")

    accept_var = tk.BooleanVar(value=False)
    lang_var = tk.StringVar(value="ko" if ui != "en" else "en")
    done_var = tk.StringVar(value="")

    def wiz_ui_now() -> str:
        ln = lang_var.get()
        return ln if ln in I18N else ui

    def wiz_open_syslink() -> None:
        show_tray_system_link_dialog(wiz_ui_now(), master=root)

    def close_cancel() -> None:
        outcome["v"] = "failed" if install_failed_before else "cancelled"
        root.destroy()

    def close_done() -> None:
        outcome["v"] = "installed"
        root.destroy()

    def set_idle_close() -> None:
        root.protocol("WM_DELETE_WINDOW", close_cancel)

    def set_busy_close() -> None:
        root.protocol("WM_DELETE_WINDOW", lambda: None)

    set_idle_close()
    btn_cancel.configure(command=close_cancel)

    # --- welcome
    fw = ttk.Frame(holder, padding=(0, 4), style="Wiz.TFrame")
    steps["welcome"] = fw
    fw.columnconfigure(0, weight=1)
    ttk.Label(fw, text=tr("wiz_welcome_body", ui), style="WizBody.TLabel", wraplength=wrap_w, justify="left").grid(
        row=0, column=0, sticky="w"
    )

    # --- license
    fl = ttk.Frame(holder, padding=(0, 4), style="Wiz.TFrame")
    steps["license"] = fl
    fl.columnconfigure(0, weight=1)
    fl.rowconfigure(1, weight=1)
    ttk.Label(fl, text=tr("wiz_license_hint", ui), style="WizBody.TLabel", wraplength=wrap_w, justify="left").grid(
        row=0, column=0, sticky="w", pady=(0, 4)
    )
    eula_lang = "ko" if ui != "en" else "en"
    eula_box = scrolledtext.ScrolledText(
        fl,
        height=13,
        width=52,
        wrap="word",
        font=("Segoe UI", 9),
        foreground="#111827",
        background=CONTENT_BG,
        highlightthickness=1,
        highlightbackground=RULE,
        relief="flat",
        state="normal",
    )
    eula_box.grid(row=1, column=0, sticky="nsew", pady=(0, 6))
    eula_box.insert("1.0", EULA_TEXT.get(eula_lang) or EULA_TEXT["en"])
    eula_box.configure(state="disabled")
    ttk.Checkbutton(fl, text=tr("wiz_accept", ui), variable=accept_var).grid(row=3, column=0, sticky="w", pady=(2, 0))
    ttk.Label(
        fl,
        text=tr("wiz_license_footer", ui),
        style="WizBody.TLabel",
        foreground="#6B7280",
        wraplength=wrap_w,
        justify="left",
    ).grid(row=4, column=0, sticky="w", pady=(6, 0))

    # --- language (title only once: main hdr)
    flang = ttk.Frame(holder, padding=(0, 4), style="Wiz.TFrame")
    steps["lang"] = flang
    flang.columnconfigure(0, weight=1)
    ttk.Label(flang, text=tr("wiz_lang_hint", ui), style="WizBody.TLabel", wraplength=wrap_w, justify="left").grid(
        row=0, column=0, sticky="w", pady=(0, 12)
    )
    lang_row = ttk.Frame(flang, style="Wiz.TFrame")
    lang_row.grid(row=1, column=0, sticky="w")
    ttk.Radiobutton(lang_row, text=tr("btn_ko", ui), variable=lang_var, value="ko").pack(side="left", padx=(0, 20))
    ttk.Radiobutton(lang_row, text=tr("btn_en", ui), variable=lang_var, value="en").pack(side="left")

    # --- busy (filled when install starts)
    fb = ttk.Frame(holder, padding=(36, 28), style="Wiz.TFrame")
    steps["busy"] = fb

    # --- done
    fdone = ttk.Frame(holder, padding=(0, 4), style="Wiz.TFrame")
    steps["done"] = fdone
    fdone.columnconfigure(0, weight=1)
    ttk.Label(fdone, textvariable=done_var, style="WizBody.TLabel", wraplength=wrap_w, justify="left").grid(row=0, column=0, sticky="w")

    wiz_syswrap = ttk.Frame(fdone, style="Wiz.TFrame")
    wiz_syswrap.grid(row=1, column=0, sticky="ew", pady=(12, 8))
    wiz_syswrap.columnconfigure(0, weight=1)
    wiz_syswrap.grid_remove()
    wiz_sys_tip = ttk.Label(
        wiz_syswrap,
        text=tr("wiz_done_syslink_tip", ui),
        style="WizBody.TLabel",
        wraplength=wrap_w,
        justify="left",
    )
    wiz_sys_tip.grid(row=0, column=0, sticky="w")
    btn_wiz_syslink = ttk.Button(wiz_syswrap, text=tr("menu_system_link", ui), command=wiz_open_syslink)
    btn_wiz_syslink.grid(row=1, column=0, sticky="w", pady=(8, 0))
    branding = tk.Label(
        root,
        text=tr("wiz_branding_footer", ui),
        bg=FOOTER_BG,
        fg="#5F6368",
        font=("Segoe UI", 8),
        anchor="center",
        pady=5,
        highlightthickness=1,
        highlightbackground="#DDDFE6",
    )
    branding.grid(row=1, column=0, sticky="ew")

    def go_welcome_nav() -> None:
        hdr.set(tr("wiz_welcome", ui))
        btn_cancel.grid(row=0, column=1, padx=(6, 4))
        btn_back.grid_remove()
        btn_next.grid(row=0, column=3, padx=(12, 8))
        btn_next.configure(text=tr("wiz_next", ui), command=go_license_from_welcome)
        show_step("welcome")

    def go_license_from_welcome() -> None:
        hdr.set(tr("wiz_license", ui))
        btn_cancel.grid(row=0, column=1, padx=(6, 4))
        btn_back.grid(row=0, column=2, padx=4)
        btn_back.state(["!disabled"])
        btn_back.configure(command=go_welcome_nav)
        btn_next.configure(text=tr("wiz_next", ui), command=go_lang_from_license)
        show_step("license")

    def go_lang_from_license() -> None:
        if not accept_var.get():
            show_message(tr("brand", ui), tr("wiz_must_accept", ui), error=False)
            return
        goto_lang_pick()

    def goto_lang_pick() -> None:
        vw = wiz_ui_now()
        hdr.set(tr("wiz_lang_pick", vw))
        btn_cancel.grid(row=0, column=1, padx=(6, 4))
        btn_back.grid(row=0, column=2, padx=4)
        btn_next.grid(row=0, column=3, padx=(12, 8))
        btn_back.state(["!disabled"])
        btn_back.configure(command=go_license_from_lang)
        btn_next.configure(text=tr("wiz_install", vw), command=start_install)
        show_step("lang")

    def go_license_from_lang() -> None:
        hdr.set(tr("wiz_license", ui))
        btn_cancel.grid(row=0, column=1, padx=(6, 4))
        btn_next.configure(text=tr("wiz_next", ui), command=go_lang_from_license)
        show_step("license")

    def start_install() -> None:
        nonlocal install_failed_before

        if not accept_var.get():
            vw = wiz_ui_now()
            show_message(tr("brand", vw), tr("wiz_must_accept", vw), error=False)
            return

        wiz_syswrap.grid_remove()

        lng_pick = wiz_ui_now()
        hdr.set(tr("wiz_install_running", lng_pick))
        set_busy_close()
        btn_cancel.state(["disabled"])
        btn_back.state(["disabled"])
        btn_next.state(["disabled"])
        show_step("busy")

        fb_w = steps["busy"]
        for child in fb_w.winfo_children():
            try:
                child.destroy()
            except Exception:
                pass
        ttk.Label(fb_w, text=tr("wiz_busy", lng_pick), style="WizBody.TLabel", font=("Segoe UI", 10)).pack(anchor="center", pady=(0, 10))
        pb = ttk.Progressbar(fb_w, mode="indeterminate", length=360)
        pb.pack(anchor="center")
        pb.start(14)
        root.update_idletasks()

        def on_install_done(exc: Optional[BaseException]) -> None:
            nonlocal install_failed_before
            try:
                pb.stop()
            except Exception:
                pass
            for widget in fb_w.winfo_children():
                try:
                    widget.destroy()
                except Exception:
                    pass

            if exc is not None:
                install_failed_before = True
                set_idle_close()
                btn_cancel.state(["!disabled"])
                btn_back.state(["!disabled"])
                btn_next.state(["!disabled"])
                show_message(tr("brand", lng_pick), f"{tr('install_fail', lng_pick)}\n\n{exc}", error=True)
                goto_lang_pick()
                return

            hdr.set(tr("wiz_done", lng_pick))
            done_var.set(
                tr("install_ok", lng_pick)
                + "\n\n"
                + tr("wiz_done_hint", lng_pick)
                + f"\n\n{PROGRAM_DATA_DIR}\n{SERVICE_EXE}\n{SERVICE_NAME}"
            )
            wiz_sys_tip.configure(text=tr("wiz_done_syslink_tip", lng_pick))
            btn_wiz_syslink.configure(text=tr("menu_system_link", lng_pick))
            branding.configure(text=tr("wiz_branding_footer", lng_pick))
            wiz_syswrap.grid()
            btn_cancel.grid_remove()
            btn_back.grid_remove()
            btn_next.state(["!disabled"])
            btn_next.configure(text=tr("wiz_close", lng_pick), command=close_done)
            set_idle_close()
            show_step("done")

        def worker() -> None:
            try:
                install_service_impl(lng_pick)
            except Exception as e:
                root.after(0, lambda err=e: on_install_done(err))
            else:
                root.after(0, lambda: on_install_done(None))

        threading.Thread(target=worker, daemon=True, name="LuminaGateInstallWorker").start()
    go_welcome_nav()
    root.update_idletasks()
    rw = max(root.winfo_reqwidth(), 640)
    rh = max(root.winfo_reqheight(), 452)
    sw = root.winfo_screenwidth()
    sh = root.winfo_screenheight()
    root.geometry(f"{rw}x{rh}+{(sw - rw) // 2}+{(sh - rh) // 2}")
    root.mainloop()
    return outcome["v"]


def register_tray_autostart() -> None:
    import win32api
    import win32con

    key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
    cmd = f'"{SERVICE_EXE}" --tray'
    key = win32api.RegOpenKey(win32con.HKEY_LOCAL_MACHINE, key_path, 0, win32con.KEY_SET_VALUE)
    try:
        win32api.RegSetValueEx(key, TRAY_REG_VALUE, 0, win32con.REG_SZ, cmd)
    finally:
        win32api.RegCloseKey(key)


def unregister_tray_autostart() -> None:
    try:
        import win32api
        import win32con

        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        key = win32api.RegOpenKey(win32con.HKEY_LOCAL_MACHINE, key_path, 0, win32con.KEY_SET_VALUE)
        try:
            win32api.RegDeleteValue(key, TRAY_REG_VALUE)
        except OSError:
            pass
        finally:
            win32api.RegCloseKey(key)
    except Exception:
        pass


def ensure_service_boot_auto() -> None:
    run_cmd(["sc.exe", "config", SERVICE_NAME, "start=", "auto"], check=True)


def start_tray_helper_detached() -> None:
    if os.name != "nt":
        return
    DETACHED = getattr(subprocess, "DETACHED_PROCESS", 0x00000008)
    NOWIN = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    try:
        subprocess.Popen(
            [str(SERVICE_EXE), "--tray"],
            close_fds=True,
            cwd=str(PROGRAM_FILES_DIR.parent),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=DETACHED | NOWIN | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200),
        )
    except OSError:
        pass


def open_explorer_folder(path: Path) -> None:
    """Ensure folder exists and open it in Explorer (fallbacks if one API fails)."""

    ensure_dirs()
    folder = Path(path).resolve()
    folder.mkdir(parents=True, exist_ok=True)
    s = str(folder)
    if os.name != "nt":
        return
    try:
        subprocess.Popen(["explorer.exe", s])
        return
    except OSError:
        pass
    try:
        import win32api
        import win32con

        rc = win32api.ShellExecute(0, "open", s, None, None, win32con.SW_SHOWNORMAL)
        if isinstance(rc, int) and rc > 32:
            return
    except Exception:
        pass
    try:
        os.startfile(s)  # type: ignore[attr-defined]
    except OSError:
        pass


def show_tray_about_dialog(lang: str) -> None:
    if os.name != "nt":
        return
    lang = lang if lang in I18N else "ko"
    try:
        running = bool(service_is_running())
    except Exception:
        running = False
    st: Dict[str, Any] = {}
    try:
        st = load_state() if STATE_PATH.exists() else {}
    except Exception:
        st = {}
    when_raw = str(st.get("install_time") or "").strip()
    when_disp = format_about_install_datetime(when_raw, lang) if when_raw else ""
    status = tr("about_svc_running", lang) if running else tr("about_svc_unknown", lang)

    svc_block = tr("about_svc_line", lang).format(name=SERVICE_NAME, display=SERVICE_DISPLAY, status=status)
    bits = [
        tr("brand", lang),
        "",
        tr("about_version_line", lang).format(version=VERSION),
        "",
        svc_block,
        "",
        tr("about_exe_line", lang),
        str(SERVICE_EXE),
        "",
        tr("about_data_line", lang),
        str(PROGRAM_DATA_DIR),
        "",
        tr("about_logs_line", lang),
        str(LOG_DIR),
    ]
    if when_raw:
        bits.extend(["", tr("about_install_line", lang).format(when=when_disp)])

    body = "\n".join(bits)

    try:
        import tkinter as tk
        from tkinter import scrolledtext
        from tkinter import ttk

        root = tk.Tk()
        root.withdraw()

        dlg = tk.Toplevel(root)
        dlg.title(tr("brand", lang))
        dlg.configure(bg="#ffffff")
        dlg.resizable(True, True)
        dlg.minsize(420, 360)
        # Avoid transient(root): with a withdrawn master it can upset some Tk builds.
        try:
            dlg.attributes("-toolwindow", True)
        except Exception:
            pass
        _wizard_apply_icon(dlg)

        outer = tk.Frame(dlg, bg="#ffffff")
        outer.pack(fill="both", expand=True, padx=16, pady=14)

        header = tk.Frame(outer, bg="#ffffff")
        header.pack(fill="x")
        png = bundled_gate_assets_dir() / "installer_logo.png"
        logo_placed = False
        if png.exists():
            try:
                photo = tk.PhotoImage(master=root, file=str(png))
                setattr(root, "_about_photo", photo)
                tk.Label(header, image=photo, bg="#ffffff").pack(anchor="center", pady=(0, 8))
                logo_placed = True
            except Exception:
                logo_placed = False
        tk.Label(
            header,
            text=tr("brand", lang),
            font=("Segoe UI", 13, "bold"),
            bg="#ffffff",
            fg="#111827",
            anchor="center" if logo_placed else "nw",
            justify="center" if logo_placed else "left",
        ).pack(anchor="center" if logo_placed else "nw")

        tk.Frame(outer, height=1, bg="#E5E7EB").pack(fill="x", pady=(12, 8))

        box = scrolledtext.ScrolledText(
            outer,
            wrap="word",
            height=17,
            width=52,
            font=("Segoe UI", 9),
            fg="#111827",
            bg="#FFFFFF",
            highlightthickness=1,
            highlightbackground="#E5E7EB",
            relief="flat",
        )
        box.pack(fill="both", expand=True)
        box.insert("1.0", body)
        box.configure(state="disabled")

        row = tk.Frame(outer, bg="#ffffff")
        row.pack(fill="x", pady=(12, 0))

        def _close() -> None:
            dlg.destroy()
            root.destroy()

        btn = ttk.Button(row, text=tr("about_ok", lang), command=_close)
        btn.pack(side="right")

        dlg.protocol("WM_DELETE_WINDOW", _close)

        dlg.update_idletasks()
        ww = dlg.winfo_reqwidth()
        wh = dlg.winfo_reqheight()
        sw = dlg.winfo_screenwidth()
        sh = dlg.winfo_screenheight()
        dlg.geometry(f"{max(460, ww)}x{max(380, min(560, wh))}+{((sw - max(460, ww)) // 2)}+{((sh - max(380, min(560, wh))) // 2)}")
        try:
            dlg.lift()
            dlg.focus_force()
        except Exception:
            pass
        # Modal grab_set() breaks on some setups when Tcl shares the thread with PumpMessages().
        root.wait_window(dlg)
        return
    except Exception:
        # Plain OK box with no MB_ICON*: MessageBox can't show bundled logo.
        ctypes.windll.user32.MessageBoxW(0, body, tr("brand", lang), 0)


def show_tray_system_link_dialog(lang: str, master: Optional[Any] = None) -> None:
    """Persist gate server IP/host + port. When ``master`` is the install wizard Tk root, nest as modal Toplevel."""

    if os.name != "nt":
        return
    lang = lang if lang in I18N else "ko"
    cfg0 = load_config()
    host0, port0 = host_port_from_resolved_gate_url(resolve_gate_server_url(cfg0))

    standalone_root = master is None
    dlg: Optional[Any] = None

    try:
        import tkinter as tk
        from tkinter import ttk

        # Windows: Toplevel(master) whose master is withdrawn() often never paints. ``--gate-syslink`` uses a plain Tk().
        if standalone_root:
            dlg = tk.Tk()
        else:
            dlg = tk.Toplevel(master)
        dlg.title(tr("syslink_title", lang))
        dlg.configure(bg="#ffffff")
        dlg.resizable(False, False)
        try:
            if not standalone_root:
                dlg.transient(master)
        except Exception:
            pass
        try:
            dlg.attributes("-toolwindow", True)
        except Exception:
            pass
        use_modal_grab = master is not None
        if use_modal_grab:
            try:
                dlg.grab_set()
            except Exception:
                pass
        _wizard_apply_icon(dlg)

        outer = tk.Frame(dlg, bg="#ffffff")
        outer.pack(fill="both", expand=True, padx=16, pady=(14, 16))

        logo_path = bundled_gate_assets_dir() / "installer_logo.png"
        hint_text = tr("syslink_hint", lang)
        logo_img: Optional[Any] = None
        if logo_path.exists():
            try:
                pic = tk.PhotoImage(master=dlg, file=str(logo_path))
                h_px = pic.height()
                if h_px > 52:
                    step = max(2, (h_px + 51) // 52)
                    pic = pic.subsample(step, step)
                setattr(dlg, "_syslink_logo_photo", pic)
                logo_img = pic
            except Exception:
                logo_img = None

        if logo_img is not None:
            head = tk.Frame(outer, bg="#ffffff")
            head.pack(fill="x", anchor="nw", pady=(0, 12))
            tk.Label(head, image=logo_img, bg="#ffffff").pack(side="left", anchor="nw", padx=(0, 12))
            tk.Label(
                head,
                text=hint_text,
                font=("Segoe UI", 9),
                fg="#374151",
                bg="#ffffff",
                wraplength=320,
                justify="left",
            ).pack(side="left", anchor="nw", fill="both", expand=True)
        else:
            tk.Label(
                outer,
                text=hint_text,
                font=("Segoe UI", 9),
                fg="#374151",
                bg="#ffffff",
                wraplength=420,
                justify="left",
            ).pack(fill="x", anchor="nw", pady=(0, 12))
        g = tk.Frame(outer, bg="#ffffff")
        g.pack(fill="x")
        tk.Label(g, text=tr("syslink_host_label", lang), font=("Segoe UI", 9), bg="#ffffff", fg="#111827").grid(
            row=0, column=0, sticky="nw", padx=(0, 8), pady=(0, 6)
        )
        host_ent = ttk.Entry(g, width=40)
        host_ent.grid(row=0, column=1, sticky="ew", pady=(0, 6))
        tk.Label(g, text=tr("syslink_port_label", lang), font=("Segoe UI", 9), bg="#ffffff", fg="#111827").grid(
            row=1, column=0, sticky="nw", padx=(0, 8), pady=(0, 8)
        )
        port_ent = ttk.Entry(g, width=8)
        port_ent.grid(row=1, column=1, sticky="w", pady=(0, 8))
        g.columnconfigure(1, weight=1)

        host_ent.insert(0, host0)
        port_ent.insert(0, str(port0))

        verify_tls_var = tk.BooleanVar(master=dlg, value=effective_verify_tls(cfg0.get("verify_tls", DEFAULT_CONFIG["verify_tls"])))

        frm_tls = tk.Frame(g, bg="#ffffff")
        frm_tls.grid(row=2, column=0, columnspan=2, sticky="nw", pady=(2, 0))
        tk.Checkbutton(
            frm_tls,
            variable=verify_tls_var,
            text=tr("syslink_verify_tls", lang),
            font=("Segoe UI", 9),
            bg="#ffffff",
            fg="#111827",
            activebackground="#ffffff",
            anchor="w",
        ).grid(row=0, column=0, sticky="w")
        tk.Label(
            frm_tls,
            text=tr("syslink_verify_tls_note", lang),
            font=("Segoe UI", 8),
            bg="#ffffff",
            fg="#6b7280",
        ).grid(row=1, column=0, sticky="w", pady=(2, 0))

        def _finalize() -> None:
            if use_modal_grab:
                try:
                    dlg.grab_release()
                except Exception:
                    pass
            dlg.destroy()

        def _save() -> None:
            raw_h = host_ent.get().strip()
            raw_p = port_ent.get().strip()
            hl = raw_h.lower()
            if hl.startswith("https://"):
                raw_h = raw_h[8:]
            elif hl.startswith("http://"):
                raw_h = raw_h[7:]
            raw_h = raw_h.strip().split("/", 1)[0].strip()

            extracted_port: Optional[int] = None
            if raw_h.startswith("[") and "]" in raw_h:
                end_br = raw_h.index("]")
                core = raw_h[: end_br + 1]
                suffix = raw_h[end_br + 1 :].lstrip()
                raw_h = core
                if suffix.startswith(":") and suffix[1:].isdigit():
                    extracted_port = int(suffix[1:])
            elif ":" in raw_h and "[" not in raw_h:
                only, sep, maybe_pt = raw_h.rpartition(":")
                if sep and maybe_pt.isdigit():
                    raw_h = only.strip()
                    extracted_port = int(maybe_pt)

            try:
                prt = int(raw_p.strip()) if raw_p.strip() else 8443
            except ValueError:
                prt = -1
            if extracted_port is not None:
                prt = extracted_port

            if prt < 1 or prt > 65535:
                show_message(tr("syslink_title", lang), tr("syslink_err_port", lang), error=True)
                return

            cfg = load_config()
            cfg["gate_server_ip"] = raw_h.strip()
            cfg["gate_server_port"] = prt
            cfg["verify_tls"] = bool(verify_tls_var.get())
            try:
                if GATE_SERVER_HOST_FILE.exists():
                    GATE_SERVER_HOST_FILE.unlink()
            except OSError:
                pass
            save_config(cfg)
            show_message(tr("syslink_title", lang), tr("syslink_saved", lang))
            _finalize()

        row_bar = tk.Frame(outer, bg="#ffffff")
        row_bar.pack(fill="x", pady=(10, 0))
        ttk.Button(row_bar, text=tr("syslink_btn_close", lang), command=_finalize).pack(side="right", padx=(6, 0))
        ttk.Button(row_bar, text=tr("syslink_btn_save", lang), command=_save).pack(side="right")

        dlg.protocol("WM_DELETE_WINDOW", _finalize)
        dlg.update_idletasks()
        ww = dlg.winfo_reqwidth()
        wh = dlg.winfo_reqheight()
        sw = dlg.winfo_screenwidth()
        sh = dlg.winfo_screenheight()
        dlg.geometry(f"{max(440, ww)}x{wh}+{((sw - max(440, ww)) // 2)}+{((sh - wh) // 2)}")
        if standalone_root:
            try:
                ctypes.windll.user32.AllowSetForegroundWindow(0xFFFFFFFF)
            except Exception:
                pass
            try:
                dlg.attributes("-topmost", True)

                def _drop_topmost() -> None:
                    try:
                        dlg.attributes("-topmost", False)
                    except Exception:
                        pass

                dlg.after(800, _drop_topmost)
            except Exception:
                pass
        try:
            dlg.lift()
            dlg.focus_force()
        except Exception:
            pass
        if standalone_root:
            try:
                hwnd = int(dlg.winfo_id())
                SW_RESTORE = 9
                u32 = ctypes.windll.user32
                u32.ShowWindow(hwnd, SW_RESTORE)
                u32.SetForegroundWindow(hwnd)
            except Exception:
                pass
            dlg.update()
            dlg.mainloop()
        else:
            master.wait_window(dlg)
    except Exception as exc:
        if dlg is not None:
            try:
                dlg.destroy()
            except Exception:
                pass
        tb = traceback.format_exc()
        snippet = (tb or str(exc))[-1200:] if (tb or str(exc)) else ""
        show_message(
            tr("syslink_title", lang),
            f"{tr('syslink_dialog_fail', lang)}\n\n{type(exc).__name__}: {exc}\n\n{snippet}",
            error=True,
        )


def spawn_gate_syslink_ui_detached(lang_for_errors: str) -> None:
    """Start ``<exe> --gate-syslink`` in a new process (no Tk in PumpMessages thread).

    Prefer ShellExecute — it matches how Explorer starts GUI apps and avoids CREATE_NO_WINDOW quirks.
    """

    if os.name != "nt":
        return
    import win32api
    import win32con

    lng = lang_for_errors if lang_for_errors in I18N else "ko"
    candidates: List[str] = []
    try:
        if SERVICE_EXE.is_file():
            candidates.append(str(SERVICE_EXE.resolve()))
        candidates.append(str(Path(sys.executable).resolve()))
    except (OSError, ValueError):
        candidates.append(str(Path(sys.executable).resolve()))
    uniq: List[str] = []
    seen: Set[str] = set()
    for p in candidates:
        if p and p not in seen:
            seen.add(p)
            uniq.append(p)

    cwds: List[str] = []
    try:
        if SERVICE_EXE.parent.is_dir():
            cwds.append(str(SERVICE_EXE.parent.resolve()))
    except OSError:
        pass
    try:
        ep = Path(sys.executable).resolve().parent
        if ep.is_dir():
            s = str(ep)
            if s not in cwds:
                cwds.append(s)
    except OSError:
        pass
    cwd_env = os.getcwd()
    if cwd_env and cwd_env not in cwds:
        cwds.append(cwd_env)

    dp = getattr(subprocess, "DETACHED_PROCESS", 0x00000008)
    nopg = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)

    last_err: Optional[BaseException] = None

    for exe in uniq:
        exe_n = os.path.normpath(exe)
        if not os.path.isfile(exe_n):
            last_err = FileNotFoundError(exe_n)
            continue
        for cwd_try in cwds:
            cwd_n = os.path.normpath(cwd_try)
            if not os.path.isdir(cwd_n):
                continue
            try:
                rc = win32api.ShellExecute(0, "open", exe_n, "--gate-syslink", cwd_n, win32con.SW_SHOWNORMAL)
                try:
                    code = int(rc)
                except (TypeError, ValueError):
                    code = None
                else:
                    if code > 32:
                        return
                    last_err = RuntimeError(f"ShellExecute rc={rc!r}")
            except Exception as exc:
                last_err = exc
            try:
                subprocess.Popen(
                    [exe_n, "--gate-syslink"],
                    cwd=cwd_n,
                    close_fds=True,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=dp | nopg,
                )
                return
            except OSError as exc:
                last_err = exc

    tail = "" if last_err is None else f"\n\n{last_err}"
    show_message(
        tr("syslink_title", lng),
        f"{tr('syslink_dialog_fail', lng)}{tail}",
        error=True,
    )


_tray_singleton: Optional["TrayIconHost"] = None


class TrayIconHost:
    """Notification area icon (shows under Windows “hidden icons” / overflow until pinned)."""

    def __init__(self, lang: str) -> None:
        import win32con

        self.lang = lang
        self._wm_tray = win32con.WM_USER + 31
        self._hwnd = 0

    def _tip(self) -> str:
        if service_is_running():
            return tr("tray_tooltip_ok", self.lang)
        return tr("tray_tooltip_bad", self.lang)

    def _load_icon(self):
        import win32api
        import win32con
        import win32gui

        path = tray_icon_target()
        if path.exists():
            try:
                return win32gui.LoadImage(0, str(path), win32con.IMAGE_ICON, 0, 0, win32con.LR_LOADFROMFILE | win32con.LR_DEFAULTSIZE)
            except Exception:
                pass
        try:
            return win32gui.LoadIcon(0, win32con.IDI_APPLICATION)
        except Exception:
            return win32api.LoadImage(0, win32con.OIC_INFORMATION, win32con.IMAGE_ICON, 16, 16, win32con.LR_SHARED)

    def _add_notify(self) -> None:
        import win32gui

        flags = win32gui.NIF_ICON | win32gui.NIF_MESSAGE | win32gui.NIF_TIP
        hi = self._load_icon()
        tt = self._tip()[:127]
        win32gui.Shell_NotifyIcon(win32gui.NIM_ADD, (self._hwnd, 0, flags, self._wm_tray, hi, tt))

    def _remove_notify(self) -> None:
        import win32gui

        try:
            win32gui.Shell_NotifyIcon(win32gui.NIM_DELETE, (self._hwnd, 0))
        except Exception:
            pass

    def _update_tip(self) -> None:
        import win32gui

        try:
            flags = win32gui.NIF_TIP
            win32gui.Shell_NotifyIcon(win32gui.NIM_MODIFY, (self._hwnd, 0, flags, self._wm_tray, 0, self._tip()[:127]))
        except Exception:
            pass

    def _show_menu(self) -> None:
        import win32con
        import win32gui

        menu = win32gui.CreatePopupMenu()
        win32gui.AppendMenu(menu, win32con.MF_STRING, TRAY_MID_OPEN_LOGS, tr("menu_open_logs", self.lang))
        win32gui.AppendMenu(menu, win32con.MF_STRING, TRAY_MID_ABOUT, tr("menu_about", self.lang))
        win32gui.AppendMenu(menu, win32con.MF_STRING, TRAY_MID_SYSTEM_LINK, tr("menu_system_link", self.lang))
        win32gui.AppendMenu(menu, win32con.MF_STRING, TRAY_MID_LINK_CHECK, tr("menu_link_check", self.lang))
        win32gui.AppendMenu(menu, win32con.MF_SEPARATOR, 0, "")
        win32gui.AppendMenu(menu, win32con.MF_STRING, TRAY_MID_EXIT_TRAY, tr("menu_exit_tray", self.lang))
        pos = win32gui.GetCursorPos()
        win32gui.SetForegroundWindow(self._hwnd)
        cmd = win32gui.TrackPopupMenu(
            menu,
            win32con.TPM_LEFTALIGN | win32con.TPM_BOTTOMALIGN | win32con.TPM_RIGHTBUTTON | win32con.TPM_RETURNCMD,
            pos[0],
            pos[1],
            0,
            self._hwnd,
            None,
        )
        # Post WM_NULL to the *owner hwnd* (not the menu) so foreground/mouse state matches shell expectations.
        win32gui.PostMessage(self._hwnd, win32con.WM_NULL, 0, 0)
        win32gui.DestroyMenu(menu)
        if cmd:
            self._invoke_tray_menu_command(int(cmd))

    def _invoke_tray_menu_command(self, cmd: int) -> None:
        """Tray context menu handlers."""

        import win32con
        import win32gui

        try:
            if cmd == TRAY_MID_OPEN_LOGS:
                open_explorer_folder(LOG_DIR)
            elif cmd == TRAY_MID_ABOUT:
                show_tray_about_dialog(self.lang)
            elif cmd == TRAY_MID_SYSTEM_LINK:
                spawn_gate_syslink_ui_detached(self.lang)
            elif cmd == TRAY_MID_LINK_CHECK:
                ok, txt = verify_gate_integration_report(self.lang)
                show_message(tr("link_check_title", self.lang), txt, error=not ok)
            elif cmd == TRAY_MID_EXIT_TRAY:
                self._remove_notify()
                win32gui.PostMessage(self._hwnd, win32con.WM_DESTROY, 0, 0)
        except Exception as exc:
            show_message(
                tr("brand", self.lang),
                f"{type(exc).__name__}: {exc}",
                error=True,
            )

    def _wnd_proc(self, hwnd, msg, wparam, lparam):
        import win32con
        import win32gui

        if msg == self._wm_tray:
            notify = int(lparam)
            if notify in (
                win32con.WM_RBUTTONUP,
                win32con.WM_LBUTTONDBLCLK,
                getattr(win32con, "WM_CONTEXTMENU", 0x007B),
            ):
                self._show_menu()
                return 0
        if msg == win32con.WM_DESTROY:
            self._remove_notify()
            win32gui.PostQuitMessage(0)
            return 0
        return win32gui.DefWindowProc(hwnd, msg, wparam, lparam)

    def run(self) -> None:
        import threading
        import win32api
        import win32con
        import win32gui

        hinst = win32api.GetModuleHandle(None)
        wc = win32gui.WNDCLASS()
        wc.hInstance = hinst
        wc.lpszClassName = "LuminaGateTrayClass"
        wc.lpfnWndProc = self._wnd_proc
        class_atom = win32gui.RegisterClass(wc)
        self._hwnd = win32gui.CreateWindowEx(
            win32con.WS_EX_TOOLWINDOW,
            class_atom,
            "LuminaGateTrayHidden",
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            hinst,
            None,
        )
        self._add_notify()

        stop = threading.Event()

        def tip_loop() -> None:
            while not stop.wait(4.0):
                try:
                    self._update_tip()
                except Exception:
                    pass

        threading.Thread(target=tip_loop, daemon=True).start()
        try:
            win32gui.PumpMessages()
        finally:
            stop.set()


def run_tray() -> None:
    if os.name != "nt":
        return
    ensure_dirs()
    install_assets_to_programdata()
    register_blossom_ssh_protocol_hkcu_for_putty_bundle()
    config = load_config()
    lang = str(config.get("language") or "ko")
    if lang not in I18N:
        lang = "ko"

    ctypes.windll.kernel32.SetLastError(0)
    mtx = ctypes.windll.kernel32.CreateMutexW(None, True, TRAY_MUTEX_NAME)
    if ctypes.windll.kernel32.GetLastError() == 183:
        if mtx:
            ctypes.windll.kernel32.CloseHandle(mtx)
        return

    global _tray_singleton
    _tray_singleton = TrayIconHost(lang)
    try:
        _tray_singleton.run()
    finally:
        if mtx:
            ctypes.windll.kernel32.CloseHandle(mtx)


# --- module-level locale for guess_bootstrap_lang (import after I18N to avoid cycle) ---
import locale  # noqa: E402


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def wall_clock_iso() -> str:
    """Local system wall time with timezone offset (for telemetry bodies, not HMAC headers)."""

    return datetime.now().astimezone().isoformat(timespec="milliseconds")


def format_about_install_datetime(iso_raw: str, lang: str) -> str:
    """Display stored UTC timestamp in local time for dialogs."""

    iso_raw = iso_raw.strip()
    if not iso_raw:
        return ""
    try:
        s = iso_raw.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        local = dt.astimezone()
        tzname = ""
        if local.tzinfo:
            try:
                tn = local.tzname()
                tzname = f" {tn}" if tn else ""
            except Exception:
                tzname = ""
        return local.strftime("%Y-%m-%d %H:%M:%S") + tzname
    except ValueError:
        return iso_raw


def ensure_dirs() -> None:
    for path in (PROGRAM_FILES_DIR, PROGRAM_DATA_DIR, LOG_DIR, QUEUE_DIR):
        path.mkdir(parents=True, exist_ok=True)


def parse_scalar(raw: str) -> Any:
    s0 = raw.strip()
    if not s0:
        return ""
    if s0[0:1] in ('"', "'") and s0[-1:] == s0[0]:
        inner = s0[1:-1]
        il = inner.strip().lower()
        if il in ("true", "yes", "on"):
            return True
        if il in ("false", "no", "off"):
            return False
        return inner
    if "#" in s0:
        s0 = s0.split("#", 1)[0].strip()
    if not s0:
        return ""
    low = s0.lower()
    if low in ("true", "yes", "on"):
        return True
    if low in ("false", "no", "off"):
        return False
    try:
        return int(s0)
    except ValueError:
        return s0


def effective_verify_tls(raw: Any) -> bool:
    """Whether urllib should verify HTTPS server certificates (lab self-signed gates often need this off)."""

    default_off = bool(DEFAULT_CONFIG.get("verify_tls", False))
    if isinstance(raw, bool):
        return raw
    if raw is None:
        return default_off
    if isinstance(raw, int):
        return raw != 0
    if isinstance(raw, str):
        low = raw.strip().lower()
        if low in ("true", "yes", "on", "1"):
            return True
        if low in ("false", "no", "off", "0", ""):
            return False
        return default_off
    return default_off


def insecure_tls_context():
    """SSLContext that skips server certificate verification (self-signed / private lab gate)."""

    import ssl as _ssl

    ctx = _ssl.SSLContext(_ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = _ssl.CERT_NONE
    return ctx


def quote_yaml(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    return json.dumps(str(value), ensure_ascii=False)


def read_gate_server_host_txt() -> str:
    """First non-comment line from gate-server-host.txt (ProgramData); empty if missing."""

    path = GATE_SERVER_HOST_FILE
    if not path.is_file():
        return ""
    try:
        for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw.strip()
            if line and not line.startswith("#"):
                return line.strip()
        return ""
    except OSError:
        return ""


def resolve_gate_server_url(config: Dict[str, Any]) -> str:
    """HTTPS URL to the gate. gate_server_ip, else gate-server-host.txt, else gate_server_url."""

    host = str(config.get("gate_server_ip") or "").strip()
    if not host:
        host = read_gate_server_host_txt()
    try:
        port = int(config.get("gate_server_port") or 8443)
    except (TypeError, ValueError):
        port = 8443
    if port < 1 or port > 65535:
        port = 8443
    host = host.rstrip("/")
    if host:
        hl = host.lower()
        if hl.startswith("https://"):
            host = host[8:]
        elif hl.startswith("http://"):
            host = host[7:]
        host = host.split("/", 1)[0].strip()
        if host.startswith("[") and "]" in host:
            end_br = host.index("]")
            core = host[: end_br + 1]
            suffix = host[end_br + 1 :].lstrip()
            if suffix.startswith(":") and suffix[1:].isdigit():
                port = int(suffix[1:])
            return f"https://{core}:{port}".rstrip("/")
        if ":" in host:
            only, sep, maybe_port = host.rpartition(":")
            if sep and maybe_port.isdigit():
                host = only.strip()
                port = int(maybe_port)
        return f"https://{host}:{port}".rstrip("/")
    return str(config.get("gate_server_url") or "").rstrip("/")


def host_port_from_resolved_gate_url(base: str) -> Tuple[str, int]:
    """Parse https://host:port / IPv6 bracket forms for dialog defaults."""

    b = (base or "").strip()
    if not b:
        return "", 8443
    low = b.lower()
    if not low.startswith(("http://", "https://")):
        b = "https://" + b
    p = urlparse(b)
    host = (p.hostname or "").strip()
    port = int(p.port or 8443)
    return host, port


def load_config() -> Dict[str, Any]:
    ensure_dirs()
    if not CONFIG_PATH.exists():
        save_config(dict(DEFAULT_CONFIG))
    config = dict(DEFAULT_CONFIG)
    for line in CONFIG_PATH.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or ":" not in stripped:
            continue
        key, raw = stripped.split(":", 1)
        key = key.strip().lstrip("\ufeff")
        if key:
            config[key] = parse_scalar(raw)
    return config


def save_config(config: Dict[str, Any]) -> None:
    ensure_dirs()
    lines = [
        "# LuminaGateAgent configuration",
        "# Optional: gate-server-host.txt — one line, IP or hostname (HTTPS port = gate_server_port).",
        "# If gate_server_ip is empty, that file overrides gate_server_url.",
    ]
    for key in DEFAULT_CONFIG:
        lines.append(f"{key}: {quote_yaml(config.get(key, DEFAULT_CONFIG[key]))}")
    CONFIG_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _attached_console() -> bool:
    if "--console" in sys.argv:
        return True
    if os.name == "nt":
        try:
            return bool(ctypes.windll.kernel32.GetConsoleWindow())
        except Exception:
            return False
    try:
        return hasattr(sys.stdout, "isatty") and sys.stdout.isatty()
    except Exception:
        return False


def setup_logging(config: Dict[str, Any]) -> None:
    """Write to agent.log under ProgramData (starts/stops, policy updates, heartbeat/flush/policy warnings).

    Operational detail is summarized in last_error when needed; verbosity is driven by config log_level."""

    ensure_dirs()
    level = getattr(logging, str(config.get("log_level", "warning")).upper(), logging.WARNING)
    handlers: List[logging.Handler] = [logging.FileHandler(LOG_DIR / "agent.log", encoding="utf-8")]
    if _attached_console():
        handlers.append(logging.StreamHandler(sys.stdout))
    logging.basicConfig(level=level, format="%(asctime)s [%(levelname)s] %(message)s", handlers=handlers)


def is_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def show_message(title: str, message: str, error: bool = False) -> None:
    if _attached_console():
        print(message)
    if os.name != "nt":
        return
    try:
        icon = 0x10 if error else 0x40
        MB_SETFOREGROUND = 0x00010000
        MB_TOPMOST = 0x00040000
        ctypes.windll.user32.MessageBoxW(None, message, title, icon | MB_SETFOREGROUND | MB_TOPMOST)
    except Exception:
        pass


def confirm_disable_tls_for_self_signed_gate(lang: str) -> bool:
    """Tray-only: whether to save verify_tls=false after an SSL verification failure."""

    if os.name != "nt":
        return False
    lng = lang if lang in I18N else "ko"
    title = tr("tls_disable_question_title", lng)
    body = tr("tls_disable_question_body", lng)
    MB_YESNO = 0x0004
    MB_ICONQUESTION = 0x0020
    MB_SETFOREGROUND = 0x00010000
    MB_TOPMOST = 0x00040000
    IDYES = 6
    try:
        r = ctypes.windll.user32.MessageBoxW(None, body, title, MB_YESNO | MB_ICONQUESTION | MB_SETFOREGROUND | MB_TOPMOST)
        return int(r) == IDYES
    except Exception:
        return False


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
    lang = guess_bootstrap_lang()
    if relaunch_as_admin(argv):
        return False
    body = tr("need_admin_install", lang) if action == "install" else tr("need_admin_uninstall", lang)
    show_message(tr("brand", lang), body, error=True)
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


AGENT_EXE_NAME = "LuminaGateAgent.exe"


def wait_service_stop_or_deleted(timeout_seconds: float = 45.0) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        result = run_cmd(["sc.exe", "query", SERVICE_NAME])
        if result.returncode != 0:
            return
        out = result.stdout or ""
        if "RUNNING" not in out and "START_PENDING" not in out:
            return
        time.sleep(0.5)
    raise RuntimeError(
        f"{SERVICE_NAME} 서비스가(stop) 시간 내 STOPPED 상태가 되지 않았습니다. "
        "관리자 CMD에서 \"sc.exe stop LuminaGateAgent\" 후 다시 시도하거나 재부팅하세요."
    )


def kill_lumina_agent_host_processes() -> None:
    """Stop tray/helper/service host processes holding ``SERVICE_EXE`` (WinError 32). Keeps current PID if same image."""

    if os.name != "nt":
        return
    my_pid = os.getpid()
    my_name = Path(sys.executable).name.lower()

    CREATE_NO_WIN = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    kw: Dict[str, Any] = dict(creationflags=CREATE_NO_WIN, capture_output=True, text=True)

    if my_name != AGENT_EXE_NAME.lower():
        subprocess.run(["taskkill.exe", "/F", "/IM", AGENT_EXE_NAME, "/T"], **kw)
        time.sleep(0.5)
        return

    ps = (
        f"$me = {my_pid}; "
        f"Get-CimInstance Win32_Process -Filter \"Name = '{AGENT_EXE_NAME}'\" | "
        "Where-Object { $_.ProcessId -ne $me } | "
        "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
    )
    subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps], **kw)
    time.sleep(0.5)


def wait_service_absent() -> None:
    for _ in range(30):
        if not service_exists():
            return
        time.sleep(1)
    raise RuntimeError(f"{SERVICE_NAME} 기존 서비스가 삭제 대기 상태에서 해제되지 않았습니다.")


def delete_existing_service() -> None:
    run_cmd(["sc.exe", "stop", SERVICE_NAME])
    wait_service_stop_or_deleted()
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
        "agent_version": VERSION,
        "install_time": load_state().get("install_time") or wall_clock_iso(),
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
        self.base = resolve_gate_server_url(config)
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
        if str(self.base).lower().startswith("https") and not effective_verify_tls(
            self.config.get("verify_tls", DEFAULT_CONFIG["verify_tls"])
        ):
            context = insecure_tls_context()
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
            "timestamp": wall_clock_iso(),
        }
        self.request_json("POST", "/api/pc-agent/heartbeat", payload)

    def send_event(self, kind: str, payload: Dict[str, Any]) -> None:
        path = "/api/pc-agent/log/block" if kind == "block" else "/api/pc-agent/log/web-access"
        self.request_json("POST", path, payload)


def verify_gate_integration_report(lang: str, *, _auto_disable_retry: bool = False) -> Tuple[bool, str]:
    """Reachability (ping) + optional registration proof (policy GET). For tray [연동 확인]."""

    lng = lang if lang in I18N else "ko"
    cfg = load_config()
    base = resolve_gate_server_url(cfg).strip()
    if not base:
        return False, tr("link_check_no_url", lng)

    verify_tls = effective_verify_tls(cfg.get("verify_tls", DEFAULT_CONFIG.get("verify_tls", False)))
    ping_url = base.rstrip("/") + "/api/pc-agent/ping"
    headers = {"Accept": "application/json", "User-Agent": f"LuminaGateAgent/{VERSION}"}
    ctx = None
    if ping_url.lower().startswith("https") and not verify_tls:
        ctx = insecure_tls_context()

    header_block = tr("link_check_target", lng).format(url=base)
    try:
        req = request.Request(ping_url, method="GET", headers=headers)
        with request.urlopen(req, timeout=15, context=ctx) as resp:
            body = resp.read().decode("utf-8", errors="replace")[:512]
            blob = json.loads(body) if body.strip().startswith("{") else {}
            if not blob.get("success"):
                return False, "\n".join(
                    (
                        header_block,
                        "",
                        tr("link_check_ping_fail", lng).format(err=f"bad response: {body[:220]}"),
                    )
                )
    except Exception as exc:
        err_txt = str(exc)
        raw_v = cfg.get("verify_tls", DEFAULT_CONFIG["verify_tls"])
        verify_on = effective_verify_tls(raw_v)
        verdict = tr("link_check_tls_verdict_on", lng) if verify_on else tr("link_check_tls_verdict_off", lng)
        ping_body = "\n".join((header_block, "", tr("link_check_ping_fail", lng).format(err=err_txt)))
        ssl_like = (
            "CERTIFICATE_VERIFY_FAILED" in err_txt
            or "certificate verify failed" in err_txt.lower()
            or "self signed certificate" in err_txt.lower()
            or "self-signed" in err_txt.lower()
        )
        if ssl_like:
            ping_body += "\n\n" + tr("link_check_diag_ssl", lng).format(
                path=str(CONFIG_PATH.resolve()),
                raw=repr(raw_v),
                verdict=verdict,
            )
            ping_body += "\n\n" + tr("link_check_ssl_hint", lng)
            if verify_on and not _auto_disable_retry and confirm_disable_tls_for_self_signed_gate(lng):
                cfg_fix = dict(load_config())
                cfg_fix["verify_tls"] = False
                save_config(cfg_fix)
                return verify_gate_integration_report(lang, _auto_disable_retry=True)
        return False, ping_body

    lines = [header_block, "", tr("link_check_ping_ok", lng)]

    svc_running = False
    if os.name == "nt":
        try:
            svc_running = bool(service_is_running())
        except Exception:
            svc_running = False

    svc_label = tr("link_check_yes", lng) if svc_running else tr("link_check_no", lng)
    lines.append(tr("link_check_svc", lng).format(on=svc_label))

    aid = str(cfg.get("agent_id") or "").strip()
    tok = unprotect_secret(str(cfg.get("token") or "").strip())
    if not aid or not tok:
        lines.append("")
        lines.append(tr("link_check_need_register", lng))
        return True, "\n".join(lines)

    try:
        client = GateClient(cfg)
        pol = client.policy()
        if pol.get("success"):
            item = pol.get("item") or {}
            pv = item.get("policy_version", "?")
            lines.append("")
            lines.append(tr("link_check_policy_ok", lng).format(version=str(pv)))
            return True, "\n".join(lines)
        lines.append("")
        lines.append(tr("link_check_policy_bad", lng).format(raw=str(pol)[:200]))
        return False, "\n".join(lines)
    except Exception as exc:
        lines.append("")
        lines.append(tr("link_check_auth_fail", lng).format(err=str(exc)))
        return False, "\n".join(lines)


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
        self._policy_snap: Dict[str, Any] = dict(load_policy_cache())
        self._web_guard_started = False

    def ensure_registered(self, config: Dict[str, Any]) -> Dict[str, Any]:
        if config.get("agent_id") and config.get("token"):
            return config
        client = GateClient(config)
        agent_id, token = client.register()
        config["agent_id"] = agent_id
        config["token"] = protect_secret(token)
        save_config(config)
        state = load_state()
        state.setdefault("install_time", wall_clock_iso())
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

    def _maybe_start_web_guard(self, config: Dict[str, Any]) -> None:
        if self._web_guard_started:
            return
        self._web_guard_started = True
        if LuminaWebGuard is None:
            return
        if os.name != "nt":
            return
        if not _cfg_truthy(config.get("web_guard_enabled"), True):
            logging.info("web_guard: disabled via config.yaml")
            return
        dll_override_str = str(config.get("windivert_dll_path") or "").strip()
        dll_override = Path(dll_override_str) if dll_override_str else None
        try:
            guard = LuminaWebGuard(
                program_files_dir=PROGRAM_FILES_DIR,
                gate_base_url_resolver=lambda: resolve_gate_server_url(load_config()),
                policy_supplier=lambda: self._policy_snap,
                queue_event=lambda kind, payload: self.queue.append(kind, payload),
                shutdown=self.stop_event,
                exempt_gate=_cfg_truthy(config.get("web_guard_exempt_gate"), True),
                dll_path_override=dll_override if dll_override and dll_override.is_file() else None,
            )
            if guard.start():
                logging.info("web_guard: outbound TCP/DNS divert active")
            else:
                logging.warning("web_guard: not active (missing WinDivert.dll — see README)")
        except Exception:
            logging.exception("web_guard: failed to start")

    def run(self) -> None:
        config = load_config()
        setup_logging(config)
        logging.info("LuminaGateAgent starting version=%s", VERSION)
        policy = load_policy_cache()
        self._policy_snap = dict(policy)
        self._maybe_start_web_guard(config)
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
                    self._policy_snap = dict(policy)
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
                # Avoid huge tracebacks here (often repeated DNS / connectivity noise); diagnostics stay in last_error → heartbeat payload.
                logging.warning("agent loop error: %s", exc)
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


def wait_exe_unlock(path: Path, timeout_seconds: float = 40.0) -> None:
    deadline = time.time() + timeout_seconds
    while path.exists():
        try:
            path.unlink()
            return
        except OSError:
            if time.time() >= deadline:
                raise RuntimeError(
                    "설치 대상 파일이 다른 프로세스에서 사용 중입니다(WinError 32).\n"
                    "작업 표시줄 우측의 Lumina 게이트 트레이 아이콘을 종료했는지 확인하세요.\n"
                    "관리자 CMD에서 다음을 실행한 뒤 다시 설치할 수 있습니다:\n"
                    "  taskkill /F /IM LuminaGateAgent.exe /T\n"
                    "  sc.exe stop LuminaGateAgent\n"
                    "  sc.exe delete LuminaGateAgent\n"
                    "탐색기에서 설치 폴더를 연 채 미리보기 중이어도 잠금이 날 수 있으므로 해당 창을 닫으세요.",
                )
            time.sleep(0.4)


def unlock_program_files_exe_for_install() -> None:
    if os.name != "nt":
        return
    try:
        unregister_tray_autostart()
    except Exception:
        pass
    kill_lumina_agent_host_processes()

    if service_exists():
        delete_existing_service()

    kill_lumina_agent_host_processes()

    time.sleep(0.85)

    wait_exe_unlock(SERVICE_EXE)


def install_service_impl(lang: str) -> None:
    if not is_admin():
        raise RuntimeError("Run as administrator to install LuminaGateAgent.")
    lang = "ko" if lang != "en" else "en"
    ensure_dirs()
    source = Path(sys.executable if getattr(sys, "frozen", False) else __file__).resolve()
    unlock_program_files_exe_for_install()
    if source != SERVICE_EXE:
        try:
            shutil.copy2(source, SERVICE_EXE)
        except OSError as exc:
            if getattr(exc, "winerror", None) == 32:
                raise RuntimeError(
                    "복사 단계에서 파일이 사용 중입니다. LuminaGateAgent 서비스·백신·탐색기 미리보기를 확인한 뒤 다시 시도하세요."
                ) from exc
            raise
    install_assets_to_programdata()
    deploy_bundled_putty_to_program_files()
    register_blossom_ssh_protocol_hkcu_for_putty_bundle()
    config = load_config()
    config["language"] = lang
    save_config(config)
    state = load_state()
    state["install_time"] = wall_clock_iso()
    save_state(state)
    bin_path = f'"{SERVICE_EXE}" --service'
    register_service(bin_path)
    ensure_service_boot_auto()
    run_cmd(["sc.exe", "failure", SERVICE_NAME, "reset=", "86400", "actions=", "restart/5000/restart/5000/restart/30000"], check=True)
    run_cmd(["sc.exe", "start", SERVICE_NAME])
    verify_installation()
    register_tray_autostart()
    start_tray_helper_detached()
    if _attached_console():
        print(f"Installed {SERVICE_NAME} at {SERVICE_EXE}")


def uninstall_service(purge: bool = False) -> None:
    if not is_admin():
        raise SystemExit("Run as administrator to uninstall LuminaGateAgent.")
    unregister_tray_autostart()
    unregister_blossom_ssh_protocol_if_lumina_managed()
    run_cmd(["sc.exe", "stop", SERVICE_NAME])
    run_cmd(["sc.exe", "delete", SERVICE_NAME])
    if SERVICE_EXE.exists():
        try:
            SERVICE_EXE.unlink()
        except OSError:
            pass
    if PUTTY_PROGFILES_DIR.exists():
        shutil.rmtree(PUTTY_PROGFILES_DIR, ignore_errors=True)
    if purge and PROGRAM_DATA_DIR.exists():
        shutil.rmtree(PROGRAM_DATA_DIR, ignore_errors=True)
    if _attached_console():
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


def _argv_has_flag(argv: Iterable[str], flag: str) -> bool:
    fl = flag.casefold()
    for raw in argv:
        if str(raw).strip().strip("\ufeff").casefold() == fl:
            return True
    return False


def main(argv: Optional[List[str]] = None) -> int:
    raw_argv = list(argv if argv is not None else sys.argv[1:])
    setup_flags = {"--repair", "--reinstall", "--modify"}
    force_setup_wizard = bool(setup_flags.intersection(raw_argv))
    argv = [a for a in raw_argv if a not in setup_flags]

    if "--version" in argv:
        print(VERSION)
        return 0
    if _argv_has_flag(argv, "--gate-syslink"):
        if os.name != "nt":
            return 0
        ensure_dirs()
        try:
            lang_g = str(load_config().get("language") or guess_bootstrap_lang())
        except Exception:
            lang_g = guess_bootstrap_lang()
        if lang_g not in I18N:
            lang_g = "ko"
        show_tray_system_link_dialog(lang_g, master=None)
        return 0
    if "--tray" in argv:
        run_tray()
        return 0
    if "--uninstall" in argv:
        if not ensure_admin_or_relaunch(raw_argv, "uninstall"):
            return 0
        lang = guess_bootstrap_lang()
        try:
            cfg = load_config() if CONFIG_PATH.exists() else {}
            lang = str(cfg.get("language") or lang)
        except Exception:
            pass
        try:
            uninstall_service("--purge" in argv)
            show_message(tr("brand", lang), tr("uninstall_ok", lang))
        except Exception as exc:
            show_message(tr("brand", lang), f"{tr('uninstall_fail', lang)}\n\n{exc}", error=True)
            return 1
        return 0
    if "--console" in argv:
        run_console()
        return 0
    if "--service" in argv:
        run_service_dispatcher()
        return 0
    if (
        os.name == "nt"
        and getattr(sys, "frozen", False)
        and not argv
        and not force_setup_wizard
    ):
        try:
            exe = Path(sys.executable).resolve()
            if SERVICE_EXE.exists() and exe == SERVICE_EXE.resolve() and service_exists():
                start_tray_helper_detached()
                return 0
        except (OSError, ValueError):
            pass
    if not ensure_admin_or_relaunch(raw_argv, "install"):
        return 0

    wiz = run_install_wizard(guess_bootstrap_lang())
    if wiz == "cancelled":
        return 0
    if wiz == "failed":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
