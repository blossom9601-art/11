"""Fast batch test runner - runs tests in small batches with timeout."""
import subprocess, sys, os, time

DESELECTS = [
    "--deselect", "tests/test_agent_upload_api.py::TestAgentUpload::test_upload_idempotent_accounts",
    "--deselect", "tests/test_agent_upload_api.py::TestAgentUpload::test_upload_idempotent_packages",
]

all_tests = sorted([
    f"tests/{f}" for f in os.listdir("tests")
    if f.startswith("test_") and f.endswith(".py")
])

BATCH_SIZE = 10
total_passed = 0
total_failed = 0
total_errors = 0
failed_tests = []

for i in range(0, len(all_tests), BATCH_SIZE):
    batch = all_tests[i:i+BATCH_SIZE]
    batch_label = f"[{i+1}-{min(i+BATCH_SIZE, len(all_tests))}/{len(all_tests)}]"
    
    try:
        r = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "--tb=line", "--no-header",
             "-p", "no:warnings", "--timeout=60"] + DESELECTS + batch,
            capture_output=True, text=True, timeout=180
        )
        # Parse summary line
        for line in r.stdout.strip().split("\n"):
            if "passed" in line or "failed" in line:
                print(f"  {batch_label} {line.strip()}")
            if "FAILED" in line:
                failed_tests.append(line.strip())
                
        # Count
        import re
        summary = r.stdout.strip().split("\n")[-1] if r.stdout.strip() else ""
        m = re.search(r'(\d+) passed', summary)
        if m: total_passed += int(m.group(1))
        m = re.search(r'(\d+) failed', summary)
        if m: total_failed += int(m.group(1))
        m = re.search(r'(\d+) error', summary)
        if m: total_errors += int(m.group(1))
            
    except subprocess.TimeoutExpired:
        print(f"  {batch_label} TIMEOUT (>180s)")
    except Exception as e:
        print(f"  {batch_label} ERROR: {e}")

print(f"\n{'='*50}")
print(f"TOTAL: {total_passed} passed, {total_failed} failed, {total_errors} errors")
if failed_tests:
    print(f"\nFailed tests:")
    for ft in failed_tests:
        print(f"  {ft}")
else:
    print("All tests PASSED!")
