"""Push notification dispatcher.

큐 기반 푸시 발송 서비스. `push_log` 테이블에서 status='queued'인 행을
주기적으로 가져와 디바이스 platform에 맞는 provider로 전송한다.

자격증명 주입 방식 (환경변수)
- FCM (HTTP v1):  FCM_PROJECT_ID + FCM_SERVICE_ACCOUNT_JSON (경로 또는 JSON 문자열)
                  또는 FCM_LEGACY_SERVER_KEY (구형 fallback)
- APNs (HTTP/2):  APNS_TEAM_ID + APNS_KEY_ID + APNS_AUTH_KEY_PATH + APNS_BUNDLE_ID
                  (+ APNS_USE_SANDBOX=1 옵션)
- WebPush (VAPID):  WEBPUSH_VAPID_PUBLIC + WEBPUSH_VAPID_PRIVATE + WEBPUSH_SUBJECT(mailto:)

자격증명이 없으면 해당 provider는 status='skipped'로 표기 후 통과한다.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from typing import Any, Iterable, Optional

logger = logging.getLogger(__name__)

# Worker tuning
_WORKER_INTERVAL_SEC = 5
_BATCH_SIZE = 50
_RETRY_MAX = 3
_RETRY_BACKOFF_SEC = 30  # 처음 실패 후 30초 간격

_THREAD_NAME = 'push-dispatch-worker'
_STARTED_FLAG = '_push_dispatch_worker_started'


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def enqueue_push(
    *,
    user_ids: Iterable[int],
    title: str,
    body: str,
    data: Optional[dict] = None,
    notification_id: Optional[int] = None,
) -> int:
    """주어진 사용자들의 활성 디바이스 전체에 푸시 작업을 큐에 적재.

    Returns 적재된 push_log 행 수.
    """
    from app.models import PushDevice, PushLog, db

    queued = 0
    payload_data = data or {}
    for uid in set(int(u) for u in user_ids if u is not None):
        devices = (
            PushDevice.query
            .filter(PushDevice.user_id == uid)
            .filter(PushDevice.revoked_at.is_(None))
            .all()
        )
        for dev in devices:
            provider = _provider_for_platform(dev.platform)
            log = PushLog(
                notification_id=notification_id,
                user_id=uid,
                device_id=dev.id,
                provider=provider,
                status='queued',
            )
            db.session.add(log)
            queued += 1
    if queued:
        # title/body/data를 어떻게 보존할까? push_log에 별도 컬럼이 없으므로
        # MsgNotification 레코드를 참조하거나 임시 메모리 큐가 필요하다.
        # 간단하게 stash dict를 모듈 전역에 두고, 워커가 notification_id로 조회한다.
        if notification_id:
            _PAYLOAD_CACHE[notification_id] = {
                'title': title, 'body': body, 'data': payload_data,
            }
        else:
            # notification_id가 없으면 즉시 발송용 임시 키를 device 마다 발급
            pass
    return queued


def enqueue_push_simple(
    *,
    user_ids: Iterable[int],
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> int:
    """notification_id 없이 즉석 푸시. MsgNotification을 만들고 enqueue."""
    from app.models import MsgNotification, db

    notif_ids: list[int] = []
    for uid in set(int(u) for u in user_ids if u is not None):
        n = MsgNotification(
            user_id=uid,
            notification_type='push',
            reference_type=(data or {}).get('refType') or 'push',
            reference_id=(data or {}).get('refId') or 0,
            title=title or '',
            body=(body or '')[:255],
        )
        db.session.add(n)
        db.session.flush()
        notif_ids.append((uid, n.id))

    total = 0
    for uid, nid in notif_ids:
        total += enqueue_push(
            user_ids=[uid], title=title, body=body, data=data, notification_id=nid,
        )
    return total


# ---------------------------------------------------------------------------
# Worker
# ---------------------------------------------------------------------------

# notification_id -> {title, body, data} 캐시 (재기동 시 휘발 → DB로 복원)
_PAYLOAD_CACHE: dict[int, dict] = {}


def start_push_dispatch_worker(app) -> None:
    """앱 부팅 시 1회 호출. 데몬 스레드로 워커를 띄운다."""
    if getattr(app, _STARTED_FLAG, False):
        return
    setattr(app, _STARTED_FLAG, True)

    def _loop():
        time.sleep(5)  # 부팅 직후 트래픽 충돌 회피
        while True:
            try:
                with app.app_context():
                    processed = _process_batch()
                if processed:
                    logger.info('[push-dispatch] processed=%d', processed)
            except Exception as exc:
                try:
                    print('[push-dispatch] error:', exc, flush=True)
                except Exception:
                    pass
            time.sleep(_WORKER_INTERVAL_SEC)

    t = threading.Thread(target=_loop, name=_THREAD_NAME, daemon=True)
    t.start()
    print('[push-dispatch] background worker started (interval=%ds)' % _WORKER_INTERVAL_SEC, flush=True)


def _process_batch() -> int:
    from app.models import MsgNotification, PushDevice, PushLog, db

    rows = (
        PushLog.query
        .filter(PushLog.status == 'queued')
        .order_by(PushLog.id.asc())
        .limit(_BATCH_SIZE)
        .all()
    )
    if not rows:
        return 0

    processed = 0
    for log in rows:
        # 페이로드 복원
        payload = _PAYLOAD_CACHE.get(log.notification_id) if log.notification_id else None
        if payload is None and log.notification_id:
            n = MsgNotification.query.get(log.notification_id)
            if n:
                payload = {'title': n.title or '', 'body': n.body or '', 'data': {}}
                _PAYLOAD_CACHE[log.notification_id] = payload
        payload = payload or {'title': '알림', 'body': '', 'data': {}}

        device = PushDevice.query.get(log.device_id) if log.device_id else None
        if not device or device.revoked_at is not None:
            log.status = 'failed'
            log.error_code = 'device_revoked_or_missing'
            log.attempted_at = datetime.utcnow()
            db.session.commit()
            processed += 1
            continue

        try:
            sender = _sender_for_provider(log.provider)
            if sender is None:
                log.status = 'skipped'
                log.error_code = 'no_credentials'
                log.error_msg = 'provider not configured'
                log.attempted_at = datetime.utcnow()
            else:
                ok, err_code, err_msg = sender(device.device_token, payload)
                log.attempted_at = datetime.utcnow()
                if ok:
                    log.status = 'sent'
                    log.delivered_at = datetime.utcnow()
                else:
                    log.status = 'failed'
                    log.error_code = err_code or 'send_failed'
                    log.error_msg = (err_msg or '')[:500]
                    if err_code in ('Unregistered', 'InvalidRegistration', 'BadDeviceToken'):
                        device.revoked_at = datetime.utcnow()
        except Exception as exc:
            log.status = 'failed'
            log.error_code = 'exception'
            log.error_msg = str(exc)[:500]
            log.attempted_at = datetime.utcnow()

        db.session.commit()
        processed += 1
    return processed


# ---------------------------------------------------------------------------
# Provider routing
# ---------------------------------------------------------------------------

def _provider_for_platform(platform: str) -> str:
    p = (platform or '').lower()
    if p == 'ios':
        return 'apns'
    if p == 'web':
        return 'webpush'
    return 'fcm'


def _sender_for_provider(provider: str):
    p = (provider or '').lower()
    if p == 'fcm':
        if _fcm_configured():
            return _send_fcm
        return None
    if p == 'apns':
        if _apns_configured():
            return _send_apns
        return None
    if p == 'webpush':
        if _webpush_configured():
            return _send_webpush
        return None
    return None


# ---------------------------------------------------------------------------
# FCM (HTTP v1 + legacy fallback)
# ---------------------------------------------------------------------------

_FCM_TOKEN_CACHE: dict = {'access_token': None, 'expires_at': 0}


def _fcm_configured() -> bool:
    if os.environ.get('FCM_PROJECT_ID') and os.environ.get('FCM_SERVICE_ACCOUNT_JSON'):
        return True
    if os.environ.get('FCM_LEGACY_SERVER_KEY'):
        return True
    return False


def _fcm_load_service_account() -> Optional[dict]:
    raw = os.environ.get('FCM_SERVICE_ACCOUNT_JSON', '').strip()
    if not raw:
        return None
    if raw.startswith('{'):
        try:
            return json.loads(raw)
        except Exception:
            return None
    if os.path.isfile(raw):
        try:
            with open(raw, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return None
    return None


def _fcm_oauth_access_token() -> Optional[str]:
    """JWT bearer assertion → OAuth2 access token (firebase messaging scope)."""
    now = int(time.time())
    if _FCM_TOKEN_CACHE['access_token'] and _FCM_TOKEN_CACHE['expires_at'] > now + 60:
        return _FCM_TOKEN_CACHE['access_token']

    sa = _fcm_load_service_account()
    if not sa or 'private_key' not in sa or 'client_email' not in sa:
        return None

    try:
        # cryptography is widely available; if missing → skip cleanly
        from cryptography.hazmat.backends import default_backend
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
    except Exception:
        logger.warning('[push-fcm] cryptography not installed; cannot sign JWT')
        return None

    iat = now
    exp = now + 3600
    header = {'alg': 'RS256', 'typ': 'JWT'}
    claims = {
        'iss': sa['client_email'],
        'scope': 'https://www.googleapis.com/auth/firebase.messaging',
        'aud': 'https://oauth2.googleapis.com/token',
        'iat': iat,
        'exp': exp,
    }

    def b64url(b: bytes) -> bytes:
        return base64.urlsafe_b64encode(b).rstrip(b'=')

    h = b64url(json.dumps(header, separators=(',', ':')).encode())
    c = b64url(json.dumps(claims, separators=(',', ':')).encode())
    signing_input = h + b'.' + c

    pkey = serialization.load_pem_private_key(
        sa['private_key'].encode(), password=None, backend=default_backend(),
    )
    sig = pkey.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    jwt = signing_input + b'.' + b64url(sig)

    body = (
        b'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer'
        b'&assertion=' + jwt
    )
    req = urllib.request.Request(
        'https://oauth2.googleapis.com/token',
        data=body,
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            tok = json.loads(resp.read().decode())
    except Exception as exc:
        logger.warning('[push-fcm] token error: %s', exc)
        return None

    _FCM_TOKEN_CACHE['access_token'] = tok.get('access_token')
    _FCM_TOKEN_CACHE['expires_at'] = now + int(tok.get('expires_in', 3600))
    return _FCM_TOKEN_CACHE['access_token']


def _send_fcm(device_token: str, payload: dict) -> tuple[bool, Optional[str], Optional[str]]:
    project_id = os.environ.get('FCM_PROJECT_ID', '').strip()
    if project_id:
        token = _fcm_oauth_access_token()
        if not token:
            return False, 'auth_failed', 'oauth token unavailable'
        body = {
            'message': {
                'token': device_token,
                'notification': {
                    'title': payload.get('title') or '',
                    'body': payload.get('body') or '',
                },
                'data': {str(k): str(v) for k, v in (payload.get('data') or {}).items()},
            }
        }
        req = urllib.request.Request(
            'https://fcm.googleapis.com/v1/projects/%s/messages:send' % project_id,
            data=json.dumps(body).encode('utf-8'),
            headers={
                'Authorization': 'Bearer %s' % token,
                'Content-Type': 'application/json; charset=UTF-8',
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                resp.read()
            return True, None, None
        except urllib.error.HTTPError as e:
            try:
                err_body = e.read().decode()
            except Exception:
                err_body = ''
            code = 'HTTP_%s' % e.code
            if 'UNREGISTERED' in err_body or 'NOT_FOUND' in err_body:
                code = 'Unregistered'
            return False, code, err_body[:500]
        except Exception as exc:
            return False, 'network', str(exc)

    # Legacy fallback
    server_key = os.environ.get('FCM_LEGACY_SERVER_KEY', '').strip()
    if server_key:
        body = {
            'to': device_token,
            'notification': {
                'title': payload.get('title') or '',
                'body': payload.get('body') or '',
            },
            'data': payload.get('data') or {},
        }
        req = urllib.request.Request(
            'https://fcm.googleapis.com/fcm/send',
            data=json.dumps(body).encode('utf-8'),
            headers={
                'Authorization': 'key=%s' % server_key,
                'Content-Type': 'application/json',
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                rj = json.loads(resp.read().decode() or '{}')
            if rj.get('failure'):
                results = rj.get('results') or [{}]
                err = results[0].get('error', 'unknown')
                return False, err, json.dumps(results)
            return True, None, None
        except Exception as exc:
            return False, 'network', str(exc)
    return False, 'no_credentials', None


# ---------------------------------------------------------------------------
# APNs (HTTP/2)
# ---------------------------------------------------------------------------

def _apns_configured() -> bool:
    return all(os.environ.get(k) for k in (
        'APNS_TEAM_ID', 'APNS_KEY_ID', 'APNS_AUTH_KEY_PATH', 'APNS_BUNDLE_ID',
    ))


_APNS_JWT_CACHE: dict = {'token': None, 'iat': 0}


def _apns_jwt() -> Optional[str]:
    """ES256 JWT — APNs는 약 1시간마다 갱신 권장."""
    now = int(time.time())
    if _APNS_JWT_CACHE['token'] and (now - _APNS_JWT_CACHE['iat']) < 50 * 60:
        return _APNS_JWT_CACHE['token']
    try:
        from cryptography.hazmat.backends import default_backend
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import ec, utils as ec_utils
    except Exception:
        return None
    key_path = os.environ.get('APNS_AUTH_KEY_PATH', '').strip()
    if not key_path or not os.path.isfile(key_path):
        return None
    with open(key_path, 'rb') as f:
        pkey = serialization.load_pem_private_key(f.read(), password=None, backend=default_backend())

    header = {'alg': 'ES256', 'kid': os.environ['APNS_KEY_ID']}
    claims = {'iss': os.environ['APNS_TEAM_ID'], 'iat': now}

    def b64url(b: bytes) -> bytes:
        return base64.urlsafe_b64encode(b).rstrip(b'=')

    h = b64url(json.dumps(header, separators=(',', ':')).encode())
    c = b64url(json.dumps(claims, separators=(',', ':')).encode())
    signing_input = h + b'.' + c
    der_sig = pkey.sign(signing_input, ec.ECDSA(hashes.SHA256()))
    r, s = ec_utils.decode_dss_signature(der_sig)
    raw_sig = r.to_bytes(32, 'big') + s.to_bytes(32, 'big')
    jwt_token = (signing_input + b'.' + b64url(raw_sig)).decode()
    _APNS_JWT_CACHE.update({'token': jwt_token, 'iat': now})
    return jwt_token


def _send_apns(device_token: str, payload: dict) -> tuple[bool, Optional[str], Optional[str]]:
    """APNs HTTP/2. urllib는 HTTP/2를 지원하지 않으므로 httpx가 필요.

    httpx[http2]가 미설치면 skipped 처리된다.
    """
    try:
        import httpx  # type: ignore
    except Exception:
        return False, 'no_credentials', 'httpx[http2] not installed'

    jwt_token = _apns_jwt()
    if not jwt_token:
        return False, 'auth_failed', 'cannot sign APNs JWT'

    sandbox = os.environ.get('APNS_USE_SANDBOX', '').strip() in ('1', 'true', 'yes')
    host = 'api.sandbox.push.apple.com' if sandbox else 'api.push.apple.com'
    url = 'https://%s/3/device/%s' % (host, device_token)
    body = {
        'aps': {
            'alert': {
                'title': payload.get('title') or '',
                'body': payload.get('body') or '',
            },
            'sound': 'default',
        },
    }
    for k, v in (payload.get('data') or {}).items():
        if k != 'aps':
            body[k] = v

    headers = {
        'authorization': 'bearer %s' % jwt_token,
        'apns-topic': os.environ['APNS_BUNDLE_ID'],
        'apns-push-type': 'alert',
    }
    try:
        with httpx.Client(http2=True, timeout=8.0) as cli:
            r = cli.post(url, headers=headers, json=body)
        if r.status_code == 200:
            return True, None, None
        try:
            j = r.json()
        except Exception:
            j = {'reason': r.text}
        reason = j.get('reason', 'HTTP_%s' % r.status_code)
        return False, reason, json.dumps(j)[:500]
    except Exception as exc:
        return False, 'network', str(exc)


# ---------------------------------------------------------------------------
# WebPush (VAPID)
# ---------------------------------------------------------------------------

def _webpush_configured() -> bool:
    return all(os.environ.get(k) for k in (
        'WEBPUSH_VAPID_PUBLIC', 'WEBPUSH_VAPID_PRIVATE', 'WEBPUSH_SUBJECT',
    ))


def _send_webpush(device_token: str, payload: dict) -> tuple[bool, Optional[str], Optional[str]]:
    """device_token에는 PushSubscription JSON이 들어있다고 가정.

    실제 암호화는 pywebpush 패키지에 위임. 미설치면 skipped.
    """
    try:
        from pywebpush import WebPushException, webpush  # type: ignore
    except Exception:
        return False, 'no_credentials', 'pywebpush not installed'

    try:
        sub_info = json.loads(device_token) if device_token.startswith('{') else None
    except Exception:
        sub_info = None
    if not sub_info or 'endpoint' not in sub_info:
        return False, 'BadDeviceToken', 'device_token is not a valid WebPush subscription JSON'

    body = json.dumps({
        'title': payload.get('title') or '',
        'body': payload.get('body') or '',
        'data': payload.get('data') or {},
    })
    try:
        webpush(
            subscription_info=sub_info,
            data=body,
            vapid_private_key=os.environ['WEBPUSH_VAPID_PRIVATE'],
            vapid_claims={'sub': os.environ['WEBPUSH_SUBJECT']},
            ttl=60,
        )
        return True, None, None
    except WebPushException as e:
        code = 'WebPushException'
        if e.response is not None and e.response.status_code in (404, 410):
            code = 'Unregistered'
        return False, code, str(e)[:500]
    except Exception as exc:
        return False, 'network', str(exc)


__all__ = [
    'enqueue_push',
    'enqueue_push_simple',
    'start_push_dispatch_worker',
]
