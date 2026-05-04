"""lumina-gate 로 PC 에이전트별 웹 허용 정책을 푸시한다.

매핑된 사용자의 활성 접근 부여(web_access_grant)에서 WEB 도메인을 모아,
default_action BLOCK + ALLOW 규칙 목록 형태로 내려준다.

WEB 서버 환경 변수:

- LUMINA_GATE_PUSH_URL 또는 LUMINA_GATE_BASE_URL : 예 ``https://게이트:8443``
- LUMINA_GATE_POLICY_TOKEN 또는 LUMINA_GATE_PUSH_TOKEN
- 또는 LUMINA_GATE_WEB_SYNC_SECRET (기존 게이트→WEB 동기와 동일 비밀 사용 가능)

개발 편의: HTTPS 자체 서명 시 ``LUMINA_GATE_PUSH_VERIFY_TLS=false``

게이트 ``config.yaml`` 의 ``policy_sync_token`` 비어 있으면 POST 에 거절한다.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Set
from urllib import error as urlerr
from urllib import request as urlrequest
from urllib.parse import urljoin

logger = logging.getLogger(__name__)


def gate_push_base_url() -> str:
    return (os.environ.get('LUMINA_GATE_PUSH_URL') or os.environ.get('LUMINA_GATE_BASE_URL') or '').strip().rstrip('/')


def gate_push_token() -> str:
    for key in ('LUMINA_GATE_POLICY_TOKEN', 'LUMINA_GATE_PUSH_TOKEN', 'LUMINA_GATE_WEB_SYNC_SECRET'):
        tok = str(os.environ.get(key) or '').strip()
        if tok:
            return tok
    return ''


def _normalize_domain(host: str) -> str:
    h = (host or '').strip().lower().rstrip('.')
    if h.startswith('*.'):
        h = h[2:]
    if not h:
        return ''
    if '[' in h and ']' in h:
        pass
    elif ':' in h and not h.startswith('['):
        h = h.rsplit(':', 1)[0].strip()
    return h


def _collect_domains_for_resource(conn: Any, resource_id: int) -> Set[str]:
    from app.services import web_access_control_service as svc

    out: Set[str] = set()
    row = conn.execute(
        f'SELECT resource_url FROM {svc.RESOURCE_TABLE} WHERE id = ? AND is_deleted = 0',
        (resource_id,),
    ).fetchone()
    if row:
        parsed = svc._parse_url_for_endpoint(str(row['resource_url'] or ''))
        if parsed and parsed.get('host'):
            d = _normalize_domain(str(parsed['host']))
            if d:
                out.add(d)
    for ep in svc.list_endpoints(resource_id, conn=conn):
        if ep.get('kind') != svc.ENDPOINT_KIND_WEB:
            continue
        h = ep.get('host') or ''
        if str(h).strip():
            nd = _normalize_domain(str(h))
            if nd:
                out.add(nd)
        info = str(ep.get('access_info') or '').strip()
        if info.startswith(('http://', 'https://')):
            p2 = svc._parse_url_for_endpoint(info)
            if p2 and p2.get('host'):
                d2 = _normalize_domain(str(p2['host']))
                if d2:
                    out.add(d2)
    return out


def build_grant_based_web_policy(user_id: int, app=None) -> Dict[str, Any]:
    from app.services import web_access_control_service as svc

    today = svc._today()
    domains: Set[str] = set()
    with svc._get_connection(app) as conn:
        rows = conn.execute(
            f'''
            SELECT DISTINCT g.resource_id,
                   g.grant_status,
                   g.grant_start_date,
                   g.grant_end_date
              FROM {svc.GRANT_TABLE} g
              JOIN {svc.RESOURCE_TABLE} r ON r.id = g.resource_id
             WHERE g.is_deleted = 0
               AND r.is_deleted = 0
               AND g.user_id = ?
            ''',
            (user_id,),
        ).fetchall()
        for row in rows:
            gd = svc._dict(row) or {}
            if not svc.grant_is_active_on_date(dict(gd), today):
                continue
            rid = int(gd.get('resource_id') or 0)
            if rid:
                domains |= _collect_domains_for_resource(conn, rid)

    dom_list = sorted(domains)
    digest = hashlib.sha256('|'.join(dom_list).encode('utf-8', errors='replace')).hexdigest()[:16]
    rules: List[Dict[str, Any]] = [{'domain': d, 'action': 'ALLOW'} for d in dom_list]
    return {
        'policy_version': f'grant-{digest}',
        'default_action': 'BLOCK',
        'rules': rules,
        'updated_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        '_source': 'blossom-grants',
        '_mapped_user_id': user_id,
    }


def _post_gate_json(endpoint: str, body: Dict[str, Any], token: str) -> tuple[bool, str]:
    raw = json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    req = urlrequest.Request(endpoint, data=raw, method='POST')
    req.add_header('Content-Type', 'application/json; charset=utf-8')
    req.add_header('Authorization', 'Bearer ' + token)
    ctx = None
    tls_skip = str(os.environ.get('LUMINA_GATE_PUSH_VERIFY_TLS') or '').strip().lower() in ('0', 'false', 'no', 'off')
    if endpoint.lower().startswith('https://') and tls_skip:
        import ssl

        ctx = ssl._create_unverified_context()
    try:
        with urlrequest.urlopen(req, timeout=22, context=ctx) as resp:
            code = int(getattr(resp, 'status', None) or resp.getcode())
            blob = ''
            try:
                blob = resp.read().decode('utf-8', errors='replace')[:400]
            except Exception:
                pass
            if code >= 400:
                return False, blob or str(code)
            return True, blob or 'ok'
    except urlerr.HTTPError as exc:
        try:
            b = exc.read().decode('utf-8', errors='replace')[:400]
        except Exception:
            b = str(exc)
        return False, f'HTTP {exc.code}: {b}'
    except (urlerr.URLError, OSError, ValueError) as exc:
        return False, str(exc)


def push_agent_policy(agent_id_str: str, policy: Dict[str, Any]) -> tuple[bool, str]:
    aid = str(agent_id_str or '').strip()
    if not aid:
        return False, 'empty agent_id'
    base = gate_push_base_url()
    tok = gate_push_token()
    if not base or not tok:
        logger.debug('[lumina-gate-policy] skip push: gate URL/token missing')
        return False, 'gate_url_or_token_missing'
    ep = urljoin(base + '/', 'api/internal/policy-sync')
    return _post_gate_json(ep, {'agent_id': aid, 'policy': policy}, tok)


def clear_agent_policy(agent_id_str: str) -> tuple[bool, str]:
    aid = str(agent_id_str or '').strip()
    if not aid:
        return False, 'empty agent_id'
    base = gate_push_base_url()
    tok = gate_push_token()
    if not base or not tok:
        return False, 'gate_url_or_token_missing'
    ep = urljoin(base + '/', 'api/internal/policy-sync')
    return _post_gate_json(ep, {'agent_id': aid, 'clear': True}, tok)


def _agent_pk_row(conn: Any, agent_pk: int, svc_mod: Any) -> Optional[Any]:
    return conn.execute(
        f'''SELECT agent_id, mapped_user_id FROM {svc_mod.PC_AGENT_TABLE}
             WHERE id = ? AND is_deleted = 0''',
        (int(agent_pk),),
    ).fetchone()


def _effective_flask_app_for_gate_sync(app=None):
    """Background threads have no Flask request context; freeze app at schedule time."""

    from app.services import web_access_control_service as svc

    return svc._effective_flask_app(app)


def sync_one_pc_agent_pk(agent_pk: int, app=None) -> None:
    from app.services import web_access_control_service as svc

    try:
        with svc._get_connection(app) as conn:
            row = _agent_pk_row(conn, int(agent_pk), svc)
            if not row:
                return
            aid = str(row['agent_id'] or '').strip()
            uid = svc._to_int_or_none(row['mapped_user_id'])
            if not aid:
                return
            if not uid:
                ok, msg = clear_agent_policy(aid)
                if not ok:
                    logger.warning('[lumina-gate-policy] clear overlay failed agent=%s: %s', aid, msg)
                else:
                    logger.info('[lumina-gate-policy] cleared overlay agent=%s (no mapped user)', aid)
                return
            pol = build_grant_based_web_policy(int(uid), app=app)
            ok, msg = push_agent_policy(aid, pol)
            if ok:
                logger.info(
                    '[lumina-gate-policy] pushed agent=%s user=%s version=%s allow=%s',
                    aid,
                    uid,
                    pol.get('policy_version'),
                    len(pol.get('rules') or []),
                )
            else:
                logger.warning('[lumina-gate-policy] push failed agent=%s: %s', aid, msg)
    except Exception:
        logger.exception('[lumina-gate-policy] sync_one_pc_agent_pk failed pk=%s', agent_pk)


def schedule_push_for_pc_agent_row(agent_pk: int, app=None) -> None:
    flask_app = _effective_flask_app_for_gate_sync(app)

    def job() -> None:
        sync_one_pc_agent_pk(int(agent_pk), app=flask_app)

    threading.Thread(target=job, name='lumina-gate-policy-sync', daemon=True).start()


def sync_mapped_users(agent_ids_users: Iterable[int], app=None) -> None:
    from app.services import web_access_control_service as svc

    uids = {svc._to_int_or_none(x) for x in agent_ids_users}
    uids.discard(None)
    if not uids:
        return
    uid_list = [int(u) for u in uids if u is not None]
    try:
        with svc._get_connection(app) as conn:
            placeholders = ','.join(['?'] * len(uid_list))
            rows = conn.execute(
                f'''SELECT id FROM {svc.PC_AGENT_TABLE}
                     WHERE is_deleted = 0
                       AND mapped_user_id IS NOT NULL
                       AND mapped_user_id IN ({placeholders})''',
                tuple(uid_list),
            ).fetchall()
            pks = [int(r['id']) for r in rows]
    except Exception:
        logger.exception('[lumina-gate-policy] sync_mapped_users query failed')
        return
    for pk in pks:
        sync_one_pc_agent_pk(pk, app=app)


def schedule_push_for_mapped_user_ids(user_ids: Iterable[int], app=None) -> None:
    flask_app = _effective_flask_app_for_gate_sync(app)

    def job() -> None:
        sync_mapped_users(user_ids, app=flask_app)

    threading.Thread(target=job, name='lumina-gate-policy-batch', daemon=True).start()


def schedule_full_mapped_resync(app=None) -> None:
    flask_app = _effective_flask_app_for_gate_sync(app)

    def job() -> None:
        from app.services import web_access_control_service as svc

        try:
            with svc._get_connection(flask_app) as conn:
                rows = conn.execute(
                    f'''SELECT id FROM {svc.PC_AGENT_TABLE}
                         WHERE is_deleted = 0 AND mapped_user_id IS NOT NULL''',
                ).fetchall()
                pks = [int(r['id']) for r in rows]
        except Exception:
            logger.exception('[lumina-gate-policy] full resync listing failed')
            return
        for pk in pks:
            sync_one_pc_agent_pk(pk, app=flask_app)

    threading.Thread(target=job, name='lumina-gate-policy-resync-all', daemon=True).start()


def schedule_users_for_resource(resource_id: int, app=None) -> None:
    from app.services import web_access_control_service as svc

    rid = svc._to_int_or_none(resource_id)
    if not rid:
        return

    flask_app = _effective_flask_app_for_gate_sync(app)

    def job() -> None:
        uids: Set[int] = set()
        try:
            with svc._get_connection(flask_app) as conn:
                rows = conn.execute(
                    f'''SELECT DISTINCT user_id FROM {svc.GRANT_TABLE}
                         WHERE is_deleted = 0 AND resource_id = ?''',
                    (rid,),
                ).fetchall()
                for r in rows:
                    uid = svc._to_int_or_none(r['user_id'])
                    if uid:
                        uids.add(int(uid))
        except Exception:
            logger.exception('[lumina-gate-policy] grant users for resource failed')
            return
        sync_mapped_users(uids, app=flask_app)

    threading.Thread(target=job, name='lumina-gate-policy-by-resource', daemon=True).start()
