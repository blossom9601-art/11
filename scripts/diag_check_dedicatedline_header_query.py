import urllib.request
import urllib.error


def fetch(url: str, timeout: float = 10.0) -> tuple[int, str, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "blossom-diag"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = getattr(resp, "status", 200)
            final_url = resp.geturl()
            body = resp.read().decode("utf-8", "replace")
            return status, final_url, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        return e.code, getattr(e, "url", url), body


def check(name: str, url: str, expect_org: str, expect_proto: str) -> int:
    status, final_url, body = fetch(url)
    has_org = expect_org in body
    has_proto = expect_proto in body
    redirected = final_url != url

    verdict = "OK" if (status == 200 and has_org and has_proto) else "CHECK"
    print(
        f"[{verdict}] {name}: status={status} redirected={redirected} "
        f"has_org={has_org} has_proto={has_proto}"
    )
    if verdict != "OK":
        # Help debug quickly without dumping full HTML
        snippet_keys = []
        for key in ["login", "로그인", "Sign in", "Unauthorized", "권한", "error", "오류"]:
            if key in body:
                snippet_keys.append(key)
        if snippet_keys:
            print(f"  hints: found {snippet_keys}")
        if redirected:
            print(f"  final_url: {final_url}")
    return 0 if verdict == "OK" else 1


def main() -> int:
    base = "http://127.0.0.1:8080"

    checks = [
        (
            "customer_detail",
            f"{base}/p/gov_dedicatedline_customer_detail?id=1&org_name=TEST-ORG-CUST&protocol_code=TCP",
            "TEST-ORG-CUST",
            "TCP",
        ),
        (
            "customer_task",
            f"{base}/p/gov_dedicatedline_customer_task?id=1&org_name=TEST-ORG-CUST&protocol_code=TCP",
            "TEST-ORG-CUST",
            "TCP",
        ),
        (
            "van_detail",
            f"{base}/p/gov_dedicatedline_van_detail?id=2&org_name=TEST-ORG-VAN&protocol_code=X25",
            "TEST-ORG-VAN",
            "X25",
        ),
        (
            "van_log",
            f"{base}/p/gov_dedicatedline_van_log?id=2&org_name=TEST-ORG-VAN&protocol_code=X25",
            "TEST-ORG-VAN",
            "X25",
        ),
        (
            "affiliate_detail",
            f"{base}/p/gov_dedicatedline_affiliate_detail?id=3&org_name=TEST-ORG-AFF&protocol_code=TCP",
            "TEST-ORG-AFF",
            "TCP",
        ),
        (
            "affiliate_file",
            f"{base}/p/gov_dedicatedline_affiliate_file?id=3&org_name=TEST-ORG-AFF&protocol_code=TCP",
            "TEST-ORG-AFF",
            "TCP",
        ),
        (
            "intranet_detail",
            f"{base}/p/gov_dedicatedline_intranet_detail?id=4&org_name=TEST-ORG-INTRA&protocol_code=TCP",
            "TEST-ORG-INTRA",
            "TCP",
        ),
        (
            "intranet_manager",
            f"{base}/p/gov_dedicatedline_intranet_manager?id=4&org_name=TEST-ORG-INTRA&protocol_code=TCP",
            "TEST-ORG-INTRA",
            "TCP",
        ),
    ]

    fails = 0
    for name, url, org, proto in checks:
        fails += check(name, url, org, proto)

    print("---")
    if fails == 0:
        print("PASS: query-based org/protocol appears in initial HTML for all checked pages.")
        return 0

    print(
        "NOTE: Some checks failed. If pages require login, this script will be redirected "
        "to a login page and the expected strings won't appear in HTML."
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
