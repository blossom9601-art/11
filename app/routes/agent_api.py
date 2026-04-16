"""에이전트 업로드 API Blueprint + CLI 관리 API

POST /api/agent/upload   — 에이전트가 수집한 JSON 파일 업로드
GET  /api/agent/pending  — 미연동 에이전트 대기 목록
POST /api/agent/link     — 대기 에이전트를 자산에 연동

--- CLI 관리 API ---
POST /api/cli/login              — CLI 로그인 (토큰 발급)
GET  /api/cli/agents             — 에이전트 목록
GET  /api/cli/agents/search      — 에이전트 검색
GET  /api/cli/agents/<id>        — 에이전트 상세
GET  /api/cli/agents/<id>/status — 에이전트 상태
GET  /api/cli/agents/<id>/health — 에이전트 헬스
GET  /api/cli/agents/<id>/inventory — 자산 인벤토리
POST /api/cli/agents/<id>/enable    — 에이전트 활성화
POST /api/cli/agents/<id>/disable   — 에이전트 비활성화
POST /api/cli/agents/<id>/resend    — 재전송 명령
POST /api/cli/agents/<id>/collect   — 수집 명령
"""

from __future__ import annotations

import json
import logging
from functools import wraps

from flask import Blueprint, jsonify, request, current_app
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from app.services.agent_service import (
    process_agent_payload,
    get_pending_agents,
    link_agent_to_asset,
    get_linked_agent,
    unlink_agent,
    update_agent_heartbeat,
)
from app.services.pki_service import (
    sign_agent_csr,
    generate_token,
    list_tokens,
    revoke_token,
    list_agent_certs,
    revoke_agent_cert,
)
from app.services.agent_cli_service import (
    list_all_agents,
    get_agent_detail,
    get_agent_section,
    get_agent_status,
    get_agent_health,
    get_agent_inventory,
    normalize_agent_section,
    search_agents,
    enable_agent,
    disable_agent,
    set_pending_command,
    get_pending_commands,
    mask_sensitive_data,
    create_audit_log,
)

logger = logging.getLogger(__name__)

agent_api_bp = Blueprint("agent_api", __name__)


