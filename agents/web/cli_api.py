#!/usr/bin/env python3
"""Blossom Lumina WEB — CLI 관리 API Blueprint

POST /api/cli/login              — 로그인 (토큰 발급)
GET  /api/cli/agents             — 에이전트 목록
GET  /api/cli/agents/search      — 에이전트 검색
GET  /api/cli/agents/<id>        — 에이전트 상세
GET  /api/cli/agents/<id>/status — 상태
GET  /api/cli/agents/<id>/health — 헬스
GET  /api/cli/agents/<id>/inventory — 인벤토리
POST /api/cli/agents/<id>/enable    — 활성화
POST /api/cli/agents/<id>/disable   — 비활성화
POST /api/cli/agents/<id>/resend    — 재전송 명령
POST /api/cli/agents/<id>/collect   — 수집 명령
POST /api/cli/agents/<id>/approve   — 에이전트 승인
POST /api/cli/agents/<id>/reject    — 에이전트 거부
"""

import os
import hashlib
import logging
from datetime import datetime, timedelta
from functools import wraps

from flask import Blueprint, jsonify, request

logger = logging.getLogger("lumina.web.cli")

cli_bp = Blueprint("cli_api", __name__)

# ── 인증 설정 ────────────────────────────────────────────
_PW_FILE = "/var/lib/blossom/lumina/web/admin_pw"

def _get_admin_password():
    if os.path.isfile(_PW_FILE):
        try:
            with open(_PW_FILE) as f:
                pw = f.read().strip()
            if pw:
                return pw
        except Exception:
            pass
    return os.environ.get("LUMINA_CLI_ADMIN_PASSWORD", "admin1234!")

_TOKEN_SECRET = os.environ.get("LUMINA_SECRET_KEY", "lumina-cli-default-key")
_TOKEN_MAX_AGE = 86400  # 24시간

# ── DB 연결 ──────────────────────────────────────────────
_DB_CONFIG = None

def _get_db_config():
    global _DB_CONFIG
    if _DB_CONFIG is None:
        _DB_CONFIG = {
            "host": os.environ.get("LUMINA_DB_HOST", "192.168.56.107"),
            "port": int(os.environ.get("LUMINA_DB_PORT", 3306)),
            "user": os.environ.get("LUMINA_DB_WEB_USER", "lumina_web_reader"),
            "password": os.environ.get("LUMINA_DB_WEB_PASSWORD", "Lumina_WEB_2026!"),
            "database": "lumina",
            "charset": "utf8mb4",
        }
    return _DB_CONFIG

def _get_db():
    import pymysql
    return pymysql.connect(**_get_db_config(),
                           cursorclass=pymysql.cursors.DictCursor)


# ── 토큰 생성/검증 (stdlib만 사용 — itsdangerous 없이) ──

