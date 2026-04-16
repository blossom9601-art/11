import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('192.168.56.107', username='root', password='123456', timeout=10)
cmd = "mysql -ulumina_web_reader -pLumina_WEB_2026! lumina -e 'SELECT id,hostname,last_seen,is_active,NOW() as db_now FROM collected_hosts' 2>/dev/null"
i, o, e = c.exec_command(cmd)
print(o.read().decode())
c.close()
