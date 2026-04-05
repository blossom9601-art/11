import os
import sys


PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


from app import create_app
from app.services.hardware_asset_service import list_hardware_assets


def main() -> int:
    app = create_app()
    app.app_context().push()

    try:
        res = list_hardware_assets(asset_category="SERVER", asset_type="ON_PREMISE", page_size=5)
        print("OK", "total=", res.get("total"), "items=", len(res.get("items") or []))
        return 0
    except Exception as exc:
        import traceback

        print("EXC_TYPE", type(exc).__name__)
        print("EXC", str(exc))
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
