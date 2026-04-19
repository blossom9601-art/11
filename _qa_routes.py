# -*- coding: utf-8 -*-
"""실제 등록된 API 라우트 수집"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from app import create_app
app = create_app('testing')

with app.app_context():
    api_rules = []
    for rule in app.url_map.iter_rules():
        url = str(rule)
        if '/api/' in url:
            methods = sorted(rule.methods - {'OPTIONS', 'HEAD'})
            api_rules.append((url, methods, rule.endpoint))
    
    api_rules.sort(key=lambda x: x[0])
    print(f"Total API routes: {len(api_rules)}")
    for url, methods, ep in api_rules:
        print(f"  {','.join(methods):12s} {url}")
