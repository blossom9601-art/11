import importlib.util
import os
import sys
import time
import warnings
from pathlib import Path


def _load_main(script_path: Path):
    spec = importlib.util.spec_from_file_location(script_path.stem, script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load script: {script_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    main = getattr(module, "main", None)
    if not callable(main):
        raise RuntimeError(f"No main() found in {script_path}")
    return main


def main() -> int:
    warnings.filterwarnings("ignore", category=DeprecationWarning)

    root = Path(__file__).resolve().parent.parent
    scripts_dir = Path(__file__).resolve().parent

    # Ensure repo root imports work consistently (mirrors other smoke scripts)
    sys.path.append(str(root))

    smoke78_path = scripts_dir / "_smoke_check_tab78_risk_fmea.py"
    smoke79_path = scripts_dir / "_smoke_check_tab79_procurement_tco.py"

    if not smoke78_path.exists():
        print(f"[FAIL] missing script: {smoke78_path}")
        return 1
    if not smoke79_path.exists():
        print(f"[FAIL] missing script: {smoke79_path}")
        return 1

    print("[RUN] tab78(risk/FMEA) smoke")
    rc78 = int(_load_main(smoke78_path)())
    if rc78 != 0:
        print("[FAIL] tab78 smoke failed")
        return rc78

    # Avoid dept_code/emp_no collisions (stamp is second-resolution in each script)
    time.sleep(1.2)

    print("[RUN] tab79(procurement/TCO) smoke")
    rc79 = int(_load_main(smoke79_path)())
    if rc79 != 0:
        print("[FAIL] tab79 smoke failed")
        return rc79

    print("[OK] tab78 + tab79 combined smoke passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
