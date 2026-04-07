"""agent_pending 테이블 데이터 조회"""
import sqlite3, os, glob

for p in glob.glob("instance/*.db"):
    try:
        conn = sqlite3.connect(p)
        conn.row_factory = sqlite3.Row
        tables = [r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()]
        if "agent_pending" in tables:
            print(f"=== {p} ===")
            rows = conn.execute(
                "SELECT id, hostname, ip_address, received_at, is_linked "
                "FROM agent_pending ORDER BY received_at DESC"
            ).fetchall()
            for r in rows:
                print(dict(r))
            print(f"Total: {len(rows)}")

            # 중복 테스트 쿼리
            print("\n--- Deduplicated query ---")
            cutoff = "2026-04-06 06:00:00"
            dedup = conn.execute(
                """SELECT p.id, p.hostname, p.ip_address, p.received_at
                   FROM agent_pending p
                   INNER JOIN (
                       SELECT hostname, MAX(received_at) AS max_ra
                       FROM agent_pending
                       WHERE is_linked = 0 AND received_at >= ?
                       GROUP BY hostname
                   ) latest ON p.hostname = latest.hostname
                            AND p.received_at = latest.max_ra
                   WHERE p.is_linked = 0
                   ORDER BY p.received_at DESC""",
                (cutoff,),
            ).fetchall()
            for r in dedup:
                print(dict(r))
            print(f"Dedup total: {len(dedup)}")
        conn.close()
    except Exception as e:
        print(f"Error on {p}: {e}")
