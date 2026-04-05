from app import create_app
import os, traceback, atexit

try:
    app = create_app()
    # ---- 자동 역할 시드 (서버 기동 시 1회) ----
    try:
        from app.models import Role, db
        with app.app_context():
            role_count = Role.query.count()
            if role_count == 0:
                print('[auto-seed] 역할 테이블 비어있음 -> 기본 역할 생성 진행', flush=True)
                def _mk(name, desc, perms):
                    r = Role(name=name, description=desc,
                             dashboard_read=perms.get('dashboard_read', False), dashboard_write=perms.get('dashboard_write', False),
                             hardware_read=perms.get('hardware_read', False), hardware_write=perms.get('hardware_write', False),
                             software_read=perms.get('software_read', False), software_write=perms.get('software_write', False),
                             governance_read=perms.get('governance_read', False), governance_write=perms.get('governance_write', False),
                             datacenter_read=perms.get('datacenter_read', False), datacenter_write=perms.get('datacenter_write', False),
                             cost_read=perms.get('cost_read', False), cost_write=perms.get('cost_write', False),
                             project_read=perms.get('project_read', False), project_write=perms.get('project_write', False),
                             category_read=perms.get('category_read', False), category_write=perms.get('category_write', False))
                    db.session.add(r)
                _mk('ADMIN','최고 관리자',{'dashboard_read':True,'dashboard_write':True,'hardware_read':True,'hardware_write':True,'software_read':True,'software_write':True,'governance_read':True,'governance_write':True,'datacenter_read':True,'datacenter_write':True,'cost_read':True,'cost_write':True,'project_read':True,'project_write':True,'category_read':True,'category_write':True})
                _mk('MANAGER','일반 관리자',{'dashboard_read':True,'hardware_read':True,'software_read':True,'governance_read':True,'datacenter_read':True,'project_read':True,'category_read':True})
                _mk('VIEWER','조회 전용',{'dashboard_read':True,'hardware_read':True,'software_read':True,'governance_read':True,'datacenter_read':True,'project_read':True,'category_read':True})
                try:
                    db.session.commit()
                    print('[auto-seed] 기본 역할 3개 생성 완료', flush=True)
                except Exception as _se:
                    db.session.rollback()
                    print('[auto-seed] 역할 생성 실패:', _se, flush=True)
            else:
                print(f'[auto-seed] 역할 테이블 기존 행 존재(count={role_count}) -> 시드 생략', flush=True)
    except Exception as _seed_e:
        print('[auto-seed] 초기 시드 로직 예외 (무시 가능):', _seed_e, flush=True)
    # ---- AuthRole (legacy / sidebar) ADMIN 권한 강제 시드 ----
    try:
        from app.models import AuthRole as _AuthRole
        with app.app_context():
            admin_row = _AuthRole.query.filter_by(role='ADMIN').first()
            if not admin_row:
                _perms = {
                    'settings': {'read': True, 'write': True},
                    'dashboard': {'read': True},
                    'hardware': {'read': True},
                    'software': {'read': True},
                    'governance': {'read': True},
                    'datacenter': {'read': True},
                    'cost': {'read': True},
                    'project': {'read': True},
                    'category': {'read': True}
                }
                import json as _json
                admin_row = _AuthRole(role='ADMIN', description='Sidebar/admin permissions', permissions=_json.dumps(_perms, ensure_ascii=False))
                db.session.add(admin_row)
                try:
                    db.session.commit()
                    print('[auto-seed] AuthRole ADMIN row 생성 (settings 포함)', flush=True)
                except Exception as _ar_e:
                    db.session.rollback()
                    print('[auto-seed] AuthRole ADMIN 생성 실패:', _ar_e, flush=True)
            else:
                # settings 권한 없으면 메모리에서만 보강 (불변 정책 상 DB 수정은 보류)
                import json as _json
                try:
                    perms_obj = _json.loads(admin_row.permissions) if admin_row.permissions else {}
                except Exception:
                    perms_obj = {}
                if 'settings' not in perms_obj:
                    perms_obj['settings'] = {'read': True, 'write': True}
                    try:
                        admin_row.permissions = _json.dumps(perms_obj, ensure_ascii=False)
                        db.session.commit()
                        print('[auto-seed] 기존 AuthRole ADMIN settings 권한 추가 완료', flush=True)
                    except Exception as _ar_upd:
                        db.session.rollback()
                        print('[auto-seed] AuthRole ADMIN settings 권한 추가 실패:', _ar_upd, flush=True)
                else:
                    print('[auto-seed] AuthRole ADMIN 이미 settings 권한 보유', flush=True)
    except Exception as _authrole_seed_e:
        print('[auto-seed] AuthRole 시드 중 예외 (무시 가능):', _authrole_seed_e, flush=True)
    # 진단: 필수 라우트 존재 확인 (없으면 즉시 종료하여 코드 불일치 알림)
    try:
        current_rules = {str(r) for r in app.url_map.iter_rules()}
        required = {
            '/__diag__ping',
            '/__routes',
            '/debug/routes',
            # Storage/Backup detail tabs (ensure new APIs are actually registered)
            '/api/tab32-assign-groups',
        }
        missing = required - current_rules
        if missing:
            print('[warn] 진단 라우트 누락 감지. 현재 url_map에 없음:', missing)
            print('       예상치 못한 오래된 코드가 로딩되었을 가능성. 서버 실행 중단.')
            raise SystemExit(3)
        else:
            print('[ok] 진단 라우트 확인 완료:', required)
        # 역할 삭제 관련 라우트 존재 여부 추가 디버그
        try:
            delete_related = [str(r) for r in app.url_map.iter_rules() if 'groups/delete' in str(r)]
            print('[debug] delete-related routes:', delete_related, flush=True)
        except Exception as _dr:
            print('[debug] delete-related enumeration failed:', _dr)
    except Exception as _diag_e:
        print('[diag] 진단 라우트 검사 중 예외(무시 가능):', _diag_e)
