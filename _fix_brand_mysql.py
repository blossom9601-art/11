import paramiko

HOST = '192.168.56.107'
USER = 'root'
PASS = '123456'
REMOTE_SQL = '/tmp/brand_setting_fix.sql'

SQL = """
CREATE TABLE IF NOT EXISTS brand_setting (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(64) NOT NULL,
    `key` VARCHAR(128) NOT NULL UNIQUE,
    value TEXT,
    value_type VARCHAR(20) NOT NULL DEFAULT 'text',
    updated_by VARCHAR(64),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL,
    is_deleted INT NOT NULL DEFAULT 0,
    INDEX ix_brand_setting_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO brand_setting (category, `key`, value, value_type, is_deleted)
SELECT 'login', 'login.backgroundImage', '/static/image/login/bada.png', 'image', 0
FROM DUAL WHERE NOT EXISTS (
    SELECT 1 FROM brand_setting WHERE `key`='login.backgroundImage'
);

UPDATE brand_setting
   SET category='login', value='/static/image/login/bada.png', value_type='image', is_deleted=0
 WHERE `key`='login.backgroundImage';

SELECT category, `key`, value, is_deleted
  FROM brand_setting
 WHERE `key`='login.backgroundImage';
"""

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=20)

sftp = ssh.open_sftp()
try:
    with sftp.file(REMOTE_SQL, 'w') as fp:
        fp.write(SQL)
finally:
    sftp.close()

stdin, stdout, stderr = ssh.exec_command(f'mysql -u root lumina < {REMOTE_SQL}', timeout=120)
out = stdout.read().decode('utf-8', errors='replace').strip()
err = stderr.read().decode('utf-8', errors='replace').strip()
if out:
    print(out)
if err:
    print(err)

ssh.exec_command(f'rm -f {REMOTE_SQL}')
ssh.close()
