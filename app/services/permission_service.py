"""권한 계산 서비스 — 사용자 > 역할 > 부서 > 기본값(NONE) 우선순위"""
from app.models import (
    db, Menu, Role, RoleUser, UserProfile, OrgDepartment,
    RoleMenuPermission, DepartmentMenuPermission, UserMenuPermission,
    PermissionAuditLog,
    DetailPage, RoleDetailPermission, DepartmentDetailPermission, UserDetailPermission,
)

# ── 메뉴 시드 데이터 (menu_code, menu_name, parent_code, sort_order) ──
MENU_SEEDS = [
    ('dashboard',                '대시보드',        None,          1),
    ('system',                   '시스템',          None,          2),
    ('system.server',            '서버',            'system',      1),
    ('system.storage',           '스토리지',        'system',      2),
    ('system.san',               'SAN',             'system',      3),
    ('system.network',           '네트워크',        'system',      4),
    ('system.security',          '보안장비',        'system',      5),
    ('governance',               '거버넌스',        None,          3),
    ('governance.backup',        '백업 정책',       'governance',  1),
    ('governance.package',       '패키지 관리',     'governance',  2),
    ('governance.vulnerability', '취약점 분석',     'governance',  3),
    ('governance.ip',            'IP 정책',         'governance',  4),
    ('governance.vpn',           'VPN 정책',        'governance',  5),
    ('governance.leased_line',   '전용회선 정책',   'governance',  6),
    ('governance.unused_asset',  '불용자산 관리',   'governance',  7),
    ('datacenter',               '데이터센터',      None,          4),
    ('datacenter.access',        '출입 관리',       'datacenter',  1),
    ('datacenter.data_delete',   '데이터 삭제 관리','datacenter',  2),
    ('datacenter.rack',          'RACK 관리',       'datacenter',  3),
    ('datacenter.temperature',   '온습도 관리',     'datacenter',  4),
    ('datacenter.cctv',          'CCTV 관리',       'datacenter',  5),
    ('cost',                     '비용관리',        None,          5),
    ('cost.opex',                'OPEX',            'cost',        1),
    ('cost.capex',               'CAPEX',           'cost',        2),
    ('project',                  '프로젝트',        None,          6),
    ('project.status',           '프로젝트 현황',   'project',     1),
    ('project.work',             '작업 현황',       'project',     2),
    ('project.ticket',           '티켓 현황',       'project',     3),
    ('project.workflow',         '워크플로우 제작',  'project',     4),
    ('insight',                  '인사이트',        None,          7),
    ('insight.technical',        '기술자료',        'insight',     1),
    ('insight.blog',             '블로그',          'insight',     2),
    ('category',                 '카테고리',        None,          8),
    ('category.business',        '비즈니스',        'category',    1),
    ('category.hardware',        '하드웨어',        'category',    2),
    ('category.software',        '소프트웨어',      'category',    3),
    ('category.component',       '컴포넌트',        'category',    4),
    ('category.company',         '회사',            'category',    5),
    ('category.customer',        '고객',            'category',    6),
    ('category.vendor',          '벤더',            'category',    7),
    ('settings',                 '설정',            None,          9),
    ('settings.user',            '사용자',          'settings',    1),
    ('settings.permission',      '화면권한',        'settings',    2),
    ('settings.auth',            '인증관리',        'settings',    3),
    ('settings.security',        '보안관리',        'settings',    4),
    ('settings.mail',            '메일관리',        'settings',    5),
    ('settings.quality',         '품질유형',        'settings',    6),
    ('settings.log',             '통합로그',        'settings',    7),
]

# ── 메뉴별 내보내기(다운로드) 허용 설정 ──
# READ 권한에서도 다운로드를 허용할 메뉴 목록 (일반 조회성 보고서)
EXPORT_ALLOWED_ON_READ = {
    'dashboard', 'insight', 'insight.technical', 'insight.blog',
    'settings.log',
}
# 개인정보·관리정보 등 READ에서도 다운로드 불허 메뉴 (기본값: 불허)
# EXPORT_ALLOWED_ON_READ에 없으면 READ에서 다운로드 불가


