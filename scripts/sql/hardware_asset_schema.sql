PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS biz_work_category (
    category_code TEXT PRIMARY KEY,
    category_name TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    created_by    TEXT NOT NULL,
    updated_at    TEXT,
    updated_by    TEXT,
    is_deleted    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS biz_work_division (
    division_code TEXT PRIMARY KEY,
    division_name TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    created_by    TEXT NOT NULL,
    updated_at    TEXT,
    updated_by    TEXT,
    is_deleted    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS biz_work_status (
    status_code   TEXT PRIMARY KEY,
    status_name   TEXT NOT NULL,
    status_level  TEXT,
    created_at    TEXT NOT NULL,
    created_by    TEXT NOT NULL,
    updated_at    TEXT,
    updated_by    TEXT,
    is_deleted    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS biz_work_operation (
    operation_code TEXT PRIMARY KEY,
    operation_name TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    created_by     TEXT NOT NULL,
    updated_at     TEXT,
    updated_by     TEXT,
    is_deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS biz_work_group (
    group_code  TEXT PRIMARY KEY,
    group_name  TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    created_by  TEXT NOT NULL,
    updated_at  TEXT,
    updated_by  TEXT,
    is_deleted  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS biz_vendor_manufacturer (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    manufacturer_code   TEXT NOT NULL UNIQUE,
    manufacturer_name   TEXT NOT NULL,
    address             TEXT,
    business_no         TEXT,
    call_center         TEXT,
    hw_count            INTEGER DEFAULT 0,
    sw_count            INTEGER DEFAULT 0,
    component_count     INTEGER DEFAULT 0,
    remark              TEXT,
    created_at          TEXT NOT NULL,
    created_by          TEXT NOT NULL,
    updated_at          TEXT,
    updated_by          TEXT,
    is_deleted          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hw_server_type (
    server_code TEXT PRIMARY KEY,
    model_name  TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    created_by  TEXT NOT NULL,
    updated_at  TEXT,
    updated_by  TEXT,
    is_deleted  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS org_center (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    center_code   TEXT NOT NULL UNIQUE,
    center_name   TEXT NOT NULL,
    location      TEXT,
    usage         TEXT,
    seismic_rating REAL,
    rack_qty      INTEGER DEFAULT 0,
    hw_qty        INTEGER DEFAULT 0,
    sw_qty        INTEGER DEFAULT 0,
    line_qty      INTEGER DEFAULT 0,
    note          TEXT,
    created_at    TEXT NOT NULL,
    created_by    TEXT NOT NULL,
    updated_at    TEXT,
    updated_by    TEXT,
    is_deleted    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS org_rack (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    rack_code            TEXT NOT NULL UNIQUE,
    business_status_code TEXT NOT NULL,
    business_name        TEXT NOT NULL,
    manufacturer_code    TEXT NOT NULL,
    system_model_code    TEXT NOT NULL,
    serial_number        TEXT NOT NULL,
    center_code          TEXT NOT NULL,
    rack_position        TEXT NOT NULL,
    system_height_u      INTEGER NOT NULL DEFAULT 0,
    system_dept_code     TEXT NOT NULL,
    system_manager_id    INTEGER NOT NULL,
    service_dept_code    TEXT NOT NULL,
    service_manager_id   INTEGER NOT NULL,
    remark               TEXT,
    created_at           TEXT NOT NULL,
    created_by           TEXT NOT NULL,
    updated_at           TEXT,
    updated_by           TEXT,
    is_deleted           INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (center_code) REFERENCES org_center(center_code)
);

CREATE TABLE IF NOT EXISTS org_department (
    dept_code  TEXT PRIMARY KEY,
    dept_name  TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_at TEXT,
    updated_by TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS org_user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_no TEXT NOT NULL UNIQUE,
    name TEXT,
    nickname TEXT,
    company TEXT,
    department TEXT,
    location TEXT,
    ext_phone TEXT,
    mobile_phone TEXT,
    email TEXT,
    role TEXT,
    allowed_ip TEXT,
    job TEXT,
    profile_image TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_at TEXT,
    updated_by TEXT,
    last_login_at TEXT,
    password_changed_at TEXT,
    password_expires_at TEXT,
    locked INTEGER DEFAULT 0,
    fail_cnt INTEGER DEFAULT 0,
    note TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE VIEW IF NOT EXISTS "user" AS
SELECT
    id,
    emp_no,
    name,
    nickname,
    company,
    department,
    location,
    ext_phone,
    mobile_phone,
    email,
    role,
    allowed_ip,
    job,
    profile_image,
    created_at,
    created_by,
    updated_at,
    updated_by,
    is_deleted,
    last_login_at,
    password_changed_at,
    password_expires_at,
    locked,
    fail_cnt,
    note
FROM org_user;

CREATE TABLE IF NOT EXISTS hardware (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_category       TEXT NOT NULL,
    asset_type           TEXT NOT NULL,
    asset_code           TEXT NOT NULL UNIQUE,
    asset_name           TEXT NOT NULL,
    work_category_code   TEXT,
    work_division_code   TEXT,
    work_status_code     TEXT,
    work_operation_code  TEXT,
    work_group_code      TEXT,
    work_name            TEXT,
    system_name          TEXT,
    system_ip            TEXT,
    mgmt_ip              TEXT,
    manufacturer_code    TEXT,
    server_code          TEXT,
    center_code          TEXT,
    rack_code            TEXT,
    system_slot          INTEGER,
    system_size          INTEGER,
    system_dept_code     TEXT,
    system_owner_emp_no  TEXT,
    system_owner_display TEXT,
    service_dept_code    TEXT,
    service_owner_emp_no TEXT,
    service_owner_display TEXT,
    virtualization_type  TEXT,
    cia_confidentiality  INTEGER,
    cia_integrity        INTEGER,
    cia_availability     INTEGER,
    security_score       INTEGER,
    system_grade         TEXT,
    is_core_system       INTEGER DEFAULT 0,
    has_dr_site          INTEGER DEFAULT 0,
    has_service_ha       INTEGER DEFAULT 0,
    service_ha_type      TEXT,
    created_at           TEXT NOT NULL,
    created_by           TEXT NOT NULL,
    updated_at           TEXT,
    updated_by           TEXT,
    is_deleted           INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (work_category_code)   REFERENCES biz_work_category(category_code),
    FOREIGN KEY (work_division_code)   REFERENCES biz_work_division(division_code),
    FOREIGN KEY (work_status_code)     REFERENCES biz_work_status(status_code),
    FOREIGN KEY (work_operation_code)  REFERENCES biz_work_operation(operation_code),
    FOREIGN KEY (work_group_code)      REFERENCES biz_work_group(group_code),
    FOREIGN KEY (manufacturer_code)    REFERENCES biz_vendor_manufacturer(manufacturer_code),
    FOREIGN KEY (server_code)          REFERENCES hw_server_type(server_code),
    FOREIGN KEY (center_code)          REFERENCES org_center(center_code),
    FOREIGN KEY (rack_code)            REFERENCES org_rack(rack_code),
    FOREIGN KEY (system_dept_code)     REFERENCES org_department(dept_code),
    FOREIGN KEY (system_owner_emp_no)  REFERENCES org_user(emp_no),
    FOREIGN KEY (service_dept_code)    REFERENCES org_department(dept_code),
    FOREIGN KEY (service_owner_emp_no) REFERENCES org_user(emp_no)
);

    CREATE INDEX IF NOT EXISTS idx_hardware_code ON hardware(asset_code);
    CREATE INDEX IF NOT EXISTS idx_hardware_center ON hardware(center_code);
    CREATE INDEX IF NOT EXISTS idx_hardware_rack ON hardware(rack_code);