def _get_remote_ip() -> str:
    """nginx 프록시 뒤의 실제 클라이언트 IP를 반환"""
    return (
        request.headers.get("X-Real-IP")
        or (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
        or request.remote_addr
        or ""
    )


@agent_api_bp.route("/api/agent/ping", methods=["GET"])
def agent_ping():
    """에이전트 연결 테스트용 헬스체크"""
    return jsonify({"success": True, "message": "pong"})


@agent_api_bp.route("/api/agent/heartbeat", methods=["POST"])
def agent_heartbeat():
    """에이전트 heartbeat 갱신

    body: { "hostname": "..." }
    응답에 대기 명령이 포함될 수 있다.
    """
    data = request.get_json(silent=True) or {}
    hostname = (data.get("hostname") or "").strip()
    if not hostname:
        return jsonify({"success": False, "error": "hostname이 필요합니다."}), 400
    try:
        remote_ip = _get_remote_ip()
        found = update_agent_heartbeat(hostname, remote_ip=remote_ip)
        # 대기 명령 확인 및 소비
        commands = []
        try:
            commands = get_pending_commands(hostname)
        except Exception:
            pass
        return jsonify({"success": True, "found": found, "commands": commands})
    except Exception:
        logger.exception("heartbeat 처리 오류")
        return jsonify({"success": False, "error": "서버 내부 오류"}), 500


@agent_api_bp.route("/api/agent/upload", methods=["POST"])
def agent_upload():
    """에이전트 JSON 파일 업로드 수신

    multipart/form-data 의 'file' 필드 또는 application/json body를 처리한다.
    """
    payload = None

    # 1) multipart file upload
    if "file" in request.files:
        f = request.files["file"]
        if not f.filename:
            return jsonify({"success": False, "error": "파일이 비어있습니다."}), 400
        try:
            raw = f.read().decode("utf-8")
            payload = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            return jsonify({"success": False, "error": f"JSON 파싱 오류: {e}"}), 400

    # 2) JSON body
    elif request.is_json:
        payload = request.get_json(silent=True)

    if not payload or not isinstance(payload, dict):
        return jsonify({
            "success": False,
            "error": "JSON 파일 또는 JSON body가 필요합니다.",
        }), 400

    try:
        result = process_agent_payload(payload, remote_ip=_get_remote_ip())
    except Exception:
        logger.exception("에이전트 업로드 처리 중 오류")
        return jsonify({
            "success": False,
            "error": "서버 내부 오류가 발생했습니다.",
        }), 500

    status_code = 200 if result.get("success") else 400
    return jsonify(result), status_code


@agent_api_bp.route("/api/agent/pending", methods=["GET"])
def agent_pending_list():
    """미연동 에이전트 대기 목록"""
    try:
        rows = get_pending_agents()
        return jsonify({"success": True, "rows": rows, "total": len(rows)})
    except Exception:
        logger.exception("에이전트 대기 목록 조회 오류")
        return jsonify({"success": False, "error": "서버 내부 오류"}), 500


@agent_api_bp.route("/api/agent/link", methods=["POST"])
def agent_link():
    """대기 에이전트를 자산에 연동"""
    data = request.get_json(silent=True) or {}
    pending_id = data.get("pending_id")
    asset_id = data.get("asset_id")

    if not pending_id or not asset_id:
        return jsonify({
            "success": False,
            "error": "pending_id와 asset_id가 필요합니다.",
        }), 400

    try:
        pending_id = int(pending_id)
        asset_id = int(asset_id)
    except (ValueError, TypeError):
        return jsonify({"success": False, "error": "유효하지 않은 ID"}), 400

    try:
        result = link_agent_to_asset(pending_id, asset_id)
    except Exception:
        logger.exception("에이전트 연동 처리 중 오류")
        return jsonify({"success": False, "error": "서버 내부 오류"}), 500

    status_code = 200 if result.get("success") else 400
    return jsonify(result), status_code


@agent_api_bp.route("/api/agent/linked/<int:asset_id>", methods=["GET"])
def agent_linked_info(asset_id):
    """자산에 연동된 에이전트 정보 조회"""
    try:
        info = get_linked_agent(asset_id)
        return jsonify({"success": True, "linked": info})
    except Exception:
        logger.exception("연동 에이전트 조회 오류")
        return jsonify({"success": False, "error": "서버 내부 오류"}), 500


@agent_api_bp.route("/api/agent/linked/<int:asset_id>/collected", methods=["GET"])
def agent_linked_collected(asset_id):
    """자산에 연동된 에이전트의 수집 payload를 섹션별로 반환"""
    section = (request.args.get("section") or "").strip()
    normalized = normalize_agent_section(section)
    if not normalized:
        return jsonify({
            "success": False,
            "error": "section이 필요합니다. hardware, interface, account, authority, firewalld, storage, package 중 하나를 사용하세요.",
        }), 400

    try:
        linked = get_linked_agent(asset_id)
        if not linked:
            return jsonify({
                "success": True,
                "item": {
                    "section": normalized,
                    "rows": [],
                    "total": 0,
                    "message": "연동된 에이전트가 없습니다.",
                },
            })

        item = get_agent_section(int(linked["id"]), normalized)
        if not item:
            return jsonify({"success": False, "error": "Agent not found."}), 404
        return jsonify({"success": True, "item": item})
    except Exception:
        logger.exception("연동 에이전트 수집 데이터 조회 오류")
        return jsonify({"success": False, "error": "서버 내부 오류"}), 500


@agent_api_bp.route("/api/agent/unlink", methods=["POST"])
def agent_unlink():
    """자산에서 에이전트 연동 해제"""
    data = request.get_json(silent=True) or {}
    asset_id = data.get("asset_id")
    if not asset_id:
        return jsonify({"success": False, "error": "asset_id가 필요합니다."}), 400

    try:
        asset_id = int(asset_id)
    except (ValueError, TypeError):
        return jsonify({"success": False, "error": "유효하지 않은 ID"}), 400

    try:
        result = unlink_agent(asset_id)
    except Exception:
        logger.exception("에이전트 연동해제 중 오류")
        return jsonify({"success": False, "error": "서버 내부 오류"}), 500

    status_code = 200 if result.get("success") else 400
    return jsonify(result), status_code


# ── PKI: 에이전트 등록 (인증서 발급) ─────────────────────
@agent_api_bp.route("/api/agent/register", methods=["POST"])
def agent_register():
    """에이전트 등록 — CSR + 토큰으로 클라이언트 인증서를 발급한다.

    Request JSON: {"csr": "PEM string", "token": "hex string", "hostname": "name"}
    Response: {"success": true, "client_cert": "PEM", "ca_cert": "PEM"}
    """
    data = request.get_json(silent=True) or {}
    csr_pem = data.get("csr", "").strip()
    token_str = data.get("token", "").strip()  # 선택 — 없으면 자동 승인
    hostname = data.get("hostname", "").strip()

    if not csr_pem or not hostname:
        return jsonify({
            "success": False,
            "error": "csr, hostname이 필요합니다.",
        }), 400

    try:
        success, result = sign_agent_csr(
            csr_pem.encode("utf-8"), hostname, token_str
        )
    except Exception:
        logger.exception("에이전트 등록 중 오류")
        return jsonify({"success": False, "error": "서버 내부 오류"}), 500

    if not success:
        return jsonify({"success": False, "error": result.get("error", "")}), 403

    return jsonify({
        "success": True,
        "client_cert": result["client_cert"],
        "ca_cert": result["ca_cert"],
    })


# ── PKI: 토큰 관리 API (관리자용) ───────────────────────
@agent_api_bp.route("/api/agent/tokens", methods=["GET"])
def agent_token_list():
    """등록 토큰 목록"""
    try:
        rows = list_tokens()
        return jsonify({"success": True, "rows": rows, "total": len(rows)})
    except Exception:
        logger.exception("토큰 목록 조회 오류")
        return jsonify({"success": False, "error": "서버 내부 오류"}), 500


@agent_api_bp.route("/api/agent/tokens", methods=["POST"])
def agent_token_create():
    """등록 토큰 생성"""
    data = request.get_json(silent=True) or {}
    hours = data.get("hours", 24)
    max_uses = data.get("max_uses", 0)
    try:
        result = generate_token(hours=int(hours), max_uses=int(max_uses))
        return jsonify({"success": True, "item": result})
    except Exception:
        logger.exception("토큰 생성 오류")
        return jsonify({"success": False, "error": "서버 내부 오류"}), 500


@agent_api_bp.route("/api/agent/tokens/<int:token_id>/revoke", methods=["POST"])
def agent_token_revoke(token_id):
    """등록 토큰 폐기"""
    try:
        revoke_token(token_id)
        return jsonify({"success": True})
    except Exception:
        logger.exception("토큰 폐기 오류")
        return jsonify({"success": False, "error": "서버 내부 오류"}), 500


# ── PKI: 에이전트 인증서 관리 ────────────────────────────
@agent_api_bp.route("/api/agent/certs", methods=["GET"])
def agent_cert_list():
    """발급된 에이전트 인증서 목록"""
    try:
        rows = list_agent_certs()
        return jsonify({"success": True, "rows": rows, "total": len(rows)})
    except Exception:
        logger.exception("인증서 목록 조회 오류")
        return jsonify({"success": False, "error": "서버 내부 오류"}), 500


@agent_api_bp.route("/api/agent/certs/<int:cert_id>/revoke", methods=["POST"])
def agent_cert_revoke(cert_id):
    """에이전트 인증서 폐기"""
    try:
        revoke_agent_cert(cert_id)
        return jsonify({"success": True})
    except Exception:
        logger.exception("인증서 폐기 오류")
        return jsonify({"success": False, "error": "서버 내부 오류"}), 500


# ═══════════════════════════════════════════════════════════
# CLI 관리 API — lumina CLI 도구 전용
# ═══════════════════════════════════════════════════════════

_CLI_TOKEN_SALT = "lumina-cli-auth"
_CLI_TOKEN_MAX_AGE = 86400  # 24시간


def _get_serializer():
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"])


def cli_auth_required(allowed_roles=None):
    """CLI 토큰 인증 데코레이터

    allowed_roles: 허용 역할 목록 (None이면 모든 인증 사용자 허용)
    """
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            auth_header = request.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                return jsonify({
                    "success": False, "error": "Authentication required."
                }), 401
            token = auth_header[7:]
            try:
                s = _get_serializer()
                data = s.loads(token, salt=_CLI_TOKEN_SALT, max_age=_CLI_TOKEN_MAX_AGE)
            except SignatureExpired:
                return jsonify({
                    "success": False, "error": "Token expired. Please login again."
                }), 401
            except BadSignature:
                return jsonify({
                    "success": False, "error": "Invalid token."
                }), 401

            user_role = (data.get("role") or "").lower()
            if allowed_roles and user_role not in [r.lower() for r in allowed_roles]:
                return jsonify({
                    "success": False, "error": "Insufficient permissions."
                }), 403

            request.cli_user = data
            return f(*args, **kwargs)
        return wrapper
    return decorator


def _audit(command: str, target_id=None, detail=None):
    """현재 요청의 CLI 사용자 정보로 감사 로그 기록"""
    user = getattr(request, "cli_user", {})
    create_audit_log(
        emp_no=user.get("emp_no", "unknown"),
        role=user.get("role", ""),
        command=command,
        target_id=target_id,
        ip_address=request.remote_addr,
        detail=detail,
    )


def _apply_rbac(data, single=True):
    """현재 사용자 역할에 따라 민감 데이터 마스킹"""
    user = getattr(request, "cli_user", {})
    role = user.get("role", "auditor")
    if single:
        return mask_sensitive_data(data, role)
    return [mask_sensitive_data(d, role) for d in data]


# ── CLI 인증 ─────────────────────────────────────────────

@agent_api_bp.route("/api/cli/login", methods=["POST"])
def cli_login():
    """CLI 로그인 — 사번/비밀번호로 인증 후 토큰 발급"""
    data = request.get_json(silent=True) or {}
    emp_no = (data.get("emp_no") or "").strip()
    password = (data.get("password") or "").strip()

    if not emp_no or not password:
        return jsonify({
            "success": False, "error": "emp_no and password are required."
        }), 400

    try:
        from app.models import AuthUser
        user = AuthUser.query.filter_by(emp_no=emp_no).first()
        if not user or not user.check_password(password):
            return jsonify({
                "success": False, "error": "Invalid employee number or password."
            }), 401

        if getattr(user, "status", None) != "active":
            return jsonify({
                "success": False, "error": "Account is disabled."
            }), 401

        if user.is_locked():
            return jsonify({
                "success": False, "error": "Account is locked."
            }), 401
    except Exception:
        logger.exception("CLI 로그인 오류")
        return jsonify({"success": False, "error": "Internal server error"}), 500

    # Generate token
    s = _get_serializer()
    token_data = {
        "emp_no": user.emp_no,
        "role": user.role,
        "user_id": user.id,
    }
    token = s.dumps(token_data, salt=_CLI_TOKEN_SALT)

    _audit("login", detail=f"CLI login success emp_no={emp_no}")

    return jsonify({
        "success": True,
        "token": token,
        "emp_no": user.emp_no,
        "role": user.role,
    })


# ── Agent List ───────────────────────────────────────────

@agent_api_bp.route("/api/cli/agents", methods=["GET"])
@cli_auth_required()
def cli_agent_list():
    _audit("agent list")
    try:
        rows = list_all_agents()
        rows = _apply_rbac(rows, single=False)
        return jsonify({"success": True, "rows": rows, "total": len(rows)})
    except Exception:
        logger.exception("CLI agent list error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


# ── Agent Search ─────────────────────────────────────────

@agent_api_bp.route("/api/cli/agents/search", methods=["GET"])
@cli_auth_required()
def cli_agent_search():
    hostname = request.args.get("hostname", "").strip()
    ip = request.args.get("ip", "").strip()
    _audit("agent find", detail=f"hostname={hostname} ip={ip}")
    try:
        rows = search_agents(hostname=hostname or None, ip=ip or None)
        rows = _apply_rbac(rows, single=False)
        return jsonify({"success": True, "rows": rows, "total": len(rows)})
    except Exception:
        logger.exception("CLI agent search error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


# ── Agent Detail ─────────────────────────────────────────

@agent_api_bp.route("/api/cli/agents/<int:agent_id>", methods=["GET"])
@cli_auth_required()
def cli_agent_show(agent_id):
    section = (request.args.get("section") or "").strip()
    _audit("agent show", target_id=agent_id, detail=f"section={section or 'detail'}")
    try:
        if section:
            normalized = normalize_agent_section(section)
            if not normalized:
                return jsonify({
                    "success": False,
                    "error": "Invalid section. Use hardware, interface, account, authority, firewalld, storage, or package.",
                }), 400
            item = get_agent_section(agent_id, normalized)
        else:
            item = get_agent_detail(agent_id)

        if not item:
            return jsonify({"success": False, "error": "Agent not found."}), 404
        item = _apply_rbac(item)
        return jsonify({"success": True, "item": item})
    except Exception:
        logger.exception("CLI agent detail error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


# ── Agent Status ─────────────────────────────────────────

@agent_api_bp.route("/api/cli/agents/<int:agent_id>/status", methods=["GET"])
@cli_auth_required()
def cli_agent_status(agent_id):
    _audit("agent status", target_id=agent_id)
    try:
        item = get_agent_status(agent_id)
        if not item:
            return jsonify({"success": False, "error": "Agent not found."}), 404
        return jsonify({"success": True, "item": item})
    except Exception:
        logger.exception("CLI agent status error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


# ── Agent Health ─────────────────────────────────────────

@agent_api_bp.route("/api/cli/agents/<int:agent_id>/health", methods=["GET"])
@cli_auth_required()
def cli_agent_health(agent_id):
    _audit("agent health", target_id=agent_id)
    try:
        item = get_agent_health(agent_id)
        if not item:
            return jsonify({"success": False, "error": "Agent not found."}), 404
        return jsonify({"success": True, "item": item})
    except Exception:
        logger.exception("CLI agent health error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


# ── Agent Inventory ──────────────────────────────────────

@agent_api_bp.route("/api/cli/agents/<int:agent_id>/inventory", methods=["GET"])
@cli_auth_required(allowed_roles=["admin", "user"])
def cli_agent_inventory(agent_id):
    _audit("agent inventory", target_id=agent_id)
    try:
        result = get_agent_inventory(agent_id)
        if not result:
            return jsonify({"success": False, "error": "Agent not found."}), 404
        result = _apply_rbac(result)
        return jsonify({"success": True, "item": result})
    except Exception:
        logger.exception("CLI inventory error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


# ── Management Commands ──────────────────────────────────

@agent_api_bp.route("/api/cli/agents/<int:agent_id>/enable", methods=["POST"])
@cli_auth_required(allowed_roles=["admin"])
def cli_agent_enable(agent_id):
    _audit("agent enable", target_id=agent_id)
    try:
        ok = enable_agent(agent_id)
        if not ok:
            return jsonify({"success": False, "error": "Agent not found."}), 404
        return jsonify({"success": True, "message": f"Agent {agent_id} enabled."})
    except Exception:
        logger.exception("CLI agent enable error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


@agent_api_bp.route("/api/cli/agents/<int:agent_id>/disable", methods=["POST"])
@cli_auth_required(allowed_roles=["admin"])
def cli_agent_disable(agent_id):
    _audit("agent disable", target_id=agent_id)
    try:
        ok = disable_agent(agent_id)
        if not ok:
            return jsonify({"success": False, "error": "Agent not found."}), 404
        return jsonify({"success": True, "message": f"Agent {agent_id} disabled."})
    except Exception:
        logger.exception("CLI agent disable error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


@agent_api_bp.route("/api/cli/agents/<int:agent_id>/resend", methods=["POST"])
@cli_auth_required(allowed_roles=["admin"])
def cli_agent_resend(agent_id):
    _audit("agent resend", target_id=agent_id)
    try:
        ok = set_pending_command(agent_id, "resend")
        if not ok:
            return jsonify({"success": False, "error": "Agent not found."}), 404
        return jsonify({
            "success": True,
            "message": f"Resend command queued for agent {agent_id}."
        })
    except Exception:
        logger.exception("CLI resend error")
        return jsonify({"success": False, "error": "Internal server error"}), 500


@agent_api_bp.route("/api/cli/agents/<int:agent_id>/collect", methods=["POST"])
@cli_auth_required(allowed_roles=["admin"])
def cli_agent_collect(agent_id):
    _audit("agent collect", target_id=agent_id)
    try:
        ok = set_pending_command(agent_id, "collect")
        if not ok:
            return jsonify({"success": False, "error": "Agent not found."}), 404
        return jsonify({
            "success": True,
            "message": f"Collect command queued for agent {agent_id}."
        })
    except Exception:
        logger.exception("CLI collect error")
        return jsonify({"success": False, "error": "Internal server error"}), 500