def seed_menus():
    """메뉴 시드 — 이미 존재하면 건너뜀"""
    existing = {m.menu_code for m in Menu.query.all()}
    code_to_id = {m.menu_code: m.id for m in Menu.query.all()}
    added = 0
    for code, name, parent_code, order in MENU_SEEDS:
        if code in existing:
            continue
        parent_id = code_to_id.get(parent_code) if parent_code else None
        m = Menu(menu_code=code, menu_name=name, parent_menu_id=parent_id, sort_order=order)
        db.session.add(m)
        db.session.flush()
        code_to_id[code] = m.id
        existing.add(code)
        added += 1
    if added:
        db.session.commit()
    return added


def get_menu_tree():
    """메뉴 전체를 트리 구조로 반환"""
    menus = Menu.query.order_by(Menu.sort_order).all()
    by_id = {m.id: m for m in menus}
    roots = []
    children_map = {}
    for m in menus:
        children_map.setdefault(m.parent_menu_id, []).append(m)
    for m in menus:
        if m.parent_menu_id is None:
            roots.append(_menu_to_dict(m, children_map))
    return roots


def _menu_to_dict(menu, children_map):
    children = children_map.get(menu.id, [])
    return {
        'id': menu.id,
        'menu_code': menu.menu_code,
        'menu_name': menu.menu_name,
        'parent_menu_id': menu.parent_menu_id,
        'sort_order': menu.sort_order,
        'children': [_menu_to_dict(c, children_map) for c in children],
    }


# ── 권한 조회/수정 ──

def get_role_permissions(role_id):
    """역할의 메뉴별 권한 dict — {menu_code: 'NONE'|'READ'|'WRITE'}"""
    rows = db.session.query(RoleMenuPermission, Menu) \
        .join(Menu, RoleMenuPermission.menu_id == Menu.id) \
        .filter(RoleMenuPermission.role_id == role_id).all()
    return {m.menu_code: rmp.permission_type for rmp, m in rows}


def get_dept_permissions(dept_id):
    """부서의 메뉴별 권한 dict"""
    rows = db.session.query(DepartmentMenuPermission, Menu) \
        .join(Menu, DepartmentMenuPermission.menu_id == Menu.id) \
        .filter(DepartmentMenuPermission.dept_id == dept_id).all()
    return {m.menu_code: dmp.permission_type for dmp, m in rows}


def get_user_permissions(user_id):
    """사용자 직접 권한 dict"""
    rows = db.session.query(UserMenuPermission, Menu) \
        .join(Menu, UserMenuPermission.menu_id == Menu.id) \
        .filter(UserMenuPermission.user_id == user_id).all()
    return {m.menu_code: ump.permission_type for ump, m in rows}


def set_permissions(target_type, target_id, perm_map, changed_by=None):
    """권한 일괄 설정.
    target_type: 'role' | 'department' | 'user'
    perm_map: {menu_code: 'NONE'|'READ'|'WRITE'}
    상속 제약: 하위 메뉴 권한은 상위 메뉴를 초과할 수 없음.
    """
    _RANK = {'NONE': 0, 'READ': 1, 'WRITE': 2}
    code_to_menu = {m.menu_code: m for m in Menu.query.all()}
    model_cls = _target_model(target_type)
    fk_col = _target_fk(target_type)

    # 상속 제약 적용: 하위 > 상위 이면 상위 수준으로 하향
    for code in list(perm_map.keys()):
        if '.' in code:
            parent_code = code.rsplit('.', 1)[0]
            parent_perm = perm_map.get(parent_code)
            if parent_perm and _RANK.get(perm_map[code], 0) > _RANK.get(parent_perm, 0):
                perm_map[code] = parent_perm

    # 현재 값 조회
    existing = {}
    for row in model_cls.query.filter(getattr(model_cls, fk_col) == target_id).all():
        menu = code_to_menu.get(None)
        for m in code_to_menu.values():
            if m.id == row.menu_id:
                existing[m.menu_code] = row
                break

    for code, perm_type in perm_map.items():
        if perm_type not in ('NONE', 'READ', 'WRITE'):
            continue
        menu = code_to_menu.get(code)
        if not menu:
            continue

        old_row = existing.get(code)
        old_perm = old_row.permission_type if old_row else 'NONE'

        if old_perm != perm_type and changed_by:
            _log_audit(target_type, target_id, code, old_perm, perm_type, changed_by)

        if old_row:
            old_row.permission_type = perm_type
        else:
            new_row = model_cls(**{fk_col: target_id, 'menu_id': menu.id, 'permission_type': perm_type})
            db.session.add(new_row)

    db.session.commit()


