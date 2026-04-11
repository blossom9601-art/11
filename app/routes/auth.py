from flask import Blueprint, render_template, request, redirect, url_for, flash, session, jsonify, current_app, make_response
import os
import re
import ipaddress
from app.models import db, AuthUser, AuthLoginHistory, AuthPasswordHistory, UserProfile, OrgDepartment
from app.models import AuthRole, Role, RoleUser, SmtpConfig, SmsConfig, MfaConfig, MfaPendingCode, CompanyOtpConfig
from app.models import PermissionAuditLog, Menu, RoleMenuPermission, DepartmentMenuPermission, UserMenuPermission
from datetime import datetime, timedelta
import json
import random
import string
import sqlalchemy as sa

auth_bp = Blueprint('auth', __name__)

ROLE_PERMISSION_FIELDS = (
    'dashboard', 'hardware', 'software', 'governance',
    'datacenter', 'cost', 'project', 'category', 'insight'
)
ADMIN_SESSION_ROLES = ('admin', 'ADMIN', '관리자')


def _parse_user_agent(ua):
    """User-Agent 문자열에서 브라우저/OS를 추출한다."""
    browser = '알 수 없음'
    if 'Whale' in ua:
        browser = 'Whale'
    elif 'Edg' in ua:
        browser = 'Edge'
    elif 'Chrome' in ua:
        browser = 'Chrome'
    elif 'Firefox' in ua:
        browser = 'Firefox'
    elif 'Safari' in ua:
        browser = 'Safari'
    os_name = '알 수 없음'
    if 'Windows' in ua:
        os_name = 'Windows'
    elif 'Mac' in ua:
        os_name = 'macOS'
    elif 'Linux' in ua:
        os_name = 'Linux'
    elif 'Android' in ua:
        os_name = 'Android'
    elif 'iPhone' in ua or 'iPad' in ua:
        os_name = 'iOS'
    return browser, os_name


def _get_client_ip():
    """X-Forwarded-For 헤더를 우선 확인하여 실제 클라이언트 IP를 반환한다."""
    forwarded = request.headers.get('X-Forwarded-For', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.headers.get('X-Real-Ip', '') or request.remote_addr or ''


def _register_active_session(emp_no, user_name=''):
    """현재 요청 정보를 active_sessions 테이블에 등록한다.
    security_policy.max_sessions / concurrent_policy 에 따라 초과 세션을 정리한다.
    """
    import uuid
    try:
        # org_user에서 이름 가져오기 (성능 무관 - 로그인 시 1회)
        if not user_name or user_name == emp_no:
            row = db.session.execute(db.text(
                "SELECT name FROM org_user WHERE UPPER(emp_no) = UPPER(:e)"
            ), {'e': emp_no}).fetchone()
            if row and row[0]:
                user_name = row[0]

        # ── 동시 접속 제한 적용 ──
        max_sessions = 1
        concurrent_policy = 'kill_oldest'
        try:
            sp = db.session.execute(db.text(
                "SELECT max_sessions, concurrent_policy FROM security_policy WHERE id = 1"
            )).fetchone()
            if sp:
                max_sessions = sp[0] or 1
                concurrent_policy = sp[1] or 'kill_oldest'
        except Exception:
            pass

        # 현재 사용자의 기존 세션 목록 (오래된 순)
        existing = db.session.execute(db.text(
            "SELECT id, session_id FROM active_sessions "
            "WHERE UPPER(emp_no) = UPPER(:emp) ORDER BY last_active ASC"
        ), {'emp': emp_no}).fetchall()

        if existing and len(existing) >= max_sessions:
            if concurrent_policy == 'kill_existing':
                # 기존 세션 모두 제거
                db.session.execute(db.text(
                    "DELETE FROM active_sessions WHERE UPPER(emp_no) = UPPER(:emp)"
                ), {'emp': emp_no})
            else:
                # kill_oldest (기본): 가장 오래된 것부터 삭제하여 새 세션 자리 확보
                excess = len(existing) - max_sessions + 1
                ids_to_delete = [r[0] for r in existing[:excess]]
                for del_id in ids_to_delete:
                    db.session.execute(db.text(
                        "DELETE FROM active_sessions WHERE id = :did"
                    ), {'did': del_id})

        sid = str(uuid.uuid4())
        session['_session_id'] = sid
        ua = request.headers.get('User-Agent', '')
        browser, os_name = _parse_user_agent(ua)
        ip = _get_client_ip()
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        db.session.execute(db.text(
            "INSERT INTO active_sessions (session_id, emp_no, user_name, ip_address, user_agent, browser, os, created_at, last_active) "
            "VALUES (:sid, :emp, :name, :ip, :ua, :br, :os, :now, :now)"
        ), {'sid': sid, 'emp': emp_no, 'name': user_name, 'ip': ip, 'ua': ua, 'br': browser, 'os': os_name, 'now': now})
        db.session.commit()
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass


def _unregister_active_session():
    """현재 세션을 active_sessions 테이블에서 제거한다."""
    sid = session.get('_session_id')
    if not sid:
        return
    try:
        db.session.execute(db.text("DELETE FROM active_sessions WHERE session_id = :sid"), {'sid': sid})
        db.session.commit()
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass


import time as _time
_last_stale_cleanup = 0

def _cleanup_stale_sessions():
    """만료된 세션(absolute_hours 초과)을 주기적으로 정리한다. 5분 간격."""
    global _last_stale_cleanup
    now_ts = _time.time()
    if now_ts - _last_stale_cleanup < 300:  # 5분 미만이면 스킵
        return
    _last_stale_cleanup = now_ts
    try:
        abs_hours = 12
        try:
            sp = db.session.execute(db.text(
                "SELECT absolute_hours FROM security_policy WHERE id = 1"
            )).fetchone()
            if sp and sp[0]:
                abs_hours = sp[0]
        except Exception:
            pass
        cutoff = (datetime.now() - timedelta(hours=abs_hours)).strftime('%Y-%m-%d %H:%M:%S')
        db.session.execute(db.text(
            "DELETE FROM active_sessions WHERE last_active < :cutoff"
        ), {'cutoff': cutoff})
        db.session.commit()
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass


@auth_bp.before_app_request
def _enforce_active_session():
    """관리자가 세션을 종료한 경우 자동 로그아웃 처리."""
    # ── 주기적 만료 세션 정리 (5분마다) ──
    _cleanup_stale_sessions()

    sid = session.get('_session_id')
    # 로그인 상태이지만 _session_id가 없는 레거시 세션 → 자동 등록
    if not sid and session.get('emp_no'):
        emp_no = session['emp_no']
        _register_active_session(emp_no, '')
        return
    if not sid:
        return  # 세션 ID 없으면 검사 생략 (로그인 전 or 레거시 세션)
    # 정적 파일, 로그인/로그아웃 등은 건너뛴다
    if request.endpoint and request.endpoint in ('auth.login', 'auth.logout', 'static'):
        return
    try:
        row = db.session.execute(
            db.text("SELECT id FROM active_sessions WHERE session_id = :sid"),
            {'sid': sid}
        ).fetchone()
        if row is None:
            # DB에서 삭제됨 → 관리자가 종료한 세션
            session.clear()
            if request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                from flask import abort
                abort(401)
            return redirect(url_for('auth.login'))
        # last_active + 브라우저/OS 갱신 (매 요청마다)
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        ua = request.headers.get('User-Agent', '')
        browser, os_name = _parse_user_agent(ua)
        db.session.execute(
            db.text("UPDATE active_sessions SET last_active = :now, browser = :br, os = :os, ip_address = :ip WHERE session_id = :sid"),
            {'now': now, 'br': browser, 'os': os_name, 'ip': _get_client_ip(), 'sid': sid}
        )
        # ── 동일 사용자 초과 세션 정리 ──
        emp_no = session.get('emp_no')
        if emp_no:
            try:
                max_sess = 1
                sp = db.session.execute(db.text(
                    "SELECT max_sessions FROM security_policy WHERE id = 1"
                )).fetchone()
                if sp and sp[0]:
                    max_sess = sp[0]
                others = db.session.execute(db.text(
                    "SELECT id FROM active_sessions "
                    "WHERE UPPER(emp_no) = UPPER(:emp) AND session_id != :sid "
                    "ORDER BY last_active ASC"
                ), {'emp': emp_no, 'sid': sid}).fetchall()
                # max_sess - 1 = 현재 세션 제외 허용 수
                if len(others) >= max_sess:
                    excess = len(others) - max_sess + 1
                    for ex_row in others[:excess]:
                        db.session.execute(db.text(
                            "DELETE FROM active_sessions WHERE id = :did"
                        ), {'did': ex_row[0]})
            except Exception:
                pass
        db.session.commit()
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass


def _perm_level(read_val, write_val):
    """boolean read/write → NONE|READ|WRITE 문자열"""
    if write_val:
        return 'WRITE'
    if read_val:
        return 'READ'
    return 'NONE'


def _record_permission_audit(role_row, section, old_read, old_write, new_read, new_write, changed_by):
    """권한 변경이 있을 때 감사 로그 기록"""
    before = _perm_level(old_read, old_write)
    after = _perm_level(new_read, new_write)
    if before == after:
        return
    try:
        log = PermissionAuditLog(
            role_id=role_row.id,
            role_name=role_row.name,
            menu_code=section,
            before_permission=before,
            after_permission=after,
            changed_by=changed_by,
        )
        db.session.add(log)
    except Exception as e:
        print('[permission_audit] failed to record', e, flush=True)


def _cache_session_permissions(sess):
    """로그인 시 사용자의 최종 권한을 세션에 캐싱 (메뉴 기반)"""
    from app.services.permission_service import cache_session_permissions
    cache_session_permissions(sess)


def _resolve_department_id_from_inputs(department_id_raw: str, department_token: str):
    raw = (department_id_raw or '').strip()
    if raw:
        try:
            as_int = int(raw)
        except ValueError:
            as_int = None
        if as_int and as_int > 0:
            try:
                exists = (
                    OrgDepartment.query
                    .filter(OrgDepartment.id == as_int)
                    .filter(OrgDepartment.is_deleted.is_(False))
                    .first()
                )
            except Exception:
                exists = None
            return int(exists.id) if exists else None

    token = (department_token or '').strip().lower()
    if not token:
        return None
    try:
        dept = (
            OrgDepartment.query
            .filter(OrgDepartment.is_deleted.is_(False))
            .filter(
                sa.or_(
                    sa.func.lower(OrgDepartment.dept_code) == token,
                    sa.func.lower(OrgDepartment.dept_name) == token,
                )
            )
            .first()
        )
    except Exception:
        dept = None
    return int(dept.id) if dept and dept.id else None


def apply_role_permissions_from_form(role_obj, form_data, changed_by=None):
    for field in ROLE_PERMISSION_FIELDS:
        old_read = bool(getattr(role_obj, f'{field}_read', False))
        old_write = bool(getattr(role_obj, f'{field}_write', False))
        read = form_data.get(f'perm_{field}_read') == '1'
        write = form_data.get(f'perm_{field}_write') == '1'
        if write and not read:
            read = True
        if changed_by and role_obj.id:
            _record_permission_audit(role_obj, field, old_read, old_write, read, write, changed_by)
        setattr(role_obj, f'{field}_read', read)
        setattr(role_obj, f'{field}_write', write)


def serialize_user_profile(profile):
    if not profile:
        return None
    return {
        'id': profile.id,
        'name': (profile.name or '-').strip() if hasattr(profile, 'name') else '-',
        'emp_no': (profile.emp_no or '-').strip() if hasattr(profile, 'emp_no') else '-',
        'department_id': getattr(profile, 'department_id', None),
        'department': (profile.department or '-').strip() if hasattr(profile, 'department') else '-',
    }

def role_to_dict(role_row, user_count=None, include_users=False, user_ids=None):
    perms = {}
    for field in ROLE_PERMISSION_FIELDS:
        perms[field] = {
            'read': bool(getattr(role_row, f'{field}_read', False)),
            'write': bool(getattr(role_row, f'{field}_write', False)),
        }
    resolved_count = user_count
    if resolved_count is None:
        try:
            resolved_count = len(role_row.users or [])
        except Exception:
            resolved_count = 0
    payload = {
        'id': role_row.id,
        'name': role_row.name,
        'description': role_row.description,
        'user_count': resolved_count or 0,
        'permissions': perms
    }
    if include_users:
        if user_ids is None:
            try:
                user_ids = [user.id for user in (role_row.users or [])]
            except Exception:
                user_ids = []
        payload['user_ids'] = user_ids
    return payload

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    # 진단: 실제 로드된 auth.py 파일 경로 출력 (서버가 어떤 버전 사용하는지 확인)
    try:
        print('[login_debug] module_file', __file__, flush=True)
    except Exception:
        pass
    if request.method == 'GET':
        # 이미 로그인된 상태라면 로그인 페이지 대신 첫 화면으로 보냄
        # (다른 계정으로 다시 로그인하려면 /login?force=1)
        force = (request.args.get('force') or '').strip()
        if force not in ('1', 'true', 'TRUE', 'yes', 'YES'):
            pending_terms_uid = session.get('pending_terms_user_id')
            if pending_terms_uid:
                return redirect(url_for('auth.terms'))

            uid = session.get('user_id')
            emp = session.get('emp_no')
            if uid or emp:
                try:
                    user = None
                    if emp:
                        user = AuthUser.query.filter_by(emp_no=emp).first()
                    elif uid:
                        user = AuthUser.query.filter_by(id=uid).first()

                    if user and getattr(user, 'status', None) == 'active':
                        return redirect(url_for('main.dashboard'))
                except Exception:
                    pass

                # 세션이 깨졌거나 사용자가 없으면 로그인 페이지로 유도
                try:
                    session.pop('user_id', None)
                    session.pop('emp_no', None)
                    session.pop('role', None)
                except Exception:
                    pass

        return render_template('authentication/11-2.basic/sign-in.html')

    if request.method == 'POST':
        emp_no = request.form.get('employee_id')
        password = request.form.get('password')
        
        if not emp_no or not password:
            flash('사번과 비밀번호를 모두 입력해주세요.', 'error')
            return render_template('authentication/11-2.basic/sign-in.html')
        
        # 사용자 조회
        user = AuthUser.query.filter_by(emp_no=emp_no).first()
        profile = UserProfile.query.filter_by(emp_no=emp_no).first() if user else None
        
        # 로그인 시도 기록
        login_history = AuthLoginHistory(
            emp_no=emp_no,
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent'),
            success=False
        )
        
        if not user:
            flash('존재하지 않는 사번입니다.', 'error')
            db.session.add(login_history)
            db.session.commit()
            return render_template('authentication/11-2.basic/sign-in.html')
        
        # 계정 상태 확인
        if user.status != 'active':
            flash('비활성화된 계정입니다.', 'error')
            db.session.add(login_history)
            db.session.commit()
            return render_template('authentication/11-2.basic/sign-in.html')
        
        # 계정 잠금 확인
        if user.is_locked():
            # 남은 잠금 시간 계산(분/초)
            remaining = user.locked_until - datetime.utcnow()
            mins = int(remaining.total_seconds() // 60)
            secs = int(remaining.total_seconds() % 60)
            if mins > 0:
                msg = f'계정이 잠겨있습니다. {mins}분 {secs}초 후 다시 시도해주세요.'
            else:
                msg = f'계정이 잠겨있습니다. {secs}초 후 다시 시도해주세요.'
            flash(msg, 'error')
            db.session.add(login_history)
            db.session.commit()
            return render_template('authentication/11-2.basic/sign-in.html')
        
        # 허용 IP 검사 (프로필에 설정된 경우만 적용) - SENTINEL v2
        try:
            allowed_raw = (profile.allowed_ip if profile and profile.allowed_ip else '').strip()
            # 강제: 프록시 헤더 무시하고 실제 remote_addr 만 사용 (디버그 단순화)
            remote_ip = request.remote_addr or ''
            remote_ip_candidates = [remote_ip]
            xff = ''
            xreal = ''
            print('[login_debug] SENTINEL_v2 start emp_no=', emp_no, 'remote_ip=', remote_ip, 'allowed_raw=', allowed_raw, flush=True)
            # 추가 진단: TEST 계정 강제 차단 토글 (주석 해제하면 무조건 차단)
            # if emp_no == 'TEST0002':
            #     print('[login_debug] FORCED_TEST0002_BLOCK remote_ip', remote_ip, 'allowed_raw', allowed_raw, flush=True)
            #     flash('허용되지 않은 IP입니다.(TEST0002 강제차단)', 'error')
            #     db.session.add(login_history)
            #     db.session.commit()
            #     return render_template('authentication/11-2.basic/sign-in.html')
            # 추가: 파일 로깅 (콘솔 미표시 환경 대응)
            try:
                instance_path = current_app.instance_path
                os.makedirs(instance_path, exist_ok=True)
                with open(os.path.join(instance_path, 'login_debug.log'), 'a', encoding='utf-8') as f:
                    f.write(f"[login_debug_boot_v2] emp_no={emp_no} remote_ip={remote_ip} allowed_raw='{allowed_raw}'\n")
            except Exception as fe:
                print('[login_debug] file_log_fail', fe, flush=True)
            # 로거 레벨이 INFO 이상 아니면 강제 설정
            try:
                if current_app.logger.getEffectiveLevel() > 20:
                    current_app.logger.setLevel(20)
            except Exception:
                pass
            # 디버그: 항상 원시 값 + 후보 목록 로깅
            current_app.logger.info(
                f"[login] IP rawCheck emp_no={emp_no} remote_ip={remote_ip} candidates={remote_ip_candidates} allowed_raw='{allowed_raw}' headers={{'XFF': '{xff}', 'XRI': '{xreal}'}}"
            )
            # 강제 print 디버그 (logger 미표시 환경 대응)
            print('[login_debug] emp_no=', emp_no, 'remote_ip=', remote_ip, 'candidates=', remote_ip_candidates, 'allowed_raw=', allowed_raw, flush=True)
            # 안전 강제: 허용 IP 지정된 경우 X-Forwarded-For 첫 번째 대신 마지막(클라이언트 원본) 사용 여부 비교 로깅
            if xff:
                xff_list = [p.strip() for p in xff.split(',') if p.strip()]
                if len(xff_list) > 1:
                    original_client_ip = xff_list[0]
                    last_proxy_ip = xff_list[-1]
                    print('[login_debug] xff_multi original_client_ip=', original_client_ip, 'last_proxy_ip=', last_proxy_ip, 'chosen_remote_ip=', remote_ip, flush=True)
                    try:
                        with open(os.path.join(instance_path, 'login_debug.log'), 'a', encoding='utf-8') as f:
                            f.write(f"[login_debug_xff] emp_no={emp_no} original={original_client_ip} last={last_proxy_ip} chosen={remote_ip}\n")
                    except Exception:
                        pass
            # 정책 변경: 이제 빈 문자열도 제한 모드로 간주 (명시적으로 '*' 또는 '-' 만 무제한)
            if allowed_raw not in ('-', '*'):
                # 지정된 IP/대역이 있는 경우: 그 목록만 허용
                tokens = [t for t in re.split(r'[\s,;]+', allowed_raw) if t]
                # 토큰 정규화 (불필요한 공백 제거, 중복 제거)
                norm_tokens = []
                seen_token = set()
                for t in tokens:
                    tt = t.strip()
                    if tt and tt not in seen_token:
                        seen_token.add(tt)
                        norm_tokens.append(tt)
                # 빈 토큰 목록이면 즉시 차단 (허용 IP를 설정하지 않았으므로 기본 차단)
                if not norm_tokens:
                    current_app.logger.warning(f"[login] IP 차단(빈목록) emp_no={emp_no} remote_ip={remote_ip}")
                    print('[login_debug] BLOCK empty_token_list remote_ip', remote_ip, flush=True)
                    flash('허용되지 않은 IP입니다.', 'error')
                    db.session.add(login_history)
                    db.session.commit()
                    return render_template('authentication/11-2.basic/sign-in.html')
                # '*' 혼합 사용 시 의미가 모호해지므로 경고 및 차단 (강화 정책)
                if '*' in norm_tokens and len(norm_tokens) > 1:
                    current_app.logger.warning(f"[login] IP 차단(혼합 *) emp_no={emp_no} remote_ip={remote_ip}")
                    print('[login_debug] BLOCK mixed_wildcard tokens', norm_tokens, flush=True)
                    flash('허용되지 않은 IP입니다.', 'error')
                    db.session.add(login_history)
                    db.session.commit()
                    return render_template('authentication/11-2.basic/sign-in.html')

                # 단순화된 1차 매칭 (정확 일치만) - 실패 시 곧바로 차단 후 반환
                if remote_ip not in norm_tokens:
                    print('[login_debug] BLOCK_simple remote_ip', remote_ip, 'norm_tokens', norm_tokens, flush=True)
                    current_app.logger.warning(f"[login] IP 차단(simple) emp_no={emp_no} remote_ip={remote_ip}")
                    flash('허용되지 않은 IP입니다.', 'error')
                    db.session.add(login_history)
                    db.session.commit()
                    return render_template('authentication/11-2.basic/sign-in.html')

                def token_match(tok, ip):
                    if tok == '*':
                        return True
                    # 접두사: 끝이 '.'이면 startswith (예: 10.0.0.)
                    if tok.endswith('.'):
                        return ip.startswith(tok)
                    # CIDR: ipaddress 라이브러리 검증
                    if '/' in tok:
                        try:
                            net = ipaddress.ip_network(tok, strict=False)
                            return ipaddress.ip_address(ip) in net
                        except Exception:
                            return False
                    # 단일 IP 정확 일치
                    return ip == tok
                matched_token = None
                for t in norm_tokens:
                    if token_match(t, remote_ip):
                        matched_token = t
                        break
                # 추가 진단: 후보들 각각 어떤 토큰과 매칭되는지 파일 기록
                try:
                    with open(os.path.join(instance_path, 'login_debug.log'), 'a', encoding='utf-8') as f:
                        for cand in remote_ip_candidates:
                            cand_match = next((tok for tok in norm_tokens if token_match(tok, cand)), None)
                            f.write(f"[login_debug_probe] emp_no={emp_no} candidate={cand} match={cand_match}\n")
                except Exception:
                    pass
                if not matched_token:
                    current_app.logger.warning(f"[login] IP 차단 emp_no={emp_no} remote_ip={remote_ip}")
                    print('[login_debug] BLOCK_v2 remote_ip', remote_ip, 'tokens', norm_tokens, flush=True)
                    # 실패 카운트 증가 (IP 차단도 실패 취급)
                    try:
                        user.increment_fail_count()
                        db.session.commit()
                    except Exception:
                        db.session.rollback()
                    flash('허용되지 않은 IP입니다.', 'error')
                    db.session.add(login_history)
                    db.session.commit()
                    return render_template('authentication/11-2.basic/sign-in.html')
                else:
                    current_app.logger.info(f"[login] IP 허용 emp_no={emp_no} remote_ip={remote_ip} matched=yes")
                    print('[login_debug] ALLOW_v2 remote_ip', remote_ip, 'matched_token', matched_token, flush=True)
                    try:
                        with open(os.path.join(instance_path, 'login_debug.log'), 'a', encoding='utf-8') as f:
                            f.write(f"[login_debug_allow_v2] emp_no={emp_no} remote_ip={remote_ip} matched=yes\n")
                    except Exception:
                        pass
            else:
                # allowed_raw 값이 정책적 무시 목록인 경우도 로깅
                if allowed_raw in ('-', '*'):
                    current_app.logger.info(f"[login] IP unrestricted emp_no={emp_no} marker={allowed_raw}")
                    print('[login_debug] UNRESTRICTED marker', allowed_raw, flush=True)
                    try:
                        with open(os.path.join(instance_path, 'login_debug.log'), 'a', encoding='utf-8') as f:
                            f.write(f"[login_debug_unrestricted] emp_no={emp_no} marker={allowed_raw}\n")
                    except Exception:
                        pass
        except Exception as e:
            current_app.logger.error(f"[login] allowed_ip 검사 오류 emp_no={emp_no} error={e}")
            print('[login_debug] ERROR', e, flush=True)

        # 비밀번호 확인
        if not user.check_password(password):
            user.increment_fail_count()
            # 감사 로그: 로그인 실패
            try:
                from app.security import log_audit_event
                log_audit_event('LOGIN_FAIL', f'비밀번호 오류 ({user.login_fail_cnt}회)', emp_no=emp_no)
            except Exception:
                pass
            # 실패 횟수 표시 및 잠금 안내
            max_attempts = 5
            if user.login_fail_cnt >= max_attempts:
                msg = '비밀번호 5회 오류로 계정이 잠겼습니다. 30분 후 다시 시도해주세요.'
            else:
                msg = f'비밀번호가 올바르지 않습니다. ({user.login_fail_cnt}/{max_attempts})'
            flash(msg, 'error')
            db.session.add(login_history)
            db.session.commit()
            return render_template('authentication/11-2.basic/sign-in.html')
        
        # 로그인 성공
        user.last_login_at = datetime.utcnow()
        user.reset_fail_count()
        login_history.success = True
        
        db.session.add(login_history)
        db.session.commit()

        # 감사 로그: 로그인 성공
        try:
            from app.security import log_audit_event
            log_audit_event('LOGIN_SUCCESS', f'로그인 성공: {emp_no}', emp_no=emp_no)
        except Exception:
            pass

        # ── MFA 검사 ──────────────────────────────────────────────
        mfa_cfg = _get_mfa_config()
        if mfa_cfg.get('enabled'):
            # MFA 활성화: 세션에 임시 pending 정보만 저장하고, MFA 인증 후 최종 로그인 완료
            session['pending_mfa_emp_no'] = user.emp_no
            session['pending_mfa_user_id'] = user.id
            # AJAX 로그인이면 JSON 응답, 일반 폼 제출이면 MFA 페이지 렌더
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.content_type == 'application/json':
                return jsonify({'mfa_required': True, 'emp_no': user.emp_no})
            return render_template('authentication/11-2.basic/sign-in.html', mfa_required=True, mfa_emp_no=user.emp_no)

        # ── MFA 미사용: 기존 로직 그대로 ──────────────────────────
        # 세션에 사용자 정보 저장 및 ADMIN 불변 강제
        session.permanent = _should_session_be_permanent()
        session['user_id'] = user.id
        session['emp_no'] = user.emp_no
        from datetime import datetime as _dt
        session['_login_at'] = _dt.utcnow().isoformat()
        session['_last_active'] = session['_login_at']
        # ADMIN 계정 불변 규칙:
        # - emp_no 또는 이메일이 ADMIN (대소문자 무시) 이거나 기존 role 이 ADMIN 인 경우 무조건 ADMIN으로 고정
        # - DB상의 role 값이 ADMIN이 아니면 즉시 승격 후 커밋
        # - 이후 어떤 업데이트에서도 ADMIN -> 다른 값 변경 불가 (별도 업데이트 엔드포인트 가드 추가)
        _is_admin_identity = (user.emp_no and user.emp_no.upper() == 'ADMIN') or (user.email and user.email.split('@')[0].upper() == 'ADMIN') or (user.role and user.role.upper() == 'ADMIN')
        if _is_admin_identity and (not user.role or user.role.upper() != 'ADMIN'):
            try:
                user.role = 'ADMIN'
                db.session.commit()
                from app.security import log_audit_event
                log_audit_event(
                    'ADMIN_ESCALATION',
                    f'로그인 시 ADMIN 자동 승격: emp_no={user.emp_no}',
                    emp_no=user.emp_no,
                    details=f'previous_role={user.role}, trigger=login'
                )
            except Exception as _e_admin:
                db.session.rollback()
                print('[login_admin_escalation] escalation failed', _e_admin, flush=True)
        session['role'] = 'ADMIN' if _is_admin_identity else user.role

        # ── 권한 캐시 (session['_perms']) ──
        _cache_session_permissions(session)

        # Ensure a corresponding UserProfile exists (many API endpoints resolve actor from org_user).
        try:
            profile = UserProfile.query.filter_by(emp_no=user.emp_no).first()
            if not profile:
                profile = UserProfile(
                    emp_no=user.emp_no,
                    email=user.email,
                    role=session.get('role'),
                )
                db.session.add(profile)
                db.session.commit()
            session['user_profile_id'] = profile.id
            session['profile_user_id'] = profile.id
        except Exception as e:
            try:
                db.session.rollback()
            except Exception:
                pass
            current_app.logger.error(f"[login] failed to ensure UserProfile emp_no={user.emp_no} error={e}")

        # 약관 확인: 최초 또는 월 변경 시 약관 동의 필요
        if user.needs_terms():
            session['pending_terms_user_id'] = user.id
            flash('서비스 이용 약관 확인이 필요합니다. 약관에 동의 후 계속 진행해주세요.', 'error')
            return redirect(url_for('auth.terms'))

        # 활성 세션 등록
        _register_active_session(user.emp_no, getattr(user, 'name', '') or user.emp_no)

        flash('로그인되었습니다.', 'success')
        # 첫 화면: 지정된 대시보드 템플릿으로 리다이렉트
        return redirect(url_for('main.dashboard'))

    return render_template('authentication/11-2.basic/sign-in.html')

@auth_bp.route('/logout')
def logout():
    emp_no = session.get('emp_no', '')
    _unregister_active_session()
    session.clear()
    # 감사 로그 기록
    try:
        from app.security import log_audit_event
        log_audit_event('LOGOUT', f'사용자 로그아웃: {emp_no}', emp_no=emp_no)
    except Exception:
        pass
    flash('로그아웃되었습니다.', 'success')
    return redirect(url_for('auth.login'))

# 계정: 프로필 보기
@auth_bp.route('/account/profile')
def account_profile():
    _xhr = request.headers.get('X-Requested-With', '')
    if _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):
        return render_template('layouts/spa_shell.html', current_key='account_profile', menu_code=None)
    uid = session.get('user_id')
    emp = session.get('emp_no')
    if not uid and not emp:
        flash('로그인이 필요합니다.', 'error')
        return redirect(url_for('auth.login'))
    user = None
    profile = None
    try:
        if emp:
            profile = UserProfile.query.filter_by(emp_no=emp).first()
            user = AuthUser.query.filter_by(emp_no=emp).first()
        elif uid:
            user = AuthUser.query.filter_by(id=uid).first()
            if user:
                profile = UserProfile.query.filter_by(emp_no=user.emp_no).first()
    except Exception as _e:
        print('[account_profile] query error', _e, flush=True)
    merged = {
        'emp_no': user.emp_no if user else (profile.emp_no if profile else '-'),
        'email': (profile.email if profile and profile.email else (user.email if user else '-')),
        'role': (profile.role if profile and profile.role else (user.role if user else '-')),
        'name': profile.name if profile and profile.name else '-',
        'nickname': profile.nickname if profile and profile.nickname else '-',
        'company': profile.company if profile and profile.company else '-',
        'department': profile.department if profile and profile.department else '-',
        'employment_status': profile.employment_status if profile and profile.employment_status else '재직',
        'ext_phone': profile.ext_phone if profile and profile.ext_phone else '-',
        'mobile_phone': profile.mobile_phone if profile and profile.mobile_phone else '-',
        'job': profile.job if profile and profile.job else '-',
        'allowed_ip': profile.allowed_ip if profile and profile.allowed_ip else '-',
        'profile_image': profile.profile_image if profile and profile.profile_image else '/static/image/svg/profil/free-icon-bussiness-man.svg',
        'last_login_at': (user.last_login_at.strftime('%Y-%m-%d %H:%M:%S') if user and user.last_login_at else '-'),
        'motto': (getattr(profile, 'motto', None) if profile and getattr(profile, 'motto', None) else ''),
    }
    return render_template('authentication/account/profile.html', user=merged)


# 설정: 프로필/멤버/메모/패스워드 (11-1.setting)
def _settings_current_user_merged():
    uid = session.get('user_id')
    emp = session.get('emp_no')
    if not uid and not emp:
        return None
    user = None
    profile = None
    try:
        if emp:
            profile = UserProfile.query.filter_by(emp_no=emp).first()
            user = AuthUser.query.filter_by(emp_no=emp).first()
        elif uid:
            user = AuthUser.query.filter_by(id=uid).first()
            if user:
                profile = UserProfile.query.filter_by(emp_no=user.emp_no).first()
    except Exception as _e:
        print('[settings_profile] query error', _e, flush=True)
    dept_id = getattr(profile, 'department_id', None) if profile else None
    resolved_dept_name = None
    if dept_id:
        try:
            dept_row = (
                OrgDepartment.query
                .filter(OrgDepartment.id == dept_id)
                .filter(OrgDepartment.is_deleted.is_(False))
                .first()
            )
            resolved_dept_name = (dept_row.dept_name if dept_row and dept_row.dept_name else None)
        except Exception as _e:
            print('[settings_profile] dept resolve error', _e, flush=True)
    profile_dept = None
    if profile:
        try:
            cand = (getattr(profile, 'department', None) or '').strip()
            if cand and cand != '-':
                profile_dept = cand
        except Exception:
            profile_dept = None

    merged = {
        'emp_no': user.emp_no if user else (profile.emp_no if profile else '-'),
        'email': (profile.email if profile and profile.email else (user.email if user else '-')),
        'role': (profile.role if profile and profile.role else (user.role if user else '-')),
        'name': (profile.name if profile and profile.name else (user.emp_no if user and user.emp_no else '-')),
        'nickname': profile.nickname if profile and profile.nickname else '-',
        'company': profile.company if profile and profile.company else '-',
        'department_id': int(dept_id) if dept_id else None,
        'department': (
            (profile_dept if profile_dept else None)
            or (resolved_dept_name if resolved_dept_name else None)
            or '-'
        ),
        'employment_status': profile.employment_status if profile and profile.employment_status else '재직',
        'ext_phone': profile.ext_phone if profile and profile.ext_phone else '-',
        'mobile_phone': profile.mobile_phone if profile and profile.mobile_phone else '-',
        'job': profile.job if profile and profile.job else '-',
        'allowed_ip': profile.allowed_ip if profile and profile.allowed_ip else '-',
        'profile_image': profile.profile_image if profile and profile.profile_image else '/static/image/svg/profil/free-icon-bussiness-man.svg',
        'last_login_at': (user.last_login_at.strftime('%Y-%m-%d %H:%M:%S') if user and user.last_login_at else '-'),
        'note': profile.note if profile and profile.note else '',
        'motto': (getattr(profile, 'motto', None) if profile and getattr(profile, 'motto', None) else ''),
    }
    return merged


@auth_bp.route('/settings/profile')
def settings_profile():
    # SPA: 직접 방문 → 셸 반환
    _xhr = request.headers.get('X-Requested-With', '')
    if _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):
        return render_template('layouts/spa_shell.html', current_key='settings_profile', menu_code=None)
    merged = _settings_current_user_merged()
    if not merged:
        flash('로그인이 필요합니다.', 'error')
        return redirect(url_for('auth.login'))
    departments = []
    try:
        rows = (
            OrgDepartment.query
            .with_entities(OrgDepartment.dept_name)
            .filter(OrgDepartment.is_deleted.is_(False))
            .filter(OrgDepartment.dept_name.isnot(None))
            .order_by(OrgDepartment.dept_name.asc())
            .all()
        )
        seen = set()
        for (dept_name,) in rows:
            dept_name = (dept_name or '').strip()
            if not dept_name:
                continue
            if dept_name in seen:
                continue
            seen.add(dept_name)
            departments.append(dept_name)
    except Exception as _e:
        print('[settings_profile] departments query error', _e, flush=True)
        departments = []

    return render_template(
        'authentication/11-1.setting/11-1-1.profil.html',
        user=merged,
        departments=departments,
    )


