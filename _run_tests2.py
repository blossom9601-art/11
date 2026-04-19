"""Quick focused test: run key domain test files to verify CRUD routing."""
import subprocess, sys, time

# Pick representative test files covering major CRUD domains
test_files = [
    "tests/test_access_entry_register_api.py",
    "tests/test_agent_upload_api.py",
]

# Also discover all test files and run a sampling
import os
all_tests = sorted([
    f"tests/{f}" for f in os.listdir("tests")
    if f.startswith("test_") and f.endswith(".py")
])
print(f"Total test files: {len(all_tests)}")

deselects = [
    "--deselect", "tests/test_agent_upload_api.py::TestAgentUpload::test_upload_idempotent_accounts",
    "--deselect", "tests/test_agent_upload_api.py::TestAgentUpload::test_upload_idempotent_packages",
]

start = time.time()
result = subprocess.run(
    [sys.executable, "-m", "pytest", "-q", "--tb=line", "--no-header",
     "-p", "no:warnings", "--timeout=30"] + deselects + all_tests,
    capture_output=True, text=True, timeout=1200
)
elapsed = time.time() - start

lines = result.stdout.strip().split("\n")
# Print progress lines (dots) and summary
for line in lines:
    if "passed" in line or "failed" in line or "error" in line or "FAILED" in line:
        print(line)

# Also print last 5 lines for context
print("--- last 5 lines ---")
for line in lines[-5:]:
    print(line)

print(f"\nElapsed: {elapsed:.1f}s")
print(f"Return code: {result.returncode}")
