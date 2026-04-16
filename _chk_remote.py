import paramiko, io

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.56.108', username='root', password='123456', timeout=5)

# 직접 서버에서 grep으로 확인
cmds = [
    # 렌더된 HTML의 input required 여부 (Jinja2 없이 파일 직접 확인)
    r"grep -c 'required' /opt/blossom/web/app/templates/5.insight/_shared/_content_editor_modal.html",
    r"grep 'add-title-input' /opt/blossom/web/app/templates/5.insight/_shared/_content_editor_modal.html",
    r"grep 'title_required' /opt/blossom/web/app/templates/5.insight/_shared/_content_editor_modal.html",
    r"grep 'modal_title_required' /opt/blossom/web/app/templates/5.insight/5-1.insight/_insight_editor_modal.html",
    r"grep 'insight.css' /opt/blossom/web/app/templates/5.insight/5-1.insight/5-1-1.trend/1.trend_list.html",
    r"grep 'insight_list_common.js' /opt/blossom/web/app/templates/5.insight/5-1.insight/5-1-1.trend/1.trend_list.html",
    r"grep -c 'normalizeTitleFieldVisual' /opt/blossom/web/static/js/5.insight/5-1.insight/insight_list_common.js",
    r"grep -c 'user-invalid' /opt/blossom/web/static/css/insight.css",
]

for cmd in cmds:
    _, so, _ = ssh.exec_command(cmd, timeout=10)
    print(f"$ {cmd}")
    print(so.read().decode('utf-8', 'ignore').strip())
    print()

ssh.close()