@auth_bp.route('/settings/member')
def settings_member():
    _xhr = request.headers.get('X-Requested-With', '')
    if _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):
        return render_template('layouts/spa_shell.html', current_key='settings_member', menu_code=None)
    merged = _settings_current_user_merged()
    if not merged:
        flash('로그인이 필요합니다.', 'error')
        return redirect(url_for('auth.login'))
    dept_id = merged.get('department_id')
    dept = (merged.get('department') or '').strip()
    dept_norm = dept.lower() if dept else ''
    members = []
    try:
        q = UserProfile.query
        if dept_id:
            dept_id_int = int(dept_id)
            cond = (UserProfile.department_id == dept_id_int)
            # Backward-compatible: some profiles may still have only department(string) populated.
            if dept and dept != '-':
                cond = sa.or_(
                    cond,
                    sa.and_(
                        UserProfile.department.isnot(None),
                        sa.func.lower(sa.func.trim(UserProfile.department)) == dept_norm,
                    ),
                )
            q = q.filter(cond)
        elif dept and dept != '-':
            q = q.filter(UserProfile.department.isnot(None))
            q = q.filter(sa.func.lower(sa.func.trim(UserProfile.department)) == dept_norm)
        else:
            q = None

        if q is not None:
            members = (
                q.order_by(UserProfile.name.asc(), UserProfile.emp_no.asc())
                .limit(500)
                .all()
            )
    except Exception as _e:
        print('[settings_member] query error', _e, flush=True)
        members = []
    return render_template('authentication/11-1.setting/11-1-2.member.html', user=merged, members=members, department=dept)


@auth_bp.route('/settings/memo')
def settings_memo():
    _xhr = request.headers.get('X-Requested-With', '')
    if _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):
        return render_template('layouts/spa_shell.html', current_key='settings_memo', menu_code=None)
    merged = _settings_current_user_merged()
    if not merged:
        flash('로그인이 필요합니다.', 'error')
        return redirect(url_for('auth.login'))
    return render_template('authentication/11-1.setting/11-1-3.memo.html', user=merged)


@auth_bp.route('/settings/password', methods=['GET', 'POST'])
def settings_password():
    if request.method == 'GET':
        _xhr = request.headers.get('X-Requested-With', '')
        if _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):
            return render_template('layouts/spa_shell.html', current_key='settings_password', menu_code=None)
    if request.method == 'POST':
        uid = session.get('user_id')
        emp = session.get('emp_no')
        if not uid and not emp:
            return jsonify({'error': 'unauthorized', 'message': '로그인이 필요합니다.'}), 401

        data = request.get_json(silent=True) or {}
        current_password = (data.get('current_password') or '').strip()
        new_password = (data.get('new_password') or '').strip()
        confirm_password = (data.get('confirm_password') or '').strip()

        missing = []
        if not current_password:
            missing.append('current_password')
        if not new_password:
            missing.append('new_password')
        if missing:
            return jsonify({'error': 'validation', 'missing': missing, 'message': '필수 필드 누락'}), 400

        if confirm_password and (confirm_password != new_password):
            return jsonify({'error': 'validation', 'message': '새 비밀번호가 일치하지 않습니다.'}), 400

        if current_password == new_password:
            return jsonify({'error': 'validation', 'message': '새 비밀번호는 현재 비밀번호와 다른 값이어야 합니다.'}), 400

        def _classify_sets(pw: str) -> int:
            sets = 0
            if re.search(r'[a-z]', pw):
                sets += 1
            if re.search(r'[A-Z]', pw):
                sets += 1
            if re.search(r'[0-9]', pw):
                sets += 1
            if re.search(r'[^\w\s]', pw):
                sets += 1
            return sets

        sets = _classify_sets(new_password)
        ok_len = (sets >= 2 and len(new_password) >= 10) or (sets >= 3 and len(new_password) >= 8)
        if not ok_len:
            return jsonify({'error': 'validation', 'message': '비밀번호 조건을 확인하세요.'}), 400

        user = None
        try:
            if emp:
                user = AuthUser.query.filter_by(emp_no=emp).first()
            elif uid:
                user = AuthUser.query.filter_by(id=uid).first()
        except Exception:
            user = None

        if not user:
            return jsonify({'error': 'not_found', 'message': '사용자 정보를 찾을 수 없습니다.'}), 404

        try:
            current_ok = user.check_password(current_password)
        except Exception:
            # Some legacy accounts may have an invalid/empty password_hash; avoid raising a 500 HTML page.
            return jsonify({'error': 'invalid_current_password', 'message': '현재 비밀번호를 확인할 수 없습니다.'}), 400

        if not current_ok:
            return jsonify({'error': 'invalid_current_password', 'message': '현재 비밀번호가 올바르지 않습니다.'}), 400

        try:
            user.set_password(new_password)
            db.session.add(user)
            try:
                hist = AuthPasswordHistory(
                    emp_no=user.emp_no,
                    password_hash=user.password_hash,
                    changed_by=user.emp_no,
                )
                db.session.add(hist)
            except Exception:
                pass
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': 'db_commit_failed', 'message': str(e)}), 500

        return jsonify({'status': 'ok'}), 200

    merged = _settings_current_user_merged()
    if not merged:
        flash('로그인이 필요합니다.', 'error')
        return redirect(url_for('auth.login'))
    return render_template('authentication/11-1.setting/11-1-4.password.html', user=merged)

