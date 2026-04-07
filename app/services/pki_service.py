"""PKI 서비스 — CA 관리, 에이전트 인증서 발급 / 토큰 관리

flask init-pki  → CA + 서버 인증서 생성
/api/agent/register → 등록 토큰 검증 + CSR 서명 → 인증서 반환
"""

from __future__ import annotations

import hashlib
import logging
import os
import secrets
import sqlite3
from datetime import datetime, timedelta
from typing import Optional, Tuple

from flask import current_app

logger = logging.getLogger(__name__)

# ── 경로 ────────────────────────────────────────────────
PKI_DIR_NAME = "pki"


def _pki_dir(app=None) -> str:
    app = app or current_app
    d = os.path.join(app.instance_path, PKI_DIR_NAME)
    os.makedirs(d, exist_ok=True)
    return d


def _ca_key_path(app=None) -> str:
    return os.path.join(_pki_dir(app), "ca.key")


def _ca_cert_path(app=None) -> str:
    return os.path.join(_pki_dir(app), "ca.crt")


def _server_key_path(app=None) -> str:
    return os.path.join(_pki_dir(app), "server.key")


def _server_cert_path(app=None) -> str:
    return os.path.join(_pki_dir(app), "server.crt")


# ── 토큰 DB (SQLite) ───────────────────────────────────
def _token_db_path(app=None) -> str:
    return os.path.join(_pki_dir(app), "tokens.db")


