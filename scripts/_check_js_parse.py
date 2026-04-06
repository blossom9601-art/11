import subprocess, sys
r = subprocess.run(
    ['node', '-e',
     'try{require("esprima").parseScript(require("fs").readFileSync("static/js/_detail/tab04-interface.js","utf8"));console.log("OK")}catch(e){console.error(e.message);process.exit(1)}'],
    capture_output=True, text=True, cwd=r'c:\Users\ME\Desktop\blossom'
)
print(r.stdout.strip() or r.stderr.strip()[:500])
sys.exit(r.returncode)