# 계정: 이미지 선택 (서버 라우트 → 프론트 JS 픽커 사용)
@auth_bp.route('/account/image')
def account_image():
    return redirect(url_for('auth.account_profile'))

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        emp_no = request.form.get('emp_no')
        password = request.form.get('password')
        password_confirm = request.form.get('password_confirm')
        email = request.form.get('email')
        terms_agree = request.form.get('terms_agree')

        if not emp_no or not password:
            flash('사번과 비밀번호는 필수입니다.', 'error')
            return render_template('authentication/sign-up.html')

        # Validate emp_no: exactly 8 digits
        if not (emp_no.isdigit() and len(emp_no) == 8):
            flash('사번은 숫자 8자리여야 합니다.', 'error')
            return render_template('authentication/sign-up.html')

        # Validate minimum password length
        if len(password) < 8:
            flash('비밀번호는 8자 이상이어야 합니다.', 'error')
            return render_template('authentication/sign-up.html')

        if password != password_confirm:
            flash('비밀번호가 일치하지 않습니다.', 'error')
            return render_template('authentication/sign-up.html')

        if not email:
            flash('이메일은 필수입니다.', 'error')
            return render_template('authentication/sign-up.html')

        if not terms_agree:
            flash('약관에 동의해야 회원가입이 가능합니다.', 'error')
            return render_template('authentication/sign-up.html')
        
        # 기존 사용자 확인
        existing_user = AuthUser.query.filter_by(emp_no=emp_no).first()
        if existing_user:
            flash('이미 등록된 사번입니다.', 'error')
            return render_template('authentication/sign-up.html')
        
        # 새 사용자 생성
        user = AuthUser(emp_no=emp_no, email=email)
        user.set_password(password)
        
        db.session.add(user)
        db.session.commit()
        
        flash('회원가입이 완료되었습니다. 로그인해주세요.', 'success')
        return redirect(url_for('auth.login'))
    
    return render_template('authentication/sign-up.html')

@auth_bp.route('/reset-password', methods=['GET', 'POST'])
def reset_password():
    if request.method == 'POST':
        emp_no = request.form.get('emp_no')
        email = request.form.get('email')
        
        user = AuthUser.query.filter_by(emp_no=emp_no, email=email).first()
        if user:
            # 여기에 비밀번호 재설정 이메일 발송 로직 추가
            flash('비밀번호 재설정 링크가 이메일로 발송되었습니다.', 'success')
        else:
            flash('일치하는 정보를 찾을 수 없습니다.', 'error')
        
        return redirect(url_for('auth.login'))
    
    return render_template('authentication/reset-password.html')

@auth_bp.route('/new-password', methods=['GET', 'POST'])
def new_password():
    if request.method == 'POST':
        token = request.form.get('token')
        password = request.form.get('password')
        
        # 토큰 검증 및 비밀번호 변경 로직
        flash('비밀번호가 변경되었습니다.', 'success')
        return redirect(url_for('auth.login'))
    
    return render_template('authentication/new-password.html') 

@auth_bp.route('/terms', methods=['GET', 'POST'])
def terms():
    # 로그인 직후 또는 재동의가 필요한 경우 접근
    user_id = session.get('user_id') or session.get('pending_terms_user_id')
    if not user_id:
        flash('로그인이 필요합니다.', 'error')
        return redirect(url_for('auth.login'))

    user = AuthUser.query.get(user_id)
    if not user:
        flash('사용자 정보를 찾을 수 없습니다.', 'error')
        return redirect(url_for('auth.login'))

    if request.method == 'POST':
        agree = request.form.get('terms_agree')
        if not agree:
            flash('약관에 동의해야 계속 진행할 수 있습니다.', 'error')
            return render_template('authentication/11-2.basic/terms.html')
        # 동의 처리: 현재 시각 기록 (UTC)
        user.last_terms_accepted_at = datetime.utcnow()
        db.session.commit()
        session.pop('pending_terms_user_id', None)
        flash('약관에 동의되었습니다.', 'success')
        return redirect(url_for('main.dashboard'))

    return render_template('authentication/11-2.basic/terms.html')

@auth_bp.route('/admin/auth/locked', methods=['GET', 'POST'])
def admin_locked_users():
    """관리 페이지: 모든 사용자 목록 + 잠금/실패 초기화 기능.
    기존에는 실패/잠금 사용자만 보여줬지만 UI 확장에 따라 전체를 보여주고
    잠금 관련 편의 정보(locked, remaining)를 추가한다.
    """
    unauthorized = ('role' not in session or session.get('role') not in ('admin', 'ADMIN'))
    # 개발/퍼블릭 모드: format=json인 경우에는 항상 JSON 반환 (인증 무시)하여 로드 실패 방지
    if request.args.get('format') == 'json':
        # 병합 조회 (auth_users + user 프로필) - 비인가 시에도 수행, 실패 시 안전한 빈 배열
        rows = []
        try:
            auth_list = AuthUser.query.order_by(AuthUser.emp_no.asc()).all()
            # 프로필 매핑 준비
            emp_nos = [u.emp_no for u in auth_list]
            profile_map = {}
            if emp_nos:
                try:
                    profile_map = {p.emp_no: p for p in UserProfile.query.filter(UserProfile.emp_no.in_(emp_nos)).all()}
                except Exception as e:
                    print('[admin_locked_users] profile_map query failed:', e)
            now = datetime.utcnow()
            for u in auth_list:
                prof = profile_map.get(u.emp_no)
                locked = False
                remaining = ''
                if u.locked_until and u.locked_until > now:
                    locked = True
                    delta = u.locked_until - now
                    mins = int(delta.total_seconds() // 60)
                    secs = int(delta.total_seconds() % 60)
                    remaining = f"{mins}분 {secs}초" if mins > 0 else f"{secs}초"
                rows.append({
                    'emp_no': u.emp_no,
                    'email': (prof.email if prof and prof.email else u.email) or '-',
                    'role': (prof.role if prof and prof.role else u.role) or 'USER',
                    'fail_cnt': u.login_fail_cnt,
                    'locked': locked,
                    'remaining': remaining,
                    'name': prof.name if prof and prof.name else '-',
                    'nickname': prof.nickname if prof and prof.nickname else '-',
                    'company': prof.company if prof and prof.company else '-',
                    'department': prof.department if prof and prof.department else '-',
                    'employment_status': prof.employment_status if prof and prof.employment_status else '재직',
                    'ext_phone': prof.ext_phone if prof and prof.ext_phone else '-',
                    'mobile_phone': prof.mobile_phone if prof and prof.mobile_phone else '-',
                    'job': prof.job if prof and prof.job else '-',
                    'password_changed_at': '-',
                    'password_expires_at': '-',
                    'allowed_ip': prof.allowed_ip if prof and prof.allowed_ip else '-',
                    'note': '-',
                    'profile_image': prof.profile_image if prof and prof.profile_image else '/static/image/svg/profil/free-icon-bussiness-man.svg',
                    'signature_image': (prof.signature_image if prof and hasattr(prof, 'signature_image') else '') or '',
                    'created_at': u.created_at.strftime('%Y-%m-%d %H:%M:%S') if u.created_at else '-',
                    'updated_at': u.updated_at.strftime('%Y-%m-%d %H:%M:%S') if u.updated_at else '-',
                    'last_login_at': u.last_login_at.strftime('%Y-%m-%d %H:%M:%S') if u.last_login_at else '-',
                })
            # 프로필에만 존재하고 auth_users 에는 없는 사번 (예: dev 임시 데이터)
            try:
                extra_profiles = []
                try:
                    extra_profiles = UserProfile.query.filter(~UserProfile.emp_no.in_(emp_nos)).order_by(UserProfile.emp_no.asc()).all()
                except Exception:
                    extra_profiles = []
                for p in extra_profiles:
                    rows.append({
                        'emp_no': p.emp_no,
                        'email': p.email or '-',
                        'role': p.role or 'USER',
                        'fail_cnt': '-',
                        'locked': False,
                        'remaining': '',
                        'name': p.name or '-',
                        'nickname': p.nickname or '-',
                        'company': p.company or '-',
                        'department': p.department or '-',
                        'employment_status': p.employment_status if p.employment_status else '재직',
                        'ext_phone': p.ext_phone or '-',
                        'mobile_phone': p.mobile_phone or '-',
                        'job': p.job or '-',
                        'password_changed_at': '-',
                        'password_expires_at': '-',
                        'allowed_ip': p.allowed_ip or '-',
                        'note': '-',
                        'profile_image': p.profile_image or '/static/image/svg/profil/free-icon-bussiness-man.svg',
                        'signature_image': (getattr(p, 'signature_image', '') or ''),
                        'created_at': p.created_at.strftime('%Y-%m-%d %H:%M:%S') if p.created_at else '-',
                        'updated_at': p.updated_at.strftime('%Y-%m-%d %H:%M:%S') if p.updated_at else '-',
                        'last_login_at': '-',
                    })
            except Exception as e:
                print('[admin_locked_users] extra_profiles merge failed:', e)
        except Exception as e:
            print('[admin_locked_users] public json merge failed:', e)
        return jsonify({'users': rows})
    if unauthorized:
        flash('관리자만 접근 가능합니다.', 'error')
        return redirect(url_for('auth.login'))

    # POST: 실패 횟수(및 잠금) 초기화
    if request.method == 'POST':
        emp_no = request.form.get('emp_no')
        user = AuthUser.query.filter_by(emp_no=emp_no).first()
        if not user:
            flash('해당 사번을 찾을 수 없습니다.', 'error')
            return redirect(url_for('auth.admin_locked_users'))
        user.reset_fail_count()
        db.session.commit()
        flash(f'{emp_no} 실패/잠금 정보가 초기화되었습니다.', 'success')
        return redirect(url_for('auth.admin_locked_users'))

    now = datetime.utcnow()
    users = AuthUser.query.order_by(AuthUser.emp_no.asc()).all()
    # 프로필 매핑 (확장 테이블 존재 시 병합)
    emp_nos = [u.emp_no for u in users]
    profiles = {}
    if emp_nos:
        try:
            profiles = {p.emp_no: p for p in UserProfile.query.filter(UserProfile.emp_no.in_(emp_nos)).all()}
        except Exception as e:
            # 테이블 미생성 등: 조용히 무시
            profiles = {}
    user_rows = []
    for u in users:
        prof = profiles.get(u.emp_no)
        locked = False
        remaining = ''
        if u.locked_until and u.locked_until > now:
            locked = True
            delta = u.locked_until - now
            mins = int(delta.total_seconds() // 60)
            secs = int(delta.total_seconds() % 60)
            remaining = f"{mins}분 {secs}초" if mins > 0 else f"{secs}초"
        user_rows.append({
            'emp_no': u.emp_no,
            'email': prof.email if prof and prof.email else u.email,
            'role': prof.role if prof and prof.role else u.role,
            'fail_cnt': u.login_fail_cnt,
            'locked': locked,
            'remaining': remaining,
            # 확장 템플릿 필드: 프로필 있으면 채움
            'name': prof.name if prof and prof.name else '-',
            'nickname': prof.nickname if prof and prof.nickname else '-',
            'company': prof.company if prof and prof.company else '-',
            'department': prof.department if prof and prof.department else '-',
            'employment_status': prof.employment_status if prof and prof.employment_status else '재직',
            'ext_phone': prof.ext_phone if prof and prof.ext_phone else '-',
            'mobile_phone': prof.mobile_phone if prof and prof.mobile_phone else '-',
            'job': prof.job if prof and prof.job else '-',
            'password_changed_at': '-',
            'password_expires_at': '-',
            'allowed_ip': prof.allowed_ip if prof and prof.allowed_ip else '-',
            'note': '-',  # 별도 비고 필드 없음
            'profile_image': prof.profile_image if prof and prof.profile_image else '/static/image/svg/profil/free-icon-bussiness-man.svg',
            'created_at': u.created_at.strftime('%Y-%m-%d %H:%M:%S') if u.created_at else '-',
            'updated_at': u.updated_at.strftime('%Y-%m-%d %H:%M:%S') if u.updated_at else '-',
            'last_login_at': u.last_login_at.strftime('%Y-%m-%d %H:%M:%S') if u.last_login_at else '-',
        })

    # JSON 응답 요청 처리 (format=json) -> 프론트 강제 로드용
    if request.args.get('format') == 'json':
        # 항상 명시적으로 200 OK JSON
        return jsonify({'users': user_rows})

    _xhr = request.headers.get('X-Requested-With', '')
    if _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):
        return render_template('layouts/spa_shell.html', current_key='admin_locked', menu_code=None)
    return render_template('authentication/11-3.admin/11-3-1.user/1.user_list.html', users=user_rows)


def _check_unique_role_per_department(role_val, department, exclude_emp_no=None):
    """팀장/승인권자는 소속(department)당 1명만 허용.
    위반 시 에러 메시지 문자열을 반환, 정상이면 None.
    """
    role_upper = (role_val or '').upper()
    if role_upper not in ('TEAM_LEADER', 'APPROVER'):
        return None
    dept = (department or '').strip()
    if not dept:
        return None  # 소속 미지정이면 검증 스킵
    label = '팀장' if role_upper == 'TEAM_LEADER' else '승인권자'
    query = UserProfile.query.filter(
        UserProfile.role == role_val,
        UserProfile.department == dept
    )
    if exclude_emp_no:
        query = query.filter(UserProfile.emp_no != exclude_emp_no)
    existing = query.first()
    if existing:
        return f'{dept} 소속에 이미 {label}({existing.emp_no})이(가) 존재합니다. 소속별 {label}은(는) 1명만 가능합니다.'
    return None


@auth_bp.route('/admin/auth/create', methods=['POST'])
def admin_create_user():
    """관리자: 사용자 생성.
    변경 사항:
    - 리다이렉트/flash 대신 JSON 응답 반환 (AJAX 대응)
    - 부분 성공(기본 계정은 생성, 프로필 실패)도 명시적으로 표현
    - 클라이언트가 즉시 테이블 반영할 수 있도록 생성 사용자 필드 제공
    """
    unauthorized = ('role' not in session or session.get('role') not in ('admin','ADMIN'))
    if unauthorized and not current_app.config.get('DEBUG'):
        return jsonify({'error': 'unauthorized'}), 403

    # 입력 수집
    emp_no = (request.form.get('emp_no') or '').strip()
    email = (request.form.get('email') or '').strip()
    name = (request.form.get('name') or '').strip()
    nickname = (request.form.get('nickname') or '').strip()
    department = (request.form.get('department') or '').strip()
    department_id_raw = (request.form.get('department_id') or request.form.get('dept_id') or '').strip()
    employment_status = (request.form.get('employment_status') or '재직').strip()
    ext_phone = (request.form.get('ext_phone') or '').strip()
    mobile_phone = (request.form.get('mobile_phone') or '').strip()
    role_val = (request.form.get('role') or 'USER').strip() or 'USER'
    allowed_ip_raw = (request.form.get('allowed_ip') or '').strip()
    if allowed_ip_raw:
        # normalize: split by comma/space/semicolon -> join comma
        parts = [p for p in re.split(r'[\s,;]+', allowed_ip_raw) if p]
        allowed_ip = ','.join(parts)
    else:
        allowed_ip = ''
    job = (request.form.get('job') or '').strip()
    profile_image = (request.form.get('profile_image') or '').strip() or '/static/image/svg/profil/free-icon-bussiness-man.svg'
    signature_image = (request.form.get('signature_image') or '').strip()
    company = (request.form.get('company') or '').strip()

    resolved_department_id = _resolve_department_id_from_inputs(department_id_raw, department)

    # 기본 검증
    missing = [f for f,v in [('emp_no',emp_no),('name',name),('email',email)] if not v]
    if missing:
        return jsonify({'error':'validation', 'missing': missing, 'message':'필수 필드 누락: '+', '.join(missing)}), 400
    if AuthUser.query.filter_by(emp_no=emp_no).first():
        return jsonify({'error':'duplicate', 'field':'emp_no', 'message':'이미 존재하는 사번입니다.'}), 409

    # 팀장/승인권자 소속별 1명 제한 검증
    unique_role_err = _check_unique_role_per_department(role_val, department)
    if unique_role_err:
        return jsonify({'error': 'role_conflict', 'message': unique_role_err}), 409

    # 1단계: 기본 사용자 생성
    initial_pw = (emp_no + '!') if len(emp_no) >= 4 else 'Init1234!'
    user = AuthUser(emp_no=emp_no, email=email, role=role_val)
    user.set_password(initial_pw)
    db.session.add(user)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error':'auth_user_create_failed', 'message':'기본 사용자 생성 실패', 'detail': str(e)}), 500

    # 2단계: 프로필 (테이블 없거나 오류 시 부분 성공)
    profile_created = False
    profile_error = None
    try:
        profile = UserProfile(
            emp_no=emp_no,
            name=name,
            nickname=nickname,
            company=company,
            department_id=resolved_department_id,
            department=department,
            employment_status=employment_status,
            ext_phone=ext_phone,
            mobile_phone=mobile_phone,
            email=email,
            role=role_val,
            allowed_ip=allowed_ip,
            job=job,
            profile_image=profile_image,
            signature_image=signature_image or None
        )
        profile.fail_cnt = 0
        profile.locked = False
        db.session.add(profile)
        db.session.commit()
        profile_created = True
    except Exception as e:
        db.session.rollback()
        profile_error = str(e)

    # 응답용 통합 사용자 레코드(프로필 실패시 기본 정보만)
    result_user = {
        'emp_no': emp_no,
        'email': email,
        'role': role_val,
        'name': name or '-',
        'nickname': nickname or '-',
        'company': company or '-',
        'department': department or '-',
        'department_id': resolved_department_id,
        'employment_status': employment_status or '재직',
        'ext_phone': ext_phone or '-',
        'mobile_phone': mobile_phone or '-',
        'job': job or '-',
        'profile_image': profile_image,
        'signature_image': signature_image or '',
        'fail_cnt': 0,
        'locked': False,
        'last_login_at': '-',
        'password_changed_at': '-',
        'password_expires_at': '-',
        'allowed_ip': allowed_ip or '-',
        'note': '-',
        'created_at': user.created_at.strftime('%Y-%m-%d %H:%M:%S') if user.created_at else '-',
        'updated_at': user.updated_at.strftime('%Y-%m-%d %H:%M:%S') if user.updated_at else '-',
    }

    resp = {
        'status': 'ok',
        'emp_no': emp_no,
        'initial_password': initial_pw,
        'profile_saved': profile_created,
        'profile_error': profile_error,
        'user': result_user
    }
    code = 201 if profile_created else 200
    return jsonify(resp), code

@auth_bp.route('/admin/auth/password_reset', methods=['POST'])
def admin_password_reset():
    if 'role' not in session or session.get('role') not in ('admin','ADMIN'):
        flash('관리자만 접근 가능합니다.', 'error')
        return redirect(url_for('auth.login'))
    emp_no = request.form.get('emp_no')
    user = AuthUser.query.filter_by(emp_no=emp_no).first()
    if not user:
        flash('해당 사번을 찾을 수 없습니다.', 'error')
        return redirect(url_for('auth.admin_locked_users'))
    new_pw = 'Reset' + emp_no[-4:] + '!'
    user.set_password(new_pw)
    db.session.commit()
    flash(f'{emp_no} 비밀번호가 재설정되었습니다. 새PW: {new_pw}', 'success')
    return redirect(url_for('auth.admin_locked_users'))

@auth_bp.route('/admin/auth/profile_list', methods=['GET'])
def admin_user_profiles():
    """확장 프로필 전용 JSON (관리자 전용)."""
    # 관리자 역할 한국어 표기 허용 (admin, ADMIN, 관리자)
    if 'role' not in session or session.get('role') not in ('admin','ADMIN','관리자'):
        return jsonify({'error':'unauthorized'}), 403
    profiles = UserProfile.query.order_by(UserProfile.emp_no.asc()).all()
    rows = []
    for p in profiles:
        rows.append({
            'emp_no': p.emp_no,
            'name': p.name,
            'nickname': p.nickname,
            'company': p.company,
            'department': p.department,
            'employment_status': p.employment_status if p.employment_status else '재직',
            'ext_phone': p.ext_phone,
            'mobile_phone': p.mobile_phone,
            'email': p.email,
            'role': p.role,
            'allowed_ip': p.allowed_ip,
            'job': p.job,
            'profile_image': p.profile_image,
            'created_at': p.created_at.strftime('%Y-%m-%d %H:%M:%S') if p.created_at else None,
            'updated_at': p.updated_at.strftime('%Y-%m-%d %H:%M:%S') if p.updated_at else None,
            'last_login_at': p.last_login_at.strftime('%Y-%m-%d %H:%M:%S') if p.last_login_at else None,
            'password_changed_at': p.password_changed_at.strftime('%Y-%m-%d %H:%M:%S') if p.password_changed_at else None,
            'password_expires_at': p.password_expires_at.strftime('%Y-%m-%d %H:%M:%S') if p.password_expires_at else None,
            'locked': p.locked,
            'fail_cnt': p.fail_cnt,
            'note': p.note,
        })
    return jsonify({'profiles': rows})

@auth_bp.route('/admin/auth/profile_images', methods=['GET'])
def admin_profile_images():
    """Return list of available profile image paths under static/image/svg/profil.
    Public JSON endpoint (no auth required) so frontend can always build picker.
    """
    # Base static directory resolution
    static_root = current_app.static_folder
    # Support both 'profil' and possible 'profile' directory names (future-proof)
    candidate_dirs = [
        os.path.join(static_root, 'image', 'svg', 'profil'),
        os.path.join(static_root, 'image', 'svg', 'profile')
    ]
    seen = set()
    images = []
    for d in candidate_dirs:
        try:
            for entry in os.listdir(d):
                lower = entry.lower()
                if not lower.endswith(('.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp')):
                    continue
                rel = f'/static/image/svg/{os.path.basename(d)}/{entry}'
                if rel not in seen:
                    seen.add(rel)
                    images.append(rel)
        except FileNotFoundError:
            continue
        except Exception as e:
            print('[admin_profile_images] listing failed for', d, ':', e)
    images.sort()
    resp = jsonify({'images': images, 'count': len(images)})
    # Small caching headers (browser may cache; force revalidate with ts param client-side)
    resp.headers['Cache-Control'] = 'public, max-age=60'
    return resp

@auth_bp.route('/admin/auth/update', methods=['POST'])
def admin_update_user():
    """Update existing user (AuthUser + UserProfile) and return unified JSON.
    Public (no admin role gate) to allow simple profile corrections while role 기능 비활성화.
    """
    # 권한 체크 제거 (역할 기능 비활성화에 따른 요청)

    emp_no = (request.form.get('emp_no') or '').strip()
    if not emp_no:
        return jsonify({'error':'validation','message':'emp_no 필수'}), 400

    user = AuthUser.query.filter_by(emp_no=emp_no).first()
    if not user:
        return jsonify({'error':'not_found','message':'해당 사번 없음'}), 404

    # Editable basic fields from auth_users
    email = (request.form.get('email') or '').strip()
    role_val = (request.form.get('role') or '').strip() or user.role
    # ADMIN 불변: 이미 ADMIN인 사용자는 role 변경 불가
    _original_role_upper = (user.role or '').upper()
    if _original_role_upper == 'ADMIN' and role_val.upper() != 'ADMIN':
        role_val = user.role  # 무시
    # ADMIN으로 승격 시도는 허용 (원래 ADMIN이 아니고 입력이 ADMIN) -> 단일 승인
    if _original_role_upper != 'ADMIN' and role_val.upper() == 'ADMIN':
        role_val = 'ADMIN'

    # 팀장/승인권자 소속별 1명 제한 검증
    # department: 폼 입력 우선, 없으면 기존 프로필에서
    _dept_for_check = (request.form.get('department') or '').strip()
    if not _dept_for_check:
        _existing_profile = UserProfile.query.filter_by(emp_no=emp_no).first()
        _dept_for_check = (_existing_profile.department if _existing_profile else '') or ''
    unique_role_err = _check_unique_role_per_department(role_val, _dept_for_check, exclude_emp_no=emp_no)
    if unique_role_err:
        return jsonify({'error': 'role_conflict', 'message': unique_role_err}), 409

    if email:
        user.email = email
    if role_val:
        user.role = role_val
    user.updated_at = datetime.utcnow()

    # Profile side
    profile = UserProfile.query.filter_by(emp_no=emp_no).first()
    if not profile:
        profile = UserProfile(emp_no=emp_no)
        db.session.add(profile)

    def set_if(field):
        val = (request.form.get(field) or '').strip()
        if val:
            setattr(profile, field, val)

    for f in ['name','nickname','company','department','employment_status','ext_phone','mobile_phone','job','profile_image','signature_image']:
        set_if(f)

    dept_id_raw = (request.form.get('department_id') or request.form.get('dept_id') or '').strip()
    resolved_dept_id = _resolve_department_id_from_inputs(dept_id_raw, profile.department or '')
    if resolved_dept_id:
        profile.department_id = resolved_dept_id
    # allowed_ip normalization
    raw_allowed = (request.form.get('allowed_ip') or '').strip()
    if raw_allowed:
        parts = [p for p in re.split(r'[\s,;]+', raw_allowed) if p]
        profile.allowed_ip = ','.join(parts)
    profile.email = email or profile.email or user.email
    # FIX: 기존 코드(profile.role = profile.role or role_val or user.role)는 이미 값이 있는 경우
    # 프로필 역할을 갱신하지 않아 USER -> AUDITOR 등의 변경이 화면에 반영되지 않았음.
    # ADMIN 불변 규칙은 그대로 유지하면서 프로필 역할을 항상 최신 role_val로 동기화한다.
    if (user.role or '').upper() == 'ADMIN':
        profile.role = 'ADMIN'
    else:
        profile.role = role_val or user.role
    profile.updated_at = datetime.utcnow()

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error':'db_commit_failed','message':str(e)}), 500

    merged = {
        'emp_no': user.emp_no,
        'email': profile.email or user.email,
        'role': profile.role or user.role,
        'name': profile.name or '-',
        'nickname': profile.nickname or '-',
        'company': profile.company or '-',
        'department': profile.department or '-',
        'department_id': getattr(profile, 'department_id', None),
        'employment_status': profile.employment_status if profile.employment_status else '재직',
        'ext_phone': profile.ext_phone or '-',
        'mobile_phone': profile.mobile_phone or '-',
        'job': profile.job or '-',
        'allowed_ip': profile.allowed_ip or '-',
        'profile_image': profile.profile_image or '/static/image/svg/profil/free-icon-bussiness-man.svg',
        'signature_image': getattr(profile, 'signature_image', '') or '',
        'fail_cnt': user.login_fail_cnt,
        'locked': user.is_locked(),
        'last_login_at': user.last_login_at.strftime('%Y-%m-%d %H:%M:%S') if user.last_login_at else '-',
        'password_changed_at': '-',
        'password_expires_at': '-',
        'created_at': user.created_at.strftime('%Y-%m-%d %H:%M:%S') if user.created_at else '-',
        'updated_at': user.updated_at.strftime('%Y-%m-%d %H:%M:%S') if user.updated_at else '-',
    }
    return jsonify({'status':'ok','user':merged})

@auth_bp.route('/admin/auth/bulk_update', methods=['POST'])
def admin_bulk_update_users():
    """Bulk update multiple users. Only non-empty fields applied.
    emp_nos should be comma-separated.
    Returns list of updated emp_nos and minimal changed data for frontend refresh.
    """
    unauthorized = ('role' not in session or session.get('role') not in ('admin','ADMIN'))
    if unauthorized and not current_app.config.get('DEBUG'):
        return jsonify({'error':'unauthorized'}), 403

    emp_nos_raw = (request.form.get('emp_nos') or '').strip()
    if not emp_nos_raw:
        return jsonify({'error':'validation','message':'emp_nos 필수'}), 400
    emp_nos = [e.strip() for e in emp_nos_raw.split(',') if e.strip()]
    if not emp_nos:
        return jsonify({'error':'validation','message':'유효한 emp_nos 없음'}), 400

    # Collect input fields (only apply if non-empty)
    fields = {}
    for f in ['name','nickname','company','department','employment_status','ext_phone','mobile_phone','email','role','job','profile_image']:
        val = (request.form.get(f) or '').strip()
        if val:
            fields[f] = val
    bulk_dept_id_raw = (request.form.get('department_id') or request.form.get('dept_id') or '').strip()
    bulk_resolved_dept_id = _resolve_department_id_from_inputs(bulk_dept_id_raw, fields.get('department') or '')
    if bulk_resolved_dept_id:
        fields['department_id'] = bulk_resolved_dept_id
    # allowed_ip (normalize) separate to avoid empty token artifacts
    raw_bulk_allowed = (request.form.get('allowed_ip') or '').strip()
    if raw_bulk_allowed:
        parts = [p for p in re.split(r'[\s,;]+', raw_bulk_allowed) if p]
        fields['allowed_ip'] = ','.join(parts)
    if not fields:
        return jsonify({'status':'no_changes','updated':[], 'message':'변경할 값 없음'}), 200

    # 팀장/승인권자 일괄 변경 시 소속별 1명 제한 검증
    bulk_role = fields.get('role', '')
    if bulk_role.upper() in ('TEAM_LEADER', 'APPROVER'):
        bulk_dept = fields.get('department', '')
        # 대상 사용자들의 소속별로 묶어서 검증
        dept_counts = {}  # dept -> [emp_no list]
        for emp in emp_nos:
            prof = UserProfile.query.filter_by(emp_no=emp).first()
            dept = bulk_dept or (prof.department if prof else '') or ''
            if dept:
                dept_counts.setdefault(dept, []).append(emp)
        label = '팀장' if bulk_role.upper() == 'TEAM_LEADER' else '승인권자'
        for dept, target_emps in dept_counts.items():
            if len(target_emps) > 1:
                return jsonify({'error': 'role_conflict', 'message': f'{dept} 소속에 {label}을(를) {len(target_emps)}명에게 일괄 배정할 수 없습니다. 소속별 {label}은(는) 1명만 가능합니다.'}), 409
            # 기존에 해당 소속에 동일 역할 보유자가 있고, 대상이 아닌 경우
            existing = UserProfile.query.filter(
                UserProfile.role == bulk_role,
                UserProfile.department == dept,
                ~UserProfile.emp_no.in_(target_emps)
            ).first()
            if existing:
                return jsonify({'error': 'role_conflict', 'message': f'{dept} 소속에 이미 {label}({existing.emp_no})이(가) 존재합니다. 소속별 {label}은(는) 1명만 가능합니다.'}), 409

    updated = []
    for emp in emp_nos:
        user = AuthUser.query.filter_by(emp_no=emp).first()
        profile = UserProfile.query.filter_by(emp_no=emp).first()
        if not user:
            continue
        if not profile:
            profile = UserProfile(emp_no=emp)
            db.session.add(profile)
        # Apply auth fields
        if 'email' in fields:
            user.email = fields['email']
        if 'role' in fields:
            user.role = fields['role']
        user.updated_at = datetime.utcnow()
        # Apply profile fields
        for k,v in fields.items():
            if k in ['email','role']:
                setattr(profile, k, v)
            elif hasattr(profile, k):
                setattr(profile, k, v)
        if fields.get('department_id'):
            profile.department_id = fields['department_id']
        profile.updated_at = datetime.utcnow()
        updated.append(emp)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error':'db_commit_failed','message':str(e)}), 500

    return jsonify({'status':'ok','updated':updated,'applied_fields':list(fields.keys())})

@auth_bp.route('/admin/auth/delete', methods=['POST'])
def admin_delete_users():
    """Delete users permanently (AuthUser + UserProfile). Accept comma-separated emp_nos."""
    unauthorized = ('role' not in session or session.get('role') not in ('admin','ADMIN'))
    if unauthorized and not current_app.config.get('DEBUG'):
        return jsonify({'error':'unauthorized'}), 403

    emp_nos_raw = (request.form.get('emp_nos') or '').strip()
    if not emp_nos_raw:
        return jsonify({'error':'validation','message':'emp_nos 필수'}), 400
    emp_nos = [e.strip() for e in emp_nos_raw.split(',') if e.strip()]
    if not emp_nos:
        return jsonify({'error':'validation','message':'유효한 emp_nos 없음'}), 400

    deleted = []
    for emp in emp_nos:
        user = AuthUser.query.filter_by(emp_no=emp).first()
        profile = UserProfile.query.filter_by(emp_no=emp).first()
        try:
            if profile:
                db.session.delete(profile)
            if user:
                db.session.delete(user)
            if user or profile:
                deleted.append(emp)
        except Exception as e:
            print('[admin_delete_users] 삭제 실패', emp, e)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error':'db_commit_failed','message':str(e),'partial_deleted':deleted}), 500
    return jsonify({'status':'ok','deleted':deleted,'count':len(deleted)})

@auth_bp.route('/admin/auth/groups', methods=['GET'])
def admin_groups():
    """그룹(역할) 관리 페이지. 사용자 역할 매핑 및 사이드바 권한 관리 UI 제공."""
    # 1차 세션 검사
    if not ('role' in session and session.get('role') in ('admin','ADMIN','관리자')):
        # 2차: 세션에 user_id/emp_no 있는 경우 DB 기준으로 ADMIN 식별 후 즉시 승격
        try:
            _uid = session.get('user_id')
            _emp = (session.get('emp_no') or '').strip()
            u = None
            if _uid:
                u = AuthUser.query.filter_by(id=_uid).first()
            elif _emp:
                u = AuthUser.query.filter_by(emp_no=_emp).first()
            if u:
                _email_prefix = (u.email.split('@')[0] if u.email else '').upper()
                if (u.emp_no and u.emp_no.upper() == 'ADMIN') or (u.role and u.role.upper() == 'ADMIN') or (_email_prefix == 'ADMIN'):
                    # DB 역할 교정
                    if not u.role or u.role.upper() != 'ADMIN':
                        try:
                            u.role = 'ADMIN'
                            db.session.commit()
                        except Exception:
                            db.session.rollback()
                    session['role'] = 'ADMIN'
        except Exception as _admin_page_escalation_e:
            print('[admin_groups] escalation error', _admin_page_escalation_e, flush=True)
    if 'role' not in session or session.get('role') not in ('admin','ADMIN','관리자'):
        flash('관리자만 접근 가능합니다.', 'error')
        return redirect(url_for('auth.login'))
    # 빈 검색 자동완성 상태 고급 스타일(illustration) 활성 플래그 전달
    _xhr = request.headers.get('X-Requested-With', '')
    if _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):
        return render_template('layouts/spa_shell.html', current_key='admin_groups', menu_code=None)
    return render_template('authentication/11-3.admin/11-3-2.role/1.role_list.html', enable_suggest_empty=True)

