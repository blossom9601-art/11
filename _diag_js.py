import esprima
try:
    with open("static/js/blossom.js", encoding="utf-8") as f:
        code = f.read()
    esprima.parseScript(code, tolerant=True)
    print("JS_SYNTAX: OK")
    print(f"Lines: {len(code.splitlines())}")
except Exception as e:
    print(f"JS_SYNTAX_ERROR: {e}")