def _target_model(target_type):
    return {
        'role': RoleMenuPermission,
        'department': DepartmentMenuPermission,
        'user': UserMenuPermission,
    }[target_type]


def _target_fk(target_type):
    return {
        'role': 'role_id',
        'department': 'dept_id',
        'user': 'user_id',
    }[target_type]


def _log_audit(target_type, target_id, menu_code, before, after, changed_by):
    if before == after:
        return
    log = PermissionAuditLog(
        target_type=target_type,
        target_id=target_id,
        menu_code=menu_code,
        before_permission=before,
        after_permission=after,
        changed_by=changed_by,
    )
    db.session.add(log)


# ── 최종 권한 계산 ──

def get_effective_permissions(user_id):
    """사용자의 최종 권한 계산 (user > role > dept > NONE, 하위 메뉴 상속)"""
    menus = Menu.query.order_by(Menu.sort_order).all()
    if not menus:
        return {}

    menu_by_id = {m.id: m for m in menus}

    # 사용자 정보
    user = UserProfile.query.get(user_id)
    role_user = RoleUser.query.filter_by(user_id=user_id).first()
    role_id = role_user.role_id if role_user else None
    dept_id = user.department_id if user else None

    # 3개 소스에서 명시적 권한 수집
    user_perms = {}
    for p in UserMenuPermission.query.filter_by(user_id=user_id).all():
        user_perms[p.menu_id] = p.permission_type

    role_perms = {}
    if role_id:
        for p in RoleMenuPermission.query.filter_by(role_id=role_id).all():
            role_perms[p.menu_id] = p.permission_type

    dept_perms = {}
    if dept_id:
        for p in DepartmentMenuPermission.query.filter_by(dept_id=dept_id).all():
            dept_perms[p.menu_id] = p.permission_type

    # 부모 → 자식 순으로 처리 (상속 계산)
    sorted_menus = _topo_sort(menus, menu_by_id)
    result = {}

    for menu in sorted_menus:
        mid = menu.id
        # 우선순위: user > role > dept
        if mid in user_perms:
            result[menu.menu_code] = user_perms[mid]
        elif mid in role_perms:
            result[menu.menu_code] = role_perms[mid]
        elif mid in dept_perms:
            result[menu.menu_code] = dept_perms[mid]
        else:
            # 부모 상속
            parent = menu_by_id.get(menu.parent_menu_id)
            if parent and parent.menu_code in result:
                result[menu.menu_code] = result[parent.menu_code]
            else:
                result[menu.menu_code] = 'READ'

    return result


