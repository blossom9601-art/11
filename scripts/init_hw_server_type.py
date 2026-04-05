"""Utility script to create the hw_server_type table using sqlite3."""

from app import create_app
from app.services.hw_server_type_service import init_hw_server_type_table


def main() -> None:
    app = create_app()
    with app.app_context():
        init_hw_server_type_table(app)
        print('hw_server_type table ready')


if __name__ == '__main__':
    main()
