"""
Blossom DB 초기화 - 직접 SQLite SQL로 필수 테이블 생성 + 관리자 시드
Flask create_app()을 통하지 않고 순수 sqlite3 + werkzeug만 사용
"""
import paramiko, textwrap

HOST = "192.168.56.108"
USER = "root"
PASS = "123456"
DB_PATH = "/opt/blossom/web/instance/dev_blossom.db"
VENV_PYTHON = "/opt/blossom/web/venv/bin/python3"

# 서버에서 실행할 Python 스크립트
REMOTE_SCRIPT = textwrap.dedent(r'''
import sqlite3, sys, os

DB = "{db_path}"
os.makedirs(os.path.dirname(DB), exist_ok=True)

conn = sqlite3.connect(DB)
c = conn.cursor()

# ───────── 1. 핵심 인증 테이블 ─────────
c.executescript("""
CREATE TABLE IF NOT EXISTS auth_users (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_no                 VARCHAR(30)  NOT NULL UNIQUE,
    password_hash          VARCHAR(256) NOT NULL,
    email                  VARCHAR(255),
    role                   VARCHAR(50)  DEFAULT 'user',
    status                 VARCHAR(20)  DEFAULT 'active',
    created_at             DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at             DATETIME     DEFAULT CURRENT_TIMESTAMP,
    last_login_at          DATETIME,
    login_fail_cnt         INTEGER      DEFAULT 0,
    locked_until           DATETIME,
    last_terms_accepted_at DATETIME
);

CREATE TABLE IF NOT EXISTS auth_login_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_no     VARCHAR(30) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    success    BOOLEAN NOT NULL,
    logged_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_auth_login_history_emp_no
    ON auth_login_history(emp_no);

CREATE TABLE IF NOT EXISTS auth_roles (
    role        VARCHAR(50) PRIMARY KEY,
    description VARCHAR(255),
    permissions TEXT
);

CREATE TABLE IF NOT EXISTS auth_password_history (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_no        VARCHAR(30) NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    changed_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    changed_by    VARCHAR(30)
);
CREATE INDEX IF NOT EXISTS ix_auth_pw_hist_emp
    ON auth_password_history(emp_no);

-- ───────── 2. 조직/사용자 프로필 ─────────
CREATE TABLE IF NOT EXISTS org_department (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        VARCHAR(128),
    full_path   VARCHAR(512),
    parent_id   INTEGER,
    sort_order  INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS org_user (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_no              VARCHAR(30)  NOT NULL UNIQUE,
    name                VARCHAR(128),
    nickname            VARCHAR(128),
    company             VARCHAR(128),
    department_id       INTEGER REFERENCES org_department(id),
    department          VARCHAR(128),
    employment_status   VARCHAR(20)  DEFAULT '재직',
    ext_phone           VARCHAR(32),
    mobile_phone        VARCHAR(32),
    email               VARCHAR(255),
    role                VARCHAR(50),
    allowed_ip          TEXT,
    job                 TEXT,
    profile_image       VARCHAR(255),
    created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
    last_login_at       DATETIME,
    password_changed_at DATETIME,
    password_expires_at DATETIME,
    locked              BOOLEAN      DEFAULT 0,
    fail_cnt            INTEGER      DEFAULT 0,
    note                TEXT,
    motto               TEXT,
    signature_image     TEXT
);
CREATE INDEX IF NOT EXISTS ix_org_user_emp_no ON org_user(emp_no);

-- ───────── 3. 보안 정책 ─────────
CREATE TABLE IF NOT EXISTS security_audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type  VARCHAR(50) NOT NULL,
    emp_no      VARCHAR(30) NOT NULL DEFAULT '',
    ip_address  VARCHAR(45) NOT NULL DEFAULT '',
    description VARCHAR(500) NOT NULL DEFAULT '',
    details     TEXT DEFAULT '',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_log_type    ON security_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_emp     ON security_audit_log(emp_no);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON security_audit_log(created_at);

CREATE TABLE IF NOT EXISTS security_policy (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    min_length                INTEGER NOT NULL DEFAULT 12,
    max_length                INTEGER NOT NULL DEFAULT 64,
    expiry_days               INTEGER NOT NULL DEFAULT 90,
    history                   INTEGER NOT NULL DEFAULT 5,
    fail_lock_threshold       INTEGER NOT NULL DEFAULT 5,
    lock_duration_minutes     INTEGER NOT NULL DEFAULT 30,
    require_uppercase         INTEGER NOT NULL DEFAULT 1,
    require_number            INTEGER NOT NULL DEFAULT 1,
    require_symbol            INTEGER NOT NULL DEFAULT 1,
    block_common_passwords    INTEGER NOT NULL DEFAULT 1,
    block_user_id             INTEGER NOT NULL DEFAULT 1,
    block_personal_info       INTEGER NOT NULL DEFAULT 1,
    block_sequential_chars    INTEGER NOT NULL DEFAULT 1,
    block_repeated_chars      INTEGER NOT NULL DEFAULT 1,
    block_keyboard_patterns   INTEGER NOT NULL DEFAULT 1,
    banned_words              TEXT    NOT NULL DEFAULT '',
    force_change_first_login  INTEGER NOT NULL DEFAULT 1,
    force_change_admin_reset  INTEGER NOT NULL DEFAULT 1,
    min_change_interval_hours INTEGER NOT NULL DEFAULT 24,
    show_strength_meter       INTEGER NOT NULL DEFAULT 1,
    idle_minutes              INTEGER NOT NULL DEFAULT 30,
    absolute_hours            INTEGER NOT NULL DEFAULT 12,
    max_sessions              INTEGER NOT NULL DEFAULT 1,
    notify_new_login          INTEGER NOT NULL DEFAULT 1,
    auto_logout_admin         INTEGER NOT NULL DEFAULT 0,
    logout_on_browser_close   INTEGER NOT NULL DEFAULT 1,
    session_reissue_minutes   INTEGER NOT NULL DEFAULT 30,
    concurrent_policy         TEXT    NOT NULL DEFAULT 'kill_oldest',
    updated_at                TEXT,
    updated_by                TEXT
);

CREATE TABLE IF NOT EXISTS security_policy_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    field_name  TEXT NOT NULL,
    old_value   TEXT,
    new_value   TEXT,
    changed_by  TEXT,
    changed_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS banned_passwords (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    word VARCHAR(255) NOT NULL UNIQUE
);

-- ───────── 4. MFA ─────────
CREATE TABLE IF NOT EXISTS mfa_config (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    enabled              INTEGER NOT NULL DEFAULT 0,
    default_type         TEXT    NOT NULL DEFAULT 'totp',
    totp_enabled         INTEGER NOT NULL DEFAULT 1,
    sms_enabled          INTEGER NOT NULL DEFAULT 1,
    email_enabled        INTEGER NOT NULL DEFAULT 1,
    company_otp_enabled  INTEGER NOT NULL DEFAULT 0,
    grace_period_days    INTEGER NOT NULL DEFAULT 0,
    remember_device_days INTEGER NOT NULL DEFAULT 7,
    totp_secret          TEXT    NOT NULL DEFAULT '',
    sms_number           TEXT    NOT NULL DEFAULT '',
    email                TEXT    NOT NULL DEFAULT '',
    allow_user_choice    INTEGER NOT NULL DEFAULT 1,
    code_length          INTEGER NOT NULL DEFAULT 6,
    code_ttl_seconds     INTEGER NOT NULL DEFAULT 300,
    updated_at           TEXT
);

CREATE TABLE IF NOT EXISTS sms_config (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    provider     TEXT NOT NULL DEFAULT 'coolsms',
    api_key      TEXT NOT NULL DEFAULT '',
    api_secret   TEXT NOT NULL DEFAULT '',
    sender       TEXT NOT NULL DEFAULT '',
    enabled      INTEGER NOT NULL DEFAULT 0,
    updated_at   TEXT
);

CREATE TABLE IF NOT EXISTS company_otp_config (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    api_url         TEXT NOT NULL DEFAULT '',
    api_key         TEXT NOT NULL DEFAULT '',
    company_code    TEXT NOT NULL DEFAULT '',
    enabled         INTEGER NOT NULL DEFAULT 0,
    timeout_seconds INTEGER NOT NULL DEFAULT 60,
    updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS mfa_pending_codes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    session_key  VARCHAR(128) NOT NULL UNIQUE,
    code         VARCHAR(32)  NOT NULL,
    mfa_type     VARCHAR(20)  NOT NULL DEFAULT 'totp',
    emp_no       VARCHAR(30)  NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL,
    expires_at   TEXT NOT NULL
);

-- ───────── 5. 세션 관리 ─────────
CREATE TABLE IF NOT EXISTS active_sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  VARCHAR(255) NOT NULL UNIQUE,
    emp_no      VARCHAR(64)  NOT NULL,
    user_name   TEXT    NOT NULL DEFAULT '',
    ip_address  TEXT,
    user_agent  TEXT,
    browser     TEXT,
    os          TEXT,
    created_at  TEXT    NOT NULL,
    last_active TEXT    NOT NULL,
    is_current  INTEGER NOT NULL DEFAULT 0
);

-- ───────── 6. 권한 메뉴 ─────────
CREATE TABLE IF NOT EXISTS role (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             VARCHAR(128) NOT NULL UNIQUE,
    description      VARCHAR(512),
    dashboard_read   BOOLEAN DEFAULT 0,
    dashboard_write  BOOLEAN DEFAULT 0,
    hardware_read    BOOLEAN DEFAULT 0,
    hardware_write   BOOLEAN DEFAULT 0,
    software_read    BOOLEAN DEFAULT 0,
    software_write   BOOLEAN DEFAULT 0,
    governance_read  BOOLEAN DEFAULT 0,
    governance_write BOOLEAN DEFAULT 0,
    datacenter_read  BOOLEAN DEFAULT 0,
    datacenter_write BOOLEAN DEFAULT 0,
    cost_read        BOOLEAN DEFAULT 0,
    cost_write       BOOLEAN DEFAULT 0,
    project_read     BOOLEAN DEFAULT 0,
    project_write    BOOLEAN DEFAULT 0,
    category_read    BOOLEAN DEFAULT 0,
    category_write   BOOLEAN DEFAULT 0,
    insight_read     BOOLEAN DEFAULT 0,
    insight_write    BOOLEAN DEFAULT 0,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_user (
    role_id   INTEGER NOT NULL REFERENCES role(id) ON DELETE CASCADE,
    user_id   INTEGER NOT NULL REFERENCES org_user(id) ON DELETE CASCADE,
    mapped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, user_id)
);

CREATE TABLE IF NOT EXISTS menu (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_code      VARCHAR(64)  UNIQUE NOT NULL,
    menu_name      VARCHAR(128) NOT NULL,
    parent_menu_id INTEGER REFERENCES menu(id),
    sort_order     INTEGER DEFAULT 0,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_menu_permission (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    role_id         INTEGER NOT NULL REFERENCES role(id) ON DELETE CASCADE,
    menu_id         INTEGER NOT NULL REFERENCES menu(id) ON DELETE CASCADE,
    permission_type VARCHAR(10) NOT NULL DEFAULT 'NONE',
    UNIQUE(role_id, menu_id)
);

CREATE TABLE IF NOT EXISTS department_menu_permission (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    dept_id         INTEGER NOT NULL REFERENCES org_department(id) ON DELETE CASCADE,
    menu_id         INTEGER NOT NULL REFERENCES menu(id) ON DELETE CASCADE,
    permission_type VARCHAR(10) NOT NULL DEFAULT 'NONE',
    UNIQUE(dept_id, menu_id)
);

CREATE TABLE IF NOT EXISTS user_menu_permission (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES org_user(id) ON DELETE CASCADE,
    menu_id         INTEGER NOT NULL REFERENCES menu(id) ON DELETE CASCADE,
    permission_type VARCHAR(10) NOT NULL DEFAULT 'NONE',
    UNIQUE(user_id, menu_id)
);

CREATE TABLE IF NOT EXISTS permission_audit_log (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type       VARCHAR(20)  NOT NULL DEFAULT 'role',
    target_id         INTEGER      NOT NULL DEFAULT 0,
    menu_code         VARCHAR(64)  NOT NULL,
    before_permission VARCHAR(10),
    after_permission  VARCHAR(10),
    changed_by        VARCHAR(128),
    changed_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    role_id           INTEGER,
    role_name         VARCHAR(128)
);

CREATE TABLE IF NOT EXISTS role_detail_permission (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    role_id         INTEGER NOT NULL REFERENCES role(id) ON DELETE CASCADE,
    detail_code     VARCHAR(128) NOT NULL,
    permission_type VARCHAR(10)  NOT NULL DEFAULT 'NONE',
    UNIQUE(role_id, detail_code)
);
""")

conn.commit()
print("TABLES_CREATED_OK")

# ───────── 시드: 기본 보안 정책 (id=1) ─────────
c.execute("SELECT COUNT(*) FROM security_policy")
if c.fetchone()[0] == 0:
    c.execute("INSERT INTO security_policy (id) VALUES (1)")
    conn.commit()
    print("SECURITY_POLICY_SEED_OK")

# ───────── 시드: MFA 기본 설정 (id=1) ─────────
c.execute("SELECT COUNT(*) FROM mfa_config")
if c.fetchone()[0] == 0:
    c.execute("INSERT INTO mfa_config (id) VALUES (1)")
    conn.commit()
    print("MFA_CONFIG_SEED_OK")

# ───────── 시드: 기본 역할 ─────────
roles_data = [
    ('admin', '시스템 관리자', 'all'),
    ('user',  '일반 사용자',  'read'),
    ('auditor', '감사자',     'read,audit'),
]
for r, d, p in roles_data:
    c.execute("SELECT COUNT(*) FROM auth_roles WHERE role=?", (r,))
    if c.fetchone()[0] == 0:
        c.execute("INSERT INTO auth_roles (role, description, permissions) VALUES (?,?,?)", (r, d, p))
conn.commit()
print("AUTH_ROLES_SEED_OK")

# ───────── 시드: 관리자 계정 ─────────
c.execute("SELECT COUNT(*) FROM auth_users WHERE emp_no='admin'")
if c.fetchone()[0] == 0:
    # werkzeug으로 패스워드 해시 생성
    sys.path.insert(0, '/opt/blossom/web')
    from werkzeug.security import generate_password_hash
    pw_hash = generate_password_hash('admin1234!', method='pbkdf2:sha256', salt_length=16)
    c.execute("""
        INSERT INTO auth_users (emp_no, password_hash, email, role, status)
        VALUES ('admin', ?, '', 'admin', 'active')
    """, (pw_hash,))
    conn.commit()
    print("ADMIN_USER_CREATED: admin / admin1234!")
else:
    print("ADMIN_USER_EXISTS")

# ───────── 테이블 목록 확인 ─────────
c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in c.fetchall()]
print(f"TOTAL_TABLES: {{len(tables)}}")
print("TABLES:", ", ".join(tables))

conn.close()
print("ALL_DONE")
'''.format(db_path=DB_PATH))


