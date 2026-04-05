import sqlite3

c = sqlite3.connect('instance/dev_blossom.db')
c.execute('DROP TABLE IF EXISTS capex_contract__tmp')
c.execute('''CREATE TABLE capex_contract__tmp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    capex_type TEXT NOT NULL,
    contract_status TEXT NOT NULL,
    contract_name TEXT NOT NULL,
    contract_code TEXT NOT NULL,
    vendor_id INTEGER,
    total_license_count INTEGER,
    active_license_count INTEGER,
    maintenance_start_date TEXT,
    maintenance_end_date TEXT,
    maintenance_amount INTEGER,
    inspection_target INTEGER DEFAULT 0,
    memo TEXT,
    description TEXT,
    contract_date TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL,
    updated_at TEXT,
    updated_by TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0
)''')
c.execute('''INSERT INTO capex_contract__tmp (
    id, capex_type, contract_status, contract_name, contract_code, vendor_id,
    total_license_count, active_license_count,
    maintenance_start_date, maintenance_end_date, maintenance_amount,
    inspection_target, memo, description, contract_date,
    created_at, created_by, updated_at, updated_by, is_deleted)
    SELECT id, capex_type, contract_status, contract_name, contract_code, vendor_id,
           total_license_count, active_license_count,
           maintenance_start_date, maintenance_end_date, maintenance_amount,
           inspection_target, memo, description, contract_date,
           created_at, created_by, updated_at, updated_by, is_deleted
    FROM capex_contract''')
c.execute('DROP TABLE capex_contract')
c.execute('ALTER TABLE capex_contract__tmp RENAME TO capex_contract')
c.commit()
rows = c.execute('PRAGMA index_list(capex_contract)').fetchall()
print('Indexes after migration:', rows)
print('Rows:', c.execute('SELECT count(*) FROM capex_contract').fetchone())
c.close()
print('Done - UNIQUE constraint on contract_code removed!')