def get_user_permission_detail(user_id):
    """사용자의 메뉴별 상세 권한 정보 반환 (부서/역할/사용자/최종 각각)"""
    menus = Menu.query.order_by(Menu.sort_order).all()
    if not menus:
        return {'menus': [], 'role_name': None, 'dept_name': None}

    menu_by_id = {m.id: m for m in menus}

    user = UserProfile.query.get(user_id)
    role_user = RoleUser.query.filter_by(user_id=user_id).first()
    role_id = role_user.role_id if role_user else None
    dept_id = user.department_id if user else None

    role_name = None
    if role_id:
        role = Role.query.get(role_id)
        role_name = role.name if role else None
    dept_name = user.department if user else None

    # 3개 소스에서 명시적 권한 수집 (menu_id 기반)
    _user_perms = {}
    for p in UserMenuPermission.query.filter_by(user_id=user_id).all():
        _user_perms[p.menu_id] = p.permission_type

    _role_perms = {}
    if role_id:
        for p in RoleMenuPermission.query.filter_by(role_id=role_id).all():
            _role_perms[p.menu_id] = p.permission_type

    _dept_perms = {}
    if dept_id:
        for p in DepartmentMenuPermission.query.filter_by(dept_id=dept_id).all():
            _dept_perms[p.menu_id] = p.permission_type

    # 부모 → 자식 순으로 상속 계산
    sorted_menus = _topo_sort(menus, menu_by_id)

    # 각 소스별 상속 계산
    dept_resolved = {}
    role_resolved = {}
    for menu in sorted_menus:
        mid = menu.id
        code = menu.menu_code
        parent = menu_by_id.get(menu.parent_menu_id)
        pc = parent.menu_code if parent else None
        # dept
        if mid in _dept_perms:
            dept_resolved[code] = _dept_perms[mid]
        elif pc and pc in dept_resolved:
            dept_resolved[code] = dept_resolved[pc]
        else:
            dept_resolved[code] = 'NONE'
        # role
        if mid in _role_perms:
            role_resolved[code] = _role_perms[mid]
        elif pc and pc in role_resolved:
            role_resolved[code] = role_resolved[pc]
        else:
            role_resolved[code] = 'NONE'

    # 사용자 직접 권한 (menu_code 기반, 상속 없음)
    user_direct = {}
    for mid, perm in _user_perms.items():
        m = menu_by_id.get(mid)
        if m:
            user_direct[m.menu_code] = perm

    # 최종 권한 계산
    effective = {}
    for menu in sorted_menus:
        mid = menu.id
        code = menu.menu_code
        if mid in _user_perms:
            effective[code] = _user_perms[mid]
        elif mid in _role_perms:
            effective[code] = _role_perms[mid]
        elif mid in _dept_perms:
            effective[code] = _dept_perms[mid]
        else:
            parent = menu_by_id.get(menu.parent_menu_id)
            if parent and parent.menu_code in effective:
                effective[code] = effective[parent.menu_code]
            else:
                effective[code] = 'NONE'

    return {
        'role_name': role_name,
        'dept_name': dept_name,
        'dept_perms': dept_resolved,
        'role_perms': role_resolved,
        'user_perms': user_direct,
        'effective': effective,
    }


def reset_user_permissions(user_id, changed_by=None):
    """사용자의 직접 권한을 모두 삭제하여 역할+부서 기본 권한으로 복귀"""
    menu_by_id = {m.id: m for m in Menu.query.all()}
    rows = UserMenuPermission.query.filter_by(user_id=user_id).all()
    for row in rows:
        m = menu_by_id.get(row.menu_id)
        if m and changed_by:
            _log_audit('user', user_id, m.menu_code, row.permission_type, 'NONE', changed_by)
        db.session.delete(row)
    db.session.commit()
    return len(rows)


def _topo_sort(menus, menu_by_id):
    """부모가 자식보다 먼저 오도록 정렬"""
    visited = set()
    ordered = []

    def visit(m):
        if m.id in visited:
            return
        visited.add(m.id)
        if m.parent_menu_id and m.parent_menu_id in menu_by_id:
            visit(menu_by_id[m.parent_menu_id])
        ordered.append(m)

    for m in menus:
        visit(m)
    return ordered


