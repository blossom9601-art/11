"""Clean up agent data with wrong scope_key / empty system_key, then reset pending for re-link."""
import os, sys, sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "instance", "dev_blossom.db")

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

# 1. Delete interfaces with old scope_key format (e.g. 'onpremise_ON_PREMISE')
bad_if = conn.execute(
    "SELECT id, scope_key FROM hw_interface WHERE scope_key LIKE '%\\_ON\\_%' ESCAPE '\\'"
).fetchall()
if bad_if:
    ids = [r["id"] for r in bad_if]
    print(f"[interface] Deleting {len(ids)} rows with bad scope_key: {[r['scope_key'] for r in bad_if[:3]]}")
    conn.execute(f"DELETE FROM hw_interface WHERE id IN ({','.join('?' * len(ids))})", ids)
else:
    print("[interface] No bad scope_key rows found")

# 2. Fix accounts with empty system_key — set from linked asset's system_name
bad_acct = conn.execute(
    "SELECT id, asset_id, asset_scope FROM asset_account WHERE system_key = '' AND is_deleted = 0"
).fetchall()
if bad_acct:
    print(f"[account] Found {len(bad_acct)} rows with empty system_key")
    for r in bad_acct:
        asset = conn.execute(
            "SELECT system_name, asset_name FROM hardware_asset WHERE id = ?", (r["asset_id"],)
        ).fetchone()
        if asset:
            sk = asset["system_name"] or asset["asset_name"] or "unknown"
            conn.execute("UPDATE asset_account SET system_key = ? WHERE id = ?", (sk, r["id"]))
            print(f"  id={r['id']} -> system_key='{sk}'")
else:
    print("[account] No empty system_key rows found")

# 3. Reset agent_pending for asset 27 so it can be re-linked
pending = conn.execute(
    "SELECT id, hostname, is_linked, linked_asset_id FROM agent_pending WHERE linked_asset_id = 27"
).fetchall()
if pending:
    for p in pending:
        print(f"[pending] id={p['id']} hostname={p['hostname']} is_linked={p['is_linked']}")
    conn.execute("UPDATE agent_pending SET is_linked = 0, linked_asset_id = NULL, linked_at = NULL WHERE linked_asset_id = 27")
    print(f"[pending] Reset {len(pending)} pending rows for asset 27")
else:
    print("[pending] No pending rows found for asset 27")

conn.commit()
conn.close()
print("\nDone.")
