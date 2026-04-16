#!/usr/bin/env python3
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

checks = [
    ('template_modals', 'grep -n "blog-edit-modal\\|insight-delete-modal" /opt/blossom/web/app/templates/5.insight/5-2.blog/5-2-1.it_blog/2.blog_detail.html'),
    ('template_js_version', 'grep -n "blog_detail.js?v=1.2.2" /opt/blossom/web/app/templates/5.insight/5-2.blog/5-2-1.it_blog/2.blog_detail.html'),
    ('js_modal_wiring', 'grep -n "openDeleteModal\\|openEditModal\\|insight-delete-confirm" /opt/blossom/web/static/js/5.insight/5-2.blog/5-2-1.it_blog/2.blog_detail.js'),
]

for name, cmd in checks:
    _, so, se = ssh.exec_command(cmd, timeout=10)
    out = so.read().decode().strip()
    err = se.read().decode().strip()
    print(f'=== {name} ===')
    print(out or err)
    print()

ssh.close()
print('DONE')
