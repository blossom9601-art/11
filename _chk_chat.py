try:
    import esprima
except ImportError:
    print("esprima not installed; trying py_mini_racer/v8...")
    raise SystemExit(0)

src = open("/opt/blossom/web/static/js/addon_application/3.chat.js").read()
try:
    esprima.parseScript(src, {"tolerant": False, "loc": True})
    print("PARSE OK", len(src), "bytes")
except Exception as e:
    print("PARSE FAIL:", e)