def run():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)

    # 원격 서버에 스크립트를 파일로 저장 후 venv python으로 실행
    sftp = ssh.open_sftp()
    script_path = "/tmp/_blossom_init_tables.py"
    with sftp.open(script_path, "w") as f:
        f.write(REMOTE_SCRIPT)
    sftp.close()

    cmd = f"{VENV_PYTHON} {script_path}"
    print(f"[*] Running: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=30)
    out = stdout.read().decode()
    err = stderr.read().decode()
    print("--- STDOUT ---")
    print(out)
    if err.strip():
        print("--- STDERR ---")
        print(err)

    # 서비스 재시작
    print("\n[*] Restarting blossom-web service...")
    stdin, stdout, stderr = ssh.exec_command("systemctl restart blossom-web", timeout=15)
    print(stdout.read().decode())
    err2 = stderr.read().decode()
    if err2.strip():
        print(err2)

    # 서비스 상태 확인
    import time
    time.sleep(2)
    stdin, stdout, stderr = ssh.exec_command("systemctl is-active blossom-web", timeout=10)
    status = stdout.read().decode().strip()
    print(f"[*] blossom-web status: {status}")

    # 로그인 테스트
    stdin, stdout, stderr = ssh.exec_command(
        f"""{VENV_PYTHON} -c "
import requests, urllib3
urllib3.disable_warnings()
s = requests.Session()
r = s.get('https://127.0.0.1/login', verify=False)
print('GET /login:', r.status_code)
r2 = s.post('https://127.0.0.1/login', data={{'emp_no':'admin','password':'admin1234!'}}, verify=False, allow_redirects=False)
print('POST /login:', r2.status_code, r2.headers.get('Location',''))
"
""", timeout=15)
    out3 = stdout.read().decode()
    err3 = stderr.read().decode()
    print("--- LOGIN TEST ---")
    print(out3)
    if err3.strip():
        print(err3)

    ssh.close()
    print("\n[DONE]")

if __name__ == "__main__":
    run()
