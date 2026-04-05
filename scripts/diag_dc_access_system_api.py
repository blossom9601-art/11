import json
import sqlite3
import urllib.error
import urllib.request


def check_table_exists(db_path: str, table_name: str) -> bool:
    con = sqlite3.connect(db_path)
    try:
        cur = con.execute(
            "select name from sqlite_master where type='table' and name=?",
            (table_name,),
        )
        return cur.fetchone() is not None
    finally:
        con.close()


def http_get(url: str) -> tuple[int, str, str]:
    req = urllib.request.Request(url, method="GET", headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            status = getattr(resp, "status", 200)
            content_type = resp.headers.get("Content-Type", "")
            body = resp.read(600).decode("utf-8", errors="replace")
            return status, content_type, body
    except urllib.error.HTTPError as e:
        body = e.read(600).decode("utf-8", errors="replace")
        return int(e.code), e.headers.get("Content-Type", ""), body


def main() -> None:
    db_path = r"C:\Users\ME\Desktop\blossom\instance\dev_blossom.db"
    table = "dc_access_system"

    print("db_path=", db_path)
    print("table_exists=", check_table_exists(db_path, table))

    urls = [
        "http://127.0.0.1:8080/api/datacenter/access/systems",
        "http://127.0.0.1:8080/datacenter/access/systems",
        # Known existing access endpoints for comparison
        "http://127.0.0.1:8080/api/datacenter/access/entries",
    ]

    for url in urls:
        status, ctype, body = http_get(url)
        print("\nGET", url)
        print("status=", status)
        print("content_type=", ctype)

        # Try to parse JSON if it looks like it
        preview = body.strip()
        if "application/json" in (ctype or "").lower() or preview.startswith("{") or preview.startswith("["):
            try:
                parsed = json.loads(preview)
                # Keep output compact
                if isinstance(parsed, list):
                    print("json_type=list len=", len(parsed))
                    if parsed:
                        print("first_item_keys=", sorted(list(parsed[0].keys()))[:30])
                elif isinstance(parsed, dict):
                    print("json_type=dict keys=", sorted(list(parsed.keys()))[:30])
                else:
                    print("json_type=", type(parsed).__name__)
            except Exception as e:
                print("json_parse_error=", repr(e))
                print("body_preview=", preview[:300])
        else:
            print("body_preview=", preview[:300])


if __name__ == "__main__":
    main()
