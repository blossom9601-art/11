"""Utility script to create the hw_network_type table."""

from app import create_app
from app.services.hw_network_type_service import init_hw_network_type_table


def main() -> None:
    app = create_app()
    with app.app_context():
        init_hw_network_type_table(app)
        print('hw_network_type table ready')


if __name__ == '__main__':
    main()
