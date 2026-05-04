#!/usr/bin/env python3
"""After gate+WEB deploy: align lumina-gate policy_sync_token with WEB bearer rules; ensure LUMINA_GATE_PUSH_URL on WEB.

Loads credentials from deploy/rpm/.lumina_gate_env (same as _build_lumina_gate_rpm.py).

This file must NOT contain secrets; passwords come only from .lumina_gate_env (gitignored).
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
ENV_GATE = ROOT / "deploy" / "rpm" / ".lumina_gate_env"
HOST_WEB = os.environ.get("LUMINA_WEB_HOST", "192.168.56.108")


def _load_gate_env_file() -> None:
    if not ENV_GATE.is_file():
        sys.stderr.write(f"Missing {ENV_GATE}\n")
        sys.exit(1)
    for raw in ENV_GATE.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, val = line.split("=", 1)
        k, val = k.strip(), val.strip()
        if k and k not in os.environ:
            if len(val) >= 2 and val[0] == val[-1] and val[0] in "'\"":
                val = val[1:-1]
            os.environ[k] = val


def _ssh(host: str) -> paramiko.SSHClient:
    password = (os.environ.get("LUMINA_GATE_PASSWORD") or "").strip()
    user = os.environ.get("LUMINA_GATE_USER", "root").strip()
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(hostname=host, username=user, password=password or None, timeout=30)
    return c


def _cat(c: paramiko.SSHClient, path: str) -> str:
    stdin, stdout, stderr = c.exec_command(f"cat '{path}' 2>/dev/null || true")
    out = stdout.read().decode("utf-8", errors="replace")
    stdout.channel.recv_exit_status()
    return out


def _yaml_unquote_val(text: str, key: str) -> str:
    m = re.search(rf"^\s*{re.escape(key)}:\s*\"([^\"]*)\"\s*$", text, re.MULTILINE)
    if m:
        return m.group(1)
    m2 = re.search(rf"^\s*{re.escape(key)}:\s*'([^']*)'\s*$", text, re.MULTILINE)
    if m2:
        return m2.group(1)
    # Unquoted empty or arbitrary token until comment/eol.
    m3 = re.search(rf"^\s*{re.escape(key)}:\s*([^#\n]*?)\s*$", text, re.MULTILINE)
    return m3.group(1).strip().strip("\"'") if m3 else ""


def _yaml_set_quoted_line(text: str, key: str, val: str) -> str:
    esc = val.replace("\\", "\\\\").replace('"', '\\"')
    pat = rf"^\s*{re.escape(key)}:\s*.*$"
    if re.search(pat, text, re.MULTILINE):
        return re.sub(pat, rf'{key}: "{esc}"', text, count=1, flags=re.MULTILINE)
    tail = "\n" if not text.endswith("\n") else ""
    return text.rstrip("\n") + tail + f'{key}: "{esc}"\n'


def _env_get(secret_text: str, key: str) -> str:
    for ln in secret_text.splitlines():
        stripped = ln.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        k, v = stripped.split("=", 1)
        if k.strip() == key:
            v = v.strip()
            if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
                v = v[1:-1]
            return v.strip()
    return ""


def _env_upsert(secret_text: str, key: str, value: str) -> str:
    """Insert or replace KEY= line; preserve other lines."""

    lines = secret_text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out: list[str] = []
    prefix = key + "="
    found = False
    for ln in lines:
        if ln.strip().startswith(prefix):
            out.append(prefix + value)
            found = True
        else:
            out.append(ln)
    if not found:
        if out and out[-1].strip():
            out.append("")
        out.append(prefix + value)
    return "\n".join(out).rstrip() + "\n"


def main() -> int:
    _load_gate_env_file()
    host_gate = os.environ.get("LUMINA_GATE_HOST", "192.168.56.110").strip()

    cg = _ssh(host_gate)
    cw = _ssh(HOST_WEB)
    path_gate_cfg = "/etc/lumina-gate/config.yaml"
    path_web_env = "/etc/blossom/lumina/secure.env"
    try:
        gc_text = _cat(cg, path_gate_cfg)
        wc_text = _cat(cw, path_web_env)

        ws_yaml = _yaml_unquote_val(gc_text, "web_sync_token")
        ps_yaml = _yaml_unquote_val(gc_text, "policy_sync_token")
        web_sync_secret = _env_get(wc_text, "LUMINA_GATE_WEB_SYNC_SECRET")

        bearer = (web_sync_secret or ws_yaml or ps_yaml or "").strip()
        print(f"bearer_lens web_sync_yaml={len(ws_yaml)} policy_yaml={len(ps_yaml)} WEB_SYNC_SECRET={len(web_sync_secret)}")

        gc_new = gc_text
        touched_gate = False
        if bearer and _yaml_unquote_val(gc_new, "policy_sync_token") != bearer:
            gc_new = _yaml_set_quoted_line(gc_new, "policy_sync_token", bearer)
            touched_gate = True
        elif not bearer:
            print("WARN: no bearer found — set WEB LUMINA_GATE_WEB_SYNC_SECRET and gate web_sync_token then re-run.")

        if touched_gate:
            sf = cg.open_sftp()
            try:
                with sf.file(path_gate_cfg, "w") as fh:
                    fh.write(gc_new.replace("\r", "\n"))
            finally:
                sf.close()
            print("updated", path_gate_cfg, "policy_sync_token")
            _, o, _ = cg.exec_command("systemctl restart lumina-gate; sleep 1; curl -sk --max-time 5 https://127.0.0.1:8443/health")
            print(o.read().decode("utf-8", errors="replace")[:400])

        wc_new = wc_text
        wc_changed = False

        if _env_get(wc_new, "LUMINA_GATE_PUSH_URL") == "":
            wc_new = _env_upsert(wc_new, "LUMINA_GATE_PUSH_URL", f"https://{host_gate}:8443")
            wc_changed = True

        if _env_get(wc_new, "LUMINA_GATE_PUSH_VERIFY_TLS") == "":
            wc_new = _env_upsert(wc_new, "LUMINA_GATE_PUSH_VERIFY_TLS", "false")
            wc_changed = True

        if bearer and _env_get(wc_new, "LUMINA_GATE_WEB_SYNC_SECRET") == "":
            qc = '"' + bearer.replace("\\", "\\\\").replace('"', '\\"') + '"'
            wc_new = _env_upsert(wc_new, "LUMINA_GATE_WEB_SYNC_SECRET", qc)
            wc_changed = True
            print("note: wrote LUMINA_GATE_WEB_SYNC_SECRET (same bearer as lumina-gate web_sync/policy).")

        if wc_changed and wc_text.strip():
            sf2 = cw.open_sftp()
            try:
                with sf2.file(path_web_env, "w") as fh:
                    fh.write(wc_new.replace("\r", "\n").rstrip() + "\n")
            finally:
                sf2.close()
            print("updated", path_web_env)
            _, o, e = cw.exec_command("systemctl restart lumina-web; sleep 2; systemctl is-active lumina-web")
            print((o.read() + e.read()).decode("utf-8", errors="replace")[:600])
        elif wc_changed:
            print("WARN: secure.env was empty/unreadable — not writing WEB push env keys.")
        else:
            print("WEB secure.env unchanged (keys already present).")

    finally:
        cg.close()
        cw.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