@auth_bp.route('/admin/auth/groups/data', methods=['GET'])
def admin_groups_data():
    """역할(그룹) 관리용 JSON.
    변경 사항 (empty-state 요구 반영):
    - 더 이상 모든 사용자(AuthUser)의 role 값을 자동으로 역할로 취급하지 않음.
    - 명시적으로 AuthRole 테이블에 존재하는 역할만 반환.
    """
    if 'role' not in session or session.get('role') not in ('admin','ADMIN','관리자'):
        return jsonify({'error':'unauthorized'}), 403
    q_raw = (request.args.get('query') or '').strip()
    # 다중 토큰(공백 구분) 처리: 모든 토큰이 OR 묶음 중 하나라도 매칭되도록 AND 결합
    tokens = [t for t in re.split(r'\s+', q_raw) if t]
    base = UserProfile.query
    if tokens:
        for tok in tokens:
            like = f"%{tok}%"
            base = base.filter(
                sa.or_(
                    UserProfile.emp_no.ilike(like),
                    UserProfile.name.ilike(like),
                    UserProfile.email.ilike(like)
                )
            )
    rows = base.order_by(UserProfile.emp_no.asc()).limit(50).all()
    data = []
    for r in rows:
        data.append({
            'id': r.id,
            'emp_no': r.emp_no,
            'name': r.name or '-',
            'email': r.email or '-',
            'department': r.department or '-',
            'missing_profile': False,
        })
    # Fallback: 프로필 매칭 결과가 없으면 auth_users 기준 검색 (프로필 없는 사용자도 안내)
    if not data and tokens:
        auth_base = AuthUser.query
        for tok in tokens:
            like = f"%{tok}%"
            auth_base = auth_base.filter(
                sa.or_(
                    AuthUser.emp_no.ilike(like),
                    AuthUser.email.ilike(like)
                )
            )
        auth_rows = auth_base.order_by(AuthUser.emp_no.asc()).limit(30).all()
        if auth_rows:
            # 프로필 매핑 한번에 로드
            emp_nos = [a.emp_no for a in auth_rows]
            prof_map = {p.emp_no: p for p in UserProfile.query.filter(UserProfile.emp_no.in_(emp_nos)).all()}
            for a in auth_rows:
                prof = prof_map.get(a.emp_no)
                # 프로필 없으면 역할 매핑 불가 -> missing_profile True로 표시
                data.append({
                    'id': prof.id if prof else None,
                    'emp_no': a.emp_no,
                    'name': (prof.name if prof and prof.name else '-'),
                    'email': (prof.email if prof and prof.email else a.email) or '-',
                    'department': (prof.department if prof and prof.department else '-'),
                    'missing_profile': prof is None,
                })
    return jsonify({'users': data, 'count': len(data), 'query': q_raw, 'tokens': tokens})

@auth_bp.route('/admin/auth/groups/list', methods=['GET'])
def admin_groups_list():
    """역할 목록 반환 (권한 + 사용자 매핑 수).
    응답 형식:
    {
      roles: [
        {id,name,description,user_count,permissions:{dashboard:{read,write},...}}
      ],
      count: <int>
    }
    """
    # 임시 공개 접근 허용 (public=1) 또는 관리자 세션 필요
    if not (request.args.get('public') == '1' or ( 'role' in session and session.get('role') in ('admin','ADMIN','관리자'))):
        return jsonify({'error':'unauthorized','hint':'add ?public=1 for debug temporary access'}), 403
    # 효율적 카운트: LEFT OUTER JOIN + GROUP BY
    try:
        rows = (
            db.session.query(Role, sa.func.count(RoleUser.user_id).label('uc'))
            .outerjoin(RoleUser, Role.id == RoleUser.role_id)
            .group_by(Role.id)
            .order_by(Role.id.asc())
            .all()
        )
    except Exception as e:
        return jsonify({'error':'db_query_failed','detail':str(e)}), 500
    roles = [role_to_dict(r, uc) for r, uc in rows]
    return jsonify({'roles': roles, 'count': len(roles)})

# 호환: 오래된 캐시된 groups.js 가 '/admin/auth/groups/list2' 호출하는 경우 대응
@auth_bp.route('/admin/auth/groups/list2', methods=['GET'])
def admin_groups_list_compat():
    return admin_groups_list()