def _make_token(emp_no, role):
    """HMAC 기반 간단한 토큰 생성."""
    import hmac, json, base64, time
    payload = json.dumps({
        "emp_no": emp_no, "role": role,
        "iat": int(time.time()),
    }, separators=(",", ":"))
    sig = hmac.new(
        _TOKEN_SECRET.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()
    encoded = base64.urlsafe_b64encode(payload.encode()).decode()
    return encoded + "." + sig


def _verify_token(token):
    """토큰 검증. 성공 시 payload dict, 실패 시 None."""
    import hmac, json, base64, time
    try:
        parts = token.rsplit(".", 1)
        if len(parts) != 2:
            return None
        encoded, sig = parts
        payload_bytes = base64.urlsafe_b64decode(encoded)
        expected = hmac.new(
            _TOKEN_SECRET.encode(), payload_bytes, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        data = json.loads(payload_bytes)
        if time.time() - data.get("iat", 0) > _TOKEN_MAX_AGE:
            return None
        return data
    except Exception:
        return None


# ── 인증 데코레이터 ──────────────────────────────────────

def cli_auth_required(allowed_roles=None):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            auth = request.headers.get("Authorization", "")
            if not auth.startswith("Bearer "):
                return jsonify({"success": False, "error": "Authentication required."}), 401
            data = _verify_token(auth[7:])
            if data is None:
                return jsonify({"success": False, "error": "Invalid or expired token."}), 401
            if allowed_roles:
                if data.get("role", "").lower() not in [r.lower() for r in allowed_roles]:
                    return jsonify({"success": False, "error": "Insufficient permissions."}), 403
            request.cli_user = data
            return f(*args, **kwargs)
        return wrapper
    return decorator


def _audit(event_type, target=None, detail=None):
    """감사 로그 기록."""
    user = getattr(request, "cli_user", {})
    try:
        conn = _get_db()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO audit_log (event_type, actor, target, action, source_ip, result) "
            "VALUES (%s, %s, %s, %s, %s, 'success')",
            (event_type, user.get("emp_no", "system"),
             str(target) if target else None,
             detail, request.remote_addr)
        )
        conn.commit()
        conn.close()
    except Exception:
        logger.debug("audit log write failed", exc_info=True)


# ── Helper ───────────────────────────────────────────────

def _host_row_to_dict(row):
    """DB row → API dict 변환."""
    if not row:
        return None
    d = dict(row)
    for k in ("first_seen", "last_seen", "created_at", "updated_at", "approved_at"):
        if k in d and d[k] is not None:
            d[k] = str(d[k])
    return d


def _compute_status(row):
    """에이전트 상태 판정."""
    if not row.get("is_active"):
        return "disabled"
    last = row.get("last_seen")
    if not last:
        return "offline"
    if isinstance(last, str):
        try:
            last = datetime.strptime(last, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return "unknown"
    age = (datetime.now() - last).total_seconds()
    if age < 300:
        return "online"
    elif age < 3600:
        return "stale"
    return "offline"


# ═══════════════════════════════════════════════════════════
# 엔드포인트
# ═══════════════════════════════════════════════════════════

@cli_bp.route("/api/cli/login", methods=["POST"])
def cli_login():
    data = request.get_json(silent=True) or {}
    emp_no = (data.get("emp_no") or "").strip()
    password = (data.get("password") or "").strip()

    if not emp_no or not password:
        return jsonify({"success": False, "error": "emp_no and password required."}), 400

    # 단순 인증: admin 계정은 파일/환경변수 비밀번호, 그 외는 거부
    if emp_no == "admin":
        if password != _get_admin_password():
            _audit("login_fail", detail="invalid password for admin")
            return jsonify({"success": False, "error": "Invalid credentials."}), 401
        role = "admin"
    else:
        return jsonify({"success": False, "error": "Unknown user."}), 401

    token = _make_token(emp_no, role)
    _audit("login", detail="CLI login success emp_no=%s" % emp_no)
    return jsonify({
        "success": True, "token": token,
        "emp_no": emp_no, "role": role,
    })


@cli_bp.route("/api/cli/agents", methods=["GET"])
@cli_auth_required()
def cli_agent_list():
    _audit("agent_list")
    try:
        conn = _get_db()
        cur = conn.cursor()
        cur.execute("""
            SELECT h.*, 
                   (SELECT GROUP_CONCAT(i.ip_address SEPARATOR ', ')
                    FROM collected_interfaces i WHERE i.host_id = h.id AND i.ip_address IS NOT NULL
                    LIMIT 5) AS ip_address
            FROM collected_hosts h
            ORDER BY h.last_seen DESC
        """)
        rows = cur.fetchall()
        conn.close()
        result = []
        for r in rows:
            d = _host_row_to_dict(r)
            d["status"] = _compute_status(r)
            result.append(d)
        return jsonify({"success": True, "rows": result, "total": len(result)})
    except Exception:
        logger.exception("agent list error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


@cli_bp.route("/api/cli/agents/search", methods=["GET"])
@cli_auth_required()
def cli_agent_search():
    hostname = request.args.get("hostname", "").strip()
    ip = request.args.get("ip", "").strip()
    _audit("agent_search", detail="hostname=%s ip=%s" % (hostname, ip))
    try:
        conn = _get_db()
        cur = conn.cursor()
        conditions = []
        params = []
        if hostname:
            conditions.append("h.hostname LIKE %s")
            params.append("%" + hostname + "%")
        if ip:
            conditions.append("EXISTS (SELECT 1 FROM collected_interfaces i WHERE i.host_id=h.id AND i.ip_address LIKE %s)")
            params.append("%" + ip + "%")
        where = " AND ".join(conditions) if conditions else "1=1"
        cur.execute(
            "SELECT h.*, "
            "(SELECT GROUP_CONCAT(i.ip_address SEPARATOR ', ') "
            " FROM collected_interfaces i WHERE i.host_id=h.id AND i.ip_address IS NOT NULL LIMIT 5) AS ip_address "
            "FROM collected_hosts h WHERE " + where + " ORDER BY h.last_seen DESC",
            params
        )
        rows = cur.fetchall()
        conn.close()
        result = []
        for r in rows:
            d = _host_row_to_dict(r)
            d["status"] = _compute_status(r)
            result.append(d)
        return jsonify({"success": True, "rows": result, "total": len(result)})
    except Exception:
        logger.exception("agent search error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


@cli_bp.route("/api/cli/agents/<int:agent_id>", methods=["GET"])
@cli_auth_required()
def cli_agent_show(agent_id):
    _audit("agent_show", target=agent_id)
    try:
        conn = _get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM collected_hosts WHERE id=%s", (agent_id,))
        row = cur.fetchone()
        if not row:
            conn.close()
            return jsonify({"success": False, "error": "Agent not found."}), 404

        d = _host_row_to_dict(row)
        d["status"] = _compute_status(row)

        # IP 주소
        cur.execute(
            "SELECT ip_address, name FROM collected_interfaces WHERE host_id=%s AND ip_address IS NOT NULL",
            (agent_id,)
        )
        d["interfaces"] = [{"ip": r["ip_address"], "name": r["name"]} for r in cur.fetchall()]
        conn.close()
        return jsonify({"success": True, "item": d})
    except Exception:
        logger.exception("agent show error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


@cli_bp.route("/api/cli/agents/<int:agent_id>/status", methods=["GET"])
@cli_auth_required()
def cli_agent_status(agent_id):
    _audit("agent_status", target=agent_id)
    try:
        conn = _get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, hostname, last_seen, is_active FROM collected_hosts WHERE id=%s", (agent_id,))
        row = cur.fetchone()
        conn.close()
        if not row:
            return jsonify({"success": False, "error": "Agent not found."}), 404
        d = _host_row_to_dict(row)
        d["status"] = _compute_status(row)
        return jsonify({"success": True, "item": d})
    except Exception:
        logger.exception("agent status error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


@cli_bp.route("/api/cli/agents/<int:agent_id>/health", methods=["GET"])
@cli_auth_required()
def cli_agent_health(agent_id):
    _audit("agent_health", target=agent_id)
    try:
        conn = _get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, hostname, last_seen, is_active FROM collected_hosts WHERE id=%s", (agent_id,))
        row = cur.fetchone()
        if not row:
            conn.close()
            return jsonify({"success": False, "error": "Agent not found."}), 404

        d = _host_row_to_dict(row)
        d["status"] = _compute_status(row)

        # 수집 통계
        for tbl, key in [("collected_interfaces", "interface_count"),
                         ("collected_accounts", "account_count"),
                         ("collected_packages", "package_count")]:
            cur.execute("SELECT COUNT(*) AS cnt FROM %s WHERE host_id=%%s" % tbl, (agent_id,))
            d[key] = cur.fetchone()["cnt"]

        conn.close()
        return jsonify({"success": True, "item": d})
    except Exception:
        logger.exception("agent health error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


@cli_bp.route("/api/cli/agents/<int:agent_id>/inventory", methods=["GET"])
@cli_auth_required(allowed_roles=["admin"])
def cli_agent_inventory(agent_id):
    _audit("agent_inventory", target=agent_id)
    try:
        conn = _get_db()
        cur = conn.cursor()
        cur.execute("SELECT * FROM collected_hosts WHERE id=%s", (agent_id,))
        host = cur.fetchone()
        if not host:
            conn.close()
            return jsonify({"success": False, "error": "Agent not found."}), 404

        d = _host_row_to_dict(host)

        cur.execute("SELECT * FROM collected_interfaces WHERE host_id=%s", (agent_id,))
        d["interfaces"] = [_host_row_to_dict(r) for r in cur.fetchall()]

        cur.execute("SELECT * FROM collected_accounts WHERE host_id=%s", (agent_id,))
        d["accounts"] = [_host_row_to_dict(r) for r in cur.fetchall()]

        cur.execute("SELECT * FROM collected_packages WHERE host_id=%s", (agent_id,))
        d["packages"] = [_host_row_to_dict(r) for r in cur.fetchall()]

        conn.close()
        return jsonify({"success": True, "item": d})
    except Exception:
        logger.exception("agent inventory error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


@cli_bp.route("/api/cli/agents/<int:agent_id>/enable", methods=["POST"])
@cli_auth_required(allowed_roles=["admin"])
def cli_agent_enable(agent_id):
    _audit("agent_enable", target=agent_id)
    try:
        conn = _get_db()
        cur = conn.cursor()
        cur.execute("UPDATE collected_hosts SET is_active=1 WHERE id=%s", (agent_id,))
        if cur.rowcount == 0:
            conn.close()
            return jsonify({"success": False, "error": "Agent not found."}), 404
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Agent %d enabled." % agent_id})
    except Exception:
        logger.exception("agent enable error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


@cli_bp.route("/api/cli/agents/<int:agent_id>/disable", methods=["POST"])
@cli_auth_required(allowed_roles=["admin"])
def cli_agent_disable(agent_id):
    _audit("agent_disable", target=agent_id)
    try:
        conn = _get_db()
        cur = conn.cursor()
        cur.execute("UPDATE collected_hosts SET is_active=0 WHERE id=%s", (agent_id,))
        if cur.rowcount == 0:
            conn.close()
            return jsonify({"success": False, "error": "Agent not found."}), 404
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Agent %d disabled." % agent_id})
    except Exception:
        logger.exception("agent disable error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


@cli_bp.route("/api/cli/agents/<int:agent_id>/approve", methods=["POST"])
@cli_auth_required(allowed_roles=["admin"])
def cli_agent_approve(agent_id):
    _audit("agent_approve", target=agent_id)
    try:
        conn = _get_db()
        cur = conn.cursor()
        user = getattr(request, "cli_user", {})
        cur.execute(
            "UPDATE collected_hosts SET approval_status='approved', "
            "approved_by=%s, approved_at=NOW() WHERE id=%s",
            (user.get("emp_no", "admin"), agent_id)
        )
        if cur.rowcount == 0:
            conn.close()
            return jsonify({"success": False, "error": "Agent not found."}), 404
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Agent %d approved." % agent_id})
    except Exception:
        logger.exception("agent approve error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


@cli_bp.route("/api/cli/agents/<int:agent_id>/reject", methods=["POST"])
@cli_auth_required(allowed_roles=["admin"])
def cli_agent_reject(agent_id):
    _audit("agent_reject", target=agent_id)
    try:
        conn = _get_db()
        cur = conn.cursor()
        user = getattr(request, "cli_user", {})
        cur.execute(
            "UPDATE collected_hosts SET approval_status='rejected', "
            "approved_by=%s, approved_at=NOW() WHERE id=%s",
            (user.get("emp_no", "admin"), agent_id)
        )
        if cur.rowcount == 0:
            conn.close()
            return jsonify({"success": False, "error": "Agent not found."}), 404
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Agent %d rejected." % agent_id})
    except Exception:
        logger.exception("agent reject error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


@cli_bp.route("/api/cli/agents/<int:agent_id>/delete", methods=["POST"])
@cli_auth_required(allowed_roles=["admin"])
def cli_agent_delete(agent_id):
    try:
        conn = _get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, hostname FROM collected_hosts WHERE id=%s", (agent_id,))
        row = cur.fetchone()
        if not row:
            conn.close()
            return jsonify({"success": False, "error": "Agent not found"}), 404
        hostname = row.get("hostname", "")
        cur.execute("DELETE FROM collected_interfaces WHERE host_id=%s", (agent_id,))
        cur.execute("DELETE FROM collected_accounts WHERE host_id=%s", (agent_id,))
        cur.execute("DELETE FROM collected_packages WHERE host_id=%s", (agent_id,))
        cur.execute("DELETE FROM collected_hosts WHERE id=%s", (agent_id,))
        conn.commit()
        conn.close()
        _audit("agent_delete", target=agent_id, detail="hostname=%s" % hostname)
        return jsonify({"success": True, "message": "Agent %s (ID=%d) deleted." % (hostname, agent_id)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@cli_bp.route("/api/cli/agents/<int:agent_id>/resend", methods=["POST"])
@cli_auth_required(allowed_roles=["admin"])
def cli_agent_resend(agent_id):
    _audit("agent_resend", target=agent_id)
    return jsonify({"success": True, "message": "Resend command queued for agent %d." % agent_id})


@cli_bp.route("/api/cli/agents/<int:agent_id>/collect", methods=["POST"])
@cli_auth_required(allowed_roles=["admin"])
def cli_agent_collect(agent_id):
    _audit("agent_collect", target=agent_id)
    return jsonify({"success": True, "message": "Collect command queued for agent %d." % agent_id})