def cache_session_permissions(sess):
    """로그인 시 세션에 최종 권한 캐싱"""
    if (sess.get('role') or '').upper() == 'ADMIN':
        menus = Menu.query.all()
        perms = {m.menu_code: 'WRITE' for m in menus}
        if not perms:
            # 메뉴 시드 전 — 기본 sections
            for code, _, _, _ in MENU_SEEDS:
                perms[code] = 'WRITE'
        sess['_perms'] = perms
        return

    uid = sess.get('user_id') or sess.get('profile_user_id')
    if uid:
        try:
            perms = get_effective_permissions(uid)
            sess['_perms'] = perms
        except Exception as e:
            print('[cache_perms] error', e, flush=True)
            sess['_perms'] = {}
    else:
        sess['_perms'] = {}


# ── URL → 메뉴 코드 매핑 ──

_URL_MENU_MAP = [
    # 더 구체적인 패턴을 먼저 매칭
    ('/api/dashboard', 'dashboard'),
    # system 하위
    ('/hw_server', 'system.server'), ('/api/hw-server', 'system.server'),
    ('/hw_storage', 'system.storage'), ('/api/hw-storage', 'system.storage'),
    ('/hw_san', 'system.san'), ('/api/hw-san', 'system.san'),
    ('/hw_network', 'system.network'), ('/api/hw-network', 'system.network'), ('/api/net', 'system.network'),
    ('/hw_security', 'system.security'), ('/api/hw-security', 'system.security'),
    ('/hw_', 'system'), ('/api/hw', 'system'), ('/api/hardware', 'system'),
    ('/api/sw', 'system'), ('/api/software', 'system'),
    # governance 하위
    ('/api/gov-backup', 'governance.backup'), ('/api/backup', 'governance.backup'),
    ('/api/gov-package', 'governance.package'),
    ('/api/gov-vulnerability', 'governance.vulnerability'),
    ('/api/gov-ip', 'governance.ip'),
    ('/api/gov-vpn', 'governance.vpn'), ('/api/vpn', 'governance.vpn'),
    ('/api/gov-leased', 'governance.leased_line'), ('/api/leased', 'governance.leased_line'),
    ('/api/gov-unused', 'governance.unused_asset'), ('/api/unused-asset', 'governance.unused_asset'),
    ('/api/gov', 'governance'), ('/api/governance', 'governance'),
    # datacenter 하위
    ('/api/datacenter-access', 'datacenter.access'),
    ('/api/datacenter-rack', 'datacenter.rack'), ('/api/rack', 'datacenter.rack'),
    ('/api/datacenter-temp', 'datacenter.temperature'),
    ('/api/datacenter-cctv', 'datacenter.cctv'),
    ('/api/datacenter', 'datacenter'),
    # cost
    ('/api/cost-opex', 'cost.opex'), ('/api/cost-capex', 'cost.capex'),
    ('/api/cost', 'cost'), ('/cost', 'cost'),
    # project
    ('/api/project', 'project'), ('/api/prj', 'project'),
    # insight
    ('/api/insight', 'insight'),
    # category
    ('/api/category', 'category'), ('/api/cat', 'category'),
    # settings
    ('/admin/auth/', 'settings'),
]

_EXEMPT_PREFIXES = ('/api/auth/', '/api/session/', '/api/menus', '/api/detail-pages', '/api/roles', '/api/departments', '/api/permission', '/login', '/static/', '/favicon')


def resolve_menu_code(path):
    """URL path → menu_code (가장 구체적 매칭)"""
    for prefix, code in _URL_MENU_MAP:
        if path.startswith(prefix):
            return code
    return None


def check_permission(path, method, perm_cache):
    """미들웨어용 권한 체크. 반환: None (통과), 'forbidden', 'readonly'"""
    for prefix in _EXEMPT_PREFIXES:
        if path.startswith(prefix):
            return None

    menu_code = resolve_menu_code(path)
    if not menu_code:
        return None

    if not perm_cache:
        return None

    perm_level = perm_cache.get(menu_code)
    # 명시적 권한이 없으면 부모 메뉴 체크
    if not perm_level and '.' in menu_code:
        parent_code = menu_code.rsplit('.', 1)[0]
        perm_level = perm_cache.get(parent_code)
    if not perm_level:
        perm_level = 'READ'  # 매핑 누락 시 기본 읽기

    if perm_level == 'NONE':
        return 'forbidden'
    if perm_level == 'READ' and method in ('POST', 'PUT', 'PATCH', 'DELETE'):
        return 'readonly'
    return None


