import sqlite3
conn = sqlite3.connect('instance/dev_blossom.db')
c = conn.execute("UPDATE cost_capex_contract_tab62 SET contract_type = '매입' WHERE contract_type = '구매'")
print(f'Updated {c.rowcount} rows')
conn.commit()
conn.close()
