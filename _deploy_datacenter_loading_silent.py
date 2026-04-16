import posixpath
import paramiko

HOST = '192.168.56.108'
USER = 'root'
PASSWORD = '123456'

PAIRS = [
    (r'c:\Users\ME\Desktop\blossom\static\js\blossom.js', '/opt/blossom/web/static/js/blossom.js'),
    (r'c:\Users\ME\Desktop\blossom\app\templates\6.datacenter\6-3.rack\6-3-1.system_lab\1.system_lab.html', '/opt/blossom/web/app/templates/6.datacenter/6-3.rack/6-3-1.system_lab/1.system_lab.html'),
    (r'c:\Users\ME\Desktop\blossom\app\templates\6.datacenter\6-3.rack\6-3-2.rack_list\1.rack_list.html', '/opt/blossom/web/app/templates/6.datacenter/6-3.rack/6-3-2.rack_list/1.rack_list.html'),
    (r'c:\Users\ME\Desktop\blossom\app\templates\6.datacenter\6-3.rack\6-3-2.rack_list\2.rack_detail.html', '/opt/blossom/web/app/templates/6.datacenter/6-3.rack/6-3-2.rack_list/2.rack_detail.html'),
    (r'c:\Users\ME\Desktop\blossom\app\templates\6.datacenter\6-4.thermometer\6-4-1.system_lab\1.system_lab.html', '/opt/blossom/web/app/templates/6.datacenter/6-4.thermometer/6-4-1.system_lab/1.system_lab.html'),
    (r'c:\Users\ME\Desktop\blossom\app\templates\6.datacenter\6-4.thermometer\6-4-2.thermometer_list\1.thermometer_list.html', '/opt/blossom/web/app/templates/6.datacenter/6-4.thermometer/6-4-2.thermometer_list/1.thermometer_list.html'),
    (r'c:\Users\ME\Desktop\blossom\app\templates\6.datacenter\6-4.thermometer\6-4-3.thermometer_log\1.thermometer_log.html', '/opt/blossom/web/app/templates/6.datacenter/6-4.thermometer/6-4-3.thermometer_log/1.thermometer_log.html'),
    (r'c:\Users\ME\Desktop\blossom\app\templates\6.datacenter\6-6.cctv\6-6-1.system_lab\1.system_lab.html', '/opt/blossom/web/app/templates/6.datacenter/6-6.cctv/6-6-1.system_lab/1.system_lab.html'),
    (r'c:\Users\ME\Desktop\blossom\app\templates\6.datacenter\6-6.cctv\6-6-2.cctv_list\1.cctv_list.html', '/opt/blossom/web/app/templates/6.datacenter/6-6.cctv/6-6-2.cctv_list/1.cctv_list.html'),
]

CHECKS = [
    "grep -n 'isDatacenterTab' /opt/blossom/web/static/js/blossom.js",
    "grep -n '20260413_dc_tab_silent' /opt/blossom/web/app/templates/6.datacenter/6-3.rack/6-3-1.system_lab/1.system_lab.html",
    "grep -n '20260413_dc_tab_silent' /opt/blossom/web/app/templates/6.datacenter/6-4.thermometer/6-4-1.system_lab/1.system_lab.html",
    "grep -n '20260413_dc_tab_silent' /opt/blossom/web/app/templates/6.datacenter/6-6.cctv/6-6-1.system_lab/1.system_lab.html",
]


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=10)

    sftp = ssh.open_sftp()
    for local_path, remote_path in PAIRS:
        ssh.exec_command(f"mkdir -p {posixpath.dirname(remote_path)}")
        sftp.put(local_path, remote_path)
        print(f"uploaded: {remote_path}")
    sftp.close()

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

    for cmd in CHECKS:
        _, so, se = ssh.exec_command(cmd, timeout=10)
        out = so.read().decode('utf-8', 'ignore').strip()
        err = se.read().decode('utf-8', 'ignore').strip()
        print('check:', cmd)
        print(out if out else '(no match)')
        if err:
            print('stderr:', err)

    ssh.close()


if __name__ == '__main__':
    main()