def can_export(menu_code, perm_level):
    """메뉴별 내보내기 허용 여부 판별.
    WRITE → 항상 가능, NONE → 불가,
    READ → EXPORT_ALLOWED_ON_READ 에 포함된 경우만 허용.
    """
    if perm_level == 'WRITE':
        return True
    if perm_level == 'NONE':
        return False
    # READ
    section = menu_code.split('.')[0] if menu_code else ''
    return menu_code in EXPORT_ALLOWED_ON_READ or section in EXPORT_ALLOWED_ON_READ


# ══════════════════════════════════════════════════════════════
#  상세화면(탭) 권한 관리
# ══════════════════════════════════════════════════════════════

# (page_code, page_name, parent_code, sort_order)
DETAIL_PAGE_SEEDS = [
    # ── 자산 관리 탭 (01~15) ──
    ('asset',               '자산 관리',        None,       1),
    ('asset.tab01',         '하드웨어',         'asset',    1),
    ('asset.tab02',         '소프트웨어',       'asset',    2),
    ('asset.tab03',         '백업 정책',        'asset',    3),
    ('asset.tab04',         '인터페이스',       'asset',    4),
    ('asset.tab05',         '계정',             'asset',    5),
    ('asset.tab06',         '접근권한',         'asset',    6),
    ('asset.tab07',         '라이선스',         'asset',    7),
    ('asset.tab08',         '방화벽',           'asset',    8),
    ('asset.tab10',         '스토리지',         'asset',   10),
    ('asset.tab11',         '작업',             'asset',   11),
    ('asset.tab12',         '취약점',           'asset',   12),
    ('asset.tab13',         '패키지',           'asset',   13),
    ('asset.tab14',         '변경이력',         'asset',   14),
    ('asset.tab15',         '첨부파일',         'asset',   15),
    # ── 인프라 관리 탭 (21~46) ──
    ('infra',               '인프라 관리',      None,       2),
    ('infra.tab21',         '전면베이',         'infra',   21),
    ('infra.tab22',         '후면베이',         'infra',   22),
    ('infra.tab31',         '기본스토리지',     'infra',   31),
    ('infra.tab32',         '할당스토리지',     'infra',   32),
    ('infra.tab33',         '존',               'infra',   33),
    ('infra.tab41',         'IP 대역',          'infra',   41),
    ('infra.tab42',         'DNS 레코드',       'infra',   42),
    ('infra.tab43',         'AD 계정',          'infra',   43),
    ('infra.tab44',         'AD FQDN',          'infra',   44),
    ('infra.tab45',         '통신',             'infra',   45),
    ('infra.tab46',         'VPN 정책',         'infra',   46),
    # ── 비용 관리 탭 (71~72) ──
    ('cost_tab',            '비용 관리',        None,       3),
    ('cost_tab.tab71',      'OPEX',             'cost_tab', 71),
    ('cost_tab.tab72',      'CAPEX',            'cost_tab', 72),
    # ── 프로젝트 관리 탭 (81~99) ──
    ('project_tab',         '프로젝트 관리',    None,       4),
    ('project_tab.tab81',   '통합',             'project_tab', 81),
    ('project_tab.tab82',   '범위',             'project_tab', 82),
    ('project_tab.tab83',   '일정',             'project_tab', 83),
    ('project_tab.tab84',   '원가',             'project_tab', 84),
    ('project_tab.tab85',   '품질',             'project_tab', 85),
    ('project_tab.tab86',   '자원',             'project_tab', 86),
    ('project_tab.tab87',   '커뮤니케이션',     'project_tab', 87),
    ('project_tab.tab88',   '리스크',           'project_tab', 88),
    ('project_tab.tab89',   '조달',             'project_tab', 89),
    ('project_tab.tab90',   '이해관계자',       'project_tab', 90),
    ('project_tab.tab91',   '시스템',           'project_tab', 91),
    ('project_tab.tab92',   '인력',             'project_tab', 92),
    ('project_tab.tab93',   '하드웨어',         'project_tab', 93),
    ('project_tab.tab94',   '소프트웨어',       'project_tab', 94),
    ('project_tab.tab95',   '컴포넌트',         'project_tab', 95),
    ('project_tab.tab96',   '서비스',           'project_tab', 96),
    ('project_tab.tab97',   '파트너',           'project_tab', 97),
    ('project_tab.tab98',   'SLA',              'project_tab', 98),
    ('project_tab.tab99',   '이슈',             'project_tab', 99),
]


