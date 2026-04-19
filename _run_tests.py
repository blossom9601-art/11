"""Quick verification: run subset of tests to confirm routing/CRUD intact."""
import subprocess, sys

# Run pytest directly, capture output, no PowerShell pipe
result = subprocess.run(
    [
        sys.executable, "-m", "pytest",
        "-q", "--tb=line", "--no-header", "-p", "no:warnings",
        "--deselect", "tests/test_agent_upload_api.py::TestAgentUpload::test_upload_idempotent_accounts",
        "--deselect", "tests/test_agent_upload_api.py::TestAgentUpload::test_upload_idempotent_packages",
    ],
    capture_output=True, text=True, timeout=600
)

# Print last 30 lines of output
lines = result.stdout.strip().split("\n")
for line in lines[-30:]:
    print(line)
print("---STDERR (last 5)---")
for line in result.stderr.strip().split("\n")[-5:]:
    print(line)
print(f"\nReturn code: {result.returncode}")
