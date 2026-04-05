"""Utility script to create the hw_security_type table using sqlite3."""

from app import create_app
from app.services.hw_security_type_service import init_hw_security_type_table


def main() -> None:
    app = create_app()
    with app.app_context():
        init_hw_security_type_table(app)
        print('hw_security_type table ready')


if __name__ == '__main__':
    main()
