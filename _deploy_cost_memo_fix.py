import posixpath
from pathlib import Path
import paramiko

HOST = "192.168.56.108"
USER = "root"
PASSWORD = "123456"

FILES = [
    (
        r"c:\Users\ME\Desktop\blossom\app\templates\7.cost\7-1.opex\7-1-1.hardware\1.hardware_list.html",
        "/opt/blossom/web/app/templates/7.cost/7-1.opex/7-1-1.hardware/1.hardware_list.html",
    ),
    (
        r"c:\Users\ME\Desktop\blossom\app\templates\7.cost\7-1.opex\7-1-2.software\1.software_list.html",
        "/opt/blossom/web/app/templates/7.cost/7-1.opex/7-1-2.software/1.software_list.html",
    ),
    (
        r"c:\Users\ME\Desktop\blossom\app\templates\7.cost\7-1.opex\7-1-3.etc\1.etc_list.html",
        "/opt/blossom/web/app/templates/7.cost/7-1.opex/7-1-3.etc/1.etc_list.html",
    ),
    (
        r"c:\Users\ME\Desktop\blossom\app\templates\7.cost\7-2.capex\7-2-1.contract\1.contract_list.html",
        "/opt/blossom/web/app/templates/7.cost/7-2.capex/7-2-1.contract/1.contract_list.html",
    ),
    (
        r"c:\Users\ME\Desktop\blossom\static\css\contract.css",
        "/opt/blossom/web/static/css/contract.css",
    ),
]

CHECKS = [
    "grep -n 'contract.css?v=1.0.9' /opt/blossom/web/app/templates/7.cost/7-1.opex/7-1-1.hardware/1.hardware_list.html",
    "grep -n 'contract.css?v=1.0.9' /opt/blossom/web/app/templates/7.cost/7-1.opex/7-1-2.software/1.software_list.html",
    "grep -n 'contract.css?v=1.0.9' /opt/blossom/web/app/templates/7.cost/7-1.opex/7-1-3.etc/1.etc_list.html",
    "grep -n 'contract.css?v=1.0.9' /opt/blossom/web/app/templates/7.cost/7-2.capex/7-2-1.contract/1.contract_list.html",
    "grep -n 'form-row.memo-row' /opt/blossom/web/static/css/contract.css",
]


def main() -> None:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=10)

    sftp = ssh.open_sftp()
    for local_path, remote_path in FILES:
        if not Path(local_path).exists():
            raise FileNotFoundError(local_path)
        ssh.exec_command(f"mkdir -p {posixpath.dirname(remote_path)}")
        sftp.put(local_path, remote_path)
        print("uploaded:", remote_path)
    sftp.close()

    for cmd in ("systemctl restart blossom-web", "systemctl restart blossom-web.service"):
        _, so, _ = ssh.exec_command(cmd, timeout=30)
        code = so.channel.recv_exit_status()
        print("restart:", cmd, "=>", code)
        if code == 0:
            break

    for cmd in CHECKS:
        _, so, se = ssh.exec_command(cmd, timeout=10)
        out = so.read().decode("utf-8", "ignore").strip()
        err = se.read().decode("utf-8", "ignore").strip()
        print("check:", cmd)
        print(out if out else "(no match)")
        if err:
            print("stderr:", err)

    ssh.close()


if __name__ == "__main__":
    main()