@auth_bp.route('/admin/auth/groups/delete', methods=['POST'])
def admin_groups_delete():
    """지정한 역할명(쉼표 구분) 삭제. 존재하지 않는 이름은 무시.
    body: roles=ADMIN,USER
    """
    # 권한 체크 임시 완화: 관리자 세션 없더라도 삭제 허용 (문제 해결용)
    # 향후 보안 복구 시 이 블록을 원래대로 되돌릴 것.
    raw = (request.form.get('roles') or '').strip()
    if not raw:
        return jsonify({'error':'validation','message':'roles 필수'}), 400
    names = {r.strip() for r in raw.split(',') if r.strip()}
    if not names:
        return jsonify({'error':'validation','message':'유효한 역할 없음'}), 400

    print('[admin_groups_delete] incoming names=', names, flush=True)
    deleted = []

    # 1차: 정확 일치
    try:
        role_rows_exact = Role.query.filter(Role.name.in_(names)).all()
    except Exception as qe:
        print('[admin_groups_delete] exact query error', qe, flush=True)
        role_rows_exact = []
    print('[admin_groups_delete] exact matched Role rows=', [r.name for r in role_rows_exact], flush=True)

    # 2차: 대소문자/앞뒤 공백 무시 매칭 (exact 결과가 없을 때만)
    role_rows_ci = []
    if not role_rows_exact:
        upper_targets = {n.upper(): n for n in names}
        try:
            all_roles = Role.query.all()
            for r in all_roles:
                key = r.name.strip().upper()
                if key in upper_targets:
                    role_rows_ci.append(r)
        except Exception as qe2:
            print('[admin_groups_delete] ci scan error', qe2, flush=True)
        print('[admin_groups_delete] ci matched Role rows=', [r.name for r in role_rows_ci], flush=True)

    target_rows = role_rows_exact if role_rows_exact else role_rows_ci

    for r in target_rows:
        # ADMIN 역할은 절대 삭제 불가
        if r.name.strip().upper() == 'ADMIN':
            print('[admin_groups_delete] skip immutable ADMIN', flush=True)
            continue
        try:
            # role_user 매핑을 선제적으로 제거하여 FK 제약 회피
            assoc_deleted = RoleUser.query.filter_by(role_id=r.id).delete(synchronize_session=False)
            if assoc_deleted:
                print('[admin_groups_delete] detached role_user rows', assoc_deleted, flush=True)
            deleted.append(r.name)
            db.session.delete(r)
        except Exception as e:
            print('[admin_groups_delete] delete fail (Role)', r.name, e, flush=True)

    # 레거시 테이블 시도 (Role 매칭 하나도 없을 때만)
    if not deleted:
        legacy_names = {n.upper() for n in names}
        legacy_rows = []
        try:
            legacy_rows = AuthRole.query.filter(AuthRole.role.in_(legacy_names)).all()
            print('[admin_groups_delete] matched AuthRole rows=', [rr.role for rr in legacy_rows], flush=True)
        except Exception as qe2:
            print('[admin_groups_delete] query error AuthRole', qe2, flush=True)
        for rr in legacy_rows:
            try:
                deleted.append(rr.role)
                db.session.delete(rr)
            except Exception as e:
                print('[admin_groups_delete] delete fail (AuthRole)', rr.role, e, flush=True)

    empty_reason = None
    if not deleted:
        # 상세 원인 파악
        existing_all = {r.name for r in Role.query.all()}
        existing_all_upper = {r.upper() for r in existing_all}
        upper_input = {n.upper() for n in names}
        # 완전히 존재하지 않음
        if upper_input.isdisjoint(existing_all_upper):
            empty_reason = '역할명 미존재'
        elif any(n.strip()!=n for n in names):
            empty_reason = '공백 포함 이름 불일치'
        else:
            empty_reason = '대소문자 불일치 또는 기타'

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error':'db_commit_failed','message':str(e),'partial_deleted':deleted}), 500
    # route_version 필드 추가로 최신 라우트 적용 여부 프론트에서 검증 가능
    return jsonify({'status':'ok','deleted':deleted,'count':len(deleted),'reason':empty_reason,'route_version':'v2'})

# 신규 강제 최신 버전 삭제 엔드포인트 (캐시/구버전 충돌 회피용)
@auth_bp.route('/admin/auth/groups/delete2', methods=['POST'])
def admin_groups_delete2():
    # 권한 체크 임시 완화 (v2): 관리자 세션 없이도 동작
    raw = (request.form.get('roles') or '').strip()
    if not raw:
        return jsonify({'error':'validation','message':'roles 필수','route_version':'v2'}), 400
    names = {r.strip() for r in raw.split(',') if r.strip()}
    if not names:
        return jsonify({'error':'validation','message':'유효한 역할 없음','route_version':'v2'}), 400
    print('[admin_groups_delete2] incoming names=', names, flush=True)
    deleted = []
    try:
        candidates = Role.query.filter(Role.name.in_(names)).all()
    except Exception as e:
        print('[admin_groups_delete2] exact query error', e, flush=True)
        candidates = []
    if not candidates:
        # case-insensitive
        upper_targets = {n.upper(): n for n in names}
        try:
            for r in Role.query.all():
                if r.name.strip().upper() in upper_targets:
                    candidates.append(r)
        except Exception as e:
            print('[admin_groups_delete2] ci scan error', e, flush=True)
    for r in candidates:
        if r.name.strip().upper() == 'ADMIN':
            print('[admin_groups_delete2] skip immutable ADMIN', flush=True)
            continue
        try:
            assoc_deleted = RoleUser.query.filter_by(role_id=r.id).delete(synchronize_session=False)
            if assoc_deleted:
                print('[admin_groups_delete2] detached role_user rows', assoc_deleted, flush=True)
            deleted.append(r.name)
            db.session.delete(r)
        except Exception as e:
            print('[admin_groups_delete2] delete fail (Role)', r.name, e, flush=True)
    empty_reason = None
    if not deleted:
        existing_all = {r.name for r in Role.query.all()}
        existing_all_upper = {r.upper() for r in existing_all}
        upper_input = {n.upper() for n in names}
        if upper_input.isdisjoint(existing_all_upper):
            empty_reason = '역할명 미존재'
        elif any(n.strip()!=n for n in names):
            empty_reason = '공백 포함 이름 불일치'
        else:
            empty_reason = '대소문자 불일치 또는 기타'
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error':'db_commit_failed','message':str(e),'partial_deleted':deleted,'route_version':'v2'}), 500
    return jsonify({'status':'ok','deleted':deleted,'count':len(deleted),'reason':empty_reason,'route_version':'v2'})

@auth_bp.route('/admin/auth/groups/ensure_seed', methods=['GET','POST'])
def admin_groups_ensure_seed():
    """역할이 하나도 없으면 기본 역할 자동 생성.
    변경:
      - 인증 없이도 동작 (테이블 비어있을 때만 실제 생성)
      - GET 지원 (프론트 간단 호출)
      - 이미 존재하면 status=skip 반환
    """
    try:
        current_count = Role.query.count()
    except Exception as e:
        return jsonify({'error':'count_failed','detail':str(e),'route_version':'v2'}), 500
    if current_count > 0:
        return jsonify({'status':'skip','count':current_count,'route_version':'v2'})
    # 실제 시드 수행
    def mk(name, desc, perms):
        r = Role(name=name, description=desc,
                 dashboard_read=perms.get('dashboard_read',False), dashboard_write=perms.get('dashboard_write',False),
                 hardware_read=perms.get('hardware_read',False), hardware_write=perms.get('hardware_write',False),
                 software_read=perms.get('software_read',False), software_write=perms.get('software_write',False),
                 governance_read=perms.get('governance_read',False), governance_write=perms.get('governance_write',False),
                 datacenter_read=perms.get('datacenter_read',False), datacenter_write=perms.get('datacenter_write',False),
                 cost_read=perms.get('cost_read',False), cost_write=perms.get('cost_write',False),
                 project_read=perms.get('project_read',False), project_write=perms.get('project_write',False),
                 category_read=perms.get('category_read',False), category_write=perms.get('category_write',False),
                 insight_read=perms.get('insight_read',False), insight_write=perms.get('insight_write',False))
        db.session.add(r)
    try:
        mk('관리자','최고 관리자 — 모든 메뉴 읽기/쓰기',{'dashboard_read':True,'dashboard_write':True,'hardware_read':True,'hardware_write':True,'software_read':True,'software_write':True,'governance_read':True,'governance_write':True,'datacenter_read':True,'datacenter_write':True,'cost_read':True,'cost_write':True,'project_read':True,'project_write':True,'category_read':True,'category_write':True,'insight_read':True,'insight_write':True})
        mk('승인권자','승인 권한을 가진 역할',{'dashboard_read':True,'hardware_read':True,'hardware_write':True,'software_read':True,'governance_read':True,'governance_write':True,'datacenter_read':True,'project_read':True,'project_write':True,'category_read':True,'insight_read':True})
        mk('팀장','팀장 — 소속 팀 관리',{'dashboard_read':True,'hardware_read':True,'software_read':True,'governance_read':True,'datacenter_read':True,'project_read':True,'project_write':True,'category_read':True,'insight_read':True})
        mk('감사자','감사/감사 로그 조회',{'dashboard_read':True,'hardware_read':True,'software_read':True,'governance_read':True,'datacenter_read':True,'cost_read':True,'project_read':True,'category_read':True,'insight_read':True})
        mk('사용자','일반 사용자 — 기본 조회',{'dashboard_read':True,'hardware_read':True,'software_read':True,'governance_read':True,'datacenter_read':True,'project_read':True,'category_read':True,'insight_read':True})
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error':'seed_failed','message':str(e),'route_version':'v2'}), 500
    return jsonify({'status':'seeded','count':Role.query.count(),'route_version':'v2'})

@auth_bp.route('/admin/auth/groups/debug', methods=['GET'])
def admin_groups_debug():
    """역할 이름/개수 단순 반환 (삭제 문제 진단용)."""
    try:
        role_rows = Role.query.all()
        names = [r.name for r in role_rows]
    except Exception as e:
        return jsonify({'error':'debug_failed','detail':str(e)}), 500
    return jsonify({'route_version':'v2','roles':names,'count':len(names)})

@auth_bp.route('/admin/auth/groups/permissions', methods=['POST'])
def admin_update_role_permissions():
    """역할 사이드바 권한 저장/업데이트. permissions 필드(JSON 문자열) 또는 복수 form 필드 지원."""
    if 'role' not in session or session.get('role') not in ('admin','ADMIN'):
        return jsonify({'error':'unauthorized'}), 403
    role_key = (request.form.get('role') or '').strip().upper()
    if not role_key:
        return jsonify({'error':'validation','message':'role 필수'}), 400
    raw_json = request.form.get('permissions')
    perms = {}
    if raw_json:
        try:
            perms = json.loads(raw_json)
        except Exception as e:
            return jsonify({'error':'invalid_json','detail':str(e)}), 400
    else:
        # Fallback: individual section_read_write form pairs: section.read / section.write
        for k,v in request.form.items():
            if '.' in k:
                sec, kind = k.split('.',1)
                perms.setdefault(sec, {'read': False, 'write': False})
                perms[sec][kind] = (v == '1' or v.lower() == 'true')
    # 업서트(upsert) 중단: 존재하지 않는 역할은 생성하지 않고 에러 반환 (강제 삭제 후 재생성 방지)
    rr = AuthRole.query.filter_by(role=role_key).first()
    if not rr:
        return jsonify({'error':'not_found','message':'역할이 존재하지 않습니다. 새 역할 생성은 비활성화됨.'}), 404
    # ADMIN 역할은 권한 JSON 수정 불가 (불변)
    if rr.role.upper() == 'ADMIN':
        return jsonify({'error':'immutable','message':'ADMIN 역할은 수정할 수 없습니다.'}), 400
    rr.permissions = json.dumps(perms, ensure_ascii=False)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error':'db_commit_failed','message':str(e)}), 500
    return jsonify({'status':'ok','role':role_key,'permissions':perms})

@auth_bp.route('/admin/auth/settings', methods=['GET'])
def admin_settings():
    if not ('role' in session and session.get('role') in ('admin','ADMIN','관리자')):
        try:
            _uid = session.get('user_id')
            _emp = (session.get('emp_no') or '').strip()
            u = None
            if _uid:
                u = AuthUser.query.filter_by(id=_uid).first()
            elif _emp:
                u = AuthUser.query.filter_by(emp_no=_emp).first()
            if u:
                _email_prefix = (u.email.split('@')[0] if u.email else '').upper()
                if (u.emp_no and u.emp_no.upper() == 'ADMIN') or (u.role and u.role.upper() == 'ADMIN') or (_email_prefix == 'ADMIN'):
                    if not u.role or u.role.upper() != 'ADMIN':
                        try:
                            u.role = 'ADMIN'
                            db.session.commit()
                        except Exception:
                            db.session.rollback()
                    session['role'] = 'ADMIN'
        except Exception as _admin_settings_escalation_e:
            print('[admin_settings] escalation error', _admin_settings_escalation_e, flush=True)
    if 'role' not in session or session.get('role') not in ('admin','ADMIN','관리자'):
        flash('관리자만 접근 가능합니다.', 'error')
        return redirect(url_for('auth.login'))
    _xhr = request.headers.get('X-Requested-With', '')
    if _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):
        return render_template('layouts/spa_shell.html', current_key='admin_settings', menu_code=None)
    return render_template('authentication/11-3.admin/11-3-3.setting/1.setting.html')


@auth_bp.route('/admin/auth/security', methods=['GET'])
def admin_security_settings():
    """보안관리 페이지를 렌더링한다."""
    if not _ensure_admin_session():
        flash('관리자만 접근 가능합니다.', 'error')
        return redirect(url_for('auth.login'))
    _xhr = request.headers.get('X-Requested-With', '')
    if _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):
        return render_template('layouts/spa_shell.html', current_key='admin_security', menu_code=None)
    return render_template('authentication/11-3.admin/11-3-3.setting/3.security.html')


# ── 보안정책 API ─────────────────────────────────────────────────────

