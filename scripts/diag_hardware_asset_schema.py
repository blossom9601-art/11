import json
import os
import sqlite3

DBS = [
    r"C:\Users\ME\Desktop\blossom\instance\hardware_asset.db",
    r"C:\Users\ME\Desktop\blossom\instance\dev_blossom.db",
    r"C:\dev_blossom.db",
    r"C:\Users\ME\Desktop\blossom\dev_blossom.db",
]


def inspect_db(path: str):
    result = {"path": path, "exists": os.path.exists(path)}
    if not result["exists"]:
        return result

    conn = sqlite3.connect(path)
    try:
        tables = [
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).fetchall()
        ]
        result["tables_count"] = len(tables)
        result["has_hardware_asset"] = "hardware_asset" in tables
        if result["has_hardware_asset"]:
            cols = conn.execute("PRAGMA table_info(hardware_asset)").fetchall()
            result["hardware_asset_columns"] = [c[1] for c in cols]
    finally:
        conn.close()

    return result


if __name__ == "__main__":
    out = [inspect_db(p) for p in DBS]
    print(json.dumps(out, ensure_ascii=False, indent=2))
