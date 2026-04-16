"""Login 디버깅 - CSRF 토큰 확인 + 로그 확인"""
import paramiko, textwrap

HOST = "192.168.56.108"
USER = "root"
PASS = "123456"

REMOTE_SCRIPT = textwrap.dedent(r'''
import requests, urllib3, re
urllib3.disable_warnings()
s = requests.Session()
r = s.get("https://127.0.0.1/login", verify=False)
print("GET status:", r.status_code)

# Find CSRF token
m = re.search(r'name=["\']csrf_token["\'].*?value=["\']([^"\']+)', r.text)
if m:
    csrf = m.group(1)
    print("CSRF found:", csrf[:30] + "...")
else:
    m2 = re.search(r'value=["\']([^"\']+)["\'].*?name=["\']csrf_token["\']', r.text)
    if m2:
        csrf = m2.group(1)
        print("CSRF found (rev):", csrf[:30] + "...")
    else:
        csrf = ""
        print("No csrf_token field")

# Check form inputs
inputs = re.findall(r'<input[^>]*name=["\']([^"\']+)', r.text)
print("Form inputs:", inputs)

# Check hidden fields
hidden = re.findall(r'<input[^>]*type=["\']hidden["\'][^>]*', r.text)
print("Hidden fields:", hidden[:5])

# Try login
data = {"emp_no": "admin", "password": "admin1234!"}
if csrf:
    data["csrf_token"] = csrf
r2 = s.post("https://127.0.0.1/login", data=data, verify=False, allow_redirects=False)
print("POST status:", r2.status_code, "Location:", r2.headers.get("Location", ""))

if r2.status_code == 200:
    # Look for error messages
    for line in r2.text.split("\n"):
        ll = line.lower()
        if any(k in ll for k in ["error", "alert", "invalid", "fail"]) or any(k in line for k in ["실패", "잘못", "없", "오류", "불일치"]):
            clean = line.strip()[:200]
            if clean:
                print("ERR_LINE:", clean)
    # Check if there's a flash message
    flash_m = re.findall(r'class=["\'][^"\']*flash[^"\']*["\'][^>]*>([^<]+)', r2.text)
    if flash_m:
        print("FLASH:", flash_m)
    # Check for toastr / alert
    toastr = re.findall(r'toastr\.\w+\(["\']([^"\']+)', r2.text)
    if toastr:
        print("TOASTR:", toastr)
''')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS)

# Upload and run script
sftp = ssh.open_sftp()
with sftp.open("/tmp/_blossom_login_test.py", "w") as f:
    f.write(REMOTE_SCRIPT)
sftp.close()

cmd = "/opt/blossom/web/venv/bin/python3 /tmp/_blossom_login_test.py"
print(f"[*] {cmd}")
_, stdout, stderr = ssh.exec_command(cmd, timeout=15)
print(stdout.read().decode())
err = stderr.read().decode()
if err.strip():
    print("STDERR:", err[-1000:])

# Also check journal logs
print("\n=== JOURNAL LOGS ===")
_, stdout, stderr = ssh.exec_command("journalctl -u blossom-web --no-pager -n 30", timeout=10)
print(stdout.read().decode()[-3000:])

ssh.close()
