import posixpath
import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASSWORD = '123456'

LOCAL_PATH = r'c:\Users\ME\Desktop\blossom\app\services\page_tab_config_service.py'
REMOTE_PATH = '/opt/blossom/web/app/services/page_tab_config_service.py'


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=10)

    sftp = ssh.open_sftp()
    ssh.exec_command(f"mkdir -p {posixpath.dirname(REMOTE_PATH)}")
    sftp.put(LOCAL_PATH, REMOTE_PATH)
    sftp.close()
    print(f"uploaded: {REMOTE_PATH}")

    for cmd in ('systemctl restart blossom-web', 'systemctl restart blossom-web.service'):
        _, so, se = ssh.exec_command(cmd, timeout=30)
        code = so.channel.recv_exit_status()
        out = so.read().decode('utf-8', 'ignore').strip()
        err = se.read().decode('utf-8', 'ignore').strip()
        print(f"restart_try: {cmd} => code={code}")
        if out:
            print('stdout:', out)
        if err:
            print('stderr:', err)
        if code == 0:
            break

    probe = "cd /opt/blossom/web; if [ -x .venv/bin/python ]; then echo .venv/bin/python; elif [ -x venv/bin/python ]; then echo venv/bin/python; else echo python3; fi"
    _, so, _ = ssh.exec_command(probe, timeout=10)
    pybin = so.read().decode('utf-8', 'ignore').strip() or 'python3'
    print('python_bin:', pybin)

    verify_cmd = (
        f"cd /opt/blossom/web; {pybin} - <<'PY'\n"
        "from app import create_app\n"
        "from app.models import PageTabConfig\n"
        "app = create_app()\n"
        "with app.app_context():\n"
        "    rows = PageTabConfig.query.filter(\n"
        "        PageTabConfig.page_code.in_(['DC_RACK','DC_THERMOMETER','DC_CCTV']),\n"
        "        PageTabConfig.is_deleted==0\n"
        "    ).order_by(PageTabConfig.page_code, PageTabConfig.tab_order).all()\n"
        "    for r in rows:\n"
        "        print(f'{r.page_code}\\t{r.tab_order}\\t{r.tab_code}\\t{r.tab_name}\\t{r.route_key}\\tactive={r.is_active}')\n"
        "PY"
    )
    _, so, se = ssh.exec_command(verify_cmd, timeout=120)
    code = so.channel.recv_exit_status()
    out = so.read().decode('utf-8', 'ignore').strip()
    err = se.read().decode('utf-8', 'ignore').strip()
    print('verify_code=', code)
    print(out if out else '(no stdout)')
    if err:
        print('verify_stderr:', err)

    ssh.close()


if __name__ == '__main__':
    main()