def seed_detail_pages():
    """상세화면(탭) 시드 — 이미 존재하면 건너뜀"""
    existing = {p.page_code for p in DetailPage.query.all()}
    code_to_id = {p.page_code: p.id for p in DetailPage.query.all()}
    added = 0
    for code, name, parent_code, order in DETAIL_PAGE_SEEDS:
        if code in existing:
            continue
        parent_id = code_to_id.get(parent_code) if parent_code else None
        p = DetailPage(page_code=code, page_name=name, parent_page_id=parent_id, sort_order=order)
        db.session.add(p)
        db.session.flush()
        code_to_id[code] = p.id
        existing.add(code)
        added += 1
    if added:
        db.session.commit()
    return added


def get_detail_page_tree():
    """상세화면 전체를 트리 구조로 반환"""
    pages = DetailPage.query.order_by(DetailPage.sort_order).all()
    children_map = {}
    for p in pages:
        children_map.setdefault(p.parent_page_id, []).append(p)
    roots = []
    for p in pages:
        if p.parent_page_id is None:
            roots.append(_detail_to_dict(p, children_map))
    return roots


def _detail_to_dict(page, children_map):
    children = children_map.get(page.id, [])
    return {
        'id': page.id,
        'page_code': page.page_code,
        'page_name': page.page_name,
        'parent_page_id': page.parent_page_id,
        'sort_order': page.sort_order,
        'children': [_detail_to_dict(c, children_map) for c in children],
    }


# ── 상세화면 권한 조회/수정 ──

def get_role_detail_permissions(role_id):
    """역할의 상세화면별 권한 dict — {page_code: 'NONE'|'READ'|'WRITE'}"""
    rows = db.session.query(RoleDetailPermission, DetailPage) \
        .join(DetailPage, RoleDetailPermission.page_id == DetailPage.id) \
        .filter(RoleDetailPermission.role_id == role_id).all()
    return {p.page_code: rdp.permission_type for rdp, p in rows}


def get_dept_detail_permissions(dept_id):
    """부서의 상세화면별 권한 dict"""
    rows = db.session.query(DepartmentDetailPermission, DetailPage) \
        .join(DetailPage, DepartmentDetailPermission.page_id == DetailPage.id) \
        .filter(DepartmentDetailPermission.dept_id == dept_id).all()
    return {p.page_code: ddp.permission_type for ddp, p in rows}


def get_user_detail_permissions(user_id):
    """사용자 직접 상세화면 권한 dict"""
    rows = db.session.query(UserDetailPermission, DetailPage) \
        .join(DetailPage, UserDetailPermission.page_id == DetailPage.id) \
        .filter(UserDetailPermission.user_id == user_id).all()
    return {p.page_code: udp.permission_type for udp, p in rows}