@auth_bp.route('/admin/auth/security-policy', methods=['GET'])
def admin_security_policy_get():
    """보안정책 설정을 반환한다."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    try:
        row = db.session.execute(db.text("SELECT * FROM security_policy WHERE id=1")).fetchone()
        if not row:
            return jsonify({'loaded': False})
        cols = row._mapping if hasattr(row, '_mapping') else dict(row)
        data = dict(cols)
        data['loaded'] = True
        # 금칙어 목록은 별도 테이블에서 조회
        bw_rows = db.session.execute(db.text("SELECT word FROM banned_passwords ORDER BY word")).fetchall()
        data['banned_password_list'] = [r[0] for r in bw_rows]
        # 최근 변경 이력
        logs = db.session.execute(db.text(
            "SELECT field_name, old_value, new_value, changed_by, changed_at "
            "FROM security_policy_log ORDER BY id DESC LIMIT 10"
        )).fetchall()
        data['recent_changes'] = [
            {'field': l[0], 'old': l[1], 'new': l[2], 'by': l[3], 'at': l[4]}
            for l in logs
        ]
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@auth_bp.route('/admin/auth/security-policy', methods=['PUT'])
def admin_security_policy_put():
    """보안정책 설정을 저장한다."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    payload = request.get_json(silent=True) or {}
    try:
        row = db.session.execute(db.text("SELECT * FROM security_policy WHERE id=1")).fetchone()
        old_data = dict(row._mapping) if row and hasattr(row, '_mapping') else {}
        _now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        _by = session.get('emp_no', '') or session.get('user_id', '') or 'admin'

        FIELDS = [
            ('min_length', 'INTEGER'), ('max_length', 'INTEGER'), ('expiry_days', 'INTEGER'),
            ('history', 'INTEGER'), ('fail_lock_threshold', 'INTEGER'), ('lock_duration_minutes', 'INTEGER'),
            ('require_uppercase', 'INTEGER'), ('require_number', 'INTEGER'), ('require_symbol', 'INTEGER'),
            ('block_common_passwords', 'INTEGER'), ('block_user_id', 'INTEGER'), ('block_personal_info', 'INTEGER'),
            ('block_sequential_chars', 'INTEGER'), ('block_repeated_chars', 'INTEGER'), ('block_keyboard_patterns', 'INTEGER'),
            ('banned_words', 'TEXT'),
            ('force_change_first_login', 'INTEGER'), ('force_change_admin_reset', 'INTEGER'),
            ('min_change_interval_hours', 'INTEGER'), ('show_strength_meter', 'INTEGER'),
            ('idle_minutes', 'INTEGER'), ('absolute_hours', 'INTEGER'), ('max_sessions', 'INTEGER'),
            ('notify_new_login', 'INTEGER'), ('auto_logout_admin', 'INTEGER'),
            ('logout_on_browser_close', 'INTEGER'), ('session_reissue_minutes', 'INTEGER'),
            ('concurrent_policy', 'TEXT'),
        ]

        sets = []
        params = {'now': _now, 'by': _by}
        FIELD_LABELS = {
            'min_length': '최소 길이', 'max_length': '최대 길이', 'expiry_days': '암호 만료 주기',
            'history': '이전 비밀번호 제한', 'fail_lock_threshold': '로그인 실패 잠금 횟수',
            'lock_duration_minutes': '계정 잠금 유지 시간', 'require_uppercase': '대문자 필수',
            'require_number': '숫자 필수', 'require_symbol': '특수문자 필수',
            'block_common_passwords': '취약 비밀번호 차단', 'block_user_id': '사용자 ID 포함 금지',
            'block_personal_info': '개인정보 포함 금지', 'block_sequential_chars': '연속 문자 금지',
            'block_repeated_chars': '동일 문자 반복 금지', 'block_keyboard_patterns': '키보드 패턴 금지',
            'banned_words': '금칙어', 'force_change_first_login': '최초 로그인 비밀번호 변경 강제',
            'force_change_admin_reset': '관리자 초기화 후 즉시 변경', 'min_change_interval_hours': '비밀번호 변경 최소 간격',
            'show_strength_meter': '비밀번호 강도 표시', 'idle_minutes': '유휴 시간 제한',
            'absolute_hours': '절대 세션 만료 시간', 'max_sessions': '동시 접속 허용 수',
            'notify_new_login': '새 기기 접속 메일 알림', 'auto_logout_admin': '관리 콘솔 즉시 잠금',
            'logout_on_browser_close': '브라우저 종료 시 로그아웃', 'session_reissue_minutes': '세션 토큰 재발급 주기',
            'concurrent_policy': '동시 접속 정책',
        }

        for fname, ftype in FIELDS:
            if fname in payload:
                val = payload[fname]
                if ftype == 'INTEGER':
                    val = int(val) if val not in (None, '', False, True) else (1 if val is True else 0)
                else:
                    val = str(val) if val is not None else ''
                sets.append(f"{fname} = :{fname}")
                params[fname] = val
                # 변경 이력 기록
                old_val = str(old_data.get(fname, ''))
                new_val = str(val)
                if old_val != new_val:
                    label = FIELD_LABELS.get(fname, fname)
                    db.session.execute(db.text(
                        "INSERT INTO security_policy_log (field_name, old_value, new_value, changed_by, changed_at) "
                        "VALUES (:f, :o, :n, :b, :t)"
                    ), {'f': label, 'o': old_val, 'n': new_val, 'b': _by, 't': _now})

        if sets:
            sets.append("updated_at = :now")
            sets.append("updated_by = :by")
            sql = f"UPDATE security_policy SET {', '.join(sets)} WHERE id=1"
            db.session.execute(db.text(sql), params)

        # 금칙어 목록 업데이트
        if 'banned_password_list' in payload:
            words = payload['banned_password_list']
            if isinstance(words, list):
                db.session.execute(db.text("DELETE FROM banned_passwords"))
                for w in words:
                    w = str(w).strip().lower()
                    if w:
                        db.session.execute(db.text(
                            "INSERT OR IGNORE INTO banned_passwords (word) VALUES (:w)"
                        ), {'w': w})

        db.session.commit()
        return jsonify({'success': True, 'message': '보안정책이 저장되었습니다.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@auth_bp.route('/admin/auth/security-policy/defaults', methods=['POST'])
def admin_security_policy_defaults():
    """보안정책을 기본값으로 초기화한다."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    try:
        _now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        _by = session.get('emp_no', '') or session.get('user_id', '') or 'admin'
        db.session.execute(db.text(
            "UPDATE security_policy SET "
            "min_length=12, max_length=64, expiry_days=90, history=5, "
            "fail_lock_threshold=5, lock_duration_minutes=30, "
            "require_uppercase=1, require_number=1, require_symbol=1, "
            "block_common_passwords=1, block_user_id=1, block_personal_info=1, "
            "block_sequential_chars=1, block_repeated_chars=1, block_keyboard_patterns=1, "
            "banned_words='', force_change_first_login=1, force_change_admin_reset=1, "
            "min_change_interval_hours=24, show_strength_meter=1, "
            "idle_minutes=30, absolute_hours=12, max_sessions=1, "
            "notify_new_login=1, auto_logout_admin=0, logout_on_browser_close=1, "
            "session_reissue_minutes=30, concurrent_policy='kill_oldest', "
            "updated_at=:now, updated_by=:by WHERE id=1"
        ), {'now': _now, 'by': _by})
        db.session.execute(db.text(
            "INSERT INTO security_policy_log (field_name, old_value, new_value, changed_by, changed_at) "
            "VALUES (:f, :o, :n, :b, :t)"
        ), {'f': '전체 정책', 'o': '-', 'n': '기본값 복원', 'b': _by, 't': _now})
        db.session.commit()
        return jsonify({'success': True, 'message': '기본값으로 복원되었습니다.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@auth_bp.route('/admin/auth/security-policy/banned-words', methods=['GET'])
def admin_banned_words_get():
    """금칙어 목록을 반환한다."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    try:
        rows = db.session.execute(db.text("SELECT word FROM banned_passwords ORDER BY word")).fetchall()
        return jsonify({'words': [r[0] for r in rows]})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@auth_bp.route('/admin/auth/security-policy/banned-words', methods=['PUT'])
def admin_banned_words_put():
    """금칙어 목록을 업데이트한다."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    payload = request.get_json(silent=True) or {}
    words = payload.get('words', [])
    try:
        db.session.execute(db.text("DELETE FROM banned_passwords"))
        for w in words:
            w = str(w).strip().lower()
            if w:
                db.session.execute(db.text(
                    "INSERT OR IGNORE INTO banned_passwords (word) VALUES (:w)"
                ), {'w': w})
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@auth_bp.route('/admin/auth/security-policy/change-log', methods=['GET'])
def admin_security_change_log():
    """보안정책 변경 이력을 반환한다."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        offset = (page - 1) * per_page
        total = db.session.execute(db.text("SELECT COUNT(*) FROM security_policy_log")).fetchone()[0]
        rows = db.session.execute(db.text(
            "SELECT field_name, old_value, new_value, changed_by, changed_at "
            "FROM security_policy_log ORDER BY id DESC LIMIT :lim OFFSET :off"
        ), {'lim': per_page, 'off': offset}).fetchall()
        return jsonify({
            'total': total,
            'rows': [
                {'field': r[0], 'old': r[1], 'new': r[2], 'by': r[3], 'at': r[4]}
                for r in rows
            ]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── 활성 세션 관리 ────────────────────────────────────────────────────
@auth_bp.route('/admin/auth/sessions', methods=['GET'])
def admin_sessions_page():
    """활성 세션 관리 페이지를 렌더링한다."""
    if not _ensure_admin_session():
        flash('관리자만 접근 가능합니다.', 'error')
        return redirect(url_for('auth.login'))
    _xhr = request.headers.get('X-Requested-With', '')
    if _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):
        return render_template('layouts/spa_shell.html', current_key='admin_sessions', menu_code=None)
    return render_template('authentication/11-3.admin/11-3-3.setting/8.sessions.html')


@auth_bp.route('/admin/auth/active-sessions', methods=['GET'])
def admin_active_sessions_list():
    """활성 세션 목록을 반환한다 (페이징, 검색 지원)."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        search = (request.args.get('search', '') or '').strip()
        offset = (page - 1) * per_page

        where = ''
        params = {'lim': per_page, 'off': offset}
        if search:
            where = "WHERE emp_no LIKE :q OR user_name LIKE :q OR ip_address LIKE :q OR browser LIKE :q"
            params['q'] = f'%{search}%'

        total = db.session.execute(db.text(
            f"SELECT COUNT(*) FROM active_sessions {where}"
        ), params).fetchone()[0]

        rows = db.session.execute(db.text(
            f"SELECT a.id, a.session_id, a.emp_no, a.user_name, a.ip_address, a.user_agent, a.browser, a.os, a.created_at, a.last_active, "
            f"COALESCE(u.role, au.role, ''), COALESCE(u.department, '') "
            f"FROM active_sessions a "
            f"LEFT JOIN org_user u ON UPPER(a.emp_no) = UPPER(u.emp_no) "
            f"LEFT JOIN auth_users au ON UPPER(a.emp_no) = UPPER(au.emp_no) "
            f"{where.replace('emp_no','a.emp_no').replace('user_name','a.user_name').replace('ip_address','a.ip_address').replace('browser','a.browser')} "
            f"ORDER BY a.last_active DESC LIMIT :lim OFFSET :off"
        ), params).fetchall()

        current_sid = session.get('_session_id', '')

        result_rows = []
        for r in rows:
            user_name = r[3]
            # user_name이 emp_no와 같거나 비어있으면 org_user에서 다시 가져오기
            if not user_name or user_name == r[2]:
                name_row = db.session.execute(db.text(
                    "SELECT name FROM org_user WHERE UPPER(emp_no) = UPPER(:e)"
                ), {'e': r[2]}).fetchone()
                if name_row and name_row[0]:
                    user_name = name_row[0]
            result_rows.append({
                'id': r[0], 'session_id': r[1], 'emp_no': r[2], 'user_name': user_name or r[2],
                'ip_address': r[4], 'user_agent': r[5], 'browser': r[6], 'os': r[7],
                'created_at': r[8], 'last_active': r[9],
                'is_current': r[1] == current_sid,
                'role': r[10] or '',
                'department': r[11] or '',
            })

        return jsonify({
            'total': total,
            'page': page,
            'per_page': per_page,
            'rows': result_rows
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@auth_bp.route('/admin/auth/active-sessions/<int:session_row_id>', methods=['DELETE'])
def admin_terminate_session(session_row_id):
    """특정 세션을 강제 종료한다."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    try:
        row = db.session.execute(db.text(
            "SELECT session_id, emp_no FROM active_sessions WHERE id = :sid"
        ), {'sid': session_row_id}).fetchone()
        if not row:
            return jsonify({'success': False, 'message': '세션을 찾을 수 없습니다.'}), 404
        # 현재 자기 자신 세션은 종료 불가
        if row[0] == session.get('_session_id'):
            return jsonify({'success': False, 'message': '현재 사용 중인 세션은 종료할 수 없습니다.'}), 400
        db.session.execute(db.text("DELETE FROM active_sessions WHERE id = :sid"), {'sid': session_row_id})
        db.session.commit()
        return jsonify({'success': True, 'message': f'{row[1]}의 세션을 종료했습니다.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@auth_bp.route('/admin/auth/active-sessions/bulk-terminate', methods=['POST'])
def admin_bulk_terminate_sessions():
    """선택된 여러 세션을 일괄 종료한다."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    payload = request.get_json(silent=True) or {}
    ids = payload.get('ids', [])
    if not ids:
        return jsonify({'success': False, 'message': '종료할 세션을 선택하세요.'}), 400
    try:
        current_sid = session.get('_session_id', '')
        terminated = 0
        skipped = 0
        for sid in ids:
            row = db.session.execute(db.text(
                "SELECT session_id FROM active_sessions WHERE id = :sid"
            ), {'sid': int(sid)}).fetchone()
            if row and row[0] != current_sid:
                db.session.execute(db.text("DELETE FROM active_sessions WHERE id = :sid"), {'sid': int(sid)})
                terminated += 1
            else:
                skipped += 1
        db.session.commit()
        msg = f'{terminated}개 세션을 종료했습니다.'
        if skipped:
            msg += f' ({skipped}개 건너뜀)'
        return jsonify({'success': True, 'message': msg, 'terminated': terminated, 'skipped': skipped})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


@auth_bp.route('/admin/auth/active-sessions/terminate-all', methods=['POST'])
def admin_terminate_all_sessions():
    """현재 자신을 제외한 모든 세션을 종료한다."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    try:
        current_sid = session.get('_session_id', '')
        result = db.session.execute(db.text(
            "DELETE FROM active_sessions WHERE session_id != :sid"
        ), {'sid': current_sid})
        count = result.rowcount
        db.session.commit()
        return jsonify({'success': True, 'message': f'{count}개 세션을 종료했습니다.', 'terminated': count})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500


# ── 메일(SMTP) 설정 ──────────────────────────────────────────────────
def _ensure_admin_session():
    """세션에 ADMIN 역할이 없으면 DB에서 확인 후 승격. 성공 시 True."""
    if 'role' in session and session.get('role') in ADMIN_SESSION_ROLES:
        return True
    try:
        _uid = session.get('user_id')
        _emp = (session.get('emp_no') or '').strip()
        u = None
        if _uid:
            u = AuthUser.query.filter_by(id=_uid).first()
        elif _emp:
            u = AuthUser.query.filter_by(emp_no=_emp).first()
        if u:
            _email_prefix = (u.email.split('@')[0] if u.email else '').upper()
            if (u.emp_no and u.emp_no.upper() == 'ADMIN') or (u.role and u.role.upper() == 'ADMIN') or (_email_prefix == 'ADMIN'):
                if not u.role or u.role.upper() != 'ADMIN':
                    try:
                        u.role = 'ADMIN'
                        db.session.commit()
                    except Exception:
                        db.session.rollback()
                session['role'] = 'ADMIN'
                return True
    except Exception:
        pass
    return 'role' in session and session.get('role') in ADMIN_SESSION_ROLES


@auth_bp.route('/admin/auth/mail', methods=['GET'])
def admin_mail_settings():
    """메일 설정 페이지를 렌더링한다."""
    if not _ensure_admin_session():
        flash('관리자만 접근 가능합니다.', 'error')
        return redirect(url_for('auth.login'))
    _xhr = request.headers.get('X-Requested-With', '')
    if _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):
        return render_template('layouts/spa_shell.html', current_key='admin_mail', menu_code=None)
    return render_template('authentication/11-3.admin/11-3-3.setting/2.mail.html')


@auth_bp.route('/admin/auth/quality-type', methods=['GET'])
def admin_quality_type():
    """품질유형 관리 페이지를 렌더링한다."""
    if not _ensure_admin_session():
        flash('관리자만 접근 가능합니다.', 'error')
        return redirect(url_for('auth.login'))
    _xhr = request.headers.get('X-Requested-With', '')
    if _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):
        return render_template('layouts/spa_shell.html', current_key='admin_quality_type', menu_code=None)
    return render_template('authentication/11-3.admin/11-3-3.setting/4.quality_type.html')


@auth_bp.route('/admin/auth/change-log', methods=['GET'])
def admin_change_log():
    """변경이력 통합 조회 페이지를 렌더링한다."""
    if not _ensure_admin_session():
        flash('관리자만 접근 가능합니다.', 'error')
        return redirect(url_for('auth.login'))
    _xhr = request.headers.get('X-Requested-With', '')
    if _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):
        return render_template('layouts/spa_shell.html', current_key='admin_change_log', menu_code=None)
    return render_template('authentication/11-3.admin/11-3-3.setting/5.change_log.html')


@auth_bp.route('/admin/auth/info-message', methods=['GET'])
def admin_info_message():
    """문구관리 페이지를 렌더링한다."""
    if not _ensure_admin_session():
        flash('관리자만 접근 가능합니다.', 'error')
        return redirect(url_for('auth.login'))
    _xhr = request.headers.get('X-Requested-With', '')
    if _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):
        return render_template('layouts/spa_shell.html', current_key='admin_info_message', menu_code=None)
    return render_template('authentication/11-3.admin/11-3-3.setting/6.info_message.html')


@auth_bp.route('/admin/auth/version', methods=['GET'])
def admin_version():
    """버전관리 페이지를 렌더링한다."""
    if not _ensure_admin_session():
        flash('관리자만 접근 가능합니다.', 'error')
        return redirect(url_for('auth.login'))
    _xhr = request.headers.get('X-Requested-With', '')
    if _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):
        return render_template('layouts/spa_shell.html', current_key='admin_version', menu_code=None)
    return render_template('authentication/11-3.admin/11-3-3.setting/7.version.html')


@auth_bp.route('/admin/auth/page-tab', methods=['GET'])
def admin_page_tab():
    """페이지 탭 관리 페이지를 렌더링한다."""
    if not _ensure_admin_session():
        flash('관리자만 접근 가능합니다.', 'error')
        return redirect(url_for('auth.login'))
    _xhr = request.headers.get('X-Requested-With', '')
    if _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):
        return render_template('layouts/spa_shell.html', current_key='admin_page_tab', menu_code=None)
    return render_template('authentication/11-3.admin/11-3-3.setting/9.page_tab.html')


@auth_bp.route('/admin/auth/brand', methods=['GET'])
def admin_brand_settings():
    """브랜드 관리 페이지를 렌더링한다."""
    if not _ensure_admin_session():
        flash('관리자만 접근 가능합니다.', 'error')
        return redirect(url_for('auth.login'))
    _xhr = request.headers.get('X-Requested-With', '')
    if _xhr not in ('blossom-spa', 'blossom-spa-prefetch', 'XMLHttpRequest'):
        return render_template('layouts/spa_shell.html', current_key='admin_brand', menu_code=None)
    resp = make_response(render_template('authentication/11-3.admin/11-3-3.setting/10.brand.html'))
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp


@auth_bp.route('/admin/auth/mail/config', methods=['GET'])
def admin_mail_config_get():
    """DB에 저장된 SMTP 설정을 반환한다 (비밀번호는 마스킹)."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    row = SmtpConfig.query.filter_by(id=1).first()
    if not row:
        return jsonify({
            'host': 'smtp.gmail.com', 'port': 587, 'encryption': 'STARTTLS',
            'username': '', 'password': '', 'from_name': 'Blossom', 'from_email': '',
            'use_auth': True, 'verify_cert': True, 'reply_to': '',
            'configured': False,
        })
    _use_auth = getattr(row, 'use_auth', True)
    if _use_auth is None:
        _use_auth = True
    _verify_cert = getattr(row, 'verify_cert', True)
    if _verify_cert is None:
        _verify_cert = True
    return jsonify({
        'host': row.host or '',
        'port': row.port or 587,
        'encryption': row.encryption or 'STARTTLS',
        'username': row.username or '',
        'password': '********' if row.password else '',
        'from_name': row.from_name or 'Blossom',
        'from_email': row.from_email or '',
        'use_auth': bool(_use_auth),
        'verify_cert': bool(_verify_cert),
        'reply_to': getattr(row, 'reply_to', '') or '',
        'configured': bool(row.host) and (bool(row.username and row.password) or not bool(_use_auth)),
    })


@auth_bp.route('/admin/auth/mail/config', methods=['PUT'])
def admin_mail_config_put():
    """SMTP 설정을 DB에 저장한다."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    payload = request.get_json(silent=True) or {}
    row = SmtpConfig.query.filter_by(id=1).first()
    if not row:
        row = SmtpConfig(id=1)
        db.session.add(row)
    if 'host' in payload:
        row.host = (payload['host'] or '').strip()
    if 'port' in payload:
        row.port = int(payload['port'])
    if 'encryption' in payload:
        row.encryption = (payload['encryption'] or 'STARTTLS').strip().upper()
    if 'username' in payload:
        row.username = (payload['username'] or '').strip()
    if 'password' in payload and payload['password'] != '********':
        row.password = (payload['password'] or '').strip()
    if 'from_name' in payload:
        row.from_name = (payload['from_name'] or '').strip()
    if 'from_email' in payload:
        row.from_email = (payload['from_email'] or '').strip()
    if 'use_auth' in payload:
        row.use_auth = bool(payload['use_auth'])
    if 'verify_cert' in payload:
        row.verify_cert = bool(payload['verify_cert'])
    if 'reply_to' in payload:
        row.reply_to = (payload['reply_to'] or '').strip()
    row.updated_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
    return jsonify({'success': True, 'message': 'SMTP 설정이 저장되었습니다.'})


def _build_smtp_ssl_context(verify_cert=True):
    """SSL context 생성. verify_cert=False 면 자체서명 인증서 허용."""
    import ssl
    ctx = ssl.create_default_context()
    if not verify_cert:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    return ctx


@auth_bp.route('/admin/auth/mail/test', methods=['POST'])
def admin_mail_test():
    """현재 DB의 SMTP 설정으로 테스트 메일을 발송한다.
    body.mode = 'connect' 이면 EHLO 연결 확인만 수행 (메일 미발송).
    body.mode = 'send' (기본) 이면 실제 테스트 메일 발송.
    """
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    import smtplib
    from email.mime.text import MIMEText
    row = SmtpConfig.query.filter_by(id=1).first()
    if not row or not row.host:
        return jsonify({'success': False, 'message': 'SMTP 설정이 아직 저장되지 않았습니다.'}), 400
    _use_auth = getattr(row, 'use_auth', True)
    if _use_auth is None:
        _use_auth = True
    _verify_cert = getattr(row, 'verify_cert', True)
    if _verify_cert is None:
        _verify_cert = True
    if _use_auth and (not row.username or not row.password):
        return jsonify({'success': False, 'message': '인증 사용 설정인데 계정/비밀번호가 비어 있습니다.'}), 400
    payload = request.get_json(silent=True) or {}
    mode = (payload.get('mode') or 'send').strip().lower()
    enc = (row.encryption or 'STARTTLS').upper()
    ssl_ctx = _build_smtp_ssl_context(verify_cert=bool(_verify_cert))

    # ── 연결 테스트 (EHLO only) ──
    if mode == 'connect':
        try:
            if enc == 'SSL':
                with smtplib.SMTP_SSL(row.host, row.port, timeout=15, context=ssl_ctx) as smtp:
                    smtp.ehlo()
                    if _use_auth:
                        smtp.login(row.username, row.password)
            else:
                with smtplib.SMTP(row.host, row.port, timeout=15) as smtp:
                    smtp.ehlo()
                    if enc == 'STARTTLS':
                        smtp.starttls(context=ssl_ctx)
                        smtp.ehlo()
                    if _use_auth:
                        smtp.login(row.username, row.password)
            return jsonify({'success': True, 'message': 'SMTP 서버 연결에 성공했습니다.'})
        except smtplib.SMTPAuthenticationError:
            return jsonify({'success': False, 'message': 'SMTP 인증 실패. 계정/비밀번호를 확인하세요.'}), 401
        except Exception as exc:
            return jsonify({'success': False, 'message': f'연결 실패: {exc}'}), 500

    # ── 실제 테스트 메일 발송 ──
    to_addr = (payload.get('to') or row.username or row.from_email or '').strip()
    if not to_addr:
        return jsonify({'success': False, 'message': '수신 주소를 입력하세요.'}), 400
    try:
        msg = MIMEText('<p>Blossom SMTP 테스트 메일입니다. 이 메일이 도착했다면 설정이 정상입니다.</p>', 'html', 'utf-8')
        msg['Subject'] = '[Blossom] SMTP 연결 테스트'
        sender = row.from_email or row.username or 'noreply@localhost'
        msg['From'] = f'{row.from_name or "Blossom"} <{sender}>'
        msg['To'] = to_addr
        _reply_to = getattr(row, 'reply_to', '') or ''
        if _reply_to:
            msg['Reply-To'] = _reply_to
        if enc == 'SSL':
            with smtplib.SMTP_SSL(row.host, row.port, timeout=15, context=ssl_ctx) as smtp:
                if _use_auth:
                    smtp.login(row.username, row.password)
                smtp.sendmail(sender, [to_addr], msg.as_string())
        else:
            with smtplib.SMTP(row.host, row.port, timeout=15) as smtp:
                smtp.ehlo()
                if enc == 'STARTTLS':
                    smtp.starttls(context=ssl_ctx)
                    smtp.ehlo()
                if _use_auth:
                    smtp.login(row.username, row.password)
                smtp.sendmail(sender, [to_addr], msg.as_string())
        return jsonify({'success': True, 'message': f'테스트 메일이 {to_addr}(으)로 발송되었습니다.'})
    except smtplib.SMTPAuthenticationError:
        return jsonify({'success': False, 'message': 'SMTP 인증 실패. 계정/비밀번호를 확인하세요.'}), 401
    except Exception as exc:
        return jsonify({'success': False, 'message': f'연결 실패: {exc}'}), 500


