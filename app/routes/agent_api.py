"""에이전트 업로드 API Blueprint

POST /api/agent/upload   — 에이전트가 수집한 JSON 파일 업로드
GET  /api/agent/pending  — 미연동 에이전트 대기 목록
POST /api/agent/link     — 대기 에이전트를 자산에 연동
"""

from __future__ import annotations

import json
import logging
from flask import Blueprint, jsonify, request, current_app

from app.services.agent_service import (
    process_agent_payload,
    get_pending_agents,
    link_agent_to_asset,
    get_linked_agent,
    unlink_agent,
)

logger = logging.getLogger(__name__)

agent_api_bp = Blueprint("agent_api", __name__)


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
        result = process_agent_payload(payload)
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
