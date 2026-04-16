"""Check JS syntax for cost page scripts"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

try:
    import esprima
except ImportError:
    print("esprima not installed, trying pip install...")
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'esprima', '-q'])
    import esprima

files = [
    'static/js/7.cost/7-1.opex/opex_contracts.js',
    'static/js/7.cost/7-2.capex/capex_contract_list.js',
    'static/js/7.cost/7-1.opex/7-1-0.dashboard/opex_dashboard.js',
    'static/js/7.cost/7-2.capex/7-2-0.dashboard/capex_dashboard.js',
]

for f in files:
    try:
        with open(f, encoding='utf-8') as fh:
            code = fh.read()
        esprima.parseScript(code, tolerant=True)
        print(f"OK: {f} ({len(code)} bytes)")
    except esprima.Error as e:
        print(f"JS SYNTAX ERROR: {f}")
        print(f"  {e}")
    except FileNotFoundError:
        print(f"FILE NOT FOUND: {f}")
    except Exception as e:
        print(f"OTHER ERROR: {f} - {e}")