def set_detail_permissions(target_type, target_id, perm_map, changed_by=None):
    """상세화면 권한 일괄 설정.
    target_type: 'role' | 'department' | 'user'
    perm_map: {page_code: 'NONE'|'READ'|'WRITE'}
    """
    _RANK = {'NONE': 0, 'READ': 1, 'WRITE': 2}
    code_to_page = {p.page_code: p for p in DetailPage.query.all()}
    model_cls = _detail_target_model(target_type)
    fk_col = _detail_target_fk(target_type)

    # 상속 제약: 하위 > 상위 이면 상위 수준으로 하향
    for code in list(perm_map.keys()):
        if '.' in code:
            parent_code = code.rsplit('.', 1)[0]
            parent_perm = perm_map.get(parent_code)
            if parent_perm and _RANK.get(perm_map[code], 0) > _RANK.get(parent_perm, 0):
                perm_map[code] = parent_perm

    existing = {}
    for row in model_cls.query.filter(getattr(model_cls, fk_col) == target_id).all():
        for p in code_to_page.values():
            if p.id == row.page_id:
                existing[p.page_code] = row
                break

    for code, perm_type in perm_map.items():
        if perm_type not in ('NONE', 'READ', 'WRITE'):
            continue
        page = code_to_page.get(code)
        if not page:
            continue

        old_row = existing.get(code)
        old_perm = old_row.permission_type if old_row else 'NONE'

        if old_perm != perm_type and changed_by:
            _log_audit(target_type, target_id, code, old_perm, perm_type, changed_by)

        if old_row:
            old_row.permission_type = perm_type
        else:
            new_row = model_cls(**{fk_col: target_id, 'page_id': page.id, 'permission_type': perm_type})
            db.session.add(new_row)

    db.session.commit()


def _detail_target_model(target_type):
    return {
        'role': RoleDetailPermission,
        'department': DepartmentDetailPermission,
        'user': UserDetailPermission,
    }[target_type]


def _detail_target_fk(target_type):
    return {
        'role': 'role_id',
        'department': 'dept_id',
        'user': 'user_id',
    }[target_type]


def get_effective_detail_permissions(user_id):
    """사용자의 최종 상세화면 권한 계산 (user > role > dept > NONE)"""
    pages = DetailPage.query.order_by(DetailPage.sort_order).all()
    if not pages:
        return {}

    page_by_id = {p.id: p for p in pages}

    user = UserProfile.query.get(user_id)
    role_user = RoleUser.query.filter_by(user_id=user_id).first()
    role_id = role_user.role_id if role_user else None
    dept_id = user.department_id if user else None

    user_perms = {}
    for p in UserDetailPermission.query.filter_by(user_id=user_id).all():
        user_perms[p.page_id] = p.permission_type

    role_perms = {}
    if role_id:
        for p in RoleDetailPermission.query.filter_by(role_id=role_id).all():
            role_perms[p.page_id] = p.permission_type

    dept_perms = {}
    if dept_id:
        for p in DepartmentDetailPermission.query.filter_by(dept_id=dept_id).all():
            dept_perms[p.page_id] = p.permission_type

    sorted_pages = _topo_sort_detail(pages, page_by_id)
    result = {}

    for page in sorted_pages:
        pid = page.id
        if pid in user_perms:
            result[page.page_code] = user_perms[pid]
        elif pid in role_perms:
            result[page.page_code] = role_perms[pid]
        elif pid in dept_perms:
            result[page.page_code] = dept_perms[pid]
        else:
            parent = page_by_id.get(page.parent_page_id)
            if parent and parent.page_code in result:
                result[page.page_code] = result[parent.page_code]
            else:
                result[page.page_code] = 'READ'

    return result


def _topo_sort_detail(pages, page_by_id):
    """부모가 자식보다 먼저 오도록 정렬 (상세화면용)"""
    visited = set()
    ordered = []

    def visit(p):
        if p.id in visited:
            return
        visited.add(p.id)
        if p.parent_page_id and p.parent_page_id in page_by_id:
            visit(page_by_id[p.parent_page_id])
        ordered.append(p)

    for p in pages:
        visit(p)
    return ordered