except Exception as e:
    print('[error] create_app() 실패:', e)
    traceback.print_exc()
    raise

def _on_exit():
    try:
        print('[lifecycle] run.py process 종료 감지', flush=True)
    except Exception:
        pass
atexit.register(_on_exit)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    host = os.environ.get('HOST', '0.0.0.0')  # 외부 접근 문제시 0.0.0.0 바인딩
    env = os.environ.get('FLASK_ENV', 'development')
    debug = env == 'development'

    # Flask debug reloader can detach/spawn a child process on Windows.
    # In VS Code tasks/background runs this often looks like "server immediately exits"
    # and can also race with health checks.
    # Default: reloader OFF. Opt-in with BLOSSOM_USE_RELOADER=1.
    no_reload_raw = (os.environ.get('BLOSSOM_NO_RELOAD') or '').strip().lower()
    use_reloader_raw = (os.environ.get('BLOSSOM_USE_RELOADER') or '').strip().lower()
    use_reloader = bool(debug) and use_reloader_raw in {'1', 'true', 'yes', 'y', 'on'} and no_reload_raw not in {'1', 'true', 'yes', 'y', 'on'}

    print('[startup] Blossom 자산관리 시스템 시작 준비...')
    print(f"[info] 서버 주소: http://{host}:{port}")
    print(f"[info] 디버그 모드: {debug}")

    if debug:
        os.environ['FLASK_ENV'] = 'development'
        os.environ['FLASK_DEBUG'] = '1'
        app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
        app.config['TEMPLATES_AUTO_RELOAD'] = True
        app.jinja_env.auto_reload = True

    # 지속 실행 확인: run 이후 즉시 종료되는 현상 진단 위해 loop 출력 추가
    try:
        print('[lifecycle] Flask run() 진입 직전 host=', host, 'port=', port, flush=True)
        app.run(
            debug=debug,
            host=host,
            port=port,
            threaded=True,
            use_reloader=use_reloader
        )
    except Exception as e:
        print('[error] 서버 실행 중 예외 발생:', e)
        traceback.print_exc()
