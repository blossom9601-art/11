import http.cookiejar
import ssl
import urllib.parse
import urllib.request

ctx = ssl._create_unverified_context()
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(jar),
    urllib.request.HTTPSHandler(context=ctx),
)


def request(url, data=None):
    body = None
    headers = {}
    if data is not None:
        body = urllib.parse.urlencode(data).encode("utf-8")
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=body, headers=headers)
    return opener.open(req, timeout=15)


def read_text(response):
    return response.read().decode("utf-8", "replace")


r = request("https://192.168.56.108/login")
print("login", r.status, r.url)

r = request(
    "https://192.168.56.108/login",
    {"employee_id": "admin", "password": "admin1234!"},
)
text = read_text(r)
print("post", r.status, r.url, text[:80].replace("\n", " "))

r = request("https://192.168.56.108/b/dashboard_my")
text = read_text(r)
print("dash_my", r.status, r.url, "dashbuild1", "20260606_dashbuild1" in text)
print(text[:200].replace("\n", " "))

r = request("https://192.168.56.108/static/js/dashboard_workspace.js?v=20260606_dashbuild1")
text = read_text(r)
print("js", r.status, "sample_filter", "SAMPLE_IDS" in text, "client_tabs", "data-dashboard-page" in text, "full_create", "dw-full-create" in text)

r = request("https://192.168.56.108/static/css/dashboard_workspace.css?v=20260606_dashbuild1")
text = read_text(r)
print("css", r.status, "fullscreen", "dashboard-builder-active" in text, "primary_add", "#dw-create-btn" in text)

r = request("https://192.168.56.108/b/dashboard_builder?new=1")
text = read_text(r)
print("builder", r.status, r.url, "dashbuild1", "20260606_dashbuild1" in text)
