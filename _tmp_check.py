import re, sys
content = open("app/routes/api.py", encoding="utf-8").read()
print("Total chars:", len(content))
# find route decorators
idx = content.find("api_bp")
print("first api_bp at:", idx)
print("context:", repr(content[idx:idx+100]))
