import os
import subprocess
import sys
from pathlib import Path


def _run(script_name: str) -> None:
    root = Path(__file__).resolve().parents[1]
    script_path = root / "scripts" / script_name
    if not script_path.exists():
        raise FileNotFoundError(str(script_path))

    cmd = [sys.executable, str(script_path)]
    print("\n=== RUN:", script_name, "===")
    subprocess.run(cmd, cwd=str(root), check=True)


def main() -> int:
    # Ensure the same env vars (BLOSSOM_BASE / BLOSSOM_EMP_NO / BLOSSOM_PASSWORD / etc.)
    # are inherited by subprocesses.
    os.environ.setdefault("BLOSSOM_BASE", "http://127.0.0.1:8080")

    _run("_smoke_check_tab71_integrity_http.py")
    _run("_smoke_check_tab74_cost_http.py")
    _run("_smoke_check_tab76_resource_http.py")
    _run("_smoke_check_tab77_communication_http.py")
    _run("_smoke_check_tab78_risk_http.py")
    _run("_smoke_check_tab79_procurement_http.py")
    _run("_smoke_check_tab80_stakeholder_http.py")

    print("\nOK: project tabs 71+74+76+77+78+79+80 (HTTP) smoke checks all passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
