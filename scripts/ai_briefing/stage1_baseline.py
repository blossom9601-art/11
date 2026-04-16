import json
import sys
import statistics
import time
from datetime import datetime
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import create_app


QUERIES_PATH = ROOT / "scripts" / "ai_briefing" / "stage1_queries.json"
REPORT_JSON_PATH = ROOT / "reports" / "ai_briefing" / "stage1_baseline_report.json"
REPORT_MD_PATH = ROOT / "reports" / "ai_briefing" / "stage1_baseline_report.md"


def percentile(values, p):
    if not values:
        return 0.0
    if len(values) == 1:
        return float(values[0])
    k = (len(values) - 1) * (p / 100.0)
    f = int(k)
    c = min(f + 1, len(values) - 1)
    if f == c:
        return float(values[f])
    d0 = values[f] * (c - k)
    d1 = values[c] * (k - f)
    return float(d0 + d1)


def load_queries():
    data = json.loads(QUERIES_PATH.read_text(encoding="utf-8"))
    queries = [str(q).strip() for q in data.get("queries", []) if str(q).strip()]
    return queries


def run_baseline():
    app = create_app("testing")
    queries = load_queries()

    latencies = []
    rows_counts = []
    status_codes = []
    samples = []

    with app.test_client() as client:
        with client.session_transaction() as sess:
            # 통합검색은 user_id 세션이 필수
            sess["user_id"] = 1
            sess["emp_no"] = "AI1001"
            sess["role"] = "ADMIN"
            now = datetime.utcnow()
            sess["_login_at"] = now.isoformat()
            sess["_last_active"] = (now - timedelta(seconds=5)).isoformat()

        # 웜업
        client.get("/api/search/unified?q=서버&limit=20")

        for q in queries:
            started = time.perf_counter()
            resp = client.get("/api/search/unified", query_string={"q": q, "limit": 20})
            elapsed_ms = round((time.perf_counter() - started) * 1000.0, 2)

            status_codes.append(resp.status_code)
            latencies.append(elapsed_ms)

            payload = {}
            try:
                payload = resp.get_json(silent=True) or {}
            except Exception:
                payload = {}

            rows = payload.get("rows") or []
            total = int(payload.get("total") or 0)
            rows_counts.append(total)

            samples.append(
                {
                    "query": q,
                    "status": resp.status_code,
                    "latency_ms": elapsed_ms,
                    "total": total,
                    "top_title": (rows[0].get("title") if rows and isinstance(rows[0], dict) else ""),
                }
            )

    sorted_lat = sorted(latencies)
    total_count = len(latencies)
    ok_count = sum(1 for s in status_codes if s == 200)

    summary = {
        "measured_at": datetime.now().isoformat(timespec="seconds"),
        "endpoint": "/api/search/unified",
        "query_count": total_count,
        "status_200_count": ok_count,
        "status_non_200_count": total_count - ok_count,
        "latency_ms": {
            "min": round(min(latencies) if latencies else 0.0, 2),
            "max": round(max(latencies) if latencies else 0.0, 2),
            "avg": round(statistics.mean(latencies) if latencies else 0.0, 2),
            "p50": round(percentile(sorted_lat, 50), 2),
            "p95": round(percentile(sorted_lat, 95), 2),
            "p99": round(percentile(sorted_lat, 99), 2),
        },
        "result_total": {
            "avg": round(statistics.mean(rows_counts) if rows_counts else 0.0, 2),
            "max": int(max(rows_counts) if rows_counts else 0),
            "zero_count": int(sum(1 for c in rows_counts if c == 0)),
        },
    }

    report = {
        "summary": summary,
        "samples": samples,
    }

    REPORT_JSON_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    md = []
    md.append("# AI 브리핑 1단계 기준선 측정 리포트")
    md.append("")
    md.append(f"- 측정 시각: {summary['measured_at']}")
    md.append(f"- 엔드포인트: {summary['endpoint']}")
    md.append(f"- 쿼리 수: {summary['query_count']}")
    md.append(f"- 정상 응답(200): {summary['status_200_count']}")
    md.append(f"- 비정상 응답: {summary['status_non_200_count']}")
    md.append("")
    md.append("## 지연시간(ms)")
    md.append("")
    md.append(f"- min: {summary['latency_ms']['min']}")
    md.append(f"- avg: {summary['latency_ms']['avg']}")
    md.append(f"- p50: {summary['latency_ms']['p50']}")
    md.append(f"- p95: {summary['latency_ms']['p95']}")
    md.append(f"- p99: {summary['latency_ms']['p99']}")
    md.append(f"- max: {summary['latency_ms']['max']}")
    md.append("")
    md.append("## 결과 건수")
    md.append("")
    md.append(f"- 평균 total: {summary['result_total']['avg']}")
    md.append(f"- 최대 total: {summary['result_total']['max']}")
    md.append(f"- total=0 쿼리 수: {summary['result_total']['zero_count']}")
    md.append("")
    md.append("## 샘플 (상위 10개)")
    md.append("")
    md.append("| query | status | latency_ms | total | top_title |")
    md.append("|---|---:|---:|---:|---|")
    for row in samples[:10]:
        md.append(
            f"| {row['query']} | {row['status']} | {row['latency_ms']} | {row['total']} | {row['top_title']} |"
        )

    REPORT_MD_PATH.write_text("\n".join(md) + "\n", encoding="utf-8")

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"\nWrote: {REPORT_JSON_PATH}")
    print(f"Wrote: {REPORT_MD_PATH}")


if __name__ == "__main__":
    run_baseline()
