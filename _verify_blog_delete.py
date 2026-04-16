#!/usr/bin/env python3
"""Verify blog delete feature on production."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456')

checks = [
    ('blog_list_version', 'grep blog_list.js /opt/blossom/web/app/templates/5.insight/5-2.blog/5-2-1.it_blog/1.blog_list.html'),
    ('blog_detail_version', 'grep blog_detail.js /opt/blossom/web/app/templates/5.insight/5-2.blog/5-2-1.it_blog/2.blog_detail.html'),
    ('blog_detail_delete_btn', 'grep -n "blog-post-delete-btn" /opt/blossom/web/app/templates/5.insight/5-2.blog/5-2-1.it_blog/2.blog_detail.html'),
    ('blog_detail_actions', 'grep -n "blog-post-actions" /opt/blossom/web/app/templates/5.insight/5-2.blog/5-2-1.it_blog/2.blog_detail.html'),
    ('blog_js_delete_fn', 'grep -n "deletePost = async" /opt/blossom/web/static/js/5.insight/5-2.blog/5-2-1.it_blog/2.blog_detail.js'),
    ('service_status', 'systemctl is-active blossom-web'),
]

for label, cmd in checks:
    _, so, se = ssh.exec_command(cmd, timeout=10)
    out = so.read().decode().strip()
    err = se.read().decode().strip()
    print(f'=== {label} ===')
    print(out or err)
    print()

ssh.close()
print('DONE')
