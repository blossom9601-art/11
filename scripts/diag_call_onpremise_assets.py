import urllib.error
import urllib.request


def main() -> None:
    url = "http://127.0.0.1:8080/api/hardware/onpremise/assets?page_size=5"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read().decode("utf-8", "replace")
            print("STATUS", r.status)
            print(body[:2000])
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        print("STATUS", e.code)
        print(body[:2000])


if __name__ == "__main__":
    main()
