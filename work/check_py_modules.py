import importlib.util

for name in ["selenium", "websocket", "websocket_client", "PIL"]:
    print(name, bool(importlib.util.find_spec(name)))
