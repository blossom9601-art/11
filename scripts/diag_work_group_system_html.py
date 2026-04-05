import re

import requests


def main() -> int:
    url = 'http://127.0.0.1:8080/p/cat_business_group_system?id=13'
    html = requests.get(url, timeout=10).text

    print('url', url)
    print('has_body_class', 'page-workgroup-system' in html)

    m = re.search(r"2\.work_group_detail\.js\?v=([^\"']+)", html)
    print('js_version', m.group(1) if m else None)

    print('has_hw_row_add', 'id="hw-row-add"' in html)
    print('has_hw_download_btn', 'id="hw-download-btn"' in html)
    print('has_data_group_id', 'data-group-id' in html)

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