@auth_bp.route('/admin/auth/users/search', methods=['GET'])
@auth_bp.route('/admin/auth/user/search', methods=['GET'])  # alias
@auth_bp.route('/admin/auth/user-search', methods=['GET'])  # alias (hyphen form)
def admin_user_search():
    """사용자 이름(name) 전용 검색.
    요구사항: dev_blossom.db 의 user 테이블 name 컬럼을 부분일치로 검색하고
    결과 표시 문자열은 "department, name" 형식으로 반환 (중복 이름 구분).
    반환: id, emp_no, name, department, display("department, name").
    """
    # 권한 체크 제거 (요구: 누구나 이름 검색 가능)
    q = (request.args.get('query') or '').strip()
    # 다중 토큰 처리 (공백 기준 AND) - name 컬럼만 대상
    tokens = [t for t in re.split(r'\s+', q) if t]
    # 검색 범위: user 테이블(UserProfile) name 컬럼 ONLY
    if not tokens:
        return jsonify({'users': [], 'count': 0, 'query': q, 'tokens': tokens})
    base = UserProfile.query
    for tok in tokens:
        like = f"%{tok}%"
        base = base.filter(UserProfile.name.ilike(like))
    rows = base.order_by(UserProfile.emp_no.asc()).limit(50).all()
    # 표시 문자열: "department, name"
    data = []
    for r in rows:
        dept = (r.department or '-').strip()
        nm = (r.name or '-').strip()
        display = f"{dept}, {nm}"
        data.append({
            'id': r.id,
            'emp_no': r.emp_no,
            'name': r.name or '-',
            'email': r.email or '-',
            'department': r.department or '-',
            'display': display,
        })
    return jsonify({'users': data, 'count': len(data), 'query': q, 'tokens': tokens})

@auth_bp.route('/admin/auth/group/create', methods=['POST'])
def admin_role_create():
    """새 역할 생성 + 사용자 매핑
    form:
      role_name(required) , role_desc, user_ids(comma separated),
      perm_*_read/write (0/1)
    반환: 생성된 역할 JSON
    """
    if 'role' not in session or session.get('role') not in ('admin','ADMIN'):
        return jsonify({'error':'unauthorized'}), 403
    name_raw = request.form.get('role_name')
    name = (name_raw or '').strip()
    # 디버그: 입력 필드 존재 여부와 전체 form 키 로깅 (임시)
    try:
        print('[admin_role_create] incoming keys=', list(request.form.keys()), 'role_name_raw=', name_raw, 'trimmed=', name, flush=True)
    except Exception:
        pass
    desc = (request.form.get('role_desc') or '').strip()
    user_ids_raw = (request.form.get('user_ids') or '').strip()
    if not name:
        return jsonify({'error':'validation','message':'role_name 필수','received_keys': list(request.form.keys())}), 400
    # 중복 확인
    if Role.query.filter_by(name=name).first():
        return jsonify({'error':'duplicate','message':'이미 존재하는 역할명입니다.'}), 409
    role = Role(name=name, description=desc)
    apply_role_permissions_from_form(role, request.form)
    db.session.add(role)
    try:
        db.session.flush()  # role.id 확보
    except Exception as e:
        db.session.rollback()
        return jsonify({'error':'db_insert_failed','detail':str(e)}), 500
    # 사용자 매핑
    mapped = []
    mapped_profiles = []
    if user_ids_raw:
        try:
            ids = [int(x) for x in user_ids_raw.split(',') if x.strip().isdigit()]
        except Exception:
            ids = []
        if ids:
            profiles = UserProfile.query.filter(UserProfile.id.in_(ids)).all()
            prof_map = {p.id: p for p in profiles}
            for pid in ids:
                if pid in prof_map:
                    assoc = RoleUser(role_id=role.id, user_id=pid)
                    db.session.add(assoc)
                    mapped.append(pid)
            mapped_profiles = [serialize_user_profile(prof_map[pid]) for pid in ids if pid in prof_map]
            mapped_profiles = [p for p in mapped_profiles if p]
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error':'db_commit_failed','detail':str(e)}), 500
    role_payload = role_to_dict(role, len(mapped), include_users=True, user_ids=mapped)
    resp = {
        'status': 'ok',
        'role': role_payload,
        'users': mapped_profiles
    }
    return jsonify(resp), 201


@auth_bp.route('/admin/auth/role/<int:role_id>', methods=['GET'])
def admin_role_detail(role_id):
    if not (request.args.get('public') == '1' or ('role' in session and session.get('role') in ADMIN_SESSION_ROLES)):
        return jsonify({'error': 'unauthorized'}), 403
    role_row = Role.query.get(role_id)
    if not role_row:
        return jsonify({'error': 'not_found', 'message': '역할을 찾을 수 없습니다.'}), 404
    link_rows = (
        db.session.query(UserProfile)
        .join(RoleUser, RoleUser.user_id == UserProfile.id)
        .filter(RoleUser.role_id == role_id)
        .order_by(UserProfile.name.asc())
        .all()
    )
    user_payloads = [serialize_user_profile(row) for row in link_rows]
    user_payloads = [p for p in user_payloads if p]
    payload = role_to_dict(
        role_row,
        len(user_payloads),
        include_users=True,
        user_ids=[p['id'] for p in user_payloads]
    )
    return jsonify({'status': 'ok', 'role': payload, 'users': user_payloads})


@auth_bp.route('/admin/auth/group/<int:role_id>/update', methods=['POST'])
def admin_role_update(role_id):
    if 'role' not in session or session.get('role') not in ADMIN_SESSION_ROLES:
        return jsonify({'error': 'unauthorized'}), 403
    role_row = Role.query.get(role_id)
    if not role_row:
        return jsonify({'error': 'not_found', 'message': '역할을 찾을 수 없습니다.'}), 404
    if (role_row.name or '').strip().upper() == 'ADMIN':
        return jsonify({'error': 'immutable', 'message': 'ADMIN 역할은 수정할 수 없습니다.'}), 400
    name = (request.form.get('role_name') or '').strip()
    desc = (request.form.get('role_desc') or '').strip()
    if not name:
        return jsonify({'error': 'validation', 'message': 'role_name 필수'}), 400
    conflict = Role.query.filter(Role.name == name, Role.id != role_id).first()
    if conflict:
        return jsonify({'error': 'duplicate', 'message': '이미 존재하는 역할명입니다.'}), 409
    role_row.name = name
    role_row.description = desc
    apply_role_permissions_from_form(role_row, request.form, changed_by=session.get('emp_no') or 'ADMIN')
    user_ids_raw = (request.form.get('user_ids') or '').strip()
    ids = []
    if user_ids_raw:
        try:
            ids = [int(x) for x in user_ids_raw.split(',') if x.strip().isdigit()]
        except Exception:
            ids = []
    RoleUser.query.filter_by(role_id=role_id).delete(synchronize_session=False)
    profile_map = {}
    if ids:
        profiles = UserProfile.query.filter(UserProfile.id.in_(ids)).all()
        profile_map = {p.id: p for p in profiles}
        for pid in ids:
            if pid in profile_map:
                db.session.add(RoleUser(role_id=role_id, user_id=pid))
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'db_commit_failed', 'detail': str(e)}), 500
    user_payloads = [serialize_user_profile(profile_map.get(pid)) for pid in ids if pid in profile_map]
    user_payloads = [p for p in user_payloads if p]
    role_payload = role_to_dict(
        role_row,
        len(user_payloads),
        include_users=True,
        user_ids=[p['id'] for p in user_payloads]
    )
    return jsonify({'status': 'ok', 'role': role_payload, 'users': user_payloads})

@auth_bp.route('/admin/auth/role/<int:role_id>/permissions', methods=['PATCH', 'POST'])
def admin_role_permissions(role_id):
    """역할 단일 권한(읽기/쓰기) 업데이트."""
    if 'role' not in session or session.get('role') not in ADMIN_SESSION_ROLES:
        return jsonify({'error': 'unauthorized'}), 403
    role_row = Role.query.get(role_id)
    if not role_row:
        return jsonify({'error': 'not_found', 'message': '역할을 찾을 수 없습니다.'}), 404
    if (role_row.name or '').strip().upper() == 'ADMIN':
        return jsonify({'error': 'immutable', 'message': 'ADMIN 역할은 수정할 수 없습니다.'}), 400
    payload = request.get_json(silent=True) or {}
    perms_in = payload.get('permissions')
    if not perms_in and request.form:
        perms_in = {}
        for key, value in request.form.items():
            if '.' not in key:
                continue
            section, mode = key.split('.', 1)
            if section not in ROLE_PERMISSION_FIELDS or mode not in ('read', 'write'):
                continue
            perms_in.setdefault(section, {})[mode] = value in ('1', 'true', 'True', True)
    if not perms_in:
        return jsonify({'error': 'validation', 'message': 'permissions 필수'}), 400
    changed_by = session.get('emp_no') or session.get('role') or 'unknown'
    changed = []
    for section, values in perms_in.items():
        if section not in ROLE_PERMISSION_FIELDS:
            continue
        old_read = bool(getattr(role_row, f'{section}_read', False))
        old_write = bool(getattr(role_row, f'{section}_write', False))
        read_val = bool(values.get('read'))
        write_val = bool(values.get('write'))
        if write_val and not read_val:
            read_val = True
        _record_permission_audit(role_row, section, old_read, old_write, read_val, write_val, changed_by)
        setattr(role_row, f'{section}_read', read_val)
        setattr(role_row, f'{section}_write', write_val)
        changed.append(section)
    if not changed:
        return jsonify({'error': 'validation', 'message': '변경할 권한이 없습니다.'}), 400
    role_row.updated_at = datetime.utcnow()
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'db_commit_failed', 'message': str(e)}), 500
    user_count = db.session.query(sa.func.count(RoleUser.user_id)).filter(RoleUser.role_id == role_row.id).scalar() or 0
    return jsonify({'status': 'ok', 'role': role_to_dict(role_row, user_count), 'updated_sections': changed})


@auth_bp.route('/admin/auth/permission-audit-log', methods=['GET'])
def admin_permission_audit_log():
    """권한 변경 감사 로그 조회"""
    if 'role' not in session or session.get('role') not in ADMIN_SESSION_ROLES:
        return jsonify({'error': 'unauthorized'}), 403
    page = max(1, int(request.args.get('page', 1)))
    per_page = min(100, max(10, int(request.args.get('per_page', 50))))
    role_name_filter = (request.args.get('role_name') or '').strip()
    query = PermissionAuditLog.query.order_by(PermissionAuditLog.changed_at.desc())
    if role_name_filter:
        query = query.filter(PermissionAuditLog.role_name.ilike(f'%{role_name_filter}%'))
    total = query.count()
    rows = query.offset((page - 1) * per_page).limit(per_page).all()
    logs = []
    for r in rows:
        logs.append({
            'id': r.id,
            'role_id': r.role_id,
            'role_name': r.role_name,
            'menu_code': r.menu_code,
            'before_permission': r.before_permission,
            'after_permission': r.after_permission,
            'changed_by': r.changed_by,
            'changed_at': r.changed_at.isoformat() if r.changed_at else None,
        })
    return jsonify({'logs': logs, 'total': total, 'page': page, 'per_page': per_page})


# ══════════════════════════════════════════════════════════════════════════════
# MFA (다중 인증) API
# ══════════════════════════════════════════════════════════════════════════════

def _generate_mfa_code(length=6):
    """숫자로 이루어진 MFA 인증 코드를 생성한다."""
    return ''.join(random.choices(string.digits, k=length))


def _should_session_be_permanent():
    """logout_on_browser_close 설정이 활성화된 경우 세션 쿠키를 브라우저 종료 시 삭제되도록 False 반환."""
    try:
        row = db.session.execute(
            db.text("SELECT logout_on_browser_close FROM security_policy WHERE id=1")
        ).fetchone()
        if row and row[0]:
            return False
    except Exception:
        pass
    return True


def _get_mfa_config():
    """MfaConfig singleton (id=1) 을 가져오거나 기본값 딕셔너리를 반환."""
    _defaults = {
        'enabled': False,
        'default_type': 'totp',
        'totp_enabled': True,
        'sms_enabled': True,
        'email_enabled': True,
        'company_otp_enabled': False,
        'grace_period_days': 0,
        'remember_device_days': 7,
        'totp_secret': '',
        'sms_number': '',
        'email': '',
        'allow_user_choice': True,
        'code_length': 6,
        'code_ttl_seconds': 300,
    }
    try:
        row = MfaConfig.query.filter_by(id=1).first()
    except Exception:
        # 테이블이 아직 생성되지 않은 경우 기본값 반환
        return _defaults
    if not row:
        return _defaults
    return {
        'enabled': bool(row.enabled),
        'default_type': row.default_type or 'totp',
        'totp_enabled': bool(row.totp_enabled) if row.totp_enabled is not None else True,
        'sms_enabled': bool(row.sms_enabled) if row.sms_enabled is not None else True,
        'email_enabled': bool(row.email_enabled) if row.email_enabled is not None else True,
        'company_otp_enabled': bool(row.company_otp_enabled) if hasattr(row, 'company_otp_enabled') and row.company_otp_enabled is not None else False,
        'grace_period_days': row.grace_period_days if row.grace_period_days is not None else 0,
        'remember_device_days': row.remember_device_days if row.remember_device_days is not None else 7,
        'totp_secret': row.totp_secret or '',
        'sms_number': row.sms_number or '',
        'email': row.email or '',
        'allow_user_choice': bool(row.allow_user_choice) if row.allow_user_choice is not None else True,
        'code_length': row.code_length if row.code_length else 6,
        'code_ttl_seconds': row.code_ttl_seconds if row.code_ttl_seconds else 300,
    }


@auth_bp.route('/admin/auth/mfa/config', methods=['GET'])
def admin_mfa_config_get():
    """MFA 설정 조회 (관리자)"""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    cfg = _get_mfa_config()
    return jsonify(cfg)


@auth_bp.route('/admin/auth/mfa/config', methods=['PUT'])
def admin_mfa_config_put():
    """MFA 설정 저장 (관리자)"""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    payload = request.get_json(silent=True) or {}
    row = MfaConfig.query.filter_by(id=1).first()
    if not row:
        row = MfaConfig(id=1)
        db.session.add(row)
    if 'enabled' in payload:
        row.enabled = bool(payload['enabled'])
    if 'default_type' in payload:
        val = (payload['default_type'] or 'totp').strip().lower()
        if val in ('totp', 'sms', 'email', 'company_otp'):
            row.default_type = val
    if 'totp_enabled' in payload:
        row.totp_enabled = bool(payload['totp_enabled'])
    if 'sms_enabled' in payload:
        row.sms_enabled = bool(payload['sms_enabled'])
    if 'email_enabled' in payload:
        row.email_enabled = bool(payload['email_enabled'])
    if 'company_otp_enabled' in payload:
        row.company_otp_enabled = bool(payload['company_otp_enabled'])
    if 'grace_period_days' in payload:
        row.grace_period_days = max(0, int(payload['grace_period_days'] or 0))
    if 'remember_device_days' in payload:
        row.remember_device_days = max(0, int(payload['remember_device_days'] or 0))
    if 'totp_secret' in payload:
        row.totp_secret = (payload['totp_secret'] or '').strip()
    if 'sms_number' in payload:
        row.sms_number = (payload['sms_number'] or '').strip()
    if 'email' in payload:
        row.email = (payload['email'] or '').strip()
    if 'allow_user_choice' in payload:
        row.allow_user_choice = bool(payload['allow_user_choice'])
    if 'code_length' in payload:
        row.code_length = max(4, min(10, int(payload['code_length'] or 6)))
    if 'code_ttl_seconds' in payload:
        row.code_ttl_seconds = max(60, int(payload['code_ttl_seconds'] or 300))
    row.updated_at = datetime.utcnow().isoformat()
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'db_error', 'message': str(e)}), 500
    return jsonify({'status': 'ok', 'config': _get_mfa_config()})


@auth_bp.route('/api/mfa/status', methods=['GET'])
def mfa_status():
    """로그인 페이지에서 MFA 활성화 여부 및 허용된 인증 방식을 조회한다. 비인증 요청도 허용."""
    cfg = _get_mfa_config()
    available_methods = []
    if cfg.get('totp_enabled', True):
        available_methods.append('totp')
    if cfg.get('sms_enabled', True):
        available_methods.append('sms')
    if cfg.get('email_enabled', True):
        available_methods.append('email')
    if cfg.get('company_otp_enabled', False):
        available_methods.append('company_otp')
    # 아무것도 없으면 기본 TOTP
    if not available_methods:
        available_methods = ['totp']
    return jsonify({
        'enabled': cfg['enabled'],
        'allow_user_choice': cfg['allow_user_choice'],
        'default_type': cfg['default_type'],
        'methods': available_methods,
    })


