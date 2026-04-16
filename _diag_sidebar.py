"""진단: 운영서버 blossom.js 이벤트 핸들러 확인 + 실시간 클릭 테스트"""
import paramiko

HOST = "192.168.56.108"
USER = "root"
PASS = "123456"

def ssh_exec(ssh, cmd, timeout=15):
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    return stdout.read().decode("utf-8", "replace"), stderr.read().decode("utf-8", "replace")

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=10)

    # 1. spa_shell.html에서 blossom.js 버전 확인
    print("=== spa_shell.html blossom.js version ===")
    out, _ = ssh_exec(ssh, "grep 'blossom.js' /opt/blossom/web/app/templates/layouts/spa_shell.html")
    print(out.strip())

    # 2. blossom.js에서 핵심 핸들러 패턴이 있는지 확인
    print("\n=== blossom.js: submenu-trigger event delegation ===")
    out, _ = ssh_exec(ssh, "grep -n 'submenu-trigger' /opt/blossom/web/static/js/blossom.js")
    print(out.strip() if out.strip() else "NOT FOUND!")

    print("\n=== blossom.js: sidebar SPA link binding ===")
    out, _ = ssh_exec(ssh, "grep -n 'sidebarLinks' /opt/blossom/web/static/js/blossom.js | head -5")
    print(out.strip() if out.strip() else "NOT FOUND!")

    print("\n=== blossom.js: __spaCanIntercept ===")
    out, _ = ssh_exec(ssh, "grep -n '__spaCanIntercept' /opt/blossom/web/static/js/blossom.js | head -5")
    print(out.strip() if out.strip() else "NOT FOUND!")

    print("\n=== blossom.js: __spaRoutePrefixes ===")
    out, _ = ssh_exec(ssh, "grep -n '__spaRoutePrefixes' /opt/blossom/web/static/js/blossom.js")
    print(out.strip() if out.strip() else "NOT FOUND!")

    # 3. blossom.js 파일 크기와 줄 수
    print("\n=== blossom.js file stats ===")
    out, _ = ssh_exec(ssh, "wc -l /opt/blossom/web/static/js/blossom.js; ls -la /opt/blossom/web/static/js/blossom.js")
    print(out.strip())

    # 4. 로컬 blossom.js와 비교 (MD5)
    print("\n=== blossom.js timestamp ===")
    out, _ = ssh_exec(ssh, "stat /opt/blossom/web/static/js/blossom.js | grep -i 'modify'")
    print(out.strip())

    # 5. sidebar HTML 확인 (menu-link 개수)
    print("\n=== Sidebar HTML: rendered links test ===")
    py_script = r'''
import requests, urllib3, re
urllib3.disable_warnings()
s = requests.Session()
# login
r = s.post("https://127.0.0.1/login",
    data={"employee_id": "ADMIN", "password": "admin123!"},
    verify=False, allow_redirects=True, timeout=15)
print("Login redirect chain:", [rr.url for rr in r.history])
print("Final URL:", r.url)
print("Status:", r.status_code)

html = r.text

# sidebar links
menu_links = re.findall(r'<a[^>]*class="[^"]*menu-link[^"]*"[^>]*href="([^"]*)"', html)
print(f"\nmenu-link hrefs ({len(menu_links)}):")
for h in menu_links:
    print(f"  {h}")

submenu_links = re.findall(r'<a[^>]*class="[^"]*submenu-link[^"]*"[^>]*href="([^"]*)"', html)
print(f"\nsubmenu-link hrefs ({len(submenu_links)}):")
for h in submenu_links:
    print(f"  {h}")

submenu_triggers = re.findall(r'<div[^>]*class="[^"]*submenu-trigger[^"]*"', html)
print(f"\nsubmenu-trigger divs: {len(submenu_triggers)}")

# blossom.js version in HTML
js_ver = re.findall(r'blossom\.js\?v=([^"\']+)', html)
print(f"\nblossom.js version in served HTML: {js_ver}")

# Check for any modal-open on body
body_class = re.findall(r'<body[^>]*class="([^"]*)"', html)
print(f"body class: {body_class if body_class else 'none'}")

# Check for overlays / blocking elements
overlays = re.findall(r'class="[^"]*overlay[^"]*"', html)
print(f"overlay elements: {len(overlays)}")

# Look for any element with pointer-events:none on the sidebar
sidebar_section = html[html.find('id="sidebar"'):html.find('</nav>')]
if 'pointer-events' in sidebar_section:
    print("WARNING: pointer-events found in sidebar HTML!")
else:
    print("No inline pointer-events on sidebar")
'''
    sftp = ssh.open_sftp()
    with sftp.open("/tmp/_diag_sidebar.py", "w") as f:
        f.write(py_script)
    sftp.close()

    out, err = ssh_exec(ssh, "cd /opt/blossom/web && source venv/bin/activate && python3 /tmp/_diag_sidebar.py", timeout=30)
    print(out)
    if err.strip():
        print(f"STDERR: {err[:300]}")

    ssh_exec(ssh, "rm -f /tmp/_diag_sidebar.py")
    ssh.close()
    print("\n완료!")

if __name__ == "__main__":
    main()
