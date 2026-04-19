import paramiko

s = paramiko.SSHClient()
s.set_missing_host_key_policy(paramiko.AutoAddPolicy())
s.connect('192.168.56.108', username='root', password='123456', timeout=20)

cmds = [
    ('SVG dir', 'ls -la /opt/blossom/web/static/image/svg/insight/ 2>&1'),
    ('is-view-mode CSS', 'grep -n is-view-mode /opt/blossom/web/static/css/insight.css'),
    ('ai-status HTML', 'grep -n ai-status /opt/blossom/web/app/templates/5.insight/_shared/_content_editor_modal.html'),
    ('CSS ver', 'grep insight.css /opt/blossom/web/app/templates/5.insight/5-1.insight/5-1-4.technical/1.technical_list.html'),
    ('updateAiStatus JS', 'grep -c updateAiStatus /opt/blossom/web/static/js/5.insight/5-1.insight/insight_list_common.js'),
]

for label, cmd in cmds:
    _, o, e = s.exec_command(cmd)
    out = o.read().decode().strip()
    err = e.read().decode().strip()
    print(f'=== {label} ===')
    print(out or err or '(empty)')
    print()

s.close()