def _get_token_conn(app=None) -> sqlite3.Connection:
    conn = sqlite3.connect(_token_db_path(app))
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS agent_token (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            max_uses INTEGER NOT NULL DEFAULT 0,
            used_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL DEFAULT 'admin',
            revoked INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS agent_cert (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hostname TEXT NOT NULL,
            serial_hex TEXT NOT NULL UNIQUE,
            fingerprint TEXT NOT NULL,
            issued_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            token_id INTEGER,
            revoked INTEGER NOT NULL DEFAULT 0,
            revoked_at TEXT
        )
    """)
    conn.commit()
    return conn


# ── CA / 인증서 생성 (cryptography 라이브러리 사용) ──────
def init_pki(app=None, force: bool = False) -> dict:
    """CA 키쌍 + 서버 인증서를 생성한다.

    Returns: {"ca_cert": path, "server_cert": path, ...}
    """
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    pki = _pki_dir(app)
    ca_key_file = _ca_key_path(app)
    ca_cert_file = _ca_cert_path(app)
    srv_key_file = _server_key_path(app)
    srv_cert_file = _server_cert_path(app)

    if not force and os.path.isfile(ca_cert_file):
        return {
            "ca_cert": ca_cert_file,
            "ca_key": ca_key_file,
            "server_cert": srv_cert_file,
            "server_key": srv_key_file,
            "created": False,
        }

    now = datetime.utcnow()

    # ── 1. CA 키 + 인증서 ──
    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=4096)
    with open(ca_key_file, "wb") as f:
        f.write(ca_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        ))

    ca_name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "Blossom Internal CA"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Blossom"),
    ])
    ca_cert = (
        x509.CertificateBuilder()
        .subject_name(ca_name)
        .issuer_name(ca_name)
        .public_key(ca_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True, key_cert_sign=True, crl_sign=True,
                content_commitment=False, key_encipherment=False,
                data_encipherment=False, key_agreement=False,
                encipher_only=False, decipher_only=False,
            ),
            critical=True,
        )
        .sign(ca_key, hashes.SHA256())
    )
    with open(ca_cert_file, "wb") as f:
        f.write(ca_cert.public_bytes(serialization.Encoding.PEM))

    # ── 2. 서버 키 + 인증서 ──
    srv_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with open(srv_key_file, "wb") as f:
        f.write(srv_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        ))

    srv_name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "Blossom Server"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Blossom"),
    ])
    srv_cert = (
        x509.CertificateBuilder()
        .subject_name(srv_name)
        .issuer_name(ca_name)
        .public_key(srv_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=365))
        .add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName("localhost"),
                x509.IPAddress(__import__("ipaddress").ip_address("127.0.0.1")),
            ]),
            critical=False,
        )
        .sign(ca_key, hashes.SHA256())
    )
    with open(srv_cert_file, "wb") as f:
        f.write(srv_cert.public_bytes(serialization.Encoding.PEM))

    logger.info("PKI 초기화 완료: %s", pki)
    return {
        "ca_cert": ca_cert_file,
        "ca_key": ca_key_file,
        "server_cert": srv_cert_file,
        "server_key": srv_key_file,
        "created": True,
    }


# ── 등록 토큰 관리 ──────────────────────────────────────
def generate_token(hours: int = 24, max_uses: int = 0,
                   created_by: str = "admin", app=None) -> dict:
    """에이전트 등록 토큰 생성.

    max_uses=0 이면 무제한.
    """
    token = secrets.token_hex(32)
    now = datetime.utcnow()
    expires = now + timedelta(hours=hours)

    conn = _get_token_conn(app)
    try:
        conn.execute(
            "INSERT INTO agent_token (token, expires_at, max_uses, created_at, created_by) "
            "VALUES (?, ?, ?, ?, ?)",
            (token, expires.isoformat(), max_uses, now.isoformat(), created_by),
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "token": token,
        "expires_at": expires.isoformat(),
        "max_uses": max_uses,
    }


def list_tokens(app=None) -> list:
    conn = _get_token_conn(app)
    try:
        rows = conn.execute(
            "SELECT * FROM agent_token ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def revoke_token(token_id: int, app=None) -> bool:
    conn = _get_token_conn(app)
    try:
        conn.execute("UPDATE agent_token SET revoked = 1 WHERE id = ?", (token_id,))
        conn.commit()
        return True
    finally:
        conn.close()


def _validate_token(token_str: str, app=None) -> Tuple[bool, Optional[int], str]:
    """토큰 유효성 검증. (valid, token_id, error_message)"""
    conn = _get_token_conn(app)
    try:
        row = conn.execute(
            "SELECT * FROM agent_token WHERE token = ?", (token_str,)
        ).fetchone()
        if not row:
            return False, None, "유효하지 않은 토큰입니다."
        if row["revoked"]:
            return False, None, "폐기된 토큰입니다."
        if datetime.fromisoformat(row["expires_at"]) < datetime.utcnow():
            return False, None, "만료된 토큰입니다."
        if row["max_uses"] > 0 and row["used_count"] >= row["max_uses"]:
            return False, None, "사용 횟수를 초과한 토큰입니다."
        return True, row["id"], ""
    finally:
        conn.close()


def _increment_token_usage(token_id: int, app=None):
    conn = _get_token_conn(app)
    try:
        conn.execute(
            "UPDATE agent_token SET used_count = used_count + 1 WHERE id = ?",
            (token_id,),
        )
        conn.commit()
    finally:
        conn.close()


# ── 에이전트 인증서 발급 (CSR 서명) ─────────────────────
def sign_agent_csr(csr_pem: bytes, hostname: str, token_str: str = "",
                   app=None) -> Tuple[bool, dict]:
    """에이전트 CSR을 CA로 서명.

    token_str이 비어있으면 토큰 검증 없이 자동 승인(auto-enroll).
    Returns: (success, result_dict)
      성공: {"client_cert": pem, "ca_cert": pem}
      실패: {"error": message}
    """
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization

    app = app or current_app

    # 토큰 검증 (토큰이 제공된 경우에만)
    token_id = None
    if token_str:
        valid, token_id, err = _validate_token(token_str, app)
        if not valid:
            return False, {"error": err}

    # CA 로드
    ca_key_file = _ca_key_path(app)
    ca_cert_file = _ca_cert_path(app)
    if not os.path.isfile(ca_key_file) or not os.path.isfile(ca_cert_file):
        return False, {"error": "서버 PKI가 초기화되지 않았습니다. flask init-pki를 실행하세요."}

    ca_key = serialization.load_pem_private_key(
        open(ca_key_file, "rb").read(), password=None
    )
    ca_cert = x509.load_pem_x509_certificate(open(ca_cert_file, "rb").read())

    # CSR 파싱
    try:
        csr = x509.load_pem_x509_csr(csr_pem)
    except Exception:
        return False, {"error": "CSR 파싱 오류"}

    now = datetime.utcnow()
    serial = x509.random_serial_number()

    # 인증서 발급 (1년)
    client_cert = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([
            x509.NameAttribute(x509.oid.NameOID.COMMON_NAME, hostname),
            x509.NameAttribute(x509.oid.NameOID.ORGANIZATION_NAME, "Blossom Agent"),
        ]))
        .issuer_name(ca_cert.subject)
        .public_key(csr.public_key())
        .serial_number(serial)
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=365))
        .add_extension(
            x509.ExtendedKeyUsage([x509.oid.ExtendedKeyUsageOID.CLIENT_AUTH]),
            critical=False,
        )
        .sign(ca_key, hashes.SHA256())
    )

    client_pem = client_cert.public_bytes(serialization.Encoding.PEM)
    ca_pem = open(ca_cert_file, "rb").read()

    # fingerprint
    fp = hashlib.sha256(client_cert.public_bytes(serialization.Encoding.DER)).hexdigest()

    # DB 기록
    conn = _get_token_conn(app)
    try:
        conn.execute(
            "INSERT INTO agent_cert "
            "(hostname, serial_hex, fingerprint, issued_at, expires_at, token_id) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                hostname,
                format(serial, "x"),
                fp,
                now.isoformat(),
                (now + timedelta(days=365)).isoformat(),
                token_id,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    # 토큰 사용 횟수 증가 (토큰이 있는 경우에만)
    if token_id:
        _increment_token_usage(token_id, app)

    logger.info("에이전트 인증서 발급: hostname=%s, serial=%s", hostname, format(serial, "x"))
    return True, {
        "client_cert": client_pem.decode(),
        "ca_cert": ca_pem.decode(),
    }


def list_agent_certs(app=None) -> list:
    conn = _get_token_conn(app)
    try:
        rows = conn.execute(
            "SELECT * FROM agent_cert ORDER BY issued_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def revoke_agent_cert(cert_id: int, app=None) -> bool:
    conn = _get_token_conn(app)
    try:
        conn.execute(
            "UPDATE agent_cert SET revoked = 1, revoked_at = ? WHERE id = ?",
            (datetime.utcnow().isoformat(), cert_id),
        )
        conn.commit()
        return True
    finally:
        conn.close()
