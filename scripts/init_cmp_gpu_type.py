"""Utility script to initialize the cmp_gpu_type SQLite table."""
import argparse
import os
import sys

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app import create_app  # pylint: disable=wrong-import-position
from app.services.cmp_gpu_type_service import (  # pylint: disable=wrong-import-position
    init_cmp_gpu_type_table,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Initialize cmp_gpu_type table')
    parser.add_argument(
        '--config',
        default='development',
        help='Flask config profile to load (default: development)'
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    app = create_app(args.config)
    with app.app_context():
        init_cmp_gpu_type_table(app)
        db_uri = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///dev_blossom.db')
        print('[cmp-gpu] table initialized via', db_uri)


if __name__ == '__main__':
    main()