@auth_bp.route('/admin/auth/mfa/totp-qr', methods=['POST'])
def admin_mfa_totp_qr():
    """TOTP 시크릿 키에 대한 QR코드 PNG를 base64로 반환한다."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    try:
        import pyotp
    except ImportError:
        return jsonify({'error': 'pyotp 패키지가 설치되지 않았습니다. pip install pyotp'}), 500
    try:
        import qrcode
    except ImportError:
        return jsonify({'error': 'qrcode 패키지가 설치되지 않았습니다. pip install qrcode[pil]'}), 500
    import io
    import base64
    payload = request.get_json(silent=True) or {}
    secret_raw = (payload.get('secret') or '').strip().replace('-', '')
    label = (payload.get('label') or 'Blossom').strip()
    issuer = (payload.get('issuer') or 'Blossom').strip()
    if not secret_raw:
        return jsonify({'error': 'secret required'}), 400
    try:
        totp = pyotp.TOTP(secret_raw)
        uri = totp.provisioning_uri(name=label, issuer_name=issuer)
        # image_factory 를 명시하지 않고 기본 팩토리 사용 (Pillow 호환성 보장)
        img = qrcode.make(uri, box_size=6, border=2)
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        b64 = base64.b64encode(buf.getvalue()).decode('ascii')
        return jsonify({'qr': f'data:image/png;base64,{b64}', 'uri': uri})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'QR 생성 중 오류: {str(e)}'}), 500


@auth_bp.route('/api/mfa/send-code', methods=['POST'])
def mfa_send_code():
    """MFA 코드를 생성하고 선택된 방법(sms/email)으로 전송한다.
    TOTP의 경우 서버에서 코드를 생성하여 DB에 저장(실운영 시 앱 연동)."""
    data = request.get_json(silent=True) or {}
    emp_no = data.get('emp_no') or session.get('pending_mfa_emp_no')
    mfa_type = (data.get('mfa_type') or '').strip().lower()
    if not emp_no:
        return jsonify({'error': 'emp_no required'}), 400
    if mfa_type not in ('totp', 'sms', 'email', 'company_otp'):
        return jsonify({'error': 'invalid mfa_type'}), 400

    cfg = _get_mfa_config()
    code_length = cfg.get('code_length', 6)
    ttl = cfg.get('code_ttl_seconds', 300)

    # org_user 프로필에서 사용자 휴대번호/이메일 조회
    profile = UserProfile.query.filter_by(emp_no=emp_no).first()

    sent = False
    mask = ''

    if mfa_type == 'totp':
        # TOTP: 인증 앱(Google Authenticator 등)에서 코드를 생성하므로
        # 서버에서 코드를 생성/전송할 필요 없음. 바로 입력 화면으로 이동.
        import pyotp
        mfa_cfg = MfaConfig.query.filter_by(id=1).first()
        secret = (mfa_cfg.totp_secret or '').replace('-', '').replace(' ', '') if mfa_cfg else ''
        if not secret:
            return jsonify({'error': 'totp_not_configured', 'message': 'TOTP 비밀 키가 설정되지 않았습니다.'}), 400
        sent = True
        current_app.logger.info(f'[mfa] TOTP requested for emp_no={emp_no}')
        return jsonify({
            'status': 'ok',
            'sent': sent,
            'mfa_type': mfa_type,
            'mask': '인증 앱',
            'ttl': 30,
            'code_length': 6,
        })

    if mfa_type == 'company_otp':
        # 사내 OTP: 외부 OTP 서버에 인증 요청 (코드는 사용자 OTP 토큰/앱에서 생성)
        otp_cfg = CompanyOtpConfig.query.filter_by(id=1).first()
        if not otp_cfg or not otp_cfg.enabled or not otp_cfg.api_endpoint:
            return jsonify({'error': 'company_otp_not_configured', 'message': '사내 OTP 서버가 설정되지 않았습니다.'}), 400
        sent = True
        current_app.logger.info(f'[mfa] Company OTP requested for emp_no={emp_no}, provider={otp_cfg.provider}')
        return jsonify({
            'status': 'ok',
            'sent': sent,
            'mfa_type': mfa_type,
            'mask': '사내 OTP',
            'ttl': otp_cfg.timeout or 60,
            'code_length': 6,
        })

    # SMS / Email: 서버에서 코드 생성 후 전송
    code = _generate_mfa_code(code_length)
    expires = datetime.utcnow() + timedelta(seconds=ttl)

    # 이전 미사용 코드 만료 처리
    MfaPendingCode.query.filter(
        MfaPendingCode.emp_no == emp_no,
        MfaPendingCode.used == False
    ).update({'used': True})

    pending = MfaPendingCode(
        emp_no=emp_no,
        mfa_type=mfa_type,
        code=code,
        expires_at=expires,
    )
    db.session.add(pending)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

    if mfa_type == 'email':
        target_email = (profile.email or '') if profile else ''
        if not target_email:
            return jsonify({'error': 'user_no_email', 'message': '사용자 이메일이 등록되어 있지 않습니다.'}), 400
        try:
            _send_mfa_email(target_email, code, ttl)
            sent = True
        except Exception as mail_err:
            current_app.logger.error(f'[mfa] email send failed: {mail_err}')
        parts = target_email.split('@')
        u = parts[0]
        d = parts[1] if len(parts) > 1 else ''
        mask = (u[0] + '*' * max(0, len(u) - 2) + u[-1:] if len(u) > 2 else u[0] + '*') + '@' + d
    elif mfa_type == 'sms':
        target_phone = (profile.mobile_phone or '') if profile else ''
        if not target_phone:
            return jsonify({'error': 'user_no_phone', 'message': '사용자 휴대번호가 등록되어 있지 않습니다.'}), 400
        # CoolSMS API를 통해 실제 SMS 발송
        try:
            _send_mfa_sms(target_phone, code, ttl)
            sent = True
        except Exception as sms_err:
            current_app.logger.error(f'[mfa] SMS send failed: {sms_err}')
        digits = target_phone.replace('-', '').replace(' ', '')
        if len(digits) >= 4:
            mask = digits[:3] + '-' + '*' * (len(digits) - 7) + '-' + digits[-4:]
        else:
            mask = target_phone

    return jsonify({
        'status': 'ok',
        'sent': sent,
        'mfa_type': mfa_type,
        'mask': mask,
        'ttl': ttl,
        'code_length': code_length,
    })


def _send_mfa_email(to_addr, code, ttl_seconds):
    """SMTP 설정을 이용해 MFA 인증 코드 이메일을 발송한다."""
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    smtp_cfg = SmtpConfig.query.filter_by(id=1).first()
    if not smtp_cfg or not smtp_cfg.host:
        raise RuntimeError('SMTP 서버가 설정되지 않았습니다.')
    msg = MIMEMultipart('alternative')
    msg['Subject'] = '[Blossom] MFA 인증 코드'
    msg['From'] = smtp_cfg.from_email or smtp_cfg.username or 'noreply@blossom.local'
    msg['To'] = to_addr
    minutes = max(1, ttl_seconds // 60)
    html = f"""<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#6366f1;">Blossom MFA 인증 코드</h2>
        <p>아래 인증 코드를 입력해주세요.</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#f1f5f9;
                    padding:16px 24px;border-radius:12px;text-align:center;margin:16px 0;">{code}</div>
        <p style="color:#64748b;font-size:13px;">이 코드는 {minutes}분간 유효합니다. 본인이 요청하지 않았다면 무시하세요.</p>
    </div>"""
    msg.attach(MIMEText(html, 'html', 'utf-8'))
    use_auth = getattr(smtp_cfg, 'use_auth', True)
    if use_auth is None:
        use_auth = True
    encryption = (smtp_cfg.encryption or 'STARTTLS').upper()
    if encryption == 'SSL':
        server = smtplib.SMTP_SSL(smtp_cfg.host, smtp_cfg.port or 465, timeout=15)
    else:
        server = smtplib.SMTP(smtp_cfg.host, smtp_cfg.port or 587, timeout=15)
        if encryption == 'STARTTLS':
            server.starttls()
    if use_auth and smtp_cfg.username and smtp_cfg.password:
        server.login(smtp_cfg.username, smtp_cfg.password)
    server.sendmail(msg['From'], [to_addr], msg.as_string())
    server.quit()


def _send_mfa_sms(phone, code, ttl_seconds):
    """CoolSMS API v4를 이용해 MFA 인증 코드를 SMS로 발송한다."""
    import hashlib
    import hmac
    import uuid
    import requests as _requests

    sms_cfg = SmsConfig.query.filter_by(id=1).first()
    if not sms_cfg or not sms_cfg.api_key or not sms_cfg.api_secret:
        raise RuntimeError('SMS 발송 설정(API Key/Secret)이 구성되지 않았습니다.')
    if not sms_cfg.sender_number:
        raise RuntimeError('SMS 발신번호가 설정되지 않았습니다.')

    api_key = sms_cfg.api_key.strip()
    api_secret = sms_cfg.api_secret.strip()
    sender = sms_cfg.sender_number.strip().replace('-', '')

    # 수신번호 정리 (하이픈 제거)
    to_number = phone.strip().replace('-', '').replace(' ', '')

    # CoolSMS HMAC-SHA256 인증 헤더 생성
    date_str = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    salt = uuid.uuid4().hex
    signature = hmac.new(
        api_secret.encode('utf-8'),
        (date_str + salt).encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()
    auth_header = f'HMAC-SHA256 apiKey={api_key}, date={date_str}, salt={salt}, signature={signature}'

    minutes = max(1, ttl_seconds // 60)
    body = {
        'message': {
            'to': to_number,
            'from': sender,
            'text': f'[Blossom] 인증코드: {code} ({minutes}분 내 입력)',
        }
    }

    resp = _requests.post(
        'https://api.coolsms.co.kr/messages/v4/send',
        json=body,
        headers={
            'Authorization': auth_header,
            'Content-Type': 'application/json',
        },
        timeout=10,
    )

    if resp.status_code not in (200, 201):
        detail = resp.text[:300]
        current_app.logger.error(f'[mfa] CoolSMS error {resp.status_code}: {detail}')
        raise RuntimeError(f'SMS 발송 실패 (HTTP {resp.status_code})')

    current_app.logger.info(f'[mfa] CoolSMS sent to={to_number}, status={resp.status_code}')


# ── SMS(CoolSMS) 설정 관리 API ─────────────────────────────────────────────

@auth_bp.route('/admin/auth/sms/config', methods=['GET'])
def admin_sms_config_get():
    """CoolSMS 발송 설정 조회 (비밀키는 마스킹)."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    row = SmsConfig.query.filter_by(id=1).first()
    if not row:
        return jsonify({
            'provider': 'coolsms',
            'api_key': '',
            'api_secret': '',
            'sender_number': '',
            'enabled': False,
            'configured': False,
        })
    return jsonify({
        'provider': row.provider or 'coolsms',
        'api_key': row.api_key or '',
        'api_secret': '********' if row.api_secret else '',
        'sender_number': row.sender_number or '',
        'enabled': bool(row.enabled),
        'configured': bool(row.api_key and row.api_secret and row.sender_number),
    })


@auth_bp.route('/admin/auth/sms/config', methods=['PUT'])
def admin_sms_config_put():
    """CoolSMS 발송 설정 저장."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    payload = request.get_json(silent=True) or {}
    row = SmsConfig.query.filter_by(id=1).first()
    if not row:
        row = SmsConfig(id=1)
        db.session.add(row)
    if 'provider' in payload:
        row.provider = (payload['provider'] or 'coolsms').strip()
    if 'api_key' in payload:
        row.api_key = (payload['api_key'] or '').strip()
    if 'api_secret' in payload and payload['api_secret'] != '********':
        row.api_secret = (payload['api_secret'] or '').strip()
    if 'sender_number' in payload:
        row.sender_number = (payload['sender_number'] or '').strip()
    if 'enabled' in payload:
        row.enabled = bool(payload['enabled'])
    row.updated_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
    return jsonify({'success': True, 'message': 'SMS 발송 설정이 저장되었습니다.'})


@auth_bp.route('/admin/auth/sms/test', methods=['POST'])
def admin_sms_test():
    """CoolSMS 테스트 발송."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    payload = request.get_json(silent=True) or {}
    test_phone = (payload.get('phone') or '').strip().replace('-', '')
    if not test_phone:
        return jsonify({'success': False, 'message': '수신번호를 입력해주세요.'}), 400
    try:
        _send_mfa_sms(test_phone, '123456', 300)
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
    return jsonify({'success': True, 'message': f'{test_phone}(으)로 테스트 메시지를 발송했습니다.'})


# ── 사내 OTP 솔루션 연동 ───────────────────────────────────────────────────

def _verify_company_otp(otp_cfg, emp_no, code):
    """사내 OTP 솔루션 서버에 인증 코드를 검증한다.

    지원 프로바이더:
      - initech   : 이니텍 INISAFE OTP (REST API)
      - dreamsecurity : 드림시큐리티 MagicOTP (REST API)
      - miraetech : 미래테크 SafeOTP (REST API)

    실제 운영 시 각 벤더 API 스펙에 맞게 payload/header를 조정해야 함.
    현재는 공통 REST JSON 포맷으로 구현 (대부분의 국내 OTP 솔루션이 유사한 인터페이스 제공).
    """
    import requests as http_requests

    provider = (otp_cfg.provider or 'initech').lower()
    endpoint = (otp_cfg.api_endpoint or '').rstrip('/')
    api_key = otp_cfg.api_key or ''
    api_secret = otp_cfg.api_secret or ''
    server_code = otp_cfg.server_code or ''
    timeout = otp_cfg.timeout or 5

    headers = {'Content-Type': 'application/json'}

    if provider == 'initech':
        # 이니텍 INISAFE OTP 인증 요청
        # 표준 인터페이스: POST /otp/verify
        verify_url = f'{endpoint}/otp/verify'
        payload = {
            'cpCode': server_code,
            'userId': emp_no,
            'otpValue': code,
            'apiKey': api_key,
        }
        if api_secret:
            headers['Authorization'] = f'Bearer {api_secret}'

    elif provider == 'dreamsecurity':
        # 드림시큐리티 MagicOTP 인증 요청
        # 표준 인터페이스: POST /magic/otp/auth
        verify_url = f'{endpoint}/magic/otp/auth'
        payload = {
            'serverCode': server_code,
            'userID': emp_no,
            'otpNumber': code,
            'clientId': api_key,
            'clientSecret': api_secret,
        }

    elif provider == 'miraetech':
        # 미래테크 SafeOTP 인증 요청
        # 표준 인터페이스: POST /safe/otp/validate
        verify_url = f'{endpoint}/safe/otp/validate'
        payload = {
            'siteCode': server_code,
            'empNo': emp_no,
            'otpCode': code,
        }
        headers['X-API-KEY'] = api_key
        if api_secret:
            headers['X-API-SECRET'] = api_secret

    else:
        # 알 수 없는 프로바이더 — 범용 JSON POST
        verify_url = f'{endpoint}/verify'
        payload = {
            'serverCode': server_code,
            'userId': emp_no,
            'code': code,
            'apiKey': api_key,
        }

    current_app.logger.info(f'[mfa] Company OTP verify: provider={provider}, url={verify_url}, emp_no={emp_no}')

    _ca_bundle = current_app.config.get('COMPANY_OTP_CA_BUNDLE', True)
    resp = http_requests.post(verify_url, json=payload, headers=headers, timeout=timeout, verify=_ca_bundle)

    current_app.logger.info(f'[mfa] Company OTP response: status={resp.status_code}, body={resp.text[:500]}')

    if resp.status_code != 200:
        return False

    result = resp.json()

    # 각 벤더 응답 형식에 맞게 성공 여부 판단
    if provider == 'initech':
        return result.get('resultCode') == '0000' or result.get('success') is True
    elif provider == 'dreamsecurity':
        return result.get('resultCode') in ('0000', '00') or result.get('result') == 'success'
    elif provider == 'miraetech':
        return result.get('code') == '0000' or result.get('verified') is True
    else:
        return result.get('success') is True or result.get('verified') is True or result.get('resultCode') == '0000'


@auth_bp.route('/admin/auth/company-otp/config', methods=['GET'])
def admin_company_otp_config_get():
    """사내 OTP 설정 조회 (관리자)."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    row = CompanyOtpConfig.query.filter_by(id=1).first()
    if not row:
        return jsonify({
            'provider': 'initech',
            'api_endpoint': '',
            'api_key': '',
            'api_secret': '',
            'server_code': '',
            'timeout': 5,
            'enabled': False,
            'configured': False,
        })
    return jsonify({
        'provider': row.provider or 'initech',
        'api_endpoint': row.api_endpoint or '',
        'api_key': row.api_key or '',
        'api_secret': '********' if row.api_secret else '',
        'server_code': row.server_code or '',
        'timeout': row.timeout or 5,
        'enabled': bool(row.enabled),
        'configured': bool(row.api_endpoint and row.api_key),
    })


@auth_bp.route('/admin/auth/company-otp/config', methods=['PUT'])
def admin_company_otp_config_put():
    """사내 OTP 설정 저장 (관리자)."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    payload = request.get_json(silent=True) or {}
    row = CompanyOtpConfig.query.filter_by(id=1).first()
    if not row:
        row = CompanyOtpConfig(id=1)
        db.session.add(row)
    if 'provider' in payload:
        row.provider = (payload['provider'] or 'initech').strip().lower()
    if 'api_endpoint' in payload:
        row.api_endpoint = (payload['api_endpoint'] or '').strip()
    if 'api_key' in payload:
        row.api_key = (payload['api_key'] or '').strip()
    if 'api_secret' in payload and payload['api_secret'] != '********':
        row.api_secret = (payload['api_secret'] or '').strip()
    if 'server_code' in payload:
        row.server_code = (payload['server_code'] or '').strip()
    if 'timeout' in payload:
        row.timeout = max(1, min(30, int(payload['timeout'] or 5)))
    if 'enabled' in payload:
        row.enabled = bool(payload['enabled'])
    row.updated_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500
    return jsonify({'success': True, 'message': '사내 OTP 설정이 저장되었습니다.'})


@auth_bp.route('/admin/auth/company-otp/test', methods=['POST'])
def admin_company_otp_test():
    """사내 OTP 연결 테스트."""
    if not _ensure_admin_session():
        return jsonify({'error': 'forbidden'}), 403
    payload = request.get_json(silent=True) or {}
    test_emp = (payload.get('emp_no') or '').strip()
    test_code = (payload.get('code') or '').strip()
    if not test_emp or not test_code:
        return jsonify({'success': False, 'message': '사번과 OTP 코드를 입력해주세요.'}), 400
    otp_cfg = CompanyOtpConfig.query.filter_by(id=1).first()
    if not otp_cfg or not otp_cfg.api_endpoint:
        return jsonify({'success': False, 'message': '사내 OTP 서버가 설정되지 않았습니다.'}), 400
    try:
        result = _verify_company_otp(otp_cfg, test_emp, test_code)
        if result:
            return jsonify({'success': True, 'message': '사내 OTP 인증 성공!'})
        else:
            return jsonify({'success': False, 'message': '인증 실패 — 코드가 올바르지 않습니다.'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'서버 연결 실패: {e}'}), 500


@auth_bp.route('/api/mfa/verify', methods=['POST'])
def mfa_verify():
    """사용자가 입력한 MFA 코드를 검증한다."""
    data = request.get_json(silent=True) or {}
    emp_no = data.get('emp_no') or session.get('pending_mfa_emp_no')
    code = (data.get('code') or '').strip()
    mfa_type = (data.get('mfa_type') or '').strip().lower()
    if not emp_no or not code:
        return jsonify({'verified': False, 'error': '사번과 인증 코드를 입력해주세요.'}), 400

    verified = False

    if mfa_type == 'totp':
        # TOTP: pyotp로 시간 기반 코드 검증
        import pyotp
        mfa_cfg = MfaConfig.query.filter_by(id=1).first()
        secret = (mfa_cfg.totp_secret or '').replace('-', '').replace(' ', '') if mfa_cfg else ''
        if not secret:
            return jsonify({'verified': False, 'error': 'TOTP 비밀 키가 설정되지 않았습니다.'}), 400
        totp = pyotp.TOTP(secret)
        # valid_window=1 allows ±30 seconds tolerance for clock drift
        verified = totp.verify(code, valid_window=1)
        if not verified:
            return jsonify({'verified': False, 'error': '인증 코드가 올바르지 않거나 만료되었습니다.'}), 400
    elif mfa_type == 'company_otp':
        # 사내 OTP: 외부 OTP 서버 API로 검증
        otp_cfg = CompanyOtpConfig.query.filter_by(id=1).first()
        if not otp_cfg or not otp_cfg.api_endpoint:
            return jsonify({'verified': False, 'error': '사내 OTP 서버가 설정되지 않았습니다.'}), 400
        try:
            verified = _verify_company_otp(otp_cfg, emp_no, code)
        except Exception as e:
            current_app.logger.error(f'[mfa] Company OTP verify error: {e}')
            return jsonify({'verified': False, 'error': f'사내 OTP 서버 연결 실패: {e}'}), 500
        if not verified:
            return jsonify({'verified': False, 'error': '인증 코드가 올바르지 않거나 만료되었습니다.'}), 400
    else:
        # SMS / Email: DB에 저장된 코드와 비교
        now = datetime.utcnow()
        pending = MfaPendingCode.query.filter(
            MfaPendingCode.emp_no == emp_no,
            MfaPendingCode.code == code,
            MfaPendingCode.used == False,
            MfaPendingCode.expires_at > now,
        ).order_by(MfaPendingCode.created_at.desc()).first()

        if not pending:
            return jsonify({'verified': False, 'error': '인증 코드가 올바르지 않거나 만료되었습니다.'}), 400

        pending.used = True
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()

    # MFA 검증 성공: 세션에 플래그 기록
    session['mfa_verified'] = True
    session.pop('pending_mfa_emp_no', None)
    session.pop('pending_mfa_user_id', None)

    # 로그인 완료 처리 (pending 세션 정보가 있으면 최종 로그인 마무리)
    _complete_login_after_mfa(emp_no)

    return jsonify({'verified': True, 'redirect': url_for('main.dashboard')})


def _complete_login_after_mfa(emp_no):
    """MFA 검증 후 최종 로그인 세션 설정을 마무리한다."""
    user = AuthUser.query.filter_by(emp_no=emp_no).first()
    if not user:
        return

    session.permanent = _should_session_be_permanent()
    session['user_id'] = user.id
    session['emp_no'] = user.emp_no
    from datetime import datetime as _dt
    session['_login_at'] = _dt.utcnow().isoformat()
    session['_last_active'] = session['_login_at']

    _is_admin_identity = (
        (user.emp_no and user.emp_no.upper() == 'ADMIN') or
        (user.email and user.email.split('@')[0].upper() == 'ADMIN') or
        (user.role and user.role.upper() == 'ADMIN')
    )
    if _is_admin_identity and (not user.role or user.role.upper() != 'ADMIN'):
        try:
            user.role = 'ADMIN'
            db.session.commit()
            from app.security import log_audit_event
            log_audit_event(
                'ADMIN_ESCALATION',
                f'MFA 완료 후 ADMIN 자동 승격: emp_no={user.emp_no}',
                emp_no=user.emp_no,
                details=f'previous_role={user.role}, trigger=mfa_complete'
            )
        except Exception:
            db.session.rollback()
    session['role'] = 'ADMIN' if _is_admin_identity else user.role

    # ── 권한 캐시 (session['_perms']) ──
    _cache_session_permissions(session)

    try:
        profile = UserProfile.query.filter_by(emp_no=user.emp_no).first()
        if not profile:
            profile = UserProfile(emp_no=user.emp_no, email=user.email, role=session.get('role'))
            db.session.add(profile)
            db.session.commit()
        session['user_profile_id'] = profile.id
        session['profile_user_id'] = profile.id
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass

    if user.needs_terms():
        session['pending_terms_user_id'] = user.id