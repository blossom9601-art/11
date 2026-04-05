import os
import sys

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if ROOT_DIR not in sys.path:
	sys.path.insert(0, ROOT_DIR)

import app.routes.api as api
from app import create_app

print('has list_network_dns_policies:', hasattr(api, 'list_network_dns_policies'))
print('has create_network_dns_policy:', hasattr(api, 'create_network_dns_policy'))

app = create_app()
with app.app_context():
	matches = [rule.rule for rule in app.url_map.iter_rules() if 'dns' in rule.rule]
	print('routes containing "dns":', matches)
