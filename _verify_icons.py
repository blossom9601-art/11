#!/usr/bin/env python3
"""Verify blog detail icons on production."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

_, so, se = ssh.exec_command('grep -n "free-icon-pencil\\|free-icon-trash" /opt/blossom/web/app/templates/5.insight/5-2.blog/5-2-1.it_blog/2.blog_detail.html', timeout=10)
result = so.read().decode().strip()
print('=== blog detail icons ===')
print(result if result else 'No matches found')
print()

_, so, se = ssh.exec_command('grep "20260413_icons" /opt/blossom/web/app/templates/5.insight/5-2.blog/5-2-1.it_blog/2.blog_detail.html', timeout=10)
result = so.read().decode().strip()
print('=== insight.css version ===')
print(result if result else 'Not found')

ssh.close()
print('\nDONE')
