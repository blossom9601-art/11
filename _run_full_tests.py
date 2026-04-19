"""전체 테스트를 배치로 실행하여 결과를 출력합니다."""
import subprocess, pathlib, sys, time

test_dir = pathlib.Path("tests")
test_files = sorted(test_dir.glob("test_*.py"))
python = str(pathlib.Path(".venv/Scripts/python.exe"))

total_passed = 0
total_failed = 0
total_errors = 0
failures = []

start = time.time()
for i, tf in enumerate(test_files, 1):
    try:
        r = subprocess.run(
            [python, "-m", "pytest", str(tf), "-q", "--timeout=90", "--tb=line"],
            capture_output=True, text=True, timeout=180, encoding="utf-8", errors="replace"
        )
        out = r.stdout + r.stderr
        # Parse result line like "2 passed, 1 failed in 5.23s"
        for line in out.splitlines():
            if "passed" in line or "failed" in line or "error" in line:
                import re
                p = re.search(r'(\d+) passed', line)
                f = re.search(r'(\d+) failed', line)
                e = re.search(r'(\d+) error', line)
                if p: total_passed += int(p.group(1))
                if f:
                    cnt = int(f.group(1))
                    total_failed += cnt
                    failures.append(f"{tf.name}: {cnt} failed")
                    # Show failure details
                    for fline in out.splitlines():
                        if "FAILED" in fline:
                            failures.append(f"  {fline.strip()}")
                if e:
                    cnt = int(e.group(1))
                    total_errors += cnt
                    failures.append(f"{tf.name}: {cnt} errors")
                break
        status = "OK" if r.returncode == 0 else "FAIL"
    except subprocess.TimeoutExpired:
        status = "TIMEOUT"
        failures.append(f"{tf.name}: TIMEOUT")
    
    print(f"[{i:2d}/{len(test_files)}] {status:7s} {tf.name}")

elapsed = time.time() - start
print(f"\n{'='*60}")
print(f"Total: {total_passed} passed, {total_failed} failed, {total_errors} errors")
print(f"Time: {elapsed:.1f}s")
if failures:
    print(f"\nFailures:")
    for f in failures:
        print(f"  {f}")
else:
    print("\nALL TESTS PASSED!")
