#!/usr/bin/env python3
"""인코딩 설정 확인"""
import sys
import locale

print('=== Python Encoding Info ===')
print('default encoding:', sys.getdefaultencoding())
print('filesystem encoding:', sys.getfilesystemencoding())
print('stdout encoding:', sys.stdout.encoding)
print('locale preferred:', locale.getpreferredencoding())

# Jinja2 확인
try:
    from jinja2 import Environment, FileSystemLoader
    env = Environment(loader=FileSystemLoader('.'))
    print('Jinja2 charset:', env.loader.encoding if hasattr(env.loader, 'encoding') else 'default')
except Exception as e:
    print('Jinja2 error:', e)

# Flask Jinja environment 확인
try:
    from app import create_app
    app = create_app()
    print('Flask Jinja charset:', app.jinja_env.loader.encoding if hasattr(app.jinja_env.loader, 'encoding') else 'default')
except Exception as e:
    print('Flask app error:', e)
