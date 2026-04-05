import os
import sqlite3

def check_db(path: str) -> None:
    abs_path = os.path.abspath(path)
    print(f"== {abs_path} ==")
    if not os.path.exists(abs_path):
        print("[MISS] file not found")
        return

    con = sqlite3.connect(abs_path)
    try:
        cur = con.cursor()
        cur.execute("SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name='hw_activate'")
        has = bool(cur.fetchone()[0])
        print("hw_activate table:", "YES" if has else "NO")
        if not has:
            return

        cur.execute("PRAGMA table_info(hw_activate)")
        cols = [r[1] for r in cur.fetchall()]
        print("columns:", cols)

        cur.execute("SELECT COUNT(1) FROM hw_activate")
        total = cur.fetchone()[0]
        print("rows:", total)
    finally:
        con.close()


def main() -> None:
    # Common locations used in this repo
    check_db("dev_blossom.db")
    check_db(os.path.join("instance", "dev_blossom.db"))


if __name__ == "__main__":
    main()
